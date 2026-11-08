"use strict";

/* ANTI-BINGKAI (clickjacking).

   Situs lain bisa memuat aplikasi ini di dalam <iframe> tak terlihat lalu
   memancing klik ("Hapus", "Ajukan") lewat tombol palsu di atasnya.
   Penangkalnya biasanya header X-Frame-Options / CSP frame-ancestors,
   tapi GitHub Pages tidak bisa mengirim header sendiri, dan
   frame-ancestors diabaikan bila ditulis di <meta>.

   Jadi: bila dimuat di dalam bingkai, halaman disembunyikan dan jendela
   teratas diarahkan ke alamat aplikasi yang sebenarnya. Dimuat paling
   awal di <head>, sebelum apa pun tampil. Bingkai milik aplikasi
   sendiri (pratinjau cetak) tidak memuat berkas ini. */
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try {
    window.top.location.replace(window.self.location.href);
  } catch (e) {
    /* Bingkai ber-sandbox tanpa izin navigasi: halaman tetap tersembunyi. */
  }
}
