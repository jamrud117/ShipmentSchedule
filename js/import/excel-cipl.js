"use strict";

/* IMPORT DARI EXCEL CIPL (Commercial Invoice + Packing List) */

function sheetToGrid(wb, name) {
  const sh = wb.Sheets[name];
  return sh
    ? XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: true })
    : [];
}
function findGridCell(grid, re) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === "string" && re.test(row[c])) return { r, c };
    }
  }
  return null;
}
function findAllGridCells(grid, re) {
  const out = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === "string" && re.test(row[c])) out.push({ r, c });
    }
  }
  return out;
}
function gridCellAt(grid, r, c) {
  return grid[r] && grid[r][c] != null ? grid[r][c] : null;
}
function gridStrAt(grid, r, c) {
  const v = gridCellAt(grid, r, c);
  return v == null ? "" : String(v).trim();
}
// Lebih toleran dari sekadar Number(): kalau ada satuan nempel di cell yang sama
function gridNumAt(grid, r, c) {
  const v = gridCellAt(grid, r, c);
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = /^\s*(-?[\d,]+\.?\d*)/.exec(String(v));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
// Nilai numerik yang boleh "lompat 1 kolom" kalau kolom yang diminta ternyata isinya label mata
function gridNumSkippingLabel(grid, r, c) {
  const raw = gridStrAt(grid, r, c);
  if (raw && (CURRENCY_TOKEN_RE.test(raw) || UNIT_QTY_RE.test(raw))) {
    return gridNumAt(grid, r, c + 1);
  }
  return gridNumAt(grid, r, c);
}

/* klasifikasi baris header tabel barang */
function findCiplHeaderBlocks(grid) {
  const NAME_KEYS = ["description", "item"];
  const DATA_KEYS = ["qty", "hsCode", "unitPrice", "amount", "netto", "bruto"];
  const blocks = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    const colMap = {};
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v !== "string" || !v.trim()) continue;
      const s = v.trim();
      for (const key in CIPL_COLUMN_LABELS) {
        if (colMap[key] !== undefined) continue;
        if (CIPL_COLUMN_LABELS[key].test(s)) colMap[key] = c;
      }
    }
    const hasName = NAME_KEYS.some((k) => colMap[k] !== undefined);
    const hasData = DATA_KEYS.some((k) => colMap[k] !== undefined);
    if (hasName && hasData) blocks.push({ r, colMap });
  }
  return blocks;
}

// HS Code "..
function buildHsCodeNoteMap(grid) {
  return findAllGridCells(grid, /HS CODE\s*:/i)
    .map(({ r, c }) => {
      const m = /^(.+?)\s*HS CODE\s*:\s*([\d.]+)/i.exec(gridStrAt(grid, r, c));
      return m
        ? { prefix: m[1].trim().toLowerCase(), hsCode: normalizeHsCode(m[2]) }
        : null;
    })
    .filter(Boolean);
}

function extractItemsFromBlock(grid, block, hsNoteMap) {
  const { r: headerRow, colMap } = block;
  const nameCol =
    colMap.description !== undefined ? colMap.description : colMap.item;
  const items = [];
  let blankStreak = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const rawName = gridStrAt(grid, r, nameCol);
    if (!rawName) {
      blankStreak++;
      if (blankStreak >= 2) break;
      continue;
    }
    blankStreak = 0;
    if (/^TOTAL\b/i.test(rawName) || /^Dimension/i.test(rawName)) break;
    if (/^HS CODE\s*:/i.test(rawName)) continue; // baris catatan, bukan barang
    // Baris referensi PO ("Items of PO DDI20260708") bukan barang.
    if (/^Items?\s+of\s+PO\b/i.test(rawName)) continue;

    const parts = [];
    // PERBAIKAN BUG (requirement A
    if (colMap.description !== undefined) {
      parts.push(gridStrAt(grid, r, colMap.description));
    } else if (colMap.item !== undefined) {
      parts.push(gridStrAt(grid, r, colMap.item));
    }
    if (colMap.specification !== undefined)
      parts.push(gridStrAt(grid, r, colMap.specification));
    if (colMap.brand !== undefined)
      parts.push(gridStrAt(grid, r, colMap.brand));

    let hsCodeVal =
      colMap.hsCode !== undefined ? gridStrAt(grid, r, colMap.hsCode) : "";
    let name = joinNameParts(parts);
    if (!hsCodeVal) {
      const embedded = extractEmbeddedHsCode(name);
      if (embedded.hsCode) {
        hsCodeVal = embedded.hsCode;
        name = embedded.cleaned;
      }
    }
    if (!hsCodeVal && hsNoteMap.length) {
      const lower = name.toLowerCase();
      const hit = hsNoteMap.find((h) => lower.startsWith(h.prefix));
      if (hit) hsCodeVal = hit.hsCode;
    }
    if (!name) continue;

    const qty =
      colMap.qty !== undefined ? gridNumAt(grid, r, colMap.qty) : null;
    let satuan =
      colMap.unit !== undefined ? gridStrAt(grid, r, colMap.unit) : "";
    if (!satuan && colMap.qty !== undefined) {
      const adj = gridStrAt(grid, r, colMap.qty + 1);
      if (adj && UNIT_QTY_RE.test(adj)) satuan = adj;
    }
    const amount =
      colMap.amount !== undefined
        ? gridNumSkippingLabel(grid, r, colMap.amount)
        : null;
    let harga =
      colMap.unitPrice !== undefined
        ? gridNumSkippingLabel(grid, r, colMap.unitPrice)
        : null;
    if (harga == null && amount != null && qty)
      harga = roundNum(amount / qty, 4);

    const netto =
      colMap.netto !== undefined ? gridNumAt(grid, r, colMap.netto) : null;
    const bruto =
      colMap.bruto !== undefined ? gridNumAt(grid, r, colMap.bruto) : null;

    // Kolom CBM (mis
    let packageText = "";
    if (colMap.cbm !== undefined) {
      const dims = parsePackageDims(gridStrAt(grid, r, colMap.cbm));
      if (dims) packageText = `${dims.p}*${dims.l}*${dims.t}`;
    }

    items.push({
      name,
      hsCode: normalizeHsCode(hsCodeVal),
      qty,
      satuan,
      harga,
      netto,
      bruto,
      package: packageText,
    });
  }
  return items;
}

// Field header (Consignee, Invoice No/Date, dst) dicari lewat LABEL-nya SENDIRI-SENDIRI
function findFieldValue(grid, labelRe) {
  const pos = findGridCell(grid, labelRe);
  if (!pos) return { value: "", pos: null };
  return { value: gridStrAt(grid, pos.r + 1, pos.c), pos };
}
// Tanggal Invoice ada di baris yang SAMA dg nomor invoice (r+1 dari label)
function findDateOnSameRow(grid, pos, fromCol, maxSpan = 12) {
  if (!pos) return "";
  for (let c = fromCol; c < fromCol + maxSpan; c++) {
    const iso = excelCellDateToISO(gridCellAt(grid, pos.r + 1, c));
    if (iso) return iso;
  }
  return "";
}

function parseCiplWorkbook(wb) {
  const notes = [];
  const allNames = wb.SheetNames || [];
  let primaryNames = allNames.filter(isPrimaryCiplSheetName);
  if (!primaryNames.length) {
    // Fallback: nama sheet tidak cocok pola yang dikenal
    primaryNames = allNames.filter((n) => !isExcludedSheetName(n));
  }
  const grids = primaryNames.map((n) => ({
    name: n,
    grid: sheetToGrid(wb, n),
  }));

  // Sheet tambahan opsional berisi info yang TIDAK selalu ada di sheet CI/PL utama: MAWB/HAWB (mis
  const extraSheetName = allNames.find((n) =>
    /입고지|receiving|warehouse|shipping\s*instruction|^si$/i.test(n),
  );
  const extraGrid = extraSheetName ? sheetToGrid(wb, extraSheetName) : [];
  const findLabelValueSameRow = (grid, re, colOffset = 1) => {
    const pos = findGridCell(grid, re);
    return pos ? gridStrAt(grid, pos.r, pos.c + colOffset) : "";
  };
  const masterBL = findLabelValueSameRow(extraGrid, /MAWB/i);
  const houseBL = findLabelValueSameRow(extraGrid, /HAWB/i);
  // LCL/FCL: dicari di beberapa kolom ke kanan dari label "Volume"
  const findMuatanNearLabel = (grid, re) => {
    const pos = findGridCell(grid, re);
    if (!pos) return "";
    for (let c = pos.c + 1; c <= pos.c + 3; c++) {
      const v = gridStrAt(grid, pos.r, c);
      if (/^FCL$/i.test(v)) return "FCL";
      if (/^LCL$/i.test(v)) return "LCL";
    }
    return "";
  };
  const muatan = findMuatanNearLabel(extraGrid, /Volume/i);

  // field header: dicoba di tiap sheet utama, dipakai hasil PERTAMA yang ketemu
  let invoiceNo = "",
    invoiceDate = "",
    seller = "",
    consignee = "",
    etd = "",
    destination = "",
    voyage = "",
    origin = "",
    incoterm = "",
    packageText = "";
  for (const { grid } of grids) {
    if (!invoiceNo) {
      const inv = findFieldValue(grid, CIPL_FIELD_LABELS.invoiceNoDate);
      if (inv.value) {
        invoiceNo = inv.value;
        invoiceDate = findDateOnSameRow(grid, inv.pos, inv.pos.c + 1);
      }
    }
    if (!consignee)
      consignee = findFieldValue(grid, CIPL_FIELD_LABELS.consignee).value;
    if (!seller) seller = findFieldValue(grid, CIPL_FIELD_LABELS.seller).value;
    if (!etd) {
      const depPos = findGridCell(grid, CIPL_FIELD_LABELS.departureDate);
      if (depPos)
        etd = excelCellDateToISO(gridCellAt(grid, depPos.r + 1, depPos.c));
      if (!etd) {
        const sail = findGridCell(grid, CIPL_FIELD_LABELS.sailingOnOrAbout);
        if (sail)
          etd = excelCellDateToISO(gridCellAt(grid, sail.r + 1, sail.c));
      }
    }
    if (!destination) {
      destination =
        findFieldValue(grid, CIPL_FIELD_LABELS.finalDestination).value ||
        findFieldValue(grid, CIPL_FIELD_LABELS.portOfDischarge).value;
    }
    if (!origin)
      origin = findFieldValue(grid, CIPL_FIELD_LABELS.portOfLoading).value;
    if (!voyage) {
      // "Carrier" (templat gabungan) atau baris Vessel/Flight (templat lama)
      const voyRaw =
        findFieldValue(grid, /^Carrier\s*$/i).value ||
        findFieldValue(grid, CIPL_FIELD_LABELS.vesselFlight).value;
      // Sel Vessel/Flight yang BELUM diisi sering menyisakan placeholder hasil format cell
      voyage = /^(0|00:00:00|0:00:00|-)$/.test(voyRaw.trim()) ? "" : voyRaw;
    }
    if (!incoterm || !packageText) {
      const totalPos = findGridCell(grid, CIPL_FIELD_LABELS.totalBoxLine);
      if (totalPos) {
        const t = gridStrAt(grid, totalPos.r, totalPos.c);
        if (!incoterm) incoterm = guessIncotermFromText(t);
        if (!packageText) {
          const pkgM = new RegExp(
            `^TOTAL\\s+(.+?)\\s+(?:${INCOTERM_RE.source})\\b`,
            "i",
          ).exec(t);
          packageText = pkgM ? pkgM[1].trim() : "";
        }
      }
      if (!incoterm) {
        const termsVal = findFieldValue(
          grid,
          CIPL_FIELD_LABELS.termsOfDelivery,
        ).value;
        incoterm = guessIncotermFromText(termsVal);
      }
    }
  }
  const transport = guessTransportFromText(origin, destination);

  // barang: semua blok tabel di SEMUA sheet utama digabung jadi 1 daftar sumber
  const itemSources = [];
  let totalBlocksFound = 0;
  for (const { grid } of grids) {
    const hsNoteMap = buildHsCodeNoteMap(grid);
    const blocks = findCiplHeaderBlocks(grid);
    blocks.forEach((b) => {
      totalBlocksFound++;
      itemSources.push(extractItemsFromBlock(grid, b, hsNoteMap));
    });
  }
  const mergedRaw = mergeItemSources(itemSources);

  const items = mergedRaw.map((it) => ({
    ...newItem(),
    namaBarang: it.name,
    hsCode: it.hsCode || "",
    jenisBarang: "Bahan Baku",
    qty: it.qty != null ? it.qty : 0,
    satuan: it.satuan || "",
    harga: it.harga != null ? it.harga : 0,
    netto: it.netto != null ? it.netto : 0,
    bruto: it.bruto != null ? it.bruto : 0,
    package: it.package || "",
  }));

  if (!items.length) {
    notes.push(
      'Tidak ada baris barang yang terbaca dari sheet CI/PL (dicari lewat header kolom "Description"/"Item"/"Goods Descriptions").',
    );
  } else {
    if (items.some((it) => !it.hsCode)) {
      notes.push(
        'Sebagian barang tidak ketemu HS Code-nya (dicoba dari kolom HS Code, teks "Origin HS Code: ..." yang menyatu di deskripsi, dan catatan terpisah) — isi manual kalau kosong.',
      );
    }
    if (items.some((it) => !it.bruto)) {
      notes.push(
        "Berat kotor (bruto) sebagian/semua barang tidak terbaca — isi manual per barang.",
      );
    }
    if (totalBlocksFound <= 1) {
      notes.push(
        "Hanya 1 blok tabel barang yang terbaca (harga ATAU berat, bukan keduanya) — kalau file ini seharusnya punya sheet/bagian PL atau CI satunya lagi, cek lagi apakah sheet itu ada & tidak salah nama.",
      );
    }
  }
  if (!masterBL && !houseBL) {
    notes.push(
      "Master/House AWB tidak ditemukan (biasanya di sheet info gudang/MAWB-HAWB) — isi manual.",
    );
  }
  notes.push(
    'Hasil baca CIPL Excel ini best-effort — mohon cek ulang semua field sebelum simpan, terutama moda transportasi (disimpulkan dari kata "AIRPORT" di asal/tujuan), HS Code, dan berat kotor per barang. Freight/Insurance/NDPBM/BM/PPN/PPH tidak ada di dokumen CIPL — isi manual di tab Kepabeanan.',
  );

  // Bruto: satu angka TOTAL di barang pertama
  applyTotalBrutoToFirstItem(items, null);

  const modeHint = guessCiplModeFromPorts(origin, destination);
  return {
    fields: {
      invoice: invoiceNo,
      docDate: invoiceDate,
      // party dipilih sesuai ARAH pengiriman (import -> seller, export -> consignee)
      party: pickCiplParty(seller, consignee, modeHint || activeMode),
      seller,
      consignee,
      masterBL,
      houseBL,
      origin: portDisplay(origin),
      destination: portDisplay(destination),
      incoterm,
      transport,
      voyage,
      etd,
      package: packageText,
      muatan,
    },
    items,
    notes,
    // Dokumen CIPL sama saja dipakai utk Import & Export, jadi tidak bisa di-hardcode
    modeHint,
    source: "cipl",
  };
}
