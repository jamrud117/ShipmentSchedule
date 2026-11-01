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

function setTema(pilihan) {
  if (!TEMA_PILIHAN.includes(pilihan)) return;
  try {
    localStorage.setItem(TEMA_KUNCI, pilihan);
  } catch (e) {
    /* Tidak tersimpan: berlaku untuk sesi ini saja. */
  }
  terapkanTema(pilihan);
  gambarPilihanTema();
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
  setTema(tombol.dataset.temaPick);
});
document.addEventListener("DOMContentLoaded", gambarPilihanTema);
