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
w.supabase = { createClient: () => ({
  from: () => ({
    update: (row) => ({ eq: async (_c, id) => { jejakUpdate.push({ id, row }); return { error: null }; } }),
    select: () => ({ order: async () => ({ data: [], error: null }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "x" }, error: null }) }) }),
  }),
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
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }
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
t("buku export: panel & pengalih disembunyikan, Actual bisa diketik", () => {
  tulis("activeMode", "export");
  w.syncPredictionForm();
  eq($("#predictionBlock").classList.contains("d-none"), true);
  eq($("#etaModeSwitch").classList.contains("d-none"), true);
  eq($("#fActual").readOnly, false);
  tulis("activeMode", "import");
  w.syncPredictionForm();
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
t("keduanya HANYA BISA DIBACA", () => {
  tulis("activeMode", "export");
  const h = w.renderCard(exDelivered);
  const blok = h.slice(h.indexOf("collapsed-dates"), h.indexOf("collapsed-items"));
  eq((blok.match(/readonly/g) || []).length, 2);
  // Tanpa data-action, klik tidak menyimpan apa pun
  if (/data-action="date"/.test(blok)) throw new Error("masih bisa diubah dari kartu");
  tulis("activeMode", "import");
});
t("jadwal yang pernah dimundurkan ditandai", () => {
  tulis("activeMode", "export");
  const h = w.renderCard({ ...exDelivered, etaUpdate: "2026-08-20" });
  if (!h.includes("Pernah dimundurkan")) throw new Error("penanda delay hilang");
  // Yang tampil tetap tanggal RENCANA, sama dengan form
  if (!h.includes("2026-08-14")) throw new Error("ETA rencana tergeser");
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
t("Item DAN Type boleh turun ke bawah", () => {
  /* Keduanya teks bebas yang panjangnya tak tertebak. Memotong Type
     menghilangkan keterangan barang — di gambar sebelumnya "NOKIAN
     ENTRUST 235/45R19 SAVER" terpotong jadi "...SAVEF". */
  const css = w.ciplCss();
  const i = css.indexOf(".ci-items td.ci-item");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/\.ci-items td\.ci-type/.test(css.slice(i, i + 120)))
    throw new Error("kolom Type tidak ikut dikecualikan");
  if (!/white-space: normal/.test(blok)) throw new Error("masih dipaksa satu baris");
  if (!/word-break/.test(blok)) throw new Error("teks tanpa spasi tidak akan terpecah");

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

t("hanya nama barang yang boleh turun ke bawah", () => {
  [["ciplCss", ".ci-items th, .ci-items td", ".ci-items td.ci-item"],
   ["suratJalanCss", ".sj-items th, .sj-items td", ".sj-items td.sj-nama"]]
    .forEach(([fn, umum, nama]) => {
      const css = w[fn]();
      const blokUmum = css.slice(css.indexOf(umum), css.indexOf("}", css.indexOf(umum)));
      if (!/white-space: nowrap/.test(blokUmum))
        throw new Error(fn + ": kolom lain masih boleh membungkus");
      if (!/overflow: hidden/.test(blokUmum))
        throw new Error(fn + ": tanpa jaring pengaman, teks panjang menembus garis");
      const blokNama = css.slice(css.indexOf(nama), css.indexOf("}", css.indexOf(nama)));
      if (!/white-space: normal/.test(blokNama))
        throw new Error(fn + ": nama barang tidak boleh dipaksa satu baris");
      if (!/word-break/.test(blokNama))
        throw new Error(fn + ": nama tanpa spasi tidak akan terpecah");
    });
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
      const cols = (h.match(/<col style="width:[\d.]+%">/g) || []);
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
  eq(isi(panel, "portLoading"), "TPP");
  eq(isi(panel, "finalDestination"), "PUS");
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
  eq(w.docNumSubtypeLabelFor("do"), "");
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
t("tinggi ruang kosong menyusut saat barang bertambah", () => {
  const sedikit = w.ciplRuangKosongHtml(2, 10);
  const banyak = w.ciplRuangKosongHtml(10, 10);
  const tinggi = (s) => Number((s.match(/height:(\d+)px/) || [])[1] || 0);
  if (!(tinggi(sedikit) > tinggi(banyak))) throw new Error("tidak menyusut");
  eq(w.ciplRuangKosongHtml(20, 10), "");   // penuh -> tidak ada ruang sisa
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

       (640 + 382,40 + 5,1) x 18.062 = 18.564.938,--
       PPN 11%  = 2.042.143
       PPH 2,5% =   464.123

     Dengan dasar lama (barang saja) PPN cuma 1.271.565 — meleset
     771 ribu rupiah ke bawah pada satu kiriman. */
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"640" }]');
  $("#fIncoterm").value = "FOB";
  $("#fFreight").value = "382.40";
  $("#fInsurance").value = "5.1";
  $("#fNdpbm").value = "18,062";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  const dasar = (640 + 382.4 + 5.1) * 18062;
  eq($("#fPPN").value, w.formatNumberValue(Math.round(dasar * 0.11)));
  eq($("#fPPH").value, w.formatNumberValue(Math.round(dasar * 0.025)));
});
t("kotak ongkos kosong: dasarnya kembali ke harga barang saja", () => {
  w.eval('draftItems = [{ namaBarang:"X", qty:"1", satuan:"pcs", harga:"640" }]');
  $("#fFreight").value = "";
  $("#fInsurance").value = "";
  $("#fNdpbm").value = "18,062";
  $("#fPPN").value = "";
  $("#fPPH").value = "";
  w.initAutoDutyFlags();
  w.recalcCustoms();
  eq($("#fPPN").value, w.formatNumberValue(Math.round(640 * 18062 * 0.11)));
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

t("pengaturan cetak sama dengan rujukan", () => {
  /* fitToPage BERSAMA skala. Rujukan punya keduanya; tanpa fitToPage
     Excel memakai skala mentah dan halaman keluar ~2,4% lebih kecil. */
  const h = w.eval("ciplXlsHalaman")({ area: "A1:J51", scale: 83, tengah: true });
  eq(h.paperSize, 9);
  eq(h.orientation, "portrait");
  eq(h.scale, 83);
  eq(h.fitToPage, true);
  eq(h.horizontalCentered, true);
  eq(h.printArea, "A1:J51");
  eq(h.margins.left, 0.3);
  eq(h.margins.top, 0.4);
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

  t("chip dikecualikan dari 44px", () => {
    /* Lima chip berdampingan bukan tombol tunggal: pada 390px
       ketinggian 44px memecahnya jadi tiga baris dan bilahnya jadi
       402px — lebih dari separuh layar sebelum satu jadwal terlihat. */
    const m = /height: (\d+)px/.exec(blok(".chip"));
    if (!m) throw new Error("tinggi chip tidak diatur khusus di HP");
    if (Number(m[1]) >= 44) throw new Error("chip belum dikecilkan: " + m[1] + "px");
    if (Number(m[1]) < 32) throw new Error("chip terlalu kecil untuk jempol: " + m[1] + "px");
  });

  t("tiap baris chip terisi penuh, tepi kanannya rata", () => {
    /* Yang terbaca berantakan bukan jumlah barisnya, melainkan tepi
       kanan bergerigi: 2 chip / 2 chip / 1 chip, dengan 233px kosong
       di sebelah "Selesai" — seperti ada yang belum selesai dimuat.

       flex-grow, bukan jumlah kolom tetap: jumlah kolom yang dipatok
       akan salah di lebar layar yang lain. */
    const b = blok(".preset-row .chip");
    if (!/flex: 1 1 auto/.test(b))
      throw new Error("chip tidak melebar mengisi barisnya");
    if (/grid-template-columns/.test(hp.slice(hp.indexOf(".preset-row"))))
      throw new Error("jumlah kolom dipatok — akan salah di lebar lain");
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

t("sel info lebar tidak memaksa kolom kedua di HP", () => {
  /* auto-fit minmax(180px,1fr) menyusut jadi SATU kolom di bawah
     ~444px. `span 2` lalu membuat grid MENCIPTAKAN kolom implisit di
     luar templat — lebarnya melewati kartu, dan seluruh halaman ikut
     bisa digeser mendatar di 320px. */
  const i = cssKartu.indexOf("@media (max-width: 599.98px)");
  const sempit = cssKartu.slice(i);
  if (!/\.info-item--wide \{[^}]*grid-column: 1 \/ -1/.test(sempit))
    throw new Error("sel lebar masih minta span 2 di layar sempit");
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
t("chip saringan membungkus, tidak disembunyikan di balik gulir", () => {
  /* Gulir mendatar di sini mustahil dipakai: scrollbar-nya
     disembunyikan global di base.css, jadi tak ada penanda maupun cara
     menggeser dengan tetikus biasa. */
  const m = blokMedia(991);
  if (!/\.preset-row \{[^}]*flex: 1 1 0/.test(m))
    throw new Error("chip tidak mengambil sisa lebar barisnya");
  if (!/\.preset-row \{[^}]*flex-wrap: wrap/.test(m))
    throw new Error("chip tidak boleh turun ke baris berikutnya");
  if (/overflow-x:\s*auto/.test(cssDashBersih))
    throw new Error("masih ada gulir mendatar yang scrollbar-nya tersembunyi");
});
t("PENJAGA: gulir tersembunyi tidak dipakai untuk isi yang bisa diklik", () => {
  /* base.css menyembunyikan scrollbar untuk beberapa wadah. Untuk
     wadah berisi TOMBOL, itu berarti sebagian tombol tak terjangkau. */
  const base = require("fs").readFileSync(__dirname + "/../css/base.css", "utf8");
  const i = base.indexOf("scrollbar-width: none");
  const daftar = base.slice(base.lastIndexOf("*/", i), i);
  if (/\.preset-row/.test(daftar) && /overflow-x:\s*auto/.test(cssDashBersih))
    throw new Error("preset-row bergulir sekaligus scrollbar-nya disembunyikan");
});
t("urutan baris pencarian: tab, cari, status", () => {
  /* Urutan DOM menentukan urutan tampil. Saringan status harus SESUDAH
     kotak cari — kalau tidak, ia muncul di kiri dan susunannya berbeda
     dari yang dirancang. */
  const baris = $(".controlbar-row--filters");
  const anak = [...baris.children];
  const idx = (sel) => anak.findIndex((el) => el.matches(sel) || el.querySelector(sel));
  const tab = idx(".mode-tabs, [data-mode]");
  const cari = idx(".search-box");
  const status = idx("#filterStatus");
  if (!(tab < cari && cari < status))
    throw new Error(`urutan salah — tab:${tab} cari:${cari} status:${status}`);
});
t("saringan status sebaris dengan kotak cari", () => {
  const sel = $("#filterStatus");
  const baris = sel.closest(".controlbar-row");
  if (!baris.classList.contains("controlbar-row--filters"))
    throw new Error("saringan status tidak di baris pencarian");
  if (!baris.querySelector(".search-box"))
    throw new Error("tidak sebaris dengan kotak cari");
  if (sel.closest(".controlbar-tail"))
    throw new Error("saringan status ikut kelompok tombol");
});
t("tombol aksi sebaris dengan chip", () => {
  const tail = $(".controlbar-tail");
  const baris = tail.closest(".controlbar-row");
  if (!baris.querySelector(".preset-row"))
    throw new Error("kelompok tombol tidak sebaris dengan chip");
  if (baris.querySelector("#filterStatus"))
    throw new Error("saringan status ikut turun ke baris chip");
});
t("kotak cari didorong ke kanan bersama saringan status", () => {
  /* Sakelar Import/Export tetap di kiri; keduanya di kanan. */
  const css = require("fs").readFileSync(__dirname + "/../css/dashboard.css", "utf8");
  const i = css.indexOf(".search-box {");
  const blok = css.slice(i, css.indexOf("}", i));
  if (!/margin-left: auto/.test(blok))
    throw new Error("kotak cari tidak didorong ke kanan");
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
     tombol menumpuk di atas chip pada tampilan mobile. */
  const bersih = cssDash.replace(/\/\*[\s\S]*?\*\//g, "");
  const punya = (blok, sel, prop) => {
    const i = blok.indexOf(sel + " {");
    if (i < 0) return false;
    return new RegExp(prop).test(blok.slice(i, blok.indexOf("}", i)));
  };
  [767, 991].forEach((lebar) => {
    const m = blokMedia(lebar).replace(/\/\*[\s\S]*?\*\//g, "");
    if (!punya(m, ".controlbar-tail", "width: 100%")) return;
    /* Kelompok kanan kini di baris pencarian. Kalau ia selebar penuh,
       baris ITU yang wajib boleh membungkus — kalau tidak, ia menindih
       kotak cari, persis seperti dulu menindih chip. */
    if (punya(m, ".controlbar-row--filters", "flex-wrap: nowrap"))
      throw new Error(lebar + "px: kelompok kanan 100% tapi baris pencarian nowrap");
    if (punya(m, ".controlbar-row--views", "flex-wrap: nowrap"))
      throw new Error(lebar + "px: baris chip dipaksa nowrap");
  });
  if (!bersih) throw new Error("css kosong");
});
t("target sentuh di mobile minimal 44px", () => {
  /* 33px cukup untuk kursor, sempit untuk ujung jari. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  const i = m.indexOf("min-height: 44px");
  if (i < 0) throw new Error("tidak ada aturan target sentuh");
  const selektor = m.slice(m.lastIndexOf("}", i) + 1, m.indexOf("{", m.lastIndexOf("}", i)));
  [".chip", ".icon-btn", ".btn-more"].forEach((s) => {
    if (!selektor.includes(s)) throw new Error(s + " tidak ikut dinaikkan");
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
t("di mobile tiap kendali mendapat barisnya sendiri", () => {
  /* Menjejalkan dua kendali dalam satu baris di lebar ini selalu
     berakhir sempit di kedua-duanya. */
  const m = blokMedia(767).replace(/\/\*[\s\S]*?\*\//g, "");
  /* Sakelar buku, kotak cari, saringan status, dan chip masing-masing
     mengambil baris penuh; tombol aksi menempel di kanan bawah chip. */
  [".mode-tabs", ".search-box", ".control-select"].forEach((sel) => {
    if (!new RegExp("\\" + sel + "[^{]*\\{[^}]*flex: 1 1 100%").test(m) &&
        !/flex: 1 1 100%;\s*\n\s*margin-left: 0/.test(m))
      throw new Error(sel + " tidak mengambil baris penuh");
  });
  if (!/\.preset-row \{[^}]*flex: 1 1 100%/.test(m))
    throw new Error("chip tidak mengambil baris penuh");
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
     sebaliknya. Angkanya sendiri bebas; yang dijaga kesamaannya. */
  const css = require("fs").readFileSync(
    require("path").join(__dirname, "..", "css", "form.css"), "utf8");
  const sel = /table\.item-table td:first-child\s*\{[^}]*min-width:\s*(\d+)px/.exec(css);
  const kotak = /table\.item-table textarea\.nama-barang-input\s*\{[^}]*min-width:\s*(\d+)px/.exec(css);
  if (!sel) throw new Error("min-width td:first-child tidak ditemukan");
  if (!kotak) throw new Error("min-width textarea.nama-barang-input tidak ditemukan");
  eq(sel[1], kotak[1], "sel " + sel[1] + "px vs kotak " + kotak[1] + "px:");
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
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "import", "excel-bc.js"), "utf8");
  const pesan = /Master\/House BL\/AWB tidak ditemukan[^"]*/.exec(src);
  if (!pesan) throw new Error("pesan peringatan tidak ditemukan");
  ["704", "741", "705", "740"].forEach((k) => {
    if (pesan[0].indexOf(k) < 0) throw new Error("pesan tidak menyebut kode " + k);
  });
  ["742", "743"].forEach((k) => {
    if (pesan[0].indexOf(k) >= 0) throw new Error("pesan masih menyebut kode lama " + k);
  });
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

  console.log(`\n${pass} lulus, ${fail} gagal\n`);
  process.exit(fail ? 1 : 0);
})();
