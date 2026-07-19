"use strict";

/* ==================================================================
   IMPORT DARI PDF CIPL (Packing List / Commercial Invoice hasil print
   dari templat CI/PL, BUKAN dokumen PIB/CEISA — lihat pdf.js utk PIB).

   Kenapa ini perlu terpisah dari parser Excel CIPL (excel-cipl.js):
   PDF hasil print TIDAK datang dlm bentuk grid baris x kolom — hasil
   ekstraksi PDF.js cuma teks per baris (lihat groupPdfItemsIntoLines
   di pdf.js). Supaya tetap bisa memisahkan kolom (terutama supaya
   teks "Shipping Marks" -- nama consignee/pelabuhan yg dicetak di
   kemasan -- tidak nyampur/"bleed" ke kolom deskripsi barang di baris
   yg sama), dipakai KOORDINAT X mentah dari PDF.js (pagesItems),
   BUKAN cuma teks gabungan -- caranya: sisihkan dulu kolom "Shipping
   Marks" (paling kiri) berdasar posisi x header itu sendiri, susun
   ulang jadi teks per baris HANYA dari kolom Item+Goods Descriptions+
   Qty+Berat/Harga dst. Prinsip yg SAMA seperti extractItemDetailColumn
   di pdf.js utk dokumen PIB.

   Field header (Consignee, Invoice No, dst) di templat ini terbagi 2
   KOLOM (kiri x≈37-39, kanan x≈293-303, konsisten persis di 2 sampel
   nyata PL & CI) -- dipisah dg cara yg sama sebelum dicocokkan ke
   label lewat CIPL_FIELD_LABELS (cipl-common.js), field yg SAMA dg
   yg dipakai excel-cipl.js supaya sinonim label (mis. "Sailing on or
   about" vs "Departure Date") tidak perlu ditulis dua kali.
================================================================== */

function textAt(items) {
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4]);
  let text = "";
  let prevEnd = null;
  sorted.forEach((it) => {
    const x = it.transform[4];
    const fontSize = Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 1;
    const gapThreshold = Math.max(0.5, fontSize * 0.15);
    if (prevEnd !== null && x - prevEnd > gapThreshold) text += " ";
    text += it.str;
    prevEnd = x + (it.width || 0);
  });
  return text.trim();
}

// Menyusun ULANG baris teks dari item PDF.js yang x-nya berada di dalam
// [xMin, xMax) saja (dipakai baik utk memotong kolom "Shipping Marks" DI
// LUAR jangkauan ini, maupun utk memisah 2-kolom field kiri/kanan).
function reconstructLinesInXRange(pagesItems, xMin, xMax, yTolerance = 2.5) {
  const all = [];
  pagesItems.forEach((items) => all.push(...items));
  const filtered = all.filter((it) => it.transform[4] >= xMin && it.transform[4] < xMax);
  const sorted = filtered.sort(
    (a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  );
  const lines = [];
  let current = null;
  let currentY = null;
  sorted.forEach((item) => {
    const y = item.transform[5];
    if (current === null || Math.abs(y - currentY) > yTolerance) {
      current = { y, items: [] };
      lines.push(current);
      currentY = y;
    }
    current.items.push(item);
  });
  return lines.map((l) => ({ y: l.y, text: textAt(l.items) }));
}

function findHeaderItemX(pagesItems, re) {
  for (const items of pagesItems) {
    for (const it of items) {
      if (re.test(it.str)) return it.transform[4];
    }
  }
  return null;
}
function findHeaderItemXWidth(pagesItems, re) {
  for (const items of pagesItems) {
    for (const it of items) {
      if (re.test(it.str)) return { x: it.transform[4], width: it.width || 0 };
    }
  }
  return null;
}

// Batas kolom "Shipping Marks" (kiri) vs sisanya (Item/Goods Descriptions/
// Qty/dst) -- dicari dari posisi header "Shipping Marks" & "Item" sendiri;
// kalau templat lain tidak punya kolom ini sama sekali, tidak ada yg
// disisihkan (aman, drpd salah tebak & malah membuang data).
function findItemTableExcludeThreshold(pagesItems) {
  const marks = findHeaderItemXWidth(pagesItems, /^Shipping\s+Marks$/i);
  const item = findHeaderItemX(pagesItems, /^Item$/i);
  if (!marks || item == null) return 0;
  const marksEnd = marks.x + marks.width;
  if (item <= marksEnd) return 0;
  return (marksEnd + item) / 2;
}

// Batas kolom kiri/kanan field 2-kolom (Consignee | Terms of Payment, dst)
// -- dicari dari baris "Consigner:"/"Invoice No..." yg PASTI ada persis 1x
// di dekat atas dokumen dan PASTI 2 kolom.
function findTwoColumnThreshold(pagesItems) {
  const leftX = findHeaderItemX(pagesItems, /^Consign(er|ee)/i);
  const rightX = findHeaderItemX(pagesItems, /Invoice\s*No\.?\s*(and|&)\s*Date/i);
  if (leftX == null || rightX == null || rightX <= leftX) return 170; // fallback aman
  return (leftX + rightX) / 2;
}

function grab(text, re) {
  const m = re.exec(text);
  return m ? m[1].trim() : "";
}

// Kalau suatu field nilainya KOSONG di dokumen (mis. Vessel/Flight belum
// diisi krn kapal belum ditentukan), pola "label lalu baris berikutnya"
// bisa salah nangkap: baris berikutnya yg ke-baca malah label field LAIN
// (mis. lompat ke "Shipping Marks" krn baris utk Vessel/Flight sendiri
// kosong tidak menghasilkan teks apa pun). Nilai yg polanya sendiri cocok
// dg salah satu label yg dikenal dianggap "sebenarnya kosong", bukan nilai
// asli.
const KNOWN_LABEL_RES = [
  /^Shipping\s+Marks/i,
  /^Item\s*$/i,
  /^Goods\s+Descriptions/i,
  /^Consign(er|ee)/i,
  /^Terms?\s+of\s+Payment/i,
  /^Departure\s*Date/i,
  /^Final\s+Destination/i,
  /^Vessel\s*\/\s*Flight/i,
  /^Port\s+of\s+Loading/i,
  /^Special\s+Item/i,
  /^OBL\s+TYPE/i,
];
function looksLikeAnotherLabel(s) {
  const t = (s || "").trim();
  return KNOWN_LABEL_RES.some((re) => re.test(t));
}
function grabNextLine(text, labelRe) {
  const v = grab(text, labelRe);
  return looksLikeAnotherLabel(v) ? "" : v;
}

function parseCiplPdfCommonFields(fullText, pagesItems) {
  const twoColThreshold = findTwoColumnThreshold(pagesItems);
  const leftLines = reconstructLinesInXRange(pagesItems, 0, twoColThreshold);
  const rightLines = reconstructLinesInXRange(pagesItems, twoColThreshold, 100000);
  const leftText = leftLines.map((l) => l.text).join("\n");
  const rightText = rightLines.map((l) => l.text).join("\n");

  const invoice = grab(rightText, /Invoice\s*No\.?\s*(?:and|&)\s*Date\s*\n\s*(\S+)/i);
  const invDateRaw = grab(
    rightText,
    /Invoice\s*No\.?\s*(?:and|&)\s*Date\s*\n\s*\S+\s+([\d.\/\- A-Za-z,]+)/i,
  );
  const docDate = parseFlexibleDateText(invDateRaw.replace(/\./g, "-"));

  const party = grabNextLine(leftText, /Consignee\s*\n\s*([^\n]+)/i);

  const etdRaw = grabNextLine(leftText, /Departure\s*Date\s*\n\s*([^\n]+)/i);
  const etd = parseFlexibleDateText(etdRaw);

  const destination = grabNextLine(rightText, /Final\s+Destination\s*\n\s*([^\n]+)/i);
  const originFromPortLoading = grabNextLine(
    rightText,
    /Port\s+of\s+Loading\s*\n\s*([^\n]+)/i,
  );
  const voyage = grabNextLine(leftText, /Vessel\s*\/\s*Flight\s*\n\s*([^\n]+)/i);

  // Baris "Total N Boxes ... FOB <pelabuhan> ... nilai" melebar di 2
  // kolom (teks kiri "Total N Boxes ..." nyambung dg kanan "FOB ... nilai
  // ...") -- kalau dicari dari leftText/rightText yg SUDAH terpisah,
  // baris ini ikut terpotong jadi 2 & incoterm-nya lolos tidak kebaca.
  // Makanya di sini SENGAJA pakai `fullText` (utuh, satu baris per Y,
  // TANPA batas kolom) supaya "FOB ..." yg ada di sisi kanan tetap
  // nyambung ke "Total ..." di sisi kiri.
  const totalLine = fullText
    .split("\n")
    .find((l) => /^Total\s+\d+\s+Box/i.test(l.trim()));
  let incoterm = "";
  let packageText = "";
  if (totalLine) {
    incoterm = guessIncotermFromText(totalLine);
    const pkgM = new RegExp(
      `^Total\\s+(.+?)\\s+(?:${INCOTERM_RE.source})\\b`,
      "i",
    ).exec(totalLine.trim());
    packageText = pkgM ? pkgM[1].trim() : "";
    if (!packageText) {
      // Baris Total tanpa incoterm (mis. dokumen Packing List): berhenti
      // sebelum angka berat/volume (mis. "0.22 CBM 244.5 KG..."), bukan
      // ambil semua sisa baris.
      const pkgOnly = /^Total\s+(.+?)\s+[\d.,]+\s*(?:CBM|KGS?|M3)\b/i.exec(
        totalLine.trim(),
      );
      packageText = pkgOnly
        ? pkgOnly[1].trim()
        : (/^Total\s+(.+)$/i.exec(totalLine.trim()) || [, ""])[1].trim();
    }
  }

  const transport = guessTransportFromText(originFromPortLoading, destination);


  return {
    invoice,
    docDate,
    party,
    etd,
    destination,
    origin: originFromPortLoading,
    voyage,
    incoterm,
    package: packageText,
    transport,
  };
}

// Baris barang PL: "<nama> <qty> <satuan> <netto> KG <bruto> KGS" (satuan
// umum: Box/Boxes/PCS/SET/Pallet/Carton/dst). "01 Bead Ring" (baris
// nomor+kategori TANPA angka berat) dipakai sbg prefix kategori kalau
// muncul SEBELUM baris barang pertama yg beratnya kebaca.
function parseItemsPlStyle(itemLines) {
  const suffixRe =
    /^(.*?)\s+([\d,]+\.?\d*)\s+(PCS?|SET|UNITS?|BOX(?:ES)?|PACK(?:AGES?)?|PALLETS?|PLT|CARTONS?|CTN|BAGS?|DRUMS?|ROLLS?)\s+([\d,]+\.?\d*)\s*KGS?\b\s+([\d,]+\.?\d*)\s*KGS?\s*$/i;
  const items = [];
  let categoryPrefix = "";
  itemLines.forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const m = suffixRe.exec(t);
    if (!m) {
      // baris tanpa angka berat: kemungkinan "01 Bead Ring" (nomor+
      // kategori) -- ambil bagian sesudah nomor itemnya sbg prefix
      const catM = /^\d{1,3}\s+(.+)$/.exec(t);
      if (catM && !categoryPrefix) categoryPrefix = catM[1].trim();
      return;
    }
    let name = m[1].trim();
    name = name.replace(/^\d{1,3}\s+/, ""); // buang nomor item kalau nempel
    if (categoryPrefix && !name.toLowerCase().includes(categoryPrefix.toLowerCase())) {
      name = categoryPrefix + " - " + name;
    }
    items.push({
      name,
      qty: Number(m[2].replace(/,/g, "")) || 0,
      satuan: m[3],
      netto: Number(m[4].replace(/,/g, "")) || 0,
      bruto: Number(m[5].replace(/,/g, "")) || 0,
    });
  });
  return items;
}

// Baris barang CI: "<kategori> <qty> <harga> <amount>" lalu nama model yg
// lebih spesifik SERING lanjut di baris BERIKUTNYA tanpa angka apa pun
// (lihat catatan desain di atas) -- digabung sbg 1 nama kalau begitu.
// Satuan qty (SET/PCS/dst) di templat ini ditulis SEKALI sbg sub-header
// tabel (mis. baris "SET USD USD" persis di bawah header Quantity/Unit
// Price/Amount), BUKAN per baris barang -- dicari terpisah & dipakai utk
// SEMUA barang.
function parseItemsCiStyle(itemLines) {
  const suffixRe = /^(.*?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/;
  const subHeaderM = itemLines
    .map((l) => /^(PCS?|SET|UNITS?|BOX(?:ES)?|PACK(?:AGES?)?)\s+[A-Z]{3}\s+[A-Z]{3}\s*$/i.exec(
      l.trim(),
    ))
    .find(Boolean);
  const sharedSatuan = subHeaderM ? subHeaderM[1].toUpperCase() : "";

  const items = [];
  for (let i = 0; i < itemLines.length; i++) {
    const t = itemLines[i].trim();
    if (!t) continue;
    const m = suffixRe.exec(t);
    if (!m) continue;
    let name = m[1].trim().replace(/^\d{1,3}\s+/, "");
    const qty = Number(m[2].replace(/,/g, "")) || 0;
    const harga = Number(m[3].replace(/,/g, "")) || 0;
    const amount = Number(m[4].replace(/,/g, "")) || 0;
    const next = (itemLines[i + 1] || "").trim();
    if (next && !suffixRe.test(next) && !/^\d{1,3}\s/.test(next)) {
      name = name + " " + next;
      i++; // baris lanjutan sudah dipakai, jangan diproses lagi sbg baris sendiri
    }
    items.push({
      name: name.trim(),
      qty,
      satuan: sharedSatuan,
      harga,
      amount: amount || null,
    });
  }
  return items;
}

function extractItemTableLines(pagesItems) {
  const excludeThreshold = findItemTableExcludeThreshold(pagesItems);
  const lines = reconstructLinesInXRange(
    pagesItems,
    excludeThreshold,
    100000,
  );
  const headerIdx = lines.findIndex((l) =>
    /Goods\s+Descriptions|^Item\s/i.test(l.text),
  );
  const totalIdx = lines.findIndex((l) => /^Total\s+\d+\s+Box/i.test(l.text.trim()));
  if (headerIdx === -1) return [];
  const end = totalIdx === -1 ? lines.length : totalIdx;
  return lines.slice(headerIdx + 1, end).map((l) => l.text);
}

function detectCiplPdfKind(text) {
  const head = text.slice(0, 400);
  if (/^\s*PACKING\s+LIST\b/im.test(head)) return "pl";
  if (/^\s*COMMERCIAL\s+INVOICE\b/im.test(head)) return "ci";
  return null;
}

// Dipanggil dari import/dispatch.js. `text`/`pagesItems` datang dari
// extractPdfText (pdf.js) -- fungsi ini TIDAK memuat ulang PDF-nya sendiri.
function parseCiplPdfText(text, pagesItems) {
  const kind = detectCiplPdfKind(text);
  const notes = [];
  const fields = parseCiplPdfCommonFields(text, pagesItems);
  const itemLines = extractItemTableLines(pagesItems);
  const rawItems =
    kind === "ci" ? parseItemsCiStyle(itemLines) : parseItemsPlStyle(itemLines);

  if (!rawItems.length) {
    notes.push(
      "Tidak ada baris barang yang terbaca dari tabel Goods Descriptions.",
    );
  }
  if (kind === "ci") {
    notes.push(
      "PDF ini Commercial Invoice: harga & qty terbaca, TAPI berat netto/bruto TIDAK ada di dokumen ini — kalau ada file Packing List (PL) pasangannya, pilih keduanya sekaligus supaya berat ikut terisi otomatis.",
    );
  } else if (kind === "pl") {
    notes.push(
      "PDF ini Packing List: berat netto/bruto & qty terbaca, TAPI harga TIDAK ada di dokumen ini — kalau ada file Commercial Invoice (CI) pasangannya, pilih keduanya sekaligus supaya harga ikut terisi otomatis.",
    );
  }
  notes.push(
    "Hasil baca PDF CIPL ini best-effort (posisi teks di PDF tidak selalu berurutan) — mohon cek ulang semua field sebelum simpan, terutama moda transportasi, HS Code (dokumen ini biasanya tidak mencantumkan HS Code sama sekali), dan nama barang.",
  );

  return {
    fields: {
      invoice: fields.invoice,
      docDate: fields.docDate,
      party: fields.party,
      origin: fields.origin,
      destination: fields.destination,
      incoterm: fields.incoterm,
      transport: fields.transport,
      voyage: fields.voyage,
      etd: fields.etd,
      package: fields.package,
    },
    rawItems,
    itemsKind: kind,
    notes,
    modeHint: "import",
    source: kind === "ci" ? "cipl-pdf-ci" : "cipl-pdf-pl",
  };
}
