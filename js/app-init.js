let boardStampDay = "";

async function initApp() {
  restoreActiveMode();
  // Saringan & penanda tanggal disiapkan sebelum router() menggambar
  syncPresetUI();
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

  router();

  await loadShipments();

  // Tanggal papan diperbarui kalau aplikasi dibiarkan terbuka melewati tengah malam
  setInterval(() => {
    if (boardStampDay === todayISO()) return;
    boardStampDay = todayISO();
    paintTodayStamps();
    render();
  }, 60000);
}

window.addEventListener("DOMContentLoaded", initApp);
