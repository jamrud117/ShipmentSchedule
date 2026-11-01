"use strict";

/* ==================================================================
   TATA LETAK BERSAMA -- SATU MODEL, DUA KELUARAN (CETAK & EXCEL)

   CIPL dicetak dari peramban DAN diunduh sebagai Excel, dan keduanya
   harus sama persis. Karena itu lembarnya disusun SEKALI sebagai kisi:

     kolom  lebar dalam mm          baris  tinggi dalam pt
     sel    rentang (gabungan), isi per baris teks, rata, warna latar
     garis  per sisi sel: tebal (1/2 px), gaya, warna

   lalu digambar dua kali dengan angka yang sama:
     ttHtml()  -> tabel HTML (table-layout tetap, kolom mm, baris pt)
     ttExcel() -> lembar ExcelJS (kolom, baris, gabungan sel yang sama)

   TEKS DIPECAH DI SINI, bukan oleh peramban / Excel. Dua mesin
   pembungkus memotong di tempat berbeda; di sini lebar tiap huruf
   dibaca dari tabel metrik Arial & Times New Roman (TT_METRIK, sama
   dengan Liberation Sans/Serif), jadi pemotongan baris dan ukuran huruf
   yang dikecilkan supaya muat satu baris dihitung sekali untuk keduanya.
   Lebar dipakai 97% (TT_LONGGAR): Excel di layar menggambar kolom ~2%
   lebih sempit daripada saat dicetak.

   SATU BARIS TEKS = SATU BARIS EXCEL. Excel tidak diberi teks
   bertumpuk dalam satu sel: di sana tinggi tiap baris teks dibulatkan
   ke piksel ditambah jarak dalam sel, jadi kotak bertumpuk enam baris
   kehilangan baris terakhirnya (terpotong). Letak tiap baris teks
   dihitung dari model (atas sel + jarak barisnya), dan batas-batas itu
   menjadi baris Excel -- teks satu baris, tidak dibungkus Excel, rata
   tengah tegak di dalam jarak barisnya, persis seperti cetakannya.
   Jarak kiri/kanan teks (padding cetakan) = spasi tak-putus (U+00A0)
   selebar jarak itu.

   TAHAN AUTOFIT. AutoFit baris & kolom Excel mengabaikan sel gabungan;
   tanpa pegangan, baris kotak menyusut ke tinggi bawaan dan isinya
   hilang. Di luar area cetak ada kolom & baris PENGANCAR (spasi
   tak-putus putih): ukuran hurufnya membuat AutoFit menghasilkan tinggi
   baris & lebar kolom yang sama dengan rancangannya.
================================================================== */

/* Lebar huruf ASCII 32..126 dalam 1/2048 em, dari Liberation Sans/Serif
   (metriknya identik dengan Arial / Times New Roman). */
const TT_METRIK = (() => {
  const urai = (s) => s.split(",").map(Number);
  const tambahan = { 160: 569, 179: 682, 183: 682, 215: 1196, 8211: 1139, 8212: 2048, 8226: 717, 8364: 1139 };
  const tambahanT = { 160: 512, 179: 614, 183: 682, 215: 1155, 8211: 1024, 8212: 2048, 8226: 717, 8364: 1024 };
  return {
    arial: { a: urai("569,569,727,1139,1139,1821,1366,391,682,682,797,1196,569,682,569,569,1139,1139,1139,1139,1139,1139,1139,1139,1139,1139,569,569,1196,1196,1196,1139,2079,1366,1366,1479,1479,1366,1251,1593,1479,569,1024,1366,1139,1706,1479,1593,1366,1593,1479,1366,1251,1479,1366,1933,1366,1366,1251,569,569,569,961,1139,682,1139,1139,1024,1139,1139,569,1139,1139,455,455,1024,455,1706,1139,1139,1139,1139,682,1024,569,1139,1024,1479,1024,1024,1024,684,532,684,1196"), x: tambahan, tinggi: (1854 + 434) / 2048 },
    arialB: { a: urai("569,682,971,1139,1139,1821,1479,487,682,682,797,1196,569,682,569,569,1139,1139,1139,1139,1139,1139,1139,1139,1139,1139,682,682,1196,1196,1196,1251,1997,1479,1479,1479,1479,1366,1251,1593,1479,569,1139,1479,1251,1706,1479,1593,1366,1593,1479,1366,1251,1479,1366,1933,1366,1366,1251,682,569,682,1196,1139,682,1139,1251,1139,1251,1139,682,1251,1251,569,569,1139,569,1821,1251,1251,1251,1251,797,1139,682,1251,1139,1593,1139,1139,1024,797,573,797,1196"), x: tambahan, tinggi: (1854 + 434) / 2048 },
    times: { a: urai("512,682,836,1024,1024,1706,1593,369,682,682,1024,1155,512,682,512,569,1024,1024,1024,1024,1024,1024,1024,1024,1024,1024,569,569,1155,1155,1155,909,1886,1479,1366,1366,1479,1251,1139,1479,1479,682,797,1479,1251,1821,1479,1479,1139,1479,1366,1139,1251,1479,1479,1933,1479,1479,1251,682,569,682,961,1024,682,909,1024,909,1024,909,682,1024,1024,569,569,1024,569,1593,1024,1024,1024,1024,682,797,569,1024,1024,1479,1024,1024,909,983,410,983,1108"), x: tambahanT, tinggi: (1825 + 443) / 2048 },
    timesB: { a: urai("512,682,1137,1024,1024,2048,1706,569,682,682,1024,1167,512,682,512,569,1024,1024,1024,1024,1024,1024,1024,1024,1024,1024,682,682,1167,1167,1167,1024,1905,1479,1366,1479,1479,1366,1251,1593,1593,797,1024,1593,1366,1933,1479,1593,1251,1593,1479,1139,1366,1479,1479,2048,1479,1479,1366,682,569,682,1190,1024,682,1024,1139,909,1139,909,682,1024,1139,569,682,1139,569,1706,1139,1024,1139,1139,909,797,682,1139,1024,1479,1024,1024,909,807,451,807,1065"), x: tambahanT, tinggi: (1825 + 443) / 2048 },
  };
})();

const TT_LONGGAR = 0.97; // bagian lebar sel yang boleh diisi teks
const TT_XL_TEPI = 1.5; // jarak teks ke tepi sel di Excel (pt, ~2 px)
const TT_NAMA_HURUF = { arial: "Arial", times: "Times New Roman" };
const TT_CSS_HURUF = {
  arial: "Arial, 'Liberation Sans', Helvetica, sans-serif",
  times: "'Times New Roman', 'Liberation Serif', Times, serif",
};
const ttPt = (mm) => (mm * 72) / 25.4;
const ttMm = (pt) => (pt * 25.4) / 72;
const ttPx = (px) => px * 0.75; // px CSS -> pt

/* Gaya huruf: { f: "arial"|"times", s: pt, b, i, u, c: "#rrggbb" } */
function ttH(f, s, o) {
  return Object.assign({ f, s, b: false, i: false, u: false, c: "#222222" }, o || {});
}
function ttMetrikHuruf(h) {
  return TT_METRIK[(h.f === "times" ? "times" : "arial") + (h.b ? "B" : "")];
}

/* Lebar teks dalam pt. Huruf di luar tabel dianggap selebar "M" (aman). */
function ttLebar(teks, h) {
  const m = ttMetrikHuruf(h);
  let u = 0;
  for (const ch of String(teks == null ? "" : teks)) {
    const k = ch.codePointAt(0);
    u += k >= 32 && k <= 126 ? m.a[k - 32] : m.x[k] || m.a[45];
  }
  return (u / 2048) * h.s;
}

/* Pecah teks menjadi baris selebar `lebar` pt (spasi dirapatkan seperti
   HTML; kata yang lebih panjang dari satu baris dipotong per huruf). */
function ttBungkus(teks, h, lebar) {
  const hasil = [];
  String(teks == null ? "" : teks).split(/\r?\n/).forEach((para) => {
    const kata = para.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    let baris = "";
    kata.forEach((k) => {
      const coba = baris ? baris + " " + k : k;
      if (ttLebar(coba, h) <= lebar) { baris = coba; return; }
      if (baris) hasil.push(baris);
      baris = k;
      while (ttLebar(baris, h) > lebar && baris.length > 1) {
        let n = baris.length - 1;
        while (n > 1 && ttLebar(baris.slice(0, n), h) > lebar) n--;
        hasil.push(baris.slice(0, n));
        baris = baris.slice(n);
      }
    });
    hasil.push(baris);
  });
  return hasil.length ? hasil : [""];
}

/* Ukuran huruf terbesar (<= h.s) yang membuat SEMUA baris muat satu
   baris; null kalau bahkan `min` pt pun tidak muat. */
function ttUkuranPas(barisTeks, h, lebar, min) {
  const terlebar = Math.max(0, ...barisTeks.map((tx) => ttLebar(tx, h)));
  if (terlebar <= lebar) return h.s;
  const s = Math.floor(((h.s * lebar) / terlebar) * 20) / 20;
  return s >= (min || 7) ? s : null;
}

/* ---------------- MODEL ---------------- */

/* Satu baris teks: { runs: [{ t, h }], pitch } -- pitch = jarak baris (pt). */
const ttBaris = (tx, h, pitch) => ({ runs: [{ t: String(tx == null ? "" : tx), h }], pitch: pitch || h.s * 1.15 });
const ttSpasi = (pitch) => ({ runs: [], pitch });
/* Teks dibungkus selebar `lebar` pt; tiap baris berjarak `lh` x ukuran. */
const ttTeks = (teks, h, lebar, lh) => ttBungkus(teks, h, lebar).map((x) => ttBaris(x, h, h.s * (lh || 1.15)));

function ttTataBaru(nama, kolomMm, opsi) {
  const o = opsi || {};
  return {
    nama,
    kolom: kolomMm.slice(),
    baris: [],
    sel: [],
    garis: {}, // "h:r:c" (sisi atas baris r) / "v:r:c" (sisi kiri kolom c) -> { w, gaya, warna }
    gambar: [],
    margin: o.margin == null ? 10 : o.margin,
    halamanMm: o.halamanMm || { w: 210, h: 297 },
    pengisi: null,
  };
}
const ttTambahBaris = (T, pt) => T.baris.push(Math.max(0, pt)) - 1;

/* Sel: rentang r1..r2 x c1..c2 (indeks 0). `isi` = daftar baris teks.
   gaya: ha (left|center|right), va (top|middle|bottom), fill, padL,
   padR (pt), angka ({ v, fmt } -> sel angka di Excel). */
function ttSel(T, r1, c1, r2, c2, isi, gaya) {
  const s = Object.assign({ r1, c1, r2, c2, isi: isi || [], ha: "left", va: "top", padL: 0, padR: 0 }, gaya || {});
  T.sel.push(s);
  return s;
}

/* Garis di sisi rentang. sisi: "atas" | "bawah" | "kiri" | "kanan" (bisa
   beberapa, mis. "atas bawah"). spek: { w: 1|2, gaya: "solid"|"dotted", warna }. */
function ttGaris(T, r1, c1, r2, c2, sisi, spek) {
  const g = Object.assign({ w: 1, gaya: "solid", warna: "#222222" }, spek || {});
  const s = " " + sisi + " ";
  if (s.includes(" atas ")) for (let c = c1; c <= c2; c++) T.garis[`h:${r1}:${c}`] = g;
  if (s.includes(" bawah ")) for (let c = c1; c <= c2; c++) T.garis[`h:${r2 + 1}:${c}`] = g;
  if (s.includes(" kiri ")) for (let r = r1; r <= r2; r++) T.garis[`v:${r}:${c1}`] = g;
  if (s.includes(" kanan ")) for (let r = r1; r <= r2; r++) T.garis[`v:${r}:${c2 + 1}`] = g;
}
const ttKotak = (T, r1, c1, r2, c2, spek) => ttGaris(T, r1, c1, r2, c2, "atas bawah kiri kanan", spek);

/* Lebar sel (pt) dan lebar teks yang boleh dipakai di dalamnya */
function ttLebarSel(T, c1, c2) {
  let mm = 0;
  for (let c = c1; c <= c2; c++) mm += T.kolom[c];
  return ttPt(mm);
}
const ttLebarIsi = (T, c1, c2, padL, padR) => (ttLebarSel(T, c1, c2) - (padL || 0) - (padR || 0)) * TT_LONGGAR;

/* Tinggi isi sel = jumlah jarak barisnya */
const ttTinggiIsi = (isi) => isi.reduce((n, b) => n + b.pitch, 0);

/* Bidang cetak (pt) di dalam margin */
const ttBidang = (T) => ({ w: ttPt(T.halamanMm.w - 2 * T.margin), h: ttPt(T.halamanMm.h - 2 * T.margin) });

/* UKURAN DIBULATKAN KE PIKSEL (96 dpi): tinggi baris kelipatan 0,75 pt,
   lebar kolom piksel bulat (jumlahnya tetap). Aplikasi lembar kerja
   menggambar baris dalam piksel bulat -- LibreOffice memotong sisanya,
   Excel membulatkannya -- dan 23 baris yang masing-masing terpotong
   0,2 mm membuat lembar Excel 4 mm lebih pendek daripada cetakannya. */
function ttBulatkan(T) {
  T.baris = T.baris.map((pt) => Math.round(pt / 0.75) * 0.75);
  const px = T.kolom.map((mm) => (mm / 25.4) * 96);
  const bulat = px.map((x) => Math.max(1, Math.round(x)));
  const selisih = Math.round(px.reduce((a, b) => a + b, 0)) - bulat.reduce((a, b) => a + b, 0);
  const iMaks = bulat.indexOf(Math.max(...bulat));
  bulat[iMaks] += selisih;
  T.kolom = bulat.map((x) => (x / 96) * 25.4);
}

/* Baris pengisi memanjang sampai lembar setinggi bidang cetak (sisa 0,2%
   untuk pembulatan). Kalau isinya justru lebih tinggi, pengisinya tetap
   pada tinggi minimumnya dan lembar diperkecil saat dicetak (HTML: zoom,
   Excel: fitToPage). Dipanggil paling akhir: ukurannya dibulatkan dulu. */
function ttPenuhiHalaman(T, rPengisi) {
  ttBulatkan(T);
  T.pengisi = rPengisi;
  const lain = T.baris.reduce((n, t, i) => (i === rPengisi ? n : n + t), 0);
  const sisa = Math.floor((ttBidang(T).h * 0.998 - lain) / 0.75) * 0.75;
  T.baris[rPengisi] = Math.max(T.baris[rPengisi], sisa);
}

/* Belah kolom supaya ada batas tepat di x (mm, diukur dari tepi kiri
   kolom `dari`). Batas yang sudah ada dalam `toleransi` mm dipakai saja.
   Mengembalikan indeks kolom PERTAMA sesudah batas itu. Dipanggil
   SEBELUM sel dipasang. */
function ttBelahKolom(kolom, dari, xMm, toleransi) {
  let kiri = 0;
  for (let c = dari; c < kolom.length; c++) {
    const kanan = kiri + kolom[c];
    if (Math.abs(kanan - xMm) <= (toleransi || 0)) return c + 1;
    if (xMm < kanan) {
      kolom.splice(c, 1, xMm - kiri, kanan - xMm);
      return c + 1;
    }
    kiri = kanan;
  }
  return kolom.length;
}

/* ---------------- KELUARAN HTML ---------------- */

function ttEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const ttN = (x) => Math.round(x * 1000) / 1000;

function ttGayaHuruf(h) {
  return `font-family:${TT_CSS_HURUF[h.f] || TT_CSS_HURUF.arial};font-size:${ttN(h.s)}pt;font-weight:${h.b ? 700 : 400};` +
    `font-style:${h.i ? "italic" : "normal"};color:${h.c};${h.u ? "text-decoration:underline;" : ""}`;
}
function ttGayaGaris(g) {
  return g ? `${g.w}px ${g.gaya === "dotted" ? "dotted" : "solid"} ${g.warna}` : "0";
}

function ttHtml(T) {
  const nR = T.baris.length;
  const nC = T.kolom.length;
  const milik = Array.from({ length: nR }, () => new Array(nC).fill(null));
  T.sel.forEach((s) => {
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) milik[r][c] = s;
  });
  const sisi = (s, jenis) => {
    // garis pertama yang terpasang di sisi itu (sisi sel gabungan selalu seragam)
    if (jenis === "atas") for (let c = s.c1; c <= s.c2; c++) { const g = T.garis[`h:${s.r1}:${c}`]; if (g) return g; }
    if (jenis === "bawah") for (let c = s.c1; c <= s.c2; c++) { const g = T.garis[`h:${s.r2 + 1}:${c}`]; if (g) return g; }
    if (jenis === "kiri") for (let r = s.r1; r <= s.r2; r++) { const g = T.garis[`v:${r}:${s.c1}`]; if (g) return g; }
    if (jenis === "kanan") for (let r = s.r1; r <= s.r2; r++) { const g = T.garis[`v:${r}:${s.c2 + 1}`]; if (g) return g; }
    return null;
  };
  const td = (s) => {
    const span = (s.r2 > s.r1 ? ` rowspan="${s.r2 - s.r1 + 1}"` : "") + (s.c2 > s.c1 ? ` colspan="${s.c2 - s.c1 + 1}"` : "");
    const gaya = [
      `border-top:${ttGayaGaris(sisi(s, "atas"))}`, `border-bottom:${ttGayaGaris(sisi(s, "bawah"))}`,
      `border-left:${ttGayaGaris(sisi(s, "kiri"))}`, `border-right:${ttGayaGaris(sisi(s, "kanan"))}`,
      `text-align:${s.ha || "left"}`, `vertical-align:${s.va || "top"}`,
      `padding:0 ${ttN(s.padR || 0)}pt 0 ${ttN(s.padL || 0)}pt`,
    ];
    if (s.fill) gaya.push(`background:${s.fill}`);
    const isi = (s.isi || []).map((b) => `<div class="tt-l" style="height:${ttN(b.pitch)}pt;line-height:${ttN(b.pitch)}pt">` +
      b.runs.map((r) => `<span style="${ttGayaHuruf(r.h)}">${ttEsc(r.t)}</span>`).join("") + "</div>").join("");
    return `<td${span} style="${gaya.join(";")}">${isi}</td>`;
  };
  let isiTabel = "";
  for (let r = 0; r < nR; r++) {
    let tr = "";
    for (let c = 0; c < nC; c++) {
      const s = milik[r][c];
      if (s && (s.r1 !== r || s.c1 !== c)) continue; // tertutup sel gabungan
      tr += td(s || { r1: r, r2: r, c1: c, c2: c, isi: [] });
    }
    isiTabel += `<tr style="height:${ttN(T.baris[r])}pt">${tr}</tr>`;
  }
  const lebarMm = T.kolom.reduce((a, b) => a + b, 0);
  const tinggiPt = T.baris.reduce((a, b) => a + b, 0);
  const bidang = ttBidang(T);
  const zoom = Math.min(1, bidang.h / tinggiPt, bidang.w / ttPt(lebarMm));
  const gambar = T.gambar.map((g) => `<img src="${g.src}" alt="" style="position:absolute;left:${ttN(T.margin + g.xMm)}mm;top:${ttN(T.margin + g.yMm)}mm;width:${ttN(g.wMm)}mm;height:${ttN(g.hMm)}mm">`).join("");
  return `<div class="tt-hal" data-lembar="${ttEsc(T.nama)}">${gambar}` +
    `<table class="tt" style="width:${ttN(lebarMm)}mm${zoom < 0.999 ? `;zoom:${ttN(zoom)}` : ""}"><colgroup>` +
    T.kolom.map((mm) => `<col style="width:${ttN(mm)}mm">`).join("") + `</colgroup>${isiTabel}</table></div>`;
}

/* Dokumen cetak lengkap untuk beberapa lembar */
function ttDokumenHtml(judul, daftarTata) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${ttEsc(judul)}</title>
<style>${ttCss()}</style></head>
<body>${daftarTata.map(ttHtml).join("")}</body></html>`;
}

function ttCss() {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { color: #222; -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .tt-hal { position: relative; width: 210mm; height: 297mm; padding: 10mm; overflow: hidden; break-after: page; page-break-after: always; }
  .tt-hal:last-child { break-after: auto; page-break-after: auto; }
  .tt { border-collapse: collapse; table-layout: fixed; margin: 0 auto; }
  .tt td { padding: 0; overflow: visible; }
  .tt-l { white-space: pre; overflow: visible; }
  `;
}

/* ---------------- KELUARAN EXCEL ---------------- */

/* Huruf NORMAL buku kerja = Arial 11, bukan Calibri bawaan ExcelJS.

   Lebar kolom Excel ditulis dalam "lebar angka 0 huruf Normal". Calibri 11
   digambar 7 px di layar padahal lebar sebenarnya 7,43 px -- kolom di
   layar 6% lebih sempit daripada saat dicetak. Arial 11: 8 px lawan
   8,16 px, selisihnya tinggal 2%. Mengembalikan lebar angka itu (pt)
   untuk menghitung lebar kolom. */
function ttExcelHurufNormal(wb) {
  const calibri = (1038 / 2048) * 11;
  try {
    const xlsx = wb.xlsx;
    if (!xlsx || typeof xlsx.addStyles !== "function") return calibri;
    xlsx.addStyles = async function (zip, model) {
      const xml = String(model.styles.xml || "").replace(/<font>(?:(?!<\/font>).)*<\/font>/,
        '<font><sz val="11"/><color theme="1"/><name val="Arial"/><family val="2"/></font>');
      if (xml) zip.append(xml, { name: "xl/styles.xml" });
    };
    return (1139 / 2048) * 11;
  } catch (e) {
    return calibri;
  }
}

const ttArgb = (hex) => "FF" + String(hex || "#000000").replace("#", "").toUpperCase();
const ttXlHuruf = (h) => ({
  name: TT_NAMA_HURUF[h.f] || "Arial", size: Math.round(h.s * 100) / 100, bold: !!h.b, italic: !!h.i,
  underline: h.u ? "single" : undefined, color: { argb: ttArgb(h.c) },
});
const TT_NBSP = "\u00a0";

/* Spasi tak-putus selebar `lebar` pt dengan huruf <= `maks` pt (tidak
   menaikkan tinggi baris) -- jarak kiri/kanan teks di Excel. */
function ttXlSpasi(lebar, maks, f, warna) {
  if (lebar < 0.3) return [];
  const satu = TT_METRIK[f].a[0] / 2048;
  let k = Math.max(1, Math.round(lebar / (satu * maks)));
  let ukuran = lebar / (k * satu);
  while (ukuran > maks && k < 50) ukuran = lebar / (++k * satu);
  if (ukuran < 1) { k = 1; ukuran = Math.max(1, lebar / satu); }
  return [{ text: TT_NBSP.repeat(k), font: ttXlHuruf(ttH(f, Math.round(ukuran * 100) / 100, { c: warna })) }];
}

/* Rangkaian teks Excel untuk SATU baris teks sel `s`: jarak tepi lewat
   spasi tak-putus, rata tengah yang jarak tepinya tidak sama (kop SI)
   digeser dengan cara yang sama. */
function ttExcelRuns(s, b) {
  const isi = b.runs.filter((r) => r.t !== "").map((r) => ({ text: r.t, font: ttXlHuruf(r.h) }));
  const h0 = b.runs[0].h;
  const f = h0.f === "times" ? "times" : "arial";
  const kecil = Math.min(...b.runs.map((r) => r.h.s));
  if (s.ha === "left") return ttXlSpasi(Math.max(0, (s.padL || 0) - TT_XL_TEPI), kecil, f, h0.c).concat(isi);
  if (s.ha === "right") return isi.concat(ttXlSpasi(Math.max(0, (s.padR || 0) - TT_XL_TEPI), kecil, f, h0.c));
  const geser = (s.padL || 0) - (s.padR || 0);
  if (geser > 0.3) return ttXlSpasi(geser, kecil, f, h0.c).concat(isi);
  if (geser < -0.3) return isi.concat(ttXlSpasi(-geser, kecil, f, h0.c));
  return isi;
}

function ttKolomHuruf(n) {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/* Ukuran huruf yang membuat AutoFit baris Excel setinggi `pt`: tinggi
   AutoFit = huruf x 1,117 (Arial, dibulatkan ke piksel) + 2 px. */
const ttXlHurufPengancarBaris = (pt) => Math.min(409, Math.max(1, Math.ceil(((pt / 0.75 - 2) / 1.117) * 0.75 * 4) / 4));

/* Gambar lembar ke workbook ExcelJS. `lebarAngkaPt` dari ttExcelHurufNormal(). */
function ttExcel(wb, T, lebarAngkaPt) {
  const ws = wb.addWorksheet(T.nama, { views: [{ showGridLines: false }], properties: { defaultRowHeight: 15 } });
  const mdw = lebarAngkaPt || (1139 / 2048) * 11;
  const nC = T.kolom.length;

  /* BARIS EXCEL = batas baris model + batas tiap baris teks, dalam
     piksel 96 dpi (0,75 pt) supaya tidak ada baris pecahan piksel. */
  const px = (pt) => Math.round(pt / 0.75);
  const yModel = [0];
  T.baris.forEach((h) => yModel.push(yModel[yModel.length - 1] + h));
  const batas = new Set(yModel.map(px));
  const tata = T.sel.map((s) => {
    const atas = px(yModel[s.r1]);
    const bawah = px(yModel[s.r2 + 1]);
    const isi = s.isi || [];
    const tinggi = ttTinggiIsi(isi);
    const ruang = yModel[s.r2 + 1] - yModel[s.r1];
    let y = yModel[s.r1] + (s.va === "middle" ? (ruang - tinggi) / 2 : s.va === "bottom" ? ruang - tinggi : 0);
    const baris = [];
    isi.forEach((b) => {
      const y1 = y;
      y += b.pitch;
      if (!b.runs.some((r) => r.t !== "")) return;
      const p1 = Math.min(Math.max(px(y1), atas), bawah - 1);
      const p2 = Math.min(Math.max(px(y), p1 + 1), bawah);
      batas.add(p1);
      batas.add(p2);
      baris.push({ b, p1, p2 });
    });
    return { s, atas, bawah, baris };
  });
  const K = [...batas].sort((p, q) => p - q);
  const ke = new Map(K.map((k, i) => [k, i])); // piksel batas -> indeks baris Excel (0) yang dimulai di situ
  const nR = K.length - 1;

  T.kolom.forEach((mm, i) => (ws.getColumn(i + 1).width = Math.round((ttPt(mm) / mdw) * 1000) / 1000));
  ws.getColumn(nC + 1).width = 2;
  for (let i = 0; i < nR; i++) ws.getRow(i + 1).height = (K[i + 1] - K[i]) * 0.75;

  const isiLatar = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  tata.forEach(({ s, atas, bawah, baris }) => {
    const r1 = ke.get(atas);
    const r2 = ke.get(bawah) - 1;
    if (s.fill) {
      for (let r = r1; r <= r2; r++) for (let c = s.c1; c <= s.c2; c++) ws.getCell(r + 1, c + 1).fill = isiLatar(ttArgb(s.fill));
    }
    const angka = s.angka && baris.length === 1;
    baris.forEach(({ b, p1, p2 }) => {
      const a = ke.get(p1);
      const z = ke.get(p2) - 1;
      if (z > a || s.c2 > s.c1) ws.mergeCells(a + 1, s.c1 + 1, z + 1, s.c2 + 1);
      const sel = ws.getCell(a + 1, s.c1 + 1);
      const h0 = b.runs.find((r) => r.t !== "").h;
      if (angka) {
        sel.value = s.angka.v;
        if (s.angka.fmt) sel.numFmt = s.angka.fmt;
        sel.font = ttXlHuruf(h0);
      } else {
        const runs = ttExcelRuns(s, b);
        if (runs.length === 1) {
          sel.value = runs[0].text;
          sel.font = runs[0].font;
        } else {
          sel.value = { richText: runs };
          sel.font = ttXlHuruf(h0);
        }
      }
      sel.alignment = { horizontal: s.ha || "left", vertical: "middle", wrapText: false };
    });
  });

  // Garis model (batas baris model r, kolom c) -> batas baris Excel; tiap sisi di KEDUA sel yang berbagi sisi itu
  const barisModel = (r) => ke.get(px(yModel[r]));
  const gaya = (g) => (g.gaya === "dotted" ? "dotted" : g.w >= 3 ? "thick" : g.w >= 2 ? "medium" : "thin");
  const pasang = (r, c, k, g) => {
    if (r < 0 || c < 0 || r >= nR || c >= nC) return;
    const sel = ws.getCell(r + 1, c + 1);
    sel.border = Object.assign({}, sel.border, { [k]: { style: gaya(g), color: { argb: ttArgb(g.warna) } } });
  };
  Object.keys(T.garis).forEach((kunci) => {
    const [jenis, rs, cs] = kunci.split(":");
    const r = Number(rs), c = Number(cs), g = T.garis[kunci];
    if (jenis === "h") {
      const k = barisModel(r);
      pasang(k - 1, c, "bottom", g);
      pasang(k, c, "top", g);
    } else {
      for (let x = barisModel(r); x < barisModel(r + 1); x++) {
        pasang(x, c - 1, "right", g);
        pasang(x, c, "left", g);
      }
    }
  });

  // Gambar: jangkar sel + geseran EMU (1 mm = 36000 EMU, 1 pt = 12700 EMU)
  T.gambar.forEach((g) => {
    if (!g.src) return;
    let x = 0, c = 0;
    while (c < nC - 1 && x + T.kolom[c] <= g.xMm) x += T.kolom[c++];
    const yPt = ttPt(g.yMm);
    let r = 0;
    while (r < nR - 1 && K[r + 1] * 0.75 <= yPt) r++;
    const id = wb.addImage({ base64: g.src, extension: g.ext || "png" });
    ws.addImage(id, {
      tl: { nativeCol: c, nativeColOff: Math.round((g.xMm - x) * 36000), nativeRow: r, nativeRowOff: Math.round((yPt - K[r] * 0.75) * 12700) },
      ext: { width: (g.wMm / 25.4) * 96, height: (g.hMm / 25.4) * 96 },
      editAs: "oneCell",
    });
  });

  /* PENGANCAR AUTOFIT, di luar area cetak, putih. Kolom sesudah bingkai:
     tiap baris satu spasi tak-putus berhuruf setinggi barisnya. Baris
     sesudah bingkai: tiap kolom spasi tak-putus Arial 13,5 pt (tepat 5 px
     per spasi) selebar kolomnya kurang 5 px jarak tepi sel. */
  const putih = { argb: "FFFFFFFF" };
  for (let i = 0; i < nR; i++) {
    const sel = ws.getCell(i + 1, nC + 1);
    sel.value = TT_NBSP;
    sel.font = { name: "Arial", size: ttXlHurufPengancarBaris((K[i + 1] - K[i]) * 0.75), color: putih };
  }
  T.kolom.forEach((mm, i) => {
    const lebarPx = (ttPt(mm) / mdw) * 8; // lebar kolom (karakter) x lebar angka Arial 11 (8 px)
    const n = Math.max(0, Math.round((lebarPx - 5) / 5));
    if (!n) return;
    const sel = ws.getCell(nR + 1, i + 1);
    sel.value = TT_NBSP.repeat(n);
    sel.font = { name: "Arial", size: 13.5, color: putih };
  });
  ws.getRow(nR + 1).height = 3;

  /* Margin Excel sedikit lebih sempit daripada cetakan (kiri-kanan 1,5 mm,
     bawah 2 mm): lembarnya tepat selebar & setinggi bidang cetak,
     sementara aplikasi lembar kerja membulatkan lebar tiap kolom dan
     fitToPage membulatkan skalanya ke persen bulat -- kelebihan 1 mm saja
     sudah membuatnya 99%. Rata tengah mendatar, jadi bingkainya tetap
     jatuh di tempat yang sama dengan cetakan. */
  const inci = (mm) => Math.round((mm / 25.4) * 10000) / 10000;
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait",
    fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    horizontalCentered: true, verticalCentered: false,
    margins: { left: inci(T.margin - 1.5), right: inci(T.margin - 1.5), top: inci(T.margin), bottom: inci(T.margin - 2), header: 0, footer: 0 },
    // "A$1" -> ExcelJS menulis "$A$1": area cetak mutlak (tanpa pengancar AutoFit)
    printArea: `A$1:${ttKolomHuruf(nC)}$${nR}`,
  };
  return ws;
}
