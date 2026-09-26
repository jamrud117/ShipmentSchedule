"use strict";

/* SARINGAN CEPAT, METRIK, & BENTUK TAMPILAN */

/* Saringan "Perlu Tindakan" — dipakai dari kartu Ringkasan & command
   palette, bukan dari bilah kendali.

   Sengaja sakelar boolean sederhana, bukan tabel saringan generik:
   satu-satunya syarat yang tidak punya padanan di dropdown status
   adalah needsAction(). Sisanya (Proses, Selesai) sudah bisa dipilih
   langsung dari dropdown itu, dan penyaringan per-tanggal ditangani
   filter rentang tanggal lewat jumpToDateFilter() di render/list.js.

   PENTING: saringan apa pun yang ditambahkan di sini harus bisa
   sama-sama benar dengan nilai #filterStatus mana pun. Syarat yang
   diam-diam mengandaikan status tertentu akan menghasilkan daftar
   kosong tanpa keterangan apa pun di layar begitu pengguna memilih
   status yang berlawanan. */
let onlyNeedsAction = false;

function setOnlyNeedsAction(on) {
  onlyNeedsAction = !!on;
  currentPage = 1;
  render();
}

/* HITUNGAN */
function updateStats(shown) {
  const list = currentList();
  const selesai = list.filter((s) => isArrived(s)).length;
  /* Badge di sebelah judul = jumlah kartu yang SEDANG TAMPIL, ikut
     saringan tanggal/status/pencarian yang aktif — bukan lagi total
     seisi buku. Kalau pengguna menyaring rentang tanggal 1-12, badge
     ini yang berubah mengikuti; ringkasan Total/In Process/Delayed/
     Arrived di bawah tetap dari seisi buku (lihat komentarnya sendiri
     di bawah) karena keduanya menjawab pertanyaan yang berbeda. */
  const jumlah = $("#listCount");
  if (jumlah) jumlah.textContent = shown;

  /* Bilah ringkasan (Total/In Process/Delayed/Arrived) di atas daftar.
     Selalu dari SELURUH buku aktif (currentList()), bukan hasil
     saringan yang sedang tampil — ini menjawab "berapa total
     sebenarnya", sementara badge di atas menjawab "berapa yang
     kelihatan sekarang". Label "Arrived" ikut ML() supaya jadi
     "Delivered" di buku Export, sama seperti label status lainnya. */
  const total = $("#statTotal");
  if (total) total.textContent = list.length;
  const proc = $("#statProcess");
  if (proc) proc.textContent = list.filter((s) => s.status === "process").length;
  const delay = $("#statDelayed");
  if (delay) delay.textContent = list.filter((s) => s.status === "delayed").length;
  const arr = $("#statArrived");
  if (arr) arr.textContent = selesai;
  const lblArr = $("#lblStatArrived");
  if (lblArr) lblArr.textContent = statusLabel("arrived", activeMode);

  syncQuickDateActive();
  /* Tombol Hari Ini/Minggu Ini/Minggu Depan & resetDateRangeFilter()
     mengubah #filterDateFrom/To lewat .value langsung tanpa memicu
     event "change" (batasan DOM biasa, bukan lalai) -- disinkronkan
     di sini juga (bukan cuma lewat listener "change" di
     date-range-picker.js) supaya teks tombol pemicu kalender tetap
     benar dari jalur mana pun asalnya. */
  if (typeof drpSyncTriggerFromFilter === "function") drpSyncTriggerFromFilter();
}

/* Menyalakan tombol Hari Ini/Minggu Ini/Minggu Depan kalau rentang
   tanggal yang SEDANG AKTIF persis sama dengan yang akan tombol itu
   isi -- bukan cuma menandai tombol yang terakhir diklik (rentangnya
   bisa saja lalu diubah manual lewat kalender, atau datang dari
   jumpToDateFilter() di halaman Ringkasan yang kebetulan sama). */
function syncQuickDateActive() {
  const dari = ($("#filterDateFrom") || {}).value || "";
  const sampai = ($("#filterDateTo") || {}).value || "";
  if (!dari || !sampai) {
    ["btnQuickToday", "btnQuickWeek", "btnQuickNextWeek"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.classList.remove("is-active");
    });
    return;
  }
  const hari = todayISO();
  /* addCalendarDaysISO() (core/workdays.js) -- BUKAN
     `new Date(...).toISOString()`. toISOString() mengubah ke UTC, dan
     untuk zona WIB (UTC+7) itu memundurkan tanggalnya satu hari
     (tengah malam WIB = jam 5 sore UTC hari sebelumnya), sehingga
     tanggal yang dibandingkan di sini tidak akan pernah cocok dengan
     yang ditulis isiRentangHariIni() di bawah. */
  const cocok = {
    btnQuickToday: dari === hari && sampai === hari,
    btnQuickWeek: dari === hari && sampai === addCalendarDaysISO(hari, 6),
    btnQuickNextWeek:
      dari === addCalendarDaysISO(hari, 7) && sampai === addCalendarDaysISO(hari, 13),
  };
  Object.keys(cocok).forEach((id) => {
    const el = $("#" + id);
    if (el) el.classList.toggle("is-active", cocok[id]);
  });
}

/* CATATAN SARINGAN */
function activeFilterSummary() {
  const bits = [];
  if (onlyNeedsAction) bits.push(tt("Perlu tindakan", "Needs action"));
  const q = ($("#searchInput") || {}).value || "";
  if (q.trim()) bits.push(tt(`pencarian “${q.trim()}”`, `search “${q.trim()}”`));
  const st = ($("#filterStatus") || {}).value || "";
  if (st) bits.push(`status ${statusLabel(st, activeMode)}`);
  const rentang = dateRangeSummaryBit();
  if (rentang) bits.push(rentang);
  return bits;
}

function renderFilterNote(shown, total) {
  const wrap = $("#filterNote");
  if (!wrap) return;
  const bits = activeFilterSummary();
  if (!bits.length) {
    wrap.classList.add("d-none");
    return;
  }
  wrap.classList.remove("d-none");
  $("#filterNoteText").textContent =
    t("x.menampilkan.disaring", { shown, total, bits: bits.join(", ") });
}

function resetAllFilters() {
  onlyNeedsAction = false;
  const s = $("#searchInput");
  if (s) s.value = "";
  const st = $("#filterStatus");
  if (st) st.value = "";
  resetDateRangeFilter();
  currentPage = 1;
  syncSearchClear();
  render();
}

function syncSearchClear() {
  const btn = $("#btnClearSearch");
  const isi = ($("#searchInput") || {}).value || "";
  if (btn) btn.classList.toggle("d-none", !isi);
  /* Di mobile kotak cari menyusut jadi ikon dan cuma melebar saat
     difokus. Kelas ini yang menahannya tetap lebar selama masih ada
     isinya — tanpa itu, kata kunci yang sedang menyaring daftar
     lenyap dari pandangan begitu papan ketik ditutup.

     Diambil dari #searchInput, BUKAN $(".search-box"): ada tiga kotak
     cari di halaman ini (bilah kendali, Kelola Akun, Database HS Code),
     dan pemilih kelas polos mengembalikan yang pertama di dokumen —
     bukan yang ini. */
  const el = $("#searchInput");
  const box = el && el.closest(".search-box");
  if (box) box.classList.toggle("has-query", !!isi);
}

/* PENGKABELAN */
const btnResetFilters = $("#btnResetFilters");
if (btnResetFilters) btnResetFilters.addEventListener("click", resetAllFilters);

const btnClearSearch = $("#btnClearSearch");
if (btnClearSearch) {
  btnClearSearch.addEventListener("click", () => {
    $("#searchInput").value = "";
    syncSearchClear();
    currentPage = 1;
    render();
    $("#searchInput").focus();
  });
}

/* "Hari Ini"/"Minggu Ini"/"Minggu Depan" cuma MENGISI filterDateFrom/To
   yang sama dengan yang bisa diketik manual -- aksi sekali klik, bukan
   sakelar yang perlu diingat statusnya. Basis (ETA/ETD/Estimasi
   Delivery) SENGAJA tidak ikut diubah -- kalau pengguna sudah memilih
   ETD, tombol ini semestinya mengisi rentang ETD, bukan diam-diam
   mengganti ke basis lain. */
function isiRentangHariIni(mulaiHariKe, akhirHariKe) {
  // addCalendarDaysISO(), BUKAN "new Date(...).toISOString()" -- lihat
  // komentar panjang di syncQuickDateActive() soal bug pergeseran WIB->UTC.
  const hari = todayISO();
  $("#filterDateFrom").value = addCalendarDaysISO(hari, mulaiHariKe);
  $("#filterDateTo").value = addCalendarDaysISO(hari, akhirHariKe);
  applyDateRangeClearVisibility();
  currentPage = 1;
  render();
}
const btnQuickToday = $("#btnQuickToday");
if (btnQuickToday) btnQuickToday.addEventListener("click", () => isiRentangHariIni(0, 0));
const btnQuickWeek = $("#btnQuickWeek");
// 7 hari bergulir dari hari ini.
if (btnQuickWeek) btnQuickWeek.addEventListener("click", () => isiRentangHariIni(0, 6));
const btnQuickNextWeek = $("#btnQuickNextWeek");
// 7 hari berikutnya setelah "Minggu Ini" — hari ke-7 s.d. ke-13.
if (btnQuickNextWeek) btnQuickNextWeek.addEventListener("click", () => isiRentangHariIni(7, 13));
