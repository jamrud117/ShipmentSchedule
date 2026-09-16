let boardStampDay = "";

async function initApp() {
  restoreActiveMode();
  // Penanda tanggal disiapkan sebelum router() menggambar
  paintTodayStamps();
  // Daftar referensi UN/LOCODE (requirement C) diisi sekali di awal
  const dl = $("#unlocodeList");
  if (dl) dl.innerHTML = unlocodeDatalistHtml("");
  /* Daftar per moda untuk terminal transit. Isinya tidak bergantung
     pada pilihan apa pun di form, jadi cukup diisi sekali di sini —
     tidak perlu ikut refreshUnlocodeDatalist(). */
  const dlLaut = $("#unlocodeListLaut");
  if (dlLaut) dlLaut.innerHTML = unlocodeDatalistHtml("laut");
  const dlUdara = $("#unlocodeListUdara");
  if (dlUdara) dlUdara.innerHTML = unlocodeDatalistHtml("udara");
  const clLaut = $("#carrierListLaut");
  if (clLaut) clLaut.innerHTML = carrierDatalistHtml("laut");
  const clUdara = $("#carrierListUdara");
  if (clUdara) clUdara.innerHTML = carrierDatalistHtml("udara");

  /* Login diperiksa SEBELUM apa pun digambar atau diambil. Tanpa sesi,
     router() & loadShipments() tidak dijalankan sama sekali */
  const masuk = await initAuth();
  if (!masuk) return;

  /* ROUTER DUA KALI, dan itu disengaja.

     Panggilan PERTAMA menampilkan halamannya lebih dulu supaya layar
     tidak kosong selama data diambil -- kerangka muat digambar di
     dalam daftar yang sudah terlihat.

     Panggilan KEDUA, sesudah datanya sampai, yang benar-benar membuka
     #/edit/<id>: pada panggilan pertama jadwalnya belum ada di daftar
     (lihat penjelasan di router()). */
  router();

  await loadShipments();

  router();

  // Tanggal papan diperbarui kalau aplikasi dibiarkan terbuka melewati tengah malam
  setInterval(() => {
    if (boardStampDay === todayISO()) return;
    boardStampDay = todayISO();
    paintTodayStamps();
    render();
  }, 60000);
}

window.addEventListener("DOMContentLoaded", initApp);

/* TOMBOL KEMBALI KE ATAS.

   Di luar initApp() dengan sengaja: tidak bergantung pada sesi login
   atau data jadwal sama sekali, cuma pada tinggi gulir halaman —
   boleh langsung aktif begitu skrip dimuat, tidak perlu menunggu
   initApp() selesai (yang bisa berhenti lebih dulu kalau sesi login
   tidak ada, lihat baris 24-25 di atas).

   Ambang 320px: kira-kira satu kartu jadwal plus sebagian bilah
   kendali — cukup jauh supaya tombolnya tidak berkedip muncul-hilang
   waktu baru mulai menggulir sedikit, tapi tidak menunggu sampai
   benar-benar jauh. */
const AMBANG_TOMBOL_ATAS = 320;
function segarkanTombolAtas() {
  const tbl = $("#btnScrollTop");
  if (!tbl) return;
  tbl.classList.toggle("is-visible", window.scrollY > AMBANG_TOMBOL_ATAS);
  tbl.classList.remove("d-none");
}
window.addEventListener("scroll", segarkanTombolAtas, { passive: true });
const btnScrollTop = $("#btnScrollTop");
if (btnScrollTop) {
  btnScrollTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
segarkanTombolAtas();
