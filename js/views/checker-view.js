"use strict";

/* ------------------------------------------------------------------
   HALAMAN CEK PIB/PEB (#/cek) -- CIPL dibandingkan dengan draft CEISA,
   dibantu data Shipment Schedule.

   MESINNYA SATU DENGAN EXIM CHECKER. js/import/exim-engine.js adalah
   berkas yang sama persis dengan exim-engine.js di EXIM Checker (EXIM
   Tuned): ekstraksi CIPL (Excel & PDF, satu berkas atau CI + PL
   terpisah), pembacaan draft PIB/PEB, dan seluruh aturan
   pemeriksaannya ada di sana. Halaman ini hanya menambahkan apa yang
   DIMILIKI Shipment Schedule dan tidak dimiliki EXIM Checker:

     1. JADWAL TERKAIT. Dicari sendiri dari nomor aju, invoice,
        B/L-AWB & kontainer di kedua berkas (bisa diganti atau dilepas).
        Nomor Master & House B/L-AWB jadwalnya mengisi kotak pembanding,
        dan isian jadwal -- aju, invoice, polis asuransi, moda, sarana
        angkut, pelabuhan, incoterm, freight, asuransi, NDPBM, kemasan,
        kontainer, pihak, tanggal dokumen -- dibandingkan dengan draft
        di bagiannya masing-masing. ETD/ETA jadwal tidak dibandingkan
        (kecuali ETD vs TANGGAL EKSPOR PEB). BARANG jadwalnya jadi rujukan utama pembanding draft:
        nama, HS Code, jumlah, satuan, harga & berat dari jadwal (sudah
        diperiksa EXIM), yang kosong dilengkapi CIPL (cekBarangGabungan).
     2. HS CODE 8 DIGIT. CIPL biasanya hanya benar sampai 6 digit,
        sementara BTKI butuh 8. Kode 8 digit barangnya dicari di
        Database HS Code (nama barang), lalu di barang jadwal terkait,
        lalu di riwayat jadwal lain; kode draft yang belum dikenal
        database bisa langsung disimpan dari sini.
     3. FASILITAS & IZIN. PI (959) & LS (958) beserta tanggalnya,
        Masterlist (912), SKB PPN (456), SKB PPh (457) & COO (860/861)
        di draft dibandingkan dengan isian jadwal.

   Tanpa CIPL pun bisa dipakai: draft dibandingkan dengan jadwal
   terkaitnya saja.

   Khusus EXIM (tabel PERAN di session.js). Berkas dibaca di peramban
   dan tidak diunggah ke mana pun. Catatan dari mesin berbahasa
   Indonesia (sama dengan EXIM Checker); bingkai halamannya ikut bahasa
   aktif dan digambar ulang saat bahasa diganti (setLang di i18n.js).
------------------------------------------------------------------ */

const cekKeadaan = {
  berkasCipl: [], // File: satu CIPL, atau dua (CI & PL terpisah)
  berkasDraft: null, // File draft CEISA (Excel)
  kunciCipl: "", // tanda berkas yang sudah dibaca -- tidak dibaca ulang tanpa alasan
  kunciDraft: "",
  cipl: null, // hasil EximEngine.readCiplSources
  galatCipl: "",
  decl: null, // hasil EximEngine.extractDeclaration
  bc: null, // hasil parseBcExcelWorkbook (bentuk isian jadwal) -- excel-bc.js
  draftDiurutkan: false, // baris sheet BARANG di berkasnya TIDAK berurutan Seri Barang, lalu diurutkan (cekBacaDraft)
  galatDraft: "",
  membaca: false,
  bacaKe: 0, // nomor urut pembacaan: jawaban yang usang dibuang
  jalanKe: 0, // nomor urut pemeriksaan
  jadwalId: "",
  jadwalManual: false, // dipilih / dilepas pengguna: tebakan berikutnya tidak menimpanya
  kandidat: [], // [{ s, skor, alasan }]
  pilihTerbuka: false,
  hasil: null,
  galatCek: "",
  saring: "ALL",
  pendukung: null, // Promise: Database HS Code
  dbHs: "", // "" | "ok" | "gagal"
};

const CEK_URUTAN = ["DOCUMENT", "ENTITY", "HEADER", "TRANSPORT", "VALUE", "WEIGHT", "PACKING", "FACILITY", "CIPL"];
function cekLabelSeksi(k) {
  const L = {
    DOCUMENT: tt("Dokumen", "Documents"),
    ENTITY: tt("Entitas", "Parties"),
    HEADER: "Header",
    TRANSPORT: tt("Pengangkutan", "Transport"),
    VALUE: tt("Nilai", "Value"),
    WEIGHT: tt("Berat", "Weight"),
    PACKING: tt("Kemasan & peti kemas", "Packaging & containers"),
    FACILITY: tt("Fasilitas & izin", "Facilities & permits"),
    CIPL: tt("Kualitas data CIPL", "CIPL data quality"),
    ITEM: tt("Barang", "Items"),
  };
  return L[k] || k;
}

/* ---------- kecil-kecil ---------- */

const cekKunci = kunciNamaHs; // hscode-view.js: aturan nama yang sama dengan impor CIPL di form
const cekDigit = (v) => String(v == null ? "" : v).replace(/\D+/g, "");
const cekAlnum = (v) => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
const cekAngka = (n) => angkaLokal(Number(n) || 0, "en-US", { maximumFractionDigits: 3 });
const cekAda = (v) => v !== null && v !== undefined && String(v).trim() !== "";
/* Nomor kontainer ISO 6346: 3 huruf pemilik + U/J/Z + 6 angka + angka
   periksa ("TCLU 123456-7"). Huruf keempat itulah yang membedakannya
   dari nomor segel yang kerap ditulis di kotak yang sama ("SEAL 0012345"). */
const CEK_POLA_KONTAINER = /\b[A-Z]{3}[UJZ]\s?-?\d{6}\s?-?\d\b/g;

/* "INV-01, INV-02 / INV-03" -> tiap nomor. Jadwal boleh memuat beberapa
   invoice (kiriman gabungan); draft memuat satu dokumen 380 per invoice. */
function cekPecahNomor(teks) {
  return String(teks == null ? "" : teks)
    .split(/[,;\n]+|\s+\/\s+|\s+&\s+|\s+DAN\s+/i)
    .map((x) => x.trim())
    .filter((x) => cekAlnum(x).length >= 3)
    .map((x) => ({ teks: x, kunci: cekAlnum(x) }));
}

/* ---------- tempat: daftar UN/LOCODE aplikasi ikut dikenal mesin ---------- */

let cekTempatSiap = false;
function cekSiapkanTempat() {
  if (cekTempatSiap || typeof EximEngine === "undefined" || typeof UNLOCODES === "undefined") return;
  cekTempatSiap = true;
  const kind = (u) => (u.type === "udara" ? "AIR" : "SEA");
  const baris = (u, group) => ({ code: u.unlocode, kind: kind(u), label: u.name, names: [u.name].concat(u.aliases || []), group });
  /* Terminal sekota (metro) menyusul induknya, supaya kelompoknya sama:
     pelabuhan induk & terminalnya dianggap satu tempat. */
  EximEngine.addPlaces(UNLOCODES.filter((u) => !u.metro).map((u) => baris(u)));
  EximEngine.addPlaces(UNLOCODES.filter((u) => u.metro).map((u) => baris(u, EximEngine.placeGroupOf(u.metro, kind(u)) || undefined)));
}

/* ---------- data pendukung: Database HS Code ---------- */

function cekMuatPendukung(paksa) {
  if (cekKeadaan.pendukung && !paksa) return cekKeadaan.pendukung;
  const hs =
    typeof ambilHsCodes === "function"
      ? ambilHsCodes().then(
          () => (cekKeadaan.dbHs = "ok"),
          (e) => {
            console.error(e);
            cekKeadaan.dbHs = "gagal";
          },
        )
      : Promise.resolve();
  cekKeadaan.pendukung = hs;
  return cekKeadaan.pendukung;
}

/* ---------- membaca berkas ---------- */

const cekTandaBerkas = (f) => (f ? [f.name, f.size, f.lastModified].join(":") : "");
const cekPdf = (f) => /\.pdf$/i.test((f && f.name) || "") || (f && f.type === "application/pdf");

/* Draft CEISA atau CIPL? Ditentukan dari ISINYA, bukan dari kotak tempat
   ia dilepas: draft punya sheet HEADER & BARANG. Jadi semua berkas boleh
   diseret sekaligus ke kotak mana pun. */
async function cekJenisBerkas(f) {
  if (cekPdf(f)) return "cipl";
  try {
    await ensureXLSX();
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", bookSheets: true });
    const nama = (wb.SheetNames || []).map((n) => String(n).trim().toUpperCase());
    return nama.includes("HEADER") && nama.includes("BARANG") ? "draft" : "cipl";
  } catch (e) {
    return "cipl";
  }
}

async function cekTerimaBerkas(daftar, kotak) {
  const files = Array.from(daftar || []).filter(Boolean);
  if (!files.length) return;
  const jenis = await Promise.all(files.map(cekJenisBerkas));
  const draft = files.filter((f, i) => jenis[i] === "draft");
  const cipl = files.filter((f, i) => jenis[i] === "cipl");
  if (cipl.length > 2) {
    showToast(tt("CIPL paling banyak dua berkas (CI dan PL). Dipakai dua yang pertama.", "A CIPL takes at most two files (CI and PL). The first two are used."), "warning");
  }
  if (draft.length > 1) {
    showToast(tt(`Satu draft saja yang dibandingkan: ${draft[draft.length - 1].name}.`, `Only one draft is compared: ${draft[draft.length - 1].name}.`), "warning");
  }
  if (kotak === "cipl" && !cipl.length && draft.length) {
    showToast(tt("Berkas itu draft CEISA, jadi dipasang sebagai draft PIB/PEB.", "That file is a CEISA draft, so it was set as the PIB/PEB draft."), "info");
  }
  if (kotak === "draft" && !draft.length && cipl.length) {
    showToast(tt("Berkas itu bukan draft CEISA (tanpa sheet HEADER & BARANG), jadi dipasang sebagai CIPL.", "That file is not a CEISA draft (no HEADER & BARANG sheets), so it was set as the CIPL."), "info");
  }
  if (cipl.length) cekKeadaan.berkasCipl = cipl.slice(0, 2);
  if (draft.length) {
    const baru = draft[draft.length - 1];
    // Draft lain = kiriman lain: pilihan jadwal yang lama tidak berlaku lagi
    if (cekTandaBerkas(baru) !== cekKeadaan.kunciDraft) cekKeadaan.jadwalManual = false;
    cekKeadaan.berkasDraft = baru;
  }
  await cekProses();
}

async function cekBacaCipl(files) {
  await ensureXLSX();
  const sumber = [];
  for (const f of files) {
    if (cekPdf(f)) {
      const lib = await ensurePdfJs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      sumber.push({ pages: await EximEngine.pdfPagesFromDocument(pdf, lib), name: f.name });
    } else {
      sumber.push({ wb: XLSX.read(await f.arrayBuffer(), EximEngine.XLSX_READ_OPTS), name: f.name });
    }
  }
  return EximEngine.readCiplSources(sumber);
}

/* Draft dibaca DUA kali dari workbook yang sama: oleh mesin (aturan
   pemeriksaan) dan oleh parseBcExcelWorkbook (excel-bc.js) -- pembaca
   yang sama dengan isi-otomatis form jadwal, jadi isian draft
   dibandingkan dengan jadwal dalam bentuk yang sama persis dengan yang
   dulu mengisinya (No. Daftar, moda, peti kemas, kolom & fasilitas per
   barang). */
async function cekBacaDraft(file) {
  await ensureXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), EximEngine.XLSX_DECL_READ_OPTS);
  if (!wb.Sheets.HEADER) throw new Error(tt("Sheet HEADER tidak ada. Pilih ekspor Excel draft PIB/PEB dari CEISA.", "There is no HEADER sheet. Choose the Excel export of a PIB/PEB draft from CEISA."));
  const decl = EximEngine.extractDeclaration(wb);
  if (decl.type !== "PIB" && decl.type !== "PEB") throw new Error(tt("Jenis dokumen tidak dikenali sebagai PIB atau PEB.", "The document type was not recognised as PIB or PEB."));
  // Barang draft urut menurut SERI BARANG (baris sheet BARANG tidak selalu berurutan) -- sama dengan impor ke form
  const urutDiBerkas = (decl.items || []).map((d) => String(d.no));
  decl.items = urutMenurutSeri(decl.items || [], (d) => d.no);
  /* Ekspor Excel CEISA kerap mengacak baris BARANG. Dicatat apakah urutan
     di berkasnya memang berbeda dari Seri Barang, supaya halaman bisa
     memberi tahu bahwa barang SUDAH diurutkan (cekRingkasDraft) -- tanpa
     itu pengguna tidak punya cara melihat bahwa pengurutan terjadi, dan
     berkas yang sudah rapi tidak perlu diberi keterangan apa pun. */
  const diurutkan = decl.items.some((d, i) => String(d.no) !== urutDiBerkas[i]);
  let bc = null;
  try {
    bc = parseBcExcelWorkbook(wb);
  } catch (e) {
    console.warn("parseBcExcelWorkbook:", e);
  }
  return { decl, bc, diurutkan };
}

async function cekProses() {
  const nomor = ++cekKeadaan.bacaKe;
  const k = cekKeadaan;
  const kunciCipl = k.berkasCipl.map(cekTandaBerkas).join("|");
  const kunciDraft = cekTandaBerkas(k.berkasDraft);
  const bacaCipl = kunciCipl !== k.kunciCipl;
  const bacaDraft = kunciDraft !== k.kunciDraft;
  if (!bacaCipl && !bacaDraft) return cekJalankan();
  k.membaca = true;
  renderChecker();
  let cipl = k.cipl,
    galatCipl = k.galatCipl,
    decl = k.decl,
    bc = k.bc,
    diurutkan = k.draftDiurutkan,
    galatDraft = k.galatDraft;
  if (bacaCipl) {
    cipl = null;
    galatCipl = "";
    if (k.berkasCipl.length) {
      try {
        cipl = await cekBacaCipl(k.berkasCipl);
      } catch (e) {
        console.error(e);
        galatCipl = (e && e.message) || tt("CIPL tidak terbaca.", "The CIPL could not be read.");
      }
    }
  }
  if (bacaDraft) {
    decl = null;
    bc = null;
    diurutkan = false;
    galatDraft = "";
    if (k.berkasDraft) {
      try {
        ({ decl, bc, diurutkan } = await cekBacaDraft(k.berkasDraft));
      } catch (e) {
        console.error(e);
        galatDraft = (e && e.message) || tt("Draft tidak terbaca.", "The draft could not be read.");
      }
    }
  }
  if (nomor !== k.bacaKe) return; // sudah ada berkas yang lebih baru
  Object.assign(k, { cipl, galatCipl, decl, bc, draftDiurutkan: !!diurutkan, galatDraft, kunciCipl, kunciDraft, membaca: false });
  cekPerbaruiKandidat();
  cekIsiBl();
  await cekJalankan();
}

/* ---------- jadwal terkait ---------- */

function cekBuku() {
  const d = cekKeadaan.decl;
  return d ? (d.type === "PEB" ? "export" : "import") : "";
}
function cekBukuData(mode) {
  return (typeof data !== "undefined" && data && data[mode]) || [];
}
/* Jadwal yang PIB/PEB-nya masih mungkin diperiksa -- yang lain tidak
   ditawarkan sebagai jadwal terkait (tebakan otomatis & pencarian):
     Import : yang belum tiba, berstatus Process / Delay (bukan Arrived);
     Export : yang ETD-nya belum lewat (ETD hari ini masih ikut).
   Jadwal yang sudah tertaut tetap terbaca lewat cekJadwal(). */
function cekJadwalTerbuka(s, mode) {
  if (mode !== "export") return effectiveStatus(s) !== "arrived";
  const etd = effectiveEtd(s);
  return !etd || etd >= todayISO();
}
function cekDaftarJadwal() {
  const buku = cekBuku();
  const dari = (mode) => cekBukuData(mode).filter((s) => cekJadwalTerbuka(s, mode));
  return buku ? dari(buku) : dari("import").concat(dari("export"));
}
function cekJadwal() {
  const id = cekKeadaan.jadwalId;
  if (!id) return null;
  const cari = (m) => cekBukuData(m).find((x) => String(x.id) === String(id));
  return cari("import") || cari("export") || null;
}
function cekModeJadwal(s) {
  if (!s) return "";
  return cekBukuData("export").some((x) => x.id === s.id) ? "export" : "import";
}

/* Nomor-nomor pengenal kiriman yang tertulis di kedua berkas. */
function cekPetunjuk() {
  const { cipl, decl } = cekKeadaan;
  const p = { aju: "", invoice: new Set(), bl: new Set(), kontainer: new Set() };
  const tambah = (set, v) => {
    const kunci = cekAlnum(v);
    if (kunci.length >= 4) set.add(kunci);
  };
  if (cipl) {
    tambah(p.invoice, cipl.invoice_no);
    [cipl.master_bl, cipl.house_bl, cipl.bl_no].forEach((v) => tambah(p.bl, v));
  }
  if (decl) {
    p.aju = cekDigit(decl.aju);
    (decl.documents || []).forEach((d) => {
      const kode = String(d.code == null ? "" : d.code).trim();
      if (kode === "380") tambah(p.invoice, d.number);
      if (EximEngine.TRANSPORT_DOCS[kode]) tambah(p.bl, d.number);
    });
    (decl.containers || []).forEach((c) => tambah(p.kontainer, c.number));
  }
  return p;
}

function cekSkor(s, p) {
  let skor = 0;
  const alasan = [];
  const aju = cekDigit(s.noAju);
  if (p.aju && aju) {
    if (aju === p.aju) {
      skor += 100;
      alasan.push(tt("No. Aju", "Aju No."));
    } else if (Math.min(aju.length, p.aju.length) >= 6 && (aju.endsWith(p.aju) || p.aju.endsWith(aju))) {
      skor += 60;
      alasan.push(tt("No. Aju", "Aju No."));
    }
  }
  if (cekPecahNomor(s.invoice).some((x) => p.invoice.has(x.kunci))) {
    skor += 60;
    alasan.push("Invoice");
  }
  if ([s.masterBL, s.houseBL].map(cekAlnum).some((k) => k.length >= 4 && p.bl.has(k))) {
    skor += 50;
    alasan.push("B/L-AWB");
  }
  const kont = (String(s.container || "").toUpperCase().match(CEK_POLA_KONTAINER) || []).map(cekAlnum);
  if (kont.some((k) => p.kontainer.has(k))) {
    skor += 25;
    alasan.push(tt("Kontainer", "Container"));
  }
  return { skor, alasan };
}

/* Kandidat jadwal dari kedua berkas. Yang teratas dipilih sendiri bila
   cukup yakin (aju, atau invoice / B/L-AWB) dan tidak seri dengan yang
   kedua -- seri berarti dua jadwal sama cocoknya, dan memilih salah
   satunya diam-diam sama saja dengan menebak. */
function cekPerbaruiKandidat() {
  const p = cekPetunjuk();
  const ada = p.aju || p.invoice.size || p.bl.size || p.kontainer.size;
  cekKeadaan.kandidat = !ada
    ? []
    : cekDaftarJadwal()
        .map((s) => Object.assign({ s }, cekSkor(s, p)))
        .filter((x) => x.skor >= 25)
        .sort((a, b) => b.skor - a.skor || String(b.s.etd || b.s.eta || "").localeCompare(String(a.s.etd || a.s.eta || "")))
        .slice(0, 6);
  if (cekKeadaan.jadwalManual) return;
  const [a, b] = cekKeadaan.kandidat;
  cekKeadaan.jadwalId = a && a.skor >= 50 && (!b || a.skor > b.skor) ? String(a.s.id) : "";
}

function cekTautkan(id) {
  cekKeadaan.jadwalId = String(id || "");
  cekKeadaan.jadwalManual = true;
  cekKeadaan.pilihTerbuka = false;
  cekIsiBl();
  cekJalankan();
}

/* ---------- B/L-AWB pembanding ---------- */

const CEK_BL = {
  master: { no: "#cekMasterNo", tgl: "#cekMasterTgl", sumber: "#cekMasterSumber", sumberTgl: "#cekMasterTglSumber", kolom: "masterBL" },
  house: { no: "#cekHouseNo", tgl: "#cekHouseTgl", sumber: "#cekHouseSumber", sumberTgl: "#cekHouseTglSumber", kolom: "houseBL" },
};

/* Kotak yang KOSONG (atau yang dulu diisi aplikasi) diisi dari jadwal
   terkait -- nomor & tanggal yang diketik EXIM dari B/L-nya -- lalu
   nomornya dari yang tercetak di CIPL. Yang diketik sendiri tidak
   pernah ditimpa. */
function cekIsiBl() {
  const s = cekJadwal();
  const c = cekKeadaan.cipl;
  const dariCipl = { master: (c && c.master_bl) || "", house: (c && c.house_bl) || "" };
  if (c && !dariCipl.master && !dariCipl.house && c.bl_no) dariCipl.house = c.bl_no;
  const isi = (el, nilai, asal) => {
    if (!el || (el.value.trim() && !el.dataset.otomatis)) return;
    el.value = nilai;
    if (nilai) el.dataset.otomatis = asal;
    else delete el.dataset.otomatis;
  };
  ["master", "house"].forEach((peran) => {
    const p = CEK_BL[peran];
    const nomorJadwal = s ? String(s[p.kolom] || "").trim() : "";
    isi($(p.no), nomorJadwal || dariCipl[peran], nomorJadwal ? "jadwal" : "cipl");
    isi($(p.tgl), s ? String(s[p.kolom + "Date"] || "").slice(0, 10) : "", "jadwal");
  });
  cekGambarSumberBl();
}

function cekLabelSumberBl(el) {
  const asal = el && el.dataset.otomatis;
  return asal === "jadwal" ? tt("Dari Jadwal", "From schedule") : asal === "cipl" ? tt("Dari CIPL", "From CIPL") : tt("Input manual", "Manual input");
}

function cekGambarSumberBl() {
  Object.values(CEK_BL).forEach((p) => {
    [
      [p.no, p.sumber],
      [p.tgl, p.sumberTgl],
    ].forEach(([kotak, keterangan]) => {
      const el = $(kotak);
      const ket = $(keterangan);
      if (el && ket) ket.textContent = el.dataset.otomatis ? cekLabelSumberBl(el) : "";
    });
  });
}

function cekExtraBl() {
  const nilai = (sel) => (($(sel) || {}).value || "").trim();
  const ex = {};
  ["master", "house"].forEach((peran) => {
    const p = CEK_BL[peran];
    ex[`${peran}_bl_no`] = nilai(p.no);
    ex[`${peran}_bl_date`] = nilai(p.tgl);
    ex[`${peran}_bl_no_source`] = cekLabelSumberBl($(p.no));
    ex[`${peran}_bl_date_source`] = cekLabelSumberBl($(p.tgl));
  });
  return ex;
}

/* ---------- HS Code 8 digit ---------- */

/* Penyelesai HS untuk mesin (extra.hsResolve): kode 8 digit barang ini
   menurut data Shipment Schedule. HS barang jadwal yang sudah 8 digit
   tidak perlu dicari (null -- dibandingkan langsung dengan draft). Untuk
   yang belum 8 digit, urutannya:
     1. Database HS Code -- pasangan nama & kode yang memang disimpan EXIM
     2. barang jadwal terkait (nama sama, atau urutan sama bila jumlah
        barangnya sama)
     3. riwayat jadwal lain di buku yang sama (kode yang paling sering)
     4. kode database / riwayat yang berawalan 6 digit CIPL (kandidat)
   `tanpaJadwal`: barang yang diperiksa memang barang jadwal itu sendiri
   (cek tanpa CIPL), jadi langkah 2 dilewati. */
function cekPenyelesaiHs(s, decl, opsi) {
  const E = EximEngine;
  const o = opsi || {};
  const buku = decl.type === "PEB" ? "export" : "import";
  const SUMBER_DB = tt("Database HS Code", "HS Code database");
  const SUMBER_JADWAL = tt("jadwal terkait", "the linked schedule");
  const SUMBER_RIWAYAT = tt("riwayat jadwal", "schedule history");
  const entri = (nama, namaSaja, kode, label) => ({ kunci: cekKunci(nama), kunciNama: cekKunci(namaSaja), kode: E.hsDigits(kode).slice(0, 8), label });
  const db = cekKeadaan.dbHs === "ok" ? daftarHsDatabase() : null;
  const barangJadwal = s && !o.tanpaJadwal ? (s.items || []).map((it) => entri(itemDisplayName(it), it.namaBarang, it.hsCode, itemDisplayName(it))) : [];
  const riwayat = [];
  cekBukuData(buku).forEach((x) => {
    if (s && x.id === s.id) return;
    (x.items || []).forEach((it) => {
      const e = entri(itemDisplayName(it), it.namaBarang, it.hsCode, it.namaBarang);
      if (e.kunci && e.kode.length === 8) riwayat.push(e);
    });
  });
  if (!db && !barangJadwal.length && !riwayat.length) return null;
  const itemsCipl = (cekKeadaan.cipl && cekKeadaan.cipl.items) || [];

  return (c) => {
    // HS 8 digit dari jadwal sudah diperiksa EXIM: dibandingkan langsung dengan draft, tanpa ditimpa database
    if (c._sumber && c._sumber.hs === "jadwal" && E.hsDigits(c.hs).length >= 8) return null;
    // Nama lengkap barang jadwal (atau uraian + tipe CIPL) dulu, lalu uraiannya saja
    const teks = [cekKunci(c._nama || `${c.description || ""} ${c.type || ""}`), cekKunci(c._uraian || c.description)].filter(Boolean);
    if (!teks.length) return null;
    const a = E.hsDigits(c.hs);
    if (db) {
      const hit = cariHsMenurutNama(db, teks);
      if (hit && hit.kode) return { code: hit.kode, source: SUMBER_DB, label: hit.label };
      if (hit && hit.kandidat) return { candidates: hit.kandidat, source: SUMBER_DB };
    }
    if (barangJadwal.length) {
      let hit = cariHsMenurutNama(barangJadwal.filter((x) => x.kunci), teks);
      if (!hit && barangJadwal.length === itemsCipl.length) {
        const x = barangJadwal[c._indeksAsal != null ? c._indeksAsal : itemsCipl.indexOf(c)];
        if (x) hit = { kode: x.kode, label: x.label };
      }
      if (hit && hit.kode && hit.kode.length === 8) return { code: hit.kode, source: SUMBER_JADWAL, label: hit.label };
    }
    if (riwayat.length) {
      const hit = cariHsMenurutNama(riwayat, teks);
      if (hit && hit.kode) return { code: hit.kode, source: SUMBER_RIWAYAT, label: hit.label };
    }
    if (a.length >= 6) {
      const awal = a.slice(0, 6);
      const kandidat = [...new Set((db || []).concat(riwayat).map((x) => x.kode).filter((k) => k.startsWith(awal)))].sort();
      if (kandidat.length) return { candidates: kandidat, source: db ? SUMBER_DB : SUMBER_RIWAYAT };
    }
    return db ? { none: true, source: SUMBER_DB } : null;
  };
}

/* ---------- barang: jadwal terkait dulu, CIPL melengkapi ---------- */

/* BARANG PEMBANDING DRAFT. Barang jadwal terkait sudah diperiksa &
   diketik EXIM, jadi itulah rujukan utamanya: kolom barang CEISA (Kode
   Barang s.d. Spesifikasi Lain, dibandingkan kolom demi kolom --
   cekBarisKolomBarang), HS Code, jumlah, satuan, harga & berat tiap
   barang diambil dari jadwal. Isian yang kosong di jadwal dilengkapi
   dari barang CIPL pasangannya; barang yang sama sekali tidak ada di
   jadwal (jadwalnya kurang barang) diambil utuh dari CIPL, di
   urutannya. Isian CIPL lainnya (dokumen, pihak, pelabuhan, kemasan,
   ...) tetap dari CIPL. Total netto & nilai dihitung ulang dari barang
   gabungan; total bruto dari jadwal (bruto kerap ditulis sekaligus di
   barang pertama). Jadwal tanpa barang -> null: barang CIPL apa adanya. */
function cekBarangGabungan(cipl, s, decl, bc) {
  const barang = ((s && s.items) || []).filter((it) => cekAda(rapiBagianNama(it.namaBarang)));
  if (!cipl || !barang.length) return null;
  const ciplItems = cipl.items || [];
  const pasangan = cekPasangkanBarang(barang, ciplItems);
  const urutan = cekUrutanGabungan(barang, ciplItems, pasangan);
  const positif = (v) => {
    const n = parseLooseNumber(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const bulat = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const dariJadwal = (it, c) => {
    const sumber = { nama: "jadwal" };
    const pilih = (kunci, nilaiJadwal, nilaiCipl) => {
      sumber[kunci] = nilaiJadwal != null && nilaiJadwal !== "" ? "jadwal" : "cipl";
      return sumber[kunci] === "jadwal" ? nilaiJadwal : nilaiCipl != null && nilaiCipl !== "" ? nilaiCipl : null;
    };
    // HS jadwal didahulukan; yang belum 6 digit kalah oleh CIPL yang lebih lengkap
    const hsJadwal = cekDigit(it.hsCode);
    const hsCipl = cekDigit(c.hs);
    const hs = pilih("hs", hsJadwal && (hsJadwal.length >= 6 || hsJadwal.length >= hsCipl.length) ? String(it.hsCode).trim() : "", c.hs);
    const qty = pilih("qty", positif(it.qty), c.qty);
    const harga = positif(it.harga);
    const berkolom = barangBerkolomCeisa(it);
    return {
      // Uraian saja: kolom barang lainnya dibandingkan sendiri (cekTandaiBarangJadwal)
      description: rapiBagianNama(it.namaBarang),
      type: "",
      brand: "",
      hs: hs || "",
      qty,
      unit: pilih("unit", String(it.satuan || "").trim(), c.unit) || "",
      unit_price: harga != null ? harga : c.unit_price != null ? c.unit_price : null,
      amount: pilih("amount", harga != null && qty != null ? bulat(qty * harga, 2) : null, c.amount),
      net: pilih("net", positif(it.netto), c.net),
      gross: pilih("gross", positif(it.bruto), c.gross),
      package: c.package || "",
      dimensions: c.dimensions || "",
      _sumber: sumber,
      _barang: it,
      _nama: itemDisplayName(it),
      /* Nama untuk Database HS Code: Uraian jadwal. Barang lama (seluruh
         namanya di Uraian): uraian CIPL yang ringkas, kalau ada
         pasangannya. */
      _uraian: berkolom ? rapiBagianNama(it.namaBarang) : c.description || rapiBagianNama(it.namaBarang),
      _lengkap: berkolom || !c.description ? itemDisplayName(it) : cekRapiNama(`${c.description} ${c.type || ""}`),
    };
  };
  const SEMUA_CIPL = { nama: "cipl", hs: "cipl", qty: "cipl", unit: "cipl", amount: "cipl", net: "cipl", gross: "cipl" };
  // Nomor = Seri Barang pasangannya di draft, urut seri (cekNomoriMenurutSeri)
  const items = cekNomoriMenurutSeri(
    urutan.map((x, i) =>
      Object.assign(x.it ? dariJadwal(x.it, x.c || {}) : Object.assign({}, x.c, { _sumber: SEMUA_CIPL, _dariCipl: true }), { no: i + 1 }),
    ),
    decl,
    bc,
  );
  const out = Object.assign({}, cipl, { items });
  const totalJadwal = { net: false, gross: false, amount: false };
  const timpaTotal = (k, nilai) => {
    out["total_" + k] = nilai;
    delete out[`total_${k}_source`];
    delete out[`total_${k}_printed`];
    totalJadwal[k] = true;
  };
  const dariJadwalLengkap = (k) => items.every((x) => x[k] != null) && items.some((x) => x._sumber[k] === "jadwal");
  if (dariJadwalLengkap("net")) timpaTotal("net", bulat(items.reduce((jml, x) => jml + Number(x.net), 0), 3));
  if (dariJadwalLengkap("amount")) timpaTotal("amount", bulat(items.reduce((jml, x) => jml + Number(x.amount), 0), 2));
  const bruto = barang.reduce((jml, it) => jml + (positif(it.bruto) || 0), 0);
  if (bruto > 0 && !items.some((x) => x._dariCipl)) timpaTotal("gross", bulat(bruto, 3));
  return {
    cipl: out,
    items,
    totalJadwal,
    jumlahCipl: ciplItems.length,
    jumlahJadwal: barang.length,
    dariCipl: items.filter((x) => x._dariCipl).map((x) => x.no),
    tanpaPasanganCipl: urutan.filter((x) => x.it && !x.c).length,
    ciplTerlewat: ciplItems.length - urutan.filter((x) => x.c).length,
  };
}

/* Barang jadwal -> indeks barang CIPL pasangannya (-1 = tidak ada),
   menurut kata-kata namanya: nama lengkap CIPL (uraian + tipe + merek)
   sama dengan nama jadwal > termuat utuh di nama jadwal > uraiannya
   saja yang termuat (atau sebaliknya). Yang setara: urutan terdekat.
   Tiap barang CIPL dipakai sekali. Jumlahnya sama: yang tersisa
   dipasangkan menurut urutan. */
function cekPasangkanBarang(barang, ciplItems) {
  const kata = (v) => new Set(cekKunci(v).split(" ").filter(Boolean));
  const dalam = (a, b) => a.size > 0 && [...a].every((k) => b.has(k));
  const cipl = ciplItems.map((c) => ({ penuh: kata(`${c.description || ""} ${c.type || ""} ${c.brand || ""}`), uraian: kata(c.description) }));
  const dipakai = new Set();
  let terakhir = -1;
  const p = barang.map((it) => {
    const nama = kata(itemDisplayName(it));
    let pilih = -1;
    let nilai = 0;
    let jarak = Infinity;
    cipl.forEach((c, j) => {
      if (dipakai.has(j)) return;
      const n = dalam(c.penuh, nama) && dalam(nama, c.penuh) ? 3 : dalam(c.penuh, nama) ? 2 : dalam(c.uraian, nama) || dalam(nama, c.uraian) ? 1 : 0;
      const d = Math.abs(j - (terakhir + 1));
      if (n > nilai || (n && n === nilai && d < jarak)) [pilih, nilai, jarak] = [j, n, d];
    });
    if (pilih >= 0) {
      dipakai.add(pilih);
      terakhir = pilih;
    }
    return pilih;
  });
  if (barang.length === ciplItems.length) {
    p.forEach((j, i) => {
      if (j < 0 && !dipakai.has(i)) {
        p[i] = i;
        dipakai.add(i);
      }
    });
  }
  return p;
}

/* Urutan barang pembanding: urutan jadwal. Barang CIPL tanpa pasangan
   disisipkan sesudah barang pasangan barang CIPL sebelumnya -- tapi
   hanya kalau SEMUA barang jadwal berpasangan (jadwalnya memang kurang
   barang). Kalau tidak, barang CIPL itu bisa jadi barang jadwal yang
   namanya ditulis lain: tidak disisipkan supaya tidak terhitung dua
   kali (dilaporkan di bagian Kualitas data CIPL). */
function cekUrutanGabungan(barang, ciplItems, p) {
  const urutan = barang.map((it, i) => ({ it, c: p[i] >= 0 ? ciplItems[p[i]] : null, j: p[i] }));
  if (p.some((j) => j < 0)) return urutan;
  const sisipan = new Map(); // indeks barang jadwal (-1 = paling awal) -> barang CIPL sesudahnya
  ciplItems.forEach((c, j) => {
    if (p.includes(j)) return;
    let sebelum = -1;
    p.forEach((jj, i) => {
      if (jj < j && (sebelum < 0 || jj > p[sebelum])) sebelum = i;
    });
    if (!sisipan.has(sebelum)) sisipan.set(sebelum, []);
    sisipan.get(sebelum).push({ it: null, c, j });
  });
  const hasil = (sisipan.get(-1) || []).slice();
  urutan.forEach((x, i) => hasil.push(x, ...(sisipan.get(i) || [])));
  return hasil;
}

/* KOLOM BARANG CEISA, jadwal vs draft, kolom demi kolom -- nama baris
   memakai nama kolom CEISA-nya. */
const CEK_KOLOM_BARANG = [
  ["kodeBarang", "Kode Barang"],
  ["namaBarang", "Uraian"],
  ["merek", "Merek"],
  ["tipe", "Tipe"],
  ["ukuran", "Ukuran"],
  ["spesifikasiLain", "Spesifikasi Lain"],
];

/* Kolom barang draft per nomor barang: dari parseBcExcelWorkbook
   (kolomBarang -- kolom apa adanya, kode kondisi & negara asal ikut);
   kalau tidak terbaca, URAIAN / MEREK / TIPE / KODE NEGARA ASAL dari
   mesin. */
function cekKolomDraftPerNo(bc, decl) {
  const peta = new Map();
  ((decl && decl.items) || []).forEach((d) => {
    const kolom = { namaBarang: d.description, merek: d.brand, tipe: d.type };
    if (cekAda(d.origin)) kolom.negaraAsal = d.origin;
    peta.set(kunciSeri(d.no), kolom);
  });
  ((bc && bc.kolomBarang) || []).forEach((x) => {
    if (cekAda(x.seri)) peta.set(kunciSeri(x.seri), x.kolom);
  });
  return peta;
}

/* RINCIAN BARANG URUT SERI BARANG DRAFT.

   Draft CEISA (barangnya sudah urut SERI BARANG, cekBacaDraft) yang
   menentukan urutan rincian barang: "Barang n" = Seri Barang n, dan ia
   dibandingkan dengan barang jadwal / CIPL YANG SAMA -- bukan barang
   ke-n dari jadwal / CIPL, yang urutannya bisa lain. Pasangan dicari
   berlapis, seperti impor draft ke form jadwal: nama lengkap sama,
   Uraian sama, kata Uraian termuat di nama pasangannya, HS Code 8 digit
   sama, 6 digit awal sama, lalu sisanya menurut urutan. Tiap lapis
   menjalani Seri Barang berurutan, masing-masing mengambil barang
   pembanding PALING AWAL yang lolos dan belum terpakai -- barang kembar
   (nama & HS sama) tetap berpasangan menurut urutannya, yang pertama
   dengan yang pertama. `ciri`: [{ nama, uraian, hs }] barang
   pembanding. Hasil: Seri Barang pasangan tiap barang pembanding
   (null = tidak ada di draft). */
function cekSeriPasangan(ciri, decl, bc) {
  const draftItems = (decl && decl.items) || [];
  const seri = ciri.map(() => null);
  if (!draftItems.length || !ciri.length) return seri;
  const kata = (v) => new Set(cekKunci(v).split(" ").filter(Boolean));
  const sama = (a, b) => a.size > 0 && a.size === b.size && [...a].every((k) => b.has(k));
  const termuat = (a, b) => a.size > 0 && [...a].every((k) => b.has(k));
  const siapkan = (nama, uraian, hs) => ({ nama: kata(nama), uraian: kata(uraian), hs: cekDigit(hs) });
  const kolomDraft = cekKolomDraftPerNo(bc, decl);
  const draft = draftItems.map((d) => {
    const k = kolomDraft.get(kunciSeri(d.no)) || {};
    const uraian = cekAda(k.namaBarang) ? k.namaBarang : d.description;
    return Object.assign(siapkan(itemDisplayName(Object.assign({}, k, { namaBarang: uraian })), uraian, d.hs), { seri: d.no });
  });
  const pembanding = ciri.map((x) => siapkan(x.nama, x.uraian, x.hs));
  const LAPISAN = [
    (d, c) => d.nama.size > 0 && sama(c.nama, d.nama),
    (d, c) => d.uraian.size > 0 && sama(c.uraian, d.uraian),
    (d, c) => d.uraian.size > 0 && (termuat(c.uraian, d.nama) || termuat(d.uraian, c.nama)),
    (d, c) => d.hs.length >= 8 && c.hs.slice(0, 8) === d.hs.slice(0, 8),
    (d, c) => d.hs.length >= 6 && c.hs.length >= 6 && c.hs.slice(0, 6) === d.hs.slice(0, 6),
    () => true,
  ];
  const terpasang = new Set(); // draft yang sudah berpasangan
  const dipakai = new Set(); // indeks barang pembanding yang sudah berpasangan
  LAPISAN.forEach((cocok) =>
    draft.forEach((d) => {
      if (terpasang.has(d)) return;
      const i = pembanding.findIndex((c, j) => !dipakai.has(j) && cocok(d, c));
      if (i < 0) return;
      seri[i] = d.seri;
      dipakai.add(i);
      terpasang.add(d);
    }),
  );
  return seri;
}

/* Barang pembanding (bentuk barang CIPL mesin) bernomor Seri Barang
   pasangannya, urut seri; yang tidak ada di draft menyusul sesudah seri
   terakhir. `_indeksAsal` = posisinya sebelum diurutkan (penyelesai HS
   memakainya untuk barang CIPL). */
function cekNomoriMenurutSeri(items, decl, bc) {
  const seri = cekSeriPasangan(
    items.map((x) => ({
      nama: x._nama || [x.description, x.brand, x.type].filter(cekAda).join(" "),
      uraian: x._barang ? rapiBagianNama(x._barang.namaBarang) : x.description,
      hs: x.hs,
    })),
    decl,
    bc,
  );
  let berikut = ((decl && decl.items) || []).reduce((m, d) => Math.max(m, Number(d.no) || 0), 0);
  return items
    .map((x, i) => Object.assign({}, x, { no: seri[i] != null ? seri[i] : ++berikut, _indeksAsal: i }))
    .sort((a, b) => Number(a.no) - Number(b.no));
}

/* Baris kolom barang satu barang jadwal vs draft.

   Barang yang memakai kolom CEISA (barangBerkolomCeisa): tiap kolom
   dibandingkan dengan kolom yang sama di draft -- huruf besar/kecil &
   spasi diabaikan, selebihnya harus sama. Tanda kosong ("-", "TANPA
   MEREK", kosong) setara satu sama lain.

   Barang lama -- seluruh namanya di Uraian, kolom CEISA lainnya kosong:
   satu baris Uraian, dibandingkan per kata dengan gabungan kolom draft
   (cekBandingNama). */
function cekBarisKolomBarang(no, it, kd, sumber) {
  const draft = kd || {};
  const teks = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const baris = (kolom, status, kiri, kanan, catatan) => ({
    section: "ITEM",
    field: `Item ${no} ${kolom}`,
    status,
    severity: status === "MISMATCH" ? "ERROR" : status === "INFO" ? "INFO" : "OK",
    cipl: kiri,
    pib: kanan,
    cipl_display: cekAda(kiri) ? kiri : "—",
    pib_display: cekAda(kanan) ? kanan : "—",
    expected_note: catatan || "",
    left_source: sumber,
  });
  if (!barangBerkolomCeisa(it)) {
    const nama = itemDisplayName(it);
    const r = cekBandingNama(nama, draft);
    const lama = tt("Barang lama: seluruh namanya di Uraian, jadi dibandingkan per kata dengan gabungan kolom barang draft.", "Older item: its whole name is in the Description, so it is compared word by word with the draft's item columns combined.");
    return [baris("Uraian", r.status, nama, r.pib, [lama, r.expected_note].filter(Boolean).join(" "))];
  }
  return CEK_KOLOM_BARANG.map(([k, kolom]) => {
    const j = teks(it[k]);
    const d = teks(draft[k]);
    const jKosong = !rapiBagianNama(j);
    const dKosong = !rapiBagianNama(d);
    const sama = j.toUpperCase() === d.toUpperCase();
    // Tanda kosong yang ditulis berbeda di kedua sisi ("-" vs "TANPA MEREK") disebut; isian yang memang kosong tidak
    if (jKosong && dKosong) return baris(kolom, "MATCH", j, d, sama || !j || !d ? "" : tt("Sama-sama kosong; tanda kosongnya ditulis berbeda.", "Both empty; the empty marker is written differently."));
    if (sama) return baris(kolom, "MATCH", j, d);
    return baris(kolom, "MISMATCH", j, d, jKosong ? tt("Kosong di jadwal.", "Empty on the schedule.") : dKosong ? tt("Kosong di draft.", "Empty in the draft.") : "");
  });
}

/* Barang lama (satu teks nama) vs kolom barang draft. MATCH bila
   kata-katanya sama dengan gabungan URAIAN, MEREK, TIPE, UKURAN &
   SPESIFIKASI LAIN -- urutan & tanda baca diabaikan: "TYRE MOLD - PS72
   225/50R17 - KUMHO" = URAIAN "TYRE MOLD" + MEREK "KUMHO" + TIPE "PS72
   225/50R17". INFO bila URAIAN draft termuat utuh di nama jadwal
   (kolom lainnya ditulis lain atau tidak ada). Selain itu MISMATCH. */
function cekBandingNama(nama, kd) {
  if (!kd) return {};
  const draft = rakitBagianNama(["namaBarang", "merek", "tipe", "ukuran", "spesifikasiLain"].map((k) => ({ teks: rapiBagianNama(kd[k]) })))
    .map((b) => b.teks)
    .join(" ");
  const kata = (v) => new Set(cekKunci(v).split(" ").filter(Boolean));
  const j = kata(nama);
  const dr = kata(draft);
  const uraian = [...kata(rapiBagianNama(kd.namaBarang))];
  const sama = dr.size > 0 && dr.size === j.size && [...dr].every((k) => j.has(k));
  const status = sama ? "MATCH" : uraian.length && uraian.every((k) => j.has(k)) ? "INFO" : "MISMATCH";
  const catatan =
    status === "INFO"
      ? tt("URAIAN draft termuat di nama barang jadwal; merek / tipe / ukurannya berbeda atau tidak tertulis.", "The draft's URAIAN is in the schedule's item name; its brand / type / size differs or is not written.")
      : sama && cekKunci(nama) !== cekKunci(draft)
        ? tt("Kata-katanya sama dengan gabungan kolom barang draft; urutan & tanda baca diabaikan.", "Same words as the draft's item columns combined; order & punctuation are ignored.")
        : "";
  return { status, severity: status === "MISMATCH" ? "ERROR" : status === "INFO" ? "INFO" : "OK", pib: draft, pib_display: draft, expected_note: catatan };
}

/* KODE KONDISI BARANG (PIB saja -- PEB tidak memuatnya) & KODE NEGARA
   ASAL satu barang jadwal vs kolom yang sama di draft (sheet BARANG).
   Yang dibandingkan KODENYA: "1" = "1 - BARU", "KR" = "KOREA, REPUBLIC
   OF". Kosong di jadwal: INFO (barang lama yang belum diisi). Kolomnya
   tidak ada di draft: INFO. Ada tapi kosong: MISMATCH. */
function cekBarisKodeBarang(no, it, kd, sumber, isPib) {
  const draft = kd || {};
  const rows = [];
  const baris = (kolom, status, kiri, kanan, catatan) => ({
    section: "ITEM",
    field: `Item ${no} ${kolom}`,
    status,
    severity: status === "MISMATCH" ? "ERROR" : status === "INFO" ? "INFO" : "OK",
    cipl: kiri,
    pib: kanan,
    cipl_display: cekAda(kiri) ? kiri : tt("Belum diisi", "Not filled in"),
    pib_display: cekAda(kanan) ? kanan : "—",
    expected_note: catatan || "",
    left_source: sumber,
  });
  const satu = (kolom, kunci, kolomCeisa, baku, label) => {
    const j = baku(it[kunci]);
    const d = baku(draft[kunci]);
    if (!j && !d) return;
    if (!j) return rows.push(baris(kolom, "INFO", "", label(d), tt("Belum diisi di jadwal.", "Not filled in on the schedule.")));
    if (!(kunci in draft)) return rows.push(baris(kolom, "INFO", label(j), "", tt(`Draft tidak memuat kolom ${kolomCeisa}.`, `The draft has no ${kolomCeisa} column.`)));
    if (!d) return rows.push(baris(kolom, "MISMATCH", label(j), "", tt("Kosong di draft.", "Empty in the draft.")));
    rows.push(baris(kolom, j === d ? "MATCH" : "MISMATCH", label(j), label(d), j === d ? "" : tt(`${kolomCeisa} berbeda.`, `${kolomCeisa} differs.`)));
  };
  const negara = (v) => kodeNegara(v) || String(v == null ? "" : v).trim().toUpperCase();
  if (isPib) satu("Kode Kondisi Barang", "kondisiBarang", "KODE KONDISI BARANG", kodeKondisiBarang, labelKondisiBarang);
  satu("Kode Negara Asal", "negaraAsal", "KODE NEGARA ASAL", negara, labelNegara);
  return rows;
}

/* KETERANGAN FASILITAS & NO. URUT satu barang: fasilitas barang jadwal
   (SKB / Masterlist / COO di panel Fasilitas barangnya) vs dokumen yang
   DITAUTKAN ke Seri Barang-nya di draft (BARANGDOKUMEN). Dicocokkan
   menurut jenis & nomor dokumen (yang nomornya belum diisi di jadwal:
   jenisnya saja). Nilai kedua sisi ditulis dalam bentuk & urutan yang
   sama -- dokumen draft mengikuti urutan pasangannya di jadwal -- jadi
   yang sama terbaca sama; No. Urut (seri dokumen di sheet DOKUMEN) di
   catatan, bukan di nilainya. Dokumen yang ada di draft tetapi tidak
   ditautkan ke barang ini disebut: fasilitasnya tidak berlaku untuk
   barang itu. */
function cekBarisFasilitasBarang(no, it, bc, sumber) {
  if (!bc || !bc.fasilitasBarang) return [];
  const seri = kunciSeri(no);
  const dok = (bc.fasilitasBarang.find((x) => x.seri === seri) || {}).dokumen || [];
  const jadwal = (it.skb || []).filter((sk) => sk && sk.jenis);
  if (!dok.length && !jadwal.length) return [];
  const label = (sk) => [skbEntryLabel(sk), String(sk.nomor || "").trim()].filter(Boolean).join(" ");
  const samaJenis = (a, b) => a.jenis === b.jenis && (a.jenis !== "Lainnya" || cekKunci(a.jenisLainnya) === cekKunci(b.jenisLainnya));
  const cocok = (sk, d) => samaJenis(sk, d) && (!cekAlnum(sk.nomor) || cekAlnum(sk.nomor) === cekAlnum(d.nomor));
  const pasangan = jadwal.map(() => -1);
  const terpakai = new Set();
  jadwal.forEach((sk, i) => {
    const j = dok.findIndex((d, k) => !terpakai.has(k) && cocok(sk, d));
    if (j < 0) return;
    pasangan[i] = j;
    terpakai.add(j);
  });
  const kurang = jadwal.filter((sk, i) => pasangan[i] < 0);
  const lebih = dok.filter((d, k) => !terpakai.has(k));
  const urutDraft = pasangan.filter((j) => j >= 0).map((j) => dok[j]).concat(lebih);
  const semua = [].concat(...bc.fasilitasBarang.map((x) => x.dokumen), bc.fasilitasUmum || []);
  const catatan = [];
  if (kurang.length) {
    const rinci = kurang.map((sk) => {
      const ada = semua.find((d) => cocok(sk, d));
      return ada ? tt(`${label(sk)} (ada di sheet DOKUMEN, No. Urut ${ada.noUrut}, tetapi tidak ditautkan ke barang ini)`, `${label(sk)} (in the DOKUMEN sheet, Seq. No. ${ada.noUrut}, but not linked to this item)`) : label(sk);
    });
    catatan.push(tt(`Tidak ditautkan ke barang ini di draft: ${rinci.join("; ")}.`, `Not linked to this item in the draft: ${rinci.join("; ")}.`));
  }
  if (lebih.length) catatan.push(tt(`Tidak ada di barang jadwal: ${lebih.map(label).join("; ")}.`, `Not on the schedule item: ${lebih.map(label).join("; ")}.`));
  if (urutDraft.length) {
    const urut = urutDraft.map((d) => `${skbEntryLabel(d)} ${d.noUrut}`).join(", ");
    catatan.push(tt(`No. Urut di draft: ${urut}.`, `Seq. No. in the draft: ${urut}.`));
  }
  const status = kurang.length || lebih.length ? "MISMATCH" : "MATCH";
  const tanpa = tt("Tanpa fasilitas", "No facility");
  const kiri = jadwal.map(label).join("; ");
  const kanan = urutDraft.map(label).join("; ");
  return [
    {
      section: "ITEM",
      field: `Item ${no} Fasilitas & No. Urut`,
      status,
      severity: status === "MISMATCH" ? "ERROR" : "OK",
      cipl: kiri,
      pib: kanan,
      cipl_display: kiri || tanpa,
      pib_display: kanan || tanpa,
      expected_note: catatan.join(" "),
      left_source: sumber,
    },
  ];
}

/* Seluruh baris CEISA satu barang jadwal: kolom barang, kode kondisi &
   negara asal, fasilitas & no. urut. */
function cekBlokBarang(no, it, kd, bc, sumber, isPib) {
  return cekBarisKolomBarang(no, it, kd, sumber).concat(cekBarisKodeBarang(no, it, kd, sumber, isPib), cekBarisFasilitasBarang(no, it, bc, sumber));
}

/* Baris hasil mesin sesudah barangnya diambil dari jadwal: sumber tiap
   nilai (Jadwal / CIPL), kolom barang CEISA kolom demi kolom
   (cekBarisKolomBarang), baris "tidak ada" memakai istilah jadwal,
   total yang dihitung dari jadwal ditandai. */
function cekTandaiBarangJadwal(res, gabung, decl, bc) {
  const JADWAL = tt("Jadwal", "Schedule");
  const perNo = new Map(gabung.items.map((x) => [String(x.no), x]));
  const kolomDraft = cekKolomDraftPerNo(bc, decl);
  /* Barang jadwal: baris nama mesin (Description, Type, Brand) diganti
     baris CEISA barangnya (cekBlokBarang) -- sesudah baris HS Code-nya,
     atau di baris pertama barang itu kalau mesin tidak memeriksa HS. */
  const blok = new Map();
  gabung.items.forEach((x) => {
    if (x._barang) blok.set(String(x.no), cekBlokBarang(x.no, x._barang, kolomDraft.get(kunciSeri(x.no)), bc, JADWAL, decl.type === "PIB"));
  });
  const ditaruh = new Set();
  res.checks = res.checks.flatMap((x) => {
    const m = /^Item (\S+) (.+)$/.exec(x.field);
    const baris = m && blok.get(m[1]);
    if (!baris) return [x];
    // Barang jadwal yang tidak ada di draft: tidak ada kolom draft untuk dibandingkan
    if (m[2] === "existence") {
      ditaruh.add(m[1]);
      return [x];
    }
    const pertama = !ditaruh.has(m[1]);
    ditaruh.add(m[1]);
    if (/^(?:Description|Type \/ Specification|Brand)$/.test(m[2])) return pertama ? baris : [];
    if (!pertama) return [x];
    return m[2] === "HS Code" ? [x, ...baris] : [...baris, x];
  });
  const KOLOM = [[/ HS Code$/, "hs"], [/ (Description|Type \/ Specification|Brand)$/, "nama"], [/ Quantity$/, "qty"], [/ Unit$/, "unit"], [/ Amount \//, "amount"], [/ Net Weight$/, "net"]];
  res.checks.forEach((x) => {
    if (x.section !== "ITEM") {
      const total = x.field === "Net Weight Total" ? "net" : x.field === "Gross Weight Total" ? "gross" : /^Total Amount \//.test(x.field) ? "amount" : "";
      if (total && gabung.totalJadwal[total]) x.left_source = JADWAL;
      return;
    }
    let m = /^Item (\S+) existence$/.exec(x.field);
    if (m) {
      const it = perNo.get(m[1]);
      Object.assign(x, { field: `Item ${m[1]}`, cipl_display: it ? it._nama || it.description : x.cipl_display, pib_display: tt("Tidak ada di draft", "Not in the draft"), left_source: JADWAL });
      return;
    }
    m = /^(?:PIB|PEB) Item (\S+) not found in CIPL$/.exec(x.field);
    if (m) {
      Object.assign(x, { field: `Item ${m[1]}`, cipl_display: tt("Tidak ada di jadwal", "Not on the schedule"), left_source: JADWAL });
      return;
    }
    m = /^Item (\S+) /.exec(x.field);
    const it = m && perNo.get(m[1]);
    const k = it && KOLOM.find(([re]) => re.test(x.field));
    if (!k) return;
    x.left_source = it._sumber[k[1]] === "cipl" ? "CIPL" : JADWAL;
    // Catatan HS mesin menyebut "CIPL"; kodenya dari jadwal
    if (k[1] === "hs" && it._sumber.hs === "jadwal" && x.expected_note) x.expected_note = x.expected_note.replace(/\bCIPL\b/g, "Jadwal");
  });
  // Barang CIPL & jadwal yang tidak sepadan
  const g = gabung;
  if (g.jumlahCipl !== g.jumlahJadwal || g.tanpaPasanganCipl || g.ciplTerlewat) {
    const id = [`CIPL memuat ${g.jumlahCipl} barang, jadwal ${g.jumlahJadwal}.`];
    const en = [`The CIPL lists ${g.jumlahCipl}, the schedule ${g.jumlahJadwal}.`];
    if (g.dariCipl.length) {
      id.push(`Barang ${g.dariCipl.join(", ")} tidak ada di jadwal, jadi diambil dari CIPL.`);
      en.push(`Item ${g.dariCipl.join(", ")} is not on the schedule, so it is taken from the CIPL.`);
    }
    if (g.ciplTerlewat && !g.dariCipl.length) {
      id.push(`${g.ciplTerlewat} barang CIPL tidak cocok dengan barang jadwal mana pun; barang dibandingkan menurut jadwal.`);
      en.push(`${g.ciplTerlewat} CIPL ${g.ciplTerlewat === 1 ? "item matches" : "items match"} no schedule item; items are compared as on the schedule.`);
    }
    if (g.tanpaPasanganCipl) {
      id.push(`${g.tanpaPasanganCipl} barang jadwal tanpa pasangan di CIPL.`);
      en.push(`${g.tanpaPasanganCipl} schedule ${g.tanpaPasanganCipl === 1 ? "item has" : "items have"} no CIPL counterpart.`);
    }
    res.checks.push({
      section: "CIPL", field: tt("Barang CIPL vs jadwal", "CIPL items vs schedule"), status: "INFO", severity: "INFO",
      cipl: g.jumlahCipl, pib: "", cipl_display: tt(`${g.jumlahCipl} barang`, `${g.jumlahCipl} ${g.jumlahCipl === 1 ? "item" : "items"}`), pib_display: "—",
      expected_note: tt(id.join(" "), en.join(" ")),
    });
  }
  res.barangDariJadwal = true;
}

/* ---------- baris tambahan dari data Shipment Schedule ---------- */

function cekBarisBaru(seksi, sumber) {
  return (field, status, kiri, kanan, catatan, ext) =>
    Object.assign(
      {
        section: seksi,
        field,
        status,
        severity: status === "MISMATCH" ? "ERROR" : status === "INFO" ? "INFO" : "OK",
        cipl: kiri,
        pib: kanan,
        cipl_display: cekAda(kiri) ? kiri : tt("Belum diisi", "Not filled in"),
        pib_display: cekAda(kanan) ? kanan : "—",
        expected_note: catatan || "",
        left_source: sumber,
      },
      ext || {},
    );
}

/* Pelabuhan jadwal ("PUS", "KRPUS", "Busan") vs kode draft (KRPUS):
   sama kodenya, sama induknya (terminal sekota), atau sama menurut
   aturan tempat mesin (kota = pelabuhan & bandaranya). */
function cekSamaPelabuhan(teks, kode) {
  const un = resolveUnlocode(teks);
  const k = String(kode || "").trim().toUpperCase();
  if (un && un === k) return true;
  if (un && resolvePortMetro(un) && resolvePortMetro(un) === resolvePortMetro(k)) return true;
  return EximEngine.portEquivalent(teks, k);
}
function cekLabelPelabuhan(raw) {
  const e = resolvePortEntry(raw);
  return e ? `${e.unlocode} — ${e.name}` : String(raw || "").trim();
}

const CEK_KEMASAN = {
  BOX: "BX", BOXES: "BX", BX: "BX", PALLET: "PX", PALLETS: "PX", PLT: "PX", PLTS: "PX", PX: "PX",
  CARTON: "CT", CARTONS: "CT", CTN: "CT", CTNS: "CT", CT: "CT", CASE: "CS", CASES: "CS", CS: "CS",
  CRATE: "CR", CRATES: "CR", CR: "CR", DRUM: "DR", DRUMS: "DR", DR: "DR", ROLL: "RO", ROLLS: "RO", RO: "RO",
  BAG: "BG", BAGS: "BG", BG: "BG", PACKAGE: "PK", PACKAGES: "PK", PKG: "PK", PKGS: "PK", PK: "PK", COLLI: "PK", KOLI: "PK",
};
const cekKodeKemasan = (v) => CEK_KEMASAN[cekAlnum(v)] || cekAlnum(v);
/* "3 PK, 1 PALLET" -> [{jumlah: 3, satuan: "PK"}, {jumlah: 1, satuan: "PALLET"}] */
function cekUraiKemasan(teks) {
  const out = [];
  String(teks || "").replace(/(\d+(?:[.,]\d+)?)\s*([A-Za-z]*)/g, (_, n, u) => {
    out.push({ jumlah: Number(String(n).replace(",", ".")) || 0, satuan: u.toUpperCase() });
    return "";
  });
  return out.filter((x) => x.jumlah > 0);
}

function cekTanggalJadwal(s, kolom) {
  const iso = String((s && (s[kolom + "Update"] || s[kolom])) || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

/* ISIAN JADWAL TERKAIT VS DRAFT -- jadwal RUJUKAN UTAMA pemeriksaan.

   Tiap baris ditaruh di bagian yang sama dengan isiannya di draft
   (Dokumen, Header, Pengangkutan, Nilai, Kemasan, Entitas) dan diberi
   `kunci` isiannya. Kalau CIPL ikut dibaca, baris mesin untuk isian
   yang sama (Invoice, pelabuhan, kapal, incoterm, kemasan, pihak, ...)
   diganti baris jadwal ini -- nilai CIPL-nya tidak ditampilkan. CIPL
   hanya dipakai untuk isian yang belum diisi di jadwal (cekRujukJadwal).

   Yang hanya bisa salah karena jadwalnya belum diperbarui (jumlah
   barang, total berat, ETD Export) cukup INFO; yang menentukan dokumen
   (aju, invoice, sarana angkut, pelabuhan, incoterm, freight, asuransi,
   NDPBM, kemasan, peti kemas, pihak) MISMATCH bila berbeda. Isian jadwal
   yang kosong selalu INFO. */
function cekBarisJadwal(s, decl, bc, opsi) {
  if (!s) return [];
  const E = EximEngine;
  const isPeb = decl.type === "PEB";
  const f = (bc && bc.fields) || {};
  const JADWAL = tt("Jadwal", "Schedule");
  const rows = [];
  // `dariJadwal`: isian jadwalnya ada -- baris mesin (CIPL) untuk kunci yang sama tidak dipakai
  const tambah = (seksi, kunci, field, status, kiri, kanan, catatan, ext) => {
    const r = cekBarisBaru(seksi, JADWAL)(field, status, kiri, kanan, catatan, ext);
    r.kunci = kunci;
    r.dariJadwal = cekAda(kiri);
    rows.push(r);
    return r;
  };
  const kosong = (seksi, kunci, field, kanan) => tambah(seksi, kunci, field, "INFO", "", kanan, tt("Belum diisi di jadwal.", "Not filled in on the schedule."));
  const tanpaDraft = (seksi, kunci, field, kiri, apa) => tambah(seksi, kunci, field, "INFO", kiri, "", tt(`Draft tidak mencantumkan ${apa}.`, `The draft does not state the ${apa}.`));

  // No. Aju
  if (cekDigit(decl.aju) || cekDigit(s.noAju)) {
    const field = tt("No. Aju", "Aju No.");
    const A = cekDigit(s.noAju);
    const B = cekDigit(decl.aju);
    if (!A) kosong("HEADER", "aju", field, decl.aju);
    else if (!B) tanpaDraft("HEADER", "aju", field, s.noAju, tt("nomor aju", "aju number"));
    else tambah("HEADER", "aju", field, A === B ? "MATCH" : "MISMATCH", s.noAju, decl.aju, A === B ? "" : tt("Nomor aju di jadwal berbeda dengan draft.", "The aju number on the schedule differs from the draft."), { aligned: true });
  }

  // Nomor daftar (draft yang sudah didaftarkan)
  if (cekAda(f.docNo) && cekAda(s.docNo)) {
    const sama = cekAlnum(f.docNo) === cekAlnum(s.docNo);
    tambah("HEADER", "docNo", isPeb ? tt("No. PEB (daftar)", "PEB No. (registration)") : tt("No. Daftar PIB", "PIB registration No."), sama ? "MATCH" : "MISMATCH", s.docNo, f.docNo);
  }

  // Invoice: semua nomor di jadwal harus ada sebagai dokumen 380, dan sebaliknya
  {
    const field = tt("No. Invoice", "Invoice No.");
    const jadwal = cekPecahNomor(s.invoice);
    const draft = (decl.documents || []).filter((d) => String(d.code).trim() === "380").map((d) => ({ teks: d.number, kunci: cekAlnum(d.number) }));
    const teksDraft = draft.map((x) => x.teks).join(", ");
    if (jadwal.length || draft.length) {
      if (!jadwal.length) kosong("DOCUMENT", "invoice", field, teksDraft);
      else if (!draft.length) tanpaDraft("DOCUMENT", "invoice", field, s.invoice, tt("invoice (kode dokumen 380)", "invoice (document code 380)"));
      else {
        const kurang = jadwal.filter((x) => !draft.some((y) => y.kunci === x.kunci));
        const lebih = draft.filter((y) => !jadwal.some((x) => x.kunci === y.kunci));
        const catatan = [];
        if (kurang.length) catatan.push(tt(`Tidak ada di draft: ${kurang.map((x) => x.teks).join(", ")}.`, `Not in the draft: ${kurang.map((x) => x.teks).join(", ")}.`));
        if (lebih.length) catatan.push(tt(`Tidak ada di jadwal: ${lebih.map((x) => x.teks).join(", ")}.`, `Not on the schedule: ${lebih.map((x) => x.teks).join(", ")}.`));
        tambah("DOCUMENT", "invoice", field, catatan.length ? "MISMATCH" : "MATCH", s.invoice, teksDraft, catatan.join(" ") || tt("Kode dokumen 380.", "Document code 380."));
      }
    }
  }

  // Tanggal invoice: jadwal vs tanggal dokumen 380
  {
    const field = tt("Tanggal Invoice", "Invoice Date");
    const dok = (decl.documents || []).find((d) => String(d.code).trim() === "380");
    const draft = dok ? E.normalizeDate(dok.date || "") : "";
    const jadwal = String(s.invoiceDate || "").slice(0, 10);
    if (jadwal || draft) {
      if (!jadwal) kosong("DOCUMENT", "invoiceDate", field, draft);
      else if (!draft) tanpaDraft("DOCUMENT", "invoiceDate", field, jadwal, tt("tanggal invoice (dokumen 380)", "invoice date (document 380)"));
      else tambah("DOCUMENT", "invoiceDate", field, jadwal === draft ? "MATCH" : "MISMATCH", jadwal, draft, tt("Kode dokumen 380.", "Document code 380."));
    }
  }

  /* Polis Asuransi (dokumen 530): nomor seperti invoice -- semua nomor
     di jadwal harus ada di draft dan sebaliknya -- lalu tanggalnya */
  {
    const field = DOK_PENGIRIMAN.polis.label;
    const daftar = dokPelengkapJadwal(s).polis || [];
    const jadwal = cekNomorDokumen(daftar);
    const kiri = ringkasDokumen(daftar).nomor;
    const kode = DOK_PENGIRIMAN.polis.kode;
    const docs = cekDokumenKode(decl, kode);
    const teksDraft = docs.map((d) => d.number).join(", ");
    if (jadwal.length || docs.length) {
      if (!jadwal.length) kosong("DOCUMENT", "polis", field, teksDraft);
      else if (!docs.length) tanpaDraft("DOCUMENT", "polis", field, kiri, tt(`polis asuransi (kode dokumen ${kode})`, `insurance policy (document code ${kode})`));
      else {
        const kurang = jadwal.filter((x) => !docs.some((d) => cekAlnum(d.number) === x.kunci));
        const lebih = docs.filter((d) => !jadwal.some((x) => x.kunci === cekAlnum(d.number)));
        const catatan = [];
        if (kurang.length) catatan.push(tt(`Tidak ada di draft: ${kurang.map((x) => x.teks).join(", ")}.`, `Not in the draft: ${kurang.map((x) => x.teks).join(", ")}.`));
        if (lebih.length) catatan.push(tt(`Tidak ada di jadwal: ${lebih.map((d) => d.number).join(", ")}.`, `Not on the schedule: ${lebih.map((d) => d.number).join(", ")}.`));
        tambah("DOCUMENT", "polis", field, catatan.length ? "MISMATCH" : "MATCH", kiri, teksDraft, catatan.join(" ") || tt(`Kode dokumen ${kode}.`, `Document code ${kode}.`));
      }
    }
    const tanggal = cekBarisTanggalDokumen(daftar, docs, kode);
    if (tanggal) tambah("DOCUMENT", "polisDate", tt("Tanggal Polis Asuransi", "Insurance Policy Date"), ...tanggal);
  }

  // Moda (KODE CARA ANGKUT)
  if (cekAda(f.transport) && cekAda(s.transport) && (s.transport === "laut" || s.transport === "udara")) {
    const label = (m) => (m === "udara" ? tt("Udara", "Air") : tt("Laut", "Sea"));
    tambah("TRANSPORT", "moda", tt("Moda", "Mode"), s.transport === f.transport ? "MATCH" : "MISMATCH", label(s.transport), label(f.transport), tt("Draft: KODE CARA ANGKUT di sheet PENGANGKUT.", "Draft: KODE CARA ANGKUT in the PENGANGKUT sheet."));
  }

  // Sarana angkut: nama kapal + voyage, atau nomor penerbangan
  {
    const nama = String((decl.carrier && decl.carrier["NAMA PENGANGKUT"]) || "").trim();
    const nomor = String((decl.carrier && decl.carrier["NOMOR PENGANGKUT"]) || "").trim();
    const kanan = [nama, nomor].filter(Boolean).join(" ");
    const kiri = [s.vessel, s.voyage].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
    const field = s.transport === "udara" ? tt("Penerbangan", "Flight") : tt("Kapal / Voyage", "Vessel / Voyage");
    if (kanan || kiri) {
      if (!kiri) kosong("TRANSPORT", "kapal", field, kanan);
      else if (!kanan) tanpaDraft("TRANSPORT", "kapal", field, kiri, tt("sarana angkut", "means of transport"));
      else {
        const kapal = (v) => cekKunci(v).replace(/^(?:M V|MV|M T|MT|KM|K M|SS)\s+/, "");
        const kv = kapal(s.vessel);
        const kn = kapal(nama);
        const voyageSama = cekAlnum(s.voyage) === cekAlnum(nomor);
        let sama;
        let catatan = "";
        if (s.transport === "udara") {
          sama = (cekAlnum(nomor) && voyageSama) || cekAlnum(kiri) === cekAlnum(kanan) || cekAlnum(s.voyage) === cekAlnum(kanan);
          if (sama) catatan = tt("Nomor penerbangan dibandingkan tanpa spasi & tanda baca.", "Flight numbers are compared without spaces & punctuation.");
        } else {
          const kapalSama = !!kv && !!kn && (kv === kn || kv.includes(kn) || kn.includes(kv));
          sama = kapalSama && (voyageSama || (!cekAlnum(s.voyage) && !cekAlnum(nomor)));
          if (!sama) catatan = kapalSama ? tt("Nama kapal sama, voyage berbeda.", "Same vessel, different voyage.") : tt("Nama kapal berbeda.", "Different vessel name.");
        }
        tambah("TRANSPORT", "kapal", field, sama ? "MATCH" : "MISMATCH", kiri, kanan, catatan);
      }
    }
  }

  // Pelabuhan muat & tujuan
  const pelabuhan = (kunci, field, teks, kode) => {
    if (!cekAda(teks) && !cekAda(kode)) return;
    if (!cekAda(teks)) return kosong("HEADER", kunci, field, cekLabelPelabuhan(kode));
    if (!cekAda(kode)) return tanpaDraft("HEADER", kunci, field, cekLabelPelabuhan(teks), tt("kode pelabuhan", "port code"));
    const sama = cekSamaPelabuhan(teks, kode);
    tambah("HEADER", kunci, field, sama ? "MATCH" : "MISMATCH", cekLabelPelabuhan(teks), cekLabelPelabuhan(kode), sama ? "" : tt("Pelabuhan di jadwal berbeda dengan kode di draft.", "The port on the schedule differs from the code in the draft."));
  };
  pelabuhan("muat", tt("Pelabuhan muat", "Port of loading"), s.origin, decl.port_loading);
  pelabuhan("tujuan", tt("Pelabuhan tujuan", "Port of destination"), s.destination, decl.port_destination);

  // PEB: negara tujuan = negara pelabuhan tujuan jadwal
  if (isPeb && cekAda(decl.country_dest)) {
    const field = tt("Negara tujuan", "Country of destination");
    const kode = (typeof resolvePortCountry === "function" && resolvePortCountry(s.destination)) || E.countryFromDestination(s.destination || "") || "";
    const draft = String(decl.country_dest).trim().toUpperCase();
    if (!cekAda(s.destination)) kosong("HEADER", "negaraTujuan", field, labelNegara(draft));
    else if (cekAda(kode)) {
      const sama = String(kode).toUpperCase() === draft;
      tambah("HEADER", "negaraTujuan", field, sama ? "MATCH" : "MISMATCH", labelNegara(kode), labelNegara(draft), tt("Negara pelabuhan tujuan jadwal vs KODE NEGARA TUJUAN draft.", "Country of the schedule's port of destination vs KODE NEGARA TUJUAN in the draft."));
    }
  }

  // Incoterm
  if (cekAda(s.incoterm) || cekAda(decl.incoterm)) {
    const field = "Incoterm";
    if (!cekAda(s.incoterm)) kosong("VALUE", "incoterm", field, decl.incoterm);
    else if (!cekAda(decl.incoterm)) tanpaDraft("VALUE", "incoterm", field, s.incoterm, "incoterm");
    else tambah("VALUE", "incoterm", field, E.norm(s.incoterm) === E.norm(decl.incoterm) ? "MATCH" : "MISMATCH", s.incoterm, decl.incoterm);
  }

  /* Freight, asuransi, NDPBM -- jadwal menyimpan 0 untuk yang belum
     diisi. `nolWajar`: incoterm-nya memang tidak memuat ongkos itu (FOB
     tanpa freight, selain CIF/CIP tanpa asuransi), jadi draft yang
     mengisi 0 tidak salah -- cukup INFO. */
  const incoterm = String(decl.incoterm || s.incoterm || "").trim().toUpperCase();
  const uang = (kunci, field, a, b, nolWajar) => {
    const A = Number(a) || 0;
    const B = b == null || b === "" ? null : Number(b);
    if (!A && !B) return;
    if (!A) return kosong("VALUE", kunci, field, cekAngka(B));
    if (B == null) return tanpaDraft("VALUE", kunci, field, cekAngka(A), field);
    const beda = Math.round((A - B) * 1000) / 1000;
    if (B === 0 && nolWajar) return tambah("VALUE", kunci, field, "INFO", A, B, tt(`Incoterm ${incoterm}: draft tidak memuat ${field.toLowerCase()} (0). Jadwal mencatat ${cekAngka(A)}.`, `Incoterm ${incoterm}: the draft carries no ${field.toLowerCase()} (0). The schedule records ${cekAngka(A)}.`), { numeric: true, diff: beda });
    tambah("VALUE", kunci, field, Math.abs(beda) <= 0.01 ? "MATCH" : "MISMATCH", A, B, "", { numeric: true, diff: beda });
  };
  uang("freight", "Freight", s.freight, decl.freight, /^(?:EXW|FCA|FAS|FOB)$/.test(incoterm));
  uang("asuransi", tt("Asuransi", "Insurance"), s.insurance, decl.insurance, !!incoterm && !/^(?:CIF|CIP)$/.test(incoterm));
  uang("ndpbm", "NDPBM", s.ndpbm, decl.ndpbm, false);

  // Kemasan: jumlah harus sama; jenisnya dibandingkan menurut maknanya (BOX = BX)
  {
    const field = tt("Kemasan", "Packages");
    const pk = cekUraiKemasan(s.package);
    const dk = (decl.packages_list || []).length ? decl.packages_list : decl.packages_total ? [{ count: decl.packages_total, code: "" }] : [];
    const teksDraft = dk.map((x) => [cekAngka(x.count), x.code].filter(Boolean).join(" ")).join(", ");
    if (pk.length || dk.length) {
      if (!pk.length) kosong("PACKING", "kemasan", field, teksDraft);
      else if (!dk.length) tanpaDraft("PACKING", "kemasan", field, s.package, tt("kemasan", "packages"));
      else {
        const totA = pk.reduce((n, x) => n + x.jumlah, 0);
        const totB = dk.reduce((n, x) => n + (Number(x.count) || 0), 0);
        if (Math.abs(totA - totB) > 0.001) tambah("PACKING", "kemasan", field, "MISMATCH", s.package, teksDraft, tt(`Jumlah kemasan berbeda: ${cekAngka(totA)} di jadwal, ${cekAngka(totB)} di draft.`, `Different package count: ${cekAngka(totA)} on the schedule, ${cekAngka(totB)} in the draft.`));
        else {
          const kodeDraft = new Set(dk.map((x) => cekKodeKemasan(x.code)).filter(Boolean));
          const lain = pk.filter((x) => x.satuan && kodeDraft.size && !kodeDraft.has(cekKodeKemasan(x.satuan)));
          tambah("PACKING", "kemasan", field, lain.length ? "INFO" : "MATCH", s.package, teksDraft, lain.length ? tt("Jumlahnya sama, jenis kemasannya ditulis berbeda.", "Same count, the package type is written differently.") : "");
        }
      }
    }
  }

  // Peti kemas: nomor, ukuran & tipe tiap kontainer vs Container/Seal Number jadwal
  cekBarisPetiKemas(s, decl, bc).forEach((r) => {
    r.kunci = "kontainer";
    r.dariJadwal = cekAda(r.cipl);
    rows.push(r);
  });

  // Pihak: Import = Shipper (entitas 9 / 10), Export = Buyer / Consignee (entitas 8 / 6)
  {
    const kode = isPeb ? ["8", "6"] : ["9", "10"];
    const field = isPeb ? tt("Buyer / Consignee", "Buyer / Consignee") : tt("Shipper / Supplier", "Shipper / Supplier");
    const nama = (decl.entities || []).filter((e) => kode.includes(String(e.code).trim()) && cekAda(e.name)).map((e) => e.name);
    if (cekAda(s.party) && nama.length) {
      const a = E.normName(s.party);
      const persis = nama.find((n) => E.normName(n) === a);
      const mirip = persis || nama.find((n) => a.length >= 4 && (E.normName(n).includes(a) || a.includes(E.normName(n))));
      tambah("ENTITY", "pihak", field, mirip ? "MATCH" : "MISMATCH", s.party, mirip || nama.join(" / "),
        mirip
          ? persis ? tt(`Entitas ${kode.join(" / ")}.`, `Entity ${kode.join(" / ")}.`) : tt(`Entitas ${kode.join(" / ")}; nama di jadwal ditulis lebih singkat.`, `Entity ${kode.join(" / ")}; the name on the schedule is shortened.`)
          : tt(`Nama di jadwal berbeda dengan entitas ${kode.join(" / ")} di draft.`, `The name on the schedule differs from entity ${kode.join(" / ")} in the draft.`),
      );
    }
  }

  /* Barang: jumlah baris & total berat -- jadwal mungkin belum diperbarui,
     jadi INFO. Barang pembandingnya sudah dari jadwal (cekBarangGabungan):
     barang & total berat sudah dibandingkan di bagian Barang & Berat. */
  if (!(opsi && opsi.barangDariJadwal)) {
    const items = s.items || [];
    if (items.length && (decl.items || []).length) {
      const sama = items.length === decl.items.length;
      tambah("HEADER", "jumlahBarang", tt("Jumlah barang", "Number of items"), sama ? "MATCH" : "INFO", items.length, decl.items.length, sama ? "" : tt("Jumlah baris barang di jadwal berbeda dengan draft.", "The schedule has a different number of item lines."), { numeric: true, diff: items.length - decl.items.length });
    }
    const total = (k) => items.reduce((n, it) => n + (Number(it[k]) || 0), 0);
    [["netto", decl.net, tt("Total netto (kg)", "Total net weight (kg)")], ["bruto", decl.gross, tt("Total bruto (kg)", "Total gross weight (kg)")]].forEach(([k, d, field]) => {
      const A = Math.round(total(k) * 1000) / 1000;
      if (!(A > 0) || !(Number(d) > 0)) return;
      const beda = Math.round((A - d) * 1000) / 1000;
      tambah("WEIGHT", k, field, Math.abs(beda) <= 0.01 ? "MATCH" : "INFO", A, d, Math.abs(beda) <= 0.01 ? "" : tt("Berat di jadwal berbeda dengan draft.", "The weight on the schedule differs from the draft."), { numeric: true, diff: beda });
    });
  }

  /* PEB: ETD jadwal vs TANGGAL EKSPOR -- perkiraan, jadi INFO bila
     berbeda. ETD vs tanggal B/L-AWB dan ETA vs TANGGAL TIBA tidak
     diperiksa. */
  if (isPeb) {
    const etd = cekTanggalJadwal(s, "etd");
    const ex = E.normalizeDate(decl.export_date || "");
    if (etd && ex) tambah("TRANSPORT", "etd", tt("ETD ↔ tanggal ekspor", "ETD ↔ export date"), ex === etd ? "MATCH" : "INFO", etd, ex, ex === etd ? "" : tt("TANGGAL EKSPOR di draft berbeda dengan ETD jadwal.", "TANGGAL EKSPOR in the draft differs from the schedule's ETD."));
  }
  return rows;
}

/* PETI KEMAS -- "Nomor, Ukuran, dan Tipe Peti Kemas" draft (sheet
   KONTAINER) vs isian Container/Seal Number jadwal, satu baris per
   kontainer. Bentuk isian jadwal: "NOMOR / UKURAN / TIPE" per kontainer
   (teksKontainer, helpers.js -- yang ditulis impor CEISA); yang diketik
   bebas juga terbaca: ukuran 20 / 40 / 45 (40', 40HC, 1x40) dan tipe
   FCL / LCL di dekat nomornya. Tipe yang tidak tertulis di situ diambil
   dari isian Jenis Muatan jadwal. Nomor segel diabaikan. */
const CEK_UKURAN_KONTAINER = /^(?:\d+X)?(20|40|45|53)(?:'|’|FT|FEET|HC|HQ|GP|DC|DV|RF|RH|OT|FR|TK|PL)*$/;

function cekUraiKontainer(teks) {
  const s = String(teks || "").toUpperCase();
  const temu = [...s.matchAll(CEK_POLA_KONTAINER)];
  if (!temu.length) return [];
  const baca = (bagian) => {
    const token = bagian.replace(/(\d)\s*X\s*(?=\d)/g, "$1X").split(/[\s/,;()[\]:]+/).filter(Boolean);
    const ukuran = token.map((kata) => CEK_UKURAN_KONTAINER.exec(kata)).find(Boolean);
    return { ukuran: ukuran ? ukuran[1] : "", tipe: token.find((kata) => kata === "FCL" || kata === "LCL") || "" };
  };
  // Ukuran / tipe ditulis SEBELUM nomornya ("40' FCL TGHU1234567") bila teks di depan kontainer pertama memuatnya
  const awal = baca(s.slice(0, temu[0].index));
  const sebelum = !!(awal.ukuran || awal.tipe);
  return temu.map((m, i) => {
    const mulai = sebelum ? (i ? temu[i - 1].index + temu[i - 1][0].length : 0) : m.index;
    const akhir = sebelum ? m.index + m[0].length : i + 1 < temu.length ? temu[i + 1].index : s.length;
    const bagian = sebelum ? s.slice(mulai, m.index) : s.slice(m.index + m[0].length, akhir);
    return Object.assign({ nomor: cekAlnum(m[0]), teks: s.slice(mulai, akhir).replace(/^[\s,;]+|[\s,;]+$/g, "") }, baca(bagian));
  });
}

function cekBarisPetiKemas(s, decl, bc) {
  const baris = cekBarisBaru("PACKING", tt("Jadwal", "Schedule"));
  const field = tt("Nomor, Ukuran & Tipe Peti Kemas", "Container No., Size & Type");
  const draft = ((bc && bc.kontainer) || (decl.containers || []).map((k) => ({ nomor: k.number, ukuran: k.size, jenis: k.type })))
    .map((k) => ({ nomor: cekAlnum(k.nomor), ukuran: cekDigit(k.ukuran), jenis: String(k.jenis || "").trim().toUpperCase() }))
    .filter((k) => k.nomor);
  const jadwal = cekUraiKontainer(s.container);
  const teksDraft = (k) => teksKontainer({ nomor: k.nomor, ukuran: k.ukuran, jenis: k.jenis });
  const rows = [];
  if (!jadwal.length && !draft.length) return rows;
  if (!jadwal.length) {
    rows.push(baris(field, "INFO", s.container, draft.map(teksDraft).join(", "), cekAda(s.container) ? tt("Nomor kontainer tidak terbaca di Container/Seal Number jadwal.", "No container number could be read from the schedule's Container/Seal Number.") : tt("Belum diisi di jadwal.", "Not filled in on the schedule.")));
    return rows;
  }
  if (!draft.length) {
    rows.push(baris(field, "INFO", s.container, "", tt("Draft tidak mencantumkan kontainer (sheet KONTAINER).", "The draft states no containers (KONTAINER sheet).")));
    return rows;
  }
  const muatanJadwal = String(s.muatan || "").trim().toUpperCase();
  jadwal.forEach((j) => {
    const d = draft.find((k) => k.nomor === j.nomor);
    if (!d) return rows.push(baris(field, "MISMATCH", j.teks, "", tt(`${j.nomor} tidak ada di draft.`, `${j.nomor} is not in the draft.`)));
    const beda = [];
    const belum = [];
    const catatan = [];
    if (d.ukuran) {
      if (!j.ukuran) belum.push(tt("ukuran", "size"));
      else if (j.ukuran !== d.ukuran) beda.push(tt(`ukuran ${j.ukuran} di jadwal, ${d.ukuran} di draft`, `size ${j.ukuran} on the schedule, ${d.ukuran} in the draft`));
    }
    const tipeDraft = muatanDariKode(d.jenis);
    const tipeJadwal = j.tipe || muatanJadwal;
    if (tipeDraft) {
      if (!tipeJadwal) belum.push(tt("tipe (FCL/LCL)", "type (FCL/LCL)"));
      else if (tipeJadwal !== tipeDraft) beda.push(tt(`tipe ${tipeJadwal} di jadwal, ${tipeDraft} di draft`, `type ${tipeJadwal} on the schedule, ${tipeDraft} in the draft`));
      else if (!j.tipe) catatan.push(tt("Tipe dari isian Jenis Muatan jadwal.", "Type from the schedule's Load Type."));
    } else if (d.jenis) catatan.push(tt(`KODE JENIS KONTAINER draft "${d.jenis}" tidak dibandingkan.`, `The draft's KODE JENIS KONTAINER "${d.jenis}" is not compared.`));
    if (beda.length) catatan.unshift(tt(`Berbeda: ${beda.join("; ")}.`, `Different: ${beda.join("; ")}.`));
    else if (belum.length) catatan.unshift(tt(`Nomor sama; ${belum.join(" & ")} belum tertulis di Container/Seal Number jadwal (tulis NOMOR / UKURAN / TIPE).`, `Same number; the ${belum.join(" & ")} is not written in the schedule's Container/Seal Number (write NUMBER / SIZE / TYPE).`));
    rows.push(baris(field, beda.length ? "MISMATCH" : belum.length ? "INFO" : "MATCH", j.teks, teksDraft(d), catatan.join(" ")));
  });
  draft
    .filter((k) => !jadwal.some((j) => j.nomor === k.nomor))
    .forEach((k) => rows.push(baris(field, "MISMATCH", "", teksDraft(k), tt(`${k.nomor} tidak ada di jadwal.`, `${k.nomor} is not on the schedule.`))));
  return rows;
}

/* JADWAL RUJUKAN UTAMA, CIPL MELENGKAPI. Baris mesin (CIPL vs draft)
   untuk isian yang juga dicatat jadwal diganti baris jadwalnya
   (cekBarisJadwal) di tempat yang sama -- nilai CIPL-nya tidak
   ditampilkan. Baris mesin dipakai hanya kalau jadwalnya belum mengisi
   isian itu DAN CIPL mencantumkannya; isian yang kosong di keduanya
   memakai baris "Belum diisi di jadwal". Baris CIPL diberi tanda
   sumber "CIPL".
   Kode kantor (Kode Kantor, Kantor Bongkar / Ekspor) tidak diperiksa;
   Moda dari mesin hanya tampil bila draft-nya sendiri tidak konsisten. */
const CEK_KUNCI_MESIN = {
  "Invoice Number": "invoice",
  "Invoice Date": "invoiceDate",
  "Vessel / Voyage": "kapal",
  "Port of Loading": "muat",
  "Port of Destination": "tujuan",
  "Country of Destination": "negaraTujuan",
  Incoterm: "incoterm",
  "Package Count": "kemasan",
  "Supplier / Seller (Entity 9/10)": "pihak",
  "Consignee (Entity 8)": "pihak",
  "Departure Date (CIPL)": "etd",
};

function cekRujukJadwal(checks, barisJadwal, cipl, adaJadwal) {
  const E = EximEngine;
  const perKunci = new Map();
  barisJadwal.forEach((y) => {
    if (!perKunci.has(y.kunci)) perKunci.set(y.kunci, []);
    perKunci.get(y.kunci).push(y);
  });
  // Pembeli (6) = pihak jadwal, kecuali third party invoicing (pembelinya Seller CIPL)
  const pihakKetiga = !!(cipl && E.norm(cipl.seller) && E.norm(cipl.exporter) && E.normName(cipl.seller) !== E.normName(cipl.exporter));
  const ditaruh = new Set();
  const out = [];
  checks.forEach((x) => {
    if (/^Kode Kantor\b/.test(x.field)) return;
    if (x.field === "Transport Mode") {
      if (x.status !== "MISMATCH") return;
      x.expected_note = String(x.expected_note || "").replace(/\s*Kode kantor mengikuti[^.]*\./i, "").replace(/\s*Kantor yang diharapkan:.*$/i, "").trim();
    }
    const kunci = x.field === "Buyer (Entity 6)" && !pihakKetiga ? "pihak" : CEK_KUNCI_MESIN[x.field];
    const jadwal = kunci && perKunci.get(kunci);
    if (jadwal) {
      if (jadwal.some((y) => y.dariJadwal) || !cekAda(x.cipl)) {
        if (!ditaruh.has(kunci)) out.push(...jadwal);
        ditaruh.add(kunci);
        return;
      }
      ditaruh.add(kunci); // isian jadwal kosong, CIPL mencantumkannya: baris CIPL yang dipakai
    }
    if (adaJadwal && !x.left_source) x.left_source = "CIPL";
    out.push(x);
  });
  barisJadwal.forEach((y) => {
    if (!ditaruh.has(y.kunci)) out.push(y);
  });
  return out;
}

/* Kode dokumen fasilitas & izin CEISA. 912/456/457/860/861 mengikuti
   KODE_DOKUMEN_FASILITAS (helpers.js) -- aturan yang sama dengan
   isi-otomatis form jadwal. */
const CEK_FASILITAS = [
  { jenis: "Masterlist", kode: ["912"], get label() { return "Masterlist"; } },
  { jenis: "PPN", kode: ["456"], get label() { return "SKB PPN"; } },
  { jenis: "PPH", kode: ["457"], get label() { return "SKB PPh"; } },
  { jenis: "E-COO", kode: ["860", "861"], get label() { return "COO"; } },
];

function cekDokumenKode(decl, kode) {
  const k = [].concat(kode);
  return (decl.documents || []).filter((d) => k.includes(String(d.code == null ? "" : d.code).trim()));
}

// Nomor dokumen pengiriman jadwal (daftar { nomor, tanggal }) untuk dibandingkan dengan draft
function cekNomorDokumen(daftar) {
  return (daftar || []).map((d) => String(d.nomor || "").trim()).filter((n) => cekAlnum(n).length >= 3).map((teks) => ({ teks, kunci: cekAlnum(teks) }));
}

/* Tanggal dokumen pengiriman (PI, LS, Polis Asuransi): tiap dokumen
   jadwal yang bertanggal vs dokumen draft yang nomornya sama -- atau,
   kalau jadwal hanya punya satu tanggal dan nomornya tidak ada di draft,
   dokumen draft pertama yang bertanggal. Hasil [status, jadwal, draft,
   catatan]; null kalau keduanya tidak bertanggal. */
function cekBarisTanggalDokumen(daftar, docs, kode) {
  const tanggalDok = (d) => (d ? EximEngine.normalizeDate(d.date || "") : "");
  const bertanggal = docs.filter((d) => tanggalDok(d));
  const milikJadwal = (daftar || []).filter((x) => x.tanggal);
  const pasangan = milikJadwal.map((x) => bertanggal.find((d) => cekAlnum(d.number) === cekAlnum(x.nomor)) || null);
  if (milikJadwal.length === 1 && !pasangan[0]) pasangan[0] = bertanggal[0] || null;
  const jadwal = milikJadwal.map((x) => String(x.tanggal).slice(0, 10)).join(", ");
  // Draft: tanggal dokumen yang nomornya ada di jadwal, kalau tidak semua dokumen draft yang bertanggal
  const sepadan = bertanggal.filter((d) => (daftar || []).some((x) => cekAlnum(x.nomor) === cekAlnum(d.number)));
  const draftSemua = (sepadan.length ? sepadan : bertanggal.slice(0, 1)).map(tanggalDok).join(", ");
  if (!jadwal && !bertanggal.length) return null;
  if (!jadwal) return ["INFO", "", draftSemua, tt("Belum diisi di jadwal.", "Not filled in on the schedule.")];
  if (!bertanggal.length) return ["INFO", jadwal, "", tt(`Draft tidak mencantumkan tanggal dokumen kode ${kode}.`, `The draft does not state the date of document code ${kode}.`)];
  const sama = pasangan.every((d, i) => d && tanggalDok(d) === String(milikJadwal[i].tanggal).slice(0, 10));
  const draft = pasangan.map((d) => tanggalDok(d) || "—").join(", ");
  return [sama ? "MATCH" : "MISMATCH", jadwal, draft, tt(`Kode dokumen ${kode}.`, `Document code ${kode}.`)];
}

/* FASILITAS & IZIN: dokumen di draft vs isian jadwal terkait. Dokumen
   912 TIDAK dibandingkan dengan halaman Masterlist (No. & tanggal SK,
   masa berlaku, realisasi) -- hanya dengan fasilitas barang jadwal. */
function cekBarisFasilitas(s, decl) {
  if (!s) return [];
  const rows = [];
  const baris = cekBarisBaru("FACILITY", tt("Jadwal", "Schedule"));
  const daftarNomor = (docs) => docs.map((d) => d.number).join(", ");

  /* PI (959) & LS (958): daftar dokumen jadwal -- tiap nomornya harus
     ada di draft -- lalu tanggalnya ("Tanggal PI" & "Tanggal LS") */
  const dok = dokPelengkapJadwal(s);
  [
    ["pi", tt("Tanggal PI", "PI Date")],
    ["ls", tt("Tanggal LS", "LS Date")],
  ].forEach(([jenis, fieldTanggal]) => {
    const { kode, label: field } = DOK_PENGIRIMAN[jenis];
    const daftar = dok[jenis] || [];
    const jadwal = cekNomorDokumen(daftar);
    const kiri = ringkasDokumen(daftar).nomor;
    const docs = cekDokumenKode(decl, kode);
    if (!jadwal.length && !docs.length) return;
    if (!jadwal.length) rows.push(baris(field, "INFO", "", daftarNomor(docs), tt(`Belum diisi di jadwal; draft memuat dokumen kode ${kode}.`, `Not filled in on the schedule; the draft holds document code ${kode}.`)));
    else if (!docs.length) rows.push(baris(field, "MISMATCH", kiri, "", tt(`Jadwal mencatat ${field}, tetapi dokumen kode ${kode} tidak ada di sheet DOKUMEN draft.`, `The schedule records the ${field}, but document code ${kode} is not in the draft's DOKUMEN sheet.`)));
    else {
      const kurang = jadwal.filter((x) => !docs.some((d) => cekAlnum(d.number) === x.kunci));
      rows.push(baris(field, kurang.length ? "MISMATCH" : "MATCH", kiri, daftarNomor(docs), kurang.length ? tt(`Tidak ada di draft: ${kurang.map((x) => x.teks).join(", ")}.`, `Not in the draft: ${kurang.map((x) => x.teks).join(", ")}.`) : tt(`Kode dokumen ${kode}.`, `Document code ${kode}.`)));
    }
    const tanggal = cekBarisTanggalDokumen(daftar, docs, kode);
    if (tanggal) rows.push(baris(fieldTanggal, ...tanggal));
  });

  // Fasilitas barang (SKB / Masterlist / COO) di jadwal vs dokumen fasilitas di draft
  const entri = [].concat(...(s.items || []).map((it) => it.skb || []));
  CEK_FASILITAS.forEach((fas) => {
    const milikJadwal = entri.filter((sk) => sk.jenis === fas.jenis);
    const docs = cekDokumenKode(decl, fas.kode);
    if (!milikJadwal.length && !docs.length) return;
    const nomorJadwal = [...new Set(milikJadwal.map((sk) => String(sk.nomor || "").trim()).filter(Boolean))];
    const kiri = nomorJadwal.join(", ") || (milikJadwal.length ? tt("Ditandai (tanpa nomor)", "Marked (no number)") : "");
    const field = tt(`Fasilitas ${fas.label}`, `Facility ${fas.label}`);
    if (!milikJadwal.length) return rows.push(baris(field, "INFO", "", daftarNomor(docs), tt(`Draft memuat dokumen ${fas.label} (kode ${fas.kode.join("/")}), tetapi belum ada barang jadwal yang ditandai berfasilitas ini.`, `The draft holds a ${fas.label} document (code ${fas.kode.join("/")}), but no item on the schedule is marked with this facility.`)));
    if (!docs.length) return rows.push(baris(field, "MISMATCH", kiri, "", tt(`Barang jadwal berfasilitas ${fas.label}, tetapi dokumennya (kode ${fas.kode.join("/")}) tidak ada di draft. Fasilitasnya tidak akan berlaku.`, `Items on the schedule carry the ${fas.label} facility, but its document (code ${fas.kode.join("/")}) is not in the draft. The facility will not apply.`)));
    const kurang = nomorJadwal.filter((n) => !docs.some((d) => cekAlnum(d.number) === cekAlnum(n)));
    rows.push(
      baris(field, kurang.length ? "MISMATCH" : "MATCH", kiri, daftarNomor(docs),
        kurang.length ? tt(`Nomor yang tidak ada di draft: ${kurang.join(", ")}.`, `Numbers not in the draft: ${kurang.join(", ")}.`) : nomorJadwal.length ? tt(`Kode dokumen ${fas.kode.join("/")}.`, `Document code ${fas.kode.join("/")}.`) : tt("Nomornya belum diisi di jadwal; hanya keberadaan dokumennya yang dibandingkan.", "The number is not filled in on the schedule; only the presence of the document is compared.")),
    );
  });
  return rows;
}

/* Tanpa CIPL: barang jadwal terkait vs barang draft, menurut urutan --
   barang jadwal ke-i dengan Seri Barang draft ke-i (decl.items sudah
   urut menurut seri, cekBacaDraft). Kolom barang CEISA kolom demi
   kolom, kode kondisi & negara asal, fasilitas & no. urut
   (cekBlokBarang), HS Code, jumlah, satuan & netto. */
function cekBarisBarangJadwal(s, decl, resolve, bc) {
  const E = EximEngine;
  const rows = [];
  const items = (s && s.items) || [];
  const sumber = tt("Jadwal", "Schedule");
  const kolomDraft = cekKolomDraftPerNo(bc, decl);
  // Barang jadwal dipasangkan ke Seri Barang draft menurut isinya, bukan urutannya (cekSeriPasangan)
  const seri = cekSeriPasangan(items.map((it) => ({ nama: itemDisplayName(it), uraian: rapiBagianNama(it.namaBarang), hs: it.hsCode })), decl, bc);
  const perSeri = new Map();
  seri.forEach((n, i) => {
    if (n != null) perSeri.set(kunciSeri(n), items[i]);
  });
  (decl.items || []).forEach((d) => {
    const it = perSeri.get(kunciSeri(d.no));
    const no = d.no;
    if (!it) {
      rows.push({ section: "ITEM", field: `Item ${no}`, status: "MISMATCH", severity: "ERROR", cipl: "", pib: d.description, cipl_display: tt("Tidak ada di jadwal", "Not on the schedule"), pib_display: d.description, expected_note: "", left_source: sumber });
      return;
    }
    const semu = { no, description: rapiBagianNama(it.namaBarang), type: "", hs: it.hsCode, _sumber: { hs: "jadwal" }, _nama: itemDisplayName(it), _uraian: rapiBagianNama(it.namaBarang) };
    const tandai = (r) => Object.assign(r, { left_source: sumber });
    const hs = E.hsCheckRow(`Item ${no} HS Code`, semu, d, resolve);
    if (hs) rows.push(tandai(hs));
    rows.push(...cekBlokBarang(no, it, kolomDraft.get(kunciSeri(no)), bc, sumber, decl.type === "PIB"));
    rows.push(tandai(E.compareNum(`Item ${no} Quantity`, it.qty, d.qty, "ITEM")));
    if (cekAda(it.satuan) && cekAda(d.unit)) rows.push(tandai(E.compareUnit(`Item ${no} Unit`, it.satuan, d.unit, "ITEM")));
    if (Number(it.netto) > 0 || d.net != null) rows.push(tandai(E.compareNum(`Item ${no} Net Weight`, it.netto, d.net, "ITEM")));
  });
  // Barang jadwal yang tidak ada di draft: sesudah seri terakhir
  let berikut = (decl.items || []).reduce((m, d) => Math.max(m, Number(d.no) || 0), 0);
  items.forEach((it, i) => {
    if (seri[i] != null) return;
    rows.push({ section: "ITEM", field: `Item ${++berikut}`, status: "MISMATCH", severity: "ERROR", cipl: it.namaBarang, pib: "", cipl_display: itemDisplayName(it), pib_display: tt("Tidak ada di draft", "Not in the draft"), expected_note: "", left_source: sumber });
  });
  return rows;
}

/* ---------- menjalankan pemeriksaan ---------- */

async function cekJalankan() {
  const nomor = ++cekKeadaan.jalanKe;
  const { cipl, decl, bc } = cekKeadaan;
  const s = cekJadwal();
  cekKeadaan.galatCek = "";
  if (!decl || (!cipl && !s)) {
    cekKeadaan.hasil = null;
    renderChecker();
    return;
  }
  await cekMuatPendukung();
  if (nomor !== cekKeadaan.jalanKe) return;
  cekSiapkanTempat();
  const E = EximEngine;
  try {
    // Barang jadwal terkait jadi rujukan utama, CIPL melengkapi (cekBarangGabungan)
    const gabung = cipl && s ? cekBarangGabungan(cipl, s, decl, bc) : null;
    const resolve = cekPenyelesaiHs(s, decl, { tanpaJadwal: !cipl || !!gabung });
    const extra = Object.assign(cekExtraBl(), { hsResolve: resolve });
    // Isian jadwal = rujukan utama; CIPL hanya untuk yang belum diisi di jadwal (cekRujukJadwal)
    const barisJadwal = cekBarisJadwal(s, decl, bc, { barangDariJadwal: !!gabung });
    let res;
    if (cipl) {
      // Barang CIPL bernomor Seri Barang pasangannya di draft (cekNomoriMenurutSeri)
      const pembanding = gabung ? gabung.cipl : Object.assign({}, cipl, { items: cekNomoriMenurutSeri(cipl.items || [], decl, bc) });
      res = E.runCheck(pembanding, decl, extra);
      if (gabung) cekTandaiBarangJadwal(res, gabung, decl, bc);
      res.checks = cekRujukJadwal(res.checks, barisJadwal, pembanding, !!s);
    } else res = { type: decl.type, checks: E.blChecks(decl, extra, decl.type === "PEB").concat(cekBarisBarangJadwal(s, decl, resolve, bc), barisJadwal), cipl: null, decl };
    res.checks.push(...cekBarisFasilitas(s, decl));
    E.summarize(res);
    res.jadwal = s;
    res.saranHs = cekSaranHs(res);
    cekKeadaan.hasil = res;
  } catch (e) {
    console.error(e);
    cekKeadaan.hasil = null;
    cekKeadaan.galatCek = (e && e.message) || String(e);
  }
  renderChecker();
}

/* Kode draft barang yang belum dikenal Database HS Code (hs_learn dari
   mesin), dikelompokkan per nama. Nama yang diusulkan = uraian CIPL
   tanpa tipe/ukuran, kecuali uraian yang sama punya kode berbeda di
   draft -- di situ tipenya ikut, supaya tidak tersimpan dua kode untuk
   satu nama. */
function cekSaranHs(res) {
  const items = (res.cipl && res.cipl.items) || [];
  const calon = [];
  (res.checks || []).forEach((x) => {
    if (!x.hs_learn || !x.hs_learn.code) return;
    const m = String(x.field).match(/\bItem\s+(\S+)/);
    const no = m ? m[1] : "";
    const c = items.find((it) => String(it.no) === no);
    calon.push({
      no,
      uraian: cekRapiNama(c ? c._uraian || c.description : x.hs_learn.name),
      lengkap: cekRapiNama(c ? c._lengkap || `${c.description || ""} ${c.type || ""}` : x.hs_learn.name),
      kode: x.hs_learn.code,
    });
  });
  const kodePerUraian = new Map();
  calon.forEach((c) => {
    const k = cekKunci(c.uraian);
    if (!kodePerUraian.has(k)) kodePerUraian.set(k, new Set());
    kodePerUraian.get(k).add(c.kode);
  });
  const db = typeof hsCodeRows !== "undefined" ? hsCodeRows : [];
  const out = new Map();
  calon.forEach((c) => {
    const nama = kodePerUraian.get(cekKunci(c.uraian)).size > 1 ? c.lengkap : c.uraian;
    if (!nama) return;
    if (db.some((r) => cekKunci(r.item_name) === cekKunci(nama) && EximEngine.hsDigits(r.hs_code) === c.kode)) return;
    const kunci = cekKunci(nama) + "|" + c.kode;
    if (!out.has(kunci)) out.set(kunci, { nama, kode: c.kode, barang: [] });
    if (c.no) out.get(kunci).barang.push(c.no);
  });
  return [...out.values()];
}
const cekRapiNama = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

async function cekSimpanHs(i) {
  const res = cekKeadaan.hasil;
  const saran = res && res.saranHs && res.saranHs[i];
  if (!saran || !requireEdit()) return;
  const aju = res.decl && res.decl.aju ? ` ${res.decl.aju}` : "";
  showPrompt({
    title: tt("Simpan ke Database HS Code", "Save to the HS Code database"),
    desc: tt("Kode diambil dari draft. Nama barang boleh dirapikan dulu — nama inilah yang dicari pemeriksaan berikutnya.", "The code comes from the draft. Tidy up the item name first if needed — this is the name the next check looks for."),
    icon: "bi-upc-scan",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nama", label: tt("Nama barang", "Item name"), value: saran.nama },
      { key: "kode", label: "HS Code", value: EximEngine.fmtHs(saran.kode), inputmode: "numeric", filter: batasiHsCode, hint: tt("Maksimal 8 angka (titik hanya pemisah).", "At most 8 digits (dots are only separators).") },
      { key: "catatan", label: tt("Catatan (opsional)", "Notes (optional)"), value: tt(`Dari draft ${res.type}${aju}`, `From ${res.type} draft${aju}`) },
    ],
    onSubmit: (v) => {
      if (!(v.nama || "").trim()) return tt("Nama barang harus diisi.", "Item name is required.");
      const galat = periksaHsCode(v.kode);
      if (galat) return galat;
      const sebelum = hsCodeRows.length;
      simpanHsCodeBaru(v.nama.trim(), batasiHsCode(v.kode), (v.catatan || "").trim()).then(() => {
        if (hsCodeRows.length > sebelum) cekJalankan();
      });
      return true;
    },
  });
}

/* ---------- menggambar ---------- */

function cekStatusHtml(st) {
  const kelas = st === "MISMATCH" ? "cek-st--beda" : st === "INFO" ? "cek-st--info" : "cek-st--sama";
  return `<span class="cek-st ${kelas}">${escapeHtml(st || "MATCH")}</span>`;
}

const cekSebaris = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const cekKosongHtml = (v) => (cekAda(v) ? escapeHtml(cekSebaris(v)) : `<span class="cek-redup">—</span>`);

/* Bagian yang benar-benar berbeda diberi tanda (awal & akhir yang sama
   dibiarkan). `rata`: angka dibandingkan per posisi -- nomor identitas
   22 digit berbanding 16 digit yang sama. Sama dengan EXIM Checker. */
function cekBeda(a, b, rata) {
  const A = cekSebaris(a);
  const B = cekSebaris(b);
  const batas = Math.min(A.length, B.length);
  let i = 0;
  while (i < batas && A[i].toUpperCase() === B[i].toUpperCase()) i++;
  let akhirA;
  let akhirB;
  if (rata && A.length !== B.length) {
    let e = batas;
    while (e > i && A[e - 1].toUpperCase() === B[e - 1].toUpperCase()) e--;
    if (i >= batas) {
      akhirA = A.length;
      akhirB = B.length;
    } else akhirA = akhirB = e;
  } else {
    let j = 0;
    while (j < batas - i && A[A.length - 1 - j].toUpperCase() === B[B.length - 1 - j].toUpperCase()) j++;
    akhirA = A.length - j;
    akhirB = B.length - j;
  }
  const tandai = (s, akhir) => {
    const tengah = s.slice(i, akhir);
    return escapeHtml(s.slice(0, i)) + (tengah ? `<mark class="cek-tanda">${escapeHtml(tengah)}</mark>` : "") + escapeHtml(s.slice(akhir));
  };
  return [tandai(A, akhirA), tandai(B, akhirB)];
}

function cekSelHtml(x) {
  const l = x.cipl_display != null ? x.cipl_display : x.cipl;
  const r = x.pib_display != null ? x.pib_display : x.pib;
  const angka = (v) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && /^-?[\d,]*\.?\d+$/.test(v.trim()));
  if (x.numeric) {
    const f = (v) => (angka(v) ? escapeHtml(cekAngka(EximEngine.num(v))) : cekKosongHtml(v));
    return [f(l), f(r)];
  }
  if (x.status === "MISMATCH" && cekAda(l) && cekAda(r)) return cekBeda(l, r, !!x.aligned);
  return [cekKosongHtml(l), cekKosongHtml(r)];
}

function cekBarisHtml(x, kiriLabel, kananLabel) {
  const [a, b] = cekSelHtml(x);
  const kelas = x.status === "MISMATCH" ? "is-beda" : x.status === "INFO" ? "is-info" : "";
  const selisih =
    x.status === "MISMATCH" && x.numeric && x.diff != null
      ? `<span class="cek-selisih">${escapeHtml(tt("Selisih", "Difference"))} ${escapeHtml((x.diff > 0 ? "+" : x.diff < 0 ? "−" : "") + cekAngka(Math.abs(x.diff)))}</span>`
      : "";
  const sumber = x.left_source && x.left_source !== kiriLabel ? `<span class="cek-sumber">${escapeHtml(x.left_source)}</span>` : "";
  return `<tr class="${kelas}">
      <td class="cek-kol-isian"><span class="cek-isian">${escapeHtml(x.field)}</span>${x.expected_note ? `<span class="cek-catatan">${escapeHtml(x.expected_note)}</span>` : ""}</td>
      <td class="cek-kol-nilai" data-label="${escapeAttr(x.left_source || kiriLabel)}">${a}${sumber}</td>
      <td class="cek-kol-nilai" data-label="${escapeAttr(kananLabel)}">${b}</td>
      <td class="cek-kol-hasil">${cekStatusHtml(x.status)}${selisih}</td>
    </tr>`;
}

function cekGrupHtml(id, judul, sub, rows, terbuka, kiriLabel, kananLabel) {
  const n = (st) => rows.filter((x) => x.status === st).length;
  const beda = n("MISMATCH");
  const sama = n("MATCH");
  const info = n("INFO");
  const pil = [
    `<span class="cek-pil">${escapeHtml(tt(`${rows.length} baris`, `${rows.length} ${rows.length === 1 ? "row" : "rows"}`))}</span>`,
    beda ? `<span class="cek-st cek-st--beda">${beda} MISMATCH</span>` : "",
    sama ? `<span class="cek-st cek-st--sama">${sama} MATCH</span>` : "",
    info ? `<span class="cek-st cek-st--info">${info} INFO</span>` : "",
  ].join("");
  return `<details class="cek-grup${beda ? " has-beda" : ""}" data-cek-grup="${escapeAttr(id)}"${terbuka ? " open" : ""}>
      <summary><span class="cek-grup-judul"><b>${escapeHtml(judul)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span><span class="cek-grup-pil">${pil}</span></summary>
      <div class="cek-tabel-wrap"><table class="cek-tabel">
        <thead><tr><th class="cek-kol-isian">${escapeHtml(tt("Isian", "Field"))}</th><th class="cek-kol-nilai">${escapeHtml(kiriLabel)}</th><th class="cek-kol-nilai">${escapeHtml(kananLabel)}</th><th class="cek-kol-hasil">${escapeHtml(tt("Hasil", "Result"))}</th></tr></thead>
        <tbody>${rows.map((x) => cekBarisHtml(x, kiriLabel, kananLabel)).join("")}</tbody>
      </table></div>
    </details>`;
}

function cekSubjudulBarang(res, no) {
  const cari = (list) => (list || []).find((it) => String(it.no) === String(no));
  const c = cari(res.cipl && res.cipl.items);
  if (c) return cekSebaris(c._nama || `${c.description || ""} ${c.type || ""}`);
  const d = cari(res.decl && res.decl.items);
  return d ? cekSebaris(`${d.description || ""} ${d.type || ""}`) : "";
}

function cekGambarDaftar() {
  const box = $("#cekDaftar");
  const res = cekKeadaan.hasil;
  if (!box || !res) return;
  const semua = res.checks;
  const f = cekKeadaan.saring;
  const rows = f === "ALL" ? semua : semua.filter((x) => x.status === f);
  /* Bagian yang dibuka / ditutup pengguna tetap begitu saat hasilnya
     dihitung ulang (B/L diketik, jadwal diganti, bahasa diganti) --
     selama berkas & saringannya sama. */
  const tanda = [cekKeadaan.kunciCipl, cekKeadaan.kunciDraft, f].join("#");
  const lama = box.dataset.tanda === tanda ? new Map($$("details[data-cek-grup]", box).map((d) => [d.dataset.cekGrup, d.open])) : null;
  const buka = (id, bawaan) => (lama && lama.has(id) ? lama.get(id) : bawaan);
  const kanan = `Draft ${res.type}`;
  // Jadwal terkait = rujukan utama: kolom kirinya Jadwal; nilai yang diambil dari CIPL ditandai per baris
  const kiriUmum = res.jadwal || !res.cipl ? tt("Jadwal", "Schedule") : "CIPL";
  const kiriBarang = res.barangDariJadwal ? tt("Jadwal", "Schedule") : kiriUmum;
  const persempit = f !== "ALL";
  const per = new Map();
  rows.forEach((x) => {
    const k = x.section === "ITEM" ? "ITEM" : x.section;
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(x);
  });
  const blok = [];
  const urut = [...per.keys()].filter((k) => k !== "ITEM").sort((a, b) => {
    const ia = CEK_URUTAN.indexOf(a);
    const ib = CEK_URUTAN.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  urut.forEach((k) => {
    const list = per.get(k);
    const kiri = k === "FACILITY" ? tt("Jadwal", "Schedule") : k === "CIPL" ? "CIPL" : kiriUmum;
    blok.push(cekGrupHtml(k, cekLabelSeksi(k), "", list, buka(k, persempit || list.some((x) => x.status === "MISMATCH")), kiri, kanan));
  });
  const perBarang = new Map();
  (per.get("ITEM") || []).forEach((x) => {
    const m = String(x.field || "").match(/\bItem\s+(\d+)/i);
    const no = m ? Number(m[1]) : 0;
    if (!perBarang.has(no)) perBarang.set(no, []);
    perBarang.get(no).push(x);
  });
  [...perBarang.keys()].sort((a, b) => a - b).forEach((no) => {
    const list = perBarang.get(no);
    blok.push(cekGrupHtml(`ITEM-${no}`, no ? tt(`Barang ${no}`, `Item ${no}`) : tt("Barang", "Items"), no ? cekSubjudulBarang(res, no) : "", list, buka(`ITEM-${no}`, persempit || list.some((x) => x.status === "MISMATCH")), kiriBarang, kanan));
  });
  const kosong = { MISMATCH: tt("Tidak ada mismatch. Semua isian yang diperiksa sesuai.", "No mismatches. Every field checked matches."), MATCH: tt("Belum ada isian yang sesuai.", "No matching fields yet."), INFO: tt("Tidak ada catatan informasi.", "No information notes.") }[f] || tt("Tidak ada hasil.", "No results.");
  box.innerHTML = blok.length ? blok.join("") : `<div class="panel-empty"><i class="bi bi-check2-all"></i> ${escapeHtml(kosong)}</div>`;
  box.dataset.tanda = tanda;
}

function cekVonisTeks(res) {
  const s = res.summary;
  if (res.overall === "PASS") return tt(`Seluruh isian yang diperiksa sesuai dengan draft ${res.type}.`, `Every field checked matches the ${res.type} draft.`);
  return tt(`${s.mismatches} mismatch ditemukan. Periksa rinciannya sebelum ${res.type} diajukan.`, `${s.mismatches} ${s.mismatches === 1 ? "mismatch" : "mismatches"} found. Review the details before the ${res.type} is submitted.`);
}

function cekGambarHasil() {
  const panel = $("#cekHasil");
  if (!panel) return;
  const res = cekKeadaan.hasil;
  panel.classList.toggle("d-none", !res);
  if (!res) return;
  const v = { PASS: ["cek-vonis--lulus", "bi-check-lg"], REVIEW: ["cek-vonis--tinjau", "bi-exclamation-lg"], FAIL: ["cek-vonis--gagal", "bi-x-lg"] }[res.overall] || ["cek-vonis--tinjau", "bi-exclamation-lg"];
  const s = res.summary;
  const meta = [];
  const mataMeta = (ikon, nama, sub) => `<span class="cek-meta-item"><i class="bi ${ikon}" aria-hidden="true"></i><span><b>${escapeHtml(nama)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span></span>`;
  if (res.cipl) meta.push(mataMeta("bi-receipt", cekKeadaan.berkasCipl.map((x) => x.name).join(" + "), res.cipl.sourceFormat || ""));
  if (cekKeadaan.berkasDraft) meta.push(mataMeta("bi-file-earmark-spreadsheet", cekKeadaan.berkasDraft.name, res.decl.aju ? `Aju ${res.decl.aju}` : ""));
  if (res.jadwal) meta.push(mataMeta("bi-calendar2-week", dispVal(res.jadwal.party), [res.jadwal.invoice, res.jadwal.noAju].filter(Boolean).join(" · ")));
  $("#cekVonis").className = "cek-vonis " + v[0];
  $("#cekVonis").innerHTML = `
    <div class="cek-vonis-ikon" aria-hidden="true"><i class="bi ${v[1]}"></i></div>
    <div class="cek-vonis-isi">
      <div class="cek-vonis-judul"><b>${escapeHtml(res.overall)}</b><span class="cek-jenis">${escapeHtml(res.type)}</span></div>
      <p>${escapeHtml(cekVonisTeks(res))}</p>
      <div class="cek-meta">${meta.join("")}</div>
    </div>
    <div class="cek-angka">
      <div><b>${s.total}</b><span>${escapeHtml(tt("Diperiksa", "Checked"))}</span></div>
      <div class="cek-angka--sama"><b>${s.matches}</b><span>MATCH</span></div>
      <div class="cek-angka--beda${s.mismatches ? "" : " is-nol"}"><b>${s.mismatches}</b><span>MISMATCH</span></div>
      <div class="cek-angka--info${s.infos ? "" : " is-nol"}"><b>${s.infos}</b><span>INFO</span></div>
    </div>`;

  const urut = Object.keys(res.sections).sort((a, b) => {
    const ia = a === "ITEM" ? 98 : CEK_URUTAN.indexOf(a);
    const ib = b === "ITEM" ? 98 : CEK_URUTAN.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  $("#cekBagian").innerHTML = urut
    .map((k) => {
      const x = res.sections[k];
      const total = x.total || 1;
      const teks = [tt(`${x.match} sesuai`, `${x.match} match`)];
      if (x.mismatch) teks.push(`${x.mismatch} mismatch`);
      if (x.info) teks.push(`${x.info} info`);
      const ruas = (n, kelas) => (n ? `<span class="${kelas}" style="width:${(n / total) * 100}%"></span>` : "");
      return `<div class="cek-bagian-baris${x.mismatch ? " has-beda" : ""}">
          <span class="cek-bagian-nama">${escapeHtml(cekLabelSeksi(k))}</span>
          <span class="cek-batang" role="img" aria-label="${escapeAttr(cekLabelSeksi(k) + ": " + teks.join(", "))}">${ruas(x.match, "is-sama")}${ruas(x.mismatch, "is-beda")}${ruas(x.info, "is-info")}</span>
          <span class="cek-bagian-angka">${escapeHtml(teks.join(", "))}</span>
        </div>`;
    })
    .join("");

  const hitung = (st) => (st === "ALL" ? res.checks.length : res.checks.filter((x) => x.status === st).length);
  $$("[data-cek-saring]").forEach((b) => {
    const aktif = b.dataset.cekSaring === cekKeadaan.saring;
    b.classList.toggle("active", aktif);
    b.setAttribute("aria-pressed", String(aktif));
    const n = b.querySelector("b");
    if (n) n.textContent = hitung(b.dataset.cekSaring);
  });
  const lihat = $("#btnCekLihatJadwal");
  if (lihat) lihat.hidden = !res.jadwal;
  cekGambarDaftar();
}

function cekGambarSaranHs() {
  const panel = $("#cekSaranHs");
  if (!panel) return;
  const res = cekKeadaan.hasil;
  const saran = (res && res.saranHs) || [];
  panel.classList.toggle("d-none", !saran.length);
  const daftar = $("#cekSaranHsDaftar");
  if (!saran.length) {
    if (daftar) daftar.innerHTML = "";
    return;
  }
  const boleh = typeof canEdit === "function" && canEdit();
  daftar.innerHTML = `<ul class="cek-saran">${saran
    .map(
      (x, i) => `<li>
        <span class="cek-saran-nama"><b>${escapeHtml(x.nama)}</b><small>${escapeHtml(x.barang.length ? tt(`Barang ${x.barang.join(", ")}`, `Item ${x.barang.join(", ")}`) : "")}</small></span>
        <span class="cek-saran-kode">${escapeHtml(EximEngine.fmtHs(x.kode))}</span>
        ${boleh ? `<button type="button" class="btn-quiet cek-saran-simpan" data-cek-simpan-hs="${i}"><i class="bi bi-plus-lg"></i> <span>${escapeHtml(tt("Simpan", "Save"))}</span></button>` : ""}
      </li>`,
    )
    .join("")}</ul>`;
}

function cekRingkasCipl() {
  const c = cekKeadaan.cipl;
  if (!c) return "";
  const nilai = c.total_amount != null ? `${c.currency || ""} ${cekAngka(c.total_amount)}`.trim() : "";
  return [c.invoice_no ? `Invoice ${c.invoice_no}` : "", tt(`${c.items.length} barang`, `${c.items.length} ${c.items.length === 1 ? "item" : "items"}`), nilai, c.sourceFormat].filter(Boolean).join(" · ");
}
function cekRingkasDraft() {
  const d = cekKeadaan.decl;
  if (!d) return "";
  const nilai = d.type === "PEB" ? d.fob : d.cif;
  return [
    d.type,
    d.aju ? `Aju ${d.aju}` : "",
    tt(`${d.items.length} barang`, `${d.items.length} ${d.items.length === 1 ? "item" : "items"}`),
    nilai != null ? `${d.currency || ""} ${cekAngka(nilai)}`.trim() : "",
    /* Hanya bila urutan di berkasnya memang acak: pengguna jadi tahu
       barang SUDAH disusun menurut Seri Barang (1, 2, 3, …) sebelum
       dibandingkan, tanpa perlu memeriksa sendiri. */
    cekKeadaan.draftDiurutkan ? tt("barang diurutkan menurut Seri Barang", "items sorted by Seri Barang") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function cekGambarKotak(id, berkas, ringkas, galat, kosong) {
  const kotak = $(id);
  if (!kotak) return;
  const ada = berkas.length > 0;
  kotak.classList.toggle("has-file", ada && !galat);
  kotak.classList.toggle("has-galat", !!galat);
  kotak.querySelector(".cek-drop-nama").textContent = ada ? berkas.map((f) => f.name).join(" + ") : kosong.nama;
  kotak.querySelector(".cek-drop-ket").textContent = galat || (ada ? (cekKeadaan.membaca && !ringkas ? tt("Membaca…", "Reading…") : ringkas) : kosong.ket);
  const ikon = kotak.querySelector(".cek-drop-ikon");
  if (ikon) ikon.className = `bi ${galat ? "bi-exclamation-octagon-fill" : ada ? "bi-check-circle-fill" : kosong.ikon} cek-drop-ikon`;
}

function cekKartuJadwalHtml(s, ket) {
  const angkut = carrierNameFromShipment(s);
  const tgl = cekBuku() === "export" || cekModeJadwal(s) === "export" ? ["ETD", s.etdUpdate || s.etd] : ["ETA", s.etaUpdate || s.eta];
  const isi = [s.invoice ? `Invoice ${s.invoice}` : "", s.noAju ? `Aju ${s.noAju}` : "", s.masterBL || s.houseBL ? `B/L-AWB ${[s.masterBL, s.houseBL].filter(Boolean).join(" / ")}` : "", angkut, tgl[1] ? `${tgl[0]} ${fmtDate(tgl[1])}` : ""].filter(Boolean);
  return `<span class="cek-jadwal-nama"><b>${escapeHtml(dispVal(s.party))}</b><small>${escapeHtml(isi.join(" · "))}</small>${ket || ""}</span>`;
}

function cekGambarJadwal() {
  const box = $("#cekJadwal");
  if (!box) return;
  const k = cekKeadaan;
  const s = cekJadwal();
  const siap = !!(k.decl || k.cipl);
  const tombol = (attr, ikon, teks, kelas) => `<button type="button" class="btn-quiet ${kelas || ""}" ${attr}><i class="bi ${ikon}"></i> <span>${escapeHtml(teks)}</span></button>`;
  let isi;
  if (s) {
    const kand = k.kandidat.find((x) => String(x.s.id) === String(s.id));
    const ket = k.jadwalManual
      ? `<span class="cek-alasan">${escapeHtml(tt("Dipilih manual", "Picked manually"))}</span>`
      : kand
        ? `<span class="cek-alasan">${escapeHtml(tt("Cocok lewat", "Matched by"))} ${kand.alasan.map((a) => `<b>${escapeHtml(a)}</b>`).join(", ")}</span>`
        : "";
    isi = `<div class="cek-jadwal-kartu"><i class="bi bi-link-45deg cek-jadwal-ikon" aria-hidden="true"></i>${cekKartuJadwalHtml(s, ket)}
        <span class="cek-jadwal-aksi">${tombol("data-cek-jadwal-lihat", "bi-eye", tt("Lihat", "View"))}${tombol("data-cek-jadwal-ganti", "bi-arrow-left-right", tt("Ganti", "Change"))}${tombol("data-cek-jadwal-lepas", "bi-x-lg", tt("Lepas", "Unlink"))}</span></div>`;
  } else {
    const teks = !siap
      ? tt("Jadwal terkait dicari otomatis begitu berkas dipilih (No. Aju, invoice, B/L-AWB, kontainer).", "The linked schedule is found automatically once files are chosen (aju no., invoice, B/L-AWB, container).")
      : k.kandidat.length
        ? tt("Beberapa jadwal sama cocoknya — pilih satu.", "Several schedules match equally — pick one.")
        : tt("Tidak ada jadwal yang cocok dengan berkas ini.", "No schedule matches these files.");
    isi = `<div class="cek-jadwal-kartu is-kosong"><i class="bi bi-link-45deg cek-jadwal-ikon" aria-hidden="true"></i><span class="cek-jadwal-nama"><b>${escapeHtml(tt("Jadwal terkait", "Linked schedule"))}</b><small>${escapeHtml(teks)}</small></span>
        <span class="cek-jadwal-aksi">${tombol("data-cek-jadwal-ganti", "bi-search", tt("Pilih jadwal", "Pick a schedule"))}</span></div>`;
  }
  let pilih = "";
  if (k.pilihTerbuka) {
    const q = (($("#cekCariJadwal") || {}).value || "").trim();
    pilih = `<div class="cek-pilih">
        <div class="search-box cek-pilih-cari"><i class="bi bi-search"></i><input type="text" id="cekCariJadwal" autocomplete="off" value="${escapeAttr(q)}"
          placeholder="${escapeAttr(tt("Cari invoice, aju, B/L-AWB, shipper/buyer…", "Search invoice, aju, B/L-AWB, shipper/buyer…"))}" aria-label="${escapeAttr(tt("Cari jadwal", "Search schedules"))}" /></div>
        <div class="cek-pilih-daftar" id="cekPilihDaftar">${cekDaftarPilihHtml(q)}</div>
      </div>`;
  }
  box.innerHTML = isi + pilih;
}

function cekDaftarPilihHtml(q) {
  const k = cekKeadaan;
  const kunci = q.toLowerCase();
  let daftar;
  if (!kunci) daftar = k.kandidat.map((x) => ({ s: x.s, alasan: x.alasan }));
  else {
    daftar = cekDaftarJadwal()
      .filter((s) =>
        [s.party, s.invoice, s.noAju, s.masterBL, s.houseBL, s.container, s.docNo, s.vessel, s.voyage]
          .join(" ")
          .toLowerCase()
          .includes(kunci),
      )
      .slice(0, 8)
      .map((s) => ({ s, alasan: [] }));
  }
  if (!daftar.length) {
    return `<div class="cek-pilih-kosong">${escapeHtml(kunci ? tt("Tidak ada jadwal yang cocok.", "No matching schedule.") : tt("Ketik untuk mencari jadwal di buku ini.", "Type to search the schedules in this book."))}<small>${escapeHtml(
      tt("Yang dicari hanya Import berstatus Process / Delay dan Export yang ETD-nya belum lewat.", "Only Import schedules in Process / Delay and Export schedules whose ETD has not passed are searched."),
    )}</small></div>`;
  }
  return daftar
    .map(
      (x) => `<button type="button" class="cek-pilih-baris${String(x.s.id) === String(k.jadwalId) ? " is-aktif" : ""}" data-cek-tautkan="${escapeAttr(x.s.id)}">
        ${cekKartuJadwalHtml(x.s, x.alasan.length ? `<span class="cek-alasan">${escapeHtml(tt("Cocok lewat", "Matched by"))} ${x.alasan.map((a) => `<b>${escapeHtml(a)}</b>`).join(", ")}</span>` : "")}
      </button>`,
    )
    .join("");
}

function cekGambarStatus() {
  const el = $("#cekStatus");
  const btn = $("#btnCekPeriksa");
  const k = cekKeadaan;
  const s = cekJadwal();
  const siap = !!(k.decl && (k.cipl || s));
  if (btn) btn.disabled = !siap || k.membaca;
  if (!el) return;
  let teks;
  let kelas = "";
  if (k.membaca) teks = tt("Membaca berkas…", "Reading files…");
  else if (k.galatCek) {
    teks = tt(`Gagal memeriksa: ${k.galatCek}`, `The check failed: ${k.galatCek}`);
    kelas = "is-galat";
  } else if (!k.berkasDraft) teks = k.berkasCipl.length ? tt("Pilih draft PIB/PEB pembandingnya.", "Choose the PIB/PEB draft to compare with.") : tt("Pilih CIPL dan draft PIB/PEB — boleh diseret sekaligus.", "Choose the CIPL and the PIB/PEB draft — drag them in together if you like.");
  else if (!k.decl) {
    teks = tt("Draft belum terbaca.", "The draft has not been read.");
    kelas = "is-galat";
  } else if (!k.cipl && !s) teks = tt("Tambahkan CIPL, atau tautkan jadwal untuk membandingkan draft dengan jadwal saja.", "Add the CIPL, or link a schedule to compare the draft with the schedule only.");
  else if (k.hasil) {
    teks = !k.cipl ? tt("Tanpa CIPL: draft dibandingkan dengan jadwal terkait.", "Without a CIPL: the draft is compared with the linked schedule.") : tt("Pemeriksaan selesai. Hasilnya diperbarui sendiri saat isian di atas diubah.", "Check complete. The result updates itself when the fields above change.");
    kelas = "is-siap";
  } else teks = tt("Siap diperiksa.", "Ready to check.");
  const db = [];
  if (k.dbHs === "gagal") db.push(tt("Database HS Code tidak termuat", "the HS Code database did not load"));
  el.className = "cek-status " + kelas;
  el.innerHTML = `<span class="cek-status-titik" aria-hidden="true"></span><span>${escapeHtml(teks)}${db.length ? ` <small>(${escapeHtml(db.join(", "))})</small>` : ""}</span>`;
}

function renderChecker() {
  if (!$("#viewChecker")) return;
  const k = cekKeadaan;
  cekGambarKotak("#cekDropCipl", k.berkasCipl, cekRingkasCipl(), k.galatCipl, {
    nama: tt("Commercial Invoice & Packing List", "Commercial Invoice & Packing List"),
    ket: tt("Excel atau PDF — satu berkas, atau dua (CI dan PL).", "Excel or PDF — one file, or two (CI and PL)."),
    ikon: "bi-receipt",
  });
  cekGambarKotak("#cekDropDraft", k.berkasDraft ? [k.berkasDraft] : [], cekRingkasDraft(), k.galatDraft, {
    nama: tt("Ekspor Excel dari CEISA", "Excel export from CEISA"),
    ket: tt("PIB atau PEB — jenisnya dikenali sendiri.", "PIB or PEB — the type is recognised automatically."),
    ikon: "bi-file-earmark-spreadsheet",
  });
  cekGambarJadwal();
  cekGambarSumberBl();
  cekGambarStatus();
  cekGambarHasil();
  cekGambarSaranHs();
}

/* Temuan sebagai teks -- siap ditempel ke pesan untuk PPJK / forwarder. */
function cekTeksTemuan() {
  const res = cekKeadaan.hasil;
  if (!res) return "";
  const beda = res.checks.filter((x) => x.status === "MISMATCH");
  const nilai = (v) => cekSebaris(v) || "—";
  const kepala = [
    tt(`Cek ${res.type}${res.decl.aju ? " " + res.decl.aju : ""}: ${res.overall}`, `${res.type} check${res.decl.aju ? " " + res.decl.aju : ""}: ${res.overall}`),
    res.cipl && res.cipl.invoice_no ? `CIPL: ${res.cipl.invoice_no}` : "",
    res.jadwal ? tt(`Jadwal: ${dispVal(res.jadwal.party)}`, `Schedule: ${dispVal(res.jadwal.party)}`) : "",
  ].filter(Boolean);
  if (!beda.length) return kepala.concat(tt("Semua isian yang diperiksa sesuai.", "Every field checked matches.")).join("\n");
  const kiri = res.cipl ? "CIPL" : tt("Jadwal", "Schedule");
  return kepala
    .concat("", tt(`${beda.length} mismatch:`, `${beda.length} ${beda.length === 1 ? "mismatch" : "mismatches"}:`))
    .concat(beda.map((x) => `- ${x.field}: ${x.left_source || kiri} ${nilai(x.cipl_display != null ? x.cipl_display : x.cipl)} | Draft ${nilai(x.pib_display != null ? x.pib_display : x.pib)}${x.expected_note ? ` (${cekSebaris(x.expected_note)})` : ""}`))
    .join("\n");
}

function cekMulaiUlang() {
  Object.assign(cekKeadaan, {
    berkasCipl: [], berkasDraft: null, kunciCipl: "", kunciDraft: "", cipl: null, galatCipl: "", decl: null, bc: null, draftDiurutkan: false, galatDraft: "",
    jadwalId: "", jadwalManual: false, kandidat: [], pilihTerbuka: false, hasil: null, galatCek: "", saring: "ALL",
  });
  cekKeadaan.bacaKe++;
  cekKeadaan.jalanKe++;
  Object.values(CEK_BL).forEach((p) => {
    [p.no, p.tgl].forEach((sel) => {
      const el = $(sel);
      if (el) {
        el.value = "";
        delete el.dataset.otomatis;
      }
    });
  });
  ["#cekFileCipl", "#cekFileDraft"].forEach((sel) => {
    const el = $(sel);
    if (el) el.value = "";
  });
  renderChecker();
}

function showCheckerView() {
  showPage("checker");
  window.scrollTo(0, 0);
  /* Data pendukung dimuat ulang tiap halaman dibuka: HS Code yang baru
     disimpan di tab lain. */
  cekKeadaan.pendukung = null;
  const pendukung = cekMuatPendukung();
  // Jadwal bisa saja selesai dimuat sesudah berkasnya dipilih
  if (cekKeadaan.decl || cekKeadaan.cipl) {
    cekPerbaruiKandidat();
    cekIsiBl();
    pendukung.then(() => cekJalankan());
  }
  renderChecker();
}

/* ---------- pengkabelan ---------- */

(function cekKabel() {
  const halaman = $("#viewChecker");
  if (!halaman) return;
  [
    ["#cekFileCipl", "cipl"],
    ["#cekFileDraft", "draft"],
  ].forEach(([sel, kotak]) => {
    const input = $(sel);
    if (input)
      input.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = ""; // berkas yang sama boleh dipilih lagi
        cekTerimaBerkas(files, kotak);
      });
  });
  $$(".cek-drop", halaman).forEach((kotak) => {
    const tahan = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ["dragenter", "dragover"].forEach((ev) =>
      kotak.addEventListener(ev, (e) => {
        tahan(e);
        kotak.classList.add("is-dragover");
      }),
    );
    ["dragleave", "drop"].forEach((ev) =>
      kotak.addEventListener(ev, (e) => {
        tahan(e);
        if (ev === "dragleave" && kotak.contains(e.relatedTarget)) return;
        kotak.classList.remove("is-dragover");
      }),
    );
    kotak.addEventListener("drop", (e) => cekTerimaBerkas((e.dataTransfer && e.dataTransfer.files) || [], kotak.dataset.cekKotak));
  });

  let tunda = null;
  Object.values(CEK_BL).forEach((p) => {
    const no = $(p.no);
    const tgl = $(p.tgl);
    if (no)
      no.addEventListener("input", () => {
        delete no.dataset.otomatis; // diketik sendiri = nilai pengguna
        cekGambarSumberBl();
        clearTimeout(tunda);
        tunda = setTimeout(cekJalankan, 400);
      });
    if (tgl)
      tgl.addEventListener("change", () => {
        delete tgl.dataset.otomatis;
        cekGambarSumberBl();
        cekJalankan();
      });
  });

  halaman.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("button");
    if (!el) return;
    if (el.id === "btnCekPeriksa") return void cekJalankan();
    if (el.id === "btnCekReset") return void cekMulaiUlang();
    if (el.id === "btnCekSalin") {
      copyToClipboard(cekTeksTemuan()).then((ok) => showToast(ok ? tt("Temuan disalin.", "Findings copied.") : tt("Gagal menyalin.", "Copy failed."), ok ? "success" : "danger"));
      return;
    }
    if (el.id === "btnCekBuka" || el.id === "btnCekTutup") {
      $$("#cekDaftar details").forEach((d) => (d.open = el.id === "btnCekBuka"));
      return;
    }
    if (el.id === "btnCekLihatJadwal" || el.hasAttribute("data-cek-jadwal-lihat")) {
      const s = cekJadwal();
      if (s && typeof openDetailView === "function") openDetailView(s.id);
      return;
    }
    if (el.dataset.cekSaring) {
      cekKeadaan.saring = el.dataset.cekSaring;
      cekGambarHasil();
      return;
    }
    if (el.hasAttribute("data-cek-jadwal-ganti")) {
      cekKeadaan.pilihTerbuka = !cekKeadaan.pilihTerbuka;
      cekGambarJadwal();
      const cari = $("#cekCariJadwal");
      if (cari && !layarSentuh()) cari.focus();
      return;
    }
    if (el.hasAttribute("data-cek-jadwal-lepas")) {
      cekKeadaan.jadwalId = "";
      cekKeadaan.jadwalManual = true;
      cekIsiBl();
      cekJalankan();
      return;
    }
    if (el.dataset.cekTautkan) return void cekTautkan(el.dataset.cekTautkan);
    if (el.dataset.cekSimpanHs != null) return void cekSimpanHs(Number(el.dataset.cekSimpanHs));
  });
  halaman.addEventListener("input", (e) => {
    if (e.target && e.target.id === "cekCariJadwal") {
      const daftar = $("#cekPilihDaftar");
      if (daftar) daftar.innerHTML = cekDaftarPilihHtml(e.target.value.trim());
    }
  });
})();
