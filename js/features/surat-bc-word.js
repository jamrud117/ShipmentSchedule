"use strict";

/* ==================================================================
   UNDUH SURAT BEA CUKAI SEBAGAI MS WORD (.docx)

   Tata letaknya sama dengan surat cetak (surat-bc.js): kop (logo, nama,
   alamat Pusat/Cabang, garis tebal-tipis), judul & nomor / Nomor-
   Lampiran-Perihal, isi rata kanan-kiri, daftar "label : isi", tabel
   barang dengan foto, dan blok tanda tangan yang menempel ke margin
   kanan -- tetapi bisa disunting di Word.

   Berkas .docx disusun langsung dari XML-nya (WordprocessingML) dan
   dibungkus ZIP tanpa kompresi -- tanpa pustaka tambahan. Isi suratnya
   diambil dari pembangun yang sama dengan versi cetak, jadi keduanya
   tidak bisa berbeda.
================================================================== */

/* ---------- ZIP tanpa kompresi (metode "store") ---------- */
const WORD_CRC = (() => {
  const tabel = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c >>> 0;
  }
  return tabel;
})();
function wordCrc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = WORD_CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function wordZip(berkas) {
  const enc = new TextEncoder();
  const bagian = [];
  const pusat = [];
  let posisi = 0;
  const tanggalDos = ((2026 - 1980) << 9) | (1 << 5) | 1;
  berkas.forEach(({ nama, data }) => {
    const n = enc.encode(nama);
    const isi = typeof data === "string" ? enc.encode(data) : data;
    const crc = wordCrc32(isi);
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true);
    lokal.setUint16(4, 20, true);
    lokal.setUint16(10, 0, true);
    lokal.setUint16(12, tanggalDos, true);
    lokal.setUint32(14, crc, true);
    lokal.setUint32(18, isi.length, true);
    lokal.setUint32(22, isi.length, true);
    lokal.setUint16(26, n.length, true);
    bagian.push(new Uint8Array(lokal.buffer), n, isi);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(14, tanggalDos, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, isi.length, true);
    c.setUint32(24, isi.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, posisi, true);
    pusat.push(new Uint8Array(c.buffer), n);
    posisi += 30 + n.length + isi.length;
  });
  const besarPusat = pusat.reduce((x, b) => x + b.length, 0);
  const akhir = new DataView(new ArrayBuffer(22));
  akhir.setUint32(0, 0x06054b50, true);
  akhir.setUint16(8, berkas.length, true);
  akhir.setUint16(10, berkas.length, true);
  akhir.setUint32(12, besarPusat, true);
  akhir.setUint32(16, posisi, true);
  const semua = bagian.concat(pusat, [new Uint8Array(akhir.buffer)]);
  const out = new Uint8Array(semua.reduce((x, b) => x + b.length, 0));
  let i = 0;
  semua.forEach((b) => {
    out.set(b, i);
    i += b.length;
  });
  return out;
}

/* ---------- gambar: data URL -> byte + ukuran piksel ---------- */
function wordGambar(dataUrl) {
  const m = String(dataUrl || "").match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!m) return null;
  const bin = atob(m[2]);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  let w = 0;
  let h = 0;
  if (/png/i.test(m[1])) {
    w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
  } else {
    for (let i = 2; i < b.length - 9; ) {
      if (b[i] !== 0xff) { i++; continue; }
      const penanda = b[i + 1];
      const pjg = (b[i + 2] << 8) | b[i + 3];
      if (penanda >= 0xc0 && penanda <= 0xcf && penanda !== 0xc4 && penanda !== 0xc8 && penanda !== 0xcc) {
        h = (b[i + 5] << 8) | b[i + 6];
        w = (b[i + 7] << 8) | b[i + 8];
        break;
      }
      i += 2 + pjg;
    }
  }
  return { data: b, ext: /png/i.test(m[1]) ? "png" : "jpeg", w: w || 1, h: h || 1 };
}

/* ---------- pembangun WordprocessingML ---------- */
const wordEsc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MM = (mm) => Math.round((mm * 1440) / 25.4); // mm -> twip (dxa)
const EMU = (mm) => Math.round(mm * 36000);

function wordRun(teks, o) {
  const opsi = o || {};
  // Urutan anak rPr menurut skema OOXML: b, sz, szCs, u
  const rpr = [opsi.b ? "<w:b/>" : "", opsi.sz ? `<w:sz w:val="${opsi.sz * 2}"/><w:szCs w:val="${opsi.sz * 2}"/>` : "", opsi.u ? '<w:u w:val="single"/>' : ""].join("");
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${wordEsc(teks)}</w:t></w:r>`;
}
function wordPar(isi, o) {
  const opsi = o || {};
  // Urutan anak pPr menurut skema OOXML: pBdr, spacing, ind, jc
  const ppr = [
    opsi.garisKop ? '<w:pBdr><w:bottom w:val="thickThinSmallGap" w:sz="18" w:space="1" w:color="000000"/></w:pBdr>' : "",
    `<w:spacing w:before="${MM(opsi.sebelum || 0)}" w:after="${MM(opsi.sesudah || 0)}" w:line="${opsi.baris || 290}" w:lineRule="auto"/>`,
    opsi.ind ? `<w:ind w:left="${MM(opsi.ind)}"/>` : "",
    opsi.jc ? `<w:jc w:val="${opsi.jc}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${ppr}</w:pPr>${Array.isArray(isi) ? isi.join("") : isi || ""}</w:p>`;
}
function wordTabel(kolomMm, baris, o) {
  const opsi = o || {};
  const garis = opsi.bergaris
    ? ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`).join("")
    : ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="nil"/>`).join("");
  const lebar = kolomMm.reduce((x, y) => x + MM(y), 0);
  const margin = opsi.bergaris ? MM(2) : 0;
  return `<w:tbl><w:tblPr><w:tblW w:w="${lebar}" w:type="dxa"/>${opsi.jc ? `<w:jc w:val="${opsi.jc}"/>` : ""}${opsi.ind ? `<w:tblInd w:w="${MM(opsi.ind)}" w:type="dxa"/>` : ""}<w:tblBorders>${garis}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${opsi.bergaris ? MM(1.2) : 0}" w:type="dxa"/><w:left w:w="${margin}" w:type="dxa"/><w:bottom w:w="${opsi.bergaris ? MM(1.2) : 0}" w:type="dxa"/><w:right w:w="${margin}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${kolomMm.map((k) => `<w:gridCol w:w="${MM(k)}"/>`).join("")}</w:tblGrid>${baris
    .map((sel, r) => `<w:tr>${opsi.kepala && r === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${sel
      .map((isi, c) => `<w:tc><w:tcPr><w:tcW w:w="${MM(kolomMm[c])}" w:type="dxa"/>${opsi.kepala && r === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>' : ""}${opsi.tengah ? '<w:vAlign w:val="center"/>' : ""}</w:tcPr>${isi || wordPar("")}</w:tc>`)
      .join("")}</w:tr>`)
    .join("")}</w:tbl>`;
}

/* Satu dokumen: kumpulkan gambar (rId) sambil menyusun isinya */
function wordDokumen() {
  const media = [];
  return {
    media,
    gambar(dataUrl, lebarMm, tinggiMaksMm) {
      const g = wordGambar(dataUrl);
      if (!g) return "";
      media.push(g);
      const id = media.length;
      let w = lebarMm;
      let h = (lebarMm * g.h) / g.w;
      if (tinggiMaksMm && h > tinggiMaksMm) {
        h = tinggiMaksMm;
        w = (tinggiMaksMm * g.w) / g.h;
      }
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${EMU(w)}" cy="${EMU(h)}"/><wp:docPr id="${id}" name="Gambar ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="gambar${id}.${g.ext === "png" ? "png" : "jpg"}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU(w)}" cy="${EMU(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    },
  };
}

/* Kop: logo + nama + alamat, berpusat; ditutup garis tebal-tipis */
function wordKop(dok) {
  const kop = typeof SJ_PERUSAHAAN !== "undefined" ? SJ_PERUSAHAAN : { nama: SURAT_BC_PERUSAHAAN.nama, pusat: "", cabang: "" };
  const logo = typeof SJ_LOGO !== "undefined" ? dok.gambar(SJ_LOGO, 20, 22) : "";
  return wordTabel([26, 120], [[
    wordPar(logo, { jc: "center" }),
    [wordPar(wordRun(kop.nama, { b: true, sz: 20 }), { jc: "center", baris: 240 }),
      wordPar(wordRun(kop.pusat, { sz: 9.5 }), { jc: "center", baris: 240 }),
      wordPar(wordRun(kop.cabang, { sz: 9.5 }), { jc: "center", baris: 240 })].join(""),
  ]], { jc: "center", tengah: true }) + wordPar("", { garisKop: true, sesudah: 5, baris: 120 });
}

/* Daftar "label : isi" (tanpa garis), menjorok 8 mm */
const wordDaftar = (baris) => wordTabel([50, 6, 102], baris.map(([k, v]) => [wordPar(wordRun(k)), wordPar(wordRun(":")), wordPar(wordRun(v || "-"))]), { ind: 8 });

/* Blok tanda tangan menempel ke margin kanan: lebarnya diperkirakan dari
   baris terpanjangnya (Times 12pt, ±1,9 mm per huruf) -- seperti versi
   cetak yang selebar isinya. */
function wordTtd(p, tanggal) {
  const baris = [`${SURAT_BC_PERUSAHAAN.kota}, ${suratTanggalPanjang(tanggal)}`, "Hormat kami,", String(p.signer || "").toUpperCase(), String(p.signerTitle || "")];
  const lebar = Math.min(85, Math.max(42, Math.max(...baris.map((x) => x.length)) * 1.9 + 3));
  return wordTabel([lebar], [[[
    wordPar(wordRun(baris[0])),
    wordPar(wordRun(baris[1])),
    wordPar(wordRun(baris[2], { b: true, u: true }), { sebelum: 21 }),
    wordPar(wordRun(baris[3])),
  ].join("")]], { jc: "right" });
}

/* document.xml surat (isi sama dengan suratBcHtml) */
function suratBcDocxXml(row) {
  const p = row.payload || {};
  const tgl = row.doc_date || "";
  const nomor = row.doc_number || "";
  const moda = suratModa(p);
  const dok = wordDokumen();
  const isi = [wordKop(dok)];
  const rata = (teks) => wordPar(wordRun(teks), { jc: "both", sesudah: 2.6 });
  if (p.letterType === SURAT_BC_TANPA_BAYAR) {
    isi.push(
      wordPar(wordRun("SURAT PERNYATAAN TANPA BUKTI BAYAR", { b: true, u: true, sz: 13 }), { jc: "center", sebelum: 4 }),
      wordPar(wordRun(`Nomor : ${nomor}`), { jc: "center", sesudah: 5 }),
      wordPar(wordRun("Yang bertanda tangan di bawah ini :"), { sesudah: 1 }),
      wordDaftar([["Nama", String(p.signer || "").toUpperCase()], ["Jabatan", String(p.signerTitle || "").toUpperCase()],
        ["Nama Perusahaan", SURAT_BC_PERUSAHAAN.nama], ["Alamat", SURAT_BC_PERUSAHAAN.alamat.toUpperCase()]]),
      wordPar(wordRun("Dengan ini menyatakan bahwa barang kiriman kami dengan data sebagai berikut :"), { sebelum: 3.6, sesudah: 1 }),
      wordDaftar([["Nomor Aju", p.noAju], ["MAWB / HAWB", p.awb], ["Nama Barang", p.namaBarang], ["Koli / Berat", p.koliBerat],
        [suratLabelAngkut(moda, " / Tanggal"), p.flightTiba], ["Negara Asal", p.negaraAsal], ["Nilai Barang", p.nilaiBarang]]),
      wordPar([wordRun("tidak memiliki bukti bayar, karena pembayaran kepada pengirim baru akan dilakukan pada tanggal "),
        wordRun(suratTanggalPanjang(p.tglBayar) || "-", { b: true }),
        wordRun(" sesuai termin pembayaran yang disepakati. Dengan ini kami menyatakan tidak mempunyai bukti bayar (dokumentasi pembayaran) kepada pengirim atas barang tersebut di atas.")],
      { jc: "both", sebelum: 3.6, sesudah: 2.6 }),
      rata("Demikian surat pernyataan ini kami buat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya. Atas bantuan dan kebijaksanaan Bapak/Ibu, kami ucapkan terima kasih."),
      wordPar("", { sesudah: 4 }),
      wordTtd(p, tgl),
    );
  } else {
    const barang = (p.itemsFungsi || []).filter((b) => b && (b.nama || b.fungsi || b.foto));
    isi.push(
      wordTabel([24, 5, 82, 55], [
        [wordPar(wordRun("Nomor")), wordPar(wordRun(":")), wordPar(wordRun(nomor)), wordPar(wordRun(`${SURAT_BC_PERUSAHAAN.kota}, ${suratTanggalPanjang(tgl)}`), { jc: "right" })],
        [wordPar(wordRun("Lampiran")), wordPar(wordRun(":")), wordPar(wordRun(barang.some((b) => b.foto) ? "Foto barang" : "-")), wordPar("")],
        [wordPar(wordRun("Perihal")), wordPar(wordRun(":")), wordPar(wordRun(p.subject || "Keterangan Fungsi Barang")), wordPar("")],
      ]),
      wordPar(wordRun("SURAT KETERANGAN FUNGSI BARANG", { b: true, u: true, sz: 13 }), { jc: "center", sebelum: 9, sesudah: 6 }),
      wordPar(wordRun("Dengan hormat,"), { sesudah: 2.6 }),
      rata(`Menunjuk ${p.recipient || "Kantor Pelayanan Utama Bea dan Cukai"} perihal permintaan data dan keterangan tambahan, bersama ini kami sampaikan penjelasan sebagai berikut :`),
      wordDaftar([["Nomor Pengajuan", p.noAju], ["Invoice", p.invoiceRef], ["Shipper", p.shipper], ["Total Barang", p.koliBerat],
        ["Jenis Barang", p.namaBarang], ["No. AWB / BL", p.awb], ["Negara Asal", p.negaraAsal], [suratLabelAngkut(moda, " & Tanggal Tiba"), p.flightTiba]]),
      wordPar("", { sesudah: 1.5, baris: 120 }),
      wordTabel([10, 36, 80, 40], [
        ["No.", "Nama Barang", "Fungsi Barang", "Foto"].map((x) => wordPar(wordRun(x, { b: true, sz: 11 }), { jc: "center" })),
      ].concat((barang.length ? barang : [{}]).map((b, i) => [
        wordPar(wordRun(String(i + 1), { sz: 11 }), { jc: "center" }),
        wordPar(wordRun(b.nama || "", { b: true, sz: 11 })) + (b.hs ? wordPar(wordRun(`HS Code : ${b.hs}`, { sz: 10 }), { sebelum: 2 }) : ""),
        wordPar(wordRun(b.fungsi || "", { sz: 11 }), { jc: "both" }),
        wordPar(b.foto ? dok.gambar(b.foto, 36, 34) : "", { jc: "center" }),
      ])), { bergaris: true, kepala: true }),
      wordPar("", { sesudah: 2, baris: 120 }),
      rata("Demikian keterangan ini kami sampaikan sebagai bahan pertimbangan. Atas perhatian dan bantuan Bapak/Ibu, kami ucapkan terima kasih."),
      wordPar("", { sesudah: 4 }),
      wordTtd(p, tgl),
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${isi.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${MM(14)}" w:right="${MM(22)}" w:bottom="${MM(12)}" w:left="${MM(22)}" w:header="${MM(8)}" w:footer="${MM(8)}" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return { xml, media: dok.media };
}

/* Berkas .docx lengkap (Uint8Array) */
function suratBcDocx(row) {
  const { xml, media } = suratBcDocxXml(row);
  const berkas = [
    { nama: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { nama: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { nama: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${wordEsc(row.doc_number || "Surat")}</dc:title><dc:creator>${wordEsc(SURAT_BC_PERUSAHAAN.nama)}</dc:creator></cp:coreProperties>` },
    { nama: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media
      .map((g, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/gambar${i + 1}.${g.ext}"/>`)
      .join("")}</Relationships>` },
    { nama: "word/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="290" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>` },
    { nama: "word/document.xml", data: xml },
  ].concat(media.map((g, i) => ({ nama: `word/media/gambar${i + 1}.${g.ext}`, data: g.data })));
  return wordZip(berkas);
}

function unduhSuratWord(rowId) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row || !suratBcBolehCetak(row)) {
    showToast(tt("Data surat tidak ditemukan.", "Letter data not found."), "danger");
    return;
  }
  const blob = new Blob([suratBcDocx(row)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const nama = typeof ciplNamaBerkas === "function" ? ciplNamaBerkas(row.doc_number) : String(row.doc_number || "Surat").replace(/[\\/:*?"<>|]+/g, "-");
  const tautan = document.createElement("a");
  tautan.href = URL.createObjectURL(blob);
  tautan.download = `${nama}.docx`;
  document.body.appendChild(tautan);
  tautan.click();
  setTimeout(() => {
    URL.revokeObjectURL(tautan.href);
    tautan.remove();
  }, 1000);
}
