async function initApp() {
  cardContainer.innerHTML = `
    <div class="empty-state">
      <i class="bi bi-hourglass-split"></i>
      <p class="mt-3 mb-0">Memuat data dari database...</p>
    </div>`;

  await loadShipments();

  router();
}

window.addEventListener("DOMContentLoaded", initApp);
