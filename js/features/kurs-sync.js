"use strict";

/* TOMBOL "SYNC" KURS NDPBM DI FORM JADWAL

   NDPBM jadwal TIDAK PERNAH berubah sendiri: membuka, mengedit, atau
   menyimpan jadwal tidak menyentuhnya. Kurs terbaru dari sheet KURS
   (core/kurs.js) hanya masuk ke jadwal saat pengguna menekan tombol ini,
   lalu menyimpan jadwalnya. Sampai itu, kotak NDPBM tetap berisi apa
   yang diketik / disimpan; titik di samping "Sync" menandai apakah
   isian itu sudah kurs terbaru, dan tooltip-nya menyebut kurs terbaru
   berapa, beda berapa dari isian.

   Yang disalin ke kotak NDPBM adalah kurs USD: jadwal selalu berhitung
   dalam USD (Total Nilai Barang, Freight, Asuransi). */

const kursSyncKeadaan = { sebelum: null, sibuk: false };

/* TITIK DI SAMPING "Sync" + tooltip tombolnya, mengikuti isian & kurs
   terbaru yang terbaca:
     baru    hijau  isian = kurs terbaru
     lama    merah  isian masih kurs lama (beda dari kurs terbaru)
     kosong  merah  NDPBM belum diisi
     belum   abu    kurs terbaru belum terbaca -- tidak bisa dinilai
     memuat  abu    sedang membaca sheet
   Kalimat lengkapnya di tooltip tombol (title) dan untuk pembaca layar
   (#kursSyncInfo, role=status -- kotak NDPBM merujuknya lewat
   aria-describedby). Tidak ada keterangan panjang yang tampil. */
function kursSyncSegarkan() {
  const info = $("#kursSyncInfo");
  const tombol = $("#btnSyncKurs");
  if (!info || !tombol) return;
  const wadah = $("#kursSync") || tombol.parentElement;
  const usd = kursUsd();
  const isi = nilaiKotakAngka("#fNdpbm");
  tombol.disabled = kursSyncKeadaan.sibuk;
  tombol.classList.toggle("is-sibuk", kursSyncKeadaan.sibuk);
  tombol.setAttribute("aria-busy", kursSyncKeadaan.sibuk ? "true" : "false");
  const ajakan = tt("Tekan Sync untuk menyalin kurs USD terbaru ke kotak NDPBM.", "Press Sync to copy the latest USD rate into the NDPBM field.");
  let status;
  let teks;
  if (kursSyncKeadaan.sibuk && !usd) {
    status = "memuat";
    teks = tt("Membaca kurs dari sheet…", "Reading the rate from the sheet…");
  } else if (!usd) {
    status = "belum";
    teks = tt("Kurs terbaru belum terbaca. Tekan Sync untuk mencoba lagi.", "The latest rate has not been read yet. Press Sync to try again.");
  } else {
    const umur = kursUmurTeks();
    const salinan = kursKeadaan.data && kursKeadaan.data.dariCache;
    const beda = Math.round((isi - usd) * 100) / 100;
    if (isi && Math.abs(beda) <= 0.01) {
      status = "baru";
      teks = kursSyncKeadaan.sebelum != null
        ? tt(`Diperbarui ke kurs terbaru (${kursFormat(usd)}, ${umur}). Simpan jadwal untuk menerapkannya.`, `Updated to the latest rate (${kursFormat(usd)}, ${umur}). Save the schedule to apply it.`)
        : tt(`Sudah kurs terbaru (${kursFormat(usd)}, ${umur}).`, `Already the latest rate (${kursFormat(usd)}, ${umur}).`);
    } else if (!isi) {
      status = "kosong";
      teks = tt(`NDPBM belum diisi. Kurs terbaru ${kursFormat(usd)} (${umur}).`, `The NDPBM is empty. Latest rate ${kursFormat(usd)} (${umur}).`) + " " + ajakan;
    } else {
      status = "lama";
      teks = tt(`Masih kurs lama: isian ${kursFormat(isi)}, kurs terbaru ${kursFormat(usd)} (${umur}) — isian ${beda > 0 ? "lebih tinggi" : "lebih rendah"} ${kursFormat(Math.abs(beda))}.`,
        `Still an old rate: the field is ${kursFormat(isi)}, the latest rate is ${kursFormat(usd)} (${umur}) — ${kursFormat(Math.abs(beda))} ${beda > 0 ? "higher" : "lower"}.`) + " " + ajakan;
    }
    if (salinan) teks += " " + tt("(Sheet tidak terbaca; ini salinan tersimpan.)", "(The sheet could not be read; this is a saved copy.)");
  }
  wadah.dataset.status = status;
  tombol.title = teks;
  info.textContent = teks;
  /* Kembalikan isian sebelum Sync: tombol ikon kecil di samping Sync
     (tooltip "Kembalikan 16,500"), hanya selama isian masih hasil Sync. */
  const kembali = kursSyncKeadaan.sebelum != null && usd && Math.abs(isi - usd) <= 0.01;
  let btn = $("#btnSyncKursKembali");
  if (kembali) {
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "btnSyncKursKembali";
      btn.className = "kurs-sync-kembali";
      btn.innerHTML = '<i class="bi bi-arrow-return-left" aria-hidden="true"></i>';
      btn.addEventListener("click", kursSyncKembalikan);
      tombol.insertAdjacentElement("afterend", btn);
    }
    const label = tt(`Kembalikan ${kursSyncKeadaan.sebelum || "kosong"}`, `Restore ${kursSyncKeadaan.sebelum || "empty"}`);
    btn.title = label;
    btn.setAttribute("aria-label", label);
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
  // Mengetik di kotak NDPBM: titik & tooltip ikut berubah
  kotak.addEventListener("input", () => kursSyncSegarkan());
  kursPantau(() => kursSyncSegarkan());
  kursSyncSegarkan();
})();
