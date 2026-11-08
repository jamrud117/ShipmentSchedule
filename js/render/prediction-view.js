"use strict";

/* ==================================================================
   PENGGAMBARAN HASIL PREDIKSI

   Pembangun HTML murni: menerima objek pengiriman atau hasil prediksi,
   mengembalikan string. TIDAK menyentuh DOM form, TIDAK menyimpan
   keadaan, TIDAK menghitung apa pun.

   Dipakai tiga tempat sekaligus — panel form, strip kartu, dan panel
   detail — sehingga ketiganya tidak mungkin menampilkan angka atau
   istilah yang berbeda untuk hal yang sama.
==================================================================== */

/* ------------------------------------------------------------------
   POTONGAN TAMPILAN BERSAMA
------------------------------------------------------------------ */

/* Tingkat keyakinan: meteran lima ruas + "60% · Sedang".

   Persen DAN label. Persen sendirian terkesan lebih tepat daripada
   yang sebenarnya; label sendirian menyembunyikan bahwa 79% dan 89%
   dua hal yang berbeda. Meterannya membuat keduanya terbaca sekilas
   saat membandingkan kartu satu dengan yang lain -- ruasnya mengikuti
   tingkat (Rendah 1 ... Sangat Tinggi 5, Final penuh), bukan persennya.
   Alasan hitungannya ditaruh di title supaya bisa ditelusuri tanpa
   memenuhi layar. */
function confidenceChipHtml(conf, prefix, judulTambahan) {
  if (!conf) return "";
  const rinci = [judulTambahan || ""].concat((conf.reasons || [])
    .map((r) => `${r.delta > 0 ? "+" : ""}${r.delta}% ${r.text}`))
    .filter(Boolean)
    .join("\n");
  const tingkat = { low: 1, medium: 2, medhigh: 3, high: 4, veryhigh: 5, final: 5 }[conf.tone] || 1;
  const ruas = [1, 2, 3, 4, 5].map((i) => `<i${i <= tingkat ? ' class="on"' : ""}></i>`).join("");
  const judul = [tt(`Keyakinan ${conf.percent != null ? conf.percent + "% · " : ""}${conf.label}`, `Confidence ${conf.percent != null ? conf.percent + "% · " : ""}${conf.label}`), rinci].filter(Boolean).join("\n");
  /* Persen & label dua bagian: di panel tanggal yang sempit (kartu di
     ponsel) labelnya disembunyikan -- meteran sudah menunjukkan
     tingkatnya, dan label lengkapnya tetap di title. */
  return `<span class="pred-conf pred-conf--${conf.tone}" title="${escapeHtml(judul)}"><span class="pred-conf-meter" aria-hidden="true">${ruas}</span><span class="pred-conf-persen">${escapeHtml((prefix || "") + (conf.percent != null ? `${conf.percent}%` : ""))}</span><span class="pred-conf-label">${escapeHtml((conf.percent != null ? " · " : "") + conf.label)}</span></span>`;
}
/* MEKANIKA MESIN PREDIKSI HANYA UNTUK YANG BISA MENGUBAHNYA.

   Lencana Auto/Manual, sumber prediksi, dan tingkat keyakinan itu
   keterangan tentang CARA angka diperoleh — berguna bagi orang yang
   bisa menggeser mode, mengunci tanggal, atau mengonfirmasi milestone.

   Bagi akun yang cuma membaca, semua itu istilah tanpa tindakan: ia
   menambah yang harus dipahami tanpa menambah yang bisa dikerjakan.
   Tanggalnya sendiri tetap tampil utuh — itu yang mereka butuhkan. */
function tampilkanMekanikaPrediksi() {
  return typeof canEdit !== "function" || canEdit();
}

/* Penanda mode: label kecil berbingkai tipis, huruf biasa.

   Auto bertinta kuningan -- warna "hasil hitungan" di seluruh berkas
   prediction.css. Manual bertinta navy dengan ikon pin: tanggal yang
   DIPATOK orang, mesin tidak akan menggesernya. Tanpa isian warna dan
   tanpa ikon tongkat sihir: dulu "AUTO ETA" berkapital, berlatar
   kuningan, dan berikon -- lebih ramai daripada tanggal yang diberinya
   keterangan. */
function modeChipHtml(manual, label) {
  return `<span class="eta-mode-chip eta-mode-chip--${manual ? "manual" : "auto"}">${manual ? '<i class="bi bi-pin-angle-fill" aria-hidden="true"></i>' : ""}${escapeHtml(label)}</span>`;
}

function deliveryModeChipHtml(mode) {
  if (!tampilkanMekanikaPrediksi()) return "";
  return modeChipHtml(mode === "manual", deliveryModeLabel(mode));
}
/* Ringkasan Lapis 0. Kalau ETA terlihat aneh, pertanyaan pertamanya
   selalu "rutenya kebaca benar tidak" — dan ini yang menjawabnya. */

function routeLayerHtml(rute) {
  const bagian = [];
  const sisi = (kode, nama) =>
    kode
      ? `<b>${escapeHtml(kode)}</b>${nama ? ` <span class="pred-muted">${escapeHtml(nama)}</span>` : ""}`
      : `<span class="pred-muted">${t("c.belum.dikenali")}</span>`;
  bagian.push(
    `${sisi(rute.fromPort, rute.originName)} → ${sisi(rute.toPort, rute.destinationName)}`,
  );
  bagian.push(
    `<span class="pred-muted">${escapeHtml(rute.shipmentTypeLabel)} · ${rute.routeType === "transit" ? "Transit" : "Direct"}</span>`,
  );
  const c = typeof detectCarrier === "function" ? detectCarrier(rute) : null;
  if (c) {
    bagian.push(
      c.detected
        ? `<span class="pred-src-tag pred-src-tag--carrier"><i class="bi bi-buildings"></i> ${escapeHtml(c.name)} (${escapeHtml(c.code)})</span>`
        : `<span class="pred-src-tag pred-src-tag--unknown"><i class="bi bi-question-circle"></i> Carrier: ${escapeHtml(c.reason)}</span>`,
    );
  }

  const celah = (rute.gaps || []).length
    ? `<div class="pred-gaps"><i class="bi bi-info-circle"></i> ${escapeHtml(rute.gaps.join(" · "))}</div>`
    : "";
  return `<div class="pred-route">${bagian.join(" ")}</div>${celah}`;
}
function etaModeChipHtml(mode) {
  if (!tampilkanMekanikaPrediksi()) return "";
  return modeChipHtml(mode === "manual", etaModeLabel(mode));
}
/* Rentang ditulis sebagai kalimat pendek, bukan angka telanjang.
   "18-08-2026 – 24-08-2026" tanpa keterangan mudah dibaca terbalik
   sebagai dua tanggal berbeda yang tidak berhubungan. */

function predRangeHtml(dari, sampai, label, pendek) {
  if (!dari || !sampai || dari === sampai) return "";
  /* `pendek` (kartu): tahun dibuang bila sama -- "08-11 – 10-11";
     tanggal lengkapnya di title. */
  const sama = pendek && dari.slice(0, 4) === sampai.slice(0, 4);
  const tulis = (iso) => (sama ? fmtDate(iso).slice(0, 5) : fmtDate(iso));
  const judul = pendek ? ` title="${escapeHtml(`${label || tt("Rentang", "Range")} ${fmtDate(dari)} – ${fmtDate(sampai)}`)}"` : "";
  return `<span class="pred-range"${judul}>${pendek ? "" : '<i class="bi bi-arrows-expand-vertical"></i> '}${escapeHtml(label || tt("Rentang", "Range"))} ${tulis(dari)} – ${tulis(sampai)}</span>`;
}
/* DARI MANA angka transit itu datang.

   Angka yang tidak bisa ditelusuri tidak akan dipercaya, dan yang tidak
   dipercaya tidak akan dipakai. Penyesuaian carrier dan hasil belajar
   dari riwayat sama-sama menggeser ETA diam-diam kalau tidak ditulis di
   sini — pengguna cuma melihat angka yang tiba-tiba berbeda dari tabel
   rute yang mereka tahu. */

function transitSourceHtml(e) {
  const tr = e.transit || {};
  const bagian = [];

  /* ETA dari kiriman lain di kapal yang sama (etaSekapal) -- bukan dari
     tabel rute sama sekali. */
  if (e.sekapal) {
    const asal = e.sekapal.sumber || {};
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--learned"><i class="bi bi-link-45deg"></i> ${escapeHtml(
        `${e.ruleLabel}${asal.party ? ` — ${asal.party}` : ""}`,
      )}</span>`,
    );
    return bagian.join(" ");
  }

  if (tr.learned && (tr.learned.scope === "negara" || tr.learned.scope === "umum")) {
    /* Rute ini sendiri belum punya riwayat; asumsinya digeser riwayat
       RUTE LAIN (geserDariRuteLain, prediction-learning.js). */
    const g = tr.learned.shift;
    const geser = `${g > 0 ? "+" : ""}${g}`;
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--learned" title="${escapeHtml(tt(
        `Rute ini belum punya riwayat. ${tr.learned.samples} kiriman rute lain ${tr.learned.scope === "negara" ? "dari negara yang sama" : "searah"} rata-rata meleset ${geser} hari dari tabel; asumsi rute ini ikut digeser.`,
        `This route has no history yet. ${tr.learned.samples} shipments on other ${tr.learned.scope === "negara" ? "routes from the same country" : "routes in this direction"} ran ${geser} days off the table on average; this route's assumption is shifted too.`,
      ))}"><i class="bi bi-mortarboard-fill"></i> ${tt(
        `Riwayat ${tr.learned.samples} kiriman rute lain${tr.learned.scope === "negara" ? " (negara sama)" : ""} · ${geser} hari dari tabel`,
        `History of ${tr.learned.samples} shipments on other routes${tr.learned.scope === "negara" ? " (same country)" : ""} · ${geser} days vs table`,
      )}</span>`,
    );
  } else if (tr.learned) {
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--learned" title="${escapeHtml(
        t("z.ringkasan.belajar", { avg: tr.learned.avg, min: tr.learned.min, maks: tr.learned.max, sd: tr.learned.stdDev, buang: tr.learned.dropped, metode: tr.learned.method }),
      )}"><i class="bi bi-mortarboard-fill"></i> ${tt(
        `Riwayat ${tr.learned.samples} pengiriman${tr.learned.scope === "carrier" ? " (pelayaran ini)" : ""} · ${tr.learned.min}–${tr.learned.max} hari · bobot ${Math.round((tr.learned.weight != null ? tr.learned.weight : 1) * 100)}%`,
        `History of ${tr.learned.samples} shipments${tr.learned.scope === "carrier" ? " (this carrier)" : ""} · ${tr.learned.min}–${tr.learned.max} days · weight ${Math.round((tr.learned.weight != null ? tr.learned.weight : 1) * 100)}%`,
      )}</span>`,
    );
  }
  /* Riwayat yang BELUM cukup tetap ditulis. Tanpa ini, pengguna cuma
     melihat fitur yang tidak pernah menyala dan menyangkanya rusak —
     padahal ia sedang mengumpulkan. */
  if (tr.learningProgress) {
    const lp = tr.learningProgress;
    const teks = tt(`Riwayat ${lp.samples}/${lp.need} kiriman — belum cukup untuk dipakai`,
      `History ${lp.samples}/${lp.need} shipments — not enough to use yet`);
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--unknown"><i class="bi bi-hourglass-split"></i> ${escapeHtml(teks)}</span>`,
    );
  }
  if (tr.carrierDays) {
    const tanda = tr.carrierDays > 0 ? "+" : "";
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--carrier"><i class="bi bi-truck"></i> ${tanda}${tr.carrierDays} ${tt("hari", "days")} — ${escapeHtml(tr.carrierLabel || tt("penyesuaian carrier", "carrier adjustment"))}</span>`,
    );
  }
  return bagian.join(" ");
}

// Lama transit: "8–12 hari" kalau rentang, "11 hari" kalau angka pasti.
/* "8–12 hari kalender" / "8–12 calendar days". Dulu jumlah hari &
   akhirannya dirangkai terpisah, dan bahasa Inggrisnya jadi
   "8–12 days calendar days". */
function predHariKalender(e) {
  const n = e.hasRange ? `${e.daysMin}–${e.daysMax}` : `${e.days}`;
  return tt(`${n} hari kalender`, `${n} ${e.days === 1 && !e.hasRange ? "calendar day" : "calendar days"}`);
}
/* Bahasa Inggris membedakan tunggal: "1 working day", bukan "1 working days". */
function satuanHariTunggal(n, satuan) {
  return Number(n) === 1 && typeof activeLang !== "undefined" && activeLang === "en"
    ? String(satuan).replace(/days$/, "day")
    : satuan;
}


/* Libur nasional, cuti bersama, & pembatasan truk yang DILEWATI sebuah
   langkah hari kerja. Tanpa keterangan ini, "1 hari kerja" yang
   ternyata jatuh sepekan kemudian (Lebaran) terbaca seperti mesin
   yang salah hitung. */
function predLiburHtml(st, ctx) {
  if (st.days == null || !st.from || !st.to || legUsesCalendarDays(st.key)) return "";
  const hari = hariTutupDiAntara(st.from, st.to, hariTutupLangkah(st.key, ctx));
  if (!hari.length) return "";
  const nama = [];
  hari.forEach((h) => {
    const label = h.kind === "cuti" ? tt(`cuti bersama ${h.name}`, `collective leave ${h.name}`) : h.name;
    if (label && nama.indexOf(label) < 0) nama.push(label);
  });
  const teks =
    tt(`melewati ${hari.length} hari tutup`, `skips ${hari.length} closed ${hari.length === 1 ? "day" : "days"}`) +
    (nama.length ? `: ${nama.slice(0, 5).join(", ")}${nama.length > 5 ? "…" : ""}` : "");
  return ` <span class="pred-step-src pred-step-libur"><i class="bi bi-calendar-x"></i> ${escapeHtml(teks)}</span>`;
}

// Rincian "ETA + 2 hari kerja + 2 hari kerja" yang bisa ditelusuri pengguna.
function predStepsHtml(d) {
  const baris = [];
  baris.push(
    `<li><span class="pred-step-label">${escapeHtml(d.baseLabel)}</span>
      <span class="pred-step-date">${fmtDate(d.base)}</span></li>`,
  );
  (d.steps || []).forEach((st) => {
    /* Langkah "menunggu PIB" tidak punya durasi — ia jeda sampai
       tanggal tertentu, bukan proses yang memakan sekian hari.
       Menuliskannya sebagai "null hari kerja" bukan cuma jelek, tapi
       menyesatkan: seolah ada proses yang lamanya tidak diketahui. */
    const durasi =
      st.days == null
        ? ""
        : ` <em>${st.days} ${escapeHtml(satuanHariTunggal(st.days, st.unit || tt("hari kerja", "working days")))}</em>`;
    /* Clearance & antar ke pabrik yang angkanya dari riwayat: dari
       riwayat FORWARDER kiriman ini, atau dari seluruh forwarder di
       rute yang sama. */
    const asal = ((d.ops && d.ops.learned) || []).find((x) => x.leg === st.key);
    const sumber = asal
      ? ` <span class="pred-step-src">${escapeHtml(
          asal.scope === "forwarder"
            ? tt(`riwayat forwarder ini · ${asal.samples} kiriman`, `this forwarder's history · ${asal.samples} shipments`)
            : tt(`riwayat rute · ${asal.samples} kiriman`, `route history · ${asal.samples} shipments`),
        )}</span>`
      : "";
    baris.push(
      `<li><span class="pred-step-label">+ ${escapeHtml(st.label)}${durasi}${sumber}${predLiburHtml(st, d.ctx)}</span>
       <span class="pred-step-date">${fmtDate(st.to)}</span></li>`,
    );
  });
  return `<ol class="pred-steps">${baris.join("")}</ol>`;
}
/* ------------------------------------------------------------------
   BARIS RINGKAS DI KARTU
------------------------------------------------------------------ */

/* Keterangan Estimated Delivery di kartu -- duduk di BAWAH tanggalnya,
   SEBARIS dengan harinya (dateStripHtml, js/render/cards.js), bukan lagi
   pita tersendiri yang menulis Estimated Delivery & tanggalnya sekali
   lagi:

     Sen  [Auto] dari PIB  ▮▮▮▮▯ 90% · Sangat Tinggi
     Sen  [Manual]  ▮▮▯▯▯ 60% · Sedang

   Sumber disebut hanya untuk Auto ("dari ETA", "dari PIB"); Manual
   sumbernya memang orang yang mengetiknya. Rentang tanggalnya di
   tooltip keyakinan -- sebagai teks ia memaksa keterangan pecah dua
   baris di kolom tanggal. */
function predictionStripHtml(s) {
  if (!tampilkanMekanikaPrediksi()) return "";
  /* Seluruhnya tentang Estimated Delivery, yang tidak berlaku di
     Export. ETA otomatis Export tetap jalan (keterangannya di bawah
     tanggal ETA). */
  if (!deliveryPredictionAppliesTo(s)) return "";
  const d = predictDelivery(s);

  if (!d.ok) {
    return `<span class="pred-strip pred-strip--empty"><span class="pred-strip-note">${escapeHtml(d.reason)}</span></span>`;
  }

  const manual = d.source === "manual";
  const rentang =
    d.range && d.range.earliest && d.range.latest && d.range.earliest !== d.range.latest
      ? `${tt("Rentang", "Range")} ${fmtDate(d.range.earliest)} – ${fmtDate(d.range.latest)}`
      : "";
  return `<span class="pred-strip">${deliveryModeChipHtml(manual ? "manual" : "auto")}${
    manual ? "" : `<span class="pred-strip-src">${tt("dari", "from")} <b>${escapeHtml(d.sourceLabel)}</b></span>`
  }${confidenceChipHtml(d.confidence, "", rentang)}${
    d.shifted ? `<span class="pred-late"><i class="bi bi-clock-history" aria-hidden="true"></i> ${tt(`Telat ${d.overdueDays} hari — dihitung ulang dari hari ini`, `${d.overdueDays} days late — recalculated from today`)}</span>` : ""
  }</span>`;
}
/* ------------------------------------------------------------------
   BAGIAN PENUH DI PANEL DETAIL
------------------------------------------------------------------ */

function predictionDetailHtml(s) {
  if (!tampilkanMekanikaPrediksi()) return "";
  // Lihat catatan di predictionStripHtml().
  if (!deliveryPredictionAppliesTo(s)) return "";
  const e = predictEta(s);
  const d = predictDelivery(s);
  const mode = etaModeOf(s);
  const tipe = predictionShipmentTypeLabel(predictionShipmentType(s));

  const barisEta = e.ok
    ? `${fmtDate(e.eta)} <span class="pred-muted">(${escapeHtml(e.ruleLabel)} · ${e.kind === "transit" ? "Transit" : tt("Langsung", "Direct")} · ETD + ${predHariKalender(e)})</span>
       ${e.hasRange ? predRangeHtml(e.etaEarliest, e.etaLatest) : ""}`
    : `<span class="pred-muted">${escapeHtml(e.reason)}</span>`;

  return `
    <div class="subsection-title"><i class="bi bi-graph-up-arrow"></i> ${tt("Prediksi Kedatangan", "Arrival Prediction")}</div>
    <div class="pred-detail">
      <div class="pred-detail-row">
        <div class="pred-detail-key">${tt("Tipe Pengiriman", "Shipment Type")}</div>
        <div class="pred-detail-val">${escapeHtml(tipe)}${predictionTypeIsAssumed(s) ? ' <span class="pred-muted">${t("c.jenis.muatan.belum.diisi.dianggap.fcl")}</span>' : ""}</div>
      </div>
      <div class="pred-detail-row">
        <div class="pred-detail-key">${tt("ETA Hitungan Mesin", "Engine-calculated ETA")}</div>
        <div class="pred-detail-val">${barisEta}</div>
      </div>
      <div class="pred-detail-row">
        <div class="pred-detail-key">${tt("ETA Dipakai", "ETA Used")}</div>
        <div class="pred-detail-val">${fmtDate(predictionEtaBasis(s))} ${etaModeChipHtml(mode)}</div>
      </div>
      <div class="pred-detail-row">
        <div class="pred-detail-key">Estimated Delivery</div>
        <div class="pred-detail-val">
          ${d.ok ? `<b>${fmtDate(d.date)}</b>` : `<span class="pred-muted">${escapeHtml(d.reason)}</span>`}
          ${d.ok ? `<span class="pred-muted">${tt("Sumber", "Source")}: ${escapeHtml(d.sourceLabel)}</span> ${confidenceChipHtml(d.confidence, tt("Keyakinan: ", "Confidence: "))}` : ""}
          ${d.range ? predRangeHtml(d.range.earliest, d.range.latest) : ""}
        </div>
      </div>
      ${d.ok && !d.arrived ? `<div class="pred-detail-row pred-detail-row--full">${predStepsHtml(d)}</div>` : ""}
      ${d.arrived ? `<div class="pred-note-final"><i class="bi bi-check-circle-fill"></i> ${t("w.barang.sudah.masuk.pabrik")}</div>` : ""}
      ${
        d.source === "manual"
          ? (() => {
              const auto = predictDelivery(Object.assign({}, s, { deliveryMode: "auto" }));
              return auto.ok
                ? `<div class="pred-detail-row"><div class="pred-detail-key">${tt("Hitungan Mesin", "Engine Calculation")}</div>
                     <div class="pred-detail-val"><span class="pred-muted">${fmtDate(auto.date)} · ${escapeHtml(auto.sourceLabel)}</span></div></div>`
                : "";
            })()
          : ""
      }
    </div>`;
}
/* SISA PEKERJAAN — berapa hari lagi, dan dokumen apa lagi yang kurang.

   Rincian langkah di atasnya menjawab "bagaimana angkanya didapat";
   baris ini menjawab "apa lagi yang harus terjadi". Dua pertanyaan
   berbeda, dan yang kedua justru yang paling sering ditanyakan orang
   yang sedang mengejar barang. */

function sisaPekerjaanHtml(src, d) {
  const hari = (d.steps || []).reduce((n, l) => n + (l.days || 0), 0);
  const sisa = typeof remainingMilestonesOf === "function"
    ? remainingMilestonesOf(src)
    : [];
  return `
    <div class="pred-remaining">
      <span>${tt(`<b>${hari}</b> hari proses tersisa`, `<b>${hari}</b> processing days left`)}</span>
      ${
        sisa.length
          ? `<span class="pred-muted">· ${tt("Belum dikonfirmasi", "Not yet confirmed")}: ${escapeHtml(sisa.map((m) => m.label).join(", "))}</span>`
          : `<span class="pred-muted">${t("c.semua.milestone.sudah.dikonfirmasi")}</span>`
      }
    </div>`;
}
/* Sumber Estimated Delivery ditampilkan bersama acuannya. */

function deliveryBaseHtml(d) {
  return d && d.baseLabel
    ? `<span class="pred-muted">· ${tt("Acuan", "Basis")}: ${escapeHtml(d.baseLabel)} ${fmtDate(d.base)}</span>`
    : "";
}
