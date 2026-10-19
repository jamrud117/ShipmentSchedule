"use strict";

/* DETAIL VIEW (read-only) */
function fieldPair(label, value, icon) {
  return `<div class="info-item"><div class="info-label">${icon ? `<i class="bi ${icon}"></i> ` : ""}${escapeHtml(label)}</div><div class="info-value">${value || "—"}</div></div>`;
}

// Ringkasan fasilitas 1 barang (SKB & COO, bisa banyak
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

// Cell kolom "Kemasan" di tabel Daftar Barang (detail view, read-only)
function detailPackageCellHtml(it) {
  return escapeHtml(dispVal(it.package));
}

// Daftar terminal transit (read-only) untuk detail view
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
            <i class="bi ${air ? "bi-airplane" : "bi-water"}"></i> ${escapeHtml(dispVal(carrierNameFromShipment(st)))}
            &nbsp;•&nbsp; ${tt("Tiba", "Arrives")}: <b>${fmtDate(st.arrivalDate)}</b>
            &nbsp;·&nbsp; ${tt("Berangkat", "Departs")}: <b>${fmtDate(st.departureDate)}</b>
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
  /* Buku JADWALNYA SENDIRI, bukan buku yang sedang dibuka: panel ini
     juga dibuka dari notifikasi & penanda nomor ganda, yang bisa
     menunjuk jadwal di buku lain. */
  const mode = s.mode === "export" ? "export" : s.mode === "import" ? "import" : activeMode;
  const lbl = MODE_LABELS[mode];
  const calc = computeCustoms(s);
  /* Status yang BERLAKU, dengan nama per buku (Export: Delivered), sama
     dengan dropdown di kartunya. Dulu yang tampil kolom status mentah
     dengan label tetap "ARRIVED", sehingga kartu & panel ini bisa
     menyebut dua status berbeda untuk jadwal yang sama. */
  const statusBerlaku = effectiveStatus(s);
  /* Jadwal yang pernah diubah (kotak Tanggal Update Delay): rencana
     awal di atas, jadwal BARU di bawahnya ditandai panah ke bawah --
     dibaca "berubah menjadi". Tanpa revisi: satu tanggal saja. Jam
     (kalau ada) milik tanggal yang berlaku. */
  const tanggalBerlaku = (rencana, revisi, jam) => {
    const tglJam = (tgl) => fmtDate(tgl) + (jam ? " · " + escapeHtml(jam) : "");
    if (!(revisi && rencana && revisi !== rencana)) return tglJam(revisi || rencana);
    return `<span class="tgl-rencana">${fmtDate(rencana)}</span><span class="tgl-revisi"><i class="bi bi-arrow-down" aria-hidden="true"></i><span class="visually-hidden">${escapeHtml(
      tt("diubah menjadi", "changed to"),
    )} </span>${tglJam(revisi)}</span>`;
  };

  /* Nomor dokumen + tanggalnya dalam satu isian: "DD-INV-01 · 16-09-2026". */
  const nomorTanggal = (nomor, tanggal) =>
    escapeHtml(dispVal(nomor)) + (tanggal ? ` <span class="text-muted">· ${fmtDate(tanggal)}</span>` : "");

  let itemRows = (s.items || [])
    .map(
      (it) => `
    <tr>
      <td>${escapeHtml(itemDisplayName(it))}</td>
      <td>${escapeHtml(it.hsCode || "—")}</td>
      <td>${escapeHtml(it.jenisBarang || "—")}</td>
      <td>${itemFacilitiesCellHtml(it)}</td>
      <td class="text-center">${fmtNum(it.qty)}</td>
      <td class="text-center">${escapeHtml(it.satuan || "—")}</td>
      <td class="text-center">${fmtUSD(it.harga)}</td>
      <td class="text-center">${fmtNum(it.netto)} Kg</td>
      <td class="text-center">${fmtNum(it.bruto)} Kg</td>
      <td class="text-center">${detailPackageCellHtml(it)}</td>
      ${mode === "export" ? `<td class="text-center">${computeItemCbm(it)}</td>` : ""}
      <td class="text-center">${fmtUSD((Number(it.qty) || 0) * (Number(it.harga) || 0))}</td>
    </tr>`,
    )
    .join("");

  let customsHtml = `
    <div class="subsection-title"><i class="bi bi-cash-coin"></i> ${tt("Incoterm &amp; Nilai Barang", "Incoterm &amp; Goods Value")}</div>
    <div class="info-grid">
      ${fieldPair("Incoterms", escapeHtml(s.incoterm || "—"))}
      ${fieldPair("Freight (USD)", fmtUSD(s.freight))}
      ${fieldPair("Insurance (USD)", fmtUSD(s.insurance))}
      ${fieldPair("NDPBM", fmtRp(s.ndpbm))}
      ${fieldPair(tt("Total Nilai Barang (USD)", "Total Goods Value (USD)"), fmtUSD(calc.totalUSD))}
      ${
        s.incoterm === "CIF"
          ? fieldPair("CIF (USD)", fmtUSD(calc.cifUsd)) +
            fieldPair(tt("CIF Rupiah", "CIF (IDR)"), fmtRp(calc.cifRupiah))
          : s.incoterm === "FOB"
            ? fieldPair("FOB (USD)", fmtUSD(calc.fobUsd)) +
              fieldPair(tt("FOB Rupiah", "FOB (IDR)"), fmtRp(calc.fobRupiah))
            : ""
      }
    </div>`;

  if (s.incoterm !== "CIF" && s.incoterm !== "FOB") {
    customsHtml += `<div class="form-text-note mb-2">${tt("Incoterm ini bukan CIF maupun FOB — nilai CIF, CIF Rupiah, dan FOB Rupiah otomatis 0.", "This incoterm is neither CIF nor FOB — CIF, CIF Rupiah and FOB Rupiah are 0.")}</div>`;
  }

  if (lbl.showDuty) {
    customsHtml += `
      <div class="subsection-title"><i class="bi bi-receipt"></i> ${tt("Bea &amp; Pajak Impor", "Import Duties &amp; Taxes")}</div>
      <div class="info-grid">
        ${fieldPair(tt("Tarif", "Tariff"), (Number(s.tarif) || 0) + " %")}
        ${fieldPair(tt("Bea Masuk", "Import Duty"), fmtRp(s.bm))}
        ${fieldPair("PPN", fmtRp(s.ppn))}
        ${fieldPair("PPH", fmtRp(s.pph))}
        ${fieldPair("PDRI", fmtRp(calc.bmPdri))}
        ${fieldPair(tt("PI (Persetujuan Impor)", "PI (Import Approval)"), escapeHtml(dispVal(s.pi)))}
        ${fieldPair(tt("LS (Laporan Surveyor)", "LS (Surveyor Report)"), escapeHtml(dispVal(s.ls)))}
      </div>`;
  }

  return `
    <div class="detail-header">
      <div>
        <div class="item-name">${escapeHtml(dispVal(s.party))}</div>
        <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} · ${lbl.docDate}: ${fmtDate(s.docDate)}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="detail-badge-mode">${mode === "import" ? "Import" : "Export"}</span>
        <span class="status-select ${statusClass(statusBerlaku)}" style="pointer-events:none; padding-right:14px; background-image:none;">${escapeHtml(statusLabel(statusBerlaku, s.mode).toUpperCase())}</span>
      </div>
    </div>

    <div class="subsection-title"><i class="bi bi-file-earmark-text"></i> ${tt("Dokumen &amp; Umum", "Documents &amp; General")}</div>
    <div class="info-grid">
      ${fieldPair("No. Aju", escapeHtml(dispVal(s.noAju)))}
      ${fieldPair(lbl.party, escapeHtml(dispVal(s.party)))}
      ${fieldPair("No. Invoice", nomorTanggal(s.invoice, s.invoiceDate))}
      ${fieldPair(s.transport === "udara" ? "Master AWB" : "Master B/L", nomorTanggal(s.masterBL, s.masterBLDate))}
      ${fieldPair(s.transport === "udara" ? "House AWB" : "House B/L", nomorTanggal(s.houseBL, s.houseBLDate))}
      ${
        /* Hanya Import. Di Export kolom ini tidak dipakai lagi — muatan
           dicatat lewat kolom Stuffing (s.actual), dan menampilkan
           keduanya membuat orang menebak-nebak mana yang berlaku. */
        s.mode === "export"
          ? ""
          : fieldPair(
              lbl.factoryDate,
              s.factoryDate
                ? fmtDate(s.factoryDate) +
                    (s.factoryTime ? " · " + escapeHtml(s.factoryTime) : "")
                : "—",
            )
      }
      ${fieldPair(tt("Nama Forwarder", "Forwarder Name"), escapeHtml(dispVal(s.forwarder)))}
      ${fieldPair("PIC Forwarder", escapeHtml(dispVal(s.forwarderPic)))}
    </div>

    <div class="subsection-title"><i class="bi bi-compass"></i> ${tt("Transportasi &amp; Rute", "Transport &amp; Route")}</div>
    <div class="info-grid">
      ${fieldPair(tt("Moda Transportasi", "Transport Mode"), s.transport === "udara" ? tt("Udara", "Air") : tt("Laut", "Sea"))}
      ${fieldPair(vesselNoun(s.transport) + (isTransitRoute(s) ? tt(" (Leg Terakhir)", " (Last Leg)") : ""), escapeHtml(dispVal(carrierNameFromShipment(s))))}
      ${fieldPair(tt("No. Kontainer/Seal", "Container/Seal Number"), escapeHtml(dispVal(s.container)))}
      ${fieldPair(tt("No. Kendaraan", "Vehicle No."), escapeHtml(dispVal(s.vehicleNo)))}
      ${fieldPair(tt("Jenis Muatan", "Load Type"), escapeHtml(s.muatan || "—"))}
      ${fieldPair(tt("Tipe Rute", "Route Type"), isTransitRoute(s) ? tt(`Transit (${routeStopList(s).length} Terminal Singgah)`, `Transit (${routeStopList(s).length} stopover terminal${routeStopList(s).length === 1 ? "" : "s"})`) : "Direct")}
      ${fieldPair(portNoun("origin", s.transport, mode), escapeHtml(dispVal(portCodeLabel(s.origin))))}
      ${fieldPair(portNoun("destination", s.transport, mode), escapeHtml(dispVal(portCodeLabel(s.destination))))}
      ${fieldPair("ETD", tanggalBerlaku(s.etd, s.etdUpdate, s.etdTime))}
      ${fieldPair("ETA", tanggalBerlaku(s.eta, s.etaUpdate, s.etaTime))}
      ${fieldPair(lbl.actual, fmtDate(s.actual))}
    </div>
    ${buildDetailStopsHtml(s)}
    ${predictionDetailHtml(s)}
    ${(() => {
      const log = normalizeNotesLog(s.notesLog, s.notes);
      if (!log.length) return "";
      return `<div class="detail-notes mb-3">
        <div class="detail-notes-head"><i class="bi bi-chat-left-text"></i> ${tt("Kronologi & Catatan", "Timeline & Notes")} (${log.length})</div>
        ${[...log]
          .reverse()
          .map(
            (e) =>
              `<div class="card-note"><div class="card-note-stamp">${escapeHtml(fmtNoteStamp(e.ts))}</div><div class="card-note-text">${escapeHtml(e.text)}</div></div>`,
          )
          .join("")}
      </div>`;
    })()}

    <div class="subsection-title"><i class="bi bi-boxes"></i> ${tt("Daftar Barang", "Item List")}</div>
    <div class="item-table-wrap mb-2">
      <table class="item-table item-table--detail">
        <thead><tr>
          <th>${tt("Nama Barang", "Item Name")}</th><th>HS Code</th><th>${tt("Jenis Barang", "Goods Type")}</th><th>${tt("Fasilitas", "Facility")}</th>
          <th class="text-center">Qty</th><th class="text-center">${tt("Satuan", "Unit")}</th><th class="text-center">${tt("Harga/Unit", "Unit Price")}</th>
          <th class="text-center">${tt("Netto", "Net Wt.")}</th><th class="text-center">${tt("Bruto", "Gross Wt.")}</th><th class="text-center">${tt("Kemasan", "Packaging")}</th>${mode === "export" ? `<th class="text-center">CBM (m³)</th>` : ""}<th class="text-center">Subtotal</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="item-table-foot item-table-foot--split mb-3">
      <div class="foot-package">${hasMeaningfulValue(s.package) ? `<i class="bi bi-box-seam"></i> Total Package: <b>${escapeHtml(s.package)}</b>` : ""}</div>
      <div class="foot-totals">
        <div>Total Qty: <b>${escapeHtml(fmtQtyBySatuan(calc.qtyBySatuan))}</b></div>
        <div>${t("f.total.netto")}: <b>${fmtNum(calc.totalNetto)}</b> Kg</div>
        <div>${t("f.total.bruto")}: <b>${fmtNum(calc.totalBruto)}</b> Kg</div>
        <div>${tt("Total Nilai", "Total Value")}: <b>${fmtUSD(calc.totalUSD)}</b></div>
        ${mode === "export" ? `<div>Total CBM: <b>${fmtNum(calc.totalCbm)}</b> m³</div>` : ""}
      </div>
    </div>

    ${customsHtml}
    ${typeof biayaKirimanKerangka === "function" ? biayaKirimanKerangka(s) : ""}
  `;
}

/* PANEL GESER — pengendali */
const detailScrimEl = $("#detailScrim");
const detailSheetEl = $("#detailSheet");

// Urutan telusur = urutan yang BENAR-BENAR tampil di daftar (sudah disaring
function detailNavList() {
  return orderedFiltered();
}

/* Jadwal dengan id ini dari buku MANA PUN -- notifikasi & penanda nomor
   ganda bisa menunjuk jadwal di buku yang sedang tidak dibuka. */
function kirimanDenganId(id) {
  const cari = (arr) => (arr || []).find((x) => String(x.id) === String(id));
  return cari(currentList()) || (typeof data !== "undefined" && data ? cari(data.import) || cari(data.export) : null) || null;
}

/* Tombol yang membuka panel (mata di kartu, notifikasi, palet): fokus
   kembali ke sana saat panel ditutup -- bukan ke awal halaman. Dicatat
   hanya saat panel BARU dibuka, bukan saat berpindah kiriman di dalamnya. */
let detailPemicu = null;
function openDetailView(id) {
  const s = kirimanDenganId(id);
  if (!s) return;
  const aktif = document.activeElement;
  if (!isDetailOpen() && aktif && aktif !== document.body && !detailSheetEl.contains(aktif))
    detailPemicu = { el: aktif, kunci: kunciFokus(aktif) };
  currentDetailId = id;

  $("#detailViewBody").innerHTML = buildDetailHtml(s);
  // Biaya per kiriman dari Pengajuan Dana -- dimuat menyusul (database)
  if (typeof isiBiayaKiriman === "function") isiBiayaKiriman(s);
  $("#detailSheetTitle").textContent = dispVal(s.party);

  const list = detailNavList();
  const idx = list.findIndex((x) => x.id === id);
  $("#detailSheetPos").textContent =
    idx >= 0 ? `${idx + 1} / ${list.length}` : "";
  $("#btnDetailPrev").disabled = idx <= 0;
  $("#btnDetailNext").disabled = idx < 0 || idx >= list.length - 1;

  detailScrimEl.hidden = false;
  detailSheetEl.hidden = false;
  // Dua putaran gambar dipisah supaya transisi CSS-nya benar-benar berjalan
  requestAnimationFrame(() => {
    detailScrimEl.classList.add("is-open");
    detailSheetEl.classList.add("is-open");
  });
  $("#btnDetailClose").focus();
}

function closeDetailView() {
  detailScrimEl.classList.remove("is-open");
  detailSheetEl.classList.remove("is-open");
  const asal = detailPemicu;
  detailPemicu = null;
  if (asal) {
    const el = asal.el.isConnected ? asal.el : asal.kunci ? document.querySelector(asal.kunci) : null;
    if (el && tampilDiLayar(el)) fokuskan(el, { tanpaGulir: true });
  }
  const sembunyikan = () => {
    detailScrimEl.hidden = true;
    detailSheetEl.hidden = true;
  };
  // Tunggu transisinya selesai dulu
  setTimeout(sembunyikan, 300);
  currentDetailId = null;
}

function stepDetailView(delta) {
  const list = detailNavList();
  const idx = list.findIndex((x) => x.id === currentDetailId);
  // Dibuka dari luar daftar (notifikasi, buku lain): tidak ada urutan telusur
  if (idx < 0) return;
  const next = list[idx + delta];
  if (next) openDetailView(next.id);
}

function isDetailOpen() {
  return detailSheetEl && detailSheetEl.classList.contains("is-open");
}

$("#btnDetailClose").addEventListener("click", closeDetailView);
$("#btnDetailCloseFoot").addEventListener("click", closeDetailView);
detailScrimEl.addEventListener("click", closeDetailView);
$("#btnDetailPrev").addEventListener("click", () => stepDetailView(-1));
$("#btnDetailNext").addEventListener("click", () => stepDetailView(1));

document.addEventListener("keydown", (e) => {
  if (!isDetailOpen()) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeDetailView();
  } else if (e.key === "ArrowLeft") {
    stepDetailView(-1);
  } else if (e.key === "ArrowRight") {
    stepDetailView(1);
  }
});

$("#btnGotoEdit").addEventListener("click", () => {
  const id = currentDetailId;
  closeDetailView();
  location.hash = "#/edit/" + encodeURIComponent(id);
});
