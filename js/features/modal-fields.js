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
    // Penanda langkah di kepala halaman ikut berpindah.
    if (typeof syncFormStep === "function") syncFormStep();
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
  const lbl = ML();
  // Requirement B (label dinamis):
  //   moda LAUT  -> "Nama Vessel" jadi "Nama Voyager", "No. Flight" jadi
  //                 "No. Voyage"
  //   moda UDARA -> kebalikannya: label kembali "Nama Vessel" (BUKAN
  //                 "Nama Maskapai"), dan "No. Voyage" jadi "No. Flight"
  // Ini MURNI soal label yang tampil di form — nilai yang disalin ke
  // template copy tetap mengikuti vesselNameForTemplate() di
  // features/copy-templates.js, tidak terpengaruh perubahan label ini.
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
  // Vessel/Voyage di atas hanya "leg terakhir" kalau rutenya transit DAN
  // sudah ada minimal 1 kartu terminal transit.
  const showFinalLegHint =
    $("#fRouteType").value === "transit" && draftStops.length > 0;
  $("#finalLegHintVessel").classList.toggle("d-none", !showFinalLegHint);
  $("#finalLegHintVoyage").classList.toggle("d-none", !showFinalLegHint);
}

// Auto-arrive (ETA lewat/hari ini -> status otomatis ARRIVED) SUDAH
// DIHAPUS sesuai permintaan Bgenius. #fEta sekarang field tanggal
// biasa tanpa listener/efek samping ke #fStatus sama sekali — status
// murni diubah manual lewat dropdown Status.

/* ==================================================================
   INCOTERM / CUSTOMS RECALCULATION (modal)
================================================================== */
$("#fIncoterm").addEventListener("change", recalcCustoms);

/* ------------------------------------------------------------------
   PPN & PPH: dihitung otomatis, tapi tetap bisa ditimpa

   Aturannya satu kalimat: KOSONG BERARTI OTOMATIS, DIISI BERARTI
   MANUAL. Begitu pengguna mengetik angka sendiri, kolom itu berhenti
   ikut berubah saat Total Nilai Barang atau NDPBM berubah — kalau
   tidak, angka yang baru saja diketik akan tertimpa sendiri dan itu
   membingungkan. Mengosongkan kolomnya mengembalikannya ke otomatis,
   jadi tidak ada jalan buntu.

   Penanda ini WAJIB dipasang sebelum recalcCustoms() berjalan, karena
   recalcCustoms membacanya untuk memutuskan boleh menulis atau tidak.
   Sebab itu pendengar di bawah didaftarkan lebih dulu.
------------------------------------------------------------------ */
const AUTO_DUTY_FIELDS = ["fPPN", "fPPH"];
AUTO_DUTY_FIELDS.forEach((id) => {
  $("#" + id).addEventListener("input", (e) => {
    e.target.dataset.auto = e.target.value.trim() === "" ? "1" : "0";
  });
});

function isAutoDuty(el) {
  return el.dataset.auto !== "0";
}

// Dipanggil saat form dibuka: nilai yang sudah tersimpan dianggap
// dimasukkan dengan sengaja, jadi tidak ditimpa hitungan otomatis.
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

  /* ---- PPN & PPH otomatis ---------------------------------------
     Dasar hitungnya Total Nilai Barang (USD) x NDPBM, lalu:
       PPN = 11%
       PPH = 2,5%
     Bea Masuk sengaja TIDAK ikut dihitung: tarifnya berbeda per HS
     Code, jadi angkanya tidak bisa diturunkan dari data yang ada di
     form ini. Kolomnya tetap manual.

     Kalau suatu saat dasarnya perlu diubah (mis. ke CIF + Bea Masuk),
     satu-satunya tempat yang perlu disunting adalah blok ini. */
  const dasarRupiah = calc0.totalUSD * tmp.ndpbm;
  const elPpn = $("#fPPN");
  const elPph = $("#fPPH");
  if (isAutoDuty(elPpn)) {
    elPpn.value = dasarRupiah ? formatNumberValue(Math.round(dasarRupiah * 0.11)) : "";
  }
  if (isAutoDuty(elPph)) {
    elPph.value = dasarRupiah ? formatNumberValue(Math.round(dasarRupiah * 0.025)) : "";
  }

  // Dihitung ulang memakai PPN/PPH terbaru supaya BM + PDRI ikut benar
  // pada putaran yang sama, bukan tertinggal satu langkah.
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

  // Tanpa awalan "Rp" di dalam nilainya — lambangnya digambar sebagai
  // lapisan oleh .input-affix, jadi isinya tetap angka murni.
  $("#calcBMPDRI").value = formatNumberValue(calc.bmPdri);
  syncAffixState();

  $("#footTotalQty").textContent = fmtNum(calc.totalQty);
  $("#footTotalNetto").textContent = fmtNum(calc.totalNetto);
  $("#footTotalBruto").textContent = fmtNum(calc.totalBruto);
  $("#footTotalUSD").textContent = fmtUSD(calc.totalUSD);
  // Total CBM (mode Export) — beda dari Total Package: ini SELALU hasil
  // hitung otomatis (jumlah CBM tiap barang), tidak ada versi manual,
  // karena m³ itu sendiri memang wajar dijumlah langsung (bukan seperti
  // "jumlah kemasan" yang beda unit antar jenis kemasan). Elemennya
  // disembunyikan di mode Import lewat class cbm-col (lihat
  // form-router.js), jadi aman tetap diisi di sini apapun mode-nya.
  $("#footTotalCbm").textContent = fmtNum(calc.totalCbm);

  // Total Package: mode Import HARUS selalu = hasil hitung dari kolom
  // Kemasan tiap barang (readonly di form — lihat toggle di
  // form-router.js), jadi ditimpa di sini tiap kali tabel barang
  // berubah. Mode Export SENGAJA tidak disentuh sama sekali — field-nya
  // manual, diisi & disimpan apa adanya dari yang diketik user (lihat
  // pesan Bgenius: dimensi per barang tidak otomatis dijumlah jadi
  // Total Package, beda kasus dari Import).
  if (activeMode === "import") {
    // Ditulis berformat agar seragam dengan kotak angka lainnya.
    $("#fPackage").value = formatNumberValue(
      Math.round(calc.totalPackageQty * 100) / 100,
    );
    // Lebar kotak ikut panjang angkanya, supaya tidak kepotong.
    autoSizeInput($("#fPackage"), 58, 190);
  }
}


/* ==================================================================
   KEADAAN LAMBANG MATA UANG

   Lambang $ / Rp / % meredup saat kolomnya kosong dan menegas begitu
   terisi. Nilainya sendiri tidak pernah disentuh — lambangnya cuma
   lapisan CSS (lihat .input-affix di css/form.css), sehingga template
   salin & Bulk Export tetap menerima angka murni tanpa perlu
   membersihkan apa pun.
================================================================== */
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
