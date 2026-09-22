"use strict";

/* ------------------------------------------------------------------
   KOTAK JAM YANG BISA DIKETIK — DAN BISA DIKOSONGKAN

   <input type="time"> menyerahkan dua hal ke peramban, dan keduanya
   jadi masalah di sini:

   1. MENGOSONGKAN. Kotak yang sudah terisi hanya bisa dikosongkan
      lewat tombol khusus yang tidak semua peramban gambar. Di peramban
      yang tidak, jam yang terlanjur salah isi TIDAK BISA dihapus sama
      sekali — satu-satunya jalan keluar adalah mengetik jam lain.

   2. MENGETIK. Isiannya terbagi jadi ruas jam/menit yang harus
      dilompati satu per satu; di ponsel ia malah membuka pemilih
      berputar. Mengetik "0930" — cara tercepat bagi orang yang sudah
      tahu jamnya — tidak selalu bisa.

   Karena itu kotaknya kotak teks biasa, dan yang diketik DIRAPIKAN
   saat selesai: "930" -> "09:30", "9.5" -> "09:05", "24:00" -> "00:00".
   Yang tidak bisa dibaca sebagai jam dikosongkan, bukan disimpan apa
   adanya: nilai tersimpan harus selalu "HH:MM" karena itulah yang
   dibaca parseLocalDateTime() di core/route-model.js.

   Kosong tetap kosong — dan itu bukan kelalaian melainkan keadaan yang
   sah: jam ETD/ETA memang opsional, dan seluruh perhitungan jatuh ke
   presisi hari saat ia tidak diisi.
------------------------------------------------------------------ */

/* Mengembalikan "HH:MM", atau "" kalau tidak ada jam yang masuk akal.

   Bentuk yang diterima: "9", "930", "9:3", "9.30", "0930", "21:05".
   Angka di luar jangkauan (jam > 23, menit > 59) ditolak, KECUALI
   "24:00" yang lazim ditulis orang untuk tengah malam. */
function normalkanJam(teks) {
  const s = String(teks == null ? "" : teks).trim();
  if (!s) return "";

  const angka = s.replace(/[^\d]/g, "");
  if (!angka) return "";

  let jam;
  let menit;
  if (/[:.\s]/.test(s)) {
    // Ada pemisah: yang di kiri jam, yang di kanan menit.
    const [kiri, kanan] = s.split(/[:.\s]+/);
    jam = parseInt(String(kiri).replace(/\D/g, ""), 10);
    menit = kanan == null || kanan === "" ? 0 : parseInt(String(kanan).replace(/\D/g, ""), 10);
    // "9.5" berarti 9 lewat 5 menit, bukan 9 lewat 50.
    if (String(kanan || "").length === 1) menit = parseInt(kanan, 10);
  } else if (angka.length <= 2) {
    jam = parseInt(angka, 10);
    menit = 0;
  } else {
    /* 3 angka = "930" -> 9:30; 4 angka = "0930" -> 09:30. Lebih dari
       itu dipotong: sisanya tidak punya arti sebagai jam. */
    const p = angka.slice(0, 4);
    jam = parseInt(p.slice(0, p.length - 2), 10);
    menit = parseInt(p.slice(-2), 10);
  }

  if (!isFinite(jam) || !isFinite(menit)) return "";
  if (jam === 24 && menit === 0) jam = 0; // tengah malam
  if (jam < 0 || jam > 23 || menit < 0 || menit > 59) return "";
  return `${String(jam).padStart(2, "0")}:${String(menit).padStart(2, "0")}`;
}

/* Dipasang pada kotak ber-data-jam.

   Perapiannya saat `change`/blur, BUKAN saat mengetik: merapikan tiap
   ketikan berarti "9" langsung berubah jadi "09:00" sebelum orangnya
   sempat mengetik menitnya. */
function pasangKotakJam(el) {
  if (!el || el.dataset.jamTerpasang) return;
  el.dataset.jamTerpasang = "1";
  el.addEventListener("change", () => {
    const rapi = normalkanJam(el.value);
    if (el.value !== rapi) el.value = rapi;
  });
  el.addEventListener("blur", () => {
    const rapi = normalkanJam(el.value);
    if (el.value !== rapi) el.value = rapi;
  });
}

function pasangSemuaKotakJam(akar) {
  (akar || document).querySelectorAll("[data-jam]").forEach(pasangKotakJam);
}

/* Penjaga `typeof document`: berkas ini juga dimuat oleh uji di qa/,
   yang berjalan di Node tanpa DOM. Tanpa penjaga, memuatnya di sana
   melempar sebelum satu pun uji sempat berjalan. */
if (typeof document !== "undefined") {
  pasangSemuaKotakJam();
  document.addEventListener("DOMContentLoaded", () => pasangSemuaKotakJam());
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normalkanJam };
}
