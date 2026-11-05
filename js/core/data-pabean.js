"use strict";

/* ==================================================================
   DATA PIB / PEB (isian CEISA yang tidak punya kolom sendiri di jadwal)

   Disusun menurut tab CEISA -- Header, Entitas, Pengangkut, Kemasan &
   Peti Kemas, Transaksi, Pungutan, Pernyataan -- dan ditampilkan di
   halaman "Data PIB/PEB" form jadwal (features/data-pabean-form.js).
   SEMUANYA OPSIONAL: dipakai untuk memeriksa draft CEISA (Cek PIB/PEB),
   tidak pernah wajib diisi.

   TIDAK MENDUPLIKASI JADWAL. Yang sudah punya kolom (No. Aju, invoice,
   B/L-AWB, sarana & voyage, pelabuhan, ETA/ETD, incoterm, freight,
   asuransi, NDPBM, kemasan, kontainer, barang & fasilitas per barang,
   PI / LS / Polis) tetap di kolomnya, dan yang bisa DIHITUNG darinya
   (nilai barang & nilai pabean, berat kotor & bersih, jumlah peti kemas,
   negara tujuan, kode fasilitas, tabel pungutan) tidak disimpan --
   halaman Data PIB/PEB menampilkannya hanya-baca dari asalnya.

   Kode CEISA disimpan sebagai KODE ("1", "040300", "LAI"); namanya dari
   DP_PILIHAN untuk tampilan ("1 - BIASA"). Kode yang belum ada di daftar
   tetap tersimpan apa adanya.

   Disimpan utuh di kolom jsonb shipments.data_pabean &
   shipment_items.data_pabean (migration-data-pabean.sql).

   dok: "pib" = hanya buku Import, "peb" = hanya buku Export, kosong =
   keduanya. jenis: teks (bawaan) | tanggal (YYYY-MM-DD) | angka |
   panjang (alamat) | pilihan (kode dari DP_PILIHAN[pilihan]).
================================================================== */

/* PILIHAN (dropdown) seperti di CEISA 4.0. Sebagian besar langsung dari
   tabel Referensi CEISA (core/referensi-ceisa.js); yang tidak ada di
   sana dari layar CEISA & panduan portal CEISA 4.0. Kode yang tidak ada
   di daftar tetap diterima & tersimpan apa adanya. */
const dpRef = (nama) => (typeof REF_CEISA !== "undefined" && REF_CEISA[nama]) || [];
// Nama kantor seperti di pilihan & cetakan CEISA (referensi memakai nama pendek)
const DP_KANTOR_CEISA = { "040300": "KPU BEA DAN CUKAI TIPE A TJ. PRIOK", "050100": "KPU BEA DAN CUKAI TIPE C SOEKARNO-HATTA" };
// Pelabuhan: nama seperti di CEISA untuk yang paling sering; lainnya dari daftar UN/LOCODE aplikasi
const DP_PELABUHAN_CEISA = { IDTPP: "TANJUNG PRIOK", IDCGK: "CENGKARENG / SOEKARNO HATTA (U)" };
const dpPelabuhan = (negara) => (typeof UNLOCODES !== "undefined" ? UNLOCODES : [])
  .filter((x) => !negara || x.country === negara)
  .map((x) => [x.unlocode, DP_PELABUHAN_CEISA[x.unlocode] || String(x.name).split(",")[0].toUpperCase()])
  .filter((x, i, arr) => arr.findIndex((y) => y[0] === x[0]) === i);
const DP_PILIHAN = {
  kantor: dpRef("kantor").map(([k, n]) => [k, DP_KANTOR_CEISA[k] || n]),
  pelabuhanEkspor: dpPelabuhan("ID"),
  pelabuhan: dpPelabuhan(""),
  jenisPib: dpRef("jenisProsedur"),
  jenisImpor: dpRef("jenisImpor"),
  caraBayarPib: dpRef("caraBayar").filter(([k]) => ["1", "2", "3", "9"].includes(k)),
  caraBayarPeb: dpRef("caraBayar").filter(([k]) => !["1", "2", "3"].includes(k)),
  // Nama seperti pilihan portal CEISA 4.0 (kode = Referensi Jenis Ekspor)
  jenisEkspor: [["1", "EKSPOR BIASA"], ["2", "EKSPOR BERKALA"], ["3", "FASILITAS"], ["4", "EKSPOR BARANG YANG AKAN DIIMPOR KEMBALI"],
    ["5", "RE-EKSPOR LAINNYA"], ["6", "EKSPOR BARANG EKS IMPOR SEMENTARA"], ["7", "EKSPOR GABUNGAN"]],
  kategoriEkspor: dpRef("kategoriEkspor"),
  caraDagang: [["1", "BIASA"], ["2", "IMB - IMBAL DAGANG"], ["15", "LAINNYA"]],
  komoditas: [["1", "MIGAS"], ["2", "NON MIGAS"]],
  barangKiriman: [["Y", "EKSPOR BARANG KIRIMAN"], ["T", "BUKAN EKSPOR BARANG KIRIMAN"]],
  curah: [["1", "CURAH"], ["2", "NON CURAH"]],
  jenisPengangkutan: [["1", "SATU SARANA ANGKUT"]],
  lokasiPeriksa: [["1", "KAWASAN PABEAN TEMPAT PEMUATAN"]],
  jenisTransaksi: dpRef("jenisTransaksi"),
  asuransi: [["LN", "LUAR NEGERI"], ["DN", "DALAM NEGERI"]],
  afiliasi: [["AFL", "BERHUBUNGAN"], ["TAH", "TIDAK BERHUBUNGAN"]],
  // Kode = Referensi Jenis API; nama pendek seperti pilihan CEISA ("API P")
  api: [["1", "API U"], ["2", "API P"], ["4", "API T"]],
  status: ["KOPERASI", "PMDN (MIGAS)", "PMDN (NON MIGAS)", "PMA (MIGAS)", "PMA (NON MIGAS)", "BUMN", "BUMD", "PERORANGAN", "UMKM", "LAINNYA"].map((x) => [x, x]),
  kategoriKonsolidator: dpRef("kategoriKonsolidator"),
  valuta: dpRef("valuta"),
  // Seperti tercetak di kolom 36 PIB ("Tidak")
  bedaHarga: [["T", "TIDAK"], ["Y", "YA"]],
  metodeNilai: [["METODE 1", "NILAI TRANSAKSI BARANG YANG BERSANGKUTAN"], ["METODE 2", "NILAI TRANSAKSI BARANG IDENTIK"],
    ["METODE 3", "NILAI TRANSAKSI BARANG SERUPA"], ["METODE 4", "METODE DEDUKSI"], ["METODE 5", "METODE KOMPUTASI"], ["METODE 6", "METODE PENGULANGAN"]],
  daerah: dpRef("daerah"),
  pembayaran: dpRef("lokasiBayar"),
  jaminan: dpRef("jenisJaminan"),
  ikb: [["ADA", "ADA"], ["TIDAK ADA", "TIDAK ADA"]],
};
// Daftar saran untuk isian teks bebas
const DP_SARAN = {
  bank: () => [...new Set(dpRef("bank").map(([, n]) => n))],
};

/* Data perusahaan untuk nilai bawaan pihak (Importir / Pemilik Barang /
   NPWP Pemusatan di PIB, Eksportir / Pemilik Barang di PEB) -- seperti
   tersimpan di Referensi CEISA perusahaan. */
const DP_PERUSAHAAN = {
  npwp: "0656319779061000",
  nitku: "0656319779061000000000",
  pib: {
    nama: "PT DYNAMIC DESIGN INDONESIA",
    alamat: "JALAN MAYJEND SUTOYO NO. 1, DESA/KELURAHAN PABEDILAN KULON, KEC. PABEDILAN, KAB. CIREBON, PROVINSI JAWA BARAT, 45193",
    api: "2", nib: "0607220070822", status: "LAINNYA",
  },
  // Seperti terisi di draft PEB CEISA (ENTITAS eksportir & pemilik barang)
  peb: {
    nama: "PT. DYNAMIC DESIGN INDONESIA",
    alamat: "JL MAYJEND SUTOYO NO.1, PABEDILAN KULON, PABEDILAN, KABUPATEN CIREBON, JAWA BARAT 45193",
    status: "LAINNYA",
  },
};
// Pengirim / penjual impor yang berafiliasi: Pemilik Barang "AFL", selain itu "TAH"
const DP_PEMASOK_AFILIASI = /DYNAMIC\s*DESIGN\s*CO\b/i;

const DP_GRUP = [
  {
    k: "header", tab: "header", judul: ["Header", "Header"], isian: [
      { k: "kodeKantor", label: ["Kantor Pabean", "Customs Office"], dok: "pib", jenis: "pilihan", pilihan: "kantor" },
      { k: "jenisPib", label: ["Jenis PIB", "PIB Type"], dok: "pib", jenis: "pilihan", pilihan: "jenisPib" },
      { k: "jenisImpor", label: ["Jenis Impor", "Import Type"], dok: "pib", jenis: "pilihan", pilihan: "jenisImpor" },
      { k: "kantorMuat", label: ["Kantor Pabean Pemuatan", "Loading Customs Office"], dok: "peb", jenis: "pilihan", pilihan: "kantor" },
      { k: "pelabuhanEkspor", label: ["Pelabuhan Muat Ekspor", "Export Loading Port"], dok: "peb", jenis: "pilihan", pilihan: "pelabuhanEkspor" },
      { k: "kantorEkspor", label: ["Kantor Pabean Ekspor", "Export Customs Office"], dok: "peb", jenis: "pilihan", pilihan: "kantor" },
      { k: "jenisEkspor", label: ["Jenis Ekspor", "Export Type"], dok: "peb", jenis: "pilihan", pilihan: "jenisEkspor" },
      { k: "kategoriEkspor", label: ["Kategori Ekspor", "Export Category"], dok: "peb", jenis: "pilihan", pilihan: "kategoriEkspor" },
      { k: "caraDagang", label: ["Cara Perdagangan", "Trade Method"], dok: "peb", jenis: "pilihan", pilihan: "caraDagang" },
      { k: "caraBayar", label: ["Cara Pembayaran", "Payment Method"], jenis: "pilihan", pilihan: { pib: "caraBayarPib", peb: "caraBayarPeb" } },
      { k: "keteranganBayar", label: ["Keterangan Pembayaran", "Payment Note"], dok: "peb" },
      { k: "komoditas", label: ["Komoditas", "Commodity"], dok: "peb", jenis: "pilihan", pilihan: "komoditas" },
      { k: "barangKiriman", label: ["Barang Kiriman", "Consignment Goods"], dok: "peb", jenis: "pilihan", pilihan: "barangKiriman" },
      { k: "curah", label: ["Curah", "Bulk"], dok: "peb", jenis: "pilihan", pilihan: "curah" },
      { k: "kantorDaftar", label: ["Kantor Bea Cukai Pendaftaran", "Registration Customs Office"], dok: "peb", jenis: "pilihan", pilihan: "kantor" },
    ],
  },
  {
    k: "angkut", tab: "pengangkut", judul: ["Pengangkut", "Transport"], isian: [
      { k: "jenisPengangkutan", label: ["Jenis Pengangkutan", "Transport Arrangement"], dok: "peb", jenis: "pilihan", pilihan: "jenisPengangkutan" },
      { k: "bendera", label: ["Bendera", "Flag"], jenis: "pilihan", pilihan: "negara" },
      { k: "pelabuhanTransit", label: ["Pelabuhan Transit", "Transit Port"], dok: "pib", jenis: "pilihan", pilihan: "pelabuhan" },
      { k: "tempatTimbun", label: ["Tempat Penimbunan", "Storage Location (TPS)"] },
      { k: "bc11Nomor", label: ["Nomor BC 1.1", "BC 1.1 No."] },
      { k: "bc11Tanggal", label: ["Tanggal BC 1.1", "BC 1.1 Date"], jenis: "tanggal" },
      { k: "bc11Pos", label: ["Pos BC 1.1", "BC 1.1 Item No."] },
      { k: "bc11SubPos", label: ["Sub Pos BC 1.1", "BC 1.1 Sub Item No."] },
      { k: "lokasiPeriksa", label: ["Lokasi Pemeriksaan", "Inspection Location"], dok: "peb", jenis: "pilihan", pilihan: "lokasiPeriksa" },
      { k: "tanggalPeriksa", label: ["Tanggal Periksa", "Inspection Date"], dok: "peb", jenis: "tanggal" },
      { k: "kantorPeriksa", label: ["Kantor Pabean Pemeriksaan", "Inspection Customs Office"], dok: "peb", jenis: "pilihan", pilihan: "kantor" },
    ],
  },
  {
    k: "kemasan", tab: "kemasan", judul: ["Kemasan & Peti Kemas", "Packages & Containers"], isian: [
      { k: "merekKemasan", label: ["Merek Kemasan", "Package Marks"] },
    ],
  },
  {
    k: "transaksi", tab: "transaksi", judul: ["Transaksi", "Transaction"], isian: [
      { k: "valuta", label: ["Jenis Valuta", "Currency"], jenis: "pilihan", pilihan: "valuta" },
      { k: "transaksiJenis", label: ["Jenis Transaksi", "Transaction Type"], dok: "pib", jenis: "pilihan", pilihan: "jenisTransaksi" },
      { k: "transaksiNomor", label: ["Nomor Transaksi", "Transaction No."], dok: "pib" },
      { k: "transaksiTanggal", label: ["Tanggal Transaksi", "Transaction Date"], dok: "pib", jenis: "tanggal" },
      { k: "kodeAsuransi", label: ["Asuransi", "Insurance"], jenis: "pilihan", pilihan: "asuransi" },
      { k: "ikb", label: ["Informasi Komponen Biaya (IKB)", "Cost Component Information (IKB)"], dok: "pib", jenis: "pilihan", pilihan: "ikb" },
      { k: "bankDevisa", label: ["Bank Devisa Hasil Ekspor", "Export Proceeds Bank"], dok: "peb", saran: "bank" },
      { k: "nilaiMaklon", label: ["Nilai Maklon", "Toll Manufacturing Value"], jenis: "angka", dok: "peb" },
      { k: "beaKeluar", label: ["Nilai Bea Keluar (Rp)", "Export Duty (IDR)"], jenis: "angka", dok: "peb" },
      { k: "pph22", label: ["PPh Pasal 22 Ekspor (Rp)", "Export Income Tax Art. 22 (IDR)"], jenis: "angka", dok: "peb" },
      { k: "danaPerkebunan", label: ["Pungutan Sawit / Dana Perkebunan (Rp)", "Palm Levy / Plantation Fund (IDR)"], jenis: "angka", dok: "peb" },
    ],
  },
  {
    k: "jaminan", tab: "pungutan", judul: ["Pembayaran & Jaminan", "Payment & Guarantee"], dok: "pib", isian: [
      { k: "pembayaran", label: ["Pembayaran melalui", "Paid via"], dok: "pib", jenis: "pilihan", pilihan: "pembayaran" },
      { k: "jaminanJenis", label: ["Jenis Jaminan", "Guarantee Type"], dok: "pib", jenis: "pilihan", pilihan: "jaminan" },
      { k: "jaminanNomor", label: ["Nomor Jaminan", "Guarantee No."], dok: "pib" },
      { k: "jaminanTanggal", label: ["Tanggal Jaminan", "Guarantee Date"], jenis: "tanggal", dok: "pib" },
    ],
  },
  {
    k: "pernyataan", tab: "pernyataan", judul: ["Pernyataan", "Declaration"], isian: [
      { k: "kotaPernyataan", label: ["Tempat", "Place"] },
      { k: "tanggalPernyataan", label: ["Tanggal", "Date"], jenis: "tanggal" },
      { k: "namaPernyataan", label: ["Nama", "Name"] },
      { k: "jabatanPernyataan", label: ["Jabatan", "Position"] },
    ],
  },
  {
    // Ditampilkan di tab Dokumen & Umum, di samping Invoice
    k: "dokumen", tab: "", judul: ["Dokumen", "Documents"], isian: [
      { k: "packingListNomor", label: ["No. Packing List", "Packing List No."] },
      { k: "packingListTanggal", label: ["Tanggal Packing List", "Packing List Date"], jenis: "tanggal" },
    ],
  },
];

/* PIHAK -- tiap pihak satu objek di dataPabean.pihak (urutan = urutan kartu CEISA) */
const DP_PIHAK = [
  { k: "importir", label: ["Importir", "Importer"], dok: "pib", isian: ["identitas", "nitku", "nama", "alamat", "api", "nib", "status"] },
  { k: "pemilik", label: ["Pemilik Barang", "Goods Owner"], isian: ["identitas", "nitku", "nama", "alamat", "hubungan"] },
  { k: "pemusatan", label: ["NPWP Pemusatan", "Centralised Tax ID"], dok: "pib", isian: ["identitas", "nitku", "nama", "alamat"] },
  { k: "pengirim", label: ["Pengirim", "Shipper"], dok: "pib", isian: ["nama", "alamat", "negara"] },
  { k: "penjual", label: ["Penjual", "Seller"], dok: "pib", isian: ["nama", "alamat", "negara"] },
  { k: "ppjk", label: ["PPJK", "Customs Broker (PPJK)"], isian: ["npwp", "nitku", "nama", "alamat", "npPpjk"] },
  { k: "eksportir", label: ["Eksportir", "Exporter"], dok: "peb", isian: ["identitas", "nitku", "nama", "alamat", "status"] },
  { k: "penerima", label: ["Penerima", "Consignee"], dok: "peb", isian: ["nama", "alamat", "negara"] },
  { k: "pembeli", label: ["Pembeli", "Buyer"], dok: "peb", isian: ["nama", "alamat", "negara"] },
  { k: "konsolidator", label: ["Pihak yang Melakukan Konsolidasi", "Consolidator"], dok: "peb", isian: ["kategori", "npwp", "nitku", "nama", "alamat"] },
];
const DP_PIHAK_LABEL = {
  nama: ["Nama", "Name"], alamat: ["Alamat", "Address"], negara: ["Negara", "Country"],
  identitas: ["NPWP 16 Digit", "Tax ID (16 digits)"], nitku: ["NITKU", "NITKU"], npwp: ["NPWP 16 Digit", "Tax ID (16 digits)"],
  status: ["Status", "Status"], api: ["API", "API"], nib: ["NIB", "Business ID (NIB)"], hubungan: ["Afiliasi", "Affiliation"],
  npPpjk: ["NP-PPJK", "PPJK License No."], kategori: ["Kategori", "Category"],
};
// Isian pihak khusus satu jenis dokumen, dan isian berpilihan
const DP_PIHAK_ISIAN_DOK = { hubungan: "pib" };
/* PASANGAN PIHAK [sumber, pengikut]: bawaan isian bersama pengikut =
   isian sumbernya (yang tersimpan, atau bawaan sumber itu sendiri).
   Import: Pemilik Barang = Importir, Penjual = Pengirim; Export: Pemilik
   Barang = Eksportir, Penerima = Pembeli. Isian milik satu pihak saja
   (API, NIB, Status, Afiliasi) tidak ikut. */
const DP_PIHAK_PASANGAN = { pib: [["importir", "pemilik"], ["pengirim", "penjual"]], peb: [["eksportir", "pemilik"], ["pembeli", "penerima"]] };
const DP_PIHAK_PILIHAN = { hubungan: "afiliasi", api: "api", negara: "negara", status: "status", kategori: "kategoriKonsolidator" };

/* PUNGUTAN PIB (tabel 37-44): jenis & kolom. Nilainya DIHITUNG dari
   barang & fasilitasnya (core/customs.js hitungPungutanFasilitas). */
const DP_PUNGUTAN_JENIS = ["BM", "BM KITE", "BMT", "Cukai", "PPN", "PPnBM", "PPh", "TOTAL"];
const DP_PUNGUTAN_KOLOM = [
  ["Dibayar", "Paid"], ["Ditanggung", "Borne by Govt."], ["Ditunda", "Deferred"],
  ["Tidak Dipungut", "Not Collected"], ["Dibebaskan", "Exempted"], ["Telah Dilunasi", "Settled"],
];

/* PER BARANG -- item.dataPabean. Fasilitas per barang TIDAK di sini:
   patokannya daftar fasilitas barang di jadwal (item.skb, PI barang). */
const DP_BARANG = [
  { k: "tarifBm", label: ["Tarif BM (%)", "Import Duty Rate (%)"], jenis: "angka", dok: "pib" },
  { k: "tarifPph", label: ["Tarif PPh (%)", "Income Tax Rate (%)"], jenis: "angka", dok: "pib" },
  { k: "metodeNilai", label: ["Metode Penentuan Nilai Pabean", "Customs Valuation Method"], dok: "pib", jenis: "pilihan", pilihan: "metodeNilai" },
  { k: "bedaHargaLevel", label: ["Statement Perbedaan Harga", "Price Difference Statement"], dok: "pib", jenis: "pilihan", pilihan: "bedaHarga" },
  { k: "jenisVd", label: ["Jenis Voluntary Declaration", "Voluntary Declaration Type"], dok: "pib" },
  { k: "nilaiVd", label: ["Nilai Barang VD", "VD Goods Value"], jenis: "angka", dok: "pib" },
  { k: "jatuhTempo", label: ["Settlement Date VD", "VD Settlement Date"], dok: "pib", jenis: "tanggal" },
  { k: "jenisEkspor", label: ["Jenis Ekspor", "Export Type"], dok: "peb", jenis: "pilihan", pilihan: "jenisEkspor" },
  { k: "daerahAsal", label: ["Daerah Asal Barang", "Region of Origin"], dok: "peb", jenis: "pilihan", pilihan: "daerah" },
  { k: "he", label: ["HE Barang", "Export Benchmark Price (HE)"], jenis: "angka", dok: "peb" },
  { k: "tarifBk", label: ["Tarif Bea Keluar (%)", "Export Duty Rate (%)"], jenis: "angka", dok: "peb" },
];

const dpLabel = (pasangan) => tt(pasangan[0], pasangan[1]);
/* Isian yang berlaku untuk buku jadwal (import = PIB, export = PEB) */
const dpBerlaku = (def, mode) => !def.dok || def.dok === (mode === "export" ? "peb" : "pib");
const dpDok = (mode) => (mode === "export" ? "peb" : "pib");
// Nama daftar pilihan sebuah isian untuk buku ini
const dpPilihanIsian = (def, mode) => (def.pilihan && typeof def.pilihan === "object" ? def.pilihan[dpDok(mode)] : def.pilihan) || "";

function dpTeks(v) {
  if (v == null) return "";
  if (typeof v === "number") return isFinite(v) ? String(v) : "";
  return String(v).replace(/\s+/g, " ").trim();
}
function dpAngka(v) {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : parseLooseNumber(v);
  return isFinite(n) ? n : null;
}
const dpAda = (v) => v != null && v !== "" && !(typeof v === "number" && !isFinite(v));

/* Teks apa pun -> kode daftar pilihan: kodenya sendiri, "1 - BIASA",
   nama ("Biasa", "UNTUK DIPAKAI"), atau "nama (KODE)". Yang tidak dikenal
   dikembalikan apa adanya (dirapikan). */
function dpKodePilihan(pilihan, nilai) {
  const s = dpTeks(nilai);
  if (!s) return "";
  if (pilihan === "negara") return kodeNegara(s) || s;
  const daftar = DP_PILIHAN[pilihan] || [];
  if (!daftar.length) return s;
  const samaKode = (k, x) => k.toUpperCase() === x.toUpperCase() || (/^\d+$/.test(k) && /^\d+$/.test(x) && Number(k) === Number(x));
  const kode = daftar.find(([k]) => samaKode(k, s));
  if (kode) return kode[0];
  // "1 - BIASA", "METODE 1 - NILAI ...", "NAMA (KODE)"
  const m = /^(.+?)\s+[-\u2013\u2014]\s+\S/.exec(s) || /\(([^)]+)\)\s*$/.exec(s);
  if (m) {
    const k2 = daftar.find(([k]) => samaKode(k, m[1].trim()));
    if (k2) return k2[0];
  }
  const nama = daftar.find(([, n]) => kunciAlnum(n) === kunciAlnum(s.replace(/\s*\([^)]*\)\s*$/, "")));
  if (nama) return nama[0];
  // Nama kantor yang sedikit berbeda ("TANJUNG PRIOK" / "TJ. PRIOK")
  if (pilihan === "kantor") {
    if (/PRIOK/i.test(s)) return "040300";
    if (/SOEKARNO|HATTA/i.test(s)) return "050100";
  }
  if (pilihan === "pelabuhanEkspor") {
    const e = typeof resolvePortEntry === "function" ? resolvePortEntry(s.replace(/\s*\(([A-Z]{5})\)\s*$/, "$1")) : null;
    if (e) return e.unlocode;
  }
  return s;
}
// Kode -> "kode - NAMA" (nama dari daftar; kode tak dikenal apa adanya)
function dpNamaPilihan(pilihan, kode) {
  const s = dpTeks(kode);
  if (!s) return "";
  if (pilihan === "negara") {
    const n = NEGARA_PER_KODE.get(s.toUpperCase());
    return n ? `${n[0]} - ${String(n[2]).toUpperCase()}` : s;
  }
  const p = (DP_PILIHAN[pilihan] || []).find(([k]) => k === s);
  // Pilihan tanpa kode tersendiri (Status "LAINNYA", IKB "ADA"): namanya saja
  return p ? (p[0] === p[1] ? p[0] : `${p[0]} - ${p[1]}`) : s;
}

function dpRapiIsian(v, jenis, pilihan) {
  if (jenis === "angka") return dpAngka(v);
  if (jenis === "pilihan") {
    // Daftar per buku ({ pib, peb }): kode dari daftar mana pun yang mengenalnya
    if (pilihan && typeof pilihan === "object") {
      const daftar = Object.values(pilihan);
      for (const p of daftar) {
        const k = dpKodePilihan(p, v);
        if ((DP_PILIHAN[p] || []).some(([kk]) => kk === k)) return k;
      }
      return dpTeks(v);
    }
    return dpKodePilihan(pilihan, v);
  }
  const s = jenis === "panjang" ? String(v == null ? "" : v).split(/\r?\n/).map(dpTeks).filter(Boolean).join("\n") : dpTeks(v);
  if (jenis === "tanggal") return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  return s;
}

/* Data lama (sebelum isian disusun menurut tab CEISA): nama -> kode, nama
   isian lama -> baru. Isian yang kini dihitung dari jadwal dibuang. */
function dpDariLama(d) {
  const x = Object.assign({}, d);
  if (!x.kodeKantor && x.kantor) x.kodeKantor = x.kantor;
  // "Korea Selatan (KR)" -> "KR"; "NEW PORT ... (NCT1)" -> "NCT1"
  if (x.bendera) x.bendera = String(x.bendera).replace(/^.*\(([A-Z]{2})\)\s*$/, "$1");
  if (x.tempatTimbun) x.tempatTimbun = String(x.tempatTimbun).replace(/^.*\(([A-Z0-9]{2,8})\)\s*$/, "$1");
  return x;
}

/* Data PIB/PEB yang dirapikan: hanya isian yang dikenal & berisi. */
function rapikanDataPabean(dp) {
  const d = dpDariLama(dp && typeof dp === "object" ? dp : {});
  const hasil = {};
  DP_GRUP.forEach((g) => g.isian.forEach((f) => {
    const v = dpRapiIsian(d[f.k], f.jenis, f.pilihan);
    if (dpAda(v)) hasil[f.k] = v;
  }));
  const pihak = {};
  DP_PIHAK.forEach((p) => {
    const sumber = (d.pihak && d.pihak[p.k]) || {};
    const isi = {};
    p.isian.forEach((k) => {
      const pil = DP_PIHAK_PILIHAN[k];
      const v = k === "alamat" ? dpRapiIsian(sumber[k], "panjang") : pil ? dpRapiIsian(sumber[k], "pilihan", pil) : dpRapiIsian(sumber[k], "teks");
      if (dpAda(v)) isi[k] = v;
    });
    if (Object.keys(isi).length) pihak[p.k] = isi;
  });
  if (Object.keys(pihak).length) hasil.pihak = pihak;
  return hasil;
}

function rapikanDataPabeanBarang(dp) {
  const d = Object.assign({}, dp && typeof dp === "object" ? dp : {});
  // Data lama: "Nilai yang ditambahkan" = nilai VD; tarif dari teks "BM 10% 100% BBS"
  if (d.nilaiVd == null && d.nilaiTambah != null) d.nilaiVd = d.nilaiTambah;
  if (d.tarifFasilitas && (d.tarifBm == null || d.tarifPph == null)) {
    const bm = /\bBM\s+([\d.,]+)\s*%/i.exec(d.tarifFasilitas);
    const pph = /\bPPH\s+([\d.,]+)\s*%/i.exec(d.tarifFasilitas);
    if (bm && d.tarifBm == null) d.tarifBm = bm[1];
    if (pph && d.tarifPph == null) d.tarifPph = pph[1];
  }
  const hasil = {};
  DP_BARANG.forEach((f) => {
    const v = dpRapiIsian(d[f.k], f.jenis, f.pilihan);
    if (dpAda(v)) hasil[f.k] = v;
  });
  return hasil;
}

const adaDataPabean = (dp) => Object.keys(rapikanDataPabean(dp)).length > 0;
const adaDataPabeanBarang = (dp) => Object.keys(rapikanDataPabeanBarang(dp)).length > 0;

/* Gabung hasil baca dokumen ke data yang ada: isian dokumen yang BERISI
   menang (dokumen pabean adalah sumber resminya), isian yang tidak
   terbaca tidak menghapus yang sudah ada. */
function gabungDataPabean(lama, baru) {
  const a = rapikanDataPabean(lama);
  const b = rapikanDataPabean(baru);
  const hasil = Object.assign({}, a, b);
  if (a.pihak || b.pihak) {
    hasil.pihak = Object.assign({}, a.pihak);
    Object.keys(b.pihak || {}).forEach((k) => (hasil.pihak[k] = Object.assign({}, hasil.pihak[k], b.pihak[k])));
  }
  return rapikanDataPabean(hasil);
}
function gabungDataPabeanBarang(lama, baru) {
  return rapikanDataPabeanBarang(Object.assign({}, rapikanDataPabeanBarang(lama), rapikanDataPabeanBarang(baru)));
}

/* ---------------- NILAI BAWAAN ----------------
   konteks: { mode, transport, party, pihak }. Header per moda (laut /
   udara, impor / ekspor), pihak perusahaan, Transaksi: valuta USD &
   jenis transaksi LAI. Pengirim (impor) & pembeli (ekspor) bernama sama
   dengan Shipper / Buyer jadwal; pihak pengikut DP_PIHAK_PASANGAN
   menyalin sumbernya -- konteks.pihak = pihak yang tersimpan / sedang
   diisi, jadi yang diketik di sumber ikut jadi bawaan pengikutnya. */
const dpUdara = (transport) => /^(udara|kurir)$/i.test(String(transport || ""));
function dpBawaan(konteks) {
  const k = konteks || {};
  const ekspor = k.mode === "export";
  const udara = dpUdara(k.transport);
  const laut = String(k.transport || "").toLowerCase() === "laut";
  const party = dpTeks(k.party).toUpperCase();
  const d = { valuta: "USD", pihak: {} };
  const ddi = DP_PERUSAHAAN[ekspor ? "peb" : "pib"];
  const perusahaan = Object.assign({ identitas: DP_PERUSAHAAN.npwp, nitku: DP_PERUSAHAAN.nitku }, ddi);
  if (ekspor) {
    if (udara || laut) {
      Object.assign(d, udara
        ? { kantorMuat: "050100", pelabuhanEkspor: "IDCGK", kantorEkspor: "050100", jenisEkspor: "4", caraBayar: "14" }
        : { kantorMuat: "040300", pelabuhanEkspor: "IDTPP", kantorEkspor: "040300", jenisEkspor: "1", caraBayar: "9", keteranganBayar: "LAINNYA" });
      Object.assign(d, { kategoriEkspor: "10", caraDagang: "15", komoditas: "2", barangKiriman: "T", curah: "2" });
    }
    d.pihak.eksportir = { identitas: perusahaan.identitas, nitku: perusahaan.nitku, nama: perusahaan.nama, alamat: perusahaan.alamat, status: perusahaan.status };
    d.pihak.pemilik = { identitas: perusahaan.identitas, nitku: perusahaan.nitku, nama: perusahaan.nama, alamat: perusahaan.alamat };
  } else {
    if (udara || laut) d.kodeKantor = udara ? "050100" : "040300";
    Object.assign(d, { jenisPib: "1", jenisImpor: "1", caraBayar: "1", transaksiJenis: "LAI" });
    d.pihak.importir = Object.assign({}, perusahaan);
    const dasar = { identitas: perusahaan.identitas, nitku: perusahaan.nitku, nama: perusahaan.nama, alamat: perusahaan.alamat };
    const pemasok = [party, dpTeks(((k.pihak || {}).pengirim || {}).nama), dpTeks(((k.pihak || {}).penjual || {}).nama)].join(" ");
    d.pihak.pemilik = Object.assign({}, dasar, { hubungan: DP_PEMASOK_AFILIASI.test(pemasok) ? "AFL" : "TAH" });
    d.pihak.pemusatan = Object.assign({}, dasar);
  }
  if (party) d.pihak[ekspor ? "pembeli" : "pengirim"] = { nama: party };
  const tersimpan = k.pihak || {};
  const isianPihak = (p) => DP_PIHAK.find((x) => x.k === p).isian;
  DP_PIHAK_PASANGAN[dpDok(k.mode)].forEach(([sumber, pengikut]) => {
    const asal = Object.assign({}, d.pihak[sumber]);
    Object.keys(tersimpan[sumber] || {}).forEach((f) => {
      if (dpAda(tersimpan[sumber][f])) asal[f] = tersimpan[sumber][f];
    });
    const ikut = Object.assign({}, d.pihak[pengikut]);
    isianPihak(sumber).filter((f) => isianPihak(pengikut).includes(f)).forEach((f) => {
      if (dpAda(asal[f])) ikut[f] = asal[f];
      else delete ikut[f];
    });
    if (Object.keys(ikut).length) d.pihak[pengikut] = ikut;
  });
  return d;
}

/* Isi bawaan ke data: isian kosong diisi; isian yang masih sama dengan
   bawaan SEBELUMNYA (belum diubah pengguna) ikut berganti bila bawaannya
   berubah (moda, Supplier/Customer). Mengembalikan data baru. */
function terapkanBawaan(dp, bawaanBaru, bawaanLama) {
  const d = rapikanDataPabean(dp);
  const baru = bawaanBaru || {};
  const lama = bawaanLama || {};
  const pakai = (sekarang, b, l) => !dpAda(sekarang) || (dpAda(l) && sekarang === l) ? b : sekarang;
  Object.keys(baru).forEach((k) => {
    if (k === "pihak") return;
    const v = pakai(d[k], baru[k], lama[k]);
    if (dpAda(v)) d[k] = v;
    else delete d[k];
  });
  Object.keys(lama).forEach((k) => {
    if (k !== "pihak" && !(k in baru) && d[k] === lama[k]) delete d[k];
  });
  const pihak = Object.assign({}, d.pihak);
  const lamaPihak = lama.pihak || {};
  Object.keys(baru.pihak || {}).forEach((p) => {
    const isi = Object.assign({}, pihak[p]);
    Object.keys(baru.pihak[p]).forEach((f) => {
      const v = pakai(isi[f], baru.pihak[p][f], (lamaPihak[p] || {})[f]);
      if (dpAda(v)) isi[f] = v;
    });
    pihak[p] = isi;
  });
  d.pihak = pihak;
  return rapikanDataPabean(d);
}

/* ---------------- NILAI DARI JADWAL ----------------
   Yang sudah punya kolom jadwal atau dihitung darinya tidak disimpan di
   Data PIB/PEB; halaman Data PIB/PEB & Cek PIB/PEB membacanya dari
   jadwal lewat fungsi-fungsi ini. `s` = jadwal, atau bentuk yang sama
   dari isian form (data-pabean-form.js). */

const dpKonteksJadwal = (s) => ({ mode: s.mode, transport: s.transport, party: s.party, pihak: (s.dataPabean || {}).pihak });
// Data PIB/PEB yang berlaku: yang tersimpan, isian kosongnya diisi nilai bawaan
const dpEfektif = (s) => terapkanBawaan(s.dataPabean, dpBawaan(dpKonteksJadwal(s)), null);

/* Transaksi: harga barang (jumlah Amount barang), CIF = harga + freight
   + asuransi (seperti kartu Kepabeanan & Biaya), nilai pabean rupiah,
   FOB = harga penyerahan dikurangi biaya yang ditanggung penjual menurut
   incoterm, berat kotor & bersih, dan (PIB) tabel pungutan per
   fasilitas. Tarif (%) jadwal kosong = 5%. `s.pungutanManual` (form):
   BM / PPN / PPh yang diketik sendiri -- kolom Dibayar sama dengan
   Kepabeanan & Biaya. */
function dpNilaiHitung(s) {
  const angka = (v) => {
    const n = typeof v === "number" ? v : parseLooseNumber(v);
    return isFinite(n) ? n : 0;
  };
  const tot = itemTotals({ items: s.items || [] });
  const freight = angka(s.freight);
  const asuransi = angka(s.insurance);
  const ndpbm = angka(s.ndpbm);
  const incoterm = dpTeks(s.incoterm).toUpperCase();
  const potong = /^(CIF|CIP)$/.test(incoterm) ? freight + asuransi : /^(CFR|CPT)$/.test(incoterm) ? freight : 0;
  const cif = tot.totalUSD + freight + asuransi;
  const hasil = {
    harga: tot.totalUSD, freight, asuransi, ndpbm, incoterm, cif, nilaiPabean: cif * ndpbm,
    fob: Math.max(0, tot.totalUSD - potong), bruto: tot.totalBruto, netto: tot.totalNetto,
  };
  if (s.mode !== "export") {
    const tarif = s.tarif == null || s.tarif === "" ? 5 : angka(s.tarif);
    hasil.pungutan = hitungPungutanFasilitas(Object.assign({ items: s.items || [], freightUsd: freight, asuransiUsd: asuransi, ndpbm, tarifBm: tarif }, s.pungutanManual));
  }
  return hasil;
}

/* Dokumen jadwal seperti tab Dokumen CEISA: [{ kode, nama, nomor,
   tanggal, asal }] -- asal = tab form tempat dokumennya diisi (umum /
   pabean / barang). Fasilitas barang sekali per jenis & nomor. */
const DP_KODE_FASILITAS = { PPN: "456", PPH: "457", Masterlist: "912", "E-COO": "861" };
function dpDokumenJadwal(s) {
  const out = [];
  const alnum = (x) => kunciAlnum(x);
  const tambah = (kode, nomor, tanggal, asal, nama) => {
    const n = dpTeks(nomor);
    if (!n && !tanggal) return;
    const ref = (dpRef("dokumen").find(([k]) => k === kode) || [])[1];
    out.push({ kode, nama: nama || ref || (typeof namaDokumenCeisa === "function" ? namaDokumenCeisa(kode) : kode), nomor: n, tanggal: tanggal || "", asal });
  };
  const udara = dpUdara(s.transport);
  const dp = s.dataPabean || {};
  tambah("380", s.invoice, s.invoiceDate, "umum");
  tambah("217", dp.packingListNomor, dp.packingListTanggal, "umum");
  const master = dpTeks(s.masterBL);
  const house = dpTeks(s.houseBL);
  if (master && house && alnum(master) !== alnum(house)) {
    tambah(udara ? "741" : "704", master, s.masterBLDate, "umum");
    tambah(udara ? "740" : "705", house, s.houseBLDate, "umum");
  } else {
    tambah(udara ? "740" : "705", house || master, house ? s.houseBLDate : s.masterBLDate, "umum");
  }
  if (typeof rapikanDokPelengkap === "function") {
    const dok = rapikanDokPelengkap(s.dokPelengkap && typeof s.dokPelengkap === "object" ? s.dokPelengkap : dokPelengkapJadwal(s));
    JENIS_DOK_PENGIRIMAN.forEach((j) => dok[j].forEach((d) => tambah(DOK_PENGIRIMAN[j].kode, d.nomor, d.tanggal, "pabean")));
    dok.lain.forEach((d) => tambah(d.kode || "999", d.nomor, d.tanggal, "pabean"));
  }
  const sudah = new Set();
  (s.items || []).forEach((it) => (it.skb || []).forEach((sk) => {
    if (!sk || !sk.jenis) return;
    const kode = DP_KODE_FASILITAS[sk.jenis] || "";
    const kunci = `${sk.jenis}|${alnum(sk.jenisLainnya)}|${alnum(sk.nomor)}`;
    if (sudah.has(kunci)) return;
    sudah.add(kunci);
    const label = typeof skbEntryLabel === "function" ? skbEntryLabel(sk) : sk.jenis;
    tambah(kode, sk.nomor || "-", sk.tanggal, "barang", kode ? "" : sk.jenis === "BM" ? "SKB BM" : label.toUpperCase());
  }));
  return out;
}

/* Packing List (217) yang tersimpan sebagai "dokumen lain" sebelum punya
   isian sendiri: dipindah ke isian Packing List Data PIB/PEB (yang sudah
   terisi tidak ditimpa) dan dilepas dari dokumen lain. Saat jadwal dimuat. */
function pindahkanPackingList(s) {
  const lain = (s.dokPelengkap && s.dokPelengkap.lain) || [];
  const pl = lain.filter((d) => d.kode === "217");
  if (!pl.length) return s;
  s.dokPelengkap = Object.assign({}, s.dokPelengkap, { lain: lain.filter((d) => d.kode !== "217") });
  const dp = s.dataPabean || {};
  if (!dp.packingListNomor && !dp.packingListTanggal) {
    s.dataPabean = rapikanDataPabean(Object.assign({}, dp, { packingListNomor: pl[0].nomor, packingListTanggal: pl[0].tanggal }));
  }
  return s;
}

/* Label letak isian untuk Cek PIB/PEB & Lembar Koreksi: "isian" atau
   "pihak.importir.nama" atau "pungutan.BM.4". */
function dpLabelKunci(kunci) {
  const [a, b, c] = String(kunci || "").split(".");
  if (a === "pihak") {
    const p = DP_PIHAK.find((x) => x.k === b);
    return p ? `${dpLabel(p.label)} — ${dpLabel(DP_PIHAK_LABEL[c] || [c, c])}` : "";
  }
  if (a === "pungutan") return `${tt("Pungutan", "Duties")} ${b} — ${dpLabel(DP_PUNGUTAN_KOLOM[Number(c)] || ["", ""])}`;
  const f = DP_GRUP.flatMap((g) => g.isian).find((x) => x.k === a);
  return f ? dpLabel(f.label) : "";
}

/* BARIS DATAR (sheet "DATA PIB-PEB" Bulk Excel, bulk-excel.js): satu
   baris per isian berisi -- { kunci, kelompok, label, nilai, jenis }.
   Kunci: "kodeKantor" | "pihak.importir.nama"; per barang: kunci
   isian barangnya. Isian berpilihan ditulis "kode - NAMA" dan dibaca
   balik ke kodenya. */
function dpKeBaris(dp, mode) {
  const d = rapikanDataPabean(dp);
  const baris = [];
  DP_GRUP.forEach((g) => g.isian.forEach((f) => {
    if (!dpAda(d[f.k])) return;
    const pil = dpPilihanIsian(f, mode);
    baris.push({ kunci: f.k, kelompok: dpLabel(g.judul), label: dpLabel(f.label), nilai: f.jenis === "pilihan" ? dpNamaPilihan(pil, d[f.k]) : d[f.k], jenis: f.jenis === "pilihan" ? "teks" : f.jenis || "teks" });
  }));
  DP_PIHAK.forEach((p) => {
    const isi = (d.pihak || {})[p.k] || {};
    p.isian.filter((k) => dpAda(isi[k])).forEach((k) =>
      baris.push({ kunci: `pihak.${p.k}.${k}`, kelompok: dpLabel(p.label), label: dpLabel(DP_PIHAK_LABEL[k]),
        nilai: DP_PIHAK_PILIHAN[k] ? dpNamaPilihan(DP_PIHAK_PILIHAN[k], isi[k]) : isi[k], jenis: k === "alamat" ? "panjang" : "teks" }));
  });
  return baris;
}
function dpBarangKeBaris(dp) {
  const d = rapikanDataPabeanBarang(dp);
  return DP_BARANG.filter((f) => dpAda(d[f.k]))
    .map((f) => ({ kunci: f.k, kelompok: tt("Data per Barang", "Per-item Data"), label: dpLabel(f.label), nilai: f.jenis === "pilihan" ? dpNamaPilihan(f.pilihan, d[f.k]) : d[f.k], jenis: f.jenis === "pilihan" ? "teks" : f.jenis || "teks" }));
}
// Jenis isian sebuah kunci baris datar (tanggal dibaca balik dari nomor seri Excel)
function dpJenisKunci(kunci) {
  const [a, b] = String(kunci || "").trim().split(".");
  if (a === "pihak") return "teks";
  const f = DP_GRUP.flatMap((g) => g.isian).concat(DP_BARANG).find((x) => x.k === a && b == null);
  return f ? (f.jenis === "pilihan" ? "teks" : f.jenis || "teks") : "teks";
}
// Kebalikannya: [{ kunci, nilai }] -> data (tanggal sudah "YYYY-MM-DD")
function dpDariBaris(baris) {
  const dp = { pihak: {} };
  (baris || []).forEach(({ kunci, nilai }) => {
    const [a, b, c] = String(kunci || "").trim().split(".");
    if (a === "pihak" && b && c) (dp.pihak[b] = dp.pihak[b] || {})[c] = nilai;
    else if (a && b == null) dp[a] = nilai;
  });
  return rapikanDataPabean(dp);
}
function dpBarangDariBaris(baris) {
  return rapikanDataPabeanBarang(Object.fromEntries((baris || []).map(({ kunci, nilai }) => [String(kunci || "").trim(), nilai])));
}
