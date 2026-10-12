"use strict";

/* Nama yang dibaca pengguna untuk tiap kolom penanda tiba. Ditulis
   seperti labelnya di form, supaya pesan konfirmasi menunjuk kotak
   yang benar-benar bisa mereka lihat. */
const LABEL_KOLOM_TIBA = {
  factoryDate: "In Factory",
  etd: "ETD",
  get etdUpdate() {
    return LABEL_TANGGAL_REVISI.etdUpdate;
  },
};

/* Menambahkan satu baris ke kronologi jadwal & ke patch yang akan disimpan. */
function catatKronologi(s, patch, teks) {
  const log = normalizeNotesLog(s.notesLog, s.notes);
  log.push(newNoteEntry(teks));
  s.notesLog = log;
  s.notes = notesLogToPlainNotes(log);
  patch.notesLog = s.notesLog;
  patch.notes = s.notes;
}

/* ------------------------------------------------------------------
   EXPORT YANG ETD-NYA SUDAH LEWAT, DIKEMBALIKAN KE PROCESS / DELAY

   Jadwal export terbaca Delivered begitu ETD-nya lewat: kapalnya
   dianggap sudah berangkat. Dulu, mengembalikannya ke Process
   MENGOSONGKAN ETD -- jadwalnya kehilangan tanggal berangkat, padahal
   yang sebenarnya terjadi hampir selalu cuma keberangkatannya mundur.
   Sekarang yang ditanyakan ETD barunya:

     ke Delay   -> tanggal itu jadi ETD revisi; ETD rencana tetap ada
                   sebagai pembanding ("mundur X hari").
     ke Process -> tanggal itu jadi ETD; revisi lama dikosongkan
                   (aturan 2 di core/status.js).

   ETA ikut: kalau mode ETA-nya Auto, mesin menghitungnya dari ETD baru;
   kalau Manual (angka dari forwarder), ETA barunya ikut ditanyakan --
   terisi lebih dulu, digeser sama jauh dengan ETD-nya.

   ETD baru harus SETELAH hari ini: ETD hari ini pun sudah dihitung
   berangkat (kolomPenyebabTiba). Buku Import tetap lewat konfirmasi
   pengosongan In Factory -- tanggal itu memang berarti barangnya sudah
   diterima, jadi yang salah tanggalnya, bukan jadwalnya.
------------------------------------------------------------------ */
function mintaEtdBaru(s, statusBaru) {
  const lama = effectiveEtd(s);
  const etaLama = effectiveEta(s);
  const delay = statusBaru === "delayed";
  const manual = etaModeOf(s) === "manual";
  const namaStatus = statusLabel(statusBaru, "export");
  const besok = addCalendarDaysISO(todayISO(), 1);
  // ETA digeser sejauh ETD-nya bergeser (lama perjalanannya tetap)
  const etaIkut = (etd) => (etaLama && lama && etd ? addCalendarDaysISO(etaLama, delayDaysBetween(lama, etd)) : "");
  const fields = [
    {
      key: "etd",
      label: delay ? LABEL_TANGGAL_REVISI.etdUpdate : tt("ETD baru", "New ETD"),
      type: "date",
      value: besok,
      min: besok,
      lebar: manual ? "setengah" : undefined,
    },
  ];
  if (manual) {
    fields.push({
      key: "eta",
      label: delay ? LABEL_TANGGAL_REVISI.etaUpdate : tt("ETA baru", "New ETA"),
      type: "date",
      value: etaIkut(besok),
      min: besok,
      lebar: "setengah",
    });
  }
  const catatan = [
    delay ? tt(`ETD rencana ${fmtDate(s.etd)} tetap disimpan sebagai pembanding.`, `The planned ETD ${fmtDate(s.etd)} is kept for comparison.`) : "",
    manual ? tt("ETA ikut bergeser sejauh ETD; ubah kalau forwarder memberi tanggal lain.", "ETA moves by the same number of days; change it if the forwarder gave another date.") : "",
  ].filter(Boolean);
  if (catatan.length) fields[fields.length - 1].hint = catatan.join(" ");

  showPrompt({
    title: tt("Kapal belum berangkat?", "Not departed yet?"),
    icon: "bi-calendar-event",
    desc: tt(
      `ETD ${fmtDate(lama)} sudah lewat, jadi jadwal export ini terbaca Delivered. Isi ETD barunya untuk mengembalikan statusnya ke ${namaStatus}.`,
      `ETD ${fmtDate(lama)} has passed, so this export reads as Delivered. Enter the new ETD to set it back to ${namaStatus}.`,
    ),
    okText: tt("Simpan", "Save"),
    fields,
    onSubmit: (v) => {
      if (!v.etd) return tt("Isi ETD barunya.", "Enter the new ETD.");
      if (v.etd <= todayISO())
        return tt(
          "ETD baru harus setelah hari ini — ETD hari ini atau sebelumnya berarti kapalnya sudah berangkat.",
          "The new ETD must be after today — an ETD of today or earlier means it has already departed.",
        );
      if (manual && v.eta && v.eta < v.etd) return tt("ETA tidak boleh sebelum ETD.", "ETA cannot be before ETD.");
      terapkanEtdBaru(s, statusBaru, { etd: v.etd, eta: manual ? v.eta || "" : null }, lama);
      return true;
    },
  });

  // ETA mengikuti ETD yang diketik, sampai ETA-nya sendiri diubah
  const kotakEtd = document.getElementById("prompt_etd");
  const kotakEta = document.getElementById("prompt_eta");
  if (kotakEtd && kotakEta) {
    let etaDiubah = false;
    kotakEta.addEventListener("input", () => (etaDiubah = true));
    const ikut = () => {
      if (!etaDiubah) kotakEta.value = etaIkut(kotakEtd.value);
    };
    kotakEtd.addEventListener("input", ikut);
    kotakEtd.addEventListener("change", ikut);
  }
}

/* tanggal: { etd, eta } -- eta null = biarkan mesin (mode ETA Auto). */
function terapkanEtdBaru(s, statusBaru, tanggal, lama) {
  const patch = { status: statusBaru };
  const set = (k, v) => {
    s[k] = v;
    patch[k] = v || null;
  };
  if (statusBaru === "delayed") {
    set("etdUpdate", tanggal.etd);
    // ETA revisi lama berpijak pada ETD revisi lama: diganti, atau dilepas ke mesin
    set("etaUpdate", tanggal.eta || "");
  } else {
    revisiDigugurkan(statusBaru, "etd", s).forEach((k) => set(k, ""));
    set("etd", tanggal.etd);
    if (tanggal.eta) set("eta", tanggal.eta);
  }
  s.status = statusBaru;
  const namaStatus = statusLabel(statusBaru, "export");
  catatKronologi(
    s,
    patch,
    tt(`Status dikembalikan ke ${namaStatus}: ETD ${fmtDate(lama)} → ${fmtDate(tanggal.etd)}.`, `Status set back to ${namaStatus}: ETD ${fmtDate(lama)} → ${fmtDate(tanggal.etd)}.`),
  );
  render();
  persistFields(s.id, patch);
  showToast(tt(`Status ${namaStatus}, ETD ${fmtDate(tanggal.etd)}.`, `Status ${namaStatus}, ETD ${fmtDate(tanggal.etd)}.`), "success");
  /* Perkiraan lain dihitung ulang dari tanggal baru. Langsung ke mesin,
     bukan lewat handleCardDateChange: ETA manualnya sudah diputuskan di
     kotak tadi, jadi tidak perlu ditanyakan lagi. */
  if (typeof refreshShipmentPrediction === "function") refreshShipmentPrediction(s);
}

/* CARD EVENT DELEGATION */
cardContainer.addEventListener("change", (e) => {
  if (!requireEdit()) return;
  /* `el`, bukan `t`: nama t milik penerjemah t(). Dulu elemennya bernama
     t, sehingga t("...") di cabang status memanggil elemen itu dan
     melempar galat -- mengembalikan jadwal yang terbaca tiba ke Process
     gagal tanpa pesan apa pun. */
  const el = e.target;
  const id = el.dataset.id;
  if (!id) return;
  const s = currentList().find((x) => x.id === id);
  if (!s) return;

  if (el.dataset.action === "status") {
    /* Statusnya bebas diubah. Tapi selama tanggal KEJADIAN masih
       terisi & terlewati, isArrived() akan tetap membacanya sebagai
       tiba dan statusnya kembali sendiri pada penggambaran berikutnya.

       Kolom mananya TIDAK ditebak di sini — ditanyakan ke
       kolomPenyebabTiba() di core/status.js, sumber aturan yang sama
       yang dipakai isArrived(). */
    const kolomFakta = kolomPenyebabTiba(s);
    if (kolomFakta.length && el.value !== "arrived") {
      const semula = el.value;
      // Dropdown kembali ke status yang berlaku sampai pengguna memutuskan
      render();
      if (s.mode === "export") {
        mintaEtdBaru(s, semula);
        return;
      }
      const namaKolom = kolomFakta.map((k) => LABEL_KOLOM_TIBA[k] || k).join(" & ");
      showConfirm(
        t("x.tanggal.akan.dikosongkan", { kolom: namaKolom, tgl: fmtDate(s[kolomFakta[0]]), status: statusLabel(semula, activeMode) }),
        () => {
          const patch = { status: semula };
          /* Tanggal yang dihapus DICATAT ke kronologi sebelum hilang,
             supaya angka semulanya tetap bisa dipastikan. */
          const jejak = kolomFakta.map((k) => `${LABEL_KOLOM_TIBA[k] || k} ${fmtDate(s[k])}`).join(", ");
          kolomFakta.forEach((k) => {
            s[k] = "";
            patch[k] = null;
          });
          s.status = semula;
          catatKronologi(
            s,
            patch,
            tt(`Status dikembalikan ke ${statusLabel(semula, activeMode)}. ${jejak} dikosongkan.`, `Status reverted to ${statusLabel(semula, activeMode)}. ${jejak} cleared.`),
          );
          render();
          /* persistFields() menerima nama camelCase dan menerjemahkannya
             sendiri lewat columnFor() — bukan nama kolom database. */
          persistFields(id, patch);
        },
        { confirmText: tt("Ya, ubah", "Yes, change"), tone: "primary", icon: "bi-arrow-repeat" },
      );
      return;
    }
    s.status = el.value;
    render();
    persistFields(id, { status: s.status });
  } else if (el.dataset.action === "date") {
    const field = el.dataset.field;
    const patch = { [field]: el.value };
    s[field] = el.value;
    /* ETD/ETA rencana diubah di luar status Delay -> revisi yang
       digantikannya ikut dikosongkan (aturan 2 di core/status.js),
       dan itu dikatakan supaya tidak terasa ada tanggal yang hilang. */
    const gugur = el.value ? revisiDigugurkan(s.status, field, s) : [];
    const teksGugur = gugur.map((k) => `${LABEL_TANGGAL_REVISI[k]} ${fmtDate(s[k])}`).join(" & ");
    gugur.forEach((k) => {
      s[k] = "";
      patch[k] = null;
    });
    render();
    persistFields(id, patch);
    if (gugur.length) {
      showToast(
        tt(`${teksGugur} dihapus — ${field.toUpperCase()} yang baru yang berlaku.`, `${teksGugur} removed — the new ${field.toUpperCase()} is now in force.`),
        "dark",
      );
    }

    /* ETD/ETA/kotak delay berubah -> ETA & Estimated Delivery ikut
       dihitung ulang. Tidak ada tombol segarkan: perubahan masukan
       itu sendiri yang menggerakkannya. */
    if (
      typeof handleCardDateChange === "function" &&
      ["etd", "eta", "etdUpdate", "etaUpdate", "actual"].includes(field)
    ) {
      handleCardDateChange(s, field);
    }
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
    showConfirm(tt("Hapus jadwal pengiriman ini secara permanen?", "Permanently delete this shipment schedule?"), async () => {
      try {
        const { error } = await supabaseClient
          .from("shipments")
          .delete()
          .eq("id", id);
        if (error) throw error;
        data[activeMode] = currentList().filter((x) => x.id !== id);
        render();
        showToast(t("m.jadwal.berhasil.dihapus"), "dark");
      } catch (err) {
        console.error(err);
        showToast(t("m.gagal.menghapus.data.dari.database"), "danger");
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
