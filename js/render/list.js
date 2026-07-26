"use strict";

/* ==================================================================
   GROUPING BY DATE + FILTER/SORT + MAIN RENDER
================================================================== */
/* Dasar tanggal yang sedang dipakai: "eta" atau "etd". Diambil dari
   pemilih urutan, karena rentang tanggal HARUS menyaring hal yang sama
   dengan yang sedang diurutkan — kalau daftar diurutkan menurut ETD tapi
   rentangnya menyaring ETA, hasilnya membingungkan. */
function sortBasis() {
  return String(sortDir || "").startsWith("etd") ? "etd" : "eta";
}
function sortDirection() {
  return String(sortDir || "").endsWith("desc") ? "desc" : "asc";
}
// Tanggal yang dipakai satu pengiriman pada dasar yang sedang aktif.
// Keduanya memakai versi EFEKTIF, jadi jadwal yang sudah dimundurkan
// ikut tersaring & terurut menurut tanggal barunya.
function basisDateOf(s) {
  return sortBasis() === "etd" ? effectiveEtd(s) : effectiveEta(s);
}

function getFiltered() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const statusFilter = $("#filterStatus").value;
  const dari = $("#filterDateFrom").value;
  const sampai = $("#filterDateTo").value;
  return currentList().filter((s) => {
    const hay = [
      s.party,
      s.docNo,
      s.noAju,
      s.invoice,
      s.vessel,
      s.voyage,
      s.forwarder,
      s.forwarderPic,
      ...(s.items || []).map((i) => i.namaBarang),
    ]
      .join(" ")
      .toLowerCase();
    const matchQ = !q || hay.includes(q);
    const matchStatus = !statusFilter || s.status === statusFilter;

    // Rentang tanggal. Perbandingan memakai teks ISO (yyyy-mm-dd) yang
    // sudah urut secara alfabet, jadi tidak perlu mengurai Date sama
    // sekali. Pengiriman yang tanggalnya belum diisi disembunyikan HANYA
    // kalau rentangnya memang sedang dipakai — kalau tidak, ia tetap
    // tampil seperti biasa.
    const tgl = basisDateOf(s);
    let matchRange = true;
    if (dari || sampai) {
      if (!tgl) matchRange = false;
      else if (dari && tgl < dari) matchRange = false;
      else if (sampai && tgl > sampai) matchRange = false;
    }
    return matchQ && matchStatus && matchRange;
  });
}

// Requirement D: 'Filter/sort "terdekat-terjauh" berdasarkan ETA, dan
// pemisah/grouping-nya juga berdasarkan ETA.' Sebelumnya grouping &
// urutan memakai ETD (atau tanggal actual kalau sudah tiba), sehingga
// urutan kartu tidak mencerminkan urutan kedatangan yang jadi acuan
// kerja harian. ETD dipakai HANYA sebagai cadangan kalau ETA benar-benar
// belum diisi, supaya kartunya tetap punya tempat.
function groupKeyOf(s) {
  // Pemisah tanggal mengikuti DASAR yang sedang dipilih (ETA atau ETD),
  // memakai versi EFEKTIF — kartu yang mundur ikut pindah ke kelompok
  // tanggal barunya (lihat effectiveEta/effectiveEtd di core/status.js).
  // Sisi lain dipakai sebagai cadangan supaya kartu yang salah satunya
  // kosong tetap punya tempat.
  return sortBasis() === "etd"
    ? effectiveEtd(s) || effectiveEta(s) || null
    : effectiveEta(s) || effectiveEtd(s) || null;
}

function groupAndSort(list) {
  const groups = new Map();
  const noDate = [];
  list.forEach((s) => {
    const key = groupKeyOf(s);
    if (!key) {
      noDate.push(s);
      return;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });
  let keys = Array.from(groups.keys());
  const arah = sortDirection();
  keys.sort((a, b) => (arah === "asc" ? (a < b ? -1 : 1) : a > b ? -1 : 1));
  const ordered = keys.map((k) => ({ key: k, items: groups.get(k) }));
  if (noDate.length) ordered.push({ key: null, items: noDate });
  return ordered;
}

function render() {
  applyModeLabels();
  const filtered = getFiltered();

  if (filtered.length === 0) {
    cardContainer.innerHTML = "";
    emptyState.classList.remove("d-none");
    renderPaginationBar(0);
    updateStats();
    return;
  }
  emptyState.classList.add("d-none");

  const groups = groupAndSort(filtered);
  const groupByKey = new Map(groups.map((g) => [g.key, g]));

  // Ratakan jadi satu urutan kartu (dipakai untuk potong per halaman),
  // tapi tetap ingat "key" tanggal grup-nya masing-masing supaya divider
  // tanggal tetap bisa ditampilkan dengan benar per halaman.
  const flat = [];
  groups.forEach((g) => {
    g.items.forEach((s) => flat.push({ key: g.key, shipment: s }));
  });

  const totalPages = Math.max(1, Math.ceil(flat.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageSlice = flat.slice(start, start + pageSize);

  let html = "";
  let lastKey;
  pageSlice.forEach((entry, idx) => {
    if (idx === 0 || entry.key !== lastKey) {
      // anyArrived dihitung dari SELURUH anggota grup (bukan cuma yang
      // tampil di halaman ini), supaya status badge tanggal konsisten
      // di halaman berapa pun.
      const g = groupByKey.get(entry.key);
      const anyArrived = g
        ? g.items.every((s) => s.status === "arrived")
        : false;
      const label = entry.key
        ? fmtDateLong(entry.key)
        : "Tanggal Tidak Diketahui";
      html += `
        <div class="date-section">
          <span class="date-section-line"></span>
          <span class="date-section-badge ${anyArrived ? "is-arrived-group" : ""}"><i class="bi ${anyArrived ? "bi-check-circle" : "bi-calendar-event"}"></i> ${label}</span>
          <span class="date-section-line"></span>
        </div>`;
    }
    html += renderCard(entry.shipment);
    lastKey = entry.key;
  });
  cardContainer.innerHTML = html;

  renderPaginationBar(flat.length);
  fixSelectWidths();
  updateStats();
}

/* ==================================================================
   PAGINATION
================================================================== */
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
  const el = $("#lblSectionList");
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

function updateStats() {
  const list = currentList();
  $("#statTotal").textContent = list.length;
  $("#statProcess").textContent = list.filter(
    (s) => s.status === "process",
  ).length;
  // Kartu statistik ketiga sekarang menghitung DELAY (status "transit"
  // sudah tidak ditawarkan lagi — lihat js/core/status.js).
  $("#statDelay").textContent = list.filter(
    (s) => s.status === "delayed",
  ).length;
  $("#statArrived").textContent = list.filter(
    (s) => s.status === "arrived",
  ).length;
}

function applyModeLabels() {
  const lbl = ML();
  $("#lblAddBtn").textContent = lbl.addBtn;
  $("#lblSectionList").textContent = lbl.section;
  $("#lblArrivedStat").textContent = lbl.arrivedStat;
  // Cakupan tombol hapus disebutkan di labelnya, bukan hanya di dialog
  // konfirmasi — supaya tidak perlu ditekan dulu untuk tahu apa yang
  // akan terhapus.
  $("#lblDeleteAll").textContent =
    activeMode === "import" ? "Hapus Semua Import" : "Hapus Semua Export";
  // Pilihan filter status ikut section aktif (requirement D).
  const cur = $("#filterStatus").value;
  $("#filterStatus").innerHTML =
    `<option value="">Semua Status</option>` +
    statusOptionsHtml(activeMode, "").replace(/ selected/g, "");
  $("#filterStatus").value = cur;
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
function sizeSelectToContent(selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  if (!opt) return;
  const m = getMeasurer();
  const cs = getComputedStyle(selectEl);
  m.style.fontFamily = cs.fontFamily;
  m.style.fontSize = cs.fontSize;
  m.style.fontWeight = cs.fontWeight;
  m.style.letterSpacing = cs.letterSpacing;
  m.style.textTransform = cs.textTransform;
  m.textContent = opt.text;
  const textWidth = m.getBoundingClientRect().width;
  selectEl.style.width = Math.ceil(textWidth) + 46 + "px";
}
function fixSelectWidths() {
  $$(".status-select", cardContainer).forEach(sizeSelectToContent);
}

/* ---- Lightweight periodic refresh: only move markers/fill, keep DOM/focus intact ----
   Posisi titik terminal (port-node) sendiri tidak perlu digeser ulang di
   sini karena posisinya tetap (berdasar tanggal masing-masing terminal,
   bukan "hari ini"). Yang perlu diperbarui tiap tick cuma: lebar fill,
   posisi ship-marker, ikon leg yang sedang aktif (bisa berpindah moda di
   tengah transit), dan status "reached" tiap titik. */
function refreshLanePositions() {
  currentList().forEach((s) => {
    const card = cardContainer.querySelector(`.ship-card[data-id="${s.id}"]`);
    if (!card) return;
    const lane = computeLaneModel(s);
    const fill = card.querySelector(".lane-fill");
    const marker = card.querySelector(".ship-marker");
    if (fill) fill.style.width = lane.progress * 100 + "%";
    if (marker) {
      marker.style.left = lane.progress * 100 + "%";
      marker.textContent = lane.icon;
      marker.classList.toggle("sailing", s.status === "transit");
    }
    $$(".port-node", card).forEach((dot, i) => {
      const reached = lane.fractions[i] <= lane.progress + 0.0001;
      dot.classList.toggle("reached", reached);
    });
  });
}
setInterval(refreshLanePositions, 60000);

/* ==================================================================
   MODE SWITCH (navbar)
================================================================== */
$("#tabImport").addEventListener("click", () => switchMode("import"));
$("#tabExport").addEventListener("click", () => switchMode("export"));
// Section aktif diingat supaya REFRESH halaman tidak melempar user
// kembali ke Import (requirement C: "Saat refresh halaman, form harus
// tetap di section yang sama"). Dipakai juga saat form Tambah/Edit
// sedang terbuka, karena label & aturan form ikut section ini.
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
  $("#tabImport").classList.toggle("active", activeMode === "import");
  $("#tabExport").classList.toggle("active", activeMode === "export");
}

function switchMode(mode) {
  activeMode = mode;
  rememberActiveMode(mode);
  $("#tabImport").classList.toggle("active", mode === "import");
  $("#tabExport").classList.toggle("active", mode === "export");
  $("#searchInput").value = "";
  $("#filterStatus").value = "";
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  applyRangeBasisLabel();
  currentPage = 1;
  render();
}

/* ----------------------------------------------------------------
   FILTERS (search / status / sort dir)
   Aslinya bagian terpisah jauh di bawah (dekat BULK EXPORT) di
   script.js lama -- dipindah ke sini karena satu-satunya yang
   dilakukan cuma reset currentPage lalu panggil render(), jadi
   lebih make sense hidup bareng logika render/list lainnya.
---------------------------------------------------------------- */

/* ==================================================================
   FILTERS
================================================================== */
/* Mengetik di kotak cari SEBELUMNYA memicu render() penuh tiap ketukan
   huruf — menyaring, mengurutkan, mengelompokkan, lalu menyusun ulang
   seluruh HTML kartu. Mengetik "dynamic" berarti 7 kali kerja itu, dan
   6 di antaranya hasilnya langsung dibuang. Itu penyebab utama terasa
   berat. Sekarang render ditunda 180ms sejak ketukan TERAKHIR: cukup
   cepat untuk terasa seketika, tapi hanya sekali kerja. */
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
$("#sortDir").addEventListener("change", (e) => {
  sortDir = e.target.value;
  currentPage = 1;
  applyRangeBasisLabel();
  render();
});

// Label rentang ikut berubah (ETA <-> ETD) supaya selalu jelas kolom
// mana yang sedang disaring.
function applyRangeBasisLabel() {
  const el = $("#rangeBasisLabel");
  if (el) el.textContent = sortBasis().toUpperCase();
  const ada = $("#filterDateFrom").value || $("#filterDateTo").value;
  $("#btnClearRange").classList.toggle("d-none", !ada);
}

["filterDateFrom", "filterDateTo"].forEach((idf) => {
  $("#" + idf).addEventListener("change", () => {
    currentPage = 1;
    applyRangeBasisLabel();
    render();
  });
});
$("#btnClearRange").addEventListener("click", () => {
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  currentPage = 1;
  applyRangeBasisLabel();
  render();
});
