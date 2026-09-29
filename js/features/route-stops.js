"use strict";

/* ROUTE STOPS / TERMINAL TRANSIT (draft, di dalam modal) */
function stopCardHtml(st, idx, total) {
  const air = st.transport === "udara";
  const isLast = idx === total - 1;
  return `
    <div class="route-stop-card" data-idx="${idx}">
      <div class="route-stop-head">
        <span class="route-stop-badge"><i class="bi bi-signpost-split"></i> Transit ${idx + 1}</span>
        <div class="route-stop-actions">
          <button type="button" class="mv-stop-up" data-idx="${idx}" title="${tt("Naikkan urutan", "Move up")}" ${idx === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
          <button type="button" class="mv-stop-down" data-idx="${idx}" title="${tt("Turunkan urutan", "Move down")}" ${isLast ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
          <button type="button" class="rm-stop" data-idx="${idx}" title="${tt("Hapus terminal ini", "Remove this terminal")}"><i class="bi bi-trash3"></i></button>
        </div>
      </div>
      <div class="row g-2">
        <div class="col-md-5">
          <label class="form-label">${tt("Nama Terminal", "Terminal Name")}</label>
          <!-- Saran pelabuhan mengikuti moda BARIS INI, bukan moda
               pengiriman di atas: satu perjalanan bisa laut sampai
               Singapura lalu udara ke Jakarta, dan menawarkan daftar
               bandara untuk terminal laut membuat sarannya lebih
               menghalangi daripada menolong. Baris digambar ulang tiap
               modanya diganti, jadi daftarnya ikut berganti. -->
          <input type="text" class="form-control form-control-sm" data-f="terminal" list="unlocodeList${air ? "Udara" : "Laut"}" value="${escapeAttr(st.terminal)}" placeholder="${air ? tt("Nama bandara transit", "Transit airport name") : tt("Nama pelabuhan transit", "Transit port name")}">
        </div>
        <div class="col-md-2">
          <label class="form-label">${tt("Moda", "Mode")}</label>
          <select class="form-select form-select-sm" data-f="transport">
            <option value="laut" ${!air ? "selected" : ""}>${tt("Laut", "Sea")}</option>
            <option value="udara" ${air ? "selected" : ""}>${tt("Udara", "Air")}</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">${air ? tt("Nama Pesawat/Maskapai", "Aircraft/Airline Name") : tt("Nama Vessel", "Vessel Name")}</label>
          <input type="text" class="form-control form-control-sm" data-f="vessel" list="carrierList${air ? "Udara" : "Laut"}" value="${escapeAttr(st.vessel)}" placeholder="${air ? tt("Nama maskapai", "Airline name") : tt("Nama pelayaran", "Shipping line name")}">
        </div>
        <div class="col-md-2">
          <label class="form-label">${air ? "No. Flight" : "No. Voyage"}</label>
          <input type="text" class="form-control form-control-sm" data-f="voyage" value="${escapeAttr(st.voyage)}">
        </div>
        <div class="col-md-4">
          <label class="form-label">${tt("Tiba di Terminal Ini", "Arrival at This Terminal")}</label>
          <input type="date" class="form-control form-control-sm" data-f="arrivalDate" value="${st.arrivalDate || ""}">
        </div>
        <div class="col-md-4">
          <label class="form-label">${tt("Berangkat dari Terminal Ini", "Departure from This Terminal")}</label>
          <input type="date" class="form-control form-control-sm" data-f="departureDate" value="${st.departureDate || ""}">
        </div>
      </div>
      ${
        isLast
          ? `<div class="form-text-note mt-1"><i class="bi bi-arrow-return-right"></i> ${tt("Leg setelah terminal ini (menuju Pelabuhan Tujuan) memakai field Moda Transportasi/Vessel/Voyage di bagian atas form.", "The leg after this terminal (to the Port of Destination) uses the Transport Mode/Vessel/Voyage fields at the top of the form.")}</div>`
          : ""
      }
    </div>`;
}

function renderRouteStopsUI() {
  const isTransit = $("#fRouteType").value === "transit";
  $("#routeStopsWrap").classList.toggle("d-none", !isTransit);
  if (!isTransit) return;
  $("#routeStopsBody").innerHTML = draftStops.length
    ? draftStops
        .map((st, idx) => stopCardHtml(st, idx, draftStops.length))
        .join("")
    : `<div class="form-text-note">${tt(`Belum ada terminal transit — klik "Tambah Terminal" di atas.`, `No transit terminals yet — click "Add Terminal" above.`)}</div>`;
}

$("#routeStopsBody").addEventListener("input", (e) => {
  const card = e.target.closest(".route-stop-card");
  if (!card) return;
  const idx = Number(card.dataset.idx);
  const field = e.target.dataset.f;
  if (!field) return;
  draftStops[idx][field] = e.target.value;
  // Cuma field Moda yang butuh re-render (label Vessel/Voyage di kartu ini ikut berubah)
  if (field === "transport") {
    renderRouteStopsUI();
    applyTransportLabels();
  }
});

$("#routeStopsBody").addEventListener("click", (e) => {
  const rm = e.target.closest(".rm-stop");
  const up = e.target.closest(".mv-stop-up");
  const down = e.target.closest(".mv-stop-down");
  if (rm) {
    draftStops.splice(Number(rm.dataset.idx), 1);
    renderRouteStopsUI();
    applyTransportLabels();
    return;
  }
  if (up) {
    const idx = Number(up.dataset.idx);
    if (idx > 0) {
      [draftStops[idx - 1], draftStops[idx]] = [
        draftStops[idx],
        draftStops[idx - 1],
      ];
      renderRouteStopsUI();
    }
    return;
  }
  if (down) {
    const idx = Number(down.dataset.idx);
    if (idx < draftStops.length - 1) {
      [draftStops[idx + 1], draftStops[idx]] = [
        draftStops[idx],
        draftStops[idx + 1],
      ];
      renderRouteStopsUI();
    }
    return;
  }
});

$("#btnAddStop").addEventListener("click", () => {
  draftStops.push(newStop());
  renderRouteStopsUI();
  applyTransportLabels();
});
