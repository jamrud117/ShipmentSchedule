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
/* BERKAS YANG BELUM TERKUMPUL, dibaca dari Progres Dokumen.

   Sumbernya TAHAPAN STEPPER (CI/PL, BL, COO, Manifest, PIB, Billing,
   SPPB, ATA), bukan kolom isian seperti No. Aju atau No. Invoice.
   Alasannya: nomor-nomor itu cuma catatan administratif yang menyusul
   sendiri, sementara tahapan stepper adalah berkas yang benar-benar
   harus diurus dan menghambat barang kalau tertinggal. "Belum ada
   COO, PIB, SPPB" memberi tahu apa yang harus dikejar; "belum ada No.
   Aju" tidak.

   Tahap yang DILEWATI (skipped) tidak dihitung -- berkasnya memang
   tidak ada dalam pengiriman ini, jadi bukan sesuatu yang tertinggal.
   Tahap opsional ikut dilaporkan: COO sering wajib bagi pembeli walau
   bukan syarat kepabeanan. */
function missingDocs(s) {
  if (typeof docStepsFor !== "function") return [];
  const p = typeof docProgressOf === "function" ? docProgressOf(s) : {};
  return docStepsFor(s)
    .filter((st) => {
      const e = p[st.key];
      if (e) return false;
      // Tahap kedatangan (ATA) bukan berkas -- tidak ada yang bisa "diurus".
      return st.key !== "berth";
    })
    .map((st) => (typeof stepText === "function" ? stepText(st.label, s) : st.label));
}
// "Perlu tindakan" = satu definisi, dipakai metrik, saringan cepat, dan halaman Ringkasan
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
  ["#boardToday", "#ovToday", "#docnumToday", "#accountToday", "#hsCodeToday"].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = teks;
  });
  const stamp = $("#footerStamp");
  if (stamp) stamp.textContent = teks;
}
