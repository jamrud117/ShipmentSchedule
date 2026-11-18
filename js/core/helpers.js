"use strict";

/* HELPERS */

/* KUNCI PEMBANDING TEKS: huruf besar, hanya A-Z & 0-9. "PT. Dsv" =
   "pt dsv" = "PTDSV"; "205-3461 1695" = "20534611695". Dipakai semua
   pencocokan nama pihak, nomor aju, BL/AWB & kode -- SATU aturan,
   bukan salinan di tiap berkas. */
const kunciAlnum = (v) => String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");

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
  const k = kunciAlnum(aju);
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
/* ANGKA -- di layar dan di cetakan: koma ribuan, titik desimal, sama
   dengan kotak angka yang diketik ("Rp 1,544,000", "1,234.5 Kg"). */
function fmtRp(n) {
  return "Rp " + angkaLokal(Math.round(Number(n) || 0), "en-US");
}
/* Rupiah PRESISI: desimal ditampilkan hanya kalau memang ada, paling
   banyak 2 angka -- Rp 35,032,591.22, tapi Rp 84,639,460 (bukan
   84,639,460.00). Untuk Nilai Pabean, yang di PIB pun bersen. */
function fmtRpPresisi(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const bulat = Number.isInteger(v);
  return "Rp " + angkaLokal(v, "en-US", { minimumFractionDigits: bulat ? 0 : 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  return angkaLokal(Number(n) || 0, "en-US");
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

/* "1 EA + 60,000 SET". Satuan kosong ditulis tanpa keterangan supaya
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

/* KEMIRIPAN NAMA BARANG -- pasangan dua daftar barang yang namanya
   ditulis sedikit berbeda ("TIRE MOLD : HA52_ 195/65R15 95V (TOE RING)"
   di draft CEISA vs "TIRE MOLD HA52 195/65 R15" di CIPL).

   Nama dipecah jadi kata huruf & kata angka ("195/65R15" -> 195, 65,
   R, 15), jadi "65R15" dan "65 R15" sama saja. Tiap kata ditimbang
   menurut KELANGKAANNYA di kedua daftar: kata yang ada di SEMUA barang
   ("TIRE", "MOLD", "R") tidak membedakan apa pun (bobot 0); ukuran yang
   hanya dimiliki satu barang paling menentukan. Skor = bobot kata
   bersama / bobot nama yang lebih ringkas -- nama yang lebih lengkap
   (indeks beban "95V", "(TOE RING)") tidak mengurangi kecocokannya.
   Pasangan dipilih dari skor tertinggi lebih dulu (lalu kata bersama
   terbanyak, lalu urutan terdekat), tiap barang sekali; skor di bawah
   `minimal` (bawaan 0,6) tidak dipasangkan -- lebih baik tanpa pasangan
   daripada menebak. `a`, `b`: daftar teks nama. Hasil: indeks pasangan
   di `b` untuk tiap barang `a` (-1 = tanpa pasangan). `bolehA` /
   `bolehB` (opsional): indeks yang boleh dipasangkan. */
function kataNamaBarang(teks) {
  const dasar = String(teks == null ? "" : teks)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .trim();
  return new Set(dasar ? dasar.split(" ") : []);
}
function pasangkanNamaMirip(a, b, opsi) {
  const o = opsi || {};
  const minimal = o.minimal == null ? 0.6 : o.minimal;
  const kataA = a.map(kataNamaBarang);
  const kataB = b.map(kataNamaBarang);
  const hasil = a.map(() => -1);
  const bolehA = (i) => !o.bolehA || o.bolehA(i);
  const bolehB = (j) => !o.bolehB || o.bolehB(j);
  // Bobot kata: 1 / jumlah barang (kedua daftar) yang memuatnya; yang dimuat semua barang = 0
  const semua = kataA.concat(kataB).filter((k) => k.size);
  const df = new Map();
  semua.forEach((k) => k.forEach((x) => df.set(x, (df.get(x) || 0) + 1)));
  const bobot = (x) => (df.get(x) >= semua.length ? 0 : 1 / (df.get(x) || 1));
  const berat = (k) => [...k].reduce((n, x) => n + bobot(x), 0);
  const calon = [];
  kataA.forEach((ka, i) => {
    if (!bolehA(i) || !ka.size) return;
    const wa = berat(ka);
    kataB.forEach((kb, j) => {
      if (!bolehB(j) || !kb.size) return;
      let sama = 0;
      ka.forEach((x) => {
        if (kb.has(x)) sama += bobot(x);
      });
      const ringkas = Math.min(wa, berat(kb));
      if (!(sama > 0) || !(ringkas > 0)) return;
      const skor = sama / ringkas;
      if (skor >= minimal) calon.push({ i, j, skor, sama });
    });
  });
  calon.sort((x, y) => y.skor - x.skor || y.sama - x.sama || Math.abs(x.i - x.j) - Math.abs(y.i - y.j) || x.i - y.i);
  const dipakai = new Set();
  calon.forEach(({ i, j }) => {
    if (hasil[i] >= 0 || dipakai.has(j)) return;
    hasil[i] = j;
    dipakai.add(j);
  });
  return hasil;
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
/* KODE JENIS KONTAINER: F / L, dan kode angka CEISA 8 = FCL (draft PIB
   sungguhan berkode 8 tercetak "40 FCL" di PDF PIB-nya). Kode lain tidak
   ditebak. */
function muatanDariKode(v) {
  const s = String(v == null ? "" : v).trim().toUpperCase();
  if (s === "F" || s === "FCL" || s === "8") return "FCL";
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
    /* Invoice barang ini (nomor dari daftar invoice jadwal) -- hanya
       berarti kalau jadwalnya memakai lebih dari satu invoice
       (kunciInvoiceBarang). */
    invoiceNomor: "",
    /* Fasilitas per barang — SKB & COO (tersimpan "E-COO") 1 daftar yang
       sama (skb). Buku Import: barang baru langsung membawa SKB PPh
       bawaan (nomor & tanggal yang diatur di tab Daftar Barang,
       features/skb-bawaan.js); belum diatur / kedaluwarsa / Export -> []. */
    skb: typeof skbBawaanBarang === "function" ? skbBawaanBarang(modeKini) : [],
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
/* Invoice, Packing List & B/L-AWB punya isiannya sendiri (tab Dokumen &
   Umum): tidak ikut "dokumen lain". Kode umum (911 Surat Keputusan, 999
   Lainnya): jenis fasilitas / PI dokumennya masih ditebak dari nomornya. */
const KODE_DOKUMEN_BERISIAN = new Set(["217", "380", "703", "704", "705", "714", "740", "741"]);
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

/* KOLOM PI templat salin All Import (laporan harian) & Bulk Excel memuat
   SEMUA dokumen pelengkap NON-FASILITAS satu jadwal, SATU DOKUMEN PER
   BARIS LEMBAR -- seperti kolom FASILITAS / SKB: dokumen ke-n di baris
   barang ke-n, sisanya di baris tambahan di bawahnya. Bukan satu sel
   bergaris baru: sel seperti itu menempel sebagai satu sel tinggi di
   Excel, dan dulu diulang di setiap baris barang. Isi barisnya:
     PI            nomornya, satu PI per baris
     LS            "LS <nomor>"
     Polis         "POLIS <nomor>"
     Dokumen Lain  "<NAMA DOKUMEN CEISA> <nomor>" -- L/C, sertifikat,
                   izin, surat keputusan ... (huruf besar, nama baku
                   KODE_DOKUMEN_CEISA; kode di luar daftar "DOKUMEN KODE
                   <kode> <nomor>", tanpa kode "DOKUMEN LAIN <nomor>")
   Fasilitas -- SKB PPN/PPh, Masterlist, COO -- tetap di kolom FASILITAS /
   SKB (shipmentFacilitiesSummary): Dokumen Lain berkode fasilitas
   (KODE_DOKUMEN_FASILITAS), atau berkode umum (911 / 999) yang nomornya
   menunjukkan fasilitas (jenisFasilitasDariNomor), tidak ditulis di sini.
   Invoice, packing list & B/L-AWB punya kolomnya sendiri dan memang
   tidak pernah masuk Dokumen Lain (KODE_DOKUMEN_BERISIAN, dilewati juga
   di sini). Bulk Import membaca kolomnya di semua baris jadwal lalu
   memisahkannya lagi lewat pecahKolomPi(). */
const KOLOM_PI_POLIS = "POLIS";
// Kode yang namanya bisa tertulis di kolom PI sebagai Dokumen Lain
const kodeDokLainKolomPi = (kode) =>
  !KODE_DOKUMEN_FASILITAS[kode] && !KODE_DOKUMEN_BERISIAN.has(kode) && !JENIS_DOK_PENGIRIMAN.some((j) => DOK_PENGIRIMAN[j].kode === kode);
function dokLainKolomPi(d) {
  const kode = kodeDokumen(d && d.kode);
  const nomor = String((d && d.nomor) || "").replace(/\s+/g, " ").trim();
  if (!kode && !nomor) return "";
  if (KODE_DOKUMEN_FASILITAS[kode] || KODE_DOKUMEN_BERISIAN.has(kode)) return "";
  if ((KODE_DOKUMEN_UMUM.has(kode) || !kode) && jenisFasilitasDariNomor(nomor)) return "";
  const nama = KODE_DOKUMEN_CEISA[kode] ? KODE_DOKUMEN_CEISA[kode][0].toUpperCase() : kode ? `DOKUMEN KODE ${kode}` : "DOKUMEN LAIN";
  return [nama, nomor].filter(Boolean).join(" ");
}
function barisKolomPi(s) {
  const dok = dokPelengkapJadwal(s);
  // Nomor per dokumen; daftar kosong -> isian lamanya ("A, B" dipecah)
  const nomor = (jenis, kolomLama) => {
    const daftar = (dok[jenis] || []).map((d) => String(d.nomor || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return daftar.length ? daftar : pecahNomorDokumen(s && s[kolomLama]).map((d) => d.nomor);
  };
  const baris = [
    ...nomor("pi", "pi"),
    ...nomor("ls", "ls").map((n) => "LS " + n),
    ...nomor("polis", "polisAsuransi").map((n) => `${KOLOM_PI_POLIS} ${n}`),
    ...(dok.lain || []).map(dokLainKolomPi),
  ];
  const sudah = new Set();
  return baris.filter((b) => b && !sudah.has(b) && sudah.add(b));
}

/* Kebalikan barisKolomPi: teks kolom PI (baris-barisnya digabung baris
   baru) -> { pi, ls, polis, lain }.
   pi/ls/polis = nomor gabungan "A, B" (dipecah pecahNomorDokumen); lain =
   [{ kode, nomor }]. Baris berawalan "LS" / "POLIS" / nama dokumen CEISA
   (yang TERPANJANG yang cocok, tanpa beda huruf besar-kecil, kedua
   bahasa) / "DOKUMEN KODE <kode>" / "DOKUMEN LAIN" dikenali; sisanya
   nomor PI -- berkas lama yang kolom PI-nya hanya berisi PI tetap
   terbaca sama. */
let KOLOM_PI_NAMA_DOKUMEN = null; // [[NAMA, kode]] terpanjang dulu, disusun sekali
function pecahKolomPi(teks) {
  const pi = [], ls = [], polis = [], lain = [];
  if (!KOLOM_PI_NAMA_DOKUMEN) {
    /* Hanya nama yang memang bisa ditulis barisKolomPi: fasilitas,
       invoice / packing list / B/L-AWB, dan PI / LS / Polis (ditulis
       dengan awalannya sendiri) tetap terbaca sebagai teks PI, sama
       seperti sebelum Dokumen Lain ikut di kolom ini. */
    KOLOM_PI_NAMA_DOKUMEN = Object.keys(KODE_DOKUMEN_CEISA)
      .filter(kodeDokLainKolomPi)
      .flatMap((k) => KODE_DOKUMEN_CEISA[k].map((nama) => [String(nama).toUpperCase(), k]))
      .sort((a, b) => b[0].length - a[0].length);
  }
  String(teks == null ? "" : teks)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((baris) => {
      const mLs = /^LS(?:\s*:\s*|\s+)(.+)$/i.exec(baris);
      if (mLs) return void ls.push(mLs[1].trim());
      const mPolis = /^POLIS(?:\s+ASURANSI)?(?:\s*:\s*|\s+)(.+)$/i.exec(baris);
      if (mPolis) return void polis.push(mPolis[1].trim());
      const mKode = /^DOKUMEN\s+KODE\s+(\S+)(?:\s+(.+))?$/i.exec(baris);
      if (mKode) return void lain.push({ kode: mKode[1], nomor: (mKode[2] || "").trim() });
      const mLain = /^DOKUMEN\s+LAIN(?:\s+(.+))?$/i.exec(baris);
      if (mLain) return void lain.push({ kode: "", nomor: (mLain[1] || "").trim() });
      const atas = baris.toUpperCase();
      const cocok = KOLOM_PI_NAMA_DOKUMEN.find(([nama]) => atas === nama || atas.startsWith(nama + " "));
      if (cocok) return void lain.push({ kode: cocok[1], nomor: baris.slice(cocok[0].length).trim() });
      pi.push(baris);
    });
  return { pi: pi.join(", "), ls: ls.join(", "), polis: polis.join(", "), lain };
}

/* ------------------------------------------------------------------
   INVOICE & PACKING LIST -- SATU PIB / PEB BISA MEMAKAI BEBERAPA.

   s.dokInvoice = [{ nomor, tanggal, pl, plTanggal }]: tiap invoice
   beserta Packing List-nya, urutan = urutan invoice di dokumennya
   (barang invoice pertama = Seri Barang awal). Sepasang, bukan dua
   daftar lepas: Packing List satu kiriman bernomor & bertanggal sama
   dengan invoicenya (kebiasaan CIPL), dan Cek PIB/PEB memasangkan
   dokumen 217 dengan 380-nya.

   PENYIMPANAN. Jadwal satu invoice tetap seperti dulu, hanya di kolom
   lama: invoice / invoice_date, Packing List di data_pabean. Daftarnya
   baru ditulis ke kolom jsonb dokumen_invoice (migration-dokumen-
   invoice.sql) kalau invoicenya LEBIH DARI SATU -- kolom lama tetap
   diisi RINGKASANNYA (ringkasDokInvoice): nomor "A, B", tanggal invoice
   pertama, Packing List "PL-A, PL-B". Kartu, pencarian, Surat BC, Cek
   PIB/PEB versi lama & versi aplikasi yang belum mengenal daftarnya
   tetap membaca semua nomornya.

   Barang ditandai invoicenya di item.invoiceNomor (kolom barang
   invoice_nomor); kunciInvoiceBarang merapikannya.
------------------------------------------------------------------ */
const kunciInvoice = (v) => kunciAlnum(v);
const teksInvoice = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const tanggalInvoice = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");

function entriInvoiceRapi(d) {
  const x = d && typeof d === "object" ? d : {};
  return { nomor: teksInvoice(x.nomor), tanggal: tanggalInvoice(x.tanggal), pl: teksInvoice(x.pl), plTanggal: tanggalInvoice(x.plTanggal) };
}

/* Daftar yang dirapikan: entri tanpa isian dibuang; nomor invoice yang
   sama (tanpa beda tanda baca & huruf besar) tidak diulang -- isian yang
   kosong dilengkapi entri kembarannya. */
function rapikanDokInvoice(x) {
  const out = [];
  (Array.isArray(x) ? x : []).forEach((d) => {
    const e = entriInvoiceRapi(d);
    if (!e.nomor && !e.tanggal && !e.pl && !e.plTanggal) return;
    const k = kunciInvoice(e.nomor);
    const sama = k && out.find((o) => kunciInvoice(o.nomor) === k);
    if (!sama) return void out.push(e);
    ["tanggal", "pl", "plTanggal"].forEach((f) => {
      if (!sama[f]) sama[f] = e[f];
    });
  });
  return out;
}

/* Ringkasan untuk kolom lama: nomor "A, B"; tanggal milik invoice PERTAMA
   (bukan yang pertama bertanggal -- dokInvoiceDariKolomLama
   mengembalikannya ke invoice pertama); Packing List "PL-A, PL-B" (satu
   PL untuk dua invoice ditulis sekali) & tanggal PL pertama. */
function ringkasDokInvoice(daftar) {
  const ada = rapikanDokInvoice(daftar);
  const sekali = (nilai) => {
    const sudah = new Set();
    return nilai.filter((n) => n && !sudah.has(kunciInvoice(n)) && sudah.add(kunciInvoice(n))).join(", ");
  };
  return {
    invoice: sekali(ada.map((d) => d.nomor)),
    invoiceDate: ada.length ? ada[0].tanggal : "",
    pl: sekali(ada.map((d) => d.pl)),
    plTanggal: ada.length ? ada[0].plTanggal : "",
  };
}

/* Nomor gabungan kolom lama -> nomor-nomornya. Pemisahnya sama dengan
   pecahNomorDokumen & Cek PIB/PEB: koma, titik koma, baris baru, " / ",
   " & ", " DAN ". */
function pecahNomorInvoice(teks) {
  const out = [];
  String(teks == null ? "" : teks)
    .split(/[,;\n]+|\s+\/\s+|\s+&\s+|\s+DAN\s+/i)
    .map(teksInvoice)
    .forEach((n) => {
      if (n && !out.some((x) => kunciInvoice(x) === kunciInvoice(n))) out.push(n);
    });
  return out;
}

/* Daftar dari kolom lama (jadwal satu invoice, data sebelum daftarnya
   ada, Bulk Excel): nomor ke-n berpasangan dengan Packing List ke-n;
   tanggal yang hanya satu milik invoice pertama. */
function dokInvoiceDariKolomLama(invoice, invoiceDate, pl, plTanggal) {
  const nomor = pecahNomorInvoice(invoice);
  const daftarPl = pecahNomorInvoice(pl);
  const n = Math.max(nomor.length, daftarPl.length, invoiceDate || plTanggal ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nomor: nomor[i] || "", tanggal: i ? "" : invoiceDate, pl: daftarPl[i] || "", plTanggal: i ? "" : plTanggal });
  }
  return rapikanDokInvoice(out);
}

/* Daftar invoice jadwal yang dimuat (rowToShipment): kolom dokumen_invoice
   selama ringkasannya masih sama dengan kolom lama. Berbeda = kolom lama
   diubah dari luar -- versi aplikasi lama yang masih termuat di peramban
   pengguna lain, atau Bulk Excel -- dan kolom lama yang menang: nomornya
   dari sana; tanggal & Packing List nomor yang masih sama tetap dari
   daftarnya, kecuali yang memang ikut diubah di kolom lama. */
function susunDokInvoice(tersimpan, s) {
  const dp = (s && s.dataPabean) || {};
  const lama = {
    invoice: teksInvoice(s && s.invoice),
    invoiceDate: tanggalInvoice(s && s.invoiceDate),
    pl: teksInvoice(dp.packingListNomor),
    plTanggal: tanggalInvoice(dp.packingListTanggal),
  };
  const dariLama = dokInvoiceDariKolomLama(lama.invoice, lama.invoiceDate, lama.pl, lama.plTanggal);
  const daftar = rapikanDokInvoice(tersimpan);
  if (!daftar.length) return dariLama;
  const r = ringkasDokInvoice(daftar);
  if (["invoice", "invoiceDate", "pl", "plTanggal"].every((k) => r[k] === lama[k])) return daftar;
  const tglSama = r.invoiceDate === lama.invoiceDate;
  const plSama = r.pl === lama.pl;
  const plTglSama = r.plTanggal === lama.plTanggal;
  return dariLama.map((d, i) => {
    const x = d.nomor && daftar.find((o) => kunciInvoice(o.nomor) === kunciInvoice(d.nomor));
    if (!x) return d;
    return {
      nomor: d.nomor,
      tanggal: tglSama || i ? x.tanggal : d.tanggal,
      pl: plSama ? x.pl : d.pl || x.pl,
      plTanggal: plTglSama || i ? x.plTanggal : d.plTanggal,
    };
  });
}

// Daftar invoice sebuah jadwal: s.dokInvoice (disusun saat dimuat / dari form), atau dari kolom lama
function dokInvoiceJadwal(s) {
  if (s && Array.isArray(s.dokInvoice)) return rapikanDokInvoice(s.dokInvoice);
  return susunDokInvoice(null, s);
}

/* Dokumen 380 & 217 satu berkas (draft CEISA, PIB / PEB) -> pasangan:
   Packing List bernomor sama dengan invoicenya dulu, sisanya menurut
   urutan; Packing List yang tersisa jadi baris sendiri. */
function pasangkanInvoicePl(invoices, pls) {
  const isi = (d) => d && (teksInvoice(d.nomor) || tanggalInvoice(d.tanggal));
  const daftarPl = (pls || []).filter(isi);
  const out = (invoices || []).filter(isi).map((d) => ({ nomor: d.nomor, tanggal: d.tanggal, pl: "", plTanggal: "" }));
  const terpakai = new Set();
  const pasang = (o, j) => {
    terpakai.add(j);
    o.pl = daftarPl[j].nomor;
    o.plTanggal = daftarPl[j].tanggal;
  };
  out.forEach((o) => {
    const k = kunciInvoice(o.nomor);
    const j = k ? daftarPl.findIndex((p, x) => !terpakai.has(x) && kunciInvoice(p.nomor) === k) : -1;
    if (j >= 0) pasang(o, j);
  });
  out.forEach((o) => {
    if (o.pl) return;
    const j = daftarPl.findIndex((p, x) => !terpakai.has(x));
    if (j >= 0) pasang(o, j);
  });
  daftarPl.forEach((p, x) => {
    if (!terpakai.has(x)) out.push({ nomor: "", tanggal: "", pl: p.nomor, plTanggal: p.tanggal });
  });
  return rapikanDokInvoice(out);
}

/* INVOICE TIAP BARANG: kunci invoice per barang menurut daftar invoice
   (dokInvoiceJadwal / form). Barang satu invoice berurutan -- Seri Barang
   mengikuti urutan invoice -- jadi barang yang belum ditandai mengikuti
   tetangganya:
     - satu invoice (atau tanpa daftar): tidak ada yang ditandai ("");
     - tidak satu pun barang ditandai: semuanya "" (pembagiannya belum
       diketahui -- templat salin menulis nomornya satu per baris);
     - sekelompok barang tanpa tanda: invoice YANG BELUM PUNYA BARANG di
       antara kedua tetangganya menurut urutan daftar (barang invoice
       ke-2 yang datang dari draft CEISA sesudah barang invoice ke-1 dari
       CIPL); kalau tidak ada, invoice barang sebelumnya (barang tambahan
       di tengah kelompok) -- atau sesudahnya, untuk kelompok paling awal.
   Tanda yang bukan nomor di daftar dianggap belum ditandai. */
function kunciInvoiceBarang(items, daftar) {
  const kunci = [];
  (daftar || []).forEach((d) => {
    const k = kunciInvoice(d && d.nomor);
    if (k && !kunci.includes(k)) kunci.push(k);
  });
  const barang = items || [];
  if (kunci.length < 2) return barang.map(() => "");
  const tanda = barang.map((it) => {
    const k = kunciInvoice(it && it.invoiceNomor);
    return kunci.includes(k) ? k : "";
  });
  if (!tanda.some(Boolean)) return tanda;
  const punya = new Set(tanda.filter(Boolean));
  const hasil = tanda.slice();
  for (let i = 0; i < hasil.length; ) {
    if (hasil[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < tanda.length && !tanda[j]) j++;
    const sebelum = i > 0 ? hasil[i - 1] : "";
    const sesudah = j < tanda.length ? tanda[j] : "";
    const dari = sebelum ? kunci.indexOf(sebelum) + 1 : 0;
    const sampai = sesudah ? kunci.indexOf(sesudah) : kunci.length;
    const calon = kunci.slice(dari, Math.max(dari, sampai)).find((k) => !punya.has(k));
    if (calon) punya.add(calon);
    const isi = calon || sebelum || sesudah;
    for (let x = i; x < j; x++) hasil[x] = isi;
    i = j;
  }
  return hasil;
}

// Nomor invoice (seperti tertulis di daftar) untuk sebuah kunci
function nomorInvoiceDariKunci(daftar, k) {
  const d = k && (daftar || []).find((x) => kunciInvoice(x.nomor) === k);
  return d ? d.nomor : "";
}

/* Barang yang disimpan: tanda invoicenya dirapikan (kunciInvoiceBarang)
   dan ditulis sebagai nomor seperti di daftar. Jadwal satu invoice tidak
   menandai barangnya -- kolom invoice_nomor tetap kosong, jadi database
   yang belum dimigrasi pun tidak perlu menolaknya. */
function tandaiInvoiceBarang(items, daftar) {
  const tanda = kunciInvoiceBarang(items, daftar);
  return (items || []).map((it, i) => Object.assign({}, it, { invoiceNomor: nomorInvoiceDariKunci(daftar, tanda[i]) }));
}

/* KOLOM NO. INVOICE TEMPLAT SALIN & BULK EXCEL -- satu nomor per sel,
   tanpa baris baru di dalam sel:
     - satu invoice: nomornya di baris barang pertama (seperti dulu);
     - beberapa invoice: nomor tiap invoice HANYA di baris barang pertama
       kelompoknya (kunciInvoiceBarang), baris lain kosong. Invoice yang
       barangnya belum ditandai ditulis di baris kosong berikutnya, satu
       per baris -- baris tambahan kalau barangnya kurang.
   Hasil: teks per baris lembar (bisa lebih panjang dari daftar barang). */
function kolomInvoiceSalin(s, items) {
  const daftar = dokInvoiceJadwal(s).filter((d) => d.nomor);
  const barang = items || [];
  // Satu invoice: baris barang pertama saja (tanpa barang: tidak ada baris, seperti dulu)
  if (daftar.length < 2) return barang.length ? [daftar.length ? daftar[0].nomor : teksInvoice(s && s.invoice)] : [];
  const tanda = kunciInvoiceBarang(barang, daftar);
  const out = barang.map(() => "");
  const tertulis = new Set();
  tanda.forEach((k, i) => {
    if (!k || (i > 0 && tanda[i - 1] === k)) return;
    out[i] = nomorInvoiceDariKunci(daftar, k);
    tertulis.add(k);
  });
  let j = 0;
  daftar.forEach((d) => {
    const k = kunciInvoice(d.nomor);
    if (tertulis.has(k)) return;
    while (j < out.length && out[j]) j++;
    out[j] = d.nomor;
    tertulis.add(k);
  });
  return out;
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
