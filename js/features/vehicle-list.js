"use strict";

/* ------------------------------------------------------------------
   DAFTAR NOMOR MOBIL PADA PENGAJUAN DELIVERY ORDER

   Satu kiriman export kerap diangkut lebih dari satu mobil, dan surat
   jalannya harus menyebut semuanya (kolom Nopol, satu kotak per mobil
   dengan tinggi dibagi rata).

   Pola yang sama dengan nomor PO (po-list.js): kotak PERTAMA tetap
   memakai data-dn="vehicle" -- jalur penyimpanan yang sudah ada.
   Mobil kedua dan seterusnya dikumpulkan terpisah sebagai
   `vehicleExtra`, sehingga pengajuan lama yang menyimpan satu nomor
   tetap terbaca apa adanya tanpa migrasi data.

   Enter TIDAK diambil alih (wadahnya tidak ber-data-enter-sendiri):
   kiriman dengan satu mobil -- yang paling sering -- tetap berpindah ke
   isian berikutnya seperti sebelum ada tombol ini. Mobil tambahan
   ditambah lewat tombol "+ Nomor Mobil".

   Penyatuan & penyaringan daftarnya (kosong dibuang, nomor kembar
   dicetak sekali) ada di sjDaftarKendaraan() -- surat-jalan-print.js --
   supaya form, cetakan, dan detail memakai satu aturan yang sama.
------------------------------------------------------------------ */

function kendaraanKotakTambahan() {
  return [...document.querySelectorAll("#vehicleList [data-veh-extra]")];
}

function kendaraanTambahKotak(nilai) {
  const box = document.getElementById("vehicleList");
  if (!box) return null;
  const el = document.createElement("div");
  el.className = "veh-baris veh-baris-extra";
  el.innerHTML = `
    <input type="text" class="form-control" data-veh-extra
           autocomplete="off"
           value="${escapeAttr(nilai || "")}"
           placeholder="${escapeAttr(t("ph.nomor.polisi.kendaraan"))}"
           aria-label="${escapeAttr(tt("Nomor kendaraan tambahan", "Additional vehicle number"))}">
    <button type="button" class="rm-row" data-veh-del
            title="${escapeAttr(t("f.hapus.baris"))}" aria-label="${escapeAttr(t("f.hapus.baris"))}">
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>`;
  box.appendChild(el);
  return el.querySelector("input");
}

/* Mengisi ulang kotak tambahan dari data tersimpan (atau mengosongkannya
   dengan daftar kosong). Kotak pertama bukan urusan di sini: ia isian
   ber-data-dn biasa. */
function setKendaraanExtra(daftar) {
  const box = document.getElementById("vehicleList");
  if (!box) return;
  kendaraanKotakTambahan().forEach((el) => {
    const baris = el.closest(".veh-baris-extra");
    if (baris) baris.remove();
  });
  (daftar || []).forEach((v) => kendaraanTambahKotak(v));
}

const btnVehicleAddEl = document.getElementById("btnVehicleAdd");
if (btnVehicleAddEl) {
  btnVehicleAddEl.addEventListener("click", () => {
    const kotak = kendaraanTambahKotak("");
    if (kotak) kotak.focus();
  });
}

const vehicleListEl = document.getElementById("vehicleList");
if (vehicleListEl) {
  vehicleListEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-veh-del]");
    if (!del) return;
    const baris = del.closest(".veh-baris-extra");
    if (baris) baris.remove();
  });
}
