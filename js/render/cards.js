"use strict";

/* CARD RENDERING */
function renderCard(s) {
  return isArrived(s)
    ? renderCollapsedCard(s)
    : renderExpandedCard(s);
}

function hasMeaningfulValue(v) {
  const t = (v || "").toString().trim();
  return t !== "" && t !== "-";
}

// Display fallback for free-text fields: treats "-" the same as empty
function dispVal(v) {
  return hasMeaningfulValue(v) ? v : "—";
}

// Ringkasan fasilitas lintas-barang untuk badge kartu
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
    // PPH/BM/PPN/Masterlist/Lainnya = fasilitas bea impor, cuma relevan di mode import (showDuty)
    if (jenis !== "E-COO" && !lbl.showDuty) return "";
    const isEcoo = jenis === "E-COO";
    const cls = isEcoo ? "tag-ecoo" : "tag-skb";
    const icon = isEcoo ? "bi-patch-check" : "bi-shield-check";
    const label = SKB_JENIS_WITH_COUNT.has(jenis) ? `${jenis} × ${n}` : jenis;
    return `<span class="tag ${cls}"><i class="bi ${icon}"></i> ${escapeHtml(label)}</span>`;
  }).join("");
}

// Daftar nama barang buat kartu depan (info-grid) — 1 barang 1 baris
function itemNamesSummary(s, maxShown = 4) {
  const names = (s.items || [])
    .map((it) => (it.namaBarang || "").trim())
    .filter(Boolean);
  if (!names.length) return ["—"];
  if (names.length <= maxShown) return names;
  return [...names.slice(0, maxShown), `+${names.length - maxShown} lainnya`];
}

// Requirement D: "Tampilkan info delay di card dashboard juga: berapa hari delay-nya
function delayBadgeHtml(s) {
  if (s.status !== "delayed") return "";
  const info = shipmentDelayInfo(s);
  if (!info || info.days <= 0) return "";
  return `<span class="tag tag-delay"><i class="bi bi-clock-history"></i> Mundur ${info.days} hari dari ${info.basis}</span>`;
}

/* STRIP TANGGAL UPDATE DELAY (hanya saat status DELAY) */
function delayDeltaText(baseline, update, basis) {
  const d = delayDaysBetween(baseline, update);
  if (d == null) return "";
  const teks = delayDeltaLabel(baseline, update, basis);
  const kelas =
    d > 0 ? " delay-delta--late" : d < 0 ? " delay-delta--early" : "";
  return `<span class="delay-delta${kelas}">${teks}</span>`;
}

function delayStripHtml(s) {
  if (s.status !== "delayed") return "";
  return `
    <div class="delay-strip">
      <div class="delay-strip-head">
        <i class="bi bi-clock-history"></i> Tanggal Update Delay
      </div>
      <div class="delay-strip-fields">
        <div class="date-field">
          <label>Update ETD ${delayDeltaText(s.etd, s.etdUpdate, "ETD")}</label>
          <input type="date" value="${s.etdUpdate || ""}" data-action="date" data-field="etdUpdate" data-id="${s.id}">
        </div>
        <div class="date-field">
          <label>Update ETA ${delayDeltaText(s.eta, s.etaUpdate, "ETA")}</label>
          <input type="date" value="${s.etaUpdate || ""}" data-action="date" data-field="etaUpdate" data-id="${s.id}">
        </div>
      </div>
    </div>`;
}

/* ANIMASI KEBERANGKATAN (requirement: ETD == hari ini) */
function isDepartingToday(s) {
  // Pakai ETD EFEKTIF — kalau keberangkatan sudah dimundurkan
  const etd = effectiveEtd(s);
  if (!etd) return false;
  return etd === todayISO();
}

function departingTodayHtml(s) {
  if (!isDepartingToday(s)) return "";
  const air = s.transport === "udara";
  return `
    <div class="depart-strip depart-strip--${air ? "air" : "sea"}">
      <span class="depart-label">
        <i class="bi bi-broadcast"></i> Berangkat hari ini
      </span>
      <span class="depart-track" aria-hidden="true">
        <span class="depart-mover">${air ? ICON_PESAWAT : ICON_KAPAL}</span>
      </span>
    </div>`;
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

// Dropdown status di kartu: pilihannya mengikuti section aktif (requirement D)
function statusSelectHtml(s) {
  /* Yang ditampilkan status EFEKTIF: begitu tanggal Actual Delivery
     terlewati, dropdown-nya sudah menunjukkan Arrived walau kolom di
     database belum sempat diperbarui */
  const st = effectiveStatus(s);

  return `<select class="status-select ${statusClass(st)}" data-action="status" data-id="${s.id}">
      ${statusOptionsHtml(activeMode, st)}
    </select>`;
}

function renderExpandedCard(s) {
  const lbl = ML();
  const totals = itemTotals(s);
  const itemCount = (s.items || []).length;

  return `
  <div class="ship-card ship-card--${effectiveStatus(s)}" data-id="${s.id}">
    <div class="ship-card-top">
      <div class="ship-title-block">
                <div class="ship-title-text">
          <div class="item-name">${escapeHtml(dispVal(s.party))} · ${itemCount} Barang</div>
          <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} &nbsp;•&nbsp; No. Aju: ${escapeHtml(dispVal(s.noAju))}</div>
        </div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item"><div class="info-label"><i class="bi bi-geo-alt"></i> Rute</div><div class="info-value">${escapeHtml(routeChainText(s))}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-person-badge"></i> Forwarder</div><div class="info-value">${escapeHtml(dispVal(s.forwarder))}<br><span class="muted-value">PIC: ${escapeHtml(dispVal(s.forwarderPic))}</span></div></div>
      <div class="info-item"><div class="info-label"><i class="bi ${s.transport === "udara" ? "bi-airplane" : "bi-water"}"></i> ${vesselNoun(s.transport)}</div><div class="info-value">${escapeHtml(dispVal(s.vessel))}<br><span class="muted-value">${voyageNoun(s.transport)} ${escapeHtml(dispVal(s.voyage))}</span></div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-upc-scan"></i> Kontainer</div><div class="info-value">${escapeHtml(dispVal(s.container))}${s.muatan ? " · " + escapeHtml(s.muatan) : ""}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-receipt-cutoff"></i> Invoice</div><div class="info-value">${escapeHtml(dispVal(s.invoice))}</div></div>
      ${
        activeMode === "export"
          ? ""
          : `<div class="info-item"><div class="info-label"><i class="bi bi-truck"></i> ${lbl.factoryDate}</div><div class="info-value">${s.factoryDate ? fmtDate(s.factoryDate) : "—"}${s.factoryTime ? " · " + escapeHtml(s.factoryTime) : ""}</div></div>`
      }
      <div class="info-item"><div class="info-label"><i class="bi bi-box-seam"></i> Total Netto</div><div class="info-value">${fmtNum(totals.totalNetto)} Kg</div></div>
      <div class="info-item info-item--wide"><div class="info-label"><i class="bi bi-boxes"></i> Nama Barang</div><div class="info-value info-value--list">${itemNamesSummary(
        s,
      )
        .map((n) => `<div>${escapeHtml(n)}</div>`)
        .join("")}</div></div>
    </div>

    <div class="tag-row">${delayBadgeHtml(s)}${buildTags(s, totals)}</div>

    <div class="lane">
      ${buildLaneHtml(s)}
    </div>

    <div class="date-strip">
      <div class="date-field"><label>ETD</label><input type="date" value="${s.etd || ""}" data-action="date" data-field="etd" data-id="${s.id}"></div>
      <div class="date-field"><label>ETA ${etaPredictionAppliesTo(s) ? etaModeChipHtml(etaModeOf(s)) : ""}</label><input type="date" value="${s.eta || ""}" data-action="date" data-field="eta" data-id="${s.id}"></div>
      ${
        /* Estimated Delivery sengaja tetap BISA DIKETIK; mengetik di
           sini mengunci tanggalnya ke mode Manual. Kalau terpikir
           menguncinya supaya tidak ada dua sumber kebenaran: laporan
           butuh tanggal yang bisa dipatok, dan mode Manual itulah
           jawabannya. */
        `<div class="date-field${deliveryPredictionAppliesTo(s) && deliveryModeOf(s) === "manual" ? " date-field--pinned" : ""}"><label>${lbl.actual} ${deliveryPredictionAppliesTo(s) ? deliveryModeChipHtml(deliveryModeOf(s)) : ""}</label><input type="date" value="${s.actual || ""}" data-action="date" data-field="actual" data-id="${s.id}"></div>`
      }
    </div>

    ${predictionStripHtml(s)}
    ${departingTodayHtml(s)}
    ${delayStripHtml(s)}
    ${docStepHtml(s)}
    ${cardNotesHtml(s)}
  </div>`;
}

/* ETD & ETA pada kartu yang sudah Arrived / Delivered.

   Tetap ditampilkan karena keduanya masih dirujuk: Delivered di buku
   Export berarti kapalnya sudah berangkat, bukan urusannya selesai,
   dan di buku Import jadwal berangkat-tiba tetap jadi acuan saat
   menelusuri kiriman lama.

   HANYA BISA DIBACA. Kartu terkuncup adalah ringkasan; mengubah
   tanggal di sini terlalu mudah dilakukan tanpa sengaja pada kiriman
   yang sudah dianggap beres. Yang mau membetulkan masuk lewat tombol
   pensil, dan di sana perubahannya disengaja.

   Yang ditampilkan tanggal RENCANA, sama persis dengan kotak ETD/ETA
   di form — kotak Tanggal Update Delay punya tempatnya sendiri, dan
   menampilkan angka berbeda di bawah label yang sama hanya
   membingungkan. */
function collapsedDatesHtml(s) {
  const mundur =
    (s.etdUpdate && s.etdUpdate !== s.etd) || (s.etaUpdate && s.etaUpdate !== s.eta);
  const catatan = mundur
    ? ` Jadwal ini pernah dimundurkan — lihat Tanggal Update Delay lewat tombol pensil.`
    : "";
  const kotak = (label, nilai) => `
      <div class="date-field date-field--locked">
        <label>${label}</label>
        <input type="date" value="${nilai || ""}" readonly
               title="Hanya baca. Tekan tombol pensil untuk mengubahnya.${catatan}">
      </div>`;

  return `
    <div class="collapsed-dates">
      ${kotak("ETD", s.etd)}
      ${kotak("ETA", s.eta)}
      ${mundur ? `<div class="collapsed-dates-note"><i class="bi bi-clock-history"></i> Pernah dimundurkan</div>` : ""}
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
        <div class="collapsed-meta">Invoice <b>${escapeHtml(dispVal(s.invoice))}</b> &nbsp;·&nbsp; ${lbl.arrivedStat}: <b>${fmtDate(activeMode === "export" ? s.actual : s.factoryDate)}</b></div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>

    <div class="collapsed-extra">
      ${collapsedDatesHtml(s)}
      ${
        /* Lencana yang sama dengan kartu aktif: incoterm, nilai, jenis
           muatan, fasilitas. Kiriman yang sudah selesai justru paling
           sering dicari ulang untuk angka-angka itu — menyembunyikannya
           memaksa membuka detail hanya untuk melihat satu nilai. */
        `<div class="tag-row tag-row--collapsed">${buildTags(s, itemTotals(s))}</div>`
      }
      <div class="collapsed-items">
        <div class="collapsed-items-label"><i class="bi bi-boxes"></i> Nama Barang</div>
        <div class="collapsed-items-list">${itemNamesSummary(s)
          .map((n) => `<div>${escapeHtml(n)}</div>`)
          .join("")}</div>
      </div>
      ${cardNotesHtml(s)}
    </div>
  </div>`;
}
