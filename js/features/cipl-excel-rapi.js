"use strict";

/* ==================================================================
   EXCEL CI / PL / SI -- KISI RAPI, MUDAH DISUNTING

   Tampilannya mengikuti lembar cetak (warna, huruf, kotak, urutan), tetapi
   kisinya sengaja SEDIKIT dan BERMAKNA, supaya berkasnya gampang disunting
   di Excel:

     CI & PL  A | B  C  D  E  F  G  H  I | J
              A & J = tepi dalam bingkai; B..I = 8 kolom tabel barang
              (No, Item, Type, HS Code, Qty, Unit, Harga/NW, Jumlah/GW).
              Semua kotak lain menumpang kolom yang sama -- Shipper &
              Consignee = B:E, Referensi & Notify = F:I, rincian
              pengiriman = B:C | D | E:G | H:I, tanda tangan = F:I.
     SI       A | B (penanda) C (label) D (:) E (isi) | F

   Satu baris teks = satu baris Excel dengan tinggi wajar; teks panjang
   memakai sel gabungan (2-4 kolom), bukan belasan kolom kecil. Angka
   ditulis sebagai ANGKA berformat (bisa dijumlah), teksnya sama dengan
   cetakan (ciplFormatUang / ciplFormatAngka).
================================================================== */

const RX_WARNA = {
  navy: "FF1F2A44", teks: "FF222222", abu: "FF777777", putih: "FFFFFFFF",
  garisRinci: "FFC8C8C8", garisRinciDalam: "FFE4E4E4", garisBarang: "FFE2E2E2",
  zebra: "FFFAFAFA", total: "FFEEEEEE",
};
// Lebar bidang isi di dalam bingkai (210 - 2x10 margin - 2x6 jarak dalam - garis)
const RX_ISI_MM = 177;
const RX_TABEL_PERSEN = [4, 18, 24, 12, 7, 7, 14, 14];

/* mm di kertas -> lebar kolom Excel. Excel menggambar kolom ~15% lebih
   lebar dari hitungan lebarnya (XLS_FAKTOR_LEBAR), jadi dibagi faktor itu
   supaya lembarnya pas selebar kertas pada skala 100%. */
const rxLebar = (mm) => Math.round(((mm * 72) / 25.4 / (XLS_LEBAR_HURUF_PX * 0.75) / XLS_FAKTOR_LEBAR) * 100) / 100;
const rxPt = (mm) => (mm * 72) / 25.4;

function rxGaya(sel, o) {
  sel.font = { name: o.huruf || "Arial", size: o.size || 8.5, bold: !!o.bold, italic: !!o.italic,
    underline: o.underline ? "single" : undefined, color: { argb: o.warna || RX_WARNA.teks } };
  sel.alignment = { horizontal: o.h || "left", vertical: o.v || "middle", wrapText: !!o.wrap, indent: o.indent || 0 };
  if (o.fill) sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
  if (o.numFmt) sel.numFmt = o.numFmt;
}

/* Tulis nilai ke rentang (digabung kalau lebih dari satu sel) */
function rxTulis(ws, r1, c1, r2, c2, nilai, o) {
  if (r2 > r1 || c2 > c1) ws.mergeCells(r1, c1, r2, c2);
  const sel = ws.getCell(r1, c1);
  sel.value = nilai == null ? "" : nilai;
  rxGaya(sel, o || {});
  return sel;
}

function rxIsi(ws, r1, c1, r2, c2, argb) {
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
}

/* Garis di sisi-sisi tertentu sebuah rentang (sisi = "atas","bawah","kiri","kanan") */
function rxGaris(ws, r1, c1, r2, c2, sisi, warna, gaya) {
  const g = { style: gaya || "thin", color: { argb: warna } };
  const pasang = (r, c, k) => {
    const sel = ws.getCell(r, c);
    sel.border = Object.assign({}, sel.border, { [k]: g });
  };
  if (sisi.indexOf("atas") >= 0) for (let c = c1; c <= c2; c++) pasang(r1, c, "top");
  if (sisi.indexOf("bawah") >= 0) for (let c = c1; c <= c2; c++) pasang(r2, c, "bottom");
  if (sisi.indexOf("kiri") >= 0) for (let r = r1; r <= r2; r++) pasang(r, c1, "left");
  if (sisi.indexOf("kanan") >= 0) for (let r = r1; r <= r2; r++) pasang(r, c2, "right");
}
const rxKotak = (ws, r1, c1, r2, c2, warna, gaya) => rxGaris(ws, r1, c1, r2, c2, ["atas", "bawah", "kiri", "kanan"], warna, gaya);

function rxHalaman(ws, kolomAkhir, barisAkhir) {
  const m = 10 / 25.4; // 10 mm
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: m, right: m, top: m, bottom: m, header: 0, footer: 0 },
    printArea: `A1:${kolomAkhir}${barisAkhir}`,
  };
}

/* Penghitung baris: setiap baris yang dipakai diberi tinggi eksplisit */
function rxBaris(ws) {
  let r = 1;
  return {
    get kini() { return r; },
    tambah(tinggi) { ws.getRow(r).height = tinggi; return r++; },
  };
}

/* ---------------- COMMERCIAL INVOICE & PACKING LIST ---------------- */
function rxLembarDd(wb, nama, jenis, row, shipment, baris) {
  const ws = wb.addWorksheet(nama, { views: [{ showGridLines: false }], properties: { defaultRowHeight: 15 } });
  const p = row.payload || {};
  const B = 2, E = 5, F = 6, I = 9, J = 10;
  [6].concat(RX_TABEL_PERSEN.map((x) => (RX_ISI_MM * x) / 100), [6]).forEach((mm, i) => (ws.getColumn(i + 1).width = rxLebar(mm)));
  const R = rxBaris(ws);

  R.tambah(rxPt(6)); // jarak dalam bingkai (atas)
  // JUDUL
  const rJudul = R.tambah(30);
  rxTulis(ws, rJudul, B, rJudul, I, jenis === "CI" ? ciplJudulInvoice(row) : "PACKING LIST", { size: 20, bold: true, h: "center" });
  rxGaris(ws, rJudul, B, rJudul, I, ["bawah"], RX_WARNA.teks, "medium");
  R.tambah(7.5);

  // KARTU: kepala biru tua + baris isi; dua kartu berdampingan berbagi baris
  const kepalaKartu = (r, c1, c2, teks) => rxTulis(ws, r, c1, r, c2, teks.toUpperCase(), { size: 7, bold: true, warna: RX_WARNA.putih, fill: RX_WARNA.navy, indent: 1 });
  const pasangKartu = (judulKiri, judulKanan, kiri, kanan, minBaris) => {
    const rK = R.tambah(15);
    kepalaKartu(rK, B, E, judulKiri);
    kepalaKartu(rK, F, I, judulKanan);
    const n = Math.max(kiri.length, kanan.length, minBaris || 1);
    const r0 = R.kini;
    for (let i = 0; i < n; i++) R.tambah(i === n - 1 ? 15.5 : 12.75);
    kiri.forEach((isi, i) => isi && isi(r0 + i, B, E));
    kanan.forEach((isi, i) => isi && isi(r0 + i, F, I));
    rxKotak(ws, rK, B, r0 + n - 1, E, RX_WARNA.navy);
    rxKotak(ws, rK, F, r0 + n - 1, I, RX_WARNA.navy);
  };
  const barisTeks = (arr) => arr.map((teks, i) => (r, c1, c2) =>
    rxTulis(ws, r, c1, r, c2, teks, { size: i === 0 ? 9 : 8.5, bold: i === 0, indent: 1, v: i === arr.length - 1 ? "top" : "middle" }));

  // Referensi dokumen: label abu-abu, lalu nomor (kiri) & tanggal (rata kanan) per baris
  const ref = [];
  ciplRefBaris(row).forEach(([label, isi], k) => {
    if (k) ref.push(null);
    ref.push((r, c1, c2) => rxTulis(ws, r, c1, r, c2, label.toUpperCase(), { size: 6.8, bold: true, warna: RX_WARNA.abu, indent: 1 }));
    isi.forEach((x) => ref.push((r) => {
      rxTulis(ws, r, F, r, 8, x.no, { size: 8.8, bold: true, indent: 1 });
      rxTulis(ws, r, I, r, I, x.tgl || "", { size: 8.8, bold: true, h: "right", indent: 1 });
    }));
  });
  pasangKartu("Shipper / Exporter", "Document reference", barisTeks(CIPL_SHIPPER), ref);
  R.tambah(7.5);
  pasangKartu("Consignee / Buyer", "Notify Party", barisTeks(ciplKonsigneeBaris(row, shipment)),
    barisTeks([p.notifyParty || "SAME AS CONSIGNEE"]), 4);
  R.tambah(7.5);

  // RINCIAN PENGIRIMAN: 2 pita x 4 kelompok kolom
  const kelompok = [[2, 3], [4, 4], [5, 7], [8, 9]];
  const rinci = ciplDdRincianData(row, shipment);
  const rRinci = R.kini;
  [0, 1].forEach((pita) => {
    const rL = R.tambah(11);
    const rV = R.tambah(15);
    kelompok.forEach(([c1, c2], k) => {
      const [label, nilai] = rinci[pita * 4 + k];
      rxTulis(ws, rL, c1, rL, c2, label.toUpperCase(), { size: 6.8, bold: true, warna: RX_WARNA.abu, indent: 1, v: "bottom" });
      rxTulis(ws, rV, c1, rV, c2, nilai || "—", { size: 9, bold: true, indent: 1, v: "top" });
      if (k < 3) rxGaris(ws, rL, c2, rV, c2, ["kanan"], RX_WARNA.garisRinciDalam);
    });
    if (pita === 0) rxGaris(ws, rV, B, rV, I, ["bawah"], RX_WARNA.garisRinciDalam);
  });
  rxKotak(ws, rRinci, B, R.kini - 1, I, RX_WARNA.garisRinci);
  R.tambah(9);

  // TABEL BARANG
  const ci = jenis === "CI";
  const kepala = ci ? ["No", "Item", "Type", "HS Code", "Qty", "Unit", "Unit Price", "Amount"]
    : ["No", "Item Description", "Type", "HS Code", "Qty", "Unit", "Net Weight", "Gross Weight"];
  const rKepala = R.tambah(20);
  kepala.forEach((k, i) => rxTulis(ws, rKepala, B + i, rKepala, B + i, k.toUpperCase(), { size: 7, bold: true, warna: RX_WARNA.putih, fill: RX_WARNA.navy, h: "center", wrap: true }));
  const uang = ciplFormatUang(p.currency || "USD", baris.flatMap((b) => [b.harga, b.amount]));
  const angka = (r, c, n, satuan, gaya) => {
    const f = ciplFormatAngka(n, satuan);
    rxTulis(ws, r, c, r, c, f.v, Object.assign({ h: "center", numFmt: f.f }, gaya));
  };
  // Perkiraan jumlah baris teks dalam sel (Arial 8,5pt ~1,75 mm per huruf)
  const barisDalam = (teks, mm) => String(teks || "").split("\n").reduce((x, isi) => x + Math.max(1, Math.ceil((isi.length * 1.75) / Math.max(10, mm - 3))), 0);
  const lebarMm = RX_TABEL_PERSEN.map((x) => (RX_ISI_MM * x) / 100);
  baris.forEach((b, i) => {
    const nama = ciplNamaDuaBaris(b.item).join("\n");
    const tinggi = Math.max(barisDalam(nama, lebarMm[1]), barisDalam(b.type, lebarMm[2]), 1) * 11 + 7;
    const r = R.tambah(tinggi);
    const g = { size: 8.5, h: "center", wrap: true };
    rxTulis(ws, r, B, r, B, i + 1, g);
    rxTulis(ws, r, 3, r, 3, nama, g);
    rxTulis(ws, r, 4, r, 4, b.type || "", g);
    // HS Code berupa angka murni -> angka (tanpa segitiga hijau "angka sebagai teks")
    const hs = String(b.hs || "");
    rxTulis(ws, r, 5, r, 5, /^[1-9]\d{3,11}$/.test(hs) ? Number(hs) : hs, Object.assign({ numFmt: /^[1-9]\d+$/.test(hs) ? "0" : undefined }, g));
    angka(r, 6, b.qty, "", g);
    rxTulis(ws, r, 7, r, 7, b.satuan || "", g);
    if (ci) {
      rxTulis(ws, r, 8, r, 8, Number(b.harga) || 0, Object.assign({ numFmt: uang.f }, g));
      rxTulis(ws, r, 9, r, 9, Number(b.amount) || 0, Object.assign({ numFmt: uang.f }, g));
    } else {
      angka(r, 8, b.netto, "KG", g);
      angka(r, 9, b.bruto, "KG", g);
    }
    if (i % 2 === 1) rxIsi(ws, r, B, r, I, RX_WARNA.zebra);
    rxGaris(ws, r, B, r, I, ["bawah"], RX_WARNA.garisBarang);
  });
  // TOTAL
  const rTotal = R.tambah(18);
  const satuan = [...new Set(baris.map((b) => b.satuan).filter(Boolean))];
  const gT = { size: 9, bold: true, h: "center", fill: RX_WARNA.total };
  rxTulis(ws, rTotal, B, rTotal, E, "TOTAL", Object.assign({}, gT, { h: "left", indent: 1 }));
  angka(rTotal, 6, baris.reduce((x, b) => x + (Number(b.qty) || 0), 0), "", gT);
  rxTulis(ws, rTotal, 7, rTotal, 7, satuan.length === 1 ? satuan[0] : "", gT);
  if (ci) {
    rxTulis(ws, rTotal, 8, rTotal, 8, "", gT);
    rxTulis(ws, rTotal, 9, rTotal, 9, baris.reduce((x, b) => x + b.amount, 0), Object.assign({ numFmt: uang.f }, gT));
  } else {
    angka(rTotal, 8, baris.reduce((x, b) => x + b.netto, 0), "KG", gT);
    angka(rTotal, 9, baris.reduce((x, b) => x + b.bruto, 0), "KG", gT);
  }
  rxGaris(ws, rTotal, B, rTotal, I, ["atas", "bawah"], RX_WARNA.navy, "medium");

  // RUANG PENGISI (mendorong bagian akhir ke dasar halaman)
  const rPengisi = R.tambah(20);

  // BAGIAN AKHIR: Packing details (PL, B:D) & tanda tangan (F:I, 50 mm)
  const kemasan = ci ? [] : ciplRincianKemasan(p, shipment, baris);
  const rA = R.kini;
  const nTeks = Math.max(1, kemasan.length);
  R.tambah(13); // for and on behalf of / kepala packing details
  R.tambah(13); // nama perusahaan / baris kemasan 1
  for (let i = 1; i < nTeks; i++) R.tambah(13); // baris kemasan berikutnya
  const rRuang = R.tambah(20); // ruang tanda tangan (disetel di bawah)
  const rTtd = R.tambah(14); // Authorized Signature
  rxTulis(ws, rA, F, rA, I, "For and on behalf of", { size: 8, h: "center" });
  rxTulis(ws, rA + 1, F, rA + 1, I, CIPL_PERUSAHAAN.nama, { size: 8.5, bold: true, h: "center", v: "top" });
  rxTulis(ws, rTtd, F, rTtd, I, "Authorized Signature", { size: 8, h: "center" });
  rxGaris(ws, rTtd, F, rTtd, I, ["atas"], RX_WARNA.teks);
  if (!ci) {
    rxTulis(ws, rA, B, rA, 4, "PACKING DETAILS", { size: 7, bold: true, warna: RX_WARNA.putih, fill: RX_WARNA.navy, h: "center" });
    (kemasan.length ? kemasan : [["—", false]]).forEach(([teks, tebal], i) =>
      rxTulis(ws, rA + 1 + i, B, rA + 1 + i, 4, teks, { size: 8.5, bold: tebal, indent: 1 }));
    rxKotak(ws, rA, B, rA + nTeks, 4, RX_WARNA.navy);
  }
  R.tambah(rxPt(5)); // jarak dalam bingkai (bawah)
  const rAkhir = R.kini - 1;

  // BINGKAI luar & halaman
  rxKotak(ws, 1, 1, rAkhir, J, RX_WARNA.teks, "medium");
  rxHalaman(ws, "J", rAkhir);
  // Kotak tanda tangan setinggi 50 mm di kertas: ruangnya = sisa dari baris lain
  const skala = ciplXlsSkalaCetak(ws);
  const lain = 13 * (1 + nTeks) + 14; // baris rA..(rRuang-1) + Authorized Signature
  ws.getRow(rRuang).height = Math.max(20, Math.round(((rxPt(XLS_TTD_MM) / skala) - lain) * 100) / 100);
  ciplXlsPenuhiHalaman(ws, rPengisi);
  return ws;
}

/* ---------------- SHIPPING INSTRUCTION ---------------- */
function rxLembarSi(wb, row, shipment, baris) {
  const ws = wb.addWorksheet("SI", { views: [{ showGridLines: false }], properties: { defaultRowHeight: 15 } });
  const d = ciplSiData(row, shipment, baris);
  const T = { huruf: "Times New Roman", size: 10.5 };
  // A jarak | B penanda | C label | D : | E isi | F jarak
  [9.5, 12.2, 51.3, 4.2, 103.3, 9.5].forEach((mm, i) => (ws.getColumn(i + 1).width = rxLebar(mm)));
  const R = rxBaris(ws);
  R.tambah(15);
  // KOP: logo + nama + alamat
  const rKop = R.tambah(28);
  R.tambah(13);
  R.tambah(13);
  if (typeof SJ_LOGO !== "undefined") {
    const id = wb.addImage({ base64: SJ_LOGO, extension: "png" });
    // Logo di kolom B (selebar penanda daftar), teks kop di C:E -- tidak bertumpuk
    ws.addImage(id, { tl: { col: 1.05, row: rKop - 1 + 0.1 }, ext: { width: 42, height: 46 } });
  }
  rxTulis(ws, rKop, 3, rKop, 5, CIPL_PERUSAHAAN.nama, Object.assign({}, T, { size: 19, bold: true, h: "center" }));
  // Alamat panjang: dikecilkan otomatis bila tidak muat (bukan terpotong)
  [CIPL_PERUSAHAAN.pusat, CIPL_PERUSAHAAN.cabang].forEach((teks, i) => {
    const sel = rxTulis(ws, rKop + 1 + i, 3, rKop + 1 + i, 5, teks, Object.assign({}, T, { size: 9, h: "center" }));
    sel.alignment = Object.assign({}, sel.alignment, { shrinkToFit: true });
  });
  R.tambah(27);
  const rJudul = R.tambah(22);
  rxTulis(ws, rJudul, 2, rJudul, 5, "SHIPPING INSTRUCTION", Object.assign({}, T, { size: 16, bold: true, underline: true, h: "center" }));
  const rNo = R.tambah(16);
  rxTulis(ws, rNo, 2, rNo, 5, `NO. ${d.no}`, Object.assign({}, T, { size: 11.5, bold: true, h: "center", v: "top" }));
  R.tambah(22.5);
  const rTo = R.tambah(18);
  rxTulis(ws, rTo, 2, rTo, 5, `To : ${d.tujuan}`, T);
  const rLead = R.tambah(22);
  rxTulis(ws, rLead, 2, rLead, 5, "Please arrange our shipment per description below :", Object.assign({}, T, { v: "top" }));
  // DAFTAR INSTRUKSI
  const barisDaftar = (label, nilai, o) => {
    const r = R.tambah(14.5);
    if (label != null) {
      if (!o.sub) rxTulis(ws, r, 2, r, 2, "❋", Object.assign({}, T, { size: 8.5, h: "right", indent: 1 }));
      rxTulis(ws, r, 3, r, 3, label, Object.assign({}, T, o.sub ? { size: 9.5 } : {}));
      if (!o.sub) rxTulis(ws, r, 4, r, 4, ":", T);
    }
    rxTulis(ws, r, 5, r, 5, nilai, Object.assign({}, T, { bold: !!o.tebal }));
  };
  CIPL_SI_BARIS.forEach((def) => {
    if (def.alamat) {
      const isi = d[def.alamat];
      barisDaftar(def.k, isi[0] || "", {});
      isi.slice(1).forEach((teks, i) => barisDaftar(i === 0 ? "Address" : null, teks, { sub: true }));
      if (isi.length < 2) barisDaftar("Address", "", { sub: true });
      return;
    }
    const nilai = ciplSiNilai(def, d);
    barisDaftar(def.k, `${nilai}${def.satuan && nilai ? `   ${def.satuan}` : ""}`, { tebal: def.tebal });
  });
  const rPengisi = R.tambah(20);
  // PENUTUP
  const rT1 = R.tambah(16);
  rxTulis(ws, rT1, 2, rT1, 5, "Thank you for your good cooperation.", T);
  R.tambah(9);
  const rKota = R.tambah(16);
  rxTulis(ws, rKota, 2, rKota, 5, `Cirebon, ${d.tanggal}`, T);
  const rSalam = R.tambah(16);
  rxTulis(ws, rSalam, 2, rSalam, 5, "Regards,", T);
  R.tambah(63);
  const rTtd = R.tambah(16);
  rxTulis(ws, rTtd, 2, rTtd, 5, "SIGN & STAMP", Object.assign({}, T, { bold: true, underline: true }));
  R.tambah(16.5);
  const rAkhir = R.kini - 1;
  rxKotak(ws, 1, 1, rAkhir, 6, "FF000000", "thin");
  rxHalaman(ws, "F", rAkhir);
  ciplXlsPenuhiHalaman(ws, rPengisi);
  return ws;
}

/* Ketiga lembar: CI, PL, SI */
function ciplXlsRapi(wb, row, shipment, baris) {
  rxLembarDd(wb, "CI", "CI", row, shipment, baris);
  rxLembarDd(wb, "PL", "PL", row, shipment, baris);
  rxLembarSi(wb, row, shipment, baris);
}
