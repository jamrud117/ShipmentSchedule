"use strict";

/* ==================================================================
   SARINGAN CEPAT, METRIK, & BENTUK TAMPILAN

   Tiga hal ini hidup di satu berkas karena saling terikat: menekan
   ubin metrik = memasang preset, dan preset yang aktif menentukan
   apa yang digambar. Memisahkannya berarti dua sumber kebenaran
   untuk pertanyaan "sedang menyaring apa".

   PRESET yang tersedia — empat pertanyaan yang benar-benar
   ditanyakan tiap pagi:
     all     semua di buku ini
     late    perlu tindakan (lewat ETA & belum selesai, atau DELAY)
     today   jatuh hari ini
     week    tujuh hari ke depan
     nodoc   dokumen wajibnya belum lengkap
     process masih berjalan
     done    sudah selesai
================================================================== */

let activePreset = "all";
// Diisi halaman Ringkasan lewat agenda 7 hari: menekan satu hari
// membuka halaman Jadwal yang sudah tersaring ke tanggal itu.
let presetDateOverride = "";

const PRESETS = {
  all: { label: "Semua", test: () => true },
  late: { label: "Perlu tindakan", test: (s) => needsAction(s) },
  today: {
    label: "Jatuh hari ini",
    test: (s) => s.status !== "arrived" && boardState(s).kind === "today",
  },
  week: {
    label: "7 hari ke depan",
    test: (s) => {
      if (s.status === "arrived") return false;
      const st = boardState(s);
      return st.days != null && st.days >= 0 && st.days <= 7;
    },
  },
  nodoc: { label: "Dokumen kurang", test: (s) => hasMissingDocs(s) },
  process: { label: "Proses", test: (s) => s.status === "process" },
  done: { label: "Selesai", test: (s) => s.status === "arrived" },
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

// Menyalakan ubin & chip yang sesuai. Dua kontrol yang memasang hal
// yang sama harus selalu menyala bersamaan — kalau tidak, pengguna
// akan mengira keduanya saringan yang berbeda.
function syncPresetUI() {
  $$("#presetRow .chip").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.preset === activePreset),
  );
  $$("#metricRow .metric").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.preset === activePreset),
  );
}

/* ------------------------------------------------------------------
   HITUNGAN

   Semua angka di papan & chip dihitung dari SATU daftar yang sama
   (buku yang sedang aktif), bukan dari hasil saringan — kalau tidak,
   menekan "Delay" akan membuat angka Delay berubah jadi total
   dirinya sendiri, dan angka lain jadi nol.
------------------------------------------------------------------ */
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
  const set = (sel, v) => {
    const el = $(sel);
    if (el) el.textContent = v;
  };
  set("#statTotal", c.all);
  set("#statToday", c.today);
  set("#statLate", c.late);
  set("#statProcess", c.process);
  set("#statArrived", c.done);

  $$("#presetRow [data-count]").forEach((el) => {
    el.textContent = c[el.dataset.count] ?? 0;
  });

  /* Baris ringkasan di bawah judul papan ("6 pengiriman · 1 jatuh hari
     ini · 1 perlu tindakan") DIHAPUS. Angka-angka itu sudah tercetak
     di ubin metrik tepat di bawahnya DAN di setiap chip saringan
     cepat — mengulanginya untuk ketiga kali hanya menambah satu baris
     yang harus dilewati mata sebelum sampai ke data. */
  const lbl = ML();

  /* Eyebrow "Buku Import" dihapus: sakelar Import/Export kini berdiri
     tepat di posisinya dan menyatakan hal yang sama, dengan segmen aktif
     menyala — jadi teksnya cuma mengulang apa yang sudah terlihat. */
  const todayLbl = $("#lblTodayStat");
  if (todayLbl) {
    todayLbl.textContent =
      sortBasis() === "etd" ? "Berangkat Hari Ini" : "Tiba Hari Ini";
  }
  const arrivedLbl = $("#lblArrivedStat");
  if (arrivedLbl) arrivedLbl.textContent = lbl.arrivedStat;
}

/* ------------------------------------------------------------------
   CATATAN SARINGAN

   Kalau daftar sedang disaring, harus ada satu kalimat yang bilang
   sedang menyaring apa DAN satu tombol untuk membatalkannya. Tanpa
   itu, "kok datanya hilang" jadi pertanyaan yang wajar.
------------------------------------------------------------------ */
function activeFilterSummary() {
  const bits = [];
  if (activePreset !== "all") bits.push(PRESETS[activePreset].label);
  if (presetDateOverride) bits.push(fmtDate(presetDateOverride));
  const q = ($("#searchInput") || {}).value || "";
  if (q.trim()) bits.push(`pencarian “${q.trim()}”`);
  const st = ($("#filterStatus") || {}).value || "";
  if (st) bits.push(`status ${statusLabel(st, activeMode)}`);
  const dari = ($("#filterDateFrom") || {}).value || "";
  const sampai = ($("#filterDateTo") || {}).value || "";
  if (dari || sampai) {
    bits.push(
      `${sortBasis().toUpperCase()} ${dari ? fmtDate(dari) : "…"} – ${sampai ? fmtDate(sampai) : "…"}`,
    );
  }
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
  const a = $("#filterDateFrom");
  if (a) a.value = "";
  const b = $("#filterDateTo");
  if (b) b.value = "";
  currentPage = 1;
  syncPresetUI();
  applyRangeBasisLabel();
  syncSearchClear();
  render();
}

function syncSearchClear() {
  const btn = $("#btnClearSearch");
  if (!btn) return;
  btn.classList.toggle("d-none", !(($("#searchInput") || {}).value || ""));
}

/* ==================================================================
   BENTUK TAMPILAN: MANIFES vs KARTU

   Manifes untuk MEMBANDINGKAN banyak, Kartu untuk MEMBACA satu.
   Pilihannya diingat per peramban — ini preferensi kerja, bukan
   keadaan sesaat, jadi tidak boleh direset tiap muat ulang.
================================================================== */
const VIEW_MODE_KEY = "eximddi.viewMode";
let viewMode = "table";

function restoreViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "table" || saved === "card") viewMode = saved;
  } catch (err) {
    /* localStorage bisa diblokir (mode privat) — abaikan */
  }
  syncViewToggle();
}

function setViewMode(mode) {
  viewMode = mode === "card" ? "card" : "table";
  try {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  } catch (err) {
    /* abaikan */
  }
  syncViewToggle();
  render();
}

function syncViewToggle() {
  $$("#viewToggle button").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.view === viewMode),
  );
}

/* ==================================================================
   PENGKABELAN
================================================================== */
const presetRowEl = $("#presetRow");
if (presetRowEl) {
  presetRowEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (btn) setPreset(btn.dataset.preset);
  });
}

const metricRowEl = $("#metricRow");
if (metricRowEl) {
  metricRowEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    // Menekan ubin yang sudah aktif = melepas saringannya. Tanpa ini
    // pengguna harus mencari tombol lain untuk kembali ke "semua".
    setPreset(btn.dataset.preset === activePreset ? "all" : btn.dataset.preset);
  });
}

const viewToggleEl = $("#viewToggle");
if (viewToggleEl) {
  viewToggleEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) setViewMode(btn.dataset.view);
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
