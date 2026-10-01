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

   Riwayat DIGABUNG dengan angka konfigurasi, berbobot menurut jumlah,
   kebaruan, dan konsistensi kirimannya -- lihat ringkasSampel().

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

/* Sumber riwayat. Biasanya seluruh jadwal yang sudah dimuat -- Import
   DAN Export (lama transit rute ekspor ikut belajar; proses darat
   hanya dari Import); bisa diganti untuk pengujian & uji mundur. */
function predictionHistory() {
  if (PREDICTION_HISTORY_OVERRIDE) return PREDICTION_HISTORY_OVERRIDE;
  if (typeof data !== "undefined" && data && Array.isArray(data.import)) {
    return Array.isArray(data.export) ? data.import.concat(data.export) : data.import;
  }
  return [];
}

function setPredictionHistory(list) {
  PREDICTION_HISTORY_OVERRIDE = Array.isArray(list) ? list : null;
  resetPredictionLearning();
}

/* GENERASI DATA. Sampel per kiriman (sampelKiriman) berlaku selama
   generasinya sama; begitu data berubah, semuanya dihitung ulang. */
let GENERASI_BELAJAR = 0;

/* Dipanggil tiap kali data berubah. Hasil belajar yang basi lebih
   berbahaya daripada tidak belajar sama sekali: ia terlihat pasti. */
function resetPredictionLearning() {
  GENERASI_BELAJAR++;
  kosongkanRingkasanBelajar();
}

/* Hanya ringkasan per rute yang dibuang -- sampel per kiriman tetap.
   Dipakai saat yang berubah cuma PILIHAN riwayatnya (uji mundur),
   bukan isi kirimannya. */
function kosongkanRingkasanBelajar() {
  PREDICTION_LEARN_CACHE.clear();
  ACUAN_BELAJAR.ms = null;
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

/* ------------------------------------------------------------------
   TANGGAL ACUAN "SEKARANG"

   Umur sampel (untuk relevansi & bobot kebaruan) dihitung dari tanggal
   ini. Biasanya hari ini; uji mundur menyetelnya ke ETD kiriman yang
   sedang diuji, supaya riwayat dibaca seperti saat kiriman itu
   direncanakan -- bukan dengan pengetahuan dari masa depannya.
------------------------------------------------------------------ */
let PREDICTION_LEARN_ASOF = null;
const ACUAN_BELAJAR = { ms: null };

function setPredictionAsOf(iso) {
  PREDICTION_LEARN_ASOF = iso || null;
  kosongkanRingkasanBelajar();
}

// Dihitung sekali per ringkasan, bukan per kiriman yang disapu.
function acuanBelajarMs() {
  if (ACUAN_BELAJAR.ms == null) {
    const d = PREDICTION_LEARN_ASOF ? parseLocalDate(PREDICTION_LEARN_ASOF) : null;
    ACUAN_BELAJAR.ms = d ? d.getTime() : Date.now();
  }
  return ACUAN_BELAJAR.ms;
}

const msTanggal = (iso) => {
  const d = iso ? parseLocalDate(iso) : null;
  return d ? d.getTime() : null;
};

/* Rentang "berayun" yang wajar, per tipe pengiriman. Dipakai saat
   sampelnya terlalu sedikit untuk mengukur sebarannya sendiri. */
function sebaranTipe(peta, tipe) {
  if (peta && typeof peta === "object") {
    if (peta[tipe] != null) return Number(peta[tipe]);
    if (peta.default != null) return Number(peta.default);
  }
  return 1.5;
}

function medianBerbobot(sampel) {
  const urut = sampel.slice().sort((a, b) => a.n - b.n);
  const total = urut.reduce((x, y) => x + y.w, 0);
  let jalan = 0;
  for (let i = 0; i < urut.length; i++) {
    jalan += urut[i].w;
    if (jalan >= total / 2) return urut[i].n;
  }
  return urut.length ? urut[urut.length - 1].n : null;
}

/* PENCILAN DIBUANG DENGAN MEDIAN & MAD, bukan rata-rata & simpangan baku.

   Aturan "lebih dari 2 simpangan baku dari rata-rata" punya titik buta:
   pencilannya sendiri ikut menggelembungkan rata-rata dan simpangan
   bakunya, sehingga ia lolos dari saringan yang dibuat untuk
   menangkapnya. Median dan MAD (simpangan mutlak dari median) tidak
   terpengaruh satu-dua angka ekstrem. 1,4826 menyetarakan MAD dengan
   simpangan baku pada sebaran normal, jadi outlierSigma tetap terbaca
   "sekian simpangan baku". */
function buangPencilan(sampel, sigma) {
  if (!sigma || sampel.length < 4) return sampel;
  const angka = sampel.map((x) => x.n);
  const med = medianOf(angka);
  const mad = medianOf(angka.map((x) => Math.abs(x - med))) * 1.4826;
  // Lantai setengah hari: tanpa ini, riwayat yang hampir seragam
  // (MAD 0) akan membuang setiap angka yang meleset sehari saja.
  const batas = sigma * Math.max(mad, 0.5);
  const sisa = sampel.filter((x) => Math.abs(x.n - med) <= batas);
  return sisa.length >= Math.max(2, Math.ceil(sampel.length / 2)) ? sisa : sampel;
}

/* ------------------------------------------------------------------
   INTI BELAJAR — riwayat DITARIK ke asumsi, bukan menggantikannya.

   Dulu riwayat bersifat semua-atau-tidak: di bawah 8 kiriman diabaikan
   sepenuhnya, dari kiriman ke-8 menggantikan angka konfigurasi
   sepenuhnya. Dengan volume DDI (puluhan kiriman tersebar di belasan
   rute & pelayaran) kebanyakan rute TIDAK PERNAH mencapai 8, sehingga
   bukti nyata yang sudah ada -- 3, 5, 7 kiriman yang konsisten
   meleset dari konfigurasi -- tidak pernah dipakai.

   Sekarang keduanya digabung, dengan bobot sesuai seberapa banyak dan
   seberapa konsisten buktinya:

     hasil = w * rata-rata riwayat + (1 - w) * asumsi
     w     = n / (n + (sebaran / ketidakpastian asumsi)^2)

   - n kiriman TERKINI berbobot penuh; yang lebih tua menyusut separuh
     tiap halfLifeDays -- jadwal pelayaran berubah.
   - Riwayat yang konsisten (sebaran kecil) cepat dipercaya: dua-tiga
     kiriman sudah menarik angkanya. Riwayat yang berayun liar perlu
     jauh lebih banyak kiriman sebelum berpengaruh -- pengganti gerbang
     "terlalu berayun" yang dulu menolaknya mentah-mentah.
   - Asumsi konfigurasi tidak pernah hilang sama sekali, tapi pada
     puluhan kiriman konsisten bobotnya tinggal beberapa persen.

   Ini bentuk baku penggabungan dugaan awal dengan pengamatan (model
   normal-normal). Selalu mengembalikan objek: `cukup: false` membawa
   jumlah sampel yang sudah terkumpul, supaya layar bisa menunjukkan
   "riwayat 1/2" -- pengguna melihat mesin sedang mengumpulkan.
------------------------------------------------------------------ */
function ringkasSampel(sampel, prior, tipe) {
  const cfg = learningConfig();
  const butuh = cfg.minSamples || 2;

  if (sampel.length < butuh) {
    return { cukup: false, samples: sampel.length, need: butuh, reason: t("w.belum.cukup") };
  }

  const bersih = buangPencilan(sampel, cfg.outlierSigma);
  const totalBobot = bersih.reduce((x, y) => x + y.w, 0) || 1;
  const rata = bersih.reduce((x, y) => x + y.w * y.n, 0) / totalBobot;
  const pusat = cfg.method === "median" ? medianBerbobot(bersih) : rata;
  const sd =
    bersih.length > 1
      ? Math.sqrt(bersih.reduce((x, y) => x + y.w * (y.n - rata) * (y.n - rata), 0) / totalBobot)
      : 0;

  // Sebaran yang dipakai menimbang: diukur sendiri kalau sampelnya
  // cukup (>= 3), kalau tidak memakai sebaran wajar tipe ini.
  const sebaran = bersih.length >= 3 ? Math.max(sd, 0.5) : sebaranTipe(cfg.typicalSpreadDays, tipe);
  const ragu = sebaranTipe(cfg.priorSpreadDays, tipe);
  const k = prior == null ? 0 : (sebaran * sebaran) / (ragu * ragu);
  const bobotRiwayat = totalBobot / (totalBobot + k);
  const nilai = prior == null ? pusat : bobotRiwayat * pusat + (1 - bobotRiwayat) * prior;
  const nilaiBersih = bersih.map((x) => x.n);

  return {
    cukup: true,
    days: Math.max(0, Math.round(nilai)),
    exact: Math.round(nilai * 100) / 100,
    // Seberapa besar riwayat menentukan angkanya (0-1); sisanya asumsi.
    weight: Math.round(bobotRiwayat * 100) / 100,
    prior: prior == null ? null : Math.round(prior * 10) / 10,
    center: Math.round(pusat * 10) / 10,
    // Statistik lengkap, diminta spesifikasi & dipakai tampilan.
    samples: sampel.length,
    used: bersih.length,
    dropped: sampel.length - bersih.length,
    effective: Math.round(totalBobot * 10) / 10,
    avg: Math.round(rata * 10) / 10,
    min: Math.min.apply(null, nilaiBersih),
    max: Math.max.apply(null, nilaiBersih),
    stdDev: Math.round(sd * 10) / 10,
    stdError: Math.round((sd / Math.sqrt(totalBobot)) * 100) / 100,
    method: cfg.method === "median" ? "median" : t("z.rata.rata.pencilan.dibuang"),
  };
}

// Jadwal yang terlalu tua tidak lagi bercerita tentang rute yang sekarang.
function masihRelevan(s) {
  const cfg = learningConfig();
  const batas = cfg.maxAgeDays || 540;
  const t = sampelKiriman(s).tAcuan;
  if (t == null) return false;
  const umur = (acuanBelajarMs() - t) / 86400000;
  return umur >= 0 && umur <= batas;
}

/* Bobot kebaruan: kiriman setua halfLifeDays dihitung setengah. */
function bobotKebaruan(tMs) {
  const cfg = learningConfig();
  const paruh = cfg.halfLifeDays || 0;
  if (!paruh || tMs == null) return 1;
  const umur = (acuanBelajarMs() - tMs) / 86400000;
  return Math.pow(0.5, Math.max(0, umur) / paruh);
}

const selisihKalender = (a, b) => calendarDaysBetweenISO(a, b);

/* ------------------------------------------------------------------
   SAMPEL PER KIRIMAN, DIHITUNG SEKALI.

   Setiap rute yang diprediksi menyapu SELURUH riwayat, dan tiap kiriman
   di riwayat butuh konteks rute (resolusi pelabuhan & carrier) serta
   hitungan hari kerja (perulangan per hari dengan kalender libur).
   Seratus kartu x tiga lapis x ratusan kiriman riwayat = ratusan ribu
   perhitungan yang hasilnya sama terus.

   Yang bergantung pada KIRIMANNYA saja (bukan pada rute yang sedang
   diprediksi) dihitung sekali per GENERASI data: resetPredictionLearning()
   -- dipanggil tiap data dimuat ulang atau sebuah kiriman diubah --
   membuat semuanya dihitung ulang.
------------------------------------------------------------------ */
/* Kunci forwarder: "PT. Freight Express Indonesia" dan "FREIGHT
   EXPRESS" adalah forwarder yang sama. Bentuk badan usaha & kata yang
   ditempel di hampir semua nama dibuang, sisanya dibandingkan utuh. */
function kunciForwarder(nama) {
  return String(nama || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((k) => k && ["PT", "CV", "TBK", "LTD", "CO", "INDONESIA", "INTERNATIONAL", "INTL"].indexOf(k) < 0)
    .join(" ");
}

const SAMPEL_KIRIMAN = new WeakMap();
function sampelKiriman(s) {
  const ada = SAMPEL_KIRIMAN.get(s);
  if (ada && ada.gen === GENERASI_BELAJAR) return ada;

  const tgl = (k) => milestoneDateOf(s, k);
  const ctx = predictionContext(s);
  const etdNyata = s.etdUpdate || s.etd || "";
  const out = {
    gen: GENERASI_BELAJAR, ctx, etdNyata, transit: null, clearance: null, delivery: null,
    fwd: kunciForwarder(s.forwarder),
    tAcuan: msTanggal(s.etd || s.eta), tEtd: msTanggal(etdNyata), tSppb: null, tPabrik: null,
  };

  // Transit: ETD berlaku -> kedatangan nyata (lihat hitungTransitDariRiwayat)
  const tiba =
    s.ata || tgl("berth") || tgl("manifest") || (etaModeOf(s) === "manual" ? s.etaUpdate || s.eta : "");
  if (etdNyata && tiba) {
    const n = selisihKalender(etdNyata, tiba);
    if (n != null && n >= 0 && n <= 200) out.transit = n;
  }

  if (s.mode !== "export") {
    const tibaNyata = s.ata || tgl("berth") || tgl("manifest");
    const sppb = tgl("sppb");
    if (tibaNyata && sppb) {
      const ops = configuredOpsDays(ctx);
      const siap = predictionStrippingApplies(ctx) ? advanceLeg(tibaNyata, ops.stripping, "stripping") : tibaNyata;
      const pib = tgl("pib");
      const dari = pib && pib > siap ? pib : siap;
      const n = workingDaysBetweenISO(dari, sppb);
      if (n != null && n >= 0 && n <= 60) out.clearance = n;
    }
    if (sppb && s.factoryDate) {
      const n = workingDaysBetweenISO(sppb, s.factoryDate);
      if (n != null && n >= 0 && n <= 60) out.delivery = n;
    }
    out.tSppb = msTanggal(sppb);
    out.tPabrik = msTanggal(s.factoryDate);
  }

  SAMPEL_KIRIMAN.set(s, out);
  return out;
}

/* Transit yang DISENGAJA: berlabel Transit DAN terminal transitnya
   diisi. Label Direct tidak membuktikan apa-apa -- ia nilai bawaan. */
function transitSengaja(s) {
  return (
    !!s &&
    s.routeType === "transit" &&
    (s.routeStops || []).some((x) => String((x && x.terminal) || "").trim())
  );
}

/* ------------------------------------------------------------------
   LAMA TRANSIT DARI RIWAYAT

   `prior` = angka konfigurasi untuk rute ini, SUDAH termasuk
   penyesuaian carrier/forwarder kalau ada. Riwayat menariknya ke arah
   kenyataan -- penyesuaian manual itu berangsur tergantikan begitu
   kiriman forwarder tersebut terkumpul, tanpa dihitung dua kali.
------------------------------------------------------------------ */
function learnedTransitDays(ctx, prior) {
  return denganPenjagaRekursi(() => hitungTransitDariRiwayat(ctx, prior));
}

function hitungTransitDariRiwayat(ctx, prior) {
  const cfg = learningConfig();
  if (!cfg.enabled) return null;

  const dari = ctx.fromMetro || ctx.fromPort;
  const ke = ctx.toMetro || ctx.toPort;
  const kunci = `transit|${ctx.carrier}|${dari}|${ke}|${ctx.fromCountry}|${ctx.toCountry}|${ctx.shipmentType}|${ctx.routeType}|${prior}`;
  if (PREDICTION_LEARN_CACHE.has(kunci)) return PREDICTION_LEARN_CACHE.get(kunci);

  /* Impor DAN ekspor. Rute ekspor (Jakarta -> Busan) dulu tidak pernah
     belajar karena riwayatnya disaring keluar; kedatangannya tercatat
     lewat ETA manual dari forwarder, bukti yang sama sahnya. */
  const sampelRute = [];
  predictionHistory().forEach((s) => {
    if (!s || !(s.etdUpdate || s.etd)) return;
    if (!masihRelevan(s)) return;

    const k = sampelKiriman(s);
    if (k.transit == null) return;
    const c = k.ctx;
    if (c.shipmentType !== ctx.shipmentType) return;
    // Rute dicocokkan per pelabuhan INDUK kalau keduanya diketahui
    // (Shekou & Yantian = Shenzhen), kalau tidak turun ke tingkat negara.
    if (dari && ke) {
      if ((c.fromMetro || c.fromPort) !== dari || (c.toMetro || c.toPort) !== ke) return;
    } else {
      if (c.fromCountry !== ctx.fromCountry || c.toCountry !== ctx.toCountry) return;
    }

    /* Angkanya (sampelKiriman): ETD BERLAKU -> kedatangan nyata.
       Kedatangan = ATA, tahap Sandar, lalu Manifest -- Sandar lebih
       dulu karena BC 1.1 diajukan sebelum kapal sandar. ETA otomatis
       sengaja TIDAK dipakai: mempelajari keluaran sendiri hanya
       meneguhkan asumsi awal berulang-ulang. ETD berlaku, bukan
       rencana: kapal yang berangkat lima hari telat lalu berlayar 20
       hari akan tercatat "transit 25 hari" kalau diukur dari rencana. */
    sampelRute.push({ n: k.transit, w: bobotKebaruan(k.tEtd), carrier: c.carrier, transitSengaja: transitSengaja(s) });
  });

  /* TIPE RUTE YANG TERCATAT TIDAK DIPERCAYA BUTA.

     "Direct" adalah nilai bawaan form -- di riwayat DDI hampir semua
     kiriman tercatat Direct karena rute aslinya memang tidak diketahui
     saat diisi, bukan karena kapalnya benar-benar langsung. Yang PASTI
     disengaja hanya Transit yang terminal transitnya diisi.

     Lama transit yang dipelajari diukur dari tanggal nyata (ETD ->
     kedatangan), jadi sudah mencerminkan apakah kirimannya singgah atau
     tidak -- apa pun label rutenya. Karena itu:

       prediksi Direct  : semua riwayat KECUALI Transit yang disengaja;
       prediksi Transit : Transit yang disengaja kalau cukup; kalau
                          belum, seluruh riwayat rute ini (yang tercatat
                          Direct bisa saja sebenarnya singgah).

     Dulu riwayat dipisah mentah menurut labelnya: begitu sebuah kiriman
     ditandai Transit -- misalnya oleh Rute Otomatis -- ia tidak lagi
     belajar dari satu pun kiriman lamanya, semuanya berlabel Direct. */
  const butuh = learningConfig().minSamples || 2;
  const sengaja = sampelRute.filter((x) => x.transitSengaja);
  const terpakai =
    ctx.routeType === "transit"
      ? sengaja.length >= butuh
        ? sengaja
        : sampelRute
      : sampelRute.filter((x) => !x.transitSengaja);

  /* DUA TINGKAT. Rute (semua pelayaran) ditarik ke angka konfigurasi;
     pelayaran yang dicari ditarik ke hasil rute itu. Selisih antar
     pelayaran pada rute yang sama bisa beberapa hari -- HMM 9 hari, MSC
     11 hari untuk Busan -> Priok -- tapi dua kiriman HMM saja belum
     cukup untuk mengabaikan apa yang diketahui tentang rutenya. */
  const rute = ringkasSampel(terpakai, prior, ctx.shipmentType);
  let hasil = { ...rute, scope: "rute" };
  if (rute.cukup && ctx.carrier) {
    const milikCarrier = terpakai.filter((x) => x.carrier === ctx.carrier);
    const perCarrier = ringkasSampel(milikCarrier, rute.exact, ctx.shipmentType);
    if (perCarrier.cukup) {
      hasil = { ...perCarrier, prior: prior == null ? null : Math.round(prior * 10) / 10, routeDays: rute.exact, scope: "carrier" };
    }
  }

  PREDICTION_LEARN_CACHE.set(kunci, hasil);
  return hasil;
}

/* ------------------------------------------------------------------
   LAMA PROSES DARAT DARI RIWAYAT

   `leg` = "clearance" atau "delivery". Dihitung dalam HARI KERJA, sama
   seperti konfigurasinya, supaya angkanya bisa langsung menggantikan.
   `prior` = angka konfigurasi leg itu (configuredOpsDays).

   Clearance diukur dari BARANG SIAP DIURUS, bukan dari PIB diajukan:

     barang siap = kedatangan (+ stripping kalau LCL)
     mulai       = max(barang siap, tanggal PIB)

   Mengukurnya dari PIB akan mencatat waktu tunggu kapal sebagai waktu
   kepabeanan. PIB yang masuk seminggu sebelum kapal sandar akan
   terbaca sebagai "clearance sembilan hari", lalu angka itu dipakai
   untuk seluruh rute — kesalahan yang membesar sendiri.
------------------------------------------------------------------ */
function learnedOpsDays(ctx, leg, prior) {
  return denganPenjagaRekursi(() => hitungOpsDariRiwayat(ctx, leg, prior));
}

function hitungOpsDariRiwayat(ctx, leg, prior) {
  const cfg = learningConfig();
  if (!cfg.enabled) return null;

  const tujuan = ctx.toMetro || ctx.toPort || ctx.toCountry;
  const fwd = kunciForwarder(ctx.forwarder);
  const kunci = `ops|${leg}|${ctx.shipmentType}|${tujuan}|${fwd}|${prior}`;
  if (PREDICTION_LEARN_CACHE.has(kunci)) return PREDICTION_LEARN_CACHE.get(kunci);

  const sampel = [];
  predictionHistory().forEach((s) => {
    if (!s || s.mode === "export") return;
    if (!masihRelevan(s)) return;

    const k = sampelKiriman(s);
    const n = leg === "clearance" ? k.clearance : leg === "delivery" ? k.delivery : null;
    if (n == null) return;
    const c = k.ctx;
    if (c.shipmentType !== ctx.shipmentType) return;
    if (tujuan && (c.toMetro || c.toPort || c.toCountry) !== tujuan) return;
    sampel.push({ n, w: bobotKebaruan(leg === "clearance" ? k.tSppb : k.tPabrik), fwd: k.fwd });
  });

  /* DUA TINGKAT, seperti lama transit per pelayaran: rute (semua
     forwarder) ditarik ke konfigurasi, forwarder yang dipakai ditarik
     ke hasil rute itu.

     Kecepatan pengurusan berbeda per forwarder: ada yang SPPB-nya
     keluar sehari setelah sandar, ada yang tiga hari; ada yang truknya
     siap begitu SPPB terbit, ada yang menunggu jadwal armada. Rata-rata
     semua forwarder meleset untuk masing-masing. */
  const rute = ringkasSampel(sampel, prior, "ops");
  let hasil = { ...rute, scope: "rute" };
  if (rute.cukup && fwd) {
    const milikFwd = sampel.filter((x) => x.fwd === fwd);
    const perFwd = ringkasSampel(milikFwd, rute.exact, "ops");
    if (perFwd.cukup) {
      hasil = { ...perFwd, prior: prior == null ? null : Math.round(prior * 10) / 10, routeDays: rute.exact, scope: "forwarder" };
    }
  }
  PREDICTION_LEARN_CACHE.set(kunci, hasil);
  return hasil;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    setPredictionHistory,
    setPredictionAsOf,
    resetPredictionLearning,
    learnedTransitDays,
    learnedOpsDays,
  };
}
