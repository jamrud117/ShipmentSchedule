"use strict";

/* ==================================================================
   COPY TEMPLATE PICKER — dropdown pilihan template di tombol Copy
   (menggantikan copy 1-format-langsung yang lama).

   File ini SENGAJA dipisah dari features/excel-row-format.js supaya
   file itu (yang formatnya sudah benar utk All Import & dipakai
   bareng Bulk Export) tidak perlu disentuh sama sekali. File ini
   HANYA menambah, tidak mengubah apa pun di file lain:
     - buildExcelCopyRows(), buildExportCopyRows(), clipboardFormatter,
       nativeFormatter, tsvField(), copyToClipboard(), handleCopyExcel()
       semuanya dipakai APA ADANYA dari excel-row-format.js.

   Cara nambah template baru di masa depan:
     1. Tulis builder barunya (function buildXxxCopyRows / buildXxxCopyText).
     2. Tambah SATU entri baru di array COPY_TEMPLATES di bawah.
   Tidak perlu mengubah copyShipment() ataupun markup menu — keduanya
   otomatis mengikuti daftar COPY_TEMPLATES.
================================================================== */

// Sama seperti logika di dalam buildExcelCopyText() (lihat
// excel-row-format.js) — diulang di sini sebagai fungsi umum (bukan
// dipindah ke sana) supaya file itu tidak ikut disentuh sama sekali.
function rowsToClipboardText(rows) {
  return rows.map((cols) => cols.map(tsvField).join("\t")).join("\n");
}

// Taruh Master BL di baris pertama, House BL di baris KEDUA (numpang
// di baris barang ke-2 kalau ada, atau bikin baris baru khusus kalau
// barangnya cuma 1) — pola yang sama persis dengan yang sudah ada di
// buildExcelCopyRows()/buildExportCopyRows(), digeneralisasi di sini
// supaya buildDailyImportCopyRows() & buildDailyExportCopyRows() bisa
// pakai bareng tanpa duplikasi.
function applyMasterHouseBL(rows, masterBL, houseBL, colIdx, totalCols, formatter) {
  if (rows.length >= 1) rows[0][colIdx] = formatter.text(masterBL);
  if (houseBL) {
    if (rows.length >= 2) {
      rows[1][colIdx] = formatter.text(houseBL);
    } else {
      const blankRow = new Array(totalCols).fill(formatter.blank);
      blankRow[colIdx] = formatter.text(houseBL);
      rows.push(blankRow);
    }
  }
}

/* ==================================================================
   COPY TEMPLATE — ALL EXPORT
   Builder barisnya TETAP buildExportCopyRows() yang sudah ada (dipakai
   juga oleh Bulk Export) — TIDAK diubah. Template ini cuma menambah 1
   kolom REMARK di paling akhir (dari field `notes`, HANYA di baris
   pertama, sama seperti perlakuan REMARK di Bulk Export — lihat
   buildBulkRowsForShipment() di bulk-excel.js). Kolom REMARK ditambah
   DI SINI (bukan di dalam buildExportCopyRows() itu sendiri) supaya
   Bulk Export — yang menambah REMARK-nya sendiri di layer lain — tidak
   sampai dapat kolom itu dobel.
   Kolom akhir (17, index 0-16): PENGIRIMAN DARI PABRIK, PEB, PEB DATE,
   AJU, CUSTOMER, HS CODE, ITEM NAME, QTY, AMOUNT, INCOTERMS, FREIGHT,
   INSURANCE, BL/AWB, NO. INVOICE, VESSEL, PACKAGE, REMARK.
================================================================== */
function buildAllExportCopyText(s) {
  const rows = buildExportCopyRows(s, clipboardFormatter).map((cols, idx) => [
    ...cols,
    idx === 0 ? clipboardFormatter.text(s.notes) : clipboardFormatter.blank,
  ]);
  return rowsToClipboardText(rows);
}

/* ==================================================================
   COPY TEMPLATE — DAILY EXPORT
   Kolom (19, index 0-18): NO, PEB, PEB DATE, AJU, STATUS, PELABUHAN
   MUAT, CUSTOMER, ITEM NAME, QTY, GROSS WEIGHT, BL/AWB, SHIPPER DOC,
   INVOICE, VESSEL NAME, FORWADER, ETD, ETA, INCOTERM, NOTES.
   - NO, STATUS, SHIPPER DOC: SENGAJA selalu kosong (diisi manual oleh
     user di sheet Daily Export-nya sendiri), posisi kolomnya tetap
     dipertahankan.
   - NOTES: dari field `notes` shipment (HANYA baris pertama) — sama
     seperti kolom REMARK di All Export, dua-duanya sumbernya `notes`.
   - PELABUHAN MUAT dari field `origin` (utk mode export, label field
     ini persis "Pelabuhan Muat" — lihat MODE_LABELS.export.origin).
   - VESSEL NAME dari field `vessel` (nama vessel/maskapai) — BEDA dari
     kolom VESSEL di All Import/All Export yang dari `voyage` (nomor
     pengangkut).
   - Field per-barang (ITEM NAME, QTY, GROSS WEIGHT) diisi tiap baris;
     field lain cuma di baris pertama — sama seperti template lain.
================================================================== */
const DAILY_EXPORT_COLS = 19;
function buildDailyExportCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const items = s.items || [];
  const masterBL = (s.masterBL || "").trim();
  const houseBL = (s.houseBL || "").trim();

  const FIRST_ROW_ONLY_IDX = [1, 2, 3, 5, 6, 12, 13, 14, 15, 16, 17, 18];

  function buildRowForItem(it, idx) {
    const cols = [
      formatter.blank, // 0  NO
      formatter.text(s.docNo), // 1  PEB
      formatter.date(s.docDate), // 2  PEB DATE
      formatter.text(s.noAju), // 3  AJU
      formatter.blank, // 4  STATUS
      formatter.text(s.origin), // 5  PELABUHAN MUAT
      formatter.text(s.party), // 6  CUSTOMER
      formatter.text(it.namaBarang), // 7  ITEM NAME
      formatter.num(it.qty, 2), // 8  QTY
      formatter.num(it.bruto, 2), // 9  GROSS WEIGHT
      formatter.blank, // 10 BL/AWB — diisi terpisah di bawah
      formatter.blank, // 11 SHIPPER DOC
      formatter.text(s.invoice), // 12 INVOICE
      formatter.text(s.vessel), // 13 VESSEL NAME
      formatter.text(s.forwarder), // 14 FORWADER
      formatter.date(s.etd), // 15 ETD
      formatter.date(s.eta), // 16 ETA
      formatter.text(s.incoterm), // 17 INCOTERM
      formatter.text(s.notes), // 18 NOTES
    ];
    if (idx > 0) FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  }

  const rows = items.map((it, idx) => buildRowForItem(it, idx));
  applyMasterHouseBL(rows, masterBL, houseBL, 10, DAILY_EXPORT_COLS, formatter);
  return rows;
}

/* ==================================================================
   COPY TEMPLATE — DAILY IMPORT
   Kolom (23, index 0-22): NO, SPPB, SPPB DATE, AJU, STATUS, PELABUHAN,
   CUSTOMER, ITEM NAME, QTY, GROSS WEIGHT, BL/AWB, INVOICE, VESSEL
   NAME, FORWADER, ETD, ETA, ACTUAL DELIVERY, IN FACTORY, TIME,
   LCL/FCL, CONT, NO.POL, INCOTERM.
   - NO, STATUS: SENGAJA selalu kosong, konsisten dengan Daily Export
     (diisi manual oleh user).
   - NO.POL (nomor polisi kendaraan): TIDAK ada field yang sesuai di
     struktur data Shipment saat ini. Sesuai instruksi, struktur data
     Shipment tidak diubah — kolom ini SELALU kosong, posisinya tetap
     dipertahankan di urutan ke-22.
   - PELABUHAN dari field `destination` (Pelabuhan Tujuan) — beda dari
     Daily Export yang pakai `origin` (Pelabuhan Muat), karena utk mode
     import, port yang relevan di sheet harian adalah pelabuhan
     kedatangan di Indonesia.
   - VESSEL NAME dari `vessel`, ACTUAL DELIVERY dari `actual`, IN
     FACTORY dari `factoryDate`, LCL/FCL dari `muatan`.
================================================================== */
const DAILY_IMPORT_COLS = 23;
function buildDailyImportCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const items = s.items || [];
  const masterBL = (s.masterBL || "").trim();
  const houseBL = (s.houseBL || "").trim();

  const FIRST_ROW_ONLY_IDX = [1, 2, 3, 5, 6, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22];

  function buildRowForItem(it, idx) {
    const cols = [
      formatter.blank, // 0  NO
      formatter.text(s.docNo), // 1  SPPB
      formatter.date(s.docDate), // 2  SPPB DATE
      formatter.text(s.noAju), // 3  AJU
      formatter.blank, // 4  STATUS
      formatter.text(s.destination), // 5  PELABUHAN
      formatter.text(s.party), // 6  CUSTOMER
      formatter.text(it.namaBarang), // 7  ITEM NAME
      formatter.num(it.qty, 2), // 8  QTY
      formatter.num(it.bruto, 2), // 9  GROSS WEIGHT
      formatter.blank, // 10 BL/AWB — diisi terpisah di bawah
      formatter.text(s.invoice), // 11 INVOICE
      formatter.text(s.vessel), // 12 VESSEL NAME
      formatter.text(s.forwarder), // 13 FORWADER
      formatter.date(s.etd), // 14 ETD
      formatter.date(s.eta), // 15 ETA
      formatter.date(s.actual), // 16 ACTUAL DELIVERY
      formatter.date(s.factoryDate), // 17 IN FACTORY
      formatter.text(s.factoryTime), // 18 TIME
      formatter.text(s.muatan), // 19 LCL/FCL
      formatter.text(s.container), // 20 CONT
      formatter.blank, // 21 NO.POL — tidak ada field-nya, sengaja kosong
      formatter.text(s.incoterm), // 22 INCOTERM
    ];
    if (idx > 0) FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  }

  const rows = items.map((it, idx) => buildRowForItem(it, idx));
  applyMasterHouseBL(rows, masterBL, houseBL, 10, DAILY_IMPORT_COLS, formatter);
  return rows;
}

/* ==================================================================
   COPY TEMPLATE — REPORT
   BEDA dari 4 template lain: builder ini TIDAK menerima 1 shipment —
   ia meringkas SEMUA jadwal (Import + Export sekaligus, lintas mode,
   bukan cuma currentList()) yang statusnya BELUM "arrived" (di mode
   Export berarti belum "Delivered" — keduanya memakai key status yang
   sama, lihat STATUS_META & MODE_LABELS.arrivedStat). Karena itu,
   template ini ditandai scope:"global" di COPY_TEMPLATES — diklik dari
   kartu mana pun, hasilnya sama (tidak tergantung shipment yang
   kartunya diklik).
================================================================== */
function reportImportLine(s, n) {
  const dateTxt = fmtDateLong(s.actual);
  return `${n}. Shipment ${dispVal(s.party)} – ${dispVal(s.incoterm)} – ${dispVal(s.muatan)} – Perkiraan tiba di pabrik ${dateTxt}`;
}

function reportExportLine(s, n) {
  const names =
    (s.items || [])
      .map((it) => (it.namaBarang || "").trim())
      .filter(Boolean)
      .join(", ") || "—";
  const pkgNum = extractLeadingNumber(s.package);
  const pkgTxt = pkgNum == null ? 0 : Math.round(pkgNum);
  const dateTxt = fmtDateLong(s.etd);
  return `${n}. Shipment ${names} – ${pkgTxt} Packages – Estimasi Stuffing ${dateTxt}`;
}

function buildReportCopyLines() {
  const lines = [];
  const pendingImport = (data.import || []).filter((s) => s.status !== "arrived");
  const pendingExport = (data.export || []).filter((s) => s.status !== "arrived");

  if (pendingImport.length) {
    lines.push("Import");
    pendingImport.forEach((s, i) => {
      lines.push(reportImportLine(s, i + 1));
      (s.items || []).forEach((it) => {
        if ((it.namaBarang || "").trim()) lines.push(`- ${it.namaBarang}`);
      });
    });
  }

  if (pendingExport.length) {
    lines.push("Ekspor");
    pendingExport.forEach((s, i) => lines.push(reportExportLine(s, i + 1)));
  }

  return lines;
}

function buildReportCopyText() {
  return buildReportCopyLines().join("\n");
}

/* ==================================================================
   REGISTRY TEMPLATE COPY
   Urutan array = urutan tampil di menu. Utk menambah template baru:
     1. Tulis builder-nya (lihat contoh2 di atas).
     2. Tambah SATU entri baru di sini.
   copyShipment() & copyTemplateMenuHtml() di bawah otomatis mengikuti
   — tidak perlu diubah.
================================================================== */
const COPY_TEMPLATES = [
  {
    id: "AllImport",
    label: "All Import",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    // getText/successMsg sengaja tidak diisi — copyShipment() menangani
    // "AllImport" sebagai kasus khusus, langsung memakai handleCopyExcel()
    // yang SUDAH ADA (lihat excel-row-format.js, tidak disentuh sama
    // sekali), supaya outputnya 100% identik seperti sebelum menu
    // pilihan template ini ada.
  },
  {
    id: "AllExport",
    label: "All Export",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    getText: (s) => buildAllExportCopyText(s),
    successMsg: () => "Template Export berhasil disalin ke Clipboard.",
  },
  {
    id: "DailyImport",
    label: "Daily Import",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    getText: (s) => rowsToClipboardText(buildDailyImportCopyRows(s, clipboardFormatter)),
    successMsg: () => "Template Daily Import berhasil disalin ke Clipboard.",
  },
  {
    id: "DailyExport",
    label: "Daily Export",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    getText: (s) => rowsToClipboardText(buildDailyExportCopyRows(s, clipboardFormatter)),
    successMsg: () => "Template Daily Export berhasil disalin ke Clipboard.",
  },
  {
    id: "Report",
    label: "Report",
    icon: "bi-file-earmark-text",
    scope: "global",
    getText: () => buildReportCopyText(),
    successMsg: () => "Template Report berhasil disalin ke Clipboard.",
    emptyMsg: "Tidak ada jadwal pending (semua sudah Delivered/Arrived) untuk dilaporkan.",
  },
];

function copyTemplateMenuHtml(shipmentId) {
  return COPY_TEMPLATES.map(
    (tpl) => `
      <li><button type="button" class="dropdown-item" data-action="copyTemplate" data-template="${tpl.id}" data-id="${shipmentId}">
        <i class="bi ${tpl.icon}"></i> ${escapeHtml(tpl.label)}
      </button></li>`,
  ).join("");
}

async function copyShipment(templateId, id) {
  if (templateId === "AllImport") {
    await handleCopyExcel(id);
    return;
  }

  const tpl = COPY_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return;

  let s = null;
  if (tpl.scope === "shipment") {
    s = currentList().find((x) => x.id === id);
    if (!s) return;
    if (!s.items || !s.items.length) {
      showToast("Tidak ada barang untuk disalin.", "danger");
      return;
    }
  }

  const text = tpl.getText(s);
  if (!text) {
    showToast(tpl.emptyMsg || "Tidak ada data untuk disalin.", "dark");
    return;
  }

  const ok = await copyToClipboard(text);
  showToast(
    ok ? tpl.successMsg(s) : "Gagal menyalin ke clipboard.",
    ok ? "success" : "danger",
  );
}
