"use strict";

/* FORMAT ANGKA STANDAR PIB (requirement G) + normalisasi HS Code + */

// Angka -> teks gaya PIB
function fmtPibNumber(n, maxDecimals) {
  const dec = maxDecimals == null ? 4 : maxDecimals;
  let num = Number(n);
  if (!isFinite(num) || num === 0) return "";
  // toFixed dulu supaya pembulatan konsisten, baru buang nol di belakang koma desimal
  let s = num.toFixed(dec);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [intPart, decPart] = s.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (decPart ? "." + decPart : "");
}

/* HS CODE (requirement A) */
/* HS Code Indonesia (BTKI) panjangnya 8 digit.

   Dokumen dari luar kerap menulis 10 digit — invoice Korea memakai
   bentuk 6903.10-0000, yang setelah dibersihkan jadi 6903100000. Dua
   digit terakhirnya subpos negara asal, bukan bagian dari BTKI.

   Dipotong DI SINI, satu tempat, supaya kolomnya konsisten dari mana
   pun datangnya — hasil ekstraksi maupun ketikan tangan. */
const HS_CODE_DIGITS = 8;

function normalizeHsCodeInput(v) {
  return String(v == null ? "" : v)
    .replace(/\D/g, "")
    .slice(0, HS_CODE_DIGITS);
}

/* TURUNAN TANGGAL DARI PDF PIB (requirement A) */
function addDaysISO(iso, days) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* BRUTO: TOTAL SAJA, DITARUH DI SATU BARANG */
function applyTotalBrutoToFirstItem(items, totalBruto) {
  if (!items || !items.length) return items;
  /* Kalau Packing List sudah menyebut bruto TIAP barang, biarkan.

     Fungsi ini untuk templat yang hanya memberi satu angka total —
     ditumpuk ke barang pertama supaya jumlahnya tetap benar. Kalau
     dipakai juga saat rinciannya ada, berat tiap barang hilang: yang
     pertama jadi total, sisanya nol. */
  if (items.some((it) => Number(it.bruto) > 0)) return items;

  let total = Number(totalBruto);
  // Kalau total dari dokumen tidak diketahui
  if (!isFinite(total) || total <= 0) {
    total = items.reduce((sum, it) => sum + (Number(it.bruto) || 0), 0);
  }
  items.forEach((it, i) => {
    it.bruto = i === 0 ? roundNum(total, 4) : 0;
  });
  return items;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    fmtPibNumber,
    applyTotalBrutoToFirstItem,
    normalizeHsCodeInput,
    addDaysISO,
  };
}
