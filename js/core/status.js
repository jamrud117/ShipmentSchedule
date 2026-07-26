"use strict";

/* ==================================================================
   STATUS MODEL PER SECTION
   Sebelumnya SEMUA status (process/transit/arrived/delayed) berlaku di
   dua section sekaligus. Sesuai requirement D:
     - Jadwal Import : PROCESS, DELAY, ARRIVED
     - Jadwal Export : PROCESS, DELAY, DELIVERED
   ARRIVED tidak boleh muncul di Export, DELIVERED tidak boleh muncul di
   Import. Karena keduanya sama-sama berarti "sudah selesai", di database
   dua-duanya tetap disimpan sebagai key yang SAMA ("arrived") — cuma
   LABEL-nya yang beda per mode (lihat statusLabel()). Ini disengaja
   supaya data lama tidak perlu dimigrasi & seluruh logika lain yang
   sudah memakai s.status === "arrived" (kartu collapsed, grouping,
   Report) tidak perlu diubah sama sekali.

   Status "transit" (IN TRANSIT) dari versi lama TIDAK lagi ditawarkan di
   dropdown, tapi tetap dikenali kalau ada di data lama — supaya baris
   yang terlanjur tersimpan tidak jadi tanpa label.
================================================================== */

const STATUS_OPTIONS_BY_MODE = {
  import: ["process", "delayed", "arrived"],
  export: ["process", "delayed", "arrived"],
};

// Label per key, dibedakan per mode HANYA untuk "arrived".
function statusLabel(statusKey, mode) {
  const m = mode || activeMode;
  if (statusKey === "arrived") return m === "export" ? "DELIVERED" : "ARRIVED";
  if (statusKey === "delayed") return "DELAY";
  if (statusKey === "transit") return "IN TRANSIT";
  return "PROCESS";
}

function statusClass(statusKey) {
  return (STATUS_META[statusKey] || STATUS_META.process).class;
}

// Nilai kolom STATUS di template copy Daily Import/Daily Export
// (requirement E): PROCESS -> "PROCESS"; ARRIVED (import) & DELIVERED
// (export) -> "COMPLETED". DELAY dikirim apa adanya sebagai "DELAY".
function statusTemplateValue(statusKey) {
  if (statusKey === "arrived") return "COMPLETED";
  if (statusKey === "delayed") return "DELAY";
  if (statusKey === "transit") return "IN TRANSIT";
  return "PROCESS";
}

// Daftar <option> dropdown status, hanya yang berlaku di mode ini.
// `current` diikutkan walau tidak ada di daftar (data lama berstatus
// "transit") supaya nilainya tidak diam-diam berubah saat form dibuka.
function statusOptionsHtml(mode, current) {
  const keys = STATUS_OPTIONS_BY_MODE[mode] || STATUS_OPTIONS_BY_MODE.import;
  const list = keys.includes(current) || !current ? keys : [...keys, current];
  return list
    .map(
      (k) =>
        `<option value="${k}" ${k === current ? "selected" : ""}>${statusLabel(k, mode)}</option>`,
    )
    .join("");
}

/* ------------------------------------------------------------------
   DELAY (requirement D)

   ARAH PERHITUNGAN (diperbaiki):
     ETD & ETA di date-strip = jadwal ASLI/rencana semula. Field ini
     TIDAK ditimpa saat terjadi delay, supaya rencana awalnya tetap
     tercatat sebagai pembanding.
     `etdUpdate` & `etaUpdate` = TANGGAL UPDATE DELAY, yaitu jadwal baru
     hasil pemunduran.

   Jadi lama delay = TANGGAL UPDATE dikurangi jadwal asli, dan hasilnya
   dibaca sebagai "+N hari dari ETA/ETD".

   Versi sebelumnya menamai kedua field ini "ETA/ETD Awal" dan menghitung
   ke arah SEBALIKNYA (jadwal sekarang dikurangi jadwal awal). Karena
   yang sebenarnya diisi user di situ adalah tanggal BARU, hasilnya
   selalu bertanda minus ("-5 HARI") padahal maksudnya mundur 5 hari —
   membingungkan dan berlawanan arti. Penamaan & arah hitungnya kini
   disamakan dengan cara kerja sehari-hari.

   Delay tetap bisa dihitung dari ETA MAUPUN ETD — dua-duanya punya
   field update sendiri dan boleh diisi salah satu saja.
------------------------------------------------------------------ */

// Selisih hari: tanggal acuan -> tanggal pembanding.
// Positif = pembanding lebih BELAKANGAN (mundur/delay).
// null kalau salah satu tanggal kosong/tidak valid.
function delayDaysBetween(baselineDate, currentDate) {
  if (!baselineDate || !currentDate) return null;
  const a = parseLocalDate(baselineDate);
  const b = parseLocalDate(currentDate);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

// Lama delay 1 pengiriman = tanggal update - jadwal asli.
// ETA diprioritaskan (itu yang dipakai kartu dashboard); kalau yang
// diisi user cuma pasangan ETD, dipakai ETD.
function shipmentDelayInfo(s) {
  const byEta = delayDaysBetween(s.eta, s.etaUpdate);
  if (byEta != null)
    return { days: byEta, basis: "ETA", from: s.eta, to: s.etaUpdate };
  const byEtd = delayDaysBetween(s.etd, s.etdUpdate);
  if (byEtd != null)
    return { days: byEtd, basis: "ETD", from: s.etd, to: s.etdUpdate };
  return null;
}

/* ------------------------------------------------------------------
   TANGGAL EFEKTIF

   Setelah ada TANGGAL UPDATE DELAY, tiap pengiriman punya DUA tanggal:
   rencana semula (etd/eta) dan jadwal terbaru (etdUpdate/etaUpdate).
   Untuk keperluan OPERASIONAL — urutan kartu, pengelompokan tanggal,
   penanda "berangkat hari ini" — yang relevan adalah jadwal TERBARU,
   karena itulah yang benar-benar akan terjadi. Rencana semula tetap
   disimpan & ditampilkan sebagai pembanding, bukan sebagai acuan urutan.

   Tanpa ini, pengiriman yang mundur 5 hari tetap duduk di posisi jadwal
   lamanya sehingga urutan kartu tidak mencerminkan kenyataan.
------------------------------------------------------------------ */
function effectiveEta(s) {
  return (s && (s.etaUpdate || s.eta)) || "";
}
function effectiveEtd(s) {
  return (s && (s.etdUpdate || s.etd)) || "";
}

// Teks badge di sebelah label field update, mis. "+5 hari dari ETA".
function delayDeltaLabel(baselineDate, updateDate, basis) {
  const d = delayDaysBetween(baselineDate, updateDate);
  if (d == null) return "";
  if (d > 0) return `+${d} hari dari ${basis}`;
  if (d < 0) return `${Math.abs(d)} hari lebih cepat`;
  return `sama dengan ${basis}`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STATUS_OPTIONS_BY_MODE,
    statusTemplateValue,
    delayDaysBetween,
  };
}
