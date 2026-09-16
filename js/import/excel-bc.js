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
function sheetRows(wb, name) {
  if (!wb.Sheets[name]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
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

// Deskripsi barang: URAIAN + Merk/Tipe
/* Uraian & Size (Export) TERPISAH sejak sekarang -- lihat komentar
   panjang di body.mode-import .size-col, form.css. Diverifikasi ke
   berkas CEISA Export sungguhan: MEREK di sana SELALU "-" (placeholder,
   tidak pernah benar-benar diisi), dan TIPE berisi kode
   model+ukurannya sekaligus (mis. "MAGNETAR A/T 235/55R20") -- itu
   padanan CEISA yang paling dekat dengan "Size" yang dimaksud,
   walau isinya bukan cuma angka ukuran murni.
     Import  : URAIAN + MEREK + TIPE digabung jadi satu (tidak
               ada kolom Size di Import).
     Export  : namaBarang = URAIAN (+ MEREK kalau bukan placeholder),
               size = TIPE — dua field terpisah, bukan digabung. */
function buildImportedNamaBarang(row, modeHint) {
  let desc = excelStr(row["URAIAN"]);
  const merek = excelStr(row["MEREK"]);
  const tipe = excelStr(row["TIPE"]);
  const isPlaceholder = (v) => !v || v === "-" || /^TANPA\s/i.test(v);
  const parts = [];
  if (!isPlaceholder(merek)) parts.push(merek);
  if (modeHint !== "export" && !isPlaceholder(tipe)) parts.push(tipe);
  if (parts.length) desc += (desc ? " " : "") + parts.join(" ");
  return stripFieldLabels(desc);
}
function buildImportedSize(row) {
  const tipe = excelStr(row["TIPE"]);
  const isPlaceholder = (v) => !v || v === "-" || /^TANPA\s/i.test(v);
  return isPlaceholder(tipe) ? "" : stripFieldLabels(tipe);
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
  /* Ascending NUMERIK berdasar SERI BARANG, bukan urutan baris apa
     adanya di sheet BARANG. Baris mentah CEISA TIDAK selalu berurutan
     (nemu di data sungguhan: 1, 4, 3, 2, 6, ... — bukan salah baca,
     memang begitu urutan exportnya), dan Seri Barang non-numerik
     (jarang, tapi mungkin) didorong ke BELAKANG lewat Infinity supaya
     tidak ikut menyerobot ke depan cuma karena NaN < angka bernilai
     false di sort(). Ini urutan yang lalu dipakai APA ADANYA untuk
     nomor Seri Barang yang ditampilkan (lihat item-table.js — dihitung
     dari POSISI baris, bukan disimpan ulang di sini), jadi sortir di
     sinilah yang menentukan baris mana jadi "Seri Barang 1" dst. */
  const barang = sheetRows(wb, "BARANG")
    .slice()
    .sort((a, b) => {
      const sa = Number(a["SERI BARANG"]);
      const sb = Number(b["SERI BARANG"]);
      return (isFinite(sa) ? sa : Infinity) - (isFinite(sb) ? sb : Infinity);
    });

  const findDokumen = (...codes) => {
    const row = dokumen.find((r) =>
      codes.includes(excelStr(r["KODE DOKUMEN"])),
    );
    return row ? excelStr(row["NOMOR DOKUMEN"]) : "";
  };
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

  const containerStr = kontainer
    .map((r) => {
      const no = excelStr(r["NOMOR KONTINER"]);
      const size = excelStr(r["KODE UKURAN KONTAINER"]);
      if (!no) return "";
      return size ? `${no} (${size})` : no;
    })
    .filter((v) => v)
    .join(", ");

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
  let bmFinal = bmTarif,
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
      if (bmFinal == null) bmFinal = roundNum(nilaiPabean * 0.05, 2);
      if (pphFinal == null) pphFinal = roundNum(nilaiPabean * 0.025, 2);
      if (ppnFinal == null)
        ppnFinal = roundNum((nilaiPabean + (bmFinal || 0)) * 0.11, 2);
      dutyDihitungRumus = true;
    }
  }

  const fields = {
    noAju: excelStr(header["NOMOR AJU"]),
    docNo: excelStr(header["NOMOR DAFTAR"]),
    docDate: respTanggal || excelValueToISODate(header["TANGGAL DAFTAR"]),
    incoterm: excelStr(header["KODE INCOTERM"]).toUpperCase(),
    party: shipper ? excelStr(shipper["NAMA ENTITAS"]) : "",
    invoice: findDokumen("380"),
    /* KODE DOKUMEN mengikuti daftar UN/EDIFACT 1001 yang dipakai BC 2.0:

         704  Master bill of lading      (laut, tingkat master)
         741  Master air waybill         (udara, tingkat master)
         705  Bill of lading             (laut, tingkat house)
         740  Air waybill                (udara, tingkat house)

       HATI-HATI untuk moda udara: 741 itu Master AWB dan 740 yang
       house — gampang tertukar kalau ditebak dari urutan angkanya. */
    masterBL: findDokumen("704", "741"),
    houseBL: findDokumen("705", "740"),
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
    bm: bmFinal,
    ppn: ppnFinal,
    pph: pphFinal,
  };

  // Fasilitas per barang (SKB PPH & SKB COO/E-COO) — dipetakan lewat BARANGDOKUMEN
  const dokumenBySeri = new Map(
    dokumen
      .filter((r) => r["SERI"] != null)
      .map((r) => [String(r["SERI"]).trim(), r]),
  );
  const FACILITY_DOC_JENIS = { 457: "PPH", 860: "E-COO" };
  const skbBySeriBarang = new Map();
  barangDokumen.forEach((row) => {
    const seriBarang = row["SERI BARANG"];
    const seriDokumen = row["SERI DOKUMEN"];
    if (seriBarang == null || seriDokumen == null) return;
    const docRow = dokumenBySeri.get(String(seriDokumen).trim());
    if (!docRow) return;
    const jenis = FACILITY_DOC_JENIS[excelStr(docRow["KODE DOKUMEN"])];
    if (!jenis) return;
    const key = String(seriBarang).trim();
    if (!skbBySeriBarang.has(key)) skbBySeriBarang.set(key, []);
    skbBySeriBarang.get(key).push({
      jenis,
      jenisLainnya: "",
      nomor: excelStr(docRow["NOMOR DOKUMEN"]),
      tanggal: excelValueToISODate(docRow["TANGGAL DOKUMEN"]),
    });
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
      seriBarang:
        row["SERI BARANG"] != null ? String(row["SERI BARANG"]).trim() : "",
      namaBarang: buildImportedNamaBarang(row, modeHint),
      // Size cuma relevan (dan cuma tampil) di Export -- lihat komentar
      // panjang di buildImportedNamaBarang() barusan.
      size: modeHint === "export" ? buildImportedSize(row) : "",
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
      jenisBarang: "BAHAN BAKU",
      skb: (skbBySeriBarang.get(seriBarang) || []).map((sk) => ({ ...sk })),
    };
  });

  if (skbBySeriBarang.size) {
    notes.push(
      t("y.fasilitas.diisi.per.barang"),
    );
  } else {
    notes.push(
      t("y.skb.tidak.ditemukan.pemetaan"),
    );
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

  return { fields, items, notes, modeHint, source: "excel" };
}
