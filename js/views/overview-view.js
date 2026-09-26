"use strict";

/* HALAMAN RINGKASAN */

const OV_TASK_LIMIT = 8;
/* Halaman daftar "Perlu Tindakan" yang sedang dilihat. */
let ovTaskPage = 1;

/* ANTREAN TINDAKAN */
function buildTaskQueue() {
  const out = [];
  currentList().forEach((s) => {
    if (isArrived(s)) return;
    const st = boardState(s);
    const kurang = missingDocs(s);

    // Status DELAY selalu masuk antrean, walau tanggal barunya masih di depan
    if (s.status === "delayed") {
      const info = shipmentDelayInfo(s);
      const mundur = info && info.days > 0 ? info.days : null;
      out.push({
        kind: "late",
        reason: mundur ? t("w.reason.mundur", { n: mundur }) : t("w.reason.delay"),
        rank: 2000 + (mundur || 0),
        s,
        detail: info
          ? `${info.basis} ${fmtDate(info.from)} → ${fmtDate(info.to)}${kurang.length ? t("w.belum.ada.daftar", { x: kurang.join(", ") }) : ""}`
          : t("w.ditandai.delay.tanpa.tanggal"),
      });
      return;
    }

    if (st.kind === "late") {
      out.push({
        kind: "late",
        reason: t("w.reason.telat", { n: Math.abs(st.days) }),
        rank: 1000 - st.days,
        s,
        /* Berkas yang belum ada IKUT disebut, sama seperti cabang
           Delay & Dokumen. Kiriman yang lewat ETA justru paling
           mendesak diurus berkasnya -- tanpa daftar ini barisnya cuma
           memberi tahu "telat", bukan apa yang harus dikerjakan. */
        detail: t("w.sudah.lewat.statusnya.masih", { basis: st.basis, tgl: fmtDate(st.iso), status: statusLabel(s.status, activeMode) }) + `${
          kurang.length ? t("w.belum.ada.daftar", { x: kurang.join(", ") }) : ""
        }`,
      });
      return;
    }
    if (st.days != null && st.days <= 2 && kurang.length) {
      out.push({
        kind: "soon",
        reason: st.days === 0 ? t("w.reason.hari.ini") : t("w.reason.hmin", { n: st.days }),
        rank: 500 - st.days,
        s,
        detail: t("w.tiba.sebentar.lagi.tapi.belum.ada", { x: kurang.join(", ") }),
      });
      return;
    }
    if (kurang.length) {
      out.push({
        kind: "doc",
        reason: t("w.reason.dokumen"),
        rank: 100 - (st.days ?? 99),
        s,
        detail: t("w.belum.ada.x", { x: kurang.join(", ") }),
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
      ? tt(`${tasks.length} hal · buku ${activeMode === "import" ? "Import" : "Export"}`, `${tasks.length} items · ${activeMode === "import" ? "Import" : "Export"} book`)
      : "";
  }

  if (!tasks.length) {
    box.innerHTML = `
      <div class="panel-empty">
        <i class="bi bi-check2-circle"></i>
        ${tt("Tidak ada yang tertunda. Semua jadwal di buku ini masih sesuai rencana dan dokumennya lengkap.",
            "Nothing pending. Every schedule in this book is on plan and its documents are complete.")}
      </div>`;
    return;
  }

  /* Halaman aktif dijepit ke jumlah yang ADA -- daftarnya menyusut
     sendiri begitu satu tugas diselesaikan, dan tanpa penjepitan
     layarnya jadi kosong padahal tugas lain masih menunggu. */
  const totalHalaman = Math.max(1, Math.ceil(tasks.length / OV_TASK_LIMIT));
  ovTaskPage = Math.min(Math.max(1, ovTaskPage), totalHalaman);
  const mulai = (ovTaskPage - 1) * OV_TASK_LIMIT;
  const potong = tasks.slice(mulai, mulai + OV_TASK_LIMIT);

  box.innerHTML =
    potong
      .map((t) => {
        /* Nomor B/L penelusuran: label mengikuti MODA, bukan tetap
           "HBL". Kiriman udara memakai House Air Waybill (HAWB) --
           menyebutnya HBL membuat nomornya dicari di sistem yang
           salah saat menghubungi forwarder. */
        const labelHouse = t.s.transport === "udara" ? "HAWB" : "HBL";
        const punyaHouse = hasMeaningfulValue(t.s.houseBL);
        /* Nama barang di baris ketiga: satu nama saja. Baris ini untuk
           mengenali "kiriman yang mana", bukan menampilkan isi
           lengkapnya -- daftar penuhnya ada di kartunya sendiri. */
        const barang = itemNamesSummary(t.s, 1)[0];
        return `
      <button type="button" class="task task--${t.kind}" data-ov-open="${t.s.id}"${
          punyaHouse ? ` data-ov-house="${escapeAttr(t.s.houseBL)}"` : ""
        }>
        <span class="task-reason">${escapeHtml(t.reason)}</span>
        <span class="task-main">
          <span class="task-party">${escapeHtml(dispVal(t.s.party))}</span>
          <span class="task-detail">${escapeHtml(t.detail)}${
            punyaHouse
              ? ` · ${labelHouse} <span class="mono">${escapeHtml(t.s.houseBL)}</span>`
              : ""
          }</span>
          <span class="task-goods">${escapeHtml(barang)}</span>
        </span>
        <i class="bi bi-chevron-right task-go"></i>
      </button>`;
      })
      .join("") +
    (totalHalaman > 1
      ? `<div class="task-pager">
           <button type="button" class="page-nav" data-ov-task-page="${ovTaskPage - 1}"
                   ${ovTaskPage <= 1 ? "disabled" : ""} title="${tt("Sebelumnya", "Previous")}">
             <i class="bi bi-chevron-left"></i>
           </button>
           <span class="task-pageinfo">${mulai + 1}\u2013${mulai + potong.length} ${tt("dari", "of")} ${tasks.length}</span>
           <button type="button" class="page-nav" data-ov-task-page="${ovTaskPage + 1}"
                   ${ovTaskPage >= totalHalaman ? "disabled" : ""} title="${tt("Berikutnya", "Next")}">
             <i class="bi bi-chevron-right"></i>
           </button>
         </div>`
      : "");
}

/* AGENDA 7 HARI */
function renderAgenda() {
  const box = $("#ovAgenda");
  if (!box) return;
  const list = currentList();
  const note = $("#ovAgendaNote");
  /* BASISNYA ESTIMATED DELIVERY, bukan ETA/ETD.

     Agenda ini menjawab "hari apa barang sampai di pabrik" — itu yang
     menentukan kesiapan penerimaan. ETA cuma kedatangan di
     pelabuhan/bandara; jaraknya ke pabrik bisa berhari-hari karena
     masih menunggu berkas dan pengantaran darat.

     Label kolomnya ikut ML() supaya jadi "Stuffing" di buku Export --
     field yang sama, arti yang berbeda per buku. */
  const lblBasis = ML().actual;
  if (note) {
    note.textContent = t("x.berdasarkan.klik.menyaring", { basis: lblBasis });
  }

  const html = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(todayISO(), i);
    const dt = parseLocalDate(iso);
    const n = list.filter((s) => !isArrived(s) && s.actual === iso).length;
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
        <span class="agenda-dow">${dt.toLocaleDateString(activeLang === "en" ? "en-GB" : "id-ID", { weekday: "short" })}</span>
        <span class="agenda-date">${dt.getDate()}</span>
        <span class="agenda-count ${n ? "has" : ""}">${n}</span>
      </button>`);
  }
  box.innerHTML = html.join("");
}

/* PANTAUAN DELAY */
function renderDelayWatch() {
  const box = $("#ovDelay");
  if (!box) return;
  const delayed = currentList().filter((s) => s.status === "delayed");

  if (!delayed.length) {
    box.innerHTML = `
      <div class="panel-empty">
        <i class="bi bi-emoji-smile"></i>
        ${tt("Tidak ada pengiriman berstatus DELAY.", "No shipments with DELAY status.")}
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
      <span class="stat-line-label"><i class="bi bi-hourglass-split"></i> ${tt("Sedang delay", "Currently delayed")}</span>
      <span class="stat-line-value is-alert">${delayed.length}</span>
    </div>
    <div class="stat-line">
      <span class="stat-line-label"><i class="bi bi-calendar-x"></i> ${tt("Total hari mundur", "Total days delayed")}</span>
      <span class="stat-line-value">${tt(`${total} hari`, `${total} days`)}</span>
    </div>
    ${
      terparah
        ? `<div class="stat-line">
             <span class="stat-line-label"><i class="bi bi-arrow-down-right"></i> ${tt("Paling lama", "Longest")}</span>
             <span class="stat-line-value">${tt(`${terparah.info.days} hari`, `${terparah.info.days} days`)}</span>
           </div>
           <div class="task task--late" style="border-bottom:0;padding-right:0">
             <span class="task-main">
               <span class="task-party">${escapeHtml(dispVal(terparah.s.party))}</span>
               <span class="task-detail">${terparah.info.basis} ${fmtDate(terparah.info.from)} → ${fmtDate(terparah.info.to)}</span>
             </span>
           </div>`
        : ""
    }`;
}

/* KELENGKAPAN DOKUMEN */
function renderDocCompleteness() {
  const box = $("#ovDocs");
  if (!box) return;
  const aktif = currentList().filter((s) => !isArrived(s));
  if (!aktif.length) {
    box.innerHTML = `<div class="panel-empty"><i class="bi bi-inbox"></i> ${t("v.belum.ada.pengiriman.aktif")}</div>`;
    return;
  }
  const lengkap = aktif.filter((s) => !missingDocs(s).length).length;
  const persen = Math.round((lengkap / aktif.length) * 100);
  const fillCls =
    persen >= 80 ? "" : persen >= 50 ? "meter-fill--warn" : "meter-fill--danger";

  /* Dihitung dari TAHAPAN STEPPER, sumber yang sama dengan
     missingDocs() -- kalau panel ini memakai daftar sendiri, angkanya
     akan berbeda dari daftar "Perlu Tindakan" di sebelahnya tanpa ada
     yang bisa menjelaskan kenapa.

     Tahapnya dikumpulkan dari pengiriman yang ADA, bukan dari daftar
     tetap: Import & Export punya tahap berbeda, dan kurir ekspres
     tidak memakai Manifest sama sekali. */
  const hitung = new Map();
  aktif.forEach((s) => {
    missingDocs(s).forEach((label) => {
      hitung.set(label, (hitung.get(label) || 0) + 1);
    });
  });
  const perField = [...hitung.entries()]
    .map(([label, kurang]) => ({ label, kurang }))
    .sort((a, b) => b.kurang - a.kurang)
    .slice(0, 6);

  box.innerHTML = `
    <div class="stat-line" style="border-bottom:0;padding-bottom:2px">
      <span class="stat-line-label"><i class="bi bi-file-earmark-check"></i> ${tt("Lengkap", "Complete")}</span>
      <span class="stat-line-value">${lengkap}/${aktif.length} · ${persen}%</span>
    </div>
    <div class="meter"><div class="meter-fill ${fillCls}" style="width:${persen}%"></div></div>
    <div style="margin-top:12px">
      ${perField
        .map(
          (f) => `
        <div class="stat-line">
          <span class="stat-line-label">${escapeHtml(f.label)}</span>
          <span class="stat-line-value ${f.kurang ? "is-alert" : "is-quiet"}">${f.kurang ? tt(`${f.kurang} kosong`, `${f.kurang} missing`) : tt("lengkap", "complete")}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

/* PENGGAMBARAN HALAMAN */
function renderOverview() {
  const lbl = ML();
  paintTodayStamps();

  const tasks = buildTaskQueue();
  const judul = $("#ovTitle");
  const sub = $("#ovSub");
  if (judul) {
    judul.textContent = tasks.length
      ? t("x.hal.perlu.ditindak", { n: tasks.length })
      : tt("Semua terkendali hari ini", "Everything under control today");
  }
  if (sub) {
    /* Dulu lewat presetCounts().all — sejak "Semua" berarti "belum
       Arrived" (bukan lagi segala status), c.all bukan total lagi.
       Dihitung langsung di sini supaya "N pengiriman" tetap TOTAL yang
       sebenarnya, bukan cuma yang belum tiba. */
    const list = currentList();
    const totalSemua = list.length;
    const jatuhHariIni = list.filter(
      (s) => !isArrived(s) && boardState(s).kind === "today",
    ).length;
    const selesai = list.filter((s) => isArrived(s)).length;
    const buku = activeMode === "import" ? "Import" : "Export";
    sub.innerHTML = tt(
      `Buku <b>${buku}</b> · <b>${totalSemua}</b> pengiriman · <b>${jatuhHariIni}</b> jatuh hari ini · <b>${selesai}</b> selesai`,
      `<b>${buku}</b> book · <b>${totalSemua}</b> shipments · <b>${jatuhHariIni}</b> due today · <b>${selesai}</b> done`,
    );
  }
  const qa = $("#ovQaNewLabel");
  if (qa) qa.textContent = lbl.addBtn;

  renderTaskQueue();
  renderAgenda();
  renderDelayWatch();
  renderDocCompleteness();
}

/* PENGKABELAN — setiap baris berujung pada tindakan */
const ovRoot = $("#viewOverview");
if (ovRoot) {
  ovRoot.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-ov-open]");
    if (openBtn) {
      // Panel detail hanya bisa dibuka dari halaman Jadwal (urutan telusurnya mengikuti daftar)
      location.hash = "#/";
      /* Punya nomor House B/L -> BUKA DAFTAR yang sudah disaring ke
         nomor itu, bukan panel detail. Nomor B/L unik per kiriman,
         jadi hasilnya tepat satu kartu -- dengan seluruh kendali
         kartu (ubah status, salin, cetak) yang tidak ada di panel
         detail. */
      const house = openBtn.dataset.ovHouse;
      if (house) {
        location.hash = "#/";
        setTimeout(() => jumpToSearch(house), 60);
        return;
      }
      setTimeout(() => openDetailView(openBtn.dataset.ovOpen), 60);
      return;
    }

    const pageBtn = e.target.closest("[data-ov-task-page]");
    if (pageBtn) {
      ovTaskPage = Number(pageBtn.dataset.ovTaskPage) || 1;
      renderTaskQueue();
      return;
    }

    const dayBtn = e.target.closest("[data-ov-date]");
    if (dayBtn) {
      location.hash = "#/";
      /* Basis "actual" = Estimated Delivery, sama dengan yang dipakai
         menghitung badge di atas. Kalau keduanya berbeda, angka di
         lencana tidak akan cocok dengan jumlah kartu yang muncul
         sesudah diklik. */
      setTimeout(() => jumpToDateFilter("actual", dayBtn.dataset.ovDate), 60);
      return;
    }

    const act = e.target.closest("[data-ov-action]");
    if (!act) return;
    const which = act.dataset.ovAction;
    if (which === "new") {
      location.hash = "#/new";
    } else if (which === "late") {
      location.hash = "#/";
      setTimeout(() => setOnlyNeedsAction(true), 60);
    } else if (which === "export") {
      location.hash = "#/";
      setTimeout(() => $("#btnBulkExport").click(), 60);
    }
  });
}
