"use strict";

/* ROUTING: form Tambah/Edit Jadwal sekarang HALAMAN PENUH (bukan modal */
// Satu-satunya tempat yang mengatur halaman mana yang tampil
const PAGE_VIEWS = {
  accounts: "#viewAccounts",
  overview: "#viewOverview",
  schedule: "#viewList",
  docnum: "#viewDocNum",
  form: "#viewForm",
};

function showPage(page) {
  Object.entries(PAGE_VIEWS).forEach(([key, sel]) => {
    const el = $(sel);
    if (el) el.classList.toggle("d-none", key !== page);
  });
  // Bilah atas & footer disembunyikan HANYA di halaman form: saat mengisi data
  $(".app-topbar").classList.toggle("d-none", page === "form");
  const footer = $("#appFooter");
  if (footer) footer.classList.toggle("d-none", page === "form");
  // Tombol keluar mengambang ikut disembunyikan di halaman form supaya
  // tidak menutupi bilah simpan.
  const fab = $("#btnLogout");
  if (fab) fab.classList.toggle("d-none", page === "form");
  if (typeof setActivePageNav === "function" && page !== "form") {
    setActivePageNav(page);
  }
}

function showListView() {
  showPage("schedule");
}

function showOverviewView() {
  showPage("overview");
  window.scrollTo(0, 0);
  // Isi halaman disiapkan DI SINI, bukan saat aplikasi dibuka
  renderOverview();
}

function showDocNumView() {
  showPage("docnum");
  window.scrollTo(0, 0);
  // Isi halaman baru disiapkan DI SINI — bukan saat aplikasi dibuka
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

  /* Viewer hanya punya akses ke halaman Jadwal. Tautannya memang
     disembunyikan, tapi URL bisa diketik langsung. */
  const halamanEximSaja =
    hash === "#/new" ||
    hash === "#/akun" ||
    hash === "#/ringkasan" ||
    hash === "#/docnum" ||
    !!editMatch;
  if (halamanEximSaja && !canEdit()) {
    showToast("Halaman ini hanya untuk peran EXIM.", "danger");
    location.hash = "#/";
    return;
  }

  if ((hash === "#/new" || editMatch) && !canEdit()) {
    showToast("Hanya peran EXIM yang boleh mengubah jadwal.", "danger");
    location.hash = "#/";
    return;
  }

  // Ringkasan harian
  if (hash === "#/ringkasan") {
    showOverviewView();
    return;
  }

  /* Kelola akun: hanya exim. Dijaga di sini juga, bukan cuma dengan
     menyembunyikan tautannya di bilah atas */
  if (hash === "#/akun") {
    if (!canEdit()) {
      showToast("Halaman kelola akun hanya untuk peran EXIM.", "danger");
      location.hash = "#/";
      return;
    }
    showAccountView();
    return;
  }

  // Permintaan Nomor Dokumen
  if (hash === "#/docnum") {
    showDocNumView();
    if (typeof isiPilihanJadwal === "function") isiPilihanJadwal();
    return;
  }

  // Tambah Jadwal
  if (hash === "#/new") {
    renderFormPage(null);
    return;
  }

  // Edit Jadwal
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

  // Dashboard
  showListView();
  render();
}

// Jalankan router ketika URL berubah
window.addEventListener("hashchange", router);

// "12 BOX" <-> kotak angka + kotak satuan.
/* Satu isian: angka & satuan ditulis apa adanya ("4 BOX"). */
function setPackageFields(raw) {
  $("#fPackage").value = String(raw || "").trim();
  autoSizePackageFooter();
}
function autoSizePackageFooter() {
  autoSizeInput($("#fPackage"), 92, 210);
}
// Tanpa listener ini lebar kotak hanya dihitung saat form dibuka
$("#fPackage").addEventListener("input", autoSizePackageFooter);

/* Satu isian sekarang — dibiarkan sebagai fungsi supaya pemanggilnya
   tidak perlu ikut berubah. */
function joinPackageFields() {
  return $("#fPackage").value.trim();
}

function renderFormPage(id) {
  const lbl = ML();
  // Riwayat "field ini diisi oleh sumber mana" direset tiap form dibuka
  resetImportFieldOrigins();
  // Dropdown status hanya menampilkan status yang berlaku di section ini (requirement D)
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

  // Total Package (foot-package, sebelah Total Qty/Netto/Bruto/Nilai)
  const isImport = activeMode === "import";
  /* Import: terjumlah otomatis dari kolom Kemasan tiap barang, jadi
     dikunci. Export: diisi manual. */
  $("#fPackage").readOnly = isImport;
  $("#fPackage").placeholder = isImport ? "Terjumlah otomatis" : "Cth: 4 BOX";
  $("#fPackage").title = isImport
    ? "Otomatis dari total Jumlah Kemasan semua barang — edit lewat kolom Kemasan di tabel barang."
    : "";

  // Kolom CBM (th tabel barang + Total CBM di footer) cuma relevan di Export
  $$(".cbm-col-static").forEach((el) =>
    el.classList.toggle("d-none", isImport),
  );

  $$("#detailTabs .nav-link").forEach((b, i) =>
    b.classList.toggle("active", i === 0),
  );
  $$(".tab-pane").forEach((p, i) => p.classList.toggle("d-none", i !== 0));
  syncFormStep();

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
    ].forEach((fid) => ($("#" + fid).value = ""));
    $("#fMuatan").value = "";
    $("#fTransport").value = "laut";
    $("#fStatus").value = "process";
    $("#fIncoterm").value = "FOB";
    $("#fRouteType").value = "direct";
    // Tarif bea masuk hampir selalu 5% untuk barang yang dibawa DDI, jadi diisi lebih dulu
    $("#fTarif").value = "5";
    draftItems = [newItem()];
    draftNotesLog = [];
    draftStops = [];
  }
  applyTransportLabels();
  applyDelayFieldVisibility();
  /* Mesin prediksi disiapkan SETELAH seluruh isian terpasang: ia membaca
     ETD, moda, muatan, rute, dan progres dokumen sekaligus. Dipanggil
     lebih awal, ia akan menghitung dari form yang masih kosong. */
  if (typeof initPredictionForm === "function") {
    initPredictionForm(id ? currentList().find((x) => x.id === id) : null);
  }
  renderNotesTimeline();
  autoSizePackageFooter();
  $("#fNoteDraft").value = "";
  renderItemTable();
  renderRouteStopsUI();
  /* Urutannya penting */
  initAutoDutyFlags();
  /* Satu-satunya tempat BM + PDRI dihitung: saat form dibuka, dari data
     yang SUDAH tersimpan. Selama diketik ia dibiarkan apa adanya —
     lihat catatan di recalcCustoms(). */
  recalcCustoms({ hitungBmPdri: true });
  syncAffixState();
  syncFormValidity();
  showFormView();
}

/* PENANDA LANGKAH & KELENGKAPAN */
function syncFormStep() {
  const tabs = $$("#detailTabs .nav-link");
  const idx = Math.max(
    0,
    tabs.findIndex((b) => b.classList.contains("active")),
  );
  const lbl = $("#formStepLabel");
  if (lbl) lbl.textContent = `Langkah ${idx + 1} dari ${tabs.length}`;
  $$("#formStepDots .form-progress-dot").forEach((d, i) => {
    d.classList.toggle("is-done", i < idx);
    d.classList.toggle("is-current", i === idx);
  });
}

// Syarat yang dipakai di sini SAMA PERSIS dengan yang diperiksa btnSaveShipment sebelum menyimpan
function syncFormValidity() {
  const el = $("#formValidity");
  if (!el) return;
  const kurang = [];
  if (!$("#fEtd").value) kurang.push("ETD");
  if (!$("#fEta").value) kurang.push("ETA");
  if (!draftItems.some((it) => (it.namaBarang || "").trim() !== ""))
    kurang.push("minimal 1 nama barang");
  if ($("#fRouteType").value === "transit" &&
      !draftStops.some((st) => (st.terminal || "").trim() !== ""))
    kurang.push("minimal 1 terminal transit");

  if (!kurang.length) {
    el.className = "form-validity form-validity--ok";
    el.innerHTML = `<i class="bi bi-check-circle-fill"></i> Siap disimpan`;
  } else {
    el.className = "form-validity form-validity--warn";
    el.innerHTML = `<i class="bi bi-exclamation-circle"></i> Belum lengkap: ${escapeHtml(kurang.join(", "))}`;
  }
}

// Dipantau terus supaya penandanya tidak pernah basi.
["fEtd", "fEta", "fRouteType"].forEach((idf) => {
  const el = $("#" + idf);
  if (el) el.addEventListener("change", syncFormValidity);
});

/* Requirement D: saat status DELAY, tampilkan TANGGAL UPDATE DELAY — */
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
  if (!requireEdit()) return;
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
  // Direct = persis 2 terminal (asal & tujuan yang sudah ada)
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
    /* Bukan tanggal, melainkan cara ETA di atas diperoleh. Tanpa ini
       tersimpan, jadwal yang ETA-nya sengaja diketik manual akan
       ditimpa mesin pada pemuatan berikutnya. */
    etaMode: typeof formEtaMode === "string" ? formEtaMode : "auto",
    deliveryMode: typeof formDeliveryMode === "string" ? formDeliveryMode : "auto",
    actual: $("#fActual").value,
    status: $("#fStatus").value,
    notesLog: draftNotesLog,
    // `notes` = teks entri terbaru
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
