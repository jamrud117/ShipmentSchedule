"use strict";

/* ==================================================================
   RENDER MANIFES (tampilan tabel)

   Satu baris = satu pengiriman, ±54 px. Kartu memakan ±360 px, jadi
   memeriksa "mana yang ETA-nya minggu ini" di antara 30 pengiriman
   turun dari belasan layar gulir jadi satu layar.

   PENTING: seluruh tombol & kontrol di sini memakai atribut
   data-action / data-id / data-field YANG SAMA dengan kartu. Event
   delegation-nya sudah terpasang di #cardContainer (lihat
   features/card-events.js), jadi Edit, Detail, Hapus, ganti Status,
   dan ganti tanggal langsung bekerja tanpa satu baris penanganan
   kejadian baru — dan tanpa menyentuh logika bisnis mana pun.
================================================================== */

// Kode pelabuhan dipakai apa adanya (CNNGB, IDJKT). Itu memang bahasa
// sehari-hari di dokumen kepabeanan, dan lima huruf jauh lebih cepat
// dipindai daripada nama pelabuhan lengkap. Kalau yang terisi memang
// nama panjang, dipendekkan supaya kolomnya tidak melar.
function shortPort(v) {
  const t = (v || "").toString().trim();
  if (!t) return "—";
  if (t.length <= 6) return t.toUpperCase();
  const code = t.match(/\b[A-Z]{5}\b/);
  return code ? code[0] : t.slice(0, 12);
}

function manifestRouteHtml(s) {
  const air = s.transport === "udara";
  const stops = routeStopList(s);
  const mid = isTransitRoute(s) && stops.length ? shortPort(stops[0].terminal) : "";
  return `
    <div class="mf-route">
      <span>${escapeHtml(shortPort(s.origin))}</span>
      <span class="mf-route-arrow"><i class="bi ${air ? "bi-airplane-fill" : "bi-water"}"></i></span>
      <span>${escapeHtml(shortPort(s.destination))}</span>
    </div>
    <div class="mf-vessel">${escapeHtml(dispVal(s.vessel))}${
      hasMeaningfulValue(s.voyage) ? " · " + escapeHtml(s.voyage) : ""
    }${mid ? ` · via ${escapeHtml(mid)}` : ""}</div>`;
}

// Kolom tanggal. Kalau jadwal sudah dimundurkan, yang asli dicoret
// dan yang baru ditulis tegas — jadi riwayat perubahannya terbaca
// langsung dari baris, tanpa membuka detail.
function manifestDateCell(original, updated) {
  if (!original && !updated)
    return `<span class="mf-date mf-date--empty">—</span>`;
  if (updated && updated !== original) {
    return `<span class="mf-date">
      <span class="mf-date-old">${fmtDate(original)}</span>
      <span class="mf-date-new">${fmtDate(updated)}</span>
    </span>`;
  }
  return `<span class="mf-date">${fmtDate(original)}</span>`;
}

function manifestFlagsHtml(s) {
  const lbl = ML();
  const out = [];
  if (isTransitRoute(s)) {
    out.push(
      `<span class="mf-flag mf-flag--transit" title="Rute transit, ${routeStopList(s).length} terminal singgah">Transit</span>`,
    );
  }
  if (hasMissingDocs(s)) {
    out.push(
      `<span class="mf-flag mf-flag--alert" title="Belum lengkap: ${escapeAttr(missingDocs(s).join(", "))}">Dok</span>`,
    );
  }
  if (lbl.showDuty && hasMeaningfulValue(s.pi)) {
    out.push(`<span class="mf-flag" title="Ada keterangan PI">PI</span>`);
  }
  if (s.incoterm) {
    out.push(`<span class="mf-flag">${escapeHtml(s.incoterm)}</span>`);
  }
  return out.length ? `<span class="mf-flags">${out.join("")}</span>` : "";
}

function manifestActionsHtml(s) {
  return `
    <div class="mf-actions">
      <button class="icon-btn" data-action="viewDetail" data-id="${s.id}" title="Lihat detail"><i class="bi bi-eye"></i></button>
      <button class="icon-btn primary" data-action="edit" data-id="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
      <div class="dropdown copy-template-dropdown">
        <button class="icon-btn" data-bs-toggle="dropdown" aria-expanded="false" title="Salin ke Excel"><i class="bi bi-clipboard"></i></button>
        <ul class="dropdown-menu dropdown-menu-end copy-template-menu">${copyTemplateMenuHtml(s.id)}</ul>
      </div>
      <button class="icon-btn danger" data-action="delete" data-id="${s.id}" title="Hapus"><i class="bi bi-trash3"></i></button>
    </div>`;
}

// Catatan terakhir ditempel sebagai baris kedua yang menyatu. Isinya
// kalimat, jadi butuh lebar penuh — bukan kolom sendiri yang akan
// selalu terpotong.
function manifestNoteRow(s) {
  const log = normalizeNotesLog(s.notesLog, s.notes);
  if (!log.length) return "";
  const last = log[log.length - 1];
  return `
    <tr class="mf-note-row mf-note-row--${s.status}" data-note-for="${s.id}">
      <td colspan="8">
        <span class="mf-note">
          <i class="bi bi-chat-left-text"></i>
          <span class="mf-note-stamp">${escapeHtml(fmtNoteStamp(last.ts))}</span>
          <span class="mf-note-text">${escapeHtml(last.text)}</span>
        </span>
      </td>
    </tr>`;
}

function renderManifestRow(s) {
  const lbl = ML();
  const itemCount = (s.items || []).length;
  // Kelas --hasnote memindahkan garis pemisah ke baris kronologi di
  // bawahnya, supaya satu pengiriman terbaca sebagai satu blok utuh.
  const adaCatatan = normalizeNotesLog(s.notesLog, s.notes).length > 0;
  return `
  <tr class="mf-row mf-row--${s.status}${adaCatatan ? " mf-row--hasnote" : ""}" data-id="${s.id}">
    <td class="mf-col-board">${boardTokenHtml(s, true)}</td>
    <td class="mf-col-party">
      <span class="mf-party" title="${escapeAttr(dispVal(s.party))}">${escapeHtml(dispVal(s.party))}</span>
      <span class="mf-sub">
        <span>${escapeHtml(dispVal(s.docNo))}</span>
        <span class="sep">·</span>
        <span>${escapeHtml(dispVal(s.invoice))}</span>
        <span class="sep">·</span>
        <span>${itemCount} brg</span>
        ${manifestFlagsHtml(s)}
      </span>
    </td>
    <td class="mf-col-route">${manifestRouteHtml(s)}</td>
    <td class="mf-col-date">${manifestDateCell(s.etd, s.etdUpdate)}</td>
    <td class="mf-col-date">${manifestDateCell(s.eta, s.etaUpdate)}</td>
    <td class="mf-col-date mf-col-actual">${manifestDateCell(s.actual, "")}</td>
    <td class="mf-col-status">${statusSelectHtml(s)}</td>
    <td class="mf-col-act">${manifestActionsHtml(s)}</td>
    <td class="mf-dates-mobile">
      <span>ETD <b>${s.etd ? fmtDate(effectiveEtd(s)) : "—"}</b></span>
      <span>ETA <b>${s.eta ? fmtDate(effectiveEta(s)) : "—"}</b></span>
      <span>${escapeHtml(lbl.actual.split(" ")[0])} <b>${s.actual ? fmtDate(s.actual) : "—"}</b></span>
    </td>
  </tr>${manifestNoteRow(s)}`;
}

function manifestHeadHtml() {
  const lbl = ML();
  return `
    <thead>
      <tr>
        <th class="mf-col-board">Papan</th>
        <th class="mf-col-party">${escapeHtml(lbl.party)} &amp; Dokumen</th>
        <th class="mf-col-route">Rute &amp; Sarana</th>
        <th class="mf-col-date">ETD</th>
        <th class="mf-col-date">ETA</th>
        <th class="mf-col-date mf-col-actual">${escapeHtml(lbl.actual)}</th>
        <th class="mf-col-status">Status</th>
        <th class="mf-col-act"></th>
        <!-- Sel ke-9 hanya hidup di layar kecil (lihat .mf-dates-mobile
             di css/manifest.css). Ditulis juga di kepala tabel supaya
             jumlah sel baris & kepala tetap sama — tabel dengan jumlah
             kolom tidak seimbang bikin pembaca layar salah menyebut
             posisi kolom. -->
        <th class="mf-dates-mobile"></th>
      </tr>
    </thead>`;
}

// Dipanggil render() di render/list.js untuk satu halaman hasil.
// Pemisah tanggal ditulis sebagai tabel terpisah supaya kepala kolom
// tidak perlu diulang di tiap kelompok tanggal.
function renderManifestGroup(rowsHtml) {
  return `<div class="manifest-wrap"><table class="manifest">${manifestHeadHtml()}<tbody>${rowsHtml}</tbody></table></div>`;
}
