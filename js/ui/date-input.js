"use strict";

/* ------------------------------------------------------------------
   KOTAK TANGGAL YANG BISA DIKETIK -- FORMAT APA PUN, DIRAPIKAN OTOMATIS

   <input type="date"> bawaan peramban membagi isiannya jadi tiga ruas
   (hari / bulan / tahun) yang urutannya mengikuti setelan komputer dan
   harus diisi satu per satu. Menyalin "5 Nov 2026" dari PDF, atau
   mengetik "5/11/26" dengan cepat, tidak bisa.

   Karena itu SEMUA kotak <input type="date"> di aplikasi ini -- yang
   tertulis di index.html, yang dibuat render()/showPrompt()/baris-baris
   dinamis, dan yang baru muncul belakangan -- diubah menjadi kotak teks
   begitu masuk ke halaman (MutationObserver di bawah). Kode pemanggil
   tidak perlu diubah dan tetap menulis `type="date"`.

   YANG TETAP SAMA BAGI KODE LAIN

   - `el.value` tetap "yyyy-mm-dd" (atau ""), dibaca maupun ditulis.
     Penyetel menerima HANYA bentuk itu, seperti kotak bawaan: yang lain
     dikosongkan. Yang tampil di layar "dd-mm-yyyy" (fmtDate), tapi itu
     urusan kotaknya sendiri.
   - Peristiwa `input` dan `change` hanya terjadi SAAT TANGGALNYA BERUBAH,
     sama seperti kotak bawaan yang tidak menembak `input` di tengah-tengah
     ruas yang belum lengkap. Ketikan setengah jalan ("5/1") tidak pernah
     sampai ke pendengar mana pun; mereka baru dengar setelah tanggalnya
     utuh. `change` buatan kode (`dispatchEvent`) lewat apa adanya.
   - id, kelas, atribut data-*, label[for], required, readonly, disabled,
     min, max, focus() -- elemennya sama, hanya `type`-nya yang berganti.

   KAPAN DIRAPIKAN

   Saat `change` (keluar dari kotak / Enter), tidak saat mengetik:
   merapikan tiap ketikan mengubah "5" jadi tanggal sebelum "5/11" sempat
   ditulis. Enter dirapikan sebelum pendengar Enter milik pemanggil
   (kotak isian showPrompt, Simpan) membaca nilainya, dan pembacaan
   `el.value` di tengah ketikan sudah menghasilkan tanggal yang akan
   jadi (Ctrl+S saat kursor masih di kotak).

   Yang tidak terbaca ("abc", "31/04/2026") dikembalikan ke tanggal
   sebelumnya dengan pemberitahuan -- BUKAN dikosongkan seperti kotak jam,
   karena satu salah ketik tidak boleh menghapus tanggal yang sudah benar.
   Mengosongkan kotak (hapus semua teks) tetap sah.

   PEMILIH KALENDER

   Ikon kalender di ujung kanan (gambar latar kotaknya, jadi tata letak
   tidak berubah) membuka pemilih bawaan peramban lewat satu <input
   type="date"> pembantu yang disisipkan di samping kotak SAAT dibutuhkan
   (di dalam kotak dialog yang sama, supaya penahan fokus Bootstrap tidak
   merebut fokusnya). Alt+Panah-bawah atau F4 membukanya dari papan ketik.
   Kotak baca-saja & nonaktif tidak punya ikon.

   Kalender bawaan menempel pada kotak pembantu itu, jadi dua hal harus
   benar (keduanya pernah salah: kalender muncul jauh dari kotak yang
   diklik, menutupi isian di sebelahnya):
   - LETAKNYA dalam koordinat layar, walau kotak berada di dalam leluhur
     yang menjadi patokan `position: fixed` (kartu jadwal ber-
     `content-visibility: auto`): patokannya diukur, bukan diasumsikan
     (ktAsalPatokan).
   - WAKTUNYA: showPicker() baru dipanggil dua bingkai sesudah kotak
     pembantu dipasang di posisi akhirnya (ktBukaKalenderSetelahTergambar);
     kotak yang baru dipasang belum punya letak yang bisa dijadikan
     tempat menempel.

   KOTAK YANG DIKECUALIKAN

   `data-kotak-tanggal-off` -- dipakai #filterDateFrom/To (disembunyikan,
   sumber kebenaran pemilih rentang) dan pemilih pembantu itu sendiri.

   `data-kotak-tanggal-tanpa-ikon` -- tetap kotak ketik yang dirapikan,
   tetapi tanpa ikon kalender dan tanpa Alt+Panah-bawah/F4. Dipakai
   kotak Dari/Sampai di dalam panel kalender pemilih rentang
   (js/features/date-range-picker.js): kalendernya sudah terbuka tepat
   di bawahnya, ikon kedua hanya akan membingungkan.

   Aturan membacanya: js/core/date-parse.js.
------------------------------------------------------------------ */

const KT_NATIF = typeof HTMLInputElement !== "undefined" ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") : null;
// kotak -> { iso, tampil, judulAsli, menungguChange }
const KT_KEADAAN = new WeakMap();
// Lebar (px) di ujung kanan kotak yang dianggap "ikon kalender"
const KT_LEBAR_IKON = 34;

const ktKotak = (el) => !!el && el.nodeType === 1 && KT_KEADAAN.has(el);
// Punya ikon kalender (dan boleh membuka pemilih)? Baca-saja, nonaktif, atau tanpa-ikon: tidak.
const ktPunyaIkon = (el) => !el.readOnly && !el.disabled && !el.hasAttribute("data-kotak-tanggal-tanpa-ikon");
const ktMentah = (el) => KT_NATIF.get.call(el);
const ktTulisMentah = (el, teks) => KT_NATIF.set.call(el, teks);
// Ada ketikan yang belum dirapikan? (teks di kotak != teks yang terakhir kita tulis)
const ktKotor = (el) => ktMentah(el) !== KT_KEADAAN.get(el).tampil;

/* Tooltip: hari + tanggal panjang ("Rabu, 04 November 2026") kalau terisi,
   atau petunjuk mengetik kalau kosong. Dilewati bila penulis markup sudah
   memberi title sendiri ("Hanya baca. Tekan tombol pensil ..."). */
function ktSegarkanJudul(el) {
  const k = KT_KEADAAN.get(el);
  if (!k || k.judulAsli) return;
  if (k.iso) {
    const dt = parseLocalDate(k.iso);
    el.title = dt
      ? tanggalLokal(dt, activeLang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
      : "";
  } else {
    el.title = el.readOnly || el.disabled ? "" : tt("Ketik tanggal dalam format apa saja, mis. 5/11/26 atau 5 nov 2026", "Type a date in any format, e.g. 5/11/26 or 5 Nov 2026");
  }
}

/* Isi kotak dari tanggal ISO TANPA menembakkan peristiwa apa pun (sama
   seperti `el.value = ...` pada kotak bawaan). Bukan ISO baku -> kosong. */
function ktIsi(el, iso) {
  const k = KT_KEADAAN.get(el);
  k.iso = tanggalIsoSah(iso) ? iso : "";
  k.tampil = k.iso ? fmtDate(k.iso) : "";
  if (ktMentah(el) !== k.tampil) ktTulisMentah(el, k.tampil);
  ktSegarkanJudul(el);
}

function ktKabarkan(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/* Tanda "tidak terbaca": garis merah sebentar + pemberitahuan. Teks yang
   salah ketik disebut apa adanya supaya jelas yang mana yang ditolak. */
function ktBersihkanSalah(el) {
  const k = KT_KEADAAN.get(el);
  clearTimeout(k.pewaktuSalah);
  el.classList.remove("kt-salah");
  el.removeAttribute("aria-invalid");
}
function ktTandaiSalah(el, ketikan, tampilSebelumnya) {
  const k = KT_KEADAAN.get(el);
  el.classList.add("kt-salah");
  el.setAttribute("aria-invalid", "true");
  clearTimeout(k.pewaktuSalah);
  k.pewaktuSalah = setTimeout(() => ktBersihkanSalah(el), 2600);
  if (typeof showToast !== "function") return;
  const yang = String(ketikan).trim().slice(0, 40);
  showToast(
    tt(
      `Tanggal "${yang}" tidak dikenali${tampilSebelumnya ? ` — tetap ${tampilSebelumnya}` : ""}. Contoh yang bisa dibaca: 5/11/26 · 5 nov 2026 · 20261105 · besok.`,
      `Couldn't read "${yang}" as a date${tampilSebelumnya ? ` — kept ${tampilSebelumnya}` : ""}. Examples: 5/11/26 · 5 Nov 2026 · 20261105 · tomorrow.`,
    ),
    "warning",
  );
}

/* Rapikan ketikan yang belum selesai. Mengembalikan true bila tanggalnya
   BERUBAH (dan sudah dikabarkan lewat input + change).

   `jalur` "change": kita sedang di dalam change bawaan peramban, yang
   sudah ditelan -- tidak ada lagi yang ditunggu. Jalur lain (keluar
   kotak, Enter, membuka kalender): peramban kadang masih menyusulkan
   change-nya sendiri sesudahnya; yang satu itu ditelan juga, supaya
   pendengar tidak dipanggil dua kali. */
function ktKomit(el, jalur) {
  const k = KT_KEADAAN.get(el);
  const mentah = ktMentah(el);
  if (mentah === k.tampil) return false;
  const teks = mentah.trim();
  const iso = teks ? bacaTanggalKetik(teks) : "";
  if (teks && !iso) {
    ktTulisMentah(el, k.tampil);
    ktTandaiSalah(el, mentah, k.tampil);
    return false;
  }
  const lama = k.iso;
  ktIsi(el, iso);
  if (iso === lama) return false;
  if (jalur !== "change") {
    k.menungguChange = true;
    setTimeout(() => (k.menungguChange = false), 0);
  }
  ktKabarkan(el);
  return true;
}

function pasangKotakTanggal(el) {
  if (!el || el.nodeType !== 1 || KT_KEADAAN.has(el) || el.hasAttribute("data-kotak-tanggal-off")) return;
  if (el.tagName !== "INPUT") return;
  /* Salinan (cloneNode) kotak yang sudah dirapikan datang sebagai teks
     ber-data-kotak-tanggal tanpa keadaan: nilai awalnya dari atribut
     value, yang selalu ISO. */
  const salinan = el.type !== "date";
  if (salinan && !el.hasAttribute("data-kotak-tanggal")) return;
  const awal = salinan ? bacaTanggalKetik(ktMentah(el)) : ktMentah(el);

  const k = { iso: "", tampil: "", judulAsli: el.getAttribute("title") || "", menungguChange: false, pewaktuSalah: 0 };
  KT_KEADAAN.set(el, k);
  el.type = "text";
  el.setAttribute("data-kotak-tanggal", "");
  if (!el.hasAttribute("placeholder")) el.placeholder = "dd-mm-yyyy";
  if (!el.hasAttribute("size")) el.size = 10;
  el.setAttribute("autocomplete", "off");
  el.setAttribute("spellcheck", "false");

  Object.defineProperty(el, "value", {
    configurable: true,
    enumerable: true,
    get() {
      const mentah = ktMentah(el);
      if (mentah === k.tampil) return k.iso;
      // Ada ketikan yang belum dirapikan: yang akan jadi bila dirapikan sekarang
      if (!mentah.trim()) return "";
      return bacaTanggalKetik(mentah) || k.iso;
    },
    set(v) {
      ktIsi(el, v == null ? "" : String(v));
    },
  });
  ktIsi(el, awal);
}

function pasangSemuaKotakTanggal(akar) {
  (akar || document)
    .querySelectorAll('input[type="date"]:not([data-kotak-tanggal-off]), input[data-kotak-tanggal]:not([data-kotak-tanggal-off])')
    .forEach(pasangKotakTanggal);
}

/* ---------------------------------------------------------------
   PEMILIH KALENDER BAWAAN PERAMBAN, LEWAT KOTAK PEMBANTU
--------------------------------------------------------------- */
let ktPemilihEl = null;

function ktLepasPemilih() {
  if (ktPemilihEl && ktPemilihEl.isConnected) ktPemilihEl.remove();
}

function ktPemilih() {
  if (ktPemilihEl) return ktPemilihEl;
  const p = document.createElement("input");
  p.type = "date";
  p.tabIndex = -1;
  p.className = "kt-pemilih";
  p.setAttribute("aria-hidden", "true");
  p.setAttribute("data-kotak-tanggal-off", "");
  p._bukaKe = 0;
  p.addEventListener("change", () => {
    // Daftarnya digambar ulang selagi kalender terbuka (pembaruan realtime): isi kembarannya
    const el = ktKembaran(p._sasaran);
    if (!el || !p.value) return;
    const lama = KT_KEADAAN.get(el).iso;
    ktIsi(el, p.value);
    if (KT_KEADAAN.get(el).iso !== lama) ktKabarkan(el);
    ktLepasPemilih();
    // Mengabarkan tanggalnya bisa menggambar ulang daftar: fokus ke kembarannya
    const tuju = ktKembaran(el);
    try { if (tuju) tuju.focus(); } catch (e) { /* abaikan */ }
  });
  ktPemilihEl = p;
  return p;
}

/* Letakkan kotak pembantu TEPAT di atas kotak yang diklik, dalam koordinat
   layar.

   Kalender bawaan peramban muncul menempel pada kotak pembantu, jadi kalau
   kotak itu salah letak, kalendernya ikut salah letak. `position: fixed`
   memang berpatokan pada layar -- KECUALI di dalam leluhur yang ber-transform,
   filter, will-change, atau contain: leluhur itu yang menjadi patokannya.
   Kartu jadwal begitu (`content-visibility: auto` mengandung `contain`):
   kalender sebuah kotak di dalam kartu muncul bergeser sejauh pojok kartu,
   jauh dari kotak yang diklik dan menutupi isian di sebelahnya.

   Karena itu patokannya DIUKUR, bukan diasumsikan. Diukur dengan penanda
   sekali pakai di tempat yang sama, BUKAN dengan menggeser kotak pembantu
   itu sendiri: peramban menempelkan kalender pada letak kotak pembantu
   menurut tata letak terakhirnya, jadi kotak itu tidak boleh sempat
   ditata di tempat yang salah sebelum showPicker() dipanggil. */
function ktAsalPatokan(el) {
  const penanda = document.createElement("span");
  penanda.setAttribute("aria-hidden", "true");
  penanda.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none";
  el.insertAdjacentElement("afterend", penanda);
  const a = penanda.getBoundingClientRect();
  penanda.remove();
  return a;
}

/* Kotak yang SAMA sesudah daftarnya digambar ulang.

   Merapikan ketikan menembakkan `change`, dan pendengar daftar jadwal
   langsung menggambar ulang seluruh kartu (render() -> innerHTML): kotak
   yang baru saja diklik sudah dibuang dari halaman dan diganti kembarannya
   -- id-nya sama, dicari dengan kunciFokus() (js/ui/fokus.js) seperti
   fokus yang dipulihkan render(). Tanpa ini kalender tidak terbuka pada
   klik pertama sesudah mengetik tanggal: terasa "lama munculnya", baru
   muncul pada klik kedua. */
function ktKembaran(el) {
  if (!el || el.isConnected) return el;
  const kunci = typeof kunciFokus === "function" ? kunciFokus(el) : null;
  const baru = kunci ? document.querySelector(kunci) : null;
  // Baru saja digambar (masih di pendengar yang sama): MutationObserver belum sempat merapikannya
  if (baru && baru.tagName === "INPUT") pasangKotakTanggal(baru);
  return ktKotak(baru) ? baru : null;
}

function bukaPemilihTanggal(el) {
  if (!ktKotak(el) || !ktPunyaIkon(el)) return;
  ktKomit(el, "buka");
  el = ktKembaran(el);
  if (!el || !ktPunyaIkon(el)) return;
  const p = ktPemilih();
  // Selalu mulai dari kotak pembantu yang baru dipasang (tata letaknya dibangun dari nol)
  ktLepasPemilih();
  const asal = ktAsalPatokan(el);
  const r = el.getBoundingClientRect();
  p.style.left = `${r.left - asal.left}px`;
  p.style.top = `${r.top - asal.top}px`;
  p.style.width = `${r.width}px`;
  p.style.height = `${r.height}px`;
  /* Di samping kotaknya, bukan di <body>: kotak dialog Bootstrap
     mengembalikan fokus ke dalam dirinya begitu ada fokus di luar. */
  el.insertAdjacentElement("afterend", p);
  if (el.min) p.min = el.min; else p.removeAttribute("min");
  if (el.max) p.max = el.max; else p.removeAttribute("max");
  p.value = el.value;
  p._sasaran = el;
  ktBukaKalenderSetelahTergambar(p);
}

/* showPicker() DITUNDA sampai kotak pembantunya sempat tergambar.

   Kalender bawaan menempel pada letak kotak pembantu yang TERAKHIR
   digambar peramban. Kotak yang baru dipasang dan langsung disuruh
   membuka kalender belum punya letak itu, dan kalendernya muncul di
   tempat yang tidak ada hubungannya dengan kotak yang diklik (pojok kiri
   layar, di atas kotaknya). Dua bingkai cukup: yang pertama menata &
   menggambar kotak pembantu, yang kedua membuka kalendernya. Izin dari
   klik/ketukan tetap berlaku beberapa detik, jauh lebih lama dari itu. */
function ktBukaKalenderSetelahTergambar(p) {
  const buka = () => {
    // Sudah dilepas sebelum bingkainya tiba (klik di tempat lain): jangan membuka kalender yatim
    if (!p.isConnected) return;
    try {
      if (typeof p.showPicker === "function") p.showPicker();
      else { p.focus(); p.click(); }
    } catch (err) {
      /* showPicker menolak tanpa aksi pengguna / di peramban lama: kotak
         tetap bisa diketik, jadi tidak ada yang hilang. */
      try { p.focus(); p.click(); } catch (err2) { /* biarkan */ }
    }
  };
  const nomor = ++p._bukaKe;
  const lanjut = () => { if (p._bukaKe === nomor) buka(); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(lanjut));
  else lanjut();
}

/* ---------------------------------------------------------------
   PENDENGAR -- SATU SET DI `document`, FASE TANGKAP

   Fase tangkap supaya jalan SEBELUM pendengar milik kotaknya sendiri
   (yang dipasang pemanggil kapan saja, termasuk sebelum kotak ini
   dirapikan) dan sebelum pendengar yang menunggu di `document`.
--------------------------------------------------------------- */
if (typeof document !== "undefined") {
  /* Ketikan setengah jalan tidak dikabarkan. Mengetik lagi juga
     menghapus tanda "tidak terbaca" yang masih menyala. */
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!ktKotak(el)) return;
    if (el.classList.contains("kt-salah")) ktBersihkanSalah(el);
    if (ktKotor(el)) e.stopPropagation();
  }, true);

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!ktKotak(el)) return;
    if (ktKotor(el)) {
      e.stopPropagation();
      ktKomit(el, "change");
      return;
    }
    const k = KT_KEADAAN.get(el);
    // change bawaan peramban yang menyusul rapi-rapi kita: sudah dikabarkan
    if (k.menungguChange && e.isTrusted) {
      e.stopPropagation();
      k.menungguChange = false;
    }
  }, true);

  document.addEventListener("focusout", (e) => {
    if (ktKotak(e.target) && ktKotor(e.target)) ktKomit(e.target, "keluar");
  }, true);

  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!ktKotak(el)) return;
    /* Enter (juga Ctrl+Enter) dan Ctrl/Cmd+S -- pintasan Simpan di form jadwal --
       dirapikan lebih dulu, supaya isian turunan yang mengikuti `change`
       (ETA otomatis dari ETD) sudah terisi saat Simpan membacanya. */
    const pintasanSimpan = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "s" || e.key === "S");
    if ((e.key === "Enter" || pintasanSimpan) && ktKotor(el)) ktKomit(el, "enter");
    else if ((e.key === "F4" || (e.altKey && e.key === "ArrowDown")) && ktPunyaIkon(el)) {
      e.preventDefault();
      bukaPemilihTanggal(el);
    }
  }, true);

  /* Papan ketik: berhenti di kotaknya = seluruh isi terpilih, jadi
     tanggal baru tinggal diketik menimpa. Klik tetap menaruh kursor
     di titik yang diklik. */
  let ktPointerBaru = false;
  // Jenis penunjuk gerakan terakhir ("mouse" / "touch" / "pen"); tetikus bila belum ada kabar
  let ktJenisPointer = "mouse";
  document.addEventListener("pointerdown", (e) => {
    ktPointerBaru = true;
    ktJenisPointer = e.pointerType || "mouse";
    setTimeout(() => (ktPointerBaru = false), 0);
    if (ktPemilihEl && e.target !== ktPemilihEl) ktLepasPemilih();
  }, true);
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (ktKotak(el) && !ktPointerBaru && !el.readOnly && typeof el.select === "function") el.select();
  }, true);

  // Ikon kalender di ujung kanan: klik membuka kalender, penunjuk berubah jadi tangan
  /* Kotak tanpa ukuran (belum ditata: display:none, atau jsdom yang tidak punya
     tata letak) tidak punya "ujung kanan" -- klik sintetis ber-clientX 0 di
     sana tidak boleh dibaca sebagai klik pada ikon. */
  const ktDiIkon = (e, el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && e.clientX <= r.right && e.clientX >= r.right - KT_LEBAR_IKON;
  };
  document.addEventListener("click", (e) => {
    const el = e.target;
    if (ktKotak(el) && ktPunyaIkon(el) && ktDiIkon(e, el)) bukaPemilihTanggal(el);
  }, true);
  /* Ikon yang kotaknya DIGAMBAR ULANG di tengah klik. Kotak lain yang masih
     berisi ketikan dirapikan begitu fokus berpindah (focusout, saat tombol
     tetikus ditekan); pendengar daftar jadwal lalu menggambar ulang kartunya,
     dan klik yang dimulai pada kotak lama tidak pernah sampai ke kembarannya
     -- kalender baru terbuka pada klik kedua. Kalau penunjuk dilepas tepat
     di atas ikon kembarannya (kartunya tidak berpindah tempat), kalendernya
     dibuka dari sini. Klik biasa tetap lewat pendengar click di atas. */
  let ktIkonDitekan = null;
  document.addEventListener("pointerdown", (e) => {
    const el = e.target;
    ktIkonDitekan = ktKotak(el) && ktPunyaIkon(el) && ktDiIkon(e, el) ? el : null;
  }, true);
  document.addEventListener("pointerup", (e) => {
    const lama = ktIkonDitekan;
    ktIkonDitekan = null;
    if (!lama || lama.isConnected) return;
    const baru = ktKembaran(lama);
    if (!baru || !ktPunyaIkon(baru) || !ktDiIkon(e, baru)) return;
    const r = baru.getBoundingClientRect();
    if (e.clientY >= r.top && e.clientY <= r.bottom) bukaPemilihTanggal(baru);
  }, true);
  /* Layar sentuh: mengetuk ikon kalender tidak boleh sekaligus memfokus
     kotaknya -- papan ketik yang muncul menutupi separuh layar tepat di
     bawah kalender yang dibuka. Tetikus tidak diubah (mengklik ikon tetap
     menaruh fokus di kotak, seperti kotak tanggal bawaan). Kotak mendapat
     fokus kembali begitu tanggal dipilih. */
  document.addEventListener("mousedown", (e) => {
    const el = e.target;
    if (ktJenisPointer !== "mouse" && ktKotak(el) && ktPunyaIkon(el) && ktDiIkon(e, el)) e.preventDefault();
  }, true);
  document.addEventListener("pointermove", (e) => {
    const el = e.target;
    if (!ktKotak(el)) return;
    const di = ktPunyaIkon(el) && ktDiIkon(e, el);
    if (di !== el.classList.contains("kt-di-ikon")) el.classList.toggle("kt-di-ikon", di);
  }, true);

  pasangSemuaKotakTanggal();
  document.addEventListener("DOMContentLoaded", () => pasangSemuaKotakTanggal());
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver((daftar) => {
      for (const m of daftar) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === "INPUT") pasangKotakTanggal(n);
          else if (n.firstElementChild) pasangSemuaKotakTanggal(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
}
