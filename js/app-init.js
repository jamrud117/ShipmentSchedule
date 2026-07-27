let boardStampDay = "";

async function initApp() {
  restoreActiveMode();
  // Bentuk tampilan (Manifes/Kartu) & tanggal papan disiapkan SEBELUM
  // router() menggambar apa pun, supaya tidak ada kedipan "kartu dulu,
  // baru berubah jadi tabel" pada gambar pertama.
  restoreViewMode();
  syncPresetUI();
  paintTodayStamps();
  // Daftar referensi UN/LOCODE (requirement C) diisi sekali di awal —
  // dipakai sbg saran isian field Pelabuhan/Terminal Asal & Tujuan.
  const dl = $("#unlocodeList");
  if (dl) dl.innerHTML = unlocodeDatalistHtml();

  // PENTING — urutannya: tampilkan KERANGKA HALAMAN dulu, baru ambil data.
  //
  // Sebelumnya `router()` dipanggil SESUDAH `await loadShipments()`.
  // Padahal navbar dan seluruh <div> halaman diberi kelas `d-none` di
  // HTML, dan yang melepasnya hanya router(). Akibatnya layar benar-benar
  // KOSONG PUTIH selama menunggu jawaban database — dan kerangka muat
  // (skeleton) pun tidak menolong sama sekali, karena ia digambar ke
  // dalam #cardContainer yang saat itu masih ikut tersembunyi.
  //
  // Sekarang router() jalan lebih dulu sehingga navbar, hero, dan
  // toolbar langsung tampil; loadShipments() menggambar kerangka muat di
  // area daftarnya. Keduanya berjalan dalam satu putaran tugas yang sama,
  // jadi peramban menggambarnya sekali — tanpa kedipan layar kosong.
  router();

  await loadShipments();

  // Tanggal papan diperbarui kalau aplikasi dibiarkan terbuka melewati
  // tengah malam — kalau tidak, seluruh hitung mundur (H-3, HARI INI)
  // akan salah satu hari penuh sampai halaman dimuat ulang.
  setInterval(() => {
    if (boardStampDay === todayISO()) return;
    boardStampDay = todayISO();
    paintTodayStamps();
    render();
  }, 60000);
}

window.addEventListener("DOMContentLoaded", initApp);
