"use strict";

/* ==================================================================
   IMPORT DARI EXCEL CIPL (Commercial Invoice + Packing List)
   Beda dari format Excel BC di atas (yang memang format export/import
   bawaan aplikasi ini sendiri) — CIPL adalah dokumen niaga yang dibuat
   SUPPLIER, jadi bentuknya BEBAS tergantung supplier masing-masing.
   Sudah ketemu (dan didukung) sekurangnya 3 varian nyata:
     1) Sheet "CI" + "PL" terpisah, header kolom "Description" /
        "Specification", label "Invoice No. & Date" / "Consignee/Buyer".
     2) Satu sheet gabungan ("CI,PL"/"CI PL"/dst) berisi BEBERAPA barang,
        header kolom "Item" + "Description" + "Brand" + "Origin HS CODE"
        sendiri-sendiri, blok INVOICE lalu blok PACKING LIST bersusun di
        sheet yang sama.
     3) Gaya "Goods Descriptions" (dipakai juga oleh versi PDF-nya, lihat
        pdf-cipl.js) — kalau suatu saat ada juga versi Excel-nya.
   Field & baris barang TIDAK dicari lewat offset kolom tetap (gampang
   salah kalau template beda), tapi lewat KLASIFIKASI LABEL per kolom
   (lihat CIPL_COLUMN_LABELS di cipl-common.js) supaya tahan terhadap
   variasi tata letak. Kolom Freight/Insurance/NDPBM/BM/PPN/PPH memang
   tidak ada di CIPL (itu urusan tahap kepabeanan, bukan niaga) —
   sengaja dibiarkan kosong, isi manual.
================================================================== */

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
// Lebih toleran dari sekadar Number(): kalau ada satuan nempel di cell yang
// sama ("2000 KG", "1,868.00 USD") tetap diambil angka di depannya, bukan
// langsung NaN — templat yang tidak menaruh angka & satuan di kolom
// terpisah (jarang, tapi lebih aman ditangani drpd bikin barang itu
// keliatan "kosong" datanya).
function gridNumAt(grid, r, c) {
  const v = gridCellAt(grid, r, c);
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = /^\s*(-?[\d,]+\.?\d*)/.exec(String(v));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
// Nilai numerik yang boleh "lompat 1 kolom" kalau kolom yang diminta
// ternyata isinya label mata uang/satuan (mis. header "Unit Price"/
// "Amount" di beberapa templat diikuti sub-kolom "USD" duluan, baru
// angkanya di kolom sesudahnya).
function gridNumSkippingLabel(grid, r, c) {
  const raw = gridStrAt(grid, r, c);
  if (raw && (CURRENCY_TOKEN_RE.test(raw) || UNIT_QTY_RE.test(raw))) {
    return gridNumAt(grid, r, c + 1);
  }
  return gridNumAt(grid, r, c);
}

/* ---- klasifikasi baris header tabel barang -----------------------
   Satu grid (sheet) bisa punya LEBIH dari 1 blok tabel barang (mis.
   sheet gabungan CI,PL: blok INVOICE lalu blok PACKING LIST bersusun
   di bawahnya) — semua kemunculan header dicari, bukan cuma yang
   pertama. */
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

// HS Code "... HS CODE : 8480.30.0000" ditulis sbg CATATAN TERPISAH di
// beberapa sel lain (bukan kolom di tabel barang) yang awalannya cocok dg
// awalan nama barang — dipakai sbg fallback TERAKHIR kalau kolom HS Code
// khusus tidak ada DAN tidak ada juga yang ke-embed di teks nama.
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

    const parts = [];
    if (colMap.item !== undefined) parts.push(gridStrAt(grid, r, colMap.item));
    if (colMap.description !== undefined)
      parts.push(gridStrAt(grid, r, colMap.description));
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

    items.push({
      name,
      hsCode: normalizeHsCode(hsCodeVal),
      qty,
      satuan,
      harga,
      netto,
      bruto,
    });
  }
  return items;
}

// Field header (Consignee, Invoice No/Date, dst) dicari lewat LABEL-nya
// SENDIRI-SENDIRI (bukan offset relatif dari 1 label acuan) karena jarak
// antar-kolom beda-beda antar templat — polanya konsisten: nilainya ada
// TEPAT 1 baris di bawah label, kolom yang sama (dicek nyata di 2 templat
// Excel yang beda jauh strukturnya, keduanya konsisten begini).
function findFieldValue(grid, labelRe) {
  const pos = findGridCell(grid, labelRe);
  if (!pos) return { value: "", pos: null };
  return { value: gridStrAt(grid, pos.r + 1, pos.c), pos };
}
// Tanggal Invoice ada di baris yang SAMA dg nomor invoice (r+1 dari
// label), tapi kolomnya beda-beda jauh antar templat -- disisir beberapa
// kolom ke kanan dari nilai nomor invoice, ambil sel PERTAMA yang
// berhasil di-parse sbg tanggal, drpd nebak 1 offset tetap.
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
    // Fallback: nama sheet tidak cocok pola yang dikenal -- coba SEMUA
    // sheet KECUALI yang jelas lampiran/detail, drpd langsung menyerah.
    primaryNames = allNames.filter((n) => !isExcludedSheetName(n));
  }
  const grids = primaryNames.map((n) => ({
    name: n,
    grid: sheetToGrid(wb, n),
  }));

  // Sheet tambahan opsional (mis. nama Korea "입고지" di templat supplier
  // tertentu) berisi MAWB/HAWB — dicek kalau ADA, dilewati kalau tidak.
  const extraSheetName = allNames.find((n) =>
    /입고지|receiving|warehouse/i.test(n),
  );
  const extraGrid = extraSheetName ? sheetToGrid(wb, extraSheetName) : [];
  const findLabelValueSameRow = (grid, re, colOffset = 1) => {
    const pos = findGridCell(grid, re);
    return pos ? gridStrAt(grid, pos.r, pos.c + colOffset) : "";
  };
  const masterBL = findLabelValueSameRow(extraGrid, /MAWB/i);
  const houseBL = findLabelValueSameRow(extraGrid, /HAWB/i);

  // ---- field header: dicoba di tiap sheet utama, dipakai hasil
  // PERTAMA yang ketemu (biasanya semua sheet CI/PL punya salinan header
  // yang sama, jadi cukup ambil dari yang mana saja ketemu duluan).
  let invoiceNo = "",
    invoiceDate = "",
    party = "",
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
    if (!party) party = findFieldValue(grid, CIPL_FIELD_LABELS.consignee).value;
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
      // "Carrier" (templat gabungan) atau baris Vessel/Flight (templat
      // lama) -- dua-duanya berarti nama kapal/pengangkut.
      voyage =
        findFieldValue(grid, /^Carrier\s*$/i).value ||
        findFieldValue(grid, CIPL_FIELD_LABELS.vesselFlight).value;
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

  // ---- barang: semua blok tabel di SEMUA sheet utama digabung jadi 1
  // daftar sumber, lalu dicocokkan lewat nama (lihat mergeItemSources di
  // cipl-common.js) — otomatis menangani baik "CI/PL sheet terpisah"
  // MAUPUN "1 sheet gabungan dg 2 blok header" tanpa logika berbeda.
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

  return {
    fields: {
      invoice: invoiceNo,
      docDate: invoiceDate,
      party,
      masterBL,
      houseBL,
      origin,
      destination,
      incoterm,
      transport,
      voyage,
      etd,
      package: packageText,
    },
    items,
    notes,
    modeHint: "import",
    source: "cipl",
  };
}
