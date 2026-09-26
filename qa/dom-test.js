"use strict";
/* Asap-uji tingkat DOM: memuat index.html sungguhan + seluruh berkas JS,
   lalu memeriksa perilaku form & kartu. Supabase & Bootstrap dipalsukan. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "..");

const htmlAsli = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* Seluruh <script> dilepas dulu, lalu dipasang kembali satu per satu
   SEBAGAI ELEMEN setelah tiruan Supabase & Bootstrap siap.

   Tidak bisa memakai window.eval() per berkas: deklarasi `const` di
   dalam eval hidup di lingkup miliknya sendiri dan lenyap begitu eval
   selesai — `const $` di js/ui/dom.js tidak akan pernah terlihat oleh
   berkas berikutnya. Elemen <script> sungguhan berbagi lingkup global,
   persis seperti di peramban. */
const html = htmlAsli.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
const w = dom.window;

// --- tiruan ketergantungan luar ---
const jejakUpdate = [];
/* Saringan doc_type terakhir yang diminta renderDocNumHistory(). */
const jejakDocNumFilter = {};
const jejakRpc = [];
w.supabase = { createClient: () => ({
  from: () => ({
    update: (row) => ({ eq: async (_c, id) => { jejakUpdate.push({ id, row }); return { error: null }; } }),
    /* Rantai .select().eq().order().range() ditiru lengkap.

       Sebelumnya .select() hanya mengembalikan { order }, jadi
       renderDocNumHistory() -- yang memakai .eq("doc_type", ...) --
       selalu melempar TypeError dan TIDAK PERNAH benar-benar teruji.
       Barisnya diambil dari jejakDocNum supaya tiap tes bisa menyiapkan
       isinya sendiri. */
    select: () => {
      const hasil = async () => ({
        data: (w.jejakDocNum || []).filter(
          (r) => !jejakDocNumFilter.doc_type || r.doc_type === jejakDocNumFilter.doc_type,
        ),
        error: null,
        count: (w.jejakDocNum || []).length,
      });
      const rantai = {
        eq: (kolom, nilai) => {
          jejakDocNumFilter[kolom] = nilai;
          return rantai;
        },
        /* .filter(kolom, operator, nilai) -- dipakai menyaring isi
           payload pada riwayat Pengajuan Dana. */
        filter: (kolom, op, nilai) => {
          jejakDocNumFilter[kolom] = op === "eq" ? nilai : op + ":" + nilai;
          return rantai;
        },
        order: () => rantai,
        range: hasil,
        limit: () => rantai,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (res, rej) => hasil().then(res, rej),
      };
      return rantai;
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "x" }, error: null }) }) }),
  }),
  /* Fungsi database (penerbitan nomor & reset seri) ikut ditiru: tanpa
     ini jalur penerbitan melempar TypeError dan tidak pernah teruji. */
  rpc: async (nama, args) => {
    jejakRpc.push({ nama, args });
    return { data: { out_number: "001/UJI", seq: 1 }, error: null };
  },
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) },
}) };
w.bootstrap = { Modal: class {
  constructor(){} show(){} hide(){}
  static getInstance(){ return null; }
  // Dipakai kotak Detail Pengajuan Nomor; tanpa ini ia melempar
  // sesudah isinya tergambar, dan uji melihatnya sebagai kegagalan.
  static getOrCreateInstance(){ return new w.bootstrap.Modal(); }
} };
w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener(){}, removeEventListener(){} }));
// jsdom tidak punya rAF; showToast() memakainya.
w.requestAnimationFrame = (fn) => w.setTimeout(fn, 0);
w.cancelAnimationFrame = (id) => w.clearTimeout(id);

/* `let activeMode` / `let formEtaMode` adalah binding LEKSIKAL global:
   hidup di lingkup global skrip, bukan sebagai properti window. Jadi
   w.formEtaMode selalu undefined walau nilainya benar. Dibaca &
   ditulis lewat eval di lingkup yang sama. */
const baca = (nama) => w.eval(nama);
let PC;
const tulis = (nama, nilai) => w.eval(`${nama} = ${JSON.stringify(nilai)}`);

// --- muat berkas js sesuai urutan di index.html ---
const urut = [...htmlAsli.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
const dimuat = [];
let galatMuat = 0;
w.addEventListener("error", (e) => {
  galatMuat++;
  console.log("  ✗ GALAT SAAT MEMUAT: " + (e.error && e.error.message));
});
urut.forEach((f) => {
  const el = w.document.createElement("script");
  el.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  const sebelum = galatMuat;
  w.document.body.appendChild(el);
  if (galatMuat === sebelum) dimuat.push(f);
  else console.log("      ^ di " + f);
});

/* ------------------------------------------------------------------
   "HARI INI" DIBEKUKAN

   Sebagian uji di berkas ini memakai tanggal yang ditulis mati (ETA
   06-08-2026 dan seterusnya). Mesinnya punya Lapis 4 ("Kenyataan")
   yang menjangkarkan ulang sisa proses ke HARI INI begitu perkiraannya
   sudah lewat — perilaku yang memang diinginkan, karena perkiraan
   bertanggal masa lalu tidak memberi tahu apa pun.

   Akibatnya uji-uji itu punya masa kedaluwarsa: begitu jam dinding
   melewati tanggalnya, lapis kenyataan ikut campur dan uji mulai
   berjatuhan — bukan karena ada yang rusak, tapi karena kalendernya
   berjalan. Tiga uji komitmen kurir sudah gagal seperti itu tepat saat
   tanggal berganti di tengah pengerjaan.

   engine-test.js sudah dibekukan lebih dulu dengan alasan yang sama;
   berkas ini menyusul, pada tanggal yang sama supaya keduanya bercerita
   tentang hari yang sama.
------------------------------------------------------------------ */
const HARI_INI_UJI = "2026-08-09";
w.eval(`todayISO = () => ${JSON.stringify(HARI_INI_UJI)};`);

let pass = 0, fail = 0;
/* Uji ASINKRON didukung: kalau fn() mengembalikan janji, hasilnya
   ditampung dan ditunggu sebelum ringkasan dicetak.

   Tanpa ini, kegagalan di dalam uji async menguap sebagai unhandled
   rejection -- ujinya terhitung LULUS padahal tidak pernah selesai
   diperiksa. */
/* Uji ASINKRON dijalankan BERURUTAN, bukan bersamaan.

   Semua uji berbagi satu jendela jsdom dan satu jejak saringan; kalau
   dijalankan serentak, yang satu menimpa keadaan yang sedang diperiksa
   yang lain dan kegagalannya terlihat acak. Fungsi async karena itu
   TIDAK dipanggil saat didaftarkan -- ia dirantai ke uji async
   sebelumnya, dan seluruh rantainya ditunggu sebelum ringkasan dicetak.

   Tanpa penanganan ini, kegagalan di dalam uji async menguap sebagai
   unhandled rejection dan ujinya terhitung LULUS. */
let rantaiAsync = Promise.resolve();
function t(name, fn) {
  const catatGagal = (e) => {
    fail++;
    console.log("  ✗ " + name + "\n      " + e.message);
  };
  if (fn.constructor && fn.constructor.name === "AsyncFunction") {
    rantaiAsync = rantaiAsync.then(() =>
      fn().then(() => { pass++; }, catatGagal),
    );
    return;
  }
  try {
    fn();
    pass++;
  } catch (e) {
    catatGagal(e);
  }
}
function eq(a, b, m) { if (a !== b) throw new Error((m||"") + ` diharap ${JSON.stringify(b)}, dapat ${JSON.stringify(a)}`); }
const $ = (s) => w.document.querySelector(s);

PC = w.eval("PREDICTION_CONFIG");

/* Peran bawaan harness: EXIM.

   Tanpa profil, canEdit() mengembalikan false — dan itu memang benar
   di produksi. Tapi sebagian besar uji di sini menguji pengalaman
   orang yang BISA mengubah data; kalau perannya dibiarkan kosong,
   yang teruji cuma tampilan viewer berulang-ulang.

   Uji viewer membalikkannya sendiri, lalu mengembalikannya. */
w.eval('authState.profile = { id: "harness", role: "exim" }');
console.log(`\n${dimuat.length}/${urut.length} berkas JS termuat`);

console.log("\n— MARKUP —");
["#etaModeSwitch", "#etaModeChip", "#etaManualNotice", "#predictionPanel",
 "#btnKeepManualEta", "#btnRecalcEtaAuto", "#actualAutoHint", "#confirmCancelBtn"]
 .forEach((sel) => t(`ada ${sel}`, () => { if (!$(sel)) throw new Error("tidak ada di DOM"); }));

console.log("— FUNGSI TEREKSPOR —");
["predictEta","predictDelivery","etaModeOf","recomputeShipmentDates","applyPredictionToAll",
 "refreshShipmentPrediction","initPredictionForm","syncPredictionForm","predictionStripHtml",
 "predictionDetailHtml","handleCardDateChange","addWorkingDaysISO","predictionMilestoneForStep"]
 .forEach((fn) => t(`${fn}() ada`, () => eq(typeof w[fn], "function")));

console.log("— FORM: MODE AUTO —");
tulis("activeMode", "import");
t("form baru -> mode auto, ETA terisi otomatis dari ETD", () => {
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "KRPUS"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  // Busan → Priok FCL = 10 hari (Master Route per pelabuhan)
  eq($("#fEta").value, "2026-08-13");
});
t("Estimated Delivery ikut terisi, dan TETAP bisa diketik", () => {
  eq($("#fActual").value, "2026-08-17");   // Kam13 + clearance1 + antar1
  eq($("#fActual").readOnly, false);
  eq(baca("formDeliveryMode"), "auto");
});
t("ganti ke LCL -> ETA & delivery bergerak", () => {
  $("#fMuatan").value = "LCL";
  $("#fMuatan").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-16");   // Busan → Priok LCL = 13 hari
  $("#fMuatan").value = "FCL";
  $("#fMuatan").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-13");
});
t("LAUT: Direct/Transit tidak lagi mengubah ETA", () => {
  /* Pengguna memang tidak tahu kapalnya transshipment atau tidak —
     itu urusan pelayaran. Master Route memakai satu angka. */
  $("#fRouteType").value = "transit";
  $("#fRouteType").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-13");
  $("#fRouteType").value = "direct";
  $("#fRouteType").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-13");
});
t("nama kapal mengubah ETA lewat deteksi carrier", () => {
  $("#fVessel").value = "HMM MIR";
  $("#fVessel").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-12");   // HMM = 9 hari
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("HMM")) throw new Error("carrier tidak ditampilkan");
  $("#fVessel").value = "MSC LORENA";
  $("#fVessel").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-14");   // MSC = 11 hari
  $("#fVessel").value = "";
  $("#fVessel").dispatchEvent(new w.Event("change"));
});
t("carrier tak dikenali dilaporkan di panel", () => {
  $("#fVessel").value = "KAPAL ENTAH";
  $("#fVessel").dispatchEvent(new w.Event("change"));
  if (!$("#predictionPanel").innerHTML.includes("Pelayaran tidak dikenali"))
    throw new Error("tidak dilaporkan");
  eq($("#fEta").value, "2026-08-13");   // turun ke rute pelabuhan
  $("#fVessel").value = "";
  $("#fVessel").dispatchEvent(new w.Event("change"));
});
t("sisa pekerjaan & sisa milestone ditampilkan", () => {
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("hari proses tersisa")) throw new Error("sisa hari tidak ada");
  if (!h.includes("Belum dikonfirmasi")) throw new Error("sisa milestone tidak ada");
});
t("panel prediksi tergambar", () => {
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("Estimated Delivery")) throw new Error("panel kosong");
  if (!h.includes("hari kerja")) throw new Error("rincian langkah tidak ada");
});

console.log("— FORM: BERPINDAH KE MANUAL —");
t("mengetik ETA memindahkan mode ke Manual", () => {
  $("#fEta").value = "2026-09-01";
  $("#fEta").dispatchEvent(new w.Event("change"));
  eq(baca("formEtaMode"), "manual");
  eq($("#etaModeChip").textContent.trim().includes("Manual"), true);
});
t("delivery memakai ETA manual (Sel 01-09 + clearance1 + antar1 = Kam 03-09)", () =>
  eq($("#fActual").value, "2026-09-03"));
t("ETD berubah saat manual -> spanduk muncul, ETA TIDAK berubah", () => {
  $("#fEtd").value = "2026-08-05";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-09-01");
  eq($("#etaManualNotice").classList.contains("d-none"), false);
});
t("'Pertahankan ETA Manual' menutup spanduk tanpa mengubah ETA", () => {
  $("#btnKeepManualEta").click();
  eq($("#etaManualNotice").classList.contains("d-none"), true);
  eq($("#fEta").value, "2026-09-01");
  eq(baca("formEtaMode"), "manual");
});
t("'Hitung Ulang Otomatis' mengembalikan ke auto & menimpa ETA", () => {
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  $("#btnRecalcEtaAuto").click();
  eq(baca("formEtaMode"), "auto");
  eq($("#fEta").value, "2026-08-13");
  eq($("#etaManualNotice").classList.contains("d-none"), true);
});
t("tombol Auto/Manual mengubah mode", () => {
  $('#etaModeSwitch [data-eta-mode="manual"]').click();
  eq(baca("formEtaMode"), "manual");
  $('#etaModeSwitch [data-eta-mode="auto"]').click();
  eq(baca("formEtaMode"), "auto");
});

console.log("— FORM: IN FACTORY —");
t("In Factory diisi -> Estimated Delivery = tanggal itu", () => {
  $("#fFactoryDate").value = "2026-08-27";
  $("#fFactoryDate").dispatchEvent(new w.Event("change"));
  eq($("#fActual").value, "2026-08-27");
  if (!$("#predictionPanel").innerHTML.includes("digantikan tanggal sebenarnya"))
    throw new Error("catatan final tidak muncul");
  $("#fFactoryDate").value = "";
  $("#fFactoryDate").dispatchEvent(new w.Event("change"));
});

console.log("— MODE EXPORT —");
t("buku export: sakelar ETA MUNCUL, papan mekanika kosong", () => {
  /* ETA otomatis berlaku di kedua buku, jadi sakelar Auto/Manual harus
     terlihat — tanpa itu tidak ada cara menyalakannya, dan itulah
     sebabnya ETA export dulu tidak pernah menyala walau mesinnya
     sanggup.

     Papan mekanikanya lain: isinya seluruhnya menjelaskan Estimated
     Delivery, yang di Export berarti Stuffing — fakta milik pengguna. */
  tulis("activeMode", "export");
  w.syncPredictionForm();
  eq($("#etaModeSwitch").classList.contains("d-none"), false, "sakelar ETA:");
  eq($("#predictionBlock").classList.contains("d-none"), false, "blok ETA:");
  eq($("#predictionPanel").innerHTML, "", "papan mekanika:");
  eq($("#deliveryModeSwitch").classList.contains("d-none"), true, "sakelar Delivery:");
  eq($("#fActual").readOnly, false, "Stuffing tetap bisa diketik:");
  tulis("activeMode", "import");
  w.syncPredictionForm();
});
t("buku export: mengisi ETD MENGISI ETA", () => {
  /* Inti keluhannya: ETD diisi, ETA tetap kosong. */
  tulis("activeMode", "export");
  const simpan = { etd: $("#fEtd").value, eta: $("#fEta").value,
    tr: $("#fTransport").value, o: $("#fOrigin").value, d: $("#fDestination").value };
  $("#fEta").value = "";
  $("#fEtd").value = "2026-08-22";
  $("#fTransport").value = "udara";
  $("#fOrigin").value = "CGK";
  $("#fDestination").value = "ICN";
  w.setFormEtaMode("auto", { recalc: false });
  w.hitungUlangEtaForm();
  const terisi = $("#fEta").value;
  $("#fEtd").value = simpan.etd; $("#fEta").value = simpan.eta;
  $("#fTransport").value = simpan.tr; $("#fOrigin").value = simpan.o;
  $("#fDestination").value = simpan.d;
  tulis("activeMode", "import");
  w.syncPredictionForm();
  if (!terisi) throw new Error("ETA export tetap kosong setelah ETD diisi");
  if (terisi <= "2026-08-22")
    throw new Error("ETA export tidak masuk akal: " + terisi);
});

console.log("— KARTU & DETAIL —");
const contoh = {
  id: "s1", mode: "import", party: "PT Contoh", items: [{ namaBarang: "Baja", qty: 1 }],
  transport: "laut", muatan: "FCL", origin: "KRPUS", destination: "IDTPP",
  routeType: "direct", etd: "2026-08-03", eta: "2026-08-14", etaMode: "manual",
  actual: "2026-08-20", status: "process", docProgress: {},
};
t("strip prediksi muncul di kartu", () => {
  const h = w.predictionStripHtml(contoh);
  if (!h.includes("Estimated Delivery")) throw new Error("tidak ada");
  if (!h.includes("Sumber")) throw new Error("sumber tidak ditampilkan");
  if (!/\d+% ·/.test(h)) throw new Error("keyakinan persen tidak ditampilkan");
});
t("kartu import: Estimated Delivery bisa diedit + berlabel mode", () => {
  const h = w.renderCard(contoh);
  if (!h.includes('data-field="actual"')) throw new Error("seharusnya bisa diedit");
  if (!h.includes("eta-mode-chip")) throw new Error("label mode tidak ada");
});
t("mode manual ditandai di kartu", () => {
  const h = w.renderCard({ ...contoh, deliveryMode: "manual" });
  if (!h.includes("date-field--pinned")) throw new Error("tidak ditandai terkunci");
});
t("kartu export TIDAK mengunci Estimated Delivery/Stuffing", () => {
  tulis("activeMode", "export");
  // ETD harus BELUM lewat: export yang ETD-nya terlewati sudah Delivered
  const h = w.renderCard({ ...contoh, mode: "export", etd: "2099-01-01" });
  if (!h.includes('data-field="actual"')) throw new Error("seharusnya bisa diedit");
  tulis("activeMode", "import");
});

console.log("— URUTAN KARTU MENURUT ESTIMATED DELIVERY —");
t("Import dikelompokkan menurut Estimated Delivery", () => {
  /* `actual` di buku Import berisi Estimated Delivery — hasil mesin
     prediksi (Auto) atau tanggal yang dipatok pengguna (Manual). */
  tulis("activeMode", "import");
  eq(w.groupKeyOf({ mode: "import", etd: "2026-08-06", eta: "2026-08-07",
    actual: "2026-08-12", docProgress: {} }), "2026-08-12");
});
t("jatuh ke ETA lalu ETD kalau perkiraan belum ada", () => {
  /* Jadwal yang baru dibuat belum tentu punya perkiraan; menaruhnya di
     kelompok "tanpa tanggal" membuatnya hilang dari pandangan. */
  tulis("activeMode", "import");
  eq(w.groupKeyOf({ mode: "import", etd: "2026-08-06", eta: "2026-08-07", docProgress: {} }),
     "2026-08-07");
  eq(w.groupKeyOf({ mode: "import", etd: "2026-08-06", docProgress: {} }), "2026-08-06");
});
t("Export tetap menurut Stuffing", () => {
  tulis("activeMode", "export");
  eq(w.groupKeyOf({ mode: "export", etd: "2099-08-06", eta: "2099-08-20",
    actual: "2099-08-10", docProgress: {} }), "2099-08-10");
  tulis("activeMode", "import");
});
t("yang sudah tiba tetap menurut tanggal kejadiannya", () => {
  /* Estimated Delivery sengaja tidak dipakai di sini — ia perkiraan,
     dan mengurutkan riwayat menurut perkiraan membuat urutannya
     meleset dari kejadian sebenarnya. */
  tulis("activeMode", "import");
  eq(w.groupKeyOf({ mode: "import", eta: "2026-08-07", actual: "2026-08-12",
    factoryDate: "2026-08-09", docProgress: {} }), "2026-08-09");
});
t("label pemisah tanggal menyebut dasarnya", () => {
  tulis("activeMode", "import");
  eq(w.sortBasis(), "estimasi kirim");
  tulis("activeMode", "export");
  eq(w.sortBasis(), "stuffing");
  tulis("activeMode", "import");
});

console.log("— EXPORT DELIVERED: ETD & ETA TETAP TERLIHAT —");
const exDelivered = { id: "xd1", mode: "export", party: "PT Uji",
  invoice: "INV-1", etd: "2026-08-01", eta: "2026-08-14", actual: "2026-07-30",
  items: [{ namaBarang: "A", qty: 1 }], status: "process", docProgress: {} };

t("kartu Delivered tetap menampilkan ETD & ETA", () => {
  tulis("activeMode", "export");
  eq(w.isArrived(exDelivered), true);          // ETD sudah lewat
  const h = w.renderCard(exDelivered);
  if (!h.includes("collapsed-dates")) throw new Error("blok tanggal tidak ada");
  if (!h.includes("2026-08-01")) throw new Error("ETD hilang");
  if (!h.includes("2026-08-14")) throw new Error("ETA hilang");
  tulis("activeMode", "import");
});
t("ketiganya HANYA BISA DIBACA", () => {
  /* ETD, ETA, dan Estimated Delivery -- tiga kotak. */
  tulis("activeMode", "export");
  const h = w.renderCard(exDelivered);
  const blok = h.slice(h.indexOf("collapsed-dates"), h.indexOf("ship-body-split"));
  eq((blok.match(/readonly/g) || []).length, 3);
  // Tanpa data-action, klik tidak menyimpan apa pun
  if (/data-action="date"/.test(blok)) throw new Error("masih bisa diubah dari kartu");
  tulis("activeMode", "import");
});
t("jadwal yang pernah dimundurkan ditandai, dan yang tampil tanggal TERBARU", () => {
  /* Kalau jadwalnya dimundurkan, angka yang berlaku adalah tanggal
     update delay -- bukan rencana awal yang sudah diketahui meleset.
     Rencana awalnya tetap bisa dilihat lewat tombol pensil. */
  tulis("activeMode", "export");
  const h = w.renderCard({ ...exDelivered, etaUpdate: "2026-08-20" });
  if (!h.includes("Pernah dimundurkan")) throw new Error("penanda delay hilang");
  if (!h.includes("2026-08-20")) throw new Error("ETA terbaru tidak dipakai");
  tulis("activeMode", "import");
});
t("tombol pensil tetap tersedia untuk mengubahnya", () => {
  tulis("activeMode", "export");
  const h = w.renderCard(exDelivered);
  if (!/data-action="edit"/.test(h)) throw new Error("tombol edit hilang dari kartu Delivered");
  tulis("activeMode", "import");
});
t("kartu Import yang sudah tiba juga menampilkannya", () => {
  tulis("activeMode", "import");
  const h = w.renderCard({ ...exDelivered, mode: "import", factoryDate: "2026-08-05" });
  if (!h.includes("collapsed-dates")) throw new Error("blok tanggal hilang di buku Import");
  if (!h.includes("2026-08-01")) throw new Error("ETD hilang");
});
t("lencana ringkas ikut tampil pada kartu selesai", () => {
  /* Kiriman yang sudah selesai justru paling sering dicari ulang untuk
     nilai & jenis muatannya. */
  tulis("activeMode", "export");
  const h = w.renderCard({ ...exDelivered, muatan: "LCL", incoterm: "CIF",
    items: [{ namaBarang: "A", qty: 2, harga: 1000 }] });
  if (!h.includes("tag-row--collapsed")) throw new Error("baris lencana hilang");
  if (!h.includes("LCL")) throw new Error("jenis muatan hilang");
  if (!h.includes("CIF")) throw new Error("incoterm hilang");
  if (!/\$2,000|\$2\.000/.test(h)) throw new Error("total nilai hilang");
  tulis("activeMode", "import");
});
t("surat jalan: setiap blok benar-benar tergaris", () => {
  /* Bukan memeriksa aturannya ada, tapi memeriksa TIAP BLOK punya
     pemilik garis. Saat --sj-line jadi siklik, semua aturan tetap ada
     di CSS — yang hilang cuma hasilnya. */
  const css = w.suratJalanCss();
  /* .sj-title sengaja TIDAK ada di daftar: garis di bawahnya dimiliki
     baris pertama blok meta, dan garis di atasnya dimiliki kop.
     Menuntutnya menggambar sendiri justru mengembalikan garis ganda. */
  [".sj-box", ".sj-kop td", ".sj-meta td",
   ".sj-items th, .sj-items td", ".sj-sign td"].forEach((sel) => {
    const i = css.indexOf(sel + " {");
    if (i < 0) throw new Error("aturan hilang: " + sel);
    const blok = css.slice(i, css.indexOf("}", i));
    if (!/border[^:]*:\s*var\(--sj-line\)/.test(blok))
      throw new Error(sel + " tidak menggambar garis");
  });
});
t("surat jalan: ruang kosong tanpa garis kolom", () => {
  const css = w.suratJalanCss();
  if (!/\.sj-fill td \{ border-left: 0/.test(css))
    throw new Error("baris kosong masih berkolom");
  if (!/\.sj-items th, \.sj-items td \{\s*border-top: var\(--sj-line\); border-left: var\(--sj-line\)/.test(css))
    throw new Error("sel tabel belum memakai konvensi atas+kiri");
  if (/border-collapse: collapse/.test(css))
    throw new Error("masih memakai collapse — garis akan terbaca beda tebal");
});
t("PENJAGA: aturan sel tidak dikalahkan aturan umum tabelnya", () => {
  /* Kelas jebakan: ".ci-items td" berkekhususan (0,1,1) dan
     mengalahkan kelas tunggal (0,1,0). Aturan yang kalah tidak
     berbuat apa-apa — dan pada tabel berlebar tetap, teks yang tetap
     besar meluber melewati garis lalu menabrak sel sebelahnya. */
  const khusus = (sel) => {
    const k = (sel.match(/\./g) || []).length;
    const e = (sel.replace(/\.[\w-]+/g, " ").match(/\b[a-z]+\b/g) || []).length;
    return k * 100 + e;
  };
  const cek = (css, umum, khususnya) => {
    const nUmum = Math.max(...umum.split(",").map((x) => khusus(x.trim())));
    khususnya.forEach((sel) => {
      // Selektor bisa jadi bagian daftar, jadi dicari apa adanya
      if (css.indexOf(sel) < 0) throw new Error("aturan hilang: " + sel);
      if (khusus(sel) <= nUmum)
        throw new Error(sel + " (" + khusus(sel) + ") kalah dari aturan umum (" + nUmum + ")");
    });
  };
  /* Hanya aturan yang menyetel properti yang bisa dikalahkan.
     .ci-cbm kini tanpa aturan sama sekali — lebarnya dari <colgroup>,
     nowrap dari aturan umum — jadi tidak ada yang perlu dijaga. */
  cek(w.ciplCss(), ".ci-items th, .ci-items td", [".ci-items td.ci-dim"]);
  cek(w.suratJalanCss(), ".sj-items th, .sj-items td",
      [".sj-items td.sj-ket"]);
});
t("Item & Type: satu baris kalau muat, MEMBUNGKUS kalau tidak", () => {
  /* Sempat dipaksa satu baris dengan mengecilkan huruf otomatis.
     Hasilnya terlihat cacat: satu baris 6pt, baris di bawahnya 7,5pt,
     dalam tabel yang sama. Sekarang yang menyesuaikan LEBAR KOLOMNYA;
     kalau sudah mentok, teksnya membungkus seperti biasa. */
  const css = w.ciplCss();
  const i = css.indexOf(".ci-items td.ci-item");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/\.ci-items td\.ci-type/.test(css.slice(i, i + 120)))
    throw new Error("kolom Type tidak ikut diatur");
  if (!/white-space: normal/.test(blok))
    throw new Error("masih dipaksa satu baris — nama panjang akan terpotong");
  if (/text-overflow:\s*clip/.test(blok))
    throw new Error("masih memotong teks alih-alih membungkusnya");

  const row = { id: "wr", doc_number: "X", doc_date: "2026-08-05", payload: {} };
  const jad = { id: "wr1", mode: "export", items: [{
    namaBarang: "TYRE MOLD FULL SET - NOKIAN ENTRUST 235/45R19 SAVER",
    hsCode: "23424252", qty: 43, satuan: "PCS", harga: 1,
    netto: 10, bruto: 12, package: "81*81*81", packing: "1 BOX" }] };
  [w.ciplHalamanInvoice(row, jad, w.ciplBarisBarang(jad)),
   w.ciplHalamanPacking(row, jad, w.ciplBarisBarang(jad))].forEach((h, k) => {
    if (!h.includes("ci-c ci-type"))
      throw new Error((k ? "Packing List" : "Invoice") + ": kolom Type tidak ditandai");
  });
});
t("kolom selain Item & Type tetap satu baris", () => {
  const css = w.ciplCss();
  const i = css.indexOf(".ci-items td.ci-item");
  const blok = css.slice(i, css.indexOf("}", i));
  // Yang dikecualikan hanya dua; jangan sampai ci-dim/ci-cbm ikut
  [".ci-dim", ".ci-cbm", ".ci-num", ".ci-cur"].forEach((sel) => {
    if (blok.includes(sel) || css.slice(i - 60, i).includes(sel))
      throw new Error(sel + " ikut dikecualikan — kolomnya harus satu baris");
  });
});

t("Surat Jalan TIDAK ikut berubah — nama barangnya tetap membungkus", () => {
  /* Yang diminta hanya Packing List. Surat jalan dokumen lain dengan
     lebar kolom lain; mengubahnya sekalian berarti mengubah cetakan
     yang tidak dikeluhkan siapa pun. */
  const css = w.suratJalanCss();
  const umum = ".sj-items th, .sj-items td";
  const nama = ".sj-items td.sj-nama";
  const blokUmum = css.slice(css.indexOf(umum), css.indexOf("}", css.indexOf(umum)));
  if (!/white-space: nowrap/.test(blokUmum))
    throw new Error("kolom lain surat jalan masih boleh membungkus");
  const blokNama = css.slice(css.indexOf(nama), css.indexOf("}", css.indexOf(nama)));
  if (!/white-space: normal/.test(blokNama))
    throw new Error("nama barang surat jalan ikut dipaksa satu baris");
});
t("pengepas KOLOM ikut terkirim ke jendela cetak", () => {
  const skrip = w.ciplSkripPasKolom();
  if (!/function ciplPasKolom/.test(skrip))
    throw new Error("pengepas tidak ada di dokumen cetak");
  /* Diukur dengan canvas, bukan scrollWidth. Untuk sel tabel dengan
     table-layout: fixed, scrollWidth tidak dapat diandalkan — teksnya
     terpotong tapi selisihnya tidak pernah terbaca, jadi pengepasnya
     diam saja. Itu yang membuat versi sebelumnya tidak pernah bekerja. */
  if (!/measureText\(/.test(skrip))
    throw new Error("pengepas tidak mengukur teksnya");
  if (/scrollWidth/.test(skrip))
    throw new Error("kembali memakai scrollWidth — tidak andal di sel tabel");
  // Yang diubah lebar kolom, BUKAN ukuran huruf.
  if (/style\.fontSize/.test(skrip))
    throw new Error("masih mengecilkan huruf — baris jadi beda-beda ukurannya");
  if (!/kolItem\.style\.width/.test(skrip))
    throw new Error("lebar kolom tidak pernah diubah");
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-print.js"), "utf8");
  const iPas = src.indexOf("ciplPasKolom()");
  const iPrint = src.indexOf("w.print()");
  if (iPas < 0 || iPas > iPrint)
    throw new Error("pengepas dipanggil setelah print — yang tercetak lebar lama");
});
t("pelebaran kolom DIBATASI — dan batasnya benar-benar mengikat", () => {
  /* Semula ada DUA batas: ambang persen untuk kolom nama, dan lantai
     kolom penyumbang. Yang pertama tidak pernah tercapai — menaikkannya
     sampai 100 pun hasilnya sama, dan uji yang memeriksanya ikut lulus
     tanpa arti. Sekarang satu batas, dan uji ini menghitung batas
     EFEKTIFNYA, bukan sekadar memastikan angkanya ada. */
  const skrip = w.ciplSkripPasKolom();
  const lantai = /LANTAI_SUMBANG = (\d+)/.exec(skrip);
  if (!lantai) throw new Error("kolom penyumbang tidak punya lantai");
  if (/PERSEN_MAKS/.test(skrip))
    throw new Error("batas kedua muncul lagi — pastikan ia benar-benar mengikat");

  const c = baca("CIPL_COLS_PACKING");
  const awalItem = c[1], awalSumbang = c[8];
  const maksEfektif = awalItem + Math.max(0, awalSumbang - Number(lantai[1]));

  if (maksEfektif <= awalItem)
    throw new Error("kolom nama tidak bisa melebar sama sekali");
  if (maksEfektif > 30)
    throw new Error(
      `kolom nama bisa tumbuh sampai ${maksEfektif}% — terlalu bebas, ` +
      "dua Packing List akan tercetak dengan tabel berbeda bentuk");
});
t("jumlah lebar tetap 100% setelah kolom melebar", () => {
  /* Penjaga aritmetika: yang ditambahkan ke kolom nama harus PERSIS
     yang diambil dari penyumbang. Kalau tidak, tabelnya meluber atau
     menyisakan celah di kanan. */
  const skrip = w.ciplSkripPasKolom();
  if (!/kolSumbang\.style\.width = \(sumbangKini - tambah\)/.test(skrip))
    throw new Error("penyumbang tidak dikurangi sebanyak yang ditambahkan");
  if (!/kolItem\.style\.width = \(persenKini \+ tambah\)/.test(skrip))
    throw new Error("kolom nama tidak ditambah sebanyak yang disumbangkan");
  if (!/if \(!kolSumbang\) continue/.test(skrip))
    throw new Error("tanpa penyumbang, kolom nama tetap melebar dan jumlahnya lewat 100%");
});
t("kolom yang melebar & menyumbang ditandai di markup, bukan nomor indeks", () => {
  /* Indeks yang ditulis di dua tempat akan bergeser sendiri begitu ada
     kolom disisipkan, dan yang melebar jadi kolom yang salah. */
  const row = { id: "cg", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanPacking(row, null, []);
  if (!/data-pas="item"/.test(h)) throw new Error("kolom nama tidak ditandai");
  if (!/data-pas="sumbang"/.test(h)) throw new Error("kolom penyumbang tidak ditandai");
  // Invoice tidak ikut — kolom namanya sudah lebar.
  if (/data-pas=/.test(w.ciplHalamanInvoice(row, null, [])))
    throw new Error("Invoice ikut ditandai padahal tidak diminta");
});
t("PENJAGA: lebar kolom berjumlah tepat 100%", () => {
  /* Kurang dari 100 -> sisanya dibagi proporsional, kolom angka melar.
     Lebih dari 100 -> dipangkas proporsional, kolom yang tak boleh
     menyempit ikut menyempit. Yang benar tepat 100. */
  const CI = w.eval("CIPL_COLS_INVOICE");
  const PL = w.eval("CIPL_COLS_PACKING");
  eq(CI.length, 10, "jumlah kolom Invoice:");
  eq(PL.length, 10, "jumlah kolom Packing List:");
  eq(Math.round(CI.reduce((a, b) => a + b, 0) * 10) / 10, 100, "Invoice:");
  eq(Math.round(PL.reduce((a, b) => a + b, 0) * 10) / 10, 100, "Packing List:");
});
t("PENJAGA: lebar dipasang lewat colgroup, bukan kelas sel", () => {
  /* Baris pertama tabel berisi header ber-colspan ("Unit Price",
     "Amount", "CBM"). Dengan table-layout tetap, kolom yang tertutup
     colspan tidak punya lebar sendiri dan peramban membaginya RATA —
     lebar apa pun yang ditulis di sel body diabaikan. */
  const row = { id: "cg", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  [w.ciplHalamanInvoice(row, null, []), w.ciplHalamanPacking(row, null, [])]
    .forEach((h, i) => {
      const nama = i ? "Packing List" : "Invoice";
      // Kolom bertanda data-pas punya atribut tambahan — jangan dipatok.
      const cols = (h.match(/<col style="width:[\d.]+%"[^>]*>/g) || []);
      eq(cols.length, 10, nama + " jumlah <col>:");
      if (h.indexOf("<colgroup>") > h.indexOf("<thead>"))
        throw new Error(nama + ": colgroup harus sebelum thead");
    });
  // Tidak boleh ada lebar kolom tertinggal di CSS — dua sumber kebenaran
  const css = w.ciplCss();
  [".ci-w-item", ".ci-w-type", ".ci-w-money", ".ci-items td.ci-dim"].forEach((sel) => {
    const i = css.indexOf(sel);
    if (i < 0) return;
    const blok = css.slice(i, css.indexOf("}", i));
    if (/width:\s*[\d.]+%/.test(blok))
      throw new Error(sel + " masih menyimpan lebarnya sendiri");
  });
});
t("kolom teks & dimensi mendapat porsi terbesar", () => {
  const CI = w.eval("CIPL_COLS_INVOICE");
  const PL = w.eval("CIPL_COLS_PACKING");
  // Invoice: Item(1) & Type(2) terlebar
  const lainCI = CI.filter((_, i) => i !== 1 && i !== 2);
  if (Math.max(...lainCI) >= Math.min(CI[1], CI[2]))
    throw new Error("ada kolom angka selebar kolom teks di Invoice");
  // Packing List: dimensi(8) harus lebih lebar daripada nilai CBM(9)
  if (!(PL[8] > PL[9]))
    throw new Error("kolom dimensi (" + PL[8] + "%) tidak lebih lebar dari nilai CBM (" + PL[9] + "%)");
  // dan cukup untuk "81 CM x 81 CM x 81 CM" (~93px pada 6,5pt)
  if (PL[8] / 100 * 716 < 110)
    throw new Error("kolom dimensi cuma " + Math.round(PL[8] / 100 * 716) + "px");
});
t("halaman Packing List memakai porsinya sendiri", () => {
  const row = { id: "pw", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  if (!w.ciplHalamanPacking(row, null, []).includes("ci-items--pl"))
    throw new Error("penanda halaman PL hilang");
  if (w.ciplHalamanInvoice(row, null, []).includes("ci-items--pl"))
    throw new Error("penanda PL bocor ke Invoice");
});

t("PENJAGA: tidak ada batas yang digambar dua blok bertumpuk", () => {
  /* Kalau blok atas menggambar border-bottom SEKALIGUS blok bawahnya
     menggambar border-top, garis di batas itu tergambar dua kali —
     dan hanya di situ tebalnya berlipat. */
  const sisi = (css, sel) => {
    const i = css.indexOf(sel + " {");
    if (i < 0) return null;
    const blok = css.slice(i, css.indexOf("}", i));
    return {
      atas: /border-top:\s*var\(/.test(blok),
      bawah: /border-bottom:\s*var\(/.test(blok),
    };
  };
  const cek = (css, nama, pasangan) => {
    pasangan.forEach(([atas, bawah]) => {
      const a = sisi(css, atas);
      const b = sisi(css, bawah);
      if (!a || !b) throw new Error(nama + ": aturan hilang — " + atas + " / " + bawah);
      if (a.bawah && b.atas)
        throw new Error(nama + ": batas " + atas + " >> " + bawah + " digambar dua kali");
      if (!a.bawah && !b.atas)
        throw new Error(nama + ": batas " + atas + " >> " + bawah + " tidak digambar siapa pun");
    });
  };
  cek(w.suratJalanCss(), "SJ", [
    [".sj-kop td", ".sj-title"],
    [".sj-title", ".sj-meta td"],
    [".sj-meta td", ".sj-items th, .sj-items td"],
  ]);
  /* Untuk CIPL, sisi atas tabel barang ditentukan aturan yang lebih
     khusus (.ci-items thead th) yang mematikannya — jadi itu yang
     diperiksa, bukan aturan umumnya. */
  cek(w.ciplCss(), "CIPL", [
    [".ci-ship", ".ci-items thead th"],
  ]);
});
t("baris Total surat jalan menutup sisi bawahnya", () => {
  /* Baris terakhir tabel: tidak ada baris berikutnya yang menggambar
     border-top, jadi ia harus menutup dirinya sendiri. */
  const css = w.suratJalanCss();
  if (!/\.sj-items tfoot td \{[^}]*border-bottom: var\(--sj-line\)/.test(css))
    throw new Error("sisi bawah baris Total menggantung");
});

t("PENJAGA: variabel garis tidak menunjuk dirinya sendiri", () => {
  /* `--x: var(--x)` dianggap tidak sah oleh CSS, dan akibatnya bukan
     garis salah tebal melainkan SELURUH garis lenyap. Tidak ada uji
     tata letak yang menangkapnya — keduanya sama-sama "tidak ada
     border yang salah". */
  [["ciplCss", "--ci-line"], ["suratJalanCss", "--sj-line"]].forEach(([fn, v]) => {
    const css = w[fn]();
    const def = (css.match(new RegExp(v + ":[^;]+")) || [])[0] || "";
    if (!def) throw new Error(fn + ": definisi " + v + " hilang");
    if (/var\(/.test(def)) throw new Error(fn + ": " + v + " menunjuk dirinya sendiri");
    if (!/\d+(px|pt) solid/.test(def)) throw new Error(fn + ": " + v + " bukan nilai border");
  });
});
t("PENJAGA: setiap var(--line) punya definisinya", () => {
  [["ciplCss", "--ci-line"], ["suratJalanCss", "--sj-line"]].forEach(([fn, v]) => {
    const css = w[fn]();
    const pakai = (css.match(new RegExp("var\\(" + v + "\\)", "g")) || []).length;
    if (pakai < 5) throw new Error(fn + ": baru " + pakai + " garis memakai variabel");
    // Tidak boleh ada border dengan angka ditulis langsung
    const langsung = css.match(/border[^:]*:\s*[\d.]+(?:pt|px) solid/g) || [];
    eq(langsung.length, 0, fn + ":");
  });
});
t("surat jalan: satu nilai ketebalan garis", () => {
  const css = w.suratJalanCss();
  const literal = [...css.matchAll(/([\d.]+(?:pt|px)) solid/g)].map((m) => m[1]);
  eq([...new Set(literal)].join(","), "1px");
  eq(literal.length, 1);   // hanya definisi variabelnya
});
t("kotak tanda tangan CIPL tidak menggandakan garis bingkai", () => {
  /* Baris ini paling bawah di dalam kotak; sisi bawahnya berimpit
     dengan bingkai .ci-box. Dua garis berdempetan = terlihat dua kali
     lebih tebal daripada sisanya. */
  const css = w.ciplCss();
  const blok = css.slice(css.indexOf(".ci-sign-row .ci-sign-cell"));
  const isi = blok.slice(0, blok.indexOf("}"));
  if (/border-bottom/.test(isi))
    throw new Error("masih menggambar garis bawah di atas bingkai kotak");
});
t("kotak tanggal selebar isinya, tidak melar", () => {
  // CSS dimuat lewat <link>, jadi dibaca dari berkasnya
  const css = require("fs").readFileSync(__dirname + "/../css/card.css", "utf8");
  if (!/\.collapsed-dates \.date-field \{\s*flex: 0 0 auto/.test(css))
    throw new Error("kotak tanggal masih dipatok lebar");
  if (!/field-sizing: content/.test(css))
    throw new Error("isian tanggal tidak mengikuti panjang teksnya");
  if (!/calendar-picker-indicator[^}]*display: none/.test(css))
    throw new Error("ikon pemilih tanggal masih memakan lebar");
});

console.log("— EXPORT: DELIVERED SAAT ETD TERCAPAI —");
t("ETD terlewati -> Delivered", () => {
  eq(w.isArrived({ mode: "export", etd: "2026-08-01" }), true);
  eq(w.isArrived({ mode: "export", etd: "2099-01-01" }), false);
});
t("ETD hari ini -> sudah Delivered", () =>
  eq(w.isArrived({ mode: "export", etd: w.todayISO() }), true));
t("kotak delay menang atas ETD rencana", () => {
  eq(w.isArrived({ mode: "export", etd: "2026-08-01", etdUpdate: "2099-01-01" }), false);
  eq(w.isArrived({ mode: "export", etd: "2099-01-01", etdUpdate: "2026-08-01" }), true);
});
t("Stuffing yang lewat TIDAK lagi menandai Delivered", () => {
  // Muatan sudah naik tapi kapal belum berlayar -> masih di tangan kita
  eq(w.isArrived({ mode: "export", etd: "2099-01-01", actual: "2026-08-01" }), false);
});
t("aturan ini TIDAK berlaku di buku Import", () =>
  eq(w.isArrived({ mode: "import", etd: "2026-08-01" }), false));

console.log("— REPORT EXPORT: SARING STUFFING —");
t("ganti bahasa selagi form Export terbuka: label tetap label Export", () => {
  /* Label form ditulis JS sesuai buku; terjemahan tetap di HTML (untuk
     Import) dulu menimpanya saat bahasa diganti -- form Export tiba-tiba
     berlabel "No. SPPB" dan "Tanggal In Factory". */
  const simpan = { mode: baca("activeMode"), lang: baca("activeLang") };
  const label = () => ["lblFactoryDate", "lblDocNo"].map((i) => w.document.getElementById(i).textContent.trim()).join(" | ");
  const form = w.document.getElementById("viewForm");
  const tersembunyi = form.classList.contains("d-none");
  try {
    w.eval('activeMode = "export"');
    form.classList.remove("d-none");
    w.renderFormPage(null);
    eq(label(), "Tanggal Stuffing | No. PEB", "dibuka:");
    w.setLang("en");
    eq(label(), "Stuffing Date | No. PEB", "Inggris:");
    w.setLang("id");
    eq(label(), "Tanggal Stuffing | No. PEB", "kembali Indonesia:");
  } finally {
    w.setLang(simpan.lang);
    w.eval("activeMode = " + JSON.stringify(simpan.mode));
    if (tersembunyi) form.classList.add("d-none");
  }
});
t("buku Export tidak punya isian tersembunyi: Tanggal Stuffing lama dilebur ke isian Stuffing", () => {
  /* Kotak Tanggal & Jam Stuffing tersembunyi di form Export, tapi
     nilainya dulu tetap tersimpan dan tetap dibaca (daftar, prediksi,
     Report). Bulk Import mengisinya dari kolom tanggal stuffing. Sekarang
     lapisan data meleburnya ke isian Stuffing yang terlihat. */
  const baris = (kol) => w.rowToShipment(Object.assign({ id: "e1", mode: "export", party: "X", status: "process" }, kol));
  const a = baris({ actual: null, factory_date: "2026-09-23", factory_time: "08:00" });
  eq(a.actual + "|" + a.factoryDate + "|" + a.factoryTime, "2026-09-23||", "dilebur & dikosongkan:");
  const b = baris({ actual: "2026-09-30", factory_date: "2026-09-23" });
  eq(b.actual, "2026-09-30", "isian Stuffing yang terisi tetap menang:");
  // Import TIDAK tersentuh -- di sana kolom itu Tanggal In Factory sungguhan.
  const imp = w.rowToShipment({ id: "i1", mode: "import", actual: null, factory_date: "2026-09-23", status: "process" });
  eq(imp.factoryDate, "2026-09-23", "Import:");
  // Menyimpan jadwal Export selalu mengosongkan kolomnya di database.
  const row = w.shipmentToRow({ actual: "2026-09-23", factoryDate: "2026-09-01", factoryTime: "08:00" }, "export");
  eq(String(row.factory_date) + "|" + String(row.factory_time), "null|null", "disimpan:");
  eq(w.shipmentToRow({ factoryDate: "2026-09-01" }, "import").factory_date, "2026-09-01", "Import disimpan apa adanya:");
});
t("Report: jadwal yang stuffing-nya hari ini tidak tersalin, termasuk yang tanggalnya dari data lama", () => {
  /* Kasus yang dilaporkan: tanggal stuffing tersimpan di kolom
     tersembunyi (hasil Bulk Import), isian Stuffing kosong. Lewat
     lapisan data, tanggal itu menjadi isian Stuffing dan Report
     membuangnya seperti seharusnya. ETD minggu depan supaya yang diuji
     memang aturan stuffing, bukan aturan ETD (isArrived). */
  const simpan = { e: baca("data.export"), i: baca("data.import") };
  const hari = w.todayISO();
  const d = new Date(); d.setDate(d.getDate() + 7);
  const nanti = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const ikut = (kol) => {
    const s = w.rowToShipment(Object.assign({ id: "e1", mode: "export", party: "KUMHO", etd: nanti, eta: nanti, status: "process" }, kol));
    w.__jadwalUji = s;
    w.eval("data.export = [window.__jadwalUji]; data.import = []");
    return /KUMHO/.test(w.buildReportCopyText());
  };
  try {
    eq(ikut({ actual: hari }), false, "isian Stuffing hari ini:");
    eq(ikut({ actual: null, factory_date: hari }), false, "tanggal lama di kolom tersembunyi, hari ini:");
    eq(ikut({ actual: nanti }), true, "stuffing minggu depan:");
    eq(ikut({ actual: null }), true, "belum diisi sama sekali:");
  } finally {
    tulis("data.export", simpan.e);
    tulis("data.import", simpan.i);
  }
});
t("Bulk Import buku Export: kolom tanggal stuffing masuk ke isian Stuffing", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "features", "bulk-excel.js"), "utf8");
  if (!/mode === "export"\s*\?\s*\{ actual: excelValueToISODate\(first\[idx\.FACTORY\]\) \}/.test(src))
    throw new Error("kolom tanggal stuffing Export masih masuk ke isian tersembunyi");
});
t("stuffing yang sudah lewat / hari ini tidak dilaporkan", () => {
  const kemarin = w.addCalendarDaysISO(w.todayISO(), -1);
  const besok = w.addCalendarDaysISO(w.todayISO(), 1);
  eq(w.exportStuffingBelumLewat({ actual: kemarin }), false);
  eq(w.exportStuffingBelumLewat({ actual: w.todayISO() }), false);
  eq(w.exportStuffingBelumLewat({ actual: besok }), true);
});
t("stuffing belum diisi tetap dilaporkan", () =>
  eq(w.exportStuffingBelumLewat({ actual: "" }), true));

console.log("— HS CODE DIBATASI 8 DIGIT —");
t("10 digit dipotong jadi 8", () => {
  eq(w.normalizeHsCodeInput("6903.10-0000"), "69031000");
  eq(w.normalizeHsCodeInput("8481400000"), "84814000");
});
t("yang sudah 8 digit atau kurang dibiarkan", () => {
  eq(w.normalizeHsCodeInput("69031000"), "69031000");
  eq(w.normalizeHsCodeInput("6903"), "6903");
  eq(w.normalizeHsCodeInput(""), "");
});
t("huruf & pemisah dibuang lebih dulu, baru dipotong", () =>
  eq(w.normalizeHsCodeInput("HS 8481.40.00.00"), "84814000"));

console.log("— SATUAN & KEMASAN CIPL —");
t("EA dikenali sebagai satuan", () => {
  const U = w.eval("UNIT_QTY_RE");
  ["EA", "PCS", "SET", "BOX", "CTN", "DOZ", "NOS"].forEach((u) => {
    if (!U.test(u)) throw new Error(u + " tidak dikenali");
  });
});
t("kemasan & dimensi dipisah menurut buku", () => {
  const raw = [{ name: "A", qty: 1, package: "1 BOX", dimensions: "50*42*14" }];
  tulis("activeMode", "import");
  eq(w.ciplRawItemsToFinalItems(raw)[0].package, "1 BOX");
  tulis("activeMode", "export");
  eq(w.ciplRawItemsToFinalItems(raw)[0].package, "50*42*14");
  tulis("activeMode", "import");
});
t("Import: total koli dari kolom, bukan dari dimensi", () => {
  // "50*42*14" akan terbaca 50 koli kalau salah kolom
  eq(w.extractLeadingNumber("1 BOX"), 1);
  eq(w.extractLeadingNumber("50*42*14"), 50);
});
t("Export: CBM dari dimensi", () => {
  eq(w.computeItemCbm({ package: "50*42*14", qty: 1 }), 0.029);
  eq(w.computeItemCbm({ package: "1 BOX", qty: 1 }), 0);
});

console.log("— CETAK CIPL —");
const jadwalCipl = {
  id: "sx1", mode: "export", party: "DYNAMIC DESIGN CO., LTD.",
  invoice: "DDI-CRBM-VIII-040", origin: "IDTPP", destination: "KRPUS",
  vessel: "HMM MIRACLE 0009S", etd: "2026-08-10", incoterm: "FOB",
  items: [
    { namaBarang: "TYRE MOLD FULL SET - NOKIAN ENTRUST 235/45R19",
      hsCode: "84807190", qty: 1, satuan: "SET", harga: 10490,
      netto: 280, bruto: 300, package: "81*81*81", packing: "1 BOX" },
    { namaBarang: "TYRE MOLD FULL SET - NOKIAN ENTRUST 235/45R19",
      hsCode: "84807190", qty: 3, satuan: "SET", harga: 6524,
      netto: 840, bruto: 900, package: "81*81*81", packing: "3 BOX" },
  ],
};
const barisCipl = () => w.ciplBarisBarang(jadwalCipl);

t("nama dipecah jadi Item + Type", () => {
  const b = barisCipl();
  eq(b[0].item, "TYRE MOLD FULL SET");
  eq(b[0].type, "NOKIAN ENTRUST 235/45R19");
});
t("kolom Size (data baru) didahulukan atas tebakan ciplPecahNama() kalau terisi", () => {
  const jadwal = Object.assign({}, jadwalCipl, {
    items: [{
      namaBarang: "TYRE MOLD KHUSUS TANPA POLA DIKENAL", size: "265/60R18",
      hsCode: "84807190", qty: 1, satuan: "SET", harga: 100,
    }],
  });
  const b = w.ciplBarisBarang(jadwal);
  eq(b[0].item, "TYRE MOLD KHUSUS TANPA POLA DIKENAL", "seluruh namaBarang jadi item, tidak dipotong:");
  eq(b[0].type, "265/60R18", "type = kolom size, bukan hasil tebakan:");
});
t("tanpa kolom Size (barang lama) tetap jatuh ke ciplPecahNama() seperti sebelumnya", () => {
  const b = barisCipl(); // jadwalCipl tidak punya field size sama sekali
  eq(b[1].item, "TYRE MOLD FULL SET");
  eq(b[1].type, "NOKIAN ENTRUST 235/45R19");
});
t("jenis barang baku dipisah walau tanpa tanda hubung", () => {
  /* "TYRE MOLD FULL SET CREDO SUNMODE SUV 215/65R16" ditulis
     menyambung; batasnya cuma bisa diketahui dari katalog barang. */
  [["TYRE MOLD FULL SET CREDO SUNMODE SUV 215/65R16",
    "TYRE MOLD FULL SET", "CREDO SUNMODE SUV 215/65R16"],
   ["TYRE MOLD SIDE ONLY CREDO SUNMODE 195/55R16",
    "TYRE MOLD SIDE ONLY", "CREDO SUNMODE 195/55R16"],
   ["TYRE MOLD TREAD ONLY ENTRUST 235/45R19",
    "TYRE MOLD TREAD ONLY", "ENTRUST 235/45R19"]]
    .forEach(([nama, item, type]) => {
      const r = w.ciplPecahNama(nama);
      eq(r.item, item, nama + " -> item:");
      eq(r.type, type, nama + " -> type:");
    });
});
t("tanda hubung tetap didahulukan", () => {
  /* Kalau penulisnya sudah memisahkan sendiri, itu batas yang paling
     bisa dipercaya — jangan ditimpa daftar. */
  const r = w.ciplPecahNama("TYRE MOLD FULL SET - NOKIAN ENTRUST 235/45R19");
  eq(r.item, "TYRE MOLD FULL SET");
  eq(r.type, "NOKIAN ENTRUST 235/45R19");
});
t("jenis terpanjang menang", () => {
  /* "TYRE MOLD SIDE ONLY" tidak boleh kalah oleh entri lain yang
     kebetulan jadi awalannya. */
  const urut = w.eval("CIPL_JENIS_BARANG").slice().sort((a, b) => b.length - a.length);
  eq(urut[0].length >= urut[urut.length - 1].length, true);
  const r = w.ciplPecahNama("TYRE MOLD SIDE ONLY X");
  eq(r.item, "TYRE MOLD SIDE ONLY");
});
t("huruf kecil tetap dikenali", () =>
  eq(w.ciplPecahNama("Tyre Mold Full Set Credo 215").item, "Tyre Mold Full Set"));

t("tanpa pemisah, Type dibiarkan kosong — bukan ditebak", () => {
  eq(w.ciplPecahNama("DRIVER SERVO TURET").item, "DRIVER SERVO TURET");
  eq(w.ciplPecahNama("DRIVER SERVO TURET").type, "");
});
t("Amount = Qty x Unit Price", () => {
  const b = barisCipl();
  eq(b[0].amount, 10490);
  eq(b[1].amount, 19572);
  eq(b.reduce((s, x) => s + x.amount, 0), 30062);
});
t("dimensi ditulis gaya CIPL", () =>
  eq(w.ciplDimensiTeks("81*81*81"), "81 CM x 81 CM x 81 CM"));
t("CBM per baris & totalnya", () => {
  const b = barisCipl();
  eq(b[0].cbm, 0.531);
  eq(b[1].cbm, 1.594);
  // Total dijumlah dari nilai MENTAH -> 2,126, sama dengan berkas asli
  eq(Math.round((b[0].cbmRaw + b[1].cbmRaw) * 1000) / 1000, 2.126);
});
t("total CBM di halaman PL memakai nilai mentah", () => {
  const row = { id: "d4", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanPacking(row, jadwalCipl, barisCipl());
  if (!h.includes("2.126")) throw new Error("total CBM tidak 2.126");
});
t("total koli dari kolom packing", () => eq(w.ciplTotalKoli(jadwalCipl), 4));

t("judul mengikuti jenis invoice", () => {
  eq(w.ciplJudulInvoice({ payload: { invoiceKind: "Commercial" } }), "COMMERCIAL INVOICE");
  eq(w.ciplJudulInvoice({ payload: { invoiceKind: "Non-Commercial" } }),
     "NON - COMMERCIAL INVOICE");
  // Tanpa pilihan tersimpan, Commercial yang dipakai
  eq(w.ciplJudulInvoice({ payload: {} }), "COMMERCIAL INVOICE");
});
t("dua halaman dari satu tombol", () => {
  const row = { id: "d1", doc_number: "DDI-CRBM-VIII-040", doc_date: "2026-08-03",
    payload: { invoiceKind: "Commercial", shipmentId: "sx1", currency: "USD",
      poNo: "DD-260724-DDI-01", poDate: "2026-07-24", termsDelivery: "FOB" } };
  const b = barisCipl();
  const h1 = w.ciplHalamanInvoice(row, jadwalCipl, b);
  const h2 = w.ciplHalamanPacking(row, jadwalCipl, b);
  if (!h1.includes("COMMERCIAL INVOICE")) throw new Error("judul CI hilang");
  if (!h2.includes("PACKING LIST")) throw new Error("judul PL hilang");
  if (!h2.includes("ci-page2")) throw new Error("PL tidak dipaksa halaman baru");
  if (!h1.includes("30,062")) throw new Error("total invoice salah");
  if (!h2.includes("4 Package")) throw new Error("jumlah koli hilang");
  if (!h1.includes("DD-260724-DDI-01")) throw new Error("PO tidak tercetak");
  if (!h1.includes("3 Aug 2026")) throw new Error("tanggal invoice tidak tercetak");
});
t("halaman NON-COMMERCIAL memakai judulnya sendiri", () => {
  const row = { id: "d2", doc_number: "DDI-025/2026-VII-EXIM-LOG",
    doc_date: "2026-07-14", payload: { invoiceKind: "Non-Commercial" } };
  const h = w.ciplHalamanInvoice(row, null, []);
  if (!h.includes("NON - COMMERCIAL INVOICE")) throw new Error("judul salah");
});
t("tanpa jadwal tertaut tetap tercetak, barangnya kosong", () => {
  const row = { id: "d3", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanInvoice(row, null, w.ciplBarisBarang(null));
  if (!h.includes("COMMERCIAL INVOICE")) throw new Error("gagal tercetak");
});
t("jadwal IMPORT tidak boleh dicetak sebagai CIPL", () => {
  tulis("data", { import: [{ id: "si1", mode: "import" }], export: [jadwalCipl] });
  eq(w.ciplBolehCetak({ payload: { shipmentId: "si1" } }), false);
  eq(w.ciplBolehCetak({ payload: { shipmentId: "sx1" } }), true);
  eq(w.ciplBolehCetak({ payload: {} }), true);
});

console.log("— DETAIL PENGAJUAN NOMOR —");
t("kunci payload punya label yang terbaca", () => {
  const L = w.eval("DN_LABEL_FIELD");
  [["poNo", "PO No."], ["poDate", "Tanggal PO"], ["invoiceKind", "Jenis Invoice"],
   ["notifyParty", "Notify Party"], ["portLoading", "Port of Loading"],
   ["termPayment", "Term of Payment"], ["termsDelivery", "Terms of Delivery"],
   ["consigneeAddress", "Alamat Consignee"], ["finalDestination", "Final Destination"],
   ["sailingDate", "Sailing on or About"], ["remarks", "Remarks"]]
    .forEach(([k, v]) => eq(L[k], v, k + ":"));
});
t("urutan tampil tetap, tidak ikut urutan pengisian", () => {
  const U = w.eval("DN_URUTAN_FIELD");
  const i = (k) => U.indexOf(k);
  if (!(i("invoiceKind") < i("customer"))) throw new Error("jenis invoice harus paling atas");
  if (!(i("customer") < i("consigneeAddress"))) throw new Error("alamat menyusul customer");
  if (!(i("poNo") < i("poDate"))) throw new Error("PO no sebelum tanggalnya");
  if (!(i("notes") === U.length - 1)) throw new Error("keterangan paling bawah");
});
t("seluruh field CIPL punya urutan", () => {
  const U = w.eval("DN_URUTAN_FIELD");
  ["invoiceKind", "consigneeAddress", "notifyParty", "poNo", "poDate",
   "termsDelivery", "termPayment", "portLoading", "finalDestination",
   "carrier", "sailingDate", "remarks"].forEach((k) => {
    if (U.indexOf(k) < 0) throw new Error("belum diurutkan: " + k);
  });
});

console.log("— AUDIT GARIS DOKUMEN CETAK —");
t("seluruh garis satu ketebalan & tidak ada yang ganda", () => {
  /* Memeriksa HASILNYA, bukan aturannya: tiap dokumen dirender, border
     terhitung tiap elemen dibaca, lalu tiap batas geometris ditelusuri
     pemiliknya. Grid tabel memperhitungkan colspan & rowspan. */
  const { auditGarisCetak } = require(__dirname + "/border-audit.js");
  /* jsdom diambil dengan cara biasa, BUKAN lewat jalur mutlak
     "/../../node_modules/jsdom".

     Jalur itu mengharuskan node_modules berada satu tingkat DI ATAS
     folder proyek. Selama proyeknya kebetulan diletakkan begitu,
     ujinya lulus; begitu proyeknya dipindah atau dibuka dari salinan
     zip, uji ini gagal dengan "Cannot find module" — bukan karena
     garisnya salah, tapi karena letak foldernya berbeda.

     Uji yang gagalnya tergantung lokasi folder lama-lama diabaikan,
     dan uji yang diabaikan tidak menjaga apa pun. */
  const { JSDOM } = require("jsdom");

  const jadwal = { id: "au1", mode: "export", party: "PT UJI", invoice: "INV-1",
    origin: "IDTPP", destination: "KRPUS", vessel: "KAPAL", etd: "2026-08-10",
    incoterm: "FOB", items: [
      { namaBarang: "BARANG SATU - TIPE A", hsCode: "84807190", qty: 1, satuan: "SET",
        harga: 100, netto: 280, bruto: 300, package: "81*81*81", packing: "1 BOX" },
      { namaBarang: "BARANG DUA - TIPE B", hsCode: "84807190", qty: 3, satuan: "SET",
        harga: 200, netto: 840, bruto: 900, package: "81*81*81", packing: "3 BOX" }] };
  const row = { id: "au2", doc_type: "invoice", doc_number: "X-1", doc_date: "2026-08-05",
    payload: { invoiceKind: "Commercial", currency: "USD", vehicle: "B 1 XX" } };
  const baris = w.ciplBarisBarang(jadwal);

  const laporan = auditGarisCetak(JSDOM, [
    { nama: "Commercial Invoice", css: w.ciplCss(), html: w.ciplHalamanInvoice(row, jadwal, baris) },
    { nama: "Packing List", css: w.ciplCss(), html: w.ciplHalamanPacking(row, jadwal, baris) },
    { nama: "Surat Jalan", css: w.suratJalanCss(), html: w.buildSuratJalanHtml(row, jadwal) },
  ]);

  laporan.forEach((r) => {
    if (!r.tebal.length) throw new Error(r.nama + ": tidak ada garis sama sekali");
    if (r.tebal.length !== 1)
      throw new Error(r.nama + ": " + r.tebal.map((x) => x.px + "px").join(" & "));
    if (r.ganda.length)
      throw new Error(r.nama + " garis ganda: " + r.ganda.join("; "));
  });
  // Pastikan dokumennya memang tergaris, bukan kosong lalu lolos
  eq(laporan.length, 3);
  laporan.forEach((r) => {
    if (r.tebal[0].jumlah < 50)
      throw new Error(r.nama + ": baru " + r.tebal[0].jumlah + " garis — dokumen tidak lengkap");
  });
});

console.log("— CIPL: SATUAN M3 & TATA LETAK TABEL —");
const rowPL = { id: "pl1", doc_number: "X", doc_date: "2026-08-03", payload: {} };
t("CBM per baris & total diberi satuan M3", () => {
  const h = w.ciplHalamanPacking(rowPL, jadwalCipl, barisCipl());
  eq((h.match(/M<sup>3<\/sup>/g) || []).length, 3);   // 2 baris + 1 total
  if (!h.includes("0.531 M<sup>3</sup>")) throw new Error("CBM baris tanpa satuan");
  if (!h.includes("2.126 M<sup>3</sup>")) throw new Error("total CBM tanpa satuan");
});
t("baris tanpa dimensi tidak diberi satuan kosong", () => {
  const tanpa = { ...jadwalCipl, items: [
    { namaBarang: "A - B", qty: 1, satuan: "SET", netto: 5, bruto: 6 } ] };
  const h = w.ciplHalamanPacking(rowPL, tanpa, w.ciplBarisBarang(tanpa));
  if (/M<sup>3<\/sup>/.test(h)) throw new Error("M3 muncul padahal CBM kosong");
});
t("ruang kosong tidak berkolom", () => {
  // Garis tegaknya dihapus; garis atasnya dipertahankan sebagai
  // penutup baris barang terakhir (lihat uji terpisah di bawah).
  if (!/\.ci-fill td \{ border-left: 0/.test(w.ciplCss()))
    throw new Error("ruang kosong masih berkolom");
});
t("sel barang rata tengah mendatar & tegak", () => {
  const css = w.ciplCss();
  if (!/\.ci-items tbody td \{[^}]*text-align: center/.test(css))
    throw new Error("belum rata tengah mendatar");
  if (!/\.ci-items tbody td \{[^}]*vertical-align: middle/.test(css))
    throw new Error("belum rata tengah tegak");
});
t("sel tabel barang memakai garis bersama", () => {
  const css = w.ciplCss();
  if (!/\.ci-items th, \.ci-items td \{\s*border-top: var\(--ci-line\);\s*border-left: var\(--ci-line\)/.test(css))
    throw new Error("sel tabel tidak memakai variabel garis pada atas & kiri");
});
t("nama barang ikut rata tengah, bukan rata kiri", () => {
  const h = w.ciplHalamanPacking(rowPL, jadwalCipl, barisCipl());
  if (/<td>\$?\{?TYRE/.test(h) || h.includes("<td>TYRE"))
    throw new Error("nama barang masih tanpa kelas rata tengah");
});

console.log("— CARRIER CIPL: GABUNGAN VOYAGER/VESSEL + VOYAGE/FLIGHT —");
t("Carrier pada cetak CIPL menggabungkan Nama Voyager/Vessel + No. Voyage/Flight", () => {
  const laut = { transport: "laut", vessel: "MSC LORENA", voyage: "056S",
    origin: "IDTPP", destination: "KRPUS" };
  const udara = { transport: "udara", vessel: "Garuda Cargo", voyage: "GA880/04JUL",
    origin: "IDCGK", destination: "KRICN" };
  if (!w.ciplAngkutanHtml({ payload: {} }, laut).includes("MSC LORENA 056S"))
    throw new Error("carrier laut belum tergabung");
  if (!w.ciplAngkutanHtml({ payload: {} }, udara).includes("Garuda Cargo GA880/04JUL"))
    throw new Error("carrier udara belum tergabung");
});

console.log("— ISIAN OTOMATIS DARI KARTU YANG DITAUTKAN —");
function siapkanPanelInvoice() {
  tulis("data", { import: [], export: [jadwalCipl] });
  w.isiPilihanJadwal();
  const panel = w.docNumPanelEl("invoice");
  panel.querySelectorAll("[data-dn]").forEach((el) => (el.value = ""));
  $("#dnInvoiceShipmentPick").value = "sx1";
  w.isiOtomatisDariJadwal();
  return panel;
}
const isi = (panel, nama) => panel.querySelector(`[data-dn="${nama}"]`).value;

t("Nilai diambil dari total nilai barang di jadwal", () => {
  const panel = siapkanPanelInvoice();
  // 1 x 10.490 + 3 x 6.524 = 30.062
  eq(w.parseLooseNumber(isi(panel, "amount")), 30062);
});
t('kotak Nilai berisi "0" tetap diisi — nol sama dengan kosong', () => {
  const panel = siapkanPanelInvoice();
  panel.querySelector('[data-dn="amount"]').value = "0";
  w.isiOtomatisDariJadwal();
  eq(w.parseLooseNumber(isi(panel, "amount")), 30062);
});
t("ganti jadwal -> isian otomatis ikut berubah", () => {
  const lain = { ...jadwalCipl, id: "sx2", party: "PT LAIN",
    vessel: "KMTC SHIMIZU 2509S", origin: "IDSUB", destination: "CNSHA",
    items: [{ namaBarang: "A - B", qty: 2, satuan: "SET", harga: 100 }] };
  tulis("data", { import: [], export: [jadwalCipl, lain] });
  w.isiPilihanJadwal();
  const panel = w.docNumPanelEl("invoice");
  panel.querySelectorAll("[data-dn]").forEach((el) => (el.value = ""));

  $("#dnInvoiceShipmentPick").value = "sx1";
  w.isiOtomatisDariJadwal();
  eq(w.parseLooseNumber(isi(panel, "amount")), 30062);
  eq(isi(panel, "carrier"), "HMM MIRACLE 0009S");

  // Ditukar -> data jadwal LAMA tidak boleh menempel
  $("#dnInvoiceShipmentPick").value = "sx2";
  w.isiOtomatisDariJadwal();
  eq(w.parseLooseNumber(isi(panel, "amount")), 200);
  eq(isi(panel, "carrier"), "KMTC SHIMIZU 2509S");
  eq(isi(panel, "customer"), "PT LAIN");
});
t("yang sudah diubah pengguna tetap dipertahankan saat jadwal ditukar", () => {
  const panel = w.docNumPanelEl("invoice");
  panel.querySelector('[data-dn="carrier"]').value = "DIKETIK SENDIRI";
  $("#dnInvoiceShipmentPick").value = "sx1";
  w.isiOtomatisDariJadwal();
  eq(isi(panel, "carrier"), "DIKETIK SENDIRI");
  eq(w.parseLooseNumber(isi(panel, "amount")), 30062);   // yang lain tetap ikut
});
t("nilai yang sudah diketik TIDAK ditimpa", () => {
  const panel = siapkanPanelInvoice();
  panel.querySelector('[data-dn="amount"]').value = "12.345";
  w.isiOtomatisDariJadwal();
  eq(w.parseLooseNumber(isi(panel, "amount")), 12345);
});
t("nama buyer & alamatnya ikut dari kartu", () => {
  const panel = siapkanPanelInvoice();
  eq(isi(panel, "customer"), "DYNAMIC DESIGN CO., LTD.");
  if (!isi(panel, "consigneeAddress").includes("Cheomdanyeonsin"))
    throw new Error("alamat tidak ikut terisi");
});
t("pelabuhan & carrier ikut, sailing tetap kosong", () => {
  const panel = siapkanPanelInvoice();
  /* Bentuk PANJANG: sama dengan yang tercetak di B/L, jadi isian CIPL
     tidak perlu diterjemahkan lagi saat dicocokkan dengan dokumennya. */
  eq(isi(panel, "portLoading"), "IDTPP");
  eq(isi(panel, "finalDestination"), "KRPUS");
  eq(isi(panel, "carrier"), "HMM MIRACLE 0009S");
  eq(isi(panel, "termsDelivery"), "FOB");
  eq(isi(panel, "sailingDate"), "");
});

console.log("— VIEWER TIDAK MELIHAT MEKANIKA PREDIKSI —");
const jadwalPred = { id: "vp1", mode: "import", party: "PT Uji",
  transport: "udara", origin: "ICN", destination: "CGK", routeType: "direct",
  etd: "2026-08-06", eta: "2026-08-07", etaMode: "auto",
  deliveryMode: "manual", actual: "2026-08-12",
  items: [{ namaBarang: "A", qty: 1 }], status: "process", docProgress: {} };
const jadiViewer = () => w.eval('authState.profile = { id: "u1", role: "viewer" }');
const jadiExim = () => w.eval('authState.profile = { id: "u1", role: "exim" }');

t("lencana Auto/Manual ETA tidak digambar", () => {
  jadiViewer();
  eq(w.etaModeChipHtml("auto"), "");
  eq(w.etaModeChipHtml("manual"), "");
  jadiExim();
  if (!w.etaModeChipHtml("auto").includes("Auto")) throw new Error("EXIM kehilangan lencana");
});
t("lencana mode Estimated Delivery tidak digambar", () => {
  jadiViewer();
  eq(w.deliveryModeChipHtml("manual"), "");
  jadiExim();
  if (!w.deliveryModeChipHtml("manual").includes("Manual"))
    throw new Error("EXIM kehilangan lencana");
});
t("strip sumber & keyakinan tidak digambar", () => {
  jadiViewer();
  eq(w.predictionStripHtml(jadwalPred), "");
  jadiExim();
  if (!w.predictionStripHtml(jadwalPred).includes("Sumber"))
    throw new Error("EXIM kehilangan strip");
});
t("bagian prediksi di panel detail juga disembunyikan", () => {
  jadiViewer();
  eq(w.predictionDetailHtml(jadwalPred), "");
  jadiExim();
});
t("TANGGALNYA tetap tampil untuk viewer", () => {
  jadiViewer();
  tulis("activeMode", "import");
  const h = w.renderCard(jadwalPred);
  if (!h.includes("2026-08-12")) throw new Error("Estimated Delivery hilang");
  if (!h.includes("2026-08-07")) throw new Error("ETA hilang");
  // Tapi tanpa satu pun keterangan mekanikanya
  if (/AUTO ETA|Diisi Manual|Keyakinan|Sumber/i.test(h))
    throw new Error("mekanika masih bocor ke kartu viewer");
  jadiExim();
});

console.log("— KURIR BERNILAI RENDAH TIDAK PAKAI PIB —");
{
  const brg = (harga) => [{ namaBarang: "X", qty: "1", satuan: "pcs", harga: String(harga) }];
  const kurir = (harga, lain) => Object.assign({
    id: "k1", mode: "import", transport: "udara", forwarder: "FEDEX",
    vessel: "FEDEX PRIORITY", docProgress: {}, items: brg(harga),
  }, lain || {});

  t("kurir di bawah USD 1.500: stepper tidak digambar", () => {
    eq(w.docStepHtml(kurir(680)), "");
  });
  t("kurir di atas ambang: stepper tetap ada", () => {
    if (!w.docStepHtml(kurir(2000))) throw new Error("stepper hilang padahal wajib PIB");
  });
  t("tepat USD 1.500 masih wajib PIB", () => {
    /* Ambangnya di BAWAH 1.500. Kalau ditulis <=, kiriman yang tepat
       di ambang kehilangan progres dokumennya padahal PIB-nya jalan. */
    if (!w.docStepHtml(kurir(1500))) throw new Error("nilai tepat ambang ikut disembunyikan");
  });
  t("kurir dikenali dari Forwarder maupun Nama Kapal", () => {
    eq(w.docStepHtml(kurir(680, { vessel: "", forwarder: "DHL" })), "");
    eq(w.docStepHtml(kurir(680, { forwarder: "", vessel: "UPS EXPRESS" })), "");
  });
  t("forwarder lokal BUKAN kurir ekspres, walau ada di daftar kurir", () => {
    /* WIDE & PRIME terdaftar sebagai "courier" di carrier-master, tapi
       di riwayat DDI keduanya forwarder untuk kiriman LAUT biasa —
       WIDE dipakai pada LCL dengan kapal SAWASDEE ALTAIR. Memakai
       daftar itu apa adanya akan menghapus progres dokumen dari
       kiriman yang PIB-nya justru sedang berjalan. */
    ["WIDE", "PRIME"].forEach((f) => {
      const h = w.docStepHtml(kurir(680, { forwarder: f, vessel: "SAWASDEE ALTAIR", transport: "laut" }));
      if (!h) throw new Error(f + " ikut disembunyikan padahal forwarder laut");
    });
  });
  t("bukan kurir sama sekali: nilai kecil pun tetap berstepper", () => {
    const h = w.docStepHtml(kurir(680, { forwarder: "SAMUDERA", vessel: "GARUDA" }));
    if (!h) throw new Error("kiriman non-kurir ikut disembunyikan");
  });
  t("nama kurir sebagai potongan kata tidak dianggap cocok", () => {
    /* "UPS" gampang muncul di dalam kata lain. Dicocokkan sebagai kata
       utuh, bukan substring. */
    const h = w.docStepHtml(kurir(680, { forwarder: "UPSTREAM LOGISTICS", vessel: "" }));
    if (!h) throw new Error("UPSTREAM salah dikenali sebagai UPS");
  });
  t("EXPORT tidak terpengaruh ambang ini", () => {
    /* USD 1.500 itu batas PIB/CN di jalur impor. Ekspor tetap butuh
       PEB berapa pun nilainya. */
    const h = w.docStepHtml(kurir(680, { mode: "export" }));
    if (!h) throw new Error("ekspor bernilai kecil ikut kehilangan stepper");
  });
  t("harga belum diisi bukan berarti kiriman gratis", () => {
    /* Nilai 0 = kolom harga masih kosong. Menyembunyikan stepper di
       situ menghilangkan progres dokumen tepat pada pengiriman yang
       baru dibuat. */
    const h = w.docStepHtml(kurir(0));
    if (!h) throw new Error("pengiriman baru kehilangan stepper");
  });
}

console.log("— VIEWER TIDAK MELIHAT STEPPER DOKUMEN —");
t("viewer: stepper tidak digambar sama sekali", () => {
  w.eval('authState.profile = { id: "u1", role: "viewer" }');
  const h = w.docStepHtml({ id: "s1", mode: "import", transport: "laut", docProgress: {} });
  eq(h, "");
});
t("EXIM tetap melihatnya lengkap", () => {
  w.eval('authState.profile = { id: "u1", role: "exim" }');
  const h = w.docStepHtml({ id: "s1", mode: "import", transport: "laut", docProgress: {} });
  if (!h.includes("Progres Dokumen")) throw new Error("stepper hilang untuk EXIM");
  if (!h.includes('data-action="docStep"')) throw new Error("tombol tahap hilang");
});
t("tooltip tahap tidak menampilkan kode sumber", () => {
  /* Nama panjang sebagian tahap berupa fungsi (B/L vs AWB). Kalau
     tidak dipanggil, tooltipnya berisi teks "function blFull(s) {...}". */
  const h = w.docStepHtml({ id: "s1", mode: "import", transport: "laut", docProgress: {} });
  if (/function \w+\(s\)/.test(h)) throw new Error("kode sumber bocor ke tooltip");
  if (!h.includes("Bill of Lading")) throw new Error("nama panjang B/L tidak muncul");
  const udara = w.docStepHtml({ id: "s2", mode: "import", transport: "udara", docProgress: {} });
  if (!udara.includes("Air Waybill")) throw new Error("nama panjang AWB tidak muncul");
});
t("judulnya kapital di awal kata, bukan huruf besar semua", () => {
  const h = w.docStepHtml({ id: "s1", mode: "import", transport: "laut", docProgress: {} });
  if (!h.includes("Progres Dokumen")) throw new Error("judul berubah");
  if (/PROGRES DOKUMEN/.test(h)) throw new Error("masih huruf besar semua di sumbernya");
});

console.log("— SUB-JENIS DOKUMEN -> PANEL —");
t("kunci sub-jenis dipetakan ke tab induknya", () => {
  eq(w.docNumTabKeyFor("invoice"), "invoice");
  eq(w.docNumTabKeyFor("invoice_nc"), "invoice");   // dulu: panel null, diam
  eq(w.docNumTabKeyFor("do"), "do");
  eq(w.docNumTabKeyFor("fund"), "fund");
});
t("label sub-jenis bisa dikembalikan", () => {
  eq(w.docNumSubtypeLabelFor("invoice_nc"), "Non-Commercial");
  eq(w.docNumSubtypeLabelFor("invoice"), "Commercial");
  // Surat jalan kini bersub-jenis juga: Export & Lokal.
  eq(w.docNumSubtypeLabelFor("do"), "Export");
  eq(w.docNumSubtypeLabelFor("do_lokal"), "Lokal");
  // Jenis tanpa sub-jenis tetap mengembalikan kosong.
  eq(w.docNumSubtypeLabelFor("fund"), "");
});
t("Enter di baris TERAKHIR Daftar Barang menambah barang baru", () => {
  /* Menyalin pos demi pos dari dokumen: berhenti di baris terakhir
     memaksa meraih tetikus untuk menekan "Tambah Barang". */
  const simpan = baca("draftItems");
  try {
    w.eval('draftItems = [newItem()]');
    w.renderItemTable();
    const el = $('#itemTableBody tr[data-idx="0"] [data-f="namaBarang"]');
    el.focus();
    el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    eq(baca("draftItems").length, 2, "barang bertambah:");
    eq(w.document.activeElement,
       $('#itemTableBody tr[data-idx="1"] [data-f="namaBarang"]'),
       "kursor pindah ke baris baru:");
  } finally {
    w.eval("draftItems = " + JSON.stringify(simpan || []));
    w.renderItemTable();
  }
});
t("Enter di baris TENGAH hanya berpindah, tidak menyisipkan baris", () => {
  /* Menyisipkan baris di tengah daftar bukan yang dimaksud saat
     menekan Enter untuk turun. */
  const simpan = baca("draftItems");
  try {
    w.eval('draftItems = [newItem(), newItem(), newItem()]');
    w.renderItemTable();
    const el = $('#itemTableBody tr[data-idx="0"] [data-f="namaBarang"]');
    el.focus();
    el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    eq(baca("draftItems").length, 3, "jumlah barang tetap:");
    eq(w.document.activeElement,
       $('#itemTableBody tr[data-idx="1"] [data-f="namaBarang"]'),
       "kursor turun satu baris:");
  } finally {
    w.eval("draftItems = " + JSON.stringify(simpan || []));
    w.renderItemTable();
  }
});
console.log("\u2014 CIPL BENTUK VIETNAM \u2014");
function ciplVnUji(over) {
  const spec = [
    ["225/50R17", "PS72", "S08", 9918.97], ["225/50R17", "PS72", "S07", 9040.97],
    ["225/55R17", "PS72", "S04", 9948.71], ["225/55R17", "PS72", "S03", 9070.71],
    ["205/55R16", "HS52", "S29", 9891.97], ["205/55R16", "HS52", "S30", 9013.37],
    ["205/55R16", "HS52", "S15", 9013.37], ["205/55R16", "HS52", "S16", 9013.37],
  ];
  const items = spec.map(([size, pattern, moldNo, harga], i) => ({
    namaBarang: "TYRE MOLD FULL SET", size, pattern, moldNo,
    qty: 1, satuan: "SET", harga, netto: 275, bruto: 295,
    package: i < 4 ? "120*122*71" : "90*102*68",
  }));
  return {
    row: {
      id: "c1", doc_number: "DDI - CRBM - IX - 051 - 20260924", doc_date: "2026-09-24",
      payload: Object.assign({
        customer: "KUMHO TIRE (VIETNAM) CO., LTD", bookingNo: "FBSGN261416",
        poNo: "DD-260824-DDI-01", termsDelivery: "CIF",
        sailingDate: "2026-09-28", carrier: "SEABREEZE 001N",
      }, (over && over.payload) || {}),
    },
    shipment: { items: (over && over.items) || items, party: "KUMHO TIRE (VIETNAM) CO., LTD" },
  };
}
t("nomor invoice Kumho memakai bentuknya sendiri, seri tetap satu", () => {
  /* "DDI - CRBM - IX - 052 - 20260924". Urutannya TETAP melanjutkan
     invoice lain (052 sesudah 051) -- yang berbeda cuma cara
     menuliskannya, jadi tidak boleh lewat sub-jenis baru yang akan
     memecah penomoran. */
  const panel = w.document.querySelector('[data-docnum-panel="invoice"]');
  /* querySelectorAll: readDocNumForm() memakai yang TERAKHIR kalau ada
     lebih dari satu kotak bernama sama, jadi seluruhnya diisi. */
  const semuaCust = [...panel.querySelectorAll('[data-dn="customer"]')];
  const cust = { get value() { return semuaCust[0].value; },
                 set value(v) { semuaCust.forEach((el) => { el.value = v; }); } };
  const tgl = panel.querySelector('[data-dn="docDate"]');
  const simpanC = cust.value, simpanT = tgl.value;
  try {
    tgl.value = "2026-09-24";
    cust.value = "KUMHO TIRE (VIETNAM) CO., LTD";
    const pola = w.docNumTemplate("invoice", "2026-09-24");
    eq(pola, "DDI - CRBM - IX - {SEQ} - 20260924");
    eq(w.docNumFormat(pola, 52, 3), "DDI - CRBM - IX - 052 - 20260924");

    /* Yang KHAS Kumho cuma akhiran tanggalnya -- "DDI - CRBM - IX -"
       memang bentuk invoice Commercial yang sudah dipakai selama ini,
       jadi pembeda yang diperiksa adalah " - 20260924" di belakang. */
    cust.value = "Dynamic Design CO., LTD.";
    const polaLain = w.docNumTemplate("invoice", "2026-09-24");
    if (/20260924/.test(polaLain))
      throw new Error("pembeli lain ikut mendapat akhiran tanggal: " + polaLain);
    eq(polaLain, "DDI - CRBM - IX - {SEQ}", "bentuk bawaan tidak berubah:");
  } finally {
    cust.value = simpanC;
    tgl.value = simpanT;
  }
});
t("seri nomor invoice TIDAK terpecah oleh bentuk per-pembeli", () => {
  /* Kalau bentuknya dipasang sebagai sub-jenis, Kumho akan punya
     urutan sendiri dan nomornya berhenti melanjutkan yang lain. */
  const subs = baca("DOCNUM_SUBTYPES").invoice;
  const kunci = Object.keys(subs).map((k) => subs[k].key);
  if (kunci.some((k) => /kumho|crbm/i.test(k)))
    throw new Error("bentuk Kumho dipasang sebagai sub-jenis -- serinya akan terpecah");
});
t("{YYYYMMDD} terisi tanggal dokumennya", () => {
  const pola = w.docNumTemplate("do", "2026-01-05");
  if (/\{YYYYMMDD\}/.test(pola)) throw new Error("token tidak terisi");
});
t("keterangan kemasan pada baris TOTAL tidak membungkus", () => {
  /* Sekali pecah jadi dua baris, tinggi baris TOTAL berubah dan
     seluruh blok di bawahnya ikut bergeser turun. */
  const css = w.ciplVnCss();
  const i = css.indexOf(".vn-total-isi {");
  if (i < 0) throw new Error("aturan baris TOTAL tidak ada");
  if (!/white-space:\s*nowrap/.test(css.slice(i, css.indexOf("}", i))))
    throw new Error("isi baris TOTAL masih boleh membungkus");
});
t("lembar Vietnam berbingkai luar, dan tepinya tidak berganda", () => {
  const u = ciplVnUji();
  const h = w.ciplVnHalamanInvoice(u.row, u.shipment);
  if (!h.includes('class="vn-bingkai"')) throw new Error("bingkai luar tidak ada");
  const css = w.ciplVnCss();
  /* Judul & kepala tidak boleh bergaris keliling sendiri -- sudutnya
     akan menggambar garis kedua di sebelah bingkai. */
  const iJudul = css.indexOf(".vn-judul {");
  if (/border:\s*1px/.test(css.slice(iJudul, css.indexOf("}", iJudul))))
    throw new Error("judul masih bergaris keliling di dalam bingkai");
});
t("baris barang memuat size, pattern & mold no TERPISAH", () => {
  /* Lembar Excel menaruh SIZE+PATTERN dan MOLD NO di dua kolom
     berbeda -- pembeli menyaring kolom mold untuk mencocokkan
     cetakannya. Hanya menyimpan gabungannya membuat itu mustahil. */
  const u = ciplVnUji();
  const b = w.ciplVnBaris(u.shipment)[0];
  eq(b.size, "225/50R17");
  eq(b.pattern, "PS72");
  eq(b.moldNo, "S08");
});
t("ekspor Excel Kumho dipilih lewat profil, bentuk Korea tidak berubah", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-excel.js"), "utf8");
  if (!/prof\.layout === "vn"/.test(src))
    throw new Error("ekspor Excel tidak bercabang menurut profil");
  if (!/ciplXlsShippingInstruction\(wb, row, shipment, baris\)/.test(src))
    throw new Error("bentuk Korea kehilangan lembar Shipping Instruction");
});
t("garis tegak hanya di LIMA batas kolom utama", () => {
  /* Quantity, Unit Price & Amount masing-masing dibagi dua sel
     (angka + satuannya) supaya angkanya sejajar. Pembagian itu alat
     bantu perataan, bukan kolom -- menggambar garis di sana membuat
     tabelnya terlihat punya delapan kolom padahal kepalanya menyebut
     lima.

     Di berkas rujukan sekat kolom HANYA ada di baris kepala, dan
     bertitik; badan tabelnya satu bidang kosong tanpa garis apa pun.
     Jadi yang diperiksa: badan tabel tidak memasang garis, dan sekat
     kepala memang bertitik. */
  const css = w.ciplVnCss();
  if (!/\.vn-items th,\s*\.vn-items td \{\s*border: 0;/.test(css))
    throw new Error("sel tabel barang masih bergaris secara bawaan");
  if (!/\.vn-items thead th \+ th \{ border-left: [\d.]+mm dotted/.test(css))
    throw new Error("sekat kolom kepala tidak bertitik");

  const u = ciplVnUji();
  ["ciplVnHalamanInvoice", "ciplVnHalamanPacking"].forEach((fn) => {
    const h = w[fn](u.row, u.shipment);
    const i = h.indexOf('<table class="vn-items"');
    const tbody = h.slice(h.indexOf("<tbody>", i), h.indexOf("</tbody>", i));
    /* Tiap baris barang harus punya TIGA sel lanjutan: satuan qty,
       nilai kedua kolom harga/berat pertama, dan yang kedua. */
    const barisPertama = tbody.slice(tbody.indexOf("<tr"), tbody.indexOf("</tr>"));
    const lanjut = (barisPertama.match(/vn-lanjut/g) || []).length;
    if (lanjut !== 3)
      throw new Error(`${fn}: ${lanjut} sel lanjutan, harusnya 3`);
  });
});
t("lebar kolom mengikuti hasil ukur berkas rujukan", () => {
  /* Sekat kolom pada PDF Kumho jatuh di 22,9% / 62,7% / 72,3% / 85,2%
     dari lebar bingkai. Ditulis PERSEN, bukan mm: lebar bingkainya
     sendiri sudah dipatok, dan persen ikut benar kalau kertasnya suatu
     saat bukan A4. */
  const css = w.ciplVnCss();
  const i = css.indexOf(".vn-marks {");
  const m = /width:\s*([\d.]+)%/.exec(css.slice(i, css.indexOf("}", i)));
  if (!m) throw new Error("lebar kolom Marks tidak dalam persen");
  if (Math.abs(Number(m[1]) - 22.9) > 0.5)
    throw new Error(`kolom Marks ${m[1]}% -- rujukan 22,9%`);
  const u = ciplVnUji();
  const h = w.ciplVnHalamanInvoice(u.row, u.shipment);
  if (!/<colgroup>/.test(h))
    throw new Error("lebar kolom tidak dipasang lewat colgroup");
});
t("tepi bingkai Excel tidak putus di baris antara kepala & barang", () => {
  /* Dua baris di antaranya tidak berisi barang, jadi mudah terlewat --
     dan memang terlewat: bingkai luar lembar CI bolong di baris 31-32.
     Ketahuan hanya setelah berkas .xlsx-nya dibuka dan tepi tiap
     barisnya ditelusuri, tidak dari membaca kode. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-vn-excel.js"), "utf8");
  if (!/for \(let r = rk \+ 1; r < r0; r\+\+\)/.test(src))
    throw new Error("baris antara kepala & barang tidak diberi tepi");
});
t("garis kisi Excel dimatikan", () => {
  /* Lembar ini sudah punya garis tabelnya sendiri; kisi bawaan Excel
     menambah garis kedua di seluruh halaman. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-vn-excel.js"), "utf8");
  if (!/showGridLines:\s*false/.test(src))
    throw new Error("garis kisi masih menyala");
});
t("baris TOTAL memakai jatah ruang dari berkas rujukan", () => {
  /* Baris ini TIDAK mengikuti kolom tabel di atasnya: pada rujukan
     "TOTAL :" berakhir di 37% lebar bingkai, jumlahnya di 44%, dan
     "BOX WOODEN PACKING" mulai di 50%. Dipaksa mengikuti kolom,
     keterangan kemasannya melimpah menempel ke angka di sebelahnya
     ("PACKING0 KGS" pada Packing List). */
  const u = ciplVnUji();
  ["ciplVnHalamanInvoice", "ciplVnHalamanPacking"].forEach((fn) => {
    const h = w[fn](u.row, u.shipment);
    const i2 = h.indexOf('class="vn-total"');
    const baris = h.slice(i2, h.indexOf("</tr>", i2));
    if (!/class="vn-total-isi"/.test(baris))
      throw new Error(fn + ": baris TOTAL tidak memakai pembagian sendiri");
    const potong = [...baris.matchAll(/<span class="(vn-t-[\w-]+)">([\s\S]*?)<\/span>/g)]
      .map((m) => [m[1], m[2].replace(/\s+/g, " ").trim()]);
    const kemasan = potong.find(([k]) => k === "vn-t-kemasan");
    if (!kemasan) throw new Error(fn + ": keterangan kemasan tidak ada");
    if (kemasan[1] !== "BOX WOODEN PACKING")
      throw new Error(fn + ": bagian kemasan bercampur isi lain -> " + JSON.stringify(kemasan[1]));
    const ekor = potong.map(([k]) => k);
    const harap = fn.includes("Packing")
      ? ["vn-t-label", "vn-t-qty", "vn-t-kemasan", "vn-t-n1", "vn-t-s1", "vn-t-n2", "vn-t-s2"]
      : ["vn-t-label", "vn-t-qty", "vn-t-kemasan", "vn-t-usd", "vn-t-nilai"];
    eq(ekor.join(","), harap.join(","), fn + " bagian baris TOTAL:");
  });
});
t("PERBANDINGAN lebar kolom Excel mengikuti berkas rujukan", () => {
  /* Berkas ini dibuka & diedit lagi oleh pembeli; pergeseran satu
     kolom membuat rumus di sisi mereka meleset -- jadi yang dijaga
     adalah PERBANDINGAN antar kolom, bukan angka mentahnya.

     Ukurannya sendiri dikalikan satu faktor tetap supaya lembar ini
     tercetak selebar lembar cetak CIPL (183 mm); angka mentah dari
     berkas asli hanya menghasilkan 140 mm. Karena faktornya sama di
     semua kolom, sekat kolomnya tetap jatuh di tempat yang sama. */
  const asli = baca("VNXL_LEBAR_ASLI");
  const lebar = baca("VNXL_LEBAR");
  const skala = baca("VNXL_SKALA_HURUF");
  eq(asli.A, 9.78);
  eq(asli.B, 9.78, "kolom B (berkas asli menulisnya, bukan bawaan Excel):");
  eq(asli.C, 12.22);
  eq(asli.K, 8.78);
  Object.keys(asli).forEach((k) => {
    const harap = Math.round(asli[k] * skala * 100) / 100;
    eq(lebar[k], harap, "lebar kolom " + k + ":");
  });
});
t("blok angkutan Excel: garis mengikuti berkas asli, bukan tiap baris", () => {
  /* Dulu tiap baris blok angkutan diberi garis bawah selebar A-K.
     Akibatnya label & nilai pelabuhan/kapal terpisah garis, dan kotak
     Other references di kolom kanan terpotong-potong. Di berkas asli
     (dibandingkan garis demi garis, 0 beda setelah perbaikan):
       Departure date  -> garis bawah A-D saja
       label pelabuhan -> tanpa garis bawah (sekotak dengan nilainya)
       nilai pelabuhan -> garis bawah A-K
       label kapal     -> tanpa garis bawah
       nilai kapal     -> garis bawah A-K
     dan sekat kolom E menerus di kelima barisnya. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-vn-excel.js"), "utf8");
  const i = src.indexOf("function vnxlBlokAngkutan");
  const blok = src.slice(i, src.indexOf("\nfunction ", i + 10));
  if (/vnxlGarisBaris\(ws, r \+ i, 1, 11, "b"\)/.test(blok))
    throw new Error("garis bawah masih dipasang di SETIAP baris blok angkutan");
  ["vnxlGarisBaris(ws, r, 1, 4, \"b\")",
   "vnxlGarisBaris(ws, r + 2, 1, 11, \"b\")",
   "vnxlGarisBaris(ws, r + 4, 1, 11, \"b\")"].forEach((g) => {
    if (!blok.includes(g)) throw new Error("garis yang semestinya ada hilang: " + g);
  });
  if (/vnxlGarisBaris\(ws, r \+ (1|3), /.test(blok))
    throw new Error("ada garis di antara label dan nilainya");
});
t("Excel CIPL Kumho selebar kertas A4 di Excel (dibatasi LEBAR, bukan tinggi)", () => {
  /* Pratinjau cetak Excel pengguna: bingkai 154 mm, tinggi sudah
     memenuhi halaman, 43 mm di kanan kosong -- dibatasi TINGGI. Supaya
     selebar kertas, lembar harus cukup lebar untuk dibatasi LEBAR
     halaman. Diperiksa dengan rumus lebar kolom resmi Excel (MDW
     Calibri 11 = 7 px @96 dpi) dan tinggi baris dalam poin. */
  const lebarKol = (w) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
  const cek = (nama, tabel) => {
    const px = "ABCDEFGHIJK".split("").reduce((n, k) => n + lebarKol(tabel[k]), 0);
    const lebarMm = (px / 96) * 25.4;
    // Lebar alami harus melebihi lebar cetak (185 mm) dengan selisih aman:
    // di Excel pengguna kolom tergambar ~11% lebih sempit dari rumus.
    if (lebarMm * 0.89 < 183)
      throw new Error(`${nama}: lebar alami ${lebarMm.toFixed(0)} mm -- di Excel pengguna tidak akan selebar kertas`);
  };
  cek("CI", baca("VNXL_LEBAR"));
  cek("PL", baca("VNXL_LEBAR_PL"));
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-vn-excel.js"), "utf8");
  if (/height = 10\.65/.test(src))
    throw new Error("tinggi baris 10,65pt dibulatkan Excel ke 11,25pt -- pakai 10,5");
  if (!/horizontalCentered: true/.test(src))
    throw new Error("lembar tidak diratatengahkan di halaman");
});
t("lembar PL memakai lebar kolomnya sendiri dari berkas asli", () => {
  /* Kolom H & J (Net Wt./Gross Wt.) di PL 5,66; di CI 3,78. Dengan
     lebar CI, berat berdesimal ("378,70") tampil sebagai "###". */
  const pl = baca("VNXL_LEBAR_ASLI_PL");
  const ci = baca("VNXL_LEBAR_ASLI");
  eq(pl.H, 5.66, "PL kolom H:");
  eq(pl.J, 5.66, "PL kolom J:");
  if (pl.H <= ci.H) throw new Error("kolom berat PL harus lebih lebar daripada kolom USD CI");
});
t("gaya sel blok angkutan & baris barang mengikuti berkas asli", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-vn-excel.js"), "utf8");
  /* Nilai pelabuhan/kapal rata tengah; kapal & tujuan akhir 9pt. */
  if (/VNXL_KIRI_JOROK/.test(src))
    throw new Error("nilai angkutan masih menjorok rata kiri");
  if (!/finalDestination[\s\S]{0,120}VNXL_FONT_KECIL, VNXL_TENGAH/.test(src))
    throw new Error("tujuan akhir harus 9pt rata tengah");
  /* Berat PL dua desimal. */
  if (!/b\.netto, VNXL_FONT, VNXL_KANAN, VNXL_FMT_BERAT/.test(src))
    throw new Error("berat bersih PL tidak berformat dua desimal");
});
t("penanda pengapalan membuang akhiran badan hukum", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-vn-excel.js"), "utf8");
  if (!/CO\\\.\?,\?/.test(src) && !/CO\\.\?/.test(src))
    throw new Error("akhiran badan hukum tidak dibuang dari penanda");
});
t("Marks dibangkitkan dari JUMLAH koli: 8 barang -> C# : 8-1 .. 8-8", () => {
  const u = ciplVnUji();
  const h = w.ciplVnHalamanInvoice(u.row, u.shipment);
  for (let i = 1; i <= 8; i++) {
    if (!h.includes(`C# : 8-${i}`)) throw new Error("marks C# : 8-" + i + " tidak ada");
  }
});
t("5 koli menghasilkan C# : 5-1 .. 5-5, bukan tetap 8", () => {
  /* Angka pertama itu jumlah koli seluruh pengapalan -- ikut berubah
     kalau isinya berbeda. */
  const u = ciplVnUji({
    items: Array.from({ length: 5 }, (_, i) => ({
      namaBarang: "TYRE MOLD", size: "S" + i, qty: 1, satuan: "SET", harga: 100,
    })),
  });
  const h = w.ciplVnHalamanInvoice(u.row, u.shipment);
  eq(h.includes("C# : 5-5"), true, "koli terakhir:");
  if (h.includes("C# : 5-6")) throw new Error("koli melebihi jumlahnya");
  if (h.includes("C# : 8-")) throw new Error("jumlah koli tidak ikut berubah");
});
t("Marks yang DIISI manual menang atas yang dibangkitkan", () => {
  /* Penandaan di lapangan tidak selalu mengikuti urutan; yang tertulis
     di peti itulah yang harus tercetak. */
  const u = ciplVnUji({
    items: [{ namaBarang: "TYRE MOLD", size: "S1", qty: 1, satuan: "SET",
              harga: 100, marks: "PALLET A" }],
  });
  const h = w.ciplVnHalamanInvoice(u.row, u.shipment);
  if (!h.includes("PALLET A")) throw new Error("marks manual tidak dipakai");
  if (h.includes("C# : 1-1")) throw new Error("marks otomatis menimpa yang diketik");
});
t("Packing List memakai netto & bruto PER BARANG", () => {
  const u = ciplVnUji();
  const h = w.ciplVnHalamanPacking(u.row, u.shipment);
  if (!/275[\s\S]{0,60}KG/.test(h)) throw new Error("netto per barang tidak tercetak");
  if (!/295[\s\S]{0,60}KG/.test(h)) throw new Error("bruto per barang tidak tercetak");
  const bersih = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!bersih.includes("2,200") || !bersih.includes("2,360"))
    throw new Error("total berat tidak sesuai jumlah per barangnya");
});
t("baris DIMENSION dikelompokkan menurut ukuran yang sama", () => {
  const u = ciplVnUji();
  const h = w.ciplVnHalamanPacking(u.row, u.shipment).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!h.includes("DIMENSION : 120 * 122 * 71 (cm) * 4 BX"))
    throw new Error("kelompok dimensi pertama salah");
  if (!h.includes("DIMENSION : 90 * 102 * 68 (cm) * 4 BX"))
    throw new Error("kelompok dimensi kedua salah");
});
t("uraian barang = SIZE + PATTERN + MOLD NO, tanpa jenis barangnya", () => {
  /* Jenisnya sudah disebut sekali di baris #Description Info. */
  eq(w.ciplVnUraian({ size: "225/50R17", pattern: "PS72", moldNo: "S08" }),
     "225/50R17  PS72  S08");
  eq(w.ciplVnUraian({ size: "225/50R17", pattern: "", moldNo: "S08" }),
     "225/50R17  S08", "kolom kosong dilewati:");
});
t("BK NO. & P/O NO. tidak muncul di lembar Kumho", () => {
  /* Keduanya dihapus atas permintaan: BK NO. beserta isiannya, P/O NO.
     hanya dari lembarnya (nomor PO tetap tersimpan & dipakai dokumen
     lain). Pengajuan LAMA yang terlanjur menyimpan bookingNo pun tidak
     boleh memunculkannya kembali. */
  const u = ciplVnUji({ payload: { bookingNo: "FBSGN261416", poNo: "PO-123" } });
  ["ciplVnHalamanInvoice", "ciplVnHalamanPacking"].forEach((fn) => {
    const h = w[fn](u.row, u.shipment);
    if (h.includes("BK NO.")) throw new Error(fn + ": BK NO. masih tercetak");
    if (h.includes("P/O NO.")) throw new Error(fn + ": P/O NO. masih tercetak");
  });
  if (w.document.querySelector('[data-dn="bookingNo"]'))
    throw new Error("isian Booking No. masih ada di form");
});
t("lembar Vietnam dipilih lewat profil, lembar Korea tidak berubah", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-print.js"), "utf8");
  if (!/prof\.layout === "vn"/.test(src))
    throw new Error("pemilihan bentuk lembar tidak lewat profil");
  if (!/ciplHalamanShippingInstruction\(row, shipment, baris\)/.test(src))
    throw new Error("lembar Korea kehilangan halaman Shipping Instruction");
});
t("setiap baris tabel Vietnam mengisi delapan kolom", () => {
  const u = ciplVnUji();
  ["ciplVnHalamanInvoice", "ciplVnHalamanPacking"].forEach((fn) => {
    const h = w[fn](u.row, u.shipment);
    const i = h.indexOf('<table class="vn-items"');
    const tabel = h.slice(i, h.indexOf("</table>", i));
    tabel.split("<tr").slice(1).forEach((r, idx) => {
      const sel = (r.match(/<t[dh][\s>]/g) || []).length;
      const span = [...r.matchAll(/colspan="(\d+)"/g)].reduce((a, m) => a + Number(m[1]) - 1, 0);
      if (sel + span !== 8)
        throw new Error(`${fn} baris ${idx + 1}: ${sel + span} kolom, harusnya 8`);
    });
  });
});

console.log("\u2014 CIPL: PROFIL PELANGGAN & NOMOR PO GANDA \u2014");
t("profil dipilih dari nama consignee", () => {
  eq(w.ciplProfil("KUMHO TIRE (VIETNAM) CO., LTD").id, "kumho-vn");
  eq(w.ciplProfil("Dynamic Design CO., LTD.").id, "ddi-kr");
});
t("pembeli yang belum terdaftar jatuh ke bentuk yang selama ini dipakai", () => {
  /* Bukan ke profil kosong: pengajuan untuk pembeli baru tetap harus
     bisa dicetak, bukan menghasilkan lembar tanpa bentuk. */
  eq(w.ciplProfil("PT PEMBELI BARU").layout, "kr");
  eq(w.ciplProfil("").layout, "kr");
});
t("pelabuhan bawaan mengikuti profil pembelinya", () => {
  const vn = w.ciplProfil("KUMHO TIRE (VIETNAM) CO., LTD");
  eq(vn.portLoading, "JAKARTA");
  eq(vn.portDischarge, "HOCHIMINH, VIETNAM");
  const kr = w.ciplProfil("Dynamic Design CO., LTD.");
  eq(kr.portLoading, "Jakarta, Indonesia");
  eq(kr.portDischarge, "BUSAN, KOREA");
});
t("ketikan pengguna MENANG atas bawaan profil", () => {
  /* Bawaan itu titik mulai, bukan aturan -- pengapalan lewat Surabaya
     harus bisa ditulis apa adanya. */
  const html = w.ciplAngkutanHtml(
    { payload: { customer: "KUMHO TIRE (VIETNAM) CO., LTD", portLoading: "SURABAYA" } },
    null,
  );
  if (!html.includes("SURABAYA")) throw new Error("ketikan pengguna tidak dipakai");
  if (html.includes("JAKARTA")) throw new Error("bawaan profil menimpa ketikan");
});
t("nomor PO bisa lebih dari satu, kosong dilewati", () => {
  eq(w.poNoSemua({ poNo: "PO-1" }).join(","), "PO-1", "satu:");
  eq(w.poNoSemua({ poNo: "PO-1", poNoExtra: ["PO-2", "PO-3"] }).join(","),
     "PO-1,PO-2,PO-3", "beberapa:");
  eq(w.poNoSemua({ poNo: "PO-1", poNoExtra: ["", "PO-3"] }).join(","),
     "PO-1,PO-3", "yang kosong dilewati:");
  eq(w.poNoSemua({}).length, 0, "tidak ada:");
});
t("kotak PO pertama tetap data-dn=poNo -- pengajuan lama terbaca tanpa migrasi", () => {
  const kotak = w.document.querySelector('#poNoList [data-dn="poNo"]');
  if (!kotak) throw new Error("kotak PO pertama bukan data-dn=poNo");
  eq(w.document.querySelectorAll("#poNoList [data-po-extra]").length, 0,
     "bawaannya satu kotak saja:");
});
t("tombol Tambah PO menambah kotak, dan kotaknya bisa dihapus", () => {
  try {
    w.document.getElementById("btnPoNoAdd").click();
    w.document.getElementById("btnPoNoAdd").click();
    eq(w.document.querySelectorAll("#poNoList [data-po-extra]").length, 2);
    w.document.querySelector("#poNoList [data-po-del]").click();
    eq(w.document.querySelectorAll("#poNoList [data-po-extra]").length, 1);
  } finally {
    w.setPoNoExtra([]);
  }
});
t("nomor PO tambahan ikut tersimpan & dipulihkan", () => {
  try {
    w.setPoNoExtra(["PO-2", "PO-3"]);
    const kotak = [...w.document.querySelectorAll("#poNoList [data-po-extra]")];
    eq(kotak.map((el) => el.value).join(","), "PO-2,PO-3", "dipulihkan:");
    const isi = w.readDocNumForm("invoice");
    eq((isi.poNoExtra || []).join(","), "PO-2,PO-3", "tersimpan:");
  } finally {
    w.setPoNoExtra([]);
  }
});

console.log("\u2014 SURAT JALAN LOKAL: LEMBAR CETAK TERSENDIRI \u2014");
function barisSjLokal(over) {
  return Object.assign({
    id: "d1", doc_number: "DDI - 023/Exim-Log/VIII/2026", doc_date: "2026-08-19",
    requester: "Ahmad Riyan", doc_type: "do_lokal",
    payload: Object.assign({
      doKind: "Lokal", receiver: "PT. GAJAH TUNGGAL Tbk",
      address: "Kompleks Industri Gajah Tunggal\nJl. Gajah Tunggal, Tangerang",
      poNo: "432830", categoryWork: "New Mold", totalNote: "1 CRADLE & 1 BOX",
      items: [
        { nama: "MOLD 215/60R17 COMPLETE MOLD", qty: "1", satuan: "SET" },
        { nama: "1 SET MOLD CONSISTS OF :" },
        { nama: "8 PCS ALUMINUM SEGMENT" },
      ],
    }, (over && over.payload) || {}),
  }, over || {});
}
t("lembar Lokal tidak memakai teks biru sama sekali", () => {
  /* Yang boleh berwarna hanya penanda: judul dokumen & garis tabel
     (jingga), bidang kepala (peach), kotak judul (abu). Sisanya hitam. */
  const css = w.suratJalanLokalCss();
  const warna = [...new Set(css.match(/#[0-9a-f]{3,6}/gi) || [])].map((x) => x.toLowerCase());
  const diizinkan = ["#000", "#d9d9d9", "#e36c0a", "#fbd5b5"];
  const asing = warna.filter((x) => !diizinkan.includes(x));
  if (asing.length) throw new Error("warna di luar daftar: " + asing.join(", "));
  if (!/body \{[^}]*color: #000/.test(css))
    throw new Error("warna teks bawaan bukan hitam");
});
t("latar berwarna dipaksa ikut tercetak", () => {
  /* Peramban membuang warna latar saat mencetak kecuali diminta
     sebaliknya -- bidang jingga keluar putih polos di kertas. */
  const css = w.suratJalanLokalCss();
  if (!/print-color-adjust: exact/.test(css))
    throw new Error("latar berwarna akan hilang saat dicetak");
});
t("kotak tanda tangan membagi rata, sejajar dengan tabel di atasnya", () => {
  const css = w.suratJalanLokalCss();
  const i = css.indexOf(".l-ttd-kotak {");
  const blok = css.slice(i, css.indexOf("}", i));
  /* (?<!min-|max-) supaya "min-width: 0" tidak ikut tertangkap --
     itu justru bagian dari pembagian rata. */
  if (/(?<!min-|max-)width:\s*\d/.test(blok))
    throw new Error("kotak masih berlebar tetap -- tepinya tidak akan lurus dengan tabel");
  if (!/flex:\s*1 1 0/.test(blok))
    throw new Error("kotak tidak membagi ruang secara rata");
});
t("kepala kotak tanda tangan berlatar jingga", () => {
  const css = w.suratJalanLokalCss();
  const i = css.indexOf(".l-ttd-judul {");
  if (!/background:\s*#fbd5b5/.test(css.slice(i, css.indexOf("}", i))))
    throw new Error("kepala kotak tanda tangan tidak berlatar jingga");
});
t("kop surat jalan Lokal berupa gambar aslinya, bukan rakitan teks & garis", () => {
  /* Nama, alamat, logo, dan pita bergaris adalah satu kesatuan
     cetakan. Menyusunnya ulang dari CSS tidak akan pernah persis, dan
     tiap perubahan font peramban menggesernya. */
  const h = w.buildSuratJalanLokalHtml(barisSjLokal());
  if (!/class="l-kop"><img src="data:image\/png;base64,/.test(h))
    throw new Error("kop bukan gambar tertanam");
  if (/l-pita/.test(h)) throw new Error("pita rakitan CSS masih ikut tercetak");
});
t("tombol cetak muncul untuk surat jalan Lokal", () => {
  /* Syaratnya sempat membandingkan persis dengan "do", padahal Lokal
     ber-key "do_lokal" -- tombolnya hilang untuk SELURUH surat jalan
     Lokal. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  const i = src.indexOf("data-print-sj");
  const potongan = src.slice(i - 400, i);
  if (/jenis\.key === "do"/.test(potongan))
    throw new Error('syaratnya masih membandingkan persis dengan "do"');
  if (!/startsWith\("do"\)/.test(potongan))
    throw new Error("syarat cetak tidak mencakup sub-jenis surat jalan");
});
t("larik isian diringkas jadi teks terbaca, bukan [object Object]", () => {
  const rinci = w.dnRingkasBarisPayload({ desc: "FREIGHT", amount: "1.000.000", ppnRate: 1.1 });
  if (rinci.includes("[object")) throw new Error("masih [object Object]");
  if (!rinci.includes("FREIGHT")) throw new Error("uraian hilang");
  const barang = w.dnRingkasBarisPayload({ nama: "BEAD RING", qty: "10", satuan: "PCS" });
  eq(barang, "BEAD RING · 10 PCS");
});
t("tab Nomor Dokumen diingat antar kunjungan", () => {
  /* Tanpa disimpan, memuat ulang halaman selalu melempar kembali ke
     tab Invoice. */
  const simpan = baca("docNumActiveTab");
  try {
    w.showDocNumTab("fund");
    eq(w.localStorage.getItem("exim.docnumTab"), "fund", "tersimpan:");
    eq(w.bacaDocNumTabTersimpan(), "fund", "terbaca kembali:");
    /* Kunci yang tidak dikenal jatuh ke bawaan -- data lama atau
       rusak tidak boleh membuat halaman gagal dibuka. */
    w.localStorage.setItem("exim.docnumTab", "tidak-ada");
    eq(w.bacaDocNumTabTersimpan(), "invoice", "kunci asing jatuh ke bawaan:");
  } finally {
    w.showDocNumTab(simpan);
  }
});
t("lembar Lokal memuat seluruh bagian yang ada di contoh", () => {
  const h = w.buildSuratJalanLokalHtml(barisSjLokal());
  [
    /* SOLD FROM: kotak itu berisi PENGIRIMnya (DDI sendiri), bukan
       penerimanya -- penerimanya ada di kotak DELIVERED TO. */
    "SOLD FROM", "DELIVERY ORDER", "DELIVERED TO", "PT. GAJAH TUNGGAL Tbk",
    "DDI - 023/Exim-Log/VIII/2026", "19-Aug-26", "432830", "New Mold",
    "DESCRIPTION", "QTY", "UNIT", "NOTES", "Total :", "1 CRADLE &amp; 1 BOX",
    "Cirebon, 19 Agustus 2026", "Delivered by,", "Received by,",
  ].forEach((x) => {
    if (!h.includes(x)) throw new Error("tidak tercetak: " + x);
  });
  if (!/Ahmad Riyan\/ Exim &amp; Logistics Dept/.test(h))
    throw new Error("nama penanda tangan tidak tercetak");
});
t("total qty dihitung HANYA dari baris yang punya satuan", () => {
  /* Daftarnya campuran: baris barang sungguhan ("1 SET") dan baris
     rincian isi ("8 PCS ALUMINUM SEGMENT") yang ditulis sebagai uraian
     saja. Menjumlahkan semuanya membuat totalnya membengkak. */
  const t1 = w.sjlTotal([
    { nama: "MOLD", qty: "1", satuan: "SET" },
    { nama: "8 PCS ALUMINUM SEGMENT" },
    { nama: "MOLD BOX" },
  ]);
  eq(t1.jumlah, 1, "jumlah:");
  eq(t1.satuan, "SET", "satuan:");
});
t("setiap baris tabel Lokal mengisi lima kolom", () => {
  const h = w.buildSuratJalanLokalHtml(barisSjLokal());
  const i = h.indexOf('<table class="l-items"');
  const tabel = h.slice(i, h.indexOf("</table>", i));
  tabel.split("<tr").slice(1).forEach((r, idx) => {
    const sel = (r.match(/<t[dh][\s>]/g) || []).length;
    if (sel !== 5) throw new Error(`baris ${idx + 1}: ${sel} kolom, harusnya 5`);
  });
});
t("lembar Export TIDAK ikut berubah bentuk", () => {
  /* Kedua templat berdiri sendiri; percabangannya ada di satu titik
     masuk supaya perubahan pada satu lembar tidak merembet. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "surat-jalan-print.js"), "utf8");
  if (!/buildSuratJalanLokalHtml\(row\)/.test(src))
    throw new Error("cetak Lokal tidak diarahkan ke templatnya sendiri");
  if (!/doKind === "Lokal"/.test(src))
    throw new Error("percabangan jenis tidak ada di titik masuk cetak");
});
t("surat jalan LOKAL mencetak daftar barang yang diketik sendiri", () => {
  /* Tidak ada jadwal tertaut, jadi tidak ada sumber lain. */
  const h = w.buildSuratJalanHtml({
    id: "d1", doc_number: "020/EXIM-LOG/IX/2026", doc_date: "2026-09-15", requester: "Yogi",
    payload: {
      doKind: "Lokal", receiver: "PT MITRA", address: "Bandung", vehicle: "B 1234 XY",
      items: [
        { nama: "BEAD RING P235/70R16", qty: "10", satuan: "PCS", ket: "Karton A" },
        { nama: "IKR GUIDE", qty: "5", satuan: "SET", ket: "" },
      ],
    },
  }, null);
  ["BEAD RING P235/70R16", "10 PCS", "IKR GUIDE", "5 SET", "Karton A"].forEach((x) => {
    if (!h.includes(x)) throw new Error("tidak tercetak: " + x);
  });
});
t("baris tanpa nama barang tidak ikut tercetak di surat jalan Lokal", () => {
  const h = w.buildSuratJalanHtml({
    id: "d2", doc_number: "021/EXIM-LOG/IX/2026", doc_date: "2026-09-15", requester: "Y",
    payload: { doKind: "Lokal", items: [{ nama: "ADA", qty: "1" }, { nama: "", qty: "9" }] },
  }, null);
  if (/>\s*9\s*</.test(h)) throw new Error("baris kosong ikut tercetak");
});
t("form surat jalan punya dropdown Export/Lokal", () => {
  const sel = w.document.querySelector('[data-docnum-panel="do"] [data-dn="doKind"]');
  if (!sel) throw new Error("dropdown jenis surat jalan tidak ada");
  eq([...sel.options].map((o) => o.value).join(","), "Export,Lokal");
  if (!sel.hasAttribute("data-dn-subtype"))
    throw new Error("dropdown tidak ditandai sebagai penentu sub-jenis -- serinya tidak akan terpisah");
});
t("Lokal menampilkan daftar barang manual; Export menampilkan Jadwal Terkait", () => {
  /* Kiriman lokal tidak punya CIPL, jadi tidak ada daftar barang yang
     bisa ditarik -- diketik sendiri. */
  const panel = w.document.querySelector('[data-docnum-panel="do"]');
  const sel = panel.querySelector('[data-dn="doKind"]');
  const kotakJadwal = panel.querySelector('[data-dn="shipmentId"]').closest("[data-dn-when]");
  const kotakBarang = w.document.getElementById("doLinesBody").closest("[data-dn-when]");
  try {
    sel.value = "Export";
    w.syncDocNumConditional(panel);
    if (kotakJadwal.classList.contains("d-none")) throw new Error("Jadwal Terkait tersembunyi di Export");
    if (!kotakBarang.classList.contains("d-none")) throw new Error("daftar barang manual ikut tampil di Export");

    sel.value = "Lokal";
    w.syncDocNumConditional(panel);
    if (!kotakJadwal.classList.contains("d-none")) throw new Error("Jadwal Terkait masih tampil di Lokal");
    if (kotakBarang.classList.contains("d-none")) throw new Error("daftar barang manual tidak tampil di Lokal");
  } finally {
    sel.value = "Export";
    w.syncDocNumConditional(panel);
  }
});
t("daftar barang manual hanya tersimpan untuk Lokal", () => {
  const panel = w.document.querySelector('[data-docnum-panel="do"]');
  const sel = panel.querySelector('[data-dn="doKind"]');
  const simpan = baca("doLines");
  try {
    w.setDoLines([{ nama: "BEAD RING", qty: "10", satuan: "PCS", ket: "" }]);
    sel.value = "Lokal";
    w.syncDocNumConditional(panel);
    const isiLokal = w.readDocNumForm("do");
    eq((isiLokal.items || []).length, 1, "tersimpan untuk Lokal:");

    sel.value = "Export";
    w.syncDocNumConditional(panel);
    const isiExport = w.readDocNumForm("do");
    if (isiExport.items)
      throw new Error("daftar manual ikut tersimpan untuk Export, padahal barangnya dari jadwal");
  } finally {
    w.eval("doLines = " + JSON.stringify(simpan || []));
    w.renderDoLines();
    sel.value = "Export";
    w.syncDocNumConditional(panel);
  }
});
t("baris tanpa nama barang tidak ikut tersimpan", () => {
  eq(w.doLinesBersih([{ nama: "A" }, { nama: "" }, { nama: "  " }]).length, 1);
});
t("Pengajuan Dana bertab per Jenis Pengeluaran, dengan tab Semua", () => {
  const simpanTab = baca("docNumActiveTab");
  const box = w.document.getElementById("docNumSubTabs");
  try {
    w.eval('docNumActiveTab = "fund"');
    w.eval("docNumHistorySub = null");
    w.renderDocNumSubTabs();
    const tombol = [...box.querySelectorAll("[data-dn-subtab]")];
    eq(tombol.map((b) => b.dataset.dnSubtab).join(","),
       ",Billing,Freight,Storage,Lainnya,__ringkasan__",
       "urutan tab (yang pertama = Semua, Summary paling akhir):");
    eq(tombol[0].classList.contains("active"), true, "Semua jadi bawaan:");
  } finally {
    w.eval("docNumHistorySub = null");
    w.eval("docNumActiveTab = " + JSON.stringify(simpanTab));
    w.renderDocNumSubTabs();
  }
});
t("tab Jenis Pengeluaran menyaring lewat ISI PAYLOAD, bukan doc_type", async () => {
  /* Seluruh pengajuan dana memakai SATU urutan nomor. Menyaringnya
     lewat doc_type akan memecah penomorannya -- yang disaring isinya. */
  const simpanTab = baca("docNumActiveTab");
  try {
    /* Sisa pemanggilan riwayat dari uji lain dibiarkan mendarat dulu:
       uji sinkron memanggilnya tanpa menunggu, dan hasilnya bisa
       menimpa jejak saringan di tengah pemeriksaan ini. */
    await new Promise((r) => setTimeout(r, 20));
    w.eval('docNumActiveTab = "fund"');
    w.eval('docNumHistorySub = "Freight"');
    Object.keys(jejakDocNumFilter).forEach((k) => delete jejakDocNumFilter[k]);
    await w.renderDocNumHistory();
    eq(jejakDocNumFilter.doc_type, "fund", "jenis dokumennya tetap satu:");
    eq(jejakDocNumFilter["payload->>expenseType"], "Freight", "saringan isi payload:");

    w.eval('docNumHistorySub = ""');
    Object.keys(jejakDocNumFilter).forEach((k) => delete jejakDocNumFilter[k]);
    await w.renderDocNumHistory();
    if (jejakDocNumFilter["payload->>expenseType"])
      throw new Error('tab "Semua" masih menyaring jenis pengeluaran');
  } finally {
    w.eval("docNumHistorySub = null");
    w.eval("docNumActiveTab = " + JSON.stringify(simpanTab));
  }
});
t("tab Semua ada supaya pengajuan lama tidak lenyap", () => {
  /* Pengajuan lama tersimpan dengan pilihan dropdown yang dulu
     ("Biaya Kepabeanan", "Freight / Trucking", "Operasional") -- tanpa
     tab Semua, riwayat itu tidak cocok dengan tab mana pun. */
  const saring = baca("DOCNUM_HISTORY_FILTERS").fund;
  eq(saring.field, "expenseType");
  const lama = ["Biaya Kepabeanan", "Freight / Trucking", "Operasional"];
  if (lama.some((x) => saring.options.includes(x)))
    throw new Error("prasyarat berubah: pilihan lama ternyata masih ada di tab");
});
t("riwayat menyaring memakai tab sub-jenis yang dipilih", async () => {
  /* Diuji lewat SARINGAN yang benar-benar dikirim ke database, bukan
     dengan membaca kodenya. */
  const simpanTab = baca("docNumActiveTab");
  try {
    await new Promise((r) => setTimeout(r, 20));
    w.eval('docNumActiveTab = "do"');
    w.eval("docNumHistorySub = null");
    await w.renderDocNumHistory();
    eq(jejakDocNumFilter.doc_type, "do", "bawaan mengikuti form (Export):");

    w.eval('docNumHistorySub = "Lokal"');
    await w.renderDocNumHistory();
    eq(jejakDocNumFilter.doc_type, "do_lokal", "sesudah tab Lokal dipilih:");
  } finally {
    w.eval("docNumHistorySub = null");
    w.eval("docNumActiveTab = " + JSON.stringify(simpanTab));
  }
});
t("tab sub-jenis digambar untuk jenis yang serinya terpisah, disembunyikan untuk yang tidak", async () => {
  const simpanTab = baca("docNumActiveTab");
  const box = w.document.getElementById("docNumSubTabs");
  try {
    w.eval('docNumActiveTab = "do"');
    w.renderDocNumSubTabs();
    const label = [...box.querySelectorAll("[data-dn-subtab]")].map((b) => b.textContent);
    eq(label.join(","), "Export,Lokal");
    if (box.classList.contains("d-none")) throw new Error("tab tersembunyi padahal serinya terpisah");

    /* "letter" tidak punya sub-jenis MAUPUN saringan payload.
       ("fund" kini bertab per Jenis Pengeluaran, jadi bukan contoh
       yang tepat lagi.) */
    w.eval('docNumActiveTab = "letter"');
    w.renderDocNumSubTabs();
    if (!box.classList.contains("d-none"))
      throw new Error("tab tetap tampil untuk jenis tanpa sub-jenis & tanpa saringan");
  } finally {
    w.eval("docNumActiveTab = " + JSON.stringify(simpanTab));
    w.renderDocNumSubTabs();
  }
});
console.log("\u2014 PENGAJUAN DANA: RINGKASAN PER VENDOR \u2014");
const barisDana = (id, p, docDate) => ({ id, doc_type: "fund", doc_number: id, doc_date: docDate || "2026-09-01", payload: p });
t("Customer & Vendor dua isian berbeda di form Pengajuan Dana", () => {
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  ["payee", "customer", "invoiceDate", "invoiceDueDate"].forEach((k) => {
    if (!panel.querySelector(`[data-dn="${k}"]`)) throw new Error("isian " + k + " tidak ada");
  });
  eq(panel.querySelector('[data-dn="invoiceDate"]').type, "date");
  eq(panel.querySelector('[data-dn="invoiceDueDate"]').type, "date");
  if (panel.querySelector('[data-dn="customer"]') === panel.querySelector('[data-dn="payee"]'))
    throw new Error("Customer & Vendor memakai isian yang sama");
});
t("kolom 'Dibayarkan Kepada' di riwayat menampilkan VENDOR, bukan Customer", () => {
  /* Urutan cadangan lama (customer || ... || payee) akan menampilkan
     customer di bawah judul Vendor begitu pengajuan dana punya
     isian Customer. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  if (!/\(jenis\.key === "fund" \? p\.payee : ""\) \|\|\s*p\.customer/.test(src))
    throw new Error("riwayat pengajuan dana tidak mendahulukan payee");
});
const kolomDana = (rows) => rows.map((r) => w.fsumKolom(r));
t("Summary: kolom rincian persis urutan yang diminta", () => {
  const box = w.document.createElement("div");
  w.document.body.appendChild(box);
  try {
    w.eval(`fsumBaris = ${JSON.stringify([
      barisDana("1", { payee: "FedEx", customer: "KUMHO", invoiceNo: "872941820", invoiceDate: "2026-09-05",
        invoiceDueDate: "2026-10-05", currency: "IDR", amount: "1000000", notes: "Freight Import Motor" }),
    ])}`);
    w.fsumGambarPanel(box);
    const kepala = [...box.querySelectorAll(".fsum-rinci thead th")].map((th) => th.textContent.trim());
    eq(kepala.join(" | "), "No | Invoice Date | Invoice/Bill Number | Company | Cost | Customer | Details | Due Date | Status Bayar");
    const sel = [...box.querySelectorAll(".fsum-rinci tbody td")].map((td) => td.textContent.trim());
    eq(sel[2], "872941820", "Invoice/Bill Number:");
    eq(sel[3], "FedEx", "Company = Dibayarkan Kepada:");
    eq(sel[5], "KUMHO", "Customer:");
    eq(sel[6], "Freight Import Motor", "Details = Notes:");
  } finally {
    box.remove();
    w.eval("fsumPemilih && fsumPemilih.lepas(); fsumPemilih = null; fsumBaris = null");
  }
});
t("Summary: pivot per Company menggabung ejaan berbeda; Cost = Terbilang di surat", () => {
  const rows = [
    barisDana("1", { payee: "FedEx", customer: "KUMHO", invoiceDate: "2026-09-05", currency: "IDR", amount: "1000000" }),
    barisDana("2", { payee: "FEDEX ", customer: "DYNAMIC", invoiceDate: "2026-09-10", currency: "IDR", amount: "500000" }),
    barisDana("3", { payee: "DHL", customer: "KUMHO", invoiceDate: "2026-09-12", currency: "USD", amount: "200" }),
  ];
  const k = kolomDana(rows);
  const pv = w.fsumPivot(k, "company");
  eq(pv.grup.length, 2, "FedEx & FEDEX satu kelompok:");
  eq(pv.grup[0].total.IDR, 1500000, "total FedEx:");
  eq(pv.grup[1].total.USD, 200, "USD tidak dicampur ke IDR:");
  eq(pv.mataUang.join(","), "IDR,USD", "IDR selalu kolom pertama:");
  const pc = w.fsumPivot(k, "customer");
  eq(pc.grup.find((g) => g.kunci === "KUMHO").jumlah, 2, "per Customer:");
  // Cost per baris = fungsi yang sama dengan Terbilang di surat cetak.
  const rinci = { payee: "X", invoiceDate: "2026-09-02", currency: "IDR",
    lines: [{ desc: "Freight", amount: "1000000", ppnRate: "1.1" }] };
  eq(w.fsumKolom(barisDana("5", rinci)).nilai, w.frTotalPengajuan(rinci), "format rinci:");
});
t("Summary: pivot per Jenis & per Bulan, dan klik kelompok menyaring rinciannya", () => {
  const rows = [
    barisDana("1", { payee: "A", expenseType: "Freight", invoiceDate: "2026-08-20", amount: "100" }),
    barisDana("2", { payee: "B", expenseType: "Billing", invoiceDate: "2026-09-02", amount: "50" }),
    barisDana("3", { payee: "C", expenseType: "Freight", invoiceDate: "2026-09-15", amount: "70" }),
  ];
  const k = kolomDana(rows);
  const pj = w.fsumPivot(k, "jenis");
  eq(pj.grup.find((g) => g.kunci === "Freight").total.IDR, 170, "per Jenis:");
  const pb = w.fsumPivot(k, "bulan");
  eq(pb.grup.map((g) => g.kunci).join(","), "2026-09,2026-08", "per Bulan, terbaru dulu:");
  // Klik baris "2026-08" -> rentang tanggal Agustus penuh.
  const f = baca("FSUM_KELOMPOK").bulan.saring("2026-08");
  eq(f.dari + ".." + f.sampai, "2026-08-01..2026-08-31", "saring bulan:");
  const saringan = Object.assign({ dari: "", sampai: "", company: "", customer: "", jenis: "" }, f);
  eq(w.fsumSaring(k, saringan).length, 1, "rincian tersaring ke Agustus:");
});
t("Summary: patokan Tanggal Invoice, cadangan tanggal surat untuk data lama", () => {
  const rows = [
    // invoice Agustus, suratnya terbit September -> masuk AGUSTUS
    barisDana("a", { payee: "V", invoiceDate: "2026-08-28", amount: "100" }, "2026-09-03"),
    // pengajuan lama tanpa Tanggal Invoice -> pakai tanggal surat
    barisDana("b", { payee: "V", amount: "50" }, "2026-08-15"),
  ];
  const k = kolomDana(rows);
  const f = (dari, sampai) => ({ dari, sampai, company: "", customer: "", jenis: "" });
  eq(w.fsumSaring(k, f("2026-08-01", "2026-08-31")).length, 2, "Agustus:");
  eq(w.fsumSaring(k, f("2026-09-01", "2026-09-30")).length, 0, "September:");
  eq(k[1].adaTglInvoice, false, "baris lama ditandai tanpa Tanggal Invoice:");
});
t("Summary: pilihan penyaring dari SELURUH data, Company & Customer tidak tercampur", () => {
  const k = kolomDana([
    barisDana("1", { payee: "FedEx", customer: "KUMHO", amount: "1" }),
    barisDana("2", { payee: "DHL", customer: "DYNAMIC", amount: "1" }),
  ]);
  const company = w.fsumPilihan(k, (x) => x.company).map((p) => p[1]).join(",");
  const customer = w.fsumPilihan(k, (x) => x.customer).map((p) => p[1]).join(",");
  eq(company, "DHL,FedEx");
  eq(customer, "DYNAMIC,KUMHO");
});
console.log("\u2014 PERAN MARKETING \u2014");
const denganPeran = (peran, fn) => {
  const simpan = w.eval("JSON.stringify(authState.profile || null)");
  try {
    w.eval(`authState.profile = ${JSON.stringify(peran ? { id: "u", role: peran, full_name: "Uji" } : null)}`);
    return fn();
  } finally {
    w.eval("authState.profile = " + simpan);
    w.applyPermissions();
  }
};
t("matriks hak: EXIM mengubah; marketing hanya MEMBUKA Nomor Dokumen; viewer tidak keduanya", () => {
  const baris = (peran) => denganPeran(peran, () =>
    [w.canEdit(), w.canViewDocNum(), w.currentRoleLabel()].join(","));
  eq(baris("exim"), "true,true,EXIM");
  eq(baris("marketing"), "false,true,Marketing");
  eq(baris("viewer"), "false,false,Viewer");
});
t("marketing: hanya-baca di seluruh aplikasi (is-viewer) + penanda is-marketing", () => {
  denganPeran("marketing", () => {
    w.applyPermissions();
    const b = w.document.body.classList;
    if (!b.contains("is-viewer")) throw new Error("marketing tidak ikut hanya-baca di halaman lain");
    if (!b.contains("is-marketing")) throw new Error("penanda is-marketing tidak terpasang");
  });
  denganPeran("exim", () => {
    w.applyPermissions();
    if (w.document.body.classList.contains("is-marketing")) throw new Error("is-marketing bocor ke EXIM");
  });
});
t("halaman: marketing boleh Nomor Dokumen, tidak boleh Akun / tambah jadwal", () => {
  const buka = (peran, hash) => denganPeran(peran, () => {
    w.location.hash = hash;
    w.router();
    return w.location.hash;
  });
  eq(buka("marketing", "#/docnum"), "#/docnum", "marketing -> Nomor Dokumen:");
  eq(buka("viewer", "#/docnum"), "#/", "viewer -> Nomor Dokumen ditolak:");
  eq(buka("marketing", "#/akun"), "#/", "marketing -> Akun ditolak:");
  eq(buka("marketing", "#/new"), "#/", "marketing -> tambah jadwal ditolak:");
  w.location.hash = "#/";
});
t("Nomor Dokumen: marketing hanya membaca -- tidak mengajukan, memperbaiki, atau menandai lunas", () => {
  denganPeran("marketing", () => {
    if (w.bolehUbahDocNum()) throw new Error("marketing masih bisa mengubah di Nomor Dokumen");
    const lencana = w.dnTombolBayar({ id: "x", payload: {} });
    if (/^<button/.test(lencana)) throw new Error("marketing masih bisa menandai status bayar");
  });
  denganPeran("exim", () => {
    if (!w.bolehUbahDocNum()) throw new Error("EXIM tidak bisa mengubah");
  });
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  if (!/btnDocNumSubmit[\s\S]{0,80}if \(!requireEdit\(\)\) return;/.test(src))
    throw new Error("tombol Ajukan / Simpan Perubahan tidak dijaga khusus EXIM");
  const css = require("fs").readFileSync(require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  ["\\[data-docnum-panel\\]", "\\.docnum-actions", "\\.counter-box"].forEach((sel) => {
    if (!new RegExp("body\\.is-viewer " + sel).test(css))
      throw new Error("form Nomor Dokumen tidak disembunyikan untuk marketing/viewer: " + sel);
  });
  if (/is-editing/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")))
    throw new Error("sisa aturan mode perbaikan marketing masih ada");
});
t("kotak cari riwayat tidak dikunci untuk marketing; isian form tetap dikunci", () => {
  const cari = w.document.getElementById("docNumSearch");
  const isian = w.document.querySelector('#viewDocNum [data-docnum-panel] input');
  const simpan = [cari.disabled, isian.disabled];
  try {
    cari.disabled = false; delete cari.dataset.viewerLocked;
    isian.disabled = false; delete isian.dataset.viewerLocked;
    denganPeran("marketing", () => { w.lockInputs(); });
    eq(cari.disabled, false, "kotak cari (alat membaca):");
    eq(isian.disabled, true, "isian form:");
  } finally {
    cari.disabled = simpan[0]; delete cari.dataset.viewerLocked;
    isian.disabled = simpan[1]; delete isian.dataset.viewerLocked;
  }
});
t("halaman Akun menawarkan peran Marketing", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "views", "accounts-view.js"), "utf8");
  if (!/<option value="marketing"/.test(src)) throw new Error("pilihan Marketing tidak ada");
  if (!w.document.getElementById("accountCountMarketing")) throw new Error("hitungan akun Marketing tidak ada");
});
t("migrasi database peran marketing ikut di paket", () => {
  const sql = require("fs").readFileSync(require("path").join(__dirname, "..", "migration-role-marketing.sql"), "utf8");
  ["'marketing'", "peran_saya", "next_document_number"].forEach((k) => {
    if (!sql.includes(k)) throw new Error("migrasi tidak memuat " + k);
  });
  // Yang SENGAJA tidak dibuka tidak boleh ikut disunting migrasinya.
  const bag4 = sql.slice(sql.indexOf("-- ---- 4."), sql.indexOf("-- ---- 5."));
  if (/proname (in \(|= ')[^)]*(delete_document_number|set_document_counter|admin_)/.test(bag4))
    throw new Error("migrasi menyunting fungsi yang harus tetap khusus EXIM");
  // Marketing tidak mengajukan nomor: tidak ada kebijakan INSERT untuknya,
  // dan yang dibuat versi sebelumnya dicabut.
  if (/for insert to authenticated[\s\S]{0,80}peran_saya\(\) = 'marketing'/.test(sql.slice(0, sql.indexOf("-- ---- 5."))))
    throw new Error("migrasi masih memberi marketing hak menambah nomor");
  if (!/drop policy if exists "marketing tambah nomor dokumen"/.test(sql))
    throw new Error("hak tambah nomor dari versi sebelumnya tidak dicabut");
  // Marketing juga tidak mengubah isian: kebijakan UPDATE-nya dicabut.
  if (/for update to authenticated[\s\S]{0,80}peran_saya\(\) = 'marketing'/.test(sql))
    throw new Error("migrasi masih memberi marketing hak mengubah isian");
  if (!/drop policy if exists "marketing ubah nomor dokumen"/.test(sql))
    throw new Error("hak ubah isian dari versi sebelumnya tidak dicabut");
});

console.log("\u2014 PENGAJUAN DANA: NILAI & STATUS BAYAR \u2014");
t("lencana bayar: EXIM dapat tombol, viewer hanya lencana; lunas menyebut tanggalnya", () => {
  const simpanProfil = w.eval("JSON.stringify(authState.profile || null)");
  try {
    w.eval('authState.profile = { id: "u1", role: "exim", full_name: "Yogi" }');
    const lunas = w.dnTombolBayar({ id: "x", payload: { paidAt: "2026-09-21", paidBy: "Yogi" } });
    if (!/^<button/.test(lunas) || !/data-bayar-num="x"/.test(lunas)) throw new Error("EXIM tidak mendapat tombol");
    if (!lunas.includes("21-09-2026")) throw new Error("tanggal bayar tidak ditampilkan");
    const belum = w.dnTombolBayar({ id: "y", payload: {} });
    if (!/dn-bayar--belum/.test(belum)) throw new Error("status belum lunas salah");
    w.eval('authState.profile = { id: "u2", role: "viewer" }');
    const viewer = w.dnTombolBayar({ id: "x", payload: { paidAt: "2026-09-21" } });
    if (/<button/.test(viewer)) throw new Error("viewer bisa mengubah status bayar");
  } finally {
    w.eval("authState.profile = " + simpanProfil);
  }
});
t("ubah isian TIDAK menghapus status lunas", async () => {
  /* Payload ubah-isian dirakit dari form; status lunas bukan isian form
     dan dulu ikut hilang setiap kali pengajuannya diperbaiki. */
  const simpan = { tab: baca("docNumActiveTab"), prof: w.eval("JSON.stringify(authState.profile || null)") };
  let terkirim = null;
  const asli = w.eval("supabaseClient.from");
  try {
    w.eval('authState.profile = { id: "u1", role: "exim" }');
    w.eval('docNumActiveTab = "fund"');
    tulis("docNumHistoryRows", [{ id: "f9", doc_type: "fund", doc_number: "301/EXIM/DDI/IX/2026",
      doc_date: "2026-09-21", requester: "Yogi Firgiawan", department: "EXIM",
      payload: { payee: "KAS NEGARA", expenseType: "Billing", billingNo: "640260906211153",
        notes: "Billing Import", paidAt: "2026-09-22", paidBy: "Yogi" } }]);
    w.mulaiUbahDocNum("f9");
    w.__tangkap = (u) => { terkirim = u; };
    w.eval(`supabaseClient.from = () => ({ update: (u) => { window.__tangkap(u); return { eq: async () => ({ error: null }) }; },
      select: () => { const c = { eq: () => c, order: () => c, range: async () => ({ data: [], error: null, count: 0 }),
        maybeSingle: async () => ({ data: null, error: null }), filter: () => c, then: (r) => r({ data: [], error: null, count: 0 }) }; return c; } })`);
    await w.simpanUbahDocNum();
    if (!terkirim) throw new Error("perubahan tidak terkirim");
    eq(terkirim.payload.paidAt, "2026-09-22", "tanggal bayar terbawa:");
    eq(terkirim.payload.paidBy, "Yogi", "penanda terbawa:");
  } finally {
    w.supabaseClient_from_asli = asli;
    w.eval("supabaseClient.from = window.supabaseClient_from_asli");
    w.batalUbahDocNum();
    w.eval("docNumActiveTab = " + JSON.stringify(simpan.tab));
    w.eval("authState.profile = " + simpan.prof);
  }
});
t("menandai lunas membaca payload TERBARU dulu -- tidak menimpa perubahan orang lain", async () => {
  let terkirim = null;
  const asli = w.eval("supabaseClient.from");
  try {
    tulis("docNumHistoryRows", [{ id: "f8", doc_type: "fund", doc_number: "300", payload: { payee: "LAMA" } }]);
    w.__tangkap = (u) => { terkirim = u; };
    // Di database, isiannya sudah diubah orang lain sejak daftar dimuat.
    w.eval(`supabaseClient.from = () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { payload: { payee: "BARU DARI ORANG LAIN", notes: "x" } }, error: null }) }) }),
      update: (u) => { window.__tangkap(u); return { eq: async () => ({ error: null }) }; } })`);
    await w.dnSetelBayar("f8", "2026-09-23");
    eq(terkirim.payload.payee, "BARU DARI ORANG LAIN", "perubahan orang lain dipertahankan:");
    eq(terkirim.payload.paidAt, "2026-09-23");
    await w.dnSetelBayar("f8", null);
    if ("paidAt" in terkirim.payload || "paidBy" in terkirim.payload) throw new Error("status lunas tidak terhapus saat dibatalkan");
  } finally {
    w.supabaseClient_from_asli = asli;
    w.eval("supabaseClient.from = window.supabaseClient_from_asli");
  }
});
t("Summary: saring & kelompokkan per status bayar", () => {
  const k = kolomDana([
    barisDana("1", { payee: "A", amount: "100", paidAt: "2026-09-10" }),
    barisDana("2", { payee: "B", amount: "40" }),
    barisDana("3", { payee: "C", amount: "60" }),
  ]);
  const f = (bayar) => ({ dari: "", sampai: "", company: "", customer: "", jenis: "", bayar });
  eq(w.fsumSaring(k, f("belum")).length, 2, "belum lunas:");
  eq(w.fsumSaring(k, f("lunas")).length, 1, "lunas:");
  const pv = w.fsumPivot(k, "bayar");
  eq(pv.grup.find((g) => g.kunci === "belum").total.IDR, 100, "total yang masih harus dibayar:");
});
console.log("\u2014 KOP & MARGIN SURAT PENGAJUAN DANA \u2014");
t("kop surat berukuran surat resmi, bergaris kop tebal-tipis", () => {
  const css = w.fundRequestCss();
  if (!/\.kop img \{ height: 22mm; width: auto; \}/.test(css)) throw new Error("logo kop tidak 22 mm");
  if (!/\.kop-nama \{ font-size: 20pt;/.test(css)) throw new Error("nama perusahaan tidak 20pt");
  if (!/\.kop-alamat \{ font-size: 9\.5pt;/.test(css)) throw new Error("alamat tidak 9,5pt");
  if (!/\.kop \{[\s\S]*?border-bottom: 0\.7mm solid #000;/.test(css)) throw new Error("garis kop tebal hilang");
  if (!/\.kop::after \{[\s\S]*?border-bottom: 0\.25mm solid #000;/.test(css)) throw new Error("garis kop tipis hilang");
});
t("margin A4 15/20 mm tanpa padding bawah -- surat panjang tidak memunculkan halaman kosong", () => {
  const css = w.fundRequestCss();
  if (!/\.sheet \{ width: 100%; padding: 15mm 20mm 0; \}/.test(css)) throw new Error("margin lembar berubah");
  if (!/@page \{ size: A4; margin: 0; \}/.test(css)) throw new Error("@page harus A4 bermargin nol (kop & kaki peramban)");
});

console.log("\u2014 DISKON SEBAGAI BARIS & RUMUS DI RINCIAN BIAYA \u2014");
const pos = (amount, ppnRate, desc) => ({ desc: desc || "Freight Charge", amount, ppnRate });
const diskon = (amount, discType, ppnRate) => ({ jenis: "diskon", desc: "Base Discount", amount, discType, ppnRate });
t("baris diskon persen: dari pos di atasnya; PPN & PPH 23 ikut berkurang", () => {
  const lines = [pos("2.200.000", 11), diskon("10", "pct", 11)];
  eq(w.fundLineValues(lines).join("|"), "2200000|-220000", "nilai bertanda:");
  eq(w.fundLinePpnNilai(-220000, lines[1]), -24200, "PPN baris diskon (mengurangi):");
  const r = w.fundLineTotals(lines);
  eq([r.totalNilai, r.totalDiskon, r.totalNet, r.totalPpn, r.pph].join("|"),
     "2200000|220000|1980000|217800|39600", "total:");
  eq(r.grandTotal, 1980000 + 217800 - 39600, "TOTAL = sama dengan PPN dari nilai setelah diskon:");
});
t("baris diskon rupiah; tarif '—' berarti dasar pajak tidak berkurang; minus diabaikan", () => {
  eq(w.fundLineTotals([pos("2.200.000", 11), diskon("200.000", "rp", 11)]).grandTotal,
     2000000 + 220000 - 40000, "tarif sama dengan posnya:");
  eq(w.fundLineTotals([pos("2.200.000", 11), diskon("200.000", "rp", 0)]).grandTotal,
     2000000 + 242000 - 44000, "tarif '—':");
  eq(w.fundLineValues([pos("1.000", 11), diskon("-200", "rp", 11)])[1], -200, "minus dibaca diskon biasa:");
});
t("diskon persen memakai pos BIAYA terdekat di atasnya", () => {
  const v = w.fundLineValues([pos("1.000.000", 11, "A"), pos("500.000", 11, "B"), diskon("10", "pct", 11)]);
  eq(v[2], -50000, "10% dari pos B:");
});
t("data lama berkolom diskon dipecah jadi pos + baris diskon, totalnya sama", () => {
  const lama = [{ desc: "Freight Charge", amount: "2.200.000", disc: "10", discType: "pct", ppnRate: 11 }];
  const baru = w.normalisasiBarisDana(lama);
  eq(baru.length, 2, "jumlah baris:");
  eq(baru[1].jenis + "|" + baru[1].discType + "|" + baru[1].amount, "diskon|pct|10", "baris diskon:");
  if ("disc" in baru[0]) throw new Error("kolom diskon lama masih menempel di pos");
  eq(w.fundLineTotals(lama).grandTotal, 2158200, "total data lama:");
});
t("form: Tambah Diskon -> baris diskon bertarif pos di atasnya, mengetik memperbarui semuanya", () => {
  const simpan = w.eval("JSON.stringify(fundLines)");
  try {
    w.eval('fundLines = [{ desc: "Freight Charge", amount: "2.200.000", ppnRate: 11 }]; renderFundLines()');
    w.document.getElementById("btnFundDiscAdd").click();
    const lines = baca("fundLines");
    eq(lines[1].jenis + "|" + lines[1].ppnRate, "diskon|11", "baris baru:");
    const tr = w.document.querySelector('#fundLinesBody [data-fl="1"]');
    if (!tr.classList.contains("fl-row-diskon")) throw new Error("baris diskon tidak ditandai");
    const kotak = tr.querySelector('[data-fl-f="amount"]');
    kotak.value = "200000";
    kotak.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(kotak.value, "200.000", "format rupiah:");
    eq(tr.querySelector(".fl-ppn").textContent, "- 22.000", "PPN baris diskon:");
    const kaki = w.document.getElementById("fundLinesFoot").textContent.replace(/\s+/g, " ");
    if (!/Total Diskon\s*- Rp\. 200\.000/.test(kaki)) throw new Error("Total Diskon: " + kaki);
    if (!/TOTAL\s*Rp\. 2\.180\.000/.test(kaki)) throw new Error("TOTAL: " + kaki);
  } finally {
    w.eval("fundLines = " + simpan + "; renderFundLines()");
  }
});
t("nominal diskon di kotak baca-saja sebaris, ikut berubah saat pos di atasnya diubah", () => {
  const simpan = w.eval("JSON.stringify(fundLines)");
  try {
    w.eval(`fundLines = [{ desc: "Freight Charge", amount: "5.678.432", ppnRate: 1.1 },
      { jenis: "diskon", desc: "Base Discount", amount: "35", discType: "pct", ppnRate: 1.1 }]; renderFundLines()`);
    const nominal = () => w.document.querySelector('#fundLinesBody [data-fl="1"] .fl-disc-nominal');
    if (!nominal().readOnly) throw new Error("kotak nominal bisa diketik");
    if (nominal().dataset.flF) throw new Error("kotak nominal ikut dibaca sebagai isian");
    eq(nominal().value, "- 1.987.451", "35% dari 5.678.432:");
    const pos = w.document.querySelector('#fundLinesBody [data-fl="0"] [data-fl-f="amount"]');
    pos.value = "1000000";
    pos.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(nominal().value, "- 350.000", "setelah pos di atasnya diubah:");
    if (w.document.querySelector("#fundLinesBody .fl-disc-hasil")) throw new Error("keterangan lama di bawah kotak masih ada");
    // Kedua tombol tambah dalam satu wadah sebaris.
    const aksi = w.document.querySelector(".fl-aksi");
    if (!aksi || !aksi.querySelector("#btnFundLineAdd") || !aksi.querySelector("#btnFundDiscAdd"))
      throw new Error("tombol Tambah Baris & Tambah Diskon tidak sebaris");
  } finally {
    w.eval("fundLines = " + simpan + "; renderFundLines()");
  }
});
t("hitungRumus: operator, kurung, persen, dan yang tidak valid", () => {
  const kasus = { "=1.000+1.000": 2000, "=(1.500+500)*3": 6000, "=2.200.000*10%": 220000,
    "=10.000/4": 2500, "=1000x2": 2000, "=10:4": 2.5, "=-500+1000": 500, "=2,5*4": 10 };
  Object.entries(kasus).forEach(([r, v]) => eq(w.hitungRumus(r), v, r + ":"));
  ["=1000+", "=1000/0", "=abc", "=(1+2", "=", "=1000);alert(1)"].forEach((r) => {
    if (!isNaN(w.hitungRumus(r))) throw new Error("seharusnya tidak valid: " + r);
  });
});
t("rumus di kotak nilai: utuh saat diketik, dihitung saat Enter; yang salah ditandai & diblokir", () => {
  const simpan = w.eval("JSON.stringify(fundLines)");
  const enter = (el) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  try {
    w.eval('fundLines = [{ desc: "Freight", amount: "", ppnRate: 11 }, { desc: "Handling", amount: "", ppnRate: 11 }]; renderFundLines()');
    const kotak = () => w.document.querySelector('#fundLinesBody [data-fl="0"] [data-fl-f="amount"]');
    kotak().value = "=1000+1000";
    kotak().dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(kotak().value, "=1000+1000", "tidak dirusak pemformat saat diketik:");
    enter(kotak());
    eq(kotak().value, "2.000", "setelah Enter:");
    eq(baca("fundLines")[0].amount, "2.000", "tersimpan sebagai angka:");
    kotak().value = "=2.200.000*10%";
    kotak().dispatchEvent(new w.Event("input", { bubbles: true }));
    enter(kotak());
    eq(kotak().value, "220.000", "persen:");
    kotak().value = "=1000+";
    kotak().dispatchEvent(new w.Event("input", { bubbles: true }));
    enter(kotak());
    eq(kotak().value, "=1000+", "rumus salah dibiarkan untuk diperbaiki:");
    if (!kotak().classList.contains("fl-rumus-salah")) throw new Error("rumus salah tidak ditandai");
    if (!w.fundLinesRumusGagal(baca("fundLines"))) throw new Error("rumus salah tidak terdeteksi");
    if (!w.validateDocNumForm("fund").some((m) => /rumus/i.test(m))) throw new Error("penyimpanan tidak diblokir");
  } finally {
    w.eval("fundLines = " + simpan + "; renderFundLines()");
  }
});
t("surat cetak: baris diskon bertanda minus, tanpa keterangan diskon di samping pos", () => {
  const html = w.frTabelRinci({ lines: [pos("2.200.000", 11), diskon("10", "pct", 11)] }, "IDR");
  if (/c-diskon|&minus; diskon/.test(html)) throw new Error("masih ada keterangan diskon di samping pos");
  if (!/Base Discount/.test(html)) throw new Error("baris diskon tidak tercetak");
  if (!/- Rp\. 220\.000/.test(html)) throw new Error("nilai diskon tidak bertanda minus");
  if (!/1\.980\.000/.test(html)) throw new Error("subtotal setelah diskon tidak tercetak");
  eq(w.frTotalPengajuan({ lines: [pos("2.200.000", 11), diskon("10", "pct", 11)] }), 2158200, "nilai pengajuan:");
});

console.log("\u2014 REKAP BULANAN & FORMAT NOMINAL \u2014");
t("rekap bulanan: 12 bulan, jumlah & total per bulan, tahun lain tidak ikut", () => {
  const k = kolomDana([
    barisDana("1", { payee: "A", invoiceDate: "2026-01-10", amount: "125000000" }),
    barisDana("2", { payee: "B", invoiceDate: "2026-01-20", amount: "5000000" }),
    barisDana("3", { payee: "C", invoiceDate: "2026-02-03", amount: "56000000" }),
    barisDana("4", { payee: "D", invoiceDate: "2026-02-04", currency: "USD", amount: "420" }),
    barisDana("5", { payee: "E", invoiceDate: "2025-12-30", amount: "999" }),
  ]);
  const r = w.fsumRekapBulanan(k, "2026");
  eq(r.bulan.length, 12, "jumlah baris:");
  eq(r.bulan[0].jumlah + "|" + r.bulan[0].total.IDR, "2|130000000", "Januari:");
  eq(r.bulan[1].jumlah + "|" + r.bulan[1].total.IDR + "|" + r.bulan[1].total.USD, "2|56000000|420", "Februari:");
  eq(r.bulan[11].jumlah, 0, "Desember 2026 kosong (yang 2025 tidak ikut):");
  eq(r.jumlahTahun, 4, "total setahun:");
  eq(r.mataUang.join(","), "IDR,USD");
});
t("pilihan tahun = tahun di data + tahun berjalan, terbaru dulu", () => {
  const k = kolomDana([
    barisDana("1", { invoiceDate: "2024-05-01", amount: "1" }),
    barisDana("2", { invoiceDate: "2025-05-01", amount: "1" }),
  ]);
  const ini = String(new Date().getFullYear());
  const daftar = w.fsumDaftarTahun(k);
  eq(daftar[0], ini, "tahun berjalan paling atas (bawaan):");
  if (!daftar.includes("2024") || !daftar.includes("2025")) throw new Error("tahun dari data tidak muncul");
  eq(daftar.join(","), [...daftar].sort().reverse().join(","), "urut menurun:");
});
t("rekap tetap tampil walau rentang tanggal tidak memuat apa pun, judul ikut tahunnya", () => {
  const box = w.document.createElement("div");
  w.document.body.appendChild(box);
  try {
    w.eval(`fsumBaris = ${JSON.stringify([
      barisDana("1", { payee: "FEDEX", invoiceDate: "2025-03-05", amount: "1000" }),
    ])}`);
    w.eval('fsumSaringan.dari = "2025-09-01"; fsumSaringan.sampai = "2025-09-06"; fsumSaringan.tahun = "2025"');
    w.fsumGambarPanel(box);
    if (!box.querySelector("#fsumHasil .panel-empty")) throw new Error("rincian seharusnya kosong");
    const judul = box.querySelector(".fsum-rekap .fsum-judul").textContent;
    if (!/2025/.test(judul)) throw new Error("judul tidak mengikuti tahun: " + judul);
    const maret = [...box.querySelectorAll(".fsum-rekap-tabel tbody tr")][2].textContent;
    if (!/\b1\b/.test(maret)) throw new Error("rekap mengikuti rentang tanggal (Maret hilang)");
  } finally {
    box.remove();
    w.eval("Object.assign(fsumSaringan, FSUM_SARINGAN_AWAL); fsumPemilih && fsumPemilih.lepas(); fsumPemilih = null; fsumBaris = null");
  }
});
t("rekap bulanan berdasarkan Tanggal Bayar: per bulan pembayarannya, yang belum lunas tidak masuk", () => {
  const k = kolomDana([
    barisDana("1", { payee: "A", invoiceDate: "2026-01-20", paidAt: "2026-02-03", amount: "100" }),
    barisDana("2", { payee: "B", invoiceDate: "2026-01-25", paidAt: "2026-03-10", amount: "40" }),
    barisDana("3", { payee: "C", invoiceDate: "2026-01-28", amount: "60" }), // belum lunas
  ]);
  const inv = w.fsumRekapBulanan(k, "2026", "invoice");
  eq(inv.bulan[0].jumlah, 3, "Tanggal Invoice: ketiganya di Januari:");
  const bayar = w.fsumRekapBulanan(k, "2026", "bayar");
  eq([bayar.bulan[0].jumlah, bayar.bulan[1].jumlah, bayar.bulan[2].jumlah].join("|"), "0|1|1", "Tanggal Bayar:");
  eq(bayar.jumlahTahun, 2, "yang belum lunas tidak masuk:");
});
t("pilihan tahun mengikuti dasar tanggalnya, dan tetap memuat tahun yang sedang dipilih", () => {
  const k = kolomDana([barisDana("1", { invoiceDate: "2024-05-01", paidAt: "2025-01-10", amount: "1" })]);
  const inv = w.fsumDaftarTahun(k, "invoice");
  const bayar = w.fsumDaftarTahun(k, "bayar");
  if (!inv.includes("2024") || inv.includes("2025")) throw new Error("dasar invoice: " + inv);
  if (!bayar.includes("2025") || bayar.includes("2024")) throw new Error("dasar bayar: " + bayar);
  if (!w.fsumDaftarTahun(k, "bayar", "2020").includes("2020")) throw new Error("tahun terpilih hilang dari pilihan");
});
t("tahun baru muncul SENDIRI: jam sistem di 2027 -> 2027 ada di pilihan, paling atas", () => {
  const DateAsli = w.Date;
  try {
    w.eval(`(() => { const Asli = Date; window.__DateAsli = Asli;
      Date = class extends Asli { constructor(...a) { super(...(a.length ? a : ["2027-01-02T09:00:00"])); } };
      Date.now = () => new Asli("2027-01-02T09:00:00").getTime(); })()`);
    const k = kolomDana([barisDana("1", { invoiceDate: "2026-12-20", amount: "1" })]);
    const daftar = w.fsumDaftarTahun(k, "invoice");
    eq(daftar[0], "2027", "paling atas:");
    eq(w.eval("fsumTahunDipilih()"), "2027", "pilihan bawaan:");
  } finally {
    w.eval("Date = window.__DateAsli");
    if (w.Date !== DateAsli) w.Date = DateAsli;
  }
});
t("Amount di Rincian Biaya diformat titik ribuan saat diketik, dan terbaca kembali tepat", () => {
  const simpan = w.eval("JSON.stringify(fundLines)");
  try {
    w.eval('fundLines = [{ desc: "", amount: "", ppnRate: 1.1 }]; renderFundLines()');
    const kotak = w.document.querySelector('#fundLinesBody [data-fl-f="amount"]');
    kotak.value = "133434343";
    kotak.setSelectionRange(9, 9);
    kotak.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(kotak.value, "133.434.343", "tampilan:");
    eq(kotak.selectionStart, 11, "kursor tetap di ujung:");
    eq(w.fundLineAmount(baca("fundLines")[0]), 133434343, "nilai yang dihitung:");
    // Nilai lama yang tersimpan tanpa titik tampil berformat saat digambar.
    w.eval('fundLines = [{ desc: "", amount: "6262200", ppnRate: 1.1 }]; renderFundLines()');
    eq(w.document.querySelector('#fundLinesBody [data-fl-f="amount"]').value, "6.262.200", "nilai lama:");
  } finally {
    w.eval("fundLines = " + simpan + "; renderFundLines()");
  }
});

console.log("\u2014 CARI DI RIWAYAT NOMOR \u2014");
t("kata kunci dibersihkan dari tanda yang merusak filter", () => {
  const f = w.dnFilterCari('PT (Persero), "kas" 50%*');
  // Kata kunci di antara wildcard pembuka & penutup, persis tanpa tanda khusus.
  eq(f.match(/^doc_number\.ilike\."%(.*?)%"/)[1], "PT Persero kas 50", "kata kunci bersih:");
  if (!f.includes("payload->>notes.ilike.")) throw new Error("catatan tidak ikut dicari");
  eq(w.dnFilterCari("   "), null, "kotak kosong -> tanpa filter:");
});
t("pencarian dikirim ke DATABASE (bukan menyaring halaman di layar)", async () => {
  let orDipanggil = null;
  const asli = w.eval("supabaseClient.from");
  const tab = baca("docNumActiveTab");
  try {
    w.__catatOr = (s) => { orDipanggil = s; };
    w.eval(`supabaseClient.from = () => { const c = { select: () => c, eq: () => c, filter: () => c,
      or: (s) => { window.__catatOr(s); return c; }, order: () => c,
      range: async () => ({ data: [], error: null, count: 0 }) }; return c; }`);
    w.eval('docNumActiveTab = "fund"; docNumHistorySub = null; docNumCari = "fedex"');
    await w.renderDocNumHistory();
    if (!orDipanggil || !orDipanggil.includes('"%fedex%"')) throw new Error("kata kunci tidak sampai ke kueri");
    const box = w.document.getElementById("docNumHistory");
    if (!/fedex/.test(box.textContent)) throw new Error("pesan kosong tidak menyebut kata kuncinya");
  } finally {
    w.supabaseClient_from_asli = asli;
    w.eval("supabaseClient.from = window.supabaseClient_from_asli; docNumCari = ''");
    w.eval("docNumActiveTab = " + JSON.stringify(tab));
  }
});
t("ganti jenis dokumen mengosongkan pencarian", () => {
  const tab = baca("docNumActiveTab");
  const kotak = w.document.getElementById("docNumSearch");
  try {
    w.showDocNumTab("fund");
    w.eval('docNumCari = "kas"');
    kotak.value = "kas";
    w.showDocNumTab("invoice");
    eq(baca("docNumCari"), "", "kata kunci:");
    eq(kotak.value, "", "isi kotak:");
  } finally {
    w.showDocNumTab(tab);
  }
});
t("Summary ikut tersaring kotak cari", () => {
  const k = kolomDana([
    barisDana("1", { payee: "FEDEX", notes: "Freight Motor", amount: "1" }),
    barisDana("2", { payee: "DHL", notes: "Duty", amount: "1" }),
  ]);
  const f = { dari: "", sampai: "", company: "", customer: "", jenis: "", bayar: "", q: "motor" };
  eq(w.fsumSaring(k, f).length, 1);
});
t("tabel riwayat nomor rata tengah seluruhnya", () => {
  const css = require("fs").readFileSync(require("path").join(__dirname, "..", "css", "docnum.css"), "utf8");
  const blok = (sel) => (css.match(new RegExp(sel.replace(/[.]/g, "\\.") + " \\{[^}]*\\}")) || [""])[0];
  if (!/text-align: center/.test(blok(".docnum-table th"))) throw new Error("kepala tabel tidak rata tengah");
  if (!/text-align: center/.test(blok(".docnum-table td"))) throw new Error("isi tabel tidak rata tengah");
  if (/text-align: right/.test(blok(".docnum-table .dn-col-nilai"))) throw new Error("kolom Nilai masih rata kanan");
});
t("riwayat Invoice Number: kolom No. Invoice paling depan & Amount = Total di invoice cetaknya", async () => {
  const simpan = { e: baca("data.export"), tab: baca("docNumActiveTab") };
  const asli = w.eval("supabaseClient.from");
  try {
    const kirim = { id: "e9", mode: "export", party: "KUMHO", items: [
      { namaBarang: "TYRE MOLD", qty: 1, satuan: "SET", harga: 9918.97, hsCode: "84807190" },
      { namaBarang: "TYRE MOLD", qty: 2, satuan: "SET", harga: 6200, hsCode: "84807190" } ] };
    tulis("data.export", [kirim]);
    const tertaut = { id: "i1", doc_type: "invoice", doc_number: "DDI - CRBM - IX - 059", doc_date: "2026-09-25",
      requester: "Yogi", department: "EXIM", payload: { shipmentId: "e9", customer: "KUMHO TIRE (VIETNAM) CO., LTD" } };
    const lepas = { id: "i2", doc_type: "invoice", doc_number: "DDI - CRBM - IX - 060", doc_date: "2026-09-26",
      requester: "Yogi", department: "EXIM", payload: { customer: "X" } };
    // Sama dengan Total di Commercial Invoice cetak (Dynamic Design & Kumho).
    const v = w.dnNilaiInvoice(tertaut);
    eq(v.mata + " " + v.total.toFixed(2), "USD 22318.97", "nilai:");
    const cetak = w.ciplHalamanInvoice(tertaut, kirim, w.ciplBarisBarang(kirim));
    if (!cetak.includes(w.ciplAngka(v.total, 2))) throw new Error("berbeda dari Total di invoice cetak Dynamic Design");
    if (!w.ciplVnHalamanInvoice(tertaut, kirim).includes(w.ciplAngka(v.total, 2))) throw new Error("berbeda dari Total invoice Kumho");
    eq(w.eval("dnTeksNilaiInvoice")(lepas), "\u2014", "belum ditautkan:");
    // Tabel riwayat.
    w.__barisUji = [tertaut, lepas];
    w.eval(`supabaseClient.from = () => { const c = { select: () => c, eq: () => c, filter: () => c, or: () => c, order: () => c,
      range: async () => ({ data: window.__barisUji, error: null, count: 2 }) }; return c; }`);
    w.eval('docNumActiveTab = "invoice"; docNumHistorySub = null; docNumCari = ""');
    await w.renderDocNumHistory();
    const kepala = [...w.document.querySelectorAll("#docNumHistory thead th")].map((th) => th.textContent.trim());
    eq(kepala[0], "No. Invoice", "kolom paling depan:");
    if (!kepala.includes("Amount")) throw new Error("kolom Amount tidak ada");
    const sel = [...w.document.querySelectorAll("#docNumHistory tbody tr:first-child td")].map((td) => td.textContent.trim());
    eq(sel[0], "DDI - CRBM - IX - 059", "nomor invoice di depan:");
    if (!sel.includes("USD 22,318.97")) throw new Error("Amount tidak tampil: " + sel.join(" | "));
  } finally {
    w.supabaseClient_from_asli = asli;
    w.eval("supabaseClient.from = window.supabaseClient_from_asli");
    tulis("data.export", simpan.e);
    w.eval("docNumActiveTab = " + JSON.stringify(simpan.tab));
  }
});
t("saringan Lunas / Belum Lunas dikirim ke DATABASE, hanya di Pengajuan Dana", async () => {
  const asli = w.eval("supabaseClient.from");
  const simpan = { tab: baca("docNumActiveTab"), sub: baca("docNumHistorySub") };
  const kirim = (tab, bayar) => {
    const catat = [];
    w.__catat = (x) => catat.push(x);
    w.eval(`supabaseClient.from = () => { const c = { select: () => c, eq: () => c, filter: () => c, or: () => c, order: () => c,
      not: (k, op, v) => { window.__catat("not " + k + " " + op + " " + v); return c; },
      is: (k, v) => { window.__catat("is " + k + " " + v); return c; },
      range: async () => ({ data: [], error: null, count: 0 }) }; return c; }`);
    w.eval(`docNumActiveTab = ${JSON.stringify(tab)}; docNumHistorySub = null; docNumCari = ""; docNumSaringBayar = ${JSON.stringify(bayar)}`);
    return w.renderDocNumHistory().then(() => catat.join(" | "));
  };
  try {
    eq(await kirim("fund", "lunas"), "not payload->>paidAt is null", "Lunas:");
    eq(await kirim("fund", "belum"), "is payload->>paidAt null", "Belum Lunas:");
    eq(await kirim("fund", ""), "", "semua:");
    eq(await kirim("invoice", "lunas"), "", "jenis lain tidak disaring:");
    if (!/Tidak ada pengajuan berstatus/.test(await kirim("fund", "belum").then(() => w.document.getElementById("docNumHistory").textContent)))
      throw new Error("pesan kosong tidak menyebut saringannya");
  } finally {
    w.supabaseClient_from_asli = asli;
    w.eval("supabaseClient.from = window.supabaseClient_from_asli; docNumSaringBayar = ''");
    w.eval(`docNumActiveTab = ${JSON.stringify(simpan.tab)}; docNumHistorySub = ${JSON.stringify(simpan.sub)}`);
  }
});
t("pilihan status bayar: tampil di Pengajuan Dana, tersembunyi di Summary & jenis lain; direset saat ganti jenis", () => {
  const wadah = w.document.querySelector(".dn-saring-bayar");
  const simpan = { tab: baca("docNumActiveTab"), sub: baca("docNumHistorySub") };
  try {
    w.eval('docNumActiveTab = "fund"; docNumHistorySub = null'); w.dnTampilkanSaringBayar();
    eq(wadah.classList.contains("d-none"), false, "Pengajuan Dana:");
    w.eval('docNumHistorySub = FSUM_TAB'); w.dnTampilkanSaringBayar();
    eq(wadah.classList.contains("d-none"), true, "tab Summary:");
    w.eval('docNumActiveTab = "invoice"; docNumHistorySub = null'); w.dnTampilkanSaringBayar();
    eq(wadah.classList.contains("d-none"), true, "Invoice:");
    w.showDocNumTab("fund");
    w.eval('docNumSaringBayar = "lunas"'); w.document.getElementById("docNumBayar").value = "lunas";
    w.showDocNumTab("invoice");
    eq(baca("docNumSaringBayar"), "", "direset:");
    eq(w.document.getElementById("docNumBayar").value, "", "pilihan direset:");
  } finally {
    w.showDocNumTab(simpan.tab);
    w.eval(`docNumHistorySub = ${JSON.stringify(simpan.sub)}`);
  }
});
t("ponsel: aturan kotak cari riwayat menang atas aturan dasarnya (tidak meluber keluar layar)", () => {
  /* Aturan dasar .dn-cari input { width: 300px } ada LEBIH BAWAH di
     docnum.css daripada blok ponsel; aturan ponselnya harus lebih khusus,
     bukan setara -- dengan kekhususan setara yang terakhir yang menang. */
  const css = require("fs").readFileSync(require("path").join(__dirname, "..", "css", "docnum.css"), "utf8");
  const ponsel = css.slice(css.indexOf("@media (max-width: 575px)"));
  if (!/\.docnum-history-head \.dn-cari input \{\s*width: 100%;/.test(ponsel)) throw new Error("kotak cari ponsel kalah dari aturan dasar");
  if (!/\.docnum-history-head \.dn-cari \{\s*flex: 1;\s*min-width: 0;/.test(ponsel)) throw new Error("kotak cari ponsel tidak bisa menyusut");
});
t("pungutan impor persis PIB CEISA: per seri, BM ke atas ribuan, PPN ke bawah rupiah, PPh per seri", () => {
  const H = w.hitungPungutanImpor;
  // PIB sungguhan: CIP USD 4.780 (2 seri), NDPBM 17.707, BM 5%.
  const pib = H({ nilaiSeriUsd: [2390, 2390], ndpbm: 17707, tarifBm: 5 });
  eq([pib.nilaiPabean, pib.bm, pib.ppn, pib.pph].join(" | "), "84639460 | 4232000 | 9775857 | 2221750", "PIB:");
  // Per SERI, bukan total: 1 seri dengan nilai yang sama memberi PPh berbeda.
  eq(H({ nilaiSeriUsd: [4780], ndpbm: 17707, tarifBm: 5 }).pph, 2221775, "PPh 1 seri:");
  // Contoh materi PPJK: NP 101.706.000, BM 20%, PPh 7,5%.
  const ppjk = H({ nilaiSeriUsd: [6356.625], ndpbm: 16000, tarifBm: 20, tarifPph: 7.5 });
  eq([ppjk.bm, ppjk.ppn, ppjk.pph].join(" | "), "20342000 | 13425192 | 9153525", "contoh PPJK:");
  // Contoh DDTC: BM 1.506.882,069 -> 1.507.000.
  eq(H({ nilaiSeriUsd: [1506882.069 / 0.05], ndpbm: 1, tarifBm: 5 }).bm, 1507000, "pembulatan BM:");
  // Pecahan biner tidak boleh mendorong BM ke ribuan berikutnya: tepat 1.000 tetap 1.000.
  eq(H({ nilaiSeriUsd: [0.1, 0.2], ndpbm: 20000 / 0.3 * 0.3 / 0.3 * 0.3 / 0.3, tarifBm: 5 }).bm % 1000, 0, "kelipatan ribuan:");
  eq(H({ nilaiSeriUsd: [10000], ndpbm: 2, tarifBm: 5 }).bm, 1000, "tepat seribu tetap seribu:");
  // BM manual dipakai apa adanya dan menjadi dasar PPN.
  const manual = H({ nilaiSeriUsd: [4780], ndpbm: 17707, bmManual: 4232000 });
  eq([manual.bm, manual.ppn].join(" | "), "4232000 | 9775860", "BM manual:");
  eq(H({ nilaiSeriUsd: [], ndpbm: 17707, tarifBm: 5 }).bm, 0, "tanpa barang & ongkos:");
});
t("form jadwal: BM/PPN/PPh terisi otomatis dengan aturan CEISA, dan kotak Tarif dipakai", () => {
  const simpan = w.eval("JSON.stringify(draftItems)");
  const KOTAK = ["fNdpbm", "fFreight", "fInsurance", "fTarif", "fBM", "fPPN", "fPPH"];
  const semula = KOTAK.map((id) => { const el = w.document.getElementById(id); return [el.value, el.dataset.auto]; });
  const nilai = (id) => w.document.getElementById(id).value;
  const isi = (id, v) => { w.document.getElementById(id).value = v; };
  try {
    w.eval(`draftItems = [{ namaBarang: "A", qty: 1, harga: 2390 }, { namaBarang: "B", qty: 1, harga: 2390 }]`);
    isi("fNdpbm", "17707"); isi("fFreight", ""); isi("fInsurance", ""); isi("fTarif", "5");
    ["fBM", "fPPN", "fPPH"].forEach((id) => { isi(id, ""); w.document.getElementById(id).dataset.auto = "1"; });
    w.recalcCustoms();
    eq([nilai("fBM"), nilai("fPPN"), nilai("fPPH")].join(" | "), "4,232,000 | 9,775,857 | 2,221,750", "tarif 5%:");
    isi("fTarif", "10");
    w.recalcCustoms();
    eq(nilai("fBM"), "8,464,000", "tarif 10% (dulu tetap 5%):");
    isi("fTarif", "");
    w.recalcCustoms();
    eq(nilai("fBM"), "4,232,000", "kotak Tarif kosong = 5%:");
  } finally {
    w.eval("draftItems = " + simpan);
    KOTAK.forEach((id, i) => {
      const el = w.document.getElementById(id);
      el.value = semula[i][0];
      if (semula[i][1] == null) delete el.dataset.auto; else el.dataset.auto = semula[i][1];
    });
  }
});
t("jendela Vendor Summary lama sudah tidak ada (digantikan tab Summary)", () => {
  if (w.document.getElementById("btnFundSummary")) throw new Error("tombol Vendor Summary masih ada");
  if (w.document.getElementById("fundSummaryModal")) throw new Error("jendela Vendor Summary masih ada");
});
t("pintas rentang: Bulan Ini & Bulan Lalu menutup bulan penuh", () => {
  const [a, b] = baca("RENTANG_PINTAS").bulanIni();
  const hariIni = new Date();
  eq(a.slice(8), "01", "awal bulan ini:");
  eq(Number(b.slice(8)), new Date(hariIni.getFullYear(), hariIni.getMonth() + 1, 0).getDate(), "akhir bulan ini:");
  const [c, d] = baca("RENTANG_PINTAS").bulanLalu();
  if (!(c < a && d < a)) throw new Error("bulan lalu tidak mendahului bulan ini");
  eq(c.slice(8), "01");
});
t("panel kalender mengambang (fixed) -- tidak terpotong wadah ber-overflow:hidden", () => {
  /* Dengan position:absolute, panelnya terpotong kartu .docnum-shell.
     Saat hasil Summary kosong, isi kartunya pendek dan tombol Reset &
     Terapkan terpotong di luar kartu -- tidak bisa diklik. */
  const akar = w.document.createElement("div");
  w.document.body.appendChild(akar);
  const pem = w.buatRentangTanggal(akar, { pintas: [] });
  try {
    akar.querySelector('[data-rt="pemicu"]').click();
    eq(akar.querySelector('[data-rt="popover"]').style.position, "fixed", "posisi panel:");
    akar.querySelector('[data-rt="terapkan"]').click();
    if (!akar.querySelector('[data-rt="popover"]').classList.contains("d-none"))
      throw new Error("panel tidak tertutup setelah Terapkan");
  } finally {
    pem.lepas();
    akar.remove();
  }
});
t("pemilih rentang instans baru: jalan pintas langsung berlaku", () => {
  const akar = w.document.createElement("div");
  w.document.body.appendChild(akar);
  let diterapkan = null;
  const pem = w.buatRentangTanggal(akar, {
    pintas: [{ label: "Bulan Ini", rentang: baca("RENTANG_PINTAS").bulanIni }],
    onApply: (a, b) => { diterapkan = [a, b]; },
  });
  akar.querySelector("[data-rt-pintas]").click();
  eq(JSON.stringify(diterapkan), JSON.stringify(baca("RENTANG_PINTAS").bulanIni()), "rentang terkirim:");
  eq(JSON.stringify(pem.ambil()), JSON.stringify(baca("RENTANG_PINTAS").bulanIni()), "rentang tersimpan:");
  if (!akar.querySelector("[data-rt-pintas]").classList.contains("is-active"))
    throw new Error("tombol pintas yang aktif tidak menyala");
  akar.remove();
});
t("Report berbahasa Inggris, dibuka sapaan, Export lebih dulu", () => {
  const simpan = { e: baca("data.export"), i: baca("data.import") };
  try {
    tulis("data.export", [{
      id: "e1", mode: "export", party: "KUMHO", package: "8 BOX",
      etd: "2099-10-02", eta: "2099-10-09", actual: "2099-09-30",
      // Nama BERBEDA: nama kembar dihitung satu oleh reportItemNames().
      items: [{ namaBarang: "TYRE MOLD", moldNo: "S08" }, { namaBarang: "TYRE MOLD", moldNo: "S07" }],
    }]);
    tulis("data.import", [{
      id: "i1", mode: "import", party: "SIEMENS", incoterm: "FOB",
      muatan: "LCL", etd: "2099-09-25", eta: "", actual: "",
      items: [{ namaBarang: "MOTOR SENSOR" }],
    }]);
    const teks = w.buildReportCopyText();
    const baris = teks.split("\n");
    eq(baris[0], "Dear Mr Shin,", "baris pertama:");
    eq(baris[2], "Please find schedule for Export and Import as below", "pengantar:");
    if (teks.indexOf("EXPORT") > teks.indexOf("IMPORT"))
      throw new Error("Export harus mendahului Import, sesuai kalimat pengantarnya");
    /* Tidak boleh ada sisa bahasa Indonesia -- label maupun nama bulan. */
    ["Estimasi", "Perkiraan", "Tanggal Tidak", "Oktober", "Desember", "Agustus"]
      .forEach((k) => { if (teks.includes(k)) throw new Error("masih berbahasa Indonesia: " + k); });
    if (!/Estimated Stuffing: 30 September 2099/.test(teks)) throw new Error("label/tanggal Export salah");
    if (!/ETA: TBA/.test(teks)) throw new Error("tanggal kosong harus TBA");
    if (!/\+ 1 Item\b/.test(teks) || /\+ 1 Items/.test(teks))
      throw new Error("tunggal-jamak salah: harus '+ 1 Item'");
    // Versi HTML (surel) memakai sapaan yang sama.
    const html = w.buildReportCopyHtml();
    if (!html.includes("Dear Mr Shin,") || !html.includes("Please find schedule for Export and Import as below"))
      throw new Error("versi HTML tidak memuat sapaan yang sama");
  } finally {
    tulis("data.export", simpan.e);
    tulis("data.import", simpan.i);
  }
});
t("Report kosong tidak menulis sapaan tanpa isi", () => {
  const simpan = { e: baca("data.export"), i: baca("data.import") };
  try {
    tulis("data.export", []);
    tulis("data.import", []);
    eq(w.buildReportCopyText(), "", "teks:");
    eq(w.buildReportCopyHtml(), "", "html:");
  } finally {
    tulis("data.export", simpan.e);
    tulis("data.import", simpan.i);
  }
});
console.log("\u2014 BAHASA INGGRIS: SELURUH TAMPILAN \u2014");
t("tt() mengikuti bahasa aktif, dan data-en berganti bolak-balik", () => {
  const simpan = baca("activeLang");
  try {
    w.eval('activeLang = "en"');
    eq(w.tt("Simpan", "Save"), "Save");
    eq(w.tt("{n} hari", "{n} days", { n: 3 }), "3 days", "dengan pengganti:");
    const el = w.document.createElement("span");
    el.setAttribute("data-en", "Save");
    el.textContent = "Simpan";
    w.document.body.appendChild(el);
    w.applyI18n();
    eq(el.textContent, "Save", "ke Inggris:");
    w.eval('activeLang = "id"');
    w.applyI18n();
    eq(el.textContent, "Simpan", "kembali ke Indonesia:");
    el.remove();
  } finally {
    w.eval("activeLang = " + JSON.stringify(simpan));
    w.applyI18n();
  }
});
t("tidak ada t(...) yang tertulis mentah di atribut HTML", () => {
  /* Bug lama: title=t("a.ubah.nama.username") -- tanpa ${...} fungsinya
     tidak pernah dijalankan dan tooltip-nya menampilkan kode mentah di
     KEDUA bahasa. */
  const fs = require("fs"), path = require("path");
  const akar = path.join(__dirname, "..", "js");
  const salah = [];
  (function jelajah(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return jelajah(p);
      if (!p.endsWith(".js")) return;
      const s = fs.readFileSync(p, "utf8");
      if (/\b(?:title|placeholder|aria-label)=t\(/.test(s)) salah.push(path.relative(akar, p));
    });
  })(akar);
  if (salah.length) throw new Error("t() mentah di atribut: " + salah.join(", "));
});
t("label yang dibuat sekali saat dimuat tetap ikut ganti bahasa", () => {
  /* Peta label (Detail nomor dokumen, langkah dokumen, konfigurasi
     prediksi) dievaluasi SEKALI saat halaman dimuat. Tanpa getter,
     ganti bahasa tidak mengubahnya sampai halaman dimuat ulang. */
  const simpan = baca("activeLang");
  try {
    w.eval('activeLang = "en"');
    eq(baca("DN_LABEL_FIELD").payee, "Paid To", "label Detail:");
    eq(baca("DN_KOLOM_UTAMA").fund, "Paid To", "kolom riwayat:");
    const sppb = w.docStepsFor({ mode: "import" }).find((x) => x.key === "sppb");
    eq(w.stepText(sppb.full, {}), "Goods Release Approval (SPPB)", "langkah dokumen:");
    eq(baca("PREDICTION_SOURCE_LABEL").today, "Today", "sumber prediksi:");
    w.eval('activeLang = "id"');
    eq(baca("DN_LABEL_FIELD").payee, "Dibayarkan Kepada", "kembali ke Indonesia:");
  } finally {
    w.eval("activeLang = " + JSON.stringify(simpan));
  }
});
t("jenis barang: teks pilihan diterjemahkan, NILAI tersimpan tidak", () => {
  const simpan = baca("activeLang");
  try {
    w.eval('activeLang = "en"');
    eq(w.labelJenisBarang("BAHAN BAKU"), "RAW MATERIAL");
    // Nilai pilihan tetap istilah pabean -- itu yang tersimpan & dicetak.
    const opsi = w.jenisOptionsUntuk("BAHAN BAKU");
    if (!opsi.includes("BAHAN BAKU")) throw new Error("nilai tersimpan ikut berubah");
  } finally {
    w.eval("activeLang = " + JSON.stringify(simpan));
  }
});
t("tidak ada CSS yang hidup di dalam index.html", () => {
  /* Gaya yang tersebar sebagai atribut style="" tidak bisa ditimpa
     lembar gaya mana pun (kecuali !important), tidak ikut terbaca saat
     mencari "di mana lebar kolom ini diatur", dan tidak bisa diberi
     media query. Semuanya sudah dipindah ke berkas css/ -- uji ini
     menjaganya supaya tidak merembes balik sedikit demi sedikit. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "index.html"), "utf8");
  const sebaris = src.match(/\sstyle="[^"]*"/g) || [];
  if (sebaris.length)
    throw new Error(`${sebaris.length} atribut style tersisa: ` + sebaris.slice(0, 3).join(" | "));
  if (/<style[\s>]/i.test(src))
    throw new Error("masih ada blok <style> di dalam HTML");
});
t("fungsi terjemahan tidak tertutupi variabel lokal bernama sama", () => {
  /* Parameter bernama `t` menutupi fungsi terjemahan global; karena
     pemanggilnya asinkron, TypeError-nya cuma muncul di konsol tanpa
     ada yang gagal terang-terangan. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  const salah = [...src.matchAll(/function\s+\w+\s*\(([^)]*)\)/g)]
    .map((m) => m[1].split(",").map((x) => x.trim()))
    .filter((par) => par.includes("t"));
  if (salah.length)
    throw new Error("ada fungsi berparameter `t`: " + JSON.stringify(salah));
});
t("surat jalan Export & Lokal memakai SERI NOMOR yang terpisah", () => {
  /* key berbeda = urutan nomor berjalan sendiri-sendiri; nomor Lokal
     tidak memakan jatah nomor Export. */
  const subs = baca("DOCNUM_SUBTYPES").do;
  eq(subs.Export.key, "do");
  eq(subs.Lokal.key, "do_lokal");
  if (subs.Export.pattern === subs.Lokal.pattern)
    throw new Error("pola nomornya sama -- seharusnya berbeda bentuk");
  if (!/EXIM-LOG/.test(subs.Lokal.pattern))
    throw new Error("pola Lokal tidak sesuai contoh 20/EXIM-LOG/IX/2026");
});
t("membuka nomor sub-jenis lain MEMINDAHKAN deret nomornya sekaligus", async () => {
  /* Menyetel .value lewat kode tidak memicu `change`, jadi pendengar
     yang menyegarkan pratinjau tidak berjalan sendiri. Kalau tidak
     dipanggil manual, membuka satu nomor Surat Jalan LOKAL
     meninggalkan panel "Atur Nomor Urut" menunjuk deret EXPORT --
     dan nomor yang disetel di sana mendarat di deret yang salah. */
  const simpanTab = baca("docNumActiveTab");
  w.eval('authState.profile = { id: "u1", role: "exim" }');
  try {
    w.eval('docNumActiveTab = "do"');
    const panel = w.docNumPanelEl("do");
    panel.querySelector("[data-dn-subtype]").value = "Export";
    await w.refreshDocNumPreview("do");
    eq(w.eval("counterCtx.typeKey"), "do", "deret sebelum dibuka:");

    tulis("docNumHistoryRows", [{
      id: "lk1", doc_type: "do_lokal", doc_number: "028/EXIM-LOG/IX/2026",
      doc_date: "2026-09-20", requester: "Uji", seq: 28,
      payload: { doKind: "Lokal", receiver: "PT A" },
    }]);
    w.mulaiUbahDocNum("lk1");
    await new Promise((r) => setTimeout(r, 30));
    eq(panel.querySelector("[data-dn-subtype]").value, "Lokal", "sub-jenis form:");
    eq(w.eval("counterCtx.typeKey"), "do_lokal", "deret sesudah dibuka:");
  } finally {
    w.batalUbahDocNum();
    w.eval("docNumActiveTab = " + JSON.stringify(simpanTab));
  }
});
t("tab sub-jenis ikut memindahkan deret nomor di form", async () => {
  /* Dua penunjuk deret yang bisa berselisih -- tab riwayat menunjuk
     Lokal sementara form & panel nomor urut masih Export -- membuat
     "sedang menyetel yang mana" jadi soal tebakan. */
  const simpanTab = baca("docNumActiveTab");
  try {
    w.eval('docNumActiveTab = "do"');
    const panel = w.docNumPanelEl("do");
    const sel = panel.querySelector("[data-dn-subtype]");
    sel.value = "Export";
    await w.refreshDocNumPreview("do");

    const tombol = w.document.createElement("button");
    tombol.setAttribute("data-dn-subtab", "Lokal");
    w.document.body.appendChild(tombol);
    tombol.click();
    await new Promise((r) => setTimeout(r, 30));
    tombol.remove();

    eq(sel.value, "Lokal", "sub-jenis form ikut tab:");
    eq(w.eval("counterCtx.typeKey"), "do_lokal", "deret nomor:");
  } finally {
    w.eval("docNumHistorySub = null");
    w.eval("docNumActiveTab = " + JSON.stringify(simpanTab));
  }
});
t("jawaban pratinjau yang kedaluwarsa tidak boleh menang", async () => {
  /* Berganti sub-jenis dua kali beruntun melepas dua permintaan yang
     tidak saling menunggu; yang datang terakhir belum tentu yang
     terakhir diminta. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  if (!/dnPratinjauKe/.test(src))
    throw new Error("tidak ada penjaga urutan permintaan pratinjau");
  if (!/nomorMinta !== dnPratinjauKe/.test(src))
    throw new Error("jawaban kedaluwarsa tidak dibuang");
});
t("Non-Commercial Invoice bisa dibuka untuk diperbaiki", () => {
  w.eval('authState.profile = { id: "u1", role: "exim" }');
  tulis("docNumHistoryRows", [{
    id: "nc1", doc_type: "invoice_nc", doc_number: "DDI-025/2026-VII-EXIM-LOG",
    doc_date: "2026-07-14", requester: "Uji",
    payload: { invoiceKind: "Non-Commercial", poNo: "PO-NC" },
  }]);
  w.mulaiUbahDocNum("nc1");
  eq(w.eval("dnEditingId"), "nc1");
  const panel = w.docNumPanelEl("invoice");
  eq(panel.querySelector('[data-dn="poNo"]').value, "PO-NC");
  // Dropdown sub-jenis dikembalikan, bukan tertinggal di Commercial
  eq(panel.querySelector("[data-dn-subtype]").value, "Non-Commercial");
  w.batalUbahDocNum();
});

console.log("— TOMBOL EDIT: JALUR KLIK —");
t("klik tombol pensil memicu mode perbaikan", () => {
  w.eval('authState.profile = { id: "u1", role: "exim" }');
  tulis("docNumHistoryRows", [{
    id: "k1", doc_type: "invoice", doc_number: "INV-KLIK", doc_date: "2026-08-05",
    requester: "Uji", payload: { poNo: "PO-KLIK" },
  }]);
  const wadah = $("#docNumHistory");
  if (!wadah) throw new Error("#docNumHistory tidak ada di DOM");
  wadah.innerHTML =
    '<button type="button" data-edit-num="k1"><i class="bi bi-pencil"></i></button>';
  wadah.querySelector("[data-edit-num] i").dispatchEvent(
    new w.MouseEvent("click", { bubbles: true }),
  );
  eq(w.eval("dnEditingId"), "k1");
  eq(w.docNumPanelEl("invoice").querySelector('[data-dn="poNo"]').value, "PO-KLIK");
  w.batalUbahDocNum();
});

console.log("— PERBAIKI ISIAN NOMOR —");
/* Perbaikan hanya boleh oleh peran EXIM — harness belum login, jadi
   perannya dipasang dulu. Kalau tidak, yang teruji cuma penolakannya. */
w.eval('authState.profile = { id: "u1", role: "exim", full_name: "Uji" }');
t("Viewer tidak boleh memperbaiki", () => {
  w.eval('authState.profile = { id: "u1", role: "viewer" }');
  eq(w.bolehUbahDocNum(), false);
  w.eval('authState.profile = { id: "u1", role: "exim" }');
  eq(w.bolehUbahDocNum(), true);
});
t("membuka perbaikan mengisi form dari barisnya", () => {
  tulis("docNumHistoryRows", [{
    id: "e1", doc_type: "invoice", doc_number: "DDI-CRBM-VIII-040",
    doc_date: "2026-08-05", requester: "Yogi Firgiawan", department: "EXIM",
    payload: { customer: "DYNAMIC DESIGN CO., LTD.", poNo: "DD-260724-DDI-01",
      termsDelivery: "FOB", amount: 30062 },
  }]);
  w.mulaiUbahDocNum("e1");
  const panel = w.docNumPanelEl("invoice");
  eq(panel.querySelector('[data-dn="requester"]').value, "Yogi Firgiawan");
  eq(panel.querySelector('[data-dn="poNo"]').value, "DD-260724-DDI-01");
  eq(panel.querySelector('[data-dn="termsDelivery"]').value, "FOB");
  eq(w.eval("dnEditingId"), "e1");
});
t("tombol berubah & spanduk menyebut nomornya", () => {
  if (!$("#btnDocNumSubmit").innerHTML.includes("Simpan Perubahan"))
    throw new Error("tombol masih Ajukan Nomor");
  eq($("#dnEditBanner").classList.contains("d-none"), false);
  eq($("#dnEditBannerNum").textContent, "DDI-CRBM-VIII-040");
});
t("batal mengembalikan form ke mode pengajuan", () => {
  w.batalUbahDocNum();
  eq(w.eval("dnEditingId"), null);
  eq($("#dnEditBanner").classList.contains("d-none"), true);
  if (!$("#btnDocNumSubmit").innerHTML.includes("Ajukan Nomor"))
    throw new Error("tombol tidak kembali");
});
t("berpindah jenis dokumen membatalkan perbaikan", () => {
  w.mulaiUbahDocNum("e1");
  eq(w.eval("dnEditingId"), "e1");
  w.showDocNumTab("do");
  eq(w.eval("dnEditingId"), null);
  if (!$("#btnDocNumSubmit").innerHTML.includes("Ajukan Nomor"))
    throw new Error("tombol tidak kembali setelah pindah tab");
  w.showDocNumTab("invoice");
});
t("PENJAGA: kueri riwayat mengambil doc_type", () => {
  /* Akar bug "edit Surat Jalan malah membuka Invoice": kolomnya tidak
     ikut di-SELECT, jadi tiap baris punya doc_type undefined dan
     pemetaan tab jatuh ke tab bawaan. */
  const src = w.eval("renderDocNumHistory.toString()");
  if (!/"id, doc_type,/.test(src))
    throw new Error("doc_type tidak ikut diambil kueri riwayat");
});
t("baris tanpa doc_type diperbaiki di tab yang SEDANG dibuka", () => {
  // Persis bentuk data yang dikembalikan kueri sebelum diperbaiki
  w.showDocNumTab("do");
  tulis("docNumHistoryRows", [{
    id: "x9", doc_number: "021/DDI/EXIM-LOG/VIII/2026", doc_date: "2026-08-05",
    requester: "Uji", payload: { vehicle: "B 1234 XX" },
  }]);
  w.mulaiUbahDocNum("x9");
  eq(w.eval("docNumActiveTab"), "do");        // dulu melompat ke "invoice"
  eq(w.docNumPanelEl("do").querySelector('[data-dn="vehicle"]').value, "B 1234 XX");
  w.batalUbahDocNum();
  w.showDocNumTab("invoice");
});
t("surat jalan juga bisa diperbaiki", () => {
  tulis("docNumHistoryRows", [{
    id: "e2", doc_type: "do", doc_number: "021/DDI/EXIM-LOG/VIII/2026",
    doc_date: "2026-08-05", requester: "Yogi Firgiawan",
    payload: { receiver: "PT. WIDE LOGISTICS", vehicle: "B 9760 URU" },
  }]);
  w.mulaiUbahDocNum("e2");
  eq(w.eval("docNumActiveTab"), "do");
  const panel = w.docNumPanelEl("do");
  eq(panel.querySelector('[data-dn="vehicle"]').value, "B 9760 URU");
  w.batalUbahDocNum();
});

console.log("— DETAIL: MATA UANG PADA NILAI —");
t("Nilai diberi lambang mata uangnya", () => {
  tulis("docNumHistoryRows", [
    { id: "n1", doc_number: "INV-1", doc_date: "2026-08-05",
      payload: { amount: 30062, currency: "USD" } },
    { id: "n2", doc_number: "INV-2", doc_date: "2026-08-05",
      payload: { amount: 5000000, currency: "IDR" } },
  ]);
  w.tampilkanDetailNomor("n1");
  let h = $("#promptFields").innerHTML;
  if (!h.includes("$30.062") && !h.includes("$30,062"))
    throw new Error("lambang $ tidak muncul: " + h.slice(0, 200));
  w.tampilkanDetailNomor("n2");
  h = $("#promptFields").innerHTML;
  if (!/Rp\s?5/.test(h)) throw new Error("lambang Rp tidak muncul");
});

console.log("— CIPL: TIDAK ADA GARIS GANDA —");
t("PENJAGA: tidak ada backtick di dalam CSS cetak", () => {
  /* Seluruh CSS cetak berada di dalam satu template literal. Backtick
     di komentarnya memutus literalnya dan berkasnya gagal diurai.
     Sudah TIGA kali terjadi — dan yang ketiga di berkas yang belum
     ikut dijaga, jadi penjaganya sekarang menutup semua pembangun CSS
     cetak sekaligus. */
  ["ciplCss", "suratJalanCss"].forEach((fn) => {
    const src = w.eval(fn + ".toString()");
    eq((src.match(/`/g) || []).length, 2, fn + ":");
  });
});
t("garis tabel digambar dengan cara yang sama seperti garis elemen", () => {
  /* border-collapse menaruh garis TEPAT DI ATAS batas antar sel —
     separuh di tiap sisi — sehingga ia mendarat di tengah piksel dan
     dihaluskan jadi dua piksel setengah-terang. Border elemen
     tergambar penuh di dalam elemennya. Dua cara bercampur = garis
     yang terbaca berbeda ketebalan. */
  const css = w.ciplCss();
  if (!/border-collapse: separate/.test(css))
    throw new Error("masih memakai border-collapse: collapse");
  if (!/border-spacing: 0/.test(css))
    throw new Error("tanpa border-spacing: 0 akan muncul celah antar sel");
});
t("PENJAGA: sel hanya menggambar ATAS dan KIRI", () => {
  /* Satu batas, satu pemilik. Begitu ada sel yang menggambar kanan
     atau bawah, batas itu punya dua pemilik dan jadi garis ganda. */
  const css = w.ciplCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const aturanItems = [...css.matchAll(/(\.ci-[^{}]*)\{([^}]*)\}/g)].filter(
    (m) => /\.ci-items|\.ci-fill|\.ci-foot-empty|\.ci-pkg-total|\.ci-sign/.test(m[1]),
  );
  aturanItems.forEach((m) => {
    const gambar = (m[2].match(/border-(right|bottom): var\(--ci-line\)/g) || []);
    // Hanya kotak tanda tangan yang boleh menutup sisi bawahnya
    if (gambar.length && !/ci-sign-cell/.test(m[1])) {
      throw new Error(m[1].trim() + " menggambar " + gambar.join(", "));
    }
  });
});
t("tepi kiri tabel diambil alih bingkai kotak", () => {
  if (!/\.ci-items tr > td:first-child \{ border-left: 0/.test(w.ciplCss()))
    throw new Error("tepi kiri tergambar dua kali");
});
t("garis penutup baris barang terakhir tidak hilang", () => {
  /* Di bawah konvensi atas+kiri, penutup baris terakhir digambar oleh
     ruang kosong DI BAWAHNYA — bukan oleh baris barangnya sendiri. */
  const css = w.ciplCss();
  if (/\.ci-fill td \{ border: 0/.test(css))
    throw new Error("ruang kosong menghapus garis penutup baris barang");
  if (!/\.ci-fill td \{ border-left: 0/.test(css))
    throw new Error("ruang kosong masih berkolom");
});
t("kotak tanda tangan menggambar garis atasnya sendiri", () => {
  // Baris Total tidak lagi menutup sisi bawahnya, jadi pemiliknya pindah
  const css = w.ciplCss();
  if (!/\.ci-sign-row \.ci-sign-cell \{\s*border-top: var\(--ci-line\)/.test(css))
    throw new Error("garis di atas Signed by hilang");
});
t("judul tabel tidak menambah garis di atas blok pengangkutan", () => {
  if (!/\.ci-items thead th \{ border-top: 0/.test(w.ciplCss()))
    throw new Error("garis atas tabel masih ganda");
});
t("PENJAGA: seluruh garis memakai SATU nilai", () => {
  /* Ketebalan yang ditulis terpisah di banyak tempat akan berbeda
     cepat atau lambat — dan hasilnya garis yang compang-camping. */
  const css = w.ciplCss();
  const literal = [...css.matchAll(/([\d.]+(?:pt|px)) solid/g)].map((m) => m[1]);
  eq([...new Set(literal)].join(","), "1px");   // hanya definisi variabelnya
  eq(literal.length, 1);
  if (!/--ci-line: 1px solid/.test(css)) throw new Error("variabel garis hilang");
});
t("setiap border memakai variabel itu, bukan angkanya sendiri", () => {
  const css = w.ciplCss();
  const pakaiVar = (css.match(/var\(--ci-line\)/g) || []).length;
  if (pakaiVar < 10) throw new Error("baru " + pakaiVar + " border yang memakai variabel");
  // Tidak boleh ada border dengan angka ditulis langsung
  const langsung = css.match(/border[^:]*:\s*[\d.]+(?:pt|px) solid/g) || [];
  eq(langsung.length, 0);
});
t("lebar kolom tabel barang dipatok pasti", () => {
  if (!/\.ci-items \{ table-layout: fixed/.test(w.ciplCss()))
    throw new Error("lebar kolom masih dihitung dari isinya");
});

console.log("— CIPL: LEBAR KOLOM —");
t("nilai CBM tidak boleh membungkus dari satuannya", () => {
  /* nowrap berlaku untuk SEMUA kolom; hanya nama barang yang
     dikecualikan. Jadi yang dipastikan: sel CBM memakai kelasnya
     sendiri (bukan kelas nama barang) dan tetap satu baris. */
  const h = w.ciplHalamanPacking(rowPL, jadwalCipl, barisCipl());
  eq((h.match(/ci-num ci-cbm/g) || []).length, 3);
  if (/ci-cbm[^"]*ci-item/.test(h))
    throw new Error("sel CBM ikut dikecualikan seperti nama barang");
});
t("dimensi dirapatkan agar muat satu baris", () => {
  const css = w.ciplCss();
  if (!/\.ci-items td\.ci-dim \{[^}]*letter-spacing: -/.test(css))
    throw new Error("letter-spacing dimensi belum dikurangi");
  const blok = css.slice(css.indexOf(".ci-items td.ci-dim"));
  if (/white-space: normal/.test(blok.slice(0, blok.indexOf("}"))))
    throw new Error("dimensi masih boleh membungkus");
});

console.log("— CIPL: DESIMAL HANYA UNTUK PECAHAN —");
t("bulat tanpa desimal, pecahan dengan 2 desimal", () => {
  eq(w.ciplAngka(10490), "10,490");
  eq(w.ciplAngka(30062), "30,062");
  eq(w.ciplAngka(1300), "1,300");
  eq(w.ciplAngka(0.44), "0.44");
  eq(w.ciplAngka(10490.5), "10,490.50");
});
t("berat pecahan tidak lagi dibulatkan", () => {
  // Bawaan lama 0 desimal membuat 14,6 kg tercetak 15
  eq(w.ciplAngka(14.6), "14.60");
  eq(w.ciplAngka(280), "280");
});
t("CBM tetap 3 desimal", () => {
  eq(w.ciplAngka(0.531441, 3), "0.531");
  eq(w.ciplAngka(2.125764, 3), "2.126");
  eq(w.ciplAngka(2, 3), "2");        // bulat tetap tanpa desimal
});
t("sisa pecahan mikroskopis dianggap bulat", () => {
  // 0,1 + 0,2 = 0,30000000000000004 dalam biner
  eq(w.ciplAngka(0.1 + 0.2 + 0.7), "1");
  eq(w.ciplAngka(4 * 0.531441 - 0.125764, 3), "2");
});
t("halaman invoice memakai aturan yang sama", () => {
  const row = { id: "d9", doc_number: "X", doc_date: "2026-08-03",
    payload: { currency: "USD" } };
  const h = w.ciplHalamanInvoice(row, jadwalCipl, barisCipl());
  if (h.includes("10,490.00")) throw new Error("masih menulis desimal untuk bilangan bulat");
  if (!h.includes("10,490")) throw new Error("harga satuan hilang");
  if (!h.includes("30,062")) throw new Error("total hilang");
});
t("harga pecahan tetap utuh di cetakan", () => {
  const jadwal = { ...jadwalCipl, items: [
    { namaBarang: "SPRING VENT", hsCode: "84814000", qty: 60000, satuan: "EA",
      harga: 0.44, netto: 19.2, bruto: 19.5, package: "46*24*14", packing: "1 BOX" } ] };
  const row = { id: "d10", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanInvoice(row, jadwal, w.ciplBarisBarang(jadwal));
  if (!h.includes("0.44")) throw new Error("harga pecahan dibulatkan");
  if (!h.includes("26,400")) throw new Error("amount salah");
});

console.log("— CIPL: TATA LETAK & ISIAN OTOMATIS —");
t("ruang kosong satu blok, bukan grid kotak", () => {
  const row = { id: "d5", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanInvoice(row, jadwalCipl, barisCipl());
  eq((h.match(/ci-fill/g) || []).length, 1);
  if (/ci-blank/.test(h)) throw new Error("masih menggambar baris kosong bergaris");
});
t("baris pengisi SELALU ada & tanpa tinggi tetap -- memanjang lewat CSS", () => {
  const h = w.ciplRuangKosongHtml(10);
  eq((h.match(/<td><\/td>/g) || []).length, 10, "jumlah sel:");
  if (/height:/.test(h)) throw new Error("pengisi masih bertinggi tetap");
  // Juga pada daftar barang yang panjang -- tanpa pengisi, sisa tinggi
  // halaman dibagikan ke baris-baris barang.
  const row = { id: "d5b", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const banyak = Array.from({ length: 25 }, () => barisCipl()[0]);
  if (!/ci-fill/.test(w.ciplHalamanInvoice(row, jadwalCipl, banyak))) throw new Error("pengisi hilang saat barang banyak");
});
t("cetak CIPL: bingkai setinggi kertas, jarak bawah = jarak atas (Dynamic Design & Kumho)", () => {
  const css = w.ciplCss();
  if (!/\.ci-sheet \{ width: 210mm; padding: 19\.05mm 6\.35mm; \}/.test(css)) throw new Error("lembar tidak selebar kertas");
  if (!/min-height: calc\(297mm - 38\.1mm - 2px\)/.test(css.split(".ci-sheet:not(.si-sheet) > .ci-box")[1] || ""))
    throw new Error("bingkai Invoice/PL tidak setinggi bidang cetak");
  if (!/\.ci-items tr\.ci-fill td \{ height: 100%; \}/.test(css)) throw new Error("pengisi tidak memanjang");
  // Total & tanda tangan di <tbody> yang sama dengan barang: tidak terulang di
  // tiap halaman (tfoot), dan tidak ikut membengkak (kelompok baris terpisah).
  const rowCi = { id: "d5c", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  [w.ciplHalamanInvoice(rowCi, jadwalCipl, barisCipl()), w.ciplHalamanPacking(rowCi, jadwalCipl, barisCipl())].forEach((h) => {
    if (/<tfoot/.test(h)) throw new Error("Total masih di <tfoot>");
    const badan = h.slice(h.indexOf('<tbody>', h.indexOf('class="ci-items')), h.lastIndexOf("</tbody>"));
    if (!/ci-total-row/.test(badan) || !/ci-sign-row/.test(badan)) throw new Error("Total/tanda tangan tidak di tbody barang");
  });
  const vn = w.ciplVnCss();
  if (!/padding: 14\.8mm 13\.7mm 14\.8mm 12\.9mm;/.test(vn)) throw new Error("jarak bawah Kumho tidak sama dengan atasnya");
  if (/vn-sheet--pl/.test(vn)) throw new Error("jarak bawah khusus Packing List masih ada");
});
t("kotak tanda tangan muat stempel perusahaan: 50 mm di kertas (cetak & Excel, kedua format)", () => {
  if (!/\.ci-sign-space \{ height: 45\.6mm; \}/.test(w.ciplCss())) throw new Error("kotak cetak Dynamic Design");
  if (!/\.vn-akhir-ttd \{[\s\S]*?height: 50mm;/.test(w.ciplVnCss())) throw new Error("kotak cetak Kumho");
  eq(baca("XLS_TTD_MM"), 50, "Excel:");
  // Tinggi baris dihitung dari skala cetaknya, jadi di KERTAS tepat 50 mm.
  const lebar = [4.5703125, 22.140625, 30.5703125, 18.28515625, 6.42578125, 5, 7.140625, 10, 7, 10.85546875];
  const baris = {};
  const ws = {
    pageSetup: { printArea: "A1:J50", margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75 } },
    getRow: (r) => (baris[r] = baris[r] || {}),
    getColumn: (c) => ({ width: lebar[c - 1] }),
  };
  w.ciplXlsTinggiTercetak(ws, 47, 50, 50);
  const pt = [47, 48, 49, 50].reduce((s, r) => s + baris[r].height, 0);
  const mm = (pt * w.ciplXlsSkalaCetak(ws)) / 72 * 25.4;
  if (Math.abs(mm - 50) > 0.2) throw new Error("tercetak " + mm.toFixed(2) + " mm");
});
t("Excel CIPL: selalu ada baris kosong di atas Total; 15 barang ke bawah tidak bergeser", () => {
  eq(w.ciplXlsBarisTotal(8), 46, "8 barang:");
  eq(w.ciplXlsBarisTotal(15), 46, "15 barang:");
  eq(w.ciplXlsBarisTotal(16), 47, "16 barang (dulu 46, tanpa baris kosong):");
});
t("Excel CIPL: tinggi isi dipas dengan skala cetaknya -> setinggi kertas A4", () => {
  // Lembar tiruan: 10 kolom selebar lembar INVOICE, 51 baris 15pt, margin Narrow.
  const lebar = [4.5703125, 22.140625, 30.5703125, 18.28515625, 6.42578125, 5, 7.140625, 10, 7, 10.85546875];
  const baris = {};
  const ws = {
    pageSetup: { printArea: "A1:J50", margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75 } },
    properties: { defaultRowHeight: 15 },
    getRow: (r) => (baris[r] = baris[r] || {}),
    getColumn: (c) => ({ width: lebar[c - 1] }),
  };
  const tambah = w.ciplXlsPenuhiHalaman(ws, 45);
  if (!(tambah > 0)) throw new Error("tidak ada tinggi yang ditambahkan");
  let tinggi = 0;
  for (let r = 1; r <= 50; r++) tinggi += baris[r].height || 15;
  const lebarPt = lebar.reduce((s, x) => s + w.ciplXlsKolomPt(x), 0);
  const skala = Math.min(1, (595.28 - 36) / lebarPt);
  const tercetakMm = (tinggi * skala) / 72 * 25.4;
  const bidangMm = (841.89 - 108) / 72 * 25.4;
  if (Math.abs(tercetakMm - bidangMm) > 1) throw new Error(`tinggi tercetak ${tercetakMm.toFixed(1)} mm, bidang ${bidangMm.toFixed(1)} mm`);
  // Lebar kolom saat dicetak memakai lebar angka Calibri yang sebenarnya.
  if (Math.abs(w.ciplXlsKolomPt(10) - 10 * 7.4336 * 0.75) > 0.01) throw new Error("konversi lebar kolom");
});
t("tanda tangan jadi baris tabel, segaris dengan Total", () => {
  const row = { id: "d6", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanInvoice(row, jadwalCipl, barisCipl());
  if (!h.includes("ci-sign-cell")) throw new Error("kotak tanda tangan hilang");
  if (h.includes("<table class=\"ci-sign\">")) throw new Error("masih tabel terpisah");
});
t("Sailing on or about dikosongkan, tidak diambil dari ETD", () => {
  const row = { id: "d7", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const h = w.ciplHalamanInvoice(row, jadwalCipl, barisCipl());
  // jadwalCipl.etd = 2026-08-10 -> tidak boleh muncul
  if (h.includes("10 Aug 2026")) throw new Error("ETD bocor ke Sailing");
});
t("sailing tetap tercetak kalau diisi manual", () => {
  const row = { id: "d8", doc_number: "X", doc_date: "2026-08-03",
    payload: { sailingDate: "2026-08-12" } };
  const h = w.ciplHalamanInvoice(row, jadwalCipl, barisCipl());
  if (!h.includes("12 Aug 2026")) throw new Error("sailing manual tidak tercetak");
});
t("alamat buyer yang dikenal terisi otomatis", () => {
  const a = w.ciplAlamatBuyer("DYNAMIC DESIGN CO., LTD.");
  if (!a.includes("Cheomdanyeonsin")) throw new Error("alamat tidak ketemu");
  // Tanda baca & huruf besar tidak menghalangi
  eq(w.ciplAlamatBuyer("Dynamic Design Co Ltd"), a);
});
t("buyer tak dikenal -> kosong, bukan ditebak", () =>
  eq(w.ciplAlamatBuyer("PT ENTAH SIAPA"), ""));

console.log("— PPH 0 HARUS BERTAHAN —");
t("nol ditulis apa adanya, tidak jadi kotak kosong", () => {
  /* formatNumberValue(0) mengembalikan "" — dan kotak kosong dianggap
     "belum diisi", lalu diisi ulang otomatis. Itu sebabnya PPH yang
     disetel 0 kembali terisi tiap jadwal dibuka. */
  eq(w.nilaiPungutan(0), "0");
  eq(w.formatNumberValue(0), "");          // pembanding: perilaku umum
  eq(w.nilaiPungutan(null), "");           // belum pernah diisi -> kosong
  eq(w.nilaiPungutan(undefined), "");
  eq(w.nilaiPungutan(11966527), w.formatNumberValue(11966527));
});
t("kotak berisi 0 dianggap MANUAL, bukan belum diisi", () => {
  $("#fPPH").value = "0";
  $("#fPPN").value = "";
  w.initAutoDutyFlags();
  eq($("#fPPH").dataset.auto, "0", "PPH 0 harus manual:");
  eq($("#fPPN").dataset.auto, "1", "PPN kosong harus otomatis:");
});
t("PPH 0 tidak ditimpa hitungan otomatis", () => {
  $("#fPPH").value = "0";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  eq($("#fPPH").value, "0");
});

console.log("— SARAN MASKAPAI & PELAYARAN DI KOTAK NAMA KAPAL —");
{
  const isiCarrier = () => ["Laut", "Udara"].forEach((m) => {
    const dl = w.document.getElementById("carrierList" + m);
    if (dl) dl.innerHTML = w.carrierDatalistHtml(m.toLowerCase());
  });
  const pilihModa = (moda) => {
    isiCarrier();
    $("#fTransport").value = moda;
    w.applyTransportLabels();
    return $("#fVessel");
  };

  t("kotak Nama Kapal/Pesawat punya saran", () => {
    /* Daftar carrier sudah lama ada di carrier-master.js, tapi cuma
       dipakai untuk MENGENALI nama yang diketik — tidak pernah
       ditawarkan. Orang harus hafal bahwa SQ itu Singapore Airlines,
       dan yang salah ketik satu huruf tidak terdeteksi sama sekali:
       prediksinya diam-diam turun ke angka rata-rata. */
    const el = pilihModa("laut");
    const dl = w.document.getElementById(el.getAttribute("list"));
    if (!dl || !dl.querySelectorAll("option").length)
      throw new Error("kotak Nama Kapal tanpa saran");
  });

  t("saran mengikuti moda: pelayaran vs maskapai", () => {
    eq(pilihModa("laut").getAttribute("list"), "carrierListLaut");
    eq(pilihModa("udara").getAttribute("list"), "carrierListUdara");
    const kode = (m) => [...w.document.getElementById("carrierList" + m)
      .querySelectorAll("option")].map((o) => o.value);
    const laut = kode("Laut");
    const udara = kode("Udara");
    if (udara.includes("MSC")) throw new Error("pelayaran muncul di daftar udara");
    if (laut.includes("SQ")) throw new Error("maskapai muncul di daftar laut");
  });

  t("kode yang dipakai DDI ada di daftarnya", () => {
    /* SQ, TR, TW — kode yang benar-benar muncul di jadwal DDI. */
    isiCarrier();
    const dl = w.document.getElementById("carrierListUdara");
    ["SQ", "TR", "TW", "KE", "FX"].forEach((k) => {
      const o = [...dl.querySelectorAll("option")].find((x) => x.value === k);
      if (!o) throw new Error("kode " + k + " tidak ditawarkan");
      if (!/ — .+/.test(o.textContent))
        throw new Error("kode " + k + " tidak menyebut nama maskapainya");
    });
  });

  t("kurir muncul di KEDUA daftar", () => {
    /* Kiriman kurir bisa lewat udara maupun darat, dan kolom Nama
       Kapal-nya memang diisi nama perusahaan. */
    isiCarrier();
    ["Laut", "Udara"].forEach((m) => {
      const kode = [...w.document.getElementById("carrierList" + m)
        .querySelectorAll("option")].map((o) => o.value);
      ["DHL", "FEDEX", "UPS"].forEach((k) => {
        if (!kode.includes(k)) throw new Error(k + " tidak ada di daftar " + m);
      });
    });
  });

  t("nilai yang dimasukkan KODE-nya, bukan nama panjangnya", () => {
    /* detectCarrier() membaca kode, dan kode itu pula yang sudah
       tertulis di ribuan jadwal lama. */
    isiCarrier();
    const o = [...w.document.getElementById("carrierListUdara")
      .querySelectorAll("option")].find((x) => x.value === "SQ");
    eq(o.value, "SQ");
    if (o.value === o.textContent)
      throw new Error("label tidak menyebut nama maskapainya");
  });
}

console.log("\u2014 UDARA: JENIS MUATAN LCL TERKUNCI, KONTAINER DISEMBUNYIKAN \u2014");
{
  /* FCL/LCL & Kontainer itu konsep laut -- muatan pesawat tidak
     dikapalkan dalam kontainer. Berlaku untuk export MAUPUN import,
     lewat applyTransportLabels() yang sama (dipanggil baik saat
     #fTransport berganti maupun saat form dibuka/diisi). */
  const siapkanLaut = () => {
    $("#fTransport").value = "laut";
    $("#fMuatan").value = "FCL";
    $("#fContainer").value = "TCLU1234567";
    w.applyTransportLabels();
  };

  t("laut: Kontainer tampil, Jenis Muatan bebas diubah", () => {
    siapkanLaut();
    eq($("#fContainerWrap").classList.contains("d-none"), false, "wrap Kontainer:");
    eq($("#fMuatan").disabled, false, "Jenis Muatan disabled:");
    eq($("#fMuatan").value, "FCL");
  });

  t("ganti ke udara: Jenis Muatan otomatis LCL dan terkunci", () => {
    siapkanLaut();
    $("#fTransport").value = "udara";
    w.applyTransportLabels();
    eq($("#fMuatan").value, "LCL");
    eq($("#fMuatan").disabled, true, "Jenis Muatan disabled:");
  });

  t("ganti ke udara: field Kontainer disembunyikan & dikosongkan", () => {
    siapkanLaut();
    $("#fTransport").value = "udara";
    w.applyTransportLabels();
    eq($("#fContainerWrap").classList.contains("d-none"), true, "wrap Kontainer:");
    eq($("#fContainer").value, "");
  });

  t("balik ke laut: Kontainer tampil lagi, Jenis Muatan bisa diubah lagi", () => {
    siapkanLaut();
    $("#fTransport").value = "udara";
    w.applyTransportLabels();
    $("#fTransport").value = "laut";
    w.applyTransportLabels();
    eq($("#fContainerWrap").classList.contains("d-none"), false, "wrap Kontainer:");
    eq($("#fMuatan").disabled, false, "Jenis Muatan disabled:");
  });

  t("berlaku juga untuk mode import, bukan cuma export", () => {
    const modeSimpan = baca("activeMode");
    tulis("activeMode", "import");
    siapkanLaut();
    $("#fTransport").value = "udara";
    w.applyTransportLabels();
    eq($("#fMuatan").value, "LCL");
    eq($("#fContainerWrap").classList.contains("d-none"), true, "wrap Kontainer:");
    tulis("activeMode", modeSimpan);
  });

  siapkanLaut();
}

console.log("— SARAN PELABUHAN UNTUK TERMINAL TRANSIT —");
{
  const siapkan = (moda) => {
    $("#fRouteType").value = "transit";
    ["unlocodeList", "unlocodeListLaut", "unlocodeListUdara"].forEach((id, i) => {
      const dl = w.document.getElementById(id);
      if (dl) dl.innerHTML = w.unlocodeDatalistHtml(["", "laut", "udara"][i]);
    });
    w.eval(`draftStops = [{ terminal:"", transport:"${moda}", vessel:"", voyage:"", arrivalDate:"", departureDate:"" }]`);
    w.renderRouteStopsUI();
    return w.document.querySelector('#routeStopsBody [data-f="terminal"]');
  };

  t("kotak terminal transit punya saran pelabuhan", () => {
    /* Pelabuhan Asal & Tujuan sudah lama punya saran; terminal transit
       tidak punya `list` sama sekali — nama pelabuhannya harus diketik
       hafalan, dan salah ketik satu huruf membuat rutenya tidak cocok
       dengan mana pun. */
    const el = siapkan("laut");
    if (!el) throw new Error("kotak terminal tidak ada");
    const id = el.getAttribute("list");
    if (!id) throw new Error("kotak terminal tanpa saran sama sekali");
    const dl = w.document.getElementById(id);
    if (!dl) throw new Error("daftar saran " + id + " tidak ada di halaman");
    if (!dl.querySelectorAll("option").length)
      throw new Error("daftar saran " + id + " kosong");
  });

  t("sarannya mengikuti moda BARIS ITU, bukan moda pengiriman", () => {
    /* Satu perjalanan bisa laut sampai Singapura lalu udara ke
       Jakarta. Memakai #unlocodeList — yang disaring menurut moda di
       bagian atas form — akan menawarkan daftar bandara untuk terminal
       laut. */
    eq(siapkan("laut").getAttribute("list"), "unlocodeListLaut");
    eq(siapkan("udara").getAttribute("list"), "unlocodeListUdara");
  });

  t("daftar laut & udara benar-benar berbeda isinya", () => {
    siapkan("laut");
    const laut = [...w.document.getElementById("unlocodeListLaut")
      .querySelectorAll("option")].map((o) => o.value);
    const udara = [...w.document.getElementById("unlocodeListUdara")
      .querySelectorAll("option")].map((o) => o.value);
    if (!laut.length || !udara.length) throw new Error("salah satu daftar kosong");
    if (laut.length === udara.length && laut.join() === udara.join())
      throw new Error("kedua daftar identik — penyaringannya tidak jalan");
  });

  t("ganti moda baris ikut mengganti daftarnya", () => {
    /* Baris digambar ulang tiap modanya diganti — kalau suatu saat
       render ulang itu dihilangkan, sarannya diam-diam jadi salah. */
    siapkan("laut");
    const sel = w.document.querySelector('#routeStopsBody [data-f="transport"]');
    sel.value = "udara";
    sel.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(w.document.querySelector('#routeStopsBody [data-f="terminal"]')
      .getAttribute("list"), "unlocodeListUdara");
  });
}

console.log("— NAMA BARANG SELALU HURUF BESAR —");
t("diketik & DITEMPEL sama-sama jadi huruf besar", () => {
  /* Kejadian `input` menyala untuk ketikan MAUPUN tempelan, jadi satu
     penangan cukup — tidak perlu penangan `paste` tersendiri. Justru
     tempelan yang paling butuh: nama yang disalin dari invoice pemasok
     datang dengan huruf campur. */
  w.eval('draftItems = [{ namaBarang:"", qty:"1", satuan:"pcs", harga:"" }]');
  w.renderItemTable();
  const el = w.document.querySelector('#itemTableBody [data-f="namaBarang"]');
  if (!el) throw new Error("kotak nama barang tidak ada");
  el.value = "Tyre Mold Full Set";                    // seperti hasil tempel
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  eq(el.value, "TYRE MOLD FULL SET", "yang tertulis:");
  eq(w.eval("draftItems[0].namaBarang"), "TYRE MOLD FULL SET", "yang tersimpan:");
});
t("huruf besar dipasang SEBELUM nilainya dibaca", () => {
  /* Kalau diubah sesudahnya, yang tersimpan huruf kecil sementara yang
     tertulis huruf besar — cacat yang sama seperti kotak angka. */
  const src = w.eval("$(\"#itemTableBody\")") && require("fs")
    .readFileSync(__dirname + "/../js/features/item-table.js", "utf8");
  const i = src.indexOf('$("#itemTableBody").addEventListener("input"');
  const blok = src.slice(i, i + 3500).replace(/\/\*[\s\S]*?\*\//g, "");
  const iBesar = blok.indexOf("jadikanHurufBesar");
  const iSimpan = blok.indexOf("draftItems[idx][field] =");
  if (iBesar < 0) throw new Error("nama barang tidak dijadikan huruf besar");
  if (iSimpan > -1 && iBesar > iSimpan)
    throw new Error("dijadikan huruf besar SESUDAH disimpan");
});
t("kursor tidak melompat ke ujung saat menyunting di tengah", () => {
  /* Tanpa penjagaan posisi kursor, tiap huruf yang diketik di tengah
     teks melemparkan kursor ke akhir — kotaknya jadi tidak bisa
     disunting sama sekali. */
  const src = w.eval("jadikanHurufBesar.toString()");
  if (!/selectionStart/.test(src) || !/setSelectionRange/.test(src))
    throw new Error("posisi kursor tidak dijaga");
  if (!/try/.test(src))
    throw new Error("pengaturan kursor tidak dijaga dari galat");
});
t("impor berkas & impor massal dua-duanya huruf besar", () => {
  /* Impor massal punya jalurnya sendiri dan TIDAK lewat
     apply-to-form.js — satu-satunya jalur yang memasukkan ratusan baris
     sekaligus justru yang paling gampang terlewat. */
  const fs2 = require("fs");
  const funnel = fs2.readFileSync(__dirname + "/../js/import/apply-to-form.js", "utf8");
  if (!/namaBarang: String\(it\.namaBarang \|\| ""\)\.toUpperCase\(\)/.test(funnel))
    throw new Error("impor berkas tidak menyeragamkan huruf");
  const bulk = fs2.readFileSync(__dirname + "/../js/features/bulk-excel.js", "utf8");
  if (!/namaBarang: String\(desc \|\| ""\)\.toUpperCase\(\)/.test(bulk))
    throw new Error("impor massal tidak menyeragamkan huruf");
});

console.log("— MUAT YANG BERTUMPANG TIDAK SALING MENIMPA —");
t("jawaban muat yang usang dibuang, bukan digambar", () => {
  /* loadShipments() dipanggil dari delapan tempat dan tidak ada yang
     menunggu yang lain. Dua muat yang bertumpang berarti jawaban yang
     datang TERAKHIR yang menang — bukan yang paling baru diminta, dan
     urutan datangnya tidak dijamin. Akibatnya papan bisa menampilkan
     data yang lebih lama daripada yang sudah ada di layar. */
  const src = w.eval("loadShipments.toString()");
  if (!/\+\+muatKe/.test(src))
    throw new Error("permintaan muat tidak bernomor urut");
  if (!/nomor !== muatKe/.test(src))
    throw new Error("jawaban usang tidak dibuang");
  /* Galatnya juga harus ikut dibuang: layar gagal dari permintaan usang
     akan menghapus data yang barusan berhasil dimuat. */
  const iJaga = src.indexOf("nomor !== muatKe");
  const iGalat = src.indexOf("showDbErrorState");
  if (iGalat > -1 && iJaga > iGalat)
    throw new Error("layar gagal digambar sebelum penjaga sempat bekerja");
});

console.log("— KOTAK ANGKA APLIKASI PAKAI PEMBACA KETAT —");
t("tujuh kotak bea & pajak tidak lagi ditebak", () => {
  /* excelNum() hanyalah parseLooseNumber dengan nama lain dan tinggal
     di js/import/ — pembaca untuk teks berkas orang lain. Dipakai di
     form, ia meleset seribu kali lipat pada "16.500", dan yang kena
     termasuk NDPBM, Bea Masuk, PPN, PPH: seluruh dasar PDRI. */
  const src = require("fs").readFileSync(__dirname + "/../js/views/form-router.js", "utf8");
  const bersih = src.replace(/\/\*[\s\S]*?\*\//g, "");
  ["fFreight", "fInsurance", "fNdpbm", "fTarif", "fBM", "fPPN", "fPPH"].forEach((id) => {
    if (bersih.includes('excelNum($("#' + id + '")'))
      throw new Error(id + " masih dibaca dengan penebak");
    if (!bersih.includes('parseInputNumber($("#' + id + '")'))
      throw new Error(id + " tidak dibaca dengan pembaca ketat");
  });
});
t("penebak TETAP dipakai di jalur impor", () => {
  /* Berkas PIB memakai bentuk Indonesia ("1.234,56"). Menyeragamkan
     seluruhnya ke pembaca ketat akan merusak pembacaan berkas itu. */
  eq(w.parseLooseNumber("1.234,56"), 1234.56);
  eq(w.parseInputNumber("1,234.56"), 1234.56);
});

console.log("— IN FACTORY MENGGANTIKAN PERKIRAAN DI FORM —");
t("kotak Estimated Delivery ikut terisi walau mode Manual", () => {
  /* Mesin sudah mengembalikan tanggal In Factory; yang dulu menahan
     adalah form, yang menolak menulis apa pun saat mode Manual. */
  const src = w.eval("isiEstimatedDeliveryForm.toString()");
  if (!/d\.source === "actual"/.test(src))
    throw new Error("form masih menolak menulis saat mode Manual");
});
t("mode Manual tetap menahan hitungan biasa", () => {
  /* Pengecualiannya HANYA untuk fakta. Kalau syaratnya dilonggarkan
     jadi selalu menulis, tanggal patokan pengguna akan ditimpa tiap
     kali form disentuh. */
  const src = w.eval("isiEstimatedDeliveryForm.toString()");
  if (!/formDeliveryMode !== "manual"/.test(src))
    throw new Error("mode Manual tidak lagi menahan apa pun");
});

console.log("— YANG TERSIMPAN = YANG TERTULIS DI KOTAK —");
{
  /* Kotak angka dirapikan pendengar di `document`; penyimpan nilainya
     menempel di #itemTableBody. Pendengar elemen berjalan LEBIH DULU,
     jadi yang tersimpan adalah teks yang belum dirapikan.

     Diuji lewat perilaku, bukan teks kode: yang penting kedua angkanya
     sama, bukan bagaimana caranya disamakan. */
  const kotakPalsu = () => ({
    value: "", selectionStart: 0, readOnly: false, disabled: false,
    setSelectionRange(a) { this.selectionStart = a; },
  });
  const ketik = (teks, rapikanDulu) => {
    const el = kotakPalsu();
    let tersimpan = 0;
    for (const c of teks) {
      el.value += c;
      el.selectionStart = el.value.length;
      if (rapikanDulu) w.applyLiveNumberFormat(el);
      tersimpan = w.parseLooseNumber(el.value);
      if (!rapikanDulu) w.applyLiveNumberFormat(el);
    }
    return { tersimpan, tertulis: w.parseLooseNumber(el.value), teks: el.value };
  };

  t("harga yang diketik tersimpan sama dengan yang tertulis", () => {
    /* Contoh nyata dari layar Yogi: kotak menulis 11,319 sementara
       Subtotal menghitung dari 1,1319 — selisih sepuluh ribu kali.
       Yang ikut ke Invoice & PIB adalah angka yang tersimpan. */
    const r = ketik("11319", true);
    eq(r.teks, "11,319");
    eq(r.tersimpan, 11319);
    eq(r.tersimpan, r.tertulis, "tersimpan vs tertulis:");
  });

  t("tanpa dirapikan dulu, keduanya memang berbeda", () => {
    /* Pembanding: membuktikan ujinya benar-benar menguji sesuatu, dan
       merekam persis kesalahan yang dulu terjadi. */
    const r = ketik("11319", false);
    eq(r.tersimpan, 1.1319);
    eq(r.tertulis, 11319);
  });

  t("titik selalu desimal di kotak isian, tidak pernah ribuan", () => {
    /* Aplikasi ini HANYA pernah menulis koma sebagai pemisah ribuan —
       formatNumberValue(11319) selalu "11,319". Jadi di kotak isian,
       titik tidak punya arti lain selain desimal.

       parseLooseNumber menebak, dan tebakannya salah seribu kali lipat
       tiap titiknya diikuti tepat tiga angka. Berat 1,05 kg tersimpan
       jadi 1.050 kg — bentuk yang justru paling lazim, karena timbangan
       menulis tiga desimal. */
    eq(w.parseInputNumber("1.050"), 1.05);
    eq(w.parseInputNumber("11.319"), 11.319);
    eq(w.parseInputNumber("60.000"), 60);
    /* Koma tetap ribuan. */
    eq(w.parseInputNumber("11,319"), 11319);
    eq(w.parseInputNumber("1,234,567"), 1234567);
    eq(w.parseInputNumber("1,234.56"), 1234.56);
  });

  t("pembaca serbaguna DIBIARKAN menebak untuk berkas luar", () => {
    /* Berkas CIPL/PDF dari pihak lain bisa memakai bentuk Eropa
       ("1.234,56"). Tebakan itu sah di sana — yang salah adalah
       memakainya untuk kotak yang bentuknya kita tulis sendiri.

       Diuji supaya perbaikan di atas tidak diam-diam dipakai juga di
       jalur impor, yang akan merusak pembacaan berkas Eropa. */
    eq(w.parseLooseNumber("1.234,56"), 1234.56);
    eq(w.parseLooseNumber("60,000"), 60000);
  });

  t("baris barang memakai pembaca yang ketat", () => {
    w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"kg", harga:"", netto:"", bruto:"" }]');
    w.renderItemTable();
    const el = w.document.querySelector('#itemTableBody input[data-f="netto"]');
    if (!el) throw new Error("kotak netto tidak ada");
    for (const c of "1.050") {
      el.value += c;
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
    }
    eq(el.value, "1.050", "yang tertulis:");
    eq(Number(w.eval("draftItems[0].netto")), 1.05, "yang tersimpan:");
  });

  t("angka yang tidak dirapikan ikut tetap cocok", () => {
    /* Sebagian besar isian tidak pernah berubah bentuk saat diketik.
       Perbaikannya tidak boleh menyentuh yang sudah benar. */
    ["680", "3", "1250.5", "0"].forEach((x) => {
      const r = ketik(x, true);
      eq(r.tersimpan, r.tertulis, x + ":");
    });
  });

  t("mengetik di kotak harga sungguhan menyimpan angka yang tertulis", () => {
    /* Uji ini melewati tabel barang yang SEBENARNYA — kotaknya
       dirender, huruf diketikkan satu per satu, dan kejadian `input`
       menggelembung persis seperti di peramban. Dua pendengarnya
       (satu di #itemTableBody, satu di document) ikut berjalan dengan
       urutan yang sama seperti aslinya.

       Versi pertama uji ini cuma mencari kata "applyLiveNumberFormat"
       di dalam berkasnya. Ia LULUS walau pemanggilannya dihapus —
       karena namanya masih tertulis di komentar. Pencarian teks
       menguji ejaan, bukan perilaku. */
    w.eval('draftItems = [{ namaBarang:"X", qty:"3", satuan:"set", harga:"", netto:"", bruto:"" }]');
    w.renderItemTable();
    const el = w.document.querySelector('#itemTableBody input[data-f="harga"]');
    if (!el) throw new Error("kotak harga tidak ada di tabel barang");
    for (const c of "11319") {
      el.value += c;
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
    }
    eq(el.value, "11,319", "yang tertulis di kotak:");
    eq(w.parseLooseNumber(w.eval("draftItems[0].harga")), 11319, "yang tersimpan:");
    /* Dan Subtotal-nya ikut benar: 3 x 11.319, bukan 3 x 1,1319. */
    const sub = w.document.querySelector("#itemTableBody .subtotal");
    if (sub && /^\$3\.4/.test(sub.value))
      throw new Error("Subtotal masih dihitung dari 1,1319: " + sub.value);
  });
}

console.log("— DASAR PPN/PPH = NILAI BARANG + FREIGHT + ASURANSI —");
t("ongkos angkut & asuransi ikut jadi dasar pungutan", () => {
  /* Contoh nyata dari layar Yogi: barang $640, freight $382,40,
     asuransi $5,1, NDPBM 18.062.

       Nilai Pabean (640 + 382,40 + 5,1) x 18.062 = 18.558.705
       BM 5% = 927.935,25       -> dibulatkan ke atas ribuan 928.000
       Nilai Impor = 18.558.705 + 927.935,25 (BM SEBELUM dibulatkan)
       PPN 11% = 2.143.530,43   -> ke bawah rupiah   2.143.530
       PPh 2,5% x 19.486.000 (Nilai Impor ke bawah ribuan) = 487.150

     Dengan dasar lama (barang saja) PPN meleset ratusan ribu rupiah
     ke bawah pada satu kiriman. */
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"640" }]');
  $("#fIncoterm").value = "FOB";
  $("#fFreight").value = "382.40";
  $("#fInsurance").value = "5.1";
  $("#fNdpbm").value = "18,062";
  $("#fTarif").value = "5";
  $("#fBM").value = "";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  eq($("#fBM").value, "928,000", "BM (Pabean x 5%, ke atas ribuan):");
  eq($("#fPPN").value, "2,143,530", "PPN (Pabean + BM sebelum dibulatkan) x 11%, ke bawah rupiah:");
  eq($("#fPPH").value, "487,150", "PPh 2,5% x Nilai Impor ke bawah ribuan:");
});
t("Nilai Pabean ditampilkan di kotak sendiri, dasar yang SAMA dengan PPN/PPH otomatis", () => {
  /* Angka dari tangkapan layar Yogi sendiri: barang $5.600, freight
     $456, asuransi $112, NDPBM 17.224 -> Nilai Pabean Rp106.246.432. */
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"5600" }]');
  $("#fIncoterm").value = "CIF";
  $("#fFreight").value = "456";
  $("#fInsurance").value = "112";
  $("#fNdpbm").value = "17,224";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  const dasar = (5600 + 456 + 112) * 17224;
  eq($("#calcNilaiPabean").textContent, w.fmtRp(dasar));
  // Ditampilkan APA PUN Incoterm-nya, bukan cuma saat CIF/FOB (beda dari kotak CIF/FOB di sebelahnya).
  $("#fIncoterm").value = "CFR";
  w.recalcCustoms();
  eq($("#calcNilaiPabean").textContent, w.fmtRp(dasar), "tetap tampil walau Incoterm bukan CIF/FOB:");
});
t("Nilai CIF = barang + freight + asuransi (apa pun Incoterm-nya); Nilai Pabean presisi 2 desimal", () => {
  /* Angka dari layar Yogi: FCA, barang $1.280, freight $688,62,
     asuransi $9,84, NDPBM 17.707. CIF $1.978,46 x 17.707 = 35.032.591,22 */
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"1280" }]');
  $("#fIncoterm").value = "FCA";
  $("#fFreight").value = "688.62";
  $("#fInsurance").value = "9.84";
  $("#fNdpbm").value = "17,707";
  w.recalcCustoms();
  eq($("#calcCIF").textContent, "$1,978.46", "Nilai CIF:");
  eq($("#calcNilaiPabean").textContent, "Rp 35.032.591,22", "Nilai Pabean bersen:");
  // Bulat -> tanpa ",00".
  $("#fFreight").value = ""; $("#fInsurance").value = "";
  w.recalcCustoms();
  eq($("#calcCIF").textContent, "$1,280", "CIF tanpa ongkos:");
  eq($("#calcNilaiPabean").textContent, "Rp 22.664.960", "Nilai Pabean bulat:");
  // Kotak CIF Rupiah (= Nilai Pabean) & catatan "CIF dianggap 0" sudah tidak ada.
  if (w.document.getElementById("calcCIFRupiah")) throw new Error("kotak CIF Rupiah masih ada");
  if (w.document.getElementById("noCifFobNote")) throw new Error("catatan 'CIF dianggap 0' masih ada");
  eq(w.fmtRpPresisi(84639460), "Rp 84.639.460", "pemformat, bulat:");
  eq(w.fmtRpPresisi(1234.5), "Rp 1.234,50", "pemformat, bersen:");
  eq(w.fmtRpPresisi(1234.567), "Rp 1.234,57", "pemformat, maks 2 desimal:");
});
t("kotak ongkos kosong: dasarnya kembali ke harga barang saja", () => {
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"640" }]');
  $("#fFreight").value = "";
  $("#fInsurance").value = "";
  $("#fNdpbm").value = "18,062";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  $("#fBM").value = "";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  const dasarPolos = 640 * 18062;
  const bmPolos = Math.round(dasarPolos * 0.05);
  eq($("#fPPN").value, w.formatNumberValue(Math.round((dasarPolos + bmPolos) * 0.11)));
});
t("Bea Masuk terisi otomatis dari Tarif; PPh dari Nilai Impor (Pabean + BM), bukan Pabean saja", () => {
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"1000" }]');
  $("#fFreight").value = "";
  $("#fInsurance").value = "";
  $("#fTarif").value = "5";
  $("#fNdpbm").value = "10,000";
  $("#fBM").value = "";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  const pabean = 1000 * 10000; // 10.000.000
  eq($("#fBM").value, w.formatNumberValue(Math.round(pabean * 0.05)), "BM = Pabean x 5%:");
  eq($("#fPPN").value, w.formatNumberValue(Math.round(pabean * 1.05 * 0.11)), "PPN = (Pabean+BM) x 11%:");
  eq($("#fPPH").value, w.formatNumberValue(pabean * 1.05 * 0.025), "PPH = (Pabean+BM) x 2,5%:");
});
t("BM diisi MANUAL: PPN memakai BM manual itu, bukan hasil 5% otomatis", () => {
  /* Tarif HS Code tertentu memang bukan 5% -- yang penting PPN selalu
     dihitung dari BM yang BENAR-BENAR berlaku, bukan yang seharusnya. */
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"1000" }]');
  $("#fFreight").value = "";
  $("#fInsurance").value = "";
  $("#fNdpbm").value = "10,000";
  $("#fBM").value = "";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  w.initAutoDutyFlags();
  // Diketik manual -> dataset.auto jadi "0" lewat listener input.
  $("#fBM").value = "2,000,000";
  $("#fBM").dispatchEvent(new w.Event("input"));
  const pabean = 1000 * 10000;
  eq($("#fBM").value, "2,000,000", "BM manual tidak ditimpa hitungan otomatis:");
  eq($("#fPPN").value, w.formatNumberValue(Math.round((pabean + 2000000) * 0.11)),
    "PPN memakai BM manual 2 juta, bukan 500rb dari 5%:");
});
t("mengosongkan BM lagi mengembalikan pengisian otomatisnya", () => {
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"1000" }]');
  $("#fNdpbm").value = "10,000";
  $("#fFreight").value = "";
  $("#fInsurance").value = "";
  $("#fBM").value = "9,999,999";
  $("#fBM").dispatchEvent(new w.Event("input"));
  $("#fBM").value = "";
  $("#fBM").dispatchEvent(new w.Event("input"));
  eq($("#fBM").value, w.formatNumberValue(Math.round(1000 * 10000 * 0.05)));
});
t("mengetik PPN sendiri tetap menghentikan hitungan otomatis", () => {
  /* Dasarnya berubah, tapi kendali manualnya tidak boleh ikut hilang. */
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"640" }]');
  $("#fPPN").value = "1,000,000";
  $("#fFreight").value = "382.40";
  $("#fNdpbm").value = "18,062";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  eq($("#fPPN").value, "1,000,000");
});

console.log("— PDRI: SEKETIKA & PENJUMLAHAN BIASA —");
function ketikAngka(sel, teks) {
  const el = $(sel);
  el.value = "";
  for (const c of teks) {
    el.value += c;
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
  }
  return el.value;
}
t("mengetik sungguhan menghasilkan angka yang benar", () => {
  /* Saat mengetik digit terakhir, isi kotak sesaat "2,6000" — belum
     dinormalkan pemformat. Pengurai serbaguna melihat empat digit
     setelah koma dan menyimpulkan koma itu DESIMAL: 2,6.

     Pemformat memang membetulkannya sesaat kemudian, tapi ia terpasang
     di document sementara penghitung terpasang di kotaknya sendiri —
     dan pendengar elemen selalu berjalan lebih dulu. */
  $("#fIncoterm").value = "CIF";
  ketikAngka("#fBM", "1000");
  ketikAngka("#fPPN", "25000");
  ketikAngka("#fPPH", "26000");
  eq($("#fPPH").value, "26,000");
  eq(w.parseLooseNumber($("#calcPDRI").value), 52000);
});
t("angka tetap benar di TIAP ketukan, bukan cuma di akhir", () => {
  $("#fBM").value = "1,000"; $("#fPPN").value = "25,000";
  const el = $("#fPPH");
  el.value = "";
  const harap = [2, 26, 260, 2600, 26000];
  "26000".split("").forEach((c, i) => {
    el.value += c;
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(w.parseLooseNumber($("#calcPDRI").value), 1000 + 25000 + harap[i],
       'setelah mengetik "' + el.value + '":');
  });
});
t("kotak angka dibaca dengan aturan tetap, bukan tebakan", () => {
  $("#fBM").value = "2,6000";        // teks transisi saat mengetik
  eq(w.nilaiKotakAngka("#fBM"), 26000);
  $("#fBM").value = "26,002.6";      // sudah rapi, ada desimal
  eq(w.nilaiKotakAngka("#fBM"), 26002.6);
  $("#fBM").value = "";
  eq(w.nilaiKotakAngka("#fBM"), 0);
});
t("PDRI = Bea Masuk + PPN + PPH", () => {
  const c = w.computeCustoms({ items: [], bm: 24625000, ppn: 56883539, pph: 11966527 });
  eq(c.bmPdri, 93475066);
});
t("Bea Masuk 0 TIDAK menolkan PDRI", () => {
  /* Kiriman berfasilitas SKB: bea masuknya nol, tapi PPN & PPH tetap
     terutang. Aturan lama menampilkan 0 padahal ada yang disetor. */
  const c = w.computeCustoms({ items: [], bm: 0, ppn: 56883539, pph: 11966527 });
  eq(c.bmPdri, 68850066);
});
t("PPH 0 ikut terhitung apa adanya", () => {
  const c = w.computeCustoms({ items: [], bm: 24625000, ppn: 56883539, pph: 0 });
  eq(c.bmPdri, 81508539);
});
t("dihitung ulang SETIAP recalc, tanpa syarat", () => {
  $("#calcPDRI").value = "1.000.000";
  w.recalcCustoms();
  if ($("#calcPDRI").value === "1.000.000")
    throw new Error("tidak dihitung seketika");
});
t("mengetik di kolom pungutan langsung menggerakkannya", () => {
  ["fBM", "fPPN", "fPPH"].forEach((id) => {
    $("#calcPDRI").value = "7.777";
    $("#" + id).dispatchEvent(new w.Event("input"));
    if ($("#calcPDRI").value === "7.777")
      throw new Error(id + ": mengetik tidak memicu perhitungan");
  });
});
t("label di layar berbunyi PDRI, bukan BM + PDRI", () => {
  const html = require("fs").readFileSync(__dirname + "/../index.html", "utf8");
  if (/BM \+ PDRI/.test(html)) throw new Error("masih ada label BM + PDRI");
  if (!/>PDRI \(Rp\)</.test(html)) throw new Error("label PDRI tidak ditemukan");
  if (/calcBMPDRI/.test(html)) throw new Error("id lama masih dipakai");
});

console.log("— SERET & LEPAS BERKAS IMPOR —");
t("menyeret berkas menyalakan sorotan", () => {
  /* Teks di layar menjanjikan "atau seret ke sini" dan CSS
     .is-dragover sudah ada — tapi tak ada satu pun pendengar yang
     memasangnya. Janji yang tidak ditepati membuat orang berhenti
     mempercayai petunjuk lain di layar yang sama. */
  const zona = $("#importZone");
  if (!zona) throw new Error("zona impor tidak ada");
  zona.dispatchEvent(new w.Event("dragover", { bubbles: true }));
  eq(zona.classList.contains("is-dragover"), true);
  zona.dispatchEvent(new w.Event("dragleave", { bubbles: true }));
  eq(zona.classList.contains("is-dragover"), false);
});
t("sorotan tidak berkedip saat kursor melintasi elemen anak", () => {
  const zona = $("#importZone");
  const anak = zona.querySelector(".import-zone-copy") || zona.firstElementChild;
  zona.dispatchEvent(new w.Event("dragover", { bubbles: true }));
  const ev = new w.Event("dragleave", { bubbles: true });
  Object.defineProperty(ev, "relatedTarget", { value: anak });
  zona.dispatchEvent(ev);
  eq(zona.classList.contains("is-dragover"), true, "sorotan padam padahal masih di dalam:");
  zona.classList.remove("is-dragover");
});
t("teks janji & penangannya sama-sama ada", () => {
  const html = require("fs").readFileSync(__dirname + "/../index.html", "utf8");
  const janji = /seret ke sini/i.test(html);
  const src = require("fs").readFileSync(__dirname + "/../js/import/dispatch.js", "utf8");
  const ada = /addEventListener\("drop"/.test(src);
  if (janji !== ada)
    throw new Error(janji ? "dijanjikan tapi tidak ada penangannya" : "penanganan ada tapi tidak dijanjikan");
});
t("berkas dipilih & dilepas lewat jalur yang sama", () => {
  const src = require("fs").readFileSync(__dirname + "/../js/import/dispatch.js", "utf8");
  eq((src.match(/prosesBerkasImport\(/g) || []).length >= 3, true,
     "satu penangan dipakai kedua jalur:");
});

console.log("— SHIPPING INSTRUCTION & EXCEL —");
const rowSI = { id: "si1", doc_number: "DDI-CRBM-VIII-040", doc_date: "2026-08-03",
  payload: { invoiceKind: "Commercial", currency: "USD", siNo: "03",
    siTo: "PT WIDE LOGISTICS", notifyParty: "SAME AS CONSIGNEE",
    portLoading: "JAKARTA, INDONESIA", finalDestination: "BUSAN, KOREA" } };
const jadwalSI = { id: "sj1", mode: "export", party: "Dynamic Design CO., LTD.",
  forwarder: "PT WIDE LOGISTICS", muatan: "LCL", origin: "IDTPP", destination: "KRPUS",
  items: [{ namaBarang: "TYRE MOLD FULL SET NOKIAN ENTRUST 235/45R19", hsCode: "84807190",
    qty: 1, satuan: "SET", harga: 10490, netto: 280, bruto: 300,
    package: "81*81*81", packing: "4 BOX" }] };

t("nomor SI diturunkan dari nomor invoice", () => {
  /* "DDI-CRBM-VIII-042" -> 42. Nol di depan dibuang karena penomoran
     SI ditulis apa adanya di berkas aslinya. */
  eq(w.ciplNoSiDariInvoice("DDI-CRBM-VIII-042"), "42");
  eq(w.ciplNoSiDariInvoice("DDI-CRBM-VIII-003"), "3");
  eq(w.ciplNoSiDariInvoice("DDI-025/2026-VII-EXIM-LOG"), "");
  eq(w.ciplNoSiDariInvoice(""), "");
});
t("No. SI yang diisi manual menang atas turunan", () => {
  const b = w.ciplBarisBarang(jadwalSI);
  const manual = w.ciplSiData({ ...rowSI, payload: { ...rowSI.payload, siNo: "07" } }, jadwalSI, b);
  eq(manual.no, "07");
  const turunan = w.ciplSiData(
    { ...rowSI, doc_number: "DDI-CRBM-VIII-042", payload: { ...rowSI.payload, siNo: "" } },
    jadwalSI, b);
  eq(turunan.no, "42");
});
t("satuan berat menyatu dengan angkanya", () => {
  /* Sebagai sel terpisah ia terlempar jauh ke kanan mengikuti lebar
     kolom nilai, dan angka dengan satuannya berjarak setengah halaman
     tidak terbaca sebagai satu keterangan. */
  const src = w.eval("ciplXlsShippingInstruction.toString()");
  if (!/def\.satuan && nilai \? `\$\{nilai\}/.test(src))
    throw new Error("satuan tidak digabung ke sel angkanya");
  if (/ciplXlsSet\(ws, "G" \+ r, def\.satuan/.test(src))
    throw new Error("satuan masih ditaruh di kolom terpisah");
});
/* Lembar kerja tiruan — cukup untuk membaca GARIS yang benar-benar
   digambar, tanpa memuat ExcelJS.

   Sel gabungan memakai bersama SATU objek, persis seperti ExcelJS yang
   memakai bersama satu objek gaya untuk seluruh rentang. Tanpa itu
   pengujiannya akan lulus pada kode yang menimpa garis sel gabungan —
   cacat yang justru paling sering terjadi di berkas ini. */
function wsTiruan() {
  const sel = new Map();
  const kunci = (r, c) => r + ":" + c;
  const buat = (r, c) => {
    const k = kunci(r, c);
    if (!sel.has(k)) sel.set(k, { r, c });
    return sel.get(k);
  };
  const urai = (a) => {
    const m = /^([A-J])(\d+)$/.exec(a);
    return [Number(m[2]), m[1].charCodeAt(0) - 64];
  };
  return {
    _sel: sel,
    getColumn: () => ({}),
    getRow: (r) => ({ getCell: (c) => buat(r, c) }),
    getCell(a) { const [r, c] = urai(a); return buat(r, c); },
    mergeCells(rentang) {
      const [a, b] = rentang.split(":");
      const [r1, c1] = urai(a), [r2, c2] = urai(b);
      const induk = buat(r1, c1);
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) sel.set(kunci(r, c), induk);
    },
    addImage() {},
    at(r, c) { return sel.get(kunci(r, c)) || {}; },
  };
}

/* ---- KESAMAAN DENGAN BERKAS RUJUKAN ----

   Hasil unduhan harus sama persis dengan DDI-CRBM-VIII-042.xlsx, yang
   beredar ke forwarder dan bea cukai negara tujuan. Nomor & tulisan di
   bawah ini disalin dari sana; berubahnya satu saja berarti dokumen
   yang dikirim tidak lagi cocok dengan yang mereka harapkan. */
t("tata letak Excel tetap pada koordinat rujukan", () => {
  const ws = wsTiruan();
  const wb = { addWorksheet: () => ws, addImage: () => 1 };
  w.ciplXlsInvoice(wb, rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
  const isi = (a) => (ws.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {}).value;

  eq(isi("A9"), "Shipper/Seller");
  eq(isi("A17"), "Consignee/Buyer");
  eq(isi("A24"), "Notify Party");
  eq(isi("E9"), "Invoice No. & Date");
  eq(isi("E14"), "PO No. & Date");
  eq(isi("E17"), "Terms of Delivery");
  eq(isi("E21"), "Term of Payment");
  eq(isi("E24"), "Remarks");
  eq(isi("A27"), "Port of Loading");
  eq(isi("A29"), "No");           // judul tabel di baris 29
  eq(isi("G46"), "Total");        // baris Total di 46
  eq(isi("G47"), "Signed by");    // kotak tanda tangan 47-50
});

t("Carrier CIPL Excel: payload kosong -> gabungan Nama Voyager/Vessel + No. Voyage/Flight", () => {
  /* payload.carrier kosong (dokumen lama, atau belum ditautkan jadwal
     saat itu) -> C28 jatuh ke data jadwal, digabung, bukan Nama
     Voyager/Vessel saja seperti sebelumnya. */
  const ws = wsTiruan();
  const jadwalLaut = { ...jadwalSI, vessel: "MSC LORENA", voyage: "056S" };
  w.ciplXlsInvoice({ addWorksheet: () => ws, addImage: () => 1 },
    rowSI, jadwalLaut, w.ciplBarisBarang(jadwalLaut));
  const isi = (a) => (ws.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {}).value;
  eq(isi("C28"), "MSC LORENA 056S");
});
t("Carrier CIPL Excel: payload yang sudah terisi tidak digabung ulang", () => {
  const ws = wsTiruan();
  const rowManual = { ...rowSI, payload: { ...rowSI.payload, carrier: "TEKS MANUAL" } };
  const jadwalLaut = { ...jadwalSI, vessel: "MSC LORENA", voyage: "056S" };
  w.ciplXlsInvoice({ addWorksheet: () => ws, addImage: () => 1 },
    rowManual, jadwalLaut, w.ciplBarisBarang(jadwalLaut));
  const isi = (a) => (ws.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {}).value;
  eq(isi("C28"), "TEKS MANUAL");
});

t("Packing List memakai judul tabelnya sendiri", () => {
  const ws = wsTiruan();
  w.ciplXlsPacking({ addWorksheet: () => ws, addImage: () => 1 },
    rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
  const isi = (a) => (ws.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {}).value;
  eq(isi("B29"), "Item Description");
  eq(isi("D29"), "HS CODE");
  eq(isi("G29"), "NW");
  eq(isi("E46"), "TOTAL");
});

t("tiga sel yang dulu ganjil kini SAMA di kedua lembar", () => {
  /* Rujukan menuliskannya berbeda antar lembar — "about" vs "About",
     spasi di depan label invoice, dan Final Destination rata tengah di
     satu lembar tapi rata kiri di lembar lain. Diseragamkan: sailing
     ikut bentuk PL, dua lainnya ikut bentuk Invoice.

     Diuji dari KEDUA lembar sekaligus. Menguji satu lembar saja tidak
     membuktikan keduanya sama, dan justru kesamaan itu yang diminta. */
  const bikin = (fn) => {
    const ws = wsTiruan();
    fn({ addWorksheet: () => ws, addImage: () => 1 },
      rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
    return (a) => ws.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {};
  };
  const inv = bikin(w.ciplXlsInvoice);
  const pl = bikin(w.ciplXlsPacking);

  ["E9", "D27", "E27"].forEach((a) => {
    eq(inv(a).value, pl(a).value);
    eq(JSON.stringify(inv(a).alignment || null), JSON.stringify(pl(a).alignment || null));
    eq(JSON.stringify(inv(a).font || null), JSON.stringify(pl(a).font || null));
  });
  eq(inv("E9").value, "Invoice No. & Date");   // tanpa spasi depan
  eq(inv("D27").value, "Sailing on or About"); // bentuk PL
  eq(inv("E27").alignment.horizontal, "center");
  /* Berkas rujukan yang diperbarui menebalkannya di KEDUA lembar, jadi
     tebal — yang dijaga di sini kesamaannya, bukan tebal/tidaknya. */
  eq(inv("D27").font.size, 8);
  eq(!!inv("D27").font.bold, true);
});

t("rata tengah tegak memakai kosakata ExcelJS", () => {
  /* ExcelJS memakai top/middle/bottom dan MEMBUANG diam-diam nilai
     yang tidak dikenalnya. Ditulis "center", perataannya hilang tanpa
     galat: kode terlihat benar, hasilnya rata bawah. */
  const src = w.eval("ciplXlsBlokPihak.toString()") +
              w.eval("ciplXlsInvoice.toString()") +
              w.eval("ciplXlsShippingInstruction.toString()") +
              w.eval("XLS_TENGAH.vertical") + w.eval("XLS_TEGAK.vertical");
  if (/vertical:\s*"center"/.test(src))
    throw new Error('vertical: "center" diabaikan ExcelJS — pakai "middle"');
  eq(w.eval("XLS_TENGAH.vertical"), "middle");
  eq(w.eval("XLS_TEGAK.vertical"), "middle");
});

t("angka memakai format dari rujukan, bukan General", () => {
  /* Harga & jumlah pakai "Comma Style" bawaan Excel: ribuan
     berpemisah, negatif dalam kurung, nol jadi tanda hubung. "#,##0"
     mirip tapi menampilkan nol dan minus dengan cara berbeda. */
  const ws = wsTiruan();
  w.ciplXlsInvoice({ addWorksheet: () => ws, addImage: () => 1 },
    rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
  const sel = (a) => ws.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {};
  const UANG = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';
  ["H30", "J30", "J46"].forEach((a) => eq(sel(a).numFmt, UANG, a + ":"));
  /* Sel angka TIDAK dibungkus baris — angka tidak punya tempat patah,
     dan membungkusnya membuat tinggi baris berubah-ubah. */
  eq(sel("H30").alignment.wrapText, false);
  eq(sel("B30").alignment.wrapText, true);   // pembanding: sel teks

  const pl = wsTiruan();
  w.ciplXlsPacking({ addWorksheet: () => pl, addImage: () => 1 },
    rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
  const selPl = (a) => pl.at(Number(a.slice(1)), a.charCodeAt(0) - 64) || {};
  ["G30", "H30", "G46", "H46"].forEach((a) => eq(selPl(a).numFmt, "#,##0_ ", a + ":"));
  ["J30", "I46"].forEach((a) => eq(selPl(a).numFmt, "0.000", a + ":"));
  /* Angka Total sebaris dengan angka barang, jadi ukurannya mengikuti:
     Arial 9, bukan 8. */
  eq(selPl("G46").font.size, 9);
});
t("kotak tanda tangan Invoice & Packing List SAMA LEBAR -- cetak & Excel Dynamic Design", () => {
  const porsi = (l, k) => l.slice(k).reduce((a, b) => a + b, 0) / l.reduce((a, b) => a + b, 0);
  // CETAK: Invoice D..J, Packing List E..J -- porsi bingkainya sama.
  eq(porsi(baca("CIPL_COLS_INVOICE"), 3).toFixed(4), porsi(baca("CIPL_COLS_PACKING"), 4).toFixed(4), "cetak:");
  const row = { id: "d7", doc_number: "X", doc_date: "2026-08-03", payload: {} };
  const hCi = w.ciplHalamanInvoice(row, jadwalCipl, barisCipl());
  if (!/<td colspan="3" class="ci-sign-empty">/.test(hCi) || !/<td colspan="7" class="ci-sign-cell">/.test(hCi))
    throw new Error("kotak tanda tangan Invoice cetak tidak mulai di kolom D");
  if (!/<td colspan="5" class="ci-total-k">Total<\/td>/.test(hCi))
    throw new Error("label Total Invoice cetak tidak mulai di kolom D");
  // EXCEL: keduanya D..J, porsinya sama.
  const lembar = (fn) => {
    const ws = wsTiruan(), kol = {}, bar = {}, asliRow = ws.getRow;
    ws.getColumn = (c) => (kol[c] = kol[c] || {});
    ws.getRow = (r) => (bar[r] = bar[r] || asliRow(r));
    fn({ addWorksheet: () => ws, addImage: () => 1 }, rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
    return { ws, lebar: Array.from({ length: 10 }, (_, i) => (kol[i + 1] || {}).width) };
  };
  const ci = lembar(w.ciplXlsInvoice), pl = lembar(w.ciplXlsPacking);
  const rt = w.ciplXlsBarisTotal(w.ciplBarisBarang(jadwalSI).length);
  const awal = (x) => [...Array(10).keys()].map((i) => i + 1).find((c) => /signed by/i.test(String(x.ws.at(rt + 1, c).value || "")));
  eq(awal(ci), 4, "Excel Invoice mulai di D:");
  eq(awal(pl), 4, "Excel Packing List mulai di D:");
  eq(porsi(ci.lebar, 3).toFixed(4), porsi(pl.lebar, 3).toFixed(4), "Excel:");
  // Kolom D Packing List TIDAK dipersempit: ia juga menampung "Sailing on or About".
  eq(pl.lebar[3], 16, "lebar kolom D Packing List:");
});

t("tanggal Excel tidak mundur sehari di zona waktu mana pun", () => {
  /* ExcelJS mengubah Date jadi nomor seri memakai jam UTC. Tengah
     malam WIB = pukul 17.00 UTC HARI SEBELUMNYA, jadi sel bertanggal
     menampilkan tanggal yang mundur satu hari. Yang mundur itu Tanggal
     Invoice pada dokumen yang dikirim ke bea cukai. */
  const d = w.ciplXlsTanggal("2026-08-12");
  eq(d.getUTCFullYear(), 2026);
  eq(d.getUTCMonth(), 7);      // Agustus
  eq(d.getUTCDate(), 12);
  eq(d.getUTCHours(), 0, "harus tengah malam UTC:");
});

t("pengaturan cetak: kertas, skala & margin narrow", () => {
  /* fitToPage BERSAMA skala. Rujukan punya keduanya; tanpa fitToPage
     Excel memakai skala mentah dan halaman keluar ~2,4% lebih kecil.

     Margin bawaannya kini preset Narrow — DIUBAH ATAS PERMINTAAN, dan
     ini satu-satunya hal yang menyimpang dari berkas rujukan
     DDI-CRBM-VIII-045 (di sana INVOICE 0,3/0,4). */
  const h = w.eval("ciplXlsHalaman")({ area: "A1:J51", scale: 80, tengah: true });
  eq(h.paperSize, 9);
  eq(h.orientation, "portrait");
  eq(h.scale, 80);
  eq(h.fitToPage, true);
  eq(h.horizontalCentered, true);
  eq(h.printArea, "A1:J51");
  eq(h.margins.left, 0.25, "kiri narrow:");
  eq(h.margins.right, 0.25, "kanan narrow:");
  eq(h.margins.top, 0.75, "atas narrow:");
  eq(h.margins.bottom, 0.75, "bawah narrow:");
});

t("Excel memasang logo & bingkai seperti cetakan", () => {
  if (!/ciplXlsLogo/.test(w.eval("ciplXlsKerangka.toString()")))
    throw new Error("logo tidak dipasang");
  /* Kegagalan memuat logo tidak boleh menggagalkan seluruh berkas. */
  if (!/try/.test(w.eval("ciplXlsLogo.toString()")))
    throw new Error("kegagalan logo tidak dijaga");

  const ws = wsTiruan();
  w.ciplXlsInvoice({ addWorksheet: () => ws, addImage: () => 1 },
    rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));

  /* Nomor baris di bawah ini disalin dari berkas rujukan
     DDI-CRBM-VIII-042.xlsx. Kalau berubah, hasil unduhan tidak lagi
     sama dengan berkas yang beredar ke forwarder. */
  const akhir = 50;  // 30 + 16 baris minimum, Total di 46, ttd 47-50
  const ada = (r, c, s) => !!(ws.at(r, c).border || {})[s];

  /* SATU bingkai mengelilingi seluruh dokumen, seperti .ci-box. Dulu
     tiap blok berkotak sendiri dan bagian bawah — ruang kosong, Total,
     tanda tangan — tidak dilingkupi apa pun. */
  for (let r = 1; r <= akhir; r++) {
    if (!ada(r, 1, "left")) throw new Error("bingkai kiri bolong di baris " + r);
    if (!ada(r, 10, "right")) throw new Error("bingkai kanan bolong di baris " + r);
  }
  /* Sisi bawah menguji URUTAN: ciplXlsKotak() menimpa seluruh sisi
     sebuah sel, jadi bingkainya HARUS digambar setelah isinya. */
  for (let c = 1; c <= 10; c++)
    if (!ada(akhir, c, "bottom")) throw new Error("bingkai bawah bolong di kolom " + c);

  /* Sekat di dalam blok pihak, di baris yang sama dengan rujukan. */
  [16, 23, 26, 28].forEach((r) => {
    if (!ada(r, 1, "bottom")) throw new Error("sekat selebar halaman hilang di baris " + r);
  });
  [13, 20].forEach((r) => {
    if (!ada(r, 5, "bottom")) throw new Error("sekat kolom kanan hilang di baris " + r);
  });
  if (!ada(13, 4, "right")) throw new Error("kolom kiri & kanan tidak dipisah");
  /* Baris judul tabel & baris Total ada di tempatnya. */
  if (!ada(29, 2, "bottom")) throw new Error("judul tabel bukan di baris 29");
  if (!ada(46, 7, "top")) throw new Error("baris Total bukan di baris 46");

  /* Ruang kosong TANPA garis sama sekali — yang membatasinya cuma
     bingkai luar, sama seperti .ci-fill pada cetakan. */
  const kosong = ws.at(40, 3).border || {};
  if (kosong.top || kosong.left || kosong.right || kosong.bottom)
    throw new Error("ruang kosong ikut digariskan");
});
/* ---- KARTU DI LAYAR SEDANG (tablet & split window) ----

   Empat cacat ini ditemukan dengan memotret kartu sungguhan di
   400-1440px. Dua di antaranya ternyata bukan cacat tablet — sudah
   salah sejak di layar lebar, hanya belum kentara. Diuji lewat CSS
   supaya tidak perlu meramban di dalam berkas uji ini. */
const cssKartu = require("fs").readFileSync(__dirname + "/../css/card.css", "utf8");
const blokCss = (pemilih) => {
  const i = cssKartu.indexOf(pemilih + " {");
  if (i < 0) throw new Error("aturan tidak ada: " + pemilih);
  return cssKartu.slice(i, cssKartu.indexOf("}", i));
};

console.log("— BILAH KENDALI DI HP —");
{
  const cssBilah = require("fs").readFileSync(__dirname + "/../css/dashboard.css", "utf8");
  const hp = cssBilah.slice(cssBilah.indexOf("@media (max-width: 767px)"));
  const blok = (pemilih) => {
    const i = hp.indexOf(pemilih + " {");
    if (i < 0) throw new Error("aturan tidak ada di blok HP: " + pemilih);
    return hp.slice(i, hp.indexOf("}", i));
  };

  t("baris tombol dipakai penuh, bukan didorong ke kanan", () => {
    /* Dua tombol kecil dulu didorong `margin-left: auto` ke ujung
       kanan, menyisakan ~70% baris itu melompong — satu baris penuh
       terpakai untuk dua ikon. */
    const b = blok(".controlbar-tail");
    if (!/width: 100%/.test(b)) throw new Error("baris tombol tidak selebar bilah");
    if (!/margin-left: 0/.test(b)) throw new Error("tombol masih didorong ke kanan");
    if (!/flex: 1 1 auto/.test(blok(".controlbar-tail #btnAdd")))
      throw new Error("tombol utama tidak mengisi baris");
  });

  t("tombol utama membawa tulisannya lagi di HP", () => {
    /* Di 991px labelnya disembunyikan karena memakan sepertiga bilah
       yang sempit. Di HP bilahnya justru kelebihan ruang, dan "+"
       sendirian tidak menjelaskan apa yang akan ditambahkan.

       Harus MENANG atas aturan 991px — pemilih sama persis, jadi
       urutannya yang menentukan. */
    if (!/display: inline/.test(blok("#btnAdd #lblAddBtn")))
      throw new Error("label tombol tambah masih disembunyikan di HP");
    if (cssBilah.indexOf("@media (max-width: 767px)") <
        cssBilah.indexOf("@media (max-width: 991px)"))
      throw new Error("blok HP di ATAS blok 991px — aturannya akan kalah");
  });
}

t("baris aksi kartu: status berseberangan dengan ikon di HP", () => {
  /* Sebelumnya blok aksi menempel di kiri mengikuti judul, dan karena
     tidak boleh menyusut lebarnya terkunci 320px — sementara isi kartu
     di HP 360px cuma 292px. Barisnya MELUBER keluar kartu, bukan
     sekadar terlihat sesak. */
  const i = cssKartu.indexOf("@media (max-width: 599.98px)");
  const sempit = cssKartu.slice(i);
  if (!/\.ship-actions-block \{[^}]*justify-content: space-between/.test(sempit))
    throw new Error("baris aksi tidak berseberangan di HP");
  if (!/\.ship-actions-block \{[^}]*width: 100%/.test(sempit))
    throw new Error("baris aksi tidak selebar kartu");
});

t("ikon kartu diperkecil di HP, tapi tidak jadi titik", () => {
  /* dashboard.css menaikkan SEMUA .icon-btn jadi 44px demi target
     sentuh. Di kartu ada empat sekaligus — 4x44 + jarak = 320px.
     Diperkecil, tapi ada batas bawahnya: tombol 24px tidak bisa
     ditekan dengan jempol. */
  const i = cssKartu.indexOf("@media (max-width: 599.98px)");
  const blok = cssKartu.slice(i);
  const m = /\.ship-actions-block \.icon-btn \{[^}]*?min-width: (\d+)px/.exec(blok);
  if (!m) throw new Error("ukuran ikon kartu tidak diatur khusus di HP");
  const px = Number(m[1]);
  if (px >= 44) throw new Error("ikon belum diperkecil: " + px + "px");
  if (px < 32) throw new Error("ikon terlalu kecil untuk jempol: " + px + "px");
});

t("kolom info di HP menyesuaikan sendiri, dengan batas bawah TETAP", () => {
  /* Batas bawahnya harus ukuran pasti (150px), bukan `auto`/1fr: batas
     `auto` memakai lebar min-content, jadi satu sel berisi teks panjang
     (nama kapal, nomor B/L) melebarkan kolomnya melewati kartu dan
     seluruh halaman ikut bisa digeser mendatar di 320px. */
  const i = cssKartu.indexOf("@media (max-width: 599.98px)");
  const sempit = cssKartu.slice(i);
  if (!/\.info-grid \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\)/.test(sempit))
    throw new Error("grid info di HP tidak auto-fit dengan batas bawah tetap");
});
t("badan kartu ditumpuk (bukan dibelah kiri-kanan) begitu kartunya menyempit", () => {
  /* Dipaksa berdampingan, kolom rincian jadi terlalu sempit sementara
     nama barang tetap butuh lebarnya. */
  const i = cssKartu.indexOf("@media (max-width: 1199.98px)");
  if (i < 0) throw new Error("tidak ada breakpoint penumpuk untuk .ship-body-split");
  if (!/\.ship-body-split \{[^}]*flex-direction: column/.test(cssKartu.slice(i)))
    throw new Error(".ship-body-split tidak ditumpuk di layar menengah");
});

t("kotak tanggal sejajar berapa pun tinggi labelnya", () => {
  /* Tiga label di baris ini tidak sama tingginya: "ETD" teks polos,
     "ETA" & "Estimated Delivery" membawa lencana AUTO/MANUAL. Ditumpuk
     biasa, tinggi label langsung menggeser kotak di bawahnya — ETD
     naik 4px dari dua lainnya di SEMUA lebar. */
  const b = blokCss(".date-field");
  if (!/flex-direction: column/.test(b))
    throw new Error("kotak tanggal bukan kolom lentur");
  if (!/margin-top: auto/.test(blokCss('.date-field input[type="date"]')))
    throw new Error("isian tidak didorong ke dasar kotak");
});

t("baris tanggal turun kolom SEBELUM labelnya pecah", () => {
  const b = blokCss(".date-strip");
  const m = /minmax\((\d+)px/.exec(b);
  if (!m) throw new Error("baris tanggal masih tiga kolom paksa");
  /* Diukur: di bawah 200px label "Estimated Delivery" beserta
     lencananya pecah dua baris. */
  if (Number(m[1]) < 200)
    throw new Error("ambang kolom terlalu sempit: " + m[1] + "px");
});

t("tombol turun ke baris sendiri, judul tidak diremas", () => {
  /* Blok tombol tidak pernah menyusut (flex-shrink: 0), jadi
     kekurangan ruang selalu ditanggung judul. Diukur: tombol 276px,
     judul butuh 354px untuk nama customer + baris No. Aju. */
  const b = blokCss(".ship-title-block");
  const m = /flex: 1 1 (\d+)px/.exec(b);
  if (!m) throw new Error("dasar lebar judul tidak diatur");
  if (Number(m[1]) < 354)
    throw new Error("dasar judul di bawah kebutuhannya: " + m[1] + "px");
  if (!/min-width: min\(/.test(b))
    throw new Error("judul tidak boleh menyempit di layar telepon");
});

t("penanda kapal tidak menindih keterangan sisa hari", () => {
  /* Penanda setinggi 26px dipusatkan pada jalur 3px, jadi menonjol
     ~11px ke atas. Jarak di bawah 12px membuatnya menindih "Telat 1
     Hari" — justru saat pengiriman hampir sampai. */
  const m = /margin-bottom: (\d+)px/.exec(blokCss(".lane-title"));
  if (!m) throw new Error("jarak judul jalur tidak diatur");
  if (Number(m[1]) < 12)
    throw new Error("jarak terlalu rapat: " + m[1] + "px");
});

t("baris update delay memakai aturan yang benar-benar berlaku", () => {
  /* .delay-strip-fields memakai FLEX. Aturan responsifnya dulu menulis
     grid-template-columns — tidak pernah berlaku sama sekali. */
  /* Diambil seluruh sisa berkas, bukan 900 karakter pertama: blok
     media ini bertambah panjang tiap ada perbaikan HP, dan potongan
     tetap akan diam-diam berhenti memeriksa apa pun. */
  const i = cssKartu.indexOf("@media (max-width: 599.98px)");
  const sempit = cssKartu.slice(i);
  if (/\.delay-strip-fields \{[^}]*grid-template-columns/.test(sempit))
    throw new Error("aturan grid pada wadah flex — tidak berlaku");
  if (!/\.delay-strip-fields \{[^}]*flex-direction: column/.test(sempit))
    throw new Error("baris delay tidak dipaksa satu per baris");
});

t("riwayat nomor digeser, bukan dibungkus", () => {
  /* Wadahnya sudah bergulir mendatar. Selama itu benar, membungkus isi
     sel tidak menghemat apa pun — ia memindahkan kesempitan dari kanan
     ke bawah, dan "11-08-2026" pecah jadi "11-08-" dan "2026".

     Diperiksa lewat gaya TERHITUNG, bukan pencocokan teks: aturan yang
     benar di satu tempat masih bisa dikalahkan aturan lain di bawahnya,
     dan itu justru cara cacat ini kembali. */
  const css = require("fs").readFileSync(__dirname + "/../css/docnum.css", "utf8");
  const d = new JSDOM(`<style>${css}</style>
    <div class="docnum-history-wrap"><table class="docnum-table"><tbody><tr>
      <td class="dn-num">DDI-CRBM-VIII-042</td>
      <td class="dn-col-tgl">11-08-2026</td>
      <td class="dn-col-pemohon">Yogi Firgiawan</td>
      <td>DYNAMIC DESIGN CO., LTD.</td>
      <td class="dn-act"></td>
    </tr></tbody></table></div>`);
  const W = d.window;
  [...W.document.querySelectorAll("td")].forEach((td) => {
    const ws = W.getComputedStyle(td).whiteSpace;
    if (ws !== "nowrap")
      throw new Error(`sel .${td.className || "(customer)"} masih boleh dibungkus (${ws})`);
  });
  /* Wadah yang tidak bergulir membuat nowrap jadi pemotongan, bukan
     penggeseran — isinya hilang di balik tepi tanpa cara melihatnya. */
  if (!/\.docnum-history-wrap\s*\{[^}]*overflow-x:\s*auto/.test(css))
    throw new Error("wadah riwayat tidak bergulir mendatar");
  /* Elipsis pada kolom Customer adalah jalan keluar dari tabel yang
     diremas; tabel yang digeser tidak membutuhkannya. */
  if (/text-overflow:\s*ellipsis/.test(css))
    throw new Error("nama customer masih dipotong elipsis");
});

t("kolom aksi cukup untuk lima tombol", () => {
  /* Tombolnya: perbaiki, detail, cetak, Excel, hapus. Kolom yang lebih
     sempit daripada isinya membuat tombolnya meluber ke sel sebelahnya
     dan tergambar di atas nama Customer. */
  const css = require("fs").readFileSync(__dirname + "/../css/docnum.css", "utf8");
  const semua = [...css.matchAll(/\.docnum-table td\.dn-act,[\s\S]{0,120}?min-width: (\d+)px/g)]
    .map((m) => Number(m[1]));
  if (!semua.length) throw new Error("lebar kolom aksi tidak diatur");
  // 5 tombol x 30px + celah, bahkan pada varian layar sempit
  semua.forEach((lebar) => {
    if (lebar < 180) throw new Error("kolom aksi " + lebar + "px terlalu sempit");
  });
  if (Math.max(...semua) < 200)
    throw new Error("varian layar besar butuh ~205px (5 x 33px + celah)");
});
t("label SI memakai rich text, bukan font sel", () => {
  /* Menyetel Wingdings ke SELURUH sel membuat labelnya ikut jadi
     lambang yang tak terbaca. */
  const v = w.ciplXlsLabelSI("Bill of Lading");
  eq(Array.isArray(v.richText), true);
  eq(v.richText[0].font.name, "Wingdings");
  eq(v.richText[0].text, "T");
  eq(v.richText[1].font.name, "Arial");
  if (!v.richText[1].text.includes("Bill of Lading"))
    throw new Error("label hilang dari rich text");
});
t("kolom aksi tabel tidak menindih kolom Customer", () => {
  const css = require("fs").readFileSync(__dirname + "/../css/docnum.css", "utf8");
  const i = css.indexOf(".docnum-table td:last-child");
  if (i < 0) throw new Error("kolom aksi tidak diatur");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/width: 1%/.test(blok))
    throw new Error("sel tombol tidak punya lebar sendiri");
});
t("enam JEDA kelompok tepat di tempat yang benar", () => {
  /* `garis` sekarang menandai JEDA, bukan garis: sesudah Port of
     Discharge, Volume, Ocean Freight, Stuffing Date, L/C Number, dan
     Special instruction. Nomor barisnya dipakai bersama oleh cetakan
     dan Excel, jadi tetap diuji walau bentuknya berubah. */
  const peta = w.eval("CIPL_SI_BARIS");
  const berjeda = peta.filter((x) => x.garis).map((x) => x.k);
  eq(berjeda.join(" | "),
     "Port of Discharge | Volume | Ocean Freight | Stuffing Date | L/C Number | Special instruction :");
  eq(berjeda.length, 6);
});
t("SI berbingkai luar, TANPA sekat di dalamnya", () => {
  /* Berkas rujukan DDI-CRBM-VIII-042.xlsx tidak punya satu garis pun di
     lembar SI — jaraknya yang memisahkan kelompok. Yang ada hanya
     bingkai selembar halaman. Garis tambahan membuat surat ini terbaca
     sebagai formulir. */
  const css = w.ciplCss();
  if (/\.si-garis/.test(css))
    throw new Error("sekat lama masih ada di SI");
  if (!/\.si-box \{[^}]*min-height/.test(css))
    throw new Error("bingkai SI tidak setinggi halaman");
  const h = w.ciplHalamanShippingInstruction(rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
  if (!/class="ci-box si-box"/.test(h))
    throw new Error("lembar SI tidak dibungkus bingkai luar");
});
t("Address jadi sub-label, bukan bagian nilainya", () => {
  const b = w.ciplBarisBarang(jadwalSI);
  const h = w.ciplHalamanShippingInstruction(rowSI, jadwalSI, b);
  if (!/si-sub[^>]*>Address</.test(h))
    throw new Error("Address tidak jadi sub-label");
  // dan hanya untuk Shipper & Consignee
  eq((h.match(/si-sub/g) || []).length, 2);
});
t("cetak & Excel membaca angka yang sama", () => {
  /* Keduanya lewat ciplSiData — menghitung dua kali berarti dua sumber
     angka yang akan berbeda pelan-pelan. */
  const b = w.ciplBarisBarang(jadwalSI);
  const d = w.ciplSiData(rowSI, jadwalSI, b);
  eq(d.gw, "300");
  eq(d.nw, "280");
  eq(d.koli, "4 PACKAGE");
  eq(d.hs, "84807190");
  eq(d.barang, "TYRE MOLD FULL SET");
});
t("PENJAGA: pustaka Excel dimuat dulu sebelum dipakai", () => {
  /* ExcelJS tidak ikut di halaman — dimuat sesuai kebutuhan lewat
     ensureExcelJS(). Bulk Export memanggilnya lebih dulu, jadi di sana
     selalu siap; fungsi yang langsung memakai ExcelJS gagal pada klik
     pertama di sesi yang belum pernah membuka Bulk Export. */
  ["unduhCiplExcel", "unduhTemplateBulk"].forEach((fn) => {
    const src = w.eval(fn + ".toString()");
    if (!/ExcelJS/.test(src)) return;      // tidak memakai pustakanya
    if (!/ensureExcelJS/.test(src))
      throw new Error(fn + " memakai ExcelJS tanpa memuatnya dulu");
  });
});
t("kegagalan Excel menyebutkan sebabnya", () => {
  /* Pesan generik menyembunyikan satu-satunya petunjuk yang dimiliki
     pengguna — dan juga yang memperbaikinya. */
  const src = w.eval("unduhCiplExcel.toString()");
  if (!/err && err\.message/.test(src) && !/err\.message/.test(src))
    throw new Error("pesan galat tidak menyebut sebabnya");
});
t("gabung sel tidak menggagalkan seluruh berkas", () => {
  const src = w.eval("ciplXlsGabung.toString()");
  if (!/try/.test(src)) throw new Error("mergeCells tidak dijaga");
});
t("unduhan Excel dijaga dari klik ganda", () => {
  const src = w.eval("unduhCiplExcel.toString()");
  if (!/ciplXlsSedangDibuat/.test(src))
    throw new Error("tidak ada penjagaan klik ganda");
  if (!/finally/.test(src))
    throw new Error("bendera dilepas tanpa finally — tombol bisa mati selamanya");
});
t("halaman ketiga: Shipping Instruction", () => {
  const b = w.ciplBarisBarang(jadwalSI);
  const h = w.ciplHalamanShippingInstruction(rowSI, jadwalSI, b);
  ["SHIPPING INSTRUCTION", "NO. 03", "PT WIDE LOGISTICS", "Bill of Lading",
   "Place of Receipt", "Port of Discharge", "TYRE MOLD FULL SET", "LCL",
   "4 PACKAGE", "84807190", "SIGN &amp; STAMP"].forEach((teks) => {
    if (!h.includes(teks)) throw new Error("hilang dari SI: " + teks);
  });
  if (!h.includes("ci-page2")) throw new Error("SI tidak dipaksa halaman baru");
});
t("baris yang diisi forwarder dibiarkan kosong", () => {
  /* PEB, Booking Number, Vessel, ETD/ETA, Stuffing Date diisi
     forwarder setelah menerima instruksinya — mengisinya dari tebakan
     kita menghilangkan gunanya. */
  const h = w.ciplHalamanShippingInstruction(rowSI, jadwalSI, w.ciplBarisBarang(jadwalSI));
  ["PEB NUMBER", "Booking Number", "Vessel", "ETD", "ETA", "Stuffing Date"]
    .forEach((k) => {
      const i = h.indexOf(">" + k + "<");
      if (i < 0) throw new Error("baris " + k + " hilang");
      const sesudah = h.slice(i, i + 260);
      if (/si-v[^>]*>[^<\s]/.test(sesudah))
        throw new Error(k + " terisi, seharusnya dikosongkan untuk forwarder");
    });
});
t("tanggal penutup memakai bentuk Indonesia", () =>
  eq(w.ciplTanggalId("2026-08-03"), "03 Agustus 2026"));
t("cetakan memuat ketiga halaman", () => {
  const b = w.ciplBarisBarang(jadwalSI);
  const semua = w.ciplHalamanInvoice(rowSI, jadwalSI, b) +
    w.ciplHalamanPacking(rowSI, jadwalSI, b) +
    w.ciplHalamanShippingInstruction(rowSI, jadwalSI, b);
  ["COMMERCIAL INVOICE", "PACKING LIST", "SHIPPING INSTRUCTION"].forEach((j) => {
    if (!semua.includes(j)) throw new Error("halaman hilang: " + j);
  });
});
t("tombol unduh Excel tersedia di baris invoice", () => {
  const src = w.eval("renderDocNumHistory.toString()");
  if (!/data-xls-cipl/.test(src)) throw new Error("tombol unduh Excel hilang");
});

console.log("— HALAMAN NO. DOKUMEN DI LAYAR SEMPIT —");
t("sidebar mendatar mulai dari lebar split-window", () => {
  /* Di 960px sidebar 300px masih berdiri dan menyisakan ~600px untuk
     form — sementara kolomnya tetap terbagi empat sejak 768px. */
  const css = require("fs").readFileSync(__dirname + "/../css/docnum.css", "utf8");
  const i = css.indexOf("@media (max-width: 1199px)");
  if (i < 0) throw new Error("sidebar belum menyusut di lebar split-window");
  const blok = css.slice(i, css.indexOf("@media", i + 10) < 0 ? css.length : css.indexOf("@media", i + 10));
  if (!/\.docnum-shell \{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(blok))
    throw new Error("sidebar masih memakan satu kolom tetap");
  if (!/\.docnum-tabs \{[^}]*flex-direction: row/.test(blok))
    throw new Error("daftar jenis dokumen tidak jadi mendatar");
});
t("kolom form menyesuaikan ruang, bukan terbagi empat", () => {
  const css = require("fs").readFileSync(__dirname + "/../css/docnum.css", "utf8");
  const i = css.indexOf("@media (max-width: 1199px)");
  const blok = css.slice(i);
  if (!/\[class\*="col-md-"\][\s\S]{0,80}\{[^}]*flex: 1 1 200px/.test(blok))
    throw new Error("kolom Bootstrap masih menentukan lebar isian");
});
t("tidak ada media query kembar di halaman No. Dokumen", () => {
  /* Dua blok dengan ambang sama saling menimpa dan menyulitkan
     ditelusuri saat salah satunya diubah. */
  const css = require("fs").readFileSync(__dirname + "/../css/docnum.css", "utf8");
  const ambang = [...css.matchAll(/@media \(max-width: ([\d.]+)px\)/g)].map((m) => m[1]);
  eq(ambang.length, new Set(ambang).size, "ambang: " + ambang.join(", "));
});

console.log("— BILAH SARINGAN DI LAYAR SEMPIT —");
const cssDash = require("fs").readFileSync(__dirname + "/../css/dashboard.css", "utf8");
/* Komentar dibuang: mencari nama properti di dalamnya menghasilkan
   temuan palsu — catatan yang menjelaskan kenapa sebuah aturan DIHAPUS
   tetap menyebut nama aturannya. */
const cssDashBersih = cssDash.replace(/\/\*[\s\S]*?\*\//g, "");
const blokMedia = (lebar) => {
  const i = cssDash.indexOf("@media (max-width: " + lebar + "px)");
  if (i < 0) throw new Error("media query " + lebar + "px tidak ada");
  let dalam = 0, j = cssDash.indexOf("{", i);
  for (let k = j; k < cssDash.length; k++) {
    if (cssDash[k] === "{") dalam++;
    else if (cssDash[k] === "}") { dalam--; if (!dalam) return cssDash.slice(i, k); }
  }
  return "";
};
t("baris ATAS: sakelar buku di kiri, cari & status didorong ke kanan", () => {
  const baris = $(".controlbar-row--top");
  const anak = [...baris.children];
  const idx = (sel) => anak.findIndex((el) => el.matches(sel) || el.querySelector(sel));
  const tab = idx(".mode-tabs, [data-mode]");
  const cari = idx(".search-box");
  const status = idx("#filterStatus");
  if (!(tab >= 0 && tab < cari && cari < status))
    throw new Error(`urutan baris atas salah \u2014 tab:${tab} cari:${cari} status:${status}`);
  if (baris.querySelector(".controlbar-tail"))
    throw new Error("tombol aksi seharusnya di baris BAWAH, bukan ikut baris atas");
  if (baris.querySelector(".date-range-picker"))
    throw new Error("rentang tanggal seharusnya di baris BAWAH");
});
t("baris BAWAH: rentang tanggal & basis di kiri, tombol aksi didorong ke kanan", () => {
  const baris = $(".controlbar-row--bottom");
  const anak = [...baris.children];
  const idx = (sel) => anak.findIndex((el) => el.matches(sel) || el.querySelector(sel));
  const rentang = idx(".date-range-picker");
  const basis = idx(".basis-select-wrap");
  const tail = idx(".controlbar-tail");
  if (!(rentang >= 0 && rentang < basis && basis < tail))
    throw new Error(`urutan baris bawah salah \u2014 rentang:${rentang} basis:${basis} tail:${tail}`);
  if (baris.querySelector(".mode-tabs"))
    throw new Error("sakelar buku seharusnya di baris ATAS");
});
t("kelompok kanan tiap baris didorong lewat margin-left:auto, bukan space-between", () => {
  /* Anak baris atas TIDAK selalu sama jumlahnya (banner "Lihat Saja"
     cuma muncul untuk viewer) -- space-between akan menyebar celahnya
     berbeda-beda tergantung peran yang login. */
  const css = require("fs").readFileSync(__dirname + "/../css/dashboard.css", "utf8");
  const iAtas = css.indexOf(".controlbar-row--top .search-box {");
  if (iAtas < 0) throw new Error("pendorong kanan baris atas (.search-box) tidak ditemukan");
  if (!/margin-left:\s*auto/.test(css.slice(iAtas, css.indexOf("}", iAtas))))
    throw new Error("kotak cari tidak didorong ke kanan di baris atas");
  const iTail = css.indexOf(".controlbar-tail {");
  if (!/margin-left:\s*auto/.test(css.slice(iTail, css.indexOf("}", iTail))))
    throw new Error("kelompok tombol tidak didorong ke kanan");
  const iBaris = css.indexOf(".controlbar-row--top,");
  if (/justify-content:\s*space-between/.test(css.slice(iBaris, css.indexOf("}", iBaris))))
    throw new Error("masih memakai space-between");
});
t("tombol cepat Hari Ini/Minggu Ini/Minggu Depan ada DI DALAM panel kalender", () => {
  const box = $(".controlbar-box");
  if (box.querySelector(".quick-date-group"))
    throw new Error(".quick-date-group seharusnya sudah tidak ada di bilah kendali");
  const dalamPopover = $("#dateRangePopover .drp-quick-row");
  if (!dalamPopover) throw new Error(".drp-quick-row tidak ditemukan di dalam panel kalender");
  ["btnQuickToday", "btnQuickWeek", "btnQuickNextWeek"].forEach((id) => {
    if (!dalamPopover.querySelector("#" + id))
      throw new Error("#" + id + " tidak ada di dalam .drp-quick-row");
  });
});
t("tombol bersihkan pencarian terpusat pada inputnya", () => {
  /* Sebagai inline-block, input menyisakan celah baseline sehingga
     pembungkusnya lebih tinggi — dan ✕ yang dipusatkan pada
     pembungkus turun beberapa piksel dari tengah kotak. */
  const css = require("fs").readFileSync(__dirname + "/../css/dashboard.css", "utf8");
  const i = css.indexOf('.search-box input[type="text"] {');
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/display: block/.test(blok))
    throw new Error("input masih inline-block, ✕ akan turun dari tengah");
});
t("PENJAGA: nowrap & lebar 100% tidak boleh bertemu", () => {
  /* Dengan flex-wrap: nowrap, item selebar 100% tidak bisa turun ke
     baris berikutnya — ia menindih tetangganya. Itu yang membuat
     tombol menumpuk di atas kendali lain pada tampilan mobile. */
  const bersih = cssDash.replace(/\/\*[\s\S]*?\*\//g, "");
  const punya = (blok, sel, prop) => {
    const i = blok.indexOf(sel + " {");
    if (i < 0) return false;
    return new RegExp(prop).test(blok.slice(i, blok.indexOf("}", i)));
  };
  [767, 991].forEach((lebar) => {
    const m = blokMedia(lebar).replace(/\/\*[\s\S]*?\*\//g, "");
    if (punya(m, ".controlbar-tail", "width: 100%") &&
        punya(m, ".controlbar-row--bottom", "flex-wrap: nowrap"))
      throw new Error(lebar + "px: kelompok tombol 100% tapi baris bawah nowrap");
    if (punya(m, ".search-box", "flex: 1 1 100%") &&
        punya(m, ".controlbar-row--top", "flex-wrap: nowrap"))
      throw new Error(lebar + "px: kotak cari 100% tapi baris atas nowrap");
  });
  if (!bersih) throw new Error("css kosong");
});
t("target sentuh di mobile minimal 44px", () => {
  /* 33px cukup untuk kursor, sempit untuk ujung jari. Dicari per-aturan
     (bukan kemunculan "min-height: 44px" yang pertama) -- ada beberapa
     aturan lain di blok ini yang juga memakai 44px. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const aturan = [...m.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  [".icon-btn", ".btn-more"].forEach((sel) => {
    const ketemu = aturan.some(
      (a) => a[1].includes(sel) && /min-height:\s*44px/.test(a[2]),
    );
    if (!ketemu) throw new Error(sel + " tidak ikut dinaikkan");
  });
});
t("kotak cari TIDAK penuh di layar sedang", () => {
  /* Di lebar split-window semuanya masih muat sebaris. Kotak cari
     selebar 100% mendorong saringan status & tombol turun, lalu satu
     baris terpakai hanya untuk tiga kendali kecil. */
  const m = blokMedia(991).replace(/\/\*[\s\S]*?\*\//g, "");
  const i = m.indexOf(".search-box {");
  if (i < 0) throw new Error("aturan kotak cari hilang");
  if (/flex: 1 1 100%/.test(m.slice(i, m.indexOf("}", i))))
    throw new Error("kotak cari masih dipenuhkan di layar sedang");
});
t("di mobile sakelar buku & kelompok tombol tetap sebaris penuh", () => {
  /* Cuma dua ini yang layak memakan baris utuh: sakelar buku penentu
     konteks seluruh halaman, dan tombol Tambah Jadwal yang butuh
     sasaran sentuh lebar. Sisanya dipadatkan (lihat tes di bawah). */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  [".mode-tabs", ".controlbar-tail"].forEach((sel) => {
    if (!new RegExp("\\" + sel + "\\s*\\{[^}]*(flex: 1 1 100%|width: 100%)").test(m))
      throw new Error(sel + " tidak mengambil baris penuh");
  });
});
t("tiga tombol ikon di rail kiri seragam ukuran & radiusnya", () => {
  /* Cari, rentang tanggal, dan "aksi lain" datang dari komponen yang
     berbeda dengan bawaan berbeda-beda (pil, kotak membulat, tombol
     ikon). Tanpa disamakan, kolomnya terlihat seperti tiga tombol asing
     yang kebetulan bertumpuk. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const aturan = [...m.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const rail = aturan.find(
    (a) =>
      a[1].includes(".search-box input") &&
      a[1].includes(".date-range-trigger") &&
      a[1].includes(".btn-more"),
  );
  if (!rail) throw new Error("ketiga tombol ikon tidak disamakan dalam satu aturan");
  if (!/width:\s*44px/.test(rail[2]) || !/height:\s*44px/.test(rail[2]))
    throw new Error("ukuran ketiganya tidak dikunci 44x44");
  if (!/border-radius:\s*var\(--r-sm\)/.test(rail[2]))
    throw new Error("radius ketiganya tidak disamakan");
});
t("di mobile kotak cari menyusut jadi ikon, melebar saat difokus ATAU saat masih ada isinya", () => {
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const i = m.indexOf(".search-box {");
  if (i < 0) throw new Error(".search-box tidak diatur di blok mobile");
  if (!/flex: 0 0 44px/.test(m.slice(i, m.indexOf("}", i))))
    throw new Error("kotak cari tidak menyusut jadi ikon 44px");
  if (!/\.controlbar \.search-box:focus-within,\s*\r?\n\s*\.controlbar \.search-box\.has-query\s*\{[^}]*flex: 1 1 100%/.test(m))
    throw new Error("kotak cari tidak melebar saat difokus / saat berisi");
  /* DIBATASI ke .controlbar: kotak cari di halaman Kelola Akun &
     Database HS Code tidak berbagi baris dengan kendali apa pun, jadi
     menciutkannya di sana cuma membuat kotaknya sempit tanpa alasan. */
  if (/\n  \.search-box \{/.test(m))
    throw new Error("penciutan masih memakai .search-box global -- halaman lain ikut kena");
});
t("kelas has-query dipasang ke kotak cari YANG BENAR", () => {
  /* Ada TIGA .search-box di halaman ini (bilah kendali, Kelola Akun,
     Database HS Code). Pemilih kelas polos mengembalikan yang pertama
     di dokumen -- bukan yang ini -- sehingga kotak di bilah kendali
     tidak pernah melebar dan kata kuncinya tumpah menembus ikon. */
  const kotak = $("#searchInput").closest(".search-box");
  const simpan = $("#searchInput").value;
  try {
    $("#searchInput").value = "Fedex";
    w.syncSearchClear();
    if (!kotak.classList.contains("has-query"))
      throw new Error("kotak cari di bilah kendali tidak menerima kelas has-query");
    $("#searchInput").value = "";
    w.syncSearchClear();
    if (kotak.classList.contains("has-query"))
      throw new Error("kelas has-query tidak dilepas saat pencarian dikosongkan");
  } finally {
    $("#searchInput").value = simpan;
    w.syncSearchClear();
  }
});
t("kotak cari lain di halaman TIDAK ikut kena kelas has-query", () => {
  const semua = [...w.document.querySelectorAll(".search-box")];
  if (semua.length < 2) throw new Error("prasyarat tes hilang: hanya ada satu .search-box");
  const milikKendali = $("#searchInput").closest(".search-box");
  const simpan = $("#searchInput").value;
  try {
    $("#searchInput").value = "Fedex";
    w.syncSearchClear();
    semua
      .filter((b) => b !== milikKendali)
      .forEach((b) => {
        if (b.classList.contains("has-query"))
          throw new Error("kotak cari lain ikut ditandai has-query");
      });
  } finally {
    $("#searchInput").value = simpan;
    w.syncSearchClear();
  }
});
t("saat menciut, isi kotak cari tidak tergambar menembus ikon", () => {
  /* Nilainya tetap ada & tetap menyaring -- yang disembunyikan cuma
     tampilannya selama tidak ada ruang untuk membacanya. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/\.search-box:not\(:focus-within\):not\(\.has-query\) input\[type="text"\],[\s\S]{0,140}color: transparent/.test(m))
    throw new Error("teks kotak cari yang menciut masih tergambar");
});
t("di mobile panel kalender diikat lebar LAYAR, bukan lebar pembungkusnya yang 44px", () => {
  /* .date-range-picker menyusut jadi tombol ikon 44px di lebar ini.
     Popover yang position: absolute mengambil lebar dari pembungkus
     itu, jadi `left:0; right:0` menghasilkan panel selebar 44px dan
     kalender 280px di dalamnya tumpah keluar kotak putihnya. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const i = m.indexOf(".drp-popover {");
  if (i < 0) throw new Error(".drp-popover tidak diatur di blok mobile");
  const blok = m.slice(i, m.indexOf("}", i));
  if (!/width:\s*calc\(100vw/.test(blok))
    throw new Error("lebar panel belum diikat ke layar");
  if (/right:\s*0/.test(blok))
    throw new Error("right: 0 masih ada -- lebarnya akan kembali mengikuti pembungkus 44px");
});
t("di mobile yang menggulir KALENDERNYA, bukan seluruh panel", () => {
  /* Kalau seluruh panel yang menggulir, Reset & Terapkan ikut terdorong
     keluar pandangan di layar pendek. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const iPop = m.indexOf(".drp-popover {");
  const blokPop = m.slice(iPop, m.indexOf("}", iPop));
  if (!/flex-direction:\s*column/.test(blokPop))
    throw new Error("panel bukan flex column -- anaknya tidak bisa dibatasi tingginya");
  const iGrid = m.indexOf(".drp-grids {", iPop);
  const blokGrid = m.slice(iGrid, m.indexOf("}", iGrid));
  if (!/overflow-y:\s*auto/.test(blokGrid))
    throw new Error("kalender tidak menggulir");
  if (!/min-height:\s*0/.test(blokGrid))
    throw new Error("tanpa min-height: 0 anak flex menolak menyusut, max-height jadi sia-sia");
});
t("di mobile kedua tombol IMPORT/EXPORT mengisi lebar pembungkusnya", () => {
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const i = m.indexOf(".mode-tabs button {");
  if (i < 0) throw new Error("tombol mode tidak diatur di blok mobile");
  if (!/flex:\s*1 1 0/.test(m.slice(i, m.indexOf("}", i))))
    throw new Error("tombolnya tidak melebar -- wadahnya penuh tapi isinya menyisakan bidang kosong");
});
t("di mobile rentang tanggal jadi ikon HANYA selama belum ada rentang dipilih", () => {
  /* Rentang yang sedang aktif terlalu penting untuk disembunyikan di
     balik ikon -- .has-value yang membedakannya. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/\.date-range-trigger:not\(\.has-value\)[\s\S]{0,160}display: none/.test(m))
    throw new Error("teks rentang tanggal tidak disembunyikan saat kosong, atau ikut hilang saat sudah terisi");
});
t("di mobile: tombol cepat tanggal (dalam panel kalender) boleh membungkus", () => {
  /* Sekarang di dalam .drp-quick-row (panel kalender), bukan baris
     utama lagi -- panelnya sendiri sudah dibatasi lebar (left:0;
     right:0), jadi cukup diberi flex-wrap sebagai jaring pengaman
     kalau tiga tombol pas-pasan di layar paling sempit. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/\.drp-quick-row\s*\{[^}]*flex-wrap: wrap/.test(m))
    throw new Error(".drp-quick-row tidak diizinkan membungkus di mobile");
});
t("di mobile baris tombol dipakai penuh, tidak menempel di kanan", () => {
  /* Uji ini dulu MENUNTUT `margin-left: auto` — persis penyebab baris
     terakhir hampir kosong. Ia mengunci susunan yang salah, jadi
     tuntutannya dibalik, bukan sekadar dihapus: kalau `auto` kembali,
     ruang melompong itu ikut kembali. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\.controlbar-tail \{[^}]*margin-left: auto/.test(m))
    throw new Error("tombol aksi didorong ke kanan lagi — barisnya jadi melompong");
  if (!/\.controlbar-tail \{[^}]*width: 100%/.test(m))
    throw new Error("baris tombol tidak dipakai penuh");
});
t("susunan split-window sama dengan layar besar", () => {
  /* Tidak ada elemen yang berpindah tempat — orang yang bolak-balik
     antara layar lebar dan sempit tidak perlu mencari ulang. */
  const m = blokMedia(991).replace(/\/\*[\s\S]*?\*\//g, "");
  ["order:", "display: contents", "position: absolute"].forEach((p) => {
    if (m.includes(p))
      throw new Error("susunan diubah lewat " + p + " — elemen berpindah tempat");
  });
  if (!/#btnAdd #lblAddBtn \{[^}]*display: none/.test(m))
    throw new Error("label tombol tambah masih tampil");
});
t("tombol Tambah Jadwal jadi ikon saja", () => {
  const m = blokMedia(991);
  if (!/#btnAdd #lblAddBtn \{[^}]*display: none/.test(m))
    throw new Error("label tombol masih tampil di layar sempit");
});
t("tombol ikon tidak dilebarkan lagi di layar terkecil", () => {
  const m = blokMedia(767);
  if (/\.controlbar-tail \.btn-primary-navy \{[^}]*flex: 1;/.test(m))
    throw new Error("tombol ikon melar setengah layar");
});
t("tooltip tombol ikut berpindah buku", () => {
  tulis("activeMode", "import");
  w.render();
  const impor = $("#btnAdd").title;
  tulis("activeMode", "export");
  w.render();
  const ekspor = $("#btnAdd").title;
  tulis("activeMode", "import");
  if (!impor || !ekspor) throw new Error("tooltip kosong");
  if (impor === ekspor) throw new Error("tooltip tidak berubah: " + impor);
});

console.log("— LABEL RUTE TIDAK MELUBER KELUAR KARTU —");
function laneMulti(stops) {
  return w.buildLaneHtml({ mode: "import", transport: "udara",
    origin: "ICN", destination: "CGK", etd: "2026-08-13", eta: "2026-08-14",
    routeType: "transit", routeStops: stops, docProgress: {} });
}
t("transit dekat tepi kiri dirata KIRI, bukan tengah", () => {
  /* Label rata-tengah menjorok separuh lebarnya ke kiri; pada simpul
     yang jatuh di ~0% separuh itu keluar dari kartu. */
  const h = laneMulti([{ terminal: "TSN", date: "2026-08-13" }]);
  const label = h.match(/<div class="p p--node p--(\w+)"[^>]*left:([\d.]+)%/g) || [];
  eq(label.length >= 2, true, "label simpul tidak tergambar:");
  [...h.matchAll(/p--node p--(\w+)"[^>]*left:([\d.]+)%/g)].forEach((m) => {
    const [, align, kiri] = m;
    const f = Number(kiri);
    if (f <= 12 && align !== "start")
      throw new Error(`simpul di ${f}% dirata ${align} — akan meluber ke kiri`);
    if (f >= 88 && align !== "end")
      throw new Error(`simpul di ${f}% dirata ${align} — akan meluber ke kanan`);
  });
});
t("simpul di tengah tetap rata tengah", () => {
  const h = laneMulti([{ terminal: "SIN", date: "2026-08-13" }]);
  const tengah = [...h.matchAll(/p--node p--(\w+)"[^>]*left:([\d.]+)%/g)]
    .filter((m) => Number(m[2]) > 12 && Number(m[2]) < 88);
  tengah.forEach((m) => eq(m[1], "center", `simpul di ${m[2]}%:`));
});
t("ujung rute tetap rata kiri & kanan", () => {
  const h = laneMulti([{ terminal: "SIN", date: "2026-08-13" }]);
  const semua = [...h.matchAll(/p--node p--(\w+)"[^>]*left:([\d.]+)%/g)];
  eq(semua[0][1], "start");
  eq(semua[semua.length - 1][1], "end");
});

console.log("\u2014 JAM ETD/ETA: PRESISI SEHARI PENUH UNTUK PENERBANGAN SEHARI \u2014");
/* PENTING: todayISO() di seluruh berkas tes ini SENGAJA di-mock ke
   HARI_INI_UJI (lihat baris ~91) supaya tes tanggal lain deterministik
   -- tapi laneProgress() versi BERJAM memakai `new Date()` SUNGGUHAN
   untuk "sekarang" (bukan todayISO() yang di-mock, lihat komentarnya
   sendiri di route-model.js), karena begitu jam ikut dipakai, yang
   relevan adalah momen SUNGGUHAN, bukan tanggal tes yang dibekukan.
   Jadi tes DENGAN jam di bawah ini pakai tanggal HARI INI SUNGGUHAN
   (bukan HARI_INI_UJI), sementara tes TANPA jam tetap pakai
   HARI_INI_UJI seperti tes tanggal lainnya. */
function tanggalSungguhanHariIni() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
/* Tanggal DAN jam diambil dari objek Date yang SAMA, jadi pergeseran
   yang melewati tengah malam ikut memindahkan tanggalnya. Memasangkan
   jam hasil geseran dengan tanggal hari ini membuat tes ini gagal tiap
   kali dijalankan lewat tengah malam -- jamnya jatuh di hari kemarin
   sementara tanggalnya tetap hari ini, jadi ETD malah terbaca di masa
   depan. */
function geserJam(offsetJam) {
  const d = new Date(Date.now() + offsetJam * 3600000);
  const p2 = (n) => String(n).padStart(2, "0");
  return {
    tgl: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    jam: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
  };
}
t("parseLocalDateTime: dengan jam -> tanggal+jam sungguhan, bukan tengah malam", () => {
  const dt = w.parseLocalDateTime("2026-08-13", "14:30");
  eq(dt.getHours(), 14);
  eq(dt.getMinutes(), 30);
  eq(dt.getDate(), 13);
});
t("parseLocalDateTime: tanpa jam -> jatuh ke tengah malam, sama seperti parseLocalDate()", () => {
  const dt = w.parseLocalDateTime("2026-08-13", "");
  eq(dt.getHours(), 0);
  eq(dt.getMinutes(), 0);
});
t("ETD=ETA (tanggal sama) TANPA jam -> tetap 0 seperti sebelum fitur jam ada (tidak boleh berubah)", () => {
  /* Bukan 0,5 seperti dugaan awal -- today<=etd sudah lebih dulu benar
     saat keduanya TEPAT sama (sama-sama tengah malam), jadi cabang
     total<=0 tidak pernah tercapai di jalur tanpa jam. Diverifikasi ke
     perilaku SEBELUM perubahan ini: sama, tetap 0. */
  const p = w.laneProgress({ etd: HARI_INI_UJI, eta: HARI_INI_UJI, docProgress: {} });
  eq(p, 0);
});
t("ETD=ETA (tanggal sama) DENGAN jam -> pecahan sungguhan dari jam saat ini, bukan 0,5 buta", () => {
  /* ETD 2 jam lalu, ETA 2 jam lagi -- "sekarang" persis di tengah
     rentang 4 jam itu, kapan pun tes ini dijalankan. */
  const a = geserJam(-2), b = geserJam(2);
  const s = { etd: a.tgl, eta: b.tgl, etdTime: a.jam, etaTime: b.jam, docProgress: {} };
  const p = w.laneProgress(s);
  // Mestinya di sekitar tengah (0,5) rentang 4 jam -- diberi jarak toleransi wajar, bukan angka pas.
  if (!(p > 0.3 && p < 0.7))
    throw new Error("progress " + p + " -- diharap di sekitar 0,5 (tengah rentang 4 jam)");
});
t('cuma SATU sisi yang punya jam -> jatuh ke presisi hari (tidak dicampur jam+tengah malam)', () => {
  const p = w.laneProgress({ etd: HARI_INI_UJI, eta: HARI_INI_UJI, etdTime: "08:00", docProgress: {} });
  eq(p, 0, "cuma etdTime terisi, etaTime kosong -- harus tetap jatuh ke jalur tanpa jam (hasilnya 0, sama seperti di atas):");
});
t("jam ETA lebih awal dari jam ETD di tanggal yang sama (entri terbalik) -> tetap angka sah 0..1, bukan NaN/di luar batas", () => {
  /* Bukan hasil yang "benar" secara bisnis (ETA sebelum ETD memang
     data yang salah) -- yang dijaga di sini cuma TIDAK melempar error
     ataupun menghasilkan NaN/negatif/di atas 1 gara-gara pengurangan
     tanggal jadi negatif. */
  const hari = tanggalSungguhanHariIni();
  const s = { etd: hari, eta: hari, etdTime: "18:00", etaTime: "06:00", docProgress: {} };
  const p = w.laneProgress(s);
  if (!(isFinite(p) && p >= 0 && p <= 1))
    throw new Error("hasil tidak sah: " + p);
});
t("sebelum ETD (dengan jam) -> 0, seperti sebelum ETD versi tanpa jam", () => {
  const a = geserJam(1), b = geserJam(3);
  const s = { etd: a.tgl, eta: b.tgl, etdTime: a.jam, etaTime: b.jam, docProgress: {} };
  eq(w.laneProgress(s), 0);
});
t("sesudah ETA (dengan jam) -> 0,96, dan sudahTibaTerminal() sepakat -> ikon mobil", () => {
  const a = geserJam(-3), b = geserJam(-1);
  const s = { etd: a.tgl, eta: b.tgl, etdTime: a.jam, etaTime: b.jam,
    transport: "udara", origin: "ICN", destination: "CGK", mode: "import", docProgress: {} };
  eq(w.laneProgress(s), 0.96);
  const h = w.buildLaneHtml(s);
  if (!/<rect x="7" y="7\.5"/.test(h))
    throw new Error("ikon belum ganti mobil walau ETA (dengan jam) sudah lewat");
});
t("ETD/ETA tampil dengan jam di label jalur, kalau jamnya terisi", () => {
  const h = w.buildLaneHtml({ etd: "2026-08-13", eta: "2026-08-14",
    etdTime: "09:15", etaTime: "17:45", docProgress: {} });
  if (!h.includes("09:15")) throw new Error("jam ETD tidak tampil");
  if (!h.includes("17:45")) throw new Error("jam ETA tidak tampil");
});
t("tanpa jam -> label ETD/ETA tetap seperti sebelumnya, tidak ada '· ' menggantung", () => {
  const h = w.buildLaneHtml({ etd: "2026-08-13", eta: "2026-08-14", docProgress: {} });
  if (/ETD <b>[^<]*·/.test(h)) throw new Error("ada '·' menggantung di label ETD walau jam kosong");
  if (/ETA <b>[^<]*·/.test(h)) throw new Error("ada '·' menggantung di label ETA walau jam kosong");
});

console.log("\u2014 IKON MOBIL SETELAH ETA TERCAPAI \u2014");
function laneIkon(over) {
  return w.buildLaneHtml(Object.assign({
    mode: "import", origin: "ICN", destination: "CGK", docProgress: {},
  }, over));
}
t("sebelum ETA, transport udara -> ikon pesawat, BUKAN mobil", () => {
  const besok = w.addCalendarDaysISO(w.todayISO(), 3);
  const h = laneIkon({ transport: "udara", etd: w.todayISO(), eta: besok });
  if (!/M21\.6 12/.test(h)) throw new Error("ikon pesawat tidak ditemukan");
  if (/<rect x="7" y="7\.5"/.test(h)) throw new Error("ikon mobil ikut muncul, seharusnya belum");
});
t("sebelum ETA, transport laut -> ikon kapal, BUKAN mobil", () => {
  const besok = w.addCalendarDaysISO(w.todayISO(), 3);
  const h = laneIkon({ transport: "laut", etd: w.todayISO(), eta: besok });
  if (!/M6\.2 9\.6/.test(h)) throw new Error("ikon kapal tidak ditemukan");
  if (/<rect x="7" y="7\.5"/.test(h)) throw new Error("ikon mobil ikut muncul, seharusnya belum");
});
t("ETA sudah lewat -> ikon berganti mobil, apa pun moda internasionalnya", () => {
  const kemarin = w.addCalendarDaysISO(w.todayISO(), -1);
  const hUdara = laneIkon({ transport: "udara", etd: "2026-07-01", eta: kemarin });
  const hLaut = laneIkon({ transport: "laut", etd: "2026-07-01", eta: kemarin });
  [hUdara, hLaut].forEach((h) => {
    if (!/<rect x="7" y="7\.5"/.test(h)) throw new Error("ikon mobil tidak muncul sesudah ETA lewat");
    if (/M21\.6 12/.test(h)) throw new Error("ikon pesawat masih tergambar sesudah ETA lewat");
    if (/M6\.2 9\.6/.test(h)) throw new Error("ikon kapal masih tergambar sesudah ETA lewat");
  });
});
t("status Arrived -> ikon mobil, walau ETA-nya (secara data) belum tentu lewat", () => {
  const besok = w.addCalendarDaysISO(w.todayISO(), 3);
  const h = laneIkon({ transport: "udara", etd: w.todayISO(), eta: besok, status: "arrived" });
  if (!/<rect x="7" y="7\.5"/.test(h)) throw new Error("ikon mobil tidak muncul walau sudah Arrived");
});
t("kelas penanda: is-road sesudah ETA (bukan is-air/is-sea milik moda internasional)", () => {
  const kemarin = w.addCalendarDaysISO(w.todayISO(), -1);
  const h = laneIkon({ transport: "udara", etd: "2026-07-01", eta: kemarin });
  if (!/ship-marker[^"]*\bis-road\b/.test(h)) throw new Error("kelas is-road tidak ditemukan");
  if (/ship-marker[^"]*\bis-air\b/.test(h)) throw new Error("is-air masih terpasang, seharusnya sudah is-road");
});
t("kelas penanda: masih is-air/is-sea SEBELUM ETA (moda internasional asli)", () => {
  const besok = w.addCalendarDaysISO(w.todayISO(), 3);
  const h = laneIkon({ transport: "udara", etd: w.todayISO(), eta: besok });
  if (!/ship-marker[^"]*\bis-air\b/.test(h)) throw new Error("is-air tidak ditemukan sebelum ETA");
  if (/ship-marker[^"]*\bis-road\b/.test(h)) throw new Error("is-road sudah terpasang, seharusnya belum");
});

console.log("— TIDAK ADA PENANDA MELEWATI ETA —");
t("papan tidak lagi memperingatkan ETA terlewat", () => {
  /* Yang dijanjikan ke orang adalah Estimated Delivery, bukan ETA.
     Kalau memang meleset, Lapis 4 yang menggesernya. */
  const kemarin = w.addCalendarDaysISO(w.todayISO(), -1);
  const h = w.buildLaneHtml({ mode: "import", etd: "2026-07-26",
    eta: kemarin, docProgress: {} });
  if (/Melewati ETA/.test(h)) throw new Error("penanda masih muncul");
  if (/delay-flag/.test(h)) throw new Error("kelas delay-flag masih tergambar");
});
t("keterlambatan tetap terlihat lewat Lapis 4", () => {
  const d = w.predictDelivery({ mode: "import", transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct",
    etaMode: "manual", eta: "2026-06-01", docProgress: {} });
  eq(d.shifted, true);
  if (!(d.overdueDays > 0)) throw new Error("keterlambatan tidak terhitung");
});

console.log("— NAMA SHIPPER/BUYER SELALU HURUF BESAR —");
t("mengetik langsung jadi huruf besar", () => {
  const el = $("#fParty");
  el.value = "pt wide logistics";
  el.dispatchEvent(new w.Event("input"));
  eq(el.value, "PT WIDE LOGISTICS");
});
t("berlaku di kedua buku", () => {
  ["import", "export"].forEach((m) => {
    tulis("activeMode", m);
    const el = $("#fParty");
    el.value = "Dynamic Design co., ltd.";
    el.dispatchEvent(new w.Event("input"));
    eq(el.value, "DYNAMIC DESIGN CO., LTD.", m + ":");
  });
  tulis("activeMode", "import");
});

console.log("— TOTAL QTY DIJUMLAH PER SATUAN —");
t("1 EA + 60.000 SET, bukan 60.001", () => {
  const c = w.computeCustoms({ items: [
    { qty: 1, satuan: "EA" }, { qty: 60000, satuan: "SET" } ] });
  eq(w.fmtQtyBySatuan(c.qtyBySatuan), "1 EA + 60.000 SET");
});
t("satuan yang sama digabung", () => {
  const c = w.computeCustoms({ items: [
    { qty: 1, satuan: "SET" }, { qty: 50, satuan: "PCS" }, { qty: 15, satuan: "PCS" } ] });
  eq(w.fmtQtyBySatuan(c.qtyBySatuan), "1 SET + 65 PCS");
});
t("huruf besar/kecil bukan satuan berbeda", () => {
  const c = w.computeCustoms({ items: [
    { qty: 2, satuan: "pcs" }, { qty: 3, satuan: "PCS" } ] });
  eq(w.fmtQtyBySatuan(c.qtyBySatuan), "5 PCS");
});
t("satuan kosong tetap ikut terhitung", () => {
  const c = w.computeCustoms({ items: [{ qty: 7, satuan: "" }] });
  eq(w.fmtQtyBySatuan(c.qtyBySatuan), "7");
});
t("tanpa barang -> 0", () => eq(w.fmtQtyBySatuan([]), "0"));

console.log("— KURIR: KOMITMEN PINTU-KE-PINTU —");
const kurir = { mode: "import", transport: "udara", origin: "ICN", destination: "CGK",
  routeType: "direct", etd: "2026-08-06", eta: "2026-08-07", etaMode: "manual", docProgress: {} };
t("FedEx Priority = 3 hari kerja dari KEDATANGAN", () => {
  /* Berangkat Kam 06, mendarat Jum 07. Sabtu & Minggu dilewati, jadi
     tiga hari kerjanya Sen 10, Sel 11, Rab 12 — sama dengan estimasi
     yang dikeluarkan FedEx sendiri. */
  const d = w.predictDelivery({ ...kurir, vessel: "FEDEX PRIORITY FX6068" });
  eq(d.base, "2026-08-07");
  eq(d.date, "2026-08-12");
  eq(d.steps[0].key, "courier");
  eq(d.steps[0].days, 3);
});
t("FedEx Economy = 5 hari kerja", () =>
  eq(w.predictDelivery({ ...kurir, vessel: "Fedex International Economy" }).date, "2026-08-14"));
t("layanan tidak disebut -> dianggap Priority", () =>
  eq(w.predictDelivery({ ...kurir, vessel: "FEDEX" }).date, "2026-08-12"));
t("ATA yang dikonfirmasi menggeser komitmennya", () => {
  // Pesawat telat mendarat Sel 11 -> 3 hari kerja jadi Rab,Kam,Jum 14
  const d = w.predictDelivery({ ...kurir, vessel: "FEDEX PRIORITY",
    docProgress: { berth: { date: "2026-08-11" } } });
  eq(d.base, "2026-08-11");
  eq(d.date, "2026-08-14");
});
t("Manifest & Berths TIDAK menghentikan komitmen", () => {
  const d = w.predictDelivery({ ...kurir, vessel: "FEDEX PRIORITY",
    docProgress: { manifest: { date: "2026-08-05" } } });
  eq(d.steps[0].key, "courier");
  eq(d.date, "2026-08-12");   // manifest lebih awal dari ETA, jadi tak menggeser
});
t("komitmen TIDAK dipecah jadi transit+clearance+antar", () => {
  const d = w.predictDelivery({ ...kurir, vessel: "FEDEX PRIORITY" });
  eq(d.steps.length, 1);
  eq(d.steps.some((x) => x.key === "clearance"), false);
});
t("PIB/Billing/SPPB menghentikan komitmen brosur", () => {
  const d = w.predictDelivery({ ...kurir, vessel: "FEDEX PRIORITY",
    docProgress: { sppb: { date: "2026-08-20" } } });
  eq(d.baseLabel, "Tanggal SPPB");
  eq(d.date, "2026-08-21");
});
t("maskapai biasa TIDAK memakai komitmen kurir", () => {
  const d = w.predictDelivery({ ...kurir, vessel: "GA879" });
  eq(d.steps.some((x) => x.key === "courier"), false);
  eq(d.steps.map((x) => x.key).join(">"), "clearance>delivery");
});

console.log("— TEMPLATE EXCEL BULK IMPORT —");
t("kolom templat PERSIS sama dengan yang dibaca importer", () => {
  /* Templat dibuat dari daftar header yang sama dengan pembacanya.
     Kalau suatu saat dipisah, unggahan pengguna akan ditolak tanpa
     mereka tahu sebabnya. */
  const hI = w.eval("IMPORT_BULK_HEADERS");
  const hE = w.eval("EXPORT_BULK_HEADERS");
  eq(hI[0], "NO");
  eq(hE[0], "NO");
  if (hI.length < 20 || hE.length < 15) throw new Error("daftar kolom terlalu pendek");
});
t("baris contoh mengisi kolom yang benar", () => {
  const r = w.templateRowsImport();
  const IDX = w.eval("IMPORT_IDX");
  eq(r.length, 2);
  eq(r[0][IDX.NO], 1);
  eq(r[0][IDX.SAT], "PCS");
  eq(r[0][IDX.PACKAGE], "5 BOX");
  // instanceof w.Date, bukan Date: objek dibuat di realm jendela
  if (!(r[0][IDX.FACTORY] instanceof w.Date))
    throw new Error("tanggal bukan Date — Excel akan membacanya sebagai teks");
});
t("baris barang KEDUA mengosongkan kolom pengiriman", () => {
  /* Aturan yang paling sering salah dipahami: baris kedua hanya berisi
     barang, supaya tidak terbaca sebagai jadwal terpisah. */
  const r = w.templateRowsImport();
  const IDX = w.eval("IMPORT_IDX");
  eq(r[1][IDX.NO], "");
  eq(r[1][IDX.PARTY], "");
  eq(r[1][IDX.INVOICE], "");
  if (!r[1][IDX.DESC]) throw new Error("baris kedua tidak berisi barang");
});
t("templat Export memakai dimensi, bukan jumlah koli", () => {
  const r = w.templateRowsExport();
  const IDX = w.eval("EXPORT_IDX");
  eq(r[0][IDX.PACKAGE], "82*82*75");     // Export -> CBM
  eq(r[0][IDX.INCOTERM], "FOB");
});
t("lembar keterangan menjelaskan aturan yang tak bisa ditebak", () => {
  const c = w.templateCatatanRows("import");
  const teks = c.map((x) => x.join(" ")).join(" ");
  ["NO", "baris barang", "Tanggal", "HS CODE", "PACKAGE"].forEach((k) => {
    if (!teks.includes(k)) throw new Error("keterangan " + k + " hilang");
  });
});
t("keterangan PACKAGE berbeda per buku", () => {
  const imp = w.templateCatatanRows("import").map((x) => x.join(" ")).join(" ");
  const exp = w.templateCatatanRows("export").map((x) => x.join(" ")).join(" ");
  if (!/5 BOX/.test(imp)) throw new Error("Import harus menyebut jumlah koli");
  if (!/82\*82\*75/.test(exp)) throw new Error("Export harus menyebut dimensi");
});

console.log("— INGAT SAYA DI PERANGKAT INI —");
t("bawaannya diingat", () => {
  w.localStorage.removeItem("exim.remember");
  eq(w.bacaRemember(), true);
});
t("tidak dicentang -> nama pengguna dilupakan", () => {
  w.simpanRemember(false, "yogi");
  eq(w.bacaRemember(), false);
  eq(w.localStorage.getItem("exim.remember.user"), null);
});
t("dicentang -> nama pengguna diingat", () => {
  w.simpanRemember(true, "yogi");
  eq(w.bacaRemember(), true);
  eq(w.localStorage.getItem("exim.remember.user"), "yogi");
});
t("batas diam mengikuti pilihan Ingat saya", () => {
  /* Ini inti keluhannya: dulu batasnya 30 menit untuk semua orang,
     jadi centang "Ingat saya" menjanjikan sesi bertahan lalu dicabut
     timer setengah jam kemudian. Ditinggal rapat sekali saja sudah
     harus masuk lagi. */
  w.simpanRemember(true, "yogi");
  eq(w.batasDiamMenit(), 480);          // 8 jam
  w.simpanRemember(false, "yogi");
  eq(w.batasDiamMenit(), 30);
});
t("batas dibaca ulang tiap timer disetel, bukan sekali saat dimuat", () => {
  /* Kalau nilainya dibekukan ke sebuah const saat berkas dimuat, login
     pertama setelah pilihannya diubah masih memakai nilai sesi
     SEBELUMNYA — salah tepat pada saat penggunanya baru saja mengubah
     pilihan itu. */
  w.simpanRemember(false, "yogi");
  eq(w.batasDiamMenit(), 30);
  w.simpanRemember(true, "yogi");
  eq(w.batasDiamMenit(), 480, "berubah tanpa muat ulang halaman:");
});
t("batasnya TIDAK pernah hilang sama sekali", () => {
  /* Papan ini dipakai bergantian di komputer yang sama. Sesi yang
     tidak pernah putus berarti pekerjaan bisa tersimpan atas nama
     orang yang salah. */
  [true, false].forEach((ingat) => {
    w.simpanRemember(ingat, "yogi");
    const m = w.batasDiamMenit();
    if (!(m > 0 && isFinite(m))) throw new Error("batas diam hilang saat ingat=" + ingat);
  });
});
t("hitung mundur menyebut lama yang benar, dalam jam", () => {
  /* "480 menit" benar secara angka tapi tidak terbaca. Dan pesannya
     harus menyebut batas yang BENAR-BENAR dipakai timer berjalan —
     bukan menghitung ulang, yang bisa menyebut angka berbeda dari
     waktu yang sudah berlalu. */
  w.eval("sesiDiamDipakai = 480");
  if (!/8 jam/.test(w.pesanHitungMundur()))
    throw new Error("pesan tidak menyebut 8 jam: " + w.pesanHitungMundur());
  w.eval("sesiDiamDipakai = 30");
  if (!/30 menit/.test(w.pesanHitungMundur()))
    throw new Error("pesan tidak menyebut 30 menit: " + w.pesanHitungMundur());
  w.eval("sesiDiamDipakai = 90");
  eq(w.lamaDiamTerbaca(), "1 jam 30 menit");
});
t("batas diam TIDAK diumumkan di layar masuk", () => {
  /* Dulu ada keterangan "8 jam / 30 menit" di bawah centang. DIHAPUS
     ATAS PERMINTAAN, dan uji ini dibalik supaya tidak dikembalikan
     tanpa sengaja oleh siapa pun yang membaca CSS-nya dan mengira
     ada yang hilang.

     Angkanya sendiri tetap dijaga uji-uji di atas: yang berubah cuma
     apakah ia ditulis di layar masuk, bukan apakah batasnya benar. */
  if (w.document.querySelector(".login-remember-note"))
    throw new Error("keterangan batas diam muncul lagi di layar masuk");
});
t("form login terisi ulang dari yang diingat", () => {
  w.simpanRemember(true, "yogi");
  $("#loginUsername").value = "";
  $("#loginRemember").checked = false;
  w.siapkanFormRemember();
  eq($("#loginUsername").value, "yogi");
  eq($("#loginRemember").checked, true);
});
t("memuat ulang tab BUKAN menutup peramban", () => {
  /* Penanda sessionStorage bertahan saat tab dimuat ulang dan hilang
     saat peramban ditutup — jadi menyegarkan halaman tidak melempar
     pengguna keluar. */
  w.sessionStorage.removeItem("exim.session-alive");
  eq(w.perambanBaruDibuka(), true);    // pertama kali
  eq(w.perambanBaruDibuka(), false);   // muat ulang berikutnya
});

console.log("— PERFORMA JALUR RENDER —");
t("prediksi 200 kartu selesai di bawah 150 ms", () => {
  /* predictDelivery dipanggil sekali per kartu tiap papan digambar
     ulang. Pernah 114 ms untuk 200 kartu — jank yang terasa saat
     mengetik di form, karena tiap ketukan menggambar ulang. */
  const pelabuhan = ["KRPUS", "CNSHA", "VNSGN", "IDTPP", "CNNGB"];
  const kapal = ["HMM MIRACLE 0009S", "MSC LORENA", "FEDEX PRIORITY", "GA879", ""];
  const papan = [];
  for (let i = 0; i < 200; i++) {
    papan.push({ id: "p" + i, mode: "import", transport: i % 3 ? "laut" : "udara",
      muatan: i % 2 ? "FCL" : "LCL", origin: pelabuhan[i % 5], destination: "IDTPP",
      routeType: "direct", etd: "2026-07-20", eta: "2026-08-10", etaMode: "manual",
      vessel: kapal[i % 5], docProgress: {} });
  }
  papan.forEach((s) => w.predictDelivery(s));   // pemanasan
  const t0 = Date.now();
  papan.forEach((s) => w.predictDelivery(s));
  const ms = Date.now() - t0;
  if (ms > 60) throw new Error(ms + " ms untuk 200 kartu");
});
t("pemilih aturan hanya mengalokasikan yang cocok", () => {
  /* Bentuk lama membungkus SELURUH aturan lalu membuang hampir
     semuanya di tahap filter — tiga puluh objek per kartu. */
  const ctxUji = w.predictionContext({ transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct" });
  const cocok = w.rankPredictionRules(PC.routes, ctxUji);
  if (cocok.length >= PC.routes.length)
    throw new Error("semua aturan ikut terbawa, penyaringan tidak jalan");
  eq(cocok[0].id, "cn-sea-sha-ngb-tpp");   // yang paling rinci tetap menang
});
t("perbandingan cepat tidak mengubah hasil pencocokan", () => {
  // Huruf besar/kecil tetap tidak dibedakan
  const ctxKecil = w.predictionContext({ transport: "laut", muatan: "FCL",
    origin: "cnsha", destination: "idtpp", routeType: "direct" });
  eq(w.rankPredictionRules(PC.routes, ctxKecil)[0].id, "cn-sea-sha-ngb-tpp");
  // Nilai kosong tetap menggugurkan aturan yang menuntutnya
  const ctxKosong = w.predictionContext({ transport: "laut", muatan: "FCL" });
  eq(w.rankPredictionRules(PC.routes, ctxKosong)[0].id, "default");
});
t("alias carrier dinormalkan sekali, bukan tiap pencocokan", () => {
  const line = w.eval("CARRIER_MASTER.shippingLines[0]");
  if (!Array.isArray(line._alias)) throw new Error("indeks alias belum disiapkan");
  eq(line._alias.includes("MSC"), true);
});
t("resolusi pelabuhan diingat", () => {
  const a = w.resolvePortEntry("Tanjung Priok");
  const b = w.resolvePortEntry("Tanjung Priok");
  if (a !== b) throw new Error("hasil tidak dipakai ulang");
});

console.log("— EKSTRAKSI CIPL NYATA: DD-DI26080701 (DHL, udara) —");
/* Halaman PDF asli, disimpan apa adanya sebagai koordinat kata.
   Berkas ini dipilih karena templatnya BERBEDA dari contoh sebelumnya:
   baris ukuran memakai kata "Dimension", kolom kiri berisi rujukan PO,
   dan tanggal berangkatnya kosong (tercetak "Jan 00, 1900"). */
const halamanDhl = JSON.parse(
  require("fs").readFileSync(__dirname + "/fixture-cipl-dhl.json", "utf8"),
);
const teksDhl = halamanDhl.map((p) => w.pdfLines(p).map((l) => l.text).join("\n")).join("\n");
const hasilDhl = w.parseCiplPdfText(teksDhl, halamanDhl);
const barangDhl = hasilDhl.rawItems[0];

t("kemasan & jenis kemasan terekstraksi", () => {
  // Keluhan utamanya: kolom ini selalu kosong
  eq(barangDhl.package, "1 BOX");
  eq(barangDhl.dimensions, "460*380*200");
});
t('baris ukuran bergaya "Dimension : 460*380*200 * 1 BOX(ES)" terbaca', () => {
  const s = w.extractCiplSizeLines("Dimension : 460*380*200 * 1 BOX(ES)");
  eq(s.length, 1);
  eq(s[0].dims, "460*380*200");
  eq(s[0].boxes, "1 BOX");     // "(ES)" dibuang
  eq(s[0].unit, "BOX");
});
t('gaya lama "SIZE :50*42*14(CM) /1BOX" tetap terbaca', () => {
  const s = w.extractCiplSizeLines("SIZE :50*42*14(CM) /1BOX");
  eq(s[0].dims, "50*42*14");
  eq(s[0].boxes, "1 BOX");
});
t("kemasan diambil dari baris TOTAL saat barangnya tunggal", () => {
  const tot = w.ciplTotalPackageFromText("TOTAL 1 BOX(ES) FCA INCHEON AIRPORT");
  eq(tot.jumlah, 1);
  eq(tot.unit, "BOX");
});
t("kiriman berisi banyak barang: koli TIDAK dibagi rata", () => {
  const items = [{ name: "A" }, { name: "B" }];
  w.applyCiplSizes(items, [], { jumlah: 4, unit: "BOX" });
  eq(items[0].package, undefined);   // menebak pembagian lebih buruk
});
t('tanggal sampah "Jan 00, 1900" ditolak', () => {
  eq(hasilDhl.fields.etd, "");
  eq(w.parseFlexibleDateText("Jan 00, 1900"), "");
  eq(w.parseFlexibleDateText("Aug 07, 2026"), "2026-08-07");
});
t("label rujukan PO tidak mencemari nama barang", () => {
  eq(barangDhl.name, "Bar Gauge Magnetar A/T 215/70R16");
  eq(w.bersihkanLabelNama("Bar Gauge Items of PO DDI-20260807-01"), "Bar Gauge");
  // Nama yang kebetulan memuat "PO" tidak tersentuh
  eq(w.bersihkanLabelNama("POMPA HIDROLIK PO-12"), "POMPA HIDROLIK PO-12");
});
t("field lain ikut benar", () => {
  const f = hasilDhl.fields;
  eq(f.invoice, "DD-DI26080701");
  eq(f.docDate, "2026-08-07");
  eq(f.transport, "udara");
  eq(f.origin, "ICN");
  eq(f.destination, "CGK");
  eq(f.incoterm, "FCA");
  eq(f.voyage, "DHL");
  eq(f.consignee, "PT DYNAMIC DESIGN INDONESIA");
});
t("berat, harga, satuan, HS Code", () => {
  eq(barangDhl.qty, 1);
  eq(barangDhl.satuan, "EA");
  eq(barangDhl.harga, 40);
  eq(barangDhl.netto, 1);
  eq(barangDhl.bruto, 1.4);
  eq(barangDhl.hsCode, "903180");
});
t("DHL terdeteksi sebagai kurir dari kolom Vessel/Flight", () => {
  const c = w.detectCarrier({ transport: "udara", vessel: hasilDhl.fields.voyage });
  eq(c.kind, "courier");
  eq(c.code, "DHL");
});

console.log("— KEMASAN CIPL: KOLI vs DIMENSI —");
const rawCipl = [
  { name: "STAND", qty: 1, satuan: "EA", package: "1 BOX", dimensions: "50*42*14" },
  { name: "SPRING VENT", qty: 60000, satuan: "EA", package: "1 BOX", dimensions: "46*24*14" },
];
t("IMPORT: hanya jumlah koli", () => {
  tulis("activeMode", "import");
  const its = w.ciplRawItemsToFinalItems(rawCipl);
  eq(its[0].package, "1 BOX");
  eq(its[0].packing, "");
  // Dimensi TIDAK boleh masuk: "50*42*14" akan terbaca sebagai 50 koli
  if (/\*/.test(its[0].package)) throw new Error("dimensi masuk ke kolom koli");
});
t("EXPORT: koli DAN dimensi, dua-duanya", () => {
  tulis("activeMode", "export");
  const its = w.ciplRawItemsToFinalItems(rawCipl);
  eq(its[0].package, "50*42*14");   // dipakai CBM
  eq(its[0].packing, "1 BOX");      // dipakai surat jalan
  eq(its[0].packingUnit, "BOX");
  tulis("activeMode", "import");
});
t("satuan ikut terbawa ke daftar barang", () => {
  tulis("activeMode", "import");
  eq(w.ciplRawItemsToFinalItems(rawCipl)[0].satuan, "EA");
});
t("HS Code dipotong 8 digit", () => {
  eq(w.normalizeHsCodeInput("6903.10-0000"), "69031000");
  eq(w.normalizeHsCodeInput("8481400000"), "84814000");
  eq(w.normalizeHsCodeInput("84.81.40.00.00"), "84814000");
});

console.log("— CBM: DIKALI KOLI, BUKAN PIECES —");
t("jumlah koli yang dipakai kalau ada", () => {
  // 60.000 pcs dalam 1 box: 46*24*14 = 0,015 m3 — bukan 927 m3
  eq(w.computeItemCbm({ package: "46*24*14", qty: 60000, packing: "1 BOX" }), 0.015);
  eq(w.computeItemCbm({ package: "50*42*14", qty: 1, packing: "2 BOX" }), 0.059);
});
t("tanpa koli, qty dipakai seperti semula (data lama aman)", () => {
  eq(w.computeItemCbm({ package: "82*82*75", qty: 2 }), 1.009);  // 0,5043 x 2
  eq(w.computeItemCbm({ package: "82*82*75", qty: 2, packing: "" }), 1.009);
});
t("tanpa dimensi -> nol", () =>
  eq(w.computeItemCbm({ package: "1 BOX", qty: 5, packing: "1 BOX" }), 0));

console.log("— MERGE CI+PL TIDAK MEMBUANG FIELD —");
t("dimensions selamat saat CI & PL dua berkas terpisah", () => {
  const ci = [{ name: "STAND", hsCode: "69031000", qty: 1, satuan: "EA", harga: 101 }];
  const pl = [{ name: "STAND", hsCode: "69031000", qty: 1, satuan: "EA",
    netto: 14.6, bruto: 14.8, package: "1 BOX", dimensions: "50*42*14" }];
  const m = w.mergeItemSources([ci, pl]);
  eq(m[0].dimensions, "50*42*14");
  eq(m[0].harga, 101);
  eq(m[0].satuan, "EA");
});

console.log("— TARIF: PERSEN SAAT DISALIN —");
t("salin ke clipboard menulis tanda persen", () => {
  // Tanpa "%", sel Excel berformat Persentase membaca 5 sebagai 500%
  const CF = w.eval("clipboardFormatter");
  eq(CF.tarif(5), "5%");
  eq(CF.tarif(7.5), "7.5%");
  eq(CF.tarif(0), "");        // kosong tetap kosong, bukan "%" telanjang
  eq(CF.tarif(null), "");
});
t("berkas .xlsx tetap menulis NILAI, bukan teks", () => {
  // Di sana format selnya dibuat sendiri, jadi 5% = 0,05
  const NF = w.eval("nativeFormatter");
  eq(NF.tarif(5), 0.05);
  eq(NF.tarif(7.5), 0.075);
});

console.log("— PIB TIDAK MENIMPA HARGA SATUAN —");
const dariCipl = [
  { namaBarang: "STAND HS 40*50", hsCode: "6903100000", qty: 1, harga: 101 },
  { namaBarang: "SPRING VENT(IKR)", hsCode: "8481400000", qty: 60000, harga: 0.44 },
];
console.log("\u2014 IMPOR CEISA TIDAK MENIMPA NAMA BARANG YANG SUDAH DIPISAH \u2014");
t("Export: Uraian/Pattern/Size/Mold No yang sudah diketik dipertahankan", () => {
  /* Berkas CEISA menulis nama sebagai SATU teks gabungan; di aplikasi
     ini nama terbagi empat kolom. Tidak ada aturan yang bisa memecah
     teks itu jadi empat, jadi yang sudah diketik orang yang menang --
     berkasnya diimpor untuk angka kepabeanannya, bukan namanya. */
  const simpan = baca("activeMode");
  try {
    w.eval('activeMode = "export"');
    const lama = [
      { namaBarang: "TYRE MOLD TREAD ONLY", pattern: "MAGNETAR A/T",
        size: "235/55R20", moldNo: "S08", hsCode: "84807190" },
      { namaBarang: "TYRE MOLD FULL SET", pattern: "CREDO",
        size: "195/65R15", moldNo: "S09", hsCode: "84807190" },
    ];
    const dariCeisa = [
      { namaBarang: "TYRE MOLD TREAD ONLY MAGNETAR A/T 235/55R20",
        pattern: "", size: "", moldNo: "", hsCode: "84807190" },
      { namaBarang: "TYRE MOLD FULL SET CREDO 195/65R15",
        pattern: "", size: "", moldNo: "", hsCode: "84807190" },
    ];
    const r = w.preserveNamesForCeisa(dariCeisa, lama, "excel");
    eq(r.kept, 2);
    eq(r.items[0].namaBarang, "TYRE MOLD TREAD ONLY");
    eq(r.items[0].pattern, "MAGNETAR A/T");
    eq(r.items[0].size, "235/55R20");
    eq(r.items[0].moldNo, "S08");
    eq(r.items[1].moldNo, "S09");

    /* KASUS YANG SEBENARNYA TERJADI DI LAPANGAN: nama sudah diketik,
       HS Code BELUM -- karena HS Code justru yang mau diambil dari
       CEISA -- dan tabel menyisakan satu baris kosong di ekornya.

       Dulu keduanya menggagalkan penjagaan nama sekaligus: baris
       kosong membuat panjang daftar tidak sama (jadi pencocokan urutan
       dilewati), lalu pencocokan HS Code tidak kena karena baris
       manualnya memang belum ber-HS. Nama yang sudah diketik ikut
       tertimpa nama gabungan dari berkas. */
    const manualTanpaHs = [
      { namaBarang: "TYRE MOLD TREAD ONLY", pattern: "MAGNETAR A/T",
        size: "215/55R18", moldNo: "S08", hsCode: "", qty: 1 },
      { namaBarang: "TYRE MOLD FULL SET", pattern: "MAGNETAR A/T",
        size: "225/75R16", moldNo: "S09", hsCode: "", qty: 3 },
      w.newItem(), // baris kosong di ekor tabel
    ];
    const jaga = w.preserveNamesForCeisa(dariCeisa, manualTanpaHs, "excel");
    eq(jaga.kept, 2, "nama dipertahankan walau tanpa HS Code:");
    eq(jaga.items[0].namaBarang, "TYRE MOLD TREAD ONLY");
    eq(jaga.items[0].size, "215/55R18");
    eq(jaga.items[1].moldNo, "S09");

    /* Baris yang MEMANG belum pernah diisi tetap memakai nama dari
       berkas -- kalau tidak, impor ke draft kosong tidak menghasilkan
       nama sama sekali. */
    const kosong = w.preserveNamesForCeisa(dariCeisa, [], "excel");
    eq(kosong.kept, 0);
    eq(kosong.items[0].namaBarang, "TYRE MOLD TREAD ONLY MAGNETAR A/T 235/55R20");

    /* Draft yang isinya cuma baris kosong juga dianggap kosong. */
    const cumaKosong = w.preserveNamesForCeisa(dariCeisa, [w.newItem(), w.newItem()], "excel");
    eq(cumaKosong.kept, 0, "draft berisi baris kosong saja:");

    /* Jumlah barang berbeda -> dicocokkan lewat HS Code, sekali pakai. */
    const sebagian = w.preserveNamesForCeisa(dariCeisa, [lama[0]], "excel");
    eq(sebagian.kept, 1, "cocok lewat HS Code:");
    eq(sebagian.items[1].namaBarang, "TYRE MOLD FULL SET CREDO 195/65R15",
      "baris tanpa pasangan pakai nama berkas:");

    /* Sumber lain (CIPL/PDF) tidak kena aturan ini. */
    eq(w.preserveNamesForCeisa(dariCeisa, lama, "pdf").kept, 0, "sumber PDF:");
    w.eval('activeMode = "import"');
    eq(w.preserveNamesForCeisa(dariCeisa, lama, "excel").kept, 0, "buku Import:");
  } finally {
    w.eval("activeMode = " + JSON.stringify(simpan));
  }
});

t("dicocokkan lewat nama barang", () => {
  const baru = [
    { namaBarang: "SPRING VENT(IKR)", hsCode: "8481400000", qty: 60000, harga: 0 },
    { namaBarang: "STAND HS 40*50", hsCode: "6903100000", qty: 1, harga: 99 },
  ];
  const r = w.preserveUnitPrices(baru, dariCipl);
  eq(r.kept, 2);
  eq(r.items[0].harga, 0.44);
  eq(r.items[1].harga, 101);   // 99 dari PIB TIDAK dipakai
});
t("nama berbeda -> jatuh ke HS Code", () => {
  const baru = [{ namaBarang: "STAND (BC 2.0)", hsCode: "6903.10-0000", qty: 1, harga: 5 }];
  const r = w.preserveUnitPrices(baru, dariCipl);
  eq(r.items[0].harga, 101);
});
t("satu barang lama hanya dipakai sekali", () => {
  const baru = [
    { namaBarang: "A", hsCode: "8481400000", qty: 1, harga: 0 },
    { namaBarang: "B", hsCode: "8481400000", qty: 1, harga: 0 },
  ];
  const r = w.preserveUnitPrices(baru, dariCipl);
  eq(r.items[0].harga, 0.44);
  eq(r.items[1].harga, 0);     // tidak ikut mewarisi
});
t("tidak ada yang cocok tapi jumlahnya sama -> menurut urutan", () => {
  const baru = [
    { namaBarang: "POS 1", hsCode: "1111111111", qty: 1, harga: 0 },
    { namaBarang: "POS 2", hsCode: "2222222222", qty: 1, harga: 0 },
  ];
  const r = w.preserveUnitPrices(baru, dariCipl);
  eq(r.byOrder, true);
  eq(r.items[0].harga, 101);
  eq(r.items[1].harga, 0.44);
});
t("jumlah beda & tidak cocok -> harga PIB dibiarkan", () => {
  const baru = [{ namaBarang: "POS X", hsCode: "999", qty: 1, harga: 7 }];
  const r = w.preserveUnitPrices(baru, dariCipl);
  eq(r.kept, 0);
  eq(r.items[0].harga, 7);
});
t("barang lama tanpa harga tidak dianggap", () => {
  const r = w.preserveUnitPrices(
    [{ namaBarang: "STAND HS 40*50", harga: 12 }],
    [{ namaBarang: "STAND HS 40*50", harga: 0 }],
  );
  eq(r.kept, 0);
  eq(r.items[0].harga, 12);
});
t("hanya CIPL yang berwenang atas harga", () => {
  ["cipl", "cipl-pdf", "cipl-pdf-ci", "cipl-pdf-pl"].forEach((s) =>
    eq(w.isPriceAuthority(s), true, s + ":"));
  ["pdf", "pdf-peb", "excel-bc"].forEach((s) =>
    eq(w.isPriceAuthority(s), false, s + ":"));
});

console.log("— DAFTAR BARANG: ANGKA BERFORMAT —");
t("qty/harga berformat tidak lagi jadi nol", () => {
  const c = w.computeCustoms({ items: [{ qty: "60,000", harga: "0.44" }] });
  eq(c.totalUSD, 26400);
  eq(c.totalQty, 60000);
});
t("format Indonesia juga terbaca", () => {
  const c = w.computeCustoms({ items: [{ qty: "1.500", harga: "2,5" }] });
  eq(c.totalUSD, 3750);
});
t("panel detail memuat bagian prediksi + rincian", () => {
  const h = w.predictionDetailHtml(contoh);
  if (!h.includes("Prediksi Kedatangan")) throw new Error("judul tidak ada");
  if (!h.includes("pred-steps")) throw new Error("rincian langkah tidak ada");
});
t("strip prediksi tidak muncul untuk export", () => eq(w.predictionStripHtml({ ...contoh, mode: "export" }), ""));

console.log("— PENYELARASAN SAAT MUAT —");
t("applyPredictionToAll mengisi actual tanpa menyentuh ETA manual", () => {
  const list = [{ ...contoh, actual: "", eta: "2026-08-14", etaMode: "manual" }];
  w.applyPredictionToAll(list);
  eq(list[0].actual, "2026-08-18");
  eq(list[0].eta, "2026-08-14");
});
t("data lama tanpa etaMode: ETA yang sudah ada TIDAK ditimpa", () => {
  const list = [{ ...contoh, etaMode: undefined, eta: "2026-09-30", actual: "" }];
  w.applyPredictionToAll(list);
  eq(list[0].eta, "2026-09-30");
});
t("data lama tanpa ETA: mesin mengisinya", () => {
  const list = [{ ...contoh, etaMode: undefined, eta: "", actual: "" }];
  w.applyPredictionToAll(list);
  eq(list[0].eta, "2026-08-13");
});
t("factoryDate terisi -> actual mengikuti fakta", () => {
  const list = [{ ...contoh, factoryDate: "2026-08-26", actual: "2026-08-20" }];
  w.applyPredictionToAll(list);
  eq(list[0].actual, "2026-08-26");
});

console.log("— MILESTONE —");
t("manifest/pib/sppb dikenali sebagai milestone (import)", () => {
  ["manifest","pib","sppb"].forEach((k) => {
    if (!w.predictionMilestoneForStep(k, contoh)) throw new Error(k + " tidak dikenali");
  });
});
t("berth, manifest, pib, billing, sppb adalah milestone", () => {
  ["berth", "manifest", "pib", "billing", "sppb"].forEach((k) => {
    if (!w.predictionMilestoneForStep(k, contoh)) throw new Error(k + " tidak dikenali");
  });
});
t("cipl/coo/bl BUKAN milestone", () => {
  ["cipl", "coo", "bl"].forEach((k) => {
    if (w.predictionMilestoneForStep(k, contoh)) throw new Error(k + " seharusnya bukan");
  });
});
t("tidak ada milestone di buku export", () =>
  eq(w.predictionMilestoneForStep("pib", { ...contoh, mode: "export" }), null));

console.log("— RENTANG DI TAMPILAN —");
t("panel form menampilkan rentang untuk rute ber-rentang", () => {
  tulis("activeMode", "import");
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "CNCAN"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-13");
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("8–12 hari kalender")) throw new Error("lama transit tidak sebagai rentang");
  if (!h.includes("pred-range")) throw new Error("rentang tanggal tidak tergambar");
});
t("rute angka pasti TIDAK menampilkan rentang", () => {
  $("#fOrigin").value = "KRPUS";
  $("#fOrigin").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-13");
  if ($("#predictionPanel").innerHTML.includes("pred-range"))
    throw new Error("rentang muncul padahal angkanya pasti");
});
t("strip kartu menampilkan rentang", () => {
  const s = { ...contoh, origin: "CNCAN", eta: "2026-08-13", etaMode: "auto", docProgress: {} };
  const h = w.predictionStripHtml(s);
  if (!h.includes("pred-range")) throw new Error("tidak ada rentang di kartu");
});
t("rentang di kartu hilang begitu SPPB dikonfirmasi", () => {
  const s = { ...contoh, origin: "CNCAN", eta: "2026-08-13", etaMode: "auto",
    docProgress: { sppb: { date: "2026-08-14" } } };
  const h = w.predictionStripHtml(s);
  if (h.includes("pred-range")) throw new Error("rentang seharusnya sudah hilang");
});

t("aturan per-pelabuhan terpakai di form & namanya tampil", () => {
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-13"); // ETD + 10 hari, angka pasti
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("Shanghai / Ningbo")) throw new Error("nama aturan tidak tampil");
  if (h.includes("pred-range")) throw new Error("rentang muncul padahal angkanya pasti");
});
t("LCL dari pelabuhan yang sama turun ke rentang negara", () => {
  $("#fMuatan").value = "LCL";
  $("#fMuatan").dispatchEvent(new w.Event("change"));
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("14–18 hari kalender")) throw new Error("tidak jatuh ke rentang China");
  if (!h.includes("China → Indonesia")) throw new Error("aturan negara tidak terpakai");
});
t("bandara: Hongqiao → Soekarno-Hatta", () => {
  w.initPredictionForm(null);
  $("#fTransport").value = "udara"; $("#fMuatan").value = "";
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDCGK";
  $("#fRouteType").value = "direct";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-05"); // +2 hari
  if (!$("#predictionPanel").innerHTML.includes("Hongqiao"))
    throw new Error("aturan udara tidak terpakai");
});

console.log("— LAPIS 0 DI FORM —");
t("ringkasan rute tergambar dengan nama pelabuhan", () => {
  tulis("activeMode", "import");
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "IDCGK";  // sengaja salah moda utk memicu celah
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct"; $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("Lapis 0")) throw new Error("lapis 0 tidak tergambar");
  if (!h.includes("Shanghai")) throw new Error("nama pelabuhan tidak tampil");
  if (!h.includes("SHA")) throw new Error("kode pendek tidak tampil");
});
t("celah rute dilaporkan, bukan disembunyikan", () => {
  $("#fOrigin").value = "entah dimana";
  $("#fOrigin").dispatchEvent(new w.Event("change"));
  if (!$("#predictionPanel").innerHTML.includes("tidak dikenali"))
    throw new Error("celah tidak dilaporkan");
});

console.log("— MODE ESTIMATED DELIVERY —");
t("mengetik Estimated Delivery mengunci ke Manual", () => {
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct"; $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  $("#fActual").value = "2026-09-30";
  $("#fActual").dispatchEvent(new w.Event("change"));
  eq(baca("formDeliveryMode"), "manual");
});
t("mode manual: milestone TIDAK menggeser tanggalnya", () => {
  $("#fEtd").value = "2026-07-01";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  eq($("#fActual").value, "2026-09-30");
  if (!$("#predictionPanel").innerHTML.includes("dikunci untuk laporan"))
    throw new Error("catatan kunci tidak muncul");
});
t("kembali ke Auto menghitung ulang", () => {
  $('#deliveryModeSwitch [data-delivery-mode="auto"]').click();
  eq(baca("formDeliveryMode"), "auto");
  if ($("#fActual").value === "2026-09-30") throw new Error("tidak dihitung ulang");
});
t("recompute menghormati mode manual", () => {
  const s = { ...contoh, deliveryMode: "manual", actual: "2026-12-25", eta: "2026-08-14" };
  eq(w.recomputeShipmentDates(s).actual, undefined);
  eq(s.actual, "2026-12-25");
});

console.log("— PENYESUAIAN CARRIER —");
t("penyesuaian carrier menambah hari transit & tampil di panel", () => {
  PC.carrierAdjustments.push({
    id: "uji-lambat", label: "ABC Line lebih lambat 3 hari",
    match: { forwarder: "abc" }, days: 3,
  });
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct"; $("#fForwarder").value = "PT ABC Logistics";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  eq($("#fEta").value, "2026-08-16"); // 10 + 3
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("+3 hari")) throw new Error("penyesuaian tidak dijelaskan");
  if (!h.includes("ABC Line")) throw new Error("nama aturan tidak tampil");
  PC.carrierAdjustments.length = 0;
});
t("forwarder lain tidak terpengaruh", () => {
  PC.carrierAdjustments.push({
    id: "uji-lambat", label: "ABC lambat", match: { forwarder: "abc" }, days: 3,
  });
  const e = w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL", forwarder: "XYZ Freight" });
  eq(e.days, 10);
  eq(e.transit.carrierDays, 0);
  PC.carrierAdjustments.length = 0;
});
t("nilai negatif = lebih cepat", () => {
  PC.carrierAdjustments.push({
    id: "uji-cepat", label: "XYZ ekspres", match: { forwarder: "xyz" }, days: -2,
  });
  eq(w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL",
    forwarder: "XYZ Freight" }).days, 8);
  PC.carrierAdjustments.length = 0;
});
t("riwayat mengalahkan penyesuaian carrier (tidak dihitung dua kali)", () => {
  PC.carrierAdjustments.push({
    id: "uji-lambat", label: "ABC lambat", match: { forwarder: "abc" }, days: 3,
  });
  w.setPredictionHistory(riwayatTransit(32, 20, { forwarder: "PT ABC" }));
  const e = w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL", forwarder: "PT ABC" });
  eq(e.days, 20);              // riwayat murni, bukan 23
  eq(e.transit.carrierDays, 0);
  w.setPredictionHistory(null);
  PC.carrierAdjustments.length = 0;
});
t("daftar kosong -> tidak ada penyesuaian sama sekali", () => {
  eq(w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL",
    forwarder: "apa saja" }).transit.carrierDays, 0);
});

console.log("— PEMBANDING SAAT MODE MANUAL —");
t("hitungan mesin tetap tampil sebagai pembanding", () => {
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct"; $("#fForwarder").value = "";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  const mesin = $("#fActual").value;
  $("#fActual").value = "2026-09-30";
  $("#fActual").dispatchEvent(new w.Event("change"));
  eq(baca("formDeliveryMode"), "manual");
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("Hitungan mesin saat ini")) throw new Error("pembanding tidak tampil");
  if (!h.includes("lebih mundur")) throw new Error("selisih tidak dijelaskan");
  if (!mesin) throw new Error("hitungan mesin kosong");
});
t("detail view ikut menampilkan hitungan mesin", () => {
  const h = w.predictionDetailHtml({ ...contoh, deliveryMode: "manual",
    actual: "2026-09-30", eta: "2026-08-14" });
  if (!h.includes("Hitungan Mesin")) throw new Error("tidak ada di detail");
});

console.log("— LAPIS 4: KENYATAAN —");
t("perkiraan yang sudah lewat digeser ke hari ini", () => {
  // ETA jauh di masa lalu, barang belum masuk pabrik
  const s = { mode: "import", transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct",
    etaMode: "manual", eta: "2026-06-01", docProgress: {} };
  const d = w.predictDelivery(s);
  eq(d.shifted, true);
  if (d.date < w.todayISO()) throw new Error("masih di masa lalu: " + d.date);
  if (d.overdueDays <= 0) throw new Error("keterlambatan tidak terhitung");
  if (!d.sourceLabel.includes("Hari Ini")) throw new Error("sumber tidak menyebut hari ini");
});
t("penyangga keterlambatan ikut ditambahkan & dibatasi", () => {
  const s = { mode: "import", transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct",
    etaMode: "manual", eta: "2020-01-01", docProgress: {} };
  const d = w.predictDelivery(s);
  eq(d.delayBuffer, PC.reality.maxDelayBuffer);
});
t("sudah sampai pabrik -> TIDAK digeser", () => {
  const s = { mode: "import", transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", etaMode: "manual",
    eta: "2026-06-01", factoryDate: "2026-06-20", docProgress: {} };
  const d = w.predictDelivery(s);
  eq(d.shifted, false);
  eq(d.date, "2026-06-20");
});

console.log("— KEYAKINAN PERSEN —");
t("persen naik seiring milestone", () => {
  const base = { mode: "import", transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct",
    etaMode: "auto", eta: "2026-08-14" };
  const pc = (dp, ex) => w.predictDelivery({ ...base, ...ex, docProgress: dp }).confidence.percent;
  const a = pc({}), b = pc({}, { etaMode: "manual" }),
        c = pc({ manifest: { date: "2026-08-15" } }),
        d = pc({ pib: { date: "2026-08-17" } }),
        e = pc({ sppb: { date: "2026-08-18" } });
  if (!(a < b && b < c && c < d && d < e)) throw new Error(`tidak naik: ${a},${b},${c},${d},${e}`);
});
t("rute tak dikenali menurunkan persen & mencatat alasannya", () => {
  const s = { mode: "import", transport: "laut", muatan: "FCL",
    origin: "entah", destination: "entah", etaMode: "manual",
    eta: "2026-08-14", docProgress: {} };
  const c = w.predictDelivery(s).confidence;
  if (!c.reasons.some((r) => /Rute belum dikenali/.test(r.text)))
    throw new Error("alasan tidak dicatat");
});
t("persen selalu 5..100", () => {
  const s = { mode: "import", transport: "laut", origin: "x", destination: "y",
    etaMode: "auto", eta: "2019-01-01", docProgress: {} };
  const pc = w.predictDelivery(s).confidence.percent;
  if (pc < 5 || pc > 100) throw new Error("di luar rentang: " + pc);
});

console.log("— BELAJAR DARI RIWAYAT —");
/* minSamples kini 30 — riwayat harus benar-benar banyak sebelum boleh
   menggantikan asumsi. Dibangun dengan penambah tanggal supaya tidak
   terbatas pada satu digit. */
function riwayatTransit(n, transitHari, extra) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const etd = w.addCalendarDaysISO("2026-05-01", i);
    out.push(Object.assign({
      mode: "import", transport: "laut", muatan: "FCL",
      origin: "CNSHA", destination: "IDTPP", routeType: "direct",
      etd: etd,
      docProgress: { manifest: { date: w.addCalendarDaysISO(etd, transitHari) } },
    }, extra || {}));
  }
  return out;
}

t("riwayat cukup -> menggantikan angka konfigurasi", () => {
  const riwayat = riwayatTransit(32, 20);
  w.setPredictionHistory(riwayat);
  const e = w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL" });
  eq(e.days, 20);              // riwayat, bukan 10 dari konfigurasi
  eq(e.hasRange, false);
  w.setPredictionHistory(null);
});
t("riwayat kurang dari minSamples -> tetap pakai konfigurasi", () => {
  w.setPredictionHistory([{ mode: "import", transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct", etd: "2026-06-01",
    docProgress: { manifest: { date: "2026-06-21" } } }]);
  eq(w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL" }).days, 10);
  w.setPredictionHistory(null);
});
t("ETA otomatis TIDAK dipelajari (mesin tidak belajar dari dirinya sendiri)", () => {
  const riwayat = [];
  for (let i = 0; i < 32; i++) {
    riwayat.push({ mode: "import", transport: "laut", muatan: "FCL",
      origin: "CNSHA", destination: "IDTPP", routeType: "direct",
      etd: "2026-06-01", eta: "2026-07-31", etaMode: "auto", docProgress: {} });
  }
  w.setPredictionHistory(riwayat);
  eq(w.predictEta({ etd: "2026-08-03", origin: "CNSHA", destination: "IDTPP",
    routeType: "direct", transport: "laut", muatan: "FCL" }).days, 10);
  w.setPredictionHistory(null);
});

console.log("— SKENARIO NYATA DARI LAPANGAN —");
t("LCL Busan → Priok, PIB sudah masuk sebelum kapal sandar", () => {
  tulis("activeMode", "import");
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "LCL";
  $("#fOrigin").value = "BSN KOREA"; $("#fDestination").value = "TPP";
  $("#fRouteType").value = "direct"; $("#fForwarder").value = "";
  $("#fEtd").value = "2026-07-31";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  $("#fEta").value = "2026-08-08";
  $("#fEta").dispatchEvent(new w.Event("change"));
  // Sab08 + stripping 2 hari KALENDER = Sen10 · clearance Sel11 · antar Rab12
  eq($("#fActual").value, "2026-08-12");
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("Stripping di CFS")) throw new Error("stripping tidak muncul");
  if (!h.includes("2 hari kalender")) throw new Error("satuan stripping tidak ditulis");
  if (!h.includes("1 hari kerja")) throw new Error("satuan clearance/antar tidak ditulis");
  if (h.includes("tidak dikenali")) throw new Error("BSN KOREA seharusnya dikenali");
});
t("panel menuliskan urutannya apa adanya", () => {
  const h = $("#predictionPanel").innerHTML;
  const iStrip = h.indexOf("Stripping di CFS");
  const iClr = h.indexOf("Customs clearance");
  const iDel = h.indexOf("Antar ke pabrik");
  if (!(iStrip < iClr && iClr < iDel)) throw new Error("urutan langkah salah");
});

console.log("— TAHAP SANDAR DI STEPPER —");
t("tahap berth ada di Import, TIDAK ada di Export", () => {
  const imp = w.docStepsFor({ mode: "import" }).map((x) => x.key);
  const exp = w.docStepsFor({ mode: "export" }).map((x) => x.key);
  if (!imp.includes("berth")) throw new Error("tidak ada di Import");
  if (exp.includes("berth")) throw new Error("seharusnya tidak ada di Export");
  // Berths ditaruh SETELAH SPPB: dokumen kerap rampung sebelum
  // alat angkutnya tiba, pada laut maupun udara.
  eq(imp.indexOf("berth"), imp.indexOf("sppb") + 1);
});
t("label kedatangan: Sandar untuk laut, ATA untuk udara", () => {
  const st = w.docStepsFor({ mode: "import" }).find((x) => x.key === "berth");
  eq(w.stepText(st.label, { transport: "laut" }), "Berths");
  eq(w.stepText(st.label, { transport: "udara" }), "ATA");
  if (!w.stepText(st.full, { transport: "laut" }).includes("ATA"))
    throw new Error("ATA tidak disebut");
});
t("berth minta tanggal saat dikonfirmasi (milestone prediksi)", () => {
  const m = w.predictionMilestoneForStep("berth", { mode: "import" });
  if (!m) throw new Error("bukan milestone");
  eq(m.asksDate, true);
  eq(w.predictionMilestoneForStep("berth", { mode: "export" }), null);
});
t("kedatangan selalu di belakang SPPB, kedua moda", () => {
  ["laut", "udara"].forEach((moda) => {
    const k = w.docStepsFor({ mode: "import", transport: moda }).map((x) => x.key);
    eq(k.length, 8, moda + " jumlah:");
    eq(k.join(">"), "cipl>bl>coo>manifest>pib>billing>sppb>berth", moda + ":");
  });
});
t("Gate Out sudah tidak ada", () => {
  eq(w.docStepsFor({ mode: "import" }).some((x) => x.key === "gateOut"), false);
  eq(w.predictionMilestoneForStep("gateOut", contoh), null);
});

console.log("\u2014 KURIR EKSPRES TIDAK PAKAI MANIFEST \u2014");
t("FedEx/DHL: tahap Manifest hilang, tahap lain & urutannya tetap utuh", () => {
  ["FEDEX", "DHL", "UPS", "FEDEX PRIORITY"].forEach((nama) => {
    const k = w.docStepsFor({ mode: "import", forwarder: nama }).map((x) => x.key);
    if (k.includes("manifest")) throw new Error(nama + ": Manifest belum hilang");
    eq(k.join(">"), "cipl>bl>coo>pib>billing>sppb>berth", nama + ":");
  });
});
t("berlaku juga di Export, bukan cuma Import", () => {
  const k = w.docStepsFor({ mode: "export", forwarder: "DHL" }).map((x) => x.key);
  if (k.includes("manifest")) throw new Error("Export+DHL: Manifest belum hilang");
  eq(k.length, 8, "8 dari 9 tahap Export:");
});
t("impor Excel CEISA di buku Export -> jenis barang BARANG JADI", () => {
  /* newItem() sudah memilih jenis menurut buku yang dibuka; jalur
     impor sempat menimpanya dengan nilai mati "BAHAN BAKU", jadi tiap
     berkas CEISA yang masuk ke buku Export harus dibetulkan satu per
     satu. */
  const src = require("fs");
  const p = require("path");
  ["excel-bc.js", "excel-cipl.js", "pdf.js"].forEach((f) => {
    const isi = src.readFileSync(p.join(__dirname, "..", "js", "import", f), "utf8");
    if (/jenisBarang:\s*"BAHAN BAKU"/.test(isi))
      throw new Error(f + ": jenis barang masih dipaku ke BAHAN BAKU");
  });
  const simpan = baca("activeMode");
  try {
    w.eval('activeMode = "export"');
    eq(w.newItem().jenisBarang, "BARANG JADI", "buku Export:");
    w.eval('activeMode = "import"');
    eq(w.newItem().jenisBarang, "BAHAN BAKU", "buku Import:");
  } finally {
    w.eval("activeMode = " + JSON.stringify(simpan));
  }
});
t("tahap Sailing memakai ATD untuk kiriman udara", () => {
  /* Kapal berlayar, pesawat tidak. ATD dipilih karena berpasangan
     dengan ATA yang sudah dipakai tahap kedatangan udara. */
  const cari = (s) => w.docStepsFor(s).find((x) => x.key === "sailing");
  eq(w.stepText(cari({ mode: "export" }).label, { mode: "export" }), "Sailing");
  eq(
    w.stepText(cari({ mode: "export", transport: "udara" }).label,
      { mode: "export", transport: "udara" }),
    "ATD",
  );
});
t("Export punya tahap Sailing, dan ia yang terakhir", () => {
  /* Keberangkatan alat angkut -- seperti Berths/ATA di Import, tahap
     yang bukan berkas. Paling akhir karena memang kejadian terakhir
     yang masih diurus tim EXIM. */
  const langkah = w.docStepsFor({ mode: "export" });
  const k = langkah.map((x) => x.key);
  eq(k[k.length - 1], "sailing", "tahap terakhir Export:");
  if (k.indexOf("tally") > k.indexOf("sailing"))
    throw new Error("Tally harus mendahului Sailing");
  /* Import TIDAK ikut: yang setara di sana adalah Berths/ATA
     (kedatangan), dan itu sudah ada. */
  if (w.docStepsFor({ mode: "import" }).some((x) => x.key === "sailing"))
    throw new Error("tahap Sailing bocor ke buku Import");
  const st = langkah.find((x) => x.key === "sailing");
  const teksLaut = w.stepText(st.full, {});
  const teksUdara = w.stepText(st.full, { transport: "udara" });
  if (!/Kapal/i.test(teksLaut) || !/Pesawat/i.test(teksUdara))
    throw new Error("nama panjang Sailing tidak mengikuti moda angkut");
});
t("terdeteksi juga dari Nama Kapal, bukan cuma Forwarder", () => {
  const k = w.docStepsFor({ mode: "import", vessel: "FEDEX PRIORITY" }).map((x) => x.key);
  if (k.includes("manifest")) throw new Error("deteksi lewat Nama Kapal belum jalan");
});
t("forwarder LAIN (bukan kurir ekspres) tidak kena — termasuk yang sekilas mirip", () => {
  /* PRIME/WIDE/TNT sengaja TIDAK termasuk -- lihat komentar panjang di
     atas KURIR_EKSPRES_TANPA_PIB soal WIDE dipakai forwarder laut biasa
     di riwayat DDI. */
  ["PRIME", "WIDE", "TNT", "SEA HORSE EXPRESS"].forEach((nama) => {
    const k = w.docStepsFor({ mode: "import", forwarder: nama }).map((x) => x.key);
    if (!k.includes("manifest")) throw new Error(nama + ": Manifest ikut hilang, seharusnya tidak");
  });
});
t("docStepCount ikut menyesuaikan penyebutnya (7, bukan 8)", () => {
  const c = w.docStepCount({ mode: "import", forwarder: "FEDEX", docProgress: {} });
  eq(c.berlaku, 7);
});
t("aturan lama (nilai di bawah $1.500 -> seluruh balok kosong) tetap jalan berdampingan", () => {
  /* docStepsFor() cuma soal DAFTAR tahap; docStepHtml() yang menimbang
     nilai kiriman (isKurirNilaiRendah()) dan bisa mengosongkan
     balok-nya SELURUHNYA, terpisah dari perubahan ini. */
  if (!w.isKurirNilaiRendah({ mode: "import", forwarder: "DHL",
      items: [{ qty: 1, harga: 100 }] }))
    throw new Error("kiriman kurir $100 seharusnya tetap kena aturan CN lama");
});
t("jadwal lama tanpa berth tetap terhitung", () => {
  const s = { mode: "import", transport: "laut", muatan: "LCL",
    origin: "BSN KOREA", destination: "TPP", routeType: "direct",
    etaMode: "manual", eta: "2026-08-08",
    docProgress: { manifest: { date: "2026-08-07" } } };
  const d = w.predictDelivery(s);
  eq(d.ok, true);
  // Manifest 07-08 lebih awal dari ETA 08-08 -> hanya batas bawah
  eq(d.base, "2026-08-08");
});
t("Manifest yang lebih baru dari ETA tetap dipakai", () => {
  const s = { mode: "import", transport: "laut", muatan: "LCL",
    origin: "BSN KOREA", destination: "TPP", routeType: "direct",
    etaMode: "manual", eta: "2026-08-08",
    docProgress: { manifest: { date: "2026-08-14" } } };
  eq(w.predictDelivery(s).base, "2026-08-14");
});
t("panel menuliskan acuan delay", () => {
  tulis("activeMode", "import");
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "LCL";
  $("#fOrigin").value = "BSN KOREA"; $("#fDestination").value = "TPP";
  $("#fRouteType").value = "direct"; $("#fForwarder").value = "";
  $("#fEtd").value = "2026-07-26";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  $("#fEtdUpdate").value = "2026-07-31";
  $("#fEtdUpdate").dispatchEvent(new w.Event("change"));
  const h = $("#predictionPanel").innerHTML;
  if (!h.includes("ETD Delay")) throw new Error("acuan delay tidak ditulis");
  if (!h.includes("Acuan:")) throw new Error("acuan Estimated Delivery tidak ditulis");
});

console.log("— BELAJAR PROSES DARAT (riwayat LENGKAP) —");
/* Celah yang membuat rekursi lolos ke produksi: riwayat di uji
   sebelumnya hanya punya Manifest, sehingga cabang "clearance" keburu
   keluar sebelum sampai ke baris yang memanggil predictionOpsDays.
   Riwayat di bawah ini LENGKAP sampai In Factory. */
const WD = w.addWorkingDaysISO;
function riwayatLengkap(n, clearanceWd, deliveryWd) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const berth = WD("2026-05-01", i);
    // stripping LCL 2 hari KALENDER, sama seperti yang dipakai engine
    const siap = w.addCalendarDaysISO(berth, 2);
    const sppb = WD(siap, clearanceWd);
    out.push({
      mode: "import", transport: "laut", muatan: "LCL",
      origin: "CNSHA", destination: "IDTPP", routeType: "direct",
      etd: "2026-05-15", etaMode: "manual", eta: berth,
      factoryDate: WD(sppb, deliveryWd),
      docProgress: {
        berth: { date: berth },
        pib: { date: "2026-04-20" },           // masuk jauh sebelum kapal tiba
        sppb: { date: sppb },
      },
    });
  }
  return out;
}
const CTX_LCL = w.predictionContext({ transport: "laut", muatan: "LCL",
  origin: "CNSHA", destination: "IDTPP" });

t("tidak rekursif — predictionOpsDays selesai dengan riwayat lengkap", () => {
  w.setPredictionHistory(riwayatLengkap(32, 3, 4));
  const ops = w.predictionOpsDays(CTX_LCL);   // dulu: Maximum call stack size exceeded
  eq(typeof ops.clearance, "number");
  w.setPredictionHistory(null);
});
t("clearance & antar dipelajari dari riwayat", () => {
  w.setPredictionHistory(riwayatLengkap(32, 3, 4));
  const ops = w.predictionOpsDays(CTX_LCL);
  eq(ops.clearance, 3);        // konfigurasi 1
  eq(ops.delivery, 4);         // konfigurasi 1
  eq(ops.stripping, 2);        // stripping tidak pernah dipelajari
  eq(ops.learned.length, 2);
  w.setPredictionHistory(null);
});
t("clearance diukur dari BARANG SIAP, bukan dari PIB", () => {
  /* PIB di riwayat masuk 20-05, jauh sebelum kapal sandar. Kalau
     diukur dari situ, clearance akan terbaca belasan hari. */
  w.setPredictionHistory(riwayatLengkap(32, 3, 4));
  eq(w.predictionOpsDays(CTX_LCL).clearance, 3);
  w.setPredictionHistory(null);
});
t("configuredOpsDays TIDAK terpengaruh riwayat", () => {
  w.setPredictionHistory(riwayatLengkap(32, 3, 4));
  const mentah = w.configuredOpsDays(CTX_LCL);
  eq(mentah.clearance, 1);
  eq(mentah.delivery, 1);
  w.setPredictionHistory(null);
});
t("penjaga rekursi: pemanggilan bersarang mengembalikan null", () => {
  w.setPredictionHistory(riwayatLengkap(32, 3, 4));
  let bersarang = "belum";
  const asli = w.predictionHistory;
  // Paksa satu pemanggilan bersarang dari dalam pemindaian riwayat
  w.eval(`
    (function () {
      const simpan = masihRelevan;
      masihRelevan = function (s) {
        if (typeof learnedOpsDays === "function") {
          window.__bersarang = learnedOpsDays({ shipmentType: "SEA_LCL" }, "delivery");
        }
        masihRelevan = simpan;
        return simpan(s);
      };
    })();
  `);
  w.resetPredictionLearning();
  w.predictionOpsDays(CTX_LCL);
  eq(w.__bersarang, null);
  w.setPredictionHistory(null);
});
t("prediksi penuh berjalan dengan riwayat lengkap", () => {
  w.setPredictionHistory(riwayatLengkap(32, 3, 4));
  const d = w.predictDelivery({ mode: "import", transport: "laut", muatan: "LCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct",
    etaMode: "manual", eta: "2026-08-10", docProgress: {} });
  eq(d.ok, true);
  // Sen10 tiba · +2 strip · +3 clearance · +4 antar = 9 hari kerja
  eq(d.date, "2026-08-21");
  w.setPredictionHistory(null);
});

t("langkah tanpa durasi tidak ditulis \'null hari kerja\'", () => {
  const s = { mode: "import", transport: "laut", muatan: "LCL",
    origin: "BSN KOREA", destination: "TPP", routeType: "direct",
    etaMode: "manual", eta: "2026-08-08",
    docProgress: { pib: { date: "2026-08-20" } } };   // PIB telat -> ada jeda
  const d = w.predictDelivery(s);
  eq(d.steps.some((x) => x.key === "wait_pib"), true);
  const h = w.predictionDetailHtml({ ...contoh, ...s });
  if (/null hari/.test(h)) throw new Error("masih menulis 'null hari kerja'");
  if (!h.includes("Menunggu PIB")) throw new Error("jeda PIB tidak ditampilkan");
});

t("PENJAGA: sumber form memuat semua kolom yang dibaca engine", () => {
  /* Kolom yang tertinggal di predictionFormSource() tidak bersuara —
     ia cuma diam-diam dianggap kosong, dan prediksi di form berbeda
     dari prediksi di kartu tanpa ada yang tahu. */
  const src = w.predictionFormSource();
  ["etd", "eta", "etaUpdate", "etdUpdate", "etaMode", "deliveryMode",
   "transport", "muatan", "routeType", "origin", "destination",
   "forwarder", "factoryDate", "actual", "docProgress", "mode"]
    .forEach((k) => {
      if (!(k in src)) throw new Error("kolom hilang: " + k);
    });
});

console.log("— GERBANG PEMBELAJARAN —");
function riwayatVariasi(n, hariList) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const etd = w.addCalendarDaysISO("2026-05-01", i);
    out.push({
      mode: "import", transport: "laut", muatan: "FCL",
      origin: "CNSHA", destination: "IDTPP", routeType: "direct",
      etd: etd,
      docProgress: { manifest: { date: w.addCalendarDaysISO(etd, hariList[i % hariList.length]) } },
    });
  }
  return out;
}
const CTX_FCL = w.predictionContext({ transport: "laut", muatan: "FCL",
  origin: "CNSHA", destination: "IDTPP", routeType: "direct" });

t("di bawah 8 sampel: tidak dipakai, TAPI progresnya dilaporkan", () => {
  w.setPredictionHistory(riwayatVariasi(5, [11, 12, 11, 13, 12]));
  const r = w.learnedTransitDays(CTX_FCL);
  eq(r.cukup, false);
  eq(r.samples, 5);
  eq(r.need, 8);
  eq(r.reason, "belum cukup");
  eq(w.predictionTransitDays(CTX_FCL).days, 10);   // tetap angka konfigurasi
  w.setPredictionHistory(null);
});
t("8 sampel yang konsisten: dipakai", () => {
  w.setPredictionHistory(riwayatVariasi(8, [11, 12, 11, 13, 12, 11, 12, 12]));
  const r = w.learnedTransitDays(CTX_FCL);
  eq(r.cukup, true);
  eq(r.days, 12);
  if (r.stdError > 1.5) throw new Error("galat baku seharusnya kecil");
  eq(w.predictionTransitDays(CTX_FCL).days, 12);
  w.setPredictionHistory(null);
});
t("cukup sampel tapi terlalu berayun: DITOLAK", () => {
  /* Delapan kiriman 4/9/14/20/6/25/11/30 hari punya rata-rata yang
     terdengar pasti padahal tidak berdasar apa-apa. */
  w.setPredictionHistory(riwayatVariasi(16, [4, 9, 14, 20, 6, 25, 11, 30]));
  const r = w.learnedTransitDays(CTX_FCL);
  eq(r.cukup, false);
  eq(r.reason, "terlalu berayun");
  if (!(r.stdError > 1.5)) throw new Error("galat baku seharusnya besar");
  eq(w.predictionTransitDays(CTX_FCL).days, 10);   // mundur ke konfigurasi
  w.setPredictionHistory(null);
});
t("progres tampil di panel prediksi", () => {
  w.setPredictionHistory(riwayatVariasi(5, [11, 12, 11, 13, 12]));
  w.resetPredictionLearning();
  tulis("activeMode", "import");
  w.initPredictionForm(null);
  $("#fTransport").value = "laut"; $("#fMuatan").value = "FCL";
  $("#fOrigin").value = "CNSHA"; $("#fDestination").value = "IDTPP";
  $("#fRouteType").value = "direct"; $("#fVessel").value = ""; $("#fForwarder").value = "";
  $("#fEtd").value = "2026-08-03";
  $("#fEtd").dispatchEvent(new w.Event("change"));
  if (!$("#predictionPanel").innerHTML.includes("5/8 kiriman"))
    throw new Error("progres tidak ditampilkan");
  w.setPredictionHistory(null);
});
t("riwayat per-pelayaran kurang -> turun ke riwayat rute", () => {
  const campur = riwayatVariasi(10, [11, 12, 11, 13, 12, 11, 12, 12, 11, 12]);
  campur.slice(0, 3).forEach((s) => (s.vessel = "HMM MIRACLE 0009S"));
  w.setPredictionHistory(campur);
  const ctxHmm = w.predictionContext({ transport: "laut", muatan: "FCL",
    origin: "CNSHA", destination: "IDTPP", routeType: "direct", vessel: "HMM MIRACLE 0009S" });
  eq(ctxHmm.carrier, "HMM");
  const r = w.learnedTransitDays(ctxHmm);
  eq(r.cukup, true);
  eq(r.scope, "rute");        // 3 sampel HMM kurang -> pakai 10 sampel rute
  w.setPredictionHistory(null);
});

console.log("— PENYIMPANAN KE DATABASE —");
(function () {
  // Dijalankan serentak supaya urutannya pasti; hasilnya diperiksa di bawah.
  const s = { ...contoh, id: "s9", actual: "", eta: "2026-08-14", etaMode: "manual" };
  jejakUpdate.length = 0;
  tulis("data", { import: [s], export: [] });
  const p = w.refreshShipmentPrediction(s, { render: false });
  t("actual dihitung & disimpan", () => {
    eq(s.actual, "2026-08-18");
    eq(jejakUpdate.length, 1);
    eq(JSON.stringify(jejakUpdate[0].row), JSON.stringify({ actual: "2026-08-18" }));
  });
  t("factory_date & eta_update TIDAK ikut ditulis", () => {
    const kolom = Object.keys(jejakUpdate[0].row);
    ["factory_date", "eta_update", "etd_update", "eta"].forEach((k) => {
      if (kolom.includes(k)) throw new Error(k + " seharusnya tidak disentuh");
    });
  });
  t("dipanggil ulang tanpa perubahan -> tidak menulis apa pun", () => {
    jejakUpdate.length = 0;
    w.refreshShipmentPrediction(s, { render: false });
    eq(jejakUpdate.length, 0);
  });
  return p;
})();

console.log("— PEMETAAN DATABASE —");
t("etaMode <-> eta_mode", () => {
  eq(w.shipmentToRow({ etaMode: "manual" }).eta_mode, "manual");
  eq(w.rowToShipment({ id: "1", mode: "import", eta_mode: "auto" }).etaMode, "auto");
});

console.log("\u2014 PENCARIAN RIWAYAT NOMOR: SATU SALINAN \u2014");
t("cetak & unduh Excel memakai pencarian yang sama", () => {
  if (typeof w.ciplCariBarisRiwayat !== "function")
    throw new Error("helper bersama tidak ada");
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "js", "features");
  ["cipl-print.js", "cipl-excel.js"].forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const salinan = (src.match(/docNumHistoryRows \|\| \[\]\)\.find/g) || []).length;
    if (salinan > (f === "cipl-print.js" ? 1 : 0))
      throw new Error(f + " masih punya pencarian sendiri");
  });
});
t("id angka & id teks sama-sama ketemu", () => {
  /* id datang sebagai angka dari database, atau teks dari atribut DOM.
     Perbandingannya sengaja longgar — dan sekarang cuma di satu tempat. */
  const simpan = w.eval("docNumHistoryRows");
  w.eval('docNumHistoryRows = [{ id: 42, payload: {} }]');
  try {
    if (!w.ciplCariBarisRiwayat(42)) throw new Error("id angka tidak ketemu");
    if (!w.ciplCariBarisRiwayat("42")) throw new Error("id teks tidak ketemu");
    if (w.ciplCariBarisRiwayat(99)) throw new Error("id asing malah ketemu");
  } finally {
    w.eval("docNumHistoryRows = " + JSON.stringify(simpan || []));
  }
});

console.log("\u2014 MEMBATALKAN STATUS TIBA MENINGGALKAN JEJAK \u2014");
t("tanggal yang dihapus dicatat ke kronologi", () => {
  /* Membatalkan Delivered di Export harus mengosongkan ETD — tanggal
     yang sudah lama dipakai. Kalau hilang tanpa jejak, tidak ada yang
     bisa memastikan angka semula. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "card-events.js"), "utf8");
  if (!/newNoteEntry\(/.test(src))
    throw new Error("pengosongan tanggal tidak dicatat ke kronologi");
  if (!/patch\.notesLog\s*=/.test(src))
    throw new Error("catatan tidak ikut disimpan ke database");
  if (!/LABEL_KOLOM_TIBA/.test(src))
    throw new Error("jejaknya tidak menyebut nama kolom yang dihapus");
});
t("label kolom penanda tiba lengkap", () => {
  /* Pesan konfirmasi & jejak kronologi memakai peta ini. Kolom yang
     tidak ada namanya akan tampil sebagai nama teknis. */
  const label = baca("LABEL_KOLOM_TIBA");
  ["factoryDate", "etd", "etdUpdate"].forEach((k) => {
    if (!label[k]) throw new Error("label untuk " + k + " belum ada");
  });
});
console.log("\u2014 ETA OTOMATIS DI BUKU EXPORT \u2014");
t("chip mode ETA muncul di Export, chip Estimated Delivery tidak", () => {
  const ex = { mode: "export" };
  eq(w.etaPredictionAppliesTo(ex), true, "ETA:");
  eq(w.deliveryPredictionAppliesTo(ex), false, "Estimated Delivery:");
});
t("panel mekanika prediksi tetap khusus Import", () => {
  /* Panel itu seluruhnya menghitung Estimated Delivery. Dibiarkan
     Import-saja untuk sekarang — ETA otomatis Export tetap jalan. */
  eq(w.predictionDetailHtml({ mode: "export", etd: "2026-08-22" }), "");
});

console.log("\u2014 LEBAR KOLOM PACKING LIST \u2014");
t("jumlah lebar kolom tetap 100%", () => {
  const jml = (n) => n.reduce((a, b) => a + b, 0);
  eq(Math.round(jml(baca("CIPL_COLS_PACKING")) * 10) / 10, 100, "Packing List:");
  eq(Math.round(jml(baca("CIPL_COLS_INVOICE")) * 10) / 10, 100, "Invoice:");
});
t("kolom Item Description tidak lebih sempit dari kolom Dimensi", () => {
  /* Keduanya memuat teks sepanjang ±20 huruf ("TYRE MOLD TREAD ONLY"
     vs "80 CM x 80 CM x 56 CM"). Selama Dimensi lebih lebar, yang
     terpotong selalu nama barang — sementara di sebelahnya menganga. */
  const c = baca("CIPL_COLS_PACKING");
  const item = c[1], dimensi = c[8];
  if (item < dimensi)
    throw new Error(`Item ${item}% lebih sempit dari Dimensi ${dimensi}%`);
});
t("kolom Item Description memang DILEBARKAN", () => {
  const c = baca("CIPL_COLS_PACKING");
  if (c[1] <= 17) throw new Error("Item masih " + c[1] + "% — belum dilebarkan");
});

console.log("\u2014 MARGIN NARROW: WEB & EXCEL SAMA \u2014");
t("margin @page NOL — supaya kop & kaki peramban tidak tercetak", () => {
  /* Peramban menggambar tanggal, judul tab, "about:blank", dan nomor
     halaman DI DALAM area margin @page. Tidak ada CSS yang bisa
     mematikannya; satu-satunya cara adalah tidak menyisakan ruang.

     Pernah dicoba sebaliknya — margin narrow dipindah ke @page — dan
     kop & kaki peramban langsung muncul di keempat sisinya. */
  [["ciplCss", w.ciplCss()], ["suratJalanCss", w.suratJalanCss()]]
    .forEach(([nama, css]) => {
      if (!/@page \{[^}]*margin:\s*0\s*;/.test(css))
        throw new Error(nama + ": margin @page bukan nol — kop peramban akan tercetak");
    });
});
t("jarak ke tepi kertas dipindah ke padding, bukan hilang", () => {
  const css = w.ciplCss();
  const m = /\.ci-sheet \{[^}]*padding:\s*([\d.]+)mm\s+([\d.]+)mm/.exec(css);
  if (!m) throw new Error("padding .ci-sheet tidak ditemukan");
  eq(m[1], "19.05", "atas/bawah (0,75 inci):");
  eq(m[2], "6.35", "kiri/kanan (0,25 inci):");
});
t("tinggi kotak SI ikut margin yang baru", () => {
  /* Kalau angka ini tertinggal di 20mm sementara marginnya 38,1mm,
     kotaknya lebih tinggi daripada ruang tersisa dan mendorong satu
     halaman kosong di belakangnya. */
  const css = w.ciplCss();
  const m = /\.si-box \{[^}]*min-height:\s*calc\(297mm - ([\d.]+)mm/.exec(css);
  if (!m) throw new Error("min-height .si-box tidak ditemukan");
  eq(m[1], "38.1", "297mm dikurangi:");
});
t("angka web & Excel benar-benar sepasang", () => {
  /* Penjaga terpenting di sini: dua berkas, satu maksud. Kalau salah
     satu diubah sendirian, cetakan dari web dan dari Excel jatuh di
     tempat berbeda — dan bedanya cuma beberapa milimeter, jenis
     selisih yang tidak disadari sampai dokumennya sudah dikirim. */
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "js", "features", "cipl-excel.js"), "utf8");
  const blok = /XLS_MARGIN_NARROW = \{([\s\S]*?)\}/.exec(src);
  if (!blok) throw new Error("XLS_MARGIN_NARROW tidak ditemukan");
  const nilai = {};
  blok[1].replace(/(\w+):\s*([\d.]+)/g, (_, k, v) => (nilai[k] = Number(v)));
  eq(nilai.left, 0.25, "kiri:");
  eq(nilai.right, 0.25, "kanan:");
  eq(nilai.top, 0.75, "atas:");
  eq(nilai.bottom, 0.75, "bawah:");
  // inci -> mm, dibandingkan dengan padding .ci-sheet
  const css = w.ciplCss();
  const m = /\.ci-sheet \{[^}]*padding:\s*([\d.]+)mm\s+([\d.]+)mm/.exec(css);
  eq(Number(m[1]).toFixed(2), (nilai.top * 25.4).toFixed(2), "atas web vs Excel:");
  eq(Number(m[2]).toFixed(2), (nilai.left * 25.4).toFixed(2), "kiri web vs Excel:");
});
t("ketiga lembar Excel memakai margin yang SAMA", () => {
  /* Dulu 0,3 / 0,7 / 0,7 di kiri — warisan berkas yang disetel satu
     per satu oleh tangan. */
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "js", "features", "cipl-excel.js"), "utf8");
  const sisa = src.match(/margins:\s*\{[^}]*left:/g) || [];
  eq(sisa.length, 0, "masih ada lembar dengan margin sendiri:");
  // SI ikut dipusatkan, kalau tidak ia berdiri sendiri di antara dua lembar lain.
  const jml = (src.match(/tengah: true/g) || []).length;
  eq(jml, 3, "jumlah lembar yang dipusatkan:");
});

console.log("\u2014 LOGO SURAT JALAN \u2014");
t("tiga angka logo kop bergerak bersama", () => {
  /* Nama perusahaan dipusatkan pada sel di sebelah kanan logo; padding
     kanan sel teks itulah yang menyeimbangkannya supaya terlihat di
     tengah HALAMAN. Kalau logonya diperbesar tanpa paddingnya ikut,
     judulnya bergeser ke kiri — halus, dan justru karena halus tidak
     ada yang menyadari. */
  const css = w.suratJalanCss();
  const sel = /\.sj-kop-logo \{[^}]*width:\s*(\d+)px/.exec(css);
  const gbr = /\.sj-kop-logo img \{[^}]*width:\s*(\d+)px/.exec(css);
  const teks = /\.sj-kop-teks \{[^}]*padding-right:\s*(\d+)px/.exec(css);
  if (!sel || !gbr || !teks) throw new Error("angka lebar kop tidak ditemukan");
  eq(sel[1], teks[1], "lebar sel logo vs padding kanan sel teks:");
  const lebarSel = Number(sel[1]), lebarGbr = Number(gbr[1]);
  // padding 6px kiri-kanan (lihat .sj-kop td)
  if (lebarGbr > lebarSel - 12)
    throw new Error(`gambar ${lebarGbr}px tidak muat di sel ${lebarSel}px (padding 6px)`);
});
t("logo surat jalan memang LEBIH BESAR dari sebelumnya", () => {
  const css = w.suratJalanCss();
  const gbr = Number(/\.sj-kop-logo img \{[^}]*width:\s*(\d+)px/.exec(css)[1]);
  if (gbr <= 58) throw new Error("logo belum diperbesar (masih " + gbr + "px)");
  /* Batas atas: kop yang terlalu tinggi mendorong isi surat jalan ke
     halaman kedua. */
  if (gbr > 96) throw new Error("logo terlalu besar — kop akan mendorong isi (" + gbr + "px)");
});
t("logo CIPL cetak TIDAK ikut membesar", () => {
  /* Yang diminta hanya surat jalan. Mengubah CIPL sekalian berarti
     mengubah cetakan yang tidak dikeluhkan siapa pun. */
  const gbr = Number(/\.ci-kop-logo img \{[^}]*width:\s*(\d+)px/.exec(w.ciplCss())[1]);
  eq(gbr, 52, "lebar logo CIPL cetak:");
});

console.log("\u2014 PEMILIH JADWAL YANG BISA DIKETIK \u2014");
t("dropdown diganti kotak ketik + daftar saran", () => {
  ["dnShipmentSearch", "dnInvoiceShipmentSearch"].forEach((id) => {
    const el = $("#" + id);
    if (!el) throw new Error(id + " tidak ada");
    eq(el.getAttribute("list"), "dnShipmentList", id + " tidak tersambung ke daftar:");
  });
  // Id jadwalnya tetap dibaca dari [data-dn], jadi penyimpanan tak berubah.
  ["dnShipmentPick", "dnInvoiceShipmentPick"].forEach((id) => {
    const el = $("#" + id);
    if (!el) throw new Error(id + " tidak ada");
    eq(el.dataset.dn, "shipmentId", id + ":");
    eq(el.type, "hidden", id + " harus tersembunyi:");
  });
});
t("mengetik label mengisi id jadwalnya", () => {
  const simpan = baca("data").export;
  w.eval('data.export = [{ id: "x1", invoice: "INV-A", party: "PT SATU" },' +
         '               { id: "x2", invoice: "INV-B", party: "PT DUA" }]');
  try {
    w.isiPilihanJadwal();
    const dl = $("#dnShipmentList");
    eq(dl.querySelectorAll("option").length, 2, "jumlah saran:");
    const cari = $("#dnInvoiceShipmentSearch"), simpanId = $("#dnInvoiceShipmentPick");
    cari.value = "INV-B · PT DUA";
    cari.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(simpanId.value, "x2", "id terisi:");
    eq(cari.classList.contains("is-invalid"), false, "tidak ditandai salah:");
    // Dikosongkan -> tautannya lepas.
    cari.value = "";
    cari.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(simpanId.value, "", "id dilepas:");
  } finally {
    w.eval("data.export = " + JSON.stringify(simpan || []));
    w.isiPilihanJadwal();
  }
});
t("ketikan yang TIDAK cocok ditandai, bukan diam-diam dianggap kosong", () => {
  /* Salah ketik satu huruf akan mencetak surat jalan tanpa daftar
     barang. Lebih baik terlihat merah daripada diam. */
  const simpan = baca("data").export;
  w.eval('data.export = [{ id: "y1", invoice: "INV-A", party: "PT SATU" }]');
  try {
    w.isiPilihanJadwal();
    const cari = $("#dnInvoiceShipmentSearch"), simpanId = $("#dnInvoiceShipmentPick");
    cari.value = "INV-Z · PT ENTAH";
    cari.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(simpanId.value, "", "id tetap kosong:");
    eq(cari.classList.contains("is-invalid"), true, "ditandai salah:");
    cari.value = "";
    cari.dispatchEvent(new w.Event("input", { bubbles: true }));
  } finally {
    w.eval("data.export = " + JSON.stringify(simpan || []));
    w.isiPilihanJadwal();
  }
});
t("dua jadwal berlabel sama tetap bisa dibedakan", () => {
  /* Tanpa pembeda, keduanya menunjuk satu id — pengguna memilih yang
     satu dan mendapat yang lain, tanpa tanda apa pun. */
  const simpan = baca("data").export;
  w.eval('data.export = [{ id: "z1", invoice: "INV-S", party: "PT SAMA", etd: "2026-08-01" },' +
         '               { id: "z2", invoice: "INV-S", party: "PT SAMA", etd: "2026-09-01" }]');
  try {
    w.isiPilihanJadwal();
    const opsi = [...$("#dnShipmentList").querySelectorAll("option")].map((o) => o.value);
    eq(opsi.length, 2, "jumlah saran:");
    if (opsi[0] === opsi[1]) throw new Error("dua saran identik — salah satunya mustahil dipilih");
  } finally {
    w.eval("data.export = " + JSON.stringify(simpan || []));
    w.isiPilihanJadwal();
  }
});

console.log("\u2014 FORMAT NOMOR INVOICE \u2014");
t("Commercial Invoice memakai spasi di tanda pisah", () => {
  const tpl = w.docNumTemplate("invoice", "2026-08-20");
  eq(w.docNumFormat(tpl, 45, 3), "DDI - CRBM - VIII - 045");
});
t("sub-jenis & cadangan memberi bentuk yang SAMA", () => {
  /* Pola invoice ditulis dua kali: di sub-jenis Commercial dan sebagai
     cadangan di DOCNUM_TYPES. Kalau cuma satu yang diubah, nomor yang
     keluar berbeda tergantung sub-jenisnya terpilih atau tidak. */
  const sub = baca("DOCNUM_SUBTYPES").invoice.Commercial.pattern;
  const utama = baca("DOCNUM_TYPES").invoice.pattern;
  eq(sub, utama, "pola sub-jenis vs cadangan:");
});
t("Non-Commercial TIDAK ikut berubah", () => {
  /* Bentuknya memang lain sejak awal — bukan pola yang sama. */
  eq(baca("DOCNUM_SUBTYPES").invoice["Non-Commercial"].pattern,
    "DDI-{SEQ}/{YYYY}-{MM}-EXIM-LOG");
});
t("nomor lama & baru saling ketemu saat dicari", () => {
  /* Nomor lama tersimpan tanpa spasi. Tanpa pengabaian tanda pisah di
     pencarian, mengetik bentuk yang satu tidak akan menemukan yang lain. */
  const lama = { id: "n1", status: "process", party: "PT X",
    docNo: "DDI-CRBM-VIII-044", items: [] };
  const baru = { id: "n2", status: "process", party: "PT X",
    docNo: "DDI - CRBM - VIII - 045", items: [] };
  eq(cariDi(lama, "DDI - CRBM - VIII - 044"), 1, "nomor lama dicari bentuk baru:");
  eq(cariDi(baru, "DDI-CRBM-VIII-045"), 1, "nomor baru dicari bentuk lama:");
});
t("nama berkas unduhan dirapatkan, bukan berspasi", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "cipl-excel.js"), "utf8");
  if (!/tautan\.download = `\$\{namaBerkas\}\.xlsx`/.test(src))
    throw new Error("nama berkas masih memakai nomor mentah");
  const rapat = "DDI - CRBM - VIII - 045".replace(/\s*-\s*/g, "-").replace(/\s+/g, "_");
  eq(rapat, "DDI-CRBM-VIII-045");
});

console.log("\u2014 JANGKAUAN PENCARIAN \u2014");
/* Nomor B/L & AWB adalah yang PALING sering dipakai mencari — dari
   e-mail forwarder atau dokumen di tangan — tapi dulu tidak ikut
   dicari sama sekali. Nomornya jelas tertulis di kartu, pencariannya
   mengembalikan kosong. */
function cariDi(jadwal, kata) {
  const el = $("#searchInput");
  const simpanQ = el.value, simpanSt = $("#filterStatus").value;
  // Sumber daftarnya `data`, bukan `shipments` — lihat currentList().
  const mode = baca("activeMode");
  const daftar = baca("data")[mode];
  w.eval("data." + mode + " = " + JSON.stringify([jadwal]));
  el.value = kata;
  $("#filterStatus").value = "";
  const hasil = w.getFiltered().length;
  w.eval("data." + mode + " = " + JSON.stringify(daftar));
  el.value = simpanQ; $("#filterStatus").value = simpanSt;
  return hasil;
}
t("nomor Master/House B-L & AWB ikut tercari", () => {
  const j = { id: "u1", status: "process", party: "PT X",
    masterBL: "FGLQA2608005", houseBL: "PFSX260480", items: [] };
  eq(cariDi(j, "FGLQA2608005"), 1, "master AWB:");
  eq(cariDi(j, "PFSX260480"), 1, "house B/L:");
  eq(cariDi(j, "fglqa2608005"), 1, "huruf kecil:");
});
t("tanda pisah tidak menghalangi", () => {
  /* "PFSX-260480" di e-mail vs "PFSX260480" di data — harus ketemu. */
  const j = { id: "u2", status: "process", party: "PT X",
    houseBL: "PFSX-260480", items: [] };
  eq(cariDi(j, "PFSX260480"), 1, "dicari tanpa tanda pisah:");
  eq(cariDi(j, "PFSX-260480"), 1, "dicari dengan tanda pisah:");
});
t("kolom lain di kartu ikut tercari", () => {
  const j = { id: "u3", status: "process", party: "PT X", container: "TCLU1234567",
    origin: "TXG", destination: "TPP", forwarder: "PRIME", notes: "titip kirim",
    items: [{ namaBarang: "SPINDLE", hsCode: "84669390" }] };
  [["TCLU1234567", "kontainer"], ["84669390", "HS Code"],
   ["PRIME", "forwarder"], ["titip", "catatan"], ["SPINDLE", "nama barang"]]
    .forEach(([q, ket]) => eq(cariDi(j, q), 1, ket + ":"));
});
t("yang TIDAK cocok tetap tidak ketemu", () => {
  /* Penjaga: pencarian yang menjangkau lebih banyak kolom mudah
     berubah jadi pencarian yang cocok dengan apa saja. */
  const j = { id: "u4", status: "process", party: "PT X",
    masterBL: "FGLQA2608005", items: [] };
  eq(cariDi(j, "ZZZZ9999"), 0);
});

console.log("\u2014 FILTER STATUS BAWAAN \u2014");
t("halaman dibuka dengan filter status Process", () => {
  /* Yang dikerjakan sehari-hari adalah kiriman yang masih berjalan.
     Membuka ke "Semua Status" mendorong yang perlu ditindak ke bawah. */
  eq($("#filterStatus").value, baca("FILTER_STATUS_DEFAULT"));
  eq(baca("FILTER_STATUS_DEFAULT"), "process", "nilai bawaan:");
});
t("Process tersedia di KEDUA buku", () => {
  /* Nilai bawaan yang tidak ada di daftar pilihan akan membuat
     <select> diam-diam jadi kosong. */
  const opsi = baca("STATUS_OPTIONS_BY_MODE");
  ["import", "export"].forEach((m) => {
    if (!opsi[m].includes(baca("FILTER_STATUS_DEFAULT")))
      throw new Error("nilai bawaan tidak ada di buku " + m);
  });
});
t("pilihan pengguna TIDAK dilompat balik saat daftar digambar ulang", () => {
  /* Penjaga terpenting. applyModeLabels() mengisi ulang <option> tiap
     kali render, jadi kalau nilai bawaan dipasang setiap kali, pilihan
     pengguna hilang sendiri sedetik setelah dipilih. */
  const el = $("#filterStatus");
  const simpan = el.value;
  el.value = "arrived";
  w.render();
  eq(el.value, "arrived", "setelah render ulang:");
  el.value = "";
  w.render();
  eq(el.value, "", '"Semua Status" juga harus bertahan:');
  el.value = simpan;
  w.render();
});
t("pindah buku memulai lagi dari Process", () => {
  const el = $("#filterStatus");
  const modeAwal = baca("activeMode");
  el.value = "arrived";
  w.switchMode(modeAwal === "import" ? "export" : "import");
  eq(el.value, "process", "setelah pindah buku:");
  w.switchMode(modeAwal);
  eq(el.value, "process", "setelah kembali:");
});
t("Reset filter tetap MEMBERSIHKAN, bukan kembali ke Process", () => {
  /* Tombolnya berbunyi "reset": kalau ia menyisakan saringan status,
     catatan "disaring: ..." tidak hilang dan tombolnya terasa rusak. */
  const el = $("#filterStatus");
  el.value = "arrived";
  w.resetAllFilters();
  eq(el.value, "", "setelah reset:");
  el.value = "process";
  w.render();
});

console.log("\u2014 CHIP SARINGAN CEPAT DIHAPUS (BUG: FILTER ARRIVED SELALU KOSONG) \u2014");
t('BUG LAMA DIPERBAIKI: saringan status "Arrived" sungguhan menampilkan hasil', () => {
  /* Ini laporan asli: chip "Semua" dulu diam-diam berarti "belum
     Arrived" (test: !isArrived), dan itu SELALU aktif sebagai bawaan.
     Begitu saringan status diganti ke "Arrived", keduanya di-AND dan
     tidak akan PERNAH sama-sama benar untuk kiriman mana pun -> hasil
     selalu nol tanpa keterangan apa pun di layar. Diperbaiki dengan
     menghapus seluruh mekanisme "chip aktif" itu, bukan menambal
     kasus per kasus. */
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  w.eval("data." + mode + ' = [' +
    '{ id: "bug1", status: "arrived", items: [] },' +
    '{ id: "bug2", status: "process", items: [] }' +
  ']');
  const dSt = $("#filterStatus"), dQ = $("#searchInput");
  const simpanSt = dSt.value, simpanQ = dQ.value;
  dSt.value = "arrived";
  dQ.value = "";
  try {
    const hasil = w.getFiltered().map((s) => s.id);
    if (hasil.length !== 1 || hasil[0] !== "bug1")
      throw new Error("filter status Arrived seharusnya menampilkan tepat 1 kiriman (bug1), dapat: " + JSON.stringify(hasil));
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    dSt.value = simpanSt; dQ.value = simpanQ;
  }
});
t("tidak ada lagi PRESETS/activePreset/#presetRow di kode maupun DOM", () => {
  if (typeof w.PRESETS !== "undefined") throw new Error("PRESETS masih ada");
  if (typeof w.activePreset !== "undefined") throw new Error("activePreset masih ada");
  if ($("#presetRow")) throw new Error("#presetRow masih ada di DOM");
  if (w.document.querySelector(".chip")) throw new Error("elemen .chip masih ada di DOM");
});
t('"Perlu Tindakan" masih bisa dipanggil lewat setOnlyNeedsAction() (Ringkasan & command palette)', () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  w.eval("data." + mode + ' = [' +
    '{ id: "na1", status: "process", eta: "2020-01-01", items: [] },' +
    '{ id: "na2", status: "process", eta: "2099-01-01", items: [] }' +
  ']');
  const dSt = $("#filterStatus"), simpanSt = dSt.value;
  dSt.value = "";
  try {
    w.setOnlyNeedsAction(true);
    const hasil = w.getFiltered().map((s) => s.id);
    if (!hasil.includes("na1")) throw new Error("kiriman yang perlu tindakan (ETA lewat) tidak ikut tersaring");
    w.setOnlyNeedsAction(false);
    const hasilLagi = w.getFiltered().map((s) => s.id);
    if (!hasilLagi.includes("na2")) throw new Error("setOnlyNeedsAction(false) belum benar-benar melepas saringan");
  } finally {
    w.setOnlyNeedsAction(false);
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    dSt.value = simpanSt;
  }
});
t("Reset Filter & pindah buku ikut melepas onlyNeedsAction", () => {
  w.setOnlyNeedsAction(true);
  w.resetAllFilters();
  eq(baca("onlyNeedsAction"), false, "setelah Reset Filter:");
  w.setOnlyNeedsAction(true);
  const modeAwal = baca("activeMode");
  w.switchMode(modeAwal === "import" ? "export" : "import");
  eq(baca("onlyNeedsAction"), false, "setelah pindah buku:");
  w.switchMode(modeAwal);
});

console.log("\u2014 TOMBOL CEPAT: HARI INI / MINGGU INI \u2014");
t('"Hari Ini" mengisi rentang jadi tanggal hari ini saja', () => {
  const dari = $("#filterDateFrom"), sampai = $("#filterDateTo");
  const simpan = { dari: dari.value, sampai: sampai.value };
  try {
    $("#btnQuickToday").click();
    eq(dari.value, baca("todayISO()"), "dari:");
    eq(sampai.value, baca("todayISO()"), "sampai:");
  } finally {
    dari.value = simpan.dari; sampai.value = simpan.sampai;
    w.applyDateRangeClearVisibility();
  }
});
t('"Minggu Ini" mengisi rentang 7 hari bergulir dari hari ini', () => {
  const dari = $("#filterDateFrom"), sampai = $("#filterDateTo");
  const simpan = { dari: dari.value, sampai: sampai.value };
  try {
    $("#btnQuickWeek").click();
    eq(dari.value, baca("todayISO()"), "dari:");
    const beda = (new Date(sampai.value) - new Date(dari.value)) / 86400000;
    eq(beda, 6, "selisih dari-sampai dalam hari:");
  } finally {
    dari.value = simpan.dari; sampai.value = simpan.sampai;
    w.applyDateRangeClearVisibility();
  }
});
t("basis (ETA/ETD/Estimasi Delivery) TIDAK ikut diubah oleh tombol cepat", () => {
  const basis = $("#filterDateBasis"), dari = $("#filterDateFrom"), sampai = $("#filterDateTo");
  const simpan = { basis: basis.value, dari: dari.value, sampai: sampai.value };
  try {
    basis.value = "etd";
    $("#btnQuickToday").click();
    eq(basis.value, "etd", "basis harus tetap ETD, bukan balik ke ETA:");
  } finally {
    basis.value = simpan.basis; dari.value = simpan.dari; sampai.value = simpan.sampai;
    w.applyDateRangeClearVisibility();
  }
});
t('"Minggu Depan" mengisi rentang 7 hari setelah "Minggu Ini" (hari ke-7 s.d. ke-13)', () => {
  const dari = $("#filterDateFrom"), sampai = $("#filterDateTo");
  const simpan = { dari: dari.value, sampai: sampai.value };
  try {
    $("#btnQuickNextWeek").click();
    const hariIni = new Date(baca("todayISO()") + "T00:00:00");
    const dariHarap = new Date(hariIni); dariHarap.setDate(dariHarap.getDate() + 7);
    const sampaiHarap = new Date(hariIni); sampaiHarap.setDate(sampaiHarap.getDate() + 13);
    eq(dari.value, dariHarap.toISOString().slice(0, 10), "dari:");
    eq(sampai.value, sampaiHarap.toISOString().slice(0, 10), "sampai:");
  } finally {
    dari.value = simpan.dari; sampai.value = simpan.sampai;
    w.applyDateRangeClearVisibility();
  }
});
t('dropdown basis default-nya "Estimated Delivery", bukan ETA', () => {
  const opt = $("#filterDateBasis option[selected]");
  if (!opt || opt.value !== "actual")
    throw new Error('opsi "selected" di HTML bukan value="actual"');
  const basis = $("#filterDateBasis");
  const simpan = basis.value;
  try {
    w.resetDateRangeFilter();
    eq(basis.value, "actual", "setelah Reset Filter, basis kembali ke:");
  } finally {
    basis.value = simpan;
  }
});

console.log("\u2014 BILAH RINGKASAN: TOTAL / IN PROCESS / DELAYED / ARRIVED \u2014");
t("keempat angka terisi dan totalnya konsisten (Total = jumlah 3 lainnya)", () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  w.eval("data." + mode + ' = [' +
    '{ id: "sb1", status: "process", items: [] },' +
    '{ id: "sb2", status: "process", items: [] },' +
    '{ id: "sb3", status: "delayed", items: [] },' +
    '{ id: "sb4", status: "arrived", items: [] }' +
  ']');
  try {
    w.render();
    eq($("#statTotal").textContent, "4");
    eq($("#statProcess").textContent, "2");
    eq($("#statDelayed").textContent, "1");
    eq($("#statArrived").textContent, "1");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    w.render();
  }
});
t('label "Arrived" ikut ML() -- jadi "Delivered" di buku Export', () => {
  const modeAwal = baca("activeMode");
  try {
    w.switchMode("export");
    eq($("#lblStatArrived").textContent, w.statusLabel("arrived", "export"));
  } finally {
    w.switchMode(modeAwal);
  }
});


function pakaiJadwalUji(list, jalankan) {
  const mode = baca("activeMode");
  const simpanData = baca("data")[mode];
  const el = { status: $("#filterStatus"), dari: $("#filterDateFrom"),
    sampai: $("#filterDateTo"), basis: $("#filterDateBasis"), q: $("#searchInput") };
  const simpanEl = { status: el.status.value, dari: el.dari.value,
    sampai: el.sampai.value, basis: el.basis.value, q: el.q.value };
  w.eval("data." + mode + " = " + JSON.stringify(list));
  try {
    return jalankan(el);
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpanData));
    el.status.value = simpanEl.status; el.dari.value = simpanEl.dari;
    el.sampai.value = simpanEl.sampai; el.basis.value = simpanEl.basis;
    el.q.value = simpanEl.q;
    w.render();
  }
}
t("tanpa saringan: badge = seisi buku, bukan lagi format N/M", () => {
  const list = [
    { id: "cnt1", status: "process", items: [] },
    { id: "cnt2", status: "delayed", items: [] },
    { id: "cnt3", status: "arrived", items: [] },
  ];
  pakaiJadwalUji(list, (el) => {
    el.status.value = ""; el.dari.value = ""; el.sampai.value = ""; el.q.value = "";
    w.render();
    eq($("#listCount").textContent, "3", "3 kartu, tanpa saringan apa pun:");
  });
});
t("saringan status: badge ikut turun ke jumlah yang cocok saja", () => {
  const list = [
    { id: "st1", status: "process", items: [] },
    { id: "st2", status: "process", items: [] },
    { id: "st3", status: "arrived", items: [] },
  ];
  pakaiJadwalUji(list, (el) => {
    el.status.value = "process"; el.dari.value = ""; el.sampai.value = ""; el.q.value = "";
    w.render();
    eq($("#listCount").textContent, "2", "2 yang berstatus process:");
  });
});
t("saringan rentang tanggal: badge menghitung yang jatuh di rentang itu saja", () => {
  const list = [
    { id: "dt1", status: "process", eta: "2026-06-05", items: [] },
    { id: "dt2", status: "process", eta: "2026-06-15", items: [] },
    { id: "dt3", status: "process", eta: "2026-06-25", items: [] },
  ];
  pakaiJadwalUji(list, (el) => {
    el.status.value = ""; el.q.value = "";
    el.basis.value = "eta"; el.dari.value = "2026-06-01"; el.sampai.value = "2026-06-12";
    w.render();
    eq($("#listCount").textContent, "1", "cuma dt1 yang ETA-nya 1-12 Juni:");
  });
});
t("gabungan saringan tanggal + status: badge ikut keduanya sekaligus", () => {
  const list = [
    { id: "gb1", status: "process", eta: "2026-06-05", items: [] },
    { id: "gb2", status: "arrived", eta: "2026-06-05", items: [] },
    { id: "gb3", status: "process", eta: "2026-06-25", items: [] },
  ];
  pakaiJadwalUji(list, (el) => {
    el.q.value = "";
    el.basis.value = "eta"; el.dari.value = "2026-06-01"; el.sampai.value = "2026-06-12";
    el.status.value = "process";
    w.render();
    eq($("#listCount").textContent, "1", "cuma gb1 yang cocok tanggal MAUPUN status:");
  });
});
t("ringkasan Total/In Process/Delayed/Arrived TETAP dari seisi buku, tidak ikut saringan", () => {
  /* Beda dengan badge di atas -- ini sengaja tidak berubah walau
     saringan aktif, lihat komentar di updateStats(). */
  const list = [
    { id: "rb1", status: "process", eta: "2026-06-05", items: [] },
    { id: "rb2", status: "delayed", eta: "2026-06-25", items: [] },
    { id: "rb3", status: "arrived", eta: "2026-06-25", items: [] },
  ];
  pakaiJadwalUji(list, (el) => {
    el.q.value = ""; el.status.value = "";
    el.basis.value = "eta"; el.dari.value = "2026-06-01"; el.sampai.value = "2026-06-12";
    w.render();
    eq($("#listCount").textContent, "1", "badge ikut saringan (cuma rb1):");
    eq($("#statTotal").textContent, "3", "tapi ringkasan Total tetap seisi buku:");
    eq($("#statProcess").textContent, "1");
    eq($("#statDelayed").textContent, "1");
    eq($("#statArrived").textContent, "1");
  });
});

console.log("\u2014 CHIP AKUN: SEGMEN BILAH, BUKAN PIL MENGAMBANG \u2014");
t("sorotan setinggi bilah atas (align-self: stretch) & bersudut siku", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  const i = css.indexOf("\n.user-chip {\n  position: relative;");
  if (i < 0) throw new Error("aturan .user-chip yang bisa diklik tidak ditemukan");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/align-self:\s*stretch/.test(blok))
    throw new Error("chip tidak setinggi bilah -- sorotannya akan jadi pita pendek di tengah");
  if (/border-radius/.test(blok))
    throw new Error("border-radius masih ada, seharusnya bersudut siku");
});
t("panah sudah tidak ada -- tidak tersisa di HTML maupun CSS", () => {
  if ($(".user-chip-caret")) throw new Error("panah masih ada di DOM");
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  if (css.includes(".user-chip-caret"))
    throw new Error("aturan .user-chip-caret masih tertinggal di CSS");
});
t("menu akun terbuka saat kursor melintas, TAPI klik tetap dipertahankan", () => {
  /* Perangkat sentuh tidak punya hover sama sekali -- menu yang hanya
     mengandalkan hover tidak akan pernah bisa dibuka di ponsel. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "auth", "session.js"), "utf8");
  if (!/addEventListener\("mouseenter"/.test(src))
    throw new Error("tidak ada pembuka lewat hover");
  if (!/addEventListener\("click"/.test(src))
    throw new Error("pembuka lewat klik hilang -- perangkat sentuh jadi tidak bisa keluar");
  if (!/setTimeout\(tutupUserMenu/.test(src))
    throw new Error("penutupan tanpa jeda -- menu menutup tepat saat hendak diklik");
});
t("ada jembatan tak terlihat antara chip & menunya", () => {
  /* Menunya berjarak dari chip; tanpa jembatan, kursor melewati celah
     kosong dan menu menutup di tengah jalan. */
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  if (!/\.user-menu::before \{[^}]*top:\s*-/.test(css))
    throw new Error("tidak ada jembatan penutup celah di atas menu");
});
t("layar menengah & sempit: nama & peran disembunyikan, sisakan avatar saja", () => {
  /* Mulai di bawah 1.320 px (bukan 991 px lagi): navbar lengkap butuh
     ~1.320 px dengan label bahasa Inggris, dan di jendela terbelah
     (Win + panah) tautan terakhir terpotong. */
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  const i = css.indexOf("@media (max-width: 1319px)");
  if (i < 0) throw new Error("breakpoint 1319px tidak ditemukan");
  if (!/^\s*\.user-chip-main \{[^}]*display: none/.test(css.slice(i + "@media (max-width: 1319px) {".length)))
    throw new Error("nama & peran tidak disembunyikan di layar menengah");
});
t("navbar meringkas bertahap: tidak ada yang terpotong atau patah di layar menengah", () => {
  const css = require("fs").readFileSync(require("path").join(__dirname, "..", "css", "shell.css"), "utf8");
  const blok = (lebar) => { const i = css.indexOf(`@media (max-width: ${lebar}px) {`); return i < 0 ? "" : css.slice(i, css.indexOf("\n}\n", i)); };
  if (!/\.cmd-trigger \{[\s\S]*?white-space: nowrap;[\s\S]*?flex-shrink: 0;/.test(css)) throw new Error("tulisan Quick search bisa patah");
  if (!/\.cmd-trigger-text/.test(blok(1319))) throw new Error("tahap 1: Quick search tidak jadi ikon di < 1.320 px");
  if (!/\.brand-name \{\s*display: none;/.test(blok(1099))) throw new Error("tahap 2: nama brand");
  if (!/\.site-nav-link span \{\s*display: none;/.test(blok(899))) throw new Error("tahap 3: label tautan");
  if (!/\.site-nav-link \{\s*padding: 0 7px;/.test(blok(419))) throw new Error("tahap 4: ponsel kecil");
});
t("kotak cari di luar navbar ber-placeholder singkat 'Cari' / 'Search'", () => {
  ["searchInput", "hsCodeSearch", "accountSearch", "docNumSearch"].forEach((id) => {
    const el = w.document.getElementById(id);
    eq(el.getAttribute("data-i18n-ph"), "ph.cari", id + ":");
    if (!el.getAttribute("aria-label")) throw new Error(id + " kehilangan label aksesibilitas");
  });
  const simpan = baca("activeLang");
  try {
    w.setLang("en");
    eq(w.document.getElementById("hsCodeSearch").placeholder, "Search", "Inggris:");
    w.setLang("id");
    eq(w.document.getElementById("hsCodeSearch").placeholder, "Cari", "Indonesia:");
  } finally {
    w.setLang(simpan);
  }
});
t("menu akun menempel langsung di bawah bilah, tanpa celah menggantung", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  const i = css.indexOf(".user-menu {");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/top:\s*100%/.test(blok))
    throw new Error("menu tidak menempel di bawah chip yang kini setinggi bilah");
});
t("halaman form ikut penuh selebar layar, sama seperti halaman lain", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const i = css.indexOf(".page-form-body {");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/max-width:\s*100%/.test(blok))
    throw new Error(".page-form-body masih dikurung lebar tetap");
  const j = css.indexOf(".page-form-actions-inner {");
  if (/max-width:\s*\d+px/.test(css.slice(j, css.indexOf("}", j))))
    throw new Error("bilah aksi masih dikurung lebar tetap -- tidak akan sejajar dengan isi form");
});

console.log("\u2014 DAFTAR NOMOR PENGAJUAN DANA: BILLING & KETERANGAN \u2014");
t("kolom Nomor Billing & Keterangan HANYA muncul di daftar jenis fund", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  /* Dua kolom ini khusus pengajuan dana -- jenis lain tidak punya
     billingNo, jadi kolomnya cuma jadi ruang kosong di sana. */
  // Jangkar = kepala kolom Nomor (kini berlabel dua bahasa lewat tt()).
  const kepala = src.indexOf('<tr><th>${jenis.key === "invoice" ? tt("No. Invoice", "Invoice No.") : tt("Nomor", "Number")}</th>');
  if (kepala < 0) throw new Error("kepala tabel riwayat tidak ditemukan");
  const potongan = src.slice(kepala, kepala + 1400);
  if (!/jenis\.key === "fund"[\s\S]{0,120}dn-col-billing/.test(potongan))
    throw new Error("kolom Nomor Billing tidak dibatasi ke jenis fund");
  if (!/jenis\.key === "fund"[\s\S]{0,120}dn-col-ket/.test(potongan))
    throw new Error("kolom Keterangan tidak dibatasi ke jenis fund");
});
t("Keterangan diambil dari Rincian -- isi yang sama dengan Subject pada surat", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  if (!/dn-col-ket[\s\S]{0,200}p\.notes/.test(src))
    throw new Error("kolom Keterangan tidak membaca p.notes");
});
t("kolom baru tidak memakai elipsis -- tabelnya bergulir, bukan memotong", () => {
  /* Aturan yang sama dengan kolom lain di tabel ini (lihat tes
     "riwayat nomor digeser, bukan dibungkus"). */
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "docnum.css"), "utf8");
  /* lastIndexOf: kemunculan PERTAMA ada di dalam media query (yang cuma
     menyembunyikan kolomnya di layar sempit), bukan aturan gayanya. */
  const i = css.lastIndexOf(".docnum-table .dn-col-ket {");
  if (i < 0) throw new Error(".dn-col-ket tidak ditemukan");
  const blok = css.slice(i, css.indexOf("}", i));
  if (/text-overflow/.test(blok))
    throw new Error("kolom Keterangan memotong isinya dengan elipsis");
  if (!/white-space:\s*nowrap/.test(blok))
    throw new Error("kolom Keterangan boleh dibungkus -- barisnya jadi tinggi tidak rata");
});

console.log("\u2014 PENGAJUAN DANA: ISIAN & LEMBAR CETAK \u2014");
t("membuka nomor lama untuk diubah MEMULIHKAN rincian biayanya", () => {
  /* Rincian bukan isian ber-data-dn, jadi pengisi form melewatinya
     diam-diam -- tabelnya tampil kosong padahal datanya tersimpan. */
  const simpan = baca("fundLines");
  try {
    w.setFundLines([
      { desc: "FREIGHT CHARGE", amount: "16.873.095,68", ppnRate: 1.1 },
      { desc: "STORAGE", amount: "1.322.640", ppnRate: 0 },
    ]);
    const baris = [...w.document.querySelectorAll("#fundLinesBody tr")];
    eq(baris.length, 2, "jumlah baris:");
    eq(baris[0].querySelector('[data-fl-f="desc"]').value, "FREIGHT CHARGE");
    eq(baris[0].querySelector('[data-fl-f="ppnRate"]').value, "1.1", "tarif ikut pulih:");
    eq(baris[1].querySelector('[data-fl-f="ppnRate"]').value, "0", "baris tanpa PPN:");
  } finally {
    w.eval("fundLines = " + JSON.stringify(simpan || []));
    w.renderFundLines();
  }
});
t("rincian kosong tetap menyisakan satu baris siap isi", () => {
  const simpan = baca("fundLines");
  try {
    w.setFundLines([]);
    eq(w.document.querySelectorAll("#fundLinesBody tr").length, 1);
  } finally {
    w.eval("fundLines = " + JSON.stringify(simpan || []));
    w.renderFundLines();
  }
});
t("pemulih rincian & penyegar isian bersyarat dipanggil saat memuat nomor lama", () => {
  /* syncDocNumConditional harus jalan SESUDAH isian terisi: dipanggil
     lebih awal, ia membaca dropdown yang masih kosong lalu
     menyembunyikan isian yang justru berisi data. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  const i = src.indexOf("Object.keys(r.payload || {}).forEach");
  if (i < 0) throw new Error("pengisi form tidak ditemukan");
  const blok = src.slice(i, src.indexOf("dnEditingId = r.id", i));
  if (!/setFundLines\(/.test(blok))
    throw new Error("rincian biaya tidak dipulihkan saat memuat nomor lama");
  if (!/syncDocNumConditional\(/.test(blok))
    throw new Error("isian bersyarat tidak disegarkan sesudah data dimuat");
});
t("nilai rupiah dibaca gaya Indonesia: titik ribuan, koma desimal", () => {
  /* parseLooseNumber() aplikasi memakai konvensi sebaliknya, jadi
     "256,66666" terbaca 25.666.666 di sana -- total meleset ribuan
     kali lipat kalau kolom ini ikut memakainya. */
  eq(w.parseRupiah("256,66666"), 256.66666);
  eq(w.parseRupiah("16.873.095,68"), 16873095.68);
  eq(w.parseRupiah("2.500.000"), 2500000);
  eq(w.parseRupiah("1322640"), 1322640);
});
t("angka ditulis balik gaya Indonesia, tanpa nol desimal yang sia-sia", () => {
  eq(w.formatRupiah(16873095.68), "16.873.095,68");
  eq(w.formatRupiah(2500000), "2.500.000");
});
t("Pemohon jadi dropdown dengan dua nama", () => {
  const sel = w.document.querySelector('[data-docnum-panel="fund"] [data-dn="requester"]');
  eq(sel.tagName, "SELECT");
  const nilai = [...sel.options].map((o) => o.value).filter(Boolean);
  eq(nilai.join(","), "Ahmad Riyan,Yogi Firgiawan");
});
t("SELURUH isian Pemohon berupa dropdown dengan dua nama yang sama", () => {
  /* Diketik bebas, nama yang sama bisa masuk dengan tiga ejaan
     berbeda -- dan riwayat nomor jadi tidak bisa disaring per orang. */
  const sel = [...w.document.querySelectorAll('[data-dn="requester"]')];
  if (!sel.length) throw new Error("isian Pemohon tidak ditemukan");
  sel.forEach((el) => {
    eq(el.tagName, "SELECT", "jenis isian Pemohon:");
    const nilai = [...el.options]
      .filter((o) => o.value && !o.dataset.dnLawas)
      .map((o) => o.value);
    eq(nilai.join(","), "Ahmad Riyan,Yogi Firgiawan");
  });
});
t("nama pemohon lama yang di luar daftar tidak hilang saat nomor dibuka", () => {
  /* Isian ini dulu kotak ketik bebas. <select> yang disetel ke nilai
     tanpa pilihan akan diam-diam jatuh ke kosong -- membuka nomor lama
     lalu menyimpannya akan menghapus nama pemohonnya. */
  w.eval('authState.profile = { id: "u1", role: "exim" }');
  tulis("docNumHistoryRows", [{
    id: "lama1", doc_type: "invoice", doc_number: "DDI-001/2026-I-EXIM-LOG",
    doc_date: "2026-01-05", requester: "Ahmad Riyan A", department: "EXIM",
    payload: {},
  }]);
  w.mulaiUbahDocNum("lama1");
  const el = w.docNumPanelEl("invoice").querySelector('[data-dn="requester"]');
  eq(el.value, "Ahmad Riyan A");
  w.batalUbahDocNum();
});
t("isian Nominal dihapus -- totalnya datang dari perhitungan", () => {
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  if (panel.querySelector('[data-dn="amount"]'))
    throw new Error("isian Nominal masih ada");
});
t("bawaan: mata uang IDR & Checked By M. Rangga", () => {
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  const mataUang = panel.querySelector('[data-dn="currency"]');
  eq([...mataUang.options].find((o) => o.defaultSelected).value, "IDR");
  eq(panel.querySelector('[data-dn="checkedByName"]').defaultValue, "M. Rangga");
  eq(
    panel.querySelector('[data-dn="approver1Name"]').defaultValue,
    "Mr. Shin Nara",
  );
  eq(
    panel.querySelector('[data-dn="approver1Role"]').defaultValue,
    "Chief Marketing Officer",
  );
  /* Jalur persetujuan President Director sudah tidak dipakai: isiannya
     dihapus, bukan disembunyikan -- isian tersembunyi tetap ikut
     tersimpan dan akan muncul lagi di surat cetak. */
  if (panel.querySelector('[data-dn="approver2Name"]'))
    throw new Error("isian Approved By 2 masih ada");
});
t("Billing mengisi Dibayarkan Kepada otomatis, tanpa menimpa ketikan sendiri", () => {
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  const sel = panel.querySelector('[data-dn="expenseType"]');
  const payee = panel.querySelector('[data-dn="payee"]');
  try {
    payee.value = "";
    sel.value = "Billing";
    w.syncDocNumConditional(panel);
    eq(payee.value, "KAS NEGARA", "terisi otomatis:");

    sel.value = "Freight";
    w.syncDocNumConditional(panel);
    eq(payee.value, "", "dilepas saat bukan Billing:");

    // Ketikan sendiri tidak boleh ditimpa.
    payee.value = "PT FORWARDER";
    payee.dispatchEvent(new w.Event("input", { bubbles: true }));
    sel.value = "Billing";
    w.syncDocNumConditional(panel);
    eq(payee.value, "PT FORWARDER", "ketikan pengguna dipertahankan:");
  } finally {
    payee.value = "";
    delete payee.dataset.autoFill;
    sel.value = "";
    w.syncDocNumConditional(panel);
  }
});
t("baris baru memakai PPN bawaan 1,1%", () => {
  /* Tarif jasa pengurusan transportasi, dipungut pada hampir semua pos
     di tagihan forwarder. Pos yang tidak dipungut tinggal diubah. */
  eq(w.fundLineBaru().ppnRate, 1.1);
});
t("Enter memindahkan kursor ke baris di bawahnya, kolom yang sama", () => {
  const simpan = baca("fundLines");
  try {
    w.setFundLines([
      { desc: "A", amount: 100, ppnRate: 1.1 },
      { desc: "B", amount: 200, ppnRate: 1.1 },
    ]);
    const body = w.document.getElementById("fundLinesBody");
    const atas = body.querySelector('[data-fl="0"] [data-fl-f="desc"]');
    atas.focus();
    atas.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const bawah = body.querySelector('[data-fl="1"] [data-fl-f="desc"]');
    eq(w.document.activeElement, bawah, "kursor pindah ke baris bawah kolom yang sama:");
  } finally {
    w.eval("fundLines = " + JSON.stringify(simpan || []));
    w.renderFundLines();
  }
});
t("Enter di baris TERAKHIR menambah baris baru sekalian", () => {
  const simpan = baca("fundLines");
  try {
    w.setFundLines([{ desc: "A", amount: 100, ppnRate: 1.1 }]);
    const body = w.document.getElementById("fundLinesBody");
    const el = body.querySelector('[data-fl="0"] [data-fl-f="amount"]');
    el.focus();
    el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    eq(body.querySelectorAll("tr").length, 2, "baris bertambah:");
    eq(w.document.activeElement,
       body.querySelector('[data-fl="1"] [data-fl-f="amount"]'),
       "kursor pindah ke baris baru:");
  } finally {
    w.eval("fundLines = " + JSON.stringify(simpan || []));
    w.renderFundLines();
  }
});
t("Enter TIDAK menerbitkan nomor -- tabelnya ada di dalam form", () => {
  /* Tanpa preventDefault, satu ketukan Enter menerbitkan nomor sebelum
     rinciannya selesai diisi. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "fund-lines.js"), "utf8");
  const i = src.indexOf('e.key !== "Enter"');
  if (i < 0) throw new Error("penangan Enter tidak ditemukan");
  if (src.indexOf("preventDefault", i) < 0 || src.indexOf("preventDefault", i) > i + 400)
    throw new Error("Enter tidak dicegah mengirim form");
});
t("judul kolom angka di form dipusatkan", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "docnum.css"), "utf8");
  const i = css.indexOf("table.fund-lines th.fl-amt");
  if (i < 0) throw new Error("aturan judul kolom angka tidak ada");
  if (!/text-align:\s*center/.test(css.slice(i, css.indexOf("}", i))))
    throw new Error("judul kolom angka tidak dipusatkan");
});
t('potongan nol ditulis "-" tunggal, bukan "- -"', () => {
  /* frNilai() sudah menuliskan nol sebagai "-", jadi menambahkan tanda
     minus di depannya menghasilkan "- -" yang terbaca seperti salah
     cetak. */
  const selPotongan = (lines) => {
    const h = w.buildFundRequestHtml(barisFundUji({
      expenseType: "Lainnya", invoiceNo: "INV1", lines,
    }));
    const i = h.indexOf("baris-potongan");
    const baris = h.slice(i, h.indexOf("</tr>", i));
    return [...baris.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      m[1].replace(/\s+/g, " ").trim(),
    );
  };
  const tanpa = selPotongan([{ desc: "STORAGE", amount: 24998943, ppnRate: 0 }]);
  eq(tanpa[tanpa.length - 1], "-", "tanpa potongan:");
  const dengan = selPotongan([{ desc: "FREIGHT", amount: 1000000, ppnRate: 1.1 }]);
  eq(dengan[dengan.length - 1], "- Rp. 20.000", "dengan potongan:");
});
t("daftar nomor menampilkan nomor invoice untuk jenis selain Billing", () => {
  /* Kolomnya membaca billingNo saja, jadi kosong untuk jenis lain
     padahal nomornya tersimpan -- dan baru terlihat saat dibuka untuk
     diubah. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "docnum-view.js"), "utf8");
  const i = src.indexOf('dn-col-billing dn-num');
  if (i < 0) throw new Error("kolom nomor rujukan tidak ditemukan");
  const potongan = src.slice(i - 400, i + 200);
  if (!/p\.billingNo \|\| p\.invoiceNo/.test(potongan))
    throw new Error("kolom tidak jatuh ke nomor invoice");
});
t("judul kolomnya menyebut kedua jenis nomor", () => {
  const kamus = baca("I18N");
  eq(kamus.id["f.nomor.billing.invoice"], "Nomor Billing/Invoice");
  eq(kamus.en["f.nomor.billing.invoice"], "Billing/Invoice Number");
});
t("format Billing memakai setelan aslinya, tidak ikut dikecilkan tabel rinci", () => {
  /* Penyesuaian untuk enam kolom (huruf 8pt, lebar mm, table-layout
     fixed) hanya berlaku pada .rincian--detail. Format Billing cuma
     tiga kolom dan ruangnya lega -- ikut dikecilkan malah terlihat
     kerdil. */
  const css = w.fundRequestCss();
  const iUmum = css.indexOf("\n  .rincian {");
  const blokUmum = css.slice(iUmum, css.indexOf("}", iUmum));
  if (/font-size/.test(blokUmum))
    throw new Error("ukuran huruf tabel rinci bocor ke format sederhana");
  if (/table-layout/.test(blokUmum))
    throw new Error("table-layout fixed bocor ke format sederhana");

  const iRinci = css.indexOf(".rincian--detail {");
  if (iRinci < 0) throw new Error("aturan khusus tabel rinci tidak ada");
  const blokRinci = css.slice(iRinci, css.indexOf("}", iRinci));
  if (!/font-size:\s*8pt/.test(blokRinci) || !/table-layout:\s*fixed/.test(blokRinci))
    throw new Error("penyesuaian tabel rinci hilang");
});
t("garis pembatas lebih TEBAL daripada garis baris pos", () => {
  /* Dengan border-collapse, garis transparan milik baris pos bisa
     memenangkan perebutan batas kalau tebalnya sama -- garis di atas
     TOTAL lenyap. Yang lebih tebal selalu menang. */
  const css = w.fundRequestCss();
  const iPos = css.indexOf(".rincian .baris-pos td {");
  const tebalPos = /border:\s*([\d.]+)px/.exec(
    css.slice(css.indexOf(".rincian th,"), css.indexOf("}", css.indexOf(".rincian th,"))),
  );
  const iBatas = css.indexOf(".rincian .baris-rujukan td,");
  const tebalBatas = /border-top:\s*([\d.]+)px/.exec(css.slice(iBatas, css.indexOf("}", iBatas)));
  if (iPos < 0 || !tebalPos || !tebalBatas)
    throw new Error("aturan tebal garis tidak lengkap");
  if (Number(tebalBatas[1]) <= Number(tebalPos[1]))
    throw new Error(
      `garis pembatas ${tebalBatas[1]}px tidak lebih tebal daripada ${tebalPos[1]}px -- bisa kalah dan lenyap`,
    );
});
t("baris pos TERAKHIR tetap bergaris di tepi bawah tabel", () => {
  const css = w.fundRequestCss();
  if (!/tbody tr:last-child td \{[^}]*border-bottom-color:\s*#000/.test(css))
    throw new Error("tepi bawah tabel bisa lenyap di baris pos terakhir");
});
t("baris Nomor Billing & Potongan PPH melintang penuh, seperti baris TOTAL", () => {
  /* Dipecah jadi banyak sel, keduanya menyisakan garis tegak pendek
     yang tidak memisahkan apa pun. */
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", invoiceNo: "AI1",
    lines: [{ desc: "A", amount: 100000, ppnRate: 1.1 }],
  }));
  const ambil = (kelas) => {
    const i = h.indexOf('class="' + kelas + '"');
    if (i < 0) throw new Error("baris " + kelas + " tidak ada");
    return h.slice(i, h.indexOf("</tr>", i));
  };
  const rujukan = ambil("baris-rujukan");
  if ((rujukan.match(/<td/g) || []).length !== 1)
    throw new Error("baris rujukan masih dipecah jadi beberapa sel");
  const potongan = ambil("baris-potongan");
  if ((potongan.match(/<td/g) || []).length !== 3)
    throw new Error("baris potongan tidak ringkas: sel kosong masih menyisakan sekat");
});
t("angka rupiah tidak boleh membungkus ke baris kedua", () => {
  /* Sekali membungkus, tinggi barisnya berubah sendiri dan seluruh
     tabel tidak lagi sejajar -- persis yang terjadi pada nilai 100 juta
     ke atas saat kolomnya masih sempit. */
  const css = w.fundRequestCss();
  const i = css.indexOf(".c-amt {");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/white-space:\s*nowrap/.test(blok))
    throw new Error("kolom angka masih boleh membungkus");
  if (!/table-layout:\s*fixed/.test(css))
    throw new Error("lebar kolom masih mengikuti isi -- satu nilai panjang menyempitkan yang lain");
});
t("kolom tabel muat di lebar kertas", () => {
  /* Isi lembar A4 = 210mm - 30mm margin = 180mm. Kolom tetap tidak
     boleh melebihi itu, kalau tidak tabelnya terpotong di tepi kanan. */
  const css = w.fundRequestCss();
  /* Jatah mm hanya berlaku untuk tabel RINCI; format sederhana memakai
     lebar piksel seperti semula karena kolomnya cuma tiga. */
  const lebar = (sel) => {
    const i = css.indexOf(".rincian--detail " + sel + " {");
    const m = /width:\s*([\d.]+)mm/.exec(css.slice(i, css.indexOf("}", i)));
    if (i < 0 || !m) throw new Error(sel + " pada tabel rinci tidak berlebar mm");
    return Number(m[1]);
  };
  const tetap = lebar(".c-no") + lebar(".c-amt") * 3 + lebar(".c-rate");
  if (tetap > 150)
    throw new Error(`kolom tetap ${tetap}mm -- tidak menyisakan ruang cukup untuk uraian`);
});
t("setiap sel bergaris penuh; hanya garis MENDATAR antar baris pos yang disembunyikan", () => {
  /* Aturan lama menyetel garis lewat sapuan "semua td di tbody" lalu
     mematikan sebagian -- begitu ada baris yang tidak mengisi seluruh
     kolom, garis tepinya bolong tanpa ada yang menyadari. */
  const css = w.fundRequestCss();
  if (!/\.rincian th,\s*\r?\n\s*\.rincian td \{[^}]*border:\s*1px solid #000/.test(css))
    throw new Error("tidak semua sel bergaris penuh");
  const i = css.indexOf(".rincian .baris-pos td {");
  if (i < 0) throw new Error("aturan baris pos tidak ditemukan");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/border-top-color:\s*transparent/.test(blok) || !/border-bottom-color:\s*transparent/.test(blok))
    throw new Error("garis mendatar baris pos tidak disembunyikan lewat warna");
  if (/border-top:\s*0|border-bottom:\s*0/.test(blok))
    throw new Error("garis dimatikan dengan lebar 0 -- garis tegaknya ikut hilang di sebagian peramban");
});
t("tabel panjang tetap penuh kolom di SETIAP baris", () => {
  /* Diuji dengan 11 pos & nilai miliaran, meniru tagihan sungguhan. */
  const lines = [
    ["AWB Handling", 100000000, 1.1], ["PIB", 20000, 0], ["CO", 260000, 11],
    ["Agency Fee", 122134, 1.1], ["Non-routine Entry", 34354345345, 1.1],
    ["Inland Trucking", 435345345, 1.1], ["DO Fee", 453534, 1.1],
    ["Handling", 534543, 1.1], ["I", 5435, 1.1], ["J", 4535, 1.1], ["K", 453534, 0],
  ].map(([desc, amount, ppnRate]) => ({ desc, amount, ppnRate }));
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", invoiceNo: "1234567", lines,
  }));
  const i = h.indexOf('<table class="rincian');
  const tabel = h.slice(i, h.indexOf("</table>", i));
  tabel.split("<tr").slice(1).forEach((r, idx) => {
    const sel = (r.match(/<t[dh][\s>]/g) || []).length;
    const span = [...r.matchAll(/colspan="(\d+)"/g)].reduce((a, m) => a + Number(m[1]) - 1, 0);
    if (sel + span !== 6)
      throw new Error(`baris ${idx + 1}: ${sel + span} kolom, harusnya 6`);
  });
});
t("subtotal & potongan ada di BADAN tabel; kaki hanya total akhir", () => {
  /* Keduanya masih bagian dari perincian (jumlah per kolom lalu
     pengurangnya). Yang di kaki cuma angka yang benar-benar dibayarkan
     -- satu-satunya baris yang perlu dibaca cepat. */
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", invoiceNo: "AI1",
    lines: [{ desc: "A", amount: 100000, ppnRate: 1.1 }],
  }));
  const i = h.indexOf('<table class="rincian');
  const tbody = h.slice(h.indexOf("<tbody>", i), h.indexOf("</tbody>", i));
  const tfoot = h.slice(h.indexOf("<tfoot>", i), h.indexOf("</tfoot>", i));
  if (!/baris-subtotal/.test(tbody)) throw new Error("subtotal tidak ada di badan tabel");
  if (!/POTONGAN PPH 23/.test(tbody)) throw new Error("potongan tidak ada di badan tabel");
  if (/baris-subtotal|POTONGAN PPH 23/.test(tfoot))
    throw new Error("subtotal/potongan masih ikut di kaki tabel");
  if ((tfoot.match(/<tr/g) || []).length !== 1)
    throw new Error("kaki tabel harus berisi tepat satu baris total");
});
t("kolom JUMLAH menampilkan nilai+PPN pada subtotal, dan potongan bertanda minus", () => {
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight",
    lines: [
      { desc: "A", amount: 100000, ppnRate: 1.1 },
      { desc: "B", amount: 20000, ppnRate: 0 },
      { desc: "C", amount: 260000, ppnRate: 11 },
    ],
  }));
  const bersih = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // 380.000 + 29.700 = 409.700 ; PPH 2% x 360.000 = 7.200 ; total 402.500
  ["Rp. 380.000", "Rp. 29.700", "Rp. 409.700", "- Rp. 7.200", "Rp. 402.500"].forEach((x) => {
    if (!bersih.includes(x)) throw new Error("tidak tercetak: " + x);
  });
});
t("setiap baris tabel cetak MENGISI seluruh kolom -- garis tepi tidak bolong", () => {
  /* Baris Nomor Billing sempat cuma mengisi 2 dari 3 kolom, sehingga
     kolom terakhir tidak punya sel dan garisnya putus di baris itu. */
  const cek = (html, jml, nama) => {
    const i = html.indexOf('<table class="rincian');
    const tabel = html.slice(i, html.indexOf("</table>", i));
    tabel.split("<tr").slice(1).forEach((r, idx) => {
      const sel = (r.match(/<t[dh][\s>]/g) || []).length;
      const span = [...r.matchAll(/colspan="(\d+)"/g)].reduce((a, m) => a + Number(m[1]) - 1, 0);
      if (sel + span !== jml)
        throw new Error(`${nama} baris ${idx + 1}: ${sel + span} kolom, harusnya ${jml}`);
    });
  };
  cek(w.buildFundRequestHtml(barisFundUji({
    expenseType: "Billing", billingNo: "123", feeBm: "1", feePpn: "2", feePph: "3",
  })), 3, "format lama");
  cek(w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", invoiceNo: "AI1",
    lines: [{ desc: "A", amount: 100, ppnRate: 1.1 }],
  })), 6, "format rinci");
});
t("tabel rinci panjang tidak ditambahi baris kosong -- supaya muat sehalaman", () => {
  const banyak = Array.from({ length: 11 }, (_, i) => ({ desc: "P" + i, amount: 1000, ppnRate: 0 }));
  const h = w.buildFundRequestHtml(barisFundUji({ expenseType: "Freight", lines: banyak }));
  const i = h.indexOf('<table class="rincian');
  const tbody = h.slice(h.indexOf("<tbody>", i), h.indexOf("</tbody>", i));
  /* Isi tbody = baris rujukan + pos + baris TOTAL + baris POTONGAN.
     Lebih dari itu berarti ada penambal kosong yang mendorong lembarnya
     ke halaman kedua. */
  const jumlahBaris = (tbody.match(/<tr/g) || []).length;
  const wajar = banyak.length + 3;
  if (jumlahBaris > wajar)
    throw new Error(`masih ditambahi baris kosong: ${jumlahBaris}, wajar maksimal ${wajar}`);
});

console.log("\u2014 PENGAJUAN DANA: RINCIAN BIAYA PER BARIS \u2014");
/* Angka acuan diambil dari invoice forwarder sungguhan yang dipakai
   merancang fitur ini, supaya hitungannya diuji ke kasus nyata. */
const FL_NYATA = [
  { desc: "FREIGHT CHARGE", amount: 16873095.68, ppnRate: 1.1 },
  { desc: "AWC", amount: 54061.95, ppnRate: 1.1 },
  { desc: "HANDLING", amount: 720826.0, ppnRate: 1.1 },
  { desc: "AWB CHARGES", amount: 270309.75, ppnRate: 1.1 },
  { desc: "AIRPORT CHARGES", amount: 403663.68, ppnRate: 1.1 },
  { desc: "CUSTOMS CLEARANCE ICN", amount: 450516.25, ppnRate: 1.1 },
  { desc: "CUSTOMS CLEARANCE CGK", amount: 300000, ppnRate: 1.1 },
  { desc: "DOCUMENT FEE", amount: 750000, ppnRate: 1.1 },
  { desc: "EDI (PIB)", amount: 150000, ppnRate: 1.1 },
  { desc: "INLAND TRUCKING", amount: 2500000, ppnRate: 1.1 },
  { desc: "STORAGE", amount: 1322640, ppnRate: 0 },
];
t("hitungan cocok dengan invoice forwarder sungguhan", () => {
  const r = w.fundLineTotals(FL_NYATA);
  eq(r.totalNilai, 23795113, "total nilai:");
  eq(r.totalPpn, 247197, "total PPN:");
  eq(r.pph, 449449, "potongan PPH 23:");
  eq(r.grandTotal, 23592861, "TOTAL:");
});
t("DPP PPH 23 dari NILAI baris, bukan dari PPN-nya", () => {
  /* Agency Fee 150.000 dengan PPN 1,1% (1.650): PPH dihitung dari
     150.000, bukan dari 1.650. */
  const r = w.fundLineTotals([{ desc: "Agency Fee", amount: 150000, ppnRate: 1.1 }]);
  eq(r.totalPpn, 1650, "PPN:");
  eq(r.dppPph, 150000, "dasar PPH:");
  eq(r.pph, 3000, "PPH 2% x 150.000:");
});
t("baris TANPA PPN tidak ikut dasar PPH 23", () => {
  const r = w.fundLineTotals([
    { amount: 1000000, ppnRate: 11 },
    { amount: 5000000, ppnRate: 0 },
  ]);
  eq(r.dppPph, 1000000, "hanya baris ber-PPN:");
  eq(r.pph, 20000);
  eq(r.totalPpn, 110000, "PPN 11%:");
});
t("tarif 1,1% dan 11% dua-duanya didukung", () => {
  eq(w.fundLinePpn({ amount: 1000000, ppnRate: 1.1 }), 11000);
  eq(w.fundLinePpn({ amount: 1000000, ppnRate: 11 }), 110000);
  eq(w.fundLinePpn({ amount: 1000000, ppnRate: 0 }), 0);
});
t("PPH 23 MEMOTONG total, bukan menambah", () => {
  /* Pajak ini dipungut pemberi kerja dan disetor atas nama penyedia
     jasa -- yang dibayarkan ke forwarder sudah dikurangi. */
  const r = w.fundLineTotals([{ amount: 1000000, ppnRate: 11 }]);
  eq(r.grandTotal, 1000000 + 110000 - 20000);
});
t("baris kosong tidak ikut tersimpan", () => {
  const bersih = w.fundLinesBersih([
    { desc: "A", amount: 100, ppnRate: 0 },
    { desc: "", amount: "", ppnRate: 0 },
    { desc: "", amount: 250, ppnRate: 11 },
  ]);
  eq(bersih.length, 2, "yang berisi uraian ATAU nilai ikut:");
});
t("surat cetak format RINCI dipakai hanya kalau ada rincian barisnya", () => {
  const rinci = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", invoiceNo: "AI2601935", lines: FL_NYATA,
  }));
  if (!rinci.includes("POTONGAN PPH 23")) throw new Error("potongan PPH tidak tercetak");
  if (!rinci.includes("rincian--detail")) throw new Error("tabel rinci tidak dipakai");
  /* Format LAMA harus tetap utuh untuk Billing -- pengajuan yang sudah
     terbit sebelum fitur ini ada tidak boleh berubah tampilannya. */
  const lama = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Billing", billingNo: "640260", feeBm: "0", feePpn: "100", feePph: "0",
  }));
  if (lama.includes("POTONGAN PPH 23")) throw new Error("format Billing ikut berubah");
  if (!lama.includes("Bea Masuk")) throw new Error("format lama rusak");
});
t("Terbilang mengikuti TOTAL sesudah potongan", () => {
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", lines: [{ desc: "X", amount: 1000000, ppnRate: 11 }],
  }));
  // 1.000.000 + 110.000 - 20.000 = 1.090.000
  if (!h.includes("Satu Juta Sembilan Puluh Ribu Rupiah"))
    throw new Error("Terbilang tidak memakai total sesudah potongan");
});

console.log("\u2014 PENGAJUAN DANA: BAWAAN & ISIAN BERSYARAT \u2014");
t("mereset form mengembalikan nilai BAWAAN, bukan mengosongkannya", () => {
  /* Lampiran "1 Set", jabatan Accounting/CFO/President Director, dan
     nama penanda tangan punya bawaan di HTML. Mengosongkannya membuat
     pengguna harus mengetik ulang tiap kali menerbitkan nomor. */
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  if (!panel) throw new Error("panel fund tidak ditemukan");
  const berbawaan = [...panel.querySelectorAll("[data-dn]")].filter(
    (el) => el.tagName !== "SELECT" && el.defaultValue,
  );
  if (!berbawaan.length) throw new Error("prasyarat gagal: tidak ada isian berbawaan");
  berbawaan.forEach((el) => { el.value = "DIUBAH"; });
  w.resetDocNumForm("fund");
  berbawaan.forEach((el) => {
    eq(el.value, el.defaultValue, "data-dn=" + el.dataset.dn + ":");
  });
});
t("pilihan Jenis Pengeluaran: Billing, Freight, Storage, Lainnya", () => {
  const sel = w.document.querySelector('[data-docnum-panel="fund"] [data-dn="expenseType"]');
  const nilai = [...sel.options].map((o) => o.value).filter(Boolean);
  eq(nilai.join(","), "Billing,Freight,Storage,Lainnya");
});
t("Billing menampilkan Nomor Billing; pilihan lain menampilkan Nomor Invoice", () => {
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  const sel = panel.querySelector('[data-dn="expenseType"]');
  const kotak = (dn) => panel.querySelector(`[data-dn="${dn}"]`).closest("[data-dn-when]");
  try {
    sel.value = "Billing";
    w.syncDocNumConditional(panel);
    if (kotak("billingNo").classList.contains("d-none"))
      throw new Error("Nomor Billing tersembunyi saat jenis Billing");
    if (!kotak("invoiceNo").classList.contains("d-none"))
      throw new Error("Nomor Invoice ikut tampil saat jenis Billing");

    sel.value = "Freight";
    w.syncDocNumConditional(panel);
    if (!kotak("billingNo").classList.contains("d-none"))
      throw new Error("Nomor Billing masih tampil untuk jenis selain Billing");
    if (kotak("invoiceNo").classList.contains("d-none"))
      throw new Error("Nomor Invoice tidak tampil untuk jenis selain Billing");
  } finally {
    sel.value = "";
    w.syncDocNumConditional(panel);
  }
});
t("isian yang tersembunyi TIDAK ikut tersimpan", () => {
  /* Kalau ikut, surat cetaknya bisa memuat nomor billing DAN nomor
     invoice sekaligus padahal cuma satu yang dimaksud. */
  const panel = w.document.querySelector('[data-docnum-panel="fund"]');
  const sel = panel.querySelector('[data-dn="expenseType"]');
  try {
    panel.querySelector('[data-dn="billingNo"]').value = "BILL-1";
    panel.querySelector('[data-dn="invoiceNo"]').value = "INV-1";
    sel.value = "Billing";
    w.syncDocNumConditional(panel);
    const isi = w.readDocNumForm("fund");
    eq(isi.billingNo, "BILL-1", "yang tampil tersimpan:");
    if (isi.invoiceNo) throw new Error("nomor invoice yang tersembunyi ikut tersimpan");
  } finally {
    panel.querySelector('[data-dn="billingNo"]').value = "";
    panel.querySelector('[data-dn="invoiceNo"]').value = "";
    sel.value = "";
    w.syncDocNumConditional(panel);
  }
});
t("surat cetak memakai Nomor Invoice kalau jenisnya bukan Billing", () => {
  const denganInvoice = w.buildFundRequestHtml(barisFundUji({ invoiceNo: "AI2601935" }));
  if (!denganInvoice.includes("Nomor Invoice : AI2601935"))
    throw new Error("Nomor Invoice tidak tercetak");
  if (denganInvoice.includes("Nomor Billing"))
    throw new Error("masih menulis Nomor Billing padahal yang ada invoice");
  const kosong = w.buildFundRequestHtml(barisFundUji({}));
  if (/Nomor (Billing|Invoice)/.test(kosong))
    throw new Error("baris rujukan muncul padahal keduanya kosong");
});

console.log("\u2014 FORM PENGAJUAN DANA: TERBILANG \u2014");
t("angka dari surat contoh terbilang persis", () => {
  eq(w.terbilangRupiah(6975012),
    "Enam Juta Sembilan Ratus Tujuh Puluh Lima Ribu Dua Belas Rupiah");
});
t('"belas" untuk 11-19, bukan "puluh"', () => {
  eq(w.terbilang(11), "sebelas");
  eq(w.terbilang(12), "dua belas");
  eq(w.terbilang(19), "sembilan belas");
  eq(w.terbilang(20), "dua puluh", "20 kembali ke pola puluh:");
});
t('"se-" untuk 100 & 1000, tapi "dua ratus"/"dua ribu" untuk kelipatannya', () => {
  eq(w.terbilang(100), "seratus");
  eq(w.terbilang(200), "dua ratus");
  eq(w.terbilang(1000), "seribu");
  eq(w.terbilang(2000), "dua ribu");
});
t('1.000.000 tetap "satu juta", bukan "sejuta" -- "se-" cuma untuk ratus & ribu', () => {
  eq(w.terbilang(1000000), "satu juta");
});
t("kelompok ribuan yang kosong tidak menyisakan kata menggantung", () => {
  // 1.000.500 -> "satu juta lima ratus", BUKAN "satu juta nol ribu lima ratus"
  eq(w.terbilang(1000500), "satu juta lima ratus");
});
t("nol & pecahan: dibulatkan ke rupiah penuh, surat tidak menyebut sen", () => {
  eq(w.terbilang(0), "nol");
  eq(w.terbilang(1500.75), "seribu lima ratus");
});

console.log("\u2014 FORM PENGAJUAN DANA: LEMBAR CETAK \u2014");
t("jarak tegak lembar cetak memakai satuan KERTAS, bukan piksel", () => {
  /* Piksel di media cetak bergantung penskalaan peramban -- mencampurnya
     dengan mm membuat tata letak bergeser tidak merata antar mesin.
     Lebar kolom, padding sel & ukuran logo tetap px: itu relatif
     terhadap ukuran huruf, bukan terhadap kertas. */
  const css = w.fundRequestCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const salah = css
    .split("\n")
    .filter((l) => /margin(-top|-bottom)?\s*:/.test(l) && /\dpx/.test(l))
    .map((l) => l.trim());
  if (salah.length)
    throw new Error("jarak tegak masih piksel: " + salah.join(" | "));
});
t("judul lembar diberi jarak lega ke kop & blok No Surat", () => {
  const css = w.fundRequestCss();
  const i = css.indexOf(".judul {");
  const blok = css.slice(i, css.indexOf("}", i));
  const m = /margin:\s*(\d+)mm\s+0\s+(\d+)mm/.exec(blok);
  if (!m) throw new Error("margin judul tidak dalam mm");
  const atas = Number(m[1]), bawah = Number(m[2]);
  if (atas < 10 || bawah < 8)
    throw new Error(`jarak judul terlalu rapat (atas ${atas}mm, bawah ${bawah}mm)`);
  /* Atasnya lebih besar: judul memisahkan kop bergaris tebal dari blok
     No Surat, jadi sisi atas butuh lebih banyak ruang. */
  if (atas <= bawah)
    throw new Error("jarak atas judul tidak lebih besar daripada bawahnya");
});
t("kop & kaki bawaan peramban tidak ikut tercetak", () => {
  /* Baris "9/11/26 ... about:blank ... 1/1" digambar peramban DI DALAM
     margin halaman -- ia lenyap sendiri begitu marginnya nol, dan
     jaraknya ke tepi kertas pindah ke padding .sheet. */
  const css = w.fundRequestCss();
  if (!/@page \{[^}]*margin:\s*0/.test(css))
    throw new Error("@page belum margin: 0 -- kop/kaki peramban akan ikut tercetak");
  if (!/\.sheet \{[^}]*padding:/.test(css))
    throw new Error("jarak ke tepi kertas hilang -- isinya akan menempel ke sisi halaman");
});
t("tidak ada teks merah di lembar cetak", () => {
  const css = w.fundRequestCss();
  const merah = css.match(/color:\s*#(c00000|cc0000|f00|ff0000)/gi);
  if (merah) throw new Error("masih ada teks merah: " + merah.join(", "));
});
t('label No Surat / Subject / Lampiran diikuti titik dua', () => {
  const h = w.buildFundRequestHtml(barisFundUji({}));
  ["No Surat", "Subject", "Lampiran"].forEach((l) => {
    if (!new RegExp(l + "</td><td class=\"meta-s\">:</td>").test(h))
      throw new Error("titik dua tidak ada setelah " + l);
  });
});
function barisFundUji(payload, over) {
  return Object.assign({
    id: "fr1",
    doc_number: "283/EXIM/DDI/IX/2026",
    doc_date: "2026-09-11",
    requester: "Yogi Firgiawan",
    payload: Object.assign({ notes: "Pembayaran Billing Import IKR Guide" }, payload),
  }, over);
}
t("No. Surat diambil dari nomor dokumennya sendiri, Subject dari Rincian", () => {
  const h = w.buildFundRequestHtml(barisFundUji({}));
  if (!h.includes("283/EXIM/DDI/IX/2026")) throw new Error("No. Surat tidak tercetak");
  if (!h.includes("Pembayaran Billing Import IKR Guide"))
    throw new Error("Subject tidak diambil dari Rincian");
});
t("rincian pungutan terisi -> tiga baris, TOTAL dijumlahkan dari situ", () => {
  const h = w.buildFundRequestHtml(barisFundUji({
    feeBm: "0", feePpn: "6975012", feePph: "0", currency: "IDR",
  }));
  ["Bea Masuk", "PPN Import", "PPH Import"].forEach((l) => {
    if (!h.includes(l)) throw new Error("baris " + l + " tidak tercetak");
  });
  if (!h.includes("Enam Juta Sembilan Ratus Tujuh Puluh Lima Ribu Dua Belas Rupiah"))
    throw new Error("Terbilang tidak cocok dengan TOTAL");
});
t("rincian pungutan KOSONG -> jatuh ke satu baris dari Jenis Pengeluaran & Nominal", () => {
  /* Pengajuan lama (dibuat sebelum tiga kolom ini ada) tetap harus
     bisa dicetak tanpa diisi ulang. */
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Biaya Kepabeanan", amount: "500000",
  }));
  if (!h.includes("Biaya Kepabeanan")) throw new Error("tidak jatuh ke Jenis Pengeluaran");
  if (h.includes("PPN Import")) throw new Error("baris rincian ikut tercetak padahal kosong");
  if (!h.includes("Lima Ratus Ribu Rupiah")) throw new Error("Terbilang tidak dari Nominal");
});
t('nilai rupiah ditulis "Rp." dan dipusatkan seperti label AMOUNT', () => {
  const h = w.buildFundRequestHtml(barisFundUji({
    feeBm: "0", feePpn: "26000000", feePph: "0", currency: "IDR",
  }));
  if (!h.includes("Rp. 26.000.000")) throw new Error('nilai tidak ditulis "Rp. 26.000.000"');
  if (/IDR\s/.test(h)) throw new Error('masih ada awalan "IDR"');
  /* Rata KANAN, bukan tengah: dengan enam kolom dan angka berdesimal,
     digit satuan harus sejajar antar baris supaya bisa dijumlah mata. */
  const css = w.fundRequestCss();
  const i = css.indexOf(".c-amt {");
  if (!/text-align:\s*right/.test(css.slice(i, css.indexOf("}", i))))
    throw new Error("kolom AMOUNT tidak rata kanan");
});
t('mata uang selain rupiah tetap memakai kodenya, bukan "Rp."', () => {
  /* "Rp." khusus IDR -- bukan awalan untuk semua mata uang. */
  const h = w.buildFundRequestHtml(barisFundUji({
    expenseType: "Freight", amount: "1200", currency: "USD",
  }));
  if (!h.includes("USD 1.200")) throw new Error("nilai USD tidak memakai kode USD");
  if (h.includes("Rp. 1.200")) throw new Error('USD ikut diberi awalan "Rp."');
});
t('nilai nol dicetak "-", bukan "Rp. 0"', () => {
  const h = w.buildFundRequestHtml(barisFundUji({
    feeBm: "0", feePpn: "100", feePph: "0",
  }));
  if (!/<td class="c-amt">-<\/td>/.test(h))
    throw new Error('nilai nol tidak dicetak sebagai "-"');
});
t("Nomor Billing jadi baris judul DI ATAS rincian, bukan di kaki tabel", () => {
  const h = w.buildFundRequestHtml(barisFundUji({
    billingNo: "640260906122452", feeBm: "0", feePpn: "100", feePph: "0",
  }));
  const iBilling = h.indexOf("Nomor Billing : 640260906122452");
  if (iBilling < 0) throw new Error("Nomor Billing tidak tercetak");
  const iBaris1 = h.indexOf("Bea Masuk");
  const iTotal = h.indexOf("TOTAL");
  if (!(iBilling < iBaris1))
    throw new Error("Nomor Billing tidak berada di atas baris rincian");
  if (!(iBaris1 < iTotal))
    throw new Error("urutan tabel rusak: TOTAL tidak di kaki");
  /* Kaki tabel hanya berisi TOTAL & nilainya -- kalau Nomor Billing
     ikut ke sana, barisnya jadi padat dan beda dari surat aslinya. */
  const kaki = h.slice(h.indexOf("<tfoot>"));
  if (kaki.includes("Nomor Billing"))
    throw new Error("Nomor Billing masih ikut di kaki tabel");
  const tanpaBilling = w.buildFundRequestHtml(barisFundUji({}));
  if (tanpaBilling.includes("Nomor Billing"))
    throw new Error("baris Nomor Billing tetap muncul padahal kosong");
});
t("nama & jabatan penanda tangan bisa diubah, dengan bawaan kalau dikosongkan", () => {
  const bawaan = w.buildFundRequestHtml(barisFundUji({}));
  ["Drafter", "Accounting", "M. Rangga", "Mr. Shin Nara", "Chief Marketing Officer"]
    .forEach((j) => {
      if (!bawaan.includes(j)) throw new Error("bawaan " + j + " tidak tercetak");
    });
  /* TIGA kotak, bukan empat: President Director sudah tidak ada di
     jalur persetujuannya. Pengajuan LAMA yang terlanjur menyimpan
     approver2Name pun tidak boleh memunculkannya kembali -- kotak yang
     tidak akan ditandatangani siapa pun lebih menyesatkan daripada
     tidak ada. */
  eq((bawaan.match(/ttd-cell/g) || []).length, 3, "jumlah kotak tanda tangan:");
  const lama = w.buildFundRequestHtml(barisFundUji({
    approver2Name: "Mr Jeon Jeongho", approver2Role: "President Director",
  }));
  if (lama.includes("Mr Jeon Jeongho") || lama.includes("President Director"))
    throw new Error("kotak Approved By 2 dari data lama masih tercetak");

  const diubah = w.buildFundRequestHtml(barisFundUji({
    approver1Name: "Mr Kim Taewan", approver1Role: "Finance Director",
  }));
  if (!diubah.includes("Finance Director"))
    throw new Error("jabatan yang diisi manual tidak dipakai");
  if (diubah.includes("Chief Marketing Officer"))
    throw new Error("jabatan bawaan masih menimpa isian manual");
  if (!diubah.includes("Mr Kim Taewan"))
    throw new Error("nama yang diisi manual tidak tercetak");
});
t("tanggal surat ditulis bentuk panjang Indonesia", () => {
  const h = w.buildFundRequestHtml(barisFundUji({}));
  if (!h.includes("Cirebon, 11 September 2026"))
    throw new Error("tempat & tanggal tidak sesuai bentuk suratnya");
});

console.log("\u2014 TOMBOL KEMBALI KE ATAS \u2014");
t("tersembunyi saat di puncak halaman, muncul sesudah melewati ambang", () => {
  const tbl = $("#btnScrollTop");
  const simpan = Object.getOwnPropertyDescriptor(w, "scrollY");
  try {
    Object.defineProperty(w, "scrollY", { value: 0, configurable: true });
    w.eval("segarkanTombolAtas()");
    eq(tbl.classList.contains("is-visible"), false, "di puncak halaman:");

    Object.defineProperty(w, "scrollY", { value: 500, configurable: true });
    w.eval("segarkanTombolAtas()");
    eq(tbl.classList.contains("is-visible"), true, "sesudah digulir 500px:");
  } finally {
    if (simpan) Object.defineProperty(w, "scrollY", simpan);
    w.eval("segarkanTombolAtas()");
  }
});
t("klik memanggil scrollTo ke puncak (top: 0)", () => {
  const asli = w.scrollTo;
  let dipanggilDengan = null;
  w.scrollTo = (opsi) => { dipanggilDengan = opsi; };
  try {
    $("#btnScrollTop").click();
    if (!dipanggilDengan || dipanggilDengan.top !== 0)
      throw new Error("scrollTo tidak dipanggil dengan top: 0 -- dapat: " + JSON.stringify(dipanggilDengan));
  } finally {
    w.scrollTo = asli;
  }
});
t("cuma ikon, tanpa teks (permintaan eksplisit)", () => {
  const tbl = $("#btnScrollTop");
  if (tbl.textContent.trim())
    throw new Error("tombol masih punya teks: " + JSON.stringify(tbl.textContent.trim()));
  if (!tbl.querySelector("i.bi"))
    throw new Error("tidak ada ikon bi- di dalam tombol");
});
t("duduk langsung di sudut kanan-bawah -- tidak lagi diangkat memberi ruang tombol keluar yang sudah dihapus", () => {
  /* Tombol keluar mengambang (.fab-logout) sudah PINDAH ke menu akun di
     bilah atas, jadi .fab-top kini satu-satunya tombol mengambang.
     Kalau jarak angkatnya (dulu +52px+10px) ditinggalkan, tombolnya
     akan terlihat menggantung di tengah tanpa sebab. */
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  const iTop = css.indexOf(".fab-top {");
  if (iTop < 0) throw new Error(".fab-top tidak ditemukan");
  const blokTop = css.slice(iTop, css.indexOf("}", iTop));
  if (!/bottom:\s*var\(--sp-5\)/.test(blokTop))
    throw new Error("posisi bawah .fab-top belum rapat ke sudut (masih menyisakan ruang untuk tombol yang sudah tidak ada)");
  if (/\.fab-logout\s*\{/.test(css))
    throw new Error("aturan .fab-logout masih ada padahal tombolnya sudah dihapus dari HTML");
});
t("tombol keluar sekarang ada di menu akun, bukan mengambang di sudut layar", () => {
  if ($("#btnLogout")) throw new Error("tombol keluar mengambang (#btnLogout) masih ada di DOM");
  const menu = $("#userMenu");
  if (!menu) throw new Error("#userMenu tidak ditemukan");
  if (!menu.querySelector("#btnLogoutMenu"))
    throw new Error("tombol Keluar tidak ada di dalam menu akun");
});
t("menu akun tertutup saat halaman dimuat, terbuka ketika chip diklik", () => {
  const menu = $("#userMenu");
  const chip = $("#userChip");
  try {
    w.tutupUserMenu();
    if (!menu.classList.contains("d-none")) throw new Error("menu seharusnya tertutup di awal");
    chip.click();
    if (menu.classList.contains("d-none")) throw new Error("menu tidak terbuka setelah chip diklik");
    if (!chip.classList.contains("is-open")) throw new Error("chip tidak menandai dirinya terbuka");
  } finally {
    w.tutupUserMenu();
  }
});
t("klik chip lagi menutup menu (sakelar), dan klik di luar juga menutup", () => {
  const menu = $("#userMenu");
  const chip = $("#userChip");
  try {
    chip.click();
    chip.click();
    if (!menu.classList.contains("d-none")) throw new Error("klik kedua tidak menutup menu");
    chip.click();
    $("body").click();
    if (!menu.classList.contains("d-none")) throw new Error("klik di luar tidak menutup menu");
  } finally {
    w.tutupUserMenu();
  }
});
t("toast diposisikan dari BILAH ATAS saja, bukan ikut bilah kendali (posisi seragam antar halaman)", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "ui", "feedback.js"), "utf8");
  const i = src.indexOf("function posisikanToast");
  const blok = src.slice(i, src.indexOf("\n}", i));
  if (/controlbar/.test(blok))
    throw new Error("posisikanToast masih ikut mengukur .controlbar -- posisinya akan beda-beda antar halaman");
  if (/addEventListener\("scroll", posisikanToast/.test(src))
    throw new Error("pendengar scroll masih terpasang -- toast akan bergeser-geser saat digulir");
});

console.log("\u2014 KALENDER RENTANG TANGGAL: KOTAK-KOTAK BULAN \u2014");
t("Juni 2026 (mulai Senin, 30 hari): tanpa pengisi awal, 5 baris, 5 pengisi akhir", () => {
  const sel = w.drpBuildMonthCells(2026, 5); // JS: bulan 0-based, 5 = Juni
  eq(sel.length, 35, "total kotak (5 baris x 7):");
  eq(sel[0].iso, "2026-06-01", "kotak pertama:");
  eq(sel[0].diLuarBulan, false, "1 Juni bukan pengisi:");
  eq(sel[29].iso, "2026-06-30", "kotak ke-30:");
  eq(sel[30].iso, "2026-07-01", "kotak ke-31 (pengisi):");
  eq(sel[30].diLuarBulan, true, "1 Juli ditandai pengisi:");
  eq(sel[34].iso, "2026-07-05", "kotak terakhir:");
});
t("bulan yang TIDAK mulai hari Senin punya pengisi di depan", () => {
  // Juli 2026 mulai hari Rabu -> 2 pengisi (Senin-Selasa dari Juni) di depan
  const sel = w.drpBuildMonthCells(2026, 6);
  eq(sel[0].iso, "2026-06-29", "pengisi pertama:");
  eq(sel[0].diLuarBulan, true);
  eq(sel[1].iso, "2026-06-30");
  eq(sel[2].iso, "2026-07-01", "1 Juli baru di kotak ke-3:");
  eq(sel[2].diLuarBulan, false);
});

console.log("\u2014 KALENDER RENTANG TANGGAL: MEMILIH & MENERAPKAN \u2014");
t("panel TETAP TERBUKA sesudah mengklik satu tanggal (bug: dulu langsung menutup)", () => {
  /* Akar masalahnya: drpHandleDayClick() memanggil drpRenderCalendars(),
     yang mengganti innerHTML grid -- termasuk MENGHANCURKAN tombol
     yang baru diklik. Kalau klik itu lanjut menggelembung ke document,
     listener "klik di luar menutup panel" memeriksa
     wrap.contains(e.target); karena elemennya sudah lepas dari
     dokumen, pemeriksaan itu selalu salah dan panelnya ikut menutup.
     Diperbaiki dengan stopPropagation() di listener klik tanggalnya. */
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $(`[data-drp-day="2026-06-05"]`).click();
    if ($("#dateRangePopover").classList.contains("d-none"))
      throw new Error("panel menutup sendiri sesudah klik tanggal PERTAMA");
    $(`[data-drp-day="2026-06-20"]`).click();
    if ($("#dateRangePopover").classList.contains("d-none"))
      throw new Error("panel menutup sendiri sesudah klik tanggal KEDUA");
  });
});
t("navigasi bulan (‹ ›) juga TIDAK menutup panel", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $("#drpNavNext").click();
    if ($("#dateRangePopover").classList.contains("d-none"))
      throw new Error("panel menutup sendiri sesudah navigasi bulan berikutnya");
    $("#drpNavPrev").click();
    if ($("#dateRangePopover").classList.contains("d-none"))
      throw new Error("panel menutup sendiri sesudah navigasi bulan sebelumnya");
  });
});
function pakaiKalender(jalankan) {
  const simpan = { dari: $("#filterDateFrom").value, sampai: $("#filterDateTo").value };
  try {
    jalankan();
  } finally {
    $("#dateRangePopover").classList.add("d-none");
    $("#filterDateFrom").value = simpan.dari;
    $("#filterDateTo").value = simpan.sampai;
    $("#filterDateFrom").dispatchEvent(new w.Event("change"));
  }
}
t("klik satu tanggal, buka lagi lalu Terapkan -> dari = sampai = tanggal itu", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $(`[data-drp-day="2026-06-15"]`).click();
    $("#drpApply").click();
    eq($("#filterDateFrom").value, "2026-06-15");
    eq($("#filterDateTo").value, "2026-06-15");
  });
});
t("klik dua tanggal berurutan -> rentang dari yang lebih awal ke yang lebih akhir", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $(`[data-drp-day="2026-06-05"]`).click();
    $(`[data-drp-day="2026-06-20"]`).click();
    $("#drpApply").click();
    eq($("#filterDateFrom").value, "2026-06-05");
    eq($("#filterDateTo").value, "2026-06-20");
  });
});
t("klik tanggal LEBIH AWAL dari yang sudah dipilih -> keduanya tetap terurut benar", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $(`[data-drp-day="2026-06-20"]`).click();
    $(`[data-drp-day="2026-06-05"]`).click(); // diklik lebih dulu tanggalnya, bukan urutan klik
    $("#drpApply").click();
    eq($("#filterDateFrom").value, "2026-06-05", "tetap jadi awal:");
    eq($("#filterDateTo").value, "2026-06-20", "tetap jadi akhir:");
  });
});
t("klik ketiga sesudah pasangan lengkap MULAI LAGI dari nol, bukan menambah titik ketiga", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $(`[data-drp-day="2026-06-05"]`).click();
    $(`[data-drp-day="2026-06-20"]`).click();
    $(`[data-drp-day="2026-06-10"]`).click(); // klik ketiga
    $("#drpApply").click();
    eq($("#filterDateFrom").value, "2026-06-10", "mulai baru dari klik ketiga:");
    eq($("#filterDateTo").value, "2026-06-10", "belum ada akhir lagi:");
  });
});
t("Reset mengosongkan #filterDateFrom/To & menutup panel", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-30";
    $("#dateRangeTrigger").click();
    $("#drpReset").click();
    eq($("#filterDateFrom").value, "");
    eq($("#filterDateTo").value, "");
    if (!$("#dateRangePopover").classList.contains("d-none"))
      throw new Error("panel tidak ikut tertutup setelah Reset");
  });
});
t("membuka panel MEMUAT ulang dari #filterDateFrom/To yang sedang aktif, bukan bekas sesi sebelumnya", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-08";
    $("#filterDateTo").value = "2026-06-08";
    $("#filterDateFrom").dispatchEvent(new w.Event("change"));
    $("#dateRangeTrigger").click();
    if (!$('[data-drp-day="2026-06-08"]').classList.contains("drp-day--endpoint"))
      throw new Error("tanggal yang sudah aktif tidak tersorot saat panel dibuka");
  });
});
t("tombol pemicu menampilkan rentang aktif, termasuk saat diubah dari LUAR kalender (tombol Hari Ini)", () => {
  pakaiKalender(() => {
    $("#btnQuickToday").click();
    const teks = $("#dateRangeTriggerText").textContent;
    if (teks === "Pilih Rentang Tanggal")
      throw new Error("teks pemicu tidak ikut menyegarkan setelah tombol Hari Ini");
  });
});
t('tombol Hari Ini menyala aktif kalau rentang yang aktif persis "hari ini"', () => {
  pakaiKalender(() => {
    $("#btnQuickToday").click();
    if (!$("#btnQuickToday").classList.contains("is-active"))
      throw new Error("tombol Hari Ini tidak menyala setelah diklik sendiri");
    if ($("#btnQuickWeek").classList.contains("is-active"))
      throw new Error("tombol Minggu Ini ikut menyala, seharusnya tidak");
  });
});
t("tombol cepat mati semua kalau rentangnya tidak cocok satu pun (dipilih manual lewat kalender)", () => {
  pakaiKalender(() => {
    $("#filterDateFrom").value = "2026-06-01";
    $("#filterDateTo").value = "2026-06-01";
    $("#dateRangeTrigger").click();
    $(`[data-drp-day="2026-06-05"]`).click();
    $(`[data-drp-day="2026-06-20"]`).click();
    $("#drpApply").click();
    ["btnQuickToday", "btnQuickWeek", "btnQuickNextWeek"].forEach((id) => {
      if ($("#" + id).classList.contains("is-active"))
        throw new Error(id + " menyala padahal rentangnya dipilih manual, bukan salah satu preset");
    });
  });
});


function saringRentang(jadwalList, basis, dari, sampai, statusFilter) {
  const mode = baca("activeMode");
  const simpanData = baca("data")[mode];
  const el = {
    basis: $("#filterDateBasis"), dari: $("#filterDateFrom"),
    sampai: $("#filterDateTo"), status: $("#filterStatus"), q: $("#searchInput"),
  };
  const simpanEl = {
    basis: el.basis.value, dari: el.dari.value, sampai: el.sampai.value,
    status: el.status.value, q: el.q.value,
  };
  w.eval("data." + mode + " = " + JSON.stringify(jadwalList));
  el.basis.value = basis;
  el.dari.value = dari || "";
  el.sampai.value = sampai || "";
  el.status.value = statusFilter != null ? statusFilter : "";
  el.q.value = "";
  try {
    return w.getFiltered().map((s) => s.id).join(",");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpanData));
    el.basis.value = simpanEl.basis; el.dari.value = simpanEl.dari;
    el.sampai.value = simpanEl.sampai; el.status.value = simpanEl.status;
    el.q.value = simpanEl.q;
  }
}
t("basis ETA: hanya yang effectiveEta-nya masuk rentang", () => {
  const list = [
    { id: "e1", status: "process", eta: "2026-08-05", items: [] },
    { id: "e2", status: "process", eta: "2026-08-15", items: [] },
    { id: "e3", status: "process", eta: "2026-08-25", items: [] },
  ];
  eq(saringRentang(list, "eta", "2026-08-10", "2026-08-20"), "e2");
});
t("basis ETA memakai etaUpdate kalau ada (ETA efektif), bukan ETA rencana", () => {
  const list = [{ id: "e4", status: "process", eta: "2026-08-01",
    etaUpdate: "2026-08-15", items: [] }];
  eq(saringRentang(list, "eta", "2026-08-10", "2026-08-20"), "e4",
    "harusnya lolos karena etaUpdate masuk rentang, walau eta rencana tidak:");
  eq(saringRentang(list, "eta", "2026-07-25", "2026-08-05"), "",
    "harusnya gugur di rentang yg cuma cocok utk eta rencana yg sudah digantikan:");
});
t("basis ETD: menyaring kolom yang berbeda dari ETA", () => {
  const list = [
    { id: "d1", status: "process", eta: "2026-08-15", etd: "2026-08-01", items: [] },
  ];
  eq(saringRentang(list, "etd", "2026-08-10", "2026-08-20"), "",
    "ETD-nya di luar rentang walau ETA-nya di dalam:");
  eq(saringRentang(list, "eta", "2026-08-10", "2026-08-20"), "d1",
    "basis ETA utk data yg sama justru lolos:");
});
t('basis "actual": Estimasi Delivery (Import) / Stuffing (Export), field yang sama', () => {
  const list = [{ id: "a1", status: "process", actual: "2026-08-16", items: [] }];
  eq(saringRentang(list, "actual", "2026-08-10", "2026-08-20"), "a1");
  eq(saringRentang(list, "actual", "2026-08-17", "2026-08-20"), "");
});
t("tanggal basis kosong -> gugur SELAMA rentang sedang dipakai", () => {
  const list = [{ id: "k1", status: "process", items: [] }]; // tanpa eta sama sekali
  eq(saringRentang(list, "eta", "2026-08-01", "2026-08-31"), "");
  eq(saringRentang(list, "eta", "", ""), "k1", "rentang kosong -> tidak ikut menyaring:");
});
t("cuma dari ATAU cuma sampai tetap berfungsi (rentang terbuka sebelah)", () => {
  const list = [
    { id: "o1", status: "process", eta: "2026-08-05", items: [] },
    { id: "o2", status: "process", eta: "2026-08-25", items: [] },
  ];
  eq(saringRentang(list, "eta", "2026-08-10", ""), "o2", "cuma batas bawah:");
  eq(saringRentang(list, "eta", "", "2026-08-10"), "o1", "cuma batas atas:");
});
t("gabung dengan saringan status: keduanya harus cocok", () => {
  const list = [
    { id: "g1", status: "process", eta: "2026-08-15", items: [] },
    { id: "g2", status: "arrived", eta: "2026-08-15", items: [] },
  ];
  eq(saringRentang(list, "eta", "2026-08-10", "2026-08-20", "process"), "g1");
});
t('label opsi "actual" ikut mode: Estimated Delivery (Import) / Stuffing (Export)', () => {
  const opt = () => $('#filterDateBasis option[value="actual"]').textContent;
  const modeAwal = baca("activeMode");
  try {
    w.switchMode("import");
    eq(opt(), baca("MODE_LABELS").import.actual, "Import:");
    w.switchMode("export");
    eq(opt(), baca("MODE_LABELS").export.actual, "Export:");
  } finally {
    w.switchMode(modeAwal);
  }
});
t("pindah buku mengosongkan rentang tanggal (beda buku, beda konteks)", () => {
  const modeAwal = baca("activeMode");
  $("#filterDateBasis").value = "etd";
  $("#filterDateFrom").value = "2026-08-01";
  $("#filterDateTo").value = "2026-08-31";
  try {
    w.switchMode(modeAwal === "import" ? "export" : "import");
    eq($("#filterDateBasis").value, "actual", "basis kembali ke bawaan:");
    eq($("#filterDateFrom").value, "", "dari:");
    eq($("#filterDateTo").value, "", "sampai:");
  } finally {
    w.switchMode(modeAwal);
  }
});
t("Reset Filter ikut mengosongkan rentang tanggal", () => {
  $("#filterDateBasis").value = "etd";
  $("#filterDateFrom").value = "2026-08-01";
  $("#filterDateTo").value = "2026-08-31";
  w.resetAllFilters();
  eq($("#filterDateBasis").value, "actual");
  eq($("#filterDateFrom").value, "");
  eq($("#filterDateTo").value, "");
});
t("tombol hapus rentang tampil hanya saat rentang terisi", () => {
  const tbl = $("#btnClearDateRange");
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  w.applyDateRangeClearVisibility();
  eq(tbl.classList.contains("d-none"), true, "kosong -> tersembunyi:");
  $("#filterDateFrom").value = "2026-08-01";
  w.applyDateRangeClearVisibility();
  eq(tbl.classList.contains("d-none"), false, "terisi -> tampil:");
  $("#btnClearDateRange").click();
  eq($("#filterDateFrom").value, "", "setelah diklik, dari:");
  eq(tbl.classList.contains("d-none"), true, "setelah diklik, tombol sembunyi lagi:");
});
t('catatan "disaring: ..." menyebut basis & tanggalnya', () => {
  $("#filterDateBasis").value = "eta";
  $("#filterDateFrom").value = "2026-08-01";
  $("#filterDateTo").value = "2026-08-31";
  try {
    const bits = w.activeFilterSummary();
    if (!bits.some((b) => b.includes("ETA") && b.includes("01-08-2026") && b.includes("31-08-2026")))
      throw new Error('catatan saringan tidak menyebut rentang ETA yang aktif: ' + JSON.stringify(bits));
  } finally {
    w.resetAllFilters();
  }
});

console.log("\u2014 VIEWER: HANYA IKON MATA, TANPA COPY TEMPLATE \u2014");
t("body.is-viewer menyembunyikan dropdown copy-template, bukan cuma edit/hapus", () => {
  /* auth.css tidak dimuat di harness ini (lihat SKB/status-select di
     atas untuk kasus serupa) -- dicek dari teks sumbernya, sama seperti
     pengujian lain di file ini yang membaca berkas .css/.js langsung. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  const blok = /body\.is-viewer[\s\S]*?display:\s*none\s*!important;\s*\}/.exec(src);
  if (!blok) throw new Error("blok penyembunyi is-viewer tidak ditemukan di auth.css");
  if (!/body\.is-viewer \.copy-template-dropdown/.test(blok[0]))
    throw new Error("dropdown copy-template belum ikut disembunyikan untuk viewer");
  // Ikon mata TIDAK boleh ikut ke daftar ini -- itu satu-satunya yang harus tersisa.
  if (/body\.is-viewer \[data-action="viewDetail"\]/.test(blok[0]))
    throw new Error("ikon Lihat Detail seharusnya tetap tampil untuk viewer");
});
t('copyTemplate tetap di allowlist baca-saja card-events.js (bukan soal keamanan, cuma disembunyikan lewat CSS)', () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "features", "card-events.js"), "utf8");
  if (!/hanyaBaca\s*=\s*\[[^\]]*"copyTemplate"/.test(src))
    throw new Error('copyTemplate tidak lagi di allowlist hanyaBaca -- lihat komentar "KERAPIAN TAMPILAN, bukan pengamanan" di auth.css');
});

console.log("\u2014 PANEL DETAIL DIPERLEBAR \u2014");
t("lebar panel .sheet dinaikkan dari 760px", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "panel.css"), "utf8");
  const m = /\.sheet\s*\{[\s\S]*?width:\s*min\((\d+)px/.exec(src);
  if (!m) throw new Error("deklarasi lebar .sheet tidak ditemukan");
  const px = Number(m[1]);
  if (!(px > 760)) throw new Error("lebar .sheet belum bertambah dari 760px, dapat " + px);
});
t("rincian kartu ditata 4 kolom TETAP, supaya jatuh dua baris & sejajar kolom nama barang", () => {
  /* Dengan auto-fit, kedelapan rincian muat sebaris di layar lebar dan
     blok kirinya jadi setinggi satu baris saja -- kolom nama barang di
     sebelahnya lalu menggantung sendirian. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "card.css"), "utf8");
  if (!/\.info-grid \{[\s\S]{0,400}?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/.test(src))
    throw new Error(".info-grid tidak lagi 4 kolom tetap");
  if (!/\.ship-body-split \{[\s\S]{0,300}?display: flex/.test(src))
    throw new Error(".ship-body-split bukan flex -- rincian & nama barang tidak akan berdampingan");
});

console.log("\u2014 TOOLBAR: PILIHAN \"ESTIMATED DELIVERY\" TIDAK TERPOTONG \u2014");
t("select .control-select (dipakai basis tanggal & status) tidak dibatasi max-width sempit", () => {
  /* Basis ETA/ETD/Estimasi Delivery sekarang .control-select biasa,
     sama dengan saringan status -- bukan lagi .date-range-basis
     sendiri yang pernah dibatasi max-width: 132px dan memotong teks
     "Estimated Delivery" jadi "Estimated Deliv" di layar. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "dashboard.css"), "utf8");
  const m = /\n\.control-select\s*\{[\s\S]*?\n\}/.exec(src);
  if (!m) throw new Error(".control-select tidak ditemukan di dashboard.css");
  if (/max-width\s*:\s*\d/.test(m[0]))
    throw new Error(".control-select dibatasi max-width -- opsi panjang seperti \"Estimated Delivery\" bisa terpotong lagi");
});

console.log("\u2014 CIF/FOB RUPIAH PER BARIS PADA TEMPLATE ALL IMPORT (BUKAN TOTAL PENGIRIMAN) \u2014");
/* Diverifikasi langsung ke berkas IMPORT_FORMAT.xlsx sungguhan yang
   dikirim Yogi: 31 kolom pas (NO s.d. REMARK), dan TIDAK ada kolom
   "FOB" (USD) tersendiri -- cuma CIF, FOB RUPIAH, CIF RUPIAH. Sempat
   ditambah kolom FOB baru di ujung sebelum ini dicek ulang ke berkas
   asli, lalu dilepas lagi -- makanya diuji eksplisit di sini supaya
   tidak diam-diam ditambahkan lagi tanpa disadari.

   Kolom CIF sendiri diisi nilai USD barangnya APA PUN Terms-nya --
   dikonfirmasi ulang: karena tidak ada kolom "FOB" (USD) lain di
   berkas asli, nilai FOB (saat Terms=FOB) tetap masuk ke kolom CIF
   ini, BUKAN dikosongkan. Yang bergantung pada Terms cuma dua kolom
   Rupiah-nya (cuma satu yang berlaku, sesuai dasar kepabeanannya). */
function jadwalUjiCifFob(over) {
  return Object.assign({
    mode: "import", incoterm: "CIF", ndpbm: 15000, freight: 100, insurance: 50,
    items: [
      { namaBarang: "BARANG A", qty: 10, harga: 20 }, // Amount 200
      { namaBarang: "BARANG B", qty: 5, harga: 60 },  // Amount 300
    ],
  }, over);
}
t('Terms CIF: kolom CIF = Amount BARIS ITU, bukan total pengiriman', () => {
  const s = jadwalUjiCifFob();
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][15], "200", "baris 1, CIF (kolom 15):");
  eq(rows[1][15], "300", "baris 2, CIF (kolom 15) -- BEDA dari baris 1:");
});
t('Terms CIF: CIF Rupiah = CIF baris \u00d7 NDPBM, per baris', () => {
  const s = jadwalUjiCifFob();
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][17], "3,000,000", "baris 1 (200\u00d715000):");
  eq(rows[1][17], "4,500,000", "baris 2 (300\u00d715000):");
});
t('Terms CIF: FOB Rupiah = 0 di semua baris', () => {
  const s = jadwalUjiCifFob();
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][16], "", "FOB Rupiah baris 1 (0 -> kosong pada clipboardFormatter):");
  eq(rows[1][16], "");
});
t('Terms FOB: kolom CIF tetap = Amount baris (BUKAN dikosongkan) -- tidak ada kolom USD lain untuk menampungnya', () => {
  const s = jadwalUjiCifFob({ incoterm: "FOB" });
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][10], "200", "AMOUNT baris 1:");
  eq(rows[0][15], "200", "CIF baris 1 -- sama dengan AMOUNT, tetap terisi:");
  eq(rows[1][15], "300", "CIF baris 2:");
});
t('Terms FOB: CIF Rupiah = 0 di semua baris (dasar kepabeanannya FOB, bukan CIF)', () => {
  const s = jadwalUjiCifFob({ incoterm: "FOB" });
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][17], "", "CIF Rupiah baris 1 (0 -> kosong):");
  eq(rows[1][17], "");
});
t('Terms FOB: FOB Rupiah = Amount baris \u00d7 NDPBM, per baris', () => {
  const s = jadwalUjiCifFob({ incoterm: "FOB" });
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][16], "3,000,000", "baris 1 (200\u00d715000):");
  eq(rows[1][16], "4,500,000", "baris 2 (300\u00d715000):");
});
t('Terms "fob" huruf kecil / berspasi tetap terdeteksi sebagai FOB', () => {
  const s = jadwalUjiCifFob({ incoterm: " fob " });
  const rows = w.buildExcelCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][16], "3,000,000", "FOB Rupiah tetap terhitung walau incoterm ' fob ':");
});

console.log("\u2014 31 KOLOM ALL IMPORT TETAP SEJAJAR DENGAN IMPORT_FORMAT.xlsx \u2014");
t("IMPORT_BULK_HEADERS persis 31 kolom, NO s.d. REMARK, TANPA kolom FOB tersendiri", () => {
  const headers = baca("IMPORT_BULK_HEADERS");
  eq(headers.length, 31);
  eq(headers[0], "NO");
  eq(headers[30], "REMARK");
  eq(headers.includes("FOB"), false, 'tidak ada header "FOB" berdiri sendiri:');
  eq(headers.includes("FOB RUPIAH"), true);
  eq(headers.includes("CIF RUPIAH"), true);
});
t("IMPORT_BULK_HEADERS.length sama persis dengan panjang baris yang dihasilkan", () => {
  const s = jadwalUjiCifFob();
  const baris = w.buildBulkRowsForShipment(s, 1, "import", baca("clipboardFormatter"));
  eq(baris[0].length, baca("IMPORT_BULK_HEADERS").length);
});
t("IMPORT_IDX.REMARK = 30, posisi yang SUNGGUHAN di IMPORT_FORMAT.xlsx", () => {
  const s = jadwalUjiCifFob({ notes: "CATATAN KHUSUS" });
  const baris = w.buildBulkRowsForShipment(s, 1, "import", baca("clipboardFormatter"));
  const idx = baca("IMPORT_IDX");
  eq(idx.REMARK, 30);
  eq(baris[0][idx.REMARK], "CATATAN KHUSUS");
  eq(baca("IMPORT_BULK_HEADERS")[idx.REMARK], "REMARK");
});
t("kolom-kolom lain tetap di posisi yang sama seperti IMPORT_FORMAT.xlsx", () => {
  const idx = baca("IMPORT_IDX");
  eq(idx.NO, 0); eq(idx.FACTORY, 1); eq(idx.QTY, 9); eq(idx.AMOUNT, 11);
  eq(idx.TARIF, 19); eq(idx.BM, 20); eq(idx.PPN, 21); eq(idx.PPH, 22);
  eq(idx.VESSEL, 28); eq(idx.PACKAGE, 29);
});

console.log("\u2014 KOLOM NO DI TEMPLATE SALIN \u2014");
/* Sel kosong yang ditempel ke Excel TETAP menimpa isi sel tujuan, jadi
   kolom NO yang selalu kosong menghapus penomoran dokumen yang sudah
   ada di sheet. Dibuang dari hasil salin — TAPI TIDAK dari pembangun
   barisnya, karena Bulk Excel mengisi kolom itu dengan nomor sungguhan
   dan Bulk Import membacanya balik lewat IMPORT_IDX.NO = 0. */
function jadwalUji() {
  return {
    factoryDate: "2026-08-20", ndpbm: 16000,
    docNo: "SPPB-1", docDate: "2026-08-01", noAju: "AJU-9", party: "PT UJI",
    invoice: "INV-1", vessel: "KAPAL UJI", masterBL: "MBL1", houseBL: "HBL1",
    incoterm: "FOB", status: "Process", destination: "TPP", origin: "TXG",
    etd: "2026-08-01", eta: "2026-08-10", actual: "2026-08-12", notes: "",
    items: [{ namaBarang: "BARANG A", hsCode: "6406", qty: 2, satuan: "PCE",
              harga: 10, netto: 1, bruto: 2, skb: [] }],
  };
}
function selPertama(teks) {
  return teks.split("\n")[0].split("\t")[0];
}
t("hasil salin dimulai dari kolom DATA, bukan sel kosong", () => {
  const s = jadwalUji();
  const f = baca("clipboardFormatter");
  /* All Import: kolom pertama setelah NO adalah IN FACTORY. Diperiksa
     ISINYA, bukan sekadar "tidak kosong" — sel kosong juga muncul
     kalau datanya yang kebetulan kosong, dan itu akan membuat uji ini
     lulus/gagal karena alasan yang salah. */
  eq(selPertama(w.buildAllImportCopyText(s)), f.date("2026-08-20"), "All Import:");
  // All Export: kolom pertama setelah NO adalah PENGIRIMAN DARI PABRIK.
  eq(selPertama(w.buildAllExportCopyText(s)), f.date(s.actual), "All Export:");
});
t("Daily Import & Daily Export juga tanpa kolom NO", () => {
  const s = jadwalUji();
  [["DailyImport", w.buildDailyImportCopyRows],
   ["DailyExport", w.buildDailyExportCopyRows]].forEach(([nama, builder]) => {
    const penuh = builder(s, baca("clipboardFormatter"));
    const dipotong = w.tanpaKolomNo(penuh);
    eq(dipotong[0].length, penuh[0].length - 1, nama + " jumlah kolom:");
    eq(dipotong[0][0], penuh[0][1], nama + " kolom pertama sekarang:");
  });
});
t("pembangun baris TETAP punya kolom NO — Bulk Excel mengandalkannya", () => {
  /* Penjaga terpenting. Kalau kolomnya dibuang di hulu, Bulk Excel
     kehilangan tempat menaruh nomor DAN seluruh indeks kolom bergeser
     satu — Bulk Import lalu salah membaca setiap kolom. */
  const s = jadwalUji();
  const f = baca("clipboardFormatter");
  eq(w.buildAllExportCopyRows(s, f)[0].length, baca("ALL_EXPORT_COLS"), "All Export:");
  eq(w.buildDailyImportCopyRows(s, f)[0].length, baca("DAILY_IMPORT_COLS"), "Daily Import:");
  eq(w.buildDailyExportCopyRows(s, f)[0].length, baca("DAILY_EXPORT_COLS"), "Daily Export:");
  // Kolom 0 memang disediakan kosong untuk diisi Bulk Excel.
  eq(w.buildAllExportCopyRows(s, f)[0][0], f.blank, "slot NO:");
});
console.log("\u2014 SIZE (EXPORT) IKUT TAMPIL DI TEMPLATE YANG CUMA PUNYA SATU KOLOM DESKRIPSI \u2014");
t("All Export: kolom DESCRIPTION = Nama Barang + Size, kalau Size terisi", () => {
  const s = Object.assign({}, jadwalUji(), {
    items: [{ namaBarang: "TYRE MOLD TREAD ONLY", size: "235/55R20", qty: 1, harga: 100, hsCode: "1" }],
  });
  const rows = w.buildAllExportCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][7], "TYRE MOLD TREAD ONLY 235/55R20");
});
t("Daily Export: kolom ITEM NAME = Nama Barang + Size, kalau Size terisi", () => {
  const s = Object.assign({}, jadwalUji(), {
    items: [{ namaBarang: "TYRE MOLD TREAD ONLY", size: "235/55R20", qty: 1, satuan: "SET" }],
  });
  const rows = w.buildDailyExportCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][7], "TYRE MOLD TREAD ONLY 235/55R20");
});
t("tanpa Size (kosong/Import) -- tetap cuma Nama Barang, tanpa spasi menggantung di akhir", () => {
  const s = Object.assign({}, jadwalUji(), {
    items: [{ namaBarang: "TYRE MOLD TREAD ONLY", qty: 1, harga: 100, hsCode: "1" }],
  });
  const rows = w.buildAllExportCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][7], "TYRE MOLD TREAD ONLY");
});
t("Report (reportItemNames): dua ukuran beda dari nama dasar yang sama TIDAK ke-dedupe jadi satu", () => {
  const s = Object.assign({}, jadwalUji(), {
    items: [
      { namaBarang: "TYRE MOLD TREAD ONLY", size: "235/55R20" },
      { namaBarang: "TYRE MOLD TREAD ONLY", size: "195/65R15" },
    ],
  });
  const nama = w.reportItemNames(s);
  eq(nama.length, 2, "dua entri, bukan satu:");
  eq(nama[0], "TYRE MOLD TREAD ONLY 235/55R20");
  eq(nama[1], "TYRE MOLD TREAD ONLY 195/65R15");
});
t("Report: barang yang BENAR-BENAR sama (nama & size sama persis) tetap ke-dedupe", () => {
  const s = Object.assign({}, jadwalUji(), {
    items: [
      { namaBarang: "TYRE MOLD TREAD ONLY", size: "235/55R20" },
      { namaBarang: "tyre mold tread only", size: "235/55R20" }, // huruf beda, tetap sama
    ],
  });
  eq(w.reportItemNames(s).length, 1);
});
t("Daily Import: kolom BRUTO = Total Bruto se-pengiriman, sekali di baris pertama", () => {
  /* Barang 1 100kg + Barang 2 250kg + Barang 3 150kg = Total 500kg --
     dan ditampilkan SEKALI di baris pertama (level pengiriman, sama
     seperti SPPB/AJU/dst.), bukan diulang tiap baris. */
  const s = Object.assign({}, jadwalUji(), {
    items: [
      { namaBarang: "A", qty: 1, satuan: "PCE", bruto: 100 },
      { namaBarang: "B", qty: 1, satuan: "PCE", bruto: 250 },
      { namaBarang: "C", qty: 1, satuan: "PCE", bruto: 150 },
    ],
  });
  const rows = w.buildDailyImportCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][9], "500", "baris 1 (Total Bruto):");
  eq(rows[1][9], "", "baris 2 -- kosong, bukan berat barang B (250) sendiri:");
  eq(rows[2][9], "", "baris 3 -- kosong, bukan berat barang C (150) sendiri:");
});
t("Daily Import: Netto yang terisi lengkap TIDAK menggantikan Total Bruto", () => {
  /* Dulu Netto didahulukan kalau terisi di semua barang. Kolom ini
     kolom BRUTO: isinya Total Bruto, apa pun isi Netto-nya. */
  const s = Object.assign({}, jadwalUji(), {
    items: [
      { namaBarang: "A", qty: 1, satuan: "PCE", netto: 80, bruto: 100 },
      { namaBarang: "B", qty: 1, satuan: "PCE", netto: 200, bruto: 250 },
      { namaBarang: "C", qty: 1, satuan: "PCE", netto: 120, bruto: 150 },
    ],
  });
  const rows = w.buildDailyImportCopyRows(s, baca("clipboardFormatter"));
  eq(rows[0][9], "500", "Total Bruto (100+250+150), BUKAN Total Netto (400):");
});
t("kolom setelah NO tidak ikut tergeser atau hilang", () => {
  const s = jadwalUji();
  const f = baca("clipboardFormatter");
  const penuh = w.buildAllExportCopyRows(s, f);
  const dipotong = w.tanpaKolomNo(penuh);
  // Isi harus sama persis, cuma bergeser satu ke kiri.
  eq(dipotong[0].join("\u0001"), penuh[0].slice(1).join("\u0001"));
  if (dipotong[0].indexOf(f.text ? "PT UJI" : "PT UJI") < 0)
    throw new Error("data pengiriman ikut terpotong");
});

console.log("\u2014 TEMPLATE SALIN: INFO BARANG BARU (IMPORT) \u2014");
t("format persis: sapaan, invoice, daftar barang, lalu tiga tanggal", () => {
  const s = jadwalUji();
  s.items = [{ namaBarang: "BARANG A" }, { namaBarang: "BARANG B" }];
  eq(
    w.buildImportAnnouncementText(s),
    ["Dear Team,", "", "Akan ada barang import baru nomor invoice INV-1", "",
     "* BARANG A", "* BARANG B", "", "",
     "ETD : 01-08-2026, ETA : 10-08-2026, Estimasi sampai pabrik : 12-08-2026",
    ].join("\n"),
  );
});
t('"Estimasi sampai pabrik" dari field `actual` (Estimasi Delivery), bukan ETA', () => {
  const s = jadwalUji();
  s.items = [{ namaBarang: "BARANG A" }];
  s.eta = "2026-08-10";
  s.actual = "2026-08-12"; // beda dari ETA supaya uji ini berarti
  if (!w.buildImportAnnouncementText(s).includes("Estimasi sampai pabrik : 12-08-2026"))
    throw new Error('"Estimasi sampai pabrik" tidak lagi memakai field `actual`');
});
t("barang tanpa nama dilewati, bukan jadi baris bullet kosong", () => {
  const s = jadwalUji();
  s.items = [{ namaBarang: "BARANG A" }, { namaBarang: "  " }, { namaBarang: "" }];
  const teks = w.buildImportAnnouncementText(s);
  eq((teks.match(/^\* /gm) || []).length, 1, "jumlah baris bullet:");
});
t("semua barang tanpa nama -> string kosong (memicu pesan tidak ada data)", () => {
  const s = jadwalUji();
  s.items = [{ namaBarang: "" }, { namaBarang: "   " }];
  eq(w.buildImportAnnouncementText(s), "");
});
t("hanya muncul di buku Import, bukan Export", () => {
  const tpl = baca("COPY_TEMPLATES").find((x) => x.id === "ImportAnnouncement");
  if (!tpl) throw new Error("template ImportAnnouncement tidak terdaftar di COPY_TEMPLATES");
  eq(tpl.modes.includes("import"), true, "modes punya import:");
  eq(tpl.modes.includes("export"), false, "modes tidak boleh punya export:");
  // Tanpa `sheet` -> tidak ikut dibuatkan tab di Bulk Excel (seperti Report).
  eq(!!tpl.sheet, false, "tidak boleh punya `sheet`:");
});

console.log("\u2014 KEMASAN PIB MASUK KE KOLOM YANG TAMPIL \u2014");
/* Kolom `package` sekarang bernama "Dimensi" dan disembunyikan di buku
   Import (body.mode-import .dim-col { display:none }). Kemasan yang
   ditulis ke situ terbaca dari PDF tapi tidak pernah terlihat. */
t("kolom Dimensi memang disembunyikan di buku Import", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  if (!/body\.mode-import\s+\.dim-col\s*\{[^}]*display:\s*none/.test(css))
    throw new Error("dim-col tidak lagi disembunyikan — alasan perbaikan ini gugur");
});
t("importir PIB menulis packing/packingUnit, bukan package", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "import", "pdf.js"), "utf8");
  if (/base\.package\s*=/.test(src))
    throw new Error("PIB masih menulis ke kolom Dimensi");
  if (/items\[0\]\.package\s*=/.test(src))
    throw new Error("cadangan field 28 masih menulis ke kolom Dimensi");
  if (!/base\.packing\s*=/.test(src) || !/base\.packingUnit\s*=/.test(src))
    throw new Error("packing/packingUnit tidak diisi");
});
t("Total Package dihitung dari kolom Kemasan yang tampil", () => {
  /* Data hasil Excel BC menulis ke `packing`. Kalau totalnya masih
     dijumlahkan dari `package`, angkanya selalu nol. */
  const c = w.computeCustoms({ items: [
    { packing: "2", packingUnit: "CS" },
    { packing: "" }, { packing: "" },
  ] });
  eq(c.totalPackageQty, 2, "dari packing:");
});
t("jadwal LAMA yang menyimpan '5 BOX' di package tidak jadi nol", () => {
  const c = w.computeCustoms({ items: [{ package: "5 BOX" }, { package: "3 PALLET" }] });
  eq(c.totalPackageQty, 8, "cadangan untuk data lama:");
});
t("packing menang atas package kalau dua-duanya terisi", () => {
  const c = w.computeCustoms({ items: [{ packing: "2", package: "99 BOX" }] });
  eq(c.totalPackageQty, 2);
});

console.log("\u2014 KERANGKA PITA BARANG PIB \u2014");
/* Dua kolom PIB dulu punya salinan geometrinya masing-masing. Yang
   diuji di sini: pita dipotong di tempat yang benar, dan KEDUA kolom
   memakai potongan yang sama. */
function pibHalamanPalsu() {
  const p = (str, x, y) => ({ str, width: str.length * 5, transform: [9, 0, 0, 9, x, y] });
  return [
    p("32. - Pos Tarif", 30, 760), p("35. - Jumlah dan Jenis", 400, 760),
    p("33. Keterangan", 210, 760), p("36. - Nilai Pabean", 476, 760),
    p("Pos Tarif : 6406", 30, 700), p("10 SET", 400, 700),
    p("URAIAN SATU", 30, 688),      p("NETTO 5", 400, 688),
    p("Pos Tarif : 3926", 30, 640), p("20 PCS", 400, 640),
    p("URAIAN DUA", 30, 628),       p("NETTO 9", 400, 628),
    p("Jenis Pungutan", 30, 560),
  ];
}
t("pita dipotong per 'Pos Tarif', tidak bocor ke barang berikutnya", () => {
  const hal = [pibHalamanPalsu()];
  const uraian = w.extractItemUraianColumn(hal, 2);
  eq(uraian.length, 2, "jumlah barang:");
  eq(uraian[0], "Pos Tarif : 6406 URAIAN SATU", "barang 1:");
  eq(uraian[1], "Pos Tarif : 3926 URAIAN DUA", "barang 2:");
});
t("kolom kanan memakai potongan pita yang SAMA", () => {
  /* Diuji lewat kerangka bersamanya langsung. extractItemDetailColumn
     mengubah token jadi objek qty/satuan/netto, jadi ia menguji
     penguraian angka — bukan geometri pita yang jadi pokok di sini. */
  const hal = [pibHalamanPalsu()];
  const kanan = w.pibPitaBarang(hal, 2, {
    headerKiri: /^35\.\s*-?\s*Jumlah dan Jenis/i,
    headerKanan: /^36\.\s*-?\s*Nilai Pabean/i,
    geserKiri: 6, xMinCadangan: 393, xMaxCadangan: 468,
    ambil: (lines) => lines.map((l) => l.text.trim()),
  });
  eq(kanan.length, 2, "jumlah barang:");
  eq(kanan[0].join("/"), "10 SET/NETTO 5", "barang 1:");
  eq(kanan[1].join("/"), "20 PCS/NETTO 9", "barang 2:");
});
t("kedua kolom memotong pita di Y yang sama persis", () => {
  /* Inilah yang dijaga penyatuan ini: dulu geometrinya ditulis dua
     kali, dan bisa bercabang tanpa ada yang tahu. */
  const hal = [pibHalamanPalsu()];
  const pita = (xMin, xMax) => w.pibPitaBarang(hal, 2, {
    headerKiri: /tidak ada/, headerKanan: /tidak ada/,
    geserKiri: 0, xMinCadangan: xMin, xMaxCadangan: xMax,
    ambil: (lines) => lines.length,
  });
  eq(JSON.stringify(pita(20, 200)), JSON.stringify(pita(393, 468)),
    "jumlah baris per pita di kedua kolom:");
});
t("jumlah barang tidak cocok -> kosong, bukan tebakan", () => {
  eq(w.extractItemUraianColumn([pibHalamanPalsu()], 5).length, 0);
  eq(w.extractItemUraianColumn([], 2).length, 0);
  eq(w.extractItemUraianColumn(null, 2).length, 0);
});

console.log("\u2014 PILIHAN JENIS BARANG \u2014");
/* CATATAN UNTUK NANTI. Uji-uji di bawah sengaja TIDAK mencocokkan
   daftar lengkap kata demi kata. Menambah jenis barang baru cukup
   dengan menempelkannya di js/config.js — tidak perlu menyentuh
   berkas ini. Yang dijaga sifatnya, bukan isinya:

     - empat jenis yang diminta harus ADA
     - daftarnya harus SELALU terurut
     - urutannya harus DIHITUNG, bukan ditulis rapi oleh tangan
*/
t("empat jenis yang diminta ada di daftar", () => {
  const daftar = baca("JENIS_OPTIONS");
  ["BAHAN BAKU", "BARANG MODAL", "BARANG PENOLONG", "SPAREPART"]
    .forEach((j) => {
      if (daftar.indexOf(j) < 0) throw new Error(j + " hilang dari daftar");
    });
});
t("daftar selalu terurut, berapa pun isinya", () => {
  const kini = baca("JENIS_OPTIONS");
  const urut = kini.slice().sort((a, b) => a.localeCompare(b, "id"));
  eq(kini.join("|"), urut.join("|"), "daftar tidak terurut:");
});
t("urutannya DIHITUNG, bukan ditulis rapi oleh tangan", () => {
  /* Penjaga terpenting di sini. Daftar yang kebetulan sudah rapi akan
     lolos uji "selalu terurut" — lalu berantakan diam-diam begitu
     jenis berikutnya ditempel di bawah. Jadi yang diperiksa
     pembungkusnya, bukan hasilnya. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "config.js"), "utf8");
  if (!/const JENIS_OPTIONS\s*=\s*urutkanJenis\(/.test(src))
    throw new Error("JENIS_OPTIONS tidak lagi melewati urutkanJenis()");
  if (!/urutkanJenis\(JENIS_OPTIONS\.concat/.test(src))
    throw new Error("pilihan tambahan tidak ikut diurutkan");
});
t("pengurutan tidak mengaduk daftar aslinya", () => {
  const asal = ["ZETA", "ALFA"];
  eq(w.urutkanJenis(asal).join(","), "ALFA,ZETA", "hasil:");
  eq(asal.join(","), "ZETA,ALFA", "daftar asal ikut berubah:");
});
t("ejaan lama tetap dikenali, tidak jatuh ke pilihan pertama", () => {
  /* Jadwal lama menyimpan "Bahan Baku". Tanpa pembakuan, kotak
     pilihan meleset dan jatuh ke BARANG MODAL — jenis barang berubah
     diam-diam begitu jadwalnya dibuka. */
  eq(w.normalisasiJenisBarang("Bahan Baku"), "BAHAN BAKU");
  eq(w.normalisasiJenisBarang("  barang penolong "), "BARANG PENOLONG");
  eq(w.normalisasiJenisBarang(null), "");
  eq(w.rowToItem({ jenis_barang: "Barang Modal" }).jenisBarang, "BARANG MODAL");
});
t("kolom size ikut dipetakan dua arah (itemToRow <-> rowToItem) -- sempat kelewat, bikin Size tidak tersimpan", () => {
  eq(w.itemToRow({ namaBarang: "X", size: "235/55R20" }, "id-1").size, "235/55R20");
  eq(w.rowToItem({ nama_barang: "X", size: "235/55R20" }).size, "235/55R20");
  // Tanpa size sama sekali -> string kosong, bukan undefined (field lain di baris yang sama juga begitu).
  eq(w.itemToRow({ namaBarang: "X" }, "id-1").size, "");
  eq(w.rowToItem({ nama_barang: "X" }).size, "");
});
t("nilai di luar daftar IKUT ditampilkan, bukan dibuang", () => {
  /* Nilai apa pun yang tersimpan tapi tidak ada di daftar — ejaan
     lama, jenis yang pernah dipakai lalu dicabut — harus ikut
     ditampilkan. Kalau tidak, nilainya hilang dari data begitu
     barisnya tersentuh.

     Dipakai nilai karangan, BUKAN salah satu isi daftar: "BARANG JADI"
     dulu di luar daftar lalu dimasukkan, dan uji ini ikut lulus palsu
     karenanya. */
  const opsi = w.jenisOptionsUntuk("Barang Lawas");
  const daftar = baca("JENIS_OPTIONS");
  eq(opsi.length, daftar.length + 1, "jumlah pilihan:");
  if (opsi.indexOf("BARANG LAWAS") < 0)
    throw new Error("nilai di luar daftar dibuang");
  // Ikut diurutkan, bukan ditempel di ujung.
  eq(opsi.join("|"), opsi.slice().sort((a, b) => a.localeCompare(b, "id")).join("|"),
    "pilihan tambahan tidak ikut terurut:");
  // Nilai yang memang ada di daftar tidak menggandakan apa pun.
  eq(w.jenisOptionsUntuk("BAHAN BAKU").length, daftar.length);
  eq(w.jenisOptionsUntuk("").length, daftar.length);
});
t("kotak pilihan menandai nilai tersimpan yang ejaannya lama", () => {
  /* Diuji lewat tabel yang benar-benar digambar, bukan potongan HTML —
     inilah yang dilihat pengguna saat membuka jadwal lama. */
  const simpan = baca("draftItems");
  w.eval('draftItems = [{ namaBarang: "X", jenisBarang: "Bahan Baku", skb: [] },\n' +
         '               { namaBarang: "Y", jenisBarang: "Barang Jadi", skb: [] }]');
  try {
    w.renderItemTable();
    const html = w.document.getElementById("itemTableBody").innerHTML;
    if (!/<option value="BAHAN BAKU"[^>]*selected/.test(html))
      throw new Error("nilai lama tidak tertandai di kotak pilihan");
    if (!/<option value="BARANG JADI"[^>]*selected/.test(html))
      throw new Error("nilai di luar daftar hilang dari kotak pilihan");
  } finally {
    w.eval("draftItems = " + JSON.stringify(simpan || []));
    w.renderItemTable();
  }
});

console.log("\u2014 SATU PEMBACA BARIS PDF, BUKAN DUA \u2014");
t("dua pembaca baris PDF sudah jadi satu", () => {
  /* Berkas pdf.js dulu punya salinan sendiri dari algoritma penyusun
     baris di pdf-coords.js. Ambang spasinya (15% ukuran font) hasil
     penyetelan terhadap PDF PIB sungguhan — dua salinan berarti
     penyetelan berikutnya cuma masuk ke salah satunya. */
  if (typeof w.groupPdfItemsIntoLinesWithMeta === "function")
    throw new Error("salinan kedua hidup lagi");
  if (typeof w.pdfLines !== "function")
    throw new Error("pdfLines hilang — groupPdfItemsIntoLines tidak punya sandaran");
});
t("penyusun baris tetap benar: urutan acak, jarak, dan pemisahan baris", () => {
  /* Potongan PDF datang dalam urutan acak. Yang diuji: dikembalikan
     ke atas-bawah lalu kiri-kanan, dan spasi hanya muncul di jarak
     yang lebih lebar dari 15% ukuran font. */
  const p = (str, x, y, lebar, font) => ({
    str, width: lebar, transform: [font, 0, 0, font, x, y],
  });
  const items = [
    p("DUNIA", 60, 700, 30, 10),     // baris 1, ada jarak lebar sebelumnya
    p("HALO", 20, 700.9, 25, 10),    // baris 1, masih dalam toleransi 2.5
    p("KE", 20, 680, 12, 10),        // baris 2
    p("DUA", 32.4, 680, 18, 10),     // baris 2, jarak sempit -> menempel
  ];
  const baris = w.pdfLines(items);
  eq(baris.length, 2, "jumlah baris:");
  eq(baris[0].text, "HALO DUNIA", "baris 1:");
  eq(baris[1].text, "KEDUA", "baris 2:");
  // groupPdfItemsIntoLines harus memberi teks yang sama persis
  eq(w.groupPdfItemsIntoLines(items).join("|"), "HALO DUNIA|KEDUA", "lewat pdf.js:");
});

console.log("\u2014 PERHITUNGAN PAKSA TATA LETAK \u2014");
/* Menyetel style.height membatalkan tata letak; membaca scrollHeight
   memaksa peramban menghitungnya ulang SAAT ITU JUGA. Kalau keduanya
   diselang-seling per baris, satu kiriman 60 barang berarti 60
   perhitungan paksa berturut-turut.

   jsdom tidak punya mesin tata letak, jadi yang diukur bukan waktu —
   melainkan POLA AKSESNYA: berapa kali baca terjadi SESUDAH tulis.
   Itu persis yang menentukan jumlah perhitungan paksa di peramban. */
function pasangPencatatAkses(jumlah) {
  const jejak = [];
  const kotak = [];
  for (let i = 0; i < jumlah; i++) {
    const el = w.document.createElement("textarea");
    el.className = "nama-barang-input";
    el.getClientRects = () => [{ width: 300, height: 20 }];
    Object.defineProperty(el, "scrollHeight", {
      get() { jejak.push("baca"); return 40; }, configurable: true,
    });
    const gaya = el.style;
    Object.defineProperty(el, "style", {
      get() {
        return new Proxy(gaya, {
          set(t, k, v) { if (k === "height") jejak.push("tulis"); t[k] = v; return true; },
        });
      }, configurable: true,
    });
    kotak.push(el);
  }
  const asli = w.document.querySelectorAll.bind(w.document);
  w.document.querySelectorAll = (sel) =>
    sel === "textarea.nama-barang-input" ? kotak : asli(sel);
  return { jejak, pulihkan: () => { w.document.querySelectorAll = asli; } };
}
function hitungPerhitunganPaksa(jejak) {
  // Satu perhitungan paksa = baca pertama sesudah rentetan tulis.
  let n = 0, adaTulis = false;
  jejak.forEach((a) => {
    if (a === "tulis") adaTulis = true;
    else if (a === "baca" && adaTulis) { n++; adaTulis = false; }
  });
  return n;
}
t("60 baris = SATU perhitungan paksa, bukan 60", () => {
  const { jejak, pulihkan } = pasangPencatatAkses(60);
  try {
    w.autoGrowAllItemNames();
    const n = hitungPerhitunganPaksa(jejak);
    if (n > 2) throw new Error(n + " perhitungan paksa untuk 60 baris — tulis & baca masih berselang-seling");
  } finally { pulihkan(); }
});
t("tinggi tetap benar walau dikerjakan berkelompok", () => {
  const { jejak, pulihkan } = pasangPencatatAkses(3);
  try {
    w.autoGrowAllItemNames();
    // 3 tulis "auto" + 3 baca + 3 tulis hasil = 9 akses
    eq(jejak.filter((a) => a === "baca").length, 3, "jumlah baca:");
    eq(jejak.filter((a) => a === "tulis").length, 6, "jumlah tulis:");
  } finally { pulihkan(); }
});
t("getComputedStyle tidak dipanggil dua kali per kotak", () => {
  /* autoSizeInput butuh padding, measureTextWidth butuh font — dulu
     masing-masing memanggil getComputedStyle pada elemen yang SAMA. */
  const el = w.document.createElement("input");
  el.value = "5 BOX";
  w.document.body.appendChild(el);
  let n = 0;
  const asli = w.getComputedStyle;
  w.getComputedStyle = (x) => { n++; return asli(x); };
  try { w.autoSizeInput(el, 96, 210); } finally { w.getComputedStyle = asli; }
  el.remove();
  if (n > 1) throw new Error("getComputedStyle dipanggil " + n + "x untuk satu kotak");
});

t("lebar kotak status: ukur sekali per teks, bukan sekali per kartu", () => {
  /* Isi kotak status cuma segelintir. Papan berisi banyak kartu harus
     tetap butuh sedikit pengukuran — kalau jumlahnya ikut naik
     sebanding jumlah kartu, hasilnya tidak dipakai ulang lagi. */
  const wadah = w.document.getElementById("cardContainer");
  if (!wadah) throw new Error("cardContainer tidak ada");
  const simpan = wadah.innerHTML;
  const status = ["Process", "In Transit", "Arrived"];
  wadah.innerHTML = Array.from({ length: 60 }, (_, i) =>
    `<select class="status-select"><option selected>${status[i % 3]}</option></select>`
  ).join("");

  let diukur = 0;
  const proto = w.HTMLElement.prototype;
  const asli = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () { diukur++; return { width: 80, height: 20 }; };
  try { w.fixSelectWidths(); } finally { proto.getBoundingClientRect = asli; }
  wadah.innerHTML = simpan;

  if (diukur > 6)
    throw new Error(diukur + " pengukuran untuk 60 kartu / 3 teks — hasilnya tidak dipakai ulang");
});

console.log("\u2014 LEBAR KOLOM NAMA BARANG \u2014");
t("dua min-width kolom nama barang tetap sepasang", () => {
  /* Lebar kolom ditentukan DUA aturan: sel-nya dan textarea di
     dalamnya. Kalau salah satu diubah sendirian, yang berlaku adalah
     yang terbesar — kolomnya melebar tapi kotaknya tidak, atau
     sebaliknya. Angkanya sendiri bebas; yang dijaga kesamaannya.
     Lewat kelas .namabarang-col, BUKAN td:first-child lagi -- sejak
     kolom Seri Barang ditambahkan di depannya, :first-child sudah
     berarti kolom itu, bukan Nama Barang. */
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const sel = /table\.item-table td\.namabarang-col\s*\{[^}]*min-width:\s*(\d+)px/.exec(css);
  const kotak = /table\.item-table textarea\.nama-barang-input\s*\{[^}]*min-width:\s*(\d+)px/.exec(css);
  if (!sel) throw new Error("min-width td.namabarang-col tidak ditemukan");
  if (!kotak) throw new Error("min-width textarea.nama-barang-input tidak ditemukan");
  eq(sel[1], kotak[1], "sel " + sel[1] + "px vs kotak " + kotak[1] + "px:");
});

console.log("\u2014 TINGGI SERAGAM UNTUK SEMUA JENIS FIELD (TEXT/DROPDOWN/DATE/TIME) \u2014");
function cariAturan(css, selectorPersis) {
  const i = css.indexOf(selectorPersis);
  if (i < 0) return null;
  const mulai = css.indexOf("{", i);
  const akhir = css.indexOf("}", mulai);
  return css.slice(mulai, akhir);
}
t("form utama: .form-control & .form-select punya min-height yang SAMA", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const blok = cariAturan(css, ".page-form .form-control,\n.page-form .form-select {");
  if (!blok) throw new Error("aturan .page-form .form-control/.form-select tidak ditemukan");
  if (!/min-height:\s*40px/.test(blok))
    throw new Error("min-height 40px tidak ditemukan di .form-control/.form-select");
});
t("Terminal Transit (form-control-sm/form-select-sm) DISAMAKAN, bukan dibiarkan ukuran -sm bawaan Bootstrap", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const blok = cariAturan(css, ".page-form .form-control-sm,\n.page-form .form-select-sm {");
  if (!blok) throw new Error("penyamaan form-control-sm/form-select-sm tidak ditemukan");
  if (!/min-height:\s*40px/.test(blok))
    throw new Error("min-height Terminal Transit tidak disamakan dengan field form biasa (40px)");
});
t("tabel Daftar Barang: input & select (HS Code, Qty, Jenis Barang, dst.) satu min-height yang sama", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const blok = cariAturan(css, "table.item-table input,\ntable.item-table select {");
  if (!blok) throw new Error("aturan table.item-table input/select tidak ditemukan");
  if (!/min-height:\s*34px/.test(blok))
    throw new Error("min-height 34px tidak ditemukan -- field satu baris (HS Code, Qty, dst.) bisa kembali lebih pendek dari Nama Barang/Size");
});
t("kolom Size ikut min-height yang SAMA dengan field tabel lainnya (34px), bukan cuma height:100% ke sel induk", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const blok = cariAturan(css, ".size-col input {");
  if (!blok) throw new Error(".size-col input tidak ditemukan");
  if (!/min-height:\s*34px/.test(blok))
    throw new Error("min-height 34px tidak ditemukan di .size-col input");
});
t("Nama Barang/Uraian (textarea) punya min-height 34px yang SAMA -- boleh tumbuh lebih tinggi untuk teks panjang, tapi lantainya sama", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const blok = cariAturan(css, "table.item-table textarea.nama-barang-input {");
  if (!blok) throw new Error("aturan textarea.nama-barang-input tidak ditemukan");
  if (!/min-height:\s*34px/.test(blok))
    throw new Error("min-height 34px tidak ditemukan di textarea Nama Barang -- lantai tingginya tidak lagi sepadan dengan field lain di tabel yang sama");
});

console.log("\u2014 NILAI BAWAAN BARANG BARU (BEDA PER BUKU) \u2014");
t("Import: jenis barang bawaan BAHAN BAKU", () => {
  const modeAwal = baca("activeMode");
  try {
    tulis("activeMode", "import");
    eq(w.newItem().jenisBarang, "BAHAN BAKU");
  } finally {
    tulis("activeMode", modeAwal);
  }
});
t("Export: jenis barang bawaan BARANG JADI (bukan BAHAN BAKU)", () => {
  const modeAwal = baca("activeMode");
  try {
    tulis("activeMode", "export");
    eq(w.newItem().jenisBarang, "BARANG JADI");
  } finally {
    tulis("activeMode", modeAwal);
  }
});
t("Satuan bawaan SET di KEDUA buku (dulu PCS)", () => {
  const modeAwal = baca("activeMode");
  try {
    tulis("activeMode", "import");
    eq(w.newItem().satuan, "SET", "Import:");
    tulis("activeMode", "export");
    eq(w.newItem().satuan, "SET", "Export:");
  } finally {
    tulis("activeMode", modeAwal);
  }
});
t("Jenis kemasan bawaan BOX di KEDUA buku (dulu kosong)", () => {
  const modeAwal = baca("activeMode");
  try {
    tulis("activeMode", "import");
    eq(w.newItem().packingUnit, "BOX", "Import:");
    tulis("activeMode", "export");
    eq(w.newItem().packingUnit, "BOX", "Export:");
  } finally {
    tulis("activeMode", modeAwal);
  }
});
t("jenis bawaan itu nilai yang SAH menurut daftar pilihan (bukan teks lepas yang lalu jatuh ke pilihan pertama)", () => {
  const daftar = baca("JENIS_OPTIONS");
  if (!daftar.includes("BAHAN BAKU")) throw new Error("BAHAN BAKU tidak ada di JENIS_OPTIONS");
  if (!daftar.includes("BARANG JADI")) throw new Error("BARANG JADI tidak ada di JENIS_OPTIONS");
});

console.log("\u2014 TOMBOL FASILITAS: TINGGI SEPADAN DENGAN FIELD LAIN SEBARIS \u2014");
t("btn-facilities punya min-height yang SAMA dengan input/select tabel (34px)", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const i = css.indexOf(".btn-facilities {");
  if (i < 0) throw new Error(".btn-facilities tidak ditemukan");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/min-height:\s*34px/.test(blok))
    throw new Error("tombol Fasilitas tidak setinggi field lain di barisnya (34px)");
});
t("dropdown tabel memakai panah gambar sendiri & lebar mengikuti isi", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  /* Cari aturan table.item-table select yang BERDIRI SENDIRI -- bukan
     yang digabung koma dengan `table.item-table input` di atasnya
     (indexOf polos ketemu yang gabungan itu duluan). */
  const m = /\n(?<!,\n)table\.item-table select \{([\s\S]*?)\}/.exec(
    css.replace(/table\.item-table input,\ntable\.item-table select \{/, "SKIP {"),
  );
  if (!m) throw new Error("aturan khusus table.item-table select tidak ditemukan");
  const blok = m[1];
  if (!/appearance:\s*none/.test(blok))
    throw new Error("panah bawaan browser belum dimatikan (appearance: none)");
  if (!/background-image:\s*url\(/.test(blok))
    throw new Error("panah gambar sendiri tidak dipasang");
  if (!/width:\s*auto/.test(blok))
    throw new Error("lebar dropdown belum mengikuti isi (width: auto)");
});

console.log("\u2014 AGENDA 7 HARI: BERBASIS ESTIMATED DELIVERY \u2014");
function pakaiAgendaUji(rows, jalankan) {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  try {
    w.eval("data." + mode + " = " + JSON.stringify(rows));
    w.renderAgenda();
    jalankan();
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    w.renderAgenda();
  }
}
function hitungAgenda(iso) {
  const btn = w.document.querySelector(`#ovAgenda [data-ov-date="${iso}"]`);
  return btn ? btn.querySelector(".agenda-count").textContent.trim() : null;
}
t("lencana menghitung Estimated Delivery, BUKAN ETA", () => {
  /* ETA cuma kedatangan di pelabuhan; jaraknya ke pabrik bisa
     berhari-hari. Agenda ini menjawab "hari apa barang sampai di
     pabrik". */
  const hariIni = w.todayISO();
  const besok = w.addCalendarDaysISO(hariIni, 1);
  pakaiAgendaUji([
    // ETA hari ini, tapi Estimated Delivery-nya BESOK.
    { id: "a1", status: "process", eta: hariIni, actual: besok, items: [] },
  ], () => {
    eq(hitungAgenda(hariIni), "0", "hari ini (cuma ETA, bukan delivery):");
    eq(hitungAgenda(besok), "1", "besok (Estimated Delivery-nya):");
  });
});
t("yang sudah tiba tidak ikut dihitung", () => {
  const hariIni = w.todayISO();
  pakaiAgendaUji([
    { id: "a2", status: "arrived", actual: hariIni, items: [] },
    { id: "a3", status: "process", actual: hariIni, items: [] },
  ], () => {
    eq(hitungAgenda(hariIni), "1", "cuma yang belum tiba:");
  });
});
t("klik hari menyaring dengan basis yang SAMA dengan lencananya", () => {
  /* Kalau basis lencana & basis saringan berbeda, angka di lencana
     tidak akan cocok dengan jumlah kartu yang muncul sesudah diklik. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "overview-view.js"), "utf8");
  if (!/jumpToDateFilter\("actual"/.test(src))
    throw new Error("klik agenda tidak menyaring memakai basis Estimated Delivery");
  if (/jumpToDateFilter\("eta"/.test(src))
    throw new Error("masih ada jalur yang menyaring memakai ETA");
});
t("basis saringan 'actual' membaca field yang sama dengan hitungan lencana", () => {
  const s = { actual: "2026-09-14", eta: "2026-09-10", etd: "2026-09-01" };
  eq(w.dateRangeBasisValue(s, "actual"), "2026-09-14");
});
t("keterangan panel menyebut basisnya, dan ikut berganti di buku Export", () => {
  const modeAwal = baca("activeMode");
  try {
    tulis("activeMode", "import");
    w.renderAgenda();
    if (!$("#ovAgendaNote").textContent.includes(w.ML().actual))
      throw new Error("keterangan tidak menyebut basis Import");
    tulis("activeMode", "export");
    w.renderAgenda();
    if (!$("#ovAgendaNote").textContent.includes(w.ML().actual))
      throw new Error("keterangan tidak ikut berganti di buku Export");
  } finally {
    tulis("activeMode", modeAwal);
    w.renderAgenda();
  }
});


t("catatan pembaca berkas impor ikut dua bahasa", () => {
  /* Catatan ini yang memberi tahu apa yang TIDAK terbaca dari dokumen.
     Kalau tertinggal bahasa Indonesia, pengguna mode Inggris justru
     kehilangan peringatan yang paling perlu dibaca. */
  const kamus = baca("I18N");
  const kunciImpor = Object.keys(kamus.id).filter((k) => /^[wy]\./.test(k));
  if (kunciImpor.length < 30)
    throw new Error("kunci catatan impor terlalu sedikit: " + kunciImpor.length);
  const kurang = kunciImpor.filter((k) => !kamus.en[k]);
  if (kurang.length) throw new Error("belum ada terjemahan EN: " + kurang.join(", "));
});
t("berkas pembaca impor tidak lagi menyimpan kalimat Indonesia panjang", () => {
  /* Dipindai per berkas: kalimat panjang yang tersisa berarti ada
     catatan yang belum masuk kamus. */
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "js", "import");
  const sisa = [];
  fs.readdirSync(dir).forEach((nm) => {
    if (!nm.endsWith(".js")) return;
    const src = fs
      .readFileSync(path.join(dir, nm), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    [...src.matchAll(/["'`]([^"'`\n]{40,})["'`]/g)].forEach((m) => {
      const teks = m[1];
      /* Kunci kamus (w.sheet.barang.kosong...) ikut tertangkap karena
         dibentuk dari kalimat aslinya. Itu justru bukti teksnya SUDAH
         dipindah ke kamus, bukan sisa. */
      if (/^[a-z]\.[a-z0-9.]+$/.test(teks)) return;
      if (/\b(yang|tidak|belum|sudah|dari|untuk|dengan|kalau|manual)\b/.test(teks)) {
        sisa.push(nm + ": " + teks.slice(0, 50));
      }
    });
  });
  if (sisa.length) throw new Error("masih ada kalimat Indonesia: " + sisa.join(" | "));
});

console.log("\u2014 URUTAN MULAI & PEMULIHAN KEADAAN \u2014");
t("router dipanggil SEBELUM & SESUDAH data dimuat", () => {
  /* Sebelum: supaya ada halaman yang tampil (lengkap dengan kerangka
     muat) dan layarnya tidak kosong selama data diambil.
     Sesudah: supaya #/edit/<id> benar-benar terbuka, karena pada
     panggilan pertama jadwalnya belum ada di daftar. */
  const fs = require("fs"), path = require("path");
  [["js", "app-init.js"], ["js", "auth", "session.js"]].forEach((bagian) => {
    const src = fs
      .readFileSync(path.join(__dirname, "..", ...bagian), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const iMuat = src.indexOf("await loadShipments()");
    if (iMuat < 0) throw new Error(bagian.join("/") + ": loadShipments tidak dipanggil");
    const sebelum = src.lastIndexOf("router();", iMuat);
    const sesudah = src.indexOf("router();", iMuat);
    if (sebelum < 0)
      throw new Error(bagian.join("/") + ": tidak ada router() sebelum data dimuat -- layar akan kosong");
    if (sesudah < 0)
      throw new Error(bagian.join("/") + ": tidak ada router() sesudah data dimuat -- #/edit tidak akan terbuka");
  });
});
t("sesudah login, ada halaman yang tampil sebelum data selesai dimuat", () => {
  /* Kalau tidak, bagian tengah layar putih kosong sampai data sampai --
     yang terlihat hanya bilah atas & footer. */
  const src = require("fs")
    .readFileSync(require("path").join(__dirname, "..", "js", "auth", "session.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const i = src.indexOf("hideLoginView()");
  const potong = src.slice(i, src.indexOf("await loadShipments()", i));
  if (potong.indexOf("router();") < 0)
    throw new Error("tidak ada router() antara menutup layar masuk & memuat data");
});
t("#/edit yang belum termuat menampilkan daftar, BUKAN melempar ke dashboard", () => {
  /* Ini inti perbaikannya: "belum dimuat" tidak sama dengan "tidak ada". */
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  const hashAwal = w.location.hash;
  const muatAwal = baca("shipmentsLoaded");
  try {
    w.eval("data." + mode + " = []");
    w.eval("shipmentsLoaded = false");
    w.location.hash = "#/edit/belum-termuat";
    w.router();
    eq(w.location.hash, "#/edit/belum-termuat", "alamat dipertahankan:");

    /* Begitu datanya sampai dan id-nya memang tidak ada, BARU dilempar
       balik -- kalau tidak, alamat yang salah akan menggantung selamanya. */
    w.eval("shipmentsLoaded = true");
    w.router();
    eq(w.location.hash, "#/", "sesudah data ada, id yang tidak ada dilempar balik:");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    w.eval("shipmentsLoaded = " + JSON.stringify(muatAwal));
    w.location.hash = hashAwal || "#/";
  }
});
t("router #/edit menemukan jadwal yang datanya SUDAH dimuat", () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  const hashAwal = w.location.hash;
  try {
    w.eval("data." + mode + ' = [{ id:"r1", party:"PT UJI", status:"process", items:[], docProgress:{} }]');
    w.location.hash = "#/edit/r1";
    w.router();
    if (w.location.hash === "#/")
      throw new Error("router melempar balik ke dashboard padahal jadwalnya ada");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    w.location.hash = hashAwal || "#/";
  }
});
t("pendaftaran akun: tombol & sesi admin dipulihkan lewat finally", () => {
  /* Tanpa finally, sekali saja panggilan Supabase melempar: tombolnya
     terkunci selamanya DAN admin tertinggal memakai sesi akun yang
     baru dibuat tanpa tahu. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "views", "accounts-view.js"), "utf8");
  const i = src.indexOf('btn.textContent = t("a.mendaftarkan")');
  if (i < 0) throw new Error("blok pendaftaran tidak ditemukan");
  const blok = src.slice(i, i + 1400);
  if (!/finally\s*\{/.test(blok)) throw new Error("tidak ada finally di blok pendaftaran");
  const iFinally = blok.indexOf("finally");
  if (blok.indexOf("setSession", iFinally) < 0)
    throw new Error("pemulihan sesi admin tidak dijamin jalan");
  if (blok.indexOf("btn.disabled = false", iFinally) < 0)
    throw new Error("tombol tidak dijamin pulih");
});

console.log("\u2014 PERBAIKAN RINGKASAN, KARTU TIBA & LAYAR MASUK \u2014");
t("baris yang sudah LEWAT ETA tetap menyebut berkas yang belum ada", () => {
  /* Kiriman yang lewat ETA justru paling mendesak diurus berkasnya --
     tanpa daftar ini barisnya cuma memberi tahu "telat", bukan apa
     yang harus dikerjakan. */
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  try {
    w.eval("data." + mode + ' = [' +
      '{ id:"lt1", status:"process", party:"PT LEWAT", eta:"2020-01-01",' +
      '  docProgress:{}, items:[] }' +
    ']');
    w.renderTaskQueue();
    const teks = $("#ovTasks").textContent;
    if (!/sudah lewat/.test(teks)) throw new Error("prasyarat gagal: baris telat tidak muncul");
    if (!/belum ada/.test(teks)) throw new Error("berkas yang belum ada tidak disebut");
    ["COO", "PIB", "SPPB"].forEach((d) => {
      if (!teks.includes(d)) throw new Error("berkas " + d + " tidak disebut");
    });
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
  }
});
t("berkas yang sudah lengkap tidak menambah teks menggantung", () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  try {
    const p = {};
    w.docStepsFor({ mode: "import", docProgress: {} }).forEach((st) => {
      p[st.key] = { at: "2020-01-01" };
    });
    w.eval("data." + mode + ' = [{ id:"lt2", status:"process", party:"PT LENGKAP",' +
      ' eta:"2020-01-01", docProgress:' + JSON.stringify(p) + ', items:[] }]');
    w.renderTaskQueue();
    if (/belum ada\s*$/m.test($("#ovTasks").textContent))
      throw new Error('ada "belum ada" tanpa daftar di belakangnya');
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
  }
});
t("Ringkasan memakai tanggal TERBARU untuk menghitung telat", () => {
  /* boardState() membaca effectiveEta: jadwal yang dimundurkan tidak
     boleh dihitung telat berdasarkan rencana lamanya. */
  const s = { status: "process", eta: "2020-01-01", etaUpdate: "2999-01-01", docProgress: {} };
  eq(w.boardState(s).iso, "2999-01-01");
});
t("tombol Masuk kembali normal walau signIn melempar error", () => {
  /* Tanpa try/finally, sekali saja jaringan putus tombolnya berputar
     selamanya -- pengguna tidak punya cara mencoba lagi selain memuat
     ulang halaman. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "auth", "session.js"), "utf8");
  const i = src.indexOf("async function handleLoginSubmit");
  const blok = src.slice(i, src.indexOf("\n}", i));
  if (!/finally\s*\{[^}]*setLoginBusy\(false\)/.test(blok))
    throw new Error("setLoginBusy(false) tidak dijamin jalan lewat finally");
});
t("teks tombol Masuk ikut berganti bahasa, tidak tertanam di innerHTML", () => {
  /* setLoginBusy menulis ulang innerHTML tombolnya -- teks yang
     ditanam di situ akan menimpa span ber-data-i18n setiap kali. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "auth", "session.js"), "utf8");
  const i = src.indexOf("function setLoginBusy");
  const blok = src.slice(i, src.indexOf("\n}", i));
  if (/>\s*Masuk/.test(blok)) throw new Error("teks Indonesia masih tertanam di tombol");
  if (!/t\("c\.masuk/.test(blok)) throw new Error("tombol tidak memakai kamus");
});

console.log("\u2014 KARTU TIBA: RINCIAN SELENGKAP KARTU BERJALAN \u2014");
function jadwalKartu(over) {
  return Object.assign({
    id: "k1", party: "DYNAMIC DESIGN CO., LTD.", docNo: "320146", noAju: "00002012345",
    invoice: "DD-DI26090801", houseBL: "PRI029922", forwarder: "PRIME", forwarderPic: "MELKI",
    vessel: "GA", voyage: "GA879", container: "", muatan: "LCL",
    origin: "ICN", destination: "CGK", transport: "udara",
    etd: "2026-09-10", eta: "2026-09-10", actual: "2026-09-12",
    docProgress: {}, items: [{ namaBarang: "MASTER MODEL ULTRA 5", netto: 10, qty: 1, harga: 100 }],
  }, over);
}
t("kartu tiba menampilkan rincian yang SAMA dengan kartu berjalan", () => {
  /* Kiriman yang sudah selesai paling sering dibuka lagi justru untuk
     nomor B/L, forwarder, atau rutenya. */
  const tiba = w.renderCard(jadwalKartu({ status: "arrived" }));
  ["PRIME", "MELKI", "PRI029922", "DD-DI26090801", "MASTER MODEL ULTRA 5"].forEach((x) => {
    if (!tiba.includes(x)) throw new Error("kartu tiba kehilangan: " + x);
  });
  if (!tiba.includes("info-grid")) throw new Error("info-grid tidak ada di kartu tiba");
});
t("keduanya memakai pembangun badan yang sama, jadi tidak bisa berbeda isi", () => {
  const berjalan = w.renderCard(jadwalKartu({ status: "process" }));
  const tiba = w.renderCard(jadwalKartu({ status: "arrived" }));
  const ambilLabel = (html) =>
    [...html.matchAll(/class="info-label"[^>]*>.*?<\/i>\s*([^<]+)</g)].map((m) => m[1].trim());
  const a = ambilLabel(berjalan).join("|");
  const b = ambilLabel(tiba).join("|");
  if (a !== b) throw new Error("label rinciannya berbeda:\n  berjalan: " + a + "\n  tiba    : " + b);
});
t("kartu tiba tetap menampilkan Progres Dokumen", () => {
  const tiba = w.renderCard(jadwalKartu({ status: "arrived" }));
  if (!tiba.includes("docstep-dot")) throw new Error("Progres Dokumen hilang dari kartu tiba");
});
t("judul kartu tiba menyertakan jumlah barang, No. Dokumen & No. Aju", () => {
  const tiba = w.renderCard(jadwalKartu({ status: "arrived" }));
  if (!/1 (Barang|Items)/.test(tiba)) throw new Error("jumlah barang tidak ada");
  if (!tiba.includes("320146")) throw new Error("No. Dokumen tidak ada");
  if (!tiba.includes("00002012345")) throw new Error("No. Aju tidak ada");
});
t("tanggal di kartu tiba tetap HANYA BACA -- diubah lewat tombol pensil", () => {
  /* Kartu tiba adalah ringkasan; mengubah tanggal di situ terlalu
     mudah dilakukan tanpa sengaja pada kiriman yang sudah beres. */
  const tiba = w.renderCard(jadwalKartu({ status: "arrived" }));
  if (!tiba.includes("readonly")) throw new Error("kotak tanggal tidak lagi hanya-baca");
});

console.log("\u2014 IMPOR CEISA: PUNGUTAN MENIMPA ISI KOTAK \u2014");
function ujiImporPungutan(siapkan) {
  const simpan = {
    bm: $("#fBM").value, ppn: $("#fPPN").value, pph: $("#fPPH").value,
    nd: $("#fNdpbm").value, fr: $("#fFreight").value, ins: $("#fInsurance").value,
  };
  const draftAwal = baca("draftItems");
  try {
    w.eval("importFieldOrigin = {}");
    siapkan();
    w.applyImportedBcData({
      fields: { ndpbm: 16739, bm: 0, ppn: 5724825, pph: 0 },
      items: [], notes: [], source: "excel",
    });
    return w.nilaiKotakAngka("#fPPN");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    $("#fBM").value = simpan.bm; $("#fPPN").value = simpan.ppn; $("#fPPH").value = simpan.pph;
    $("#fNdpbm").value = simpan.nd; $("#fFreight").value = simpan.fr;
    $("#fInsurance").value = simpan.ins;
    w.eval("importFieldOrigin = {}");
    w.initAutoDutyFlags();
  }
}
t("form kosong: PPN dari dokumen masuk", () => {
  const hasil = ujiImporPungutan(() => {
    w.eval("draftItems = []");
    ["fBM", "fPPN", "fPPH", "fNdpbm"].forEach((id) => { $("#" + id).value = ""; });
    w.initAutoDutyFlags();
  });
  eq(hasil, 5724825);
});
t("MENGUBAH jadwal tersimpan yang PPN-nya 0: dokumen tetap menang", () => {
  /* Kotaknya berisi "0" (nilaiPungutan menulis nol apa adanya, bukan
     kosong), jadi terbaca "sudah diisi". Tanpa paksaan, impor menolak
     menyentuhnya dan PPN tetap 0 selamanya. */
  const hasil = ujiImporPungutan(() => {
    w.eval("draftItems = []");
    $("#fBM").value = "0"; $("#fPPN").value = "0"; $("#fPPH").value = "0";
    w.initAutoDutyFlags();
  });
  eq(hasil, 5724825);
});
t("kotak yang sudah berisi taksiran otomatis juga ditimpa dokumen", () => {
  const hasil = ujiImporPungutan(() => {
    w.eval('draftItems = [{ namaBarang:"X", qty:1, harga:5000 }]');
    ["fBM", "fPPN", "fPPH"].forEach((id) => { $("#" + id).value = ""; });
    $("#fNdpbm").value = "16,739";
    w.initAutoDutyFlags();
    w.recalcCustoms();
    if (w.nilaiKotakAngka("#fPPN") === 0) throw new Error("prasyarat gagal: taksiran tidak terisi");
  });
  eq(hasil, 5724825);
});
console.log("\u2014 PERLU TINDAKAN: BERKAS DARI STEPPER, BUKAN NOMOR ADMINISTRATIF \u2014");
t("yang dilaporkan kurang adalah TAHAPAN BERKAS (CI/PL, COO, PIB, SPPB...), bukan No. Aju", () => {
  /* Nomor administratif menyusul sendiri; tahapan stepper adalah
     berkas yang harus diurus dan menghambat barang kalau tertinggal. */
  const s = { mode: "import", docProgress: {}, noAju: "", invoice: "", docNo: "" };
  const kurang = w.missingDocs(s);
  if (kurang.includes("No. Aju")) throw new Error("No. Aju masih dilaporkan");
  if (kurang.includes("No. Invoice")) throw new Error("No. Invoice masih dilaporkan");
  ["CI/PL", "COO", "PIB", "SPPB"].forEach((l) => {
    if (!kurang.some((k) => k.includes(l)))
      throw new Error("tahap " + l + " tidak dilaporkan: " + kurang.join(", "));
  });
});
t("tahap yang SUDAH terisi tidak ikut dilaporkan", () => {
  const s = { mode: "import", docProgress: { cipl: { at: "2026-01-01" }, coo: { at: "2026-01-02" } } };
  const kurang = w.missingDocs(s);
  if (kurang.includes("CI/PL")) throw new Error("CI/PL sudah terisi tapi masih dilaporkan");
  if (kurang.includes("COO")) throw new Error("COO sudah terisi tapi masih dilaporkan");
  if (!kurang.some((k) => k.includes("SPPB"))) throw new Error("SPPB yang belum malah hilang");
});
t("tahap yang DILEWATI tidak dihitung kurang -- berkasnya memang tidak ada", () => {
  const s = { mode: "import", docProgress: { coo: { skipped: true } } };
  if (w.missingDocs(s).includes("COO"))
    throw new Error("tahap yang sengaja dilewati masih dianggap tertinggal");
});
t("ATA (kedatangan) tidak ikut dilaporkan -- itu bukan berkas yang bisa diurus", () => {
  const s = { mode: "import", docProgress: {} };
  if (w.missingDocs(s).some((k) => /ATA|Kedatangan/i.test(k)))
    throw new Error("tahap kedatangan ikut dilaporkan sebagai berkas kurang");
});
t("jadwal yang seluruh berkasnya lengkap tidak melaporkan apa pun", () => {
  const s = { mode: "import", docProgress: {} };
  const semua = w.docStepsFor(s);
  const p = {};
  semua.forEach((st) => { p[st.key] = { at: "2026-01-01" }; });
  eq(w.missingDocs({ mode: "import", docProgress: p }).length, 0);
});
t("Report menyertakan ETD & ETA, di Import maupun Export", () => {
  const s = { etd: "2026-09-10", eta: "2026-09-14", actual: "2026-09-16",
              incoterm: "FCA", muatan: "LCL", package: "4 BOX", items: [] };
  ["import", "export"].forEach((mode) => {
    const pasangan = w.reportDetailPairs(s, mode);
    const label = pasangan.map((p) => p[0]);
    if (!label.includes("ETD")) throw new Error("ETD tidak ada pada mode " + mode);
    if (!label.includes("ETA")) throw new Error("ETA tidak ada pada mode " + mode);
  });
});
t("Report memakai ETD/ETA TERBARU -- hasil update delay, bukan jadwal awal", () => {
  /* Report dikirim supaya penerimanya tahu keadaan sekarang;
     melaporkan jadwal lama yang sudah diketahui meleset menyesatkan. */
  const s = { etd: "2026-09-10", eta: "2026-09-14",
              etdUpdate: "2026-09-20", etaUpdate: "2026-09-25", items: [] };
  const pasangan = Object.fromEntries(w.reportDetailPairs(s, "import"));
  eq(pasangan.ETD, w.fmtDateLong("2026-09-20"), "ETD terbaru:");
  eq(pasangan.ETA, w.fmtDateLong("2026-09-25"), "ETA terbaru:");
});
t("tanpa update delay, Report jatuh ke jadwal awalnya", () => {
  const s = { etd: "2026-09-10", eta: "2026-09-14", items: [] };
  const pasangan = Object.fromEntries(w.reportDetailPairs(s, "import"));
  eq(pasangan.ETD, w.fmtDateLong("2026-09-10"));
  eq(pasangan.ETA, w.fmtDateLong("2026-09-14"));
});
t("label House pada kartu ikut moda: House AWB untuk udara", () => {
  const udara = w.renderExpandedCard({ id: "c1", transport: "udara", houseBL: "SRE1", items: [], docProgress: {} });
  if (!udara.includes("House AWB")) throw new Error("kartu udara tidak berlabel House AWB");
  const laut = w.renderExpandedCard({ id: "c2", transport: "laut", houseBL: "FGL1", items: [], docProgress: {} });
  if (!laut.includes("House B/L")) throw new Error("kartu laut tidak berlabel House B/L");
  if (laut.includes("House AWB")) throw new Error("kartu laut malah berlabel House AWB");
});
t("baris tugas bertingkat tiga: perusahaan / keterangan / nama barang", () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  try {
    w.eval("data." + mode + ' = [' +
      '{ id:"g1", status:"process", party:"SHENG GUANG", eta:"2020-01-01",' +
      '  docProgress:{}, items:[{ namaBarang:"BEAD RING P235/50R17" }] }' +
    ']');
    w.renderTaskQueue();
    const baris = w.document.querySelector("#ovTasks .task");
    if (!baris.querySelector(".task-party")) throw new Error("tingkat 1 (perusahaan) hilang");
    if (!baris.querySelector(".task-detail")) throw new Error("tingkat 2 (keterangan) hilang");
    const barang = baris.querySelector(".task-goods");
    if (!barang) throw new Error("tingkat 3 (nama barang) hilang");
    eq(barang.textContent.trim(), "BEAD RING P235/50R17");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
  }
});
t("label nomor mengikuti MODA: HAWB untuk udara, HBL untuk laut", () => {
  /* Kiriman udara memakai House Air Waybill -- menyebutnya HBL membuat
     nomornya dicari di sistem yang salah saat menghubungi forwarder. */
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  try {
    w.eval("data." + mode + ' = [' +
      '{ id:"u1", status:"process", party:"UDARA", eta:"2020-01-01", transport:"udara",' +
      '  houseBL:"SRE453566", docProgress:{}, items:[] }' +
    ']');
    w.renderTaskQueue();
    let teks = $("#ovTasks").textContent;
    if (!teks.includes("HAWB")) throw new Error("kiriman udara tidak berlabel HAWB");
    if (/\bHBL\b/.test(teks)) throw new Error("kiriman udara masih berlabel HBL");

    w.eval("data." + mode + ' = [' +
      '{ id:"l1", status:"process", party:"LAUT", eta:"2020-01-01", transport:"laut",' +
      '  houseBL:"FGLQS2609001", docProgress:{}, items:[] }' +
    ']');
    w.renderTaskQueue();
    teks = $("#ovTasks").textContent;
    if (!teks.includes("HBL")) throw new Error("kiriman laut tidak berlabel HBL");
    if (teks.includes("HAWB")) throw new Error("kiriman laut malah berlabel HAWB");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
  }
});
t("daftar tugas berhalaman, bukan dipotong dengan \"+N lagi\"", () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  try {
    const banyak = Array.from({ length: 20 }, (_, i) =>
      `{ id:"p${i}", status:"process", party:"PT ${i}", eta:"2020-01-01", docProgress:{}, items:[] }`);
    w.eval("data." + mode + " = [" + banyak.join(",") + "]");
    w.eval("ovTaskPage = 1");
    w.renderTaskQueue();
    if ($("#ovTasks").textContent.includes("lagi — buka daftar lengkapnya"))
      throw new Error('masih memakai potongan "+N lagi"');
    const pager = w.document.querySelector("#ovTasks .task-pager");
    if (!pager) throw new Error("pengatur halaman tidak ada");
    const halaman1 = [...w.document.querySelectorAll("#ovTasks .task-party")].map((e) => e.textContent);
    pager.querySelector('[data-ov-task-page="2"]').click();
    const halaman2 = [...w.document.querySelectorAll("#ovTasks .task-party")].map((e) => e.textContent);
    if (halaman1[0] === halaman2[0]) throw new Error("isinya tidak berpindah halaman");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    w.eval("ovTaskPage = 1");
  }
});
t("klik baris yang punya House B/L menyaring daftar ke nomor itu", () => {
  const simpanCari = $("#searchInput").value;
  try {
    w.jumpToSearch("PRI029922");
    eq($("#searchInput").value, "PRI029922", "kata kunci terpasang:");
    eq($("#filterStatus").value, "", "saringan status dilepas:");
    eq($("#filterDateFrom").value, "", "rentang tanggal dilepas:");
  } finally {
    $("#searchInput").value = simpanCari;
    w.syncSearchClear();
  }
});
t("nomor House B/L memang tercakup pencarian -- kalau tidak, hasilnya nol kartu", () => {
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  const simpanCari = $("#searchInput").value;
  try {
    w.eval("data." + mode + ' = [' +
      '{ id:"h1", party:"A", houseBL:"PRI029922", status:"process", items:[] },' +
      '{ id:"h2", party:"B", houseBL:"LAIN123", status:"process", items:[] }' +
    ']');
    w.jumpToSearch("PRI029922");
    eq(w.getFiltered().map((x) => x.id).join(","), "h1");
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    $("#searchInput").value = simpanCari;
    w.syncSearchClear();
  }
});
t("nomor House B/L ikut tampil di baris Perlu Tindakan kalau ada", () => {
  const modeAwal = baca("activeMode");
  const simpan = baca("data")[modeAwal];
  try {
    w.eval('data.' + modeAwal + ' = [' +
      '{ id:"t1", status:"process", party:"SHENG GUANG", eta:"2020-01-01",' +
      '  houseBL:"PRI029922", docNo:"320146", docProgress:{}, items:[] }' +
    ']');
    w.renderTaskQueue();
    const teks = $("#ovTasks").textContent;
    if (!teks.includes("PRI029922")) throw new Error("House B/L tidak tampil");
  } finally {
    w.eval("data." + modeAwal + " = " + JSON.stringify(simpan || []));
  }
});
t("tanpa House B/L, barisnya TIDAK menambah pemisah kosong", () => {
  const modeAwal = baca("activeMode");
  const simpan = baca("data")[modeAwal];
  try {
    w.eval('data.' + modeAwal + ' = [' +
      '{ id:"t2", status:"process", party:"PT TANPA NOMOR", eta:"2020-01-01",' +
      '  docNo:"320147", docProgress:{}, items:[] }' +
    ']');
    w.renderTaskQueue();
    if ($("#ovTasks").textContent.includes("HBL"))
      throw new Error('label "HBL" muncul padahal nomornya kosong');
  } finally {
    w.eval("data." + modeAwal + " = " + JSON.stringify(simpan || []));
  }
});

console.log("\u2014 DUA BAHASA: INDONESIA & INGGRIS \u2014");
t("kedua kamus punya kunci yang SAMA -- tidak ada yang tertinggal separuh", () => {
  /* Kunci yang cuma ada di satu sisi diam-diam jatuh ke bahasa
     Indonesia, jadi layar berbahasa Inggris tercampur tanpa ada yang
     menyadari. */
  const id = Object.keys(baca("I18N").id).sort();
  const en = Object.keys(baca("I18N").en).sort();
  const kurangEn = id.filter((k) => !en.includes(k));
  const kurangId = en.filter((k) => !id.includes(k));
  if (kurangEn.length) throw new Error("belum ada di EN: " + kurangEn.join(", "));
  if (kurangId.length) throw new Error("belum ada di ID: " + kurangId.join(", "));
});
t("tiap data-i18n di HTML punya kuncinya di kamus", () => {
  const kamus = baca("I18N").id;
  const hilang = [...w.document.querySelectorAll("[data-i18n]")]
    .map((el) => el.dataset.i18n)
    .filter((k) => !(k in kamus));
  if (hilang.length) throw new Error("kunci tidak ada di kamus: " + [...new Set(hilang)].join(", "));
});
t("placeholder & title ber-i18n juga punya kuncinya", () => {
  const kamus = baca("I18N").id;
  const hilang = [];
  w.document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    if (!(el.dataset.i18nPh in kamus)) hilang.push(el.dataset.i18nPh);
  });
  w.document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    if (!(el.dataset.i18nTitle in kamus)) hilang.push(el.dataset.i18nTitle);
  });
  if (hilang.length) throw new Error("kunci tidak ada di kamus: " + [...new Set(hilang)].join(", "));
});
t("kunci yang belum diterjemahkan jatuh ke Indonesia, bukan jadi kosong", () => {
  /* Layar kosong tanpa petunjuk jauh lebih sulit dilacak daripada
     kalimat yang kebetulan masih berbahasa Indonesia. */
  const simpan = baca("activeLang");
  try {
    w.eval('activeLang = "en"');
    eq(w.t("nav.schedule"), "Schedule", "yang sudah diterjemahkan:");
    if (!w.t("hscode.add.help")) throw new Error("kunci yang ada malah kosong");
    eq(w.t("kunci.yang.tidak.ada"), "kunci.yang.tidak.ada",
      "kunci asing dikembalikan apa adanya supaya ketahuan:");
  } finally {
    w.eval('activeLang = ' + JSON.stringify(simpan));
  }
});
t("mengganti bahasa menukar teks di layar, bukan cuma menyimpan pilihannya", () => {
  const simpan = baca("activeLang");
  const el = w.document.querySelector('[data-i18n="nav.schedule"]');
  try {
    w.setLang("en");
    eq(el.textContent, "Schedule", "sesudah pindah ke EN:");
    w.setLang("id");
    eq(el.textContent, "Jadwal", "kembali ke ID:");
  } finally {
    w.setLang(simpan);
  }
});
t("kamus dimuat PALING AWAL, sebelum berkas lain yang memanggil t()", () => {
  /* Beberapa berkas memanggil t() saat dimuat (mis. label rute di
     prediction-config.js). Kalau kamusnya belum ada, berkas itu gagal
     dimuat seluruhnya -- bukan cuma labelnya yang salah. Urutan ini
     yang mencegahnya, dan uji mesin harus memakai urutan yang sama
     supaya masalahnya ketahuan di sini, bukan di browser. */
  const fs = require("fs"), path = require("path");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const skrip = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  eq(skrip[0], "js/core/i18n.js", "skrip pertama di index.html:");
  const eng = fs.readFileSync(path.join(__dirname, "engine-test.js"), "utf8");
  const daftar = [...eng.matchAll(/"(js\/[^"]+\.js)"/g)].map((m) => m[1]);
  eq(daftar[0], "js/core/i18n.js", "berkas pertama di uji mesin:");
});
t("SEMUA kunci yang dipakai t() ada di kamus", () => {
  /* Kunci yang tidak terdaftar dikembalikan apa adanya oleh t(), jadi
     yang muncul di layar adalah "f.rute" -- bukan kesalahan yang
     melempar error, cuma teks aneh yang gampang lolos. */
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "js");
  const berkas = [];
  (function sapu(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const full = path.join(d, e.name);
      if (e.isDirectory()) return sapu(full);
      if (e.name.endsWith(".js")) berkas.push(full);
    });
  })(dir);
  const kamus = baca("I18N").id;
  const hilang = new Set();
  berkas.forEach((f) => {
    /* Komentar dibuang dulu: contoh pemakaian di dalamnya (t("kunci"))
       bukan panggilan sungguhan. */
    const src = fs
      .readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    [...src.matchAll(/(?<![\w.])t\("([\w.]+)"/g)].forEach((m) => {
      if (!(m[1] in kamus)) hilang.add(m[1]);
    });
  });
  if (hilang.size) throw new Error("kunci tidak terdaftar: " + [...hilang].join(", "));
});
t("tidak ada kunci kamus yang menganggur", () => {
  /* Kunci yatim biasanya sisa dari teks yang diubah -- penanda bahwa
     ada pesan yang seharusnya sudah ikut kamus tapi masih ditulis
     langsung di kode. */
  const fs = require("fs"), path = require("path");
  const kamus = Object.keys(baca("I18N").id);
  let pakai = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const dir = path.join(__dirname, "..", "js");
  (function sapu(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const full = path.join(d, e.name);
      if (e.isDirectory()) return sapu(full);
      /* i18n.js DILEWATI: kamusnya sendiri memuat setiap kunci, jadi
         kalau ikut dihitung tidak akan pernah ada kunci yang terbaca
         menganggur -- tesnya lolos tanpa memeriksa apa pun. */
      if (e.name.endsWith(".js") && e.name !== "i18n.js") {
        pakai += fs.readFileSync(full, "utf8");
      }
    });
  })(dir);
  /* Komentar dibuang: kunci yang cuma disebut di komentar bukan
     pemakaian -- justru penanda teks yang masih ditulis langsung. */
  const kode = pakai.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const yatim = kamus.filter((k) => !kode.includes('"' + k + '"'));
  if (yatim.length) throw new Error("kunci menganggur: " + yatim.join(", "));
});
t("gulir ke atas daftar menyasar elemen yang BENAR-BENAR ada", () => {
  /* Dijaga `if (el)`, jadi sasaran yang salah tidak melempar error --
     pindah halaman sekadar diam di posisi gulir lama dan baris pertama
     berada di luar layar. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "render", "list.js"), "utf8");
  const m = /function scrollToListTop\(\)[\s\S]*?\$\("([.#][\w-]+)"\)/.exec(src);
  if (!m) throw new Error("scrollToListTop tidak ditemukan");
  if (!w.document.querySelector(m[1]))
    throw new Error("sasaran " + m[1] + " tidak ada di halaman");
});
t("label halaman form ikut berganti bahasa", () => {
  const simpan = baca("activeLang");
  try {
    w.setLang("en");
    const cek = (kunci, harap) => {
      const el = w.document.querySelector(`[data-i18n="${kunci}"]`);
      if (!el) throw new Error("elemen " + kunci + " tidak ada");
      eq(el.textContent.trim(), harap, kunci + ":");
    };
    cek("f.nilai.pabean.rp", "Customs Value (Rp)");
    cek("u.batal", "Cancel");
    cek("u.unduh.excel", "Download Excel");
    w.setLang("id");
    cek("f.nilai.pabean.rp", "Nilai Pabean (Rp)");
  } finally {
    w.setLang(simpan);
  }
});
t("label yang bergantung MODA tidak ditandai data-i18n -- ditulis dari JS", () => {
  /* Menandainya justru akan menimpanya dengan teks generik yang tidak
     sadar moda (Vessel vs Voyager, Pelabuhan vs Terminal). */
  ["lblVesselText", "lblVoyageText", "lblOrigin"].forEach((id) => {
    const el = w.document.getElementById(id);
    if (el && el.hasAttribute("data-i18n"))
      throw new Error("#" + id + " ditandai data-i18n -- label sadar-moda akan tertimpa");
  });
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "core", "i18n.js"), "utf8");
  if (!/applyTransportLabels/.test(src))
    throw new Error("setLang tidak menyegarkan label sadar-moda");
});
t("awalan \"Nama\" pada label sarana ikut berganti bahasa", () => {
  const simpan = baca("activeLang");
  try {
    w.eval('activeLang = "id"');
    eq(w.t("c.nama.sarana", { x: "Vessel" }), "Nama Vessel");
    w.eval('activeLang = "en"');
    eq(w.t("c.nama.sarana", { x: "Vessel" }), "Vessel Name");
  } finally {
    w.eval("activeLang = " + JSON.stringify(simpan));
  }
});
t("label rute bawaan ikut berganti bahasa, tidak membeku saat berkas dimuat", () => {
  /* Objek literal TINGKAT-TERATAS dinilai sekali saat berkas dimuat --
     t() di dalamnya akan membeku pada bahasa saat itu. Pola yang benar
     adalah getter; ini yang memastikannya benar-benar dipakai.
     (Objek yang dibuat DI DALAM fungsi tidak punya masalah ini: ia
     dinilai ulang tiap dipanggil.) */
  const simpan = baca("activeLang");
  try {
    const cari = () =>
      w.eval('PREDICTION_CONFIG.routes.find((r) => r.id === "default").label');
    w.eval('activeLang = "id"');
    eq(cari(), "Bawaan (rute belum terdaftar)", "ID:");
    w.eval('activeLang = "en"');
    eq(cari(), "Default (route not registered)", "EN, dari objek yang sama:");
  } finally {
    w.eval("activeLang = " + JSON.stringify(simpan));
  }
});
t("i18n.js tetap bisa dimuat tanpa DOM (dipakai uji mesin)", () => {
  /* Berkas lain memanggil t() saat dimuat, jadi uji mesin harus bisa
     memuat kamusnya walau tidak punya document. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "core", "i18n.js"), "utf8");
  if (!/typeof document !== "undefined"/.test(src))
    throw new Error("pengkabelan DOM tidak dijaga -- i18n.js gagal dimuat tanpa DOM");
});
t("label per-buku (MODE_LABELS) ikut berganti, tidak membeku di bahasa saat dimuat", () => {
  /* MODE_LABELS memanggil t() saat dibangun. Objek yang dinilai SEKALI
     saat berkas dimuat akan membeku pada bahasa saat itu -- mengganti
     bahasa tidak mengubah satu label pun sampai halaman dimuat ulang.
     Getter-nya yang mencegah itu. */
  const simpan = baca("activeLang");
  try {
    w.eval('activeLang = "id"');
    eq(w.eval("MODE_LABELS.import.party"), "Nama Shipper", "ID:");
    w.eval('activeLang = "en"');
    eq(w.eval("MODE_LABELS.import.party"), "Shipper Name", "EN, dari objek yang sama:");
  } finally {
    w.eval("activeLang = " + JSON.stringify(simpan));
  }
});
t("i18n.js dimuat SEBELUM config.js", () => {
  /* config.js membangun MODE_LABELS dengan t() di tingkat teratas --
     kalau kamusnya belum dimuat, berkasnya gagal dan seluruh aplikasi
     ikut mati, bukan cuma terjemahannya. */
  const html = require("fs").readFileSync(
    require("path").join(__dirname, "..", "index.html"), "utf8");
  const iI18n = html.indexOf('js/core/i18n.js');
  const iCfg = html.indexOf('js/config.js');
  if (iI18n < 0 || iCfg < 0) throw new Error("salah satu berkas tidak dimuat");
  if (iI18n > iCfg) throw new Error("i18n.js dimuat setelah config.js");
});
t("label kolom & isian di HTML ikut berganti bahasa", () => {
  const simpan = baca("activeLang");
  try {
    w.setLang("en");
    const th = [...w.document.querySelectorAll("th")].map((e) => e.textContent.trim());
    if (!th.includes("Item Name")) throw new Error('kolom "Nama Barang" tidak jadi "Item Name"');
    if (th.includes("Nama Barang")) throw new Error("masih ada kolom berbahasa Indonesia");
    w.setLang("id");
    const th2 = [...w.document.querySelectorAll("th")].map((e) => e.textContent.trim());
    if (!th2.includes("Nama Barang")) throw new Error("tidak kembali ke bahasa Indonesia");
  } finally {
    w.setLang(simpan);
  }
});
t("istilah kepabeanan TIDAK ikut diterjemahkan", () => {
  /* HS Code, CIF, FOB, NDPBM, PPN, PPH, SPPB, AJU dipakai apa adanya
     di dokumen kepabeanan yang dipegang pengguna -- menerjemahkannya
     justru membuat layar tidak lagi cocok dengan dokumennya. */
  const id = baca("I18N").id;
  const en = baca("I18N").en;
  Object.keys(id).forEach((k) => {
    const cocok = /HS Code|NDPBM|SPPB|PPN|PPH|\bCIF\b|\bFOB\b|\bAJU\b|\bPDRI\b/.exec(id[k]);
    if (cocok && en[k] && !en[k].includes(cocok[0])) {
      throw new Error(`istilah "${cocok[0]}" hilang dari terjemahan EN pada kunci ${k}`);
    }
  });
});
t("pemilih bahasa ada di LAYAR MASUK, bukan cuma di menu akun", () => {
  /* Dipilih sebelum melihat isi aplikasi -- bukan setelah terlanjur
     membaca yang tidak dimengerti. */
  const diLogin = w.document.querySelectorAll("#viewLogin [data-lang-pick]");
  if (diLogin.length < 2) throw new Error("pemilih bahasa tidak ada di layar masuk");
  const diMenu = w.document.querySelectorAll("#userMenu [data-lang-pick]");
  if (diMenu.length < 2) throw new Error("pemilih bahasa hilang dari menu akun");
});
t("tombol bahasa yang sedang aktif ditandai", () => {
  const simpan = baca("activeLang");
  try {
    w.setLang("en");
    const aktif = [...w.document.querySelectorAll('[data-lang-pick="en"]')];
    if (!aktif.length || !aktif.every((b) => b.classList.contains("active")))
      throw new Error("tombol EN tidak ditandai aktif");
    const nonaktif = [...w.document.querySelectorAll('[data-lang-pick="id"]')];
    if (nonaktif.some((b) => b.classList.contains("active")))
      throw new Error("tombol ID masih ditandai aktif");
  } finally {
    w.setLang(simpan);
  }
});

console.log("\u2014 HALAMAN HS CODE: URUTAN & HALAMAN \u2014");
function pakaiHsCodeHalaman(jumlah, jalankan) {
  const simpanRows = baca("hsCodeRows");
  const simpanCari = $("#hsCodeSearch").value;
  const data = Array.from({ length: jumlah }, (_, i) => ({
    id: "h" + i,
    // Sengaja TIDAK urut abjad supaya pengurutannya benar-benar diuji.
    item_name: "Barang " + String(jumlah - i).padStart(3, "0"),
    hs_code: String(9000 - i),
    created_at: "2026-01-" + String((i % 28) + 1).padStart(2, "0"),
  }));
  try {
    w.eval("hsCodeRows = " + JSON.stringify(data));
    $("#hsCodeSearch").value = "";
    w.eval("hsCodePage = 1");
    jalankan();
  } finally {
    w.eval("hsCodeRows = " + JSON.stringify(simpanRows || []));
    $("#hsCodeSearch").value = simpanCari;
    w.eval("hsCodePage = 1");
    w.renderHsCodes();
  }
}
function namaHsTampil() {
  return [...w.document.querySelectorAll("#hsCodeList .hscode-name")].map((el) => el.textContent);
}
t("pengatur halaman HS Code tetap berjarak dari tepi panel (kelas tidak ditimpa)", () => {
  const simpan = w.eval("JSON.stringify(hsCodeRows)");
  try {
    w.eval(`hsCodeRows = Array.from({ length: 3 }, (_, i) => ({ id: "p" + i, item_name: "B" + i, hs_code: "1234567" + i, notes: "" }))`);
    w.renderHsCodes();
    const bar = w.document.getElementById("hsCodePagination");
    if (!bar.classList.contains("pagination-bar") || !bar.classList.contains("hs-halaman"))
      throw new Error("kelas pemberi jarak hilang: " + bar.className);
  } finally {
    w.eval("hsCodeRows = " + simpan + "; renderHsCodes()");
  }
});
t("mode Inggris: teks yang dulu terlewat kini ikut diterjemahkan", () => {
  const simpan = baca("activeLang");
  try {
    w.setLang("en");
    w.showPrompt({ fields: [] });
    eq(w.document.getElementById("promptTitle").textContent, "Input", "judul dialog bawaan:");
    eq(baca("LABEL_KOLOM_TIBA").etdUpdate, "Revised ETD", "label ETD revisi:");
    const strip = w.delayStripHtml({ id: "x", status: "delayed", etd: "2026-09-01", eta: "2026-09-10" });
    if (!/Delay Update Dates/.test(strip) || !/Updated ETD/.test(strip)) throw new Error("strip Delay masih Indonesia");
    if (/Berangkat|Tanggal Update/.test(strip)) throw new Error("sisa teks Indonesia di strip Delay");
    w.setLang("id");
    eq(baca("LABEL_KOLOM_TIBA").etdUpdate, "ETD revisi", "kembali ke Indonesia:");
  } finally {
    w.setLang(simpan);
    w.eval("bootstrap.Modal.getOrCreateInstance(document.getElementById('promptModal')).hide()");
  }
});
t("halaman HS Code: satu panel -- Tambah di bilah ATAS, bukan kartu terpisah di bawah daftar", () => {
  const panel = w.document.querySelector("#viewHsCode .hs-panel");
  if (!panel) throw new Error("panel HS Code tidak ada");
  const bilah = panel.querySelector(".hs-bar");
  ["#btnHsCodeAdd", "#hsCodeSearch", "#btnHsCodeRefresh"].forEach((id) => {
    if (!bilah.querySelector(id)) throw new Error(id + " tidak di bilah atas");
  });
  // Bilah atas mendahului daftar -- di ponsel terlihat tanpa menggulir.
  const urutan = [...panel.querySelectorAll(".hs-bar, #hsCodeList")].map((el) => el.className || el.id);
  eq(urutan[0], "panel-head hs-bar", "bilah atas lebih dulu:");
  if (w.document.getElementById("hsCodeAddPanel")) throw new Error("kartu Tambah lama masih ada");
  const css = require("fs").readFileSync(require("path").join(__dirname, "..", "css", "auth.css"), "utf8");
  if (!/body\.is-viewer #btnHsCodeAdd,\s*\n\s*body\.is-viewer \.hs-kol-aksi,/.test(css))
    throw new Error("tombol Tambah / kolom aksi tidak disembunyikan untuk viewer & marketing");
});
t("tabel HS Code: nama, kode (tombol salin), catatan, aksi", async () => {
  const simpan = w.eval("JSON.stringify(hsCodeRows)");
  const salinAsli = w.navigator.clipboard;
  let tersalin = null;
  try {
    w.eval(`hsCodeRows = [{ id: "a", item_name: "BAR GAUGE", hs_code: "90318090", notes: "Alat ukur tapak" },
      { id: "b", item_name: "CLAY", hs_code: "34070010", notes: "" }]`);
    w.renderHsCodes();
    const kepala = [...w.document.querySelectorAll("#hsCodeList thead th")].map((th) => th.textContent.trim());
    eq(kepala.slice(0, 3).join(" | "), "Nama Barang | HS Code | Catatan", "kolom:");
    const baris = w.document.querySelectorAll("#hsCodeList tbody tr");
    eq(baris[0].querySelector(".hs-kol-catatan").textContent.trim(), "Alat ukur tapak", "catatan tampil:");
    if (!baris[1].querySelector(".hs-kol-catatan").classList.contains("hs-tanpa-catatan")) throw new Error("catatan kosong tidak ditandai");
    Object.defineProperty(w.navigator, "clipboard", { configurable: true, value: { writeText: async (v) => { tersalin = v; } } });
    const tombol = baris[0].querySelector("[data-salin-hs]");
    if (!tombol.querySelector("i.bi-clipboard")) throw new Error("ikon salin tidak terlihat");
    eq(tombol.querySelector(".hscode-kode").textContent, "90318090", "kode di tombol:");
    tombol.click();
    await new Promise((r) => setTimeout(r, 20));
    eq(tersalin, "90318090", "tersalin:");
    if (!tombol.classList.contains("is-tersalin") || !tombol.querySelector("i.bi-clipboard-check"))
      throw new Error("tidak ada tanda berhasil di tombolnya");
  } finally {
    Object.defineProperty(w.navigator, "clipboard", { configurable: true, value: salinAsli });
    w.eval("hsCodeRows = " + simpan + "; renderHsCodes()");
  }
});
t("selalu urut Nama Barang A-Z, tanpa perlu memilih apa pun", () => {
  /* Tidak ada dropdown urutkan: satu urutan yang masuk akal dipakai
     terus, jadi tidak ada kendali tambahan yang harus diatur pengguna. */
  if ($("#hsCodeSort")) throw new Error("dropdown urutkan masih ada");
  pakaiHsCodeHalaman(5, () => {
    w.renderHsCodes();
    const nama = namaHsTampil();
    eq(nama[0], "Barang 001", "teratas:");
    eq(nama[nama.length - 1], "Barang 005", "terbawah:");
  });
});
t("pengatur halaman memakai bentuk yang sama dengan daftar jadwal", () => {
  pakaiHsCodeHalaman(30, () => {
    w.renderHsCodes();
    const bar = $("#hsCodePagination");
    if (!bar.querySelector(".page-btn")) throw new Error("tidak ada tombol nomor halaman");
    if (!bar.querySelector(".page-nav")) throw new Error("tidak ada tombol maju/mundur");
    if (!bar.querySelector(".pagination-info")) throw new Error("tidak ada keterangan jumlah");
    if (!bar.querySelector("select")) throw new Error("tidak ada pemilih jumlah per halaman");
  });
});
t("daftar dipenggal per halaman", () => {
  pakaiHsCodeHalaman(30, () => {
    w.renderHsCodes();
    const perHalaman = namaHsTampil().length;
    if (perHalaman >= 30) throw new Error("daftar tidak dipenggal");
    if (perHalaman < 1) throw new Error("halaman pertama kosong");
  });
});
t("klik nomor halaman menampilkan potongan berikutnya", () => {
  pakaiHsCodeHalaman(30, () => {
    w.renderHsCodes();
    const halaman1 = namaHsTampil();
    const tombol2 = [...$("#hsCodePagination").querySelectorAll(".page-btn")]
      .find((b) => b.textContent.trim() === "2");
    if (!tombol2) throw new Error("tombol halaman 2 tidak ada");
    tombol2.click();
    const halaman2 = namaHsTampil();
    if (halaman1[0] === halaman2[0]) throw new Error("isinya tidak berpindah");
    eq(baca("hsCodePage"), 2);
  });
});
t("halaman dijepit ke jumlah yang ada, bukan menyisakan layar kosong", () => {
  pakaiHsCodeHalaman(30, () => {
    w.eval("hsCodePage = 3");
    w.renderHsCodes();
    w.eval("hsCodeRows = hsCodeRows.slice(0, 5)");
    w.renderHsCodes();
    eq(namaHsTampil().length, 5, "seluruh sisa data tetap terlihat:");
    eq(baca("hsCodePage"), 1, "halaman dijepit kembali:");
  });
});
t("mencari mengembalikan ke halaman 1", () => {
  pakaiHsCodeHalaman(30, () => {
    w.eval("hsCodePage = 2");
    w.renderHsCodes();
    $("#hsCodeSearch").dispatchEvent(new w.Event("input"));
    eq(baca("hsCodePage"), 1);
  });
});

console.log("\u2014 CARI HS CODE DARI DATABASE (TOMBOL KACA PEMBESAR) \u2014");
function pakaiHsCodeUji(daftar, jalankan) {
  const draftAwal = baca("draftItems");
  const hsAwal = baca("hsCodeRows");
  try {
    w.eval('draftItems = [{ namaBarang: "A", hsCode: "" }, { namaBarang: "B", hsCode: "" }]');
    w.renderItemTable();
    w.eval("hsCodeRows = " + JSON.stringify(daftar));
    jalankan();
  } finally {
    w.tutupHscodeLookup();
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.eval("hsCodeRows = " + JSON.stringify(hsAwal || []));
    w.renderItemTable();
  }
}
t("klik tombol kaca pembesar membuka popover, tertutup sebelumnya", () => {
  pakaiHsCodeUji([{ id: "1", item_name: "Sole Material", hs_code: "6404.19.00" }], () => {
    if (!$("#hscodeLookupPop").classList.contains("d-none"))
      throw new Error("popover seharusnya tertutup sebelum tombol diklik");
    $('[data-hscode-lookup="0"]').click();
    if ($("#hscodeLookupPop").classList.contains("d-none"))
      throw new Error("popover tidak terbuka setelah tombol diklik");
  });
});
t("hasil pencarian tersaring sesuai ketikan (cocok sebagian, tidak peka huruf besar/kecil)", () => {
  pakaiHsCodeUji([
    { id: "1", item_name: "Sole Material", hs_code: "6404.19.00" },
    { id: "2", item_name: "Packaging Box", hs_code: "4819.10.00" },
  ], () => {
    $('[data-hscode-lookup="0"]').click();
    $("#hscodeLookupInput").value = "sole";
    $("#hscodeLookupInput").dispatchEvent(new w.Event("input"));
    const hasil = w.document.querySelectorAll("#hscodeLookupResults [data-hscode-pick]");
    eq(hasil.length, 1);
    eq(hasil[0].dataset.hscodePick, "6404.19.00");
  });
});
t("pilih hasil -> HS Code terisi ke BARIS YANG BENAR (bukan baris lain), popover tertutup", () => {
  pakaiHsCodeUji([{ id: "1", item_name: "Sole Material", hs_code: "6404.19.00" }], () => {
    // Buka lookup untuk baris KEDUA (idx 1), bukan yang pertama.
    $('[data-hscode-lookup="1"]').click();
    $('[data-hscode-pick="6404.19.00"]').click();
    eq(baca("draftItems")[1].hsCode, "6404.19.00", "baris kedua:");
    eq(baca("draftItems")[0].hsCode, "", "baris pertama TIDAK ikut terisi:");
    if (!$("#hscodeLookupPop").classList.contains("d-none"))
      throw new Error("popover tidak ikut tertutup setelah memilih");
  });
});
t("database kosong -> pesan yang sesuai, bukan daftar kosong tanpa keterangan", () => {
  pakaiHsCodeUji([], () => {
    $('[data-hscode-lookup="0"]').click();
    if (!$("#hscodeLookupResults").textContent.includes("masih kosong"))
      throw new Error("tidak ada pesan database kosong");
  });
});
t("ketik kata yang tidak cocok apa pun -> pesan \"tidak ada yang cocok\"", () => {
  pakaiHsCodeUji([{ id: "1", item_name: "Sole Material", hs_code: "6404.19.00" }], () => {
    $('[data-hscode-lookup="0"]').click();
    $("#hscodeLookupInput").value = "xyz-tidak-ada";
    $("#hscodeLookupInput").dispatchEvent(new w.Event("input"));
    if (!$("#hscodeLookupResults").textContent.includes("Tidak ada yang cocok"))
      throw new Error("pesan tidak cocok tidak muncul");
  });
});
t("klik di luar popover menutupnya", () => {
  pakaiHsCodeUji([{ id: "1", item_name: "Sole Material", hs_code: "6404.19.00" }], () => {
    $('[data-hscode-lookup="0"]').click();
    $("body").click();
    if (!$("#hscodeLookupPop").classList.contains("d-none"))
      throw new Error("popover tidak tertutup setelah klik di luar");
  });
});
t("tombol tidak menyebabkan form tersubmit (preventDefault)", () => {
  /* Tombol ini hidup di dalam <table> yang ada di dalam <form> --
     tanpa type="button" atau preventDefault, klik semacam ini kadang
     memicu submit form di beberapa browser. */
  pakaiHsCodeUji([{ id: "1", item_name: "Sole Material", hs_code: "6404.19.00" }], () => {
    const tombol = $('[data-hscode-lookup="0"]');
    eq(tombol.getAttribute("type"), "button");
  });
});

console.log("\u2014 KOLOM SIZE (EXPORT SAJA), URAIAN = LABEL NAMA BARANG DI EXPORT \u2014");
t('header kolom pertama jadi "Uraian" di Export, "Nama Barang" di Import', () => {
  const modeAwal = baca("activeMode");
  try {
    tulis("activeMode", "export");
    w.renderItemTable();
    eq($("#thNamaBarang").textContent, "Uraian");
    tulis("activeMode", "import");
    w.renderItemTable();
    eq($("#thNamaBarang").textContent, "Nama Barang");
  } finally {
    tulis("activeMode", modeAwal);
    w.renderItemTable();
  }
});
t("kolom Size TERPISAH dari Nama Barang/Uraian -- bukan digabung jadi satu input", () => {
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang: "TYRE MOLD TREAD ONLY", size: "235/55R20" }]');
    w.renderItemTable();
    const uraian = w.document.querySelector("#itemTableBody textarea.nama-barang-input");
    const size = w.document.querySelector("#itemTableBody td.size-col input");
    eq(uraian.value, "TYRE MOLD TREAD ONLY");
    eq(size.value, "235/55R20");
    if (uraian === size) throw new Error("Uraian dan Size ternyata elemen yang sama");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.renderItemTable();
  }
});
t("SEMUA tempat yang menampilkan nama barang memakai pembangun yang sama", () => {
  /* Dulu ada empat tempat yang merakit namanya sendiri dengan aturan
     berbeda -- kartu, panel detail, surat jalan, dan ekspor Excel. Nama
     yang terlihat di layar jadi tidak sama dengan yang tersalin. */
  const fs = require("fs"), path = require("path");
  const berkas = [
    ["js", "views", "detail-view.js"],
    ["js", "features", "excel-row-format.js"],
    ["js", "features", "copy-templates.js"],
    ["js", "features", "surat-jalan-print.js"],
    ["js", "render", "cards.js"],
  ];
  const salah = [];
  berkas.forEach((bagian) => {
    const src = fs
      .readFileSync(path.join(__dirname, "..", ...bagian), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    /* Pemakaian untuk MENYARING (".filter(... it.namaBarang ...)")
       memang benar memakai nama mentah -- yang diperiksa cuma yang
       dipakai sebagai NILAI tampilan. */
    const pola = /(?:text|escapeHtml)\(\s*it\.namaBarang\s*\)|nama:\s*it\.namaBarang/g;
    const hit = src.match(pola);
    if (hit) salah.push(bagian.join("/") + ": " + hit.join(", "));
  });
  if (salah.length)
    throw new Error("masih memakai nama mentah: " + salah.join(" | "));
});
t("nomor cetakan & nomor PO bisa dicari", () => {
  /* Orang gudang menelusuri kiriman lewat nomor mold atau nomor PO,
     bukan cuma nama barangnya. */
  const mode = baca("activeMode");
  const simpan = baca("data")[mode];
  const simpanCari = $("#searchInput").value;
  try {
    w.eval("data." + mode + ' = [{ id:"m1", party:"PT A", status:"process", items:[' +
      '{ namaBarang:"TYRE MOLD FULL SET", size:"205/70R15", pattern:"CREDO",' +
      '  moldNo:"M-1201", poNo:"PO-998877" }] }]');
    ["M-1201", "PO-998877", "CREDO", "205/70R15"].forEach((kata) => {
      w.jumpToSearch(kata);
      eq(w.getFiltered().length, 1, "mencari " + kata + ":");
    });
  } finally {
    w.eval("data." + mode + " = " + JSON.stringify(simpan || []));
    $("#searchInput").value = simpanCari;
    w.syncSearchClear();
  }
});
t("kolom cetakan ikut tersimpan & terbaca kembali dari database", () => {
  /* Tanpa dipetakan, ketiganya terisi di layar tapi hilang begitu
     jadwalnya disimpan -- dan tidak ada pesan galat yang menunjukkan
     kemana perginya. */
  const it = {
    namaBarang: "TYRE MOLD", size: "205/70R15",
    pattern: "CREDO", moldNo: "M-1201", poNo: "PO-998877",
  };
  const baris = w.itemToRow(it, "s1");
  eq(baris.pattern, "CREDO", "pattern -> kolom:");
  eq(baris.mold_no, "M-1201", "moldNo -> kolom:");
  eq(baris.po_no, "PO-998877", "poNo -> kolom:");

  const balik = w.rowToItem(baris);
  eq(balik.pattern, "CREDO", "kolom -> pattern:");
  eq(balik.moldNo, "M-1201", "kolom -> moldNo:");
  eq(balik.poNo, "PO-998877", "kolom -> poNo:");
});
t("migrasi SQL untuk kolom cetakan disertakan", () => {
  /* Kolom baru tanpa migrasinya membuat SELURUH penyimpanan jadwal
     gagal, bukan cuma kolom itu -- Supabase menolak kolom asing. */
  const fs = require("fs"), path = require("path");
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "migration-add-mold-columns.sql"), "utf8");
  ["pattern", "mold_no", "po_no"].forEach((k) => {
    if (!new RegExp("ADD COLUMN IF NOT EXISTS " + k).test(sql))
      throw new Error("migrasi tidak menambah kolom " + k);
  });
});
t("nama barang dirakit dari Uraian + Pattern + Size + Mold No", () => {
  eq(
    w.itemDisplayName({
      namaBarang: "TYRE MOLD FULL SET", size: "205/70R15",
      pattern: "CREDO", moldNo: "M-1201",
    }),
    "TYRE MOLD FULL SET CREDO 205/70R15 M-1201",
  );
});
t("SATU urutan nama barang di seluruh aplikasi: Uraian + Pattern + Size + Mold No", () => {
  /* Kartu, panel detail, dan semua template salinan memakai perakit
     yang SAMA. Dua urutan yang berbeda pernah dicoba -- layar satu
     bentuk, salinan bentuk lain -- dan hasilnya nama di kartu tidak
     cocok dengan nama yang tersalin untuk pengiriman yang sama.

     Import tidak terpengaruh: Pattern/Size/Mold No hanya terisi di
     buku Export, jadi di Import hasilnya tetap Uraian saja. */
  const it = {
    namaBarang: "TYRE MOLD FULL SET", size: "205/70R15",
    pattern: "CREDO", moldNo: "M-1201", poNo: "PO-1",
    qty: 1, satuan: "SET", bruto: 100,
  };
  const harap = "TYRE MOLD FULL SET CREDO 205/70R15 M-1201";
  eq(w.itemDisplayName(it), harap, "perakit tunggal:");

  const s = {
    id: "s9", mode: "export", invoice: "INV-9", party: "PT Uji",
    etd: "2026-09-01", eta: "2026-09-10", items: [it],
  };
  const fmt = {
    text: (v) => String(v == null ? "" : v),
    num: (v) => String(v == null ? "" : v),
    date: (v) => String(v == null ? "" : v),
    blank: "",
  };
  const teks = (baris) => baris.map((k) => k.join(" ")).join("\n");
  ["buildAllExportCopyRows", "buildDailyExportCopyRows"].forEach((fn) => {
    if (!teks(w[fn](s, fmt)).includes(harap))
      throw new Error(fn + ": urutan nama barang tidak dipakai");
  });
  eq(w.reportItemSummary(s), harap, "Report:");

  /* Barang Import (tanpa Pattern/Size/Mold No) tetap Uraian saja. */
  eq(w.itemDisplayName({ namaBarang: "KAIN KATUN" }), "KAIN KATUN", "barang Import:");
});
t("PO No TIDAK ikut ke dalam nama barang", () => {
  /* Itu nomor pesanan pembeli, bukan identitas barangnya -- ikut
     menempel membuat dua kiriman barang yang sama terbaca berbeda. */
  const nama = w.itemDisplayName({
    namaBarang: "TYRE MOLD FULL SET", poNo: "PO-998877",
  });
  eq(nama, "TYRE MOLD FULL SET");
});
t("kolom kosong DILEWATI, bukan disambung dengan spasi berlebih", () => {
  /* "TYRE MOLD FULL SET   R17" terlihat seperti salah ketik, dan
     menyulitkan pencocokan teks saat ditempel ke Excel. */
  const nama = w.itemDisplayName({
    namaBarang: "TYRE MOLD FULL SET", size: "", pattern: "", moldNo: "M-1201",
  });
  eq(nama, "TYRE MOLD FULL SET M-1201");
  if (/\s{2,}/.test(nama)) throw new Error("ada spasi ganda");
  eq(w.itemDisplayName({}), "", "barang kosong tidak menghasilkan spasi:");
});
t("kartu & copy template memakai pembangun nama yang SAMA", () => {
  /* Dulu copy template merakit namanya sendiri (nama + size saja),
     sehingga Pattern & Mold No yang tampil di kartu tidak ikut
     tersalin. */
  const it = {
    namaBarang: "TYRE MOLD FULL SET", size: "205/70R15",
    pattern: "CREDO", moldNo: "M-1201", poNo: "PO-1",
  };
  eq(w.namaBarangDenganSize(it), w.itemDisplayName(it));
  const ringkas = w.itemNamesSummary({ items: [it] });
  eq(ringkas[0], w.itemDisplayName(it), "kartu:");
});
t("barang baru memulai dengan kolom kosong, bukan \"undefined\"", () => {
  /* escapeAttr(undefined) menuliskan teks "undefined" di kotaknya. */
  const baru = w.newItem();
  ["size", "pattern", "moldNo", "poNo"].forEach((k) => {
    eq(baru[k], "", k + ":");
  });
});
t("kolom Size disembunyikan di Import lewat body.mode-import, TIDAK dihapus dari DOM", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  /* Komentar dibuang dulu: selektornya digabung dengan koma dan ada
     catatan di antaranya, yang memutus pencocokan pola. */
  const bersih = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const aturan = [...bersih.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => /display:\s*none/.test(m[2]))
    .map((m) => m[1].replace(/\s+/g, " "))
    .join(" | ");
  if (!/body\.mode-import \.size-col/.test(aturan))
    throw new Error("kolom Size tidak disembunyikan di buku Import");
  if (!/body\.mode-import \.export-col/.test(aturan))
    throw new Error("kolom Pattern/Mold No/PO No tidak disembunyikan di buku Import");
});
t("mengetik di kotak Size tersimpan ke draftItems[idx].size, TIDAK ikut mengubah namaBarang", () => {
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang: "TYRE MOLD" }]');
    w.renderItemTable();
    const size = w.document.querySelector("#itemTableBody td.size-col input");
    size.value = "195/65R15";
    size.dispatchEvent(new w.Event("input", { bubbles: true }));
    eq(baca("draftItems")[0].size, "195/65R15");
    eq(baca("draftItems")[0].namaBarang, "TYRE MOLD", "namaBarang tidak ikut berubah:");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.renderItemTable();
  }
});

t("isi sel tabel barang dipusatkan vertikal, tanpa sisa aturan top yang bertentangan", () => {
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const i = css.indexOf("table.item-table td {");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/vertical-align:\s*middle/.test(blok))
    throw new Error("sel tabel barang tidak dipusatkan vertikal");
  /* Satu saja sel yang masih vertical-align: top akan menonjol keluar
     barisan begitu tinggi barisnya berubah -- jadi tidak boleh ada
     sisa aturan lama di kolom mana pun. */
  const sisa = css.match(/table\.item-table[^{]*\{[^}]*vertical-align:\s*top[^}]*\}/g)
    || css.match(/td\.[a-z-]+\s*\{[^}]*vertical-align:\s*top[^}]*\}/g);
  if (sisa) throw new Error("masih ada sel tabel barang yang vertical-align: top -- " + sisa[0].slice(0, 60));
});

console.log("\u2014 KOLOM SERI BARANG (DINAMIS, DARI POSISI BARIS) \u2014");
t("Seri Barang = posisi baris (idx+1), bukan field tersimpan", () => {
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang: "A" }, { namaBarang: "B" }, { namaBarang: "C" }]');
    w.renderItemTable();
    const seri = [...w.document.querySelectorAll("#itemTableBody td.seri-col")].map((el) => el.textContent.trim());
    eq(seri.join(","), "1,2,3");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.renderItemTable();
  }
});
t("hapus barang di tengah -> nomor Seri sisanya ikut menyesuaikan (bukan menyisakan lubang)", () => {
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang: "A" }, { namaBarang: "B" }, { namaBarang: "C" }]');
    w.eval("draftItems.splice(1, 1)"); // buang "B" di tengah
    w.renderItemTable();
    const seri = [...w.document.querySelectorAll("#itemTableBody td.seri-col")].map((el) => el.textContent.trim());
    eq(seri.join(","), "1,2", "cuma 2 barang tersisa, harus 1 & 2 -- bukan 1 & 3:");
    const nama = [...w.document.querySelectorAll("#itemTableBody textarea.nama-barang-input")].map((el) => el.value);
    eq(nama.join(","), "A,C");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.renderItemTable();
  }
});
t("kolom Seri sama-sama muncul di buku Import maupun Export", () => {
  const modeAwal = baca("activeMode");
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang: "A" }]');
    tulis("activeMode", "import");
    w.renderItemTable();
    eq(w.document.querySelectorAll("#itemTableBody td.seri-col").length, 1, "Import:");
    tulis("activeMode", "export");
    w.renderItemTable();
    eq(w.document.querySelectorAll("#itemTableBody td.seri-col").length, 1, "Export:");
  } finally {
    tulis("activeMode", modeAwal);
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.renderItemTable();
  }
});
t("panel Fasilitas per barang tetap merentang penuh (colspan ikut bertambah 1)", () => {
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang: "A", _facOpen: true, skb: [] }]');
    w.renderItemTable();
    const panel = w.document.querySelector("#itemTableBody tr.item-fac-row td");
    eq(panel.getAttribute("colspan"), "15");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    w.renderItemTable();
  }
});

console.log("\u2014 KODE DOKUMEN MASTER vs HOUSE \u2014");
/* Daftar UN/EDIFACT 1001 yang dipakai BC 2.0:
     704 Master B/L · 741 Master AWB · 705 B/L · 740 AWB
   Sebelumnya master memakai 740/742 dan house 741/743 — terbalik untuk
   udara, karena 741 justru MASTER AWB. */
function wbDokumenPalsu(baris) {
  return { SheetNames: ["HEADER", "DOKUMEN"], Sheets: { HEADER: {}, DOKUMEN: {} },
    __rows: baris };
}
t("704 & 741 masuk ke masterBL, 705 & 740 ke houseBL", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "import", "excel-bc.js"), "utf8");
  const m = /masterBL:\s*findDokumen\(([^)]*)\)/.exec(src);
  const h = /houseBL:\s*findDokumen\(([^)]*)\)/.exec(src);
  if (!m || !h) throw new Error("masterBL/houseBL tidak ditemukan");
  eq(m[1].replace(/[\s"]/g, ""), "704,741", "masterBL:");
  eq(h[1].replace(/[\s"]/g, ""), "705,740", "houseBL:");
});
t("741 TIDAK lagi dipakai sebagai house — itu Master AWB", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "import", "excel-bc.js"), "utf8");
  if (/houseBL:\s*findDokumen\([^)]*"741"/.test(src))
    throw new Error("741 (Master AWB) masih dipetakan ke houseBL");
  if (/masterBL:\s*findDokumen\([^)]*"740"/.test(src))
    throw new Error("740 (AWB house) masih dipetakan ke masterBL");
});
t("pesan peringatan menyebut kode yang benar-benar dicari", () => {
  /* Pesan yang menyebut kode lain menyesatkan orang yang mengeceknya
     ke sheet DOKUMEN. */
  /* Pesannya kini ada di kamus, bukan ditulis langsung di excel-bc.js
     -- dan KEDUA bahasa harus menyebut kode yang sama. Terjemahan yang
     menghilangkan kodenya sama menyesatkannya dengan kode yang salah. */
  const kunci = Object.keys(baca("I18N").id).find((k) =>
    /^w\.master\.house\.bl\.awb\.tidak\.ditemukan/.test(k));
  if (!kunci) throw new Error("pesan peringatan tidak ada di kamus");
  ["id", "en"].forEach((lang) => {
    const pesan = baca("I18N")[lang][kunci];
    if (!pesan) throw new Error("pesan hilang di kamus " + lang);
    ["704", "741", "705", "740"].forEach((k) => {
      if (pesan.indexOf(k) < 0)
        throw new Error(lang + ": pesan tidak menyebut kode " + k);
    });
    ["742", "743"].forEach((k) => {
      if (pesan.indexOf(k) >= 0)
        throw new Error(lang + ": pesan masih menyebut kode lama " + k);
    });
  });
});

console.log("\u2014 IMPOR EXCEL CEISA: CADANGAN RUMUS BM/PPN/PPH SAAT BARANGTARIF KOSONG \u2014");
t("BARANGTARIF kosong (Import): dihitung dari Nilai Pabean = (CIF+Freight+Asuransi)\u00d7NDPBM", () => {
  /* Angka acuannya PERSIS dari berkas CEISA sungguhan yang diuji
     manual: CIF 3400, Freight 444.88, Asuransi 19.22, NDPBM 17722 ->
     Nilai Pabean 68.479.580,2 (cocok dengan kolom "CIF RUPIAH" yang
     sudah dihitung CEISA sendiri di berkas itu). */
  const header = { "KODE JENIS IMPOR": "1", "CIF": 3400, "FREIGHT": 444.88,
    "ASURANSI": 19.22, "NDPBM": 17722 };
  const r = panggilParseBc(header, [barangRowPalsu()], []);
  const nilaiPabean = 68479580.2;
  eq(r.fields.bm, w.roundNum(nilaiPabean * 0.05, 2), "BM (5%):");
  eq(r.fields.pph, w.roundNum(nilaiPabean * 0.025, 2), "PPH (2,5%):");
  eq(r.fields.ppn, w.roundNum((nilaiPabean + r.fields.bm) * 0.11, 2), "PPN ((Pabean+BM)\u00d711%):");
});
t("BARANGTARIF ADA datanya -> dipakai apa adanya, TIDAK dihitung ulang dari rumus", () => {
  const header = { "KODE JENIS IMPOR": "1", "CIF": 3400, "FREIGHT": 444.88,
    "ASURANSI": 19.22, "NDPBM": 17722 };
  const barangTarif = [
    { "KODE PUNGUTAN": "PPN", "NILAI BAYAR": 7532753 },
    { "KODE PUNGUTAN": "BM", "NILAI BAYAR": 0 },
    { "KODE PUNGUTAN": "PPH", "NILAI BAYAR": 0 },
  ];
  const r = panggilParseBc(header, [barangRowPalsu()], barangTarif);
  eq(r.fields.bm, 0);
  eq(r.fields.ppn, 7532753);
  eq(r.fields.pph, 0);
  if (r.notes.some((n) => n.includes("dihitung otomatis")))
    throw new Error("seharusnya tidak ada catatan 'dihitung otomatis' -- datanya ADA di BARANGTARIF");
});
t("cuma SATU jenis pungutan yang kosong -> cuma itu yang dihitung, dua lainnya tetap apa adanya", () => {
  const header = { "KODE JENIS IMPOR": "1", "CIF": 3400, "FREIGHT": 444.88,
    "ASURANSI": 19.22, "NDPBM": 17722 };
  const barangTarif = [
    { "KODE PUNGUTAN": "PPN", "NILAI BAYAR": 999999 },
    { "KODE PUNGUTAN": "PPH", "NILAI BAYAR": 888888 },
  ];
  const r = panggilParseBc(header, [barangRowPalsu()], barangTarif);
  eq(r.fields.ppn, 999999, "PPN apa adanya (bukan dihitung ulang):");
  eq(r.fields.pph, 888888, "PPH apa adanya (bukan dihitung ulang):");
  if (r.fields.bm == null) throw new Error("BM seharusnya dihitung dari rumus, bukan null");
});
t("Export, BARANGTARIF kosong -> TETAP null, TANPA catatan (memang tidak berlaku untuk Export)", () => {
  const r = panggilParseBc(
    { "KODE JENIS EKSPOR": "1", "FOB": 1000, "NDPBM": 17000 },
    [barangRowPalsu({ FOB: 1000 })], []);
  eq(r.fields.bm, null);
  eq(r.fields.ppn, null);
  eq(r.fields.pph, null);
  if (r.notes.some((n) => /Bea Masuk|Pabean/.test(n)))
    throw new Error("Export tidak seharusnya dapat catatan BM/PPN/PPH sama sekali");
});
t("Import tanpa BARANGTARIF maupun CIF/Freight/Asuransi/NDPBM -> tetap null + pesan isi manual", () => {
  const r = panggilParseBc({ "KODE JENIS IMPOR": "1" }, [barangRowPalsu()], []);
  eq(r.fields.bm, null);
  eq(r.fields.ppn, null);
  eq(r.fields.pph, null);
  if (!r.notes.some((n) => n.includes("isi manual di tab Kepabeanan")))
    throw new Error("tidak ada pesan 'isi manual' padahal rumus juga tidak bisa dihitung");
});

console.log("\u2014 TOTAL PACKAGE OTOMATIS: EXPORT SEKARANG SAMA SEPERTI IMPORT \u2014");
t("Export: #fPackage ikut terjumlah otomatis dari kolom Kemasan tiap barang (dulu manual)", () => {
  const modeAwal = baca("activeMode");
  const draftAwal = baca("draftItems");
  const fPackageAwal = $("#fPackage").value;
  try {
    tulis("activeMode", "export");
    w.eval('draftItems = [' +
      '{ packing: "3", packingUnit: "BOX", qty: 1, harga: 1 },' +
      '{ packing: "1", packingUnit: "PALLET", qty: 1, harga: 1 }' +
    ']');
    w.recalcCustoms();
    eq($("#fPackage").value, "3 BOX · 1 PALLET");
  } finally {
    tulis("activeMode", modeAwal);
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    $("#fPackage").value = fPackageAwal;
  }
});
t("Import: perilaku lama tidak berubah (masih otomatis seperti sebelumnya)", () => {
  const modeAwal = baca("activeMode");
  const draftAwal = baca("draftItems");
  const fPackageAwal = $("#fPackage").value;
  try {
    tulis("activeMode", "import");
    w.eval('draftItems = [{ packing: "5", packingUnit: "BOX", qty: 1, harga: 1 }]');
    w.recalcCustoms();
    eq($("#fPackage").value, "5 BOX");
  } finally {
    tulis("activeMode", modeAwal);
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    $("#fPackage").value = fPackageAwal;
  }
});

console.log("\u2014 IMPOR EXCEL CEISA: NAMA BARANG TIDAK DIPECAH \u2014");
t("Export: seluruh deskripsi masuk ke Uraian; Size/Pattern/Mold No dibiarkan kosong", () => {
  /* TIPE di berkas CEISA memuat model DAN ukuran sekaligus, dan tidak
     ada aturan yang bisa memisahnya. Dulu TIPE dipakai sebagai Size --
     hasilnya Size terisi setengah benar, dan yang setengah salah itu
     ikut ke nama barang di kartu, CIPL, dan template salinan. */
  const barang = [barangRowPalsu({
    "URAIAN": "TYRE MOLD TREAD ONLY", "MEREK": "-", "TIPE": "MAGNETAR A/T 235/55R20",
  })];
  const r = panggilParseBc({ "KODE JENIS EKSPOR": "1", "KODE INCOTERM": "FOB" }, barang);
  eq(r.items[0].namaBarang, "TYRE MOLD TREAD ONLY MAGNETAR A/T 235/55R20");
  eq(r.items[0].size, "", "Size:");
  eq(r.items[0].pattern, "", "Pattern:");
  eq(r.items[0].moldNo, "", "Mold No:");
});
t("Import: namaBarang gabungan URAIAN+TIPE seperti sebelumnya (tidak berubah)", () => {
  const barang = [barangRowPalsu({
    "URAIAN": "TYRE MOLD TREAD ONLY", "MEREK": "-", "TIPE": "MAGNETAR A/T 235/55R20",
  })];
  const r = panggilParseBc({ "KODE JENIS IMPOR": "1", "KODE INCOTERM": "FCA" }, barang);
  eq(r.items[0].namaBarang, "TYRE MOLD TREAD ONLY MAGNETAR A/T 235/55R20");
  eq(r.items[0].size, "", "size tidak dipakai di Import:");
});
t("MEREK yang benar-benar diisi ikut ke namaBarang, di kedua buku", () => {
  const barang = [barangRowPalsu({
    "URAIAN": "TYRE MOLD", "MEREK": "BRIDGESTONE", "TIPE": "195/65R15",
  })];
  const r = panggilParseBc({ "KODE JENIS EKSPOR": "1", "KODE INCOTERM": "FOB" }, barang);
  eq(r.items[0].namaBarang, "TYRE MOLD BRIDGESTONE 195/65R15");
  eq(r.items[0].size, "");
});
t('placeholder ("-") tidak ikut tertulis ke namaBarang', () => {
  const barang = [barangRowPalsu({ "URAIAN": "TYRE MOLD", "MEREK": "-", "TIPE": "-" })];
  const r = panggilParseBc({ "KODE JENIS EKSPOR": "1", "KODE INCOTERM": "FOB" }, barang);
  eq(r.items[0].namaBarang, "TYRE MOLD");
});

console.log("\u2014 IMPOR EXCEL CEISA: URUTAN SERI BARANG NUMERIK \u2014");
t("baris BARANG diurutkan numerik menaik, bukan urutan mentah di sheet", () => {
  /* Data CEISA sungguhan TIDAK selalu berurutan di sheet-nya -- nemu
     berkas nyata dengan urutan baris 1, 4, 3, 2, 6 (bukan salah baca,
     memang begitu). Dites persis pola itu supaya bukan cuma kasus
     rapi 1,2,3 yang kebetulan sudah terurut sejak awal. */
  const buatBarang = (seri, nama) => ({
    "SERI BARANG": seri, "URAIAN": nama, "HS": "84807190", "KODE SATUAN": "SET",
    "JUMLAH SATUAN": 1, "CIF": 100, "JUMLAH KEMASAN": 1, "KODE KEMASAN": "PK",
  });
  const barangAcak = [
    buatBarang(1, "SATU"), buatBarang(4, "EMPAT"), buatBarang(3, "TIGA"),
    buatBarang(2, "DUA"), buatBarang(6, "ENAM"),
  ];
  const r = panggilParseBc({ "KODE INCOTERM": "CIF", "KODE JENIS IMPOR": "1" }, barangAcak);
  eq(r.items.map((it) => it.namaBarang).join(","), "SATU,DUA,TIGA,EMPAT,ENAM");
});
t('urutan "10" setelah "2" (numerik), bukan sebelum "2" (string)', () => {
  const buatBarang = (seri, nama) => ({
    "SERI BARANG": seri, "URAIAN": nama, "HS": "84807190", "KODE SATUAN": "SET",
    "JUMLAH SATUAN": 1, "CIF": 100, "JUMLAH KEMASAN": 1, "KODE KEMASAN": "PK",
  });
  const barang = [buatBarang(10, "SEPULUH"), buatBarang(1, "SATU"), buatBarang(2, "DUA")];
  const r = panggilParseBc({ "KODE INCOTERM": "CIF", "KODE JENIS IMPOR": "1" }, barang);
  eq(r.items.map((it) => it.namaBarang).join(","), "SATU,DUA,SEPULUH",
    '"10" harus di BELAKANG "2", bukan di antara "1" dan "2" seperti sortir string:');
});
t("Seri Barang non-numerik (jarang, tapi mungkin) didorong ke belakang, tidak melempar error", () => {
  const buatBarang = (seri, nama) => ({
    "SERI BARANG": seri, "URAIAN": nama, "HS": "84807190", "KODE SATUAN": "SET",
    "JUMLAH SATUAN": 1, "CIF": 100, "JUMLAH KEMASAN": 1, "KODE KEMASAN": "PK",
  });
  const barang = [buatBarang("X", "ANEH"), buatBarang(1, "SATU"), buatBarang(2, "DUA")];
  const r = panggilParseBc({ "KODE INCOTERM": "CIF", "KODE JENIS IMPOR": "1" }, barang);
  eq(r.items.map((it) => it.namaBarang).join(","), "SATU,DUA,ANEH");
});

console.log("\u2014 IMPOR EXCEL CEISA: BM/PPN/PPH DARI BARANGTARIF \u2014");
t("nol hasil impor bertahan walau penanda auto/manual dihitung ulang dari nol", () => {
  /* initAutoDutyFlags() jalan lagi SETIAP form dibuka dan menyimpulkan
     auto/manual dari ISI KOTAK. Kalau nol ditulis sebagai kotak kosong,
     ia disimpulkan "otomatis" lalu recalcCustoms() menimpanya dengan
     5% x Nilai Pabean -- angka dari dokumen berubah sendiri hanya
     karena jadwalnya dibuka ulang. */
  const simpan = {
    bm: $("#fBM").value, ppn: $("#fPPN").value, pph: $("#fPPH").value,
    fr: $("#fFreight").value, ins: $("#fInsurance").value, nd: $("#fNdpbm").value,
  };
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"2730" }]');
    ["fBM", "fPPN", "fPPH"].forEach((id) => { $("#" + id).value = ""; });
    w.initAutoDutyFlags();
    w.applyImportedBcData({
      fields: { freight: 2921.1, insurance: 28.26, ndpbm: 17714,
                bm: 0, ppn: 11066454, pph: 0 },
      items: [], notes: [], source: "excel",
    });
    // Meniru form ditutup lalu dibuka lagi: penanda disimpulkan ulang.
    w.initAutoDutyFlags();
    w.recalcCustoms();
    eq(w.nilaiKotakAngka("#fBM"), 0, "BM tetap 0 sesudah penanda dihitung ulang:");
    eq(w.nilaiKotakAngka("#fPPH"), 0, "PPH tetap 0:");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    $("#fBM").value = simpan.bm; $("#fPPN").value = simpan.ppn; $("#fPPH").value = simpan.pph;
    $("#fFreight").value = simpan.fr; $("#fInsurance").value = simpan.ins;
    $("#fNdpbm").value = simpan.nd;
    w.initAutoDutyFlags();
  }
});
t("BM/PPH bernilai 0 dari dokumen TIDAK ditimpa pengisian otomatis", () => {
  /* Diambil dari berkas CEISA sungguhan (000020PRM616...): BM & PPH
     punya 14 baris masing-masing, semuanya NILAI BAYAR 0, sementara
     PPN 11.066.454. Nol di sini FAKTA (tarif 0% / dibebaskan), bukan
     kolom kosong -- kalau tidak ditandai manual, recalcCustoms()
     menimpanya dengan 5% x Nilai Pabean. */
  const simpan = {
    bm: $("#fBM").value, ppn: $("#fPPN").value, pph: $("#fPPH").value,
    fr: $("#fFreight").value, ins: $("#fInsurance").value, nd: $("#fNdpbm").value,
  };
  const draftAwal = baca("draftItems");
  try {
    w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"2730" }]');
    ["fBM", "fPPN", "fPPH"].forEach((id) => { $("#" + id).value = ""; });
    w.initAutoDutyFlags();
    w.applyImportedBcData({
      fields: { freight: 2921.1, insurance: 28.26, ndpbm: 17714,
                bm: 0, ppn: 11066454, pph: 0 },
      items: [], notes: [], source: "excel",
    });
    w.recalcCustoms();
    eq($("#fBM").value, "0", "BM tertulis 0, bukan 5% dari Nilai Pabean:");
    eq($("#fBM").dataset.auto, "0", "BM ditandai manual:");
    eq($("#fPPH").value, "0", "PPH tertulis 0:");
    eq($("#fPPH").dataset.auto, "0", "PPH ditandai manual:");
    eq($("#fPPN").value, w.formatNumberValue(11066454), "PPN apa adanya dari BARANGTARIF:");
    // Dibaca ulang seperti saat jadwal disimpan -- ini angka yang benar-benar tercatat.
    eq(w.nilaiKotakAngka("#fBM"), 0, "nilai tersimpan BM:");
    eq(w.nilaiKotakAngka("#fPPH"), 0, "nilai tersimpan PPH:");
    eq(w.nilaiKotakAngka("#fPPN"), 11066454, "nilai tersimpan PPN:");
  } finally {
    w.eval("draftItems = " + JSON.stringify(draftAwal || []));
    $("#fBM").value = simpan.bm; $("#fPPN").value = simpan.ppn; $("#fPPH").value = simpan.pph;
    $("#fFreight").value = simpan.fr; $("#fInsurance").value = simpan.ins;
    $("#fNdpbm").value = simpan.nd;
    w.initAutoDutyFlags();
  }
});
t("BM/PPN/PPH dijumlahkan dari NILAI BAYAR di BARANGTARIF, disaring per KODE PUNGUTAN", () => {
  /* Pola dari berkas CEISA sungguhan: BM ber-tarif 0% (nilai bayarnya
     0), PPH dibebaskan lewat fasilitas (nilai bayar 0 walau ada
     NILAI FASILITAS terpisah -- yang TIDAK dipakai di sini, sengaja
     hanya NILAI BAYAR), PPN dibayar penuh. */
  const barangTarif = [
    { "SERI BARANG": 1, "KODE PUNGUTAN": "PPN", "NILAI BAYAR": 7532753 },
    { "SERI BARANG": 1, "KODE PUNGUTAN": "BM", "NILAI BAYAR": 0 },
    { "SERI BARANG": 1, "KODE PUNGUTAN": "PPH", "NILAI BAYAR": 0, "NILAI FASILITAS": 1711975 },
  ];
  const r = panggilParseBc(
    { "KODE INCOTERM": "FCA", "KODE JENIS IMPOR": "1" }, [barangRowPalsu()], barangTarif);
  eq(r.fields.bm, 0, "BM:");
  eq(r.fields.ppn, 7532753, "PPN:");
  eq(r.fields.pph, 0, "PPH:");
});
t("dijumlahkan lintas SEMUA baris/seri barang, bukan cuma seri pertama", () => {
  const barangTarif = [
    { "SERI BARANG": 1, "KODE PUNGUTAN": "PPN", "NILAI BAYAR": 100000 },
    { "SERI BARANG": 2, "KODE PUNGUTAN": "PPN", "NILAI BAYAR": 50000 },
    { "SERI BARANG": 1, "KODE PUNGUTAN": "BM", "NILAI BAYAR": 20000 },
    { "SERI BARANG": 2, "KODE PUNGUTAN": "BM", "NILAI BAYAR": 10000 },
  ];
  const r = panggilParseBc(
    { "KODE INCOTERM": "CIF", "KODE JENIS IMPOR": "1" }, [barangRowPalsu()], barangTarif);
  eq(r.fields.ppn, 150000, "PPN gabungan 2 seri:");
  eq(r.fields.bm, 30000, "BM gabungan 2 seri:");
});
t("BARANGTARIF kosong (mis. berkas Export) -> bm/ppn/pph null, bukan 0 atau error", () => {
  /* null beda arti dari 0: null = "datanya tidak ada, isi manual"; 0 =
     "datanya ADA dan sungguhan nol" (mis. BM ber-tarif 0%/fasilitas).
     Export sengaja TANPA catatan sejak cadangan rumus ditambahkan --
     lihat pengujian khususnya sendiri di atas ("Export, BARANGTARIF
     kosong -> TETAP null, TANPA catatan"). */
  const r = panggilParseBc(
    { "KODE INCOTERM": "FOB", "KODE JENIS EKSPOR": "1" }, [barangRowPalsu()], []);
  eq(r.fields.bm, null);
  eq(r.fields.ppn, null);
  eq(r.fields.pph, null);
});

console.log("\u2014 HARGA SATUAN IMPOR EXCEL CEISA: FOB/CIF \u00f7 JUMLAH SATUAN \u2014");
/* Kolom FOB/CIF di sheet BARANG adalah nilai TOTAL per baris, bukan per
   unit -- harus dibagi JUMLAH SATUAN. Aturan "FOB kalau termsnya FOB"
   HANYA berlaku untuk EXPORT; IMPORT selalu dari CIF apa pun termsnya
   (nilai pabean impor dasarnya CIF -- lihat recalcCustoms()). Berlaku
   khusus jalur import Excel CEISA (excel-bc.js), tidak untuk CIPL.
   XLSX tidak dimuat di index.html (baru di-load runtime saat dipakai),
   jadi ditiru di sini supaya parseBcExcelWorkbook() bisa dipanggil
   langsung dengan sheet palsu. */
function wbBcPalsu(header, barangRows, barangTarifRows) {
  const sheets = {
    HEADER: [header], ENTITAS: [], DOKUMEN: [], PENGANGKUT: [{}],
    KEMASAN: [], KONTAINER: [], BARANGTARIF: barangTarifRows || [], BARANGDOKUMEN: [],
    BARANG: barangRows,
  };
  const Sheets = {};
  Object.keys(sheets).forEach((n) => { Sheets[n] = { __rows: sheets[n] }; });
  return { SheetNames: Object.keys(sheets), Sheets };
}
function barangRowPalsu(over) {
  return Object.assign({ "URAIAN": "BRG", "HS": "1234.56.78", "KODE SATUAN": "PCE",
    "JUMLAH SATUAN": 10, "FOB": 1000, "CIF": 1100,
    "JUMLAH KEMASAN": 2, "KODE KEMASAN": "CT" }, over);
}
function panggilParseBc(header, barangRows, barangTarifRows) {
  const asli = w.XLSX;
  w.XLSX = { utils: { sheet_to_json: (sh) => sh.__rows || [] } };
  try {
    return w.parseBcExcelWorkbook(wbBcPalsu(header, barangRows, barangTarifRows));
  } finally { w.XLSX = asli; }
}
t("export + FOB: harga satuan dari kolom FOB \u00f7 JUMLAH SATUAN", () => {
  const r = panggilParseBc({ "KODE INCOTERM": "FOB", "KODE JENIS EKSPOR": "1" },
    [barangRowPalsu()]);
  eq(r.items[0].harga, 100);
});
t("export + CIF: harga satuan dari kolom CIF \u00f7 JUMLAH SATUAN", () => {
  const r = panggilParseBc({ "KODE INCOTERM": "CIF", "KODE JENIS EKSPOR": "1" },
    [barangRowPalsu()]);
  eq(r.items[0].harga, 110);
});
t("import: SELALU dari kolom CIF walau termsnya FOB", () => {
  const r = panggilParseBc({ "KODE INCOTERM": "FOB", "KODE JENIS IMPOR": "1" },
    [barangRowPalsu()]);
  eq(r.items[0].harga, 110, "import terms FOB tapi harus tetap dari CIF:");
});
t("export+FOB tanpa kolom FOB -> harga 0 + catatan; import tidak kena", () => {
  const rowTanpaFob = barangRowPalsu({ FOB: undefined });
  const rEkspor = panggilParseBc({ "KODE INCOTERM": "FOB", "KODE JENIS EKSPOR": "1" }, [rowTanpaFob]);
  eq(rEkspor.items[0].harga, 0);
  if (!rEkspor.notes.some((n) => n.includes("kolom FOB tidak ditemukan")))
    throw new Error("export FOB tanpa kolom FOB harusnya dapat catatan peringatan");

  const rImpor = panggilParseBc({ "KODE INCOTERM": "FOB", "KODE JENIS IMPOR": "1" }, [rowTanpaFob]);
  eq(rImpor.items[0].harga, 110, "import tanpa kolom FOB tetap dari CIF:");
  if (rImpor.notes.some((n) => n.includes("kolom FOB tidak ditemukan")))
    throw new Error("import tidak seharusnya dapat catatan kolom FOB (tidak pernah pakai FOB)");
});
t("kode pelabuhan/terminal dinormalkan ke 3 huruf lewat portDisplay()", () => {
  const r = panggilParseBc(
    { "KODE INCOTERM": "FOB", "KODE JENIS EKSPOR": "1",
      "KODE PELABUHAN MUAT": "IDTPP", "KODE PELABUHAN TUJUAN": "KRPUS" },
    [barangRowPalsu()]);
  eq(r.fields.origin, "TPP");
  eq(r.fields.destination, "PUS");
});
t("kemasan per barang tetap dari JUMLAH KEMASAN/KODE KEMASAN di sheet BARANG", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "import", "excel-bc.js"), "utf8");
  if (!/row\["JUMLAH KEMASAN"\]/.test(src))
    throw new Error("packing tidak lagi mengambil dari JUMLAH KEMASAN");
  if (!/packingUnit: excelStr\(row\["KODE KEMASAN"\]\)/.test(src))
    throw new Error("packingUnit tidak lagi mengambil dari KODE KEMASAN");
});

console.log("\u2014 TINGGI NAMA BARANG: TAB TERTUTUP \u2014");
/* Tabel barang tinggal di tab-pane "barang", dan tab yang tidak aktif
   memakai d-none. Elemen tanpa tata letak mengembalikan scrollHeight 0,
   jadi mengukurnya di situ bukan cuma sia-sia — hasilnya menimpa tinggi
   benar yang sudah ada. Itulah sebabnya nama panjang hasil impor tampak
   terpotong sampai kotaknya diketik.

   jsdom TIDAK menghitung tata letak: getClientRects selalu kosong dan
   scrollHeight selalu 0. Jadi keduanya dipalsukan di sini — yang diuji
   keputusan "ukur atau lewati", bukan angka tingginya. */
function textareaPalsu(tergambar, tinggiIsi) {
  const ta = w.document.createElement("textarea");
  ta.className = "nama-barang-input";
  ta.getClientRects = () => (tergambar ? [{ width: 200, height: 20 }] : []);
  Object.defineProperty(ta, "scrollHeight", {
    value: tinggiIsi, configurable: true,
  });
  return ta;
}
t("tinggi TIDAK ditimpa saat elemennya belum tergambar", () => {
  const ta = textareaPalsu(false, 0);
  ta.style.height = "88px";          // hasil hitungan yang sudah benar
  w.autoGrowTextarea(ta);
  eq(ta.style.height, "88px");       // bukan "0px", bukan "auto"
});
t("tinggi dihitung begitu elemennya tergambar", () => {
  const ta = textareaPalsu(true, 88);
  w.autoGrowTextarea(ta);
  eq(ta.style.height, "88px");
});
t("elemen tanpa getClientRects tidak melempar", () => {
  // Peramban lama / elemen lepas: lebih baik dilewati daripada galat.
  const polos = { style: {} };
  w.autoGrowTextarea(polos);
  eq(polos.style.height, undefined);
});
t("pane tab barang diamati, bukan tombol tabnya", () => {
  /* Klik hanya SALAH SATU jalan menuju terbuka. Yang diamati kelas
     pane-nya, supaya jalan lain ikut tertangkap. */
  const pane = $('.tab-pane[data-tabpane="barang"]');
  if (!pane) throw new Error("pane barang tidak ada di index.html");
  eq(pane.dataset.growPaneObserved, "1");
});

/* Bagian terakhir: MutationObserver jsdom menyala lewat microtask, jadi
   ringkasannya menunggu.

   MENUNGGU TENANG DULU. Berkas ini punya blok async lain yang berjalan
   bersamaan dan ikut menggambar ulang tabel; rAF yang dijadwalkannya
   mendarat kapan saja. Versi pertama uji ini menghitung panggilan dalam
   jendela waktu tetap dan LULUS PALSU — pengamat pane-nya dicabut, tes
   tetap hijau, karena yang terhitung sebenarnya kerjaan blok lain.
   Jadi sekarang ditunggu sampai benar-benar sepi lebih dulu. */
(async () => {
  console.log("\u2014 MEMBUKA TAB MENGHITUNG ULANG \u2014");
  const pane = $('.tab-pane[data-tabpane="barang"]');
  if (pane) {
    let dihitung = 0;
    const asli = w.autoGrowAllItemNames;
    w.autoGrowAllItemNames = () => { dihitung++; };
    const jeda = (ms) => new Promise((r) => w.setTimeout(r, ms));

    pane.classList.add("d-none");

    // Sepi = dua putaran berturut-turut tanpa satu pun panggilan.
    let sepi = false;
    for (let i = 0; i < 60 && !sepi; i++) {
      dihitung = 0;
      await jeda(25);
      sepi = dihitung === 0;
    }
    t("keadaan bisa ditenangkan sebelum diukur", () => {
      if (!sepi) throw new Error("masih ada panggilan latar — uji di bawah tidak dapat dipercaya");
    });

    dihitung = 0;
    pane.classList.remove("d-none");            // tab dibuka
    await jeda(25);
    t("membuka tab memicu perhitungan ulang", () => {
      if (dihitung < 1) throw new Error("tidak ada perhitungan ulang saat pane dibuka");
    });

    dihitung = 0;
    pane.classList.add("d-none");               // tab ditutup lagi
    await jeda(25);
    t("menutup tab TIDAK memicu pengukuran sia-sia", () => {
      eq(dihitung, 0);
    });

    w.autoGrowAllItemNames = asli;
  }

  // Rantai uji asinkron ditunggu dulu -- lihat catatan di fungsi t().
  await rantaiAsync;

  console.log(`\n${pass} lulus, ${fail} gagal\n`);
  process.exit(fail ? 1 : 0);
})();
