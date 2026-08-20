"use strict";

/* GROUPING BY DATE + FILTER/SORT + MAIN RENDER */
/* Dasar tanggal aktif: "eta" atau "etd" */
/* Urutan & pengelompokan selalu memakai ETA — pemilih ETA/ETD dihapus
   bersama saringan rentang tanggal. */
/* Label dasar urutan yang ditampilkan di pemisah tanggal.

   Import diurutkan menurut ESTIMATED DELIVERY — itulah tanggal yang
   dijanjikan ke bagian lain, dan yang menentukan kapan sebuah kiriman
   perlu ditindak. ETA hanya tanggal tiba di pelabuhan; masih ada
   clearance dan pengantaran sesudahnya.

   Export tetap menurut Stuffing: yang dikerjakan tim untuk sebuah
   ekspor adalah menyiapkan muatan pada hari itu. */
function sortBasis() {
  return activeMode === "export" ? "stuffing" : "estimasi kirim";
}
// Selalu menaik: yang paling dekat di paling atas
function sortDirection() {
  return "asc";
}

/* Tanda pisah dibuang supaya "PFSX-260480" dan "PFSX260480" saling
   ketemu. Hanya dipakai sebagai pencocokan CADANGAN — pencarian apa
   adanya tetap dicoba lebih dulu, supaya spasi yang sengaja diketik
   pengguna masih berarti. */
function tanpaPemisah(t) {
  return String(t || "").replace(/[\s./_-]+/g, "");
}

function getFiltered() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const statusFilter = $("#filterStatus").value;
  return currentList().filter((s) => {
    /* Pencarian menjangkau SEMUA yang terbaca di kartu & panel detail.

       Master/House B/L-AWB dulu tidak ikut, padahal nomor itulah yang
       paling sering dipakai mencari — dari e-mail forwarder atau dari
       dokumen di tangan. Mencari "FGLQA2608005" mengembalikan kosong
       walau nomornya jelas tertulis di kartunya.

       Nomor B/L, kontainer, dan HS Code kerap ditulis dengan tanda
       pisah yang berbeda-beda ("PFSX-260480" vs "PFSX260480"), jadi
       pencarian dicocokkan DUA KALI: apa adanya, dan setelah tanda
       baca dibuang di kedua sisi. */
    const hay = [
      s.party,
      s.docNo,
      s.noAju,
      s.invoice,
      s.masterBL,
      s.houseBL,
      s.vessel,
      s.voyage,
      s.container,
      s.forwarder,
      s.forwarderPic,
      s.origin,
      s.destination,
      s.incoterm,
      s.muatan,
      s.notes,
      ...(s.items || []).flatMap((i) => [i.namaBarang, i.hsCode]),
    ]
      .join(" ")
      .toLowerCase();
    const matchQ = !q || hay.includes(q) || tanpaPemisah(hay).includes(tanpaPemisah(q));
    const matchStatus = !statusFilter || s.status === statusFilter;

    /* Chip saringan cepat ikut menyaring di sini juga, supaya paginasi,
       hitungan, dan Bulk Export melihat daftar yang sama dengan layar. */
    if (!presetTest(s)) return false;

    return matchQ && matchStatus;
  });
}

// Pemisah tanggal & urutan selalu memakai ETA efektif
/* Kunci pengelompokan (jadi pemisah tanggal di layar).

   Untuk yang SUDAH TIBA, yang relevan bukan lagi perkiraan tiba
   melainkan tanggal barang benar-benar masuk pabrik. Kalau tanggal itu
   kosong (ditandai tiba secara manual), dipakai ETA efektifnya. */
function groupKeyOf(s) {
  /* Yang sudah tiba dikelompokkan menurut tanggal KEJADIANNYA:
       Import -> In Factory (barang masuk pabrik)
       Export -> Stuffing   (muatan selesai dinaikkan)
     Estimated Delivery sengaja tidak dipakai — ia perkiraan, dan
     mengurutkan riwayat menurut perkiraan membuat urutannya meleset
     dari kejadian sebenarnya. */
  if (isArrived(s)) {
    const nyata =
      s.mode === "export" ? s.actual || s.factoryDate : s.factoryDate;
    return nyata || effectiveEta(s) || effectiveEtd(s) || null;
  }

  /* Buku EXPORT diurutkan menurut tanggal STUFFING, bukan ETA.
     Yang dikerjakan tim EXIM untuk sebuah ekspor adalah menyiapkan
     muatan pada hari stuffing; ETA-nya (tiba di pelabuhan pembeli)
     baru urusan berminggu-minggu kemudian dan tidak menuntut apa pun
     dari sisi sini.

     Kolom `actual` di buku Export memang berlabel "Stuffing": selama
     tanggalnya belum tercapai ia berperan sebagai RENCANA, dan begitu
     terlewati jadwalnya otomatis dianggap selesai (lihat isArrived). */
  if (activeMode === "export") {
    return s.actual || effectiveEtd(s) || effectiveEta(s) || null;
  }
  /* IMPORT yang belum tiba: Estimated Delivery.

     `actual` di buku Import berisi Estimated Delivery — hasil mesin
     prediksi saat mode Auto, atau tanggal yang dipatok pengguna saat
     mode Manual. Itulah tanggal yang dijanjikan ke bagian lain.

     Jatuh ke ETA lalu ETD kalau belum ada: jadwal yang baru dibuat
     belum tentu punya perkiraan, dan menaruhnya di kelompok "tanpa
     tanggal" membuatnya hilang dari pandangan. */
  return s.actual || effectiveEta(s) || effectiveEtd(s) || null;
}

/* ------------------------------------------------------------------
   URUTAN DAFTAR

   Dua kelompok, bukan satu deret:

     1. BELUM TIBA  — diurutkan dari tanggal terdekat, karena inilah
                      yang perlu ditindak lebih dulu.
     2. SUDAH TIBA  — ditaruh di belakang seluruhnya, diurutkan dari
                      tanggal tiba TERBARU ke terlama.

   Yang sudah tiba tidak lagi menuntut tindakan, jadi tidak ada gunanya
   ia menyela di tengah daftar hanya karena tanggalnya kebetulan
   berdekatan. Dan begitu dilihat, yang dicari biasanya "yang baru saja
   masuk" — karena itu urutannya dibalik.
------------------------------------------------------------------ */
function groupAndSort(list) {
  const aktif = new Map();
  const tiba = new Map();
  const tanpaTanggal = [];

  list.forEach((s) => {
    const key = groupKeyOf(s);
    if (!key) {
      tanpaTanggal.push(s);
      return;
    }
    const wadah = isArrived(s) ? tiba : aktif;
    if (!wadah.has(key)) wadah.set(key, []);
    wadah.get(key).push(s);
  });

  const susun = (peta, menaik) =>
    Array.from(peta.keys())
      .sort((a, b) => (menaik ? (a < b ? -1 : 1) : a > b ? -1 : 1))
      .map((k) => ({ key: k, items: peta.get(k) }));

  const ordered = [
    ...susun(aktif, sortDirection() === "asc"),
    ...susun(tiba, false),
  ];
  if (tanpaTanggal.length) ordered.push({ key: null, items: tanpaTanggal });
  return ordered;
}

/* URUTAN TAMPIL — satu sumber */
function flattenGroups(groups) {
  const flat = [];
  groups.forEach((g) => {
    g.items.forEach((s) => flat.push({ key: g.key, shipment: s }));
  });
  return flat;
}

// Urutan yang benar-benar tampil. Dipakai bersama render() & panel detail
function orderedFiltered() {
  return flattenGroups(groupAndSort(getFiltered())).map((e) => e.shipment);
}

function render() {
  applyModeLabels();
  syncSearchClear();
  const filtered = getFiltered();
  const totalInBook = currentList().length;

  if (filtered.length === 0) {
    cardContainer.innerHTML = "";
    emptyState.classList.remove("d-none");
    renderPaginationBar(0);
    updateStats();
    renderFilterNote(0, totalInBook);
    return;
  }
  emptyState.classList.add("d-none");

  const groups = groupAndSort(filtered);
  const groupByKey = new Map(groups.map((g) => [g.key, g]));

  const flat = flattenGroups(groups);

  const totalPages = Math.max(1, Math.ceil(flat.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageSlice = flat.slice(start, start + pageSize);

  let html = "";
  let lastKey;

  pageSlice.forEach((entry, idx) => {
    if (idx === 0 || entry.key !== lastKey) {
      // anyArrived dihitung dari SELURUH anggota grup (bukan cuma yang tampil di halaman ini)
      const g = groupByKey.get(entry.key);
      const anyArrived = g
        ? g.items.every((s) => isArrived(s))
        : false;
      const jumlah = g ? g.items.length : 0;
      const label = entry.key
        ? fmtDateLong(entry.key)
        : "Tanggal tidak diketahui";
      html += `
        <div class="date-section">
          <span class="date-section-badge ${anyArrived ? "is-arrived-group" : ""}"><i class="bi ${anyArrived ? "bi-check-circle" : "bi-calendar-event"}"></i> ${label}</span>
          <span class="date-section-line"></span>
          <span class="date-section-count">${jumlah} pengiriman · ${sortBasis().toUpperCase()}</span>
        </div>`;
    }
    html += renderCard(entry.shipment);
    lastKey = entry.key;
  });
  cardContainer.innerHTML = html;

  renderPaginationBar(flat.length);
  fixSelectWidths();
  updateStats();
  renderFilterNote(flat.length, totalInBook);
}

/* PAGINATION */
function paginationRange(current, total) {
  const delta = 1;
  const range = [];
  const withDots = [];
  let last;
  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - delta && i <= current + delta)
    ) {
      range.push(i);
    }
  }
  range.forEach((i) => {
    if (last != null) {
      if (i - last === 2) withDots.push(last + 1);
      else if (i - last !== 1) withDots.push("...");
    }
    withDots.push(i);
    last = i;
  });
  return withDots;
}

function scrollToListTop() {
  const el = $("#lblListCaption");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPaginationBar(totalItems) {
  const bar = $("#paginationBar");
  if (!bar) return;
  if (totalItems === 0) {
    bar.className = "";
    bar.innerHTML = "";
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  const pageBtns = paginationRange(currentPage, totalPages)
    .map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`,
    )
    .join("");

  bar.className = "pagination-bar";
  bar.innerHTML = `
    <div class="pagination-info">Menampilkan <b>${startIdx}–${endIdx}</b> dari <b>${totalItems}</b> pengiriman</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" id="pagePrev" ${currentPage <= 1 ? "disabled" : ""} title="Halaman sebelumnya"><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${pageBtns}</div>
      <button type="button" class="page-nav" id="pageNext" ${currentPage >= totalPages ? "disabled" : ""} title="Halaman berikutnya"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="pageSizeSelect">Per halaman</label>
      <select id="pageSizeSelect">
        ${[5, 10, 20, 50]
          .map(
            (n) =>
              `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n}</option>`,
          )
          .join("")}
      </select>
    </div>`;
}

$("#paginationBar").addEventListener("click", (e) => {
  const pageBtn = e.target.closest("[data-page]");
  if (pageBtn) {
    currentPage = Number(pageBtn.dataset.page);
    render();
    scrollToListTop();
    return;
  }
  if (e.target.closest("#pagePrev")) {
    currentPage = Math.max(1, currentPage - 1);
    render();
    scrollToListTop();
    return;
  }
  if (e.target.closest("#pageNext")) {
    currentPage = currentPage + 1;
    render();
    scrollToListTop();
  }
});
$("#paginationBar").addEventListener("change", (e) => {
  if (e.target.id === "pageSizeSelect") {
    pageSize = Number(e.target.value) || 5;
    currentPage = 1;
    render();
  }
});

/* updateStats() sekarang tinggal di js/features/quick-filters.js — */

let filterStatusPernahDisetel = false;
function applyModeLabels() {
  const lbl = ML();
  document.body.classList.toggle("mode-export", activeMode === "export");
  document.body.classList.toggle("mode-import", activeMode !== "export");
  $("#lblAddBtn").textContent = lbl.addBtn;
  /* Tooltip ikut berubah: di layar sempit labelnya disembunyikan dan
     tooltip jadi satu-satunya keterangan tombol itu. */
  $("#btnAdd").title = lbl.addBtn;
  $("#lblSectionList").textContent = lbl.section;
  // Cakupan tombol hapus disebutkan di labelnya, bukan hanya di dialog konfirmasi
  $("#lblDeleteAll").textContent =
    activeMode === "import" ? "Hapus semua import" : "Hapus semua export";
  // Pilihan filter status ikut section aktif (requirement D).
  const cur = $("#filterStatus").value;
  $("#filterStatus").innerHTML =
    `<option value="">Semua Status</option>` +
    statusOptionsHtml(activeMode, "").replace(/ selected/g, "");
  /* Pilihan yang sedang aktif dikembalikan setelah daftarnya diisi
     ulang — KECUALI pada gambar pertama, yang dimulai dari nilai
     bawaan. Sesudah itu pilihan pengguna dihormati; kalau tidak,
     saringannya akan melompat balik ke Process setiap kali daftar
     digambar ulang. */
  $("#filterStatus").value = filterStatusPernahDisetel
    ? cur
    : nilaiFilterStatusBawaan();
  filterStatusPernahDisetel = true;
}

/* Nilai bawaan hanya dipakai kalau memang ADA pilihannya di buku ini.
   Kalau suatu saat "process" dihapus dari salah satu buku, lebih baik
   jatuh ke "Semua Status" daripada menyetel nilai yang tidak ada —
   <select> yang nilainya asing akan diam-diam jadi kosong. */
function nilaiFilterStatusBawaan() {
  const ada = (STATUS_OPTIONS_BY_MODE[activeMode] || []).includes(
    FILTER_STATUS_DEFAULT,
  );
  return ada ? FILTER_STATUS_DEFAULT : "";
}

/* ---- Make each status <select> exactly as wide as its selected text ---- */
let measurerEl = null;
function getMeasurer() {
  if (measurerEl) return measurerEl;
  measurerEl = document.createElement("span");
  measurerEl.style.position = "absolute";
  measurerEl.style.visibility = "hidden";
  measurerEl.style.whiteSpace = "nowrap";
  measurerEl.style.top = "-9999px";
  measurerEl.style.left = "-9999px";
  document.body.appendChild(measurerEl);
  return measurerEl;
}
/* LEBAR KOTAK STATUS — diukur berkelompok, bukan satu per satu.

   Versi lama mengerjakan tiap kotak sampai tuntas: baca gaya, tulis ke
   pengukur, baca lebarnya, tulis lebar kotaknya. Tulis-baca yang
   berselang-seling memaksa peramban menghitung ulang tata letak SETIAP
   PUTARAN — papan berisi 200 kartu berarti 200 perhitungan paksa.

   Dua hal yang diperbaiki:

   1. Dipisah jadi tiga tahap — baca semua, ukur, baru tulis semua.
   2. Hasil ukuran DIPAKAI ULANG. Isi kotak status cuma segelintir
      ("Process", "In Transit", "Arrived"...), jadi 200 kartu paling
      butuh beberapa pengukuran, bukan 200.

   Ingatannya sengaja hanya sepanjang satu panggilan: font halaman
   dimuat dengan `display=swap`, dan ukuran yang disimpan lintas render
   bisa jadi hasil pengukuran memakai font sementara. */
function fixSelectWidths() {
  const kotak = $$(".status-select", cardContainer);
  if (!kotak.length) return;

  // 1. BACA semua dulu — tanpa satu pun tulis di antaranya.
  const tugas = [];
  kotak.forEach((el) => {
    const opt = el.options[el.selectedIndex];
    if (!opt) return;
    const cs = getComputedStyle(el);
    tugas.push({
      el,
      teks: opt.text,
      cs,
      kunci: [cs.fontFamily, cs.fontSize, cs.fontWeight,
        cs.letterSpacing, cs.textTransform, opt.text].join("|"),
    });
  });
  if (!tugas.length) return;

  // 2. UKUR hanya yang belum pernah diukur di panggilan ini.
  const m = getMeasurer();
  const lebar = new Map();
  tugas.forEach((t) => {
    if (lebar.has(t.kunci)) return;
    m.style.fontFamily = t.cs.fontFamily;
    m.style.fontSize = t.cs.fontSize;
    m.style.fontWeight = t.cs.fontWeight;
    m.style.letterSpacing = t.cs.letterSpacing;
    m.style.textTransform = t.cs.textTransform;
    m.textContent = t.teks;
    lebar.set(t.kunci, m.getBoundingClientRect().width);
  });

  // 3. TULIS semua.
  tugas.forEach((t) => {
    t.el.style.width = Math.ceil(lebar.get(t.kunci)) + 46 + "px";
  });
}

/* Penyegaran ringan: hanya geser penanda, DOM & fokus tidak disentuh */
function refreshLanePositions() {
  currentList().forEach((s) => {
    const card = cardContainer.querySelector(`.ship-card[data-id="${s.id}"]`);
    if (!card) return;
    const lane = computeLaneModel(s);
    const fill = card.querySelector(".lane-fill");
    const marker = card.querySelector(".ship-marker");
    if (fill) fill.style.width = lane.progress * 100 + "%";
    const sisa = card.querySelector(".lane-remaining");
    if (sisa) sisa.textContent = laneRemainingLabel(s);
    if (marker) {
      marker.style.left = lane.progress * 100 + "%";
      const ikon = marker.querySelector(".marker-icon");
      if (ikon) ikon.innerHTML = lane.icon;
      /* Kelasnya ikut diperbarui: sebuah pengiriman bisa berangkat atau
         sampai sementara halaman dibiarkan terbuka */
      const bergerak = !isArrived(s) && lane.progress > 0.05 && lane.progress < 1;
      marker.classList.toggle("at-start", lane.progress <= 0.001);
      marker.classList.toggle("at-end", lane.progress >= 0.999);
      marker.classList.toggle("is-moving", bergerak);
      marker.classList.toggle("is-air", !!lane.leg && lane.leg.mode === "udara");
      marker.classList.toggle("is-sea", !lane.leg || lane.leg.mode !== "udara");
    }
    $$(".port-node", card).forEach((dot, i) => {
      const reached = lane.fractions[i] <= lane.progress + 0.0001;
      dot.classList.toggle("reached", reached);
    });
  });
}
setInterval(refreshLanePositions, 60000);

/* MODE SWITCH (navbar) */
/* Sakelar buku Import/Export kini muncul di kepala papan SETIAP halaman */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-tabs [data-mode]");
  if (!btn) return;
  if (btn.dataset.mode !== activeMode) switchMode(btn.dataset.mode);
});

function syncModeTabs(mode) {
  $$(".mode-tabs [data-mode]").forEach((b) => {
    const aktif = b.dataset.mode === mode;
    b.classList.toggle("active", aktif);
    b.setAttribute("aria-selected", aktif ? "true" : "false");
  });
}
// Section aktif diingat supaya REFRESH halaman tidak melempar user kembali ke Import
const ACTIVE_MODE_KEY = "eximddi.activeMode";
function rememberActiveMode(mode) {
  try {
    localStorage.setItem(ACTIVE_MODE_KEY, mode);
  } catch (err) {
    /* localStorage bisa diblokir (mode privat) — abaikan, tidak fatal */
  }
}
function restoreActiveMode() {
  try {
    const saved = localStorage.getItem(ACTIVE_MODE_KEY);
    if (saved === "import" || saved === "export") activeMode = saved;
  } catch (err) {
    /* abaikan */
  }
  syncModeTabs(activeMode);
}

function switchMode(mode) {
  activeMode = mode;
  rememberActiveMode(mode);
  syncModeTabs(mode);
  $("#searchInput").value = "";
  // Pindah buku = membuka daftar yang lain; mulai dari bawaan lagi.
  $("#filterStatus").value = nilaiFilterStatusBawaan();
  // Preset ikut dilepas: "perlu tindakan" di buku Import bukan pertanyaan yang sama dengan di buku
  activePreset = "all";
  presetDateOverride = "";
  syncPresetUI();
  syncSearchClear();
  currentPage = 1;
  render();

  /* Halaman Ringkasan TIDAK ikut terbarui sebelumnya: render() hanya */
  if (
    typeof renderOverview === "function" &&
    !$("#viewOverview").classList.contains("d-none")
  ) {
    renderOverview();
  }
}

/* FILTERS (search / status / sort dir) */

/* FILTERS */
/* Mengetik di kotak cari SEBELUMNYA memicu render() penuh tiap ketukan */
let searchTimer = null;
$("#searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 1;
    render();
  }, 180);
});
$("#filterStatus").addEventListener("change", () => {
  currentPage = 1;
  render();
});

// Label rentang ikut berubah (ETA <-> ETD) supaya selalu jelas kolom mana yang sedang disaring

