"use strict";

/* ------------------------------------------------------------------
   PEMBACA TANGGAL YANG DIKETIK

   Kotak tanggal di aplikasi ini kotak teks (js/ui/date-input.js), dan
   orang menulis tanggal dengan seribu cara: "5/11/26", "05-11-2026",
   "5.11.2026", "5 nov 2026", "November 5, 2026", "20261105",
   "5/XI/2026", salinan dari Excel atau PDF. Berkas ini mengubah
   semuanya menjadi SATU bentuk -- "yyyy-mm-dd", bentuk yang dipakai
   seluruh kode lain -- atau "" kalau yang diketik memang bukan tanggal.

   Murni string -> string, tanpa DOM, supaya bisa diuji di qa/engine-test.js.

   ATURAN TAFSIR (urutannya penting; yang lebih atas menang)

   1. Hari DULU, lalu bulan, lalu tahun -- kebiasaan orang Indonesia:
      "5/11/2026" = 5 November, bukan 11 Mei. Hanya kalau cara itu
      mustahil dan cara sebaliknya masuk akal ("11/13/2026": tidak ada
      bulan 13) dibaca bulan-hari-tahun, karena memang tidak ada
      tafsir lain.
   2. Tahun di depan = ISO: "2026-11-05", "2026/11/5". Selalu tahun,
      bulan, hari.
   3. Nama bulan boleh Indonesia atau Inggris, lengkap atau singkatan
      (Agu, Agt, Ags, Agst, Okt, Des, Mei, Sept, ...), huruf besar-kecil
      bebas, bulan Romawi pun boleh ("5/XI/2026" seperti di nomor surat).
      Nama hari ("Rabu,"), akhiran urutan (4th), kata "tanggal"/"tgl"
      dan jam di belakang tanggal diabaikan.
   4. Tahun dua angka dibaca yang terdekat dengan tahun ini (jendela 50
      tahun ke belakang, 49 ke depan): di 2026, "26" -> 2026, "75" ->
      2075, "76" -> 1976.
   5. Tahun yang tidak ditulis ("5/11", "5 nov") = tahun ini.
   6. Tanpa pemisah: 8 angka = ddmmyyyy atau yyyymmdd (tidak pernah
      kedua-duanya sah sekaligus), 6 angka = ddmmyy, 4 angka = ddmm.
      Panjang lain TIDAK ditebak -- "41126" bisa 4/11/26 maupun
      41/1/26, dan tanggal yang salah tebak lebih berbahaya daripada
      kotak yang meminta diketik ulang.
   7. Kata "hari ini", "besok", "kemarin", "lusa" (dan padanan Inggrisnya).
   8. Hari yang tidak ada di bulannya ("31/04/2026", "30/02/2026"), bulan
      di luar 1-12, tahun di luar 1900-2100: ditolak, BUKAN digeser ke
      bulan berikutnya -- bergeser diam-diam adalah kesalahan yang paling
      sulit ditemukan.
------------------------------------------------------------------ */

// Nama bulan, diindeks bulan-1. Singkatan 3 huruf ke atas dicocokkan sebagai AWALAN.
const TGL_NAMA_BULAN = [
  ["januari", "january"],
  ["februari", "pebruari", "february"],
  ["maret", "march"],
  ["april"],
  ["mei", "may"],
  ["juni", "june"],
  ["juli", "july"],
  ["agustus", "august"],
  ["september"],
  ["oktober", "october"],
  ["november", "nopember"],
  ["desember", "december"],
];
// Singkatan lazim yang BUKAN awalan nama lengkapnya
const TGL_SINGKATAN_BULAN = { agt: 8, ags: 8, agst: 8 };
const TGL_BULAN_ROMAWI = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
/* Kata yang boleh menyertai tanggal dan dibuang: nama hari (Indonesia,
   Inggris, singkatannya) dan penanda "tanggal". */
const TGL_KATA_ABAI = new Set([
  "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu", "ahad",
  "sen", "sel", "rab", "kam", "jum", "sab", "min", "ming",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
  "tgl", "tanggal", "tahun", "thn",
]);
const TGL_AKHIRAN_URUTAN = new Set(["st", "nd", "rd", "th"]);
// Kata kunci -> selisih hari dari hari ini
const TGL_KATA_KUNCI = {
  "hari ini": 0, hariini: 0, "hr ini": 0, today: 0, now: 0, sekarang: 0, kini: 0,
  kemarin: -1, kemaren: -1, yesterday: -1,
  besok: 1, esok: 1, tomorrow: 1,
  lusa: 2,
};

// Hari ini "yyyy-mm-dd" (tanggal lokal). todayISO() bila ada, supaya uji bisa membekukannya.
function tglHariIni() {
  if (typeof todayISO === "function") return todayISO();
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// Jumlah hari di bulan itu (bulan 1-12), tahun kabisat dihitung.
function tglHariDalamBulan(tahun, bulan) {
  return new Date(tahun, bulan, 0).getDate();
}

/* Tahun, bulan, hari -> "yyyy-mm-dd", atau "" kalau bukan tanggal yang ada.
   Rentang tahun 1900-2100 dijaga di sini: "5/11/202" yang kelebihan
   satu angka tidak boleh lolos sebagai tahun 202. */
function tglBentuk(tahun, bulan, hari) {
  if (![tahun, bulan, hari].every(Number.isInteger)) return "";
  if (tahun < 1900 || tahun > 2100 || bulan < 1 || bulan > 12 || hari < 1) return "";
  if (hari > tglHariDalamBulan(tahun, bulan)) return "";
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
}

/* Bentuk ISO yang BAKU ("2026-11-05") dan tanggalnya ada? Dipakai
   penyetel nilai kotak: yang bukan bentuk ini dikosongkan, persis
   <input type="date"> bawaan peramban. Tahun di sini tidak dibatasi
   1900-2100 -- data lama yang kebetulan bertahun lain tetap tampil. */
function tanggalIsoSah(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? "" : iso));
  if (!m) return false;
  const th = +m[1], bl = +m[2], hr = +m[3];
  return th >= 1000 && bl >= 1 && bl <= 12 && hr >= 1 && hr <= tglHariDalamBulan(th, bl);
}

// Tahun dua angka -> tahun lengkap terdekat dengan tahun ini (50 lalu .. 49 depan)
function tglTahunDuaAngka(yy, tahunIni) {
  let th = Math.floor(tahunIni / 100) * 100 + yy;
  if (th > tahunIni + 49) th -= 100;
  else if (th < tahunIni - 50) th += 100;
  return th;
}

// Nama bulan (atau bulan Romawi) -> 1-12, atau 0 kalau bukan nama bulan
function tglBulanDariKata(kata) {
  if (TGL_BULAN_ROMAWI[kata]) return TGL_BULAN_ROMAWI[kata];
  if (TGL_SINGKATAN_BULAN[kata]) return TGL_SINGKATAN_BULAN[kata];
  if (kata.length < 3) return 0;
  for (let i = 0; i < 12; i++) if (TGL_NAMA_BULAN[i].some((nama) => nama.startsWith(kata))) return i + 1;
  return 0;
}

/* Hari-bulan (tanpa nama bulan) -> {hari, bulan}, dengan tafsir kedua
   hanya bila yang pertama mustahil (aturan 1 di atas). */
function tglHariBulan(a, b) {
  if (b > 12 && a <= 12) return { hari: b, bulan: a };
  return { hari: a, bulan: b };
}

/* Kotak tanggal diketik -> "yyyy-mm-dd", atau "" kalau tidak terbaca.
   opsi.hariIni ("yyyy-mm-dd") menggantikan hari ini -- untuk uji. */
function bacaTanggalKetik(teks, opsi) {
  let s = String(teks == null ? "" : teks).trim().toLowerCase();
  if (!s) return "";
  const hariIni = (opsi && opsi.hariIni) || tglHariIni();
  const tahunIni = +hariIni.slice(0, 4);

  s = s.replace(/[’'`´]/g, "").replace(/[‐-―−]/g, "-");
  /* Jam di belakang tanggal dibuang: "2026-11-05t10:30:00z", "05/11/2026 14:30",
     "5 nov 2026 10:30 pm". Wajib bertitik dua dan wajib ada sesuatu di depannya:
     "5.11" adalah tanggal, bukan jam. */
  s = s.replace(/^(.*\S)[\st]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:am|pm|wib|wita|wit|z|[+-]\d{2}:?\d{2})?\s*$/, "$1");

  // Kata kunci ("besok") hanya berlaku kalau tidak ada angka sama sekali
  if (!/\d/.test(s)) {
    const frasa = (s.match(/[a-z]+/g) || []).filter((k) => !TGL_KATA_ABAI.has(k)).join(" ");
    if (Object.prototype.hasOwnProperty.call(TGL_KATA_KUNCI, frasa)) {
      const d = new Date(+hariIni.slice(0, 4), +hariIni.slice(5, 7) - 1, +hariIni.slice(8, 10) + TGL_KATA_KUNCI[frasa]);
      return tglBentuk(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  }

  // Potong jadi gugus angka dan gugus huruf; pemisah apa pun (/ - . , spasi) cuma pembatas
  const bagian = s.match(/[a-z]+|\d+/g) || [];
  const angka = [];
  const huruf = [];
  bagian.forEach((p, i) => {
    if (/^\d/.test(p)) return angka.push(p);
    if (TGL_AKHIRAN_URUTAN.has(p) && i > 0 && /^\d/.test(bagian[i - 1])) return; // "4th"
    if (TGL_KATA_ABAI.has(p)) return;
    huruf.push(p);
  });
  if (huruf.length > 1) return "";

  const bulanKata = huruf.length ? tglBulanDariKata(huruf[0]) : 0;
  if (huruf.length && !bulanKata) return ""; // kata yang tidak dikenal

  let th, bl, hr;
  if (bulanKata) {
    bl = bulanKata;
    if (angka.length === 1) {
      if (angka[0].length > 2) return ""; // "nov 2026": tidak ada harinya
      hr = +angka[0];
      th = tahunIni;
    } else if (angka.length === 2) {
      const [a, b] = angka;
      if (a.length === 4 && b.length <= 2) { th = +a; hr = +b; }
      else if (b.length === 4 && a.length <= 2) { hr = +a; th = +b; }
      else if (a.length <= 2 && b.length === 2) { hr = +a; th = tglTahunDuaAngka(+b, tahunIni); }
      else return "";
    } else return "";
    return tglBentuk(th, bl, hr);
  }

  if (angka.length === 3) {
    const [a, b, c] = angka;
    if (a.length === 4 && b.length <= 2 && c.length <= 2) return tglBentuk(+a, +b, +c); // ISO
    if (a.length > 2 || b.length > 2) return "";
    if (c.length === 4) th = +c;
    else if (c.length === 2) th = tglTahunDuaAngka(+c, tahunIni);
    else return "";
    /* Tahun dua angka dan hari di depan yang mustahil ("99-11-04"): satu-satunya
       tafsir yang tersisa adalah yy-mm-dd. */
    if (c.length === 2 && +a > 31 && +c <= 31) return tglBentuk(tglTahunDuaAngka(+a, tahunIni), +b, +c);
    ({ hari: hr, bulan: bl } = tglHariBulan(+a, +b));
    return tglBentuk(th, bl, hr);
  }

  if (angka.length === 2) {
    const [a, b] = angka;
    if (a.length > 2 || b.length > 2) return ""; // "11/2026": tidak ada harinya
    ({ hari: hr, bulan: bl } = tglHariBulan(+a, +b));
    return tglBentuk(tahunIni, bl, hr);
  }

  if (angka.length === 1) {
    const d = angka[0];
    if (d.length === 8) {
      return tglBentuk(+d.slice(4), +d.slice(2, 4), +d.slice(0, 2)) || tglBentuk(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6));
    }
    if (d.length === 6) return tglBentuk(tglTahunDuaAngka(+d.slice(4), tahunIni), +d.slice(2, 4), +d.slice(0, 2));
    if (d.length === 4) return tglBentuk(tahunIni, +d.slice(2), +d.slice(0, 2));
  }
  return "";
}
