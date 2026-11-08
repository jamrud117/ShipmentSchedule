"use strict";

/* ==================================================================
   PEMILIH ATURAN

   Satu-satunya tempat yang tahu BAGAIMANA aturan dicocokkan dan
   diperingkat. prediction-config.js memuat angkanya; berkas ini
   memutuskan angka mana yang dipakai.

   Dipisah supaya menambah rute, carrier, atau dimensi pencocokan baru
   tidak pernah menuntut perubahan logika — cukup menambah bobot di
   PREDICTION_MATCH_WEIGHTS dan kunci di `match`.
==================================================================== */

/* ==================================================================
   RENTANG HARI

   Menerima 11 maupun [8, 12] dan selalu mengembalikan bentuk yang sama,
   supaya sisa mesin tidak perlu tahu mana yang dipakai di konfigurasi.
================================================================== */
/* Mengambil nilai transit dari sebuah aturan.

   Nilainya boleh dua bentuk:

     { direct: 11, transit: 14 }   dibedakan menurut Tipe Rute
     10  atau  [8, 12]             berlaku apa pun Tipe Rutenya

   Bentuk kedua ada karena untuk LAUT pengguna memang TIDAK TAHU
   kapalnya langsung atau transshipment — itu urusan pelayaran, tidak
   tertulis di dokumen mana pun yang mereka pegang. Memaksa memilih
   hanya menghasilkan tebakan yang lalu diperlakukan sebagai fakta.

   Kolom Tipe Rute tetap ada karena dipakai visualisasi jalur
   pengiriman; ia cuma tidak lagi WAJIB bagi prediksi. */
function pickRouteValue(perTipe, routeType) {
  if (perTipe == null) return undefined;
  if (typeof perTipe === "number" || Array.isArray(perTipe)) return perTipe;
  if (typeof perTipe === "object") {
    if (perTipe[routeType] != null) return perTipe[routeType];
    if (perTipe.any != null) return perTipe.any;
  }
  return undefined;
}

function normalizeDayRange(v) {
  if (Array.isArray(v)) {
    const a = Number(v[0]) || 0;
    const b = v[1] == null ? a : Number(v[1]) || 0;
    const min = Math.max(0, Math.min(a, b));
    const max = Math.max(0, Math.max(a, b));
    return { min, max, hasRange: max > min };
  }
  const n = Math.max(0, Number(v) || 0);
  return { min: n, max: n, hasRange: false };
}

/* Satu angka yang dipakai menuliskan tanggal ETA. Lihat catatan
   PREDICTION_CONFIG.planning di atas soal pilihan kebijakannya. */
function planningDayValue(range, policy) {
  const p = policy || (PREDICTION_CONFIG.planning || {}).transitEstimate || "mid";
  if (!range.hasRange) return range.min;
  if (p === "min") return range.min;
  if (p === "max") return range.max;
  return Math.ceil((range.min + range.max) / 2);
}

/* ==================================================================
   PEMILIH ATURAN

   Aturan yang dipilih adalah yang PALING RINCI di antara yang cocok.
   Bobotnya mencerminkan seberapa sempit sebuah kunci mempersempit
   pencarian: satu pelabuhan jauh lebih spesifik daripada satu negara.

   Kalau ada kunci di `match` yang TIDAK cocok, aturannya gugur
   seluruhnya (skor -1) — bukan sekadar kehilangan poin. Aturan "Korea →
   Indonesia" tidak boleh ikut terpakai untuk kiriman dari Cina hanya
   karena tujuannya kebetulan sama.
================================================================== */
/* Bobot menentukan URUTAN PRIORITAS pencarian lama transit:

     Rute Carrier   (pelabuhan + carrier)  8 + 8 + 5 = 21
     Rute Pelabuhan (pelabuhan saja)       8 + 8     = 16
     Rute Negara                           3 + 3     = 6
     Bawaan global                                     0

   Carrier sengaja diberi bobot lebih kecil daripada pelabuhan: "MSC
   dari Busan" harus mengalahkan "Busan (pelayaran mana pun)", tapi
   "MSC dari mana saja" tidak boleh mengalahkan rute pelabuhan yang
   memang sudah diketahui angkanya. */
const PREDICTION_MATCH_WEIGHTS = {
  fromPort: 8,
  toPort: 8,
  carrier: 5,
  service: 2,
  forwarder: 4,
  fromCountry: 3,
  toCountry: 3,
  transport: 1,
};

/* Daftar nilai `match` dalam huruf besar, sebagai Set -- dibuat SEKALI
   per daftar (identitas array). predictionMatchScore dipanggil per aturan
   per kiriman tiap papan digambar; toUpperCase() untuk tiap anggota
   daftar pada tiap panggilan (daftar negara Eropa 21 anggota) dulu bagian
   terberat dari menggambar papan. */
const PILIHAN_HURUF_BESAR = new WeakMap();
function pilihanHurufBesar(daftar) {
  let set = PILIHAN_HURUF_BESAR.get(daftar);
  if (!set) {
    set = new Set(daftar.map((v) => String(v).toUpperCase()));
    PILIHAN_HURUF_BESAR.set(daftar, set);
  }
  return set;
}

function predictionMatchScore(match, ctx) {
  const m = match || {};
  let skor = 0;

  /* `for...in`, bukan Object.keys(): yang kedua mengalokasikan array
     kunci pada TIAP pemanggilan — dan fungsi ini dipanggil sekali per
     aturan, per kartu, tiap papan digambar ulang. */
  for (const k in m) {
    const diminta = m[k];
    if (diminta == null || diminta === "") continue;

    const punya = ctx[k];
    let cocok;

    /* Satu kunci boleh berisi DAFTAR nilai:

         fromPort: ["SHA", "NGB"]

       Satu kota kerap punya beberapa kode — Tianjin ditulis CNTXG di
       satu dokumen dan CNTSN di dokumen lain — dan beberapa pelabuhan
       memang berbagi angka transit yang sama persis. Menulisnya sebagai
       daftar jauh lebih terbaca daripada menyalin aturan yang sama
       berkali-kali, dan yang lebih penting: tidak ada salinan yang bisa
       tertinggal saat angkanya diperbarui. */
    const pilihan = Array.isArray(diminta) ? diminta : [diminta];

    if (k === "forwarder") {
      // Nama forwarder ditulis bebas, jadi dicocokkan sebagian.
      const a = String(punya || "").toLowerCase();
      cocok =
        !!a &&
        pilihan.some((v) => {
          const b = String(v || "").toLowerCase();
          return !!b && a.includes(b);
        });
    } else if ((k === "fromPort" || k === "toPort") && ctx[k === "fromPort" ? "fromMetro" : "toMetro"]) {
      /* Pelabuhan dicocokkan juga lewat INDUKNYA: aturan "SZX" berlaku
         untuk Shekou & Yantian, aturan "SGN" untuk Cat Lai -- terminal
         yang punya kode sendiri tapi lama pelayarannya sama. */
      const induk = ctx[k === "fromPort" ? "fromMetro" : "toMetro"];
      const a = String(punya || "").toUpperCase();
      const b = String(induk).toUpperCase();
      if (Array.isArray(diminta)) {
        const set = pilihanHurufBesar(diminta);
        cocok = set.has(a) || set.has(b);
      } else {
        const x = String(diminta).toUpperCase();
        cocok = x === a || x === b;
      }
    } else if (typeof punya === "string" && !Array.isArray(diminta)) {
      /* Jalur cepat: kode pelabuhan, negara, dan carrier sudah huruf
         besar di kedua sisi. Perbandingan langsung dulu — toUpperCase()
         mengalokasikan string baru, dan di sini hampir selalu
         menghasilkan teks yang sama persis dengan asalnya. */
      cocok =
        punya === diminta ||
        punya.toUpperCase() === String(diminta).toUpperCase();
    } else if (Array.isArray(diminta)) {
      // Kode di konteks sudah huruf besar: coba apa adanya dulu, tanpa membuat string baru
      const set = pilihanHurufBesar(diminta);
      cocok = typeof punya === "string" && set.has(punya) ? true : set.has(String(punya || "").toUpperCase());
    } else {
      cocok = String(punya || "").toUpperCase() === String(diminta).toUpperCase();
    }

    if (!cocok) return -1;
    skor += PREDICTION_MATCH_WEIGHTS[k] || 1;
  }
  return skor;
}

/* SELURUH aturan yang cocok, diurutkan dari yang paling rinci.

   Bukan cuma yang teratas, karena aturan yang paling rinci belum tentu
   punya angka untuk kombinasi yang dicari. Tabel per-pelabuhan hanya
   memuat FCL, dan sebagian rutenya hanya punya angka Transit — tidak
   ada Direct. Kalau pencarian berhenti di aturan teratas, kiriman LCL
   dari Shanghai akan mendapat "0 hari transit" hanya karena aturan
   Shanghai kebetulan tidak menyebut LCL.

   Dengan daftar berperingkat, pencarinya turun satu tingkat ke aturan
   negara yang memang punya angkanya. Yang rinci dipakai kalau ada;
   yang umum menambal sisanya.

   Kalau skornya seri, yang lebih dulu tertulis yang menang — jadi
   urutan di berkas ini tetap bermakna. */
function rankPredictionRules(rules, ctx) {
  return rankPredictionRulesBerskor(rules, ctx).map((x) => x.r);
}

/* Sama dengan rankPredictionRules(), dengan skornya: [{ r, skor, i }]. */
function rankPredictionRulesBerskor(rules, ctx) {
  /* Satu lintasan, dan hanya yang COCOK yang dialokasikan.

     Membuat objek pembungkus untuk SELURUH aturan —
     tiga puluh objek per kartu — lalu membuang hampir semuanya di
     tahap filter. Yang cocok biasanya cuma dua atau tiga. */
  const daftar = rules || [];
  const cocok = [];
  for (let i = 0; i < daftar.length; i++) {
    const skor = predictionMatchScore(daftar[i].match, ctx);
    if (skor >= 0) cocok.push({ r: daftar[i], skor, i });
  }
  if (cocok.length > 1) cocok.sort((a, b) => b.skor - a.skor || a.i - b.i);
  return cocok;
}

/* ==================================================================
   ATURAN RUTE DUA ARAH

   Tabel rute ditulis per arah IMPOR -- "Busan → Tanjung Priok",
   "Korea → Indonesia" -- karena itulah angka yang diberikan forwarder.
   Kiriman EKSPOR ke arah sebaliknya (Priok → Busan) dulu tidak cocok
   dengan satu aturan pun dan jatuh ke angka bawaan 14 hari: ekspor ke
   Singapura (±2 hari) diperkirakan dua minggu, ke Manzanillo (±32 hari)
   juga dua minggu.

   Kapal yang sama melayani kedua arah, jadi angka arah sebaliknya jauh
   lebih dekat ke kenyataan daripada angka bawaan. Aturan dicocokkan
   juga terhadap konteks yang DIBALIK (asal <-> tujuan), dengan skor
   dikurangi setengah: aturan searah yang sama rincinya selalu menang,
   dan aturan arah sebaliknya hanya mengisi yang memang kosong.

   Yang tidak ikut dibalik: aturan cadangan (`match: {}`) -- ia sudah
   berlaku ke dua arah -- dan aturan bertanda `searah: true`.

   Beda putaran pelayaran antara dua arah (rute ke utara kerap singgah
   lebih banyak) ditangkap lapis belajar dari riwayat ekspor sendiri
   (prediction-learning.js), bukan ditebak di sini.
================================================================== */
/* Hanya kunci yang dibaca pencocokan aturan (PREDICTION_MATCH_WEIGHTS +
   pelabuhan induk) -- konteks lengkapnya puluhan kunci, dan ini dibuat
   sekali per kiriman tiap papan digambar. */
function balikKonteksRute(ctx) {
  return {
    fromPort: ctx.toPort,
    toPort: ctx.fromPort,
    fromMetro: ctx.toMetro,
    toMetro: ctx.fromMetro,
    fromCountry: ctx.toCountry,
    toCountry: ctx.fromCountry,
    carrier: ctx.carrier,
    service: ctx.service,
    forwarder: ctx.forwarder,
    transport: ctx.transport,
  };
}

/* [{ r, skor, i, balik }] berperingkat; `balik` = cocok lewat arah
   sebaliknya. */
function rankRouteRules(rules, ctx) {
  const maju = rankPredictionRulesBerskor(rules, ctx).map((x) => ({ r: x.r, skor: x.skor, i: x.i, balik: false }));
  if (!ctx || (!ctx.fromPort && !ctx.fromCountry) || (!ctx.toPort && !ctx.toCountry)) return maju;
  const balik = rankPredictionRulesBerskor(rules, balikKonteksRute(ctx))
    .filter((x) => !x.r.searah && x.r.match && Object.keys(x.r.match).length > 0)
    .map((x) => ({ r: x.r, skor: x.skor - 0.5, i: x.i, balik: true }));
  if (!balik.length) return maju;
  return maju.concat(balik).sort((a, b) => b.skor - a.skor || a.balik - b.balik || a.i - b.i);
}

function pickPredictionRule(rules, ctx) {
  return rankPredictionRules(rules, ctx)[0] || null;
}
