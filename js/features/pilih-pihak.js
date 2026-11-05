"use strict";

/* ==================================================================
   NAMA SHIPPER (Import) / NAMA BUYER (Export) -- DROPDOWN YANG BISA
   DITAMBAH

   Kotak #fParty adalah kotak pilihan bersaring (combobox): diklik, panah
   di kanannya, atau panah bawah = daftar nama yang sudah dipakai jadwal
   buku ini; mengetik = menyaring daftar itu; nama yang belum ada
   ditambah lewat baris terakhir 'Tambah "…"' (atau cukup diketik).
   Nama yang diketik dengan ejaan lain dari yang sudah ada ("Dynamic
   Design Co Ltd") disamakan ke ejaan di daftar ("DYNAMIC DESIGN CO.,
   LTD.") begitu kotaknya ditinggalkan -- satu perusahaan tidak lagi
   tercatat dengan beberapa nama.

   Daftar dibentuk dari jadwal yang ada (tanpa tabel baru), jadi nama
   baru masuk daftar begitu jadwalnya tersimpan. Satu nama per kunci
   (huruf & angka saja); yang tampil ejaan yang paling sering dipakai.

   .value kotaknya tetap teks biasa: membuka jadwal, impor dokumen, dan
   Data PIB/PEB yang mengisi / membaca #fParty tidak berubah.
================================================================== */

const rapikanNamaPihak = (s) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

// Nama pihak jadwal satu buku: satu per kunci (ejaan terbanyak), urut abjad
function daftarNamaPihak(mode) {
  const perKunci = new Map();
  ((typeof data !== "undefined" && data[mode]) || []).forEach((s) => {
    const nama = rapikanNamaPihak(s && s.party);
    const k = kunciAlnum(nama);
    if (!k) return;
    if (!perKunci.has(k)) perKunci.set(k, new Map());
    const ejaan = perKunci.get(k);
    ejaan.set(nama, (ejaan.get(nama) || 0) + 1);
  });
  return [...perKunci.values()]
    .map((ejaan) => [...ejaan].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0])
    .sort((a, b) => a.localeCompare(b));
}

// Ejaan di daftar untuk sebuah nama (kunci sama), atau "" bila namanya baru
function namaPihakTerdaftar(nama, daftar) {
  const k = kunciAlnum(nama);
  return (k && daftar.find((n) => kunciAlnum(n) === k)) || "";
}

const pilihPihak = {
  wadah: $("#fPartyWadah"),
  isian: $("#fParty"),
  daftar: $("#fPartyDaftar"),
  ket: $("#fPartyKet"),
  semua: [],
  tampil: [], // [{ nama, baru }]
  aktif: -1,
  memilih: false, // pilihNamaPihak sedang mengabarkan isian barunya
};

const daftarPihakTerbuka = () => !!pilihPihak.daftar && !pilihPihak.daftar.classList.contains("d-none");

// i < 0 = tanpa sorotan (Enter lalu sekadar pindah isian)
function sorotPihak(i, gulir) {
  const p = pilihPihak;
  p.aktif = i < 0 || !p.tampil.length ? -1 : Math.min(i, p.tampil.length - 1);
  p.daftar.querySelectorAll(".pilih-pihak-opsi").forEach((el) => el.classList.toggle("is-aktif", Number(el.dataset.i) === p.aktif));
  const el = p.aktif >= 0 ? p.daftar.querySelector(`[data-i="${p.aktif}"]`) : null;
  if (!el) {
    p.isian.removeAttribute("aria-activedescendant");
    return;
  }
  p.isian.setAttribute("aria-activedescendant", el.id);
  // Hanya daftarnya yang digulir (scrollIntoView ikut menggulir halaman)
  const d = p.daftar;
  if (!gulir) return;
  if (el.offsetTop < d.scrollTop) d.scrollTop = el.offsetTop;
  else if (el.offsetTop + el.offsetHeight > d.scrollTop + d.clientHeight) d.scrollTop = el.offsetTop + el.offsetHeight - d.clientHeight;
}

/* Isi daftar. saring = teks yang diketik ("" = semua nama). Urutan:
   kuncinya sama, berawalan teks itu, memuatnya; lalu baris Tambah bila
   teksnya belum ada di daftar. */
function gambarDaftarPihak(saring) {
  const p = pilihPihak;
  const q = kunciAlnum(saring);
  const kini = kunciAlnum(p.isian.value);
  const peringkat = (n) => {
    const k = kunciAlnum(n);
    return k === q ? 0 : k.startsWith(q) ? 1 : 2;
  };
  const cocok = q ? p.semua.filter((n) => kunciAlnum(n).includes(q)).sort((a, b) => peringkat(a) - peringkat(b)) : p.semua.slice();
  p.tampil = cocok.map((nama) => ({ nama, baru: false }));
  if (q && !p.semua.some((n) => kunciAlnum(n) === q)) p.tampil.push({ nama: rapikanNamaPihak(saring), baru: true });
  p.daftar.innerHTML = p.tampil.length
    ? p.tampil.map((o, i) => {
      const dipilih = !o.baru && kunciAlnum(o.nama) === kini;
      const isi = o.baru
        ? `<i class="bi bi-plus-lg" aria-hidden="true"></i><span>${escapeHtml(tt(`Tambah "${o.nama}"`, `Add "${o.nama}"`))}</span>`
        : `<span>${escapeHtml(o.nama)}</span>${dipilih ? '<i class="bi bi-check2" aria-hidden="true"></i>' : ""}`;
      return `<div class="pilih-pihak-opsi${o.baru ? " is-baru" : ""}" id="fPartyOpsi${i}" role="option" data-i="${i}" aria-selected="${dipilih}">${isi}</div>`;
    }).join("")
    : `<div class="pilih-pihak-kosong">${escapeHtml(tt("Belum ada nama tersimpan — ketik nama baru.", "No saved names yet — type a new one."))}</div>`;
  // Sorotan: hasil teratas (sedang menyaring) atau nama yang sedang terpilih (daftar lengkap)
  const terpilih = p.tampil.findIndex((o) => !o.baru && kunciAlnum(o.nama) === kini);
  sorotPihak(q ? 0 : terpilih, true);
}

function bukaDaftarPihak(saring) {
  const p = pilihPihak;
  p.semua = daftarNamaPihak(activeMode);
  p.daftar.classList.remove("d-none");
  /* Dibuka ke atas bila ruang di bawah kotaknya tidak cukup (kotak di
     dekat tepi bawah layar, papan ketik ponsel terbuka). */
  const r = p.isian.getBoundingClientRect();
  const bawah = window.innerHeight - r.bottom;
  p.wadah.classList.toggle("is-atas", bawah < 260 && r.top > bawah);
  p.wadah.classList.add("is-buka");
  p.isian.setAttribute("aria-expanded", "true");
  gambarDaftarPihak(saring);
}

function tutupDaftarPihak() {
  const p = pilihPihak;
  if (!p.daftar) return;
  p.daftar.classList.add("d-none");
  p.wadah.classList.remove("is-buka");
  p.isian.setAttribute("aria-expanded", "false");
  p.isian.removeAttribute("aria-activedescendant");
  p.aktif = -1;
}

// Keterangan di bawah kotak (teksnya di index.html): nama yang belum ada di daftar
function segarkanKetPihak() {
  const p = pilihPihak;
  if (!p.ket) return;
  const nama = rapikanNamaPihak(p.isian.value);
  p.ket.hidden = !nama || !!namaPihakTerdaftar(nama, daftarNamaPihak(activeMode));
}

/* Ejaan lain dari nama yang sudah ada disamakan ke ejaan di daftar
   (diketik sendiri, atau dari impor dokumen). Mengembalikan true bila
   isinya diganti. */
function samakanNamaPihakForm() {
  const p = pilihPihak;
  if (!p.isian) return false;
  const sebelum = p.isian.value;
  const rapi = rapikanNamaPihak(sebelum);
  p.isian.value = namaPihakTerdaftar(rapi, daftarNamaPihak(activeMode)) || rapi;
  segarkanKetPihak();
  return p.isian.value !== sebelum;
}

// Form jadwal dibuka (renderFormPage): daftar tertutup, keterangan mengikuti isinya
function siapkanPilihPihak() {
  tutupDaftarPihak();
  segarkanKetPihak();
}

function pilihNamaPihak(i) {
  const p = pilihPihak;
  const o = p.tampil[i];
  if (!o) return;
  p.isian.value = o.nama;
  tutupDaftarPihak();
  // Seperti diketik lalu ditinggalkan: Data PIB/PEB, keterangan & aturan form lain ikut
  p.memilih = true;
  try {
    p.isian.dispatchEvent(new Event("input", { bubbles: true }));
    p.isian.dispatchEvent(new Event("change", { bubbles: true }));
  } finally {
    p.memilih = false;
  }
}

if (pilihPihak.wadah && pilihPihak.isian && pilihPihak.daftar) {
  const p = pilihPihak;
  p.isian.addEventListener("click", () => {
    if (!daftarPihakTerbuka()) bukaDaftarPihak("");
  });
  p.isian.addEventListener("input", () => {
    if (p.memilih) return;
    if (daftarPihakTerbuka()) gambarDaftarPihak(p.isian.value);
    else bukaDaftarPihak(p.isian.value);
  });
  p.isian.addEventListener("keydown", (e) => {
    const buka = daftarPihakTerbuka();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!buka) bukaDaftarPihak("");
      else sorotPihak(e.key === "ArrowDown" ? p.aktif + 1 : Math.max(0, p.aktif - 1), true);
    } else if (e.key === "Enter" && buka && p.aktif >= 0) {
      /* Nama yang disorot dipilih; Enter yang sama tetap memindahkan
         kursor ke isian berikutnya (ui/fokus.js) -- seperti kotak
         bersaran lain di form ini. */
      pilihNamaPihak(p.aktif);
    } else if (e.key === "Escape" && buka) {
      e.preventDefault();
      e.stopPropagation();
      tutupDaftarPihak();
    } else if (e.key === "Tab") tutupDaftarPihak();
  });
  const panah = $("#fPartyPanah");
  panah.addEventListener("click", () => {
    if (daftarPihakTerbuka()) tutupDaftarPihak();
    else bukaDaftarPihak("");
    p.isian.focus();
  });
  // Klik di panah & daftar tidak memindahkan fokus dari kotaknya
  [panah, p.daftar].forEach((el) => el.addEventListener("mousedown", (e) => e.preventDefault()));
  p.daftar.addEventListener("click", (e) => {
    const opsi = e.target.closest(".pilih-pihak-opsi");
    if (opsi) pilihNamaPihak(Number(opsi.dataset.i));
  });
  p.wadah.addEventListener("focusout", (e) => {
    if (!p.wadah.contains(e.relatedTarget)) tutupDaftarPihak();
  });
  /* Ditinggalkan sesudah diketik: ejaannya disamakan dengan daftar.
     Fase tangkap di wadahnya -- jalan SEBELUM pendengar `change` di
     kotaknya sendiri (Data PIB/PEB membaca nama yang sudah rapi). */
  p.wadah.addEventListener("change", (e) => {
    if (e.target === p.isian) samakanNamaPihakForm();
  }, true);
}
