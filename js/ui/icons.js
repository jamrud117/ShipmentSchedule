"use strict";

/* IKON HALAMAN

   Ikon yang mewakili sebuah halaman atau aksi utama -- sidebar, rel
   ikon, bilah atas ponsel, palet perintah, aksi cepat -- memakai SATU
   set garis (Lucide, lisensi ISC): tebal garis, ujung, dan sudutnya
   sama, jadi deretannya terbaca sebagai satu keluarga. Bentuknya
   disimpan sekali di <svg class="ikon-sprite"> di awal index.html;
   di sini cuma pemanggilnya.

   Ikon isi halaman (label rincian kartu, tombol tabel) tetap Bootstrap
   Icons. */
function ikonSvg(nama, kelas) {
  return `<svg class="ic${kelas ? " " + kelas : ""}" aria-hidden="true" focusable="false"><use href="#ik-${nama}"></use></svg>`;
}

/* Ikon di data perintah (palet) & tempat lain yang menyimpan namanya
   sebagai teks: "ik:jadwal" = ikon halaman, selain itu kelas
   Bootstrap Icons ("bi-plus-lg"). */
function ikonDari(nama) {
  const teks = String(nama || "");
  return teks.indexOf("ik:") === 0 ? ikonSvg(teks.slice(3)) : `<i class="bi ${teks}"></i>`;
}
