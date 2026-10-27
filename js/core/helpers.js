"use strict";

/* HELPERS */
function uid(p) {
  return (p || "s") + "_" + Math.random().toString(36).slice(2, 10);
}

function parseLocalDate(d) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt) ? null : dt;
}
/* Tanggal + jam LOKAL, kalau jamnya ada — kalau tidak, jatuh ke tengah
   malam seperti parseLocalDate() biasa (isi jam OPSIONAL: banyak
   jadwal lama/tanpa moda udara tidak akan pernah mengisinya, dan itu
   harus tetap berperilaku persis seperti sebelum fitur jam ada). Jam
   "HH:MM" dari <input type="time">, jadi selalu 2 digit. */
function parseLocalDateTime(d, jam) {
  if (!d) return null;
  const dt = new Date(d + "T" + (jam && /^\d{2}:\d{2}/.test(jam) ? jam : "00:00") + ":00");
  return isNaN(dt) ? null : dt;
}
// Tanggal HARI INI dalam format ISO (yyyy-mm-dd), memakai zona waktu LOKAL pengguna
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/* Tanggal tampilan: DD-MM-YYYY.
   Sengaja disusun sendiri, bukan lewat toLocaleDateString — hasil
   locale bergantung pada setelan peramban tiap pengguna, dan justru
   itu yang membuat formatnya berbeda-beda antar komputer. */
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return "—";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(dt.getDate())}-${p2(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}

/* TANGGAL DARI NOMOR AJU CEISA (26 karakter):
     000020  POL858  20261016  024172
     kantor  pengaju TAHUN-BULAN-TANGGAL  nomor urut
   -> "2026-10-16". Tanda pisah diabaikan ("000020-029142-20260712-
   197154"). Bukan nomor aju lengkap ("CONSIGNEE NOTE", ekornya saja)
   atau tanggalnya tidak sah -> "". Dipakai sebagai tanggal PIB/PEB
   BAWAAN -- isiannya tetap bisa diubah pengguna. */
function tanggalDariAju(aju) {
  const k = String(aju == null ? "" : aju).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^\d{6}[A-Z0-9]{6}(20\d{2})(\d{2})(\d{2})\d{6}$/.exec(k);
  if (!m) return "";
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const dt = parseLocalDate(iso);
  return dt && dt.getMonth() + 1 === Number(m[2]) && dt.getDate() === Number(m[3]) ? iso : "";
}

/* FORMATTER INTL YANG DISIMPAN.

   n.toLocaleString(locale, opsi) / d.toLocaleDateString(locale, opsi)
   membangun formatter baru di SETIAP panggilan: ±25 µs untuk angka,
   ±65 µs untuk tanggal. Kartu, tabel & laporan memanggilnya ratusan
   kali tiap digambar. Formatter yang disimpan ±0,5 µs, hasilnya sama
   persis (spesifikasinya memang "buat formatter, lalu format").
   Tanpa opsi tidak perlu: peramban sudah menyimpannya sendiri. */
const FORMATTER_INTL = new Map();
function formatterIntl(Kelas, locale, opsi) {
  const kunci = Kelas.name + "|" + locale + "|" + JSON.stringify(opsi);
  let f = FORMATTER_INTL.get(kunci);
  if (!f) {
    f = new Kelas(locale, opsi);
    FORMATTER_INTL.set(kunci, f);
  }
  return f;
}
// = n.toLocaleString(locale, opsi), n berupa Number
function angkaLokal(n, locale, opsi) {
  return formatterIntl(Intl.NumberFormat, locale, opsi).format(n);
}
/* = d.toLocaleDateString / toLocaleTimeString(locale, opsi) -- opsinya
   menyebut sendiri bagian yang ditulis (day/month/year/weekday atau
   hour/minute), seperti semua pemanggil di aplikasi ini. */
function tanggalLokal(d, locale, opsi) {
  if (isNaN(d)) return "Invalid Date";
  return formatterIntl(Intl.DateTimeFormat, locale, opsi).format(d);
}

function fmtDateLong(d) {
  const dt = parseLocalDate(d);
  if (!dt) return tt("Tanggal Tidak Diketahui", "Unknown Date");
  // Nama bulan mengikuti bahasa tampilan ("Agustus" / "August").
  return tanggalLokal(dt, activeLang === "en" ? "en-GB" : "id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
function fmtUSD(n) {
  n = Number(n) || 0;
  return (
    "$" +
    angkaLokal(n, "en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}
function fmtRp(n) {
  n = Math.round(Number(n) || 0);
  return "Rp " + n.toLocaleString("id-ID");
}
/* Rupiah PRESISI: desimal ditampilkan hanya kalau memang ada, paling
   banyak 2 angka -- Rp 35.032.591,22, tapi Rp 84.639.460 (bukan
   84.639.460,00). Untuk Nilai Pabean, yang di PIB pun bersen. */
function fmtRpPresisi(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const bulat = Number.isInteger(v);
  return "Rp " + angkaLokal(v, "id-ID", { minimumFractionDigits: bulat ? 0 : 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString("id-ID");
}
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function escapeAttr(str) {
  return escapeHtml(str);
}

/* "1 EA + 60.000 SET". Satuan kosong ditulis tanpa keterangan supaya
   barang yang satuannya belum diisi tidak menghilang dari total. */
function fmtQtyBySatuan(list) {
  if (!list || !list.length) return "0";
  return list
    .map((g) => `${fmtNum(g.qty)}${g.satuan ? " " + g.satuan : ""}`)
    .join(" + ");
}

/* KOLOM BARANG = KOLOM BARANG CEISA, kiri ke kanan: Kode Barang,
   Uraian, Merek, Tipe, Ukuran, Spesifikasi Lain (buku Export menambah
   Marks). `namaBarang` adalah Uraian -- kolom database-nya tetap
   nama_barang. Isian form, impor draft/PIB/PEB, dan Cek PIB/PEB
   memakai susunan yang sama, jadi tiap kolom dibandingkan dengan
   kolom yang sama di CEISA. */
const KOLOM_NAMA_BARANG = ["kodeBarang", "namaBarang", "merek", "tipe", "ukuran", "spesifikasiLain"];
// Kolom CEISA selain Uraian. Semuanya kosong = barang lama: seluruh namanya ditulis di Uraian.
const KOLOM_CEISA_LAIN = ["kodeBarang", "merek", "tipe", "ukuran", "spesifikasiLain"];
// Kolom sesudah Uraian -- kolom TYPE di CIPL Dynamic Design Korea
const KOLOM_SESUDAH_URAIAN = ["merek", "tipe", "ukuran", "spesifikasiLain"];

/* TANDA KOSONG ALA CEISA: "-" dan "TANPA MEREK" / "TANPA TIPE" (juga
   TANPA UKURAN, dst.) berarti kolomnya memang tidak berisi. Disimpan
   apa adanya (itulah isian CEISA-nya), tapi TIDAK PERNAH ikut ke nama
   barang -- di layar, salinan, maupun cetakan. */
const TANDA_KOSONG_BARANG = /^(?:-+|TANPA\s+(?:MEREK|MERK|TIPE|TYPE|UKURAN|SPESIFIKASI(?:\s+LAIN)?|KODE(?:\s+BARANG)?))$/i;
function rapiBagianNama(v) {
  const x = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  return TANDA_KOSONG_BARANG.test(x) ? "" : x;
}

/* Bagian nama barang, KIRI KE KANAN mengikuti kolom CEISA. Tanda
   kosong dilewati, spasi di dalam kolom dirapikan jadi satu, dan
   bagian yang SUDAH tertulis (sebagai kata utuh) di bagian sebelumnya
   tidak diulang ("TIRE MOLD 225/50R17" + Ukuran 225/50R17) --
   menyambung apa adanya menghasilkan nama yang terlihat salah ketik
   dan menyulitkan pencocokan teks saat ditempel ke Excel.
   Hasil: [{ kolom, teks }]. */
function bagianNamaBarang(it) {
  if (!it) return [];
  return rakitBagianNama(KOLOM_NAMA_BARANG.map((kolom) => ({ kolom, teks: rapiBagianNama(it[kolom]) })));
}

// [{ teks }] berurutan -> yang ikut ke nama: berisi, dan belum tertulis di bagian sebelumnya
function rakitBagianNama(bagian) {
  const sudah = [];
  return bagian.filter((b) => {
    if (!b.teks) return false;
    const kata = " " + b.teks.toUpperCase() + " ";
    if (sudah.some((s) => s.includes(kata))) return false;
    sudah.push(kata);
    return true;
  });
}

/* NAMA BARANG YANG DITAMPILKAN. Satu aturan untuk kartu, panel detail,
   templat salin, laporan, surat, DAN kedua bentuk CIPL -- supaya nama
   yang terlihat di layar selalu sama dengan yang tersalin & tercetak. */
function itemDisplayName(it) {
  return bagianNamaBarang(it)
    .map((b) => b.teks)
    .join(" ");
}

// Bagian sesudah Uraian: Merek, Tipe, Ukuran, Spesifikasi Lain (yang berisi)
function rincianNamaBarang(it) {
  return bagianNamaBarang(it)
    .filter((b) => KOLOM_SESUDAH_URAIAN.includes(b.kolom))
    .map((b) => b.teks);
}

// Barang yang memakai kolom CEISA selain Uraian (bukan barang lama)
function barangBerkolomCeisa(it) {
  return !!it && KOLOM_CEISA_LAIN.some((k) => String(it[k] == null ? "" : it[k]).trim() !== "");
}

// Teks kolom barang untuk pencarian (daftar jadwal & palet perintah) -- tanpa tanda kosong: "TANPA" tidak mengena semua barang
function teksCariBarang(it) {
  return it ? KOLOM_NAMA_BARANG.map((k) => rapiBagianNama(it[k])) : [];
}

/* KODE KONDISI BARANG (kolom KODE KONDISI BARANG draft PIB / BC 2.0):
   1 = BARU, 2 = BUKAN BARU. Hanya buku Import -- PEB (BC 3.0) tidak
   memuat kolom ini. Label mengikuti bahasa aktif; yang tersimpan &
   dibandingkan selalu kodenya. */
const KONDISI_BARANG = [
  ["1", "BARU", "NEW"],
  ["2", "BUKAN BARU", "NOT NEW"],
];

// "1", "01", "1 - BARU", "BARU" -> "1"; "BUKAN BARU", "BEKAS" -> "2"; lainnya apa adanya
function kodeKondisiBarang(v) {
  const s = String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, " ");
  if (!s) return "";
  if (/^0*1(?:\D.*)?$/.test(s) || s === "BARU" || s === "NEW") return "1";
  if (/^0*2(?:\D.*)?$/.test(s) || /^(?:BUKAN|TIDAK) BARU$|^BEKAS$|^USED$|^NOT NEW$/.test(s)) return "2";
  return s;
}

// "1 - BARU" (bahasa aktif); kode tak dikenal ditampilkan apa adanya
function labelKondisiBarang(v) {
  const kode = kodeKondisiBarang(v);
  const k = KONDISI_BARANG.find((x) => x[0] === kode);
  return k ? `${k[0]} - ${tt(k[1], k[2])}` : kode;
}

/* PETI KEMAS DI ISIAN CONTAINER/SEAL NUMBER: satu kontainer per bagian
   (dipisah koma), "NOMOR / UKURAN / TIPE" -- urutan isian "Nomor,
   Ukuran, dan Tipe Peti Kemas" PIB. Ditulis begitu oleh impor draft
   CEISA (teksKontainer) dan dibaca balik oleh Cek PIB/PEB; yang diketik
   sendiri boleh lebih bebas ("TGHU1234567 40' FCL", "1x40HC ...").
     UKURAN : KODE UKURAN KONTAINER (20 / 40 / 45).
     TIPE   : jenis muatan FCL / LCL (KODE JENIS KONTAINER F / L). */
function muatanDariKode(v) {
  const s = String(v == null ? "" : v).trim().toUpperCase();
  if (s === "F" || s === "FCL") return "FCL";
  if (s === "L" || s === "LCL") return "LCL";
  return "";
}

/* Jenis muatan (FCL / LCL) & peti kemas hanya untuk kiriman LAUT --
   muatan udara tidak dikapalkan dalam kontainer. Isian lama yang
   terlanjur tersimpan di jadwal udara tidak ditampilkan / disalin. */
function muatanKiriman(s) {
  return s && s.transport !== "udara" ? String(s.muatan || "") : "";
}
function kontainerKiriman(s) {
  return s && s.transport !== "udara" ? String(s.container || "") : "";
}

function teksKontainer(k) {
  return [k.nomor, k.ukuran, muatanDariKode(k.jenis)]
    .map((x) => String(x == null ? "" : x).trim().toUpperCase())
    .filter(Boolean)
    .join(" / ");
}

function newItem(mode) {
  /* Nilai bawaan BEDA per buku, dibaca dari `mode` (tanpa itu:
     activeMode):
       Import : jenis BAHAN BAKU  (bahan yang didatangkan untuk diolah),
                Tipe TANPA TIPE
       Export : jenis BARANG JADI (hasil olahan yang dikirim keluar),
                Tipe kosong
     Kode Barang "-" & Merek TANPA MEREK di kedua buku, mengikuti
     pengisian CEISA; Kode Kondisi Barang 1 (BARU) hanya di Import.
     Satuan (SET) & jenis kemasan (BOX) sama di kedua buku.
     Semuanya cuma NILAI AWAL — tetap bisa diganti per barang. */
  const modeKini = mode || (typeof activeMode === "string" ? activeMode : "import");
  return {
    id: uid("it"),
    // Kolom barang CEISA (KOLOM_NAMA_BARANG); namaBarang = Uraian
    kodeBarang: "-",
    namaBarang: "",
    merek: "TANPA MEREK",
    tipe: modeKini === "export" ? "" : "TANPA TIPE",
    ukuran: "",
    spesifikasiLain: "",
    /* Kode Kondisi Barang (KONDISI_BARANG): Import bawaan 1 = BARU,
       Export kosong (PEB tidak memuatnya). Kode Negara Asal: kode ISO
       (negara.js), tanpa bawaan. */
    kondisiBarang: modeKini === "export" ? "" : "1",
    negaraAsal: "",
    hsCode: "",
    jenisBarang: modeKini === "export" ? "BARANG JADI" : "BAHAN BAKU",
    qty: 0,
    satuan: "SET",
    harga: 0,
    netto: 0,
    bruto: 0,
    // Kemasan PER BARANG (dulu 1 field bebas-teks di level shipment, sekarang per barang
    package: "",
    /* Kemasan HITUNGAN untuk buku Export: "1 BOX", "2 PALLET".

       Terpisah dari `package` karena di Export kolom itu berisi DIMENSI
       peti (82*82*75) yang dipakai menghitung CBM — bukan jumlah
       koli. Surat jalan butuh jumlahnya, bukan ukurannya. */
    packing: "",
    /* Jenis kemasannya — BOX, PALLET, CRATE. Dipisah dari angkanya
       supaya bisa dijumlahkan per jenis tanpa mengurai teks. */
    packingUnit: "BOX",
    /* Marks pada CIPL (buku Export). Kosong = dibangkitkan otomatis
       dari urutan koli ("C# : 8-1"); diisi kalau penandaan di lapangan
       berbeda. */
    marks: "",
    /* PI yang dipakai barang ini (nomor dari daftar PI jadwal) & nomor
       urut barang ini di dokumen PI itu -- buku Import. */
    piNomor: "",
    piNoItem: "",
    // Fasilitas per barang — SKB & COO (tersimpan "E-COO") 1 daftar yang sama (skb)
    skb: [],
    // _facOpen: state UI murni (panel fasilitas terbuka/tertutup di tabel draft)
    _facOpen: false,
  };
}

// Dimensi P x L x T (cm) dari field Kemasan per barang mode Export (mis
function parsePackageDims(raw) {
  const parts = String(raw || "")
    .split(/[x*]/i)
    .map((bagian) => parseFloat(String(bagian).trim().replace(",", ".")))
    .filter((n) => !isNaN(n));
  if (parts.length < 3) return null;
  return { p: parts[0], l: parts[1], t: parts[2] };
}

/* Meter kubik 1 barang mode Export: (P x L x T dalam cm) / 1.000.000
   dikali JUMLAH KOLI.

   Yang dikali harus jumlah kolinya, bukan jumlah pieces. Dimensi yang
   tertulis adalah ukuran satu peti; mengalikannya dengan isi peti
   memberi angka yang tidak masuk akal — 60.000 pcs dalam 1 box terbaca
   927 m³, padahal sebenarnya 0,015 m³.

   Jumlah koli diambil dari `packing` ("1 BOX", "2 PALLET") kalau ada.
   Kalau kosong, dipakai `qty` seperti semula: pada pengisian manual
   Export, qty memang berarti jumlah peti. Jadi data lama tidak berubah
   perilakunya sama sekali. */
function computeItemCbm(it) {
  const dims = parsePackageDims(it.package);
  if (!dims) return 0;
  const koli = parseLooseNumber(String(it.packing || "").match(/[\d.,]+/) || 0);
  const jumlah = koli > 0 ? koli : Number(it.qty) || 0;
  const cbm = ((dims.p * dims.l * dims.t) / 1000000) * jumlah;
  return Math.round(cbm * 1000) / 1000;
}

// Satu entri SKB dalam daftar per-barang
function newSkbEntry() {
  return { jenis: "PPH", jenisLainnya: "", nomor: "", tanggal: "" };
}

/* DOKUMEN PELENGKAP PABEAN -- KODE DOKUMEN CEISA.

   Nama tiap kode [Indonesia, English]: daftar kode dokumen pelengkap
   pabean PMK (69 kode), ditambah kode yang terlihat langsung di berkas
   CEISA pengguna -- 456 SKB PPN ("KET-.../SKBPPN-CT/..."), 457 SKB PPh
   (".../PPUT-CT/..."), 530 Polis Asuransi, 703 House AWB, 714 House B/L
   & 860 e-COO. Kode di luar daftar tetap terbaca ("Dokumen kode 123"):
   nomor & tanggalnya tidak hilang. */
const KODE_DOKUMEN_CEISA = {
  217: ["Packing List", "Packing List"],
  343: ["Shipping Order", "Shipping Order"],
  380: ["Invoice", "Invoice"],
  383: ["SSTB", "SSTB"],
  410: ["Surat Sanggup Bayar (SSB)", "Payment Undertaking (SSB)"],
  430: ["Bank Garansi", "Bank Guarantee"],
  440: ["Surat Tanda Bukti Setor (STBS)", "Proof of Deposit (STBS)"],
  454: ["SSPCP", "SSPCP"],
  456: ["SKB PPN", "VAT Exemption Letter (SKB PPN)"],
  457: ["SKB PPh", "Income Tax Exemption Letter (SKB PPh)"],
  465: ["Letter of Credit (L/C)", "Letter of Credit (L/C)"],
  530: ["Polis Asuransi", "Insurance Policy"],
  666: ["Pengecualian dengan Surat Keputusan", "Exemption by Decree"],
  703: ["House AWB", "House AWB"],
  704: ["Master B/L", "Master B/L"],
  705: ["B/L", "B/L"],
  714: ["House B/L", "House B/L"],
  740: ["AWB", "AWB"],
  741: ["Master AWB", "Master AWB"],
  800: ["Sertifikat Alat/Perangkat Telekomunikasi", "Telecommunication Equipment Certificate"],
  803: ["SATS-LN Kementerian Kehutanan", "SATS-LN (Ministry of Forestry)"],
  805: ["Registrasi B3 Kementerian Lingkungan Hidup", "Hazardous Substance (B3) Registration"],
  808: ["Izin Impor Kepolisian", "Police Import Permit"],
  810: ["SM / SPM", "SM / SPM"],
  811: ["SIE", "SIE"],
  813: ["Dokumen Cukai (CK)", "Excise Document (CK)"],
  814: ["SK Izin Ekspor Berkala", "Periodic Export Permit"],
  815: ["SK Izin Tata Niaga Ekspor", "Export Trade Permit"],
  816: ["Dokumen Ekspor (PEB)", "Export Declaration (PEB)"],
  834: ["SNI Gula Kristal Mentah Kementan", "Raw Sugar SNI (Ministry of Agriculture)"],
  835: ["Izin / Pendaftaran Pestisida Kementan", "Pesticide Permit / Registration"],
  836: ["Izin Impor Kementan", "Import Permit (Ministry of Agriculture)"],
  842: ["SNI Kementerian ESDM", "SNI (Ministry of Energy)"],
  843: ["Nomor Pelumas Terdaftar (NPT)", "Registered Lubricant Number (NPT)"],
  844: ["Izin Usaha Niaga ESDM", "Trading License (Ministry of Energy)"],
  845: ["Rekomendasi Impor Pelumas", "Lubricant Import Recommendation"],
  851: ["Izin Karantina Tumbuhan", "Plant Quarantine Permit"],
  853: ["Izin Karantina Hewan / Ikan", "Animal / Fish Quarantine Permit"],
  854: ["Persetujuan Muat BPOM", "Loading Approval (BPOM)"],
  856: ["Laporan Pemeriksaan Surveyor (LPS-E)", "Surveyor Inspection Report (LPS-E)"],
  857: ["Fumigation Certificate", "Fumigation Certificate"],
  858: ["CITES Certificate", "CITES Certificate"],
  860: ["e-COO", "e-COO"],
  861: ["Certificate of Origin (COO / SKA)", "Certificate of Origin (COO / SKA)"],
  871: ["Nomor Pendaftaran Alat Kesehatan", "Medical Device Registration Number"],
  872: ["Laporan Surveyor Kemenkes", "Surveyor Report (Ministry of Health)"],
  873: ["Importir Produsen Narkotika/Prekursor/Psikotropika", "Producer Importer (Narcotics/Precursors/Psychotropics)"],
  874: ["Importir Terdaftar Narkotika/Prekursor/Psikotropika", "Registered Importer (Narcotics/Precursors/Psychotropics)"],
  875: ["SPI Narkotika/Prekursor/Psikotropika", "Import Approval (Narcotics/Precursors/Psychotropics)"],
  888: ["Pengecualian Perizinan", "Licensing Exemption"],
  902: ["Izin BAPETEN", "BAPETEN Permit"],
  911: ["Surat Keputusan", "Decree"],
  912: ["SK Fasilitas BKPM (Masterlist)", "BKPM Facility Decree (Masterlist)"],
  913: ["SK Fasilitas Pertambangan", "Mining Facility Decree"],
  917: ["BPBC", "BPBC"],
  918: ["Surat Keterangan Label Bahasa Indonesia", "Indonesian Label Certificate"],
  942: ["Izin Impor Karantina Tumbuhan", "Plant Quarantine Import Permit"],
  943: ["KH-5 Izin Impor Karantina Hewan", "KH-5 Animal Quarantine Import Permit"],
  944: ["KH-7 Izin Impor Karantina Hewan", "KH-7 Animal Quarantine Import Permit"],
  945: ["KH-12 Izin Impor Karantina Hewan", "KH-12 Animal Quarantine Import Permit"],
  946: ["KID-3 Izin Impor Karantina Ikan", "KID-3 Fish Quarantine Import Permit"],
  947: ["KID-15 Izin Impor Karantina Ikan", "KID-15 Fish Quarantine Import Permit"],
  948: ["NPIK", "NPIK"],
  949: ["Pengakuan Importir Produsen", "Producer Importer Recognition"],
  956: ["Pengakuan Importir Terdaftar", "Registered Importer Recognition"],
  957: ["SNI / SPB Kemendag", "SNI / SPB (Ministry of Trade)"],
  958: ["Laporan Surveyor (LS)", "Surveyor Report (LS)"],
  959: ["Persetujuan Impor (PI)", "Import Approval (PI)"],
  993: ["Surat Izin Menteri Pertanian", "Minister of Agriculture Permit"],
  994: ["Bukti Penerimaan Jaminan (BPJ)", "Guarantee Receipt (BPJ)"],
  995: ["STBS / SSP Ekspor", "Proof of Deposit / Export Tax Payment"],
  996: ["Surat Sanggup Bayar (SSB)", "Payment Undertaking (SSB)"],
  997: ["Customs Bond / STTJ", "Customs Bond / Guarantee Receipt (STTJ)"],
  998: ["SK Fasilitas KITE", "KITE Facility Decree"],
  999: ["Lainnya", "Other"],
};

const kodeDokumen = (v) => String(v == null ? "" : v).trim();

// Nama dokumen dari kodenya, bahasa aktif; kode di luar daftar: "Dokumen kode 123"
function namaDokumenCeisa(kode) {
  const k = kodeDokumen(kode);
  const nama = KODE_DOKUMEN_CEISA[k];
  if (nama) return tt(nama[0], nama[1]);
  return k ? tt(`Dokumen kode ${k}`, `Document code ${k}`) : "";
}

// Fasilitas per barang (item.skb) menurut kodenya -- SKB, Masterlist, COO
const KODE_DOKUMEN_FASILITAS = {
  456: "PPN",
  457: "PPH",
  912: "Masterlist",
  860: "E-COO",
  861: "E-COO",
};

/* DOKUMEN PENGIRIMAN -- PI, LS & Polis Asuransi: bisa lebih dari satu
   per jadwal, masing-masing bernomor & bertanggal (dokPelengkap.pi / .ls
   / .polis). Nomor PI juga dipilih per barang (item.piNomor). */
const DOK_PENGIRIMAN = {
  pi: { kode: "959", get label() { return tt("PI (Persetujuan Impor)", "PI (Import Approval)"); }, get singkat() { return "PI"; } },
  ls: { kode: "958", get label() { return tt("LS (Laporan Surveyor)", "LS (Surveyor Report)"); }, get singkat() { return "LS"; } },
  polis: { kode: "530", get label() { return tt("Polis Asuransi", "Insurance Policy"); }, get singkat() { return tt("Polis", "Policy"); } },
};
const JENIS_DOK_PENGIRIMAN = Object.keys(DOK_PENGIRIMAN);
/* Kolom lama per jenis (satu nomor gabungan + satu tanggal) -- tetap
   ditulis sebagai ringkasan untuk templat salin, Bulk Excel & versi
   aplikasi yang belum mengenal daftarnya. */
const KOLOM_DOK_PENGIRIMAN = {
  pi: ["pi", "piDate"],
  ls: ["ls", "lsDate"],
  polis: ["polisAsuransi", "polisAsuransiDate"],
};
/* Invoice & B/L-AWB punya isiannya sendiri: tidak ikut "dokumen lain".
   Kode umum (911 Surat Keputusan, 999 Lainnya): jenis fasilitas / PI
   dokumennya masih ditebak dari nomornya. */
const KODE_DOKUMEN_BERISIAN = new Set(["380", "703", "704", "705", "714", "740", "741"]);
const KODE_DOKUMEN_UMUM = new Set(["911", "999"]);

/* Cadangan untuk kode umum / tak dikenal: jenis fasilitas dari NOMOR
   dokumennya. Masterlist OSS bernomor ".../PABEAN-PB/OSS/...", SKB PPh
   impor ".../PPUT-CT/...". */
function jenisFasilitasDariNomor(nomor) {
  const n = String(nomor || "").toUpperCase();
  if (/MASTER\s*LIST|PABEAN-PB/.test(n)) return "Masterlist";
  if (/\bPPN\b|SKB[\s._/-]*PPN/.test(n)) return "PPN";
  if (/PPUT|\bPPH\b|SKB[\s._/-]*PPH/.test(n)) return "PPH";
  return "";
}
const POLA_NOMOR_PI = /(^|[^A-Z0-9])PI-\d/i;

/* PERAN SATU DOKUMEN PELENGKAP di jadwal:
     { pengiriman: "pi" | "ls" | "polis" } -> daftar dokumen pengiriman
     { jenis, jenisLainnya }               -> fasilitas per barang
     null                                  -> lainnya (invoice, B/L, packing list, ...)
   Kode yang dikenal menentukan; `label` (hanya PIB/PEB PDF, mis. "SURAT
   KETERANGAN BEBAS (SKB) PPN") dipakai untuk kode umum / tak dikenal,
   juga nomornya kalau `opsi.tebakNomor` (dokumen yang ditautkan ke
   barang di draft CEISA). */
function kenaliDokumenPelengkap(dok, opsi) {
  const kode = kodeDokumen(dok.kode);
  const label = String(dok.label || "").toUpperCase();
  const pengiriman = JENIS_DOK_PENGIRIMAN.find((j) => DOK_PENGIRIMAN[j].kode === kode);
  if (pengiriman) return { pengiriman };
  if (/SURAT KETERANGAN BEBAS/.test(label)) {
    const tipe = (/\(SKB\)\s*([A-Z%0-9]*)/.exec(label) || [])[1] || "";
    const jenis =
      SKB_TYPE_OPTIONS.find((o) => o !== "Lainnya" && o.toUpperCase() === tipe) ||
      KODE_DOKUMEN_FASILITAS[kode];
    return jenis ? { jenis, jenisLainnya: "" } : { jenis: "Lainnya", jenisLainnya: tipe || "SKB" };
  }
  if (KODE_DOKUMEN_FASILITAS[kode]) return { jenis: KODE_DOKUMEN_FASILITAS[kode], jenisLainnya: "" };
  if (KODE_DOKUMEN_CEISA[kode] && !KODE_DOKUMEN_UMUM.has(kode)) return null;
  if (/POLIS\s*ASURANSI|INSURANCE\s*POLICY/.test(label)) return { pengiriman: "polis" };
  if (/PERSETUJUAN IMPOR/.test(label)) return { pengiriman: "pi" };
  if (/LAPORAN SURVEYOR/.test(label)) return { pengiriman: "ls" };
  const jenis =
    (/MASTER\s*LIST|FASILITAS BKPM/.test(label) ? "Masterlist" : "") ||
    (/CERTIFICATE OF ORIGIN|\bE-?CO\b|KETERANGAN ASAL/.test(label) ? "E-COO" : "") ||
    (opsi && opsi.tebakNomor ? jenisFasilitasDariNomor(dok.nomor) : "");
  if (jenis) return { jenis, jenisLainnya: "" };
  return opsi && opsi.tebakNomor && POLA_NOMOR_PI.test(dok.nomor || "") ? { pengiriman: "pi" } : null;
}

/* DAFTAR DOKUMEN PELENGKAP SATU JADWAL -- s.dokPelengkap:
     { pi: [{ nomor, tanggal, berkas? }], ls: [...], polis: [...],
       lain: [{ kode, nomor, tanggal }] }   (dokumen lain ber-kode CEISA)
   `berkas` = lampiran dokumennya (PI & LS, js/data/lampiran.js).
   Entri tanpa nomor, tanggal & lampiran dibuang; nomor yang sama (jenis
   yang sama) tidak diulang -- yang bertanggal melengkapi yang belum,
   lampirannya digabung. */
function dokPelengkapKosong() {
  return { pi: [], ls: [], polis: [], lain: [] };
}

function tambahDokumenPengiriman(daftar, nomor, tanggal, kode, berkas) {
  const entri = { nomor: String(nomor == null ? "" : nomor).trim(), tanggal: String(tanggal || "").slice(0, 10) };
  if (kode !== undefined) entri.kode = kodeDokumen(kode);
  const lampiran = typeof rapikanBerkas === "function" ? rapikanBerkas(berkas) : [];
  if (!entri.nomor && !entri.tanggal && !lampiran.length) return;
  const sama = entri.nomor && daftar.find((d) => d.nomor === entri.nomor && (kode === undefined || d.kode === entri.kode));
  if (!sama) {
    if (lampiran.length) entri.berkas = lampiran;
    daftar.push(entri);
    return;
  }
  if (!sama.tanggal) sama.tanggal = entri.tanggal;
  if (lampiran.length) sama.berkas = rapikanBerkas((sama.berkas || []).concat(lampiran));
}

function rapikanDokPelengkap(x) {
  const out = dokPelengkapKosong();
  if (!x || typeof x !== "object") return out;
  JENIS_DOK_PENGIRIMAN.forEach((j) => (Array.isArray(x[j]) ? x[j] : []).forEach((d) => d && tambahDokumenPengiriman(out[j], d.nomor, d.tanggal, undefined, d.berkas)));
  (Array.isArray(x.lain) ? x.lain : []).forEach((d) => d && tambahDokumenPengiriman(out.lain, d.nomor, d.tanggal, d.kode, d.berkas));
  return out;
}

function adaDokPelengkap(d) {
  return !!d && JENIS_DOK_PENGIRIMAN.concat("lain").some((j) => (d[j] || []).length);
}

/* Nomor gabungan "A, B" (juga "A / B", "A & B") kembali jadi daftar --
   isian lama & kolom PI templat salin. Tanggal yang hanya satu milik
   nomor pertama. */
function pecahNomorDokumen(nomor, tanggal) {
  const daftar = [];
  String(nomor == null ? "" : nomor)
    .split(/[,;\n]+|\s+\/\s+|\s+&\s+|\s+DAN\s+/i)
    .forEach((n, i) => tambahDokumenPengiriman(daftar, n, i === 0 ? tanggal : ""));
  return daftar;
}

/* Ringkasan satu daftar untuk kolom lama: nomor digabung "A, B", tanggal
   dokumen pertama yang bertanggal. */
function ringkasDokumen(daftar) {
  const ada = (daftar || []).filter((d) => d.nomor || d.tanggal);
  const bertanggal = ada.find((d) => d.tanggal);
  return { nomor: ada.map((d) => d.nomor).filter(Boolean).join(", "), tanggal: bertanggal ? bertanggal.tanggal : "" };
}

// Isian lama (s.pi / s.piDate, ...) dari daftarnya
function ringkasDokPelengkap(d) {
  const out = {};
  JENIS_DOK_PENGIRIMAN.forEach((j) => {
    const r = ringkasDokumen(d && d[j]);
    const [kolomNomor, kolomTanggal] = KOLOM_DOK_PENGIRIMAN[j];
    out[kolomNomor] = r.nomor;
    out[kolomTanggal] = r.tanggal;
  });
  return out;
}

/* Daftar dokumen pelengkap sebuah jadwal: s.dokPelengkap kalau ada
   (sudah rapi sejak dimuat, rowToShipment -- HANYA DIBACA, salin dengan
   rapikanDokPelengkap sebelum diubah), kalau tidak dari isian lama
   (s.pi / s.piDate, ...): jadwal dari Bulk Excel atau data uji. */
function dokPelengkapJadwal(s) {
  if (s && s.dokPelengkap && typeof s.dokPelengkap === "object") return s.dokPelengkap;
  const out = dokPelengkapKosong();
  JENIS_DOK_PENGIRIMAN.forEach((j) => {
    const [kolomNomor, kolomTanggal] = KOLOM_DOK_PENGIRIMAN[j];
    out[j] = pecahNomorDokumen(s && s[kolomNomor], s && s[kolomTanggal]);
  });
  return out;
}

/* KOLOM PI templat salin & Bulk Excel memuat PI DAN LS -- dua dokumen
   yang biasanya sepaket. PI ditulis apa adanya (sama seperti sebelum LS
   ada), LS di baris sendiri berawalan "LS ", supaya Bulk Import bisa
   memisahkannya lagi (pecahPiLs). */
function gabungPiLs(pi, ls) {
  const p = String(pi == null ? "" : pi).trim();
  const l = String(ls == null ? "" : ls).trim();
  return [p, l ? "LS " + l : ""].filter(Boolean).join("\n");
}
function pecahPiLs(teks) {
  const pi = [];
  const ls = [];
  String(teks == null ? "" : teks)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((baris) => {
      const m = /^LS(?:\s*:\s*|\s+)(.+)$/i.exec(baris);
      if (m) ls.push(m[1].trim());
      else pi.push(baris);
    });
  return { pi: pi.join(", "), ls: ls.join(", ") };
}

/* Satu baris kolom FASILITAS / SKB (templat salin & Bulk Excel) kembali
   jadi entri: "MASTER LIST 72/PABEAN-PB/OSS/PMA/2025" -> Masterlist +
   nomornya, "COO" -> E-COO. Label dicocokkan tanpa beda huruf; data
   lama berisi label saja ("COO, MASTER LIST") tetap terbaca. Teks yang
   labelnya tidak dikenal utuh menjadi "Lainnya". */
const LABEL_FASILITAS_TEKS = [
  [/^MASTER\s*LIST\b/i, "Masterlist"],
  [/^E-?COO\b/i, "E-COO"],
  [/^COO\b/i, "E-COO"],
  [/^(SKB\s*)?PPN\b/i, "PPN"],
  [/^(SKB\s*)?PPH\b/i, "PPH"],
  [/^(SKB\s*)?BM\b/i, "BM"],
];
function skbTextToEntries(raw) {
  return String(raw || "")
    .split(/[,\n]/)
    .map((bagian) => bagian.trim())
    .filter(Boolean)
    .map((teks) => {
      for (const [pola, jenis] of LABEL_FASILITAS_TEKS) {
        const m = pola.exec(teks);
        if (!m) continue;
        const nomor = teks
          .slice(m[0].length)
          .replace(/^[\s:.-]*(NO\.|NO(?=\s)|NOMOR\b)?[\s:.]*/i, "")
          .trim();
        return { jenis, jenisLainnya: "", nomor, tanggal: "" };
      }
      return { jenis: "Lainnya", jenisLainnya: teks, nomor: "", tanggal: "" };
    });
}

// Bersihkan 1 entri SKB (dipakai baik untuk draft di form maupun hasil baca dari Supabase)
function sanitizeSkbEntry(sk) {
  const jenis = SKB_TYPE_OPTIONS.includes(sk && sk.jenis)
    ? sk.jenis
    : "Lainnya";
  return {
    jenis,
    jenisLainnya: (sk && sk.jenisLainnya) || "",
    nomor: (sk && sk.nomor) || "",
    tanggal: (sk && sk.tanggal) || "",
  };
}

function sanitizeSkbList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeSkbEntry);
}

// Semua jadwal yang sudah dimuat, kedua buku (Import lalu Export)
function semuaKiriman() {
  return typeof data !== "undefined" && data ? [].concat(data.import || [], data.export || []) : [];
}

function newStop() {
  return {
    id: uid("st"),
    terminal: "",
    transport: "laut",
    vessel: "",
    voyage: "",
    arrivalDate: "",
    departureDate: "",
  };
}
