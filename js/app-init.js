async function initApp() {
  restoreActiveMode();
  // Daftar referensi UN/LOCODE (requirement C) diisi sekali di awal —
  // dipakai sbg saran isian field Pelabuhan/Terminal Asal & Tujuan.
  const dl = $("#unlocodeList");
  if (dl) dl.innerHTML = unlocodeDatalistHtml();
  cardContainer.innerHTML = `
    <div class="empty-state">
      <i class="bi bi-hourglass-split"></i>
      <p class="mt-3 mb-0">Memuat data dari database...</p>
    </div>`;

  await loadShipments();

  router();
}

window.addEventListener("DOMContentLoaded", initApp);
