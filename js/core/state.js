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
let draftStops = [];
let sortDir = "asc";
let currentDetailId = null;
let currentPage = 1;
let pageSize = 5;
