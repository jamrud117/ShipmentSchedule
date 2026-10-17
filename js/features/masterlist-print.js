"use strict";

/* CETAK STOCK OPNAME MASTERLIST

   Lembar hitung fisik dari halaman Masterlist: baris yang sedang tampil
   (saringan cari / status / lini / jenis ikut berlaku), dikelompokkan per
   lini proses supaya tim opname bisa berjalan satu lini sekali jalan.
   Kolomnya mengikuti berkas Excel unduhan -- NO s.d. PIB AJU, PIB DATE --
   ditambah ACTUAL QTY dan REMARKS yang SENGAJA kosong untuk diisi tangan.
   Kertas A4 mendatar (landscape).

   HALAMAN DIPECAH SENDIRI, tidak diserahkan ke peramban. Margin @page
   harus nol supaya kop & kaki bawaan peramban ("about:blank", tanggal)
   tidak ikut tercetak -- lihat surat-jalan-print.js. Tanpa margin,
   halaman 2 dst. dari tabel yang dipecah peramban akan menempel ke tepi
   kertas. Jadi tinggi tiap baris diukur dulu di jendela cetak, lalu
   baris dibagikan ke lembar-lembar seukuran kertas (mstBagiHalaman),
   masing-masing berkepala tabel, bernomor "Halaman 2 dari 5", dan
   berkolom paraf. Total & tanda tangan selalu di halaman terakhir,
   tidak pernah terpisah sendirian dari tabelnya.

   Teks lembarnya berbahasa Indonesia apa pun bahasa tampilan -- hasil
   cetak adalah dokumen, bukan antarmuka. Judul kolom tabelnya sama
   dengan berkas Excel supaya keduanya bisa dicocokkan baris per baris.
*/

/* Lebar kolom (mm) -- jumlahnya = lebar isi lembar (297 - 2 x 10). */
const SO_KOLOM = [
  { judul: "NO", lebar: 9, kelas: "so-no" },
  { judul: "DESCRIPTION", lebar: 44 },
  { judul: "SPECIFICATION OF GOODS", lebar: 52 },
  { judul: "UoM", lebar: 10, kelas: "so-tengah" },
  { judul: "QTTY", lebar: 11, kelas: "so-angka" },
  { judul: "USED", lebar: 11, kelas: "so-angka" },
  { judul: "REMAIN", lebar: 13, kelas: "so-angka" },
  { judul: "PIB AJU", lebar: 45, kelas: "so-pib" },
  { judul: "PIB DATE", lebar: 18, kelas: "so-pib so-tengah" },
  { judul: "ACTUAL QTY", lebar: 22, kelas: "so-isi so-isi-awal" },
  { judul: "REMARKS", lebar: 42, kelas: "so-isi" },
];
const SO_CADANGAN_MM = 3; // selisih kecil ukuran layar vs cetak tidak boleh menumpahkan baris
const SO_MM = 96 / 25.4;

const SO_LABEL_STATUS = {
  sisa: "Masih ada sisa",
  habis: "Habis",
  pakai: "Ada realisasi",
  utuh: "Belum dipakai",
  nilai: "Nilai perlu dicek",
};

const soAngka = (n) => angkaLokal(mstBulat(n), "id-ID", { maximumFractionDigits: 3 });

/* ---------- data ---------- */

/* Baris yang tampil di layar, per lini proses. Urutan lini mengikuti
   nomor baris pertamanya, isi tiap lini urut nomor -- jadi lembarnya
   tetap sedekat mungkin dengan urutan masterlist. */
function mstCetakData() {
  const f = mstSaringan();
  const semua = mstSusun();
  const baris = semua.filter((b) => mstCocok(b, f));
  const peta = new Map();
  baris.forEach((b) => {
    const kunci = b.lini || "";
    if (!peta.has(kunci)) peta.set(kunci, []);
    peta.get(kunci).push(b);
  });
  const kelompok = [...peta.entries()].map(([lini, isi]) => ({ lini, isi }));
  const saringan = [
    f.q ? `cari "${f.q}"` : "",
    SO_LABEL_STATUS[f.status] || "",
    f.lini ? `lini ${f.lini}` : "",
    f.jenis ? `jenis ${f.jenis.nama}` : "",
  ].filter(Boolean);
  return {
    dok: mstDok || {},
    baris,
    total: semua.length,
    kelompok,
    adaGrup: kelompok.some((g) => g.lini),
    saringan,
    tanggal: todayISO(),
  };
}

/* Baris tbody berurutan: judul lini lalu baris-barisnya. */
function mstCetakUnit(data) {
  const unit = [];
  data.kelompok.forEach((g, gi) => {
    if (data.adaGrup) unit.push({ grup: true, gi });
    g.isi.forEach((b) => unit.push({ grup: false, gi, b }));
  });
  return unit;
}

/* Jumlah per satuan -- "3 NIU" dan "1 SET" tidak dijumlahkan jadi 4. */
function mstCetakTotal(baris) {
  const peta = new Map();
  baris.forEach((b) => {
    const s = b.satuan || "";
    const jml = peta.get(s) || { satuan: s, kuota: 0, terpakai: 0, sisa: 0 };
    jml.kuota += b.kuota;
    jml.terpakai += b.terpakai;
    jml.sisa += b.sisa;
    peta.set(s, jml);
  });
  return [...peta.values()];
}

/* ---------- pembagian halaman ---------- */

/* Murni (tanpa DOM), jadi bisa diuji dengan angka.
   unit: [{ tinggi, grup }] dalam px, berurutan (grup = baris judul lini).
   u: ruang (tinggi isi lembar), kopPertama, kop, kepala (kepala tabel),
      kaki, ekor (total + tanda tangan), lanjutan (judul lini yang diulang
      di awal halaman), adaGrup, cadangan.
   Hasil: array halaman, masing-masing berisi indeks unit. */
function mstBagiHalaman(unit, u) {
  // Tanpa ukuran tata letak (tidak ada yang tergambar) semuanya satu lembar
  if (!(u.ruang > 0)) return [unit.map((x, i) => i)];
  const ruang = (n) => u.ruang - (n === 0 ? u.kopPertama : u.kop) - u.kepala - u.kaki - (u.cadangan || 0);
  const ulangJudul = (i) => (u.adaGrup && unit[i] && !unit[i].grup ? u.lanjutan || 0 : 0);
  const halaman = [];
  let isi = [];
  let tinggi = 0;
  unit.forEach((x, i) => {
    // Judul lini ditimbang bersama baris pertamanya: tidak boleh tertinggal sendirian di dasar halaman
    const berikut = unit[i + 1];
    const perlu = x.tinggi + (x.grup && berikut && !berikut.grup ? berikut.tinggi : 0);
    if (isi.length && tinggi + perlu > ruang(halaman.length)) {
      halaman.push(isi);
      isi = [];
      tinggi = ulangJudul(i);
    }
    isi.push(i);
    tinggi += x.tinggi;
  });
  /* Total & tanda tangan harus muat di halaman terakhir. Kalau tidak,
     baris terakhir (berikut judul lininya kalau jadi yatim) ikut pindah
     ke halaman baru -- ekornya tidak tercetak sendirian. */
  if (isi.length && tinggi + u.ekor > ruang(halaman.length)) {
    const pindah = [isi.pop()];
    if (isi.length && unit[isi[isi.length - 1]].grup) pindah.unshift(isi.pop());
    if (isi.length) {
      halaman.push(isi);
      isi = pindah;
    } else {
      halaman.push(pindah);
      isi = [];
    }
  }
  halaman.push(isi);
  return halaman;
}

/* ---------- potongan lembar ---------- */

function mstCetakColgroup() {
  return `<colgroup>${SO_KOLOM.map((k) => `<col style="width:${k.lebar}mm">`).join("")}</colgroup>`;
}

function mstCetakKepalaTabel(ukur) {
  return `<thead${ukur ? ' data-so-ukur="kepala"' : ""}><tr>${SO_KOLOM.map(
    (k) => `<th class="${k.kelas || ""}">${escapeHtml(k.judul)}</th>`,
  ).join("")}</tr></thead>`;
}

function mstCetakJudulLini(data, gi, lanjutan, atribut) {
  const g = data.kelompok[gi];
  const nama = g.lini || "Lini proses tidak tercantum";
  const ket = lanjutan ? "lanjutan" : `${soAngka(g.isi.length)} baris`;
  return `<tr class="so-grup"${atribut || ""}><td colspan="${SO_KOLOM.length}">${escapeHtml(nama)} <span>· ${escapeHtml(ket)}</span></td></tr>`;
}

function mstCetakBarisHtml(b, atribut) {
  const pibs = mstPibBaris(b);
  const sel = (isi, kelas) => `<td class="${kelas || ""}">${isi}</td>`;
  const daftar = (nilai) => nilai.map((v) => `<div>${escapeHtml(v)}</div>`).join("");
  return `<tr${atribut || ""}>${[
    sel(escapeHtml(b.no), "so-no"),
    sel(escapeHtml(b.nama)),
    sel(escapeHtml(mstSpekRingkas(b.spek))),
    sel(escapeHtml(b.satuan), "so-tengah"),
    sel(escapeHtml(soAngka(b.kuota)), "so-angka"),
    sel(escapeHtml(soAngka(b.terpakai)), "so-angka"),
    sel(escapeHtml(soAngka(b.sisa)), "so-angka"),
    sel(daftar(pibs.map((p) => p.aju)), "so-pib"),
    sel(daftar(pibs.map((p) => (p.tanggal ? fmtDate(p.tanggal) : "-"))), "so-pib so-tengah"),
    sel("", "so-isi so-isi-awal"),
    sel("", "so-isi"),
  ].join("")}</tr>`;
}

function mstCetakTfoot(data, ukur) {
  const total = mstCetakTotal(data.baris);
  const daftar = (f) => total.map((jml) => `<div>${escapeHtml(f(jml))}</div>`).join("");
  return `<tfoot${ukur ? ' data-so-ukur="tfoot"' : ""}><tr>
    <td colspan="3" class="so-total-label">TOTAL</td>
    <td class="so-tengah">${daftar((jml) => jml.satuan)}</td>
    <td class="so-angka">${daftar((jml) => soAngka(jml.kuota))}</td>
    <td class="so-angka">${daftar((jml) => soAngka(jml.terpakai))}</td>
    <td class="so-angka">${daftar((jml) => soAngka(jml.sisa))}</td>
    <td colspan="2"></td>
    <td class="so-isi so-isi-awal"></td>
    <td class="so-isi"></td>
  </tr></tfoot>`;
}

function mstCetakKop(data, pertama, ukur) {
  const dok = data.dok;
  const nama = dok.name || "Masterlist";
  if (!pertama) {
    return `<header class="so-kop-ringkas"${ukur ? ' data-so-ukur="kop"' : ""}>
      <span><b>STOCK OPNAME MASTERLIST</b> · ${escapeHtml(nama)}</span>
      <span>${escapeHtml(SJ_PERUSAHAAN.nama)}</span>
    </header>`;
  }
  const isian = (label, nilai, tangan) =>
    `<div class="so-f"><span class="so-l">${escapeHtml(label)}</span><span class="so-v${tangan ? " so-v--isi" : ""}">${tangan ? "" : escapeHtml(nilai || "-")}</span></div>`;
  const cakupan = data.saringan.length
    ? `${soAngka(data.baris.length)} dari ${soAngka(data.total)} baris — ${data.saringan.join(" · ")}`
    : `${soAngka(data.baris.length)} baris (semua baris)`;
  return `<div class="so-awal"${ukur ? ' data-so-ukur="kop-pertama"' : ""}>
    <header class="so-kop">
      <img class="so-logo" src="${SJ_LOGO}" alt="">
      <div class="so-perusahaan">
        <div class="so-nama-pt">${escapeHtml(SJ_PERUSAHAAN.nama)}</div>
        <div class="so-alamat">${escapeHtml(SJ_PERUSAHAAN.pusat)}</div>
        <div class="so-alamat">${escapeHtml(SJ_PERUSAHAAN.cabang)}</div>
      </div>
      <div class="so-judul">
        <div class="so-judul-utama">STOCK OPNAME MASTERLIST</div>
        <div class="so-judul-sub">${escapeHtml(nama)}</div>
      </div>
    </header>
    <div class="so-meta">
      ${isian("No. SK", dok.sk_no)}
      ${isian("Tanggal SK", dok.sk_date ? fmtDate(dok.sk_date) : "")}
      ${isian("Berlaku s/d", dok.valid_until ? fmtDate(dok.valid_until) : "")}
      ${isian("Tanggal opname", "", true)}
      <div class="so-f so-f--lebar"><span class="so-l">Baris dicetak</span><span class="so-v">${escapeHtml(cakupan)}</span></div>
      ${isian("Lokasi", "", true)}
    </div>
  </div>`;
}

function mstCetakEkor(ukur) {
  const ttd = (label) => `<div class="so-ttd">
      <div class="so-ttd-label">${escapeHtml(label)}</div>
      <div class="so-ttd-nama">( ............................................ )</div>
      <div class="so-ttd-tgl">Tanggal :</div>
    </div>`;
  return `<section class="so-ekor"${ukur ? ' data-so-ukur="ekor"' : ""}>
    <div class="so-catatan">
      <div class="so-ttd-label">Catatan hasil opname :</div>
      <div class="so-garis"></div><div class="so-garis"></div><div class="so-garis"></div>
    </div>
    ${ttd("Dihitung oleh :")}
    ${ttd("Disaksikan oleh :")}
    ${ttd("Mengetahui :")}
  </section>`;
}

function mstCetakKaki(data, ke, dari, ukur) {
  return `<footer class="so-kaki"${ukur ? ' data-so-ukur="kaki"' : ""}>
    <span>${escapeHtml(data.dok.name || "Masterlist")} · dicetak ${escapeHtml(fmtDate(data.tanggal))}</span>
    <span class="so-kaki-tengah">Paraf : ......................</span>
    <span class="so-kaki-kanan">Halaman ${ke} dari ${dari}</span>
  </footer>`;
}

/* Satu dokumen berisi semua potongan, untuk diukur di jendela cetak. */
function mstCetakUkurHtml(data) {
  const unit = mstCetakUnit(data);
  const isi = unit
    .map((x, i) => (x.grup ? mstCetakJudulLini(data, x.gi, false, ` data-so-unit="${i}"`) : mstCetakBarisHtml(x.b, ` data-so-unit="${i}"`)))
    .join("");
  const lanjutan = data.adaGrup ? mstCetakJudulLini(data, 0, true, ' data-so-ukur="lanjutan"') : "";
  return `<div class="so-ukur">
    <div class="so-ruang" data-so-ukur="ruang"></div>
    ${mstCetakKop(data, true, true)}
    ${mstCetakKop(data, false, true)}
    <table class="so-tabel" data-so-ukur="tabel">${mstCetakColgroup()}${mstCetakKepalaTabel(true)}<tbody>${isi}${lanjutan}</tbody>${mstCetakTfoot(data, true)}</table>
    ${mstCetakEkor(true)}
    ${mstCetakKaki(data, 1, 1, true)}
  </div>`;
}

/* Tinggi tiap potongan (px), termasuk margin vertikalnya. */
function mstCetakUkur(doc, data) {
  const win = doc.defaultView;
  const tinggi = (el) => {
    if (!el) return 0;
    const cs = win.getComputedStyle(el);
    return el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  };
  const q = (k) => doc.querySelector(`[data-so-ukur="${k}"]`);
  const tabel = q("tabel");
  const tepiTabel = tabel ? parseFloat(win.getComputedStyle(tabel).borderBottomWidth) || 0 : 0;
  const unit = mstCetakUnit(data).map((x, i) => ({ grup: x.grup, tinggi: tinggi(doc.querySelector(`[data-so-unit="${i}"]`)) }));
  return {
    unit,
    ukuran: {
      ruang: tinggi(q("ruang")),
      kopPertama: tinggi(q("kop-pertama")),
      kop: tinggi(q("kop")),
      kepala: tinggi(q("kepala")) + tepiTabel,
      kaki: tinggi(q("kaki")),
      ekor: tinggi(q("tfoot")) + tinggi(q("ekor")),
      lanjutan: tinggi(q("lanjutan")),
      adaGrup: data.adaGrup,
      cadangan: SO_CADANGAN_MM * SO_MM,
    },
  };
}

/* Lembar-lembar akhir dari hasil pembagian halaman. */
function mstCetakLembarHtml(data, halaman) {
  const unit = mstCetakUnit(data);
  const n = halaman.length;
  return halaman
    .map((idx, h) => {
      const akhir = h === n - 1;
      const pertama = idx.length ? unit[idx[0]] : null;
      const awalan = data.adaGrup && pertama && !pertama.grup ? mstCetakJudulLini(data, pertama.gi, true) : "";
      const isi = idx.map((i) => (unit[i].grup ? mstCetakJudulLini(data, unit[i].gi, false) : mstCetakBarisHtml(unit[i].b))).join("");
      return `<div class="so-lembar">
        ${mstCetakKop(data, h === 0, false)}
        <table class="so-tabel">${mstCetakColgroup()}${mstCetakKepalaTabel(false)}<tbody>${awalan}${isi}</tbody>${akhir ? mstCetakTfoot(data, false) : ""}</table>
        ${akhir ? mstCetakEkor(false) : ""}
        ${mstCetakKaki(data, h + 1, n, false)}
      </div>`;
    })
    .join("");
}

function mstCetakCss() {
  const isiLebar = SO_KOLOM.reduce((s, k) => s + k.lebar, 0);
  return `
  /* Margin nol: kop & kaki bawaan peramban tidak punya tempat. Jarak ke
     tepi kertas dipasang sebagai padding .so-lembar. */
  @page { size: A4 landscape; margin: 0; }
  :root { --so-garis: 1px solid #000; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .so-lembar {
    width: 297mm; height: 210mm; padding: 9mm 10mm 7mm;
    display: flex; flex-direction: column;
    break-after: page; page-break-after: always;
  }
  .so-lembar:last-child { break-after: auto; page-break-after: auto; }
  @media screen {
    body { background: #e5e7eb; }
    .so-lembar { background: #fff; margin: 6mm auto; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18); }
  }
  /* Wadah ukur: lebar isi lembar, di luar pandangan. */
  .so-ukur { position: absolute; left: -10000px; top: 0; width: ${isiLebar}mm; }
  .so-ruang { height: calc(210mm - 16mm); }

  .so-awal { margin-bottom: 3mm; }
  .so-kop {
    display: grid; grid-template-columns: 15mm minmax(0, 1fr) auto; align-items: center;
    column-gap: 4mm; padding-bottom: 2.5mm; border-bottom: 1.5px solid #000;
  }
  .so-logo { width: 15mm; height: 11.1mm; display: block; }
  .so-nama-pt { font-size: 13pt; font-weight: 700; letter-spacing: 0.2px; }
  .so-alamat { font-size: 7pt; line-height: 1.35; }
  .so-judul { text-align: right; }
  .so-judul-utama { font-size: 14pt; font-weight: 700; letter-spacing: 0.4px; }
  .so-judul-sub { font-size: 9pt; margin-top: 1mm; }
  .so-meta {
    display: grid; grid-template-columns: 1fr 1fr 1fr 1.3fr; gap: 1.6mm 6mm;
    padding-top: 2.5mm; font-size: 8pt;
  }
  .so-f { display: flex; align-items: baseline; gap: 2mm; min-width: 0; }
  .so-f--lebar { grid-column: span 3; }
  .so-l { color: #333; white-space: nowrap; }
  .so-l::after { content: " :"; }
  .so-v { font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
  .so-v--isi { flex: 1 1 auto; border-bottom: 1px dotted #000; height: 4mm; font-weight: 400; }

  .so-kop-ringkas {
    display: flex; justify-content: space-between; align-items: baseline; gap: 6mm;
    padding-bottom: 1.6mm; margin-bottom: 2.5mm; border-bottom: 1px solid #000; font-size: 8pt;
  }

  .so-tabel {
    width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0;
    border-right: var(--so-garis); border-bottom: var(--so-garis);
  }
  .so-tabel th, .so-tabel td {
    border-top: var(--so-garis); border-left: var(--so-garis);
    padding: 1.2mm 1.5mm; vertical-align: top; overflow: hidden; overflow-wrap: anywhere;
  }
  .so-tabel thead th {
    background: #d9d9d9; font-size: 7pt; font-weight: 700; line-height: 1.2;
    text-align: center; vertical-align: middle; padding: 1.6mm 1mm;
  }
  /* Kolom isian tangan: kepala lebih gelap, dipisah garis tebal. */
  .so-tabel thead th.so-isi { background: #bdbdbd; }
  .so-tabel .so-isi-awal { border-left: 2px solid #000; }
  .so-tabel tbody td { font-size: 8pt; line-height: 1.3; height: 7.6mm; }
  .so-tabel tbody tr.so-grup td {
    height: auto; padding: 1mm 1.5mm; background: #efefef;
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.2px;
  }
  .so-grup span { font-weight: 400; }
  .so-no, .so-tengah { text-align: center; }
  .so-angka { text-align: right; font-variant-numeric: tabular-nums; }
  .so-tabel thead th.so-angka { text-align: center; }
  /* Nomor aju lengkap (26 karakter) muat satu baris; tiap PIB sebaris dengan tanggalnya. */
  .so-tabel tbody td.so-pib { white-space: nowrap; font-size: 7.5pt; font-variant-numeric: tabular-nums; }
  .so-tabel tfoot td { font-weight: 700; padding-top: 1.4mm; padding-bottom: 1.4mm; }
  .so-total-label { text-align: center; }

  .so-ekor {
    display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr;
    margin-top: 4mm; border: var(--so-garis);
  }
  .so-ekor > div {
    min-height: 27mm; padding: 1.6mm 2.4mm; border-left: var(--so-garis);
    display: flex; flex-direction: column;
  }
  .so-ekor > div:first-child { border-left: 0; }
  .so-ttd-label { font-size: 7.5pt; }
  .so-ttd-nama { margin-top: auto; text-align: center; font-size: 7.5pt; }
  .so-ttd-tgl { margin-top: 1.5mm; font-size: 7pt; color: #333; }
  .so-garis { border-bottom: 1px dotted #000; height: 6mm; }

  .so-kaki {
    margin-top: auto; padding-top: 2mm;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: end;
    font-size: 7pt; color: #333;
  }
  .so-kaki-tengah { text-align: center; }
  .so-kaki-kanan { text-align: right; }
  `;
}

/* ---------- mencetak ---------- */

function cetakMasterlist() {
  const data = mstCetakData();
  if (!data.baris.length) {
    showToast(
      tt("Tidak ada baris untuk dicetak — longgarkan saringannya dulu.", "There are no lines to print — loosen the filters first."),
      "warning",
    );
    return;
  }
  const w = window.open("", "_blank", "width=1200,height=900");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger");
    return;
  }
  const judul = `Stock Opname ${data.dok.name || "Masterlist"} ${fmtDate(data.tanggal)}`;
  w.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>${escapeHtml(judul)}</title>
<style>${mstCetakCss()}</style></head>
<body>${mstCetakUkurHtml(data)}</body></html>`);
  w.document.close();
  // Diukur di jendela cetak itu sendiri (lebar, huruf & CSS-nya sama), lalu diganti lembar-lembar akhirnya
  const ukur = mstCetakUkur(w.document, data);
  const halaman = mstBagiHalaman(ukur.unit, ukur.ukuran);
  w.document.body.innerHTML = mstCetakLembarHtml(data, halaman);
  w.onload = () => {
    w.focus();
    w.print();
  };
}
