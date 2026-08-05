"use strict";

/* CRUD KE SUPABASE */
async function loadShipments() {
  showLoadingSkeleton(3);
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

  /* PREDIKSI DISELARASKAN DI MEMORI, SEBELUM DIGAMBAR.

     Dengan begitu kartu, panel detail, template salin, dan Bulk Export
     semuanya membaca s.actual yang sama — tanpa satu pun berkas itu
     perlu tahu bahwa ada mesin prediksi.

     Tidak ada penulisan ke database di sini. Membuka halaman bukan
     mengubah data; kolom di Supabase baru diperbarui saat masukannya
     benar-benar diubah (tanggal di kartu, tahap dokumen, simpan form). */
  /* Hasil belajar dibuang lebih dulu: cache yang dibangun dari data
     lama akan tetap dipakai untuk data baru, dan perkiraan basi lebih
     berbahaya daripada tidak belajar sama sekali — ia terlihat pasti. */
  if (typeof resetPredictionLearning === "function") resetPredictionLearning();
  if (typeof applyPredictionToAll === "function") {
    applyPredictionToAll(data.import);
  }

  // PENTING: render() harus dipanggil di sini
  render();

  await syncArrivedStatuses();
}

/* ------------------------------------------------------------------
   MENYELARASKAN STATUS TIBA

   Tampilan sudah menganggap sebuah jadwal tiba begitu tanggal Actual
   Delivery terlewati (lihat isArrived() di core/status.js), tapi kolom
   `status` di database bisa tertinggal. Kalau dibiarkan, Bulk Export dan
   template salin akan menuliskan PROCESS untuk barang yang di layar
   sudah ARRIVED — dua sumber kebenaran yang saling bertentangan.

   Dirapikan sekali tiap aplikasi dibuka. Hanya untuk peran exim: viewer
   tidak punya izin menulis, dan mencobanya hanya akan ditolak RLS.
------------------------------------------------------------------ */
async function syncArrivedStatuses() {
  if (typeof canEdit === "function" && !canEdit()) return;

  const tertinggal = [];
  ["import", "export"].forEach((mode) => {
    shipmentsNeedingArrivalSync(data[mode]).forEach((s) =>
      tertinggal.push({ mode, s }),
    );
  });
  if (!tertinggal.length) return;

  const ids = tertinggal.map((x) => x.s.id);
  const { error } = await supabaseClient
    .from("shipments")
    .update({ status: "arrived" })
    .in("id", ids);

  if (error) {
    // Tampilan tetap benar; hanya penyelarasan database yang gagal.
    console.error("Gagal menyelaraskan status tiba:", error);
    return;
  }

  tertinggal.forEach((x) => (x.s.status = "arrived"));
  render();
  showToast(
    `${ids.length} jadwal ditandai tiba — tanggal In Factory / Stuffing-nya sudah terlewati.`,
    "dark",
  );
}

// Kerangka muat (skeleton)
function showLoadingSkeleton(jumlah) {
  emptyState.classList.add("d-none");
  const satu = `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--wide"></div>
      <div class="skeleton-line skeleton-line--mid"></div>
      <div class="skeleton-line skeleton-line--short"></div>
    </div>`;
  cardContainer.innerHTML =
    `<div role="status" aria-live="polite" aria-busy="true">
       <span class="visually-hidden">Memuat jadwal…</span>
       ${satu.repeat(jumlah || 3)}
     </div>`;
}

// Layar gagal: sebutkan APA yang gagal dan APA langkah berikutnya
function showDbErrorState() {
  emptyState.classList.add("d-none");
  cardContainer.innerHTML = `
    <div class="state-panel state-panel--error" role="alert">
      <div class="state-icon"><i class="bi bi-plug"></i></div>
      <div class="state-title">Data tidak bisa dimuat</div>
      <div class="state-desc">
        Sambungan ke database gagal. Periksa <code>SUPABASE_URL</code> dan
        <code>SUPABASE_ANON_KEY</code> di <b>js/config.js</b>, lalu pastikan
        <b>schema-migration.sql</b> sudah dijalankan di Supabase SQL Editor.
      </div>
      <button class="btn btn-teal" onclick="loadShipments()">
        <i class="bi bi-arrow-clockwise"></i> Coba muat ulang
      </button>
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

  // Cara paling sederhana & aman untuk menyamakan daftar barang: hapus semua item lama
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

  // Sama persis dengan pola daftar barang di atas: hapus semua terminal transit lama
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
