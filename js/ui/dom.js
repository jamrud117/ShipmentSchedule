"use strict";

/* ==================================================================
   DOM SHORTCUTS
================================================================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ==================================================================
   PUSTAKA EXCEL DIMUAT SAAT DIBUTUHKAN

   SheetJS (xlsx.full.min.js) berukuran hampir 1 MB dan DULU ikut
   diunduh setiap kali halaman dibuka — padahal hanya dipakai saat
   mengimpor/mengekspor Excel, yang tidak terjadi di sebagian besar
   kunjungan. Sekarang pustakanya baru diunduh pada saat benar-benar
   dipanggil, dan hanya sekali (janjinya disimpan).
================================================================== */
const XLSX_CDN =
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
let xlsxPromise = null;
function ensureXLSX() {
  if (typeof XLSX !== "undefined") return Promise.resolve();
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = XLSX_CDN;
      el.onload = () => resolve();
      el.onerror = () => {
        xlsxPromise = null; // biar percobaan berikutnya tidak ikut gagal
        reject(new Error("Gagal memuat pustaka Excel. Periksa koneksi."));
      };
      document.head.appendChild(el);
    });
  }
  return xlsxPromise;
}

/* ==================================================================
   KOTAK TANGGAL: klik di mana saja membuka pemilih tanggal

   Bawaan browser hanya membuka kalender kalau ikon kecil di ujung kanan
   yang ditekan — target yang sempit dan tidak terduga, apalagi di layar
   sentuh. Di sini seluruh kotak dibuat bisa diklik lewat showPicker().

   Dibungkus try/catch: showPicker() melempar error kalau browsernya
   belum mendukung, atau kalau dipanggil bukan dari aksi pengguna. Kalau
   gagal, perilaku bawaan tetap jalan — tidak ada yang rusak.
================================================================== */
document.addEventListener("click", (e) => {
  const el = e.target.closest(
    'input[type="date"], input[type="time"], input[type="month"]',
  );
  if (!el || el.readOnly || el.disabled) return;
  if (typeof el.showPicker !== "function") return;
  try {
    el.showPicker();
  } catch (err) {
    /* browser lama / bukan dari aksi pengguna — biarkan perilaku bawaan */
  }
});

/* ==================================================================
   AUTO-LEBAR INPUT

   Lebar <input> tidak bisa mengikuti isinya sendiri lewat CSS biasa.
   `field-sizing: content` sebenarnya bisa, tapi baru didukung Chrome 123+
   dan belum ada di Safari/Firefox — jadi lebarnya diukur sendiri di sini.

   Pengukuran memakai satu elemen ukur tersembunyi yang MENIRU font input
   yang bersangkutan (font-family, size, weight, letter-spacing). Cara ini
   lebih tepat daripada memperkirakan dari jumlah karakter (satuan `ch`),
   karena aplikasi ini memakai font proporsional di sebagian field dan
   monospace di field angka — "56 PACKAGE" dan "10 W" sama-sama 10
   karakter tapi lebar pikselnya jauh berbeda.
================================================================== */
let __textSizer = null;
function measureTextWidth(el, text) {
  if (!__textSizer) {
    __textSizer = document.createElement("span");
    __textSizer.setAttribute("aria-hidden", "true");
    __textSizer.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;white-space:pre;visibility:hidden;padding:0;margin:0;border:0";
    document.body.appendChild(__textSizer);
  }
  const cs = getComputedStyle(el);
  __textSizer.style.fontFamily = cs.fontFamily;
  __textSizer.style.fontSize = cs.fontSize;
  __textSizer.style.fontWeight = cs.fontWeight;
  __textSizer.style.fontStyle = cs.fontStyle;
  __textSizer.style.letterSpacing = cs.letterSpacing;
  __textSizer.style.textTransform = cs.textTransform;
  __textSizer.textContent = text || "";
  return __textSizer.offsetWidth;
}

// Lebar input = lebar teks + padding + border, dibatasi min/max PIKSEL.
// Placeholder ikut diukur supaya kotak yang masih kosong pun tidak
// memotong teks contohnya.
function autoSizeInput(el, minPx, maxPx) {
  if (!el) return;
  const cs = getComputedStyle(el);
  const px = (v) => parseFloat(v) || 0;
  const chrome =
    px(cs.paddingLeft) +
    px(cs.paddingRight) +
    px(cs.borderLeftWidth) +
    px(cs.borderRightWidth) +
    // Sisa 3px: mencegah karakter terakhir tertutup caret.
    3;
  const text = el.value || el.placeholder || "";
  const needed = measureTextWidth(el, text) + chrome;
  const min = minPx == null ? 72 : minPx;
  const max = maxPx == null ? 240 : maxPx;
  el.style.width = `${Math.min(max, Math.max(min, Math.ceil(needed)))}px`;
}

const cardContainer = $("#cardContainer");
const emptyState = $("#emptyState");
const viewListEl = $("#viewList");
const viewFormEl = $("#viewForm");
/* Detail read-only sekarang memakai PANEL GESER, bukan modal Bootstrap
   (lihat js/views/detail-view.js). Modal menutupi daftar, dan
   menutupnya berarti kehilangan tempat — padahal cara kerja
   sehari-hari adalah membandingkan satu per satu. */
const confirmModalEl = $("#confirmModal");
const confirmModal = new bootstrap.Modal(confirmModalEl);
const bulkModalEl = $("#bulkModal");
const bulkModal = new bootstrap.Modal(bulkModalEl);

function currentList() {
  return data[activeMode];
}
function ML() {
  return MODE_LABELS[activeMode];
}
