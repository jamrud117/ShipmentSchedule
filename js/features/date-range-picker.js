"use strict";

/* PEMILIH RENTANG TANGGAL — kalender dua bulan dengan pratinjau &
   tombol Terapkan/Reset, menggantikan tampilan dua <input type="date">
   polos.

   #filterDateFrom / #filterDateTo TETAP ada di DOM (disembunyikan
   lewat CSS, .d-none) dan TETAP satu-satunya sumber kebenaran yang
   dibaca getFiltered()/dateRangeBasisValue()/dateRangeSummaryBit() di
   render/list.js -- widget ini cuma lapisan tampilan di atasnya.
   Artinya jumpToDateFilter() (dipanggil dari agenda 7 hari di halaman
   Ringkasan) dan tombol Hari Ini/Minggu Ini/Minggu Depan tidak perlu
   tahu widget ini ada sama sekali; mereka menulis ke dua input itu
   seperti biasa, lalu event "change" bawaannya yang dipakai di sini
   untuk menyegarkan teks di tombol pemicu. */

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function drpFmtDisplay(iso) {
  const dt = parseLocalDate(iso);
  if (!dt) return "";
  return `${String(dt.getDate()).padStart(2, "0")} ${BULAN_PENDEK[dt.getMonth()]} ${dt.getFullYear()}`;
}

function drpIsoOf(year, month, day) {
  // month boleh di luar 0-11 -- Date menormalkannya sendiri (mis. bulan 12 -> Januari tahun depan)
  const dt = new Date(year, month, day);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/* Kotak-kotak satu bulan, SELALU dari Senin, dengan tanggal bulan
   sebelum/sesudahnya sebagai pengisi (abu-abu, tetap bisa diklik --
   requirement umum date-range picker: memilih akhir Juni sampai awal
   Juli tanpa harus pindah bulan dulu). */
function drpBuildMonthCells(year, month) {
  const pertama = new Date(year, month, 1);
  // getDay(): 0=Minggu..6=Sabtu -> digeser supaya 0=Senin..6=Minggu
  const mulaiKosong = (pertama.getDay() + 6) % 7;
  const jumlahHari = new Date(year, month + 1, 0).getDate();
  const totalSel = Math.ceil((mulaiKosong + jumlahHari) / 7) * 7;

  const sel = [];
  for (let i = 0; i < totalSel; i++) {
    const hariKe = i - mulaiKosong + 1;
    sel.push({
      iso: drpIsoOf(year, month, hariKe),
      label: new Date(year, month, hariKe).getDate(),
      diLuarBulan: hariKe < 1 || hariKe > jumlahHari,
    });
  }
  return sel;
}

let drpViewYear = 0;
let drpViewMonth = 0; // bulan PERTAMA dari dua yang ditampilkan (0-11)
let drpTempFrom = "";
let drpTempTo = "";

function drpMonthGridHtml(year, month) {
  const sel = drpBuildMonthCells(year, month);
  const baris = [];
  for (let i = 0; i < sel.length; i += 7) baris.push(sel.slice(i, i + 7));
  const dari = drpTempFrom, sampai = drpTempTo;
  const min = dari && sampai ? (dari < sampai ? dari : sampai) : "";
  const maks = dari && sampai ? (dari < sampai ? sampai : dari) : "";

  const kepala = HARI_PENDEK.map((h) => `<div class="drp-dow">${h}</div>`).join("");
  const badan = baris
    .map(
      (mgg) =>
        `<div class="drp-week">${mgg
          .map((c) => {
            const kelas = ["drp-day"];
            if (c.diLuarBulan) kelas.push("drp-day--muted");
            if (c.iso === dari || c.iso === sampai) kelas.push("drp-day--endpoint");
            else if (min && c.iso > min && c.iso < maks) kelas.push("drp-day--inrange");
            return `<button type="button" class="${kelas.join(" ")}" data-drp-day="${c.iso}">${c.label}</button>`;
          })
          .join("")}</div>`,
    )
    .join("");
  return `<div class="drp-dow-row">${kepala}</div>${badan}`;
}

function drpRenderCalendars() {
  $("#drpMonthLabel0").textContent = `${BULAN_PANJANG[((drpViewMonth % 12) + 12) % 12]} ${drpViewYear + Math.floor(drpViewMonth / 12)}`;
  const m1 = drpViewMonth + 1;
  $("#drpMonthLabel1").textContent = `${BULAN_PANJANG[((m1 % 12) + 12) % 12]} ${drpViewYear + Math.floor(m1 / 12)}`;
  $("#drpGrid0").innerHTML = drpMonthGridHtml(drpViewYear, drpViewMonth);
  $("#drpGrid1").innerHTML = drpMonthGridHtml(drpViewYear, drpViewMonth + 1);
  drpSyncTriggerPreview();
}

function drpSyncTriggerPreview() {
  const teks = $("#dateRangeTriggerText");
  if (!teks) return;
  if (drpTempFrom && drpTempTo) {
    const a = drpTempFrom < drpTempTo ? drpTempFrom : drpTempTo;
    const b = drpTempFrom < drpTempTo ? drpTempTo : drpTempFrom;
    teks.textContent = `${drpFmtDisplay(a)}  –  ${drpFmtDisplay(b)}`;
  } else if (drpTempFrom) {
    teks.textContent = `${drpFmtDisplay(drpTempFrom)}  –  …`;
  } else {
    teks.textContent = "Pilih Rentang Tanggal";
  }
}

/* Mesin pemilihan: klik pertama = mulai (belum ada akhir, digambar
   sebagai satu titik). Klik kedua = akhir, DIURUTKAN otomatis (klik
   tanggal yang lebih awal duluan tidak masalah). Klik berikutnya
   sesudah pasangan lengkap MULAI LAGI dari nol -- sama seperti pola
   umum date-range picker, supaya tidak perlu tombol "ulangi" sendiri. */
function drpHandleDayClick(iso) {
  if (!drpTempFrom || (drpTempFrom && drpTempTo)) {
    drpTempFrom = iso;
    drpTempTo = "";
  } else if (iso < drpTempFrom) {
    drpTempTo = drpTempFrom;
    drpTempFrom = iso;
  } else {
    drpTempTo = iso;
  }
  drpRenderCalendars();
}

function drpOpen() {
  const dari = $("#filterDateFrom").value;
  const sampai = $("#filterDateTo").value;
  drpTempFrom = dari || "";
  drpTempTo = sampai || "";
  const acuan = parseLocalDate(dari) || new Date();
  drpViewYear = acuan.getFullYear();
  drpViewMonth = acuan.getMonth();
  drpRenderCalendars();
  $("#dateRangePopover").classList.remove("d-none");
  $("#dateRangeTrigger").setAttribute("aria-expanded", "true");
  $("#dateRangeTrigger").classList.add("is-open");
}
function drpClose() {
  $("#dateRangePopover").classList.add("d-none");
  $("#dateRangeTrigger").setAttribute("aria-expanded", "false");
  $("#dateRangeTrigger").classList.remove("is-open");
}
function drpIsOpen() {
  return !$("#dateRangePopover").classList.contains("d-none");
}

function drpApply() {
  // Baru satu tanggal diklik (belum ada akhir) -> jadi rentang sehari: dari = sampai.
  const akhir = drpTempTo || drpTempFrom;
  const a = drpTempFrom && akhir && drpTempFrom > akhir ? akhir : drpTempFrom;
  const b = drpTempFrom && akhir && drpTempFrom > akhir ? drpTempFrom : akhir;
  $("#filterDateFrom").value = a || "";
  $("#filterDateTo").value = b || "";
  $("#filterDateFrom").dispatchEvent(new Event("change"));
  drpClose();
}
function drpReset() {
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  $("#filterDateFrom").dispatchEvent(new Event("change"));
  drpClose();
}

/* Teks tombol pemicu disegarkan dari #filterDateFrom/To, BUKAN dari
   drpTempFrom/To -- supaya benar juga saat diubah dari luar widget ini
   (tombol Hari Ini/Minggu Ini/Minggu Depan, jumpToDateFilter() dari
   Ringkasan, atau resetAllFilters()), bukan cuma lewat kalender ini
   sendiri. */
function drpSyncTriggerFromFilter() {
  const teks = $("#dateRangeTriggerText");
  if (!teks) return;
  const dari = $("#filterDateFrom").value;
  const sampai = $("#filterDateTo").value;
  if (dari && sampai) {
    teks.textContent = `${drpFmtDisplay(dari)}  –  ${drpFmtDisplay(sampai)}`;
  } else {
    teks.textContent = "Pilih Rentang Tanggal";
  }
  $("#dateRangeTrigger").classList.toggle("has-value", !!(dari && sampai));
  $("#btnClearDateRange").classList.toggle("d-none", !(dari || sampai));
}

const drpTrigger = $("#dateRangeTrigger");
if (drpTrigger) {
  drpTrigger.addEventListener("click", () => {
    if (drpIsOpen()) drpClose();
    else drpOpen();
  });
}
const drpGrids = $("#drpGrids");
if (drpGrids) {
  drpGrids.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-drp-day]");
    if (!btn) return;
    /* KRUSIAL: drpHandleDayClick() di bawah memanggil drpRenderCalendars(),
       yang mengganti innerHTML kedua grid -- termasuk MENGHANCURKAN
       tombol yang baru saja diklik ini. Kalau klik dibiarkan lanjut
       menggelembung ke document, listener "klik di luar menutup panel"
       di bawah memeriksa wrap.contains(e.target) -- dan karena
       e.target sudah lepas dari dokumen sama sekali (bukan cuma di
       luar wrap), pemeriksaan itu SELALU salah, jadi panelnya menutup
       sendiri setiap kali satu tanggal diklik. stopPropagation()
       menghentikan klik ini sebelum sampai ke listener itu. */
    e.stopPropagation();
    drpHandleDayClick(btn.dataset.drpDay);
  });
}
const drpPrev = $("#drpNavPrev");
if (drpPrev) drpPrev.addEventListener("click", (e) => { e.stopPropagation(); drpViewMonth--; drpRenderCalendars(); });
const drpNext = $("#drpNavNext");
if (drpNext) drpNext.addEventListener("click", (e) => { e.stopPropagation(); drpViewMonth++; drpRenderCalendars(); });
const drpApplyBtn = $("#drpApply");
if (drpApplyBtn) drpApplyBtn.addEventListener("click", drpApply);
const drpResetBtn = $("#drpReset");
if (drpResetBtn) drpResetBtn.addEventListener("click", drpReset);

// Klik di luar popover menutupnya -- pola baku semua dropdown lain di app ini.
document.addEventListener("click", (e) => {
  const wrap = $("#dateRangePicker");
  if (!wrap || !drpIsOpen()) return;
  if (!wrap.contains(e.target)) drpClose();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drpIsOpen()) drpClose();
});

["filterDateFrom", "filterDateTo"].forEach((id) => {
  const el = $("#" + id);
  if (el) el.addEventListener("change", drpSyncTriggerFromFilter);
});
drpSyncTriggerFromFilter();
