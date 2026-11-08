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

/* ASUMSI KONFIGURASI untuk satu konteks rute -- TANPA riwayat.

   Dipakai dua tempat: mesin di bawah, dan lapis belajar yang mengukur
   seberapa jauh tiap kiriman riwayat meleset dari asumsinya SENDIRI
   (prediction-learning.js) -- jadi keduanya harus memakai satu fungsi
   yang sama, bukan dua salinan yang lama-lama berbeda.

   `ragu`: seberapa tidak pasti angka ini (hari, simpangan baku).
   Makin ragu, makin cepat riwayat nyata mengambil alih:
     angka pelabuhan pasti        priorSpreadDays (laut 2, udara 1)
     rentang ("8–12 hari")        setengah lebar rentangnya, minimal itu
     dari arah sebaliknya         + reverseLaneExtraDays
     aturan cadangan (rute asing) priorSpreadFallbackDays -- angka 14
                                  hari untuk Singapura maupun Hamburg
                                  memang hampir tidak berarti apa-apa */
function asumsiTransitKonfigurasi(ctx) {
  /* Turun tingkat sampai ketemu aturan yang BENAR-BENAR punya angka
     untuk kombinasi tipe pengiriman + direct/transit ini.

     Aturan per-pelabuhan sengaja tidak dilengkapi angka yang tidak
     diketahui: tabelnya cuma memuat FCL, dan sebagian rute hanya punya
     angka Transit. Membiarkan kekosongan itu terbaca sebagai nol akan
     menghasilkan ETA yang sama dengan ETD — kesalahan yang tidak
     berbunyi sama sekali di layar.

     Aturan DUA ARAH (rankRouteRules, prediction-rules.js): rute ekspor
     memakai angka arah impornya bila arah ekspornya sendiri tidak
     tertulis. */
  const kandidat = rankRouteRules(PREDICTION_CONFIG.routes, ctx);
  let pilih = null;
  let nilai = null;
  let iPilih = -1;
  for (let i = 0; i < kandidat.length; i++) {
    const r = kandidat[i].r;
    const v = pickRouteValue(r.days && r.days[ctx.shipmentType], ctx.routeType);
    if (v != null) {
      pilih = kandidat[i];
      nilai = v;
      iPilih = i;
      break;
    }
  }
  /* LAUT BERLABEL DIRECT, PELABUHANNYA HANYA PUNYA ANGKA TRANSIT.

     "Direct" adalah nilai bawaan form -- untuk laut pengguna memang tidak
     tahu kapalnya langsung atau singgah (pickRouteValue). Vladivostok →
     Priok hanya tertulis Transit 23 hari; jatuh ke aturan negara berarti
     memakai "Rusia → Indonesia" 30–40 hari, angka yang dibuat untuk
     St Petersburg di ujung lain benua. Angka pelabuhan yang SAMA
     (walau untuk tipe rute lain) jauh lebih dekat, jadi itu yang dipakai
     -- dengan keraguan sedikit lebih besar. Transit yang DIPILIH pengguna
     tidak diperlakukan begini: itu disengaja. */
  let jenisLain = false;
  if (ctx.shipmentType !== "AIR" && ctx.routeType === "direct") {
    const batas = iPilih >= 0 ? iPilih : kandidat.length;
    for (let i = 0; i < batas; i++) {
      if (iPilih >= 0 && kandidat[i].skor <= kandidat[iPilih].skor) break;
      const per = kandidat[i].r.days && kandidat[i].r.days[ctx.shipmentType];
      if (per && typeof per === "object" && !Array.isArray(per) && per.transit != null) {
        pilih = kandidat[i];
        nilai = per.transit;
        jenisLain = true;
        break;
      }
    }
  }
  const rule = pilih ? pilih.r : null;
  const balik = !!(pilih && pilih.balik);
  const rentang = normalizeDayRange(nilai != null ? nilai : 0);
  const cadangan = !!rule && !!rule.match && Object.keys(rule.match).length === 0;

  /* PENYESUAIAN CARRIER/FORWARDER dari konfigurasi masuk ke ASUMSI
     awal, bukan ditambahkan di atas hasil riwayat: begitu kiriman
     forwarder itu sendiri terkumpul, riwayatnya yang menentukan, dan
     penyesuaian manual itu tidak terhitung dua kali. */
  const aturanCarrier = pickPredictionRule(PREDICTION_CONFIG.carrierAdjustments || [], ctx);
  const tambahanAturan = aturanCarrier ? Number(aturanCarrier.days) || 0 : 0;
  const asumsi = nilai != null ? planningDayValue(rentang) + tambahanAturan : null;

  const cfg = (PREDICTION_CONFIG && PREDICTION_CONFIG.learning) || {};
  const peta = (p, d) => (p && p[ctx.shipmentType] != null ? Number(p[ctx.shipmentType]) : p && p.default != null ? Number(p.default) : d);
  let ragu = Math.max(peta(cfg.priorSpreadDays, 2), (rentang.max - rentang.min) / 2);
  if (balik) ragu += Number(cfg.reverseLaneExtraDays) || 0;
  if (jenisLain) ragu += 1;
  if (cadangan) ragu = Math.max(ragu, peta(cfg.priorSpreadFallbackDays, ragu));

  return { rule, balik, jenisLain, nilai, rentang, cadangan, aturanCarrier, tambahanAturan, asumsi, ragu };
}

function predictionTransitDays(ctx) {
  const a = asumsiTransitKonfigurasi(ctx);
  const rule = a.rule;
  let rentang = a.rentang;

  /* RIWAYAT MENARIK ASUMSI KE KENYATAAN.

     Lapis belajar SELALU mengembalikan objek — juga saat riwayatnya
     belum memenuhi syarat — supaya layar bisa menunjukkan progresnya.
     Karena itu yang diperiksa `.cukup`, bukan sekadar "ada".

     Riwayat RUTE INI SENDIRI: rentangnya runtuh jadi satu angka -- yang
     dipakai bukan lagi tebakan konfigurasi. Riwayat RUTE LAIN (negara
     yang sama, atau seluruh rute searah -- scope "negara"/"umum"):
     rentang konfigurasinya digeser sebesar selisih yang terukur, tapi
     tetap rentang -- rute ini sendiri belum pernah terbukti. */
  const riwayat =
    typeof learnedTransitDays === "function" ? learnedTransitDays(ctx, a.asumsi, { ragu: a.ragu, cadangan: a.cadangan }) : null;
  const belajar = riwayat && riwayat.cukup ? riwayat : null;
  if (belajar && (belajar.scope === "negara" || belajar.scope === "umum")) {
    const g = belajar.days - (a.asumsi != null ? a.asumsi : belajar.days);
    rentang = { min: Math.max(0, rentang.min + g), max: Math.max(0, rentang.max + g), hasRange: rentang.hasRange };
  } else if (belajar) {
    rentang = {
      min: Math.min(belajar.min, belajar.days),
      max: Math.max(belajar.max, belajar.days),
      hasRange: false,
    };
  }

  const carrier = belajar ? null : a.aturanCarrier;
  const tambahan = carrier ? a.tambahanAturan : 0;

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
    /* Aturan arah sebaliknya disebut apa adanya: "Busan → Tanjung Priok
       · arah sebaliknya" untuk kiriman Priok → Busan. */
    ruleLabel: rule
      ? [rule.label || "", a.balik ? tt("arah sebaliknya", "reverse lane") : "", a.jenisLain ? tt("angka transit", "transit figure") : ""].filter(Boolean).join(" · ")
      : "",
    ruleReverse: a.balik,
    ruleOtherRouteType: a.jenisLain,
    ruleFallback: a.cadangan,
    learned: belajar || null,
    learningProgress: riwayat && !riwayat.cukup ? riwayat : null,
    carrierId: (carrier && carrier.id) || "",
    carrierLabel: (carrier && carrier.label) || "",
    carrierDays: tambahan,
    // Carrier yang TERDETEKSI (beda dari penyesuaian carrier di atas)
    detectedCarrier: ctx.carrier || "",
    ok: a.nilai != null || !!belajar,
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
      reason: t("s.etd.belum.diisi"),
      ctx: ctx,
      transit: transit,
    };
  }

  /* KAPAL YANG SAMA LEBIH TAHU DARIPADA TABEL. Kiriman lain di kapal +
     voyage + tujuan yang sama sudah Sandar, atau ETA-nya diisi manual
     dari forwarder: kapalnya tiba hari itu, untuk kiriman ini juga
     (etaSekapal, prediction-milestones.js). */
  const kakak = typeof etaSekapal === "function" ? etaSekapal(src, etdDipakai) : null;
  if (kakak) {
    const n = calendarDaysBetweenISO(etdDipakai, kakak.date);
    return {
      ok: true,
      eta: kakak.date,
      etaEarliest: kakak.date,
      etaLatest: kakak.date,
      etdUsed: etdDipakai,
      hasRange: false,
      days: n,
      daysMin: n,
      daysMax: n,
      kind: transit.kind,
      ruleId: transit.ruleId,
      ruleLabel: kakak.confirmed
        ? tt("Kiriman lain di kapal yang sama sudah sandar", "Another shipment on the same vessel has berthed")
        : tt("ETA manual kiriman lain di kapal yang sama", "Manual ETA of another shipment on the same vessel"),
      shipmentType: ctx.shipmentType,
      reason: "",
      ctx: ctx,
      transit: transit,
      sekapal: kakak,
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
/* "Auto" / "Manual" saja: penandanya selalu duduk di samping atau di
   bawah tulisan ETA, jadi "Auto ETA" mengulang kata yang sama. */
function etaModeLabel(mode) {
  return mode === "manual" ? "Manual" : "Auto";
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
