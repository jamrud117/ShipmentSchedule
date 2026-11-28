"use strict";

/* TEMA TAMPILAN: Terang / Gelap / Ikuti sistem.

   Dimuat di <head> SEBELUM lembar gaya, tanpa defer: atribut data-tema
   sudah terpasang di <html> sebelum halaman pertama kali digambar, jadi
   mode gelap tidak sempat berkedip terang. Warnanya sendiri di
   css/tokens.css (blok MODE GELAP).

   Pilihan tersimpan per peramban (localStorage). "sistem" mengikuti
   prefers-color-scheme dan ikut berubah saat pengaturan perangkat
   berganti. Bootstrap ikut lewat data-bs-theme. Cetakan selalu terang
   (blok gelapnya hanya @media screen). */

const TEMA_KUNCI = "ss-tema";
const TEMA_PILIHAN = ["terang", "gelap", "sistem"];

function temaPilihan() {
  try {
    const p = localStorage.getItem(TEMA_KUNCI);
    return TEMA_PILIHAN.includes(p) ? p : "sistem";
  } catch (e) {
    return "sistem";
  }
}

function temaAktif(pilihan) {
  const p = pilihan || temaPilihan();
  if (p === "terang" || p === "gelap") return p;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "gelap" : "terang";
}

function terapkanTema(pilihan) {
  const aktif = temaAktif(pilihan);
  const html = document.documentElement;
  html.setAttribute("data-tema", aktif);
  html.setAttribute("data-bs-theme", aktif === "gelap" ? "dark" : "light");
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", aktif === "gelap" ? "dark" : "light");
  return aktif;
}

// Tombol pemilih (menu akun) menandai pilihan yang berlaku
function gambarPilihanTema() {
  const p = temaPilihan();
  document.querySelectorAll("[data-tema-pick]").forEach((el) => {
    const aktif = el.dataset.temaPick === p;
    el.classList.toggle("active", aktif);
    el.setAttribute("aria-pressed", String(aktif));
  });
}

/* titik = { x, y } tempat pengguna menekan pilihan tema (opsional).

   Kalau temanya benar-benar berganti, gantinya dibungkus View
   Transitions: peramban memotret layar lama & baru, lalu yang baru
   dibuka sebagai lingkaran dari titik yang ditekan (css/peta-laut.css,
   bagian H) -- satu animasi di GPU, bukan transisi warna di ribuan
   elemen. Tanpa dukungan atau bila gerak diminta dikurangi: langsung
   berganti seperti biasa. */
function setTema(pilihan, titik) {
  if (!TEMA_PILIHAN.includes(pilihan)) return;
  try {
    localStorage.setItem(TEMA_KUNCI, pilihan);
  } catch (e) {
    /* Tidak tersimpan: berlaku untuk sesi ini saja. */
  }
  const ganti = () => {
    terapkanTema(pilihan);
    gambarPilihanTema();
  };
  const html = document.documentElement;
  const berganti = temaAktif(pilihan) !== html.getAttribute("data-tema");
  const kurangiGerak = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!berganti || kurangiGerak || typeof document.startViewTransition !== "function") {
    ganti();
    return;
  }
  const x = titik && titik.x != null ? titik.x : window.innerWidth / 2;
  const y = titik && titik.y != null ? titik.y : 0;
  html.style.setProperty("--tema-x", x + "px");
  html.style.setProperty("--tema-y", y + "px");
  html.style.setProperty("--tema-r", Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + "px");
  /* Selama transisi berjalan (`data-tema-berganti`), menu akun yang
     memuat tombol ini tidak boleh menutup sendiri: lapisan transisi
     menutupi halaman sesaat, dan peramban melaporkannya sebagai kursor
     yang keluar dari menu (js/auth/session.js). */
  try {
    html.dataset.temaBerganti = "1";
    const transisi = document.startViewTransition(ganti);
    const selesai = () => delete html.dataset.temaBerganti;
    if (transisi && transisi.finished) transisi.finished.then(selesai, selesai);
    else selesai();
  } catch (e) {
    delete html.dataset.temaBerganti;
    ganti();
  }
}

terapkanTema();

if (window.matchMedia) {
  const mqGelap = window.matchMedia("(prefers-color-scheme: dark)");
  const ikutSistem = () => {
    if (temaPilihan() === "sistem") terapkanTema("sistem");
  };
  if (mqGelap.addEventListener) mqGelap.addEventListener("change", ikutSistem);
  else if (mqGelap.addListener) mqGelap.addListener(ikutSistem);
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-tema-pick]");
  if (!tombol) return;
  e.preventDefault();
  setTema(tombol.dataset.temaPick, { x: e.clientX, y: e.clientY });
});
document.addEventListener("DOMContentLoaded", gambarPilihanTema);
