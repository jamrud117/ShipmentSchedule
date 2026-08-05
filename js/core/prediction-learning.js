"use strict";

/* ==================================================================
   BELAJAR DARI RIWAYAT PENGIRIMAN

   Angka di prediction-config.js adalah tebakan terbaik SEBELUM ada
   data. Berkas ini menggantikannya dengan yang benar-benar terjadi,
   begitu jadwal yang sudah selesai cukup banyak terkumpul pada rute
   yang sama.

   YANG DIPELAJARI, DAN DARI BUKTI APA:

     lama transit      ETD -> tanggal Manifest.
                       Manifest diajukan setelah alat angkut tiba, jadi
                       tanggalnya bukti terkuat kapan barang BENAR-BENAR
                       sampai. Kalau Manifest belum ada, dipakai ETA
                       bermode Manual — angka yang dipastikan forwarder,
                       bukan hasil hitungan mesin sendiri. ETA otomatis
                       sengaja TIDAK dipakai: mempelajari keluaran
                       sendiri hanya akan meneguhkan asumsi awal
                       berulang-ulang tanpa ada kenyataan yang masuk.

     clearance         tanggal PIB -> tanggal SPPB (hari kerja).
     antar ke pabrik   tanggal SPPB -> Tanggal In Factory (hari kerja).

   MEDIAN, BUKAN RATA-RATA. Satu kiriman yang tertahan enam minggu
   karena sengketa dokumen akan menarik rata-rata jauh dari kenyataan
   sehari-hari. Median mengabaikannya tanpa perlu aturan pembuang
   pencilan tersendiri.

   Hasilnya di-cache per tanda-tangan rute. Tanpa cache, menggambar
   seratus kartu berarti menyapu seluruh riwayat seratus kali.
================================================================== */

let PREDICTION_HISTORY_OVERRIDE = null;
const PREDICTION_LEARN_CACHE = new Map();

/* JARING PENGAMAN TERHADAP REKURSI.

   Perbaikan sebenarnya ada di configuredOpsDays() — lapis belajar
   sekarang hanya membaca konfigurasi mentah. Penjaga ini untuk jalur
   yang belum terpikirkan.

   Kalau lingkaran terbentuk lagi, akibatnya cuma "tidak jadi belajar"
   — perkiraan mundur ke angka konfigurasi, papan tetap jalan. Tanpa
   ini, akibatnya tab peramban mati dengan Maximum call stack size
   exceeded, dan tidak ada yang bisa dikerjakan sama sekali. */
let SEDANG_BELAJAR = false;

function denganPenjagaRekursi(fn) {
  if (SEDANG_BELAJAR) return null;
  SEDANG_BELAJAR = true;
  try {
    return fn();
  } finally {
    SEDANG_BELAJAR = false;
  }
}

/* Sumber riwayat. Biasanya seluruh jadwal Import yang sudah dimuat;
   bisa diganti untuk pengujian. */
function predictionHistory() {
  if (PREDICTION_HISTORY_OVERRIDE) return PREDICTION_HISTORY_OVERRIDE;
  if (typeof data !== "undefined" && data && Array.isArray(data.import)) {
    return data.import;
  }
  return [];
}

function setPredictionHistory(list) {
  PREDICTION_HISTORY_OVERRIDE = Array.isArray(list) ? list : null;
  resetPredictionLearning();
}

/* Dipanggil tiap kali data berubah. Hasil belajar yang basi lebih
   berbahaya daripada tidak belajar sama sekali: ia terlihat pasti. */
function resetPredictionLearning() {
  PREDICTION_LEARN_CACHE.clear();
}

function learningConfig() {
  return (
    (typeof PREDICTION_CONFIG !== "undefined" && PREDICTION_CONFIG.learning) || {
      enabled: false,
    }
  );
}

function medianOf(angka) {
  if (!angka.length) return null;
  const urut = angka.slice().sort((a, b) => a - b);
  const t = Math.floor(urut.length / 2);
  return urut.length % 2 ? urut[t] : (urut[t - 1] + urut[t]) / 2;
}

function rataRata(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

function simpanganBaku(a) {
  if (a.length < 2) return 0;
  const m = rataRata(a);
  return Math.sqrt(rataRata(a.map((x) => (x - m) * (x - m))));
}

/* Membuang pencilan sebelum dirata-rata.

   Satu kiriman yang tertahan enam minggu karena sengketa dokumen akan
   menarik rata-rata jauh dari kenyataan sehari-hari — lalu angka itu
   dipakai untuk memprediksi kiriman berikutnya yang normal. */
function buangPencilan(angka, sigma) {
  if (!sigma || angka.length < 4) return angka;
  const m = rataRata(angka);
  const sd = simpanganBaku(angka);
  if (!sd) return angka;
  const sisa = angka.filter((x) => Math.abs(x - m) <= sigma * sd);
  return sisa.length >= Math.max(3, Math.floor(angka.length / 2)) ? sisa : angka;
}

/* Selalu mengembalikan objek, tidak pernah null.

   `cukup: false` tetap membawa jumlah sampel yang sudah terkumpul,
   supaya layar bisa menunjukkan "riwayat 5/8" — pengguna melihat mesin
   sedang mengumpulkan, bukan menyangka fiturnya rusak. */
function ringkasSampel(angka) {
  const cfg = learningConfig();
  const butuh = cfg.minSamples || 8;

  if (angka.length < butuh) {
    return { cukup: false, samples: angka.length, need: butuh, reason: "belum cukup" };
  }

  const bersih =
    cfg.method === "median" ? angka : buangPencilan(angka, cfg.outlierSigma);
  const nilai = cfg.method === "median" ? medianOf(bersih) : rataRata(bersih);

  /* GERBANG KETELITIAN. Galat baku rata-rata = simpangan baku / akar n.
     Di atas ambang, riwayatnya tidak cukup teratur untuk dipercaya. */
  const sd = simpanganBaku(bersih);
  const galatBaku = bersih.length ? sd / Math.sqrt(bersih.length) : Infinity;
  const ambang = cfg.maxStdError == null ? Infinity : cfg.maxStdError;
  if (galatBaku > ambang) {
    return {
      cukup: false,
      samples: angka.length,
      need: butuh,
      stdError: Math.round(galatBaku * 100) / 100,
      maxStdError: ambang,
      reason: "terlalu berayun",
    };
  }

  return {
    cukup: true,
    days: Math.max(0, Math.round(nilai)),
    stdError: Math.round(galatBaku * 100) / 100,
    // Statistik lengkap, diminta spesifikasi & dipakai tampilan.
    samples: angka.length,
    used: bersih.length,
    dropped: angka.length - bersih.length,
    avg: Math.round(rataRata(bersih) * 10) / 10,
    min: Math.min.apply(null, bersih),
    max: Math.max.apply(null, bersih),
    stdDev: Math.round(sd * 10) / 10,
    method: cfg.method === "median" ? "median" : "rata-rata (pencilan dibuang)",
  };
}

// Jadwal yang terlalu tua tidak lagi bercerita tentang rute yang sekarang.
function masihRelevan(s) {
  const cfg = learningConfig();
  const batas = cfg.maxAgeDays || 540;
  const acuan = s.etd || s.eta;
  if (!acuan) return false;
  const d = parseLocalDate(acuan);
  if (!d) return false;
  const umur = (Date.now() - d.getTime()) / 86400000;
  return umur >= 0 && umur <= batas;
}

const selisihKalender = (a, b) => calendarDaysBetweenISO(a, b);

/* ------------------------------------------------------------------
   LAMA TRANSIT DARI RIWAYAT
------------------------------------------------------------------ */
function learnedTransitDays(ctx) {
  return denganPenjagaRekursi(() => hitungTransitDariRiwayat(ctx));
}

function hitungTransitDariRiwayat(ctx) {
  const cfg = learningConfig();
  if (!cfg.enabled) return null;

  const kunci = `transit|${ctx.carrier}|${ctx.fromPort}|${ctx.toPort}|${ctx.fromCountry}|${ctx.toCountry}|${ctx.shipmentType}|${ctx.routeType}`;
  if (PREDICTION_LEARN_CACHE.has(kunci)) return PREDICTION_LEARN_CACHE.get(kunci);

  /* PRIORITAS: riwayat CARRIER pada rute ini lebih dulu, baru riwayat
     rute tanpa membedakan pelayaran.

     Selisih antar pelayaran pada rute yang sama bisa beberapa hari —
     HMM 9 hari, MSC 11 hari untuk Busan → Priok. Mencampurnya jadi
     satu angka menghasilkan perkiraan yang tidak pernah tepat untuk
     pelayaran mana pun. */
  const angka = [];
  predictionHistory().forEach((s) => {
    if (!s || s.mode === "export" || !(s.etdUpdate || s.etd)) return;
    if (!masihRelevan(s)) return;

    const c = predictionContext(s);
    if (c.shipmentType !== ctx.shipmentType) return;
    if (c.routeType !== ctx.routeType) return;
    // Rute dicocokkan per pelabuhan kalau keduanya diketahui,
    // kalau tidak turun ke tingkat negara.
    if (ctx.fromPort && ctx.toPort) {
      if (c.fromPort !== ctx.fromPort || c.toPort !== ctx.toPort) return;
    } else {
      if (c.fromCountry !== ctx.fromCountry || c.toCountry !== ctx.toCountry) return;
    }

    /* Tahap SANDAR lebih dulu daripada Manifest: itu tanggal ATA yang
       sebenarnya, sementara BC 1.1 diajukan sebelum kapal sandar.
       Belajar dari angka yang meleset sehari akan mengunci kesalahan
       itu ke dalam seluruh perkiraan rute. */
    // Tahap 1: hanya carrier yang sama (kalau carrier-nya terdeteksi)
    if (ctx.carrier && c.carrier !== ctx.carrier) return;

    const tiba =
      s.ata ||
      milestoneDateOf(s, "berth") ||
      milestoneDateOf(s, "manifest") ||
      (etaModeOf(s) === "manual" ? s.etaUpdate || s.eta : "");
    if (!tiba) return;

    /* Diukur dari ETD yang BERLAKU. Kapal yang berangkat lima hari
       telat lalu berlayar 20 hari akan tercatat "transit 25 hari"
       kalau diukur dari jadwal rencana — dan angka itu kemudian
       dipakai untuk memprediksi kapal yang berangkat tepat waktu. */
    const etdNyata = s.etdUpdate || s.etd;
    const n = selisihKalender(etdNyata, tiba);
    if (n == null || n < 0 || n > 200) return;
    angka.push(n);
  });

  let hasil = ringkasSampel(angka);
  hasil = { ...hasil, scope: ctx.carrier ? "carrier" : "rute" };

  /* Tahap 2: kalau riwayat per-carrier belum cukup, ulangi tanpa
     menyaring carrier. Lebih baik angka rute yang tercampur daripada
     mundur ke asumsi konfigurasi. */
  if (!hasil.cukup && ctx.carrier) {
    const tanpaCarrier = hitungTransitDariRiwayat({ ...ctx, carrier: "" });
    if (tanpaCarrier && tanpaCarrier.cukup) {
      hasil = { ...tanpaCarrier, scope: "rute" };
    }
  }

  PREDICTION_LEARN_CACHE.set(kunci, hasil);
  return hasil;
}

/* ------------------------------------------------------------------
   LAMA PROSES DARAT DARI RIWAYAT

   `leg` = "clearance" atau "delivery". Dihitung dalam HARI KERJA, sama
   seperti konfigurasinya, supaya angkanya bisa langsung menggantikan.

   Clearance diukur dari BARANG SIAP DIURUS, bukan dari PIB diajukan:

     barang siap = kedatangan (+ stripping kalau LCL)
     mulai       = max(barang siap, tanggal PIB)

   Mengukurnya dari PIB akan mencatat waktu tunggu kapal sebagai waktu
   kepabeanan. PIB yang masuk seminggu sebelum kapal sandar akan
   terbaca sebagai "clearance sembilan hari", lalu angka itu dipakai
   untuk seluruh rute — kesalahan yang membesar sendiri.
------------------------------------------------------------------ */
function learnedOpsDays(ctx, leg) {
  return denganPenjagaRekursi(() => hitungOpsDariRiwayat(ctx, leg));
}

function hitungOpsDariRiwayat(ctx, leg) {
  const cfg = learningConfig();
  if (!cfg.enabled) return null;

  const kunci = `ops|${leg}|${ctx.shipmentType}|${ctx.toPort || ctx.toCountry}`;
  if (PREDICTION_LEARN_CACHE.has(kunci)) return PREDICTION_LEARN_CACHE.get(kunci);

  const angka = [];
  predictionHistory().forEach((s) => {
    if (!s || s.mode === "export") return;
    if (!masihRelevan(s)) return;

    const c = predictionContext(s);
    if (c.shipmentType !== ctx.shipmentType) return;
    const tujuan = ctx.toPort || ctx.toCountry;
    if (tujuan && (c.toPort || c.toCountry) !== tujuan) return;

    let dari = "";
    let sampai = "";
    if (leg === "clearance") {
      const tiba =
        s.ata || milestoneDateOf(s, "berth") || milestoneDateOf(s, "manifest");
      const sppb = milestoneDateOf(s, "sppb");
      if (!tiba || !sppb) return;
      // configuredOpsDays, BUKAN predictionOpsDays: yang belajar tidak
      // boleh bertanya pada yang sudah belajar.
      const ops = configuredOpsDays(c);
      /* advanceLeg, bukan addWorkingDaysISO: stripping memakai hari
         kalender. Salah satuan di sini akan mencatat akhir pekan
         sebagai waktu kepabeanan, lalu angka itu dipakai untuk seluruh
         rute — kesalahan yang mengajari dirinya sendiri. */
      const siap = predictionStrippingApplies(c)
        ? advanceLeg(tiba, ops.stripping, "stripping")
        : tiba;
      const pib = milestoneDateOf(s, "pib");
      dari = pib && pib > siap ? pib : siap;
      sampai = sppb;
    } else if (leg === "delivery") {
      dari = milestoneDateOf(s, "sppb");
      sampai = s.factoryDate || "";
    }
    if (!dari || !sampai) return;

    const n = workingDaysBetweenISO(dari, sampai);
    if (n == null || n < 0 || n > 60) return;
    angka.push(n);
  });

  const hasil = ringkasSampel(angka);
  PREDICTION_LEARN_CACHE.set(kunci, hasil);
  return hasil;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    setPredictionHistory,
    resetPredictionLearning,
    learnedTransitDays,
    learnedOpsDays,
  };
}
