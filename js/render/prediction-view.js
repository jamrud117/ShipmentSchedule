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

function confidenceChipHtml(conf, prefix) {
  if (!conf) return "";
  /* Persen DAN label. Persen sendirian terkesan lebih tepat daripada
     yang sebenarnya; label sendirian menyembunyikan bahwa 79% dan 89%
     dua hal yang berbeda. Alasan hitungannya ditaruh di title supaya
     bisa ditelusuri tanpa memenuhi layar. */
  const rinci = (conf.reasons || [])
    .map((r) => `${r.delta > 0 ? "+" : ""}${r.delta}% ${r.text}`)
    .join("\n");
  const persen = conf.percent != null ? `${conf.percent}% · ` : "";
  return `<span class="pred-conf pred-conf--${conf.tone}"${rinci ? ` title="${escapeHtml(rinci)}"` : ""}>${escapeHtml((prefix || "") + persen + conf.label)}</span>`;
}
function deliveryModeChipHtml(mode) {
  const manual = mode === "manual";
  return `<span class="eta-mode-chip eta-mode-chip--${manual ? "manual" : "auto"}">
    <i class="bi ${manual ? "bi-lock-fill" : "bi-magic"}"></i> ${escapeHtml(deliveryModeLabel(mode))}
  </span>`;
}
/* Ringkasan Lapis 0. Kalau ETA terlihat aneh, pertanyaan pertamanya
   selalu "rutenya kebaca benar tidak" — dan ini yang menjawabnya. */

function routeLayerHtml(rute) {
  const bagian = [];
  const sisi = (kode, nama, negara) =>
    kode
      ? `<b>${escapeHtml(kode)}</b>${nama ? ` <span class="pred-muted">${escapeHtml(nama)}</span>` : ""}`
      : `<span class="pred-muted">belum dikenali</span>`;
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
  const manual = mode === "manual";
  return `<span class="eta-mode-chip eta-mode-chip--${manual ? "manual" : "auto"}">
    <i class="bi ${manual ? "bi-pencil-fill" : "bi-magic"}"></i> ${escapeHtml(etaModeLabel(mode))}
  </span>`;
}
/* Rentang ditulis sebagai kalimat pendek, bukan angka telanjang.
   "18-08-2026 – 24-08-2026" tanpa keterangan mudah dibaca terbalik
   sebagai dua tanggal berbeda yang tidak berhubungan. */

function predRangeHtml(dari, sampai, label) {
  if (!dari || !sampai || dari === sampai) return "";
  return `<span class="pred-range"><i class="bi bi-arrows-expand-vertical"></i> ${escapeHtml(label || "Rentang")} ${fmtDate(dari)} – ${fmtDate(sampai)}</span>`;
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

  if (tr.learned) {
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--learned" title="${escapeHtml(
        `Rata-rata ${tr.learned.avg} hari · min ${tr.learned.min} · maks ${tr.learned.max} · simpangan baku ${tr.learned.stdDev} · ${tr.learned.dropped} pencilan dibuang · metode ${tr.learned.method}`,
      )}"><i class="bi bi-mortarboard-fill"></i> Riwayat ${tr.learned.samples} pengiriman${tr.learned.scope === "carrier" ? " (pelayaran ini)" : ""} · ${tr.learned.min}–${tr.learned.max} hari</span>`,
    );
  }
  /* Riwayat yang BELUM cukup tetap ditulis. Tanpa ini, pengguna cuma
     melihat fitur yang tidak pernah menyala dan menyangkanya rusak —
     padahal ia sedang mengumpulkan. */
  if (tr.learningProgress) {
    const lp = tr.learningProgress;
    const teks =
      lp.reason === "terlalu berayun"
        ? `Riwayat ${lp.samples} kiriman terlalu berayun (galat ±${lp.stdError} hari) — asumsi konfigurasi dipakai`
        : `Riwayat ${lp.samples}/${lp.need} kiriman — belum cukup untuk dipakai`;
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--unknown"><i class="bi bi-hourglass-split"></i> ${escapeHtml(teks)}</span>`,
    );
  }
  if (tr.carrierDays) {
    const tanda = tr.carrierDays > 0 ? "+" : "";
    bagian.push(
      `<span class="pred-src-tag pred-src-tag--carrier"><i class="bi bi-truck"></i> ${tanda}${tr.carrierDays} hari — ${escapeHtml(tr.carrierLabel || "penyesuaian carrier")}</span>`,
    );
  }
  return bagian.join(" ");
}

// Lama transit: "8–12 hari" kalau rentang, "11 hari" kalau angka pasti.
function predDaysText(e) {
  return e.hasRange ? `${e.daysMin}–${e.daysMax} hari` : `${e.days} hari`;
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
        : ` <em>${st.days} ${escapeHtml(st.unit || "hari kerja")}</em>`;
    baris.push(
      `<li><span class="pred-step-label">+ ${escapeHtml(st.label)}${durasi}</span>
       <span class="pred-step-date">${fmtDate(st.to)}</span></li>`,
    );
  });
  return `<ol class="pred-steps">${baris.join("")}</ol>`;
}
/* ------------------------------------------------------------------
   BARIS RINGKAS DI KARTU
------------------------------------------------------------------ */

function predictionStripHtml(s) {
  if (!predictionAppliesTo(s)) return "";
  const d = predictDelivery(s);

  if (!d.ok) {
    return `
    <div class="pred-strip pred-strip--empty">
      <span class="pred-strip-head"><i class="bi bi-graph-up-arrow"></i> Estimated Delivery</span>
      <span class="pred-strip-note">${escapeHtml(d.reason)}</span>
    </div>`;
  }

  const modeEta = etaModeOf(s);
  return `
  <div class="pred-strip">
    <span class="pred-strip-head"><i class="bi bi-graph-up-arrow"></i> Estimated Delivery</span>
    <span class="pred-strip-date">${fmtDate(d.date)}</span>
    ${d.range ? predRangeHtml(d.range.earliest, d.range.latest) : ""}
    <span class="pred-strip-src">Sumber: <b>${escapeHtml(d.sourceLabel)}</b></span>
    ${d.source === "eta" ? etaModeChipHtml(modeEta) : ""}
    ${d.source === "manual" ? deliveryModeChipHtml("manual") : ""}
    ${confidenceChipHtml(d.confidence, "")}
    ${d.shifted ? `<span class="pred-late"><i class="bi bi-clock-history"></i> Telat ${d.overdueDays} hari — dihitung ulang dari hari ini</span>` : ""}
  </div>`;
}
/* ------------------------------------------------------------------
   BAGIAN PENUH DI PANEL DETAIL
------------------------------------------------------------------ */

function predictionDetailHtml(s) {
  if (!predictionAppliesTo(s)) return "";
  const e = predictEta(s);
  const d = predictDelivery(s);
  const mode = etaModeOf(s);
  const tipe = predictionShipmentTypeLabel(predictionShipmentType(s));

  const barisEta = e.ok
    ? `${fmtDate(e.eta)} <span class="pred-muted">(${escapeHtml(e.ruleLabel)} · ${e.kind === "transit" ? "Transit" : "Direct"} · ETD + ${predDaysText(e)} kalender)</span>
       ${e.hasRange ? predRangeHtml(e.etaEarliest, e.etaLatest) : ""}`
    : `<span class="pred-muted">${escapeHtml(e.reason)}</span>`;

  return `
    <div class="subsection-title"><i class="bi bi-graph-up-arrow"></i> Prediksi Kedatangan</div>
    <div class="pred-detail">
      <div class="pred-detail-row">
        <div class="pred-detail-key">Tipe Pengiriman</div>
        <div class="pred-detail-val">${escapeHtml(tipe)}${predictionTypeIsAssumed(s) ? ' <span class="pred-muted">(Jenis Muatan belum diisi — dianggap FCL)</span>' : ""}</div>
      </div>
      <div class="pred-detail-row">
        <div class="pred-detail-key">ETA Hitungan Mesin</div>
        <div class="pred-detail-val">${barisEta}</div>
      </div>
      <div class="pred-detail-row">
        <div class="pred-detail-key">ETA Dipakai</div>
        <div class="pred-detail-val">${fmtDate(predictionEtaBasis(s))} ${etaModeChipHtml(mode)}</div>
      </div>
      <div class="pred-detail-row">
        <div class="pred-detail-key">Estimated Delivery</div>
        <div class="pred-detail-val">
          ${d.ok ? `<b>${fmtDate(d.date)}</b>` : `<span class="pred-muted">${escapeHtml(d.reason)}</span>`}
          ${d.ok ? `<span class="pred-muted">Sumber: ${escapeHtml(d.sourceLabel)}</span> ${confidenceChipHtml(d.confidence, "Keyakinan: ")}` : ""}
          ${d.range ? predRangeHtml(d.range.earliest, d.range.latest) : ""}
        </div>
      </div>
      ${d.ok && !d.arrived ? `<div class="pred-detail-row pred-detail-row--full">${predStepsHtml(d)}</div>` : ""}
      ${d.arrived ? `<div class="pred-note-final"><i class="bi bi-check-circle-fill"></i> Barang sudah masuk pabrik — perkiraan digantikan tanggal sebenarnya.</div>` : ""}
      ${
        d.source === "manual"
          ? (() => {
              const auto = predictDelivery(Object.assign({}, s, { deliveryMode: "auto" }));
              return auto.ok
                ? `<div class="pred-detail-row"><div class="pred-detail-key">Hitungan Mesin</div>
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
      <span><b>${hari}</b> hari proses tersisa</span>
      ${
        sisa.length
          ? `<span class="pred-muted">· Belum dikonfirmasi: ${escapeHtml(sisa.map((m) => m.label).join(", "))}</span>`
          : `<span class="pred-muted">· Semua milestone sudah dikonfirmasi</span>`
      }
    </div>`;
}
/* Sumber Estimated Delivery ditampilkan bersama acuannya. */

function deliveryBaseHtml(d) {
  return d && d.baseLabel
    ? `<span class="pred-muted">· Acuan: ${escapeHtml(d.baseLabel)} ${fmtDate(d.base)}</span>`
    : "";
}
