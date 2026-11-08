"use strict";

/* KEPADATAN DAFTAR JADWAL: Nyaman / Ringkas

   Kartu jadwal memuat banyak hal: perjalanan, tanggal, rincian, progres
   dokumen, catatan. Saat memantau belasan kiriman sekaligus, yang dicari
   biasanya hanya "mana yang terlambat, mana yang kurang dokumen". Tombol
   Ringkas (#btnKepadatan di bilah kendali) menyembunyikan rincian dan
   catatan lewat CSS (html[data-kepadatan="ringkas"], css/desain.css),
   jadi lebih banyak kartu terlihat sekali pandang.

   Murni tampilan: tidak ada data yang berubah, tidak ada kartu yang
   digambar ulang. Pilihannya diingat per peramban. */
const KEPADATAN_KUNCI = "exim.kepadatan"; // "nyaman" | "ringkas"

function kepadatanBaca() {
  try {
    return localStorage.getItem(KEPADATAN_KUNCI) === "ringkas" ? "ringkas" : "nyaman";
  } catch (e) {
    return "nyaman"; // penyimpanan diblokir: bawaan
  }
}

function kepadatanTerapkan(nilai) {
  const ringkas = nilai === "ringkas";
  document.documentElement.dataset.kepadatan = ringkas ? "ringkas" : "nyaman";
  const tombol = document.getElementById("btnKepadatan");
  if (tombol) tombol.setAttribute("aria-pressed", ringkas ? "true" : "false");
  return ringkas ? "ringkas" : "nyaman";
}

function kepadatanGanti() {
  // Keadaan sekarang dibaca dari <html>, bukan dari penyimpanan: tanpa
  // penyimpanan (diblokir) tombolnya tetap bisa bolak-balik.
  const baru = document.documentElement.dataset.kepadatan === "ringkas" ? "nyaman" : "ringkas";
  try {
    localStorage.setItem(KEPADATAN_KUNCI, baru);
  } catch (e) {
    /* tanpa penyimpanan: berlaku untuk sesi ini saja */
  }
  return kepadatanTerapkan(baru);
}

(function pasangKepadatan() {
  kepadatanTerapkan(kepadatanBaca());
  const tombol = document.getElementById("btnKepadatan");
  if (tombol) tombol.addEventListener("click", kepadatanGanti);
})();
