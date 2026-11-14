"use strict";

/* KEBIJAKAN KONTEN (Content-Security-Policy). Lapis kedua melawan XSS:
   walau suatu hari ada teks yang lolos tanpa di-escape, skrip yang
   disisipkan (tag skrip, atribut onerror, tautan javascript) TIDAK
   dijalankan -- hanya berkas dari asal di bawah. Sesi login Supabase
   tersimpan di localStorage, jadi XSS = akun diambil alih; ini penahannya.
   Tidak ada skrip / penangan sebaris di aplikasi ini; jangan
   menambahkannya. Pustaka CDN diizinkan per PAKET & VERSI, bukan seluruh
   jsDelivr (yang memuat paket npm siapa saja). Menaikkan versi pustaka,
   mengganti proyek Supabase (SUPABASE_URL di config.js), atau lembar kurs
   (kurs.js) = perbarui daftar di sini. 'wasm-unsafe-eval' = WebAssembly
   pdf.js & Tesseract (OCR).

   KENAPA DIPASANG DARI SKRIP INI, BUKAN <meta> YANG DITULIS DI index.html:
   tag <meta http-equiv="Content-Security-Policy"> di dalam HTML mematikan
   pemindai pramuat (preload scanner) Chrome. ±130 skrip di ujung halaman
   lalu diunduh SATU PER SATU -- masing-masing baru diminta sesudah yang
   sebelumnya tiba -- dan halaman login, tombol Masuk, serta muat ulang
   sesudah Keluar jadi 4–9 detik (diukur pada jaringan 10 Mbps / 40 ms:
   DOMContentLoaded 8,5 detik dengan meta, 1,9 detik tanpa). Kebijakan
   yang SAMA, dipasang lewat DOM oleh berkas pertama di <head>, berlaku
   sama ketatnya (diuji: penangan sebaris, skrip sebaris, serta skrip &
   fetch ke asal asing tetap ditolak) tanpa memperlambat apa pun. GitHub
   Pages tidak bisa mengirimnya sebagai header HTTP. */
const CSP_KEBIJAKAN = [
  ["default-src", "'self'"],
  [
    "script-src",
    "'self' 'wasm-unsafe-eval'",
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/",
    "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/",
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/",
    "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/",
    "https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/",
    "https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/",
    "https://cdn.sheetjs.com/xlsx-0.20.3/",
    "https://docs.google.com/spreadsheets/d/1SpMXDVeQnG3z9VCBAAqV6s3vzN8slssA3eN3hqUYSaQ/",
  ],
  ["style-src", "'self' 'unsafe-inline'", "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/", "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/"],
  ["font-src", "'self' data:", "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/"],
  ["img-src", "'self' data: blob:", "https://nigxxpzgunibuotluapv.supabase.co"],
  [
    "connect-src",
    "'self' blob: data:",
    "https://nigxxpzgunibuotluapv.supabase.co",
    "wss://nigxxpzgunibuotluapv.supabase.co",
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/",
    "https://cdn.jsdelivr.net/npm/@tesseract.js-data/",
    "https://docs.google.com/spreadsheets/d/1SpMXDVeQnG3z9VCBAAqV6s3vzN8slssA3eN3hqUYSaQ/",
  ],
  ["worker-src", "'self' blob:"],
  ["frame-src", "'self' blob: data:"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
]
  .map((d) => d.join(" "))
  .join("; ");

(function () {
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = CSP_KEBIJAKAN;
  document.head.appendChild(meta);
})();
