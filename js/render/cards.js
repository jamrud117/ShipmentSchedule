"use strict";

/* CARD RENDERING */
function renderCard(s) {
  return isArrived(s)
    ? renderCollapsedCard(s)
    : renderExpandedCard(s);
}

function hasMeaningfulValue(v) {
  const teks = (v || "").toString().trim();
  return teks !== "" && teks !== "-";
}

// Display fallback for free-text fields: treats "-" the same as empty
function dispVal(v) {
  return hasMeaningfulValue(v) ? v : "—";
}

// Ringkasan fasilitas lintas-barang untuk badge kartu
const SKB_JENIS_WITH_COUNT = new Set(["E-COO", "Masterlist"]);

function skbCountByJenis(s) {
  const counts = {};
  (s.items || []).forEach((it) => {
    (it.skb || []).forEach((sk) => {
      const j = SKB_TYPE_OPTIONS.includes(sk.jenis) ? sk.jenis : "Lainnya";
      counts[j] = (counts[j] || 0) + 1;
    });
  });
  return counts;
}

function skbTagsHtml(s) {
  const lbl = ML();
  const counts = skbCountByJenis(s);
  return SKB_TYPE_OPTIONS.map((jenis) => {
    const n = counts[jenis] || 0;
    if (!n) return "";
    // PPH/BM/PPN/Masterlist/Lainnya = fasilitas bea impor, cuma relevan di mode import (showDuty)
    if (jenis !== "E-COO" && !lbl.showDuty) return "";
    const isEcoo = jenis === "E-COO";
    const cls = isEcoo ? "tag-ecoo" : "tag-skb";
    const icon = isEcoo ? "bi-patch-check" : "bi-shield-check";
    // Nama tampil, bukan nilai tersimpan: "E-COO" -> COO, "Lainnya" diterjemahkan.
    const nama = skbJenisLabel(jenis);
    const label = SKB_JENIS_WITH_COUNT.has(jenis) ? `${nama} × ${n}` : nama;
    return `<span class="tag ${cls}"><i class="bi ${icon}"></i> ${escapeHtml(label)}</span>`;
  }).join("");
}

// Daftar nama barang buat kartu depan (info-grid) — 1 barang 1 baris
function itemNamesSummary(s, maxShown = 4) {
  /* itemDisplayName: kolom barang CEISA kiri ke kanan, tanda kosong
     dilewati. Dipakai bersama copy template -- lihat helpers.js. */
  const names = (s.items || [])
    .map((it) => itemDisplayName(it))
    .filter(Boolean);
  if (!names.length) return ["—"];
  if (names.length <= maxShown) return names;
  return [...names.slice(0, maxShown), tt(`+${names.length - maxShown} lainnya`, `+${names.length - maxShown} more`)];
}

// Requirement D: "Tampilkan info delay di card dashboard juga: berapa hari delay-nya
function delayBadgeHtml(s) {
  if (s.status !== "delayed") return "";
  const info = shipmentDelayInfo(s);
  if (!info || info.days <= 0) return "";
  return `<span class="tag tag-delay"><i class="bi bi-clock-history"></i> ${tt(`Mundur ${info.days} hari dari ${info.basis}`, `Delayed ${info.days} days from ${info.basis}`)}</span>`;
}

/* STRIP TANGGAL UPDATE DELAY (hanya saat status DELAY) */
function delayDeltaText(baseline, update, basis) {
  const d = delayDaysBetween(baseline, update);
  if (d == null) return "";
  const teks = delayDeltaLabel(baseline, update, basis);
  const kelas =
    d > 0 ? " delay-delta--late" : d < 0 ? " delay-delta--early" : "";
  return `<span class="delay-delta${kelas}">${teks}</span>`;
}

/* Tampil saat status DELAY, dan juga selama tanggal revisinya masih
   terisi walau statusnya sudah bukan Delay: tanggal itulah yang
   berlaku, jadi tidak boleh tersembunyi (aturan 1 di core/status.js). */
function delayStripHtml(s) {
  const delay = s.status === "delayed";
  if (!delay && !adaRevisiJadwal(s)) return "";
  return `
    <div class="delay-strip${delay ? "" : " delay-strip--sisa"}">
      <div class="delay-strip-head">
        <i class="bi bi-clock-history"></i> ${
          delay
            ? tt("Tanggal Update Delay", "Delay Update Dates")
            : tt("Tanggal revisi yang masih berlaku — mengubah ETD/ETA di atas menggantikannya", "Revised dates still in force — changing ETD/ETA above replaces them")
        }
      </div>
      <div class="delay-strip-fields">
        <div class="date-field">
          <label for="${idTglKartu(s, "etdUpdate")}">${tt("Update ETD", "Updated ETD")} ${delayDeltaText(s.etd, s.etdUpdate, "ETD")}</label>
          <input type="date" id="${idTglKartu(s, "etdUpdate")}" value="${s.etdUpdate || ""}" data-action="date" data-field="etdUpdate" data-id="${s.id}">
        </div>
        <div class="date-field">
          <label for="${idTglKartu(s, "etaUpdate")}">${tt("Update ETA", "Updated ETA")} ${delayDeltaText(s.eta, s.etaUpdate, "ETA")}</label>
          <input type="date" id="${idTglKartu(s, "etaUpdate")}" value="${s.etaUpdate || ""}" data-action="date" data-field="etaUpdate" data-id="${s.id}">
        </div>
      </div>
    </div>`;
}

/* ANIMASI KEBERANGKATAN (requirement: ETD == hari ini) */
function isDepartingToday(s) {
  // Pakai ETD EFEKTIF — kalau keberangkatan sudah dimundurkan
  const etd = effectiveEtd(s);
  if (!etd) return false;
  return etd === todayISO();
}

function departingTodayHtml(s) {
  if (!isDepartingToday(s)) return "";
  const air = s.transport === "udara";
  return `
    <div class="depart-strip depart-strip--${air ? "air" : "sea"}">
      <span class="depart-label">
        <i class="bi bi-broadcast"></i> ${tt("Berangkat hari ini", "Departs today")}
      </span>
      <span class="depart-track" aria-hidden="true">
        <span class="depart-mover">${air ? ICON_PESAWAT : ICON_KAPAL}</span>
      </span>
    </div>`;
}

// Tag PI kartu: "PI", atau "PI × 2" untuk lebih dari satu dokumen PI
/* DIBUTUHKAN DI PABRIK (prediction-mundur.js): Estimated Delivery
   dibandingkan tanggal yang dibutuhkan produksi -- telat (merah), mepet
   (cadangan <= 2 hari, kuning), aman (netral). */
function tagKebutuhanHtml(s) {
  const k = typeof statusKebutuhan === "function" ? statusKebutuhan(s) : null;
  if (!k || k.fakta) return "";
  const tgl = fmtDate(k.butuh);
  const judul = escapeAttr(
    k.sampai
      ? tt(`Dibutuhkan di pabrik ${tgl} · Estimated Delivery ${fmtDate(k.sampai)}`, `Needed at the factory ${tgl} · Estimated Delivery ${fmtDate(k.sampai)}`)
      : tt(`Dibutuhkan di pabrik ${tgl} · Estimated Delivery belum bisa dihitung`, `Needed at the factory ${tgl} · Estimated Delivery not available yet`),
  );
  if (k.kind === "telat")
    return `<span class="tag tag-butuh tag-butuh--telat" title="${judul}"><i class="bi bi-alarm"></i> ${tt(`Telat ${-k.selisih} hari dari kebutuhan ${tgl}`, `${-k.selisih} day${k.selisih === -1 ? "" : "s"} past the need date ${tgl}`)}</span>`;
  if (k.kind === "mepet")
    return `<span class="tag tag-butuh tag-butuh--mepet" title="${judul}"><i class="bi bi-alarm"></i> ${tt(`Mepet: butuh ${tgl}, cadangan ${k.selisih} hari`, `Tight: needed ${tgl}, ${k.selisih}-day margin`)}</span>`;
  return `<span class="tag tag-butuh" title="${judul}"><i class="bi bi-alarm"></i> ${tt(`Butuh ${tgl}`, `Needed ${tgl}`)}${k.kind === "aman" ? tt(` · cadangan ${k.selisih} hari`, ` · ${k.selisih}-day margin`) : ""}</span>`;
}

/* LARTAS (core/lartas.js): PI / LS yang wajib menurut barangnya tapi
   belum ada nomornya di jadwal. */
function tagLartasHtml(s) {
  const kurang = typeof lartasKurang === "function" ? lartasKurang(s) : [];
  if (!kurang.length) return "";
  const perlu = kebutuhanLartas(s);
  const sebab = kurang
    .map((k) => {
      const hs = [...new Set(perlu[k].filter((a) => a.sebab === "hs").map((a) => a.hs))];
      const bekas = perlu[k].some((a) => a.sebab === "bukanBaru");
      return `${k}: ${[hs.length ? "HS " + hs.join(", ") : "", bekas ? tt("barang bukan baru", "used goods") : ""].filter(Boolean).join(" · ")}`;
    })
    .join("; ");
  return `<span class="tag tag-lartas" title="${escapeAttr(tt(`Lartas — wajib ${sebab}`, `Restricted — required ${sebab}`))}"><i class="bi bi-shield-exclamation"></i> ${escapeHtml(
    tt(`${kurang.join(" & ")} belum ada`, `${kurang.join(" & ")} missing`),
  )}</span>`;
}

function tagPiHtml(s) {
  const n = (dokPelengkapJadwal(s).pi || []).filter((d) => hasMeaningfulValue(d.nomor)).length;
  return n ? `<span class="tag tag-pi"><i class="bi bi-file-earmark-check"></i> PI${n > 1 ? ` × ${n}` : ""}</span>` : "";
}

function buildTags(s, totals) {
  const lbl = ML();
  const stopCount = routeStopList(s).length;
  const muatan = muatanKiriman(s);
  return [
    s.incoterm ? `<span class="tag">${escapeHtml(s.incoterm)}</span>` : "",
    totals.totalUSD
      ? `<span class="tag tag-usd">${fmtUSD(totals.totalUSD)}</span>`
      : "",
    muatan ? `<span class="tag tag-muatan">${escapeHtml(muatan)}</span>` : "",
    isTransitRoute(s)
      ? `<span class="tag tag-transit"><i class="bi bi-signpost-split"></i> Transit · ${stopCount} Stop</span>`
      : "",
    lbl.showDuty ? tagPiHtml(s) : "",
    skbTagsHtml(s),
  ]
    .filter(Boolean)
    .join("");
}

/* Tombol ikon kartu: keterangannya di title (tooltip, js/ui/tooltip.js)
   DAN aria-label (nama yang dibacakan) -- ikon saja tidak cukup. */
function actionButtons(s) {
  const lihat = tt("Lihat Detail", "View Details");
  const ubah = tt("Ubah Jadwal", "Edit Schedule");
  const salin = t("v.salin.ke.excel");
  const hapus = tt("Hapus Jadwal", "Delete Schedule");
  return `
    <div class="actions-col">
      <button type="button" class="icon-btn" data-action="viewDetail" data-id="${s.id}" title="${lihat}" aria-label="${lihat}"><i class="bi bi-eye" aria-hidden="true"></i></button>
      <button type="button" class="icon-btn primary" data-action="edit" data-id="${s.id}" title="${ubah}" aria-label="${ubah}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
      <div class="dropdown copy-template-dropdown">
        <button type="button" class="icon-btn" data-bs-toggle="dropdown" aria-expanded="false" title="${escapeAttr(salin)}" aria-label="${escapeAttr(salin)}"><i class="bi bi-clipboard" aria-hidden="true"></i></button>
        <ul class="dropdown-menu dropdown-menu-end copy-template-menu">${copyTemplateMenuHtml(s.id)}</ul>
      </div>
      <button type="button" class="icon-btn danger" data-action="delete" data-id="${s.id}" title="${hapus}" aria-label="${hapus}"><i class="bi bi-trash3" aria-hidden="true"></i></button>
    </div>`;
}

/* Id kotak tanggal di kartu -- supaya <label>-nya benar-benar terhubung
   (diklik membuka isiannya, dibacakan pembaca layar). Id jadwal unik,
   dan tiap jadwal hanya punya satu kartu di halaman. */
const idTglKartu = (s, kolom) => "tgl-" + String(s.id).replace(/[^\w-]/g, "") + "-" + String(kolom).replace(/[^\w-]/g, "");

// Dropdown status di kartu: pilihannya mengikuti section aktif (requirement D)
function statusSelectHtml(s) {
  /* Yang ditampilkan status EFEKTIF: begitu tanggal Actual Delivery
     terlewati, dropdown-nya sudah menunjukkan Arrived walau kolom di
     database belum sempat diperbarui */
  const st = effectiveStatus(s);

  return `<select class="status-select ${statusClass(st)}" data-action="status" data-id="${s.id}" aria-label="${escapeAttr(tt("Status pengiriman", "Shipment status"))}">
      ${statusOptionsHtml(activeMode, st)}
    </select>`;
}

// Satu rincian kartu: ikon + label di atas nilainya (nilaiHtml sudah di-escape)
function infoItemHtml(ikon, label, nilaiHtml) {
  return `<div class="info-item"><div class="info-label"><i class="bi ${ikon}"></i> ${label}</div><div class="info-value">${nilaiHtml}</div></div>`;
}

/* Sel peti kemas: laut = No. Kontainer/Seal + jenis muatannya; udara
   tidak berkontainer, selnya diisi Master AWB (House AWB di sel lain). */
function infoKontainerHtml(s) {
  if (s.transport === "udara") return infoItemHtml("bi-file-earmark-text", "Master AWB", escapeHtml(dispVal(s.masterBL)));
  const muatan = muatanKiriman(s);
  return infoItemHtml("bi-upc-scan", t("f.kontainer"), escapeHtml(dispVal(kontainerKiriman(s))) + (muatan ? " · " + escapeHtml(muatan) : ""));
}

/* BADAN KARTU — rincian di kiri, nama barang di kanan.

   SATU fungsi untuk kartu berjalan MAUPUN kartu yang sudah tiba.
   Kiriman yang sudah selesai justru paling sering dibuka lagi untuk
   mencari nomor B/L, forwarder, atau rutenya; menyusun ulang blok ini
   khusus untuk kartu tiba membuat keduanya perlahan berbeda isi tanpa
   ada yang berniat membedakannya. */
function cardBodySplitHtml(s, totals) {
  const lbl = ML();
  return `
    <div class="ship-body-split">
    <div class="info-grid">
      <div class="info-item"><div class="info-label"><i class="bi bi-geo-alt"></i> ${t("f.rute")}</div><div class="info-value">${escapeHtml(routeChainText(s))}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-person-badge"></i> Forwarder</div><div class="info-value">${escapeHtml(dispVal(s.forwarder))}<br><span class="muted-value">PIC: ${escapeHtml(dispVal(s.forwarderPic))}</span></div></div>
      <div class="info-item"><div class="info-label"><i class="bi ${s.transport === "udara" ? "bi-airplane" : "bi-water"}"></i> ${vesselNoun(s.transport)}</div><div class="info-value">${
        /* Nama + nomor sarana angkut dalam satu teks, sama dengan templat
           salin & CIPL (carrierNameFromShipment). */
        escapeHtml(dispVal(carrierNameFromShipment(s)))
      }</div></div>
      ${infoKontainerHtml(s)}
      <div class="info-item"><div class="info-label"><i class="bi bi-receipt-cutoff"></i> Invoice</div><div class="info-value">${escapeHtml(dispVal(s.invoice))}</div></div>
      <div class="info-item"><div class="info-label"><i class="bi bi-file-earmark-text"></i> ${s.transport === "udara" ? "House AWB" : "House B/L"}</div><div class="info-value">${escapeHtml(dispVal(s.houseBL))}</div></div>
      ${
        /* Import: No. Kendaraan menumpang di sel In Factory (truk yang
           mengantar barang ke pabrik), seperti PIC di bawah Forwarder --
           delapan rincian pas dua baris empat kolom, tanpa satu sel
           yatim di baris ketiga. Export tidak punya sel In Factory, jadi
           No. Kendaraan tetap sel sendiri. */
        activeMode === "export"
          ? ""
          : `<div class="info-item"><div class="info-label"><i class="bi bi-truck"></i> ${lbl.factoryDate}</div><div class="info-value">${s.factoryDate ? fmtDate(s.factoryDate) : "—"}${s.factoryTime ? " · " + escapeHtml(s.factoryTime) : ""}${
              // Baris kendaraan hanya kalau terisi: baru relevan saat barang diantar ke pabrik.
              hasMeaningfulValue(s.vehicleNo) ? `<br><span class="muted-value">${escapeHtml(tt("Kendaraan", "Vehicle"))}: ${escapeHtml(s.vehicleNo)}</span>` : ""
            }</div></div>`
      }
      <div class="info-item"><div class="info-label"><i class="bi bi-box-seam"></i> ${t("f.total.bruto")}</div><div class="info-value">${fmtNum(totals.totalBruto)} Kg</div></div>
      ${
        activeMode === "export"
          ? `<div class="info-item"><div class="info-label"><i class="bi bi-truck-front"></i> ${escapeHtml(tt("No. Kendaraan", "Vehicle No."))}</div><div class="info-value">${escapeHtml(dispVal(s.vehicleNo))}</div></div>`
          : ""
      }
    </div>
    <div class="info-item info-names"><div class="info-label"><i class="bi bi-boxes"></i> ${t("f.nama.barang")}</div><div class="info-value info-value--list">${itemNamesSummary(
      s,
    )
      .map((n) => `<div>${escapeHtml(n)}</div>`)
      .join("")}</div></div>
    </div>`;
}

function renderExpandedCard(s) {
  const lbl = ML();
  const totals = itemTotals(s);
  const itemCount = (s.items || []).length;

  return `
  <div class="ship-card ship-card--${effectiveStatus(s)}" data-id="${s.id}">
    <div class="ship-card-top">
      <div class="ship-title-block">
                <div class="ship-title-text">
          <div class="item-name">${escapeHtml(dispVal(s.party))} · ${itemCount} ${itemCount === 1 ? tt("Barang", "Item") : t("f.barang")}</div>
          <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} &nbsp;•&nbsp; No. Aju: ${escapeHtml(dispVal(s.noAju))}</div>
        </div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>

${cardBodySplitHtml(s, totals)}

    <div class="tag-row">${delayBadgeHtml(s)}${tagKebutuhanHtml(s)}${tagLartasHtml(s)}${buildTags(s, totals)}</div>

    <div class="lane">
      ${buildLaneHtml(s)}
    </div>

    <div class="date-strip">
      <div class="date-field"><label for="${idTglKartu(s, "etd")}">ETD</label><input type="date" id="${idTglKartu(s, "etd")}" value="${s.etd || ""}" data-action="date" data-field="etd" data-id="${s.id}"></div>
      <div class="date-field"><label for="${idTglKartu(s, "eta")}">ETA ${etaPredictionAppliesTo(s) ? etaModeChipHtml(etaModeOf(s)) : ""}</label><input type="date" id="${idTglKartu(s, "eta")}" value="${s.eta || ""}" data-action="date" data-field="eta" data-id="${s.id}"></div>
      ${
        /* Estimated Delivery sengaja tetap BISA DIKETIK; mengetik di
           sini mengunci tanggalnya ke mode Manual. Kalau terpikir
           menguncinya supaya tidak ada dua sumber kebenaran: laporan
           butuh tanggal yang bisa dipatok, dan mode Manual itulah
           jawabannya. */
        `<div class="date-field${deliveryPredictionAppliesTo(s) && deliveryModeOf(s) === "manual" ? " date-field--pinned" : ""}"><label for="${idTglKartu(s, "actual")}">${lbl.actual} ${deliveryPredictionAppliesTo(s) ? deliveryModeChipHtml(deliveryModeOf(s)) : ""}</label><input type="date" id="${idTglKartu(s, "actual")}" value="${s.actual || ""}" data-action="date" data-field="actual" data-id="${s.id}"></div>`
      }
    </div>

    ${predictionStripHtml(s)}
    ${departingTodayHtml(s)}
    ${delayStripHtml(s)}
    ${docStepHtml(s)}
    ${cardNotesHtml(s)}
  </div>`;
}

/* ETD & ETA pada kartu yang sudah Arrived / Delivered.

   Tetap ditampilkan karena keduanya masih dirujuk: Delivered di buku
   Export berarti kapalnya sudah berangkat, bukan urusannya selesai,
   dan di buku Import jadwal berangkat-tiba tetap jadi acuan saat
   menelusuri kiriman lama.

   HANYA BISA DIBACA. Kartu terkuncup adalah ringkasan; mengubah
   tanggal di sini terlalu mudah dilakukan tanpa sengaja pada kiriman
   yang sudah dianggap beres. Yang mau membetulkan masuk lewat tombol
   pensil, dan di sana perubahannya disengaja.

   Yang ditampilkan tanggal TERBARU (effectiveEtd/Eta): kalau jadwalnya
   pernah dimundurkan, angka yang berlaku adalah tanggal update delay,
   bukan rencana awal yang sudah diketahui meleset. Rencana awalnya
   tetap bisa dilihat lewat tombol pensil. */
function collapsedDatesHtml(s) {
  const mundur =
    (s.etdUpdate && s.etdUpdate !== s.etd) || (s.etaUpdate && s.etaUpdate !== s.eta);
  const catatan = mundur
    ? tt(` Jadwal ini pernah dimundurkan — lihat Tanggal Update Delay lewat tombol pensil.`,
        ` This schedule has been postponed — see the Delay Update Dates via the pencil button.`)
    : "";
  const kotak = (label, nilai) => `
      <div class="date-field date-field--locked">
        <label for="${idTglKartu(s, "kunci-" + label)}">${label}</label>
        <input type="date" id="${idTglKartu(s, "kunci-" + label)}" value="${nilai || ""}" readonly
               title="${tt("Hanya baca. Tekan tombol pensil untuk mengubahnya.", "Read-only. Press the pencil button to change it.")}${catatan}">
      </div>`;

  return `
    <div class="collapsed-dates">
      ${kotak("ETD", effectiveEtd(s))}
      ${kotak("ETA", effectiveEta(s))}
      ${
        /* Estimated Delivery ikut ditampilkan: itu tanggal barang
           benar-benar sampai di pabrik, dan justru itu yang dicari
           saat menelusuri kiriman lama. */
        kotak(ML().actual, s.actual)
      }
      ${mundur ? `<div class="collapsed-dates-note"><i class="bi bi-clock-history"></i> ${tt("Pernah dimundurkan", "Previously postponed")}</div>` : ""}
    </div>`;
}

function renderCollapsedCard(s) {
  const lbl = ML();
  return `
  <div class="ship-card ship-card--arrived ship-card--collapsed" data-id="${s.id}">
    <div class="collapsed-row">
      <div class="collapsed-check"><i class="bi bi-check-circle-fill"></i></div>
            <div class="collapsed-main">
        <div class="collapsed-party">${escapeHtml(dispVal(s.party))} · ${(s.items || []).length} ${(s.items || []).length === 1 ? tt("Barang", "Item") : t("f.barang")}</div>
        <div class="collapsed-meta">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} &nbsp;·&nbsp; No. Aju: ${escapeHtml(dispVal(s.noAju))} &nbsp;·&nbsp; ${lbl.arrivedStat}: <b>${
          /* Tanggal yang MEMBUATNYA selesai (kolomPenyebabTiba): Export =
             ETD yang berlaku (kapal berangkat), bukan tanggal Stuffing;
             Import = In Factory. */
          fmtDate(s.mode === "export" ? effectiveEtd(s) : s.factoryDate)
        }</b></div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>

    <div class="collapsed-extra">
      ${collapsedDatesHtml(s)}
      ${
        /* Lencana yang sama dengan kartu aktif: incoterm, nilai, jenis
           muatan, fasilitas. Kiriman yang sudah selesai justru paling
           sering dicari ulang untuk angka-angka itu — menyembunyikannya
           memaksa membuka detail hanya untuk melihat satu nilai. */
        `<div class="tag-row tag-row--collapsed">${buildTags(s, itemTotals(s))}</div>`
      }
      ${
        /* Rincian LENGKAP, sama dengan kartu berjalan: rute, forwarder,
           sarana angkut, kontainer, invoice, House B/L, dan nama
           barang. Kiriman yang sudah tiba paling sering dibuka lagi
           justru untuk angka-angka itu -- menyembunyikannya memaksa
           membuka panel detail hanya untuk membaca satu nomor. */
        cardBodySplitHtml(s, itemTotals(s))
      }
      ${docStepHtml(s)}
      ${cardNotesHtml(s)}
    </div>
  </div>`;
}
