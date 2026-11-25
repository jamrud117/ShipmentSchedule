"use strict";

/* ==================================================================
   MODUL TUNDA -- skrip halaman & fitur yang tidak dibutuhkan untuk
   menggambar papan jadwal pertama kali.

   Dulu SEMUA skrip (±3,5 MB, 135 berkas) diurai sebelum aplikasi bisa
   memulai apa pun -- termasuk mengambil jadwal dari Supabase. Sekarang
   index.html hanya memuat INTI (papan jadwal, kartu, form, prediksi,
   Ringkasan, HS Code, sesi); modul di bawah ini (±1,8 MB: Cek PIB/PEB +
   mesin EXIM, Nomor Dokumen & Pengajuan Dana, cetak CIPL / surat,
   Masterlist, Akun, pembaca dokumen impor) dimuat initApp() SEJAK AWAL
   di latar, bersamaan dengan pengambilan jadwal -- penguraiannya
   berjalan selama menunggu jawaban server, bukan sebelumnya.

   URUTAN DI DAFTAR = urutan aslinya di index.html (async = false:
   dijalankan berurutan). Aturan yang dijaga tes:
     - kode INTI tidak boleh merujuk nama modul tunda di tingkat atas,
       dan pemanggilan di dalam fungsi harus dijaga (typeof ... ===
       "function") atau menunggu muatModulTunda();
     - halaman yang memakainya (MODUL_TUNDA_HALAMAN) menunggu di router()
       sampai modulnya siap.
   Berkas js BARU: masukkan ke index.html (inti) ATAU ke daftar ini.
================================================================== */
const MODUL_TUNDA = [
  "js/import/exim-engine.js",
  "js/import/pdf-coords.js",
  "js/import/cipl-common.js",
  "js/import/data-pabean-baca.js",
  "js/import/pdf-cipl.js",
  "js/import/excel-cipl.js",
  "js/import/apply-to-form.js",
  "js/import/pdf.js",
  "js/import/pdf-peb.js",
  "js/import/ocr.js",
  "js/import/dispatch.js",
  "js/features/surat-jalan-lokal-print.js",
  "js/features/surat-jalan-print.js",
  "js/features/fund-docno.js",
  "js/features/fund-vendor-aturan.js",
  "js/features/fund-lines.js",
  "js/features/fund-invoice-sama.js",
  "js/features/do-lines.js",
  "js/features/fund-request-print.js",
  "js/features/cipl-tata.js",
  "js/features/cipl-vn-print.js",
  "js/features/cipl-print.js",
  "js/features/cipl-excel.js",
  "js/features/name-plate.js",
  "js/features/format-nomor.js",
  "js/views/docnum-view.js",
  "js/features/docnum-detail.js",
  "js/views/name-plate-view.js",
  "js/features/invoice-pihak.js",
  "js/features/fund-summary.js",
  "js/features/fund-report-ledger.js",
  "js/features/fund-report-blok.js",
  "js/features/fund-report.js",
  "js/features/fund-invoice-import.js",
  "js/features/fund-vendor.js",
  "js/features/fund-rincian.js",
  "js/features/fund-saran-awb.js",
  "js/features/fund-invoice-summary.js",
  "js/features/fund-export.js",
  "js/features/surat-bc.js",
  "js/features/surat-bc-word.js",
  "js/views/accounts-view.js",
  "js/views/masterlist-view.js",
  "js/features/masterlist-print.js",
  "js/features/hscode-print.js",
  "js/views/checker-view.js",
  "js/features/cek-cetak-templat.js",
  "js/features/cek-cetak.js",
];
// Halaman yang baru boleh digambar sesudah modul tunda siap (router, form-router.js)
const MODUL_TUNDA_HALAMAN = new Set(["form", "checker", "docnum", "nameplate", "masterlist", "accounts"]);

let modulTundaJanji = null;
/* Sudah termuat? Penanda: fungsi dari berkas TERAKHIR di daftar (dijalankan
   berurutan, jadi semua sebelumnya juga sudah). Juga benar bila modulnya
   dimuat cara lain (rangkaian uji memuat semuanya sekaligus). */
function modulTundaTermuat() {
  return typeof cekCetakDraft === "function";
}

function muatModulTunda() {
  if (modulTundaTermuat()) return Promise.resolve(true);
  if (modulTundaJanji) return modulTundaJanji;
  modulTundaJanji = new Promise((beres, gagal) => {
    let sisa = MODUL_TUNDA.length;
    MODUL_TUNDA.forEach((src) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = false;
      el.onload = () => {
        if (--sisa === 0) beres(true);
      };
      /* Satu berkas gagal (koneksi putus): urutan tidak bisa dipulihkan
         dengan memuat ulang berkas itu saja -- berkas sesudahnya sudah
         jalan. Janjinya ditolak; pemanggil meminta halaman dimuat ulang. */
      el.onerror = () => gagal(new Error(src));
      document.body.appendChild(el);
    });
  });
  return modulTundaJanji;
}
