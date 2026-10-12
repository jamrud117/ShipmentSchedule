"use strict";

/* ------------------------------------------------------------------
   TOMBOL HAPUS (×) DI KOTAK CARI

   Setiap kotak cari (Akun, HS Code, Jadwal Kapal, Masterlist, riwayat
   No. Dokumen, pencari HS Code di Daftar Barang, palet Cari cepat)
   membawa satu .search-clear[data-cari-hapus] tepat sesudah kotaknya.
   Kapan ia tampil diurus CSS (:placeholder-shown, dashboard.css).

   Diklik: kotaknya dikosongkan, lalu event "input" dikirim -- saringan
   halaman itu berjalan lewat pendengarnya sendiri seperti saat
   pengguna menghapus dengan Backspace, tanpa perlu tahu tombol ini
   ada. Fokus kembali ke kotaknya supaya bisa langsung mengetik lagi.

   Kotak cari Jadwal (#btnClearSearch) punya tombolnya sendiri sejak
   dulu (quick-filters.js) dan tidak disentuh di sini.
------------------------------------------------------------------ */
document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-cari-hapus]");
  if (!tombol) return;
  const kotak = tombol.parentElement && tombol.parentElement.querySelector("input");
  if (!kotak) return;
  e.preventDefault();
  kotak.value = "";
  kotak.dispatchEvent(new Event("input", { bubbles: true }));
  kotak.focus();
});
