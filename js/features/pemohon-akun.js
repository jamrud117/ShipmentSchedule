"use strict";

/* ==================================================================
   DROPDOWN PEMOHON / DRAFTER -- DAFTAR TETAP

   Semua isian Pemohon / Drafter di form Nomor Dokumen (select
   [data-dn="requester"]: Invoice, Delivery Order, Pengajuan Dana,
   PO & PR) hanya berisi DUA nama -- PEMOHON_BAWAAN -- dengan Yogi
   Firgiawan sebagai bawaan (defaultSelected, dipakai Kosongkan Form).
   Daftarnya tidak lagi mengikuti akun: akun baru atau akun yang sedang
   masuk tidak menambah pilihan.

   Pilihan yang sedang terpilih -- juga nama lama di pengajuan yang
   sedang diubah dan sudah tidak ada di daftar (disisipkan dnSetelIsian
   sebagai <option data-dn-lawas>) -- tidak pernah hilang, supaya
   menyimpan ulang nomor lama tidak menghapus nama pemohonnya.
================================================================== */
const PEMOHON_BAWAAN = ["Yogi Firgiawan", "Ahmad Riyan"];
const PEMOHON_UTAMA = "Yogi Firgiawan";

// Nama-nama pilihan (sama untuk semua jenis dokumen)
function pemohonDaftar() {
  return PEMOHON_BAWAAN.slice();
}

function pemohonIsiSelect(sel) {
  const daftar = pemohonDaftar();
  const kini = sel.value;
  // Pilihan kosong "— pilih —" (elemen aslinya: teksnya diterjemahkan i18n) & nama lama yang disisipkan tetap
  const kosong = [...sel.options].find((o) => o.value === "");
  const lawas = [...sel.options].filter((o) => o.dataset.dnLawas && !daftar.includes(o.value));
  const baru = daftar.map((nama) => {
    const o = document.createElement("option");
    o.value = nama;
    o.textContent = nama;
    o.defaultSelected = nama === PEMOHON_UTAMA;
    return o;
  });
  sel.replaceChildren(...[kosong].filter(Boolean), ...baru, ...lawas);
  /* Pilihan sendiri (atau nama pengajuan lama yang sedang diubah)
     dipertahankan; yang belum disentuh pengguna memakai bawaan. */
  const tetap = sel.dataset.disentuh || (kini && kini !== PEMOHON_UTAMA);
  if (tetap && kini && typeof dnSetelIsian === "function") dnSetelIsian(sel, kini);
  else sel.value = PEMOHON_UTAMA;
}

function pemohonTerapkan() {
  document.querySelectorAll('[data-docnum-panel] select[data-dn="requester"]').forEach(pemohonIsiSelect);
}

// Dipanggil saat halaman Nomor Dokumen dibuka (docnum-view.js)
function pemohonMuat() {
  pemohonTerapkan();
  return Promise.resolve(pemohonDaftar());
}

// Pilihan sendiri tidak ditimpa bawaan saat daftar diterapkan ulang
document.addEventListener("change", (e) => {
  const sel = e.target;
  if (sel && sel.matches && sel.matches('[data-docnum-panel] select[data-dn="requester"]')) sel.dataset.disentuh = "1";
});
