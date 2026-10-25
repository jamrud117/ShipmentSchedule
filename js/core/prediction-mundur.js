"use strict";

/* ==================================================================
   RENCANA MUNDUR — "Dibutuhkan di Pabrik" -> ETA & ETD paling lambat

   Kebalikan dari Mesin 1 & 2. Bukan "kapan barangnya sampai", tapi
   "paling lambat kapan alat angkutnya harus TIBA dan BERANGKAT supaya
   barangnya ada di pabrik pada hari yang dibutuhkan produksi".

   Dihitung dengan mesin yang sama, dijalankan mundur:

   - ETA paling lambat = kedatangan TERAKHIR yang -- lewat jadwal proses
     darat yang persis sama dengan Estimated Delivery (stripping LCL,
     clearance per jalur kalau sudah diketahui, antar ke pabrik; hari
     kerja, libur, cuti bersama, pembatasan truk) -- masih sampai di
     pabrik pada hari H. Dicari dengan pembagian dua: jadwal darat tidak
     pernah mundur saat kedatangannya maju, jadi tanggal itu tunggal.

   - ETD paling lambat = ETA paling lambat - lama transit TERPANJANG
     rute itu (rentang konfigurasi, atau riwayat kalau sudah dipelajari).
     Rencana yang AMAN, bukan yang rata-rata: kapal yang berangkat pada
     tanggal itu tetap sampai walau pelayarannya lambat.

   Milestone kiriman ini TIDAK dipakai: rencana mundur menjawab
   pertanyaan perencanaan ("kapan harus berangkat"). Yang membandingkan
   dengan kenyataan kiriman ini adalah statusKebutuhan() di bawah.
================================================================== */

// Cadangan <= sekian hari kalender = "mepet" (kuning), bukan "aman"
const KEBUTUHAN_MEPET_HARI = 2;
// Batas pencarian mundur dari tanggal dibutuhkan (hari kalender)
const RENCANA_MUNDUR_JANGKAU = 150;

function rencanaMundur(src, butuh) {
  const s = src || {};
  const hari = butuh || s.neededDate;
  if (!hari || s.mode === "export") return null;
  const rute = resolveRouteLayer(s);
  const ops = predictionOpsDays(rute);
  /* Kiriman "polos" berute sama: tanpa milestone, tanpa kapal (tidak
     ikut kedatangan kiriman sekapal), ETA manual = yang diuji. */
  const polos = {
    mode: "import",
    transport: s.transport,
    muatan: s.muatan,
    origin: s.origin,
    destination: s.destination,
    routeType: s.routeType,
    routeStops: s.routeStops,
    forwarder: s.forwarder,
    vessel: "",
    voyage: "",
    etaMode: "manual",
    docProgress: {},
  };
  const jadwalDari = (eta) => buildDeliverySchedule(Object.assign({}, polos, { eta }), ops, rute);
  const mundur = (k) => addCalendarDaysISO(hari, -k);
  const cukup = (k) => {
    const j = jadwalDari(mundur(k));
    return j.ok && j.date && j.date <= hari;
  };
  if (!cukup(RENCANA_MUNDUR_JANGKAU)) {
    return { ok: false, butuh: hari, reason: tt("Proses darat rute ini belum bisa dihitung.", "The land process for this route cannot be calculated yet.") };
  }
  // k terkecil (ETA paling lambat) yang masih cukup
  let lo = -1;
  let hi = RENCANA_MUNDUR_JANGKAU;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (mid >= 0 && cukup(mid)) hi = mid;
    else lo = mid;
  }
  const eta = mundur(hi);
  const darat = jadwalDari(eta);
  const transit = predictionTransitDays(rute);
  const etd = transit.ok ? addCalendarDaysISO(eta, -transit.max) : "";
  return {
    ok: true,
    butuh: hari,
    eta,
    etd,
    transit: transit.ok ? { max: transit.max, min: transit.min, khas: transit.days, belajar: !!transit.learned } : null,
    langkah: darat.steps || [],
    hariDarat: calendarDaysBetweenISO(eta, hari),
    rute,
  };
}

/* KEBUTUHAN vs KENYATAAN KIRIMAN INI.

   Pembandingnya tanggal yang SAMA dengan yang terlihat di kartu: In
   Factory kalau barangnya sudah masuk pabrik (fakta), selain itu
   Estimated Delivery (s.actual, diselaraskan mesin -- atau dipatok
   manual). Hasil:
     { kind: "telat" | "mepet" | "aman" | "tepat" | "belum",
       butuh, sampai, selisih (hari kalender; + = cadangan), fakta } */
function statusKebutuhan(s) {
  if (!s || !s.neededDate || s.mode === "export") return null;
  const butuh = s.neededDate;
  if (s.factoryDate) {
    const selisih = calendarDaysBetweenISO(s.factoryDate, butuh);
    return { kind: selisih >= 0 ? "tepat" : "telat", butuh, sampai: s.factoryDate, selisih, fakta: true };
  }
  const sampai = s.actual || "";
  if (!sampai) return { kind: "belum", butuh, sampai: "", selisih: null, fakta: false };
  const selisih = calendarDaysBetweenISO(sampai, butuh);
  const kind = selisih < 0 ? "telat" : selisih <= KEBUTUHAN_MEPET_HARI ? "mepet" : "aman";
  return { kind, butuh, sampai, selisih, fakta: false };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { rencanaMundur, statusKebutuhan };
}
