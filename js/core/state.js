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
// Barang & terminal transit saat form Edit dibuka (sidikIsiJadwal, data/api.js); null = jadwal baru
let sidikAsalForm = null;
// PI, LS, Polis Asuransi & dokumen lain yang sedang diedit di form (features/dok-pelengkap.js)
let draftDokPelengkap = dokPelengkapKosong();
let currentDetailId = null;
let currentPage = 1;
let pageSize = 10;
