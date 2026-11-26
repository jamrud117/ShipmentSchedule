/* ==================================================================
   PEKERJA PRA-PROSES OCR (Web Worker -- BUKAN <script> halaman)

   Dibuat oleh js/import/ocr.js (ocrOlahDiPekerja) dengan
   new Worker("js/import/ocr-pekerja-olah.js"). Pembersihan gambar satu
   halaman scan (ocrPraolah: abu-abu, latar, tinta, garis tabel, arah
   halaman, kemiringan, noda) memakan ±1 detik per halaman -- di utas
   halaman itu membekukan layar, padahal review Split Invoice sudah
   terbuka dan diketik selagi halaman berikutnya dibersihkan. Di sini ia
   berjalan di utas sendiri.

   Fungsinya PERSIS fungsi ocr.js (importScripts berkas yang sama -- ocr.js
   hanya berisi deklarasi, tanpa menyentuh halaman saat dimuat), jadi
   hasilnya sama dengan pembersihan di utas halaman. Pesan masuk:
   { id, rgba (ArrayBuffer), w, h }; keluar: { id, pra, gambar } atau
   { id, galat }. Buffer gambar dipindahkan (transfer), tidak disalin.
================================================================== */
self.importScripts("ocr.js");

self.onmessage = (e) => {
  const { id, rgba, w, h } = e.data || {};
  try {
    const pra = ocrPraolah(new Uint8ClampedArray(rgba), w, h);
    const gambar = ocrBwKePbm(pra.bw, pra.w, pra.h);
    self.postMessage({ id, pra, gambar }, [pra.bw.buffer, gambar.buffer]);
  } catch (err) {
    self.postMessage({ id, galat: String((err && err.message) || err) });
  }
};
