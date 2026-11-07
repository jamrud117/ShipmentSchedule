"use strict";

/* ==================================================================
   PEMBARUAN LANGSUNG (REALTIME) -- simpanan pengguna lain tampil di
   layar tanpa memuat ulang halaman.

   Supabase Realtime mengabarkan setiap baris yang ditambah, diubah, atau
   dihapus di tabel yang didaftarkan migration-realtime.sql, langsung
   lewat WebSocket dari server Supabase ke peramban. GitHub Pages cukup
   menyajikan berkas aplikasinya; tidak ada server tambahan. Paket Free
   Supabase menyertakannya (200 koneksi bersamaan, 2 juta pesan sebulan).

   KABARNYA HANYA PEMICU, terutama untuk jadwal: barang & terminal
   transitnya ada di tabel lain, dan isi baris yang besar bisa terpotong
   di kabarnya. Jadwal yang dikabarkan diambil ulang SATU PER SATU
   (kueriShipments().in("id", ...)) -- bukan seluruh papan -- lalu
   dipasang di tempatnya, dan tampilan yang sedang dilihat digambar ulang
   dengan fokus & posisi gulir tetap (render(), render/list.js). Tabel
   lain memasang penangannya sendiri lewat realtimeDaftar() di berkasnya
   masing-masing (Nomor Dokumen & Pengajuan Dana, pengaturan, Masterlist,
   HS Code, Akun).

   SATU KANAL PER TABEL: tabel yang belum terdaftar (migrasinya belum
   dijalankan, atau tabelnya memang belum ada) hanya mematikan kanalnya
   sendiri, tidak semuanya.

   GEMA SENDIRI: perubahan dari tab ini ikut dikabarkan balik ke tab ini.
   Datanya sudah terpasang dari jawaban simpannya sendiri, jadi kabar
   untuk baris yang baru saja ditulis tab ini (realtimeCatatTulis,
   beberapa detik) dilewati.

   SIARAN "JADWAL TERSIMPAN": simpan form menulis jadwal, barang &
   terminal transit BERSAMAAN. Kabar baris jadwalnya bisa tiba sebelum
   barangnya selesai disisipkan -- yang terambil saat itu jadwal tanpa
   barang. Karena itu (1) pengambilan ulangnya ditunda sebentar
   (RT_JEDA.jadwal), dan (2) penulisnya menyiarkan id jadwal itu SESUDAH
   semuanya tersimpan (realtimeSiarkanJadwal); penerima mengambilnya
   sekali lagi. Siaran tidak pernah kembali ke pengirimnya, dan tidak
   pernah dilewati sebagai gema.

   SAMBUNG ULANG (laptop tidur, jaringan putus, tab lama di latar): kabar
   selama terputus hilang. Begitu kanalnya tersambung lagi, datanya
   dimuat ulang diam-diam -- tanpa kerangka muat, tanpa berkedip -- sama
   seperti tombol muat ulang yang dulu harus ditekan sendiri, tetapi
   hanya saat memang perlu.

   PENJAGA TERAKHIR TETAP DATABASE. Kabar realtime memperpendek jeda
   "layar basi" sampai kurang dari sedetik, tetapi dua orang yang
   menekan Simpan pada detik yang sama tetap dijaga database (nomor
   dokumen: next_document_number & constraint unik; tagihan ganda:
   pemicu dn_cegah_tagihan_ganda, migration-tagihan-ganda-dokumen.sql).
================================================================== */

const RT_TABEL = [
  "shipments",
  "document_numbers",
  "document_number_counters",
  "report_settings",
  "masterlists",
  "masterlist_items",
  "masterlist_usages",
  "hs_code_master",
  "profiles",
];
/* Jeda (ms). Objek, bukan konstanta lepas, supaya uji bisa memendekkannya. */
const RT_JEDA = {
  umum: 500, //            kabar beruntun digabung jadi satu penyegaran
  jadwal: 1200, //         jadwal: barang & terminal transitnya ditunggu ikut tersimpan
  maks: 4000, //           kabar yang terus berdatangan tetap disegarkan paling lambat sekian
  ulang: 5000, //          pengambilan yang gagal dicoba lagi sesudah sekian
  telat: 8000, //          kanal yang baru hidup sesudah sekian lama: anggap sambung ulang
  tulisSendiri: 8000, //   gema perubahan milik sendiri dilewati selama sekian
};
// Lebih dari sekian jadwal sekaligus (Bulk Import): muat ulang penuh, diam-diam
const RT_BATAS_TERTARGET = 40;
const RT_SIARAN_JADWAL = "jadwal-tersimpan";
// Kanal yang ditolak karena tabelnya belum terdaftar realtime (migrasi belum dijalankan)
const RT_POLA_BELUM_AKTIF = /RealtimeDisabledForConfiguration|not enabled|publication|does not exist|Unable to subscribe/i;

const rtPenangan = Object.create(null); // tabel -> [fn(kabar)]
const rtTulisSendiri = new Map(); // "tabel:id" -> kedaluwarsa (ms)
let rtSaluran = []; // [{ tabel, ch, hidup, pernahHidup, putus, galat, mulai }]
let rtPesanBelumAktif = false; // pemberitahuan "jalankan migration-realtime.sql" sekali per sesi

/* ---------- pendaftaran & gema sendiri ---------- */

/* Penangan kabar satu tabel. kabar = { tabel, jenis, baru, lama, id, utuh, sendiri }:
     jenis   "INSERT" | "UPDATE" | "DELETE" | "SAMBUNG" (kanal tersambung lagi:
             kabar selama terputus hilang -- muat ulang yang sedang dipakai)
     baru    isi baris sesudah berubah (INSERT/UPDATE), atau null
     lama    DELETE: kunci barisnya saja (RLS), atau null
     utuh    false = sebagian kolom terpotong di kabarnya; ambil ulang barisnya
     sendiri true = baris yang baru ditulis tab ini (realtimeCatatTulis) */
function realtimeDaftar(tabel, fn) {
  if (typeof fn !== "function") return;
  (rtPenangan[tabel] = rtPenangan[tabel] || []).push(fn);
}

const rtKunciTulis = (tabel, id) => `${tabel}:${id}`;
/* Dipanggil SEBELUM menulis: kabarnya bisa tiba lebih dulu daripada
   jawaban simpannya sendiri. */
function realtimeCatatTulis(tabel, ids, lamaMs) {
  const sampai = Date.now() + (lamaMs || RT_JEDA.tulisSendiri);
  [].concat(ids == null ? [] : ids).forEach((id) => {
    if (id != null && id !== "") rtTulisSendiri.set(rtKunciTulis(tabel, id), sampai);
  });
}
function realtimeTulisanSendiri(tabel, id) {
  const kunci = rtKunciTulis(tabel, id);
  const sampai = rtTulisSendiri.get(kunci);
  if (!sampai) return false;
  if (sampai < Date.now()) {
    rtTulisSendiri.delete(kunci);
    return false;
  }
  return true;
}

function rtKabar(tabel, p) {
  const isi = (o) => (o && typeof o === "object" && Object.keys(o).length ? o : null);
  const baru = isi(p && p.new);
  const lama = isi(p && p.old);
  const id = baru && baru.id != null ? baru.id : lama && lama.id != null ? lama.id : null;
  return {
    tabel,
    jenis: (p && p.eventType) || "",
    baru,
    lama,
    id,
    utuh: !(p && Array.isArray(p.errors) && p.errors.length),
    sendiri: id != null && realtimeTulisanSendiri(tabel, id),
  };
}
const rtKabarSambung = (tabel) => ({ tabel, jenis: "SAMBUNG", baru: null, lama: null, id: null, utuh: true, sendiri: false });

function rtSalurkan(tabel, kabar) {
  (rtPenangan[tabel] || []).forEach((fn) => {
    try {
      fn(kabar);
    } catch (e) {
      console.error(`Realtime ${tabel}:`, e);
    }
  });
}

/* Salinan daftar di memori dipasangi baris yang dikabarkan, tanpa memuat
   ulang seluruh daftarnya: baris = null -> dilepas. Baris baru masuk di
   depan (daftar pengajuan diurutkan terbaru dulu). Mengembalikan true
   kalau daftarnya berubah. */
function realtimePasangBaris(daftar, id, baris) {
  if (!Array.isArray(daftar) || id == null) return false;
  const i = daftar.findIndex((r) => r && String(r.id) === String(id));
  if (!baris) {
    if (i < 0) return false;
    daftar.splice(i, 1);
    return true;
  }
  if (i >= 0) daftar[i] = baris;
  else daftar.unshift(baris);
  return true;
}

/* MENGGAMBAR ULANG WADAH YANG MUNGKIN SEDANG DIPAKAI. Selagi ada pilihan
   (select) yang difokus atau menu yang terbuka di dalamnya, penggambaran
   ditunda sampai selesai dipakai -- daftar pilihan yang tertutup sendiri
   di tengah memilih membingungkan. Sesudahnya fokus kembali ke
   kembarannya (id / atribut data-*) dan posisi gulir wadahnya tetap. */
function realtimeGambarUlang(wadah, gambar, coba) {
  if (!wadah) return Promise.resolve(gambar());
  const aktif = document.activeElement;
  const dipakai =
    (aktif && wadah.contains(aktif) && aktif.tagName === "SELECT") ||
    !!wadah.querySelector(".dropdown-menu.show");
  if (dipakai && (coba || 0) < 30) {
    return new Promise((selesai) => setTimeout(() => selesai(realtimeGambarUlang(wadah, gambar, (coba || 0) + 1)), 1000));
  }
  let kunci = null;
  if (aktif && aktif !== document.body && wadah.contains(aktif)) {
    kunci = typeof kunciFokus === "function" ? kunciFokus(aktif) : null;
    if (!kunci) {
      const atribut = [...aktif.attributes].filter((a) => /^data-/.test(a.name) && a.value.length < 200);
      if (atribut.length) kunci = aktif.tagName.toLowerCase() + atribut.map((a) => `[${a.name}="${String(a.value).replace(/["\\]/g, "\\$&")}"]`).join("");
    }
  }
  const gulir = wadah.scrollTop;
  return Promise.resolve(gambar()).then((hasil) => {
    wadah.scrollTop = gulir;
    const hilang = !document.activeElement || document.activeElement === document.body;
    if (kunci && hilang) {
      let el = null;
      try {
        el = wadah.querySelector(kunci);
      } catch (e) {
        el = null;
      }
      if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
    }
    return hasil;
  });
}

/* ---------- kanal ---------- */

function realtimeTersedia() {
  return typeof supabaseClient !== "undefined" && !!supabaseClient && typeof supabaseClient.channel === "function";
}

/* Dipanggil sesudah masuk & jadwal pertama dimuat (initApp, handleLoginSubmit).
   Panggilan kedua tidak membuka kanal baru. */
function realtimeMulai() {
  if (rtSaluran.length || !realtimeTersedia()) return false;
  rtSaluran = RT_TABEL.map((tabel) => {
    const sal = { tabel, ch: null, hidup: false, pernahHidup: false, putus: false, galat: "", mulai: Date.now() };
    try {
      /* wait: SUBSCRIBED baru dilaporkan sesudah server benar-benar
         mengalirkan perubahan tabelnya -- tabel yang belum terdaftar
         realtime dilaporkan sebagai CHANNEL_ERROR, bukan diam saja. */
      let ch = supabaseClient.channel(`muatan-${tabel}`, { config: { postgres_changes_options: { wait: true } } });
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: tabel }, (p) => rtSalurkan(tabel, rtKabar(tabel, p)));
      if (tabel === "shipments") ch = ch.on("broadcast", { event: RT_SIARAN_JADWAL }, (pesan) => rtTerimaSiaranJadwal(pesan && pesan.payload));
      sal.ch = ch;
      ch.subscribe((status, err) => rtStatusSaluran(sal, status, err));
    } catch (e) {
      sal.galat = String((e && e.message) || e);
      console.error(`Realtime ${tabel}:`, e);
    }
    return sal;
  });
  rtGambarStatus();
  return true;
}

// Keluar / sesi berakhir: semua kanal ditutup
function realtimeBerhenti() {
  const lama = rtSaluran;
  rtSaluran = [];
  lama.forEach((sal) => {
    try {
      if (sal.ch) supabaseClient.removeChannel(sal.ch);
    } catch (e) {
      /* kanal yang sudah putus tidak perlu ditutup lagi */
    }
  });
  rtTulisSendiri.clear();
  clearTimeout(rtJadwalTunda);
  rtJadwalTunda = null;
  rtJadwalAntre.clear();
  rtJadwalHapus.clear();
  rtGambarStatus();
}

function rtStatusSaluran(sal, status, err) {
  if (rtSaluran.indexOf(sal) < 0) return; // sudah dihentikan
  if (status === "SUBSCRIBED") {
    /* Tersambung LAGI -- atau baru tersambung jauh sesudah datanya dimuat
       (percobaan pertamanya gagal): kabar di antaranya tidak pernah sampai. */
    const sambungLagi = sal.pernahHidup ? sal.putus : Date.now() - sal.mulai > RT_JEDA.telat;
    sal.hidup = true;
    sal.pernahHidup = true;
    sal.putus = false;
    sal.galat = "";
    if (sambungLagi) rtSalurkan(sal.tabel, rtKabarSambung(sal.tabel));
  } else {
    sal.hidup = false;
    sal.putus = true;
    if (err) sal.galat = String(err.message || err);
    if (status === "CHANNEL_ERROR" && sal.galat) console.warn(`Realtime ${sal.tabel}: ${sal.galat}`);
  }
  rtGambarStatus();
}

/* Keadaan untuk menu akun:
     aktif       semua kanal tersambung
     sebagian    sebagian tabel belum terdaftar realtime (belum = daftar tabelnya)
     belum-aktif tidak satu pun tabel terdaftar -- migration-realtime.sql belum dijalankan
     menyambung  sedang membuka / menyambung ulang
     mati        belum dimulai (belum masuk) */
function realtimeKeadaan() {
  if (!rtSaluran.length) return { kode: "mati", belum: [] };
  const belum = rtSaluran.filter((s) => !s.hidup && RT_POLA_BELUM_AKTIF.test(s.galat)).map((s) => s.tabel);
  const hidup = rtSaluran.filter((s) => s.hidup).length;
  if (hidup === rtSaluran.length) return { kode: "aktif", belum: [] };
  if (belum.length === rtSaluran.length) return { kode: "belum-aktif", belum };
  if (belum.length && hidup + belum.length === rtSaluran.length) return { kode: "sebagian", belum };
  return { kode: "menyambung", belum };
}

function rtGambarStatus() {
  const k = realtimeKeadaan();
  const el = document.getElementById("rtStatus");
  if (el) {
    const TEKS = {
      aktif: [tt("Aktif", "On"), tt("Simpanan pengguna lain langsung tampil, tanpa memuat ulang halaman.", "Other users' saves appear right away, without reloading the page.")],
      sebagian: [
        tt("Aktif sebagian", "Partly on"),
        tt(`Belum terdaftar realtime: ${k.belum.join(", ")}. Jalankan migration-realtime.sql di Supabase (aman diulang).`,
          `Not registered for realtime yet: ${k.belum.join(", ")}. Run migration-realtime.sql in Supabase (safe to re-run).`),
      ],
      "belum-aktif": [
        tt("Belum aktif", "Not enabled"),
        tt("Jalankan migration-realtime.sql di Supabase (SQL Editor), lalu muat ulang halaman sekali.", "Run migration-realtime.sql in Supabase (SQL Editor), then reload the page once."),
      ],
      menyambung: [tt("Menyambung…", "Connecting…"), tt("Sambungan pembaruan langsung sedang dibuka atau disambung ulang.", "The live-update connection is opening or reconnecting.")],
      mati: [tt("Tidak aktif", "Off"), tt("Pembaruan langsung berjalan sesudah masuk.", "Live updates start after signing in.")],
    };
    const [teks, ket] = TEKS[k.kode];
    el.dataset.rt = k.kode;
    el.title = ket;
    const label = el.querySelector(".rt-teks");
    if (label) label.textContent = teks;
  }
  /* EXIM yang memasang aplikasinya diberi tahu SEKALI per sesi bahwa
     migrasinya belum dijalankan -- peran lain tidak bisa berbuat apa-apa. */
  if (k.kode === "belum-aktif" && !rtPesanBelumAktif && typeof canEdit === "function" && canEdit() && typeof showToast === "function") {
    rtPesanBelumAktif = true;
    showToast(
      tt("Pembaruan langsung belum aktif: jalankan migration-realtime.sql di Supabase (SQL Editor) sekali saja. Sampai itu, data pengguna lain baru terlihat sesudah memuat ulang halaman.",
        "Live updates are not enabled yet: run migration-realtime.sql in Supabase (SQL Editor) once. Until then, other users' data only shows after reloading the page."),
      "warning",
    );
  }
}

/* ---------- jadwal (shipments) ---------- */

const rtJadwalAntre = new Map(); // String(id) -> id: diambil ulang
const rtJadwalHapus = new Map(); // String(id) -> id: dikabarkan terhapus
let rtJadwalTunda = null;
let rtJadwalPertama = 0; // kabar tertua yang belum diproses -- batas RT_JEDA.maks
let rtJadwalJalan = false;
let rtJadwalPenuh = false;

/* opsi: { jeda, hapus: true (ids terhapus), penuh: true (muat ulang semua) } */
function rtAntreJadwal(ids, opsi) {
  const o = opsi || {};
  [].concat(ids == null ? [] : ids).forEach((id) => {
    if (id == null || id === "") return;
    if (o.hapus) {
      rtJadwalHapus.set(String(id), id);
      rtJadwalAntre.delete(String(id));
    } else if (!rtJadwalHapus.has(String(id))) {
      rtJadwalAntre.set(String(id), id);
    }
  });
  if (o.penuh) rtJadwalPenuh = true;
  if (!rtJadwalAntre.size && !rtJadwalHapus.size && !rtJadwalPenuh) return;
  const kini = Date.now();
  if (!rtJadwalPertama) rtJadwalPertama = kini;
  const jeda = Math.max(0, Math.min(o.jeda == null ? RT_JEDA.jadwal : o.jeda, rtJadwalPertama + RT_JEDA.maks - kini));
  clearTimeout(rtJadwalTunda);
  rtJadwalTunda = setTimeout(rtProsesJadwal, jeda);
}

realtimeDaftar("shipments", (k) => {
  if (k.jenis === "SAMBUNG") return rtAntreJadwal([], { penuh: true, jeda: 0 });
  if (k.id == null) return;
  // Terhapus: cukup dilepas dari papan, tidak perlu diambil
  if (k.jenis === "DELETE") return rtAntreJadwal([k.id], { hapus: true, jeda: RT_JEDA.umum });
  if (k.sendiri) return;
  rtAntreJadwal([k.id]);
});

function rtTerimaSiaranJadwal(isi) {
  if (!isi) return;
  if (isi.penuh) return rtAntreJadwal([], { penuh: true, jeda: RT_JEDA.umum });
  const ids = Array.isArray(isi.ids) ? isi.ids : [];
  if (ids.length) rtAntreJadwal(ids, { jeda: RT_JEDA.umum });
}

/* Dipanggil penulis SESUDAH jadwal, barang & terminal transitnya semua
   tersimpan (createShipment, updateShipmentRecord, Bulk Import). Gagal
   menyiarkan tidak apa-apa: kabar baris jadwalnya tetap sampai. */
function realtimeSiarkanJadwal(ids) {
  const daftar = [].concat(ids == null ? [] : ids).filter((x) => x != null && x !== "");
  if (!daftar.length) return;
  // Kabar baris jadwalnya sendiri masih bisa menyusul sesudah ini
  realtimeCatatTulis("shipments", daftar, 4000);
  const sal = rtSaluran.find((s) => s.tabel === "shipments" && s.ch);
  if (!sal) return;
  try {
    const kirim = sal.ch.send({
      type: "broadcast",
      event: RT_SIARAN_JADWAL,
      payload: daftar.length > RT_BATAS_TERTARGET ? { penuh: true } : { ids: daftar },
    });
    if (kirim && typeof kirim.catch === "function") kirim.catch(() => {});
  } catch (e) {
    /* siaran hanya pelengkap */
  }
}

// Id jadwal yang sedang dibuka di form Ubah, atau null
function rtIdFormJadwal() {
  if ((document.documentElement.dataset.halaman || "") !== "form") return null;
  const m = /^#\/edit\/(.+)$/.exec(location.hash || "");
  return m ? decodeURIComponent(m[1]) : null;
}
const rtCariJadwal = (id) =>
  ["import", "export"].map((m) => (data[m] || []).find((x) => String(x.id) === String(id))).find(Boolean) || null;
const rtSidikJadwal = (id) => {
  const s = rtCariJadwal(id);
  return s ? JSON.stringify(s) : "";
};

async function rtProsesJadwal() {
  clearTimeout(rtJadwalTunda);
  rtJadwalTunda = null;
  if (!rtJadwalAntre.size && !rtJadwalHapus.size && !rtJadwalPenuh) return;
  if (rtJadwalJalan) {
    rtJadwalTunda = setTimeout(rtProsesJadwal, RT_JEDA.umum);
    return;
  }
  // Papan belum pernah termuat (muat pertama gagal): yang dimuat nanti sudah memuat perubahannya
  if (typeof shipmentsLoaded !== "undefined" && !shipmentsLoaded && muatSelesai === muatKe) {
    rtJadwalAntre.clear();
    rtJadwalHapus.clear();
    rtJadwalPenuh = false;
    rtJadwalPertama = 0;
    return;
  }
  /* Muat penuh sedang di jalan: jawabannya bisa LEBIH TUA daripada kabar
     ini dan akan menimpa hasil pengambilan ulang -- ditunggu dulu. */
  if (muatSelesai !== muatKe) {
    rtJadwalTunda = setTimeout(rtProsesJadwal, RT_JEDA.umum);
    return;
  }
  const ids = [...rtJadwalAntre.values()];
  const hapus = [...rtJadwalHapus.values()];
  const penuh = rtJadwalPenuh || ids.length > RT_BATAS_TERTARGET;
  rtJadwalAntre.clear();
  rtJadwalHapus.clear();
  rtJadwalPenuh = false;
  rtJadwalPertama = 0;
  rtJadwalJalan = true;
  try {
    if (penuh) await rtMuatUlangJadwal();
    else await rtAmbilJadwal(ids, hapus);
  } catch (e) {
    console.error("Realtime jadwal:", e);
  } finally {
    rtJadwalJalan = false;
  }
}

/* Jadwal yang dikabarkan diambil ulang lengkap dengan barang & terminal
   transitnya, lalu dipasang di tempatnya. Yang diminta tapi tidak kembali
   sudah dihapus (atau tidak boleh dibaca lagi): dilepas dari papan. */
async function rtAmbilJadwal(ids, hapus) {
  let rows = [];
  if (ids.length) {
    const { data: hasil, error } = await kueriShipments().in("id", ids);
    if (error) {
      console.error(error);
      rtAntreJadwal(ids, { jeda: RT_JEDA.ulang });
      return;
    }
    rows = hasil || [];
  }
  // Muat penuh yang dimulai selagi ini berjalan memuat versi yang sama atau lebih baru
  if (muatSelesai !== muatKe) return;
  const kembali = new Set(rows.map((r) => String(r.id)));
  const berubah = new Set();
  hapus.concat(ids.filter((id) => !kembali.has(String(id)))).forEach((id) => {
    ["import", "export"].forEach((m) => {
      const i = (data[m] || []).findIndex((x) => String(x.id) === String(id));
      if (i >= 0) {
        data[m].splice(i, 1);
        berubah.add(String(id));
      }
    });
  });
  for (const row of rows) {
    if (!data[row.mode]) continue;
    let s;
    try {
      s = rowToShipment(row);
    } catch (e) {
      console.error(e);
      return rtAntreJadwal([], { penuh: true, jeda: 0 });
    }
    let terpasang = false;
    ["import", "export"].forEach((m) => {
      const i = data[m].findIndex((x) => String(x.id) === String(s.id));
      if (i < 0) return;
      if (m === row.mode) {
        data[m][i] = s;
        terpasang = true;
      } else {
        data[m].splice(i, 1);
      }
    });
    if (!terpasang) data[row.mode].push(s); // jadwal baru: created_at terbaru, urutan muat tetap
    berubah.add(String(s.id));
  }
  if (!berubah.size) return;
  selaraskanPrediksi();
  rtSegarkanTampilanJadwal(berubah, false);
}

/* Muat ulang penuh tanpa kerangka muat (sambung ulang, Bulk Import).
   Form yang sedang terbuka dibandingkan sebelum & sesudahnya. */
async function rtMuatUlangJadwal() {
  const idForm = rtIdFormJadwal();
  const sebelum = idForm != null ? rtSidikJadwal(idForm) : "";
  await loadShipments({ diam: true });
  const berubah = new Set();
  if (idForm != null && rtSidikJadwal(idForm) !== sebelum) berubah.add(String(idForm));
  rtSegarkanTampilanJadwal(berubah, true);
}

/* Tampilan yang sedang dilihat ikut data terbaru. penuh = muat ulang
   penuh (papan sudah digambar loadShipments, semua jadwal dianggap berubah). */
function rtSegarkanTampilanJadwal(berubah, penuh) {
  const halaman = document.documentElement.dataset.halaman || "schedule";
  const kena = (id) => penuh || berubah.has(String(id));
  if (!penuh) {
    // Papan: fokus & posisi gulir dipertahankan render(); halaman lain cukup lonceng notifikasinya
    if (halaman === "schedule" && typeof render === "function") render();
    else if (typeof jadwalkanNotif === "function") jadwalkanNotif();
  }
  if (halaman === "overview" && typeof renderOverview === "function") renderOverview();
  // Halaman Nomor Dokumen: daftar pilihan jadwal (Surat Jalan, CIPL) & No. AJU (Surat BC)
  if (halaman === "docnum") {
    if (typeof isiPilihanJadwal === "function") isiPilihanJadwal();
    if (typeof isiPilihanAju === "function") isiPilihanAju();
  }
  if (typeof isDetailOpen === "function" && isDetailOpen() && currentDetailId != null && kena(currentDetailId) && typeof segarkanDetailView === "function") {
    segarkanDetailView();
  }
  const idForm = rtIdFormJadwal();
  if (idForm != null && berubah.has(String(idForm)) && typeof tandaiFormDiubahLain === "function") {
    tandaiFormDiubahLain(idForm, !rtCariJadwal(idForm));
  }
}

/* ---------- pengaturan (report_settings) ---------- */

/* Satu baris kecil per kunci, dimuat ulang oleh pemiliknya -- bukan
   seluruh tabel. Pengaturan halaman Nomor Dokumen hanya bila halaman
   itu sedang dilihat: halaman itu memuat ulang semuanya tiap dibuka
   (showDocNumView). SKB PPh bawaan dipakai juga form jadwal & lonceng
   notifikasi -- selalu. */
const rtDiDocNum = () => document.documentElement.dataset.halaman === "docnum";
// Kunci-kuncinya milik berkas yang dimuat SESUDAH berkas ini: dibaca saat kabarnya datang
const RT_PENGATURAN = [
  {
    kunci: () => (typeof FUND_INVOICE_KUNCI !== "undefined" ? FUND_INVOICE_KUNCI : null),
    muat: () => rtDiDocNum() && typeof fundInvoiceMuat === "function" && fundInvoiceMuat(),
  },
  {
    kunci: () => (typeof FUND_DOCNO_KUNCI !== "undefined" ? FUND_DOCNO_KUNCI : null),
    muat: () => rtDiDocNum() && typeof fundDocNoMuat === "function" && fundDocNoMuat(),
  },
  {
    kunci: () => (typeof FUND_VENDOR_KUNCI !== "undefined" ? FUND_VENDOR_KUNCI : null),
    muat: () => rtDiDocNum() && typeof fundVendorMuat === "function" && fundVendorMuat(),
  },
  {
    kunci: () => (typeof INV_CUSTOMER_KUNCI !== "undefined" ? INV_CUSTOMER_KUNCI : null),
    muat: () => rtDiDocNum() && typeof invCustomerMuat === "function" && invCustomerMuat(),
  },
  {
    kunci: () => (typeof SKB_BAWAAN_KUNCI !== "undefined" ? SKB_BAWAAN_KUNCI : null),
    muat: () =>
      typeof skbBawaanMuat === "function" &&
      Promise.resolve(skbBawaanMuat()).then(() => typeof jadwalkanNotif === "function" && jadwalkanNotif()),
  },
  // Anggaran Report per tahun ("anggaran-biaya-angkut-2026")
  { cocok: (k) => /^anggaran-biaya-angkut-/.test(k), muat: (k) => typeof lapSegarkanAnggaran === "function" && lapSegarkanAnggaran(k) },
];
const rtPengaturanTunda = new Map(); // kunci -> pewaktu
realtimeDaftar("report_settings", (k) => {
  const semua = k.jenis === "SAMBUNG";
  const kunci = semua ? null : String((k.baru && k.baru.key) || (k.lama && k.lama.key) || "");
  if (!semua && !kunci) return;
  RT_PENGATURAN.forEach((p, i) => {
    const kena = semua || (p.cocok ? p.cocok(kunci) : p.kunci() === kunci);
    if (!kena) return;
    const id = `${i}:${semua ? "*" : kunci}`;
    clearTimeout(rtPengaturanTunda.get(id));
    rtPengaturanTunda.set(
      id,
      setTimeout(() => {
        rtPengaturanTunda.delete(id);
        try {
          const janji = p.muat(semua ? "" : kunci);
          if (janji && typeof janji.catch === "function") janji.catch((e) => console.error(e));
        } catch (e) {
          console.error(e);
        }
      }, RT_JEDA.umum),
    );
  });
});

/* ---------- tab kembali dilihat ---------- */

/* Kanal yang putus selama tab di latar sedang disambung ulang oleh
   pustakanya sendiri; yang perlu di sini hanya menggambar keadaannya. */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") rtGambarStatus();
});
