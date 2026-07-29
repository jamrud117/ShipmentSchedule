"use strict";

/* SALIN KE EXCEL (clipboard, format mengikuti IMPORT_FORMAT.xlsx) */
const EXCEL_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function excelDateFmt(d) {
  const dt = parseLocalDate(d);
  if (!dt) return "";
  return `${dt.getDate()}-${EXCEL_MONTHS[dt.getMonth()]}-${String(dt.getFullYear()).slice(-2)}`;
}

function roundNum(n, decimals) {
  decimals = decimals == null ? 2 : decimals;
  let num = Number(n);
  if (!isFinite(num)) num = 0;
  return parseFloat(num.toFixed(decimals));
}

// Ambil angka DEPAN saja dari field Package bebas-teks (mis
function extractLeadingNumber(str) {
  const s = String(str || "").trim();
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(",", "."));
}

// Dua "formatter" dengan aturan kolom yang SAMA PERSIS (urutan, first- row-only
const clipboardFormatter = {
  text: (v) => (v == null ? "" : String(v)),
  // Requirement G: format angka standar PIB — ribuan pakai koma, desimal pakai titik
  num: (n, decimals) => fmtPibNumber(n, decimals == null ? 2 : decimals),
  date: (d) => excelDateFmt(d),
  tarif: (percent) => clipboardFormatter.num(percent, 2),
  packageNum: (pkg) => {
    const n = extractLeadingNumber(pkg);
    return n == null ? "" : clipboardFormatter.num(n, 2);
  },
  blank: "",
};
const nativeFormatter = {
  text: (v) => (v == null ? "" : String(v)),
  // Requirement D (Bulk): "kalau ada data bernilai 0, tampilkan kosong saja
  num: (n, decimals) => {
    const r = roundNum(n, decimals);
    return r === 0 ? "" : r;
  },
  date: (d) => parseLocalDate(d) || "",
  tarif: (percent) => roundNum((Number(percent) || 0) / 100, 4),
  packageNum: (pkg) => {
    const n = extractLeadingNumber(pkg);
    return n == null ? "" : roundNum(n, 2);
  },
  blank: "",
};

/* SALIN KE EXCEL / BULK EXPORT — MODE IMPORT */
// Gabungan fasilitas 1 PENGIRIMAN
function shipmentFacilitiesSummary(items) {
  const seen = new Set();
  const result = [];

  (items || []).forEach((it) => {
    (it.skb || []).forEach((sk) => {
      let label = skbEntryLabel(sk).trim();

      // Samakan penulisan
      if (/^E-?COO$/i.test(label)) label = "COO";

      if (/^MASTERLIST$/i.test(label)) label = "MASTER LIST";

      // hanya ambil yang belum pernah ada
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    });
  });
  return result.join("\n");
}

function buildExcelCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const calc = computeCustoms(s);
  const items = s.items || [];
  const facilitiesSummary = shipmentFacilitiesSummary(items).split("\n");

  const masterBL = (s.masterBL || "").trim();
  const houseBL = (s.houseBL || "").trim();

  // Samakan persis dengan computeCustoms() supaya angka yang ter-copy selalu cocok
  const bmVal = Number(s.bm) || 0;
  const ppnVal = Number(s.ppn) || 0;
  const pphVal = Number(s.pph) || 0;
  const bmPdriVal = calc.bmPdri;

  const FIRST_ROW_ONLY_IDX = [
    0,
    1,
    2,
    3,
    4, // IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME
    11,
    12,
    13,
    14, // NDPBM, INCOTERMS
    18,
    19,
    20,
    21,
    22, // TARIF, BEA MASUK, PPN, PPH, TOTAL BM+PDRI
    // 24 (FASILITAS/SKB) SENGAJA TIDAK di sini lagi — SKB sekarang per barang
    26,
    27,
    28, // NO. INVOICE, VESSEL, PACKAGE
  ];

  function buildRowForItem(it, idx) {
    const cols = [
      formatter.date(s.factoryDate), // 0  IN FACTORY
      formatter.text(s.docNo), // 1  SPPB
      formatter.date(s.docDate), // 2  DATE
      formatter.text(s.noAju), // 3  AJU
      formatter.text(s.party), // 4  SUPPLIER NAME
      formatter.text(it.jenisBarang), // 5  ITEM
      formatter.text(it.hsCode), // 6  HS CODE
      formatter.text(it.namaBarang), // 7  DESCRIPTION
      formatter.num(it.qty, 2), // 8  QTY
      formatter.text(it.satuan), // 9  SAT
      formatter.num((Number(it.qty) || 0) * (Number(it.harga) || 0), 2), // 10 AMOUNT
      formatter.num(s.ndpbm, 2), // 11 NDPBM
      formatter.text(s.incoterm), // 12 INCOTERMS
      formatter.num(s.freight, 2), // 13 FREIGHT
      formatter.num(s.insurance, 2), // 14 INSURANCE
      formatter.num(calc.cifUsd, 2), // 15 CIF
      formatter.num(calc.fobRupiah, 2), // 16 FOB RUPIAH
      formatter.num(calc.cifRupiah, 2), // 17 CIF RUPIAH
      formatter.tarif(s.tarif), // 18 TARIF
      formatter.num(bmVal, 2), // 19 BEA MASUK
      formatter.num(ppnVal, 2), // 20 PPN 11%
      formatter.num(pphVal, 2), // 21 PPH
      formatter.num(bmPdriVal, 2), // 22 TOTAL BM+PDRI
      formatter.text(s.pi), // 23 PI
      formatter.text(facilitiesSummary[idx] || ""), // 24
      formatter.blank, // 25 BL/AWB — diisi terpisah di bawah
      formatter.text(s.invoice), // 26 NO. INVOICE / DEL.NOTE
      // VESSEL mengikuti aturan requirement B lewat vesselNameForTemplate()
      formatter.text(vesselNameForTemplate(s)), // 27 VESSEL
      formatter.packageNum(s.package), // 28 PACKAGE
    ];
    if (idx > 0)
      FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  }

  const rows = items.map((it, idx) => buildRowForItem(it, idx));
  while (rows.length < facilitiesSummary.length) {
    const blankRow = new Array(29).fill(formatter.blank);

    blankRow[24] = formatter.text(facilitiesSummary[rows.length]);

    rows.push(blankRow);
  }

  applyMasterHouseBL(rows, masterBL, houseBL, 25, 29, formatter);

  return rows;
}

// Escaping ala TSV: field yang mengandung tab/newline/quote dibungkus tanda kutip
function tsvField(val) {
  val = val == null ? "" : String(val);
  if (/[\t\n\r"]/.test(val)) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/* Salin DUA format sekaligus: HTML (berformat) + teks polos */
async function copyRichToClipboard(html, text) {
  if (
    navigator.clipboard &&
    window.isSecureContext &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch (err) {
      console.error(err);
    }
  }
  return copyToClipboard(text);
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error(err);
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}
