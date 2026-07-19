"use strict";

/* ==================================================================
   LANE / TRANSPORT ICON
================================================================== */
function laneProgress(s) {
  if (s.status === "arrived") return 1;
  if (s.status === "process") return 0.04;
  const etd = parseLocalDate(s.etd);
  const eta = parseLocalDate(s.eta);
  const today = new Date();
  if (!etd || !eta || eta <= etd) return 0.5;
  let frac = (today - etd) / (eta - etd);
  return Math.min(0.96, Math.max(0.06, frac));
}
function iconForMode(mode, status) {
  const air = mode === "udara";
  if (status === "arrived") return air ? "🛬" : "⚓";
  return air ? "✈️" : "🚢";
}

/* ==================================================================
   RUTE TRANSIT (multi-terminal)
   Kalau route_type !== "transit" atau tidak ada routeStops sama sekali,
   semua fungsi di bawah ini otomatis "collapse" jadi 1 leg
   origin -> destination — PERSIS seperti shipment direct sebelumnya,
   tidak ada perubahan tampilan/perilaku untuk data lama.

   Field transport/vessel/voyage pada 1 baris shipment_route_stops
   menjelaskan alat angkut yang MEMBAWA barang TIBA di terminal
   tersebut (bukan leg berikutnya). Leg TERAKHIR (dari terminal transit
   paling akhir menuju s.destination) tetap memakai
   s.transport / s.vessel / s.voyage — field yang sudah ada dari dulu.
================================================================== */
function routeStopList(s) {
  return Array.isArray(s.routeStops) ? s.routeStops : [];
}
function isTransitRoute(s) {
  return s.routeType === "transit" && routeStopList(s).length > 0;
}

// Susun titik-titik rute secara urut: asal -> tiap terminal transit -> tujuan.
function buildRouteNodes(s) {
  const nodes = [{ kind: "origin", terminal: s.origin, date: s.etd }];
  routeStopList(s).forEach((st) => {
    nodes.push({
      kind: "stop",
      terminal: st.terminal,
      arrivalDate: st.arrivalDate,
      departureDate: st.departureDate,
      date: st.arrivalDate || st.departureDate || "",
      transport: st.transport,
      vessel: st.vessel,
      voyage: st.voyage,
    });
  });
  nodes.push({ kind: "destination", terminal: s.destination, date: s.eta });
  return nodes;
}

// Ubah tanggal tiap titik jadi posisi 0..1 di sepanjang lane. Titik yang
// tanggalnya kosong diisi otomatis lewat interpolasi linear terhadap
// titik bertanggal terdekat kiri/kanan. Kalau rentang keseluruhan tidak
// valid (sama/mundur), semua titik disebar rata berdasar urutan saja —
// konsisten dengan cara laneProgress() menangani etd/eta yang tidak
// valid (fallback ke nilai tetap, bukan NaN).
function computeNodeFractions(nodes) {
  const n = nodes.length;
  const times = nodes.map((nd) => {
    const dt = parseLocalDate(nd.date);
    return dt ? dt.getTime() : null;
  });
  if (times[0] == null) times[0] = 0;
  if (times[n - 1] == null) times[n - 1] = times[0] + 1;

  for (let i = 1; i < n - 1; i++) {
    if (times[i] != null) continue;
    let left = i - 1;
    while (left > 0 && times[left] == null) left--;
    let right = i + 1;
    while (right < n - 1 && times[right] == null) right++;
    const span = right - left || 1;
    const frac = (i - left) / span;
    times[i] = times[left] + (times[right] - times[left]) * frac;
  }

  const minT = times[0];
  const maxT = times[n - 1];
  let fractions;
  if (!isFinite(maxT - minT) || maxT <= minT) {
    fractions = nodes.map((_, i) => i / (n - 1));
  } else {
    fractions = times.map((t) =>
      Math.min(1, Math.max(0, (t - minT) / (maxT - minT))),
    );
  }
  // Jaga urutan selalu maju supaya titik di rute tidak pernah terlihat
  // mundur ke kiri walau ada input tanggal yang keliru.
  for (let i = 1; i < n; i++) {
    if (fractions[i] < fractions[i - 1]) fractions[i] = fractions[i - 1];
  }
  return fractions;
}

// Leg mana yang sedang berjalan sekarang, berdasar posisi progress
// keseluruhan (laneProgress) terhadap fraksi tiap titik.
function activeLegIndex(fractions, progress) {
  let idx = 0;
  for (let i = 0; i < fractions.length - 1; i++) {
    if (progress >= fractions[i]) idx = i;
  }
  return idx;
}

// Alat angkut yang dipakai utk 1 leg tertentu. Leg terakhir (menuju
// destination) selalu pakai field shipments.* yang sudah ada; leg
// lainnya pakai field milik titik TUJUAN leg tsb (lihat catatan di atas).
function transportForLeg(s, nodes, legIndex) {
  const lastLegIndex = nodes.length - 2;
  if (legIndex >= lastLegIndex) {
    return { mode: s.transport, vessel: s.vessel, voyage: s.voyage };
  }
  const arrivingNode = nodes[legIndex + 1];
  return {
    mode: arrivingNode.transport || s.transport,
    vessel: arrivingNode.vessel,
    voyage: arrivingNode.voyage,
  };
}

// Satu fungsi terpusat dipakai baik saat render awal card maupun saat
// refresh posisi berkala (refreshLanePositions) — single source of truth.
function computeLaneModel(s) {
  const nodes = buildRouteNodes(s);
  const fractions = computeNodeFractions(nodes);
  const progress = laneProgress(s);
  const legIdx = activeLegIndex(fractions, progress);
  const leg = transportForLeg(s, nodes, legIdx);
  const icon = iconForMode(leg.mode, s.status);
  return { nodes, fractions, progress, legIdx, leg, icon };
}

// Teks rute lengkap (dipakai di info-grid card & detail view).
function routeChainText(s) {
  if (!isTransitRoute(s)) {
    return `${dispVal(s.origin)} → ${dispVal(s.destination)}`;
  }
  const names = [
    s.origin,
    ...routeStopList(s).map((st) => st.terminal),
    s.destination,
  ];
  return names.map((nm) => dispVal(nm)).join(" → ");
}

function laneNodeTitle(nd) {
  const parts = [dispVal(nd.terminal)];
  if (nd.kind === "stop") {
    if (nd.arrivalDate) parts.push("Tiba " + fmtDate(nd.arrivalDate));
    if (nd.departureDate)
      parts.push("Berangkat " + fmtDate(nd.departureDate));
    if (hasMeaningfulValue(nd.vessel))
      parts.push(
        (nd.transport === "udara" ? "Pesawat " : "Vessel ") + nd.vessel,
      );
    if (hasMeaningfulValue(nd.voyage))
      parts.push(
        (nd.transport === "udara" ? "No. Flight " : "No. Voyage ") +
          nd.voyage,
      );
  } else {
    parts.push(fmtDate(nd.date));
  }
  return escapeAttr(parts.join(" · "));
}

// Render seluruh isi ".lane" (judul + track + label tanggal). Untuk
// shipment direct (2 titik) outputnya PERSIS sama seperti sebelumnya;
// untuk transit (>2 titik) menampilkan seluruh terminal + leg aktif.
// Cegah label antar terminal saling tumpuk kalau tanggalnya berdekatan
// (atau bahkan sama persis): label yang jaraknya terlalu dekat dengan
// label terakhir di baris atas otomatis digeser ke baris ke-2.
function assignLabelRows(fractions) {
  const MIN_GAP = 0.12;
  const lastInRow = [-Infinity, -Infinity];
  return fractions.map((f) => {
    const row = f - lastInRow[0] >= MIN_GAP ? 0 : 1;
    lastInRow[row] = f;
    return row;
  });
}

function buildLaneHtml(s) {
  const lane = computeLaneModel(s);
  const { nodes, fractions, progress, icon } = lane;
  const laneClass =
    s.status === "delayed"
      ? "is-delayed"
      : s.status === "process"
        ? "is-process"
        : "";
  const sailing = s.status === "transit" ? "sailing" : "";
  const multi = nodes.length > 2;

  const dotsHtml = nodes
    .map((nd, i) => {
      const kindClass =
        i === 0 ? "origin" : i === nodes.length - 1 ? "destination" : "stop";
      const reached = fractions[i] <= progress + 0.0001 ? " reached" : "";
      return `<div class="port-node ${kindClass}${reached}" style="left:${fractions[i] * 100}%" title="${laneNodeTitle(nd)}"></div>`;
    })
    .join("");

  const labelRows = multi ? assignLabelRows(fractions) : [];
  const labelsHtml = !multi
    ? `
      <div class="port-labels">
        <div class="p">ETD <b>${fmtDate(s.etd)}</b></div>
        <div class="p text-end">ETA <b>${fmtDate(s.eta)}</b></div>
      </div>`
    : `
      <div class="port-labels port-labels--multi">
        ${nodes
          .map((nd, i) => {
            const align =
              i === 0 ? "start" : i === nodes.length - 1 ? "end" : "center";
            const top = labelRows[i] * 36;
            return `<div class="p p--node p--${align}" style="left:${fractions[i] * 100}%; top:${top}px">
              <span class="p-term" title="${escapeAttr(dispVal(nd.terminal))}">${escapeHtml(dispVal(nd.terminal))}</span>
              <b>${fmtDate(nd.date)}</b>
            </div>`;
          })
          .join("")}
      </div>`;

  let delayFlag = "";
  const today = new Date();
  const etaDate = parseLocalDate(s.eta);
  if (!s.actual && s.status !== "arrived" && etaDate && today > etaDate) {
    const d = daysBetween(etaDate, today);
    delayFlag = `<div class="delay-flag"><i class="bi bi-exclamation-triangle-fill"></i> Melewati ETA ${d} hari</div>`;
  }

  return `
    <div class="lane-title mt-3">Progres Pengiriman</div>
    <div class="lane-track ${laneClass}">
      <div class="lane-fill" style="width:${progress * 100}%"></div>
      ${dotsHtml}
      <div class="ship-marker ${sailing}" style="left:${progress * 100}%">${icon}</div>
    </div>
    ${labelsHtml}
    ${delayFlag}`;
}

/* ==================================================================
   AUTO-ARRIVE RULE
   - ETA yang diubah ke tanggal lewat/hari ini -> otomatis set status
     ke ARRIVED (satu-satunya auto-arrive yang tersisa).
   - Actual Delivery SENGAJA tidak lagi punya efek samping ke status —
     field ini sekarang murni informatif; status harus diubah manual
     lewat dropdown Status, sesuai permintaan.
   - Triggered only by the specific field-change event described,
     never re-applied on generic render/save, so it can't clobber a
     manually-set "DELAYED" status on unrelated shipments.
================================================================== */
function applyEtaAutoArrive(shipment, newEtaValue) {
  shipment.eta = newEtaValue;
  if (isPastOrToday(newEtaValue) && shipment.status !== "arrived") {
    shipment.status = "arrived";
    if (!shipment.actual) shipment.actual = newEtaValue;
  }
}
