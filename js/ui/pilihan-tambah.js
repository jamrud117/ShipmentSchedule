"use strict";

/* ==================================================================
   DROPDOWN YANG BISA DITAMBAH -- <select> + pilihan "+ Tambah …"

   Satu perilaku untuk semua daftar nama yang tumbuh: Dibayarkan Kepada
   (fund-vendor.js) dan Customer invoice (invoice-pihak.js).

     - pilihan tanpa kembar: dibandingkan tanpa beda huruf besar/kecil &
       tanda baca ("pt. dsv" = "PT DSV"), urut abjad;
     - nilai yang datang dari luar daftar (berkas yang dibaca, pengajuan
       lama yang dibuka) ditambahkan sebagai pilihan, jadi tidak pernah
       diam-diam hilang dari kotaknya;
     - pilihan terakhir "+ Tambah …" (bertanda data-pilihan-tambah) tidak
       pernah tinggal terpilih: dropdown kembali ke pilihan sebelumnya
       lalu onTambah(kotak) membuka isian nama barunya.
================================================================== */
const pilihanRapikan = (teks) => String(teks == null ? "" : teks).replace(/\s+/g, " ").trim();
const pilihanKunci = (teks) => pilihanRapikan(teks).toUpperCase().replace(/[^\p{L}\p{N}]+/gu, "");
const pilihanTambahEl = (kotak) => kotak.querySelector("option[data-pilihan-tambah]");

// Gabungan beberapa daftar: satu nama per kunci (yang pertama ditemukan), urut abjad
function pilihanSatukan(...daftar) {
  const per = new Map();
  daftar.flat().forEach((v) => {
    const nama = pilihanRapikan(v);
    const k = pilihanKunci(nama);
    if (k && !per.has(k)) per.set(k, nama);
  });
  return [...per.values()].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
}

/* Pilihan digambar ulang dari daftar. Yang sedang terpilih tetap
   terpilih, termasuk yang tidak ada di daftar. opsi: { kosong, tambah,
   sentinel } -- teks pilihan kosong, teks & nilai pilihan "+ Tambah". */
function pilihanGambar(kotak, daftar, opsi) {
  if (!kotak) return;
  const kini = kotak.value === opsi.sentinel ? "" : kotak.value;
  const semua = daftar.slice();
  if (kini && !semua.includes(kini)) semua.push(kini);
  kotak.innerHTML =
    `<option value="">${escapeHtml(opsi.kosong)}</option>` +
    semua.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("") +
    `<option value="${escapeAttr(opsi.sentinel)}" data-pilihan-tambah>${escapeHtml(opsi.tambah)}</option>`;
  kotak.value = kini;
}

/* Memastikan sebuah nama ada di pilihan; mengembalikan ejaan yang dipakai
   (yang sudah ada menang -- itulah gunanya dropdown ini). */
function pilihanPastikan(kotak, nama) {
  const rapi = pilihanRapikan(nama);
  if (!kotak || !rapi) return rapi;
  const k = pilihanKunci(rapi);
  const ada = [...kotak.options].find((o) => o.value && !o.hasAttribute("data-pilihan-tambah") && pilihanKunci(o.value) === k);
  if (ada) return ada.value;
  kotak.insertBefore(new Option(rapi, rapi), pilihanTambahEl(kotak));
  return rapi;
}

// Pilih sebuah nama seperti dipilih pengguna (peristiwa input & change ikut)
function pilihanPilih(kotak, nama) {
  kotak.value = pilihanPastikan(kotak, nama);
  kotak.dispatchEvent(new Event("input", { bubbles: true }));
  kotak.dispatchEvent(new Event("change", { bubbles: true }));
}

/* Pilihan "+ Tambah …" pada kotak yang cocok dengan `pemilih`: dropdown
   kembali ke pilihan sebelumnya dulu (membatalkan isian nama barunya
   tidak boleh meninggalkan pilihan itu terpilih), lalu onTambah(kotak). */
function pilihanPasangTambah(pemilih, sentinel, onTambah) {
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest && e.target.closest(pemilih);
    if (el && el.value !== sentinel) el.dataset.sebelum = el.value;
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest && e.target.closest(pemilih);
    if (!el) return;
    if (el.value !== sentinel) {
      el.dataset.sebelum = el.value;
      return;
    }
    el.value = el.dataset.sebelum || "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (!requireEdit()) return;
    onTambah(el);
  });
}
