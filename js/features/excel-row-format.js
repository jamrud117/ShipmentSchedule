"use strict";

/* ==================================================================
   SALIN KE EXCEL (clipboard, format mengikuti IMPORT_FORMAT.xlsx)
   Kolom yang dihasilkan (urutan tetap, kolom NO & REMARK di excel
   TIDAK diisi — paste mulai dari kolom IN FACTORY):
     IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, ITEM, HS CODE,
     DESCRIPTION, QTY, SAT, AMOUNT, NDPBM, INCOTERMS, FREIGHT,
     INSURANCE, CIF, FOB RUPIAH, CIF RUPIAH, TARIF, BEA MASUK,
     PPN 11%, PPH, TOTAL BM+PDRI, PI, FASILITAS/SKB, BL/AWB,
     NO. INVOICE/DEL.NOTE, VESSEL, PACKAGE

   - Field per-barang (ITEM, HS CODE, DESCRIPTION, QTY, SAT, AMOUNT)
     diisi di SETIAP baris/barang.
   - HANYA diisi 1x di baris PERTAMA, dikosongkan di baris berikutnya:
     IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, NDPBM, INCOTERMS,
     NO. INVOICE, VESSEL, PACKAGE.
   - Field biaya/kepabeanan (FREIGHT, INSURANCE, CIF, FOB RUPIAH,
     CIF RUPIAH, TARIF, BEA MASUK, PPN, PPH, TOTAL BM+PDRI, PI,
     FASILITAS/SKB) tetap diulang di setiap baris.
   - TARIF disalin apa adanya (persen, mis. 5 -> "5"), TIDAK dibagi
     100 — cell TARIF di excel-nya sudah diformat sebagai persen.
   - VESSEL diisi dari No. Voyage/Flight (nomor pengangkut), BUKAN
     dari nama vessel/maskapai.
   - BL/AWB: Master di baris pertama, House di baris KEDUA (numpang
     di baris barang ke-2 kalau barangnya 2+; kalau barangnya cuma 1,
     baris ke-2 baru dibuat khusus untuk House, kolom lain kosong).
   - Kalau barangnya lebih dari satu, tiap barang jadi baris baru.
================================================================== */
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

// Ambil angka DEPAN saja dari field Package bebas-teks (mis. "1 BX"
// -> 1, "2*40 & 1*20" -> 2), tanpa satuan/kode kemasannya. null kalau
// tidak ada angka di depan sama sekali.
function extractLeadingNumber(str) {
  const s = String(str || "").trim();
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(",", "."));
}

// Dua "formatter" dengan aturan kolom yang SAMA PERSIS (urutan, first-
// row-only, zeroing fasilitas, dsb — lihat buildExcelCopyRows &
// buildExportCopyRows), tapi beda representasi nilai akhirnya:
//
// - clipboardFormatter: dipakai tombol "Salin ke Excel" (copy 1
//   pengiriman ke clipboard sebagai plain text/TSV). Angka jadi STRING
//   koma-desimal (locale ID) supaya saat di-paste, Excel mengenalinya
//   sebagai Number asli (bukan Text) — format $/Rp yang sudah ada di
//   kolom excel tetap berfungsi. Tanggal jadi teks "D-MMM-YY". TARIF
//   apa adanya (persen, TIDAK dibagi 100) karena mengandalkan cell
//   tujuan yang sudah diformat persen sendiri oleh Yogi.
// - nativeFormatter: dipakai fitur Bulk Export (bikin file .xlsx asli
//   dari nol lewat SheetJS). Angka jadi Number asli, tanggal jadi Date
//   asli, TARIF jadi PECAHAN (mis. 5 -> 0.05) karena kita yang
//   men-set format cell-nya sendiri jadi persen — SAMA seperti
//   bagaimana TARIF tersimpan di IMPORT_FORMAT.xlsx.
const clipboardFormatter = {
  text: (v) => (v == null ? "" : String(v)),
  num: (n, decimals) => {
    const r = roundNum(n, decimals);
    if (r === 0) return "";
    return String(r); // <-- hapus replace()
  },
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
  num: (n, decimals) => roundNum(n, decimals),
  date: (d) => parseLocalDate(d) || "",
  tarif: (percent) => roundNum((Number(percent) || 0) / 100, 4),
  packageNum: (pkg) => {
    const n = extractLeadingNumber(pkg);
    return n == null ? "" : roundNum(n, 2);
  },
  blank: "",
};

/* ==================================================================
   SALIN KE EXCEL / BULK EXPORT — MODE IMPORT
   (clipboard 1 pengiriman ATAU baris untuk file bulk, formatter yang
   membedakan; format kolom mengikuti IMPORT_FORMAT.xlsx)
   Kolom yang dihasilkan (urutan tetap, TANPA kolom NO & REMARK — itu
   ditambahkan terpisah oleh pemanggil, lihat buildBulkRowsForShipment):
     IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, ITEM, HS CODE,
     DESCRIPTION, QTY, SAT, AMOUNT, NDPBM, INCOTERMS, FREIGHT,
     INSURANCE, CIF, FOB RUPIAH, CIF RUPIAH, TARIF, BEA MASUK,
     PPN 11%, PPH, TOTAL BM+PDRI, PI, FASILITAS/SKB, BL/AWB,
     NO. INVOICE/DEL.NOTE, VESSEL, PACKAGE

   - Field per-barang (ITEM, HS CODE, DESCRIPTION, QTY, SAT, AMOUNT)
     diisi di SETIAP baris/barang.
   - HANYA diisi 1x di baris PERTAMA, dikosongkan di baris berikutnya:
     IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, NDPBM, INCOTERMS,
     TARIF, BEA MASUK, PPN, PPH, TOTAL BM+PDRI,
     NO. INVOICE, VESSEL, PACKAGE.
   - Field yang tetap diulang di setiap baris: FREIGHT, INSURANCE, CIF,
     FOB RUPIAH, CIF RUPIAH, PI, FASILITAS/SKB.
   - FASILITAS/SKB: gabungan SEMUA jenis fasilitas yang dipakai di
     pengiriman ini (SKB & E-COO, dari array skb SEMUA barang), masing-
     masing jenis HANYA DITULIS SEKALI meski dipakai di banyak barang
     (mis. barang 1 punya E-COO, barang 2 punya SKB PPH, barang 3 punya
     SKB Masterlist -> kolomnya tetap "E-COO, PPH, Masterlist", bukan
     diulang per-barang). Nilainya sama di semua baris, sama seperti
     FREIGHT/INSURANCE/PI. Lihat shipmentFacilitiesSummary().
   - BEA MASUK/PPN/PPH/TOTAL BM+PDRI disalin PERSIS sesuai nilai yang
     tampil di card/detail (lihat computeCustoms): TOTAL BM+PDRI = 0
     kalau BEA MASUK = 0, selain itu = BEA MASUK + PPN + PPH. TIDAK
     tergantung isi Fasilitas SKB.
   - VESSEL diisi dari No. Voyage/Flight (nomor pengangkut), BUKAN
     dari nama vessel/maskapai.
   - PACKAGE: angka depan saja, tanpa satuan/kode kemasan.
   - BL/AWB: Master di baris pertama, House di baris KEDUA (numpang
     di baris barang ke-2 kalau barangnya 2+; kalau barangnya cuma 1,
     baris ke-2 baru dibuat khusus untuk House, kolom lain kosong).
   - Kalau barangnya lebih dari satu, tiap barang jadi baris baru.
================================================================== */
// Gabungan fasilitas 1 PENGIRIMAN (bukan per barang) untuk kolom
// FASILITAS/SKB di "Salin ke Excel" & Bulk Export: tiap jenis fasilitas
// yang dipakai di barang manapun (termasuk E-COO — sekarang cuma
// salah satu "jenis" di array skb yang sama, bukan field terpisah),
// di-dedupe berdasarkan labelnya (case-insensitive) supaya "PPH" yang
// muncul di 2 barang berbeda tidak dobel ditulis. Digabung pakai "\n"
// (bukan ", ") supaya tiap jenis jatuh di baris sendiri DALAM 1 sel —
// tsvField() di bawah otomatis membungkusnya pakai tanda kutip karena
// ada newline, jadi saat di-paste ke Excel ini tetap 1 sel (line break
// ala Alt+Enter), bukan pecah jadi baris spreadsheet baru.
function shipmentFacilitiesSummary(items) {
  const seen = new Set();
  const result = [];

  (items || []).forEach((it) => {
    (it.skb || []).forEach((sk) => {
      console.log(skbEntryLabel(sk));
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
  console.log(result);
  return result.join("\n");
}

function buildExcelCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const calc = computeCustoms(s);
  const items = s.items || [];
  const facilitiesSummary = shipmentFacilitiesSummary(items).split("\n");

  const masterBL = (s.masterBL || "").trim();
  const houseBL = (s.houseBL || "").trim();

  // Samakan persis dengan computeCustoms() supaya angka yang ter-copy
  // selalu cocok dengan yang tampil di card/detail — tidak lagi
  // di-nolkan berdasarkan isi Fasilitas SKB.
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
    // 24 (FASILITAS/SKB) SENGAJA TIDAK di sini lagi — SKB sekarang per
    // barang, jadi diisi ulang di TIAP baris (lihat buildRowForItem),
    // bukan cuma baris pertama.
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
      formatter.text(s.voyage), // 27 VESSEL -> nomor pengangkut
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

  if (rows.length >= 1) rows[0][25] = formatter.text(masterBL);
  if (houseBL) {
    if (rows.length >= 2) {
      rows[1][25] = formatter.text(houseBL);
    } else {
      const blankRow = new Array(29).fill(formatter.blank);
      blankRow[25] = formatter.text(houseBL);
      rows.push(blankRow);
    }
  }

  return rows;
}

/* ==================================================================
   SALIN KE EXCEL / BULK EXPORT — MODE EXPORT
   Format kolom mengikuti EXPORT_FORMAT.xlsx (lebih ringkas — tanpa
   NDPBM/CIF/TARIF/BM/PPN/PPH/PI/FASILITAS, tanpa SAT):
     PENGIRIMAN DARI PABRIK, PEB, DATE, AJU, CONSIGNEE, HS CODE,
     DESCRIPTION, QTY, AMOUNT, INCOTERMS, FREIGHT, INSURANCE, BL/AWB,
     NO. INVOICE/DEL.NOTE, VESSEL, PACKAGE
   Aturan first-row-only / BL-AWB row1+row2 / VESSEL=voyage / PACKAGE
   angka-saja — semuanya sama seperti mode Import di atas.
================================================================== */
function buildExportCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const items = s.items || [];
  const masterBL = (s.masterBL || "").trim();
  const houseBL = (s.houseBL || "").trim();

  const FIRST_ROW_ONLY_IDX = [0, 1, 2, 3, 4, 9, 13, 14, 15];

  function buildRowForItem(it, idx) {
    const cols = [
      formatter.date(s.factoryDate), // 0  PENGIRIMAN DARI PABRIK
      formatter.text(s.docNo), // 1  PEB
      formatter.date(s.docDate), // 2  DATE
      formatter.text(s.noAju), // 3  AJU
      formatter.text(s.party), // 4  CONSIGNEE
      formatter.text(it.hsCode), // 5  HS CODE
      formatter.text(it.namaBarang), // 6  DESCRIPTION
      formatter.num(it.qty, 2), // 7  QTY
      formatter.num((Number(it.qty) || 0) * (Number(it.harga) || 0), 2), // 8  AMOUNT
      formatter.text(s.incoterm), // 9  INCOTERMS
      formatter.num(s.freight, 2), // 10 FREIGHT
      formatter.num(s.insurance, 2), // 11 INSURANCE
      formatter.blank, // 12 BL/AWB — diisi terpisah di bawah
      formatter.text(s.invoice), // 13 NO. INVOICE / DEL.NOTE
      formatter.text(s.voyage), // 14 VESSEL -> nomor pengangkut
      formatter.packageNum(s.package), // 15 PACKAGE
    ];
    if (idx > 0)
      FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  }

  const rows = items.map((it, idx) => buildRowForItem(it, idx));

  if (rows.length >= 1) rows[0][12] = formatter.text(masterBL);
  if (houseBL) {
    if (rows.length >= 2) {
      rows[1][12] = formatter.text(houseBL);
    } else {
      const blankRow = new Array(16).fill(formatter.blank);
      blankRow[12] = formatter.text(houseBL);
      rows.push(blankRow);
    }
  }

  return rows;
}

// Escaping ala TSV: field yang mengandung tab/newline/quote dibungkus
// tanda kutip (konvensi yang sama dipakai Excel sendiri saat
// copy-paste sel berisi line break/Alt+Enter).
function tsvField(val) {
  val = val == null ? "" : String(val);
  if (/[\t\n\r"]/.test(val)) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function buildExcelCopyText(s) {
  return buildExcelCopyRows(s, clipboardFormatter)
    .map((cols) => cols.map(tsvField).join("\t"))
    .join("\n");
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

async function handleCopyExcel(id) {
  const s = currentList().find((x) => x.id === id);
  if (!s) return;
  if (!s.items || !s.items.length) {
    showToast("Tidak ada barang untuk disalin.", "danger");
    return;
  }
  const text = buildExcelCopyText(s);
  const ok = await copyToClipboard(text);
  if (ok) {
    showToast(
      `${s.items.length} baris barang disalin — tinggal paste mulai dari kolom IN FACTORY di Excel.`,
      "success",
    );
  } else {
    showToast("Gagal menyalin ke clipboard.", "danger");
  }
}
