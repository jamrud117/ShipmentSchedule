"use strict";

/* ==================================================================
   FORMAT ANGKA STANDAR PIB (requirement G) + normalisasi HS Code +
   aturan turunan tanggal ETD/ETA/Actual (requirement A).

   Aturan angka PIB:
     - pemisah ribuan = koma (,)
     - pemisah desimal = titik (.)
     - kalau semua digit di belakang titik desimal NOL (mis. 3800.0000),
       bagian desimalnya TIDAK ditampilkan sama sekali -> "3,800"
   Contoh: 3800.0000 -> "3,800" · 4120.5 -> "4,120.5" ·
           118683107.27 -> "118,683,107.27" · 0 -> ""
================================================================== */

// Angka -> teks gaya PIB. `maxDecimals` membatasi presisi (default 4,
// sama dengan presisi berat/qty di dokumen PIB itu sendiri). Nol
// dikembalikan sebagai "" karena SELURUH template copy memang
// mengosongkan sel bernilai 0 (lihat clipboardFormatter.num lama &
// requirement D soal Bulk Import: "kalau ada data bernilai 0, tampilkan
// kosong saja").
function fmtPibNumber(n, maxDecimals) {
  const dec = maxDecimals == null ? 4 : maxDecimals;
  let num = Number(n);
  if (!isFinite(num) || num === 0) return "";
  // toFixed dulu supaya pembulatan konsisten, baru buang nol di
  // belakang koma desimal ("3800.0000" -> "3800", "4120.50" -> "4120.5").
  let s = num.toFixed(dec);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [intPart, decPart] = s.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (decPart ? "." + decPart : "");
}

/* ------------------------------------------------------------------
   HS CODE (requirement A)
   "Saat HS Code diinput (baik dari hasil ekstraksi otomatis maupun saat
   user paste manual ke field), hilangkan tanda '.' dan '-' sehingga
   hanya angkanya saja yang tersimpan."
   Semua karakter non-digit dibuang (bukan cuma titik & strip) — spasi &
   karakter nyasar dari hasil copy-paste PDF ikut hilang sekalian.
------------------------------------------------------------------ */
function normalizeHsCodeInput(v) {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

/* ------------------------------------------------------------------
   TURUNAN TANGGAL DARI PDF PIB (requirement A)
     ETD  = tanggal Master BL/AWB (fallback: House BL/AWB kalau Master
            tidak ada — ketemu nyata di beberapa PIB laut yang cuma
            mencantumkan satu B/L)
     ETA  = laut : ETD + 7 hari
            udara: SAMA dengan ETD (hari yang sama)
     Actual Delivery = ETA + 3 hari (berlaku laut MAUPUN udara)
------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------
   BRUTO: TOTAL SAJA, DITARUH DI SATU BARANG

   Dokumen sumber (PIB field 29, PEB field 45, dan baris TOTAL di Packing
   List) hanya mencantumkan berat kotor TOTAL satu pengiriman — berat
   kotor per barang memang tidak ada, karena beberapa barang berbagi satu
   kemasan yang sama.

   Versi sebelumnya membagi total itu PROPORSIONAL sesuai porsi netto tiap
   barang. Hasilnya angka pecahan yang kelihatan presisi padahal cuma
   hasil bagi (mis. 430.0755 / 716.7925 / 383.0189), dan gampang
   disalahartikan sebagai timbangan asli per barang. Sesuai permintaan,
   sekarang total dipasang APA ADANYA di barang PERTAMA dan barang
   lainnya 0 — jumlah totalnya tetap sama persis dengan dokumen, tanpa
   mengarang angka per barang.
------------------------------------------------------------------ */
function applyTotalBrutoToFirstItem(items, totalBruto) {
  if (!items || !items.length) return items;
  let total = Number(totalBruto);
  // Kalau total dari dokumen tidak diketahui, pakai jumlah bruto per
  // barang yang sempat terbaca (mis. Packing List yang mencantumkan G.W.
  // per baris) — tetap satu angka total, bukan tersebar.
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
