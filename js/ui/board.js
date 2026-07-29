"use strict";

/* PAPAN — model kemendesakan & token hitung mundur */

// Selisih hari dari HARI INI ke sebuah tanggal ISO
function daysFromToday(iso) {
  if (!iso) return null;
  const a = parseLocalDate(todayISO());
  const b = parseLocalDate(iso);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/* Satu pengiriman -> keadaan papannya */
function boardState(s) {
  const basis = sortBasis() === "etd" ? "ETD" : "ETA";
  const iso = basis === "ETD" ? effectiveEtd(s) : effectiveEta(s);

  if (isArrived(s)) {
    return { kind: "done", days: null, iso, basis, label: "Selesai" };
  }
  const d = daysFromToday(iso);
  if (d == null) {
    return { kind: "none", days: null, iso: "", basis, label: "Tanpa tgl" };
  }
  if (d < 0) {
    return { kind: "late", days: d, iso, basis, label: `Telat ${Math.abs(d)}h` };
  }
  if (d === 0) {
    return { kind: "today", days: 0, iso, basis, label: "Hari ini" };
  }
  return { kind: "future", days: d, iso, basis, label: `H-${d}` };
}

/* KELENGKAPAN DOKUMEN */
const REQUIRED_DOC_FIELDS = [
  { key: "docNo", label: "No. dokumen pabean" },
  { key: "noAju", label: "No. Aju" },
  { key: "invoice", label: "No. Invoice" },
];

function missingDocs(s) {
  return REQUIRED_DOC_FIELDS.filter(
    (f) => !hasMeaningfulValue(s[f.key]),
  ).map((f) => f.label);
}
function hasMissingDocs(s) {
  return !isArrived(s) && missingDocs(s).length > 0;
}

// "Perlu tindakan" = satu definisi, dipakai metrik, chip, dan halaman Ringkasan
function needsAction(s) {
  if (isArrived(s)) return false;
  if (s.status === "delayed") return true;
  const st = boardState(s);
  return st.kind === "late";
}

/* Tanggal panjang untuk kepala papan, mis */
function fmtDateBoard(iso) {
  const dt = parseLocalDate(iso || todayISO());
  if (!dt) return "—";
  return dt.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Isi semua penanda "hari ini" di seluruh halaman sekaligus.
function paintTodayStamps() {
  const teks = fmtDateBoard(todayISO());
  ["#boardToday", "#ovToday", "#docnumToday", "#accountToday"].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = teks;
  });
  const stamp = $("#footerStamp");
  if (stamp) stamp.textContent = teks;
}
