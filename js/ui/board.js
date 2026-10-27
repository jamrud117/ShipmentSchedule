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
    return { kind: "done", days: null, iso, basis, label: tt("Selesai", "Done") };
  }
  const d = daysFromToday(iso);
  if (d == null) {
    return { kind: "none", days: null, iso: "", basis, label: tt("Tanpa tgl", "No date") };
  }
  if (d < 0) {
    return { kind: "late", days: d, iso, basis, label: tt(`Telat ${Math.abs(d)}h`, `${Math.abs(d)}d late`) };
  }
  if (d === 0) {
    return { kind: "today", days: 0, iso, basis, label: tt("Hari ini", "Today") };
  }
  return { kind: "future", days: d, iso, basis, label: tt(`H-${d}`, `D-${d}`) };
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
   Termasuk E-COO yang ikut tidak dipakai karena COO-nya tidak dipakai
   (docStepEntri, doc-steps.js). Tahap opsional ikut dilaporkan: COO
   sering wajib bagi pembeli walau bukan syarat kepabeanan. */
function missingDocs(s) {
  if (typeof docStepsFor !== "function") return [];
  return docStepsFor(s)
    // Tahap kedatangan (ATA) bukan berkas -- tidak ada yang bisa "diurus".
    .filter((st) => st.key !== "berth" && !docStepEntri(s, st))
    .map((st) => stepText(st.label, s))
    /* PI / LS yang wajib menurut barangnya (lartas per HS Code, barang
       bukan baru -- core/lartas.js) tapi belum bernomor di jadwal juga
       berkas yang harus dikejar, walau bukan tahap stepper. */
    .concat(typeof lartasKurang === "function" ? lartasKurang(s).map((k) => tt(`${k} (lartas)`, `${k} (restricted)`)) : []);
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
  return tanggalLokal(dt, activeLang === "en" ? "en-GB" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Isi semua penanda "hari ini" di seluruh halaman sekaligus.
function paintTodayStamps() {
  const teks = fmtDateBoard(todayISO());
  ["#boardToday", "#ovToday", "#docnumToday", "#accountToday", "#hsCodeToday", "#mstToday", "#cekToday"].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = teks;
  });
  const stamp = $("#footerStamp");
  if (stamp) stamp.textContent = teks;
}
