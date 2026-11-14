"use strict";

/* ==================================================================
   BUKU BESAR EXIM -- mesin analisis Report Pengajuan Dana

   Report lama menjumlahkan Pengajuan Dana per bulan lalu membaginya
   dengan nilai invoice. Angkanya benar, tapi tiga dataset yang SEBENARNYA
   saling berkaitan tidak pernah dihubungkan:

     Pengajuan Dana  --(nomor BL/AWB)-->  Jadwal / kiriman
     Invoice (Sales) --(shipmentId)---->  Jadwal / kiriman
     Jadwal          --(PIB: bm/ppn/pph)--> bea & pajak yang SEHARUSNYA dibayar

   Berkas ini menyatukannya menjadi satu "kasus" per kiriman, lalu
   menghitung analisis yang lazim di akuntansi & keuangan:

     1. JEMBATAN KAS -> BIAYA. Uang yang diminta dari kantor pusat BUKAN
        biaya. Ia terdiri dari biaya sebenarnya (beban jasa; bea masuk
        yang dikapitalisasi ke harga pokok barang), pajak yang bisa
        dikreditkan kembali (PPN masukan, PPN impor, PPh 22 impor =
        piutang pajak / pajak dibayar di muka), dan dikurangi PPh 23 yang
        ditahan (utang pajak yang disetor perusahaan paling lambat tanggal
        10 bulan berikutnya). Tanpa pemisahan ini, "pengeluaran" bercampur
        biaya dan modal kerja.
     2. LANDED COST per kiriman (PSAK 14 / IAS 2): nilai barang + jasa
        angkut/pelabuhan + bea masuk. PPN impor dan PPh 22 tidak masuk
        karena dapat dikreditkan. Pembandingnya nilai barang (impor) atau
        penjualan invoice yang tertaut (ekspor) -- biaya & pendapatan
        kiriman yang SAMA (matching principle), bukan total bulan.
     3. REKONSILIASI BEA: bea & pajak menurut PIB (jadwal) vs yang dibayar
        lewat Billing / Tax Advance, per kiriman.
     4. HUTANG USAHA: umur hutang menurut JATUH TEMPO pada tanggal
        pelaporan, roll-forward (awal + ditagih - dibayar = akhir), disiplin
        bayar (tepat waktu, DPO tertimbang), kebutuhan kas 7/14/30 hari.
     5. KONTROL: cakupan tautan, hutang yang belum dibukukan (kiriman
        sudah jalan tanpa tagihan), pencilan biaya (modified z-score),
        data yang membuat analisis tidak bisa dipercaya.
     6. KORELASI: biaya vs berat, biaya vs penjualan, storage vs lama
        tertahan -- dengan uji kebermaknaan, supaya "ada hubungan" tidak
        diklaim dari tiga titik data.

   Semuanya FUNGSI MURNI (tanpa DOM, tanpa database): data masuk lewat
   argumen, hasilnya objek biasa -- yang sama dipakai layar & Excel, dan
   diuji. Teks yang tampil ke pembaca ada di fund-report-blok.js.
================================================================== */

/* ---------------------------- statistik ---------------------------- */

/* Nilai kritis t dua sisi 95% menurut derajat bebas (batas bawah tabel =
   lebih hati-hati). Dipakai menguji apakah korelasi cukup kuat untuk
   jumlah titiknya. */
const LAP_T95 = [[1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447], [7, 2.365], [8, 2.306], [9, 2.262],
  [10, 2.228], [12, 2.179], [15, 2.131], [20, 2.086], [25, 2.06], [30, 2.042], [40, 2.021], [60, 2.0], [120, 1.98]];
function lapTKritis(df) {
  let kritis = LAP_T95[0][1];
  LAP_T95.forEach(([d, nilai]) => {
    if (df >= d) kritis = nilai;
  });
  return kritis;
}

function lapKekuatan(r) {
  const a = Math.abs(r);
  return a >= 0.8 ? "strong" : a >= 0.5 ? "moderate" : a >= 0.3 ? "weak" : "negligible";
}

/* Korelasi Pearson + regresi linear sederhana y = a + b.x. Pasangan yang
   salah satunya kosong / bukan angka dibuang. Kurang dari 3 pasangan,
   atau salah satu deret tidak bervariasi -> null (tidak ada yang bisa
   dikatakan). `signifikan` = uji t dua sisi 95%: korelasi dari 4 titik
   baru "signifikan" bila |r| > 0,95. */
function lapKorelasi(xs, ys) {
  const pasang = [];
  const n0 = Math.min((xs || []).length, (ys || []).length);
  for (let i = 0; i < n0; i++) {
    if (xs[i] == null || ys[i] == null || xs[i] === "" || ys[i] === "") continue;
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    if (isFinite(x) && isFinite(y)) pasang.push([x, y]);
  }
  const n = pasang.length;
  if (n < 3) return null;
  const mx = pasang.reduce((s, p) => s + p[0], 0) / n;
  const my = pasang.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  pasang.forEach(([x, y]) => {
    sxx += (x - mx) * (x - mx);
    syy += (y - my) * (y - my);
    sxy += (x - mx) * (y - my);
  });
  if (!(sxx > 1e-12) || !(syy > 1e-12)) return null;
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const slope = sxy / sxx;
  const df = n - 2;
  const tStat = Math.abs(r) >= 1 ? Infinity : Math.abs(r) * Math.sqrt(df / (1 - r * r));
  return { n, r, r2: r * r, slope, intercept: my - slope * mx, mx, my, signifikan: tStat > lapTKritis(df), kekuatan: lapKekuatan(r) };
}

function lapMedian(nilai) {
  const u = (nilai || []).map(Number).filter((x) => isFinite(x)).sort((a, b) => a - b);
  const n = u.length;
  if (!n) return 0;
  return n % 2 ? u[(n - 1) / 2] : (u[n / 2 - 1] + u[n / 2]) / 2;
}

/* Modified z-score (Iglewicz & Hoaglin): 0,6745 x (x - median) / MAD.
   Tahan terhadap pencilan itu sendiri -- mean & simpangan baku biasa
   "ditarik" oleh nilai ekstrem sehingga tidak melihatnya. MAD = 0 (lebih
   dari separuh nilai sama) -> pakai simpangan absolut rata-rata. Nilai
   di atas 3,5 lazim dianggap pencilan. */
function lapZMod(nilai) {
  const a = (nilai || []).map(Number);
  const m = lapMedian(a);
  const mad = lapMedian(a.map((x) => Math.abs(x - m)));
  if (mad > 0) return a.map((x) => (0.6745 * (x - m)) / mad);
  const rata = a.length ? a.reduce((s, x) => s + Math.abs(x - m), 0) / a.length : 0;
  if (rata > 0) return a.map((x) => (x - m) / (1.253314 * rata));
  return a.map(() => 0);
}

/* Konsentrasi pemasok: pangsa terbesar, tiga terbesar, dan indeks
   Herfindahl-Hirschman (jumlah kuadrat pangsa dalam persen; ambang
   lazim: di bawah 1.500 tidak terkonsentrasi, 1.500-2.500 sedang, di atas
   2.500 tinggi). Nilai negatif / nol dibuang. */
function lapKonsentrasi(nilai) {
  const a = (nilai || []).map(Number).filter((x) => x > 0).sort((x, y) => y - x);
  const total = a.reduce((s, x) => s + x, 0);
  if (!total) return { n: 0, total: 0, teratas: 0, tiga: 0, hhi: 0, tingkat: "none" };
  const hhi = a.reduce((s, x) => s + ((x / total) * 100) * ((x / total) * 100), 0);
  return {
    n: a.length,
    total,
    teratas: a[0] / total,
    tiga: a.slice(0, 3).reduce((s, x) => s + x, 0) / total,
    hhi,
    tingkat: hhi > 2500 ? "high" : hhi >= 1500 ? "moderate" : "low",
  };
}

/* ---------------------------- tanggal ---------------------------- */

const lapHari = (iso) => Date.parse(String(iso || "").slice(0, 10) + "T00:00:00Z") / 86400000;
const lapIsoSah = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || "")) && isFinite(lapHari(v));
const lapSelisihHari = (a, b) => Math.round(lapHari(b) - lapHari(a));
const lapTambahHari = (iso, n) => new Date(Date.parse(String(iso).slice(0, 10) + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const lapAkhirBulan = (y, m) => new Date(Date.UTC(Number(y), Number(m), 0)).toISOString().slice(0, 10);

/* ---------------------------- komponen pajak ---------------------------- */

const LAP_RE_PPH = /\bPPh\b|income\s*tax|pajak\s*penghasilan/i;
const LAP_RE_PPN = /\bPPN\b|\bVAT\b/i;
const LAP_RE_BM = /bea\s*masuk|\bBM\b|import\s*duty|customs\s*duty/i;

/* Baris rincian Tax Advance -> bea masuk / PPN impor / PPh 22 impor /
   lain-lain (biaya jasa, denda). Dibaca dari uraian barisnya. */
function lapJenisBarisPajak(teks) {
  const kata = String(teks || "");
  if (LAP_RE_PPH.test(kata)) return "pph";
  if (LAP_RE_PPN.test(kata)) return "ppn";
  if (LAP_RE_BM.test(kata)) return "bm";
  return "lain";
}

/* Rincian bea & pajak SATU pengajuan Billing / Tax Advance, dalam IDR
   (`dpp` & hasilnya sudah dikali kurs):
     bm   bea masuk -- biaya, masuk harga pokok barang
     ppn  PPN impor -- pajak masukan, dapat dikreditkan
     pph  PPh 22 impor -- pajak dibayar di muka, dapat dikreditkan
     lain sisanya (denda, PPnBM, biaya jasa forwarder) -- biaya
   bm + ppn + pph + lain = dpp, selalu. Selain Billing / Tax Advance null. */
function lapKomponenPajak(p, jenis, dpp, faktor) {
  if (jenis !== "Billing" && jenis !== "Tax Advance") return null;
  const k = Number(faktor) || 0;
  const o = { bm: 0, ppn: 0, pph: 0 };
  if (jenis === "Billing") {
    o.bm = frAngka(p.feeBm);
    o.ppn = frAngka(p.feePpn);
    o.pph = frAngka(p.feePph);
  } else if (Array.isArray(p.lines) && p.lines.length) {
    const daftar = normalisasiBarisDana(p.lines);
    const nilai = fundLineValues(daftar);
    daftar.forEach((b, i) => {
      const j = lapJenisBarisPajak(b && b.desc);
      if (j !== "lain") o[j] += nilai[i];
    });
  }
  return { bm: o.bm * k, ppn: o.ppn * k, pph: o.pph * k, lain: (dpp - o.bm - o.ppn - o.pph) * k };
}

/* ---------------------------- baris pengajuan ---------------------------- */

/* Baris yang dibuat di luar lapBarisDana (uji, data lama) belum punya
   kolom analisis: dilengkapi di sini, tanpa mengubah baris aslinya. */
function lapLengkapi(d) {
  if (!d || d._lengkap) return d;
  const tagihan = d.tagihan != null ? Number(d.tagihan) || 0 : Number(d.total) || 0;
  const pulih = Number(d.pulih) || 0;
  const tahan = Number(d.tahan) || 0;
  return Object.assign({}, d, {
    _lengkap: true,
    tagihan,
    pulih,
    tahan,
    biayaEko: d.biayaEko != null ? Number(d.biayaEko) || 0 : tagihan + tahan - pulih,
    jatuhTempo: String(d.jatuhTempo || "").slice(0, 10),
    tglBayar: String(d.tglBayar || "").slice(0, 10),
    jenis: String(d.jenis || ""),
    pajak: d.pajak || null,
    kurs: d.kurs != null ? Number(d.kurs) : 1,
  });
}

/* Satu pengajuan -> uraian ekonomisnya (IDR):
     kas        uang yang diminta dari kantor pusat (setelah PPh 23)
     jasa       beban jasa vendor (freight, storage, lainnya) -- sebelum PPN
     bm         bea masuk (dikapitalisasi ke harga pokok)
     lainPajak  denda / PPnBM / biaya jasa di pengajuan Billing & Tax Advance
     ppnJasa    PPN masukan atas jasa -- dapat dikreditkan
     ppnImpor   PPN impor -- dapat dikreditkan
     pph22      PPh 22 impor -- dapat dikreditkan
     pph23      PPh 23 yang ditahan -- utang pajak
     negara     yang disetor ke kas negara untuk bea & pajak impor
   Identitasnya: kas = jasa + bm + lainPajak + ppnJasa + ppnImpor + pph22 - pph23. */
function lapUrai(d0) {
  const d = lapLengkapi(d0);
  const u = { kas: d.tagihan, jasa: 0, bm: 0, lainPajak: 0, ppnJasa: 0, ppnImpor: 0, pph22: 0, pph23: d.tahan, negara: 0 };
  if (d.jenis === "Billing" || d.jenis === "Tax Advance") {
    const pj = d.pajak || { bm: 0, ppn: 0, pph: 0, lain: 0 };
    u.bm = pj.bm;
    u.ppnImpor = pj.ppn;
    u.pph22 = pj.pph;
    u.lainPajak = d.biayaEko - pj.bm;
    u.ppnJasa = d.pulih - pj.ppn - pj.pph;
    const sudahTerpilah = pj.bm + pj.ppn + pj.pph;
    // Billing seluruhnya setoran ke kas negara; Tax Advance hanya bagian bea & pajaknya
    // (tak terpilah = diperlakukan seluruhnya pajak, jenisnya memang Tax Advance)
    u.negara = d.jenis === "Billing" ? d.tagihan : sudahTerpilah || d.tagihan - d.tahan;
  } else {
    u.jasa = d.biayaEko;
    u.ppnJasa = d.pulih;
  }
  return u;
}

/* ---------------------------- kasus (kiriman) ---------------------------- */

const LAP_KASUS_KOSONG = () => ({
  pengajuan: new Set(), kas: 0, jasa: 0, bm: 0, lainPajak: 0, ppnJasa: 0, ppnImpor: 0, pph22: 0, pph23: 0, negara: 0,
  jenis: {}, vendor: new Map(),
});

function lapBukuKiriman(s) {
  if (s && s.mode) return s.mode === "export" ? "export" : "import";
  return typeof data !== "undefined" && data && (data.export || []).indexOf(s) >= 0 ? "export" : "import";
}

function lapJalurKasus(buku, moda) {
  const arah = buku === "export" ? "Export" : "Import";
  if (moda === "udara") return `Air ${arah}`;
  if (moda === "laut") return `Sea ${arah}`;
  return `Other ${arah}`;
}

/* Tanggal yang menempatkan kiriman di bulan laporan (kohort): tanggal
   PIB (impor) / PEB (ekspor) -- sama dengan dasar NDPBM -- lalu tanggal
   di nomor Aju, tanggal dokumen, ETA/ETD. */
function lapTanggalKasus(s, buku) {
  const md = (k) => (typeof milestoneDateOf === "function" ? milestoneDateOf(s, k) : "");
  const calon = [
    md(buku === "export" ? "peb" : "pib"),
    typeof tanggalDariAju === "function" ? tanggalDariAju(s.noAju) : "",
    s.docDate, s.actual, s.eta, s.etd,
  ];
  const ada = calon.map((x) => String(x || "").slice(0, 10)).find((x) => lapIsoSah(x));
  return ada || "";
}

/* Satu jadwal -> kasus. `ndpbmUsd(tanggal)` = rupiah per USD untuk nilai
   barang ekspor (impor memakai NDPBM kirimannya sendiri). */
function lapKasusDari(s, ndpbmUsd) {
  if (!s || s.id == null) return null;
  const buku = lapBukuKiriman(s);
  const kunci = [...new Set([s.masterBL, s.houseBL].map((x) => kunciAlnum(x)).filter((k) => k.length >= 5))];
  const calc = typeof computeCustoms === "function" ? computeCustoms(s) : {};
  const usd = Number(calc.totalUSD) || 0;
  const ndpbm = Number(s.ndpbm) || 0;
  const tanggal = lapTanggalKasus(s, buku);
  const md = (k) => (typeof milestoneDateOf === "function" ? milestoneDateOf(s, k) : "");
  const nilaiBarang = buku === "import" ? calc.cifRupiah || calc.fobRupiah || usd * ndpbm : usd * (typeof ndpbmUsd === "function" ? Number(ndpbmUsd(s.etd || s.docDate || tanggal)) || 0 : 0);
  const tiba = buku === "import" ? String(s.ata || md("berth") || "").slice(0, 10) : "";
  const keluar = buku === "import" ? md("sppb") : "";
  const berangkat = buku === "export" ? md("sailing") || md("npe") || md("peb") : "";
  const pib = { bm: Number(s.bm) || 0, ppn: Number(s.ppn) || 0, pph: Number(s.pph) || 0 };
  pib.total = pib.bm + pib.ppn + pib.pph;
  const incoterm = String(s.incoterm || "").toUpperCase();
  const dwell = tiba && keluar && lapIsoSah(tiba) && lapIsoSah(keluar) ? lapSelisihHari(tiba, keluar) : null;
  return {
    id: String(s.id),
    buku,
    moda: s.transport === "udara" ? "udara" : s.transport === "laut" ? "laut" : "",
    jalur: lapJalurKasus(buku, s.transport),
    pihak: String(s.party || "").trim(),
    forwarder: String(s.forwarder || "").trim(),
    noAju: String(s.noAju || "").trim(),
    blAwb: [s.masterBL, s.houseBL].filter(Boolean).join(" / "),
    kunci,
    tanggal,
    tahun: Number(tanggal.slice(0, 4)) || 0,
    bulan: Number(tanggal.slice(5, 7)) || 0,
    incoterm,
    kelompok: typeof lapKelompokSyarat === "function" ? lapKelompokSyarat(incoterm) : "-",
    jalurBc: typeof jalurOf === "function" ? jalurOf(s) : "",
    tiba: lapIsoSah(tiba) ? tiba : "",
    keluar: lapIsoSah(keluar) ? keluar : "",
    berangkat: lapIsoSah(berangkat) ? String(berangkat).slice(0, 10) : "",
    dwell: dwell != null && dwell >= 0 ? dwell : null,
    usd,
    ndpbm,
    nilaiBarang,
    gw: Number(calc.totalBruto) || 0,
    pib,
    adaPib: pib.total > 0,
    biaya: LAP_KASUS_KOSONG(),
    pendapatan: 0,
    pendapatanUsd: 0,
    invoice: [],
    syarat: "",
  };
}

/* Menambahkan SEBAGIAN (porsi 0..1) satu pengajuan ke kasusnya. */
function lapTambahBiaya(k, d, u, porsi) {
  const b = k.biaya;
  b.pengajuan.add(d.id != null ? String(d.id) : d.nomor);
  ["kas", "jasa", "bm", "lainPajak", "ppnJasa", "ppnImpor", "pph22", "pph23", "negara"].forEach((f) => (b[f] += u[f] * porsi));
  b.jenis[d.jenis || "-"] = (b.jenis[d.jenis || "-"] || 0) + d.biayaEko * porsi;
  if (d.jenis !== "Billing") {
    const kv = fsumKunci(d.vendor) || "-";
    const v = b.vendor.get(kv) || { nama: d.vendor || "-", jasa: 0 };
    v.jasa += u.jasa * porsi;
    b.vendor.set(kv, v);
  }
}

/* Menyatukan pengajuan dana, invoice, dan jadwal. Hasilnya:
     kasus     Map id -> kasus (biaya & pendapatan sudah tertaut)
     kunciKe   Map nomor BL/AWB -> [id kasus]
     hasil     Map baris pengajuan -> { status, kasTertaut, kasYatim, taut, tak }
                 status: linked | partial | orphan | none | trucking
                 taut: [{ id kasus, kunci, porsi }]  tak: [{ kunci, porsi }] (BL/AWB tak ditemukan)
     yatim     bagian pengajuan yang BL/AWB-nya tidak ditemukan di jadwal
     pendapatanYatim  invoice ekspor yang tidak tertaut ke jadwal */
function lapBangunBuku(dana, invoice, kiriman, opsi) {
  const o = opsi || {};
  const kasus = new Map();
  const kunciKe = new Map();
  (kiriman || []).forEach((s) => {
    const k = lapKasusDari(s, o.ndpbmUsd);
    if (!k) return;
    kasus.set(k.id, k);
    k.kunci.forEach((kk) => {
      const a = kunciKe.get(kk) || [];
      if (a.indexOf(k.id) < 0) a.push(k.id);
      kunciKe.set(kk, a);
    });
  });

  const hasil = new Map();
  const yatim = [];
  (dana || []).forEach((d0) => {
    const d = lapLengkapi(d0);
    const u = lapUrai(d);
    const bagian = Array.isArray(d.perAwb) && d.perAwb.length ? d.perAwb : typeof lapBagianAwb === "function" && !Array.isArray(d.perAwb) ? lapBagianAwb(d) : [];
    const truk = /inland|truck/i.test(String(d.transaksi || "")) || d.moda === "darat";
    if (!bagian.length) {
      hasil.set(d0, { status: truk ? "trucking" : "none", kasTertaut: 0, kasYatim: 0, taut: [], tak: [] });
      return;
    }
    const kasBagian = (b) => (b.dibayar != null ? Number(b.dibayar) : Number(b.dpp)) || 0;
    const jumlahKas = bagian.reduce((x, b) => x + kasBagian(b), 0);
    let tertaut = 0;
    let tak = 0;
    const taut = [];
    const bagianTak = [];
    bagian.forEach((b) => {
      const porsi = jumlahKas ? kasBagian(b) / jumlahKas : 1 / bagian.length;
      const ids = kunciKe.get(b.kunci);
      if (!ids || !ids.length) {
        // Trucking memakai nomor DO / Surat Jalan, bukan BL/AWB: tak ditautkan karena rancangannya, bukan karena salah
        if (truk) return;
        tak += porsi;
        yatim.push({ d, kunci: b.kunci, porsi, kas: u.kas * porsi });
        bagianTak.push({ kunci: b.kunci, porsi });
        return;
      }
      tertaut += porsi;
      ids.forEach((id) => {
        lapTambahBiaya(kasus.get(id), d, u, porsi / ids.length);
        taut.push({ id, kunci: b.kunci, porsi: porsi / ids.length });
      });
    });
    const status = truk ? "trucking" : tak <= 1e-9 ? "linked" : tertaut <= 1e-9 ? "orphan" : "partial";
    hasil.set(d0, { status, kasTertaut: u.kas * tertaut, kasYatim: u.kas * tak, taut, tak: bagianTak });
  });

  const pendapatanYatim = [];
  (invoice || []).forEach((v) => {
    const k = v.shipmentId != null && v.shipmentId !== "" ? kasus.get(String(v.shipmentId)) : null;
    if (!k) {
      if (v.kanal === "Export") pendapatanYatim.push(v);
      return;
    }
    k.invoice.push(v);
    k.pendapatan += Number(v.jumlah) || 0;
    if (v.mata === "USD") k.pendapatanUsd += Number(v.jumlahAsli) || 0;
    if (!k.syarat && v.syarat && v.syarat !== "-") k.syarat = v.syarat;
  });
  return { kasus, kunciKe, hasil, yatim, pendapatanYatim };
}

/* ---------------------------- 1. jembatan kas -> biaya ---------------------------- */

const LAP_URUT_JENIS = ["Freight", "Storage", "Lainnya", "Billing", "Tax Advance"];

function lapJembatan(dana, Y, M) {
  const baris = (dana || []).filter((d) => d.tahun === Y && d.bulan >= 1 && d.bulan <= M).map(lapLengkapi);
  const kosong = () => ({ jumlah: 0, kas: 0, tahan: 0, pulih: 0, biaya: 0 });
  const peta = new Map();
  const total = kosong();
  const bulan = Array.from({ length: 12 }, kosong);
  const sifat = { jasa: 0, bm: 0, lainPajak: 0, ppnJasa: 0, ppnImpor: 0, pph22: 0, pph23: 0, negara: 0 };
  baris.forEach((d) => {
    const j = LAP_URUT_JENIS.indexOf(d.jenis) >= 0 ? d.jenis : "Other types";
    const r = peta.get(j) || Object.assign({ jenis: j }, kosong());
    [r, total, bulan[d.bulan - 1]].forEach((x) => {
      x.jumlah += 1;
      x.kas += d.tagihan;
      x.tahan += d.tahan;
      x.pulih += d.pulih;
      x.biaya += d.biayaEko;
    });
    peta.set(j, r);
    const u = lapUrai(d);
    Object.keys(sifat).forEach((f) => (sifat[f] += u[f]));
  });
  const urut = (j) => (LAP_URUT_JENIS.indexOf(j) >= 0 ? LAP_URUT_JENIS.indexOf(j) : 99);
  return { baris: [...peta.values()].sort((a, b) => urut(a.jenis) - urut(b.jenis)), total, bulan, sifat };
}

/* ---------------------------- 2. ekonomi kiriman ---------------------------- */

const LAP_JALUR_URUT = ["Sea Import", "Air Import", "Sea Export", "Air Export"];

function lapKohort(buku, Y, M) {
  return [...buku.kasus.values()].filter((k) => k.tahun === Y && k.bulan >= 1 && k.bulan <= M);
}

const lapBiayaKasus = (k) => k.biaya.jasa + k.biaya.bm + k.biaya.lainPajak;
const lapAdaBiaya = (k) => k.biaya.pengajuan.size > 0;
/* Nilai pembanding biaya: impor = nilai pabean barang; ekspor = penjualan
   invoice yang tertaut, atau nilai barang jadwal bila belum ada invoice. */
const lapNilaiKasus = (k) => (k.buku === "export" && k.pendapatan > 0 ? k.pendapatan : k.nilaiBarang);

function lapEkonomi(buku, Y, M) {
  const kohort = lapKohort(buku, Y, M);
  const baru = (nama) => ({ nama, kasus: 0, berbiaya: 0, nilai: 0, jasa: 0, bm: 0, lainPajak: 0, kas: 0, pulih: 0, gw: 0, jasaGw: 0, bermitra: 0 });
  const tambah = (g, k) => {
    g.kasus += 1;
    if (!lapAdaBiaya(k)) return;
    g.berbiaya += 1;
    g.nilai += lapNilaiKasus(k);
    g.jasa += k.biaya.jasa;
    g.bm += k.biaya.bm;
    g.lainPajak += k.biaya.lainPajak;
    g.kas += k.biaya.kas;
    g.pulih += k.biaya.ppnJasa + k.biaya.ppnImpor + k.biaya.pph22;
    if (k.gw > 0) {
      g.gw += k.gw;
      g.jasaGw += k.biaya.jasa;
    }
  };
  const selesai = (g) => {
    g.biaya = g.jasa + g.bm + g.lainPajak;
    g.persen = g.nilai ? g.biaya / g.nilai : null;
    g.perKasus = g.berbiaya ? g.biaya / g.berbiaya : null;
    g.perKg = g.gw ? g.jasaGw / g.gw : null;
    return g;
  };
  const peta = new Map();
  const jumlah = baru("Total");
  /* Subtotal per ARAH. Impor (dibandingkan dengan nilai pabean) dan ekspor
     (dibandingkan dengan penjualan) tidak boleh dijumlah dalam satu rasio;
     biaya per kg juga tidak berarti lintas laut & udara, jadi dikosongkan. */
  const arah = { import: baru("Total imports"), export: baru("Total exports") };
  kohort.forEach((k) => {
    const g = peta.get(k.jalur) || baru(k.jalur);
    tambah(g, k);
    tambah(jumlah, k);
    tambah(arah[k.buku === "export" ? "export" : "import"], k);
    peta.set(k.jalur, g);
  });
  const urut = (n) => (LAP_JALUR_URUT.indexOf(n) >= 0 ? LAP_JALUR_URUT.indexOf(n) : 99);
  const jalur = [...peta.values()].map(selesai).sort((a, b) => urut(a.nama) - urut(b.nama));
  Object.keys(arah).forEach((x) => Object.assign(selesai(arah[x]), { perKg: null }));

  // Menurut kelompok Incoterm: ekspor memakai syarat di invoice, impor syarat jadwal
  const petaT = new Map();
  kohort.filter(lapAdaBiaya).forEach((k) => {
    const grup = k.buku === "export" ? k.syarat || k.kelompok || "-" : k.kelompok || "-";
    const kunci = `${k.buku}|${grup}`;
    const g = petaT.get(kunci) || Object.assign(baru(`${k.buku === "export" ? "Export" : "Import"} · ${grup}`), { arah: k.buku, grup });
    tambah(g, k);
    petaT.set(kunci, g);
  });
  const syarat = [...petaT.values()].map(selesai).sort((a, b) => (a.arah === b.arah ? a.grup.localeCompare(b.grup) : a.arah === "import" ? -1 : 1));

  // Ekspor: kecocokan pendapatan -- biaya hanya dibandingkan dengan invoice kiriman yang SAMA
  const ekspor = kohort.filter((k) => k.buku === "export" && lapAdaBiaya(k));
  const tertaut = ekspor.filter((k) => k.pendapatan > 0);
  const cocok = {
    kasus: ekspor.length,
    tertaut: tertaut.length,
    pendapatan: tertaut.reduce((x, k) => x + k.pendapatan, 0),
    biaya: tertaut.reduce((x, k) => x + lapBiayaKasus(k), 0),
  };
  cocok.persen = cocok.pendapatan ? cocok.biaya / cocok.pendapatan : null;
  // Per pelanggan -- pendapatan & biaya kiriman yang SAMA (bukan pencocokan nama di tab Invoice)
  const petaP = new Map();
  tertaut.forEach((k) => {
    const nama = (k.invoice[0] && k.invoice[0].customer) || k.pihak || "-";
    const kk = fsumKunci(nama) || "-";
    const g = petaP.get(kk) || { nama, kasus: 0, pendapatan: 0, biaya: 0 };
    g.kasus += 1;
    g.pendapatan += k.pendapatan;
    g.biaya += lapBiayaKasus(k);
    petaP.set(kk, g);
  });
  const pelanggan = [...petaP.values()]
    .map((g) => Object.assign(g, { persen: g.pendapatan ? g.biaya / g.pendapatan : null, sisa: g.pendapatan - g.biaya }))
    .sort((x, y) => y.pendapatan - x.pendapatan);

  const tanpaBiaya = kohort.filter((k) => !lapAdaBiaya(k));
  return { jalur, jumlah: selesai(jumlah), arah, syarat, cocok, pelanggan, kohort: kohort.length, tanpaBiaya: tanpaBiaya.length };
}

/* ---------------------------- 3. rekonsiliasi bea & pajak ---------------------------- */

const LAP_STATUS_BEA = ["Matched", "Paid more than PIB", "Paid less than PIB", "PIB, no payment request", "Payment, no PIB amounts"];

/* Hasil rekonsiliasi satu kiriman impor; "" = bukan impor, atau tak ada
   angka PIB maupun pembayaran bea (tidak ada yang direkonsiliasi). */
function lapStatusBea(k, tol) {
  if (!k || k.buku !== "import" || !(k.adaPib || k.biaya.negara !== 0)) return "";
  const bayar = k.biaya.negara;
  const selisih = bayar - k.pib.total;
  return !k.adaPib ? "Payment, no PIB amounts"
    : bayar <= 0 ? "PIB, no payment request"
    : Math.abs(selisih) <= tol ? "Matched"
    : selisih > 0 ? "Paid more than PIB" : "Paid less than PIB";
}

function lapRekonBea(buku, Y, M, toleransi) {
  const tol = toleransi == null ? 1000 : toleransi;
  const baris = lapKohort(buku, Y, M)
    .filter((k) => lapStatusBea(k, tol))
    .map((k) => {
      const pib = k.pib.total;
      const bayar = k.biaya.negara;
      return { k, pib, bayar, selisih: bayar - pib, status: lapStatusBea(k, tol), bm: k.biaya.bm, ppnImpor: k.biaya.ppnImpor, pph22: k.biaya.pph22 };
    });
  const ringkas = LAP_STATUS_BEA.map((nama) => {
    const isi = baris.filter((b) => b.status === nama);
    return { nama, jumlah: isi.length, pib: isi.reduce((x, b) => x + b.pib, 0), bayar: isi.reduce((x, b) => x + b.bayar, 0), selisih: isi.reduce((x, b) => x + b.selisih, 0) };
  });
  const dgPib = baris.filter((b) => b.k.adaPib);
  const nilai = dgPib.reduce((x, b) => x + b.k.nilaiBarang, 0);
  return {
    baris,
    ringkas,
    toleransi: tol,
    pibTotal: dgPib.reduce((x, b) => x + b.pib, 0),
    bmPib: dgPib.reduce((x, b) => x + b.k.pib.bm, 0),
    ppnPib: dgPib.reduce((x, b) => x + b.k.pib.ppn, 0),
    pphPib: dgPib.reduce((x, b) => x + b.k.pib.pph, 0),
    nilaiPabean: nilai,
    beban: nilai ? dgPib.reduce((x, b) => x + b.pib, 0) / nilai : null,
    bebanBm: nilai ? dgPib.reduce((x, b) => x + b.k.pib.bm, 0) / nilai : null,
    bayarTotal: baris.reduce((x, b) => x + b.bayar, 0),
    masalah: baris.filter((b) => b.status !== "Matched"),
  };
}

/* ---------------------------- 4. hutang usaha ---------------------------- */

const LAP_UMUR_HUTANG = [["Not yet due", -Infinity, 0], ["1–30 days overdue", 1, 30], ["31–60 days overdue", 31, 60], ["61–90 days overdue", 61, 90], ["Over 90 days overdue", 91, Infinity]];

/* Hutang pengajuan dana pada TANGGAL PELAPORAN = yang lebih awal antara
   akhir bulan laporan dan hari ini (laporan bulan lalu = posisi akhir
   bulan itu; bulan berjalan = posisi hari ini).

   Terbuka pada tanggal T: ditagih (tanggal invoice) sampai T dan belum
   lunas, atau lunas SESUDAH T. Tanggal bayar sebelum tanggal invoice
   (salah catat) diperlakukan lunas pada tanggal invoice -- kalau tidak,
   roll-forward tidak pernah seimbang. Roll-forward:
     hutang awal tahun + ditagih tahun ini - dibayar tahun ini = hutang akhir. */
function lapHutang(dana, Y, M, hariIni) {
  const akhirBulan = lapAkhirBulan(Y, M);
  const acuan = hariIni && lapIsoSah(hariIni) && hariIni < akhirBulan ? String(hariIni).slice(0, 10) : akhirBulan;
  const awalTahun = `${Y}-01-01`;
  const sebelum = lapTambahHari(awalTahun, -1);
  const item = (dana || []).map(lapLengkapi).filter((d) => d.tanggal && lapIsoSah(d.tanggal) && d.tanggal <= acuan && d.bulan >= 1).map((d) => {
    const faktur = d.tanggal;
    let bayar = d.tglBayar && lapIsoSah(d.tglBayar) ? d.tglBayar : "";
    if (bayar && bayar < faktur) bayar = faktur;
    return { d, faktur, bayar, tempo: d.jatuhTempo && lapIsoSah(d.jatuhTempo) ? d.jatuhTempo : "", nilai: d.tagihan };
  });
  const jml = (arr) => ({ jumlah: arr.length, nilai: arr.reduce((x, i) => x + i.nilai, 0) });
  const terbuka = (it, saat) => it.faktur <= saat && (!it.bayar || it.bayar > saat);
  const pembuka = item.filter((it) => terbuka(it, sebelum));
  const ditagih = item.filter((it) => it.faktur > sebelum);
  const dibayar = item.filter((it) => it.bayar && it.bayar > sebelum && it.bayar <= acuan);
  const penutup = item.filter((it) => terbuka(it, acuan));

  const umur = LAP_UMUR_HUTANG.map(([nama, a, b]) => {
    const isi = penutup.filter((it) => it.tempo && (() => {
      const lewat = lapSelisihHari(it.tempo, acuan);
      return lewat >= a && lewat <= b;
    })());
    return Object.assign({ nama }, jml(isi));
  }).concat([Object.assign({ nama: "No due date" }, jml(penutup.filter((it) => !it.tempo)))]);
  const terlambat = penutup.filter((it) => it.tempo && it.tempo < acuan);
  const tertua = terlambat.length ? Math.max(...terlambat.map((it) => lapSelisihHari(it.tempo, acuan))) : null;

  const datang = [["Due in 0–7 days", 0, 7], ["Due in 8–14 days", 8, 14], ["Due in 15–30 days", 15, 30], ["Due later than 30 days", 31, Infinity]].map(([nama, a, b]) => {
    const isi = penutup.filter((it) => it.tempo && (() => {
      const sisa = lapSelisihHari(acuan, it.tempo);
      return sisa >= a && sisa <= b;
    })());
    return Object.assign({ nama }, jml(isi));
  });

  // Disiplin bayar: yang lunas dalam tahun laporan
  const hari = dibayar.map((it) => lapSelisihHari(it.faktur, it.bayar));
  const denganTempo = dibayar.filter((it) => it.tempo);
  const telat = denganTempo.filter((it) => it.bayar > it.tempo);
  const tepat = denganTempo.filter((it) => it.bayar <= it.tempo);
  const awal = denganTempo.filter((it) => lapSelisihHari(it.bayar, it.tempo) >= 7);
  const nilaiBayar = dibayar.reduce((x, it) => x + Math.abs(it.nilai), 0);
  const disiplin = {
    jumlah: dibayar.length,
    rataHari: hari.length ? hari.reduce((x, v) => x + v, 0) / hari.length : null,
    medianHari: hari.length ? lapMedian(hari) : null,
    dpo: nilaiBayar ? dibayar.reduce((x, it, i) => x + Math.abs(it.nilai) * hari[i], 0) / nilaiBayar : null,
    adaTempo: denganTempo.length,
    tanpaTempo: dibayar.length - denganTempo.length,
    tepat: jml(tepat),
    telat: jml(telat),
    awal: jml(awal),
    persenTepat: denganTempo.length ? tepat.length / denganTempo.length : null,
    rataTelat: telat.length ? telat.reduce((x, it) => x + lapSelisihHari(it.tempo, it.bayar), 0) / telat.length : null,
  };

  // Per vendor
  const peta = new Map();
  const ambil = (it) => {
    const k = fsumKunci(it.d.vendor) || "-";
    if (!peta.has(k)) peta.set(k, { nama: it.d.vendor || "-", terbuka: 0, terbukaN: 0, telat: 0, telatN: 0, tertua: 0, bayarN: 0, hariJumlah: 0, denganTempo: 0, tepat: 0 });
    return peta.get(k);
  };
  penutup.forEach((it) => {
    const r = ambil(it);
    r.terbuka += it.nilai;
    r.terbukaN += 1;
    if (it.tempo && it.tempo < acuan) {
      r.telat += it.nilai;
      r.telatN += 1;
      r.tertua = Math.max(r.tertua, lapSelisihHari(it.tempo, acuan));
    }
  });
  dibayar.forEach((it, i) => {
    const r = ambil(it);
    r.bayarN += 1;
    r.hariJumlah += hari[i];
    if (it.tempo) {
      r.denganTempo += 1;
      if (it.bayar <= it.tempo) r.tepat += 1;
    }
  });
  const perVendor = [...peta.values()].map((r) => Object.assign(r, {
    rataHari: r.bayarN ? r.hariJumlah / r.bayarN : null,
    persenTepat: r.denganTempo ? r.tepat / r.denganTempo : null,
  })).sort((a, b) => b.terbuka - a.terbuka);

  // PPh 23 ditahan tahun ini: wajib disetor paling lambat tanggal 10 bulan berikutnya
  const pph23 = Array.from({ length: 12 }, (_, i) => {
    const isi = item.filter((it) => it.d.tahun === Y && it.d.bulan === i + 1);
    return { bulan: i + 1, nilai: isi.reduce((x, it) => x + it.d.tahan, 0), batas: i === 11 ? `${Y + 1}-01-10` : `${Y}-${String(i + 2).padStart(2, "0")}-10` };
  }).filter((r) => r.bulan <= M);

  return {
    acuan, awalTahun, pembuka: jml(pembuka), ditagih: jml(ditagih.filter((it) => it.faktur >= awalTahun)), dibayar: jml(dibayar), penutup: jml(penutup),
    seimbang: jml(penutup).nilai - (jml(pembuka).nilai + jml(ditagih).nilai - jml(dibayar).nilai),
    umur, terlambat: Object.assign(jml(terlambat), { tertua }), datang, disiplin, perVendor, pph23,
    dibayarSebelumFaktur: (dana || []).filter((d) => d.tglBayar && d.tanggal && d.tglBayar < d.tanggal).length,
  };
}

/* ---------------------------- 5. kartu vendor ---------------------------- */

/* Pemasok jasa (Freight, Storage, Lainnya) pada periode laporan: belanja,
   pangsa, jumlah kiriman yang ditagih, dan perilaku bayarnya. Billing
   (kas negara) bukan pemasok; Tax Advance bukan harga jasa. */
function lapKartuVendor(dana, Y, M, hutang) {
  const baris = (dana || []).filter((d) => d.tahun === Y && d.bulan >= 1 && d.bulan <= M).map(lapLengkapi)
    .filter((d) => ["Freight", "Storage", "Lainnya"].indexOf(d.jenis) >= 0 && d.vendor);
  const peta = new Map();
  baris.forEach((d) => {
    const k = fsumKunci(d.vendor);
    const r = peta.get(k) || { nama: d.vendor, belanja: 0, pengajuan: 0, awb: new Set(), tagih: 0 };
    r.belanja += d.biayaEko;
    r.pengajuan += 1;
    r.tagih += d.tagihan;
    const bagian = Array.isArray(d.perAwb) ? d.perAwb : [];
    if (bagian.length) bagian.forEach((b) => r.awb.add(b.kunci));
    else r.awb.add("tanpa:" + (d.id != null ? d.id : d.nomor));
    peta.set(k, r);
  });
  const hv = new Map(((hutang && hutang.perVendor) || []).map((r) => [fsumKunci(r.nama), r]));
  const total = [...peta.values()].reduce((x, r) => x + r.belanja, 0);
  let kum = 0;
  const daftar = [...peta.values()].sort((a, b) => b.belanja - a.belanja).map((r) => {
    kum += r.belanja;
    const h = hv.get(fsumKunci(r.nama)) || {};
    return {
      nama: r.nama, belanja: r.belanja, porsi: total ? r.belanja / total : 0, kumulatif: total ? kum / total : 0,
      pengajuan: r.pengajuan, kiriman: r.awb.size, perKiriman: r.awb.size ? r.belanja / r.awb.size : null,
      terbuka: h.terbuka || 0, telat: h.telat || 0, tertua: h.tertua || 0, rataHari: h.rataHari != null ? h.rataHari : null, persenTepat: h.persenTepat != null ? h.persenTepat : null,
    };
  });
  return { daftar, total, konsentrasi: lapKonsentrasi(daftar.map((r) => r.belanja)) };
}

/* ---------------------------- 6. kontrol & pengecualian ---------------------------- */

/* Kiriman sudah berjalan tetapi belum ada satu pun tagihan yang tertaut:
   kandidat hutang yang belum dibukukan (accrual). Impor: sejak SPPB /
   sandar; ekspor: sejak berangkat. Tagihan forwarder lazim datang
   1-2 minggu kemudian, jadi baru ditandai setelah 14 hari. */
function lapAkrual(buku, Y, acuan, hari) {
  const lewat = hari == null ? 14 : hari;
  return [...buku.kasus.values()].filter((k) => !lapAdaBiaya(k)).map((k) => {
    const peristiwa = k.buku === "import" ? k.keluar || k.tiba : k.berangkat;
    return { k, peristiwa, umur: peristiwa ? lapSelisihHari(peristiwa, acuan) : null };
  }).filter((x) => x.peristiwa && x.peristiwa.slice(0, 4) === String(Y) && x.peristiwa <= acuan && x.umur >= lewat)
    .sort((a, b) => b.umur - a.umur);
}

/* Biaya jasa kiriman yang jauh di atas kebiasaan jalurnya (modified
   z-score > 3,5). Minimal 6 kiriman per jalur -- kurang dari itu tidak
   ada "kebiasaan" yang bisa dibandingkan. */
function lapPencilan(buku, Y, M) {
  const hasil = [];
  const kohort = [...buku.kasus.values()].filter((k) => lapAdaBiaya(k) && k.biaya.jasa > 0 && k.tahun >= Y - 1 && (k.tahun < Y || (k.tahun === Y && k.bulan <= M)));
  const peta = new Map();
  kohort.forEach((k) => peta.set(k.jalur, (peta.get(k.jalur) || []).concat([k])));
  peta.forEach((isi, jalur) => {
    if (isi.length < 6) return;
    const nilai = isi.map((k) => k.biaya.jasa);
    const z = lapZMod(nilai);
    const med = lapMedian(nilai);
    isi.forEach((k, i) => {
      if (z[i] > 3.5 && k.tahun === Y) hasil.push({ k, jalur, jasa: k.biaya.jasa, median: med, kali: med ? k.biaya.jasa / med : null, z: z[i] });
    });
  });
  return hasil.sort((a, b) => b.z - a.z);
}

/* ---------------------------- 7. pendorong biaya (korelasi) ---------------------------- */

function lapPenggerak(buku, Y, M, bulanan) {
  const hasil = [];
  const kasusBiaya = [...buku.kasus.values()].filter((k) => lapAdaBiaya(k) && k.tahun >= Y - 1 && (k.tahun < Y || (k.tahun === Y && k.bulan <= M)));
  LAP_JALUR_URUT.forEach((jalur) => {
    const isi = kasusBiaya.filter((k) => k.jalur === jalur && k.gw > 0 && k.biaya.jasa > 0);
    const r = lapKorelasi(isi.map((k) => k.gw), isi.map((k) => k.biaya.jasa));
    if (r) hasil.push(Object.assign({ id: "berat:" + jalur, nama: `${jalur}: service cost vs gross weight`, x: "kg", y: "IDR", titik: isi.map((k) => [k.gw, k.biaya.jasa]) }, r));
  });
  const impor = kasusBiaya.filter((k) => k.buku === "import" && k.nilaiBarang > 0 && k.biaya.jasa > 0);
  const rn = lapKorelasi(impor.map((k) => k.nilaiBarang), impor.map((k) => k.biaya.jasa));
  if (rn) hasil.push(Object.assign({ id: "nilai:import", nama: "Imports: service cost vs goods value", x: "IDR", y: "IDR", titik: impor.map((k) => [k.nilaiBarang, k.biaya.jasa]) }, rn));
  const dw = kasusBiaya.filter((k) => k.buku === "import" && k.dwell != null);
  const storage = (k) => k.biaya.jenis.Storage || 0;
  const rs = lapKorelasi(dw.map((k) => k.dwell), dw.map(storage));
  if (rs) hasil.push(Object.assign({ id: "dwell:storage", nama: "Imports: storage cost vs days from arrival to SPPB", x: "days", y: "IDR", titik: dw.map((k) => [k.dwell, storage(k)]) }, rs));
  if (bulanan) {
    const ada = bulanan.pend.map((v, i) => v > 0 && bulanan.ini[i] > 0 && i < M);
    const xs = bulanan.pend.filter((_, i) => ada[i]).concat(bulanan.pendLalu.filter((_, i) => bulanan.lalu[i] > 0 && bulanan.pendLalu[i] > 0));
    const ys = bulanan.ini.filter((_, i) => ada[i]).concat(bulanan.lalu.filter((_, i) => bulanan.lalu[i] > 0 && bulanan.pendLalu[i] > 0));
    const rb = lapKorelasi(xs, ys);
    if (rb) hasil.push(Object.assign({ id: "bulan:pendapatan", nama: "Monthly EXIM spending vs monthly revenue", x: "IDR", y: "IDR", titik: xs.map((x, i) => [x, ys[i]]) }, rb));
  }
  // Lama tertahan menurut jalur kepabeanan
  const petaJalur = new Map();
  kasusBiaya.filter((k) => k.buku === "import" && k.jalurBc).forEach((k) => {
    const g = petaJalur.get(k.jalurBc) || { jalur: k.jalurBc, kasus: 0, dwellN: 0, dwell: 0, lokal: 0 };
    g.kasus += 1;
    if (k.dwell != null) {
      g.dwellN += 1;
      g.dwell += k.dwell;
    }
    g.lokal += (k.biaya.jenis.Storage || 0) + (k.biaya.jenis.Lainnya || 0);
    petaJalur.set(k.jalurBc, g);
  });
  const jalurBc = [...petaJalur.values()].map((g) => Object.assign(g, { rataDwell: g.dwellN ? g.dwell / g.dwellN : null, rataLokal: g.kasus ? g.lokal / g.kasus : null }));
  return { korelasi: hasil, jalurBc };
}

/* ---------------------------- kontrol ---------------------------- */

/* Daftar pemeriksaan kualitas data & pengendalian. status: "ok" | "review".
   Tiap butir menyebut jumlahnya, nilainya (IDR bila relevan), dan apa
   yang dilakukan -- supaya laporan tidak hanya menunjukkan angka tetapi
   juga seberapa jauh angka itu bisa dipercaya. */
function lapKontrol(a) {
  const { buku, rekon, hutang, jembatan } = a.ledger;
  const baris = (a.ledger.dana || []).filter((d) => d.tahun === a.Y && d.bulan >= 1 && d.bulan <= a.M);
  const untukTaut = baris.filter((d) => {
    const h = buku.hasil.get(d);
    return h && h.status !== "trucking";
  });
  const kasUmum = untukTaut.reduce((x, d) => x + Math.abs(lapLengkapi(d).tagihan), 0);
  const kasTertaut = untukTaut.reduce((x, d) => x + Math.abs(buku.hasil.get(d).kasTertaut), 0);
  const kasHasil = (status) => untukTaut.filter((d) => buku.hasil.get(d).status === status);
  const nilai = (arr) => arr.reduce((x, d) => x + Math.abs(lapLengkapi(d).tagihan), 0);
  const tanpaAwb = kasHasil("none");
  const yatim = untukTaut.filter((d) => ["orphan", "partial"].indexOf(buku.hasil.get(d).status) >= 0);
  const butir = [];
  const tambah = (kode, nama, jumlah, uang, ok, saran) => butir.push({ kode, nama, jumlah, uang, status: ok ? "ok" : "review", saran });
  const persenTaut = kasUmum ? kasTertaut / kasUmum : null;
  tambah("link", "Cash linked to a shipment (BL/AWB found in the schedule)", untukTaut.length - tanpaAwb.length - yatim.length, kasTertaut, persenTaut == null || persenTaut >= 0.95,
    persenTaut == null ? "" : `${(persenTaut * 100).toFixed(1)}% of cash requested is linked; target 95%+. Unlinked spending cannot be attributed to a shipment.`);
  tambah("noawb", "Requests without a BL/AWB number (excl. trucking)", tanpaAwb.length, nilai(tanpaAwb), tanpaAwb.length === 0, "Add the BL/AWB so the cost lands on its shipment.");
  tambah("orphan", "BL/AWB not found in the shipment schedule", yatim.length, yatim.reduce((x, d) => x + Math.abs(buku.hasil.get(d).kasYatim), 0), yatim.length === 0, "Typo in the number, or the schedule was never created.");
  tambah("tglinv", "Requests without a vendor invoice date", baris.filter((d) => !d.tglInvoice).length, nilai(baris.filter((d) => !d.tglInvoice)), baris.every((d) => d.tglInvoice), "Cost is placed by request date instead of invoice date.");
  tambah("tempo", "Unpaid requests without a due date", hutang.umur[hutang.umur.length - 1].jumlah, hutang.umur[hutang.umur.length - 1].nilai, hutang.umur[hutang.umur.length - 1].jumlah === 0, "Payables cannot be aged by due date without it.");
  tambah("bayarawal", "Paid before the invoice date", hutang.dibayarSebelumFaktur, 0, hutang.dibayarSebelumFaktur === 0, "Date entry error: treated as paid on the invoice date.");
  tambah("telat", "Payables more than 30 days overdue", hutang.umur.slice(2, 5).reduce((x, u) => x + u.jumlah, 0), hutang.umur.slice(2, 5).reduce((x, u) => x + u.nilai, 0), hutang.umur.slice(2, 5).every((u) => !u.jumlah), "Follow up payment with HQ finance or confirm the invoice is disputed.");
  tambah("kurs", "Foreign-currency requests without an exchange rate", baris.filter((d) => d.mata && d.mata !== "IDR" && !d.kurs).length, 0, baris.every((d) => !(d.mata && d.mata !== "IDR" && !d.kurs)), "These are counted as zero until a shipment with an NDPBM exists.");
  tambah("inv", "Export invoices not linked to a shipment", buku.pendapatanYatim.filter((v) => v.tahun === a.Y && v.bulan <= a.M).length, buku.pendapatanYatim.filter((v) => v.tahun === a.Y && v.bulan <= a.M).reduce((x, v) => x + v.jumlah, 0), buku.pendapatanYatim.filter((v) => v.tahun === a.Y && v.bulan <= a.M).length === 0, "Revenue cannot be matched to its shipping cost. Pick the shipment in the invoice.");
  tambah("akrual", "Shipments under way with no cost recorded (14+ days)", a.ledger.akrual.length, 0, a.ledger.akrual.length === 0, "Possible unbooked liabilities: ask the forwarder for the invoice.");
  tambah("bea", "Duties & taxes not matching the PIB", rekon.masalah.length, rekon.masalah.reduce((x, b) => x + Math.abs(b.selisih), 0), rekon.masalah.length === 0, "Compare the Billing/Tax Advance request with the PIB amounts in Customs & Charges.");
  tambah("pencilan", "Shipments with unusually high service cost", a.ledger.pencilan.length, a.ledger.pencilan.reduce((x, p) => x + p.jasa, 0), a.ledger.pencilan.length === 0, "Check for a duplicated or mis-keyed invoice, or an extra charge such as demurrage.");
  return { butir, persenTaut, jumlahReview: butir.filter((b) => b.status === "review").length, jembatan };
}

/* ---------------------------- daftar datar (Excel / pivot) ---------------------------- */

/* Satu baris per kiriman di jadwal -- semua tahun --, lengkap dengan
   biaya yang tertaut padanya, supaya bisa di-pivot tanpa menebak. */
function lapDaftarKiriman(buku, toleransi) {
  const tol = toleransi == null ? 1000 : toleransi;
  return [...buku.kasus.values()].map((k) => {
    const ada = lapAdaBiaya(k);
    const nilai = lapNilaiKasus(k);
    const biaya = lapBiayaKasus(k);
    return { k, ada, nilai, biaya, persen: ada && nilai ? biaya / nilai : null, pulih: k.biaya.ppnJasa + k.biaya.ppnImpor + k.biaya.pph22, statusBea: lapStatusBea(k, tol) };
  }).sort((a, b) => (a.k.tanggal === b.k.tanggal ? (a.k.id < b.k.id ? -1 : 1) : a.k.tanggal < b.k.tanggal ? -1 : 1));
}

/* Tautan pengajuan -> kiriman: satu baris per (pengajuan, kiriman). Bagian
   yang tidak tertaut (BL/AWB tak ditemukan, tanpa BL/AWB, trucking) tetap
   muncul, jadi jumlah kolom `kas` selalu menutup ke total uang yang diminta. */
function lapDaftarTautan(buku, dana) {
  const baris = [];
  (dana || []).forEach((d0) => {
    const h = buku.hasil.get(d0);
    if (!h) return;
    const d = lapLengkapi(d0);
    const u = lapUrai(d);
    const tambah = (k, kunci, porsi, status) => baris.push({ d: d0, k, kunci, porsi, status, kas: u.kas * porsi, biaya: d.biayaEko * porsi, pulih: d.pulih * porsi });
    let ada = 0;
    (h.taut || []).forEach((bg) => {
      ada += bg.porsi;
      tambah(buku.kasus.get(bg.id) || null, bg.kunci, bg.porsi, "linked");
    });
    (h.tak || []).forEach((bg) => {
      ada += bg.porsi;
      tambah(null, bg.kunci, bg.porsi, "orphan");
    });
    if (1 - ada > 1e-9) tambah(null, "", 1 - ada, h.status === "trucking" ? "trucking" : "none");
  });
  return baris;
}

/* ---------------------------- perakit ---------------------------- */

/* Semua analisis buku besar untuk satu periode. `o.kiriman` wajib (daftar
   jadwal); tanpa kiriman, yang dihitung hanya yang tidak butuh jadwal. */
function lapAnalisisBuku(dana, invoice, kiriman, Y, M, o) {
  const opsi = o || {};
  const hariIni = opsi.hariIni || (typeof todayISO === "function" ? todayISO() : "");
  const buku = lapBangunBuku(dana, invoice, kiriman || [], opsi);
  const jembatan = lapJembatan(dana, Y, M);
  const hutang = lapHutang(dana, Y, M, hariIni);
  const ekonomi = lapEkonomi(buku, Y, M);
  const rekon = lapRekonBea(buku, Y, M);
  const akrual = lapAkrual(buku, Y, hutang.acuan, 14);
  const pencilan = lapPencilan(buku, Y, M);
  const kartu = lapKartuVendor(dana, Y, M, hutang);
  const penggerak = lapPenggerak(buku, Y, M, opsi.bulanan);
  return { dana: dana || [], buku, jembatan, hutang, ekonomi, rekon, akrual, pencilan, kartu, penggerak };
}
