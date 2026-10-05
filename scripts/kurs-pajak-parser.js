"use strict";

/* ==================================================================
   PEMBACA HALAMAN KURS PAJAK — fiskal.kemenkeu.go.id

   Halaman resminya HTML biasa (tanpa API). Yang dibaca:
     "KMK Nomor 46/MK/EF.2/2026"
     "Tanggal berlaku: 30 September 2026 - 06 Oktober 2026"
     tabel 25 mata uang: "Dolar Amerika Serikat (USD) USD 17.863,00 156,00"

   Dibaca dari TEKS-nya (tag dibuang), bukan dari susunan kolom HTML:
   tampilan situs bisa berubah, tetapi pola "(KODE) ... angka" bertahan.
   Angka berformat Indonesia (titik ribuan, koma desimal). JPY tertulis
   per 100 yen -- disimpan per 1 yen supaya semua kurs berbentuk sama.

   Dipakai skrip GitHub Actions (ambil-kurs-pajak.mjs) dan diuji
   qa/dom-test.js.
================================================================== */

const KURS_PAJAK_KODE = [
  "USD", "AUD", "CAD", "DKK", "HKD", "MYR", "NZD", "NOK", "GBP", "SGD", "SEK", "CHF", "JPY",
  "MMK", "INR", "KWD", "PKR", "PHP", "SAR", "LKR", "THB", "BND", "EUR", "CNY", "KRW",
];

const BULAN_ID = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10, december: 12,
};

function teksHalaman(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

const angkaId = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));

function tanggalIso(h, b, t) {
  const bulan = BULAN_ID[String(b).toLowerCase()];
  if (!bulan) return "";
  return `${t}-${String(bulan).padStart(2, "0")}-${String(h).padStart(2, "0")}`;
}

function parseKursPajak(html) {
  const teks = teksHalaman(html);
  const kmk = (teks.match(/KMK\s+Nomor\s+([0-9A-Z][0-9A-Z./-]*)/i) || [])[1] || "";
  const b = teks.match(/Tanggal\s+berlaku\s*:?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!b) throw new Error("periode berlaku tidak ditemukan");
  const mulai = tanggalIso(b[1], b[2], b[3]);
  const sampai = tanggalIso(b[4], b[5], b[6]);
  if (!mulai || !sampai || mulai > sampai) throw new Error("periode berlaku tidak terbaca: " + b[0]);
  const kurs = {};
  KURS_PAJAK_KODE.forEach((kode) => {
    const m = teks.match(new RegExp("\\(" + kode + "\\)\\s*(?:" + kode + ")?\\s*(-?[\\d.]+,\\d+)"));
    if (!m) return;
    let nilai = angkaId(m[1]);
    if (kode === "JPY") nilai = nilai / 100; // situs: per 100 yen
    if (isFinite(nilai) && nilai > 0) kurs[kode] = Math.round(nilai * 10000) / 10000;
  });
  // Penjaga: tanpa USD yang masuk akal, hasilnya pasti salah baca
  if (!(kurs.USD > 5000 && kurs.USD < 50000)) throw new Error("kurs USD tidak terbaca dengan benar");
  return { mulai, sampai, kmk, kurs };
}

/* Satukan periode baru ke daftar (urut terbaru dulu, tanpa ganda). */
function gabungPeriode(daftar, baru) {
  const lain = (daftar || []).filter((p) => p.mulai !== baru.mulai);
  return lain.concat([baru]).sort((a, b) => (a.mulai < b.mulai ? 1 : -1));
}

/* Tanggal hari ini menurut WIB (UTC+7), "YYYY-MM-DD". Runner GitHub
   memakai UTC: Rabu 05.00 WIB di sana masih Selasa 22.00. */
function tanggalWib(ms) {
  return new Date((ms == null ? Date.now() : ms) + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/* Apakah periode KMK berlaku pada tanggal itu? */
const periodeMencakup = (p, tanggal) => !!p && p.mulai <= tanggal && tanggal <= p.sampai;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseKursPajak, gabungPeriode, teksHalaman, tanggalWib, periodeMencakup, KURS_PAJAK_KODE };
}
