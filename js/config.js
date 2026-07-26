"use strict";

/* ==================================================================
   SUPABASE CONFIG
   Isi 2 nilai di bawah dengan Project URL & anon public key dari
   project Supabase-mu (Settings > API di dashboard Supabase).
   Lihat README.md untuk panduan lengkap step-by-step.
================================================================== */
const SUPABASE_URL = "https://nigxxpzgunibuotluapv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZMgHTAl6ELfm4UeR-Gqn6w_by8JbSFd";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

/* ==================================================================
   CONSTANTS
================================================================== */
// Label di sini cuma default; label yang BENAR-BENAR tampil dihitung
// per mode oleh statusLabel() di js/core/status.js (ARRIVED utk Import,
// DELIVERED utk Export, DELAY utk keduanya).
const STATUS_META = {
  process: { label: "PROCESS", class: "status-process" },
  transit: { label: "IN TRANSIT", class: "status-transit" },
  arrived: { label: "ARRIVED", class: "status-arrived" },
  delayed: { label: "DELAY", class: "status-delayed" },
};

const MODE_LABELS = {
  import: {
    addBtn: "Tambah Jadwal Import",
    section: "Daftar Jadwal Pengiriman Import",
    arrivedStat: "ARRIVED",
    docNo: "No. SPPB",
    docDate: "Tanggal SPPB",
    party: "Nama Shipper",
    factoryDate: "Tanggal In Factory",
    factoryTime: "Jam In Factory",
    origin: "Pelabuhan Asal",
    destination: "Pelabuhan Tujuan",
    // Versi moda udara — dipakai applyTransportLabels() (requirement B:
    // "kalau moda udara, ganti jadi Terminal Asal/Terminal Tujuan").
    originAir: "Terminal Asal",
    destinationAir: "Terminal Tujuan",
    actual: "Actual Delivery",
    showDuty: true,
    modalTitleNew: "Tambah Jadwal Import",
    modalTitleEdit: "Edit Jadwal Import",
    arrivedNoun: "arrived",
  },
  export: {
    addBtn: "Tambah Jadwal Export",
    section: "Daftar Jadwal Pengiriman Export",
    arrivedStat: "DELIVERED",
    docNo: "No. PEB",
    docDate: "Tanggal PEB",
    party: "Nama Buyer / Consignee",
    factoryDate: "Tanggal Stuffing",
    factoryTime: "Jam Stuffing",
    origin: "Pelabuhan Muat",
    destination: "Pelabuhan Tujuan",
    originAir: "Terminal Muat",
    destinationAir: "Terminal Tujuan",
    actual: "Actual Shipped Date",
    showDuty: false,
    modalTitleNew: "Tambah Jadwal Export",
    modalTitleEdit: "Edit Jadwal Export",
    arrivedNoun: "delivered",
  },
};

// "Barang Jadi" ditambahkan untuk mode Export (requirement C) — barang
// yang diekspor DDI adalah hasil produksi jadi, bukan bahan baku.
/* ------------------------------------------------------------------
   LABEL SARANA PENGANGKUT & PELABUHAN MENGIKUTI MODA (requirement B)

   Dipakai BERSAMA oleh form (applyTransportLabels), kartu dashboard,
   dan modal Detail — dulu tiap tempat menuliskan labelnya sendiri-
   sendiri, sehingga form sudah benar ("Nama Voyager" untuk moda laut)
   tapi kartu & modal Detail masih menulis "Vessel". Satu sumber di sini
   supaya tidak bisa lagi beda antar layar.

   Aturannya:
     moda LAUT  -> "Voyager"  + "No. Voyage"
     moda UDARA -> "Vessel"   + "No. Flight"   (BUKAN "Maskapai")
------------------------------------------------------------------ */
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

const JENIS_OPTIONS = [
  "Bahan Baku",
  "Barang Modal",
  "Barang Penolong",
  "Barang Jadi",
];

// Jenis fasilitas SKB yang sudah dikenal aplikasi (checkbox tetap).
// "Lainnya" selalu jadi opsi terakhir — nilainya bebas (jenisLainnya).
const SKB_TYPE_OPTIONS = ["BM", "PPN", "PPH", "Masterlist", "E-COO", "Lainnya"];
