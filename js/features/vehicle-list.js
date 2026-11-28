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

   Tiap mobil membawa SOPIRNYA (kotak kedua di barisnya, lihat
   kendaraanSopirTambahan di bawah).

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

/* SOPIR TIAP MOBIL. Dua mobil = dua sopir: tiap baris = [nomor mobil]
   [nama sopir]. Sopirlah yang MENERIMA barang dari PPIC, jadi namanya
   tercetak di "Diterima oleh" surat jalan ("Dikirim oleh" = PPIC, di
   bagian tanda tangan). Sopir mobil pertama = data-dn="receivedBy" (kunci
   lama, pengajuan lama tetap terbaca); sopir mobil berikutnya dikumpulkan
   sejajar sebagai `driverExtra`. Surat jalannya dicetak SATU PER SOPIR
   (cetakSuratJalan, surat-jalan-print.js). */
function kendaraanSopirTambahan() {
  return [...document.querySelectorAll("#vehicleList [data-veh-sopir]")];
}

/* Nama yang dibacakan tiap kotak ("Nomor mobil ke-2", "Sopir mobil ke-2")
   & penanda .ada-extra (lajur tombol hapus di semua baris + kepala). */
function kendaraanRapikan() {
  const wadah = document.querySelector(".dn-kendaraan");
  const extra = [...document.querySelectorAll("#vehicleList .veh-baris-extra")];
  if (wadah) wadah.classList.toggle("ada-extra", extra.length > 0);
  extra.forEach((baris, i) => {
    const ke = i + 2;
    const nopol = baris.querySelector("[data-veh-extra]");
    const sopir = baris.querySelector("[data-veh-sopir]");
    if (nopol) nopol.setAttribute("aria-label", tt(`Nomor mobil ke-${ke}`, `Vehicle ${ke} number`));
    if (sopir) sopir.setAttribute("aria-label", tt(`Sopir mobil ke-${ke}`, `Vehicle ${ke} driver`));
  });
}

function kendaraanTambahKotak(nilai, sopir) {
  const box = document.getElementById("vehicleList");
  if (!box) return null;
  const el = document.createElement("div");
  el.className = "veh-baris veh-baris-extra";
  el.innerHTML = `
    <input type="text" class="form-control" data-veh-extra
           autocomplete="off"
           value="${escapeAttr(nilai || "")}"
           placeholder="${escapeAttr(t("ph.nomor.polisi.kendaraan"))}">
    <input type="text" class="form-control" data-veh-sopir
           autocomplete="off" list="dnTtdList"
           value="${escapeAttr(sopir || "")}"
           placeholder="${escapeAttr(tt("Nama sopir", "Driver name"))}">
    <button type="button" class="rm-row" data-veh-del
            title="${escapeAttr(t("f.hapus.baris"))}" aria-label="${escapeAttr(t("f.hapus.baris"))}">
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>`;
  box.appendChild(el);
  kendaraanRapikan();
  return el.querySelector("input");
}

/* Mengisi ulang baris tambahan dari data tersimpan (atau mengosongkannya
   dengan daftar kosong). Baris pertama bukan urusan di sini: isiannya
   ber-data-dn biasa (vehicle & receivedBy). */
function setKendaraanExtra(daftar, sopir) {
  const box = document.getElementById("vehicleList");
  if (!box) return;
  box.querySelectorAll(".veh-baris-extra").forEach((baris) => baris.remove());
  (daftar || []).forEach((v, i) => kendaraanTambahKotak(v, (sopir || [])[i]));
  kendaraanRapikan();
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
    kendaraanRapikan();
  });
}
