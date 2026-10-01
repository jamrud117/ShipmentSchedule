"use strict";

/* ==================================================================
   REFERENSI PELABUHAN & BANDARA

   DUA BENTUK KODE, SATU DAFTAR.

     unlocode  KRPUS, IDTPP, IDCGK — bentuk resmi UN/LOCODE, 2 huruf
               negara + 3 huruf lokasi. Inilah yang tercetak di PIB,
               PEB, B/L, dan berkas Excel dari forwarder.

     code      PUS, TPP, CGK — bentuk pendek gaya IATA. Inilah yang
               DITAMPILKAN di layar dan disimpan untuk jadwal baru.

   Bentuk pendek diturunkan otomatis dengan memangkas dua huruf negara,
   jadi tidak ada daftar kedua yang harus dijaga tetap sinkron.

   Pengenalannya BERLAKU DUA ARAH. Dokumen impor tetap menulis IDCGK,
   dan itu harus tetap terbaca sebagai CGK — kalau tidak, seluruh
   ekstraksi PIB/PEB/CIPL berhenti mengenali pelabuhan pada hari fitur
   ini dipasang, tanpa satu pun pesan galat.

   Satu-satunya pengecualian ditandai dengan `iata` (lihat MYTPP).
================================================================== */

const UNLOCODES_RAW = [
  // INDONESIA — pelabuhan laut
  { unlocode: "IDTPP", name: "Tanjung Priok, Jakarta", country: "ID", type: "laut",
    aliases: ["tanjung priok", "priok", "jakarta port", "tg priok", "tg. priok"] },
  { unlocode: "IDJKT", name: "Jakarta", country: "ID", type: "laut", metro: "IDTPP", aliases: ["jakarta"] },
  { unlocode: "IDSUB", name: "Tanjung Perak, Surabaya", country: "ID", type: "laut",
    aliases: ["tanjung perak", "perak", "surabaya"] },
  { unlocode: "IDSRG", name: "Tanjung Emas, Semarang", country: "ID", type: "laut",
    aliases: ["tanjung emas", "semarang"] },
  { unlocode: "IDBLW", name: "Belawan, Medan", country: "ID", type: "laut", aliases: ["belawan", "medan"] },
  { unlocode: "IDPNK", name: "Pontianak", country: "ID", type: "laut", aliases: ["pontianak"] },
  { unlocode: "IDPLM", name: "Palembang", country: "ID", type: "laut", aliases: ["palembang", "boom baru"] },
  { unlocode: "IDPNJ", name: "Panjang, Lampung", country: "ID", type: "laut", aliases: ["panjang", "lampung"] },
  { unlocode: "IDMAK", name: "Makassar", country: "ID", type: "laut", aliases: ["makassar", "ujung pandang", "soekarno hatta makassar"] },
  { unlocode: "IDBTM", name: "Batam", country: "ID", type: "laut", aliases: ["batam", "batu ampar"] },
  { unlocode: "IDBPN", name: "Balikpapan", country: "ID", type: "laut", aliases: ["balikpapan"] },
  { unlocode: "IDBIT", name: "Bitung", country: "ID", type: "laut", aliases: ["bitung"] },
  { unlocode: "IDCXP", name: "Cirebon", country: "ID", type: "laut", aliases: ["cirebon"] },
  { unlocode: "IDMER", name: "Merak", country: "ID", type: "laut", aliases: ["merak"] },
  { unlocode: "IDCGD", name: "Cigading", country: "ID", type: "laut", aliases: ["cigading"] },
  { unlocode: "IDPAT", name: "Patimban", country: "ID", type: "laut", aliases: ["patimban"] },

  // INDONESIA — bandara
  { unlocode: "IDCGK", name: "Soekarno-Hatta Intl Airport, Jakarta", country: "ID", type: "udara",
    aliases: ["jakarta airport", "soekarno", "soekarno-hatta", "soekarno hatta", "cengkareng", "halim", "jakarta apt", "cgk"] },
  { unlocode: "IDSUB", name: "Juanda Intl Airport, Surabaya", country: "ID", type: "udara",
    aliases: ["juanda", "surabaya airport"] },
  { unlocode: "IDDPS", name: "Ngurah Rai Intl Airport, Denpasar", country: "ID", type: "udara",
    aliases: ["denpasar", "ngurah rai", "bali airport", "dps"] },
  { unlocode: "IDKNO", name: "Kualanamu Intl Airport, Medan", country: "ID", type: "udara",
    aliases: ["kualanamu", "medan airport"] },

  // KOREA
  { unlocode: "KRPUS", name: "Busan", country: "KR", type: "laut",
    /* "bsn" muncul di dokumen forwarder & kolom yang diketik tangan.
       Bukan kode resmi, tapi itulah yang benar-benar ditulis orang. */
    aliases: ["busan", "pusan", "busan (ex pusan)", "ex pusan", "bsn"] },
  { unlocode: "KRINC", name: "Incheon Port", country: "KR", type: "laut", aliases: ["incheon port", "incheon seaport"] },
  { unlocode: "KRICN", name: "Incheon Intl Airport, Seoul", country: "KR", type: "udara",
    aliases: ["incheon airport", "incheon intl apt", "incheon", "seoul airport", "seoul", "icn"] },
  { unlocode: "KRKAN", name: "Gwangyang", country: "KR", type: "laut",
    /* Dulu tertulis "Gwangju" -- kota pedalaman tanpa pelabuhan. KRKAN
       adalah Gwangyang. Alias lama dipertahankan supaya teks yang dulu
       diketik tetap terbaca ke entri yang sama. */
    aliases: ["gwangyang", "kwangyang", "gwangju", "kwangju"] },
  { unlocode: "KRKPO", name: "Pohang", country: "KR", type: "laut", aliases: ["pohang"] },

  // CHINA / HONG KONG / TAIWAN
  { unlocode: "CNSHA", name: "Shanghai", country: "CN", type: "laut", aliases: ["shanghai"] },
  { unlocode: "CNNGB", name: "Ningbo", country: "CN", type: "laut", aliases: ["ningbo"] },
  { unlocode: "CNSZX", name: "Shenzhen", country: "CN", type: "laut", aliases: ["shenzhen"] },
  { unlocode: "CNTAO", name: "Qingdao", country: "CN", type: "laut", aliases: ["qingdao", "tsingtao"] },
  { unlocode: "CNTSN", name: "Tianjin / Xingang", country: "CN", type: "laut", aliases: ["tianjin", "xingang"] },
  { unlocode: "CNCAN", name: "Guangzhou", country: "CN", type: "laut", aliases: ["guangzhou", "canton", "nansha"] },
  { unlocode: "CNXMN", name: "Xiamen", country: "CN", type: "laut", aliases: ["xiamen", "amoy"] },
  { unlocode: "CNTXG", name: "Xingang, Tianjin", country: "CN", type: "laut", metro: "CNTSN",
    aliases: ["xingang", "xin gang", "tianjin xingang", "txg"] },
  { unlocode: "CNPVG", name: "Pudong Intl Airport, Shanghai", country: "CN", type: "udara",
    aliases: ["pudong", "shanghai airport", "pvg"] },
  { unlocode: "CNSHA", name: "Hongqiao Intl Airport, Shanghai", country: "CN", type: "udara",
    aliases: ["hongqiao", "hong qiao", "sha"] },
  { unlocode: "CNCAN", name: "Baiyun Intl Airport, Guangzhou", country: "CN", type: "udara",
    aliases: ["baiyun", "guangzhou airport", "can"] },
  { unlocode: "CNSZX", name: "Bao'an Intl Airport, Shenzhen", country: "CN", type: "udara",
    aliases: ["bao'an", "baoan", "shenzhen airport", "szx"] },
  { unlocode: "CNPEK", name: "Capital Intl Airport, Beijing", country: "CN", type: "udara",
    aliases: ["beijing capital", "beijing airport", "beijing", "peking", "pek"] },
  { unlocode: "CNTAO", name: "Jiaodong Intl Airport, Qingdao", country: "CN", type: "udara",
    aliases: ["jiaodong", "qingdao airport", "tao"] },
  { unlocode: "HKHKG", name: "Hong Kong", country: "HK", type: "laut", aliases: ["hong kong", "hongkong", "hkg"] },
  { unlocode: "TWKHH", name: "Kaohsiung", country: "TW", type: "laut", aliases: ["kaohsiung"] },
  { unlocode: "TWTPE", name: "Taoyuan Intl Airport, Taipei", country: "TW", type: "udara",
    aliases: ["taipei", "taoyuan", "tpe"] },
  { unlocode: "TWKEL", name: "Keelung", country: "TW", type: "laut", aliases: ["keelung", "chilung"] },

  // JEPANG
  { unlocode: "JPTYO", name: "Tokyo", country: "JP", type: "laut", aliases: ["tokyo"] },
  { unlocode: "JPYOK", name: "Yokohama", country: "JP", type: "laut", aliases: ["yokohama"] },
  { unlocode: "JPOSA", name: "Osaka", country: "JP", type: "laut", aliases: ["osaka"] },
  { unlocode: "JPUKB", name: "Kobe", country: "JP", type: "laut", aliases: ["kobe"] },
  { unlocode: "JPNGO", name: "Nagoya", country: "JP", type: "laut", aliases: ["nagoya"] },
  { unlocode: "JPNRT", name: "Narita Intl Airport, Tokyo", country: "JP", type: "udara",
    aliases: ["narita", "tokyo airport", "nrt"] },
  { unlocode: "JPKIX", name: "Kansai Intl Airport, Osaka", country: "JP", type: "udara",
    aliases: ["kansai", "osaka airport", "kix"] },

  // ASIA TENGGARA
  { unlocode: "SGSIN", name: "Singapore", country: "SG", type: "laut", aliases: ["singapore", "singapura", "sin"] },
  { unlocode: "MYPKG", name: "Port Klang", country: "MY", type: "laut", aliases: ["port klang", "klang", "pelabuhan klang"] },
  { unlocode: "MYPEN", name: "Penang", country: "MY", type: "laut", aliases: ["penang", "pinang"] },
  /* SATU-SATUNYA kode pendek yang perlu ditentukan sendiri.

     Memangkas MYTPP jadi "TPP" akan bertabrakan dengan IDTPP —
     Tanjung Priok — yang justru pelabuhan tersibuk di aplikasi ini.
     Dua pelabuhan berbeda benua tidak boleh memakai satu kode.

     "PTP" bukan karangan: itu singkatan yang memang dipakai industri
     untuk Port of Tanjung Pelepas, dan sudah ada di daftar alias
     entri ini. */
  { unlocode: "MYTPP", iata: "PTP", name: "Tanjung Pelepas", country: "MY", type: "laut",
    aliases: ["tanjung pelepas", "ptp"] },
  { unlocode: "THBKK", name: "Bangkok", country: "TH", type: "laut", aliases: ["bangkok"] },
  { unlocode: "THLCH", name: "Laem Chabang", country: "TH", type: "laut", aliases: ["laem chabang"] },
  { unlocode: "VNSGN", name: "Ho Chi Minh City", country: "VN", type: "laut",
    aliases: ["ho chi minh", "hochiminh", "saigon"] },
  { unlocode: "VNHPH", name: "Haiphong", country: "VN", type: "laut", aliases: ["haiphong", "hai phong"] },
  { unlocode: "VNDAD", name: "Da Nang", country: "VN", type: "laut", aliases: ["da nang", "danang"] },

  /* TERMINAL PETI KEMAS VIETNAM.

     Dokumen dari forwarder Vietnam menulis nama TERMINAL, bukan nama
     kotanya -- "CAT LAI", "CAI MEP", "DINH VU". Tanpa entri ini,
     pembacaan PIB/PEB/CIPL berhenti mengenali pelabuhannya dan
     kolomnya dibiarkan kosong.

     Alias "cat lai" dipindahkan dari VNSGN ke VNCLI: keduanya di Ho
     Chi Minh, tapi Cat Lai punya kodenya sendiri dan itu yang tercetak
     di B/L. */
  { unlocode: "VNCLI", name: "Cat Lai Terminal, Ho Chi Minh City", country: "VN", type: "laut", metro: "VNSGN",
    aliases: ["cat lai", "catlai", "cang cat lai"] },
  { unlocode: "VNCSG", name: "Sai Gon Port, Ho Chi Minh City", country: "VN", type: "laut", metro: "VNSGN",
    aliases: ["sai gon port", "saigon port", "cang sai gon"] },
  { unlocode: "VNVIC", name: "VICT Terminal, Ho Chi Minh City", country: "VN", type: "laut", metro: "VNSGN",
    aliases: ["vict", "vietnam international container terminal"] },
  { unlocode: "VNHPP", name: "Tan Cang Hiep Phuoc, Ho Chi Minh City", country: "VN", type: "laut", metro: "VNSGN",
    aliases: ["hiep phuoc", "tan cang hiep phuoc"] },

  /* Cai Mep - Thi Vai: terminal laut dalam untuk kapal besar, dipakai
     rute jarak jauh yang tidak bisa masuk sungai ke Cat Lai. */
  { unlocode: "VNCMT", name: "Cai Mep Intl Terminal, Ba Ria-Vung Tau", country: "VN", type: "laut", metro: "VNVUT",
    aliases: ["cai mep", "caimep", "cmit", "thi vai", "tcit", "tctt", "gemalink"] },
  { unlocode: "VNVUT", name: "Vung Tau", country: "VN", type: "laut",
    aliases: ["vung tau", "vungtau"] },
  { unlocode: "VNPHU", name: "Phu My, Ba Ria-Vung Tau", country: "VN", type: "laut", metro: "VNVUT",
    aliases: ["phu my", "phumy"] },

  // Haiphong: kota pelabuhannya satu, terminalnya beberapa.
  { unlocode: "VNDVU", name: "Dinh Vu Terminal, Haiphong", country: "VN", type: "laut", metro: "VNHPH",
    aliases: ["dinh vu", "dinhvu"] },
  { unlocode: "VNCVE", name: "Chua Ve Terminal, Haiphong", country: "VN", type: "laut", metro: "VNHPH",
    aliases: ["chua ve", "chuave"] },
  { unlocode: "VNDXA", name: "Doan Xa Terminal, Haiphong", country: "VN", type: "laut", metro: "VNHPH",
    aliases: ["doan xa", "doanxa"] },
  { unlocode: "VNTVN", name: "Transvina Terminal, Haiphong", country: "VN", type: "laut", metro: "VNHPH",
    aliases: ["transvina"] },
  { unlocode: "VNCLN", name: "Cai Lan, Quang Ninh", country: "VN", type: "laut",
    aliases: ["cai lan", "cailan", "quang ninh"] },

  // Vietnam tengah & selatan
  { unlocode: "VNDTS", name: "Tien Sa Terminal, Da Nang", country: "VN", type: "laut", metro: "VNDAD",
    aliases: ["tien sa", "tiensa"] },
  { unlocode: "VNCMY", name: "Chan May Port", country: "VN", type: "laut",
    aliases: ["chan may", "chanmay"] },
  { unlocode: "VNDQT", name: "Dung Quat", country: "VN", type: "laut",
    aliases: ["dung quat", "dungquat"] },
  { unlocode: "VNUIH", name: "Qui Nhon", country: "VN", type: "laut",
    aliases: ["qui nhon", "quy nhon", "quynhon"] },
  { unlocode: "VNCXR", name: "Cam Ranh", country: "VN", type: "laut",
    aliases: ["cam ranh", "camranh"] },
  { unlocode: "VNVCA", name: "Can Tho", country: "VN", type: "laut",
    aliases: ["can tho", "cantho"] },
  { unlocode: "VNSGN", name: "Tan Son Nhat Intl Airport, Ho Chi Minh City", country: "VN", type: "udara",
    aliases: ["tan son nhat", "tansonnhat", "ho chi minh airport", "saigon airport", "sgn"] },
  { unlocode: "VNHAN", name: "Noi Bai Intl Airport, Hanoi", country: "VN", type: "udara",
    aliases: ["noi bai", "noibai", "hanoi", "ha noi", "han"] },
  { unlocode: "PHMNL", name: "Manila", country: "PH", type: "laut", aliases: ["manila"] },

  // INDIA / TIMUR TENGAH
  { unlocode: "INNSA", name: "Nhava Sheva (JNPT)", country: "IN", type: "laut", aliases: ["nhava sheva", "jnpt", "mumbai"] },
  { unlocode: "INMAA", name: "Chennai", country: "IN", type: "laut", aliases: ["chennai", "madras"] },
  { unlocode: "AEJEA", name: "Jebel Ali, Dubai", country: "AE", type: "laut", aliases: ["jebel ali", "dubai"] },

  // EROPA
  { unlocode: "NLRTM", name: "Rotterdam", country: "NL", type: "laut", aliases: ["rotterdam"] },
  { unlocode: "DEHAM", name: "Hamburg", country: "DE", type: "laut", aliases: ["hamburg"] },
  { unlocode: "BEANR", name: "Antwerp", country: "BE", type: "laut", aliases: ["antwerp", "antwerpen"] },
  { unlocode: "GBFXT", name: "Felixstowe", country: "GB", type: "laut", aliases: ["felixstowe"] },
  { unlocode: "ITGOA", name: "Genoa", country: "IT", type: "laut", aliases: ["genoa", "genova"] },
  { unlocode: "FRLEH", name: "Le Havre", country: "FR", type: "laut", aliases: ["le havre"] },

  // RUSIA
  { unlocode: "RUVVO", name: "Vladivostok", country: "RU", type: "laut", aliases: ["vladivostok"] },
  { unlocode: "RUVYP", name: "Vostochny", country: "RU", type: "laut", aliases: ["vostochny", "vostochniy", "wostotschny"] },
  { unlocode: "RULED", name: "St Petersburg", country: "RU", type: "laut",
    aliases: ["st petersburg", "saint petersburg", "st. petersburg", "petersburg"] },
  { unlocode: "RUNVS", name: "Novorossiysk", country: "RU", type: "laut", aliases: ["novorossiysk", "novorossiisk"] },
  { unlocode: "RUSVO", name: "Sheremetyevo Intl Airport, Moscow", country: "RU", type: "udara",
    aliases: ["sheremetyevo", "moscow airport", "moskow", "moskwa", "svo"] },
  { unlocode: "RUVKO", name: "Vnukovo Intl Airport, Moscow", country: "RU", type: "udara",
    aliases: ["vnukovo", "vko"] },
  { unlocode: "RUDME", name: "Domodedovo Intl Airport, Moscow", country: "RU", type: "udara",
    aliases: ["domodedovo", "dme"] },
  { unlocode: "RULED", name: "Pulkovo Airport, St Petersburg", country: "RU", type: "udara",
    aliases: ["pulkovo", "st petersburg airport", "led"] },

  // MEKSIKO
  { unlocode: "MXZLO", name: "Manzanillo", country: "MX", type: "laut", aliases: ["manzanillo"] },
  { unlocode: "MXLZC", name: "Lazaro Cardenas", country: "MX", type: "laut",
    aliases: ["lazaro cardenas", "lázaro cárdenas", "lazaro"] },
  { unlocode: "MXVER", name: "Veracruz", country: "MX", type: "laut", aliases: ["veracruz"] },
  { unlocode: "MXATM", name: "Altamira", country: "MX", type: "laut", aliases: ["altamira"] },
  { unlocode: "MXMEX", name: "Benito Juarez Intl Airport, Mexico City", country: "MX", type: "udara",
    aliases: ["benito juarez", "mexico city", "ciudad de mexico", "mex"] },
  { unlocode: "MXMTY", name: "Monterrey Intl Airport", country: "MX", type: "udara",
    aliases: ["monterrey", "mty"] },
  { unlocode: "MXGDL", name: "Guadalajara Intl Airport", country: "MX", type: "udara",
    aliases: ["guadalajara", "gdl"] },

  // AMERIKA & OSEANIA
  { unlocode: "USLAX", name: "Los Angeles", country: "US", type: "laut", aliases: ["los angeles", "lax"] },
  { unlocode: "USLGB", name: "Long Beach", country: "US", type: "laut", aliases: ["long beach"] },
  { unlocode: "USNYC", name: "New York", country: "US", type: "laut", aliases: ["new york", "newark"] },
  { unlocode: "USSEA", name: "Seattle", country: "US", type: "laut", aliases: ["seattle"] },
  { unlocode: "USHOU", name: "Houston", country: "US", type: "laut", aliases: ["houston"] },
  { unlocode: "AUSYD", name: "Sydney", country: "AU", type: "laut", aliases: ["sydney"] },
  { unlocode: "AUMEL", name: "Melbourne", country: "AU", type: "laut", aliases: ["melbourne"] },
  /* ==================================================================
     TAMBAHAN 2026-10 — rute Indonesia <-> Cina, Korea, Vietnam, Rusia,
     plus bandara hub tempat kargo maskapai asing singgah.

     `metro` = pelabuhan induk sekota. Terminal punya kodenya sendiri
     (itu yang tercetak di B/L), tapi untuk BELAJAR dari riwayat dan
     menebak rute, Shekou/Yantian/Chiwan dihitung satu kelompok dengan
     Shenzhen -- kapal yang sama, lama pelayaran yang sama. Tanpa ini,
     riwayat satu pelabuhan terpecah ke beberapa kode dan tidak pernah
     cukup untuk dipelajari.
  ================================================================== */
  { unlocode: "CNSHK", name: "Shekou, Shenzhen", country: "CN", type: "laut", metro: "CNSZX", aliases: ["shekou"] },
  { unlocode: "CNYTN", name: "Yantian, Shenzhen", country: "CN", type: "laut", metro: "CNSZX", aliases: ["yantian"] },
  { unlocode: "CNCWN", name: "Chiwan, Shenzhen", country: "CN", type: "laut", metro: "CNSZX", aliases: ["chiwan"] },
  { unlocode: "CNHUA", name: "Huangpu, Guangzhou", country: "CN", type: "laut", metro: "CNCAN", aliases: ["huangpu"] },
  { unlocode: "CNDLC", name: "Dalian", country: "CN", type: "laut", aliases: ["dalian"] },
  { unlocode: "CNLYG", name: "Lianyungang", country: "CN", type: "laut", aliases: ["lianyungang"] },
  { unlocode: "CNFOC", name: "Fuzhou", country: "CN", type: "laut", aliases: ["fuzhou", "mawei"] },
  { unlocode: "CNZJG", name: "Zhangjiagang", country: "CN", type: "laut", aliases: ["zhangjiagang"] },
  { unlocode: "CNTAC", name: "Taicang", country: "CN", type: "laut", aliases: ["taicang"] },
  { unlocode: "CNNKG", name: "Nanjing", country: "CN", type: "laut", aliases: ["nanjing"] },
  { unlocode: "CNNTG", name: "Nantong", country: "CN", type: "laut", aliases: ["nantong"] },
  { unlocode: "CNWUH", name: "Wuhan", country: "CN", type: "laut", aliases: ["wuhan"] },
  { unlocode: "CNZUH", name: "Zhuhai", country: "CN", type: "laut", aliases: ["zhuhai", "gaolan"] },
  { unlocode: "CNJMN", name: "Jiangmen", country: "CN", type: "laut", aliases: ["jiangmen"] },
  { unlocode: "CNSWA", name: "Shantou", country: "CN", type: "laut", aliases: ["shantou"] },
  { unlocode: "CNQZH", name: "Qinzhou", country: "CN", type: "laut", aliases: ["qinzhou"] },
  { unlocode: "CNFAN", name: "Fangchenggang", country: "CN", type: "laut", aliases: ["fangcheng", "fangchenggang"] },
  { unlocode: "CNBHY", name: "Beihai", country: "CN", type: "laut", aliases: ["beihai"] },
  { unlocode: "CNHAK", name: "Haikou", country: "CN", type: "laut", aliases: ["haikou"] },
  { unlocode: "CNRZH", name: "Rizhao", country: "CN", type: "laut", aliases: ["rizhao"] },
  { unlocode: "CNYNT", name: "Yantai", country: "CN", type: "laut", aliases: ["yantai"] },
  { unlocode: "CNWEI", name: "Weihai", country: "CN", type: "laut", aliases: ["weihai"] },
  { unlocode: "CNYIK", name: "Yingkou", country: "CN", type: "laut", aliases: ["yingkou"] },
  { unlocode: "CNPKX", name: "Daxing Intl Airport, Beijing", country: "CN", type: "udara", aliases: ["daxing", "beijing daxing", "pkx"] },
  { unlocode: "CNXMN", name: "Gaoqi Intl Airport, Xiamen", country: "CN", type: "udara", aliases: ["gaoqi", "xiamen airport"] },
  { unlocode: "CNCTU", name: "Shuangliu Intl Airport, Chengdu", country: "CN", type: "udara", aliases: ["chengdu", "shuangliu", "ctu"] },
  { unlocode: "CNTFU", name: "Tianfu Intl Airport, Chengdu", country: "CN", type: "udara", aliases: ["tianfu", "tfu"] },
  { unlocode: "CNCKG", name: "Jiangbei Intl Airport, Chongqing", country: "CN", type: "udara", aliases: ["chongqing", "ckg"] },
  { unlocode: "CNHGH", name: "Xiaoshan Intl Airport, Hangzhou", country: "CN", type: "udara", aliases: ["hangzhou", "hgh"] },
  { unlocode: "CNNKG", name: "Lukou Intl Airport, Nanjing", country: "CN", type: "udara", aliases: ["lukou", "nanjing airport"] },
  { unlocode: "CNTSN", name: "Binhai Intl Airport, Tianjin", country: "CN", type: "udara", aliases: ["tianjin airport", "binhai"] },
  { unlocode: "CNDLC", name: "Zhoushuizi Intl Airport, Dalian", country: "CN", type: "udara", aliases: ["dalian airport"] },
  { unlocode: "CNWUH", name: "Tianhe Intl Airport, Wuhan", country: "CN", type: "udara", aliases: ["wuhan airport", "tianhe"] },
  { unlocode: "CNCGO", name: "Xinzheng Intl Airport, Zhengzhou", country: "CN", type: "udara", aliases: ["zhengzhou", "cgo"] },
  { unlocode: "CNEHU", name: "Huahu Airport, Ezhou", country: "CN", type: "udara", aliases: ["ezhou", "huahu", "ehu"] },
  { unlocode: "CNKMG", name: "Changshui Intl Airport, Kunming", country: "CN", type: "udara", aliases: ["kunming", "kmg"] },
  { unlocode: "CNXIY", name: "Xianyang Intl Airport, Xi'an", country: "CN", type: "udara", aliases: ["xi'an", "xian", "xiy"] },
  { unlocode: "CNFOC", name: "Changle Intl Airport, Fuzhou", country: "CN", type: "udara", aliases: ["fuzhou airport", "changle"] },
  { unlocode: "CNNNG", name: "Wuxu Intl Airport, Nanning", country: "CN", type: "udara", aliases: ["nanning", "nng"] },
  { unlocode: "CNHAK", name: "Meilan Intl Airport, Haikou", country: "CN", type: "udara", aliases: ["haikou airport", "meilan"] },
  { unlocode: "HKHKG", name: "Hong Kong Intl Airport", country: "HK", type: "udara", aliases: ["chek lap kok", "hong kong airport"] },
  { unlocode: "KRPTK", name: "Pyeongtaek", country: "KR", type: "laut", aliases: ["pyeongtaek", "pyongtaek"] },
  { unlocode: "KRUSN", name: "Ulsan", country: "KR", type: "laut", aliases: ["ulsan"] },
  { unlocode: "KRMAS", name: "Masan", country: "KR", type: "laut", aliases: ["masan", "changwon"] },
  { unlocode: "KRKUV", name: "Gunsan", country: "KR", type: "laut", aliases: ["gunsan", "kunsan"] },
  { unlocode: "KRMOK", name: "Mokpo", country: "KR", type: "laut", aliases: ["mokpo"] },
  { unlocode: "KRGMP", name: "Gimpo Intl Airport, Seoul", country: "KR", type: "udara", aliases: ["gimpo", "kimpo", "gmp"] },
  { unlocode: "KRPUS", name: "Gimhae Intl Airport, Busan", country: "KR", type: "udara", aliases: ["gimhae", "kimhae", "busan airport"] },
  { unlocode: "KRCJU", name: "Jeju Intl Airport", country: "KR", type: "udara", aliases: ["jeju", "cju"] },
  { unlocode: "VNDAD", name: "Da Nang Intl Airport", country: "VN", type: "udara", aliases: ["da nang airport"] },
  { unlocode: "VNHPH", name: "Cat Bi Intl Airport, Haiphong", country: "VN", type: "udara", aliases: ["cat bi", "haiphong airport"] },
  { unlocode: "VNCXR", name: "Cam Ranh Intl Airport", country: "VN", type: "udara", aliases: ["cam ranh airport"] },
  { unlocode: "RUNJK", name: "Nakhodka", country: "RU", type: "laut", aliases: ["nakhodka"] },
  { unlocode: "RUKGD", name: "Kaliningrad", country: "RU", type: "laut", aliases: ["kaliningrad"] },
  { unlocode: "RUULU", name: "Ust-Luga", country: "RU", type: "laut", aliases: ["ust-luga", "ust luga"] },
  { unlocode: "RUMMK", name: "Murmansk", country: "RU", type: "laut", aliases: ["murmansk"] },
  { unlocode: "RUVVO", name: "Knevichi Intl Airport, Vladivostok", country: "RU", type: "udara", aliases: ["knevichi", "vladivostok airport"] },
  { unlocode: "RUOVB", name: "Tolmachevo Airport, Novosibirsk", country: "RU", type: "udara", aliases: ["novosibirsk", "tolmachevo", "ovb"] },
  { unlocode: "RUKJA", name: "Yemelyanovo Airport, Krasnoyarsk", country: "RU", type: "udara", aliases: ["krasnoyarsk", "kja"] },
  { unlocode: "RUKHV", name: "Khabarovsk Novy Airport", country: "RU", type: "udara", aliases: ["khabarovsk", "khv"] },
  { unlocode: "RUSVX", name: "Koltsovo Airport, Yekaterinburg", country: "RU", type: "udara", aliases: ["yekaterinburg", "ekaterinburg", "koltsovo", "svx"] },
  { unlocode: "IDBDJ", name: "Banjarmasin", country: "ID", type: "laut", aliases: ["banjarmasin", "trisakti"] },
  { unlocode: "IDDUM", name: "Dumai", country: "ID", type: "laut", aliases: ["dumai"] },
  { unlocode: "IDGRE", name: "Gresik", country: "ID", type: "laut", aliases: ["gresik"] },
  { unlocode: "IDSRI", name: "Samarinda", country: "ID", type: "laut", aliases: ["samarinda"] },
  { unlocode: "IDKDI", name: "Kendari", country: "ID", type: "laut", aliases: ["kendari"] },
  { unlocode: "IDAMQ", name: "Ambon", country: "ID", type: "laut", aliases: ["ambon"] },
  { unlocode: "IDSOQ", name: "Sorong", country: "ID", type: "laut", aliases: ["sorong"] },
  { unlocode: "IDTRK", name: "Tarakan", country: "ID", type: "laut", aliases: ["tarakan"] },
  { unlocode: "IDDJJ", name: "Jayapura", country: "ID", type: "laut", aliases: ["jayapura"] },
  { unlocode: "IDKJT", name: "Kertajati Intl Airport, Majalengka", country: "ID", type: "udara", aliases: ["kertajati", "bijb", "majalengka"] },
  { unlocode: "IDYIA", name: "Yogyakarta Intl Airport", country: "ID", type: "udara", aliases: ["yogyakarta", "kulon progo", "yia"] },
  { unlocode: "IDUPG", name: "Sultan Hasanuddin Intl Airport, Makassar", country: "ID", type: "udara", aliases: ["hasanuddin", "makassar airport"] },
  { unlocode: "IDBPN", name: "Sepinggan Intl Airport, Balikpapan", country: "ID", type: "udara", aliases: ["sepinggan", "balikpapan airport"] },
  { unlocode: "IDBTH", name: "Hang Nadim Intl Airport, Batam", country: "ID", type: "udara", aliases: ["hang nadim", "batam airport"] },
  { unlocode: "IDSRG", name: "Ahmad Yani Intl Airport, Semarang", country: "ID", type: "udara", aliases: ["ahmad yani", "semarang airport"] },
  { unlocode: "IDPLM", name: "Sultan Mahmud Badaruddin II Airport, Palembang", country: "ID", type: "udara", aliases: ["palembang airport"] },
  { unlocode: "IDMDC", name: "Sam Ratulangi Intl Airport, Manado", country: "ID", type: "udara", aliases: ["manado", "sam ratulangi"] },
  { unlocode: "SGSIN", name: "Changi Airport, Singapore", country: "SG", type: "udara", aliases: ["changi", "singapore airport"] },
  { unlocode: "MYKUL", name: "Kuala Lumpur Intl Airport", country: "MY", type: "udara", aliases: ["klia", "kuala lumpur", "kul"] },
  { unlocode: "THBKK", name: "Suvarnabhumi Airport, Bangkok", country: "TH", type: "udara", aliases: ["suvarnabhumi", "bangkok airport"] },
  { unlocode: "AEDXB", name: "Dubai Intl Airport", country: "AE", type: "udara", aliases: ["dubai", "dxb"] },
  { unlocode: "QADOH", name: "Hamad Intl Airport, Doha", country: "QA", type: "udara", aliases: ["doha", "hamad", "doh"] },
  { unlocode: "TRIST", name: "Istanbul Airport", country: "TR", type: "udara", aliases: ["istanbul", "ist"] },
];

/* Bentuk pendek diturunkan dari UN/LOCODE dengan memangkas dua huruf
   negara. Tidak ada daftar kedua yang harus dijaga tetap sinkron —
   satu-satunya pengecualian ditulis lewat `iata` di tabel di atas. */
const UNLOCODES = UNLOCODES_RAW.map((u) =>
  Object.assign({}, u, { code: u.iata || u.unlocode.slice(2) }),
);

// Pencarian kode -> entri. Kode pendek bisa dipakai dua entri (pelabuhan
// laut & bandara di kota yang sama); yang pertama tertulis yang menang.
const PORT_BY_CODE = new Map();
const PORT_BY_UNLOCODE = new Map();
UNLOCODES.forEach((u) => {
  if (!PORT_BY_CODE.has(u.code)) PORT_BY_CODE.set(u.code, u);
  if (!PORT_BY_UNLOCODE.has(u.unlocode)) PORT_BY_UNLOCODE.set(u.unlocode, u);
});

// Bentuk kode UN/LOCODE: 2 huruf negara + 3 huruf/angka lokasi (IDCGK)
const UNLOCODE_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}$/;

// Bentuk pendek gaya IATA: 3 huruf/angka (CGK)
const PORTCODE_PATTERN = /^[A-Z][A-Z0-9]{2}$/;

// Kode negara ISO-3166 alpha-2 yang realistis muncul di dokumen EXIM DDI
const UNLOCODE_COUNTRIES = new Set([
  "ID", "KR", "CN", "HK", "TW", "JP", "SG", "MY", "TH", "VN", "PH", "IN",
  "AE", "SA", "NL", "DE", "BE", "GB", "IT", "FR", "ES", "PL", "TR", "US",
  "CA", "MX", "BR", "AU", "NZ", "ZA", "EG", "RU", "BD", "PK", "LK", "KH",
  "MM", "LA", "BN", "QA",
]);

/* Teks pelabuhan bebas -> ENTRI referensinya.

   Urutan percobaannya sengaja dari yang paling pasti ke yang paling
   menebak. Ini inti dari "IDCGK harus tetap dikenali sebagai CGK":
   dokumen impor menulis bentuk panjang, layar memakai bentuk pendek,
   dan keduanya bermuara ke entri yang sama.

     1. IDCGK  bentuk UN/LOCODE penuh   (dari PIB/PEB/B/L/Excel)
     2. CGK    bentuk pendek            (dari layar & jadwal baru)
     3. nama & alias                    ("Soekarno-Hatta", "priok")
     4. kode di ujung teks              ("TANJUNG PRIOK IDTPP")

   Langkah 3 memilih alias TERPANJANG yang cocok, supaya "tanjung
   pelepas" tidak kalah oleh "tanjung" yang lebih pendek. */
/* Hasil pencocokan diingat per teks masukan.

   Tabel referensinya tetap selama aplikasi berjalan, jadi teks yang
   sama selalu menghasilkan entri yang sama. Nama pelabuhan berulang
   sangat banyak — satu papan berisi ratusan kartu kerap hanya memakai
   segelintir pelabuhan — sementara pencocokan alias menyapu seluruh
   tabel tiap kali dipanggil. */
const PORT_RESOLVE_CACHE = new Map();

function resolvePortEntry(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (PORT_RESOLVE_CACHE.has(s)) return PORT_RESOLVE_CACHE.get(s);
  const hasil = cariPortEntry(s);
  PORT_RESOLVE_CACHE.set(s, hasil);
  return hasil;
}

function cariPortEntry(s) {
  const upper = s.toUpperCase();

  if (UNLOCODE_PATTERN.test(upper)) {
    const e = PORT_BY_UNLOCODE.get(upper);
    if (e) return e;
  }
  if (PORTCODE_PATTERN.test(upper)) {
    const e = PORT_BY_CODE.get(upper);
    if (e) return e;
  }

  const hay = s.toLowerCase();
  let best = null;
  UNLOCODES.forEach((u) => {
    [u.name.toLowerCase(), ...(u.aliases || [])].forEach((alias) => {
      if (!alias) return;
      if (hay.includes(alias)) {
        if (!best || alias.length > best.len) best = { entry: u, len: alias.length };
      }
    });
  });
  if (best) return best.entry;

  const lastToken = (upper.match(/\b([A-Z]{2}[A-Z0-9]{3})\s*$/) || [])[1];
  if (lastToken && UNLOCODE_COUNTRIES.has(lastToken.slice(0, 2))) {
    // Harus ada teks lain di depannya (format "<nama> <kode>")
    if (upper.replace(lastToken, "").trim()) {
      return PORT_BY_UNLOCODE.get(lastToken) || null;
    }
  }
  return "";
}

// Teks bebas -> kode pendek gaya IATA ("CGK"). Kosong kalau tak dikenali.
function resolvePortCode(raw) {
  const e = resolvePortEntry(raw);
  return e ? e.code : "";
}

// Teks bebas -> kode negara ISO ("ID").
//
// Diambil dari TABEL, bukan dari memotong dua huruf pertama kode.
// Bentuk pendek tidak lagi membawa negaranya, jadi memotong string akan
// mengubah "CGK" jadi negara "CG" — Republik Kongo.
/* PELABUHAN INDUK. Terminal sekota (Shekou -> Shenzhen, Cat Lai -> Ho
   Chi Minh) dikembalikan ke induknya; pelabuhan biasa ke dirinya
   sendiri. Dipakai untuk membandingkan RUTE (belajar dari riwayat,
   menebak direct/transit), bukan untuk tampilan. */
function resolvePortMetro(raw) {
  const e = resolvePortEntry(raw);
  if (!e) return "";
  const induk = e.metro ? PORT_BY_UNLOCODE.get(e.metro) : null;
  // Bentuk PENDEK, sama dengan resolvePortCode -- itu yang dipakai
  // aturan rute & pencocokan riwayat.
  return (induk || e).code;
}

function resolvePortCountry(raw) {
  const e = resolvePortEntry(raw);
  return e ? e.country : "";
}

// Teks bebas -> bentuk UN/LOCODE penuh ("IDCGK"), untuk dokumen ekspor.
function resolveUnlocode(raw) {
  const e = resolvePortEntry(raw);
  return e ? e.unlocode : "";
}

// Nilai yang DITAMPILKAN/DISIMPAN di field Pelabuhan Asal/Tujuan.
function portDisplay(raw) {
  return resolvePortCode(raw) || String(raw || "").trim();
}

/* Menyeragamkan tampilan jadwal LAMA tanpa menyentuh database.

   Hanya bentuk KODE yang diseragamkan. Jadwal yang pelabuhannya
   diketik sebagai nama ("Tanjung Priok") dibiarkan apa adanya —
   permintaannya mengganti format kode, bukan mengganti nama jadi kode
   di belakang punggung pengguna. */
function portCodeLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;
  const upper = s.toUpperCase();
  /* BENTUK PANJANG yang ditampilkan (IDCGK, VNCLI), bukan bentuk
     pendeknya.

     Inilah yang tercetak di PIB, PEB, dan B/L. Menampilkan CGK memaksa
     pembacanya menerjemahkan sendiri saat mencocokkan layar dengan
     dokumen di tangan -- dan tiga huruf itu tidak menyebut negaranya,
     jadi TPP bisa terbaca Tanjung Priok maupun Tanjung Pelepas.

     Yang DISIMPAN tidak diubah: bentuk pendek maupun panjang sama-sama
     dikenali resolvePortCode(), jadi jadwal lama tetap terbaca dan
     aturan rutenya tetap cocok. */
  if (UNLOCODE_PATTERN.test(upper)) {
    const e = PORT_BY_UNLOCODE.get(upper);
    if (e) return e.unlocode;
  }
  if (PORTCODE_PATTERN.test(upper)) {
    const e = PORT_BY_CODE.get(upper);
    if (e) return e.unlocode;
  }
  return s;
}

/* Saran pelabuhan/bandara, disaring menurut moda transportasi.

   Daftar disaring menurut moda: pengiriman lewat laut
   ikut menawarkan bandara, dan sebaliknya. Padahal modanya sudah
   dipilih di kolom tepat di atasnya — jadi separuh daftarnya pasti
   salah. */
function unlocodeDatalistHtml(mode) {
  const pilih =
    mode === "udara"
      ? (u) => u.type === "udara"
      : mode === "laut"
        ? (u) => u.type === "laut"
        : () => true;
  return UNLOCODES.filter(pilih)
    .map(
      (u) =>
        /* UN/LOCODE ikut ditulis di label supaya pengguna yang hafal
           bentuk lama ("IDCGK") tetap bisa menemukannya lewat ketikan —
           datalist mencocokkan teks label, bukan cuma nilainya. */
        /* value = bentuk panjang, sama dengan yang ditampilkan di
           kartu -- supaya yang diketik, yang tersimpan, dan yang
           terbaca di layar tidak pernah berbeda bentuk. */
        `<option value="${u.unlocode}">${escapeHtml(`${u.unlocode} — ${u.name}`)}</option>`,
    )
    .join("");
}

/* Dipanggil ulang tiap moda berganti. */
function refreshUnlocodeDatalist() {
  const dl = document.getElementById("unlocodeList");
  if (!dl) return;
  const moda = (document.getElementById("fTransport") || {}).value || "";
  dl.innerHTML = unlocodeDatalistHtml(moda);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    UNLOCODES,
    resolvePortEntry,
    resolvePortCode,
    resolvePortCountry,
    resolvePortMetro,
    resolveUnlocode,
    portDisplay,
    portCodeLabel,
  };
}
