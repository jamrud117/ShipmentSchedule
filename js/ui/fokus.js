"use strict";

/* ==================================================================
   FOKUS — LANGSUNG SIAP MENGETIK

   Setiap kali pengguna MULAI mengisi sesuatu -- membuka form Tambah
   Jadwal, pop-up isian, panel nomor dokumen, menambah baris -- kursor
   sudah menunggu di isian pertama yang perlu diisi. Tidak perlu meraih
   tetikus dulu hanya untuk mengklik kotaknya.

   "Yang perlu diisi" = isian KOSONG pertama. Isian yang sudah terisi
   bawaan (No. urut berikutnya, tanggal hari ini, satuan NIU) dilewati;
   kalau semuanya sudah terisi (sedang mengubah data), kursor ke isian
   pertama.

   Selebihnya di berkas ini:
     - Enter = isian berikutnya di form panjang ([data-enter-lanjut]),
     - fokus kembali ke tombol pemicunya saat kotak dialog ditutup,
     - kunciFokus(): menemukan "elemen yang sama" sesudah digambar ulang
       (dipakai render() supaya fokus tidak hilang, lihat list.js).
================================================================== */

// Kotak yang bisa diketik / dipilih -- bukan tombol, centang, atau berkas
const ISIAN_KETIK = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])' +
    ':not([type="button"]):not([type="submit"]):not([type="reset"])' +
    ':not([type="file"]):not([type="image"]):not([type="range"])',
  "select",
  "textarea",
].join(", ");

/* Benar-benar tampil di layar (bukan display:none, bukan di halaman /
   tab yang tersembunyi). Dipisah supaya uji di jsdom -- yang tidak
   punya tata letak -- bisa menggantinya. */
function tampilDiLayar(el) {
  return el.getClientRects().length > 0;
}

function bisaDiisi(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tabIndex < 0) return false;
  if (el.closest("[hidden], [inert], .d-none")) return false;
  return tampilDiLayar(el);
}

function isianKosong(el) {
  return !String(el.value == null ? "" : el.value).trim();
}

/* Isian yang perlu diisi lebih dulu di dalam `wadah`.
   opsi.pertama: isian pertama, kosong atau tidak. */
function isianPertama(wadah, opsi) {
  if (!wadah) return null;
  const semua = [...wadah.querySelectorAll(ISIAN_KETIK)].filter(bisaDiisi);
  if (!semua.length) return null;
  if (opsi && opsi.pertama) return semua[0];
  return semua.find(isianKosong) || semua[0];
}

/* opsi.tanpaGulir: halaman tidak digulir ke kotaknya (kotaknya sudah
   terlihat, atau sengaja dibiarkan di luar layar).
   opsi.pilihIsi: isi yang sudah ada disorot -- langsung tertimpa
   begitu mengetik. */
function fokuskan(el, opsi) {
  if (!el) return null;
  const o = opsi || {};
  try {
    el.focus({ preventScroll: !!o.tanpaGulir });
  } catch (err) {
    el.focus();
  }
  if (o.pilihIsi && el.value && typeof el.select === "function") {
    try {
      el.select();
    } catch (err) {
      /* kotak tanggal tidak punya seleksi teks */
    }
  }
  return el;
}

function fokusIsianPertama(wadah, opsi) {
  return fokuskan(isianPertama(wadah, opsi), opsi);
}

/* Isian sesudah `el` di dalam `wadah`, urut seperti tombol Tab.
   [data-enter-lewati]: kotak tambahan yang bukan bagian dari isian
   utama (mis. penulis kronologi di form jadwal) -- tidak disinggahi. */
function isianBerikutnya(el, wadah) {
  const semua = [...wadah.querySelectorAll(ISIAN_KETIK)].filter(
    (x) => x === el || (bisaDiisi(x) && !x.closest("[data-enter-lewati]")),
  );
  const i = semua.indexOf(el);
  return i < 0 ? null : semua[i + 1] || null;
}

/* Layar sentuh: papan ketik layar ikut terbuka begitu kotak difokus dan
   menutupi separuh layar. Fokus otomatis yang TIDAK diminta langsung
   oleh pengguna (sekadar membuka halaman) dilewati di sana. */
function layarSentuh() {
  return typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/* Kotak yang kurang diisi saat menyimpan: dibawa ke tengah layar,
   difokus, dan diberi garis merah sampai diubah. Lebih jelas daripada
   pesan "mohon isi ETD" yang menyuruh mencari sendiri kotaknya. */
function tandaiIsianKurang(el) {
  if (!el) return;
  el.classList.add("is-invalid");
  const lepas = () => {
    el.classList.remove("is-invalid");
    el.removeEventListener("input", lepas);
    el.removeEventListener("change", lepas);
  };
  el.addEventListener("input", lepas);
  el.addEventListener("change", lepas);
  fokuskan(el, { tanpaGulir: true });
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ------------------------------------------------------------------
   ENTER = ISIAN BERIKUTNYA

   Di form panjang (form jadwal, form nomor dokumen) Enter memindahkan
   kursor ke isian berikutnya -- seperti mengisi lembar kerja -- jadi
   tangan tidak perlu meninggalkan papan ketik. Di isian TERAKHIR:
     data-enter-kirim="<selektor>"  tombol itu ditekan (mis. tab
                                     berikutnya),
     data-enter-akhir="<selektor>"  tombol itu difokus -- Enter sekali
                                     lagi menekannya. Dipakai untuk
                                     tindakan yang tidak boleh terjadi
                                     tanpa sengaja (menerbitkan nomor).
   Kotak teks panjang tetap memakai Enter untuk baris baru, dan komponen
   yang mengurus Enter-nya sendiri ([data-enter-sendiri]: tabel barang,
   rincian biaya, daftar PO) dilewati.
------------------------------------------------------------------ */
/* Tombol tujuan di isian terakhir. Boleh beberapa selektor dipisah
   koma: yang dipakai yang PERTAMA tampil -- form nomor dokumen yang
   sedang dibuka di pop-up Ubah Isian menuju tombol Simpan pop-up itu,
   bukan tombol Ajukan di halaman di belakangnya. */
function tombolTujuanEnter(daftar) {
  if (!daftar) return null;
  for (const sel of daftar.split(",")) {
    const el = document.querySelector(sel.trim());
    if (el && !el.disabled && tampilDiLayar(el)) return el;
  }
  return null;
}
function enterKeIsianBerikutnya(el, grup) {
  const berikut = isianBerikutnya(el, grup);
  if (berikut) {
    fokuskan(berikut, { pilihIsi: true });
    return;
  }
  const kirim = tombolTujuanEnter(grup.dataset.enterKirim);
  if (kirim) {
    kirim.click();
    return;
  }
  fokuskan(tombolTujuanEnter(grup.dataset.enterAkhir));
}

/* Tombol Enter papan ketik ponsel ikut berlabel sesuai perilakunya:
   "Berikutnya" selama masih ada isian sesudahnya, "Selesai"/"Kirim" di
   isian terakhir. */
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!el || !el.matches || el.tagName === "TEXTAREA" || !el.matches(ISIAN_KETIK)) return;
  const grup = el.closest("[data-enter-lanjut]");
  if (!grup || el.closest("[data-enter-sendiri]")) return;
  el.setAttribute("enterkeyhint", isianBerikutnya(el, grup) ? "next" : grup.dataset.enterKirim ? "go" : "done");
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (e.defaultPrevented) return;
  const el = e.target;
  if (!el || !el.matches || el.tagName === "TEXTAREA" || !el.matches(ISIAN_KETIK)) return;
  const grup = el.closest("[data-enter-lanjut]");
  if (!grup) return;
  /* Tabel yang mengurus Enter-nya sendiri (barang, rincian biaya, baris
     surat jalan, daftar PO): turun ke baris berikutnya, bukan ke isian
     sesudahnya. Ditandai di wadahnya, tidak mengandalkan
     defaultPrevented saja. */
  if (el.closest("[data-enter-sendiri]")) return;
  /* Kotak bersaran (datalist): peramban memasang saran yang dipilih
     dengan Enter yang sama -- jadi bawaannya tidak dicegah dan
     pindahnya ditunda sesaat, sesudah sarannya terpasang. */
  if (el.list) {
    setTimeout(() => enterKeIsianBerikutnya(el, grup), 0);
    return;
  }
  e.preventDefault();
  enterKeIsianBerikutnya(el, grup);
});

/* ------------------------------------------------------------------
   KUNCI ELEMEN

   Daftar jadwal & tabel digambar ulang lewat innerHTML: tombol yang
   tadinya difokus diganti elemen baru yang sama persis. Kuncinya
   dibentuk dari atribut penanda (id, data-action + data-id, ...) dan
   dipakai menemukan kembarannya sesudah digambar ulang.
------------------------------------------------------------------ */
const ATRIBUT_KUNCI_FOKUS = ["data-action", "data-id", "data-field", "data-step", "data-note-input", "data-tab", "data-docnum-tab"];

function kutipNilaiSelektor(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}

function kunciFokus(el) {
  if (!el || !el.tagName || el === document.body || el === document.documentElement) return null;
  if (el.id) return `[id="${kutipNilaiSelektor(el.id)}"]`;
  const bagian = ATRIBUT_KUNCI_FOKUS.filter((a) => el.hasAttribute(a)).map(
    (a) => `[${a}="${kutipNilaiSelektor(el.getAttribute(a))}"]`,
  );
  return bagian.length ? el.tagName.toLowerCase() + bagian.join("") : null;
}

/* ------------------------------------------------------------------
   FOKUS KEMBALI KE PEMICUNYA

   Kotak dialog yang dibuka lewat kode (showPrompt, showConfirm, pop-up
   lain) tidak mengembalikan fokus saat ditutup -- Bootstrap hanya
   melakukannya untuk pemicu data-bs-toggle. Fokus jatuh ke <body> dan
   Tab berikutnya mulai lagi dari atas halaman. Di sini fokus kembali ke
   tombol yang membukanya -- atau kembarannya, kalau kartunya sempat
   digambar ulang selama dialog terbuka (mis. sesudah konfirmasi tahap
   dokumen).
------------------------------------------------------------------ */
const pemicuDialog = new WeakMap();
document.addEventListener("show.bs.modal", (e) => {
  const el = document.activeElement;
  if (!el || el === document.body || e.target.contains(el)) return;
  // Dialog yang dibuka dari dialog lain: pemicunya dialog itu sendiri
  if (el.closest(".modal")) return;
  pemicuDialog.set(e.target, { el, kunci: kunciFokus(el) });
});
document.addEventListener("hidden.bs.modal", (e) => {
  const simpan = pemicuDialog.get(e.target);
  pemicuDialog.delete(e.target);
  if (!simpan) return;
  if (document.querySelector(".modal.show")) return; // dialog lain masih menunggu
  const aktif = document.activeElement;
  // Kode lain sudah memindahkan fokus (mis. ke kotak yang kurang diisi)
  if (aktif && aktif !== document.body && !e.target.contains(aktif)) return;
  const el = simpan.el.isConnected ? simpan.el : simpan.kunci ? document.querySelector(simpan.kunci) : null;
  if (!el || el.disabled || !tampilDiLayar(el)) return;
  fokuskan(el, { tanpaGulir: true });
});

/* ------------------------------------------------------------------
   iOS: TIDAK MEMPERBESAR HALAMAN SAAT KOTAK DIFOKUS

   Safari di iPhone memperbesar halaman setiap kali kotak isian yang
   hurufnya lebih kecil dari 16px disentuh -- dan tidak mengecilkannya
   lagi sesudahnya: tiap kali mengisi, pengguna harus mencubit layar
   untuk kembali. Dicegah dengan maximum-scale=1, KHUSUS iOS: sejak
   iOS 10 Safari tetap mengizinkan cubit-perbesar walau ada
   maximum-scale, jadi pembesaran manual tidak hilang. Android tidak
   disentuh -- di sana maximum-scale justru mematikan cubit-perbesar,
   dan Android memang tidak memperbesar halaman saat kotak difokus.
------------------------------------------------------------------ */
(function cegahZoomFokusIos() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && !/maximum-scale/.test(meta.content)) meta.content += ", maximum-scale=1";
})();
