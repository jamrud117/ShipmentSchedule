"use strict";

/* MAPPING: baris database (snake_case) <-> objek JS (camelCase) */
const FIELD_MAP = {
  transport: "transport",
  docNo: "doc_no",
  docDate: "doc_date",
  noAju: "no_aju",
  party: "party",
  invoice: "invoice",
  /* Tanggal invoice & tanggal Master / House B/L-AWB -- kolom baru,
     migration-ls-tanggal-dokumen.sql. Sebelum migrasinya dijalankan
     jadwal tetap tersimpan tanpa kolom ini (KOLOM_OPSIONAL, api.js). */
  invoiceDate: "invoice_date",
  masterBL: "master_bl",
  masterBLDate: "master_bl_date",
  houseBL: "house_bl",
  houseBLDate: "house_bl_date",
  factoryDate: "factory_date",
  factoryTime: "factory_time",
  /* Dibutuhkan di pabrik (Import) -- rencana mundur ETD/ETA
     (core/prediction-mundur.js). Kolom baru,
     migration-lampiran-lartas-kebutuhan.sql (KOLOM_OPSIONAL). */
  neededDate: "needed_date",
  forwarder: "forwarder",
  forwarderPic: "forwarder_pic",
  vessel: "vessel",
  voyage: "voyage",
  container: "container",
  /* Nomor kendaraan / nomor polisi truk pengangkut (mis. "B 9123 KXT").
     Kolom baru -- migration-vehicle-no.sql. */
  vehicleNo: "vehicle_no",
  muatan: "muatan",
  origin: "origin",
  destination: "destination",
  etd: "etd",
  eta: "eta",
  /* Jam ETD/ETA — OPSIONAL, field TERPISAH dari tanggalnya (pola sama
     dengan factoryTime di atas: teks "HH:MM" polos, bukan digabung
     jadi satu datetime). Kosong = seperti sebelum fitur ini ada,
     seluruh perhitungan yang berbasis tanggal (laneProgress() di
     route-model.js, dst.) tetap jatuh ke presisi hari seperti biasa —
     lihat komentarnya sendiri di sana. */
  etdTime: "etd_time",
  etaTime: "eta_time",
  // TANGGAL UPDATE DELAY (requirement D): jadwal BARU setelah mundur
  etaUpdate: "eta_update",
  etdUpdate: "etd_update",
  /* Cara ETA diperoleh: "auto" (dihitung mesin prediksi) atau "manual"
     (angka dari forwarder). Bukan tanggal — melainkan penentu apakah
     mesin boleh menimpa kolom `eta`. Lihat js/core/prediction.js. */
  etaMode: "eta_mode",
  /* Cara Estimated Delivery diperoleh: "auto" (dihitung mesin) atau
     "manual" (tanggal yang dikunci pengguna untuk laporan). */
  deliveryMode: "delivery_mode",
  actual: "actual",
  status: "status",
  notes: "notes",
  // Kronologi catatan ber-tanggal & jam (jsonb)
  notesLog: "notes_log",
  docProgress: "doc_progress",
  incoterm: "incoterm",
  freight: "freight",
  insurance: "insurance",
  ndpbm: "ndpbm",
  tarif: "tarif",
  bm: "bm",
  ppn: "ppn",
  pph: "pph",
  pi: "pi",
  // LS (Laporan Surveyor, dokumen 958) -- sepaket dengan PI; kolom baru, migrasi yang sama
  ls: "ls",
  /* Tanggal PI & LS, nomor + tanggal Polis Asuransi (dokumen 530) --
     kolom baru, migration-tanggal-pi-ls-polis.sql (KOLOM_OPSIONAL). */
  piDate: "pi_date",
  lsDate: "ls_date",
  polisAsuransi: "polis_asuransi",
  polisAsuransiDate: "polis_asuransi_date",
  // Catatan: shipment-level "skb" SENGAJA tidak ada lagi di sini
  package: "package",
  routeType: "route_type",
};
const NUMERIC_FIELDS = [
  "freight",
  "insurance",
  "ndpbm",
  "tarif",
  "bm",
  "ppn",
  "pph",
];

function columnFor(camelField) {
  return FIELD_MAP[camelField] || camelField;
}

/* Kolom teks yang di database NOT NULL DEFAULT '' -- isian kosong dikirim
   sebagai teks kosong, BUKAN NULL. Kolom lain menyimpan kosong sebagai
   NULL; untuk kolom ini NULL ditolak database ("null value in column
   ... violates not-null constraint") dan seluruh penyimpanannya gagal. */
const KOLOM_TEKS_TANPA_NULL = new Set(["vehicle_no"]);

// Nilai kosong untuk sebuah kolom: "" bagi kolom di atas, NULL bagi yang lain
function nilaiKosongKolom(kolom) {
  return KOLOM_TEKS_TANPA_NULL.has(kolom) ? "" : null;
}

// Payload form (camelCase) -> baris siap INSERT/UPDATE (snake_case)
/* ISIAN TERSEMBUNYI DI BUKU EXPORT: Tanggal & Jam Stuffing
   (factory_date / factory_time).

   Kotaknya disembunyikan di form Export (form.css) karena tanggal
   stuffing Export diisi lewat isian "Stuffing" (actual). Tapi dulu
   nilainya tetap tersimpan dan tetap DIBACA -- oleh urutan daftar,
   mesin prediksi, dan Report -- tanpa pernah terlihat atau bisa diubah.
   Bulk Import bahkan mengisinya: kolom tanggal stuffing di berkas
   Bulk Export mendarat di sini, bukan di isian Stuffing. Hasilnya
   jadwal yang tampak berstuffing hari ini tetap ikut tersalin ke
   Report, karena isian yang dibaca Report kosong.

   Sekarang ditegakkan di SATU titik: saat dibaca, nilai lama dilebur
   ke isian Stuffing yang terlihat (hanya kalau isian itu kosong --
   sama dengan cara daftar dulu menampilkannya), lalu dikosongkan; saat
   disimpan, kolomnya selalu ditulis kosong untuk Export. Data lama
   ikut bersih sendiri begitu jadwalnya disimpan ulang. */
function lepasIsianPabrikExport(s) {
  if (!s || s.mode !== "export") return s;
  if (!s.actual && s.factoryDate) s.actual = s.factoryDate;
  s.factoryDate = "";
  s.factoryTime = "";
  return s;
}

function shipmentToRow(payload, mode) {
  const row = {};
  Object.keys(FIELD_MAP).forEach((camel) => {
    if (!(camel in payload)) return;
    const col = FIELD_MAP[camel];
    let val = payload[camel];
    if (NUMERIC_FIELDS.includes(camel)) {
      val = Number(val) || 0;
    } else if (val === "" || (val == null && KOLOM_TEKS_TANPA_NULL.has(col))) {
      val = nilaiKosongKolom(col); // kosong -> NULL ('' untuk kolom NOT NULL di atas)
    }
    row[col] = val;
  });
  if (mode === "export") {
    row.factory_date = null;
    row.factory_time = null;
  }
  /* DOKUMEN PELENGKAP (PI, LS, Polis Asuransi -- masing-masing bisa lebih
     dari satu -- & dokumen lain) di kolom jsonb dokumen_pelengkap
     (migration-dokumen-pelengkap.sql; KOLOM_OPSIONAL). Kolom lama pi /
     pi_date, ls / ls_date, polis_asuransi / polis_asuransi_date tetap
     ditulis sebagai ringkasannya. Tanpa dokumen apa pun: NULL. */
  if ("dokPelengkap" in payload) {
    const dok = rapikanDokPelengkap(payload.dokPelengkap);
    row.dokumen_pelengkap = adaDokPelengkap(dok) ? dok : null;
    const ringkas = ringkasDokPelengkap(dok);
    Object.keys(ringkas).forEach((camel) => (row[FIELD_MAP[camel]] = ringkas[camel] || null));
  }
  return row;
}

// Baris dari Supabase (snake_case + items[] hasil join) -> objek shipment (camelCase)
function rowToShipment(row) {
  const s = { id: row.id, mode: row.mode };
  Object.keys(FIELD_MAP).forEach((camel) => {
    const col = FIELD_MAP[camel];
    let val = row[col];
    if (NUMERIC_FIELDS.includes(camel)) {
      val = Number(val) || 0;
    } else if (val == null) {
      val = "";
    }
    s[camel] = val;
  });
  lepasIsianPabrikExport(s);
  /* Daftar dokumen pelengkap: kolom dokumen_pelengkap, atau -- jadwal
     sebelum kolom itu ada -- kolom lama (nomor "A, B" dipecah). Isian
     lama (s.pi, s.piDate, ...) jadi ringkasannya. */
  s.dokPelengkap = row.dokumen_pelengkap ? rapikanDokPelengkap(row.dokumen_pelengkap) : dokPelengkapJadwal(s);
  Object.assign(s, ringkasDokPelengkap(s.dokPelengkap));
  s.items = (row.items || []).map(rowToItem);
  // Terminal transit diurutkan berdasar "seq" di sini
  s.routeStops = (row.routeStops || [])
    .map(rowToStop)
    .sort((a, b) => a.seq - b.seq);
  return s;
}

function itemToRow(it, shipmentId) {
  return {
    shipment_id: shipmentId,
    /* Kolom barang CEISA (KOLOM_NAMA_BARANG, helpers.js); Uraian tetap
       di nama_barang. Kolom lainnya dari migration-barang-ceisa.sql --
       sebelum dijalankan, sisipkanBarang() (api.js) meleburnya ke
       Uraian (kode kondisi & negara asal ditinggalkan). Kolom lama
       (size, pattern, mold_no, po_no) tidak lagi ditulis. */
    kode_barang: it.kodeBarang || "",
    nama_barang: it.namaBarang || "",
    merek: it.merek || "",
    tipe: it.tipe || "",
    ukuran: it.ukuran || "",
    spesifikasi_lain: it.spesifikasiLain || "",
    // Kode CEISA per barang (migration-barang-ceisa.sql): 1/2 & kode negara ISO
    kode_kondisi_barang: it.kondisiBarang || "",
    kode_negara_asal: it.negaraAsal || "",
    marks: it.marks || "",
    hs_code: it.hsCode || "",
    jenis_barang: it.jenisBarang || "",
    qty: parseLooseNumber(it.qty),
    satuan: it.satuan || "",
    harga: parseLooseNumber(it.harga),
    netto: parseLooseNumber(it.netto),
    bruto: parseLooseNumber(it.bruto),
    // Kemasan per barang (Jumlah+Jenis utk import, dimensi P*L*T utk export
    package: it.package || "",
    packing: it.packing || "",
    packing_unit: it.packingUnit || "",
    // PI barang ini & nomor urutnya di dokumen PI (migration-dokumen-pelengkap.sql)
    pi_nomor: String(it.piNomor || "").trim(),
    pi_no_item: String(it.piNoItem || "").trim(),
    // Fasilitas per barang — SKB & COO (tersimpan "E-COO") 1 array yang sama
    skb: sanitizeSkbList(it.skb),
  };
}

/* BARANG LAMA. Sebelum kolom CEISA ada, buku Export menyimpan Pattern,
   Size & Mold No di kolomnya sendiri (pattern, size, mold_no). Isinya
   dilebur ke Uraian dengan urutan nama lamanya -- Uraian, Pattern,
   Size, Mold No -- jadi nama yang tampil, tersalin & tercetak tetap
   sama persis, dan tidak ada isian yang dipindah ke kolom CEISA yang
   belum tentu benar. Kolom CEISA lainnya tetap kosong: barang lama
   dibandingkan per kata di Cek PIB/PEB (barangBerkolomCeisa). PO No
   bukan kolom CEISA dan memang tidak pernah ikut ke nama barang.
   Begitu jadwalnya disimpan ulang, barangnya tertulis dalam susunan
   baru (itemToRow tidak menulis kolom lama). */
function uraianBarangTersimpan(row) {
  const lama = [row.pattern, row.size, row.mold_no];
  if (!lama.some((v) => rapiBagianNama(v))) return row.nama_barang || "";
  return rakitBagianNama([row.nama_barang].concat(lama).map((v) => ({ teks: rapiBagianNama(v) })))
    .map((b) => b.teks)
    .join(" ");
}

function rowToItem(row) {
  return {
    id: row.id,
    kodeBarang: row.kode_barang || "",
    namaBarang: uraianBarangTersimpan(row),
    merek: row.merek || "",
    tipe: row.tipe || "",
    ukuran: row.ukuran || "",
    spesifikasiLain: row.spesifikasi_lain || "",
    // Barang lama / sebelum migrasi: kosong ("Belum diisi"), bukan bawaan 1 = BARU
    kondisiBarang: row.kode_kondisi_barang || "",
    negaraAsal: row.kode_negara_asal || "",
    marks: row.marks || "",
    hsCode: row.hs_code || "",
    /* Dibakukan di sini, satu pintu. Jadwal lama menyimpan
       "Bahan Baku"; tanpa ini ia tidak akan cocok dengan daftar
       pilihan yang sekarang huruf besar semua. */
    jenisBarang: normalisasiJenisBarang(row.jenis_barang),
    qty: parseLooseNumber(row.qty),
    satuan: row.satuan || "",
    harga: parseLooseNumber(row.harga),
    netto: parseLooseNumber(row.netto),
    bruto: parseLooseNumber(row.bruto),
    package: row.package || "",
    packing: row.packing || "",
    packingUnit: row.packing_unit || "",
    piNomor: row.pi_nomor || "",
    piNoItem: row.pi_no_item || "",
    skb: sanitizeSkbList(row.skb),
    _facOpen: false,
  };
}

// Terminal transit (shipment_route_stops)
function stopToRow(st, shipmentId, seq) {
  return {
    shipment_id: shipmentId,
    seq: seq,
    terminal: st.terminal || "",
    transport: st.transport || "laut",
    vessel: st.vessel || "",
    voyage: st.voyage || "",
    arrival_date: st.arrivalDate || null,
    departure_date: st.departureDate || null,
  };
}

function rowToStop(row) {
  return {
    id: row.id,
    seq: Number(row.seq) || 1,
    terminal: row.terminal || "",
    transport: row.transport || "laut",
    vessel: row.vessel || "",
    voyage: row.voyage || "",
    arrivalDate: row.arrival_date || "",
    departureDate: row.departure_date || "",
  };
}
