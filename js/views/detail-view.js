"use strict";

/* DETAIL VIEW (read-only)

   Tiap bagian = daftar label-nilai dalam satu kotak, dua lajur (satu
   lajur di panel sempit): label di kiri, nilainya rata kanan di baris
   yang sama. Nilai yang tidak muat di samping labelnya turun UTUH ke
   baris sendiri -- tidak dipotong di tengah nomor / tanggal
   (.detail-kv, panel.css). */
function detailBaris(label, nilai) {
  return `<div class="detail-kv-baris"><dt>${escapeHtml(label)}</dt><dd>${nilai || "—"}</dd></div>`;
}
// satuLajur: daftar dokumen -- satu baris selebar kotak per dokumen
const detailDaftar = (baris, satuLajur) => `<dl class="detail-kv${satuLajur ? " detail-kv--satu" : ""}">${baris.filter(Boolean).join("")}</dl>`;

// Ringkasan fasilitas 1 barang: PI barang ini (buku Import), lalu SKB & COO (bisa banyak)
function itemFacilitiesCellHtml(it, mode) {
  const pi = mode !== "export" && String(it.piNomor || "").trim()
    ? `<div class="detail-fac-line"><i class="bi bi-file-earmark-check"></i> ${escapeHtml(["PI", it.piNomor.trim(), it.piNoItem ? tt(`No. item ${it.piNoItem}`, `Item no. ${it.piNoItem}`) : ""].filter(Boolean).join(" · "))}</div>`
    : "";
  const lines = (it.skb || []).map((sk) => {
    const isEcoo = sk.jenis === "E-COO";
    const bits = [skbEntryLabel(sk)];
    if (hasMeaningfulValue(sk.nomor)) bits.push(sk.nomor);
    if (sk.tanggal) bits.push(fmtDate(sk.tanggal));
    const icon = isEcoo ? "bi-patch-check-fill" : "bi-shield-check";
    return `<div class="detail-fac-line"><i class="bi ${icon}"></i> ${escapeHtml(bits.join(" · "))}</div>`;
  });
  return pi + lines.join("") || `<span class="text-muted">—</span>`;
}

/* Satu dokumen "nomor · tanggal" (+ lampirannya, PI & LS bisa langsung
   dibuka); beberapa dokumen sejenis (PI, LS, Polis) satu baris masing-
   masing. */
const dokumenHtml = (d) =>
  `<div>${escapeHtml(dispVal(d.nomor))}${d.tanggal ? ` <span class="text-muted text-nowrap">· ${fmtDate(d.tanggal)}</span>` : ""}${tautanLampiranHtml(d.berkas)}</div>`;
const daftarDokumenHtml = (daftar) => (daftar || []).map(dokumenHtml).join("") || "—";

/* PROGRES DOKUMEN, HANYA BACA. Stepper di kartu disembunyikan dari akun
   yang tidak boleh mengubah (doc-steps.js) -- di panel ini semua akun
   bisa membaca tahap yang sudah dicatat, statusnya (draft menunggu asli
   / asli / tidak dipakai) dan membuka lampirannya. */
function detailProgresDokumenHtml(s) {
  if (typeof docStepsFor !== "function" || isKurirNilaiRendah(s)) return "";
  const baris = docStepsFor(s)
    .map((st) => ({ st, e: docStepEntri(s, st) }))
    .filter((x) => x.e && !x.e.ikutInduk)
    .map(({ st, e }) => {
      const status = e.skipped
        ? `<span class="text-muted">${escapeHtml(tt("tidak dipakai", "not used"))}</span>`
        : e.draft
          ? `<span class="detail-draft"><i class="bi bi-hourglass-split"></i> ${escapeHtml(tt("draft, menunggu asli", "draft, awaiting original"))}</span>`
          : "";
      const tgl = e.date && !e.skipped ? `<span class="text-nowrap">${fmtDate(e.date)}</span>` : "";
      const draftLama = e.tglDraft ? ` <span class="text-muted text-nowrap">(draft ${fmtDate(e.tglDraft)})</span>` : "";
      const jalur = e.jalur && jalurInfo(e.jalur) ? ` <span class="text-muted">· ${escapeHtml(tt("jalur", "lane"))} ${escapeHtml(jalurInfo(e.jalur).label)}</span>` : "";
      return `<div class="detail-progres-baris"><b>${escapeHtml(stepText(st.label, s))}</b> ${[tgl + draftLama + jalur, status].filter(Boolean).join(" · ")}${tautanLampiranHtml(e.berkas)}</div>`;
    });
  if (!baris.length) return "";
  const c = docStepCount(s);
  return `
    <div class="subsection-title"><i class="bi bi-files"></i> ${tt("Progres Dokumen", "Document Progress")} <span class="text-muted fw-normal">${c.selesai}/${c.berlaku}</span></div>
    <div class="detail-progres mb-3">${baris.join("")}</div>`;
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
  const dok = dokPelengkapJadwal(s);
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

  /* Nomor dokumen + tanggalnya dalam satu isian: "DD-INV-01 · 16-09-2026".
     Tanggalnya tidak terpotong di tanda pisah: pindah baris utuh. */
  const nomorTanggal = (nomor, tanggal) =>
    escapeHtml(dispVal(nomor)) + (tanggal ? ` <span class="text-muted text-nowrap">· ${fmtDate(tanggal)}</span>` : "");

  /* Kolom Daftar Barang: judulnya dipakai <th> sekaligus label tiap sel
     (data-label) saat panelnya sempit dan tiap barang jadi kartu. */
  const kolomBarang = [
    { judul: tt("Nama Barang", "Item Name"), kelas: "db-nama", isi: (it) => escapeHtml(itemDisplayName(it)) },
    { judul: "HS Code", isi: (it) => escapeHtml(it.hsCode || "—") },
    { judul: tt("Jenis Barang", "Goods Type"), isi: (it) => escapeHtml(it.jenisBarang || "—") },
    { judul: tt("Fasilitas", "Facility"), kelas: "db-fasilitas", isi: (it) => itemFacilitiesCellHtml(it, mode) },
    { judul: "Qty", isi: (it) => fmtNum(it.qty) },
    { judul: tt("Satuan", "Unit"), isi: (it) => escapeHtml(it.satuan || "—") },
    { judul: tt("Harga/Unit", "Unit Price"), isi: (it) => fmtUSD(it.harga) },
    { judul: tt("Netto", "Net Wt."), isi: (it) => `${fmtNum(it.netto)} Kg` },
    { judul: tt("Bruto", "Gross Wt."), isi: (it) => `${fmtNum(it.bruto)} Kg` },
    { judul: tt("Kemasan", "Packaging"), isi: (it) => escapeHtml(dispVal(it.package)) },
    mode === "export" && { judul: "CBM (m³)", isi: (it) => computeItemCbm(it) },
    { judul: "Subtotal", kelas: "db-subtotal", isi: (it) => fmtUSD((Number(it.qty) || 0) * (Number(it.harga) || 0)) },
  ].filter(Boolean);
  const kelasKolom = (k) => (k.kelas ? ` class="${k.kelas}"` : "");
  const itemRows = (s.items || [])
    .map((it) => `<tr>${kolomBarang.map((k) => `<td${kelasKolom(k)} data-label="${escapeAttr(k.judul)}">${k.isi(it)}</td>`).join("")}</tr>`)
    .join("");

  const cif = s.incoterm === "CIF";
  const fob = s.incoterm === "FOB";
  let customsHtml = `
    <div class="subsection-title"><i class="bi bi-cash-coin"></i> ${tt("Incoterm &amp; Nilai Barang", "Incoterm &amp; Goods Value")}</div>
    ${detailDaftar([
      detailBaris("Incoterms", escapeHtml(s.incoterm || "—")),
      detailBaris("Freight (USD)", fmtUSD(s.freight)),
      detailBaris("Insurance (USD)", fmtUSD(s.insurance)),
      detailBaris("NDPBM", fmtRp(s.ndpbm)),
      detailBaris(tt("Total Nilai Barang (USD)", "Total Goods Value (USD)"), fmtUSD(calc.totalUSD)),
      cif && detailBaris("CIF (USD)", fmtUSD(calc.cifUsd)),
      cif && detailBaris(tt("CIF Rupiah", "CIF (IDR)"), fmtRp(calc.cifRupiah)),
      fob && detailBaris("FOB (USD)", fmtUSD(calc.fobUsd)),
      fob && detailBaris(tt("FOB Rupiah", "FOB (IDR)"), fmtRp(calc.fobRupiah)),
    ])}`;

  if (!cif && !fob) {
    customsHtml += `<div class="form-text-note detail-kv-catatan">${tt("Incoterm ini bukan CIF maupun FOB — nilai CIF, CIF Rupiah, dan FOB Rupiah otomatis 0.", "This incoterm is neither CIF nor FOB — CIF, CIF Rupiah and FOB Rupiah are 0.")}</div>`;
  }

  if (lbl.showDuty) {
    customsHtml += `
      <div class="subsection-title"><i class="bi bi-receipt"></i> ${tt("Bea &amp; Pajak Impor", "Import Duties &amp; Taxes")}</div>
      ${detailDaftar([
        detailBaris(tt("Tarif", "Tariff"), (Number(s.tarif) || 0) + " %"),
        detailBaris(tt("Bea Masuk", "Import Duty"), fmtRp(s.bm)),
        detailBaris("PPN", fmtRp(s.ppn)),
        detailBaris("PPH", fmtRp(s.pph)),
        detailBaris("PDRI", fmtRp(calc.bmPdri)),
      ])}`;
  }
  /* Dokumen Pelengkap Pabean, seperti kartunya di form: PI, LS & Polis
     (buku Import), lalu tiap dokumen lain dengan nama dokumennya. */
  const barisDokumen = [
    ...(lbl.showDuty ? JENIS_DOK_PENGIRIMAN.map((j) => detailBaris(DOK_PENGIRIMAN[j].label, daftarDokumenHtml(dok[j]))) : []),
    ...(dok.lain || []).map((d) => detailBaris(namaDokumenCeisa(d.kode), dokumenHtml(d))),
  ];
  if (barisDokumen.length) {
    customsHtml += `
      <div class="subsection-title"><i class="bi bi-files"></i> ${tt("Dokumen Pelengkap Pabean", "Supporting Customs Documents")}</div>
      ${detailDaftar(barisDokumen, true)}`;
  }

  const udara = s.transport === "udara";
  const jumlahSinggah = routeStopList(s).length;
  const tagButuh = s.mode !== "export" && s.neededDate ? tagKebutuhanHtml(s) : "";
  return `
    <div class="detail-header">
      <div class="detail-header-isi">
        <div class="detail-header-label">${escapeHtml(lbl.party)}</div>
        <div class="item-name">${escapeHtml(dispVal(s.party))}</div>
        <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} · ${lbl.docDate}: ${fmtDate(s.docDate)}</div>
      </div>
      <div class="detail-header-tanda">
        <span class="detail-badge-mode">${mode === "import" ? "Import" : "Export"}</span>
        <span class="status-select ${statusClass(statusBerlaku)}" style="pointer-events:none; padding-right:14px; background-image:none;">${escapeHtml(statusLabel(statusBerlaku, s.mode).toUpperCase())}</span>
      </div>
    </div>

    <div class="subsection-title"><i class="bi bi-file-earmark-text"></i> ${tt("Dokumen &amp; Umum", "Documents &amp; General")}</div>
    ${detailDaftar([
      detailBaris("No. Aju", escapeHtml(dispVal(s.noAju))),
      detailBaris("No. Invoice", nomorTanggal(s.invoice, s.invoiceDate)),
      detailBaris("No. Packing List", nomorTanggal((s.dataPabean || {}).packingListNomor, (s.dataPabean || {}).packingListTanggal)),
      detailBaris(udara ? "Master AWB" : "Master B/L", nomorTanggal(s.masterBL, s.masterBLDate)),
      detailBaris(udara ? "House AWB" : "House B/L", nomorTanggal(s.houseBL, s.houseBLDate)),
      /* Hanya Import. Di Export kolom ini tidak dipakai lagi — muatan
         dicatat lewat kolom Stuffing (s.actual), dan menampilkan
         keduanya membuat orang menebak-nebak mana yang berlaku. */
      s.mode !== "export" &&
        detailBaris(lbl.factoryDate, s.factoryDate ? fmtDate(s.factoryDate) + (s.factoryTime ? " · " + escapeHtml(s.factoryTime) : "") : "—"),
      detailBaris(tt("Nama Forwarder", "Forwarder Name"), escapeHtml(dispVal(s.forwarder))),
      detailBaris("PIC Forwarder", escapeHtml(dispVal(s.forwarderPic))),
    ])}
    ${detailProgresDokumenHtml(s)}

    <div class="subsection-title"><i class="bi bi-compass"></i> ${tt("Transportasi &amp; Rute", "Transport &amp; Route")}</div>
    ${detailDaftar([
      detailBaris(tt("Moda Transportasi", "Transport Mode"), udara ? tt("Udara", "Air") : tt("Laut", "Sea")),
      detailBaris(vesselNoun(s.transport) + (isTransitRoute(s) ? tt(" (Leg Terakhir)", " (Last Leg)") : ""), escapeHtml(dispVal(carrierNameFromShipment(s)))),
      // Peti kemas & jenis muatan hanya kiriman laut
      !udara && detailBaris(tt("No. Kontainer/Seal", "Container/Seal Number"), escapeHtml(dispVal(s.container))),
      !udara && detailBaris(tt("Jenis Muatan", "Load Type"), escapeHtml(s.muatan || "—")),
      detailBaris(tt("No. Kendaraan", "Vehicle No."), escapeHtml(dispVal(s.vehicleNo))),
      detailBaris(tt("Tipe Rute", "Route Type"), isTransitRoute(s)
        ? tt(`Transit (${jumlahSinggah} Terminal Singgah)`, `Transit (${jumlahSinggah} stopover terminal${jumlahSinggah === 1 ? "" : "s"})`)
        : "Direct"),
      detailBaris(portNoun("origin", s.transport, mode), escapeHtml(dispVal(portCodeLabel(s.origin)))),
      detailBaris(portNoun("destination", s.transport, mode), escapeHtml(dispVal(portCodeLabel(s.destination)))),
      detailBaris("ETD", tanggalBerlaku(s.etd, s.etdUpdate, s.etdTime)),
      detailBaris("ETA", tanggalBerlaku(s.eta, s.etaUpdate, s.etaTime)),
      detailBaris(lbl.actual, fmtDate(s.actual)),
      // Tanda kebutuhannya (cadangan / mepet / telat) di bawah tanggalnya
      s.mode !== "export" && s.neededDate &&
        detailBaris(tt("Dibutuhkan di Pabrik", "Needed at Factory"), fmtDate(s.neededDate) + (tagButuh ? `<div class="detail-kv-tag">${tagButuh}</div>` : "")),
    ])}
    ${buildDetailStopsHtml(s)}
    ${predictionDetailHtml(s)}
    ${(() => {
      const log = normalizeNotesLog(s.notesLog, s.notes);
      if (!log.length) return "";
      // Judul bergaya sama dengan bagian lain, jumlah catatannya redup seperti Progres Dokumen
      return `<div class="subsection-title"><i class="bi bi-chat-left-text"></i> ${tt("Kronologi &amp; Catatan", "Timeline &amp; Notes")} <span class="text-muted fw-normal">${log.length}</span></div>
      <div class="detail-notes mb-3">
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
    <div class="detail-barang"><div class="item-table-wrap mb-2">
      <table class="item-table item-table--detail">
        <thead><tr>${kolomBarang.map((k) => `<th${kelasKolom(k)}>${escapeHtml(k.judul)}</th>`).join("")}</tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div></div>
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
