"use strict";

/* ==================================================================
   LAPIS 1 — TRANSPORTASI

   ETA = ETD + lama transit. HARI KALENDER: kapal dan pesawat tidak
   libur akhir pekan.

   TIDAK PERNAH bergantung pada dokumen kepabeanan. Manifest yang
   terbit lebih cepat tidak membuat kapalnya berlayar lebih kencang —
   itu aturan yang harus tetap benar walau berkas ini berkembang.
==================================================================== */

/* ------------------------------------------------------------------
   PENGAMBIL ANGKA DARI KONFIGURASI
------------------------------------------------------------------ */

function predictionTransitDays(ctx) {
  /* Turun tingkat sampai ketemu aturan yang BENAR-BENAR punya angka
     untuk kombinasi tipe pengiriman + direct/transit ini.

     Aturan per-pelabuhan sengaja tidak dilengkapi angka yang tidak
     diketahui: tabelnya cuma memuat FCL, dan sebagian rute hanya punya
     angka Transit. Membiarkan kekosongan itu terbaca sebagai nol akan
     menghasilkan ETA yang sama dengan ETD — kesalahan yang tidak
     berbunyi sama sekali di layar. */
  const kandidat = rankPredictionRules(PREDICTION_CONFIG.routes, ctx);
  let rule = null;
  let nilai = null;
  for (let i = 0; i < kandidat.length; i++) {
    const perTipeI = kandidat[i].days && kandidat[i].days[ctx.shipmentType];
    const v = pickRouteValue(perTipeI, ctx.routeType);
    if (v != null) {
      rule = kandidat[i];
      nilai = v;
      break;
    }
  }
  let rentang = normalizeDayRange(nilai != null ? nilai : 0);

  /* RIWAYAT MENGALAHKAN KONFIGURASI.

     Kalau rute ini sudah punya cukup pengiriman selesai, angka yang
     benar-benar terjadi menggantikan asumsi — dan rentangnya runtuh
     jadi satu angka, karena yang dipakai bukan lagi tebakan. */
  /* Lapis belajar SELALU mengembalikan objek — juga saat riwayatnya
     belum memenuhi syarat — supaya layar bisa menunjukkan progresnya.
     Karena itu yang diperiksa `.cukup`, bukan sekadar "ada". */
  const riwayat =
    typeof learnedTransitDays === "function" ? learnedTransitDays(ctx) : null;
  const belajar = riwayat && riwayat.cukup ? riwayat : null;
  if (belajar) {
    rentang = { min: belajar.min, max: belajar.max, hasRange: false };
  }

  /* PENYESUAIAN CARRIER. Ditambahkan SETELAH riwayat, bukan sebelumnya:
     riwayat sudah memuat kebiasaan forwarder yang dipakai selama ini,
     jadi menambahkan penyesuaian di depan akan menghitungnya dua kali.
     Yang di sini berlaku untuk forwarder yang belum punya riwayat. */
  const carrier = belajar
    ? null
    : pickPredictionRule(PREDICTION_CONFIG.carrierAdjustments || [], ctx);
  const tambahan = carrier ? Number(carrier.days) || 0 : 0;

  const dasar = belajar ? belajar.days : planningDayValue(rentang);

  return {
    // Satu angka untuk dituliskan ke kolom ETA...
    days: Math.max(0, dasar + tambahan),
    // ...dan rentang penuhnya, supaya ketidakpastiannya tetap terbaca.
    min: Math.max(0, rentang.min + tambahan),
    max: Math.max(0, rentang.max + tambahan),
    hasRange: rentang.hasRange,
    kind: ctx.routeType,
    ruleId: (rule && rule.id) || "",
    ruleLabel: (rule && rule.label) || "",
    ruleFallback: !!rule && !!rule.match && Object.keys(rule.match).length === 0,
    learned: belajar || null,
    learningProgress: riwayat && !riwayat.cukup ? riwayat : null,
    carrierId: (carrier && carrier.id) || "",
    carrierLabel: (carrier && carrier.label) || "",
    carrierDays: tambahan,
    // Carrier yang TERDETEKSI (beda dari penyesuaian carrier di atas)
    detectedCarrier: ctx.carrier || "",
    ok: nilai != null || !!belajar,
  };
}
/* ==================================================================
   MESIN 1 — PREDIKSI ETA

   ETA = ETD + lama transit (HARI KALENDER).

   Sengaja tidak memakai hari kerja: kapal tidak berhenti hari Minggu.
================================================================== */

/* `etdOverride` dipakai saat ingin menghitung dari tanggal berangkat
   tertentu — mis. membandingkan jadwal rencana dengan jadwal mundur. */

function predictEta(src, etdOverride) {
  const ctx = predictionContext(src);
  const transit = predictionTransitDays(ctx);
  /* Bawaannya ETD RENCANA, bukan ETD mundur.

     Kolom `eta` berpasangan dengan `etd`, dan `etaUpdate` dengan
     `etdUpdate` — itulah yang dibaca lencana "+5 hari dari ETD" dan
     "+2 hari dari ETA" di kotak delay. Kalau `eta` diam-diam diisi
     hasil hitungan dari ETD mundur, kedua lencana itu membandingkan
     jadwal mundur dengan jadwal mundur, lalu selalu menunjukkan nol.

     Yang memakai ETD mundur adalah predictionEtaBasis(), lewat
     override — dan itu yang jadi acuan seluruh proses darat. */
  const etdDipakai = etdOverride || ctx.etd;

  if (!etdDipakai) {
    return {
      ok: false,
      eta: "",
      reason: "ETD belum diisi.",
      ctx: ctx,
      transit: transit,
    };
  }

  return {
    ok: true,
    eta: addCalendarDaysISO(etdDipakai, transit.days),
    etaEarliest: addCalendarDaysISO(etdDipakai, transit.min),
    etaLatest: addCalendarDaysISO(etdDipakai, transit.max),
    etdUsed: etdDipakai,
    hasRange: transit.hasRange,
    days: transit.days,
    daysMin: transit.min,
    daysMax: transit.max,
    kind: transit.kind,
    ruleId: transit.ruleId,
    ruleLabel: transit.ruleLabel,
    shipmentType: ctx.shipmentType,
    reason: "",
    ctx: ctx,
    transit: transit,
  };
}
/* ------------------------------------------------------------------
   MODE ETA

   "auto"   — dihitung mesin, ikut berubah tiap ETD/rute/tipe berubah.
   "manual" — angka dari forwarder. Mesin TIDAK PERNAH menimpanya.

   Data lama tidak punya kolom ini. ETA yang sudah terisi diperlakukan
   sebagai MANUAL: angka itu dulu diketik seseorang dengan sengaja, dan
   menimpanya diam-diam saat fitur ini menyala adalah cara tercepat
   membuat papan berbohong.
------------------------------------------------------------------ */

function etaModeOf(s) {
  const m = s && s.etaMode;
  if (m === "auto" || m === "manual") return m;
  return s && s.eta ? "manual" : "auto";
}
function etaModeLabel(mode) {
  return mode === "manual" ? "Manual ETA" : "Auto ETA";
}
/* ETA yang dipakai sebagai TITIK MULAI Estimated Delivery.

   Kalau jadwal sudah dimundurkan (kotak Tanggal Update Delay terisi),
   yang berlaku adalah tanggal barunya. Kotak delay tetap milik
   pengguna sepenuhnya — mesin membacanya, tidak pernah menulisinya. */

function predictionEtaBasis(s) {
  if (s && s.etaUpdate) return s.etaUpdate;

  /* ETD MUNDUR TAPI UPDATE ETA BELUM DIISI.

     Kapal berangkat lima hari lebih lambat; kedatangannya pasti ikut
     mundur. Memakai ETA rencana di sini akan memperkirakan barang
     sampai pabrik pada tanggal yang sudah tidak mungkin lagi.

     Diturunkan, BUKAN dituliskan ke kotak delay. Kotak itu milik
     pengguna — mesin membacanya, tidak mengisinya. Panel prediksi
     menuliskan dari mana angkanya datang supaya tidak terasa muncul
     entah dari mana.

     Hanya untuk ETA otomatis. ETA manual berasal dari forwarder yang
     sudah tahu kapalnya telat; menggesernya lagi berarti menghitung
     keterlambatan yang sama dua kali. */
  if (s && s.etdUpdate && etaModeOf(s) === "auto") {
    const r = predictEta(s, s.etdUpdate);
    if (r.ok && r.eta) return r.eta;
  }

  return (s && s.eta) || "";
}
/* ETA hasil hitungan dari ETD yang mundur — null kalau tidak ada
   Update ETD. Dipakai tampilan untuk menjelaskan acuannya. */

function predictEtaRevised(src) {
  if (!src || !src.etdUpdate) return null;
  const r = predictEta(src, src.etdUpdate);
  return r.ok ? r : null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    predictionTransitDays,
    predictEta,
    etaModeOf,
    predictionEtaBasis,
  };
}
