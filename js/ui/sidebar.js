"use strict";

/* ------------------------------------------------------------------
   SIDEBAR NAVIGASI (markup di index.html, gaya di css/shell.css)

   - Desktop (>= 992 px): sidebar menempel di kiri. body.sb-rel
     menciutkannya jadi rel ikon. Pilihan pengguna (tombol di kaki
     sidebar) diingat per peramban; tanpa pilihan, ia rel di bawah
     1.280 px supaya tabel lebar tetap punya ruang.
   - Ponsel & tablet: laci. body.sb-terbuka membukanya; ditutup lewat
     tombol X, latar redup, Esc, atau begitu sebuah halaman dipilih.
   - aturKerangka(): bilah atas & sidebar tampil / sembunyi BERSAMA --
     disembunyikan di layar masuk dan di halaman form.
------------------------------------------------------------------ */
const SB_KUNCI = "exim.sidebar"; // "rel" | "lebar" -- pilihan pengguna di desktop

const sbMedia = (q) =>
  typeof window.matchMedia === "function"
    ? window.matchMedia(q)
    : { matches: true, addEventListener() {} };
const sbDesktop = sbMedia("(min-width: 992px)");
const sbLayarLebar = sbMedia("(min-width: 1280px)");

function sbPilihan() {
  try {
    return localStorage.getItem(SB_KUNCI);
  } catch (e) {
    return null; // penyimpanan diblokir: ikut lebar layar
  }
}

/* Rel ikon atau terbuka penuh -- satu kelas di <body>. Selalu dihitung
   (juga di ponsel), tapi hanya CSS desktop yang memakainya. */
function sbSetelRel(rel) {
  document.body.classList.toggle("sb-rel", rel);
  const btn = document.getElementById("btnSidebarCiut");
  if (!btn) return;
  const teks = rel ? tt("Lebarkan menu", "Expand menu") : tt("Ciutkan menu", "Collapse menu");
  btn.innerHTML = `<i class="bi ${rel ? "bi-chevron-double-right" : "bi-chevron-double-left"}"></i><span>${escapeHtml(teks)}</span>`;
  btn.title = teks;
  btn.setAttribute("aria-expanded", String(!rel));
}

function sbTerapkanLebar() {
  const pilihan = sbPilihan();
  sbSetelRel(pilihan === "rel" || (pilihan !== "lebar" && !sbLayarLebar.matches));
}

/* Tombol di kaki sidebar: berganti rel <-> penuh, dan diingat. */
function sbCiutkan() {
  const rel = !document.body.classList.contains("sb-rel");
  try {
    localStorage.setItem(SB_KUNCI, rel ? "rel" : "lebar");
  } catch (e) {
    /* Tidak tersimpan: tetap berlaku sampai halaman dimuat ulang. */
  }
  sbSetelRel(rel);
}

/* ---------- laci (ponsel & tablet) ---------- */
let sbTundaLatar = null;

const sbTerbuka = () => document.body.classList.contains("sb-terbuka");

function sbBuka() {
  if (sbDesktop.matches) return;
  const latar = document.getElementById("sbLatar");
  clearTimeout(sbTundaLatar);
  if (latar) {
    latar.hidden = false;
    void latar.offsetWidth; // latar tampil dulu, baru memudar masuk
  }
  document.body.classList.add("sb-terbuka");
  const pemicu = document.getElementById("btnSidebarBuka");
  if (pemicu) pemicu.setAttribute("aria-expanded", "true");
  // Fokus ke dalam laci: halaman yang sedang dibuka, atau tombol tutup
  const tuju = document.querySelector("#appSidebar .site-nav-link.active") || document.getElementById("btnSidebarTutup");
  if (tuju && typeof tuju.focus === "function") tuju.focus({ preventScroll: true });
}

function sbTutup(kembalikanFokus) {
  if (!sbTerbuka()) return;
  document.body.classList.remove("sb-terbuka");
  const pemicu = document.getElementById("btnSidebarBuka");
  if (pemicu) pemicu.setAttribute("aria-expanded", "false");
  const latar = document.getElementById("sbLatar");
  clearTimeout(sbTundaLatar);
  sbTundaLatar = setTimeout(() => {
    if (latar && !sbTerbuka()) latar.hidden = true;
  }, 300);
  if (kembalikanFokus && pemicu) pemicu.focus({ preventScroll: true });
}

/* Bilah atas & sidebar tampil / sembunyi bersama. */
function aturKerangka(tampil) {
  [".app-topbar", "#appSidebar"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.classList.toggle("d-none", !tampil);
  });
  document.body.classList.toggle("punya-kerangka", !!tampil);
  if (!tampil) sbTutup(false);
}

document.getElementById("btnSidebarBuka")?.addEventListener("click", () => {
  if (sbTerbuka()) sbTutup(true);
  else sbBuka();
});
document.getElementById("btnSidebarTutup")?.addEventListener("click", () => sbTutup(true));
document.getElementById("sbLatar")?.addEventListener("click", () => sbTutup(true));
document.getElementById("btnSidebarCiut")?.addEventListener("click", sbCiutkan);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sbTerbuka()) sbTutup(true);
});

const sbEl = document.getElementById("appSidebar");
if (sbEl) {
  // Memilih halaman (atau merek) di laci langsung menutupnya
  sbEl.addEventListener("click", (e) => {
    if (e.target.closest("a[href]")) sbTutup(false);
  });
  /* Judul (tooltip) tautan di rel ikon, diambil dari labelnya sendiri
     saat kursor tiba -- jadi selalu ikut bahasa yang sedang aktif. Di
     sidebar penuh judulnya dilepas: labelnya sudah terbaca. */
  sbEl.addEventListener("mouseover", (e) => {
    const a = e.target.closest(".site-nav-link");
    if (!a) return;
    const label = a.querySelector("span");
    if (document.body.classList.contains("sb-rel") && sbDesktop.matches && label) a.title = label.textContent.trim();
    else a.removeAttribute("title");
  });
}

// Lebar layar berubah: laci tidak tertinggal terbuka di desktop
sbDesktop.addEventListener("change", () => {
  if (sbDesktop.matches) sbTutup(false);
});
sbLayarLebar.addEventListener("change", sbTerapkanLebar);

sbTerapkanLebar();
