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
const STATUS_META = {
  process: { label: "PROCESS", class: "status-process" },
  transit: { label: "IN TRANSIT", class: "status-transit" },
  arrived: { label: "ARRIVED", class: "status-arrived" },
  delayed: { label: "DELAYED", class: "status-delayed" },
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
    actual: "Actual Shipped Date",
    showDuty: false,
    modalTitleNew: "Tambah Jadwal Export",
    modalTitleEdit: "Edit Jadwal Export",
    arrivedNoun: "delivered",
  },
};

const JENIS_OPTIONS = ["Bahan Baku", "Barang Modal", "Barang Penolong"];

// Jenis fasilitas SKB yang sudah dikenal aplikasi (checkbox tetap).
// "Lainnya" selalu jadi opsi terakhir — nilainya bebas (jenisLainnya).
const SKB_TYPE_OPTIONS = ["BM", "PPN", "PPH", "Masterlist", "E-COO", "Lainnya"];
