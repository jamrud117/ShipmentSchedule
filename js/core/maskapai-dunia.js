"use strict";

/* ==================================================================
   MASKAPAI DUNIA -- kode IATA dua karakter yang sedang dipegang
   maskapai, untuk deteksi dari No. Flight (KE627, LH 8400) dan saran
   di kotak Nama Pesawat. Ditambahkan SESUDAH daftar pilihan di
   carrier-master.js: kode yang sudah ada di sana tidak ditimpa
   (tambahMaskapaiDunia), dan entri di sini tidak punya alias -- yang
   dikenali kodenya & nama lengkapnya saja.

   Disusun sekali dari data terbuka, dibaca sebagai data (tidak ada kode
   pihak ketiga yang dijalankan):
     - penetapan kode IATA avcodes.co.uk (paket npm "aircodes" 1.3.16,
       MIT) -- PEMEGANG kode saat ini, bukan sejarahnya;
     - nama dagang Wikidata (paket "aviation-names", CC0) & "soaring-
       symbols" bila maskapainya sama -- "Air Asia Sen Bhd. t/a Air
       Asia" menjadi "AirAsia";
     - bentuk hukum dibuang (Ltd, S.A. de C.V., PT, JSC ...); penyedia
       sistem reservasi, kereta & bus yang ikut memegang kode IATA
       (1A Amadeus, 2H Thalys ...) tidak dimasukkan; maskapai yang sudah
       berhenti beroperasi sesudah 2023 (Bonza, Jetstar Asia, Lynx, Go
       First ...) dibuang.
   Satu baris = "KODE|Nama". Menambah / membetulkan maskapai penting
   cukup di carrier-master.js -- entri pilihan selalu menang.
================================================================== */
const MASKAPAI_DUNIA = `0C|Cobra Aviation
0E|North
0J|Premium Jet
1L|CitizenPlane
1X|Branson Air Express
2A|Air Astra
2B|Albawings
2C|CMA CGM Air Cargo
2D|Eastern Airlines
2E|Smokey Bay Air
2F|Azul Conecta
2G|Angara Airlines
2I|Star Perú
2J|Air Burkina
2K|Avianca Ecuador
2L|Helvetic Airways
2M|Maya Island Air
2N|SmartLynx Airlines Malta
2P|PAL Express
2Q|Air Cargo Carriers
2R|Sunlight Air
2S|Southwind Airlines
2U|Sun d'Or International Airlines
2W|World2Fly
2Z|Voepass Linhas Aéreas
3B|TICV
3C|Air Chathams
3F|FlyOne Armenia
3G|World Cargo Airlines
3H|Air Inuit
3J|Jubba Airways
3L|Air Arabia Abu Dhabi
3M|Silver Airways
3N|Air Urga
3O|Air Arabia Maroc
3P|World2Fly Portugal
3R|Divi Divi Air
3S|AeroLogic
3T|Tarco Aviation
3V|ASL Airlines Belgium
3W|Malawi Airlines
3X|Premier Trans Aire
3Z|Smartwings Polska
4A|Atsa Airlines
4B|Boutique Air
4C|LATAM Airlines Colombia
4D|Aerro Direkt
4E|Stabo Air
4F|Freedom Airlines Express
4G|Gazprom Avia
4H|Hi Air
4J|Jetair Caribbean
4L|Líneas Aéreas Suramericanas
4M|Mavi Gök Airlines
4N|Air North
4P|Regional Sky
4Q|25Only Aviation
4R|Star East Airline
4S|Red Sea Airlines
4T|Transwest Air
4W|Warbelow's Air Ventures
4X|Air Mercury
4Y|Discover Airlines
4Z|Airlink
5A|Alpine Aviation
5C|Challenge Airlines IL
5D|Aeroméxico Connect
5F|FlyOne
5G|Shirak Avia
5H|Five Fourty Aviation
5K|Hi Fly
5M|FlyMontserrat
5O|ASL Airlines France
5P|Panorama Airways
5Q|Holiday Europe
5R|RUTACA Airlines
5S|Global Aviation and Services Group
5T|Canadian North
5U|Transportes Aéreos Guatemaltecos
5V|Everts Air
5W|Wizz Air Abu Dhabi
5Z|CemAir
6A|Armenia Airways
6B|TUIfly Nordic
6D|Smartwings Slovensko
6G|Go2Sky
6H|Israir Airlines
6I|Air Alsie
6J|Solaseed Air
6M|Maximus Airlines
6N|Niger Airlines
6O|Orbest
6P|Pradhaan Air Express
6Q|Cham Wings Airlines
6R|ALROSA
6T|Longtail Aviation International
6W|FlyBosnia
6Y|SmartLynx Airlines
7A|Express Air Cargo
7B|Bees Airline
7E|Sylt Air
7G|StarFlyer
7H|Ravn Alaska
7I|Air Libya
7J|Tajik Air
7L|Silk Way West Airlines
7M|MAP Linhas Aéreas
7N|MetroJets
7O|Smartwings Hungary
7P|Air Panama
7R|RusLine
7S|Ryan Air
7T|Aero Express Del Ecuador Trans AM
7U|Commercial Aviation Services
7V|Federal Air
7W|Windrose Airlines
7Y|Mann Yadanarpon Airlines
7Z|Z Air
8A|Panama Airways
8C|Air Transport International
8D|FitsAir
8E|Bering Air
8F|STP Airways
8G|Aero Dili
8H|BH Air
8J|EcoJet
8N|Regional Air Services
8P|Pacific Coastal Airlines
8R|Amelia
8T|Air Tindi
8U|Afriqiyah Airways
8V|Wright Air Service
8W|Fly AllWays
8Y|Pan Pacific Airlines
8Z|Congo Airways
9A|GCA Airlines
9D|Genghis Khan Airlines
9E|Endeavor Air
9G|Sun PhuQuoc Airways
9H|Air Changan
9I|Alliance Air
9J|Dana Air
9K|Cape Air
9L|AirTanker Services
9M|Central Mountain Air
9N|Tropicair
9O|The Cargo Flights
9P|Fly Jinnah
9Q|Caicos Express Airways
9R|SATENA
9T|Air ACT
9V|Avior Airlines
9X|Southern Airways Express
9Y|National Airways
A0|BA EuroFlyer
A2|Anima Wings Aviation
A3|Aegean Airlines
A4|Azimuth
A5|Air France Hop
A6|Air Travel
A7|Calafia Airlines
A8|Aerolink Uganda
A9|Georgian Airways
AE|Mandarin Airlines
AG|Aruba Airlines
AH|Air Algérie
AJ|Aztec Worldwide Airlines
AN|Advanced Air
AO|Air Juan
AP|AlbaStar
AQ|9 Air
AW|Africa World Airlines
AX|Air X Charter
B0|La Compagnie
B2|Belavia
B3|Bhutan Airlines
B5|BBN Airlines
B9|Iran Airtour
BB|Seaborne Airlines
BC|Skymark Airlines
BD|Budget Lines
BF|French Bee
BH|Bismillah Airlines
BJ|Nouvelair
BM|Medsky Airways
BN|Luxwing
BO|Bluebird Nordic
BP|Air Botswana
BQ|Sky Alps
BS|US-Bangla Airlines
BT|airBaltic
BU|Compagnie Africaine d'Aviation
BW|Caribbean Airlines
BY|TUI Airways
BZ|Blue Bird Airways
C3|Trade Air
C4|Conquest Air
C5|CommuteAir
C6|My Freighter Airlines
C7|Cinnamon Air
C8|Cargolux Italia
C9|Cronos Airlines Benin
CB|Trans Caribbean Air Export Import
CC|Air Atlanta Icelandic
CD|Corendon Dutch Airlines
CE|Chalair Aviation
CG|PNG Air
CH|Bemidji Airlines
CJ|BA CityFlyer
CL|Lufthansa CityLine
CN|Grand China Air
CO|North-Western Cargo International Airlines
CP|Aliscargo Airlines
CQ|Coastal Aviation
CR|UBM Aviation
CS|Comlux Aruba
CU|Cubana de Aviación
CW|SkyWest Charter
CY|Cyprus Airways
D2|Severstal Air
D3|Daallo Airlines
D4|Geo Sky
D5|DHL Aero Expreso
D6|GECA
D8|Norwegian Air Sweden
D9|Daallo Airlines (Somalia)
DB|Maleth
DD|Nok Air
DE|Condor
DG|Cebgo
DH|Norwegian Air Norway
DI|Marabu Airlines
DJ|Air Djibouti
DK|Sunclass Airlines
DM|Arajet
DN|Norwegian Air Argentina
DO|Sky High Aviation Services
DQ|Alexandria Airlines
DR|Ruili Airlines
DS|EasyJet Switzerland
DT|TAAG Angola Airlines
DU|Sky Jet M.G
DV|SCAT Airlines
DX|Danish Air Transport
DY|Norwegian Air Shuttle
E2|Eurowings Europe
E4|Enter Air
E5|Air Arabia Egypt
E6|Bringer Air Cargo Taxi Aereo
E7|Equaflight
E9|Evelop Airlines
EA|Emerald Airlines (Ireland)
EB|Wamos Air
EC|easyJet Europe
ED|AirExplore
EE|Xfly
EF|Aerolinea del Caribe
EG|Aer Lingus UK
EH|ANA Wings
EL|Ariella
EM|Empire Airlines
EN|Air Dolomiti
EO|Pegas Fly
EP|Iran Aseman Airlines
ER|Serene Air
ES|Estelar
EW|Eurowings
EX|Regional Express Americas
EZ|Sun Air of Scandinavia
F0|Fly Jordan
F2|Safarilink Aviation
F3|Flyadeal
F4|Air Flamenco
F5|Aerotranscargo
F6|Fly2Sky
F7|The Airline iFly
F8|Flair Airlines
F9|Frontier Airlines
FA|Safair
FB|Bulgaria Air
FC|Link Airways
FE|Seven Four Eight Air Services
FG|Ariana Afghan Airlines
FH|Freebird Airlines
FI|Icelandair
FK|Kelowna Flightcraft Air Charter
FL|Fly Lili
FN|fastjet Zimbabwe
FO|Flybondi
FP|FlyPelican
FS|Air Falcon
FT|Flyegypt
FU|Fuzhou Airlines
FW|Ibex Airlines
FY|Firefly
G0|Allanza Glancelot
G2|GullivAir
G4|Allegiant Air
G6|Fly Arna
G7|GoJet Airlines
GD|Aviair
GE|Global Aviation Operations
GG|Sky Lease Cargo
GH|Georgian Airlines
GI|Air Central
GL|Air Greenland
GO|ULS Airlines Cargo
GP|APG Airlines
GQ|Sky Express
GR|Aurigny Air Services
GT|Air Guilin
GU|Aviateca
GV|Grant Aviation
GW|Costa Rica Green Airways
GY|Colorful Guizhou Airlines
GZ|Air Rarotonga
H2|Sky Airline
H3|HelloJets
H4|HiSky Europe
H6|European Air Charter
H7|CA HiSky
H8|Sky Airline Peru
H9|Himalaya Airlines
HA|Hawaiian Airlines
HB|Greater Bay Airlines
HC|Air Senegal
HD|Air Do
HF|Air Côte d'Ivoire
HG|Hala Air
HH|Qanot Sharq
HI|Papillon Airways
HJ|Tasman Cargo Airlines
HK|Skippers Aviation
HM|Air Seychelles
HN|Equinoxair
HP|Amapola Flyg
HQ|Compass Cargo Airlines
HR|Hahn Air
HS|Heli Securite Helicopter Airline
HT|Tianjin Air Cargo
HV|Transavia
HW|North-Wright Airways
I2|Iberia Express
I3|innoAviation
I4|Island Air Express
I7|IndiaOne Air
I8|Izhavia
I9|Central Airlines
IA|Iraqi Airways
IE|Solomon Airlines
IF|Fly Baghdad
IH|Southern Sky Airlines
II|IBC Airways
IJ|Spring Airlines Japan
IK|Air Kiribati
IL|Trigana Air Service
IM|Jupiter Jet
IO|IrAero
IP|Pelita Air Service
IQ|Qazaq Air
IR|Iran Air
IS|Sepehran Airlines
IV|GP Aviation
IX|Air India Express
IY|Yemenia
IZ|Arkia
J0|Buffalo Airways
J2|Azerbaijan Airlines
J3|Northwestern Air
J4|Badr Airlines
J5|Alaska Seaplanes
J7|Afrijet
J8|Berjaya Air
J9|Jazeera Airways
JA|JetSmart
JC|Japan Air Commuter
JE|Mango
JF|OTT Airlines
JG|Jiangsu Jingdong Cargo Airlines
JH|Fuji Dream Airlines
JI|Armenian Airlines
JJ|LATAM Airlines Brasil
JK|AerCaribe
JM|Jambojet
JN|Alaska Air Transit
JO|Royal Wings
JR|Joy Air
JS|Air Koryo
JU|Air Serbia
JV|Bearskin Airlines
JY|InterCaribbean Airways
JZ|jetSMART Airlines Peru
K2|Airlift Alaska
K3|SAC
K5|Kalitta Charters II
K7|Air KBZ
K8|InterJet West
K9|Kalitta Charters
KB|Druk Air
KD|Western Global Airlines
KG|Key Lime Air
KH|Aloha Air Cargo
KI|SKS Airways
KK|Leav Aviation
KM|KM Malta Airlines
KO|Komiaviatrans
KP|Asky Airlines
KR|Cambodia Airways
KS|Air Connect Aviation Group
KT|AirAsia Cambodia
KV|KrasAvia
KW|AeroStan
KX|Cayman Airways
L1|Searcharter
L2|Lynden Air Cargo
L3|DHL de Guatemala
L5|Red Air
L6|Mauritania Airlines
L7|LATAM Cargo Colombia
L8|Lulutai Airlines
L9|Lumiwings
LB|Bul Air
LC|La Costeña
LF|Contour Airlines
LI|ETF Airways
LK|Lao Air
LL|Level
LM|Loganair
LN|Libyan Airlines
LP|LATAM Airlines Perú
LQ|Lanmei Airlines
LR|Avianca Costa Rica
LS|Jet2.com
LT|LongJiang Airlines
LU|LATAM Express
LV|Airzena
LW|Lauda Europe
LZ|Air Link
M0|Aero Mongolia
M2|MHS Aviation
M3|LATAM Cargo Brasil
M4|Poste Air Cargo
M5|Kenmore Air
M7|MasAir
M8|Skyjet
M9|Motor Sich Airlines
MA|MAE Aircraft Management
MC|Air Mobility Command (AMC)
MD|Air Madagascar
ME|Middle East Airlines - Air Liban
MG|Eznis Airways
MI|Freebird Airlines Europe
MJ|MyWay Airlines
MK|Air Mauritius
ML|Sky Mali
MO|Calm Air
MP|Martinair
MQ|Envoy Air
MR|Hunnu Air
MT|Malta MedAir
MV|Air Mediterranean
MW|Waltzing Matilda Aviation
MX|Breeze Airways
MY|MASwings
MZ|Amakusa Airlines
N0|Norse Atlantic Airways
N2|Aero Contractors Company of Nigeria
N3|Veula El Salvador
N5|Nolinor Aviation
N6|TCA
N7|Nordic Regional Airlines
N8|National Airlines
N9|Shree Airlines
NA|Nesma Airlines
NB|Berniq Airways
ND|Nordica
NE|Nesma Airlines
NF|Air Vanuatu
NG|Novair
NI|Portugália
NJ|Romcargo Airlines
NK|Spirit Airlines
NL|Amelia International
NM|Air Moana
NO|Niger Air Cargo
NP|Nile Air
NQ|Air Japan
NR|Manta Aviation
NS|Hebei Airlines
NT|Binter Canarias
NU|Japan Transocean Air
NV|Karun Airlines
NX|Air Macau
O4|Andes Lineas Aereas
O7|Omni
O8|Marathon Airlines
OA|Olympic Air
OB|Boliviana de Aviación
OC|Oriental Air Bridge
OE|Fly One Airlines
OF|Overland Airways
OG|Fly Play
OH|PSA Airlines
OI|Hinterland Aviation
OJ|Nyxair
OL|Samoa Airways
OM|MIAT Mongolian Airlines
ON|Nauru Airlines
OO|SkyWest Airlines
OP|Passion Air
OR|TUI fly Netherlands
OU|Croatia Airlines
OV|SalamAir
OW|Skyward Airlines
OY|Omni Air Express
P0|Proflight Commuter Services
P2|Airkenya Express
P3|Porter Airlines
P4|Air Peace
P5|Wingo
P6|Privilege Style
P8|SprintAir
P9|Palau Express Airlines
PA|Airblue
PB|PAL Airlines
PD|Porter Airlines
PE|People's
PF|AirSial
PH|Pionair Australia
PI|Polar Airlines
PJ|Air Saint-Pierre
PL|Southern Air Charter
PM|Canaryfly
PN|West Air
PP|Jet Aviation
PQ|SkyUp
PS|Ukraine International Airlines
PT|Piedmont Airlines
PU|Plus Ultra Líneas Aéreas
PV|Saint Barth Commuter
PW|Precision Air
PY|Surinam Airways
PZ|LATAM Airlines Paraguay
Q2|Maldivian
Q3|Anguilla Air Services
Q4|Euroairlines
Q5|40-Mile Air
Q6|Volaris Costa Rica
Q7|DHL Air (Austria)
Q8|Trans Air Congo
Q9|Green Africa Airways
QA|Queen Bilqis Airways
QB|Qeshm Air
QC|Camair-Co
QE|Express Freighters Australia
QI|Ibom Airlines
QK|Jazz Aviation
QL|LASER Airlines
QM|Monacair
QN|Skytrans Airlines
QO|Quikjet Airlines
QP|Akasa Air
QQ|Alliance Airlines
QS|Smartwings
QT|Avianca Cargo
QU|Skyline Express Airlines
QX|Horizon Air
R0|Harbour Air Seaplanes
R2|Groupe Transair
R4|Rano Air
R5|Jordan Aviation
R6|DAT
R8|RIMA Rio Madeira Aerotáxi
R9|transair Express
RA|Nepal Airlines
RB|Syrian Air
RC|Atlantic Airways
RD|Sky Cana
RE|Airhub Airlines
RF|Aero K
RG|Rotana Jet
RH|Hong Kong Air Cargo
RI|Rimbun Air
RK|Ryanair UK
RL|Royal Flight Airlines
RM|Air Dilijans
RN|Royal Eswatini National Airways
RO|TAROM
RP|Budapest Aircraft Service
RQ|Kam Air
RR|BUZZ
RT|UVT Aero
RV|Air Canada Rouge
RW|Royal Air Philippines
RX|Riyadh Air
RY|Jiangxi Air
RZ|SANSA
S0|Aerolineas Sosa
S2|Serve Air Cargo
S3|SATCO
S4|Azores Airlines
S5|Star Air
S6|Sunrise Airways
S8|Sounds Air Travel & Tourism
S9|FlyBig
SB|Aircalin
SD|Sudan Airways
SE|European Cargo
SF|Tassili Airlines
SH|Sharp Airlines
SI|Blue Islands
SM|Air Cairo
SO|Sun Air
SP|SATA Air Açores
SR|Sundair
SS|Corsair International
ST|Air Thanlwin
SX|flyGTA
SY|Sun Country Airlines
SZ|Somon Air
T2|TUM AeroCarga de Mexico
T3|Eastern Airways
T4|Transair
T5|Turkmenistan Airlines
T6|AirSWIFT
T7|Twin Jet
T8|CA Terra Avia
T9|Turpial Airlines
TA|Transafrican Air
TB|TUI fly Belgium
TC|Air Tanzania
TD|Tbilisi Airways
TE|Skytaxi
TF|Braathens Regional Airways
TH|Raya Airways
TI|Tropic Ocean Airways
TJ|Tradewind Aviation
TL|Airnorth
TM|LAM Mozambique Airlines
TN|Air Tahiti Nui
TO|Transavia France
TQ|Tailwind Air
TS|Air Transat
TT|Braathens International Airways
TU|Tunisair
TV|Tibet Airlines
TX|Air Caraïbes
TY|Air Calédonie
TZ|Tsaradia
U3|Sky Gates Airlines
U4|Buddha Air
U5|SkyUp MT
U7|UniWorld Air Cargo
U8|Tus Airways
UB|Myanmar National Airlines
UC|LATAM Cargo Chile
UD|UR Airlines
UE|Ultimate Air Shuttle
UF|Petroleum Air Services
UG|Tunisair Express
UH|Jet Exchange
UI|Auric Air
UJ|AlMasria Universal Airlines
UM|Air Zimbabwe
UN|Business Aviation Asia
UP|Bahamasair
UQ|Urumqi Air
UR|Uganda Airlines
UU|Air Austral
UV|Air Universal
UX|Air Europa
UZ|Buraq Air
V0|Conviasa
V2|Avialeasing Aviation
V3|Carpatair
V4|Vensecar Internacional
V5|Aerovías DAP
V7|Volotea
V8|ATRAN
V9|Van Air Europe
VC|Via Airlines
VE|EasyFly
VF|Fly Armenia Airways
VK|ValueJet
VM|Max Air
VO|Universal Air Charter and Management
VP|FlyMe
VQ|NovoAir
VR|Cabo Verde Airlines
VT|Air Tahiti
VY|Vueling
VZ|Thai Vietjet Air
W2|Flexflight
W3|Arik Air
W4|Wizz Air Malta
W5|Mahan Air
W8|Cargojet
W9|Wizz Air UK
WA|KLM Cityhopper
WB|RwandAir
WC|Avianca Honduras
WD|Modern Logistics
WF|Widerøe
WG|Sunwing Airlines
WH|Wingo
WI|White Airways
WJ|JetSmart Airlines
WK|Edelweiss Air
WL|World Atlantic Airlines
WM|Winair
WP|Wasaya Airways
WQ|Swift Air
WR|WestJet Encore
WT|Swiftair
WU|Western Air
WV|Westair Aviation
WW|Kargo Xpress
WX|CityJet
X3|TUIfly
X4|Alaska Seaplanes
X5|Air Europa Express
X6|Challenge Air Cargo
X7|Challenge Airlines (BE)
X8|Airmax
X9|Avion Express
XC|Corendon Airlines
XE|JSX Air
XF|Mongolian Airways Cargo
XJ|Thai AirAsia X
XK|Air Corsica
XL|LATAM Airlines Ecuador
XM|Zimex Aviation
XN|Manasik Aviation
XO|South East Asian Airlines (Seair) International
XP|Avelo Airlines
XQ|SunExpress
XR|Corendon Airlines Europe
XT|GloBus
XU|African Express Airways
XY|Flynas
XZ|Aeroitalia
Y2|Air Century
Y3|Syphax Airlines
Y6|AB Aviation
YB|Harbour Air
YC|Yamal Airlines
YD|Synergy Aviation
YE|Yanair
YH|Sunsplash Aviation
YI|Fly OYA
YJ|Asian Express General Aviation Wuxi
YK|Avia Traffic
YL|Libyan Wings
YN|Air Creebec
YO|Heli Air Monaco
YQ|TAR Aerolineas
YR|Grand Canyon Airlines
YS|Flightlink
YT|Yeti Airlines
YU|EuroAtlantic Airways
YV|Mesa Airlines
YW|Air Nostrum
YX|Republic Airways
Z0|Norse Atlantic UK
Z7|CAMEX Airlines
Z8|Línea Aérea Amaszonas
ZA|Sky Angkor Airlines
ZB|Air Albania
ZD|Ewa Air
ZG|ZIPAIR Tokyo
ZK|Zetavia
ZL|Regional Express
ZM|Air Manas
ZN|Zambia Airways
ZO|Colorful Yunnan Airlines
ZP|Paranair
ZQ|German Airways
ZR|Aviacon Zitotrans
ZS|Solinair
ZT|Titan Airways
ZU|Azman Air Services
ZV|V Air
ZW|Air Wisconsin
ZX|Pivot Airlines`;
