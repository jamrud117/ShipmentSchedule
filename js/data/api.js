"use strict";

/* CRUD KE SUPABASE */

/* Nomor urut permintaan muat.

   loadShipments() dipanggil dari delapan tempat — masuk aplikasi,
   simpan form, impor massal, tombol coba lagi, dan penangan galat
   persistFields. Tidak ada satu pun yang menunggu yang lain selesai.

   Dua muat yang bertumpang berarti jawaban yang datang TERAKHIR yang
   menang, bukan yang paling baru diminta. Urutan itu tidak dijamin:
   permintaan pertama bisa saja lebih lambat sampai. Akibatnya papan
   menampilkan data yang lebih lama daripada yang sudah ada di layar —
   perubahan yang baru disimpan tampak hilang, lalu muncul lagi saat
   muat berikutnya.

   Nomor urut ini membuat jawaban yang sudah kedaluwarsa dibuang
   diam-diam: yang menang selalu permintaan TERBARU. */
let muatKe = 0;

/* Penanda apakah jadwal sudah selesai dimuat dari database.
   Dibaca router(): sebelum ini true, #/edit/<id> yang tidak ketemu
   BUKAN berarti jadwalnya tidak ada -- datanya memang belum sampai. */
let shipmentsLoaded = false;

function kueriShipments() {
  return supabaseClient
    .from("shipments")
    .select("*, items:shipment_items(*), routeStops:shipment_route_stops(*)")
    .order("created_at", { ascending: true });
}

/* AMBIL LEBIH AWAL. Jadwal tidak bergantung pada profil pengguna --
   RLS membaca sesinya -- jadi permintaannya dimulai begitu sesi
   diketahui, BERSAMAAN dengan pengambilan profil, bukan sesudahnya.
   Satu perjalanan bolak-balik ke server lebih sedikit sebelum papan
   terisi; dari Indonesia ke server Supabase itu ratusan milidetik.

   `.then()` yang memulainya: kueri Supabase baru berjalan saat
   ditunggu. Hasilnya hanya dipakai SATU KALI oleh loadShipments()
   berikutnya; kalau login ternyata ditolak, initApp membuangnya. */
let ambilAwalShipments = null;
function mulaiAmbilShipments() {
  if (ambilAwalShipments || typeof supabaseClient === "undefined" || !supabaseClient) return;
  ambilAwalShipments = kueriShipments().then((hasil) => hasil);
}
function buangAmbilAwalShipments() {
  ambilAwalShipments = null;
}

async function loadShipments() {
  const nomor = ++muatKe;
  showLoadingSkeleton(3);
  const permintaan = ambilAwalShipments || kueriShipments();
  ambilAwalShipments = null;
  const { data: rows, error } = await permintaan;

  /* Sudah ada permintaan yang lebih baru — jawaban ini punah. Termasuk
     galatnya: menampilkan layar gagal untuk permintaan usang akan
     menghapus data yang barusan berhasil dimuat. */
  if (nomor !== muatKe) return;

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
  // Saran kapal/pesawat dari riwayat baru bisa disusun setelah datanya sampai
  if (typeof refreshCarrierDatalists === "function") refreshCarrierDatalists();
  if (typeof applyPredictionToAll === "function") {
    applyPredictionToAll(data.import);
  }

  // PENTING: render() harus dipanggil di sini
  shipmentsLoaded = true;
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
    t("x.jadwal.ditandai.tiba", { n: ids.length }),
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
       <span class="visually-hidden">${tt("Memuat jadwal…", "Loading schedules…")}</span>
       ${satu.repeat(jumlah || 3)}
     </div>`;
}

// Layar gagal: sebutkan APA yang gagal dan APA langkah berikutnya
function showDbErrorState() {
  emptyState.classList.add("d-none");
  cardContainer.innerHTML = `
    <div class="state-panel state-panel--error" role="alert">
      <div class="state-icon"><i class="bi bi-plug"></i></div>
      <div class="state-title">${tt("Data tidak bisa dimuat", "Data could not be loaded")}</div>
      <div class="state-desc">${tt(
        `Sambungan ke database gagal. Periksa <code>SUPABASE_URL</code> dan
        <code>SUPABASE_ANON_KEY</code> di <b>js/config.js</b>, lalu pastikan
        <b>schema-migration.sql</b> sudah dijalankan di Supabase SQL Editor.`,
        `The database connection failed. Check <code>SUPABASE_URL</code> and
        <code>SUPABASE_ANON_KEY</code> in <b>js/config.js</b>, then make sure
        <b>schema-migration.sql</b> has been run in the Supabase SQL Editor.`,
      )}</div>
      <button class="btn btn-teal" onclick="loadShipments()">
        <i class="bi bi-arrow-clockwise"></i> ${tt("Coba muat ulang", "Try reloading")}
      </button>
    </div>`;
}

/* KOLOM BARU YANG MUNGKIN BELUM DIMIGRASI. Kalau database belum
   mengenalnya, jadwal disimpan ulang TANPA kolom itu -- data lain tetap
   tersimpan -- dan pengguna diberi tahu berkas migrasi mana yang perlu
   dijalankan. Tanpa ini, satu kolom yang belum ada menggagalkan seluruh
   penyimpanan jadwal.

   Tiap penyimpanan mencoba kolomnya lagi (tidak diingat sepanjang sesi):
   begitu migrasinya dijalankan, simpan berikutnya langsung ikut, tanpa
   perlu memuat ulang halaman. */
const KOLOM_OPSIONAL = {
  vehicle_no: { berkas: "migration-vehicle-no.sql", nama: "No. Kendaraan" },
  ls: { berkas: "migration-ls-tanggal-dokumen.sql", nama: "LS" },
  invoice_date: { berkas: "migration-ls-tanggal-dokumen.sql", nama: "Tanggal Invoice" },
  master_bl_date: { berkas: "migration-ls-tanggal-dokumen.sql", nama: "Tanggal Master B/L-AWB" },
  house_bl_date: { berkas: "migration-ls-tanggal-dokumen.sql", nama: "Tanggal House B/L-AWB" },
};

/* Kolom opsional mana yang TIDAK DIKENAL database -- dan hanya itu.
   PGRST204 = kolom tidak ada di cache skema PostgREST, 42703 = kolom
   tidak ada di tabel. Galat lain yang kebetulan menyebut nama kolomnya
   (mis. "null value in column "vehicle_no" violates not-null
   constraint") BUKAN tanda migrasi belum jalan. Dulu tertangkap sebagai
   itu: kolomnya dibuang dari SEMUA penyimpanan berikutnya sampai halaman
   dimuat ulang, dan No. Kendaraan tidak pernah tersimpan walau
   migrasinya sudah dijalankan. */
function kolomBelumDikenal(error, daftar) {
  if (!error) return null;
  const pesan = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  const kolomHilang =
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /could not find the '\w+' column|column "?[\w.]+"? (?:of relation "?[\w.]+"? )?does not exist/i.test(pesan);
  if (!kolomHilang) return null;
  // Nama kolom utuh: "ls" tidak boleh tertangkap dari kata lain ("details")
  return (daftar || Object.keys(KOLOM_OPSIONAL)).find((k) => new RegExp(`(^|[^\\w])${k}([^\\w]|$)`).test(pesan)) || null;
}

/* KOLOM BARANG CEISA YANG MUNGKIN BELUM DIMIGRASI
   (migration-barang-ceisa.sql). Daftar barang disimpan dengan cara
   hapus semua lalu sisipkan, jadi sisipan yang ditolak karena kolomnya
   belum ada berarti barangnya HILANG. Ditolak karena itu -> disisipkan
   ulang tanpa kolom baru, seluruh nama barang (Kode Barang s.d.
   Spesifikasi Lain) dilebur ke Uraian -- nama yang tampil tetap sama --
   dan pengguna diberi tahu berkas migrasinya. */
const KOLOM_BARANG_CEISA = ["kode_barang", "merek", "tipe", "ukuran", "spesifikasi_lain"];

async function sisipkanBarang(items, shipmentId, kirimBaris) {
  if (!items.length) return;
  const rows = items.map((it) => itemToRow(it, shipmentId));
  const kirim = kirimBaris || ((r) => supabaseClient.from("shipment_items").insert(r));
  let { error } = await kirim(rows);
  if (error && kolomBelumDikenal(error, KOLOM_BARANG_CEISA)) {
    const lebur = rows.map((r, i) => {
      const x = Object.assign({}, r, { nama_barang: itemDisplayName(items[i]) });
      KOLOM_BARANG_CEISA.forEach((k) => delete x[k]);
      return x;
    });
    ({ error } = await kirim(lebur));
    if (!error && typeof showToast === "function") {
      showToast(
        tt(
          "Jadwal tersimpan, tetapi kolom Kode Barang, Merek, Tipe, Ukuran & Spesifikasi Lain belum: database belum mengenal kolomnya, jadi isinya digabung ke Uraian. Jalankan migration-barang-ceisa.sql di Supabase (aman diulang).",
          "Schedule saved, but Item Code, Brand, Type, Size & Other Specification were not: the database does not know the columns yet, so they were merged into the Description. Run migration-barang-ceisa.sql in Supabase (safe to re-run).",
        ),
        "warning",
      );
    }
  }
  if (error) throw error;
}

/* Satu kolom yang belum dikenal dibuang per percobaan -- beberapa kolom
   dari migrasi yang sama (LS & tanggal dokumen) bisa sama-sama belum
   ada, jadi dicoba sampai tidak ada lagi yang ditolak. */
async function simpanDenganCadangan(kirim, row) {
  let hasil = await kirim(row);
  const tertinggal = [];
  for (let i = 0; i < Object.keys(KOLOM_OPSIONAL).length; i++) {
    const kolom = kolomBelumDikenal(hasil.error);
    if (!kolom || !(kolom in row)) break;
    /* Diberi tahu HANYA kalau ada isian yang benar-benar tidak ikut
       tersimpan. Kolom yang memang kosong (No. Kendaraan tidak diisi)
       tidak kehilangan apa pun -- peringatan di situ cuma gangguan. */
    if (row[kolom] != null && String(row[kolom]).trim() !== "") tertinggal.push(KOLOM_OPSIONAL[kolom]);
    delete row[kolom];
    hasil = await kirim(row);
  }
  if (tertinggal.length && typeof showToast === "function") {
    const nama = tertinggal.map((k) => k.nama).join(", ");
    const berkas = [...new Set(tertinggal.map((k) => k.berkas))].join(" & ");
    showToast(tt(`Jadwal tersimpan, tetapi ${nama} belum: database belum mengenal kolomnya. Jalankan ${berkas} di Supabase (aman diulang).`,
      `Schedule saved, but ${nama} was not: the database does not know the column yet. Run ${berkas} in Supabase (safe to re-run).`), "warning");
  }
  return hasil;
}

async function createShipment(payload, items, stops) {
  const row = shipmentToRow(payload, activeMode);
  row.mode = activeMode;
  const { data: inserted, error } = await simpanDenganCadangan(
    (r) => supabaseClient.from("shipments").insert(r).select().single(), row);
  if (error) throw error;
  await sisipkanBarang(items, inserted.id);
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
  const row = shipmentToRow(payload, activeMode);
  const { error } = await simpanDenganCadangan(
    (r) => supabaseClient.from("shipments").update(r).eq("id", id), row);
  if (error) throw error;

  // Cara paling sederhana & aman untuk menyamakan daftar barang: hapus semua item lama
  const { error: delErr } = await supabaseClient
    .from("shipment_items")
    .delete()
    .eq("shipment_id", id);
  if (delErr) throw delErr;

  await sisipkanBarang(items, id);

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
    const kolom = columnFor(camel);
    row[kolom] = patch[camel] === "" ? nilaiKosongKolom(kolom) : patch[camel];
  });
  const { error } = await supabaseClient
    .from("shipments")
    .update(row)
    .eq("id", id);
  if (error) {
    console.error(error);
    showToast(t("m.gagal.menyimpan.perubahan.ke.database.memuat.u"),
      "danger",
    );
    loadShipments();
  }
}
