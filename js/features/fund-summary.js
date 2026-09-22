"use strict";

/* ------------------------------------------------------------------
   RINGKASAN BIAYA PER VENDOR — Pengajuan Dana

   Menjumlahkan seluruh pengajuan dana dalam satu rentang tanggal,
   dikelompokkan per VENDOR -- pihak yang ditagih pembayarannya
   (isian "Dibayarkan Kepada"). Customer ditampilkan sebagai rincian di
   bawah tiap vendor, BUKAN sebagai pengelompokan: dua pihak itu
   berbeda -- vendor menagih, customer menanggung biayanya -- dan satu
   tagihan FedEx bisa saja untuk kiriman beberapa customer.

   PATOKAN TANGGAL: Tanggal Invoice. Tanggal surat pengajuan bisa
   terbit berminggu-minggu sesudah tagihannya datang, jadi menyaring
   menurut tanggal surat menaruh biaya Agustus di bulan September.
   Pengajuan lama yang terbit sebelum isian Tanggal Invoice ada jatuh
   ke tanggal suratnya -- tanpa cadangan itu, seluruh riwayat lama
   hilang dari ringkasan.

   Jumlah tiap pengajuan diambil dari frTotalPengajuan(), fungsi yang
   sama dengan yang menulis "Terbilang" di surat cetaknya -- ringkasan
   tidak pernah menjumlahkan angka yang berbeda dari yang tertulis di
   surat pengajuannya sendiri.
------------------------------------------------------------------ */

const FSUM_PER_AMBIL = 1000;

let fsumBaris = null;   // baris pengajuan dana, dimuat sekali tiap jendela dibuka
let fsumPemilih = null; // instans buatRentangTanggal(), dibuat sekali

function fsumTanggal(row) {
  const p = (row && row.payload) || {};
  return p.invoiceDate || (row && row.doc_date) || "";
}

/* Nama vendor sebagai KUNCI pengelompokan: huruf besar, spasi dirapatkan.
   "FedEx", "FEDEX" dan "Fedex  " adalah vendor yang sama; tanpa ini
   satu vendor terpecah jadi tiga baris dengan total masing-masing. */
function fsumKunciVendor(nama) {
  return String(nama || "").trim().toUpperCase().replace(/\s+/g, " ");
}

/* Menjumlahkan baris dalam rentang [dari, sampai] (termasuk kedua ujungnya).
   Rentang kosong = semua. Mata uang TIDAK pernah dicampur: rupiah dan
   dolar dijumlahkan terpisah per vendor. */
function fsumHitung(rows, dari, sampai) {
  const kelompok = new Map();
  let jumlahPengajuan = 0;

  (rows || []).forEach((row) => {
    const tgl = fsumTanggal(row);
    if (dari && (!tgl || tgl < dari)) return;
    if (sampai && (!tgl || tgl > sampai)) return;

    const p = row.payload || {};
    const vendor = String(p.payee || "").trim();
    const kunci = fsumKunciVendor(vendor) || "\u0000"; // tanpa vendor -> satu kelompok sendiri
    const mataUang = p.currency || "IDR";
    const nilai = frTotalPengajuan(p);

    let g = kelompok.get(kunci);
    if (!g) {
      g = { vendor, jumlah: 0, total: {}, customer: new Map() };
      kelompok.set(kunci, g);
    }
    g.jumlah += 1;
    g.total[mataUang] = (g.total[mataUang] || 0) + nilai;

    const customer = String(p.customer || "").trim();
    if (customer) {
      const c = g.customer.get(customer) || {};
      c[mataUang] = (c[mataUang] || 0) + nilai;
      g.customer.set(customer, c);
    }
    jumlahPengajuan += 1;
  });

  /* Urut dari biaya rupiah terbesar -- pertanyaan yang dijawab
     ringkasan ini biasanya "ke siapa uang paling banyak keluar". */
  const daftar = [...kelompok.values()].sort(
    (a, b) =>
      (b.total.IDR || 0) - (a.total.IDR || 0) ||
      (b.total.USD || 0) - (a.total.USD || 0) ||
      a.vendor.localeCompare(b.vendor),
  );

  // IDR selalu di kolom pertama; mata uang lain menyusul menurut abjad.
  const mataUang = [...new Set(daftar.flatMap((g) => Object.keys(g.total)))].sort(
    (a, b) => (a === "IDR" ? -1 : b === "IDR" ? 1 : a.localeCompare(b)),
  );

  const totalSemua = {};
  daftar.forEach((g) =>
    Object.entries(g.total).forEach(([m, v]) => {
      totalSemua[m] = (totalSemua[m] || 0) + v;
    }),
  );

  return { daftar, mataUang, totalSemua, jumlahPengajuan };
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

function fsumRenderHtml(hasil) {
  if (!hasil.jumlahPengajuan) {
    return `<div class="panel-empty"><i class="bi bi-inbox"></i> ${escapeHtml(
      t("u.tidak.ada.pengajuan.dana.pada.rentang.ini"),
    )}</div>`;
  }
  const kolomUang = hasil.mataUang;
  const nilai = (obj, m) => (obj[m] ? escapeHtml(frNilai(obj[m], m)) : "—");

  const baris = hasil.daftar
    .map((g) => {
      const rincian = [...g.customer.entries()]
        .map(([nama, tot]) =>
          `${escapeHtml(nama)} <span class="fsum-cust-nilai">${kolomUang
            .filter((m) => tot[m])
            .map((m) => escapeHtml(frNilai(tot[m], m)))
            .join(" · ")}</span>`,
        )
        .join("<br>");
      return `<tr>
        <td>
          <div class="fsum-vendor">${g.vendor ? escapeHtml(g.vendor) : `<i>${escapeHtml(t("u.tanpa.vendor"))}</i>`}</div>
          ${rincian ? `<div class="fsum-cust">${rincian}</div>` : ""}
        </td>
        <td class="fsum-angka">${g.jumlah}</td>
        ${kolomUang.map((m) => `<td class="fsum-angka">${nilai(g.total, m)}</td>`).join("")}
      </tr>`;
    })
    .join("");

  return `
    <div class="fsum-wrap">
      <table class="fsum-tabel">
        <thead><tr>
          <th>Vendor</th>
          <th class="fsum-angka">${escapeHtml(t("u.jml.pengajuan"))}</th>
          ${kolomUang.map((m) => `<th class="fsum-angka">Total ${escapeHtml(m)}</th>`).join("")}
        </tr></thead>
        <tbody>${baris}</tbody>
        <tfoot><tr>
          <td>TOTAL</td>
          <td class="fsum-angka">${hasil.jumlahPengajuan}</td>
          ${kolomUang.map((m) => `<td class="fsum-angka">${nilai(hasil.totalSemua, m)}</td>`).join("")}
        </tr></tfoot>
      </table>
    </div>`;
}

function fsumGambar() {
  const box = $("#fundSummaryBody");
  if (!box || !fsumBaris || !fsumPemilih) return;
  const [dari, sampai] = fsumPemilih.ambil();
  box.innerHTML = fsumRenderHtml(fsumHitung(fsumBaris, dari, sampai));
}

async function bukaRingkasanVendor() {
  const modalEl = $("#fundSummaryModal");
  if (!modalEl) return;

  if (!fsumPemilih) {
    const L = (kunci) => t(kunci);
    fsumPemilih = buatRentangTanggal($("#fundSummaryRange"), {
      pintas: [
        { label: L("u.minggu.ini"), rentang: RENTANG_PINTAS.mingguIni },
        { label: L("u.bulan.ini"), rentang: RENTANG_PINTAS.bulanIni },
        { label: L("u.bulan.lalu"), rentang: RENTANG_PINTAS.bulanLalu },
        { label: L("u.tahun.ini"), rentang: RENTANG_PINTAS.tahunIni },
      ],
      // Dibuka pertama kali: bulan berjalan -- pertanyaan yang paling sering.
      awal: RENTANG_PINTAS.bulanIni(),
      onApply: fsumGambar,
    });
  }

  $("#fundSummaryBody").innerHTML = `<div class="panel-empty"><i class="bi bi-hourglass"></i> ${escapeHtml(
    t("hscode.loading"),
  )}</div>`;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();

  /* Dimuat ulang tiap jendela dibuka, bukan sekali seumur halaman:
     pengajuan yang baru terbit di tab ini (atau di tab sebelah) harus
     langsung ikut terhitung. Berganti rentang TIDAK memuat ulang --
     cukup menghitung ulang dari yang sudah ada. */
  try {
    fsumBaris = await fsumAmbilSemua();
  } catch (e) {
    console.error(e);
    $("#fundSummaryBody").innerHTML = `<div class="panel-empty"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(
      t("u.ringkasan.gagal.dimuat"),
    )}</div>`;
    return;
  }
  fsumGambar();
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

const btnFundSummaryEl = document.getElementById("btnFundSummary");
if (btnFundSummaryEl) btnFundSummaryEl.addEventListener("click", bukaRingkasanVendor);

document.addEventListener("focusin", (e) => {
  if (e.target && e.target.matches && e.target.matches('[data-docnum-panel="fund"] [data-dn="customer"]')) {
    isiSaranCustomerDana();
  }
});
