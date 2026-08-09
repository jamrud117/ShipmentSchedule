"use strict";

/* CIPL COMMON: kosakata & util bersama utk Excel CIPL (excel-cipl.js) */

const INCOTERM_RE =
  /\b(FOB|FCA|CIF|CFR|EXW|CPT|CIP|DAP|DPU|DDP|DAT|DES|DEQ)\b/i;
const CURRENCY_TOKEN_RE = /^(USD|IDR|KRW|CNY|RMB|JPY|EUR|SGD|TWD|HKD)$/i;
/* Satuan yang dikenali di kolom Quantity.

   EA ("each") ada di hampir semua invoice Korea/Cina dan sebelumnya
   tidak terdaftar — akibatnya kolom Satuan selalu kosong untuk berkas
   itu, tanpa ada yang bersuara. Satuan yang tidak dikenali tidak
   menggagalkan barisnya; ia hanya menghilang diam-diam. */
const UNIT_QTY_RE =
  /^(PCS?|PCE|EA|EACH|SET|UNITS?|NOS?|PA?I?RS?|DOZ(?:EN)?|DZ|BOX(?:ES)?|PACK(?:AGES?)?|PALLETS?|PLT|CARTONS?|CTNS?|BAGS?|DRUMS?|ROLLS?|COILS?|SHEETS?|KGM?|KGS?|G|TON|TNE|MT|M3|CBM|SQM|LOT)$/i;

/* HS Code yang berdiri sendiri di dalam teks nama barang, TANPA label
   "HS Code:" — biasanya karena ia punya kolom sendiri yang kebetulan
   jatuh di kotak nama.

   Sengaja hanya bentuk BERTITIK (6903.10-0000, 8481.40.00.00). Angka
   polos 8-10 digit tidak diambil: nomor part dan kode internal sering
   sepanjang itu, dan salah mengambilnya berarti mengisi kolom HS Code
   dengan angka yang bukan HS Code sama sekali. */
/* Teks kolom kiri yang jelas BUKAN nama barang.

   Sebagian templat memakai kolom "Item" untuk keterangan rujukan —
   "Items of PO DDI-20260807-01" — bukan untuk nama barangnya. Kolom itu
   ikut terbaca ke dalam nama karena pada templat lain isinya memang
   bagian dari nama ("STAND" + "HS 40*50").

   Yang dibuang hanya pola yang bentuknya jelas label rujukan. Nama
   barang yang kebetulan memuat kata "PO" tidak tersentuh. */
const CIPL_LABEL_BUKAN_NAMA = [
  /\bItems?\s+of\s+PO\b[\s:.-]*[A-Z0-9\/-]*/gi,
  /\bC\/NO\s*:\s*[\d\/]+/gi,
];

function bersihkanLabelNama(nama) {
  let s = String(nama || "");
  CIPL_LABEL_BUKAN_NAMA.forEach((re) => {
    s = s.replace(re, " ");
  });
  return s.replace(/\s{2,}/g, " ").trim();
}

function extractBareHsCode(text) {
  const s = String(text || "");
  const m = /(?:^|[\s(])(\d{4}\.\d{2}(?:[.\-]\d{2}){1,2}|\d{4}\.\d{2}[.\-]\d{4})(?=[\s)]|$)/.exec(s);
  if (!m) return { hsCode: "", cleaned: s.trim() };
  return {
    hsCode: normalizeHsCodeInput(m[1]),
    cleaned: (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length))
      .replace(/\s{2,}/g, " ")
      .trim(),
  };
}

// "Origin HS Code: 8458.91-0000" / "HS Code
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

// Kode HS ditulis macam-macam gaya (titik/strip/tanpa pemisah)
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

// Gabungkan beberapa bagian nama (Item/Description/Specification/Brand
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

// Dokumen CIPL (PL/CI, Excel maupun PDF) TIDAK pernah bilang eksplisit "ini shipment Import"
function guessCiplModeFromPorts(origin, destination) {
  const originID = /indonesia/i.test(origin || "");
  const destID = /indonesia/i.test(destination || "");
  if (originID && !destID) return "export";
  if (destID && !originID) return "import";
  return "";
}

// Tanggal free-text di CIPL: "MAY 20, 2026" / "20 MAY 2026" / ISO / DD-MM- YYYY / DD/MM/YYYY
/* Tanggal yang BENAR-BENAR tanggal.

   Sel tanggal kosong pada berkas Excel kerap tercetak sebagai
   "Jan 00, 1900" — nilai nol pada penanggalan Excel. Diterima apa
   adanya, ia menghasilkan "1900-01-00": bukan tanggal yang sah, tapi
   tetap terlihat seperti tanggal, dan setiap hitungan yang menyentuhnya
   akan salah tanpa bersuara.

   Yang ditolak: hari 00, bulan 00, dan tahun di luar rentang yang
   masuk akal untuk dokumen pengiriman. */
function tanggalMasukAkal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return false;
  const th = Number(m[1]),
    bl = Number(m[2]),
    hr = Number(m[3]);
  if (bl < 1 || bl > 12 || hr < 1 || hr > 31) return false;
  return th >= 2000 && th <= 2100;
}

function parseFlexibleDateText(v) {
  const str = (v == null ? "" : String(v)).trim();
  if (!str) return "";
  const saring = (iso) => (tanggalMasukAkal(iso) ? iso : "");
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
      return saring(`${m[3]}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  }
  m = /^(\d{1,2})[.\s]+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(str);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon)
      return saring(`${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) return saring(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{2})[-\/](\d{2})[-\/](\d{4})$/.exec(str);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

// Excel: cell tanggal bisa objek Date asli
function excelCellDateToISO(v) {
  if (v == null) return "";
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return parseFlexibleDateText(v);
}

// Nama sheet yang AMAN dianggap dokumen CI/PL utama
function isPrimaryCiplSheetName(name) {
  const n = (name || "").trim();
  if (/detail|attachment|lampiran|breakdown|history|riwayat/i.test(n))
    return false;
  // "CI" (Commercial Invoice) beberapa supplier tulis lengkap "INVOICE"/"INV"
  if (/^(ci|invoice|inv)$/i.test(n) || /^pl$/i.test(n)) return true;
  if (
    /^(ci|invoice|inv)\s*[,+&/]?\s*pl$/i.test(n) ||
    /^pl\s*[,+&/]?\s*(ci|invoice|inv)$/i.test(n)
  )
    return true;
  return false;
}

// Sheet yang JELAS bukan dokumen utama
function isExcludedSheetName(name) {
  return /detail|attachment|lampiran|breakdown|history|riwayat/i.test(
    (name || "").trim(),
  );
}

// Definisi "kolom ini artinya apa"
const CIPL_COLUMN_LABELS = {
  no: /^No\.?$/i,
  item: /^Item\.?\s*$/i,
  // Sebagian templat pisah "Item" & "Description" jadi 2 kolom
  description: /^(Item\s+)?(Goods\s+)?Descriptions?\s*$/i,
  // "Spec"/"Specification"/"Model" ATAU "Type" (ketemu nyata dipakai utk varian/ukuran produk, mis
  specification: /^Spec(?:ification)?\s*$|^Model\s*$|^Type\s*$/i,
  brand: /^Brand\s*$/i,
  hsCode: /HS\s*CODE/i,
  qty: /^Qty\.?$|^Quantity$/i,
  unit: /^Unit\s*$/i,
  unitPrice: /Unit\s*Price/i,
  amount: /^Amount\s*$/i,
  netto: /^N\s*\.?\s*W\.?$|^Net\s*W(?:ei)?g?h?t?\.?$/i,
  bruto: /^G\s*\.?\s*W\.?$|^Gross\s*W(?:ei)?g?h?t?\.?$/i,
  // Kolom dimensi kemasan per barang, mis
  cbm: /^CBM\s*$/i,
  dim: /^DIM\.?$/i,
  remark: /^Remarks?\s*$/i,
};

const CIPL_FIELD_LABELS = {
  invoiceNoDate: /Invoice\s*No\.?\s*(?:and|&|\/)\s*Date/i,
  // Pihak PENJUAL (pengirim barang)
  seller:
    /^\s*(?:Seller|Shipper|Exporter|Consignor|Consigner)(?:\s*\/\s*[A-Za-z ]+)?\s*:?\s*$/i,
  consignee:
    /^\s*(?:Consignee|Buyer|Importer)(?:\s*\/\s*[A-Za-z ]+)?\s*:?\s*$/i,
  departureDate: /^\s*Departure\s*Date\s*$/i,
  sailingOnOrAbout: /Sailing\s+on\s+or\s+about/i,
  vesselFlight: /Vessel\s*\/\s*Flight/i,
  // Sebagian templat (mis
  portOfLoading: /Port\s+of\s+Loading|^\s*From\s*$/i,
  portOfDischarge: /Port\s+of\s+Discharge|^\s*To\s*$/i,
  finalDestination: /Final\s+Destination/i,
  termsOfDelivery: /Terms?\s+of\s+Delivery/i,
  totalBoxLine: /^TOTAL\b/i,
};

// PERBAIKAN BUG (requirement A: "deteksi Nama Shipper/Customer masih salah pada file CIPL/PIB")
function pickCiplParty(seller, consignee, mode) {
  const s = (seller || "").trim();
  const c = (consignee || "").trim();
  if (mode === "export") return c || s;
  return s || c;
}

function normName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Menggabungkan beberapa daftar barang "sebagian" (mis
/* Field barang yang ikut terbawa saat CI & PL digabung.

   Ditulis SEKALI di sini, bukan diulang di tiap fungsi merge. Daftar
   yang disalin dua kali akan berbeda cepat atau lambat — persis yang
   terjadi pada `dimensions`: ia terbaca dari Packing List, lalu hilang
   diam-diam begitu CI dan PL diimpor sebagai dua berkas terpisah, dan
   CBM Export jadi nol tanpa ada yang bersuara.

   Menambah field baru pada barang hasil ekstraksi? Tambahkan di sini
   juga, atau ia hanya akan selamat pada berkas gabungan. */
const CIPL_MERGE_FIELDS = [
  "name",
  "hsCode",
  "qty",
  "satuan",
  "harga",
  "netto",
  "bruto",
  "package",
  "dimensions",
];

function mergeByPosition(sources) {
  const n = sources[0].length;
  const merged = [];
  for (let i = 0; i < n; i++) {
    const acc = {};
    sources.forEach((list) => {
      const it = list[i] || {};
      CIPL_MERGE_FIELDS.forEach((f) => {
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
      CIPL_MERGE_FIELDS.forEach((f) => {
        if (f === "name") return;
        if (acc[f] == null && it[f] != null && it[f] !== "") acc[f] = it[f];
      });
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

  // CATATAN: pembagian bruto PROPORSIONAL sudah DIHAPUS dari sini
  return merged;
}

if (typeof module !== "undefined" && module.exports) {
  // Cabang ini HANYA aktif saat file di-require dari harness pengujian Node
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
