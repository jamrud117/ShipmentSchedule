"use strict";

/* ==================================================================
   PEMBACAAN MILESTONE

   Satu-satunya tempat yang tahu bagaimana progres dokumen dibaca dari
   `doc_progress`. Lapis lain memanggil ke sini, tidak pernah menyentuh
   strukturnya langsung — menambah milestone baru cukup satu baris di
   PREDICTION_CONFIG.milestones tanpa menyentuh berkas ini.
==================================================================== */

/* ==================================================================
   MILESTONE

   Tanggal yang dipakai adalah tanggal DOKUMEN (entri `date`) kalau ada,
   bukan tanggal konfirmasi. Keduanya sering berbeda beberapa hari:
   SPPB terbit Jumat sore, dicentang Senin pagi. Prediksi yang memakai
   hari Senin akan menggeser seluruh rantai dua hari terlalu jauh.

   Entri lama yang belum punya `date` jatuh kembali ke tanggal
   konfirmasi — tetap terbaca, tanpa migrasi data.

   Entri DRAFT (doc-steps.js: draft disetujui, aslinya ditunggu) bukan
   milestone: PIB draft belum diajukan, jadi belum ada yang berjalan di
   Bea Cukai.
================================================================== */

function predictionDocProgress(s) {
  const p = s && s.docProgress;
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}
function milestoneDateOf(s, stepKey) {
  const e = predictionDocProgress(s)[stepKey];
  if (!e || e.skipped || e.draft) return "";
  if (e.date) return e.date;
  if (e.at) return String(e.at).slice(0, 10);
  return "";
}

/* ------------------------------------------------------------------
   JALUR PENGELUARAN BARANG (SPPJ) — MITA / Hijau / Merah

   Dicatat pada konfirmasi PIB, Billing, atau SPPB (doc-steps.js) --
   jalur keluar beberapa saat setelah PIB diajukan, jadi pengguna bisa
   mengisinya di tahap mana pun yang sedang ia konfirmasi. Yang dibaca
   yang paling awal di alur. Kunci di luar PREDICTION_CONFIG.customsLanes
   (mis. "kuning" dari data lama) diabaikan.
------------------------------------------------------------------ */
const TAHAP_PENCATAT_JALUR = ["pib", "billing", "sppb"];

function jalurOf(s) {
  const p = predictionDocProgress(s);
  const sah = (PREDICTION_CONFIG.customsLanes || []).map((l) => l.key);
  for (let i = 0; i < TAHAP_PENCATAT_JALUR.length; i++) {
    const e = p[TAHAP_PENCATAT_JALUR[i]];
    if (e && !e.skipped && !e.draft && e.jalur && sah.indexOf(e.jalur) >= 0) return e.jalur;
  }
  return "";
}

function jalurInfo(key) {
  return (PREDICTION_CONFIG.customsLanes || []).find((l) => l.key === key) || null;
}

/* ------------------------------------------------------------------
   KIRIMAN SEKAPAL

   Satu kapal (nama + voyage) membawa beberapa kiriman sekaligus --
   konsolidasi LCL, beberapa pemasok, beberapa PIB. Begitu SATU di
   antaranya dikonfirmasi Sandar, seluruh kiriman lain di kapal itu
   ikut tiba pada hari yang sama, walau tahapnya belum dicentang.
   Begitu pula BC 1.1: satu manifest per kedatangan kapal.

   Syaratnya ketat, karena nama kapal saja bisa menipu:
     - moda & pelabuhan tujuan sama, keduanya bukan rute Transit
       (pada transshipment kapal di dokumen bisa kapal kaki pertama);
     - laut: nama kapal sama, lalu voyage sama (ETD selisih <= 21 hari)
       -- atau, kalau voyage tidak diisi, ETD selisih <= 4 hari;
     - udara: nomor penerbangan sama & ETD selisih <= 1 hari;
     - bukan kurir (FEDEX/DHL/UPS bukan nama kapal);
     - tanggalnya masuk akal: tidak sebelum ETD kiriman ini, dan tidak
       lebih dari 10 hari dari ETA-nya.
------------------------------------------------------------------ */
const KAPAL_BUKAN_NAMA = ["TBA", "TBN", "TBC", "NIL", "NONE", "VESSEL", "KAPAL", "FEEDER"];
const AWALAN_KAPAL = ["MV", "KM", "KMP", "MT", "SS"];

function kunciKapalTeks(teks) {
  const kata = String(teks || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  // "M/V EVER GIVEN" -> "M V EVER GIVEN": pasangan M + V ikut dibuang
  if (kata.length > 2 && kata[0] === "M" && kata[1] === "V") kata.splice(0, 2);
  while (kata.length > 1 && AWALAN_KAPAL.indexOf(kata[0]) >= 0) kata.shift();
  const nama = kata.join(" ");
  return nama.length >= 3 && /[A-Z]/.test(nama) && KAPAL_BUKAN_NAMA.indexOf(nama) < 0 ? nama : "";
}

function kunciVoyageTeks(teks) {
  return String(teks || "")
    .toUpperCase()
    .replace(/^\s*(VOYAGE|VOY|V)[\s.:#-]*/, "")
    .replace(/[^A-Z0-9]/g, "");
}

const KUNCI_SEKAPAL = new WeakMap();
function kunciSekapal(s) {
  if (!s || typeof s !== "object") return null;
  const gen = typeof GENERASI_BELAJAR !== "undefined" ? GENERASI_BELAJAR : 0;
  const ada = KUNCI_SEKAPAL.get(s);
  if (ada && ada.gen === gen) return ada.k;

  let k = null;
  const udara = s.transport === "udara";
  const kurir = typeof isKurirEkspres === "function" && (isKurirEkspres(s.vessel) || isKurirEkspres(s.forwarder));
  const tujuan = typeof resolvePortCode === "function" ? resolvePortCode(s.destination) : "";
  const kapal = kunciKapalTeks(s.vessel);
  const voyage = kunciVoyageTeks(s.voyage);
  const etd = s.etdUpdate || s.etd || "";
  // Export: tidak ada bukti kedatangan di pelabuhan tujuan untuk dibagi
  const etdHari = etd ? nomorHariISO(etd) : null;
  if (s.mode !== "export" && !kurir && tujuan && etdHari != null && s.routeType !== "transit" && (udara ? voyage.length >= 3 : kapal)) {
    k = { udara, tujuan, kapal, voyage, etd, etdHari, grup: (udara ? "U|" + voyage : "L|" + kapal) + "|" + tujuan };
  }
  KUNCI_SEKAPAL.set(s, { gen, k });
  return k;
}

function sekapalCocok(ka, kb) {
  const jarak = Math.abs(kb.etdHari - ka.etdHari);
  if (ka.udara) return ka.voyage === kb.voyage && jarak <= 1;
  if (ka.voyage && kb.voyage) return ka.voyage === kb.voyage && jarak <= 21;
  return jarak <= 4;
}

/* Manifest yang menandai KEDATANGAN: hanya di buku Import. Manifest di
   buku Export adalah outward manifest -- diajukan saat kapal BERANGKAT
   dari Indonesia, jadi memakainya sebagai tanggal tiba di pelabuhan
   tujuan membuat lama transit ekspor terbaca nyaris nol hari. */
function manifestKedatangan(s) {
  return s && s.mode !== "export" ? milestoneDateOf(s, "manifest") : "";
}

/* Bukti kedatangan MILIK kiriman itu sendiri -- tanpa kapal lain. */
function buktiKedatanganSendiri(s) {
  if (s.ata) return { date: s.ata, confirmed: true };
  const berth = milestoneDateOf(s, "berth");
  if (berth) return { date: berth, confirmed: true };
  const manifest = manifestKedatangan(s);
  return manifest ? { date: manifest, confirmed: false } : null;
}

/* Indeks kiriman yang punya bukti kedatangan, per kelompok kapal.

   Dibangun sekali per generasi data. Riwayat yang sedang berlaku
   (predictionHistory) disusun ulang tiap dipanggil, jadi indeksnya
   disimpan per generasi; daftar lain -- riwayat tiruan uji, riwayat
   penuh uji mundur (RIWAYAT_PENUH_UJI) -- per identitas daftarnya. */
const INDEKS_SEKAPAL = new WeakMap();
const INDEKS_SEKAPAL_HIDUP = { gen: -1, peta: null };

function susunIndeksSekapal(daftar) {
  const peta = new Map();
  (daftar || []).forEach((s) => {
    const k = kunciSekapal(s);
    const bukti = k && buktiKedatanganSendiri(s);
    const hari = bukti && nomorHariISO(bukti.date);
    if (hari == null) return;
    if (!peta.has(k.grup)) peta.set(k.grup, []);
    peta.get(k.grup).push({ s, k, bukti, hari });
  });
  return peta;
}

function indeksSekapal(daftar) {
  const gen = typeof GENERASI_BELAJAR !== "undefined" ? GENERASI_BELAJAR : 0;
  const tiruan =
    daftar ||
    (typeof RIWAYAT_PENUH_UJI !== "undefined" && RIWAYAT_PENUH_UJI) ||
    (typeof PREDICTION_HISTORY_OVERRIDE !== "undefined" ? PREDICTION_HISTORY_OVERRIDE : null);
  if (tiruan) {
    const ada = INDEKS_SEKAPAL.get(tiruan);
    if (ada && ada.gen === gen) return ada.peta;
    const peta = susunIndeksSekapal(tiruan);
    INDEKS_SEKAPAL.set(tiruan, { gen, peta });
    return peta;
  }
  if (INDEKS_SEKAPAL_HIDUP.peta && INDEKS_SEKAPAL_HIDUP.gen === gen) return INDEKS_SEKAPAL_HIDUP.peta;
  INDEKS_SEKAPAL_HIDUP.peta = susunIndeksSekapal(typeof predictionHistory === "function" ? predictionHistory() : []);
  INDEKS_SEKAPAL_HIDUP.gen = gen;
  return INDEKS_SEKAPAL_HIDUP.peta;
}

/* Kedatangan menurut kiriman lain di kapal yang sama, atau null.
   { date, confirmed } -- `confirmed` = ada yang sudah Sandar/ATA;
   kalau baru Manifest, `date` tanggal BC 1.1-nya.

   `daftar`: riwayat yang boleh dibaca. Tanpa `daftar` (perkiraan untuk
   kiriman yang sedang dihitung) yang dibaca riwayat yang berlaku, dan
   selama uji mundur hanya bukti yang SUDAH ADA pada tanggal acuannya
   (PREDICTION_LEARN_ASOF) -- kapal yang sandar sesudah ETD kiriman
   yang diuji tidak boleh ikut bicara. */
const HASIL_SEKAPAL = new WeakMap();
function kedatanganSekapal(s, daftar) {
  const k = kunciSekapal(s);
  if (!k) return null;
  const peta = indeksSekapal(daftar);
  const kelompok = peta.get(k.grup);
  if (!kelompok) return null;
  const batas = !daftar && typeof PREDICTION_LEARN_ASOF !== "undefined" ? PREDICTION_LEARN_ASOF : null;
  const etaSendiri = s.etaUpdate || s.eta || "";
  // Satu prediksi membaca kedatangan beberapa kali: hasilnya disimpan per keadaan yang sama
  const simpan = HASIL_SEKAPAL.get(s);
  if (simpan && simpan.peta === peta && simpan.batas === batas && simpan.eta === etaSendiri) return simpan.hasil;
  const hariEta = etaSendiri ? nomorHariISO(etaSendiri) : null;
  const hariBatas = batas ? nomorHariISO(batas) : null;
  const cocok = kelompok.filter((x) => {
    if (x.s === s || (s.id && x.s.id === s.id) || !sekapalCocok(k, x.k)) return false;
    if (x.hari < k.etdHari || (hariBatas != null && x.hari >= hariBatas)) return false;
    return hariEta == null || Math.abs(x.hari - hariEta) <= 10;
  });
  const hasil = cocok.length ? pilihKedatanganSekapal(cocok) : null;
  HASIL_SEKAPAL.set(s, { peta, batas, eta: etaSendiri, hasil });
  return hasil;
}

function pilihKedatanganSekapal(cocok) {
  const pasti = cocok.filter((x) => x.bukti.confirmed);
  const pilih = pasti.length ? pasti : cocok;
  // Tanggal yang paling sering disebut; seri -> yang paling awal
  const hitung = new Map();
  pilih.forEach((x) => hitung.set(x.bukti.date, (hitung.get(x.bukti.date) || 0) + 1));
  const tanggal = [...hitung.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  return { date: tanggal, confirmed: pasti.length > 0 };
}

/* Jeda BC 1.1 -> kapal benar-benar sandar, dalam hari kalender. BC 1.1
   wajib diserahkan paling lambat 24 jam SEBELUM kapal tiba (laut) atau
   sebelum pesawat mendarat (udara), jadi tanggal Manifest hampir selalu
   lebih awal dari kedatangan. Angkanya dipelajari dari kiriman yang
   punya keduanya (learnedManifestLagDays, prediction-learning.js);
   tanpa riwayat memakai PREDICTION_CONFIG.arrival.manifestLeadDays. */
function jedaManifestHari(tipe) {
  if (typeof learnedManifestLagDays === "function") {
    const b = learnedManifestLagDays(tipe);
    if (b && b.cukup) return b.days;
  }
  const peta = (PREDICTION_CONFIG.arrival && PREDICTION_CONFIG.arrival.manifestLeadDays) || {};
  const n = peta[tipe] != null ? peta[tipe] : peta.default;
  return Math.max(0, Math.round(Number(n) || 0));
}

/* BUKTI KEDATANGAN TERCATAT — tanpa ETA. Dipakai mesin delivery
   (arrivalInfoOf), lapis belajar, uji mundur, dan statistik delay:
     ata / berth   fakta milik kiriman ini
     sekapal       Sandar/ATA kiriman lain di kapal yang sama
     manifest      BC 1.1 (milik sendiri atau kapal yang sama) + jeda
   null kalau belum ada bukti apa pun. `daftar` diteruskan ke
   kedatanganSekapal. */
function kedatanganTercatat(s, daftar) {
  if (!s) return null;
  if (s.ata) return { date: s.ata, kind: "ata", confirmed: true };
  const berth = milestoneDateOf(s, "berth");
  if (berth) return { date: berth, kind: "berth", confirmed: true };
  const kakak = kedatanganSekapal(s, daftar);
  if (kakak && kakak.confirmed) return { date: kakak.date, kind: "sekapal", confirmed: true };
  const manifestSendiri = manifestKedatangan(s);
  const manifest = manifestSendiri || (kakak ? kakak.date : "");
  if (!manifest) return null;
  const jeda = jedaManifestHari(predictionShipmentType(s));
  return {
    date: addCalendarDaysISO(manifest, jeda),
    kind: "manifest",
    confirmed: false,
    jeda,
    // Manifest milik kiriman lain di kapal yang sama
    sekapal: !manifestSendiri,
  };
}

// Milestone paling meyakinkan yang sudah dikonfirmasi (urutan dari konfigurasi).
function highestMilestoneOf(s) {
  const daftar = PREDICTION_CONFIG.milestones || [];
  for (let i = 0; i < daftar.length; i++) {
    const m = daftar[i];
    const tgl = milestoneDateOf(s, m.step);
    if (tgl) return { milestone: m, date: tgl };
  }
  return null;
}
/* SISA MILESTONE yang belum dikonfirmasi, urut alur kepabeanan.
   Diminta tampil di layar: "apa lagi yang kurang". */

function remainingMilestonesOf(s) {
  const urut = ["berth", "manifest", "pib", "billing", "sppb"];
  return urut
    .map((k) => (PREDICTION_CONFIG.milestones || []).find((m) => m.key === k))
    .filter(Boolean)
    .filter((m) => !milestoneDateOf(s, m.step))
    .map((m) => ({ key: m.key, label: m.label }));
}
const PREDICTION_SOURCE_LABEL = {
  get actual() { return tt("In Factory (Aktual)", "In Factory (Actual)"); },
  sppb: "SPPB",
  pib: "PIB",
  manifest: "Manifest",
  eta: "ETA",
  billing: "Billing BC 2.0",
  berth: "ATA",
  get today() { return tt("Hari Ini", "Today"); },
  get manual() { return tt("Diisi Manual", "Entered Manually"); },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    milestoneDateOf,
    highestMilestoneOf,
    remainingMilestonesOf,
    jalurOf,
    kedatanganSekapal,
    kedatanganTercatat,
  };
}
