"use strict";

/* SARINGAN CEPAT, METRIK, & BENTUK TAMPILAN */

let activePreset = "all";
// Diisi halaman Ringkasan lewat agenda 7 hari
let presetDateOverride = "";

const PRESETS = {
  all: { label: "Semua", test: () => true },
  late: { label: "Perlu tindakan", test: (s) => needsAction(s) },
  today: {
    label: "Jatuh hari ini",
    test: (s) => !isArrived(s) && boardState(s).kind === "today",
  },
  week: {
    label: "7 hari ke depan",
    test: (s) => {
      if (isArrived(s)) return false;
      const st = boardState(s);
      return st.days != null && st.days >= 0 && st.days <= 7;
    },
  },
  nodoc: { label: "Dokumen kurang", test: (s) => hasMissingDocs(s) },
  process: { label: "Proses", test: (s) => s.status === "process" },
  done: { label: "Selesai", test: (s) => isArrived(s) },
};

function presetTest(s) {
  const p = PRESETS[activePreset] || PRESETS.all;
  if (!p.test(s)) return false;
  if (presetDateOverride) {
    const iso = sortBasis() === "etd" ? effectiveEtd(s) : effectiveEta(s);
    if (iso !== presetDateOverride) return false;
  }
  return true;
}

function setPreset(key, opts) {
  activePreset = PRESETS[key] ? key : "all";
  presetDateOverride = (opts && opts.date) || "";
  currentPage = 1;
  syncPresetUI();
  render();
}

// Menyalakan ubin & chip yang sesuai
function syncPresetUI() {
  $$("#presetRow .chip").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.preset === activePreset),
  );
}

/* HITUNGAN */
function presetCounts() {
  const list = currentList();
  const out = {};
  Object.keys(PRESETS).forEach((k) => {
    out[k] = list.filter(PRESETS[k].test).length;
  });
  return out;
}

function updateStats() {
  const c = presetCounts();
  $$("#presetRow [data-count]").forEach((el) => {
    el.textContent = c[el.dataset.count] ?? 0;
  });
  const jumlah = $("#listCount");
  if (jumlah) jumlah.textContent = c.all;
}

/* CATATAN SARINGAN */
function activeFilterSummary() {
  const bits = [];
  if (activePreset !== "all") bits.push(PRESETS[activePreset].label);
  if (presetDateOverride) bits.push(fmtDate(presetDateOverride));
  const q = ($("#searchInput") || {}).value || "";
  if (q.trim()) bits.push(`pencarian “${q.trim()}”`);
  const st = ($("#filterStatus") || {}).value || "";
  if (st) bits.push(`status ${statusLabel(st, activeMode)}`);
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
    `Menampilkan ${shown} dari ${total} — disaring: ${bits.join(", ")}`;
}

function resetAllFilters() {
  activePreset = "all";
  presetDateOverride = "";
  const s = $("#searchInput");
  if (s) s.value = "";
  const st = $("#filterStatus");
  if (st) st.value = "";
  currentPage = 1;
  syncPresetUI();
  syncSearchClear();
  render();
}

function syncSearchClear() {
  const btn = $("#btnClearSearch");
  if (!btn) return;
  btn.classList.toggle("d-none", !(($("#searchInput") || {}).value || ""));
}

/* PENGKABELAN */
const presetRowEl = $("#presetRow");
if (presetRowEl) {
  presetRowEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (btn) setPreset(btn.dataset.preset);
  });
}



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
