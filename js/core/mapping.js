"use strict";

/* MAPPING: baris database (snake_case) <-> objek JS (camelCase) */
const FIELD_MAP = {
  transport: "transport",
  docNo: "doc_no",
  docDate: "doc_date",
  noAju: "no_aju",
  party: "party",
  invoice: "invoice",
  masterBL: "master_bl",
  houseBL: "house_bl",
  factoryDate: "factory_date",
  factoryTime: "factory_time",
  forwarder: "forwarder",
  forwarderPic: "forwarder_pic",
  vessel: "vessel",
  voyage: "voyage",
  container: "container",
  muatan: "muatan",
  origin: "origin",
  destination: "destination",
  etd: "etd",
  eta: "eta",
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

// Payload form (camelCase) -> baris siap INSERT/UPDATE (snake_case)
function shipmentToRow(payload) {
  const row = {};
  Object.keys(FIELD_MAP).forEach((camel) => {
    if (!(camel in payload)) return;
    const col = FIELD_MAP[camel];
    let val = payload[camel];
    if (NUMERIC_FIELDS.includes(camel)) {
      val = Number(val) || 0;
    } else if (val === "") {
      val = null; // tanggal/teks kosong disimpan sebagai NULL di database
    }
    row[col] = val;
  });
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
    nama_barang: it.namaBarang || "",
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
    // Fasilitas per barang — SKB & E-COO 1 array yang sama
    skb: sanitizeSkbList(it.skb),
  };
}

function rowToItem(row) {
  return {
    id: row.id,
    namaBarang: row.nama_barang || "",
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
