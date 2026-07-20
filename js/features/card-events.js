"use strict";

/* ==================================================================
   CARD EVENT DELEGATION
================================================================== */
cardContainer.addEventListener("change", (e) => {
  const t = e.target;
  const id = t.dataset.id;
  if (!id) return;
  const s = currentList().find((x) => x.id === id);
  if (!s) return;

  if (t.dataset.action === "status") {
    s.status = t.value;
    render();
    persistFields(id, { status: s.status });
  } else if (t.dataset.action === "date") {
    if (t.dataset.field === "eta") {
      applyEtaAutoArrive(s, t.value);
      render();
      persistFields(id, { eta: s.eta, status: s.status, actual: s.actual });
    } else {
      // "actual" (Actual Delivery) dan field tanggal lain: murni field
      // biasa, TIDAK ada lagi efek samping ke status.
      s[t.dataset.field] = t.value;
      render();
      persistFields(id, { [t.dataset.field]: t.value });
    }
  }
});

cardContainer.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "edit")
    location.hash = "#/edit/" + encodeURIComponent(id);
  if (btn.dataset.action === "viewDetail") openDetailView(id);
  if (btn.dataset.action === "copyTemplate")
    copyShipment(btn.dataset.template, id);
  if (btn.dataset.action === "delete") {
    showConfirm("Hapus jadwal pengiriman ini secara permanen?", async () => {
      try {
        const { error } = await supabaseClient
          .from("shipments")
          .delete()
          .eq("id", id);
        if (error) throw error;
        data[activeMode] = currentList().filter((x) => x.id !== id);
        render();
        showToast("Jadwal berhasil dihapus.", "dark");
      } catch (err) {
        console.error(err);
        showToast("Gagal menghapus data dari database.", "danger");
      }
    });
  }
});

$("#btnAdd").addEventListener("click", () => (location.hash = "#/new"));
$("#btnAddEmpty").addEventListener("click", () => (location.hash = "#/new"));
// Dibungkus arrow function (bukan referensi langsung) karena
// goBackToList() didefinisikan di js/views/form-router.js, yang dimuat
// SETELAH file ini -- pola yang sama seperti switchMode() di
// render/list.js, supaya lookup-nya baru terjadi saat tombol benar-benar
// diklik, bukan saat baris ini dieksekusi.
$("#btnFormBack").addEventListener("click", () => goBackToList());
$("#btnFormCancel").addEventListener("click", () => goBackToList());
