async function initApp() {
  restoreActiveMode();
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
  router();
}

window.addEventListener("DOMContentLoaded", initApp);
