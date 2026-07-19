"use strict";

/* ==================================================================
   MAPPING: baris database (snake_case) <-> objek JS (camelCase)
   Tujuannya supaya seluruh kode render/hitung di bawah ini (yang
   sudah ditulis memakai nama field camelCase seperti sebelumnya)
   TIDAK perlu diubah sama sekali.
================================================================== */
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
  actual: "actual",
  status: "status",
  notes: "notes",
  incoterm: "incoterm",
  freight: "freight",
  insurance: "insurance",
  ndpbm: "ndpbm",
  tarif: "tarif",
  bm: "bm",
  ppn: "ppn",
  pph: "pph",
  pi: "pi",
  // Catatan: shipment-level "skb" SENGAJA tidak ada lagi di sini — SKB
  // sekarang dicatat per barang (lihat shipment_items.skb di
  // itemToRow/rowToItem). Kolom shipments.skb di database dibiarkan ada
  // untuk data lama, tapi aplikasi tidak baca/tulis ke situ lagi.
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
  // Terminal transit diurutkan berdasar "seq" di sini (bukan lewat query
  // Supabase) supaya tidak bergantung pada dukungan order-by-embedded-
  // resource versi supabase-js tertentu — lebih aman & predictable.
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
    qty: Number(it.qty) || 0,
    satuan: it.satuan || "",
    harga: Number(it.harga) || 0,
    netto: Number(it.netto) || 0,
    bruto: Number(it.bruto) || 0,
    // Fasilitas per barang — SKB & E-COO 1 array yang sama (entri
    // dengan jenis "E-COO" = sertifikat asal, sisanya = surat bebas
    // pajak). sanitizeSkbList di sini cuma jaga-jaga field tidak
    // lengkap/rusak sebelum dikirim ke Supabase. Entri dengan
    // nomor+tanggal kosong TETAP disimpan (mis. baru pilih jenisnya,
    // belum sempat isi nomor) — dibiarkan apa adanya, bukan tugas
    // layer ini untuk memvalidasi. Kolom e_coo/e_coo_nomor/
    // e_coo_tanggal di DB sudah DEPRECATED, tidak lagi ditulis dari
    // sini — lihat migrasi di schema.sql.
    skb: sanitizeSkbList(it.skb),
  };
}

function rowToItem(row) {
  return {
    id: row.id,
    namaBarang: row.nama_barang || "",
    hsCode: row.hs_code || "",
    jenisBarang: row.jenis_barang || "",
    qty: Number(row.qty) || 0,
    satuan: row.satuan || "",
    harga: Number(row.harga) || 0,
    netto: Number(row.netto) || 0,
    bruto: Number(row.bruto) || 0,
    skb: sanitizeSkbList(row.skb),
    _facOpen: false,
  };
}

// Terminal transit (shipment_route_stops) — field transport/vessel/voyage
// pada 1 baris menjelaskan leg yang MEMBAWA barang TIBA di terminal itu.
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
