"use strict";

/* CIPL COMMON: kosakata & util bersama utk Excel CIPL (excel-cipl.js) */

const INCOTERM_RE =
  /\b(FOB|FCA|CIF|CFR|EXW|CPT|CIP|DAP|DPU|DDP|DAT|DES|DEQ)\b/i;
const CURRENCY_TOKEN_RE = /^(USD|IDR|KRW|CNY|RMB|JPY|EUR|SGD|TWD|HKD)$/i;
const UNIT_QTY_RE =
  /^(PCS?|SET|UNITS?|BOX(?:ES)?|PACK(?:AGES?)?|PALLETS?|PLT|CARTONS?|CTN|BAGS?|DRUMS?|ROLLS?|KG|G|TON|TNE|MT|M3|CBM|SQM|LOT)$/i;

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
