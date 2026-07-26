"use strict";

/* ==================================================================
   CIPL COMMON: kosakata & util bersama utk Excel CIPL (excel-cipl.js)
   dan PDF CIPL (pdf-cipl.js).

   KENAPA FILE INI ADA: dokumen CI/PL dari supplier yang SAMA sering
   muncul dalam 2 wujud -- file Excel kerja (sheet CI/PL/gabungan) dan
   PDF hasil print+tanda-tangan dari template yang SAMA. Selain itu,
   supplier BEDA punya template Excel yang strukturnya beda-beda jauh
   (sudah ketemu tiga varian nyata: sheet CI/PL terpisah dg header
   "Description", sheet gabungan "CI,PL" dg header "Item"+"Description"
   +"Origin HS CODE" sendiri-sendiri, dan versi PDF dg header "Goods
   Descriptions"). Supaya "field X artinya kolom/label mana" tidak
   ditulis dobel (dan gampang beda logika kalau nanti ada revisi), aturan
   pengenalan label & pembersihan nilai dipusatkan di sini; excel-cipl.js
   tinggal urus GRID (baris x kolom Excel), pdf-cipl.js tinggal urus
   BARIS TEKS PDF (hasil groupPdfItemsIntoLines) -- keduanya panggil
   fungsi yang sama utk "apa arti teks ini".
================================================================== */

const INCOTERM_RE =
  /\b(FOB|FCA|CIF|CFR|EXW|CPT|CIP|DAP|DPU|DDP|DAT|DES|DEQ)\b/i;
const CURRENCY_TOKEN_RE = /^(USD|IDR|KRW|CNY|RMB|JPY|EUR|SGD|TWD|HKD)$/i;
const UNIT_QTY_RE =
  /^(PCS?|SET|UNITS?|BOX(?:ES)?|PACK(?:AGES?)?|PALLETS?|PLT|CARTONS?|CTN|BAGS?|DRUMS?|ROLLS?|KG|G|TON|TNE|MT|M3|CBM|SQM|LOT)$/i;

// "Origin HS Code: 8458.91-0000" / "HS Code : 8458910000" ketemu SEBAGAI
// BAGIAN dari teks deskripsi/spesifikasi barang (bukan kolom sendiri) --
// dicabut nomornya, sisa teksnya (SEBELUM frasa itu) yang dipakai sebagai
// nama barang supaya "Origin HS Code: ..." tidak nempel di nama.
function extractEmbeddedHsCode(text) {
  const s = text || "";
  const m = /(?:Origin\s+)?HS\s*Code\s*:?\s*([\d.\-]{6,})/i.exec(s);
  if (!m) return { hsCode: "", cleaned: s.trim() };
  return {
    hsCode: m[1].replace(/[.\-]/g, ""),
    cleaned: (s.slice(0, m.index) + s.slice(m.index + m[0].length))
      .replace(/\s{2,}/g, " ")
      .trim(),
  };
}

// Kode HS ditulis macam-macam gaya (titik/strip/tanpa pemisah) --
// disimpan/dibandingkan sebagai digit polos saja.
function normalizeHsCode(v) {
  return (v || "").replace(/[^\d]/g, "");
}

function isPlaceholderValue(v) {
  const t = (v == null ? "" : String(v)).trim();
  return (
    !t ||
    t === "-" ||
    t === "." ||
    /^n\/?a$/i.test(t) ||
    /^tanpa\s+(merek|tipe)$/i.test(t)
  );
}

// Gabungkan beberapa bagian nama (Item/Description/Specification/Brand,
// dst) jadi satu nama barang -- bagian yang kosong/placeholder dilewati,
// dan bagian yang sama persis dg bagian sebelumnya tidak diulang (kolom
// "Item" & "Description" kadang isinya identik di beberapa template).
function joinNameParts(parts) {
  const out = [];
  parts.forEach((p) => {
    const t = (p || "").toString().trim();
    if (isPlaceholderValue(t)) return;
    if (out.some((o) => o.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  });
  return out.join(" - ");
}

function guessTransportFromText(...texts) {
  return texts.some((t) => /air\s*port|bandara/i.test(t || ""))
    ? "udara"
    : "laut";
}

function guessIncotermFromText(s) {
  const m = INCOTERM_RE.exec(s || "");
  return m ? m[1].toUpperCase() : "";
}

// Dokumen CIPL (PL/CI, Excel maupun PDF) TIDAK pernah bilang eksplisit
// "ini shipment Import" atau "Export" -- dokumennya sama saja dipakai
// dua arah. Ditebak dari Port of Loading vs Final Destination/Port of
// Discharge: yang menyebut "Indonesia" itu sisi MUAT (loading) berarti
// Export (barang KELUAR dari Indonesia), sisi TUJUAN (destination)
// berarti Import (barang MASUK ke Indonesia). Kalau dua-duanya ATAU
// tidak satupun menyebut Indonesia (field kosong/tidak lengkap, atau
// kasus transit luar negeri-ke-luar negeri), sengaja dikembalikan ""
// (bukan nebak) -- modeHint kosong artinya pemanggil (apply-to-form.js)
// tidak menampilkan peringatan mismatch mode sama sekali, drpd salah
// tebak dan bikin bingung pas mode form-nya sebenarnya sudah benar.
function guessCiplModeFromPorts(origin, destination) {
  const originID = /indonesia/i.test(origin || "");
  const destID = /indonesia/i.test(destination || "");
  if (originID && !destID) return "export";
  if (destID && !originID) return "import";
  return "";
}

// Tanggal free-text di CIPL: "MAY 20, 2026" / "20 MAY 2026" / ISO / DD-MM-
// YYYY / DD/MM/YYYY. (Objek Date asli dari cell Excel ditangani terpisah
// oleh pemanggil SEBELUM sampai ke sini -- fungsi ini cuma utk teks.)
function parseFlexibleDateText(v) {
  const str = (v == null ? "" : String(v)).trim();
  if (!str) return "";
  const MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  let m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(str);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon)
      return `${m[3]}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = /^(\d{1,2})[.\s]+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(str);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon)
      return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[-\/](\d{2})[-\/](\d{4})$/.exec(str);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

// Excel: cell tanggal bisa objek Date asli (cellDates:true) ATAU teks
// bebas ketik manual -- dua-duanya dicoba, versi teks didelegasikan ke
// parseFlexibleDateText supaya 1 definisi "format tanggal apa saja yang
// dikenali" dipakai bersama PDF.
function excelCellDateToISO(v) {
  if (v == null) return "";
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return parseFlexibleDateText(v);
}

// Nama sheet yang AMAN dianggap dokumen CI/PL utama (bukan lampiran/
// detail/riwayat yang sering berisi data BEKAS/tidak nyambung dg
// pengiriman yang sedang diimpor -- ditemukan nyata: sheet "Detail
// Packgae" isinya lampiran shipment LAIN yang nomor dokumennya beda
// tahun). Sheet "CI"/"PL" persis, atau gabungan ("CI,PL"/"CI/PL"/
// "CI+PL"/"CI PL"/"CIPL") dianggap utama; apa pun yang menyebut
// detail/attachment/lampiran/history/breakdown DIKECUALIKAN meski
// kebetulan memuat token "PL" (mis. "DETAIL PL").
function isPrimaryCiplSheetName(name) {
  const n = (name || "").trim();
  if (/detail|attachment|lampiran|breakdown|history|riwayat/i.test(n))
    return false;
  // "CI" (Commercial Invoice) beberapa supplier tulis lengkap
  // "INVOICE"/"INV", bukan disingkat "CI" -- ketemu nyata di templat
  // Dynamic Design (sheet-nya persis bernama "INVOICE"). Disamakan di
  // sini supaya dianggap sheet utama juga.
  if (/^(ci|invoice|inv)$/i.test(n) || /^pl$/i.test(n)) return true;
  if (
    /^(ci|invoice|inv)\s*[,+&/]?\s*pl$/i.test(n) ||
    /^pl\s*[,+&/]?\s*(ci|invoice|inv)$/i.test(n)
  )
    return true;
  return false;
}

// Sheet yang JELAS bukan dokumen utama (dipakai utk skip proaktif saat
// fallback scan-semua-sheet, beda dari isPrimaryCiplSheetName yang
// dipakai utk PILIH sheet utama).
function isExcludedSheetName(name) {
  return /detail|attachment|lampiran|breakdown|history|riwayat/i.test(
    (name || "").trim(),
  );
}

// Definisi "kolom ini artinya apa" -- dipakai excel-cipl.js utk
// mengklasifikasi header row grid Excel. Urutan penting: yang lebih
// spesifik (unitPrice sebelum unit, hsCode sebelum item) dicek duluan
// oleh pemanggil.
const CIPL_COLUMN_LABELS = {
  no: /^No\.?$/i,
  item: /^Item\.?\s*$/i,
  // Sebagian templat pisah "Item" & "Description" jadi 2 kolom, sebagian
  // gabung jadi 1 header "Item Description" (ketemu nyata di templat
  // Dynamic Design, sheet PL) -- makanya "(Item\s+)?" opsional di depan.
  // Tidak bentrok dg cek key "item" di atas: "Item" SENDIRIAN tidak lolos
  // regex ini krn "\s+" minta ada spasi setelahnya (lihat cipl-common.js
  // findCiplHeaderBlocks utk urutan pengecekan per key).
  description: /^(Item\s+)?(Goods\s+)?Descriptions?\s*$/i,
  // "Spec"/"Specification"/"Model" ATAU "Type" (ketemu nyata dipakai utk
  // varian/ukuran produk, mis. "NOKIAN ENTRUST 255/45R19" -- kalau tidak
  // ditangkap di sini, teks itu hilang sama sekali dari nama barang).
  specification: /^Spec(?:ification)?\s*$|^Model\s*$|^Type\s*$/i,
  brand: /^Brand\s*$/i,
  hsCode: /HS\s*CODE/i,
  qty: /^Qty\.?$|^Quantity$/i,
  unit: /^Unit\s*$/i,
  unitPrice: /Unit\s*Price/i,
  amount: /^Amount\s*$/i,
  netto: /^N\s*\.?\s*W\.?$|^Net\s*W(?:ei)?g?h?t?\.?$/i,
  bruto: /^G\s*\.?\s*W\.?$|^Gross\s*W(?:ei)?g?h?t?\.?$/i,
  // Kolom dimensi kemasan per barang, mis. "94 CM x 84 CM x 80 CM" —
  // dipakai utk isi Kemasan mode Export (lihat extractItemsFromBlock
  // di excel-cipl.js, yang parse angkanya lewat parsePackageDims() di
  // core/helpers.js -- parseFloat() otomatis abaikan "CM" di
  // belakang tiap angka, jadi tidak perlu strip manual).
  cbm: /^CBM\s*$/i,
  dim: /^DIM\.?$/i,
  remark: /^Remarks?\s*$/i,
};

const CIPL_FIELD_LABELS = {
  invoiceNoDate: /Invoice\s*No\.?\s*(?:and|&|\/)\s*Date/i,
  // Pihak PENJUAL (pengirim barang). Dokumen CI/PL selalu punya dua
  // pihak: Seller/Shipper/Exporter di kiri atas, Consignee/Buyer di
  // bawahnya. Keduanya HARUS diambil terpisah -- lihat pickCiplParty().
  // "Consigner"/"Consignor" dipakai sebagian supplier sbg ganti "Seller".
  // HATI-HATI: ejaannya cuma beda 1-2 huruf dari "Consignee" (penerima),
  // jadi polanya dikunci sampai akhir kata — tanpa itu penjual & penerima
  // saling tertukar.
  // Templat supplier menuliskan label ini dengan banyak variasi, sering
  // sebagai gabungan dipisah garis miring: "Seller", "Shipper",
  // " Shipper/Seller", "Exporter / Shipper", kadang berakhiran titik dua.
  // Bagian sesudah garis miring dibuat opsional & bebas kata supaya
  // semuanya tertangkap — sebelumnya hanya bentuk tunggal yang cocok,
  // sehingga templat ber-label "Shipper/Seller" (mis. ATC_CAM_BOX)
  // gagal terdeteksi dan Nama Shipper-nya kosong.
  seller:
    /^\s*(?:Seller|Shipper|Exporter|Consignor|Consigner)(?:\s*\/\s*[A-Za-z ]+)?\s*:?\s*$/i,
  consignee:
    /^\s*(?:Consignee|Buyer|Importer)(?:\s*\/\s*[A-Za-z ]+)?\s*:?\s*$/i,
  departureDate: /^\s*Departure\s*Date\s*$/i,
  sailingOnOrAbout: /Sailing\s+on\s+or\s+about/i,
  vesselFlight: /Vessel\s*\/\s*Flight/i,
  // Sebagian templat (mis. Dynamic Design) memakai "From" / "To" polos
  // sebagai ganti "Port of Loading" / "Port of Discharge".
  portOfLoading: /Port\s+of\s+Loading|^\s*From\s*$/i,
  portOfDischarge: /Port\s+of\s+Discharge|^\s*To\s*$/i,
  finalDestination: /Final\s+Destination/i,
  termsOfDelivery: /Terms?\s+of\s+Delivery/i,
  totalBoxLine: /^TOTAL\b/i,
};

// PERBAIKAN BUG (requirement A: "deteksi Nama Shipper/Customer masih
// salah pada file CIPL/PIB"). Dokumen CIPL memuat DUA pihak sekaligus,
// dan mana yang dipakai tergantung ARAH pengiriman:
//   - Jadwal IMPORT -> field "Nama Shipper"          = Seller/Shipper
//   - Jadwal EXPORT -> field "Nama Buyer / Consignee" = Consignee/Buyer
// Versi sebelumnya SELALU memakai Consignee, sehingga pada Jadwal Import
// nama shipper malah terisi nama perusahaan sendiri (PT DDI, yang memang
// consignee-nya). Kalau salah satu sisi tidak terbaca, dipakai sisi yang
// ada (lebih baik terisi sesuatu daripada kosong).
function pickCiplParty(seller, consignee, mode) {
  const s = (seller || "").trim();
  const c = (consignee || "").trim();
  if (mode === "export") return c || s;
  return s || c;
}

function normName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Menggabungkan beberapa daftar barang "sebagian" (mis. dari sheet CI yang
// cuma tahu harga, dan sheet PL yang cuma tahu berat -- atau dari file PDF
// CI + file PDF PL yang dipilih bersamaan) jadi SATU daftar barang utuh,
// dicocokkan lewat nama (dinormalisasi: lowercase, spasi dirapikan) supaya
// tetap benar walau urutan/jumlah baris beda antar-sumber. Barang yang
// namanya tidak ketemu pasangannya di sumber lain tetap diikutkan apa
// adanya (kosongkan field yang memang tidak diketahui).
//
// sources: array of arrays, tiap item berbentuk
//   { name, hsCode, qty, satuan, harga, netto, bruto }
// (field mana pun boleh undefined/null kalau sumber itu tidak tahu).
// Menggabungkan beberapa daftar barang "sebagian" (mis. dari sheet CI yang
// cuma tahu harga, dan sheet PL yang cuma tahu berat -- atau dari file PDF
// CI + file PDF PL yang dipilih bersamaan) jadi SATU daftar barang utuh.
// Kunci pencocokan: HS Code dulu kalau ADA di kedua sisi (paling andal --
// nama di sheet CI vs PL utk barang yang SAMA suka beda tingkat detail,
// mis. "Vertical Turning Center For Flow Proses..." vs cuma "Vertical
// Turning Center", padahal HS Code-nya identik), baru fallback ke nama
// yang dinormalisasi (lowercase, spasi dirapikan) kalau HS Code tidak ada
// di salah satu/kedua sisi.
// Menggabungkan beberapa daftar barang "sebagian" (mis. dari sheet CI yang
// cuma tahu harga, dan sheet PL yang cuma tahu berat -- atau dari file PDF
// CI + file PDF PL yang dipilih bersamaan) jadi SATU daftar barang utuh.
//
// Strategi (dicoba berurutan):
//  1) Kalau SEMUA sumber punya jumlah baris yang SAMA (paling umum:
//     blok CI & blok PL sama-sama menyebut N barang yang sama, berurutan
//     konsisten), digabung PER POSISI -- paling AMAN, tidak tergantung
//     nama/HS Code sama sekali. Ini penting karena ditemukan nyata: 2
//     barang BEDA (mis. dua jenis karet beda kualitas) bisa punya HS Code
//     custom yang SAMA, jadi mencocokkan lewat HS Code semata bisa salah
//     gabung.
//  2) Kalau jumlah baris beda-beda antar sumber (tidak yakin urutannya
//     selaras), baru dicocokkan lewat HS Code (HANYA kalau HS Code itu
//     UNIK dalam sumbernya sendiri -- kalau 1 sumber punya 2 barang dg
//     HS Code sama, jangan dipakai jadi kunci, supaya tidak salah gabung
//     seperti di atas) dg fallback ke nama yang dinormalisasi.
function mergeByPosition(sources) {
  const n = sources[0].length;
  const merged = [];
  for (let i = 0; i < n; i++) {
    const acc = {};
    sources.forEach((list) => {
      const it = list[i] || {};
      [
        "name",
        "hsCode",
        "qty",
        "satuan",
        "harga",
        "netto",
        "bruto",
        "package",
      ].forEach((f) => {
        if ((acc[f] == null || acc[f] === "") && it[f] != null && it[f] !== "")
          acc[f] = it[f];
      });
    });
    merged.push(acc);
  }
  return merged;
}

function mergeByKey(sources) {
  const order = [];
  const byKey = new Map();
  sources.forEach((list) => {
    const hsCounts = {};
    (list || []).forEach((it) => {
      const hs = normalizeHsCode(it.hsCode);
      if (hs) hsCounts[hs] = (hsCounts[hs] || 0) + 1;
    });
    (list || []).forEach((it) => {
      const hs = normalizeHsCode(it.hsCode);
      const useHs = hs && hsCounts[hs] === 1;
      const key = useHs ? "hs:" + hs : "nm:" + normName(it.name);
      if (key === "hs:" || key === "nm:") return;
      if (!byKey.has(key)) {
        byKey.set(key, { name: it.name });
        order.push(key);
      }
      const acc = byKey.get(key);
      ["hsCode", "qty", "satuan", "harga", "netto", "bruto", "package"].forEach(
        (f) => {
          if (acc[f] == null && it[f] != null && it[f] !== "") acc[f] = it[f];
        },
      );
      if (!acc.name) acc.name = it.name;
    });
  });
  return order.map((k) => byKey.get(k));
}

function mergeItemSources(sources) {
  const nonEmpty = (sources || []).filter((s) => s && s.length);
  let merged;
  if (
    nonEmpty.length >= 2 &&
    nonEmpty[0].length > 0 &&
    nonEmpty.every((s) => s.length === nonEmpty[0].length)
  ) {
    merged = mergeByPosition(nonEmpty);
  } else {
    merged = mergeByKey(nonEmpty);
  }

  // CATATAN: pembagian bruto PROPORSIONAL sudah DIHAPUS dari sini.
  // Bruto sekarang selalu berupa satu angka TOTAL yang dipasang di barang
  // pertama — dilakukan pemanggil lewat applyTotalBrutoToFirstItem()
  // (js/core/num-format.js), supaya aturannya seragam untuk PIB, PEB,
  // CIPL Excel, maupun CIPL PDF.
  return merged;
}

if (typeof module !== "undefined" && module.exports) {
  // Cabang ini HANYA aktif saat file di-require dari harness pengujian
  // Node (lihat /mnt/skills atau folder investigate) -- di browser,
  // `module` tidak ada sama sekali jadi baris ini tidak pernah jalan;
  // aplikasi sungguhan tetap memakai semua fungsi di atas sebagai global
  // biasa lewat urutan <script> di index.html.
  module.exports = {
    INCOTERM_RE,
    CURRENCY_TOKEN_RE,
    UNIT_QTY_RE,
    extractEmbeddedHsCode,
    normalizeHsCode,
    isPlaceholderValue,
    joinNameParts,
    guessTransportFromText,
    guessIncotermFromText,
    guessCiplModeFromPorts,
    parseFlexibleDateText,
    excelCellDateToISO,
    isPrimaryCiplSheetName,
    isExcludedSheetName,
    normName,
    mergeItemSources,
    CIPL_COLUMN_LABELS,
    CIPL_FIELD_LABELS,
  };
}
