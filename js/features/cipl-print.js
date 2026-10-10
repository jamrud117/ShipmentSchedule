"use strict";

/* CETAK COMMERCIAL INVOICE & PACKING LIST

   Satu tombol, DUA halaman. Keduanya memakai kop, blok pihak, dan blok
   pengangkutan yang sama persis — yang berbeda hanya judul dan kolom
   tabelnya. Karena itu bagian yang sama dibangun sekali lalu dipakai
   dua kali; menyalinnya akan membuat keduanya berbeda cepat atau
   lambat, dan perbedaan pada dokumen ekspor bukan hal sepele.

   Datanya dari DUA tempat:
     - pengajuan nomor (document_numbers) -> nomor & tanggal invoice,
       consignee, PO, terms, pelabuhan, carrier, remarks
     - jadwal yang ditautkan (shipments)  -> daftar barang, berat,
       dimensi, nilai

   JUDULNYA mengikuti jenis invoice yang dipilih saat menerbitkan nomor:
   "COMMERCIAL INVOICE" atau "NON - COMMERCIAL INVOICE".
*/

const CIPL_PERUSAHAAN = {
  nama: "PT. DYNAMIC DESIGN INDONESIA",
  pusat:
    "Pusat : Jl. Mayjend Sutoyo No. 1 Pabedilan Kulon, Pabedilan, Kabupaten Cirebon, Jawa Barat - Indonesia 45193",
  cabang:
    "Cabang: JL. BKR No.27 Pasirluyu, Regol 40254 Kota Bandung 022-30507575",
};

/* Shipper selalu PT Dynamic Design Indonesia — dokumen ini hanya
   dipakai untuk kiriman KELUAR. Ditulis di sini, bukan diisi pengguna:
   satu kolom yang isinya selalu sama hanya menambah peluang salah
   ketik pada dokumen yang dibaca bea cukai negara lain. */
/* Nama badan usaha KAPITAL -- sama dengan nama consignee & baris tanda
   tangan; alamat dengan Huruf Awal Kapital, yang lebih mudah dibaca dan
   lazim pada alamat di dokumen formal. */
const CIPL_SHIPPER = [
  "PT DYNAMIC DESIGN INDONESIA",
  "Jalan Mayjend Sutoyo No. 1, Desa Pabedilan Kulon,",
  "Kec. Pabedilan, Kab. Cirebon, Jawa Barat 45193",
  "ATTN : jjh2296@dynamicdesign.co.kr",
  "TEL : +622318886161",
  "TAX ID : 0656 3197 7906 1000",
];

/* ------------------------------------------------------------------
   ALAMAT BUYER YANG SUDAH DIKENAL

   Diisikan otomatis begitu nama buyer-nya cocok, supaya alamat yang
   sama tidak diketik ulang tiap menerbitkan invoice — dan tidak
   berbeda-beda tiap kali diketik ulang.

   Dicocokkan dengan `includes` pada teks yang sudah dinormalkan
   (tanda baca dibuang), jadi "DYNAMIC DESIGN CO., LTD." dan
   "Dynamic Design Co Ltd" sama-sama ketemu.

   Menambah buyer baru cukup satu entri di sini.
------------------------------------------------------------------ */
function ciplNormalNama(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/* ------------------------------------------------------------------
   PROFIL PELANGGAN

   Tiap pembeli punya bentuk CIPL sendiri: susunan kotaknya berbeda,
   pelabuhan bawaannya berbeda, dan sebagian isian yang wajib di satu
   pembeli tidak ada sama sekali di pembeli lain.

   Dikumpulkan di SATU tabel, bukan disebar sebagai percabangan di
   dalam kode cetak. Menambah pembeli baru berarti menambah satu entri
   di sini -- bukan menyisipkan `if` di belasan tempat yang harus
   ditemukan satu per satu.

   `layout` menunjuk templat mana yang dipakai. Pembeli yang bentuk
   suratnya sama cukup berbagi nilai yang sama.
------------------------------------------------------------------ */
const CIPL_PROFIL = [
  {
    id: "kumho-vn",
    match: ["KUMHO TIRE VIETNAM", "KUMHO TIRE"],
    layout: "vn",
    /* Bentuk nomor invoice khusus pembeli ini. {SEQ} tetap mengambil
       urutan yang sama dengan invoice lain -- lihat docNumTemplate(). */
    invoicePattern: "DDI - CRBM - {MM} - {SEQ} - {YYYYMMDD}",
    portLoading: "JAKARTA",
    portDischarge: "HOCHIMINH, VIETNAM",
    finalDestination: "HOCHIMINH CITY, VIETNAM",
    lines: [
      "LOT D-3-CN, MY PHUOC 3 INDUSTRIAL PARK",
      "THOI HOA WARD, HO CHI MINH CITY, VIETNAM.",
      "ATTN   : Nguyen Thi Hiep, Dang Thi Ninh",
      "T E L      : +84 274 3599 000 , TAX ID : 3700747000",
      "E-MAIL : thihiep@kumhotire.com , dangninh@kumhotire.com",
      "Fax : +84-274-357-6939",
    ],
  },
  {
    id: "ddi-kr",
    match: ["DYNAMIC DESIGN CO", "DYNAMIC DESIGN COLTD"],
    layout: "kr",
    portLoading: "Jakarta, Indonesia",
    portDischarge: "BUSAN, KOREA",
    finalDestination: "BUSAN, KOREA",
    lines: [
      "12, Cheomdanyeonsin-ro 29 beon-gil Buk-gu Gwangju, 61089",
      "Republic of Korea",
      "TEL : 82-62-720-7894   FAX : 82-62-443-0993",
    ],
  },
];

/* Profil yang dipakai untuk satu pengajuan. Dicocokkan ke nama
   consignee; kalau tidak ada yang cocok, dipakai profil pertama yang
   layout-nya "kr" -- bentuk yang sudah dipakai selama ini. */
function ciplProfil(nama) {
  const key = ciplNormalNama(nama);
  const hit = key
    ? CIPL_PROFIL.find((b) =>
        (b.match || []).some((m) => key.includes(ciplNormalNama(m))),
      )
    : null;
  return hit || CIPL_PROFIL.find((b) => b.layout === "kr") || CIPL_PROFIL[0];
}

/* Dipertahankan: dipakai di beberapa tempat untuk alamat saja. */
const CIPL_ALAMAT_BUYER = CIPL_PROFIL;

function ciplAlamatBuyer(nama) {
  const key = ciplNormalNama(nama);
  if (!key) return "";
  const hit = CIPL_ALAMAT_BUYER.find((b) =>
    (b.match || []).some((m) => key.includes(ciplNormalNama(m))),
  );
  return hit ? hit.lines.join("\n") : "";
}

/* ------------------------------------------------------------------
   PENGAMBILAN DATA
------------------------------------------------------------------ */

function ciplCariShipment(id) {
  if (!id) return null;
  return (
    (data.export || []).find((x) => x.id === id) ||
    (data.import || []).find((x) => x.id === id) ||
    null
  );
}

/* CIPL hanya untuk kiriman EXPORT. Yang belum ditautkan tetap boleh
   dicetak — kotak barangnya saja yang kosong, dan itu keadaan yang sah
   saat nomornya diterbitkan lebih dulu daripada jadwalnya. */
function ciplBolehCetak(row) {
  const id = ((row && row.payload) || {}).shipmentId;
  if (!id) return true;
  const s = ciplCariShipment(id);
  return !s || s.mode === "export";
}

/* Judul halaman pertama. Bentuk nomornya sendiri sudah membedakan
   keduanya, tapi yang dibaca orang adalah judulnya — jadi yang
   menentukan tetap pilihan jenis invoice saat nomor diterbitkan. */
function ciplJudulInvoice(row) {
  const jenis = ((row && row.payload) || {}).invoiceKind || "";
  return /non/i.test(jenis) ? "NON - COMMERCIAL INVOICE" : "COMMERCIAL INVOICE";
}

/* Nama barang di aplikasi ditulis "TYRE MOLD FULL SET - NOKIAN ENTRUST
   235/45R19", sementara berkas CIPL memisahkannya jadi kolom Item dan
   kolom Type. Dipecah pada tanda hubung PERTAMA yang diapit spasi;
   tanpa pemisah, seluruhnya masuk kolom Item dan kolom Type dibiarkan
   kosong — bukan ditebak. */
/* NAMA BARANG BAKU yang menempati kolom Item.

   Sebagian nama memakai tanda hubung sebagai pemisah — "TYRE MOLD FULL
   SET - NOKIAN ENTRUST 235/45R19" — dan itu sudah cukup jelas. Tapi
   sebagian lain menuliskannya menyambung tanpa pemisah apa pun:

     TYRE MOLD FULL SET CREDO SUNMODE SUV 215/65R16
     └──── jenis barang ────┘└──── keterangan ────┘

   Tanpa daftar ini tidak ada cara menebak di mana batasnya: "FULL SET"
   dan "CREDO SUNMODE" sama-sama huruf besar, sama-sama beberapa kata.
   Yang tahu batasnya cuma orang yang tahu katalog barangnya.

   Menambah jenis barang baru cukup satu baris di sini. Yang tidak
   terdaftar TIDAK dipecah — seluruhnya masuk kolom Item dan kolom Type
   dibiarkan kosong, bukan ditebak. */
const CIPL_JENIS_BARANG = [
  "TYRE MOLD FULL SET",
  "TYRE MOLD SIDE ONLY",
  "TYRE MOLD TREAD ONLY",
];

function ciplPecahNama(nama) {
  const s = String(nama || "").trim();

  /* Tanda hubung didahulukan: kalau penulisnya sudah memisahkan
     sendiri, itu batas yang paling bisa dipercaya. */
  const i = s.indexOf(" - ");
  if (i >= 0) {
    return { item: s.slice(0, i).trim(), type: s.slice(i + 3).trim() };
  }

  /* Jenis TERPANJANG dulu, supaya "TYRE MOLD FULL SET" tidak kalah
     oleh entri lain yang kebetulan jadi awalannya. */
  const urut = CIPL_JENIS_BARANG.slice().sort((a, b) => b.length - a.length);
  const atas = s.toUpperCase();
  const cocok = urut.find((j) => atas.startsWith(j.toUpperCase()));
  if (cocok) {
    return {
      item: s.slice(0, cocok.length).trim(),
      type: s.slice(cocok.length).trim(),
    };
  }

  return { item: s, type: "" };
}

/* "81*81*81" -> "81 CM x 81 CM x 81 CM", mengikuti tulisan di berkas
   aslinya. Yang tidak berbentuk dimensi ditulis apa adanya. */
function ciplDimensiTeks(paket) {
  const d = parsePackageDims(paket);
  if (!d) return String(paket || "").trim();
  return `${d.p} CM x ${d.l} CM x ${d.t} CM`;
}

function ciplCbmMentah(it) {
  const d = parsePackageDims(it.package);
  if (!d) return 0;
  const m = String(it.packing || "").match(/[\d.,]+/);
  const koli = m ? parseLooseNumber(m[0]) : 0;
  const jumlah = koli > 0 ? koli : parseLooseNumber(it.qty);
  return ((d.p * d.l * d.t) / 1000000) * jumlah;
}

function ciplBarisBarang(shipment) {
  const items = (shipment && shipment.items) || [];
  return items
    .filter((it) => String(it.namaBarang || "").trim())
    .map((it) => {
      /* NAMA BARANG = Uraian + Pattern + Size + Mold No, aturan yang sama
         dengan CIPL Kumho (itemDisplayName, core/helpers.js). Lembar ini
         punya dua kolom: Item = Uraian, Type = sisanya (Pattern, Size,
         Mold No) -- dibaca dari kiri ke kanan hasilnya urutan yang sama.
         Dulu Type cuma Size, sehingga Pattern & Mold No tidak tercetak.

         ciplPecahNama() (menebak dari " - " atau CIPL_JENIS_BARANG)
         tinggal cadangan untuk barang lama yang ketiga kolomnya kosong
         -- semuanya masih digabung di Uraian. */
      const rincian = rincianNamaBarang(it);
      const n = rincian.length
        ? { item: rapiBagianNama(it.namaBarang), type: rincian.join(" ") }
        : ciplPecahNama(rapiBagianNama(it.namaBarang));
      const qty = parseLooseNumber(it.qty);
      const harga = parseLooseNumber(it.harga);
      return {
        item: n.item,
        type: n.type,
        hs: String(it.hsCode || "").trim(),
        qty: qty,
        satuan: String(it.satuan || "").trim().toUpperCase(),
        harga: harga,
        amount: qty * harga,
        netto: parseLooseNumber(it.netto),
        bruto: parseLooseNumber(it.bruto),
        dimensi: ciplDimensiTeks(it.package),
        cbm: computeItemCbm(it),
        /* CBM tanpa pembulatan, khusus untuk menjumlah total.

           Menjumlahkan angka yang SUDAH dibulatkan menggeser totalnya:
           0,531441 + 1,594323 = 2,126 kalau dijumlah dulu, tapi 2,125
           kalau masing-masing dibulatkan lebih dulu. Berkas aslinya
           menulis 2,126, dan selisih satu angka di belakang koma pada
           dokumen ekspor bukan hal yang bisa diabaikan. */
        cbmRaw: ciplCbmMentah(it),
      };
    });
}

/* Jumlah koli seluruh kiriman, untuk tulisan "4 Package" di Packing
   List. Diambil dari kolom `packing` per barang — di buku Export kolom
   `package` berisi DIMENSI, bukan jumlah. */
function ciplTotalKoli(shipment) {
  const items = (shipment && shipment.items) || [];
  let n = 0;
  items.forEach((it) => {
    const m = String(it.packing || "").match(/[\d.,]+/);
    if (m) n += parseLooseNumber(m[0]);
  });
  return n;
}

/* Angka bulat ditulis TANPA desimal; hanya yang pecahan yang diberi
   angka di belakang koma.

   "10,490.00" pada dokumen ekspor terbaca seperti hasil hitungan
   mesin, sementara berkas aslinya menulis "10,490". Yang pecahan tetap
   perlu desimalnya — harga satuan 0,44 tidak boleh dibulatkan jadi 0.

   `maks` = jumlah desimal untuk nilai pecahan. Bawaannya 2 (uang);
   CBM memakai 3 karena selisih angka ketiganya masih bermakna.

   Perbandingan dengan toleransi, bukan `n % 1 === 0`: hasil perkalian
   pecahan kerap menyisakan sisa mikroskopis (0,531441 x 4 tidak persis
   2,125764 dalam biner), dan tanpa toleransi angka yang sebenarnya
   bulat akan tampil dengan desimal nol. */
function ciplAngka(n, maks) {
  if (!isFinite(n)) return "";
  const d = maks == null ? 2 : maks;
  const bulat = Math.abs(n - Math.round(n)) < 1e-9;
  const pakai = bulat ? 0 : d;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: pakai,
    maximumFractionDigits: pakai,
  });
}

// "3 Aug 2026" — bentuk tanggal yang dipakai berkas aslinya.
function ciplTanggal(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const bln = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

function ciplBarisTeks(teks) {
  return String(teks || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* ==================================================================
   COMMERCIAL INVOICE & PACKING LIST — DYNAMIC DESIGN (desain formal)

   Disusun seperti dokumen ekspor profesional, dibaca dari atas:
     judul + nomor/tanggal dokumen (kanan atas)
     tiga kartu pihak: Shipper/Exporter, Consignee/Buyer, Notify Party
     delapan rincian pengiriman (pelabuhan, kapal, syarat, asal barang)
     tabel barang -- kepala gelap, baris bergaris tipis, angka rata kanan
     ruang kosong yang mendorong bagian akhir ke dasar halaman
     kiri: terbilang & pernyataan (CI) / rincian kemasan (PL)
     kanan: kotak total
     tanda tangan 50 mm (muat stempel)
   Mata uang SELALU di kiri angkanya: "USD 4,500".
================================================================== */
const CIPL_ASAL_BARANG = "INDONESIA";

function ciplDdKepala(judul) {
  return `<header class="dd-kepala"><div class="dd-judul">${escapeHtml(judul)}</div></header>`;
}

/* NOMOR + TANGGAL satu baris: nomor di kiri, tanggalnya menempel ke
   kanan kotak ("DD-260928-DDI-01_R1 ........ 28 SEP 2026"), tanpa tanda
   kurung. Tiap PO punya tanggalnya sendiri (po-list.js), satu PO per baris. */
const ciplNoTanggal = (no, tanggal) => ({ no, tgl: ciplTanggal(tanggal || "").toUpperCase() });
function ciplPoPasangan(p) {
  const no = [p.poNo].concat(p.poNoExtra || []);
  const tanggal = [p.poDate].concat(p.poDateExtra || []);
  return no
    .map((x, i) => ({ no: String(x || "").trim(), tgl: tanggal[i] }))
    .filter((x) => x.no)
    .map((x) => ciplNoTanggal(x.no, x.tgl));
}

/* Referensi dokumen: label di atas, isinya di bawah -- nomor PO yang
   banyak tetap rapi, satu per baris. */
function ciplRefBaris(row) {
  const p = row.payload || {};
  return [
    ["Invoice No. & Date", [row.doc_number ? ciplNoTanggal(row.doc_number, row.doc_date) : { no: "—", tgl: "" }]],
    ["PO No. & Date", ciplPoPasangan(p).length ? ciplPoPasangan(p) : [{ no: "—", tgl: "" }]],
  ];
}

/* PIHAK: Shipper & Consignee bertumpuk di kiri; di kanan Referensi
   dokumen (atas) dan Notify Party (bawah, setinggi consignee). */
/* Baris kotak Consignee: nama pembeli lalu alamatnya (cetak & Excel) */
function ciplKonsigneeBaris(row, shipment) {
  const p = row.payload || {};
  return [p.customer || (shipment && shipment.party) || "", ...ciplBarisTeks(p.consigneeAddress)].filter(Boolean);
}

function ciplDdPihak(row, shipment) {
  const p = row.payload || {};
  const consignee = ciplKonsigneeBaris(row, shipment);
  const kartu = (kelas, judul, isi) => `
    <div class="dd-kartu ${kelas}">
      <div class="dd-kartu-h">${escapeHtml(judul)}</div>
      <div class="dd-kartu-b">${isi}</div>
    </div>`;
  const baris = (arr) => arr.map((x, i) => `<div${i === 0 ? ' class="dd-nama"' : ""}>${escapeHtml(x)}</div>`).join("");
  const ref = ciplRefBaris(row)
    .map(([k, v]) => `<div class="dd-ref-k">${escapeHtml(k)}</div>${v
      .map((x) => `<div class="dd-ref-v"><span>${escapeHtml(x.no)}</span>${x.tgl ? `<span class="dd-ref-tgl">${escapeHtml(x.tgl)}</span>` : ""}</div>`)
      .join("")}`)
    .join("");
  return `
    <section class="dd-pihak">
      ${kartu("dd-shipper", "Shipper / Exporter", baris(CIPL_SHIPPER))}
      ${kartu("dd-ref", "Document reference", ref)}
      ${kartu("dd-consignee", "Consignee / Buyer", baris(consignee))}
      ${kartu("dd-notify", "Notify Party", baris([p.notifyParty || "SAME AS CONSIGNEE"]))}
    </section>`;
}

/* NAMA BARANG DUA BARIS: "TYRE MOLD" di atas, jenisnya di bawah
   ("TREAD ONLY", "FULL SET", "SIDE ONLY", ...) -- kolomnya bisa lebih
   sempit dan daftar barang lebih mudah dipindai. Nama lain apa adanya. */
function ciplNamaDuaBaris(nama) {
  const m = String(nama || "").match(/^(T[YI]RE\s+MOLDS?)\s+(.+)$/i);
  return m ? [m[1], m[2]] : [String(nama || "")];
}
const ciplNamaHtml = (nama) => ciplNamaDuaBaris(nama).map(escapeHtml).join("<br>");

/* Mata uang di KIRI angka; desimal SERAGAM satu kolom -- kalau ada satu
   saja harga bersen, semuanya ditulis dua desimal (6,300.25 & 5,800.00),
   bukan campur. */
function ciplDdPemformatUang(mata, nilai) {
  const fmt = ciplFormatUang(mata, nilai);
  const teks = (n) => fmt.teks(n);
  teks.sel = (n) => `<td class="dd-angka">${escapeHtml(fmt.teks(n))}</td>`;
  return teks;
}
/* FORMAT ANGKA BERSAMA cetak & Excel -- teks cetaknya dan format sel
   Excel-nya menampilkan hal yang sama.
   Uang: mata uang di kiri; desimal seragam satu kolom (dua desimal kalau
   ada satu saja yang bersen). */
function ciplFormatUang(mata, nilai) {
  const d = (nilai || []).some((n) => Math.round(Number(n) * 100) % 100 !== 0) ? 2 : 0;
  return {
    f: `"${mata} "#,##0${d ? ".00" : ""}`,
    teks: (n) => `${mata} ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`,
  };
}
/* Angka bersatuan (berat KG, jumlah): desimal mengikuti nilainya
   (170 -> "170", 1,275.5 -> "1,275.5"). */
function ciplFormatAngka(n, satuan) {
  const v = Number(n) || 0;
  const d = Math.round(v * 100) % 100 === 0 ? 0 : Math.round(v * 100) % 10 === 0 ? 1 : 2;
  return {
    v,
    f: `#,##0${d ? "." + "0".repeat(d) : ""}${satuan ? `" ${satuan}"` : ""}`,
    teks: v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + (satuan ? ` ${satuan}` : ""),
  };
}
function ciplDdSelAngka(n, satuan, kelas) {
  return `<td${kelas ? ` class="${kelas}"` : ""}>${escapeHtml(ciplFormatAngka(n, satuan).teks)}</td>`;
}

/* Kotak tanda tangan: 50 mm di kertas, muat stempel perusahaan. */
function ciplDdTandaTangan() {
  return `
      <div class="dd-ttd-kotak">
        <div>For and on behalf of</div>
        <div class="dd-ttd-co">${escapeHtml(CIPL_PERUSAHAAN.nama)}</div>
        <div class="dd-ttd-ruang"></div>
        <div class="dd-ttd-garis">Authorized Signature</div>
      </div>`;
}


function ciplHalamanInvoice(row, shipment, baris) {
  const p = row.payload || {};
  const mata = p.currency || "USD";
  const uang = ciplDdPemformatUang(mata, baris.flatMap((b) => [b.harga, b.amount]));
  const total = baris.reduce((x, b) => x + b.amount, 0);
  const qty = baris.reduce((x, b) => x + (Number(b.qty) || 0), 0);
  const satuan = [...new Set(baris.map((b) => b.satuan).filter(Boolean))];
  return `
  <div class="dd-halaman">
    <div class="dd-bingkai">
    ${ciplDdKepala(ciplJudulInvoice(row))}
    ${ciplDdPihak(row, shipment)}
    ${ciplDdRincian(row, shipment)}
    <table class="dd-tabel">
      <colgroup><col style="width:4%"><col style="width:18%"><col style="width:24%"><col style="width:12%"><col style="width:7%"><col style="width:7%"><col style="width:14%"><col style="width:14%"></colgroup>
      <thead><tr><th>No</th><th>Item</th><th>Type</th><th>HS Code</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th></tr></thead>
      <tbody>${baris.map((b, i) => `
        <tr><td>${i + 1}</td><td>${ciplNamaHtml(b.item)}</td><td>${escapeHtml(b.type)}</td>
          <td>${escapeHtml(b.hs)}</td>${ciplDdSelAngka(b.qty)}<td>${escapeHtml(b.satuan)}</td>
          ${uang.sel(b.harga)}${uang.sel(b.amount)}</tr>`).join("")}
      </tbody>
      <tfoot><tr class="dd-total-baris">
        <td colspan="4" class="dd-kiri">TOTAL</td>${ciplDdSelAngka(qty)}<td>${escapeHtml(satuan.length === 1 ? satuan[0] : "")}</td>
        <td></td>${uang.sel(total)}
      </tr></tfoot>
    </table>
    <div class="dd-ruang"></div>
    <section class="dd-akhir">
      <div></div>
      ${ciplDdTandaTangan()}
    </section>
    </div>
  </div>`;
}

/* ISI KOTAK PACKING DETAILS -- [teks, tebal], dipakai cetak & Excel:
   jenis kemasan, ukuran peti (diringkas per ukuran seperti lembar Kumho),
   MEASUREMENT (total M3), lalu jumlah koli. Jumlah koli pindah ke sini
   dari baris TOTAL tabel. */
function ciplRincianKemasan(p, shipment, baris) {
  const cbm = baris.reduce((x, b) => x + b.cbmRaw, 0);
  const koli = ciplTotalKoli(shipment);
  const dimensi = typeof ciplVnDimensi === "function" ? ciplVnDimensi((shipment && shipment.items) || []) : [];
  return (p.packing ? [[p.packing, false]] : [])
    .concat(dimensi.map((teks) => [teks, false]))
    .concat(cbm ? [[`MEASUREMENT : ${ciplAngka(cbm, 3)} M³`, true]] : [])
    .concat(koli ? [[`${ciplAngka(koli)} PACKAGE${koli > 1 ? "S" : ""}`, true]] : []);
}

function ciplHalamanPacking(row, shipment, baris) {
  const p = row.payload || {};
  const totNw = baris.reduce((x, b) => x + b.netto, 0);
  const totGw = baris.reduce((x, b) => x + b.bruto, 0);
  const qty = baris.reduce((x, b) => x + (Number(b.qty) || 0), 0);
  const satuan = [...new Set(baris.map((b) => b.satuan).filter(Boolean))];
  const kemasan = ciplRincianKemasan(p, shipment, baris);
  return `
  <div class="dd-halaman ci-page2">
    <div class="dd-bingkai">
    ${ciplDdKepala("PACKING LIST")}
    ${ciplDdPihak(row, shipment)}
    ${ciplDdRincian(row, shipment)}
    <table class="dd-tabel">
      <colgroup><col style="width:4%"><col style="width:18%"><col style="width:24%"><col style="width:12%"><col style="width:7%"><col style="width:7%"><col style="width:14%"><col style="width:14%"></colgroup>
      <thead><tr><th>No</th><th>Item Description</th><th>Type</th><th>HS Code</th><th>Qty</th><th>Unit</th><th>Net Weight</th><th>Gross Weight</th></tr></thead>
      <tbody>${baris.map((b, i) => `
        <tr><td>${i + 1}</td><td>${ciplNamaHtml(b.item)}</td><td>${escapeHtml(b.type)}</td>
          <td>${escapeHtml(b.hs)}</td>${ciplDdSelAngka(b.qty)}<td>${escapeHtml(b.satuan)}</td>
          ${ciplDdSelAngka(b.netto, "KG", "dd-angka")}${ciplDdSelAngka(b.bruto, "KG", "dd-angka")}</tr>`).join("")}
      </tbody>
      <tfoot><tr class="dd-total-baris">
        <td colspan="4" class="dd-kiri">TOTAL</td>
        ${ciplDdSelAngka(qty)}<td>${escapeHtml(satuan.length === 1 ? satuan[0] : "")}</td>
        ${ciplDdSelAngka(totNw, "KG", "dd-angka")}${ciplDdSelAngka(totGw, "KG", "dd-angka")}
      </tr></tfoot>
    </table>
    <div class="dd-ruang"></div>
    <section class="dd-akhir">
      <div class="dd-catatan dd-kemasan">
        <div class="dd-catatan-k">Packing details</div>
        <div class="dd-catatan-b">${kemasan.map(([teks, tebal]) => `<div${tebal ? ' class="dd-tebal"' : ""}>${escapeHtml(teks)}</div>`).join("") || "<div>—</div>"}</div>
      </div>
      ${ciplDdTandaTangan()}
    </section>
    </div>
  </div>`;
}

/* Rincian pengiriman [label, isi] -- cetak & Excel.
   Urutan sumber pelabuhan: ketikan pengguna -> profil pembeli ->
   pelabuhan jadwal. Tanggal berlayar TIDAK diambil dari ETD jadwal:
   itu keterangan pengangkut, dan kosong lebih jujur. */
function ciplDdRincianData(row, shipment) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  return [
    ["Port of Loading", p.portLoading || prof.portLoading || (shipment ? portCodeLabel(shipment.origin) : "")],
    ["Final Destination", p.finalDestination || prof.finalDestination || (shipment ? portCodeLabel(shipment.destination) : "")],
    // Udara: No Flight saja; laut: kapal + voyage (carrierCipl, core/carrier-master.js)
    ["Vessel / Flight", carrierCipl(p, shipment)],
    ["Sailing on or About", ciplTanggal(p.sailingDate || "")],
    ["Terms of Delivery", p.termsDelivery || ""],
    ["Terms of Payment", p.termPayment || ""],
    ["Country of Origin", CIPL_ASAL_BARANG],
    ["Remarks", p.remarks || ""],
  ];
}

function ciplDdRincian(row, shipment) {
  const isi = ciplDdRincianData(row, shipment);
  return `
    <section class="dd-rinci">
      ${isi.map(([k, v]) => `<div><div class="dd-rinci-k">${escapeHtml(k)}</div><div class="dd-rinci-v">${escapeHtml(v || "—")}</div></div>`).join("")}
    </section>`;
}


/* ------------------------------------------------------------------
   HALAMAN 3 — SHIPPING INSTRUCTION

   Berbeda bentuk dari dua halaman di atas: bukan tabel barang,
   melainkan daftar instruksi ke forwarder. Karena itu ia tidak
   memakai potongan bersama — kop pun ditulis ulang tanpa bingkai
   kotak, mengikuti berkas contohnya.

   Beberapa baris SENGAJA dibiarkan kosong (PEB Number, Booking
   Number, Vessel, ETD/ETA, Stuffing Date). Itu yang diisi forwarder
   setelah menerima instruksinya — mengisinya dari tebakan kita
   justru menghilangkan gunanya.
------------------------------------------------------------------ */

/* SUSUNAN SHIPPING INSTRUCTION — dipetakan dari berkas aslinya.

   Enam garis pemisah di berkas asli BUKAN border sel, melainkan bentuk
   gambar 0,75pt yang membentang kolom A-H (baris 32, 35, 45, 51, 53,
   57). Di sini digambar sebagai border bawah baris; hasilnya sama dan
   tidak bergantung pada dukungan gambar.

   Penanda di depan tiap label adalah huruf "T" berfont Wingdings pada
   berkas asli; di HTML dipakai lambang setara.

   `kosong: true` menandai baris yang SENGAJA dibiarkan kosong — diisi
   forwarder setelah menerima instruksinya. */
const CIPL_SI_BARIS = [
  { k: "Bill of Lading", f: "blType", bawaan: "Original/Telex" },
  { k: "Shipper", alamat: "shipper" },
  { k: "Consignee", alamat: "consignee" },
  { k: "Notify Party", f: "notifyParty", bawaan: "SAME AS CONSIGNEE" },
  { k: "Place of Receipt", f: "portLoading", dari: "origin" },
  { k: "Port of Discharge", f: "finalDestination", dari: "destination" },
  { k: "Description of Goods", hitung: "barang", tebal: true },
  { k: "Volume", hitung: "muatan" },
  { k: "Gross Weight", hitung: "gw", satuan: "KG" },
  { k: "Net Weight", hitung: "nw", satuan: "KG" },
  { k: "QTY", hitung: "koli", tebal: true },
  { k: "PEB Number", kosong: true },
  { k: "PEB Date", kosong: true },
  { k: "Cont + Seal", kosong: true },
  { k: "HS Code", hitung: "hs", tebal: true },
  { k: "Ocean Freight", f: "oceanFreight" },
  { k: "Booking Number", kosong: true },
  { k: "Vessel", kosong: true },
  { k: "ETD", kosong: true },
  { k: "ETA", kosong: true },
  { k: "Stuffing Date", kosong: true },
  { k: "L/C Number", kosong: true },
  { k: "Special Instruction", kosong: true },
];

/* NOMOR SI = NOMOR URUT CIPL-nya sendiri.

   Yang dipakai kolom `seq` pada baris nomor dokumen — urutan yang
   diterbitkan database saat nomor invoice dibuat. Itulah "nomor urut
   CIPL" yang dimaksud, dan ia benar untuk SEMUA bentuk nomor.

   Ekor nomor invoice dipakai HANYA kalau seq tidak terbawa (baris
   lama yang dimuat sebelum kolomnya ikut diambil). Ekor itu tidak
   bisa jadi sumber utama: pola Kumho berakhir dengan TANGGAL —
   "DDI - CRBM - IX - 051 - 20260924" — sehingga yang terbaca
   20260924, bukan 51.

   Kalau kolom No. SI diisi manual, isian itu yang menang; nomor
   turunan ini hanya bawaan. */
function ciplNoSiDariInvoice(nomor) {
  const m = /(\d+)\s*$/.exec(String(nomor || ""));
  if (!m) return "";
  return String(Number(m[1]));
}

function ciplNoSiBawaan(row) {
  const seq = Number(row && row.seq);
  if (isFinite(seq) && seq > 0) return String(seq);
  return ciplNoSiDariInvoice(row && row.doc_number);
}

/* Nilai tiap baris dikumpulkan SEKALI di muka, lalu dipakai bersama
   oleh versi cetak dan versi Excel. Menghitungnya dua kali berarti dua
   sumber angka yang akan berbeda pelan-pelan — dan yang satu tercetak,
   yang satu terkirim ke forwarder. */
function ciplSiData(row, shipment, baris) {
  const p = row.payload || {};
  const consignee = [
    p.customer || (shipment && shipment.party) || "",
    ...ciplBarisTeks(p.consigneeAddress),
  ].filter(Boolean);
  const koli = ciplTotalKoli(shipment);

  return {
    tujuan: p.siTo || (shipment && shipment.forwarder) || "",
    no: p.siNo || ciplNoSiBawaan(row),
    shipper: CIPL_SHIPPER,
    consignee: consignee,
    // Nama dasar barang ("TYRE MOLD"), tanpa jenisnya (TREAD ONLY, FULL SET, ...)
    barang: [...new Set(baris.map((b) => ciplNamaDuaBaris(b.item)[0].trim()).filter(Boolean))].join(", "),
    muatan: (shipment && shipment.muatan) || "",
    gw: ciplAngka(baris.reduce((s, b) => s + b.bruto, 0)),
    nw: ciplAngka(baris.reduce((s, b) => s + b.netto, 0)),
    koli: koli ? ciplAngka(koli) + " PACKAGE" : "",
    hs: (baris.find((b) => b.hs) || {}).hs || "",
    tanggal: ciplTanggalId(row.doc_date),
    payload: p,
    shipment: shipment,
  };
}

function ciplSiNilai(def, d) {
  if (def.kosong) return "";
  if (def.hitung) return d[def.hitung] || "";
  if (def.f) {
    const v = d.payload[def.f];
    if (v) return v;
    if (def.bawaan) return def.bawaan;
  }
  if (def.dari && d.shipment) return portCodeLabel(d.shipment[def.dari]);
  return "";
}

function ciplHalamanShippingInstruction(row, shipment, baris) {
  const d = ciplSiData(row, shipment, baris);
  const teksBaris = (arr) => arr.map((x) => `<div>${escapeHtml(x)}</div>`).join("");
  const penanda = '<span class="si-b">&#10059;</span>';

  const isiBaris = CIPL_SI_BARIS.map((def) => {
    /* Semua baris berjarak SAMA (tanpa jeda antar kelompok), dan titik
       dua selalu di kolomnya sendiri. */
    const label = `${penanda}${escapeHtml(def.k)}`;

    if (def.alamat) {
      /* "Address" sub-label di baris berikutnya, bukan bagian dari
         nilainya — mengikuti berkas aslinya. */
      const isi = d[def.alamat];
      return `
      <tr>
        <td class="si-k">${label}</td>
        <td class="si-c">:</td>
        <td class="si-v">${escapeHtml(isi[0] || "")}</td>
      </tr>
      <tr>
        <td class="si-k si-sub">Address</td>
        <td class="si-c"></td>
        <td class="si-v">${teksBaris(isi.slice(1))}</td>
      </tr>`;
    }

    const nilai = ciplSiNilai(def, d);
    return `
      <tr>
        <td class="si-k">${label}</td>
        <td class="si-c">:</td>
        <td class="si-v${def.tebal ? " si-v-bold" : ""}">${escapeHtml(nilai)}${
          def.satuan && nilai ? ` &nbsp; ${def.satuan}` : ""
        }</td>
      </tr>`;
  }).join("");

  return `
  <div class="ci-sheet ci-page2 si-sheet">
    <div class="ci-box si-box">
    <table class="ci-kop">
      <tr>
        <td class="ci-kop-logo"><img src="${SJ_LOGO}" alt="" /></td>
        <td class="ci-kop-teks">
          <div class="ci-company">${escapeHtml(CIPL_PERUSAHAAN.nama)}</div>
          <div class="ci-addr">${escapeHtml(CIPL_PERUSAHAAN.pusat)}</div>
          <div class="ci-addr">${escapeHtml(CIPL_PERUSAHAAN.cabang)}</div>
        </td>
      </tr>
    </table>

    <div class="si-title">SHIPPING INSTRUCTION</div>
    <div class="si-no">NO. ${escapeHtml(d.no)}</div>
    <div class="si-lead si-to">To : ${escapeHtml(d.tujuan)}</div>
    <div class="si-lead">Please arrange our shipment per description below :</div>

    <table class="si-list">${isiBaris}</table>

    <div class="si-tutup">
      <div>Thank you for your good cooperation.</div>
      <div class="si-kota">Cirebon, ${escapeHtml(d.tanggal)}</div>
      <div>Regards,</div>
      <div class="si-ttd">SIGN &amp; STAMP</div>
    </div>
    </div>
  </div>`;
}

/* "03 Agustus 2026" — bentuk tanggal Indonesia untuk penutup surat. */
function ciplTanggalId(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const bln = ["Januari","Februari","Maret","April","Mei","Juni",
               "Juli","Agustus","September","Oktober","November","Desember"];
  return `${String(d.getDate()).padStart(2, "0")} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

/* Cari baris riwayat nomor dokumen, atau beri tahu kalau tidak ada.

   Dipakai bersama oleh pencetakan DAN pengunduhan Excel. Dulu keduanya
   punya salinan pencariannya sendiri, termasuk perbandingan
   String(id) === String(rowId) dan bunyi pesannya. Perbandingan itu
   sengaja longgar karena id bisa datang sebagai angka dari database
   atau sebagai teks dari atribut DOM — persis jenis aturan yang tidak
   boleh hidup di dua tempat. */
function ciplCariBarisRiwayat(rowId) {
  const row = (docNumHistoryRows || []).find(
    (r) => String(r.id) === String(rowId),
  );
  if (!row) showToast(t("m.data.invoice.tidak.ditemukan"), "danger");
  return row || null;
}

/* ------------------------------------------------------------------
   PEMICU CETAK
------------------------------------------------------------------ */
function cetakCipl(rowId) {
  const row = ciplCariBarisRiwayat(rowId);
  if (!row) return;

  const tautId = (row.payload || {}).shipmentId;
  const shipment = ciplCariShipment(tautId);
  if (tautId && !shipment) {
    showToast(t("m.jadwal.yang.ditautkan.tidak.ditemukan.daftar.b"),
      "warning",
    );
  } else if (!tautId) {
    showToast(t("m.invoice.ini.belum.ditautkan.ke.jadwal.export.d"),
      "warning",
    );
  }

  const baris = ciplBarisBarang(shipment);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger");
    return;
  }
  /* BENTUK LEMBAR DIPILIH DARI PROFIL PEMBELI.

     Percabangannya ada di SATU titik masuk ini, bukan di dalam tiap
     bagian lembar -- kedua templat tidak perlu tahu keberadaan satu
     sama lain, dan mengubah salah satunya tidak bisa merembet. */
  const prof = ciplProfil((row.payload || {}).customer || (shipment && shipment.party));
  const pakaiVn = prof.layout === "vn" && typeof ciplVnHalamanInvoice === "function";

  const gaya = pakaiVn ? ciplVnCss() : ciplCss();
  const isi = pakaiVn
    ? ciplVnHalamanInvoice(row, shipment) + ciplVnHalamanPacking(row, shipment)
    : ciplHalamanInvoice(row, shipment, baris) +
      ciplHalamanPacking(row, shipment, baris) +
      ciplHalamanShippingInstruction(row, shipment, baris);

  w.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(ciplJudulInvoice(row))} ${escapeHtml(row.doc_number || "")}</title>
<style>${gaya}</style></head>
<body>${isi}</body></html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}

function ciplCss() {
  return `
  /* MARGIN @page NOL — DISENGAJA, dan bukan berarti tanpa margin.

     Peramban menggambar kop & kaki cetakannya sendiri (tanggal, judul
     tab, "about:blank", nomor halaman) DI DALAM area margin @page.
     Tidak ada CSS yang bisa mematikannya. Satu-satunya cara: tidak
     menyisakan ruang untuk digambari — yaitu margin nol.

     Jarak ke tepi kertas tetap ada, hanya dipindah ke padding
     .ci-sheet di bawah. Hasil cetaknya sama, tanpa tulisan peramban.

     PERNAH DICOBA SEBALIKNYA dan gagal: memindahkan margin narrow ke
     @page memang membuat pratinjau menampilkan angka yang benar, tapi
     kop & kaki peramban langsung muncul di keempat sisinya. */
  @page { size: A4; margin: 0; }

  /* SATU ANGKA UNTUK SELURUH GARIS.

     Ketebalan yang ditulis terpisah di sepuluh tempat akan berbeda
     cepat atau lambat — satu diubah, sembilan tertinggal, dan
     hasilnya garis yang compang-camping.

     1px dipilih, bukan pecahan poin: pecahan harus dibulatkan ke
     piksel perangkat, dan pembulatan itu jatuh berbeda-beda menurut
     posisi tiap garis di halaman. Satu garis jadi 1px, tetangganya
     2px, tanpa ada yang salah di CSS-nya. */
  :root { --ci-line: 1px solid #000; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* JARAK KE TEPI KERTAS — preset "Narrow" Excel, dalam milimeter.

     Excel menyimpannya dalam inci: kiri & kanan 0,25" = 6,35 mm; atas
     & bawah 0,75" = 19,05 mm. Kalau salah satu diubah, ubah
     pasangannya di cipl-excel.js (XLS_MARGIN_NARROW) — ada uji yang
     memastikan keduanya tetap sepasang. */
  /* LEBAR LEMBAR DIPATOK selebar kertas, bukan selebar jendela. Jendela
     cetak 900px, kertas A4 794px: tanpa patokan, tata letak di layar
     (tempat pengepas kolom mengukur) berbeda dari yang tercetak. */
  .ci-sheet { width: 210mm; padding: 19.05mm 6.35mm; }
  .ci-page2 { page-break-before: always; break-before: page; }
  .ci-box { border: var(--ci-line); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  td, th { vertical-align: top; }
  /* Kop perusahaan: kini hanya dipakai Shipping Instruction (surat ke forwarder). */
  .ci-kop td { border: 0; padding: 4px 6px; }
  .ci-kop-logo { width: 70px; text-align: center; }
  .ci-kop-logo img { width: 52px; }
  .ci-kop-teks { text-align: center; padding-right: 70px; }
  .ci-company { font-size: 18pt; font-weight: 700; letter-spacing: .5px; }
  .ci-addr { font-size: 8pt; }
  /* ================================================================
     CI & PL DYNAMIC DESIGN — tema biru navy: pita kepala kartu & kepala
     tabel navy berhuruf putih; garis judul hitam; isi hitam & abu.
     .dd-halaman: kolom flex setinggi kertas (margin 10 mm, sama dengan
     Excel-nya, cipl-excel-rapi.js); .dd-bingkai: bingkai luar tebal di garis
     margin; .dd-ruang mendorong referensi & tanda tangan ke dasar.
     ================================================================ */
  .dd-halaman {
    width: 210mm; min-height: 297mm; padding: 10mm;
    display: flex; flex-direction: column;
    font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 9pt;
  }
  .dd-bingkai {
    flex: 1 1 auto; display: flex; flex-direction: column;
    border: 2px solid #222; padding: 6mm 6mm 5mm;
  }
  .dd-kepala { text-align: center; border-bottom: 2px solid #222; padding-bottom: 6px; margin-bottom: 10px; }
  .dd-judul { font-size: 20pt; font-weight: 800; color: #222; line-height: 1.1; }
  /* Kiri: Shipper & Consignee. Kanan: Referensi dokumen (atas) & Notify
     Party (bawah, setinggi kotak consignee di sebelahnya). */
  .dd-pihak {
    display: grid; grid-template-columns: 1fr 42%; gap: 8px; margin-bottom: 8px;
    grid-template-areas: "shipper ref" "consignee notify";
  }
  .dd-shipper { grid-area: shipper; }
  .dd-ref { grid-area: ref; }
  .dd-consignee { grid-area: consignee; }
  .dd-notify { grid-area: notify; }
  .dd-ref-k { font-size: 6.8pt; font-weight: 700; color: #777; text-transform: uppercase; margin-top: 11px; }
  .dd-ref-k:first-child { margin-top: 0; }
  .dd-ref-v { display: flex; justify-content: space-between; gap: 8px; font-size: 8.8pt; font-weight: 700; line-height: 1.3; word-break: break-word; }
  .dd-ref-v > span:first-child { flex: 1 1 auto; min-width: 0; }
  .dd-ref-tgl { flex: none; text-align: right; white-space: nowrap; }
  .dd-kartu, .dd-catatan { border: 1px solid #1f2a44; overflow: hidden; }
  .dd-catatan-b { padding: 6px 9px 7px; font-size: 8.5pt; line-height: 1.55; }
  /* Rincian kemasan: kotak selebar isinya (bukan selebar kolom), kepala di tengah */
  .dd-kemasan { justify-self: start; width: max-content; max-width: 100%; }
  .dd-kemasan .dd-catatan-k { text-align: center; }
  .dd-kemasan .dd-catatan-b { padding-right: 14px; }
  .dd-tebal { font-weight: 700; }
  .dd-kartu-h, .dd-catatan-k {
    background: #1f2a44; padding: 4px 9px;
    font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #fff;
  }
  .dd-kartu-b { padding: 6px 9px 7px; font-size: 8.5pt; line-height: 1.42; }
  .dd-kartu-b .dd-nama { font-weight: 700; font-size: 9pt; }
  .dd-rinci {
    /* Sejajar dengan batas kolom tabel barang (No+Item | Type | HS+Qty+Unit |
       Harga+Jumlah), supaya Excel-nya memakai SATU kisi kolom yang sama. */
    display: grid; grid-template-columns: 22% 24% 26% 28%;
    border: 1px solid #c8c8c8; margin-bottom: 10px;
  }
  .dd-rinci > div { padding: 5px 9px; border-right: 1px solid #e4e4e4; border-bottom: 1px solid #e4e4e4; }
  .dd-rinci > div:nth-child(4n) { border-right: 0; }
  .dd-rinci > div:nth-child(n+5) { border-bottom: 0; }
  .dd-rinci-k { font-size: 6.8pt; font-weight: 700; color: #777; text-transform: uppercase; }
  .dd-rinci-v { font-size: 9pt; font-weight: 700; margin-top: 2px; }
  .dd-tabel { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .dd-tabel thead th {
    background: #1f2a44; color: #fff; font-size: 7pt; font-weight: 700; text-transform: uppercase;
    padding: 6px 5px; text-align: center; vertical-align: middle;
  }
  .dd-tabel tbody td {
    padding: 4px 5px; border-bottom: 1px solid #e2e2e2; font-size: 8.5pt; line-height: 1.3;
    text-align: center; vertical-align: middle;
  }
  .dd-tabel tbody tr:nth-child(even) td { background: #fafafa; }
  .dd-tabel .dd-kiri { text-align: left; }
  /* Harga, jumlah & berat: rata tengah, angka dan satuannya tidak terpisah baris */
  .dd-tabel .dd-angka { text-align: center; white-space: nowrap; }
  /* TOTAL: satu baris memanjang tepat di bawah barang */
  .dd-tabel tfoot td {
    padding: 6px 5px; font-size: 9pt; font-weight: 700; text-align: center; vertical-align: middle;
    background: #eeeeee; border-top: 1.5px solid #1f2a44; border-bottom: 1.5px solid #1f2a44;
  }
  .dd-tabel tfoot td.dd-kiri { text-align: left; padding-left: 9px; }
  .dd-ruang { flex: 1 1 auto; min-height: 6mm; }
  .dd-akhir { display: grid; grid-template-columns: 1fr 76mm; gap: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
  /* 50 mm di kertas, muat stempel perusahaan */
  .dd-ttd-kotak { height: 50mm; display: flex; flex-direction: column; text-align: center; font-size: 8pt; }
  .dd-ttd-co { font-weight: 700; font-size: 8.5pt; margin-top: 1px; }
  .dd-ttd-ruang { flex: 1; }
  .dd-ttd-garis { border-top: 1px solid #222; padding-top: 3px; margin: 0 8mm; }
  /* SHIPPING INSTRUCTION -- huruf besar & lega, supaya jelas terbaca saat
     dicetak. Margin 10 mm di keempat sisi, sama dengan CI & PL (bukan
     preset Narrow 19,05 mm atas-bawah): ruang yang dibebaskan dipakai
     untuk huruf yang lebih besar, tetap satu halaman. */
  .ci-sheet.si-sheet { padding: 10mm; font-size: 10.5pt; }
  /* Bingkainya setinggi halaman, bukan setinggi isinya.

     Halaman A4 dikurangi padding .si-sheet 10 mm atas & bawah. Angka
     ini HARUS ikut kalau paddingnya diubah — kalau tidak, kotaknya lebih
     tinggi daripada ruang yang tersisa dan mendorong satu halaman
     kosong di belakangnya.

     Tanpa min-height, kotaknya berhenti di baris terakhir yang terisi,
     jadi tingginya berubah-ubah mengikuti panjang alamat consignee —
     dua SI dari pengiriman berbeda tercetak dengan kotak berbeda. */
  .si-box {
    padding: 20px 36px 22px;
    min-height: calc(297mm - 20mm - 2px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  /* Blok penutup didorong ke bawah kotak. */
  .si-tutup { margin-top: auto; }
  .si-sheet .ci-company { font-size: 19pt; }
  .si-sheet .ci-addr { font-size: 9pt; }
  /* "To : ..." -- satu gaya dengan kalimat pembuka di bawahnya */
  .si-lead.si-to { margin-bottom: 4px; }
  /* Jarak kop -> judul tetap seperti saat baris "TO : ..." masih di
     atasnya (8 px + satu baris 10,5pt + 12 px), walau baris itu kini
     pindah ke bawah judul. */
  .si-title {
    margin-top: 36px;
    text-align: center; font-weight: 700; font-size: 16pt;
    text-decoration: underline;
  }
  .si-no { text-align: center; font-weight: 700; font-size: 11.5pt; margin: 2px 0 30px; }
  .si-lead { font-size: 10.5pt; margin-bottom: 10px; }

  .si-list { width: 100%; }
  .si-list td { vertical-align: top; padding: 1px 0; font-size: 10.5pt; line-height: 1.15; }
  .si-k { width: 240px; padding-left: 26px !important; }
  /* Titik dua sejajar di satu kolom sendiri — kalau ditempel ke label,
     posisinya ikut panjang labelnya dan barisnya terlihat goyah. */
  .si-c { width: 16px; }
  .si-v-bold { font-weight: 700; }
  /* Penanda di depan label — huruf Wingdings "T" pada berkas asli. */
  .si-b { display: inline-block; width: 20px; font-size: 8.5pt; }
  /* "Address" sub-label. Disejajarkan dengan LABEL di atasnya —
     penandanya selebar 20px, jadi teksnya digeser sejauh itu supaya
     huruf pertamanya lurus dengan "Shipper" dan "Consignee". */
  .si-sub {
    padding-left: 46px !important;
    font-size: 9.5pt;
  }
  .si-tutup { margin-top: 16px; font-size: 10.5pt; }
  .si-kota { margin-top: 12px; }
  /* Ruang untuk materai, tanda tangan basah, dan cap perusahaan (±22 mm
     di atas tulisan SIGN & STAMP). 40px hanya cukup untuk tanda tangan;
     materai 10.000 saja sudah sekitar 2 cm. */
  .si-ttd {
    margin-top: 84px;
    text-decoration: underline;
    font-weight: 600;
  }
  `;
}
