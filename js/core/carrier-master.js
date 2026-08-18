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
    /* "CSCL" ikut ke sini: China Shipping melebur ke COSCO pada 2016,
       tapi namanya masih terpakai di dokumen dan lambung kapal. */
    { code: "COSCO", name: "COSCO Shipping", aliases: ["COSCO", "XIN", "CSCL", "COSCON"] },
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
    /* Alias "HAI" yang berdiri sendiri SENGAJA DIBUANG. Kata itu
       muncul di banyak nama kapal Cina yang bukan Hai An sama sekali —
       "ZHONG GU BO HAI", "ZHONG GU NAN HAI", "XIN HAI TONG" — dan
       seluruhnya ikut tercatat sebagai Hai An. Riwayat yang tercampur
       begitu lebih buruk daripada tidak terdeteksi: mesin belajar dari
       angka kapal lain tanpa ada yang tahu.

       Frasa "HAI AN" menutup kembali penulisan yang terpisah. */
    { code: "HAIAN", name: "Hai An Transport", aliases: ["HAIAN", "HAI AN"] },
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
    /* ================================================================
       PELAYARAN CINA

       Rute Cina -> Indonesia banyak dilayani operator dalam negeri
       Cina yang tidak pernah muncul di daftar pelayaran global. Nama
       kapalnya ditulis TERPISAH ("HONG TAI 658", "ZHONG GU BO HAI"),
       jadi hampir semuanya butuh alias frasa.
    ================================================================ */
    /* Pemicu penambahan ini: HONG TAI 658 dari TXG ke Tanjung Priok
       tidak terdeteksi sama sekali. Kapalnya nyata — berbendera Cina,
       IMO 1125871 — dan sekapal armada dengan HONG TAI 639 dan
       HONG TAI 656 milik Xiamen Hongtai Shipping. */
    { code: "HONGTAI", name: "Xiamen Hongtai Shipping", aliases: ["HONGTAI", "HONG TAI"] },
    /* Pengangkut peti kemas pesisir terbesar di Cina, dan sekarang
       merambah intra-Asia. Seluruh kapalnya berawalan "ZHONG GU". */
    { code: "ZHONGGU", name: "Zhonggu Logistics", aliases: ["ZHONGGU", "ZHONG GU"] },
    { code: "ANTONG", name: "Antong Holdings (ANT Lines)",
      aliases: ["ANTONG", "AN TONG", "ANSHENG", "AN SHENG"] },
    { code: "CULINES", name: "China United Lines",
      aliases: ["CULINES", "CU LINES"], prefix: ["CUL"] },
    /* Armada "XIN MING ZHOU" milik Jinjiang. Ditulis sebagai frasa
       supaya tidak tertelan alias "XIN" milik COSCO di atas. */
    { code: "JINJIANG", name: "Shanghai Jinjiang Shipping",
      aliases: ["JINJIANG", "JIN JIANG", "XIN MING ZHOU"] },
    { code: "SINOLINES", name: "Sinotrans Container Lines",
      aliases: ["SINOLINES", "SINOTRANS", "SINO LINES"] },
    { code: "BAL", name: "BAL Container Line", aliases: [], prefix: ["BAL"] },
    { code: "TRANSFAR", name: "Transfar Shipping", aliases: ["TRANSFAR"] },
    { code: "SEALEAD", name: "SeaLead Shipping", aliases: ["SEALEAD", "SEA LEAD"] },
    /* Tanda hubungnya hilang saat teks dinormalkan, jadi "X-PRESS"
       masuk sebagai frasa dua kata. */
    { code: "XPRESS", name: "X-Press Feeders", aliases: ["XPRESS", "X PRESS"] },
    { code: "INTERASIA", name: "Interasia Lines", aliases: ["INTERASIA", "INTER ASIA"] },
    { code: "SMLINE", name: "SM Line", aliases: ["SMLINE", "SM LINE"], prefix: ["SM"] },

    /* ================================================================
       PELAYARAN VIETNAM
    ================================================================ */
    { code: "VIMC", name: "VIMC Lines (Vinalines)", aliases: ["VIMC", "VINALINES"] },
    { code: "TANCANG", name: "Tan Cang Shipping", aliases: ["TANCANG", "TAN CANG"] },
    { code: "VSICO", name: "VSICO Shipping", aliases: ["VSICO"] },
    { code: "VINAFCO", name: "Vinafco Shipping", aliases: ["VINAFCO"] },
    { code: "BIENDONG", name: "Bien Dong Shipping", aliases: ["BIENDONG", "BIEN DONG"] },
    { code: "VOSCO", name: "Vietnam Ocean Shipping (VOSCO)", aliases: ["VOSCO"] },

    /* ================================================================
       PELAYARAN RUSIA

       FESCO satu-satunya yang menyentuh Indonesia langsung: kapalnya
       pernah sandar di Tanjung Priok lewat FESCO Intra Asia Service,
       dan jalur Vladivostok - Vietnam dipakai rutin.

       CATATAN PENTING. FESCO banyak MENCARTER kapal, dan kapal
       carteran memakai nama pemiliknya — "A HOUOU", "BAL BOAN" —
       bukan "FESCO ...". Jadi alias di bawah hanya menangkap kapal
       milik sendiri. Kalau B/L Anda menyebut FESCO tapi nama kapalnya
       lain, kapal itu memang tidak akan terbaca FESCO.
    ================================================================ */
    { code: "FESCO", name: "FESCO Transportation Group", aliases: ["FESCO"] },
    { code: "SASCO", name: "Sakhalin Shipping (SASCO)", aliases: ["SASCO"] },
    { code: "RUSCON", name: "Ruscon (Delo Group)", aliases: ["RUSCON"] },

    { code: "SPIL", name: "Salam Pacific Indonesia Lines", aliases: ["SPIL"] },
    { code: "TEMAS", name: "Temas Line", aliases: ["TEMAS"] },
    /* Sisi Indonesia — untuk arah sebaliknya, ekspor keluar. Armada
       Samudera dinamai "SINAR <tempat>", jadi alias itu ikut. */
    { code: "MERATUS", name: "Meratus Line", aliases: ["MERATUS"] },
    { code: "TANTO", name: "Tanto Intim Line", aliases: ["TANTO"] },
    { code: "SAMUDERA", name: "Samudera Shipping Line",
      aliases: ["SAMUDERA"], prefix: ["SINAR"] },
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

    /* Ditambahkan supaya SARAN di kotak Nama Pesawat cukup lengkap
       untuk rute yang benar-benar dipakai DDI — Korea, Cina, Taiwan,
       Vietnam, dan Asia Tenggara. Deteksi otomatis ikut menguat dengan
       sendirinya: tiap baris di sini juga sebuah kode yang dikenali. */
    { code: "BX", name: "Air Busan" },
    { code: "ZE", name: "Eastar Jet" },
    { code: "RS", name: "Air Seoul" },
    { code: "MF", name: "Xiamen Air" },
    { code: "ZH", name: "Shenzhen Airlines" },
    { code: "3U", name: "Sichuan Airlines" },
    { code: "HU", name: "Hainan Airlines" },
    { code: "SC", name: "Shandong Airlines" },
    { code: "9C", name: "Spring Airlines" },
    { code: "JX", name: "Starlux Airlines" },
    { code: "IT", name: "Tigerair Taiwan" },
    { code: "B7", name: "Uni Air" },
    { code: "VJ", name: "VietJet Air" },
    { code: "QH", name: "Bamboo Airways" },
    { code: "PR", name: "Philippine Airlines" },
    { code: "5J", name: "Cebu Pacific" },
    { code: "HX", name: "Hong Kong Airlines" },
    { code: "UO", name: "HK Express" },
    { code: "AK", name: "AirAsia" },
    { code: "FD", name: "Thai AirAsia" },
    { code: "SL", name: "Thai Lion Air" },
    { code: "OD", name: "Batik Air Malaysia" },
    { code: "ID", name: "Batik Air" },
    { code: "SJ", name: "Sriwijaya Air" },
    { code: "IU", name: "Super Air Jet" },
    { code: "IN", name: "Nam Air" },

    /* Maskapai KARGO murni — tidak mengangkut penumpang, jadi mudah
       terlewat kalau daftarnya disusun dari jadwal penerbangan biasa. */
    { code: "CK", name: "China Cargo Airlines", aliases: ["CHINA CARGO"] },
    { code: "O3", name: "SF Airlines", aliases: ["SF AIRLINES"] },
    { code: "Y8", name: "Suparna Airlines", aliases: ["SUPARNA"] },
    { code: "LD", name: "Air Hong Kong" },
    { code: "RU", name: "AirBridgeCargo" },
    { code: "PO", name: "Polar Air Cargo", aliases: ["POLAR AIR"] },
    { code: "5Y", name: "Atlas Air", aliases: ["ATLAS AIR"] },
    { code: "QY", name: "European Air Transport", aliases: ["EAT"] },
    { code: "8K", name: "K-Mile Air" },
    { code: "MB", name: "MNG Airlines" },

    /* ----------------------------------------------------------------
       MASKAPAI CINA TAMBAHAN

       Yang disaring: yang benar-benar terbang ke Indonesia atau
       mengangkut kargo lintas negara. Maskapai perintis dalam negeri
       Cina sengaja tidak dimasukkan — ia tidak akan pernah muncul di
       AWB DDI, dan hanya memenuhi kotak saran.
    ---------------------------------------------------------------- */
    { code: "FM", name: "Shanghai Airlines" },
    { code: "HO", name: "Juneyao Air" },
    { code: "JD", name: "Beijing Capital Airlines" },
    { code: "GS", name: "Tianjin Airlines" },
    { code: "KN", name: "China United Airlines" },
    { code: "GJ", name: "Loong Air" },
    { code: "8L", name: "Lucky Air" },
    { code: "KY", name: "Kunming Airlines" },
    { code: "EU", name: "Chengdu Airlines" },
    { code: "DZ", name: "Donghai Airlines" },
    { code: "BK", name: "Okay Airways" },
    { code: "G5", name: "China Express Airlines" },
    { code: "GX", name: "Beibu Gulf Airlines" },
    { code: "QW", name: "Qingdao Airlines" },
    /* Kargo murni. YTO dan Pos Cina rutin membawa muatan
       e-commerce Cina - Jakarta. */
    { code: "YG", name: "YTO Cargo Airlines", aliases: ["YTO"] },
    { code: "CF", name: "China Postal Airlines", aliases: ["CHINA POSTAL"] },

    /* ----------------------------------------------------------------
       MASKAPAI RUSIA

       Sebagian besar masuk lewat Denpasar, bukan Jakarta — itu pun
       tetap dicatat, karena kolomnya sama dan salah ketik satu huruf
       tetap harus terbaca.
    ---------------------------------------------------------------- */
    { code: "S7", name: "S7 Airlines" },
    { code: "U6", name: "Ural Airlines" },
    { code: "N4", name: "Nordwind Airlines" },
    { code: "ZF", name: "AZUR air" },
    { code: "FV", name: "Rossiya Airlines" },
    { code: "DP", name: "Pobeda" },
    { code: "UT", name: "Utair" },
    { code: "WZ", name: "Red Wings" },
    { code: "5N", name: "Smartavia" },
    { code: "VI", name: "Volga-Dnepr Airlines", aliases: ["VOLGA DNEPR"] },

    /* ----------------------------------------------------------------
       MASKAPAI VIETNAM TAMBAHAN
    ---------------------------------------------------------------- */
    { code: "BL", name: "Pacific Airlines" },
    { code: "VU", name: "Vietravel Airlines" },
    { code: "0V", name: "VASCO" },

    /* ----------------------------------------------------------------
       KARGO INDONESIA — untuk arah sebaliknya, ekspor keluar.

       2Y sudah dipastikan dari empat sumber yang saling bebas (CAPA,
       Wikidata, Plane Finder, Flightera).

       GM MASIH BERSELISIH. Sebagian besar sumber menulis GM, satu
       direktori menulis GY. Yang TIDAK berselisih adalah kode ICAO
       (TMG), nama, dan callsign (TRILINES) — jadi nama perusahaannya
       ikut didaftarkan sebagai alias. Kalau kodenya ternyata salah,
       AWB yang menulis "ASIA CARGO" atau "TRI-MG" tetap terbaca.
       Perusahaannya berganti nama jadi Asia Cargo Airlines pada 2021,
       tapi dokumen lama masih menulis Tri-MG.
    ---------------------------------------------------------------- */
    { code: "2Y", name: "My Indo Airlines", aliases: ["MY INDO", "MYINDO"] },
    { code: "GM", name: "Asia Cargo Airlines (d/h Tri-MG)",
      aliases: ["ASIA CARGO", "TRI MG", "TRIMG", "TRILINES"] },
  ],
};

/* ------------------------------------------------------------------
   SARAN UNTUK KOTAK NAMA KAPAL / NAMA PESAWAT

   Daftar di berkas ini sudah lama dipakai untuk MENGENALI carrier dari
   nama yang diketik — tapi tidak pernah DITAWARKAN. Orang harus hafal
   bahwa SQ itu Singapore Airlines dan TR itu Scoot, dan yang salah
   ketik satu huruf tidak akan terdeteksi sama sekali: prediksinya
   diam-diam turun ke angka rata-rata tanpa memberi tahu siapa pun.

   Disaring menurut moda, karena isinya memang dua daftar yang tidak
   berhubungan: pelayaran untuk laut, maskapai untuk udara. Kurir
   masuk ke KEDUANYA — kiriman kurir bisa lewat udara maupun darat, dan
   kolom Nama Kapal-nya memang diisi nama perusahaan.

   Nilai yang dimasukkan adalah KODE-nya, bukan nama panjangnya:
   itu yang dibaca detectCarrier(), dan itu pula yang sudah tertulis di
   ribuan jadwal lama.
------------------------------------------------------------------ */
function carrierDatalistHtml(mode) {
  const daftar =
    mode === "udara"
      ? CARRIER_MASTER.airlines
      : mode === "laut"
        ? CARRIER_MASTER.shippingLines
        : CARRIER_MASTER.airlines.concat(CARRIER_MASTER.shippingLines);
  const semua = CARRIER_MASTER.couriers.concat(daftar);
  const sudah = new Set();
  return semua
    .filter((c) => {
      const k = c.code + "|" + c.name;
      if (sudah.has(k)) return false;
      sudah.add(k);
      return true;
    })
    .map(
      (c) =>
        /* Nama lengkap ditulis di label supaya bisa dicari lewat
           namanya juga — datalist mencocokkan label, bukan cuma nilai. */
        `<option value="${escapeAttr(c.code)}">${escapeHtml(c.code + " — " + c.name)}</option>`,
    )
    .join("");
}

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
/* ALIAS SATU KATA vs ALIAS FRASA.

   Nama operator Asia Timur sering ditulis TERPISAH: "HONG TAI 658",
   "ZHONG GU BO HAI", "TAN CANG 09", "X-PRESS MEKONG". Pencocokan lama
   membandingkan alias dengan tiap KATA satu per satu, jadi alias yang
   mengandung spasi tidak akan pernah sama dengan kata mana pun —
   diam-diam tidak berlaku, tanpa pesan galat.

   Karena itu alias dipisah saat dimuat: `_word` untuk yang satu kata,
   `_phrase` untuk yang lebih. `_alias` tetap berisi keduanya, karena
   pencocokan kurir dan maskapai memang sudah bekerja pada teks utuh
   dan sudah benar menangani frasa. */
function siapkanAlias(daftar) {
  daftar.forEach((x) => {
    x._alias = (x.aliases || []).map(normalisasiTeksKapal).filter(Boolean);
    x._word = x._alias.filter((a) => a.indexOf(" ") < 0);
    x._phrase = x._alias.filter((a) => a.indexOf(" ") >= 0);
    /* `prefix` = alias yang HANYA sah sebagai kata pertama.

       Untuk singkatan sependek "SM" atau "BAL", pencocokan di tengah
       nama lebih sering salah daripada benar: armadanya toh selalu
       diawali singkatan itu ("SM QINGDAO", "BAL BOAN"), sedangkan
       kapal lain bisa saja memuat dua huruf yang sama di tengah.
       Kembarannya `suffix`, dari sisi yang berlawanan. */
    x._prefix = (x.prefix || []).map(normalisasiTeksKapal).filter(Boolean);
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
  /* Dibingkai spasi di kedua ujung supaya frasa tetap dicocokkan
     sebagai rangkaian KATA UTUH, sama seperti alias satu kata. */
  const rapat = " " + kata.join(" ") + " ";

  /* FRASA DI AWAL NAMA — paling khusus, jadi diperiksa paling dulu.

     "XIN MING ZHOU 68" itu Jinjiang, bukan COSCO, walau kata
     pertamanya "XIN" persis alias COSCO. Yang cocok lebih panjang
     harus menang; kalau tidak, satu alias pendek akan menelan seluruh
     armada operator lain. */
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    const cocok = line._phrase.find((f) => rapat.indexOf(" " + f + " ") === 0);
    if (cocok) {
      return { code: line.code, name: line.name, alias: cocok, via: "frasa awal nama" };
    }
  }

  /* Kata PERTAMA lebih dulu. "EVER GIVEN" harus terbaca Evergreen,
     bukan tertangkap alias lain yang kebetulan muncul belakangan. */
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    if (line._word.indexOf(kata[0]) >= 0 || line._prefix.indexOf(kata[0]) >= 0) {
      return { code: line.code, name: line.name, alias: kata[0], via: "kata pertama" };
    }
  }

  // Frasa di mana pun, sebelum kata tunggal — alasan yang sama.
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    const cocok = line._phrase.find((f) => rapat.indexOf(" " + f + " ") >= 0);
    if (cocok) {
      return { code: line.code, name: line.name, alias: cocok, via: "frasa dalam nama" };
    }
  }

  // Baru kata utuh di mana pun. Bukan potongan teks — "ONE" tidak
  // boleh tertangkap dari "MILESTONE".
  for (let i = 0; i < CARRIER_MASTER.shippingLines.length; i++) {
    const line = CARRIER_MASTER.shippingLines[i];
    const cocok = line._word.find((a) => kata.indexOf(a) >= 0);
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
