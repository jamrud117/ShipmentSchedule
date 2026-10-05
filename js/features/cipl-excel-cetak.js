"use strict";

/* ==================================================================
   EXCEL CIPL = SALINAN LEMBAR CETAK (Dynamic Design: CI, PL, SI)

   Excel TIDAK disusun sendiri -- ia diukur dari lembar cetaknya.
   Halaman cetak (ciplHalamanInvoice / Packing / ShippingInstruction,
   dengan ciplCss) digambar di bingkai tersembunyi, lalu tiap kotak
   berwarna, garis, tulisan, dan gambar diukur posisinya. Semua tepinya
   menjadi garis kisi kolom & baris Excel; tiap tulisan ditaruh di
   rentang sel yang sama dengan kotaknya di kertas -- huruf, ukuran,
   tebal, warna, dan ratanya sama. Satu tata letak, dua keluaran: kalau
   cetakannya berubah, Excel-nya ikut, tanpa disusun ulang.

   Angka (harga, jumlah, berat) ditulis sebagai ANGKA berformat lewat
   atribut data-n / data-f pada sel cetaknya: tampil sama ("USD 5,800",
   "170 KG") dan tetap bisa dihitung di Excel.
================================================================== */

/* "rgb(31, 42, 68)" -> "FF1F2A44"; transparan -> null */
function cxcWarna(css) {
  const m = String(css || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  if (m[4] != null && Number(m[4]) < 0.05) return null;
  return "FF" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/* Tebal garis CSS -> gaya garis Excel */
function cxcGaris(lebarPx, gayaCss) {
  if (!(lebarPx > 0) || gayaCss === "none" || gayaCss === "hidden") return null;
  if (gayaCss === "dashed") return "dashed";
  if (gayaCss === "dotted") return "dotted";
  if (lebarPx < 1.25) return "thin";
  if (lebarPx < 2.75) return "medium";
  return "thick";
}

/* Titik-titik tepi -> garis kisi: diurutkan, yang berdekatan disatukan */
function cxcKisi(nilai, toleransi) {
  const urut = nilai.filter((x) => isFinite(x)).sort((a, b) => a - b);
  const out = [];
  urut.forEach((v) => {
    if (!out.length || v - out[out.length - 1] > toleransi) out.push(v);
  });
  return out;
}

/* Indeks garis kisi terdekat */
function cxcIndeks(kisi, v) {
  let lo = 0;
  let hi = kisi.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kisi[mid] <= v) lo = mid;
    else hi = mid;
  }
  return Math.abs(kisi[lo] - v) <= Math.abs(kisi[hi] - v) ? lo : hi;
}

/* 0 -> A, 25 -> Z, 26 -> AA */
function cxcKolom(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cxcHuruf(teks, transform) {
  if (transform === "uppercase") return teks.toUpperCase();
  if (transform === "lowercase") return teks.toLowerCase();
  return teks;
}

/* Elemen yang punya tulisan langsung (bukan lewat anak blok). */
function cxcPunyaTeks(el) {
  return [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
}

/* Tulisan sebuah elemen, per BARIS seperti tergambar di kertas: tiap kata
   diukur, kata yang turun ke baris berikutnya memulai baris baru. Kata
   dengan huruf berbeda (tebal di dalam teks biasa) menjadi rich text. */
function cxcTeks(el, win, rel) {
  const doc = el.ownerDocument;
  const kata = [];
  const jalan = doc.createTreeWalker(el, 5); // SHOW_ELEMENT | SHOW_TEXT
  let paksaBaru = false;
  for (let n = jalan.nextNode(); n; n = jalan.nextNode()) {
    if (n.nodeType === 1) {
      if (n.tagName === "BR") paksaBaru = true;
      continue;
    }
    const induk = n.parentElement;
    const cs = win.getComputedStyle(induk);
    const isi = n.nodeValue;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(isi))) {
      const r = doc.createRange();
      r.setStart(n, m.index);
      r.setEnd(n, m.index + m[0].length);
      const k = r.getBoundingClientRect();
      if (!k.width && !k.height) continue;
      kata.push({
        teks: cxcHuruf(m[0], cs.textTransform),
        kotak: rel(k),
        baru: paksaBaru,
        font: {
          name: String(cs.fontFamily).split(",")[0].replace(/["']/g, "").trim(),
          size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
          bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === "bold",
          italic: cs.fontStyle === "italic",
          underline: /underline/.test(cs.textDecorationLine || cs.textDecoration || ""),
          color: { argb: cxcWarna(cs.color) || "FF000000" },
        },
      });
      paksaBaru = false;
    }
  }
  if (!kata.length) return null;
  // Kelompokkan per baris
  const baris = [];
  kata.forEach((k) => {
    const akhir = baris[baris.length - 1];
    const tinggi = k.kotak.y2 - k.kotak.y1;
    if (!akhir || k.baru || k.kotak.y1 > akhir.y1 + tinggi * 0.5) baris.push({ y1: k.kotak.y1, kata: [k] });
    else akhir.kata.push(k);
  });
  const cs = win.getComputedStyle(el);
  const r = rel(el.getBoundingClientRect());
  const isi = {
    x1: r.x1 + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
    x2: r.x2 - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight),
    y1: Math.min(...kata.map((k) => k.kotak.y1)),
    y2: Math.max(...kata.map((k) => k.kotak.y2)),
  };
  const rata = /center/.test(cs.textAlign) ? "center" : /right|end/.test(cs.textAlign) ? "right" : "left";
  return Object.assign(isi, {
    baris: baris.map((b) => b.kata),
    rata,
    n: el.dataset && el.dataset.n != null && el.dataset.n !== "" ? Number(el.dataset.n) : null,
    f: (el.dataset && el.dataset.f) || null,
  });
}

/* Ukur satu halaman: kotak berwarna, garis, tulisan, gambar -- semua
   relatif terhadap bidang isi (di dalam padding halaman). */
function cxcUkurHalaman(halaman) {
  const win = halaman.ownerDocument.defaultView;
  const cs = win.getComputedStyle(halaman);
  const kotak = halaman.getBoundingClientRect();
  const pad = {
    l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight),
    t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom),
  };
  const x0 = kotak.left + pad.l;
  const y0 = kotak.top + pad.t;
  const rel = (k) => ({ x1: k.left - x0, y1: k.top - y0, x2: k.right - x0, y2: k.bottom - y0 });
  const hasil = { W: kotak.width - pad.l - pad.r, H: kotak.height - pad.t - pad.b, pad, latar: [], garis: [], teks: [], gambar: [] };
  const semua = [...halaman.querySelectorAll("*")];
  const wadahTeks = new Set(semua.filter(cxcPunyaTeks));
  semua.forEach((el) => {
    const s = win.getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return;
    const r = rel(el.getBoundingClientRect());
    if (r.x2 - r.x1 < 0.5 || r.y2 - r.y1 < 0.5) return;
    const bg = cxcWarna(s.backgroundColor);
    if (bg && bg !== "FFFFFFFF") hasil.latar.push({ r, warna: bg });
    ["Top", "Right", "Bottom", "Left"].forEach((sisi) => {
      const gaya = cxcGaris(parseFloat(s[`border${sisi}Width`]), s[`border${sisi}Style`]);
      if (gaya) hasil.garis.push({ r, sisi: sisi.toLowerCase(), gaya, warna: cxcWarna(s[`border${sisi}Color`]) || "FF000000" });
    });
    if (el.tagName === "IMG") hasil.gambar.push({ r, src: el.getAttribute("src") || "" });
    // Tulisan: hanya wadah terluar (anak inline-nya ikut sebagai rich text)
    if (wadahTeks.has(el)) {
      let a = el.parentElement;
      while (a && a !== halaman && !wadahTeks.has(a)) a = a.parentElement;
      if (a && a !== halaman && wadahTeks.has(a)) return;
      const t = cxcTeks(el, win, rel);
      if (t) hasil.teks.push(t);
    }
  });
  return hasil;
}

/* Hasil ukur -> satu lembar Excel yang sama persis */
function cxcTulisLembar(wb, nama, ukur) {
  const ws = wb.addWorksheet(nama, { views: [{ showGridLines: false }] });
  const tepiX = [0, ukur.W];
  const tepiY = [0, ukur.H];
  const tambah = (r) => {
    tepiX.push(Math.max(0, Math.min(ukur.W, r.x1)), Math.max(0, Math.min(ukur.W, r.x2)));
    tepiY.push(Math.max(0, Math.min(ukur.H, r.y1)), Math.max(0, Math.min(ukur.H, r.y2)));
  };
  ukur.latar.forEach((x) => tambah(x.r));
  ukur.garis.forEach((x) => tambah(x.r));
  ukur.gambar.forEach((x) => tambah(x.r));
  /* Sel spreadsheet punya jarak dalam ~2.5 px di kiri & kanan: tulisan
     rata kiri digeser sebanyak itu ke kiri (rata kanan ke kanan) supaya
     jatuh di posisi yang sama dengan cetakannya. */
  ukur.teks.forEach((t) => {
    if (t.rata === "left") t.x1 -= 2.5;
    if (t.rata === "right") t.x2 += 2.5;
    tambah(t);
  });
  /* Garis kisi yang berdekatan disatukan: baris/kolom yang terlalu tipis
     dibesarkan sendiri oleh sebagian aplikasi (tinggi minimum), dan
     itu menggeser semua isi di bawahnya. 4 px (~1 mm) tidak terlihat. */
  const kx = cxcKisi(tepiX, 3);
  const ky = cxcKisi(tepiY, 4);
  const nKol = kx.length - 1;
  const nBar = ky.length - 1;
  for (let i = 0; i < nKol; i++) ws.getColumn(i + 1).width = Math.round(((kx[i + 1] - kx[i]) / XLS_LEBAR_HURUF_PX) * 1000) / 1000;
  /* Tinggi baris dibulatkan ke kelipatan 0,75 pt (1 piksel layar) --
     banyak aplikasi menggambar baris per piksel. Pembulatannya pada posisi
     KUMULATIF (bukan per baris), jadi tiap tepi tetap di tempat yang sama
     dengan cetakannya (selisih paling banyak 0,375 pt) dan tidak ada
     galat yang menumpuk ke bawah halaman. */
  /* Jumlahnya tidak boleh melebihi bidang cetak walau sehelai: skala
     "pas satu halaman" dihitung dalam persen BULAT ke bawah, jadi lebih
     0,1 pt saja sudah membuat seluruh isi tercetak 99%. */
  const batas = Math.floor((ukur.H * 0.75 - 0.2) / 0.75) * 0.75;
  let sebelum = 0;
  for (let j = 0; j < nBar; j++) {
    const kum = Math.min(batas, Math.round((ky[j + 1] * 0.75) / 0.75) * 0.75);
    ws.getRow(j + 1).height = Math.max(0.75, Math.round((kum - sebelum) * 100) / 100);
    sebelum = Math.max(kum, sebelum + 0.75);
  }
  const sel = (c, r) => ws.getCell(cxcKolom(c) + (r + 1));
  const rentang = (r) => {
    const c1 = cxcIndeks(kx, r.x1);
    const c2 = Math.max(c1 + 1, cxcIndeks(kx, r.x2));
    const r1 = cxcIndeks(ky, r.y1);
    const r2 = Math.max(r1 + 1, cxcIndeks(ky, r.y2));
    return { c1, c2: Math.min(c2, nKol), r1, r2: Math.min(r2, nBar) };
  };

  // 1. Warna latar -- yang besar dulu, yang kecil menimpanya
  ukur.latar
    .slice()
    .sort((a, b) => (b.r.x2 - b.r.x1) * (b.r.y2 - b.r.y1) - (a.r.x2 - a.r.x1) * (a.r.y2 - a.r.y1))
    .forEach(({ r, warna }) => {
      const g = rentang(r);
      for (let c = g.c1; c < g.c2; c++)
        for (let j = g.r1; j < g.r2; j++) sel(c, j).fill = { type: "pattern", pattern: "solid", fgColor: { argb: warna } };
    });
  // 2. Garis
  const pasang = (c, j, sisi, nilai) => {
    const x = sel(c, j);
    x.border = Object.assign({}, x.border || {}, { [sisi]: nilai });
  };
  ukur.garis.forEach(({ r, sisi, gaya, warna }) => {
    const g = rentang(r);
    const nilai = { style: gaya, color: { argb: warna } };
    if (sisi === "top") for (let c = g.c1; c < g.c2; c++) pasang(c, g.r1, "top", nilai);
    if (sisi === "bottom") for (let c = g.c1; c < g.c2; c++) pasang(c, g.r2 - 1, "bottom", nilai);
    if (sisi === "left") for (let j = g.r1; j < g.r2; j++) pasang(g.c1, j, "left", nilai);
    if (sisi === "right") for (let j = g.r1; j < g.r2; j++) pasang(g.c2 - 1, j, "right", nilai);
  });
  // 3. Tulisan di rentang selnya sendiri
  const terpakai = new Set();
  ukur.teks.forEach((t) => {
    const g = rentang(t);
    let bebas = true;
    for (let c = g.c1; c < g.c2 && bebas; c++)
      for (let j = g.r1; j < g.r2; j++) if (terpakai.has(c + ":" + j)) { bebas = false; break; }
    if (bebas && (g.c2 - g.c1 > 1 || g.r2 - g.r1 > 1)) {
      ws.mergeCells(`${cxcKolom(g.c1)}${g.r1 + 1}:${cxcKolom(g.c2 - 1)}${g.r2}`);
      for (let c = g.c1; c < g.c2; c++) for (let j = g.r1; j < g.r2; j++) terpakai.add(c + ":" + j);
    }
    const x = sel(g.c1, g.r1);
    const fontPertama = t.baris[0][0].font;
    const seragam = t.baris.every((b) => b.every((k) => JSON.stringify(k.font) === JSON.stringify(fontPertama)));
    if (t.n != null && isFinite(t.n)) {
      x.value = t.n;
      if (t.f) x.numFmt = t.f;
    } else if (seragam) {
      x.value = t.baris.map((b) => b.map((k) => k.teks).join(" ")).join("\n");
    } else {
      const runs = [];
      t.baris.forEach((b, i) => b.forEach((k, j) => runs.push({ text: (i && !j ? "\n" : j ? " " : "") + k.teks, font: k.font })));
      x.value = { richText: runs };
    }
    x.font = fontPertama;
    x.alignment = { horizontal: t.rata, vertical: "middle", wrapText: t.baris.length > 1 };
  });
  // 4. Gambar (logo surat)
  ukur.gambar.forEach(({ r, src }) => {
    const m = String(src).match(/^data:image\/(png|jpe?g|gif);base64,/i);
    if (!m) return;
    const id = wb.addImage({ base64: src, extension: m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase() });
    const c = cxcIndeks(kx, r.x1);
    const j = cxcIndeks(ky, r.y1);
    ws.addImage(id, { tl: { col: c, row: j }, ext: { width: r.x2 - r.x1, height: r.y2 - r.y1 } });
  });
  // 5. Halaman: A4, margin = padding halaman cetak, pas satu halaman
  const inci = (px) => Math.round(((px * 25.4) / 96 / 25.4) * 10000) / 10000;
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: ukur.H <= (297 / 25.4) * 96 - ukur.pad.t - ukur.pad.b + 2 ? 1 : 0,
    horizontalCentered: true,
    margins: { left: inci(ukur.pad.l), right: inci(ukur.pad.r), top: inci(ukur.pad.t), bottom: inci(ukur.pad.b), header: 0, footer: 0 },
    printArea: `A1:${cxcKolom(nKol - 1)}${nBar}`,
  };
  return ws;
}

/* Gambar halaman cetak di bingkai tersembunyi (lebar A4), tunggu huruf &
   gambar siap, lalu ukur. */
async function cxcUkurDokumen(html, css) {
  const bingkai = document.createElement("iframe");
  bingkai.setAttribute("aria-hidden", "true");
  bingkai.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden;";
  document.body.appendChild(bingkai);
  try {
    const doc = bingkai.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
    doc.close();
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
    await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; }))));
    await new Promise((ok) => setTimeout(ok, 30));
    return [...doc.querySelectorAll(".dd-halaman, .si-sheet")].map(cxcUkurHalaman);
  } finally {
    bingkai.remove();
  }
}

/* CI, PL, SI Dynamic Design -> workbook yang sama persis dengan cetakannya */
async function ciplXlsDariCetak(wb, row, shipment, baris) {
  const html = ciplHalamanInvoice(row, shipment, baris) + ciplHalamanPacking(row, shipment, baris) +
    ciplHalamanShippingInstruction(row, shipment, baris);
  const halaman = await cxcUkurDokumen(html, ciplCss());
  ["CI", "PL", "SI"].forEach((nama, i) => {
    if (halaman[i]) cxcTulisLembar(wb, nama, halaman[i]);
  });
  return wb;
}
