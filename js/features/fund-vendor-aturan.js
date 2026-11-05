"use strict";

/* ------------------------------------------------------------------
   ATURAN PER VENDOR DI PENGAJUAN DANA

   Dua kebiasaan vendor yang memengaruhi form dan angkanya. Tabelnya
   (FUND_VENDOR_ATURAN) TETAP di kode, bukan daftar yang diatur dari layar
   seperti Aturan Doc No: PPN per item ikut menentukan TOTAL pengajuan,
   termasuk yang sudah tersimpan, dan mengubahnya lewat kotak pengaturan
   akan mengubah angka surat lama tanpa ada yang melihatnya. Vendor baru =
   satu baris di tabel ini.

   Vendor dikenali dari nama "Dibayarkan Kepada" PER KATA, dengan pencocok
   yang sama dengan Aturan Doc No (fundDocNoKata / fundDocNoCocok):
   "PT WIDE LOGISTICS" kena WIDE, "DHL WORLDWIDE EXPRESS" tidak.

   1. PPN PER ITEM (ppnDesimal)
      Tiap vendor menulis PPN per baris invoice-nya dengan caranya sendiri,
      dan aplikasi meniru vendornya supaya jumlah PPN di form sama dengan
      invoice:
        - PRIME menulis PPN per baris sampai 2 desimal (9,16 ; 22.571,40);
          ppnDesimal: true.
        - WIDE -- dan vendor lain yang tidak ada di tabel -- menulis PPN
          per baris dalam RUPIAH PENUH, dibulatkan ke rupiah terdekat per
          baris (14.206,632 -> 14.207). Jumlah PPN WIDE di invoicenya persis
          jumlah angka-angka bulat itu.
      Hanya untuk IDR (fundPpnSen, fund-lines.js): mata uang lain tetap
      sampai sen. TOTAL pengajuan tetap dibulatkan ke rupiah penuh untuk
      semua vendor (fundLineTotals).

   2. NOMOR INVOICE BAWAAN (noInvoice)
      WIDE menomori invoicenya IN-WL<YYMM>-<5 angka urut>, mis.
      IN-WL2609-00159 = invoice ke-159 bulan September 2026. Kotak No.
      Invoice diisi IN-WL2609-00000 begitu vendornya WIDE: tahun dan bulan
      diambil dari TANGGAL INVOICE, nomor urutnya tinggal diganti. Aturan
      isinya sama dengan Rincian bawaan (fund-rincian.js): hanya selama
      kotaknya kosong atau masih sama dengan bawaan yang terakhir diisikan
      (data-auto-fill) -- begitu diketik atau diimpor dari PDF, tidak pernah
      ditimpa lagi. validateDocNumForm menolak simpan selama kotaknya masih
      bawaan, supaya "00000" tidak ikut tercetak sebagai nomor invoice.
------------------------------------------------------------------ */
const FUND_VENDOR_ATURAN = [
  { vendor: "PRIME", ppnDesimal: true },
  { vendor: "WIDE", noInvoice: { awalan: "IN-WL", urut: "00000" } },
];

/* Aturan vendor untuk nama ini: entri PERTAMA di tabel yang namanya muncul
   sebagai kata utuh; null kalau tidak ada (atau namanya kosong). */
function fundVendorAturan(payee) {
  const kata = fundDocNoKata(payee);
  if (!kata.length) return null;
  return FUND_VENDOR_ATURAN.find((a) => fundDocNoCocok(kata, fundDocNoKata(a.vendor))) || null;
}

// PPN per item vendor ini ditulis sampai 2 desimal (PRIME)?
const fundVendorPpnDesimal = (payee) => !!(fundVendorAturan(payee) || {}).ppnDesimal;

/* Nomor invoice bawaan vendor ini untuk tanggal invoice itu ("2026-09-30"),
   atau "" kalau vendornya tidak punya. Tanggal kosong / tidak terbaca ->
   bulan ini: kotak tetap berisi nomor yang masuk akal sambil menunggu
   tanggalnya diisi, dan berganti sendiri begitu tanggal itu ada. */
function fundNoInvoiceBawaan(payee, tanggal) {
  const pola = (fundVendorAturan(payee) || {}).noInvoice;
  if (!pola) return "";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(tanggal == null ? "" : tanggal).trim());
  const iso = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? m[0] : typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10);
  return `${pola.awalan}${iso.slice(2, 4)}${iso.slice(5, 7)}-${pola.urut}`;
}

/* Kotak No. Invoice masih berisi bawaan yang tadi diisikan, belum diganti? */
const fundNoInvoiceMasihBawaan = (kotak) => !!kotak && !!kotak.dataset.autoFill && kotak.value.trim() === kotak.dataset.autoFill;

/* Keterangan di bawah kotak No. Invoice: tampil selama isinya masih bawaan.
   Dipanggil juga saat form dikosongkan / dibuka / dipulihkan
   (syncDocNumConditional), yang TIDAK boleh mengisi kotaknya -- membuka
   pengajuan tersimpan yang belum bernomor invoice tidak boleh menambahkan
   nomor yang tidak pernah ada di sana. */
function fundNoInvoiceKeterangan(panel) {
  const ket = panel && panel.querySelector ? panel.querySelector("#dn-fund-invoiceNo-bawaan") : null;
  if (!ket) return;
  ket.hidden = !fundNoInvoiceMasihBawaan(panel.querySelector('[data-dn="invoiceNo"]'));
}

/* Vendor atau Tanggal Invoice berubah -> kotak No. Invoice mengikuti,
   selama masih milik aplikasi (kosong atau bawaan terakhir). Tidak
   dijalankan saat mengubah pengajuan tersimpan: bawaan hanya untuk
   pengajuan baru. */
function fundSelaraskanNoInvoice(panel) {
  if (!panel || !panel.matches || !panel.matches('[data-docnum-panel="fund"]')) return;
  const kotak = panel.querySelector('[data-dn="invoiceNo"]');
  if (!kotak) return;
  const baca = (k) => String((panel.querySelector(`[data-dn="${k}"]`) || {}).value || "").trim();
  const sedangUbah = typeof dnEditingId !== "undefined" && !!dnEditingId;
  const sekarang = kotak.value.trim();
  // Kotak yang disembunyikan (Billing) tidak disentuh
  if (!kotak.disabled && !sedangUbah && (!sekarang || sekarang === (kotak.dataset.autoFill || ""))) {
    const bawaan = fundNoInvoiceBawaan(baca("payee"), baca("invoiceDate"));
    if (bawaan) kotak.dataset.autoFill = bawaan;
    else delete kotak.dataset.autoFill;
    if (bawaan !== sekarang) {
      kotak.value = bawaan;
      // Diubah lewat kode, bukan diketik: yang biasanya mendengar ketikan disusul sendiri
      if (typeof perbaruiJudulKelompok === "function") perbaruiJudulKelompok();
      if (typeof dnPeriksaTagihanGandaLangsung === "function") dnPeriksaTagihanGandaLangsung(panel, true);
    }
  }
  fundNoInvoiceKeterangan(panel);
}

["input", "change"].forEach((jenis) =>
  document.addEventListener(jenis, (e) => {
    if (!e.target.closest) return;
    const el = e.target.closest('[data-docnum-panel="fund"] [data-dn="payee"], [data-docnum-panel="fund"] [data-dn="invoiceDate"]');
    if (el) return fundSelaraskanNoInvoice(el.closest("[data-docnum-panel]"));
    /* Nomornya diketik / dihapus: keterangan "nomor bawaan" ikut hilang
       (atau kembali, kalau yang diketik persis sama dengan bawaannya). */
    const nomor = e.target.closest('[data-docnum-panel="fund"] [data-dn="invoiceNo"]');
    if (nomor) fundNoInvoiceKeterangan(nomor.closest("[data-docnum-panel]"));
  }),
);
