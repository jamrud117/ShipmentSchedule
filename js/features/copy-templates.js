"use strict";

/* Nama Barang + Size (Export) untuk template yang cuma punya SATU
   kolom deskripsi barang (bukan kolom Uraian & Size terpisah seperti
   di form) -- CIPL (cipl-print.js) sudah punya penanganannya sendiri
   lewat ciplPecahNama()/kolom item+type; ini untuk tempat lain yang
   cuma butuh satu baris teks. `it.size` baru relevan di Export (lihat
   body.mode-import .size-col, form.css) -- kosong/tidak ada di Import,
   jadi aman dipanggil apa pun mode-nya. */
/* Diteruskan ke itemDisplayName() di helpers.js.

   Dulu fungsi ini merakit namanya sendiri (nama + size saja), sehingga
   Pattern & Mold No yang tampil di kartu TIDAK ikut tersalin -- dua
   tempat merakit nama yang sama dengan aturan berbeda. Namanya
   dipertahankan supaya pemanggil yang sudah ada tidak perlu diubah. */
function namaBarangDenganSize(it) {
  return itemDisplayName(it);
}

/* COPY TEMPLATE PICKER — dropdown pilihan template di tombol Copy */

function rowsToClipboardText(rows) {
  return rows.map((cols) => cols.map(tsvField).join("\t")).join("\n");
}

/* Requirement B — "Nama Vessel untuk template copy: moda udara -> isi */
function vesselNameForTemplate(s) {
  const vessel = (s.vessel || "").trim();
  const voyage = (s.voyage || "").trim();
  if (s.transport === "udara") return voyage;
  return [vessel, voyage].filter(Boolean).join(" ");
}

/* Master di baris 1, House di baris 2. KALAU MASTER KOSONG, House naik */
function applyMasterHouseBL(rows, masterBL, houseBL, colIdx, totalCols, formatter) {
  const master = (masterBL || "").trim();
  const house = (houseBL || "").trim();
  if (!rows.length) return;

  if (!master) {
    if (house) rows[0][colIdx] = formatter.text(house);
    return;
  }

  rows[0][colIdx] = formatter.text(master);
  if (!house) return;
  if (rows.length >= 2) {
    rows[1][colIdx] = formatter.text(house);
  } else {
    const blankRow = new Array(totalCols).fill(formatter.blank);
    blankRow[colIdx] = formatter.text(house);
    rows.push(blankRow);
  }
}

/* KOLOM "NO" DIBUANG SAAT DISALIN — TAPI HANYA SAAT DISALIN.

   Kolom itu selalu kosong di hasil salin, dan sel kosong yang ditempel
   ke Excel TETAP MENIMPA isi sel tujuan. Akibatnya penomoran dokumen
   yang sudah ada di sheet ikut terhapus setiap kali menempel. Menggeser
   satu kolom ke kanan sebelum menempel bisa dilupakan; membuang
   kolomnya tidak bisa.

   JANGAN dibuang dari pembangun barisnya. Baris yang sama dipakai
   ulang oleh Bulk Excel (js/features/bulk-excel.js), dan di sana kolom
   NO justru DIISI nomor sungguhan — lalu dibaca balik lewat
   IMPORT_IDX.NO = 0 saat Bulk Import. Menghapusnya di hulu akan
   menggeser SELURUH indeks kolom di kedua arah itu. */
function tanpaKolomNo(rows) {
  return rows.map((cols) => cols.slice(1));
}

/* ALL IMPORT — buildExcelCopyRows() yang sudah ada, ditambah 1 kolom */
function buildAllImportCopyText(s) {
  const rows = buildExcelCopyRows(s, clipboardFormatter).map((cols) => [
    clipboardFormatter.blank, // kolom NO — diisi Bulk Excel, dibuang saat disalin
    ...cols,
  ]);
  return rowsToClipboardText(tanpaKolomNo(rows));
}

/* ALL EXPORT — 17 kolom (requirement E) */
const ALL_EXPORT_COLS = 18;
function buildAllExportCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const items = s.items || [];
  // Kolom yang hanya diisi di BARIS PERTAMA (data tingkat pengiriman)
  const FIRST_ROW_ONLY_IDX = [1, 2, 3, 4, 5, 10, 11, 12, 14, 15, 17];

  const rows = items.map((it, idx) => {
    const cols = [
      formatter.blank, // 0  NO — dikosongkan
      // Kolom 1 "PENGIRIMAN DARI PABRIK" ADA di sheet tujuan Bgenius
      formatter.date(s.actual), // 1  PENGIRIMAN DARI PABRIK = tanggal Stuffing
      formatter.text(s.docNo), // 2  PEB
      formatter.date(s.docDate), // 3  PEB DATE
      formatter.text(s.noAju), // 4  AJU
      formatter.text(s.party), // 5  CONSIGNEE (BUYER NAME)
      formatter.text(it.hsCode), // 6  HS CODE
      formatter.text(namaBarangDenganSize(it)), // 7  DESCRIPTION (+ Size kalau ada)
      formatter.num(it.qty, 2), // 8  QTY
      formatter.num((Number(it.qty) || 0) * (Number(it.harga) || 0), 2), // 9 AMOUNT
      formatter.text(s.incoterm), // 10 INCOTERMS
      formatter.num(s.freight, 2), // 11 FREIGHT
      formatter.num(s.insurance, 2), // 12 INSURANCE
      formatter.blank, // 13 BL/AWB — diisi terpisah
      formatter.text(s.invoice), // 14 NO. INVOICE
      formatter.text(vesselNameForTemplate(s)), // 15 VESSEL NAME
      formatter.text(it.package), // 16 PACKAGE — dimensi per barang
      formatter.text(s.notes), // 17 REMARK
    ];
    if (idx > 0) FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  });

  applyMasterHouseBL(rows, s.masterBL, s.houseBL, 13, ALL_EXPORT_COLS, formatter);
  return rows;
}
function buildAllExportCopyText(s) {
  return rowsToClipboardText(tanpaKolomNo(buildAllExportCopyRows(s, clipboardFormatter)));
}

/* DAILY IMPORT — 25 kolom (requirement E) */
const DAILY_IMPORT_COLS = 25;
/* Qty + satuan digabung jadi satu sel: "25 PCS".

   Di Daily Import/Export kolom QTY berdiri sendiri tanpa kolom satuan,
   jadi angka telanjang membuat 25 SET dan 25 PCS terbaca sama padahal
   maknanya jauh berbeda. Satuannya ditempel di belakang angka yang
   sudah diformat. */
function qtyDenganSatuan(it, formatter) {
  const angka = formatter.num(it.qty, 2);
  const satuan = (it.satuan || "").toString().trim();
  if (!satuan) return angka;
  return `${angka} ${satuan}`;
}

// Kolom "KGS" (BRUTO, Daily Import): dipakai juga di tempat lain kalau nanti perlu.
function totalKgsUntukDailyImport(s) {
  const items = s.items || [];
  /* NETTO didahulukan — LEBIH AKURAT dari Bruto (tidak ikut berat
     kemasan) — tapi CUMA kalau LENGKAP diisi di SEMUA barang; satu
     saja yang kosong/nol bikin totalnya sudah tidak mewakili berat
     bersih sungguhan (barang yang kelewat tidak ikut kehitung), jadi
     lebih aman jatuh balik ke Total Bruto se-pengiriman yang sudah
     ada (computeCustoms(), core/customs.js) daripada dipakai
     setengah-setengah. */
  const nettoLengkap =
    items.length > 0 && items.every((it) => parseLooseNumber(it.netto) > 0);
  if (nettoLengkap) {
    return items.reduce((sum, it) => sum + parseLooseNumber(it.netto), 0);
  }
  return computeCustoms(s).totalBruto;
}

function buildDailyImportCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const items = s.items || [];
  /* BRUTO (kolom 9, dipakai sebagai "KGS") sekarang Total se-PENGIRIMAN
     (Netto kalau lengkap, kalau tidak Total Bruto — lihat
     totalKgsUntukDailyImport() di atas), bukan berat barang per baris
     — makanya ikut masuk FIRST_ROW_ONLY_IDX di bawah, sebaris dengan
     field level-pengiriman lain (SPPB, AJU, dst.): sekali tampil di
     baris pertama, bukan diulang di semua baris. */
  const totalKgs = totalKgsUntukDailyImport(s);
  const FIRST_ROW_ONLY_IDX = [
    1, 2, 3, 4, 5, 6, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  ];

  const rows = items.map((it, idx) => {
    const cols = [
      formatter.blank, // 0  NO.
      formatter.text(s.docNo), // 1  SPPB
      formatter.date(s.docDate), // 2  SPPB DATE
      formatter.text(s.noAju), // 3  AJU
      formatter.text(statusTemplateValue(s.status)), // 4  STATUS
      formatter.text(s.destination), // 5  PELABUHAN / TERMINAL
      formatter.text(s.party), // 6  SHIPPER
      formatter.text(itemDisplayName(it)), // 7  GOODS DESCRIPTION (+ Size/Pattern/Mold No)
      qtyDenganSatuan(it, formatter), // 8  QTY (+ satuan)
      formatter.num(totalKgs, 2), // 9  BRUTO / KGS (Netto kalau lengkap, jika tidak Total Bruto)
      formatter.blank, // 10 BL/AWB — diisi terpisah
      formatter.blank, // 11 SHIPPER DOC — tidak ada field-nya
      formatter.text(s.invoice), // 12 INVOICE
      formatter.text(vesselNameForTemplate(s)), // 13 VESSEL NAME
      formatter.text(s.forwarder), // 14 FORWARDER
      formatter.date(s.etd), // 15 ETD
      formatter.date(s.eta), // 16 ETA
      formatter.date(s.actual), // 17 ESTIMATE DELIVERY
      formatter.date(s.factoryDate), // 18 IN FACTORY DATE
      formatter.text(s.factoryTime), // 19 IN FACTORY TIME
      formatter.text(s.muatan), // 20 LCL/FCL
      formatter.text(s.container), // 21 CONTAINER
      formatter.blank, // 22 NO. POL — tidak ada field-nya
      formatter.text(s.incoterm), // 23 INCOTERM
      formatter.text(s.notes), // 24 NOTES
    ];
    if (idx > 0) FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  });

  applyMasterHouseBL(rows, s.masterBL, s.houseBL, 10, DAILY_IMPORT_COLS, formatter);
  return rows;
}

/* DAILY EXPORT — 19 kolom (urutan mengikuti berkas format aslinya */
const DAILY_EXPORT_COLS = 19;
function buildDailyExportCopyRows(s, formatter) {
  formatter = formatter || clipboardFormatter;
  const items = s.items || [];
  const FIRST_ROW_ONLY_IDX = [1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18];

  const rows = items.map((it, idx) => {
    const cols = [
      formatter.blank, // 0  NO
      formatter.text(s.docNo), // 1  PEB
      formatter.date(s.docDate), // 2  PEB DATE
      formatter.text(s.noAju), // 3  AJU
      formatter.text(statusTemplateValue(s.status)), // 4  STATUS
      formatter.text(s.origin), // 5  PELABUHAN MUAT
      formatter.text(s.party), // 6  CUSTOMER
      formatter.text(namaBarangDenganSize(it)), // 7  ITEM NAME (+ Size kalau ada)
      qtyDenganSatuan(it, formatter), // 8  QTY (+ satuan)
      formatter.num(it.bruto, 2), // 9  GROSS WEIGHT
      formatter.blank, // 10 BL/AWB — diisi terpisah
      formatter.blank, // 11 SHIPPER DOC
      formatter.text(s.invoice), // 12 INVOICE
      formatter.text(vesselNameForTemplate(s)), // 13 VESSEL NAME
      formatter.text(s.forwarder), // 14 FORWARDER
      formatter.date(s.etd), // 15 ETD
      formatter.date(s.eta), // 16 ETA
      formatter.text(s.incoterm), // 17 INCOTERM
      formatter.text(s.notes), // 18 NOTES
    ];
    if (idx > 0) FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
    return cols;
  });

  applyMasterHouseBL(rows, s.masterBL, s.houseBL, 10, DAILY_EXPORT_COLS, formatter);
  return rows;
}

/* INFO BARANG BARU — pesan siap kirim ke tim saat ada kiriman IMPORT
   baru, dibuat dari satu Card (bukan agregat seperti Report). Daftar
   barang ikut urutan Daftar Barang di Card itu, TANPA di-dedupe
   (reportItemNames() yang meringkas jadi satu baris). Tiga
   tanggalnya dari Card yang sama: ETD, ETA, dan "Estimasi sampai
   pabrik" = kolom Estimasi Delivery (field `actual` -- sama seperti
   dipakai Report untuk arti yang sama, lihat reportDetailPairs()). */
function buildImportAnnouncementText(s) {
  const daftarBarang = (s.items || [])
    .map((it) => itemDisplayName(it))
    .filter(Boolean);
  if (!daftarBarang.length) return "";
  return [
    "Dear Team,",
    "",
    `Akan ada barang import baru nomor invoice ${s.invoice || ""}`,
    "",
    daftarBarang.map((nama) => `* ${nama}`).join("\n"),
    "",
    "",
    `ETD : ${fmtDate(s.etd)}, ETA : ${fmtDate(s.eta)}, Estimasi sampai pabrik : ${fmtDate(s.actual)}`,
  ].join("\n");
}

/* REPORT — ringkasan SEMUA jadwal (Import + Export) yang belum selesai */

// Nama barang untuk Report: HANYA barang PERTAMA (sesuai permintaan)
function reportItemNames(s) {
  const seen = new Set();
  const out = [];
  (s.items || []).forEach((it) => {
    // + Size (Export) supaya dua ukuran beda dari nama dasar yang sama
    // (mis. "TYRE MOLD TREAD ONLY" 235/55R20 vs 195/65R15) tidak
    // ke-dedupe jadi satu baris seolah barang yang persis sama.
    const nama = namaBarangDenganSize(it);
    if (!nama) return;
    const key = nama.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(nama);
  });
  return out;
}

// Satu baris ringkas: nama barang PERTAMA + jumlah sisanya
function reportItemSummary(s) {
  const names = reportItemNames(s);
  if (!names.length) return "";
  const sisa = names.length - 1;
  return sisa > 0 ? `${names[0]} + ${sisa} Items` : names[0];
}

// Baris ke-2 & ke-3 tiap pengiriman
function reportDetailPairs(s, mode) {
  // Daftar DATAR berisi pasangan [label, nilai]
  if (mode === "export") {
    const pkg = extractLeadingNumber(s.package);
    return [
      ["Packages", pkg == null ? "0" : String(Math.round(pkg))],
      /* effectiveEtd/Eta = tanggal TERBARU: pakai hasil update delay
         kalau ada, kalau tidak jatuh ke jadwal awal. Report dikirim
         supaya penerimanya tahu keadaan sekarang -- melaporkan jadwal
         lama yang sudah diketahui meleset justru menyesatkan. */
      ["ETD", fmtDateLong(effectiveEtd(s))],
      ["ETA", fmtDateLong(effectiveEta(s))],
      // Tanggal STUFFING, bukan ETD
      ["Estimasi Stuffing", fmtDateLong(s.actual)],
    ];
  }
  /* Import: yang dilaporkan PERKIRAAN tiba di pabrik — kolom `actual`
     yang di buku ini berlabel "Estimated Delivery".

     Sengaja BUKAN In Factory: kolom itu baru terisi setelah barangnya
     benar-benar masuk, sementara Report justru daftar yang BELUM tiba.
     Memakainya berarti kolom tanggalnya selalu kosong. */
  return [
    ["Incoterm", dispVal(s.incoterm)],
    ["Mode", dispVal(s.muatan)],
    ["ETD", fmtDateLong(effectiveEtd(s))],
    ["ETA", fmtDateLong(effectiveEta(s))],
    ["Perkiraan Tiba di Pabrik", fmtDateLong(s.actual)],
  ];
}

function reportHeadline(s, mode) {
  return `Shipment ${mode === "export" ? "To" : "From"} ${dispVal(s.party)}`;
}

/* Patokan urutan Report = tanggal yang DITAMPILKAN pada tiap baris,
   supaya urutannya bisa ditelusuri langsung dari yang terbaca:

     Import -> Estimated Delivery (perkiraan tiba di pabrik)
     Export -> Stuffing

   Keduanya kolom `actual`, hanya berbeda label per buku. */
function reportSortDate(s, mode) {
  return s.actual || "";
}

/* Jadwal Export yang stuffing-nya sudah lewat ATAU jatuh HARI INI
   tidak ikut dilaporkan.

   Report dibaca sebagai daftar "yang masih akan dikerjakan". Muatan
   yang hari ini sedang di-stuffing sudah ditangani orang di lapangan;
   memasukkannya membuat penerima laporan menghubungi tim untuk hal
   yang sedang berjalan saat itu juga.

   Yang stuffing-nya BELUM diisi tetap masuk: belum ada tanggal berarti
   belum terjadi, dan justru itu yang perlu diingatkan. */
function exportStuffingBelumLewat(s) {
  if (!s.actual) return true;
  return s.actual > todayISO();
}

function pendingByMode(mode) {
  return (data[mode] || [])
    .filter((s) => !isArrived(s))
    .filter((s) => (mode === "export" ? exportStuffingBelumLewat(s) : true))
    // Yang paling DEKAT di paling atas
    .sort((a, b) => {
      const da = reportSortDate(a, mode);
      const db = reportSortDate(b, mode);
      // Jadwal yang tanggalnya BELUM diisi ditaruh paling bawah — belum bisa diurutkan
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : da > db ? 1 : 0;
    });
}

/* ---- versi TEKS POLOS ---- */
function buildReportCopyText() {
  const blocks = [];
  ["import", "export"].forEach((mode) => {
    const list = pendingByMode(mode);
    if (!list.length) return;
    const lines = [mode.toUpperCase(), ""];
    const width = String(list.length).length;
    list.forEach((s, i) => {
      const no = String(i + 1).padStart(width, " ") + ".";
      const pad = " ".repeat(width + 2);
      const detail = reportDetailPairs(s, mode)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
      lines.push(`${no} ${reportHeadline(s, mode)} | ${detail}`);
      const barang = reportItemSummary(s);
      if (barang) lines.push(`${pad}o ${barang}`);
      if (i < list.length - 1) lines.push("");
    });
    blocks.push(lines.join("\n"));
  });
  return blocks.join("\n\n");
}

/* ---- versi HTML (yang dipakai email) ---- */
function buildReportCopyHtml() {
  const sections = [];
  ["import", "export"].forEach((mode) => {
    const list = pendingByMode(mode);
    if (!list.length) return;
    const items = list
      .map((s) => {
        // Judul & label ditebalkan, nilainya biasa
        const detail = reportDetailPairs(s, mode)
          .map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`)
          .join(' <span style="color:#94a3b8">|</span> ');
        const barang = reportItemSummary(s);
        const daftar = barang
          ? `<ul style="margin:4px 0 0;padding-left:18px;list-style:circle">
               <li style="margin:1px 0">${escapeHtml(barang)}</li>
             </ul>`
          : "";
        return `<li style="margin-bottom:10px">
          <b>${escapeHtml(reportHeadline(s, mode))}</b>
          <span style="color:#94a3b8"> | </span>${detail}
          ${daftar}
        </li>`;
      })
      .join("");
    sections.push(
      `<p style="font-weight:700;letter-spacing:.04em;margin:0 0 8px">${mode.toUpperCase()}</p>
       <ol style="margin:0 0 20px;padding-left:24px">${items}</ol>`,
    );
  });
  if (!sections.length) return "";
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.55;color:#111">${sections.join(
    "",
  )}</div>`;
}

/* REGISTRY TEMPLATE COPY */
const COPY_TEMPLATES = [
  {
    id: "AllImport",
    label: "All Import",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    modes: ["import"],
    sheet: "ALL IMPORT",
    getText: (s) => buildAllImportCopyText(s),
    successMsg: () => t("v.template.all.import.berhasil.disalin.ke.clipbo"),
  },
  {
    id: "AllExport",
    label: "All Export",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    modes: ["export"],
    sheet: "ALL EXPORT",
    getText: (s) => buildAllExportCopyText(s),
    successMsg: () => t("v.template.all.export.berhasil.disalin.ke.clipbo"),
  },
  {
    id: "DailyImport",
    label: "Daily Import",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    modes: ["import"],
    sheet: "DAILY IMPORT",
    getText: (s) =>
      rowsToClipboardText(tanpaKolomNo(buildDailyImportCopyRows(s, clipboardFormatter))),
    successMsg: () => t("v.template.daily.import.berhasil.disalin.ke.clip"),
  },
  {
    id: "DailyExport",
    label: "Daily Export",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    modes: ["export"],
    sheet: "DAILY EXPORT",
    getText: (s) =>
      rowsToClipboardText(tanpaKolomNo(buildDailyExportCopyRows(s, clipboardFormatter))),
    successMsg: () => t("v.template.daily.export.berhasil.disalin.ke.clip"),
  },
  {
    id: "ImportAnnouncement",
    label: "Info Barang Baru",
    icon: "bi-file-earmark-text",
    scope: "shipment",
    modes: ["import"],
    // Sengaja tanpa `sheet` — bukan data tabel, tidak untuk Bulk Excel.
    getText: (s) => buildImportAnnouncementText(s),
    successMsg: () => t("v.template.info.barang.baru.berhasil.disalin.ke."),
  },
  {
    id: "Report",
    label: "Report",
    icon: "bi-file-earmark-text",
    scope: "global",
    modes: ["import", "export"],
    // Report SENGAJA tidak punya `sheet`
    getText: () => buildReportCopyText(),
    // Versi berformat untuk email — lihat copyRichToClipboard().
    getHtml: () => buildReportCopyHtml(),
    successMsg: () => t("v.template.report.berhasil.disalin.ke.clipboard"),
    emptyMsg:
      t("s.tidak.ada.jadwal.pending.semua.sudah.delivered"),
  },
];

// Template yang berlaku di section yang sedang aktif.
function templatesForMode(mode) {
  return COPY_TEMPLATES.filter((t) => t.modes.includes(mode || activeMode));
}

function copyTemplateMenuHtml(shipmentId) {
  return templatesForMode(activeMode)
    .map(
      (tpl) => `
      <li><button type="button" class="dropdown-item" data-action="copyTemplate" data-template="${tpl.id}" data-id="${shipmentId}">
        <i class="bi ${tpl.icon}"></i> ${escapeHtml(tpl.label)}
      </button></li>`,
    )
    .join("");
}

async function copyShipment(templateId, id) {
  const tpl = COPY_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return;

  let s = null;
  if (tpl.scope === "shipment") {
    s = currentList().find((x) => x.id === id);
    if (!s) return;
    if (!s.items || !s.items.length) {
      showToast(t("m.tidak.ada.barang.untuk.disalin"), "danger");
      return;
    }
  }

  const text = tpl.getText(s);
  if (!text) {
    showToast(tpl.emptyMsg || t("s.tidak.ada.data.untuk.disalin"), "dark");
    return;
  }

  const html = tpl.getHtml ? tpl.getHtml(s) : "";
  const ok = html
    ? await copyRichToClipboard(html, text)
    : await copyToClipboard(text);
  showToast(
    ok ? tpl.successMsg(s) : t("v.gagal.menyalin.ke.clipboard"),
    ok ? "success" : "danger",
  );
}
