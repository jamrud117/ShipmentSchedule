"use strict";

/* ------------------------------------------------------------------
   RINGKASAN PENGAJUAN DANA — tab "Summary" di riwayat Pengajuan Dana

   Seluruh pengajuan dana dalam satu tabel:
     No | Invoice Date | Invoice/Bill Number | Company | Cost |
     Customer | Details | Due Date
   ditambah penyaring (rentang tanggal, Company, Customer, Jenis
   Pengeluaran) dan PENGELOMPOKAN ala pivot table: total nilai per
   Company, per Customer, per Jenis Pengeluaran, atau per Bulan. Baris
   kelompok bisa diklik untuk menyaring rincian ke kelompok itu.

   Menggantikan jendela "Vendor Summary" yang lama: kelompok per Company
   di sini persis ringkasan per vendor itu, dan dua tempat yang
   menghitung hal yang sama hanya menunggu saatnya berbeda hasil.

   Company = isian "Dibayarkan Kepada" (VENDOR yang menagih). Customer =
   isian Customer (yang menanggung biaya). Dua pihak berbeda -- tidak
   pernah dicampur, termasuk dalam daftar pilihan penyaringnya.

   PATOKAN TANGGAL: Tanggal Invoice. Pengajuan lama yang terbit sebelum
   isian itu ada memakai tanggal suratnya, ditandai redup di tabel --
   tanpa cadangan itu seluruh riwayat lama hilang dari ringkasan.

   Cost = frTotalPengajuan(), fungsi yang sama dengan "Terbilang" di
   surat cetaknya: ringkasan tidak pernah menjumlahkan angka yang
   berbeda dari yang tertulis di surat pengajuan itu sendiri. Mata uang
   tidak pernah dicampur -- rupiah & dolar dijumlahkan terpisah.
------------------------------------------------------------------ */

const FSUM_TAB = "__ringkasan__";
const FSUM_PER_AMBIL = 1000;

let fsumBaris = null;   // baris pengajuan dana; dimuat ulang tiap tab dibuka
let fsumPemilih = null; // pemilih rentang tanggal milik tab ini
/* Penyaring bertahan selama halaman terbuka: pindah ke tab lain lalu
   kembali tidak mengulang pilihan dari awal. Bawaannya SEMUA data,
   dikelompokkan per Company. */
/* tahun: "" = tahun BERJALAN, dibaca saat digambar -- bukan dipatok
   saat halaman dimuat, supaya halaman yang dibiarkan terbuka melewati
   tahun baru ikut berpindah ke tahun yang baru. */
const FSUM_SARINGAN_AWAL = {
  dari: "", sampai: "", company: "", customer: "", jenis: "", bayar: "", kelompok: "company",
  tahun: "",
  dasarRekap: "invoice", // tanggal yang dipakai rekap bulanan: "invoice" | "bayar"
};
const fsumSaringan = Object.assign({}, FSUM_SARINGAN_AWAL);

function fsumTanggal(row) {
  const p = (row && row.payload) || {};
  return p.invoiceDate || (row && row.doc_date) || "";
}

/* Kunci pengelompokan: huruf besar, spasi dirapatkan. "FedEx", "FEDEX"
   dan "Fedex  " adalah pihak yang sama; tanpa ini satu pihak terpecah
   jadi beberapa baris dengan total masing-masing. */
function fsumKunci(teks) {
  return String(teks || "").trim().toUpperCase().replace(/\s+/g, " ");
}

/* Satu pengajuan -> satu baris ringkasan. */
function fsumKolom(row) {
  const p = (row && row.payload) || {};
  return {
    id: row.id,
    nomorSurat: row.doc_number || "",
    tanggal: fsumTanggal(row),
    adaTglInvoice: !!p.invoiceDate,
    nomor: [p.invoiceNo, p.billingNo].map((x) => String(x || "").trim()).filter(Boolean).join(" / "),
    company: String(p.payee || "").trim(),
    customer: String(p.customer || "").trim(),
    jenis: String(p.expenseType || "").trim(),
    detail: String(p.notes || "").trim(),
    jatuhTempo: p.invoiceDueDate || "",
    lunas: !!p.paidAt,
    tglBayar: p.paidAt || "",
    mataUang: p.currency || "IDR",
    nilai: frTotalPengajuan(p),
  };
}

function fsumSaring(kolom, f) {
  return kolom.filter((k) => {
    if (f.dari && (!k.tanggal || k.tanggal < f.dari)) return false;
    if (f.sampai && (!k.tanggal || k.tanggal > f.sampai)) return false;
    if (f.company && fsumKunci(k.company) !== f.company) return false;
    if (f.customer && fsumKunci(k.customer) !== f.customer) return false;
    if (f.jenis && k.jenis !== f.jenis) return false;
    if (f.bayar === "lunas" && !k.lunas) return false;
    if (f.bayar === "belum" && k.lunas) return false;
    // Kotak cari riwayat ikut berlaku di sini, di seluruh kolom teks.
    if (f.q) {
      const isi = [k.nomorSurat, k.nomor, k.company, k.customer, k.detail, k.jenis].join(" ").toLowerCase();
      if (!isi.includes(String(f.q).toLowerCase())) return false;
    }
    return true;
  });
}

const fsumTeksJenis = (j) => (j === "Lainnya" ? tt("Lainnya", "Other") : j);
function fsumTeksBulan(kunci) {
  if (!/^\d{4}-\d{2}$/.test(kunci)) return "—";
  const [y, m] = kunci.split("-").map(Number);
  return `${bulanPanjang(m - 1)} ${y}`;
}

/* Cara mengelompokkan. `kunci` menentukan baris mana yang digabung,
   `tampil` teks yang ditulis, `saring` penyaring yang dipasang saat
   baris kelompoknya diklik. */
const FSUM_KELOMPOK = {
  company: {
    label: () => "Company",
    kunci: (k) => fsumKunci(k.company),
    tampil: (k) => k.company,
    saring: (kunci) => ({ company: kunci }),
  },
  customer: {
    label: () => "Customer",
    kunci: (k) => fsumKunci(k.customer),
    tampil: (k) => k.customer,
    saring: (kunci) => ({ customer: kunci }),
  },
  jenis: {
    label: () => tt("Jenis Pengeluaran", "Expense Type"),
    kunci: (k) => k.jenis,
    tampil: (k) => fsumTeksJenis(k.jenis),
    saring: (kunci) => ({ jenis: kunci }),
  },
  /* Lunas vs belum lunas -- pertanyaan "berapa yang masih harus
     dibayar" dijawab satu baris di sini, tanpa menjumlah manual. */
  bayar: {
    label: () => tt("Status Bayar", "Payment"),
    kunci: (k) => (k.lunas ? "lunas" : "belum"),
    tampil: (k) => (k.lunas ? tt("Lunas", "Paid") : tt("Belum Lunas", "Unpaid")),
    saring: (kunci) => ({ bayar: kunci }),
  },
  bulan: {
    label: () => tt("Bulan", "Month"),
    kunci: (k) => (k.tanggal || "").slice(0, 7),
    tampil: (k) => fsumTeksBulan((k.tanggal || "").slice(0, 7)),
    saring: (kunci) => {
      const [y, m] = kunci.split("-").map(Number);
      return { dari: drpIsoOf(y, m - 1, 1), sampai: drpIsoOf(y, m, 0) };
    },
  },
};

const fsumUrutMataUang = (daftar) =>
  [...new Set(daftar)].sort((a, b) => (a === "IDR" ? -1 : b === "IDR" ? 1 : a.localeCompare(b)));

/* Total per kelompok. Urutan: bulan menurut waktu (terbaru dulu), yang
   lain dari biaya rupiah terbesar -- pertanyaan yang dijawab pivot ini
   biasanya "ke mana uang paling banyak keluar". */
function fsumPivot(kolom, kelompok) {
  const def = FSUM_KELOMPOK[kelompok];
  const peta = new Map();
  const totalSemua = {};
  kolom.forEach((k) => {
    const kunci = def.kunci(k) || "";
    let g = peta.get(kunci);
    if (!g) {
      g = { kunci, label: def.tampil(k), jumlah: 0, total: {} };
      peta.set(kunci, g);
    }
    g.jumlah += 1;
    g.total[k.mataUang] = (g.total[k.mataUang] || 0) + k.nilai;
    totalSemua[k.mataUang] = (totalSemua[k.mataUang] || 0) + k.nilai;
  });
  const grup = [...peta.values()].sort((a, b) =>
    kelompok === "bulan"
      ? b.kunci.localeCompare(a.kunci)
      : (b.total.IDR || 0) - (a.total.IDR || 0) ||
        (b.total.USD || 0) - (a.total.USD || 0) ||
        String(a.label).localeCompare(String(b.label)),
  );
  return {
    grup,
    mataUang: fsumUrutMataUang(kolom.map((k) => k.mataUang)),
    totalSemua,
    jumlah: kolom.length,
  };
}

/* ------------------------------------------------------------------
   REKAP BULANAN — Januari s.d. Desember untuk satu tahun

   Jumlah pengajuan & total cost per bulan menurut Tanggal Invoice.
   Semua penyaring di atas berlaku KECUALI rentang tanggal: rekap ini
   sudah berbatas tahun sendiri, dan rentang "1-6 September" yang
   dipakai untuk rincian akan mengosongkan sebelas bulan lainnya.

   Pilihan tahunnya TIDAK ditulis tetap: tahun-tahun yang ada di data
   ditambah tahun berjalan. Tahun baru muncul sendiri begitu tiba (atau
   begitu ada pengajuan bertanggal tahun itu), tanpa perlu diubah.
------------------------------------------------------------------ */
const fsumTahunIni = () => String(new Date().getFullYear());
const fsumTahunDipilih = () => fsumSaringan.tahun || fsumTahunIni();

/* DASAR TANGGAL REKAP: Tanggal Invoice (bawaan), atau Tanggal Bayar --
   tanggal yang diisi saat pengajuan ditandai lunas. Dengan Tanggal
   Bayar, pengajuan yang belum lunas tidak punya tanggal, jadi tidak
   masuk bulan mana pun: rekapnya menjawab "berapa yang sudah dibayar
   tiap bulan". */
const fsumTanggalRekap = (k, dasar) => (dasar === "bayar" ? k.tglBayar : k.tanggal) || "";

/* Pilihan tahun: tahun-tahun yang ada di data (menurut dasar tanggal
   yang dipilih) + tahun berjalan + tahun yang sedang dipilih. Yang
   terakhir supaya pilihan di layar tetap cocok dengan isi tabelnya
   ketika dasar tanggal diganti ke dasar yang tidak punya tahun itu. */
function fsumDaftarTahun(kolom, dasar, terpilih) {
  const tahun = new Set([fsumTahunIni()]);
  if (terpilih) tahun.add(String(terpilih));
  kolom.forEach((k) => {
    const tgl = fsumTanggalRekap(k, dasar);
    if (/^\d{4}/.test(tgl)) tahun.add(tgl.slice(0, 4));
  });
  return [...tahun].sort((a, b) => b.localeCompare(a));
}

function fsumRekapBulanan(kolom, tahun, dasar) {
  const bulan = Array.from({ length: 12 }, (_, i) => ({ bulan: i, jumlah: 0, total: {} }));
  const totalTahun = {};
  let jumlahTahun = 0;
  const mataUang = [];
  kolom.forEach((k) => {
    const tgl = fsumTanggalRekap(k, dasar);
    if (!tgl || tgl.slice(0, 4) !== String(tahun)) return;
    const b = bulan[Number(tgl.slice(5, 7)) - 1];
    if (!b) return;
    b.jumlah += 1;
    b.total[k.mataUang] = (b.total[k.mataUang] || 0) + k.nilai;
    totalTahun[k.mataUang] = (totalTahun[k.mataUang] || 0) + k.nilai;
    jumlahTahun += 1;
    mataUang.push(k.mataUang);
  });
  // Paling tidak kolom rupiah -- tahun tanpa data tetap punya tabel.
  const kolomUang = mataUang.length ? fsumUrutMataUang(mataUang) : ["IDR"];
  return { bulan, totalTahun, jumlahTahun, mataUang: kolomUang };
}

function fsumRekapHtml(semua, saringan) {
  const tahun = fsumTahunDipilih();
  const dasarTgl = fsumSaringan.dasarRekap === "bayar" ? "bayar" : "invoice";
  // Semua penyaring berlaku, KECUALI rentang tanggal (lihat di atas).
  const dasar = fsumSaring(semua, Object.assign({}, saringan, { dari: "", sampai: "" }));
  const r = fsumRekapBulanan(dasar, tahun, dasarTgl);
  const uang = (obj, m) => (obj[m] ? fsumUang(obj[m], m) : "—");
  const opsiTahun = fsumDaftarTahun(semua, dasarTgl, tahun)
    .map((y) => `<option value="${y}" ${y === tahun ? "selected" : ""}>${y}</option>`)
    .join("");
  const opsiDasar = [["invoice", tt("Tanggal Invoice", "Invoice Date")], ["bayar", tt("Tanggal Bayar", "Paid Date")]]
    .map(([v, teks]) => `<option value="${v}" ${v === dasarTgl ? "selected" : ""}>${escapeHtml(teks)}</option>`)
    .join("");
  const catatan = dasarTgl === "bayar"
    ? tt("Jumlah invoice & total cost per bulan menurut Tanggal Bayar — hanya pengajuan yang sudah lunas. Penyaring di atas berlaku, kecuali rentang tanggal.",
         "Invoice count & total cost per month by Paid Date — paid requests only. The filters above apply, except the date range.")
    : tt("Jumlah invoice & total cost per bulan menurut Tanggal Invoice. Penyaring di atas berlaku, kecuali rentang tanggal.",
         "Invoice count & total cost per month by Invoice Date. The filters above apply, except the date range.");
  const baris = r.bulan.map((b) => `
    <tr class="${b.jumlah ? "" : "fsum-rekap-kosong"}">
      <td>${escapeHtml(bulanPanjang(b.bulan))}</td>
      <td class="fsum-angka">${b.jumlah}</td>
      ${r.mataUang.map((m) => `<td class="fsum-angka">${uang(b.total, m)}</td>`).join("")}
    </tr>`).join("");
  return `
    <section class="fsum-rekap">
      <div class="fsum-rekap-kepala">
        <div>
          <div class="fsum-judul">${escapeHtml(tt(`Rekap Bulanan Tahun ${tahun}`, `Monthly Recap ${tahun}`))}</div>
          <div class="fsum-rekap-catatan">${escapeHtml(catatan)}</div>
        </div>
        <div class="fsum-rekap-pilih">
          <label class="fsum-rekap-tahun">
            <span class="fsum-saring-label">${escapeHtml(tt("Berdasarkan", "Based on"))}</span>
            <select class="form-select form-select-sm" data-fsum="dasarRekap">${opsiDasar}</select>
          </label>
          <label class="fsum-rekap-tahun">
            <span class="fsum-saring-label">${escapeHtml(tt("Tahun", "Year"))}</span>
            <select class="form-select form-select-sm" data-fsum="tahun">${opsiTahun}</select>
          </label>
        </div>
      </div>
      <div class="fsum-wrap">
        <table class="fsum-tabel fsum-rekap-tabel">
          <thead><tr>
            <th>${escapeHtml(tt("Bulan", "Month"))}</th>
            <th class="fsum-angka">${escapeHtml(tt("Jumlah Invoice", "Invoices"))}</th>
            ${r.mataUang.map((m) => `<th class="fsum-angka">Total ${escapeHtml(m)}</th>`).join("")}
          </tr></thead>
          <tbody>${baris}</tbody>
          <tfoot><tr>
            <td>${escapeHtml(tt(`TOTAL ${tahun}`, `TOTAL ${tahun}`))}</td>
            <td class="fsum-angka">${r.jumlahTahun}</td>
            ${r.mataUang.map((m) => `<td class="fsum-angka">${uang(r.totalTahun, m)}</td>`).join("")}
          </tr></tfoot>
        </table>
      </div>
    </section>`;
}

async function fsumAmbilSemua() {
  const semua = [];
  for (let mulai = 0; mulai < 50 * FSUM_PER_AMBIL; mulai += FSUM_PER_AMBIL) {
    const { data, error } = await supabaseClient
      .from("document_numbers")
      .select("id, doc_number, doc_date, payload")
      .eq("doc_type", "fund")
      .order("doc_date", { ascending: false })
      .range(mulai, mulai + FSUM_PER_AMBIL - 1);
    if (error) throw error;
    semua.push(...(data || []));
    if (!data || data.length < FSUM_PER_AMBIL) break;
  }
  return semua;
}

/* ---------------------------- tampilan ---------------------------- */

const fsumUang = (n, m) => escapeHtml(frNilai(n, m));
const fsumTotalSel = (obj, mataUang) =>
  mataUang.length ? mataUang.map((m) => (obj[m] ? fsumUang(obj[m], m) : "—")).join("<br>") : "—";

/* Pilihan penyaring dari SELURUH data (bukan yang sudah tersaring):
   memilih satu Company tidak boleh membuat Company lain hilang dari
   daftarnya -- tidak ada jalan kembali selain Reset. */
function fsumPilihan(kolom, ambil) {
  const peta = new Map();
  kolom.forEach((k) => {
    const teks = ambil(k);
    const kunci = fsumKunci(teks);
    if (kunci && !peta.has(kunci)) peta.set(kunci, teks);
  });
  return [...peta.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function fsumPanelHtml(kolom) {
  const f = fsumSaringan;
  const opsi = (daftar, pilih) =>
    daftar.map(([nilai, teks]) =>
      `<option value="${escapeAttr(nilai)}" ${nilai === pilih ? "selected" : ""}>${escapeHtml(teks)}</option>`).join("");
  const semua = `<option value="">${escapeHtml(tt("Semua", "All"))}</option>`;
  const jenisDaftar = DOCNUM_HISTORY_FILTERS.fund.options.map((j) => [j, fsumTeksJenis(j)]);
  const kelompokDaftar = [["", tt("Tanpa kelompok", "No grouping")],
    ...Object.keys(FSUM_KELOMPOK).map((k) => [k, FSUM_KELOMPOK[k].label()])];
  return `
    <div class="fsum-panel">
      <!-- Dua baris: kalender & Reset di atas, pilihan penyaring di
           kisi di bawahnya. Kisinya menyesuaikan lebar layar sendiri
           (auto-fit), jadi tidak ada satu pilihan yang tertinggal
           sendirian di baris kedua seperti saat semuanya satu baris. -->
      <div class="fsum-saring">
        <div class="fsum-saring-atas">
          <div class="fsum-saring-item fsum-saring-item--rentang">
            <span class="fsum-saring-label">${escapeHtml(tt("Tanggal Invoice", "Invoice Date"))}</span>
            <div id="fsumRentang"></div>
          </div>
          <button type="button" class="btn-quiet fsum-reset" data-fsum-reset>
            <i class="bi bi-arrow-counterclockwise"></i> Reset
          </button>
        </div>
        <div class="fsum-saring-grid">
        <label class="fsum-saring-item">
          <span class="fsum-saring-label">Company</span>
          <select class="form-select form-select-sm" data-fsum="company">${semua}${opsi(fsumPilihan(kolom, (k) => k.company), f.company)}</select>
        </label>
        <label class="fsum-saring-item">
          <span class="fsum-saring-label">Customer</span>
          <select class="form-select form-select-sm" data-fsum="customer">${semua}${opsi(fsumPilihan(kolom, (k) => k.customer), f.customer)}</select>
        </label>
        <label class="fsum-saring-item">
          <span class="fsum-saring-label">${escapeHtml(tt("Jenis Pengeluaran", "Expense Type"))}</span>
          <select class="form-select form-select-sm" data-fsum="jenis">${semua}${opsi(jenisDaftar, f.jenis)}</select>
        </label>
        <label class="fsum-saring-item">
          <span class="fsum-saring-label">${escapeHtml(tt("Status Bayar", "Payment"))}</span>
          <select class="form-select form-select-sm" data-fsum="bayar">${semua}${opsi(
            [["lunas", tt("Lunas", "Paid")], ["belum", tt("Belum Lunas", "Unpaid")]], f.bayar)}</select>
        </label>
        <label class="fsum-saring-item fsum-saring-item--kelompok">
          <span class="fsum-saring-label">${escapeHtml(tt("Kelompokkan per", "Group by"))}</span>
          <select class="form-select form-select-sm" data-fsum="kelompok">${opsi(kelompokDaftar, f.kelompok)}</select>
        </label>
        </div>
      </div>
      <div id="fsumHasil"></div>
    </div>`;
}

function fsumPivotHtml(pivot, kelompok) {
  const def = FSUM_KELOMPOK[kelompok];
  const kolomUang = pivot.mataUang;
  const baris = pivot.grup.map((g) => `
    <tr class="fsum-pivot-baris" data-fsum-drill="${escapeAttr(g.kunci)}"
        title="${escapeAttr(tt("Klik untuk menyaring rincian ke kelompok ini", "Click to filter the details to this group"))}">
      <td>${g.label ? escapeHtml(g.label) : `<i class="fsum-kosong">${escapeHtml(tt("(tidak diisi)", "(not filled)"))}</i>`}</td>
      <td class="fsum-angka">${g.jumlah}</td>
      ${kolomUang.map((m) => `<td class="fsum-angka">${g.total[m] ? fsumUang(g.total[m], m) : "—"}</td>`).join("")}
    </tr>`).join("");
  return `
    <div class="fsum-judul">Total per ${escapeHtml(def.label())}</div>
    <div class="fsum-wrap">
      <table class="fsum-tabel fsum-pivot">
        <thead><tr>
          <th>${escapeHtml(def.label())}</th>
          <th class="fsum-angka">${escapeHtml(tt("Jml", "Count"))}</th>
          ${kolomUang.map((m) => `<th class="fsum-angka">Total ${escapeHtml(m)}</th>`).join("")}
        </tr></thead>
        <tbody>${baris}</tbody>
        <tfoot><tr>
          <td>TOTAL</td>
          <td class="fsum-angka">${pivot.jumlah}</td>
          ${kolomUang.map((m) => `<td class="fsum-angka">${pivot.totalSemua[m] ? fsumUang(pivot.totalSemua[m], m) : "—"}</td>`).join("")}
        </tr></tfoot>
      </table>
    </div>`;
}

function fsumRinciHtml(kolom, totalSemua, mataUang) {
  const urut = kolom.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "") ||
    String(b.nomorSurat).localeCompare(String(a.nomorSurat)));
  const tgl = (k) =>
    k.adaTglInvoice
      ? escapeHtml(fmtDate(k.tanggal))
      : k.tanggal
        ? `<span class="fsum-redup" title="${escapeAttr(tt("Tanggal surat — Tanggal Invoice belum diisi", "Letter date — Invoice Date not filled"))}">${escapeHtml(fmtDate(k.tanggal))}</span>`
        : "—";
  const baris = urut.map((k, i) => `
    <tr>
      <td class="fsum-angka">${i + 1}</td>
      <td class="fsum-nowrap">${tgl(k)}</td>
      <td class="fsum-nowrap fsum-mono">${escapeHtml(k.nomor || "—")}</td>
      <td class="fsum-nowrap">${escapeHtml(k.company || "—")}</td>
      <td class="fsum-angka">${fsumUang(k.nilai, k.mataUang)}</td>
      <td class="fsum-nowrap">${escapeHtml(k.customer || "—")}</td>
      <td class="fsum-detail">${escapeHtml(k.detail || "—")}</td>
      <td class="fsum-nowrap">${k.jatuhTempo ? escapeHtml(fmtDate(k.jatuhTempo)) : "—"}</td>
      <td class="fsum-nowrap">${k.lunas
        ? `<span class="dn-bayar dn-bayar--lunas">${escapeHtml(tt("Lunas", "Paid"))}<span class="dn-bayar-tgl">${escapeHtml(fmtDate(k.tglBayar))}</span></span>`
        : `<span class="dn-bayar dn-bayar--belum">${escapeHtml(tt("Belum Lunas", "Unpaid"))}</span>`}</td>
    </tr>`).join("");
  return `
    <div class="fsum-judul">${escapeHtml(tt(`Rincian · ${kolom.length} pengajuan`, `Details · ${kolom.length} request${kolom.length === 1 ? "" : "s"}`))}</div>
    <div class="fsum-wrap fsum-wrap--rinci">
      <table class="fsum-tabel fsum-rinci">
        <thead><tr>
          <th class="fsum-angka">No</th>
          <th>Invoice Date</th>
          <th>Invoice/Bill Number</th>
          <th>Company</th>
          <th class="fsum-angka">Cost</th>
          <th>Customer</th>
          <th>Details</th>
          <th>Due Date</th>
          <th>${escapeHtml(tt("Status Bayar", "Payment"))}</th>
        </tr></thead>
        <tbody>${baris}</tbody>
        <tfoot><tr>
          <td colspan="4">TOTAL</td>
          <td class="fsum-angka">${fsumTotalSel(totalSemua, mataUang)}</td>
          <td colspan="4"></td>
        </tr></tfoot>
      </table>
    </div>`;
}

function fsumGambarHasil() {
  const box = $("#fsumHasil");
  if (!box || !fsumBaris) return;
  const semua = fsumBaris.map(fsumKolom);
  const saringan = Object.assign({}, fsumSaringan, { q: typeof docNumCari === "string" ? docNumCari : "" });
  const tersaring = fsumSaring(semua, saringan);
  let html;
  if (!tersaring.length) {
    html = `<div class="panel-empty"><i class="bi bi-inbox"></i> ${escapeHtml(
      tt("Tidak ada pengajuan dana yang cocok dengan penyaring ini.", "No fund requests match these filters."),
    )}</div>`;
  } else {
    const mataUang = fsumUrutMataUang(tersaring.map((k) => k.mataUang));
    const totalSemua = {};
    tersaring.forEach((k) => { totalSemua[k.mataUang] = (totalSemua[k.mataUang] || 0) + k.nilai; });
    html =
      (fsumSaringan.kelompok ? fsumPivotHtml(fsumPivot(tersaring, fsumSaringan.kelompok), fsumSaringan.kelompok) : "") +
      fsumRinciHtml(tersaring, totalSemua, mataUang);
  }
  /* Rekap bulanan SELALU tampil, juga saat rentang tanggal di atas tidak
     memuat apa pun -- ia tidak memakai rentang itu. */
  box.innerHTML = html + fsumRekapHtml(semua, saringan);
}

/* Dipanggil renderDocNumHistory() saat tab Summary aktif. Datanya
   dimuat ulang tiap tab ini digambar -- pengajuan yang baru terbit
   harus langsung terhitung. Mengganti penyaring TIDAK memuat ulang:
   cukup menghitung ulang dari yang sudah ada. */
async function renderRingkasanDana(box, bar) {
  if (bar) bar.innerHTML = "";
  box.innerHTML = `<div class="docnum-empty">${escapeHtml(tt("Memuat…", "Loading…"))}</div>`;
  try {
    fsumBaris = await fsumAmbilSemua();
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="docnum-empty">${escapeHtml(tt("Ringkasan gagal dimuat. Coba lagi.", "The summary failed to load. Please try again."))}</div>`;
    return;
  }
  fsumGambarPanel(box);
}

/* Satu pendengar untuk seluruh panel -- isinya digambar ulang terus,
   jadi pendengar per elemen akan hilang bersama elemennya. */
document.addEventListener("change", (e) => {
  const el = e.target.closest && e.target.closest("[data-fsum]");
  if (!el) return;
  fsumSaringan[el.dataset.fsum] = el.value;
  fsumGambarHasil();
});
document.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest("[data-fsum-reset]")) {
    Object.assign(fsumSaringan, FSUM_SARINGAN_AWAL);
    const box = $("#docNumHistory");
    if (box && fsumBaris) fsumGambarPanel(box);
    return;
  }
  const baris = e.target.closest && e.target.closest("[data-fsum-drill]");
  if (!baris || !fsumSaringan.kelompok) return;
  Object.assign(fsumSaringan, FSUM_KELOMPOK[fsumSaringan.kelompok].saring(baris.dataset.fsumDrill));
  const box = $("#docNumHistory");
  if (box && fsumBaris) fsumGambarPanel(box);
});

/* Menggambar panel (penyaring + hasil) dari data yang SUDAH dimuat.
   Dipakai saat tab dibuka, saat Reset, dan saat baris kelompok diklik
   -- dua yang terakhir mengubah penyaring, jadi pilihannya di layar
   harus ikut digambar ulang, bukan cuma hasilnya. */
function fsumGambarPanel(box) {
  if (fsumPemilih) fsumPemilih.lepas();
  box.innerHTML = fsumPanelHtml(fsumBaris.map(fsumKolom));
  fsumPemilih = buatRentangTanggal($("#fsumRentang"), {
    pintas: [
      { label: () => t("u.minggu.ini"), rentang: RENTANG_PINTAS.mingguIni },
      { label: () => t("u.bulan.ini"), rentang: RENTANG_PINTAS.bulanIni },
      { label: () => t("u.bulan.lalu"), rentang: RENTANG_PINTAS.bulanLalu },
      { label: () => t("u.tahun.ini"), rentang: RENTANG_PINTAS.tahunIni },
    ],
    awal: [fsumSaringan.dari, fsumSaringan.sampai],
    onApply: (a, b) => {
      fsumSaringan.dari = a;
      fsumSaringan.sampai = b;
      fsumGambarHasil();
    },
  });
  fsumGambarHasil();
}

/* Daftar saran untuk isian Customer: customer yang pernah diisi di
   pengajuan dana + pihak di jadwal Export (pembeli). SENGAJA tidak
   memuat nama vendor -- saran yang mencampur keduanya mengundang
   isian Customer diisi nama vendor. */
function isiSaranCustomerDana() {
  const dl = $("#dnFundCustomerList");
  if (!dl) return;
  const nama = new Set();
  (typeof docNumHistoryRows !== "undefined" ? docNumHistoryRows : [])
    .forEach((r) => {
      const c = r && r.payload && String(r.payload.customer || "").trim();
      if (r && r.doc_type === "fund" && c) nama.add(c);
    });
  ((typeof data !== "undefined" && data.export) || []).forEach((s) => {
    const c = String((s && s.party) || "").trim();
    if (c) nama.add(c);
  });
  dl.innerHTML = [...nama]
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${escapeAttr(n)}"></option>`)
    .join("");
}


document.addEventListener("focusin", (e) => {
  if (e.target && e.target.matches && e.target.matches('[data-docnum-panel="fund"] [data-dn="customer"]')) {
    isiSaranCustomerDana();
  }
});
