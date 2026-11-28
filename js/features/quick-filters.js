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

  /* TAB STATUS papan jadwal (desain Peta Laut): jumlah per tab dari
     SELURUH buku aktif, tab yang menyala = nilai #filterStatus. */
  const aktif = ($("#filterStatus") || {}).value || "";
  document.querySelectorAll("[data-status-tab]").forEach((b) => {
    const k = b.dataset.statusTab;
    const n = b.querySelector(".status-tab-n");
    // Dihitung dengan aturan yang SAMA dengan saringannya (getFiltered)
    if (n) {
      const jumlahTab = list.filter((s) => cocokSaringanStatus(s, k)).length;
      n.textContent = jumlahTab;
      n.toggleAttribute("data-nol", jumlahTab === 0); // angka Delay merah hanya kalau ada
    }
    const nyala = k === aktif;
    b.classList.toggle("active", nyala);
    b.setAttribute("aria-pressed", String(nyala));
  });
  geserPenandaTab();

  syncQuickDateActive();
  /* Tombol Hari Ini/Minggu Ini/Minggu Depan & resetDateRangeFilter()
     mengubah #filterDateFrom/To lewat .value langsung tanpa memicu
     event "change" (batasan DOM biasa, bukan lalai) -- disinkronkan
     di sini juga (bukan cuma lewat listener "change" di
     date-range-picker.js) supaya teks tombol pemicu kalender tetap
     benar dari jalur mana pun asalnya. */
  if (typeof drpSyncTriggerFromFilter === "function") drpSyncTriggerFromFilter();
}

/* PENANDA TAB STATUS YANG MENGGESER (css/peta-laut.css, .status-tab::before).

   Diukur pada bingkai berikutnya (requestAnimationFrame), bukan di
   tengah render(): tidak memaksa tata letak tambahan. Peletakan pertama
   langsung di tempatnya -- baru sesudahnya penanda meluncur dari tab ke
   tab. Diukur ulang kalau lebar tabnya berubah (huruf selesai dimuat,
   ganti bahasa, angka bertambah digit). Tersembunyi (halaman lain):
   penanda dilepas, tombol aktif memakai latarnya sendiri. */
let penandaTabRaf = 0;
function geserPenandaTab() {
  const grup = document.getElementById("statusTab");
  if (!grup || penandaTabRaf) return;
  penandaTabRaf = requestAnimationFrame(() => {
    penandaTabRaf = 0;
    const aktif = grup.querySelector("button.active");
    if (!aktif || !grup.offsetParent || !aktif.offsetWidth) {
      grup.classList.remove("punya-penanda", "penanda-gerak");
      return;
    }
    grup.style.setProperty("--penanda-x", aktif.offsetLeft + "px");
    grup.style.setProperty("--penanda-w", aktif.offsetWidth + "px");
    if (!grup.classList.contains("punya-penanda")) {
      grup.classList.add("punya-penanda");
      requestAnimationFrame(() => grup.classList.add("penanda-gerak"));
    }
  });
}
(function pasangPenandaTab() {
  const grup = document.getElementById("statusTab");
  if (!grup || typeof ResizeObserver !== "function") return;
  new ResizeObserver(() => geserPenandaTab()).observe(grup);
})();

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
  /* Saringan STATUS tidak disebut lagi: tab status di atas papan
     (Berjalan / Process / Delay / Arrived / Semua) sudah menunjukkannya
     beserta jumlahnya. Catatan ini hanya untuk pencarian & rentang. */
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
