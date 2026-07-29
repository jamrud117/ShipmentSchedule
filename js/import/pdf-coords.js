"use strict";

/* UTILITAS KOORDINAT PDF (dipakai bersama oleh pdf-peb.js & pdf-cipl.js) */

// Gabung potongan teks 1 baris jadi string
function pdfTextFromItems(items) {
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4]);
  let text = "";
  let prevEnd = null;
  sorted.forEach((it) => {
    const x = it.transform[4];
    const fontSize =
      Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 1;
    const gapThreshold = Math.max(0.5, fontSize * 0.15);
    if (prevEnd !== null && x - prevEnd > gapThreshold) text += " ";
    text += it.str;
    prevEnd = x + (it.width || 0);
  });
  return text.trim();
}

// Potongan teks -> baris (atas ke bawah)
function pdfLines(items, yTolerance) {
  const tol = yTolerance == null ? 2.5 : yTolerance;
  const sorted = [...items].sort(
    (a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  );
  const lines = [];
  let current = null;
  let currentY = null;
  sorted.forEach((item) => {
    const y = item.transform[5];
    if (current === null || Math.abs(y - currentY) > tol) {
      current = { y, items: [] };
      lines.push(current);
      currentY = y;
    }
    current.items.push(item);
  });
  return lines.map((l) => ({
    y: l.y,
    text: pdfTextFromItems(l.items),
    items: l.items,
  }));
}

// Baris teks yang HANYA menyertakan potongan dengan x di [xMin, xMax)
function pdfLinesInBox(items, xMin, xMax, yRange, yTolerance) {
  const filtered = items.filter((it) => {
    const x = it.transform[4];
    const y = it.transform[5];
    if (x < xMin || x >= xMax) return false;
    if (yRange && (y > yRange.yTop || y <= yRange.yBottom)) return false;
    return true;
  });
  return pdfLines(filtered, yTolerance);
}

// Cari 1 potongan teks yang cocok regex, kembalikan posisi & halamannya
function pdfFindItem(pagesItems, re) {
  for (let p = 0; p < pagesItems.length; p++) {
    const items = pagesItems[p] || [];
    for (const it of items) {
      if (re.test(it.str)) {
        return {
          page: p,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width || 0,
          str: it.str,
        };
      }
    }
  }
  return null;
}

// Cari header kolom di HALAMAN TERTENTU
function pdfFindItemOnPage(items, re) {
  for (const it of items || []) {
    if (re.test(it.str)) {
      return { x: it.transform[4], y: it.transform[5], width: it.width || 0 };
    }
  }
  return null;
}

// Susun batas kolom dari daftar regex header yang BERURUTAN kiri->kanan
function pdfColumnBounds(items, headerDefs) {
  const found = headerDefs
    .map((def) => {
      const hit = pdfFindItemOnPage(items, def.re);
      return hit ? { key: def.key, x: hit.x } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);
  const bounds = {};
  found.forEach((f, i) => {
    // -2 pt toleransi: isi kolom kadang mulai sedikit di kiri header-nya
    bounds[f.key] = {
      xMin: f.x - 2,
      xMax: i + 1 < found.length ? found[i + 1].x - 2 : 100000,
    };
  });
  return bounds;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    pdfTextFromItems,
    pdfLines,
    pdfLinesInBox,
    pdfFindItem,
    pdfFindItemOnPage,
    pdfColumnBounds,
  };
}
