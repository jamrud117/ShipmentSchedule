"use strict";

/* ==================================================================
   KRONOLOGI CATATAN (notes log)

   Sebelumnya "Catatan" cuma SATU kotak teks bebas: tiap ada kejadian
   baru, catatan lama ketimpa atau harus disambung manual, dan tidak ada
   jejak kapan sesuatu terjadi. Sekarang catatan disimpan sebagai DAFTAR
   entri, masing-masing ber-tanggal & jam — seperti riwayat chat — supaya
   kronologi tiap kasus (delay, dokumen kurang, kapal ganti, dsb) bisa
   dibaca urut dari atas ke bawah.

   BENTUK DATA
     shipment.notesLog = [{ id, ts, text }, ...]  (terbaru di BAWAH)
       ts = ISO datetime saat entri dibuat (bukan tanggal kejadian)
   Disimpan di kolom `shipments.notes_log` (jsonb) — lihat
   schema-migration.sql.

   KOMPATIBILITAS
     Kolom lama `shipments.notes` (teks biasa) TETAP ada dan TETAP diisi,
     berisi teks entri TERBARU. Alasannya: kolom REMARK/NOTES di semua
     template copy & Bulk Export membaca `s.notes`, jadi dengan cara ini
     tidak ada satu pun template yang perlu diubah. Data lama yang sudah
     terlanjur mengisi `notes` otomatis muncul sebagai entri pertama di
     kronologi (tanpa jam, karena waktunya memang tidak pernah dicatat).

   DI MANA DITARUH (jawaban atas "aku bingung harus ditaruh dimana")
     1. FORM Tambah/Edit — panel penuh: kotak tulis + timeline + tombol
        hapus per entri. Tempatnya menggantikan field "Catatan" lama,
        jadi tidak ada bagian form baru yang bikin form makin panjang.
     2. KARTU dashboard (tampilan expanded) — timeline ringkas 3 entri
        terakhir + kotak tulis cepat. Ini yang paling sering dipakai:
        kejadian harian bisa dicatat tanpa harus buka form edit dulu.
================================================================== */

// Entri log bisa datang dari database sebagai array, string JSON, atau
// null (baris lama) — semuanya dinormalkan ke array di satu tempat ini.
function normalizeNotesLog(raw, legacyNotes) {
  let arr = raw;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch (err) {
      arr = null;
    }
  }
  if (!Array.isArray(arr)) arr = [];

  const out = arr
    .filter((e) => e && String(e.text || "").trim())
    .map((e) => ({
      id: e.id || uid("note"),
      ts: e.ts || "",
      text: String(e.text).trim(),
    }));

  // Data lama: `notes` berisi teks tanpa riwayat. Ditampilkan sebagai
  // entri pertama supaya tidak hilang, ditandai tanpa waktu.
  const legacy = String(legacyNotes || "").trim();
  if (!out.length && legacy) {
    out.push({ id: uid("note"), ts: "", text: legacy });
  }
  return out;
}

function newNoteEntry(text) {
  return { id: uid("note"), ts: new Date().toISOString(), text: text.trim() };
}

// Teks yang disalin ke kolom `notes` (dipakai template copy sbg REMARK).
function notesLogToPlainNotes(log) {
  if (!log || !log.length) return "";
  return log[log.length - 1].text;
}

// "25 Jul 2026 · 14:30" — entri lama tanpa waktu ditandai jelas supaya
// tidak dikira dicatat hari ini.
function fmtNoteStamp(ts) {
  if (!ts) return "catatan lama (tanpa waktu)";
  const d = new Date(ts);
  if (isNaN(d)) return "catatan lama (tanpa waktu)";
  const tgl = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const jam = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${tgl} · ${jam}`;
}

/* ------------------------------------------------------------------
   TIMELINE DI FORM
------------------------------------------------------------------ */
function renderNotesTimeline() {
  const box = $("#notesTimeline");
  if (!box) return;
  if (!draftNotesLog.length) {
    box.innerHTML = `<div class="note-empty">Belum ada catatan. Tulis kronologi pertama di kotak atas — tiap entri otomatis diberi tanggal & jam.</div>`;
    return;
  }
  // Terbaru DI ATAS saat dibaca, walau di data urutannya kronologis —
  // yang paling sering dicari user adalah kejadian terakhir.
  box.innerHTML = [...draftNotesLog]
    .reverse()
    .map(
      (e, i) => `
      <div class="note-entry${i === 0 ? " note-entry--latest" : ""}" data-note-id="${e.id}">
        <div class="note-entry-head">
          <span class="note-stamp"><i class="bi bi-clock"></i> ${escapeHtml(fmtNoteStamp(e.ts))}</span>
          <button type="button" class="note-del" data-act="del-note" data-note-id="${e.id}" title="Hapus catatan ini">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="note-text">${escapeHtml(e.text)}</div>
      </div>`,
    )
    .join("");
}

function addDraftNote() {
  const el = $("#fNoteDraft");
  const text = el.value.trim();
  if (!text) {
    showToast("Tulis dulu isi catatannya.", "dark");
    return;
  }
  draftNotesLog.push(newNoteEntry(text));
  el.value = "";
  renderNotesTimeline();
}

$("#btnAddNote").addEventListener("click", addDraftNote);
// Ctrl/Cmd+Enter = kirim, biar tidak perlu pindah ke tombol.
$("#fNoteDraft").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    addDraftNote();
  }
});
$("#notesTimeline").addEventListener("click", (e) => {
  const btn = e.target.closest('[data-act="del-note"]');
  if (!btn) return;
  draftNotesLog = draftNotesLog.filter((x) => x.id !== btn.dataset.noteId);
  renderNotesTimeline();
});

/* ------------------------------------------------------------------
   TIMELINE RINGKAS DI KARTU DASHBOARD
------------------------------------------------------------------ */
const CARD_NOTES_PREVIEW = 3;

function cardNotesHtml(s) {
  const log = normalizeNotesLog(s.notesLog, s.notes);
  const shown = [...log].reverse().slice(0, CARD_NOTES_PREVIEW);
  const sisa = log.length - shown.length;

  const list = shown.length
    ? shown
        .map(
          (e) => `
        <div class="card-note">
          <div class="card-note-stamp">${escapeHtml(fmtNoteStamp(e.ts))}</div>
          <div class="card-note-text">${escapeHtml(e.text)}</div>
        </div>`,
        )
        .join("")
    : `<div class="note-empty">Belum ada kronologi.</div>`;

  return `
  <div class="card-notes">
    <div class="card-notes-head">
      <span><i class="bi bi-chat-left-text"></i> Kronologi &amp; Catatan${log.length ? ` (${log.length})` : ""}</span>
      ${sisa > 0 ? `<span class="card-notes-more">+${sisa} lagi — buka Edit untuk lihat semua</span>` : ""}
    </div>
    <div class="card-notes-list">${list}</div>
    <div class="card-note-add">
      <input type="text" class="card-note-input" data-note-input="${s.id}"
             placeholder="Tambah kronologi (tanggal &amp; jam otomatis)..." />
      <button type="button" class="btn-note-send" data-action="addNote" data-id="${s.id}">
        <i class="bi bi-send"></i>
      </button>
    </div>
  </div>`;
}

// Dipanggil dari card-events.js saat tombol kirim / Enter ditekan.
async function addNoteFromCard(id) {
  const s = currentList().find((x) => x.id === id);
  if (!s) return;
  const input = document.querySelector(`[data-note-input="${id}"]`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) {
    showToast("Tulis dulu isi catatannya.", "dark");
    return;
  }
  const log = normalizeNotesLog(s.notesLog, s.notes);
  log.push(newNoteEntry(text));
  s.notesLog = log;
  s.notes = notesLogToPlainNotes(log);
  input.value = "";
  render();
  await persistFields(id, { notesLog: s.notesLog, notes: s.notes });
  showToast("Catatan ditambahkan.", "success");
}
