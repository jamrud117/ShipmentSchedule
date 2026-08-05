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

/* ETA & Estimated Delivery turunan dari PDF PIB.

   Keduanya menumpang mesin prediksi supaya berkas yang diimpor memakai
   asumsi yang PERSIS SAMA dengan yang dipakai di layar — satu sumber
   angka, bukan dua yang perlahan berbeda.

   JANGAN menuliskan aturan cadangan sendiri di sini. Aturan yang
   ditulis mati (mis. "laut = ETD + 7 hari") tidak membedakan FCL dari
   LCL, tidak tahu rutenya dari mana, dan menghitung akhir pekan sebagai
   hari kerja.

   `ctx` boleh berisi field apa pun dari sebuah pengiriman (muatan,
   origin, destination, routeType, forwarder); makin lengkap, makin
   tepat aturan yang terpilih. */
function deriveEtaFromEtd(etd, transport, ctx) {
  if (!etd) return "";
  if (typeof predictEta === "function") {
    const p = predictEta(Object.assign({}, ctx || {}, { etd, transport }));
    if (p.ok && p.eta) return p.eta;
  }
  return etd;
}

function deriveActualFromEta(eta, ctx) {
  if (!eta) return "";
  if (typeof predictDelivery === "function") {
    /* factoryDate & docProgress sengaja dibuang: berkas yang baru
       diimpor belum punya milestone apa pun, dan membawa serta sisa
       data dari pemanggil hanya akan membuat hasilnya tidak terduga. */
    const src = Object.assign({}, ctx || {}, { eta, etaMode: "auto" });
    delete src.factoryDate;
    delete src.docProgress;
    delete src.etaUpdate;
    const d = predictDelivery(src);
    if (d.ok && d.date) return d.date;
  }
  return eta;
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
    deriveEtaFromEtd,
    deriveActualFromEta,
  };
}
