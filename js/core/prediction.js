"use strict";

/* ==================================================================
   PENERAPAN KE DATA — fasad mesin prediksi

   Berkas ini TIDAK menghitung apa pun. Ia menyambungkan hasil lapis
   0-4 ke objek pengiriman dan ke database.

   Susunan lapisnya:

     prediction-config.js       angka & aturan (data)
     prediction-rules.js        pemilih aturan
     carrier-master.js          deteksi carrier
     prediction-route.js        Lapis 0
     prediction-eta.js          Lapis 1
     prediction-milestones.js   pembacaan milestone
     prediction-schedule.js     Lapis 2-4
     prediction-confidence.js   keyakinan
     prediction-learning.js     belajar dari riwayat
     prediction.js              berkas ini

   KOLOM YANG DITULIS MESIN — hanya dua:

     eta     saat Mode ETA = auto
     actual  saat Mode Estimated Delivery = auto

   Yang TIDAK pernah ditulis: factory_date (fakta milik pengguna),
   eta_update & etd_update (kotak delay milik pengguna).
==================================================================== */

/* ==================================================================
   PENERAPAN KE DATA

   Mesin ini menulis DUA kolom saja:

     eta     hanya saat Mode ETA = auto
     actual  kolom "Estimated Delivery", hanya saat modenya auto

   Dan tidak pernah menulis:

     factory_date   fakta, milik pengguna
     eta_update     kotak delay, milik pengguna
     etd_update     kotak delay, milik pengguna
================================================================== */

// Mesin ini KHUSUS buku Import. Di Export kolom `actual` berarti
// Stuffing — fakta yang direncanakan orang, bukan perkiraan.

function predictionAppliesTo(s) {
  return !!s && s.mode !== "export";
}
/* Nilai baru untuk sebuah pengiriman. Hanya berisi kolom yang BERUBAH,
   jadi pemanggilnya bisa langsung tahu perlu menyimpan atau tidak. */

function recomputeShipmentDates(s) {
  const patch = {};
  if (!predictionAppliesTo(s)) return patch;

  let dasar = s;

  if (etaModeOf(s) === "auto") {
    const p = predictEta(s);
    if (p.ok && p.eta && p.eta !== s.eta) {
      patch.eta = p.eta;
      // Estimated Delivery harus memakai ETA yang BARU pada putaran yang sama
      dasar = Object.assign({}, s, { eta: p.eta });
    }
  }

  /* Mode manual: kolom Estimated Delivery milik pengguna sepenuhnya.
     Tidak dihitung, tidak ditimpa, tidak "diperbaiki diam-diam". */
  if (deliveryModeOf(s) === "manual") return patch;

  const d = predictDelivery(dasar);
  if (d.ok && d.date && d.date !== s.actual) patch.actual = d.date;

  return patch;
}

// Menerapkan hasil hitung ke objek di memori. Mengembalikan daftar kolom yang berubah.
function applyPredictionToShipment(s) {
  const patch = recomputeShipmentDates(s);
  const berubah = Object.keys(patch);
  berubah.forEach((k) => (s[k] = patch[k]));
  return berubah;
}
/* Dipanggil sekali setelah data selesai dimuat dari Supabase.

   Penyelarasan dilakukan DI MEMORI saja — tidak ada penulisan massal ke
   database saat aplikasi dibuka. Dengan begitu kartu, detail, template
   salin, dan Bulk Export semuanya membaca angka yang sama tanpa satu
   pun berkas lain perlu diubah, dan tanpa membanjiri database dengan
   ratusan UPDATE hanya karena seseorang membuka halaman. */

function applyPredictionToAll(list) {
  let n = 0;
  (list || []).forEach((s) => {
    if (applyPredictionToShipment(s).length) n++;
  });
  return n;
}

/* Hitung ulang lalu simpan. Dipanggil di titik-titik yang MENGUBAH
   masukan: tanggal di kartu, konfirmasi tahap dokumen, penyimpanan
   form.

   Hanya kolom yang benar-benar berubah yang ditulis, dan kalau tidak
   ada yang berubah tidak ada permintaan yang dikirim sama sekali. */
async function refreshShipmentPrediction(s, opsi) {
  const o = opsi || {};
  const berubah = applyPredictionToShipment(s);
  if (!berubah.length) return berubah;

  if (o.render !== false && typeof render === "function") render();

  if (o.persist !== false && typeof persistFields === "function") {
    const patch = {};
    berubah.forEach((k) => (patch[k] = s[k]));
    await persistFields(s.id, patch);
  }
  return berubah;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    recomputeShipmentDates,
    applyPredictionToAll,
    refreshShipmentPrediction,
  };
}
