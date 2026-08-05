"use strict";

/* ==================================================================
   LAPIS 2-4 — OPERASIONAL, MILESTONE, KENYATAAN

   Menyusun jadwal proses darat dari kedatangan sampai pabrik.

   LAPIS 2  stripping (LCL) -> clearance -> antar ke pabrik
   LAPIS 3  milestone yang dikonfirmasi menggantikan tebakan pada tahap
            yang sama; PIB & Billing berlaku sebagai GERBANG
   LAPIS 4  perkiraan yang tanggalnya sudah lewat dihitung ulang dari
            hari ini

   Rangkaiannya KEJADIAN FISIK, bukan rangkaian dokumen. Aturan yang
   memegang seluruh berkas ini: tidak ada proses darat yang bisa mulai
   sebelum alat angkutnya tiba.
==================================================================== */

/* ANGKA MENTAH DARI KONFIGURASI — tanpa riwayat sama sekali.

   Dipisah bukan demi kerapian, melainkan demi memutus lingkaran.
   Lapis belajar butuh tahu lama stripping untuk menghitung "kapan
   barang siap diurus". Kalau ia menanyakannya lewat predictionOpsDays,
   fungsi itu akan memanggil lapis belajar lagi — dan seterusnya sampai
   tumpukan panggilan habis. Persis itu yang terjadi.

   Aturannya sederhana dan berlaku seterusnya: YANG BELAJAR TIDAK BOLEH
   BERTANYA PADA YANG SUDAH BELAJAR. Ia hanya boleh membaca konfigurasi
   mentah, kalau tidak ia sedang belajar dari keluarannya sendiri. */

function configuredOpsDays(ctx) {
  // Pola jatuh-tingkat yang sama dengan transit, supaya aturan
  // operasional per-forwarder nanti boleh menyebut satu tipe saja.
  const kandidat = rankPredictionRules(PREDICTION_CONFIG.operations, ctx);
  let rule = null;
  for (let i = 0; i < kandidat.length; i++) {
    if (kandidat[i].days && kandidat[i].days[ctx.shipmentType]) {
      rule = kandidat[i];
      break;
    }
  }
  const d = (rule && rule.days && rule.days[ctx.shipmentType]) || {};
  return {
    stripping: Math.max(0, Number(d.stripping) || 0),
    clearance: Math.max(0, Number(d.clearance) || 0),
    delivery: Math.max(0, Number(d.delivery) || 0),
    ruleId: (rule && rule.id) || "",
    ruleLabel: (rule && rule.label) || "",
  };
}
/* Angka yang BENAR-BENAR dipakai: konfigurasi, ditimpa riwayat kalau
   datanya sudah cukup. */

function predictionOpsDays(ctx) {
  const dasar = configuredOpsDays(ctx);
  let clearance = dasar.clearance;
  let delivery = dasar.delivery;
  const dipelajari = [];

  if (typeof learnedOpsDays === "function") {
    const bClr = learnedOpsDays(ctx, "clearance");
    if (bClr && bClr.cukup) {
      clearance = bClr.days;
      dipelajari.push({ leg: "clearance", ...bClr });
    }
    const bDel = learnedOpsDays(ctx, "delivery");
    if (bDel && bDel.cukup) {
      delivery = bDel.days;
      dipelajari.push({ leg: "delivery", ...bDel });
    }
  }

  return {
    stripping: dasar.stripping,
    clearance: clearance,
    delivery: delivery,
    learned: dipelajari,
    ruleId: dasar.ruleId,
    ruleLabel: dasar.ruleLabel,
  };
}
function predictionStrippingApplies(ctx) {
  return (
    (PREDICTION_CONFIG.strippingAppliesTo || []).indexOf(ctx.shipmentType) >= 0
  );
}
/* ==================================================================
   MESIN 2 — PREDIKSI ESTIMATED DELIVERY

   Selalu bertumpu pada ETA, lalu ditimpa oleh milestone yang lebih
   meyakinkan begitu ada. Urutan prioritasnya, dari yang paling pasti:

     In Factory (fakta)  ->  SPPB  ->  PIB  ->  Manifest  ->  ETA

   Seluruh proses darat memakai HARI KERJA.
================================================================== */

/* ==================================================================
   JADWAL PROSES DARAT — BERJANGKAR PADA KEDATANGAN

   Ini bukan rangkaian dokumen, melainkan rangkaian KEJADIAN FISIK.
   Urutannya di lapangan:

     kapal sandar
       -> LCL: stripping di CFS         (FCL & udara langsung lewat)
       -> customs clearance             (butuh PIB sudah masuk)
       -> SPPB terbit
       -> antar ke pabrik

   DUA HAL YANG SEBELUMNYA SALAH DIMODELKAN:

   1. Stripping dikira berjangkar pada PIB. Tidak. Kontainer tidak bisa
      dibongkar sebelum kapalnya sandar, secepat apa pun dokumennya
      diajukan.

   2. PIB dikira TITIK MULAI. Juga tidak. PIB kerap masuk berhari-hari
      sebelum kapal tiba — memakainya sebagai titik mulai bisa
      menghasilkan tanggal antar yang jatuh SEBELUM kapalnya sandar.

      PIB itu GERBANG: clearance tidak bisa mulai sebelum PIB masuk,
      tapi PIB yang masuk lebih awal tidak mempercepat apa pun. Jadi
      yang berlaku `max(barang siap, tanggal PIB)`.

   Milestone yang dikonfirmasi menggantikan TEBAKAN pada tahap yang
   sama, bukan melompati tahap yang belum terjadi.
================================================================== */

/* Komitmen pintu-ke-pintu yang berlaku untuk pengiriman ini, atau null.

   Hanya untuk carrier bertipe KURIR. Pelayaran dan maskapai biasa
   mengangkut sampai pelabuhan/bandara saja — kepabeanan dan
   pengantarannya tetap urusan kita, jadi rantai proses biasa yang
   berlaku di sana. */
function courierCommitmentFor(s, ctx) {
  if (!ctx || ctx.carrierKind !== "courier") return null;
  const rule = pickPredictionRule(
    PREDICTION_CONFIG.courierCommitments || [],
    ctx,
  );
  if (!rule || !(Number(rule.workingDays) > 0)) return null;
  return {
    label: rule.label || "Komitmen kurir",
    workingDays: Number(rule.workingDays),
  };
}

/* Kapan alat angkut benar-benar tiba. Inilah jangkar seluruh proses
   darat — stripping tidak bisa mulai sebelum kapalnya sandar.

   Urutannya dari yang paling pasti:

     1. tahap SANDAR         tanggal ATA yang dikonfirmasi pengguna.
                             Satu-satunya yang benar-benar menyatakan
                             "alat angkutnya sudah di sini".

     2. tanggal Manifest     CADANGAN, dan sengaja diakui lemah.
                             BC 1.1 diajukan pengangkut SEBELUM kapal
                             sandar, jadi memakainya selalu meleset ke
                             arah yang sama — sehari terlalu awal, tiap
                             kali. Tetap dipakai karena ribuan jadwal
                             lama hanya punya ini, dan sehari terlalu
                             awal masih jauh lebih baik daripada ETA
                             yang sudah basi berminggu-minggu.

     3. ETA yang berlaku     tebakan.

   `s.ata` dibaca lebih dulu kalau suatu saat kolomnya ditambahkan. */

function arrivalInfoOf(s) {
  if (s && s.ata) {
    return { date: s.ata, label: "ATA (Aktual)", confirmed: true };
  }

  const berth = milestoneDateOf(s, "berth");
  if (berth) {
    return {
      date: berth,
      label: s && s.transport === "udara" ? "Mendarat (ATA)" : "Sandar (ATA)",
      confirmed: true,
    };
  }

  // ETA yang BERLAKU — kotak delay menang atas ETA rencana.
  const eta = predictionEtaBasis(s);
  const manifest = milestoneDateOf(s, "manifest");
  const dariEtdMundur =
    !!(s && s.etdUpdate && !s.etaUpdate && etaModeOf(s) === "auto");
  const labelEta = s && s.etaUpdate
    ? "ETA Delay (Update ETA)"
    : dariEtdMundur
      ? "ETA dihitung dari ETD Delay"
      : etaModeOf(s) === "manual"
        ? "ETA (Manual)"
        : "ETA (Auto)";

  /* MANIFEST ITU BATAS BAWAH, BUKAN TANGGAL KEDATANGAN.

     BC 1.1 diajukan pengangkut SEBELUM kapal sandar, jadi tanggalnya
     hanya berarti "paling cepat segini" — bukan "tiba di sini".

     Memakainya mentah-mentah menghasilkan angka yang mustahil: Manifest
     masuk 04-08 sementara ETA yang berlaku 08-08 membuat mesin
     memperkirakan barang sampai pabrik sebelum kapalnya sandar.

     Yang dipakai karena itu yang PALING BELAKANG di antara keduanya.
     Kalau Manifest justru lebih baru daripada ETA, berarti jadwalnya
     memang meleset dan Manifest yang lebih layak dipercaya. */
  if (manifest && eta) {
    return manifest > eta
      ? { date: manifest, label: "Kedatangan (perkiraan dari Manifest)", confirmed: false }
      : { date: eta, label: labelEta, confirmed: false };
  }
  if (manifest) {
    return { date: manifest, label: "Kedatangan (perkiraan dari Manifest)", confirmed: false };
  }
  return { date: eta, label: labelEta, confirmed: false };
}
function arrivalBasisOf(s) {
  return arrivalInfoOf(s).date;
}
function arrivalBasisLabelOf(s) {
  return arrivalInfoOf(s).label;
}

// Kedatangan sudah PASTI, bukan lagi diturunkan dari dokumen.
function arrivalConfirmedOf(s) {
  return arrivalInfoOf(s).confirmed;
}
/* SATUAN TIAP LANGKAH.

   Tidak seragam, dan itu bukan kelalaian. CFS membongkar terus di akhir
   pekan; Bea Cukai dan trucking tidak. Memaksakan satu satuan untuk
   semuanya akan salah di salah satu sisi — dan selalu ke arah yang
   sama, jadi kesalahannya menumpuk alih-alih saling menghapus. */

function legUsesCalendarDays(key) {
  return (PREDICTION_CONFIG.calendarDayLegs || []).indexOf(key) >= 0;
}
function legUnitLabel(key) {
  return legUsesCalendarDays(key) ? "hari kalender" : "hari kerja";
}
/* Maju sekian hari menurut satuan langkah itu sendiri. */

function advanceLeg(dari, hari, key) {
  return legUsesCalendarDays(key)
    ? addCalendarDaysISO(dari, hari)
    : addWorkingDaysISO(dari, hari);
}
/* Menyusun sisa jadwal dari titik yang sudah pasti sampai ke pabrik.
   Mengembalikan tanggal akhir + rincian langkahnya. */

function buildDeliverySchedule(s, ops, ctx) {
  const pakaiStripping = predictionStrippingApplies(ctx) && ops.stripping > 0;
  const sppb = milestoneDateOf(s, "sppb");
  const kedatangan = arrivalInfoOf(s);
  const langkah = [];

  /* KOMITMEN KURIR — satu langkah, bukan rantai.

     Dihitung dari KEDATANGAN, bukan dari tanggal kirim. Komitmen 3
     hari kerja FedEx berjalan setelah pesawatnya mendarat: berangkat
     Kamis 06, mendarat Jumat 07, lalu Sabtu-Minggu dilewati — tiga
     hari kerjanya jatuh pada Senin 10, Selasa 11, Rabu 12.

     ATA yang sudah dikonfirmasi otomatis dipakai lebih dulu daripada
     ETA (lihat arrivalInfoOf), jadi komitmennya ikut bergeser kalau
     pesawatnya telat — tanpa perlu apa pun disetel ulang.

     Berhenti berlaku begitu PIB, Billing, atau SPPB dikonfirmasi: di
     titik itu yang NYATA mengalahkan yang DIJANJIKAN. Manifest dan
     Berths tidak menghentikannya — keduanya justru MEMPERTAJAM
     tanggal kedatangan yang jadi titik hitungnya. */
  const komitmen = courierCommitmentFor(s, ctx);
  const kepabeananMulai = ["pib", "billing", "sppb"].some((k) =>
    milestoneDateOf(s, k),
  );
  if (komitmen && !kepabeananMulai && kedatangan.date) {
    const mulai = kedatangan.date;
    const akhir = addWorkingDaysISO(mulai, komitmen.workingDays);
    return {
      ok: true,
      date: akhir,
      base: mulai,
      baseLabel: kedatangan.label,
      steps: [
        {
          key: "courier",
          label: komitmen.label,
          days: komitmen.workingDays,
          unit: "hari kerja",
          from: mulai,
          to: akhir,
        },
      ],
    };
  }

  /* SPPB TERBIT — urusan kepabeanan selesai.

     Tapi barang tetap tidak bisa diantar sebelum alat angkutnya TIBA.
     Untuk kiriman udara ini bukan kasus langka: dokumen kerap rampung
     lebih dulu — PIB diajukan, billing dibayar, SPPB terbit — baru
     pesawatnya mendarat.

     Jadi pengantaran mulai dari yang PALING BELAKANG di antara SPPB
     dan kedatangan. Kalau tidak, papan akan menjanjikan barang sampai
     pabrik sebelum pesawatnya menyentuh landasan. */
  if (sppb) {
    let mulai = sppb;
    if (kedatangan.date && kedatangan.date > mulai) {
      langkah.push({
        key: "waitArrival",
        label: kedatangan.confirmed ? "Menunggu kedatangan" : "Menunggu kedatangan (perkiraan)",
        days: null,
        from: mulai,
        to: kedatangan.date,
      });
      mulai = kedatangan.date;
    }
    const akhir = advanceLeg(mulai, ops.delivery, "delivery");
    if (ops.delivery > 0) {
      langkah.push({
        key: "delivery",
        label: "Antar ke pabrik",
        days: ops.delivery,
        unit: legUnitLabel("delivery"),
        from: mulai,
        to: akhir,
      });
    }
    return {
      ok: true,
      date: akhir,
      base: sppb,
      baseLabel: "Tanggal SPPB",
      steps: langkah,
    };
  }

  const tiba = kedatangan.date;
  if (!tiba) {
    return { ok: false, date: "", base: "", baseLabel: "ETA", steps: [] };
  }

  let cur = tiba;

  // LCL: bongkar muatan gabungan di CFS, baru bisa diurus.
  /* Stripping memakai HARI KALENDER: CFS membongkar terus, termasuk
     akhir pekan dan hari libur. */
  if (pakaiStripping) {
    const sesudah = advanceLeg(cur, ops.stripping, "stripping");
    langkah.push({
      key: "stripping",
      label: "Stripping di CFS",
      days: ops.stripping,
      unit: legUnitLabel("stripping"),
      from: cur,
      to: sesudah,
    });
    cur = sesudah;
  }

  /* GERBANG KEPABEANAN — PIB & Billing BC 2.0.

     Keduanya harus sudah lewat sebelum clearance bisa selesai, tapi
     menyelesaikannya lebih awal tidak mempercepat apa pun: PIB kerap
     diajukan sebelum kapal sandar. Yang mengikat karena itu yang
     PALING BELAKANG di antara "barang siap" dan seluruh gerbang. */
  (PREDICTION_CONFIG.clearanceGates || []).forEach((gk) => {
    const tgl = milestoneDateOf(s, gk);
    if (tgl && tgl > cur) {
      const m = (PREDICTION_CONFIG.milestones || []).find((x) => x.key === gk);
      langkah.push({
        key: "wait_" + gk,
        label: "Menunggu " + ((m && m.label) || gk),
        days: null,
        from: cur,
        to: tgl,
      });
      cur = tgl;
    }
  });

  /* Clearance & pengantaran memakai HARI KERJA. Kalau stripping selesai
     di akhir pekan, langkah berikutnya otomatis maju ke hari kerja
     terdekat — itu perilaku addWorkingDaysISO, bukan tambalan. */
  if (ops.clearance > 0) {
    const sesudah = advanceLeg(cur, ops.clearance, "clearance");
    langkah.push({
      key: "clearance",
      label: "Customs clearance",
      days: ops.clearance,
      unit: legUnitLabel("clearance"),
      from: cur,
      to: sesudah,
    });
    cur = sesudah;
  }

  if (ops.delivery > 0) {
    const sesudah = advanceLeg(cur, ops.delivery, "delivery");
    langkah.push({
      key: "delivery",
      label: "Antar ke pabrik",
      days: ops.delivery,
      unit: legUnitLabel("delivery"),
      from: cur,
      to: sesudah,
    });
    cur = sesudah;
  }

  return {
    ok: true,
    date: cur,
    base: tiba,
    baseLabel: kedatangan.label,
    steps: langkah,
  };
}
/* ------------------------------------------------------------------
   MODE ESTIMATED DELIVERY

   Sama polanya dengan Mode ETA. Ada saat laporan harus memuat tanggal
   yang sudah disepakati dengan produksi atau dijanjikan ke pelanggan,
   dan tanggal itu tidak boleh bergeser sendiri tiap kali sebuah
   dokumen dicentang.

   "manual" berarti manual sepenuhnya: mesin tidak pernah menimpanya,
   bahkan setelah barang masuk pabrik. Tanggal In Factory yang
   sebenarnya tetap terlihat di kolomnya sendiri, jadi tidak ada
   keterangan yang hilang — yang ada justru pilihan yang dihormati.
------------------------------------------------------------------ */

function deliveryModeOf(s) {
  const m = s && s.deliveryMode;
  return m === "manual" ? "manual" : "auto";
}
function deliveryModeLabel(mode) {
  return mode === "manual" ? "Manual" : "Auto";
}
function predictDelivery(src) {
  const s = src || {};
  const rute = resolveRouteLayer(s);
  const ctx = rute;
  const ops = predictionOpsDays(ctx);
  const hariIni = typeof todayISO === "function" ? todayISO() : "";
  const belajar = !!(ops.learned && ops.learned.length);

  const bungkus = (extra) =>
    Object.assign(
      {
        ok: true,
        range: null,
        steps: [],
        ops: ops,
        ctx: ctx,
        route: rute,
        arrived: false,
        shifted: false,
        overdueDays: 0,
        delayBuffer: 0,
        reason: "",
      },
      extra,
    );

  /* ---- MANUAL — dihormati sepenuhnya, tidak dihitung apa pun ---- */
  if (deliveryModeOf(s) === "manual") {
    return bungkus({
      ok: !!s.actual,
      date: s.actual || "",
      source: "manual",
      sourceLabel: PREDICTION_SOURCE_LABEL.manual,
      confidence: predictionConfidencePercent({ baseKey: "manual", routeResolved: true }),
      base: s.actual || "",
      baseLabel: "Diisi manual",
      arrived: !!s.factoryDate,
      reason: s.actual ? "" : "Mode manual, tanggal belum diisi.",
    });
  }

  /* ---- LAPIS 3/4 dilewati: sudah sampai pabrik ---- */
  if (s.factoryDate) {
    return bungkus({
      date: s.factoryDate,
      source: "actual",
      sourceLabel: PREDICTION_SOURCE_LABEL.actual,
      confidence: predictionConfidencePercent({ baseKey: "actual", routeResolved: true }),
      base: s.factoryDate,
      baseLabel: "Tanggal In Factory",
      arrived: true,
    });
  }

  /* ---- LAPIS 2 & 3 — jadwal proses darat, berjangkar pada kedatangan ---- */
  const jadwal = buildDeliverySchedule(s, ops, ctx);

  /* Sumber & keyakinan tetap mengikuti milestone TERTINGGI yang sudah
     dikonfirmasi. Milestone memang mengurangi ketidakpastian walau
     tidak selalu memajukan tanggalnya — PIB yang masuk lebih awal
     menghapus satu kemungkinan hambatan tanpa mempercepat kapal. */
  const tertinggi = highestMilestoneOf(s);
  const sumber = tertinggi ? tertinggi.milestone.key : "eta";
  const baseKey = tertinggi
    ? tertinggi.milestone.key
    : etaModeOf(s) === "manual"
      ? "eta_manual"
      : "eta_auto";

  if (!jadwal.ok) {
    return bungkus({
      ok: false,
      date: "",
      source: "eta",
      sourceLabel: PREDICTION_SOURCE_LABEL.eta,
      confidence: predictionConfidencePercent({
        baseKey: "onlyEtd",
        routeResolved: rute.routeResolved,
        typeAssumed: rute.typeAssumed,
      }),
      base: "",
      baseLabel: "ETA",
      reason: "ETA belum ada, jadi Estimated Delivery belum bisa dihitung.",
    });
  }

  let hasil = { date: jadwal.date, steps: jadwal.steps };
  let baseLabel = jadwal.baseLabel;
  let rentang = null;

  /* ================================================================
     LAPIS 4 — KENYATAAN

     Perkiraan yang tanggalnya sudah lewat tidak memberi tahu apa pun.
     Kalau hasilnya di masa lalu sementara barang belum masuk pabrik,
     sisa prosesnya dihitung ulang dari HARI INI — memang baru bisa
     dimulai sekarang, bukan pada tanggal yang sudah terlewat.

     Penyangga keterlambatan ditambahkan di atasnya, dengan batas atas
     supaya kiriman yang macet berbulan-bulan tidak melahirkan angka
     yang mengada-ada.
  ================================================================ */
  const rc = PREDICTION_CONFIG.reality || {};
  let digeser = false;
  let telat = 0;
  let penyangga = 0;

  if (rc.enabled !== false && hariIni) {
    const lewat = calendarDaysBetweenISO(hasil.date, hariIni);
    if (lewat != null && lewat > (rc.graceDays || 0)) {
      telat = lewat;
      digeser = true;
      penyangga = Math.min(
        rc.maxDelayBuffer || 0,
        Math.floor(telat / 7) * (rc.delayBufferPerWeek || 0),
      );
      // Gerbang "menunggu PIB" tidak dibawa: tanggalnya sudah lewat.
      const sisa = jadwal.steps.filter((l) => l.days > 0);
      if (penyangga > 0) {
        sisa.push({
          key: "buffer",
          label: `Penyangga keterlambatan (${telat} hari telat)`,
          days: penyangga,
        });
      }
      hasil = jalankanLangkahKerja(hariIni, sisa);
      baseLabel = "Hari ini (perkiraan sebelumnya terlewat)";
    }
  }

  /* ---- Rentang, hanya selama kedatangan masih tebakan mesin ---- */
  const kedatanganMasihTebakan =
    !arrivalConfirmedOf(s) &&
    !milestoneDateOf(s, "manifest") &&
    !milestoneDateOf(s, "sppb");
  if (kedatanganMasihTebakan && !digeser && etaModeOf(s) === "auto" && !s.etaUpdate && ctx.etd) {
    const e = predictEta(s);
    if (e.ok && e.hasRange) {
      const langkahBersih = jadwal.steps.filter((l) => l.days > 0);
      rentang = {
        earliest: jalankanLangkahKerja(e.etaEarliest, langkahBersih).date,
        latest: jalankanLangkahKerja(e.etaLatest, langkahBersih).date,
        etaEarliest: e.etaEarliest,
        etaLatest: e.etaLatest,
        daysMin: e.daysMin,
        daysMax: e.daysMax,
      };
    }
  }

  const transit = predictionTransitDays(ctx);
  return bungkus({
    date: hasil.date,
    range: rentang,
    source: digeser ? "today" : sumber,
    sourceLabel: digeser
      ? `${PREDICTION_SOURCE_LABEL.today} (dari ${PREDICTION_SOURCE_LABEL[sumber] || sumber})`
      : PREDICTION_SOURCE_LABEL[sumber] || sumber,
    confidence: predictionConfidencePercent({
      baseKey: baseKey,
      routeResolved: rute.routeResolved,
      typeAssumed: rute.typeAssumed,
      ruleFallback: sumber === "eta" ? transit.ruleFallback : false,
      rangeWidth: rentang ? rentang.daysMax - rentang.daysMin : 0,
      overdueDays: telat,
      realityShifted: digeser,
      learned: belajar || !!transit.learned,
      arrivalConfirmed: arrivalConfirmedOf(s),
    }),
    base: digeser ? hariIni : jadwal.base,
    baseLabel: baseLabel,
    steps: hasil.steps,
    shifted: digeser,
    overdueDays: telat,
    delayBuffer: penyangga,
  });
}
/* Menjalankan rangkaian proses darat satu per satu, mencatat tanggal
   selesai tiap langkah supaya bisa ditampilkan sebagai rincian. */

function jalankanLangkahKerja(mulai, langkah) {
  let cur = mulai;
  const rinci = [];
  (langkah || []).forEach((l) => {
    const dari = cur;
    cur = advanceLeg(cur, l.days, l.key);
    // `key` & `unit` ikut dibawa: tampilan dan uji perlu tahu langkah
    // APA ini dan satuannya, bukan cuma tulisannya.
    rinci.push({
      key: l.key,
      label: l.label,
      days: l.days,
      unit: l.unit || legUnitLabel(l.key),
      from: dari,
      to: cur,
    });
  });
  return { date: cur, steps: rinci };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    predictionOpsDays,
    buildDeliverySchedule,
    predictDelivery,
    deliveryModeOf,
  };
}
