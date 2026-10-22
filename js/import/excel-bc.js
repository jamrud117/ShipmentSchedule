"use strict";

/* IMPORT DARI EXCEL (dokumen BC mentah: sheet HEADER, ENTITAS */
function excelSerialToISODate(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  const dt = new Date(epoch + Math.round(serial) * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTH_ABBR_IDX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
// Robust terhadap beberapa kemungkinan bentuk tanggal dari SheetJS: string ISO
function excelValueToISODate(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") return excelSerialToISODate(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mon = MONTH_ABBR_IDX[m[2].toLowerCase()];
    if (mon != null) {
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      return `${yr}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

function excelStr(v) {
  return v == null ? "" : String(v).trim();
}
// Diteruskan ke parseLooseNumber() (js/ui/number-input.js)
function excelNum(v) {
  return parseLooseNumber(v);
}
/* Nama kolom dibakukan: huruf besar, spasi tunggal, garis bawah =
   spasi ("Seri Barang", "SERI_BARANG " -> "SERI BARANG"). Satu kepala
   kolom yang ditulis lain membuat seluruh kolomnya tidak terbaca --
   untuk SERI BARANG artinya urutan barang & pasangan fasilitasnya ikut
   kacau tanpa ada yang tampak salah. */
function kunciKolomExcel(k) {
  return String(k).replace(/_/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function sheetRows(wb, name) {
  if (!wb.Sheets[name]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }).map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => {
      const kunci = kunciKolomExcel(k);
      if (!(kunci in out)) out[kunci] = row[k];
    });
    return out;
  });
}

/* Kunci Seri Barang / Seri Dokumen: angka dibaca sebagai angka ("1", 1,
   "001" sama), selain itu teksnya. Lembar BARANG, BARANGDOKUMEN &
   DOKUMEN ditautkan lewat kunci ini. */
function kunciSeri(v) {
  const s = String(v == null ? "" : v).trim();
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? String(n) : s.toUpperCase();
}

/* Diurutkan NUMERIK menaik menurut Seri Barang -- bukan urutan baris
   apa adanya. Baris mentah CEISA TIDAK selalu berurutan (nemu di data
   sungguhan: 1, 4, 3, 2, 6, ...). Seri yang bukan angka didorong ke
   BELAKANG; yang setara tetap di urutan aslinya. */
function urutMenurutSeri(daftar, seriDari) {
  return daftar
    .map((x, i) => {
      const k = kunciSeri(seriDari(x));
      const n = k === "" ? NaN : Number(k);
      return { x, i, n: Number.isFinite(n) ? n : Infinity };
    })
    .sort((a, b) => (a.n === b.n ? a.i - b.i : a.n - b.n))
    .map((y) => y.x);
}

// Buang label field ("Tipe :", "Merek :", dst) yang kadang ke-ikut dalam teks deskripsi
function stripFieldLabels(s) {
  return (s || "")
    .replace(
      /\b(?:Merk|Merek|Tipe|Ukuran|Spesifikasi(?:\s+lain)?)\s*:\s*/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* KOLOM BARANG CEISA -> kolom yang SAMA di jadwal (KOLOM_NAMA_BARANG,
   helpers.js), satu lawan satu dan apa adanya -- "TANPA MEREK" & "-"
   juga, karena itulah isian CEISA-nya (nama barang yang ditampilkan
   melewatinya sendiri, rapiBagianNama). Kolom yang tidak ada di berkas
   tidak diisi: nilai bawaan newItem() yang berlaku. */
const KOLOM_BARANG_DRAFT = {
  kodeBarang: "KODE BARANG",
  namaBarang: "URAIAN",
  merek: "MEREK",
  tipe: "TIPE",
  ukuran: "UKURAN",
  spesifikasiLain: "SPESIFIKASI LAIN",
};
function kolomBarangDraft(row) {
  const out = {};
  Object.entries(KOLOM_BARANG_DRAFT).forEach(([field, kolom]) => {
    if (kolom in row) out[field] = stripFieldLabels(excelStr(row[kolom]));
  });
  return out;
}

/* KODE CEISA PER BARANG -> kolom yang sama di jadwal: KODE KONDISI
   BARANG (1 = BARU, 2 = BUKAN BARU) & KODE NEGARA ASAL (kode negara
   ISO). Kolom yang ada di berkas: isinya, boleh kosong. Yang tidak ada:
   undefined -- bukan kosong: isian barang lama / bawaan form yang
   berlaku (lengkapiKodeBarang, apply-to-form.js). */
const KOLOM_KODE_DRAFT = {
  kondisiBarang: "KODE KONDISI BARANG",
  negaraAsal: "KODE NEGARA ASAL",
};
function kodeBarangDraft(row) {
  const out = {};
  Object.entries(KOLOM_KODE_DRAFT).forEach(([field, kolom]) => {
    out[field] = kolom in row ? excelStr(row[kolom]).toUpperCase() : undefined;
  });
  return out;
}

function parseBcExcelWorkbook(wb) {
  const notes = [];
  const header = sheetRows(wb, "HEADER")[0] || {};
  const respon = sheetRows(wb, "RESPON");
  const entitas = sheetRows(wb, "ENTITAS");
  const dokumen = sheetRows(wb, "DOKUMEN");
  const pengangkut = sheetRows(wb, "PENGANGKUT")[0] || {};
  const kemasan = sheetRows(wb, "KEMASAN");
  const kontainer = sheetRows(wb, "KONTAINER");
  const barangTarif = sheetRows(wb, "BARANGTARIF");
  const barangDokumen = sheetRows(wb, "BARANGDOKUMEN");
  /* Barang diurutkan menurut SERI BARANG lebih dulu (urutMenurutSeri),
     baru dipetakan. Urutan inilah yang dipakai APA ADANYA untuk nomor
     Seri di tabel barang (dihitung dari POSISI baris, item-table.js) dan
     untuk memasangkan barang yang sudah ada di form (apply-to-form.js),
     jadi di sinilah ditentukan baris mana jadi "Seri Barang 1" dst.
     Seluruh rincian satu baris -- kolom barang, HS, jumlah, nilai,
     berat, kemasan, fasilitas -- dibaca dari baris BARANG-nya sendiri
     atau lewat Seri Barang-nya, tidak pernah lewat posisi. */
  const barang = urutMenurutSeri(sheetRows(wb, "BARANG"), (row) => row["SERI BARANG"]);

  const barisDokumen = (...codes) =>
    dokumen.find((r) => codes.includes(excelStr(r["KODE DOKUMEN"]))) || null;
  const nomorDokumen = (row) => (row ? excelStr(row["NOMOR DOKUMEN"]) : "");
  const tanggalDokumen = (row) => (row ? excelValueToISODate(row["TANGGAL DOKUMEN"]) : "");
  // Invoice & B/L-AWB beserta tanggalnya (kode dokumen: lihat masterBL di bawah)
  const dokMaster = barisDokumen("704", "741");
  const dokHouse = barisDokumen("714", "703") || barisDokumen("705", "740");
  const dokInvoice = barisDokumen("380");
  // BM/PPN/PPH: dijumlahkan dari sheet BARANGTARIF (rincian per barang)
  const sumBarangTarif = (kode) => {
    const rows = barangTarif.filter(
      (r) => excelStr(r["KODE PUNGUTAN"]).toUpperCase() === kode,
    );
    if (!rows.length) return null;
    return roundNum(
      rows.reduce((sum, r) => sum + excelNum(r["NILAI BAYAR"]), 0),
      2,
    );
  };

  const shipper = entitas.find((r) => excelStr(r["KODE ENTITAS"]) === "9");

  const kodeCaraAngkut = excelStr(pengangkut["KODE CARA ANGKUT"]);
  const transport =
    kodeCaraAngkut === "4" ? "udara" : kodeCaraAngkut === "1" ? "laut" : "";

  const modeHint =
    header["KODE JENIS EKSPOR"] != null
      ? "export"
      : header["KODE JENIS IMPOR"] != null
        ? "import"
        : "";

  const packageStr = kemasan
    .map((r) => {
      const jml = r["JUMLAH KEMASAN"];
      const kode = excelStr(r["KODE KEMASAN"]);
      return [jml != null ? excelNum(jml) : "", kode]
        .filter((v) => v !== "")
        .join(" ");
    })
    .filter((v) => v)
    .join(", ");

  /* PETI KEMAS (sheet KONTAINER): Nomor, Ukuran, Jenis Muatan & Tipe --
     isian peti kemas CEISA. Ke Container/Seal Number jadwal satu
     kontainer per bagian (teksKontainer, helpers.js) -- bentuk yang
     dibaca balik Cek PIB/PEB. Jenis Muatan F/L mengisi Jenis Muatan
     (FCL/LCL) jadwal. */
  const daftarKontainer = kontainer
    .map((r) => ({
      nomor: excelStr(r["NOMOR KONTINER"] != null ? r["NOMOR KONTINER"] : r["NOMOR KONTAINER"]),
      ukuran: excelStr(r["KODE UKURAN KONTAINER"]),
      jenis: excelStr(r["KODE JENIS KONTAINER"]),
      tipe: excelStr(r["KODE TIPE KONTAINER"]),
    }))
    .filter((k) => k.nomor);
  const containerStr = daftarKontainer.map(teksKontainer).join(", ");
  const muatanKontainer = [...new Set(daftarKontainer.map((k) => muatanDariKode(k.jenis)).filter(Boolean))];

  // Tanggal SPPB = TANGGAL RESPON di sheet RESPON, pada baris yang KODE RESPON-nya = 2003
  const sppbRespon = respon.find(
    (r) => excelStr(r["KODE RESPON"]) === "2003",
  );
  const respTanggal = sppbRespon
    ? excelValueToISODate(sppbRespon["TANGGAL RESPON"])
    : "";
  if (respon.length && !sppbRespon) {
    notes.push(
      t("y.respon.2003.tidak.ditemukan"),
    );
  }

  const bmTarif = sumBarangTarif("BM");
  const ppnTarif = sumBarangTarif("PPN");
  const pphTarif = sumBarangTarif("PPH");
  /* CADANGAN rumus saat salah satu (atau ketiganya) tidak punya baris
     di BARANGTARIF -- HANYA untuk Import. Export tidak kena BM/PPN/PPH
     sama sekali, jadi BARANGTARIF kosong di sana itu WAJAR, bukan data
     yang hilang (lihat catatan di bawah, tidak dipaksa dihitung).

     Nilai Pabean = (CIF + Freight + Asuransi) x NDPBM. Diverifikasi
     lewat berkas CEISA sungguhan: kolom "CIF" pada HEADER/BARANG
     ternyata cuma nilai barangnya saja (BUKAN sudah termasuk ongkos
     kirim & asuransi seperti namanya) — freight & asuransi memang
     ditambahkan terpisah untuk sampai ke Nilai Pabean, dan hasil
     rumus ini cocok PERSIS dengan kolom "CIF RUPIAH" yang sudah
     dihitung CEISA sendiri di berkas ujinya.
       BM  = Nilai Pabean x 5%
       PPN = (Nilai Pabean + BM) x 11%  -- BM 0 -> sama saja x 11% saja
       PPH = Nilai Pabean x 2,5%
     Tarifnya (5% / 11% / 2,5%) tetap seperti diminta, bukan dibaca
     dari kolom TARIF di BARANGTARIF — baris itu sendiri yang kosong,
     jadi tidak ada tarif sungguhan untuk dibaca. Kalau BARANGTARIF
     ADA datanya untuk salah satu jenis pungutan, nilai dari sana yang
     dipakai apa adanya (bmTarif/ppnTarif/pphTarif di atas); rumus ini
     murni pengisi celah yang kosong saja, per jenis pungutan sendiri
     -sendiri — bukan "kalau satu kosong, buang semua". */
  /* bmDasar = BM SEBELUM dibulatkan: itu yang menjadi dasar PPN (Nilai
     Impor = Nilai Pabean + BM seri sebelum dibulatkan). Yang dibawa ke
     form dibulatkan ke atas ke ribuan -- jumlah NILAI BAYAR per seri di
     draft CEISA belum dibulatkan (1.543.235), PIB-nya 1.544.000. */
  let bmDasar = bmTarif,
    ppnFinal = ppnTarif,
    pphFinal = pphTarif,
    dutyDihitungRumus = false;
  if (modeHint === "import" && (bmTarif == null || ppnTarif == null || pphTarif == null)) {
    const cifUsd = header["CIF"] != null ? excelNum(header["CIF"]) : 0;
    const freightUsd = header["FREIGHT"] != null ? excelNum(header["FREIGHT"]) : 0;
    const asuransiUsd = header["ASURANSI"] != null ? excelNum(header["ASURANSI"]) : 0;
    const ndpbmUntukPabean = header["NDPBM"] != null ? excelNum(header["NDPBM"]) : 0;
    if (ndpbmUntukPabean && (cifUsd || freightUsd || asuransiUsd)) {
      const nilaiPabean = (cifUsd + freightUsd + asuransiUsd) * ndpbmUntukPabean;
      if (bmDasar == null) bmDasar = roundNum(nilaiPabean * 0.05, 2);
      if (pphFinal == null) pphFinal = roundNum(nilaiPabean * 0.025, 2);
      if (ppnFinal == null)
        ppnFinal = roundNum((nilaiPabean + (bmDasar || 0)) * 0.11, 2);
      dutyDihitungRumus = true;
    }
  }

  const fields = {
    noAju: excelStr(header["NOMOR AJU"]),
    docNo: excelStr(header["NOMOR DAFTAR"]),
    docDate: respTanggal || excelValueToISODate(header["TANGGAL DAFTAR"]),
    incoterm: excelStr(header["KODE INCOTERM"]).toUpperCase(),
    party: shipper ? excelStr(shipper["NAMA ENTITAS"]) : "",
    invoice: nomorDokumen(dokInvoice),
    invoiceDate: tanggalDokumen(dokInvoice),
    /* KODE DOKUMEN mengikuti daftar UN/EDIFACT 1001 yang dipakai BC 2.0:

         704  Master bill of lading      (laut, tingkat master)
         741  Master air waybill         (udara, tingkat master)
         714  House bill of lading       (laut, tingkat house)
         703  House waybill              (udara, tingkat house)
         705  Bill of lading             (laut, umum -- dipakai di tingkat house)
         740  Air waybill                (udara, umum -- dipakai di tingkat house)

       House: 714 / 703 didahulukan, lalu 705 / 740. HATI-HATI untuk moda
       udara: 741 itu Master AWB dan 740 yang house — gampang tertukar
       kalau ditebak dari urutan angkanya. Tanggal dokumennya mengisi
       Tanggal Master / House. */
    masterBL: nomorDokumen(dokMaster),
    masterBLDate: tanggalDokumen(dokMaster),
    houseBL: nomorDokumen(dokHouse),
    houseBLDate: tanggalDokumen(dokHouse),
    freight: header["FREIGHT"] != null ? excelNum(header["FREIGHT"]) : null,
    insurance:
      header["ASURANSI"] != null ? excelNum(header["ASURANSI"]) : null,
    ndpbm: header["NDPBM"] != null ? excelNum(header["NDPBM"]) : null,
    origin: portDisplay(excelStr(header["KODE PELABUHAN MUAT"])),
    destination: portDisplay(excelStr(header["KODE PELABUHAN TUJUAN"])),
    actual: excelValueToISODate(header["TANGGAL TIBA"]),
    etd: excelValueToISODate(header["TANGGAL BERANGKAT"]),
    vessel: excelStr(pengangkut["NAMA PENGANGKUT"]),
    voyage: excelStr(pengangkut["NOMOR PENGANGKUT"]),
    transport,
    package: packageStr,
    container: containerStr,
    // Semua kontainer satu jenis muatan -> Jenis Muatan jadwal; campuran dibiarkan
    muatan: muatanKontainer.length === 1 ? muatanKontainer[0] : "",
    bm: bulatkanBm(bmDasar),
    ppn: ppnFinal,
    pph: pphFinal,
  };

  /* Dokumen pelengkap -> FASILITAS per barang (Masterlist, SKB PPN/PPH,
     COO) lewat BARANGDOKUMEN, dan PI (Persetujuan Impor) & LS (Laporan
     Surveyor) untuk pengirimannya -- kenaliDokumenPelengkap() di
     helpers.js, aturan yang sama dengan PIB PDF. Nomor & tanggal
     dokumennya ikut dibawa: nomornya yang tersalin ke kolom FASILITAS /
     SKB dan PI di templat salin, tanggal PI & LS ke isiannya sendiri. */
  // Seri dokumen di lembar DOKUMEN: kolom SERI (atau SERI DOKUMEN)
  const seriDokumenDari = (r) => kunciSeri(r["SERI"] != null ? r["SERI"] : r["SERI DOKUMEN"]);
  const dokumenBySeri = new Map(
    dokumen
      .filter((r) => seriDokumenDari(r) !== "")
      .map((r) => [seriDokumenDari(r), r]),
  );
  const kenaliBaris = (r, perBarang) => {
    const kode = excelStr(r["KODE DOKUMEN"]);
    const nomor = excelStr(r["NOMOR DOKUMEN"]);
    const kenal = kenaliDokumenPelengkap({ kode, nomor });
    // Dokumen yang dikenal bukan fasilitas (invoice, B/L, polis asuransi 530, ...) tidak ditebak dari nomornya
    if (kenal || !perBarang || namaDokumenBukanFasilitas(kode)) return kenal;
    /* Kode tak dikenal tapi ditautkan ke barang: tebak dari nomornya.
       Hanya untuk dokumen per barang -- yang tidak ditautkan tidak
       ikut ditebak. */
    const jenis = jenisFasilitasDariNomor(nomor);
    if (jenis) return { jenis, jenisLainnya: "" };
    return POLA_NOMOR_PI.test(nomor) ? { pi: true } : null;
  };
  const entriDokumen = (r, kenal) => ({
    jenis: kenal.jenis,
    jenisLainnya: kenal.jenisLainnya || "",
    nomor: excelStr(r["NOMOR DOKUMEN"]),
    tanggal: excelValueToISODate(r["TANGGAL DOKUMEN"]),
  });
  // Untuk Cek PIB/PEB (fasilitasBarang): No. Urut = seri dokumennya di sheet DOKUMEN, dan kodenya
  const entriDokumenCek = (r, kenal) =>
    Object.assign(entriDokumen(r, kenal), { noUrut: seriDokumenDari(r), kode: excelStr(r["KODE DOKUMEN"]) });
  const skbBySeriBarang = new Map();
  const seriTertaut = new Set();
  // PI (959), LS (958) & Polis Asuransi (530): nomor + tanggal per pengiriman
  const dokPi = [];
  const dokLs = [];
  const dokPolis = [];
  const catat = (daftar) => (r) => tambahDokumenPengiriman(daftar, excelStr(r["NOMOR DOKUMEN"]), tanggalDokumen(r));
  const catatPi = catat(dokPi);
  const catatLs = catat(dokLs);
  const dokumenLain = [];
  barangDokumen.forEach((row) => {
    const seriBarang = row["SERI BARANG"];
    const seriDokumen = row["SERI DOKUMEN"];
    if (seriBarang == null || seriDokumen == null) return;
    const seriDok = kunciSeri(seriDokumen);
    const docRow = dokumenBySeri.get(seriDok);
    if (!docRow) return;
    seriTertaut.add(seriDok);
    const kenal = kenaliBaris(docRow, true);
    if (!kenal) {
      // Dokumen yang dikenal (mis. 530 Polis Asuransi) memang bukan fasilitas: tidak perlu diberi tahu
      if (namaDokumenBukanFasilitas(docRow["KODE DOKUMEN"])) return;
      const teks = [excelStr(docRow["KODE DOKUMEN"]), excelStr(docRow["NOMOR DOKUMEN"])]
        .filter(Boolean)
        .join(" ");
      if (teks && !dokumenLain.includes(teks)) dokumenLain.push(teks);
      return;
    }
    if (kenal.pi) return catatPi(docRow);
    if (kenal.ls) return catatLs(docRow);
    const key = kunciSeri(seriBarang);
    if (!skbBySeriBarang.has(key)) skbBySeriBarang.set(key, []);
    const daftar = skbBySeriBarang.get(key);
    const entri = entriDokumenCek(docRow, kenal);
    if (!daftar.some((sk) => sk.jenis === entri.jenis && sk.nomor === entri.nomor))
      daftar.push(entri);
  });
  /* Dokumen fasilitas yang TIDAK ditautkan ke barang mana pun berlaku
     untuk pengirimannya -- diterapkan ke semua barang, sama seperti PIB
     PDF (lembarnya juga tidak memisahkan per barang). */
  const fasilitasUmum = [];
  dokumen.forEach((r) => {
    if (seriTertaut.has(seriDokumenDari(r))) return;
    const kenal = kenaliBaris(r, false);
    if (!kenal) return;
    if (kenal.pi) return catatPi(r);
    if (kenal.ls) return catatLs(r);
    fasilitasUmum.push(entriDokumenCek(r, kenal));
  });
  // Polis asuransi bukan fasilitas: dibaca dari sheet DOKUMEN, tertaut ke barang atau tidak
  dokumen.filter((r) => adalahPolisAsuransi({ kode: excelStr(r["KODE DOKUMEN"]) })).forEach(catat(dokPolis));
  const pi = isianDokumenPengiriman(dokPi);
  const ls = isianDokumenPengiriman(dokLs);
  const polis = isianDokumenPengiriman(dokPolis);
  Object.assign(fields, {
    pi: pi.nomor,
    piDate: pi.tanggal,
    ls: ls.nomor,
    lsDate: ls.tanggal,
    polisAsuransi: polis.nomor,
    polisAsuransiDate: polis.tanggal,
  });

  // DAFTAR BARANG
  const headerBruto = excelNum(header["BRUTO"]);
  const itemsRaw = barang.map((row) => {
    const qty = excelNum(row["JUMLAH SATUAN"]);
    /* Harga satuan = nilai TOTAL per baris barang dibagi JUMLAH SATUAN.
       Pembilangnya beda menurut mode:
         - EXPORT: kolom FOB kalau termsnya FOB, CIF untuk selain itu
           (termasuk KODE INCOTERM kosong/tidak dikenal).
         - IMPORT: SELALU kolom CIF, apa pun termsnya — nilai pabean
           impor dasarnya CIF (lihat recalcCustoms(), PPN/PPH juga
           dari dasar CIF).
       Berlaku khusus untuk import Excel CEISA ini; sumber lain (CIPL,
       dst.) punya jalur sendiri. */
    const nilaiTotal = excelNum(
      modeHint === "export" && fields.incoterm === "FOB"
        ? row["FOB"]
        : row["CIF"],
    );
    return {
      seriBarang: kunciSeri(row["SERI BARANG"]),
      ...kolomBarangDraft(row),
      ...kodeBarangDraft(row),
      hsCode: excelStr(row["HS"]),
      satuan: excelStr(row["KODE SATUAN"]),
      qty,
      harga: qty ? roundNum(nilaiTotal / qty, 4) : 0,
      netto: excelNum(row["NETTO"]),
      bruto: excelNum(row["BRUTO"]),
      /* Kemasan PER BARANG ada di sheet BARANG sendiri (kolom JUMLAH
         KEMASAN + KODE KEMASAN), terpisah dari sheet KEMASAN yang
         memuat total per pengajuan. Keduanya dipakai: yang ini mengisi
         kolom Kemasan di tiap baris barang, yang satunya mengisi Total
         Package di kaki tabel. */
      /* Jumlah & jenis kemasan masuk ke kolom masing-masing, bukan
         digabung jadi satu teks — kolom Kemasan sekarang berisi angka
         saja supaya bisa dijumlahkan per jenis. */
      packing: (() => {
        const jml = row["JUMLAH KEMASAN"];
        return jml != null && jml !== "" ? String(excelNum(jml)) : "";
      })(),
      packingUnit: excelStr(row["KODE KEMASAN"]),
    };
  });
  const anyItemBruto = itemsRaw.some((it) => it.bruto > 0);
  if (!anyItemBruto && headerBruto > 0 && itemsRaw.length) {
    itemsRaw[0].bruto = headerBruto;
    notes.push(
      t("y.bruto.per.barang.tidak.ada", { n: fmtNum(headerBruto) }),
    );
  }
  const items = itemsRaw.map((it) => {
    const { seriBarang, ...rest } = it;
    return {
      ...newItem(),
      ...rest,
      /* Jenis barang TIDAK dipaksa di sini -- newItem() sudah
         memilihnya dari buku yang sedang dibuka: BARANG JADI untuk
         Export, BAHAN BAKU untuk Import. Nilai mati "BAHAN BAKU" di
         baris ini dulu menimpa pilihan itu, jadi berkas CEISA yang
         diimpor ke buku Export selalu mendarat sebagai bahan baku dan
         harus dibetulkan satu per satu. */
      skb: [...(skbBySeriBarang.get(seriBarang) || []), ...fasilitasUmum]
        .filter(
          (sk, i, semua) =>
            semua.findIndex((x) => x.jenis === sk.jenis && x.nomor === sk.nomor) === i,
        )
        // Isian fasilitas form saja (No. Urut & kode dokumen hanya untuk Cek PIB/PEB)
        .map((sk) => ({ jenis: sk.jenis, jenisLainnya: sk.jenisLainnya, nomor: sk.nomor, tanggal: sk.tanggal })),
    };
  });

  if (skbBySeriBarang.size) {
    notes.push(
      t("y.fasilitas.diisi.per.barang"),
    );
  } else if (!fasilitasUmum.length) {
    notes.push(
      t("y.skb.tidak.ditemukan.pemetaan"),
    );
  }
  if (fasilitasUmum.length && items.length) {
    notes.push(
      t("y.fasilitas.umum.semua.barang", {
        daftar: fasilitasUmum.map((sk) => `${skbEntryLabel(sk)} ${sk.nomor}`.trim()).join(", "),
      }),
    );
  }
  if (dokumenLain.length) {
    notes.push(t("y.dokumen.lain.per.barang", { daftar: dokumenLain.join(", ") }));
  }

  if (!items.length) {
    notes.push(
      t("w.sheet.barang.kosong.tidak.ditemukan.daftar.bar"),
    );
  }
  if (
    modeHint === "export" &&
    fields.incoterm === "FOB" &&
    barang.length &&
    barang.every((row) => row["FOB"] == null || row["FOB"] === "")
  ) {
    notes.push(
      t("w.terms.fob.tapi.kolom.fob.tidak.ditemukan.di.sh"),
    );
  }
  if (!fields.party) {
    notes.push(
      t("w.nama.shipper.kode.entitas.9.tidak.ditemukan.di"),
    );
  }
  if (!fields.masterBL && !fields.houseBL) {
    notes.push(
      t("w.master.house.bl.awb.tidak.ditemukan.di.sheet.d"),
    );
  }
  if (!transport) {
    notes.push(
      t("w.moda.transportasi.tidak.terdeteksi.dari.kode.c"),
    );
  }
  /* Export tidak kena BM/PPN/PPH sama sekali -- BARANGTARIF kosong di
     sana itu wajar, jadi TIDAK diberi catatan apa pun (beda dari
     dulu, yang ikut memperingatkan Export juga). */
  if (modeHint === "import" && (bmTarif == null || ppnTarif == null || pphTarif == null)) {
    if (dutyDihitungRumus) {
      notes.push(
        t("y.pungutan.dihitung.otomatis"),
      );
    } else {
      notes.push(
        t("y.pungutan.tidak.cukup.dihitung"),
      );
    }
  }

  /* Kolom barang CEISA per Seri Barang APA ADANYA -- hanya kolom yang
     ada di berkas, tanpa nilai bawaan form (kode kondisi & negara asal
     ikut). Dibandingkan kolom demi kolom dengan jadwal di Cek PIB/PEB
     (checker-view.js). */
  const kolomBarang = barang.map((row) => {
    const kode = kodeBarangDraft(row);
    Object.keys(kode).forEach((k) => kode[k] === undefined && delete kode[k]);
    return { seri: kunciSeri(row["SERI BARANG"]), kolom: Object.assign(kolomBarangDraft(row), kode) };
  });
  /* Dokumen fasilitas yang DITAUTKAN ke tiap Seri Barang (BARANGDOKUMEN)
     beserta No. Urut-nya (seri dokumen di sheet DOKUMEN) -- Keterangan
     Fasilitas & No. Urut per barang di Cek PIB/PEB. Dokumen yang tidak
     ditautkan ke barang mana pun (fasilitasUmum) tidak ikut: di draft ia
     tidak tercantum pada barang mana pun, walau form jadwal
     menerapkannya ke semua barang. */
  const fasilitasBarang = barang.map((row) => {
    const seri = kunciSeri(row["SERI BARANG"]);
    return { seri, dokumen: (skbBySeriBarang.get(seri) || []).map((sk) => ({ ...sk })) };
  });
  return {
    fields,
    items,
    notes,
    modeHint,
    source: "excel",
    kolomBarang,
    fasilitasBarang,
    fasilitasUmum: fasilitasUmum.map((sk) => ({ ...sk })),
    kontainer: daftarKontainer,
  };
}
