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
const ACUAN = { colOff: 9139, rowOff: 66675, cx: 886211, cy: 881310 };
const ACUAN_PL_RUJUKAN = { colOff: 9139, rowOff: 95250, cx: 886211, cy: 852735 };
/* Tepi bawah yang diseragamkan di seluruh rujukan yang benar. */
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
t("tepi bawah logo tetap di garis yang sama dengan rujukan", () => {
  /* Logo diseragamkan dari BAWAH. Kalau tingginya diubah tanpa
     menggeser rowOff, kopnya naik-turun tanpa ada yang sadar. */
  eq(angkaDariSumber("rowOff") + angkaDariSumber("tinggi"), TEPI_BAWAH_EMU,
    "rowOff + tinggi:");
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

  t("ACUAN masih sama dengan lembar INVOICE di berkas rujukan", () => {
    const g = wb.getWorksheet("INVOICE").getImages()[0];
    eq(g.range.tl.nativeColOff, ACUAN.colOff, "colOff:");
    eq(g.range.tl.nativeRowOff, ACUAN.rowOff, "rowOff:");
    eq(emuHasilExcelJs(g.range.ext.width), ACUAN.cx, "cx:");
    eq(emuHasilExcelJs(g.range.ext.height), ACUAN.cy, "cy:");
  });
  t("lembar PL rujukan memang BERBEDA — itu yang sengaja tidak diikuti", () => {
    const g = wb.getWorksheet("PL").getImages()[0];
    eq(g.range.tl.nativeRowOff, ACUAN_PL_RUJUKAN.rowOff, "rowOff PL:");
    eq(emuHasilExcelJs(g.range.ext.height), ACUAN_PL_RUJUKAN.cy, "cy PL:");
    if (ACUAN_PL_RUJUKAN.cy === ACUAN.cy)
      throw new Error("PL dan INVOICE ternyata sama — catatan di kode perlu dicabut");
  });
  t("kedua lembar rujukan menyeragamkan TEPI BAWAH logo", () => {
    /* Pembenaran untuk aturan di cipl-excel.js: yang dijaga tepi
       bawahnya, bukan tepi atasnya. Kalau rujukan berikutnya ternyata
       tidak begitu, aturan itu harus ditinjau ulang — bukan dipakai
       diam-diam pada berkas yang tidak mematuhinya. */
    ["INVOICE", "PL"].forEach((nm) => {
      const g = wb.getWorksheet(nm).getImages()[0];
      eq(g.range.tl.nativeRowOff + emuHasilExcelJs(g.range.ext.height),
        TEPI_BAWAH_EMU, nm + " tepi bawah:");
    });
  });
}

(async () => {
  await ujiKeluaranNyata();
  await ujiBerkasRujukan(process.argv[2]);
  console.log("\n" + lulus + " lulus, " + gagal + " gagal\n");
  process.exit(gagal ? 1 : 0);
})();
