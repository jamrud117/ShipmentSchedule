"use strict";

/* ==================================================================
   PAPAN — model kemendesakan & token hitung mundur

   Ini penambahan konseptual utama redesain ini.

   Sebelumnya setiap tanggal ditampilkan mentah ("28 Jul 2026") dan
   pengguna menghitung sendiri di kepala, berkali-kali per menit,
   apakah itu besok atau minggu depan atau sudah lewat. Perhitungan
   itu sekarang dikerjakan sekali di sini dan dipakai bersama oleh
   tampilan Manifes, Kartu, halaman Ringkasan, dan saringan cepat —
   jadi "H-3" berarti hal yang persis sama di mana pun ia muncul.

   Acuannya SELALU tanggal efektif (lihat effectiveEta/effectiveEtd
   di core/status.js): kalau jadwal sudah dimundurkan, yang dihitung
   adalah tanggal barunya, bukan rencana semula.
================================================================== */

// Selisih hari dari HARI INI ke sebuah tanggal ISO.
// Negatif = sudah lewat. null = tanggalnya kosong/tidak valid.
function daysFromToday(iso) {
  if (!iso) return null;
  const a = parseLocalDate(todayISO());
  const b = parseLocalDate(iso);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/* ------------------------------------------------------------------
   Satu pengiriman -> keadaan papannya.

   kind:
     done   selesai (ARRIVED/DELIVERED) — tidak perlu dipantau lagi
     late   sudah lewat tanggalnya tapi belum selesai
     today  jatuh hari ini
     future masih akan datang
     none   tanggalnya belum diisi sama sekali
------------------------------------------------------------------ */
function boardState(s) {
  const basis = sortBasis() === "etd" ? "ETD" : "ETA";
  const iso = basis === "ETD" ? effectiveEtd(s) : effectiveEta(s);

  if (s.status === "arrived") {
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

// Token papan. `withBasis` menambahkan penanda kecil ETA/ETD supaya
// jelas hitung mundurnya mengacu ke apa — hanya dipakai di tampilan
// Manifes, di mana kolom ETD & ETA berdiri berdampingan.
function boardTokenHtml(s, withBasis) {
  const st = boardState(s);
  const cls =
    st.kind === "done"
      ? "done"
      : st.kind === "late"
        ? "late"
        : st.kind === "today"
          ? "today"
          : st.kind === "none"
            ? "none"
            : "future";
  const basis =
    withBasis && st.kind !== "done" && st.kind !== "none"
      ? `<span class="board-token-basis">${st.basis}</span>`
      : "";
  return `<span class="board-token board-token--${cls}" title="${escapeAttr(boardTokenTitle(st))}">${escapeHtml(st.label)}${basis}</span>`;
}

function boardTokenTitle(st) {
  if (st.kind === "done") return "Pengiriman sudah selesai";
  if (st.kind === "none") return "Tanggal belum diisi";
  const tgl = fmtDate(st.iso);
  if (st.kind === "late")
    return `${st.basis} ${tgl} — sudah lewat ${Math.abs(st.days)} hari dan belum ditandai selesai`;
  if (st.kind === "today") return `${st.basis} jatuh hari ini (${tgl})`;
  return `${st.basis} ${tgl} — ${st.days} hari lagi`;
}

/* ------------------------------------------------------------------
   KELENGKAPAN DOKUMEN

   "Dokumen kurang" bukan tebakan: yang dicek adalah bidang yang
   memang WAJIB ada sebelum barang bisa dikeluarkan/dimuat —
   nomor dokumen pabean (SPPB/PEB), No. Aju, dan invoice. Dipakai
   oleh saringan cepat & halaman Ringkasan supaya keduanya tidak
   bisa berbeda pendapat.
------------------------------------------------------------------ */
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
  return s.status !== "arrived" && missingDocs(s).length > 0;
}

// "Perlu tindakan" = satu definisi, dipakai metrik, chip, dan
// halaman Ringkasan. Tanpa definisi bersama, angka di tiga tempat
// itu pasti akan berbeda cepat atau lambat.
function needsAction(s) {
  if (s.status === "arrived") return false;
  if (s.status === "delayed") return true;
  const st = boardState(s);
  return st.kind === "late";
}

/* ------------------------------------------------------------------
   Tanggal panjang untuk kepala papan, mis. "Senin, 27 Juli 2026".
------------------------------------------------------------------ */
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
  ["#boardToday", "#ovToday", "#docnumToday"].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = teks;
  });
  const stamp = $("#footerStamp");
  if (stamp) stamp.textContent = teks;
}
