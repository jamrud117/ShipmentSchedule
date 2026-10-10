"use strict";

/* ==================================================================
   KURS PAJAK (KMK mingguan, fiskal.kemenkeu.go.id)

   Dibaca dari data/kurs-pajak.json -- berkas yang diperbarui GitHub
   Actions tiap pekan (scripts/ambil-kurs-pajak.mjs). Satu situs dengan
   aplikasi, jadi tanpa CORS, tanpa API, tanpa kunci.

   Kurs untuk sebuah TANGGAL = kurs periode KMK yang berlaku pada tanggal
   itu (Rabu-Selasa). Tanggal di luar riwayat yang tersimpan memakai
   periode terdekat dan ditandai `perkiraan`, supaya laporan bisa
   mengatakannya terus terang.
================================================================== */

let KURS_PAJAK_DATA = null;

async function muatKursPajak() {
  if (KURS_PAJAK_DATA) return KURS_PAJAK_DATA;
  try {
    const res = await fetch("data/kurs-pajak.json", { cache: "no-cache" });
    if (res.ok) KURS_PAJAK_DATA = await res.json();
  } catch (e) {
    console.warn("Kurs pajak tidak terbaca:", e);
  }
  if (!KURS_PAJAK_DATA || !Array.isArray(KURS_PAJAK_DATA.periode)) KURS_PAJAK_DATA = { periode: [] };
  return KURS_PAJAK_DATA;
}

/* { nilai, periode, perkiraan } -- nilai 0 kalau mata uangnya tidak ada. */
function kursPajakPada(mata, tanggal, data) {
  const kode = String(mata || "").toUpperCase();
  if (!kode || kode === "IDR") return { nilai: 1, periode: null, perkiraan: false };
  const daftar = ((data || KURS_PAJAK_DATA || {}).periode || []).filter((p) => p && p.kurs && p.kurs[kode] > 0);
  if (!daftar.length) return { nilai: 0, periode: null, perkiraan: true };
  const hari = String(tanggal || "").slice(0, 10);
  const tepat = daftar.find((p) => p.mulai <= hari && hari <= p.sampai);
  if (tepat) return { nilai: tepat.kurs[kode], periode: tepat, perkiraan: false };
  // Di luar riwayat: periode terakhir sebelum tanggal itu, kalau tidak ada yang paling awal
  const sebelum = daftar.filter((p) => p.mulai <= hari).sort((a, b) => (a.mulai < b.mulai ? 1 : -1))[0];
  const p = sebelum || daftar.slice().sort((a, b) => (a.mulai < b.mulai ? -1 : 1))[0];
  return { nilai: p.kurs[kode], periode: p, perkiraan: true };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { muatKursPajak, kursPajakPada };
}
