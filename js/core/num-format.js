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
function normalizeHsCodeInput(v) {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

/* TURUNAN TANGGAL DARI PDF PIB (requirement A) */
function addDaysISO(iso, days) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function deriveEtaFromEtd(etd, transport) {
  if (!etd) return "";
  return transport === "udara" ? etd : addDaysISO(etd, 7);
}

function deriveActualFromEta(eta) {
  return eta ? addDaysISO(eta, 3) : "";
}

/* BRUTO: TOTAL SAJA, DITARUH DI SATU BARANG */
function applyTotalBrutoToFirstItem(items, totalBruto) {
  if (!items || !items.length) return items;
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
    deriveEtaFromEtd,
    deriveActualFromEta,
  };
}
