"use strict";

/* TERAPKAN HASIL PARSE KE FORM */

const IMPORT_SOURCE_PRIORITY = {
  "pdf": 30, // PIB BC 2.0
  "pdf-peb": 30, // PEB BC 3.0
  "excel-bc": 20, // draft CEISA (HEADER/BARANG/ENTITAS/DOKUMEN)
  "cipl": 10, // CIPL Excel
  "cipl-pdf": 10, // CIPL PDF (CI+PL 1 file)
  "cipl-pdf-ci": 10,
  "cipl-pdf-pl": 10,
};

let importFieldOrigin = {};

function resetImportFieldOrigins() {
  importFieldOrigin = {};
}

function sourcePriority(source) {
  return IMPORT_SOURCE_PRIORITY[source] != null
    ? IMPORT_SOURCE_PRIORITY[source]
    : 15;
}

// Field mana yang BOLEH diisi oleh sumber ini
const CIPL_BLOCKED_FIELDS = new Set([
  "fEtd",
  "fEta",
  "fActual",
  "fDocDate",
  "fDocNo",
  "fMasterBL",
  "fHouseBL",
  "fNoAju",
]);

function isCiplSource(source) {
  return /^cipl/.test(source || "");
}

// Satu-satunya pintu penulisan field form dari hasil import.
function setImportField(id, value, source, opts) {
  if (value === "" || value == null) return false;
  if (isCiplSource(source) && CIPL_BLOCKED_FIELDS.has(id)) return false;

  const el = $("#" + id);
  if (!el) return false;

  const current = String(el.value || "").trim();
  const prio = sourcePriority(source);
  const prevPrio = importFieldOrigin[id];

  if (current !== "" && prevPrio != null && prio < prevPrio) return false;
  // Field terisi yang BELUM pernah disentuh import
  if (current !== "" && prevPrio == null && !(opts && opts.force)) return false;

  // Kotak angka ditulis dalam bentuk BERFORMAT (mis
  el.value = el.hasAttribute("data-num") ? formatNumberValue(value) : value;
  importFieldOrigin[id] = prio;
  return true;
}

function setImportSelect(id, value, source, notes, labelForNote) {
  if (!value) return false;
  const el = $("#" + id);
  if (!el) return false;
  const hasOpt = Array.from(el.options).some((o) => o.value === value);
  if (!hasOpt) {
    if (notes)
      notes.push(
        `${labelForNote || id} "${value}" dari file tidak ada di pilihan dropdown — pilih manual.`,
      );
    return false;
  }
  const prio = sourcePriority(source);
  const prevPrio = importFieldOrigin[id];
  if (prevPrio != null && prio < prevPrio) return false;
  el.value = value;
  importFieldOrigin[id] = prio;
  return true;
}

/* Nama Shipper / Buyer: dokumen memuat DUA pihak sekaligus, dan mana */
function resolvePartyForActiveMode(f) {
  if (f.seller || f.consignee) {
    return pickCiplParty(f.seller, f.consignee, activeMode);
  }
  return f.party || "";
}

function applyImportedBcData(parsed) {
  const f = parsed.fields || {};
  const notes = (parsed.notes || []).slice();
  const src = parsed.source;
  let filled = 0;
  const put = (id, val, opts) => {
    if (setImportField(id, val, src, opts)) filled++;
  };

  put("fNoAju", f.noAju);
  put("fDocNo", f.docNo);
  put("fDocDate", f.docDate);
  put("fParty", resolvePartyForActiveMode(f));
  put("fInvoice", f.invoice);
  put("fMasterBL", f.masterBL);
  put("fHouseBL", f.houseBL);
  put("fForwarder", f.forwarder);
  put("fVessel", f.vessel);
  put("fVoyage", f.voyage);
  put("fContainer", f.container);
  put("fOrigin", f.origin);
  put("fDestination", f.destination);
  put("fEtd", f.etd);
  put("fEta", f.eta);
  put("fActual", f.actual);
  if (f.package) {
    // Dari file, Total Package datang sbg satu teks ("2 PACKAGE")
    const before = $("#fPackage").value.trim();
    if (put("fPackage", f.package)) {
      setPackageFields(f.package);
    } else if (!before) {
      setPackageFields(f.package);
    }
  }

  ["freight", "insurance", "ndpbm", "bm", "ppn", "pph", "tarif"].forEach(
    (key) => {
      const id =
        "f" +
        (key === "bm"
          ? "BM"
          : key === "ppn"
            ? "PPN"
            : key === "pph"
              ? "PPH"
              : key === "ndpbm"
                ? "Ndpbm"
                : key.charAt(0).toUpperCase() + key.slice(1));
      if (f[key] != null && f[key] !== "") put(id, f[key]);
    },
  );

  if (f.transport) {
    if (setImportSelect("fTransport", f.transport, src)) filled++;
  }
  if (f.muatan) {
    if (setImportSelect("fMuatan", f.muatan, src)) filled++;
  }
  if (f.incoterm) {
    if (setImportSelect("fIncoterm", f.incoterm, src, notes, "Kode incoterm"))
      filled++;
  }

  /* ---- daftar barang ---- */
  if (parsed.items && parsed.items.length) {
    // HS Code disimpan sebagai DIGIT saja (requirement A)
    const cleaned = parsed.items.map((it) => ({
      ...it,
      hsCode: normalizeHsCodeInput(it.hsCode),
    }));
    // Barang dari sumber berprioritas LEBIH RENDAH tidak menimpa daftar barang yang sudah terisi
    const prevPrio = importFieldOrigin.__items;
    const prio = sourcePriority(src);
    const hasRealItems = draftItems.some(
      (it) => (it.namaBarang || "").trim() !== "",
    );
    if (!hasRealItems || prevPrio == null || prio >= prevPrio) {
      draftItems = cleaned;
      importFieldOrigin.__items = prio;
    } else {
      notes.push(
        `Daftar barang dari file ini TIDAK diterapkan karena tab Daftar Barang sudah terisi dari dokumen yang lebih resmi. Hapus dulu barangnya kalau memang mau diganti.`,
      );
    }
  }

  if (parsed.modeHint && parsed.modeHint !== activeMode) {
    notes.push(
      `File ini sepertinya dokumen ${parsed.modeHint === "import" ? "IMPORT" : "EXPORT"}, tapi form yang terbuka sekarang mode ${activeMode === "import" ? "IMPORT" : "EXPORT"} — cek lagi sebelum simpan.`,
    );
  }

  applyTransportLabels();
  renderItemTable();

  const items = parsed.items || [];
  const facParts = [];
  const skbCount = items.reduce(
    (n, it) => n + (it.skb || []).filter((sk) => sk.jenis !== "E-COO").length,
    0,
  );
  if (skbCount) facParts.push(`${skbCount} SKB`);
  if (items.some((it) => (it.skb || []).some((sk) => sk.jenis === "E-COO")))
    facParts.push("E-COO");
  const facSuffix = facParts.length ? ` (termasuk ${facParts.join(" & ")})` : "";
  const sourceLabel = /pdf/i.test(src || "") ? "PDF" : "Excel";
  const docLabel =
    src === "pdf"
      ? "PIB"
      : src === "pdf-peb"
        ? "PEB"
        : isCiplSource(src)
          ? "CIPL"
          : "BC";
  const summary = `${filled} field & ${items.length} barang terisi otomatis dari file ${docLabel} (${sourceLabel})${facSuffix}.`;
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
