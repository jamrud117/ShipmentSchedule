"use strict";

/* REFERENSI UN/LOCODE (requirement C: "Buat daftar referensi UN/LOCODE") */

const UNLOCODES = [
  // INDONESIA — pelabuhan laut
  { code: "IDTPP", name: "Tanjung Priok, Jakarta", country: "ID", type: "laut",
    aliases: ["tanjung priok", "priok", "jakarta port", "tg priok", "tg. priok"] },
  { code: "IDJKT", name: "Jakarta", country: "ID", type: "laut", aliases: ["jakarta"] },
  { code: "IDSUB", name: "Tanjung Perak, Surabaya", country: "ID", type: "laut",
    aliases: ["tanjung perak", "perak", "surabaya"] },
  { code: "IDSRG", name: "Tanjung Emas, Semarang", country: "ID", type: "laut",
    aliases: ["tanjung emas", "semarang"] },
  { code: "IDBLW", name: "Belawan, Medan", country: "ID", type: "laut", aliases: ["belawan", "medan"] },
  { code: "IDPNK", name: "Pontianak", country: "ID", type: "laut", aliases: ["pontianak"] },
  { code: "IDPLM", name: "Palembang", country: "ID", type: "laut", aliases: ["palembang", "boom baru"] },
  { code: "IDPNJ", name: "Panjang, Lampung", country: "ID", type: "laut", aliases: ["panjang", "lampung"] },
  { code: "IDMAK", name: "Makassar", country: "ID", type: "laut", aliases: ["makassar", "ujung pandang", "soekarno hatta makassar"] },
  { code: "IDBTM", name: "Batam", country: "ID", type: "laut", aliases: ["batam", "batu ampar"] },
  { code: "IDBPN", name: "Balikpapan", country: "ID", type: "laut", aliases: ["balikpapan"] },
  { code: "IDBIT", name: "Bitung", country: "ID", type: "laut", aliases: ["bitung"] },
  { code: "IDCXP", name: "Cirebon", country: "ID", type: "laut", aliases: ["cirebon"] },
  { code: "IDMER", name: "Merak", country: "ID", type: "laut", aliases: ["merak"] },
  { code: "IDCGD", name: "Cigading", country: "ID", type: "laut", aliases: ["cigading"] },
  { code: "IDPAT", name: "Patimban", country: "ID", type: "laut", aliases: ["patimban"] },

  // INDONESIA — bandara
  { code: "IDCGK", name: "Soekarno-Hatta Intl Airport, Jakarta", country: "ID", type: "udara",
    aliases: ["jakarta airport", "soekarno", "soekarno-hatta", "soekarno hatta", "cengkareng", "halim", "jakarta apt", "cgk"] },
  { code: "IDSUB", name: "Juanda Intl Airport, Surabaya", country: "ID", type: "udara",
    aliases: ["juanda", "surabaya airport"] },
  { code: "IDDPS", name: "Ngurah Rai Intl Airport, Denpasar", country: "ID", type: "udara",
    aliases: ["denpasar", "ngurah rai", "bali airport", "dps"] },
  { code: "IDKNO", name: "Kualanamu Intl Airport, Medan", country: "ID", type: "udara",
    aliases: ["kualanamu", "medan airport"] },

  // KOREA
  { code: "KRPUS", name: "Busan", country: "KR", type: "laut",
    aliases: ["busan", "pusan", "busan (ex pusan)", "ex pusan"] },
  { code: "KRINC", name: "Incheon Port", country: "KR", type: "laut", aliases: ["incheon port", "incheon seaport"] },
  { code: "KRICN", name: "Incheon Intl Airport, Seoul", country: "KR", type: "udara",
    aliases: ["incheon airport", "incheon intl apt", "incheon", "seoul airport", "seoul", "icn"] },
  { code: "KRKAN", name: "Gwangju", country: "KR", type: "laut", aliases: ["gwangju", "kwangju"] },
  { code: "KRKPO", name: "Pohang", country: "KR", type: "laut", aliases: ["pohang"] },

  // CHINA / HONG KONG / TAIWAN
  { code: "CNSHA", name: "Shanghai", country: "CN", type: "laut", aliases: ["shanghai"] },
  { code: "CNNGB", name: "Ningbo", country: "CN", type: "laut", aliases: ["ningbo"] },
  { code: "CNSZX", name: "Shenzhen", country: "CN", type: "laut", aliases: ["shenzhen", "shekou", "yantian"] },
  { code: "CNTAO", name: "Qingdao", country: "CN", type: "laut", aliases: ["qingdao", "tsingtao"] },
  { code: "CNTSN", name: "Tianjin / Xingang", country: "CN", type: "laut", aliases: ["tianjin", "xingang"] },
  { code: "CNCAN", name: "Guangzhou", country: "CN", type: "laut", aliases: ["guangzhou", "canton", "nansha"] },
  { code: "CNPVG", name: "Pudong Intl Airport, Shanghai", country: "CN", type: "udara",
    aliases: ["pudong", "shanghai airport", "pvg"] },
  { code: "HKHKG", name: "Hong Kong", country: "HK", type: "laut", aliases: ["hong kong", "hongkong", "hkg"] },
  { code: "TWKHH", name: "Kaohsiung", country: "TW", type: "laut", aliases: ["kaohsiung"] },
  { code: "TWTPE", name: "Taoyuan Intl Airport, Taipei", country: "TW", type: "udara",
    aliases: ["taipei", "taoyuan", "tpe"] },
  { code: "TWKEL", name: "Keelung", country: "TW", type: "laut", aliases: ["keelung", "chilung"] },

  // JEPANG
  { code: "JPTYO", name: "Tokyo", country: "JP", type: "laut", aliases: ["tokyo"] },
  { code: "JPYOK", name: "Yokohama", country: "JP", type: "laut", aliases: ["yokohama"] },
  { code: "JPOSA", name: "Osaka", country: "JP", type: "laut", aliases: ["osaka"] },
  { code: "JPUKB", name: "Kobe", country: "JP", type: "laut", aliases: ["kobe"] },
  { code: "JPNGO", name: "Nagoya", country: "JP", type: "laut", aliases: ["nagoya"] },
  { code: "JPNRT", name: "Narita Intl Airport, Tokyo", country: "JP", type: "udara",
    aliases: ["narita", "tokyo airport", "nrt"] },
  { code: "JPKIX", name: "Kansai Intl Airport, Osaka", country: "JP", type: "udara",
    aliases: ["kansai", "osaka airport", "kix"] },

  // ASIA TENGGARA
  { code: "SGSIN", name: "Singapore", country: "SG", type: "laut", aliases: ["singapore", "singapura", "sin"] },
  { code: "MYPKG", name: "Port Klang", country: "MY", type: "laut", aliases: ["port klang", "klang", "pelabuhan klang"] },
  { code: "MYPEN", name: "Penang", country: "MY", type: "laut", aliases: ["penang", "pinang"] },
  { code: "MYTPP", name: "Tanjung Pelepas", country: "MY", type: "laut", aliases: ["tanjung pelepas", "ptp"] },
  { code: "THBKK", name: "Bangkok", country: "TH", type: "laut", aliases: ["bangkok"] },
  { code: "THLCH", name: "Laem Chabang", country: "TH", type: "laut", aliases: ["laem chabang"] },
  { code: "VNSGN", name: "Ho Chi Minh City", country: "VN", type: "laut",
    aliases: ["ho chi minh", "hochiminh", "saigon", "cat lai"] },
  { code: "VNHPH", name: "Haiphong", country: "VN", type: "laut", aliases: ["haiphong", "hai phong"] },
  { code: "PHMNL", name: "Manila", country: "PH", type: "laut", aliases: ["manila"] },

  // INDIA / TIMUR TENGAH
  { code: "INNSA", name: "Nhava Sheva (JNPT)", country: "IN", type: "laut", aliases: ["nhava sheva", "jnpt", "mumbai"] },
  { code: "INMAA", name: "Chennai", country: "IN", type: "laut", aliases: ["chennai", "madras"] },
  { code: "AEJEA", name: "Jebel Ali, Dubai", country: "AE", type: "laut", aliases: ["jebel ali", "dubai"] },

  // EROPA
  { code: "NLRTM", name: "Rotterdam", country: "NL", type: "laut", aliases: ["rotterdam"] },
  { code: "DEHAM", name: "Hamburg", country: "DE", type: "laut", aliases: ["hamburg"] },
  { code: "BEANR", name: "Antwerp", country: "BE", type: "laut", aliases: ["antwerp", "antwerpen"] },
  { code: "GBFXT", name: "Felixstowe", country: "GB", type: "laut", aliases: ["felixstowe"] },
  { code: "ITGOA", name: "Genoa", country: "IT", type: "laut", aliases: ["genoa", "genova"] },
  { code: "FRLEH", name: "Le Havre", country: "FR", type: "laut", aliases: ["le havre"] },

  // AMERIKA & OSEANIA
  { code: "USLAX", name: "Los Angeles", country: "US", type: "laut", aliases: ["los angeles", "lax"] },
  { code: "USLGB", name: "Long Beach", country: "US", type: "laut", aliases: ["long beach"] },
  { code: "USNYC", name: "New York", country: "US", type: "laut", aliases: ["new york", "newark"] },
  { code: "USSEA", name: "Seattle", country: "US", type: "laut", aliases: ["seattle"] },
  { code: "USHOU", name: "Houston", country: "US", type: "laut", aliases: ["houston"] },
  { code: "AUSYD", name: "Sydney", country: "AU", type: "laut", aliases: ["sydney"] },
  { code: "AUMEL", name: "Melbourne", country: "AU", type: "laut", aliases: ["melbourne"] },
];

// Semua kode yang dikenal (dipakai utk cek "ini sudah berupa kode atau belum" tanpa scan array
const UNLOCODE_SET = new Set(UNLOCODES.map((u) => u.code));

// Bentuk kode UN/LOCODE: 2 huruf negara + 3 huruf/angka lokasi (mis
const UNLOCODE_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}$/;

// Kode negara ISO-3166 alpha-2 yang realistis muncul di dokumen EXIM DDI
const UNLOCODE_COUNTRIES = new Set([
  "ID", "KR", "CN", "HK", "TW", "JP", "SG", "MY", "TH", "VN", "PH", "IN",
  "AE", "SA", "NL", "DE", "BE", "GB", "IT", "FR", "ES", "PL", "TR", "US",
  "CA", "MX", "BR", "AU", "NZ", "ZA", "EG", "RU", "BD", "PK", "LK", "KH",
  "MM", "LA", "BN",
]);

// Teks pelabuhan bebas -> kode UN/LOCODE
function resolveUnlocode(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  if (UNLOCODE_PATTERN.test(upper)) return upper;

  const hay = s.toLowerCase();
  let best = null;
  UNLOCODES.forEach((u) => {
    [u.name.toLowerCase(), ...(u.aliases || [])].forEach((alias) => {
      if (!alias) return;
      if (hay.includes(alias)) {
        if (!best || alias.length > best.len) best = { code: u.code, len: alias.length };
      }
    });
  });
  if (best) return best.code;

  const lastToken = (upper.match(/\b([A-Z]{2}[A-Z0-9]{3})\s*$/) || [])[1];
  if (lastToken && UNLOCODE_COUNTRIES.has(lastToken.slice(0, 2))) {
    // Harus ada teks lain di depannya (format "<nama> <kode>")
    if (upper.replace(lastToken, "").trim()) return lastToken;
  }
  return "";
}

// Nilai yang DITAMPILKAN/DISIMPAN di field Pelabuhan Asal/Tujuan: kode saja kalau ketemu
function portDisplay(raw) {
  return resolveUnlocode(raw) || String(raw || "").trim();
}

/* Saran pelabuhan/bandara, disaring menurut moda transportasi.

   Sebelumnya seluruh daftar disodorkan sekaligus: pengiriman lewat laut
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
        `<option value="${u.code}">${escapeHtml(`${u.code} — ${u.name}`)}</option>`,
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
  module.exports = { UNLOCODES, resolveUnlocode, portDisplay };
}
