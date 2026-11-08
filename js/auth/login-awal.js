"use strict";

/* LAYAR MASUK SEKETIKA -- dimuat tepat sesudah markup #viewLogin, SEBELUM
   ±130 skrip aplikasi.

   Tanpa sesi Supabase tersimpan (kunci "sb-<proyek>-auth-token" di
   localStorage), halaman ini PASTI berakhir di layar masuk. Dulu layar
   sambutan ("Menyiapkan Papan Jadwal…") tetap tampil sampai semua skrip
   (±3 MB) terunduh & terbaca -- 2–4 detik di komputer kantor, paling
   terasa sesudah Keluar, yang memuat ulang halaman untuk membuang data
   sesi sebelumnya dari memori. Kini layar masuk tampil seketika, dalam
   bahasa pilihan pengguna dan dengan username yang diingat; skripnya
   tetap dimuat di belakang sambil pengguna mengetik.

   Masuk (klik / Enter) sebelum aplikasinya siap DITAMPUNG, tidak
   hilang: tombolnya berputar, dan initAuth() menjalankannya begitu siap
   (window.__masukTertunda, js/auth/session.js). Begitu session.js
   termuat, penangan di berkas ini diam -- penangan session.js yang
   bekerja.

   Ada sesi tersimpan (mungkin kedaluwarsa)? Berkas ini tidak berbuat
   apa-apa: initAuth() yang memutuskan, seperti biasa.

   Berkas ini tidak memakai kamus (i18n.js belum dimuat): teks layar
   masuk ditulis lewat data-en, dengan cara yang sama persis seperti
   applyI18nSebaris() -- teks Indonesia aslinya disimpan di data-id*. */
(function () {
  const login = document.getElementById("viewLogin");
  if (!login) return;
  let adaSesi = true;
  let bahasa = "id";
  let ingat = true;
  let namaIngat = "";
  try {
    adaSesi = Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
    bahasa = localStorage.getItem("exim.lang") === "en" ? "en" : "id";
    ingat = localStorage.getItem("exim.remember") !== "0";
    namaIngat = ingat ? localStorage.getItem("exim.remember.user") || "" : "";
  } catch (e) {
    /* Penyimpanan ditolak (mode privat ketat): biarkan initAuth() memutuskan. */
    return;
  }
  if (adaSesi) return;

  if (bahasa === "en") {
    [["en", null], ["enPh", "placeholder"], ["enTitle", "title"], ["enAria", "aria-label"]].forEach(([kunci, atribut]) => {
      const simpan = "id" + kunci.charAt(0).toUpperCase() + kunci.slice(1);
      login.querySelectorAll("[data-" + kunci.replace(/[A-Z]/g, (h) => "-" + h.toLowerCase()) + "]").forEach((el) => {
        if (el.dataset[simpan] == null) el.dataset[simpan] = atribut ? el.getAttribute(atribut) || "" : el.innerHTML;
        if (atribut) el.setAttribute(atribut, el.dataset[kunci]);
        else el.innerHTML = el.dataset[kunci];
      });
    });
    document.documentElement.lang = "en";
  }
  login.querySelectorAll("[data-lang-pick]").forEach((b) => b.classList.toggle("active", b.dataset.langPick === bahasa));

  const nama = document.getElementById("loginUsername");
  const sandi = document.getElementById("loginPassword");
  const ingatCb = document.getElementById("loginRemember");
  const tombol = document.getElementById("btnLogin");
  if (ingatCb) ingatCb.checked = ingat;
  if (nama && namaIngat) nama.value = namaIngat;

  const boot = document.getElementById("bootScreen");
  if (boot) {
    boot.classList.add("is-done");
    boot.style.display = "none";
  }
  login.classList.remove("d-none");
  document.body.classList.add("is-locked");
  // Tanda untuk session.js: isian sudah disiapkan (dan mungkin sudah diketik) -- jangan ditimpa
  login.dataset.tampilAwal = "1";
  const kosong = nama && !nama.value ? nama : sandi;
  if (kosong) {
    try {
      kosong.focus({ preventScroll: true });
    } catch (e) {
      kosong.focus();
    }
  }

  if (!nama || !sandi || !tombol) return;
  // session.js sudah termuat = penangannya sendiri yang bekerja
  const aplikasiTermuat = () => typeof handleLoginSubmit === "function";
  const tunda = () => {
    if (!nama.value.trim()) return nama.focus();
    if (!sandi.value) return sandi.focus();
    window.__masukTertunda = true;
    tombol.disabled = true;
    const ikon = tombol.querySelector(".bi");
    if (ikon) ikon.className = "spinner-border spinner-border-sm";
  };
  tombol.addEventListener("click", () => {
    if (!aplikasiTermuat()) tunda();
  });
  [nama, sandi].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (aplikasiTermuat() || e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      if (el === nama && !sandi.value) sandi.focus();
      else tunda();
    });
  });
})();
