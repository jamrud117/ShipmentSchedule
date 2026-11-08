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
/* Isinya sebaris dengan baris tanggal di atasnya (kisi kolom yang sama,
   css/card.css): Update ETD tepat di bawah ETD, Update ETA di bawah ETA.
   Selisihnya terhadap rencana ditulis di bawah tanggalnya, seperti
   keterangan tanggal lain di kartu. */
function delayStripHtml(s) {
  const delay = s.status === "delayed";
  if (!delay && !adaRevisiJadwal(s)) return "";
  const kotak = (kolom, label, rencana, basis) => `
        <div class="date-field">
          <label for="${idTglKartu(s, kolom)}">${label}</label>
          <input type="date" class="kt-nilai" id="${idTglKartu(s, kolom)}" value="${s[kolom] || ""}" data-action="date" data-field="${kolom}" data-id="${s.id}"${atributKendaliKartu("readonly")}>
          <div class="date-caption">${delayDeltaText(rencana, s[kolom], basis)}</div>
        </div>`;
  return `
    <div class="delay-strip${delay ? "" : " delay-strip--sisa"}">
      <div class="delay-strip-head">
        <i class="bi bi-clock-history" aria-hidden="true"></i> ${
          delay
            ? tt("Tanggal Update Delay", "Delay Update Dates")
            : tt("Tanggal revisi yang masih berlaku — mengubah ETD/ETA di atas menggantikannya", "Revised dates still in force — changing ETD/ETA above replaces them")
        }
      </div>
      <div class="delay-strip-fields">${kotak("etdUpdate", tt("Update ETD", "Updated ETD"), s.etd, "ETD")}${kotak("etaUpdate", tt("Update ETA", "Updated ETA"), s.eta, "ETA")}
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

/* Lencana FASILITAS & DOKUMEN: rute transit, PI, SKB/COO.

   Incoterm & nilai invoice tidak lagi lencana lepas: keduanya keterangan
   invoice, jadi ditulis di bawah nomor invoice (cardBodySplitHtml) --
   "CIF · $34,740" terbaca sebagai nilai invoice itu, bukan dua tanda
   yang harus ditebak artinya. Jenis muatan (FCL/LCL) begitu pula, di sel
   kontainer. */
function buildTags(s) {
  const lbl = ML();
  const stopCount = routeStopList(s).length;
  return [
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

/* KONTROL KARTU BAGI PERAN BACA-SAJA (viewer, marketing, finance): tanggal
   readonly & status disabled SEJAK DIGAMBAR -- tiap penggambaran ulang
   membawanya lagi. Dulu hanya disamarkan CSS (pointer-events: none):
   kotaknya tetap bisa difokus lewat labelnya atau Tab, lalu ikon kalender
   tergambar berulang memenuhi kotak, tanggal bisa diketik, dan status
   bisa diganti dengan panah papan ketik -- ditolak requireEdit(), tapi
   pilihan yang salah tetap tampil sampai penggambaran berikutnya.
   Tanggal hanya-baca dilewati Tab (tabindex -1): nilai, bukan isian. */
const atributKendaliKartu = (atribut) => (canEdit() ? "" : atribut === "readonly" ? ' readonly tabindex="-1"' : " " + atribut);

// Dropdown status di kartu: pilihannya mengikuti section aktif (requirement D)
function statusSelectHtml(s) {
  /* Yang ditampilkan status EFEKTIF: begitu tanggal Actual Delivery
     terlewati, dropdown-nya sudah menunjukkan Arrived walau kolom di
     database belum sempat diperbarui */
  const st = effectiveStatus(s);

  return `<select class="status-select ${statusClass(st)}" data-action="status" data-id="${s.id}" aria-label="${escapeAttr(tt("Status pengiriman", "Shipment status"))}"${atributKendaliKartu("disabled")}>
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
      <div class="info-item"><div class="info-label"><i class="bi bi-receipt-cutoff"></i> Invoice</div><div class="info-value">${escapeHtml(dispVal(s.invoice))}${
        /* Incoterm & nilai invoice di bawah nomornya: "CIF · $34,740". */
        (() => {
          const ket = [s.incoterm ? escapeHtml(s.incoterm) : "", totals.totalUSD ? fmtUSD(totals.totalUSD) : ""].filter(Boolean).join(" · ");
          return ket ? `<br><span class="muted-value info-nilai-invoice">${ket}</span>` : "";
        })()
      }</div></div>
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

/* ------------------------------------------------------------------
   TANGGAL KUNCI DI KARTU — ETD, ETA, Estimated Delivery / Stuffing

   Tampil sebagai NILAI, bukan kotak isian (kelas kt-nilai, css/date-
   input.css): tanpa bingkai, latar tipis saat disorot, bingkai fokus
   saat diketik. Tetap bisa diketik dalam format apa pun dan tetap punya
   kalender (js/ui/date-input.js).

   Di bawah tiap tanggal satu baris keterangan: hari (dan jam), lalu --
   khusus akun penyunting -- dari mana angkanya: "Auto · ETD + 11 hari",
   "Manual", sumber & keyakinan Estimated Delivery. Dulu keterangan itu
   lencana AUTO ETA / MANUAL berwarna di label dan pita kuningan
   tersendiri yang mengulang Estimated Delivery sekali lagi.
------------------------------------------------------------------ */

/* "Sel" / "Tue", dengan jam kalau terisi: "Sel · 09:15". Hari penting
   bagi orang yang merencanakan: ETA hari Sabtu berarti clearance Senin. */
function hariTanggalKartu(iso, jam) {
  const d = iso ? parseLocalDate(iso) : null;
  if (!d) return "";
  const hari = tanggalLokal(d, activeLang === "en" ? "en-GB" : "id-ID", { weekday: "short" });
  return jam ? `${hari} · ${jam}` : hari;
}

function hariKartuHtml(iso, jam) {
  const teks = hariTanggalKartu(iso, jam);
  return teks ? `<span class="date-hari">${escapeHtml(teks)}</span>` : "";
}

/* ETA: Auto = ETD + lama transit dari mesin; Manual = angka yang diketik
   (biasanya dari forwarder). */
function keteranganEtaKartu(s) {
  if (!etaPredictionAppliesTo(s) || !tampilkanMekanikaPrediksi()) return "";
  const mode = etaModeOf(s);
  if (mode === "manual") return `<span class="date-ket">${etaModeChipHtml(mode)}</span>`;
  const e = predictEta(s);
  if (!e.ok) return `<span class="date-ket">${etaModeChipHtml(mode)} ${escapeHtml(e.reason)}</span>`;
  /* ETA ikut kiriman lain di kapal yang sama (etaSekapal): disebut, dan
     dari kiriman mana, supaya angka yang "beda dari tabel" bisa
     ditelusuri. */
  if (e.sekapal) {
    const asal = e.sekapal.sumber || {};
    const judul = `${e.ruleLabel}: ${[asal.party, carrierNameFromShipment(asal)].filter(Boolean).join(" · ")}`;
    return `<span class="date-ket" title="${escapeAttr(judul)}">${etaModeChipHtml(mode)} ${escapeHtml(tt("ikut kapal yang sama", "same vessel"))}</span>`;
  }
  /* "ETD + 10 hari", di panel sempit cukup "+10 hari" (css/card.css) --
     keterangan tetap sebaris dengan harinya. */
  const n = e.hasRange ? `${e.daysMin}–${e.daysMax}` : `${e.days}`;
  const satuan = e.days === 1 && !e.hasRange ? tt("hari", "day") : tt("hari", "days");
  const judul = tt(`ETA = ETD + ${n} hari perjalanan`, `ETA = ETD + ${n} ${satuan} in transit`);
  return `<span class="date-ket" title="${escapeAttr(judul)}">${etaModeChipHtml(mode)} <span class="date-ket-lengkap">ETD + ${n} ${satuan}</span><span class="date-ket-ringkas" aria-hidden="true">+${n} ${satuan}</span></span>`;
}

/* opsi.diganti = { tanggal, label }: RENCANA AWAL yang sudah diganti
   tanggal update delay (strip delay di bawahnya). Dicoret & berlabel
   "rencana awal" -- yang berlaku tanggal di strip itu. Dulu keduanya
   bergaya sama persis, dan jadwal yang mundur tidak terbedakan dari
   jadwal biasa (tanggal lama terbaca seperti tanggal yang berlaku). */
function kotakTanggalKartu(s, kolom, label, opsi) {
  const o = opsi || {};
  const ganti = o.diganti;
  const kelas = ["date-field", o.kelas || "", ganti ? "date-field--diganti" : ""].filter(Boolean).join(" ");
  const ket = ganti ? ` <span class="date-diganti-ket">· ${tt("rencana awal", "original plan")}</span>` : "";
  const judul = ganti
    ? ` title="${escapeAttr(tt(`Rencana awal — diganti ${ganti.label} ${fmtDate(ganti.tanggal)}`, `Original plan — replaced by ${ganti.label} ${fmtDate(ganti.tanggal)}`))}"`
    : "";
  return `<div class="${kelas}">
        <label for="${idTglKartu(s, kolom)}">${label}${ket}</label>
        <input type="date" class="kt-nilai" id="${idTglKartu(s, kolom)}" value="${s[kolom] || ""}" data-action="date" data-field="${kolom}" data-id="${s.id}"${judul}${atributKendaliKartu("readonly")}>
        <div class="date-caption">${hariKartuHtml(s[kolom], o.jam)}${o.keterangan || ""}</div>
      </div>`;
}

function dateStripHtml(s) {
  const lbl = ML();
  const etaAuto = etaPredictionAppliesTo(s) && etaModeOf(s) === "auto";
  const prediksiDelivery = deliveryPredictionAppliesTo(s);
  const deliveryManual = prediksiDelivery && deliveryModeOf(s) === "manual";
  // Rencana awal yang sudah diganti Update ETD / Update ETA (delayStripHtml)
  const diganti = (kolom, revisi, label) => (s[kolom] && s[revisi] && s[revisi] !== s[kolom] ? { tanggal: s[revisi], label } : null);
  return `
    <div class="date-strip">
      ${kotakTanggalKartu(s, "etd", "ETD", { jam: s.etdTime, diganti: diganti("etd", "etdUpdate", tt("Update ETD", "Updated ETD")) })}
      ${kotakTanggalKartu(s, "eta", "ETA", {
        jam: s.etaTime,
        keterangan: keteranganEtaKartu(s),
        kelas: etaAuto ? "date-field--auto" : "",
        diganti: diganti("eta", "etaUpdate", tt("Update ETA", "Updated ETA")),
      })}
      ${
        /* Estimated Delivery sengaja tetap BISA DIKETIK; mengetik di
           sini mengunci tanggalnya ke mode Manual. Kalau terpikir
           menguncinya supaya tidak ada dua sumber kebenaran: laporan
           butuh tanggal yang bisa dipatok, dan mode Manual itulah
           jawabannya. Di Export kolom ini Stuffing -- fakta milik
           pengguna, tanpa keterangan mesin. */
        kotakTanggalKartu(s, "actual", lbl.actual, {
          keterangan: prediksiDelivery ? predictionStripHtml(s) : "",
          kelas: deliveryManual ? "date-field--pinned" : prediksiDelivery ? "date-field--auto" : "",
        })
      }
      ${barangRingkasHtml(s)}
    </div>`;
}

/* NAMA BARANG DI SAMPING TANGGAL -- khusus tampilan Ringkas.

   Ringkas melipat rincian kartu (.ship-body-split), termasuk daftar nama
   barang di kanannya -- padahal nama barang itulah yang dipakai mengenali
   jadwal sekali pandang ("yang mold HA52"). Jadi di Ringkas namanya pindah
   ke kanan baris tanggal: kolom keempat di layar lebar, di samping
   Estimated Delivery (kisi 2x2) di panel sempit (css/desain.css, bagian
   KEPADATAN DAFTAR). Di Nyaman blok ini disembunyikan -- namanya sudah
   tampil di rincian. Paling banyak dua nama + "+n lainnya"; daftar
   lengkapnya di tooltip. Kartu selesai memakai blok yang sama
   (collapsedDatesHtml). */
const BARANG_RINGKAS_MAKS = 2;
function barangRingkasHtml(s) {
  const semua = (s.items || []).map((it) => itemDisplayName(it)).filter(Boolean);
  const sisa = semua.length - BARANG_RINGKAS_MAKS;
  const isi = semua.length
    ? semua.slice(0, BARANG_RINGKAS_MAKS).map((n) => `<div>${escapeHtml(n)}</div>`).join("") +
      (sisa > 0 ? `<div class="date-barang-lagi">${tt(`+${sisa} lainnya`, `+${sisa} more`)}</div>` : "")
    : "<div>—</div>";
  // Nama panjang dipotong dua baris (css/card.css): daftar utuhnya di tooltip
  const judul = semua.length ? ` title="${escapeAttr(semua.join("\n"))}"` : "";
  return `<div class="date-barang"${judul}>
        <div class="date-barang-label">${t("f.nama.barang")}</div>
        <div class="date-barang-isi">${isi}</div>
      </div>`;
}

/* PERJALANAN — jalur, tanggal kunci, keberangkatan hari ini, revisi
   delay dalam SATU panel: semuanya menjawab "kapan & di mana". */
function shipJourneyHtml(s) {
  return `
    <div class="ship-journey">
      <div class="lane">
        ${buildLaneHtml(s)}
      </div>
      ${dateStripHtml(s)}
      ${departingTodayHtml(s)}
      ${delayStripHtml(s)}
    </div>`;
}

/* Yang menuntut perhatian -- telat dari jadwal, kebutuhan pabrik,
   lartas yang belum ada -- tepat di bawah judul, bukan di antara
   lencana keterangan. */
function cardAlertsHtml(s) {
  const isi = `${delayBadgeHtml(s)}${tagKebutuhanHtml(s)}${tagLartasHtml(s)}`;
  return isi ? `<div class="ship-alerts">${isi}</div>` : "";
}

/* LENCANA + PROGRES DOKUMEN dalam satu wadah (.ship-dokumen). Di Nyaman
   tampilannya tidak berubah: lencana, lalu progres bergaris atas. Di
   Ringkas wadahnya jadi kisi -- lencana di KIRI dan hitungan progres
   ("6 / 9 · 1 draft · Berikutnya: Billing") di KANAN pada satu baris,
   stepper di bawahnya; garis tipis memisahkan baris ini dari baris
   tanggal dan dari stepper. Dulu keduanya menumpuk rapat di kiri di bawah
   ETD. */
function cardDokumenHtml(s, lencana, kelasLencana) {
  const progres = docStepHtml(s);
  if (!lencana && !progres) return "";
  return `<div class="ship-dokumen">${lencana ? `<div class="${kelasLencana}">${lencana}</div>` : ""}${progres}</div>`;
}

/* Nomor dokumen & No. Aju: label huruf biasa, nomornya monospace. */
function cardRefsHtml(s) {
  const lbl = ML();
  return `<div class="po-code"><span class="po-ref"><span class="po-ref-label">${lbl.docNo}:</span> ${escapeHtml(dispVal(s.docNo))}</span><span class="po-ref"><span class="po-ref-label">No. Aju:</span> ${escapeHtml(dispVal(s.noAju))}</span></div>`;
}

function renderExpandedCard(s) {
  const totals = itemTotals(s);
  const itemCount = (s.items || []).length;
  const lencana = buildTags(s);

  return `
  <div class="ship-card ship-card--${effectiveStatus(s)}" data-id="${s.id}">
    <div class="ship-card-top">
      <div class="ship-title-block">
        <div class="ship-title-text">
          <div class="item-name">${escapeHtml(dispVal(s.party))}<span class="item-count"> · ${itemCount} ${itemCount === 1 ? tt("Barang", "Item") : t("f.barang")}</span></div>
          ${cardRefsHtml(s)}
        </div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>
    ${cardAlertsHtml(s)}
    ${shipJourneyHtml(s)}
    ${cardBodySplitHtml(s, totals)}
    ${cardDokumenHtml(s, lencana, "tag-row")}
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
  /* Nilai biasa (kt-nilai), bukan kotak isian: tanpa bingkai & tanpa
     ikon kalender -- tidak ada yang bisa diubah di sini. */
  const kotak = (label, nilai) => `
      <div class="date-field date-field--locked">
        <label for="${idTglKartu(s, "kunci-" + label)}">${label}</label>
        <input type="date" class="kt-nilai" id="${idTglKartu(s, "kunci-" + label)}" value="${nilai || ""}" readonly tabindex="-1"
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
      ${barangRingkasHtml(s)}
    </div>`;
}

function renderCollapsedCard(s) {
  const lbl = ML();
  const totals = itemTotals(s);
  const lencana = buildTags(s);
  const n = (s.items || []).length;
  return `
  <div class="ship-card ship-card--arrived ship-card--collapsed" data-id="${s.id}">
    <div class="collapsed-row">
      <div class="collapsed-check"><i class="bi bi-check-circle-fill"></i></div>
      <div class="collapsed-main">
        <div class="collapsed-party">${escapeHtml(dispVal(s.party))}<span class="item-count"> · ${n} ${n === 1 ? tt("Barang", "Item") : t("f.barang")}</span></div>
        <div class="collapsed-meta"><span class="po-ref"><span class="po-ref-label">${lbl.docNo}:</span> ${escapeHtml(dispVal(s.docNo))}</span><span class="po-ref"><span class="po-ref-label">No. Aju:</span> ${escapeHtml(dispVal(s.noAju))}</span><span class="po-ref po-ref--tiba"><span class="po-ref-label">${lbl.arrivedStat}:</span> <b>${
          /* Tanggal yang MEMBUATNYA selesai (kolomPenyebabTiba): Export =
             ETD yang berlaku (kapal berangkat), bukan tanggal Stuffing;
             Import = In Factory. */
          fmtDate(s.mode === "export" ? effectiveEtd(s) : s.factoryDate)
        }</b></span></div>
      </div>
      <div class="ship-actions-block">
        ${statusSelectHtml(s)}
        ${actionButtons(s)}
      </div>
    </div>

    <div class="collapsed-extra">
      ${collapsedDatesHtml(s)}
      ${
        /* Rincian LENGKAP, sama dengan kartu berjalan: rute, forwarder,
           sarana angkut, kontainer, invoice (dengan incoterm & nilainya),
           House B/L, dan nama barang. Kiriman yang sudah tiba paling
           sering dibuka lagi justru untuk angka-angka itu --
           menyembunyikannya memaksa membuka panel detail hanya untuk
           membaca satu nomor. */
        cardBodySplitHtml(s, totals)
      }
      ${
        /* Lencana fasilitas yang sama dengan kartu aktif (PI, SKB, COO,
           transit) -- hanya kalau ada -- bersama progres dokumennya. */
        cardDokumenHtml(s, lencana, "tag-row tag-row--collapsed")
      }
      ${cardNotesHtml(s)}
    </div>
  </div>`;
}
