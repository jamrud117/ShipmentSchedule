"use strict";

/* ==================================================================
   PREDIKSI DI FORM — keadaan & interaksi

   Menyimpan mode ETA/Delivery yang sedang berlaku di form, memasang
   pendengar pada isian yang mempengaruhi prediksi, dan menyegarkan
   panelnya.

   Tidak ada tombol "hitung ulang": perubahan masukan itu sendiri yang
   menggerakkan hitungannya. Menambah isian yang berpengaruh cukup
   menambah namanya di ETA_INPUT_FIELDS — DAN di predictionFormSource(),
   yang ada uji penjaganya.

   Pembangun HTML-nya ada di js/render/prediction-view.js.
==================================================================== */

/* ==================================================================
   TAMPILAN MESIN PREDIKSI

   Tiga tempat memakai hasil hitungan yang sama:

     form    ETA otomatis/manual + rincian bagaimana Estimated Delivery
             sampai pada angkanya
     kartu   satu baris ringkas: tanggal, sumber, tingkat keyakinan
     detail  rincian penuh, hanya baca

   Semua angkanya datang dari js/core/prediction.js. Berkas ini tidak
   menghitung apa pun sendiri — ia hanya menggambar.
================================================================== */

/* Kolom yang, kalau berubah, MENGUBAH ETA hasil hitungan.
   Persis daftar pada permintaan fitur: ETD, tipe pengiriman, rute,
   direct/transit. */

const ETA_INPUT_FIELDS = [
  "fEtd",
  // Nama kapal & no. voyage MENGUBAH ETA sekarang: dari keduanya
  // carrier terdeteksi, dan carrier menentukan lama transit.
  "fVessel",
  "fVoyage",
  "fTransport",
  "fMuatan",
  "fRouteType",
  "fOrigin",
  "fDestination",
  "fForwarder",
];
/* Progres dokumen milik jadwal yang SEDANG dibuka di form. Tidak ada
   di isian mana pun (tahap dokumen dikonfirmasi dari kartu), jadi
   dititipkan di sini supaya prediksi di dalam form ikut memperhitungkan
   milestone yang sudah terkumpul. */

let formDocProgress = {};
/* Penjaga: saat mesin yang mengisi kotak ETA, event `change` yang
   terpicu TIDAK boleh dibaca sebagai "pengguna mengetik manual". */

let predSedangMengisi = false;
/* Mode ETA yang sedang berlaku di form. Disimpan terpisah dari kotak
   isian karena ia bukan nilai, melainkan cara nilainya diperoleh. */

let formEtaMode = "auto";
/* Mode Estimated Delivery yang sedang berlaku di form. */

let formDeliveryMode = "auto";
function predictionAktifDiForm() {
  return activeMode !== "export";
}
/* Objek serupa-shipment dari isian form yang belum tersimpan. */

function predictionFormSource() {
  return {
    mode: activeMode,
    etd: $("#fEtd").value,
    eta: $("#fEta").value,
    etaUpdate: $("#fEtaUpdate").value,
    /* Tanpa baris ini, prediksi di dalam form mengabaikan ETD delay
       sepenuhnya — kapal berangkat lima hari lebih lambat, panel tetap
       menghitung dari jadwal rencana. Objek ini harus memuat SETIAP
       kolom yang dibaca engine; yang tertinggal tidak akan bersuara,
       cuma diam-diam dianggap kosong. */
    etdUpdate: $("#fEtdUpdate").value,
    etaMode: formEtaMode,
    transport: $("#fTransport").value,
    muatan: $("#fMuatan").value,
    routeType: $("#fRouteType").value,
    origin: $("#fOrigin").value,
    destination: $("#fDestination").value,
    forwarder: $("#fForwarder").value,
    // Dibaca deteksi carrier — tanpa ini carrier tidak pernah terdeteksi
    // di dalam form, dan rute per-pelayaran tidak akan pernah terpakai.
    vessel: $("#fVessel") ? $("#fVessel").value : "",
    voyage: $("#fVoyage") ? $("#fVoyage").value : "",
    actual: $("#fActual").value,
    factoryDate: $("#fFactoryDate").value,
    deliveryMode: formDeliveryMode,
    docProgress: formDocProgress,
  };
}
/* ==================================================================
   FORM
================================================================== */

function setFormEtaMode(mode, opsi) {
  const o = opsi || {};
  formEtaMode = mode === "manual" ? "manual" : "auto";
  $$("#etaModeSwitch .eta-mode-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.etaMode === formEtaMode),
  );
  const chip = $("#etaModeChip");
  if (chip) chip.outerHTML = etaModeChipHtml(formEtaMode).replace("<span", '<span id="etaModeChip"');
  sembunyikanNoticeEta();
  if (o.recalc !== false) hitungUlangEtaForm({ paksa: formEtaMode === "auto" });
  syncPredictionForm();
}
function sembunyikanNoticeEta() {
  const el = $("#etaManualNotice");
  if (el) el.classList.add("d-none");
}
function tampilkanNoticeEta() {
  const el = $("#etaManualNotice");
  if (el) el.classList.remove("d-none");
}
/* Mengisi kotak ETA dari mesin. `paksa` dipakai saat pengguna memang
   meminta hitung ulang; tanpa itu, mode manual tidak pernah disentuh. */

function hitungUlangEtaForm(opsi) {
  const o = opsi || {};
  if (!predictionAktifDiForm()) return;
  if (formEtaMode !== "auto" && !o.paksa) return;

  const p = predictEta(predictionFormSource());
  if (!p.ok || !p.eta) return;

  predSedangMengisi = true;
  $("#fEta").value = p.eta;
  predSedangMengisi = false;

  if (typeof syncFormValidity === "function") syncFormValidity();
  if (typeof applyDelayFieldVisibility === "function") applyDelayFieldVisibility();
}
/* Estimated Delivery di buku Import adalah hasil hitungan, bukan isian.
   Kotaknya dikunci supaya tidak ada dua sumber kebenaran yang
   bertengkar — yang mengubahnya adalah milestone, bukan ketikan. */

function isiEstimatedDeliveryForm() {
  const el = $("#fActual");
  if (!el) return null;
  if (!predictionAktifDiForm()) return null;

  const d = predictDelivery(predictionFormSource());
  /* Mode manual: nilainya milik pengguna, jangan disentuh —

     KECUALI kalau yang mengembalikan tanggal itu Tanggal In Factory.
     Itu bukan hasil hitungan yang menimpa pilihan pengguna, melainkan
     fakta yang menggantikan perkiraan tentang fakta yang sama. Mode
     Manual menahan mesin dari MENGHITUNG ULANG; ia tidak dimaksudkan
     untuk menahan kenyataan.

     Tanpa pengecualian ini, jadwal bermode Manual tetap menampilkan
     perkiraan lama walau barangnya sudah diterima — dan itu keadaan
     yang paling sering, karena tanggal yang sudah dipatok tangan
     jarang disentuh lagi. */
  if (formDeliveryMode !== "manual" || d.source === "actual") {
    el.value = d.ok ? d.date : "";
  }
  return d;
}
function setFormDeliveryMode(mode, opsi) {
  const o = opsi || {};
  formDeliveryMode = mode === "manual" ? "manual" : "auto";
  $$("#deliveryModeSwitch .eta-mode-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.deliveryMode === formDeliveryMode),
  );
  const chip = $("#deliveryModeChip");
  if (chip) {
    chip.outerHTML = deliveryModeChipHtml(formDeliveryMode).replace(
      "<span",
      '<span id="deliveryModeChip"',
    );
  }
  if (o.sync !== false) syncPredictionForm();
}
/* Saat Estimated Delivery dikunci manual, hitungan mesin tetap
   ditampilkan sebagai PEMBANDING — bukan untuk menimpanya.

   Mengestimasi manual bukan berarti mengabaikan mesin: yang dibutuhkan
   justru angka pembandingnya, supaya terlihat sedang memundurkan berapa
   hari dari perkiraan sistem. Menyembunyikannya membuat penguncian
   terasa seperti menebak dalam gelap. */

function manualDeliveryRefHtml(src) {
  const d = predictDelivery(Object.assign({}, src, { deliveryMode: "auto" }));
  const dipatok = $("#fActual").value;

  let banding = "";
  if (d.ok && dipatok) {
    const selisih = calendarDaysBetweenISO(d.date, dipatok);
    if (selisih === 0) banding = "sama dengan hitungan mesin";
    else if (selisih > 0) banding = `${selisih} hari lebih mundur dari hitungan mesin`;
    else banding = `${Math.abs(selisih)} hari lebih maju dari hitungan mesin`;
  }

  return `
    <div class="pred-note-manual">
      <i class="bi bi-lock-fill"></i> Tanggal dikunci untuk laporan. Mesin tidak akan menimpanya.
    </div>
    ${
      d.ok
        ? `<div class="pred-compare">
             <span class="pred-muted">Hitungan mesin saat ini:</span>
             <b>${fmtDate(d.date)}</b>
             <span class="pred-muted">· ${escapeHtml(d.sourceLabel)}</span>
             ${banding ? `<span class="pred-compare-diff">${escapeHtml(banding)}</span>` : ""}
           </div>`
        : ""
    }`;
}
function syncPredictionForm() {
  const blok = $("#predictionBlock");
  const alih = $("#etaModeSwitch");
  const aktif = predictionAktifDiForm();

  if (blok) blok.classList.toggle("d-none", !aktif);
  if (alih) alih.classList.toggle("d-none", !aktif);

  const el = $("#fActual");
  if (el) {
    /* Sengaja TIDAK read-only. Kalau terpikir menguncinya supaya tidak
       ada dua sumber kebenaran: laporan memang butuh tanggal yang bisa
       dipatok, dan jawabannya mode Manual — bukan kotak yang mati. */
    el.readOnly = false;
    el.title = aktif && formDeliveryMode === "auto"
      ? "Dihitung otomatis dari ETA & milestone dokumen. Ketik untuk mengunci tanggalnya (mode Manual)."
      : "";
  }
  const alihDel = $("#deliveryModeSwitch");
  if (alihDel) alihDel.classList.toggle("d-none", !aktif);
  const hint = $("#actualAutoHint");
  if (hint) hint.classList.toggle("d-none", !aktif);

  if (!aktif) {
    const panel = $("#predictionPanel");
    if (panel) panel.innerHTML = "";
    return;
  }

  const d = isiEstimatedDeliveryForm();
  const src = predictionFormSource();
  const e = predictEta(src);
  const tipe = predictionShipmentTypeLabel(predictionShipmentType(src));

  const panel = $("#predictionPanel");
  if (!panel) return;

  const revisi = predictEtaRevised(src);
  const barisDelay = revisi
    ? `<div class="pred-delay-line"><i class="bi bi-clock-history"></i>
         ETD Delay ${fmtDate(revisi.etdUsed)} → ETA <b>${fmtDate(revisi.eta)}</b>
         <span class="pred-muted">${
           $("#fEtaUpdate").value
             ? "· Update ETA yang diisi yang dipakai sebagai acuan"
             : "· dipakai sebagai acuan proses darat"
         }</span></div>`
    : "";

  const barisEta = e.ok
    ? `ETD ${fmtDate(e.ctx.etd)} + <b>${predDaysText(e)} kalender</b> → <b>${fmtDate(e.eta)}</b>
       <span class="pred-muted">(${escapeHtml(e.ruleLabel)} · ${e.kind === "transit" ? "Transit" : "Direct"})</span>
       ${transitSourceHtml(e)}
       ${e.hasRange ? predRangeHtml(e.etaEarliest, e.etaLatest, "Paling cepat–paling lambat") : ""}`
    : `<span class="pred-muted">${escapeHtml(e.reason)}</span>`;

  const rute = resolveRouteLayer(src);
  panel.innerHTML = `
    <div class="pred-panel-head">
      <span><i class="bi bi-graph-up-arrow"></i> Mesin Prediksi</span>
      <span class="pred-panel-type">${escapeHtml(tipe)}${predictionTypeIsAssumed(src) ? " · muatan belum diisi" : ""}</span>
    </div>
    <div class="pred-layer">
      <span class="pred-layer-tag">Lapis 0 · Rute</span>
      ${routeLayerHtml(rute)}
    </div>
    <div class="pred-panel-grid">
      <div class="pred-panel-col">
        <div class="pred-panel-label"><span class="pred-layer-tag">Lapis 1</span> Prediksi ETA ${etaModeChipHtml(formEtaMode)}</div>
        <div class="pred-panel-val">${barisEta}</div>
        ${barisDelay}
        ${
          formEtaMode === "manual" && e.ok && e.eta !== $("#fEta").value
            ? `<div class="pred-muted mt-1">Hitungan mesin ${fmtDate(e.eta)} — ETA manual dibiarkan apa adanya.</div>`
            : ""
        }
      </div>
      <div class="pred-panel-col">
        <div class="pred-panel-label">
          <span class="pred-layer-tag">Lapis 2–4</span> Estimated Delivery
          ${deliveryModeChipHtml(formDeliveryMode)}
          ${d && d.ok ? confidenceChipHtml(d.confidence, "") : ""}
        </div>
        <div class="pred-panel-val">
          ${
            d && d.ok
              ? `<b>${fmtDate(d.date)}</b> <span class="pred-muted">· Sumber: ${escapeHtml(d.sourceLabel)}</span>
                 ${deliveryBaseHtml(d)}
                 ${d.range ? predRangeHtml(d.range.earliest, d.range.latest, "Paling cepat–paling lambat") : ""}`
              : `<span class="pred-muted">${escapeHtml((d && d.reason) || "Belum bisa dihitung.")}</span>`
          }
        </div>
        ${
          d && d.shifted
            ? `<div class="pred-late"><i class="bi bi-clock-history"></i> Perkiraan sebelumnya sudah terlewat ${d.overdueDays} hari — dasar hitungan digeser ke hari ini${d.delayBuffer ? `, plus penyangga ${d.delayBuffer} hari kerja` : ""}.</div>`
            : ""
        }
        ${d && d.ok && !d.arrived && formDeliveryMode !== "manual" ? predStepsHtml(d) : ""}
        ${d && d.ok && !d.arrived ? sisaPekerjaanHtml(src, d) : ""}
        ${formDeliveryMode === "manual" ? manualDeliveryRefHtml(src) : ""}
        ${d && d.arrived ? `<div class="pred-note-final"><i class="bi bi-check-circle-fill"></i> Tanggal In Factory sudah terisi — perkiraan digantikan tanggal sebenarnya.</div>` : ""}
      </div>
    </div>`;
}
/* ------------------------------------------------------------------
   PEMASANGAN PENDENGAR

   Tidak ada tombol "hitung ulang". Perubahan masukan langsung
   menggerakkan hitungannya.
------------------------------------------------------------------ */

ETA_INPUT_FIELDS.forEach((idf) => {
  const el = $("#" + idf);
  if (!el) return;
  const dengar = () => {
    if (!predictionAktifDiForm()) return;
    if (formEtaMode === "manual") {
      /* Mode manual: mesin TIDAK boleh menimpa. Pengguna yang
         memutuskan — sesuai permintaan fitur. */
      tampilkanNoticeEta();
    } else {
      hitungUlangEtaForm();
    }
    syncPredictionForm();
  };
  el.addEventListener("change", dengar);
  if (el.tagName === "INPUT") el.addEventListener("input", dengar);
});
/* Mengetik di kotak ETA = ETA dari forwarder. Modenya berpindah sendiri
   ke Manual, dan itu dikatakan lewat toast supaya tidak terasa seperti
   aplikasi diam-diam mengubah setelan. */

const elEtaForm = $("#fEta");
if (elEtaForm) {
  elEtaForm.addEventListener("change", () => {
    if (predSedangMengisi || !predictionAktifDiForm()) return;
    if (formEtaMode === "auto" && $("#fEta").value) {
      setFormEtaMode("manual", { recalc: false });
      showToast("ETA diketik manual — mode ETA berpindah ke Manual.", "dark");
      return;
    }
    syncPredictionForm();
  });
}

// In Factory diisi -> perkiraan berhenti, digantikan tanggal itu.
const elFactoryForm = $("#fFactoryDate");
if (elFactoryForm) {
  elFactoryForm.addEventListener("change", syncPredictionForm);
}
/* Kotak Tanggal Update Delay. Isinya tetap milik pengguna sepenuhnya —
   mesin tidak pernah menulisinya — tapi Estimated Delivery memang
   bertumpu pada ETA yang BERLAKU (etaUpdate kalau ada), jadi angkanya
   harus ikut bergerak begitu jadwal dimundurkan. */

["fEtaUpdate", "fEtdUpdate"].forEach((idf) => {
  const el = $("#" + idf);
  if (el) el.addEventListener("change", syncPredictionForm);
});
const alihEta = $("#etaModeSwitch");
if (alihEta) {
  alihEta.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-eta-mode]");
    if (!btn) return;
    setFormEtaMode(btn.dataset.etaMode);
  });
}
const alihDelivery = $("#deliveryModeSwitch");
if (alihDelivery) {
  alihDelivery.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delivery-mode]");
    if (!btn) return;
    setFormDeliveryMode(btn.dataset.deliveryMode);
    if (btn.dataset.deliveryMode === "auto") {
      showToast("Estimated Delivery dihitung ulang otomatis.", "success");
    }
  });
}
/* Mengetik di kotak Estimated Delivery = tanggal yang sengaja dipatok.
   Modenya berpindah sendiri ke Manual, sama seperti perilaku ETA. */

const elActualForm = $("#fActual");
if (elActualForm) {
  elActualForm.addEventListener("change", () => {
    if (predSedangMengisi || !predictionAktifDiForm()) return;
    if (formDeliveryMode === "auto" && $("#fActual").value) {
      const d = predictDelivery(
        Object.assign(predictionFormSource(), { deliveryMode: "auto" }),
      );
      // Hanya berpindah kalau nilainya BEDA dari hitungan mesin.
      if (!d.ok || d.date !== $("#fActual").value) {
        setFormDeliveryMode("manual");
        showToast("Estimated Delivery dikunci — mode berpindah ke Manual.", "dark");
      }
    }
  });
}
const btnKeep = $("#btnKeepManualEta");
if (btnKeep) {
  btnKeep.addEventListener("click", () => {
    sembunyikanNoticeEta();
    syncPredictionForm();
  });
}
const btnRecalc = $("#btnRecalcEtaAuto");
if (btnRecalc) {
  btnRecalc.addEventListener("click", () => {
    setFormEtaMode("auto");
    showToast("ETA dihitung ulang otomatis.", "success");
  });
}
/* ------------------------------------------------------------------
   DIPANGGIL FORM SAAT DIBUKA
------------------------------------------------------------------ */

function initPredictionForm(s) {
  formDocProgress = (s && s.docProgress) || {};
  formEtaMode = s ? etaModeOf(s) : "auto";
  sembunyikanNoticeEta();
  $$("#etaModeSwitch .eta-mode-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.etaMode === formEtaMode),
  );
  const chip = $("#etaModeChip");
  if (chip)
    chip.outerHTML = etaModeChipHtml(formEtaMode).replace(
      "<span",
      '<span id="etaModeChip"',
    );
  setFormDeliveryMode(s ? deliveryModeOf(s) : "auto", { sync: false });
  // Jadwal BARU dengan mode auto: ETA langsung terisi begitu ETD diketik
  if (!s && formEtaMode === "auto") hitungUlangEtaForm();
  syncPredictionForm();
}
/* ==================================================================
   PERUBAHAN DARI KARTU

   ETD di kartu bisa diubah langsung. Kalau ETA-nya manual, pengguna
   harus memutuskan — sama seperti di form, hanya wadahnya kotak dialog
   karena di kartu tidak ada tempat untuk spanduk.
================================================================== */
async function handleCardDateChange(s, field) {
  // ETA dihitung ulang di KEDUA buku; yang import-saja cuma Estimated Delivery.
  if (!etaPredictionAppliesTo(s)) return;

  const mempengaruhiEta = field === "etd";
  if (mempengaruhiEta && etaModeOf(s) === "manual") {
    showConfirm(
      `ETA jadwal ini sedang dalam Mode Manual (${fmtDate(s.eta)}). ETD baru tidak otomatis mengubahnya.`,
      async () => {
        s.etaMode = "auto";
        await persistFields(s.id, { etaMode: "auto" });
        await refreshShipmentPrediction(s);
        showToast("ETA dihitung ulang otomatis.", "success");
      },
      {
        title: "ETA Mode Manual",
        confirmText: "Hitung Ulang Otomatis",
        cancelText: "Pertahankan ETA Manual",
        tone: "primary",
        icon: "bi-magic",
      },
    );
    // Estimated Delivery tetap disegarkan memakai ETA manual yang berlaku
    await refreshShipmentPrediction(s);
    return;
  }

  /* Mengetik Estimated Delivery di kartu = tanggal yang sengaja
     dipatok untuk laporan. Dikunci ke Manual supaya milestone
     berikutnya tidak diam-diam menggesernya lagi. */
  if (field === "actual") {
    if (deliveryModeOf(s) === "auto" && s.actual) {
      s.deliveryMode = "manual";
      await persistFields(s.id, { deliveryMode: "manual" });
      showToast("Estimated Delivery dikunci (mode Manual).", "dark");
      render();
    }
    return;
  }

  /* Mengetik ETA langsung di kartu = angka dari forwarder. */
  if (field === "eta" && etaModeOf(s) === "auto" && s.eta) {
    s.etaMode = "manual";
    await persistFields(s.id, { etaMode: "manual" });
    showToast("ETA diketik manual — mode ETA jadwal ini berpindah ke Manual.", "dark");
  }

  await refreshShipmentPrediction(s);
}
