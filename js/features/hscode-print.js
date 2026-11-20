"use strict";

/* CETAK & UNDUH EXCEL DAFTAR HS CODE

   Dari halaman HS Code: baris yang sedang tampil (kotak cari ikut
   berlaku, A-Z -- hsCodeTampil, hscode-view.js), SEMUA halamannya,
   bukan hanya halaman layar yang terbuka. Kolomnya sama di lembar cetak
   dan berkas Excel: NO, NAMA BARANG, HS CODE, TARIF BM, COO, LARTAS,
   CATATAN -- supaya keduanya bisa dicocokkan baris per baris.

   Lembar cetak meniru Stock Opname Masterlist (masterlist-print.js): kop
   perusahaan, A4 (tegak), halaman dipecah sendiri dengan mengukur tinggi
   baris di bingkai cetak (mstBagiHalaman -- fungsi murni yang sama),
   kepala tabel di tiap halaman, "Halaman 2 dari 5" di kaki. Teksnya
   berbahasa Indonesia apa pun bahasa tampilan -- hasil cetak adalah
   dokumen, bukan antarmuka.
*/

/* Lebar kolom (mm) -- jumlahnya = lebar isi lembar (210 - 2 x 10). */
const HSC_KOLOM = [
  { judul: "NO", lebar: 10, kelas: "hsc-tengah" },
  { judul: "NAMA BARANG", lebar: 53 },
  { judul: "HS CODE", lebar: 24, kelas: "hsc-tengah hsc-kode" },
  { judul: "TARIF BM", lebar: 17, kelas: "hsc-tengah" },
  // "N/A (Not Applicable)" muat sebaris
  { judul: "COO", lebar: 30, kelas: "hsc-tengah" },
  { judul: "LARTAS", lebar: 18, kelas: "hsc-tengah" },
  { judul: "CATATAN", lebar: 38 },
];
const HSC_CADANGAN_MM = 3;
const HSC_MM = 96 / 25.4;

/* ---------- data ---------- */

// Satu baris HS Code dalam bentuk dokumen -- sama untuk cetak & Excel
function hscBaris(r, i) {
  const tarif = angkaTarifBm(r.tarif_bm);
  return {
    no: i + 1,
    nama: String(r.item_name || "").trim(),
    kode: String(r.hs_code || "").trim(),
    tarif,
    tarifTeks: tarif == null ? "-" : `${formatNumberValue(tarif) || "0"}%`,
    coo: labelCooHs(r.coo, "id") || "-",
    lartas: rapikanLartas(r.lartas).join(", ") || "-",
    catatan: String(r.notes || "").trim(),
  };
}

function hscData() {
  const q = String(($("#hsCodeSearch") || {}).value || "").trim();
  return {
    baris: hsCodeTampil().map(hscBaris),
    total: hsCodeRows.length,
    cari: q,
    tanggal: todayISO(),
  };
}

/* ---------- potongan lembar ---------- */

const hscColgroup = () => `<colgroup>${HSC_KOLOM.map((k) => `<col style="width:${k.lebar}mm">`).join("")}</colgroup>`;
const hscKepala = (ukur) =>
  `<thead${ukur ? ' data-hsc-ukur="kepala"' : ""}><tr>${HSC_KOLOM.map((k) => `<th class="${k.kelas || ""}">${escapeHtml(k.judul)}</th>`).join("")}</tr></thead>`;

function hscBarisHtml(b, atribut) {
  const sel = (isi, i) => `<td class="${HSC_KOLOM[i].kelas || ""}">${escapeHtml(isi)}</td>`;
  return `<tr${atribut || ""}>${[b.no, b.nama, b.kode, b.tarifTeks, b.coo, b.lartas, b.catatan || "-"].map((v, i) => sel(String(v), i)).join("")}</tr>`;
}

function hscKop(data, pertama, ukur) {
  if (!pertama) {
    return `<header class="hsc-kop-ringkas"${ukur ? ' data-hsc-ukur="kop"' : ""}>
      <span><b>DAFTAR HS CODE</b></span>
      <span>${escapeHtml(SJ_PERUSAHAAN.nama)}</span>
    </header>`;
  }
  const cakupan = data.cari
    ? `${formatNumberValue(data.baris.length)} dari ${formatNumberValue(data.total)} HS Code — cari "${data.cari}"`
    : `${formatNumberValue(data.baris.length)} HS Code (semua)`;
  return `<div class="hsc-awal"${ukur ? ' data-hsc-ukur="kop-pertama"' : ""}>
    <header class="hsc-kop">
      <img class="hsc-logo" src="${SJ_LOGO}" alt="">
      <div>
        <div class="hsc-nama-pt">${escapeHtml(SJ_PERUSAHAAN.nama)}</div>
        <div class="hsc-alamat">${escapeHtml(SJ_PERUSAHAAN.pusat)}</div>
        <div class="hsc-alamat">${escapeHtml(SJ_PERUSAHAAN.cabang)}</div>
      </div>
      <div class="hsc-judul">
        <div class="hsc-judul-utama">DAFTAR HS CODE</div>
        <div class="hsc-judul-sub">Database HS Code</div>
      </div>
    </header>
    <div class="hsc-meta">
      <div><span class="hsc-l">Dicetak</span><b>${escapeHtml(fmtDate(data.tanggal))}</b></div>
      <div><span class="hsc-l">Baris dicetak</span><b>${escapeHtml(cakupan)}</b></div>
    </div>
  </div>`;
}

const hscKaki = (data, ke, dari, ukur) => `<footer class="hsc-kaki"${ukur ? ' data-hsc-ukur="kaki"' : ""}>
    <span>Daftar HS Code · dicetak ${escapeHtml(fmtDate(data.tanggal))}</span>
    <span>Halaman ${ke} dari ${dari}</span>
  </footer>`;

// Satu dokumen berisi semua potongan, untuk diukur di bingkai cetak
function hscUkurHtml(data) {
  return `<div class="hsc-ukur">
    <div class="hsc-ruang" data-hsc-ukur="ruang"></div>
    ${hscKop(data, true, true)}
    ${hscKop(data, false, true)}
    <table class="hsc-tabel" data-hsc-ukur="tabel">${hscColgroup()}${hscKepala(true)}<tbody>${data.baris.map((b, i) => hscBarisHtml(b, ` data-hsc-unit="${i}"`)).join("")}</tbody></table>
    ${hscKaki(data, 1, 1, true)}
  </div>`;
}

function hscUkur(doc, data) {
  const win = doc.defaultView;
  const tinggi = (el) => {
    if (!el) return 0;
    const cs = win.getComputedStyle(el);
    return el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  };
  const q = (k) => doc.querySelector(`[data-hsc-ukur="${k}"]`);
  const tabel = q("tabel");
  const tepiTabel = tabel ? parseFloat(win.getComputedStyle(tabel).borderBottomWidth) || 0 : 0;
  return {
    unit: data.baris.map((b, i) => ({ grup: false, tinggi: tinggi(doc.querySelector(`[data-hsc-unit="${i}"]`)) })),
    ukuran: {
      ruang: tinggi(q("ruang")),
      kopPertama: tinggi(q("kop-pertama")),
      kop: tinggi(q("kop")),
      kepala: tinggi(q("kepala")) + tepiTabel,
      kaki: tinggi(q("kaki")),
      ekor: 0,
      lanjutan: 0,
      adaGrup: false,
      cadangan: HSC_CADANGAN_MM * HSC_MM,
    },
  };
}

function hscLembarHtml(data, halaman) {
  const n = halaman.length;
  return halaman
    .map((idx, h) => `<div class="hsc-lembar">
        ${hscKop(data, h === 0, false)}
        <table class="hsc-tabel">${hscColgroup()}${hscKepala(false)}<tbody>${idx.map((i) => hscBarisHtml(data.baris[i])).join("")}</tbody></table>
        ${hscKaki(data, h + 1, n, false)}
      </div>`)
    .join("");
}

function hscCss() {
  const isiLebar = HSC_KOLOM.reduce((s, k) => s + k.lebar, 0);
  return `
  /* Margin nol: kop & kaki bawaan peramban tidak punya tempat; jarak ke
     tepi kertas = padding .hsc-lembar (masterlist-print.js). */
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hsc-lembar { width: 210mm; height: 297mm; padding: 10mm 10mm 8mm; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
  .hsc-lembar:last-child { break-after: auto; page-break-after: auto; }
  @media screen {
    body { background: #e5e7eb; }
    .hsc-lembar { background: #fff; margin: 6mm auto; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18); }
  }
  .hsc-ukur { position: absolute; left: -10000px; top: 0; width: ${isiLebar}mm; }
  .hsc-ruang { height: calc(297mm - 18mm); }
  .hsc-awal { margin-bottom: 3.5mm; }
  .hsc-kop { display: grid; grid-template-columns: 15mm minmax(0, 1fr) auto; align-items: center; column-gap: 4mm; padding-bottom: 2.5mm; border-bottom: 1.5px solid #000; }
  .hsc-logo { width: 15mm; height: 11.1mm; display: block; }
  .hsc-nama-pt { font-size: 12pt; font-weight: 700; }
  .hsc-alamat { font-size: 7pt; line-height: 1.35; }
  .hsc-judul { text-align: right; }
  .hsc-judul-utama { font-size: 13pt; font-weight: 700; letter-spacing: 0.4px; }
  .hsc-judul-sub { font-size: 8.5pt; margin-top: 1mm; }
  .hsc-meta { display: flex; flex-wrap: wrap; gap: 1.5mm 8mm; padding-top: 2.5mm; font-size: 8pt; }
  .hsc-l { color: #333; margin-right: 2mm; }
  .hsc-l::after { content: " :"; }
  .hsc-kop-ringkas { display: flex; justify-content: space-between; gap: 6mm; padding-bottom: 1.6mm; margin-bottom: 2.5mm; border-bottom: 1px solid #000; font-size: 8pt; }
  .hsc-tabel { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .hsc-tabel th, .hsc-tabel td { border-top: 1px solid #000; border-left: 1px solid #000; padding: 1.3mm 1.5mm; vertical-align: top; overflow-wrap: anywhere; }
  .hsc-tabel thead th { background: #d9d9d9; font-size: 7.5pt; font-weight: 700; text-align: center; vertical-align: middle; padding: 1.8mm 1mm; }
  .hsc-tabel tbody td { font-size: 8pt; line-height: 1.3; }
  .hsc-tengah { text-align: center; }
  .hsc-tabel tbody td.hsc-kode { font-family: "Courier New", monospace; font-weight: 700; white-space: nowrap; }
  .hsc-kaki { margin-top: auto; padding-top: 2mm; display: flex; justify-content: space-between; font-size: 7pt; color: #333; }
  `;
}

/* ---------- mencetak ---------- */

function cetakHsCode() {
  const data = hscData();
  if (!data.baris.length) {
    showToast(tt("Tidak ada HS Code untuk dicetak — kosongkan pencariannya dulu.", "There are no HS Codes to print — clear the search first."), "warning");
    return;
  }
  const judul = `Daftar HS Code ${fmtDate(data.tanggal)}`;
  return bukaModalCetak({
    jenis: tt("Daftar HS Code", "HS Code List"),
    nomor: tt(`${formatNumberValue(data.baris.length)} HS Code · ${fmtDate(data.tanggal)}`, `${formatNumberValue(data.baris.length)} HS Codes · ${fmtDate(data.tanggal)}`),
    judulBerkas: judul,
    muat: async () => `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>${escapeHtml(judul)}</title>
<style>${hscCss()}</style></head>
<body>${hscUkurHtml(data)}</body></html>`,
    // Diukur di bingkai cetak itu sendiri, lalu diganti lembar-lembar akhirnya
    siapkan: (dok) => {
      const ukur = hscUkur(dok, data);
      dok.body.innerHTML = hscLembarHtml(data, mstBagiHalaman(ukur.unit, ukur.ukuran));
    },
  });
}

/* ---------- unduh Excel ---------- */

const HSC_BULAN_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function hscNamaBerkas(iso) {
  const d = parseLocalDate(iso) || new Date();
  return `HS CODE DDI ${String(d.getDate()).padStart(2, "0")} ${HSC_BULAN_EN[d.getMonth()]} ${d.getFullYear()}.xlsx`;
}

/* Buku Excel dari data hscData() -- dipisah dari unduhannya supaya isinya
   bisa diuji (qa/hscode-coo-test.js). */
function hscWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();
  const ws = wb.addWorksheet("HS CODE");
  ws.columns = [6, 46, 14, 13, 24, 14, 40].map((width) => ({ width }));
  const tepi = { style: "thin", color: { argb: "FF000000" } };
  const bingkai = { top: tepi, left: tepi, bottom: tepi, right: tepi };
  const KIRI = [1, 6]; // nama barang & catatan rata kiri, boleh membungkus
  const tulis = (nomorBaris, nilai, tebal) => {
    nilai.forEach((v, i) => {
      const sel = ws.getCell(nomorBaris, i + 1);
      sel.value = v;
      sel.border = bingkai;
      sel.font = { name: "Calibri", size: 11, bold: !!tebal };
      sel.alignment = { vertical: "middle", horizontal: tebal || KIRI.indexOf(i) < 0 ? "center" : "left", wrapText: KIRI.indexOf(i) >= 0 };
    });
  };
  // Tarif BM sebagai ANGKA (5, 7.5) -- bisa dijumlah & disaring -- satuannya di judul kolom
  tulis(1, HSC_KOLOM.map((k) => (k.judul === "TARIF BM" ? "TARIF BM (%)" : k.judul)), true);
  HSC_KOLOM.forEach((k, i) => (ws.getCell(1, i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } }));
  ws.getRow(1).height = 24;
  data.baris.forEach((b, i) => {
    const n = i + 2;
    // HS Code TEKS: angka 0 di depan & titik pemisahnya tetap
    tulis(n, [b.no, b.nama, b.kode, b.tarif == null ? "-" : b.tarif, b.coo, b.lartas, b.catatan]);
    ws.getCell(n, 3).numFmt = "@";
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.baris.length + 1, column: HSC_KOLOM.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return wb;
}

async function unduhExcelHsCode() {
  const data = hscData();
  if (!data.baris.length) {
    showToast(tt("Tidak ada HS Code untuk diunduh — kosongkan pencariannya dulu.", "There are no HS Codes to download — clear the search first."), "warning");
    return;
  }
  try {
    await ensureExcelJS();
    const buf = await hscWorkbook(data).xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    tautan.download = hscNamaBerkas(data.tanggal);
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
    showToast(tt(`Berkas Excel diunduh: ${formatNumberValue(data.baris.length)} HS Code.`, `Excel file downloaded: ${formatNumberValue(data.baris.length)} HS Codes.`), "success");
  } catch (e) {
    console.error(e);
    showToast(tt("Berkas Excel gagal dibuat. Coba lagi.", "The Excel file could not be created. Try again."), "danger");
  }
}
