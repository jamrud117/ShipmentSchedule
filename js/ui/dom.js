"use strict";

/* DOM SHORTCUTS */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* FORM YANG TIDAK PERNAH DIKIRIM (panel Nomor Dokumen, data-tanpa-kirim):
   Enter tidak boleh memuat ulang halaman. Dulu onsubmit="return false;"
   di HTML -- penangan sebaris seperti itu diblokir Content-Security-Policy
   (index.html), jadi dijaga dari sini. */
document.addEventListener("submit", (e) => {
  if (e.target && e.target.matches && e.target.matches("form[data-tanpa-kirim]")) e.preventDefault();
});

/* SERET & LEPAS BERKAS KE SELURUH FORM -- form jadwal (import/dispatch.js),
   Pengajuan Dana (features/fund-invoice-import.js) & PO / PR (features/pr-ocr.js).
   Hanya seretan BERKAS yang ditangani: menyeret teks antar kotak isian tetap
   bekerja seperti biasa. Selagi berkas di atas zona: .is-dragover + petunjuk
   melayang dari data-drop-teks dalam bahasa yang sedang dipakai (gayanya satu,
   css/components.css). Berkas yang dilepas masuk penangan yang sama dengan
   tombol pilih berkasnya.
     opsi.teks()         petunjuk yang tampil
     opsi.lepas(berkas)  menerima daftar berkas yang dilepas
     opsi.boleh()        (pilihan) false = seretan tidak disambut (hak akses)
     opsi.mulai()        (pilihan) begitu berkas mulai diseret di atas zona --
                         mis. menyiapkan mesin OCR selagi pengguna mengarahkan */
function pasangZonaLepas(zona, opsi) {
  if (!zona) return;
  const bawaBerkas = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  const boleh = () => !opsi.boleh || opsi.boleh();
  const sorot = (hidup) => {
    if (hidup && !zona.classList.contains("is-dragover")) {
      zona.setAttribute("data-drop-teks", opsi.teks());
      if (opsi.mulai) opsi.mulai();
    }
    zona.classList.toggle("is-dragover", hidup);
  };
  ["dragenter", "dragover"].forEach((jenis) =>
    zona.addEventListener(jenis, (e) => {
      if (!bawaBerkas(e) || !boleh()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      sorot(true);
    }),
  );
  zona.addEventListener("dragleave", (e) => {
    /* dragleave juga menyala saat kursor melintas ke elemen ANAK */
    if (!bawaBerkas(e) || zona.contains(e.relatedTarget)) return;
    sorot(false);
  });
  zona.addEventListener("drop", (e) => {
    if (!bawaBerkas(e)) return;
    /* Selalu dicegah: tanpa ini peramban membuka berkasnya dan isian form hilang */
    e.preventDefault();
    sorot(false);
    const berkas = Array.from(e.dataTransfer.files || []);
    if (berkas.length && boleh()) opsi.lepas(berkas);
  });
}

/* PUSTAKA EXCEL DIMUAT SAAT DIBUTUHKAN

   SheetJS (MEMBACA berkas impor: CIPL vendor, Bulk Import, draft CEISA)
   dari CDN resminya. Versi di npm berhenti di 0.18.5 -- yang rentan
   prototype pollution (CVE-2023-30533) dan ReDoS (CVE-2024-22363) saat
   membaca berkas buatan orang lain; perbaikannya hanya terbit di
   cdn.sheetjs.com. */
const XLSX_CDN =
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
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
        reject(new Error(t("z.gagal.memuat.pustaka.excel")));
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
// Subresource Integrity berkas di atas (sama dengan paket npm exceljs@4.4.0)
const EXCELJS_SRI = "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz";
let exceljsPromise = null;
function ensureExcelJS() {
  if (typeof ExcelJS !== "undefined") return Promise.resolve();
  if (!exceljsPromise) {
    exceljsPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.integrity = EXCELJS_SRI;
      el.crossOrigin = "anonymous";
      el.src = EXCELJS_CDN;
      el.onload = () => resolve();
      el.onerror = () => {
        exceljsPromise = null;
        reject(new Error(t("z.gagal.memuat.pustaka.excel")));
      };
      document.head.appendChild(el);
    });
  }
  return exceljsPromise;
}

/* KOTAK JAM / BULAN: klik di mana saja membuka pemilih. <input type="date">
   tidak lagi lewat sini -- semuanya kotak ketik (ui/date-input.js) yang
   membuka kalender dari ikon di ujung kanan; yang masih bertipe date
   (filter tersembunyi, kotak pembantu kalender) memang tidak diklik. */
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

/* AUTO-LEBAR INPUT

   Lebar teks diukur di kanvas (measureText), bukan lewat <span> di luar
   layar: membaca offsetWidth span memaksa peramban menata ulang seluruh
   halaman SEKALI PER KOTAK -- di form jadwal (satu kotak kemasan per
   barang) itu setengah waktu membuka form.

   `gaya` boleh diberikan kalau pemanggilnya SUDAH menghitungnya
   (getComputedStyle memaksa perhitungan gaya saat itu juga). */
let __kanvasUkur;
function measureTextWidth(el, text, gaya) {
  if (__kanvasUkur === undefined) __kanvasUkur = document.createElement("canvas").getContext("2d");
  if (!__kanvasUkur) return 0;
  const cs = gaya || getComputedStyle(el);
  const k = __kanvasUkur;
  k.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ("letterSpacing" in k) k.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
  const teks = String(text || "");
  return k.measureText(cs.textTransform === "uppercase" ? teks.toUpperCase() : cs.textTransform === "lowercase" ? teks.toLowerCase() : teks).width;
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
