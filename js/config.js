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
    actual: "Actual Delivery",
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

// "Barang Jadi" ditambahkan untuk mode Export (requirement C)
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

const JENIS_OPTIONS = [
  "Bahan Baku",
  "Barang Modal",
  "Barang Penolong",
  "Barang Jadi",
];

// Jenis fasilitas SKB yang sudah dikenal aplikasi (checkbox tetap)
const SKB_TYPE_OPTIONS = ["BM", "PPN", "PPH", "Masterlist", "E-COO", "Lainnya"];
