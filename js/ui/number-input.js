"use strict";

/* ANGKA BERPEMISAH RIBUAN SAAT DIKETIK */

/* PEMBACA ANGKA UNTUK KOTAK ISIAN APLIKASI SENDIRI

   Aturannya PASTI, bukan tebakan: koma = pemisah ribuan, titik =
   pemisah desimal. Itu memang satu-satunya bentuk yang pernah ditulis
   aplikasi ini — formatNumberValue(11319) selalu "11,319" dan
   formatNumberValue(1.05) selalu "1.05".

   parseLooseNumber di bawah menebak, dan tebakannya SELALU salah untuk
   bentuk itu ketika titiknya diikuti tepat tiga angka:

     "1.050"   dibaca 1050    seharusnya 1,05    (berat 1,05 kg jadi 1 ton)
     "11.319"  dibaca 11319   seharusnya 11,319
     "60.000"  dibaca 60000   seharusnya 60

   Tebakan itu ada karena berkas CIPL/PDF dari luar bisa memakai
   bentuk Eropa ("1.234,56"). Itu alasan yang sah — untuk teks yang
   datang dari berkas orang lain. Untuk kotak yang bentuknya ditulis
   aplikasi ini sendiri, tidak ada yang perlu ditebak, dan menebak
   berarti sesekali salah seribu kali lipat.

   Karena itu dua pembaca, bukan satu yang dipaksa melayani keduanya:
   yang ini untuk isian pengguna, parseLooseNumber untuk hasil impor. */
function parseInputNumber(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/,/g, "");   // koma = ribuan, dibuang
  if (!s) return 0;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

/* PEMBACA ANGKA SERBAGUNA — untuk teks dari berkas luar (CIPL/PDF/Excel),
   yang bentuknya tidak kita kendalikan. Menebak koma vs titik dari
   susunan angkanya. */
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
