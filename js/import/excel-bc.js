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
function buildImportedNamaBarang(row) {
  let desc = excelStr(row["URAIAN"]);
  const merek = excelStr(row["MEREK"]);
  const tipe = excelStr(row["TIPE"]);
  const isPlaceholder = (v) => !v || v === "-" || /^TANPA\s/i.test(v);
  const parts = [];
  if (!isPlaceholder(merek)) parts.push(merek);
  if (!isPlaceholder(tipe)) parts.push(tipe);
  if (parts.length) desc += (desc ? " " : "") + parts.join(" ");
  return stripFieldLabels(desc);
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
  const barang = sheetRows(wb, "BARANG");

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
      "Baris respons dengan KODE RESPON=2003 (SPPB terbit) tidak ditemukan di sheet RESPON — Tanggal SPPB fallback ke HEADER.TANGGAL DAFTAR, cek manual.",
    );
  }

  const fields = {
    noAju: excelStr(header["NOMOR AJU"]),
    docNo: excelStr(header["NOMOR DAFTAR"]),
    docDate: respTanggal || excelValueToISODate(header["TANGGAL DAFTAR"]),
    incoterm: excelStr(header["KODE INCOTERM"]).toUpperCase(),
    party: shipper ? excelStr(shipper["NAMA ENTITAS"]) : "",
    invoice: findDokumen("380"),
    masterBL: findDokumen("740", "742"),
    houseBL: findDokumen("741", "743"),
    freight: header["FREIGHT"] != null ? excelNum(header["FREIGHT"]) : null,
    insurance:
      header["ASURANSI"] != null ? excelNum(header["ASURANSI"]) : null,
    ndpbm: header["NDPBM"] != null ? excelNum(header["NDPBM"]) : null,
    origin: excelStr(header["KODE PELABUHAN MUAT"]),
    destination: excelStr(header["KODE PELABUHAN TUJUAN"]),
    actual: excelValueToISODate(header["TANGGAL TIBA"]),
    etd: excelValueToISODate(header["TANGGAL BERANGKAT"]),
    vessel: excelStr(pengangkut["NAMA PENGANGKUT"]),
    voyage: excelStr(pengangkut["NOMOR PENGANGKUT"]),
    transport,
    package: packageStr,
    container: containerStr,
    bm: sumBarangTarif("BM"),
    ppn: sumBarangTarif("PPN"),
    pph: sumBarangTarif("PPH"),
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
    const cifSubtotal = excelNum(row["CIF"]);
    return {
      seriBarang:
        row["SERI BARANG"] != null ? String(row["SERI BARANG"]).trim() : "",
      namaBarang: buildImportedNamaBarang(row),
      hsCode: excelStr(row["HS"]),
      satuan: excelStr(row["KODE SATUAN"]),
      qty,
      harga: qty ? roundNum(cifSubtotal / qty, 4) : 0,
      netto: excelNum(row["NETTO"]),
      bruto: excelNum(row["BRUTO"]),
      /* Kemasan PER BARANG ada di sheet BARANG sendiri (kolom JUMLAH
         KEMASAN + KODE KEMASAN), terpisah dari sheet KEMASAN yang
         memuat total per pengajuan. Keduanya dipakai: yang ini mengisi
         kolom Kemasan di tiap baris barang, yang satunya mengisi Total
         Package di kaki tabel. */
      package: (() => {
        const jml = row["JUMLAH KEMASAN"];
        const kode = excelStr(row["KODE KEMASAN"]);
        const angka = jml != null && jml !== "" ? excelNum(jml) : "";
        return [angka === "" ? "" : angka, kode].filter((v) => v !== "").join(" ");
      })(),
    };
  });
  const anyItemBruto = itemsRaw.some((it) => it.bruto > 0);
  if (!anyItemBruto && headerBruto > 0 && itemsRaw.length) {
    itemsRaw[0].bruto = headerBruto;
    notes.push(
      `Bruto per barang tidak ada di file ini — total Bruto dari HEADER (${fmtNum(headerBruto)} Kg) ditaruh di baris barang pertama, sesuaikan manual per barang kalau perlu.`,
    );
  }
  const items = itemsRaw.map((it) => {
    const { seriBarang, ...rest } = it;
    return {
      ...newItem(),
      ...rest,
      jenisBarang: "Bahan Baku",
      skb: (skbBySeriBarang.get(seriBarang) || []).map((sk) => ({ ...sk })),
    };
  });

  if (skbBySeriBarang.size) {
    notes.push(
      "Fasilitas SKB PPH (kode 457) & SKB COO/E-COO (kode 860) diisi per barang sesuai pemetaan di sheet BARANGDOKUMEN — cek tiap barang lewat tombol Fasilitas kalau ada yang perlu disesuaikan.",
    );
  } else {
    notes.push(
      "SKB PPH (kode 457) & SKB COO (kode 860) tidak ditemukan lewat pemetaan BARANGDOKUMEN+DOKUMEN — cek manual di tab Daftar Barang kalau seharusnya ada.",
    );
  }

  if (!items.length) {
    notes.push(
      "Sheet BARANG kosong/tidak ditemukan — daftar barang tidak terisi otomatis, tambahkan manual.",
    );
  }
  if (!fields.party) {
    notes.push(
      "Nama Shipper (KODE ENTITAS=9) tidak ditemukan di sheet ENTITAS.",
    );
  }
  if (!fields.masterBL && !fields.houseBL) {
    notes.push(
      "Master/House BL/AWB tidak ditemukan di sheet DOKUMEN (kode 740/741/742/743).",
    );
  }
  if (!transport) {
    notes.push(
      "Moda transportasi tidak terdeteksi dari KODE CARA ANGKUT — cek manual di tab Transportasi.",
    );
  }
  if (!fields.bm && sumBarangTarif("BM") == null) {
    notes.push(
      "Bea Masuk/PPN/PPH tidak ditemukan di sheet BARANGTARIF — isi manual di tab Kepabeanan.",
    );
  }

  return { fields, items, notes, modeHint, source: "excel" };
}
