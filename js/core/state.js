"use strict";

/* ==================================================================
   DATA (dimuat dari Supabase saat startup — lihat loadShipments())
================================================================== */
let data = {
  import: [],
  export: [],
};

/* ----------------------------------------------------------------
   STATE UI TAMBAHAN (mode aktif, draft form, sort/paginasi)
   Awalnya menyatu tepat di bawah bagian CRUD KE SUPABASE di
   script.js lama -- dipindah ke sini supaya SEMUA state mutable
   aplikasi (termasuk `data`) hidup di satu file yang sama.
---------------------------------------------------------------- */

let activeMode = "import";
let draftItems = [];
// Kronologi catatan yang sedang diedit di form (lihat features/notes-log.js)
let draftNotesLog = [];
let draftStops = [];
/* Dasar tanggal yang dipakai BERSAMA oleh: urutan daftar, pengelompokan
   per tanggal, rentang tanggal di bilah kendali, token hitung mundur,
   dan agenda 7 hari di Ringkasan. Nilainya "eta" atau "etd".

   Dulu ini bernama sortDir dan menyimpan "eta-asc"/"etd-desc" — arah
   urutannya sekarang selalu menaik (yang terdekat lebih dulu), karena
   itu satu-satunya urutan yang masuk akal untuk papan operasi. */
let rangeBasis = "eta";
let currentDetailId = null;
let currentPage = 1;
let pageSize = 5;
