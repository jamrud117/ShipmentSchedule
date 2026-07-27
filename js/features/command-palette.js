"use strict";

/* ==================================================================
   AKSES KEYBOARD

   Dua hal di berkas ini: kotak pencarian cepat (Ctrl/⌘ + K) dan
   pintasan global. Keduanya melayani pengguna yang sama — orang yang
   memakai aplikasi ini berjam-jam dan tidak mau memindahkan tangan
   ke tetikus untuk hal yang dilakukan lima puluh kali sehari.

   Nilai utama kotak pencarian: ia mencari lintas Import DAN Export
   sekaligus. Daftar utama hanya menampilkan satu buku pada satu
   waktu, jadi tanpa ini mencari pengiriman di buku sebelah berarti
   berganti mode dulu — dan kehilangan saringan yang sedang dipakai.
================================================================== */

const cmdkScrimEl = $("#cmdkScrim");
const cmdkInputEl = $("#cmdkInput");
const cmdkListEl = $("#cmdkList");

let cmdkCursor = 0;
let cmdkResults = [];

// Perintah halaman ikut masuk daftar yang sama supaya tidak perlu
// diingat sebagai fitur terpisah.
const CMDK_COMMANDS = [
  { type: "cmd", icon: "bi-plus-lg", title: "Tambah jadwal baru", hint: "Buka form kosong", run: () => (location.hash = "#/new") },
  { type: "cmd", icon: "bi-columns-gap", title: "Buka Ringkasan", hint: "Apa yang perlu ditindak hari ini", run: () => (location.hash = "#/ringkasan") },
  { type: "cmd", icon: "bi-list-columns-reverse", title: "Buka Jadwal", hint: "Daftar pengiriman", run: () => (location.hash = "#/") },
  { type: "cmd", icon: "bi-hash", title: "Permintaan Nomor Dokumen", hint: "Invoice, DO, dana, surat", run: () => (location.hash = "#/docnum") },
  { type: "cmd", icon: "bi-arrow-left-right", title: "Ganti buku Import / Export", hint: "Pindah antar mode", run: () => switchMode(activeMode === "import" ? "export" : "import") },
  { type: "cmd", icon: "bi-exclamation-triangle", title: "Saring: perlu tindakan", hint: "Lewat ETA atau delay", run: () => { location.hash = "#/"; setTimeout(() => setPreset("late"), 60); } },
  { type: "cmd", icon: "bi-file-earmark-excel", title: "Bulk Export ke Excel", hint: "Buku yang sedang aktif", run: () => { location.hash = "#/"; setTimeout(() => $("#btnBulkExport").click(), 60); } },
];

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
        ...(s.items || []).map((i) => i.namaBarang),
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
  const perintah = q
    ? CMDK_COMMANDS.filter((c) =>
        (c.title + " " + c.hint).toLowerCase().includes(q.toLowerCase()),
      )
    : CMDK_COMMANDS;

  cmdkResults = [...kapal, ...perintah];
  if (cmdkCursor >= cmdkResults.length) cmdkCursor = 0;

  if (!cmdkResults.length) {
    cmdkListEl.innerHTML = `<div class="cmdk-empty">Tidak ada yang cocok dengan “${escapeHtml(q)}”.</div>`;
    return;
  }

  let html = "";
  let n = 0;
  if (kapal.length) {
    html += `<div class="cmdk-group">Pengiriman</div>`;
    kapal.forEach((r) => {
      html += cmdkItemHtml(r, n++);
    });
  }
  if (perintah.length) {
    html += `<div class="cmdk-group">Perintah</div>`;
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
      ? `<span class="cmdk-item-tag cmdk-item-tag--${r.mode}">${r.mode}</span>`
      : "";
  return `
    <button type="button" class="cmdk-item ${idx === cmdkCursor ? "is-cursor" : ""}" data-idx="${idx}">
      <span class="cmdk-item-icon"><i class="bi ${r.icon}"></i></span>
      <span class="cmdk-item-main">
        <span class="cmdk-item-title">${escapeHtml(r.title)}</span>
        <span class="cmdk-item-sub">${escapeHtml(r.hint)}</span>
      </span>
      ${tag}
    </button>`;
}

// `langsungEdit` dipakai Ctrl+Enter: untuk pengiriman yang sudah
// diketahui perlu diubah, membuka detail dulu cuma satu langkah
// tambahan yang selalu diakhiri menekan "Edit".
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

function openCmdk() {
  cmdkScrimEl.hidden = false;
  requestAnimationFrame(() => cmdkScrimEl.classList.add("is-open"));
  cmdkInputEl.value = "";
  cmdkCursor = 0;
  cmdkRender();
  cmdkInputEl.focus();
}
function closeCmdk() {
  cmdkScrimEl.classList.remove("is-open");
  setTimeout(() => (cmdkScrimEl.hidden = true), 200);
}
function isCmdkOpen() {
  return cmdkScrimEl && cmdkScrimEl.classList.contains("is-open");
}

$("#btnCmdk").addEventListener("click", openCmdk);
cmdkScrimEl.addEventListener("click", (e) => {
  if (e.target === cmdkScrimEl) closeCmdk();
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
    closeCmdk();
  }
});

/* ==================================================================
   PINTASAN GLOBAL

   Semuanya dimatikan saat kursor sedang berada di kotak isian —
   kalau tidak, mengetik "n" pada nama shipper akan melompat ke form
   jadwal baru. Ini penyebab paling umum pintasan huruf tunggal
   terasa "rusak" di aplikasi data.
================================================================== */
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

document.addEventListener("keydown", (e) => {
  // Ctrl/⌘ + K berlaku di mana pun, termasuk saat sedang mengetik.
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    isCmdkOpen() ? closeCmdk() : openCmdk();
    return;
  }
  if (isCmdkOpen() || isTypingTarget(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const diJadwal = !$("#viewList").classList.contains("d-none");

  if (e.key === "/") {
    if (!diJadwal) return;
    e.preventDefault();
    $("#searchInput").focus();
    $("#searchInput").select();
  } else if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    location.hash = "#/new";
  } else if ((e.key === "v" || e.key === "V") && diJadwal) {
    e.preventDefault();
    setViewMode(viewMode === "table" ? "card" : "table");
  } else if (e.key === "?") {
    e.preventDefault();
    showToast(
      "Pintasan: Ctrl+K cari cepat · / pencarian · N jadwal baru · V ganti tampilan",
      "dark",
    );
  }
});
