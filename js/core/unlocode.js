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
  { unlocode: "IDJKT", name: "Jakarta", country: "ID", type: "laut", aliases: ["jakarta"] },
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
  { unlocode: "KRKAN", name: "Gwangju", country: "KR", type: "laut", aliases: ["gwangju", "kwangju"] },
  { unlocode: "KRKPO", name: "Pohang", country: "KR", type: "laut", aliases: ["pohang"] },

  // CHINA / HONG KONG / TAIWAN
  { unlocode: "CNSHA", name: "Shanghai", country: "CN", type: "laut", aliases: ["shanghai"] },
  { unlocode: "CNNGB", name: "Ningbo", country: "CN", type: "laut", aliases: ["ningbo"] },
  { unlocode: "CNSZX", name: "Shenzhen", country: "CN", type: "laut", aliases: ["shenzhen", "shekou", "yantian"] },
  { unlocode: "CNTAO", name: "Qingdao", country: "CN", type: "laut", aliases: ["qingdao", "tsingtao"] },
  { unlocode: "CNTSN", name: "Tianjin / Xingang", country: "CN", type: "laut", aliases: ["tianjin", "xingang"] },
  { unlocode: "CNCAN", name: "Guangzhou", country: "CN", type: "laut", aliases: ["guangzhou", "canton", "nansha"] },
  { unlocode: "CNXMN", name: "Xiamen", country: "CN", type: "laut", aliases: ["xiamen", "amoy"] },
  { unlocode: "CNTXG", name: "Xingang, Tianjin", country: "CN", type: "laut",
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
    aliases: ["ho chi minh", "hochiminh", "saigon", "cat lai"] },
  { unlocode: "VNHPH", name: "Haiphong", country: "VN", type: "laut", aliases: ["haiphong", "hai phong"] },
  { unlocode: "VNDAD", name: "Da Nang", country: "VN", type: "laut", aliases: ["da nang", "danang"] },
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

const UNLOCODE_SET = new Set(UNLOCODES.map((u) => u.code));

// Bentuk kode UN/LOCODE: 2 huruf negara + 3 huruf/angka lokasi (IDCGK)
const UNLOCODE_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}$/;

// Bentuk pendek gaya IATA: 3 huruf/angka (CGK)
const PORTCODE_PATTERN = /^[A-Z][A-Z0-9]{2}$/;

// Kode negara ISO-3166 alpha-2 yang realistis muncul di dokumen EXIM DDI
const UNLOCODE_COUNTRIES = new Set([
  "ID", "KR", "CN", "HK", "TW", "JP", "SG", "MY", "TH", "VN", "PH", "IN",
  "AE", "SA", "NL", "DE", "BE", "GB", "IT", "FR", "ES", "PL", "TR", "US",
  "CA", "MX", "BR", "AU", "NZ", "ZA", "EG", "RU", "BD", "PK", "LK", "KH",
  "MM", "LA", "BN",
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
function resolvePortEntry(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
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
  if (UNLOCODE_PATTERN.test(upper)) {
    const e = PORT_BY_UNLOCODE.get(upper);
    if (e) return e.code;
  }
  if (PORTCODE_PATTERN.test(upper)) {
    const e = PORT_BY_CODE.get(upper);
    if (e) return e.code;
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
        `<option value="${u.code}">${escapeHtml(`${u.code} — ${u.name} (${u.unlocode})`)}</option>`,
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
    resolveUnlocode,
    portDisplay,
    portCodeLabel,
  };
}
