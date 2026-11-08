"use strict";

/* ------------------------------------------------------------------
   TAMPILAN DAFTAR BARANG: KARTU / TABEL
   (markup: pengalih .barang-tampilan di index.html; gaya: form.css,
   "DAFTAR BARANG DI FORM")

   Bawaannya KARTU: satu kartu berlabel per barang, semua kolom terlihat
   tanpa menggeser ke kanan. TABEL = 25 kolom satu baris per barang,
   untuk yang lebih suka mengisi banyak barang di kisi.

   Pilihannya hanya mengganti satu kelas di .barang-isi
   (.barang-isi--tabel); CSS yang menentukan tampilannya. Pilihan diingat
   per peramban ("exim.barangTampilan"), sama seperti lebar sidebar.
   Penyimpanan yang diblokir tidak merusak apa pun: pilihan berlaku
   sampai halaman dimuat ulang.
------------------------------------------------------------------ */
const BARANG_TAMPILAN_KUNCI = "exim.barangTampilan"; // "kartu" | "tabel"

function bacaTampilanBarang() {
  try {
    return localStorage.getItem(BARANG_TAMPILAN_KUNCI) === "tabel" ? "tabel" : "kartu";
  } catch (e) {
    return "kartu"; // penyimpanan diblokir: bawaan
  }
}

/* Pasang tampilan. `simpan` hanya benar saat pengguna yang memilih --
   bukan saat halaman dimuat, supaya memuat ulang tidak menulis apa-apa. */
function pasangTampilanBarang(mode, simpan) {
  const tabel = mode === "tabel";
  const wadah = document.querySelector(".barang-isi");
  if (wadah) wadah.classList.toggle("barang-isi--tabel", tabel);
  document.querySelectorAll("[data-barang-tampilan]").forEach((tombol) => {
    const aktif = tombol.dataset.barangTampilan === (tabel ? "tabel" : "kartu");
    tombol.classList.toggle("is-active", aktif);
    tombol.setAttribute("aria-pressed", String(aktif));
  });
  if (simpan) {
    try {
      localStorage.setItem(BARANG_TAMPILAN_KUNCI, tabel ? "tabel" : "kartu");
    } catch (e) {
      /* Tidak tersimpan: tetap berlaku sampai halaman dimuat ulang. */
    }
  }
  /* Lebar kotak Uraian berubah antara kartu dan tabel, jadi tingginya
     (autoGrowTextarea, item-table.js) diukur ulang SESUDAH tampilan baru
     tergambar. */
  if (typeof autoGrowAllItemNames === "function") requestAnimationFrame(autoGrowAllItemNames);
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-barang-tampilan]");
  if (tombol) pasangTampilanBarang(tombol.dataset.barangTampilan, true);
});

pasangTampilanBarang(bacaTampilanBarang(), false);
