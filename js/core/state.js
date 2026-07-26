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
let sortDir = "eta-asc"; // format: "<eta|etd>-<asc|desc>"
let currentDetailId = null;
let currentPage = 1;
let pageSize = 5;
