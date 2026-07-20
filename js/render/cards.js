"use strict";

/* ==================================================================
   CARD RENDERING
================================================================== */
function renderCard(s) {
  return s.status === "arrived"
    ? renderCollapsedCard(s)
    : renderExpandedCard(s);
}

function hasMeaningfulValue(v) {
  const t = (v || "").toString().trim();
  return t !== "" && t !== "-";
}

// Display fallback for free-text fields: treats "-" the same as empty,
// showing the placeholder dash instead of a literal "-" typed by the user.
function dispVal(v) {
  return hasMeaningfulValue(v) ? v : "—";
}

// Ringkasan fasilitas lintas-barang untuk badge kartu — dihitung dari
// shipment_items sekarang (bukan lagi dari 1 field skb di shipment).
// Setiap jenis SKB dapat badge SENDIRI-SENDIRI (PPH tampil "PPH",
// Masterlist tampil "Masterlist", dst — bukan digabung jadi 1 badge
// "SKB" generik seperti sebelumnya). Hitungan ("× N") cuma dipakai
// utk jenis yang cakupannya lazim beda-beda per barang — E-COO
// (sertifikat asal per barang) & Masterlist (daftar barang yang
// disetujui, tidak selalu semua barang masuk); jenis lain (PPH/BM/
// PPN/Lainnya) biasanya berlaku blanket ke semua barang dalam 1
// pengiriman sekaligus, jadi angkanya kurang informatif dan badge-nya
// tanpa angka.
const SKB_JENIS_WITH_COUNT = new Set(["E-COO", "Masterlist"]);

function skbCountByJenis(s) {
  const counts = {};
  (s.items || []).forEach((it) => {
    (it.skb || []).forEach((sk) => {
      const j = SKB_TYPE_OPTIONS.includes(sk.jenis) ? sk.jenis : "Lainnya";
      counts[j] = (counts[j] || 0) + 1;
    });
  });
  return counts;
}

function skbTagsHtml(s) {
  const lbl = ML();
  const counts = skbCountByJenis(s);
  return SKB_TYPE_OPTIONS.map((jenis) => {
    const n = counts[jenis] || 0;
    if (!n) return "";
    // PPH/BM/PPN/Masterlist/Lainnya = fasilitas bea impor, cuma
    // relevan di mode import (showDuty); E-COO tetap tampil di mode
    // apa pun (bukan soal bea, tapi asal barang).
    if (jenis !== "E-COO" && !lbl.showDuty) return "";
    const isEcoo = jenis === "E-COO";
    const cls = isEcoo ? "tag-ecoo" : "tag-skb";
    const icon = isEcoo ? "bi-patch-check" : "bi-shield-check";
    const label = SKB_JENIS_WITH_COUNT.has(jenis) ? `${jenis} × ${n}` : jenis;
    return `<span class="tag ${cls}"><i class="bi ${icon}"></i> ${escapeHtml(label)}</span>`;
  }).join("");
}

// Daftar nama barang buat kartu depan (info-grid) — 1 barang 1 baris.
// Dipotong kalau kepanjangan supaya kartu tidak melar, sisanya
// diringkas "+N lainnya".
function itemNamesSummary(s, maxShown = 4) {
  const names = (s.items || [])
    .map((it) => (it.namaBarang || "").trim())
    .filter(Boolean);
  if (!names.length) return ["—"];
  if (names.length <= maxShown) return names;
  return [...names.slice(0, maxShown), `+${names.length - maxShown} lainnya`];
}

function buildTags(s, totals) {
  const lbl = ML();
  const stopCount = routeStopList(s).length;
  return [
    s.incoterm ? `<span class="tag">${escapeHtml(s.incoterm)}</span>` : "",
    totals.totalUSD
      ? `<span class="tag tag-usd">${fmtUSD(totals.totalUSD)}</span>`
      : "",
    s.muatan
      ? `<span class="tag tag-muatan">${escapeHtml(s.muatan)}</span>`
      : "",
    isTransitRoute(s)
      ? `<span class="tag tag-transit"><i class="bi bi-signpost-split"></i> Transit · ${stopCount} Stop</span>`
      : "",
    lbl.showDuty && hasMeaningfulValue(s.pi)
      ? `<span class="tag tag-pi"><i class="bi bi-file-earmark-check"></i> PI</span>`
      : "",
    skbTagsHtml(s),
  ]
    .filter(Boolean)
    .join("");
}

function actionButtons(s) {
  return `
    <div class="actions-col">
      <button class="icon-btn" data-action="viewDetail" data-id="${s.id}" title="Lihat Detail"><i class="bi bi-eye"></i></button>
      <button class="icon-btn primary" data-action="edit" data-id="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
      <div class="dropdown copy-template-dropdown">
        <button class="icon-btn" data-bs-toggle="dropdown" aria-expanded="false" title="Salin ke Excel"><i class="bi bi-clipboard"></i></button>
        <ul class="dropdown-menu dropdown-menu-end copy-template-menu">${copyTemplateMenuHtml(s.id)}</ul>
      </div>
      <button class="icon-btn danger" data-action="delete" data-id="${s.id}" title="Hapus"><i class="bi bi-trash3"></i></button>
    </div>`;
}

function statusSelectHtml(s) {
  const meta = STATUS_META[s.status] || STATUS_META.process;
  return `<select class="status-select ${meta.class}" data-action="status" data-id="${s.id}">
      ${Object.entries(STATUS_META)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${k === s.status ? "selected" : ""}>${v.label}</option>`,
        )
        .join("")}
    </select>`;
}

function renderExpandedCard(s) {
  const lbl = ML();
  const totals = itemTotals(s);
  const itemCount = (s.items || []).length;

  return `
  <div class="ship-card ship-card--${s.status}" data-id="${s.id}">
    <div class="ship-card-top">
      <div class="ship-title-block">
        <div class="item-name">${escapeHtml(dispVal(s.party))} · ${itemCount} Barang</div>
        <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} &nbsp;•&nbsp; No. Aju: ${escapeHtml(dispVal(s.noAju))}</div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item"><div class="info-label"><i class="bi bi-geo-alt"></i> Rute</div><div class="info-value">${escapeHtml(routeChainText(s))}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-person-badge"></i> Forwarder</div><div class="info-value">${escapeHtml(dispVal(s.forwarder))}<br><span class="muted-value">PIC: ${escapeHtml(dispVal(s.forwarderPic))}</span></div></div>
      <div class="info-item"><div class="info-label"><i class="bi ${s.transport === "udara" ? "bi-airplane" : "bi-water"}"></i> ${s.transport === "udara" ? "Pesawat" : "Vessel"}</div><div class="info-value">${escapeHtml(dispVal(s.vessel))}<br><span class="muted-value">${s.transport === "udara" ? "No. Flight" : "Voyage"} ${escapeHtml(dispVal(s.voyage))}</span></div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-upc-scan"></i> Kontainer</div><div class="info-value">${escapeHtml(dispVal(s.container))}${s.muatan ? " · " + escapeHtml(s.muatan) : ""}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-receipt-cutoff"></i> Invoice</div><div class="info-value">${escapeHtml(dispVal(s.invoice))}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-truck"></i> ${lbl.factoryDate}</div><div class="info-value">${s.factoryDate ? fmtDate(s.factoryDate) : "—"}${s.factoryTime ? " · " + escapeHtml(s.factoryTime) : ""}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-box-seam"></i> Total Netto</div><div class="info-value">${fmtNum(totals.totalNetto)} Kg</div></div>
      <div class="info-item info-item--wide"><div class="info-label"><i class="bi bi-boxes"></i> Nama Barang</div><div class="info-value info-value--list">${itemNamesSummary(
        s,
      )
        .map((n) => `<div>${escapeHtml(n)}</div>`)
        .join("")}</div></div>
    </div>

    <div class="tag-row">${buildTags(s, totals)}</div>

    <div class="lane">
      ${buildLaneHtml(s)}
    </div>

    <div class="date-strip">
      <div class="date-field"><label>ETD</label><input type="date" value="${s.etd || ""}" data-action="date" data-field="etd" data-id="${s.id}"></div>
      <div class="date-field"><label>ETA</label><input type="date" value="${s.eta || ""}" data-action="date" data-field="eta" data-id="${s.id}"></div>
      <div class="date-field"><label>${lbl.actual}</label><input type="date" value="${s.actual || ""}" data-action="date" data-field="actual" data-id="${s.id}"></div>
    </div>
  </div>`;
}

function renderCollapsedCard(s) {
  const lbl = ML();
  return `
  <div class="ship-card ship-card--arrived ship-card--collapsed" data-id="${s.id}">
    <div class="collapsed-row">
      <div class="collapsed-check"><i class="bi bi-check-circle-fill"></i></div>
      <div class="collapsed-main">
        <div class="collapsed-party">${escapeHtml(dispVal(s.party))}</div>
        <div class="collapsed-meta">Invoice <b>${escapeHtml(dispVal(s.invoice))}</b> &nbsp;·&nbsp; ${lbl.arrivedStat}: <b>${fmtDate(s.factoryDate)}</b></div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>
  </div>`;
}
