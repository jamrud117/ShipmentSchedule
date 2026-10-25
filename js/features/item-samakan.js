"use strict";

/* SAMAKAN ISIAN BARIS 1 KE BARIS-BARIS DI BAWAHNYA -- dan URUNGKAN.

   Isian detail barang sering sama untuk semua baris -- HS Code, kondisi,
   negara asal, jenis barang, qty, satuan, jenis kemasan -- sedangkan
   Enter di sebuah kotak hanya pindah ke kotak yang sama di baris
   berikutnya. Menyalin satu per satu untuk 20 barang melelahkan dan
   gampang terlewat.

   Maka begitu isian BARIS PERTAMA di salah satu dari tujuh kolom itu
   selesai diisi (kotak ditinggalkan, Enter, atau pilihan dipilih),
   KOTAK DIALOG di tengah layar (#samakanLapis) bertanya:

       Samakan Satuan ke baris 2–12?
       [ ISIAN BARIS 1:  PCS ]
       3 baris yang sudah terisi akan ditimpa — bisa diurungkan.
                                [Tidak  Esc]  [Ya, samakan  Enter]

   Tombol "Ya, samakan" langsung berfokus: Enter menyamakan; Esc, "Tidak"
   atau klik di luar kotak menolak. Mengetik huruf selagi kotak terbuka
   berarti memilih mengisi sendiri -- kotak menutup dan hurufnya masuk ke
   kotak isian tadi. Sesudah menjawab, kursor kembali ke kotak yang
   sedang dipakai (baris 2 kalau tadi Enter), seleksinya pun dipulihkan.

   "Ya" menyalin nilai itu ke baris 2 sampai baris terakhir -- hanya
   kolom itu -- dan sel yang berubah berkedip sebentar. Lalu BILAH
   URUNGKAN muncul di kiri bawah, tepat di atas bilah Simpan form
   (#samakanUrung):

       (↶) Satuan disamakan ke baris 2–12.   [Urungkan Ctrl+Z]   ×

   Cincin di ikonnya menghitung mundur 15 detik -- berhenti selama
   bilahnya ditunjuk / difokus atau selama kotak dialog terbuka.
   "Urungkan" (atau Ctrl/⌘+Z) mengembalikan isian LAMA tiap baris persis
   seperti sebelumnya (kosong tetap kosong, nilai bawaan tetap bawaan);
   hasilnya dikabarkan di bilah yang sama.

   Aturan yang dijaga:
     - HANYA baris pertama, hanya ketujuh kolom di SAMAKAN_KOLOM. Isian
       di baris 2 dan seterusnya tidak pernah memunculkan tawaran: di
       sana orang sedang mengisi nilai yang memang berbeda.
     - Tidak muncul kalau tidak ada yang perlu disamakan: barisnya cuma
       satu, isian baris 1 kosong (qty 0 dianggap kosong), kode negara
       tidak dikenal, atau semua baris di bawahnya sudah sama. Baris yang
       baru lahir dari Enter di baris terakhir tidak dihitung: Enter itu
       menambah baris SESUDAH isiannya selesai.
     - Menimpa isian orang DIBERITAHUKAN ("3 baris yang sudah terisi
       akan ditimpa"). Nilai bawaan baris baru (SET, BOX, BAHAN BAKU,
       kondisi 1) bukan isian orang, jadi tidak dihitung.
     - Hasil impor / salinan tidak memicunya: tawaran hanya lahir dari
       isian tangan (kejadian `change`) dan pilihan HS Code lewat
       pencarian. Kedua jalan itu memanggil tawarkanSamakan().
     - Bunyinya selalu cocok dengan tabel: tabel yang digambar ulang
       selagi kotak terbuka memperbarui jumlah barisnya, dan kotak
       menutup begitu sudah tidak ada yang perlu disamakan. "Ya"
       menghitung ulang dari data hidup -- kalau baris 1 sudah berganti
       isi, tidak ada yang disalin.
     - Urungkan hanya untuk "Ya" yang TERAKHIR (yang lebih baru
       menggantikan catatannya) dan tidak pernah menimpa pekerjaan yang
       lebih baru: sel yang diubah lagi sesudah disamakan, atau barisnya
       sudah dihapus, dilewati -- jumlahnya disebut di kabarnya. Sasaran
       dicatat sebagai OBJEK barangnya, bukan nomor baris, jadi baris yang
       dihapus / bergeser tidak membuat salah sasaran.

   Kotak dialog ini sengaja bukan modal Bootstrap: dibuka & ditutup
   seketika (tanpa jeda animasi yang menunda Enter berikutnya) dan tidak
   mengunci gulir halaman -- yang memaksa seluruh form ditata ulang dua
   kali. Rupanya tetap sama dengan kotak konfirmasi (.dialog-*). */

const SAMAKAN_URUNG_MS = 15000; // Urungkan tersedia selama ini
const SAMAKAN_KABAR_MS = 4000; // kabar hasil Urungkan, paling sebentar

function samakanTeksBaku(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

function samakanAngka(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/* Tujuh kolom yang ditawarkan. Tiap kolom tahu:
     label()  : nama kolom di pesan (ikut bahasa aktif)
     kunci(it): bentuk BAKU yang dibandingkan; "" = kosong. Dua isian
                dianggap sama kalau kuncinya sama ("pcs" = "PCS").
     salin(it): nilai yang ditulis ke baris lain -- sama dengan yang
                terlihat di kotaknya.
     tampil() : tulisan nilai di pesan.
     sah(it)  : (opsional) nilai pantas disalin; kode negara yang tidak
                dikenal (ditandai merah di tabel) tidak. */
const SAMAKAN_KOLOM = {
  hsCode: {
    label: () => "HS Code",
    kunci: (it) => String(it.hsCode == null ? "" : it.hsCode).replace(/\D/g, ""),
    salin: (it) => it.hsCode,
    tampil: (it) => String(it.hsCode).trim(),
  },
  kondisiBarang: {
    label: () => tt("Kode Kondisi Barang", "Goods Condition Code"),
    kunci: (it) => kodeKondisiBarang(it.kondisiBarang),
    salin: (it) => kodeKondisiBarang(it.kondisiBarang),
    tampil: (it) => labelKondisiBarang(it.kondisiBarang),
  },
  negaraAsal: {
    label: () => tt("Kode Negara Asal", "Country of Origin Code"),
    kunci: (it) => samakanTeksBaku(it.negaraAsal),
    salin: (it) => samakanTeksBaku(it.negaraAsal),
    tampil: (it) => {
      const kode = samakanTeksBaku(it.negaraAsal);
      const nama = namaNegara(kode);
      return nama ? `${kode} — ${nama}` : kode;
    },
    sah: (it) => !!namaNegara(it.negaraAsal),
  },
  jenisBarang: {
    label: () => tt("Jenis Barang", "Goods Category"),
    kunci: (it) => normalisasiJenisBarang(it.jenisBarang),
    salin: (it) => normalisasiJenisBarang(it.jenisBarang),
    tampil: (it) => labelJenisBarang(normalisasiJenisBarang(it.jenisBarang)),
  },
  qty: {
    label: () => "Qty",
    kunci: (it) => {
      const n = samakanAngka(it.qty);
      return n > 0 ? String(n) : "";
    },
    salin: (it) => samakanAngka(it.qty),
    tampil: (it) => formatNumberValue(it.qty),
  },
  satuan: {
    label: () => tt("Satuan", "Unit"),
    kunci: (it) => samakanTeksBaku(it.satuan),
    salin: (it) => samakanTeksBaku(it.satuan),
    tampil: (it) => samakanTeksBaku(it.satuan),
  },
  packingUnit: {
    label: () => tt("Jenis Kemasan", "Package Type"),
    kunci: (it) => samakanTeksBaku(it.packingUnit),
    salin: (it) => samakanTeksBaku(it.packingUnit),
    tampil: (it) => samakanTeksBaku(it.packingUnit),
  },
};

/* Tawaran yang sedang terbuka -- null bila kotaknya tertutup:
     { f: kolom, kunci: nilai baris 1, asal: sel baris 1 yang memicunya,
       kembali: kotak yang menerima fokus lagi sesudah dijawab } */
let tawaranSamakan = null;
let timerFokusSamakan = null;
/* "Ya" TERAKHIR yang masih bisa diurungkan -- null bila tidak ada:
   { f, label, rentang, kunci: nilai yang disalin, perubahan: [{ item, sebelum }] } */
let urungSamakan = null;

/* Apa yang akan terjadi kalau "Ya" ditekan untuk kolom `f` SEKARANG,
   dihitung dari data hidup (draftItems) -- bukan dari ingatan kotak
   dialognya. null = tidak ada yang perlu disamakan. */
function rencanaSamakan(f) {
  const kol = SAMAKAN_KOLOM[f];
  const n = draftItems.length;
  if (!kol || n < 2) return null;
  const sumber = draftItems[0];
  const kunci = kol.kunci(sumber);
  if (!kunci || (kol.sah && !kol.sah(sumber))) return null;
  const bawaan = kol.kunci(newItem());
  let timpa = 0;
  let beda = 0;
  for (let i = 1; i < n; i++) {
    const k = kol.kunci(draftItems[i]);
    if (k === kunci) continue;
    beda++;
    if (k && k !== bawaan) timpa++;
  }
  return beda ? { kol, f, kunci, n, timpa } : null;
}

function rentangSamakan(n) {
  return n === 2 ? tt("baris 2", "row 2") : tt(`baris 2–${n}`, `rows 2–${n}`);
}

/* ------------------------------------------------------------------
   FOKUS: dari mana, ke mana kembali

   Tabel digambar ulang (innerHTML) sesudah "Ya" & Urungkan: kotak yang
   tadi dipakai ikut lenyap, jadi yang dicatat juga letaknya (baris &
   kolom) untuk menemukan kembarannya, beserta seleksi teksnya.
------------------------------------------------------------------ */
function kotakSamakan(letak) {
  return letak ? $(`#itemTableBody tr[data-idx="${letak.idx}"]:not(.item-fac-row) [data-f="${letak.f}"]`) : null;
}

function tandaiFokusSamakan(el) {
  // Kotak di pop-up yang baru ditutup (pencarian HS Code) tidak bisa jadi tujuan kembali
  if (!el || el === document.body || !el.isConnected || el.closest("#samakanLapis") || !tampilDiLayar(el)) return null;
  const tr = el.dataset.f ? el.closest("#itemTableBody tr[data-idx]") : null;
  let pilihan = null;
  try {
    if (typeof el.selectionStart === "number") {
      pilihan = { awal: el.selectionStart, akhir: el.selectionEnd, semua: el.selectionStart === 0 && el.selectionEnd === el.value.length };
    }
  } catch (_) {
    /* kotak tanpa seleksi teks */
  }
  return { el, letak: tr ? { idx: tr.dataset.idx, f: el.dataset.f } : null, pilihan };
}

function pulihkanFokusSamakan(tanda) {
  const el = tanda && (tanda.el.isConnected ? tanda.el : kotakSamakan(tanda.letak));
  if (!el) return;
  fokuskan(el, { tanpaGulir: true });
  const p = tanda.pilihan;
  if (!p || typeof el.setSelectionRange !== "function") return;
  // Isi yang tadinya tersorot semua tetap tersorot semua, walau isinya kini lain
  const n = el.value.length;
  try {
    el.setSelectionRange(p.semua ? 0 : Math.min(p.awal, n), p.semua ? n : Math.min(p.akhir, n));
  } catch (_) {
    /* kotak tanpa seleksi teks */
  }
}

/* ------------------------------------------------------------------
   KOTAK DIALOG TAWARAN
------------------------------------------------------------------ */
const samakanLapisEl = $("#samakanLapis");
const samakanYaEl = $("#samakanYa");
const samakanTidakEl = $("#samakanTidak");

function isiTawaranSamakan(r) {
  // Rentang barisnya tidak dipatahkan di tanda pisah ("baris 2–" / "4?") di layar sempit
  const rentang = document.createElement("span");
  rentang.className = "text-nowrap";
  rentang.textContent = rentangSamakan(r.n);
  $("#samakanJudul").replaceChildren(tt(`Samakan ${r.kol.label()} ke `, `Apply ${r.kol.label()} to `), rentang, "?");
  $("#samakanNilai").textContent = r.kol.tampil(draftItems[0]);
  const catatan = $("#samakanCatatan");
  catatan.textContent = r.timpa
    ? tt(`${r.timpa} baris yang sudah terisi akan ditimpa — bisa diurungkan.`, `${r.timpa} filled ${r.timpa === 1 ? "row" : "rows"} will be overwritten — you can undo this.`)
    : "";
  catatan.hidden = !r.timpa;
}

function tampilkanTawaranSamakan(r, idx) {
  const lama = tawaranSamakan;
  tawaranSamakan = { f: r.f, kunci: r.kunci, asal: { idx, f: r.f }, kembali: lama ? lama.kembali : null };
  isiTawaranSamakan(r);
  if (lama) return; // sudah terbuka: isinya saja yang diganti
  samakanLapisEl.hidden = false;
  jedaBilahUrung("dialog", true);
  /* Fokus pindah ke "Ya" SESUDAH kejadian pemicunya selesai. `change`
     menyala di tengah perpindahan fokus (Enter ke baris 2, klik kotak
     lain): fokus yang dipasang di tengahnya bisa direbut lagi oleh
     peramban, dan yang dicatat sebagai tujuan kembali masih kotak lama. */
  clearTimeout(timerFokusSamakan);
  timerFokusSamakan = setTimeout(fokuskanTawaranSamakan, 0);
}

// Tujuan kembali: kotak yang kini berfokus -- atau sel baris 1 pemicunya (pencarian HS Code yang baru ditutup)
function tujuanKembaliSamakan(o) {
  return o.kembali || tandaiFokusSamakan(document.activeElement) || tandaiFokusSamakan(kotakSamakan(o.asal));
}

function fokuskanTawaranSamakan() {
  const o = tawaranSamakan;
  if (!o || o.kembali) return;
  o.kembali = tujuanKembaliSamakan(o);
  fokuskan(samakanYaEl, { tanpaGulir: true });
}

/* Kotak ditutup. pulihkan: kursor kembali ke kotak isian tadi. Hasilnya
   tujuan kembali itu -- terapkanSamakan memulihkannya sesudah tabel
   digambar ulang. */
function tutupTawaranSamakan(pulihkan) {
  const o = tawaranSamakan;
  if (!o) return null;
  const kembali = tujuanKembaliSamakan(o);
  tawaranSamakan = null;
  clearTimeout(timerFokusSamakan);
  samakanLapisEl.hidden = true;
  jedaBilahUrung("dialog", false);
  if (pulihkan) pulihkanFokusSamakan(kembali);
  return kembali;
}

/* Baris 1 & 2 sampai terakhir: hanya kotak isiannya yang berkedip */
function sorotSamakan(f, perubahan) {
  const letak = new Map(draftItems.map((it, i) => [it, i]));
  perubahan.forEach((c) => {
    const el = kotakSamakan({ idx: letak.get(c.item), f });
    if (el) el.classList.add("is-disamakan");
  });
}

/* "Ya, samakan": salin nilai baris 1 ke baris 2..terakhir -- hanya
   kolomnya. Dihitung ulang dari data hidup; kalau sudah tidak cocok
   dengan yang ditawarkan, kotak menutup tanpa mengubah apa pun. Nilai
   LAMA tiap sel yang ditimpa dicatat untuk Urungkan. */
function terapkanSamakan() {
  const o = tawaranSamakan;
  if (!o) return;
  const kembali = tutupTawaranSamakan(false);
  const r = rencanaSamakan(o.f);
  if (!r || r.kunci !== o.kunci) {
    pulihkanFokusSamakan(kembali);
    return;
  }
  const nilai = r.kol.salin(draftItems[0]);
  const perubahan = [];
  for (let i = 1; i < draftItems.length; i++) {
    // Baris yang sudah sama dibiarkan apa adanya (jangan ubah tulisannya)
    if (r.kol.kunci(draftItems[i]) === r.kunci) continue;
    perubahan.push({ item: draftItems[i], sebelum: draftItems[i][o.f] });
    draftItems[i][o.f] = nilai;
  }
  renderItemTable();
  sorotSamakan(o.f, perubahan);
  pulihkanFokusSamakan(kembali);
  // Yang lebih baru menggantikan catatan yang lama: hanya "Ya" terakhir yang bisa diurungkan
  urungSamakan = { f: o.f, label: r.kol.label(), rentang: rentangSamakan(r.n), kunci: r.kunci, perubahan };
  tampilkanBilahUrung("urung", tt(`${urungSamakan.label} disamakan ke ${urungSamakan.rentang}.`, `${urungSamakan.label} applied to ${urungSamakan.rentang}.`));
}

if (samakanLapisEl) {
  samakanYaEl.addEventListener("click", terapkanSamakan);
  samakanTidakEl.addEventListener("click", () => tutupTawaranSamakan(true));
  // Klik di luar kotak = "Tidak" (mousedown dicegah: fokus yang dipulihkan tidak dilepas lagi)
  samakanLapisEl.addEventListener("mousedown", (e) => {
    if (e.target !== samakanLapisEl) return;
    e.preventDefault();
    tutupTawaranSamakan(true);
  });
  samakanLapisEl.addEventListener("keydown", (e) => {
    const k = e.key || "";
    if (!tawaranSamakan || e.isComposing) return;
    if (k === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // tidak ikut menutup panel / halaman di belakangnya
      tutupTawaranSamakan(true);
    } else if (k === "Enter") {
      // Ditangani sendiri: Enter yang memicu kotak ini tidak ikut "menekan" tombolnya
      e.preventDefault();
      (e.target.closest("button") || samakanYaEl).click();
    } else if (k === "Tab") {
      // Fokus berputar di antara kedua tombol
      e.preventDefault();
      fokuskan(document.activeElement === samakanYaEl ? samakanTidakEl : samakanYaEl, { tanpaGulir: true });
    } else if (k.length === 1 && k !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      /* Mengetik = mengisi sendiri. Fokus kembali SEBELUM peramban
         menulis hurufnya, jadi huruf itu masuk ke kotak isian tadi. */
      tutupTawaranSamakan(true);
    }
  });
}

/* ------------------------------------------------------------------
   BILAH URUNGKAN (kiri bawah)

   jenis: "urung" (tombol Urungkan + cincin hitung mundur), "kabar"
   (hasil Urungkan), atau "peringatan" (tak ada yang bisa dikembalikan).
   Tombolnya tidak mengambil fokus: kursor tetap di kotak isian.
------------------------------------------------------------------ */
const samakanUrungEl = $("#samakanUrung");
const IKON_BILAH_URUNG = { urung: "bi-arrow-counterclockwise", kabar: "bi-check-lg", peringatan: "bi-exclamation-lg" };
// Alasan hitungan mundur berhenti: "tunjuk" (tetikus di atasnya), "fokus", "dialog" (kotak tawaran terbuka)
const jedaUrung = new Set();
const waktuUrung = { timer: null, sisa: 0, mulai: 0 };

function tampilkanBilahUrung(jenis, pesan) {
  const el = samakanUrungEl;
  if (!el) return;
  // Kabar ditahan sesuai panjang kalimatnya
  const lama = jenis === "urung" ? SAMAKAN_URUNG_MS : Math.min(9000, Math.max(SAMAKAN_KABAR_MS, pesan.length * 60));
  el.dataset.jenis = jenis;
  /* Dua nama animasi yang bergantian: cincin mulai penuh lagi tanpa
     memaksa tata letak dihitung ulang (css: samakan-cincin-a / -b). */
  el.dataset.putaran = el.dataset.putaran === "a" ? "b" : "a";
  el.style.setProperty("--samakan-lama", lama + "ms");
  $("#samakanUrungIkon").className = "bi " + IKON_BILAH_URUNG[jenis];
  $("#samakanUrungPesan").textContent = pesan;
  el.hidden = false;
  letakkanBilahUrung();
  clearTimeout(waktuUrung.timer);
  waktuUrung.sisa = lama;
  jalankanWaktuUrung();
}

function jalankanWaktuUrung() {
  const berhenti = jedaUrung.size > 0;
  samakanUrungEl.classList.toggle("is-jeda", berhenti);
  waktuUrung.timer = null;
  if (berhenti) return;
  waktuUrung.mulai = Date.now();
  waktuUrung.timer = setTimeout(sembunyikanBilahUrung, waktuUrung.sisa);
}

function jedaBilahUrung(alasan, aktif) {
  const sebelum = jedaUrung.size > 0;
  if (aktif) jedaUrung.add(alasan);
  else jedaUrung.delete(alasan);
  if (!samakanUrungEl || samakanUrungEl.hidden || sebelum === (jedaUrung.size > 0)) return;
  if (!sebelum) {
    clearTimeout(waktuUrung.timer);
    waktuUrung.timer = null;
    waktuUrung.sisa = Math.max(0, waktuUrung.sisa - (Date.now() - waktuUrung.mulai));
    samakanUrungEl.classList.add("is-jeda");
  } else jalankanWaktuUrung();
}

function sembunyikanBilahUrung() {
  urungSamakan = null;
  clearTimeout(waktuUrung.timer);
  waktuUrung.timer = null;
  // Bilah yang lenyap tidak lagi ditunjuk / difokus
  jedaUrung.delete("tunjuk");
  jedaUrung.delete("fokus");
  if (samakanUrungEl) samakanUrungEl.hidden = true;
}

/* LETAK: tepat di atas bilah Simpan form, dan di atas papan ketik layar
   kalau papan ketik menutupi bagian bawah (iPhone / iPad: viewport tata
   letak -- tempat `position: fixed` bertumpu -- tidak ikut mengecil,
   visualViewport yang tahu area yang benar-benar terlihat). */
function letakkanBilahUrung() {
  if (!samakanUrungEl || samakanUrungEl.hidden) return;
  const tinggi = document.documentElement.clientHeight;
  const simpan = $("#viewForm .page-form-actions-inner");
  let dasar = 0;
  if (simpan && simpan.getClientRects().length) {
    const atas = simpan.getBoundingClientRect().top;
    if (atas > 0 && atas < tinggi) dasar = tinggi - atas;
  }
  const vv = window.visualViewport;
  if (vv) dasar = Math.max(dasar, tinggi - vv.offsetTop - vv.height);
  samakanUrungEl.style.setProperty("--samakan-dasar", Math.round(Math.max(0, dasar)) + "px");
}

/* "Urungkan": kembalikan nilai lama tiap sel yang tadi ditimpa. Sel yang
   sudah diubah lagi sesudah disamakan, atau barisnya sudah dihapus,
   DILEWATI -- mengembalikannya berarti menimpa pekerjaan yang lebih baru. */
function urungkanSamakan() {
  const u = urungSamakan;
  if (!u) return;
  urungSamakan = null;
  const kol = SAMAKAN_KOLOM[u.f];
  const ada = new Set(draftItems);
  const dikembalikan = u.perubahan.filter((c) => ada.has(c.item) && kol.kunci(c.item) === u.kunci);
  dikembalikan.forEach((c) => {
    if (c.sebelum === undefined) delete c.item[u.f];
    else c.item[u.f] = c.sebelum;
  });
  if (!dikembalikan.length) {
    tampilkanBilahUrung("peringatan", tt("Tidak ada yang bisa dikembalikan: barisnya sudah diubah atau dihapus.", "Nothing to restore: the rows were changed or removed."));
    return;
  }
  const fokus = tandaiFokusSamakan(document.activeElement);
  renderItemTable();
  sorotSamakan(u.f, dikembalikan);
  pulihkanFokusSamakan(fokus);
  const n = dikembalikan.length;
  const lewat = u.perubahan.length - n;
  const baris = tt(`${n} baris`, `${n} ${n === 1 ? "row" : "rows"}`);
  const sisa = lewat
    ? tt(`; ${lewat} baris dilewati karena sudah diubah atau dihapus`, `; ${lewat} skipped because ${lewat === 1 ? "it was" : "they were"} changed or removed`)
    : "";
  tampilkanBilahUrung("kabar", tt(`${u.label} dikembalikan di ${baris}${sisa}.`, `${u.label} restored in ${baris}${sisa}.`));
}

/* Ctrl/⌘+Z selagi Urungkan tersedia. Kotak teks yang sudah diketik
   punya riwayat ketikan sendiri -- Ctrl+Z di sana tetap miliknya. */
function ctrlZUntukSamakan(el) {
  if (!el || !el.matches) return true;
  if (el.isContentEditable) return false;
  return !el.matches("input, textarea") || el.value === el.defaultValue;
}

if (samakanUrungEl) {
  // Menekan tombolnya TIDAK memindahkan fokus dari kotak isian yang sedang dipakai
  samakanUrungEl.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  $("#samakanUrungBtn").addEventListener("click", urungkanSamakan);
  $("#samakanUrungTutup").addEventListener("click", sembunyikanBilahUrung);
  samakanUrungEl.addEventListener("pointerenter", () => jedaBilahUrung("tunjuk", true));
  samakanUrungEl.addEventListener("pointerleave", () => jedaBilahUrung("tunjuk", false));
  samakanUrungEl.addEventListener("focusin", () => jedaBilahUrung("fokus", true));
  samakanUrungEl.addEventListener("focusout", (e) => {
    if (!samakanUrungEl.contains(e.relatedTarget)) jedaBilahUrung("fokus", false);
  });
  window.addEventListener("resize", letakkanBilahUrung);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", letakkanBilahUrung);
    window.visualViewport.addEventListener("scroll", letakkanBilahUrung);
  }
  document.addEventListener("keydown", (e) => {
    if (!urungSamakan || tawaranSamakan || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== "z" && e.key !== "Z")) return;
    if (document.querySelector(".modal.show") || !ctrlZUntukSamakan(document.activeElement)) return;
    e.preventDefault();
    urungkanSamakan();
  });
}

/* ------------------------------------------------------------------
   PINTU MASUK DARI TABEL
------------------------------------------------------------------ */

/* Enter di baris TERAKHIR menambah baris lalu menggambar ulang tabel
   (item-table.js, keBarisBerikutnya). Chrome menembakkan `change` dari
   kotak yang dilepas SAAT itu juga -- Firefox & Safari tidak -- padahal
   baris di bawahnya baru lahir karena Enter itu, bukan sudah ada waktu
   isiannya selesai. Dibungkus di sini supaya perilakunya sama di semua
   peramban: tidak ada tawaran. */
let samakanDitahan = false;
function tanpaTawaranSamakan(fn) {
  const sebelum = samakanDitahan;
  samakanDitahan = true;
  try {
    fn();
  } finally {
    samakanDitahan = sebelum;
  }
}

/* Isian `f` di baris `idx` baru selesai diisi (kejadian `change`) atau
   diubah lewat pencarian HS Code. Selain baris pertama dan ketujuh
   kolom di atas -- diam. */
function tawarkanSamakan(f, idx) {
  if (samakanDitahan || idx !== 0 || !SAMAKAN_KOLOM[f] || !samakanLapisEl) return;
  const r = rencanaSamakan(f);
  if (r) tampilkanTawaranSamakan(r, idx);
  else if (tawaranSamakan && tawaranSamakan.f === f) tutupTawaranSamakan(true);
}

/* Tabel digambar ulang (baris bertambah / berkurang, hasil impor, ...):
   bunyi tawaran yang terbuka dibetulkan -- atau ditutup kalau baris 1
   sudah berganti isi / tak ada lagi yang perlu disamakan; Urungkan yang
   semua barangnya sudah tidak ada ikut pergi. Tidak pernah MEMBUKA
   tawaran -- itu hanya lewat tawarkanSamakan(). */
function perbaruiTawaranSamakan() {
  if (urungSamakan) {
    const ada = new Set(draftItems);
    if (!urungSamakan.perubahan.some((c) => ada.has(c.item))) sembunyikanBilahUrung();
  }
  if (!tawaranSamakan) return;
  const r = rencanaSamakan(tawaranSamakan.f);
  if (!r || r.kunci !== tawaranSamakan.kunci) tutupTawaranSamakan(true);
  else isiTawaranSamakan(r);
}

function sembunyikanSemuaSamakan() {
  tutupTawaranSamakan(false);
  sembunyikanBilahUrung();
}

// Pindah halaman / tab: tawaran & Urungkan untuk tabel yang sudah tak terlihat ikut pergi
window.addEventListener("hashchange", sembunyikanSemuaSamakan);

function tutupBilaPaneBarangTersembunyi(pane) {
  if (pane.classList.contains("d-none")) sembunyikanSemuaSamakan();
}

function amatiPaneBarangSamakan() {
  const pane = document.querySelector('.tab-pane[data-tabpane="barang"]');
  if (!pane || pane.dataset.samakanDiamati) return;
  pane.dataset.samakanDiamati = "1";
  new MutationObserver(() => tutupBilaPaneBarangTersembunyi(pane)).observe(pane, {
    attributes: true,
    attributeFilter: ["class"],
  });
}
document.addEventListener("DOMContentLoaded", amatiPaneBarangSamakan);
amatiPaneBarangSamakan();
