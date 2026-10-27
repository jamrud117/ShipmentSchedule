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

/* ------------------------------------------------------------------
   TANGGAL REVISI (kotak "Tanggal Update Delay": etdUpdate / etaUpdate)

   ETD/ETA = rencana, etdUpdate/etaUpdate = revisi sesudah delay. Yang
   BERLAKU revisinya (effectiveEtd/Eta di atas), jadi revisi yang
   tertinggal & tidak terlihat menimpa tanggal yang baru diketik.

   Itulah bug "ETD sudah diubah ke tanggal 10, kartu masih tanggal 9":
   jadwalnya pernah delay (ETD revisi 9), statusnya sudah bukan Delay
   sehingga kotak revisinya tersembunyi, lalu ETD rencana diubah ke 10
   -- revisi 9 tetap menang, dan karena tanggal 9 sudah lewat, jadwal
   export itu otomatis Delivered.

   Dua aturan menutupnya:
     1. Revisi yang masih terisi SELALU tampil (form & kartu), apa pun
        statusnya. Tidak ada tanggal tersembunyi yang menentukan.
     2. Di luar status Delay, tanggal RENCANA yang diubah adalah jadwal
        terbarunya: revisi yang digantikannya dikosongkan. Mengubah ETD
        menggugurkan kedua revisi (ETA revisi berpijak pada ETD revisi
        yang sama); mengubah ETA hanya revisi ETA. Saat status Delay
        keduanya tampil berdampingan dan diubah sendiri-sendiri.
------------------------------------------------------------------ */
const LABEL_TANGGAL_REVISI = {
  get etdUpdate() {
    return tt("ETD revisi", "Revised ETD");
  },
  get etaUpdate() {
    return tt("ETA revisi", "Revised ETA");
  },
};

function adaRevisiJadwal(s) {
  return !!(s && (s.etdUpdate || s.etaUpdate));
}

/* Kolom revisi yang gugur saat tanggal rencana `field` ("etd"/"eta")
   diubah pada jadwal berstatus `status`. Yang sudah kosong tidak
   disebut. */
function revisiDigugurkan(status, field, s) {
  if (status === "delayed" || !s) return [];
  const kolom = field === "etd" ? ["etdUpdate", "etaUpdate"] : field === "eta" ? ["etaUpdate"] : [];
  return kolom.filter((k) => s[k]);
}

// Teks badge di sebelah label field update, mis
function delayDeltaLabel(baselineDate, updateDate, basis) {
  const d = delayDaysBetween(baselineDate, updateDate);
  if (d == null) return "";
  if (d > 0) return t("x.hari.dari.basis", { n: d, basis });
  if (d < 0) return t("x.hari.lebih.cepat", { n: Math.abs(d) });
  return t("x.sama.dengan.basis", { basis });
}

/* ------------------------------------------------------------------
   RATA-RATA DELAY KAPAL (Ringkasan, panel Pantauan delay)

   Berapa hari kapal/pesawat datang -- atau, di buku Export, berangkat
   -- lebih lambat dari jadwal RENCANA (kolom ETA / ETD). Kenyataannya
   dari yang paling pasti:

     tiba       ATA / Berths, Berths kiriman lain di kapal yang sama,
                Manifest + jeda biasanya (kedatanganTercatat), lalu ETA
                revisi yang tanggalnya sudah lewat;
     berangkat  Sailing/ATD, lalu ETD revisi.

   Kiriman yang jadwalnya sudah lewat & sudah selesai tanpa catatan
   apa pun dihitung TEPAT WAKTU (0 hari) -- delay di aplikasi ini
   dicatat lewat status Delay + tanggal revisi. Yang belum selesai &
   belum ada kenyataannya belum dihitung.

   Ukuran yang lazim dipakai laporan keandalan jadwal pelayaran:
   rata-rata delay KAPAL YANG TELAT (telat = >= 1 hari) dan persentase
   kiriman yang tepat jadwal. Datang lebih awal dihitung 0.
------------------------------------------------------------------ */
function delayKapalKiriman(s, hariIni) {
  const hasil = { tiba: null, berangkat: null };
  if (!s) return hasil;
  const sudah = (iso) => !!iso && iso <= hariIni;
  const selesai = isArrived(s) || !!s.factoryDate;

  if (s.eta && sudah(s.eta)) {
    const bukti = typeof kedatanganTercatat === "function" ? kedatanganTercatat(s) : null;
    const nyata = (bukti && bukti.date) || (sudah(s.etaUpdate) ? s.etaUpdate : "");
    if (nyata) hasil.tiba = delayDaysBetween(s.eta, nyata);
    else if (selesai) hasil.tiba = 0;
  }
  if (s.etd && sudah(s.etd)) {
    const atd = typeof milestoneDateOf === "function" ? milestoneDateOf(s, "sailing") : "";
    const nyata = atd || s.etdUpdate || "";
    // ETD rencana sudah lewat tanpa revisi: dianggap berangkat sesuai jadwal
    hasil.berangkat = nyata ? delayDaysBetween(s.etd, nyata) : 0;
  }
  return hasil;
}

function ringkasAngkaDelay(daftar) {
  const angka = daftar.filter((n) => n != null && isFinite(n));
  if (!angka.length) return { n: 0 };
  const telat = angka.filter((n) => n >= 1);
  const satuDesimal = (x) => Math.round(x * 10) / 10;
  return {
    n: angka.length,
    telat: telat.length,
    // Rata-rata kapal yang telat (hari)
    rataTelat: telat.length ? satuDesimal(telat.reduce((a, b) => a + b, 0) / telat.length) : 0,
    // Rata-rata per kiriman, datang lebih awal = 0
    rataSemua: satuDesimal(angka.reduce((a, b) => a + Math.max(0, b), 0) / angka.length),
    tepat: Math.round(((angka.length - telat.length) / angka.length) * 100),
    maks: Math.max.apply(null, angka),
  };
}

/* Ringkasan per moda + pelayaran/maskapai yang paling telat.
   opsi.basis: "tiba" (bawaan Import) atau "berangkat" (bawaan Export);
   opsi.hari: jendela ke belakang dari hari ini (bawaan 365). */
function ringkasDelayKapal(list, opsi) {
  const o = opsi || {};
  const hariIni = o.hariIni || todayISO();
  const awal = addCalendarDaysISO(hariIni, -(o.hari || 365));
  const basis = o.basis === "berangkat" ? "berangkat" : "tiba";
  const per = { laut: [], udara: [] };
  const perCarrier = new Map();

  (list || []).forEach((s) => {
    const rencana = basis === "tiba" ? s && s.eta : s && s.etd;
    if (!rencana || rencana < awal) return;
    const d = delayKapalKiriman(s, hariIni)[basis];
    if (d == null) return;
    const moda = s.transport === "udara" ? "udara" : "laut";
    per[moda].push(d);

    // Pelayaran dengan kodenya yang ringkas (HMM, MSC); maskapai dengan namanya
    const c = typeof detectCarrier === "function" ? detectCarrier(s) : null;
    const nama = (c && c.detected && (c.kind === "airline" ? c.name || c.code : c.code || c.name)) || "";
    if (!nama || (c && c.kind === "courier")) return;
    if (!perCarrier.has(nama)) perCarrier.set(nama, { nama, moda, angka: [] });
    perCarrier.get(nama).angka.push(d);
  });

  const carrier = [...perCarrier.values()]
    .map((x) => ({ nama: x.nama, moda: x.moda, ...ringkasAngkaDelay(x.angka) }))
    .filter((x) => x.n >= 2 && x.telat > 0)
    .sort((a, b) => b.rataSemua - a.rataSemua || b.telat - a.telat)
    .slice(0, 3);

  return { basis, laut: ringkasAngkaDelay(per.laut), udara: ringkasAngkaDelay(per.udara), carrier };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STATUS_OPTIONS_BY_MODE,
    statusTemplateValue,
    delayDaysBetween,
    delayKapalKiriman,
    ringkasDelayKapal,
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
