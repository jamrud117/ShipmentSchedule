"use strict";

/* ==================================================================
   PEMBACAAN MILESTONE

   Satu-satunya tempat yang tahu bagaimana progres dokumen dibaca dari
   `doc_progress`. Lapis lain memanggil ke sini, tidak pernah menyentuh
   strukturnya langsung — menambah milestone baru cukup satu baris di
   PREDICTION_CONFIG.milestones tanpa menyentuh berkas ini.
==================================================================== */

/* ==================================================================
   MILESTONE

   Tanggal yang dipakai adalah tanggal DOKUMEN (entri `date`) kalau ada,
   bukan tanggal konfirmasi. Keduanya sering berbeda beberapa hari:
   SPPB terbit Jumat sore, dicentang Senin pagi. Prediksi yang memakai
   hari Senin akan menggeser seluruh rantai dua hari terlalu jauh.

   Entri lama yang belum punya `date` jatuh kembali ke tanggal
   konfirmasi — tetap terbaca, tanpa migrasi data.
================================================================== */

function predictionDocProgress(s) {
  const p = s && s.docProgress;
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}
function milestoneDateOf(s, stepKey) {
  const e = predictionDocProgress(s)[stepKey];
  if (!e || e.skipped) return "";
  if (e.date) return e.date;
  if (e.at) return String(e.at).slice(0, 10);
  return "";
}

// Milestone paling meyakinkan yang sudah dikonfirmasi (urutan dari konfigurasi).
function highestMilestoneOf(s) {
  const daftar = PREDICTION_CONFIG.milestones || [];
  for (let i = 0; i < daftar.length; i++) {
    const m = daftar[i];
    const tgl = milestoneDateOf(s, m.step);
    if (tgl) return { milestone: m, date: tgl };
  }
  return null;
}
/* SISA MILESTONE yang belum dikonfirmasi, urut alur kepabeanan.
   Diminta tampil di layar: "apa lagi yang kurang". */

function remainingMilestonesOf(s) {
  const urut = ["berth", "manifest", "pib", "billing", "sppb"];
  return urut
    .map((k) => (PREDICTION_CONFIG.milestones || []).find((m) => m.key === k))
    .filter(Boolean)
    .filter((m) => !milestoneDateOf(s, m.step))
    .map((m) => ({ key: m.key, label: m.label }));
}
const PREDICTION_SOURCE_LABEL = {
  actual: "In Factory (Aktual)",
  sppb: "SPPB",
  pib: "PIB",
  manifest: "Manifest",
  eta: "ETA",
  billing: "Billing BC 2.0",
  berth: "ATA",
  today: "Hari Ini",
  manual: "Diisi Manual",
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    milestoneDateOf,
    highestMilestoneOf,
    remainingMilestonesOf,
  };
}
