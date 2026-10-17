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

/* NAMA BARANG YANG DITAMPILKAN — dirakit dari beberapa kolom.

   URUTANNYA: Uraian → Pattern → Size → Mold No. Satu aturan untuk
   kartu, panel detail, copy template, DAN kedua bentuk CIPL (Kumho &
   Dynamic Design Korea) -- supaya nama yang terlihat di layar selalu
   sama dengan yang tersalin dan tercetak.

   PO No SENGAJA tidak ikut: itu nomor pesanan pembeli, bukan bagian
   dari identitas barangnya, dan menempelkannya membuat dua kiriman
   barang yang sama terbaca sebagai dua barang berbeda.

   Kolom yang kosong (atau "-") DILEWATI, spasi di dalam tiap kolom
   dirapikan jadi satu, dan bagian yang SUDAH tertulis di Uraian tidak
   diulang ("TIRE MOLD 225/50R17" + Size 225/50R17). Menyambung apa
   adanya menghasilkan "TYRE MOLD FULL SET   R17" -- terlihat seperti
   salah ketik dan menyulitkan pencocokan teks saat ditempel ke Excel.

   Import TIDAK terpengaruh: Pattern, Size & Mold No hanya diisi di
   buku Export (lihat body.mode-import .size-col di form.css). */
function rapiBagianNama(v) {
  const x = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  return x === "-" ? "" : x;
}

/* Bagian SESUDAH Uraian: Pattern, Size, Mold No -- berurutan, yang
   kosong dilewati, yang sudah tertulis (sebagai kata utuh) di Uraian
   atau di bagian sebelumnya tidak diulang. */
function rincianNamaBarang(it) {
  if (!it) return [];
  const sudah = [" " + rapiBagianNama(it.namaBarang).toUpperCase() + " "];
  return ["pattern", "size", "moldNo"]
    .map((k) => rapiBagianNama(it[k]))
    .filter((x) => {
      if (!x) return false;
      const kata = " " + x.toUpperCase() + " ";
      if (sudah.some((s) => s.includes(kata))) return false;
      sudah.push(kata);
      return true;
    });
}

function itemDisplayName(it) {
  if (!it) return "";
  return [rapiBagianNama(it.namaBarang)].concat(rincianNamaBarang(it)).filter(Boolean).join(" ");
}

function newItem() {
  /* Nilai bawaan BEDA per buku, jadi dibaca dari activeMode:
       Import : jenis BAHAN BAKU  (bahan yang didatangkan untuk diolah)
       Export : jenis BARANG JADI (hasil olahan yang dikirim keluar)
     Satuan (SET) & jenis kemasan (BOX) sama untuk kedua buku.
     Semuanya cuma NILAI AWAL — tetap bisa diganti per barang. */
  const modeKini = typeof activeMode === "string" ? activeMode : "import";
  return {
    id: uid("it"),
    namaBarang: "",
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
    /* Kolom tambahan untuk barang Export (cetakan/mold).

       Pattern & Mold No ikut membentuk nama yang ditampilkan; PO No
       tidak -- lihat itemDisplayName(). Kosong itu wajar: tidak semua
       pembeli memakai penomoran ini. */
    /* size belum pernah punya nilai awal -- tanpa ini, barang baru
       memulai dengan size undefined dan escapeAttr() menuliskannya
       sebagai teks "undefined" di kotaknya. */
    size: "",
    pattern: "",
    moldNo: "",
    poNo: "",
    /* Marks pada CIPL. Kosong = dibangkitkan otomatis dari urutan
       koli ("C# : 8-1"); diisi kalau penandaan di lapangan berbeda. */
    marks: "",
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

/* DOKUMEN PELENGKAP PABEAN (kode CEISA) yang berarti FASILITAS barang.

   Kodenya dari sheet DOKUMEN berkas Excel CEISA dan kolom kode di
   lembar Pemenuhan Persyaratan PIB. Daftar kode dokumen pelengkap BC
   2.0: 912 SK Fasilitas BKPM (masterlist), 861 Certificate of Origin,
   959 Surat Persetujuan Impor Kemendag, 958 Laporan Surveyor. 456 (SKB
   PPN, "KET-.../SKBPPN-CT/..."), 457 (SKB PPh, ".../PPUT-CT/..."), 912
   dan 959 terlihat langsung di berkas CEISA pengguna. Kode yang tidak
   dikenal masih bisa ditebak dari nomornya (jenisFasilitasDariNomor). */
const KODE_DOKUMEN_FASILITAS = {
  456: "PPN",
  457: "PPH",
  912: "Masterlist",
  860: "E-COO",
  861: "E-COO",
};
// Surat Persetujuan Impor (PI) -- satu nomor per pengiriman, bukan fasilitas
const KODE_DOKUMEN_PI = "959";

/* Cadangan untuk kode yang tidak dikenal: jenis fasilitas dari NOMOR
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

/* Kenali satu dokumen pelengkap: { jenis, jenisLainnya } kalau ia
   fasilitas, { pi: true } kalau Persetujuan Impor, null untuk yang
   lain (invoice, B/L, Laporan Surveyor, ...). `label` hanya ada pada
   PIB PDF ("SURAT KETERANGAN BEBAS (SKB) PPN"); Excel CEISA cuma
   memberi kode & nomor. */
function kenaliDokumenPelengkap(dok) {
  const kode = String(dok.kode == null ? "" : dok.kode).trim();
  const label = String(dok.label || "").toUpperCase();
  if (kode === KODE_DOKUMEN_PI || /PERSETUJUAN IMPOR/.test(label)) return { pi: true };
  if (/SURAT KETERANGAN BEBAS/.test(label)) {
    const tipe = (/\(SKB\)\s*([A-Z%0-9]*)/.exec(label) || [])[1] || "";
    const jenis =
      SKB_TYPE_OPTIONS.find((o) => o !== "Lainnya" && o.toUpperCase() === tipe) ||
      KODE_DOKUMEN_FASILITAS[kode];
    return jenis ? { jenis, jenisLainnya: "" } : { jenis: "Lainnya", jenisLainnya: tipe || "SKB" };
  }
  const jenis =
    KODE_DOKUMEN_FASILITAS[kode] ||
    (/MASTER\s*LIST|FASILITAS BKPM/.test(label) ? "Masterlist" : "") ||
    (/CERTIFICATE OF ORIGIN|\bE-?CO\b|KETERANGAN ASAL/.test(label) ? "E-COO" : "");
  return jenis ? { jenis, jenisLainnya: "" } : null;
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
