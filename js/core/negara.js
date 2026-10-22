"use strict";

/* KODE NEGARA ASAL BARANG -- Referensi Negara CEISA: kode ISO 3166-1
   alpha-2 ("KR", "CN", "ID"), kode yang sama dengan kolom KODE NEGARA
   ASAL di sheet BARANG draft CEISA.

   Seluruh 249 negara & wilayah ISO 3166-1. Tiap baris:
     [kode, nama Indonesia, nama resmi ISO (Inggris), nama Inggris lain]
   Nama Indonesia dari CLDR (Hong Kong, Makau, Palestina dipendekkan),
   nama ISO dari daftar ISO 3166-1 -- ejaan yang dipakai dokumen pabean
   ("Korea, Republic of", "Viet Nam"). Nama keempat hanya ada bila nama
   Inggris yang lazim berbeda ("South Korea").

   Dipakai kotak Kode Negara Asal di tabel barang (bisa diketik untuk
   mencari: kode, nama Indonesia, atau nama Inggris), impor CEISA / PIB
   / CIPL, dan Cek PIB/PEB. */
const DAFTAR_NEGARA = [
  ["AD", "Andorra", "Andorra"],
  ["AE", "Uni Emirat Arab", "United Arab Emirates"],
  ["AF", "Afganistan", "Afghanistan"],
  ["AG", "Antigua dan Barbuda", "Antigua and Barbuda", "Antigua & Barbuda"],
  ["AI", "Anguilla", "Anguilla"],
  ["AL", "Albania", "Albania"],
  ["AM", "Armenia", "Armenia"],
  ["AO", "Angola", "Angola"],
  ["AQ", "Antarktika", "Antarctica"],
  ["AR", "Argentina", "Argentina"],
  ["AS", "Samoa Amerika", "American Samoa"],
  ["AT", "Austria", "Austria"],
  ["AU", "Australia", "Australia"],
  ["AW", "Aruba", "Aruba"],
  ["AX", "Kepulauan Aland", "Åland Islands"],
  ["AZ", "Azerbaijan", "Azerbaijan"],
  ["BA", "Bosnia dan Herzegovina", "Bosnia and Herzegovina", "Bosnia & Herzegovina"],
  ["BB", "Barbados", "Barbados"],
  ["BD", "Bangladesh", "Bangladesh"],
  ["BE", "Belgia", "Belgium"],
  ["BF", "Burkina Faso", "Burkina Faso"],
  ["BG", "Bulgaria", "Bulgaria"],
  ["BH", "Bahrain", "Bahrain"],
  ["BI", "Burundi", "Burundi"],
  ["BJ", "Benin", "Benin"],
  ["BL", "Saint Barthélemy", "Saint Barthélemy", "St. Barthélemy"],
  ["BM", "Bermuda", "Bermuda"],
  ["BN", "Brunei", "Brunei Darussalam"],
  ["BO", "Bolivia", "Bolivia, Plurinational State of"],
  ["BQ", "Belanda Karibia", "Bonaire, Sint Eustatius and Saba", "Caribbean Netherlands"],
  ["BR", "Brasil", "Brazil"],
  ["BS", "Bahama", "Bahamas"],
  ["BT", "Bhutan", "Bhutan"],
  ["BV", "Pulau Bouvet", "Bouvet Island"],
  ["BW", "Botswana", "Botswana"],
  ["BY", "Belarus", "Belarus"],
  ["BZ", "Belize", "Belize"],
  ["CA", "Kanada", "Canada"],
  ["CC", "Kepulauan Cocos (Keeling)", "Cocos (Keeling) Islands"],
  ["CD", "Kongo - Kinshasa", "Congo, The Democratic Republic of the", "Congo - Kinshasa"],
  ["CF", "Republik Afrika Tengah", "Central African Republic"],
  ["CG", "Kongo - Brazzaville", "Congo", "Congo - Brazzaville"],
  ["CH", "Swiss", "Switzerland"],
  ["CI", "Côte d’Ivoire", "Côte d'Ivoire"],
  ["CK", "Kepulauan Cook", "Cook Islands"],
  ["CL", "Cile", "Chile"],
  ["CM", "Kamerun", "Cameroon"],
  ["CN", "Tiongkok", "China"],
  ["CO", "Kolombia", "Colombia"],
  ["CR", "Kosta Rika", "Costa Rica"],
  ["CU", "Kuba", "Cuba"],
  ["CV", "Tanjung Verde", "Cabo Verde", "Cape Verde"],
  ["CW", "Curaçao", "Curaçao"],
  ["CX", "Pulau Natal", "Christmas Island"],
  ["CY", "Siprus", "Cyprus"],
  ["CZ", "Ceko", "Czechia"],
  ["DE", "Jerman", "Germany"],
  ["DJ", "Jibuti", "Djibouti"],
  ["DK", "Denmark", "Denmark"],
  ["DM", "Dominika", "Dominica"],
  ["DO", "Republik Dominika", "Dominican Republic"],
  ["DZ", "Aljazair", "Algeria"],
  ["EC", "Ekuador", "Ecuador"],
  ["EE", "Estonia", "Estonia"],
  ["EG", "Mesir", "Egypt"],
  ["EH", "Sahara Barat", "Western Sahara"],
  ["ER", "Eritrea", "Eritrea"],
  ["ES", "Spanyol", "Spain"],
  ["ET", "Etiopia", "Ethiopia"],
  ["FI", "Finlandia", "Finland"],
  ["FJ", "Fiji", "Fiji"],
  ["FK", "Kepulauan Falkland", "Falkland Islands (Malvinas)", "Falkland Islands"],
  ["FM", "Mikronesia", "Micronesia, Federated States of", "Micronesia"],
  ["FO", "Kepulauan Faroe", "Faroe Islands"],
  ["FR", "Prancis", "France"],
  ["GA", "Gabon", "Gabon"],
  ["GB", "Inggris Raya", "United Kingdom"],
  ["GD", "Grenada", "Grenada"],
  ["GE", "Georgia", "Georgia"],
  ["GF", "Guyana Prancis", "French Guiana"],
  ["GG", "Guernsey", "Guernsey"],
  ["GH", "Ghana", "Ghana"],
  ["GI", "Gibraltar", "Gibraltar"],
  ["GL", "Greenland", "Greenland"],
  ["GM", "Gambia", "Gambia"],
  ["GN", "Guinea", "Guinea"],
  ["GP", "Guadeloupe", "Guadeloupe"],
  ["GQ", "Guinea Ekuatorial", "Equatorial Guinea"],
  ["GR", "Yunani", "Greece"],
  ["GS", "Georgia Selatan & Kep. Sandwich Selatan", "South Georgia and the South Sandwich Islands", "South Georgia & South Sandwich Islands"],
  ["GT", "Guatemala", "Guatemala"],
  ["GU", "Guam", "Guam"],
  ["GW", "Guinea-Bissau", "Guinea-Bissau"],
  ["GY", "Guyana", "Guyana"],
  ["HK", "Hong Kong", "Hong Kong"],
  ["HM", "Pulau Heard dan Kepulauan McDonald", "Heard Island and McDonald Islands", "Heard & McDonald Islands"],
  ["HN", "Honduras", "Honduras"],
  ["HR", "Kroasia", "Croatia"],
  ["HT", "Haiti", "Haiti"],
  ["HU", "Hungaria", "Hungary"],
  ["ID", "Indonesia", "Indonesia"],
  ["IE", "Irlandia", "Ireland"],
  ["IL", "Israel", "Israel"],
  ["IM", "Pulau Man", "Isle of Man"],
  ["IN", "India", "India"],
  ["IO", "Wilayah Inggris di Samudra Hindia", "British Indian Ocean Territory"],
  ["IQ", "Irak", "Iraq"],
  ["IR", "Iran", "Iran, Islamic Republic of"],
  ["IS", "Islandia", "Iceland"],
  ["IT", "Italia", "Italy"],
  ["JE", "Jersey", "Jersey"],
  ["JM", "Jamaika", "Jamaica"],
  ["JO", "Yordania", "Jordan"],
  ["JP", "Jepang", "Japan"],
  ["KE", "Kenya", "Kenya"],
  ["KG", "Kirgizstan", "Kyrgyzstan"],
  ["KH", "Kamboja", "Cambodia"],
  ["KI", "Kiribati", "Kiribati"],
  ["KM", "Komoro", "Comoros"],
  ["KN", "Saint Kitts dan Nevis", "Saint Kitts and Nevis", "St. Kitts & Nevis"],
  ["KP", "Korea Utara", "Korea, Democratic People's Republic of", "North Korea"],
  ["KR", "Korea Selatan", "Korea, Republic of", "South Korea"],
  ["KW", "Kuwait", "Kuwait"],
  ["KY", "Kepulauan Cayman", "Cayman Islands"],
  ["KZ", "Kazakhstan", "Kazakhstan"],
  ["LA", "Laos", "Lao People's Democratic Republic"],
  ["LB", "Lebanon", "Lebanon"],
  ["LC", "Saint Lucia", "Saint Lucia", "St. Lucia"],
  ["LI", "Liechtenstein", "Liechtenstein"],
  ["LK", "Sri Lanka", "Sri Lanka"],
  ["LR", "Liberia", "Liberia"],
  ["LS", "Lesotho", "Lesotho"],
  ["LT", "Lituania", "Lithuania"],
  ["LU", "Luksemburg", "Luxembourg"],
  ["LV", "Latvia", "Latvia"],
  ["LY", "Libya", "Libya"],
  ["MA", "Maroko", "Morocco"],
  ["MC", "Monako", "Monaco"],
  ["MD", "Moldova", "Moldova, Republic of"],
  ["ME", "Montenegro", "Montenegro"],
  ["MF", "Saint Martin", "Saint Martin (French part)", "St. Martin"],
  ["MG", "Madagaskar", "Madagascar"],
  ["MH", "Kepulauan Marshall", "Marshall Islands"],
  ["MK", "Makedonia Utara", "North Macedonia"],
  ["ML", "Mali", "Mali"],
  ["MM", "Myanmar (Burma)", "Myanmar"],
  ["MN", "Mongolia", "Mongolia"],
  ["MO", "Makau", "Macao"],
  ["MP", "Kepulauan Mariana Utara", "Northern Mariana Islands"],
  ["MQ", "Martinik", "Martinique"],
  ["MR", "Mauritania", "Mauritania"],
  ["MS", "Montserrat", "Montserrat"],
  ["MT", "Malta", "Malta"],
  ["MU", "Mauritius", "Mauritius"],
  ["MV", "Maladewa", "Maldives"],
  ["MW", "Malawi", "Malawi"],
  ["MX", "Meksiko", "Mexico"],
  ["MY", "Malaysia", "Malaysia"],
  ["MZ", "Mozambik", "Mozambique"],
  ["NA", "Namibia", "Namibia"],
  ["NC", "Kaledonia Baru", "New Caledonia"],
  ["NE", "Niger", "Niger"],
  ["NF", "Kepulauan Norfolk", "Norfolk Island"],
  ["NG", "Nigeria", "Nigeria"],
  ["NI", "Nikaragua", "Nicaragua"],
  ["NL", "Belanda", "Netherlands"],
  ["NO", "Norwegia", "Norway"],
  ["NP", "Nepal", "Nepal"],
  ["NR", "Nauru", "Nauru"],
  ["NU", "Niue", "Niue"],
  ["NZ", "Selandia Baru", "New Zealand"],
  ["OM", "Oman", "Oman"],
  ["PA", "Panama", "Panama"],
  ["PE", "Peru", "Peru"],
  ["PF", "Polinesia Prancis", "French Polynesia"],
  ["PG", "Papua Nugini", "Papua New Guinea"],
  ["PH", "Filipina", "Philippines"],
  ["PK", "Pakistan", "Pakistan"],
  ["PL", "Polandia", "Poland"],
  ["PM", "Saint Pierre dan Miquelon", "Saint Pierre and Miquelon", "St. Pierre & Miquelon"],
  ["PN", "Kepulauan Pitcairn", "Pitcairn", "Pitcairn Islands"],
  ["PR", "Puerto Riko", "Puerto Rico"],
  ["PS", "Palestina", "Palestine, State of"],
  ["PT", "Portugal", "Portugal"],
  ["PW", "Palau", "Palau"],
  ["PY", "Paraguay", "Paraguay"],
  ["QA", "Qatar", "Qatar"],
  ["RE", "Réunion", "Réunion"],
  ["RO", "Rumania", "Romania"],
  ["RS", "Serbia", "Serbia"],
  ["RU", "Rusia", "Russian Federation", "Russia"],
  ["RW", "Rwanda", "Rwanda"],
  ["SA", "Arab Saudi", "Saudi Arabia"],
  ["SB", "Kepulauan Solomon", "Solomon Islands"],
  ["SC", "Seychelles", "Seychelles"],
  ["SD", "Sudan", "Sudan"],
  ["SE", "Swedia", "Sweden"],
  ["SG", "Singapura", "Singapore"],
  ["SH", "Saint Helena", "Saint Helena, Ascension and Tristan da Cunha", "St. Helena"],
  ["SI", "Slovenia", "Slovenia"],
  ["SJ", "Kepulauan Svalbard dan Jan Mayen", "Svalbard and Jan Mayen", "Svalbard & Jan Mayen"],
  ["SK", "Slovakia", "Slovakia"],
  ["SL", "Sierra Leone", "Sierra Leone"],
  ["SM", "San Marino", "San Marino"],
  ["SN", "Senegal", "Senegal"],
  ["SO", "Somalia", "Somalia"],
  ["SR", "Suriname", "Suriname"],
  ["SS", "Sudan Selatan", "South Sudan"],
  ["ST", "Sao Tome dan Principe", "Sao Tome and Principe", "São Tomé & Príncipe"],
  ["SV", "El Salvador", "El Salvador"],
  ["SX", "Sint Maarten", "Sint Maarten (Dutch part)"],
  ["SY", "Suriah", "Syrian Arab Republic", "Syria"],
  ["SZ", "eSwatini", "Eswatini"],
  ["TC", "Kepulauan Turks dan Caicos", "Turks and Caicos Islands", "Turks & Caicos Islands"],
  ["TD", "Chad", "Chad"],
  ["TF", "Wilayah Selatan Prancis", "French Southern Territories"],
  ["TG", "Togo", "Togo"],
  ["TH", "Thailand", "Thailand"],
  ["TJ", "Tajikistan", "Tajikistan"],
  ["TK", "Tokelau", "Tokelau"],
  ["TL", "Timor Leste", "Timor-Leste"],
  ["TM", "Turkmenistan", "Turkmenistan"],
  ["TN", "Tunisia", "Tunisia"],
  ["TO", "Tonga", "Tonga"],
  ["TR", "Turki", "Türkiye"],
  ["TT", "Trinidad dan Tobago", "Trinidad and Tobago", "Trinidad & Tobago"],
  ["TV", "Tuvalu", "Tuvalu"],
  ["TW", "Taiwan", "Taiwan, Province of China"],
  ["TZ", "Tanzania", "Tanzania, United Republic of"],
  ["UA", "Ukraina", "Ukraine"],
  ["UG", "Uganda", "Uganda"],
  ["UM", "Kepulauan Terluar AS", "United States Minor Outlying Islands", "U.S. Outlying Islands"],
  ["US", "Amerika Serikat", "United States"],
  ["UY", "Uruguay", "Uruguay"],
  ["UZ", "Uzbekistan", "Uzbekistan"],
  ["VA", "Vatikan", "Holy See (Vatican City State)", "Vatican City"],
  ["VC", "Saint Vincent dan Grenadine", "Saint Vincent and the Grenadines", "St. Vincent & Grenadines"],
  ["VE", "Venezuela", "Venezuela, Bolivarian Republic of"],
  ["VG", "Kepulauan Virgin Britania Raya", "Virgin Islands, British", "British Virgin Islands"],
  ["VI", "Kepulauan Virgin Amerika Serikat", "Virgin Islands, U.S.", "U.S. Virgin Islands"],
  ["VN", "Vietnam", "Viet Nam"],
  ["VU", "Vanuatu", "Vanuatu"],
  ["WF", "Kepulauan Wallis dan Futuna", "Wallis and Futuna", "Wallis & Futuna"],
  ["WS", "Samoa", "Samoa"],
  ["YE", "Yaman", "Yemen"],
  ["YT", "Mayotte", "Mayotte"],
  ["ZA", "Afrika Selatan", "South Africa"],
  ["ZM", "Zambia", "Zambia"],
  ["ZW", "Zimbabwe", "Zimbabwe"],
];

const NEGARA_PER_KODE = new Map(DAFTAR_NEGARA.map((n) => [n[0], n]));

/* Kunci nama: huruf besar, tanpa tanda diakritik & tanda baca --
   "Côte d'Ivoire", "COTE D IVOIRE" & "Cote d’Ivoire" satu kunci. */
function kunciNamaNegara(v) {
  return String(v == null ? "" : v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/* Sebutan lazim di invoice & COO yang bukan nama resminya. */
const ALIAS_NEGARA = {
  KOREA: "KR",
  "REPUBLIC OF KOREA": "KR",
  "KOREA REP": "KR",
  PRC: "CN",
  "P R CHINA": "CN",
  "PR CHINA": "CN",
  "PEOPLES REPUBLIC OF CHINA": "CN",
  "PEOPLE S REPUBLIC OF CHINA": "CN",
  "REPUBLIC OF CHINA": "TW",
  "TAIWAN ROC": "TW",
  "TAIWAN R O C": "TW",
  USA: "US",
  "U S A": "US",
  "UNITED STATES OF AMERICA": "US",
  AMERICA: "US",
  UK: "GB",
  "U K": "GB",
  "GREAT BRITAIN": "GB",
  ENGLAND: "GB",
  HOLLAND: "NL",
  "THE NETHERLANDS": "NL",
  "CZECH REPUBLIC": "CZ",
  TURKEY: "TR",
  RUSSIA: "RU",
  UAE: "AE",
  "U A E": "AE",
  HONGKONG: "HK",
};

let negaraPerNama = null;
function petaNamaNegara() {
  if (negaraPerNama) return negaraPerNama;
  negaraPerNama = new Map();
  DAFTAR_NEGARA.forEach((n) => {
    n.slice(1).forEach((nama) => {
      const k = kunciNamaNegara(nama);
      if (k && !negaraPerNama.has(k)) negaraPerNama.set(k, n[0]);
    });
  });
  Object.entries(ALIAS_NEGARA).forEach(([nama, kode]) => negaraPerNama.set(kunciNamaNegara(nama), kode));
  return negaraPerNama;
}

/* Teks apa pun -> kode negara, "" bila tidak dikenal. Dikenali: kodenya
   sendiri ("kr"), label saran ("KR — Korea Selatan · ..."), bentuk
   cetakan PIB ("KOREA, REPUBLIC OF (KR)"), dan nama -- Indonesia, ISO,
   atau sebutan lazim ("Korea Selatan", "South Korea", "KOREA"). */
function kodeNegara(teks) {
  const s = String(teks == null ? "" : teks).trim();
  if (!s) return "";
  const besar = s.toUpperCase();
  let m = /^([A-Z]{2})(?:\s*[\u2014\u2013-]\s*.*)?$/.exec(besar);
  if (m && NEGARA_PER_KODE.has(m[1])) return m[1];
  m = /\(\s*([A-Z]{2})\s*\)\s*$/.exec(besar);
  if (m && NEGARA_PER_KODE.has(m[1])) return m[1];
  return petaNamaNegara().get(kunciNamaNegara(s)) || "";
}

// Nama negara dalam bahasa aktif: Indonesia, atau nama Inggris yang lazim
function namaNegara(kode) {
  const n = NEGARA_PER_KODE.get(String(kode == null ? "" : kode).trim().toUpperCase());
  if (!n) return "";
  return tt(n[1], n[3] || n[2]);
}

// "KR — Korea Selatan"; kode tak dikenal ditampilkan apa adanya
function labelNegara(kode) {
  const k = String(kode == null ? "" : kode).trim().toUpperCase();
  const nama = namaNegara(k);
  return nama ? `${k} — ${nama}` : k;
}

/* Saran kotak Kode Negara Asal. value = kode (yang tersimpan & yang
   dikirim ke CEISA); labelnya memuat semua nama, karena saran datalist
   dicocokkan dengan teks label juga -- mengetik "korea", "selatan" atau
   "kr" sama-sama menemukannya. */
function negaraDatalistHtml() {
  return DAFTAR_NEGARA.map((n) => `<option value="${n[0]}">${escapeHtml([`${n[0]} — ${n[1]}`].concat(n.slice(2)).join(" · "))}</option>`).join("");
}

function pasangDatalistNegara() {
  const dl = document.getElementById("negaraList");
  if (dl && !dl.options.length) dl.innerHTML = negaraDatalistHtml();
}
if (typeof document !== "undefined") pasangDatalistNegara();
