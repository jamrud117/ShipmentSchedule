"use strict";

/* CRUD KE SUPABASE */

/* Nomor urut permintaan muat.

   loadShipments() dipanggil dari banyak tempat — masuk aplikasi,
   impor massal, tombol coba lagi, penangan galat persistFields, dan
   simpan form kalau jawabannya tidak bisa langsung dipasang
   (terapkanJadwalTersimpan). Tidak ada yang menunggu yang lain selesai.

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

/* Nomor muat terakhir yang sudah selesai (berhasil atau gagal). Berbeda
   dengan muatKe = ada muat penuh yang masih di jalan (terapkanJadwalTersimpan). */
let muatSelesai = 0;

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
  muatSelesai = nomor;

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

  selaraskanPrediksi();

  // PENTING: render() harus dipanggil di sini
  shipmentsLoaded = true;
  render();
  siapkanLartasLatar();

  await syncArrivedStatuses();
}

/* PREDIKSI DISELARASKAN DI MEMORI, SEBELUM DIGAMBAR.

   Dengan begitu kartu, panel detail, template salin, dan Bulk Export
   semuanya membaca s.actual yang sama — tanpa satu pun berkas itu
   perlu tahu bahwa ada mesin prediksi.

   Tidak ada penulisan ke database di sini. Membuka halaman bukan
   mengubah data; kolom di Supabase baru diperbarui saat masukannya
   benar-benar diubah (tanggal di kartu, tahap dokumen, simpan form). */
function selaraskanPrediksi() {
  /* Hasil belajar dibuang lebih dulu: cache yang dibangun dari data
     lama akan tetap dipakai untuk data baru, dan perkiraan basi lebih
     berbahaya daripada tidak belajar sama sekali — ia terlihat pasti. */
  if (typeof resetPredictionLearning === "function") resetPredictionLearning();
  // Saran kapal/pesawat dari riwayat baru bisa disusun setelah datanya sampai
  if (typeof refreshCarrierDatalists === "function") refreshCarrierDatalists();
  if (typeof applyPredictionToAll === "function") {
    applyPredictionToAll(data.import);
  }
}

/* SESUDAH SIMPAN FORM: jadwal yang barusan tersimpan dimasukkan ke papan
   dari JAWABAN SIMPAN ITU SENDIRI (baris + barang + terminal transit,
   lihat updateShipmentRecord / createShipment) -- bukan memuat ulang
   SEMUA jadwal beserta seluruh barangnya. Tidak ada permintaan tambahan,
   dan papan tidak sempat berkedip menjadi kerangka muat.

   Muat penuh tetap dipakai kalau papan belum pernah termuat, ada muat
   penuh yang masih di jalan (jawabannya bisa memuat jadwal ini SEBELUM
   disimpan -- muat baru membuangnya, sama seperti dulu), atau jawabannya
   tidak lengkap. Daftar tidak digambar di sini: kembali ke daftar
   (router) yang menggambarnya, sekali. */
async function terapkanJadwalTersimpan(baris) {
  if (!baris || !baris.id || !data[baris.mode] || !shipmentsLoaded || muatSelesai !== muatKe) return loadShipments();
  try {
    const s = rowToShipment(baris);
    const daftar = data[baris.mode];
    const i = daftar.findIndex((x) => x.id === s.id);
    if (i >= 0) daftar[i] = s;
    else daftar.push(s); // jadwal baru: created_at terbaru, urutan muat tetap sama
    selaraskanPrediksi();
  } catch (e) {
    /* Jadwalnya SUDAH tersimpan -- jangan sampai terbaca "gagal
       menyimpan" (disimpan ulang = jadwal baru ganda): muat penuh saja. */
    console.error(e);
    return loadShipments();
  }
  await syncArrivedStatuses();
}

/* Database HS Code disiapkan di LATAR sesudah papan tergambar: tanda
   lartas per HS (core/lartas.js) baru terbaca sesudahnya. Kalau ada HS
   bertanda lartas, kartu & Ringkasan digambar ulang -- peringatan "PI /
   LS belum ada" ikut muncul tanpa harus membuka halaman HS Code dulu. */
function siapkanLartasLatar() {
  if (typeof hsCodeSiap !== "function" || (typeof hsCodeRows !== "undefined" && hsCodeRows.length)) return;
  hsCodeSiap().then((ok) => {
    if (!ok || !petaLartasHs().size) return;
    render();
    const ringkasan = $("#viewOverview");
    if (ringkasan && !ringkasan.classList.contains("d-none") && typeof renderOverview === "function") renderOverview();
    if (typeof segarkanLartasForm === "function") segarkanLartasForm();
  });
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
const kolomOpsional = (berkas, id, en) => ({
  berkas,
  get nama() {
    return tt(id, en);
  },
});
const KOLOM_OPSIONAL = {
  vehicle_no: kolomOpsional("migration-vehicle-no.sql", "No. Kendaraan", "Vehicle No."),
  ls: kolomOpsional("migration-ls-tanggal-dokumen.sql", "LS", "LS"),
  invoice_date: kolomOpsional("migration-ls-tanggal-dokumen.sql", "Tanggal Invoice", "Invoice Date"),
  master_bl_date: kolomOpsional("migration-ls-tanggal-dokumen.sql", "Tanggal Master B/L-AWB", "Master B/L-AWB Date"),
  house_bl_date: kolomOpsional("migration-ls-tanggal-dokumen.sql", "Tanggal House B/L-AWB", "House B/L-AWB Date"),
  pi_date: kolomOpsional("migration-tanggal-pi-ls-polis.sql", "Tanggal PI", "PI Date"),
  ls_date: kolomOpsional("migration-tanggal-pi-ls-polis.sql", "Tanggal LS", "LS Date"),
  polis_asuransi: kolomOpsional("migration-tanggal-pi-ls-polis.sql", "Polis Asuransi", "Insurance Policy"),
  polis_asuransi_date: kolomOpsional("migration-tanggal-pi-ls-polis.sql", "Tanggal Polis Asuransi", "Insurance Policy Date"),
  /* Satu dokumen per jenis tanpa dokumen lain tetap utuh di kolom lama
     (pi / pi_date, ...): yang tertinggal hanya dokumen kedua dst. & dokumen lain. */
  dokumen_pelengkap: Object.assign(
    kolomOpsional("migration-dokumen-pelengkap.sql", "PI, LS & Polis kedua dst., Dokumen Lain, serta lampiran PI & LS", "the second and further PI, LS & policies, Other Documents, and PI & LS attachments"),
    {
      hilang: (d) =>
        !!d &&
        (JENIS_DOK_PENGIRIMAN.some((j) => (d[j] || []).length > 1 || (d[j] || []).some((x) => (x.berkas || []).length)) ||
          (d.lain || []).length > 0),
    },
  ),
  // Dibutuhkan di pabrik -> rencana mundur ETD/ETA (core/prediction-mundur.js)
  needed_date: kolomOpsional("migration-lampiran-lartas-kebutuhan.sql", "Dibutuhkan di Pabrik", "Needed at Factory"),
  // Data PIB / PEB lengkap (core/data-pabean.js)
  data_pabean: Object.assign(kolomOpsional("migration-data-pabean.sql", "Data PIB/PEB lengkap", "Full PIB/PEB data"), {
    hilang: (d) => !!d && Object.keys(d).length > 0,
  }),
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

/* KOLOM BARANG YANG MUNGKIN BELUM DIMIGRASI. Daftar barang disimpan
   dengan cara hapus semua lalu sisipkan, jadi sisipan yang ditolak karena
   kolomnya belum ada berarti barangnya HILANG. Ditolak karena itu ->
   disisipkan ulang tanpa kolom yang ditolak, dan pengguna diberi tahu
   berkas migrasinya:
     - Kode Barang s.d. Spesifikasi Lain (migration-barang-ceisa.sql):
       seluruh nama barang dilebur ke Uraian -- nama yang tampil tetap sama;
     - KOLOM_BARANG_OPSIONAL (Kode Kondisi Barang, Kode Negara Asal, PI
       barang & No. item di PI): HANYA kolom yang ditolak yang ditinggal
       (database yang sudah mengenal kolom nama barang tidak ikut dilebur).
       Kolom opsional yang kosong di semua barang tidak dikirim sama
       sekali -- nilainya sama dengan bawaan database, dan database yang
       belum dimigrasi tidak perlu menolaknya dulu.
   PostgREST menyebut satu kolom per penolakan, jadi dicoba sampai tidak
   ada lagi yang ditolak. */
const KOLOM_BARANG_CEISA = ["kode_barang", "merek", "tipe", "ukuran", "spesifikasi_lain"];
const BERKAS_BARANG_CEISA = "migration-barang-ceisa.sql";
const KOLOM_BARANG_OPSIONAL = {
  kode_kondisi_barang: { berkas: BERKAS_BARANG_CEISA, get nama() { return tt("Kondisi Barang", "Goods Condition"); } },
  kode_negara_asal: { berkas: BERKAS_BARANG_CEISA, get nama() { return tt("Negara Asal", "Country of Origin"); } },
  pi_nomor: { berkas: "migration-dokumen-pelengkap.sql", get nama() { return tt("PI barang", "Item PI"); } },
  pi_no_item: { berkas: "migration-dokumen-pelengkap.sql", get nama() { return tt("No. item di PI", "Item no. in PI"); } },
  data_pabean: { berkas: "migration-data-pabean.sql", get nama() { return tt("Data PIB/PEB per barang", "Per-item PIB/PEB data"); } },
};

const isianKolom = (v) => String(v == null ? "" : v).trim() !== "";
const tanpaKolom = (rows, kolom) =>
  rows.map((r) => {
    const x = Object.assign({}, r);
    kolom.forEach((k) => delete x[k]);
    return x;
  });

/* Mengembalikan baris barang yang tersisip (bentuk database) -- dipakai
   terapkanJadwalTersimpan tanpa membaca ulang. */
async function sisipkanBarang(items, shipmentId, kirimBaris) {
  if (!items.length) return [];
  const opsional = Object.keys(KOLOM_BARANG_OPSIONAL);
  let rows = items.map((it) => itemToRow(it, shipmentId));
  rows = tanpaKolom(rows, opsional.filter((k) => !rows.some((r) => isianKolom(r[k]))));
  const kirim = kirimBaris || ((r) => supabaseClient.from("shipment_items").insert(r).select());
  let { data: tersisip, error } = await kirim(rows);
  let lebur = false;
  const ditinggal = [];
  for (let i = 0; error && i <= opsional.length; i++) {
    if (!lebur && kolomBelumDikenal(error, KOLOM_BARANG_CEISA)) {
      lebur = true;
      rows = tanpaKolom(rows, KOLOM_BARANG_CEISA).map((r, j) => Object.assign(r, { nama_barang: itemDisplayName(items[j]) }));
    } else {
      const kolom = kolomBelumDikenal(error, opsional);
      if (!kolom || !rows.some((r) => kolom in r)) break;
      ditinggal.push(KOLOM_BARANG_OPSIONAL[kolom]);
      rows = tanpaKolom(rows, [kolom]);
    }
    ({ data: tersisip, error } = await kirim(rows));
  }
  if (!error && (lebur || ditinggal.length) && typeof showToast === "function") {
    const kode = ditinggal.map((k) => k.nama).join(" & ");
    const berkas = [...new Set((lebur ? [BERKAS_BARANG_CEISA] : []).concat(ditinggal.map((k) => k.berkas)))].join(" & ");
    showToast(
      lebur && kode
        ? tt(
            `Jadwal tersimpan, tetapi database belum mengenal kolom barang CEISA: Kode Barang, Merek, Tipe, Ukuran & Spesifikasi Lain digabung ke Uraian, ${kode} belum tersimpan. Jalankan ${berkas} di Supabase (aman diulang).`,
            `Schedule saved, but the database does not know the CEISA item columns yet: Item Code, Brand, Type, Size & Other Specification were merged into the Description, ${kode} was not saved. Run ${berkas} in Supabase (safe to re-run).`,
          )
        : lebur
          ? tt(
              `Jadwal tersimpan, tetapi kolom Kode Barang, Merek, Tipe, Ukuran & Spesifikasi Lain belum: database belum mengenal kolomnya, jadi isinya digabung ke Uraian. Jalankan ${berkas} di Supabase (aman diulang).`,
              `Schedule saved, but Item Code, Brand, Type, Size & Other Specification were not: the database does not know the columns yet, so they were merged into the Description. Run ${berkas} in Supabase (safe to re-run).`,
            )
          : tt(
              `Jadwal tersimpan, tetapi ${kode} belum: database belum mengenal kolomnya. Jalankan ${berkas} di Supabase (aman diulang).`,
              `Schedule saved, but ${kode} was not: the database does not know the column yet. Run ${berkas} in Supabase (safe to re-run).`,
            ),
      "warning",
    );
  }
  if (error) throw error;
  return tersisip || [];
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
    const k = KOLOM_OPSIONAL[kolom];
    if (k.hilang ? k.hilang(row[kolom]) : isianKolom(row[kolom])) tertinggal.push(k);
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

async function sisipkanTransit(stops, shipmentId) {
  if (!stops || !stops.length) return [];
  const { data: tersisip, error } = await supabaseClient
    .from("shipment_route_stops")
    .insert(stops.map((st, i) => stopToRow(st, shipmentId, i + 1)))
    .select();
  if (error) throw error;
  return tersisip || [];
}

/* Daftar barang & terminal transit disamakan dengan cara paling
   sederhana & aman: hapus semua yang lama, sisipkan yang baru. */
async function gantiBarang(id, items) {
  const { error } = await supabaseClient.from("shipment_items").delete().eq("shipment_id", id);
  if (error) throw error;
  return sisipkanBarang(items, id);
}
async function gantiTransit(id, stops) {
  const { error } = await supabaseClient.from("shipment_route_stops").delete().eq("shipment_id", id);
  if (error) throw error;
  return sisipkanTransit(stops, id);
}

/* Sidik daftar barang & terminal transit dalam bentuk baris database.
   Form jadwal mencatatnya saat dibuka (sidikAsalForm); sidik yang sama
   saat disimpan = tidak ada yang berubah, jadi tidak ditulis ulang. */
function sidikIsiJadwal(items, stops, id) {
  return {
    barang: JSON.stringify((items || []).map((it) => itemToRow(it, id))),
    transit: JSON.stringify((stops || []).map((st, i) => stopToRow(st, id, i + 1))),
  };
}

/* Semua jalur ditunggu sampai selesai -- juga kalau salah satunya gagal
   -- baru galat pertamanya dilempar. Tombol Simpan tidak boleh aktif
   lagi selagi barang masih dihapus/disisipkan: simpan kedua di
   tengahnya menggandakan barang. */
async function tungguSemua(janji) {
  const hasil = await Promise.allSettled(janji);
  const gagal = hasil.find((h) => h.status === "rejected");
  if (gagal) throw gagal.reason;
  return hasil.map((h) => h.value);
}

/* Jadwal, barang & terminal transit ada di tabel yang saling lepas:
   ditulis BERSAMAAN, bukan berurutan -- satu perjalanan ke server, bukan
   lima. Mengembalikan baris jadwal lengkap (barang + terminal transit)
   untuk terapkanJadwalTersimpan. */
async function createShipment(payload, items, stops) {
  const row = shipmentToRow(payload, activeMode);
  row.mode = activeMode;
  const { data: inserted, error } = await simpanDenganCadangan(
    (r) => supabaseClient.from("shipments").insert(r).select().single(), row);
  if (error) throw error;
  const [barang, transit] = await tungguSemua([sisipkanBarang(items, inserted.id), sisipkanTransit(stops, inserted.id)]);
  return Object.assign({}, inserted, { items: barang, routeStops: transit });
}

/* `asal` = sidikIsiJadwal saat form dibuka: barang / terminal transit
   yang tidak berubah tidak dihapus-sisipkan ulang, cukup ikut terbaca
   di jawaban simpan jadwalnya. */
async function updateShipmentRecord(id, payload, items, stops, asal) {
  const row = shipmentToRow(payload, activeMode);
  const kini = sidikIsiJadwal(items, stops, id);
  const tulisBarang = !asal || asal.barang !== kini.barang;
  const tulisTransit = !asal || asal.transit !== kini.transit;
  const pilih = ["*"]
    .concat(tulisBarang ? [] : ["items:shipment_items(*)"], tulisTransit ? [] : ["routeStops:shipment_route_stops(*)"])
    .join(", ");
  const [jadwal, barang, transit] = await tungguSemua([
    simpanDenganCadangan((r) => supabaseClient.from("shipments").update(r).eq("id", id).select(pilih).single(), row).then(
      ({ data: baris, error }) => {
        if (error) throw error;
        return baris;
      },
    ),
    tulisBarang ? gantiBarang(id, items) : null,
    tulisTransit ? gantiTransit(id, stops) : null,
  ]);
  return Object.assign({}, jadwal, tulisBarang ? { items: barang } : {}, tulisTransit ? { routeStops: transit } : {});
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
