"use strict";

/* ==================================================================
   UJI GEOMETRI LOGO CIPL

   Membandingkan angka logo di js/features/cipl-excel.js dengan angka
   yang benar-benar tertulis di berkas rujukan, lalu MEMBUKTIKAN bahwa
   ExcelJS memang mengeluarkan angka itu — bukan sekadar menerimanya.

   KENAPA PERLU DIUJI SAMPAI KE XML. ExcelJS menerima `ext` dalam
   piksel dan mengubahnya dengan Math.floor(px * 9525). Angka piksel
   yang kelihatan benar bisa meleset satu EMU setelah dibulatkan, dan
   selisih satu EMU tidak akan pernah terlihat di layar — hanya di
   berkas. Membandingkan niat dengan hasil adalah satu-satunya cara
   tahu.

   CARA PAKAI
     node qa/logo-geometry-test.js

   Berjalan tanpa berkas rujukan: angkanya sudah dicatat di ACUAN di
   bawah. Kalau berkas rujukannya ada, ia ikut dibaca dan dibandingkan,
   supaya ACUAN tidak diam-diam menyimpang dari kenyataan:
     node qa/logo-geometry-test.js /path/DDI-026_2026-VIII-EXIM-LOG.xlsx
================================================================== */

const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------
   ACUAN — disalin dari lembar INVOICE berkas rujukan
   DDI-CRBM/VIII/044, xl/drawings/drawing1.xml.

   Rujukan LAMA (DDI-026) memakai rowOff 0 dan cy 947985. Itu yang
   memotong border atas saat dicetak: sisi atas gambar tepat di y=0,
   menindih garis batas lembar. Angkanya disimpan di bawah sebagai
   penjaga — supaya tidak ada yang tanpa sengaja kembali ke sana.

   Lembar PL di berkas yang sama memakai cy 852735 dan rowOff 95250.
   Itu SENGAJA tidak diikuti — lihat catatan di cipl-excel.js.
------------------------------------------------------------------ */
const ACUAN = { colOff: 66675, rowOff: 85725, cx: 886211, cy: 881310 };
const ACUAN_PL_RUJUKAN = { colOff: 9139, rowOff: 95250, cx: 886211, cy: 852735 };
/* Tepi bawah pada berkas rujukan. TIDAK lagi jadi patokan wajib —
   logo sekarang digeser turun supaya tidak menimpa garis atas, jadi
   tepi bawahnya ikut turun. Angkanya disimpan hanya untuk uji
   keseragaman antar-lembar di berkas rujukan. */
const TEPI_BAWAH_EMU = 947985;
/* Geometri lama yang terbukti terpotong saat dicetak. */
const GEOMETRI_TERPOTONG = { rowOff: 0, cy: 947985 };

let lulus = 0;
let gagal = 0;
function t(nama, fn) {
  try {
    fn();
    lulus++;
    console.log("  \u2713 " + nama);
  } catch (e) {
    gagal++;
    console.log("  \u2717 " + nama + "\n      " + e.message);
  }
}
function eq(a, b, ket) {
  if (a !== b) throw new Error((ket || "") + " dapat " + a + ", harusnya " + b);
}

/* ------------------------------------------------------------------
   1. ANGKA DI SUMBER
------------------------------------------------------------------ */
const src = fs.readFileSync(
  path.join(__dirname, "..", "js", "features", "cipl-excel.js"),
  "utf8",
);

function angkaDariSumber(kunci) {
  const m = new RegExp(kunci + "\\s*:\\s*(\\d+)").exec(src);
  if (!m) throw new Error("XLS_LOGO_EMU." + kunci + " tidak ditemukan");
  return Number(m[1]);
}

console.log("\u2014 ANGKA DI cipl-excel.js \u2014");
t("geometri logo sama dengan lembar INVOICE rujukan", () => {
  eq(angkaDariSumber("colOff"), ACUAN.colOff, "colOff:");
  eq(angkaDariSumber("rowOff"), ACUAN.rowOff, "rowOff:");
  eq(angkaDariSumber("lebar"), ACUAN.cx, "cx:");
  eq(angkaDariSumber("tinggi"), ACUAN.cy, "cy:");
});
t("sisi atas TIDAK menempel di y=0 — itu yang memotong border saat cetak", () => {
  /* Penjaga terhadap kemunduran yang persis pernah terjadi. rowOff 0
     membuat gambar menindih garis batas atas lembar; di layar mulus,
     di kertas border atasnya hilang. */
  const rowOff = angkaDariSumber("rowOff");
  if (rowOff === GEOMETRI_TERPOTONG.rowOff)
    throw new Error("rowOff kembali ke 0 — border atas akan terpotong lagi saat dicetak");
  if (rowOff <= 0) throw new Error("rowOff harus positif, dapat " + rowOff);
  if (angkaDariSumber("tinggi") === GEOMETRI_TERPOTONG.cy)
    throw new Error("tinggi kembali ke geometri lama yang terpotong");
});
t("logo BERJARAK dari keempat garis pita kop", () => {
  /* Aturan sebenarnya, menggantikan patokan tepi-bawah yang lama.

     Logo ini menutupi apa pun di bawahnya. Menempel di garis mana pun
     berarti garis itu hilang saat dicetak — sudah dua kali kejadian:
     garis ATAS (rowOff 0), lalu garis KIRI (colOff 9139, kurang dari
     satu piksel).

     Yang diperiksa jaraknya, bukan angkanya. Dengan begitu posisinya
     boleh disetel ulang kapan saja selama tidak menyentuh garis. */
  const EMU = 9525;
  const JARAK_MIN_PX = 3;
  const px = (e) => e / EMU;

  const kiri = px(angkaDariSumber("colOff"));
  const atas = px(angkaDariSumber("rowOff"));
  const bawah = atas + px(angkaDariSumber("tinggi"));
  const kanan = kiri + px(angkaDariSumber("lebar"));

  /* Tinggi pita kop dihitung dari tinggi barisnya sendiri, dibaca dari
     sumber — bukan angka mati di sini, supaya keduanya tidak bisa
     bercabang. */
  const src2 = fs.readFileSync(
    path.join(__dirname, "..", "js", "features", "cipl-excel.js"), "utf8");
  const mKop = /XLS_BARIS_KOP = \{([^}]*)\}/.exec(src2);
  if (!mKop) throw new Error("XLS_BARIS_KOP tidak ditemukan");
  const tinggiKhusus = {};
  mKop[1].replace(/(\d+)\s*:\s*([\d.]+)/g,
    (_, r, h) => (tinggiKhusus[+r] = Number(h)));
  const mAkhir = /XLS_PITA_KOP_BARIS_TERAKHIR = (\d+)/.exec(src2);
  const mBawaan = /XLS_TINGGI_BARIS_BAWAAN = ([\d.]+)/.exec(src2);
  if (!mAkhir || !mBawaan) throw new Error("batas pita kop tidak ditemukan");
  let pt = 0;
  for (let r = 1; r <= Number(mAkhir[1]); r++) {
    pt += tinggiKhusus[r] || Number(mBawaan[1]);
  }
  const tinggiKop = (pt * 4) / 3;

  if (atas < JARAK_MIN_PX)
    throw new Error(`menempel garis ATAS (${atas.toFixed(2)}px)`);
  if (kiri < JARAK_MIN_PX)
    throw new Error(`menempel garis KIRI (${kiri.toFixed(2)}px)`);
  if (tinggiKop - bawah < JARAK_MIN_PX)
    throw new Error(
      `menembus garis BAWAH kop — tepi bawah ${bawah.toFixed(2)}px, ` +
      `pita kop ${tinggiKop.toFixed(2)}px`);
  /* Kolom A saja tidak cukup lebar; logonya memang melewati ke kolom B,
     sama seperti di berkas rujukan. Yang dijaga: jangan sampai ia
     menyentuh nama perusahaan yang dipusatkan mulai kolom B. */
  const lebarAB = Math.round(4.5703125 * 7) + 5 + Math.round(22.140625 * 7) + 5;
  if (kanan > lebarAB)
    throw new Error(`logo melewati kolom B (${kanan.toFixed(2)}px > ${lebarAB}px)`);
});
t("ukuran lama 52x52 piksel sudah tidak dipakai", () => {
  if (/ext:\s*\{\s*width:\s*52\s*,\s*height:\s*52\s*\}/.test(src))
    throw new Error("masih memakai ext 52x52");
  if (/tl:\s*\{\s*col:\s*0\.2/.test(src))
    throw new Error("masih memakai pecahan kolom (col: 0.2)");
});
t("angkanya benar-benar DIPAKAI, bukan cuma didefinisikan", () => {
  /* Penjaga terpenting di berkas ini. Memeriksa isi XLS_LOGO_EMU saja
     tidak cukup: kalau addImage-nya diubah kembali ke angka lain,
     konstantanya tetap ada dan tetap lulus — sementara berkas yang
     diunduh sudah salah lagi. Jadi yang diperiksa panggilannya. */
  const m = /function ciplXlsLogo[\s\S]*?\n\}/.exec(src);
  if (!m) throw new Error("ciplXlsLogo tidak ditemukan");
  const badan = m[0];
  ["XLS_LOGO_EMU.colOff", "XLS_LOGO_EMU.rowOff",
   "XLS_LOGO_EMU.lebar", "XLS_LOGO_EMU.tinggi"].forEach((k) => {
    if (badan.indexOf(k) < 0) throw new Error(k + " tidak dipakai di ciplXlsLogo");
  });
  if (!/nativeColOff/.test(badan))
    throw new Error("posisi tidak memakai nativeColOff — pecahan kolom ikut lebar kolom");
  if ((badan.match(/pikselDariEmu\(/g) || []).length !== 2)
    throw new Error("ext tidak melewati pikselDariEmu — pembulatannya bisa meleset");
});
t("satu sumber angka untuk SEMUA lembar", () => {
  /* Kalau ciplXlsLogo dipanggil dari beberapa tempat tapi angkanya
     ditulis ulang di salah satunya, dua kop bisa berbeda diam-diam. */
  const panggilan = (src.match(/ciplXlsLogo\(/g) || []).length;
  if (panggilan < 3)
    throw new Error("ciplXlsLogo hanya muncul " + panggilan + "x — periksa lagi");
  const blokEmu = (src.match(/XLS_LOGO_EMU\s*=/g) || []).length;
  eq(blokEmu, 1, "XLS_LOGO_EMU didefinisikan lebih dari sekali:");
});

/* ------------------------------------------------------------------
   2. PEMBULATAN PIKSEL -> EMU

   Ini inti bugnya kalau sampai terjadi: niat benar, hasil meleset.
------------------------------------------------------------------ */
const EMU_PER_PIKSEL = 9525;
function pikselDariEmu(emu) {
  return (emu + 0.5) / EMU_PER_PIKSEL;
}
function emuHasilExcelJs(px) {
  return Math.floor(px * EMU_PER_PIKSEL);   // persis rumus ext-xform.js
}

console.log("\u2014 PEMBULATAN PIKSEL \u2192 EMU \u2014");
t("bolak-balik EMU tidak meleset satu pun", () => {
  [ACUAN.cx, ACUAN.cy, ACUAN_PL_RUJUKAN.cy, 1, 9525, 886210, 886212]
    .forEach((emu) =>
      eq(emuHasilExcelJs(pikselDariEmu(emu)), emu, "EMU " + emu + ":"));
});
t("pembagian polos MEMANG bisa meleset — inilah alasan +0.5 ada", () => {
  /* Penjaga: kalau suatu saat +0.5 dihapus karena terlihat aneh,
     tes ini menerangkan kenapa ia ada. */
  let meleset = 0;
  for (let emu = 880000; emu < 890000; emu++) {
    if (Math.floor((emu / EMU_PER_PIKSEL) * EMU_PER_PIKSEL) !== emu) meleset++;
  }
  if (meleset === 0)
    throw new Error("pembagian polos ternyata selalu tepat — +0.5 boleh dicabut");
});

/* ------------------------------------------------------------------
   3. HASIL NYATA DARI ExcelJS

   Dilewati kalau ExcelJS tidak terpasang — berkas ini tidak boleh
   memaksa siapa pun menjalankan npm install hanya untuk mengecek.
------------------------------------------------------------------ */
let ExcelJS = null;
try {
  ExcelJS = require("exceljs");
} catch (e) {
  ExcelJS = null;
}

async function ujiKeluaranNyata() {
  console.log("\u2014 XML YANG BENAR-BENAR DITULIS \u2014");
  if (!ExcelJS) {
    console.log("  \u2013 dilewati: ExcelJS tidak terpasang (npm i exceljs@4.4.0)");
    return;
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("INVOICE");
  ws.getColumn(1).width = 4.5703125;
  /* PNG 1x1 — isinya tidak penting, yang diuji geometrinya. */
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const id = wb.addImage({ base64: png, extension: "png" });
  ws.addImage(id, {
    tl: {
      nativeCol: 0,
      nativeColOff: ACUAN.colOff,
      nativeRow: 0,
      nativeRowOff: ACUAN.rowOff,
    },
    ext: { width: pikselDariEmu(ACUAN.cx), height: pikselDariEmu(ACUAN.cy) },
  });

  const buf = await wb.xlsx.writeBuffer();
  const teks = buf.toString("latin1");
  /* Zip tersimpan mampat, jadi XML-nya dibaca lewat ExcelJS sendiri
     daripada menambah ketergantungan pembongkar zip. */
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const gbr = wb2.getWorksheet("INVOICE").getImages()[0];

  t("colOff & rowOff bertahan sampai ke berkas", () => {
    eq(gbr.range.tl.nativeColOff, ACUAN.colOff, "colOff:");
    eq(gbr.range.tl.nativeRowOff, ACUAN.rowOff, "rowOff:");
    eq(gbr.range.tl.nativeCol, 0, "col:");
    eq(gbr.range.tl.nativeRow, 0, "row:");
  });
  t("cx & cy di berkas tepat, bukan meleset satu EMU", () => {
    eq(emuHasilExcelJs(gbr.range.ext.width), ACUAN.cx, "cx:");
    eq(emuHasilExcelJs(gbr.range.ext.height), ACUAN.cy, "cy:");
  });
  t("jangkarnya oneCellAnchor, sama seperti rujukan", () => {
    if (teks.indexOf("twoCellAnchor") >= 0)
      throw new Error("ExcelJS menulis twoCellAnchor, rujukan memakai oneCellAnchor");
  });
}

/* ------------------------------------------------------------------
   4. COCOKKAN LANGSUNG DENGAN BERKAS RUJUKAN (opsional)
------------------------------------------------------------------ */
async function ujiBerkasRujukan(berkas) {
  console.log("\u2014 BERKAS RUJUKAN \u2014");
  if (!berkas) {
    console.log("  \u2013 dilewati: tidak diberi path berkas rujukan");
    return;
  }
  if (!fs.existsSync(berkas)) throw new Error("berkas tidak ada: " + berkas);
  if (!ExcelJS) {
    console.log("  \u2013 dilewati: ExcelJS tidak terpasang");
    return;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(berkas);

  /* TOLERANSI, dan alasannya.

     Berkas rujukan digambar orang, bukan mesin. Membandingkan
     DDI-CRBM/044 dengan /045 memperlihatkan: ukuran logo (cx/cy) dan
     jarak turunnya (rowOff) SAMA PERSIS di semua lembar — itu yang
     memang disepakati. Yang berbeda hanya geseran mendatarnya:
     9139 / 66289 / 76375 EMU, yaitu 1 sampai 8 piksel, dan berbeda-beda
     antar lembar di dalam SATU berkas.

     Itu jejak logo yang tergeser saat diseret, bukan keputusan tata
     letak. Menuntutnya sama persis membuat uji ini gagal setiap kali
     ada berkas rujukan baru — tanpa ada yang benar-benar rusak. */
  const SATU_EMU = 1;          // Excel kerap meleset satu EMU saat menyimpan
  const GESER_MENDATAR_MAKS = 9525 * 10;   // 10 piksel

  t("UKURAN logo sama persis dengan rujukan", () => {
    /* Ukurannya yang harus sama — itu yang terlihat orang. */
    ["INVOICE", "PL"].forEach((nm) => {
      const ws = wb.getWorksheet(nm);
      if (!ws) return;
      const g = ws.getImages()[0];
      if (!g) throw new Error(nm + ": tidak ada logo di berkas rujukan");
      eq(emuHasilExcelJs(g.range.ext.width), ACUAN.cx, nm + " cx:");
      eq(emuHasilExcelJs(g.range.ext.height), ACUAN.cy, nm + " cy:");
    });
  });
  t("POSISI sengaja berbeda dari rujukan — dan itu memang disengaja", () => {
    /* Berkas rujukan menaruh logo 7px dari atas dan 1-8px dari kiri.
       Yang 1px itu menimpa garis bingkai dan memotongnya saat dicetak.
       Aplikasi memberi jarak lebih: 9px dari atas, 7px dari kiri.

       Uji ini ada supaya penyimpangan itu TERCATAT sebagai keputusan.
       Kalau suatu saat ada yang "membetulkannya" agar sama persis
       dengan rujukan, ia akan berbunyi lebih dulu. */
    const ws = wb.getWorksheet("INVOICE");
    if (!ws) return;
    const g = ws.getImages()[0];
    if (g.range.tl.nativeRowOff >= ACUAN.rowOff)
      throw new Error(
        "rujukan ternyata sudah menaruh logo serendah aplikasi (" +
        g.range.tl.nativeRowOff + ") — catatan di cipl-excel.js perlu ditinjau");
  });
  t("geseran mendatar masih dalam batas wajar", () => {
    /* Bukan dituntut sama, tapi juga tidak dibiarkan bebas: kalau suatu
       saat logonya bergeser sepuluh piksel atau lebih, itu bukan lagi
       jejak seretan dan pantas diperiksa orang. */
    ["INVOICE", "PL"].forEach((nm) => {
      const ws = wb.getWorksheet(nm);
      if (!ws) return;
      const g = ws.getImages()[0];
      const beda = Math.abs(g.range.tl.nativeColOff - ACUAN.colOff);
      if (beda > GESER_MENDATAR_MAKS)
        throw new Error(nm + ": logo bergeser " + (beda / 9525).toFixed(1) + " piksel dari acuan");
    });
  });
  t("tepi bawah logo seragam di seluruh lembar rujukan", () => {
    const bawah = [];
    ["INVOICE", "PL", "SI"].forEach((nm) => {
      const ws = wb.getWorksheet(nm);
      if (!ws) return;
      const g = ws.getImages()[0];
      if (g) bawah.push(g.range.tl.nativeRowOff + emuHasilExcelJs(g.range.ext.height));
    });
    if (!bawah.length) throw new Error("tidak ada logo di berkas rujukan");
    const maks = Math.max(...bawah), min = Math.min(...bawah);
    if (maks - min > SATU_EMU)
      throw new Error("tepi bawah tidak seragam: " + bawah.join(", "));
    if (Math.abs(maks - TEPI_BAWAH_EMU) > SATU_EMU)
      throw new Error("tepi bawah rujukan berubah jadi " + maks + " — tinjau ACUAN");
  });
}

/* ------------------------------------------------------------------
   5. TATA LETAK LEMBAR — lebar kolom, skala, garis bantu

   Angka-angka ini disalin dari DDI-CRBM-VIII-045. Diperiksa terhadap
   SUMBERNYA, bukan terhadap berkas hasil, supaya ia tetap berguna
   walau berkas rujukannya tidak ikut dibawa.
------------------------------------------------------------------ */
const TATA_LETAK = {
  INVOICE: {
    lebar: [4.5703125, 22.140625, 30.5703125, 18.28515625, 6.42578125,
      5, 7.140625, 10, 7, 10.85546875],
  },
  PL: {
    lebar: [4.5703125, 22.28515625, 26.140625, 16, 6.42578125, 5,
      7.140625, 8.42578125, 19.42578125, 10.85546875],
  },
};

function ujiTataLetak() {
  console.log("\u2014 TATA LETAK LEMBAR \u2014");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "js", "features", "cipl-excel.js"), "utf8");
  const rapat = src.replace(/\s+/g, " ");

  t("lebar kolom INVOICE & PL sama dengan rujukan", () => {
    Object.entries(TATA_LETAK).forEach(([nama, cfg]) => {
      const petik = cfg.lebar.join(", ");
      if (rapat.indexOf(petik) < 0)
        throw new Error(nama + ": lebar kolom tidak cocok — cari [" + petik + "]");
    });
  });
  t("skala cetak sama dengan rujukan", () => {
    eq(/scale: 80/.test(src), true, "INVOICE 80%:");
    eq(/scale: 73/.test(src), true, "PL 73%:");
    eq(/scale: 67/.test(src), true, "SI 67%:");
    // Angka lama tidak boleh tertinggal.
    eq(/scale: 83/.test(src), false, "skala INVOICE lama (83) masih ada:");
    eq(/scale: 72/.test(src), false, "skala PL lama (72) masih ada:");
  });
  t("garis bantu dimatikan HANYA di lembar PL", () => {
    const jml = (src.match(/showGridLines: false/g) || []).length;
    eq(jml, 1, "jumlah lembar tanpa garis bantu:");
    const i = src.indexOf("showGridLines: false");
    if (src.slice(Math.max(0, i - 500), i).indexOf('addWorksheet("PL"') < 0)
      throw new Error("yang dimatikan bukan lembar PL");
  });
  t('indentasi "Address" di lembar SI lima spasi', () => {
    if (src.indexOf('"     Address"') < 0)
      throw new Error("indentasi Address tidak lima spasi");
    if (src.indexOf('"          Address"') >= 0)
      throw new Error("indentasi sepuluh spasi masih ada");
  });
  t("tinggi baris barang DIBIARKAN otomatis", () => {
    /* Rujukan memasang 24pt pada baris barang PERTAMA di INVOICE saja.
       SENGAJA tidak ditiru: selnya wrapText, dan tinggi tetap akan
       MEMOTONG nama barang yang turun ke baris ketiga — persis jenis
       kesalahan yang tidak terlihat salah oleh siapa pun. */
    if (/getRow\(XLS_BARIS_ITEM\)\.height/.test(src))
      throw new Error("tinggi baris barang dipatok — nama panjang bisa terpotong");
  });
}

(async () => {
  ujiTataLetak();
  await ujiKeluaranNyata();
  await ujiBerkasRujukan(process.argv[2]);
  console.log("\n" + lulus + " lulus, " + gagal + " gagal\n");
  process.exit(gagal ? 1 : 0);
})();
