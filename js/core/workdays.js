"use strict";

/* ==================================================================
   HARI KALENDER vs HARI KERJA

   Perjalanan kapal & pesawat berjalan terus di akhir pekan, jadi
   transit dihitung dengan HARI KALENDER.

   Sebaliknya, Bea Cukai, PPJK, dan trucking ke pabrik berhenti di hari
   Sabtu, Minggu, hari libur nasional, dan cuti bersama. Menghitungnya
   dengan hari kalender berarti menjanjikan barang keluar pada hari
   yang kantornya tutup -- perkiraan yang selalu meleset ke arah yang
   sama, dan paling jauh justru di musim Lebaran.

   Daftar libur, cuti bersama, dan masa pembatasan angkutan barang ada
   di PREDICTION_CONFIG.calendar (prediction-config.js).
================================================================== */

/* Satu entri libur dari konfigurasi: teks "YYYY-MM-DD" (bentuk lama)
   atau { date, name }. */
function entriLibur(h) {
  if (!h) return null;
  if (typeof h === "string") return { date: h, name: "" };
  return h.date ? { date: String(h.date), name: h.name || "" } : null;
}

/* KUNCI HARI berupa ANGKA (20260817), bukan teks "2026-08-17".

   Perulangan hari kerja memeriksa ratusan tanggal tiap prediksi dan
   ribuan saat uji mundur; menyusun teks tanggal di tiap langkah hanya
   untuk mencarinya di daftar libur memakan waktu lebih banyak daripada
   seluruh hitungan lainnya. */
const kunciHariTgl = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const ISO_RAPI = /^\d{4}-\d{2}-\d{2}$/;
function kunciHariISO(iso) {
  if (ISO_RAPI.test(iso)) return Number(iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10));
  const d = parseLocalDate(iso);
  return d ? kunciHariTgl(d) : null;
}

/* KALENDER YANG SUDAH DIRAPIKAN — dibuat sekali per isi konfigurasi.
   Diperiksa tanpa membuat objek baru (dipanggil di setiap hitungan hari
   kerja): identitas & panjang tiap daftar, jadi konfigurasi yang
   diganti (uji, penyesuaian tangan) langsung terbaca. */
const KALENDER_CACHE = { cal: null };
const panjangDaftar = (x) => (Array.isArray(x) ? x.length : -1);

function predictionCalendar() {
  const c = (typeof PREDICTION_CONFIG !== "undefined" && PREDICTION_CONFIG.calendar) || {};
  const k = KALENDER_CACHE;
  if (
    k.cal &&
    k.weekendDays === c.weekendDays && k.nWeekend === panjangDaftar(c.weekendDays) &&
    k.holidays === c.holidays && k.nHolidays === panjangDaftar(c.holidays) &&
    k.cuti === c.collectiveLeave && k.nCuti === panjangDaftar(c.collectiveLeave) &&
    k.truk === c.freightRestrictions && k.nTruk === panjangDaftar(c.freightRestrictions) &&
    k.hitungCuti === (c.countCollectiveLeave !== false)
  ) {
    return k.cal;
  }

  // Kunci hari -> { date, name, cuti }. Libur nasional tidak ditimpa cuti bersama.
  const libur = new Map();
  const catat = (h, cuti) => {
    const e = entriLibur(h);
    const n = e && kunciHariISO(e.date);
    if (n && !libur.has(n)) libur.set(n, { date: e.date, name: e.name, cuti });
  };
  (Array.isArray(c.holidays) ? c.holidays : []).forEach((h) => catat(h, false));
  if (c.countCollectiveLeave !== false) {
    (Array.isArray(c.collectiveLeave) ? c.collectiveLeave : []).forEach((h) => catat(h, true));
  }

  // Pembatasan angkutan barang, dipecah per hari
  const pembatasan = new Map();
  (Array.isArray(c.freightRestrictions) ? c.freightRestrictions : []).forEach((r) => {
    const d = r && parseLocalDate(r.from);
    const akhir = r && parseLocalDate(r.to);
    if (!d || !akhir) return;
    let jaga = 0;
    while (d <= akhir && ++jaga < 120) {
      const n = kunciHariTgl(d);
      if (!pembatasan.has(n)) pembatasan.set(n, []);
      pembatasan.get(n).push({
        // Objek konfigurasinya, bukan teksnya: nama dibaca saat ditampilkan (ikut bahasa)
        sumber: r,
        legs: Array.isArray(r.legs) && r.legs.length ? r.legs : ["delivery"],
        appliesTo: Array.isArray(r.appliesTo) && r.appliesTo.length ? r.appliesTo : null,
      });
      d.setDate(d.getDate() + 1);
    }
  });

  const cal = {
    weekendDays: Array.isArray(c.weekendDays) ? c.weekendDays : [0, 6],
    libur,
    pembatasan,
    // Hari tutup tambahan per langkah & tipe pengiriman (hariTutupLangkah)
    tutupLangkah: new Map(),
  };
  Object.assign(k, {
    cal,
    weekendDays: c.weekendDays, nWeekend: panjangDaftar(c.weekendDays),
    holidays: c.holidays, nHolidays: panjangDaftar(c.holidays),
    cuti: c.collectiveLeave, nCuti: panjangDaftar(c.collectiveLeave),
    truk: c.freightRestrictions, nTruk: panjangDaftar(c.freightRestrictions),
    hitungCuti: c.countCollectiveLeave !== false,
  });
  return cal;
}

/* HARI TUTUP TAMBAHAN untuk satu langkah proses (Set kunci hari), atau
   null.

   Pembatasan angkutan barang Lebaran & Nataru melarang truk sumbu tiga
   ke atas -- trailer kontainer -- di tol dan jalan arteri, termasuk
   ruas Cawang–Tanjung Priok dan Jakarta–Cikampek. Hanya langkah antar
   ke pabrik yang tertahan, dan hanya untuk tipe pengiriman yang
   diangkut truk sebesar itu (FCL); kiriman udara & LCL biasanya
   diantar truk kecil yang tetap boleh jalan. */
function hariTutupLangkah(key, ctx) {
  const cal = predictionCalendar();
  if (!cal.pembatasan.size || !key) return null;
  const tipe = (ctx && ctx.shipmentType) || "";
  const kunci = key + "|" + tipe;
  if (cal.tutupLangkah.has(kunci)) return cal.tutupLangkah.get(kunci);
  const tutup = new Set();
  cal.pembatasan.forEach((daftar, n) => {
    if (daftar.some((r) => r.legs.indexOf(key) >= 0 && (!r.appliesTo || r.appliesTo.indexOf(tipe) >= 0))) {
      tutup.add(n);
    }
  });
  const hasil = tutup.size ? tutup : null;
  cal.tutupLangkah.set(kunci, hasil);
  return hasil;
}

// Tanggal Date -> "YYYY-MM-DD" memakai zona waktu LOKAL, sama seperti todayISO()
function toISODate(d) {
  if (!d || isNaN(d)) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function isHolidayISO(iso) {
  if (!iso) return false;
  return predictionCalendar().libur.has(kunciHariISO(iso));
}

function isWeekendISO(iso) {
  const d = parseLocalDate(iso);
  if (!d) return false;
  return predictionCalendar().weekendDays.indexOf(d.getDay()) >= 0;
}

// `tutup`: hari tutup tambahan langkah itu (hariTutupLangkah), boleh kosong
function isWorkingDayISO(iso, tutup) {
  const d = iso ? parseLocalDate(iso) : null;
  return !!d && hariKerjaTgl(d, predictionCalendar(), tutup);
}

/* Sama dengan isWorkingDayISO, untuk objek tanggal yang sedang
   dimajukan per hari. `cal` = predictionCalendar() sekali per hitungan. */
function hariKerjaTgl(d, cal, tutup) {
  if (cal.weekendDays.indexOf(d.getDay()) >= 0) return false;
  if (!cal.libur.size && !tutup) return true;
  const n = kunciHariTgl(d);
  return !cal.libur.has(n) && !(tutup && tutup.has(n));
}

/* Tanggal + n hari KALENDER. n boleh 0 atau negatif. */
function addCalendarDaysISO(iso, n) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + (Number(n) || 0));
  return toISODate(d);
}

/* Hari kerja PERTAMA pada atau sesudah `iso`.

   Dipakai saat sebuah proses dijadwalkan mulai di akhir pekan: barang
   yang mendarat Sabtu tidak diurus Sabtu itu juga. */
function nextWorkingDayISO(iso, tutup) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const cal = predictionCalendar();
  if (hariKerjaTgl(d, cal, tutup)) return iso;
  let jaga = 0;
  do {
    d.setDate(d.getDate() + 1);
    // Jaring pengaman: kalau seluruh tahun ditandai libur, jangan berputar selamanya
    if (++jaga > 400) break;
  } while (!hariKerjaTgl(d, cal, tutup));
  return toISODate(d);
}

/* Tanggal + n HARI KERJA.

   n = 0 mengembalikan tanggalnya apa adanya (tidak digeser). Yang
   digeser hanya proses yang memang MEMAKAN waktu; proses berdurasi nol
   tidak boleh memundurkan tanggal.

   Untuk n > 0, tiap langkah maju satu hari lalu terus maju sampai
   mendarat di hari kerja. Jadi Jumat + 1 hari kerja = Senin. */
function addWorkingDaysISO(iso, n, tutup) {
  const jml = Math.max(0, Math.round(Number(n) || 0));
  const d = parseLocalDate(iso);
  if (!d) return "";
  if (jml === 0) return iso;

  const cal = predictionCalendar();
  for (let i = 0; i < jml; i++) {
    d.setDate(d.getDate() + 1);
    let jaga = 0;
    while (!hariKerjaTgl(d, cal, tutup)) {
      d.setDate(d.getDate() + 1);
      if (++jaga > 400) break;
    }
  }
  return toISODate(d);
}

/* Nomor hari sejak 1970 untuk teks "YYYY-MM-DD" -- tanpa mengurai
   teks lewat Date (lambat), disimpan karena tanggal yang sama dibaca
   berulang kali (riwayat, uji mundur). */
const NOMOR_HARI = new Map();
function nomorHariISO(iso) {
  let n = NOMOR_HARI.get(iso);
  if (n === undefined) {
    n = ISO_RAPI.test(iso)
      ? Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000
      : null;
    if (n != null && isNaN(n)) n = null;
    if (NOMOR_HARI.size > 20000) NOMOR_HARI.clear();
    NOMOR_HARI.set(iso, n);
  }
  return n;
}

/* Selisih HARI KALENDER antara dua tanggal. Positif kalau `toISO`
   sesudah `fromISO`. */
function calendarDaysBetweenISO(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const na = nomorHariISO(fromISO);
  const nb = nomorHariISO(toISO);
  if (na != null && nb != null) return nb - na;
  const a = parseLocalDate(fromISO);
  const b = parseLocalDate(toISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/* Berapa hari KERJA di antara dua tanggal (tidak termasuk tanggal awal,
   termasuk tanggal akhir). Dipakai mesin belajar prediksi: "PIB ke SPPB
   kemarin makan berapa hari kerja" (prediction-learning.js). */
function workingDaysBetweenISO(fromISO, toISO, tutup) {
  const a = parseLocalDate(fromISO);
  const b = parseLocalDate(toISO);
  if (!a || !b) return null;
  const mundur = b < a;
  const cal = predictionCalendar();
  // Satu objek tanggal yang dimajukan, bukan urai-tulis teks tiap hari.
  const d = mundur ? b : a;
  const hari = Math.min(Math.abs(Math.round((b - a) / 86400000)), 4001);
  let n = 0;
  for (let i = 0; i < hari; i++) {
    d.setDate(d.getDate() + 1);
    if (hariKerjaTgl(d, cal, tutup)) n++;
  }
  return mundur ? -n : n;
}

/* HARI TUTUP YANG DILEWATI sebuah langkah: hari kerja biasa (Senin-
   Jumat) di antara `fromISO` (tidak termasuk) dan `toISO` (termasuk)
   yang tutup karena libur nasional, cuti bersama, atau pembatasan
   angkutan barang -- supaya rincian prediksi bisa menjelaskan kenapa
   "1 hari kerja" ternyata sepekan. Akhir pekan tidak disebut: itu sudah
   jelas dari kalendernya. */
function hariTutupDiAntara(fromISO, toISO, tutup) {
  const a = parseLocalDate(fromISO);
  const b = parseLocalDate(toISO);
  if (!a || !b || b <= a) return [];
  const cal = predictionCalendar();
  const hasil = [];
  let jaga = 0;
  while (a < b && ++jaga < 400) {
    a.setDate(a.getDate() + 1);
    if (cal.weekendDays.indexOf(a.getDay()) >= 0) continue;
    const n = kunciHariTgl(a);
    const libur = cal.libur.get(n);
    if (libur) hasil.push({ date: toISODate(a), name: libur.name, kind: libur.cuti ? "cuti" : "libur" });
    else if (tutup && tutup.has(n)) {
      const r = (cal.pembatasan.get(n) || [])[0];
      hasil.push({ date: toISODate(a), name: (r && r.sumber.name) || "", kind: "truk" });
    }
  }
  return hasil;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toISODate,
    isHolidayISO,
    isWeekendISO,
    isWorkingDayISO,
    addCalendarDaysISO,
    calendarDaysBetweenISO,
    nextWorkingDayISO,
    addWorkingDaysISO,
    workingDaysBetweenISO,
    hariTutupLangkah,
    hariTutupDiAntara,
  };
}
