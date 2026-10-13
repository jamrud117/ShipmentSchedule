"use strict";

/* ==================================================================
   UJI MUNDUR — SEBERAPA TEPAT PREDIKSI PADA RIWAYAT SENDIRI

   Setiap kiriman yang kenyataannya sudah tercatat diprediksi ULANG
   seperti pada hari ia direncanakan:

     - riwayat yang dipakai hanya kiriman yang kenyataannya sudah
       diketahui SEBELUM ETD-nya (tidak mengintip masa depan);
     - "hari ini" disetel ke ETD-nya, supaya lapis kenyataan tidak
       menggeser perkiraan ke tanggal sekarang;
     - semua yang baru diketahui belakangan (sandar, SPPB, tanggal
       pabrik, ETA manual) dikosongkan dari kirimannya.

   Lalu dibandingkan dengan yang benar-benar terjadi:

     ETA       vs kedatangan nyata (ATA, Sandar, Manifest, atau ETA
               manual dari forwarder);
     Delivery  vs Tanggal In Factory (Import saja).

   Angkanya memakai mesin yang SAMA dengan kartu -- termasuk belajar
   dari riwayatnya -- jadi ia mengukur prediksi yang benar-benar dilihat
   pengguna, bukan versi khusus pengujian.
================================================================== */

const UJI_MUNDUR = { generasi: -1, hasil: null };

function tanggalTibaNyata(s) {
  return (
    s.ata ||
    milestoneDateOf(s, "berth") ||
    milestoneDateOf(s, "manifest") ||
    (etaModeOf(s) === "manual" ? s.etaUpdate || s.eta : "")
  );
}

function ringkasMeleset(selisih) {
  if (!selisih.length) return { n: 0 };
  const mutlak = selisih.map(Math.abs);
  const jumlah = (a) => a.reduce((x, y) => x + y, 0);
  return {
    n: selisih.length,
    // Rata-rata meleset (hari), tanpa melihat arahnya
    mae: Math.round((jumlah(mutlak) / selisih.length) * 10) / 10,
    // Positif = prediksi lebih lambat dari kenyataan
    bias: Math.round((jumlah(selisih) / selisih.length) * 10) / 10,
    tepat1: Math.round((mutlak.filter((x) => x <= 1).length / selisih.length) * 100),
    tepat2: Math.round((mutlak.filter((x) => x <= 2).length / selisih.length) * 100),
  };
}

/* Uji mundur dipecah tiga -- siapkan, jalankan (boleh bertahap),
   ringkas -- supaya layar bisa menjalankannya sedikit demi sedikit
   (predictionAccuracyBertahap di bawah). */
function siapkanUjiMundur(list) {
  const fakta = (list || [])
    .filter((s) => s && (s.etdUpdate || s.etd))
    .map((s) => {
      const tiba = tanggalTibaNyata(s);
      const pabrik = s.mode !== "export" ? s.factoryDate || "" : "";
      const tahu = [tiba, milestoneDateOf(s, "sppb"), pabrik].filter(Boolean).sort().pop() || "";
      return { s, tiba, pabrik, tahu, etd: s.etdUpdate || s.etd };
    });
  return {
    hariIni: todayISO(),
    fakta,
    i: 0,
    selisih: { eta: { laut: [], udara: [] }, delivery: { laut: [], udara: [] } },
  };
}

/* Menguji paling banyak `maks` kiriman berikutnya. Riwayat, tanggal
   acuan, dan todayISO ditukar HANYA selama langkah ini dan selalu
   dipulihkan di ujungnya -- di sela dua langkah, kartu & halaman lain
   membaca keadaan yang normal. true = semua kiriman sudah diuji. */
function ujiMundurLangkah(uji, maks) {
  const { fakta, selisih, hariIni } = uji;
  const akhir = Math.min(fakta.length, uji.i + maks);
  const simpan = { riwayat: PREDICTION_HISTORY_OVERRIDE, asOf: PREDICTION_LEARN_ASOF, today: todayISO };
  try {
    for (; uji.i < akhir; uji.i++) {
      const f = fakta[uji.i];
      // Kenyataannya harus sudah terjadi -- ETA manual yang masih di
      // depan baru janji, belum kenyataan.
      if ((!f.tiba && !f.pabrik) || !f.tahu || f.tahu > hariIni) continue;

      PREDICTION_HISTORY_OVERRIDE = fakta.filter((g) => g !== f && g.tahu && g.tahu < f.etd).map((g) => g.s);
      setPredictionAsOf(f.etd);
      todayISO = () => f.etd;

      const rencana = Object.assign({}, f.s, {
        eta: "", etaUpdate: "", etaMode: "auto", ata: "", docProgress: {},
        factoryDate: "", actual: "", deliveryMode: "auto", status: "process",
      });
      const p = predictEta(rencana);
      if (!p.ok || !p.eta) continue;
      const jenis = f.s.transport === "udara" ? "udara" : "laut";
      if (f.tiba) selisih.eta[jenis].push(calendarDaysBetweenISO(f.tiba, p.eta));
      if (f.pabrik) {
        const d = predictDelivery(Object.assign({}, rencana, { eta: p.eta }));
        if (d.ok && d.date) selisih.delivery[jenis].push(calendarDaysBetweenISO(f.pabrik, d.date));
      }
    }
  } finally {
    todayISO = simpan.today;
    PREDICTION_HISTORY_OVERRIDE = simpan.riwayat;
    setPredictionAsOf(simpan.asOf);
  }
  return uji.i >= fakta.length;
}

function ringkasUjiMundur(uji) {
  const { selisih } = uji;
  return {
    eta: { laut: ringkasMeleset(selisih.eta.laut), udara: ringkasMeleset(selisih.eta.udara) },
    delivery: { laut: ringkasMeleset(selisih.delivery.laut), udara: ringkasMeleset(selisih.delivery.udara) },
  };
}

function predictionBacktest(list) {
  const uji = siapkanUjiMundur(list);
  ujiMundurLangkah(uji, Infinity);
  return ringkasUjiMundur(uji);
}

function semuaKirimanDimuat() {
  return typeof data !== "undefined" && data ? (data.import || []).concat(data.export || []) : [];
}

/* Hasil untuk seluruh data yang dimuat, disimpan sekali per generasi
   data (lihat resetPredictionLearning). BERTAHAP: tiap giliran paling
   lama ±12 ms, lalu peramban dibiarkan menanggapi klik & ketikan dulu.
   Sekali jalan, uji mundur ratusan kiriman memakan ratusan milidetik
   tanpa jeda di laptop kantor -- klik yang jatuh di tengahnya baru
   ditanggapi sesudah selesai. Data berubah di tengah jalan -> diulang
   dari awal dengan data baru. */
function predictionAccuracyBertahap(selesai) {
  if (UJI_MUNDUR.generasi === GENERASI_BELAJAR && UJI_MUNDUR.hasil) {
    selesai(UJI_MUNDUR.hasil);
    return;
  }
  const generasi = GENERASI_BELAJAR;
  const uji = siapkanUjiMundur(semuaKirimanDimuat());
  const giliran = () => {
    if (generasi !== GENERASI_BELAJAR) {
      predictionAccuracyBertahap(selesai);
      return;
    }
    const mulai = Date.now();
    let habis = false;
    while (!habis && Date.now() - mulai < 12) habis = ujiMundurLangkah(uji, 3);
    if (!habis) {
      setTimeout(giliran, 0);
      return;
    }
    UJI_MUNDUR.generasi = generasi;
    UJI_MUNDUR.hasil = ringkasUjiMundur(uji);
    selesai(UJI_MUNDUR.hasil);
  };
  giliran();
}
