"use strict";

/* DOM SHORTCUTS */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* PUSTAKA EXCEL DIMUAT SAAT DIBUTUHKAN */
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

/* ExcelJS — hanya untuk MENULIS berkas.

   SheetJS versi komunitas mengabaikan gaya sel saat menulis (font,
   perataan, warna latar hanya ada di versi berbayarnya), jadi ia tetap
   dipakai untuk MEMBACA berkas impor, tapi tidak bisa menghasilkan
   berkas ekspor yang berformat. Diunduh saat dibutuhkan saja, sama
   seperti SheetJS. */
const EXCELJS_CDN =
  "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
let exceljsPromise = null;
function ensureExcelJS() {
  if (typeof ExcelJS !== "undefined") return Promise.resolve();
  if (!exceljsPromise) {
    exceljsPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = EXCELJS_CDN;
      el.onload = () => resolve();
      el.onerror = () => {
        exceljsPromise = null;
        reject(new Error("Gagal memuat pustaka Excel. Periksa koneksi."));
      };
      document.head.appendChild(el);
    });
  }
  return exceljsPromise;
}

/* KOTAK TANGGAL: klik di mana saja membuka pemilih tanggal */
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

/* AUTO-LEBAR INPUT */
let __textSizer = null;
/* `gaya` boleh diberikan kalau pemanggilnya SUDAH menghitungnya.

   getComputedStyle memaksa peramban menyelesaikan perhitungan gaya
   saat itu juga. Dulu autoSizeInput memanggilnya sekali untuk padding,
   lalu fungsi ini memanggilnya LAGI untuk font — pada elemen yang
   sama, dua kali kerja yang sama per baris tabel. */
function measureTextWidth(el, text, gaya) {
  if (!__textSizer) {
    __textSizer = document.createElement("span");
    __textSizer.setAttribute("aria-hidden", "true");
    __textSizer.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;white-space:pre;visibility:hidden;padding:0;margin:0;border:0";
    document.body.appendChild(__textSizer);
  }
  const cs = gaya || getComputedStyle(el);
  __textSizer.style.fontFamily = cs.fontFamily;
  __textSizer.style.fontSize = cs.fontSize;
  __textSizer.style.fontWeight = cs.fontWeight;
  __textSizer.style.fontStyle = cs.fontStyle;
  __textSizer.style.letterSpacing = cs.letterSpacing;
  __textSizer.style.textTransform = cs.textTransform;
  __textSizer.textContent = text || "";
  return __textSizer.offsetWidth;
}

// Lebar input = lebar teks + padding + border, dibatasi min/max PIKSEL
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
  const needed = measureTextWidth(el, text, cs) + chrome;
  const min = minPx == null ? 72 : minPx;
  const max = maxPx == null ? 240 : maxPx;
  el.style.width = `${Math.min(max, Math.max(min, Math.ceil(needed)))}px`;
}

const cardContainer = $("#cardContainer");
const emptyState = $("#emptyState");
/* Detail read-only sekarang memakai PANEL GESER, bukan modal Bootstrap */
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
