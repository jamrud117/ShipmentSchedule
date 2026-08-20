"use strict";

/* SUPABASE CONFIG */
const SUPABASE_URL = "https://nigxxpzgunibuotluapv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZMgHTAl6ELfm4UeR-Gqn6w_by8JbSFd";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

/* CONSTANTS */
// Label di sini cuma default
const STATUS_META = {
  process: { label: "PROCESS", class: "status-process" },
  transit: { label: "IN TRANSIT", class: "status-transit" },
  arrived: { label: "ARRIVED", class: "status-arrived" },
  delayed: { label: "DELAY", class: "status-delayed" },
};

/* Supabase Auth selalu butuh alamat email sebagai identitas — tidak bisa
   dimatikan. Karena sistem ini internal dan penggantian sandi dilakukan
   admin, alamatnya DIBENTUK dari username, bukan diminta ke pengguna.

   ".internal" adalah TLD yang memang dicadangkan untuk pemakaian dalam
   jaringan sendiri, jadi tidak akan pernah bentrok dengan domain nyata.
   Ubah di sini kalau ingin memakai domain perusahaan. */
const INTERNAL_MAIL_DOMAIN = "eximddi.internal";

function emailFromUsername(username) {
  return String(username || "").trim().toLowerCase() + "@" + INTERNAL_MAIL_DOMAIN;
}

const MODE_LABELS = {
  import: {
    addBtn: "Tambah Jadwal Import",
    section: "Daftar Jadwal Pengiriman Import",
    arrivedStat: "Arrived",
    docNo: "No. SPPB",
    docDate: "Tanggal SPPB",
    party: "Nama Shipper",
    factoryDate: "Tanggal In Factory",
    factoryTime: "Jam In Factory",
    origin: "Pelabuhan Asal",
    destination: "Pelabuhan Tujuan",
    // Versi moda udara — dipakai applyTransportLabels() (requirement B: "kalau moda udara
    originAir: "Terminal Asal",
    destinationAir: "Terminal Tujuan",
    actual: "Estimated Delivery",
    showDuty: true,
    modalTitleNew: "Tambah Jadwal Import",
    modalTitleEdit: "Edit Jadwal Import",
    arrivedNoun: "arrived",
  },
  export: {
    addBtn: "Tambah Jadwal Export",
    section: "Daftar Jadwal Pengiriman Export",
    arrivedStat: "Delivered",
    docNo: "No. PEB",
    docDate: "Tanggal PEB",
    party: "Nama Buyer / Consignee",
    factoryDate: "Tanggal Stuffing",
    factoryTime: "Jam Stuffing",
    origin: "Pelabuhan Muat",
    destination: "Pelabuhan Tujuan",
    originAir: "Terminal Muat",
    destinationAir: "Terminal Tujuan",
    actual: "Stuffing",
    showDuty: false,
    modalTitleNew: "Tambah Jadwal Export",
    modalTitleEdit: "Edit Jadwal Export",
    arrivedNoun: "delivered",
  },
};

/* LABEL SARANA PENGANGKUT & PELABUHAN MENGIKUTI MODA (requirement B) */
function vesselNoun(transport) {
  return transport === "udara" ? "Vessel" : "Voyager";
}
function voyageNoun(transport) {
  return transport === "udara" ? "No. Flight" : "No. Voyage";
}
// "Pelabuhan Asal" -> "Terminal Asal" saat moda udara.
function portNoun(which, transport, mode) {
  const lbl = MODE_LABELS[mode || activeMode];
  const air = transport === "udara";
  if (which === "origin") return air ? lbl.originAir : lbl.origin;
  return air ? lbl.destinationAir : lbl.destination;
}

/* Diurutkan sendiri saat dimuat, BUKAN ditulis berurutan di sini.

   Menambah jenis baru cukup dengan menempelkannya di mana saja dalam
   daftar ini — urutan tampilnya tetap alfabetis. Daftar yang harus
   ditulis rapi oleh tangan pada akhirnya selalu berantakan, dan yang
   berantakan bikin orang ragu apakah urutannya punya arti.

   localeCompare, bukan sort() polos: sort() polos membandingkan kode
   karakter, jadi huruf beraksen atau angka di awal nama akan mendarat
   di tempat yang tidak diduga. */
const JENIS_OPTIONS = urutkanJenis([
  "BARANG MODAL",
  "BARANG JADI",
  "SPAREPART",
  "BAHAN BAKU",
  "BARANG PENOLONG",
]);

function urutkanJenis(daftar) {
  return daftar.slice().sort((a, b) => a.localeCompare(b, "id"));
}

/* Nilai lama tersimpan dalam Huruf Kapital Di Awal ("Bahan Baku"),
   daftar di atas HURUF BESAR SEMUA. Perbandingan biasa akan meleset,
   dan kotak pilihan lalu jatuh ke pilihan pertama — jadwal lama
   diam-diam berubah jenis barangnya begitu dibuka.

   Semua perbandingan lewat sini, jadi ejaan lama tetap dikenali. */
function normalisasiJenisBarang(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

/* Daftar pilihan untuk SATU baris barang.

   Kalau nilai tersimpan tidak ada di daftar — "BARANG JADI" dari
   jadwal Export, atau apa pun yang ditulis sebelum daftar ini
   dirapikan — nilai itu IKUT DITAMPILKAN, bukan dibuang. Menghapusnya
   dari daftar berarti menghapusnya dari data begitu barisnya
   tersentuh, tanpa ada yang tahu. */
function jenisOptionsUntuk(nilai) {
  const kini = normalisasiJenisBarang(nilai);
  if (!kini || JENIS_OPTIONS.indexOf(kini) >= 0) return JENIS_OPTIONS;
  /* Nilai tambahan ikut diurutkan, tidak ditempel di ujung. Satu
     baris yang tidak alfabetis di antara yang alfabetis terbaca
     seperti kerusakan, bukan seperti penanda. */
  return urutkanJenis(JENIS_OPTIONS.concat([kini]));
}

// Jenis fasilitas SKB yang sudah dikenal aplikasi (checkbox tetap)
const SKB_TYPE_OPTIONS = ["BM", "PPN", "PPH", "Masterlist", "E-COO", "Lainnya"];
