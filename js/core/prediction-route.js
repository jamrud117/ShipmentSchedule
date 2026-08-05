"use strict";

/* ==================================================================
   LAPIS 0 — RESOLUSI RUTE

   Menentukan SIAPA dan KE MANA, tanpa menghitung satu hari pun:
   negara & pelabuhan asal/tujuan, moda, tipe pengiriman, carrier.

   Sengaja berdiri sendiri supaya bisa diperiksa terpisah. Kalau ETA
   terlihat aneh, pertanyaan pertamanya selalu "rutenya kebaca benar
   tidak" — dan lapis ini menjawabnya tanpa perlu membaca angka apa pun.

   Bergantung pada: prediction-config, prediction-rules, unlocode,
   carrier-master.
==================================================================== */

/* ==================================================================
   MESIN PREDIKSI BERLAPIS

   Bukan satu rumus "ETD + sekian hari", melainkan lima lapis yang
   berdiri sendiri. Tiap lapis boleh diganti tanpa menyentuh yang lain,
   dan tiap lapis bisa dijelaskan ke pengguna sebagai satu kalimat.

     LAPIS 0  RESOLUSI RUTE
              Menentukan negara & pelabuhan asal/tujuan, moda, tipe
              pengiriman, dan direct/transit. Tidak menghitung apa pun.
              Semua lapis di atasnya bergantung pada hasil lapis ini —
              rute yang salah kenal membuat sisanya rapi tapi keliru.

     LAPIS 1  TRANSPORTASI  ->  ETA
              ETD + lama transit + penyesuaian carrier. Hari kalender.
              TIDAK PERNAH bergantung pada dokumen kepabeanan.

     LAPIS 2  OPERASIONAL   ->  Estimated Delivery
              Dari ETA: stripping (LCL) + clearance + antar ke pabrik.
              Hari kerja.

     LAPIS 3  MILESTONE
              Tiap Manifest/PIB/SPPB yang dikonfirmasi menggantikan
              dasar hitungan, dan hanya sisa prosesnya yang dihitung.

     LAPIS 4  KENYATAAN
              Kalau tanggal hasil hitungan sudah lewat sementara barang
              belum sampai, dasarnya digeser ke HARI INI. Perkiraan
              yang tanggalnya di masa lalu tidak memberi tahu apa pun.

   DI LUAR LAPIS: belajar dari riwayat (prediction-learning.js)
   menggantikan angka konfigurasi dengan yang benar-benar terjadi di
   rute itu, begitu datanya cukup.

   YANG TIDAK PERNAH DISENTUH: Tanggal In Factory (s.factoryDate) —
   fakta yang diketik pengguna. Mesin hanya membacanya.

   Seluruh angka ada di prediction-config.js.
================================================================== */

/* ==================================================================
   (bagian lama, tetap berlaku)

   1. PREDIKSI ETA
      Kapan alat angkut sampai di pelabuhan/bandara tujuan.
      Hanya bergantung pada informasi PENGANGKUTAN: ETD, tipe
      pengiriman, rute, direct/transit. Dokumen kepabeanan TIDAK
      berpengaruh sama sekali — Manifest terbit lebih cepat tidak
      membuat kapalnya berlayar lebih kencang.

   2. PREDIKSI ESTIMATED DELIVERY
      Kapan barang sampai di PABRIK. Selalu dihitung dari ETA, tidak
      pernah langsung dari ETD, lalu diperhalus tiap kali sebuah
      milestone dikonfirmasi.

   YANG TIDAK PERNAH DISENTUH MESIN INI: Tanggal In Factory
   (s.factoryDate). Itu FAKTA yang diketik pengguna saat barang
   benar-benar masuk pabrik. Mesin hanya MEMBACANYA — dan begitu terisi,
   seluruh perkiraan berhenti dan digantikan tanggal itu.

   Seluruh angka ada di js/core/prediction-config.js. Tidak ada satu pun
   lama hari yang ditulis di berkas ini.
================================================================== */

/* ------------------------------------------------------------------
   TIPE PENGIRIMAN

   Diturunkan dari kolom yang SUDAH ada — Moda Transportasi & Jenis
   Muatan — supaya tidak ada field baru yang harus diisi ulang untuk
   ribuan jadwal lama.
------------------------------------------------------------------ */

function predictionShipmentType(src) {
  if (!src) return PREDICTION_CONFIG.defaultSeaType;
  if (src.transport === "udara") return "AIR";
  const muatan = String(src.muatan || "").trim().toUpperCase();
  if (muatan === "LCL") return "SEA_LCL";
  if (muatan === "FCL") return "SEA_FCL";
  return PREDICTION_CONFIG.defaultSeaType;
}
function predictionShipmentTypeLabel(key) {
  const t = PREDICTION_CONFIG.shipmentTypes[key];
  return (t && t.label) || key || "—";
}

// Muatan belum diisi -> tipenya masih tebakan, dan itu dikatakan apa adanya.
function predictionTypeIsAssumed(src) {
  if (!src || src.transport === "udara") return false;
  const muatan = String(src.muatan || "").trim().toUpperCase();
  return muatan !== "FCL" && muatan !== "LCL";
}
/* ------------------------------------------------------------------
   KONTEKS

   Satu bentuk yang sama, baik sumbernya objek shipment maupun isian
   form yang belum tersimpan. Semua pencocokan aturan membaca dari sini.
------------------------------------------------------------------ */

function predictionContext(src) {
  const s = src || {};
  const fromPort =
    typeof resolvePortCode === "function" ? resolvePortCode(s.origin) : "";
  const toPort =
    typeof resolvePortCode === "function" ? resolvePortCode(s.destination) : "";
  return {
    etd: s.etd || "",
    /* ETD yang BERLAKU. Kotak "Tanggal Update Delay" berisi jadwal
       BARU setelah mundur — begitu terisi, itulah tanggal berangkat
       yang sebenarnya, dan seluruh hitungan harus bertumpu padanya.
       Kalau kolom ini diabaikan, kapal yang berangkat lima hari
       lebih lambat tetap diperkirakan tiba pada tanggal rencana. */
    etdEffective: s.etdUpdate || s.etd || "",
    transport: s.transport || "laut",
    muatan: s.muatan || "",
    routeType: s.routeType === "transit" ? "transit" : "direct",
    forwarder: s.forwarder || "",
    /* Carrier DITERJEMAHKAN dari nama kapal / no. penerbangan, bukan
       dipilih pengguna. Lihat js/core/carrier-master.js. */
    carrier:
      typeof carrierCodeOf === "function" ? carrierCodeOf(s) : "",
    carrierKind:
      typeof detectCarrier === "function" ? detectCarrier(s).kind : "",
    /* Tingkat layanan kurir — Priority / Economy. Menentukan komitmen
       waktu pintu-ke-pintu, jadi ia dimensi pencocokan tersendiri. */
    service:
      typeof detectCourierService === "function"
        ? detectCourierService(`${s.vessel || ""} ${s.voyage || ""}`)
        : "",
    vessel: s.vessel || "",
    voyage: s.voyage || "",
    origin: s.origin || "",
    destination: s.destination || "",
    fromPort: fromPort,
    toPort: toPort,
    /* Negara diambil dari TABEL referensi, bukan dari memotong dua
       huruf pertama kode. Bentuk pendek tidak lagi membawa negaranya —
       memotong "CGK" akan menghasilkan "CG", Republik Kongo. */
    fromCountry:
      typeof resolvePortCountry === "function" ? resolvePortCountry(s.origin) : "",
    toCountry:
      typeof resolvePortCountry === "function"
        ? resolvePortCountry(s.destination)
        : "",
    shipmentType: predictionShipmentType(s),
  };
}
/* ==================================================================
   LAPIS 0 — RESOLUSI RUTE

   Dipisah dari perhitungan supaya bisa DIPERIKSA sendiri. Kalau ETA
   terlihat aneh, pertanyaan pertamanya selalu "rutenya kebaca benar
   tidak" — dan lapis ini menjawabnya tanpa perlu membaca satu pun
   angka hari.

   `gaps` mendaftar apa yang belum diketahui. Bukan galat: pengiriman
   bisa saja belum tahu pelabuhan bongkarnya. Tapi tiap kekosongan
   menurunkan keyakinan, dan pengguna berhak tahu yang mana.
================================================================== */

function resolveRouteLayer(src) {
  const ctx = predictionContext(src);
  const gaps = [];

  if (!ctx.origin) gaps.push("Pelabuhan/bandara asal belum diisi");
  else if (!ctx.fromPort) gaps.push(`Asal "${ctx.origin}" tidak dikenali`);

  if (!ctx.destination) gaps.push("Pelabuhan/bandara tujuan belum diisi");
  else if (!ctx.toPort) gaps.push(`Tujuan "${ctx.destination}" tidak dikenali`);

  if (predictionTypeIsAssumed(src)) gaps.push("Jenis Muatan belum diisi");
  if (!ctx.etd) gaps.push("ETD belum diisi");

  return {
    ...ctx,
    originName: portDisplayName(ctx.fromPort),
    destinationName: portDisplayName(ctx.toPort),
    shipmentTypeLabel: predictionShipmentTypeLabel(ctx.shipmentType),
    typeAssumed: predictionTypeIsAssumed(src),
    routeResolved: !!(ctx.fromPort && ctx.toPort),
    gaps,
  };
}
function portDisplayName(kode) {
  if (!kode || typeof resolvePortEntry !== "function") return "";
  const e = resolvePortEntry(kode);
  return e ? e.name : "";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    predictionShipmentType,
    predictionContext,
    resolveRouteLayer,
  };
}
