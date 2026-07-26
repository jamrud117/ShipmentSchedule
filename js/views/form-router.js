"use strict";

/* ==================================================================
   ROUTING: form Tambah/Edit Jadwal sekarang HALAMAN PENUH (bukan modal
   lagi) supaya tidak dibatasi tinggi/scroll modal. Dikontrol lewat hash
   URL biar tombol back browser juga jalan sebagaimana mestinya.
     #/new         -> form tambah jadwal baru
     #/edit/<id>   -> form edit jadwal (id dicari di mode aktif dahulu,
                       kalau tidak ketemu dicoba di mode satunya)
     #/docnum      -> halaman Permintaan Nomor Dokumen (kerangka)
     (selain itu)  -> daftar jadwal (list)
================================================================== */
// Satu-satunya tempat yang mengatur halaman mana yang tampil. Semua
// halaman disembunyikan dulu, lalu satu dinyalakan — mencegah keadaan
// "dua halaman tampil sekaligus" kalau nanti halamannya bertambah lagi.
const PAGE_VIEWS = {
  schedule: "#viewList",
  docnum: "#viewDocNum",
  form: "#viewForm",
};

function showPage(page) {
  Object.entries(PAGE_VIEWS).forEach(([key, sel]) => {
    const el = $(sel);
    if (el) el.classList.toggle("d-none", key !== page);
  });
  // Navbar disembunyikan HANYA di halaman form: saat mengisi data, elemen
  // navigasi global lebih mengganggu daripada menolong (mudah tertekan
  // dan isian hilang). Di halaman lain navbar justru diperlukan.
  $(".main-navbar").classList.toggle("d-none", page === "form");
  if (typeof setActivePageNav === "function" && page !== "form") {
    setActivePageNav(page);
  }
}

function showListView() {
  showPage("schedule");
}

function showDocNumView() {
  showPage("docnum");
  window.scrollTo(0, 0);
  // Isi halaman baru disiapkan DI SINI — bukan saat aplikasi dibuka.
  // Sebelumnya pratinjau & riwayat hanya termuat setelah salah satu tab
  // diklik, sehingga halaman ini terlihat kosong saat pertama dibuka.
  // Ditaruh di sini pula supaya kueri-kuerinya TIDAK ikut berjalan saat
  // pengguna sedang di halaman jadwal.
  if (typeof showDocNumTab === "function") {
    showDocNumTab(docNumActiveTab || DOCNUM_DEFAULT_TAB);
  }
}

function showFormView() {
  showPage("form");
  window.scrollTo(0, 0);
}

function goBackToList() {
  location.hash = "#/";
}

function router() {
  const hash = location.hash || "#/";
  const editMatch = hash.match(/^#\/edit\/(.+)$/);

  // ===========================
  // Permintaan Nomor Dokumen
  // ===========================
  if (hash === "#/docnum") {
    showDocNumView();
    return;
  }

  // ===========================
  // Tambah Jadwal
  // ===========================
  if (hash === "#/new") {
    renderFormPage(null);
    return;
  }

  // ===========================
  // Edit Jadwal
  // ===========================
  if (editMatch) {
    const id = decodeURIComponent(editMatch[1]);

    // Jika data ada di mode lain, pindahkan mode terlebih dahulu
    if (!currentList().some((x) => x.id === id)) {
      const otherMode = activeMode === "import" ? "export" : "import";

      if (data[otherMode].some((x) => x.id === id)) {
        switchMode(otherMode);
      }
    }

    // Jika tetap tidak ditemukan, kembali ke dashboard
    if (!currentList().some((x) => x.id === id)) {
      location.hash = "#/";
      return;
    }

    renderFormPage(id);
    return;
  }

  // ===========================
  // Dashboard
  // ===========================
  showListView();
  render();
}

// Jalankan router ketika URL berubah
window.addEventListener("hashchange", router);

// "12 BOX" <-> kotak angka + kotak satuan.
function setPackageFields(raw) {
  const txt = String(raw || "").trim();
  // Angka boleh ber-pemisah ribuan ("1,200 BOX"), jadi koma & titik di
  // tengah deretan angka ikut ditangkap sebagai bagian angkanya.
  const m = txt.match(/^(-?[\d.,]+)\s*(.*)$/);
  $("#fPackage").value = m ? m[1] : txt;
  $("#fPackageUnit").value = m ? m[2].trim() : "";
  autoSizePackageFooter();
}
function autoSizePackageFooter() {
  autoSizeInput($("#fPackage"), 58, 190);
  autoSizeInput($("#fPackageUnit"), 66, 170);
}
// Tanpa listener ini lebar kotak hanya dihitung saat form dibuka, jadi
// begitu user MENGETIK "56 PACKAGE" kotaknya tetap selebar semula dan
// teksnya kepotong — inilah penyebab Total Package masih terpotong walau
// autoSizeInput() sudah dipanggil di beberapa tempat.
["fPackage", "fPackageUnit"].forEach((idf) => {
  $("#" + idf).addEventListener("input", autoSizePackageFooter);
});

function joinPackageFields() {
  const num = $("#fPackage").value.trim();
  const unit = $("#fPackageUnit").value.trim();
  return [num, unit].filter(Boolean).join(" ");
}

function renderFormPage(id) {
  const lbl = ML();
  // Riwayat "field ini diisi oleh sumber mana" direset tiap form dibuka,
  // supaya aturan anti-timpa (lihat import/apply-to-form.js) berlaku
  // per sesi pengisian, bukan menempel selamanya.
  resetImportFieldOrigins();
  // Dropdown status hanya menampilkan status yang berlaku di section ini
  // (requirement D): Import = PROCESS/DELAY/ARRIVED, Export =
  // PROCESS/DELAY/DELIVERED.
  const curStatus = id
    ? (currentList().find((x) => x.id === id) || {}).status || "process"
    : "process";
  $("#fStatus").innerHTML = statusOptionsHtml(activeMode, curStatus);
  $("#importNotesBox").classList.add("d-none");
  $("#importNotesSummary").innerHTML = "";
  $("#importNotesList").innerHTML = "";
  $("#lblDocNo").textContent = lbl.docNo;
  $("#lblDocDate").textContent = lbl.docDate;
  $("#lblParty").textContent = lbl.party;
  $("#lblFactoryDate").textContent = lbl.factoryDate;
  $("#lblFactoryTime").textContent = lbl.factoryTime;
  $("#lblOrigin").textContent = lbl.origin;
  $("#lblDestination").textContent = lbl.destination;
  $("#lblActual").textContent = lbl.actual;
  $("#dutySection").classList.toggle("d-none", !lbl.showDuty);

  // Total Package (foot-package, sebelah Total Qty/Netto/Bruto/Nilai):
  // mode Import = hasil hitung otomatis dari kolom Kemasan tiap barang
  // (readonly di sini, nilainya diisi oleh recalcCustoms() lewat
  // renderItemTable() di akhir fungsi ini). Mode Export = manual, tetap
  // bisa diketik bebas — package per barangnya dimensi (P*L*T), tidak
  // otomatis dijumlah jadi Total Package.
  const isImport = activeMode === "import";
  // Requirement C: Total Package pada Jadwal Import harus punya SATUAN
  // unit (bukan cuma angka). Angka & satuan dipisah jadi dua kotak
  // supaya angkanya tetap bisa dihitung otomatis dari kolom Kemasan tiap
  // barang, sementara satuannya diketik user. Yang disimpan ke database
  // tetap satu teks gabungan ("12 BOX"); hasil template copy tetap
  // ANGKA SAJA lewat formatter.packageNum() — lihat excel-row-format.js.
  // Kotak satuan tampil di KEDUA mode. Sebelumnya disembunyikan saat
  // Export, padahal setPackageFields() tetap memecah "56 PACKAGE" dan
  // menaruh "PACKAGE" di kotak tersembunyi itu — datanya ada tapi tidak
  // bisa dilihat/diedit, dan yang tampak hanya angkanya.
  $("#fPackageUnit").classList.remove("d-none");
  $("#fPackage").readOnly = isImport;
  $("#fPackage").placeholder = isImport ? "0" : "cth: 12";
  $("#fPackage").title = isImport
    ? "Otomatis dari total Jumlah Kemasan semua barang — edit lewat kolom Kemasan di tabel barang."
    : "";

  // Kolom CBM (th tabel barang + Total CBM di footer) cuma relevan di
  // Export (dimensi kemasan) — disembunyikan total di Import supaya
  // tidak ada kolom "0.000 m³" yang membingungkan di semua baris. Sel
  // td-nya sendiri (per baris) sudah menyesuaikan sendiri di
  // item-table.js waktu render, ini cuma utk elemen statis (th &
  // footer) yang TIDAK ikut di-render ulang oleh renderItemTable().
  $$(".cbm-col-static").forEach((el) =>
    el.classList.toggle("d-none", isImport),
  );

  $$("#detailTabs .nav-link").forEach((b, i) =>
    b.classList.toggle("active", i === 0),
  );
  $$(".tab-pane").forEach((p, i) => p.classList.toggle("d-none", i !== 0));

  if (id) {
    const s = currentList().find((x) => x.id === id);
    $("#modalTitle").textContent = lbl.modalTitleEdit;
    $("#fId").value = s.id;
    $("#fDocNo").value = s.docNo || "";
    $("#fDocDate").value = s.docDate || "";
    $("#fNoAju").value = s.noAju || "";
    $("#fParty").value = s.party || "";
    $("#fInvoice").value = s.invoice || "";
    $("#fMasterBL").value = s.masterBL || "";
    $("#fHouseBL").value = s.houseBL || "";
    $("#fFactoryDate").value = s.factoryDate || "";
    $("#fFactoryTime").value = s.factoryTime || "";
    $("#fForwarder").value = s.forwarder || "";
    $("#fForwarderPic").value = s.forwarderPic || "";
    $("#fTransport").value = s.transport || "laut";
    $("#fVessel").value = s.vessel || "";
    $("#fVoyage").value = s.voyage || "";
    $("#fContainer").value = s.container || "";
    $("#fMuatan").value = s.muatan || "";
    $("#fOrigin").value = s.origin || "";
    $("#fDestination").value = s.destination || "";
    $("#fEtd").value = s.etd || "";
    $("#fEta").value = s.eta || "";
    $("#fEtaUpdate").value = s.etaUpdate || "";
    $("#fEtdUpdate").value = s.etdUpdate || "";
    $("#fActual").value = s.actual || "";
    $("#fStatus").value = s.status || "process";
    draftNotesLog = normalizeNotesLog(s.notesLog, s.notes);
    $("#fIncoterm").value = s.incoterm || "FOB";
    $("#fFreight").value = formatNumberValue(s.freight);
    $("#fInsurance").value = formatNumberValue(s.insurance);
    $("#fNdpbm").value = formatNumberValue(s.ndpbm);
    $("#fTarif").value = formatNumberValue(s.tarif);
    $("#fBM").value = formatNumberValue(s.bm);
    $("#fPPN").value = formatNumberValue(s.ppn);
    $("#fPPH").value = formatNumberValue(s.pph);
    $("#fPI").value = s.pi || "";
    setPackageFields(s.package || "");
    $("#fRouteType").value = s.routeType || "direct";
    draftItems = JSON.parse(
      JSON.stringify(s.items && s.items.length ? s.items : [newItem()]),
    );
    draftStops = JSON.parse(JSON.stringify(s.routeStops || []));
  } else {
    $("#modalTitle").textContent = lbl.modalTitleNew;
    $("#fId").value = "";
    [
      "fDocNo",
      "fDocDate",
      "fNoAju",
      "fParty",
      "fInvoice",
      "fMasterBL",
      "fHouseBL",
      "fFactoryDate",
      "fFactoryTime",
      "fForwarder",
      "fForwarderPic",
      "fVessel",
      "fVoyage",
      "fContainer",
      "fOrigin",
      "fDestination",
      "fEtd",
      "fEta",
      "fEtaUpdate",
      "fEtdUpdate",
      "fActual",
      "fFreight",
      "fInsurance",
      "fNdpbm",
      "fTarif",
      "fBM",
      "fPPN",
      "fPPH",
      "fPI",
      "fPackage",
      "fPackageUnit",
    ].forEach((fid) => ($("#" + fid).value = ""));
    $("#fMuatan").value = "";
    $("#fTransport").value = "laut";
    $("#fStatus").value = "process";
    $("#fIncoterm").value = "FOB";
    $("#fRouteType").value = "direct";
    draftItems = [newItem()];
    draftNotesLog = [];
    draftStops = [];
  }
  applyTransportLabels();
  applyDelayFieldVisibility();
  renderNotesTimeline();
  autoSizePackageFooter();
  $("#fNoteDraft").value = "";
  renderItemTable();
  renderRouteStopsUI();
  showFormView();
}

/* ------------------------------------------------------------------
   Requirement D: saat status DELAY, tampilkan TANGGAL UPDATE DELAY —
   jadwal BARU hasil pemunduran. ETD & ETA di atas SENGAJA dibiarkan
   berisi rencana semula sebagai pembanding, jadi lama delay = tanggal
   update dikurangi jadwal asli, dan dibaca "+N hari dari ETA/ETD".
   Delay bisa dihitung dari ETA MAUPUN ETD — cukup isi salah satu.
------------------------------------------------------------------ */
function applyDelayFieldVisibility() {
  const isDelay = $("#fStatus").value === "delayed";
  $("#delayBlock").classList.toggle("d-none", !isDelay);
  if (!isDelay) return;
  const info = shipmentDelayInfo({
    etaUpdate: $("#fEtaUpdate").value,
    etdUpdate: $("#fEtdUpdate").value,
    eta: $("#fEta").value,
    etd: $("#fEtd").value,
  });
  const el = $("#delaySummary");
  if (!info) {
    el.textContent =
      "Isi Update ETA dan/atau Update ETD untuk menghitung lama delay.";
    return;
  }
  const d = info.days;
  const rentang = `${fmtDate(info.from)} → ${fmtDate(info.to)}`;
  el.textContent =
    d > 0
      ? `Mundur ${d} hari dari ${info.basis} (${rentang}).`
      : d < 0
        ? `Lebih cepat ${Math.abs(d)} hari dari ${info.basis} (${rentang}).`
        : `Tidak ada perubahan dari ${info.basis} (${rentang}).`;
}
$("#fStatus").addEventListener("change", applyDelayFieldVisibility);
["fEta", "fEtd", "fEtaUpdate", "fEtdUpdate"].forEach((idf) => {
  $("#" + idf).addEventListener("change", applyDelayFieldVisibility);
});

$("#btnSaveShipment").addEventListener("click", async () => {
  if (!$("#fEtd").value || !$("#fEta").value) {
    showToast("Mohon isi ETD dan ETA terlebih dahulu.", "danger");
    return;
  }
  const cleanItems = draftItems.filter((it) => it.namaBarang.trim() !== "");
  if (cleanItems.length === 0) {
    showToast(
      "Mohon isi minimal 1 nama barang pada tab Daftar Barang.",
      "danger",
    );
    return;
  }
  const routeType = $("#fRouteType").value;
  // Direct = persis 2 terminal (asal & tujuan yang sudah ada), jadi tidak
  // pernah mengirim baris shipment_route_stops apa pun kalau direct —
  // walaupun draftStops masih menyimpan kartu yang sempat diisi (biar
  // tidak hilang kalau user cuma salah pencet dropdown, tapi tidak akan
  // pernah ikut kesimpan selama masih "direct").
  const cleanStops =
    routeType === "transit"
      ? draftStops.filter((st) => st.terminal.trim() !== "")
      : [];
  if (routeType === "transit" && cleanStops.length === 0) {
    showToast(
      'Mohon tambahkan minimal 1 Terminal Transit, atau ganti Tipe Rute ke "Direct".',
      "danger",
    );
    return;
  }
  const id = $("#fId").value;
  const payload = {
    transport: $("#fTransport").value,
    docNo: $("#fDocNo").value.trim(),
    docDate: $("#fDocDate").value,
    noAju: $("#fNoAju").value.trim(),
    party: $("#fParty").value.trim(),
    invoice: $("#fInvoice").value.trim(),
    masterBL: $("#fMasterBL").value.trim(),
    houseBL: $("#fHouseBL").value.trim(),
    factoryDate: $("#fFactoryDate").value,
    factoryTime: $("#fFactoryTime").value,
    forwarder: $("#fForwarder").value.trim(),
    forwarderPic: $("#fForwarderPic").value.trim(),
    vessel: $("#fVessel").value.trim(),
    voyage: $("#fVoyage").value.trim(),
    container: $("#fContainer").value.trim(),
    muatan: $("#fMuatan").value,
    routeType: routeType,
    origin: $("#fOrigin").value.trim(),
    destination: $("#fDestination").value.trim(),
    etd: $("#fEtd").value,
    eta: $("#fEta").value,
    etaUpdate: $("#fEtaUpdate").value,
    etdUpdate: $("#fEtdUpdate").value,
    actual: $("#fActual").value,
    status: $("#fStatus").value,
    notesLog: draftNotesLog,
    // `notes` = teks entri terbaru — dipakai kolom REMARK/NOTES di
    // seluruh template copy & Bulk Export.
    notes: notesLogToPlainNotes(draftNotesLog),
    incoterm: $("#fIncoterm").value,
    freight: excelNum($("#fFreight").value),
    insurance: excelNum($("#fInsurance").value),
    ndpbm: excelNum($("#fNdpbm").value),
    tarif: excelNum($("#fTarif").value),
    bm: excelNum($("#fBM").value),
    ppn: excelNum($("#fPPN").value),
    pph: excelNum($("#fPPH").value),
    pi: $("#fPI").value.trim(),
    package: joinPackageFields(),
  };

  const btn = $("#btnSaveShipment");
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm" role="status"></span> Menyimpan...';
  try {
    if (id) {
      await updateShipmentRecord(id, payload, cleanItems, cleanStops);
    } else {
      await createShipment(payload, cleanItems, cleanStops);
    }
    await loadShipments();
    goBackToList();
    showToast("Jadwal berhasil disimpan.", "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan jadwal ke database.", "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
});
