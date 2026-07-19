"use strict";

/* ==================================================================
   DETAIL VIEW (read-only)
================================================================== */
function fieldPair(label, value, icon) {
  return `<div class="info-item"><div class="info-label">${icon ? `<i class="bi ${icon}"></i> ` : ""}${escapeHtml(label)}</div><div class="info-value">${value || "—"}</div></div>`;
}

// Ringkasan fasilitas 1 barang (SKB & E-COO, bisa banyak, 1 array yang
// sama) untuk kolom "Fasilitas" pada tabel Daftar Barang di detail
// view (read-only). E-COO tetap dapat ikon beda (patch-check) biar
// gampang dibedakan sekilas dari SKB biasa (shield-check).
function itemFacilitiesCellHtml(it) {
  const lines = (it.skb || []).map((sk) => {
    const isEcoo = sk.jenis === "E-COO";
    const bits = [skbEntryLabel(sk)];
    if (hasMeaningfulValue(sk.nomor)) bits.push(sk.nomor);
    if (sk.tanggal) bits.push(fmtDate(sk.tanggal));
    const icon = isEcoo ? "bi-patch-check-fill" : "bi-shield-check";
    return `<div class="detail-fac-line"><i class="bi ${icon}"></i> ${escapeHtml(bits.join(" · "))}</div>`;
  });
  return lines.join("") || `<span class="text-muted">—</span>`;
}

// Daftar terminal transit (read-only) untuk detail view. Kosong sama
// sekali kalau route_type = "direct" (tidak ada perubahan tampilan).
function buildDetailStopsHtml(s) {
  const stops = routeStopList(s);
  if (!isTransitRoute(s)) return "";
  const rows = stops
    .map((st, i) => {
      const air = st.transport === "udara";
      return `
      <div class="detail-stop-row">
        <span class="detail-stop-badge">${i + 1}</span>
        <div class="detail-stop-body">
          <div class="detail-stop-name">${escapeHtml(dispVal(st.terminal))}</div>
          <div class="detail-stop-meta">
            <i class="bi ${air ? "bi-airplane" : "bi-water"}"></i> ${escapeHtml(dispVal(st.vessel))}
            ${hasMeaningfulValue(st.voyage) ? " · " + (air ? "No. Flight " : "No. Voyage ") + escapeHtml(st.voyage) : ""}
            &nbsp;•&nbsp; Tiba: <b>${fmtDate(st.arrivalDate)}</b>
            &nbsp;·&nbsp; Berangkat: <b>${fmtDate(st.departureDate)}</b>
          </div>
        </div>
      </div>`;
    })
    .join("");
  return `
    <div class="subsection-title mt-2"><i class="bi bi-signpost-split"></i> Terminal Transit</div>
    <div class="detail-stop-list mb-2">${rows}</div>`;
}

function buildDetailHtml(s) {
  const lbl = ML();
  const calc = computeCustoms(s);
  const meta = STATUS_META[s.status] || STATUS_META.process;

  let itemRows = (s.items || [])
    .map(
      (it) => `
    <tr>
      <td>${escapeHtml(it.namaBarang)}</td>
      <td>${escapeHtml(it.hsCode || "—")}</td>
      <td>${escapeHtml(it.jenisBarang || "—")}</td>
      <td>${itemFacilitiesCellHtml(it)}</td>
      <td class="text-center">${fmtNum(it.qty)}</td>
      <td class="text-center">${escapeHtml(it.satuan || "—")}</td>
      <td class="text-center">${fmtUSD(it.harga)}</td>
      <td class="text-center">${fmtNum(it.netto)} Kg</td>
      <td class="text-center">${fmtNum(it.bruto)} Kg</td>
      <td class="text-center">${fmtUSD((Number(it.qty) || 0) * (Number(it.harga) || 0))}</td>
    </tr>`,
    )
    .join("");

  let customsHtml = `
    <div class="subsection-title"><i class="bi bi-cash-coin"></i> Incoterm &amp; Nilai Barang</div>
    <div class="info-grid">
      ${fieldPair("Incoterms", escapeHtml(s.incoterm || "—"))}
      ${fieldPair("Freight (USD)", fmtUSD(s.freight))}
      ${fieldPair("Insurance (USD)", fmtUSD(s.insurance))}
      ${fieldPair("NDPBM", fmtRp(s.ndpbm))}
      ${fieldPair("Total Nilai Barang (USD)", fmtUSD(calc.totalUSD))}
      ${
        s.incoterm === "CIF"
          ? fieldPair("CIF (USD)", fmtUSD(calc.cifUsd)) +
            fieldPair("CIF Rupiah", fmtRp(calc.cifRupiah))
          : s.incoterm === "FOB"
            ? fieldPair("FOB (USD)", fmtUSD(calc.fobUsd)) +
              fieldPair("FOB Rupiah", fmtRp(calc.fobRupiah))
            : ""
      }
    </div>`;

  if (s.incoterm !== "CIF" && s.incoterm !== "FOB") {
    customsHtml += `<div class="form-text-note mb-2">Incoterm ini bukan CIF maupun FOB — nilai CIF, CIF Rupiah, dan FOB Rupiah otomatis 0.</div>`;
  }

  if (lbl.showDuty) {
    customsHtml += `
      <div class="subsection-title"><i class="bi bi-receipt"></i> Bea &amp; Pajak Impor</div>
      <div class="info-grid">
        ${fieldPair("Tarif", (Number(s.tarif) || 0) + " %")}
        ${fieldPair("Bea Masuk", fmtRp(s.bm))}
        ${fieldPair("PPN", fmtRp(s.ppn))}
        ${fieldPair("PPH", fmtRp(s.pph))}
        ${fieldPair("BM + PDRI", fmtRp(calc.bmPdri))}
        ${fieldPair("Keterangan PI", escapeHtml(dispVal(s.pi)))}
      </div>`;
  }

  return `
    <div class="detail-header">
      <div>
        <div class="item-name">${escapeHtml(dispVal(s.party))}</div>
        <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} · ${lbl.docDate}: ${fmtDate(s.docDate)}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="detail-badge-mode">${activeMode === "import" ? "Import" : "Export"}</span>
        <span class="status-select ${meta.class}" style="pointer-events:none; padding-right:14px; background-image:none;">${meta.label}</span>
      </div>
    </div>

    <div class="subsection-title"><i class="bi bi-file-earmark-text"></i> Dokumen &amp; Umum</div>
    <div class="info-grid">
      ${fieldPair("No. Aju", escapeHtml(dispVal(s.noAju)))}
      ${fieldPair(lbl.party, escapeHtml(dispVal(s.party)))}
      ${fieldPair("No. Invoice", escapeHtml(dispVal(s.invoice)))}
      ${fieldPair(s.transport === "udara" ? "Master AWB" : "Master B/L", escapeHtml(dispVal(s.masterBL)))}
      ${fieldPair(s.transport === "udara" ? "House AWB" : "House B/L", escapeHtml(dispVal(s.houseBL)))}
      ${fieldPair(lbl.factoryDate, s.factoryDate ? fmtDate(s.factoryDate) + (s.factoryTime ? " · " + escapeHtml(s.factoryTime) : "") : "—")}
      ${fieldPair("Nama Forwarder", escapeHtml(dispVal(s.forwarder)))}
      ${fieldPair("PIC Forwarder", escapeHtml(dispVal(s.forwarderPic)))}
    </div>

    <div class="subsection-title"><i class="bi bi-compass"></i> Transportasi &amp; Rute</div>
    <div class="info-grid">
      ${fieldPair("Moda Transportasi", s.transport === "udara" ? "Udara" : "Laut")}
      ${fieldPair(s.transport === "udara" ? (isTransitRoute(s) ? "Maskapai (Leg Terakhir)" : "Maskapai / Pesawat") : isTransitRoute(s) ? "Vessel (Leg Terakhir)" : "Vessel", escapeHtml(dispVal(s.vessel)))}
      ${fieldPair(s.transport === "udara" ? "No. Flight" : "No. Voyage", escapeHtml(dispVal(s.voyage)))}
      ${fieldPair("Kontainer", escapeHtml(dispVal(s.container)))}
      ${fieldPair("Jenis Muatan", escapeHtml(s.muatan || "—"))}
      ${fieldPair("Tipe Rute", isTransitRoute(s) ? `Transit (${routeStopList(s).length} Terminal Singgah)` : "Direct")}
      ${fieldPair(lbl.origin, escapeHtml(dispVal(s.origin)))}
      ${fieldPair(lbl.destination, escapeHtml(dispVal(s.destination)))}
      ${fieldPair("ETD", fmtDate(s.etd))}
      ${fieldPair("ETA", fmtDate(s.eta))}
      ${fieldPair(lbl.actual, fmtDate(s.actual))}
    </div>
    ${buildDetailStopsHtml(s)}
    ${hasMeaningfulValue(s.notes) ? `<div class="form-text-note mb-3"><i class="bi bi-sticky"></i> Catatan: ${escapeHtml(s.notes)}</div>` : ""}

    <div class="subsection-title"><i class="bi bi-boxes"></i> Daftar Barang</div>
    <div class="item-table-wrap mb-2">
      <table class="item-table">
        <thead><tr>
          <th>Nama Barang</th><th>HS Code</th><th>Jenis Barang</th><th>Fasilitas</th>
          <th class="text-center">Qty</th><th class="text-center">Satuan</th><th class="text-center">Harga/Unit</th>
          <th class="text-center">Netto</th><th class="text-center">Bruto</th><th class="text-center">Subtotal</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="item-table-foot item-table-foot--split mb-3">
      <div class="foot-package">${hasMeaningfulValue(s.package) ? `<i class="bi bi-box-seam"></i> Package: <b>${escapeHtml(s.package)}</b>` : ""}</div>
      <div class="foot-totals">
        <div>Total Qty: <b>${fmtNum(calc.totalQty)}</b></div>
        <div>Total Netto: <b>${fmtNum(calc.totalNetto)}</b> Kg</div>
        <div>Total Bruto: <b>${fmtNum(calc.totalBruto)}</b> Kg</div>
        <div>Total Nilai: <b>${fmtUSD(calc.totalUSD)}</b></div>
      </div>
    </div>

    ${customsHtml}
  `;
}

function openDetailView(id) {
  const s = currentList().find((x) => x.id === id);
  if (!s) return;
  currentDetailId = id;
  $("#detailViewBody").innerHTML = buildDetailHtml(s);
  detailViewModal.show();
}

$("#btnGotoEdit").addEventListener("click", () => {
  const id = currentDetailId;
  detailViewModal.hide();
  location.hash = "#/edit/" + encodeURIComponent(id);
});
