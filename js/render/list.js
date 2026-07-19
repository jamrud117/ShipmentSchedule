"use strict";

/* ==================================================================
   GROUPING BY DATE + FILTER/SORT + MAIN RENDER
================================================================== */
function getFiltered() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const statusFilter = $("#filterStatus").value;
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
    return matchQ && matchStatus;
  });
}

function groupKeyOf(s) {
  if (s.status === "arrived" && s.actual) return s.actual;
  return s.etd || null;
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
  keys.sort((a, b) =>
    sortDir === "asc" ? new Date(a) - new Date(b) : new Date(b) - new Date(a),
  );
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
  $("#statTransit").textContent = list.filter(
    (s) => s.status === "transit",
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
function switchMode(mode) {
  activeMode = mode;
  $("#tabImport").classList.toggle("active", mode === "import");
  $("#tabExport").classList.toggle("active", mode === "export");
  $("#searchInput").value = "";
  $("#filterStatus").value = "";
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
$("#searchInput").addEventListener("input", () => {
  currentPage = 1;
  render();
});
$("#filterStatus").addEventListener("change", () => {
  currentPage = 1;
  render();
});
$("#sortDir").addEventListener("change", (e) => {
  sortDir = e.target.value;
  currentPage = 1;
  render();
});
