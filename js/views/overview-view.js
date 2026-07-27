"use strict";

/* ==================================================================
   HALAMAN RINGKASAN

   Menjawab pertanyaan pertama tiap pagi: apa yang harus dikerjakan
   hari ini. Semua yang tampil di sini dihitung dari data yang sudah
   ada — tidak ada satu pun kolom baru di database.

   Aturan yang dipegang: setiap baris di halaman ini harus BISA
   DIKLIK dan berujung pada tindakan. Ringkasan yang cuma bisa
   dipandangi hanya menambah satu layar untuk dilewati.
================================================================== */

const OV_TASK_LIMIT = 8;

/* ------------------------------------------------------------------
   ANTREAN TINDAKAN

   Tiga alasan, diurutkan dari yang paling mendesak:
     TELAT  sudah lewat tanggalnya & belum ditandai selesai
     DEKAT  jatuh dalam 2 hari tapi dokumennya belum lengkap
     DOKUMEN  bidang wajib masih kosong

   Alasannya ditulis terus terang di kolom kiri. Tanpa itu, daftar
   ini cuma jadi daftar kedua yang harus ditafsirkan sendiri.
------------------------------------------------------------------ */
function buildTaskQueue() {
  const out = [];
  currentList().forEach((s) => {
    if (s.status === "arrived") return;
    const st = boardState(s);
    const kurang = missingDocs(s);

    // Status DELAY selalu masuk antrean, walau tanggal barunya masih di
    // depan. Metrik "perlu tindakan" sudah menghitungnya (lihat
    // needsAction() di ui/board.js); kalau halaman ini tidak, angka di
    // papan dan isi antrean akan saling bertentangan — persis masalah
    // dua-sumber-kebenaran yang mau dihindari.
    if (s.status === "delayed") {
      const info = shipmentDelayInfo(s);
      const mundur = info && info.days > 0 ? info.days : null;
      out.push({
        kind: "late",
        reason: mundur ? `Mundur ${mundur}h` : "Delay",
        rank: 2000 + (mundur || 0),
        s,
        detail: info
          ? `${info.basis} ${fmtDate(info.from)} → ${fmtDate(info.to)}${kurang.length ? " · belum ada " + kurang.join(", ") : ""}`
          : `Ditandai DELAY tapi tanggal update belum diisi`,
      });
      return;
    }

    if (st.kind === "late") {
      out.push({
        kind: "late",
        reason: `Telat ${Math.abs(st.days)}h`,
        rank: 1000 - st.days,
        s,
        detail: `${st.basis} ${fmtDate(st.iso)} sudah lewat — statusnya masih ${statusLabel(s.status, activeMode)}`,
      });
      return;
    }
    if (st.days != null && st.days <= 2 && kurang.length) {
      out.push({
        kind: "soon",
        reason: st.days === 0 ? "Hari ini" : `H-${st.days}`,
        rank: 500 - st.days,
        s,
        detail: `Tiba sebentar lagi tapi belum ada ${kurang.join(", ")}`,
      });
      return;
    }
    if (kurang.length) {
      out.push({
        kind: "doc",
        reason: "Dokumen",
        rank: 100 - (st.days ?? 99),
        s,
        detail: `Belum ada ${kurang.join(", ")}`,
      });
    }
  });
  return out.sort((a, b) => b.rank - a.rank);
}

function renderTaskQueue() {
  const box = $("#ovTasks");
  const note = $("#ovTaskNote");
  if (!box) return;
  const tasks = buildTaskQueue();

  if (note) {
    note.textContent = tasks.length
      ? `${tasks.length} hal · buku ${activeMode === "import" ? "Import" : "Export"}`
      : "";
  }

  if (!tasks.length) {
    box.innerHTML = `
      <div class="panel-empty">
        <i class="bi bi-check2-circle"></i>
        Tidak ada yang tertunda. Semua jadwal di buku ini masih sesuai
        rencana dan dokumennya lengkap.
      </div>`;
    return;
  }

  box.innerHTML = tasks
    .slice(0, OV_TASK_LIMIT)
    .map(
      (t) => `
      <button type="button" class="task task--${t.kind}" data-ov-open="${t.s.id}">
        <span class="task-reason">${escapeHtml(t.reason)}</span>
        <span class="task-main">
          <span class="task-party">${escapeHtml(dispVal(t.s.party))}</span>
          <span class="task-detail">${escapeHtml(t.detail)} · <span class="mono">${escapeHtml(dispVal(t.s.docNo))}</span></span>
        </span>
        <i class="bi bi-chevron-right task-go"></i>
      </button>`,
    )
    .join("") +
    (tasks.length > OV_TASK_LIMIT
      ? `<button type="button" class="task" data-ov-action="late">
           <span class="task-reason"></span>
           <span class="task-main"><span class="task-detail">+${tasks.length - OV_TASK_LIMIT} lagi — buka daftar lengkapnya</span></span>
           <i class="bi bi-arrow-right task-go"></i>
         </button>`
      : "");
}

/* ------------------------------------------------------------------
   AGENDA 7 HARI

   Papan mini: tiap kolom satu hari, angkanya jumlah pengiriman yang
   jatuh pada hari itu menurut dasar yang sedang dipakai (ETA/ETD).
   Diklik = halaman Jadwal terbuka, sudah tersaring ke tanggal itu.
------------------------------------------------------------------ */
function renderAgenda() {
  const box = $("#ovAgenda");
  if (!box) return;
  const list = currentList();
  const basisEtd = sortBasis() === "etd";
  const note = $("#ovAgendaNote");
  if (note)
    note.textContent = `Berdasarkan ${basisEtd ? "ETD" : "ETA"} · klik untuk menyaring`;

  const html = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(todayISO(), i);
    const dt = parseLocalDate(iso);
    const n = list.filter(
      (s) =>
        s.status !== "arrived" &&
        (basisEtd ? effectiveEtd(s) : effectiveEta(s)) === iso,
    ).length;
    const dow = dt.getDay();
    const cls = [
      "agenda-day",
      i === 0 ? "agenda-day--today" : "",
      dow === 0 || dow === 6 ? "agenda-day--weekend" : "",
    ]
      .filter(Boolean)
      .join(" ");
    html.push(`
      <button type="button" class="${cls}" data-ov-date="${iso}" title="${escapeAttr(fmtDateBoard(iso))}">
        <span class="agenda-dow">${dt.toLocaleDateString("id-ID", { weekday: "short" })}</span>
        <span class="agenda-date">${dt.getDate()}</span>
        <span class="agenda-count ${n ? "has" : ""}">${n}</span>
      </button>`);
  }
  box.innerHTML = html.join("");
}

/* ------------------------------------------------------------------
   PANTAUAN DELAY
------------------------------------------------------------------ */
function renderDelayWatch() {
  const box = $("#ovDelay");
  if (!box) return;
  const delayed = currentList().filter((s) => s.status === "delayed");

  if (!delayed.length) {
    box.innerHTML = `
      <div class="panel-empty">
        <i class="bi bi-emoji-smile"></i>
        Tidak ada pengiriman berstatus DELAY.
      </div>`;
    return;
  }

  const total = delayed.reduce((n, s) => {
    const info = shipmentDelayInfo(s);
    return n + (info && info.days > 0 ? info.days : 0);
  }, 0);
  const terparah = delayed
    .map((s) => ({ s, info: shipmentDelayInfo(s) }))
    .filter((x) => x.info)
    .sort((a, b) => b.info.days - a.info.days)[0];

  box.innerHTML = `
    <div class="stat-line">
      <span class="stat-line-label"><i class="bi bi-hourglass-split"></i> Sedang delay</span>
      <span class="stat-line-value is-alert">${delayed.length}</span>
    </div>
    <div class="stat-line">
      <span class="stat-line-label"><i class="bi bi-calendar-x"></i> Total hari mundur</span>
      <span class="stat-line-value">${total} hari</span>
    </div>
    ${
      terparah
        ? `<div class="stat-line">
             <span class="stat-line-label"><i class="bi bi-arrow-down-right"></i> Paling lama</span>
             <span class="stat-line-value">${terparah.info.days} hari</span>
           </div>
           <div class="task task--late" style="border-bottom:0;padding-left:0;padding-right:0">
             <span class="task-main">
               <span class="task-party">${escapeHtml(dispVal(terparah.s.party))}</span>
               <span class="task-detail">${terparah.info.basis} ${fmtDate(terparah.info.from)} → ${fmtDate(terparah.info.to)}</span>
             </span>
           </div>`
        : ""
    }`;
}

/* ------------------------------------------------------------------
   KELENGKAPAN DOKUMEN
------------------------------------------------------------------ */
function renderDocCompleteness() {
  const box = $("#ovDocs");
  if (!box) return;
  const aktif = currentList().filter((s) => s.status !== "arrived");
  if (!aktif.length) {
    box.innerHTML = `<div class="panel-empty"><i class="bi bi-inbox"></i> Belum ada pengiriman aktif.</div>`;
    return;
  }
  const lengkap = aktif.filter((s) => !missingDocs(s).length).length;
  const persen = Math.round((lengkap / aktif.length) * 100);
  const fillCls =
    persen >= 80 ? "" : persen >= 50 ? "meter-fill--warn" : "meter-fill--danger";

  const perField = REQUIRED_DOC_FIELDS.map((f) => ({
    label: f.label,
    kurang: aktif.filter((s) => !hasMeaningfulValue(s[f.key])).length,
  }));

  box.innerHTML = `
    <div class="stat-line" style="border-bottom:0;padding-bottom:2px">
      <span class="stat-line-label"><i class="bi bi-file-earmark-check"></i> Lengkap</span>
      <span class="stat-line-value">${lengkap}/${aktif.length} · ${persen}%</span>
    </div>
    <div class="meter"><div class="meter-fill ${fillCls}" style="width:${persen}%"></div></div>
    <div style="margin-top:12px">
      ${perField
        .map(
          (f) => `
        <div class="stat-line">
          <span class="stat-line-label">${escapeHtml(f.label)}</span>
          <span class="stat-line-value ${f.kurang ? "is-alert" : "is-quiet"}">${f.kurang ? `${f.kurang} kosong` : "lengkap"}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

/* ------------------------------------------------------------------
   PENGGAMBARAN HALAMAN
------------------------------------------------------------------ */
function renderOverview() {
  const lbl = ML();
  paintTodayStamps();

  const tasks = buildTaskQueue();
  const judul = $("#ovTitle");
  const sub = $("#ovSub");
  if (judul) {
    judul.textContent = tasks.length
      ? `${tasks.length} hal perlu ditindak hari ini`
      : "Semua terkendali hari ini";
  }
  if (sub) {
    const c = presetCounts();
    sub.innerHTML = `Buku <b>${activeMode === "import" ? "Import" : "Export"}</b> · <b>${c.all}</b> pengiriman · <b>${c.today}</b> jatuh hari ini · <b>${c.done}</b> selesai`;
  }
  const qa = $("#ovQaNewLabel");
  if (qa) qa.textContent = lbl.addBtn;

  renderTaskQueue();
  renderAgenda();
  renderDelayWatch();
  renderDocCompleteness();
}

/* ------------------------------------------------------------------
   PENGKABELAN — setiap baris berujung pada tindakan
------------------------------------------------------------------ */
const ovRoot = $("#viewOverview");
if (ovRoot) {
  ovRoot.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-ov-open]");
    if (openBtn) {
      // Panel detail hanya bisa dibuka dari halaman Jadwal (urutan
      // telusurnya mengikuti daftar), jadi pindah dulu ke sana.
      location.hash = "#/";
      setTimeout(() => openDetailView(openBtn.dataset.ovOpen), 60);
      return;
    }

    const dayBtn = e.target.closest("[data-ov-date]");
    if (dayBtn) {
      location.hash = "#/";
      setTimeout(() => setPreset("all", { date: dayBtn.dataset.ovDate }), 60);
      return;
    }

    const act = e.target.closest("[data-ov-action]");
    if (!act) return;
    const which = act.dataset.ovAction;
    if (which === "new") {
      location.hash = "#/new";
    } else if (which === "late") {
      location.hash = "#/";
      setTimeout(() => setPreset("late"), 60);
    } else if (which === "export") {
      location.hash = "#/";
      setTimeout(() => $("#btnBulkExport").click(), 60);
    }
  });
}
