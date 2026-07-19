"use strict";

function setFieldIfPresent(id, value) {
  if (value !== "" && value != null) {
    $("#" + id).value = value;
    return true;
  }
  return false;
}

function applyImportedBcData(parsed) {
  const f = parsed.fields;
  const notes = parsed.notes.slice();
  let filled = 0;
  const mark = (ok) => {
    if (ok) filled++;
    return ok;
  };

  mark(setFieldIfPresent("fNoAju", f.noAju));
  mark(setFieldIfPresent("fDocNo", f.docNo));
  mark(setFieldIfPresent("fDocDate", f.docDate));
  mark(setFieldIfPresent("fParty", f.party));
  mark(setFieldIfPresent("fInvoice", f.invoice));
  mark(setFieldIfPresent("fMasterBL", f.masterBL));
  mark(setFieldIfPresent("fHouseBL", f.houseBL));
  mark(setFieldIfPresent("fVessel", f.vessel));
  mark(setFieldIfPresent("fVoyage", f.voyage));
  mark(setFieldIfPresent("fContainer", f.container));
  mark(setFieldIfPresent("fOrigin", f.origin));
  mark(setFieldIfPresent("fDestination", f.destination));
  mark(setFieldIfPresent("fActual", f.actual));
  mark(setFieldIfPresent("fEtd", f.etd));
  mark(setFieldIfPresent("fPackage", f.package));

  if (f.freight != null) {
    $("#fFreight").value = f.freight;
    filled++;
  }
  if (f.insurance != null) {
    $("#fInsurance").value = f.insurance;
    filled++;
  }
  if (f.ndpbm != null) {
    $("#fNdpbm").value = f.ndpbm;
    filled++;
  }
  if (f.bm != null) {
    $("#fBM").value = f.bm;
    filled++;
  }
  if (f.ppn != null) {
    $("#fPPN").value = f.ppn;
    filled++;
  }
  if (f.pph != null) {
    $("#fPPH").value = f.pph;
    filled++;
  }

  if (f.transport) {
    $("#fTransport").value = f.transport;
    filled++;
  }

  if (f.incoterm) {
    const hasOpt = Array.from($("#fIncoterm").options).some(
      (o) => o.value === f.incoterm,
    );
    if (hasOpt) {
      $("#fIncoterm").value = f.incoterm;
      filled++;
    } else
      notes.push(
        `Kode incoterm "${f.incoterm}" dari file tidak ada di pilihan dropdown — pilih manual.`,
      );
  }

  if (parsed.items.length) {
    draftItems = parsed.items;
  }

  if (parsed.modeHint && parsed.modeHint !== activeMode) {
    notes.push(
      `File ini sepertinya dokumen ${parsed.modeHint === "import" ? "IMPORT" : "EXPORT"}, tapi form yang terbuka sekarang mode ${activeMode === "import" ? "IMPORT" : "EXPORT"} — cek lagi sebelum simpan.`,
    );
  }

  applyTransportLabels();
  renderItemTable();

  const facParts = [];
  const skbCount = parsed.items.reduce(
    (n, it) => n + (it.skb || []).filter((sk) => sk.jenis !== "E-COO").length,
    0,
  );
  if (skbCount) facParts.push(`${skbCount} SKB`);
  if (
    parsed.items.some((it) => (it.skb || []).some((sk) => sk.jenis === "E-COO"))
  )
    facParts.push("E-COO");
  const facSuffix = facParts.length
    ? ` (termasuk ${facParts.join(" & ")})`
    : "";
  const sourceLabel = /pdf/i.test(parsed.source || "") ? "PDF" : "Excel";
  const summary = `${filled} field & ${parsed.items.length} barang terisi otomatis dari file ${sourceLabel}${facSuffix}.`;
  return { summary, notes };
}

function showImportNotes(summary, notes) {
  const box = $("#importNotesBox");
  const summaryEl = $("#importNotesSummary");
  const list = $("#importNotesList");
  if (!summary && !notes.length) {
    box.classList.add("d-none");
    summaryEl.innerHTML = "";
    list.innerHTML = "";
    return;
  }
  summaryEl.innerHTML = summary
    ? `<i class="bi bi-check-circle-fill"></i> ${escapeHtml(summary)}`
    : "";
  list.innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  box.classList.remove("d-none");
}

$("#btnImportExcel").addEventListener("click", () => {
  $("#fileImportExcel").value = "";
  $("#fileImportExcel").click();
});
