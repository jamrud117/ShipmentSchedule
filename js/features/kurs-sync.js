"use strict";

/* TOMBOL "SYNC KURS TERBARU" DI FORM JADWAL

   NDPBM jadwal TIDAK PERNAH berubah sendiri: membuka, mengedit, atau
   menyimpan jadwal tidak menyentuhnya. Kurs terbaru dari sheet KURS
   (core/kurs.js) hanya masuk ke jadwal saat pengguna menekan tombol ini,
   lalu menyimpan jadwalnya. Sampai itu, kotak NDPBM tetap berisi apa
   yang diketik / disimpan, dan di bawahnya hanya ada keterangan:
   kurs terbaru berapa, beda berapa dari isian.

   Yang disalin ke kotak NDPBM adalah kurs USD: jadwal selalu berhitung
   dalam USD (Total Nilai Barang, Freight, Asuransi). */

const kursSyncKeadaan = { sebelum: null, sibuk: false };

// Keterangan di bawah kotak NDPBM, mengikuti isian & kurs terbaru yang terbaca
function kursSyncSegarkan() {
  const info = $("#kursSyncInfo");
  const tombol = $("#btnSyncKurs");
  if (!info || !tombol) return;
  const usd = kursUsd();
  const isi = nilaiKotakAngka("#fNdpbm");
  tombol.disabled = kursSyncKeadaan.sibuk;
  tombol.classList.toggle("is-sibuk", kursSyncKeadaan.sibuk);
  tombol.setAttribute("aria-busy", kursSyncKeadaan.sibuk ? "true" : "false");
  let status = "info";
  let teks;
  if (kursSyncKeadaan.sibuk && !usd) teks = tt("Membaca kurs dari sheet…", "Reading the rate from the sheet…");
  else if (!usd) {
    status = "kosong";
    teks = tt("Kurs terbaru belum terbaca. Tekan tombol untuk mencoba lagi.", "The latest rate has not been read yet. Press the button to try again.");
  } else {
    const umur = kursUmurTeks();
    const salinan = kursKeadaan.data && kursKeadaan.data.dariCache;
    const beda = Math.round((isi - usd) * 100) / 100;
    if (kursSyncKeadaan.sebelum != null && Math.abs(beda) <= 0.01) {
      status = "sama";
      teks = tt(`Diperbarui ke kurs terbaru (${kursFormat(usd)}). Simpan jadwal untuk menerapkannya.`, `Updated to the latest rate (${kursFormat(usd)}). Save the schedule to apply it.`);
    } else if (!isi) teks = tt(`Kurs terbaru ${kursFormat(usd)} (${umur}). Isian belum diubah.`, `Latest rate ${kursFormat(usd)} (${umur}). The field is unchanged.`);
    else if (Math.abs(beda) <= 0.01) {
      status = "sama";
      teks = tt(`Sama dengan kurs terbaru (${kursFormat(usd)}, ${umur}).`, `Matches the latest rate (${kursFormat(usd)}, ${umur}).`);
    } else {
      status = "beda";
      teks = tt(`Kurs terbaru ${kursFormat(usd)} (${umur}), isian ${beda > 0 ? "lebih tinggi" : "lebih rendah"} ${kursFormat(Math.abs(beda))}. Isian belum diubah.`, `Latest rate ${kursFormat(usd)} (${umur}); the field is ${kursFormat(Math.abs(beda))} ${beda > 0 ? "higher" : "lower"}. The field is unchanged.`);
    }
    if (salinan) teks += " " + tt("(Sheet tidak terbaca; ini salinan tersimpan.)", "(The sheet could not be read; this is a saved copy.)");
  }
  info.dataset.status = status;
  info.textContent = teks;
  const kembali = kursSyncKeadaan.sebelum != null && usd && Math.abs(isi - usd) <= 0.01;
  let btn = $("#btnSyncKursKembali");
  if (kembali) {
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "btnSyncKursKembali";
      btn.className = "kurs-sync-kembali";
      btn.addEventListener("click", kursSyncKembalikan);
      info.insertAdjacentElement("afterend", btn);
    }
    btn.textContent = tt(`Kembalikan ${kursSyncKeadaan.sebelum || "kosong"}`, `Restore ${kursSyncKeadaan.sebelum || "empty"}`);
  } else if (btn) btn.remove();
}

function kursSyncKembalikan() {
  const kotak = $("#fNdpbm");
  if (!kotak || kursSyncKeadaan.sebelum == null) return;
  kotak.value = kursSyncKeadaan.sebelum;
  kursSyncKeadaan.sebelum = null;
  kotak.dispatchEvent(new Event("input", { bubbles: true }));
  kursSyncSegarkan();
}

// Form jadwal baru dibuka / berganti jadwal: lupakan "sebelum" milik form lama, baca kurs diam-diam
function kursSyncMulai() {
  kursSyncKeadaan.sebelum = null;
  kursSyncKeadaan.sibuk = false;
  kursSyncSegarkan();
  kursMuat().then(kursSyncSegarkan);
}

async function kursSyncTekan() {
  if (kursSyncKeadaan.sibuk || !requireEdit()) return;
  const kotak = $("#fNdpbm");
  if (!kotak) return;
  kursSyncKeadaan.sibuk = true;
  kursSyncSegarkan();
  let hasil;
  try {
    hasil = await kursMuat({ paksa: true });
  } finally {
    kursSyncKeadaan.sibuk = false;
  }
  const usd = kursUsd();
  if (!hasil.ok || !usd) {
    kursSyncSegarkan();
    showToast(tt("Kurs belum bisa dibaca dari sheet. Periksa koneksi lalu coba lagi. NDPBM di jadwal tidak diubah.", "The rate could not be read from the sheet. Check the connection and try again. The schedule NDPBM is unchanged."), "danger", { judul: tt("Sync kurs gagal", "Rate sync failed") });
    return;
  }
  if (hasil.dariCache) {
    kursSyncSegarkan();
    showToast(tt(`Sheet tidak terbaca, yang ada hanya salinan ${kursUmurTeks()}. NDPBM di jadwal tidak diubah.`, `The sheet could not be read; only a copy from ${kursUmurTeks()} is available. The schedule NDPBM is unchanged.`), "warning", { judul: tt("Kurs belum terbaru", "Rate is not current") });
    return;
  }
  const sebelum = kotak.value;
  if (Math.abs(nilaiKotakAngka("#fNdpbm") - usd) <= 0.01) {
    kursSyncKeadaan.sebelum = null;
    kursSyncSegarkan();
    showToast(tt(`NDPBM sudah sama dengan kurs terbaru (${kursFormat(usd)}).`, `The NDPBM already matches the latest rate (${kursFormat(usd)}).`), "info", { judul: tt("Tidak ada perubahan", "No change") });
    return;
  }
  kursSyncKeadaan.sebelum = sebelum;
  kotak.value = formatNumberValue(usd);
  kotak.dispatchEvent(new Event("input", { bubbles: true }));
  kursSyncSegarkan();
  showToast(
    tt(`NDPBM diubah ${sebelum ? `dari ${sebelum} ` : ""}ke ${kursFormat(usd)}. Bea & pajak ikut dihitung ulang. Simpan jadwal untuk menerapkannya.`, `NDPBM changed ${sebelum ? `from ${sebelum} ` : ""}to ${kursFormat(usd)}. Duties and taxes were recalculated. Save the schedule to apply it.`),
    "success",
    { judul: tt("Kurs diperbarui", "Rate updated") },
  );
}

(function pasangKursSync() {
  const tombol = $("#btnSyncKurs");
  const kotak = $("#fNdpbm");
  if (!tombol || !kotak) return;
  tombol.addEventListener("click", kursSyncTekan);
  // Mengetik di kotak NDPBM: keterangan beda ikut berubah
  kotak.addEventListener("input", () => kursSyncSegarkan());
  kursPantau(() => kursSyncSegarkan());
})();
