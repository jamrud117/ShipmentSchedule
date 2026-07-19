"use strict";

/* ==================================================================
   ROUTING: form Tambah/Edit Jadwal sekarang HALAMAN PENUH (bukan modal
   lagi) supaya tidak dibatasi tinggi/scroll modal. Dikontrol lewat hash
   URL biar tombol back browser juga jalan sebagaimana mestinya.
     #/new         -> form tambah jadwal baru
     #/edit/<id>   -> form edit jadwal (id dicari di mode aktif dahulu,
                       kalau tidak ketemu dicoba di mode satunya)
     (selain itu)  -> daftar jadwal (list)
================================================================== */
function showListView() {
  viewFormEl.classList.add("d-none");
  viewListEl.classList.remove("d-none");
  $(".main-navbar").classList.remove("d-none");
}

function showFormView() {
  viewListEl.classList.add("d-none");
  viewFormEl.classList.remove("d-none");
  // Navbar (logo + toggle Import/Export) tidak relevan selama isi
  // form — disembunyikan total, bukan cuma toggle-nya, biar halaman
  // form lebih fokus & tidak ada elemen navigasi global yang
  // mengganggu/membingungkan di tengah proses input data.
  $(".main-navbar").classList.add("d-none");
  window.scrollTo(0, 0);
}

function goBackToList() {
  location.hash = "";
}

function router() {
  const hash = location.hash || "";
  const editMatch = hash.match(/^#\/edit\/(.+)$/);
  if (hash === "#/new") {
    renderFormPage(null);
    return;
  }
  if (editMatch) {
    const id = decodeURIComponent(editMatch[1]);
    if (!currentList().some((x) => x.id === id)) {
      const otherMode = activeMode === "import" ? "export" : "import";
      if (data[otherMode].some((x) => x.id === id)) switchMode(otherMode);
    }
    if (!currentList().some((x) => x.id === id)) {
      // Data belum termuat atau ID sudah tidak ada — kembali ke daftar
      // saja daripada menampilkan form kosong yang membingungkan.
      goBackToList();
      return;
    }
    renderFormPage(id);
    return;
  }
  showListView();
}
window.addEventListener("hashchange", router);

function renderFormPage(id) {
  const lbl = ML();
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
    $("#fActual").value = s.actual || "";
    $("#fStatus").value = s.status || "process";
    $("#fNotes").value = s.notes || "";
    $("#fIncoterm").value = s.incoterm || "FOB";
    $("#fFreight").value = s.freight || "";
    $("#fInsurance").value = s.insurance || "";
    $("#fNdpbm").value = s.ndpbm || "";
    $("#fTarif").value = s.tarif || "";
    $("#fBM").value = s.bm || "";
    $("#fPPN").value = s.ppn || "";
    $("#fPPH").value = s.pph || "";
    $("#fPI").value = s.pi || "";
    $("#fPackage").value = s.package || "";
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
      "fActual",
      "fNotes",
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
    draftItems = [newItem()];
    draftStops = [];
  }
  applyTransportLabels();
  renderItemTable();
  renderRouteStopsUI();
  showFormView();
}

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
    actual: $("#fActual").value,
    status: $("#fStatus").value,
    notes: $("#fNotes").value.trim(),
    incoterm: $("#fIncoterm").value,
    freight: excelNum($("#fFreight").value),
    insurance: excelNum($("#fInsurance").value),
    ndpbm: excelNum($("#fNdpbm").value),
    tarif: excelNum($("#fTarif").value),
    bm: excelNum($("#fBM").value),
    ppn: excelNum($("#fPPN").value),
    pph: excelNum($("#fPPH").value),
    pi: $("#fPI").value.trim(),
    package: $("#fPackage").value.trim(),
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
