"use strict";

/* RUTE OTOMATIS DI FORM — lihat js/core/route-inference.js.

   Begitu kapal/pesawat, no. voyage/flight, atau pelabuhan diganti,
   Tipe Rute (dan terminal transit pertamanya) diisi dari tebakan.

   PILIHAN PENGGUNA MENANG. Sekali Tipe Rute diubah tangan, form ini
   berhenti mengubahnya sampai form dibuka ulang. Terminal transit yang
   sudah diketik juga tidak pernah ditimpa -- hanya yang tadinya diisi
   otomatis yang boleh dibuang lagi. Membuka jadwal lama tidak
   mengubah apa pun: tebakan baru jalan saat salah satu kolom di atas
   benar-benar diganti. */
let ruteDiubahTangan = false;
let ruteSedangDiisi = false;
let ruteIdForm = null;
// Transit di form saat ini diisi OLEH tebakan (bukan oleh pengguna)
let ruteDariTebakan = false;

function resetRuteOtomatis(s) {
  ruteDiubahTangan = false;
  ruteDariTebakan = false;
  ruteIdForm = (s && s.id) || null;
  tampilkanPetunjukRute(null);
}

function tampilkanPetunjukRute(r, manual, catatan) {
  const el = document.getElementById("routeAutoHint");
  if (!el) return;
  if (!r && !manual && catatan) {
    el.innerHTML = `<i class="bi bi-magic"></i> <b>${escapeHtml(tt("Rute otomatis", "Automatic route"))}:</b> ${escapeHtml(catatan)}`;
    el.classList.remove("d-none");
    return;
  }
  if (manual) {
    el.innerHTML = `<i class="bi bi-hand-index"></i> ${escapeHtml(tt("Tipe rute dipilih manual — tidak diubah otomatis lagi.", "Route type chosen manually — no longer set automatically."))}`;
    el.classList.remove("d-none");
    return;
  }
  if (!r) {
    el.innerHTML = "";
    el.classList.add("d-none");
    return;
  }
  const via = r.via && r.via.length ? ` via ${r.via.map((v) => resolvePortCode(v) || v).join(", ")}` : "";
  el.innerHTML = `<i class="bi bi-magic"></i> <b>${escapeHtml(tt("Rute otomatis", "Automatic route"))}:</b> ${escapeHtml((r.routeType === "transit" ? "Transit" : "Direct") + via)} — ${escapeHtml(r.reason)}`;
  el.classList.remove("d-none");
}

function terapkanRuteOtomatis() {
  if (ruteDiubahTangan || typeof inferRoute !== "function") return;
  const src = predictionFormSource();
  const r = inferRoute(src, { kecualiId: ruteIdForm });
  /* Tanpa tebakan pun pengguna diberi tahu KENAPA -- sebelumnya kotak
     ini diam, dan rute otomatis terlihat tidak berjalan. Hanya kalau
     kapal/pesawat sudah diisi: form kosong tidak perlu diceramahi. */
  const adaSarana = String(src.vessel || src.voyage || "").trim();
  tampilkanPetunjukRute(r, false, !r && adaSarana && typeof routeInferenceNote === "function" ? routeInferenceNote(src) : "");
  const sel = document.getElementById("fRouteType");
  ruteSedangDiisi = true;
  try {
    if (!r) {
      /* Bukti transitnya hilang (kapal/pesawat/pelabuhan diganti):
         yang tadi DIISI TEBAKAN dikembalikan ke Direct. Isian pengguna
         sendiri tidak pernah disentuh. */
      if (ruteDariTebakan) {
        if (draftStops.length && draftStops.every((st) => st._otomatis)) {
          draftStops = [];
        }
        sel.value = "direct";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        ruteDariTebakan = false;
      }
      return;
    }
    if (sel.value !== r.routeType) {
      sel.value = r.routeType;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    ruteDariTebakan = true;
    const terisiTangan = draftStops.some((st) => String(st.terminal || "").trim() && !st._otomatis);
    if (r.via.length && !terisiTangan) {
      draftStops = r.via.map((v) => Object.assign(newStop(), { terminal: v, transport: src.transport || "laut", _otomatis: true }));
      renderRouteStopsUI();
      applyTransportLabels();
    }
  } finally {
    ruteSedangDiisi = false;
  }
  // Ringkasan "belum lengkap" di bilah simpan ikut terbarui
  if (typeof syncFormValidity === "function") syncFormValidity();
}

(function pasangRuteOtomatis() {
  const sel = document.getElementById("fRouteType");
  if (!sel) return;
  sel.addEventListener("change", () => {
    if (ruteSedangDiisi) return;
    ruteDiubahTangan = true;
    tampilkanPetunjukRute(null, true);
  });
  ["fVessel", "fVoyage", "fOrigin", "fDestination", "fTransport"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", terapkanRuteOtomatis);
  });
})();
