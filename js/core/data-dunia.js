"use strict";

/* ==================================================================
   DATA REFERENSI DUNIA -- seluruh bandara berkode IATA (±5.300) &
   pelabuhan UN/LOCODE (±17.500), di assets/data/dunia.json.

   Daftar kurasi unlocode.js (±190 pelabuhan & bandara langganan DDI,
   lengkap dengan alias & pelabuhan induk) TETAP dicari lebih dulu; data
   dunia hanya CADANGAN untuk yang tidak ada di sana. Santos, Durban,
   Mersin, JFK, BRSSZ jadi dikenali kode, nama & NEGARA-nya: aturan rute
   per negara ikut berlaku dan riwayat rutenya bisa dipelajari (dulu
   "asal tidak dikenali" + aturan cadangan).

   TIDAK MEMBERATKAN: berkasnya ±1 MB (±360 KB terkompres GitHub Pages)
   dan TIDAK ikut dimuat saat aplikasi dibuka. Ia diambil hanya bila ada
   jadwal yang pelabuhannya tidak dikenali daftar kurasi (diperiksa saat
   senggang sesudah papan tergambar) atau saat kotak pelabuhan/bandara
   disentuh, lalu disimpan cache peramban. Kode dicari lewat indeks Map;
   saran ketikan lewat satu sapuan larik.

   Jadwal PENERBANGAN dunia sengaja tidak dimuat: ±100 ribu penerbangan
   per hari, berubah tiap hari, dan hanya tersedia lewat layanan
   berbayar. Maskapainya dikenali dari kode No. Flight (carrier-master.js).
   Sumber, lisensi & cara membangun ulang: qa/bangun-data-dunia.py.
================================================================== */
const DUNIA_URL = "assets/data/dunia.json";
const DUNIA = { status: "belum", janji: null, semua: [], perKode: new Map(), perIata: new Map(), perNama: new Map() };
/* Kunci nama berkas: teksnya sudah ASCII (qa/bangun-data-dunia.py), jadi
   cukup huruf besar & tanda baca -> spasi -- hasilnya sama dengan
   kunciNamaNegara() (negara.js) yang dipakai untuk ketikan pengguna,
   tanpa ongkos normalisasi unicode untuk ±50 ribu nama. */
const kunciAscii = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/* Entri berbentuk sama dengan entri unlocode.js (unlocode, code, name,
   country, type) ditambah `dunia: true`:
     unlocode  LOCODE resmi; bandara yang tidak terdaftar di UN/LOCODE
               memakai kode IATA-nya
     code      kunci yang kembali ke entri ini lewat resolvePortEntry():
               pelabuhan = LOCODE-nya; bandara = IATA. IATA yang sudah
               dipakai daftar kurasi (TPP = Tanjung Priok, bukan Tarapoto;
               HAM = pelabuhan Hamburg) diganti LOCODE-nya -- yang sekota
               dengan entri kurasi jatuh ke entri kurasi itu
     kota      kota bandara (dokumen ekspor, portKotaNegara)
   Yang sudah ada di daftar kurasi dilewati: tidak ada saran ganda. */
function siapkanDataDunia(d) {
  const kurasiUdara = new Set();
  UNLOCODES.forEach((u) => {
    if (u.type === "udara") kurasiUdara.add(u.code).add(u.unlocode);
  });
  const aliasPendek = new Set(UNLOCODES.flatMap((u) => (u.aliases || []).filter((a) => a.length <= 3).map((a) => a.toUpperCase())));
  const semua = [];
  const perKode = new Map();
  const perIata = new Map();
  const perNama = new Map();
  // Nama lain dicatat SESUDAH semua nama persis, supaya nama persis selalu didahulukan
  const namaLain = [];
  const catatNama = (kunci, e) => {
    if (!kunci) return;
    const ada = perNama.get(kunci);
    if (ada) ada.push(e);
    else perNama.set(kunci, [e]);
  };

  d.pelabuhan.forEach(([kode, nama, negara, lat, lon]) => {
    if (PORT_BY_UNLOCODE.has(kode)) return;
    const e = { unlocode: kode, code: kode, name: nama, country: negara, type: "laut", lat, lon, dunia: true, _k: kunciAscii(nama) };
    perKode.set(kode, e);
    catatNama(e._k, e);
    // "Helsingfors (Helsinki)", "Alger (Algiers)", "Cuatreros/Bahia Blanca"
    if (/[()/]/.test(nama)) {
      nama
        .split(/[()/]/)
        .filter((x) => x.trim() && !/^\s*ex\s|terminal/i.test(x))
        .forEach((x) => namaLain.push([kunciAscii(x), e]));
    }
    semua.push(e);
  });

  d.bandara.forEach(([iata, nama, kota, negara, lat, lon, peringkat, locode]) => {
    if (kurasiUdara.has(iata) || (locode && kurasiUdara.has(locode))) return;
    const kNama = kunciAscii(nama);
    const kKota = kunciAscii(kota);
    const sebutKota = kKota && kNama.indexOf(kKota) < 0;
    const iataBebas = !PORT_BY_CODE.has(iata) && !aliasPendek.has(iata);
    const e = {
      unlocode: locode || iata,
      code: iataBebas ? iata : locode || negara + iata,
      name: sebutKota ? `${nama}, ${kota}` : nama,
      kota,
      country: negara,
      type: "udara",
      lat,
      lon,
      peringkat,
      dunia: true,
      _k: sebutKota ? `${kNama} ${kKota}` : kNama,
      _kota: kKota,
    };
    perIata.set(iata, e);
    // LOCODE yang juga pelabuhan (DEHAM) tetap milik pelabuhannya -- kotanya sama
    [locode, e.code].forEach((k) => {
      if (k && k.length === 5 && !perKode.has(k)) perKode.set(k, e);
    });
    catatNama(kNama, e);
    // Kota bandara besar & menengah: "Nairobi", "Cancun"
    if (peringkat < 2) namaLain.push([kKota, e]);
    semua.push(e);
  });

  namaLain.forEach(([kunci, e]) => {
    const ada = perNama.get(kunci);
    if (!ada || !ada.includes(e)) catatNama(kunci, e);
  });
  Object.assign(DUNIA, { semua, perKode, perIata, perNama });
}

/* Ambil sekali; semua pemanggil menunggu janji yang sama. Gagal (luring,
   berkas tidak ada) = false -- aplikasi tetap jalan dengan daftar kurasi
   saja, dan pengambilan diulang saat kotak pelabuhan disentuh lagi. */
function muatDataDunia() {
  if (DUNIA.status === "siap") return Promise.resolve(true);
  if (DUNIA.janji) return DUNIA.janji;
  if (typeof fetch !== "function") return Promise.resolve(false);
  DUNIA.status = "memuat";
  DUNIA.janji = fetch(DUNIA_URL)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((d) => {
      if (!d || !Array.isArray(d.pelabuhan) || !Array.isArray(d.bandara)) throw new Error("isi berkas tidak dikenali");
      siapkanDataDunia(d);
      DUNIA.status = "siap";
      sesudahDataDuniaDimuat();
      return true;
    })
    .catch((e) => {
      console.error("Data dunia gagal dimuat:", e);
      DUNIA.status = "gagal";
      DUNIA.janji = null;
      return false;
    });
  return DUNIA.janji;
}
const dataDuniaSiap = () => DUNIA.status === "siap";

/* KODE saja -- LOCODE (5) atau IATA (3) -> entri dunia, atau null. Dipakai
   langkah kode cariPortEntry & portCodeLabel (unlocode.js): nama 5 huruf
   seperti "Sines" atau "Lagos" tidak boleh terbaca sebagai kode. */
function cariKodeDunia(kode) {
  if (!dataDuniaSiap()) return null;
  const k = String(kode == null ? "" : kode).trim().toUpperCase();
  return (UNLOCODE_PATTERN.test(k) ? DUNIA.perKode.get(k) : PORTCODE_PATTERN.test(k) ? DUNIA.perIata.get(k) : null) || null;
}

/* Teks pelabuhan bebas -> entri dunia, atau null. Hanya dipanggil SESUDAH
   daftar kurasi gagal (cariPortEntry, unlocode.js).
     BRSSZ / USJFK        LOCODE
     JFK                  kode IATA bandara
     "Santos", "Durban, South Africa", "Helsinki", "Nairobi"
                          nama persis (bagian sebelum koma; negara
                          sesudah koma memilih di antara nama kembar),
                          nama lain dalam kurung, kota bandara
     "Santos BRSSZ", "Durban (ZADUR)", "ZADUR - Durban"
                          kode di ujung / di depan teks */
function cariEntriDunia(teks) {
  if (!dataDuniaSiap()) return null;
  const s = String(teks == null ? "" : teks).trim();
  if (!s) return null;
  const besar = s.toUpperCase();
  const kodePersis = cariKodeDunia(besar);
  if (kodePersis) return kodePersis;

  const [nama, ...sisa] = s.split(",");
  const calon = DUNIA.perNama.get(kunciNamaNegara(s)) || DUNIA.perNama.get(kunciNamaNegara(nama));
  if (calon) {
    const negara = sisa.length ? kodeNegara(sisa.join(",")) : "";
    return (negara && calon.find((e) => e.country === negara)) || calon[0];
  }
  const kode = (besar.match(/\(?\b([A-Z]{2}[A-Z0-9]{3})\)?\s*$/) || besar.match(/^([A-Z]{2}[A-Z0-9]{3})\s*[-\u2013\u2014:|]/) || [])[1];
  return (kode && besar.replace(kode, "").replace(/[()\-\u2013\u2014:|\s]/g, "") && DUNIA.perKode.get(kode)) || null;
}

/* SARAN untuk kotak pelabuhan/bandara: paling banyak `maks` entri yang
   cocok dengan ketikan, menurut moda ("laut" / "udara" / "" semua).
   Urutan: kode persis, LOCODE berawalan, nama berawalan, kata di dalam
   nama; di tiap kelompok pelabuhan berstatus resmi & bandara besar lebih
   dulu (urutan berkas). */
function cariSaranDunia(teks, moda, maks) {
  if (!dataDuniaSiap()) return [];
  const kunci = kunciNamaNegara(teks);
  if (kunci.length < 2) return [];
  const besar = String(teks).trim().toUpperCase();
  const batas = maks || 12;
  const kelompok = [[], [], [], []];
  const kata = " " + kunci;
  for (const e of DUNIA.semua) {
    if (moda && e.type !== moda) continue;
    if (e.code === besar || e.unlocode === besar) kelompok[0].push(e);
    else if (besar.length >= 3 && e.unlocode.startsWith(besar)) kelompok[1].push(e);
    else if (e._k.startsWith(kunci) || (e._kota && e._kota.startsWith(kunci))) kelompok[2].push(e);
    else if (kunci.length >= 3 && e._k.includes(kata)) kelompok[3].push(e);
    if (kelompok[0].length + kelompok[1].length >= batas) break;
  }
  return kelompok.flat().slice(0, batas);
}

/* ------------------------------------------------------------------
   SARAN DI FORM -- kotak Asal, Tujuan & terminal transit

   Daftar kurasi tetap di <datalist>; yang cocok dari data dunia
   disisipkan di bawahnya SELAGI MENGETIK. 23 ribu pilihan sekaligus
   akan memberatkan kotak saran peramban. Datanya mulai diambil begitu
   kotaknya disentuh, jadi biasanya sudah siap sebelum huruf kedua.
------------------------------------------------------------------ */
const DATALIST_PELABUHAN = { unlocodeList: "", unlocodeListLaut: "laut", unlocodeListUdara: "udara" };
const kotakPelabuhan = (el) => !!(el && el.list && el.list.id in DATALIST_PELABUHAN);

function isiSaranDunia(kotak) {
  if (!kotakPelabuhan(kotak)) return;
  const dl = kotak.list;
  dl.querySelectorAll("option[data-dunia]").forEach((o) => o.remove());
  const moda = DATALIST_PELABUHAN[dl.id] || (document.getElementById("fTransport") || {}).value || "";
  const html = cariSaranDunia(kotak.value, moda)
    .map((e) => {
      const negara = namaNegara(e.country) || e.country;
      const kode = e.unlocode !== e.code ? `${e.unlocode} — ` : "";
      // value = kunci yang kembali ke entri ini; label memuat LOCODE, nama & negara (ikut dicocokkan peramban)
      return `<option data-dunia value="${escapeAttr(e.code)}">${escapeHtml(`${kode}${e.name} · ${negara}`)}</option>`;
    })
    .join("");
  if (html) dl.insertAdjacentHTML("beforeend", html);
}

if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    if (kotakPelabuhan(e.target)) muatDataDunia();
  });
  document.addEventListener("input", (e) => {
    if (kotakPelabuhan(e.target)) isiSaranDunia(e.target);
  });
}

/* ------------------------------------------------------------------
   JADWAL YANG PELABUHANNYA BELUM DIKENALI

   Dipanggil tiap prediksi diselaraskan (selaraskanPrediksi, api.js).
   Ada asal / tujuan / terminal transit yang tak dikenali daftar kurasi
   -> data dunia diambil saat peramban senggang. Begitu siap, prediksi
   & papan diselaraskan SEKALI bila memang ada yang jadi dikenali.
------------------------------------------------------------------ */
function pelabuhanJadwal(cocok) {
  if (typeof data === "undefined") return false;
  return ["import", "export"].some((mode) =>
    (data[mode] || []).some((s) => [s.origin, s.destination, ...(s.routeStops || []).map((x) => x.terminal)].some((v) => String(v || "").trim() && cocok(resolvePortEntry(v)))),
  );
}

function siapkanDataDuniaLatar() {
  if (DUNIA.status !== "belum" || typeof fetch !== "function" || !pelabuhanJadwal((e) => !e)) return;
  if (typeof requestIdleCallback === "function") requestIdleCallback(muatDataDunia, { timeout: 3000 });
  else setTimeout(muatDataDunia, 500);
}

function sesudahDataDuniaDimuat() {
  // "Tidak dikenali" yang teringat sebelum data dunia ada
  PORT_RESOLVE_CACHE.clear();
  if (typeof document !== "undefined" && kotakPelabuhan(document.activeElement)) isiSaranDunia(document.activeElement);
  if (typeof shipmentsLoaded !== "undefined" && shipmentsLoaded && pelabuhanJadwal((e) => e && e.dunia)) {
    selaraskanPrediksi();
    gambarUlangSesudahLatar();
  }
  // Form yang sedang terbuka: perkiraannya dihitung dengan pelabuhan yang kini dikenali
  const form = typeof document !== "undefined" && document.getElementById("viewForm");
  if (form && !form.classList.contains("d-none") && typeof hitungUlangEtaForm === "function") {
    hitungUlangEtaForm();
    syncPredictionForm();
  }
}
