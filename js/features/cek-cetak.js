"use strict";

/* ------------------------------------------------------------------
   CETAK DRAFT PIB / PEB BERSTABILO (halaman Cek PIB/PEB)

   Draft CEISA yang sedang diperiksa dicetak ulang SAMA PERSIS seperti
   PDF resmi PIB (BC 2.0) / PEB (BC 3.0): halaman muka, lembar lanjutan
   barang, lembar lanjutan dokumen. Tiap halaman satu SVG A4 (595 x 842
   pt) -- garis, kotak dan label formulir dari templat yang diukur dari
   PDF CEISA (cek-cetak-templat.js), isian ditulis di letak yang diukur
   dari PDF yang sama: ukuran huruf, jarak baris (1,1636 x ukuran),
   pemotongan baris menurut lebar huruf Helvetica/Arial (ttLebar,
   cipl-tata.js), isian yang terlalu panjang dipotong seperti cetakan
   CEISA. Isinya dari draft apa adanya: baris mentah sheet Excel CEISA
   (`bc.lembar`, parseBcExcelWorkbook).

   Isian yang MISMATCH diberi stabilo kuning dan nomor temuan merah.
   Lembar terakhir (Lembar Koreksi) merinci tiap nomor: letaknya di
   lembar, isi draft, isi yang seharusnya (jadwal / CIPL) dan catatannya
   -- siap diserahkan ke forwarder / PPJK untuk revisi.

   Tiap baris hasil dipetakan ke "slot" isian lembar (ppSlot): kunci
   baris jadwal (cekBarisJadwal), nama isian mesin, "Item n <kolom>"
   untuk barang, bagian FACILITY untuk dokumen. Baris yang tidak punya
   tempat di lembar tetap tercantum di Lembar Koreksi.

   Cetakan selalu berbahasa Indonesia, seperti dokumen pabeannya.
------------------------------------------------------------------ */

const ppTeks = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const ppAngka = (n, d) => {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "";
  return angkaLokal(Number(n), "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
// "#,##0.##" -- desimal hanya bila ada (8,480.6), seperti PEB
const ppAngkaBebas = (n, d) => {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "";
  return angkaLokal(Number(n), "en-US", { maximumFractionDigits: d == null ? 2 : d });
};
// Angka seperti ditulis CEISA di NDPBM PIB (Double Java): 16870 -> "16870.0"
const ppAngkaJava = (n) => {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "";
  const x = Number(n);
  return Number.isInteger(x) ? `${x}.0` : String(x);
};
const ppTgl = (v) => {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v) : excelValueToISODate(v) || EximEngine.normalizeDate(v || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ppTeks(v);
};

/* ---------------- referensi tercetak ----------------
   Nama seperti TERCETAK di PIB/PEB CEISA: dari tabel Referensi CEISA
   (core/referensi-ceisa.js) & daftar pilihan Data PIB/PEB, ditambah
   yang tidak ada di sana. Kode di luar daftar ditulis kodenya saja --
   tidak pernah ditebak. */
const PP_CARA_ANGKUT = { 1: "LAUT", 2: "KERETA API", 3: "DARAT", 4: "UDARA", 5: "POS", 6: "MULTIMODA", 7: "INSTALASI/PIPA", 8: "PERAIRAN", 9: "LAINNYA" };
const PP_PELABUHAN = {
  IDTPP: "TANJUNG PRIOK", IDCGK: "CENGKARENG / SOEKARNO HATTA (U)", KRPUS: "BUSAN (EX PUSAN)", KRICN: "INCHEON INTL APT/SEOUL",
  VNSGN: "HO CHI MINH CITY", CNTAO: "QINGDAO", HKHKG: "HONG KONG",
};
const PP_TPS = { NCT1: "NEW PORT CONTAINER TERMINAL ONE", CIMP: "GUDANG CARDIG IMPOR" };
const PP_VALUTA = { EUR: "EURO" };
const PP_SATUAN = {
  NIU: "NUMBER OF INTERNATIONAL UNITS", PCE: "PIECE", SET: "SET", EA: "EACH", KGM: "KILOGRAM", GRM: "GRAM", TNE: "TONNE (METRIC TON)",
  MTR: "METRE", MTK: "SQUARE METRE", MTQ: "CUBIC METRE", LTR: "LITRE", PR: "PAIR", DZN: "DOZEN", C62: "ONE",
};
const PP_DOKUMEN = { 703: "HOUSE B/L", 714: "HOUSE B/L" };
// KODE FASILITAS TARIF barang: singkatan di kolom 34 PIB ("BM 10% 100% BBS")
// dan kolom tabel pungutan PIB (Dibayar, Ditanggung, Ditunda, Tidak
// Dipungut, Dibebaskan, Telah Dilunasi) -- 5 = Dibebaskan, seperti PDF PIB
const PP_SINGKAT_FASILITAS = { 2: "DTP", 3: "DTD", 4: "TDP", 5: "BBS", 6: "LNS" };
const PP_KOLOM_FASILITAS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

const ppNamaRef = (tabel, kode) => {
  const k = ppTeks(kode).toUpperCase();
  const r = k && typeof REF_CEISA !== "undefined" ? (REF_CEISA[tabel] || []).find(([x]) => x === k) : null;
  return r ? r[1] : "";
};
// Nama pilihan Data PIB/PEB ("1" -> "EKSPOR BIASA"); kode "02" = "2"
const ppNamaPilihan = (pilihan, kode) => {
  const k = ppTeks(kode);
  const sama = (x) => x === k || (/^\d+$/.test(x) && /^\d+$/.test(k) && Number(x) === Number(k));
  const r = k ? (DP_PILIHAN[pilihan] || []).find(([x]) => sama(x)) : null;
  return r ? r[1] : "";
};
const ppNamaKemasan = (kode) => ppNamaRef("kemasan", kode) || ppTeks(kode);
const ppNamaValuta = (kode) => ppNamaRef("valuta", kode) || PP_VALUTA[ppTeks(kode).toUpperCase()] || "";
const ppNamaNegara = (kode) => ((NEGARA_PER_KODE.get(ppTeks(kode).toUpperCase()) || [])[2] || ppTeks(kode)).toUpperCase();
const ppNamaDokumen = (kode) => ppNamaRef("dokumen", kode) || PP_DOKUMEN[ppTeks(kode)] ||
  ((KODE_DOKUMEN_CEISA[ppTeks(kode)] || [])[0] || (ppTeks(kode) ? `DOKUMEN KODE ${ppTeks(kode)}` : "")).toUpperCase();
const ppNamaKode = (peta, kode) => (ppTeks(kode) ? peta[ppTeks(kode)] || "" : "");
const ppKantor = (kode) => ppNamaPilihan("kantor", kode);
function ppPelabuhan(kode) {
  const k = ppTeks(kode).toUpperCase();
  if (!k) return { kode: "", nama: "" };
  if (PP_PELABUHAN[k]) return { kode: k, nama: PP_PELABUHAN[k] };
  const e = resolvePortEntry(k);
  return { kode: k, nama: e ? e.name.split(",")[0].toUpperCase() : "" };
}

/* Kode entitas CEISA per pihak lembar */
const PP_PIHAK = {
  pib: { pengirim: "9", penjual: "10", importir: "1", pemilik: "7", ppjk: "4", pemusatan: "11" },
  peb: { eksportir: "2", pemilik: "7", pembeli: "6", penerima: "8", ppjk: "4", konsolidator: "23" },
};
const PP_NAMA_PIHAK = {
  pib: { 1: "Importir", 4: "PPJK", 7: "Pemilik Barang", 9: "Pengirim", 10: "Penjual", 11: "NPWP Pemusatan" },
  peb: { 2: "Eksportir", 4: "PPJK", 6: "Pembeli", 7: "Pemilik Barang", 8: "Penerima", 23: "Pihak yang Melakukan Konsolidasi" },
};

/* ---------------- baris hasil -> slot isian lembar ---------------- */

const PP_KUNCI_JADWAL = {
  aju: ["aju"], docNo: ["daftar"], invoice: ["invoice"], invoiceDate: ["invoice"], polis: ["dok:530"], polisDate: ["dok:530"],
  moda: ["moda"], kapal: ["kapal"], muat: ["muat"], tujuan: ["tujuan"], negaraTujuan: ["negaraTujuan"], incoterm: ["incoterm"],
  freight: ["freight"], asuransi: ["asuransi"], ndpbm: ["ndpbm"], nilaiPabeanRp: ["nilaiPabeanRp"], kemasan: ["kemasan"], kontainer: ["kontainer"],
  netto: ["netto"], bruto: ["bruto"], etd: ["tglEkspor"], packingList: ["packingList"],
};
const PP_KUNCI_MESIN = {
  "Invoice Number": ["invoice"], "Invoice Date": ["invoice"], "Packing List Number": ["packingList"], "Packing List Date": ["packingList"],
  "Estimated Export Date": ["tglEkspor"], "Departure Date (CIPL)": ["tglEkspor"], "Transport Mode": ["moda"],
  "Country of Destination": ["negaraTujuan"], "Port of Loading": ["muat"], "Port of Destination": ["tujuan"], "Vessel / Voyage": ["kapal"],
  Currency: ["valuta"], Incoterm: ["incoterm"], "Net Weight Total": ["netto"], "Gross Weight Total": ["bruto"], "Package Count": ["kemasan"],
  "Kode Kantor": ["kantor"], "Kode Kantor Bongkar": ["kantor"], "Kode Kantor Ekspor": ["kantorEkspor"], "Invoice Type": ["entitas:6", "entitas:8"],
};
const PP_KOLOM_BARANG = [
  [/^(?:existence|not found in CIPL)?$/, ""], [/^HS Code$/, "hs"], [/^(?:Description|Uraian)$/, "uraian"], [/^(?:Type \/ Specification|Tipe)$/, "tipe"],
  [/^(?:Brand|Merek)$/, "merek"], [/^Ukuran$/, "ukuran"], [/^Spesifikasi Lain$/, "spek"], [/^Kode Barang$/, "kode"], [/^Quantity$/, "qty"],
  [/^Unit$/, "satuan"], [/^Amount \//, "nilai"], [/^Net Weight$/, "netto"], [/^Kode Kondisi Barang$/, "kondisi"], [/^Kode Negara Asal$/, "negara"],
  [/^Fasilitas/, "fasilitas"],
];

function ppSlot(x, isPeb) {
  if (x.kunci) {
    if (x.kunci === "pihak") return isPeb ? ["entitas:6", "entitas:8"] : ["entitas:9", "entitas:10"];
    if (/^(?:dp|barang|dok):/.test(x.kunci)) return [x.kunci];
    return PP_KUNCI_JADWAL[x.kunci] || [];
  }
  const f = ppTeks(x.field);
  let m = /^(?:(?:PIB|PEB) )?Item (\S+)(?: (.*?))?(?: not found in CIPL)?$/.exec(f);
  if (m && x.section === "ITEM") {
    const k = PP_KOLOM_BARANG.find(([re]) => re.test(m[2] || ""));
    return k ? [`barang:${m[1]}${k[1] ? ":" + k[1] : ""}`] : [`barang:${m[1]}`];
  }
  m = /\(Entity (\d+)(?:\/(\d+))?\)/.exec(f);
  if (m) return [m[1], m[2]].filter(Boolean).map((k) => `${/Tax ID/.test(f) ? "entitasId" : "entitas"}:${k}`);
  m = /^(Master|House) BL \/ AWB (?:Number|Date)$/.exec(f);
  if (m) return [`bl:${m[1].toLowerCase()}`];
  if (/^Total Amount \//.test(f)) return ["nilai"];
  if (PP_KUNCI_MESIN[f]) return PP_KUNCI_MESIN[f];
  if (x.section === "FACILITY") {
    if (/\bPI\b/.test(f)) return ["dok:959"];
    if (/\bLS\b/.test(f)) return ["dok:958"];
    if (/Masterlist/i.test(f)) return ["dok:912"];
    if (/SKB PPN/i.test(f)) return ["dok:456"];
    if (/SKB PPh/i.test(f)) return ["dok:457"];
    if (/COO/.test(f)) return ["dok:860", "dok:861"];
  }
  return [];
}

/* Letak slot di lembar, untuk Lembar Koreksi */
const PP_LABEL = {
  pib: {
    aju: "Nomor Pengajuan", daftar: "G. Nomor dan Tanggal Pendaftaran", kantor: "Kantor Pabean", moda: "9. Cara Pengangkutan",
    kapal: "10. Nama Sarana Pengangkutan & No. Voy/Flight", muat: "12. Pelabuhan Muat", tujuan: "14. Pelabuhan Tujuan", negaraTujuan: "Negara Tujuan",
    invoice: "15. Invoice", "bl:house": "17. House-BL/AWB", "bl:master": "17. Master-BL/AWB", valuta: "21. Valuta", ndpbm: "22. NDPBM",
    incoterm: "23. Nilai (dasar nilai)", nilai: "23. Nilai", nilaiPabeanRp: "26. Nilai Pabean (Rp)", asuransi: "24. Asuransi/LDN", freight: "25. Freight",
    kontainer: "27. Nomor, Ukuran, dan Tipe Peti Kemas", kemasan: "28. Jumlah, Jenis, dan Merek Kemasan", bruto: "29. Berat Kotor (Kg)",
    netto: "30. Berat Bersih (Kg)", packingList: "Lembar Dokumen: Packing List (217)",
  },
  peb: {
    aju: "Nomor Pengajuan", daftar: "H.1 Nomor Pendaftaran", kantor: "A.1 Kantor Pabean Pemuatan", kantorEkspor: "A.2 Kantor Pabean Ekspor",
    moda: "21. Cara Pengangkutan", kapal: "22-23. Sarana Pengangkut & No. Voy/Flight", tglEkspor: "24. Tanggal Perkiraan Ekspor",
    muat: "25. Pelabuhan Muat Asal", tujuan: "28. Pelabuhan Tujuan", negaraTujuan: "29. Negara Tujuan Ekspor", invoice: "30. No & Tgl Invoice",
    packingList: "31. No & Tgl Packing List", incoterm: "35. Cara Penyerahan Barang", valuta: "37. Jenis Valuta", nilai: "38. Jumlah Nilai Ekspor",
    freight: "39. Biaya Pengangkutan", asuransi: "40. Asuransi (LN/DN)", kontainer: "43. No, Ukuran, Jenis Muatan & Tipe Peti Kemas",
    kemasan: "44. Jenis, Jumlah dan Merek Kemasan", bruto: "45. Berat Kotor (kg)", netto: "46. Berat Bersih (kg)", ndpbm: "55. Nilai Tukar Mata Uang",
    "bl:house": "Lembar Dokumen: B/L-AWB (House)", "bl:master": "Lembar Dokumen: B/L-AWB (Master)",
  },
};
const PP_LABEL_BARANG = {
  pib: {
    hs: "32. Pos Tarif HS", kode: "32. Kode Barang", uraian: "32. Uraian", merek: "32. Merk", tipe: "32. Tipe", ukuran: "32. Ukuran",
    spek: "32. Spesifikasi lain", kondisi: "32. Kondisi Barang", negara: "32. Negara Asal Barang", fasilitas: "33. Fasilitas & No. Urut",
    qty: "35. Jumlah Satuan Barang", satuan: "35. Jenis Satuan Barang", netto: "35. Berat Bersih (Kg)", nilai: "36. Nilai Pabean",
    tarifBm: "34. Tarif BM", tarifPph: "34. Tarif PPh", metodeNilai: "36. Metode Penentuan Nilai Pabean",
    bedaHargaLevel: "36. Perbedaan Harga terkait Level Perdagangan", jenisVd: "36. Jenis V D", nilaiVd: "36. Nilai yang Ditambahkan",
    jatuhTempo: "36. Jatuh Tempo",
  },
  peb: {
    hs: "48. Pos Tarif/HS", kode: "48. Kode Barang", uraian: "48. Uraian", merek: "48. Merk", tipe: "48. Tipe", ukuran: "48. Ukuran",
    spek: "48. Spesifikasi Wajib", kondisi: "Kondisi Barang", negara: "52. Negara Asal Barang", fasilitas: "49. Perizinan Ekspor & No. Urut",
    qty: "51. Jumlah Satuan Barang", satuan: "51. Jenis Satuan Barang", netto: "51. Berat Bersih (kg)", nilai: "54. Nilai Ekspor",
    jenisEkspor: "48. Jenis Ekspor", he: "50. HE Barang", tarifBk: "50. Tarif Bea Keluar", daerahAsal: "53. Daerah Asal Barang",
  },
};
function ppLabelSlot(slot, dok) {
  const [a, b, c] = slot.split(":");
  if (a === "barang") return `Barang ${b}${c ? ` — ${PP_LABEL_BARANG[dok][c] || c}` : ""}`;
  if (a === "entitas" || a === "entitasId") {
    const nama = PP_NAMA_PIHAK[dok][b] || `Entitas ${b}`;
    return a === "entitasId" ? `${nama} — Identitas / NPWP` : nama;
  }
  if (a === "dok") return `Lembar Dokumen: ${ppNamaDokumen(b)} (${b})`;
  if (a === "dp") return typeof dpLabelKunci === "function" ? dpLabelKunci(slot.slice(3)) : "";
  return PP_LABEL[dok][slot] || "";
}

/* Temuan bernomor: MISMATCH saja, urut seperti daftar hasil */
function ppTemuan(res, isPeb) {
  return (res.checks || []).filter((x) => x.status === "MISMATCH").map((x, i) => ({ no: i + 1, x, slot: ppSlot(x, isPeb) }));
}

/* Nomor temuan per slot: no(slot | [slot]) -> [nomor] */
function ppPenanda(temuan) {
  const per = new Map();
  temuan.forEach((tm) =>
    tm.slot.forEach((s) => {
      if (!per.has(s)) per.set(s, []);
      per.get(s).push(tm.no);
    }),
  );
  const no = (slot) => [...new Set([].concat(slot || []).filter(Boolean).flatMap((s) => per.get(s) || []))].sort((a, b) => a - b);
  return { no, ada: (slot) => no(slot).length > 0 };
}

/* ---------------- kanvas SVG satu halaman ----------------
   Koordinat dalam pt dari kiri-atas halaman; `atas` = tepi atas kotak
   huruf seperti diukur dari PDF (garis dasar = atas + 0,793 x ukuran). */

const PP_DASAR = 0.793;
const PP_JARAK = 1.1636;
const ppLebar = (teks, s) => ttLebar(teks, ttH("arial", s));
const ppR = (v) => Math.round(v * 100) / 100;

/* Baris [awal, akhir) dari teks P (boleh berisi "\n") selebar w pt.
   Dipecah seperti JasperReports (pembuat PDF CEISA): di spasi dan
   SESUDAH tanda hubung ("GBF-700-" / "0023"); potongan yang lebih
   panjang dari satu baris dipotong per huruf. */
function ppPecahBaris(P, s, w) {
  const hasil = [];
  let mulai = 0;
  P.split("\n").forEach((para) => {
    const off = mulai;
    mulai += para.length + 1;
    if (!w) {
      hasil.push([off, off + para.length]);
      return;
    }
    let a = null;
    let b = null;
    const re = /[^\s-]*-+|[^\s-]+/g;
    let m;
    while ((m = re.exec(para))) {
      const ta = off + m.index;
      const tb = ta + m[0].length;
      if (a != null && ppLebar(P.slice(a, tb), s) <= w) {
        b = tb;
        continue;
      }
      if (a != null) hasil.push([a, b]);
      a = ta;
      b = tb;
      while (ppLebar(P.slice(a, b), s) > w && b - a > 1) {
        let n = b - a - 1;
        while (n > 1 && ppLebar(P.slice(a, a + n), s) > w) n--;
        hasil.push([a, a + n]);
        a += n;
      }
    }
    hasil.push(a == null ? [off, off] : [a, b]);
  });
  return hasil;
}
const ppJumlahBaris = (teks, s, w) => ppPecahBaris(String(teks == null ? "" : teks), s, w).length;

function ppKanvas(pn) {
  const garis = new Map();
  const latar = [];
  const tinta = [];
  const g = (w, d) => {
    const k = String(w || 0.5);
    if (!garis.has(k)) garis.set(k, []);
    garis.get(k).push(d);
  };
  const tulis = (x, top, s, teks, rata, kelas) => {
    if (!teks) return;
    const anchor = rata === "kanan" ? ' text-anchor="end"' : rata === "tengah" ? ' text-anchor="middle"' : "";
    tinta.push(`<text x="${ppR(x)}" y="${ppR(top + PP_DASAR * s)}" font-size="${s}"${anchor}${kelas ? ` class="${kelas}"` : ""}>${escapeHtml(teks)}</text>`);
  };
  const kiri = (x, w, rata) => (rata === "kanan" ? x - w : rata === "tengah" ? x - w / 2 : x);
  const stabilo = (x0, top, s, w) => latar.push(`<rect x="${ppR(x0 - 0.6)}" y="${ppR(top - 0.4)}" width="${ppR(w + 1.2)}" height="${ppR(s + 0.8)}"/>`);
  const nomor = (x0, x1, top, s, nos, rata) => {
    const sn = Math.max(3.6, ppR(s * 0.72));
    const label = nos.join(",");
    const x = rata === "kanan" ? x0 - 0.8 - ppLebar(label, sn) : x1 + 0.8;
    tinta.push(`<text x="${ppR(x)}" y="${ppR(top + sn * 0.62)}" font-size="${sn}" class="no">${label}</text>`);
  };

  return {
    /* Templat lembar. o.judul: teks/garis di atas y ini (judul lembar)
       dibuang; o.dy: geser tegak sisanya. */
    templat(tpl, o) {
      const op = o || {};
      const dy = op.dy || 0;
      const judul = op.judul;
      const angka = (s) => s.split(" ").map(Number);
      (tpl.h || "").split("|").filter(Boolean).forEach((x) => {
        const [y, x0, x1, w] = angka(x);
        if (judul != null && y < judul) return;
        g(w, `M${ppR(x0)} ${ppR(y + dy)}H${ppR(x1)}`);
      });
      (tpl.v || "").split("|").filter(Boolean).forEach((x) => {
        const [xv, y0Asli, y1, w] = angka(x);
        if (judul != null && y1 <= judul) return;
        const y0 = judul != null ? Math.max(y0Asli, judul - 0.25) : y0Asli;
        g(w, `M${ppR(xv)} ${ppR(y0 + dy)}V${ppR(y1 + dy)}`);
      });
      (tpl.r || "").split("|").filter(Boolean).forEach((x) => {
        const [xr, yr, wr, hr, lw] = angka(x);
        g(lw, `M${ppR(xr)} ${ppR(yr + dy)}h${ppR(wr)}v${ppR(hr)}h${ppR(-wr)}Z`);
      });
      (tpl.t || []).forEach(([x, top, s, teks]) => {
        if (judul != null && top < judul) return;
        tulis(x, top + dy, s, teks);
      });
    },
    h(y, x0, x1, w) {
      g(w, `M${ppR(x0)} ${ppR(y)}H${ppR(x1)}`);
    },
    v(x, y0, y1, w) {
      g(w, `M${ppR(x)} ${ppR(y0)}V${ppR(y1)}`);
    },
    teks(x, top, s, isi, rata) {
      tulis(x, top, s, String(isi == null ? "" : isi), rata);
    },
    catatan(x, top, s, isi) {
      tulis(x, top, s, isi, "", "cat");
    },
    putar(x, y, s, isi) {
      tinta.push(`<text transform="translate(${ppR(x)} ${ppR(y)}) rotate(-90)" font-size="${s}" text-anchor="middle">${escapeHtml(isi)}</text>`);
    },
    /* Satu isian. o: slot, w (lebar bungkus), maks (baris), lh (jarak
       baris), rata ("kanan"/"tengah"), besar (huruf besar), baris (boleh
       "\n"), mentah (spasi tidak dirapatkan), kosong (teks bila kosong).
       Isian bertemuan yang kosong ditulis "—" distabilo. Mengembalikan
       jumlah baris. */
    isian(x, top, s, nilai, o) {
      const op = o || {};
      // mentah: spasi ganda dipertahankan ("SKLU2350015 /  20 FEET /  FCL", seperti PEB)
      const rapi = op.mentah ? (x) => String(x).trim() : ppTeks;
      let P = op.baris || op.mentah
        ? String(nilai == null ? "" : nilai).split(/\r?\n/).map(rapi).filter(Boolean).join("\n")
        : ppTeks(nilai);
      if (op.besar) P = P.toUpperCase();
      const nos = pn.no(op.slot);
      if (!P) P = nos.length ? "—" : op.kosong || "";
      if (!P) return 0;
      const baris = ppPecahBaris(P, s, op.w);
      const tampil = op.maks ? baris.slice(0, op.maks) : baris;
      const lh = op.lh || s * PP_JARAK;
      let akhir = null;
      tampil.forEach(([a, b], i) => {
        const ln = P.slice(a, b);
        const y = top + i * lh;
        tulis(x, y, s, ln, op.rata);
        if (nos.length && ln) {
          const w = ppLebar(ln, s);
          const x0 = kiri(x, w, op.rata);
          stabilo(x0, y, s, w);
          akhir = { x0, x1: x0 + w, y };
        }
      });
      if (akhir) nomor(akhir.x0, akhir.x1, akhir.y, s, nos, op.rata);
      return tampil.length;
    },
    /* Paragraf berpotongan: runs [{ t, slot }] dibungkus bersama; hanya
       potongan yang bertemuan yang distabilo. Mengembalikan jumlah baris. */
    paragraf(x, top, s, runs, o) {
      const op = o || {};
      const lh = op.lh || s * PP_JARAK;
      let P = "";
      const pos = runs.map((r) => {
        const nos = r.slot ? pn.no(r.slot) : [];
        let isi = r.slot ? ppTeks(r.t) : String(r.t == null ? "" : r.t);
        if (!isi && nos.length) isi = "—";
        const hasil = { a: P.length, b: P.length + isi.length, nos, akhir: null };
        P += isi;
        return hasil;
      });
      if (!P.trim()) return 0;
      const baris = ppPecahBaris(P, s, op.w);
      const tampil = op.maks ? baris.slice(0, op.maks) : baris;
      tampil.forEach(([a, b], i) => {
        const y = top + i * lh;
        tulis(x, y, s, P.slice(a, b));
        pos.forEach((r) => {
          if (!r.nos.length) return;
          let u = Math.max(a, r.a);
          let v = Math.min(b, r.b);
          while (u < v && P[u] === " ") u++;
          while (v > u && P[v - 1] === " ") v--;
          if (u >= v) return;
          const x0 = x + ppLebar(P.slice(a, u), s);
          const w = ppLebar(P.slice(u, v), s);
          stabilo(x0, y, s, w);
          r.akhir = { x0, x1: x0 + w, y };
        });
      });
      pos.forEach((r) => r.akhir && nomor(r.akhir.x0, r.akhir.x1, r.akhir.y, s, r.nos));
      return tampil.length;
    },
    svg() {
      const jalur = [...garis].map(([w, d]) => `<path stroke-width="${w}" d="${d.join("")}"/>`).join("");
      return `<svg class="pp-hal" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 841.3" width="210mm" height="296.8mm">`
        + `<g class="stb">${latar.join("")}</g><g class="grs" fill="none" stroke="#000">${jalur}</g><g class="tks">${tinta.join("")}</g></svg>`;
    },
  };
}

/* ---------------- data draft (baris mentah sheet CEISA) ---------------- */

function ppData(k) {
  const decl = k.decl || {};
  const bc = k.bc || {};
  const L = bc.lembar || {};
  const h = L.header || {};
  const isPeb = decl.type === "PEB";
  const s = ppTeks;
  const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const urutSeri = (arr, kol) => (arr || []).slice().sort((a, b) => Number(kunciSeri(a[kol])) - Number(kunciSeri(b[kol])));

  const pihak = {};
  Object.entries(PP_PIHAK[isPeb ? "peb" : "pib"]).forEach(([nama, kode]) => {
    const r = (L.entitas || []).find((x) => s(x["KODE ENTITAS"]) === kode);
    if (!r) return;
    const id = s(r["NOMOR IDENTITAS"]).replace(/\D/g, "");
    pihak[nama] = {
      kode, npwp: id.length === 22 ? id.slice(0, 16) : id, nitku: id.length === 22 ? id : "",
      nama: s(r["NAMA ENTITAS"]), alamat: String(r["ALAMAT ENTITAS"] == null ? "" : r["ALAMAT ENTITAS"]),
      negara: s(r["KODE NEGARA"]).toUpperCase(), status: s(r["KODE STATUS"]), nib: s(r["NIB ENTITAS"]),
      afiliasi: s(r["KODE AFILIASI"]), kategori: s(r["KODE KATEGORI KONSOLIDATOR"]), izin: s(r["NOMOR IJIN ENTITAS"]),
    };
  });

  const docs = urutSeri(L.dokumen, "SERI").map((r) => ({
    seri: kunciSeri(r["SERI"] != null ? r["SERI"] : r["SERI DOKUMEN"]), kode: s(r["KODE DOKUMEN"]), nomor: s(r["NOMOR DOKUMEN"]),
    tanggal: excelValueToISODate(r["TANGGAL DOKUMEN"]), fasilitas: s(r["KODE FASILITAS"]),
  }));
  const dokPertama = (kode) => docs.find((d) => [].concat(kode).includes(d.kode)) || null;

  const angkut = (L.pengangkut || [])[0] || {};
  const kontainer = urutSeri(L.kontainer, "SERI").map((r) => ({
    nomor: s(r["NOMOR KONTINER"] || r["NOMOR KONTAINER"]), ukuran: s(r["KODE UKURAN KONTAINER"]),
    jenis: muatanDariKode(r["KODE JENIS KONTAINER"]) || s(r["KODE JENIS KONTAINER"]),
  }));
  const kemasan = urutSeri(L.kemasan, "SERI").map((r) => ({
    jumlah: n(r["JUMLAH KEMASAN"]), kode: s(r["KODE KEMASAN"]).toUpperCase(), merek: s(r["MEREK"]),
  }));

  const daerah = (kode) => {
    const k2 = s(kode);
    if (!k2) return "";
    const nama = ppNamaRef("daerah", k2);
    return nama ? `${nama} (${k2})` : k2;
  };
  const barang = (L.barang || []).map((r) => {
    const seri = kunciSeri(r["SERI BARANG"]);
    const tarif = (L.barangTarif || []).filter((x) => kunciSeri(x["SERI BARANG"]) === seri);
    const urutTarif = ["BM", "PPH", "PPN"];
    const posisi = (x) => {
      const i = urutTarif.indexOf(s(x["KODE PUNGUTAN"]).toUpperCase());
      return i < 0 ? urutTarif.length : i;
    };
    const tarifUrut = tarif.slice().sort((a, b) => posisi(a) - posisi(b));
    const barisTarif = tarifUrut.map((x) => {
      const kode = s(x["KODE PUNGUTAN"]).toUpperCase();
      let tarifPersen = n(x["TARIF"]) || 0;
      // PPN 12% x DPP 11/12 (PMK 131/2024): draft menyimpan tarif efektif 11, PIB mencetak 12
      if (kode === "PPN" && tarifPersen === 11) tarifPersen = 12;
      const fas = s(x["KODE FASILITAS"]);
      const persen = n(x["TARIF FASILITAS"]);
      const singkat = PP_SINGKAT_FASILITAS[fas] || (fas ? `Kode ${fas}` : "");
      return `${kode} ${ppAngkaBebas(tarifPersen, 4)}%${persen && fas && fas !== "1" ? `    ${ppAngkaBebas(persen, 4)}% ${singkat}` : ""}`;
    });
    const dokBarang = (L.barangDokumen || []).filter((x) => kunciSeri(x["SERI BARANG"]) === seri)
      .map((x) => ({ seri: kunciSeri(x["SERI DOKUMEN"]), izin: s(x["SERI IZIN"]) }))
      .sort((a, b) => Number(a.seri) - Number(b.seri));
    const keterangan = dokBarang.map((x) => {
      const d = docs.find((y) => y.seri === x.seri);
      if (!d) return "";
      const nama = d.fasilitas ? ppNamaRef("fasilitas", d.fasilitas) || `FASILITAS ${d.fasilitas}` : ppNamaDokumen(d.kode);
      return `- ${nama} (${x.seri}${x.izin ? ` - ${x.izin}` : ""})`;
    }).filter(Boolean);
    const vd = (L.barangVd || []).find((x) => kunciSeri(x["SERI BARANG"]) === seri) || {};
    const bk = tarif.find((x) => s(x["KODE PUNGUTAN"]).toUpperCase() === "BK");
    const kondisi = (KONDISI_BARANG.find((x) => x[0] === s(r["KODE KONDISI BARANG"])) || [])[1] || s(r["KODE KONDISI BARANG"]);
    const beda = s(r["STATEMENT PERBEDAAN HARGA"]).toUpperCase();
    return {
      seri, hs: s(r["HS"]), kode: s(r["KODE BARANG"]), uraian: s(r["URAIAN"]), merek: s(r["MEREK"]), tipe: s(r["TIPE"]),
      tarifKode: tarifUrut.map((x) => s(x["KODE PUNGUTAN"]).toUpperCase()),
      ukuran: s(r["UKURAN"]), spek: s(r["SPESIFIKASI LAIN"]), satuan: s(r["KODE SATUAN"]).toUpperCase(), qty: n(r["JUMLAH SATUAN"]),
      kemasanKode: s(r["KODE KEMASAN"]).toUpperCase(), kemasanJumlah: n(r["JUMLAH KEMASAN"]), netto: n(r["NETTO"]),
      nilaiPabean: (n(r["CIF"]) || 0) + (n(r["FREIGHT"]) || 0) + (n(r["ASURANSI"]) || 0), fob: n(r["FOB"]),
      kondisi, negara: s(r["KODE NEGARA ASAL"]).toUpperCase(), daerah: daerah(r["KODE DAERAH ASAL"]),
      jenisEkspor: ppNamaPilihan("jenisEkspor", r["KODE JENIS EKSPOR"]) || (s(r["KODE JENIS EKSPOR"]) ? `KODE ${s(r["KODE JENIS EKSPOR"])}` : ""),
      metode: s(r["METODE PENENTUAN NILAI"]).toUpperCase(), beda: { T: "Tidak", Y: "Ya" }[beda] || beda,
      jenisVd: s(vd["KODE VD"]), nilaiVd: n(vd["NILAI BARANG"]), jatuhTempo: ppTgl(vd["JATUH TEMPO"]) || "",
      he: n(r["HARGA EKSPOR"]), bk: bk ? n(bk["TARIF"]) : null, tarif: barisTarif, keterangan,
    };
  });

  const cif = n(h["CIF"]) || 0;
  const freight = n(h["FREIGHT"]) || 0;
  const asuransi = n(h["ASURANSI"]) || 0;
  const ndpbm = n(h["NDPBM"]);
  const nilaiPabean = cif + freight + asuransi;
  const incoterm = s(h["KODE INCOTERM"]).toUpperCase();
  const fasilitasDok = docs.filter((d) => d.fasilitas);
  const pernyataan = { kota: s(h["KOTA PERNYATAAN"]), tanggal: h["TANGGAL PERNYATAAN"], nama: s(h["NAMA PERNYATAAN"]), jabatan: s(h["JABATAN PERNYATAAN"]) };
  const pungutanPeb = (kode) => (L.pungutan || []).filter((x) => s(x["KODE JENIS PUNGUTAN"]).toUpperCase() === kode)
    .reduce((a, x) => a + (n(x["NILAI PUNGUTAN"]) || 0), 0);
  // Tabel pungutan PIB 37-44: KODE JENIS PUNGUTAN x KODE FASILITAS TARIF -> kolom, + TOTAL
  const pungutan = {};
  const JENIS = { BM: "BM", BMKITE: "BM KITE", "BM KITE": "BM KITE", BMT: "BMT", CUKAI: "Cukai", PPN: "PPN", PPNBM: "PPnBM", PPH: "PPh" };
  (L.pungutan || []).forEach((x) => {
    const j = JENIS[s(x["KODE JENIS PUNGUTAN"]).toUpperCase()];
    const kol = PP_KOLOM_FASILITAS[s(x["KODE FASILITAS TARIF"])];
    if (!j || kol == null) return;
    pungutan[j] = pungutan[j] || [0, 0, 0, 0, 0, 0];
    pungutan[j][kol] += n(x["NILAI PUNGUTAN"]) || 0;
  });
  if (Object.keys(pungutan).length) pungutan.TOTAL = [0, 1, 2, 3, 4, 5].map((i) => Object.values(pungutan).reduce((a, b) => a + b[i], 0));
  const jaminan = (L.jaminan || [])[0] || {};

  return {
    isPeb, dok: isPeb ? "peb" : "pib", decl, bc, h, pihak, docs, barang, kontainer, kemasan, pernyataan,
    aju: s(h["NOMOR AJU"]) || s((bc.fields || {}).noAju) || s(decl.aju),
    tglAju: h["TANGGAL AJU"] || h["TANGGAL PENGAJUAN"] || h["TANGGAL PERNYATAAN"],
    nomorDaftar: s(h["NOMOR DAFTAR"]), tglDaftar: h["TANGGAL DAFTAR"],
    kantorKode: s(h["KODE KANTOR"]), kantorNama: ppKantor(h["KODE KANTOR"]),
    jenisPib: s(h["KODE JENIS PROSEDUR"]), jenisImpor: s(h["KODE JENIS IMPOR"]), caraBayar: s(h["KODE CARA BAYAR"]),
    caraAngkut: s(angkut["KODE CARA ANGKUT"]), caraAngkutNama: ppNamaKode(PP_CARA_ANGKUT, angkut["KODE CARA ANGKUT"]),
    kapal: s(angkut["NAMA PENGANGKUT"]), voyage: s(angkut["NOMOR PENGANGKUT"]), bendera: s(angkut["KODE BENDERA"]).toUpperCase(),
    tglTiba: h["TANGGAL TIBA"], tglEkspor: h["TANGGAL EKSPOR"],
    muat: ppPelabuhan(h["KODE PELABUHAN MUAT"]), transit: ppPelabuhan(h["KODE PELABUHAN TRANSIT"]),
    tujuan: ppPelabuhan(h["KODE PELABUHAN TUJUAN"]), muatEkspor: ppPelabuhan(h["KODE PELABUHAN EKSPOR"]),
    negaraTujuan: s(h["KODE NEGARA TUJUAN"]).toUpperCase(),
    invoice: dokPertama("380"), packingList: dokPertama("217"),
    house: dokPertama(["714", "703", "705", "740"]), master: dokPertama(["704", "741"]),
    bc11: { nomor: s(h["NOMOR BC11"] || h["NOMOR BC 11"]), tanggal: h["TANGGAL BC11"] || h["TANGGAL BC 11"], pos: s(h["NOMOR POS"]), subPos: s(h["NOMOR SUB POS"]) },
    jenisTransaksi: s(h["KODE JENIS NILAI"]),
    kodeFasilitas: fasilitasDok.map((d) => d.fasilitas).join(","), fasilitasDok,
    tps: s(h["KODE TPS"]).toUpperCase(), tpsNama: PP_TPS[s(h["KODE TPS"]).toUpperCase()] || "",
    valuta: s(h["KODE VALUTA"]).toUpperCase(), valutaNama: ppNamaValuta(h["KODE VALUTA"]),
    ndpbm, incoterm, nilai: n(h["NILAI INCOTERM"]) || n(h[incoterm === "FOB" ? "FOB" : "CIF"]) || null,
    freight, asuransi, kodeAsuransi: s(h["KODE ASURANSI"]).toUpperCase(), fob: n(h["FOB"]),
    ikb: (L.komponenBiaya || []).length ? "ADA" : "TIDAK ADA",
    nilaiPabean, nilaiPabeanRp: ndpbm ? Math.round(nilaiPabean * ndpbm * 100) / 100 : null,
    bruto: n(h["BRUTO"]), netto: n(h["NETTO"]), maklon: n(h["NILAI MAKLON"]) || 0,
    pungutan,
    beaKeluar: pungutanPeb("BK"), pph22: pungutanPeb("PPH"), danaSawit: n(h["TOTAL DANA SAWIT"]) || 0,
    bankDevisa: s(((L.bankDevisa || [])[0] || {})["NAMA"]),
    pembayaran: s(h["KODE LOKASI BAYAR"]), bukti: { nomor: s(h["NOMOR BUKTI BAYAR"]), tanggal: h["TANGGAL BUKTI BAYAR"] },
    jaminan: { kode: s(jaminan["KODE JAMINAN"]), nomor: s(jaminan["NOMOR JAMINAN"]), tanggal: jaminan["TANGGAL JAMINAN"] },
    kantorMuat: ppKantor(h["KODE KANTOR MUAT"]), kantorEkspor: ppKantor(h["KODE KANTOR EKSPOR"]), kantorPeriksa: ppKantor(h["KODE KANTOR PERIKSA"]),
    jenisEkspor: ppNamaPilihan("jenisEkspor", h["KODE JENIS EKSPOR"]),
    kategoriEkspor: ppNamaPilihan("kategoriEkspor", h["KODE KATEGORI EKSPOR"]),
    caraDagang: ppNamaPilihan("caraDagang", h["KODE CARA DAGANG"]),
    caraBayarPeb: ppNamaPilihan("caraBayarPeb", h["KODE CARA BAYAR"]),
    lokasiPeriksa: ppNamaPilihan("lokasiPeriksa", h["KODE LOKASI"]),
  };
}

// Slot dokumen: kode, lalu peran B/L-AWB (705 / 740 umum menurut nomornya)
function ppSlotDokumen(d, m) {
  if (!d) return [];
  const slot = [`dok:${d.kode}`];
  if (d.kode === "380") slot.push("invoice");
  if (d.kode === "217") slot.push("packingList");
  if (d.kode === "704" || d.kode === "741") slot.push("bl:master");
  if (d.kode === "714" || d.kode === "703") slot.push("bl:house");
  if (d.kode === "705" || d.kode === "740") {
    const f = (m.bc && m.bc.fields) || {};
    const sama = (a) => kunciAlnum(a) && kunciAlnum(a) === kunciAlnum(d.nomor);
    if (sama(f.masterBL)) slot.push("bl:master");
    if (sama(f.houseBL)) slot.push("bl:house");
    if (!sama(f.masterBL) && !sama(f.houseBL)) slot.push(d === m.master ? "bl:master" : "bl:house");
  }
  return slot;
}

/* Halaman lanjutan: potong baris (tinggi masing-masing) ke halaman.
   Mengembalikan [{ baris: [i..], ttd: bool }]. */
function ppPotong(tinggi, atasPertama, atasLanjut, batas, tinggiTtd) {
  const hal = [{ baris: [], ttd: false, atas: atasPertama }];
  let y = atasPertama;
  tinggi.forEach((tg, i) => {
    const kini = hal[hal.length - 1];
    if (kini.baris.length && y + tg > batas) {
      hal.push({ baris: [], ttd: false, atas: atasLanjut });
      y = atasLanjut;
    }
    hal[hal.length - 1].baris.push(i);
    y += tg;
  });
  if (y + tinggiTtd > batas) hal.push({ baris: [], ttd: false, atas: atasLanjut });
  hal[hal.length - 1].ttd = true;
  return hal;
}
const PP_BATAS = 836;
const ppGaris = (n) => "-".repeat(n);

/* ---------------- PIB ---------------- */

/* Kolom 31-36 satu barang. kol: letak kolom (lembar lanjutan / halaman muka) */
const PP_KOL_PIB = { no: 28, c32: 38, kode: 102, w32: 171, c33: 212, w33: 82, c34: 296, c35: 400, w35: 81, c36: 485 };
const PP_KOL_PIB1 = { no: 28, c32: 38, kode: 102, w32: 166, c33: 208, w33: 86, c34: 296, c35: 400, w35: 82, c36: 486 };

function ppParaPib(it) {
  return [
    [{ t: "Uraian : " }, { t: it.uraian, slot: [`barang:${it.seri}:uraian`, `barang:${it.seri}`] }],
    [{ t: "Merk: " }, { t: it.merek, slot: `barang:${it.seri}:merek` }, { t: ", Tipe: " }, { t: it.tipe, slot: `barang:${it.seri}:tipe` },
      { t: ", Ukuran: " }, { t: it.ukuran, slot: `barang:${it.seri}:ukuran` }, { t: ", Spesifikasi lain: " }, { t: it.spek, slot: `barang:${it.seri}:spek` }, { t: "," }],
    [{ t: "Kondisi Brg : " }, { t: it.kondisi, slot: `barang:${it.seri}:kondisi` }],
    [{ t: "Negara : " }, { t: it.negara ? `${ppNamaNegara(it.negara)} (${it.negara})` : "", slot: `barang:${it.seri}:negara` }],
  ];
}
function ppTinggiPib(it, kol) {
  const lh = 6.98;
  const n32 = ppParaPib(it).reduce((a, runs) => a + ppJumlahBaris(runs.map((r) => (r.slot ? ppTeks(r.t) : r.t)).join(""), 6, kol.w32), 0);
  const n33 = ppJumlahBaris(it.keterangan.join("\n"), 5, kol.w33);
  return Math.max(60, 10.81 + n32 * lh - 0.3, 1.67 + n33 * 5.82 + 1, 1.95 + it.tarif.length * 8.145 + 1);
}
function ppBarisPib(kv, it, top, kol) {
  const s = (k) => `barang:${it.seri}:${k}`;
  kv.isian(kol.no, top + 1.09, 8, it.seri, { slot: `barang:${it.seri}`, rata: "tengah" });
  kv.paragraf(kol.c32, top + 0.81, 6, [{ t: "Pos Tarif : " }, { t: it.hs, slot: s("hs") }]);
  kv.paragraf(kol.kode, top + 0.81, 6, [{ t: "Kode Brg : " }, { t: it.kode, slot: s("kode") }]);
  let y = top + 10.81;
  ppParaPib(it).forEach((runs) => {
    y += kv.paragraf(kol.c32, y, 6, runs, { w: kol.w32, lh: 6.98 }) * 6.98;
  });
  kv.isian(kol.c33, top + 1.67, 5, it.keterangan.join("\n"), { slot: s("fasilitas"), w: kol.w33, lh: 5.82, baris: true });
  const slotTarif = { BM: "tarifBm", PPH: "tarifPph" };
  it.tarif.forEach((baris, i) => {
    const k = slotTarif[it.tarifKode[i]];
    kv.isian(kol.c34, top + 1.95 + i * 8.145, 7, baris, { slot: k ? s(k) : null, mentah: true });
  });
  kv.isian(kol.c35, top + 0.81, 6, ppAngka(it.qty, 4), { slot: s("qty") });
  kv.isian(kol.c35, top + 9.81, 6, PP_SATUAN[it.satuan] || it.satuan, { slot: s("satuan"), w: kol.w35, maks: 1 });
  kv.isian(kol.c35, top + 24.81, 6, ppAngka(it.netto, 4), { slot: s("netto") });
  kv.isian(kol.c35, top + 38.81, 6, ppAngka(it.kemasanJumlah, 2));
  kv.isian(kol.c35, top + 48.81, 6, it.kemasanKode ? `${ppNamaKemasan(it.kemasanKode)} (${it.kemasanKode})` : "", { w: kol.w35, maks: 1 });
  kv.paragraf(kol.c36, top + 0.81, 6, [{ t: "- " }, { t: ppAngka(it.nilaiPabean, 2), slot: s("nilai") }]);
  kv.isian(kol.c36, top + 10.81, 6, it.metode, { slot: s("metodeNilai") });
  kv.isian(kol.c36, top + 20.81, 6, it.beda, { slot: s("bedaHargaLevel") });
  kv.isian(kol.c36, top + 30.81, 6, it.jenisVd || "-", { slot: s("jenisVd") });
  kv.isian(kol.c36, top + 40.81, 6, it.nilaiVd == null ? "0" : ppAngkaBebas(it.nilaiVd), { slot: s("nilaiVd") });
  kv.isian(kol.c36, top + 50.81, 6, it.jatuhTempo || "-", { slot: s("jatuhTempo") });
}

function ppPibHal1(m, pn, jumlahHal) {
  const kv = ppKanvas(pn);
  kv.templat(PPT_PIB1);
  const P = (k) => m.pihak[k] || {};
  kv.isian(96, 29.09, 8, m.kantorNama, { slot: ["kantor", "dp:kodeKantor"], w: 230, maks: 1 });
  kv.isian(360, 29.09, 8, m.kantorKode, { slot: ["kantor", "dp:kodeKantor"], rata: "tengah" });
  kv.teks(544, 29.09, 8, "Halaman ke-1 dari", "kanan");
  kv.teks(547, 29.09, 8, String(jumlahHal));
  kv.isian(96, 41.09, 8, m.aju, { slot: "aju" });
  kv.isian(410, 41.09, 8, ppTgl(m.tglAju));
  kv.isian(134.5, 52.09, 8, m.jenisPib, { slot: "dp:jenisPib", rata: "tengah" });
  kv.isian(134.5, 63.09, 8, m.jenisImpor, { slot: "dp:jenisImpor", rata: "tengah" });
  kv.isian(134.5, 74.09, 8, m.caraBayar, { slot: "dp:caraBayar", rata: "tengah" });

  // D. DATA -- kiri: pihak
  [["pengirim", 97.81, 6, 79, 106.88, 116.81, 128.81], ["penjual", 138.88, 6.5, 82, 147.88, 165.81, 177.81]].forEach(([k, yk, sk, xn, yn, ya, yng]) => {
    const p = P(k);
    const kode = PP_PIHAK.pib[k];
    const d = (f) => `dp:pihak.${k}.${f}`;
    kv.isian(315, yk, sk, p.negara, { slot: d("negara"), rata: "tengah" });
    kv.isian(xn, yn, 6.5, p.nama, { slot: [`entitas:${kode}`, d("nama")], w: 328 - xn, maks: 1, besar: true });
    kv.isian(29, ya, 6, p.alamat, { slot: d("alamat"), w: 297, maks: 2, lh: 6.98, besar: true });
    kv.isian(330, yng, 6, p.negara ? ppNamaNegara(p.negara) : "", { slot: d("negara"), rata: "kanan" });
  });
  const imp = P("importir");
  kv.isian(63, 196.88, 6.5, [imp.npwp, P("pemusatan").npwp].filter(Boolean).join(" / "),
    { slot: ["entitasId:1", "dp:pihak.importir.identitas", "dp:pihak.pemusatan.identitas"], w: 265, maks: 1 });
  kv.isian(66, 207.88, 6.5, imp.nitku, { slot: ["entitasId:1", "dp:pihak.importir.nitku"] });
  kv.isian(79, 218.88, 6.5, imp.nama, { slot: ["entitas:1", "dp:pihak.importir.nama"], w: 249, maks: 1, besar: true });
  kv.isian(29, 229.88, 6.5, imp.alamat, { slot: "dp:pihak.importir.alamat", w: 297, maks: 2, lh: 7.57, besar: true });
  kv.isian(63, 247.88, 6.5, imp.status, { slot: "dp:pihak.importir.status", w: 90, maks: 1 });
  kv.isian(189, 247.88, 6.5, imp.nib, { slot: "dp:pihak.importir.nib", w: 139, maks: 1 });
  const pem = P("pemilik");
  kv.isian(68, 267.88, 6.5, pem.npwp, { slot: ["entitasId:7", "dp:pihak.pemilik.identitas"] });
  kv.isian(76, 277.88, 6.5, pem.nitku, { slot: ["entitasId:7", "dp:pihak.pemilik.nitku"] });
  kv.isian(80, 286.88, 6.5, pem.nama, { slot: ["entitas:7", "dp:pihak.pemilik.nama"], w: 248, maks: 1, besar: true });
  kv.isian(29, 296.88, 6.5, pem.alamat, { slot: "dp:pihak.pemilik.alamat", w: 297, maks: 2, lh: 7.57, besar: true });
  kv.isian(149, 315.88, 6.5, pem.afiliasi, { slot: "dp:pihak.pemilik.hubungan", w: 179, maks: 1 });
  const ppjk = P("ppjk");
  kv.isian(63, 335.88, 6.5, ppjk.npwp, { slot: ["entitasId:4", "dp:pihak.ppjk.npwp"] });
  kv.isian(66, 345.88, 6.5, ppjk.nitku, { slot: ["entitasId:4", "dp:pihak.ppjk.nitku"] });
  kv.isian(79, 356.88, 6.5, ppjk.nama, { slot: ["entitas:4", "dp:pihak.ppjk.nama"], w: 249, maks: 1, besar: true });
  kv.isian(29, 366.88, 6.5, ppjk.alamat, { slot: "dp:pihak.ppjk.alamat", w: 297, maks: 2, lh: 7.57, besar: true });
  kv.isian(63, 386.88, 6.5, ppjk.izin, { slot: "dp:pihak.ppjk.npPpjk", w: 265, maks: 1 });

  // D. DATA -- kanan
  kv.isian(463, 97.95, 7, ppTgl(m.tglDaftar), { slot: "daftar" });
  kv.isian(341, 107.95, 7, m.nomorDaftar, { slot: "daftar" });
  kv.isian(407, 120.95, 7, m.caraAngkutNama, { slot: "moda", w: 125, maks: 1 });
  kv.isian(555.5, 121.87, 7, m.caraAngkut, { slot: "moda", rata: "tengah" });
  kv.isian(555.5, 133.87, 7, m.bendera, { slot: "dp:bendera", rata: "tengah" });
  kv.isian(343, 141.95, 7, m.kapal, { slot: "kapal", w: 230, maks: 1 });
  kv.isian(343, 150.95, 7, m.voyage, { slot: "kapal", w: 140, maks: 1 });
  kv.isian(489, 150.95, 7, m.bendera ? ppNamaNegara(m.bendera) : "", { w: 84, maks: 1 });
  kv.isian(422, 161.95, 7, ppTgl(m.tglTiba));
  kv.isian(410, 174.95, 7, m.muat.nama, { slot: "muat", w: 108, maks: 1 });
  kv.isian(548, 175.87, 7, m.muat.kode, { slot: "muat", rata: "tengah" });
  kv.isian(410, 186.95, 7, m.transit.nama, { slot: "dp:pelabuhanTransit", w: 108, maks: 1 });
  kv.isian(548, 187.87, 7, m.transit.kode, { slot: "dp:pelabuhanTransit", rata: "tengah" });
  kv.isian(410, 198.95, 7, m.tujuan.nama, { slot: "tujuan", w: 108, maks: 1 });
  kv.isian(548, 199.87, 7, m.tujuan.kode, { slot: "tujuan", rata: "tengah" });
  const dok = (d, y, xNo, xTgl) => {
    const slot = ppSlotDokumen(d, m);
    kv.paragraf(xNo, y, 6, [{ t: d ? d.nomor : "", slot }], { w: 503 - xNo, maks: 1 });
    kv.isian(xTgl, y, 6, d ? ppTgl(d.tanggal) : "", { slot });
  };
  dok(m.invoice, 210.81, 423, 520);
  kv.isian(386.5, 220.95, 7, m.jenisTransaksi, { slot: "dp:transaksiJenis", rata: "tengah" });
  dok(m.house, 231.81, 421, 519);
  dok(m.master, 242.81, 421, 519);
  kv.isian(421, 253.81, 6, m.bc11.nomor, { slot: "dp:bc11Nomor" });
  kv.isian(519, 253.81, 6, ppTgl(m.bc11.tanggal), { slot: "dp:bc11Tanggal" });
  kv.isian(425, 263.81, 6, m.bc11.pos, { slot: "dp:bc11Pos" });
  kv.isian(531, 263.81, 6, m.bc11.subPos, { slot: "dp:bc11SubPos" });
  kv.isian(555.5, 276.87, 7, m.kodeFasilitas, { rata: "tengah" });
  m.fasilitasDok.slice(0, 3).forEach((d, i) => {
    const y = 283.81 + i * 6.98;
    const slot = ppSlotDokumen(d, m);
    kv.paragraf(345, y, 6, [{ t: "NO. " }, { t: d.nomor, slot }], { w: 134, maks: 1 });
    kv.paragraf(481, y, 6, [{ t: "TGL. " }, { t: ppTgl(d.tanggal), slot }]);
  });
  kv.isian(553, 309.95, 7, m.tps, { slot: "dp:tempatTimbun", rata: "tengah" });
  kv.isian(341, 319.95, 7, m.tpsNama, { w: 232, maks: 1 });
  kv.isian(445, 333.87, 7, m.valuta, { slot: ["valuta", "dp:valuta"], rata: "tengah" });
  kv.isian(343, 341.95, 7, m.valutaNama, { w: 108, maks: 1 });
  kv.isian(474, 341.95, 7, ppAngkaJava(m.ndpbm), { slot: "ndpbm" });
  kv.isian(364, 352.95, 7, m.incoterm, { slot: "incoterm" });
  kv.isian(383, 352.95, 7, ppAngka(m.nilai, 2), { slot: "nilai" });
  kv.isian(393, 362.95, 7, ppAngka(m.asuransi, 2), { slot: "asuransi" });
  kv.isian(372, 372.95, 7, ppAngka(m.freight, 2), { slot: "freight" });
  kv.isian(379, 382.95, 7, m.ikb, { slot: "dp:ikb" });
  kv.isian(460, 361.95, 7, ppAngka(m.nilaiPabean, 2));
  kv.isian(460, 375.95, 7, m.nilaiPabeanRp == null ? "" : `RP ${ppAngka(m.nilaiPabeanRp, 2)}`, { slot: "nilaiPabeanRp" });

  // 27-30
  m.kontainer.slice(0, 8).forEach((k, i) => {
    const x = i < 4 ? 23 : 128;
    const y = 408.09 + (i % 4) * 11;
    kv.isian(x, y, 8, k.nomor, { slot: "kontainer" });
    kv.isian(x + 75.5, y, 8, k.ukuran, { slot: "kontainer", rata: "tengah" });
    kv.isian(x + 85, y, 8, k.jenis, { slot: "kontainer" });
  });
  kv.isian(239, 406.81, 6, m.kemasan.map((x) => [`${ppAngkaBebas(x.jumlah, 4)} ${ppNamaKemasan(x.kode)}`, x.merek].filter(Boolean).join(", ")).join("\n"),
    { slot: ["kemasan", "dp:merekKemasan"], w: 157, maks: 6, lh: 6.98, baris: true });
  kv.isian(482, 409.09, 8, ppAngka(m.bruto, 4), { slot: "bruto", rata: "kanan" });
  kv.isian(573, 409.09, 8, ppAngka(m.netto, 4), { slot: "netto", rata: "kanan" });

  // 31-36: satu barang di halaman muka, lebih -> lembar lanjutan
  if (m.barang.length === 1) ppBarisPib(kv, m.barang[0], 494, PP_KOL_PIB1);
  else if (m.barang.length) kv.isian(296.5, 522.09, 8, `${ppGaris(40)} ${m.barang.length} Jenis barang. Lihat lembar lanjutan ${ppGaris(40)}`, { slot: "jumlahBarang", rata: "tengah" });

  // 37-44 pungutan
  const kolom = [172, 252, 332, 412, 492, 572];
  DP_PUNGUTAN_JENIS.forEach((j, r) => {
    const baris = m.pungutan[j] || [];
    kolom.forEach((x, c) => kv.isian(x, 589.95 + r * 12, 7, ppAngka(baris[c] || 0, 2), { rata: "kanan", slot: `dp:pungutan.${j}.${c}` }));
  });

  // E. pembayaran & jaminan, F. tanda tangan
  kv.isian(423, 711.09, 8, m.pembayaran, { slot: "dp:pembayaran", rata: "tengah" });
  kv.isian(423, 723.09, 8, m.jaminan.kode, { slot: "dp:jaminanJenis", rata: "tengah" });
  kv.isian(384, 765.09, 8, m.bukti.nomor, { w: 109, maks: 1 });
  kv.isian(497, 765.09, 8, ppTgl(m.bukti.tanggal));
  kv.isian(384, 777.09, 8, m.jaminan.nomor, { slot: "dp:jaminanNomor", w: 109, maks: 1 });
  kv.isian(497, 777.09, 8, ppTgl(m.jaminan.tanggal), { slot: "dp:jaminanTanggal" });
  kv.isian(198.5, 771.09, 8, [m.pernyataan.kota, ppTgl(m.pernyataan.tanggal)].filter(Boolean).join(", "), { slot: PP_SLOT_KOTA_TGL, rata: "tengah" });
  kv.isian(198.5, 809.09, 8, m.pernyataan.nama, { slot: "dp:namaPernyataan", rata: "tengah" });
  kv.isian(198.5, 818.09, 8, m.pernyataan.jabatan, { slot: "dp:jabatanPernyataan", rata: "tengah" });
  kv.catatan(20, 832.5, 5.5, "DRAFT — dicetak ulang dari Excel CEISA untuk pemeriksaan");
  return kv.svg();
}

/* Kepala lembar lanjutan PIB (barang & dokumen) di geser dy */
function ppKepalaPib(kv, m, dy, halaman) {
  kv.isian(114, 37.09 + dy, 8, m.kantorNama, { slot: "kantor", w: 210, maks: 1 });
  kv.isian(360, 37.09 + dy, 8, m.kantorKode, { slot: "kantor", rata: "tengah" });
  if (halaman) kv.teks(481.65, 37.09 + dy, 8, halaman);
  kv.isian(114, 49.09 + dy, 8, m.aju, { slot: "aju" });
  kv.isian(419, 49.09 + dy, 8, ppTgl(m.tglAju));
  kv.isian(114, 61.09 + dy, 8, m.nomorDaftar, { slot: "daftar" });
  kv.isian(419, 61.09 + dy, 8, ppTgl(m.tglDaftar), { slot: "daftar" });
}
const PP_SLOT_KOTA_TGL = ["dp:kotaPernyataan", "dp:tanggalPernyataan"];
function ppTtd(kv, m, x, y, s, peran, offset) {
  kv.isian(x, y + offset[0], s, [m.pernyataan.kota, ppTgl(m.pernyataan.tanggal)].filter(Boolean).join(", "), { slot: PP_SLOT_KOTA_TGL, rata: "tengah" });
  kv.teks(x, y + offset[1], s, peran, "tengah");
  kv.isian(x, y + offset[2], s, m.pernyataan.nama, { slot: "dp:namaPernyataan", rata: "tengah" });
}

function ppPibLanjutBarang(m, pn, halPotong, jumlahHal) {
  return halPotong.map((hal, i) => {
    const kv = ppKanvas(pn);
    const dy = i === 0 ? 0 : -26;
    kv.templat(PPT_PIB_LANJUT, i === 0 ? null : { judul: 36, dy });
    ppKepalaPib(kv, m, dy, `Halaman ke-${i + 2} dari ${jumlahHal}`);
    let y = 119 + dy;
    const atas = y;
    hal.baris.forEach((bi) => {
      const it = m.barang[bi];
      ppBarisPib(kv, it, y, PP_KOL_PIB);
      y += ppTinggiPib(it, PP_KOL_PIB);
      kv.h(y, 19.75, 575.25);
    });
    [20, 36, 211, 294, 398, 483, 575].forEach((x) => kv.v(x, atas - 0.25, y + 0.25));
    if (hal.ttd) {
      ppTtd(kv, m, 500.5, y, 8, "Importir/PPJK", [11.09, 22.09, 59.09]);
      kv.h(y + 75, 20, 575);
    }
    kv.catatan(20, 832.5, 5.5, "DRAFT — dicetak ulang dari Excel CEISA untuk pemeriksaan");
    return kv.svg();
  });
}

function ppPibLanjutDokumen(m, pn) {
  if (!m.docs.length) return [];
  const hal = ppPotong(m.docs.map(() => 22), 86, 70, PP_BATAS, 75);
  return hal.map((h, i) => {
    const kv = ppKanvas(pn);
    const dy = i === 0 ? 0 : -16;
    kv.templat(PPT_PIB_DOK, i === 0 ? null : { judul: 26, dy });
    ppKepalaPib(kv, m, -10 + dy, "");
    let y = 86 + dy;
    const atas = y;
    h.baris.forEach((di) => {
      const d = m.docs[di];
      const slot = ppSlotDokumen(d, m);
      kv.teks(30, y + 3.09, 8, String(di + 1), "tengah");
      kv.teks(70, y + 3.09, 8, d.kode, "tengah");
      kv.isian(109, y + 3.09, 8, ppNamaDokumen(d.kode), { w: 179, maks: 2, lh: 9.31 });
      kv.paragraf(298, y + 3.09, 8, [{ t: "No. " }, { t: d.nomor, slot }], { w: 175, maks: 1 });
      kv.paragraf(298, y + 12.4, 8, [{ t: "Tgl. " }, { t: ppTgl(d.tanggal), slot }]);
      kv.teks(525, y + 3.09, 8, "YA   /   TIDAK", "tengah");
      y += 22;
      kv.h(y, 19.75, 575.25);
    });
    [20, 40, 100, 290, 475, 575].forEach((x) => kv.v(x, atas - 0.25, y + 0.25));
    if (h.ttd) {
      ppTtd(kv, m, 500.5, y, 8, "Importir/PPJK", [11.09, 21.09, 59.09]);
      kv.h(y + 75, 20, 575);
    }
    kv.catatan(20, 832.5, 5.5, "DRAFT — dicetak ulang dari Excel CEISA untuk pemeriksaan");
    return kv.svg();
  });
}

function ppHalamanPib(m, pn) {
  const lanjut = m.barang.length > 1 ? ppPotong(m.barang.map((it) => ppTinggiPib(it, PP_KOL_PIB)), 119, 93, PP_BATAS, 75) : [];
  const jumlahHal = 1 + lanjut.length;
  return [ppPibHal1(m, pn, jumlahHal), ...ppPibLanjutBarang(m, pn, lanjut, jumlahHal), ...ppPibLanjutDokumen(m, pn)];
}

/* ---------------- PEB ---------------- */

const PP_KOL_PEB = { no: 35, c48: 53, w48: 167, c49: 222, w49: 67, c50: 292, c51: 369, w51: 69, c52: 443, w52: 65, c54: 569 };
const PP_KOL_PEB1 = { no: 47.5, c48: 63, w48: 172, c49: 237, w49: 61, c50: 301, c51: 368, w51: 65, c52: 438, w52: 65, c54: 569 };

function ppParaPeb(it) {
  const spek = it.spek && it.spek !== "-" ? it.spek : "";
  return [
    [{ t: "- " }, { t: it.hs, slot: `barang:${it.seri}:hs` }],
    [{ t: "- " }, { t: it.uraian, slot: [`barang:${it.seri}:uraian`, `barang:${it.seri}`] }, { t: ", Merk: " }, { t: it.merek, slot: `barang:${it.seri}:merek` },
      { t: ", Tipe: " }, { t: it.tipe, slot: `barang:${it.seri}:tipe` }, { t: ", Ukuran: " }, { t: it.ukuran, slot: `barang:${it.seri}:ukuran` },
      { t: " " }, { t: spek, slot: `barang:${it.seri}:spek` }, { t: "," }],
    [{ t: "Kode Barang : " }, { t: it.kode, slot: `barang:${it.seri}:kode` }],
    [{ t: "- " }, { t: it.jenisEkspor, slot: `barang:${it.seri}:jenisEkspor` }],
  ];
}
function ppTinggiPeb(it, kol) {
  const n = ppParaPeb(it).reduce((a, runs) => a + ppJumlahBaris(runs.map((r) => (r.slot ? ppTeks(r.t) : r.t)).join(""), 5, kol.w48), 0);
  return Math.max(40, 2.67 + n * 5.82 + 3);
}
function ppBarisPeb(kv, it, top, kol) {
  const s = (k) => `barang:${it.seri}:${k}`;
  const lh = 5.82;
  kv.isian(kol.no, top + 2.67, 5, it.seri, { slot: `barang:${it.seri}`, rata: "tengah" });
  let y = top + 2.67;
  ppParaPeb(it).forEach((runs) => {
    y += kv.paragraf(kol.c48, y, 5, runs, { w: kol.w48, lh }) * lh;
  });
  kv.isian(kol.c49, top + 2.67, 5, it.keterangan.join("\n"), { slot: s("fasilitas"), w: kol.w49, lh, baris: true });
  kv.teks(kol.c50, top + 2.67, 5, "HE:");
  kv.isian(kol.c50 + 11, top + 2.67, 5, it.he == null ? "0" : ppAngkaBebas(it.he, 4), { slot: s("he") });
  kv.teks(kol.c50, top + 19.67, 5, "BK:");
  kv.isian(kol.c50 + 11, top + 19.67, 5, it.bk == null ? "0" : ppAngkaBebas(it.bk, 4), { slot: s("tarifBk") });
  kv.paragraf(kol.c51, top + 2.67, 5, [{ t: "- " }, { t: ppAngka(it.qty, 4), slot: s("qty") }, { t: " " },
    { t: it.satuan ? `${PP_SATUAN[it.satuan] || it.satuan} (${it.satuan})` : "", slot: s("satuan") }], { w: kol.w51, maks: 1 });
  kv.paragraf(kol.c51, top + 8.5, 5, [{ t: "- " }, { t: ppAngka(it.netto, 4), slot: s("netto") }, { t: " Kg" }]);
  kv.paragraf(kol.c51, top + 14.31, 5, [{ t: "- Kemasan: " }, { t: `${ppAngkaBebas(it.kemasanJumlah, 4)} ${it.kemasanKode}`.trim() }], { w: kol.w51, maks: 1 });
  kv.paragraf(kol.c52, top + 2.67, 5, [{ t: "- " }, { t: it.negara ? `${ppNamaNegara(it.negara)} (${it.negara})` : "", slot: s("negara") }], { w: kol.w52, maks: 1 });
  kv.paragraf(kol.c52, top + 8.5, 5, [{ t: "- " }, { t: it.daerah, slot: s("daerahAsal") }], { w: kol.w52, maks: 1 });
  kv.isian(kol.c54, top + 2.67, 5, ppAngkaBebas(it.fob, 2), { slot: s("nilai"), rata: "kanan" });
}

function ppPebHal1(m, pn, jumlahHal) {
  const kv = ppKanvas(pn);
  kv.templat(PPT_PEB1);
  kv.putar(30.62, 87.5, 9, "HEADER");
  kv.putar(30.62, 431.5, 9, "F. DATA PERDAGANGAN");
  kv.teks(547, 36.81, 6, "Halaman ke-1 dari", "kanan");
  kv.teks(549, 36.81, 6, String(jumlahHal));
  kv.isian(150, 38.81, 6, m.aju, { slot: "aju" });
  kv.isian(150, 63.81, 6, m.kantorMuat, { slot: ["kantor", "dp:kantorMuat"], w: 218, maks: 1 });
  kv.isian(150, 75.81, 6, m.kantorEkspor, { slot: ["kantorEkspor", "dp:kantorEkspor"], w: 218, maks: 1 });
  kv.isian(150, 87.81, 6, m.jenisEkspor, { slot: "dp:jenisEkspor", w: 218, maks: 1 });
  kv.isian(150, 99.81, 6, m.kategoriEkspor, { slot: "dp:kategoriEkspor", w: 218, maks: 1 });
  kv.isian(150, 111.81, 6, m.caraDagang, { slot: "dp:caraDagang", w: 218, maks: 1 });
  kv.isian(150, 123.81, 6, m.caraBayarPeb, { slot: "dp:caraBayar", w: 218, maks: 1 });
  kv.isian(480, 76.81, 6, m.nomorDaftar, { slot: "daftar" });
  kv.isian(480, 88.81, 6, ppTgl(m.tglDaftar), { slot: "daftar" });
  kv.isian(480, 100.81, 6, m.bc11.nomor, { slot: "dp:bc11Nomor" });
  kv.isian(480, 112.81, 6, ppTgl(m.bc11.tanggal), { slot: "dp:bc11Tanggal" });
  kv.isian(480, 124.81, 6, [m.bc11.pos, m.bc11.subPos].filter(Boolean).join(" / "), { slot: ["dp:bc11Pos", "dp:bc11SubPos"] });

  const P = (k) => m.pihak[k] || {};
  const d = (p, f) => `dp:pihak.${p}.${f}`;
  const eks = P("eksportir");
  kv.isian(76, 151.75, 5.5, eks.npwp, { slot: ["entitasId:2", d("eksportir", "identitas")] });
  kv.isian(76, 161.75, 5.5, eks.nitku, { slot: ["entitasId:2", d("eksportir", "nitku")] });
  kv.isian(76, 172.75, 5.5, eks.nama, { slot: ["entitas:2", d("eksportir", "nama")], w: 137, maks: 1, besar: true });
  kv.isian(76, 184.75, 5.5, eks.alamat, { slot: d("eksportir", "alamat"), w: 137, maks: 3, lh: 6.4, besar: true });
  kv.isian(76, 204.75, 5.5, eks.status, { slot: d("eksportir", "status"), w: 137, maks: 1 });
  const pem = P("pemilik");
  kv.isian(256, 151.75, 5.5, pem.npwp, { slot: ["entitasId:7", d("pemilik", "identitas")] });
  kv.isian(256, 164.75, 5.5, pem.nitku, { slot: ["entitasId:7", d("pemilik", "nitku")] });
  kv.isian(256, 177.75, 5.5, pem.nama, { slot: ["entitas:7", d("pemilik", "nama")], w: 137, maks: 1, besar: true });
  kv.isian(256, 190.75, 5.5, pem.alamat, { slot: d("pemilik", "alamat"), w: 137, maks: 3, lh: 6.4, besar: true });
  const pbl = P("pembeli");
  kv.isian(436, 151.75, 5.5, pbl.nama, { slot: ["entitas:6", d("pembeli", "nama")], w: 137, maks: 2, lh: 6.4, besar: true });
  kv.isian(436, 168.75, 5.5, pbl.alamat, { slot: d("pembeli", "alamat"), w: 137, maks: 4, lh: 6.4, besar: true });
  kv.isian(436, 197.75, 5.5, pbl.negara ? ppNamaNegara(pbl.negara) : "", { slot: d("pembeli", "negara") });
  const ppjk = P("ppjk");
  kv.isian(75, 225.75, 5.5, ppjk.npwp, { slot: ["entitasId:4", d("ppjk", "npwp")] });
  kv.isian(75, 236.75, 5.5, ppjk.nitku, { slot: ["entitasId:4", d("ppjk", "nitku")] });
  kv.isian(75, 246.75, 5.5, ppjk.nama, { slot: ["entitas:4", d("ppjk", "nama")], w: 138, maks: 1, besar: true });
  kv.isian(75, 258.75, 5.5, ppjk.alamat, { slot: d("ppjk", "alamat"), w: 138, maks: 6, lh: 6.4, besar: true });
  const kon = P("konsolidator");
  kv.isian(265, 225.75, 5.5, kon.kategori, { slot: d("konsolidator", "kategori"), w: 128, maks: 1 });
  kv.isian(265, 236.75, 5.5, kon.npwp, { slot: ["entitasId:23", d("konsolidator", "npwp"), d("konsolidator", "nitku")] });
  kv.isian(265, 247.75, 5.5, kon.nama, { slot: ["entitas:23", d("konsolidator", "nama")], w: 128, maks: 1, besar: true });
  kv.isian(265, 260.75, 5.5, kon.alamat, { slot: d("konsolidator", "alamat"), w: 128, maks: 6, lh: 6.4, besar: true });
  const pen = P("penerima");
  kv.isian(436, 225.75, 5.5, pen.nama, { slot: ["entitas:8", d("penerima", "nama")], w: 137, maks: 2, lh: 6.4, besar: true });
  kv.isian(436, 241.75, 5.5, pen.alamat, { slot: d("penerima", "alamat"), w: 137, maks: 3, lh: 6.4, besar: true });
  kv.isian(436, 263.75, 5.5, pen.negara ? ppNamaNegara(pen.negara) : "", { slot: d("penerima", "negara") });

  // Pengangkutan & pelabuhan
  kv.isian(164, 320.81, 6, m.caraAngkutNama, { slot: "moda" });
  kv.isian(164, 332.81, 6, m.bendera, { slot: "dp:bendera" });
  kv.isian(51, 344.68, 5, m.kapal, { slot: "kapal", w: 105, maks: 1 });
  kv.isian(164, 356.68, 5, m.voyage, { slot: "kapal" });
  kv.isian(164, 368.81, 6, ppTgl(m.tglEkspor), { slot: "tglEkspor" });
  kv.isian(408, 320.81, 6, m.muat.nama, { slot: "muat", w: 165, maks: 1 });
  kv.isian(408, 332.81, 6, m.muatEkspor.nama, { slot: "dp:pelabuhanEkspor", w: 165, maks: 1 });
  kv.isian(408, 343.81, 6, m.tpsNama || m.tps || "-", { slot: "dp:tempatTimbun", w: 165, maks: 1 });
  kv.isian(408, 354.81, 6, m.tujuan.nama, { slot: "tujuan", w: 165, maks: 1 });
  kv.isian(408, 366.81, 6, m.negaraTujuan ? ppNamaNegara(m.negaraTujuan) : "", { slot: "negaraTujuan" });

  // Dokumen
  [[m.invoice, 399.75], [m.packingList, 412.75]].forEach(([d, y]) => {
    const slot = ppSlotDokumen(d, m);
    kv.paragraf(127, y, 5.5, [{ t: "No. " }, { t: d ? d.nomor : "", slot }], { w: 116, maks: 1 });
    kv.paragraf(245, y, 5.5, [{ t: "tgl. " }, { t: d ? ppTgl(d.tanggal) : "", slot }]);
  });
  const lain = m.docs.filter((d) => !["380", "217", "705", "704", "703", "714", "740", "741"].includes(d.kode));
  kv.isian(155, 425.81, 6, lain.length ? lain.map((d) => `${ppNamaDokumen(d.kode)} ${d.nomor} ${ppTgl(d.tanggal)}`).join("; ") : "-", { w: 148, maks: 1 });
  kv.isian(155, 438.81, 6, ppKantor(m.kantorKode), { slot: "dp:kantorDaftar", w: 148, maks: 1 });
  kv.isian(421, 398.81, 6, m.lokasiPeriksa, { slot: "dp:lokasiPeriksa", w: 152, maks: 1 });
  kv.isian(421, 411.81, 6, m.kantorPeriksa, { slot: "dp:kantorPeriksa", w: 152, maks: 1 });
  kv.isian(416, 441.81, 6, m.incoterm, { slot: "incoterm" });

  // Transaksi
  kv.isian(145, 469.81, 6, m.bankDevisa, { slot: "dp:bankDevisa", w: 158, maks: 1 });
  kv.isian(145, 481.81, 6, m.valuta ? `${m.valutaNama || m.valuta} (${m.valuta})` : "", { slot: ["valuta", "dp:valuta"] });
  kv.isian(145, 493.81, 6, ppAngka(m.fob, 2), { slot: "nilai" });
  kv.isian(406, 469.81, 6, ppAngka(m.freight, 2), { slot: "freight" });
  kv.isian(406, 481.81, 6, ppAngka(m.asuransi, 2), { slot: "asuransi" });
  kv.isian(406, 493.81, 6, ppAngkaBebas(m.maklon), { slot: "dp:nilaiMaklon" });

  // Peti kemas, kemasan, berat
  kv.isian(183, 521.81, 6, String(m.kontainer.length), { slot: "kontainer" });
  kv.isian(183, 533.81, 6, m.kontainer.map((k) => `${k.nomor} /  ${k.ukuran} FEET /  ${k.jenis}`).join("\n"), { slot: "kontainer", lh: 6.98, maks: 1, mentah: true });
  kv.isian(320, 530.81, 6, m.kemasan.map((x) => `${ppAngkaBebas(x.jumlah, 4)} ${ppNamaKemasan(x.kode)}/ ${x.merek || "-"}`).join("\n"),
    { slot: ["kemasan", "dp:merekKemasan"], w: 250, maks: 2, lh: 6.98, baris: true });
  kv.isian(125, 561.81, 6, ppAngka(m.bruto, 4), { slot: "bruto" });
  kv.isian(396, 561.81, 6, ppAngka(m.netto, 4), { slot: "netto" });

  if (m.barang.length === 1) ppBarisPeb(kv, m.barang[0], 612, PP_KOL_PEB1);
  else if (m.barang.length) kv.isian(305.5, 623.81, 6, `${ppGaris(40)} ${m.barang.length} Jenis barang. Lihat lembar lanjutan ${ppGaris(40)}`, { slot: "jumlahBarang", rata: "tengah" });

  kv.paragraf(151, 676.81, 6, [{ t: "Rp " }, { t: ppAngka(m.ndpbm, 2), slot: "ndpbm" }]);
  kv.isian(418, 687.81, 6, ppAngkaBebas(m.beaKeluar), { slot: "dp:beaKeluar" });
  kv.isian(418, 699.81, 6, ppAngkaBebas(m.pph22), { slot: "dp:pph22" });
  kv.isian(418, 711.81, 6, ppAngkaBebas(m.danaSawit), { slot: "dp:danaPerkebunan" });
  ppTtd(kv, m, 479, 756.81, 6, "", [0, 9, 41]);
  kv.catatan(20, 812.5, 5.5, "DRAFT — dicetak ulang dari Excel CEISA untuk pemeriksaan");
  return kv.svg();
}

function ppKepalaPeb(kv, m, dy) {
  kv.isian(380, 57.43 + dy, 8, m.kantorKode, { slot: "kantor", rata: "tengah" });
  kv.isian(139, 66.09 + dy, 8, m.kantorMuat || m.kantorNama, { slot: "kantor", w: 210, maks: 1 });
  kv.isian(139, 78.09 + dy, 8, m.aju, { slot: "aju" });
}

function ppPebLanjutBarang(m, pn, halPotong, jumlahHal) {
  return halPotong.map((hal, i) => {
    const kv = ppKanvas(pn);
    const dy = i === 0 ? 0 : -49;
    kv.templat(PPT_PEB_LANJUT, i === 0 ? null : { judul: 54, dy });
    ppKepalaPeb(kv, m, dy);
    if (i === 0) {
      kv.teks(545, 46.8, 7, "Halaman ke-2 dari", "kanan");
      kv.teks(548.95, 46.8, 7, String(jumlahHal));
    } else {
      kv.teks(570, 57.43 + dy, 7, `Halaman ke-${i + 2} dari ${jumlahHal}`, "kanan");
    }
    let y = 139 + dy;
    const atas = y;
    hal.baris.forEach((bi) => {
      const it = m.barang[bi];
      ppBarisPeb(kv, it, y, PP_KOL_PEB);
      y += ppTinggiPeb(it, PP_KOL_PEB);
      kv.h(y, 19.75, 575.25);
    });
    [50, 220, 291, 366, 440, 510].forEach((x) => kv.v(x, atas - 0.25, y + 0.25));
    const bawah = hal.ttd ? y + 75 : y;
    [20, 575].forEach((x) => kv.v(x, atas - 0.25, bawah + 0.25));
    if (hal.ttd) {
      ppTtd(kv, m, 489, y, 8, "Eksportir/PPJK", [9.09, 18.09, 55.09]);
      kv.h(bawah, 19.75, 575.25);
    }
    kv.catatan(20, 832.5, 5.5, "DRAFT — dicetak ulang dari Excel CEISA untuk pemeriksaan");
    return kv.svg();
  });
}

function ppPebLanjutDokumen(m, pn) {
  if (!m.docs.length) return [];
  const hal = ppPotong(m.docs.map(() => 15), 130, 80, PP_BATAS, 75);
  return hal.map((h, i) => {
    const kv = ppKanvas(pn);
    const dy = i === 0 ? 0 : -50;
    kv.templat(PPT_PEB_DOK, i === 0 ? null : { judul: 70, dy });
    ppKepalaPeb(kv, m, 16 + dy);
    let y = 130 + dy;
    const atas = y;
    h.baris.forEach((di) => {
      const d = m.docs[di];
      const slot = ppSlotDokumen(d, m);
      kv.teks(37.5, y + 3.09, 8, String(di + 1), "tengah");
      kv.isian(58, y + 3.09, 8, ppNamaDokumen(d.kode), { w: 170, maks: 1 });
      kv.isian(233, y + 3.09, 8, d.nomor, { slot, w: 170, maks: 1 });
      kv.isian(442.5, y + 3.09, 8, ppTgl(d.tanggal), { slot, rata: "tengah" });
      y += 15;
    });
    if (h.baris.length) kv.h(y, 19.75, 575.25);
    [55, 230, 405, 480].forEach((x) => kv.v(x, atas - 0.25, y + 0.25));
    const bawah = h.ttd ? y + 75 : y;
    [20, 575].forEach((x) => kv.v(x, atas - 0.25, bawah + 0.25));
    if (h.ttd) {
      ppTtd(kv, m, 489, y, 8, "Eksportir/PPJK", [9.09, 18.09, 55.09]);
      kv.h(bawah, 19.75, 575.25);
    }
    kv.catatan(20, 832.5, 5.5, "DRAFT — dicetak ulang dari Excel CEISA untuk pemeriksaan");
    return kv.svg();
  });
}

function ppHalamanPeb(m, pn) {
  const lanjut = m.barang.length > 1 ? ppPotong(m.barang.map((it) => ppTinggiPeb(it, PP_KOL_PEB)), 139, 90, PP_BATAS, 75) : [];
  const jumlahHal = 1 + lanjut.length;
  return [ppPebHal1(m, pn, jumlahHal), ...ppPebLanjutBarang(m, pn, lanjut, jumlahHal), ...ppPebLanjutDokumen(m, pn)];
}

/* ---------------- Lembar Koreksi ---------------- */

const ppBaris = (label, isi) => `<div class="pp-b"><span class="pp-l">${label}</span><span class="pp-t2">:</span><span class="pp-v">${isi}</span></div>`;

function ppLembarKoreksi(m, temuan, res, k) {
  const nilai = (x, sisi) => {
    const v = sisi === "draft" ? (x.pib_display != null ? x.pib_display : x.pib) : x.cipl_display != null ? x.cipl_display : x.cipl;
    if (x.numeric && v !== "" && v != null && Number.isFinite(Number(v))) return cekAngka(v);
    return ppTeks(v);
  };
  const sumber = (x) => {
    const s = ppTeks(x.left_source) || (res.cipl ? "CIPL" : "Jadwal");
    return /^(Schedule|Jadwal)$/i.test(s) ? "Jadwal" : s;
  };
  const letak = (tm) => [...new Set(tm.slot.map((s) => ppLabelSlot(s, m.dok)).filter(Boolean))].join("; ") || ppTeks(tm.x.field);
  const jadwal = res.jadwal;
  const pembanding = [
    jadwal ? `Jadwal: ${[ppTeks(jadwal.party), ppTeks(jadwal.invoice), ppTeks(jadwal.noAju)].filter(Boolean).join(" · ")}` : "",
    res.cipl ? `CIPL: ${(k.berkasCipl || []).map((x) => x.name).join(" + ")}` : "",
  ].filter(Boolean);
  const kini = new Date();
  const dicetak = `${ppTgl(todayISO())} ${String(kini.getHours()).padStart(2, "0")}:${String(kini.getMinutes()).padStart(2, "0")}`;
  const baris = temuan.map((tm) => `<tr>
      <td class="pp-c"><b>${tm.no}</b></td>
      <td>${escapeHtml(letak(tm))}</td>
      <td><mark class="pp-stb">${escapeHtml(nilai(tm.x, "draft") || "—")}</mark></td>
      <td>${escapeHtml(nilai(tm.x, "seharusnya") || "—")}<div class="pp-sumber">${escapeHtml(sumber(tm.x))}</div></td>
      <td class="pp-kecil">${escapeHtml(ppTeks(tm.x.expected_note))}</td>
    </tr>`);
  return `<section class="pp-koreksi">
  <table class="pp-tabel">
    <colgroup><col style="width:9mm"><col style="width:46mm"><col style="width:40mm"><col style="width:40mm"><col></colgroup>
    <thead>
      <tr><th colspan="5" class="pp-kop">
        <div class="pp-judul">LEMBAR KOREKSI DRAFT ${m.isPeb ? "PEB" : "PIB"}</div>
        ${ppBaris("Nomor Pengajuan", escapeHtml(m.aju || ""))}
        ${ppBaris("Berkas draft", escapeHtml(k.berkasDraft ? k.berkasDraft.name : ""))}
        ${ppBaris("Dibandingkan dengan", escapeHtml(pembanding.join(" / ") || "-"))}
        ${ppBaris("Hasil", escapeHtml(`${res.overall} — ${temuan.length} isian tidak sesuai`))}
        ${ppBaris("Dicetak", escapeHtml(dicetak))}
        <div class="pp-petunjuk">Isian yang <mark class="pp-stb">distabilo kuning</mark> di lembar draft tidak sesuai dengan dokumen pembanding. Nomor merah kecil di sebelahnya merujuk ke daftar di bawah. Mohon draft diperbaiki sesuai kolom <b>Seharusnya</b>.</div>
      </th></tr>
      <tr class="pp-kepala-kolom"><th class="pp-c">No</th><th>Letak di draft</th><th>Isi draft</th><th>Seharusnya</th><th>Keterangan</th></tr>
    </thead>
    <tbody>${baris.join("") || `<tr><td colspan="5" class="pp-c">Tidak ada isian yang tidak sesuai.</td></tr>`}</tbody>
  </table>
</section>`;
}

/* ---------------- dokumen cetak ---------------- */

function ppCss() {
  return `@page{size:A4;margin:0}
@page koreksi{size:A4;margin:12mm 10mm}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
svg.pp-hal{display:block;background:#fff;break-after:page;page-break-after:always}
svg.pp-hal text{font-family:Helvetica,Arial,"Liberation Sans",sans-serif;fill:#000;white-space:pre;font-kerning:none}
svg.pp-hal text.no{fill:#c00000;font-weight:700;stroke:#fff;stroke-width:.7px;paint-order:stroke}
svg.pp-hal text.cat{fill:#8a8a8a}
svg.pp-hal .stb rect{fill:#fff200}
@media screen{body{background:#dfe5ec;padding:6mm 0}svg.pp-hal,.pp-koreksi{margin:0 auto 6mm;box-shadow:0 1px 6px rgba(0,0,0,.25)}.pp-koreksi{width:210mm;background:#fff;padding:12mm 10mm}}
.pp-koreksi{page:koreksi;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;line-height:1.25}
table.pp-tabel{width:100%;border-collapse:collapse;table-layout:fixed}
.pp-tabel th,.pp-tabel td{border:.6pt solid #000;padding:.8mm 1.4mm;vertical-align:top;text-align:left;font-weight:400}
.pp-tabel .pp-c{text-align:center}
.pp-tabel thead{display:table-header-group}
.pp-tabel tbody tr{break-inside:avoid;page-break-inside:avoid}
.pp-kop{padding:1.4mm 2mm!important}
.pp-judul{text-align:center;font-size:10pt;margin-bottom:1.6mm}
.pp-b{display:grid;grid-template-columns:32mm 2mm 1fr}
.pp-kepala-kolom th{font-size:7pt}
.pp-kecil{font-size:6.8pt}
.pp-petunjuk{margin-top:1.4mm;padding:1mm 1.6mm;border:.6pt dashed #000}
.pp-sumber{font-size:6.4pt;color:#444;margin-top:.4mm}
mark.pp-stb{background:#fff200;color:inherit;padding:0 .4mm}`;
}

/* Halaman cetak (tanpa membuka jendela) -- dipakai cekCetakDraft & uji */
function cekCetakHtml(k) {
  const res = k.hasil;
  const m = ppData(k);
  const temuan = ppTemuan(res, m.isPeb);
  const pn = ppPenanda(temuan);
  const halaman = m.isPeb ? ppHalamanPeb(m, pn) : ppHalamanPib(m, pn);
  halaman.push(ppLembarKoreksi(m, temuan, res, k));
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${escapeHtml(`Draft ${m.isPeb ? "PEB" : "PIB"} ${m.aju || ""} - koreksi`)}</title>
<style>${ppCss()}</style></head><body>${halaman.join("\n")}</body></html>`;
}

function cekCetakDraft() {
  const k = cekKeadaan;
  if (!k.hasil || !k.decl || !k.bc) {
    showToast(tt("Belum ada hasil pemeriksaan untuk dicetak.", "There is no check result to print yet."), "warning");
    return;
  }
  const html = cekCetakHtml(k);
  const m = ppData(k);
  const judul = `Draft ${m.isPeb ? "PEB" : "PIB"} ${m.aju || ""} - koreksi`.replace(/\s+/g, " ");
  // Pratinjau & cetak di kotak cetak aplikasi (ui/cetak-modal.js), tanpa jendela pop-up
  return bukaModalCetak({
    jenis: tt(`Draf ${m.isPeb ? "PEB" : "PIB"} + Lembar Koreksi`, `${m.isPeb ? "PEB" : "PIB"} Draft + Correction Sheet`),
    nomor: m.aju || "",
    judulBerkas: judul,
    muat: async () => html,
  });
}
