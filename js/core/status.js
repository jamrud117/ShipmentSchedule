"use strict";

/* STATUS MODEL PER SECTION */

const STATUS_OPTIONS_BY_MODE = {
  import: ["process", "delayed", "arrived"],
  export: ["process", "delayed", "arrived"],
};

/* Filter status yang dipakai saat halaman baru dibuka, di kedua buku.

   Alasannya: yang dikerjakan sehari-hari adalah kiriman yang masih
   berjalan. Membuka halaman ke "Semua Status" berarti daftar teratas
   penuh kiriman yang sudah selesai, dan yang perlu ditindak justru
   terdorong ke bawah.

   Bukan berarti saringannya disembunyikan — catatan "disaring: status
   Process" tetap muncul di atas daftar, supaya jelas kenapa ada
   kiriman yang tidak terlihat. */
const FILTER_STATUS_DEFAULT = "process";

// Label per key, dibedakan per mode HANYA untuk "arrived".
function statusLabel(statusKey, mode) {
  const m = mode || activeMode;
  if (statusKey === "arrived") return m === "export" ? "Delivered" : "Arrived";
  if (statusKey === "delayed") return "Delay";
  if (statusKey === "transit") return "In transit";
  return "Process";
}

function statusClass(statusKey) {
  return (STATUS_META[statusKey] || STATUS_META.process).class;
}

// Nilai kolom STATUS di template copy Daily Import/Daily Export (requirement E)
function statusTemplateValue(statusKey) {
  if (statusKey === "arrived") return "COMPLETED";
  if (statusKey === "delayed") return "DELAY";
  if (statusKey === "transit") return "IN TRANSIT";
  return "PROCESS";
}

// Daftar <option> dropdown status, hanya yang berlaku di mode ini
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

/* DELAY (requirement D) */

// Selisih hari: tanggal acuan -> tanggal pembanding
function delayDaysBetween(baselineDate, currentDate) {
  if (!baselineDate || !currentDate) return null;
  const a = parseLocalDate(baselineDate);
  const b = parseLocalDate(currentDate);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

// Lama delay 1 pengiriman = tanggal update - jadwal asli
function shipmentDelayInfo(s) {
  const byEta = delayDaysBetween(s.eta, s.etaUpdate);
  if (byEta != null)
    return { days: byEta, basis: "ETA", from: s.eta, to: s.etaUpdate };
  const byEtd = delayDaysBetween(s.etd, s.etdUpdate);
  if (byEtd != null)
    return { days: byEtd, basis: "ETD", from: s.etd, to: s.etdUpdate };
  return null;
}

/* TANGGAL EFEKTIF */
function effectiveEta(s) {
  return (s && (s.etaUpdate || s.eta)) || "";
}
function effectiveEtd(s) {
  return (s && (s.etdUpdate || s.etd)) || "";
}

// Teks badge di sebelah label field update, mis
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


/* ------------------------------------------------------------------
   KAPAN SEBUAH PENGIRIMAN DIANGGAP TIBA

   ETA adalah perkiraan tiba di TERMINAL / BANDARA — barangnya belum
   sampai pabrik. Yang menandai pengiriman benar-benar selesai adalah
   ACTUAL DELIVERY: tanggal barang masuk pabrik.

   Jadi sebuah jadwal dianggap tiba kalau salah satu terpenuhi:
     - tanggal Actual Delivery sudah diisi DAN hari ini sudah mencapainya
     - statusnya memang sudah ditandai ARRIVED secara manual

   Dipakai bersama oleh papan, jalur progres, metrik, saringan, dan
   halaman Ringkasan supaya semuanya sepakat.
------------------------------------------------------------------ */
/* Kolom tanggal yang SEDANG membuat jadwal ini terbaca tiba.

   Dikembalikan sebagai daftar, bukan cuma benar/salah, karena yang
   membatalkan status tiba harus mengosongkan kolom YANG BENAR. Dulu
   pemanggilnya menebak sendiri: di buku Export ia mengosongkan
   `actual` (berlabel "Stuffing") padahal yang menentukan ETD. Tanggal
   Stuffing hilang, statusnya melompat balik ke Delivered, dan
   pesannya tetap bilang berhasil.

   Daftar kosong berarti statusnya cuma tersimpan di kolom status —
   bebas diubah tanpa mengorbankan tanggal apa pun.

   IMPORT — yang menentukan tanggal IN FACTORY.

     Kolom `actual` di buku Import berlabel "Estimated Delivery": itu
     PERKIRAAN, dan perkiraan yang terlewati tidak berarti barangnya
     sudah sampai. Yang menyatakan barang benar-benar diterima cuma
     tanggal masuk pabrik.

   EXPORT — yang menentukan ETD. Barang dinyatakan terkirim begitu
     alat angkutnya BERANGKAT, bukan begitu stuffing selesai: muatan
     yang sudah naik ke kontainer tapi kapalnya belum berlayar masih
     ada di tangan kita. Revisi ETD menang atas jadwal rencana.

   factoryDate hanya berlaku di buku IMPORT. Di Export kolom itu
   berlabel "Tanggal Stuffing" juga — kolom lama yang kini digantikan
   `actual`, dan sudah disembunyikan dari form, tapi datanya masih ada
   pada jadwal lama. Selama ia ikut diperiksa untuk Export,
   membatalkan status tiba tidak pernah berhasil. */
function kolomPenyebabTiba(s) {
  if (!s) return [];
  const kini = parseLocalDate(todayISO());
  if (!kini) return [];
  const sudahLewat = (v) => {
    const d = parseLocalDate(v);
    return !!(d && kini >= d);
  };

  if (s.mode === "export") {
    if (!sudahLewat(s.etdUpdate || s.etd)) return [];
    /* Keduanya dikembalikan supaya pengosongan tidak menyisakan
       jadwal rencana yang langsung menandainya tiba lagi. Yang memang
       sudah kosong tidak ikut disebut. */
    return ["etdUpdate", "etd"].filter((k) => s[k]);
  }

  return sudahLewat(s.factoryDate) ? ["factoryDate"] : [];
}

function isArrived(s) {
  if (!s) return false;
  /* Sengaja lewat kolomPenyebabTiba() supaya aturan tanggalnya hanya
     ada di SATU tempat. Dua salinan aturan ini pernah bercabang, dan
     akibatnya baru terlihat sebagai status yang tidak bisa diubah. */
  if (kolomPenyebabTiba(s).length) return true;
  return s.status === "arrived";
}

/* Status yang ditampilkan. Berbeda dari s.status hanya pada satu hal:
   begitu tanggal Actual Delivery terlewati, jadwalnya tampil ARRIVED
   walau dropdown-nya belum diubah. */
function effectiveStatus(s) {
  return isArrived(s) ? "arrived" : s.status;
}

/* Jadwal yang sudah lewat tanggal Actual Delivery tapi statusnya masih
   tertinggal. Dipakai untuk merapikan data sekali saat aplikasi dibuka. */
function shipmentsNeedingArrivalSync(list) {
  return (list || []).filter((s) => s.status !== "arrived" && isArrived(s));
}
