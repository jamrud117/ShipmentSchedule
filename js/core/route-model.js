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

  const etdDate = effectiveEtd(s);
  const etaDate = effectiveEta(s);
  if (!etdDate || !etaDate) return 0;

  /* Presisi jam HANYA dipakai kalau ETD *dan* ETA dua-duanya punya jam
     terisi — satu ada satu tidak akan membandingkan jam+menit di satu
     sisi dengan tengah malam di sisi lain, lebih menyesatkan daripada
     berguna. Kalau salah satu/keduanya kosong (jadwal lama, atau
     memang belum diisi), jatuh PERSIS ke perhitungan per-hari seperti
     sebelum fitur jam ini ada — supaya jadwal yang belum pernah
     mengisi jam tidak diam-diam berubah perilakunya. */
  const punyaJam = !!(s.etdTime && s.etaTime);
  const etd = punyaJam
    ? parseLocalDateTime(etdDate, s.etdTime)
    : parseLocalDate(etdDate);
  const eta = punyaJam
    ? parseLocalDateTime(etaDate, s.etaTime)
    : parseLocalDate(etaDate);
  if (!etd || !eta) return 0;

  const now = punyaJam ? new Date() : parseLocalDate(todayISO());
  // Belum berangkat = benar-benar 0. Kalau penandanya terlihat
  // menggantung di tepi, itu urusan CSS — bukan urusan angka ini.
  if (now <= etd) return 0;
  // Sudah sampai terminal, menunggu diantar ke pabrik.
  if (now >= eta) return 0.96;

  const total = eta - etd;
  if (total <= 0) return 0.5;
  return Math.min(0.94, Math.max(0.04, (now - etd) / total));
}

/* Keterangan jalur dalam tiga tahap:
     sebelum ETD   -> menunggu berangkat
     ETD .. ETA    -> dalam perjalanan ke terminal/bandara
     setelah ETA   -> menunggu diantar ke pabrik
   Diringkas supaya muat di satu baris di sebelah judul jalur. */
function laneRemainingLabel(s) {
  if (isArrived(s)) return tt("Selesai", "Done");

  const etd = parseLocalDate(effectiveEtd(s));
  const eta = parseLocalDate(effectiveEta(s));
  const today = parseLocalDate(todayISO());
  const hari = (a, b) => Math.round((b - a) / 86400000);
  const simpul = s.transport === "udara" ? tt("Bandara", "Airport") : "Terminal";

  if (etd && today < etd) {
    const n = hari(today, etd);
    return tt(`Berangkat ${n} Hari Lagi`, `Departs in ${n} Day${n === 1 ? "" : "s"}`);
  }
  if (etd && eta && today >= etd && today < eta) {
    const n = hari(today, eta);
    return n === 0
      ? tt(`Sampai ${simpul} Hari Ini`, `Arrives at ${simpul} Today`)
      : tt(`Sampai ${simpul} ${n} Hari Lagi`, `Arrives at ${simpul} in ${n} Day${n === 1 ? "" : "s"}`);
  }
  if (eta && today >= eta) {
    if (s.actual) {
      const n = hari(today, parseLocalDate(s.actual));
      if (n > 0) return tt(`Diantar ${n} Hari Lagi`, `Delivered in ${n} Day${n === 1 ? "" : "s"}`);
      if (n === 0) return t("c.diantar.hari.ini");
    }
    const telat = hari(eta, today);
    return telat > 0
    ? tt(`Di ${simpul} · Telat ${telat} Hari`, `At ${simpul} · ${telat} Day${telat === 1 ? "" : "s"} Late`)
    : tt(`Di ${simpul}`, `At ${simpul}`);
  }
  if (etd && today.getTime() === etd.getTime()) return t("c.berangkat.hari.ini");
  return "";
}
/* Lambang moda digambar sebagai SVG, bukan emoji.

   Emoji ✈️ dan 🚢 arah hadapnya berbeda-beda antar sistem operasi —
   ada yang serong kanan-atas, ada yang mendatar — sehingga tidak ada
   satu sudut putar yang benar untuk semuanya.

   Kedua gambar di bawah sudah menghadap lurus ke kanan, searah jalur,
   jadi tidak perlu diputar sama sekali. */
/* Lambang moda — MULTI-WARNA (bukan cuma currentColor) supaya terasa
   lebih hidup/bergambar, bukan garis tunggal datar. fill eksplisit di
   tiap elemen MENANG atas fill:currentColor yang diwariskan dari
   .marker-icon svg di card.css — presentation attribute pada elemen
   itu sendiri selalu didahulukan atas nilai yang diwariskan dari
   induk. Bentuk dasarnya tidak diubah (sudah terbukti benar &
   menghadap kanan), cuma ditambah warna & sedikit detail (jendela,
   bendera). */
const ICON_PESAWAT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--p-600)" d="M21.6 12c0 .6-.5 1.1-1.1 1.1h-4.3l-3.4 5.5a1 1 0 0 1-.9.5h-1.5l1.9-6H8.2l-1.4 2H5l1-3.1-1-3.1h1.8l1.4 2h4.1l-1.9-6h1.5c.4 0 .7.2.9.5l3.4 5.5h4.3c.6 0 1.1.5 1.1 1.1z"/><circle cx="11.3" cy="12" r="0.7" fill="var(--p-300)"/><circle cx="13.6" cy="12" r="0.7" fill="var(--p-300)"/></svg>';
const ICON_KAPAL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--p-700)" d="M2.6 14.2h13.7l4.8 2.7-1.4 2.8H5.3z"/><path fill="var(--p-300)" d="M6.2 9.6h5.1v3.3H6.2zM12.6 10.8h2v2.1h-2z"/><rect x="8.5" y="7.2" width="0.6" height="2.6" fill="var(--sec-500)"/><path fill="var(--sec-400)" d="M9.1 7.2l2.4.9-2.4.9z"/></svg>';
/* Mobil — ANTAR DARAT ke pabrik, setelah tiba di terminal/bandara
   (lihat sudahTibaTerminal() di bawah). Dibangun dari bentuk dasar
   (rect + circle), bukan path custom seperti dua di atas — supaya
   pasti tergambar benar tanpa perlu menghitung kurva jalur tangan. */
const ICON_MOBIL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7.5" width="9" height="4.5" rx="1" fill="var(--p-300)"/><rect x="3" y="12" width="18" height="3.5" rx="1" fill="var(--sec-400)"/><circle cx="7.5" cy="16.5" r="1.8" fill="var(--p-700)"/><circle cx="16.5" cy="16.5" r="1.8" fill="var(--p-700)"/></svg>';

function iconForMode(mode) {
  return mode === "udara" ? ICON_PESAWAT : ICON_KAPAL;
}

/* Sudah tiba di terminal/bandara tujuan (lewat ETA-nya), menunggu
   diantar ke pabrik — leg AKHIR perjalanan sekarang darat, jadi
   penandanya ganti jadi mobil, apa pun moda internasionalnya (udara
   atau laut). Dipakai bersama, bukan diulang: computeLaneModel() (buat
   ikonnya) dan laneProgress() (batas 0,96 — lihat komentarnya sendiri
   di atas) harus selalu sepakat kapan fase ini dimulai, kalau tidak
   ikonnya bisa ganti mobil padahal penandanya masih di tengah jalur,
   atau sebaliknya. */
function sudahTibaTerminal(s) {
  if (isArrived(s)) return true;
  const etaDate = effectiveEta(s);
  if (!etaDate) return false;
  // Sama persis dengan laneProgress() -- keduanya harus selalu sepakat
  // kapan fase "sudah di terminal" dimulai, kalau tidak ikon & posisi
  // penanda bisa berselisih (satu bilang sudah, satu bilang belum).
  const punyaJam = !!(s.etdTime && s.etaTime);
  const eta = punyaJam
    ? parseLocalDateTime(etaDate, s.etaTime)
    : parseLocalDate(etaDate);
  if (!eta) return false;
  const now = punyaJam ? new Date() : parseLocalDate(todayISO());
  return now >= eta;
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
  const nodes = [
    { kind: "origin", terminal: portCodeLabel(s.origin), date: effectiveEtd(s) },
  ];
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
  nodes.push({
    kind: "destination",
    terminal: portCodeLabel(s.destination),
    date: effectiveEta(s),
  });
  return nodes;
}

// Ubah tanggal tiap titik jadi posisi 0..1 di sepanjang lane
function computeNodeFractionsRaw(nodes) {
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

/* JARAK MINIMUM ANTAR SIMPUL

   Posisi simpul dihitung dari TANGGALNYA, dan itu memang yang
   diinginkan — transit yang jatuh di akhir perjalanan harus terlihat di
   akhir. Tapi tanggal transit sering SAMA dengan tanggal berangkat:
   sambungan hari yang sama, atau tanggal transit yang memang dicatat
   sama dengan keberangkatan.

   Waktu tempuhnya nol, jadi pecahannya nol juga — simpul transit
   mendarat persis di atas simpul asal. Titiknya bertumpuk dan
   labelnya terpaksa turun ke baris kedua:

     TSN 13-08          <- asal
     SIN 13-08          <- transit, tertumpuk di bawahnya
                                            CGK 15-08

   Rute tiga pelabuhan jadi terbaca seperti dua, dan yang paling ingin
   dilihat orang — DI MANA barangnya sekarang — justru hilang.

   Simpul yang berdempetan didorong terpisah sampai sejauh JARAK_MIN,
   dari kiri lalu dirapikan dari kanan supaya yang terakhir tidak
   terdorong melewati 1. Urutannya tidak pernah berubah: yang bergeser
   hanya jarak antar simpul, bukan siapa mendahului siapa.

   0,14 kira-kira selebar satu label pada kartu tersempit — sedikit di
   atas ambang 0,12 yang dipakai assignLabelRows() untuk memutuskan
   penumpukan, jadi label tidak perlu turun baris lagi. */
const LANE_JARAK_MIN = 0.14;

/* Simpul yang tanggalnya SAMA PERSIS dibagi rata.

   Kalau dua simpul jatuh di pecahan yang identik, tanggalnya tidak
   memberi tahu apa pun tentang posisi — waktu tempuhnya nol. Mendorong
   yang belakangan sejauh jarak minimum akan menaruhnya di 0,14: lepas
   dari tumpukan, tapi mengaku-ngaku bahwa transitnya "di awal
   perjalanan" padahal datanya tidak berkata begitu.

   Yang jujur adalah membaginya rata di antara simpul berbeda yang
   mengapitnya: TSN · SIN · CGK jadi 0 · 0,5 · 1. Itu menyatakan
   "tiga pelabuhan, urutannya begini" tanpa mengarang ketepatan yang
   tidak ada.

   Simpul yang tanggalnya memang berbeda TIDAK disentuh di sini —
   posisinya masih membawa keterangan, dan yang dibutuhkannya cuma
   ruang, yang diberikan beriJarakMinimum() di bawah. */
function ratakanSimpulSeri(f) {
  const n = f.length;
  const out = f.slice();
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && out[j + 1] === out[i]) j++;
    if (j > i) {
      const kiri = out[i];
      const kanan = j + 1 < n ? out[j + 1] : 1;
      const langkah = (kanan - kiri) / (j + 1 - i);
      for (let k = i + 1; k <= j; k++) out[k] = kiri + langkah * (k - i);
    }
    i = j + 1;
  }
  return out;
}

function beriJarakMinimum(f) {
  const n = f.length;
  if (n < 3) return f;
  /* Yang seri dibagi rata DULU; sisanya tinggal diberi ruang. */
  const out = ratakanSimpulSeri(f);
  /* Kalau simpulnya terlalu banyak untuk diberi jarak segitu, jarak
     dibagi rata — memaksakan 0,14 akan mendorong semuanya keluar. */
  const jarak = Math.min(LANE_JARAK_MIN, 1 / (n - 1));

  for (let i = 1; i < n; i++) {
    if (out[i] - out[i - 1] < jarak) out[i] = out[i - 1] + jarak;
  }
  /* Dorongan di atas bisa melewati ujung kanan. Dirapikan mundur:
     simpul terakhir dikembalikan ke 1, lalu yang di kirinya digeser
     seperlunya. Simpul pertama tetap di 0. */
  out[n - 1] = 1;
  for (let i = n - 2; i > 0; i--) {
    if (out[i + 1] - out[i] < jarak) out[i] = out[i + 1] - jarak;
    if (out[i] < 0) out[i] = 0;
  }
  return out;
}

/* Memetakan posisi berbasis waktu ke skala simpul yang sudah diberi
   jarak.

   Tanpa ini penanda kapal dan titik pelabuhan memakai dua skala
   berbeda: kapal yang baru berangkat akan tampak SUDAH MELEWATI
   transit, karena transitnya digeser ke tengah sementara kapalnya
   tidak. Pemetaannya sepotong-sepotong per ruas, jadi kapal selalu
   berada di ruas yang benar dan pada bagian yang sebanding di
   dalamnya. */
function petakanProgres(progress, asli, baru) {
  const n = asli.length;
  if (n < 3 || !isFinite(progress)) return progress;
  for (let i = 0; i < n - 1; i++) {
    const a = asli[i];
    const b = asli[i + 1];
    if (progress > b && i < n - 2) continue;
    const rentang = b - a;
    const bagian = rentang > 0 ? (progress - a) / rentang : 0;
    const hasil = baru[i] + (baru[i + 1] - baru[i]) * Math.min(1, Math.max(0, bagian));
    return Math.min(1, Math.max(0, hasil));
  }
  return progress;
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
  const asli = computeNodeFractionsRaw(nodes);
  const fractions = beriJarakMinimum(asli);
  /* Ruas yang sedang dilalui ditentukan dari pecahan ASLI — itu yang
     berbasis waktu. Yang dipetakan hanya posisi gambarnya. */
  const progresWaktu = laneProgress(s);
  const legIdx = activeLegIndex(asli, progresWaktu);
  const progress = petakanProgres(progresWaktu, asli, fractions);
  const leg = transportForLeg(s, nodes, legIdx);
  // Mobil begitu sudah tiba terminal/bandara — lihat sudahTibaTerminal() di atas.
  const icon = sudahTibaTerminal(s) ? ICON_MOBIL : iconForMode(leg.mode);
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
    if (nd.arrivalDate) parts.push(tt("Tiba ", "Arrives ") + fmtDate(nd.arrivalDate));
    if (nd.departureDate) parts.push(tt("Berangkat ", "Departs ") + fmtDate(nd.departureDate));
    if (hasMeaningfulValue(nd.vessel))
      parts.push(
        (nd.transport === "udara" ? tt("Pesawat ", "Aircraft ") : "Vessel ") + nd.vessel,
      );
    if (hasMeaningfulValue(nd.voyage))
      parts.push(
        (nd.transport === "udara" ? tt("No. Flight ", "Flight No. ") : tt("No. Voyage ", "Voyage No. ")) + nd.voyage,
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
    // Mobil dapat jejak & gerak sendiri (is-road) — bukan is-air/is-sea
    // ruas internasionalnya, yang tidak lagi cocok begitu sudah ganti
    // ikon (goyangan kapal & semburan pesawat tidak masuk akal untuk mobil).
    sudahTibaTerminal(s) ? "is-road" : lane.leg && lane.leg.mode === "udara" ? "is-air" : "is-sea",
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
        <!-- TANGGAL EFEKTIF, bukan tanggal awal.

             Penanda di jalur sudah dihitung dari tanggal update delay
             (lihat laneProgress di atas), jadi label yang menyebut
             tanggal ASLI membuat keduanya saling membantah: penanda
             menunjukkan perjalanan baru dimulai, sementara labelnya
             menyebut ETD yang sudah lewat seminggu. Yang dibaca orang
             harus tanggal yang sama dengan yang dipakai menghitung. -->
        <div class="p">ETD <b>${fmtDate(effectiveEtd(s))}${s.etdTime ? " · " + escapeHtml(s.etdTime) : ""}</b></div>
        <div class="p text-end">ETA <b>${fmtDate(effectiveEta(s))}${s.etaTime ? " · " + escapeHtml(s.etaTime) : ""}</b></div>
      </div>`
    : `
      <div class="port-labels port-labels--multi">
        ${nodes
          .map((nd, i) => {
            /* Perataan mengikuti POSISI, bukan urutan simpul.

               Meratakan berdasar urutan (pertama kiri, terakhir kanan,
               sisanya tengah) salah begitu ada transit yang jatuh dekat
               tepi: label rata-tengah menjorok separuh lebarnya keluar
               kartu.

               Ambangnya 12% / 88%, kira-kira selebar label pada kartu
               tersempit. Simpul pertama & terakhir tetap kena aturan
               yang sama karena posisinya memang 0% dan 100%. */
            const f = fractions[i];
            const align = f <= 0.12 ? "start" : f >= 0.88 ? "end" : "center";
            const top = labelRows[i] * 36;
            return `<div class="p p--node p--${align}" style="left:${fractions[i] * 100}%; top:${top}px">
              <span class="p-term" title="${escapeAttr(dispVal(nd.terminal))}">${escapeHtml(dispVal(nd.terminal))}</span>
              <b>${fmtDate(nd.date)}</b>
            </div>`;
          })
          .join("")}
      </div>`;

  /* TIDAK ADA LAGI PENANDA "MELEWATI ETA".

     Dua alasan, dan yang kedua yang menentukan.

     Pertama, ia salah hitung: `new Date()` membawa jam sementara ETA
     tengah malam, jadi pada hari-H perbandingannya sudah benar dan
     penandanya menyala sehari lebih awal — "Melewati ETA 1 hari" pada
     tanggal ETA-nya sendiri.

     Kedua, dan ini yang membuatnya dihapus alih-alih diperbaiki: yang
     dijanjikan ke orang bukan ETA, melainkan Estimated Delivery. ETA
     lewat sehari tidak berarti apa-apa selama barang tetap sampai
     pabrik pada tanggal yang diperkirakan — dan kalau memang meleset,
     Lapis 4 sudah menggeser perkiraannya sendiri, terlihat di panel
     prediksi lengkap dengan berapa hari telatnya.

     Menyalakan peringatan untuk sesuatu yang tidak dijanjikan hanya
     melatih orang mengabaikan peringatan. */

  return `
    <div class="lane-title mt-3">
      ${tt("Progres Pengiriman", "Shipment Progress")}
      <span class="lane-remaining">${escapeHtml(laneRemainingLabel(s))}</span>
    </div>
    <div class="lane-track ${laneClass}">
      <div class="lane-fill" style="width:${progress * 100}%"></div>
      ${dotsHtml}
      <div class="ship-marker ${markerClass}" style="left:${progress * 100}%" title="${escapeAttr(Math.round(progress * 100) + tt("% perjalanan · ", "% of the journey · ") + laneRemainingLabel(s))}"><span class="marker-trail"><span></span><span></span><span></span></span><span class="marker-icon">${icon}</span></div>
    </div>
    ${labelsHtml}`;
}

/* Auto-arrive (status otomatis pindah ke ARRIVED saat ETA lewat/hari */
