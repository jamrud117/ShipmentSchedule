"use strict";

/* KRONOLOGI CATATAN (notes log) */

// Entri log bisa datang dari database sebagai array, string JSON, atau null
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

  // Data lama: `notes` berisi teks tanpa riwayat
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

// "25 Jul 2026 · 14:30" — entri lama tanpa waktu ditandai jelas supaya tidak dikira dicatat hari
function fmtNoteStamp(ts) {
  if (!ts) return tt("catatan lama (tanpa waktu)", "old note (no timestamp)");
  const d = new Date(ts);
  if (isNaN(d)) return tt("catatan lama (tanpa waktu)", "old note (no timestamp)");
  const tgl = d.toLocaleDateString(activeLang === "en" ? "en-GB" : "id-ID", {
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

/* TIMELINE DI FORM */
function renderNotesTimeline() {
  const box = $("#notesTimeline");
  if (!box) return;
  if (!draftNotesLog.length) {
    box.innerHTML = `<div class="note-empty">${t("v.belum.ada.catatan.tulis.kronologi.pertama.di.k")}</div>`;
    return;
  }
  // Terbaru DI ATAS saat dibaca, walau di data urutannya kronologis
  box.innerHTML = [...draftNotesLog]
    .reverse()
    .map(
      (e, i) => `
      <div class="note-entry${i === 0 ? " note-entry--latest" : ""}" data-note-id="${e.id}">
        <div class="note-entry-head">
          <span class="note-stamp"><i class="bi bi-clock"></i> ${escapeHtml(fmtNoteStamp(e.ts))}</span>
          <span class="note-acts">
            <button type="button" class="note-edit" data-act="edit-note" data-note-id="${e.id}" title="${t("v.ubah.tanggal.amp.isi.catatan").replace(/"/g, "&quot;")}">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="note-del" data-act="del-note" data-note-id="${e.id}" title="${tt("Hapus catatan ini", "Delete this note")}">
              <i class="bi bi-x-lg"></i>
            </button>
          </span>
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
    showToast(t("m.tulis.dulu.isi.catatannya"), "dark");
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
  const hapus = e.target.closest('[data-act="del-note"]');
  if (hapus) {
    draftNotesLog = draftNotesLog.filter((x) => x.id !== hapus.dataset.noteId);
    renderNotesTimeline();
    return;
  }
  const ubah = e.target.closest('[data-act="edit-note"]');
  if (ubah) editDraftNote(ubah.dataset.noteId);
});

/* ------------------------------------------------------------------
   UBAH CATATAN

   Tanggal DAN isinya bisa diubah. Kronologi sering ditulis menyusul —
   "kapal sandar Selasa" baru dicatat hari Kamis — jadi cap waktunya
   harus bisa dibetulkan, bukan hanya teksnya.

   Jamnya dipertahankan dari entri aslinya kalau ada, supaya urutan
   antar catatan pada hari yang sama tidak berubah acak.
------------------------------------------------------------------ */
function editDraftNote(noteId) {
  const entri = draftNotesLog.find((x) => x.id === noteId);
  if (!entri) return;

  const asal = entri.ts ? new Date(entri.ts) : null;
  const tglAwal =
    asal && !isNaN(asal) ? asal.toISOString().slice(0, 10) : todayISO();

  showPrompt({
    title: t("c.ubah.kronologi"),
    desc: t("s.perbaiki.tanggal.atau.isi.catatan"),
    icon: "bi-clock-history",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "tgl", label: tt("Tanggal", "Date"), type: "date", value: tglAwal },
      { key: "teks", label: tt("Isi catatan", "Note text"), value: entri.text || "" },
    ],
    onSubmit: (v) => {
      const teks = (v.teks || "").trim();
      if (!teks) return t("s.isi.catatan.tidak.boleh.kosong");
      const tgl = parseLocalDate(v.tgl);
      if (!tgl) return t("s.tanggal.tidak.valid");

      // Jam & menit dari entri asli dipertahankan; kalau belum ada,
      // dipakai jam saat ini supaya urutannya tetap masuk akal.
      const acuan = asal && !isNaN(asal) ? asal : new Date();
      tgl.setHours(acuan.getHours(), acuan.getMinutes(), acuan.getSeconds(), 0);

      entri.ts = tgl.toISOString();
      entri.text = teks;
      // Diurutkan ulang: mengubah tanggal bisa memindahkan posisinya.
      draftNotesLog.sort((a, b) => (a.ts || "") .localeCompare(b.ts || ""));
      renderNotesTimeline();
      showToast(t("m.kronologi.diperbarui"), "dark");
      return true;
    },
  });
}

/* TIMELINE RINGKAS DI KARTU DASHBOARD */
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
    : `<div class="note-empty">${t("v.belum.ada.kronologi")}</div>`;

  return `
  <div class="card-notes">
    <div class="card-notes-head">
      <span><i class="bi bi-chat-left-text"></i> ${tt("Kronologi &amp; Catatan", "Timeline &amp; Notes")}${log.length ? ` (${log.length})` : ""}</span>
      ${sisa > 0 ? `<span class="card-notes-more">${tt(`+${sisa} lagi — buka Edit untuk lihat semua`, `+${sisa} more — open Edit to see all`)}</span>` : ""}
    </div>
    <div class="card-notes-list">${list}</div>
    <div class="card-note-add">
      <input type="text" class="card-note-input" data-note-input="${s.id}"
             placeholder="${tt("Tambah kronologi (tanggal &amp; jam otomatis)...", "Add a timeline entry (date &amp; time automatic)...")}" />
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
    showToast(t("m.tulis.dulu.isi.catatannya"), "dark");
    return;
  }
  const log = normalizeNotesLog(s.notesLog, s.notes);
  log.push(newNoteEntry(text));
  s.notesLog = log;
  s.notes = notesLogToPlainNotes(log);
  input.value = "";
  render();
  await persistFields(id, { notesLog: s.notesLog, notes: s.notes });
  showToast(t("m.catatan.ditambahkan"), "success");
}
