"use strict";

/* BULK EXPORT / IMPORT (Excel, menggantikan Ekspor JSON & Impor) */
const IMPORT_BULK_HEADERS = [
  "NO",
  "IN FACTORY",
  "SPPB",
  "DATE",
  "AJU",
  "SUPPLIER NAME",
  "ITEM",
  "HS CODE",
  "DESCRIPTION",
  "QTY",
  "SAT",
  "AMOUNT",
  "NDPBM",
  "INCOTERMS",
  "FREIGHT",
  "INSURANCE",
  "CIF",
  "FOB RUPIAH",
  "CIF RUPIAH",
  "TARIF",
  "BEA MASUK",
  "PPN 11%",
  "PPH",
  "TOTAL BM+PDRI",
  "PI",
  "FASILITAS / SKB",
  "BL/AWB",
  "NO. INVOICE / DEL.NOTE",
  "VESSEL",
  "PACKAGE",
  "REMARK",
];
// Mengikuti PERSIS urutan kolom template copy "All Export" (17 kolom
const EXPORT_BULK_HEADERS = [
  "NO",
  "PENGIRIMAN DARI PABRIK",
  "PEB",
  "PEB DATE",
  "AJU",
  "CONSIGNEE (BUYER NAME)",
  "HS CODE",
  "DESCRIPTION",
  "QTY",
  "AMOUNT",
  "INCOTERMS",
  "FREIGHT",
  "INSURANCE",
  "BL/AWB",
  "NO. INVOICE",
  "VESSEL NAME",
  "PACKAGE",
  "REMARK",
];
// Index kolom (0-based, termasuk NO di depan) buat baca-balik saat Bulk Import
const IMPORT_IDX = {
  NO: 0,
  FACTORY: 1,
  DOCNO: 2,
  DATE: 3,
  AJU: 4,
  PARTY: 5,
  ITEM: 6,
  HS: 7,
  DESC: 8,
  QTY: 9,
  SAT: 10,
  AMOUNT: 11,
  NDPBM: 12,
  INCOTERM: 13,
  FREIGHT: 14,
  INSURANCE: 15,
  TARIF: 19,
  BM: 20,
  PPN: 21,
  PPH: 22,
  PI: 24,
  SKB: 25,
  BLAWB: 26,
  INVOICE: 27,
  VESSEL: 28,
  PACKAGE: 29,
  REMARK: 30,
};
const EXPORT_IDX = {
  NO: 0,
  FACTORY: 1,
  DOCNO: 2,
  DATE: 3,
  AJU: 4,
  PARTY: 5,
  HS: 6,
  DESC: 7,
  QTY: 8,
  AMOUNT: 9,
  INCOTERM: 10,
  FREIGHT: 11,
  INSURANCE: 12,
  BLAWB: 13,
  INVOICE: 14,
  VESSEL: 15,
  PACKAGE: 16,
  REMARK: 17,
};

function buildBulkRowsForShipment(s, no, mode, formatter) {
  if (mode === "export") {
    // buildAllExportCopyRows() SUDAH memuat kolom NO (kosong) & REMARK
    const rows = buildAllExportCopyRows(s, formatter);
    if (rows.length) rows[0][0] = formatter.num(no, 0);
    return rows;
  }
  return buildExcelCopyRows(s, formatter).map((cols, idx) => [
    idx === 0 ? formatter.num(no, 0) : "",
    ...cols,
    idx === 0 ? formatter.text(s.notes) : "",
  ]);
}

// Baris untuk sheet template SELAIN "All Import"/"All Export" (mis
function buildTemplateSheetRows(list, tpl, formatter) {
  const builder =
    tpl.id === "DailyImport"
      ? buildDailyImportCopyRows
      : tpl.id === "DailyExport"
        ? buildDailyExportCopyRows
        : null;
  if (!builder) return null;
  const rows = [];
  list.forEach((s, i) => {
    const r = builder(s, formatter);
    if (r.length) r[0][0] = formatter.num(i + 1, 0);
    r.forEach((row) => rows.push(row));
  });
  return rows;
}

const DAILY_IMPORT_HEADERS = [
  "NO.", "SPPB", "SPPB DATE", "AJU", "STATUS", "PELABUHAN/TERMINAL",
  "SHIPPER", "GOODS DESCRIPTION", "QTY", "BRUTO", "BL/AWB", "SHIPPER DOC",
  "INVOICE", "VESSEL NAME", "FORWARDER", "ETD", "ETA", "ESTIMATE DELIVERY",
  "IN FACTORY DATE", "IN FACTORY TIME", "LCL/FCL", "CONTAINER", "NO. POL",
  "INCOTERM", "NOTES",
];
const DAILY_EXPORT_HEADERS = [
  "NO", "PEB", "PEB DATE", "AJU", "STATUS", "PELABUHAN MUAT", "CUSTOMER",
  "ITEM NAME", "QTY", "GROSS WEIGHT", "BL/AWB", "SHIPPER DOC", "INVOICE",
  "VESSEL NAME", "FORWARDER", "ETD", "ETA", "INCOTERM", "NOTES",
];
function headersForTemplate(tplId) {
  if (tplId === "DailyImport") return DAILY_IMPORT_HEADERS;
  if (tplId === "DailyExport") return DAILY_EXPORT_HEADERS;
  return null;
}

/* ------------------------------------------------------------------
   TATA LETAK BERKAS EKSPOR

   Ditulis dengan ExcelJS, bukan SheetJS: versi komunitas SheetJS
   mengabaikan gaya sel saat menulis. SheetJS tetap dipakai untuk
   MEMBACA berkas impor.
------------------------------------------------------------------ */
const XL_NAVY = "FF0A1B33";
const XL_TEPI = "FFDFE5ED";

function terapkanGayaSheet(ws, jumlahKolom) {
  ws.views = [{ state: "frozen", ySplit: 1 }];

  ws.eachRow((row, nomor) => {
    row.height = nomor === 1 ? 26 : 20;
    for (let c = 1; c <= jumlahKolom; c++) {
      const sel = row.getCell(c);
      sel.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: false,
      };
      sel.font = {
        name: "Calibri",
        size: 12,
        bold: nomor === 1,
        color: { argb: nomor === 1 ? "FFFFFFFF" : "FF1C2B45" },
      };
      if (nomor === 1) {
        sel.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: XL_NAVY },
        };
      }
      sel.border = {
        top: { style: "thin", color: { argb: XL_TEPI } },
        left: { style: "thin", color: { argb: XL_TEPI } },
        bottom: { style: "thin", color: { argb: XL_TEPI } },
        right: { style: "thin", color: { argb: XL_TEPI } },
      };
    }
  });
}

function isiSheet(ws, headers, rows, opsi) {
  const o = opsi || {};
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));

  ws.columns.forEach((kolom, i) => {
    kolom.width = Math.max(14, Math.min(30, String(headers[i] || "").length + 6));
  });

  /* Format tanggal & persen dipasang per kolom supaya angkanya tetap
     angka di Excel — bukan teks yang kebetulan terlihat seperti tanggal. */
  (o.kolomTanggal || []).forEach((c) => {
    ws.getColumn(c + 1).numFmt = "dd-mm-yyyy";
  });
  if (o.kolomPersen != null) {
    ws.getColumn(o.kolomPersen + 1).numFmt = "0.00%";
  }

  terapkanGayaSheet(ws, headers.length);
}

async function handleBulkExport(mode) {
  await ensureExcelJS(); // pustaka Excel diunduh saat dibutuhkan saja
  const list = (data[mode] || []).slice().sort((a, b) => {
    const da = a.docDate || a.factoryDate || "";
    const db = b.docDate || b.factoryDate || "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  if (!list.length) {
    showToast(
      `Tidak ada data jadwal ${mode === "import" ? "Import" : "Export"} untuk diekspor.`,
      "danger",
    );
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();

  const headers =
    mode === "import" ? IMPORT_BULK_HEADERS : EXPORT_BULK_HEADERS;
  const rows = [];
  list.forEach((s, i) => {
    buildBulkRowsForShipment(s, i + 1, mode, nativeFormatter).forEach((r) =>
      rows.push(r),
    );
  });

  const mainSheetName = mode === "import" ? "ALL IMPORT" : "ALL EXPORT";
  isiSheet(wb.addWorksheet(mainSheetName), headers, rows, {
    kolomTanggal: mode === "import" ? [1, 3] : [EXPORT_IDX.FACTORY, EXPORT_IDX.DATE],
    kolomPersen: mode === "import" ? IMPORT_IDX.TARIF : null,
  });

  templatesForMode(mode)
    .filter((tpl) => tpl.sheet && tpl.sheet !== mainSheetName)
    .forEach((tpl) => {
      const tplHeaders = headersForTemplate(tpl.id);
      const tplRows = buildTemplateSheetRows(list, tpl, nativeFormatter);
      if (!tplHeaders || !tplRows) return;
      const kolomTanggal = tplHeaders
        .map((h, i) => (/DATE|ETD|ETA|DELIVERY|STUFFING/i.test(h) ? i : -1))
        .filter((i) => i >= 0);
      isiSheet(wb.addWorksheet(tpl.sheet), tplHeaders, tplRows, { kolomTanggal });
    });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const tautan = document.createElement("a");
  tautan.href = URL.createObjectURL(blob);
  tautan.download = `bulk-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(tautan);
  tautan.click();
  document.body.removeChild(tautan);
  setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);

  showToast(
    `File Excel (${list.length} jadwal, mode ${mode === "import" ? "Import" : "Export"}) berhasil diunduh.`,
    "success",
  );
}

// Kolom VESSEL di file bulk berisi hasil gabungan
function splitVesselCell(raw) {
  const teks = String(raw || "").trim();
  if (!teks) return { vessel: "", voyage: "" };
  const bagian = teks.split(/\s+/);
  if (bagian.length === 1) return { vessel: "", voyage: bagian[0] };
  return {
    voyage: bagian[bagian.length - 1],
    vessel: bagian.slice(0, -1).join(" "),
  };
}

function groupBulkRows(rows, mode) {
  const idx = mode === "import" ? IMPORT_IDX : EXPORT_IDX;
  const groups = [];
  let current = null;
  rows.forEach((row) => {
    const isBlank = row.every((v) => v == null || String(v).trim() === "");
    if (isBlank) return;
    const aju = excelStr(row[idx.AJU]);
    if (aju) {
      current = { rows: [row] };
      groups.push(current);
    } else if (current) {
      current.rows.push(row);
    }
  });
  return groups;
}

function reconstructShipmentFromGroup(group, mode) {
  const idx = mode === "import" ? IMPORT_IDX : EXPORT_IDX;
  const rows = group.rows;
  const first = rows[0];

  const s = {
    mode,
    status: "process",
    noAju: excelStr(first[idx.AJU]),
    docNo: excelStr(first[idx.DOCNO]),
    docDate: excelValueToISODate(first[idx.DATE]),
    party: excelStr(first[idx.PARTY]),
    factoryDate: excelValueToISODate(first[idx.FACTORY]),
    incoterm: excelStr(first[idx.INCOTERM]),
    freight: excelNum(first[idx.FREIGHT]),
    insurance: excelNum(first[idx.INSURANCE]),
    invoice: excelStr(first[idx.INVOICE]),
    // Kolom VESSEL kini berisi hasil gabungan vesselNameForTemplate(): moda laut "<Nama Vessel> <No
    ...splitVesselCell(excelStr(first[idx.VESSEL])),
    package: excelStr(first[idx.PACKAGE]),
    notes: excelStr(first[idx.REMARK]),
  };
  if (mode === "import") {
    s.ndpbm = excelNum(first[idx.NDPBM]);
    s.tarif = roundNum(excelNum(first[idx.TARIF]) * 100, 4); // pecahan (0.05) -> persen (5)
    s.pi = excelStr(first[idx.PI]);
    s.bm = excelNum(first[idx.BM]);
    s.ppn = excelNum(first[idx.PPN]);
    s.pph = excelNum(first[idx.PPH]);
  }
  // Kolom FASILITAS/SKB di file legacy ini shipment-level (bukan per barang)
  const legacySkbText = mode === "import" ? excelStr(first[idx.SKB]) : "";

  // BL/AWB: baris pertama = Master
  s.masterBL = excelStr(first[idx.BLAWB]);
  s.houseBL = rows.length >= 2 ? excelStr(rows[1][idx.BLAWB]) : "";

  // ITEMS: baris yang punya data barang asli (deskripsi/HS/qty tidak kosong semua)
  const items = [];
  rows.forEach((row) => {
    const desc = excelStr(row[idx.DESC]);
    const hs = excelStr(row[idx.HS]);
    const qty = excelNum(row[idx.QTY]);
    if (!desc && !hs && !qty) return;
    const amount = excelNum(row[idx.AMOUNT]);
    items.push({
      ...newItem(),
      /* Huruf besar, sama seperti impor berkas tunggal. Impor massal
         punya jalurnya sendiri dan TIDAK lewat apply-to-form.js, jadi
         aturannya harus disebut lagi di sini — kalau tidak, satu-satunya
         jalur yang memasukkan ratusan baris sekaligus justru yang
         terlewat. */
      namaBarang: String(desc || "").toUpperCase(),
      hsCode: normalizeHsCodeInput(hs),
      jenisBarang:
        mode === "import"
          ? excelStr(row[idx.ITEM]) || "Bahan Baku"
          : "Barang Jadi",
      qty,
      satuan: mode === "import" ? excelStr(row[idx.SAT]) : "",
      package: excelStr(row[idx.PACKAGE]),
      harga: qty ? roundNum(amount / qty, 4) : amount,
    });
  });

  if (legacySkbText && items.length) {
    const legacyEntries = skbTextToEntries(legacySkbText);
    items.forEach((it) => {
      it.skb = legacyEntries.map((sk) => ({ ...sk }));
    });
  }

  return { shipment: s, items };
}

async function handleBulkImport(mode, file) {
  await ensureXLSX(); // pustaka Excel diunduh saat dibutuhkan saja
  const modeLabel = mode === "import" ? "Import" : "Export";
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      showToast("File Excel ini tidak punya sheet sama sekali.", "danger");
      return;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    });
    if (rows.length < 2) {
      showToast(
        "File Excel ini tidak punya data (cuma header atau kosong).",
        "danger",
      );
      return;
    }
    const groups = groupBulkRows(rows.slice(1), mode);
    if (!groups.length) {
      showToast(
        "Tidak ada baris yang bisa dikenali — pastikan kolom AJU terisi di baris pertama tiap jadwal.",
        "danger",
      );
      return;
    }
    const reconstructed = groups
      .map((g) => reconstructShipmentFromGroup(g, mode))
      .filter((r) => r.items.length);

    if (!reconstructed.length) {
      showToast(
        "Tidak ada jadwal dengan barang yang valid di file ini.",
        "danger",
      );
      return;
    }

    showConfirm(
      `File ini punya ${reconstructed.length} jadwal ${modeLabel}. Ini akan MENGGANTI seluruh jadwal ${modeLabel} yang tersimpan di database dengan isi file ini. Lanjutkan?`,
      async () => {
        try {
          const { error: delErr } = await supabaseClient
            .from("shipments")
            .delete()
            .eq("mode", mode);
          if (delErr) throw delErr;
          for (const r of reconstructed) {
            await createShipment(r.shipment, r.items);
          }
          await loadShipments();
          showToast(
            `${reconstructed.length} jadwal ${modeLabel} berhasil diimpor.`,
            "success",
          );
        } catch (err) {
          console.error(err);
          showToast("Gagal mengimpor data ke database.", "danger");
          loadShipments();
        }
      },
    );
  } catch (err) {
    console.error(err);
    showToast(
      "Gagal membaca file Excel ini. Pastikan formatnya sesuai template Bulk Export.",
      "danger",
    );
  }
}

/* ---- Modal pemilih mode (Bulk Export / Bulk Import) ---- */
let bulkAction = "export";
function openBulkModal(action) {
  bulkAction = action;
  // Requirement D: "Bulk export/import: hilangkan dropdown konfirmasi pilihan Import/Export
  const modeLabel = activeMode === "import" ? "Import" : "Export";
  $("#bulkModeInfo").textContent = `Section aktif: Jadwal ${modeLabel}`;
  $("#bulkModalTitle").textContent =
    action === "export"
      ? `Bulk Export Excel — Jadwal ${modeLabel}`
      : `Bulk Import Excel — Jadwal ${modeLabel}`;
  $("#bulkExportInfo").classList.toggle("d-none", action !== "export");
  $("#bulkImportSection").classList.toggle("d-none", action !== "import");
  $("#bulkActionBtn").textContent =
    action === "export" ? "Unduh Excel" : "Proses Import";
  $("#bulkImportFile").value = "";
  bulkModal.show();
}


/* Templat mengikuti section yang sedang dibuka — sama dengan yang
   dipakai Bulk Import itu sendiri. Kolom Import dan Export berbeda,
   dan templat yang salah mode akan ditolak saat diunggah kembali. */
$("#btnBulkTemplate")?.addEventListener("click", () => {
  unduhTemplateBulk(activeMode === "export" ? "export" : "import");
});

$("#btnBulkExport").addEventListener("click", () => openBulkModal("export"));
$("#btnBulkImport").addEventListener("click", () => {
  if (!requireEdit()) return;
  openBulkModal("import");
});

/* ---- Hapus Semua Data (Import + Export, permanen dari database) ---- */
// Requirement D: "Hapus Semua harus per section"
async function handleDeleteAll() {
  const mode = activeMode;
  const modeLabel = mode === "import" ? "Import" : "Export";
  const total = (data[mode] || []).length;

  if (!total) {
    showToast(`Tidak ada data Jadwal ${modeLabel} untuk dihapus.`, "dark");
    return;
  }

  showConfirm(
    `Anda akan menghapus SELURUH data Jadwal ${modeLabel} secara permanen: ${total} jadwal ` +
      `beserta seluruh daftar barang di dalamnya. Jadwal ${mode === "import" ? "Export" : "Import"} TIDAK ikut terhapus. ` +
      `Tindakan ini TIDAK BISA dibatalkan. Lanjutkan?`,
    async () => {
      const btn = $("#btnDeleteAll");
      const originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm" role="status"></span> Menghapus...';
      try {
        // Dibatasi kolom `mode`, jadi hanya section yang sedang dibuka yang terhapus
        const { error } = await supabaseClient
          .from("shipments")
          .delete()
          .eq("mode", mode);
        if (error) throw error;
        // shipment_items & shipment_route_stops ikut terhapus otomatis lewat "on delete cascade".
        data[mode] = [];
        render();
        showToast(`Semua data Jadwal ${modeLabel} berhasil dihapus.`, "dark");
      } catch (err) {
        console.error(err);
        showToast("Gagal menghapus data dari database.", "danger");
        loadShipments();
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    },
  );
}
$("#btnDeleteAll").addEventListener("click", () => {
  if (!requireEdit()) return;
  handleDeleteAll();
});

$("#bulkActionBtn").addEventListener("click", async () => {
  const mode = activeMode;
  if (bulkAction === "export") {
    /* Pustaka Excel diunduh dari CDN saat dibutuhkan. Kalau jaringannya
       putus, kegagalannya harus sampai ke pengguna — bukan berhenti diam
       sebagai unhandled rejection di konsol. */
    try {
      await handleBulkExport(mode);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Gagal membuat file Excel.", "danger");
    }
    bulkModal.hide();
  } else {
    const file = $("#bulkImportFile").files[0];
    if (!file) {
      showToast("Pilih file Excel dulu.", "danger");
      return;
    }
    bulkModal.hide();
    await handleBulkImport(mode, file);
  }
});
