"use strict";

/* DATA (dimuat dari Supabase saat startup — lihat loadShipments()) */
let data = {
  import: [],
  export: [],
};

/* STATE UI TAMBAHAN (mode aktif, draft form, sort/paginasi) */

let activeMode = "import";
let draftItems = [];
// Kronologi catatan yang sedang diedit di form (lihat features/notes-log.js)
let draftNotesLog = [];
let draftStops = [];
let currentDetailId = null;
let currentPage = 1;
let pageSize = 5;
