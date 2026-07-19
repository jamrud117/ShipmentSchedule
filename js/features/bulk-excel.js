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
const EXPORT_BULK_HEADERS = [
  "NO",
  "PENGIRIMAN DARI PABRIK",
  "PEB",
  "DATE",
  "AJU",
  "CONSIGNEE",
  "HS CODE",
  "DESCRIPTION",
  "QTY",
  "AMOUNT",
  "INCOTERMS",
  "FREIGHT",
  "INSURANCE",
  "BL/AWB",
  "NO. INVOICE / DEL.NOTE",
  "VESSEL",
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
  const innerRows =
    mode === "import"
      ? buildExcelCopyRows(s, formatter)
      : buildExportCopyRows(s, formatter);
  return innerRows.map((cols, idx) => [
    idx === 0 ? formatter.num(no, 0) : "",
    ...cols,
    idx === 0 ? formatter.text(s.notes) : "",
  ]);
}

async function handleBulkExport(mode) {
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

  // Terapkan format tanggal & persen supaya file-nya langsung enak
  // dibaca (bukan cuma angka/serial mentah).
  const dateCols = [1, 3]; // IN FACTORY/PENGIRIMAN & DATE, sama di kedua mode
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
  const sheetName = `ALL ${mode === "import" ? "IMPORT" : "EXPORT"} SHIPMENT`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fname = `bulk-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
  showToast(
    `File Excel (${list.length} jadwal, mode ${mode === "import" ? "Import" : "Export"}) berhasil diunduh.`,
    "success",
  );
}

// Kelompokkan baris-baris mentah (array-of-array, sudah lewat baris
// header) jadi per-jadwal: baris baru dimulai setiap kolom AJU terisi;
// baris berikutnya dgn AJU kosong dianggap kelanjutan jadwal yang sama
// (barang ke-2/dst, atau baris sisipan House BL/AWB). Baris yang benar2
// kosong semua (spacer) dilewati.
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
    voyage: excelStr(first[idx.VESSEL]), // kolom VESSEL -> field voyage (nomor pengangkut)
    vessel: "",
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
      hsCode: hs,
      jenisBarang:
        mode === "import"
          ? excelStr(row[idx.ITEM]) || "Bahan Baku"
          : "Bahan Baku",
      qty,
      satuan: mode === "import" ? excelStr(row[idx.SAT]) : "",
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
  $("#bulkModeSelect").value = activeMode;
  $("#bulkModalTitle").textContent =
    action === "export" ? "Bulk Export Excel" : "Bulk Import Excel";
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
async function handleDeleteAll() {
  const totalImport = data.import.length;
  const totalExport = data.export.length;
  const total = totalImport + totalExport;

  if (!total) {
    showToast("Tidak ada data untuk dihapus.", "dark");
    return;
  }

  showConfirm(
    `Anda akan menghapus SELURUH data secara permanen: ${totalImport} jadwal Import dan ${totalExport} jadwal Export ` +
      `(total ${total} jadwal, beserta seluruh daftar barang di dalamnya). Tindakan ini TIDAK BISA dibatalkan. Lanjutkan?`,
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
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
        // shipment_items & shipment_route_stops ikut terhapus otomatis
        // lewat "on delete cascade".
        data.import = [];
        data.export = [];
        render();
        showToast("Semua data berhasil dihapus.", "dark");
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
  const mode = $("#bulkModeSelect").value;
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
