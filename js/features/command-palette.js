"use strict";

/* AKSES KEYBOARD */

const cmdkScrimEl = $("#cmdkScrim");
const cmdkInputEl = $("#cmdkInput");
const cmdkListEl = $("#cmdkList");

let cmdkCursor = 0;
let cmdkResults = [];

/* Perintah halaman ikut masuk daftar yang sama supaya tidak perlu
   diingat sebagai fitur terpisah.

   `halaman` = halaman yang dibuka perintah itu (kunci PAGE_VIEWS).
   Perintah ke halaman yang tertutup untuk peran yang sedang masuk tidak
   ditawarkan sama sekali -- lihat cmdkPerintah() dan tabel PERAN di
   session.js. Menawarkannya lalu menolak di router hanya membuang satu
   langkah pengguna. */
const CMDK_COMMANDS = [
  { type: "cmd", halaman: "form", icon: "ik:tambah", get title() { return tt("Tambah jadwal baru", "Add new schedule"); }, get hint() { return tt("Buka form kosong", "Open a blank form"); }, run: () => (location.hash = "#/new") },
  { type: "cmd", halaman: "overview", icon: "ik:dashboard", get title() { return tt("Buka Ringkasan", "Open Overview"); }, get hint() { return t("s.apa.yang.perlu.ditindak.hari.ini"); }, run: () => (location.hash = "#/ringkasan") },
  { type: "cmd", halaman: "schedule", icon: "ik:jadwal", get title() { return tt("Buka Jadwal", "Open Schedule"); }, get hint() { return tt("Daftar pengiriman", "Shipment list"); }, run: () => (location.hash = "#/") },
  /* Yang tidak mengubah data (marketing, finance) membuka halamannya
     untuk membaca riwayat -- bukan "meminta" nomor. */
  { type: "cmd", halaman: "docnum", icon: "ik:dokumen", get title() { return canEdit() ? tt("Permintaan Nomor Dokumen", "Request Document Number") : tt("Buka Nomor Dokumen", "Open Document Numbers"); }, get hint() { return tt("Invoice, DO, dana, surat", "Invoice, DO, fund, letter"); }, run: () => (location.hash = "#/docnum") },
  { type: "cmd", halaman: "hscode", icon: "ik:hscode", get title() { return tt("Buka HS Code", "Open HS Code"); }, get hint() { return tt("Database HS Code", "HS Code database"); }, run: () => (location.hash = "#/hscode") },
  { type: "cmd", halaman: "masterlist", icon: "ik:masterlist", get title() { return tt("Buka Masterlist", "Open Masterlist"); }, get hint() { return tt("Kuota fasilitas & realisasinya", "Facility quota & its realization"); }, run: () => (location.hash = "#/masterlist") },
  { type: "cmd", halaman: "accounts", icon: "ik:akun", get title() { return tt("Kelola Akun", "Manage Accounts"); }, get hint() { return tt("Pengguna & peran", "Users & roles"); }, run: () => (location.hash = "#/akun") },
  { type: "cmd", halaman: "schedule", icon: "ik:tukar", get title() { return tt("Ganti buku Import / Export", "Switch Import / Export book"); }, get hint() { return tt("Pindah antar mode", "Switch between modes"); }, run: () => switchMode(activeMode === "import" ? "export" : "import") },
  { type: "cmd", halaman: "schedule", icon: "ik:perhatian", get title() { return tt("Saring: perlu tindakan", "Filter: needs action"); }, get hint() { return t("s.lewat.eta.atau.delay"); }, run: () => { location.hash = "#/"; setTimeout(() => setOnlyNeedsAction(true), 60); } },
  { type: "cmd", halaman: "schedule", icon: "ik:excel", get title() { return tt("Bulk Export ke Excel", "Bulk Export to Excel"); }, get hint() { return t("s.buku.yang.sedang.aktif"); }, run: () => { location.hash = "#/"; setTimeout(() => $("#btnBulkExport").click(), 60); } },
];

/* Perintah yang boleh dijalankan peran yang sedang masuk. */
function cmdkPerintah() {
  return CMDK_COMMANDS.filter((c) => bolehBuka(c.halaman));
}

function cmdkSearchShipments(q) {
  if (!q) return [];
  const needle = q.toLowerCase();
  const out = [];
  ["import", "export"].forEach((mode) => {
    (data[mode] || []).forEach((s) => {
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
        // Ikut nomor cetakan & nomor PO -- lihat catatan di list.js.
        ...(s.items || []).flatMap((i) => [
          i.namaBarang, i.size, i.pattern, i.moldNo, i.poNo,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return;
      out.push({
        type: "shipment",
        mode,
        id: s.id,
        icon: s.transport === "udara" ? "bi-airplane" : "bi-water",
        title: dispVal(s.party),
        hint: `${dispVal(s.docNo)} · ${dispVal(s.invoice)} · ${fmtDate(s.eta)}`,
      });
    });
  });
  return out.slice(0, 12);
}

function cmdkRender() {
  const q = cmdkInputEl.value.trim();
  const kapal = cmdkSearchShipments(q);
  const tersedia = cmdkPerintah();
  const perintah = q
    ? tersedia.filter((c) => (c.title + " " + c.hint).toLowerCase().includes(q.toLowerCase()))
    : tersedia;

  cmdkResults = [...kapal, ...perintah];
  if (cmdkCursor >= cmdkResults.length) cmdkCursor = 0;

  if (!cmdkResults.length) {
    cmdkListEl.innerHTML = `<div class="cmdk-empty">${tt(`Tidak ada yang cocok dengan “${escapeHtml(q)}”.`, `Nothing matches “${escapeHtml(q)}”.`)}</div>`;
    return;
  }

  let html = "";
  let n = 0;
  if (kapal.length) {
    html += `<div class="cmdk-group">${tt("Pengiriman", "Shipments")}</div>`;
    kapal.forEach((r) => {
      html += cmdkItemHtml(r, n++);
    });
  }
  if (perintah.length) {
    html += `<div class="cmdk-group">${tt("Perintah", "Commands")}</div>`;
    perintah.forEach((r) => {
      html += cmdkItemHtml(r, n++);
    });
  }
  cmdkListEl.innerHTML = html;

  const cur = cmdkListEl.querySelector(".is-cursor");
  if (cur) cur.scrollIntoView({ block: "nearest" });
}

function cmdkItemHtml(r, idx) {
  const tag =
    r.type === "shipment"
      ? `<span class="cmdk-item-tag cmdk-item-tag--${r.mode}">${r.mode === "import" ? "Import" : "Export"}</span>`
      : "";
  return `
    <button type="button" class="cmdk-item ${idx === cmdkCursor ? "is-cursor" : ""}" data-idx="${idx}">
      <span class="cmdk-item-icon">${ikonDari(r.icon)}</span>
      <span class="cmdk-item-main">
        <span class="cmdk-item-title">${escapeHtml(r.title)}</span>
        <span class="cmdk-item-sub">${escapeHtml(r.hint)}</span>
      </span>
      ${tag}
    </button>`;
}

// `langsungEdit` dipakai Ctrl+Enter: untuk pengiriman yang sudah diketahui perlu diubah
function cmdkRun(idx, langsungEdit) {
  const r = cmdkResults[idx];
  if (!r) return;
  closeCmdk();
  if (r.type === "cmd") {
    r.run();
    return;
  }
  if (r.mode !== activeMode) switchMode(r.mode);
  if (langsungEdit) {
    location.hash = "#/edit/" + encodeURIComponent(r.id);
  } else {
    location.hash = "#/";
    setTimeout(() => openDetailView(r.id), 60);
  }
}

/* Yang difokus sebelum palet dibuka: ke sanalah fokus kembali kalau
   palet ditutup tanpa memilih apa pun (Esc / klik di luar). */
let cmdkPemicu = null;
function openCmdk() {
  const aktif = document.activeElement;
  cmdkPemicu = aktif && aktif !== document.body ? { el: aktif, kunci: kunciFokus(aktif) } : null;
  cmdkScrimEl.hidden = false;
  requestAnimationFrame(() => cmdkScrimEl.classList.add("is-open"));
  cmdkInputEl.value = "";
  cmdkCursor = 0;
  cmdkRender();
  cmdkInputEl.focus();
}
function closeCmdk(kembalikanFokus) {
  cmdkScrimEl.classList.remove("is-open");
  setTimeout(() => (cmdkScrimEl.hidden = true), 200);
  const asal = cmdkPemicu;
  cmdkPemicu = null;
  if (!kembalikanFokus || !asal) return;
  const el = asal.el.isConnected ? asal.el : asal.kunci ? document.querySelector(asal.kunci) : null;
  if (el && tampilDiLayar(el)) fokuskan(el, { tanpaGulir: true });
}
function isCmdkOpen() {
  return cmdkScrimEl && cmdkScrimEl.classList.contains("is-open");
}

// Dua pemicu: di sidebar (desktop) dan di bilah atas ponsel
document.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest("[data-cmdk-buka]")) openCmdk();
});
cmdkScrimEl.addEventListener("click", (e) => {
  if (e.target === cmdkScrimEl) closeCmdk(true);
});
cmdkInputEl.addEventListener("input", () => {
  cmdkCursor = 0;
  cmdkRender();
});
cmdkListEl.addEventListener("click", (e) => {
  const item = e.target.closest("[data-idx]");
  if (item) cmdkRun(Number(item.dataset.idx), false);
});
cmdkInputEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    cmdkCursor = Math.min(cmdkCursor + 1, cmdkResults.length - 1);
    cmdkRender();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cmdkCursor = Math.max(cmdkCursor - 1, 0);
    cmdkRender();
  } else if (e.key === "Enter") {
    e.preventDefault();
    cmdkRun(cmdkCursor, e.ctrlKey || e.metaKey);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeCmdk(true);
  }
});

/* PINTASAN GLOBAL */
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/* KEMBALI KE ATAS -- tombol panah di pojok kanan bawah dan pintasan T.
   Yang digulir adalah yang sedang dilihat: isi panel detail kalau panel
   itu terbuka (halaman di belakangnya tertutup tirai), selain itu
   halamannya. */
function gulirKeAtas() {
  const panel = typeof isDetailOpen === "function" && isDetailOpen() ? $("#detailViewBody") : null;
  (panel || window).scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("keydown", (e) => {
  // Ctrl/⌘ + K berlaku di mana pun, termasuk saat sedang mengetik.
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    isCmdkOpen() ? closeCmdk(true) : openCmdk();
    return;
  }
  if (isCmdkOpen() || isTypingTarget(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  /* Pintasan satu huruf tidak berlaku selama ada kotak dialog atau
     panel lonceng yang menunggu: fokusnya di tombol dialog, jadi N
     yang tertekan tidak boleh membuang dialog itu ke halaman lain. */
  if (document.querySelector(".modal.show")) return;
  if (typeof panelNotifTerbuka === "function" && panelNotifTerbuka()) return;

  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "t") {
    if (e.repeat) return;
    e.preventDefault();
    gulirKeAtas();
    return;
  }
  // Selebihnya hanya untuk halaman, bukan saat panel detail menutupinya
  if (typeof isDetailOpen === "function" && isDetailOpen()) return;

  const diJadwal = !$("#viewList").classList.contains("d-none");

  if (k === "/") {
    if (!diJadwal) return;
    e.preventDefault();
    $("#searchInput").focus();
    $("#searchInput").select();
  } else if (k === "n") {
    e.preventDefault();
    location.hash = "#/new";
  } else if (k === "?") {
    e.preventDefault();
    showToast(t("m.pintasan.ctrl.k.cari.cepat.pencarian.n.jadwal."),
      "dark",
    );
  }
});
