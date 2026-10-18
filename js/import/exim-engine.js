/* ====================================================================================================================
 * EXIM ENGINE — mesin ekstraksi CIPL + pemeriksa konsistensi CIPL ↔ draft PIB / PEB CEISA
 *
 * SATU BERKAS, DUA APLIKASI. Berkas ini identik di EXIM Checker (EXIM Tuned, berdiri sendiri) dan di Shipment
 * Schedule (js/import/exim-engine.js). Perbaikan ekstraksi cukup ditulis sekali di sini dan langsung dipakai keduanya:
 *   - EXIM Checker: halaman pemeriksa CIPL vs draft PIB/PEB.
 *   - Shipment Schedule: halaman "Cek PIB/PEB" DAN impor CIPL di form jadwal (js/import/dispatch.js).
 *
 * Semua isinya tertutup di dalam satu IIFE; yang keluar hanya `EximEngine` (window) / module.exports (Node, untuk uji).
 * Shipment Schedule memuat puluhan berkas yang berbagi satu lingkup global (norm, num, INCOTERM_RE, normName, $ ...) —
 * tanpa pembungkus ini nama-nama mesin akan bertabrakan dengan milik aplikasi.
 *
 * Bergantung pada global `XLSX` (SheetJS 0.18.5 atau 0.20.x) hanya saat membaca workbook. PDF.js diberikan pemanggil.
 * ==================================================================================================================== */
(function (root) {
"use strict";
/* ---- engine: e4_places.js ---- */
/* ====================================================================================================================
 * Places: customs offices, countries, sea ports (UN/LOCODE) and airports (IATA).
 *
 * A port written in a CIPL ("Jakarta Airport", "Incheon, Korea", "CGK") and a port code of the CEISA draft (IDCGK, KRICN, IDTPP) are compared by
 * what they stand for, not letter by letter:
 *   - the UN/LOCODE of an airport is the country code + the IATA code: IDCGK = ID + CGK (Jakarta, Soekarno-Hatta), KRICN = KR + ICN (Incheon).
 *   - a city alone ("Jakarta") stands for every port and airport of that city; "Jakarta Airport" only for its airport, "Tanjung Priok" only for the sea port.
 *   - a country alone ("Korea") stands for every port and airport in that country.
 * Text that is not in these tables is compared as written, as before.
 * ==================================================================================================================== */

const OFFICE_MASTER = {'040300':'KPU Tanjung Priok','050100':'KPU Soekarno-Hatta'};
// Sea shipments (import and export alike) are handled at Tanjung Priok, air shipments at Soekarno-Hatta airport (CGK / IDCGK).
const OFFICE_BY_MODE = {SEA:'040300',AIR:'050100'};
const MODE_LABEL = {SEA:'Laut (sea)',AIR:'Udara (air)'};

// Sea ports: UN/LOCODE -> city (also the group: two codes with the same city are the same place) and the names the code stands for.
const PORT_MASTER = {
  'IDTPP': {city:'JAKARTA', aliases:['JAKARTA','JKT','TANJUNG PRIOK','JAKARTA UTARA','IDTPP']},
  'IDJKT': {city:'JAKARTA', aliases:['JAKARTA','JKT','IDJKT']},
  'IDSUB': {city:'SURABAYA', aliases:['SURABAYA','TANJUNG PERAK','IDSUB']},
  'IDSRG': {city:'SEMARANG', aliases:['SEMARANG','TANJUNG EMAS','IDSRG']},
  'IDBLW': {city:'BELAWAN', aliases:['BELAWAN','MEDAN','IDBLW']},
  'KRPUS': {city:'BUSAN', aliases:['BUSAN','PUSAN','KRPUS']},
  'KRINC': {city:'INCHEON', aliases:['INCHEON','INCHON','KRINC']},
  'VNSGN': {city:'HO CHI MINH CITY', aliases:['HO CHI MINH','HOCHIMINH','HO CHI MINH CITY','SAIGON','VNSGN']},
  'VNDAD': {city:'DA NANG', aliases:['DA NANG','DANANG','VNDAD']},
  'VNHPH': {city:'HAI PHONG', aliases:['HAI PHONG','HAIPHONG','VNHPH']},
  'CNSHA': {city:'SHANGHAI', aliases:['SHANGHAI','CNSHA']},
  'CNNGB': {city:'NINGBO', aliases:['NINGBO','CNNGB']},
  'HKHKG': {city:'HONG KONG', aliases:['HONG KONG','HKHKG']},
  'JPTYO': {city:'TOKYO', aliases:['TOKYO','JPTYO']},
  'SGSIN': {city:'SINGAPORE', aliases:['SINGAPORE','SGSIN']},
  'THLCH': {city:'LAEM CHABANG', aliases:['LAEM CHABANG','BANGKOK','THLCH']},
  'MYPKG': {city:'PORT KLANG', aliases:['PORT KLANG','KLANG','KUALA LUMPUR','MYPKG']},
  'USLAX': {city:'LOS ANGELES', aliases:['LOS ANGELES','USLAX']},
  'NLRTM': {city:'ROTTERDAM', aliases:['ROTTERDAM','NLRTM']},
  'DEHAM': {city:'HAMBURG', aliases:['HAMBURG','DEHAM']}
};

// Countries: ISO code | name shown | other names.  A country written alone stands for every port and airport of that country.
const COUNTRY_ROWS = [
  'ID|INDONESIA','KR|KOREA|SOUTH KOREA|KOREA SELATAN|REPUBLIC OF KOREA|REP OF KOREA|ROK','KP|NORTH KOREA|DPRK','JP|JAPAN',
  'CN|CHINA|PEOPLES REPUBLIC OF CHINA|PRC|PR CHINA|MAINLAND CHINA','HK|HONG KONG|HONGKONG','MO|MACAU|MACAO','TW|TAIWAN|CHINESE TAIPEI',
  'SG|SINGAPORE','MY|MALAYSIA','TH|THAILAND','VN|VIETNAM|VIET NAM','PH|PHILIPPINES','KH|CAMBODIA','LA|LAOS|LAO PDR','MM|MYANMAR|BURMA',
  'BN|BRUNEI|BRUNEI DARUSSALAM','TL|TIMOR LESTE|EAST TIMOR','IN|INDIA','PK|PAKISTAN','BD|BANGLADESH','LK|SRI LANKA','NP|NEPAL',
  'AU|AUSTRALIA','NZ|NEW ZEALAND','PG|PAPUA NEW GUINEA|PNG',
  'AE|UNITED ARAB EMIRATES|UAE','SA|SAUDI ARABIA|KSA','QA|QATAR','KW|KUWAIT','OM|OMAN','BH|BAHRAIN','IL|ISRAEL','IR|IRAN','IQ|IRAQ','JO|JORDAN','TR|TURKEY|TURKIYE',
  'EG|EGYPT','ZA|SOUTH AFRICA','ET|ETHIOPIA','KE|KENYA','NG|NIGERIA','GH|GHANA','MA|MOROCCO','DZ|ALGERIA','TZ|TANZANIA',
  'GB|UNITED KINGDOM|UK|GREAT BRITAIN|BRITAIN|ENGLAND','IE|IRELAND','DE|GERMANY|DEUTSCHLAND','FR|FRANCE','NL|NETHERLANDS|THE NETHERLANDS|HOLLAND','BE|BELGIUM','LU|LUXEMBOURG',
  'CH|SWITZERLAND','AT|AUSTRIA','IT|ITALY','ES|SPAIN','PT|PORTUGAL','SE|SWEDEN','NO|NORWAY','DK|DENMARK','FI|FINLAND','PL|POLAND','CZ|CZECH REPUBLIC|CZECHIA',
  'HU|HUNGARY','RO|ROMANIA','GR|GREECE','RU|RUSSIA|RUSSIAN FEDERATION','UA|UKRAINE',
  'US|USA|UNITED STATES|UNITED STATES OF AMERICA|U S A','CA|CANADA','MX|MEXICO','BR|BRAZIL|BRASIL','AR|ARGENTINA','CL|CHILE','CO|COLOMBIA','PE|PERU'
];

// Airports: IATA | country | name shown | other names.  The UN/LOCODE of an airport is the country code + the IATA code (IDCGK = ID + CGK).
// A name shared by several airports (SEOUL: ICN, GMP) stands for all of them.
const AIRPORT_ROWS = [
  // Indonesia
  'CGK|ID|JAKARTA|SOEKARNO HATTA|SUKARNO HATTA|SOEKARNOHATTA|CENGKARENG|SOETTA|JKT','DPS|ID|DENPASAR|BALI|NGURAH RAI|I GUSTI NGURAH RAI','SUB|ID|SURABAYA|JUANDA',
  'KNO|ID|MEDAN|KUALANAMU|KUALA NAMU','JOG|ID|YOGYAKARTA|JOGJA|JOGJAKARTA|ADISUCIPTO|ADISUTJIPTO|ADI SUTJIPTO','YIA|ID|YOGYAKARTA KULON PROGO|YOGYAKARTA|KULON PROGO|YOGYAKARTA INTERNATIONAL',
  'BDO|ID|BANDUNG|HUSEIN SASTRANEGARA','KJT|ID|KERTAJATI|MAJALENGKA','SRG|ID|SEMARANG|AHMAD YANI','UPG|ID|MAKASSAR|UJUNG PANDANG|SULTAN HASANUDDIN',
  'BPN|ID|BALIKPAPAN|SULTAN AJI MUHAMMAD SULAIMAN|SEPINGGAN','BTH|ID|BATAM|HANG NADIM','PLM|ID|PALEMBANG|SULTAN MAHMUD BADARUDDIN II','PKU|ID|PEKANBARU|SULTAN SYARIF KASIM II',
  'PNK|ID|PONTIANAK|SUPADIO','BDJ|ID|BANJARMASIN|SYAMSUDIN NOOR','MDC|ID|MANADO|SAM RATULANGI','LOP|ID|LOMBOK|PRAYA|LOMBOK INTERNATIONAL','SOC|ID|SOLO|SURAKARTA|ADI SOEMARMO',
  'PDG|ID|PADANG|MINANGKABAU','TKG|ID|BANDAR LAMPUNG|LAMPUNG|RADIN INTEN II','DJJ|ID|JAYAPURA|SENTANI','AMQ|ID|AMBON|PATTIMURA','KOE|ID|KUPANG|EL TARI',
  'MLG|ID|MALANG|ABDUL RACHMAN SALEH','BWX|ID|BANYUWANGI',
  // Korea, Japan
  'ICN|KR|INCHEON|SEOUL|SEOUL INCHEON','GMP|KR|SEOUL GIMPO|SEOUL|GIMPO|KIMPO','PUS|KR|BUSAN|PUSAN|GIMHAE|KIMHAE','CJU|KR|JEJU|CHEJU','TAE|KR|DAEGU','CJJ|KR|CHEONGJU',
  'NRT|JP|TOKYO NARITA|TOKYO|NARITA','HND|JP|TOKYO HANEDA|TOKYO|HANEDA','KIX|JP|OSAKA KANSAI|OSAKA|KANSAI','ITM|JP|OSAKA ITAMI|OSAKA|ITAMI','NGO|JP|NAGOYA|CHUBU|CENTRAIR|CHUBU CENTRAIR',
  'FUK|JP|FUKUOKA','CTS|JP|SAPPORO|NEW CHITOSE|CHITOSE','OKA|JP|OKINAWA|NAHA','HIJ|JP|HIROSHIMA','SDJ|JP|SENDAI',
  // China, Hong Kong, Macau, Taiwan
  'PVG|CN|SHANGHAI PUDONG|SHANGHAI|PUDONG','SHA|CN|SHANGHAI HONGQIAO|SHANGHAI|HONGQIAO','PEK|CN|BEIJING CAPITAL|BEIJING','PKX|CN|BEIJING DAXING|BEIJING|DAXING',
  'CAN|CN|GUANGZHOU|BAIYUN|GUANGZHOU BAIYUN|CANTON','SZX|CN|SHENZHEN|BAOAN|BAO AN','CTU|CN|CHENGDU|SHUANGLIU','TFU|CN|CHENGDU TIANFU|CHENGDU|TIANFU','XMN|CN|XIAMEN|GAOQI',
  'TAO|CN|QINGDAO|JIAODONG|LIUTING','DLC|CN|DALIAN','TSN|CN|TIANJIN|BINHAI','NKG|CN|NANJING|LUKOU','HGH|CN|HANGZHOU|XIAOSHAN','WUH|CN|WUHAN|TIANHE','CSX|CN|CHANGSHA|HUANGHUA',
  'CKG|CN|CHONGQING|JIANGBEI','KMG|CN|KUNMING|CHANGSHUI','XIY|CN|XIAN|XI AN|XIANYANG','NGB|CN|NINGBO|LISHE','FOC|CN|FUZHOU|CHANGLE',
  'HKG|HK|HONG KONG|CHEK LAP KOK','MFM|MO|MACAU|MACAO','TPE|TW|TAIPEI TAOYUAN|TAIPEI|TAOYUAN|TAIWAN TAOYUAN','TSA|TW|TAIPEI SONGSHAN|TAIPEI|SONGSHAN','KHH|TW|KAOHSIUNG','RMQ|TW|TAICHUNG',
  // South-East Asia
  'SIN|SG|SINGAPORE|CHANGI','KUL|MY|KUALA LUMPUR|KLIA|SEPANG','PEN|MY|PENANG|PULAU PINANG|BAYAN LEPAS','JHB|MY|JOHOR BAHRU|SENAI|JOHOR','BKI|MY|KOTA KINABALU','KCH|MY|KUCHING',
  'BKK|TH|BANGKOK SUVARNABHUMI|BANGKOK|SUVARNABHUMI','DMK|TH|BANGKOK DON MUEANG|BANGKOK|DON MUEANG|DONMUEANG','HKT|TH|PHUKET','CNX|TH|CHIANG MAI',
  'SGN|VN|HO CHI MINH CITY|HO CHI MINH|HOCHIMINH|SAIGON|TAN SON NHAT','HAN|VN|HANOI|NOI BAI','DAD|VN|DA NANG|DANANG','HPH|VN|HAI PHONG|HAIPHONG|CAT BI','CXR|VN|CAM RANH|NHA TRANG',
  'MNL|PH|MANILA|NINOY AQUINO','CEB|PH|CEBU|MACTAN','CRK|PH|CLARK|ANGELES','PNH|KH|PHNOM PENH','REP|KH|SIEM REAP','RGN|MM|YANGON|RANGOON','VTE|LA|VIENTIANE','BWN|BN|BANDAR SERI BEGAWAN','DIL|TL|DILI',
  // South Asia, Oceania
  'DEL|IN|DELHI|NEW DELHI|INDIRA GANDHI','BOM|IN|MUMBAI|BOMBAY|CHHATRAPATI SHIVAJI','MAA|IN|CHENNAI|MADRAS','BLR|IN|BENGALURU|BANGALORE','HYD|IN|HYDERABAD','CCU|IN|KOLKATA|CALCUTTA',
  'AMD|IN|AHMEDABAD','COK|IN|KOCHI|COCHIN','PNQ|IN|PUNE','DAC|BD|DHAKA|DACCA','CGP|BD|CHITTAGONG|CHATTOGRAM','CMB|LK|COLOMBO|KATUNAYAKE|BANDARANAIKE','KHI|PK|KARACHI','LHE|PK|LAHORE',
  'ISB|PK|ISLAMABAD','KTM|NP|KATHMANDU','SYD|AU|SYDNEY|KINGSFORD SMITH','MEL|AU|MELBOURNE|TULLAMARINE','BNE|AU|BRISBANE','PER|AU|PERTH','ADL|AU|ADELAIDE','AKL|NZ|AUCKLAND',
  // Middle East, Africa
  'DXB|AE|DUBAI','DWC|AE|DUBAI AL MAKTOUM|DUBAI|AL MAKTOUM','AUH|AE|ABU DHABI','SHJ|AE|SHARJAH','DOH|QA|DOHA|HAMAD','JED|SA|JEDDAH|KING ABDULAZIZ','RUH|SA|RIYADH|KING KHALID',
  'DMM|SA|DAMMAM|KING FAHD','KWI|KW|KUWAIT|KUWAIT CITY','MCT|OM|MUSCAT','BAH|BH|BAHRAIN','TLV|IL|TEL AVIV|BEN GURION','IST|TR|ISTANBUL','SAW|TR|ISTANBUL SABIHA GOKCEN|ISTANBUL|SABIHA GOKCEN',
  'CAI|EG|CAIRO','ADD|ET|ADDIS ABABA|BOLE','NBO|KE|NAIROBI|JOMO KENYATTA','JNB|ZA|JOHANNESBURG|OR TAMBO','CPT|ZA|CAPE TOWN','CMN|MA|CASABLANCA','LOS|NG|LAGOS',
  // Europe
  'LHR|GB|LONDON HEATHROW|LONDON|HEATHROW','LGW|GB|LONDON GATWICK|LONDON|GATWICK','STN|GB|LONDON STANSTED|LONDON|STANSTED','MAN|GB|MANCHESTER','BHX|GB|BIRMINGHAM','EDI|GB|EDINBURGH',
  'FRA|DE|FRANKFURT','MUC|DE|MUNICH|MUNCHEN','DUS|DE|DUSSELDORF','BER|DE|BERLIN|BRANDENBURG','HAM|DE|HAMBURG','CGN|DE|COLOGNE|KOLN|COLOGNE BONN','STR|DE|STUTTGART','LEJ|DE|LEIPZIG|LEIPZIG HALLE',
  'CDG|FR|PARIS CHARLES DE GAULLE|PARIS|CHARLES DE GAULLE|ROISSY','ORY|FR|PARIS ORLY|PARIS|ORLY','LYS|FR|LYON','MRS|FR|MARSEILLE','NCE|FR|NICE','TLS|FR|TOULOUSE',
  'AMS|NL|AMSTERDAM|SCHIPHOL','BRU|BE|BRUSSELS|BRUXELLES','LGG|BE|LIEGE','ANR|BE|ANTWERP','ZRH|CH|ZURICH','GVA|CH|GENEVA','BSL|CH|BASEL|EUROAIRPORT','VIE|AT|VIENNA|WIEN',
  'FCO|IT|ROME FIUMICINO|ROME|FIUMICINO','MXP|IT|MILAN MALPENSA|MILAN|MALPENSA','LIN|IT|MILAN LINATE|MILAN|LINATE','VCE|IT|VENICE','BLQ|IT|BOLOGNA','MAD|ES|MADRID|BARAJAS','BCN|ES|BARCELONA',
  'LIS|PT|LISBON','ARN|SE|STOCKHOLM|ARLANDA','GOT|SE|GOTHENBURG|GOTEBORG','CPH|DK|COPENHAGEN|KOBENHAVN','OSL|NO|OSLO','HEL|FI|HELSINKI','WAW|PL|WARSAW|CHOPIN','PRG|CZ|PRAGUE','BUD|HU|BUDAPEST',
  'DUB|IE|DUBLIN','ATH|GR|ATHENS','SVO|RU|MOSCOW SHEREMETYEVO|MOSCOW|SHEREMETYEVO','DME|RU|MOSCOW DOMODEDOVO|MOSCOW|DOMODEDOVO',
  // Americas
  'LAX|US|LOS ANGELES','SFO|US|SAN FRANCISCO','JFK|US|NEW YORK JFK|NEW YORK|JOHN F KENNEDY|KENNEDY','EWR|US|NEWARK|NEW YORK|NEW YORK NEWARK','ORD|US|CHICAGO|OHARE|O HARE','ATL|US|ATLANTA',
  'DFW|US|DALLAS FORT WORTH|DALLAS|FORT WORTH','IAH|US|HOUSTON','MIA|US|MIAMI','SEA|US|SEATTLE|SEATTLE TACOMA','BOS|US|BOSTON','IAD|US|WASHINGTON DULLES|WASHINGTON|DULLES','DEN|US|DENVER',
  'PHX|US|PHOENIX','LAS|US|LAS VEGAS','DTW|US|DETROIT','MSP|US|MINNEAPOLIS','PHL|US|PHILADELPHIA','CLT|US|CHARLOTTE','MEM|US|MEMPHIS','SDF|US|LOUISVILLE','CVG|US|CINCINNATI',
  'ANC|US|ANCHORAGE','HNL|US|HONOLULU','SLC|US|SALT LAKE CITY','YVR|CA|VANCOUVER','YYZ|CA|TORONTO','YUL|CA|MONTREAL','MEX|MX|MEXICO CITY','GRU|BR|SAO PAULO|GUARULHOS',
  'EZE|AR|BUENOS AIRES|EZEIZA|MINISTRO PISTARINI','SCL|CL|SANTIAGO','BOG|CO|BOGOTA','LIM|PE|LIMA'
];

// ---- indexes, built once ----
// text key: capitals, "&" as AND, apostrophes dropped, every other run of non-alphanumerics as one space ("SOEKARNO-HATTA" -> "SOEKARNO HATTA")
function placeKey(v){return String(v??'').toUpperCase().replace(/&/g,' AND ').replace(/['’`]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();}
const COUNTRY_MASTER = {};              // ISO code -> [name shown, other names...]
const COUNTRY_BY_NAME = new Map();      // 'SOUTH KOREA' -> 'KR'
const PLACES = [];                      // {id, kind:'SEA'|'AIR', code, iata, country, label, group}
const PLACE_BY_CODE = new Map();        // 'KRPUS' -> [sea port, airport]  (the code of a city can stand for its port and its airport)
const PLACE_BY_IATA = new Map();        // 'CGK' -> airport
const PLACE_BY_NAME = new Map();        // 'JAKARTA' -> [every place that name stands for]   (each place also keeps its own names: place.names)
function addPlaceName(name,place){const k=placeKey(name); if(!k) return; if(!PLACE_BY_NAME.has(k)) PLACE_BY_NAME.set(k,[]); const l=PLACE_BY_NAME.get(k); if(!l.includes(place)) l.push(place); if(!place.names.includes(k)) place.names.push(k);}
function addPlaceCode(code,place){if(!PLACE_BY_CODE.has(code)) PLACE_BY_CODE.set(code,[]); PLACE_BY_CODE.get(code).push(place);}
(function buildPlaceTables(){
  for(const row of COUNTRY_ROWS){
    const p=row.split('|'); COUNTRY_MASTER[p[0]]=p.slice(1);
    p.slice(1).forEach(n=>COUNTRY_BY_NAME.set(placeKey(n),p[0]));
  }
  for(const [code,p] of Object.entries(PORT_MASTER)){
    const place={id:'S:'+code,kind:'SEA',code,iata:'',country:code.slice(0,2),label:p.city,group:'S:'+p.city,names:[]};
    PLACES.push(place); addPlaceCode(code,place);
    addPlaceName(p.city,place); p.aliases.forEach(a=>{if(a!==code) addPlaceName(a,place);});
  }
  for(const row of AIRPORT_ROWS){
    const p=row.split('|'), iata=p[0], country=p[1], label=p[2], code=country+iata;
    const place={id:'A:'+iata,kind:'AIR',code,iata,country,label,group:'A:'+iata,names:[]};
    PLACES.push(place); addPlaceCode(code,place); PLACE_BY_IATA.set(iata,place);
    p.slice(2).forEach(n=>addPlaceName(n,place));
  }
})();
const byLengthDesc=(a,b)=>b.length-a.length||(a<b?-1:1);
let PLACE_NAME_LIST = [...PLACE_BY_NAME.keys()].sort(byLengthDesc);       // longest first: "NEW YORK" before "YORK"
const COUNTRY_NAME_LIST = [...COUNTRY_BY_NAME.keys()].sort(byLengthDesc);
// Group of a known code ('IDTPP' -> 'S:JAKARTA'): two places of one group are the same place (a city's terminals).
function placeGroupOf(code,kind){const l=PLACE_BY_CODE.get(String(code||'').toUpperCase())||[]; const p=l.find(x=>!kind||x.kind===kind)||l[0]; return p?p.group:'';}
// More ports and airports from the host application (Shipment Schedule passes its UN/LOCODE table):
//   rows [{code:'IDCXP', kind:'SEA'|'AIR', label:'CIREBON', names:['CIREBON', ...], group?:'S:...'}]
// A code the built-in tables already know is left alone, so the rules above (JAKARTA = IDTPP = IDJKT = IDCGK ...) never change; only places
// the tables do not know are added. Returns how many were added.
function addPlaces(rows){
  let added=0;
  for(const r of rows||[]){
    const code=String(r&&r.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const kind=r&&r.kind==='AIR'?'AIR':'SEA';
    if(!/^[A-Z]{2}[A-Z0-9]{3}$/.test(code)||!COUNTRY_MASTER[code.slice(0,2)]) continue;
    if((PLACE_BY_CODE.get(code)||[]).some(p=>p.kind===kind)) continue;
    const iata=kind==='AIR'?code.slice(2):'';
    if(kind==='AIR'&&PLACE_BY_IATA.has(iata)) continue;
    const label=placeKey(r.label||code)||code;
    const place={id:(kind==='AIR'?'A:':'S:')+code,kind,code,iata,country:code.slice(0,2),label,group:r.group?String(r.group):(kind==='AIR'?'A:'+iata:'S:'+label),names:[],extra:true};
    PLACES.push(place); addPlaceCode(code,place);
    if(kind==='AIR') PLACE_BY_IATA.set(iata,place);
    [label,...(r.names||[])].forEach(n=>{ const k=placeKey(n); if(k&&k.length>=3&&!COUNTRY_BY_NAME.has(k)) addPlaceName(k,place); });
    added++;
  }
  if(added) PLACE_NAME_LIST=[...PLACE_BY_NAME.keys()].sort(byLengthDesc);
  return added;
}
// words that say what kind of place it is, or that carry no information
const PLACE_STOP = new Set(['PORT','SEAPORT','AIRPORT','AIR','SEA','INTERNATIONAL','INTL','OF','THE','CITY','BY','HARBOUR','HARBOR','TERMINAL','APT','BANDARA','PELABUHAN','CARGO','AND']);
const AIR_WORDS = /\b(?:AIRPORT|AIR PORT|APT|BANDARA|AIR CARGO|AIRCARGO|AIR TERMINAL)\b/;
const SEA_WORDS = /\b(?:SEAPORT|SEA PORT|PORT|HARBOUR|HARBOR|PELABUHAN|CONTAINER TERMINAL)\b/;
// IATA codes that are also ordinary words (or Incoterms): read as a code only through the country prefix (KRICN), never alone
const IATA_AMBIGUOUS = new Set(['SEA','CAN','MAN','PER','HAM','DEN','MAD','CPT','PEN','ADD','DEL','SAW','GOT','BAH','LAS']);

// What a place text stands for.
//   entries     the known ports and airports it names
//   countries   the countries of those (or, for a text that is only a country, that country)
//   byCode      an explicit code (KRICN, ICN) decided it
//   countryOnly the text is a country and nothing else ("Korea")
//   unknownCode the text is one UN/LOCODE that is not in the tables (KRXYZ): only its country is known
//   firstCountry the country named first in the text
//   left        the words that no table knows (a misspelt city, say)
function resolvePlace(raw){
  const text=String(raw??'');
  const key=placeKey(text);
  const R={key,entries:[],countries:[],byCode:false,countryOnly:false,unknownCode:false,firstCountry:'',left:[]};
  if(!key) return R;
  const hits=[];                                       // {pos, country}
  const pos=name=>{const i=(' '+key+' ').indexOf(' '+name+' '); return i<0?0:i;};
  // 1. names, longest first; a name that was read is blanked, so that a shorter name inside it ("YORK" in "NEW YORK") is not read again
  let rest=' '+key+' ';
  let byNameList=[];
  for(const name of PLACE_NAME_LIST){
    const pat=' '+name+' ';
    if(rest.includes(pat)){ for(const e of PLACE_BY_NAME.get(name)){ if(!byNameList.includes(e)) byNameList.push(e); hits.push({pos:pos(name),country:e.country}); } rest=rest.split(pat).join(' # '); }
  }
  // 2. country names in what is left
  const countryNames=[];
  for(const name of COUNTRY_NAME_LIST){
    const pat=' '+name+' ';
    if(rest.includes(pat)){ countryNames.push(COUNTRY_BY_NAME.get(name)); if(!byNameList.length) hits.push({pos:pos(name),country:COUNTRY_BY_NAME.get(name)}); rest=rest.split(pat).join(' # '); }
  }
  // 3. explicit codes in what is left: UN/LOCODE (5 letters) and IATA (3 capital letters, as written)
  const codeHits=[], codeTokens=new Set();
  for(const tok of rest.split(' ')){
    if(!tok||tok==='#') continue;
    if(/^[A-Z]{5}$/.test(tok) && PLACE_BY_CODE.has(tok)){ codeTokens.add(tok); PLACE_BY_CODE.get(tok).forEach(e=>{ if(!codeHits.includes(e)) codeHits.push(e); }); hits.push({pos:pos(tok),country:tok.slice(0,2)}); }
    else if(/^[A-Z]{3}$/.test(tok) && PLACE_BY_IATA.has(tok) && !IATA_AMBIGUOUS.has(tok) && new RegExp('(?:^|[^A-Za-z])'+tok+'(?![A-Za-z])').test(text)){
      const e=PLACE_BY_IATA.get(tok); codeTokens.add(tok); if(!codeHits.includes(e)) codeHits.push(e); hits.push({pos:pos(tok),country:e.country});
    }
  }
  let entries=codeHits.length?codeHits:byNameList;     // an explicit code wins over a name
  if(!codeHits.length&&entries.length){
    const air=AIR_WORDS.test(rest), sea=SEA_WORDS.test(rest);
    if(air&&!sea){ const f=entries.filter(e=>e.kind==='AIR'); if(f.length) entries=f; }       // "Jakarta Airport": the airport only
    else if(sea&&!air){ const f=entries.filter(e=>e.kind==='SEA'); if(f.length) entries=f; }  // "Jakarta Port": the sea port only
  }
  const left=rest.split(' ').filter(tok=>tok&&tok!=='#'&&!PLACE_STOP.has(tok)&&!codeTokens.has(tok));
  R.entries=entries; R.byCode=codeHits.length>0; R.left=left;
  const cs=[];
  for(const e of entries) if(!cs.includes(e.country)) cs.push(e.country);
  if(!entries.length){
    countryNames.forEach(c=>{if(!cs.includes(c)) cs.push(c);});
    if(countryNames.length&&!left.length) R.countryOnly=true;
    else if(!countryNames.length&&left.length===1&&/^[A-Z]{5}$/.test(left[0])&&COUNTRY_MASTER[left[0].slice(0,2)]){ R.unknownCode=true; cs.push(left[0].slice(0,2)); }
  }
  R.countries=cs;
  const placeHits=hits.length?hits.slice().sort((a,b)=>a.pos-b.pos):[];
  R.firstCountry=placeHits.length?placeHits[0].country:(cs[0]||'');
  return R;
}
function samePlace(a,b){return a===b||a.group===b.group;}
function placesOverlap(A,B){return A.some(a=>B.some(b=>samePlace(a,b)));}
function placeDisplay(e){return e.kind==='AIR'?`${e.label} AIRPORT (${e.iata})`:e.label;}
function countryLabel(code){return COUNTRY_MASTER[code]?.[0]||code;}

// "JAKARTA", "JAKARTA AIRPORT, INDONESIA" ... as written (the part before the first comma); a code is shown by what it stands for
function canonicalPort(v){
  const raw=norm(v);
  if(!raw) return '';
  const R=resolvePlace(v);
  if(R.byCode&&R.entries.length){ const e=R.entries.find(x=>x.kind==='SEA')||R.entries[0]; return placeDisplay(e); }
  return raw.replace(/,.*$/,'').trim();
}
function legacyPortMatch(a,b){
  const x=norm(a).replace(/,.*$/,'').trim(), y=norm(b).replace(/,.*$/,'').trim();
  return !!(x&&y&&(x===y||x.includes(y)||y.includes(x)));
}
// Edit distance where swapping two neighbouring letters counts as one edit (INCHOEN -> INCHEON).
function editDistance(a,b){
  const m=a.length,n=b.length,d=[];
  for(let i=0;i<=m;i++){d[i]=[i]; for(let j=1;j<=n;j++) d[i][j]=i?0:j;}
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    const c=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[m][n];
}
// A text that no table knows ("INCHOEN, KOREA") is read as the place the other side names (KRICN = Incheon) when its unknown words are one letter off
// (two for names of 8 letters or more) from one of that place's names, and its own country, if it has one, is the country of that place.
function misspeltAs(X,entries){
  if(X.entries.length||!X.left.length||X.left.length>3||!entries.length) return null;
  // the country of a text that only looks like a code (SEOLL = "SE" + OLL) is a guess, not something the text says
  if(!X.unknownCode&&X.countries.length&&!entries.some(e=>X.countries.includes(e.country))) return null;
  const word=X.left.join(' ');
  let best=null;
  for(const e of entries) for(const name of e.names){
    const limit=name.length>=8?2:name.length>=5?1:0;
    if(!limit||Math.abs(name.length-word.length)>limit) continue;
    const d=editDistance(word,name);
    if(d>0&&d<=limit&&(!best||d<best.d)) best={word,name,d};
  }
  return best;
}
function portEquivalent(a,b){
  const A=resolvePlace(a), B=resolvePlace(b);
  if(!A.key||!B.key) return false;
  if(A.entries.length&&B.entries.length) return placesOverlap(A.entries,B.entries);
  // a country alone stands for every port and airport of that country
  const countryHit=(X,Y)=>X.countryOnly&&Y.countries.some(c=>X.countries.includes(c));
  if(countryHit(A,B)||countryHit(B,A)) return true;
  if(misspeltAs(A,B.entries)||misspeltAs(B,A.entries)) return true;      // a misspelling of the place the other side names
  return legacyPortMatch(a,b);                          // not in the tables: compared as written
}
// What the user should know about how a draft port code was read (only airport codes, and a CIPL that names a country alone).
function portNote(ciplText,draftText,equal){
  const B=resolvePlace(draftText), A=resolvePlace(ciplText), parts=[];
  if(B.byCode&&B.entries.length&&B.entries.every(e=>e.kind==='AIR')){
    const e=B.entries[0];
    parts.push(`${norm(draftText)} = ${placeDisplay(e)}, ${countryLabel(e.country)}.`);
  }
  if(equal){ const m=misspeltAs(A,B.entries)||misspeltAs(B,A.entries); if(m) parts.push(`Tertulis "${m.word}"; dibaca sebagai ${m.name} (selisih ${m.d} huruf).`); }
  if(equal&&A.countryOnly) parts.push(`CIPL hanya menulis negara (${A.countries.map(countryLabel).join(', ')}); dianggap sama dengan semua pelabuhan dan bandara di negara itu.`);
  return parts.join(' ');
}
// Country of a destination written in a CIPL: from the port or airport it names, else from the country name itself.
function countryFromDestination(v){return resolvePlace(v).firstCountry;}
// 'AIR' or 'SEA' when a port code is unambiguous (IDCGK is only an airport, IDTPP only a sea port), else ''.
function placeKind(code){
  const R=resolvePlace(code);
  if(!R.byCode||!R.entries.length) return '';
  const kinds=[...new Set(R.entries.map(e=>e.kind))];
  return kinds.length===1?kinds[0]:'';
}
const CURRENCY_CODES = ['USD','EUR','KRW','JPY','CNY','RMB','SGD','THB','AUD','GBP','MYR','IDR','HKD','TWD','VND','INR','CHF','CAD','NZD','PHP',
  'CNH','AED','SAR','QAR','KWD','BHD','OMR','TRY','RUB','BRL','MXN','ZAR','SEK','NOK','DKK','PLN','CZK','HUF','PKR','BDT','LKR','MMK','KHR','LAK','BND','MOP'];
// cellDates:false  -> date cells arrive as Excel serials (normalizeDate converts them, no timezone shift)
// cellNF:true      -> keep cell number formats, so currency can be read from formats like "USD "#,##0.
//                     CIPL only: the CEISA draft does not need it, and its header cells carry date formats on text.
const XLSX_READ_OPTS = {type:'array',cellDates:false,cellNF:true,cellStyles:true};      // CIPL workbook (cellStyles: SheetJS reports hidden rows and columns only with it)
const XLSX_DECL_READ_OPTS = {type:'array',cellDates:false};             // CEISA draft workbook
const INCOTERM_RE = /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DAT)\b/;

function norm(v){
  if(v === null || v === undefined) return '';
  return String(v).replace(/\r|\n/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
}
function normName(v){return norm(v).replace(/[.,]/g,'').replace(/\s+/g,' ')}
function num(v){
  if(v === null || v === undefined || v === '') return null;
  if(typeof v === 'number' && Number.isFinite(v)) return v;
  let s = String(v).replace(/\r|\n/g,' ').trim();
  if(!s) return null;
  const negative=/^\(.*\)$/.test(s);
  // EXIM values are typically plain numeric strings; keep decimal dots.
  s=s.replace(/,/g,'').replace(/[^0-9.\-]/g,'');
  if(!s || s==='-' || s==='.') return null;
  const n=Number(s);
  if(!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}
// Label comparison ignores the spaces around "/" ("Shipper / Seller" = "Shipper/Seller").
function labelKey(v){return norm(v).replace(/\s*\/\s*/g,'/');}
function cleanText(v){return String(v??'').replace(/\s+/g,' ').trim();}
// Strict number read for table cells: a real number, or text that is only a number (optionally led by a currency code or symbol, or
// followed by a unit such as "1,000 KG"). Unlike num(), text that merely contains digits ("DD-DDI2026091601", "SEP 16, 2026") is never a number.
// Both written conventions are understood: 1,234.56 (comma = thousands) and 1.234,56 (dot = thousands); "1.234" alone stays a decimal.
const CURRENCY_LEAD=new RegExp('^(?:[A-Z]{3}|US\\$|[$€£¥₩￦])\\s*','i');
// How the document writes numbers, found once per document (detectNumberLocale): 'eu' = 1.234,56, anything else = 1,234.56. It only decides the
// ambiguous cases: "297,379" is 297.379 in an 'eu' document and 297379 otherwise, "1.234" is 1234 in an 'eu' document and 1.234 otherwise.
let NUM_LOCALE='';
function detectNumberLocale(grids){
  let eu=0,us=0;
  for(const g of grids) for(const row of g.rows) for(const v of row){
    if(typeof v!=='string') continue;
    const s=v.replace(/[\u00a0\u2007\u202f]/g,' ').trim().replace(CURRENCY_LEAD,'').replace(/\s*[A-Za-z]{1,6}\.?$/,'');
    if(!s||s.length>20) continue;
    if(/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s)||/^\d{1,3}(?:\.\d{3}){2,}$/.test(s)) eu++;
    else if(/^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)||/^\d{1,3}(?:,\d{3}){2,}$/.test(s)) us++;
    else if(/^\d+,\d{1,2}$/.test(s)||/^\d+,\d{4,}$/.test(s)) eu++;
  }
  return eu>us?'eu':'';
}
function parseNumberText(raw){
  let s=String(raw).replace(/[   ]/g,' ').trim();
  if(!s||s.length>40) return null;
  let neg=false;
  const par=s.match(/^\((.*)\)$/); if(par){neg=true;s=par[1].trim();}
  s=s.replace(CURRENCY_LEAD,'');
  if(/^[-−–]/.test(s)){neg=!neg;s=s.slice(1).trim();} else if(s[0]==='+') s=s.slice(1).trim();
  s=s.replace(CURRENCY_LEAD,'');
  let digits=null;
  if(NUM_LOCALE==='eu'&&/^\d{1,3},\d{3}$/.test(s)) digits=s.replace(',','.');                              // 297,379  (decimal comma, three decimals)
  else if(NUM_LOCALE==='eu'&&/^\d{1,3}\.\d{3}$/.test(s)) digits=s.replace('.','');                        // 1.234    (thousands dot)
  else if(/^\d+$/.test(s)||/^\d+\.\d+$/.test(s)||/^\.\d+$/.test(s)) digits=s;                                  // 1234  1234.56  .5
  else if(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) digits=s.replace(/,/g,'');                             // 1,234,567.89
  else if(/^\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?$/.test(s)||/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) digits=s.replace(/\./g,'').replace(',','.');   // 1.234.567,89  1.234,56
  else if(/^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(s)) digits=s.replace(/ /g,'').replace(',','.');           // 1 234 567,89
  else if(/^\d+,\d+$/.test(s)) digits=s.replace(',','.');                                                  // 12,5  (decimal comma)
  if(digits===null) return null;
  const n=Number(digits);
  if(!Number.isFinite(n)) return null;
  return neg?-n:n;
}
function numStrict(v){
  if(typeof v==='number') return Number.isFinite(v)?v:null;
  if(typeof v!=='string') return null;
  return parseNumberText(v);
}
function numCell(v){
  const n=numStrict(v); if(n!==null) return n;
  if(typeof v==='string'){
    const m=v.replace(/[   ]/g,' ').trim().match(/^(-?[\d.,]*\d)\s*[A-Za-z]{1,6}\.?$/);
    if(m) return parseNumberText(m[1]);
  }
  return null;
}
const round2=v=>Math.round(v*100)/100;
const round3=v=>Math.round(v*1000)/1000;
const MONTH_WORDS={JAN:1,JANUARY:1,JANUARI:1,FEB:2,FEBRUARY:2,FEBRUARI:2,MAR:3,MARCH:3,MARET:3,APR:4,APRIL:4,MAY:5,MEI:5,JUN:6,JUNE:6,JUNI:6,JUL:7,JULY:7,JULI:7,AUG:8,AUGUST:8,AGU:8,AGS:8,AGUSTUS:8,SEP:9,SEPT:9,SEPTEMBER:9,OCT:10,OCTOBER:10,OKT:10,OKTOBER:10,NOV:11,NOVEMBER:11,DEC:12,DECEMBER:12,DES:12,DESEMBER:12};
function normalizeDate(v){
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  // a Date made in another window (an iframe, a test harness) fails instanceof but is still a date
  if(v&&typeof v==='object'&&typeof v.getTime==='function'&&typeof v.toISOString==='function'&&!isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if(typeof v==='number' && Number.isFinite(v) && v>20000 && v<60000){
    const d=new Date(Date.UTC(1899,11,30) + Math.round(v)*86400000);
    if(!isNaN(d))return d.toISOString().slice(0,10);
  }
  let s = norm(v);
  if(/^\d{5}$/.test(s)){
    const n=Number(s);
    if(n>20000 && n<60000){
      const d=new Date(Date.UTC(1899,11,30) + n*86400000);
      if(!isNaN(d))return d.toISOString().slice(0,10);
    }
  }
  if(!s) return '';
  s = s.replace(/^(?:INVOICE\s+|PO\s+|P\/O\s+)?DATE\s*(?:OF\s+\w+\s*)?[:.\-]\s*/,'');                  // "Date : SEP 16, 2026"
  s = s.replace(/\b(TH|RD|ST|ND)\b/g,'').replace(/\b(\d{1,2})\s*(?:ST|ND|RD|TH)\b/g,'$1').replace(/\s+/g,' ').trim(); // ordinal suffixes: 16TH, 1 ST
  s = s.replace(/[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/,'').trim(); // drop a trailing time of day
  const months={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
  let m=s.match(/^(\d{1,2})[ -\/]([A-Z]{3})[ -\/](\d{4})$/);
  if(m && months[m[2]]) return `${m[3]}-${months[m[2]]}-${String(m[1]).padStart(2,'0')}`;
  m=s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 23/09/2026 (day first) -- but 9/23/2026 can only be month first, so it is read that way
  m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if(m){ const a=Number(m[1]), b=Number(m[2]), pad=x=>String(x).padStart(2,'0'); return (b>12&&a<=12)?`${m[3]}-${pad(a)}-${pad(b)}`:`${m[3]}-${pad(b)}-${pad(a)}`; }
  // Month written as a word: "SEP 16, 2026", "AUGUST. 31. 2026", "SEPTEMBER 16 2026", "16 SEPTEMBER 2026", "16-SEP-26" (a two-digit year means 20yy),
  // and numeric dates with dots: "16.09.2026" (day first), "2026.09.16" (year first, as in Korean documents), "2026年9月16日".
  const ymd=(y,mo,d)=>{
    const yy=String(y).length===2?'20'+y:String(y);
    return (mo>=1&&mo<=12&&d>=1&&d<=31)?`${yy}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
  };
  let r=null;
  if((m=s.match(/^([A-Z]{3,9})\.?[\s\-\/]*(\d{1,2})\s*[,.\-\/]?\s*(\d{4})$/)) && MONTH_WORDS[m[1]]) r=ymd(m[3],MONTH_WORDS[m[1]],Number(m[2]));
  else if((m=s.match(/^(\d{1,2})[\s.\-\/]*([A-Z]{3,9})\.?,?[\s.\-\/]*(\d{4}|\d{2})$/)) && MONTH_WORDS[m[2]]) r=ymd(m[3],MONTH_WORDS[m[2]],Number(m[1]));
  else if((m=s.match(/^(\d{4})\s*[.年]\s*(\d{1,2})\s*[.月]\s*(\d{1,2})\s*[.日]?$/))) r=ymd(m[1],Number(m[2]),Number(m[3]));
  else if((m=s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/))) r=ymd(m[1],Number(m[2]),Number(m[3]));             // 2026년 9월 16일
  else if((m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) r=ymd(m[1],Number(m[2]),Number(m[3]));                        // 2026/9/16, 2026-9-6
  else if((m=s.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/))) r=ymd(m[3],Number(m[2]),Number(m[1]));
  else if((m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/))) r=ymd(m[3],Number(m[2]),Number(m[1]));
  return r||s;
}
const ISO_DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
function isIsoDate(s){const m=ISO_DATE.exec(String(s||'')); return !!m&&+m[1]>=1990&&+m[1]<=2100&&+m[2]>=1&&+m[2]<=12&&+m[3]>=1&&+m[3]<=31;}
// True when the cell is a date (an Excel date serial, or text that normalizeDate can read as a real calendar date).
function isDateValue(v){
  if(typeof v==='number') return Number.isFinite(v)&&v>30000&&v<60000;
  return typeof v==='string'&&isIsoDate(normalizeDate(v));
}
// Raw cell values as a 2-D array (same shape as sheet_to_json({header:1,raw:true,defval:''})), read straight from the
// cells. SheetJS 0.20.x runs every cell that carries a date number format through numdate() inside sheet_to_json,
// which turns plain text such as "NOMOR AJU" into "Invalid Date"; reading cell.v ourselves behaves the same on all versions.
function sheetRows(wb, name){
  const ws = wb.Sheets[name];
  if(!ws || !ws['!ref']) return [];
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  for(let r=rg.s.r; r<=rg.e.r; r++){
    const row = [];
    for(let c=rg.s.c; c<=rg.e.c; c++){
      const cell = ws[XLSX.utils.encode_cell({r,c})];
      row.push(cell && cell.t!=='e' && cell.t!=='z' && cell.v!==undefined && cell.v!==null ? cell.v : '');
    }
    rows.push(row);
  }
  return rows;
}
function makeHeaderMap(row){
  const m={};
  row.forEach((v,i)=>{const k=norm(v);if(k)m[k]=i});
  return m;
}
function getCell(row,idx,key){return idx[key] !== undefined ? (row[idx[key]] ?? '') : ''}
function getCellAny(row,idx,keys){for(const k of keys){if(idx[k]!==undefined && norm(row[idx[k]])) return row[idx[k]];}return '';}
function detectDeclarationType(wb){
  const rows=sheetRows(wb,'HEADER');
  if(rows.length<2) return 'UNKNOWN';
  const idx=makeHeaderMap(rows[0]);
  const row=rows[1];
  const exp=norm(getCell(row,idx,'KODE JENIS EKSPOR'));
  const imp=norm(getCell(row,idx,'KODE JENIS IMPOR'));
  if(exp && exp!=='0') return 'PEB';
  if(imp && imp!=='0') return 'PIB';
  if(norm(getCell(row,idx,'KODE KANTOR EKSPOR'))) return 'PEB';
  if(norm(getCell(row,idx,'KODE KANTOR BONGKAR')) || norm(getCell(row,idx,'KODE KANTOR TUJUAN'))) return 'PIB';
  return 'UNKNOWN';
}
function splitMoldDescription(v){
  const s=norm(v);
  const m=s.match(/^(TYRE\s+MOLD(?:\s+FULL\s+SET|\s+TREAD\s+ONLY)?)\s+(.+)$/);
  if(!m) return {description:v,type:'',mold:''};
  let type=m[2],mold='';
  // "PS72 225/50R17 S08" -> type "PS72 225/50R17", mold "S08" (CEISA TIPE never carries the mold number)
  const typeMatch=type.match(/^(.*?\d{3}\/\d{2}[A-Z]*\d{2})(?:\s+([A-Z]?\d{1,3}[A-Z]?))?$/);
  if(typeMatch){type=typeMatch[1];mold=typeMatch[2]||'';}
  return {description:m[1],type,mold};
}
/* ---------- Party labels and TAX ID (NPWP) of the parties in the CIPL header ---------- */
// The label texts that head a party block. Both the names and the TAX IDs are read through these lists, so they always agree.
const SELLER_LABELS=['SELLER','SHIPPER / SELLER','SELLER / SHIPPER','SELLER / EXPORTER','EXPORTER / SELLER','SUPPLIER','VENDOR','SOLD BY','SELLER NAME'];
const EXPORTER_LABELS=['SHIPPER / EXPORTER','EXPORTER / SHIPPER','SHIPPER','EXPORTER','CONSIGNOR','CONSIGNER','SHIPPER NAME','EXPORTER NAME'];
const BUYER_LABELS=['CONSIGNEE / BUYER','CONSIGNEE','BUYER','BUYER / CONSIGNEE','CONSIGNEE / IMPORTER','IMPORTER / CONSIGNEE','IMPORTER','SOLD TO','BILL TO','CUSTOMER','MESSRS','SHIP TO',
  // the Korean standard form: "② For account & risk of Messrs."
  'FOR ACCOUNT AND RISK OF MESSRS','FOR ACCOUNT AND RISK OF','FOR ACCOUNT OF MESSRS','FOR ACCOUNT OF','CONSIGNED TO','DELIVER TO','BUYER / IMPORTER','IMPORTER / BUYER'];
const TAX_ROLE_NAMES={seller:'Seller',exporter:'Shipper/Exporter',buyer:'Consignee/Buyer'};
// Other header labels. They end a party block when looking up from a TAX ID line to the label above it.
const HEADER_LABEL_RE=/^(?:PORT OF\b|FINAL DESTINATION|VESSEL|DEPARTURE|SAILING|TERMS OF|COUNTRY OF|REMARKS|DOCUMENT REFERENCE|INVOICE NO|PO NO|P\/O NO|L\/C NO|OTHER REFERENCES|CARRIER|MARKS|PACKING LIST NO|FROM$|TO$|NO\.?$|ITEM$|DESCRIPTION|NO AND DATE OF)/;
// Numbering printed in front of a label: "① Shipper/Exporter", "⑧ No. & date of invoice", "(2) Consignee", "3. Port of loading", "[4] Carrier".
const ENUM_PREFIX_RE=/^\s*(?:[①-⓿❶-➓㉑-㉟㊱-㊿]|\(\s*\d{1,2}\s*\)|\[\s*\d{1,2}\s*\]|\d{1,2}\s*[.)](?!\d))\s*/;
// Key of a party label as printed: numbering, bullets and a closing colon or full stop dropped, "&" read as AND, spaces around "/" ignored.
function partyLabelKey(v){
  return norm(v).replace(/[：﹕]/g,':').replace(ENUM_PREFIX_RE,'').replace(/^[\s*#※•·▪■□◆◇▶►]+/,'').replace(ENUM_PREFIX_RE,'')
    .replace(/\s*&\s*/g,' AND ').replace(/\s*\/\s*/g,'/').replace(/[\s:.]+$/,'').replace(/\s+/g,' ').trim();
}
const PARTY_LABEL_SETS={seller:new Set(SELLER_LABELS.map(partyLabelKey)),exporter:new Set(EXPORTER_LABELS.map(partyLabelKey)),buyer:new Set(BUYER_LABELS.map(partyLabelKey))};
function headerLabelRole(v){
  if(typeof v!=='string') return '';
  const k=partyLabelKey(v);
  if(!k||k.length>60) return '';
  if(PARTY_LABEL_SETS.seller.has(k)) return 'seller';
  if(PARTY_LABEL_SETS.exporter.has(k)) return 'exporter';
  if(PARTY_LABEL_SETS.buyer.has(k)) return 'buyer';
  if(/^NOTIFY\b/.test(k)) return 'notify';
  return HEADER_LABEL_RE.test(k)?'other':'';
}
// "TAX ID : 0656 3197 7906 1000", also on a line that starts with a phone number ("Tel : +622318886161  TAX ID : 0656 3197 7906 1000",
// "T E L : +84 274 3599 000 , TAX ID : 3700747000"). Only the number that follows the label is read: it may contain spaces, dots, dashes
// and slashes (NPWP is printed 65.631.977.9-061.000 or in groups of four) and must end where the text goes on with something else.
const TAX_LABEL=/(?:TAX\s*(?:ID|NO|NUMBER|REG(?:ISTRATION)?\.?\s*(?:NO|NUMBER)?|IDENTIFICATION\s*(?:NO|NUMBER))|TAXPAYER\s*(?:ID|NO)|NPWP(?:\s*(?:NO|NUMBER))?)/.source;
const TAX_INLINE_RE=new RegExp('\\b'+TAX_LABEL+'\\b\\.?\\s*(?:[:#]|-)?\\s*(?=([0-9][0-9 .\\-/]*[0-9]))\\1(?![A-Za-z0-9])','i');   // the lookahead takes the whole number at once, so it is never cut back to its first groups
const TAX_LABEL_ONLY_RE=new RegExp('^\\s*'+TAX_LABEL+'\\b\\.?\\s*[:#-]?\\s*$','i');
const taxIdDigits=v=>String(v??'').replace(/\D/g,'');
function taxIdFromCell(v){
  if(typeof v!=='string') return '';
  const m=v.replace(/\s+/g,' ').match(TAX_INLINE_RE);
  const d=m?taxIdDigits(m[1]):'';
  return d.length>=8?d:'';
}
// The label sits in one cell and the number in the next one to its right.
function taxIdFromValueCell(v){
  const s=(typeof v==='number'?String(v):String(v??'')).replace(/\s+/g,' ').trim();
  if(!/^[0-9][0-9 .\-/]*[0-9]$/.test(s)) return '';
  const d=taxIdDigits(s);
  return d.length>=8?d:'';
}
// TAX ID per party: each TAX ID line belongs to the closest party label above it in the same column (Seller, Shipper/Exporter,
// Consignee/Buyer). A line under any other label (Notify Party, a port ...) is ignored; one under no label at all is reported back.
function partyTaxIds(rows){
  const found={seller:'',exporter:'',buyer:''}, unattributed=[];
  rows.forEach((r,i)=>r.forEach((v,c)=>{
    let id=taxIdFromCell(v);
    if(!id && typeof v==='string' && TAX_LABEL_ONLY_RE.test(v.replace(/\s+/g,' '))){
      for(let j=c+1;j<r.length;j++){ if(norm(r[j])){ id=taxIdFromValueCell(r[j]); break; } }
    }
    if(!id) return;
    let role='';
    for(let k=i-1;k>=0&&i-k<=15&&!role;k--) role=headerLabelRole(rows[k]?.[c]);
    // a PDF has no merged cells: the text of one block does not share one x position, so the nearest party label above and to the left is used
    if(!role&&rows.isPdf) for(let k=i-1;k>=0&&i-k<=15&&!role;k--) for(let cc=c;cc>=0&&!role;cc--) role=headerLabelRole(rows[k]?.[cc]);
    if(role==='seller'||role==='exporter'||role==='buyer'){ if(!found[role]) found[role]=id; }
    else if(!role) unattributed.push(id);
  }));
  return {found,unattributed};
}
// CEISA stores an NPWP as 22 digits (the 16-digit NPWP followed by zeros), a CIPL prints 15 or 16 digits, often in groups.
// Two numbers are the same when one is the other plus trailing zeros; the 16-digit NPWP is also the legacy 15-digit one with a leading 0.
function sameUpToZeros(x,y){
  const [s,l]=x.length<=y.length?[x,y]:[y,x];
  return s.length>=8 && /[1-9]/.test(s) && l.startsWith(s) && /^0*$/.test(l.slice(s.length));
}
function taxIdForms(d){const f=[d]; if(d.length===15) f.push('0'+d); else if(d.length>=16&&d[0]==='0') f.push(d.slice(1)); return f;}
function taxIdEquivalent(a,b){
  const A=taxIdDigits(a), B=taxIdDigits(b);
  if(!A||!B) return false;
  return taxIdForms(A).some(x=>taxIdForms(B).some(y=>sameUpToZeros(x,y)));
}
// Total amount rule: SUM OF THE ITEM AMOUNTS is the primary value. The printed TOTAL row is only used when the
// items cannot be summed (none read, or some without an amount), and is kept as total_amount_printed for cross-checking.
function resolveTotalAmount(c){
  const r2=v=>Math.round(v*100)/100;
  const printed=(c.total_amount===null||c.total_amount===undefined)?null:r2(c.total_amount);
  const amts=c.items.map(x=>num(x.amount));
  if(c.items.length && amts.every(v=>v!==null)){
    const sum=r2(amts.reduce((a,v)=>a+v,0));
    c.total_amount=sum;
    c.total_amount_printed=printed;
    c.total_amount_source='SUM_ITEMS';
    if(printed!==null && Math.abs(printed-sum)>0.01)
      c.warnings.push(`Total CI tercetak (${printed}) berbeda dengan jumlah item (${sum}); dipakai jumlah item.`);
  }else{
    c.total_amount=printed;
    c.total_amount_source=printed!==null?'PRINTED_TOTAL':'';
    if(printed!==null && c.items.length) c.warnings.push('Sebagian item tanpa amount; total diambil dari baris TOTAL tercetak.');
  }
}
// Weight rule (same idea as the amount rule): the TOTAL is the SUM OF THE PER-ITEM weights. The printed TOTAL row is only a fallback, used when
// the items cannot be summed (some item has no weight, or the sum is not positive). When there is no printed total either, the weights that are
// known are summed and the result says so.
function resolveTotalWeights(c){
  for(const k of ['net','gross']){
    const T='total_'+k, P='total_'+k+'_printed';
    const printed=(c[T]===null||c[T]===undefined)?null:round3(c[T]);
    const vals=c.items.map(x=>num(x[k]));
    const known=vals.filter(v=>v!==null);
    const sum=(c.items.length&&known.length===vals.length)?round3(known.reduce((a,v)=>a+v,0)):null;
    c[P]=printed;
    if(sum!==null&&sum>0){ c[T]=sum; c[T+'_source']='SUM_ITEMS'; }
    else if(printed!==null){ c[T]=printed; c[T+'_source']='PRINTED_TOTAL'; }
    else if(known.length&&known.reduce((a,v)=>a+v,0)>0){
      c[T]=round3(known.reduce((a,v)=>a+v,0)); c[T+'_source']='PARTIAL_SUM';
      c.warnings.push(`Total ${k==='net'?'Net Weight':'Gross Weight'} dihitung dari ${known.length} dari ${vals.length} item yang punya berat; CIPL tidak mencetak total.`);
    }
    else { c[T]=null; c[T+'_source']=''; }
  }
}

// A packing list that prints only the totals: "Total Net Weight : 258.00 KGS", "N.W. | 258 | KGS", "NET WEIGHT" over "258 KGS".
// Read by label, and only for a weight that no table gave.
const WEIGHT_LABEL_RE={
  net:/^(?:TOTAL )?(?:NET WEIGHT|NETT WEIGHT|NET WT|NETT WT|N\.?W|NW|N\/W|NET|NETT)$/,
  gross:/^(?:TOTAL )?(?:GROSS WEIGHT|GROSS WT|G\.?W|GW|G\/W|GROSS)$/
};
const WEIGHT_UNIT_RE=/^(?:KGS?|KGM|G|GR|GRAMS?|T|TON|TONS|TONNES?|TNE|MT|LBS?)\.?$/;
function weightFromText(text,unitCell){
  const m=norm(text).match(/^([0-9][0-9.,]*)\s*(KGS?|KGM|G|GR|GRAMS?|T|TON|TONS|TONNES?|TNE|MT|LBS?)?\.?$/);
  if(!m) return null;
  const n=parseNumberText(m[1]); if(n===null||!Number.isFinite(n)||n<=0) return null;
  const unit=m[2]||(unitCell&&WEIGHT_UNIT_RE.test(norm(unitCell))?norm(unitCell):'');
  const f=weightFactor(unit);
  return {value:f===1?n:round3(n*f),converted:f!==1};
}
function readWeightSummary(grids){
  const out={net:null,gross:null,converted:false};
  for(const k of ['net','gross']) for(const g of grids){
    if(out[k]!==null) break;
    const hits=findLabelCells(g.rows,label=>WEIGHT_LABEL_RE[k].test(label.replace(/\s*[(\[][^)\]]*[)\]]\s*$/,'')));
    for(const pos of hits){
      let w=null;
      const inl=pos.inline?weightFromText(pos.inline):null; if(inl) w=inl;
      if(!w){                                   // the number in the next cell to the right, the unit (if any) in the cell after it
        const row=g.rows[pos.row]; let c=pos.col+1; while(c<row.length&&c<=pos.col+4&&isBlank(row[c])) c++;
        if(c<row.length&&c<=pos.col+4){ let u=c+1; while(u<row.length&&u<=c+2&&isBlank(row[u])) u++; w=weightFromText(cellString(row[c]),u<row.length?cellString(row[u]):''); }
      }
      if(!w){ const v=valueNear(g.rows,pos,{order:['below'],gap:1,accept:txt=>weightFromText(txt)!==null}); if(v) w=weightFromText(v.text); }
      if(w){ out[k]=w.value; if(w.converted) out.converted=true; break; }
    }
  }
  // both written in one line: "TOTAL  N.W. 120.00 KGS  G.W. 132.00 KGS" (the unit must follow the number)
  const IN_TEXT={
    net:/\b(?:NETT?\s*(?:WEIGHT|WT\.?)|N\.?\s?W\.?)\s*[:=]?\s*([0-9][0-9.,]*)\s*(KGS?|KGM|G|GRAMS?|T|TON|TONS|TONNES?|MT|LBS?)(?![A-Za-z0-9])/i,
    gross:/\b(?:GROSS\s*(?:WEIGHT|WT\.?)|G\.?\s?W\.?)\s*[:=]?\s*([0-9][0-9.,]*)\s*(KGS?|KGM|G|GRAMS?|T|TON|TONS|TONNES?|MT|LBS?)(?![A-Za-z0-9])/i
  };
  for(const k of ['net','gross']) if(out[k]===null) for(const g of grids){
    for(const row of g.rows){ for(const v of row){
      if(out[k]!==null||typeof v!=='string') continue;
      const m=v.replace(/\s+/g,' ').match(IN_TEXT[k]); if(!m) continue;
      const w=weightFromText(m[1]+' '+m[2]); if(w){ out[k]=w.value; if(w.converted) out.converted=true; }
    } if(out[k]!==null) break; }
    if(out[k]!==null) break;
  }
  return out;
}
/* ---- engine: e1_core.js ---- */
/* ====================================================================================================================
 * CIPL EXTRACTION ENGINE (Excel and PDF share one pipeline)
 *
 *   workbook / PDF  ->  grids (rows of cells)  ->  header fields (found by their LABEL)  +  item tables (found by the MEANING of their headers)
 *                   ->  CI items + PL weights  ->  totals, packages, currency, incoterm  ->  one `cipl` object
 *
 * Nothing here depends on a fixed cell address or on one exact layout. Whatever cannot be read is reported in `cipl.warnings`
 * (shown as INFO rows), never guessed silently.
 * ==================================================================================================================== */

/* ---------- cell and label basics ---------- */
const isBlank=v=>v===''||v===null||v===undefined||(typeof v==='string'&&!v.trim());
// Text of a cell as typed: whitespace collapsed; numbers written out in full (no exponent).
// One formatter for every number: Number.toLocaleString with options builds a new formatter on every call, and cellString runs for every
// cell many times over (it was most of the time spent reading a large CIPL).
const PLAIN_NUMBER=new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:10});
function cellString(v){
  if(typeof v==='number') return Number.isFinite(v)?(Number.isInteger(v)&&Math.abs(v)<1e21?String(v):Math.abs(v)<1e21?PLAIN_NUMBER.format(v):String(v)):'';
  if(typeof v==='boolean') return v?'TRUE':'FALSE';
  return String(v??'').replace(/\s+/g,' ').trim();
}
const firstLineOf=v=>String(v??'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).find(Boolean)||'';
// Canonical form of a label: "P/O No. & Date :" -> "PO NO AND DATE", "Vessel / Flight" -> "VESSEL/FLIGHT", "*PRICE TERM" -> "PRICE TERM".
// Memo of the pure text functions that run for every cell of every sheet many times over (labelCanon, colRoleOf, isKnownLabel).
// A sheet of a few hundred rows calls them tens of thousands of times with a few hundred distinct texts. Capped, so a session
// that reads many files does not grow without end.
function memo(fn,limit){
  const cache=new Map();
  const f=v=>{
    const k=typeof v==='string'?v:(v===null||v===undefined?'':typeof v+':'+String(v));
    if(cache.has(k)) return cache.get(k);
    const r=fn(v);
    if(cache.size>=(limit||40000)) cache.clear();
    cache.set(k,r);
    return r;
  };
  return f;
}
const labelCanon=memo(function(v){
  let s=norm(v).replace(/[：﹕]/g,':');
  if(!s) return '';
  // numbering in front of a label ("① Shipper/Exporter", "(8) No. & date of invoice", "3. Carrier") is not part of the label
  s=s.replace(ENUM_PREFIX_RE,'').replace(/^[\s*#※•·▪■□◆◇▶►❋]+/,'').replace(ENUM_PREFIX_RE,'').replace(/\s*:\s*$/,'');
  s=s.replace(/\bP\s*\/\s*O\b\.?/g,'PO').replace(/\bL\s*\/\s*C\b\.?/g,'LC').replace(/\bP\s*\/\s*L\b\.?/g,'PL').replace(/\bB\s*\/\s*L\b\.?/g,'BL');
  s=s.replace(/\b(INV|NO|NOS|REF|DOC)\s*\.\s*/g,'$1 ').replace(/\bNUMBER\b/g,'NO').replace(/\bNOS\b/g,'NO');
  s=s.replace(/\s*&\s*/g,' AND ').replace(/\s*\/\s*/g,'/').replace(/\s*\.\s*$/,'');
  return s.replace(/\s+/g,' ').trim();
});
// Header fields, each with the labels it can carry (canonical form, most specific first).
const FIELD_ALIASES={
  invoice:['INVOICE NO AND DATE','INVOICE NO/DATE','COMMERCIAL INVOICE NO AND DATE','INVOICE NO','COMMERCIAL INVOICE NO','INV NO AND DATE','INV NO','INVOICE #','INV #','INVOICE REFERENCE',
    'NO AND DATE OF INVOICE','NO AND DATE OF INV','NO AND DATE OF COMMERCIAL INVOICE','INVOICE NO AND DATE OF ISSUE'],
  invoiceDate:['INVOICE DATE','DATE OF INVOICE','DATE OF ISSUE','ISSUE DATE','INV DATE','DATE'],
  packing:['PACKING LIST NO AND DATE','PACKING LIST NO/DATE','PACKING LIST NO','PL NO AND DATE','PL NO/DATE','PL NO','PACKING NO'],
  po:['PO NO AND DATE','PO NO/DATE','PO NO','PURCHASE ORDER NO AND DATE','PURCHASE ORDER NO','PURCHASE ORDER','CUSTOMER PO NO','CUSTOMER PO','ORDER NO AND DATE','ORDER NO','YOUR ORDER NO','BUYER PO NO','NO AND DATE OF PO'],
  loading:['PORT OF LOADING','LOADING PORT','PORT OF SHIPMENT','PORT OF DEPARTURE','AIRPORT OF DEPARTURE','PLACE OF LOADING','PORT OF EXPORT','PORT OF EMBARKATION','PORT OF DISPATCH','PORT OF ORIGIN','SHIPPED FROM','POL','FROM',
    'PORT OF LOADING/AIRPORT OF DEPARTURE','AIRPORT OF LOADING','LOADING AIRPORT','PORT/AIRPORT OF LOADING'],
  discharge:['PORT OF DISCHARGE','DISCHARGE PORT','PORT OF DESTINATION','AIRPORT OF DESTINATION','AIRPORT OF ARRIVAL','PORT OF ARRIVAL','PLACE OF DISCHARGE','PORT OF UNLOADING','PLACE OF UNLOADING','PORT OF IMPORT','PORT OF ENTRY','SHIPPED TO','POD','TO',
    'PORT OF DISCHARGE/AIRPORT OF DESTINATION','DESTINATION PORT','DISCHARGING PORT','AIRPORT OF DISCHARGE','PORT/AIRPORT OF DISCHARGE'],
  final:['FINAL DESTINATION','FINAL DEST','PLACE OF DELIVERY','DESTINATION','FINAL PLACE OF DELIVERY'],
  vessel:['VESSEL/FLIGHT','VESSEL/FLIGHT NO','VESSEL/VOYAGE','VESSEL/VOYAGE NO','VESSEL NAME/VOYAGE','VESSEL AND VOYAGE','FLIGHT/VESSEL','VESSEL NAME','VESSEL','FLIGHT NO','FLIGHT','CARRIER/VESSEL','CARRIER','SHIPPED PER','SHIPPED BY',
    'NAME OF VESSEL','OCEAN VESSEL','VESSEL NAME/VOYAGE NO','VESSEL/VOY','VSL/VOY','FLIGHT NO AND DATE','FLIGHT/DATE','CARRIER NAME','VESSEL/FLIGHT NAME'],
  incoterm:['TERMS OF DELIVERY','TERMS OF DELIVERY AND PAYMENT','DELIVERY TERMS','DELIVERY TERM','INCOTERMS','INCOTERM','PRICE TERM','PRICE TERMS','TERMS OF PRICE','TERM OF PRICE','TRADE TERMS','TERMS OF SALE','TERMS',
    'PRICE CONDITION','PRICE CONDITIONS','PRICE BASIS','TRADE TERM','DELIVERY CONDITION','DELIVERY CONDITIONS','TERMS OF TRADE','INCOTERMS 2020','INCOTERMS 2010'],
  origin:['COUNTRY OF ORIGIN','COUNTRY OF ORIGIN OF GOODS','COUNTRY OF ORIGIN/MANUFACTURE','COUNTRY OF MANUFACTURE','COUNTRY OF PRODUCTION','ORIGIN OF GOODS','GOODS ORIGIN','ORIGIN COUNTRY','MANUFACTURED IN','MADE IN','ORIGIN'],
  // read for Shipment Schedule (schedule form, linked shipment); the checker itself does not compare them with the draft
  etd:['SAILING ON OR ABOUT','SAILING ON/ABOUT','SAILING DATE','DEPARTURE DATE','DEPATURE DATE','DATE OF DEPARTURE','ETD','ETD DATE','ON BOARD DATE','SHIPPED ON BOARD DATE','SHIPMENT DATE',
    'DATE OF SHIPMENT','SHIPPING DATE','FLIGHT DATE','ESTIMATED TIME OF DEPARTURE','EST DEPARTURE DATE'],
  mbl:['MAWB NO','MAWB','MASTER AWB NO','MASTER AWB','MASTER AIR WAYBILL NO','MBL NO','MBL','MASTER BL NO','MASTER BL','OCEAN BL NO','OBL NO'],
  hbl:['HAWB NO','HAWB','HOUSE AWB NO','HOUSE AWB','HOUSE AIR WAYBILL NO','HBL NO','HBL','HOUSE BL NO','HOUSE BL'],
  bl:['BL NO','AWB NO','AIR WAYBILL NO','AIRWAY BILL NO','BILL OF LADING NO','BL/AWB NO','AWB/BL NO'],
  volume:['VOLUME','LOAD TYPE','SHIPMENT TYPE','TYPE OF SHIPMENT','CONTAINER LOAD','SERVICE TYPE','TYPE OF LOAD']
};
// Labels that are neither fields nor party names but must never be mistaken for a value.
const OTHER_LABELS=['NOTIFY PARTY','NOTIFY','NOTIFY(IF OTHER THAN CONSIGNEE)','OTHER REFERENCES','OTHER REFERENCE','REMARKS','REMARK','NOTE','NOTES','SIGNED BY','ACCOUNT OF PAYMENT','BANK NAME','BRANCH','BANK ADDRESS','NAME','ACCOUNT NO','ADDRESS','SWIFT CODE','DEPARTURE DATE','SAILING ON OR ABOUT','ETD','ETA','TERMS OF PAYMENT','PAYMENT TERMS','TERM OF PAYMENT','PAYMENT','LC NO AND DATE','LC NO','DOCUMENT REFERENCE','REFERENCE','ATTN','TEL','FAX','E-MAIL','EMAIL','DATE','PACKING','MARKS AND NUMBERS','SHIPPING MARKS','SHIPPING MARK','CURRENCY','PAYMENT CURRENCY','CURRENCY CODE','FREIGHT','INSURANCE','CONTAINER NO','BL NO','AWB NO','HAWB NO','MEASUREMENT','TOTAL PACKAGES','NO OF PACKAGES','SALESPERSON','SALES REP','CUSTOMER NO','EXCHANGE RATE','ISSUED BY','CONTACT','PHONE','TELEPHONE','CONSIGNEE TAX ID','TAX ID','NPWP',
  'NO AND DATE OF LC','LC ISSUING BANK','ISSUING BANK','PLACE OF RECEIPT','SHIPPING INSTRUCTION','BOOKING NO','CONT AND SEAL','CONTAINER AND SEAL NO','SEAL NO'];
let KNOWN_LABELS=null;
function knownLabelSet(){
  if(KNOWN_LABELS) return KNOWN_LABELS;
  const s=new Set();
  Object.values(FIELD_ALIASES).forEach(a=>a.forEach(x=>s.add(labelCanon(x))));
  [SELLER_LABELS,EXPORTER_LABELS,BUYER_LABELS].forEach(a=>a.forEach(x=>s.add(labelCanon(x))));
  OTHER_LABELS.forEach(x=>s.add(labelCanon(x)));
  return (KNOWN_LABELS=s);
}
// A cell that is itself a label (so it can never be the value of another label): a field label, a party label, a table header, or a "xxx :" caption.
const isKnownLabelText=memo(function(text){
  if(!text||text.length>70) return false;
  const k=labelCanon(text);
  if(!k) return !!colRoleOf(text);
  if(knownLabelSet().has(k)) return true;
  if(HEADER_LABEL_RE.test(labelKey(text).replace(ENUM_PREFIX_RE,'').replace(/\s*:\s*$/,''))) return true;
  if(colRoleOf(text)) return true;
  return /:\s*$/.test(text)&&text.length<=40;
});
function isKnownLabel(v){return isKnownLabelText(cellString(v));}

/* ---------- grids ---------- */
// A grid is {kind, name, rows: values[r][c], fmts: number formats[r][c], merges:[{r0,c0,r1,c1}]}. Excel sheets and PDF pages both become grids.
function excelGrid(wb,name){
  const ws=wb.Sheets[name];
  const grid={kind:'xlsx',name,rows:[],fmts:[],merges:[],hiddenRows:[]};
  if(!ws||!ws['!ref']) return grid;
  const rg=XLSX.utils.decode_range(ws['!ref']);
  // a sheet whose used range runs to the end of the worksheet (a stray cell far down) is read only as far as it can hold a document
  const MAXR=4000, MAXC=150;
  if(rg.e.r-rg.s.r+1>MAXR) rg.e.r=rg.s.r+MAXR-1;
  if(rg.e.c-rg.s.c+1>MAXC) rg.e.c=rg.s.c+MAXC-1;
  // Hidden ROWS are not read (see readTableBody). Hidden COLUMNS are: a column hidden for printing (the Brand of an import CIPL) still holds data of the document.
  for(let r=rg.s.r;r<=rg.e.r;r++){
    const row=[],fm=[];
    for(let c=rg.s.c;c<=rg.e.c;c++){
      const cell=ws[XLSX.utils.encode_cell({r,c})];
      const ok=cell&&cell.t!=='e'&&cell.t!=='z'&&cell.v!==undefined&&cell.v!==null;
      row.push(ok?cell.v:''); fm.push(ok&&cell.z&&cell.z!=='General'?String(cell.z):'');
    }
    grid.rows.push(row); grid.fmts.push(fm);
    if(ws['!rows']&&ws['!rows'][r]&&ws['!rows'][r].hidden) grid.hiddenRows[r-rg.s.r]=true;
  }
  grid.merges=(ws['!merges']||[]).map(m=>({r0:m.s.r-rg.s.r,c0:m.s.c-rg.s.c,r1:m.e.r-rg.s.r,c1:m.e.c-rg.s.c}));
  return grid;
}
// Rows r0..r1-1 of a grid as a grid of its own (a sheet that carries both the invoice and the packing list is split at the titles).
function sliceGrid(g,r0,r1){
  const merges=g.merges.filter(m=>m.r1>=r0&&m.r0<r1).map(m=>({r0:Math.max(m.r0,r0)-r0,c0:m.c0,r1:Math.min(m.r1,r1-1)-r0,c1:m.c1}));
  return Object.assign({},g,{rows:g.rows.slice(r0,r1),fmts:(g.fmts||[]).slice(r0,r1),merges,hiddenRows:(g.hiddenRows||[]).slice(r0,r1)});
}
// Last column of the merged range that starts at (r,c) in the grid; c itself when the cell is not merged horizontally.
function mergeEndCol(g,r,c){
  for(const m of g.merges||[]) if(m.r0<=r&&r<=m.r1&&m.c0<=c&&c<=m.c1) return m.c1;
  return c;
}

/* ---------- finding labels and the values that belong to them ---------- */
// Every label-like text of a grid, indexed once: the canonical form of each whole cell, and of the "label :" part of a cell that carries
// its value. findLabelCells then looks at the distinct texts instead of every cell, once per alias.
const LABEL_INDEX=new WeakMap();
function labelIndex(rows){
  let ix=LABEL_INDEX.get(rows); if(ix) return ix;
  const whole=new Map(), inl=new Map();
  const add=(m,k,p)=>{ if(!m.has(k)) m.set(k,[]); m.get(k).push(p); };
  for(let r=0;r<rows.length;r++){
    const row=rows[r];
    for(let c=0;c<row.length;c++){
      const v=row[c];
      if(typeof v!=='string'||!v.trim()) continue;
      const s=v.replace(/\s+/g,' ').trim();
      if(s.length<=80){ const k=labelCanon(s); if(k) add(whole,k,{row:r,col:c,text:s,inline:''}); }
      const m=s.match(/^([^:：]{2,45}?)\s*[:：]\s*(\S.*)$/);
      if(m){ const k=labelCanon(m[1]); if(k) add(inl,k,{row:r,col:c,text:s,inline:m[2].trim()}); }
    }
  }
  ix={whole,inl}; LABEL_INDEX.set(rows,ix); return ix;
}
// Cells holding a label: the whole cell is the label ("Invoice No. & Date"), or the cell starts with "label :" and carries the value
// itself ("P/O No. : DDI-20260916-02", `inline`). Whole-cell labels come first; both in reading order.
function findLabelCells(rows,match){
  const ix=labelIndex(rows), whole=[], inl=[];
  for(const [k,list] of ix.whole) if(match(k)) list.forEach(p=>whole.push(Object.assign({},p)));
  const seen=new Set(whole.map(p=>p.row+':'+p.col));
  for(const [k,list] of ix.inl) if(match(k)) list.forEach(p=>{ if(!seen.has(p.row+':'+p.col)) inl.push(Object.assign({},p)); });
  const ord=(a,b)=>a.row-b.row||a.col-b.col;
  return whole.sort(ord).concat(inl.sort(ord));
}
// The value of a label: written after it in the same cell (inline), in the next cell to the right, or below it in the same column
// (skipping up to `gap` blank rows). A label that ends with a colon looks right first. A cell that is itself a label is never a value.
// A list of "label | value" rows: this label has a value to its right, and the cell below it is the next label (itself followed by its value),
// not a value that belongs to this label.
function stackedList(rows,pos,maxRight){
  const row=rows[pos.row]; let R=null;
  for(let c=pos.col+1;c<row.length&&c<=pos.col+maxRight;c++) if(!isBlank(row[c])){R=row[c];break;}
  if(R===null||isKnownLabel(cellString(R))) return false;
  for(let r=pos.row+1;r<rows.length&&r<=pos.row+2;r++){
    const v=rows[r][pos.col]; if(isBlank(v)) continue;
    if(typeof v!=='string') return false;
    for(let c=pos.col+1;c<rows[r].length&&c<=pos.col+3;c++) if(!isBlank(rows[r][c])) return true;
    return false;
  }
  return false;
}
function valueNear(rows,pos,{order,gap=2,maxRight=6,accept=null,firstLine=false}={}){
  order=order||(/:\s*$/.test(pos.text)||(!pos.inline&&stackedList(rows,pos,maxRight))?['inline','right','below']:['inline','below','right']);
  for(const how of order){
    let raw=null;
    if(how==='inline'){ if(pos.inline) raw=pos.inline; }
    else if(how==='below'){
      const L=rows.geo&&rows.geo[pos.row]&&rows.geo[pos.row][pos.col];
      for(let r=pos.row+1;r<rows.length&&r<=pos.row+1+gap;r++){
        if(L){
          // a PDF: the value under a label may be centred or right-aligned, so it is found by the x range of its text, not by its column
          let best=null;
          rows[r].forEach((v,c)=>{
            if(isBlank(v)) return; const G=rows.geo[r]&&rows.geo[r][c]; if(!G) return;
            const ov=Math.min(L.x1,G.x1)-Math.max(L.x0,G.x0), wd=Math.max(L.x1-L.x0,G.x1-G.x0);
            if(ov>0||Math.abs((L.x0+L.x1)/2-(G.x0+G.x1)/2)<=wd*0.6){ const sc=ov-Math.abs(G.x0-L.x0)*0.001; if(!best||sc>best.sc) best={sc,v}; }
          });
          if(best){raw=best.v;break;}
        }else{ const v=rows[r][pos.col]; if(!isBlank(v)){raw=v;break;} }
      }
    }else{
      const row=rows[pos.row];
      for(let c=pos.col+1;c<row.length&&c<=pos.col+maxRight;c++){ if(!isBlank(row[c])){raw=row[c];break;} }
    }
    if(raw===null) continue;
    const text=firstLine&&typeof raw==='string'?firstLineOf(raw):cellString(raw);
    if(!text||isKnownLabel(text)) continue;
    const il=typeof raw==='string'&&text.match(/^([^:：]{1,40}?)\s*[:：]\s*\S/);       // "Date : September 16, 2026" is a field of its own, not the value of the label next to it
    if(il&&how!=='inline'&&isKnownLabel(il[1])&&!(accept&&accept(text))) continue;
    if(accept&&!accept(text)) continue;
    return {text,how,raw};
  }
  return null;
}
// First label of `aliases` (in the order given) that has a value; the value read as above.
function readByAliases(rows,aliases,opts){
  for(const a of aliases){
    for(const pos of findLabelCells(rows,x=>x===a)){
      const v=valueNear(rows,pos,opts); if(v) return Object.assign(v,{pos,alias:a});
    }
  }
  return null;
}
const partyKey=memo(partyLabelKey);
// A party block (Seller, Shipper, Consignee ...): its name is the first line under the label. `labels` is one of SELLER_LABELS ... (see partyTaxIds).
// One pass over the cells finds every label of the list; the labels are then tried in the order of the list (most specific first).
function readParty(rows,labels){
  const order=new Map(); labels.forEach((x,i)=>{const k=partyLabelKey(x); if(!order.has(k)) order.set(k,i);});
  const hits=labels.map(()=>[]), inline=labels.map(()=>null);
  rows.forEach((row,r)=>row.forEach((v,c)=>{
    if(typeof v!=='string'||!v.trim()) return;
    const k=partyKey(v);
    if(order.has(k)){ hits[order.get(k)].push({row:r,col:c,text:v.replace(/\s+/g,' ').trim(),inline:''}); return; }
    // "Consignee: PT ABC" written in one cell
    const m=v.replace(/\s+/g,' ').trim().match(/^([^:：]{2,40}?)\s*[:：]\s*(\S.*)$/);
    if(m){ const j=order.get(partyKey(m[1])); if(j!==undefined&&inline[j]===null&&!isKnownLabel(m[2])) inline[j]=m[2].trim(); }
  }));
  for(let i=0;i<labels.length;i++) for(const pos of hits[i]){
    const v=valueNear(rows,pos,{order:['below','right'],gap:2,firstLine:true});
    if(v) return v.text;
  }
  for(const x of inline) if(x) return x;
  return '';
}
const REF_NUMBER=txt=>/\d/.test(txt)&&txt.length<=70&&!isKnownLabel(txt);
const DATE_TAIL=/^(.*\S)[\s,;|/]+(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2}(?:st|nd|rd|th)? [A-Za-z]{3,9}\.?,? \d{4}|\d{1,2}[-/][A-Za-z]{3,9}[-/]\d{2,4})$/;
// "Invoice No. & Date": the number under the label (or in the label's cell) and its date to the right, or at the end of the same text.
function readRefAt(rows,pos){
  const trimSep=s=>String(s).replace(/[\s,;|/]+$/,'');
  const take=(text,rest)=>{
    let no=text,date='';
    const m=DATE_TAIL.exec(text);
    if(m&&isDateValue(m[2])&&REF_NUMBER(trimSep(m[1]))){no=trimSep(m[1]);date=normalizeDate(m[2]);}
    if(!date) for(const v of rest){ if(isDateValue(v)){date=normalizeDate(v);break;} }
    return {no,date};
  };
  if(pos.inline&&REF_NUMBER(pos.inline)){
    const row=rows[pos.row]; const rest=row.slice(pos.col+1,pos.col+9).filter(v=>!isBlank(v));
    return take(pos.inline,rest);
  }
  const below=()=>{
    for(let gap=1;gap<=2;gap++){
      const r=pos.row+gap; if(r>=rows.length) break;
      const cells=rows[r].slice(pos.col,pos.col+10).filter(v=>!isBlank(v));
      if(!cells.length) continue;
      const text=cellString(cells[0]);
      if(isKnownLabel(text)||isDateValue(cells[0])) break;
      if(gap===2&&!/\d/.test(text)) break;
      if(!REF_NUMBER(text)) break;
      return take(text,cells.slice(1));
    }
    return null;
  };
  // the label and its value in neighbouring cells of one row ("Invoice No. | DD-DI26092801 | Date | 2026-09-28")
  const right=()=>{
    const cells=rows[pos.row].slice(pos.col+1,pos.col+10).filter(v=>!isBlank(v));
    if(!cells.length) return null;
    const text=cellString(cells[0]);
    if(isKnownLabel(text)||isDateValue(cells[0])||!REF_NUMBER(text)) return null;
    return take(text,cells.slice(1));
  };
  return (/:\s*$/.test(pos.text)?(right()||below()):(below()||right()));
}
function readRef(rows,aliases){
  for(const a of aliases) for(const pos of findLabelCells(rows,x=>x===a)){ const v=readRefAt(rows,pos); if(v&&norm(v.no)) return v; }
  return null;
}
// A date under a label of its own ("Invoice Date").
function readDateByAliases(rows,aliases){
  for(const a of aliases) for(const pos of findLabelCells(rows,x=>x===a)){
    const v=valueNear(rows,pos,{accept:txt=>isDateValue(txt)||isDateValue(normalizeDate(txt))});
    if(v) return normalizeDate(v.text);
    for(const how of ['below','right']){
      const w=how==='below'?rows[pos.row+1]?.[pos.col]:rows[pos.row]?.[pos.col+1];
      if(isDateValue(w)) return normalizeDate(w);
    }
  }
  return '';
}
// The PO block under "P/O No. & Date": one or more lines, each "number [date]", or "P/O No. : number" followed by "Date : ...".
// A label that carries its value on the same line ("P/O No. :  DDI-20261008-410") is read to the right; a label alone heads the lines below.
function readPoBlock(rows,aliases){
  const PO_LINE=/^P\/?O\.?\s*(?:NO\.?|NUMBER)?\s*[:：]\s*(\S.*)?$/i, DATE_LINE=/^(?:(?:P\/?O|ORDER|INVOICE)\.?\s+)?DATE\s*[:：]?\s*(\S.*)?$/i;
  for(const a of aliases) for(const pos of findLabelCells(rows,x=>x===a)){
    const out=[];
    const addNo=(no,rest)=>{ let date=''; for(const v of rest){ if(isDateValue(v)){date=normalizeDate(v);break;} } out.push({no:String(no).trim(),date}); };
    const addDate=v=>{ const last=out[out.length-1]; if(last&&!last.date) last.date=normalizeDate(v); };
    const addText=(text,rest)=>{ const mm=DATE_TAIL.exec(text), n1=mm?mm[1].replace(/[\s,;|/]+$/,''):''; if(mm&&isDateValue(mm[2])&&REF_NUMBER(n1)) out.push({no:n1,date:normalizeDate(mm[2])}); else if(REF_NUMBER(text)) addNo(text,rest); };
    if(pos.inline) addText(pos.inline,rows[pos.row].slice(pos.col+1,pos.col+9));
    else if(/:\s*$/.test(pos.text)){
      const right=valueNear(rows,pos,{order:['right'],maxRight:4});
      if(right&&REF_NUMBER(right.text)) addText(right.text,rows[pos.row].slice(pos.col+1,pos.col+9).filter(v=>!isBlank(v)).slice(1));
    }
    if(out.length&&!pos.inline&&!/:\s*$/.test(pos.text)) out.length=0;
    let blanks=0;
    for(let r=pos.row+1;r<rows.length&&r<=pos.row+14;r++){
      const cells=rows[r].slice(pos.col,pos.col+10).filter(v=>!isBlank(v));
      if(!cells.length){
        if(out.length){                                    // a blank row between the PO number and its "Date : ..." line does not end the block
          let nxt=null; for(let q=r+1;q<=r+2&&q<rows.length;q++){ const cc=rows[q].slice(pos.col,pos.col+10).filter(v=>!isBlank(v)); if(cc.length){nxt=cc;break;} }
          const last=out[out.length-1];
          if(nxt&&last&&!last.date&&(isDateValue(nxt[0])||DATE_LINE.test(cellString(nxt[0])))) continue;
          break;
        }
        if(++blanks>1) break; continue;
      }
      const raw=cells[0], txt=cellString(raw);
      let m;
      if((m=txt.match(PO_LINE))){
        if(m[1]) addText(m[1],cells.slice(1));
        else if(cells[1]!==undefined&&REF_NUMBER(cellString(cells[1]))) addText(cellString(cells[1]),cells.slice(2));
        continue;
      }
      if((m=txt.match(DATE_LINE))&&(m[1]||cells[1]!==undefined)){
        const dv=m[1]||cells[1];
        if(isDateValue(dv)){ addDate(dv); continue; }
      }
      if(isDateValue(raw)){ addDate(raw); continue; }
      if(isKnownLabel(txt)||!/\d/.test(txt)||/^[^:：]{1,40}[:：]\s*\S/.test(txt)) break;
      addText(txt,cells.slice(1));
    }
    if(!out.length&&!pos.inline){                         // the number written to the right of the label instead of below it
      const right=valueNear(rows,pos,{order:['right'],maxRight:8});
      if(right&&REF_NUMBER(right.text)) addText(right.text,rows[pos.row].slice(pos.col+1,pos.col+10).filter(v=>!isBlank(v)).slice(1));
    }
    if(out.length) return out;
  }
  return [];
}

/* ---------- table columns: the meaning of a header ---------- */
// Header text without a trailing "(USD)" / "(KG)" / ":" and with uniform spacing.
function headerKeyOf(v){
  if(typeof v!=='string') return '';
  let s=norm(v).replace(/[’‘`´]/g,"'");
  if(!s||s.length>60) return '';
  s=s.replace(ENUM_PREFIX_RE,'');                                   // "⑭ Quantity" (the Korean standard form numbers its headings)
  s=s.replace(/[：:]+\s*$/,'').replace(/\s*[(\[][^)\]]*[)\]]\s*$/,'').replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ').trim();
  return s.replace(/\.+$/,'');
}
const COL_RULES=[
  ['no',    /^(?:NO|NOS|NO\.|#|NUM|NUMBER|ITEM NO|ITEM NO\.|ITEM NUMBER|ITEM #|LINE|LINE NO|LINE ITEM|S\/N|SL NO|SL\. NO|SR NO|SR\. NO|SERIAL|SERIAL NO|SEQ|SEQ NO|NOMOR|NO URUT|NO\. URUT)$/],
  ['hs',    /^(?:HS|HS CODE|HS-CODE|HS NO|HS NO\.|H\.S\.? ?CODE|HSN|HSN CODE|HTS|HTS CODE|HTS NO|TARIFF|TARIFF CODE|TARIFF NO|CUSTOMS TARIFF|POS TARIF|HS\/TARIFF|HS CODE\/TARIFF|[A-Z ]{0,20}HS[ .-]?CODE)$/],
  ['net',   /^(?:TOTAL )?(?:NET WEIGHT|NET WT\.?|NETT WEIGHT|NETT WT\.?|NET|NETT|N\.? ?W\.?|N\/W|NETTO|BERAT BERSIH|NET KGS?|NW KGS?)$/],
  ['gross', /^(?:TOTAL )?(?:GROSS WEIGHT|GROSS WT\.?|GROSS|G\.? ?W\.?|G\/W|BRUTO|BERAT KOTOR|GROSS KGS?|GW KGS?)$/],
  ['qty',   /^(?:(?:SHIPPED|INVOICED?|DELIVERED|SHIPPING) )?(?:QTY|Q'TY|Q\.TY|QUANTITY|QUANTITIES|QUAN|QNTY|QNTTY|PCS|PIECES|JUMLAH|JML|KUANTITAS|QTY\/PCS|QTY\/UNIT)$/],
  ['unit',  /^(?:UNIT|UNITS|UOM|U\/M|SALES UNIT|SELLING UNIT|UNIT OF MEASURE|UNIT OF MEASUREMENT|UNIT OF QUANTITY|UNIT OF QTY|QTY UNIT|SATUAN|UNIT TYPE|UNIT\/QTY)$/],
  ['price', /^(?:UNIT PRICE|PRICE|PRICE\/UNIT|PRICE PER UNIT|UNIT RATE|RATE|U\/P|UNIT COST|PRICE EACH|HARGA SATUAN|HARGA|UNIT VALUE)$/],
  ['amount',/^(?:AMOUNT|AMT|TOTAL AMOUNT|TOTAL AMT|TOTAL PRICE|TOTAL VALUE|VALUE|LINE TOTAL|LINE AMOUNT|EXTENDED PRICE|EXTENDED AMOUNT|EXTENDED VALUE|EXT\.? PRICE|EXT\.? AMOUNT|EXT\.? AMT|EXTENSION|NET AMOUNT|TOTAL|SUBTOTAL|SUB TOTAL|SUB-TOTAL|JUMLAH HARGA|TOTAL HARGA|NILAI|AMOUNT IN [A-Z]{3}|AMOUNT [A-Z]{3})$/],
  ['brand', /^(?:BRAND|BRAND NAME|MAKER|MAKE|MANUFACTURER|MFR|MERK|MEREK)$/],
  ['origin',/^(?:ORIGIN|COUNTRY OF ORIGIN|COO|C\/O|ORIGIN COUNTRY|MADE IN|NEGARA ASAL)$/],
  ['mark',  /^(?:MARKS?(?: ?(?:&|AND) ?NOS?\.?(?: OF PKGS?\.?)?)?|MARKS & NO\. PKGS|MARKS AND NUMBERS|MARKS & NUMBERS|SHIPPING MARKS?|C\/NO|CTN NO|CTN NO\.|CARTON NO|CARTON NO\.|CARTON|CASE NO|CASE NO\.|BOX NO|BOX NO\.|PKG NO|PACKAGE NO|PALLET NO|PLT NO|PKGS|PACKAGES|NO\. OF PKGS|NO OF PKGS|NUMBER OF PACKAGES|PACKING NO|CRATE NO|MARKS? ?(?:&|AND) ?(?:NUMBERS?|NOS?\.?) ?(?:OF ?)?(?:PKGS?|PACKAGES?)\.?|SHIPPING MARKS? ?(?:&|AND) ?(?:NOS?\.?|NUMBERS?))$/],
  // dimensions of a package ("50*42*14") or its volume in CBM: read for Shipment Schedule (CBM of an export), never compared with the draft
  ['dim',   /^(?:DIMENSIONS?|DIMS?|MEASUREMENTS?|MEAS|CBM|M3|VOLUME|CARTON SIZE|CASE SIZE|BOX SIZE|PACKAGE SIZE|PACKING SIZE|PKG SIZE|CARTON DIMENSION|PACKAGE DIMENSION)$/],
  ['code',  /^(?:ITEM CODE|PRODUCT CODE|MATERIAL CODE|MATERIAL NO|MATERIAL NO\.|PART NO|PART NO\.|PART NUMBER|PARTS NO|ARTICLE NO|ARTICLE NO\.|ARTICLE CODE|SKU|CODE|REF|REF NO|REF\. NO|REFERENCE)$/],
  ['desc',  /^(?:(?:GOODS )?DESCRIPTIONS?(?: OF GOODS)?|DESCRIPTION OF (?:THE )?GOODS|DESCRIPTION & SPECIFICATION|DESCRIPTION AND SPECIFICATION|GOODS|COMMODITY|PRODUCT DESCRIPTION|ITEM DESCRIPTION|URAIAN|URAIAN BARANG|NAMA BARANG|DESC\.?|MATERIAL DESCRIPTION|DESCRIPTION OF GOODS AND\/OR SERVICES)$/],
  ['type',  /^(?:TYPE|MODEL|MODEL NO|MODEL NO\.|MODEL NAME|TYPE\/SPEC|SPEC\/MODEL|SPECIFICATION\/MODEL|SPECIFICATION|SPEC|SPEC\.|SIZE)$/],
  ['item',  /^(?:ITEM|ITEMS|ITEM NAME|PRODUCT|PRODUCT NAME|ARTICLE|ARTICLE NAME|NAME|MATERIAL|PART NAME|GOODS NAME|NAME OF GOODS)$/]
];
// Headers worded in a way the exact list does not know: judged by their key words ("DESCRIPTION OF GOODS / ITEM", "COMMODITY DESCRIPTION", "UNIT PRICE FOB").
const LOOSE_COL_RULES=[
  ['desc',  k=>/\b(?:DESCRIPTIONS?|COMMODITY|MERCHANDISE)\b/.test(k)&&!/[:：]/.test(k)&&k.split(' ').length<=7&&!/\b(?:WEIGHT|WT|QTY|QUANTITY|PRICE|AMOUNT|VALUE|HS|ORIGIN|TOTAL|DATE|PO|INVOICE)\b/.test(k)],
  ['price', k=>/^UNIT PRICE\b/.test(k)&&k.split(' ').length<=5],
  ['amount',k=>/^(?:TOTAL |EXTENDED |LINE )?AMOUNT\b/.test(k)&&k.split(' ').length<=4]
];
// Korean and Chinese headings, alone or under the English one ("QUANTITY\n수량", "Description of goods 품명").
const CJK_TEST=/[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/;
const CJK_RUN=/[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]+/g;
const CJK_ROLE=[
  ['desc',/^(?:품명|품목|물품명|상품명|제품명|품명및규격|品名|货物名称|货物描述|商品名称|商品描述|描述|名称)$/],
  ['type',/^(?:규격|모델|型号|规格|规格型号)$/],
  ['qty',/^(?:수량|数量)$/], ['unit',/^(?:단위|单位)$/], ['price',/^(?:단가|单价)$/],
  ['amount',/^(?:금액|金额|总价|总金额|合计金额)$/], ['net',/^(?:순중량|净重)$/], ['gross',/^(?:총중량|毛重)$/],
  ['hs',/^(?:HS부호|세번|세번부호|海关编码|HS编码|税则号|商品编码)$/], ['origin',/^(?:원산지|原产地|产地)$/],
  ['no',/^(?:번호|순번|序号)$/], ['mark',/^(?:화인|箱号|唛头|麦头)$/]
];
function roleOfKey(k){
  for(const [role,re] of COL_RULES) if(re.test(k)) return role;
  for(const [role,fn] of LOOSE_COL_RULES) if(fn(k)) return role;
  return '';
}
const colRoleOf=memo(function(v){
  const k=headerKeyOf(v); if(!k) return '';
  const r=roleOfKey(k); if(r) return r;
  if(!CJK_TEST.test(k)) return '';
  const latin=k.replace(CJK_RUN,' ').replace(/\s*[(\[][^)\]]*[)\]]\s*$/,'').replace(/\s+/g,' ').trim().replace(/[.:]+$/,'');
  if(latin){ const rl=roleOfKey(latin); if(rl) return rl; if(/[A-Z]{2}/.test(latin)) return ''; }
  const cjk=(k.match(CJK_RUN)||[]).join('').replace(/\s+/g,'');
  for(const [role,re] of CJK_ROLE) if(re.test(cjk)||re.test(k.replace(/[\s()（）]/g,''))) return role;
  return '';
});
/* ---- engine: e2a_headers.js ---- */
/* ---------- finding the item tables of a grid ---------- */
const NUM_ROLES=new Set(['qty','price','amount','net','gross']);
const DESCR_ROLES=new Set(['desc','item','type','code','mark','hs','brand','no']);
const LOOSE_ROLES=new Set(['unit','code','origin']);          // may repeat inside one table (a unit next to every quantity, weight and price)
// The header cells of one row, each with the columns it covers (a merged header covers its whole merge).
// headerCellsOf and findTables run again and again on the same grid (tables, packages, currency, totals ...): both are remembered per grid.
// The header cells are handed out as copies, because layoutHeads writes the column spans into them.
const HEADER_CELLS_CACHE=new WeakMap(), TABLES_CACHE=new WeakMap();
function headerCellsOf(g,r){
  let m=HEADER_CELLS_CACHE.get(g); if(!m){ m=new Map(); HEADER_CELLS_CACHE.set(g,m); }
  if(!m.has(r)) m.set(r,headerCellsOfRow(g,r));
  return m.get(r).map(h=>Object.assign({},h));
}
function headerCellsOfRow(g,r){
  const out=[], row=g.rows[r]||[];
  for(let c=0;c<row.length;c++){
    const v=row[c]; if(typeof v!=='string') continue;
    const role=colRoleOf(v); if(!role) continue;
    const hu=v.match(/[(\[]\s*([A-Za-z./]{1,7})\s*[)\]]\s*$/);
    out.push({r,c0:c,c1:mergeEndCol(g,r,c),role,text:cellString(v),hunit:hu?hu[1].toUpperCase():''});
  }
  return out;
}
// Every non-empty cell of a row (recognised header or not) with the columns it covers: an unrecognised heading ("Pattern", "Mold No.")
// still owns its column, so it ends the span of the header before it.
function rowCellRanges(g,r){
  const out=[], row=g.rows[r]||[];
  for(let c=0;c<row.length;c++) if(!isBlank(row[c])) out.push({c0:c,c1:mergeEndCol(g,r,c)});
  return out;
}
// A header row can hold the headers of two tables side by side (the main table and a price list or a per-carton table to its right).
// Headers are first grouped in blocks of cells with no empty column between them. Blocks one column apart or less belong to the same table
// unless a role comes round again; blocks further apart are separate tables. Inside a block a role that comes round again starts a new table.
function splitSegments(heads,ranges,opts){
  // gaps=false: the columns of a PDF grid are x positions, so an empty column between two headers says nothing about the table
  const gaps=!(opts&&opts.gaps===false);
  const rs=ranges.slice().sort((a,b)=>a.c0-b.c0), blocks=[]; let end=-9;
  for(const x of rs){
    if(!blocks.length||(gaps&&x.c0>end+1)) blocks.push({c0:x.c0,c1:x.c1,heads:[]});
    end=Math.max(end,x.c1); blocks[blocks.length-1].c1=end;
  }
  for(const h of heads){ const b=blocks.find(b=>h.c0>=b.c0&&h.c0<=b.c1); if(b) b.heads.push(h); }
  const segs=[]; let seg=null, prev=null;
  for(const b of blocks){
    if(!b.heads.length){continue;}
    const roles=b.heads.filter(h=>!LOOSE_ROLES.has(h.role)).map(h=>h.role);
    const clash=seg&&roles.some(r=>seg.roles.has(r));
    const far=prev&&b.c0-prev.c1-1>=2;
    const newTable=seg&&seg.heads.length&&b.heads[0].role==='no';                // "No." is the first column of a table: a block that starts with it, after a gap, is another table
    const needMore=seg&&!segmentKind(seg.roles);                                   // a table that is not complete yet takes the next block even across a wide gap (spacer columns)
    if(!seg||clash||(far&&!needMore)||newTable){seg={heads:[],roles:new Set()};segs.push(seg);}
    for(const h of b.heads){
      if(seg.roles.has(h.role)){
        if(LOOSE_ROLES.has(h.role)) continue;
        seg={heads:[],roles:new Set()}; segs.push(seg);
      }
      seg.heads.push(h); seg.roles.add(h.role);
    }
    prev=b;
  }
  return segs;
}
// What a set of header roles can be: an invoice table (quantity and money), a packing table (weights), or one table that is both.
function segmentKind(roles){
  const R=roles;
  const quant=[...R].some(x=>NUM_ROLES.has(x)), descr=[...R].some(x=>DESCR_ROLES.has(x));
  if(R.size<3||!quant||!descr) return '';
  const ci=(R.has('amount')||R.has('price'))&&(R.has('qty')||R.has('amount'));
  const pl=R.has('net')||R.has('gross');
  return ci&&pl?'BOTH':ci?'CI':pl?'PL':'';
}
// Column span of every header: from its own first column to the column before the next cell of the header row (the last header keeps the
// columns of its own merge, plus one more for a money or weight column whose number sits right of the unit cell). A money or weight header is
// never given more than two columns past its own merge. Notes or scratch numbers typed further to the right belong to no header and are
// never read.
function layoutHeads(g,heads,rows){
  const rr=rows||[...new Set(heads.map(h=>h.r))];
  const ranges=[].concat(...rr.map(r=>rowCellRanges(g,r))).sort((a,b)=>a.c0-b.c0);
  const width=Math.max(0,...g.rows.map(r=>r.length));
  const hs=heads.slice().sort((a,b)=>a.c0-b.c0);
  hs.forEach(h=>{
    const nx=ranges.find(x=>x.c0>h.c1);
    let end=nx?nx.c0-1:Math.min(width-1,h.c1+(NUM_ROLES.has(h.role)?1:0));
    if(NUM_ROLES.has(h.role)) end=Math.min(end,h.c1+2);
    h.s0=h.c0; h.s1=Math.max(end,h.c1);
  });
  return hs;
}
const roleOf=(T,role)=>T.heads.find(h=>h.role===role);
// The columns a table occupies, and whether two tables share columns (stacked) or not (side by side).
const tableCols=T=>[Math.min(...T.heads.map(h=>h.s0)),Math.max(...T.heads.map(h=>h.s1))];
const sharesColumns=(A,B)=>{const a=tableCols(A),b=tableCols(B); return a[0]<=b[1]&&b[0]<=a[1];};
// A group header over weight sub-headers: "Weight", "Weight (KGS)", "N.W./G.W." in the header row, "Net | Gross" in the row below it.
const GROUP_HEAD_RE=/^(?:TOTAL )?(?:WEIGHTS?|WT|NET\/GROSS|N\.?W\.?\/G\.?W\.?|N\.?W\.? ?(?:&|AND) ?G\.?W\.?)$/;
function groupHeaderOf(g,r,h){
  const row=g.rows[r]||[];
  for(let c=0;c<row.length;c++){
    const v=row[c]; if(typeof v!=='string'||!GROUP_HEAD_RE.test(headerKeyOf(v))) continue;
    const c1=mergeEndCol(g,r,c); if(h.c0>=c&&h.c0<=c1+2) return {text:v,c0:c,c1};
  }
  return null;
}
const subHeaderBelow=(g,r,best)=>r+1<g.rows.length&&headerCellsOf(g,r+1).some(h=>(h.role==='net'||h.role==='gross')&&!best.roles.has(h.role)&&groupHeaderOf(g,r,h));
// All tables of a grid: [{kind, hr, heads, roles, g}] in reading order. A header spread over two rows ("Weight" over "Net | Gross", "Unit"
// over "Price") is read as one: the row below joins the header band when the row alone is not a table.
function findTables(g){
  if(TABLES_CACHE.has(g)) return TABLES_CACHE.get(g);
  const out=findTablesIn(g);
  TABLES_CACHE.set(g,out);
  return out;
}
function findTablesIn(g){
  const out=[];
  for(let r=0;r<g.rows.length;r++){
    const heads=headerCellsOf(g,r);
    if(heads.length<2) continue;
    let hr=r, band=[r];
    const segs=splitSegments(heads,rowCellRanges(g,r),{gaps:g.kind!=='pdf'});
    let best=segs.filter(s=>segmentKind(s.roles)).sort((a,b)=>b.roles.size-a.roles.size)[0];
    if((!best||subHeaderBelow(g,r,best))&&r+1<g.rows.length){
      const lower=headerCellsOf(g,r+1);
      if(lower.length){
        const byRole=new Map(); [...heads,...lower].forEach(h=>byRole.set(h.role+'|'+h.c0,h));
        const merged=[...byRole.values()].sort((a,b)=>a.c0-b.c0);
        const s2=splitSegments(merged,[...rowCellRanges(g,r),...rowCellRanges(g,r+1)],{gaps:g.kind!=='pdf'}).filter(s=>segmentKind(s.roles)).sort((a,b)=>b.roles.size-a.roles.size)[0];
        if(s2){
          best=s2;band=[r,r+1];hr=r+1;
          // the unit written in the group header ("Weight (G)") belongs to the sub-headers below it
          for(const h of best.heads){ if(h.r===r+1&&!h.hunit&&(h.role==='net'||h.role==='gross')){ const gh=groupHeaderOf(g,r,h); const hu=gh&&gh.text.match(/[(\[]\s*([A-Za-z./]{1,7})\s*[)\]]\s*$/); if(hu) h.hunit=hu[1].toUpperCase(); } }
        }
      }
    }
    if(!best) continue;
    const T={g,kind:segmentKind(best.roles),hr,band,heads:layoutHeads(g,best.heads,band),roles:best.roles};
    // the unit named in a group header above the header row ("Weight (G)" over "Net | Gross")
    for(const h of T.heads) if((h.role==='net'||h.role==='gross')&&!h.hunit) for(const rr of [band[0]-1,band[0]-2]){
      if(rr<0) break; const gh=groupHeaderOf(g,rr,h), hu=gh&&gh.text.match(/[(\[]\s*([A-Za-z./]{1,7})\s*[)\]]\s*$/);
      if(hu){ h.hunit=hu[1].toUpperCase(); break; }
    }
    out.push(T);
    if(band.length>1) r=band[band.length-1];
  }
  return out;
}
// The row where the next table that sits in the same columns begins (a repeated header at a page break, or a second table below).
const nextTableRow=(T,found)=>{const n=found.filter(x=>x!==T&&x.hr>T.hr&&sharesColumns(T,x)).map(x=>x.hr).sort((a,b)=>a-b)[0]; return n===undefined?T.g.rows.length:n;};
// The 'item' column of some CIPLs is the running number (1, 2, 3 ...), not a goods name: then it is the No. column.
function remapNumericItemColumn(g,T){
  const h=roleOf(T,'item'); if(!h||roleOf(T,'no')) return;
  let n=0,numeric=0; const lastCol=Math.max(...T.heads.map(x=>x.s1));
  for(let r=T.hr+1;r<g.rows.length&&r<T.hr+400;r++){
    if(rowTotalKind(g.rows[r]||[],lastCol).kind==='total') break;
    if(!hasQuantity(readRowValues(g,r,T.heads))) continue;                  // notes, continuation lines and blank rows say nothing about the item column
    for(let c=h.s0;c<=h.s1;c++){ const v=g.rows[r][c]; if(isBlank(v)) continue; n++; if(/^\d{1,4}$/.test(cellString(v))) numeric++; break; }
  }
  if(n>=1&&numeric===n) h.role='no';
}
/* ---- engine: e2b_body.js ---- */
/* ---------- reading the rows of a table ---------- */
const TOTAL_CELL_RE=/^(?:GRAND[\s-]*|OVERALL[\s-]*)?TOTAL\b/i;
const SUBTOTAL_CELL_RE=/^SUB[\s-]?TOTAL\b/i;
const ITEM_LABEL_RE=/^ITEMS?(?:\s+OF(?:\s+(?:PO|P\/O)\b.*)?)?$/i;                  // the "Items" / "Items of PO DDI-..." label that heads a merged item column
const NOTE_RE=/\b(?:HS[\s-]?CODE|HTS|TARIFF|TOTAL|DIMENSIONS?|REMARKS?|NOTES?|SAY\b|BANK|SWIFT|SIGNED|ACCOUNT|AS PER|MADE IN|COUNTRY OF|ORIGIN|SHIPPING MARKS?|CARTON NO|NET WEIGHT|GROSS WEIGHT|MEASUREMENT|PACKING|PAYMENT|TERMS|INCOTERMS?|FREIGHT|INSURANCE)\b|^[※*#▶►]|:\s*$/i;
// Values of one row, one entry per header: {num, cur, unit, text, cells}. A money or weight header owns a number and, next to it, the currency
// or unit text; the first number in its span is the value (a vertically merged value sits in the top cell only).
function readRowValues(g,r,heads){
  const V={}, row=g.rows[r]||[];
  for(const h of heads){
    const cells=[]; for(let c=h.s0;c<=h.s1&&c<row.length;c++) if(!isBlank(row[c])) cells.push({c,v:row[c]});
    const e={num:null,cur:'',unit:'',text:'',cells,c0:cells.length?cells[0].c:-1,fmt:'',hunit:h.hunit||''};
    const texts=[];
    for(const {c,v} of cells){
      if(NUM_ROLES.has(h.role)){
        const x=numCell(v);
        if(x!==null){
          if(e.num===null){
            e.num=x; e.fmt=(g.fmts&&g.fmts[r]&&g.fmts[r][c])||'';
            const lead=typeof v==='string'&&v.trim().match(/^(US\$|[A-Za-z]{3}|[$€£¥₩])\s*[-(\d.]/);        // "USD 6,300" in one cell: the currency comes with the number
            if(lead&&!e.cur&&(!/^[A-Za-z]{3}$/.test(lead[1])||CURRENCY_CODES.includes(norm(lead[1])))) e.cur=norm(lead[1]);
          }
          continue;
        }
        const u=norm(v);
        // a three-letter code is a currency only when it is one (USD, EUR): SET, PCS, KGS beside a quantity are units
        if(/^(?:US\$|[$€£¥₩])$/.test(u)||CURRENCY_CODES.includes(u)) e.cur=u; else if(/^[A-Z][A-Z./]{0,9}$/.test(u)) e.unit=u;
      }
      if(NUM_ROLES.has(h.role)||!texts.length) texts.push(cellString(v));      // a text header owns the first cell of its span only
    }
    e.text=texts.join(' ').trim();
    if(NUM_ROLES.has(h.role)&&e.num!==null&&typeof cells.find(x=>numCell(x.v)===e.num)?.v==='string'){
      const m=String(cells.find(x=>numCell(x.v)===e.num).v).trim().match(/^[-\d.,]*\d\s*([A-Za-z]{1,6})\.?$/); if(m&&!e.unit) e.unit=m[1].toUpperCase();   // "10 PCS" in one cell
    }
    V[h.role]=e;
  }
  return V;
}
// Unit of measure written in a number format: 0\ "SET"  ->  SET
function unitFromFormat(f){
  const m=String(f||'').match(/"\s*([A-Za-z]{1,8}\.?)\s*"|\\?\s*([A-Za-z]{2,6})\s*$/);
  const u=m?(m[1]||m[2]).toUpperCase().replace(/\.$/,''):'';
  return CURRENCY_CODES.includes(u)?'':u;                          // "USD "#,##0.00 is a currency, not a unit of measure
}
// Unit of measure named in the header of the quantity column: "Qty (PCS)", "Quantity [SET]".
const UNIT_WORD_RE=/^(?:PCS?|SETS?|EA|EACH|UNITS?|KGS?|MTR|M|ROLLS?|CTNS?|PAIRS?|PRS?|BOX|BOXES|DRUMS?|LOT|SHEETS?|L|LTR|BAGS?|PKGS?|SQM|M2|M3|YDS?|SETS)$/i;
const unitFromHeader=h=>h&&h.hunit&&UNIT_WORD_RE.test(h.hunit)?h.hunit.toUpperCase():'';
const hasQuantity=V=>['qty','price','amount','net','gross'].some(k=>V[k]&&V[k].num!==null);
// First integer written in a No. cell: "3", "3.", "No.3", "#3". Anything else is not a number.
function itemNumber(v){
  const s=cellString(v); const m=s.match(/^(?:NO\.?\s*|#\s*)?(\d{1,4})\.?$/i);
  return m?Number(m[1]):null;
}
// Is there a TOTAL (or SUB TOTAL) cell in this row, left of the end of the table's last column?
function rowTotalKind(row,lastCol){
  for(let c=0;c<row.length&&c<=lastCol+1;c++){
    const v=row[c]; if(typeof v!=='string') continue;
    const txt=v.trim(); if(SUBTOTAL_CELL_RE.test(txt)) return {kind:'sub',c}; if(TOTAL_CELL_RE.test(txt)) return {kind:'total',c};
  }
  return {kind:'',c:-1};
}
// The item column of some forms is a group label, not a name: "Items of PO DDI-20261008-410" in a merged cell, which a PDF shows over
// several lines ("Items of PO" on one row, the number on the next). Returns Map(row -> {po, first}) for the rows whose item cell is such a label.
const LABEL_WAIT_RE=/^ITEMS?(?:\s+OF(?:\s+(?:PO|P\/O))?)?\s*[:.]?$/i;                 // a label still missing its value
const LABEL_PO_RE=/^ITEMS?\s+OF\s+(?:PO|P\/O)\s*[:.]?\s*(\S.*)$/i;
function itemLabelRows(g,T,stopAt){
  const out=new Map(), h=roleOf(T,'item'); if(!h) return out;
  const lastCol=Math.max(...T.heads.map(x=>x.s1)), cells=[];
  for(let r=T.hr+1;r<stopAt;r++){
    const row=g.rows[r]||[]; if(row.every(isBlank)||(g.hiddenRows&&g.hiddenRows[r])) continue;
    const tk=rowTotalKind(row,lastCol); if(tk.kind==='total') break; if(tk.kind==='sub') continue;
    const e=readRowValues(g,r,[h]).item; if(e&&e.text) cells.push({r,text:e.text});
  }
  let unit=null;
  const close=()=>{ if(!unit) return; const m=unit.text.match(LABEL_PO_RE), po=m?m[1].trim():''; unit.rows.forEach(r=>out.set(r,{po,first:unit.rows[0]})); unit=null; };
  for(const c of cells){
    if(ITEM_LABEL_RE.test(c.text)){ close(); unit={rows:[c.r],text:c.text}; continue; }
    if(unit&&LABEL_WAIT_RE.test(unit.text)&&c.r-unit.rows[unit.rows.length-1]<=2&&(/^(?:OF|PO|P\/O)\b/i.test(c.text)||/\bOF\s+(?:PO|P\/O)\s*[:.]?$/i.test(unit.text))){
      unit.rows.push(c.r); unit.text+=' '+c.text; if(!LABEL_WAIT_RE.test(unit.text)) close(); continue;
    }
    close();
  }
  close();
  return out;
}
// A row of numbers without any text that equals the column sums of the items above it is the total of the table, printed without the word TOTAL.
function isSumRow(V,rows){
  let checked=0;
  for(const role of ['amount','qty','net','gross']){
    const e=V[role]; if(!e||e.num===null) continue;
    let sum=0,any=false; for(const r of rows){ const x=r.V[role]; if(x&&x.num!==null){sum+=x.num;any=true;} }
    if(!any) continue;
    if(Math.abs(sum-e.num)>Math.max(0.011,Math.abs(e.num)*1e-6)) return false;
    checked++;
  }
  return checked>0;
}
// A row that cannot belong to an item table: a document title ("PACKING LIST") or a party label ("Seller", "Consignee") heads what follows the table.
function endsTable(row){
  const cells=row.filter(v=>!isBlank(v)&&typeof v==='string'); if(!cells.length) return false;
  const title=norm(cells[0]).replace(/^CIPL\s*[-–:]\s*/,'');
  if(title.length<=40&&(isPlTitleText(title)||(CI_TITLE_RE.test(title)&&!isFieldLabelText(title)))&&cells.slice(1).filter(v=>norm(v).length>3).length<=1) return true;
  return ['seller','exporter','buyer'].includes(headerLabelRole(cells[0]));
}
// The rows of the table T (header row T.hr) down to its TOTAL row, as items. Returns
//  {rows:[{r,no,V,name,desc,item,type,...}], total:{r,V,text}|null, notes:[{r,text}], orphans:[{r,V}], po:[...], skippedHidden}
function readTableBody(g,T,{stopAt=g.rows.length,pl=false}={}){
  const heads=T.heads, lastCol=Math.max(...heads.map(h=>h.s1));
  const out={rows:[],total:null,notes:[],orphans:[],po:[],skippedHidden:0,last:T.hr};
  let prev=null, gap=0, curPo='', cont=false;
  const labels=itemLabelRows(g,T,stopAt);
  if(g.kind==='pdf'){ const pos=[...new Set([...labels.values()].map(x=>x.po).filter(Boolean))]; if(pos.length===1){ curPo=pos[0]; out.po.push(curPo); } }   // text of a merged cell is centred in the group: it belongs to the whole table
  for(let r=T.hr+1;r<stopAt;r++){
    const row=g.rows[r]||[];
    if(row.every(isBlank)){gap++; cont=false; continue;}
    if(g.hiddenRows&&g.hiddenRows[r]){ if(row.some(v=>!isBlank(v))) out.skippedHidden++; continue; }
    // the header of the same table again (page break): skipped
    const rep=headerCellsOf(g,r).map(h=>h.role).filter(x=>T.roles.has(x));
    if(rep.length>=Math.min(3,T.roles.size)&&!Object.values(readRowValues(g,r,heads)).some(e=>e.num!==null)){gap=0;continue;}
    // TOTAL row (a SUB TOTAL row is neither an item nor the end)
    const tk=rowTotalKind(row,lastCol), totalCell=tk.kind==='total'?tk.c:null;
    if(tk.kind==='sub'){gap++;continue;}
    const V=readRowValues(g,r,heads);
    if(totalCell!==null){
      if(out.rows.length||hasQuantity(V)){ out.total={r,V,text:row.slice(0,lastCol+2).map(cellString).filter(Boolean).join(' '),cells:row}; out.last=r; break; }
      gap=0; continue;
    }
    const lab=labels.get(r);
    const itemTxt=!lab&&V.item&&V.item.text&&!ITEM_LABEL_RE.test(V.item.text)?V.item.text:'';
    if(lab&&lab.first===r&&lab.po){ curPo=lab.po; if(!out.po.includes(curPo)) out.po.push(curPo); }
    const descTxt=V.desc?V.desc.text:'', typeTxt=V.type?V.type.text:'', codeTxt=V.code?V.code.text:'';
    const noVal=V.no&&V.no.text?itemNumber(V.no.text):null;
    // in a packing table a row may be named by its carton mark or only by its number
    const name=itemTxt||descTxt||typeTxt||codeTxt||(pl?((V.mark&&V.mark.text)||(noVal!==null?String(noVal):'')):'');
    const quant=hasQuantity(V);
    if(name&&quant){
      const it={r,no:noVal,V,item:itemTxt,desc:descTxt,type:typeTxt,code:codeTxt,po:curPo,extra:[],extraRole:[]};
      out.rows.push(it); prev=it; gap=0; cont=true; out.last=r; continue;
    }
    if(!name&&quant){
      if(out.rows.length&&isSumRow(V,out.rows)){ out.total={r,V,text:row.slice(0,lastCol+2).map(cellString).filter(Boolean).join(' '),cells:row,implicit:true}; out.last=r; break; }
      // numbers without any text: a row of its own below the items (the sum row without the word TOTAL), or the numbers of an item whose name sits on another row
      out.orphans.push({r,V,gap,afterItems:!!prev});
      out.last=r; gap=0; cont=false; continue;
    }
    // text only: the continuation of the item above, a note (HS code, dimension, bank ...), or a label
    if(out.rows.length&&endsTable(row)) break;
    if(lab&&!Object.values(V).some(e=>e!==V.item&&e.text)){ cont=false; gap=0; continue; }              // a row with nothing but the group label
    const textCells=row.filter(v=>!isBlank(v)).map(cellString).filter(Boolean);
    if(!textCells.length){gap++;continue;}
    const text=textCells.join(' ');
    out.notes.push({r,text});
    const inNameCols=heads.filter(h=>h.role==='desc'||h.role==='item'||h.role==='type').some(h=>row.slice(h.s0,h.s1+1).some(v=>!isBlank(v)));
    const oneLine=text.length<=100&&!NOTE_RE.test(text)&&!isKnownLabel(text)&&!/^[^:：]{1,30}[:：]\s*\S/.test(text);
    if(cont&&prev&&inNameCols&&oneLine&&!Object.entries(V).some(([k,e])=>!(k==='desc'||k==='item'||k==='type')&&e.text)){
      const hh=heads.find(h=>(h.role==='desc'||h.role==='item'||h.role==='type')&&row.slice(h.s0,h.s1+1).some(v=>!isBlank(v)));
      prev.extra.push(text); prev.extraRole.push(hh?hh.role:'desc');
    }
    else cont=false;
    gap=0;
  }
  return out;
}
/* ---- engine: e2c_items.js ---- */
/* ---------- invoice items ---------- */
const joinText=(...a)=>a.map(x=>cleanText(x)).filter(Boolean).join(' ');
function cleanUnit(s){const u=norm(s).replace(/\.$/,''); return /^[A-Z][A-Z./]{0,9}$/.test(u)?u:'';}
// Weights are compared in KG (CEISA NETTO / BRUTO). A PL that states them in tonnes or grams is converted, and says so.
function weightFactor(unit){
  const u=String(unit||'').toUpperCase().replace(/\.$/,'');
  if(/^(T|TNE|MT|M\/T|TON|TONS|TONNE|TONNES)$/.test(u)) return 1000;
  if(/^(G|GR|GRM|GRAM|GRAMS)$/.test(u)) return .001;
  if(/^(LB|LBS|POUND|POUNDS)$/.test(u)) return 0.45359237;
  return 1;
}
// One row of an invoice table as an item. Item column = goods name, Description / Type column = specification; a table with only a
// description column keeps the description and lets "TYRE MOLD ..." be split into goods name and type.
// Text that is not part of a goods name but lands in it: the group label "Items of PO DDI-20260807-01" and a carton line "C/NO : 1/1"
// printed in the name column (a PDF puts them on the lines under the name). They are taken out of the name; the PO number is kept.
const NAME_NOISE_PO=/\bITEMS?\s+OF\s+(?:PO|P\/O)\b[\s:.\-]*([A-Z0-9][A-Z0-9\/\-_.]*\d[A-Z0-9\/\-_.]*)?/i;
const NAME_NOISE_LINE=/^(?:ITEMS?\s+OF(?:\s+(?:PO|P\/O))?\b.*|(?:PO|P\/O)\s*(?:NO\.?)?\s*[:：].*|C\/\s?NO\.?\s*[:：]?\s*[\d\/\- ]+|(?:CARTON|CTN|CASE)\s*NO\.?\s*[:：].*)$/i;
function stripNameNoise(text,it){
  let str=String(text||'');
  const m=str.match(NAME_NOISE_PO);
  if(m){ if(it&&!it.po&&m[1]) it.po=m[1]; str=str.replace(NAME_NOISE_PO,' '); }
  str=str.replace(/\bC\/\s?NO\.?\s*[:：]\s*[\d\/\- ]+/gi,' ');
  return str.replace(/\s{2,}/g,' ').trim();
}
// Package dimensions in a text: "50*42*14", "SIZE :50*42*14(CM)", "460 x 380 x 200 mm" -> "50*42*14" (numbers as printed).
const DIM_RE=/(\d+(?:[.,]\d+)?)\s*(?:CM|MM|M)?\s*[*xX×]\s*(\d+(?:[.,]\d+)?)\s*(?:CM|MM|M)?\s*[*xX×]\s*(\d+(?:[.,]\d+)?)/i;
function parseDims(text){ const m=String(text||'').match(DIM_RE); return m?[m[1],m[2],m[3]].map(x=>x.replace(',','.')).join('*'):''; }
function ciItemFrom(row,no,warn){
  const V=row.V;
  let description='',type='',mold='';
  const it0={};
  // continuation lines that only carry a PO label or a carton number are not part of the name
  if(row.extra&&row.extra.length){
    const keep=[]; let waitPo=false;
    row.extra.forEach((piece,i)=>{
      const x=cleanText(piece);
      if(NAME_NOISE_LINE.test(x)){ stripNameNoise(x,it0); waitPo=/^ITEMS?\s+OF(?:\s+(?:PO|P\/O))?\s*[:.]?$/i.test(x); return; }
      // "Items of PO" on one line and its number on the next (a PDF wraps the merged label cell)
      if(waitPo&&/^[A-Z0-9][A-Z0-9\/\-_.]{3,29}$/i.test(x)&&/\d/.test(x)){ if(!it0.po) it0.po=x; waitPo=false; return; }
      waitPo=false; keep.push(i);
    });
    if(keep.length!==row.extra.length){ row={...row,extra:keep.map(i=>row.extra[i]),extraRole:keep.map(i=>(row.extraRole||[])[i])}; }
  }
  // a continuation line goes where its column goes: the goods name when it sits under the goods name, the specification otherwise
  const extraOf=(...roles)=>row.extra.filter((piece,i)=>roles.includes((row.extraRole||[])[i]||'desc'));
  let used=false;
  if(row.item){ description=joinText(row.item,...extraOf('item')); type=joinText(row.desc,row.type,...extraOf('desc','type')); used=true; }
  else if(row.desc){
    description=cleanText(row.desc); type=cleanText(row.type);
    if(!type){ const text=joinText(row.desc,...row.extra); const sp=splitMoldDescription(text); if(sp.type){description=cleanText(sp.description);type=cleanText(sp.type);mold=sp.mold||'';used=true;} }
    if(!used){ description=joinText(description,...extraOf('desc','item')); type=joinText(type,...extraOf('type')); used=true; }
  }else{ description=cleanText(row.type||row.code); description=joinText(description,...row.extra); used=true; }
  let unit=V.unit&&V.unit.text?cleanUnit(V.unit.text):'';
  if(!unit&&V.qty) unit=V.qty.unit||unitFromFormat(V.qty.fmt)||unitFromHeader(V.qty)||'';
  const qty=V.qty?V.qty.num:null, price=V.price?V.price.num:null;
  let amount=V.amount?V.amount.num:null, amountSource='';
  if(amount===null&&price!==null&&qty!==null){ amount=round2(price*qty); amountSource='QTY_X_PRICE'; }
  const it={no,description:stripNameNoise(description,it0),type:stripNameNoise(type,it0)};
  if(mold) it.mold=mold;
  if(V.mark&&V.mark.text) it.carton=cleanText(V.mark.text);
  if(V.brand&&V.brand.text) it.brand=cleanText(V.brand.text);
  it.hs=V.hs&&V.hs.text?cleanText(V.hs.text):'';
  it.qty=qty; it.unit=unit;
  if(price!==null) it.unit_price=price;
  it.amount=amount;
  if(amountSource){ it.amount_source=amountSource; warn(`Amount item ${no} dihitung dari Qty × Unit Price karena kolom Amount kosong.`); }
  const wkg=e=>{ const f=weightFactor(e.unit||e.hunit); if(f!==1) warn('Berat pada CI tertulis dalam ton, gram, atau pound; dikonversi ke KG agar sebanding dengan draft.'); return f===1?e.num:round3(e.num*f); };
  if(V.net&&V.net.num!==null) it.net=wkg(V.net);
  if(V.gross&&V.gross.num!==null) it.gross=wkg(V.gross);
  if(row.po) it.po=row.po; else if(it0.po) it.po=it0.po;
  if(V.dim&&V.dim.text){ const d=parseDims(V.dim.text); if(d) it.dimensions=d; else { const n=numCell(V.dim.text); if(n!==null&&n>0&&n<1000) it.cbm=n; } }
  it._r=row.r;
  it._cur=((V.amount&&V.amount.cur)||(V.price&&V.price.cur)||'').replace(/^US\$$|^\$$/,'USD');
  return it;
}
// Number printed in the TOTAL row of a column: the header's own span first, then the last number from the header's column to the right.
function totalCell(tr,T,role){
  const e=tr.V[role]; if(e&&e.num!==null) return e.num;
  const h=roleOf(T,role); if(!h) return null;
  const row=tr.cells||[]; let out=null;
  for(let c=h.c0;c<row.length&&c<=h.s1+1;c++){ const n=numCell(row[c]); if(n!==null&&typeof row[c]!=='boolean') out=n; }
  return out;
}
// All invoice tables of a grid: items in table order, the printed total, the PO numbers of "Items of PO ..." labels.
function readInvoiceItems(g,warn){
  const found=findTables(g), tables=found.filter(T=>T.kind==='CI'||T.kind==='BOTH');
  const res={items:[],total:null,po:[],orphans:[],notes:[],hasTable:tables.length>0,tables,hiddenSkipped:0,sumRow:null};
  let last=0;
  for(const T of tables){
    remapNumericItemColumn(g,T);
    const rd=readTableBody(g,T,{stopAt:nextTableRow(T,found)});
    res.hiddenSkipped+=rd.skippedHidden;
    for(const row of rd.rows){
      const no=row.no!==null?row.no:last+1; last=no;
      res.items.push(ciItemFrom(row,no,warn));
    }
    if(rd.total){
      res.total={amount:totalCell(rd.total,T,'amount'),qty:totalCell(rd.total,T,'qty'),net:totalWeightCell(rd.total,T,'net'),gross:totalWeightCell(rd.total,T,'gross'),text:rd.total.text,r:rd.total.r};
    }
    rd.po.forEach(p=>{ if(!res.po.includes(p)) res.po.push(p); });
    rd.notes.forEach(n=>res.notes.push(n));
    // numbers without a name: the sum row of a table without the word TOTAL, or the figures of an item whose name sits on the row above
    const lastItemR=res.items.length?res.items[res.items.length-1]._r:-1;
    for(const o of rd.orphans){
      if(o.r>lastItemR){ if(!res.sumRow) res.sumRow={r:o.r,V:o.V,T}; continue; }
      const prev=[...res.items].reverse().find(x=>x._r<o.r);
      if(!prev) continue;
      let used=false;
      for(const [k,f] of [['amount','amount'],['price','unit_price'],['net','net'],['gross','gross'],['qty','qty']]){
        const e=o.V[k]; if(e&&e.num!==null&&(prev[f]===null||prev[f]===undefined)){prev[f]=e.num;used=true;}
      }
      if(used) warn(`Angka pada baris ${o.r+1} dipasangkan ke item ${prev.no} (nama dan angka item berada di baris berbeda).`);
    }
  }
  if(!res.total&&res.sumRow&&res.sumRow.V.amount&&res.sumRow.V.amount.num!==null) res.total={amount:res.sumRow.V.amount.num,qty:res.sumRow.V.qty?res.sumRow.V.qty.num:null,net:null,gross:null,text:'',r:res.sumRow.r};
  return res;
}
/* ---------- packing list rows and the pairing with the invoice items ---------- */
function readPackingRows(g){
  const found=findTables(g), allPl=found.filter(T=>T.kind==='PL'||T.kind==='BOTH');
  // a table of only carton mark + N/W + GW is the per-carton detail beside the packing table, not a packing table of its own
  const isDetail=T=>T.roles.has('mark')&&T.roles.has('net')&&T.roles.has('gross')&&!T.roles.has('desc')&&!T.roles.has('item')&&!T.roles.has('qty')&&!T.roles.has('type')&&!T.roles.has('code');
  const mainT=allPl.filter(T=>!isDetail(T)), tables=mainT.length?mainT:allPl;
  // a table with weights only (no goods name, quantity or item number): the totals of the packing list, or a list of cartons; never rows of items
  const summaryLike=T=>!T.roles.has('desc')&&!T.roles.has('item')&&!T.roles.has('qty')&&!T.roles.has('type')&&!T.roles.has('code')&&!T.roles.has('no');
  const res={rows:[],total:null,hasTable:tables.length>0,tables,converted:false,sumRow:null,side:[],hiddenSkipped:0};
  if(mainT.length) allPl.filter(isDetail).forEach(T=>res.side.push({T,seg:{heads:T.heads,roles:T.roles}}));
  for(const T of tables){
    remapNumericItemColumn(g,T);
    const rd=readTableBody(g,T,{stopAt:nextTableRow(T,found),pl:true});
    res.hiddenSkipped+=rd.skippedHidden;
    const unitOf=(e,role)=>{ const h=roleOf(T,role); return (e&&e.unit)||(h&&h.hunit)||''; };
    const kg=(e,role)=>{ if(!e||e.num===null) return null; const f=weightFactor(unitOf(e,role)); if(f!==1) res.converted=true; return round3(e.num*f); };
    if(summaryLike(T)){
      const col=role=>{ let s=null; for(const row of rd.rows){ const v=kg(row.V[role],role); if(v!==null) s=(s===null?0:s)+v; } return s===null?null:round3(s); };
      const tot=rd.total?{net:kg(rd.total.V.net,'net')??totalWeightCell(rd.total,T,'net'),gross:kg(rd.total.V.gross,'gross')??totalWeightCell(rd.total,T,'gross'),qty:null,r:rd.total.r}
        :(rd.rows.length?{net:col('net'),gross:col('gross'),qty:null,r:rd.rows[rd.rows.length-1].r}:null);
      if(tot&&!res.total) res.total=tot;
      res.summaryOnly=true; continue;
    }
    for(const row of rd.rows){
      const V=row.V; const no=row.no!==null?row.no:null;
      const itemTxt=row.item||''; const name=cleanText(itemTxt||row.desc||row.type||row.code);
      let unit=V.unit&&V.unit.text?cleanUnit(V.unit.text):''; if(!unit&&V.qty) unit=V.qty.unit||unitFromFormat(V.qty.fmt)||unitFromHeader(V.qty)||'';
      res.rows.push({r:row.r,no,name,named:!!(row.item||row.desc||row.type||row.code),mark:V.mark?cleanText(V.mark.text):'',qty:V.qty?V.qty.num:null,unit,net:kg(V.net,'net'),gross:kg(V.gross,'gross'),V,_T:T});
    }
    if(rd.total) res.total={net:kg(rd.total.V.net,'net')??totalWeightCell(rd.total,T,'net'),gross:kg(rd.total.V.gross,'gross')??totalWeightCell(rd.total,T,'gross'),qty:totalCell(rd.total,T,'qty'),r:rd.total.r};
    const lastR=res.rows.length?res.rows[res.rows.length-1].r:-1;
    for(const o of rd.orphans) if(o.r>lastR&&!res.sumRow) res.sumRow={r:o.r,net:kg(o.V.net,'net'),gross:kg(o.V.gross,'gross'),qty:o.V.qty?o.V.qty.num:null};
    (T.side||[]).forEach(s=>res.side.push({T,seg:s}));
  }
  if(!res.total&&res.sumRow&&(res.sumRow.net!==null||res.sumRow.gross!==null)) res.total={net:res.sumRow.net,gross:res.sumRow.gross,qty:res.sumRow.qty,r:res.sumRow.r};
  return res;
}
function totalWeightCell(tr,T,role){
  const n=totalCell(tr,T,role); if(n===null) return null;
  const h=roleOf(T,role), e=tr.V[role]; const f=weightFactor((e&&e.unit)||(h&&h.hunit)||''); if(f!==1) return round3(n*f);
  return round3(n);
}
// Which item does a packing row belong to?
//  1. by the running number when both sides have one;
//  2. by name: equal (also with the words in another order) or one contained in the other. Similar names ("CASTING M12x80", "CASTING") are told
//     apart by the quantity: the pair with equal quantities wins;
//  3. a row that repeats the name of an item already paired, or has no name at all (a carton mark only) in a table that has names elsewhere, is
//     another carton of that item (applyPackingRows sums the rows of one item);
//  4. by position when both tables have the same number of rows.
// Returns pair[i] = index of the item of row i (several rows may share one item) or null.
function pairPackingRows(items,rows){
  const pair=new Array(rows.length).fill(null), used=new Set();
  const take=(i,j)=>{pair[i]=j;used.add(j);};
  const itemNos=items.map(x=>x.no);
  const byNo=rows.every(x=>x.no!==null)&&new Set(rows.map(x=>x.no)).size===rows.length&&rows.every(x=>itemNos.includes(x.no));
  if(byNo){ rows.forEach((x,i)=>take(i,itemNos.indexOf(x.no))); return pair; }
  const key=s=>normName(s).replace(/[^A-Z0-9]+/g,' ').trim();
  const bag=k=>k.split(' ').sort().join(' ');
  const has=(big,small)=>small.length>=3&&big.includes(small);
  const ik=items.map(it=>{ const a=key(it.description), b=key(it.description+' '+(it.type||'')); return {a,b,ba:bag(a),bb:bag(b)}; });
  const hasQty=v=>v!==null&&v!==undefined;
  const sameQty=(x,it)=>hasQty(x.qty)&&hasQty(it.qty)&&Math.abs(x.qty-it.qty)<1e-9;
  const cand=[];
  rows.forEach((x,i)=>{
    const k=key(x.name); if(!k) return;
    const bk=bag(k);
    ik.forEach((m,j)=>{
      let s=0;
      if(m.a===k||m.b===k) s=3;
      else if(m.ba===bk||m.bb===bk) s=2.8;
      else if(m.a&&(has(k,m.a)||has(m.a,k)||has(k,m.b)||has(m.b,k))) s=1;
      if(!s) return;
      cand.push({i,j,s:s+(sameQty(x,items[j])?2.5:0),d:Math.abs(i-j)});
    });
  });
  cand.sort((p,q)=>q.s-p.s||p.d-q.d||p.i-q.i||p.j-q.j);
  for(const c of cand) if(pair[c.i]===null&&!used.has(c.j)) take(c.i,c.j);
  const anyName=pair.some(p=>p!==null);
  // rows without any name, in tables of the same length as the CI: by position (when the quantities do not contradict it)
  if(rows.length===items.length) rows.forEach((x,i)=>{
    if(pair[i]!==null||x.named!==false||used.has(i)) return;
    if(!hasQty(x.qty)||!hasQty(items[i].qty)||sameQty(x,items[i])) take(i,i);
  });
  // another carton of an item already paired
  rows.forEach((x,i)=>{
    if(pair[i]!==null) return;
    if(x.named!==false){ const best=cand.find(c=>c.i===i); if(best){ pair[i]=best.j; return; } }
    if(x.named===false&&anyName){ for(let p=i-1;p>=0;p--) if(pair[p]!==null){ pair[i]=pair[p]; return; } }
  });
  const missing=rows.map((x,i)=>pair[i]===null?i:-1).filter(i=>i>=0);
  if(missing.length&&rows.length===items.length){ missing.forEach(i=>{ if(!used.has(i)) take(i,i); }); }
  return pair;
}
/* ---- engine: e2d_fields.js ---- */
/* ---------- which sheets are the invoice and the packing list ---------- */
const CI_TITLE_RE=/^(?:COMMERCIAL\s+INVOICE|TAX\s+INVOICE|PROFORMA\s+INVOICE|INVOICE)\b/;
const PL_TITLE_RE=/^PACKING\s+(?:LIST|DETAILS?|SLIP)\b/;
const TITLE_FIELD_TAIL=/^(?:COMMERCIAL |TAX |PROFORMA )?(?:INVOICE|PACKING (?:LIST|DETAILS?|SLIP))\s*(?:NO|NOS|NUMBER|NUM|#|DATE|REF|REFERENCE|TO|ADDRESS|AMOUNT|VALUE|TOTAL|CURRENCY|TERMS?|NOTE|REMARKS?)\b/;
const isFieldLabelText=txt=>TITLE_FIELD_TAIL.test(txt)||/[:\uFF1A]/.test(txt);
const isCiTitleText=txt=>CI_TITLE_RE.test(txt)&&txt.split(' ').length<=3&&!isFieldLabelText(txt);
const isPlTitleText=txt=>PL_TITLE_RE.test(txt)&&!isFieldLabelText(txt);
const sheetHidden=(wb,name)=>{const i=(wb.SheetNames||[]).indexOf(name);const s=wb.Workbook&&wb.Workbook.Sheets&&wb.Workbook.Sheets[i];return !!(s&&s.Hidden);};
// Title rows ("COMMERCIAL INVOICE", "PACKING LIST"): a short line, alone on its row (a stray flag in a far column does not count).
function findTitles(g){
  const out=[];
  g.rows.forEach((row,i)=>{
    const cells=row.map((v,c)=>({v,c})).filter(x=>!isBlank(x.v)&&typeof x.v==='string');
    if(!cells.length) return;
    const first=cells[0], title=norm(first.v).replace(/^CIPL\s*[-–:]\s*/,'');
    if(title.length>40) return;
    const others=cells.slice(1).filter(x=>norm(x.v).length>3);
    if(others.length>1) return;
    if(isPlTitleText(title)) out.push({i,kind:'PL'});
    else if(isCiTitleText(title)) out.push({i,kind:'CI'});
  });
  return out;
}
function sheetNameKind(name){
  const n=' '+norm(name).replace(/[^A-Z0-9]+/g,' ')+' ';
  const ci=/ (?:CI|C INVOICE|INVOICE|COMMERCIAL|INV) /.test(n)||/ CI(?= )/.test(n), pl=/ (?:PL|P LIST|PACKING|PACKINGLIST|P L) /.test(n);
  return ci&&pl?'BOTH':ci?'CI':pl?'PL':'';
}
// Finds the invoice and the packing list in a workbook: separate sheets (CI + PL, C-Invoice + P-List, Invoice + Packing List ...), or ONE
// sheet that carries both and is split at its titles. Hidden sheets and sheets without either (shipping marks, stale copies) are not read.
function resolveCiplSheets(wb){
  const names=(wb.SheetNames||Object.keys(wb.Sheets||{})).filter(n=>wb.Sheets[n]&&wb.Sheets[n]['!ref']);
  const info=names.map(n=>{
    const g=excelGrid(wb,n), titles=findTitles(g), tables=findTables(g);
    const tk=new Set(tables.map(tb=>tb.kind));
    return {n,g,titles,tables,hidden:sheetHidden(wb,n),nameKind:sheetNameKind(n),
      hasCiTable:tk.has('CI')||tk.has('BOTH'),hasPlTable:tk.has('PL')||tk.has('BOTH'),bothTable:tk.has('BOTH'),
      ciTitle:titles.some(ti=>ti.kind==='CI'),plTitle:titles.some(ti=>ti.kind==='PL')};
  });
  const vis=info.filter(x=>!x.hidden), pool=vis.length?vis:info;
  // 1) one sheet with both titles
  for(const s of pool){
    const a=s.titles.find(ti=>ti.kind==='CI'), b=s.titles.find(ti=>ti.kind==='PL');
    if(!a||!b) continue;
    const endOf=ti=>{const nx=s.titles.find(x=>x.i>ti.i); return nx?nx.i:s.g.rows.length;};
    return {ci:sliceGrid(s.g,a.i,endOf(a)),pl:sliceGrid(s.g,b.i,endOf(b)),combined:true,label:`${s.n} (CI dan PL dalam satu sheet)`,sheetNames:[s.n]};
  }
  // 2) separate sheets: the best candidate for each side (name, title and table all count)
  const score=(s,side)=>(s.nameKind===side?3:0)+((side==='CI'?s.ciTitle:s.plTitle)?3:0)+((side==='CI'?s.hasCiTable:s.hasPlTable)?4:0)-((side==='CI'?s.plTitle&&!s.ciTitle:s.ciTitle&&!s.plTitle)?5:0);
  const best=side=>pool.map(s=>({s,v:score(s,side)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v)[0];
  const ciB=best('CI'), plB=best('PL');
  let ciS=ciB&&ciB.s, plS=plB&&plB.s;
  if(ciS&&plS&&ciS===plS){
    // the same sheet won both sides: it is one table that holds both (items with amounts and weights), unless another sheet can be the packing list
    const other=pool.filter(s=>s!==ciS).map(s=>({s,v:score(s,'PL')})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v)[0];
    if(other) plS=other.s; else return {ci:ciS.g,pl:ciS.g,combined:true,label:`${ciS.n} (CI dan PL dalam satu sheet)`,sheetNames:[ciS.n]};
  }
  if(ciS||plS){
    const ci=ciS||plS, pl=plS||ciS;
    return {ci:ci.g,pl:pl.g,combined:false,label:ciS&&plS?`${ciS.n} + ${plS.n}`:`${ci.n}`,sheetNames:[...new Set([ci.n,pl.n])],missingSide:!ciS?'CI':!plS?'PL':''};
  }
  return null;
}
/* ---------- header fields ---------- */
function readIncoterm(grids){
  const inTerm=txt=>{const m=norm(txt).match(INCOTERM_RE); return m?m[1]:'';};
  // labelled: "Terms of Delivery", "Price Term : FOB JAKARTA" ... (a value without any incoterm, such as "T/T 120 DAYS", is skipped)
  for(const g of grids) for(const a of FIELD_ALIASES.incoterm) for(const pos of findLabelCells(g.rows,x=>x===a)){
    for(const how of ['inline','right','below']){
      const v=valueNear(g.rows,pos,{order:[how]}); if(v){const term=inTerm(v.text); if(term) return term;}
    }
  }
  // the TOTAL line, or any short line that names an incoterm with a place: "TOTAL 1 BOXES FOB JAKARTA", "FCA INCHEON AIRPORT"
  const lines=[];
  for(const g of grids) for(const row of g.rows) for(const v of row) if(typeof v==='string'&&v.length<=120) lines.push(v);
  for(const s of lines){ const m=norm(s).match(new RegExp('\\bTOTAL\\b.*?\\b('+INCOTERM_RE.source.slice(3,-3)+')\\b')); if(m) return m[1]; }
  for(const s of lines){ const m=norm(s).match(new RegExp('\\b('+INCOTERM_RE.source.slice(3,-3)+')\\s+(?:[A-Z]{3,}|\\()')); if(m) return m[1]; }
  for(const s of lines){ const m=norm(s).match(INCOTERM_RE); if(m) return m[1]; }
  return '';
}
const COUNTRY_RE=/\bMADE\s+IN\s+([A-Z][A-Za-z .]{2,24}?)(?=\s+BY\b|\s*[,;.]|\s*$)/i;
function readOrigin(grids){
  for(const g of grids){ const v=readByAliases(g.rows,FIELD_ALIASES.origin); if(v&&!/^MADE IN$/i.test(v.text)) return v.text; }
  for(const g of grids) for(const row of g.rows) for(const v of row){ if(typeof v!=='string') continue; const m=v.replace(/\s+/g,' ').match(COUNTRY_RE); if(m) return m[1].trim(); }
  return '';
}
// Package count: explicit total > standalone "N PACKAGES" > sum of "* N BX" dimension lines > count printed after the dimensions
// ("SIZE : 1100*1100*1000 - 1PLT - ...", one line per pallet group) > loose match. "TOTAL 2 WOODEN BOXES PACKING" and "TOTAL 1 BOX(ES)" count.
// The kind of package written after a count ("2 PLT", "4 CRATES", "1 BOX(ES)"), in the short form CIPLs use.
function packageUnitOf(word){
  const w=norm(word).replace(/\(ES\)$/,'').replace(/\.$/,'');
  if(/^(?:PALLETS?|PLTS?)$/.test(w)) return 'PLT';
  if(/^(?:BOX(?:ES)?|BX)$/.test(w)) return 'BOX';
  if(/^(?:CARTONS?|CTNS?)$/.test(w)) return 'CTN';
  if(/^(?:CRATES?)$/.test(w)) return 'CRATE';
  if(/^(?:CASES?)$/.test(w)) return 'CASE';
  if(/^(?:PACKAGES?|PKGS?)$/.test(w)) return 'PKG';
  if(/^(?:DRUMS?)$/.test(w)) return 'DRUM';
  if(/^(?:BALES?)$/.test(w)) return 'BALE';
  if(/^(?:BAGS?)$/.test(w)) return 'BAG';
  if(/^(?:ROLLS?)$/.test(w)) return 'ROLL';
  if(/^(?:SKIDS?)$/.test(w)) return 'SKID';
  if(/^(?:BUNDLES?)$/.test(w)) return 'BUNDLE';
  return w;
}
// Package count: explicit total > standalone "N PACKAGES" > sum of "* N BX" dimension lines > count printed after the dimensions
// ("SIZE : 1100*1100*1000 - 1PLT - ...", one line per pallet group) > loose match. "TOTAL 2 WOODEN BOXES PACKING" and "TOTAL 1 BOX(ES)" count.
// Returns {count, unit}: the unit is the kind of package written with the count ("PLT", "BOX"), '' when the text names none.
function detectPackagesInfo(pl,ci){
  const cells=[];
  for(const g of [pl,ci].filter((x,i,a)=>x&&a.indexOf(x)===i)){
    // the quantity cells of item rows ("27 ROLL") are quantities, not packages
    const skip=new Set();
    for(const T of findTables(g)){
      const q=roleOf(T,'qty'); if(!q) continue;
      for(let r=T.hr+1;r<g.rows.length;r++){
        const V=readRowValues(g,r,T.heads);
        if(['price','amount','net','gross'].filter(k=>V[k]&&V[k].num!==null).length>=1) for(let c=q.s0;c<=q.s1;c++) skip.add(r+':'+c);
      }
    }
    g.rows.forEach((row,r)=>row.forEach((v,c)=>{ const s=cellString(v); if(s&&typeof v==='string'&&!skip.has(r+':'+c)) cells.push(s); }));
    // a line spread over a few cells: "Total Packages" | 5 | "CTN"
    g.rows.forEach((row,r)=>{
      const parts=row.map((v,c)=>skip.has(r+':'+c)?'':cellString(v)).filter(Boolean);
      if(parts.length>=2&&parts.length<=4&&parts.some(p=>/[A-Za-z]/.test(p))&&parts.some(p=>/^\d+$/.test(p))) cells.push(parts.join(' '));
    });
  }
  const UNIT='(?:BOX(?:ES|\\(ES\\))?|BX|PACKAGES?|PKGS?|CARTONS?|CTNS?|PALLETS?|PLTS?|CRATES?|CASES?|DRUMS?|BALES?|BAGS?|ROLLS?|SKIDS?|BUNDLES?)';
  const out=(count,word)=>({count,unit:word?packageUnitOf(word):''});
  let m;
  for(const s of cells){ if((m=s.match(new RegExp('\\bTOTAL\\s*:?\\s*(\\d+)\\s+(?:[A-Z-]+\\s+){0,2}?('+UNIT+')\\b','i')))) return out(Number(m[1]),m[2]); }
  // "Total Packages : 4", "No. of Packages: 4 CTN", "TOTAL CARTONS : 6"
  const PK='(?:PACKAGES?|PKGS?|CARTONS?|CTNS?|PALLETS?|PLTS?|CASES?|BOXES|BOX|CRATES?|BALES?|DRUMS?|BAGS?)';
  for(const s of cells){ if((m=s.match(new RegExp('\\b(?:TOTAL\\s+(?:[A-Z]+\\s+){0,2}?|(?:NO\\.?|NUMBER)\\s+OF\\s+)('+PK+')\\s*[:=]?\\s*(\\d+)\\b(?![.,]\\d)(?:\\s*('+UNIT+'))?','i')))) return out(Number(m[2]),m[3]||(/PACKAGE|PKG/i.test(m[1])?'':m[1])); }
  for(const s of cells){ if((m=s.match(new RegExp('^(\\d+)\\s*('+UNIT+')\\.?$','i')))) return out(Number(m[1]),m[2]); }
  let sum=0,found=false,unit='';
  for(const s of cells){ if((m=s.match(/\*\s*(\d+)\s*(BX|BOX(?:ES|\(ES\))?|PKGS?|CTNS?)\b/i))){sum+=Number(m[1]);found=true;unit=unit||m[2];} }
  if(found) return out(sum,unit);
  const DIM=/\d+(?:\.\d+)?\s*[*xX×]\s*\d+(?:\.\d+)?\s*[*xX×]\s*\d+(?:\.\d+)?/;
  for(const s of cells){
    const d=s.match(DIM); if(!d) continue;
    const after=s.slice(d.index+d[0].length);
    if((m=after.match(new RegExp('(\\d+)\\s*('+UNIT+')\\b','i')))){sum+=Number(m[1]);found=true;unit=unit||m[2];}
  }
  if(found) return out(sum,unit);
  for(const s of cells){ if((m=s.match(new RegExp('\\b(\\d+)\\s+('+UNIT+')\\b','i')))) return out(Number(m[1]),m[2]); }
  return {count:null,unit:''};
}
// "SIZE : 50*42*14(CM) /1BOX", "SIZE : 1100*1100*1000 - 1PLT - TYRE MOLD", "Dimension : 460*380*200 * 1 BOX(ES)", "DIMENSION : 120 * 120 * 90 (cm) * 2 BX":
// [{dims:'50*42*14', count:1, unit:'BOX'}], one per line, in reading order. A line that does not name a size is not read.
function readSizeLines(grids){
  const out=[], seen=new Set();
  for(const g of grids) g.rows.forEach((row,r)=>row.forEach((v,c)=>{
    if(typeof v!=='string') return;
    const txt=v.replace(/\s+/g,' ').trim();
    const m=txt.match(/^(?:[*※#]\s*)?(?:SIZE|DIMENSIONS?|DIM|UKURAN|MEASUREMENT|CARTON SIZE|PACKING SIZE)\s*[:：]?\s*(\d+(?:[.,]\d+)?)\s*(?:CM|MM)?\s*[*xX×]\s*(\d+(?:[.,]\d+)?)\s*(?:CM|MM)?\s*[*xX×]\s*(\d+(?:[.,]\d+)?)/i);
    if(!m) return;
    const key=g.name+':'+r+':'+c; if(seen.has(key)) return; seen.add(key);
    const rest=txt.slice(m.index+m[0].length);
    const k=rest.match(/[\/*\-]\s*(\d+)\s*([A-Z]+(?:\(ES\))?)/i);
    out.push({dims:[m[1],m[2],m[3]].map(x=>x.replace(',','.')).join('*'),count:k?Number(k[1]):0,unit:k?packageUnitOf(k[2]):''});
  }));
  return out;
}
// Currency: the code beside the prices in the table, then "(USD)" in a header, then number formats ("USD "#,##0), then a cell that is only a code.
function readCurrency(grids,tableCurrencies){
  const count={}; (tableCurrencies||[]).forEach(x=>{if(x) count[x]=(count[x]||0)+1;});
  const top=Object.entries(count).sort((a,b)=>b[1]-a[1])[0];
  const codes=new RegExp('\\b('+CURRENCY_CODES.join('|')+')\\b','i');
  if(top) return {code:top[0].replace(/^US\$$/,'USD'),all:Object.keys(count)};
  for(const g of grids) for(const T of findTables(g)) for(const h of T.heads){ const m=(h.text||'').match(codes); if(m&&(h.role==='amount'||h.role==='price')) return {code:m[1].toUpperCase(),all:[m[1].toUpperCase()]}; }
  for(const g of grids){
    for(const fm of g.fmts||[]) for(const f of fm){ const m=String(f||'').match(codes); if(m) return {code:m[1].toUpperCase(),all:[m[1].toUpperCase()]}; }
  }
  for(const g of grids) for(const row of g.rows) for(const v of row){ const s=norm(v); if(CURRENCY_CODES.includes(s)) return {code:s,all:[s]}; }
  // "USD 1,120.00" written in one cell (a TOTAL line of a form whose amount column holds plain numbers)
  for(const g of grids) for(const row of g.rows) for(const v of row){ if(typeof v!=='string') continue; const m=norm(v).match(/^([A-Z]{3})\s*[0-9][0-9.,]*$/); if(m&&CURRENCY_CODES.includes(m[1])) return {code:m[1],all:[m[1]]}; }
  for(const g of grids) for(const row of g.rows) for(const v of row){ if(typeof v==='string'){const m=norm(v).match(/\b(?:AMOUNT|TOTAL|PRICE|CURRENCY)\b.{0,12}\b([A-Z]{3})\b/); if(m&&CURRENCY_CODES.includes(m[1])) return {code:m[1],all:[m[1]]};} }
  return {code:'',all:[]};
}
// HS codes written in a note ("※ HS-CODE : 8480.71 (TOE RING)", "HS CODE : 8480.30") rather than in a column.
const HS_NOTE_RE=/\bH\.?S\.?[\s-]*(?:CODE|NO\.?|NUMBER|#)?\s*[:：=]?\s*(\d{4}(?:[.\s-]?\d{2}){1,3})(.*)$/i;
// One note may carry several codes, each with the goods it is for: "HS CODE : 8516.80 (HEATER), 9025.19 (THERMOCOUPLE)". The goods may
// also be written in front of the label: "MOLD BAR GAUGE, STAND HS CODE : 9031.80". Returns [{code, digits, kws:[...], kw, text}].
const HS_CODE_IN_NOTE=/(\d{4}(?:[.\s-]?\d{2}){1,3})\s*(?:[(（]\s*([^()（）]+?)\s*[)）])?/g;
function findHsNotes(grids){
  const out=[];
  for(const g of grids) g.rows.forEach(row=>row.forEach(v=>{
    if(typeof v!=='string') return;
    const txt=v.replace(/\s+/g,' ').trim();
    const m=txt.match(HS_NOTE_RE); if(!m) return;
    const pre=txt.slice(0,m.index).replace(/^[※*#▶►\-\s]+/,'').replace(/[\s:;,\-–—]+$/,'').trim();
    const found=[]; let x; HS_CODE_IN_NOTE.lastIndex=0;
    const tail=m[1]+m[2];
    while((x=HS_CODE_IN_NOTE.exec(tail))){
      const digits=x[1].replace(/\D/g,''); if(digits.length<6||digits.length>10) continue;
      found.push({code:x[1].trim(),digits,kws:x[2]?[x[2].trim()]:[]});
      if(found.length===1&&!/^[\s,;\/&]*\d{4}/.test(tail.slice(HS_CODE_IN_NOTE.lastIndex))&&!/[(（]/.test(tail.slice(x[0].length))) break;   // one code, the rest is prose ("for all items")
    }
    if(!found.length) return;
    if(found.length===1&&!found[0].kws.length&&pre&&pre.length<=80&&pre.split(' ').length<=10&&!/[:：]/.test(pre)&&!/\b(?:TOTAL|REMARKS?|NOTES?)\b/i.test(pre))
      found[0].kws=pre.split(/\s*(?:,|&|\/|\bAND\b)\s*/i).map(k=>k.trim()).filter(k=>k.length>=3);
    for(const f of found){
      const key=f.kws.map(norm).join('|');
      if(!out.some(o=>o.digits===f.digits&&o.kws.map(norm).join('|')===key)) out.push({code:f.code,digits:f.digits,kws:f.kws,kw:f.kws[0]||'',text:txt});
    }
  }));
  return out;
}
// Items without an HS code in their own row take it from a note: a note that names goods (in brackets after the code, or in front of the
// label) goes to the items whose name contains one of those words; a single other note goes to every remaining item.
function applyHsNotes(items,notes,warn){
  const need=items.filter(x=>!cleanText(x.hs));
  if(!need.length||!notes.length) return;
  let applied=0;
  const words=v=>' '+norm(v).replace(/[^A-Z0-9]+/g,' ').trim()+' ';
  const named=notes.filter(x=>x.kws&&x.kws.length);
  for(const n of named){
    const kws=n.kws.map(k=>words(k).trim()).filter(Boolean);
    for(const it of need) if(!cleanText(it.hs)&&kws.some(k=>words(it.description+' '+(it.type||'')).includes(' '+k+' '))){it.hs=n.code;it.hs_source='NOTE';applied++;}
  }
  const rest=items.filter(x=>!cleanText(x.hs)), plain=notes.filter(x=>!(x.kws&&x.kws.length));
  const distinct=[...new Set(plain.map(x=>x.digits))];
  if(rest.length&&distinct.length===1){ const n=plain[0]; rest.forEach(it=>{it.hs=n.code;it.hs_source='NOTE';applied++;}); }
  else if(rest.length&&(distinct.length>1||(!plain.length&&notes.length))) warn(`Ada ${notes.length} catatan HS Code di CIPL tetapi tidak bisa dipasangkan ke ${rest.length} item; HS Code item itu dibiarkan kosong.`);
  if(applied) warn(`HS Code ${[...new Set(items.filter(x=>x.hs_source==='NOTE').map(x=>x.hs))].join(', ')} diambil dari catatan di CIPL (bukan dari kolom tabel) dan dipasangkan ke ${applied} item.`);
}
/* ---- engine: e2e_assemble.js ---- */
/* ---------- carton weights (KHV master CIPL) ---------- */
// A per-carton table (CARTON | N/W | GW) beside the packing table holds the exact weights; the printed Net/Gross columns are rounded
// to whole kg. It is used only when it covers EVERY packing row, so exact and rounded weights are never summed together.
function readCartonDetail(plRes){
  const detail=[];
  for(const {T,seg} of plRes.side){
    const R=seg.roles; if(!(R.has('mark')&&R.has('net')&&R.has('gross'))) continue;
    const heads=layoutHeads(T.g,seg.heads), g=T.g;
    for(let r=T.hr+1;r<g.rows.length;r++){
      const V=readRowValues(g,r,heads);
      const key=norm(V.mark&&V.mark.text).replace(/\s+/g,'');
      if(!key||V.net.num===null) continue;
      detail.push({key,nw:V.net.num,gw:V.gross.num});
    }
  }
  return detail;
}
function applyPackingRows(c,plRes,warn){
  const rows=plRes.rows, items=c.items;
  const detail=readCartonDetail(plRes), byCarton={};
  detail.forEach(e=>{byCarton[e.key]=e;});
  const pair=pairPackingRows(items,rows);
  const keyOf=row=>norm(row.mark).replace(/\s+/g,'');
  const entryFor=(row,i)=>{ const k=keyOf(row); if(k) return byCarton[k]; return detail.length===rows.length?detail[i]:undefined; };
  const entries=rows.map(entryFor);
  const preciseOk=detail.length>0&&entries.length>0&&entries.every(Boolean);
  if(detail.length>0&&!preciseOk) warn('Tabel berat per karton (N/W, GW) tidak lengkap atau tidak cocok dengan baris item; dipakai kolom Net Wt. / Gross Wt. yang tercetak (dibulatkan).');
  // an item can stand on several packing rows (a row per carton or pallet): quantity and weights are summed
  const acc=new Map();
  rows.forEach((row,i)=>{
    const j=pair[i];
    if(j===null){ warn(`Baris PL ${row.no!==null?'nomor '+row.no:(row.name||row.mark||('ke-'+(i+1)))} tidak punya pasangan di CI.`); return; }
    const it=items[j], e=preciseOk?entries[i]:null;
    if(!it.unit&&row.unit) it.unit=row.unit;
    if(!it.dimensions&&row.V&&row.V.dim&&row.V.dim.text){ const d=parseDims(row.V.dim.text); if(d) it.dimensions=d; else if(it.cbm===undefined){ const n=numCell(row.V.dim.text); if(n!==null&&n>0&&n<1000) it.cbm=n; } }
    let a=acc.get(j); if(!a){ a={n:0,qty:null,net:null,gross:null,netp:null,grossp:null}; acc.set(j,a); }
    a.n++;
    const add=(k,v)=>{ if(v!==null&&v!==undefined) a[k]=(a[k]===null?0:a[k])+v; };
    add('qty',row.qty); add('netp',row.net); add('grossp',row.gross);
    if(e&&row.qty!==null){ add('net',round3(e.nw*row.qty)); add('gross',e.gw!==null?round3(e.gw*row.qty):row.gross); }
    else{ add('net',row.net); add('gross',row.gross); }
  });
  for(const [j,a] of acc){
    const it=items[j];
    if(a.qty!==null&&it.qty!==null&&Math.abs(a.qty-it.qty)>1e-9) warn(`Qty item ${it.no} di PL (${round3(a.qty)}) berbeda dengan di CI (${it.qty}).`);
    if(a.n>1) warn(`Item ${it.no} berada di ${a.n} baris PL (per karton/palet); qty dan berat dijumlahkan.`);
    if(detail.length){ it.net_printed=a.netp; it.gross_printed=a.grossp; }
    if(a.net!==null) it.net=round3(a.net);
    if(a.gross!==null) it.gross=round3(a.gross);
  }
}
/* ---------- totals ---------- */
// Amount: SUM OF THE ITEM AMOUNTS is the value; the printed TOTAL row only when the items cannot be summed (kept as total_amount_printed).
// (resolveTotalAmount and resolveTotalWeights are defined above, with the rules of the company.)
// Last-resort totals of weights: a row that says TOTAL, or a row of "258 KG 298 KG", with two numbers.
function scanWeightTotals(pl,tables){
  let net=null,gross=null;
  // the columns of the packing table (and one more); scratch numbers typed far to the right are not read
  let c0=0,c1=11;
  if(tables&&tables.length){ c0=Math.min(...tables.map(T=>tableCols(T)[0])); c1=Math.max(...tables.map(T=>tableCols(T)[1]))+1; }
  for(const row of pl.rows){
    const text=row.map(norm).join(' ');
    if(/\bTOTAL\b/.test(text)){
      const nums=row.map(numCell).filter(v=>v!==null);
      if(nums.length>=2){ net=nums[nums.length-2]; gross=nums[nums.length-1]; }
    }
  }
  if(net!==null||gross!==null) return {net,gross};
  for(let i=pl.rows.length-1;i>=0;i--){
    const row=pl.rows[i].slice(c0,c1+1), text=row.map(norm).join(' ');
    if(/\bKGS?\b/.test(text)){ const nums=row.map(numCell).filter(v=>v!==null); if(nums.length>=2) return {net:nums[nums.length-2],gross:nums[nums.length-1]}; }
  }
  return {net:null,gross:null};
}
// Items read when no table header is recognised: rows below a header-like row with a name and at least two numbers.
function emergencyItems(g){
  const out=[]; let no=1;
  const start=Math.max(0,g.rows.findIndex(r=>r.some(v=>/\b(?:DESCRIPTION|GOODS|COMMODITY|PRODUCT|ITEM)S?\b/.test(norm(v))&&norm(v).length<40)));
  for(const row of g.rows.slice(start+1)){
    const texts=row.filter(v=>typeof v==='string'&&numCell(v)===null).map(cleanText).filter(Boolean);
    const nums=row.map(numCell).filter(v=>v!==null);
    const text=texts.sort((a,b)=>b.length-a.length)[0]||'';
    if(nums.length<2||!text||text.length<=5) continue;
    if(/SELLER|CONSIGNEE|TOTAL|ACCOUNT OF PAYMENT|SIGNED BY|BANK|SWIFT/i.test(text)) continue;
    const amount=nums[nums.length-1], qty=nums[0];
    if(amount>0&&qty>0&&qty<=100000) out.push({no:no++,description:text,type:'',hs:'',qty,unit:'',amount});
  }
  return out;
}
/* ---------- the CIPL object ---------- */
function buildCipl(args){
  const grids0=[args.ci,args.pl].filter((g,i,a)=>g&&a.indexOf(g)===i);
  NUM_LOCALE=detectNumberLocale(grids0);
  try{ return buildCiplIn(args); } finally { NUM_LOCALE=''; }
}
// FCL or LCL, written beside a "Volume" / "Load type" label (up to four cells to the right, or under it): "Volume | 3.2 CBM | LCL".
function readLoadType(grids){
  const one=txt=>{ const u=norm(txt); const f=/\bFCL\b/.test(u), l=/\bLCL\b/.test(u); return f!==l?(f?'FCL':'LCL'):''; };
  for(const g of grids) for(const a of FIELD_ALIASES.volume) for(const pos of findLabelCells(g.rows,x=>x===a)){
    if(pos.inline&&one(pos.inline)) return one(pos.inline);
    const row=g.rows[pos.row]||[];
    for(let c=pos.col+1;c<row.length&&c<=pos.col+4;c++){ const hit=one(cellString(row[c])); if(hit) return hit; }
    const below=(g.rows[pos.row+1]||[])[pos.col]; if(below!==undefined&&one(cellString(below))) return one(cellString(below));
  }
  return '';
}
// A header value that only holds a place for the real one: "0" or "00:00:00" (an empty date-formatted cell), "—", "N/A", "TBA" ...
const PLACEHOLDER_RE=/^(?:0|0+:0+(?::0+)?|-+|—+|–+|N\/?A|NIL|NONE|NULL|TBA|TBC|TBD|TBN|TO BE ADVISED|TO BE CONFIRMED|\.+|\?+)$/i;
function notStated(v){const txt=cleanText(v); return PLACEHOLDER_RE.test(txt)?'':txt;}
// A BL / AWB number: letters and digits (spaces, dashes and slashes allowed), at least three digits, never a date or a label.
const BL_NUMBER_RE=/^(?=(?:[^0-9]*[0-9]){3})[A-Z0-9][A-Z0-9 \-\/]{4,34}$/i;
function buildCiplIn({ci,pl,label,sheetNames,wb,wbs,missingSide,extraGrids}){
  const warnings=[], warn=m=>{ if(!warnings.includes(m)) warnings.push(m); };
  const c={invoice_no:'',invoice_date:'',packing_no:'',packing_date:'',packing_source:'',po_no:'',po_date:'',seller:'',exporter:'',buyer:'',port_loading:'',port_destination:'',final_destination:'',vessel:'',incoterm:'',country_origin:'',currency:'',total_amount:null,total_net:null,total_gross:null,packages:null,package_unit:'',etd:'',master_bl:'',house_bl:'',bl_no:'',muatan:'',items:[],po_list:[],warnings,sourceFormat:label};
  const grids=[ci,pl].filter((g,i,a)=>g&&a.indexOf(g)===i);
  const first=fn=>{ for(const g of grids){ const v=fn(g.rows); if(v) return v; } return null; };
  const text=(aliases,opts)=>{ const v=first(r=>readByAliases(r,aliases,opts)); return v?v.text:''; };
  // parties. "Shipper/Seller" (import CIPL) is one party that ships and sells, so it fills seller and exporter alike.
  c.seller=cleanText(first(r=>readParty(r,SELLER_LABELS))||'');
  c.exporter=cleanText(first(r=>readParty(r,EXPORTER_LABELS))||'');
  const exporterFromSeller=!norm(c.exporter);
  if(exporterFromSeller) c.exporter=c.seller;
  c.buyer=cleanText(first(r=>readParty(r,BUYER_LABELS))||'');
  // TAX ID (NPWP) printed in each party block; compared with NOMOR IDENTITAS of the CEISA entities (see compareTaxId).
  // The CI is read first and the PL fills what the CI does not state; a different number on the two is reported.
  const taxCi=partyTaxIds(ci.rows), taxPl=pl&&pl!==ci?partyTaxIds(pl.rows):{found:{seller:'',exporter:'',buyer:''},unattributed:[]};
  c.tax_id={seller:'',exporter:'',buyer:''};
  for(const role of Object.keys(c.tax_id)){
    const a=taxCi.found[role], b=taxPl.found[role];
    c.tax_id[role]=a||b||'';
    if(a&&b&&!taxIdEquivalent(a,b)) warn(`TAX ID ${TAX_ROLE_NAMES[role]} di sheet CI (${a}) berbeda dengan di sheet PL (${b}); dipakai sheet CI.`);
  }
  if(exporterFromSeller&&!c.tax_id.exporter) c.tax_id.exporter=c.tax_id.seller;
  for(const id of new Set([...taxCi.unattributed,...taxPl.unattributed])) warn(`TAX ID ${id} ditemukan di CIPL tetapi tidak berada di bawah label Seller, Shipper, atau Consignee; tidak dibandingkan.`);
  // references
  const inv=first(r=>readRef(r,FIELD_ALIASES.invoice));
  if(inv){c.invoice_no=inv.no;c.invoice_date=inv.date;}
  if(!c.invoice_date) c.invoice_date=first(r=>readDateByAliases(r,FIELD_ALIASES.invoiceDate))||'';
  if(!norm(c.invoice_no)){
    for(const g of grids) for(const row of g.rows.slice(0,40)) for(const v of row){
      const m=typeof v==='string'&&v.match(/\b([A-Z]{2,6}[- ][A-Z0-9]+\d{6,})\b/i); if(m&&!c.invoice_no) c.invoice_no=m[1];
    }
    if(c.invoice_no) warn('Nomor invoice tidak berada di bawah label "Invoice No."; diambil dari teks yang menyerupai nomor invoice.');
  }
  // Packing list number and date: read from the PL itself; only when it states no reference at all are the invoice number/date used.
  const plRef=pl&&pl!==ci?(readRef(pl.rows,FIELD_ALIASES.packing)||readRef(pl.rows,FIELD_ALIASES.invoice)):null;
  if(plRef&&norm(plRef.no)){c.packing_no=plRef.no;c.packing_date=plRef.date;c.packing_source='PL';}
  else{c.packing_no=c.invoice_no;c.packing_date=c.invoice_date;c.packing_source='INVOICE_FALLBACK';}
  const po=first(r=>{const x=readPoBlock(r,FIELD_ALIASES.po); return x.length?x:null;});
  if(po){c.po_no=po[0].no;c.po_date=po[0].date;c.po_list=po;}
  // route, vessel, terms
  const stated=(field,raw)=>{ const val=notStated(raw); if(raw&&!val) (c.placeholders=c.placeholders||{})[field]=cleanText(raw); return val; };
  c.port_loading=stated('port_loading',text(FIELD_ALIASES.loading));
  c.port_destination=stated('port_destination',text(FIELD_ALIASES.discharge));
  c.final_destination=stated('final_destination',text(FIELD_ALIASES.final));
  if(!norm(c.port_destination)) c.port_destination=c.final_destination;
  c.vessel=stated('vessel',text(FIELD_ALIASES.vessel));
  c.incoterm=readIncoterm(grids);
  c.country_origin=stated('country_origin',readOrigin(grids));
  // departure date, BL / AWB and FCL / LCL: not in every CIPL, and not compared with the draft by themselves; Shipment Schedule fills its
  // schedule form with them and the checker offers the BL / AWB numbers as typed values. Sheets other than CI and PL (a shipping
  // instruction, a warehouse sheet) are searched too.
  const allGrids=grids.concat((extraGrids||[]).filter(g=>g&&!grids.includes(g)));
  const firstAll=fn=>{ for(const g of allGrids){ const v=fn(g.rows); if(v) return v; } return null; };
  { const d=first(r=>readDateByAliases(r,FIELD_ALIASES.etd)); c.etd=isIsoDate(d)?d:''; }
  const blOf=aliases=>{ const v=firstAll(r=>readByAliases(r,aliases,{accept:txt=>BL_NUMBER_RE.test(txt)&&!isDateValue(txt)})); return v?cleanText(v.text):''; };
  c.master_bl=blOf(FIELD_ALIASES.mbl); c.house_bl=blOf(FIELD_ALIASES.hbl); c.bl_no=blOf(FIELD_ALIASES.bl);
  c.muatan=readLoadType(allGrids);
  // --- CI items ---
  const ciRes=readInvoiceItems(ci,warn);
  let items=ciRes.items;
  if(!items.length&&pl&&pl!==ci){ const alt=readInvoiceItems(pl,warn); if(alt.items.length){items=alt.items; ciRes.total=alt.total; ciRes.po=alt.po; ciRes.notes=alt.notes;} }
  if(!items.length){
    const em=emergencyItems(ci);
    if(em.length){ items=em; warn('Layout tabel CI tidak dikenali; item dibaca dengan parser darurat dan perlu diverifikasi manual.'); }
  }
  c.items=items;
  if(!c.po_list.length&&ciRes.po.length){ c.po_list=ciRes.po.map(no=>({no,date:''})); c.po_no=ciRes.po[0]; }
  if(ciRes.hiddenSkipped) warn(`${ciRes.hiddenSkipped} baris tersembunyi (hidden) di tabel CI tidak dibaca.`);
  c.total_amount=ciRes.total&&ciRes.total.amount!==undefined?ciRes.total.amount:null;
  // Amount rule: sum of the items; the printed TOTAL only when the items cannot be summed.
  if(c.total_amount===null&&!(c.items.length&&c.items.every(x=>num(x.amount)!==null))){
    const totalLine=ci.rows.map(r=>r.map(cellString).join(' ')).find(line=>/\bTOTAL\b/i.test(line));
    if(totalLine){ const nums=totalLine.match(/(?:USD|EUR|KRW|JPY|CNY|SGD|IDR|THB|MYR)?\s*([0-9][0-9,]*(?:\.\d+)?)/gi)||[]; if(nums.length) c.total_amount=num(nums[nums.length-1]); }
  }
  resolveTotalAmount(c);
  for(const it of c.items){
    if(it.qty!==null&&it.unit_price!==undefined&&it.amount!==null&&it.amount_source!=='QTY_X_PRICE'){
      const exp=it.qty*it.unit_price; if(Math.abs(exp-it.amount)>Math.max(0.05,Math.abs(exp)*0.005)) warn(`Item ${it.no}: Amount (${it.amount}) tidak sama dengan Qty × Unit Price (${round2(exp)}).`);
    }
  }
  // --- PL weights ---
  const plSource=pl||ci;
  const plRes=readPackingRows(plSource);
  let noWeightsWarn='';
  if(plRes.hasTable&&plRes.rows.length) applyPackingRows(c,plRes,warn);
  else if(!ciRes.items.some(x=>x.net!==undefined)&&!(plRes.total)) noWeightsWarn=missingSide==='PL'?'Sheet packing list tidak ditemukan; berat tidak bisa dibaca.':'Tabel packing list (Net Wt. / Gross Wt.) tidak ditemukan; berat per item kosong.';
  if(plRes.hiddenSkipped&&plSource!==ci) warn(`${plRes.hiddenSkipped} baris tersembunyi (hidden) di tabel packing list tidak dibaca.`);
  if(plRes.converted) warn('Berat pada PL tertulis dalam ton atau gram; dikonversi ke KG agar sebanding dengan draft.');
  if(plRes.total){ c.total_net=plRes.total.net; c.total_gross=plRes.total.gross; }
  if(ciRes.total&&(c.total_net===null||c.total_net===undefined)&&ciRes.total.net!==null&&ciRes.total.net!==undefined) c.total_net=ciRes.total.net;
  if(ciRes.total&&(c.total_gross===null||c.total_gross===undefined)&&ciRes.total.gross!==null&&ciRes.total.gross!==undefined) c.total_gross=ciRes.total.gross;
  {
    const noNet=!c.items.some(x=>num(x.net)!==null), noGross=!c.items.some(x=>num(x.gross)!==null);
    const needN=noNet&&(c.total_net===null||c.total_net===undefined), needG=noGross&&(c.total_gross===null||c.total_gross===undefined);
    if(needN||needG){
      const ws=readWeightSummary(grids);
      if(needN&&ws.net!==null) c.total_net=ws.net;
      if(needG&&ws.gross!==null) c.total_gross=ws.gross;
      if(ws.converted&&((needN&&ws.net!==null)||(needG&&ws.gross!==null))) warn('Berat pada CIPL tertulis dalam ton, gram, atau pound; dikonversi ke KG agar sebanding dengan draft.');
    }
  }
  // an invoice without any weight column and no packing list at all: its TOTAL row holds quantity and amount, never weights
  const weightless=(plRes.tables.length>0&&plRes.tables.every(T=>!roleOf(T,'net')&&!roleOf(T,'gross'))&&plRes.tables.some(T=>roleOf(T,'amount')||roleOf(T,'price')))
    ||(!plRes.tables.length&&plSource===ci&&ciRes.tables.length>0&&ciRes.tables.every(T=>!roleOf(T,'net')&&!roleOf(T,'gross')));
  if(!weightless&&(c.total_net===null||c.total_gross===null)){ const wt=scanWeightTotals(plSource,plRes.tables); if(c.total_net===null) c.total_net=wt.net; if(c.total_gross===null) c.total_gross=wt.gross; }
  resolveTotalWeights(c);
  if(c.items.length&&!c.items.some(x=>num(x.net)!==null)&&c.total_net!==null&&c.total_net!==undefined) warn('Berat hanya tercantum sebagai total di CIPL (tanpa rincian per item); NW per item tidak bisa diperiksa.');
  else if(noWeightsWarn) warn(noWeightsWarn);
  { const pk=detectPackagesInfo(plSource,ci); c.packages=pk.count; c.package_unit=pk.unit; }
  // SIZE / Dimension lines under the packing list: one line per package group, in the order of the items. Assigned to the items only when
  // there is exactly one line per item (a guess about which line belongs to which item would be worse than none).
  c.size_lines=readSizeLines(grids);
  if(c.size_lines.length&&c.size_lines.length===c.items.length){
    c.items.forEach((it,i)=>{ const z=c.size_lines[i]; if(!it.dimensions) it.dimensions=z.dims; if(z.count&&!it.package) it.package=(z.count+' '+z.unit).trim(); });
  }else if(c.items.length===1){
    const it=c.items[0], z=c.size_lines[0];
    if(z&&!it.dimensions) it.dimensions=z.dims;
    if(!it.package&&c.packages) it.package=(c.packages+' '+(c.package_unit||(z&&z.unit)||'')).trim();
  }
  if(!c.package_unit&&c.size_lines.length) c.package_unit=c.size_lines.find(z=>z.unit)?.unit||'';
  // currency
  const cur=readCurrency(grids,c.items.map(x=>x._cur));
  c.currency=cur.code;
  if(!c.currency) warn('Mata uang tidak ditemukan di CI (teks maupun format angka).');
  else if(cur.all.length>1) warn(`Lebih dari satu mata uang terbaca di tabel CI (${cur.all.join(', ')}); dipakai ${c.currency}.`);
  applyHsNotes(c.items,findHsNotes(grids),warn);
  if(!c.items.length) warn('Tidak ada item yang berhasil dibaca dari CI.');
  if(missingSide==='CI') warn('Sheet invoice tidak ditemukan secara terpisah; data header dan item dibaca dari sheet yang ada.');
  // formula cells without a cached value read as empty -> tell the user instead of silently failing
  let uncached=0;
  for(const src of (wbs||(wb?[{wb,sheetNames}]:[]))) for(const n of src.sheetNames||[]){const ws=src.wb&&src.wb.Sheets[n]; if(!ws) continue; for(const a of Object.keys(ws)){if(a[0]!=='!'&&ws[a].f&&ws[a].v===undefined) uncached++;}}
  if(uncached) warn(`${uncached} sel berformula tanpa nilai tersimpan; buka file di Excel lalu Save ulang sebelum diperiksa.`);
  c.items.forEach(it=>{delete it._r;delete it._cur;});
  return c;
}
// Visible sheets that are neither the invoice nor the packing list (a shipping instruction, a warehouse sheet): searched for BL / AWB
// numbers and FCL / LCL only.
function otherSheetGrids(wb,used){
  return (wb.SheetNames||[]).filter(n=>!used.includes(n)&&wb.Sheets[n]&&wb.Sheets[n]['!ref']&&!sheetHidden(wb,n)).slice(0,6).map(n=>excelGrid(wb,n));
}
function extractCipl(wb){
  const sheets=resolveCiplSheets(wb);
  if(!sheets) throw new Error('CIPL tidak dikenali: tidak ada sheet yang memuat tabel invoice (Qty, Amount) atau packing list (Net Wt., Gross Wt.). Pastikan file adalah CIPL dan sheet-nya tidak tersembunyi.');
  return buildCipl(Object.assign({wb,extraGrids:otherSheetGrids(wb,sheets.sheetNames||[])},sheets));
}
// NOMOR IDENTITAS is text in a CEISA export ("0656319779061000000000"). A numeric cell is written out in full, never as 6.56E+20.
const WHOLE_NUMBER=new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:0});
function idText(v){
  if(typeof v==='number'&&Number.isFinite(v)) return WHOLE_NUMBER.format(v);
  return String(v??'').trim();
}
function extractDeclaration(wb){
  const type=detectDeclarationType(wb);
  const headerRows=sheetRows(wb,'HEADER'), entRows=sheetRows(wb,'ENTITAS'), docRows=sheetRows(wb,'DOKUMEN'), carrierRows=sheetRows(wb,'PENGANGKUT'), packRows=sheetRows(wb,'KEMASAN'), goodsRows=sheetRows(wb,'BARANG'), contRows=sheetRows(wb,'KONTAINER');
  if(!headerRows.length || !goodsRows.length) throw new Error('Draft harus memiliki minimal sheet HEADER dan BARANG CEISA.');

  const h={};
  if(headerRows.length>=2){const idx=makeHeaderMap(headerRows[0]);for(const k of Object.keys(idx))h[k]=headerRows[1][idx[k]]??'';}

  const entities=[];
  if(entRows.length>=2){const idx=makeHeaderMap(entRows[0]);for(const r of entRows.slice(1)){
    const code=getCell(r,idx,'KODE ENTITAS');
    if(!norm(code))continue;
    entities.push({code,name:getCell(r,idx,'NAMA ENTITAS'),address:getCell(r,idx,'ALAMAT ENTITAS'),country:getCell(r,idx,'KODE NEGARA'),
      id:idText(getCell(r,idx,'NOMOR IDENTITAS')),id_type:cleanText(getCell(r,idx,'KODE JENIS IDENTITAS'))});
  }}

  const documents=[];
  if(docRows.length>=2){const idx=makeHeaderMap(docRows[0]);for(const r of docRows.slice(1)){
    const number=getCell(r,idx,'NOMOR DOKUMEN');
    if(!norm(number))continue;
    documents.push({code:getCell(r,idx,'KODE DOKUMEN'),number,date:getCell(r,idx,'TANGGAL DOKUMEN')});
  }}

  const carrier={};
  if(carrierRows.length>=2){const idx=makeHeaderMap(carrierRows[0]);for(const k of Object.keys(idx))carrier[k]=carrierRows[1][idx[k]]??'';}
  const packing={}, packagesList=[];
  if(packRows.length>=2){
    const idx=makeHeaderMap(packRows[0]);
    for(const k of Object.keys(idx))packing[k]=packRows[1][idx[k]]??'';
    // a declaration with several kinds of package (3 PK + 1 PX) has one KEMASAN row per kind: the count is their sum
    for(const r of packRows.slice(1)){ const n=num(getCell(r,idx,'JUMLAH KEMASAN')); if(n!==null) packagesList.push({count:n,code:cleanText(getCell(r,idx,'KODE KEMASAN'))}); }
  }

  const items=[];
  if(goodsRows.length>=2){
    const idx=makeHeaderMap(goodsRows[0]);
    for(const r of goodsRows.slice(1)){
      const rawNo=getCell(r,idx,'SERI BARANG');
      if(!norm(rawNo))continue;
      const n=Number(rawNo);
      items.push({
        no:Number.isFinite(n)?n:rawNo,
        description:getCell(r,idx,'URAIAN'),
        type:getCell(r,idx,'TIPE'),
        brand:getCell(r,idx,'MEREK'),
        hs:getCell(r,idx,'HS'),
        qty:num(getCell(r,idx,'JUMLAH SATUAN')),
        unit:getCell(r,idx,'KODE SATUAN'),
        net:num(getCellAny(r,idx,['NETTO','NW','NET WEIGHT'])),
        gross:num(getCellAny(r,idx,['BRUTO','GW','GROSS WEIGHT'])),
        fob:num(getCell(r,idx,'FOB')),
        cif:num(getCell(r,idx,'CIF')),
        origin:getCell(r,idx,'KODE NEGARA ASAL')
      });
    }
  }

  // Weight totals = SUM OF THE BARANG SHEET (NETTO = NW, BRUTO = GW). HEADER NETTO/BRUTO is only a fallback for
  // when the BARANG column is empty or incomplete (CEISA drafts often leave BARANG.BRUTO blank).
  const sumBarang=key=>{const v=items.map(x=>x[key]);return (items.length && v.every(x=>x!==null&&x!==undefined))?round3(v.reduce((a,x)=>a+x,0)):null;};
  const netBarang=sumBarang('net'), grossBarang=sumBarang('gross');
  const netHeader=num(h['NETTO']), grossHeader=num(h['BRUTO']);
  const useNetBarang=netBarang!==null&&netBarang>0, useGrossBarang=grossBarang!==null&&grossBarang>0;

  // PEB drafts export CIF as 0 (the field is not used for exports). For non-FOB invoices the CIF equivalent is
  // FOB + FREIGHT + ASURANSI. Items carry no freight/insurance, so the add-on is spread equally per item
  // (this reproduces the real PEB: every item = invoice amount - 36.25 on a 290 add-on over 8 items).
  const fobH=num(h['FOB']), frH=num(h['FREIGHT'])??0, insH=num(h['ASURANSI'] ?? h['INSURANCE'])??0;
  let cifH=num(h['CIF']);
  let cifDerived=false;
  if((cifH===null||cifH===0) && fobH!==null){cifH=Math.round((fobH+frH+insH)*100)/100;cifDerived=true;}
  if(cifDerived && items.length){
    const add=(frH+insH)/items.length;
    items.forEach(it=>{if((it.cif===null||it.cif===0)&&it.fob!==null){it.cif=Math.round((it.fob+add)*100)/100;it.cif_derived=true;}});
  }

  return {
    type,
    office:h['KODE KANTOR']??'',
    office_export:h['KODE KANTOR EKSPOR']??'',
    office_unload:h['KODE KANTOR BONGKAR']??'',
    country_dest:h['KODE NEGARA TUJUAN']??'',
    port_loading:h['KODE PELABUHAN MUAT']??'',
    port_destination:h['KODE PELABUHAN TUJUAN']||(type==='PIB'?(h['KODE PELABUHAN BONGKAR']??''):''),
    port_destination_source:norm(h['KODE PELABUHAN TUJUAN'])?'TUJUAN':(type==='PIB'&&norm(h['KODE PELABUHAN BONGKAR'])?'BONGKAR':''),
    export_date:h['TANGGAL EKSPOR']??'',
    fob:num(h['FOB']),
    cif:cifH,
    cif_derived:cifDerived,
    freight:num(h['FREIGHT']),
    insurance:num(h['ASURANSI'] ?? h['INSURANCE']),
    net:useNetBarang?netBarang:netHeader,
    net_source:useNetBarang?'BARANG':(netHeader!==null?'HEADER':''),
    net_header:netHeader,
    gross:useGrossBarang?grossBarang:grossHeader,
    gross_source:useGrossBarang?'BARANG':(grossHeader!==null?'HEADER':''),
    gross_header:grossHeader,
    aju:h['NOMOR AJU']??'',
    aju_date:h['TANGGAL AJU']??'',
    ndpbm:num(h['NDPBM']),
    containers:contRows.length>=2?(()=>{const idx=makeHeaderMap(contRows[0]); return contRows.slice(1).map(r=>({number:cleanText(getCellAny(r,idx,['NOMOR KONTINER','NOMOR KONTAINER','NO KONTAINER'])),size:cleanText(getCellAny(r,idx,['KODE UKURAN KONTAINER','UKURAN KONTAINER'])),type:cleanText(getCellAny(r,idx,['KODE JENIS KONTAINER','KODE TIPE KONTAINER']))})).filter(x=>x.number);})():[],
    volume:num(h['VOLUME']),
    city:h['KOTA PERNYATAAN']??'',
    currency:h['KODE VALUTA']??'',
    incoterm:h['KODE INCOTERM']??'',
    packages_total:packagesList.length?packagesList.reduce((a,x)=>a+x.count,0):num(packing['JUMLAH KEMASAN']),
    packages_list:packagesList,
    entities,documents,carrier,packing,items
  };
}
function compareText(field,left,right,section='GENERAL',opts={}){
  const equal=opts.semantic==='port'
    ? portEquivalent(left,right)
    : norm(left)===norm(right);
  return {section,field,status:equal?'MATCH':'MISMATCH',severity:equal?'OK':'ERROR',cipl:left,pib:right,cipl_display:opts.leftMap?opts.leftMap(left):left,pib_display:opts.rightMap?opts.rightMap(right):right,expected_note:opts.note||''};
}
function compareNum(field,left,right,section='GENERAL',tol=.01){
  const ln=num(left),rn=num(right);
  const equal=ln!==null&&rn!==null?Math.abs(ln-rn)<=tol:norm(left)===norm(right);
  return {section,field,status:equal?'MATCH':'MISMATCH',severity:equal?'OK':'ERROR',cipl:left,pib:right,cipl_display:left,pib_display:right,numeric:true,diff:(ln!==null&&rn!==null)?round3(ln-rn):null};
}
// HS codes are compared on digits only ("3824.10-0000" = "3824100000"). CEISA holds 8 digits; a CIPL may print 6 (international HS) or
// the 10 digits of the exporter's own tariff. Equal on the first 8 digits (or on all digits of the shorter code, at least 6) is a match.
// When a code longer than 8 digits agrees only on the first 6, the two national tariffs may simply differ below that level: INFO, not an error.
function hsDigits(v){return String(v??'').replace(/\D/g,'');}
function compareHs(field,left,right,section='ITEM'){
  const base=compareText(field,left,right,section);
  const a=hsDigits(left), b=hsDigits(right);
  if(!a||!b) return base;
  const n=Math.min(a.length,b.length,8);
  if(a===b||(n>=6&&a.slice(0,n)===b.slice(0,n))){
    return {...base,status:'MATCH',severity:'OK',expected_note:norm(left)===norm(right)?'':`Dibandingkan ${n} digit pertama; tanda baca diabaikan.`};
  }
  if(Math.max(a.length,b.length)>8 && a.slice(0,6)===b.slice(0,6)){
    return {...base,status:'INFO',severity:'INFO',expected_note:'Enam digit pertama sama (HS internasional), digit berikutnya berbeda. Kode 10 digit negara asal bisa berbeda dari BTKI 8 digit: periksa manual.'};
  }
  return base;
}
// HS code of one item with the help of the host application. CIPLs usually print the international 6-digit code (or the exporter's own
// 10-digit code); CEISA needs the 8-digit Indonesian code (BTKI). Which 8 digits are right for the goods is known to the host (Shipment
// Schedule: its HS Code database, the linked schedule, earlier schedules), so `resolve(ciplItem, declItem)` may return:
//   {code:'84807190', source, label}      the 8-digit code of these goods (label = the name it was found under)
//   {candidates:['84807110','84807190'], source}   several 8-digit codes start with the CIPL's 6 digits; none is known for these goods
//   {none:true, source, label}             searched, nothing known
//   null                                   no opinion: compared as before (compareHs)
// A row may carry hs_learn {name, code}: the draft code of goods the database does not know yet, offered to be saved by the host.
const fmtHs=v=>{const d=hsDigits(v); return d.length===8?`${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6)}`:d.length===6?`${d.slice(0,4)}.${d.slice(4)}`:String(v||'');};
function hsCheckRow(field,c,d,resolve){
  const left=cleanText(c.hs), right=cleanText(d.hs);
  const a=hsDigits(left), b=hsDigits(right);
  const ref=typeof resolve==='function'?resolve(c,d):null;
  const name=cleanText(`${c.description||''} ${c.type||''}`);
  const row=(status,ciplDisp,note,extra)=>Object.assign({section:'ITEM',field,status,severity:status==='MISMATCH'?'ERROR':status==='INFO'?'INFO':'OK',cipl:left,pib:right,cipl_display:ciplDisp,pib_display:right||'—',expected_note:note},extra||{});
  if(!ref||(!ref.code&&!ref.candidates&&!ref.none)) return a?compareHs(field,left,right,'ITEM'):null;
  const src=ref.source||'Database HS Code';
  if(ref.code){
    const k=hsDigits(ref.code).slice(0,8);
    const notes=[`HS 8 digit untuk "${ref.label||name}" menurut ${src}: ${fmtHs(k)}.`];
    if(a&&a.length>=6&&a.slice(0,6)!==k.slice(0,6)) notes.push(`HS di CIPL (${left}) berbeda pada 6 digit pertama; periksa kembali dengan pemasok.`);
    else if(a&&a.length<8) notes.push(`CIPL hanya menulis ${a.length} digit (${left}); 2 digit terakhir dari ${src}.`);
    const disp=left?`${left} → ${fmtHs(k)}`:`${fmtHs(k)} (${src})`;
    if(!b) return row('MISMATCH',disp,notes.concat('HS di draft kosong.').join(' '),{hs_ref:ref});
    if(b.slice(0,8)===k){
      const conflict=a&&a.length>=6&&a.slice(0,6)!==k.slice(0,6);
      return row(conflict?'INFO':'MATCH',disp,notes.join(' '),{hs_ref:ref});
    }
    notes.push(`Draft berisi ${fmtHs(b)}.`);
    return row('MISMATCH',disp,notes.join(' '),{hs_ref:ref,diff_hs:true});
  }
  if(ref.candidates&&ref.candidates.length){
    const list=ref.candidates.map(x=>hsDigits(x).slice(0,8));
    const shown=list.map(fmtHs).join(', ');
    if(b&&list.includes(b.slice(0,8))) return row('MATCH',left||'—',`Kode draft termasuk ${list.length} kode 8 digit di ${src} yang cocok dengan HS CIPL (${shown}); barang ini sendiri belum tercatat.`,{hs_ref:ref,hs_learn:{name,code:b.slice(0,8)}});
    if(a&&b&&a.length>=6&&a.slice(0,6)===b.slice(0,6)) return row('INFO',left,`6 digit sama. Kode 8 digit draft (${fmtHs(b)}) belum tercatat di ${src}; kode yang ada: ${shown}.`,{hs_ref:ref,hs_learn:{name,code:b.slice(0,8)}});
    return a?compareHs(field,left,right,'ITEM'):null;
  }
  // nothing known about these goods
  if(!a){
    if(!b) return null;
    return row('INFO','Tidak tercantum',`CIPL tidak mencantumkan HS Code dan "${name}" belum ada di ${src}; HS draft tidak bisa diverifikasi.`,{hs_ref:ref,hs_learn:{name,code:b.slice(0,8)}});
  }
  const base=compareHs(field,left,right,'ITEM');
  if(base.status==='MATCH'&&a.length<8&&b.length>=8)
    return Object.assign(base,{status:'INFO',severity:'INFO',expected_note:`${a.length} digit pertama sama; ${8-Math.min(a.length,8)} digit terakhir draft (${fmtHs(b)}) belum bisa diverifikasi karena "${name}" belum ada di ${src}.`,hs_ref:ref,hs_learn:{name,code:b.slice(0,8)}});
  return base;
}
// Units are compared by meaning: KG = KGM, PCS = PCE, BOX = BX ... (CEISA uses UN/ECE codes, invoices use everyday abbreviations).
const UNIT_ALIASES={
  KG:'KGM',KGS:'KGM',KGM:'KGM',KILOGRAM:'KGM',KILOGRAMS:'KGM',
  G:'GRM',GR:'GRM',GRM:'GRM',GRAM:'GRM',GRAMS:'GRM',
  TON:'TNE',TONS:'TNE',TONNE:'TNE',TONNES:'TNE',TNE:'TNE',MT:'TNE',
  PC:'PCE',PCS:'PCE',PCE:'PCE',PIECE:'PCE',PIECES:'PCE',EA:'PCE',EACH:'PCE',NOS:'PCE',
  UNIT:'NIU',UNITS:'NIU',UNT:'NIU',NIU:'NIU',
  SET:'SET',SETS:'SET',
  M:'MTR',MTR:'MTR',METER:'MTR',METERS:'MTR',METRE:'MTR',METRES:'MTR',
  M2:'MTK',SQM:'MTK',MTK:'MTK',M3:'MTQ',CBM:'MTQ',MTQ:'MTQ',
  L:'LTR',LTR:'LTR',LITER:'LTR',LITERS:'LTR',LITRE:'LTR',LITRES:'LTR',
  ROLL:'ROL',ROLLS:'ROL',ROL:'ROL',
  PAIR:'PR',PAIRS:'PR',PR:'PR',PRS:'PR',
  DOZ:'DZN',DOZEN:'DZN',DZ:'DZN',DZN:'DZN',
  BOX:'BX',BOXES:'BX',BX:'BX',
  CARTON:'CT',CARTONS:'CT',CTN:'CT',CTNS:'CT',CT:'CT',
  PACKAGE:'PK',PACKAGES:'PK',PKG:'PK',PKGS:'PK',PK:'PK'
};
function canonUnit(v){const s=norm(v).replace(/\./g,''); return UNIT_ALIASES[s]||s;}
// Units that both count pieces but carry different codes (PCE for pieces, NIU for units of a machine): which one a declaration uses is a
// habit of the declarant, not a different quantity. Such a pair is INFO, never a mismatch.
const COUNT_UNITS=new Set(['PCE','NIU']);
function compareUnit(field,left,right,section='ITEM'){
  const a=canonUnit(left), b=canonUnit(right), eq=a===b;
  const row={section,field,status:eq?'MATCH':'MISMATCH',severity:eq?'OK':'ERROR',cipl:left,pib:right,cipl_display:left,pib_display:right,expected_note:eq&&norm(left)!==norm(right)?`${norm(left)} dan ${norm(right)} adalah satuan yang sama.`:''};
  if(!eq&&COUNT_UNITS.has(a)&&COUNT_UNITS.has(b)){ row.status='INFO'; row.severity='INFO'; row.expected_note=`${norm(left)} dan ${norm(right)} sama-sama satuan hitung (${a} / ${b}); periksa kode satuan yang lazim dipakai untuk barang ini.`; }
  return row;
}
// A header value the CIPL does not state at all cannot be compared: INFO with the draft's value, never a mismatch.
function ciplBlankInfo(section,field,draftValue,label){
  return {section,field,status:'INFO',severity:'INFO',cipl:'',pib:draftValue,cipl_display:'Tidak tercantum',pib_display:draftValue||'—',expected_note:`Tidak dibandingkan: CIPL tidak mencantumkan ${label}.`};
}
function compareEntity(field,ciplName,entities,entityCode,note=''){
  const code=norm(entityCode);
  const matches=entities.filter(x=>norm(x.code)===code && norm(x.name));
  const customsName=matches.length?matches.map(x=>x.name).join(' | '):'';
  const match=matches.some(x=>normName(x.name)===normName(ciplName));
  return {section:'ENTITY',field,status:match?'MATCH':'MISMATCH',severity:match?'OK':'ERROR',cipl:ciplName,pib:customsName||`(Entity Code ${entityCode} not found)`,cipl_display:ciplName,pib_display:customsName||`Entity Code ${entityCode} not found`,expected_note:`CEISA Entity Code ${entityCode}${note?`. ${note}`:''}`};
}
// TAX ID printed in the CIPL against NOMOR IDENTITAS of the same CEISA entity (sheet ENTITAS). Numbers are compared as digits only:
// the 16-digit NPWP of the CIPL equals the 22-digit number of CEISA (trailing zeros), and the 15-digit form (see taxIdEquivalent).
function compareTaxId(field,ciplId,entities,entityCodes,partyLabel){
  const codes=[].concat(entityCodes).map(norm);
  const left=taxIdDigits(ciplId);
  const drafts=entities.filter(x=>codes.includes(norm(x.code))).map(x=>taxIdDigits(x.id)).filter(Boolean);
  const hit=drafts.find(d=>taxIdEquivalent(left,d));
  const match=hit!==undefined;
  const shown=drafts.join(' | ');
  const notes=[`NOMOR IDENTITAS entitas ${[].concat(entityCodes).join('/')} dibandingkan dengan TAX ID ${partyLabel} di CIPL.`];
  if(!drafts.length) notes.push('NOMOR IDENTITAS kosong di draft.');
  else if(match && hit!==left) notes.push(hit.startsWith(left)||left.startsWith(hit)?'Nol di belakang (format 22 digit CEISA) diabaikan.':'NPWP 15 digit dan 16 digit (awalan 0) dianggap sama.');
  return {section:'ENTITY',field,status:match?'MATCH':'MISMATCH',severity:match?'OK':'ERROR',cipl:left,pib:shown,cipl_display:left,pib_display:shown,aligned:true,expected_note:notes.join(' ')};
}
// Draft documents are mapped by their CEISA document code (KODE DOKUMEN in sheet DOKUMEN), never by position or by guessing
// from the number: 380 = Commercial Invoice, 217 = Packing List. When several documents share a code, the one whose number
// equals the CIPL number is taken, otherwise the first.
const DOC_INVOICE='380', DOC_PACKING_LIST='217';
function findDocumentByCode(documents,code,ciplNumber){
  const pool=(documents||[]).filter(d=>norm(d.code)===code);
  return pool.find(d=>norm(d.number)===norm(ciplNumber)) || pool[0] || null;
}
/* ---- engine: e4_transport.js ---- */
/* ====================================================================================================================
 * BL / AWB (Master and House), transport mode, customs office
 * ==================================================================================================================== */
// Transport documents in sheet DOKUMEN. role: master, house, or generic (the code does not say which one it is).
const TRANSPORT_DOCS = {
  '704':{label:'Master Bill of Lading',role:'master',mode:'SEA'},
  '714':{label:'House Bill of Lading',role:'house',mode:'SEA'},
  '705':{label:'Bill of Lading',role:'generic',mode:'SEA'},
  '741':{label:'Master Air Waybill',role:'master',mode:'AIR'},
  '703':{label:'House Air Waybill',role:'house',mode:'AIR'},
  '740':{label:'Air Waybill (AWB)',role:'generic',mode:'AIR'}
};
const BL_ROLE_LABEL = {master:'Master',house:'House'};
const BL_SOURCE = 'Input manual';
function transportInfo(d){return TRANSPORT_DOCS[norm(d&&d.code)];}
// BL / AWB numbers are compared on letters and digits only: "180-1234 5675" = "18012345675".
function alnum(v){return String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');}

// Which draft document a typed Master or House number belongs to: a document with the code of that role (704 / 741 for Master, 714 / 703 for House);
// without one, a document whose code does not say which BL it is (705 B/L, 740 AWB). When the draft has only such documents and the typed number of the
// OTHER role already matches them, they are that other BL, and this role has no separate document ("claimed"): blank stays INFO, a typed value is MISMATCH.
// taken: the generic document the other role was already given; with several generic documents this role prefers another one.
function pickTransportDoc(documents,role,number,otherNumber,taken){
  const all=(documents||[]).filter(d=>transportInfo(d));
  const own=all.filter(d=>transportInfo(d).role===role);
  const gen=all.filter(d=>transportInfo(d).role==='generic');
  const other=all.filter(d=>{const r=transportInfo(d).role;return r!=='generic'&&r!==role;});
  const byNo=(list,x)=>alnum(x)?list.find(d=>alnum(d.number)===alnum(x)):undefined;
  if(own.length) return {doc:byNo(own,number)||own[0],kind:'own',other};
  if(gen.length){
    const hit=byNo(gen,number); if(hit) return {doc:hit,kind:'generic',other};
    const free=gen.filter(d=>!(alnum(otherNumber)&&alnum(d.number)===alnum(otherNumber)));
    if(!free.length) return {doc:null,kind:'claimed',claimed:gen[0],other};
    return {doc:free.find(d=>d!==taken)||free[0],kind:'generic',other};
  }
  return {doc:null,kind:'none',other};
}
function compareBl(field,left,right,note){
  const eq=alnum(left)!==''&&alnum(left)===alnum(right);
  const fmt=eq&&norm(left)!==norm(right)?'Tanda hubung, spasi, dan garis miring diabaikan.':'';
  return {section:'DOCUMENT',field,status:eq?'MATCH':'MISMATCH',severity:eq?'OK':'ERROR',cipl:left,pib:right,cipl_display:left,pib_display:right,expected_note:[note,fmt].filter(Boolean).join(' '),left_source:BL_SOURCE};
}

// Rows for the Master and House BL / AWB typed by the user (number and date each), and, for a PEB, the estimated export date.
// extra: {master_bl_no, master_bl_date, house_bl_no, house_bl_date}; bl_no / bl_date (the single pair of the earlier version) count as Master.
// Where a value came from is shown under it: typed by the user (default), or filled in by the application from the CIPL or from the
// linked schedule (extra.master_bl_no_source = 'Dari CIPL' ...).
function blChecks(decl,extra,isPeb){
  extra=extra||{};
  const rows=[];
  const srcOf=(role,what)=>extra[`${role}_bl_${what}_source`]||BL_SOURCE;
  const inp={
    master:{no:String(extra.master_bl_no??extra.bl_no??'').trim(),date:normalizeDate(extra.master_bl_date??extra.bl_date??'')},
    house:{no:String(extra.house_bl_no??'').trim(),date:normalizeDate(extra.house_bl_date??'')}
  };
  const dateFmt='Format tanggal disamakan (YYYY-MM-DD).';
  const blank=(field,left,right,why,note,src)=>({section:'DOCUMENT',field,status:'INFO',severity:'INFO',cipl:left,pib:right,cipl_display:left||'Belum diisi',pib_display:right||'Tidak ada di draft',expected_note:`Tidak dibandingkan: ${why}. ${note}`.trim(),left_source:src||BL_SOURCE});
  let taken=null;
  for(const role of ['master','house']){
    const other=role==='master'?'house':'master', R=BL_ROLE_LABEL[role], O=BL_ROLE_LABEL[other];
    const {doc,kind,claimed,other:otherDocs}=pickTransportDoc(decl.documents,role,inp[role].no,inp[other].no,taken);
    if(kind==='generic') taken=doc;
    let note;
    if(doc&&kind==='own') note=`CEISA kode dokumen ${norm(doc.code)} (${transportInfo(doc).label}).`;
    else if(doc) note=`CEISA kode dokumen ${norm(doc.code)} (${transportInfo(doc).label}); kode ini tidak membedakan Master dan House.`;
    else if(kind==='claimed'){
      note=`Draft hanya memuat dokumen kode ${norm(claimed.code)} (${transportInfo(claimed).label}) dan nomornya sudah cocok dengan ${O} BL / AWB; tidak ada dokumen ${R} terpisah.`;
    }else{
      const swapped=(otherDocs||[]).find(d=>alnum(d.number)===alnum(inp[role].no)&&alnum(inp[role].no));
      note=`Tidak ada dokumen ${R} (kode ${role==='master'?'704, 741':'714, 703'}) atau BL/AWB umum (kode 705, 740) di sheet DOKUMEN draft.`
        +(swapped?` Nomor ini tercatat di draft sebagai ${transportInfo(swapped).label} (kode ${norm(swapped.code)}).`:'');
    }
    const fNo=`${R} BL / AWB Number`, fDate=`${R} BL / AWB Date`;
    const no=inp[role].no, date=inp[role].date;
    const rightNo=doc?.number||'', rightDate=normalizeDate(doc?.date||'');
    if(no){ const r=compareBl(fNo,no,rightNo,note); r.left_source=srcOf(role,'no'); rows.push(r); }
    else rows.push(blank(fNo,'',rightNo,`nomor ${R} BL/AWB belum diisi`,note));
    if(date){const r=compareText(fDate,date,rightDate,'DOCUMENT'); r.expected_note=`${note} ${dateFmt}`; r.left_source=srcOf(role,'date'); rows.push(r);}
    else rows.push(blank(fDate,'',rightDate,`tanggal ${R} BL/AWB belum diisi`,note));
  }
  if(isPeb){
    // The estimated export date of a PEB (HEADER, TANGGAL EKSPOR) is the date of the BL / AWB. With both a Master and a House date it has to equal one of them.
    const exportDate=normalizeDate(decl.export_date||'');
    const exportNote='Perkiraan tanggal ekspor di HEADER (TANGGAL EKSPOR) harus sama dengan tanggal BL/AWB.';
    const given=['master','house'].filter(r=>inp[r].date).map(r=>({label:BL_ROLE_LABEL[r],date:inp[r].date}));
    if(!given.length){
      rows.push(blank('Estimated Export Date','',exportDate,'tanggal Master / House BL/AWB belum diisi',exportNote));
    }else{
      const hit=given.find(g=>g.date===exportDate);
      const dates=[...new Set(given.map(g=>g.date))];
      const r=compareText('Estimated Export Date',hit?hit.date:dates.join(' / '),exportDate,'DOCUMENT');
      const notes=[exportNote];
      if(given.length===2&&dates.length===2) notes.push(hit?`Tanggal Master (${given[0].date}) dan House (${given[1].date}) berbeda; tanggal ekspor sama dengan tanggal ${hit.label}.`:`Dibandingkan dengan tanggal Master (${given[0].date}) dan House (${given[1].date}).`);
      else notes.push(`Dibandingkan dengan tanggal ${given.map(g=>g.label).join(' dan ')} BL/AWB.`);
      notes.push(dateFmt);
      r.expected_note=notes.join(' '); r.left_source=BL_SOURCE; rows.push(r);
    }
  }
  return rows;
}

// Transport mode of the draft. Read from KODE CARA ANGKUT (sheet PENGANGKUT: 1 = laut, 4 = udara) and from the Indonesian end of the voyage
// (loading port of a PEB, unloading port of a PIB: an airport code such as IDCGK is air, IDTPP is sea). Only when neither says, from the BL / AWB
// document codes; when nothing says, sea (the office this app expected before the mode was read).
function resolveTransportMode(decl,isPeb){
  const sig=[];
  const cara=norm(decl.carrier&&decl.carrier['KODE CARA ANGKUT']);
  if(cara==='1') sig.push({mode:'SEA',text:'KODE CARA ANGKUT = 1 (laut)'});
  else if(cara==='4') sig.push({mode:'AIR',text:'KODE CARA ANGKUT = 4 (udara)'});
  const idPort=isPeb?decl.port_loading:decl.port_destination;
  const kind=placeKind(idPort);
  if(kind) sig.push({mode:kind,text:`kode pelabuhan ${norm(idPort)} (${kind==='AIR'?'bandara':'pelabuhan laut'})`});
  const modes=[...new Set(sig.map(s=>s.mode))];
  if(modes.length===1) return {mode:modes[0],conflict:false,assumed:false,text:`Dibaca dari ${sig.map(s=>s.text).join(' dan ')}.`};
  if(modes.length>1) return {mode:sig[0].mode,conflict:true,assumed:false,text:`Draft tidak konsisten: ${sig.map(s=>s.text).join(', tetapi ')}. Kode kantor mengikuti ${sig[0].text}.`};
  const dm=[...new Set((decl.documents||[]).map(d=>transportInfo(d)?.mode).filter(Boolean))];
  if(dm.length===1) return {mode:dm[0],conflict:false,assumed:false,text:`Dibaca dari jenis dokumen di sheet DOKUMEN (${dm[0]==='AIR'?'AWB':'B/L'}).`};
  return {mode:'SEA',conflict:false,assumed:true,text:'KODE CARA ANGKUT dan kode pelabuhan Indonesia tidak menentukan moda; dianggap laut (sea).'};
}
function modeCheck(info){
  const code=OFFICE_BY_MODE[info.mode], label=MODE_LABEL[info.mode];
  return {section:'TRANSPORT',field:'Transport Mode',status:info.conflict?'MISMATCH':'INFO',severity:info.conflict?'ERROR':'INFO',cipl:'',pib:label,cipl_display:info.conflict?'':'Tidak dibandingkan',pib_display:label,
    expected_note:`${info.text} Kantor yang diharapkan: ${code} = ${OFFICE_MASTER[code]} (laut 040300, udara 050100).`};
}
// Customs office: Tanjung Priok for sea, Soekarno-Hatta for air, import and export alike. The office fields differ: a PEB has KODE KANTOR and
// KODE KANTOR EKSPOR, a PIB has KODE KANTOR and KODE KANTOR BONGKAR.
function officeChecks(decl,info,isPeb){
  const code=OFFICE_BY_MODE[info.mode];
  const why=`Moda ${MODE_LABEL[info.mode]}: ${code} = ${OFFICE_MASTER[code]}.`;
  return [
    compareText('Kode Kantor',code,decl.office,'HEADER',{note:why}),
    isPeb?compareText('Kode Kantor Ekspor',code,decl.office_export,'HEADER',{note:`PEB. ${why}`})
         :compareText('Kode Kantor Bongkar',code,decl.office_unload,'HEADER',{note:`PIB. ${why}`})
  ];
}
// Vessel / voyage as written. An air shipment carries a flight number ("TW 155" in a CIPL, "TW155" in CEISA): there it is compared on letters and digits only,
// against carrier name + number, the number alone, or the name alone.
function vesselCheck(ciplText,carrier,info){
  const name=norm(carrier&&carrier['NAMA PENGANGKUT']), no=norm(carrier&&carrier['NOMOR PENGANGKUT']);
  const row=compareText('Vessel / Voyage',ciplText,`${name} ${no}`.trim(),'TRANSPORT');
  if(row.status!=='MATCH'&&info.mode==='AIR'&&alnum(ciplText)&&[`${name} ${no}`,no,name].some(x=>alnum(x)===alnum(ciplText))){
    row.status='MATCH'; row.severity='OK'; row.expected_note='Nomor penerbangan dibandingkan tanpa spasi dan tanda baca.';
  }
  return row;
}
// A port row: the CIPL text against the draft port code, with a note on how an airport code or a bare country was read.
function portCheck(field,ciplText,draftText){
  const row=compareText(field,ciplText,draftText,'HEADER',{semantic:'port',leftMap:canonicalPort,rightMap:canonicalPort});
  row.expected_note=portNote(ciplText,draftText,row.status==='MATCH');
  return row;
}
// Third-party invoicing: the invoice is issued by a Seller that is not the Shipper/Exporter who ships the goods.
function isThirdPartyInvoice(c){return !!(norm(c.seller)&&norm(c.exporter)&&normName(c.seller)!==normName(c.exporter));}
// Explains where a total came from, but only when it is not the plain "sum of items vs sum of BARANG" case.
function weightNotes(cipl,decl,k){ // k: 'net' | 'gross'
  const col=k==='net'?'NETTO':'BRUTO', lab=k==='net'?'NW':'GW', T='total_'+k, notes=[];
  if(cipl[T+'_source']==='PRINTED_TOTAL') notes.push(`Total ${lab} CIPL diambil dari baris TOTAL tercetak (${lab} per item tidak lengkap).`);
  else if(cipl[T+'_printed']!=null && cipl[T]!=null && Math.abs(cipl[T+'_printed']-cipl[T])>0.005) notes.push(`CIPL mencetak total ${lab} ${cipl[T+'_printed']}; jumlah ${lab} per item ${cipl[T]}.`);
  if(decl[k+'_source']==='HEADER') notes.push(`${col} di sheet BARANG kosong atau tidak lengkap; memakai ${col} di HEADER.`);
  else if(decl[k+'_source']==='BARANG' && decl[k+'_header']!=null && Math.abs(decl[k+'_header']-decl[k])>0.005) notes.push(`${col} di HEADER = ${decl[k+'_header']}; dipakai jumlah ${col} sheet BARANG.`);
  return notes.join(' ');
}
function runCheck(cipl,decl,extra={}){
  const checks=[];
  const isPeb=decl.type==='PEB';
  const rightLabel=isPeb?'PEB VALUE':'PIB VALUE';
  const invDoc=findDocumentByCode(decl.documents,DOC_INVOICE,cipl.invoice_no);
  const plDoc=findDocumentByCode(decl.documents,DOC_PACKING_LIST,cipl.packing_no);
  const docNote=(doc,code,label)=>doc?`CEISA kode dokumen ${code}`:`Dokumen kode ${code} (${label}) tidak ada di sheet DOKUMEN draft.`;
  const withNote=(row,...notes)=>{row.expected_note=notes.filter(Boolean).join(' ');return row;};
  const plFallback=cipl.packing_source==='INVOICE_FALLBACK'?'Sheet PL tidak mencantumkan nomor dan tanggal sendiri; dipakai nomor dan tanggal invoice dari CI.':'';
  const plNoDiffers=cipl.packing_source==='PL' && norm(cipl.packing_no) && norm(cipl.invoice_no) && norm(cipl.packing_no)!==norm(cipl.invoice_no)?`Nomor di sheet PL berbeda dengan nomor invoice di sheet CI (${cipl.invoice_no}).`:'';
  const plDateDiffers=cipl.packing_source==='PL' && cipl.packing_date && cipl.invoice_date && cipl.packing_date!==cipl.invoice_date?`Tanggal di sheet PL berbeda dengan tanggal invoice di sheet CI (${cipl.invoice_date}).`:'';

  // TAX ID of a party (NPWP), compared with NOMOR IDENTITAS of its CEISA entity. `required` is for the Indonesian parties (PEB exporter and
  // goods owner, PIB importer): CEISA always holds their number, so a blank one is a finding. Foreign parties normally have none in CEISA,
  // so for them a row appears only when both the CIPL and the draft state a number.
  const tax=cipl.tax_id||{};
  const pushTaxId=(field,ciplId,codes,partyLabel,required)=>{
    if(!taxIdDigits(ciplId)) return;
    const list=[].concat(codes).map(norm);
    const rows=decl.entities.filter(x=>list.includes(norm(x.code)));
    if(!rows.length) return;
    if(!required && !rows.some(x=>taxIdDigits(x.id))) return;
    checks.push(compareTaxId(field,ciplId,decl.entities,codes,partyLabel));
  };

  checks.push(withNote(compareText('Invoice Number',cipl.invoice_no,invDoc?.number||'','DOCUMENT'),docNote(invDoc,DOC_INVOICE,'Invoice')));
  checks.push(withNote(compareText('Invoice Date',cipl.invoice_date,normalizeDate(invDoc?.date||''),'DOCUMENT'),docNote(invDoc,DOC_INVOICE,'Invoice')));
  checks.push(withNote(compareText('Packing List Number',cipl.packing_no??'',plDoc?.number||'','DOCUMENT'),docNote(plDoc,DOC_PACKING_LIST,'Packing List'),plFallback,plNoDiffers));
  checks.push(withNote(compareText('Packing List Date',cipl.packing_date??'',normalizeDate(plDoc?.date||''),'DOCUMENT'),docNote(plDoc,DOC_PACKING_LIST,'Packing List'),plFallback,plDateDiffers));

  // Master and House BL / AWB typed by the user (number and date each); a PEB also checks the estimated export date against them.
  checks.push(...blChecks(decl,extra,isPeb));
  // PEB: the departure date printed in the CIPL ("Sailing on or about", "Departure date") against TANGGAL EKSPOR. Only an estimate in the
  // CIPL, so a different date is INFO, never a mismatch: TANGGAL EKSPOR follows the date of the BL / AWB (rows above).
  { const ed=normalizeDate(decl.export_date||'');
    if(isPeb&&cipl.etd&&isIsoDate(ed)){
      const eq=cipl.etd===ed;
      checks.push({section:'DOCUMENT',field:'Departure Date (CIPL)',status:eq?'MATCH':'INFO',severity:eq?'OK':'INFO',cipl:cipl.etd,pib:ed,cipl_display:cipl.etd,pib_display:ed,
        expected_note:eq?'Tanggal berangkat di CIPL sama dengan perkiraan tanggal ekspor (TANGGAL EKSPOR) di HEADER.':'Tanggal berangkat di CIPL hanya perkiraan; TANGGAL EKSPOR harus mengikuti tanggal BL/AWB. Periksa bila jadwal kapal berubah.'});
    } }
  if(isPeb){
    // Regular invoice:   Exporter (7) = Goods Owner (2) = CIPL Shipper/Exporter;  Buyer (6) = Consignee (8) = CIPL Consignee/Buyer.
    // Third-party invoice (CIPL Seller differs from Shipper): Exporter (7) = Goods Owner (2) = CIPL Shipper;
    //                     Buyer (6) = CIPL Seller;  Consignee (8) = CIPL Consignee (usually a different party from the buyer).
    const third=isThirdPartyInvoice(cipl);
    const names=code=>decl.entities.filter(x=>norm(x.code)===code && norm(x.name)).map(x=>x.name);
    const buyerDraft=names('6'), consDraft=names('8');
    const sameInDraft=(buyerDraft.length&&consDraft.length)?buyerDraft.some(a=>consDraft.some(b=>normName(a)===normName(b))):null;
    const draftPattern=sameInDraft===null?'Entitas 6 / 8 belum lengkap':(sameInDraft?'Pembeli (6) = Penerima (8)':'Pembeli (6) ≠ Penerima (8)');
    const typeNotes=[third
      ?`Seller (${cipl.seller}) berbeda dengan Shipper (${cipl.exporter}) di CIPL. Eksportir (7) = Pemilik Barang (2) = Shipper; Pembeli (6) = Seller; Penerima (8) = Consignee.`
      :'Tidak ada Seller yang berbeda dari Shipper di CIPL. Eksportir (7) = Pemilik Barang (2) = Shipper; Pembeli (6) = Penerima (8) = Consignee/Buyer.'];
    if(third&&sameInDraft===true) typeNotes.push('Draft mengisi Pembeli sama dengan Penerima, padahal CIPL third party.');
    if(!third&&sameInDraft===false) typeNotes.push('Draft mengisi Pembeli berbeda dengan Penerima, padahal CIPL invoice biasa.');
    checks.push({section:'ENTITY',field:'Invoice Type',status:'INFO',severity:'INFO',cipl:third?'Third party invoicing':'Invoice biasa',pib:draftPattern,cipl_display:third?'Third party invoicing':'Invoice biasa',pib_display:draftPattern,expected_note:typeNotes.join(' ')});
    // TAX ID rows follow the name row of the same entity. They appear only when the CIPL prints a TAX ID for that party, and never
    // twice for one problem (an entity missing from the draft is already reported by its name row).
    checks.push(compareEntity('Exporter / Shipper (Entity 7)',cipl.exporter,decl.entities,'7','Eksportir = Shipper/Exporter di CIPL.'));
    pushTaxId('Exporter Tax ID (Entity 7)',tax.exporter,'7','Shipper/Exporter',true);
    checks.push(compareEntity('Goods Owner (Entity 2)',cipl.exporter,decl.entities,'2','Pemilik barang = eksportir (Shipper/Exporter di CIPL).'));
    pushTaxId('Goods Owner Tax ID (Entity 2)',tax.exporter,'2','Shipper/Exporter',true);
    checks.push(compareEntity('Buyer (Entity 6)',third?cipl.seller:cipl.buyer,decl.entities,'6',third?'Third party: pembeli = Seller di CIPL.':'Invoice biasa: pembeli = Consignee/Buyer di CIPL.'));
    pushTaxId('Buyer Tax ID (Entity 6)',third?tax.seller:tax.buyer,'6',third?'Seller':'Consignee/Buyer',false);
    checks.push(compareEntity('Consignee (Entity 8)',cipl.buyer,decl.entities,'8',third?'Third party: penerima = Consignee di CIPL.':'Invoice biasa: penerima = Consignee/Buyer di CIPL.'));
    pushTaxId('Consignee Tax ID (Entity 8)',tax.buyer,'8','Consignee/Buyer',false);
  }else{
    // PIB: Entity 1 is the Indonesian importer/buyer in the supplied CEISA PIB structure.
    // Entity 9/10 are treated as supplier/seller candidates; both are accepted when CEISA duplicates the supplier.
    checks.push(compareEntity('Importer / Buyer (Entity 1)',cipl.buyer,decl.entities,'1'));
    pushTaxId('Importer Tax ID (Entity 1)',tax.buyer,'1','Consignee/Buyer',true);
    const supplierEntities=decl.entities.filter(x=>['9','10'].includes(norm(x.code)) && norm(x.name));
    const supplierNames=supplierEntities.map(x=>x.name).join(' | ');
    const supplierMatch=supplierEntities.some(x=>normName(x.name)===normName(cipl.seller));
    checks.push({section:'ENTITY',field:'Supplier / Seller (Entity 9/10)',status:supplierMatch?'MATCH':'MISMATCH',severity:supplierMatch?'OK':'ERROR',cipl:cipl.seller||'—',pib:supplierNames||'(Entity 9/10 not found)',cipl_display:cipl.seller||'—',pib_display:supplierNames||'(Entity 9/10 not found)',expected_note:'PIB mapping for current CEISA structure: Entity 1 = Importer/Buyer; Entity 9/10 = Supplier/Seller.'});
    pushTaxId('Supplier Tax ID (Entity 9/10)',tax.seller,['9','10'],'Seller',false);
  }

  // Customs office by transport mode (sea: Tanjung Priok, air: Soekarno-Hatta); PEB checks Kode Kantor Ekspor, PIB checks Kode Kantor Bongkar.
  const modeInfo=resolveTransportMode(decl,isPeb);
  checks.push(modeCheck(modeInfo));
  checks.push(...officeChecks(decl,modeInfo,isPeb));

  const expectedCountry=countryFromDestination(`${cipl.port_destination||''} ${cipl.final_destination||''}`);
  // A PIB has no country of destination (an import always ends in Indonesia): compared only when the draft states one.
  if(expectedCountry && (isPeb || norm(decl.country_dest))){
    checks.push(compareText('Country of Destination',expectedCountry,decl.country_dest,'HEADER',{semantic:'country',leftMap:x=>COUNTRY_MASTER[norm(x)]?.[0]||x,rightMap:x=>COUNTRY_MASTER[norm(x)]?.[0]||x}));
  }
  if(norm(cipl.port_loading)) checks.push(portCheck('Port of Loading',cipl.port_loading,decl.port_loading));
  else checks.push(ciplBlankInfo('HEADER','Port of Loading',canonicalPort(decl.port_loading)||decl.port_loading,'Port of Loading'));
  const destRow=portCheck('Port of Destination',cipl.port_destination||cipl.final_destination,decl.port_destination);
  if(decl.port_destination_source==='BONGKAR') destRow.expected_note=[destRow.expected_note,'KODE PELABUHAN TUJUAN kosong di draft PIB; dipakai KODE PELABUHAN BONGKAR.'].filter(Boolean).join(' ');
  checks.push(destRow);

  const carrierValue=`${decl.carrier['NAMA PENGANGKUT']||''} ${decl.carrier['NOMOR PENGANGKUT']||''}`.trim();
  if(norm(cipl.vessel)) checks.push(vesselCheck(cipl.vessel,decl.carrier,modeInfo));
  else{
    const r=ciplBlankInfo('TRANSPORT','Vessel / Voyage',carrierValue,'nama kapal dan voyage');
    const ph=cipl.placeholders&&cipl.placeholders.vessel; if(ph) r.expected_note+=` Kolom Vessel/Flight di CIPL berisi "${ph}".`;
    checks.push(r);
  }
  checks.push(compareText('Currency',cipl.currency,decl.currency,'VALUE'));
  checks.push(compareText('Incoterm',cipl.incoterm,decl.incoterm,'VALUE'));

  // Value basis follows the CIPL Incoterm.
  // FOB -> compare CIPL Amount with declaration FOB.
  // Any non-FOB term -> compare CIPL Amount with declaration CIF.
  // Unit Price is intentionally excluded.
  const term=norm(cipl.incoterm);
  const isFob=term==='FOB';
  const amountBasis=isFob?'FOB':'CIF';
  const totalDeclared=isFob?decl.fob:decl.cif;
  if(totalDeclared!==null && totalDeclared!==undefined){
    const tot=compareNum(`Total Amount / ${amountBasis}`,cipl.total_amount,totalDeclared,'VALUE');
    const notes=[];
    if(cipl.total_amount_source==='PRINTED_TOTAL') notes.push('Total CIPL diambil dari baris TOTAL tercetak (amount item tidak lengkap).');
    else if(cipl.total_amount_printed!=null && cipl.total_amount!=null && Math.abs(cipl.total_amount_printed-cipl.total_amount)>0.01) notes.push(`CIPL mencetak TOTAL ${cipl.total_amount_printed}; jumlah amount item ${cipl.total_amount}.`);
    if(!isFob && decl.cif_derived) notes.push('CIF PEB di CEISA = 0; dihitung dari FOB + Freight + Asuransi (per item: biaya tambahan dibagi rata).');
    if(notes.length) tot.expected_note=notes.join(' ');
    checks.push(tot);
  }else{
    checks.push({section:'VALUE',field:`Total Amount / ${amountBasis}`,status:'MISMATCH',severity:'ERROR',cipl:cipl.total_amount,pib:'Not found',cipl_display:cipl.total_amount,pib_display:'Not found',expected_note:`Incoterm ${cipl.incoterm||'(blank)'} requires declaration ${amountBasis}.`});
  }
  for(const w of (cipl.warnings||[])) checks.push({section:'CIPL',field:'Extraction warning',status:'INFO',severity:'INFO',cipl:w,pib:'—',cipl_display:w,pib_display:'—'});
  const netCheck=compareNum('Net Weight Total',cipl.total_net,decl.net,'WEIGHT');
  const netNote=weightNotes(cipl,decl,'net'); if(netNote) netCheck.expected_note=netNote;
  checks.push(netCheck);
  // Gross weight is checked ONLY in total, never per item.
  const grossCheck=compareNum('Gross Weight Total',cipl.total_gross,decl.gross,'WEIGHT');
  const grossNote=weightNotes(cipl,decl,'gross'); if(grossNote) grossCheck.expected_note=grossNote;
  checks.push(grossCheck);
  { const total=decl.packages_total!==undefined?decl.packages_total:decl.packing['JUMLAH KEMASAN'];
    const r=compareNum('Package Count',cipl.packages,total,'PACKING',0);
    if((decl.packages_list||[]).length>1) r.expected_note=`Jumlah semua baris sheet KEMASAN: ${decl.packages_list.map(x=>`${x.count} ${x.code}`.trim()).join(' + ')}.`;
    checks.push(r); }

  const declItems=new Map(decl.items.map(x=>[String(x.no),x]));
  for(const c of cipl.items){
    const d=declItems.get(String(c.no));
    if(!d){checks.push({section:'ITEM',field:`Item ${c.no} existence`,status:'MISMATCH',severity:'ERROR',cipl:c.no,pib:'Missing',cipl_display:c.no,pib_display:'Missing'});continue;}
    { const hr=hsCheckRow(`Item ${c.no} HS Code`,c,d,extra.hsResolve); if(hr) checks.push(hr); }
    if(norm(c.description))checks.push(compareText(`Item ${c.no} Description`,c.description,d.description,'ITEM'));
    if(norm(c.type))checks.push(compareText(`Item ${c.no} Type / Specification`,c.type,d.type,'ITEM'));
    if(norm(c.brand))checks.push(compareText(`Item ${c.no} Brand`,c.brand,d.brand,'ITEM'));
    if(c.qty!==null)checks.push(compareNum(`Item ${c.no} Quantity`,c.qty,d.qty,'ITEM',0));
    if(norm(c.unit))checks.push(compareUnit(`Item ${c.no} Unit`,c.unit,d.unit,'ITEM'));
    // IMPORTANT: Amount per item only. Unit price is intentionally NOT checked.
    const itemDeclared=isFob?d.fob:d.cif;
    if(itemDeclared!==null && itemDeclared!==undefined){
      checks.push(compareNum(`Item ${c.no} Amount / ${amountBasis}`,c.amount,itemDeclared,'ITEM'));
    }else{
      checks.push({section:'ITEM',field:`Item ${c.no} Amount / ${amountBasis}`,status:'MISMATCH',severity:'ERROR',cipl:c.amount,pib:'Not found',cipl_display:c.amount,pib_display:'Not found',expected_note:`Incoterm ${cipl.incoterm||'(blank)'} requires item ${amountBasis}.`});
    }
    checks.push(compareNum(`Item ${c.no} Net Weight`,c.net,d.net,'ITEM'));
  }
  const cNos=new Set(cipl.items.map(x=>String(x.no)));
  for(const d of decl.items){
    if(!cNos.has(String(d.no)))checks.push({section:'ITEM',field:`${isPeb?'PEB':'PIB'} Item ${d.no} not found in CIPL`,status:'MISMATCH',severity:'ERROR',cipl:'Missing',pib:d.description,cipl_display:'Missing',pib_display:d.description});
  }

  return summarize({type:isPeb?'PEB':'PIB',rightLabel,checks,cipl,decl});
}
// Verdict, counts and per-section summary of a result. Run again after the host adds rows of its own (Shipment Schedule: the linked
// schedule, the exchange rate, the masterlist), so the verdict always counts every row shown.
function summarize(res){
  const checks=res.checks||[];
  const mismatch=checks.filter(x=>x.status==='MISMATCH');
  const matches=checks.filter(x=>x.status==='MATCH');
  const sections={};
  checks.forEach(x=>{sections[x.section]??={match:0,mismatch:0,info:0,total:0};sections[x.section].total++;if(x.status==='MATCH')sections[x.section].match++;else if(x.status==='MISMATCH')sections[x.section].mismatch++;else if(x.status==='INFO')sections[x.section].info++});
  res.overall=mismatch.length===0?'PASS':(mismatch.length>=3?'FAIL':'REVIEW');
  res.summary={total:checks.length,matches:matches.length,mismatches:mismatch.length,infos:checks.filter(x=>x.status==='INFO').length};
  res.sections=sections;
  return res;
}
/* ---- engine: e3a_pdf_lines.js ---- */
/* ====================================================================================================================
 * PDF CIPL: positioned text -> chunks -> lines -> sections (invoice / packing list) -> grids -> the same readers as Excel
 * Nothing here assumes a currency, a unit or a column order: columns come from the geometry of the table header.
 * ==================================================================================================================== */
const medianOf=a=>{const s=a.filter(x=>Number.isFinite(x)).sort((p,q)=>p-q); return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):0;};
// Text items on one baseline that nearly touch are one piece of text (PDF producers split words arbitrarily); pieces that stand apart are
// separate cells. Returns lines top to bottom, each {y, h, chunks:[{text,x0,x1,y,h}]} left to right.
function pdfLinesOf(items){
  const its=[];
  for(const x of items||[]){
    const text=String(x.str??x.text??'').replace(/[   ]/g,' ');
    if(!text.trim()) continue;
    const x0=Number(x.x), y=Number(x.y), w=Number(x.w)||0, h=Number(x.h)||0;
    if(!Number.isFinite(x0)||!Number.isFinite(y)) continue;
    its.push({text,x0,x1:x0+w,y,h:h>0?h:0});
  }
  const med=medianOf(its.map(i=>i.h).filter(h=>h>1))||8;
  its.forEach(i=>{ if(!i.h) i.h=med; });
  its.sort((a,b)=>b.y-a.y||a.x0-b.x0);
  const tol=Math.max(1.2,med*0.35), groups=[];
  for(const it of its){
    const g=groups.find(z=>Math.abs(z.y-it.y)<=Math.max(tol,Math.min(it.h,z.h)*0.3));
    if(g){g.items.push(it); g.y=(g.y*(g.items.length-1)+it.y)/g.items.length; g.h=Math.max(g.h,it.h);} else groups.push({y:it.y,h:it.h,items:[it]});
  }
  groups.sort((a,b)=>b.y-a.y);
  const lines=[];
  for(const g of groups){
    g.items.sort((a,b)=>a.x0-b.x0);
    const chunks=[];
    for(const it of g.items){
      const last=chunks[chunks.length-1];
      const gap=last?it.x0-last.x1:0, hh=Math.max(it.h,last?last.h:0);
      if(last&&gap<hh*0.4&&gap>-hh){
        // the pieces of one number ("2" + "6,400.00", "1" + ".0") that nearly touch are joined without a space
        const digits=/\d$/.test(last.text)&&/^[\d.,]/.test(it.text)&&gap<hh*0.3;
        const sp=!digits&&gap>hh*0.12&&!/\s$/.test(last.text)&&!/^\s/.test(it.text)?' ':'';
        last.text+=sp+it.text; last.x1=Math.max(last.x1,it.x1); last.h=hh;
      } else chunks.push({text:it.text,x0:it.x0,x1:it.x1,y:g.y,h:it.h});
    }
    chunks.forEach(c=>{c.text=c.text.replace(/\s+/g,' ').trim();});
    const kept=chunks.filter(c=>c.text);
    if(kept.length) lines.push({y:g.y,h:g.h,chunks:kept});
  }
  return {lines,med};
}
/* ---------- sections: the invoice and the packing list, each over one or more pages ---------- */
function pdfTitleKind(line,med,isTop){
  const cs=line.chunks; if(cs.length>2) return '';
  const big=line.h>=med*1.25||isTop;
  if(!big) return '';
  // a title printed with wide letter spacing ("COMMERCIAL   INVOICE") comes out of the PDF as two pieces of text: read joined as well
  for(const title of [norm(cs[0].text),norm(cs.map(c=>c.text).join(' '))]){
    if(title.length>32) continue;
    if(isPlTitleText(title)) return 'PL';
    if(isCiTitleText(title)) return 'CI';
  }
  return '';
}
// Does a group of lines show part of a table (a header with several column titles, or a TOTAL line)?
const pdfShowsTable=ls=>ls.some(ln=>pdfIsTotalLine(ln)||new Set(ln.chunks.map(c=>colRoleOf(c.text)).filter(Boolean)).size>=3);
// pages: [{items:[{str,x,y,w,h}]}] -> [{kind:'CI'|'PL'|'', lines:[line...], med}]; a page without a title continues the section before it.
// Lines above the first title of a page (a letterhead with the seller's name and address) belong to the section that title opens, unless
// they show a piece of the table of the section before (the table continued from the previous page).
function pdfSections(pages){
  const all=pages.map(p=>pdfLinesOf(p.items));
  const med=medianOf(all.map(a=>a.med))||8;
  const secs=[]; let cur=null;
  all.forEach((pg,pi)=>{
    const kinds=pg.lines.map((ln,li)=>pdfTitleKind(ln,pg.med,li<4));
    const first=kinds.findIndex(k=>k);
    let carry=[];                                   // lines above the first title, waiting for the section that title opens
    pg.lines.forEach((ln,li)=>{
      const kind=kinds[li];
      if(kind){
        cur={kind,lines:carry,med:pg.med,pages:[pi]}; carry=[]; secs.push(cur); return;
      }
      const line=Object.assign({page:pi},ln);
      if(li<first){
        const pre=pg.lines.slice(0,first);
        if(!cur||!pdfShowsTable(pre)){ carry.push(line); return; }
      }
      if(!cur){ cur={kind:'',lines:[],med:pg.med,pages:[pi]}; secs.push(cur); }
      if(!cur.pages.includes(pi)) cur.pages.push(pi);
      cur.lines.push(line);
    });
  });
  return {secs:secs.filter(s=>s.lines.length),med};
}
/* ---- engine: e3b_pdf_grid.js ---- */
/* ---------- a section as a grid ---------- */
// Outside the item table, columns are the x positions where text starts (labels and the values under them start at the same x).
function clusterXs(xs,tol){
  const s=[...xs].sort((a,b)=>a-b), cl=[];
  for(const x of s){ const last=cl[cl.length-1]; if(last&&x-last.hi<=tol){last.hi=x;} else cl.push({lo:x,hi:x}); }
  return cl;
}
function nearestInterval(list,x){
  let best=0,bd=Infinity;
  list.forEach((c,i)=>{const d=x<c.lo?c.lo-x:x>c.hi?x-c.hi:0; if(d<bd){bd=d;best=i;}});
  return best;
}
const intervalGap=(a0,a1,b0,b1)=>a1<b0?b0-a1:(a0>b1?a0-b1:0);
// Header cells of the table whose header text is on line `hr`: the recognised headers of that line, plus headers written over two lines
// ("Sales" above "Unit"), which are joined when together they read as a header. Returns {cells, top, bottom} (line indexes of the band).
function pdfHeaderCells(lines,hr,med){
  const L=lines[hr];
  const pool=[];
  const add=(c,li)=>pool.push({text:c.text,x0:c.x0,x1:c.x1,y:c.y,h:c.h,line:li,top:li,role:colRoleOf(c.text),merged:false});
  L.chunks.forEach(c=>add(c,hr));
  const near=Math.max(1.35*med,3);
  for(let j=0;j<lines.length;j++){
    if(j===hr||Math.abs(lines[j].y-L.y)>near) continue;
    lines[j].chunks.forEach(c=>add(c,j));
  }
  // join vertical pairs: A above B, overlapping in x, whose joined text is a header of the same role as one of them (or of none)
  let changed=true;
  while(changed){
    changed=false;
    for(const A of pool) for(const B of pool){
      if(A===B||A.line>=B.line||B.y>=A.y||A.y-B.y>near*1.6) continue;
      const ov=Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0), w=Math.min(A.x1-A.x0,B.x1-B.x0);
      if(ov<w*0.4) continue;
      const text=A.text+' '+B.text, role=colRoleOf(text);
      if(!role||!(role===A.role||role===B.role||(!A.role&&!B.role))) continue;
      A.text=text; A.role=role; A.x0=Math.min(A.x0,B.x0); A.x1=Math.max(A.x1,B.x1); A.line=Math.max(A.line,B.line); A.top=Math.min(A.top,B.top); A.merged=true; A.y=B.y;
      pool.splice(pool.indexOf(B),1); changed=true; break;
    }
    if(changed) continue;
  }
  const cells=pool.filter(p=>p.role&&(p.line===hr||p.merged||Math.abs(lines[p.line].y-L.y)<=near));
  const bandLines=[].concat(...pool.filter(p=>p.merged||(p.role&&p.line!==hr)).map(p=>[p.top,p.line])).concat([hr]);
  return {cells:cells.sort((a,b)=>a.x0-b.x0),top:Math.min(...bandLines,hr),bottom:Math.max(...bandLines,hr)};
}
// Is this line the TOTAL line of the table (a chunk that starts with TOTAL, not SUB TOTAL)?
const pdfIsTotalLine=ln=>ln.chunks.some(c=>TOTAL_CELL_RE.test(c.text)&&!SUBTOTAL_CELL_RE.test(c.text));
const pdfHasNumber=ln=>ln.chunks.some(c=>numCell(c.text)!==null);
const pdfNoteLine=ln=>ln.chunks.some(c=>NOTE_RE.test(c.text)||/^[^:：]{1,30}[:：]\s*\S/.test(c.text));      // a note, a bank detail, a "label : value" caption
const pdfWideLine=(ln,wide)=>ln.chunks.some(c=>c.x1-c.x0>wide);
// The visual rows of a table body. A row of an invoice table is not always one line of text: a wrapped name takes two lines while the numbers
// of the row stand vertically centred between them (or on the first line). The line that carries the numbers is the anchor of its row; the
// text lines around it belong to it when they are closer to it than to the next row. Between two anchors the text lines are split at the largest
// vertical gap (the padding between two rows); text lines that look like notes, and lines that are not tight against an anchor, stay on their own.
// Returns [{lines:[line index top to bottom], anchor}].
function pdfVisualRows(lines,from,to,med,pageW){
  const wide=pageW*0.4, last=Math.min(to,lines.length-1);
  const isAnchor=i=>pdfHasNumber(lines[i])&&!pdfIsTotalLine(lines[i])&&!pdfWideLine(lines[i],wide);
  const ok=i=>!isAnchor(i)&&!pdfIsTotalLine(lines[i])&&!pdfNoteLine(lines[i])&&!pdfWideLine(lines[i],wide);
  const gap=(i,j)=>lines[i].page===lines[j].page?lines[i].y-lines[j].y:Infinity;             // line i is above line j
  const anchors=[]; for(let i=from;i<=last;i++) if(isAnchor(i)) anchors.push(i);
  const rows=anchors.map(a=>({anchor:a,above:[],below:[]}));
  const owner=new Map(); anchors.forEach((a,k)=>owner.set(a,k));
  const small=[];
  // 1. text lines between two anchors with a clear split (largest gap at least 1.5 times the next one)
  const pending=[];
  for(let k=0;k+1<anchors.length;k++){
    const a=anchors[k], b=anchors[k+1], s=[]; for(let i=a+1;i<b;i++) s.push(i);
    if(!s.length) continue;
    if(!s.every(ok)){ pending.push({k,s}); continue; }
    const seq=[a,...s,b], G=[]; for(let i=0;i+1<seq.length;i++) G.push(gap(seq[i],seq[i+1]));
    const order=G.map((g,i)=>[g,i]).sort((x,y)=>y[0]-x[0]);
    if(order[0][0]>=1.5*order[1][0]&&Number.isFinite(order[0][0])){
      const m=order[0][1];                                         // the padding gap: lines before it belong to a, after it to b
      s.forEach((i,j)=>{ if(j<m) rows[k].below.push(i); else rows[k+1].above.push(i); });
      G.forEach((g,i)=>{ if(i!==m) small.push(g); });
    }else pending.push({k,s,ambiguous:true});
  }
  const tight=(small.length?medianOf(small)*1.35:med*1.3);
  // 2. the other runs (before the first anchor, after the last, beside notes, or without a clear split): lines tight against an anchor
  const take=(list,from_,dir,rowIdx)=>{                            // dir +1: lines below anchor `from_`; -1: lines above it
    let prevI=from_;
    for(const i of list){
      if(!ok(i)||gap(dir>0?prevI:i,dir>0?i:prevI)>tight) break;
      (dir>0?rows[rowIdx].below:rows[rowIdx].above).push(i); prevI=i;
    }
  };
  if(anchors.length){
    const first=anchors[0], lastA=anchors[anchors.length-1];
    const pre=[]; for(let i=first-1;i>=from;i--) pre.push(i);   // nearest first
    take(pre,first,-1,0); rows[0].above.reverse();
    const tail=[]; for(let i=lastA+1;i<=last;i++) tail.push(i);
    take(tail,lastA,+1,anchors.length-1);
    for(const {k,s,ambiguous} of pending){
      const below=s.slice(), above=s.slice().reverse();
      if(ambiguous){
        // no clear padding: the lines continue the row above, as in a sheet (a continuation line directly under an item)
        take(below,anchors[k],+1,k);
      }else{
        take(below,anchors[k],+1,k);
        const used=new Set(rows[k].below);
        take(above.filter(i=>!used.has(i)),anchors[k+1],-1,k+1); rows[k+1].above.reverse();
      }
    }
  }
  return rows.map(r=>({anchor:r.anchor,lines:[...r.above,r.anchor,...r.below].sort((x,y)=>x-y)}));
}
// The columns of one table: from the lines of its visual rows (the rows that carry numbers, with the text lines around them), the x ranges
// that text occupies are merged into column groups; every group belongs to the header it overlaps (or is nearest to). Lines outside the
// visual rows (notes, bank details, TOTAL) take no part in this, so a long note can never join two columns.
function pdfColumnGroups(lines,vrows,headers,med,pageW){
  const G=Math.max(2.5,med*0.7), iv=[];
  for(const vr of vrows) for(const i of vr.lines) lines[i].chunks.forEach(c=>iv.push({x0:c.x0,x1:c.x1}));
  iv.sort((a,b)=>a.x0-b.x0);
  const groups=[];
  for(const c of iv){ const last=groups[groups.length-1]; if(last&&c.x0-last.x1<G){last.x1=Math.max(last.x1,c.x1);} else groups.push({x0:c.x0,x1:c.x1}); }
  const far=Math.max(40,pageW*0.12);
  for(const g of groups){
    let best=-1,bd=Infinity,bo=-1,bc=Infinity;
    headers.forEach((h,i)=>{
      const d=intervalGap(g.x0,g.x1,h.x0,h.x1), o=Math.max(0,Math.min(g.x1,h.x1)-Math.max(g.x0,h.x0)), cd=Math.abs((g.x0+g.x1)/2-(h.x0+h.x1)/2);
      if(d<bd||(d===bd&&(o>bo||(o===bo&&cd<bc)))){best=i;bd=d;bo=o;bc=cd;}
    });
    g.header=bd<=far?best:-1;
  }
  // position of each group among the groups of its header
  headers.forEach((h,i)=>{ groups.filter(g=>g.header===i).forEach((g,k)=>{g.local=Math.min(k,2);}); });
  return groups;
}
/* ---- engine: e3c_pdf_extract.js ---- */
// Turns the lines of one section into a grid. The first pass puts every chunk in the column of its x position and finds the tables by their
// headers; the second pass rebuilds the rows of each table in columns that follow the header geometry, so the table readers of the Excel
// path (header spans, TOTAL rows, notes, merged values) work unchanged.
function pdfSectionGrid(sec,name){
  const lines=sec.lines, med=sec.med||8;
  const all=[].concat(...lines.map(l=>l.chunks));
  const cl=clusterXs(all.map(c=>c.x0),Math.max(2.5,med*0.45)), nA=cl.length;
  const pageW=Math.max(1,Math.max(...all.map(c=>c.x1))-Math.min(...all.map(c=>c.x0)));
  const rowsA=lines.map(l=>{const r=new Array(nA).fill(''); l.chunks.forEach(c=>{const k=nearestInterval(cl,c.x0); r[k]=r[k]?r[k]+' '+c.text:c.text;}); return r;});
  const found=findTables(Object.assign({kind:'pdf',name,fmts:[],merges:[],hiddenRows:[]},{rows:rowsA}));
  // zones of the item tables
  const zones=[]; const roleBase=new Map(); let nextBase=nA+1;
  const baseOf=(role,k)=>{ const key=role+'#'+k; if(!roleBase.has(key)){roleBase.set(key,nextBase);nextBase+=3;} return roleBase.get(key); };
  for(const T of found){
    if(zones.some(z=>T.hr>=z.top&&T.hr<=z.end)) continue;
    const hc=pdfHeaderCells(lines,T.hr,med);
    if(new Set(hc.cells.map(c=>c.role)).size<3) continue;
    let end=lines.length-1, seenNumbers=false;
    const stop=nextTableRow(T,found);
    for(let i=hc.bottom+1;i<lines.length;i++){
      if(i>=stop){end=i-1;break;}
      if(pdfIsTotalLine(lines[i])&&seenNumbers){end=i;break;}
      if(pdfHasNumber(lines[i])) seenNumbers=true;
    }
    const seen={}; hc.cells.forEach(c=>{const k=seen[c.role]=(seen[c.role]||0)+1; c.base=baseOf(c.role,k-1);});
    const vrows=pdfVisualRows(lines,hc.bottom+1,end,med,pageW);
    zones.push({T,top:hc.top,bottom:hc.bottom,end,headers:hc.cells,vrows,groups:pdfColumnGroups(lines,vrows,hc.cells,med,pageW)});
  }
  const farBase=nextBase+3;
  const width=Math.max(nA,farBase+4);
  // rows, with a blank row where the vertical gap is larger than a normal line pitch (a blank row in a sheet)
  const dys=[]; for(let i=1;i<lines.length;i++) if(lines[i].page===lines[i-1].page){const d=lines[i-1].y-lines[i].y; if(d>med*0.6&&d<med*6) dys.push(d);}
  const pitch=medianOf(dys)||med*1.6;
  const rows=[], geo=[], merges=[], zoneOf=i=>zones.find(z=>i>=z.top&&i<=z.end);
  const vrOf=new Map(); zones.forEach(z=>z.vrows.forEach(vr=>vr.lines.forEach(i=>vrOf.set(i,vr))));
  const done=new Set(); let prevIdx=-1;
  lines.forEach((ln,i)=>{
    if(done.has(i)) return;
    const vr=vrOf.get(i), members=vr?vr.lines:[i];            // one grid row per visual row (the lines of a wrapped row go to one row)
    members.forEach(j=>done.add(j));
    if(prevIdx>=0){
      const prev=lines[prevIdx];
      let blanks=prev.page!==ln.page?1:(prev.y-ln.y>pitch*3.2?2:prev.y-ln.y>pitch*1.6?1:0);
      if(zoneOf(i)&&zoneOf(prevIdx)===zoneOf(i)&&prev.page===ln.page&&blanks>1) blanks=1;
      while(blanks-->0){ rows.push(new Array(width).fill('')); geo.push([]); }
    }
    prevIdx=members[members.length-1];
    const row=new Array(width).fill(''), gr=[];
    const put=(c,text,ch)=>{
      row[c]=row[c]?row[c]+' '+text:text;
      gr[c]=gr[c]?{x0:Math.min(gr[c].x0,ch.x0),x1:Math.max(gr[c].x1,ch.x1)}:{x0:ch.x0,x1:ch.x1};
    };
    const z=zoneOf(i);
    if(!z){ ln.chunks.forEach(c=>put(nearestInterval(cl,c.x0),c.text,c)); }
    else if(i>=z.top&&i<=z.bottom){
      // header band: all recognised headers (also those written over two lines) on the row of the main header line, each over the three
      // columns of its header; the other lines of the band stay empty
      if(i===z.T.hr) z.headers.forEach(h=>{ row[h.base]=h.text; gr[h.base]={x0:h.x0,x1:h.x1}; merges.push({r0:rows.length,c0:h.base,r1:rows.length,c1:h.base+2}); });
    }else{
      for(const j of members) lines[j].chunks.forEach(c=>{
        let gi=-1,bd=Infinity;
        z.groups.forEach((g,k)=>{const d=c.x0<g.x0?g.x0-c.x0:c.x0>g.x1?c.x0-g.x1:0; if(d<bd){bd=d;gi=k;}});
        if(gi<0){ put(farBase,c.text,c); return; }
        const g=z.groups[gi];
        if(g.header<0) put(farBase+1+(gi%3),c.text,c);
        else put(z.headers[g.header].base+g.local,c.text,c);
      });
    }
    rows.push(row); geo.push(gr);
  });
  // the geometry of the cells (x range of the text) lets a value that is centred or right-aligned under its label be found (see valueNear)
  rows.geo=geo; rows.isPdf=true;
  return {kind:'pdf',name,rows,fmts:[],merges,hiddenRows:[],tables:zones.length};
}
// pages: [{items:[{str,x,y,w,h}]}] -> {ci, pl, missingSide} grids, or null when the PDF has no text.
function pdfCiplGrids(pages){
  const {secs}=pdfSections(pages);
  if(!secs.length) return null;
  const kinds={CI:[],PL:[],'':[]}; secs.forEach(s=>kinds[s.kind].push(s));
  const mk=(list,name)=>list.length?pdfSectionGrid({lines:[].concat(...list.map(s=>s.lines)),med:medianOf(list.map(s=>s.med))||8},name):null;
  let ci=mk(kinds.CI,'CI'), pl=mk(kinds.PL,'PL'); const un=mk(kinds[''],'PDF');
  if(!ci&&!pl) return {ci:un,pl:un,missingSide:'',combined:true};
  if(!ci) return {ci:pl,pl,missingSide:'CI'};
  if(!pl) return {ci,pl:null,missingSide:'PL'};
  return {ci,pl,missingSide:''};
}
function extractCiplFromPdfPages(pages){
  const g=pdfCiplGrids(pages);
  if(!g||!g.ci) throw new Error('PDF tidak berisi teks yang bisa dibaca (kemungkinan hasil scan atau gambar). Gunakan file Excel, atau PDF yang dibuat langsung dari Excel/Word, bukan hasil scan.');
  return buildCipl({ci:g.ci,pl:g.pl,label:'PDF',sheetNames:[],wb:null,missingSide:g.missingSide});
}
// PDF.js document -> pages for extractCiplFromPdfPages: text items in page coordinates (rotation and scale applied, y upwards).
// `lib` is the PDF.js module (EXIM Checker: the global pdfjsLib; Shipment Schedule: the module it loads on demand).
async function pdfPagesFromDocument(pdf,lib){
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const vp=page.getViewport?page.getViewport({scale:1}):null;
    const canView=!!(vp&&lib&&lib.Util&&lib.Util.transform);
    const content=await page.getTextContent();
    const items=content.items.filter(it=>typeof it.str==='string').map(it=>{
      const tr=it.transform||[1,0,0,1,0,0];
      const mat=canView?lib.Util.transform(vp.transform,tr):null;           // viewport coordinates (y downwards), else the PDF's own (y upwards)
      return {str:String(it.str??''),x:mat?mat[4]:tr[4],y:mat?-mat[5]:tr[5],w:(it.width||0),h:Math.hypot((mat||tr)[2],(mat||tr)[3])||it.height||0};
    });
    pages.push({items});
  }
  return pages;
}
// Browser entry for a CIPL PDF.
async function extractCiplFromPdf(file,lib){
  lib=lib||root.pdfjsLib;
  if(!lib||!lib.getDocument) throw new Error('PDF.js gagal dimuat. Pastikan internet aktif.');
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await lib.getDocument({data}).promise;
  return extractCiplFromPdfPages(await pdfPagesFromDocument(pdf,lib));
}
// The CI and the PL in two files (an invoice PDF and a packing list PDF, or two workbooks) are read as ONE CIPL: the invoice side comes
// from the file that holds an invoice, the packing side from the other file. sources: [{wb, name} | {pages, name}], one or two.
function readCiplSources(sources){
  const list=(sources||[]).filter(Boolean);
  if(!list.length) throw new Error('Tidak ada berkas CIPL.');
  if(list.length===1) return list[0].wb?extractCipl(list[0].wb):extractCiplFromPdfPages(list[0].pages);
  const got=list.map(src=>{
    if(src.wb){
      const sh=resolveCiplSheets(src.wb); if(!sh) return null;
      return {name:src.name||'Excel',ci:sh.missingSide==='CI'?null:sh.ci,pl:sh.missingSide==='PL'?null:sh.pl,wb:src.wb,sheetNames:sh.sheetNames||[],extra:otherSheetGrids(src.wb,sh.sheetNames||[])};
    }
    const g=pdfCiplGrids(src.pages||[]); if(!g||!g.ci) return null;
    return {name:src.name||'PDF',ci:g.missingSide==='CI'?null:g.ci,pl:g.missingSide==='PL'?null:g.pl};
  }).filter(Boolean);
  if(!got.length) throw new Error('CIPL tidak dikenali di berkas yang dipilih.');
  const ciSrc=got.find(x=>x.ci)||null;
  const plSrc=got.find(x=>x.pl&&x!==ciSrc)||got.find(x=>x.pl)||null;
  const ci=ciSrc?ciSrc.ci:plSrc.pl, pl=plSrc?plSrc.pl:null;
  const label=[ciSrc?`${ciSrc.name} (CI)`:'',plSrc&&plSrc!==ciSrc?`${plSrc.name} (PL)`:''].filter(Boolean).join(' + ')||got[0].name;
  return buildCipl({ci,pl,label,wbs:got.filter(x=>x.wb).map(x=>({wb:x.wb,sheetNames:x.sheetNames})),missingSide:!ciSrc?'CI':!plSrc?'PL':'',extraGrids:[].concat(...got.map(x=>x.extra||[]))});
}
/* ====================================================================================================================
 * API
 * ==================================================================================================================== */
const API={
  version:'2026.10-tuned',
  XLSX_READ_OPTS, XLSX_DECL_READ_OPTS,
  // CIPL
  extractCipl, readCiplWorkbook:extractCipl, extractCiplFromPdfPages, extractCiplFromPdf, pdfPagesFromDocument, readCiplSources, buildCipl,
  resolveCiplSheets, excelGrid, findTables, pdfCiplGrids, parseDims,
  // draft PIB / PEB and the check
  extractDeclaration, detectDeclarationType, runCheck, summarize, blChecks,
  compareText, compareNum, compareUnit, compareHs, hsCheckRow, ciplBlankInfo,
  // shared rules
  normalizeDate, isIsoDate, norm, num, normName, alnum, hsDigits, fmtHs, canonUnit, taxIdEquivalent, labelCanon, colRoleOf, isKnownLabel,
  addPlaces, placeGroupOf, resolvePlace, portEquivalent, placeKind, canonicalPort, countryLabel, countryFromDestination,
  TRANSPORT_DOCS, OFFICE_MASTER, OFFICE_BY_MODE
};
root.EximEngine=API;
if(typeof module!=='undefined'&&module.exports) module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
