"use strict";

/* ==================================================================
   "CARA KERJA" (?) -- PENJELASAN PANJANG DILIPAT KE TANDA TANYA

   Permintaan pengguna: kalimat penjelasan panjang di bawah isian
   membuat halaman ramai. Semuanya dilipat ke tombol "?" kecil --
   biasanya di judul bagiannya -- bertooltip "Cara kerja" / "How it
   works". Menekannya membuka panel "Cara kerja" berisi kalimat
   lengkapnya; peringatan & keterangan keadaan (nomor ganda, gagal
   baca, dsb.) TETAP tampil di tempatnya.

   Markup statis di index.html:
     <span class="ck">
       <button type="button" class="ck-tombol" ...><i class="bi bi-question-lg"></i></button>
       <span class="ck-isi" hidden>
         <span class="ck-p">Kalimat …</span>   (boleh <b>, data-en, data-i18n)
       </span>
     </span>
   .ck-isi tidak pernah tampil di tempatnya: ia SUMBER teksnya, dan ikut
   diterjemahkan applyLang seperti teks lain. Bagian yang digambar JS
   memakai caraKerjaHtml(): isinya di atribut data-ck-isi tombolnya.
   Saat tombol ditekan isinya
   disalin ke SATU panel bersama (#ckPanel) di <body> -- bukan di dalam
   kartu, jadi tidak terpotong overflow / transform leluhurnya -- lalu
   diletakkan di bawah tombol (di atasnya bila ruang bawah tidak cukup),
   selalu di dalam layar. Semuanya <span> supaya sah di dalam label,
   judul, maupun teks sebaris.

   Tutup: tombol yang sama, tombol × panel, Esc (fokus kembali ke
   tombol; Esc tidak ikut menutup pop-up di belakangnya), klik / fokus
   di luar panel, Tab keluar panel, ganti bahasa (setLang), atau
   tombolnya hilang dari halaman karena bagiannya digambar ulang.
================================================================== */

let ckAktif = null; // tombol "?" yang panelnya sedang terbuka
let ckBingkai = 0;

/* Markup tombol "?" untuk bagian yang digambar JS. `isi` = HTML
   tepercaya dari kode (tt(...) -- BUKAN isian pengguna), satu string
   atau daftar paragraf. Isinya dibawa atribut data-ck-isi tombolnya,
   bukan .ck-isi tersembunyi: textContent judul tempat tombol ini duduk
   tetap judulnya saja, dan bagian JS digambar ulang saat ganti bahasa
   (jadi tidak butuh data-en). */
function caraKerjaHtml(isi) {
  const paragraf = (Array.isArray(isi) ? isi : [isi]).filter(Boolean);
  if (!paragraf.length) return "";
  const label = escapeAttr(tt("Cara kerja", "How it works"));
  const html = paragraf.map((p) => `<span class="ck-p">${p}</span>`).join("");
  return `<span class="ck"><button type="button" class="ck-tombol" aria-expanded="false" aria-controls="ckPanel" title="${label}" aria-label="${label}" data-ck-isi="${escapeAttr(html)}"><i class="bi bi-question-lg" aria-hidden="true"></i></button></span>`;
}

function caraKerjaPanel() {
  let p = document.getElementById("ckPanel");
  if (p) return p;
  p = document.createElement("div");
  p.id = "ckPanel";
  p.className = "ck-panel";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-modal", "false");
  p.setAttribute("aria-labelledby", "ckPanelJudul");
  p.tabIndex = -1;
  p.hidden = true;
  p.innerHTML =
    '<div class="ck-panel-kepala"><span class="ck-panel-judul" id="ckPanelJudul"></span>' +
    '<button type="button" class="ck-panel-tutup"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>' +
    '<div class="ck-panel-isi"></div>';
  p.querySelector(".ck-panel-tutup").addEventListener("click", () => caraKerjaTutup(true));
  document.body.appendChild(p);
  return p;
}

// Isi panel: data-ck-isi tombol (bagian JS) atau .ck-isi di sampingnya (markup statis)
function caraKerjaIsi(tombol) {
  if (tombol.dataset.ckIsi) return tombol.dataset.ckIsi;
  const wadah = tombol.closest(".ck");
  const sumber = wadah && wadah.querySelector(".ck-isi");
  return sumber ? sumber.innerHTML : "";
}

function caraKerjaBuka(tombol) {
  const isi = caraKerjaIsi(tombol);
  if (!isi) return;
  if (ckAktif && ckAktif !== tombol) caraKerjaTutup(false);
  const p = caraKerjaPanel();
  p.querySelector(".ck-panel-judul").textContent = tt("Cara kerja", "How it works");
  const tutup = p.querySelector(".ck-panel-tutup");
  tutup.setAttribute("aria-label", tt("Tutup", "Close"));
  tutup.title = tt("Tutup (Esc)", "Close (Esc)");
  // Salinan, bukan pindahan: sumbernya tetap di tempat untuk applyLang
  p.querySelector(".ck-panel-isi").innerHTML = isi;
  p.querySelectorAll("[id]").forEach((el) => {
    if (el.id !== "ckPanelJudul") el.removeAttribute("id");
  });
  ckAktif = tombol;
  tombol.setAttribute("aria-expanded", "true");
  p.hidden = false;
  caraKerjaLetakkan();
  p.focus({ preventScroll: true });
}

function caraKerjaTutup(kembalikanFokus) {
  const p = document.getElementById("ckPanel");
  const tombol = ckAktif;
  ckAktif = null;
  cancelAnimationFrame(ckBingkai);
  if (p) {
    p.hidden = true;
    p.querySelector(".ck-panel-isi").innerHTML = "";
  }
  if (!tombol) return;
  tombol.setAttribute("aria-expanded", "false");
  if (kembalikanFokus && tombol.isConnected) tombol.focus({ preventScroll: true });
}

/* Di bawah tombol, rata kiri dengan tombolnya; ruang bawah kurang ->
   di atasnya; selalu 12px dari tepi layar. Tombol hilang / tergulir
   keluar layar -> panel ditutup. */
function caraKerjaLetakkan() {
  const p = document.getElementById("ckPanel");
  const tombol = ckAktif;
  if (!p || !tombol) return;
  // Tombolnya digambar ulang / bagiannya disembunyikan (tab lain): tutup
  if (!tombol.isConnected || (typeof tombol.checkVisibility === "function" && !tombol.checkVisibility())) return caraKerjaTutup(false);
  const r = tombol.getBoundingClientRect();
  const lebarLayar = document.documentElement.clientWidth || window.innerWidth;
  const tinggiLayar = window.innerHeight;
  if (r.bottom < 0 || r.top > tinggiLayar) return caraKerjaTutup(false);
  const tepi = 12;
  const jarak = 8;
  const lebar = p.offsetWidth;
  const tinggi = p.offsetHeight;
  const kiri = Math.max(tepi, Math.min(r.left - 10, lebarLayar - tepi - lebar));
  let atas = r.bottom + jarak;
  if (atas + tinggi > tinggiLayar - tepi) {
    const diAtas = r.top - jarak - tinggi;
    atas = diAtas >= tepi ? diAtas : Math.max(tepi, tinggiLayar - tepi - tinggi);
  }
  p.style.left = Math.round(kiri) + "px";
  p.style.top = Math.round(atas) + "px";
  p.dataset.sisi = atas < r.top ? "atas" : "bawah";
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest(".ck-tombol");
  if (!tombol) return;
  e.preventDefault();
  if (ckAktif === tombol) caraKerjaTutup(false);
  else caraKerjaBuka(tombol);
});

// Klik / sentuh di luar panel & tombolnya: tutup (fokus tidak dipindah)
document.addEventListener(
  "pointerdown",
  (e) => {
    if (!ckAktif) return;
    const p = document.getElementById("ckPanel");
    if ((p && p.contains(e.target)) || ckAktif.contains(e.target)) return;
    caraKerjaTutup(false);
  },
  true,
);

document.addEventListener(
  "keydown",
  (e) => {
    if (!ckAktif) return;
    const p = document.getElementById("ckPanel");
    if (e.key === "Escape") {
      // Hanya panel ini yang tertutup -- bukan pop-up / form di belakangnya
      e.preventDefault();
      e.stopPropagation();
      caraKerjaTutup(true);
      return;
    }
    /* Tab dari dalam panel: kembali ke alur halaman tepat di tombol "?"
       -- Tab lanjut ke isian sesudahnya, Shift+Tab berhenti di tombolnya. */
    if (e.key === "Tab" && p && p.contains(document.activeElement)) {
      const tombol = ckAktif;
      caraKerjaTutup(false);
      tombol.focus({ preventScroll: true });
      if (e.shiftKey) e.preventDefault();
    }
  },
  true,
);

document.addEventListener("focusin", (e) => {
  if (!ckAktif) return;
  const p = document.getElementById("ckPanel");
  if ((p && p.contains(e.target)) || e.target === ckAktif) return;
  caraKerjaTutup(false);
});

const caraKerjaIkuti = () => {
  if (!ckAktif) return;
  cancelAnimationFrame(ckBingkai);
  ckBingkai = requestAnimationFrame(caraKerjaLetakkan);
};
window.addEventListener("resize", caraKerjaIkuti);
window.addEventListener("scroll", caraKerjaIkuti, true);
window.addEventListener("hashchange", () => caraKerjaTutup(false));

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", caraKerjaPanel);
else caraKerjaPanel();
