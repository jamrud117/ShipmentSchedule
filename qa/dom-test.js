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
  const { JSDOM } = require(__dirname + "/../../node_modules/jsdom");

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
  if (!/\.preset-row \{[^}]*flex: 1 1 auto/.test(m))
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
  [".search-box", ".preset-row", ".mode-tabs", ".controlbar-tail"].forEach((sel) => {
    const i = m.indexOf(sel);
    if (i < 0) throw new Error(sel + " tidak diatur di mobile");
    const blok = m.slice(i, m.indexOf("}", i));
    if (!/(flex: 1 1 100%|width: 100%)/.test(blok))
      throw new Error(sel + " tidak mengambil baris penuh");
  });
});
t("di mobile kelompok kanan turun ke bawah kotak cari", () => {
  const m = blokMedia(767);
  if (!/\.controlbar-tail \{[^}]*width: 100%/.test(m))
    throw new Error("kelompok kanan tidak melebar penuh di mobile");
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

console.log(`\n${pass} lulus, ${fail} gagal\n`);
process.exit(fail ? 1 : 0);
