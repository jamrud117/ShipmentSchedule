"use strict";

/* CARD EVENT DELEGATION */
cardContainer.addEventListener("change", (e) => {
  if (!requireEdit()) return;
  const t = e.target;
  const id = t.dataset.id;
  if (!id) return;
  const s = currentList().find((x) => x.id === id);
  if (!s) return;

  if (t.dataset.action === "status") {
    /* Statusnya bebas diubah. Tapi kalau tanggal Actual Delivery sudah
       terlewati, isArrived() akan tetap membacanya sebagai tiba dan
       statusnya kembali sendiri pada penggambaran berikutnya. Jadi
       tanggalnya ikut dikosongkan — dengan persetujuan dulu, bukan
       diam-diam, karena itu data yang pernah diisi sengaja. */
    if (isArrived(s) && s.actual && t.value !== "arrived") {
      const semula = t.value;
      showConfirm(
        `Tanggal ${ML().actual} (${fmtDate(s.actual)}) akan dikosongkan supaya statusnya bisa kembali ke ${statusLabel(semula, activeMode)}. Lanjutkan?`,
        () => {
          s.actual = "";
          s.status = semula;
          render();
          persistFields(id, { status: semula, actual: null });
        },
        { confirmText: "Ya, ubah", tone: "primary", icon: "bi-arrow-repeat" },
      );
      render();
      return;
    }
    s.status = t.value;
    render();
    persistFields(id, { status: s.status });
  } else if (t.dataset.action === "date") {
    // Semua field tanggal (ETA termasuk) sekarang field biasa
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
  if (!requireEdit()) return;
  addNoteFromCard(input.dataset.noteInput);
});

cardContainer.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;

  /* Lihat detail & salin template tetap boleh untuk viewer; sisanya
     mengubah data, jadi dihentikan di sini. Tombolnya sudah
     disembunyikan lewat CSS — ini lapis kedua kalau elemennya dipanggil
     dari konsol atau CSS-nya gagal dimuat */
  const hanyaBaca = ["viewDetail", "copyTemplate"];
  if (btn.dataset.action === "docStep") {
    toggleDocStep(id, btn.dataset.step);
    return;
  }
  if (!hanyaBaca.includes(btn.dataset.action) && !requireEdit()) return;
  if (btn.dataset.action === "edit") {
    location.hash = "#/edit/" + encodeURIComponent(id);
  } else if (btn.dataset.action === "viewDetail") {
    openDetailView(id);
  } else if (btn.dataset.action === "addNote") {
    addNoteFromCard(btn.dataset.id);
  } else if (btn.dataset.action === "copyTemplate") {
    copyShipment(btn.dataset.template, id);
  } else if (btn.dataset.action === "delete") {
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
// Dibungkus arrow function (bukan referensi langsung) karena goBackToList() didefinisikan
$("#btnFormBack").addEventListener("click", () => goBackToList());
$("#btnFormCancel").addEventListener("click", () => goBackToList());

/* CTRL/CMD + F  ->  fokus ke kotak pencarian APLIKASI */
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
