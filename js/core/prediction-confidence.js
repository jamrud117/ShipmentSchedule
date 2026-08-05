"use strict";

/* ==================================================================
   KEYAKINAN PREDIKSI

   Persen ini BUKAN peluang statistik. Ia ukuran seberapa banyak yang
   sudah dipastikan versus masih diasumsikan — karena itu tiap
   penambah/pengurang membawa alasannya, dan alasannya ikut ditampilkan.
   Angka tanpa alasan cuma hiasan.
==================================================================== */

function predictionConfidence(key) {
  const c = PREDICTION_CONFIG.confidence[key] || PREDICTION_CONFIG.confidence.low;
  return { key: key, label: c.label, level: c.level, tone: c.tone };
}
/* ------------------------------------------------------------------
   KEYAKINAN DALAM PERSEN

   Titik awal ditentukan sumber prediksi, lalu dikurangi tiap hal yang
   masih belum diketahui. Rinciannya (`reasons`) ikut dikembalikan
   supaya angkanya bisa ditelusuri — persen tanpa alasan cuma hiasan.
------------------------------------------------------------------ */

function predictionConfidencePercent(info) {
  const cfg = PREDICTION_CONFIG.confidencePercent;
  let nilai = cfg.base[info.baseKey];
  if (nilai == null) nilai = cfg.base.eta_auto;

  const alasan = [];
  const kurangi = (n, teks) => {
    if (n <= 0) return;
    nilai -= n;
    alasan.push({ delta: -n, text: teks });
  };

  if (!info.routeResolved) kurangi(cfg.penalties.routeUnresolved, "Rute belum dikenali");
  if (info.typeAssumed) kurangi(cfg.penalties.typeAssumed, "Jenis muatan masih diasumsikan");
  if (info.ruleFallback) kurangi(cfg.penalties.ruleFallback, "Rute memakai angka cadangan");

  if (info.rangeWidth > 0) {
    kurangi(
      Math.min(cfg.penalties.maxWideRange, info.rangeWidth * cfg.penalties.wideRangePerDay),
      `Lama transit masih rentang ${info.rangeWidth} hari`,
    );
  }
  if (info.overdueDays > 0) {
    kurangi(
      Math.min(cfg.penalties.maxOverdue, info.overdueDays * cfg.penalties.overduePerDay),
      `Terlambat ${info.overdueDays} hari dari perkiraan`,
    );
  }
  if (info.realityShifted) {
    kurangi(cfg.penalties.realityShifted, "Dasar hitungan digeser ke hari ini");
  }
  if (info.learned) {
    nilai += cfg.bonuses.learned;
    alasan.push({ delta: cfg.bonuses.learned, text: "Memakai riwayat pengiriman nyata" });
  }

  /* Kedatangan yang dikonfirmasi menghapus ketidakpastian TERBESAR —
     lama transit. Bonusnya berlaku berapa pun milestone tertingginya,
     kecuali saat Sandar itu sendiri yang jadi sumbernya (sudah masuk
     ke angka dasarnya, tidak dihitung dua kali). */
  if (info.arrivalConfirmed && info.baseKey !== "berth") {
    nilai += cfg.bonuses.arrivalConfirmed;
    alasan.push({
      delta: cfg.bonuses.arrivalConfirmed,
      text: "Kedatangan sudah dikonfirmasi",
    });
  }

  /* "Final" hanya untuk barang yang BENAR-BENAR sudah masuk pabrik.
     Tanpa atap ini, SPPB (99) ditambah bonus kedatangan (5) menembus
     100 dan papan menyatakan Final untuk kiriman yang bahkan belum
     keluar pelabuhan. */
  const atap = info.baseKey === "actual" ? 100 : cfg.capWithoutArrival || 99;
  const persen = Math.max(cfg.floor, Math.min(atap, Math.round(nilai)));
  const band = cfg.bands.find((b) => persen >= b.min) || cfg.bands[cfg.bands.length - 1];
  const c = predictionConfidence(band.key);
  return { percent: persen, reasons: alasan, ...c };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    predictionConfidencePercent,
  };
}
