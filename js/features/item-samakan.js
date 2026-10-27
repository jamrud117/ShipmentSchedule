"use strict";

/* SAMAKAN ISIAN BARIS 1 KE BARIS-BARIS DI BAWAHNYA -- dan URUNGKAN.

   Isian detail barang sering sama untuk semua baris -- HS Code, kondisi,
   negara asal, jenis barang, qty, satuan, jenis kemasan, merek, PI,
   fasilitas -- sedangkan Enter di sebuah kotak hanya pindah ke kotak
   yang sama di baris berikutnya. Menyalin satu per satu untuk 20 barang
   melelahkan dan gampang terlewat. SEMUA isian barang bisa disamakan
   (SAMAKAN_KOLOM); yang berbeda hanya kapan tawarannya muncul sendiri:

     otomatis "selalu" -- isian yang hampir selalu sama (HS Code, Kode
        Kondisi, Negara Asal, Jenis Barang, Qty, Satuan, Jenis Kemasan):
        begitu isian BARIS PERTAMA selesai diisi (kotak ditinggalkan,
        Enter, atau pilihan dipilih) dan ada baris yang berbeda;
     otomatis "pintar" -- isian yang sering sama (Kode Barang, Merek,
        Tipe, Spesifikasi Lain, PI): hanya bila baris lain belum diisi
        sendiri -- kosong / nilai bawaan, atau masih sama dengan isian
        LAMA baris 1 (dulu disamakan, kini baris 1 diubah);
     tanpa tawaran -- isian yang biasanya beda per barang (Uraian,
        Ukuran, Marks, Harga, Netto, Bruto, Dimensi, Kemasan, No. item di
        PI, Fasilitas): bertanya tiap kali baris 1 disunting hanya
        mengganggu.

   Kapan pun, SEMUA isian bisa disamakan atas permintaan: menu "Samakan
   baris 1" di kepala Daftar Barang (hanya isian yang memang berbeda,
   beserta nilainya), atau Ctrl/⌘+D di kotak baris 1. Permintaan
   langsung dijalankan -- Urungkan menjadi pengamannya.

   Tawaran otomatis = KOTAK DIALOG di tengah layar (#samakanLapis):

       Samakan Satuan ke baris 2–12?
       [ ISIAN BARIS 1:  PCS ]
       3 baris yang sudah terisi akan ditimpa — bisa diurungkan.
                                [Tidak  Esc]  [Ya, samakan  Enter]

   Tombol "Ya, samakan" langsung berfokus: Enter menyamakan; Esc, "Tidak"
   atau klik di luar kotak menolak. Mengetik huruf selagi kotak terbuka
   berarti memilih mengisi sendiri -- kotak menutup dan hurufnya masuk ke
   kotak isian tadi. Sesudah menjawab, kursor kembali ke kotak yang
   sedang dipakai (baris 2 kalau tadi Enter), seleksinya pun dipulihkan.

   Menyamakan menyalin nilai itu ke baris 2 sampai baris terakhir --
   hanya isian itu -- dan sel yang berubah berkedip sebentar. Lalu BILAH
   URUNGKAN muncul di kiri bawah, tepat di atas bilah Simpan form
   (#samakanUrung):

       (↶) Satuan disamakan ke baris 2–12.   [Urungkan Ctrl+Z]   ×

   Cincin di ikonnya menghitung mundur 15 detik -- berhenti selama
   bilahnya ditunjuk / difokus atau selama kotak dialog terbuka.
   "Urungkan" (atau Ctrl/⌘+Z) mengembalikan isian LAMA tiap baris persis
   seperti sebelumnya (kosong tetap kosong, nilai bawaan tetap bawaan);
   hasilnya dikabarkan di bilah yang sama.

   Aturan yang dijaga:
     - HANYA baris pertama yang jadi sumber. Isian di baris 2 dan
       seterusnya tidak pernah memunculkan tawaran: di sana orang sedang
       mengisi nilai yang memang berbeda.
     - Tidak ada yang disamakan kalau tidak perlu: barisnya cuma satu,
       isian baris 1 kosong (qty 0 dianggap kosong), kode negara tidak
       dikenal, atau semua baris di bawahnya sudah sama. Baris yang baru
       lahir dari Enter di baris terakhir tidak dihitung: Enter itu
       menambah baris SESUDAH isiannya selesai.
     - Menimpa isian orang DIBERITAHUKAN ("3 baris yang sudah terisi
       akan ditimpa"). Nilai bawaan baris baru (SET, BOX, BAHAN BAKU,
       kondisi 1, TANPA MEREK, ...) bukan isian orang, jadi tidak dihitung.
     - Hasil impor / salinan tidak memicunya: tawaran hanya lahir dari
       isian tangan (kejadian `change`) dan pilihan HS Code lewat
       pencarian. Kedua jalan itu memanggil tawarkanSamakan().
     - Bunyinya selalu cocok dengan tabel: tabel yang digambar ulang
       selagi kotak terbuka memperbarui jumlah barisnya, dan kotak
       menutup begitu sudah tidak ada yang perlu disamakan. "Ya"
       menghitung ulang dari data hidup -- kalau baris 1 sudah berganti
       isi, tidak ada yang disalin.
     - Urungkan hanya untuk penyamaan TERAKHIR (yang lebih baru
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

/* Isian teks biasa (huruf besar, spasi tepi diabaikan) & isian angka
   (0 = kosong) -- bentuk yang sama di banyak kolom. */
const kolomTeksSamakan = (f, label, otomatis, ada) => ({
  label,
  otomatis,
  ada,
  kunci: (it) => samakanTeksBaku(it[f]),
  salin: (it) => samakanTeksBaku(it[f]),
  tampil: (it) => samakanTeksBaku(it[f]),
});
const kolomAngkaSamakan = (f, label) => ({
  label,
  otomatis: false,
  kunci: (it) => {
    const n = samakanAngka(it[f]);
    return n > 0 ? String(n) : "";
  },
  salin: (it) => samakanAngka(it[f]),
  tampil: (it) => formatNumberValue(it[f]),
});

const bukuImport = () => activeMode !== "export";
const bukuExport = () => activeMode === "export";
const adaPiBarang = () => !!ML().showDuty;

// Daftar fasilitas (SKB & COO) satu barang, dalam bentuk yang dibandingkan
function kunciFasilitasSamakan(it) {
  const daftar = sanitizeSkbList(it.skb);
  return daftar.length ? JSON.stringify(daftar.map((sk) => [sk.jenis, samakanTeksBaku(sk.jenisLainnya), String(sk.nomor).trim(), sk.tanggal])) : "";
}

/* SEMUA isian barang, urut kolom tabel (urutan menu "Samakan baris 1").
   Tiap kolom tahu:
     label()   : nama kolom di pesan (ikut bahasa aktif)
     otomatis  : "selalu" | "pintar" | false -- kapan tawaran muncul
                 sendiri (lihat keterangan di atas)
     ada()     : (opsional) kolomnya ada di buku ini
     kunci(it) : bentuk BAKU yang dibandingkan; "" = kosong. Dua isian
                 dianggap sama kalau kuncinya sama ("pcs" = "PCS").
     salin(it) : nilai yang ditulis ke baris lain -- sama dengan yang
                 terlihat di kotaknya; dipanggil SEKALI PER BARIS (daftar
                 fasilitas tiap baris jadi salinan sendiri).
     tampil()  : tulisan nilai di pesan.
     sah(it)   : (opsional) nilai pantas disalin; kode negara yang tidak
                 dikenal (ditandai merah di tabel) tidak.
     pasang / simpan / pulihkan : (opsional) isian yang lebih dari satu
                 kunci data -- PI barang ikut mengosongkan No. item-nya.
     sel       : (opsional) yang berkedip; bawaannya kotak [data-f]. */
const SAMAKAN_KOLOM = {
  hsCode: {
    label: () => "HS Code",
    otomatis: "selalu",
    kunci: (it) => String(it.hsCode == null ? "" : it.hsCode).replace(/\D/g, ""),
    salin: (it) => it.hsCode,
    tampil: (it) => String(it.hsCode).trim(),
    // Disamakan = isian sendiri, bukan lagi HS Code otomatis dari nama barang (hscode-lookup.js)
    pasang: (it, v) => {
      it.hsCode = v;
      delete it._hsOtomatis;
      delete it._hsSaran;
    },
    simpan: (it) => ({ hsCode: it.hsCode, _hsOtomatis: it._hsOtomatis, _hsSaran: it._hsSaran }),
    pulihkan: (it, lama) =>
      Object.keys(lama).forEach((k) => {
        if (lama[k] === undefined) delete it[k];
        else it[k] = lama[k];
      }),
  },
  kodeBarang: kolomTeksSamakan("kodeBarang", () => tt("Kode Barang", "Item Code"), "pintar"),
  namaBarang: kolomTeksSamakan("namaBarang", () => tt("Uraian", "Description"), false),
  merek: kolomTeksSamakan("merek", () => tt("Merek", "Brand"), "pintar"),
  tipe: kolomTeksSamakan("tipe", () => tt("Tipe", "Type"), "pintar"),
  ukuran: kolomTeksSamakan("ukuran", () => tt("Ukuran", "Size"), false),
  spesifikasiLain: kolomTeksSamakan("spesifikasiLain", () => tt("Spesifikasi Lain", "Other Specification"), "pintar"),
  kondisiBarang: {
    label: () => tt("Kondisi Barang", "Goods Condition"),
    otomatis: "selalu",
    ada: bukuImport,
    kunci: (it) => kodeKondisiBarang(it.kondisiBarang),
    salin: (it) => kodeKondisiBarang(it.kondisiBarang),
    tampil: (it) => labelKondisiBarang(it.kondisiBarang),
  },
  negaraAsal: {
    label: () => tt("Negara Asal", "Country of Origin"),
    otomatis: "selalu",
    kunci: (it) => samakanTeksBaku(it.negaraAsal),
    salin: (it) => samakanTeksBaku(it.negaraAsal),
    tampil: (it) => {
      const kode = samakanTeksBaku(it.negaraAsal);
      const nama = namaNegara(kode);
      return nama ? `${kode} — ${nama}` : kode;
    },
    sah: (it) => !!namaNegara(it.negaraAsal),
  },
  marks: kolomTeksSamakan("marks", () => "Marks", false, bukuExport),
  jenisBarang: {
    label: () => tt("Jenis Barang", "Goods Category"),
    otomatis: "selalu",
    kunci: (it) => normalisasiJenisBarang(it.jenisBarang),
    salin: (it) => normalisasiJenisBarang(it.jenisBarang),
    tampil: (it) => labelJenisBarang(normalisasiJenisBarang(it.jenisBarang)),
  },
  skb: {
    label: () => tt("Fasilitas (SKB & COO)", "Facilities (SKB & COO)"),
    otomatis: false,
    kunci: kunciFasilitasSamakan,
    salin: (it) => sanitizeSkbList(it.skb),
    tampil: (it) =>
      sanitizeSkbList(it.skb)
        .map((sk) => [skbEntryLabel(sk), String(sk.nomor).trim()].filter(Boolean).join(" "))
        .join(" · "),
    sel: '[data-act="toggle-fac"]',
  },
  piNomor: {
    label: () => tt("PI barang", "Item PI"),
    otomatis: "pintar",
    ada: adaPiBarang,
    kunci: (it) => String(it.piNomor || "").trim(),
    salin: (it) => String(it.piNomor || "").trim(),
    tampil: (it) => String(it.piNomor || "").trim(),
    // No. item di PI milik PI-nya: PI yang berganti mengosongkannya
    pasang: (it, v) => {
      if (String(it.piNomor || "").trim() !== v) it.piNoItem = "";
      it.piNomor = v;
    },
    simpan: (it) => ({ piNomor: it.piNomor, piNoItem: it.piNoItem }),
    pulihkan: (it, lama) => Object.assign(it, lama),
    sel: '[data-act="toggle-fac"]',
  },
  piNoItem: Object.assign(kolomTeksSamakan("piNoItem", () => tt("No. item di PI", "Item no. in PI"), false, adaPiBarang), {
    sah: (it) => !!String(it.piNomor || "").trim(),
    sel: '[data-act="toggle-fac"]',
  }),
  qty: Object.assign(kolomAngkaSamakan("qty", () => "Qty"), { otomatis: "selalu" }),
  satuan: kolomTeksSamakan("satuan", () => tt("Satuan", "Unit"), "selalu"),
  harga: kolomAngkaSamakan("harga", () => t("f.harga.unit.usd")),
  netto: kolomAngkaSamakan("netto", () => t("f.netto.kg")),
  bruto: kolomAngkaSamakan("bruto", () => t("f.bruto.kg")),
  package: kolomTeksSamakan("package", () => t("f.dimensi"), false, bukuExport),
  packing: kolomTeksSamakan("packing", () => t("f.kemasan"), false),
  packingUnit: kolomTeksSamakan("packingUnit", () => tt("Jenis Kemasan", "Package Type"), "selalu"),
};

/* Tawaran yang sedang terbuka -- null bila kotaknya tertutup:
     { f: kolom, kunci: nilai baris 1, asal: sel baris 1 yang memicunya,
       kembali: kotak yang menerima fokus lagi sesudah dijawab } */
let tawaranSamakan = null;
let timerFokusSamakan = null;
/* Penyamaan TERAKHIR yang masih bisa diurungkan -- null bila tidak ada:
   { f, label, rentang, kunci: nilai yang disalin, perubahan: [{ item, sebelum }] } */
let urungSamakan = null;
/* Isian baris 1 SEBELUM disunting -- { f, kunci } saat kotaknya mulai
   dipakai. Aturan "pintar" membaca baris lain yang masih sama dengan
   nilai lama ini sebagai baris yang mengikuti baris 1. */
let samakanAwal = null;

/* Apa yang akan terjadi kalau kolom `f` disamakan SEKARANG, dihitung dari
   data hidup (draftItems) -- bukan dari ingatan kotak dialognya. null =
   tidak ada yang perlu disamakan. `ikut(awal)`: semua baris yang berbeda
   belum diisi sendiri -- kosong / bawaan, atau sama dengan `awal`. */
function rencanaSamakan(f) {
  const kol = SAMAKAN_KOLOM[f];
  const n = draftItems.length;
  if (!kol || (kol.ada && !kol.ada()) || n < 2) return null;
  const sumber = draftItems[0];
  const kunci = kol.kunci(sumber);
  if (!kunci || (kol.sah && !kol.sah(sumber))) return null;
  const bawaan = kol.kunci(newItem());
  const lain = [];
  let timpa = 0;
  for (let i = 1; i < n; i++) {
    const k = kol.kunci(draftItems[i]);
    if (k === kunci) continue;
    lain.push(k);
    if (k && k !== bawaan) timpa++;
  }
  if (!lain.length) return null;
  const ikut = (awal) => lain.every((k) => !k || k === bawaan || (awal != null && k === awal));
  return { kol, f, kunci, n, timpa, beda: lain.length, ikut };
}

function rentangSamakan(n) {
  return n === 2 ? tt("baris 2", "row 2") : tt(`baris 2–${n}`, `rows 2–${n}`);
}

/* ------------------------------------------------------------------
   FOKUS: dari mana, ke mana kembali

   Tabel digambar ulang (innerHTML) sesudah "Ya" & Urungkan: kotak yang
   tadi dipakai ikut lenyap, jadi yang dicatat juga letaknya (baris &
   kolom -- isian barang [data-f], atau isian panel fasilitas [data-fac]
   beserta entrinya) untuk menemukan kembarannya, beserta seleksi teksnya.
------------------------------------------------------------------ */
function kotakSamakan(letak) {
  if (!letak) return null;
  if (letak.fac) {
    const entri = letak.skidx != null ? `[data-skidx="${letak.skidx}"]` : ":not([data-skidx])";
    return $(`#itemTableBody [data-fac="${letak.fac}"][data-idx="${letak.idx}"]${entri}`);
  }
  return $(`#itemTableBody tr[data-idx="${letak.idx}"]:not(.item-fac-row) [data-f="${letak.f}"]`);
}

function letakKotakSamakan(el) {
  if (el.dataset.f) {
    const tr = el.closest("#itemTableBody tr[data-idx]");
    return tr ? { idx: tr.dataset.idx, f: el.dataset.f } : null;
  }
  if (el.dataset.fac && el.dataset.idx != null && el.closest("#itemTableBody")) return { idx: el.dataset.idx, fac: el.dataset.fac, skidx: el.dataset.skidx };
  return null;
}

function tandaiFokusSamakan(el) {
  // Kotak di pop-up yang baru ditutup (pencarian HS Code) tidak bisa jadi tujuan kembali
  if (!el || el === document.body || !el.isConnected || el.closest("#samakanLapis") || !tampilDiLayar(el)) return null;
  let pilihan = null;
  try {
    if (typeof el.selectionStart === "number") {
      pilihan = { awal: el.selectionStart, akhir: el.selectionEnd, semua: el.selectionStart === 0 && el.selectionEnd === el.value.length };
    }
  } catch (_) {
    /* kotak tanpa seleksi teks */
  }
  return { el, letak: letakKotakSamakan(el), pilihan };
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

/* Baris 1 & 2 sampai terakhir: hanya kotak isiannya (atau tombol
   Fasilitas-nya) yang berkedip */
function sorotSamakan(f, perubahan) {
  const sel = SAMAKAN_KOLOM[f].sel || `[data-f="${f}"]`;
  const letak = new Map(draftItems.map((it, i) => [it, i]));
  perubahan.forEach((c) => {
    const el = $(`#itemTableBody tr[data-idx="${letak.get(c.item)}"]:not(.item-fac-row) ${sel}`);
    if (el) el.classList.add("is-disamakan");
  });
}

// Isian satu kolom ditulis & dikembalikan -- lewat cara kolomnya sendiri bila ada
const pasangSamakan = (kol, f, it, nilai) => (kol.pasang ? kol.pasang(it, nilai) : (it[f] = nilai));
const simpanSamakan = (kol, f, it) => (kol.simpan ? kol.simpan(it) : it[f]);
function pulihkanSamakan(kol, f, it, lama) {
  if (kol.pulihkan) kol.pulihkan(it, lama);
  else if (lama === undefined) delete it[f];
  else it[f] = lama;
}

/* Salin isian baris 1 ke baris 2..terakhir -- hanya kolom `f` -- menurut
   rencana `r` yang baru dihitung. Nilai LAMA tiap sel yang ditimpa
   dicatat untuk Urungkan; tabel digambar ulang, sel yang berubah
   berkedip, fokus kembali ke `kembali`, lalu bilah Urungkan. */
/* Uraian / Tipe berganti: HS Code otomatis baris itu mengikuti namanya
   (hscode-lookup.js) -- hanya yang kosong atau masih isian otomatis. */
function hsIkutNamaSamakan(f, perubahan) {
  if ((f !== "namaBarang" && f !== "tipe") || typeof hsOtomatisBarang !== "function" || !hsCodeRows.length) return;
  perubahan.forEach((c) => hsOtomatisBarang(c.item));
}

function salinBaris1(r, kembali) {
  const { kol, f } = r;
  const perubahan = [];
  for (let i = 1; i < draftItems.length; i++) {
    // Baris yang sudah sama dibiarkan apa adanya (jangan ubah tulisannya)
    if (kol.kunci(draftItems[i]) === r.kunci) continue;
    perubahan.push({ item: draftItems[i], sebelum: simpanSamakan(kol, f, draftItems[i]) });
    pasangSamakan(kol, f, draftItems[i], kol.salin(draftItems[0]));
  }
  hsIkutNamaSamakan(f, perubahan);
  renderItemTable();
  sorotSamakan(f, perubahan);
  pulihkanFokusSamakan(kembali);
  // Yang lebih baru menggantikan catatan yang lama: hanya penyamaan terakhir yang bisa diurungkan
  urungSamakan = { f, label: kol.label(), rentang: rentangSamakan(r.n), kunci: r.kunci, perubahan };
  tampilkanBilahUrung("urung", tt(`${urungSamakan.label} disamakan ke ${urungSamakan.rentang}.`, `${urungSamakan.label} applied to ${urungSamakan.rentang}.`));
}

/* "Ya, samakan". Dihitung ulang dari data hidup; kalau sudah tidak cocok
   dengan yang ditawarkan, kotak menutup tanpa mengubah apa pun. */
function terapkanSamakan() {
  const o = tawaranSamakan;
  if (!o) return;
  const kembali = tutupTawaranSamakan(false);
  const r = rencanaSamakan(o.f);
  if (!r || r.kunci !== o.kunci) {
    pulihkanFokusSamakan(kembali);
    return;
  }
  salinBaris1(r, kembali);
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
  dikembalikan.forEach((c) => pulihkanSamakan(kol, u.f, c.item, c.sebelum));
  hsIkutNamaSamakan(u.f, dikembalikan);
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

/* Kolom SAMAKAN_KOLOM sebuah kotak di tabel: isian barang [data-f], PI
   & No. item di panel fasilitas, atau isian entri fasilitas (= kolom
   "skb"). Beserta barisnya. */
function kolomKotakSamakan(el) {
  const letak = el && el.dataset ? letakKotakSamakan(el) : null;
  if (!letak) return null;
  const f = letak.f || (letak.fac === "piNomor" || letak.fac === "piNoItem" ? letak.fac : letak.skidx != null ? "skb" : null);
  return f && SAMAKAN_KOLOM[f] ? { f, idx: Number(letak.idx) } : null;
}

/* Isian `f` di baris `idx` baru selesai diisi (kejadian `change`) atau
   diubah lewat pencarian HS Code. Selain baris pertama -- diam; begitu
   juga kolom tanpa tawaran otomatis, dan kolom "pintar" yang baris
   lainnya sudah diisi sendiri. */
function tawarkanSamakan(f, idx) {
  const kol = SAMAKAN_KOLOM[f];
  if (samakanDitahan || idx !== 0 || !kol || !kol.otomatis || !samakanLapisEl) return;
  const r = rencanaSamakan(f);
  const awal = samakanAwal && samakanAwal.f === f ? samakanAwal.kunci : null;
  // Disunting lagi tanpa meninggalkan kotaknya: yang lama kini nilai ini
  samakanAwal = { f, kunci: kol.kunci(draftItems[0]) };
  if (r && (kol.otomatis === "selalu" || r.ikut(awal))) tampilkanTawaranSamakan(r, idx);
  else if (tawaranSamakan && tawaranSamakan.f === f) tutupTawaranSamakan(true);
}

/* ------------------------------------------------------------------
   SAMAKAN ATAS PERMINTAAN -- menu "Samakan baris 1" & Ctrl/⌘+D

   Semua kolom, kapan pun; langsung dijalankan tanpa kotak dialog --
   Urungkan pengamannya. Tidak ada yang disamakan: alasannya di bilah.
------------------------------------------------------------------ */
function alasanTakAdaSamakan(f) {
  const kol = SAMAKAN_KOLOM[f];
  const n = draftItems.length;
  if (n < 2) return tt("Baru ada satu barang — tidak ada baris lain untuk disamakan.", "There is only one item — no other rows to apply it to.");
  if (!kol.kunci(draftItems[0])) return tt(`${kol.label()} baris 1 masih kosong.`, `${kol.label()} in row 1 is still empty.`);
  if (kol.sah && !kol.sah(draftItems[0])) return tt(`${kol.label()} baris 1 belum sah — betulkan dulu.`, `${kol.label()} in row 1 is not valid yet — fix it first.`);
  return tt(`${kol.label()} ${rentangSamakan(n)} sudah sama dengan baris 1.`, `${kol.label()} in ${rentangSamakan(n)} already matches row 1.`);
}

function samakanAtasPermintaan(f) {
  if (!SAMAKAN_KOLOM[f]) return false;
  if (tawaranSamakan) tutupTawaranSamakan(false);
  const r = rencanaSamakan(f);
  if (!r) {
    tampilkanBilahUrung("peringatan", alasanTakAdaSamakan(f));
    return false;
  }
  salinBaris1(r, tandaiFokusSamakan(document.activeElement));
  return true;
}

const samakanMenuEl = $("#samakanMenu");
const samakanMenuIsiEl = $("#samakanMenuIsi");

/* Isi menu dirakit SAAT DIBUKA dari data hidup: hanya kolom yang memang
   berbeda dari baris 1, beserta nilai baris 1 & jumlah baris yang
   berubah. Dipanggil dari klik tombolnya -- sebelum Bootstrap
   membukanya. */
function isiMenuSamakan() {
  const n = draftItems.length;
  const rencana = Object.keys(SAMAKAN_KOLOM).map(rencanaSamakan).filter(Boolean);
  const butir = rencana.length
    ? rencana
        .map(
          (r) => `<li><button type="button" class="dropdown-item samakan-menu-butir" data-samakan-kolom="${r.f}">
            <span class="samakan-menu-kolom">${escapeHtml(r.kol.label())}</span>
            <span class="samakan-menu-nilai">${escapeHtml(r.kol.tampil(draftItems[0]))}</span>
            <span class="samakan-menu-jumlah">${escapeHtml(tt(`${r.beda} baris`, `${r.beda} ${r.beda === 1 ? "row" : "rows"}`))}</span>
          </button></li>`,
        )
        .join("")
    : `<li><p class="samakan-menu-kosong">${escapeHtml(tt(`Isian ${rentangSamakan(n)} sudah sama dengan baris 1 (atau isian baris 1 masih kosong).`, `${rentangSamakan(n)} already match row 1 (or row 1 is still empty).`))}</p></li>`;
  samakanMenuIsiEl.innerHTML = `
    <li><h6 class="dropdown-header">${escapeHtml(tt(`Salin isian baris 1 ke ${rentangSamakan(n)}`, `Copy a row 1 field to ${rentangSamakan(n)}`))}</h6></li>
    ${butir}
    <li><hr class="dropdown-divider"></li>
    <li><p class="samakan-menu-tip">${escapeHtml(tt("Bisa diurungkan. Pintasan: Ctrl+D di kotak baris 1.", "Can be undone. Shortcut: Ctrl+D in a row 1 field."))}</p></li>`;
}

if (samakanMenuEl) {
  $("#btnSamakanMenu").addEventListener("click", isiMenuSamakan);
  samakanMenuIsiEl.addEventListener("click", (e) => {
    const butir = e.target.closest("[data-samakan-kolom]");
    if (butir) samakanAtasPermintaan(butir.dataset.samakanKolom);
  });
}

const itemTableBodySamakanEl = $("#itemTableBody");
if (itemTableBodySamakanEl) {
  // Isian baris 1 sebelum disunting (aturan "pintar")
  itemTableBodySamakanEl.addEventListener("focusin", (e) => {
    const k = kolomKotakSamakan(e.target);
    if (k && k.idx === 0) samakanAwal = { f: k.f, kunci: SAMAKAN_KOLOM[k.f].kunci(draftItems[0]) };
  });
  // Ctrl/⌘+D di kotak baris 1 = samakan kolom itu ke semua baris (seperti "isi ke bawah" Excel)
  itemTableBodySamakanEl.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== "d" && e.key !== "D")) return;
    const k = kolomKotakSamakan(e.target);
    if (!k || k.idx !== 0) return;
    e.preventDefault();
    // Kode negara yang baru diketik dibakukan dulu, seperti saat kotaknya ditinggalkan
    if (k.f === "negaraAsal" && typeof bakukanIsianNegara === "function") bakukanIsianNegara(e.target, 0);
    samakanAtasPermintaan(k.f);
  });
}

/* Tabel digambar ulang (baris bertambah / berkurang, hasil impor, ...):
   bunyi tawaran yang terbuka dibetulkan -- atau ditutup kalau baris 1
   sudah berganti isi / tak ada lagi yang perlu disamakan; Urungkan yang
   semua barangnya sudah tidak ada ikut pergi. Tidak pernah MEMBUKA
   tawaran -- itu hanya lewat tawarkanSamakan(). */
function perbaruiTawaranSamakan() {
  // Menu "Samakan baris 1" hanya bila ada baris lain
  if (samakanMenuEl) samakanMenuEl.hidden = draftItems.length < 2;
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
