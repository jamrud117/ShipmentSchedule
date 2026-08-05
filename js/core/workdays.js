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
  let cur = iso;
  if (!parseLocalDate(cur)) return "";
  let jaga = 0;
  while (!isWorkingDayISO(cur)) {
    cur = addCalendarDaysISO(cur, 1);
    // Jaring pengaman: kalau seluruh tahun ditandai libur, jangan berputar selamanya
    if (++jaga > 400) return cur;
  }
  return cur;
}

/* Tanggal + n HARI KERJA.

   n = 0 mengembalikan tanggalnya apa adanya (tidak digeser). Yang
   digeser hanya proses yang memang MEMAKAN waktu; proses berdurasi nol
   tidak boleh memundurkan tanggal.

   Untuk n > 0, tiap langkah maju satu hari lalu terus maju sampai
   mendarat di hari kerja. Jadi Jumat + 1 hari kerja = Senin. */
function addWorkingDaysISO(iso, n) {
  const jml = Math.max(0, Math.round(Number(n) || 0));
  if (!parseLocalDate(iso)) return "";
  if (jml === 0) return iso;

  let cur = iso;
  for (let i = 0; i < jml; i++) {
    cur = addCalendarDaysISO(cur, 1);
    let jaga = 0;
    while (!isWorkingDayISO(cur)) {
      cur = addCalendarDaysISO(cur, 1);
      if (++jaga > 400) break;
    }
  }
  return cur;
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
   termasuk tanggal akhir). Belum dipakai perhitungan mana pun sekarang,
   tapi dibutuhkan begitu prediksi mulai belajar dari riwayat: "PIB ke
   SPPB kemarin makan berapa hari kerja". */
function workingDaysBetweenISO(fromISO, toISO) {
  const a = parseLocalDate(fromISO);
  const b = parseLocalDate(toISO);
  if (!a || !b) return null;
  const mundur = b < a;
  let cur = mundur ? toISO : fromISO;
  const akhir = mundur ? fromISO : toISO;
  let n = 0;
  let jaga = 0;
  while (cur !== akhir) {
    cur = addCalendarDaysISO(cur, 1);
    if (isWorkingDayISO(cur)) n++;
    if (++jaga > 4000) break;
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
