"use strict";

/* ==================================================================
   PEMBACA DATA PIB / PEB LENGKAP (core/data-pabean.js)

   Isian Data PIB/PEB dari tiga sumber yang sama dengan isian lain:
     PDF PIB      -- pibDataPabean() & pibBarangDataPabean()  (pdf.js)
     PDF PEB      -- pebDataPabean() & pebBarangDataPabean()  (pdf-peb.js)
     Excel CEISA  -- ceisaDataPabean()                        (excel-bc.js)
   Hasilnya data berkode seperti tersimpan di jadwal ({ ...isian, pihak })
   dan satu objek per barang. Isian yang punya kolom jadwal sendiri atau
   dihitung darinya (nilai, berat, pungutan, fasilitas barang) dibaca
   pembaca jadwalnya, tidak di sini. Yang tidak terbaca tidak diisi --
   tidak pernah ditebak.
================================================================== */

const dpbTglDmy = (s) => {
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(String(s || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const dpbNum = (s) => {
  if (s == null || s === "" || !/\d/.test(String(s))) return null;
  const n = Number(String(s).replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : null;
};
const dpbXBaris = (l) => Math.min(...l.items.map((it) => it.transform[4]));

/* Baris di bawah sebuah label dalam rentang x [xMin, xMax) */
function dpbBarisDiBawah(pageItems, labelRe, geserKiri, lebar, n) {
  const hit = pdfFindItemOnPage(pageItems, labelRe);
  if (!hit) return [];
  return pdfLinesInBox(pageItems, hit.x - geserKiri, hit.x + lebar, { yTop: hit.y - 1, yBottom: -Infinity })
    .slice(0, n)
    .map((l) => l.text.trim());
}

/* Kota, tanggal & penanda tangan pernyataan: "JAKARTA, 23-01-2026", lalu
   nama & jabatan di bawah label "Importir/PPJK" / "Eksportir/PPJK". */
function dpbPernyataan(dp, text, pageItems, labelRe) {
  const kota = /(?:^|\n)[ \t]*([A-Z][A-Z .'-]+),[ \t]*(\d{2}-\d{2}-\d{4})[ \t]*(?=\n|$)/.exec(text);
  if (kota) {
    dp.kotaPernyataan = kota[1].trim();
    dp.tanggalPernyataan = dpbTglDmy(kota[2]);
  }
  const ttd = dpbBarisDiBawah(pageItems, labelRe, 60, 150, 2).filter((x) => x && !/^Rangkap\b/i.test(x));
  if (ttd[0]) dp.namaPernyataan = ttd[0];
  if (ttd[1] && ttd[1].length < 40) dp.jabatanPernyataan = ttd[1];
}

/* ---------------- PDF PIB ---------------- */

/* Kolom kiri halaman 1 (D. DATA): Pengirim, Penjual, Importir, Pemilik
   Barang, PPJK -- dibaca per baris dari kotak kirinya sendiri, karena
   teks kolom kanan menyela baris-barisnya di teks gabungan. */
function pibPihakKiri(pageItems) {
  const atas = pdfFindItemOnPage(pageItems, /^D\.\s*DATA/i) || pdfFindItemOnPage(pageItems, /^PENGIRIM/i);
  const bawah = pdfFindItemOnPage(pageItems, /^27\.\s*Nomor/i);
  const kanan = pdfFindItemOnPage(pageItems, /^9\.\s*Cara Pengangkutan/i) || pdfFindItemOnPage(pageItems, /^G\.\s*Nomor/i);
  if (!atas || !kanan) return {};
  const xKanan = kanan.x - 3;
  const lines = pdfLinesInBox(pageItems, 0, xKanan, { yTop: atas.y + 1, yBottom: bawah ? bawah.y + 1 : -Infinity });
  const JUDUL = { PENGIRIM: "pengirim", PENJUAL: "penjual", IMPORTIR: "importir", "PEMILIK BARANG": "pemilik", PPJK: "ppjk" };
  // Nama negara pihak luar negeri tercetak rata kanan di kolom kiri
  const xNegara = xKanan * 0.6;
  const pihak = {};
  let p = null;
  let alamat = false;
  lines.forEach((l) => {
    const teks = l.text.trim();
    const j = /^(PENGIRIM|PENJUAL|IMPORTIR|PEMILIK BARANG|PPJK)\b\s*([A-Z]{2})?\s*$/.exec(teks);
    if (j) {
      p = pihak[JUDUL[j[1]]] = pihak[JUDUL[j[1]]] || {};
      if (j[2]) p.negara = j[2];
      alamat = false;
      return;
    }
    if (!p) return;
    const ISIAN = [
      [/^\d+a?\.\s*Nama,?\s*(?:Alamat)?\s*:?\s*(.*)$/i, "nama"],
      [/^\d+a?\.\s*Identitas\s*:\s*(.*)$/i, "identitas"],
      [/^NITKU\s*:\s*(.*)$/i, "nitku"],
      [/^\d+a?\.\s*Hubungan dengan Penjual\s*:\s*(.*)$/i, "hubungan"],
      [/^\d+\.\s*NPWP\s*:\s*(.*)$/i, "npwp"],
      [/^\d+\.\s*NP-PPJK\s*:\s*(.*)$/i, "npPpjk"],
    ];
    const status = /^\d+a?\.\s*Status\s*:\s*(.*?)(?:\s+\d+\.\s*NIB\s*:\s*(.*))?$/i.exec(teks);
    if (status) {
      p.status = status[1].trim();
      if (status[2]) p.nib = status[2].trim();
      alamat = false;
      return;
    }
    const isian = ISIAN.find(([re]) => re.test(teks));
    if (isian) {
      p[isian[1]] = isian[0].exec(teks)[1].trim();
      alamat = isian[1] === "nama";
      return;
    }
    if (!alamat) return;
    if (dpbXBaris(l) > xNegara && /^[A-Z][A-Z ,.'()-]+$/.test(teks)) {
      p.negara = teks;
      alamat = false;
      return;
    }
    p.alamat = p.alamat ? `${p.alamat}\n${teks}` : teks;
  });
  // "0123456789012345 / 0123456789012345" -> sekali saja kalau kembar
  Object.values(pihak).forEach((x) => {
    const bagian = String(x.identitas || "").split(/\s*\/\s*/).filter(Boolean);
    if (bagian.length === 2 && bagian[0] === bagian[1]) x.identitas = bagian[0];
  });
  return pihak;
}

function pibDataPabean(text, pagesItems) {
  const dp = {};
  const ambil = (re) => {
    const m = re.exec(text);
    return m ? m[1].trim() : "";
  };
  const hal1 = (pagesItems && pagesItems[0]) || [];

  dp.kodeKantor = ambil(/Kantor Pabean[ \t]*:[ \t]*.+?[ \t]+(\d{6})\b/);
  // Pilihan bernomor: "A. JENIS PIB : 1 1. Biasa; 2. Berkala." -> kode "1"
  dp.jenisPib = ambil(/A\.\s*JENIS PIB[ \t]*:[ \t]*(\d)(?![.\d])/i);
  dp.jenisImpor = ambil(/B\.\s*JENIS IMPOR[ \t]*:[ \t]*(\d)(?![.\d])/i);
  dp.caraBayar = ambil(/C\.\s*CARA PEMBAYARAN[ \t]*:[ \t]*(\d)(?![.\d])/i);

  dp.bendera = ambil(/dan Bendera[ \t]+([A-Z]{2})\b/);
  // "13. Pelabuhan Transit : SINGAPORE   SGSIN" -> kodenya
  const transit = ambil(/13\.\s*Pelabuhan Transit[ \t]*:[ \t]*([^\n]*)/).replace(/\s+\d{1,2}\.\s+.*$/, "");
  if (transit && !/^\d+\./.test(transit)) dp.pelabuhanTransit = (/\b([A-Z]{5})\s*$/.exec(transit) || [, transit])[1];

  const transaksi = /16\.\s*Transaksi[ \t]+([A-Z]{2,4})?[ \t]*:[ \t]*No\.[ \t]*(?:(?!Tgl\.)(\S+)[ \t]+)?Tgl\.[ \t]*(\d{2}-\d{2}-\d{4})?/.exec(text);
  if (transaksi) {
    dp.transaksiJenis = transaksi[1];
    dp.transaksiNomor = transaksi[2];
    dp.transaksiTanggal = dpbTglDmy(transaksi[3]);
  }
  const bc11 = /18\.\s*BC\s*1\.1(?:\/1\.2)?[ \t]*:[ \t]*No\.[ \t]*(\S+)[ \t]*Tgl\.[ \t]*(\d{2}-\d{2}-\d{4})/.exec(text);
  if (bc11) {
    dp.bc11Nomor = bc11[1];
    dp.bc11Tanggal = dpbTglDmy(bc11[2]);
  }
  const pos = /\bPos\.[ \t]*(\d+)[ \t]*Sub Pos\.[ \t]*(\d+)/.exec(text);
  if (pos) {
    dp.bc11Pos = pos[1];
    dp.bc11SubPos = pos[2];
  }
  // Tempat penimbunan: kode TPS di baris labelnya (namanya tercetak di bawah)
  const tps = ambil(/20\.\s*Tempat Penimbunan[ \t]*:[ \t]*(\S+)/);
  if (!/^\d+[a-z]?\.$/.test(tps)) dp.tempatTimbun = tps;

  dp.valuta = ambil(/21\.\s*Valuta[ \t]*:[ \t]*([A-Z]{3})\b/);
  dp.ikb = ambil(/25a\.\s*IKB[ \t]*:[ \t]*([A-Z][A-Z ]*?)[ \t]*$/m);

  // Kemasan: "17 PACKAGE, SESUAI B/L" -> merek sesudah koma
  const i28 = text.search(/28\.\s*Jumlah/i);
  if (i28 >= 0) {
    const kemas = /^[ \t]*\d+[ \t]+[A-Z]+[ \t]*,[ \t]*([^\n]+?)[ \t]*$/m.exec(text.slice(i28, i28 + 400));
    if (kemas) dp.merekKemasan = kemas[1].replace(/(\s+[\d,]+\.\d+)+$/, "").trim();
  }

  // Pembayaran & jaminan: kode pilihannya, hanya bila benar-benar diisi
  dp.pembayaran = ambil(/a\.\s*Pembayaran[ \t]*:?[ \t]*([1-3])\b(?!\.)/);
  dp.jaminanJenis = ambil(/b\.\s*Jaminan[ \t]*:?[ \t]*([1-4])\b(?!\.)/);

  dpbPernyataan(dp, text, hal1, /^Importir\/PPJK$/i);
  dp.pihak = pibPihakKiri(hal1);
  return rapikanDataPabean(dp);
}

/* Per barang (lembar lanjutan): kolom 34 tarif BM & PPh, kolom 36
   metode penentuan nilai, perbedaan harga & voluntary declaration.
   Fasilitas per barang (kolom 33) patokannya daftar fasilitas barang di
   jadwal. Array sejajar pita "Pos Tarif" (pibPitaBarang, pdf.js). */
function pibBarangDataPabean(pagesItems, nItems) {
  const teks = (lines) => lines.map((l) => l.text.trim()).filter(Boolean);
  // "BM 10% 100% BBS", "PPH 2.5% 100% BBS" -> tarif BM 10, PPh 2,5
  const tarif = pibPitaBarang(pagesItems, nItems, {
    headerKiri: /^34\.\s*Tarif/i, headerKanan: /^35\./i, geserKiri: 4, xMinCadangan: 292, xMaxCadangan: 396,
    ambil: (lines) => teks(lines).reduce((d, x) => {
      const m = /^(BM|PPH)\s+([\d.,]+)\s*%/i.exec(x);
      if (m) d[m[1].toUpperCase() === "BM" ? "tarifBm" : "tarifPph"] = dpbNum(m[2]);
      return d;
    }, {}),
  });
  /* Kolom 36 berurutan tetap: nilai pabean, metode, perbedaan harga,
     jenis V D, nilai yang ditambahkan, jatuh tempo -- "-" = kosong. */
  const nilai = pibPitaBarang(pagesItems, nItems, {
    headerKiri: /^36\.\s*-?\s*Nilai Pabean/i, headerKanan: /(?!)/, geserKiri: 4, xMinCadangan: 480, xMaxCadangan: 100000,
    ambil: (lines) => {
      const baris = teks(lines).map((x) => (x === "-" ? "" : x.replace(/^-\s+/, "")));
      const i = baris.findIndex((x) => /^[\d,]+\.\d+$/.test(x));
      if (i < 0) return {};
      const [metode, beda, vd, tambah, tempo] = baris.slice(i + 1);
      return {
        metodeNilai: /^METODE\b/i.test(metode || "") ? metode : "",
        bedaHargaLevel: beda,
        jenisVd: vd,
        nilaiVd: dpbNum(tambah) || null,
        jatuhTempo: dpbTglDmy(tempo),
      };
    },
  });
  if (tarif.length !== nItems && nilai.length !== nItems) return [];
  return Array.from({ length: nItems }, (_, i) =>
    rapikanDataPabeanBarang(Object.assign({}, tarif.length === nItems ? tarif[i] : {}, nilai.length === nItems ? nilai[i] : {})),
  );
}

/* ---------------- PDF PEB ---------------- */

/* Tiga kolom pihak (EKSPORTIR | PEMILIK BARANG | PEMBELI, lalu PPJK |
   KONSOLIDASI | PENERIMA), masing-masing dari kotaknya sendiri: label
   "N. Nama : isi" memulai isian, baris tanpa label menyambung isian
   sebelumnya (alamat dua baris). */
function pebPihak(pageItems) {
  const kepala = [
    [/^EKSPORTIR$/i, "eksportir"], [/^PEMILIK BARANG$/i, "pemilik"], [/^PEMBELI$/i, "pembeli"],
    [/^PPJK$/i, "ppjk"], [/MELAKUKAN KONSOLIDASI/i, "konsolidator"], [/^PENERIMA$/i, "penerima"],
  ].map(([re, k]) => ({ k, hit: pdfFindItemOnPage(pageItems, re) })).filter((x) => x.hit);
  if (!kepala.length) return {};
  const bawah = pdfFindItemOnPage(pageItems, /^DATA PENGANGKUTAN/i);
  // Kolom = kelompok x kepala (selisih < 20 pt dianggap satu kolom)
  const kolom = [];
  kepala.map((x) => x.hit.x).sort((a, b) => a - b).forEach((x) => {
    if (!kolom.length || x - kolom[kolom.length - 1] >= 20) kolom.push(x);
  });
  const kolomDari = (x) => kolom.reduce((iBaik, k, i) => (Math.abs(k - x) < Math.abs(kolom[iBaik] - x) ? i : iBaik), 0);
  const LABEL = { identitas: /Identitas/i, nitku: /^NITKU/i, nama: /Nama/i, alamat: /Alamat/i, negara: /Negara/i, status: /Status/i, npwp: /NPWP/i, kategori: /Kategori/i };
  const pihak = {};
  kepala.forEach(({ k, hit }) => {
    const i = kolomDari(hit.x);
    const xMin = kolom[i] - 6;
    const xMax = i + 1 < kolom.length ? kolom[i + 1] - 6 : 100000;
    // Pita ke bawah sampai kepala berikutnya di kolom yang sama, atau DATA PENGANGKUTAN
    const lebihBawah = kepala.filter((x) => kolomDari(x.hit.x) === i && x.hit.y < hit.y - 1).map((x) => x.hit.y);
    const yBawah = lebihBawah.length ? Math.max(...lebihBawah) + 1 : bawah ? bawah.y + 1 : -Infinity;
    const isi = {};
    let kunci = null;
    pdfLinesInBox(pageItems, xMin, xMax, { yTop: hit.y - 1, yBottom: yBawah }).forEach((l) => {
      const teks = l.text.trim();
      if (!teks || /^Konsolidasi$/i.test(teks)) return;
      const m = /^(?:\d+\.\s*)?([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/.exec(teks);
      const label = m && Object.keys(LABEL).find((x) => LABEL[x].test(m[1]));
      if (label) {
        kunci = label;
        isi[kunci] = m[2].trim();
      } else if (kunci === "alamat" || kunci === "nama") {
        isi[kunci] = isi[kunci] ? `${isi[kunci]}${kunci === "alamat" ? "\n" : " "}${teks}` : teks;
      }
    });
    pihak[k] = isi;
  });
  return pihak;
}

function pebDataPabean(text, pagesItems) {
  const dp = {};
  const hal1 = (pagesItems && pagesItems[0]) || [];
  // Satu baris isian; label kolom sebelahnya ("H. KOLOM ...", "39. Biaya ...") dipotong
  const satu = (re) => {
    const m = re.exec(text);
    return m ? m[1].split(/\s+(?:\d{1,2}\.|[A-H]\.)\s+[A-Z]/)[0].trim() : "";
  };
  dp.kantorMuat = satu(/1\.\s*Kantor Pabean Pemuatan[ \t]*:[ \t]*([^\n]+)/i);
  dp.kantorEkspor = satu(/2\.\s*Kantor Pabean Ekspor[ \t]*:[ \t]*([^\n]+)/i);
  dp.kantorDaftar = satu(/Kantor Bea Cukai Pendaftaran[ \t]*:[ \t]*([^\n]+)/i);
  dp.jenisEkspor = satu(/B\.\s*JENIS EKSPOR[ \t]*:[ \t]*([^\n]+)/i).replace(/\s+Tanggal\s*:.*$/i, "");
  dp.kategoriEkspor = satu(/C\.\s*KATEGORI EKSPOR[ \t]*:[ \t]*([^\n]+)/i);
  dp.caraDagang = satu(/D\.\s*CARA PERDAGANGAN[ \t]*:[ \t]*([^\n]+)/i).replace(/\s+Tanggal\s*:.*$/i, "");
  dp.caraBayar = satu(/E\.\s*CARA PEMBAYARAN[ \t]*:[ \t]*([^\n]+)/i).replace(/\s+Pos\/Sub Pos\s*:.*$/i, "");
  // H. Kolom khusus: BC 1.1 (nomor, tanggal di baris berikutnya, pos/sub pos)
  const bc = /2\.\s*Nomor BC 1\.1[ \t]*:[ \t]*(\S*)[^\n]*\n[^\n]*?Tanggal[ \t]*:[ \t]*(\d{2}-\d{2}-\d{4})?/.exec(text);
  if (bc) {
    dp.bc11Nomor = bc[1];
    dp.bc11Tanggal = dpbTglDmy(bc[2]);
  }
  const pos = /Pos\/Sub Pos[ \t]*:[ \t]*(\d+)[ \t]*\/[ \t]*(\d+)/.exec(text);
  if (pos) {
    dp.bc11Pos = pos[1];
    dp.bc11SubPos = pos[2];
  }
  dp.bendera = satu(/22\.\s*Nama\s*&\s*Bendera Sarana Pengangkut[ \t]*:[ \t]*([A-Z]{2})\b/i);
  dp.pelabuhanEkspor = satu(/26\.\s*Pelabuhan Muat Ekspor[ \t]*:[ \t]*([^\n]+)/i);
  const tps = satu(/27\.\s*Tempat Penimbunan[ \t]*:[ \t]*([^\n]+)/i);
  if (tps !== "-") dp.tempatTimbun = tps;
  const pl = /31\.\s*No\s*&\s*Tgl Packing List[ \t]*:[ \t]*No\.[ \t]*(.+?)[ \t]+tgl\.[ \t]*(\d{2}-\d{2}-\d{4})/i.exec(text);
  if (pl) {
    dp.packingListNomor = pl[1].trim();
    dp.packingListTanggal = dpbTglDmy(pl[2]);
  }
  dp.lokasiPeriksa = satu(/33\.\s*Lokasi Pemeriksaan[ \t]*:[ \t]*([^\n]+)/i);
  dp.kantorPeriksa = satu(/34\.\s*Kantor Pabean Pemeriksaan[ \t]*:[ \t]*([^\n]+)/i);
  dp.bankDevisa = satu(/36\.\s*Bank Devisa Hasil Ekspor[ \t]*:[ \t]*([^\n]+)/i);
  dp.valuta = satu(/37\.\s*Jenis Valuta[ \t]*:[^\n(]*\(([A-Z]{3})\)/i);
  dp.nilaiMaklon = dpbNum(satu(/41\.\s*Nilai Maklon[^:\n]*:[ \t]*([\d,.]+)/i)) || null;
  // 44: "12 BOX/ MEREK" di bawah labelnya (kolom kanan); "-" = tanpa merek
  const kemas = dpbBarisDiBawah(hal1, /^44\.\s*Jenis/i, 3, 300, 2).find((x) => /^\d/.test(x));
  const merek = kemas && /\/\s*(.*)$/.exec(kemas);
  if (merek && merek[1].trim() !== "-") dp.merekKemasan = merek[1].trim();
  // Penerimaan negara: 0 = tidak ada
  dp.beaKeluar = dpbNum(satu(/56\.\s*Nilai Bea Keluar[ \t]*:[ \t]*Rp\.?[ \t]*([\d,.]+)/i)) || null;
  dp.pph22 = dpbNum(satu(/57\.\s*PPh Pasal 22 Ekspor[ \t]*:[ \t]*Rp\.?[ \t]*([\d,.]+)/i)) || null;
  dp.danaPerkebunan = dpbNum(satu(/58\.\s*Dana Perkebunan[ \t]*:[ \t]*Rp\.?[ \t]*([\d,.]+)/i)) || null;
  dpbPernyataan(dp, text, hal1, /^Eksportir\/PPJK$/i);
  dp.pihak = pebPihak(hal1);
  return rapikanDataPabean(dp);
}

/* Per barang PEB dari baris kolom-kolom satu barang (extractPebItems):
   ekor kolom 48 "- EKSPOR BIASA" (jenis ekspor), 50 "HE: 0" & "BK: 0"
   (0 = tidak ada), 53 daerah asal di bawah negara asal
   ("KAB. CIREBON (3209)"). */
function pebBarangDataPabean(kol) {
  const bersih = (x) => String(x || "").trim().replace(/^-\s*/, "").trim();
  const d = {};
  d.jenisEkspor = (kol.uraian || []).map(bersih).find((x) => /^EKSPOR\b/i.test(x));
  (kol.he || []).map(bersih).forEach((x) => {
    const m = /^(HE|BK)\s*:\s*(.*)$/i.exec(x);
    const k = m && (m[1].toUpperCase() === "HE" ? "he" : "tarifBk");
    if (k && !dpAda(d[k])) d[k] = dpbNum(m[2]) || null;
  });
  d.daerahAsal = (kol.negara || []).map(bersih).find((x) => /\(\d{2,6}\)$/.test(x));
  return rapikanDataPabeanBarang(d);
}

/* ---------------- EXCEL CEISA ----------------
   lembar = baris sheet CEISA (sheetRows, excel-bc.js): header (objek),
   entitas, pengangkut, kemasan, kontainer, dokumen, barang (urut Seri),
   barangTarif, barangVd, komponenBiaya, pungutan, jaminan, bankDevisa.
   Semua isian berkode diambil KODE-nya. Mengembalikan { jadwal, barang }
   -- barang sejajar urutan `lembar.barang`. */
function ceisaDataPabean(lembar, mode) {
  const h = lembar.header || {};
  const s = (v) => (v == null ? "" : String(v).trim());
  const n = (v) => (v == null || v === "" ? null : Number(v));
  const tgl = (v) => excelValueToISODate(v);
  const ekspor = mode === "export";
  const angkut = (lembar.pengangkut || [])[0] || {};
  const dp = {
    caraBayar: s(h["KODE CARA BAYAR"]),
    bendera: s(angkut["KODE BENDERA"]).toUpperCase(),
    tempatTimbun: s(h["KODE TPS"]).toUpperCase(),
    bc11Nomor: s(h["NOMOR BC11"] || h["NOMOR BC 11"]),
    bc11Tanggal: tgl(h["TANGGAL BC11"] || h["TANGGAL BC 11"]),
    bc11Pos: s(h["NOMOR POS"]),
    bc11SubPos: s(h["NOMOR SUB POS"]),
    valuta: s(h["KODE VALUTA"]).toUpperCase(),
    kodeAsuransi: s(h["KODE ASURANSI"]).toUpperCase(),
    kotaPernyataan: s(h["KOTA PERNYATAAN"]),
    tanggalPernyataan: tgl(h["TANGGAL PERNYATAAN"]),
    namaPernyataan: s(h["NAMA PERNYATAAN"]),
    jabatanPernyataan: s(h["JABATAN PERNYATAAN"]),
  };
  const merek = [...new Set((lembar.kemasan || []).map((r) => s(r["MEREK"])).filter((x) => x && x !== "-"))];
  dp.merekKemasan = merek.join(", ");
  const pl = (lembar.dokumen || []).find((r) => s(r["KODE DOKUMEN"]) === "217");
  if (pl) {
    dp.packingListNomor = s(pl["NOMOR DOKUMEN"]);
    dp.packingListTanggal = tgl(pl["TANGGAL DOKUMEN"]);
  }
  const pungutan = (kode) => (lembar.pungutan || []).filter((r) => s(r["KODE JENIS PUNGUTAN"]).toUpperCase() === kode)
    .reduce((a, r) => a + (n(r["NILAI PUNGUTAN"]) || 0), 0) || null;
  if (ekspor) {
    Object.assign(dp, {
      kantorMuat: s(h["KODE KANTOR MUAT"]),
      kantorEkspor: s(h["KODE KANTOR EKSPOR"]),
      kantorDaftar: s(h["KODE KANTOR"]),
      kantorPeriksa: s(h["KODE KANTOR PERIKSA"]),
      pelabuhanEkspor: s(h["KODE PELABUHAN EKSPOR"]).toUpperCase(),
      jenisEkspor: s(h["KODE JENIS EKSPOR"]),
      kategoriEkspor: s(h["KODE KATEGORI EKSPOR"]),
      caraDagang: s(h["KODE CARA DAGANG"]),
      komoditas: s(h["FLAG MIGAS"]),
      barangKiriman: s(h["BARANG KIRIMAN"]).toUpperCase(),
      curah: s(h["FLAG CURAH"]),
      jenisPengangkutan: s(h["KODE JENIS PENGANGKUTAN"]),
      lokasiPeriksa: s(h["KODE LOKASI"]),
      tanggalPeriksa: tgl(h["TANGGAL PERIKSA"]),
      bankDevisa: s(((lembar.bankDevisa || [])[0] || {})["NAMA"]),
      nilaiMaklon: n(h["NILAI MAKLON"]) || null,
      beaKeluar: pungutan("BK"),
      pph22: pungutan("PPH") || pungutan("PPHEKSPOR"),
      danaPerkebunan: n(h["TOTAL DANA SAWIT"]) || null,
    });
  } else {
    const jaminan = (lembar.jaminan || [])[0] || {};
    Object.assign(dp, {
      kodeKantor: s(h["KODE KANTOR"]),
      jenisPib: s(h["KODE JENIS PROSEDUR"]),
      jenisImpor: s(h["KODE JENIS IMPOR"]),
      pelabuhanTransit: s(h["KODE PELABUHAN TRANSIT"]).toUpperCase(),
      transaksiJenis: s(h["KODE JENIS NILAI"]).toUpperCase(),
      ikb: (lembar.komponenBiaya || []).length ? "ADA" : "TIDAK ADA",
      pembayaran: s(h["KODE LOKASI BAYAR"]),
      jaminanJenis: s(jaminan["KODE JAMINAN"]),
      jaminanNomor: s(jaminan["NOMOR JAMINAN"]),
      jaminanTanggal: tgl(jaminan["TANGGAL JAMINAN"]),
    });
  }

  /* ENTITAS: KODE ENTITAS -> pihak. PIB: 1 importir, 4 PPJK, 7 pemilik
     barang, 9 pengirim, 10 penjual, 11 NPWP pemusatan. PEB: 2 eksportir,
     4 PPJK, 6 pembeli, 7 pemilik barang, 8 penerima, 23 pihak yang
     melakukan konsolidasi. NOMOR IDENTITAS 22 digit = NITKU; NPWP-nya 16
     digit pertamanya. */
  const PETA_PIHAK = ekspor
    ? { 2: "eksportir", 4: "ppjk", 6: "pembeli", 7: "pemilik", 8: "penerima", 23: "konsolidator" }
    : { 1: "importir", 4: "ppjk", 7: "pemilik", 9: "pengirim", 10: "penjual", 11: "pemusatan" };
  dp.pihak = {};
  (lembar.entitas || []).forEach((r) => {
    const k = PETA_PIHAK[s(r["KODE ENTITAS"])];
    if (!k || dp.pihak[k]) return;
    const id = s(r["NOMOR IDENTITAS"]);
    dp.pihak[k] = {
      nama: s(r["NAMA ENTITAS"]),
      alamat: s(r["ALAMAT ENTITAS"]),
      negara: s(r["KODE NEGARA"]).toUpperCase(),
      status: s(r["KODE STATUS"]),
      api: s(r["KODE JENIS API"]),
      nib: s(r["NIB ENTITAS"]),
      hubungan: s(r["KODE AFILIASI"]).toUpperCase(),
      kategori: s(r["KODE KATEGORI KONSOLIDATOR"]),
      [k === "ppjk" || k === "konsolidator" ? "npwp" : "identitas"]: id.length === 22 ? id.slice(0, 16) : id,
      nitku: id.length === 22 ? id : "",
    };
  });

  const barang = (lembar.barang || []).map((row) => {
    const seri = kunciSeri(row["SERI BARANG"]);
    const tarif = (kode) => {
      const r = (lembar.barangTarif || []).find((x) => kunciSeri(x["SERI BARANG"]) === seri && s(x["KODE PUNGUTAN"]).toUpperCase() === kode);
      return r ? n(r["TARIF"]) || 0 : null;
    };
    const d = {};
    if (ekspor) {
      d.jenisEkspor = s(row["KODE JENIS EKSPOR"]);
      d.daerahAsal = s(row["KODE DAERAH ASAL"]);
      d.he = n(row["HARGA EKSPOR"]) || null;
      d.tarifBk = tarif("BK") || null;
    } else {
      d.tarifBm = tarif("BM");
      d.tarifPph = tarif("PPH");
      d.metodeNilai = s(row["METODE PENENTUAN NILAI"]).toUpperCase();
      d.bedaHargaLevel = s(row["STATEMENT PERBEDAAN HARGA"]).toUpperCase();
      const vd = (lembar.barangVd || []).find((r) => kunciSeri(r["SERI BARANG"]) === seri);
      if (vd) {
        d.jenisVd = s(vd["KODE VD"]);
        d.nilaiVd = n(vd["NILAI BARANG"]) || null;
        d.jatuhTempo = tgl(vd["JATUH TEMPO"]);
      } else {
        d.nilaiVd = n(row["NILAI TAMBAH"]) || null;
      }
    }
    return rapikanDataPabeanBarang(d);
  });
  return { jadwal: rapikanDataPabean(dp), barang };
}
