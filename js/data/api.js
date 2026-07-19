"use strict";

/* ==================================================================
   CRUD KE SUPABASE
================================================================== */
async function loadShipments() {
  const { data: rows, error } = await supabaseClient
    .from("shipments")
    .select("*, items:shipment_items(*), routeStops:shipment_route_stops(*)")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    showDbErrorState();
    return;
  }

  data.import = [];
  data.export = [];

  (rows || []).forEach((row) => {
    const s = rowToShipment(row);
    if (data[row.mode]) data[row.mode].push(s);
  });

  // render() dihapus dari sini
}

function showDbErrorState() {
  emptyState.classList.add("d-none");
  cardContainer.innerHTML = `
    <div class="empty-state">
      <i class="bi bi-plug"></i>
      <h5 class="mt-3 mb-1" style="font-family:var(--font-display); color:var(--navy)">Gagal memuat data dari database</h5>
      <p class="mb-0">Pastikan <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code> di bagian atas <b>script.js</b> sudah diisi dengan benar, dan <b>schema.sql</b> sudah dijalankan lewat Supabase SQL Editor. Cek juga tab Console di browser untuk detail error.</p>
    </div>`;
}

async function createShipment(payload, items, stops) {
  const row = shipmentToRow(payload);
  row.mode = activeMode;
  const { data: inserted, error } = await supabaseClient
    .from("shipments")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  if (items.length) {
    const itemRows = items.map((it) => itemToRow(it, inserted.id));
    const { error: itemErr } = await supabaseClient
      .from("shipment_items")
      .insert(itemRows);
    if (itemErr) throw itemErr;
  }
  if (stops && stops.length) {
    const stopRows = stops.map((st, i) => stopToRow(st, inserted.id, i + 1));
    const { error: stopErr } = await supabaseClient
      .from("shipment_route_stops")
      .insert(stopRows);
    if (stopErr) throw stopErr;
  }
  return inserted;
}

async function updateShipmentRecord(id, payload, items, stops) {
  const row = shipmentToRow(payload);
  const { error } = await supabaseClient
    .from("shipments")
    .update(row)
    .eq("id", id);
  if (error) throw error;

  // Cara paling sederhana & aman untuk menyamakan daftar barang:
  // hapus semua item lama, lalu masukkan ulang daftar item yang berlaku sekarang.
  const { error: delErr } = await supabaseClient
    .from("shipment_items")
    .delete()
    .eq("shipment_id", id);
  if (delErr) throw delErr;

  if (items.length) {
    const itemRows = items.map((it) => itemToRow(it, id));
    const { error: insErr } = await supabaseClient
      .from("shipment_items")
      .insert(itemRows);
    if (insErr) throw insErr;
  }

  // Sama persis dengan pola daftar barang di atas: hapus semua terminal
  // transit lama, lalu masukkan ulang daftar yang berlaku sekarang. Kalau
  // route_type = "direct", "stops" yang dikirim ke sini sudah dikosongkan
  // duluan oleh pemanggilnya, jadi baris lama otomatis ikut terhapus.
  const { error: delStopErr } = await supabaseClient
    .from("shipment_route_stops")
    .delete()
    .eq("shipment_id", id);
  if (delStopErr) throw delStopErr;

  if (stops && stops.length) {
    const stopRows = stops.map((st, i) => stopToRow(st, id, i + 1));
    const { error: insStopErr } = await supabaseClient
      .from("shipment_route_stops")
      .insert(stopRows);
    if (insStopErr) throw insStopErr;
  }
}

async function persistFields(id, patch) {
  const row = {};
  Object.keys(patch).forEach((camel) => {
    row[columnFor(camel)] = patch[camel] === "" ? null : patch[camel];
  });
  const { error } = await supabaseClient
    .from("shipments")
    .update(row)
    .eq("id", id);
  if (error) {
    console.error(error);
    showToast(
      "Gagal menyimpan perubahan ke database — memuat ulang data.",
      "danger",
    );
    loadShipments();
  }
}
