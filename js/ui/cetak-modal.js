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

   bukaModalCetak({ jenis, nomor, judulBerkas, muat, kertas, siapkan })
     jenis        label kecil di kepala ("Form Pengajuan Dana")
     nomor        nomor dokumen -- judul besar di kepala
     judulBerkas  nama berkas bawaan dialog cetak ("Save as PDF")
     muat         async () => teks HTML dokumen LENGKAP (<!doctype html>
                  ...). Dipanggil SESUDAH kotak tampil, jadi boleh
                  menunggu sesuatu tanpa tombolnya terasa mati.
     kertas       (opsional) "a4" (bawaan) atau "a4-mendatar" -- lebar
                  bingkai = lebar kertasnya, supaya tata letak di pratinjau
                  sama dengan di kertas (Stock Opname Masterlist: A4 landscape).
     siapkan      (opsional) (dokumen) => ...: dipanggil sesudah surat
                  tertulis di bingkai DAN bingkainya tampil (tata letaknya
                  sudah jadi), sebelum tombol Cetak menyala -- untuk surat
                  yang menata dirinya dengan mengukur (Surat Jalan mengisi
                  kertas, Masterlist memecah halaman). Boleh async.
     varian       (opsional) [{ kunci, label, judul, jenis, judulBerkas, muat,
                  siapkan }] -- BEBERAPA DOKUMEN dalam satu kotak, dipilih
                  lewat pilihan bergeser di kepalanya (PO | PR di cetak PO &
                  PR, Sopir 1 | Sopir 2 di Surat Jalan dua mobil). LEBIH DARI
                  DUA: penomoran ‹ 1 2 3 › seperti tinjauan OCR -- `judul`
                  (nama lengkap) di tooltip tiap nomor. Tiap varian membawa
                  muat-nya sendiri (menggantikan
                  `muat`), dan jenis / judulBerkas / siapkan-nya bila ada.
                  `awal` = kunci varian yang tampil pertama. Teks yang sudah
                  diubah (Ubah teks) di satu varian disimpan selama kotak
                  terbuka: berpindah lalu kembali tidak menghapusnya.
     ubah         (opsional) { diubah(dok, blok), rapikan(dok), petunjuk }
                  untuk mode UBAH TEKS (lihat di bawah): diubah dipanggil
                  tiap kali isi surat diketik -- mis. Form Pengajuan Dana
                  menghitung ulang TOTAL & Terbilang --, rapikan sebelum
                  mencetak & saat mode ubah dimatikan, petunjuk = kalimat
                  tambahan di bilah petunjuk.

   UBAH TEKS SEBELUM CETAK (tombol "Ubah teks" di kaki kotak): isi surat
   di pratinjau bisa diketik langsung -- angka yang selisih Rp1 dengan
   tagihan aslinya, salah ketik, dsb. Hanya untuk cetakan ini: data
   aslinya tidak berubah dan tidak ada yang tersimpan. Yang diketik
   ditandai kuning (data-ubah="manual"), yang ikut dihitung ulang biru
   (data-ubah="hitung") -- keduanya hanya di layar, tidak ikut tercetak.
   "Kembalikan" memulihkan surat persis seperti saat pertama tampil; Esc
   di dalam surat keluar dari mode ubah (bukan menutup kotak).

   Semua cetak di aplikasi lewat kotak ini: Form Pengajuan Dana, Surat
   Jalan (Export & Lokal), CI/PL/SI, Surat BC, Stock Opname Masterlist,
   dan draf koreksi Cek PIB/PEB.
   Mengembalikan janji: true bila pratinjaunya siap, false bila kotak
   sudah ditutup selagi menunggu atau suratnya gagal disiapkan.

   Kotak ini sengaja TIDAK memakai window.open: dibuka sesudah menunggu
   apa pun, jendela baru dianggap pop-up liar dan diblokir -- di sini
   tidak ada yang bisa diblokir.
------------------------------------------------------------------ */

const CETAK_LEBAR_KERTAS = 794; // A4 210 mm pada 96 dpi (piksel CSS)
const CETAK_TINGGI_KERTAS = 1123; // A4 297 mm
// Ukuran bingkai per jenis kertas, piksel CSS: [lebar, tinggi minimum]
const CETAK_KERTAS = {
  a4: [CETAK_LEBAR_KERTAS, CETAK_TINGGI_KERTAS],
  "a4-mendatar": [CETAK_TINGGI_KERTAS, CETAK_LEBAR_KERTAS],
};
const cetakUkuranKertas = (sesi) => CETAK_KERTAS[(sesi && sesi.kertas) || "a4"] || CETAK_KERTAS.a4;
const CETAK_KUNCI_TUTUP = "cetak-tutup-otomatis";
const CETAK_BATAS_GAMBAR = 1500; // ms: gambar surat yang lambat tidak boleh menahan pratinjau
const CETAK_BATAS_TAMPIL = 1000; // ms: kotak yang tak kunjung tampil tidak boleh menahan siapkan()

/* Gaya di DALAM surat selama/sesudah diubah -- hanya layar (@media
   screen), jadi tidak pernah ikut tercetak. Sorotan arahan hanya pada sel
   / blok TERDALAM (:has), bukan seluruh pembungkus halaman. */
const CETAK_GAYA_UBAH = `@media screen {
  body[contenteditable="true"] { outline: none; caret-color: #1d4ed8; cursor: text; }
  [data-ubah="manual"] { background-color: rgba(250, 204, 21, 0.34) !important; }
  [data-ubah="hitung"] { background-color: rgba(59, 130, 246, 0.16) !important; }
}
@media screen {
  body[contenteditable="true"] :is(td, th):not(:has(td, th)):hover,
  body[contenteditable="true"] :is(div, p, li):not(:has(div, p, li, table)):hover { background-color: rgba(250, 204, 21, 0.16); }
}`;

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
  const [lebar, tinggiKertas] = cetakUkuranKertas(cetakSesi);
  let tinggi = tinggiKertas;
  try {
    const dok = bingkai.contentDocument;
    // Diukur dari nol: tinggi bingkai yang lama tidak boleh ikut terbaca
    bingkai.style.height = "0px";
    tinggi = Math.max(dok.documentElement.scrollHeight, (dok.body && dok.body.scrollHeight) || 0, tinggiKertas);
  } catch (err) {
    /* Isi tak terbaca: setinggi satu kertas */
  }
  const skala = meja.clientWidth > 0 ? Math.min(1, meja.clientWidth / lebar) : 1;
  bingkai.style.height = tinggi + "px";
  kertas.style.transform = skala < 1 ? "scale(" + skala + ")" : "";
  ukur.style.width = Math.round(lebar * skala) + "px";
  ukur.style.height = Math.round(tinggi * skala) + "px";
}

/* Lebar bingkai = lebar kertas sesi ini (CSS menulis lebar A4 tegak);
   tinggi awalnya satu kertas, supaya pengukuran siapkan() melihat
   halaman seukuran kertasnya. */
function cetakPasangKertas(sesi) {
  const [lebar, tinggi] = cetakUkuranKertas(sesi);
  const kertas = cetakEl("cetakKertas");
  const bingkai = cetakEl("cetakBingkai");
  if (kertas) kertas.style.width = lebar + "px";
  if (bingkai) {
    bingkai.style.width = lebar + "px";
    bingkai.style.height = tinggi + "px";
  }
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

/* Kotaknya benar-benar tampil (Bootstrap menampilkannya sesudah latar
   memudar masuk -- SESUDAH show() kembali). Sebelum itu bingkai belum
   punya tata letak: semua ukuran nol, dan surat yang menata dirinya
   dengan mengukur (siapkan) salah hitung. Kelas "show" dipasang Bootstrap
   begitu kotak ditampilkan; shown.bs.modal menyusul sesudah transisi. */
function cetakTungguTampil() {
  if (!cetakModalEl || cetakModalEl.classList.contains("show")) return Promise.resolve();
  return new Promise((selesai) => {
    const lepas = () => {
      clearTimeout(pewaktu);
      cetakModalEl.removeEventListener("shown.bs.modal", lepas);
      selesai();
    };
    const pewaktu = setTimeout(lepas, CETAK_BATAS_TAMPIL);
    cetakModalEl.addEventListener("shown.bs.modal", lepas);
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
  cetakTampilUbah(false);
  cetakEl("cetakUbah").disabled = true;
  cetakEl("cetakKembalikan").disabled = true;
  cetakEl("cetakUbahPetunjuk").textContent = o.ubah && o.ubah.petunjuk ? " " + o.ubah.petunjuk : "";
}

function bukaModalCetak(opsi) {
  const o = opsi || {};
  const varian = Array.isArray(o.varian) ? o.varian.filter((v) => v && typeof v.muat === "function") : [];
  const awal = varian.find((v) => v.kunci === o.awal) || varian[0] || null;
  const muat = awal ? awal.muat : o.muat;
  if (!cetakModalEl || typeof bootstrap === "undefined" || typeof muat !== "function") return Promise.resolve(false);
  const sesi = {
    asal: document.activeElement,
    judulBerkas: String(o.judulBerkas || o.nomor || ""),
    siap: false,
    mencetak: false,
    pulihJudul: null,
    kertas: CETAK_KERTAS[o.kertas] ? o.kertas : "a4",
    siapkan: typeof o.siapkan === "function" ? o.siapkan : null,
    ubahOpsi: o.ubah || null,
    ubah: false, // mode Ubah teks menyala
    berubah: false, // isi surat sudah diketik
    htmlAsli: "", // surat seperti saat pertama tampil -- untuk "Kembalikan"
    muatKe: 0, // pemuatan terakhir -- yang lebih lama (varian sebelumnya) dibuang
    varian: varian.length > 1 ? varian : null,
    varianAktif: awal ? awal.kunci : null,
    simpanVarian: {}, // kunci -> { html, asli } teks varian yang sudah diubah
  };
  if (awal) {
    if (awal.judulBerkas) sesi.judulBerkas = String(awal.judulBerkas);
    if (typeof awal.siapkan === "function") sesi.siapkan = awal.siapkan;
  }
  cetakSesi = sesi;
  cetakKeadaanMemuat(Object.assign({}, o, awal && awal.jenis ? { jenis: awal.jenis } : {}));
  cetakGambarVarian(sesi);
  cetakPasangKertas(sesi);
  bootstrap.Modal.getOrCreateInstance(cetakModalEl).show();
  return cetakSiapkanIsi(sesi, muat);
}

/* ---------- beberapa dokumen dalam satu kotak (opsi varian) ---------- */

function cetakGambarVarian(sesi) {
  const wadah = cetakEl("cetakVarian");
  if (!wadah) return;
  const v = sesi && sesi.varian;
  wadah.hidden = !v;
  if (!v) {
    wadah.innerHTML = "";
    wadah.classList.remove("cetak-varian--halaman");
    return;
  }
  const i = Math.max(0, v.findIndex((x) => x.kunci === sesi.varianAktif));
  /* LEBIH DARI DUA DOKUMEN (Surat Jalan tiga mobil = tiga sopir):
     penomoran seperti tinjauan OCR -- ‹ 1 2 3 › -- bukan penggeser yang
     tombolnya makin sempit. Nama lengkap tiap dokumen (Sopir 2 · nopol ·
     nama) di tooltip & nama tombolnya. */
  const halaman = v.length > 2;
  wadah.classList.toggle("cetak-varian--halaman", halaman);
  wadah.setAttribute("role", halaman ? "group" : "tablist");
  if (halaman) {
    wadah.style.removeProperty("--varian-n");
    wadah.style.removeProperty("--varian-ke");
    const geser = (arah, ikon, label, mati) =>
      `<button type="button" class="cetak-varian-geser" data-cetak-varian-geser="${arah}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"${mati ? " disabled" : ""}><i class="bi ${ikon}" aria-hidden="true"></i></button>`;
    wadah.innerHTML =
      geser(-1, "bi-chevron-left", tt("Sebelumnya", "Previous"), i === 0) +
      v
        .map((x, k) => {
          const nama = x.judul || x.label || x.kunci;
          return `<button type="button" class="cetak-varian-no${k === i ? " is-aktif" : ""}" data-cetak-varian="${escapeAttr(x.kunci)}"${k === i ? ' aria-current="page"' : ""}
        title="${escapeAttr(nama)}" aria-label="${escapeAttr(nama)}">${k + 1}</button>`;
        })
        .join("") +
      geser(1, "bi-chevron-right", tt("Berikutnya", "Next"), i === v.length - 1);
    return;
  }
  // Penggeser di belakang tombol yang aktif (docnum.css / components.css: --varian-ke, --varian-n)
  wadah.style.setProperty("--varian-n", String(v.length));
  wadah.style.setProperty("--varian-ke", String(i));
  wadah.innerHTML = v
    .map((x, k) => `<button type="button" role="tab" class="cetak-varian-btn${k === i ? " is-aktif" : ""}" data-cetak-varian="${escapeAttr(x.kunci)}"
        aria-selected="${k === i ? "true" : "false"}" tabindex="${k === i ? "0" : "-1"}"${x.judul ? ` title="${escapeAttr(x.judul)}"` : ""}>${escapeHtml(x.label || x.kunci)}</button>`)
    .join("");
}

async function cetakPilihVarian(kunci, fokus) {
  const sesi = cetakSesi;
  if (!sesi || !sesi.varian || sesi.mencetak || kunci === sesi.varianAktif) return;
  const v = sesi.varian.find((x) => x.kunci === kunci);
  if (!v) return;
  // Teks yang sudah diubah di varian ini disimpan dulu -- kembali ke sini, ubahannya masih ada
  const dok = cetakEl("cetakBingkai").contentDocument;
  if (sesi.siap && sesi.berubah && dok && dok.documentElement) {
    cetakRapikanUbahan(sesi);
    const ubah = dok.getElementById("cetak-gaya-ubah");
    if (ubah) ubah.remove();
    if (dok.body) dok.body.removeAttribute("contenteditable");
    sesi.simpanVarian[sesi.varianAktif] = { html: "<!doctype html>\n" + dok.documentElement.outerHTML, asli: sesi.htmlAsli };
  }
  sesi.varianAktif = kunci;
  sesi.siap = false;
  sesi.ubah = false;
  sesi.berubah = false;
  sesi.judulBerkas = String(v.judulBerkas || sesi.judulBerkas);
  sesi.siapkan = typeof v.siapkan === "function" ? v.siapkan : null;
  cetakKeadaanMemuat({ jenis: v.jenis || cetakEl("cetakJenis").textContent, nomor: cetakEl("cetakNomor").textContent, ubah: sesi.ubahOpsi });
  cetakGambarVarian(sesi);
  if (fokus) {
    const tombol = [...cetakEl("cetakVarian").querySelectorAll("[data-cetak-varian]")].find((b) => b.dataset.cetakVarian === kunci);
    if (tombol) tombol.focus();
  }
  const simpan = sesi.simpanVarian[kunci];
  const ok = await cetakSiapkanIsi(sesi, simpan ? async () => simpan.html : v.muat, !!fokus);
  if (ok && simpan && cetakSesi === sesi && sesi.varianAktif === kunci) {
    sesi.htmlAsli = simpan.asli;
    sesi.berubah = true;
    cetakEl("cetakKembalikan").disabled = false;
  }
}

/* `tetapFokus`: kursor sedang di pilihan dokumen -- jangan dipindah ke Cetak */
async function cetakSiapkanIsi(sesi, muat, tetapFokus) {
  const ke = ++sesi.muatKe;
  // Ditutup selagi menunggu, atau dokumen lain sudah dipilih sementara ini dimuat
  const usang = () => cetakSesi !== sesi || sesi.muatKe !== ke;
  try {
    const html = await muat();
    if (usang()) return false;
    const dok = cetakEl("cetakBingkai").contentDocument;
    dok.open();
    dok.write(html);
    dok.close();
    cetakPasangPendengar(dok);
    await cetakTungguGambar(dok);
    if (usang()) return false;
    cetakEl("cetakStatus").hidden = true;
    cetakEl("cetakUkur").hidden = false;
    /* Surat yang menata dirinya dengan mengukur: bingkainya sudah tampil
       selebar kertas, jadi ukurannya benar. Tombol Cetak baru menyala
       sesudahnya -- yang dicetak selalu hasil akhirnya. */
    if (sesi.siapkan) {
      await cetakTungguTampil();
      if (usang()) return false;
      await sesi.siapkan(dok);
      if (usang()) return false;
    }
    sesi.siap = true;
    // Salinan surat yang sudah jadi (sesudah siapkan): "Kembalikan" memulihkannya persis
    sesi.htmlAsli = "<!doctype html>\n" + dok.documentElement.outerHTML;
    cetakUkurKertas();
    cetakEl("cetakUbah").disabled = false;
    const tombol = cetakEl("cetakTombol");
    tombol.disabled = false;
    /* Enter langsung mencetak: kursor ke tombol Cetak -- kecuali pengguna
       sudah memindahkannya sendiri ke kontrol lain di kotak ini. Kalau
       kotaknya belum selesai tampil, shown.bs.modal yang mengulanginya
       (Bootstrap memindahkan kursor ke kotaknya saat itu). */
    const aktif = document.activeElement;
    if (!tetapFokus && (aktif === cetakModalEl || !cetakModalEl.contains(aktif))) tombol.focus();
    return true;
  } catch (err) {
    console.error(err);
    if (!usang()) {
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
  cetakRapikanUbahan(sesi);
  try {
    // Kursor ketik & sorotan seleksi tidak ikut terbawa ke dialog cetak
    const pilih = jendela.getSelection && jendela.getSelection();
    if (pilih) pilih.removeAllRanges();
  } catch (err) {
    /* Seleksi tak terbaca: tidak tercetak juga */
  }

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
   jadi kotak ditutup dari sini -- kecuali selagi mengubah teks: Esc
   keluar dari mode ubah, ketikannya tetap (bukan hilang bersama kotak). */
function cetakTekanTombolBingkai(e) {
  cetakTekanCetak(e);
  if (!cetakSesi || e.key !== "Escape") return;
  if (cetakSesi.ubah) {
    e.preventDefault();
    cetakAturUbah(false);
    cetakEl("cetakUbah").focus();
  } else cetakTutup();
}

/* ---------- ubah teks sebelum cetak ---------- */

// Pendengar di dokumen bingkai -- dipasang ulang tiap kali isinya ditulis (open() membuang yang lama)
/* BILAH GULIR KERTAS PRATINJAU disembunyikan (hanya di layar, tidak ikut
   tercetak). Bingkainya setinggi isinya, jadi tidak ada yang perlu
   digulir di dalamnya -- tetapi bilah gulir klasik (Windows) sempat
   muncul saat bingkai diukur dari tinggi 0, memakan 17px lebar kertas
   dan memicu bilah gulir mendatar & tegak DI DALAM kertas. Tanpa bilah,
   isinya selebar kertas dan tetap bisa digulir bila memang melebihi. */
const CETAK_GAYA_LAYAR = "@media screen { html, body { scrollbar-width: none; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; width: 0; height: 0; } }";
function cetakSembunyikanBilahGulir(dok) {
  if (!dok || !dok.documentElement || dok.getElementById("cetak-gaya-layar")) return;
  const gaya = dok.createElement("style");
  gaya.id = "cetak-gaya-layar";
  gaya.textContent = CETAK_GAYA_LAYAR;
  (dok.head || dok.documentElement).appendChild(gaya);
}

function cetakPasangPendengar(dok) {
  cetakSembunyikanBilahGulir(dok);
  // Ctrl+P & Esc juga ditangkap bila kursor sempat masuk ke bingkai
  dok.addEventListener("keydown", cetakTekanTombolBingkai);
  dok.addEventListener("input", cetakSaatDiketik);
  dok.addEventListener("paste", cetakTempelTeks);
  dok.addEventListener("drop", cetakTolakSeret);
}

/* Tempelan masuk sebagai TEKS BIASA: angka yang disalin dari Excel atau
   PDF tagihan tidak membawa tabel, warna & hurufnya ke dalam surat. Baris
   baru di ujung salinan sel Excel dibuang. */
function cetakTempelTeks(e) {
  if (!cetakSesi || !cetakSesi.ubah || !e.clipboardData) return;
  e.preventDefault();
  const teks = String(e.clipboardData.getData("text/plain") || "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const dok = e.currentTarget;
  if (teks && dok && typeof dok.execCommand === "function") dok.execCommand("insertText", false, teks);
}
// Menyeret teks/berkas ke dalam surat tidak memindahkan isi sel diam-diam
function cetakTolakSeret(e) {
  if (cetakSesi && cetakSesi.ubah) e.preventDefault();
}

// Tampilan kotak untuk mode ubah: bingkai bisa diklik, tombol tertekan, bilah petunjuk
function cetakTampilUbah(nyala) {
  if (!cetakModalEl) return;
  cetakModalEl.classList.toggle("cetak-mode-ubah", nyala);
  cetakEl("cetakUbah").setAttribute("aria-pressed", nyala ? "true" : "false");
  cetakEl("cetakUbahInfo").hidden = !nyala;
}

function cetakAturUbah(nyala) {
  const sesi = cetakSesi;
  const bingkai = cetakEl("cetakBingkai");
  const dok = bingkai && bingkai.contentDocument;
  if (!sesi || !sesi.siap || !dok || !dok.body) return;
  sesi.ubah = !!nyala;
  if (sesi.ubah) {
    if (!dok.getElementById("cetak-gaya-ubah")) {
      const gaya = dok.createElement("style");
      gaya.id = "cetak-gaya-ubah";
      gaya.textContent = CETAK_GAYA_UBAH;
      (dok.head || dok.documentElement).appendChild(gaya);
    }
    dok.body.setAttribute("contenteditable", "true");
    dok.body.setAttribute("spellcheck", "false");
  } else {
    dok.body.removeAttribute("contenteditable");
    cetakRapikanUbahan(sesi);
  }
  cetakTampilUbah(sesi.ubah);
  if (sesi.ubah) {
    try {
      bingkai.contentWindow.focus();
    } catch (err) {
      /* Fokus hanya kenyamanan: klik di surat tetap bisa */
    }
  }
}

/* Isi surat diketik: blok terdalam yang diketik ditandai "manual"
   (kuning di layar), lalu surat diberi kesempatan menyesuaikan angka
   turunannya (opsi ubah.diubah). */
function cetakSaatDiketik() {
  const sesi = cetakSesi;
  const dok = cetakEl("cetakBingkai").contentDocument;
  if (!sesi || !sesi.ubah || !dok) return;
  const pilih = dok.getSelection && dok.getSelection();
  const simpul = pilih && pilih.anchorNode;
  const el = simpul && (simpul.nodeType === 1 ? simpul : simpul.parentElement);
  const blok = el && el.closest && el.closest("td, th, li, p, div");
  if (blok && blok !== dok.body) blok.dataset.ubah = "manual";
  if (sesi.ubahOpsi && typeof sesi.ubahOpsi.diubah === "function") {
    try {
      sesi.ubahOpsi.diubah(dok, blok || null);
    } catch (err) {
      console.error(err);
    }
  }
  sesi.berubah = true;
  cetakEl("cetakKembalikan").disabled = false;
  cetakUkurKertas();
}

function cetakRapikanUbahan(sesi) {
  if (!sesi || !sesi.berubah || !sesi.ubahOpsi || typeof sesi.ubahOpsi.rapikan !== "function") return;
  try {
    sesi.ubahOpsi.rapikan(cetakEl("cetakBingkai").contentDocument);
  } catch (err) {
    console.error(err);
  }
}

// "Kembalikan": surat ditulis ulang persis seperti saat pertama tampil; mode ubah tetap seperti sebelumnya
async function cetakKembalikanAsli() {
  const sesi = cetakSesi;
  if (!sesi || !sesi.siap || !sesi.htmlAsli || sesi.mencetak) return;
  const dok = cetakEl("cetakBingkai").contentDocument;
  dok.open();
  dok.write(sesi.htmlAsli);
  dok.close();
  cetakPasangPendengar(dok);
  sesi.berubah = false;
  cetakEl("cetakKembalikan").disabled = true;
  // Gaya penanda & contenteditable ikut terbuang bersama isi lama: dipasang lagi bila mode ubah menyala
  if (sesi.ubah) cetakAturUbah(true);
  await cetakTungguGambar(dok);
  if (cetakSesi === sesi) cetakUkurKertas();
}

/* ---------- pemasangan ---------- */

if (cetakModalEl) {
  cetakEl("cetakTombol").addEventListener("click", cetakModalCetak);
  const varianEl = cetakEl("cetakVarian");
  if (varianEl) {
    varianEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cetak-varian]");
      if (b) {
        cetakPilihVarian(b.dataset.cetakVarian);
        return;
      }
      // Penomoran (> 2 dokumen): ‹ sebelumnya / berikutnya ›
      const g = e.target.closest("[data-cetak-varian-geser]");
      if (!g || !cetakSesi || !cetakSesi.varian) return;
      const v = cetakSesi.varian;
      const i = v.findIndex((x) => x.kunci === cetakSesi.varianAktif);
      const j = i + Number(g.dataset.cetakVarianGeser);
      if (j >= 0 && j < v.length) cetakPilihVarian(v[j].kunci, true);
    });
    // Panah kiri / kanan berpindah dokumen, seperti tablist biasa
    varianEl.addEventListener("keydown", (e) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !cetakSesi || !cetakSesi.varian) return;
      e.preventDefault();
      const v = cetakSesi.varian;
      const i = v.findIndex((x) => x.kunci === cetakSesi.varianAktif);
      const j = (i + (e.key === "ArrowRight" ? 1 : -1) + v.length) % v.length;
      cetakPilihVarian(v[j].kunci, true);
    });
  }
  cetakEl("cetakUbah").addEventListener("click", () => cetakAturUbah(!(cetakSesi && cetakSesi.ubah)));
  cetakEl("cetakKembalikan").addEventListener("click", cetakKembalikanAsli);
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
    cetakTampilUbah(false);
    cetakGambarVarian(null);
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
