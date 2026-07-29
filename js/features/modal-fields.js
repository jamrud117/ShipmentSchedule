"use strict";

/* MODAL TABS */
$$("#detailTabs .nav-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#detailTabs .nav-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".tab-pane").forEach((p) => p.classList.add("d-none"));
    $(`.tab-pane[data-tabpane="${btn.dataset.tab}"]`).classList.remove(
      "d-none",
    );
    // Penanda langkah di kepala halaman ikut berpindah.
    if (typeof syncFormStep === "function") syncFormStep();
  });
});

/* TRANSPORT LABEL TOGGLE (modal) */
$("#fTransport").addEventListener("change", applyTransportLabels);
$("#fRouteType").addEventListener("change", () => {
  renderRouteStopsUI();
  applyTransportLabels();
});
function applyTransportLabels() {
  const air = $("#fTransport").value === "udara";
  // Saran pelabuhan/bandara ikut moda yang dipilih
  if (typeof refreshUnlocodeDatalist === "function") refreshUnlocodeDatalist();
  const lbl = ML();
  // Requirement B (label dinamis): moda LAUT -> "Nama Vessel" jadi "Nama Voyager", "No
  const transport = air ? "udara" : "laut";
  $("#lblVesselText").textContent = "Nama " + vesselNoun(transport);
  $("#lblVoyageText").textContent = voyageNoun(transport);
  // Pelabuhan -> Terminal saat moda udara.
  $("#lblOrigin").textContent = portNoun("origin", transport);
  $("#lblDestination").textContent = portNoun("destination", transport);
  $("#fVessel").placeholder = air ? "Garuda Cargo" : "MV Ever Given";
  $("#fVoyage").placeholder = air ? "GA880/04JUL" : "V.023E";
  $("#lblMasterBL").textContent = air ? "Master AWB" : "Master B/L";
  $("#lblHouseBL").textContent = air ? "House AWB" : "House B/L";
  // Vessel/Voyage di atas hanya "leg terakhir" kalau rutenya transit DAN sudah ada minimal 1 kartu
  const showFinalLegHint =
    $("#fRouteType").value === "transit" && draftStops.length > 0;
  $("#finalLegHintVessel").classList.toggle("d-none", !showFinalLegHint);
  $("#finalLegHintVoyage").classList.toggle("d-none", !showFinalLegHint);
}

// Auto-arrive (ETA lewat/hari ini -> status otomatis ARRIVED) SUDAH DIHAPUS sesuai permintaan

/* INCOTERM / CUSTOMS RECALCULATION (modal) */
$("#fIncoterm").addEventListener("change", recalcCustoms);

/* PPN & PPH otomatis. Aturannya: kosong = otomatis, diisi = manual */
const AUTO_DUTY_FIELDS = ["fPPN", "fPPH"];
AUTO_DUTY_FIELDS.forEach((id) => {
  $("#" + id).addEventListener("input", (e) => {
    e.target.dataset.auto = e.target.value.trim() === "" ? "1" : "0";
  });
});

function isAutoDuty(el) {
  return el.dataset.auto !== "0";
}

// Dipanggil saat form dibuka: nilai yang sudah tersimpan dianggap dimasukkan dengan sengaja
function initAutoDutyFlags() {
  AUTO_DUTY_FIELDS.forEach((id) => {
    const el = $("#" + id);
    el.dataset.auto = el.value.trim() === "" ? "1" : "0";
  });
}

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
  const calc0 = computeCustoms(tmp);

  /* PPN & PPH otomatis */
  const dasarRupiah = calc0.totalUSD * tmp.ndpbm;
  const elPpn = $("#fPPN");
  const elPph = $("#fPPH");
  if (isAutoDuty(elPpn)) {
    elPpn.value = dasarRupiah ? formatNumberValue(Math.round(dasarRupiah * 0.11)) : "";
  }
  if (isAutoDuty(elPph)) {
    elPph.value = dasarRupiah ? formatNumberValue(Math.round(dasarRupiah * 0.025)) : "";
  }

  // Dihitung ulang memakai PPN/PPH terbaru supaya BM + PDRI ikut benar pada putaran yang sama
  tmp.ppn = excelNum(elPpn.value);
  tmp.pph = excelNum(elPph.value);
  const calc = computeCustoms(tmp);

  $("#calcTotalUSD").textContent = fmtUSD(calc.totalUSD);

  const isCIF = tmp.incoterm === "CIF";
  const isFOB = tmp.incoterm === "FOB";
  $$(".calc-box--cif").forEach((el) => {
    el.style.display = isCIF ? "" : "none";
  });
  $$(".calc-box--fob").forEach((el) => {
    el.style.display = isFOB ? "" : "none";
  });
  $("#noCifFobNote").style.display = !isCIF && !isFOB ? "block" : "none";

  if (isCIF) {
    $("#calcCIF").textContent = fmtUSD(calc.cifUsd);
    $("#calcCIFRupiah").textContent = fmtRp(calc.cifRupiah);
  } else if (isFOB) {
    $("#calcFOB").textContent = fmtUSD(calc.fobUsd);
    $("#calcFOBRupiah").textContent = fmtRp(calc.fobRupiah);
  }

  // Tanpa awalan "Rp" di dalam nilainya
  $("#calcBMPDRI").value = formatNumberValue(calc.bmPdri);
  syncAffixState();

  $("#footTotalQty").textContent = fmtNum(calc.totalQty);
  $("#footTotalNetto").textContent = fmtNum(calc.totalNetto);
  $("#footTotalBruto").textContent = fmtNum(calc.totalBruto);
  $("#footTotalUSD").textContent = fmtUSD(calc.totalUSD);
  // Total CBM (mode Export) — beda dari Total Package: ini SELALU hasil hitung otomatis
  $("#footTotalCbm").textContent = fmtNum(calc.totalCbm);

  // Total Package: mode Import HARUS selalu = hasil hitung dari kolom Kemasan tiap barang
  if (activeMode === "import") {
    // Ditulis berformat agar seragam dengan kotak angka lainnya.
    $("#fPackage").value = formatNumberValue(
      Math.round(calc.totalPackageQty * 100) / 100,
    );
    // Lebar kotak ikut panjang angkanya, supaya tidak kepotong.
    autoSizeInput($("#fPackage"), 58, 190);
  }
}

/* KEADAAN LAMBANG MATA UANG */
function syncAffixState(scope) {
  const root = scope || document;
  root.querySelectorAll(".input-affix").forEach((wrap) => {
    const inp = wrap.querySelector("input");
    wrap.classList.toggle("has-value", !!(inp && inp.value.trim()));
  });
}

document.addEventListener("input", (e) => {
  const wrap = e.target.closest && e.target.closest(".input-affix");
  if (wrap) wrap.classList.toggle("has-value", !!e.target.value.trim());
});
