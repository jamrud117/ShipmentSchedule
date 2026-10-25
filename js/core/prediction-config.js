"use strict";

/* ==================================================================
   KONFIGURASI MESIN PREDIKSI — DATA SAJA

   SELURUH ANGKA ADA DI BERKAS INI. Tidak ada satu pun lama hari yang
   ditulis di dalam logika perhitungan (js/core/prediction.js). Menambah
   rute baru, mengubah asumsi bongkar, atau memasukkan hari libur
   nasional cukup dilakukan di sini — tanpa menyentuh kode hitungannya.

   Ada DUA kelompok angka, dan keduanya sengaja dipisah karena menjawab
   pertanyaan yang berbeda:

     routes[]      lama PERJALANAN dari pelabuhan asal ke pelabuhan
                   tujuan. Satuan HARI KALENDER — kapal dan pesawat
                   tidak libur hari Minggu.

     operations[]  lama PROSES DI DARAT setelah barang mendarat:
                   stripping, clearance, antar ke pabrik.

                   Satuannya TIDAK SERAGAM, dan itu disengaja. Bea Cukai
                   dan trucking tutup di akhir pekan, jadi clearance dan
                   pengantaran memakai HARI KERJA. Tapi CFS membongkar
                   terus — akhir pekan maupun hari libur — jadi
                   stripping memakai HARI KALENDER. Lihat calendarDayLegs.

   BENTUK ATURAN (berlaku untuk routes[] maupun operations[]):

     {
       id:    "kr-id",                 // penanda, muncul di layar
       label: "Korea → Indonesia",     // teks yang dibaca pengguna
       match: { fromCountry: "KR", toCountry: "ID" },
       days:  { AIR: {...}, SEA_FCL: {...}, SEA_LCL: {...} }
     }

   `match` boleh berisi kunci apa pun di bawah ini — makin banyak yang
   cocok, makin tinggi prioritasnya (lihat pickPredictionRule):

     fromPort / toPort        kode pendek gaya IATA  (PUS, TPP, CGK)
                              — bentuk yang ditampilkan & disimpan.
                              Dokumen impor menulis IDTPP/IDCGK, dan
                              resolvePortCode() sudah menyeragamkannya
                              sebelum sampai ke sini.
     fromCountry / toCountry  dua huruf negara       (KR, ID)
     forwarder                nama forwarder, cocok sebagian & tanpa
                              membedakan huruf besar/kecil
     transport                "laut" | "udara"

   Aturan dengan `match: {}` adalah CADANGAN: dipakai kalau tidak ada
   aturan lain yang cocok. Harus selalu ada, dan ditaruh paling bawah.

   RENCANA KE DEPAN (transit per bandara, per forwarder, per pelabuhan,
   sampai hasil belajar dari riwayat pengiriman) tidak menuntut
   perubahan logika sama sekali — cukup menambah aturan yang `match`-nya
   lebih rinci di ATAS aturan yang lebih umum.
================================================================== */

const PREDICTION_CONFIG = {
  version: "1.1.0",

  /* ----------------------------------------------------------------
     KALENDER

     Dipakai oleh hitungan HARI KERJA saja (clearance, antar ke pabrik,
     komitmen kurir). Transit & stripping tetap hari kalender.

     weekendDays: 0 = Minggu … 6 = Sabtu.

     holidays / collectiveLeave: libur nasional & cuti bersama menurut
     SKB 3 Menteri (setneg.go.id), termasuk revisi 18-08-2025. Tahun
     berikutnya cukup ditambahkan di sini begitu SKB-nya terbit --
     biasanya sekitar September tahun sebelumnya.

     countCollectiveLeave: cuti bersama ikut dihitung tutup. Pabrik,
     PPJK, dan sebagian besar layanan Bea Cukai bekerja minimal di hari
     itu; Lebaran tanpa cuti bersama membuat perkiraan meleset sepekan.

     freightRestrictions: masa pembatasan angkutan barang (truk sumbu
     tiga ke atas, trailer, gandengan) di tol & arteri, termasuk ruas
     Cawang–Tanjung Priok dan Jakarta–Cikampek. Hanya menahan langkah
     antar ke pabrik (`legs`), hanya untuk tipe di `appliesTo` --
     kontainer FCL diangkut trailer; udara & LCL biasanya truk kecil.
     Sumber: SKB Lebaran & Nataru Kemenhub-Korlantas-PUPR.
  ---------------------------------------------------------------- */
  calendar: {
    weekendDays: [0, 6],
    holidays: [
      { date: "2025-01-01", name: "Tahun Baru 2025 Masehi" },
      { date: "2025-01-27", name: "Isra Mikraj Nabi Muhammad SAW" },
      { date: "2025-01-29", name: "Tahun Baru Imlek 2576 Kongzili" },
      { date: "2025-03-29", name: "Hari Suci Nyepi (Tahun Baru Saka 1947)" },
      { date: "2025-03-31", name: "Idulfitri 1446 H" },
      { date: "2025-04-01", name: "Idulfitri 1446 H" },
      { date: "2025-04-18", name: "Wafat Yesus Kristus" },
      { date: "2025-04-20", name: "Kebangkitan Yesus Kristus (Paskah)" },
      { date: "2025-05-01", name: "Hari Buruh Internasional" },
      { date: "2025-05-12", name: "Hari Raya Waisak 2569 BE" },
      { date: "2025-05-29", name: "Kenaikan Yesus Kristus" },
      { date: "2025-06-01", name: "Hari Lahir Pancasila" },
      { date: "2025-06-06", name: "Iduladha 1446 H" },
      { date: "2025-06-27", name: "1 Muharam Tahun Baru Islam 1447 H" },
      { date: "2025-08-17", name: "Proklamasi Kemerdekaan" },
      { date: "2025-09-05", name: "Maulid Nabi Muhammad SAW" },
      { date: "2025-12-25", name: "Kelahiran Yesus Kristus" },

      { date: "2026-01-01", name: "Tahun Baru 2026 Masehi" },
      { date: "2026-01-16", name: "Isra Mikraj Nabi Muhammad SAW" },
      { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili" },
      { date: "2026-03-19", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
      { date: "2026-03-21", name: "Idulfitri 1447 H" },
      { date: "2026-03-22", name: "Idulfitri 1447 H" },
      { date: "2026-04-03", name: "Wafat Yesus Kristus" },
      { date: "2026-04-05", name: "Kebangkitan Yesus Kristus (Paskah)" },
      { date: "2026-05-01", name: "Hari Buruh Internasional" },
      { date: "2026-05-14", name: "Kenaikan Yesus Kristus" },
      { date: "2026-05-27", name: "Iduladha 1447 H" },
      { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE" },
      { date: "2026-06-01", name: "Hari Lahir Pancasila" },
      { date: "2026-06-16", name: "1 Muharam Tahun Baru Islam 1448 H" },
      { date: "2026-08-17", name: "Proklamasi Kemerdekaan" },
      { date: "2026-08-25", name: "Maulid Nabi Muhammad SAW" },
      { date: "2026-12-25", name: "Kelahiran Yesus Kristus" },

      { date: "2027-01-01", name: "Tahun Baru 2027 Masehi" },
      { date: "2027-01-05", name: "Isra Mikraj Nabi Muhammad SAW" },
      { date: "2027-02-06", name: "Tahun Baru Imlek 2578 Kongzili" },
      { date: "2027-03-08", name: "Hari Suci Nyepi (Tahun Baru Saka 1949)" },
      { date: "2027-03-10", name: "Idulfitri 1448 H" },
      { date: "2027-03-11", name: "Idulfitri 1448 H" },
      { date: "2027-03-26", name: "Wafat Yesus Kristus" },
      { date: "2027-03-28", name: "Kebangkitan Yesus Kristus (Paskah)" },
      { date: "2027-05-01", name: "Hari Buruh Internasional" },
      { date: "2027-05-06", name: "Kenaikan Yesus Kristus" },
      { date: "2027-05-17", name: "Iduladha 1448 H" },
      { date: "2027-05-20", name: "Hari Raya Waisak 2571 BE" },
      { date: "2027-06-01", name: "Hari Lahir Pancasila" },
      { date: "2027-06-06", name: "1 Muharam Tahun Baru Islam 1449 H" },
      { date: "2027-08-15", name: "Maulid Nabi Muhammad SAW" },
      { date: "2027-08-17", name: "Proklamasi Kemerdekaan" },
      { date: "2027-12-25", name: "Kelahiran Yesus Kristus" },
      { date: "2027-12-26", name: "Isra Mikraj Nabi Muhammad SAW" },
    ],
    collectiveLeave: [
      { date: "2025-01-28", name: "Tahun Baru Imlek 2576 Kongzili" },
      { date: "2025-03-28", name: "Hari Suci Nyepi" },
      { date: "2025-04-02", name: "Idulfitri 1446 H" },
      { date: "2025-04-03", name: "Idulfitri 1446 H" },
      { date: "2025-04-04", name: "Idulfitri 1446 H" },
      { date: "2025-04-07", name: "Idulfitri 1446 H" },
      { date: "2025-05-13", name: "Hari Raya Waisak" },
      { date: "2025-05-30", name: "Kenaikan Yesus Kristus" },
      { date: "2025-06-09", name: "Iduladha 1446 H" },
      { date: "2025-08-18", name: "Proklamasi Kemerdekaan" },
      { date: "2025-12-26", name: "Kelahiran Yesus Kristus" },

      { date: "2026-02-16", name: "Tahun Baru Imlek 2577 Kongzili" },
      { date: "2026-03-18", name: "Hari Suci Nyepi" },
      { date: "2026-03-20", name: "Idulfitri 1447 H" },
      { date: "2026-03-23", name: "Idulfitri 1447 H" },
      { date: "2026-03-24", name: "Idulfitri 1447 H" },
      { date: "2026-05-15", name: "Kenaikan Yesus Kristus" },
      { date: "2026-05-28", name: "Iduladha 1447 H" },
      { date: "2026-12-24", name: "Kelahiran Yesus Kristus" },

      { date: "2027-02-05", name: "Tahun Baru Imlek 2578 Kongzili" },
      { date: "2027-03-09", name: "Idulfitri 1448 H" },
      { date: "2027-03-12", name: "Idulfitri 1448 H" },
      { date: "2027-03-15", name: "Idulfitri 1448 H" },
      { date: "2027-03-25", name: "Wafat Yesus Kristus" },
      { date: "2027-05-18", name: "Iduladha 1448 H" },
      { date: "2027-05-19", name: "Hari Raya Waisak" },
      { date: "2027-12-24", name: "Kelahiran Yesus Kristus" },
    ],
    countCollectiveLeave: true,
    /* Lebaran 2026 mulai 13-03 pukul 12.00 -- pagi itu truk masih
       jalan, jadi hari tutupnya dihitung dari 14-03. Pembatasan
       Lebaran 2027 belum diterbitkan; tambahkan begitu SKB-nya keluar. */
    freightRestrictions: [
      {
        from: "2025-03-24", to: "2025-04-08", appliesTo: ["SEA_FCL"],
        get name() { return tt("Pembatasan truk Lebaran 2025", "Lebaran 2025 truck restriction"); },
      },
      {
        from: "2025-12-19", to: "2025-12-20", appliesTo: ["SEA_FCL"],
        get name() { return tt("Pembatasan truk Nataru 2025/2026", "Christmas–New Year 2025/2026 truck restriction"); },
      },
      {
        from: "2025-12-23", to: "2025-12-28", appliesTo: ["SEA_FCL"],
        get name() { return tt("Pembatasan truk Nataru 2025/2026", "Christmas–New Year 2025/2026 truck restriction"); },
      },
      {
        from: "2026-01-02", to: "2026-01-04", appliesTo: ["SEA_FCL"],
        get name() { return tt("Pembatasan truk Nataru 2025/2026", "Christmas–New Year 2025/2026 truck restriction"); },
      },
      {
        from: "2026-03-14", to: "2026-03-29", appliesTo: ["SEA_FCL"],
        get name() { return tt("Pembatasan truk Lebaran 2026", "Lebaran 2026 truck restriction"); },
      },
    ],
  },

  /* ----------------------------------------------------------------
     TIPE PENGIRIMAN

     Diturunkan dari moda transportasi + jenis muatan yang SUDAH ada di
     form, bukan field baru:

       transport "udara"            -> AIR
       transport "laut" + LCL       -> SEA_LCL
       transport "laut" + selain itu-> SEA_FCL

     defaultSeaType dipakai saat kolom Jenis Muatan masih kosong. Yang
     dianggap tidak lebih dari tebakan — dan memang ditulis apa adanya
     di layar sebagai "muatan belum diisi, dianggap FCL".
  ---------------------------------------------------------------- */
  /* ----------------------------------------------------------------
     ANGKA TUNGGAL vs RENTANG

     Lama transit boleh ditulis dua cara:

       direct: 11          angka pasti
       direct: [8, 12]     rentang — "8 sampai 12 hari"

     Forwarder hampir selalu memberi RENTANG, bukan satu angka. Menyimpan
     rentangnya apa adanya jauh lebih jujur daripada memilih satu angka
     lalu melupakan asalnya: papan bisa menampilkan "20 Agu (rentang
     18–24 Agu)", dan lebar rentang itu sendiri sudah bercerita berapa
     banyak yang masih ditebak.

     Untuk satu tanggal yang harus dituliskan ke kolom ETA, dipilih satu
     angka dari rentang menurut kebijakan di bawah:

       "mid"  titik tengah, dibulatkan ke atas  (bawaan)
       "max"  ujung terlama  — perkiraan aman, cenderung kelewat mundur
       "min"  ujung tercepat — cenderung kelewat maju

     "mid" dipakai sebagai bawaan karena inilah perkiraan yang paling
     sering tepat. Yang selalu mundur akan dianggap tidak berguna, dan
     yang selalu maju membuat truk dipesan untuk barang yang belum ada.
     Rentang penuhnya tetap ditampilkan, jadi tidak ada yang tersembunyi.

     Ganti satu baris ini kalau tim lebih suka perkiraan yang aman.
  ---------------------------------------------------------------- */
  planning: { transitEstimate: "mid" },

  shipmentTypes: {
    AIR: { label: "AIR", short: "AIR" },
    SEA_FCL: { label: "SEA FCL", short: "FCL" },
    SEA_LCL: { label: "SEA LCL", short: "LCL" },
  },
  defaultSeaType: "SEA_FCL",

  /* ----------------------------------------------------------------
     LAMA PERJALANAN — HARI KALENDER

     `direct`  : rute langsung, tanpa singgah.
     `transit` : rute yang singgah di terminal lain (Tipe Rute =
                 Transit di form).

     Angka Korea → Indonesia di bawah ini adalah CONTOH dari permintaan
     fitur. Silakan diganti begitu ada angka nyata dari forwarder.
  ---------------------------------------------------------------- */
  routes: [
    {
      id: "kr-id",
      label: "Korea → Indonesia",
      match: { fromCountry: "KR", toCountry: "ID" },
      days: {
        AIR: { direct: 1, transit: 3 },
        SEA_FCL: { direct: 11, transit: 14 },
        SEA_LCL: { direct: 17, transit: 21 },
      },
    },

    /* ================================================================
       TINGKAT 1 — PER PELABUHAN / BANDARA

       Angka pasti, bukan rentang: sumbernya menyebut satu bilangan per
       rute. Karena `fromPort` + `toPort` berbobot 8+8, aturan di
       kelompok ini selalu mengalahkan aturan negara di bawahnya.

       Yang TIDAK disebut di sini sengaja dibiarkan kosong — bukan diisi
       tebakan. Tabelnya hanya memuat FCL, dan sebagian rute hanya punya
       angka Transit. Kekosongan itu ditambal aturan negara lewat
       jatuh-tingkat (lihat rankPredictionRules), sehingga kiriman LCL
       dari Shanghai tetap dapat perkiraan yang masuk akal — dari
       rentang China, bukan dari angka nol.

       Tujuannya dikunci ke Tanjung Priok (laut) dan Soekarno-Hatta
       (udara) persis seperti sumbernya. Kiriman ke Surabaya atau
       Semarang jatuh ke aturan negara, dan itu memang jujur: tidak ada
       yang tahu berapa lama Shanghai → Tanjung Perak.
    ================================================================ */

    /* ---- UDARA → Soekarno-Hatta ---- */
    {
      id: "vn-air-cgk",
      get label() { return tt("Ho Chi Minh / Hanoi → Jakarta (udara)", "Ho Chi Minh / Hanoi → Jakarta (air)"); },
      match: { fromCountry: "VN", fromPort: ["SGN", "HAN"], toPort: "CGK" },
      days: { AIR: { direct: 1, transit: 3 } },
    },
    {
      id: "cn-air-south-cgk",
      get label() { return tt("Pudong / Hongqiao / Baiyun → Jakarta (udara)", "Pudong / Hongqiao / Baiyun → Jakarta (air)"); },
      match: { fromCountry: "CN", fromPort: ["PVG", "SHA", "CAN"], toPort: "CGK" },
      days: { AIR: { direct: 2, transit: 4 } },
    },
    {
      id: "cn-air-szx-cgk",
      get label() { return tt("Shenzhen Bao'an → Jakarta (udara)", "Shenzhen Bao'an → Jakarta (air)"); },
      match: { fromCountry: "CN", fromPort: "SZX", toPort: "CGK" },
      days: { AIR: { direct: 2, transit: 5 } },
    },
    {
      id: "cn-air-north-cgk",
      get label() { return tt("Beijing Capital / Qingdao Jiaodong → Jakarta (udara)", "Beijing Capital / Qingdao Jiaodong → Jakarta (air)"); },
      match: { fromCountry: "CN", fromPort: ["PEK", "TAO"], toPort: "CGK" },
      days: { AIR: { direct: 3, transit: 5 } },
    },
    {
      id: "ru-air-mow-cgk",
      get label() { return tt("Sheremetyevo / Domodedovo → Jakarta (udara)", "Sheremetyevo / Domodedovo → Jakarta (air)"); },
      match: { fromCountry: "RU", fromPort: ["SVO", "DME"], toPort: "CGK" },
      days: { AIR: { direct: 4, transit: 7 } },
    },
    {
      // Hanya transit — tidak ada penerbangan langsung Pulkovo → Jakarta.
      id: "ru-air-led-cgk",
      get label() { return tt("St Petersburg Pulkovo → Jakarta (udara, transit)", "St Petersburg Pulkovo → Jakarta (air, transit)"); },
      match: { fromCountry: "RU", fromPort: "LED", toPort: "CGK" },
      days: { AIR: { transit: 8 } },
    },
    {
      id: "mx-air-mex-cgk",
      get label() { return tt("Mexico City → Jakarta (udara, transit)", "Mexico City → Jakarta (air, transit)"); },
      match: { fromCountry: "MX", fromPort: "MEX", toPort: "CGK" },
      days: { AIR: { transit: 6 } },
    },
    {
      id: "mx-air-mty-gdl-cgk",
      get label() { return tt("Monterrey / Guadalajara → Jakarta (udara, transit)", "Monterrey / Guadalajara → Jakarta (air, transit)"); },
      match: { fromCountry: "MX", fromPort: ["MTY", "GDL"], toPort: "CGK" },
      days: { AIR: { transit: 7 } },
    },

    /* ---- PER CARRIER (paling rinci) ----

       Angka contoh dari spesifikasi. Berlaku apa pun Tipe Rutenya —
       pelayaran yang sama pada rute yang sama punya jadwal yang sama,
       terlepas dari apakah kapalnya singgah. */
    {
      id: "air-pvg-cgk-ke",
      label: "Korean Air · Shanghai Pudong → Jakarta",
      match: { fromPort: "PVG", toPort: "CGK", carrier: "KE" },
      days: { AIR: 2 },
    },
    {
      id: "air-pvg-cgk-ci",
      label: "China Airlines · Shanghai Pudong → Jakarta",
      match: { fromPort: "PVG", toPort: "CGK", carrier: "CI" },
      days: { AIR: 3 },
    },
    {
      id: "sea-pus-tpp-hmm",
      label: "HMM · Busan → Tanjung Priok",
      match: { fromPort: "PUS", toPort: "TPP", carrier: "HMM" },
      days: { SEA_FCL: 9 },
    },
    {
      id: "sea-pus-tpp-one",
      label: "ONE · Busan → Tanjung Priok",
      match: { fromPort: "PUS", toPort: "TPP", carrier: "ONE" },
      days: { SEA_FCL: 10 },
    },
    {
      id: "sea-pus-tpp-msc",
      label: "MSC · Busan → Tanjung Priok",
      match: { fromPort: "PUS", toPort: "TPP", carrier: "MSC" },
      days: { SEA_FCL: 11 },
    },
    {
      id: "sea-pus-tpp",
      get label() { return tt("Busan → Tanjung Priok (pelayaran lain)", "Busan → Tanjung Priok (other carriers)"); },
      match: { fromPort: "PUS", toPort: "TPP" },
      days: { SEA_FCL: 10, SEA_LCL: 13 },
    },

    /* ---- LAUT FCL → Tanjung Priok ---- */
    {
      id: "vn-sea-sgn-tpp",
      get label() { return tt("Ho Chi Minh (Cat Lai & sekitarnya) → Tanjung Priok", "Ho Chi Minh (Cat Lai & surroundings) → Tanjung Priok"); },
      /* SELURUH TERMINAL SATU KOMPLEKS didaftar bersama.

         Cat Lai, Sai Gon Port, VICT, dan Hiep Phuoc semuanya di sungai
         yang sama di Ho Chi Minh dan berbagi angka transit yang sama.
         Dokumen forwarder menulis nama terminalnya, bukan nama
         kotanya -- tanpa didaftar di sini, kiriman dari "CAT LAI"
         berhenti mendapat perkiraan ETA sama sekali. */
      match: {
        fromCountry: "VN",
        fromPort: ["SGN", "CLI", "CSG", "VIC", "HPP"],
        toPort: "TPP",
      },
      days: { SEA_FCL: { direct: 6, transit: 8 } },
    },
    {
      id: "vn-sea-hph-tpp",
      get label() { return tt("Hai Phong (Dinh Vu & sekitarnya) → Tanjung Priok", "Hai Phong (Dinh Vu & surroundings) → Tanjung Priok"); },
      match: {
        fromCountry: "VN",
        fromPort: ["HPH", "DVU", "CVE", "DXA", "TVN"],
        toPort: "TPP",
      },
      days: { SEA_FCL: { direct: 7, transit: 9 } },
    },
    {
      id: "cn-sea-sha-ngb-tpp",
      label: "Shanghai / Ningbo → Tanjung Priok",
      match: { fromCountry: "CN", fromPort: ["SHA", "NGB"], toPort: "TPP" },
      days: { SEA_FCL: { direct: 10, transit: 13 } },
    },
    {
      id: "cn-sea-szx-xmn-tpp",
      label: "Yantian (Shenzhen) / Xiamen → Tanjung Priok",
      match: { fromCountry: "CN", fromPort: ["SZX", "XMN"], toPort: "TPP" },
      days: { SEA_FCL: { direct: 9, transit: 12 } },
    },
    {
      id: "cn-sea-tao-tpp",
      label: "Qingdao → Tanjung Priok",
      match: { fromCountry: "CN", fromPort: "TAO", toPort: "TPP" },
      days: { SEA_FCL: { direct: 12, transit: 15 } },
    },
    {
      /* CNTSN & CNTXG dua-duanya dipakai untuk Tianjin di dokumen yang
         berbeda. Didaftarkan bersama supaya jadwal lama yang terlanjur
         memakai CNTSN tetap terbaca. */
      id: "cn-sea-tsn-tpp",
      label: "Tianjin / Xingang → Tanjung Priok",
      match: { fromCountry: "CN", fromPort: ["TXG", "TSN"], toPort: "TPP" },
      days: { SEA_FCL: { direct: 13, transit: 16 } },
    },
    {
      id: "ru-sea-vvo-tpp",
      label: "Vladivostok → Tanjung Priok (transit)",
      match: { fromCountry: "RU", fromPort: "VVO", toPort: "TPP" },
      days: { SEA_FCL: { transit: 23 } },
    },
    {
      id: "ru-sea-west-tpp",
      label: "St Petersburg / Novorossiysk → Tanjung Priok (transit)",
      match: { fromCountry: "RU", fromPort: ["LED", "NVS"], toPort: "TPP" },
      days: { SEA_FCL: { transit: 40 } },
    },
    {
      id: "mx-sea-zlo-tpp",
      label: "Manzanillo → Tanjung Priok (transit)",
      match: { fromCountry: "MX", fromPort: "ZLO", toPort: "TPP" },
      days: { SEA_FCL: { transit: 35 } },
    },
    {
      id: "mx-sea-lzc-tpp",
      label: "Lazaro Cardenas → Tanjung Priok (transit)",
      match: { fromCountry: "MX", fromPort: "LZC", toPort: "TPP" },
      days: { SEA_FCL: { transit: 37 } },
    },
    {
      id: "mx-sea-ver-tpp",
      label: "Veracruz → Tanjung Priok (transit)",
      match: { fromCountry: "MX", fromPort: "VER", toPort: "TPP" },
      days: { SEA_FCL: { transit: 42 } },
    },

    /* ================================================================
       TINGKAT 2 — PER NEGARA

       Rentang, bukan angka pasti: inilah yang dipakai saat pelabuhannya
       belum terdaftar, saat tujuannya bukan Priok/Soekarno-Hatta, atau
       saat kombinasinya (mis. LCL) tidak disebut di tingkat 1.
    ================================================================ */
    {
      id: "vn-id",
      label: "Vietnam → Indonesia",
      match: { fromCountry: "VN", toCountry: "ID" },
      days: {
        AIR: { direct: 1, transit: [2, 3] },
        SEA_FCL: { direct: [5, 7], transit: [8, 10] },
        SEA_LCL: { direct: [8, 10], transit: [12, 15] },
      },
    },
    {
      id: "cn-id",
      label: "China → Indonesia",
      match: { fromCountry: "CN", toCountry: "ID" },
      days: {
        AIR: { direct: [2, 3], transit: [4, 6] },
        SEA_FCL: { direct: [8, 12], transit: [12, 16] },
        SEA_LCL: { direct: [14, 18], transit: [18, 24] },
      },
    },
    {
      id: "ru-id",
      get label() { return tt("Rusia → Indonesia", "Russia → Indonesia"); },
      match: { fromCountry: "RU", toCountry: "ID" },
      days: {
        AIR: { direct: [3, 5], transit: [5, 8] },
        SEA_FCL: { direct: [30, 40], transit: [35, 45] },
        SEA_LCL: { direct: [35, 45], transit: [40, 50] },
      },
    },
    {
      id: "mx-id",
      get label() { return tt("Meksiko → Indonesia", "Mexico → Indonesia"); },
      match: { fromCountry: "MX", toCountry: "ID" },
      days: {
        AIR: { direct: [2, 4], transit: [5, 7] },
        SEA_FCL: { direct: [30, 40], transit: [35, 45] },
        SEA_LCL: { direct: [35, 45], transit: [40, 50] },
      },
    },

    /* CADANGAN — dipakai untuk rute yang belum didaftarkan.
       Angkanya sengaja sedikit lebih longgar daripada rute yang sudah
       diketahui: perkiraan yang kelewat optimis pada rute asing lebih
       merepotkan daripada yang kelewat hati-hati. */
    {
      id: "default",
      /* getter, bukan nilai tetap: objek ini dinilai SEKALI saat
         berkas dimuat, jadi t() yang dipanggil langsung akan membeku
         pada bahasa saat itu dan tidak ikut berganti. */
      get label() {
        return t("s.bawaan.rute.belum.terdaftar");
      },
      match: {},
      days: {
        AIR: { direct: 2, transit: 4 },
        SEA_FCL: { direct: 14, transit: 18 },
        SEA_LCL: { direct: 21, transit: 26 },
      },
    },
  ],

  /* ----------------------------------------------------------------
     LAMA PROSES DARAT — HARI KERJA

     stripping        bongkar muatan gabungan di CFS. HANYA berlaku
                      untuk SEA LCL (lihat strippingAppliesTo). Sengaja
                      TIDAK digabung ke clearance: ia proses tersendiri,
                      dikerjakan pihak lain, dan lamanya berubah-ubah
                      mengikuti antrean CFS — bukan mengikuti Bea Cukai.

     stripping        bongkar muatan gabungan di CFS. HARI KALENDER.

     clearance        dari barang SIAP DIURUS sampai SPPB terbit.
                      Bukan dari PIB diajukan: PIB kerap masuk jauh
                      sebelum kapal sandar, dan mengajukan dokumen
                      lebih awal tidak membuat barangnya keluar lebih
                      cepat.

     delivery         trucking dari pelabuhan/bandara ke pabrik,
                      setelah SPPB terbit.
  ---------------------------------------------------------------- */
  operations: [
    {
      id: "default",
      get label() { return tt("Bawaan", "Default"); },
      match: {},
      days: {
        AIR: { stripping: 0, clearance: 1, delivery: 1 },
        SEA_FCL: { stripping: 0, clearance: 1, delivery: 1 },
        SEA_LCL: { stripping: 2, clearance: 1, delivery: 1 },
      },
    },
  ],

  // Stripping hanya masuk hitungan untuk tipe pengiriman di daftar ini.
  strippingAppliesTo: ["SEA_LCL"],

  /* ----------------------------------------------------------------
     JALUR PENGELUARAN BARANG (SPPJ) — lama clearance per jalur

     Jalur keluar sesaat setelah PIB diajukan dan menentukan lama
     clearance lebih dari apa pun: Hijau/MITA langsung SPPB, Merah
     menunggu pemeriksaan fisik. Jalur Kuning sudah dihapus sejak
     25-04-2022 (PER-02/BC/2022), jadi tidak ada di sini.

     `clearance` = HARI KERJA dari barang siap diurus sampai SPPB,
     menggantikan angka clearance di operations[] untuk kiriman yang
     jalurnya dicatat. Merah: antrean pemeriksaan fisik di Priok
     normalnya beberapa hari, saat padat 7–10 hari (GINSI, Juni 2026);
     layanan Sabtu setengah hari, Minggu tutup. Riwayat kiriman per
     jalur menarik angka ini ke kenyataan (prediction-learning.js).
     Kiriman yang jalurnya belum dicatat tetap memakai operations[].
  ---------------------------------------------------------------- */
  customsLanes: [
    { key: "mita", label: "MITA", clearance: { AIR: 0, SEA_FCL: 0, SEA_LCL: 0 } },
    { key: "hijau", get label() { return tt("Hijau", "Green"); }, clearance: { AIR: 1, SEA_FCL: 1, SEA_LCL: 1 } },
    { key: "merah", get label() { return tt("Merah", "Red"); }, clearance: { AIR: 2, SEA_FCL: 4, SEA_LCL: 3 } },
  ],

  /* ----------------------------------------------------------------
     KEDATANGAN

     manifestLeadDays: berapa hari kalender kapal/pesawat biasanya tiba
     SESUDAH tanggal BC 1.1. Inward manifest wajib diserahkan paling
     lambat 24 jam sebelum kapal tiba (laut) dan sebelum pesawat
     mendarat (udara) -- memakai tanggal Manifest apa adanya sebagai
     kedatangan selalu meleset sehari terlalu awal. Ini angka awal;
     begitu ada kiriman yang punya Manifest DAN Sandar/ATA, jedanya
     dipelajari dari situ (learnedManifestLagDays).
  ---------------------------------------------------------------- */
  arrival: {
    manifestLeadDays: { AIR: 0, SEA_FCL: 1, SEA_LCL: 1, default: 1 },
  },

  /* ----------------------------------------------------------------
     PROSES YANG JALAN TERUS DI AKHIR PEKAN

     Yang tidak disebut di sini memakai HARI KERJA.

     Stripping masuk daftar karena CFS membongkar terus — Sabtu, Minggu,
     hari libur nasional. Menghitungnya sebagai hari kerja membuat
     kontainer yang sandar hari Jumat seolah baru selesai dibongkar hari
     Selasa, padahal sudah kelar Minggu.

     Clearance TIDAK di daftar ini: Bea Cukai tutup. Begitu pula
     trucking ke pabrik.
  ---------------------------------------------------------------- */
  calendarDayLegs: ["stripping"],

  /* ----------------------------------------------------------------
     TIDAK ADA SETELAN "DI MANA STRIPPING TERJADI" — DAN MEMANG TIDAK
     BOLEH ADA.

     Kalau suatu saat terpikir menambahkannya: stripping tidak pernah
     berjangkar pada dokumen, ia berjangkar pada KAPAL SANDAR.
     Kontainer tidak bisa dibongkar sebelum tiba, secepat apa pun PIB
     diajukan. Urutannya dimodelkan apa adanya di
     buildDeliverySchedule(), dengan PIB sebagai GERBANG — bukan titik
     mulai, dan bukan setelan.
  ---------------------------------------------------------------- */

  /* ----------------------------------------------------------------
     MILESTONE YANG MENGGERAKKAN PREDIKSI

     `step` menunjuk ke kunci tahap di js/features/doc-steps.js.
     Urutan daftar ini = urutan prioritas, dari yang PALING meyakinkan
     ke yang paling lemah. Menambah milestone baru (mis. "stripping
     selesai") cukup menyisipkan satu baris di sini.

     asksDate: saat tahap ini dikonfirmasi, pengguna diminta tanggal
     dokumennya — bukan sekadar "ya, sudah ada". Tanggal konfirmasi dan
     tanggal dokumen sering berbeda beberapa hari, dan prediksi memakai
     tanggal DOKUMEN.
  ---------------------------------------------------------------- */
  milestones: [
    { key: "sppb", step: "sppb", label: "SPPB", asksDate: true, confidence: "veryhigh" },
    { key: "billing", step: "billing", label: "Billing BC 2.0", asksDate: true, confidence: "veryhigh" },
    { key: "pib", step: "pib", label: "PIB", asksDate: true, confidence: "high" },
    { key: "manifest", step: "manifest", label: "Manifest", asksDate: true, confidence: "medhigh" },
    /* Paling bawah dalam urutan PRIORITAS, tapi bukan yang paling
       lemah maknanya. Manifest berarti urusan dokumen sudah bergerak;
       Sandar berarti barangnya benar-benar ada di sini. Keduanya
       menjawab pertanyaan yang berbeda, jadi Sandar juga memberi bonus
       keyakinan tersendiri (confidencePercent.bonuses.arrivalConfirmed)
       yang berlaku berapa pun milestone tertingginya. */
    { key: "berth", step: "berth", label: "ATA", asksDate: true, confidence: "medium" },
  ],

  /* ----------------------------------------------------------------
     GERBANG KEPABEANAN

     Tahap yang HARUS sudah lewat sebelum clearance bisa selesai, tapi
     yang tidak mempercepat apa pun kalau diselesaikan lebih awal.

     PIB kerap diajukan sebelum kapal sandar; Billing dibayar setelah
     PIB. Keduanya diperlakukan sama: clearance mulai dari yang PALING
     BELAKANG di antara "barang siap" dan seluruh gerbang ini.
  ---------------------------------------------------------------- */
  clearanceGates: ["pib", "billing"],

  /* Milestone penanda stripping sudah selesai. Belum ada tahapnya di
     stepper, jadi null: untuk LCL, stripping SELALU ikut dihitung.
     Begitu tahapnya dibuat, cukup isi kuncinya di sini. */
  strippingDoneStep: null,

  /* ----------------------------------------------------------------
     TINGKAT KEYAKINAN

     level dipakai untuk mengurutkan & mewarnai, bukan untuk menghitung.
  ---------------------------------------------------------------- */
  confidence: {
    low: { get label() { return tt("Rendah", "Low"); }, level: 1, tone: "low" },
    medium: { get label() { return tt("Sedang", "Medium"); }, level: 2, tone: "medium" },
    medhigh: { get label() { return tt("Cukup Tinggi", "Fairly High"); }, level: 3, tone: "medhigh" },
    high: { get label() { return tt("Tinggi", "High"); }, level: 4, tone: "high" },
    veryhigh: { get label() { return tt("Sangat Tinggi", "Very High"); }, level: 5, tone: "veryhigh" },
    final: { label: "Final", level: 6, tone: "final" },
  },

  // Keyakinan Estimated Delivery saat sumbernya masih ETA saja.
  etaConfidence: { auto: "low", manual: "medium" },

  /* ----------------------------------------------------------------
     LAPIS 1 — PENYESUAIAN CARRIER / FORWARDER

     Sebagian forwarder konsisten lebih lambat atau lebih cepat daripada
     jadwal pelayaran resminya. Ditulis sebagai TAMBAHAN hari terhadap
     angka rute, bukan sebagai tabel rute tersendiri — kalau ditulis
     ulang seluruhnya, satu perubahan angka rute harus disalin ke setiap
     forwarder dan cepat atau lambat ada yang tertinggal.

     Kosong sekarang. Contoh bentuknya:

       { id: "abc", label: "ABC Line lebih lambat 2 hari",
         match: { forwarder: "abc" }, days: 2 }
       { id: "xyz-air", label: "XYZ ekspres",
         match: { forwarder: "xyz", transport: "udara" }, days: -1 }

     Nilai negatif berarti lebih cepat. `match` memakai pencocokan yang
     sama dengan aturan rute.
  ---------------------------------------------------------------- */
  carrierAdjustments: [],

  /* ----------------------------------------------------------------
     KOMITMEN PINTU-KE-PINTU KURIR

     Kurir menjual satu angka: sekian HARI KERJA dari tanggal kirim
     sampai barang di tangan penerima. Angka itu SUDAH memuat
     penerbangan, kepabeanan, dan pengantaran sekaligus — FedEx
     mengurus clearance sendiri, bahkan mengirim data manifes saat
     pesawat masih di udara.

     Karena itu ia TIDAK boleh dipecah jadi transit + clearance +
     antar lalu dijumlahkan: hasilnya akan jauh lebih lama daripada
     yang dijanjikan, dan rantai proses biasa memang tidak berlaku di
     sini.

     Dihitung dari ETD (tanggal kirim), bukan dari ETA.
  ---------------------------------------------------------------- */
  courierCommitments: [
    {
      id: "fedex-priority",
      label: "FedEx International Priority",
      match: { carrier: "FEDEX", service: "PRIORITY" },
      workingDays: 3,
    },
    {
      id: "fedex-economy",
      label: "FedEx International Economy",
      match: { carrier: "FEDEX", service: "ECONOMY" },
      workingDays: 5,
    },
    /* Layanan tidak disebut di kolom Nama Kapal — hanya "FEDEX".
       Priority dipakai sebagai bawaan karena itu layanan yang paling
       sering terpakai untuk kiriman mendesak; tulis "FEDEX ECONOMY"
       di kolom itu kalau yang dipakai layanan ekonomi. */
    {
      id: "fedex-default",
      /* getter, sama dengan label rute bawaan di atas: berkas ini
         dimuat SEBELUM kamus, jadi memanggil t() langsung di sini
         membuat seluruh berkas gagal dimuat -- bukan cuma labelnya
         yang salah. Getter menunda pemanggilannya sampai dibaca. */
      get label() {
        return t("v.fedex.layanan.tidak.disebut.dianggap.priority");
      },
      match: { carrier: "FEDEX" },
      workingDays: 3,
    },
  ],

  /* ----------------------------------------------------------------
     LAPIS 4 — KENYATAAN

     Perkiraan yang tanggalnya sudah lewat tidak memberi tahu apa pun.
     Kalau hari ini sudah melewati tanggal yang diperkirakan sementara
     barang belum sampai, dasar hitungannya digeser ke HARI INI dan sisa
     prosesnya dihitung ulang.

     delayBufferPerWeek — pengiriman yang sudah telat cenderung tetap
     telat. Tiap minggu keterlambatan menambah penyangga sekian hari
     kerja pada sisa proses. Diberi batas supaya kiriman yang macet
     berbulan-bulan tidak menghasilkan perkiraan yang mengada-ada.
  ---------------------------------------------------------------- */
  reality: {
    enabled: true,
    graceDays: 0,
    delayBufferPerWeek: 1,
    maxDelayBuffer: 5,
  },

  /* ----------------------------------------------------------------
     BELAJAR DARI RIWAYAT

     Angka konfigurasi adalah tebakan terbaik SEBELUM ada data. Begitu
     cukup banyak pengiriman nyata terkumpul pada rute yang sama, angka
     itu digantikan yang benar-benar terjadi.

     minSamples — di bawah ini riwayatnya belum cukup untuk dipercaya;
       satu kapal yang kebetulan telat tidak boleh menggeser seluruh
       perkiraan rute.
     method "median" — bukan rata-rata. Satu kiriman yang tertahan 60
       hari karena sengketa dokumen akan menarik rata-rata jauh dari
       kenyataan sehari-hari; median mengabaikannya.
     maxAgeDays — jadwal pelayaran berubah. Data dua tahun lalu bukan
       lagi keterangan tentang rute yang sekarang.
  ---------------------------------------------------------------- */
  learning: {
    enabled: true,

    /* JUMLAH SAMPEL MINIMAL sebelum riwayat ikut menarik angka.

       Dulu 8, dan riwayat bersifat semua-atau-tidak: di bawah 8 diabaikan,
       dari 8 menggantikan konfigurasi sepenuhnya. Dengan ~47 kiriman laut
       yang tersebar di 20-an pelayaran, kebanyakan rute tidak pernah
       sampai 8 -- bukti yang sudah ada tidak pernah terpakai.

       Sekarang riwayat DIGABUNG dengan asumsi (lihat ringkasSampel di
       prediction-learning.js), jadi dua kiriman sudah boleh ikut bicara;
       seberapa keras ditentukan bobotnya, bukan gerbang ini. Satu kiriman
       saja masih terlalu mudah kebetulan. */
    minSamples: 2,

    /* SEBERAPA RAGU KITA PADA ANGKA KONFIGURASI (hari, simpangan baku).
       Makin besar, makin cepat riwayat mengambil alih. Laut 2 hari:
       tabel rute memang tebakan per wilayah, meleset 1-3 hari biasa.
       Udara 1 hari. "ops" untuk clearance & antar ke pabrik (hari kerja). */
    priorSpreadDays: { AIR: 1, SEA_FCL: 2, SEA_LCL: 2, ops: 1, ops_merah: 2, lag: 1, default: 2 },

    /* SEBARAN WAJAR riwayat (hari) -- dipakai menimbang saat sampel rute
       masih di bawah tiga dan sebarannya belum bisa diukur sendiri.
       Laut ~1,5 hari sesuai yang terukur di riwayat DDI. Jalur merah
       jauh lebih berayun (antrean pemeriksaan fisik). */
    typicalSpreadDays: { AIR: 0.8, SEA_FCL: 1.5, SEA_LCL: 1.5, ops: 1, ops_merah: 2, lag: 0.8, default: 1.5 },

    /* PARUH UMUR (hari). Kiriman setua ini berbobot setengah, dua kali
       ini seperempat. Jadwal pelayaran, alur Bea Cukai, dan rekanan
       trucking berubah -- kiriman bulan lalu lebih mewakili daripada
       kiriman tahun lalu, tanpa membuang yang lama sama sekali. */
    halfLifeDays: 240,

    /* Jadwal pelayaran berubah. 540 hari menampung satu putaran musim
       penuh plus pengulangannya — dipertahankan justru karena volume
       DDI rendah: mempersempitnya akan membuang sampel yang justru
       sedang dibutuhkan. */
    maxAgeDays: 540,

    /* "mean" sesuai spesifikasi, TAPI pencilan dibuang lebih dulu.

       Rata-rata mentah rapuh pada data logistik: satu kiriman yang
       tertahan enam minggu karena sengketa dokumen menarik seluruh
       angka jauh dari kenyataan sehari-hari. outlierSigma membuang
       yang menyimpang lebih dari sekian simpangan baku sebelum
       dirata-rata — hasilnya tetap "rata-rata", tapi rata-rata dari
       pengiriman yang normal.

       Pilihan lain: "median" (paling tahan pencilan) atau "mean"
       dengan outlierSigma: 0 (rata-rata mentah). */
    method: "mean",
    outlierSigma: 2,
  },

  /* ----------------------------------------------------------------
     KEYAKINAN DALAM PERSEN

     `base` — titik awal menurut sumber prediksi.
     `penalties` — dikurangkan; tiap butir menjawab satu pertanyaan
       "apa yang masih belum diketahui di sini".
     `bonuses.learned` — angka dari riwayat nyata lebih layak dipercaya
       daripada asumsi konfigurasi.

     Persen ini BUKAN peluang statistik. Ia ukuran seberapa banyak yang
     sudah dipastikan versus masih diasumsikan — dan ditampilkan
     bersama sumbernya supaya bisa ditelusuri, bukan ditelan bulat.
  ---------------------------------------------------------------- */
  confidencePercent: {
    base: {
      onlyEtd: 25,      // ETD ada, ETA belum bisa dihitung
      eta_auto: 50,     // Medium
      eta_manual: 65,   // Medium High
      berth: 72,        // kedatangan sudah pasti
      manifest: 80,     // High
      pib: 90,          // Very High
      billing: 95,
      sppb: 99,
      actual: 100,      // Final
      manual: 60,
    },
    penalties: {
      routeUnresolved: 15,
      typeAssumed: 5,
      ruleFallback: 8,
      wideRangePerDay: 1,
      maxWideRange: 12,
      overduePerDay: 2,
      maxOverdue: 20,
      realityShifted: 10,
    },
    // laneKnown: jalur PIB sudah dicatat, SPPB belum terbit
    bonuses: { learned: 8, arrivalConfirmed: 5, laneKnown: 3 },
    floor: 5,

    /* "Final" hanya untuk barang yang BENAR-BENAR sudah masuk pabrik.
       Tanpa atap ini, SPPB (99) ditambah bonus kedatangan (5) menembus
       100 dan papan menyatakan Final untuk kiriman yang bahkan belum
       keluar pelabuhan. */
    capWithoutArrival: 99,
    // Persen -> label. Diperiksa dari atas.
    bands: [
      { min: 100, key: "final" },
      { min: 90, key: "veryhigh" },
      { min: 78, key: "high" },
      { min: 62, key: "medhigh" },
      { min: 45, key: "medium" },
      { min: 0, key: "low" },
    ],
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PREDICTION_CONFIG };
}
