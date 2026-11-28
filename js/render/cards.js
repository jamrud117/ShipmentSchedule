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
  return `<span class="tag tag-delay"><i class="bi bi-clock-history"></i> ${tt(`Mundur ${info.days} hari dari ${info.basis}`, `Delayed ${info.days} day(s) from ${info.basis}`)}</span>`;
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
          <input ${atributKotakTanggal(s[kolom])} class="kt-nilai" id="${idTglKartu(s, kolom)}" data-action="date" data-field="${kolom}" data-id="${s.id}"${atributKendaliKartu("readonly")}>
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
      ? tt(`Dibutuhkan di pabrik ${tgl} · Est. Delivery ${fmtDate(k.sampai)}`, `Needed at the factory ${tgl} · Est. Delivery ${fmtDate(k.sampai)}`)
      : tt(`Dibutuhkan di pabrik ${tgl} · Est. Delivery belum bisa dihitung`, `Needed at the factory ${tgl} · Est. Delivery not available yet`),
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
    ${namaBarangInfoHtml(s)}
    </div>`;
}

/* Kolom NAMA BARANG di kanan rincian (bergaris kiri): selama baris papan
   terbuka, inilah tempat nama barang -- sel pertama baris ringkas
   menyembunyikannya (papanBarangHtml) supaya tidak tertulis dua kali.
   Paling banyak empat nama; sisanya "+2 Lainnya", tombol yang membuka
   Lihat Detail (daftar barang lengkap) dan tooltip-nya menyebut sisanya. */
const NAMA_INFO_MAKS = 4;
function namaBarangInfoHtml(s) {
  const semua = namaBarangUnik(s);
  const sisa = semua.length - NAMA_INFO_MAKS;
  const isi = semua.length
    ? semua.slice(0, NAMA_INFO_MAKS).map((n) => `<div>${escapeHtml(n)}</div>`).join("") +
      (sisa > 0
        ? `<button type="button" class="info-names-lagi" data-action="viewDetail" data-id="${s.id}" title="${escapeAttr(semua.slice(NAMA_INFO_MAKS).join("\n"))}">${escapeHtml(tt(`+${sisa} Lainnya`, `+${sisa} More`))}</button>`
        : "")
    : "<div>—</div>";
  return `<div class="info-item info-names"><div class="info-label"><i class="bi bi-boxes"></i> ${t("f.nama.barang")}</div><div class="info-value info-value--list">${isi}</div></div>`;
}

/* ------------------------------------------------------------------
   TANGGAL KUNCI DI KARTU — ETD, ETA, Estimated Delivery / Stuffing

   Tampil sebagai NILAI, bukan kotak isian (kelas kt-nilai, css/date-
   input.css): tanpa bingkai, latar tipis saat disorot, bingkai fokus
   saat diketik. Tetap bisa diketik dalam format apa pun dan tetap punya
   kalender (js/ui/date-input.js).

   Tiap kotak tanggal TIGA baris, sama di semua lebar panel:

     ETA [Auto]                  <- judul + lencana mode (akun penyunting)
     [20-11-2026 📅]             <- tanggal
     Jumat · ETD + 10 hari       <- hari (& jam) · rinciannya

   Lencana Auto / Manual menumpang di BARIS JUDUL, yang memang sudah ada
   dan hampir kosong ("ETA" cuma tiga huruf), bukan menambah baris di
   bawah tanggal. Keterangannya SATU baris butir dipisah titik tengah:
   ETA "ETD + 10 hari"; Estimated Delivery "dari PIB · ▮▮▮▮▯ 85% ·
   Tinggi" (Manual tanpa "dari", perkiraan yang terlewat "◷ Telat 36
   hari"). Di panel yang lebih sempit teksnya dipadatkan ("+10 hari",
   tanpa kata "Tinggi") supaya tetap sebaris; butir yang tetap tidak muat
   turun UTUH tanpa titik menggantung (css/card.css).
   Riwayat: lencana AUTO ETA / MANUAL berwarna dulu di label (labelnya
   patah dua baris), lalu berderet di satu baris keterangan yang patah di
   sembarang tempat, lalu bertumpuk tiga baris (hari / lencana + sumber /
   keyakinan) di kolom sempit. Kini lencananya di judul berukuran sebaris
   label, jadi ketiga tanggal tetap mulai di garis yang sama.
------------------------------------------------------------------ */

/* "Selasa" / "Tuesday" -- nama hari utuh, bukan "Sel" / "Tue" yang harus
   ditebak -- dengan jam kalau terisi: "Selasa · 09:15". Hari penting bagi
   orang yang merencanakan: ETA hari Sabtu berarti clearance Senin. */
function hariTanggalKartu(iso, jam) {
  const d = iso ? parseLocalDate(iso) : null;
  if (!d) return "";
  const hari = tanggalLokal(d, activeLang === "en" ? "en-GB" : "id-ID", { weekday: "long" });
  return jam ? `${hari} · ${jam}` : hari;
}

/* Di kartu hari & jam dua butir ("Selasa · 09:15"): titik di antaranya
   sama dengan titik pemisah butir lain di baris itu. */
function hariKartuHtml(iso, jam) {
  const hari = hariTanggalKartu(iso);
  if (!hari) return "";
  return butirKeteranganHtml(escapeHtml(hari), "date-hari") + (jam ? butirKeteranganHtml(escapeHtml(jam), "date-hari date-jam") : "");
}

/* ETA: lencana untuk baris judulnya + butir keterangannya. Auto = ETD +
   lama transit dari mesin; Manual = angka yang diketik (biasanya dari
   forwarder). Rencana awal yang sudah diganti Update ETA (dicoret, "·
   rencana awal") tidak diberi keduanya -- yang berlaku tanggal di strip
   delay, dan judulnya sudah cukup panjang. */
function etaKartuHtml(s, diganti) {
  const kosong = { lencana: "", keterangan: "" };
  if (diganti || !etaPredictionAppliesTo(s) || !tampilkanMekanikaPrediksi()) return kosong;
  const mode = etaModeOf(s);
  const lencana = lencanaJudulTanggalHtml(etaModeChipHtml(mode), judulModeEta(mode));
  if (mode === "manual") return { lencana, keterangan: "" };
  const e = predictEta(s);
  if (!e.ok) return { lencana, keterangan: butirKeteranganHtml(escapeHtml(e.reason), "date-butir--alasan") };
  /* ETA ikut kiriman lain di kapal yang sama (etaSekapal): disebut, dan
     dari kiriman mana, supaya angka yang "beda dari tabel" bisa
     ditelusuri. */
  if (e.sekapal) {
    const asal = e.sekapal.sumber || {};
    const judul = `${e.ruleLabel}: ${[asal.party, carrierNameFromShipment(asal)].filter(Boolean).join(" · ")}`;
    return { lencana, keterangan: butirKeteranganHtml(escapeHtml(tt("ikut kapal yang sama", "same vessel")), "", judul) };
  }
  /* "ETD + 10 hari"; di panel < 700px cukup "+10 hari" (css/card.css)
     supaya tetap sebaris dengan harinya. Hanya satu yang tampil, jadi
     pembaca layar pun membaca yang tampil itu saja. */
  const n = e.hasRange ? `${e.daysMin}–${e.daysMax}` : `${e.days}`;
  const satuan = e.days === 1 && !e.hasRange ? tt("hari", "day") : tt("hari", "days");
  const judul = tt(`ETA = ETD + ${n} hari perjalanan`, `ETA = ETD + ${n} ${satuan} in transit`);
  return {
    lencana,
    keterangan: butirKeteranganHtml(
      `<span class="date-ket-lengkap">ETD + ${n} ${satuan}</span><span class="date-ket-ringkas">+${n} ${satuan}</span>`,
      "",
      judul,
    ),
  };
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
  /* Judul + lencana mode sebaris (.date-kepala); keterangan satu baris
     butir (.date-caption-isi) -- hanya digambar kalau ada isinya. */
  const butir = `${hariKartuHtml(s[kolom], o.jam)}${o.keterangan || ""}`;
  return `<div class="${kelas}">
        <div class="date-kepala"><label for="${idTglKartu(s, kolom)}">${label}${ket}</label>${o.lencana || ""}</div>
        <input ${atributKotakTanggal(s[kolom])} class="kt-nilai" id="${idTglKartu(s, kolom)}" data-action="date" data-field="${kolom}" data-id="${s.id}"${judul}${atributKendaliKartu("readonly")}>
        ${butir ? `<div class="date-caption"><div class="date-caption-isi">${butir}</div></div>` : ""}
      </div>`;
}

function dateStripHtml(s, dSiap) {
  const lbl = ML();
  const etaAuto = etaPredictionAppliesTo(s) && etaModeOf(s) === "auto";
  const prediksiDelivery = deliveryPredictionAppliesTo(s);
  const deliveryManual = prediksiDelivery && deliveryModeOf(s) === "manual";
  // Rencana awal yang sudah diganti Update ETD / Update ETA (delayStripHtml)
  const diganti = (kolom, revisi, label) => (s[kolom] && s[revisi] && s[revisi] !== s[kolom] ? { tanggal: s[revisi], label } : null);
  const etaDiganti = diganti("eta", "etaUpdate", tt("Update ETA", "Updated ETA"));
  const eta = etaKartuHtml(s, etaDiganti);
  const delivery = prediksiDelivery ? deliveryKartuHtml(s, dSiap) : { lencana: "", keterangan: "" };
  return `
    <div class="date-strip">
      ${kotakTanggalKartu(s, "etd", "ETD", { jam: s.etdTime, diganti: diganti("etd", "etdUpdate", tt("Update ETD", "Updated ETD")) })}
      ${kotakTanggalKartu(s, "eta", "ETA", {
        jam: s.etaTime,
        lencana: eta.lencana,
        keterangan: eta.keterangan,
        kelas: etaAuto ? "date-field--auto" : "",
        diganti: etaDiganti,
      })}
      ${
        /* Estimated Delivery sengaja tetap BISA DIKETIK; mengetik di
           sini mengunci tanggalnya ke mode Manual. Kalau terpikir
           menguncinya supaya tidak ada dua sumber kebenaran: laporan
           butuh tanggal yang bisa dipatok, dan mode Manual itulah
           jawabannya. Di Export kolom ini Stuffing -- fakta milik
           pengguna, tanpa keterangan mesin. */
        kotakTanggalKartu(s, "actual", lbl.actual, {
          lencana: delivery.lencana,
          keterangan: delivery.keterangan,
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
function shipJourneyHtml(s, dSiap) {
  return `
    <div class="ship-journey">
      <div class="lane">
        ${buildLaneHtml(s)}
      </div>
      ${dateStripHtml(s, dSiap)}
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
  // bilah: balok progres dokumen di kepala stepper (sel Dokumen baris ringkas tersembunyi selama dibuka)
  const progres = docStepHtml(s, { bilah: true });
  if (!lencana && !progres) return "";
  return `<div class="ship-dokumen">${lencana ? `<div class="${kelasLencana}">${lencana}</div>` : ""}${progres}</div>`;
}

/* Nomor dokumen & No. Aju: label huruf biasa, nomornya monospace. */
function cardRefsHtml(s) {
  const lbl = ML();
  return `<div class="po-code"><span class="po-ref"><span class="po-ref-label">${lbl.docNo}:</span> ${escapeHtml(dispVal(s.docNo))}</span><span class="po-ref"><span class="po-ref-label">No. Aju:</span> ${escapeHtml(dispVal(s.noAju))}</span></div>`;
}

/* ==================================================================
   PAPAN JADWAL (desain Peta Laut) -- satu jadwal = satu baris

   Baris ringkas selalu tampil dan dibaca dari kiri: NAMA BARANG dulu --
   orang mencari "SBR 1502 tiba kapan", bukan "yang KUMHO" -- lalu rute &
   kapal, ETD, ETA, Est. Delivery / Stuffing, progres dokumen, status.
   Garis rute berwarna menurut keadaannya: biru = sesuai jadwal, merah =
   delay, hijau = sudah tiba.

   Rincian (perjalanan dengan kotak tanggal yang bisa diketik, tahap
   dokumen, rincian kiriman, kronologi, tombol aksi) dilipat di bawahnya,
   dibuka dengan tombol panah atau klik di mana saja pada baris ringkas
   (card-events.js). Rinciannya SELALU digambar dan hanya disembunyikan
   CSS saat terlipat: membuka/menutup tidak menggambar ulang apa pun,
   kotak tanggalnya sudah dipasang render(), dan pencarian di halaman,
   fokus, serta tes yang membaca isi kartu tetap menemukannya.
   ================================================================== */

/* Baris yang sedang terbuka, per id: tetap terbuka setelah render()
   menggambar ulang (ubah status, simpan tanggal, pindah halaman). */
const papanTerbuka = new Set();

/* KEPALA KOLOM PAPAN (Supplier & Barang, Rute, ETD, ETA, Est. Delivery,
   Dokumen, Status) DISEMBUNYIKAN selama ada baris yang dibuka: baris
   yang dibuka tidak memakai kolom-kolom itu -- rute, tanggal & dokumennya
   ada di rinciannya sendiri -- jadi kepalanya hanya membingungkan.
   Semua baris tertutup lagi -> kepalanya kembali (.ada-buka,
   peta-laut.css). Dipanggil sesudah daftar digambar (render) & tiap
   baris dibuka / ditutup (card-events.js). */
function papanSegarkanKepala() {
  const papan = document.getElementById("papan");
  if (papan) papan.classList.toggle("ada-buka", !!papan.querySelector(".papan-baris.is-buka"));
}

const idRincianPapan = (s) => "rincian-" + String(s.id).replace(/[^\w-]/g, "");

/* "18 Nov"; tahun hanya ditulis kalau bukan tahun ini ("18 Nov 2025").
   Nama bulan pendek bahasa aktif, tanpa titik singkatan. */
function tglPapan(iso) {
  const d = iso ? parseLocalDate(iso) : null;
  if (!d) return "";
  const opsi = { day: "numeric", month: "short" };
  if (String(d.getFullYear()) !== todayISO().slice(0, 4)) opsi.year = "numeric";
  return tanggalLokal(d, activeLang === "en" ? "en-GB" : "id-ID", opsi).replace(/\./g, "");
}

/* Jarak dari hari ini, seperti orang menyebutnya. */
function hariRelatifPapan(iso) {
  const n = iso ? delayDaysBetween(todayISO(), iso) : null;
  if (n == null) return "";
  if (n === 0) return tt("Hari Ini", "Today");
  if (n === 1) return tt("Besok", "Tomorrow");
  if (n === -1) return tt("Kemarin", "Yesterday");
  return n > 1 ? tt(`${n} Hari Lagi`, `In ${n} Days`) : tt(`${-n} Hari Lalu`, `${-n} Days Ago`);
}

/* Keterangan di bawah tanggal: yang masih akan terjadi ditulis jaraknya
   ("2 Hari Lagi"), yang sudah lewat -- atau jadwal yang sudah selesai --
   nama harinya ("Jumat"). */
function ketTanggalPapan(s, iso) {
  if (!iso) return "";
  const n = delayDaysBetween(todayISO(), iso);
  if (!isArrived(s) && n != null && n >= 0) return hariRelatifPapan(iso);
  return hariTanggalKartu(iso);
}

/* Satu sel tanggal. Labelnya hanya terlihat di tata letak ponsel; di
   layar lebar kepala kolom yang menyebutnya (bagi pembaca layar label
   tetap dibacakan). `asal` = rencana awal yang sudah diganti tanggal
   revisi delay: "Dari 20 Nov", merah. */
function selTanggalPapan(kelas, label, iso, ket, ketKelas, asal) {
  return `<div class="pr-tgl ${kelas}">
        <span class="pr-label">${label}</span>
        <b class="pr-tgl-nilai">${iso ? escapeHtml(tglPapan(iso)) : "—"}</b>${
          ket ? `<span class="pr-ket${ketKelas ? " " + ketKelas : ""}">${escapeHtml(ket)}</span>` : ""
        }${
          asal
            ? `<span class="pr-ket pr-ket--dari" title="${escapeAttr(tt(`Rencana awal ${fmtDate(asal)}`, `Original plan ${fmtDate(asal)}`))}">${escapeHtml(tt(`Dari ${tglPapan(asal)}`, `From ${tglPapan(asal)}`))}</span>`
            : ""
        }
      </div>`;
}

const asalRevisiPapan = (s, kolom, revisi) => (s[kolom] && s[revisi] && s[revisi] !== s[kolom] ? s[kolom] : "");

/* Est. Delivery (Import) / Stuffing (Export). Import yang masih jalan
   menyebut asal angkanya: "Auto · 68%" (keyakinan mesin prediksi),
   "Manual", atau "Telat 3 Hari" kalau perkiraannya sudah terlewat. Yang
   sudah tiba menyebut In Factory. */
function selActualPapan(s, d) {
  const lbl = ML();
  let ket = "";
  let kelas = "";
  if (s.mode !== "export" && isArrived(s)) {
    ket = "In Factory" + (s.factoryDate && s.factoryDate !== s.actual ? " " + tglPapan(s.factoryDate) : "");
  } else if (d) {
    if (!d.ok) ket = "Auto";
    else if (d.shifted) {
      ket = tt(`Telat ${d.overdueDays} Hari`, `${d.overdueDays} Days Late`);
      kelas = "pr-ket--merah";
    } else if (d.source === "manual") ket = "Manual";
    else ket = `Auto · ${d.confidence && d.confidence.percent != null ? d.confidence.percent + "%" : ""}`.replace(/ · $/, "");
  } else ket = ketTanggalPapan(s, s.actual);
  return selTanggalPapan("pr-actual", lbl.actual, s.actual, ket, kelas);
}

/* Nama pelabuhan pendek untuk ujung garis rute: "Busan", "Tanjung
   Priok" -- bagian sebelum koma, tanpa "Intl Airport". Kode dokumennya
   (KRPUS) di tooltip; kalau namanya tidak dikenal, kodenya yang tampil. */
function pelabuhanPapan(raw, moda) {
  const kode = portCodeLabel(raw) || String(raw || "").trim();
  const e = typeof resolvePortEntryMode === "function" ? resolvePortEntryMode(raw, moda) : null;
  const nama = e && e.name
    ? e.name.split(",")[0].replace(/\s+(Intl\.?|International)?\s*Airport$/i, "").trim()
    : "";
  return { teks: nama || kode || "—", judul: [kode, e && e.name].filter(Boolean).join(" · ") };
}

function papanRuteHtml(s) {
  const asal = pelabuhanPapan(s.origin, s.transport);
  const tujuan = pelabuhanPapan(s.destination, s.transport);
  const maju = Math.round(Math.max(0, Math.min(1, laneProgress(s))) * 1000) / 10;
  const keadaan = isArrived(s) ? "tiba" : effectiveStatus(s) === "delayed" ? "delay" : "tepat";
  const transit = isTransitRoute(s) ? routeStopList(s).length : 0;
  const kapal = carrierNameFromShipment(s);
  const ketGaris = isArrived(s)
    ? tt("Sudah tiba", "Arrived")
    : tt(`Perjalanan ${Math.round(maju)}%`, `Journey ${Math.round(maju)}%`);
  return `<div class="pr-rute pr-rute--${keadaan}" style="--maju:${maju}%;--maju-n:${maju / 100}">
        <div class="pr-rute-ujung"><span title="${escapeAttr(asal.judul)}">${escapeHtml(asal.teks)}</span><span title="${escapeAttr(tujuan.judul)}">${escapeHtml(tujuan.teks)}</span></div>
        <div class="pr-rute-garis" role="img" aria-label="${escapeAttr(ketGaris)}"><span class="pr-rute-isi"></span><span class="pr-rute-penanda"><span class="pr-rute-titik"></span></span></div>
        <div class="pr-sub">${transit ? `<span class="pr-transit">Transit ${transit} Stop</span>` : ""}${
          hasMeaningfulValue(kapal) ? `<span class="pr-kapal">${escapeHtml(kapal)}</span>` : ""
        }</div>
      </div>`;
}

/* Tanda yang menuntut perhatian, pendek, di bawah nama barang: telat
   atau mepet dari kebutuhan pabrik, PI / LS lartas yang belum ada.
   Kalimat lengkapnya di tooltip dan di rincian (cardAlertsHtml). */
function papanTandaHtml(s) {
  const isi = [];
  const k = typeof statusKebutuhan === "function" ? statusKebutuhan(s) : null;
  if (k && !k.fakta && (k.kind === "telat" || k.kind === "mepet")) {
    const judul = tt(`Dibutuhkan di pabrik ${fmtDate(k.butuh)}`, `Needed at the factory ${fmtDate(k.butuh)}`);
    isi.push(
      k.kind === "telat"
        ? `<span class="pr-tanda pr-tanda--merah" title="${escapeAttr(judul)}"><i class="bi bi-alarm" aria-hidden="true"></i>${escapeHtml(tt(`Telat ${-k.selisih} Hari dari Kebutuhan`, `${-k.selisih} Days Past Need Date`))}</span>`
        : `<span class="pr-tanda pr-tanda--kuning" title="${escapeAttr(judul)}"><i class="bi bi-alarm" aria-hidden="true"></i>${escapeHtml(tt("Mepet Kebutuhan", "Tight for Need Date"))}</span>`,
    );
  }
  const kurang = typeof lartasKurang === "function" ? lartasKurang(s) : [];
  if (kurang.length)
    isi.push(`<span class="pr-tanda pr-tanda--merah"><i class="bi bi-shield-exclamation" aria-hidden="true"></i>${escapeHtml(tt(`${kurang.join(" & ")} Belum Ada`, `${kurang.join(" & ")} Missing`))}</span>`);
  return isi.length ? `<div class="pr-tandaan">${isi.join("")}</div>` : "";
}

/* Sel pertama: PEMASOK / PEMBELI paling atas (sorotan oranye khas logo
   DDI), lalu nama barang (paling banyak dua, "+3 Lainnya") dan nomor
   invoice. Dibuka: nama barang pindah ke kolom Nama Barang rincian. */
const NAMA_PAPAN_MAKS = 2;
/* Nama barang tanpa kembar (huruf besar-kecil & spasi diabaikan): dua
   baris barang bernama sama ditulis sekali. */
function namaBarangUnik(s) {
  const lihat = new Set();
  return (s.items || []).map((it) => itemDisplayName(it)).filter((n) => {
    const k = String(n || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (!k || lihat.has(k)) return false;
    lihat.add(k);
    return true;
  });
}

/* Sel pertama baris papan:
     1. PEMASOK (Import) / PEMBELI (Export) PALING ATAS -- disorot warna
        oranye khas logo Dynamic Design Indonesia, ikon gedung. Itulah
        yang pertama dicari di papan ("kiriman Sheng Guang yang mana?").
     2. NAMA BARANG: dua pertama + "+N Lainnya" -- HANYA selama baris
        tertutup. Dibuka: daftarnya pindah ke kolom Nama Barang di kanan
        rincian (namaBarangInfoHtml), jadi sel ini tinggal pemasok &
        invoice dan sorotannya tidak terhalang.
     3. Nomor invoice (redup) & tanda kebutuhan / lartas.
   Tanpa pemasok: nama barang yang jadi judul; tanpa keduanya: "—". */
function papanBarangHtml(s) {
  const semua = namaBarangUnik(s);
  const sisa = semua.length - NAMA_PAPAN_MAKS;
  const adaPihak = hasMeaningfulValue(s.party);
  const pihak = adaPihak
    ? `<div class="pr-pihak"><i class="bi bi-buildings" aria-hidden="true"></i><span class="pr-pihak-nama">${escapeHtml(s.party)}</span></div>`
    : "";
  const nama = semua.length
    ? semua.slice(0, NAMA_PAPAN_MAKS).map((n) => `<span class="pr-nama">${escapeHtml(n)}</span>`).join("") +
      (sisa > 0 ? `<span class="pr-lagi">${escapeHtml(tt(`+${sisa} Lainnya`, `+${sisa} More`))}</span>` : "")
    : adaPihak
      ? ""
      : `<span class="pr-nama">${escapeHtml(dispVal(s.party))}</span>`;
  const inv = hasMeaningfulValue(s.invoice) ? `<div class="pr-sub"><span class="pr-inv">${escapeHtml(s.invoice)}</span></div>` : "";
  return `<div class="pr-barang${adaPihak ? "" : " pr-barang--tanpa-pihak"}"${sisa > 0 ? ` title="${escapeAttr(semua.join("\n"))}"` : ""}>
        ${pihak}
        ${nama ? `<div class="pr-nama-wadah">${nama}</div>` : ""}
        ${inv}
        ${papanTandaHtml(s)}
      </div>`;
}

/* Progres dokumen sebagai balok: satu balok per tahap yang berlaku
   (navy = terkumpul, kuning = baru draft), "4/10", dan tahap berikutnya. */
function papanDokHtml(s) {
  if (isKurirNilaiRendah(s)) return `<div class="pr-dok"><span class="pr-ket">${escapeHtml(tt("Kurir, Tanpa PIB", "Courier, No PIB"))}</span></div>`;
  const langkah = docStepsFor(s);
  const balok = docBalok(s);
  if (!balok.total) return '<div class="pr-dok"></div>';
  const selesai = balok.selesai;
  const idx = docNextIndex(s);
  const berikut = idx >= 0 ? stepText(langkah[idx].label, s) : "";
  const lengkap = selesai === balok.total;
  return `<div class="pr-dok">
        <span class="pr-label">${escapeHtml(tt("Dokumen", "Documents"))}</span>
        <div class="pr-dok-baris"><span class="pr-blok" aria-hidden="true">${balok.html}</span><b class="pr-dok-n">${selesai}/${balok.total}</b></div>
        <span class="pr-ket${lengkap ? " pr-ket--hijau" : ""}">${
          lengkap ? escapeHtml(tt("Lengkap", "Complete")) : berikut ? escapeHtml(tt(`Berikutnya: ${berikut}`, `Next: ${berikut}`)) : ""
        }</span>
      </div>`;
}

/* Baris ringkas: selalu tampil. */
function papanRingkasHtml(s, d) {
  const terbuka = papanTerbuka.has(String(s.id));
  const namaUtama = itemNamesSummary(s, 1)[0];
  const buka = terbuka ? tt("Tutup Rincian", "Hide Details") : tt("Buka Rincian", "Show Details");
  const ubah = tt("Ubah", "Edit");
  const etd = effectiveEtd(s);
  const eta = effectiveEta(s);
  const etdKet = ketTanggalPapan(s, etd);
  return `<div class="papan-ringkas">
      ${papanBarangHtml(s)}
      ${papanRuteHtml(s)}
      ${selTanggalPapan("pr-etd", "ETD", etd, etdKet, !isArrived(s) && etd === todayISO() ? "pr-ket--status" : "", asalRevisiPapan(s, "etd", "etdUpdate"))}
      ${selTanggalPapan("pr-eta", "ETA", eta, ketTanggalPapan(s, eta), isArrived(s) ? "" : "pr-ket--status", asalRevisiPapan(s, "eta", "etaUpdate"))}
      ${selActualPapan(s, d)}
      ${papanDokHtml(s)}
      <div class="pr-status pr-status--${effectiveStatus(s)}">${statusSelectHtml(s)}</div>
      <div class="pr-aksi">
        <button type="button" class="pr-tombol" data-action="edit" data-id="${s.id}" title="${ubah}" aria-label="${escapeAttr(`${ubah}: ${namaUtama}`)}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
        <button type="button" class="pr-tombol pr-buka" data-papan-buka aria-expanded="${terbuka}" aria-controls="${idRincianPapan(s)}" title="${buka}" aria-label="${escapeAttr(`${buka}: ${namaUtama}`)}"><i class="bi bi-chevron-down" aria-hidden="true"></i></button>
      </div>
    </div>`;
}

/* Bilah aksi di kepala rincian (papanBarisHtml) -- tombol berlabel
   pendek: Lihat, Salin, Hapus. UBAH tidak ada di sini: tombol pensil di
   baris ringkas, tepat di atasnya, sudah melakukannya -- satu tombol per
   aksi. Menu Salin (templat Excel) memakai posisi fixed: rincian yang
   dilipat ber-overflow hidden, menu yang membalik ke atas (dekat dasar
   layar) tidak terpotong olehnya. */
function papanAksiHtml(s) {
  return `<div class="pr-aksi-bilah">
        <button type="button" class="pr-tombol-teks" data-action="viewDetail" data-id="${s.id}" title="${escapeAttr(tt("Lihat Detail Lengkap", "View Full Details"))}"><i class="bi bi-eye" aria-hidden="true"></i>${escapeHtml(tt("Lihat", "View"))}</button>
        <div class="dropdown copy-template-dropdown">
          <button type="button" class="pr-tombol-teks" data-bs-toggle="dropdown" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false" title="${escapeAttr(t("v.salin.ke.excel"))}"><i class="bi bi-clipboard" aria-hidden="true"></i>${escapeHtml(tt("Salin", "Copy"))}<i class="bi bi-chevron-down pr-caret" aria-hidden="true"></i></button>
          <ul class="dropdown-menu copy-template-menu">${copyTemplateMenuHtml(s.id)}</ul>
        </div>
        <button type="button" class="pr-tombol-teks pr-tombol-teks--hapus" data-action="delete" data-id="${s.id}"><i class="bi bi-trash3" aria-hidden="true"></i>${escapeHtml(tt("Hapus", "Delete"))}</button>
      </div>`;
}

/* Baris yang baru diubah dari papan (status, tanggal, tahap dokumen):
   disorot sekejap pada penggambaran berikutnya (css/peta-laut.css,
   .baru-berubah) supaya mudah ditemukan lagi kalau urutannya berpindah.
   Hanya selama 1,2 detik -- penggambaran sesudahnya tidak menyorot. */
let papanBerubah = null;
function tandaiBarisBerubah(id) {
  papanBerubah = { id: String(id), sampai: Date.now() + 1200 };
}
const barisBaruBerubah = (s) => !!papanBerubah && papanBerubah.id === String(s.id) && Date.now() < papanBerubah.sampai;

/* Kerangka satu baris: ringkas + rincian.

   Rincian MENGALIR dari atas ke bawah, seperti kartu jadwal sebelum
   papan -- bukan tiga panel berdampingan:
     kepala   No. dokumen · No. Aju · peringatan     [Lihat][Salin][Hapus]
     perjalanan (judul keadaan, jalur selebar baris), ETD / ETA / Est.
     ────────
     rincian (Rute, Forwarder, ...)                  | Nama Barang
     lencana (PPH, COO, ...)
     ────────
     Progres Dokumen  ①──②──③──...                              9 / 9
     ────────
     Kronologi & Catatan
   Aksi lebih dulu di DOM (urutan Tab sesudah tombol buka); tampilannya
   di kanan (css/peta-laut.css, flex row-reverse). `meta` = keterangan
   tambahan di depan nomor dokumen (tanggal tiba jadwal selesai). */
function papanBarisHtml(s, kelasKartu, d, rincian, meta) {
  const terbuka = papanTerbuka.has(String(s.id));
  return `
  <div class="ship-card ${kelasKartu} papan-baris${terbuka ? " is-buka" : ""}${barisBaruBerubah(s) ? " baru-berubah" : ""}" data-id="${s.id}">
    ${papanRingkasHtml(s, d)}
    <div class="papan-rincian" id="${idRincianPapan(s)}">
      <div class="papan-rincian-isi">
      <div class="pr-rincian-kepala">
        ${papanAksiHtml(s)}
        <div class="pr-rincian-ref">${meta || ""}${cardRefsHtml(s)}${cardAlertsHtml(s)}</div>
      </div>
      ${rincian}
      ${cardNotesHtml(s)}
      </div>
    </div>
  </div>`;
}

/* Prediksi Est. Delivery dihitung SEKALI per baris: sel ringkas ("Auto
   · 68%") dan keterangan kotak tanggal di rincian membaca hasil yang
   sama. */
const prediksiPapan = (s) =>
  deliveryPredictionAppliesTo(s) && tampilkanMekanikaPrediksi() ? predictDelivery(s) : null;

function renderExpandedCard(s) {
  const d = prediksiPapan(s);
  const rincian = `
      ${shipJourneyHtml(s, d)}
      ${cardBodySplitHtml(s, itemTotals(s))}
      ${cardDokumenHtml(s, buildTags(s), "tag-row")}`;
  return papanBarisHtml(s, `ship-card--${effectiveStatus(s)}`, d, rincian);
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
        <input ${atributKotakTanggal(nilai)} class="kt-nilai" id="${idTglKartu(s, "kunci-" + label)}" readonly tabindex="-1"
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

/* Jadwal yang sudah Arrived / Delivered: baris ringkas yang sama; di
   rinciannya tanggal HANYA BISA DIBACA (collapsedDatesHtml) -- mengubah
   tanggal kiriman yang sudah beres harus disengaja, lewat tombol pensil. */
function renderCollapsedCard(s) {
  const lbl = ML();
  const d = prediksiPapan(s);
  /* Tanggal yang MEMBUATNYA selesai (kolomPenyebabTiba): Export = ETD
     yang berlaku (kapal berangkat), bukan Stuffing; Import = In Factory. */
  const tiba = `<div class="collapsed-meta"><span class="po-ref po-ref--tiba"><span class="po-ref-label">${lbl.arrivedStat}:</span> <b>${fmtDate(
    s.mode === "export" ? effectiveEtd(s) : s.factoryDate,
  )}</b></span></div>`;
  const rincian = `
      <div class="ship-journey ship-journey--selesai"><div class="lane">${buildLaneHtml(s)}</div>${collapsedDatesHtml(s)}</div>
      ${cardBodySplitHtml(s, itemTotals(s))}
      ${cardDokumenHtml(s, buildTags(s), "tag-row tag-row--collapsed")}`;
  return papanBarisHtml(s, "ship-card--arrived ship-card--collapsed", d, rincian, tiba);
}
