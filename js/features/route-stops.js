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
          <button type="button" class="mv-stop-up" data-idx="${idx}" title="Naikkan urutan" ${idx === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
          <button type="button" class="mv-stop-down" data-idx="${idx}" title="Turunkan urutan" ${isLast ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
          <button type="button" class="rm-stop" data-idx="${idx}" title="Hapus terminal ini"><i class="bi bi-trash3"></i></button>
        </div>
      </div>
      <div class="row g-2">
        <div class="col-md-5">
          <label class="form-label">Nama Terminal</label>
          <!-- Saran pelabuhan mengikuti moda BARIS INI, bukan moda
               pengiriman di atas: satu perjalanan bisa laut sampai
               Singapura lalu udara ke Jakarta, dan menawarkan daftar
               bandara untuk terminal laut membuat sarannya lebih
               menghalangi daripada menolong. Baris digambar ulang tiap
               modanya diganti, jadi daftarnya ikut berganti. -->
          <input type="text" class="form-control form-control-sm" data-f="terminal" list="unlocodeList${air ? "Udara" : "Laut"}" value="${escapeAttr(st.terminal)}" placeholder="${air ? "mis. Singapore Changi, Incheon" : "mis. Singapore, Port Klang"}">
        </div>
        <div class="col-md-2">
          <label class="form-label">Moda</label>
          <select class="form-select form-select-sm" data-f="transport">
            <option value="laut" ${!air ? "selected" : ""}>Laut</option>
            <option value="udara" ${air ? "selected" : ""}>Udara</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">${air ? "Nama Pesawat/Maskapai" : "Nama Vessel"}</label>
          <input type="text" class="form-control form-control-sm" data-f="vessel" list="carrierList${air ? "Udara" : "Laut"}" value="${escapeAttr(st.vessel)}" placeholder="${air ? "mis. SQ, KE" : "mis. MSC, ONE"}">
        </div>
        <div class="col-md-2">
          <label class="form-label">${air ? "No. Flight" : "No. Voyage"}</label>
          <input type="text" class="form-control form-control-sm" data-f="voyage" value="${escapeAttr(st.voyage)}">
        </div>
        <div class="col-md-4">
          <label class="form-label">Tiba di Terminal Ini</label>
          <input type="date" class="form-control form-control-sm" data-f="arrivalDate" value="${st.arrivalDate || ""}">
        </div>
        <div class="col-md-4">
          <label class="form-label">Berangkat dari Terminal Ini</label>
          <input type="date" class="form-control form-control-sm" data-f="departureDate" value="${st.departureDate || ""}">
        </div>
      </div>
      ${
        isLast
          ? `<div class="form-text-note mt-1"><i class="bi bi-arrow-return-right"></i> Leg setelah terminal ini (menuju Pelabuhan Tujuan) memakai field Moda Transportasi/Vessel/Voyage di bagian atas form.</div>`
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
    : `<div class="form-text-note">Belum ada terminal transit — klik "Tambah Terminal" di atas.</div>`;
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
