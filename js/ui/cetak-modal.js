"use strict";

/* ------------------------------------------------------------------
   MODAL CETAK -- pratinjau surat di dalam aplikasi, dicetak dari situ

   Dulu mencetak = membuka jendela baru (about:blank) lalu memanggil
   print() padanya. Hasilnya dua lapis yang harus ditutup satu per satu
   -- dialog cetak peramban, lalu jendela kosongnya -- tampilannya
   polos, dan peramban bisa memblokir jendelanya sebagai pop-up.

   Kini surat tampil sebagai pratinjau di kotak aplikasi (satu iframe
   selebar kertas A4) dan dicetak dari iframe itu: tidak ada jendela
   lain. Sesudah dialog cetak ditutup, kotak ini ikut menutup sendiri
   (kotak centang di kakinya bisa mematikannya) -- tinggal satu langkah.

   bukaModalCetak({ jenis, nomor, judulBerkas, muat })
     jenis        label kecil di kepala ("Form Pengajuan Dana")
     nomor        nomor dokumen -- judul besar di kepala
     judulBerkas  nama berkas bawaan dialog cetak ("Save as PDF")
     muat         async () => teks HTML dokumen LENGKAP (<!doctype html>
                  ...). Dipanggil SESUDAH kotak tampil, jadi boleh
                  menunggu sesuatu tanpa tombolnya terasa mati.
   Mengembalikan janji: true bila pratinjaunya siap, false bila kotak
   sudah ditutup selagi menunggu atau suratnya gagal disiapkan.

   Kotak ini sengaja TIDAK memakai window.open: dibuka sesudah menunggu
   apa pun, jendela baru dianggap pop-up liar dan diblokir -- di sini
   tidak ada yang bisa diblokir.
------------------------------------------------------------------ */

const CETAK_LEBAR_KERTAS = 794; // A4 210 mm pada 96 dpi (piksel CSS)
const CETAK_TINGGI_KERTAS = 1123; // A4 297 mm
const CETAK_KUNCI_TUTUP = "cetak-tutup-otomatis";
const CETAK_BATAS_GAMBAR = 1500; // ms: gambar surat yang lambat tidak boleh menahan pratinjau

const cetakModalEl = document.getElementById("cetakModal");
let cetakSesi = null; // sesi yang sedang tampil -- null = kotak tertutup
const cetakEl = (id) => document.getElementById(id);

/* Tutup otomatis menyala bila belum pernah dimatikan; pilihannya
   diingat di peramban ini saja. */
function cetakTutupOtomatisAktif() {
  try {
    return localStorage.getItem(CETAK_KUNCI_TUTUP) !== "0";
  } catch (err) {
    return true;
  }
}

function cetakTutup() {
  if (typeof bootstrap === "undefined" || !cetakModalEl) return;
  bootstrap.Modal.getOrCreateInstance(cetakModalEl).hide();
}

/* ---------- ukuran pratinjau ---------- */

/* Iframe selebar kertas dan setinggi isinya. Di layar sempit seluruh
   kertas dikecilkan (transform) supaya muat, dan pembungkusnya
   mengikuti ukuran hasil kecilnya -- tanpa itu halaman bergeser ke
   samping. */
function cetakUkurKertas() {
  const meja = cetakEl("cetakMeja");
  const ukur = cetakEl("cetakUkur");
  const kertas = cetakEl("cetakKertas");
  const bingkai = cetakEl("cetakBingkai");
  if (!meja || !ukur || !kertas || !bingkai || ukur.hidden) return;
  let tinggi = CETAK_TINGGI_KERTAS;
  try {
    const dok = bingkai.contentDocument;
    // Diukur dari nol: tinggi bingkai yang lama tidak boleh ikut terbaca
    bingkai.style.height = "0px";
    tinggi = Math.max(dok.documentElement.scrollHeight, (dok.body && dok.body.scrollHeight) || 0, CETAK_TINGGI_KERTAS);
  } catch (err) {
    /* Isi tak terbaca: setinggi satu kertas */
  }
  const skala = meja.clientWidth > 0 ? Math.min(1, meja.clientWidth / CETAK_LEBAR_KERTAS) : 1;
  bingkai.style.height = tinggi + "px";
  kertas.style.transform = skala < 1 ? "scale(" + skala + ")" : "";
  ukur.style.width = Math.round(CETAK_LEBAR_KERTAS * skala) + "px";
  ukur.style.height = Math.round(tinggi * skala) + "px";
}

/* Gambar di dalam surat (logo) ditunggu agar tingginya terukur benar;
   surat tanpa gambar langsung siap. Batas waktu: gambar yang tak kunjung
   selesai tidak boleh menahan pratinjau. */
function cetakTungguGambar(dok) {
  const belum = Array.from(dok.images || []).filter((g) => !g.complete);
  if (!belum.length) return Promise.resolve();
  return new Promise((selesai) => {
    let sisa = belum.length;
    const pewaktu = setTimeout(selesai, CETAK_BATAS_GAMBAR);
    const satuSelesai = () => {
      if (--sisa > 0) return;
      clearTimeout(pewaktu);
      selesai();
    };
    belum.forEach((g) => {
      g.addEventListener("load", satuSelesai);
      g.addEventListener("error", satuSelesai);
    });
  });
}

/* ---------- membuka & menyiapkan ---------- */

function cetakKeadaanMemuat(o) {
  cetakEl("cetakJenis").textContent = o.jenis || "";
  cetakEl("cetakNomor").textContent = o.nomor || "—";
  cetakEl("cetakStatus").hidden = false;
  cetakEl("cetakUkur").hidden = true;
  cetakEl("cetakTombol").disabled = true;
  cetakEl("cetakTutupOtomatis").checked = cetakTutupOtomatisAktif();
}

function bukaModalCetak(opsi) {
  const o = opsi || {};
  if (!cetakModalEl || typeof bootstrap === "undefined" || typeof o.muat !== "function") return Promise.resolve(false);
  const sesi = {
    asal: document.activeElement,
    judulBerkas: String(o.judulBerkas || o.nomor || ""),
    siap: false,
    mencetak: false,
    pulihJudul: null,
  };
  cetakSesi = sesi;
  cetakKeadaanMemuat(o);
  bootstrap.Modal.getOrCreateInstance(cetakModalEl).show();
  return cetakSiapkanIsi(sesi, o.muat);
}

async function cetakSiapkanIsi(sesi, muat) {
  try {
    const html = await muat();
    if (cetakSesi !== sesi) return false; // ditutup selagi menunggu
    const dok = cetakEl("cetakBingkai").contentDocument;
    dok.open();
    dok.write(html);
    dok.close();
    // Ctrl+P & Esc juga ditangkap bila kursor sempat masuk ke bingkai (open() membuang pendengar lama)
    dok.addEventListener("keydown", cetakTekanTombolBingkai);
    await cetakTungguGambar(dok);
    if (cetakSesi !== sesi) return false;
    sesi.siap = true;
    cetakEl("cetakStatus").hidden = true;
    cetakEl("cetakUkur").hidden = false;
    cetakUkurKertas();
    const tombol = cetakEl("cetakTombol");
    tombol.disabled = false;
    /* Enter langsung mencetak: kursor ke tombol Cetak -- kecuali pengguna
       sudah memindahkannya sendiri ke kontrol lain di kotak ini. Kalau
       kotaknya belum selesai tampil, shown.bs.modal yang mengulanginya
       (Bootstrap memindahkan kursor ke kotaknya saat itu). */
    const aktif = document.activeElement;
    if (aktif === cetakModalEl || !cetakModalEl.contains(aktif)) tombol.focus();
    return true;
  } catch (err) {
    console.error(err);
    if (cetakSesi === sesi) {
      cetakTutup();
      showToast(tt("Surat tidak bisa disiapkan. Coba lagi.", "The document could not be prepared. Please try again."), "danger");
    }
    return false;
  }
}

/* ---------- mencetak ---------- */

function cetakModalCetak() {
  const sesi = cetakSesi;
  const bingkai = cetakEl("cetakBingkai");
  const jendela = bingkai && bingkai.contentWindow;
  if (!sesi || !sesi.siap || sesi.mencetak || !jendela) return;
  sesi.mencetak = true;

  /* Nama berkas bawaan "Save as PDF" diambil peramban dari judul HALAMAN
     -- untuk iframe itu judul halaman induk, bukan judul isi iframe. Judul
     diganti selama dialog cetak terbuka, lalu dikembalikan. */
  const judulAsal = document.title;
  if (sesi.judulBerkas) document.title = sesi.judulBerkas;

  const lepas = () => {
    sesi.mencetak = false;
    sesi.pulihJudul = null;
    jendela.removeEventListener("afterprint", selesai);
    window.removeEventListener("afterprint", selesai);
    document.title = judulAsal;
  };
  const selesai = () => {
    if (!sesi.mencetak) return;
    lepas();
    if (cetakSesi !== sesi) return;
    /* afterprint datang untuk dicetak MAUPUN dibatalkan -- peramban tidak
       membedakannya. Tutup otomatis menutup keduanya; yang membatalkan
       tinggal membuka lagi dari daftar. */
    if (cetakTutupOtomatisAktif()) setTimeout(cetakTutup, 0);
    else cetakEl("cetakTombol").focus();
  };
  sesi.pulihJudul = lepas; // kotak ditutup selagi dialog cetak belum selesai: judul tetap dikembalikan
  jendela.addEventListener("afterprint", selesai);
  window.addEventListener("afterprint", selesai);
  try {
    jendela.focus();
    jendela.print();
  } catch (err) {
    console.error(err);
    lepas();
    showToast(tt("Dialog cetak tidak bisa dibuka.", "The print dialog could not be opened."), "danger");
  }
}

/* Ctrl/Cmd+P selagi kotak terbuka mencetak SURAT ini -- bukan halaman
   aplikasi di belakangnya. */
function cetakTekanCetak(e) {
  if (!cetakSesi || !(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== "p") return;
  e.preventDefault();
  cetakModalCetak();
}
/* Di dalam bingkai Esc tidak sampai ke Bootstrap (dokumennya lain),
   jadi kotak ditutup dari sini. */
function cetakTekanTombolBingkai(e) {
  cetakTekanCetak(e);
  if (cetakSesi && e.key === "Escape") cetakTutup();
}

/* ---------- pemasangan ---------- */

if (cetakModalEl) {
  cetakEl("cetakTombol").addEventListener("click", cetakModalCetak);
  cetakEl("cetakTutupOtomatis").addEventListener("change", (e) => {
    try {
      localStorage.setItem(CETAK_KUNCI_TUTUP, e.target.checked ? "1" : "0");
    } catch (err) {
      /* Tidak bisa disimpan: pilihannya tetap berlaku sampai kotak ditutup */
    }
  });
  document.addEventListener("keydown", cetakTekanCetak);
  window.addEventListener("resize", () => {
    if (cetakSesi && cetakSesi.siap) cetakUkurKertas();
  });
  // Ukuran dihitung ulang begitu kotaknya benar-benar tampil (lebarnya baru pasti)
  cetakModalEl.addEventListener("shown.bs.modal", () => {
    if (!cetakSesi || !cetakSesi.siap) return;
    cetakUkurKertas();
    cetakEl("cetakTombol").focus();
  });
  // Sedang menutup (memudar): tidak boleh ada cetakan baru lagi
  cetakModalEl.addEventListener("hide.bs.modal", () => {
    if (cetakSesi) cetakSesi.siap = false;
  });
  cetakModalEl.addEventListener("hidden.bs.modal", () => {
    const sesi = cetakSesi;
    cetakSesi = null;
    if (!sesi) return;
    if (sesi.pulihJudul) sesi.pulihJudul();
    // Isi dibuang: surat yang sudah ditutup tidak boleh tampak sekejap di pembukaan berikutnya
    try {
      const dok = cetakEl("cetakBingkai").contentDocument;
      dok.open();
      dok.close();
    } catch (err) {
      /* Bingkai tak terbaca: tak ada yang perlu dibuang */
    }
    // Kursor kembali ke tombol cetak yang tadi ditekan, bukan ke awal halaman
    const asal = sesi.asal;
    if (asal && asal !== document.body && asal.isConnected && typeof asal.focus === "function") {
      try {
        asal.focus({ preventScroll: true });
      } catch (err) {
        /* Mengembalikan fokus hanya kenyamanan */
      }
    }
  });
}
