"use strict";

/* ==================================================================
   HARI KALENDER vs HARI KERJA

   Perjalanan kapal & pesawat berjalan terus di akhir pekan, jadi
   transit dihitung dengan HARI KALENDER.

   Sebaliknya, CFS, Bea Cukai, dan trucking berhenti di hari Sabtu &
   Minggu. Menghitung stripping/clearance/pengantaran dengan hari
   kalender berarti menjanjikan barang keluar pada hari yang kantornya
   tutup — perkiraan yang selalu meleset ke arah yang sama.

   Hari libur nasional dibaca dari PREDICTION_CONFIG.calendar.holidays
   yang untuk sekarang memang kosong. Perhitungan di bawah SUDAH
   melompatinya; mengisinya nanti tidak menuntut perubahan kode apa pun.
================================================================== */

function predictionCalendar() {
  const c = (typeof PREDICTION_CONFIG !== "undefined" &&
    PREDICTION_CONFIG.calendar) || {};
  return {
    weekendDays: Array.isArray(c.weekendDays) ? c.weekendDays : [0, 6],
    holidays: Array.isArray(c.holidays) ? c.holidays : [],
  };
}

// Tanggal Date -> "YYYY-MM-DD" memakai zona waktu LOKAL, sama seperti todayISO()
function toISODate(d) {
  if (!d || isNaN(d)) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function isHolidayISO(iso) {
  if (!iso) return false;
  return predictionCalendar().holidays.indexOf(iso) >= 0;
}

function isWeekendISO(iso) {
  const d = parseLocalDate(iso);
  if (!d) return false;
  return predictionCalendar().weekendDays.indexOf(d.getDay()) >= 0;
}

function isWorkingDayISO(iso) {
  if (!iso) return false;
  return !isWeekendISO(iso) && !isHolidayISO(iso);
}

/* Sama dengan isWorkingDayISO, untuk objek tanggal yang sedang
   dimajukan per hari -- tanpa mengurai & menulis ulang teks tanggal di
   tiap langkah (perulangan hari kerja dipanggil ratusan kali tiap
   prediksi dihitung). `cal` = predictionCalendar() sekali per hitungan. */
function hariKerjaTgl(d, cal) {
  if (cal.weekendDays.indexOf(d.getDay()) >= 0) return false;
  return !cal.holidays.length || cal.holidays.indexOf(toISODate(d)) < 0;
}
const ISO_RAPI = /^\d{4}-\d{2}-\d{2}$/;

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
function nextWorkingDayISO(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const cal = predictionCalendar();
  if (cal.weekendDays.indexOf(d.getDay()) < 0 && cal.holidays.indexOf(iso) < 0) return iso;
  let jaga = 0;
  do {
    d.setDate(d.getDate() + 1);
    // Jaring pengaman: kalau seluruh tahun ditandai libur, jangan berputar selamanya
    if (++jaga > 400) break;
  } while (!hariKerjaTgl(d, cal));
  return toISODate(d);
}

/* Tanggal + n HARI KERJA.

   n = 0 mengembalikan tanggalnya apa adanya (tidak digeser). Yang
   digeser hanya proses yang memang MEMAKAN waktu; proses berdurasi nol
   tidak boleh memundurkan tanggal.

   Untuk n > 0, tiap langkah maju satu hari lalu terus maju sampai
   mendarat di hari kerja. Jadi Jumat + 1 hari kerja = Senin. */
function addWorkingDaysISO(iso, n) {
  const jml = Math.max(0, Math.round(Number(n) || 0));
  const d = parseLocalDate(iso);
  if (!d) return "";
  if (jml === 0) return iso;

  const cal = predictionCalendar();
  for (let i = 0; i < jml; i++) {
    d.setDate(d.getDate() + 1);
    let jaga = 0;
    while (!hariKerjaTgl(d, cal)) {
      d.setDate(d.getDate() + 1);
      if (++jaga > 400) break;
    }
  }
  return toISODate(d);
}

/* Selisih HARI KALENDER antara dua tanggal. Positif kalau `toISO`
   sesudah `fromISO`. */
function calendarDaysBetweenISO(fromISO, toISO) {
  const a = parseLocalDate(fromISO);
  const b = parseLocalDate(toISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/* Berapa hari KERJA di antara dua tanggal (tidak termasuk tanggal awal,
   termasuk tanggal akhir). Dipakai mesin belajar prediksi: "PIB ke SPPB
   kemarin makan berapa hari kerja" (prediction-learning.js). */
function workingDaysBetweenISO(fromISO, toISO) {
  const a = parseLocalDate(fromISO);
  const b = parseLocalDate(toISO);
  if (!a || !b) return null;
  const mundur = b < a;
  let n = 0;
  if (ISO_RAPI.test(fromISO) && ISO_RAPI.test(toISO)) {
    // Satu objek tanggal yang dimajukan, bukan urai-tulis teks tiap hari.
    const cal = predictionCalendar();
    const d = mundur ? b : a;
    const hari = Math.min(Math.abs(calendarDaysBetweenISO(fromISO, toISO)), 4001);
    for (let i = 0; i < hari; i++) {
      d.setDate(d.getDate() + 1);
      if (hariKerjaTgl(d, cal)) n++;
    }
  } else {
    // Teks tanggal tak baku: jalur lama apa adanya.
    let cur = mundur ? toISO : fromISO;
    const akhir = mundur ? fromISO : toISO;
    let jaga = 0;
    while (cur !== akhir) {
      cur = addCalendarDaysISO(cur, 1);
      if (isWorkingDayISO(cur)) n++;
      if (++jaga > 4000) break;
    }
  }
  return mundur ? -n : n;
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
  };
}
