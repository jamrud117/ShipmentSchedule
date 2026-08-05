"use strict";

/* LANE / TRANSPORT ICON */
/* Posisi penanda pada jalur = bagian waktu yang sudah dilewati antara
   ETD dan ETA.

   JANGAN menambahkan jalan pintas berdasarkan status di sini. Status
   "process" menempel pada hampir seluruh pengiriman, jadi cabang apa
   pun yang mengembalikan nilai tetap untuknya akan mematikan seluruh
   perhitungan tanggal di bawah ini tanpa terlihat rusak.

   Tanggal yang dipakai adalah tanggal EFEKTIF: kalau jadwal sudah
   dimundurkan, jalurnya ikut memanjang mengikuti tanggal barunya. */
function laneProgress(s) {
  if (isArrived(s)) return 1;

  const etd = parseLocalDate(effectiveEtd(s));
  const eta = parseLocalDate(effectiveEta(s));
  if (!etd || !eta) return 0;

  const today = parseLocalDate(todayISO());
  // Belum berangkat = benar-benar 0. Kalau penandanya terlihat
  // menggantung di tepi, itu urusan CSS — bukan urusan angka ini.
  if (today <= etd) return 0;
  // Sudah sampai terminal, menunggu diantar ke pabrik.
  if (today >= eta) return 0.96;

  const total = eta - etd;
  if (total <= 0) return 0.5;
  return Math.min(0.94, Math.max(0.04, (today - etd) / total));
}

/* Keterangan jalur dalam tiga tahap:
     sebelum ETD   -> menunggu berangkat
     ETD .. ETA    -> dalam perjalanan ke terminal/bandara
     setelah ETA   -> menunggu diantar ke pabrik
   Diringkas supaya muat di satu baris di sebelah judul jalur. */
function laneRemainingLabel(s) {
  if (isArrived(s)) return "Selesai";

  const etd = parseLocalDate(effectiveEtd(s));
  const eta = parseLocalDate(effectiveEta(s));
  const today = parseLocalDate(todayISO());
  const hari = (a, b) => Math.round((b - a) / 86400000);
  const simpul = s.transport === "udara" ? "Bandara" : "Terminal";

  if (etd && today < etd) {
    const n = hari(today, etd);
    return `Berangkat ${n} Hari Lagi`;
  }
  if (etd && eta && today >= etd && today < eta) {
    const n = hari(today, eta);
    return n === 0
      ? `Sampai ${simpul} Hari Ini`
      : `Sampai ${simpul} ${n} Hari Lagi`;
  }
  if (eta && today >= eta) {
    if (s.actual) {
      const n = hari(today, parseLocalDate(s.actual));
      if (n > 0) return `Diantar ${n} Hari Lagi`;
      if (n === 0) return "Diantar Hari Ini";
    }
    const telat = hari(eta, today);
    return telat > 0 ? `Di ${simpul} · Telat ${telat} Hari` : `Di ${simpul}`;
  }
  if (etd && today.getTime() === etd.getTime()) return "Berangkat Hari Ini";
  return "";
}
/* Lambang moda digambar sebagai SVG, bukan emoji.

   Emoji ✈️ dan 🚢 arah hadapnya berbeda-beda antar sistem operasi —
   ada yang serong kanan-atas, ada yang mendatar — sehingga tidak ada
   satu sudut putar yang benar untuk semuanya. Sudut 90 derajat yang
   dipakai sebelumnya membuat pesawatnya menghadap ke BAWAH pada
   sebagian mesin.

   Kedua gambar di bawah sudah menghadap lurus ke kanan, searah jalur,
   jadi tidak perlu diputar sama sekali. */
const ICON_PESAWAT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 12c0 .6-.5 1.1-1.1 1.1h-4.3l-3.4 5.5a1 1 0 0 1-.9.5h-1.5l1.9-6H8.2l-1.4 2H5l1-3.1-1-3.1h1.8l1.4 2h4.1l-1.9-6h1.5c.4 0 .7.2.9.5l3.4 5.5h4.3c.6 0 1.1.5 1.1 1.1z"/></svg>';
const ICON_KAPAL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 9.6h5.1v3.3H6.2zM12.6 10.8h2v2.1h-2z"/><path d="M2.6 14.2h13.7l4.8 2.7-1.4 2.8H5.3z"/></svg>';

function iconForMode(mode) {
  return mode === "udara" ? ICON_PESAWAT : ICON_KAPAL;
}

/* RUTE TRANSIT (multi-terminal) */
function routeStopList(s) {
  return Array.isArray(s.routeStops) ? s.routeStops : [];
}
function isTransitRoute(s) {
  return s.routeType === "transit" && routeStopList(s).length > 0;
}

// Susun titik-titik rute secara urut: asal -> tiap terminal transit -> tujuan.
function buildRouteNodes(s) {
  /* Jadwal lama menyimpan "IDTPP", jadwal baru menyimpan "TPP".
     Diseragamkan saat DIGAMBAR, bukan lewat migrasi database — tidak
     ada gunanya menulis ulang ribuan baris hanya untuk mengubah
     tampilan, dan resolvePortEntry() tetap mengenali dua-duanya. */
  const nodes = [{ kind: "origin", terminal: portCodeLabel(s.origin), date: s.etd }];
  routeStopList(s).forEach((st) => {
    nodes.push({
      kind: "stop",
      terminal: st.terminal,
      arrivalDate: st.arrivalDate,
      departureDate: st.departureDate,
      date: st.arrivalDate || st.departureDate || "",
      transport: st.transport,
      vessel: st.vessel,
      voyage: st.voyage,
    });
  });
  nodes.push({ kind: "destination", terminal: portCodeLabel(s.destination), date: s.eta });
  return nodes;
}

// Ubah tanggal tiap titik jadi posisi 0..1 di sepanjang lane
function computeNodeFractions(nodes) {
  const n = nodes.length;
  const times = nodes.map((nd) => {
    const dt = parseLocalDate(nd.date);
    return dt ? dt.getTime() : null;
  });
  if (times[0] == null) times[0] = 0;
  if (times[n - 1] == null) times[n - 1] = times[0] + 1;

  for (let i = 1; i < n - 1; i++) {
    if (times[i] != null) continue;
    let left = i - 1;
    while (left > 0 && times[left] == null) left--;
    let right = i + 1;
    while (right < n - 1 && times[right] == null) right++;
    const span = right - left || 1;
    const frac = (i - left) / span;
    times[i] = times[left] + (times[right] - times[left]) * frac;
  }

  const minT = times[0];
  const maxT = times[n - 1];
  let fractions;
  if (!isFinite(maxT - minT) || maxT <= minT) {
    fractions = nodes.map((_, i) => i / (n - 1));
  } else {
    fractions = times.map((t) =>
      Math.min(1, Math.max(0, (t - minT) / (maxT - minT))),
    );
  }
  // Jaga urutan selalu maju supaya titik di rute tidak pernah terlihat mundur ke kiri walau ada
  for (let i = 1; i < n; i++) {
    if (fractions[i] < fractions[i - 1]) fractions[i] = fractions[i - 1];
  }
  return fractions;
}

// Leg mana yang sedang berjalan sekarang, berdasar posisi progress keseluruhan
function activeLegIndex(fractions, progress) {
  let idx = 0;
  for (let i = 0; i < fractions.length - 1; i++) {
    if (progress >= fractions[i]) idx = i;
  }
  return idx;
}

// Alat angkut yang dipakai utk 1 leg tertentu
function transportForLeg(s, nodes, legIndex) {
  const lastLegIndex = nodes.length - 2;
  if (legIndex >= lastLegIndex) {
    return { mode: s.transport, vessel: s.vessel, voyage: s.voyage };
  }
  const arrivingNode = nodes[legIndex + 1];
  return {
    mode: arrivingNode.transport || s.transport,
    vessel: arrivingNode.vessel,
    voyage: arrivingNode.voyage,
  };
}

// Satu fungsi terpusat dipakai baik saat render awal card maupun saat refresh posisi berkala
function computeLaneModel(s) {
  const nodes = buildRouteNodes(s);
  const fractions = computeNodeFractions(nodes);
  const progress = laneProgress(s);
  const legIdx = activeLegIndex(fractions, progress);
  const leg = transportForLeg(s, nodes, legIdx);
  const icon = iconForMode(leg.mode);
  return { nodes, fractions, progress, legIdx, leg, icon };
}

// Teks rute lengkap (dipakai di info-grid card & detail view).
function routeChainText(s) {
  if (!isTransitRoute(s)) {
    return `${dispVal(portCodeLabel(s.origin))} → ${dispVal(portCodeLabel(s.destination))}`;
  }
  const names = [
    s.origin,
    ...routeStopList(s).map((st) => st.terminal),
    s.destination,
  ];
  return names.map((nm) => dispVal(nm)).join(" → ");
}

function laneNodeTitle(nd) {
  const parts = [dispVal(nd.terminal)];
  if (nd.kind === "stop") {
    if (nd.arrivalDate) parts.push("Tiba " + fmtDate(nd.arrivalDate));
    if (nd.departureDate) parts.push("Berangkat " + fmtDate(nd.departureDate));
    if (hasMeaningfulValue(nd.vessel))
      parts.push(
        (nd.transport === "udara" ? "Pesawat " : "Vessel ") + nd.vessel,
      );
    if (hasMeaningfulValue(nd.voyage))
      parts.push(
        (nd.transport === "udara" ? "No. Flight " : "No. Voyage ") + nd.voyage,
      );
  } else {
    parts.push(fmtDate(nd.date));
  }
  return escapeAttr(parts.join(" · "));
}

// Render seluruh isi ".lane" (judul + track + label tanggal)
function assignLabelRows(fractions) {
  const MIN_GAP = 0.12;
  const lastInRow = [-Infinity, -Infinity];
  return fractions.map((f) => {
    const row = f - lastInRow[0] >= MIN_GAP ? 0 : 1;
    lastInRow[row] = f;
    return row;
  });
}

function buildLaneHtml(s) {
  const lane = computeLaneModel(s);
  const { nodes, fractions, progress, icon } = lane;
  const laneClass =
    s.status === "delayed"
      ? "is-delayed"
      : s.status === "process"
        ? "is-process"
        : "";
  /* Kelas penggerak penanda, ditentukan KEADAAN NYATA: bergerak kalau
     sudah berangkat dan belum sampai pabrik.

     Jangan mengaitkannya ke nilai `status` tertentu — daftar status
     berubah, dan animasi yang bergantung pada status yang sudah tidak
     ditawarkan tidak akan pernah berjalan tanpa ada yang menyadari.

     Ragam geraknya mengikuti moda ruas yang sedang dilalui (laut
     bergoyang, udara mengambang). */
  const bergerak = !isArrived(s) && progress > 0.05 && progress < 1;
  const markerClass = [
    progress <= 0.001 ? "at-start" : "",
    progress >= 0.999 ? "at-end" : "",
    bergerak ? "is-moving" : "",
    lane.leg && lane.leg.mode === "udara" ? "is-air" : "is-sea",
  ]
    .filter(Boolean)
    .join(" ");
  const multi = nodes.length > 2;

  const dotsHtml = nodes
    .map((nd, i) => {
      const kindClass =
        i === 0 ? "origin" : i === nodes.length - 1 ? "destination" : "stop";
      const reached = fractions[i] <= progress + 0.0001 ? " reached" : "";
      return `<div class="port-node ${kindClass}${reached}" style="left:${fractions[i] * 100}%" title="${laneNodeTitle(nd)}"></div>`;
    })
    .join("");

  const labelRows = multi ? assignLabelRows(fractions) : [];
  const labelsHtml = !multi
    ? `
      <div class="port-labels">
        <div class="p">ETD <b>${fmtDate(s.etd)}</b></div>
        <div class="p text-end">ETA <b>${fmtDate(s.eta)}</b></div>
      </div>`
    : `
      <div class="port-labels port-labels--multi">
        ${nodes
          .map((nd, i) => {
            const align =
              i === 0 ? "start" : i === nodes.length - 1 ? "end" : "center";
            const top = labelRows[i] * 36;
            return `<div class="p p--node p--${align}" style="left:${fractions[i] * 100}%; top:${top}px">
              <span class="p-term" title="${escapeAttr(dispVal(nd.terminal))}">${escapeHtml(dispVal(nd.terminal))}</span>
              <b>${fmtDate(nd.date)}</b>
            </div>`;
          })
          .join("")}
      </div>`;

  let delayFlag = "";
  const today = new Date();
  /* ETA yang BERLAKU, bukan ETA rencana.

     Kotak Tanggal Update Delay berisi jadwal BARU setelah mundur.
     Memakai ETA rencana membuat papan berteriak "melewati ETA" untuk
     kiriman yang justru sudah dimundurkan secara resmi — dan angka
     harinya jadi 0, karena hari ini memang baru saja melewatinya. */
  const etaDate = parseLocalDate(s.etaUpdate || s.eta);
  /* Yang dilihat di sini adalah tanggal KEJADIAN, bukan perkiraan.

     Sebelum ada mesin prediksi, `actual` di buku Import memang kosong
     sampai seseorang mengisinya, jadi memakainya sebagai penanda
     "belum sampai" masih masuk akal. Sekarang kolom itu SELALU terisi
     hasil hitungan — kalau tetap dipakai, penanda telat ini tidak akan
     pernah muncul lagi.

     Import ditandai selesai oleh In Factory; Export oleh Stuffing. */
  const belumTiba = s.mode === "export" ? !s.actual : !s.factoryDate;
  if (belumTiba && !isArrived(s) && etaDate && today > etaDate) {
    const d = daysBetween(etaDate, today);
    delayFlag = `<div class="delay-flag"><i class="bi bi-exclamation-triangle-fill"></i> Melewati ETA ${d} hari</div>`;
  }

  return `
    <div class="lane-title mt-3">
      Progres Pengiriman
      <span class="lane-remaining">${escapeHtml(laneRemainingLabel(s))}</span>
    </div>
    <div class="lane-track ${laneClass}">
      <div class="lane-fill" style="width:${progress * 100}%"></div>
      ${dotsHtml}
      <div class="ship-marker ${markerClass}" style="left:${progress * 100}%" title="${escapeAttr(Math.round(progress * 100) + "% perjalanan · " + laneRemainingLabel(s))}"><span class="marker-trail"><span></span><span></span><span></span></span><span class="marker-icon">${icon}</span></div>
    </div>
    ${labelsHtml}
    ${delayFlag}`;
}

/* Auto-arrive (status otomatis pindah ke ARRIVED saat ETA lewat/hari */
