"use strict";
/* Uji perilaku mesin prediksi — tanpa DOM sama sekali. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const ctx = { console, module: { exports: {} } };
vm.createContext(ctx);

// Hanya potongan helpers yang dibutuhkan mesin (helpers.js penuh butuh DOM-less saja, aman)
["js/core/helpers.js",
 "js/core/unlocode.js",
 "js/core/prediction-config.js",
 "js/core/prediction-rules.js",
 "js/core/workdays.js",
 "js/core/carrier-master.js",
 "js/core/prediction-route.js",
 "js/core/prediction-milestones.js",
 "js/core/prediction-eta.js",
 "js/core/prediction-confidence.js",
 "js/core/prediction-schedule.js",
 "js/core/prediction.js",
 /* Model jalur rute: posisi simpul & penanda kapal. Uji posisinya
    aritmetika murni, jadi tempatnya di sini, bukan di dom-test. */
 "js/core/route-model.js"].forEach((f) => {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  ctx.module = { exports: {} };
  vm.runInContext(src, ctx, { filename: f });
});

/* ------------------------------------------------------------------
   "HARI INI" DIBEKUKAN

   Seluruh berkas ini memakai tanggal yang ditulis mati (ETA 08-08-2026
   dan hasil-hasil di sekitarnya). Mesinnya punya Lapis 4
   ("Kenyataan") yang menjangkarkan ulang sisa proses ke HARI INI kalau
   perkiraannya sudah lewat — perilaku yang memang diinginkan, karena
   perkiraan bertanggal masa lalu tidak memberi tahu apa pun.

   Akibatnya ujinya punya masa kedaluwarsa: begitu jam dinding melewati
   tanggal-tanggal itu, lapis kenyataan ikut campur dan uji mulai
   berjatuhan satu per satu — bukan karena mesinnya rusak, tapi karena
   kalendernya berjalan. Dua di antaranya ("FCL langsung clearance",
   "AIR juga tanpa stripping") sudah gagal seperti itu.

   Dibekukan pada 09-08-2026: sehari setelah ETA fixture, sebelum
   satu pun hasil yang diuji. Uji yang memang ingin menguji lapis
   kenyataan harus menyetel tanggalnya sendiri, bukan mengandalkan
   kapan ia kebetulan dijalankan.
------------------------------------------------------------------ */
const HARI_INI_UJI = "2026-08-09";
vm.runInContext(`todayISO = () => ${JSON.stringify(HARI_INI_UJI)};`, ctx);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || "") + ` diharap ${JSON.stringify(b)}, dapat ${JSON.stringify(a)}`);
}

const {
  predictEta, predictDelivery, predictionShipmentType, etaModeOf,
  addWorkingDaysISO, addCalendarDaysISO, isWorkingDayISO, recomputeShipmentDates,
  predictionOpsDays, predictionContext, pickPredictionRule,
  predictEtaRevised, predictionEtaBasis, calendarDaysBetweenISO,
  arrivalInfoOf, configuredOpsDays, todayISO,
  beriJarakMinimum, petakanProgres,
} = ctx;

/* `const` di dalam vm tidak menempel ke objek konteks (beda dengan
   deklarasi function), jadi diambil lewat evaluasi. */
const PREDICTION_CONFIG = vm.runInContext("PREDICTION_CONFIG", ctx);

console.log("\n— HARI KERJA —");
// 2026-08-07 = Jumat
t("Jumat + 1 hari kerja = Senin", () => eq(addWorkingDaysISO("2026-08-07", 1), "2026-08-10"));
t("Jumat + 2 hari kerja = Selasa", () => eq(addWorkingDaysISO("2026-08-07", 2), "2026-08-11"));
t("Jumat + 0 hari kerja = tetap Jumat", () => eq(addWorkingDaysISO("2026-08-07", 0), "2026-08-07"));
t("Sabtu + 1 hari kerja = Senin", () => eq(addWorkingDaysISO("2026-08-08", 1), "2026-08-10"));
t("Minggu + 1 hari kerja = Senin", () => eq(addWorkingDaysISO("2026-08-09", 1), "2026-08-10"));
t("Senin + 5 hari kerja = Senin berikutnya", () => eq(addWorkingDaysISO("2026-08-10", 5), "2026-08-17"));
t("Sabtu bukan hari kerja", () => eq(isWorkingDayISO("2026-08-08"), false));
t("Senin hari kerja", () => eq(isWorkingDayISO("2026-08-10"), true));
t("transit pakai hari KALENDER (lewat akhir pekan)", () => eq(addCalendarDaysISO("2026-08-07", 3), "2026-08-10"));

console.log("— HARI LIBUR —");
t("libur nasional dilompati", () => {
  PREDICTION_CONFIG.calendar.holidays = ["2026-08-17"];
  eq(addWorkingDaysISO("2026-08-14", 1), "2026-08-18"); // Jum 14 -> Sen 17 libur -> Sel 18
  PREDICTION_CONFIG.calendar.holidays = [];
});

console.log("— TIPE PENGIRIMAN —");
t("udara -> AIR", () => eq(predictionShipmentType({ transport: "udara" }), "AIR"));
t("laut + LCL -> SEA_LCL", () => eq(predictionShipmentType({ transport: "laut", muatan: "LCL" }), "SEA_LCL"));
t("laut + FCL -> SEA_FCL", () => eq(predictionShipmentType({ transport: "laut", muatan: "FCL" }), "SEA_FCL"));
t("laut tanpa muatan -> bawaan FCL", () => eq(predictionShipmentType({ transport: "laut" }), "SEA_FCL"));

console.log("— MESIN 1: ETA —");
/* Incheon sengaja: Busan kini punya entri Master Route per pelabuhan &
   per carrier, jadi tidak lagi mewakili aturan NEGARA. */
const KR = { etd: "2026-08-03", origin: "KRINC", destination: "IDTPP", routeType: "direct" };
t("SEA FCL direct KR->ID = ETD + 11", () =>
  eq(predictEta({ ...KR, transport: "laut", muatan: "FCL" }).eta, "2026-08-14"));
t("SEA FCL transit KR->ID = ETD + 14", () =>
  eq(predictEta({ ...KR, transport: "laut", muatan: "FCL", routeType: "transit" }).eta, "2026-08-17"));
t("SEA LCL direct KR->ID = ETD + 17", () =>
  eq(predictEta({ ...KR, transport: "laut", muatan: "LCL" }).eta, "2026-08-20"));
t("SEA LCL transit KR->ID = ETD + 21", () =>
  eq(predictEta({ ...KR, transport: "laut", muatan: "LCL", routeType: "transit" }).eta, "2026-08-24"));
t("AIR direct KR->ID = ETD + 1", () =>
  eq(predictEta({ ...KR, transport: "udara", origin: "KRICN", destination: "IDCGK" }).eta, "2026-08-04"));
t("AIR transit KR->ID = ETD + 3", () =>
  eq(predictEta({ ...KR, transport: "udara", origin: "KRICN", destination: "IDCGK", routeType: "transit" }).eta, "2026-08-06"));
t("rute tak terdaftar pakai aturan bawaan (JP->ID FCL = +14)", () =>
  eq(predictEta({ ...KR, origin: "JPYOK", transport: "laut", muatan: "FCL" }).eta, "2026-08-17"));
t("tanpa ETD -> tidak ok", () => eq(predictEta({ ...KR, etd: "" }).ok, false));
t("ETA tidak terpengaruh dokumen", () => {
  const a = predictEta({ ...KR, transport: "laut", muatan: "FCL" }).eta;
  const b = predictEta({ ...KR, transport: "laut", muatan: "FCL",
    docProgress: { manifest: { date: "2026-08-01" }, pib: { date: "2026-08-02" }, sppb: { date: "2026-08-02" } } }).eta;
  eq(a, b);
});

console.log("— MODE ETA —");
t("data lama dengan ETA -> manual", () => eq(etaModeOf({ eta: "2026-08-14" }), "manual"));
t("data lama tanpa ETA -> auto", () => eq(etaModeOf({ eta: "" }), "auto"));
t("etaMode eksplisit menang", () => eq(etaModeOf({ eta: "2026-08-14", etaMode: "auto" }), "auto"));
t("mode manual: mesin TIDAK menimpa eta", () => {
  const s = { mode: "import", etaMode: "manual", eta: "2026-09-01", ...KR, transport: "laut", muatan: "FCL" };
  eq(recomputeShipmentDates(s).eta, undefined);
});
t("mode auto: mesin menimpa eta", () => {
  const s = { mode: "import", etaMode: "auto", eta: "2026-09-01", ...KR, transport: "laut", muatan: "FCL" };
  eq(recomputeShipmentDates(s).eta, "2026-08-14");
});

console.log("— MESIN 2: ESTIMATED DELIVERY —");
const base = { mode: "import", ...KR, transport: "laut", muatan: "FCL", etaMode: "manual" };
// ETA 2026-08-14 = Jumat.  FCL: clearance 2 wd + delivery 2 wd
t("dari ETA saja: FCL Jum + clearance1 + antar1 = Selasa 18", () =>
  eq(predictDelivery({ ...base, eta: "2026-08-14" }).date, "2026-08-18"));
t("sumbernya ETA", () => eq(predictDelivery({ ...base, eta: "2026-08-14" }).source, "eta"));
t("keyakinan ETA manual = 65% (Medium High)", () =>
  eq(predictDelivery({ ...base, eta: "2026-08-14" }).confidence.percent, 65));
t("keyakinan ETA auto = 50% (Medium)", () =>
  eq(predictDelivery({ ...base, etaMode: "auto", eta: "2026-08-14" }).confidence.percent, 50));
t("ETA belum bisa dihitung = 25% (Low)", () =>
  eq(predictDelivery({ ...base, eta: "", etd: "" }).confidence.percent, 25));
const punyaStripping = (d) => d.steps.some((s) => s.key === "stripping");
t("LCL ikut stripping", () => {
  const d = predictDelivery({ ...base, muatan: "LCL", eta: "2026-08-14" });
  eq(punyaStripping(d), true);
  // Jum14 + stripping 2 hari KALENDER = Min16 · clearance Sen17 · antar Sel18
  eq(d.date, "2026-08-18");
});
t("FCL tidak ikut stripping", () => {
  eq(punyaStripping(predictDelivery({ ...base, eta: "2026-08-14" })), false);
});
t("AIR tidak ikut stripping", () => {
  eq(punyaStripping(predictDelivery({ ...base, transport: "udara", muatan: "" , eta: "2026-08-14" })), false);
});
t("AIR: clearance 1 + delivery 1", () => {
  const d = predictDelivery({ ...base, transport: "udara", muatan: "", eta: "2026-08-10" });
  eq(d.date, "2026-08-12");
});
t("Estimated Delivery TIDAK dihitung dari ETD", () => {
  const a = predictDelivery({ ...base, eta: "2026-08-14", etd: "2026-08-03" }).date;
  const b = predictDelivery({ ...base, eta: "2026-08-14", etd: "2026-01-01" }).date;
  eq(a, b);
});
t("pakai etaUpdate kalau jadwal dimundurkan", () =>
  eq(predictDelivery({ ...base, eta: "2026-08-14", etaUpdate: "2026-08-21" }).date, "2026-08-25"));
t("tanpa ETA -> tidak ok", () => eq(predictDelivery({ ...base, eta: "" }).ok, false));

console.log("— TANGGA PRIORITAS MILESTONE —");
const withEta = { ...base, eta: "2026-08-14" };
t("Manifest menggeser dasar hitungan", () => {
  const d = predictDelivery({ ...withEta, docProgress: { manifest: { date: "2026-08-17" } } });
  eq(d.source, "manifest");
  eq(d.date, "2026-08-19"); // Sen17 tiba · Sel18 clearance · Rab19 antar
  eq(d.confidence.percent, 80);   // Manifest = High
});
t("PIB mengalahkan Manifest", () => {
  const d = predictDelivery({ ...withEta, docProgress: { manifest: { date: "2026-08-17" }, pib: { date: "2026-08-18" } } });
  eq(d.source, "pib");
  eq(d.confidence.percent, 90);   // PIB = Very High
  // Tiba Sen17, tapi PIB baru masuk Sel18 -> gerbang menahan clearance
  eq(d.date, "2026-08-20"); // Sel18 PIB · Rab19 clearance · Kam20 antar
});
t("SPPB mengalahkan PIB", () => {
  const d = predictDelivery({ ...withEta, docProgress: { pib: { date: "2026-08-18" }, sppb: { date: "2026-08-19" } } });
  eq(d.source, "sppb");
  eq(d.confidence.percent, 99);
  eq(d.date, "2026-08-20"); // Rab19 SPPB · Kam20 antar
});
t("In Factory mengalahkan semuanya", () => {
  const d = predictDelivery({ ...withEta, factoryDate: "2026-08-25",
    docProgress: { manifest: { date: "2026-08-17" }, pib: { date: "2026-08-18" }, sppb: { date: "2026-08-19" } } });
  eq(d.source, "actual");
  eq(d.date, "2026-08-25");
  eq(d.confidence.label, "Final");
});
t("In Factory mengalahkan tanggal yang dipatok MANUAL", () => {
  /* "Semuanya" dulu tidak termasuk mode Manual: cabang manual berdiri
     lebih dulu, jadi jadwal bermode Manual tetap memajang perkiraan
     lama walau barangnya sudah diterima. Justru itu keadaan yang
     paling sering — tanggal yang pernah dipatok tangan jarang
     disentuh lagi.

     Mode Manual berarti "jangan dihitung ulang", bukan "abaikan
     kenyataan". */
  const d = predictDelivery({ ...withEta, deliveryMode: "manual",
    actual: "2026-08-13", factoryDate: "2026-08-25" });
  eq(d.date, "2026-08-25");
  eq(d.source, "actual");
  eq(d.arrived, true);
});
t("tanpa In Factory, mode Manual tetap tak tersentuh", () => {
  /* Pembanding: perubahan di atas TIDAK boleh membuat mesin mulai
     menimpa tanggal patokan pengguna di keadaan biasa. */
  const d = predictDelivery({ ...withEta, deliveryMode: "manual", actual: "2026-08-13" });
  eq(d.date, "2026-08-13");
  eq(d.source, "manual");
});
t("EXPORT tidak ikut — di sana kolom itu Tanggal Stuffing", () => {
  /* Di buku Export kolom yang sama berarti Tanggal Stuffing, bukan
     kedatangan di pabrik. Memakainya untuk menimpa kolom Stuffing
     akan menyamakan dua tanggal yang memang berbeda. */
  const d = predictDelivery({ ...withEta, mode: "export", deliveryMode: "manual",
    actual: "2026-08-13", factoryDate: "2026-08-25" });
  eq(d.date, "2026-08-13");
  eq(d.source, "manual");
});
t("COO TIDAK mempengaruhi apa pun", () => {
  const a = predictDelivery(withEta).date;
  const b = predictDelivery({ ...withEta, docProgress: { coo: { date: "2026-08-01" } } }).date;
  eq(a, b);
  eq(predictEta(withEta).eta, predictEta({ ...withEta, docProgress: { coo: { date: "2026-08-01" } } }).eta);
});
t("tahap yang dilewati (skipped) tidak dianggap ada", () => {
  const d = predictDelivery({ ...withEta, docProgress: { sppb: { skipped: true, at: "2026-08-19T00:00:00Z" } } });
  eq(d.source, "eta");
});
t("entri lama tanpa `date` jatuh ke tanggal konfirmasi", () => {
  const d = predictDelivery({ ...withEta, docProgress: { sppb: { at: "2026-08-19T08:00:00.000Z" } } });
  eq(d.source, "sppb");
  eq(d.base, "2026-08-19");
});
t("keyakinan naik monoton seiring milestone", () => {
  const pc = (dp) => predictDelivery({ ...withEta, docProgress: dp }).confidence.percent;
  const a = pc({}),
        b = pc({ manifest: { date: "2026-08-17" } }),
        c = pc({ manifest: { date: "2026-08-17" }, pib: { date: "2026-08-18" } }),
        d = pc({ pib: { date: "2026-08-18" }, billing: { date: "2026-08-18" } }),
        e = pc({ billing: { date: "2026-08-18" }, sppb: { date: "2026-08-19" } });
  if (!(a < b && b < c && c < d && d < e))
    throw new Error(`tidak monoton: ${a},${b},${c},${d},${e}`);
});

console.log("— JADWAL BERJANGKAR PADA KEDATANGAN —");
/* ETA 08-08-2026 jatuh Sabtu.
   LCL: stripping 2 hari KALENDER (Sab8 -> Sen10, CFS jalan terus),
        lalu clearance Sel11 & antar Rab12 — dua-duanya hari kerja.
   FCL/AIR: clearance Sen10 + antar Sel11.                          */
const LCL = { mode: "import", etd: "2026-07-31", origin: "BSN KOREA", destination: "TPP",
  routeType: "direct", transport: "laut", muatan: "LCL", etaMode: "manual",
  eta: "2026-08-08", docProgress: {} };
const FCL = { ...LCL, muatan: "FCL" };
const AIR = { ...LCL, transport: "udara", muatan: "" };
const kunci = (d) => d.steps.map((x) => x.key);

t("LCL: stripping → clearance → antar", () => {
  const d = predictDelivery(LCL);
  eq(kunci(d).join(">"), "stripping>clearance>delivery");
  eq(d.date, "2026-08-12");   // Sab8 +2 kalender = Sen10 · Sel11 clr · Rab12 antar
});
t("FCL langsung clearance, tanpa stripping", () => {
  /* FCL yang sudah sandar langsung masuk proses clearance — tidak ada
     bongkar muatan gabungan di CFS. */
  const d = predictDelivery(FCL);
  eq(kunci(d).join(">"), "clearance>delivery");
  eq(d.date, "2026-08-11");
});
t("AIR juga tanpa stripping", () => {
  /* Kiriman udara tidak pernah lewat CFS. */
  eq(kunci(predictDelivery(AIR)).join(">"), "clearance>delivery");
  eq(predictDelivery(AIR).date, "2026-08-11");
});

console.log("— POSISI SIMPUL DI JALUR RUTE —");
t("transit setanggal berangkat DIBAGI RATA, bukan ditumpuk", () => {
  /* Kasus nyata: TSN 13-08 · SIN 13-08 · CGK 15-08. Waktu tempuh ke
     SIN nol, jadi pecahannya nol — simpulnya mendarat persis di atas
     simpul asal dan labelnya terpaksa turun ke baris kedua. Rute tiga
     pelabuhan jadi terbaca seperti dua. */
  const f = beriJarakMinimum([0, 0, 1]);
  eq(f.join(","), "0,0.5,1");
});
t("transit yang tanggalnya BEDA tetap sesuai waktunya", () => {
  /* Yang seri saja yang dibagi rata. Posisi yang membawa keterangan
     tidak boleh dihapus — transit di pertengahan harus tetap di
     pertengahan. */
  eq(beriJarakMinimum([0, 0.5, 1]).join(","), "0,0.5,1");
  eq(beriJarakMinimum([0, 0.3, 1])[1], 0.3);
});
t("simpul yang berdempetan diberi ruang, urutannya tetap", () => {
  /* 0,98 bukan seri — keterangannya nyata, yang kurang cuma ruang.
     Digeser secukupnya supaya labelnya tidak bertindih, tidak
     dipindah ke tengah. */
  const f = beriJarakMinimum([0, 0.98, 1]);
  if (!(f[1] > 0.7 && f[1] < 0.95)) throw new Error("posisi transit tidak masuk akal: " + f[1]);
  eq(f[0], 0);
  eq(f[2], 1);
});
t("urutan & ujung jalur tidak pernah berubah", () => {
  [[0,0,1],[0,0,0,1],[0,0,0,0,1],[0,0.98,1],[0,1,1]].forEach((asal) => {
    const f = beriJarakMinimum(asal);
    eq(f[0], 0, "ujung kiri:");
    eq(f[f.length - 1], 1, "ujung kanan:");
    for (let i = 1; i < f.length; i++)
      if (f[i] < f[i - 1]) throw new Error("simpul mundur ke kiri: " + f.join(","));
  });
});
t("penanda kapal ikut skala yang sama dengan simpulnya", () => {
  /* Kalau kapal memakai skala waktu sementara simpulnya digeser, kapal
     yang baru berangkat akan tampak SUDAH MELEWATI transit. */
  const asli = [0, 0, 1];
  const baru = beriJarakMinimum(asli);
  eq(petakanProgres(0, asli, baru), 0);
  eq(petakanProgres(1, asli, baru), 1);
  const tengah = petakanProgres(0.5, asli, baru);
  if (!(tengah > baru[1])) throw new Error("kapal tertinggal di belakang transit");
});

console.log("— DETEKSI CARRIER —");
const { detectCarrier, detectShippingLine, detectAirline, detectCourier } = ctx;

t("pelayaran dibaca dari nama kapal", () => {
  [["MSC LORENA", "MSC"], ["HMM MIR", "HMM"], ["ONE HAMBURG", "ONE"],
   ["EVER GIVEN", "EVERGREEN"], ["MAERSK HANOI", "MAERSK"],
   ["COSCO SHIPPING ARIES", "COSCO"], ["SAWASDEE ALTAIR", "RCL"]]
    .forEach(([kapal, kode]) =>
      eq(detectCarrier({ transport: "laut", vessel: kapal }).code, kode, kapal + ":"));
});
t("alias dicocokkan sebagai KATA UTUH, bukan potongan teks", () => {
  // "ONE" tidak boleh tertangkap dari MILESTONE / STONE
  eq(detectShippingLine("MILESTONE STAR"), null);
  eq(detectShippingLine("BLUESTONE"), null);
  eq(detectShippingLine("ONE HAMBURG").code, "ONE");
});
t("maskapai dibaca dari awalan no. penerbangan", () => {
  [["KE627", "KE"], ["OZ761", "OZ"], ["VN631", "VN"], ["CZ387", "CZ"],
   ["MU507", "MU"], ["CA977", "CA"], ["CI761", "CI"], ["BR239", "BR"],
   ["JL725", "JL"], ["NH871", "NH"], ["SQ952", "SQ"], ["CX719", "CX"]]
    .forEach(([fl, kode]) =>
      eq(detectCarrier({ transport: "udara", vessel: fl }).code, kode, fl + ":"));
});
t("no. penerbangan bisa di kolom Voyager ATAU No. Voyage", () => {
  eq(detectCarrier({ transport: "udara", vessel: "", voyage: "KE627" }).code, "KE");
  eq(detectCarrier({ transport: "udara", vessel: "KE 627" }).code, "KE");
});
t("tidak dikenali dilaporkan, bukan ditebak", () => {
  const a = detectCarrier({ transport: "laut", vessel: "KAPAL ENTAH" });
  eq(a.detected, false);
  eq(!!a.reason, true);
  eq(detectCarrier({ transport: "laut", vessel: "" }).reason, "Nama kapal belum diisi");
});
t("huruf yang bukan kode maskapai tidak dianggap kode", () => {
  eq(detectAirline("ABCDEF"), null);
  eq(detectAirline("KEABC"), null);   // sisanya harus angka
});

console.log("— NAMA KAPAL NYATA DARI RIWAYAT DDI —");
/* Diambil dari DAILY REPORT 04-08-2026, sheet ALL IMPORT SHIPMENT.
   Bukan contoh karangan: inilah yang benar-benar diketik. */
t("kapal laut dari riwayat terdeteksi", () => {
  [["HMM MIRACLE 0009S", "HMM"], ["HMM CEBU 0022S", "HMM"], ["HMM DAVAO / 0014S", "HMM"],
   ["KMTC SHIMIZU 2509S", "KMTC"], ["XIN QIN HUANG DAO V.126S", "COSCO"],
   ["HAIAN OPUS 0013S", "HAIAN"], ["SAWASDEE ALTAIR", "RCL"]]
    .forEach(([v, k]) =>
      eq(detectCarrier({ transport: "laut", vessel: v }).code, k, v + ":"));
});
t("penerbangan dari riwayat terdeteksi, termasuk yang salah ketik", () => {
  [["GA879", "GA"], ["GA0879", "GA"], ["GARUDA INDONESIA GA0879", "GA"],
   ["FX6068", "FX"], ["TW155", "TW"], ["KE627", "KE"]]
    .forEach(([v, k]) =>
      eq(detectCarrier({ transport: "udara", vessel: v }).code, k, v + ":"));
});
t("kode maskapai dicari di mana pun, bukan cuma di awal", () => {
  eq(detectAirline("GARUDA INDONESIA GA0879").code, "GA");
  eq(detectAirline("GA 879").code, "GA");
});
t("kurir dikenali dari NAMA PERUSAHAAN di kolom kapal", () => {
  /* Nama perusahaan MENANG atas kode penerbangan: "Fedex FX6068"
     kiriman kurir, bukan sekadar penerbangan FedEx. */
  [["PRIME", "PRIME"], ["WIDE", "WIDE"], ["DHL", "DHL"], ["FEDEX", "FEDEX"],
   ["UPS", "UPS"], ["FEDERAL EXPRESS CORPORATION FX6068", "FEDEX"],
   ["Fedex FX6068", "FEDEX"], ["DHL FLIGHT", "DHL"]]
    .forEach(([v, k]) => {
      const r = detectCarrier({ transport: "laut", vessel: v });
      eq(r.code, k, v + ":");
      eq(r.kind, "courier", v + " kind:");
    });
});
t("kurir dicek dari NAMA KAPAL saja, bukan Forwarder", () => {
  /* Di riwayat DDI, PRIME jadi forwarder pada 70 kiriman termasuk
     kiriman LAUT (kapal HAIAN OPUS). Membaca kolom Forwarder akan
     menandainya sebagai kurir dan memakai asumsi waktu yang salah. */
  const r = detectCarrier({ transport: "laut", vessel: "HAIAN OPUS 0013S", forwarder: "PRIME" });
  eq(r.kind, "shipping");
  eq(r.code, "HAIAN");
});
t('deretan "… VOYAGER" dikelompokkan jadi satu armada', () => {
  ["QINGDAO VOYAGER/2604S", "PORT KLANG VOYAGE 2511S", "TIANJIN VOYAGER 2605S",
   "YEOSUVOYAGER", "TINAJIN VOYAGER 2510S", "KWANGYANG VOYAGER 2602S"]
    .forEach((v) =>
      eq(detectCarrier({ transport: "laut", vessel: v }).code, "VOYAGER-SERIES", v + ":"));
});
t("akhiran nama TIDAK pernah mengalahkan operator sebenarnya", () => {
  eq(detectCarrier({ transport: "laut", vessel: "HMM MIRACLE 0009S" }).code, "HMM");
  eq(detectCarrier({ transport: "laut", vessel: "KMTC SHIMIZU 2605S" }).code, "KMTC");
});
t("no. voyage dibuang sebelum akhiran dicocokkan", () => {
  eq(detectShippingLine("QINGDAO VOYAGER 2604S").code, "VOYAGER-SERIES");
  eq(detectShippingLine("QINGDAO VOYAGER V.126S").code, "VOYAGER-SERIES");
});
t("Heung-A & Scoot dari riwayat", () => {
  eq(detectCarrier({ transport: "laut", vessel: "HEUNG-A BANGKOK 2609S" }).code, "HEUNGA");
  eq(detectCarrier({ transport: "udara", vessel: "TR0139" }).code, "TR");
  eq(detectCarrier({ transport: "udara", vessel: "JL06750" }).code, "JL");
  eq(detectCarrier({ transport: "udara", vessel: "GA-0879 ( ICN -> CGK )" }).code, "GA");
});

t("yang belum diketahui TIDAK ditebak", () => {
  // Deretan "* VOYAGER" & "BELAWAN" belum jelas operatornya —
  // lebih baik kosong daripada salah menyebut pelayaran.
  ["BELAWAN 2508S", "HAPPY LUCKY 0619S"]
    .forEach((v) => eq(detectCarrier({ transport: "laut", vessel: v }).detected, false, v + ":"));
});

console.log("— NAMA OPERATOR YANG DITULIS TERPISAH —");
/* Kasus pemicu: HONG TAI 658 dari TXG ke Tanjung Priok terbaca
   "Pelayaran tidak dikenali", karena alias yang mengandung spasi
   dibandingkan dengan satu kata dan tidak akan pernah sama. */
t("frasa dua kata terbaca, bukan cuma yang dirapatkan", () => {
  eq(detectShippingLine("HONG TAI 658").code, "HONGTAI");
  eq(detectShippingLine("HONG TAI 658 007S").code, "HONGTAI");
  eq(detectShippingLine("HONGTAI 639").code, "HONGTAI");
});
t("frasa MENGALAHKAN alias satu kata yang lebih pendek", () => {
  /* "XIN" itu COSCO, tapi "XIN MING ZHOU" itu Jinjiang. Tanpa
     urutan ini, seluruh armada Jinjiang tercatat sebagai COSCO. */
  eq(detectShippingLine("XIN MING ZHOU 68").code, "JINJIANG");
  eq(detectShippingLine("XIN QIN HUANG DAO V.126S").code, "COSCO");
});
t('"HAI" yang berdiri sendiri tidak lagi menyeret kapal Cina ke Hai An', () => {
  /* Deretan Zhonggu semuanya berakhiran "... HAI". Sebelum ini
     semuanya tercatat Hai An — riwayat tercampur diam-diam. */
  ["ZHONG GU BO HAI", "ZHONG GU NAN HAI 8", "ZHONG GU HUANG HAI"]
    .forEach((v) => eq(detectShippingLine(v).code, "ZHONGGU", v + ":"));
  // Hai An sendiri tetap terbaca, dirapatkan maupun terpisah.
  eq(detectShippingLine("HAIAN OPUS 0013S").code, "HAIAN");
  eq(detectShippingLine("HAI AN CITY").code, "HAIAN");
});
t("pelayaran Cina, Vietnam, Rusia & Indonesia terbaca", () => {
  [["ZHONG GU BO HAI", "ZHONGGU"], ["AN TONG 6", "ANTONG"],
   ["CUL NANSHA", "CULINES"], ["X-PRESS MEKONG", "XPRESS"],
   ["SEA LEAD SHANGHAI", "SEALEAD"], ["INTERASIA HORIZON", "INTERASIA"],
   ["TAN CANG 09", "TANCANG"], ["BIEN DONG NAVIGATOR", "BIENDONG"],
   ["VIMC UNITY", "VIMC"], ["FESCO DIOMID", "FESCO"],
   ["MERATUS JAYAKARTA", "MERATUS"], ["SINAR BANDA", "SAMUDERA"]]
    .forEach(([v, k]) => eq(detectCarrier({ transport: "laut", vessel: v }).code, k, v + ":"));
});
t("maskapai Cina, Rusia & Vietnam terbaca dari no. penerbangan", () => {
  [["HO1385", "HO"], ["JD 458", "JD"], ["YG7891", "YG"], ["FM833", "FM"],
   ["S71234", "S7"], ["ZF 2721", "ZF"], ["N49611", "N4"], ["U6 2915", "U6"],
   ["BL123", "BL"], ["VU 208", "VU"]]
    .forEach(([v, k]) => eq(detectCarrier({ transport: "udara", vessel: v }).code, k, v + ":"));
});
t("singkatan pendek hanya sah sebagai KATA PERTAMA", () => {
  /* "SM QINGDAO" itu SM Line. "MORNING SM" bukan apa-apa —
     armada SM Line selalu diawali singkatannya. */
  eq(detectShippingLine("SM QINGDAO").code, "SMLINE");
  eq(detectShippingLine("MORNING SM"), null);
  eq(detectShippingLine("BAL BOAN").code, "BAL");
  eq(detectShippingLine("OCEAN BAL"), null);
  eq(detectShippingLine("SINAR BANDA").code, "SAMUDERA");
  eq(detectShippingLine("GOLDEN SINAR"), null);
});
t("nama maskapai jadi jaring pengaman saat kodenya meragukan", () => {
  /* Kode IATA Asia Cargo masih berselisih antar sumber (GM vs GY).
     Nama perusahaannya tidak — jadi AWB yang menulis namanya tetap
     terbaca walau kodenya nanti ternyata salah. */
  eq(detectAirline("ASIA CARGO AIRLINES").code, "GM");
  eq(detectAirline("TRI-MG GM1234").code, "GM");
  eq(detectAirline("MY INDO AIRLINES").code, "2Y");
  eq(detectAirline("2Y0812").code, "2Y");
});
t("tambahan alias tidak merusak pencocokan kata utuh", () => {
  /* Penjaga: satu alias pendek yang salah — "SM", "BAL", "SINAR" —
     bisa menangkap nama kapal yang sama sekali lain. */
  eq(detectShippingLine("MILESTONE STAR"), null);
  eq(detectShippingLine("BLUESTONE"), null);
  eq(detectAirline("ABCDEF"), null);
  eq(detectAirline("KEABC"), null);
});

console.log("— PRIORITAS RUTE: CARRIER > PELABUHAN > NEGARA —");
const BUSAN = { etd: "2026-08-03", origin: "KRPUS", destination: "TPP",
  routeType: "direct", transport: "laut", muatan: "FCL" };
t("rute carrier mengalahkan rute pelabuhan", () => {
  eq(predictEta({ ...BUSAN, vessel: "HMM MIR", voyage: "003E" }).ruleId, "sea-pus-tpp-hmm");
  eq(predictEta({ ...BUSAN, vessel: "HMM MIR" }).days, 9);
  eq(predictEta({ ...BUSAN, vessel: "MSC LORENA" }).days, 11);
  eq(predictEta({ ...BUSAN, vessel: "ONE HAMBURG" }).days, 10);
});
t("pelayaran tak terdaftar turun ke rute pelabuhan", () => {
  const e = predictEta({ ...BUSAN, vessel: "KAPAL ENTAH" });
  eq(e.ruleId, "sea-pus-tpp");
  eq(e.days, 10);
});
t("rute pelabuhan mengalahkan rute negara", () =>
  eq(predictEta({ ...BUSAN, vessel: "" }).ruleId, "sea-pus-tpp"));
t("carrier udara juga jadi dimensi rute", () => {
  const air = { etd: "2026-08-03", origin: "PVG", destination: "CGK",
    routeType: "direct", transport: "udara" };
  eq(predictEta({ ...air, vessel: "KE627" }).days, 2);
  eq(predictEta({ ...air, vessel: "CI761" }).days, 3);
  eq(predictEta({ ...air, vessel: "" }).ruleId, "cn-air-south-cgk");
});
t("LAUT tidak butuh Direct/Transit lagi", () => {
  // Master Route per carrier memakai satu angka, apa pun Tipe Rutenya
  const a = predictEta({ ...BUSAN, vessel: "HMM MIR", routeType: "direct" }).days;
  const b = predictEta({ ...BUSAN, vessel: "HMM MIR", routeType: "transit" }).days;
  eq(a, b);
  eq(a, 9);
});
t("UDARA tetap membedakan Direct/Transit di rute negara", () => {
  const air = { etd: "2026-08-03", origin: "VNDAD", destination: "CGK", transport: "udara" };
  const d = predictEta({ ...air, routeType: "direct" }).days;
  const tr = predictEta({ ...air, routeType: "transit" }).days;
  if (d === tr) throw new Error("seharusnya berbeda");
});

console.log("— GERBANG BILLING & GATE OUT —");
const G = { mode: "import", transport: "laut", muatan: "FCL",
  origin: "KRINC", destination: "TPP", routeType: "direct",
  etaMode: "manual", eta: "2026-08-10", docProgress: {} };
t("Billing jadi gerbang seperti PIB", () => {
  const d = predictDelivery({ ...G, docProgress: {
    pib: { date: "2026-08-05" }, billing: { date: "2026-08-14" } } });
  eq(kunci(d).join(">"), "wait_billing>clearance>delivery");
  eq(d.date, "2026-08-18");   // Jum14 billing · Sen17 clr · Sel18 antar
});
t("gerbang yang PALING BELAKANG yang mengikat", () => {
  const d = predictDelivery({ ...G, docProgress: {
    pib: { date: "2026-08-14" }, billing: { date: "2026-08-12" } } });
  eq(d.steps.find((x) => x.key.startsWith("wait_")).to, "2026-08-14");
});
t("SPPB jadi anchor pengantaran", () => {
  const d = predictDelivery({ ...G, docProgress: { sppb: { date: "2026-08-11" } } });
  eq(d.baseLabel, "Tanggal SPPB");
  eq(d.date, "2026-08-12");
});
t("sisa milestone dilaporkan", () => {
  const sisa = ctx.remainingMilestonesOf({ ...G, docProgress: {
    manifest: { date: "2026-08-10" }, pib: { date: "2026-08-11" } } }).map((x) => x.key);
  eq(sisa.join(","), "berth,billing,sppb");
});

console.log("— KEDATANGAN JADI GERBANG PENGANTARAN —");
/* Kiriman udara: dokumen kerap rampung sebelum pesawat mendarat. */
const UDARA = { mode: "import", transport: "udara", muatan: "",
  origin: "ICN", destination: "CGK", routeType: "direct",
  etaMode: "manual", eta: "2026-08-14", docProgress: {} };

t("SPPB terbit sebelum pesawat mendarat -> pengantaran menunggu ATA", () => {
  const d = predictDelivery({ ...UDARA, docProgress: { sppb: { date: "2026-08-10" } } });
  eq(d.steps[0].key, "waitArrival");
  eq(d.steps[0].to, "2026-08-14");
  eq(d.date, "2026-08-17");   // Jum14 tiba · Sen17 antar
  if (d.date < UDARA.eta) throw new Error("sampai pabrik sebelum pesawat mendarat");
});
t("ATA yang dikonfirmasi menang atas ETA", () => {
  const d = predictDelivery({ ...UDARA, docProgress: {
    sppb: { date: "2026-08-10" }, berth: { date: "2026-08-12" } } });
  eq(d.steps[0].to, "2026-08-12");
  eq(d.date, "2026-08-13");
});
t("pesawat sudah mendarat sebelum SPPB -> tidak ada jeda", () => {
  const d = predictDelivery({ ...UDARA, docProgress: {
    berth: { date: "2026-08-10" }, sppb: { date: "2026-08-12" } } });
  eq(d.steps.some((x) => x.key === "waitArrival"), false);
  eq(d.date, "2026-08-13");
});
t('keyakinan tidak pernah "Final" sebelum barang masuk pabrik', () => {
  const d = predictDelivery({ ...UDARA, docProgress: {
    sppb: { date: "2026-08-10" }, berth: { date: "2026-08-12" } } });
  if (d.confidence.percent >= 100) throw new Error("menembus 100: " + d.confidence.percent);
  eq(d.confidence.label !== "Final", true);
  // Sudah di pabrik -> baru Final
  const f = predictDelivery({ ...UDARA, factoryDate: "2026-08-13" });
  eq(f.confidence.percent, 100);
  eq(f.confidence.label, "Final");
});

console.log("— DELAY JADI ACUAN —");
const DELAY = { mode: "import", transport: "laut", muatan: "LCL",
  origin: "BSN KOREA", destination: "TPP", routeType: "direct",
  etd: "2026-07-26", eta: "2026-08-06", etaMode: "manual",
  etdUpdate: "2026-07-31", etaUpdate: "2026-08-08", docProgress: {} };

t("Update ETA jadi jangkar, bukan ETA rencana", () => {
  const d = predictDelivery(DELAY);
  eq(d.base, "2026-08-08");
  eq(d.baseLabel, "ETA Delay (Update ETA)");
  // Sab8 +2 kalender = Sen10 · clearance Sel11 · antar Rab12
  eq(d.date, "2026-08-12");
});
t("Manifest lebih AWAL dari ETA delay tidak menariknya mundur", () => {
  /* Persis kasus yang terlihat di lapangan: BC 1.1 masuk 04-08
     sementara Update ETA 08-08. Manifest hanya batas bawah. */
  const d = predictDelivery({ ...DELAY, docProgress: { manifest: { date: "2026-08-04" } } });
  eq(d.base, "2026-08-08");
  eq(d.date, "2026-08-12");
  if (d.date < DELAY.etaUpdate) throw new Error("sampai pabrik sebelum kapal sandar");
});
t("Manifest lebih BARU dari ETA justru dipakai", () => {
  const d = predictDelivery({ ...DELAY, docProgress: { manifest: { date: "2026-08-14" } } });
  eq(d.base, "2026-08-14");
  eq(d.baseLabel, "Kedatangan (perkiraan dari Manifest)");
});
t("Sandar tetap mengalahkan keduanya", () => {
  const d = predictDelivery({ ...DELAY, docProgress: {
    manifest: { date: "2026-08-04" }, berth: { date: "2026-08-09" } } });
  eq(d.base, "2026-08-09");
});
t("ETD mundur menggeser ETA hitungan mesin (mode auto)", () => {
  const s = { ...DELAY, etaMode: "auto", etaUpdate: "" };
  // ETD rencana 26-07 + 21 (KR LCL direct 17? -> rute kr-id) ...
  const rencana = predictEta(s).eta;
  const revisi = predictEtaRevised(s);
  eq(revisi.etdUsed, "2026-07-31");
  eq(calendarDaysBetweenISO(rencana, revisi.eta), 5);   // ETD mundur 5 hari
  eq(predictionEtaBasis(s), revisi.eta);
});
t("kolom eta & etaUpdate TIDAK ditulis mesin karena ETD mundur", () => {
  const s = { ...DELAY, etaMode: "auto", etaUpdate: "" };
  const patch = recomputeShipmentDates(s);
  eq(patch.etaUpdate, undefined);
  eq(patch.eta, predictEta(s).eta);     // dari ETD RENCANA, bukan ETD mundur
});
t("ETA manual TIDAK digeser lagi oleh ETD mundur", () => {
  // Forwarder sudah tahu kapalnya telat; menggeser lagi = hitung dua kali
  const s = { ...DELAY, etaUpdate: "" };
  eq(predictionEtaBasis(s), "2026-08-06");
});
t("lencana delay tetap membandingkan rencana vs mundur", () => {
  const s = { ...DELAY, etaMode: "auto", etaUpdate: "" };
  const e = predictEta(s);
  eq(e.etdUsed, "2026-07-26");   // ETD rencana, supaya lencana "+5 hari" benar
});

console.log("— SATUAN TIAP LANGKAH —");
t("stripping memakai HARI KALENDER, menembus akhir pekan", () => {
  // Sandar Jumat 14. CFS bongkar terus: Sab15, Min16 -> selesai Min16.
  const d = predictDelivery({ ...LCL, docProgress: { berth: { date: "2026-08-14" } } });
  const strip = d.steps.find((x) => x.key === "stripping");
  eq(strip.from, "2026-08-14");
  eq(strip.to, "2026-08-16");        // Minggu — sengaja
  eq(strip.unit, "hari kalender");
});
t("clearance & antar tetap HARI KERJA", () => {
  const d = predictDelivery({ ...LCL, docProgress: { berth: { date: "2026-08-14" } } });
  const clr = d.steps.find((x) => x.key === "clearance");
  const del = d.steps.find((x) => x.key === "delivery");
  eq(clr.from, "2026-08-16");        // mulai dari akhir stripping (Minggu)
  eq(clr.to, "2026-08-17");          // maju ke hari kerja: Senin
  eq(clr.unit, "hari kerja");
  eq(del.to, "2026-08-18");
  eq(del.unit, "hari kerja");
});
t("hari libur nasional tidak menghentikan stripping", () => {
  PREDICTION_CONFIG.calendar.holidays = ["2026-08-17"];
  const d = predictDelivery({ ...LCL, docProgress: { berth: { date: "2026-08-15" } } });
  eq(d.steps.find((x) => x.key === "stripping").to, "2026-08-17"); // libur, tetap jalan
  eq(d.steps.find((x) => x.key === "clearance").to, "2026-08-18"); // clearance melompatinya
  PREDICTION_CONFIG.calendar.holidays = [];
});
t("stripping 0 hari (FCL/AIR) tidak memunculkan langkah", () => {
  eq(kunci(predictDelivery(FCL)).includes("stripping"), false);
});
t("konfigurasi menentukan satuannya, bukan kode", () => {
  PREDICTION_CONFIG.calendarDayLegs = [];
  const d = predictDelivery({ ...LCL, docProgress: { berth: { date: "2026-08-14" } } });
  eq(d.steps.find((x) => x.key === "stripping").to, "2026-08-18"); // jadi hari kerja
  PREDICTION_CONFIG.calendarDayLegs = ["stripping"];
});

console.log("— PIB ITU GERBANG, BUKAN TITIK MULAI —");
t("PIB masuk SEBELUM kapal sandar tidak mempercepat apa pun", () => {
  /* Inti perbaikannya. Model lama memakai tanggal PIB sebagai titik
     mulai, sehingga PIB yang diajukan 10 hari sebelum kapal tiba
     menghasilkan tanggal antar SEBELUM kapalnya sandar. */
  const d = predictDelivery({ ...LCL, docProgress: { pib: { date: "2026-07-29" } } });
  eq(d.date, "2026-08-12");                 // sama dengan tanpa PIB
  if (d.date < LCL.eta) throw new Error("antar sebelum kapal sandar: " + d.date);
  eq(kunci(d).includes("wait_pib"), false);
});
t("PIB masuk TERLAMBAT menahan clearance", () => {
  const d = predictDelivery({ ...LCL, docProgress: { pib: { date: "2026-08-17" } } });
  eq(kunci(d).join(">"), "stripping>wait_pib>clearance>delivery");
  eq(d.date, "2026-08-19");                 // Sen17 PIB · Sel18 clr · Rab19 antar
});
t("stripping tetap dihitung walau PIB sudah dikonfirmasi", () => {
  const d = predictDelivery({ ...LCL, docProgress: { pib: { date: "2026-08-04" } } });
  eq(kunci(d).includes("stripping"), true);
  eq(d.date, "2026-08-12");
});
t("PIB tetap menaikkan keyakinan walau tanggal tak berubah", () => {
  const tanpa = predictDelivery(LCL).confidence.percent;
  const dengan = predictDelivery({ ...LCL, docProgress: { pib: { date: "2026-07-29" } } }).confidence.percent;
  if (!(dengan > tanpa)) throw new Error(`${dengan} tidak lebih tinggi dari ${tanpa}`);
});

console.log("— TAHAP SANDAR (ATA) —");
t("Sandar jadi jangkar, mengalahkan ETA", () => {
  const d = predictDelivery({ ...LCL, docProgress: { berth: { date: "2026-08-12" } } });
  eq(d.base, "2026-08-12");
  eq(d.baseLabel, "Sandar (ATA)");
  eq(d.date, "2026-08-18");   // Kam13,Jum14 strip · Sen17 clr · Sel18 antar
});
t("Sandar mengalahkan Manifest sebagai bukti kedatangan", () => {
  /* BC 1.1 diajukan SEBELUM kapal sandar. Kalau Manifest yang dipakai,
     seluruh rantai bergeser terlalu awal — tiap kali, ke arah sama. */
  const d = predictDelivery({ ...LCL, docProgress: {
    manifest: { date: "2026-08-11" }, berth: { date: "2026-08-12" } } });
  eq(d.base, "2026-08-12");
});
t("tanpa Sandar, Manifest tetap dipakai sebagai cadangan", () => {
  const d = predictDelivery({ ...LCL, docProgress: { manifest: { date: "2026-08-11" } } });
  eq(d.base, "2026-08-11");
  eq(d.baseLabel, "Kedatangan (perkiraan dari Manifest)");
});
t("label mengikuti moda: pesawat mendarat", () => {
  const d = predictDelivery({ ...AIR, docProgress: { berth: { date: "2026-08-12" } } });
  eq(d.baseLabel, "Mendarat (ATA)");
});
t("stripping mulai SETELAH sandar, bukan setelah PIB", () => {
  const d = predictDelivery({ ...LCL, docProgress: {
    pib: { date: "2026-08-03" },          // PIB masuk sebelum kapal tiba
    berth: { date: "2026-08-12" } } });
  eq(d.steps[0].key, "stripping");
  eq(d.steps[0].from, "2026-08-12");      // dari tanggal sandar
  eq(d.date, "2026-08-18");
});
t("Sandar menaikkan keyakinan berapa pun milestone tertingginya", () => {
  const tanpa = predictDelivery({ ...LCL, docProgress: { pib: { date: "2026-08-10" } } });
  const dengan = predictDelivery({ ...LCL, docProgress: {
    pib: { date: "2026-08-10" }, berth: { date: "2026-08-12" } } });
  eq(dengan.confidence.percent - tanpa.confidence.percent,
     PREDICTION_CONFIG.confidencePercent.bonuses.arrivalConfirmed);
  if (!dengan.confidence.reasons.some((r) => /Kedatangan sudah dikonfirmasi/.test(r.text)))
    throw new Error("alasan tidak dicatat");
});
t("bonus TIDAK dihitung dua kali saat Sandar jadi sumbernya", () => {
  const d = predictDelivery({ ...LCL, docProgress: { berth: { date: "2026-08-12" } } });
  eq(d.source, "berth");
  eq(d.confidence.percent, PREDICTION_CONFIG.confidencePercent.base.berth);
});
t("kedatangan pasti -> rentang hilang", () => {
  // CNCAN tidak ada di tabel per-pelabuhan, jadi memakai rentang negara.
  const dasar = { ...LCL, etaMode: "auto", origin: "CNCAN" };
  dasar.eta = predictEta(dasar).eta;
  eq(!!predictDelivery({ ...dasar, docProgress: {} }).range, true);
  eq(predictDelivery({ ...dasar, docProgress: { berth: { date: "2026-08-30" } } }).range, null);
});

console.log("— MANIFEST = BUKTI KEDATANGAN —");
t("Manifest menggantikan ETA sebagai titik kedatangan", () => {
  const d = predictDelivery({ ...LCL, docProgress: { manifest: { date: "2026-08-12" } } });
  eq(d.base, "2026-08-12");
  eq(d.date, "2026-08-18");   // Kam13,Jum14 strip · Sen17 clr · Sel18 antar
});
t("SPPB melewati seluruh urusan pelabuhan", () => {
  const d = predictDelivery({ ...LCL, docProgress: {
    manifest: { date: "2026-08-12" }, pib: { date: "2026-08-04" }, sppb: { date: "2026-08-17" } } });
  eq(kunci(d).join(">"), "delivery");
  eq(d.date, "2026-08-18");
});

console.log("— ANGKA OPERASIONAL SESUAI LAPANGAN —");
t("clearance 1 hari kerja, antar 1 hari kerja", () => {
  ["AIR", "SEA_FCL", "SEA_LCL"].forEach((tipe) => {
    const o = predictionOpsDays({ shipmentType: tipe });
    eq(o.clearance, 1, tipe + " clearance:");
    eq(o.delivery, 1, tipe + " delivery:");
  });
});
t("stripping 2 hari kerja hanya untuk LCL", () => {
  eq(predictionOpsDays({ shipmentType: "SEA_LCL" }).stripping, 2);
  eq(predictionOpsDays({ shipmentType: "SEA_FCL" }).stripping, 0);
  eq(predictionOpsDays({ shipmentType: "AIR" }).stripping, 0);
});

console.log("— TINGKAT 1: PER PELABUHAN / BANDARA —");
const rute = (asal, tujuan) => ({
  etd: "2026-08-03", origin: asal, destination: tujuan || "IDTPP", routeType: "direct",
});
function port(asal, tujuan, tipe, jenis) {
  return predictEta({
    ...rute(asal, tujuan), routeType: jenis,
    transport: tipe === "AIR" ? "udara" : "laut",
    muatan: tipe === "SEA_LCL" ? "LCL" : tipe === "SEA_FCL" ? "FCL" : "",
  });
}
// [asal, tipe, direct, transit] — null = memang tidak ada di tabel
const TABEL_UDARA = [
  ["VNSGN", 1, 3], ["VNHAN", 1, 3],
  ["CNPVG", 2, 4], ["CNSHA", 2, 4], ["CNCAN", 2, 4],
  ["CNSZX", 2, 5], ["CNPEK", 3, 5], ["CNTAO", 3, 5],
  ["RUSVO", 4, 7], ["RUDME", 4, 7], ["RULED", null, 8],
  ["MXMEX", null, 6], ["MXMTY", null, 7], ["MXGDL", null, 7],
];
const TABEL_LAUT = [
  ["VNSGN", 6, 8], ["VNHPH", 7, 9],
  ["CNSHA", 10, 13], ["CNNGB", 10, 13],
  ["CNSZX", 9, 12], ["CNXMN", 9, 12],
  ["CNTAO", 12, 15], ["CNTXG", 13, 16], ["CNTSN", 13, 16],
  ["RUVVO", null, 23], ["RULED", null, 40], ["RUNVS", null, 40],
  ["MXZLO", null, 35], ["MXLZC", null, 37], ["MXVER", null, 42],
];

t("14 baris udara → Soekarno-Hatta sesuai CSV", () => {
  TABEL_UDARA.forEach(([asal, d, tr]) => {
    if (d != null) eq(port(asal, "IDCGK", "AIR", "direct").days, d, `${asal} direct:`);
    eq(port(asal, "IDCGK", "AIR", "transit").days, tr, `${asal} transit:`);
  });
});
t("15 baris laut FCL → Tanjung Priok sesuai CSV", () => {
  TABEL_LAUT.forEach(([asal, d, tr]) => {
    if (d != null) eq(port(asal, "IDTPP", "SEA_FCL", "direct").days, d, `${asal} direct:`);
    eq(port(asal, "IDTPP", "SEA_FCL", "transit").days, tr, `${asal} transit:`);
  });
});
t("aturan pelabuhan memberi angka PASTI, bukan rentang", () => {
  eq(port("CNSHA", "IDTPP", "SEA_FCL", "direct").hasRange, false);
  eq(port("VNSGN", "IDCGK", "AIR", "direct").hasRange, false);
});

console.log("— JATUH-TINGKAT KE ATURAN NEGARA —");
t("Direct yang tidak ada di tabel pelabuhan turun ke aturan negara", () => {
  // Vladivostok hanya punya angka Transit. Direct harus jatuh ke ru-id (30–40), BUKAN nol.
  const e = port("RUVVO", "IDTPP", "SEA_FCL", "direct");
  eq(e.ruleId, "ru-id");
  eq(e.daysMin, 30); eq(e.daysMax, 40);
  if (e.days === 0) throw new Error("angka nol — jatuh-tingkat gagal");
});
t("LCL tidak ada di tabel pelabuhan -> turun ke rentang negara", () => {
  const e = port("CNSHA", "IDTPP", "SEA_LCL", "direct");
  eq(e.ruleId, "cn-id");
  eq(e.daysMin, 14); eq(e.daysMax, 18);
});
t("tujuan selain Priok/Soekarno-Hatta turun ke aturan negara", () => {
  eq(port("CNSHA", "IDSUB", "SEA_FCL", "direct").ruleId, "cn-id");
  eq(port("VNSGN", "IDDPS", "AIR", "direct").ruleId, "vn-id");
});
t("pelabuhan tak terdaftar turun ke aturan negara", () => {
  eq(port("VNDAD", "IDTPP", "SEA_FCL", "direct").ruleId, "vn-id");
  eq(port("CNCAN", "IDTPP", "SEA_FCL", "direct").ruleId, "cn-id");
  eq(port("RUVYP", "IDTPP", "SEA_FCL", "direct").ruleId, "ru-id");
  eq(port("MXATM", "IDTPP", "SEA_FCL", "direct").ruleId, "mx-id");
});
t("negara tak terdaftar turun ke aturan bawaan", () =>
  eq(port("JPYOK", "IDTPP", "SEA_FCL", "direct").ruleId, "default"));
t("Busan → Priok kini punya entri Master Route sendiri", () => {
  const e = predictEta({ ...rute("KRPUS"), transport: "laut", muatan: "FCL" });
  eq(e.ruleId, "sea-pus-tpp");
  eq(e.days, 10);
});
t("pelabuhan Korea lain tetap memakai aturan negara", () =>
  eq(predictEta({ ...rute("KRINC"), transport: "laut", muatan: "FCL" }).ruleId, "kr-id"));

console.log("— SATU ATURAN, BANYAK PELABUHAN —");
t("CNTXG & CNTSN dua-duanya menunjuk angka Tianjin yang sama", () => {
  eq(port("CNTXG", "IDTPP", "SEA_FCL", "direct").ruleId, "cn-sea-tsn-tpp");
  eq(port("CNTSN", "IDTPP", "SEA_FCL", "direct").ruleId, "cn-sea-tsn-tpp");
  eq(port("CNTSN", "IDTPP", "SEA_FCL", "direct").days, 13);
});
t("kode yang sama, tujuan berbeda -> aturan berbeda", () => {
  // CNSHA dipakai pelabuhan laut Shanghai DAN bandara Hongqiao.
  eq(port("CNSHA", "IDCGK", "AIR", "direct").ruleId, "cn-air-south-cgk");
  eq(port("CNSHA", "IDTPP", "SEA_FCL", "direct").ruleId, "cn-sea-sha-ngb-tpp");
});

console.log("— NAMA PELABUHAN BEBAS TERBACA —");
t("nama kota bebas terpetakan ke aturan pelabuhannya", () => {
  eq(predictEta({ ...rute("Cat Lai"), transport: "laut", muatan: "FCL" }).ruleId, "vn-sea-sgn-tpp");
  eq(predictEta({ ...rute("Yantian"), transport: "laut", muatan: "FCL" }).ruleId, "cn-sea-szx-xmn-tpp");
  eq(predictEta({ ...rute("Novorossiysk"), transport: "laut", muatan: "FCL", routeType: "transit" }).ruleId, "ru-sea-west-tpp");
  eq(predictEta({ ...rute("Manzanillo"), transport: "laut", muatan: "FCL", routeType: "transit" }).ruleId, "mx-sea-zlo-tpp");
  eq(predictEta({ ...rute("Domodedovo", "IDCGK"), transport: "udara" }).ruleId, "ru-air-mow-cgk");
  eq(predictEta({ ...rute("Guadalajara", "IDCGK"), transport: "udara", routeType: "transit" }).ruleId, "mx-air-mty-gdl-cgk");
});

console.log("— BENTUK KODE: PANJANG & PENDEK —");
const { resolvePortCode, resolvePortCountry, resolveUnlocode, portCodeLabel } = ctx;
// `const UNLOCODES` binding leksikal — tidak menempel ke objek konteks.
const UNLOCODES = vm.runInContext("UNLOCODES", ctx);

t("UN/LOCODE dari dokumen tetap dikenali", () => {
  eq(resolvePortCode("IDCGK"), "CGK");
  eq(resolvePortCode("IDTPP"), "TPP");
  eq(resolvePortCode("CNSHA"), "SHA");
  eq(resolvePortCode("TANJUNG PRIOK IDTPP"), "TPP");
});
t("bentuk pendek dikenali", () => {
  eq(resolvePortCode("CGK"), "CGK");
  eq(resolvePortCode("tpp"), "TPP");
});
t("nama & alias dikenali", () => {
  eq(resolvePortCode("Soekarno-Hatta"), "CGK");
  eq(resolvePortCode("Cat Lai"), "SGN");
  eq(resolvePortCode("Vostochny"), "VYP");
});
t("negara diambil dari tabel, bukan dari memotong kode", () => {
  eq(resolvePortCountry("CGK"), "ID");   // bukan "CG" (Kongo)
  eq(resolvePortCountry("SHA"), "CN");
  eq(resolvePortCountry("IDCGK"), "ID");
});
t("bentuk panjang bisa diambil kembali untuk dokumen", () => {
  eq(resolveUnlocode("CGK"), "IDCGK");
  eq(resolveUnlocode("TPP"), "IDTPP");
});
t("tabrakan TPP diselesaikan: Priok=TPP, Pelepas=PTP", () => {
  eq(resolvePortCode("TPP"), "TPP");
  eq(resolvePortCountry("TPP"), "ID");
  eq(resolvePortCode("MYTPP"), "PTP");
  eq(resolvePortCode("Tanjung Pelepas"), "PTP");
});
t("label hanya menyeragamkan KODE, nama dibiarkan", () => {
  eq(portCodeLabel("IDTPP"), "TPP");
  eq(portCodeLabel("CGK"), "CGK");
  eq(portCodeLabel("Tanjung Priok"), "Tanjung Priok");
  eq(portCodeLabel(""), "");
});
t("PENJAGA: tidak ada kode pendek dipakai dua negara", () => {
  const peta = new Map();
  UNLOCODES.forEach((u) => {
    if (!peta.has(u.code)) peta.set(u.code, new Set());
    peta.get(u.code).add(u.country);
  });
  const bentrok = [...peta].filter(([, neg]) => neg.size > 1);
  if (bentrok.length) {
    throw new Error("kode dipakai lintas negara: " +
      bentrok.map(([k, v]) => `${k}=${[...v].join("/")}`).join(", "));
  }
});
t("jadwal lama ber-UN/LOCODE tetap dapat aturan yang benar", () => {
  eq(predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL" }).ruleId, "cn-sea-sha-ngb-tpp");
});

console.log("— RENTANG —");
// CNCAN (pelabuhan Guangzhou) tidak ada di tabel per-pelabuhan, jadi
// memakai rentang negara China: FCL direct 8–12.
const R = (asal) => ({ ...rute(asal), transport: "laut", muatan: "FCL" });
t("angka pasti dari aturan pelabuhan -> tidak ada rentang", () =>
  eq(predictEta(R("CNSHA")).hasRange, false));
t("rentang negara -> tanggal paling cepat & paling lambat", () => {
  const e = predictEta(R("CNCAN"));
  eq(e.hasRange, true);
  eq(e.etaEarliest, "2026-08-11"); // +8
  eq(e.etaLatest, "2026-08-15");   // +12
  eq(e.eta, "2026-08-13");         // titik tengah 10
});
t("kebijakan 'max' / 'min' memakai ujung rentang", () => {
  PREDICTION_CONFIG.planning.transitEstimate = "max";
  eq(predictEta(R("CNCAN")).eta, "2026-08-15");
  PREDICTION_CONFIG.planning.transitEstimate = "min";
  eq(predictEta(R("CNCAN")).eta, "2026-08-11");
  PREDICTION_CONFIG.planning.transitEstimate = "mid";
});
t("titik tengah dibulatkan ke atas (5..7 -> 6, 8..12 -> 10)", () => {
  eq(predictEta(R("VNDAD")).days, 6);
  eq(predictEta(R("CNCAN")).days, 10);
});
t("rentang merambat ke Estimated Delivery", () => {
  const s = { mode: "import", ...R("CNCAN"), etaMode: "auto", eta: "2026-08-13" };
  const d = predictDelivery(s);
  eq(!!d.range, true);
  eq(d.range.earliest, "2026-08-13"); // ETD+8 = Sel11 · +2 hari kerja
  eq(d.range.latest, "2026-08-18");   // ETD+12 = Sab15 · +2 hari kerja
  eq(d.date, "2026-08-17");
});
t("ETA manual -> rentang hilang (forwarder sudah memberi tanggal pasti)", () =>
  eq(predictDelivery({ mode: "import", ...R("CNCAN"), etaMode: "manual", eta: "2026-08-13" }).range, null));
t("jadwal dimundurkan -> rentang hilang", () =>
  eq(predictDelivery({ mode: "import", ...R("CNCAN"), etaMode: "auto",
    eta: "2026-08-13", etaUpdate: "2026-08-20" }).range, null));
t("milestone dikonfirmasi -> rentang hilang", () =>
  eq(predictDelivery({ mode: "import", ...R("CNCAN"), etaMode: "auto", eta: "2026-08-13",
    docProgress: { manifest: { date: "2026-08-14" } } }).range, null));
t("In Factory terisi -> rentang hilang", () =>
  eq(predictDelivery({ mode: "import", ...R("CNCAN"), etaMode: "auto",
    eta: "2026-08-13", factoryDate: "2026-08-18" }).range, null));

console.log("— EXPORT TIDAK DISENTUH —");
t("buku export: recompute tidak menghasilkan apa-apa", () => {
  const s = { mode: "export", etaMode: "auto", ...KR, transport: "laut", muatan: "FCL", actual: "2026-09-09" };
  eq(Object.keys(recomputeShipmentDates(s)).length, 0);
});

console.log("— KONFIGURASI, BUKAN KODE —");
t("mengubah angka konfigurasi mengubah hasil", () => {
  const r = PREDICTION_CONFIG.routes.find((x) => x.id === "kr-id");
  const asli = r.days.SEA_FCL.direct;
  r.days.SEA_FCL.direct = 20;
  eq(predictEta({ ...KR, transport: "laut", muatan: "FCL" }).eta, "2026-08-23");
  r.days.SEA_FCL.direct = asli;
});
t("aturan lebih spesifik menang atas yang umum", () => {
  PREDICTION_CONFIG.routes.unshift({
    id: "khusus", label: "Busan → Priok", match: { fromPort: "PUS", toPort: "TPP" },
    days: { AIR: { direct: 1, transit: 1 }, SEA_FCL: { direct: 5, transit: 6 }, SEA_LCL: { direct: 9, transit: 9 } },
  });
  eq(predictEta({ ...KR, origin: "KRPUS", transport: "laut", muatan: "FCL" }).ruleId, "khusus");
  eq(predictEta({ ...KR, origin: "KRPUS", transport: "laut", muatan: "FCL" }).eta, "2026-08-08");
  // rute lain tetap pakai aturan negara
  eq(predictEta({ ...KR, transport: "laut", muatan: "FCL" }).ruleId, "kr-id");
  PREDICTION_CONFIG.routes.shift();
});
t("aturan tidak cocok gugur seluruhnya", () => {
  eq(predictEta({ ...KR, origin: "JPYOK", transport: "laut", muatan: "FCL" }).ruleId, "default");
});
t("angka operasional dibaca dari konfigurasi", () => {
  const ops = predictionOpsDays(predictionContext({ transport: "laut", muatan: "FCL" }));
  eq(ops.clearance, 1); eq(ops.delivery, 1); eq(ops.stripping, 0);
});

console.log(`\n${pass} lulus, ${fail} gagal\n`);
process.exit(fail ? 1 : 0);
