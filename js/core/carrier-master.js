"use strict";

/* ==================================================================
   MASTER CARRIER & DETEKSI OTOMATIS

   Pengguna tidak pernah memilih carrier. Ia dibaca dari kolom yang
   memang sudah diisi:

     laut   Nama Kapal + No. Voyage   "MSC LORENA" 056S  -> MSC
     udara  No. Penerbangan           "KE627"            -> Korean Air

   KENAPA TIDAK DIJADIKAN DROPDOWN. Daftar pelayaran panjang dan
   berubah-ubah, sementara nama kapal SUDAH diketik untuk keperluan
   lain. Menambah satu kolom lagi berarti menambah satu kolom lagi yang
   bisa lupa diisi — dan prediksi yang bergantung pada kolom kosong
   diam-diam turun ke angka rata-rata.

   SELURUH ALIAS ADA DI BERKAS INI, bukan di logika pencocokannya.
   Menambah pelayaran atau maskapai baru cukup menambah satu baris.
================================================================== */

const CARRIER_MASTER = {
  /* ----------------------------------------------------------------
     KURIR / EKSPEDISI

     Untuk kiriman kurir, kolom Nama Kapal TIDAK berisi nama kapal —
     berisi nama perusahaannya: PRIME, WIDE, DHL, FEDEX, UPS.

     Dicek PALING DULU, dan HANYA dari kolom Nama Kapal.

     Sengaja tidak dari kolom Forwarder: di riwayat DDI, PRIME muncul
     sebagai forwarder pada 70 kiriman — termasuk kiriman LAUT dengan
     kapal HAIAN OPUS. Membaca kolom itu akan menandai kiriman laut
     sebagai kurir, lalu memakai asumsi waktu yang sama sekali berbeda.
  ---------------------------------------------------------------- */
  couriers: [
    { code: "PRIME", name: "Prime Express", aliases: ["PRIME"] },
    { code: "WIDE", name: "Wide Express", aliases: ["WIDE"] },
    { code: "DHL", name: "DHL Express", aliases: ["DHL"] },
    { code: "FEDEX", name: "FedEx Express", aliases: ["FEDEX", "FEDERAL EXPRESS", "FRDERAL EXPRESS"] },
    { code: "UPS", name: "UPS Express", aliases: ["UPS"] },
    { code: "TNT", name: "TNT Express", aliases: ["TNT"] },
  ],

  /* ----------------------------------------------------------------
     PELAYARAN — dicocokkan dengan NAMA KAPAL

     `aliases` dicocokkan sebagai KATA UTUH, dan kata pertama nama kapal
     diperiksa lebih dulu. Nama kapal hampir selalu diawali nama
     operatornya ("MSC LORENA", "EVER GIVEN", "MAERSK HANOI").

     Pencocokan kata utuh penting: alias "ONE" yang dicocokkan sebagai
     potongan teks biasa akan ikut menangkap "STONE", "MILESTONE",
     "LONE STAR".
  ---------------------------------------------------------------- */
  shippingLines: [
    { code: "MSC", name: "Mediterranean Shipping Company", aliases: ["MSC"] },
    { code: "MAERSK", name: "Maersk Line", aliases: ["MAERSK", "MSK"] },
    { code: "EVERGREEN", name: "Evergreen Marine", aliases: ["EVER", "EMC", "EVERGREEN"] },
    { code: "ONE", name: "Ocean Network Express", aliases: ["ONE"] },
    /* Deretan kapal "XIN <kota>" (XIN QIN HUANG DAO, XIN BEIJING)
       memakai penamaan COSCO. Muncul di riwayat DDI. */
    { code: "COSCO", name: "COSCO Shipping", aliases: ["COSCO", "XIN"] },
    { code: "HMM", name: "HMM (Hyundai Merchant Marine)", aliases: ["HMM", "HYUNDAI"] },
    { code: "CMA", name: "CMA CGM", aliases: ["CMA", "APL"] },
    { code: "OOCL", name: "Orient Overseas Container Line", aliases: ["OOCL"] },
    { code: "YANGMING", name: "Yang Ming Marine", aliases: ["YM", "YANG", "YANGMING"] },
    { code: "HAPAG", name: "Hapag-Lloyd", aliases: ["HAPAG", "HLC"] },
    { code: "ZIM", name: "ZIM Integrated Shipping", aliases: ["ZIM"] },

    /* Pelayaran intra-Asia — yang paling sering muncul di rute
       Korea/China/Vietnam ke Indonesia. */
    { code: "KMTC", name: "KMTC Line", aliases: ["KMTC"] },
    { code: "SITC", name: "SITC Container Lines", aliases: ["SITC"] },
    { code: "SINOKOR", name: "Sinokor Merchant Marine", aliases: ["SINOKOR", "SKR"] },
    { code: "NAMSUNG", name: "Namsung Shipping", aliases: ["NAMSUNG", "STARSHIP"] },
    { code: "PIL", name: "Pacific International Lines", aliases: ["PIL", "KOTA"] },
    { code: "WANHAI", name: "Wan Hai Lines", aliases: ["WAN", "WANHAI"] },
    { code: "TSLINES", name: "TS Lines", aliases: ["TS", "TSL"] },
    /* RCL menamai banyak kapalnya dengan awalan SAWASDEE. Silakan
       dicek ulang kalau di dokumen Anda tertulis operator lain. */
    { code: "RCL", name: "Regional Container Lines", aliases: ["RCL", "SAWASDEE"] },
    { code: "HAIAN", name: "Hai An Transport", aliases: ["HAIAN", "HAI"] },
    { code: "HEUNGA", name: "Heung-A Line", aliases: ["HEUNG", "HEUNGA"] },

    /* DERETAN "… VOYAGER" — QINGDAO, TIANJIN, CHENNAI, KWANGYANG,
       PORT KLANG, HOCHIMINH, JAKARTA, YEOSU VOYAGER.

       Delapan kapal berbeda, 13 kiriman di riwayat DDI, pola penamaan
       yang jelas satu armada. Operatornya BELUM DIPASTIKAN, jadi
       namanya ditulis apa adanya — bukan ditebak.

       Gunanya tetap besar: tanpa pengelompokan ini, ketiga belas
       kiriman itu jadi delapan kelompok berisi satu-dua sampel dan
       tidak akan pernah cukup untuk dipelajari. Dikelompokkan, mereka
       jadi satu riwayat yang bermakna.

       Begitu operatornya diketahui, ganti `name` dan `code` di sini. */
    {
      code: "VOYAGER-SERIES",
      name: 'Deretan kapal "… VOYAGER" (operator belum dipastikan)',
      aliases: [],
      suffix: ["VOYAGER", "VOYAGE"],
    },
    { code: "SPIL", name: "Salam Pacific Indonesia Lines", aliases: ["SPIL"] },
    { code: "TEMAS", name: "Temas Line", aliases: ["TEMAS"] },
  ],

  /* ----------------------------------------------------------------
     MASKAPAI — dicocokkan dengan AWALAN NO. PENERBANGAN

     Diperiksa 3 huruf dulu, baru 2. Sebagian kode memuat angka (3U,
     9W), jadi polanya tidak bisa "dua huruf" saja.
  ---------------------------------------------------------------- */
  airlines: [
    { code: "KE", name: "Korean Air", aliases: ["KOREAN AIR"] },
    { code: "OZ", name: "Asiana Airlines" },
    { code: "VN", name: "Vietnam Airlines" },
    { code: "CI", name: "China Airlines" },
    { code: "BR", name: "EVA Air" },
    { code: "MU", name: "China Eastern" },
    { code: "CZ", name: "China Southern" },
    { code: "CA", name: "Air China" },
    { code: "SQ", name: "Singapore Airlines", aliases: ["SINGAPORE AIRLINES"] },
    { code: "CX", name: "Cathay Pacific" },
    { code: "JL", name: "Japan Airlines" },
    { code: "NH", name: "All Nippon Airways" },
    { code: "GA", name: "Garuda Indonesia", aliases: ["GARUDA"] },
    { code: "JT", name: "Lion Air" },
    { code: "QZ", name: "Indonesia AirAsia" },
    { code: "TG", name: "Thai Airways" },
    { code: "MH", name: "Malaysia Airlines" },
    { code: "EK", name: "Emirates" },
    { code: "QR", name: "Qatar Airways" },
    { code: "TK", name: "Turkish Airlines" },
    { code: "SU", name: "Aeroflot" },
    { code: "AM", name: "Aeromexico" },

    /* KARGO & KURIR — muncul di riwayat nyata DDI, dan sebelumnya
       tidak satu pun terdeteksi. Kurir sering ditulis dengan NAMA,
       bukan kode ("FEDEX", "DHL FLIGHT"), jadi ditambahi `aliases`. */
    { code: "FX", name: "FedEx Express", aliases: ["FEDEX", "FEDERAL EXPRESS"] },
    { code: "5X", name: "UPS Airlines", aliases: ["UPS"] },
    { code: "D0", name: "DHL Air", aliases: ["DHL"] },
    { code: "KZ", name: "Nippon Cargo Airlines", aliases: ["NIPPON CARGO"] },
    { code: "CV", name: "Cargolux", aliases: ["CARGOLUX"] },
    { code: "TW", name: "T'way Air" },
    { code: "7C", name: "Jeju Air" },
    { code: "TR", name: "Scoot" },
    { code: "LJ", name: "Jin Air" },
  ],
};

/* ------------------------------------------------------------------
   INDEKS SIAP PAKAI

   Alias dinormalkan SEKALI saat berkas dimuat, bukan tiap kali sebuah
   nama kapal dicocokkan. Sebelumnya tiap pencocokan menjalankan satu
   regex per alias per pelayaran — sekitar seratus regex untuk satu
   kapal, dikali jumlah kartu di papan, dikali tiap kali papan
   digambar ulang.

   Urutan daftar tetap dihormati: yang tertulis lebih dulu menang,
   sama seperti sebelumnya.
------------------------------------------------------------------ */
function siapkanAlias(daftar) {
  daftar.forEach((x) => {
    x._alias = (x.aliases || []).map(normalisasiTeksKapal).filter(Boolean);
    x._suffix = (x.suffix || []).map(normalisasiTeksKapal).filter(Boolean);
  });
  return daftar;
}

/* ------------------------------------------------------------------
   PENCOCOKAN NAMA KAPAL
------------------------------------------------------------------ */
function normalisasiTeksKapal(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/* Membuang nomor voyage di ujung nama kapal.

   "QINGDAO VOYAGER/2604S", "PORT KLANG VOYAGE 2511S", "HMM MIRACLE
   0009S" — nomornya menempel dengan berbagai gaya, dan ia bukan bagian
   dari nama armadanya. */
function bersihkanNamaKapal(teks) {
  const kata = teks.split(" ").filter(Boolean);
  /* "V.126S" jadi dua kata setelah dinormalkan — "V" dan "126S" —
     jadi penanda voyage yang berdiri sendiri ikut dibuang. */
  while (
    kata.length > 1 &&
    /^(?:V\d{2,5}[A-Z]?|\d{2,5}[A-Z]?|V|VOY)$/.test(kata[kata.length - 1])
  ) {
    kata.pop();
  }
  return kata;
}

function detectShippingLine(vesselName) {
  const teks = normalisasiTeksKapal(vesselName);
  if (!teks) return null;
  const kata = bersihkanNamaKapal(teks);

  /* Kata PERTAMA lebih dulu. "EVER GIVEN" harus terbaca Evergreen,
     bukan tertangkap alias lain yang kebetulan muncul belakangan. */
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    if (line._alias.indexOf(kata[0]) >= 0) {
      return { code: line.code, name: line.name, alias: kata[0], via: "kata pertama" };
    }
  }

  // Baru kata utuh di mana pun. Bukan potongan teks — "ONE" tidak
  // boleh tertangkap dari "MILESTONE".
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    const cocok = line._alias.find((a) => kata.indexOf(a) >= 0);
    if (cocok) {
      return { code: line.code, name: line.name, alias: cocok, via: "kata dalam nama" };
    }
  }

  /* AKHIRAN NAMA — untuk armada yang dikenali dari kata terakhirnya.
     Diperiksa paling belakang supaya tidak pernah mengalahkan alias
     operator yang sebenarnya. */
  const terakhir = kata[kata.length - 1] || "";
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    const cocok = line._suffix.find(
      (sfx) => terakhir === sfx || terakhir.endsWith(sfx),
    );
    if (cocok) {
      return { code: line.code, name: line.name, alias: cocok, via: "akhiran nama kapal" };
    }
  }
  return null;
}

/* Kurir dicocokkan sebagai KATA UTUH di Nama Kapal. */
function detectCourier(vesselName) {
  const kata = normalisasiTeksKapal(vesselName).split(" ").filter(Boolean);
  if (!kata.length) return null;
  const rapat = " " + kata.join(" ") + " ";
  for (let i = 0; i < CARRIER_MASTER.couriers.length; i++) {
    const c = CARRIER_MASTER.couriers[i];
    const cocok = c._alias.find((a) => rapat.indexOf(" " + a + " ") >= 0);
    if (cocok) return { code: c.code, name: c.name, alias: cocok, via: "nama perusahaan kurir" };
  }
  return null;
}

/* ------------------------------------------------------------------
   PENCOCOKAN NO. PENERBANGAN
------------------------------------------------------------------ */
siapkanAlias(CARRIER_MASTER.shippingLines);
siapkanAlias(CARRIER_MASTER.couriers);
siapkanAlias(CARRIER_MASTER.airlines);

/* Maskapai diurut dari kode terpanjang, supaya kode 3 karakter tidak
   kalah oleh kode 2 karakter yang kebetulan jadi awalannya. */
/* Diurut sekali, bukan tiap pencocokan. */
const AIRLINES_BY_CODE_LENGTH = CARRIER_MASTER.airlines
  .slice()
  .sort((a, b) => b.code.length - a.code.length);

function airlinesByCodeLength() {
  return AIRLINES_BY_CODE_LENGTH;
}

/* Kode maskapai dicari DI MANA PUN dalam teks, bukan hanya di awal.

   Riwayat nyata menulisnya dengan berbagai cara — "GA879",
   "GARUDA INDONESIA GA0879", "Fedex FX6068", bahkan
   "FRDERAL EXPRESS CORPORATION FX6068" lengkap dengan salah ketik.
   Deteksi yang hanya membaca awal teks melewatkan semuanya kecuali
   yang pertama. */
function detectAirline(flightNo) {
  const teks = String(flightNo || "").toUpperCase();
  if (!teks.trim()) return null;
  const kata = teks.replace(/[^A-Z0-9]+/g, " ").trim().split(" ");
  const daftar = airlinesByCodeLength();

  // 1. Kode menempel dengan nomornya: GA879, FX6068, TW155
  for (let i = 0; i < kata.length; i++) {
    const tk = kata[i];
    const m = daftar.find(
      (a) => tk.indexOf(a.code) === 0 && /^\d{1,5}$/.test(tk.slice(a.code.length)),
    );
    if (m) return { code: m.code, name: m.name, alias: tk, via: "no. penerbangan" };
  }

  // 2. Kode terpisah dari nomornya: "GA 879"
  for (let i = 0; i < kata.length - 1; i++) {
    if (!/^\d{1,5}$/.test(kata[i + 1])) continue;
    const m = daftar.find((a) => a.code === kata[i]);
    if (m) return { code: m.code, name: m.name, alias: kata[i], via: "no. penerbangan" };
  }

  /* 3. Ditulis dengan NAMA, tanpa nomor sama sekali — "FEDEX",
        "DHL FLIGHT". Dicocokkan sebagai rangkaian kata utuh. */
  const rapat = " " + kata.join(" ") + " ";
  for (let i = 0; i < daftar.length; i++) {
    const a = daftar[i];
    const cocok = a._alias.find((al) => rapat.indexOf(" " + al + " ") >= 0);
    if (cocok) return { code: a.code, name: a.name, alias: cocok, via: "nama maskapai" };
  }
  return null;
}

/* ------------------------------------------------------------------
   TINGKAT LAYANAN KURIR

   Kurir menjual KOMITMEN WAKTU, bukan sekadar pengangkutan — dan
   komitmennya berbeda jauh antar layanan. Dibaca dari teks yang sama
   dengan carriernya, karena di situlah orang menuliskannya:
   "FEDEX PRIORITY", "Fedex International Economy".
------------------------------------------------------------------ */
const COURIER_SERVICES = [
  { code: "PRIORITY", label: "Priority", aliases: ["PRIORITY", "IP", "PRIO"] },
  { code: "ECONOMY", label: "Economy", aliases: ["ECONOMY", "IE", "ECO"] },
];

siapkanAlias(COURIER_SERVICES);

function detectCourierService(raw) {
  const kata = normalisasiTeksKapal(raw).split(" ").filter(Boolean);
  if (!kata.length) return "";
  const rapat = " " + kata.join(" ") + " ";
  const m = COURIER_SERVICES.find((s) =>
    s._alias.some((a) => rapat.indexOf(" " + a + " ") >= 0),
  );
  return m ? m.code : "";
}

/* ------------------------------------------------------------------
   DETEKSI GABUNGAN

   Untuk udara, no. penerbangan bisa berada di kolom Nama Voyager
   maupun No. Voyage — tergantung kebiasaan yang mengetik. Dua-duanya
   dicoba daripada memaksa satu kebiasaan.
------------------------------------------------------------------ */
function detectCarrier(s) {
  const src = s || {};
  const udara = src.transport === "udara";

  /* KURIR PALING DULU, apa pun moda yang tercatat. Kalau kolom Nama
     Kapal berisi "FEDEX", kirimannya memang lewat kurir — tidak peduli
     moda transportasinya terlanjur diisi apa. */
  const kurir = detectCourier(src.vessel);
  if (kurir) return { ...kurir, kind: "courier", detected: true };

  if (udara) {
    const hasil = detectAirline(src.vessel) || detectAirline(src.voyage);
    return hasil
      ? { ...hasil, kind: "airline", detected: true }
      : {
          code: "",
          name: "",
          kind: "airline",
          detected: false,
          reason: src.vessel || src.voyage
            ? "Kode maskapai tidak dikenali"
            : "No. penerbangan belum diisi",
        };
  }

  const hasil = detectShippingLine(src.vessel);
  return hasil
    ? { ...hasil, kind: "shipping", detected: true }
    : {
        code: "",
        name: "",
        kind: "shipping",
        detected: false,
        reason: src.vessel ? "Pelayaran tidak dikenali" : "Nama kapal belum diisi",
      };
}

function carrierCodeOf(s) {
  return detectCarrier(s).code || "";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CARRIER_MASTER,
    detectCourier,
    detectCourierService,
    detectShippingLine,
    detectAirline,
    detectCarrier,
    carrierCodeOf,
  };
}
