"use strict";

/* KURS TERBARU DARI GOOGLE SHEET (sheet "KURS")

   Tabel kurs pajak tim ada di sebuah Google Sheet (nama mata uang +
   kode, Nilai, Perubahan; tanpa tanggal). Modul ini membacanya,
   menyimpan salinan terakhir di peramban, dan menyediakan pencarian &
   perbandingan per valuta.

   DIPAKAI HANYA DI DUA TEMPAT, dan keduanya atas perintah pengguna:
   1. Cek PIB/PEB (checker-view.js, cekBarisKurs): sisi "jadwal" baris
      NDPBM = kurs terbaru sheet ini.
   2. Tombol "Sync kurs terbaru" di form jadwal (form-router.js,
      syncKursKeForm) -- satu-satunya cara kurs sheet masuk ke jadwal.

   NDPBM yang tersimpan di jadwal TIDAK PERNAH berubah sendiri. Kurs
   bergerak tiap pekan; kalau jadwal ikut bergerak, Nilai Pabean serta
   BM/PPN/PPh jadwal lama berganti angka setiap kali dibuka. Laporan
   biaya juga tidak memakai modul ini: sheet tidak bertanggal, jadi tak
   bisa dipakai untuk kurs historis (kursNdpbm, customs.js, yang tetap
   mengambil NDPBM jadwal terdekat tanggalnya). */

const KURS_SHEET_ID = "1SpMXDVeQnG3z9VCBAAqV6s3vzN8slssA3eN3hqUYSaQ";
const KURS_SHEET_NAMA = "KURS";
const KURS_SHEET_GID = "2119005666";
const KURS_SHEET_URL = `https://docs.google.com/spreadsheets/d/${KURS_SHEET_ID}/edit?gid=${KURS_SHEET_GID}`;
const KURS_CACHE_KUNCI = "exim.kurs.sheet";
// Dianggap segar: pemeriksaan berturut-turut tidak mengunduh ulang. "Perbarui" selalu mengunduh.
const KURS_SEGAR_MS = 10 * 60 * 1000;
// Kurs pajak berganti tiap pekan: salinan lebih tua dari ini patut dicurigai
const KURS_BASI_MS = 8 * 24 * 60 * 60 * 1000;
const KURS_BATAS_WAKTU_MS = 8000;

const kursKeadaan = {
  data: null, // { daftar: [{ kode, nama, nilai, perubahan, sebelumnya, satuan, perSatuan }], diambilPada, dariCache, sumber }
  memuat: null, // janji unduhan yang sedang berjalan
  galat: "",
  pendengar: new Set(),
};

/* ---------- membaca angka & tabel ---------- */

/* Angka dari sel sheet. Sheet berlokal Indonesia: "18.141" = 18141,
   "13,6" = 13,6, "58.345,67" = 58345,67. Sel numerik gviz membawa angka
   aslinya (v) dan tidak lewat sini; ini untuk teks (CSV, sel teks).
   gaya "id": titik ribuan, koma desimal; "en": sebaliknya. Bila kedua
   pemisah ada, yang paling kanan desimal. Satu pemisah saja: ribuan
   hanya bila polanya kelompok tiga angka ("18.141", "1.234.567");
   selain itu desimal ("11502.49"). Panah turun / tanda minus = negatif. */
function kursAngka(v, gaya) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const teks = String(v);
  let s = teks.replace(/[^\d,.\-+]/g, "");
  if (!/\d/.test(s)) return null;
  const negatif = /^-/.test(s) || /[▼↓]|turun/i.test(teks);
  s = s.replace(/[-+]/g, "");
  const koma = gaya !== "en"; // true: koma desimal, titik ribuan
  const D = koma ? "," : ".";
  const R = koma ? "." : ",";
  const iD = s.lastIndexOf(D);
  const iR = s.lastIndexOf(R);
  if (iD >= 0 && iR >= 0) {
    if (iD > iR) s = s.split(R).join("").replace(D, ".");
    else s = s.split(D).join("").replace(R, ".");
  } else if (iD >= 0) {
    s = s.replace(D, ".");
  } else if (iR >= 0) {
    const ribuan = koma ? /^\d{1,3}(?:\.\d{3})+$/ : /^\d{1,3}(?:,\d{3})+$/;
    s = ribuan.test(s) ? s.split(R).join("") : s.replace(R, ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? (negatif ? -n : n) : null;
}

// Sel yang isinya HANYA angka (bukan nama mata uang yang kebetulan memuat angka)
const kursSelAngka = (teks) => /^[\s\-+▲▼↑↓]*[\d.,]*\d[\d.,]*[\s%]*$/.test(String(teks == null ? "" : teks));

/* Satu baris sheet -> { kode, nama, nilai, perubahan } atau null.
   Tata letak tidak diandalkan (baris judul sheet tidak baku): kode =
   "(USD)" di sel nama, atau sel yang berisi tiga huruf besar saja;
   Nilai = angka pertama sesudahnya, Perubahan = angka berikutnya. Angka
   di depan kode (kolom No) tidak dihitung. */
function kursBaris(sel, gaya) {
  const rata = (sel || []).map((c) => {
    if (c && typeof c === "object") return { teks: c.f != null ? String(c.f) : c.v == null ? "" : String(c.v), v: c.v };
    return { teks: c == null ? "" : String(c), v: c };
  });
  let iKode = -1;
  let kode = "";
  let nama = "";
  rata.forEach((c, i) => {
    if (kode) return;
    const m = /^(.*?)\(\s*([A-Z]{3})\s*\)/.exec(c.teks);
    if (m) {
      iKode = i;
      kode = m[2];
      nama = m[1].replace(/\s+/g, " ").trim();
    }
  });
  if (!kode) {
    rata.forEach((c, i) => {
      if (kode) return;
      if (/^[A-Z]{3}$/.test(c.teks.trim())) {
        iKode = i;
        kode = c.teks.trim();
        const sebelum = rata.slice(0, i).reverse().find((x) => x.teks.trim() && !kursSelAngka(x.teks));
        nama = sebelum ? sebelum.teks.replace(/\s+/g, " ").trim() : "";
      }
    });
  }
  if (!kode) return null;
  const angka = rata
    .slice(iKode + 1)
    .map((c) => (typeof c.v === "number" ? c.v : kursSelAngka(c.teks) ? kursAngka(c.teks, gaya) : null))
    .filter((n) => n != null);
  if (!angka.length || !(angka[0] > 0)) return null;
  return { kode, nama, nilai: angka[0], perubahan: angka.length > 1 ? angka[1] : null };
}

// 1 JPY = USD / 80..250 -> per 100 JPY = 0,4..1,25 USD. Sheet menulis JPY per 100; NDPBM CEISA per 1 satuan valuta.
function kursSatuan(kode, nilai, usd) {
  if (kode !== "JPY" || !(usd > 0)) return 1;
  return nilai > usd * 0.2 ? 100 : 1;
}

function kursSusun(mentah) {
  const usd = (mentah.find((r) => r.kode === "USD") || {}).nilai;
  return mentah.map((r) => {
    const satuan = kursSatuan(r.kode, r.nilai, usd);
    return Object.assign({}, r, {
      satuan,
      perSatuan: r.nilai / satuan,
      sebelumnya: r.perubahan == null ? null : Math.round((r.nilai - r.perubahan) * 100) / 100,
    });
  });
}

/* Baris-baris sheet -> daftar kurs. Dibaca dengan gaya Indonesia dulu;
   bila USD tidak masuk akal (bukan Rp 1.000-200.000), dicoba gaya
   Inggris. Tidak ada yang masuk akal -> null (jangan menebak kurs). */
function kursDariBaris(baris) {
  for (const gaya of ["id", "en"]) {
    const lihat = new Set();
    const daftar = [];
    (baris || []).forEach((sel) => {
      const r = kursBaris(sel, gaya);
      if (r && !lihat.has(r.kode)) {
        lihat.add(r.kode);
        daftar.push(r);
      }
    });
    const usd = daftar.find((r) => r.kode === "USD");
    if (daftar.length >= 3 && usd && usd.nilai >= 1000 && usd.nilai <= 200000) return kursSusun(daftar);
  }
  return null;
}

// Jawaban gviz JSON (dengan atau tanpa pembungkus setResponse / responseHandler) -> baris
function kursBarisDariJson(teksAtauObjek) {
  let obj = teksAtauObjek;
  if (typeof obj === "string") {
    const a = obj.indexOf("{");
    const b = obj.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("jawaban bukan JSON");
    obj = JSON.parse(obj.slice(a, b + 1));
  }
  if (!obj || obj.status === "error") {
    const e = obj && obj.errors && obj.errors[0];
    throw new Error((e && (e.detailed_message || e.message)) || "sheet menolak permintaan");
  }
  const tabel = obj.table;
  if (!tabel || !Array.isArray(tabel.rows)) throw new Error("tabel kosong");
  const kepala = (tabel.cols || []).map((c) => (c && c.label) || "");
  const baris = tabel.rows.map((r) => (r && r.c ? r.c : []));
  return kepala.some(Boolean) ? [kepala].concat(baris) : baris;
}

// CSV (RFC 4180: tanda kutip ganda, koma di dalam kutip, baris baru di dalam kutip) -> baris
function kursBarisDariCsv(teks) {
  const hasil = [];
  let baris = [];
  let sel = "";
  let kutip = false;
  const s = String(teks == null ? "" : teks).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (kutip) {
      if (c === '"' && s[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ",") {
      baris.push(sel);
      sel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      baris.push(sel);
      hasil.push(baris);
      baris = [];
      sel = "";
    } else sel += c;
  }
  if (sel !== "" || baris.length) {
    baris.push(sel);
    hasil.push(baris);
  }
  return hasil;
}

/* ---------- mengunduh ---------- */

function kursUrl(rujuk, format) {
  const acuan = rujuk === "gid" ? `gid=${KURS_SHEET_GID}` : `sheet=${encodeURIComponent(KURS_SHEET_NAMA)}`;
  return `https://docs.google.com/spreadsheets/d/${KURS_SHEET_ID}/gviz/tq?tqx=${encodeURIComponent(format)}&${acuan}`;
}

async function kursAmbilTeks(url) {
  const kendali = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => kendali && kendali.abort(), KURS_BATAS_WAKTU_MS);
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "omit", signal: kendali ? kendali.signal : undefined });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* JSONP: cadangan bila peramban menolak fetch lintas-asal. Google
   membungkus jawaban dengan nama fungsi yang kita minta (responseHandler). */
function kursJsonp(rujuk) {
  return new Promise((resolve, reject) => {
    const nama = "__kursJsonp" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const el = document.createElement("script");
    let selesai = false;
    const timer = setTimeout(() => beres(reject, new Error("waktu habis")), KURS_BATAS_WAKTU_MS + 1000);
    function beres(fn, arg) {
      if (selesai) return;
      selesai = true;
      clearTimeout(timer);
      try { delete window[nama]; } catch (e) { window[nama] = undefined; }
      if (el.parentNode) el.parentNode.removeChild(el);
      fn(arg);
    }
    window[nama] = (jawab) => beres(resolve, jawab);
    el.onerror = () => beres(reject, new Error("skrip tidak termuat"));
    el.async = true;
    el.src = kursUrl(rujuk, `out:json;responseHandler:${nama}`);
    document.head.appendChild(el);
  });
}

// Satu percobaan: { nama, ambil } -> daftar kurs (atau lempar galat)
function kursPercobaan() {
  const dariJson = (rujuk) => async () => kursDariBaris(kursBarisDariJson(await kursAmbilTeks(kursUrl(rujuk, "out:json"))));
  const dariJsonp = (rujuk) => async () => kursDariBaris(kursBarisDariJson(await kursJsonp(rujuk)));
  const dariCsv = (rujuk) => async () => kursDariBaris(kursBarisDariCsv(await kursAmbilTeks(kursUrl(rujuk, "out:csv"))));
  return [
    { nama: "json", ambil: dariJson("nama") },
    { nama: "jsonp", ambil: dariJsonp("nama") },
    { nama: "csv", ambil: dariCsv("nama") },
    { nama: "json-gid", ambil: dariJson("gid") },
  ];
}

/* ---------- simpanan & keadaan ---------- */

// Baris kurs dari simpanan / luar -> bentuk baku kursSusun (angka benar-benar angka)
const kursRapikanDaftar = (daftar) =>
  kursSusun(daftar.map((r) => ({ kode: r.kode, nama: r.nama || "", nilai: Number(r.nilai), perubahan: r.perubahan == null ? null : Number(r.perubahan) })));

function kursBacaCache() {
  try {
    const o = JSON.parse(localStorage.getItem(KURS_CACHE_KUNCI) || "null");
    if (!o || !Array.isArray(o.daftar) || !o.daftar.length || !(o.at > 0)) return null;
    const daftar = kursRapikanDaftar(o.daftar).filter((r) => r.kode && r.nilai > 0);
    return daftar.length ? { daftar, diambilPada: o.at, dariCache: true, sumber: "cache" } : null;
  } catch (e) {
    return null;
  }
}
function kursTulisCache(daftar, at) {
  try {
    localStorage.setItem(KURS_CACHE_KUNCI, JSON.stringify({ at, daftar: daftar.map((r) => ({ kode: r.kode, nama: r.nama, nilai: r.nilai, perubahan: r.perubahan })) }));
  } catch (e) { /* penyimpanan penuh / dimatikan: kurs tetap terpakai di memori */ }
}

function kursSiarkan() {
  kursKeadaan.pendengar.forEach((fn) => {
    try { fn(kursKeadaan); } catch (e) { console.error(e); }
  });
}
// Daftarkan pendengar perubahan kurs / status unduhan; mengembalikan fungsi pelepas
function kursPantau(fn) {
  kursKeadaan.pendengar.add(fn);
  return () => kursKeadaan.pendengar.delete(fn);
}

/* Pasang daftar kurs sebagai keadaan sekarang, tanpa unduhan -- pintu
   masuk qa/dom-test.js & harness tangkapan layar (kurs tetap, bukan dari
   Google Sheet). */
function kursPasang(daftar, opsi) {
  const o = opsi || {};
  kursKeadaan.data = daftar && daftar.length
    ? { daftar: kursRapikanDaftar(daftar), diambilPada: o.at || Date.now(), dariCache: !!o.dariCache, sumber: o.sumber || "manual" }
    : null;
  kursKeadaan.galat = "";
  kursSiarkan();
  return kursKeadaan.data;
}

/* Muat kurs. Hasil: { ok, dariCache, galat, data }.
   - Salinan yang baru diunduh (< KURS_SEGAR_MS) dipakai tanpa unduh ulang, kecuali { paksa: true }.
   - Unduhan gagal -> salinan terakhir (memori / peramban) dengan dariCache: true;
     tidak ada salinan -> ok: false. Pemanggil memutuskan apa yang dilakukan tanpa kurs. */
function kursMuat(opsi) {
  const o = opsi || {};
  const k = kursKeadaan;
  const hasil = (extra) => Object.assign({ ok: !!k.data, dariCache: !!(k.data && k.data.dariCache), galat: k.galat, data: k.data }, extra);
  if (!o.paksa && k.data && !k.data.dariCache && Date.now() - k.data.diambilPada < KURS_SEGAR_MS) return Promise.resolve(hasil());
  if (k.memuat) return k.memuat;
  if (typeof fetch !== "function") {
    // Tanpa jaringan sama sekali (mesin uji / peramban sangat lama): pakai salinan bila ada
    if (!k.data) kursKeadaan.data = kursBacaCache();
    k.galat = "Peramban ini tidak bisa mengunduh kurs.";
    return Promise.resolve(hasil());
  }
  k.galat = "";
  k.memuat = (async () => {
    const galat = [];
    for (const p of kursPercobaan()) {
      try {
        const daftar = await p.ambil();
        if (daftar && daftar.length) {
          const at = Date.now();
          kursTulisCache(daftar, at);
          k.data = { daftar, diambilPada: at, dariCache: false, sumber: p.nama };
          k.galat = "";
          return hasil();
        }
        galat.push(p.nama + ": tabel kurs tidak dikenali");
      } catch (e) {
        galat.push(p.nama + ": " + ((e && e.message) || e));
      }
    }
    k.galat = galat.join(" | ");
    if (!k.data) k.data = kursBacaCache();
    else k.data = Object.assign({}, k.data, { dariCache: true });
    return hasil();
  })().then(
    (r) => { k.memuat = null; kursSiarkan(); return r; },
    (e) => { k.memuat = null; k.galat = String((e && e.message) || e); kursSiarkan(); return hasil(); },
  );
  kursSiarkan(); // status "sedang memuat" untuk pendengar (pemutar di tombol / panel kurs)
  return k.memuat;
}

/* ---------- pencarian & perbandingan ---------- */

function kursCari(kode) {
  const k = String(kode == null ? "" : kode).trim().toUpperCase();
  if (!k || !kursKeadaan.data) return null;
  return kursKeadaan.data.daftar.find((r) => r.kode === k) || null;
}

// Kurs USD (Rp per 1 USD) bila ada -- yang disalin ke NDPBM jadwal (jadwal berhitung dalam USD)
function kursUsd() {
  const r = kursCari("USD");
  return r ? r.perSatuan : 0;
}

function kursAdaData() {
  return !!(kursKeadaan.data && kursKeadaan.data.daftar.length);
}

// Umur salinan dalam milidetik (null = tidak ada data)
function kursUmurMs() {
  return kursKeadaan.data ? Math.max(0, Date.now() - kursKeadaan.data.diambilPada) : null;
}
const kursBasi = () => {
  const u = kursUmurMs();
  return u != null && u > KURS_BASI_MS;
};

/* "baru saja", "35 menit lalu", "3 jam lalu", "2 hari lalu" */
function kursUmurTeks() {
  const u = kursUmurMs();
  if (u == null) return "";
  const menit = Math.floor(u / 60000);
  if (menit < 1) return tt("baru saja", "just now");
  if (menit < 60) return tt(`${menit} menit lalu`, `${menit} min ago`);
  const jam = Math.floor(menit / 60);
  if (jam < 24) return tt(`${jam} jam lalu`, `${jam} h ago`);
  const hari = Math.floor(jam / 24);
  return tt(`${hari} hari lalu`, `${hari} d ago`);
}

const kursFormat = (n) => angkaLokal(Number(n) || 0, "en-US", { maximumFractionDigits: 4 });

/* NDPBM draft vs kurs sheet untuk satu valuta. NDPBM selalu Rp per 1
   satuan valuta (Nilai Pabean = nilai valuta x NDPBM), jadi kurs sheet
   yang ditulis per 100 (JPY) dibagi dulu. Hasil:
   { ada: false, kode }  valuta tidak ada di sheet
   { ada, kode, harapan, mentah, satuan, selisih, sama, skalaMentah, kurs }
   skalaMentah: draft memakai angka per-100 apa adanya (salah skala). */
function kursBandingkan(ndpbmDraft, kode) {
  const k = String(kode == null ? "" : kode).trim().toUpperCase() || "USD";
  const draft = Number(ndpbmDraft);
  if (k === "IDR") {
    const selisih = Math.round((draft - 1) * 10000) / 10000;
    return { ada: true, kode: k, harapan: 1, mentah: 1, satuan: 1, selisih, sama: Number.isFinite(draft) && Math.abs(selisih) <= 1e-6, skalaMentah: false, kurs: null };
  }
  const r = kursCari(k);
  if (!r) return { ada: false, kode: k };
  const harapan = r.perSatuan;
  const toleransi = (harapan < 1 ? 0.005 : 0.01) + 1e-9;
  const selisih = Math.round((draft - harapan) * 10000) / 10000;
  return {
    ada: true,
    kode: k,
    harapan,
    mentah: r.nilai,
    satuan: r.satuan,
    selisih: Number.isFinite(selisih) ? selisih : null,
    sama: Number.isFinite(draft) && Math.abs(draft - harapan) <= toleransi,
    skalaMentah: r.satuan > 1 && Number.isFinite(draft) && Math.abs(draft - r.nilai) <= 0.01 + 1e-9,
    kurs: r,
  };
}
