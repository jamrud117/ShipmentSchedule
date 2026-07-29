"use strict";

/* ANGKA BERPEMISAH RIBUAN SAAT DIKETIK */

/* PEMBACA ANGKA SERBAGUNA */
function parseLooseNumber(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;
  const negatif = /^-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return 0;

  const iKoma = s.lastIndexOf(",");
  const iTitik = s.lastIndexOf(".");
  let posDesimal = -1;

  if (iKoma > -1 && iTitik > -1) {
    posDesimal = Math.max(iKoma, iTitik);
  } else if (iKoma > -1) {
    posDesimal = /^\d{1,3}(,\d{3})+$/.test(s) ? -1 : iKoma;
  } else if (iTitik > -1) {
    posDesimal = /^\d{1,3}(\.\d{3})+$/.test(s) ? -1 : iTitik;
  }

  let bagianBulat = posDesimal > -1 ? s.slice(0, posDesimal) : s;
  let bagianDesimal = posDesimal > -1 ? s.slice(posDesimal + 1) : "";
  bagianBulat = bagianBulat.replace(/[.,]/g, "");
  bagianDesimal = bagianDesimal.replace(/[.,]/g, "");

  const n = Number(
    (bagianBulat || "0") + (bagianDesimal ? "." + bagianDesimal : ""),
  );
  if (!isFinite(n)) return 0;
  return negatif ? -n : n;
}

/* PEMBENTUK TAMPILAN */
function formatNumberTyping(raw) {
  let s = String(raw == null ? "" : raw);
  const negatif = /^\s*-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return negatif ? "-" : "";

  // Koma diperlakukan sebagai pemisah ribuan (hasil format kita sendiri)
  s = s.replace(/,/g, "");

  // Titik desimal: hanya yang PERTAMA yang dihitung
  const potong = s.split(".");
  let bulat = potong.shift() || "";
  const adaTitik = potong.length > 0;
  let desimal = potong.join("");

  bulat = bulat.replace(/^0+(?=\d)/, ""); // buang nol di depan
  const berkelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  let hasil = berkelompok;
  if (adaTitik) hasil += "." + desimal; // titik dipertahankan walau desimal masih kosong
  return (negatif ? "-" : "") + hasil;
}

// Angka -> tampilan untuk mengisi kotak dari data (bukan dari ketikan)
function formatNumberValue(n) {
  const x = Number(n);
  if (!isFinite(x) || x === 0) return "";
  return formatNumberTyping(String(x));
}

/* PENJAGA POSISI KURSOR */
function hitungDigitSebelum(teks, posisi) {
  return (String(teks).slice(0, posisi).match(/[\d.]/g) || []).length;
}
function posisiSetelahDigitKe(teks, jumlahDigit) {
  if (jumlahDigit <= 0) return 0;
  let n = 0;
  for (let i = 0; i < teks.length; i++) {
    if (/[\d.]/.test(teks[i])) {
      n++;
      if (n === jumlahDigit) return i + 1;
    }
  }
  return teks.length;
}

// Selektor semua isian yang diberlakukan format ini.
const NUMBER_INPUT_SELECTOR = [
  "[data-num]",
  '[data-dn-number]',
  'table.item-table input[data-f="qty"]',
  'table.item-table input[data-f="harga"]',
  'table.item-table input[data-f="netto"]',
  'table.item-table input[data-f="bruto"]',
].join(", ");

function applyLiveNumberFormat(el) {
  if (!el || el.readOnly || el.disabled) return;
  const sebelum = el.value;
  const kursor = el.selectionStart;
  const digitKiri = hitungDigitSebelum(sebelum, kursor);
  const sesudah = formatNumberTyping(sebelum);
  if (sesudah === sebelum) return;
  el.value = sesudah;
  // Hanya kotak teks biasa yang punya selectionStart
  try {
    const posBaru = posisiSetelahDigitKe(sesudah, digitKiri);
    el.setSelectionRange(posBaru, posBaru);
  } catch (err) {
    /* abaikan — kotak yang tidak mendukung pengaturan kursor */
  }
}

// Satu pendengar untuk seluruh halaman: isian yang dibuat belakangan (baris barang baru
document.addEventListener("input", (e) => {
  const el = e.target.closest(NUMBER_INPUT_SELECTOR);
  if (el) applyLiveNumberFormat(el);
});

// Rapikan sekali lagi saat kotak ditinggalkan
document.addEventListener(
  "blur",
  (e) => {
    const el = e.target.closest && e.target.closest(NUMBER_INPUT_SELECTOR);
    if (!el || el.readOnly || el.disabled) return;
    const bersih = el.value.replace(/\.$/, "");
    if (bersih !== el.value) el.value = bersih;
  },
  true,
);

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseLooseNumber, formatNumberTyping, formatNumberValue };
}
