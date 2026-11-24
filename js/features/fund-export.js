"use strict";

/* ------------------------------------------------------------------
   EXPORT EXCEL PENGAJUAN DANA

   Tombol Export di riwayat Pengajuan Dana (juga di tab Summary; tab
   Report punya unduhan sendiri) membuka kotak dialog dengan SARINGANNYA
   SENDIRI -- data yang diekspor dipilih di sana, lepas dari saringan
   riwayat di belakangnya -- dan pilihan FORMAT berkasnya (Payment Plan /
   Invoice Summary, lihat di bawah):
     - Status bayar: Semua / Lunas / Belum Lunas (payload.paidAt);
     - Vendor ("Dibayarkan Kepada"): ejaan yang hanya beda huruf besar /
       tanda baca ("PT. WIDE LOGISTICS", "PT WIDE LOGISTICS") satu vendor;
     - Rentang tanggal menurut Tanggal Invoice ATAU Jatuh Tempo invoice.
   Jumlah pengajuan, totalnya, dan beberapa baris pertama tampil langsung
   setiap saringan diubah: yang diunduh persis yang terlihat. Pilihan
   saringan bertahan selama halaman terbuka.

   PERAN: terbuka untuk setiap peran yang bisa membuka riwayat Pengajuan
   Dana -- EXIM, FINANCE, Marketing. Export hanya MEMBACA (tidak ada data
   yang diubah), jadi tidak dijaga canEdit() dan tombolnya tidak masuk
   aturan hanya-lihat body.is-viewer (auth.css); datanya dibaca dengan
   izin baca yang sama dengan riwayat.

   Seluruh Pengajuan Dana dimuat sekali tiap dialog dibuka (per 1.000,
   batas satu permintaan Supabase) -- pengajuan yang baru terbit langsung
   ikut; saringan dihitung di aplikasi, jadi mengganti pilihan instan.

   FORMAT (pilihan "Format" di dialog, bertahan selama halaman terbuka;
   Reset saringan tidak mengubahnya):

   1. PAYMENT PLAN (format Payment Plan finance) -- lembar "Payment Plan":
        NO | SUBJECT | NOMINAL | INVOICE DUE DATE | PIC | VENDOR NAME | INVOICE NO. | INVOICE DATE
      Semua judul kolom (kedua format) HURUF KAPITAL.
      No = nomor urut; Subject = Rincian (Subject surat cetak); Nominal =
      jumlah akhir pengajuan (frTotalPengajuan: angka "Terbilang" di surat,
      Nilai di riwayat, Cost di Summary); Invoice Due Date = jatuh tempo
      invoice, tepat di kanan Nominal; PIC = pembuat pengajuan (Drafter /
      "Made by" di surat); Invoice No. = kolom Nomor Billing/Invoice riwayat
      (Billing -> Nomor Billing; selainnya No. Invoice + invoice / debit
      note tambahan, satu nomor per baris di selnya). Tanggal = tanggal
      Excel sungguhan (dd-mm-yyyy), Nominal = angka, nomor = TEKS (nomor
      billing 15 angka tidak jadi 6,4E+14). Judul & isi rata tengah, kecuali
      Subject (rata kiri, tidak dibungkus, kolom selebar kalimatnya).
      Langsung di bawah tabel baris TOTAL: SUBTOTAL(109) -- ikut menyusut
      kalau tabelnya disaring di Excel; mata uang campuran dijumlah per mata
      uang dan tiap nominal berawalan kodenya ("USD 1,250.00").

   2. INVOICE SUMMARY (format lembar akunting INVOICE SUMMARY) -- lihat
      fexSusunInvoiceSummary.

   Kedua format diurutkan menurut tanggal yang dipakai saringan, terlama
   dulu.
------------------------------------------------------------------ */

/* PAYMENT PLAN: kolom kiri ke kanan. Judul & isi RATA TENGAH, kecuali
   Subject: rata kiri dan TIDAK dibungkus -- kolomnya selebar kalimat
   terpanjang (fexLebarKolom), seperti contoh berkas pengguna. Invoice Due
   Date tepat di kanan Nominal (format Payment Plan finance). Vendor Name &
   Invoice No. dibungkus: invoice / debit note tambahan masing-masing di
   baris sendiri dalam selnya (" / " membuat Excel memotong di tanda hubung
   nomornya: "DN-" | "77/XI/2026"). `maks` = batas lebar kolom. */
const FEX_KOLOM = [
  { judul: "NO", ambil: (b, i) => i + 1 },
  { judul: "SUBJECT", ambil: (b) => b.subject, kiri: true, maks: 150 },
  { judul: "NOMINAL", ambil: (b) => b.nominal, uang: true },
  { judul: "INVOICE DUE DATE", ambil: (b) => b.jatuhTempo, tanggal: true },
  { judul: "PIC", ambil: (b) => b.drafter, maks: 30 },
  { judul: "VENDOR NAME", ambil: (b) => b.vendor, bungkus: true, maks: 40 },
  { judul: "INVOICE NO.", ambil: (b) => b.nomorDaftar.join("\n"), bungkus: true, maks: 40 },
  { judul: "INVOICE DATE", ambil: (b) => b.tglInvoice, tanggal: true },
];

/* INVOICE SUMMARY: kolom A-K tabel lembar akunting, urutan & lebar PERSIS
   lembar contohnya; judulnya kapital semua ("Paid Date" lembar aslinya ->
   PAID DATE), seperti judul rekap per bulannya; "COST(RP)" -> COST (bisa
   rupiah atau USD). Isinya = salinan "Salin ke Invoice Summary" (invsumSel,
   fund-invoice-summary.js), jadi keduanya selalu sama; COST = Nominal
   Payment Plan (sama dengan total dibayar invsumSel untuk rupiah, dan tetap
   bersen untuk mata uang lain). */
const FEX_INVSUM_KOLOM = [
  { judul: "NO", lebar: 6.29 },
  { judul: "INVOICE DATE", lebar: 16.29, tanggal: true },
  { judul: "DUE DATE", lebar: 12.43, tanggal: true },
  { judul: "PAID DATE", lebar: 12.43, tanggal: true },
  { judul: "INVOICE NUMBER", lebar: 23.43, teks: true, bungkus: true },
  { judul: "COMPANY", lebar: 28.43 },
  { judul: "CUSTOMER", lebar: 13.57 },
  // DETAILS: satu barang per baris dalam satu sel (invsumBarang), rata kiri-atas
  { judul: "DETAILS", lebar: 37.86, bungkus: true, kiriAtas: true },
  { judul: "COST", lebar: 18.29, uang: true },
  { judul: "EXPENSES CATEGORY", lebar: 28.29, daftar: "EXPENSES_CATEGORY" },
  { judul: "TRANSPORT MODE", lebar: 20.71, daftar: "TRANSPORT_MODE" },
];
/* Kolom L CURRENCY (IDR / USD) -- HANYA bila pengajuan yang diekspor
   bermata uang campuran: rekap per bulan menjumlah per mata uang dengan
   rumus, dan rumus butuh mata uang tiap baris (format sel COST tidak bisa
   dibaca rumus). Ikut tabel, jadi tetap benar walau tabelnya diurutkan /
   disaring di Excel; kolom A-K tetap sejajar lembar aslinya. */
const FEX_INVSUM_MATA_UANG = { judul: "CURRENCY", lebar: 12.43 };
// Mata uang: rupiah dulu, lainnya abjad
const fexUrutMataUang = (daftar) => [...new Set(daftar)].sort((a, b) => (a === "IDR" ? -1 : b === "IDR" ? 1 : a.localeCompare(b)));

// Lembar CATEGORY: pilihan kolom J & K (urutan seperti lembar contohnya)
const FEX_INVSUM_DAFTAR = [
  ["EXPENSES CATEGORY", "EXPENSES_CATEGORY", ["IMPORT DUTY TAX", "IMPORT DUTY TAX + STORAGE", "FREIGHT CHARGE", "STORAGE", "OTHER"]],
  ["TRANSPORT MODE", "TRANSPORT_MODE", ["AIR EXPORT", "SEA EXPORT", "AIR IMPORT", "SEA IMPORT", "TRUCKING"]],
];
const FEX_INVSUM_NAVY = "FF002060";
const FEX_INVSUM_TEPI = "FF7F7F7F"; // tema "Text 1" 50% -- garis tabel lembar contohnya
// Format akuntansi rupiah lembar contohnya: COST bersen, rekap bulanan tanpa sen
const FEX_RP = '_-[$Rp-3809]* #,##0.00_-;\\-[$Rp-3809]* #,##0.00_-;_-[$Rp-3809]* "-"??_-;_-@_-';
const FEX_RP_BULAT = '_-[$Rp-421]* #,##0_-;\\-[$Rp-421]* #,##0_-;_-[$Rp-421]* "-"??_-;_-@_-';
const FEX_BULAN = ["JAN.", "FEB.", "MAR.", "APR.", "MAY", "JUNE", "JULY", "AUG.", "SEPT.", "OCT.", "NOV.", "DEC."];

const FEX_FORMAT = {
  paymentPlan: { label: "Payment Plan", berkas: "Payment_Plan", kolom: () => FEX_KOLOM.map((k) => k.judul) },
  invoiceSummary: { label: "Invoice Summary", berkas: "Invoice_Summary", kolom: () => FEX_INVSUM_KOLOM.map((k) => k.judul) },
};
let fexFormatPilih = "paymentPlan";
const fexFormatSah = (f) => (FEX_FORMAT[f] ? f : "paymentPlan");
/* Tahun rekap bulanan Invoice Summary: "" = otomatis (fexTahunOtomatis);
   pilihan pengguna bertahan sampai rentang tanggal diubah atau Reset. */
let fexTahunPilih = "";
const FEX_SARINGAN_AWAL = { bayar: "", vendor: "", dasar: "invoice", dari: "", sampai: "" };
const fexSaringan = Object.assign({}, FEX_SARINGAN_AWAL);
const FEX_PRATINJAU = 5; // baris contoh di dialog
const FEX_PER_AMBIL = 1000;

/* ----------------------------- data ------------------------------ */

const fexIso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");
// Kunci vendor: huruf & angka saja -- "PT. Wide Logistics" = "PT WIDE LOGISTICS"
const fexKunciVendor = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
// Rupiah tanpa sen (dibulatkan seperti totalnya), mata uang lain dua desimal
const fexBulat = (n, m) => (m === "IDR" ? Math.round(Number(n) || 0) : Math.round((Number(n) || 0) * 100) / 100);

/* Sama dengan kolom Nomor Billing/Invoice riwayat Pengajuan Dana (docnum-view.js):
   Billing -> [Nomor Billing]; selainnya No. Invoice + invoice / debit note tambahan. */
function fexNomorTagihan(p) {
  if (String(p.billingNo || "").trim()) return [String(p.billingNo).trim()];
  const semua = typeof fundSemuaNomor === "function" ? fundSemuaNomor(p) : [p.invoiceNo];
  return semua.map((x) => String(x || "").trim()).filter(Boolean);
}

// Satu baris document_numbers (doc_type "fund") -> satu baris ekspor
function fexBaris(r) {
  const p = (r && r.payload) || {};
  const mataUang = String(p.currency || "IDR").trim().toUpperCase() || "IDR";
  return {
    id: r.id,
    asli: r, // baris document_numbers -- sumber kolom Invoice Summary (invsumSel)
    nomorSurat: String(r.doc_number || ""),
    subject: String(p.notes || "").trim(),
    nominal: fexBulat(typeof frTotalPengajuan === "function" ? frTotalPengajuan(p) : 0, mataUang),
    mataUang,
    jatuhTempo: fexIso(p.invoiceDueDate),
    // kolom requester (yang diubah Ubah Isian); payload.requester untuk data lama -- "Made by" surat cetak
    drafter: String(r.requester || p.requester || "").trim(),
    vendor: String(p.payee || "").trim(),
    nomorDaftar: fexNomorTagihan(p),
    nomor: fexNomorTagihan(p).join(" / "), // pratinjau dialog, seperti di riwayat
    tglInvoice: fexIso(p.invoiceDate),
    tglBayar: fexIso(p.paidAt), // Paid Date -- dasar rekap bulanan Invoice Summary
    lunas: !!p.paidAt,
  };
}

/* Saringan dialog. Rentang tanggal menurut f.dasar ("invoice" | "jatuhTempo");
   pengajuan yang tanggal itu kosong tidak bisa dinilai, jadi tidak ikut
   SELAMA rentangnya diisi (sama dengan saringan rentang di riwayat). */
function fexSaring(baris, f) {
  const s = f || {};
  return baris.filter((b) => {
    if (s.bayar === "lunas" && !b.lunas) return false;
    if (s.bayar === "belum" && b.lunas) return false;
    if (s.vendor && fexKunciVendor(b.vendor) !== s.vendor) return false;
    const tgl = s.dasar === "jatuhTempo" ? b.jatuhTempo : b.tglInvoice;
    if ((s.dari || s.sampai) && !tgl) return false;
    if (s.dari && tgl < s.dari) return false;
    if (s.sampai && tgl > s.sampai) return false;
    return true;
  });
}

// Urut menurut tanggal saringan (terlama dulu; tanpa tanggal di akhir), lalu nomor surat
function fexUrut(baris, dasar) {
  const tgl = (b) => (dasar === "jatuhTempo" ? b.jatuhTempo : b.tglInvoice);
  return baris.slice().sort((a, b) => {
    const x = tgl(a), y = tgl(b);
    if (x !== y) return !x ? 1 : !y ? -1 : x < y ? -1 : 1;
    return a.nomorSurat.localeCompare(b.nomorSurat, undefined, { numeric: true });
  });
}

/* Pilihan vendor: [{ kunci, nama, jumlah }] urut nama. Nama = ejaan yang
   paling sering dipakai untuk vendor itu; kalau seri, ejaan yang muncul
   lebih dulu -- data dimuat terbaru dulu, jadi ejaan pengajuan terbaru. */
function fexDaftarVendor(baris) {
  const peta = new Map();
  baris.forEach((b) => {
    const kunci = fexKunciVendor(b.vendor);
    if (!kunci) return;
    const v = peta.get(kunci) || { kunci, ejaan: new Map(), jumlah: 0 };
    v.jumlah += 1;
    v.ejaan.set(b.vendor, (v.ejaan.get(b.vendor) || 0) + 1);
    peta.set(kunci, v);
  });
  return [...peta.values()]
    .map((v) => ({ kunci: v.kunci, nama: [...v.ejaan].sort((a, b) => b[1] - a[1])[0][0], jumlah: v.jumlah }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

// Total per mata uang, rupiah lebih dulu: [[mataUang, total]]
function fexTotal(baris) {
  const per = new Map();
  baris.forEach((b) => per.set(b.mataUang, (per.get(b.mataUang) || 0) + b.nominal));
  return [...per]
    .map(([m, n]) => [m, fexBulat(n, m)])
    .sort((a, b) => (a[0] === "IDR" ? -1 : b[0] === "IDR" ? 1 : a[0].localeCompare(b[0])));
}

/* Nama berkas menyebut format & saringannya:
   Payment_Plan_Unpaid_PT_WIDE_LOGISTICS_Due_2026-11-01_2026-11-30.xlsx,
   Invoice_Summary_Paid_2026-11-24.xlsx. Tanpa rentang tanggal: tanggal ekspor. */
function fexNamaBerkas(f, daftarVendor, hariIni, format) {
  const s = f || {};
  const bagian = [FEX_FORMAT[fexFormatSah(format)].berkas];
  if (s.bayar) bagian.push(s.bayar === "lunas" ? "Paid" : "Unpaid");
  if (s.vendor) {
    const v = (daftarVendor || []).find((x) => x.kunci === s.vendor);
    bagian.push(String(v ? v.nama : s.vendor).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30));
  }
  if (s.dari || s.sampai) bagian.push(`${s.dasar === "jatuhTempo" ? "Due" : "Inv"}_${s.dari || s.sampai}_${s.sampai || s.dari}`);
  else bagian.push(hariIni || todayISO());
  return bagian.filter(Boolean).join("_") + ".xlsx";
}

/* PILIHAN TAHUN rekap bulanan: tahun Paid Date yang ada di seluruh
   Pengajuan Dana (rekap menjumlah menurut Paid Date, seperti lembar
   INVOICE SUMMARY) + tahun berjalan -- tahun baru otomatis muncul begitu
   ada pembayaran di tahun itu. Terbaru dulu. */
function fexDaftarTahun(baris, tambahan) {
  const th = new Set([String(new Date().getFullYear())]);
  (baris || []).forEach((b) => b.tglBayar && th.add(b.tglBayar.slice(0, 4)));
  if (tambahan) th.add(String(tambahan));
  return [...th].sort().reverse();
}

/* Tahun bawaan: rentang tanggal saringan yang berada dalam SATU tahun ->
   tahun itu (ekspor Desember 2026 di bulan Januari tetap merekap 2026);
   selain itu tahun Paid Date terbaru di baris yang diekspor; tanpa
   pembayaran sama sekali -> tahun berjalan. */
function fexTahunOtomatis(hasil, f) {
  const s = f || {};
  const a = String(s.dari || s.sampai || "").slice(0, 4);
  const z = String(s.sampai || s.dari || "").slice(0, 4);
  if (a && a === z) return a;
  const bayar = (hasil || []).map((b) => b.tglBayar).filter(Boolean).sort();
  return bayar.length ? bayar[bayar.length - 1].slice(0, 4) : String(new Date().getFullYear());
}

async function fexAmbilSemua() {
  const semua = [];
  for (let mulai = 0; mulai < 50 * FEX_PER_AMBIL; mulai += FEX_PER_AMBIL) {
    const { data, error } = await supabaseClient
      .from("document_numbers")
      .select("id, doc_number, doc_date, requester, department, payload, created_at")
      .eq("doc_type", "fund")
      .order("created_at", { ascending: false })
      .order("id")
      .range(mulai, mulai + FEX_PER_AMBIL - 1);
    if (error) throw error;
    semua.push(...(data || []));
    if (!data || data.length < FEX_PER_AMBIL) break;
  }
  return semua;
}

/* ---------------------------- berkas ----------------------------- */

// Tengah malam UTC: ExcelJS menghitung nomor seri dari waktu UTC (lihat nativeFormatter.date)
function fexTanggalExcel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
function fexFormatUang(mataUang, campur) {
  const pola = mataUang === "IDR" ? "#,##0" : "#,##0.00";
  return campur ? `"${mataUang} "${pola}` : pola;
}

// Teks yang tampil di sel -- dasar lebar kolom
function fexTeksSel(k, b, i, campur) {
  const v = k.ambil(b, i);
  if (k.tanggal) return v ? "00-00-0000" : "";
  if (k.uang) {
    const d = b.mataUang === "IDR" ? 0 : 2;
    return (campur ? `${b.mataUang} ` : "") + angkaLokal(Number(v) || 0, "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return v == null ? "" : String(v);
}

/* Lebar kolom menurut isinya (satuan Excel = lebar satu angka "0"): baris
   terpanjang di kolom itu -- huruf proporsional ~0,95, angka & tanggal 1 --
   paling sedikit selebar judul + tombol saringan Excel, paling lebar `maks`. */
function fexLebarKolom(k, baris, campur) {
  let isi = 0;
  baris.forEach((b, i) => {
    fexTeksSel(k, b, i, campur).split("\n").forEach((teks) => {
      const angka = /^[\d\s.,:/-]*$/.test(teks) || k.uang || k.tanggal;
      isi = Math.max(isi, Math.ceil(teks.length * (angka ? 1 : 0.95)) + 3);
    });
  });
  return Math.min(Math.max(k.judul.length + 5, isi, 6), k.maks || 60);
}

// Berkas menurut format pilihan dialog; opsi.tahun = tahun rekap bulanan Invoice Summary
function fexSusunWorkbook(baris, format, opsi) {
  return fexFormatSah(format) === "invoiceSummary" ? fexSusunInvoiceSummary(baris, opsi) : fexSusunPaymentPlan(baris);
}

function fexSusunPaymentPlan(baris) {
  const NAVY = typeof XL_NAVY !== "undefined" ? XL_NAVY : "FF0A1B33";
  const TEPI = typeof XL_TEPI !== "undefined" ? XL_TEPI : "FFDFE5ED";
  const TINTA = "FF1C2B45";
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();
  const ws = wb.addWorksheet("Payment Plan", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const total = fexTotal(baris);
  const campur = total.length > 1;
  ws.columns = FEX_KOLOM.map((k) => ({ width: fexLebarKolom(k, baris, campur) }));
  const garis = { style: "thin", color: { argb: TEPI } };
  const tepi = { top: garis, left: garis, bottom: garis, right: garis };
  const huruf = (tebal) => ({ name: "Calibri", size: 11, bold: !!tebal, color: { argb: TINTA } });

  const kepala = ws.addRow(FEX_KOLOM.map((k) => k.judul));
  kepala.height = 22;
  kepala.eachCell((sel) => {
    sel.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    sel.alignment = { horizontal: "center", vertical: "middle" };
    sel.border = tepi;
  });
  baris.forEach((b, n) => {
    const row = ws.addRow(FEX_KOLOM.map((k) => {
      const v = k.ambil(b, n);
      if (k.tanggal) return fexTanggalExcel(v);
      if (k.uang || typeof v === "number") return v;
      return v ? String(v) : null;
    }));
    FEX_KOLOM.forEach((k, i) => {
      const sel = row.getCell(i + 1);
      sel.font = huruf(false);
      sel.border = tepi;
      sel.alignment = k.kiri
        ? { horizontal: "left", vertical: "middle", wrapText: false }
        : { horizontal: "center", vertical: "middle", wrapText: !!k.bungkus };
      if (k.uang) sel.numFmt = fexFormatUang(b.mataUang, campur);
      if (k.tanggal) sel.numFmt = "dd-mm-yyyy";
    });
  });

  const akhir = baris.length + 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: akhir, column: FEX_KOLOM.length } };
  if (!baris.length) return wb;
  /* TOTAL langsung di bawah tabel, berbingkai seperti barisnya (contoh
     pengguna): label di kolom Subject, jumlah di kolom Nominal, rata tengah.
     Satu mata uang: SUBTOTAL(109) -- hanya baris yang terlihat, jadi ikut
     menyusut saat tabelnya disaring; hasilnya ikut disimpan supaya
     pratinjau tanpa hitung ulang pun benar. Mata uang campuran: satu baris
     TOTAL per mata uang, angka tetap. */
  const cLabel = FEX_KOLOM.findIndex((k) => k.kiri) + 1;
  const cUang = FEX_KOLOM.findIndex((k) => k.uang) + 1;
  const kolomUang = ws.getColumn(cUang).letter;
  total.forEach(([m, n], i) => {
    const row = ws.getRow(akhir + 1 + i);
    for (let c = 1; c <= cUang; c++) row.getCell(c).border = tepi;
    const label = row.getCell(cLabel);
    label.value = campur ? `TOTAL ${m}` : "TOTAL";
    label.alignment = { horizontal: "left", vertical: "middle" };
    const sel = row.getCell(cUang);
    sel.value = campur ? n : { formula: `SUBTOTAL(109,${kolomUang}2:${kolomUang}${akhir})`, result: n };
    sel.numFmt = fexFormatUang(m, campur);
    sel.alignment = { horizontal: "center", vertical: "middle" };
    [label, sel].forEach((c) => (c.font = huruf(true)));
  });
  return wb;
}

/* Format akuntansi COST: rupiah seperti lembar contohnya; mata uang lain
   (USD) memakai kodenya sendiri supaya tidak terbaca rupiah. */
function fexFormatBiaya(mataUang) {
  if (mataUang === "IDR") return FEX_RP;
  const kode = `"${String(mataUang).replace(/"/g, "")} "`;
  return `_-${kode}* #,##0.00_-;\\-${kode}* #,##0.00_-;_-${kode}* "-"??_-;_-@_-`;
}

/* Satu pengajuan -> 11 sel tabel INVOICE SUMMARY. NO = ROW()-1: tetap urut
   1, 2, 3 ... walau tabelnya diurutkan ulang di Excel (lembar aslinya juga
   memakai rumus ROW). */
function fexInvsumIsi(b, n) {
  if (typeof invsumSel !== "function") throw new Error(tt("Modul Invoice Summary belum dimuat.", "The Invoice Summary module is not loaded."));
  const sel = invsumSel(b.asli || { payload: {} });
  const tgl = (c) => fexTanggalExcel(fexIso(c && c.v));
  const teks = (c) => (c && String(c.v || "").trim()) || null;
  return [
    { formula: "ROW()-1", result: n + 1 },
    tgl(sel[0]), tgl(sel[1]), tgl(sel[2]),
    teks(sel[3]), teks(sel[4]), teks(sel[5]), teks(sel[6]),
    b.nominal,
    teks(sel[8]), teks(sel[9]),
  ];
}

/* Rekap biaya per bulan PAID DATE di kanan tabel, seperti lembar
   contohnya: JAN. sampai DEC. TAHUN PILIHAN dialog + TOTAL(FY<tahun>).
   Rumusnya SUMPRODUCT atas kolom Paid Date (D) & COST (I) tabel, sama
   dengan lembar aslinya -- ditambah syarat tahun, supaya Desember 2026
   tidak tercampur Desember 2027. Bulan tanpa pembayaran = "Rp -".

   MATA UANG: satu baris rekap per mata uang yang DIBAYAR di tahun itu --
   rupiah saja (bawaan) -> satu baris seperti lembar aslinya (M1:Y2);
   rupiah & USD -> baris IDR lalu USD di bawahnya, berlabel kolom
   CURRENCY di kirinya, masing-masing berformat mata uangnya. Tanpa
   pembayaran di tahun itu: satu baris rupiah (atau satu-satunya mata
   uang tabel). `kolomMataUang` = huruf kolom CURRENCY tabel (ada bila
   pengajuannya campuran): rumus tiap baris menjumlah mata uangnya saja. */
function fexInvsumRekap(ws, baris, isi, tahun, kolomTabel, kolomMataUang) {
  const th = Number(tahun) || new Date().getFullYear();
  const akhir = Math.max(baris.length + 1, 2);
  const tglBayar = (j) => isi[j] && isi[j][3];
  const diTahun = (j) => !!tglBayar(j) && tglBayar(j).getUTCFullYear() === th;
  const dibayar = fexUrutMataUang(baris.filter((b, j) => diTahun(j)).map((b) => b.mataUang));
  const tabel = fexUrutMataUang(baris.map((b) => b.mataUang));
  const daftar = dibayar.length ? dibayar : [tabel.length === 1 ? tabel[0] : "IDR"];
  const berlabel = daftar.length > 1;
  const garis = { style: "thin", color: { argb: FEX_INVSUM_TEPI } };
  const tepi = { top: garis, left: garis, bottom: garis, right: garis };
  const kolomAwal = kolomTabel + 2; // satu kolom kosong sebagai jeda
  const cBulan = kolomAwal + (berlabel ? 1 : 0);
  const cTotal = cBulan + FEX_BULAN.length;
  ws.getColumn(kolomAwal - 1).width = 9.14;
  if (berlabel) {
    ws.getColumn(kolomAwal).width = 12.43;
    ws.getCell(1, kolomAwal).value = "CURRENCY";
  }
  FEX_BULAN.forEach((label, i) => {
    ws.getColumn(cBulan + i).width = 17;
    ws.getCell(1, cBulan + i).value = label;
  });
  ws.getColumn(cTotal).width = 18.29;
  ws.getCell(1, cTotal).value = `TOTAL(FY${th})`;
  const syaratMataUang = (m) => (kolomMataUang ? `*($${kolomMataUang}$2:$${kolomMataUang}$${akhir}="${m}")` : "");
  daftar.forEach((m, r) => {
    const row = 2 + r;
    const format = m === "IDR" ? FEX_RP_BULAT : fexFormatBiaya(m);
    if (berlabel) ws.getCell(row, kolomAwal).value = m;
    const perBulan = FEX_BULAN.map((_, i) => fexBulat(baris.reduce((n, b, j) =>
      (b.mataUang === m && diTahun(j) && tglBayar(j).getUTCMonth() === i ? n + (Number(b.nominal) || 0) : n), 0), m));
    perBulan.forEach((jumlah, i) => {
      const sel = ws.getCell(row, cBulan + i);
      sel.value = { formula: `SUMPRODUCT((YEAR($D$2:$D$${akhir})=${th})*(MONTH($D$2:$D$${akhir})=${i + 1})${syaratMataUang(m)}*($I$2:$I$${akhir}))`, result: jumlah };
      sel.numFmt = format;
    });
    const total = ws.getCell(row, cTotal);
    total.value = { formula: `SUM(${ws.getColumn(cBulan).letter}${row}:${ws.getColumn(cTotal - 1).letter}${row})`, result: fexBulat(perBulan.reduce((a, b) => a + b, 0), m) };
    total.numFmt = format;
  });
  for (let c = kolomAwal; c <= cTotal; c++) {
    for (let r = 1; r <= 1 + daftar.length; r++) {
      const sel = ws.getCell(r, c);
      sel.border = tepi;
      sel.alignment = { horizontal: "center", vertical: "middle" };
      sel.font = { name: "Calibri", size: 11 };
    }
  }
}

/* INVOICE SUMMARY -- format lembar akunting (contoh pengguna INVOICE_SUMMARY.xlsx):
   - lembar "INVOICE SUMMARY": tabel Excel "Table1" (gaya TableStyleLight11,
     baris berselang, tombol saring) berkolom A-K persis lembar itu; judul
     biru tua 002060 huruf putih tebal; semua sel rata tengah & bergaris
     tipis abu-abu; tanggal "mmm-dd" (Sep-25); INVOICE NUMBER teks &
     dibungkus; DETAILS = barang kiriman satu per baris dalam satu sel, rata
     kiri-atas; COST format akuntansi Rp (USD -> kodenya);
     mata uang campuran -> kolom CURRENCY di ujung tabel;
   - nomor invoice kembar ditandai merah (seperti "Duplicate Values" lembar
     aslinya);
   - kolom EXPENSES CATEGORY & TRANSPORT MODE bertombol pilihan dari lembar
     "CATEGORY" (nama EXPENSES_CATEGORY / TRANSPORT_MODE);
   - rekap biaya per bulan Paid Date di kanan tabel, Jan.-Dec. tahun
     pilihan dialog (fexInvsumRekap). */
function fexSusunInvoiceSummary(baris, opsi) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();
  // Tanpa kepala dibekukan, seperti lembar aslinya: judul tabel Excel menggantikan huruf kolom saat digulir
  const ws = wb.addWorksheet("INVOICE SUMMARY", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const kat = wb.addWorksheet("CATEGORY");
  const isi = baris.map((b, n) => fexInvsumIsi(b, n));
  // Mata uang campuran: kolom CURRENCY di ujung tabel (lihat FEX_INVSUM_MATA_UANG)
  const campur = fexUrutMataUang(baris.map((b) => b.mataUang)).length > 1;
  const kolom = campur ? FEX_INVSUM_KOLOM.concat([FEX_INVSUM_MATA_UANG]) : FEX_INVSUM_KOLOM;
  kolom.forEach((k, i) => (ws.getColumn(i + 1).width = k.lebar));
  ws.addTable({
    name: "Table1",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleLight11", showRowStripes: true },
    columns: kolom.map((k) => ({ name: k.judul, filterButton: true })),
    rows: isi.map((r, n) => (campur ? r.concat([baris[n].mataUang]) : r)),
  });
  const garis = { style: "thin", color: { argb: FEX_INVSUM_TEPI } };
  const tepi = { top: garis, left: garis, bottom: garis, right: garis };
  kolom.forEach((k, i) => {
    const kepala = ws.getCell(1, i + 1);
    kepala.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    kepala.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FEX_INVSUM_NAVY } };
    kepala.alignment = { horizontal: "center", vertical: "middle", wrapText: !!k.bungkus };
    kepala.border = tepi;
    baris.forEach((b, n) => {
      const sel = ws.getCell(n + 2, i + 1);
      sel.font = { name: "Calibri", size: 11 };
      sel.border = tepi;
      sel.alignment = k.kiriAtas
        ? { horizontal: "left", vertical: "top", wrapText: true }
        : { horizontal: "center", vertical: "middle", wrapText: !!k.bungkus };
      if (k.tanggal) sel.numFmt = "mmm\\-dd";
      if (k.teks) sel.numFmt = "@";
      if (k.uang) sel.numFmt = fexFormatBiaya(b.mataUang);
      if (k.daftar) sel.dataValidation = { type: "list", allowBlank: true, showErrorMessage: true, formulae: [k.daftar] };
    });
  });
  const akhir = baris.length + 1;
  if (baris.length) {
    // Nomor invoice kembar: merah muda berhuruf merah tua ("Light Red Fill with Dark Red Text")
    ws.addConditionalFormatting({
      ref: `E2:E${akhir}`,
      rules: [{
        type: "expression",
        priority: 1,
        formulae: [`AND(E2<>"",COUNTIF($E$2:$E$${akhir},E2)>1)`],
        style: { font: { color: { argb: "FF9C0006" } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } },
      }],
    });
  }
  fexInvsumRekap(ws, baris, isi, (opsi && opsi.tahun) || new Date().getFullYear(), kolom.length, campur ? ws.getColumn(kolom.length).letter : "");
  /* Cetak tabelnya saja, tanpa rekap. ExcelJS menulis "$" + teks ini, jadi
     "A$1" menjadi $A$1 (acuan mutlak, bentuk yang ditulis Excel sendiri). */
  ws.pageSetup.printArea = `A$1:${ws.getColumn(kolom.length).letter}$${akhir}`;

  // Lembar CATEGORY: sumber tombol pilihan kolom J & K
  FEX_INVSUM_DAFTAR.forEach(([judul, nama, daftar], i) => {
    const c = i + 1;
    kat.getColumn(c).width = i ? 18.14 : 28.29;
    const kepala = kat.getCell(1, c);
    kepala.value = judul;
    kepala.font = { name: "Calibri", size: 11, color: { argb: "FFFFFFFF" } };
    kepala.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i ? "FF0B2261" : FEX_INVSUM_NAVY } };
    kepala.alignment = { horizontal: "center", vertical: "middle" };
    daftar.forEach((v, j) => {
      const sel = kat.getCell(j + 2, c);
      sel.value = v;
      sel.alignment = { horizontal: "center", vertical: "middle" };
    });
    const huruf = kat.getColumn(c).letter;
    wb.definedNames.add(`CATEGORY!$${huruf}$2:$${huruf}$${daftar.length + 1}`, nama);
  });
  return wb;
}

// Diunduh lewat tautan sementara (sama dengan Bulk Export / laporan); dipisah supaya bisa diganti di uji
function fexSimpanBerkas(blob, nama) {
  const tautan = document.createElement("a");
  tautan.href = URL.createObjectURL(blob);
  tautan.download = nama;
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
}

async function fexUnduh(baris, nama, format, opsi) {
  await ensureExcelJS(); // pustaka Excel diunduh saat dibutuhkan saja
  const buf = await fexSusunWorkbook(baris, format, opsi).xlsx.writeBuffer();
  fexSimpanBerkas(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nama);
}

/* ---------------------------- dialog ----------------------------- */

let fexSemua = null;   // seluruh Pengajuan Dana (baris ekspor), dimuat tiap dialog dibuka
let fexGalat = null;   // galat muat terakhir
let fexMuatKe = 0;     // penanda muatan: jawaban yang terlambat dibuang
let fexPemilih = null; // pemilih rentang tanggal di dialog
let fexModal = null;
let fexSibuk = false;

const fexDialog = () => document.getElementById("danaEksporModal");
const fexHasil = () => (fexSemua ? fexUrut(fexSaring(fexSemua, fexSaringan), fexSaringan.dasar) : []);
const fexTahun = () => fexTahunPilih || fexTahunOtomatis(fexHasil(), fexSaringan);
const fexTeksTotal = (baris) => fexTotal(baris).map(([m, n]) => escapeHtml(typeof frNilai === "function" ? frNilai(n, m) : `${m} ${n}`)).join(" + ");

// Kalimat pembuka dialog: kolom berkas menurut format yang dipilih
function fexTeksKolom() {
  const format = fexFormatSah(fexFormatPilih);
  const kolom = FEX_FORMAT[format].kolom().join(", ");
  const tambahan = format === "invoiceSummary"
    ? tt(" Ada USD di antaranya: ditambah kolom CURRENCY.", " If some are in USD, a CURRENCY column is added.")
    : "";
  return tt(`Pilih pengajuan yang diekspor. Kolom: ${kolom}.`, `Choose the requests to export. Columns: ${kolom}.`) + tambahan;
}

function fexIsiDialogHtml() {
  const f = fexSaringan;
  const denganTahun = fexFormatSah(fexFormatPilih) === "invoiceSummary";
  const bayar = [["", tt("Semua", "All")], ["lunas", tt("Lunas", "Paid")], ["belum", tt("Belum Lunas", "Unpaid")]];
  return `
    <div class="dialog-head">
      <div class="dialog-icon" aria-hidden="true"><i class="bi bi-file-earmark-spreadsheet"></i></div>
      <h6 class="dialog-title" id="danaEksporJudul">${escapeHtml(tt("Export Excel Pengajuan Dana", "Export Fund Requests to Excel"))}</h6>
      <button type="button" class="dialog-tutup" data-bs-dismiss="modal" aria-label="${escapeAttr(tt("Tutup", "Close"))}" title="${escapeAttr(tt("Tutup (Esc)", "Close (Esc)"))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
    </div>
    <div class="modal-body dialog-body">
      <p class="dialog-text" id="fexKolomTeks">${escapeHtml(fexTeksKolom())}</p>
      <div class="fex-saring">
        <div class="fex-format-baris">
          <div class="prompt-field fex-bidang-format">
            <label class="prompt-label" for="fexFormat">Format</label>
            <select class="login-input" id="fexFormat" data-fex="format">${Object.keys(FEX_FORMAT)
              .map((k) => `<option value="${k}"${k === fexFormatPilih ? " selected" : ""}>${escapeHtml(FEX_FORMAT[k].label)}</option>`)
              .join("")}</select>
          </div>
          <div class="prompt-field fex-bidang-tahun${denganTahun ? "" : " d-none"}">
            <label class="prompt-label" for="fexTahun">${escapeHtml(tt("Tahun rekap", "Recap year"))}</label>
            <select class="login-input fex-tahun" id="fexTahun" data-fex="tahun"></select>
          </div>
          <div class="prompt-hint fex-petunjuk-tahun${denganTahun ? "" : " d-none"}">${escapeHtml(tt(
            "Rekap total per bulan (Januari–Desember) di kanan tabel, menurut Paid Date — seperti lembar INVOICE SUMMARY. Ada USD: rekap Rupiah & USD dipisah.",
            "Monthly totals (January–December) to the right of the table, by Paid Date — as in the INVOICE SUMMARY sheet. With USD: separate Rupiah & USD recaps."))}</div>
        </div>
        <div class="prompt-field">
          <span class="prompt-label" id="fexLabelBayar">${escapeHtml(tt("Status bayar", "Payment status"))}</span>
          <div class="fex-seg" role="radiogroup" aria-labelledby="fexLabelBayar">${bayar
            .map(([v, teks]) => `<label class="fex-seg-pilih"><input type="radio" name="fexBayar" value="${v}"${f.bayar === v ? " checked" : ""}><span>${escapeHtml(teks)}</span></label>`)
            .join("")}</div>
        </div>
        <div class="prompt-field">
          <label class="prompt-label" for="fexVendor">Vendor</label>
          <select class="login-input" id="fexVendor" data-fex="vendor"></select>
        </div>
        <div class="prompt-field">
          <span class="prompt-label" id="fexLabelTanggal">${escapeHtml(tt("Rentang tanggal", "Date range"))}</span>
          <div class="fex-tanggal" role="group" aria-labelledby="fexLabelTanggal">
            <select class="login-input fex-dasar" id="fexDasar" data-fex="dasar" aria-label="${escapeAttr(tt("Rentang tanggal menurut", "Date range by"))}">
              <option value="invoice"${f.dasar === "invoice" ? " selected" : ""}>${escapeHtml(tt("Tanggal Invoice", "Invoice Date"))}</option>
              <option value="jatuhTempo"${f.dasar === "jatuhTempo" ? " selected" : ""}>${escapeHtml(tt("Jatuh Tempo Invoice", "Invoice Due Date"))}</option>
            </select>
            <div class="fex-rentang" id="fexRentang"></div>
          </div>
        </div>
      </div>
      <div class="fex-pratinjau" id="fexPratinjau" aria-live="polite"></div>
    </div>
    <div class="modal-footer dialog-foot">
      <button type="button" class="btn-quiet fex-reset" data-fex-reset><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
      <button type="button" class="btn-quiet" data-bs-dismiss="modal">${escapeHtml(tt("Batal", "Cancel"))}</button>
      <button type="button" class="btn-primary-navy fex-unduh" id="danaEksporUnduh" data-fex-unduh disabled><i class="bi bi-download"></i> ${escapeHtml(tt("Unduh Excel", "Download Excel"))}</button>
    </div>`;
}

// Pilihan tahun rekap: dari seluruh Pengajuan Dana; yang terpilih = fexTahun()
function fexIsiTahun() {
  const sel = document.getElementById("fexTahun");
  if (!sel) return;
  const aktif = fexTahun();
  const daftar = fexDaftarTahun(fexSemua, aktif);
  if (fexTahunPilih && !daftar.includes(fexTahunPilih)) fexTahunPilih = "";
  sel.innerHTML = daftar.map((th) => `<option value="${th}"${th === aktif ? " selected" : ""}>${th}</option>`).join("");
  sel.disabled = !fexSemua;
}

// Pilihan vendor dari seluruh Pengajuan Dana (bukan yang sudah tersaring: memilih satu tidak menghilangkan yang lain)
function fexIsiVendor() {
  const sel = document.getElementById("fexVendor");
  if (!sel) return;
  const daftar = fexSemua ? fexDaftarVendor(fexSemua) : [];
  if (fexSaringan.vendor && !daftar.some((v) => v.kunci === fexSaringan.vendor)) fexSaringan.vendor = "";
  sel.innerHTML = `<option value="">${escapeHtml(tt("Semua vendor", "All vendors"))}</option>` +
    daftar.map((v) => `<option value="${escapeAttr(v.kunci)}"${v.kunci === fexSaringan.vendor ? " selected" : ""}>${escapeHtml(v.nama)} (${v.jumlah})</option>`).join("");
  sel.disabled = !fexSemua;
}

function fexGambarPratinjau() {
  const box = document.getElementById("fexPratinjau");
  const tombol = document.querySelector("[data-fex-unduh]");
  if (!box) return;
  const hasil = fexHasil();
  if (tombol && !fexSibuk) tombol.disabled = !hasil.length;
  if (fexGalat) {
    box.innerHTML = `<div class="fex-pesan fex-pesan--galat"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(tt("Data Pengajuan Dana gagal dimuat.", "The fund requests could not be loaded."))}
      <button type="button" class="btn-quiet fex-ulang" data-fex-ulang>${escapeHtml(tt("Coba lagi", "Try again"))}</button></div>`;
    return;
  }
  if (!fexSemua) {
    box.innerHTML = `<div class="fex-pesan"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${escapeHtml(tt("Memuat Pengajuan Dana…", "Loading fund requests…"))}</div>`;
    return;
  }
  if (!hasil.length) {
    box.innerHTML = `<div class="fex-pesan"><i class="bi bi-inbox"></i> ${escapeHtml(tt("Tidak ada pengajuan yang cocok dengan saringan ini.", "No requests match these filters."))}</div>`;
    return;
  }
  const jatuh = fexSaringan.dasar === "jatuhTempo";
  /* Tiga kolom: No. Invoice di bawah nama vendor (bukan kolom sendiri) --
     tabelnya tetap muat di ponsel 360px tanpa menggeser Nominal keluar. */
  const contoh = hasil.slice(0, FEX_PRATINJAU).map((b) => `
    <tr>
      <td class="fex-vendor">${escapeHtml(b.vendor || "—")}${b.nomor ? `<span class="fex-nomor">${escapeHtml(b.nomor)}</span>` : ""}</td>
      <td class="fex-nowrap">${escapeHtml(fmtDate(jatuh ? b.jatuhTempo : b.tglInvoice) || "—")}</td>
      <td class="fex-angka">${escapeHtml(typeof frNilai === "function" ? frNilai(b.nominal, b.mataUang) : String(b.nominal))}</td>
    </tr>`).join("");
  const sisa = hasil.length - FEX_PRATINJAU;
  box.innerHTML = `
    <div class="fex-ringkas">${tt(
      `<b>${hasil.length}</b> pengajuan · Total <b>${fexTeksTotal(hasil)}</b>`,
      `<b>${hasil.length}</b> request${hasil.length === 1 ? "" : "s"} · Total <b>${fexTeksTotal(hasil)}</b>`)}</div>
    <table class="fex-tabel">
      <thead><tr><th>Vendor · Invoice No.</th><th>${escapeHtml(jatuh ? "Invoice Due Date" : "Invoice Date")}</th><th class="fex-angka">Nominal</th></tr></thead>
      <tbody>${contoh}</tbody>
    </table>
    ${sisa > 0 ? `<div class="fex-lagi">${escapeHtml(tt(`… dan ${sisa} pengajuan lainnya`, `… and ${sisa} more`))}</div>` : ""}`;
}

// Isi dialog digambar ulang tiap dibuka (bahasa saat itu) & saat Reset; data yang sudah dimuat dipakai lagi
function fexGambarDialog() {
  const el = fexDialog();
  const konten = el && el.querySelector(".modal-content");
  if (!konten) return;
  if (fexPemilih) fexPemilih.lepas();
  konten.innerHTML = fexIsiDialogHtml();
  fexPemilih = typeof buatRentangTanggal === "function"
    ? buatRentangTanggal(document.getElementById("fexRentang"), {
        pintas: [
          { label: () => t("u.minggu.ini"), rentang: RENTANG_PINTAS.mingguIni },
          { label: () => t("u.bulan.ini"), rentang: RENTANG_PINTAS.bulanIni },
          { label: () => t("u.bulan.lalu"), rentang: RENTANG_PINTAS.bulanLalu },
          // Jatuh tempo bulan depan: tagihan yang sebentar lagi harus dibayar
          { label: () => tt("Bulan Depan", "Next Month"), rentang: () => {
            const kini = new Date();
            return [drpIsoOf(kini.getFullYear(), kini.getMonth() + 1, 1), drpIsoOf(kini.getFullYear(), kini.getMonth() + 2, 0)];
          } },
          { label: () => t("u.tahun.ini"), rentang: RENTANG_PINTAS.tahunIni },
        ],
        awal: [fexSaringan.dari, fexSaringan.sampai],
        onApply: (a, b) => {
          fexSaringan.dari = a;
          fexSaringan.sampai = b;
          fexTahunPilih = ""; // tahun rekap ikut rentang yang baru
          fexIsiTahun();
          fexGambarPratinjau();
        },
      })
    : null;
  fexIsiVendor();
  fexIsiTahun();
  fexGambarPratinjau();
}

async function fexMuat() {
  const ke = ++fexMuatKe;
  fexSemua = null;
  fexGalat = null;
  fexIsiVendor();
  fexIsiTahun();
  fexGambarPratinjau();
  try {
    const baris = (await fexAmbilSemua()).map(fexBaris);
    if (ke !== fexMuatKe) return;
    fexSemua = baris;
  } catch (e) {
    console.error(e);
    if (ke !== fexMuatKe) return;
    fexGalat = e;
  }
  fexIsiVendor();
  fexIsiTahun();
  fexGambarPratinjau();
}

function fexBuka() {
  const el = fexDialog();
  if (!el || typeof bootstrap === "undefined") return;
  fexModal = fexModal || bootstrap.Modal.getOrCreateInstance(el);
  fexGambarDialog();
  fexModal.show();
  return fexMuat();
}

async function fexKlikUnduh() {
  const hasil = fexHasil();
  const tombol = document.querySelector("[data-fex-unduh]");
  if (!hasil.length || fexSibuk || !tombol) return;
  fexSibuk = true;
  const isiAsli = tombol.innerHTML;
  tombol.disabled = true;
  tombol.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${escapeHtml(tt("Menyiapkan…", "Preparing…"))}`;
  try {
    const format = fexFormatSah(fexFormatPilih);
    const label = FEX_FORMAT[format].label;
    await fexUnduh(hasil, fexNamaBerkas(fexSaringan, fexDaftarVendor(fexSemua), undefined, format), format, { tahun: Number(fexTahun()) });
    if (fexModal) fexModal.hide();
    showToast(tt(`Excel ${label} diunduh: ${hasil.length} pengajuan.`, `${label} Excel downloaded: ${hasil.length} request${hasil.length === 1 ? "" : "s"}.`), "success");
  } catch (e) {
    console.error(e);
    // Sebabnya disebut -- satu-satunya petunjuk untuk yang memperbaikinya
    showToast(tt(`Excel gagal dibuat: ${(e && e.message) || "kesalahan tidak diketahui"}`, `The Excel file could not be created: ${(e && e.message) || "unknown error"}`), "danger");
  } finally {
    fexSibuk = false;
    if (tombol.isConnected) {
      tombol.innerHTML = isiAsli;
      tombol.disabled = !fexHasil().length;
    }
  }
}

/* Pendengar sekali untuk seluruh dialog -- isinya digambar ulang terus */
document.addEventListener("click", (e) => {
  const el = e.target && e.target.closest ? e.target : null;
  if (!el) return;
  if (el.closest("#btnDnEkspor")) {
    fexBuka();
    return;
  }
  if (!el.closest("#danaEksporModal")) return;
  if (el.closest("[data-fex-unduh]")) fexKlikUnduh();
  else if (el.closest("[data-fex-ulang]")) fexMuat();
  else if (el.closest("[data-fex-reset]")) {
    // Reset = saringan (dan tahun rekap kembali otomatis); format yang dipilih tetap
    Object.assign(fexSaringan, FEX_SARINGAN_AWAL);
    fexTahunPilih = "";
    fexGambarDialog();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (!el || !el.closest || !el.closest("#danaEksporModal")) return;
  if (el.dataset.fex === "format") {
    fexFormatPilih = fexFormatSah(el.value);
    const teks = document.getElementById("fexKolomTeks");
    if (teks) teks.textContent = fexTeksKolom();
    // Tahun rekap & petunjuknya hanya untuk Invoice Summary
    document.querySelectorAll("#danaEksporModal :is(.fex-bidang-tahun, .fex-petunjuk-tahun)").forEach((x) => x.classList.toggle("d-none", fexFormatPilih !== "invoiceSummary"));
    fexIsiTahun();
    fexGambarPratinjau();
    return;
  }
  if (el.dataset.fex === "tahun") {
    fexTahunPilih = el.value;
    return;
  }
  if (el.name === "fexBayar") fexSaringan.bayar = el.value;
  else if (el.dataset.fex === "vendor") fexSaringan.vendor = el.value;
  else if (el.dataset.fex === "dasar") fexSaringan.dasar = el.value === "jatuhTempo" ? "jatuhTempo" : "invoice";
  else return;
  fexIsiTahun(); // tahun otomatis bisa bergeser bersama baris yang tersaring
  fexGambarPratinjau();
});
/* Esc saat kalender rentang terbuka menutup KALENDERNYA saja, bukan
   seluruh dialog: ditangkap lebih dulu (fase capture) dari pendengar
   Bootstrap di elemen dialog yang sama. */
(() => {
  const el = fexDialog();
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const pemicu = el.querySelector('#fexRentang [data-rt="pemicu"][aria-expanded="true"]');
    if (!pemicu) return;
    e.stopPropagation();
    e.preventDefault();
    pemicu.click();
  }, true);
})();
