"use strict";

/* ==================================================================
   BULK EXPORT / IMPORT (Excel, menggantikan Ekspor JSON & Impor)
   Format kolom mengikuti IMPORT_FORMAT.xlsx (31 kolom, NO..REMARK)
   dan EXPORT_FORMAT.xlsx (18 kolom, NO..REMARK), sheet pertama di
   file = data (sheet SUMMARY di template asli diabaikan).
================================================================== */
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
// Mengikuti PERSIS urutan kolom template copy "All Export" (17 kolom,
// requirement E) supaya hasil Bulk Export bisa langsung dipaste ke sheet
// yang sama dengan hasil tombol Copy.
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
// Index kolom (0-based, termasuk NO di depan) buat baca-balik saat Bulk
// Import — harus sinkron persis dengan urutan header & dengan susunan
// buildExcelCopyRows()/buildExportCopyRows() (yang tidak termasuk NO
// & REMARK, makanya semua index di sini +1 dari index di fungsi itu).
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
    // buildAllExportCopyRows() SUDAH memuat kolom NO (kosong) & REMARK,
    // jadi cukup nomor urutnya yang diisi di sini.
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

// Baris untuk sheet template SELAIN "All Import"/"All Export" (mis.
// Daily Import/Daily Export). Sheet-sheet ini murni untuk dibaca/dipaste
// manusia — Bulk Import tetap membaca sheet pertama saja (format All
// Import/All Export), lihat handleBulkImport().
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

async function handleBulkExport(mode) {
  await ensureXLSX(); // pustaka Excel diunduh saat dibutuhkan saja
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
  const headers =
    mode === "import" ? IMPORT_BULK_HEADERS : EXPORT_BULK_HEADERS;
  const aoa = [headers];
  list.forEach((s, i) => {
    buildBulkRowsForShipment(s, i + 1, mode, nativeFormatter).forEach((r) =>
      aoa.push(r),
    );
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map(() => ({ wch: 15 }));

  // Format tanggal & persen supaya file langsung enak dibaca.
  const dateCols = mode === "import" ? [1, 3] : [EXPORT_IDX.FACTORY, EXPORT_IDX.DATE];
  const tarifCol = mode === "import" ? IMPORT_IDX.TARIF : null;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 1; r <= range.e.r; r++) {
    dateCols.forEach((c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v instanceof Date) cell.z = "d-mmm-yy";
    });
    if (tarifCol != null) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: tarifCol })];
      if (cell && typeof cell.v === "number") cell.z = "0.00%";
    }
  }

  const wb = XLSX.utils.book_new();
  const mainSheetName = mode === "import" ? "ALL IMPORT" : "ALL EXPORT";
  XLSX.utils.book_append_sheet(wb, ws, mainSheetName);

  // Requirement E: "Bulk export: sesuaikan dengan masing-masing template
  // copy — buat sheet terpisah per nama template copy, KECUALI template
  // Report (tidak usah ada sheetnya)." Sheet "All Import"/"All Export"
  // sudah dibuat di atas (dipakai juga sbg format baca Bulk Import);
  // sisanya (Daily) ditambahkan di sini.
  templatesForMode(mode)
    .filter((tpl) => tpl.sheet && tpl.sheet !== mainSheetName)
    .forEach((tpl) => {
      const tplHeaders = headersForTemplate(tpl.id);
      const tplRows = buildTemplateSheetRows(list, tpl, nativeFormatter);
      if (!tplHeaders || !tplRows) return;
      const tws = XLSX.utils.aoa_to_sheet([tplHeaders, ...tplRows]);
      tws["!cols"] = tplHeaders.map(() => ({ wch: 15 }));
      const trange = XLSX.utils.decode_range(tws["!ref"]);
      for (let r = 1; r <= trange.e.r; r++) {
        tplHeaders.forEach((h, c) => {
          if (!/DATE|ETD|ETA|DELIVERY/i.test(h)) return;
          const cell = tws[XLSX.utils.encode_cell({ r, c })];
          if (cell && cell.v instanceof Date) cell.z = "d-mmm-yy";
        });
      }
      XLSX.utils.book_append_sheet(wb, tws, tpl.sheet);
    });

  const fname = `bulk-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
  showToast(
    `File Excel (${list.length} jadwal, mode ${mode === "import" ? "Import" : "Export"}) berhasil diunduh.`,
    "success",
  );
}

// Kolom VESSEL di file bulk berisi hasil gabungan (lihat
// vesselNameForTemplate di features/copy-templates.js). Dipecah kembali
// jadi field terpisah supaya form terisi benar saat Bulk Import.
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
    // Kolom VESSEL kini berisi hasil gabungan vesselNameForTemplate():
    // moda laut "<Nama Vessel> <No. Voyage>", moda udara "<No. Flight>".
    // Dipecah balik di sini: token TERAKHIR dianggap nomor pengangkut
    // (selalu tanpa spasi, mis. "2606S"/"0028N"), sisanya nama vessel.
    // Kalau isinya cuma satu token, itu nomor pengangkut saja.
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
  // Kolom FASILITAS/SKB di file legacy ini shipment-level (bukan per
  // barang) — sama seperti import PDF, diterapkan ke SEMUA barang
  // sebagai default (di-clone per barang), user tinggal hapus lewat
  // tombol Fasilitas kalau ada yang tidak seharusnya dapat (lihat
  // pemakaian legacySkbText di bawah, setelah `items` terbentuk).
  const legacySkbText = mode === "import" ? excelStr(first[idx.SKB]) : "";

  // BL/AWB: baris pertama = Master. Baris kedua dalam grup (barang ke-2
  // ATAU baris sisipan khusus House) -> House.
  s.masterBL = excelStr(first[idx.BLAWB]);
  s.houseBL = rows.length >= 2 ? excelStr(rows[1][idx.BLAWB]) : "";

  // ITEMS: baris yang punya data barang asli (deskripsi/HS/qty tidak
  // kosong semua). Baris sisipan House BL/AWB (semua kolom barang
  // kosong) dilewati, tidak dihitung sebagai barang.
  const items = [];
  rows.forEach((row) => {
    const desc = excelStr(row[idx.DESC]);
    const hs = excelStr(row[idx.HS]);
    const qty = excelNum(row[idx.QTY]);
    if (!desc && !hs && !qty) return;
    const amount = excelNum(row[idx.AMOUNT]);
    items.push({
      ...newItem(),
      namaBarang: desc,
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
  // Requirement D: "Bulk export/import: hilangkan dropdown konfirmasi
  // pilihan Import/Export — cukup auto-detect section yang sedang aktif."
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

$("#btnBulkExport").addEventListener("click", () => openBulkModal("export"));
$("#btnBulkImport").addEventListener("click", () => openBulkModal("import"));

/* ---- Hapus Semua Data (Import + Export, permanen dari database) ---- */
// Requirement D: "Hapus Semua harus per section" — di section Import
// hanya jadwal Import yang terhapus, begitu pula sebaliknya. Sebelumnya
// tombol ini menghapus SELURUH data kedua section sekaligus.
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
        // Filter "neq id kosong" dipakai supaya delete berlaku ke SEMUA baris
        // (Supabase/PostgREST butuh minimal satu filter untuk operasi delete).
        const { error } = await supabaseClient
          .from("shipments")
          .delete()
          .eq("mode", mode);
        if (error) throw error;
        // shipment_items & shipment_route_stops ikut terhapus otomatis
        // lewat "on delete cascade".
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
$("#btnDeleteAll").addEventListener("click", handleDeleteAll);

$("#bulkActionBtn").addEventListener("click", async () => {
  const mode = activeMode;
  if (bulkAction === "export") {
    await handleBulkExport(mode);
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
