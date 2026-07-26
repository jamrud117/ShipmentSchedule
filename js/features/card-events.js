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
    // Semua field tanggal (ETA termasuk) sekarang field biasa, TIDAK
    // ada lagi efek samping otomatis ke status — auto-arrive dihapus
    // (dulu ETA yang diubah ke tanggal lewat/hari ini otomatis set
    // status ke ARRIVED; sekarang status HARUS diubah manual lewat
    // dropdown Status, sesuai permintaan).
    s[t.dataset.field] = t.value;
    render();
    persistFields(id, { [t.dataset.field]: t.value });
  }
});

// Enter di kotak kronologi cepat = kirim (tanpa harus klik tombolnya).
cardContainer.addEventListener("keydown", (e) => {
  const input = e.target.closest("[data-note-input]");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  addNoteFromCard(input.dataset.noteInput);
});

cardContainer.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "edit")
    location.hash = "#/edit/" + encodeURIComponent(id);
  if (btn.dataset.action === "viewDetail") openDetailView(id);
  if (btn.dataset.action === "addNote") {
    addNoteFromCard(btn.dataset.id);
    return;
  }
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

/* ==================================================================
   CTRL/CMD + F  ->  fokus ke kotak pencarian APLIKASI
   Pencarian bawaan browser tidak berguna di sini karena kartu yang tidak
   cocok filter memang tidak ada di DOM — jadi shortcut-nya dialihkan ke
   kotak pencarian sendiri. Hanya berlaku saat halaman DAFTAR terbuka;
   di halaman form, Ctrl+F dibiarkan berperilaku normal supaya user tetap
   bisa mencari teks di form yang panjang.
================================================================== */
document.addEventListener("keydown", (e) => {
  const isFind = (e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F");
  if (!isFind) return;
  const searchEl = $("#searchInput");
  const listVisible = !$("#viewList").classList.contains("d-none");
  if (!searchEl || !listVisible) return;
  e.preventDefault();
  searchEl.focus();
  // Teks yang sudah ada diseleksi supaya langsung tertimpa saat mengetik.
  searchEl.select();
});
