"use strict";

/* ==================================================================
   MODAL TABS
================================================================== */
$$("#detailTabs .nav-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#detailTabs .nav-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".tab-pane").forEach((p) => p.classList.add("d-none"));
    $(`.tab-pane[data-tabpane="${btn.dataset.tab}"]`).classList.remove(
      "d-none",
    );
  });
});

/* ==================================================================
   TRANSPORT LABEL TOGGLE (modal)
================================================================== */
$("#fTransport").addEventListener("change", applyTransportLabels);
$("#fRouteType").addEventListener("change", () => {
  renderRouteStopsUI();
  applyTransportLabels();
});
function applyTransportLabels() {
  const air = $("#fTransport").value === "udara";
  $("#lblVesselText").textContent = air
    ? "Nama Maskapai / Pesawat"
    : "Nama Vessel";
  $("#lblVoyageText").textContent = air ? "No. Flight" : "No. Voyage";
  $("#fVessel").placeholder = air ? "Garuda Cargo" : "MV Ever Given";
  $("#fVoyage").placeholder = air ? "GA880/04JUL" : "V.023E";
  $("#lblMasterBL").textContent = air ? "Master AWB" : "Master B/L";
  $("#lblHouseBL").textContent = air ? "House AWB" : "House B/L";
  // Vessel/Voyage di atas hanya "leg terakhir" kalau rutenya transit DAN
  // sudah ada minimal 1 kartu terminal transit.
  const showFinalLegHint =
    $("#fRouteType").value === "transit" && draftStops.length > 0;
  $("#finalLegHintVessel").classList.toggle("d-none", !showFinalLegHint);
  $("#finalLegHintVoyage").classList.toggle("d-none", !showFinalLegHint);
}

/* ==================================================================
   AUTO-ARRIVE LIVE FEEDBACK INSIDE MODAL
   Hanya ETA yang otomatis mengubah status. Actual Delivery (#fActual)
   sengaja TIDAK punya listener serupa lagi — mengisi/mengubahnya
   tidak akan menyentuh status sama sekali.
================================================================== */
$("#fEta").addEventListener("change", () => {
  if (isPastOrToday($("#fEta").value) && $("#fStatus").value !== "arrived") {
    $("#fStatus").value = "arrived";
    if (!$("#fActual").value) $("#fActual").value = $("#fEta").value;
    showToast(
      `ETA sudah lewat/hari ini — status otomatis diubah ke "${STATUS_META.arrived.label}".`,
      "success",
    );
  }
});

/* ==================================================================
   INCOTERM / CUSTOMS RECALCULATION (modal)
================================================================== */
$("#fIncoterm").addEventListener("change", recalcCustoms);
["fFreight", "fInsurance", "fNdpbm", "fTarif", "fBM", "fPPN", "fPPH"].forEach(
  (id) => {
    $("#" + id).addEventListener("input", recalcCustoms);
  },
);

function recalcCustoms() {
  const tmp = {
    items: draftItems,
    incoterm: $("#fIncoterm").value,
    ndpbm: excelNum($("#fNdpbm").value),
    bm: excelNum($("#fBM").value),
    ppn: excelNum($("#fPPN").value),
    pph: excelNum($("#fPPH").value),
  };
  const calc = computeCustoms(tmp);

  $("#calcTotalUSD").textContent = fmtUSD(calc.totalUSD);

  const isCIF = tmp.incoterm === "CIF";
  const isFOB = tmp.incoterm === "FOB";
  $("#cifBlock").style.display = isCIF ? "flex" : "none";
  $("#fobBlock").style.display = isFOB ? "flex" : "none";
  $("#noCifFobNote").style.display = !isCIF && !isFOB ? "block" : "none";

  if (isCIF) {
    $("#calcCIF").textContent = fmtUSD(calc.cifUsd);
    $("#calcCIFRupiah").textContent = fmtRp(calc.cifRupiah);
  } else if (isFOB) {
    $("#calcFOB").textContent = fmtUSD(calc.fobUsd);
    $("#calcFOBRupiah").textContent = fmtRp(calc.fobRupiah);
  }

  $("#calcBMPDRI").value = fmtRp(calc.bmPdri);

  $("#footTotalQty").textContent = fmtNum(calc.totalQty);
  $("#footTotalNetto").textContent = fmtNum(calc.totalNetto);
  $("#footTotalBruto").textContent = fmtNum(calc.totalBruto);
  $("#footTotalUSD").textContent = fmtUSD(calc.totalUSD);
}
