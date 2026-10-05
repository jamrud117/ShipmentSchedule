"use strict";

/* ==================================================================
   LAPORAN PENGELUARAN EXIM (EXIM Spending Report) — analisis anggaran,
   perbandingan bulanan & tahunan, peramalan tahun depan, ditambah detail
   biaya angkut dalam format laporan transportasi DD Korea.

   Bagian analisis (hitungAnalisis): realisasi vs tahun lalu (YoY) & vs
   bulan sebelumnya (MoM), statistik bulanan, rincian per jenis / moda /
   vendor / customer, proyeksi tahun berjalan, ramalan tahun depan
   (tiga metode, median-nya), anggaran yang disarankan + pembagian per
   bulan menurut pola musiman.

   SELURUH LAPORAN BERBAHASA INGGRIS -- tab Report maupun berkas
   Excel-nya, apa pun bahasa aplikasi: laporannya dikirim ke kantor
   pusat. Karena itu teks di berkas ini ditulis langsung (bukan lewat
   tt()), bulan & angka bergaya Inggris (July, 1,234.5).

   Bagian laporan rujukan, dipetakan ke data sistem:

     monthly sales / transport cost / cost ratio
        -> Sales (tab Invoice Number, nilai barang jadwal tertaut),
           Transport cost (Pengajuan Dana), cost / sales
     cost by transport means (air / sea / vehicle)
        -> per Moda Angkut: Air / Sea / Vehicle (isian baru di
           Pengajuan Dana; kosong = ikut Jenis Transaksi)
     cumulative average                 -> rata-rata Jan s.d. bulan dipilih
     trade terms F / C / D / E          -> Terms of Delivery invoice ->
                                           kelompok Incoterm
     sales by product                   -> per Jenis Barang
     cost by vendor (zero-rated / taxable)
                                        -> per vendor & moda: tanpa PPN /
                                           kena PPN (DPP, sebelum PPN)
     cost by customer                   -> per customer per bulan
     count & ratio by freight type      -> jumlah pengajuan per moda
     budget usage                       -> pemakaian anggaran biaya angkut

   Tidak dibawa: voucher logistik pemerintah Korea -- tidak ada
   padanannya di Indonesia.

   Biaya dihitung SEBELUM PPN (DPP), seperti kolom zero-rated + taxable
   di laporan rujukan: PPN masukan bukan biaya. Pengajuan dalam USD
   dikonversi dengan kurs yang sama dengan penjualan.
================================================================== */

const LAPORAN_TAB = "__laporan__";

const LAP_MODA = ["udara", "laut", "darat"];
function lapNamaModa(m) {
  return (
    {
      udara: "Air",
      laut: "Sea",
      darat: "Vehicle (Truck)",
    }[m] || "Not set"
  );
}

/* Jenis pengeluaran yang masuk laporan. Billing & Tax Advance (bea
   masuk, pajak) bukan biaya angkut -- tidak dihitung kecuali dipilih. */
const LAP_JENIS = ["Freight", "Storage", "Lainnya", "Billing", "Tax Advance"];
const LAP_JENIS_AWAL = ["Freight", "Storage", "Lainnya"];

/* Saringan layar. TANPA kurs: pembayaran (Pengajuan Dana) semuanya IDR;
   penjualan USD (bagian detail transportasi) dikonversi otomatis dengan
   NDPBM terbaru. Semua jenis pengeluaran dihitung -- ini laporan
   ANGGARAN EXIM, bukan hanya biaya angkut; centang untuk mengecualikan. */
const lapSaringan = { tahun: "", bulan: "", jenis: LAP_JENIS.slice() };
let lapData = null;

/* ---------------------------- pemetaan ---------------------------- */

/* Moda angkut sebuah pengajuan: isiannya sendiri; kalau kosong, dari
   Jenis Transaksi (Sea -> Laut, Air -> Udara, Local Sale -> Darat). */
/* Moda dari JENIS TRANSAKSI: Sea -> laut, Air -> udara, Local Sale ->
   darat (truk). Isian Moda Angkut lama hanya dibaca untuk pengajuan
   terdahulu yang tidak punya Jenis Transaksi. */
function lapModa(p) {
  const m = String((p && p.transportMode) || "").toLowerCase();
  const t = String((p && p.transactionType) || "");
  if (/^air/i.test(t)) return "udara";
  if (/^sea/i.test(t)) return "laut";
  if (/local/i.test(t)) return "darat";
  return LAP_MODA.indexOf(m) >= 0 ? m : "";
}

/* Terms of Delivery -> kelompok Incoterm (E/F/C/D), seperti trade terms. */
function lapKelompokSyarat(teks) {
  const m = String(teks || "")
    .toUpperCase()
    .match(/\b(EXW|FCA|FAS|FOB|CFR|CNF|C&F|CIF|CPT|CIP|DAP|DPU|DAT|DDP|DDU)\b/);
  if (!m) return "-";
  const k = m[1];
  if (k === "EXW") return "E";
  if (k === "FCA" || k === "FAS" || k === "FOB") return "F";
  if (["CFR", "CNF", "C&F", "CIF", "CPT", "CIP"].indexOf(k) >= 0) return "C";
  return "D";
}
const lapAngka = (v) => {
  const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};

/* Satu pengajuan dana -> angka laporan (IDR, sebelum PPN). */
/* Kurs untuk satu transaksi: `kurs` boleh angka (satu kurs untuk semua)
   atau fungsi (mata, tanggal) -> kurs -- yang dipakai laporan: kurs pajak
   KMK yang berlaku pada tanggal transaksinya. */
const lapKursUntuk = (kurs, mata, tanggal) =>
  mata === "IDR" ? 1 : typeof kurs === "function" ? Number(kurs(mata, tanggal)) || 0 : Number(kurs) || 0;

function lapBarisDana(row, kurs) {
  const p = (row && row.payload) || {};
  const tanggal = fsumTanggal(row) || "";
  const mata = String(p.currency || "IDR").toUpperCase();
  const faktor = lapKursUntuk(kurs, mata, tanggal);
  let dpp = 0;
  let kenaPpn = 0;
  let ppn = 0;
  if (Array.isArray(p.lines) && p.lines.length) {
    const t = fundLineTotals(p.lines);
    dpp = t.totalNet;
    kenaPpn = t.dppPph;
    ppn = t.totalPpn;
  } else {
    dpp = frTotalPengajuan(p);
  }
  return {
    id: row.id,
    nomor: row.doc_number || "",
    tanggal,
    tahun: Number(tanggal.slice(0, 4)) || 0,
    bulan: Number(tanggal.slice(5, 7)) || 0,
    // Dasar tanggal: TANGGAL INVOICE vendor (bukan tanggal bayar)
    tglInvoice: String(p.invoiceDate || ""),
    vendor: String(p.payee || "").trim(),
    customer: String(p.customer || "").trim(),
    moda: lapModa(p),
    jenis: String(p.expenseType || "").trim(),
    transaksi: String(p.transactionType || "").trim(),
    mata,
    // Pembayaran: tanggal lunas & nilai yang dibayar (termasuk PPN, setelah PPh)
    tglBayar: String(p.paidAt || "").slice(0, 10),
    tagihan: frTotalPengajuan(p) * faktor,
    blAwb: String(p.blAwb || "").trim().toUpperCase(),
    tanpaPpn: (dpp - kenaPpn) * faktor,
    kenaPpn: kenaPpn * faktor,
    ppn: ppn * faktor,
    total: dpp * faktor,
    catatan: String(p.notes || "").trim(),
  };
}

/* Satu invoice penjualan -> angka laporan (IDR). Barangnya dari jadwal
   ekspor yang ditautkan -- sumber yang sama dengan kolom Amount. */
function lapBarisInvoice(row, kurs) {
  const p = (row && row.payload) || {};
  const tanggal = String(row.doc_date || "");
  const nilai = typeof dnNilaiInvoice === "function" ? dnNilaiInvoice(row) : null;
  const mata = String((nilai && nilai.mata) || p.currency || "USD").toUpperCase();
  const faktor = lapKursUntuk(kurs, mata, tanggal);
  const jadwal = p.shipmentId && typeof ciplCariShipment === "function" ? ciplCariShipment(p.shipmentId) : null;
  const jumlahBarang = jadwal ? (jadwal.items || []).length : 0;
  const jumlah = nilai ? nilai.total : lapAngka(p.amount);
  return {
    id: row.id,
    nomor: row.doc_number || "",
    tanggal,
    tahun: Number(tanggal.slice(0, 4)) || 0,
    bulan: Number(tanggal.slice(5, 7)) || 0,
    customer: String(p.customer || "").trim(),
    syaratTeks: String(p.termsDelivery || "").trim(),
    syarat: lapKelompokSyarat(p.termsDelivery),
    mata,
    // Ekspor ditagih dalam valuta asing; Local Sale dalam IDR
    kanal: mata === "IDR" ? "Local Sale" : "Export",
    kurs: faktor,
    jumlahAsli: jumlah,
    jumlah: jumlah * faktor,
    // QTY = jumlah baris barang pada jadwal yang ditautkan
    qty: jumlahBarang || (jumlah ? 1 : 0),
  };
}

/* Kurs bawaan: NDPBM jadwal terbaru -- kurs pajak yang memang dipakai
   DDI; bisa diganti di laporan. */
function lapKursBawaan() {
  const semua = typeof data !== "undefined" && data ? (data.import || []).concat(data.export || []) : [];
  const dengan = semua.filter((s) => lapAngka(s.ndpbm) > 1000).sort((a, b) => String(b.etd || "").localeCompare(String(a.etd || "")));
  return dengan.length ? Math.round(lapAngka(dengan[0].ndpbm)) : 16000;
}

/* ---------------------------- hitungan ---------------------------- */

const lapModaKosong = () => ({ udara: 0, laut: 0, darat: 0, lain: 0 });

/* MODA + ARAH: "Air Import", "Sea Export", "Local Sale" -- semuanya dari
   Jenis Transaksi. Laut/udara selalu jelas impor atau ekspornya. */
function lapArah(transaksi) {
  const t = String(transaksi || "");
  if (/import/i.test(t)) return "Import";
  if (/export/i.test(t)) return "Export";
  if (/local/i.test(t)) return "Local Sale";
  return "";
}
function lapModaArah(d) {
  const arah = lapArah(d.transaksi);
  // Local Sale: penjualan dalam negeri -- cukup namanya, tanpa moda
  if (arah === "Local Sale") return "Local Sale";
  if (d.moda === "udara") return arah ? `Air ${arah}` : "Air (direction not set)";
  if (d.moda === "laut") return arah ? `Sea ${arah}` : "Sea (direction not set)";
  if (d.moda === "darat") return "Truck";
  return "Mode not set";
}
const lapKeyModa = (m) => (LAP_MODA.indexOf(m) >= 0 ? m : "lain");

/* SELURUH angka laporan dari baris yang sudah dipetakan. Fungsi murni:
   tanpa DOM, tanpa database -- yang sama dipakai layar dan Excel. */
function hitungLaporanBiaya(dana, invoice, opsi) {
  const o = opsi || {};
  const tahun = Number(o.tahun);
  const bulan = Number(o.bulan);
  const jenis = o.jenis || LAP_JENIS_AWAL;
  const biaya = (dana || []).filter((d) => d.tahun === tahun && d.bulan >= 1 && jenis.indexOf(d.jenis) >= 0);
  const jual = (invoice || []).filter((v) => v.tahun === tahun && v.bulan >= 1);

  const bulanan = Array.from({ length: 12 }, () => ({
    penjualan: 0, qty: 0, biaya: 0, rasio: 0, moda: lapModaKosong(), jumlahModa: lapModaKosong(), jumlah: 0,
  }));
  biaya.forEach((d) => {
    const b = bulanan[d.bulan - 1];
    b.biaya += d.total;
    b.moda[lapKeyModa(d.moda)] += d.total;
    b.jumlahModa[lapKeyModa(d.moda)] += 1;
    b.jumlah += 1;
  });
  jual.forEach((v) => {
    const b = bulanan[v.bulan - 1];
    b.penjualan += v.jumlah;
    b.qty += v.qty;
  });
  bulanan.forEach((b) => (b.rasio = b.penjualan ? b.biaya / b.penjualan : 0));

  const porsi = (moda, total) => {
    const out = lapModaKosong();
    Object.keys(moda).forEach((k) => (out[k] = total ? moda[k] / total : 0));
    return out;
  };
  const ini = bulanan[bulan - 1] || bulanan[0];
  const bulanIni = { penjualan: ini.penjualan, biaya: ini.biaya, rasio: ini.rasio, moda: ini.moda, porsi: porsi(ini.moda, ini.biaya) };

  // Rata-rata Januari s.d. bulan dipilih (cumulative average)
  const lewat = bulanan.slice(0, Math.max(1, bulan));
  const rata = (f) => lewat.reduce((s, b) => s + f(b), 0) / lewat.length;
  const modaRata = lapModaKosong();
  Object.keys(modaRata).forEach((k) => (modaRata[k] = rata((b) => b.moda[k])));
  const rataPenjualan = rata((b) => b.penjualan);
  const rataBiaya = rata((b) => b.biaya);
  const rataKumulatif = {
    penjualan: rataPenjualan, biaya: rataBiaya, rasio: rataPenjualan ? rataBiaya / rataPenjualan : 0,
    moda: modaRata, porsi: porsi(modaRata, rataBiaya),
  };

  // Per vendor & moda -- bulan dipilih (cost by vendor)
  const petaVendor = new Map();
  biaya.filter((d) => d.bulan === bulan).forEach((d) => {
    const k = fsumKunci(d.vendor) || "-";
    if (!petaVendor.has(k)) petaVendor.set(k, { vendor: d.vendor || "-", moda: {}, tanpaPpn: 0, kenaPpn: 0, total: 0 });
    const v = petaVendor.get(k);
    const m = lapKeyModa(d.moda);
    v.moda[m] = v.moda[m] || { tanpaPpn: 0, kenaPpn: 0, total: 0 };
    v.moda[m].tanpaPpn += d.tanpaPpn;
    v.moda[m].kenaPpn += d.kenaPpn;
    v.moda[m].total += d.total;
    v.tanpaPpn += d.tanpaPpn;
    v.kenaPpn += d.kenaPpn;
    v.total += d.total;
  });
  const vendor = [...petaVendor.values()].sort((a, b) => b.total - a.total);

  // Per customer per bulan (cost by customer)
  const petaCust = new Map();
  biaya.forEach((d) => {
    const k = fsumKunci(d.customer) || "-";
    if (!petaCust.has(k)) {
      petaCust.set(k, { customer: d.customer || "-", bulan: Array.from({ length: 12 }, () => lapModaKosong()), total: 0 });
    }
    const c = petaCust.get(k);
    c.bulan[d.bulan - 1][lapKeyModa(d.moda)] += d.total;
    c.total += d.total;
  });
  const customer = [...petaCust.values()].sort((a, b) => b.total - a.total);

  return { tahun, bulan, bulanan, bulanIni, rataKumulatif, vendor, customer, biaya, jual };
}

/* Pemakaian anggaran (budget usage). */
function hitungAnggaran(lap, anggaran) {
  const a = anggaran || {};
  const berubah = lapAngka(a.berubah) || lapAngka(a.tahunan);
  const total = lap.bulanan.slice(0, lap.bulan).reduce((s, b) => s + b.biaya, 0);
  return {
    tahunan: lapAngka(a.tahunan),
    berubah,
    bulanIni: lap.bulanan[lap.bulan - 1] ? lap.bulanan[lap.bulan - 1].biaya : 0,
    total,
    sisa: berubah - total,
    persen: berubah ? total / berubah : 0,
  };
}

/* ---------------------------- data ---------------------------- */

async function lapAmbilInvoice() {
  const semua = [];
  for (let mulai = 0; mulai < 50 * FSUM_PER_AMBIL; mulai += FSUM_PER_AMBIL) {
    const { data: hasil, error } = await supabaseClient
      .from("document_numbers")
      .select("id, doc_number, doc_date, payload")
      .eq("doc_type", "invoice")
      .order("doc_date", { ascending: false })
      .range(mulai, mulai + FSUM_PER_AMBIL - 1);
    if (error) throw error;
    semua.push(...(hasil || []));
    if (!hasil || hasil.length < FSUM_PER_AMBIL) break;
  }
  return semua;
}

/* Anggaran tersimpan di tabel report_settings (migration-report-settings.sql).
   Tabel belum dibuat -> laporan tetap jalan, bagian anggarannya memberi
   tahu cara mengaktifkannya. */
const lapKunciAnggaran = (tahun) => `anggaran-biaya-angkut-${tahun}`;
async function lapAmbilAnggaran(tahun) {
  const { data: hasil, error } = await supabaseClient
    .from("report_settings")
    .select("key, value")
    .eq("key", lapKunciAnggaran(tahun))
    .maybeSingle();
  if (error) return { gagal: true };
  return (hasil && hasil.value) || {};
}

async function renderLaporanBiaya(box, bar) {
  if (bar) bar.innerHTML = "";
  box.innerHTML = `<div class="docnum-empty">Loading report…</div>`;
  try {
    const [dana, invoice, kursPajak] = await Promise.all([
      fsumAmbilSemua(),
      lapAmbilInvoice(),
      typeof muatKursPajak === "function" ? muatKursPajak() : Promise.resolve({ periode: [] }),
    ]);
    lapData = { dana, invoice, kursPajak, anggaran: null };
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="docnum-empty">The report failed to load. Please try again.</div>`;
    return;
  }
  const hariIni = todayISO();
  if (!lapSaringan.tahun) lapSaringan.tahun = hariIni.slice(0, 4);
  if (!lapSaringan.bulan) lapSaringan.bulan = String(Number(hariIni.slice(5, 7)));
  lapData.anggaran = await lapAmbilAnggaran(lapSaringan.tahun).catch(() => ({ gagal: true }));
  lapGambar(box);
}

/* ---------------------------- statistik ---------------------------- */

function lapStat(nilai) {
  const a = (nilai || []).map(Number).filter((x) => isFinite(x));
  const n = a.length;
  if (!n) return { n: 0, total: 0, mean: 0, median: 0, sd: 0, cv: 0, min: 0, max: 0 };
  const total = a.reduce((s, x) => s + x, 0);
  const mean = total / n;
  const urut = a.slice().sort((x, y) => x - y);
  const median = n % 2 ? urut[(n - 1) / 2] : (urut[n / 2 - 1] + urut[n / 2]) / 2;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n);
  return { n, total, mean, median, sd, cv: mean ? sd / mean : 0, min: urut[0], max: urut[n - 1] };
}

const lapJumlah = (a) => a.reduce((s, x) => s + (Number(x) || 0), 0);
const lapBatas = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lapPerubahan = (baru, lama) => (lama ? baru / lama - 1 : null);

/* Garis tren kuadrat terkecil y = a + b.t -- dipakai salah satu metode
   peramalan. Mengembalikan null kalau titiknya kurang dari 6. */
function lapTren(titik) {
  const n = titik.length;
  if (n < 6) return null;
  const mx = lapJumlah(titik.map((p) => p.x)) / n;
  const my = lapJumlah(titik.map((p) => p.y)) / n;
  let sxx = 0;
  let sxy = 0;
  titik.forEach((p) => {
    sxx += (p.x - mx) * (p.x - mx);
    sxy += (p.x - mx) * (p.y - my);
  });
  if (!sxx) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/* ------------------------------------------------------------------
   ANALISIS ANGGARAN & PERAMALAN — seperti yang disusun analis data:

   - realisasi tahun berjalan (YTD) vs periode yang sama tahun lalu;
   - bulan dipilih vs bulan sebelumnya (MoM) & bulan yang sama tahun lalu;
   - statistik bulanan (rata-rata, median, simpangan, koefisien variasi);
   - rincian per jenis pengeluaran, moda, vendor, customer -- naik/turun
     dibanding tahun lalu dan porsinya;
   - proyeksi tahun berjalan & peramalan tahun depan dengan tiga metode
     (pertumbuhan, tren linear, laju berjalan), diambil median-nya, lalu
     anggaran yang disarankan = ramalan + cadangan menurut volatilitas;
   - pembagian ramalan per bulan mengikuti pola musiman riwayatnya.

   Fungsi murni: yang sama dipakai layar dan Excel, dan diuji.
------------------------------------------------------------------ */
/* Proyeksi tahun berjalan & ramalan tahun depan untuk SATU deret
   bulanan (pengeluaran atau pendapatan): pertumbuhan, tren linear, laju
   berjalan -- dan median-nya sebagai ramalan dasar. */
function lapRamal(ini, lalu, M, Y, mulai) {
  const awal = mulai || 1;
  const bulanEfektif = Math.max(1, M - awal + 1);
  const ytd = lapJumlah(ini.slice(0, M));
  const ytdLalu = lapJumlah(lalu.slice(0, M));
  const totalLalu = lapJumlah(lalu);
  const yoy = lapPerubahan(ytd, ytdLalu);
  const g = yoy == null ? null : lapBatas(yoy, -0.5, 1);
  /* Laju berjalan dibagi bulan yang TERCATAT, bukan bulan kalender:
     sistem yang mulai dipakai Agustus tidak berarti Januari-Juli nol. */
  const runRate = (ytd / bulanEfektif) * 12;
  const musiman = totalLalu > 0 ? ytd + lapJumlah(lalu.slice(M)) * (1 + (g || 0)) : null;
  const proyeksiIni = M === 12 && awal === 1 ? ytd : musiman != null ? musiman : runRate;
  const metode = [{
    id: "pertumbuhan",
    nama: g == null ? "Projection (no prior-year data)" : "Growth-adjusted",
    nilai: proyeksiIni * (1 + (g == null ? 0 : lapBatas(g, -0.3, 0.5))),
    catatan: g == null
      ? `${Y} projected full year; no ${Y - 1} data to measure growth`
      : `${Y} projected full year × (1 ${g >= 0 ? "+" : "−"} ${Math.abs(lapBatas(g, -0.3, 0.5) * 100).toFixed(1)}% YoY growth)`,
  }];
  const titik = [];
  [Y - 1, Y].forEach((y) => {
    (y === Y ? ini : lalu).forEach((v, i) => {
      if (y === Y && i >= M) return;
      titik.push({ x: (y - (Y - 1)) * 12 + i, y: v });
    });
  });
  while (titik.length && !titik[0].y) titik.shift(); // mulai dari bulan pertama yang ada datanya
  const tren = lapTren(titik);
  if (tren) {
    let jml = 0;
    for (let i = 0; i < 12; i++) jml += Math.max(0, tren.a + tren.b * (24 + i));
    metode.push({ id: "tren", nama: "Linear trend", nilai: jml, catatan: `Least-squares trend over ${titik.length} months, extended to ${Y + 1}` });
  }
  metode.push({ id: "laju", nama: "Run-rate", nilai: proyeksiIni, catatan: `${Y} projected full year (${bulanEfektif} recorded month${bulanEfektif > 1 ? "s" : ""}), held flat` });
  const urut = metode.map((m) => m.nilai).sort((a, b) => a - b);
  const dasar = urut.length % 2 ? urut[(urut.length - 1) / 2] : (urut[urut.length / 2 - 1] + urut[urut.length / 2]) / 2;
  return { ytd, ytdLalu, totalLalu, yoy, g, runRate, proyeksiIni, metode, dasar, rendah: urut[0], tinggi: urut[urut.length - 1], bulanEfektif };
}

/* PERBANDINGAN VENDOR -- siapa lebih murah untuk jalur yang sama.

   Hanya biaya JASA vendor (Freight, Storage, Lainnya): bea & pajak
   (Billing, Tax Advance) adalah titipan negara, bukan harga vendor.
   Per jalur (Air Import, Sea Export, ...) dan per vendor:
     kiriman      = nomor BL/AWB berbeda yang ditagih (pengajuan tanpa
                    BL/AWB dihitung satu kiriman masing-masing)
     total        = DPP (sebelum PPN) semua pengajuannya
     per kiriman  = total / kiriman
     per kg (GW)  = total pengajuan yang BL/AWB-nya cocok dengan jadwal
                    / gross weight jadwal-jadwal itu -- GW dipakai
                    sebagai berat tagih akhir.
   Termurah: per kg kalau minimal dua vendor di jalur itu punya angka per
   kg; kalau tidak, rata-rata per kiriman. */
function lapBandingVendor(baris, Y, M, kiriman) {
  const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pecah = (x) => String(x || "").split(/[\/,;|\r\n]+/).map(norm).filter((k) => k.length >= 5);
  const gwKunci = new Map();
  (kiriman || []).forEach((s) => {
    const gw = typeof computeCustoms === "function" ? Number(computeCustoms(s).totalBruto) || 0
      : (s.items || []).reduce((x, it) => x + (Number(it.bruto) || 0), 0);
    pecah([s.masterBL, s.houseBL].filter(Boolean).join("/")).forEach((k) => gwKunci.set(k, { id: s.id, gw }));
  });
  const grup = new Map();
  (baris || [])
    .filter((d) => d.tahun === Y && d.bulan <= M && d.vendor && ["Billing", "Tax Advance"].indexOf(d.jenis) < 0)
    .forEach((d) => {
      const jalur = lapModaArah(d);
      const kunci = jalur + "|" + fsumKunci(d.vendor);
      const g = grup.get(kunci) || { jalur, vendor: d.vendor, total: 0, bl: new Set(), tanpaBl: 0, totalCocok: 0, gwKiriman: new Map() };
      g.total += d.total;
      const bl = pecah(d.blAwb);
      if (!bl.length) g.tanpaBl += 1;
      bl.forEach((k) => g.bl.add(k));
      const cocok = bl.map((k) => gwKunci.get(k)).filter((x) => x && x.gw > 0);
      if (cocok.length) {
        g.totalCocok += d.total;
        cocok.forEach((x) => g.gwKiriman.set(x.id, x.gw));
      }
      grup.set(kunci, g);
    });
  const perJalur = new Map();
  grup.forEach((g) => {
    const kirimanN = g.bl.size + g.tanpaBl;
    const gw = [...g.gwKiriman.values()].reduce((x, v) => x + v, 0);
    const v = { vendor: g.vendor, kiriman: kirimanN, total: g.total, perKiriman: kirimanN ? g.total / kirimanN : null, gw, perKg: gw ? g.totalCocok / gw : null };
    if (!perJalur.has(g.jalur)) perJalur.set(g.jalur, []);
    perJalur.get(g.jalur).push(v);
  });
  return [...perJalur.entries()].map(([jalur, vendor]) => {
    const pakaiKg = vendor.filter((v) => v.perKg != null).length >= 2;
    const ukur = (v) => (pakaiKg ? v.perKg : v.perKiriman);
    vendor.sort((a, b) => (ukur(a) == null) - (ukur(b) == null) || (ukur(a) || 0) - (ukur(b) || 0) || b.total - a.total);
    const banding = vendor.filter((v) => ukur(v) != null);
    if (banding.length >= 2) banding[0].termurah = true;
    return { jalur, dasar: pakaiKg ? "kg" : "kiriman", vendor };
  }).sort((a, b) => b.vendor.reduce((x, v) => x + v.total, 0) - a.vendor.reduce((x, v) => x + v.total, 0));
}

function hitungAnalisis(dana, opsi) {
  const o = opsi || {};
  const Y = Number(o.tahun);
  const M = lapBatas(Number(o.bulan) || 12, 1, 12);
  const jenis = o.jenis || LAP_JENIS;
  const baris = (dana || []).filter((d) => d.bulan >= 1 && jenis.indexOf(d.jenis) >= 0);
  const perTahun = (y) => {
    const b = Array(12).fill(0);
    baris.filter((d) => d.tahun === y).forEach((d) => (b[d.bulan - 1] += d.total));
    return b;
  };
  const ini = perTahun(Y);
  const lalu = perTahun(Y - 1);
  const dalamPeriode = (d, y) => d.tahun === y && d.bulan <= M;

  const ytd = lapJumlah(ini.slice(0, M));
  const ytdLalu = lapJumlah(lalu.slice(0, M));
  const totalLalu = lapJumlah(lalu);
  const adaLalu = totalLalu > 0;
  /* BULAN PERTAMA YANG TERCATAT (pengeluaran atau pendapatan, tahun mana
     pun). Sebelum itu bukan "nol" -- belum tercatat. Rata-rata, laju
     berjalan, statistik, dan pola musiman hanya memakai bulan sejak itu. */
  const indeks = baris.map((d) => d.tahun * 12 + d.bulan - 1)
    .concat((o.invoice || []).filter((v) => v.bulan >= 1).map((v) => v.tahun * 12 + v.bulan - 1));
  const pertama = indeks.length ? Math.min(...indeks) : Y * 12;
  const mulai = pertama >= Y * 12 ? Math.min(12, pertama - Y * 12 + 1) : 1;
  const bulanEfektif = Math.max(1, M - mulai + 1);
  const yoy = lapPerubahan(ytd, ytdLalu);
  const bulanIni = ini[M - 1];
  const bulanSebelum = M > 1 ? ini[M - 2] : lalu[11];
  const mom = lapPerubahan(bulanIni, bulanSebelum);
  const yoyBulan = lapPerubahan(bulanIni, lalu[M - 1]);
  const statIni = lapStat(ini.slice(mulai - 1, M));

  // Proyeksi tahun berjalan & ramalan tahun depan (tiga metode dasar)
  const ramal = lapRamal(ini, lalu, M, Y, mulai);
  const g = ramal.g;
  const runRate = ramal.runRate;
  const proyeksiIni = ramal.proyeksiIni;
  const metode = ramal.metode.slice();

  /* PENDAPATAN -- nilai invoice dari tab Invoice Number: patokan berapa
     yang dijual vs berapa yang dikeluarkan. Ekspor (valas) dikonversi
     dengan kurs pajak tanggal invoicenya; Local Sale sudah IDR. */
  const jual = (o.invoice || []).filter((v) => v.bulan >= 1);
  const jualPerTahun = (y) => {
    const arr = Array(12).fill(0);
    jual.filter((v) => v.tahun === y).forEach((v) => (arr[v.bulan - 1] += v.jumlah));
    return arr;
  };
  const pend = jualPerTahun(Y);
  const pendLalu = jualPerTahun(Y - 1);
  /* USD ASLI per bulan (nilai di tab Invoice Number) & rupiahnya -- supaya
     tiap angka rupiah bisa dirunut ke dolar dan kurs yang dipakai. */
  const usdPerTahun = (y, idr) => {
    const arr = Array(12).fill(0);
    jual.filter((v) => v.tahun === y && v.mata === "USD").forEach((v) => (arr[v.bulan - 1] += idr ? v.jumlah : v.jumlahAsli));
    return arr;
  };
  const pendUsd = usdPerTahun(Y, false);
  const pendUsdIdr = usdPerTahun(Y, true);
  const pendUsdLalu = usdPerTahun(Y - 1, false);
  const pendYtd = lapJumlah(pend.slice(0, M));
  const pendUsdYtd = lapJumlah(jual.filter((v) => v.mata === "USD" && v.tahun === Y && v.bulan <= M).map((v) => v.jumlahAsli));
  const pendYtdLalu = lapJumlah(pendLalu.slice(0, M));
  const rasio = pendYtd ? ytd / pendYtd : null;
  const rasioLalu = pendYtdLalu ? ytdLalu / pendYtdLalu : null;
  const ramalPend = pendYtd ? lapRamal(pend, pendLalu, M, Y, mulai) : null;
  /* Metode keempat, cara penganggaran yang paling lazim: ramalan
     pendapatan x rasio pengeluaran terhadap pendapatan. */
  if (ramalPend && rasio != null) {
    metode.push({
      id: "pendapatan",
      nama: "Revenue-driven",
      nilai: ramalPend.dasar * rasio,
      catatan: `${Y + 1} revenue forecast ${lapFmtJt(ramalPend.dasar)} × ${(rasio * 100).toFixed(2)}% spending-to-revenue ratio (${Y} YTD)`,
    });
  }
  const kanal = ["Export", "Local Sale"].map((k) => {
    const isiK = lapJumlah(jual.filter((v) => v.kanal === k && v.tahun === Y && v.bulan <= M).map((v) => v.jumlah));
    const laluK = lapJumlah(jual.filter((v) => v.kanal === k && v.tahun === Y - 1 && v.bulan <= M).map((v) => v.jumlah));
    return { nama: k, ini: isiK, lalu: laluK, yoy: lapPerubahan(isiK, laluK), porsi: pendYtd ? isiK / pendYtd : 0,
      jumlah: jual.filter((v) => v.kanal === k && v.tahun === Y && v.bulan <= M).length };
  });

  const urutM = metode.map((m) => m.nilai).sort((p, q) => p - q);
  const dasar = urutM.length % 2 ? urutM[(urutM.length - 1) / 2] : (urutM[urutM.length / 2 - 1] + urutM[urutM.length / 2]) / 2;
  const cadangan = statIni.cv >= 0.6 ? 0.15 : 0.1;
  const rekomendasi = dasar * (1 + cadangan);

  // Pola musiman -> pembagian ramalan per bulan
  const pola = Array.from({ length: 12 }, (_, i) => {
    const v = [];
    if (adaLalu) v.push(lalu[i]);
    if (i >= mulai - 1 && i < M) v.push(ini[i]);
    return v.length ? lapJumlah(v) / v.length : null;
  });
  const isi = pola.filter((x) => x != null);
  const rataPola = isi.length ? lapJumlah(isi) / isi.length : 0;
  const polaPenuh = pola.map((x) => (x == null ? rataPola : x));
  const jmlPola = lapJumlah(polaPenuh);
  /* Pola musiman baru bisa dipercaya dari setengah tahun data; kurang
     dari itu anggaran dibagi rata per bulan. */
  const porsiBulan = isi.length >= 6 && jmlPola ? polaPenuh.map((x) => x / jmlPola) : Array(12).fill(1 / 12);
  const fasing = porsiBulan.map((p) => p * dasar);

  // Rincian per dimensi: tahun ini (YTD), periode sama tahun lalu, porsi, ramalan
  const rinci = (kunciFn, namaFn) => {
    const peta = new Map();
    baris.forEach((d) => {
      const k = kunciFn(d);
      if (!peta.has(k)) peta.set(k, { kunci: k, nama: namaFn(d), ini: 0, lalu: 0, laluPenuh: 0, jumlah: 0, bulan: Array(12).fill(0) });
      const r = peta.get(k);
      if (dalamPeriode(d, Y)) {
        r.ini += d.total;
        r.jumlah += 1;
        r.bulan[d.bulan - 1] += d.total;
      }
      if (dalamPeriode(d, Y - 1)) r.lalu += d.total;
      if (d.tahun === Y - 1) r.laluPenuh += d.total;
    });
    const daftar = [...peta.values()].filter((r) => r.ini || r.lalu);
    const totIni = lapJumlah(daftar.map((r) => r.ini));
    const totLalu = lapJumlah(daftar.map((r) => r.lalu));
    daftar.forEach((r) => {
      r.yoy = lapPerubahan(r.ini, r.lalu);
      r.porsi = totIni ? r.ini / totIni : 0;
      r.rata = r.ini / M;
      r.perPengajuan = r.jumlah ? r.ini / r.jumlah : 0;
      const porsiRamal = totIni ? r.ini / totIni : totLalu ? r.lalu / totLalu : 0;
      r.ramalan = dasar * porsiRamal;
    });
    return daftar.sort((a, b) => b.ini - a.ini || b.lalu - a.lalu);
  };
  const namaJenis = (j) => (j === "Lainnya" ? "Other" : j || "-");
  const perJenis = rinci((d) => d.jenis || "-", (d) => namaJenis(d.jenis));
  const perModa = rinci((d) => lapModaArah(d), (d) => lapModaArah(d));
  const perVendor = rinci((d) => fsumKunci(d.vendor) || "-", (d) => d.vendor || "-");
  const perCustomer = rinci((d) => fsumKunci(d.customer) || "-", (d) => d.customer || "-");

  // Statistik: tahun lalu penuh, tahun lalu periode sama, tahun ini YTD
  const statPeriode = (y, sampai) => {
    const b = y === Y ? ini : lalu;
    const dari = y === Y ? mulai - 1 : 0;
    const st = lapStat(b.slice(dari, sampai));
    const req = baris.filter((d) => d.tahun === y && d.bulan <= sampai);
    const terbesar = req.reduce((a, d) => (d.total > (a ? a.total : 0) ? d : a), null);
    const iMax = b.slice(dari, sampai).indexOf(st.max);
    const iMin = b.slice(dari, sampai).indexOf(st.min);
    return Object.assign(st, {
      bulanAda: b.slice(0, sampai).filter((x) => x > 0).length,
      jumlah: req.length,
      perPengajuan: req.length ? st.total / req.length : 0,
      terbesar,
      bulanMax: iMax >= 0 ? iMax + dari + 1 : 0,
      bulanMin: iMin >= 0 ? iMin + dari + 1 : 0,
    });
  };
  const statistik = {
    laluPenuh: statPeriode(Y - 1, 12),
    laluSama: statPeriode(Y - 1, M),
    ini: statPeriode(Y, M),
  };

  /* PEMBAYARAN -- dari status bayar Pengajuan Dana: lunas vs belum, lama
     bayar (tanggal invoice -> tanggal lunas), umur tagihan yang belum
     lunas. Nilainya nilai yang dibayar (termasuk PPN). */
  const dalamPeriodeIni = baris.filter((d) => d.tahun === Y && d.bulan <= M);
  const hariAntara = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
  const lunas = dalamPeriodeIni.filter((d) => d.tglBayar);
  const belum = dalamPeriodeIni.filter((d) => !d.tglBayar);
  const lamaBayar = lunas.map((d) => hariAntara(d.tanggal, d.tglBayar)).filter((x) => isFinite(x) && x >= 0);
  const acuan = o.hariIni || (typeof todayISO === "function" ? todayISO() : new Date().toISOString().slice(0, 10));
  const umur = belum.map((d) => ({ d, hari: Math.max(0, hariAntara(d.tanggal, acuan)) }));
  const bayar = {
    lunasJumlah: lunas.length,
    lunasNilai: lapJumlah(lunas.map((d) => d.tagihan)),
    belumJumlah: belum.length,
    belumNilai: lapJumlah(belum.map((d) => d.tagihan)),
    rataHari: lamaBayar.length ? lapJumlah(lamaBayar) / lamaBayar.length : null,
    medianHari: lamaBayar.length ? lapStat(lamaBayar).median : null,
    tertua: umur.length ? Math.max(...umur.map((u) => u.hari)) : null,
    umur: [["0–30 days", 0, 30], ["31–60 days", 31, 60], ["61–90 days", 61, 90], ["Over 90 days", 91, Infinity]].map(([nama, x1, x2]) => {
      const isi = umur.filter((u) => u.hari >= x1 && u.hari <= x2);
      return { nama, jumlah: isi.length, nilai: lapJumlah(isi.map((u) => u.d.tagihan)) };
    }),
    perVendor: (() => {
      const peta = new Map();
      umur.forEach(({ d, hari }) => {
        const k = fsumKunci(d.vendor) || "-";
        const r = peta.get(k) || { nama: d.vendor || "-", jumlah: 0, nilai: 0, tertua: 0 };
        r.jumlah += 1;
        r.nilai += d.tagihan;
        r.tertua = Math.max(r.tertua, hari);
        peta.set(k, r);
      });
      return [...peta.values()].sort((x, y) => y.nilai - x.nilai);
    })(),
  };

  /* BIAYA PER KIRIMAN -- pengajuan dikelompokkan per BL/AWB: berapa biaya
     EXIM satu kiriman, rata-rata per moda & arah. */
  const petaKirim = new Map();
  dalamPeriodeIni.forEach((d) => {
    if (!d.blAwb) return;
    const r = petaKirim.get(d.blAwb) || { total: 0, kategori: lapModaArah(d) };
    r.total += d.total;
    petaKirim.set(d.blAwb, r);
  });
  const perKiriman = (() => {
    const peta = new Map();
    petaKirim.forEach((r) => {
      const x = peta.get(r.kategori) || { nama: r.kategori, kiriman: 0, total: 0, maks: 0 };
      x.kiriman += 1;
      x.total += r.total;
      x.maks = Math.max(x.maks, r.total);
      peta.set(r.kategori, x);
    });
    return [...peta.values()].map((x) => Object.assign(x, { rata: x.total / x.kiriman })).sort((x, y) => y.total - x.total);
  })();
  const tanpaBl = dalamPeriodeIni.filter((d) => !d.blAwb);

  // Anggaran tahun berjalan
  const ang = o.anggaran && !o.anggaran.gagal ? o.anggaran : null;
  const nilaiAnggaran = ang ? lapAngka(ang.berubah) || lapAngka(ang.tahunan) : 0;

  const hasil = {
    Y, M, ini, lalu, adaLalu, ytd, ytdLalu, totalLalu, yoy, bulanIni, bulanSebelum, mom, yoyBulan,
    rataBulan: ytd / bulanEfektif, medianBulan: statIni.median, statIni, g, runRate, proyeksiIni, mulai, bulanEfektif,
    metode, dasar, rendah: urutM[0], tinggi: urutM[urutM.length - 1], cadangan, rekomendasi, porsiBulan, fasing,
    perJenis, perModa, perVendor, perCustomer, statistik, bayar, perKiriman,
    kirimanJumlah: petaKirim.size, tanpaBlJumlah: tanpaBl.length, tanpaBlNilai: lapJumlah(tanpaBl.map((d) => d.total)),
    bandingVendor: lapBandingVendor(baris, Y, M, o.kiriman || []),
    pend, pendLalu, pendYtd, pendYtdLalu, pendUsdYtd, pendUsd, pendUsdIdr, pendUsdLalu,
    pendUsdYtdLalu: lapJumlah(pendUsdLalu.slice(0, M)),
    jumlahInvoice: jual.filter((v) => v.tahun === Y && v.bulan <= M).length,
    jumlahPengajuan: baris.filter((d) => d.tahun === Y && d.bulan <= M).length,
    tanpaTglInvoice: baris.filter((d) => d.tahun === Y && d.bulan <= M && !d.tglInvoice).length, pendYoy: lapPerubahan(pendYtd, pendYtdLalu), rasio, rasioLalu, ramalPend, kanal,
    perCustomerPend: lapCustomerPendapatan(jual, baris, Y, M),
    anggaran: nilaiAnggaran,
    pakaiAnggaran: nilaiAnggaran ? ytd / nilaiAnggaran : null,
    proyeksiAnggaran: nilaiAnggaran ? proyeksiIni / nilaiAnggaran : null,
  };
  hasil.wawasan = lapWawasan(hasil);
  return hasil;
}

/* Pendapatan & pengeluaran per customer: berapa yang dijual ke customer
   itu dan berapa biaya EXIM yang timbul untuknya. */
function lapCustomerPendapatan(jual, biaya, Y, M) {
  const peta = new Map();
  const ambil = (nama) => {
    const k = fsumKunci(nama) || "-";
    if (!peta.has(k)) peta.set(k, { nama: nama || "-", pendapatan: 0, pendapatanLalu: 0, usd: 0, biaya: 0, invoice: 0 });
    return peta.get(k);
  };
  jual.forEach((v) => {
    if (v.bulan > M) return;
    if (v.tahun === Y) {
      const r = ambil(v.customer);
      r.pendapatan += v.jumlah;
      if (v.mata === "USD") r.usd += v.jumlahAsli;
      r.invoice += 1;
    } else if (v.tahun === Y - 1) ambil(v.customer).pendapatanLalu += v.jumlah;
  });
  biaya.forEach((d) => {
    if (d.tahun === Y && d.bulan <= M) ambil(d.customer).biaya += d.total;
  });
  return [...peta.values()]
    .filter((r) => r.pendapatan || r.biaya || r.pendapatanLalu)
    .map((r) => Object.assign(r, { rasio: r.pendapatan ? r.biaya / r.pendapatan : null, yoy: lapPerubahan(r.pendapatan, r.pendapatanLalu) }))
    .sort((a, b) => b.pendapatan - a.pendapatan || b.biaya - a.biaya);
}

/* TEMUAN UTAMA -- paling banyak lima kalimat, bahasa sehari-hari. */
function lapWawasan(a) {
  const out = [];
  const per = `Jan–${lapBulanPendek(a.M)} ${a.Y}`;
  const naikTurun = (x) => (x == null ? "" : ` (${x >= 0 ? "up" : "down"} ${Math.abs(x * 100).toFixed(0)}% from ${a.Y - 1})`);
  if (a.pendYtd) {
    out.push(a.pendUsdYtd
      ? `Revenue ${per}: ${lapFmtUsd(a.pendUsdYtd)} from ${a.jumlahInvoice} invoice${a.jumlahInvoice === 1 ? "" : "s"}, which is ${lapFmtUang(a.pendYtd)} at the weekly Kurs Pajak${naikTurun(a.pendYoy)}.`
      : `Revenue ${per}: ${lapFmtUang(a.pendYtd)} from ${a.jumlahInvoice} invoice${a.jumlahInvoice === 1 ? "" : "s"}${naikTurun(a.pendYoy)}.`);
  } else {
    out.push(`No invoice values recorded for ${per} — revenue comparisons are not available.`);
  }
  out.push(`EXIM spending ${per}: ${lapFmtUang(a.ytd)}${naikTurun(a.yoy)}.`);
  if (a.rasio != null) {
    out.push(`For every IDR 100 of revenue, EXIM spends IDR ${(a.rasio * 100).toFixed(2)}${a.rasioLalu != null ? ` (${a.Y - 1}: IDR ${(a.rasioLalu * 100).toFixed(2)})` : ""}.`);
  }
  const top = a.perJenis[0];
  if (top && top.ini) {
    out.push(`Largest cost: ${top.nama} (${(top.porsi * 100).toFixed(0)}% of spending). Highest month: ${lapNamaBulan(a.statistik.ini.bulanMax)} (${lapFmtUang(a.statIni.max)}).`);
  }
  out.push(`Suggested ${a.Y + 1} budget: ${lapFmtUang(a.rekomendasi)} — about ${lapFmtUang(a.rekomendasi / 12)} per month, including a ${(a.cadangan * 100).toFixed(0)}% buffer.`);
  if (a.anggaran) {
    out.push(`${a.Y} budget: ${(a.pakaiAnggaran * 100).toFixed(0)}% used so far; expected ${(a.proyeksiAnggaran * 100).toFixed(0)}% by December${a.proyeksiAnggaran > 1 ? " — likely over budget" : ""}.`);
  }
  return out;
}

/* ---------------------------- format ---------------------------- */

const lapJuta = (n) => (Number(n) || 0) / 1e6;
/* SATUAN DI SETIAP ANGKA. Dulu tabel menulis "10,726.9" dengan
   keterangan "IDR million" di judulnya -- terbaca "10 ribu", padahal
   Rp 10,7 miliar. Sekarang tiap angka membawa satuannya sendiri:
   "IDR 10.73 bn", "IDR 599.3 m". */
function lapFmtUang(n) {
  const v = Number(n) || 0;
  if (!v) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `IDR ${(v / 1e9).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bn`;
  if (abs >= 1e6) return `IDR ${(v / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
  return `IDR ${Math.round(v).toLocaleString("en-US")}`;
}
const lapFmtJt = lapFmtUang;
const lapFmtJuta = lapFmtUang;
const lapFmtUsd = (n) => (n ? `USD ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "-");
const lapFmtRp = (n) => (Math.round(n) ? "IDR " + Math.round(n).toLocaleString("en-US") : "-");
const LAP_BULAN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const lapNamaBulan = (b) => LAP_BULAN[b - 1] || "";
const lapBulanPendek = (b) => lapNamaBulan(b).slice(0, 3);

/* SEL LAPORAN — satu bentuk untuk layar dan Excel.
   f: "jt" (IDR juta), "rp" (IDR penuh), "pct" (porsi), "chg" (perubahan,
   bertanda; naik = merah karena ini biaya), "n" (bilangan), "txt". */
const sel = (v, f, tambahan) => Object.assign({ v, f: f || "txt" }, tambahan || {});

function lapTeksSel(c) {
  const v = c.v;
  if (v === "") return ""; // sel yang memang kosong (baris rincian di bawah induknya)
  if (v == null || (typeof v === "number" && !isFinite(v))) return "—";
  switch (c.f) {
    case "jt": return lapFmtUang(v);
    case "usd": return lapFmtUsd(v);
    case "rp": return lapFmtRp(v);
    case "pct": return v ? (v * 100).toFixed(1) + "%" : "-";
    case "pct2": return v ? (v * 100).toFixed(2) + "%" : "-";
    case "rp2": return v ? Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
    case "chg": return (v > 0 ? "▲ +" : v < 0 ? "▼ −" : "") + Math.abs(v * 100).toFixed(1) + "%";
    case "n": return v ? Math.round(v).toLocaleString("en-US") : "-";
    default: return String(v);
  }
}

/* ---------------------------- blok laporan ---------------------------- */

/* Semua tabel laporan disusun sebagai DATA (judul, kepala, baris, kaki),
   lalu digambar ke layar dan ke Excel oleh dua penggambar yang sama
   untuk semua tabel -- isi keduanya tidak bisa berbeda. */
function lapSusunBlok(a, lap, ang) {
  const Y = a.Y;
  const M = a.M;
  const per = `Jan–${lapBulanPendek(M)}`;
  const B = {};

  /* RINGKAS -- yang dibaca dulu. Sisanya masuk "More details". */
  /* Bulan tanpa angka sama sekali tidak ditampilkan, dan kolom tahun lalu
     hanya muncul kalau tahun lalu memang ada datanya -- tabel ringkas
     tidak boleh penuh tanda strip. */
  const adaLaluApaPun = a.adaLalu || lapJumlah(a.pendLalu) > 0;
  const bulanAda = Array.from({ length: M }, (_, i) => i).filter((i) => a.pend[i] || a.ini[i] || (adaLaluApaPun && (a.lalu[i] || a.pendLalu[i])));
  B.ringkasBulan = {
    judul: `Month by month — ${Y}`,
    sub: "",
    kepala: ["Month (invoice date)", "Export revenue (USD)", "Kurs Pajak used", `Revenue (IDR)`, `EXIM spending (IDR)`, "Spending as % of revenue"]
      .concat(adaLaluApaPun ? [`EXIM spending ${Y - 1}`, `Spending change vs ${Y - 1}`] : []),
    baris: bulanAda.map((i) => [sel(lapNamaBulan(i + 1)), sel(a.pendUsd[i], "usd"),
      sel(a.pendUsd[i] ? a.pendUsdIdr[i] / a.pendUsd[i] : null, "rp2"), sel(a.pend[i], "jt"), sel(a.ini[i], "jt"),
      sel(a.pend[i] ? a.ini[i] / a.pend[i] : null, "pct2")]
      .concat(adaLaluApaPun ? [sel(a.lalu[i], "jt"), sel(lapPerubahan(a.ini[i], a.lalu[i]), "chg")] : [])),
    kaki: [sel(`Total ${per}`), sel(a.pendUsdYtd, "usd"), sel(a.pendUsdYtd ? lapJumlah(a.pendUsdIdr.slice(0, M)) / a.pendUsdYtd : null, "rp2"),
      sel(a.pendYtd, "jt"), sel(a.ytd, "jt"), sel(a.rasio, "pct2")]
      .concat(adaLaluApaPun ? [sel(a.ytdLalu, "jt"), sel(a.yoy, "chg")] : []),
    /* Rekonsiliasi: jumlah & total yang sama dengan tab sumbernya, supaya
       pembaca bisa mencocokkan angka laporan tanpa menebak. */
    catatan: [
      `Spending is dated by the vendor's invoice date${a.tanpaTglInvoice ? ` (${a.tanpaTglInvoice} request${a.tanpaTglInvoice === 1 ? "" : "s"} without an invoice date use the request date)` : ""}, not by payment date — a bill paid late stays in the month it was invoiced.`,
      `Check: ${a.jumlahInvoice} invoice${a.jumlahInvoice === 1 ? "" : "s"} (${lapFmtUsd(a.pendUsdYtd)} export${a.pendYtd - lapJumlah(a.pendUsdIdr.slice(0, M)) > 0 ? ` + ${lapFmtUang(a.pendYtd - lapJumlah(a.pendUsdIdr.slice(0, M)))} local sale` : ""}) — same as the Invoice Number tab; ${a.jumlahPengajuan} fund request${a.jumlahPengajuan === 1 ? "" : "s"} (${lapFmtUang(a.ytd)}).`,
      "Revenue (IDR) = USD × the Kurs Pajak valid on each invoice date, plus local sales in IDR.",
      adaLaluApaPun ? "" : `No ${Y - 1} data recorded yet — year-on-year columns appear once there is.`,
    ].filter(Boolean).join(" "),
  };
  const ringkasRinci = (judul, daftar, kolom) => ({
    judul,
    sub: per,
    kepala: [kolom, `Spending ${Y}`, "Share", `vs ${Y - 1}`],
    baris: daftar.filter((r) => r.ini).map((r) => [sel(r.nama), sel(r.ini, "jt"), sel(r.porsi, "pct"), sel(r.yoy, "chg")]),
    kaki: [sel("Total"), sel(a.ytd, "jt"), sel(a.ytd ? 1 : 0, "pct"), sel(a.yoy, "chg")],
  });
  B.jenisRingkas = ringkasRinci("By expense type", a.perJenis, "Expense type");
  B.modaRingkas = ringkasRinci("By mode & direction", a.perModa, "Mode · direction");
  B.vendorTop = {
    judul: "Top 5 vendors",
    sub: per,
    kepala: ["Vendor", "Requests", `Spending ${Y}`, "Share"],
    baris: a.perVendor.filter((r) => r.ini).slice(0, 5).map((r) => [sel(r.nama), sel(r.jumlah, "n"), sel(r.ini, "jt"), sel(r.porsi, "pct")]),
  };
  B.bandingVendor = {
    judul: "Which vendor is cheaper",
    sub: `${per} · vendor charges only (Freight, Storage, Other), before VAT`,
    kepala: ["Lane", "Vendor", "Shipments", "Total", "Avg per shipment", "Gross weight (kg)", "Per kg (GW)", ""],
    baris: a.bandingVendor.flatMap((j) => j.vendor.map((v, i) => [
      sel(i ? "" : j.jalur, "txt", { b: !i }),
      sel(v.vendor, "txt", { b: !!v.termurah }),
      sel(v.kiriman, "n"),
      sel(v.total, "jt"),
      sel(v.perKiriman, "jt", { b: !!v.termurah && j.dasar === "kiriman" }),
      sel(v.gw || null, "n"),
      sel(v.perKg, "jt", { b: !!v.termurah && j.dasar === "kg" }),
      sel(v.termurah ? (j.dasar === "kg" ? "✓ Cheapest per kg" : "✓ Cheapest per shipment") : ""),
    ])),
    catatan: "Duties & taxes (Billing, Tax Advance) are left out — they are not vendor prices. Per kg = requests whose BL/AWB matches a schedule ÷ that schedule's gross weight (GW, the billed weight). The cheapest is judged per kg when at least two vendors on the lane have it, otherwise per shipment.",
  };
  B.perKiriman = {
    judul: "EXIM cost per shipment (by BL/AWB)",
    sub: per,
    kepala: ["Mode · direction", "Shipments", "Spending", "Average per shipment", "Highest shipment"],
    baris: a.perKiriman.map((r) => [sel(r.nama), sel(r.kiriman, "n"), sel(r.total, "jt"), sel(r.rata, "jt"), sel(r.maks, "jt")]),
    kaki: a.perKiriman.length ? [sel("Total"), sel(a.kirimanJumlah, "n"), sel(lapJumlah(a.perKiriman.map((r) => r.total)), "jt"),
      sel(a.kirimanJumlah ? lapJumlah(a.perKiriman.map((r) => r.total)) / a.kirimanJumlah : null, "jt"), sel(null)] : null,
    catatan: a.tanpaBlJumlah ? `${a.tanpaBlJumlah} request${a.tanpaBlJumlah === 1 ? "" : "s"} without a BL/AWB number (${lapFmtUang(a.tanpaBlNilai)}) are not counted here.` : "",
  };
  const bb = a.bayar;
  B.bayarStatus = {
    judul: "Payment status",
    sub: `${per} · amounts as paid (incl. VAT)`,
    kepala: ["Status", "Requests", "Amount", "Note"],
    baris: [
      [sel("Paid"), sel(bb.lunasJumlah, "n"), sel(bb.lunasNilai, "jt"),
        sel(bb.rataHari != null ? `Paid on average ${Math.round(bb.rataHari)} days after the invoice date (median ${Math.round(bb.medianHari)})` : "")],
      [sel("Unpaid"), sel(bb.belumJumlah, "n"), sel(bb.belumNilai, "jt"),
        sel(bb.tertua != null ? `Oldest unpaid invoice: ${bb.tertua} days` : "")],
    ],
    kaki: [sel("Total"), sel(bb.lunasJumlah + bb.belumJumlah, "n"), sel(bb.lunasNilai + bb.belumNilai, "jt"), sel("")],
  };
  B.bayarUmur = {
    judul: "Unpaid requests by age",
    sub: "days since the invoice date",
    kepala: ["Age", "Requests", "Amount"],
    baris: bb.umur.map((u) => [sel(u.nama), sel(u.jumlah, "n"), sel(u.nilai, "jt")]),
    kaki: [sel("Total unpaid"), sel(bb.belumJumlah, "n"), sel(bb.belumNilai, "jt")],
  };
  B.bayarVendor = {
    judul: "Unpaid by vendor",
    sub: "",
    kepala: ["Vendor", "Requests", "Amount", "Oldest (days)"],
    baris: bb.perVendor.map((r) => [sel(r.nama), sel(r.jumlah, "n"), sel(r.nilai, "jt"), sel(r.tertua, "n")]),
  };

  B.anggaranRingkas = {
    judul: `Budget ${Y + 1}`,
    sub: "",
    kepala: ["", "Amount", "Note"],
    baris: [
      [sel(`${Y - 1} actual (full year)`), sel(a.totalLalu, "jt"), sel(a.adaLalu ? "" : "No data recorded")],
      [sel(`${Y} actual (${per})`), sel(a.ytd, "jt"), sel(`${a.bulanEfektif} month${a.bulanEfektif > 1 ? "s" : ""} recorded${a.mulai > 1 ? ` (data starts ${lapNamaBulan(a.mulai)} ${Y})` : ""}`)],
      [sel(`${Y} full-year estimate`), sel(a.proyeksiIni, "jt"), sel(a.adaLalu ? `remaining months follow the ${Y - 1} pattern` : `average of ${a.bulanEfektif} recorded month${a.bulanEfektif > 1 ? "s" : ""} × 12`)],
      [sel(`${Y + 1} forecast`), sel(a.dasar, "jt"), sel(`middle of ${a.metode.length} estimation methods`)],
      [sel(`Buffer ${(a.cadangan * 100).toFixed(0)}%`), sel(a.dasar * a.cadangan, "jt"), sel("for unplanned shipments and price changes")],
    ],
    kaki: [sel(`Recommended ${Y + 1} budget`), sel(a.rekomendasi, "jt"), sel(`≈ ${lapFmtUang(a.rekomendasi / 12)} per month`)],
  };
  B.rencanaBulan = {
    judul: `${Y + 1} budget by month`,
    sub: a.porsiBulan.every((x) => Math.abs(x - 1 / 12) < 1e-9) ? "spread evenly (less than 6 months of history), buffer included" : "follows the usual monthly pattern, buffer included",
    kepala: Array.from({ length: 12 }, (_, i) => lapBulanPendek(i + 1)).concat(["Total"]),
    baris: [a.fasing.map((x) => sel(x * (1 + a.cadangan), "jt")).concat([sel(a.rekomendasi, "jt")])],
  };

  // 0. Pendapatan vs pengeluaran
  B.pendapatan = {
    judul: "Revenue vs EXIM spending",
    sub: `revenue = Invoice Number values, foreign currency at Kurs Pajak of the invoice date`,
    kepala: ["Month", `Export ${Y - 1} (USD)`, `Export ${Y} (USD)`, `Revenue ${Y - 1} (IDR)`, `Revenue ${Y} (IDR)`, "Revenue YoY %", `Spending ${Y}`, `Spending / revenue ${Y}`, `Spending / revenue ${Y - 1}`],
    baris: Array.from({ length: 12 }, (_, i) => {
      const lewat = i < M;
      return [sel(lapNamaBulan(i + 1)), sel(a.pendUsdLalu[i], "usd"), sel(lewat ? a.pendUsd[i] : null, "usd"), sel(a.pendLalu[i], "jt"), sel(lewat ? a.pend[i] : null, "jt"),
        sel(lewat ? lapPerubahan(a.pend[i], a.pendLalu[i]) : null, "chg"), sel(lewat ? a.ini[i] : null, "jt"),
        sel(lewat && a.pend[i] ? a.ini[i] / a.pend[i] : null, "pct2"), sel(a.pendLalu[i] ? a.lalu[i] / a.pendLalu[i] : null, "pct2")];
    }),
    kaki: [sel(`Total (${per})`), sel(a.pendUsdYtdLalu, "usd"), sel(a.pendUsdYtd, "usd"), sel(a.pendYtdLalu, "jt"), sel(a.pendYtd, "jt"), sel(a.pendYoy, "chg"), sel(a.ytd, "jt"), sel(a.rasio, "pct2"), sel(a.rasioLalu, "pct2")],
    catatan: a.pendYtd ? "" : "No invoice values recorded in this period.",
  };
  B.kanal = {
    judul: "Revenue by channel",
    sub: `${per}`,
    kepala: ["Channel", "Invoices", `${Y - 1} (${per})`, `${Y} (${per})`, "YoY %", `Share ${Y}`],
    baris: a.kanal.map((k) => [sel(k.nama), sel(k.jumlah, "n"), sel(k.lalu, "jt"), sel(k.ini, "jt"), sel(k.yoy, "chg"), sel(k.porsi, "pct")]),
    kaki: [sel("Total"), sel(lapJumlah(a.kanal.map((k) => k.jumlah)), "n"), sel(a.pendYtdLalu, "jt"), sel(a.pendYtd, "jt"), sel(a.pendYoy, "chg"), sel(a.pendYtd ? 1 : 0, "pct")],
  };
  B.custPend = {
    judul: "Revenue & EXIM spending by customer",
    sub: `${per}`,
    kepala: ["Customer", "Invoices", "Revenue (USD)", "Revenue (IDR)", "Revenue YoY %", "EXIM spending (IDR)", "Spending / revenue"],
    baris: a.perCustomerPend.map((r) => [sel(r.nama), sel(r.invoice, "n"), sel(r.usd, "usd"), sel(r.pendapatan, "jt"), sel(r.yoy, "chg"), sel(r.biaya, "jt"), sel(r.rasio, "pct2")]),
    kaki: [sel("Total"), sel(lapJumlah(a.perCustomerPend.map((r) => r.invoice)), "n"), sel(a.pendUsdYtd, "usd"), sel(a.pendYtd, "jt"), sel(a.pendYoy, "chg"), sel(a.ytd, "jt"), sel(a.rasio, "pct2")],
    catatan: "Customer names are matched between Invoice Number and Fund Request entries; spending without a customer is listed under its own name.",
  };

  // 1. Perbandingan bulanan (YoY & MoM)
  let kumIni = 0;
  let kumLalu = 0;
  B.bulanan = {
    judul: "Monthly spending: year-on-year & month-on-month",
    sub: `${Y} vs ${Y - 1}`,
    kepala: ["Month", `${Y - 1}`, `${Y}`, "Change (IDR m)", `YoY %`, `MoM % (${Y})`, `Cumulative ${Y - 1}`, `Cumulative ${Y}`]
      .concat(a.anggaran ? [`Budget used (cum.)`] : []),
    baris: Array.from({ length: 12 }, (_, i) => {
      const lewat = i < M;
      kumLalu += a.lalu[i];
      if (lewat) kumIni += a.ini[i];
      const sebelum = i > 0 ? a.ini[i - 1] : a.lalu[11];
      return [
        sel(lapNamaBulan(i + 1)),
        sel(a.lalu[i], "jt"),
        sel(lewat ? a.ini[i] : null, "jt"),
        sel(lewat ? (a.ini[i] - a.lalu[i]) : null, "jt"),
        sel(lewat ? lapPerubahan(a.ini[i], a.lalu[i]) : null, "chg"),
        sel(lewat ? lapPerubahan(a.ini[i], sebelum) : null, "chg"),
        sel(kumLalu, "jt"),
        sel(lewat ? kumIni : null, "jt"),
      ].concat(a.anggaran ? [sel(lewat ? kumIni / a.anggaran : null, "pct")] : []);
    }),
    kaki: [sel(`Total (${per})`), sel(a.ytdLalu, "jt"), sel(a.ytd, "jt"), sel(a.ytd - a.ytdLalu, "jt"), sel(a.yoy, "chg"), sel(null),
      sel(a.ytdLalu, "jt"), sel(a.ytd, "jt")].concat(a.anggaran ? [sel(a.pakaiAnggaran, "pct")] : []),
    catatan: `Months after ${lapNamaBulan(M)} ${Y} are not reported yet. ${Y - 1} full year: ${lapFmtJt(a.totalLalu)}.`,
  };

  // 2. Per jenis pengeluaran & per moda
  const blokRinci = (judul, daftar, kolomNama) => ({
    judul,
    sub: `${per}`,
    kepala: [kolomNama, `${Y - 1} (${per})`, `${Y} (${per})`, "YoY %", `Share ${Y}`, "Monthly avg", "Requests", `Forecast ${Y + 1}`],
    baris: daftar.map((r) => [sel(r.nama), sel(r.lalu, "jt"), sel(r.ini, "jt"), sel(r.yoy, "chg"), sel(r.porsi, "pct"),
      sel(r.rata, "jt"), sel(r.jumlah, "n"), sel(r.ramalan, "jt")]),
    kaki: [sel("Total"), sel(a.ytdLalu, "jt"), sel(a.ytd, "jt"), sel(a.yoy, "chg"), sel(a.ytd ? 1 : 0, "pct"),
      sel(a.rataBulan, "jt"), sel(lapJumlah(daftar.map((r) => r.jumlah)), "n"), sel(a.dasar, "jt")],
  });
  B.jenis = blokRinci("Spending by expense type", a.perJenis, "Expense type");
  B.moda = blokRinci("Spending by mode & direction", a.perModa, "Mode · direction");
  B.jenisBulan = {
    judul: `Monthly spending by expense type — ${Y}`,
    sub: "",
    kepala: ["Expense type"].concat(Array.from({ length: M }, (_, i) => lapBulanPendek(i + 1))).concat(["Total"]),
    baris: a.perJenis.map((r) => [sel(r.nama)].concat(r.bulan.slice(0, M).map((x) => sel(x, "jt"))).concat([sel(r.ini, "jt")])),
    kaki: [sel("Total")].concat(a.ini.slice(0, M).map((x) => sel(x, "jt"))).concat([sel(a.ytd, "jt")]),
  };

  // 3. Vendor & customer
  const blokPihak = (judul, daftar, kolomNama) => ({
    judul,
    sub: `${per}`,
    kepala: [kolomNama, "Requests", `${Y - 1} (${per})`, `${Y} (${per})`, "YoY %", `Share ${Y}`, "Avg per request"],
    baris: daftar.map((r) => [sel(r.nama), sel(r.jumlah, "n"), sel(r.lalu, "jt"), sel(r.ini, "jt"), sel(r.yoy, "chg"), sel(r.porsi, "pct"), sel(r.perPengajuan, "jt")]),
    kaki: [sel("Total"), sel(lapJumlah(daftar.map((r) => r.jumlah)), "n"), sel(a.ytdLalu, "jt"), sel(a.ytd, "jt"), sel(a.yoy, "chg"), sel(a.ytd ? 1 : 0, "pct"),
      sel(a.statistik.ini.perPengajuan, "jt")],
  });
  B.vendor = blokPihak("Spending by vendor", a.perVendor, "Vendor");
  B.customer = blokPihak("Spending by customer", a.perCustomer, "Customer");

  // 4. Statistik
  const s = a.statistik;
  const kol = [s.laluPenuh, s.laluSama, s.ini];
  const barisStat = (label, f, ambil) => [sel(label)].concat(kol.map((x) => sel(ambil(x), f)));
  B.statistik = {
    judul: "Monthly statistics",
    sub: "",
    kepala: ["Indicator", `${Y - 1} (Jan–Dec)`, `${Y - 1} (${per})`, `${Y} (${per})`],
    baris: [
      barisStat("Total spending", "jt", (x) => x.total),
      barisStat("Months with spending", "n", (x) => x.bulanAda),
      barisStat("Monthly mean", "jt", (x) => x.mean),
      barisStat("Monthly median", "jt", (x) => x.median),
      barisStat("Standard deviation", "jt", (x) => x.sd),
      barisStat("Coefficient of variation", "pct", (x) => x.cv),
      [sel("Lowest month")].concat(kol.map((x) => sel(x.total ? `${lapBulanPendek(x.bulanMin)} · ${lapFmtJuta(x.min)}` : null))),
      [sel("Highest month")].concat(kol.map((x) => sel(x.total ? `${lapBulanPendek(x.bulanMax)} · ${lapFmtJuta(x.max)}` : null))),
      barisStat("Number of requests", "n", (x) => x.jumlah),
      barisStat("Average per request", "jt", (x) => x.perPengajuan),
      [sel("Largest single request")].concat(kol.map((x) => sel(x.terbesar ? `${lapFmtJuta(x.terbesar.total)} · ${x.terbesar.vendor || "-"}` : null))),
    ],
  };

  // 5. Peramalan & anggaran
  B.metode = {
    judul: `Forecast ${Y + 1} — methods`,
    sub: "",
    kepala: ["Method", `Forecast ${Y + 1}`, `vs ${Y} projection`, "How it is calculated"],
    baris: a.metode.map((m) => [sel(m.nama), sel(m.nilai, "jt"), sel(lapPerubahan(m.nilai, a.proyeksiIni), "chg"), sel(m.catatan)]),
    kaki: [sel("Base forecast (median)"), sel(a.dasar, "jt"), sel(lapPerubahan(a.dasar, a.proyeksiIni), "chg"), sel(`Range ${lapFmtJuta(a.rendah)} – ${lapFmtJuta(a.tinggi)}`)],
  };
  B.ramalPend = a.ramalPend
    ? {
        judul: `Revenue forecast ${Y + 1}`,
        sub: "",
        kepala: ["Method", `Forecast ${Y + 1}`, `vs ${Y} projection`, "How it is calculated"],
        baris: a.ramalPend.metode.map((m) => [sel(m.nama), sel(m.nilai, "jt"), sel(lapPerubahan(m.nilai, a.ramalPend.proyeksiIni), "chg"), sel(m.catatan)]),
        kaki: [sel("Base forecast (median)"), sel(a.ramalPend.dasar, "jt"), sel(lapPerubahan(a.ramalPend.dasar, a.ramalPend.proyeksiIni), "chg"), sel(`${Y} projected revenue ${lapFmtJuta(a.ramalPend.proyeksiIni)}`)],
      }
    : null;
  B.anggaranSaran = {
    judul: `Budget recommendation ${Y + 1}`,
    sub: "",
    kepala: ["Item", "Amount", "Note"],
    baris: [
      [sel(`${Y - 1} actual (full year)`), sel(a.totalLalu, "jt"), sel(a.adaLalu ? "" : "No data recorded")],
      [sel(`${Y} actual (${per})`), sel(a.ytd, "jt"), sel(`${M} month${M > 1 ? "s" : ""} of data`)],
      [sel(`${Y} projected full year`), sel(a.proyeksiIni, "jt"), sel(a.adaLalu ? `Remaining months from ${Y - 1} pattern × growth` : "Run-rate (monthly average × 12)")],
      [sel(`${Y + 1} base forecast`), sel(a.dasar, "jt"), sel("Median of the forecasting methods")],
      [sel(`Contingency (${(a.cadangan * 100).toFixed(0)}%)`), sel(a.dasar * a.cadangan, "jt"), sel(`Coefficient of variation ${(a.statIni.cv * 100).toFixed(0)}%`)],
    ].concat(a.ramalPend ? [[sel(`${Y + 1} revenue forecast`), sel(a.ramalPend.dasar, "jt"), sel(`Budget = ${(a.rekomendasi / a.ramalPend.dasar * 100).toFixed(2)}% of forecast revenue`)]] : [])
      .concat(a.anggaran ? [[sel(`${Y} budget set`), sel(a.anggaran, "jt"), sel(`Projected use ${(a.proyeksiAnggaran * 100).toFixed(1)}%`)]] : []),
    kaki: [sel(`Recommended budget ${Y + 1}`), sel(a.rekomendasi, "jt"), sel(`${lapFmtJt(a.rekomendasi / 12)} per month on average`)],
  };
  B.fasing = {
    judul: `Monthly budget phasing ${Y + 1}`,
    sub: "base forecast split by the historical monthly pattern",
    kepala: ["Month", `${Y - 1} actual`, `${Y} actual`, "Seasonal share", `Forecast ${Y + 1}`, `With contingency`],
    baris: Array.from({ length: 12 }, (_, i) => [sel(lapNamaBulan(i + 1)), sel(a.lalu[i], "jt"), sel(i < M ? a.ini[i] : null, "jt"),
      sel(a.porsiBulan[i], "pct"), sel(a.fasing[i], "jt"), sel(a.fasing[i] * (1 + a.cadangan), "jt")]),
    kaki: [sel("Total"), sel(a.totalLalu, "jt"), sel(a.ytd, "jt"), sel(1, "pct"), sel(a.dasar, "jt"), sel(a.rekomendasi, "jt")],
  };

  // 6. Detail transportasi (format laporan DD Korea)
  const bln = Array.from({ length: 12 }, (_, i) => lapBulanPendek(i + 1));
  const tot = lap.bulanan.reduce((x, b) => ({ penjualan: x.penjualan + b.penjualan, biaya: x.biaya + b.biaya, qty: x.qty + b.qty }), { penjualan: 0, biaya: 0, qty: 0 });
  B.modaBulan = {
    judul: "Spending by mode & direction per month",
    sub: "",
    kepala: ["Mode · direction"].concat(bln).concat(["Total"]),
    baris: a.perModa.filter((r) => r.ini).map((r) => [sel(r.nama)].concat(r.bulan.map((x) => sel(x, "jt"))).concat([sel(r.ini, "jt")])),
    kaki: [sel("Total")].concat(a.ini.map((x, i) => sel(i < M ? x : null, "jt"))).concat([sel(a.ytd, "jt")]),
  };
  B.jumlahModa = {
    judul: "Requests by mode per month",
    sub: "count",
    kepala: ["Mode"].concat(bln).concat(["Total", `${lapBulanPendek(M)} share`]),
    baris: LAP_MODA.concat(lap.bulanan.some((b) => b.jumlahModa.lain) ? ["lain"] : []).map((m) => {
      const ini = lap.bulanan[M - 1];
      return [sel(lapNamaModa(m === "lain" ? "" : m))].concat(lap.bulanan.map((b) => sel(b.jumlahModa[m], "n")))
        .concat([sel(lapJumlah(lap.bulanan.map((b) => b.jumlahModa[m])), "n"), sel(ini.jumlah ? ini.jumlahModa[m] / ini.jumlah : null, "pct")]);
    }),
  };
  const totV = lap.vendor.reduce((x, v) => [x[0] + v.tanpaPpn, x[1] + v.kenaPpn, x[2] + v.total], [0, 0, 0]);
  B.vendorPpn = {
    judul: `Vendor settlement — ${lapNamaBulan(M)} ${Y}`,
    sub: "IDR · before VAT",
    kepala: ["Vendor", "Mode", "Non-VAT", "VAT-able (base)", "Total"],
    baris: lap.vendor.flatMap((v) => [[sel(v.vendor, "txt", { b: true }), sel("All"), sel(v.tanpaPpn, "rp", { b: true }), sel(v.kenaPpn, "rp", { b: true }), sel(v.total, "rp", { b: true })]]
      .concat(LAP_MODA.concat(["lain"]).filter((m) => v.moda[m]).map((m) => [sel(""), sel(lapNamaModa(m === "lain" ? "" : m)), sel(v.moda[m].tanpaPpn, "rp"), sel(v.moda[m].kenaPpn, "rp"), sel(v.moda[m].total, "rp")]))),
    kaki: [sel("Total"), sel(""), sel(totV[0], "rp"), sel(totV[1], "rp"), sel(totV[2], "rp")],
  };
  B.kurs = {
    judul: "Exchange rates used (Kurs Pajak, Ministry of Finance)",
    sub: "per KMK period · IDR per unit",
    kepala: ["Valid from", "Valid to", "KMK number", "USD", "Invoices converted"],
    baris: (lap.kursPakai || []).map((k) => [sel(k.mulai), sel(k.sampai), sel(k.kmk || "-"), sel(k.usd, "rp2"), sel(k.jumlah, "n")]),
    catatan: lap.kursCatatan || "",
  };
  B.anggaranPakai = ang
    ? {
        judul: `Budget usage ${Y}`,
        sub: "IDR",
        kepala: ["Annual budget", "Current budget (A)", `${lapNamaBulan(M)} usage`, "Total usage (B)", "Balance (A−B)", "Usage (B/A)"],
        baris: [[sel(ang.tahunan, "rp"), sel(ang.berubah, "rp"), sel(ang.bulanIni, "rp"), sel(ang.total, "rp"), sel(ang.berubah ? ang.sisa : null, "rp"), sel(ang.persen || null, "pct")]],
      }
    : null;
  return B;
}

/* ---------------------------- grafik (SVG) ---------------------------- */

const LAP_WARNA = { udara: "#2563eb", laut: "#0d9488", darat: "#d97706", lain: "#94a3b8", lalu: "#94a3b8", ini: "#1e3a5f", ramal: "#c2410c", anggaran: "#16a34a" };

/* GRAFIK — selebar halaman, huruf besar, nilai tertulis di atas batang.
   viewBox 1200 x 440: di layar mengikuti lebar wadahnya (100%), di Excel
   menjadi gambar 1200 x 440. */
const LAP_GRAFIK = { W: 1200, H: 440 };
function lapSvgKerangka(judul, isi, legenda, satuan) {
  const { W, H } = LAP_GRAFIK;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" font-family="Inter, Arial, sans-serif" role="img" aria-label="${escapeAttr(judul)}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <text x="24" y="34" font-size="20" font-weight="700" fill="#0f172a">${escapeHtml(judul)}</text>
    <text x="${W - 24}" y="34" font-size="14" text-anchor="end" fill="#64748b">${escapeHtml(satuan || "IDR million")}</text>
    ${legenda}${isi}</svg>`;
}
function lapSvgLegenda(seri) {
  return seri.map((s, i) => `<rect x="${24 + i * 210}" y="52" width="14" height="14" rx="2" fill="${s.warna}"${s.pudar ? ' fill-opacity="0.55"' : ""}/>` +
    `<text x="${24 + i * 210 + 20}" y="64" font-size="14" fill="#334155">${escapeHtml(s.nama)}</text>`).join("");
}
function lapSvgSumbu(maks, y, kiri, kanan, desimal) {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${kiri}" x2="${kanan}" y1="${y(maks * f).toFixed(1)}" y2="${y(maks * f).toFixed(1)}" stroke="#e2e8f0"/>` +
    `<text x="${kiri - 10}" y="${(y(maks * f) + 5).toFixed(1)}" font-size="13" text-anchor="end" fill="#64748b">${(maks * f).toLocaleString("en-US", { maximumFractionDigits: desimal })}</text>`).join("");
}
const lapLabelNilai = (v) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));

function lapSvgBatang(judul, seri, opsi) {
  const o = opsi || {};
  const { W, H } = LAP_GRAFIK;
  const kiri = 78, bawah = 44, atas = 92, kanan = W - 24;
  const maks = Math.max(1, ...seri.flatMap((s) => s.nilai.map((v) => v || 0))) * 1.12;
  const lebarGrup = (kanan - kiri) / 12;
  const lebarBatang = Math.min(46, (lebarGrup * 0.78) / seri.length);
  const y = (v) => H - bawah - ((H - bawah - atas) * v) / maks;
  const batang = seri.map((s, si) => s.nilai.map((v, i) => {
    if (!(v > 0)) return "";
    const x = kiri + i * lebarGrup + (lebarGrup - lebarBatang * seri.length) / 2 + si * lebarBatang;
    const label = seri.length <= 3 ? `<text x="${(x + lebarBatang / 2).toFixed(1)}" y="${(y(v) - 6).toFixed(1)}" font-size="${seri.length > 1 ? 11 : 13}" text-anchor="middle" fill="#334155">${lapLabelNilai(v)}</text>` : "";
    return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(lebarBatang - 2).toFixed(1)}" height="${(H - bawah - y(v)).toFixed(1)}" rx="2" fill="${s.warna}"${s.pudar ? ' fill-opacity="0.55"' : ""}/>${label}`;
  }).join("")).join("");
  const bulan = Array.from({ length: 12 }, (_, i) => `<text x="${(kiri + i * lebarGrup + lebarGrup / 2).toFixed(1)}" y="${H - bawah + 24}" font-size="14" text-anchor="middle" fill="#334155">${lapBulanPendek(i + 1)}</text>`).join("");
  return lapSvgKerangka(judul, lapSvgSumbu(maks, y, kiri, kanan, 0) + batang + bulan, lapSvgLegenda(seri), o.satuan);
}

function lapSvgGaris(judul, seri, opsi) {
  const o = opsi || {};
  const { W, H } = LAP_GRAFIK;
  const kiri = 78, bawah = 44, atas = 92, kanan = W - 24;
  const maks = Math.max(1e-9, ...seri.flatMap((s) => s.nilai.filter((v) => v != null))) * 1.12;
  const x = (i) => kiri + ((kanan - kiri) * (i + 0.5)) / 12;
  const y = (v) => H - bawah - ((H - bawah - atas) * v) / maks;
  const jalur = seri.map((s) => {
    const titik = s.nilai.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
    if (!titik.length) return "";
    const tanda = s.nilai.map((v, i) => (v == null || s.tanpaTitik ? "" :
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${s.warna}"/>` +
      `<text x="${x(i).toFixed(1)}" y="${(y(v) - 10).toFixed(1)}" font-size="12" text-anchor="middle" fill="#334155">${lapLabelNilai(v)}</text>`)).join("");
    return `<polyline points="${titik.join(" ")}" fill="none" stroke="${s.warna}" stroke-width="3"${s.putus ? ' stroke-dasharray="7 5"' : ""}/>${tanda}`;
  }).join("");
  const bulan = Array.from({ length: 12 }, (_, i) => `<text x="${x(i).toFixed(1)}" y="${H - bawah + 24}" font-size="14" text-anchor="middle" fill="#334155">${lapBulanPendek(i + 1)}</text>`).join("");
  return lapSvgKerangka(judul, lapSvgSumbu(maks, y, kiri, kanan, maks < 10 ? 2 : 0) + jalur + bulan, lapSvgLegenda(seri), o.satuan);
}

function lapGrafik(a, lap) {
  const jt = (arr) => arr.map((v) => (v == null ? null : lapJuta(v)));
  let k = 0;
  const kumIni = a.ini.map((v, i) => (i < a.M ? (k += v) : null));
  let kl = 0;
  const kumLalu = a.lalu.map((v) => (kl += v));
  // Proyeksi sisa tahun berjalan: lanjut dari kumulatif terakhir mengikuti proyeksi
  const sisa = a.proyeksiIni - a.ytd;
  const bobotSisa = a.porsiBulan.slice(a.M);
  const jmlBobot = lapJumlah(bobotSisa) || 1;
  let kp = a.ytd;
  const proyeksi = a.ini.map((_, i) => (i < a.M - 1 ? null : i === a.M - 1 ? a.ytd : (kp += (sisa * a.porsiBulan[i]) / jmlBobot)));
  const seriKum = [
    { nama: `${a.Y - 1} actual`, warna: LAP_WARNA.lalu, nilai: a.adaLalu ? jt(kumLalu) : Array(12).fill(null) },
    { nama: `${a.Y} actual`, warna: LAP_WARNA.ini, nilai: jt(kumIni) },
    { nama: `${a.Y} projection`, warna: LAP_WARNA.ramal, putus: true, tanpaTitik: true, nilai: a.M < 12 ? jt(proyeksi) : Array(12).fill(null) },
  ].concat(a.anggaran ? [{ nama: `${a.Y} budget`, warna: LAP_WARNA.anggaran, putus: true, tanpaTitik: true, nilai: Array.from({ length: 12 }, (_, i) => lapJuta((a.anggaran * (i + 1)) / 12)) }] : []);
  return {
    yoy: lapSvgBatang("EXIM spending per month (by invoice date)", [
      { nama: `${a.Y - 1}`, warna: LAP_WARNA.lalu, nilai: jt(a.lalu) },
      { nama: `${a.Y}`, warna: LAP_WARNA.ini, nilai: jt(a.ini.map((v, i) => (i < a.M ? v : 0))) },
    ]),
    kumulatif: lapSvgGaris("Cumulative EXIM spending (by invoice date)", seriKum),
    ramalan: lapSvgBatang(`Forecast ${a.Y + 1}`, [
      { nama: `${a.Y - 1} actual`, warna: LAP_WARNA.lalu, nilai: jt(a.lalu) },
      { nama: `${a.Y} actual`, warna: LAP_WARNA.ini, nilai: jt(a.ini.map((v, i) => (i < a.M ? v : 0))) },
      { nama: `${a.Y + 1} forecast`, warna: LAP_WARNA.ramal, pudar: true, nilai: jt(a.fasing) },
    ]),
    rasio: lapSvgGaris("Spending as % of revenue", [
      { nama: `${a.Y - 1}`, warna: LAP_WARNA.lalu, nilai: a.lalu.map((v, i) => (a.pendLalu[i] ? (v / a.pendLalu[i]) * 100 : null)) },
      { nama: `${a.Y}`, warna: LAP_WARNA.ini, nilai: a.ini.map((v, i) => (i < a.M && a.pend[i] ? (v / a.pend[i]) * 100 : null)) },
    ], { satuan: "% of revenue" }),
    pendapatan: lapSvgBatang("Revenue per month", [
      { nama: `Revenue ${a.Y - 1}`, warna: LAP_WARNA.lalu, nilai: jt(a.pendLalu) },
      { nama: `Revenue ${a.Y}`, warna: LAP_WARNA.ini, nilai: jt(a.pend.map((v, i) => (i < a.M ? v : 0))) },
    ]),
    moda: lapSvgBatang("Spending by mode & direction (by invoice date)", a.perModa.filter((r) => r.ini > 0).slice(0, 5).map((r, i) => ({
      nama: r.nama, warna: ["#2563eb", "#93c5fd", "#0d9488", "#5eead4", "#d97706"][i], nilai: r.bulan.map((v) => lapJuta(v)) }))),
  };
}

/* ---------------------------- tampilan ---------------------------- */

/* NDPBM jadwal di sekitar sebuah tanggal (+-7 hari). NDPBM di PIB ADALAH
   kurs pajak KMK pekan itu -- jadi untuk tanggal yang belum ada di
   riwayat kurs tersimpan, NDPBM kiriman pada pekan yang sama lebih tepat
   daripada periode KMK terdekat. */
function lapNdpbmSekitar() {
  const semua = typeof data !== "undefined" && data ? (data.import || []).concat(data.export || []) : [];
  const titik = semua
    .filter((s) => lapAngka(s.ndpbm) > 1000)
    .map((s) => ({ t: (s.docProgress && s.docProgress.pib && s.docProgress.pib.date) || s.eta || s.etd || "", n: lapAngka(s.ndpbm) }))
    .filter((x) => x.t);
  return (tanggal) => {
    const t0 = new Date(String(tanggal).slice(0, 10) + "T00:00:00Z").getTime();
    let terbaik = null;
    titik.forEach((x) => {
      const d = Math.abs(new Date(x.t.slice(0, 10) + "T00:00:00Z").getTime() - t0) / 86400000;
      if (d <= 7 && (!terbaik || d < terbaik.d)) terbaik = { d, n: x.n };
    });
    return terbaik ? terbaik.n : 0;
  };
}

function lapHitungSekarang() {
  /* Kurs pajak KMK yang berlaku pada tanggal tiap transaksi. Di luar
     riwayat kurs yang tersimpan: NDPBM kiriman sepekan yang sama, lalu
     periode KMK terdekat. Kalau berkas kursnya belum ada sama sekali,
     USD jatuh ke NDPBM terbaru. */
  const ndpbm = lapKursBawaan();
  const ndpbmSekitar = lapNdpbmSekitar();
  let dariNdpbm = 0;
  const dataKurs = lapData.kursPajak || { periode: [] };
  const pakai = new Map();
  let cadangan = 0;
  let perkiraan = 0;
  const kursFn = (mata, tanggal) => {
    const k = typeof kursPajakPada === "function" ? kursPajakPada(mata, tanggal, dataKurs) : { nilai: 0 };
    if (k.perkiraan && mata === "USD") {
      const n = ndpbmSekitar(tanggal);
      if (n) {
        dariNdpbm += 1;
        return n;
      }
    }
    if (k.nilai && k.periode) {
      const kunci = k.periode.mulai;
      const x = pakai.get(kunci) || { mulai: k.periode.mulai, sampai: k.periode.sampai, kmk: k.periode.kmk, usd: k.periode.kurs.USD, jumlah: 0 };
      x.jumlah += 1;
      pakai.set(kunci, x);
      if (k.perkiraan) perkiraan += 1;
      return k.nilai;
    }
    if (mata === "USD") {
      cadangan += 1;
      return ndpbm;
    }
    return 0;
  };
  const dana = (lapData.dana || []).map((r) => lapBarisDana(r, kursFn));
  const invoice = (lapData.invoice || []).map((r) => lapBarisInvoice(r, kursFn));
  const opsi = { tahun: lapSaringan.tahun, bulan: lapSaringan.bulan, jenis: lapSaringan.jenis };
  const lap = hitungLaporanBiaya(dana, invoice, opsi);
  lap.kurs = ndpbm;
  lap.kursPakai = [...pakai.values()].sort((x, y) => (x.mulai < y.mulai ? 1 : -1));
  lap.kursCatatan = [
    dariNdpbm ? `${dariNdpbm} USD transaction(s) dated before the stored Kurs Pajak history used the customs NDPBM of a shipment in the same week (NDPBM is the KMK tax rate).` : "",
    perkiraan ? `${perkiraan} transaction(s) dated outside the stored Kurs Pajak history used the nearest available KMK period — run the "Kurs pajak mingguan" GitHub Action with a start date to fill the history.` : "",
    cadangan ? `${cadangan} USD transaction(s) used the latest customs rate (NDPBM ${ndpbm.toLocaleString("en-US")}) because no Kurs Pajak was available.` : "",
    dataKurs.diperbarui ? `Kurs Pajak last updated ${String(dataKurs.diperbarui).slice(0, 10)} from fiskal.kemenkeu.go.id.` : "",
  ].filter(Boolean).join(" ");
  const anggaran = lapData.anggaran && !lapData.anggaran.gagal ? lapData.anggaran : null;
  // Jadwal kiriman (gross weight per BL/AWB) untuk perbandingan per kg antar vendor
  const kiriman = typeof data !== "undefined" && data ? [].concat(data.import || [], data.export || []) : [];
  const a = hitungAnalisis(dana, Object.assign({ anggaran, invoice, kiriman }, opsi));
  const ang = anggaran ? hitungAnggaran(lap, anggaran) : null;
  return { a, lap, ang, blok: lapSusunBlok(a, lap, ang) };
}

function lapTabelHtml(b) {
  if (!b) return "";
  const kelasSel = (c) => [c.f === "chg" && c.v != null ? (c.v > 0.0005 ? "lap-naik" : c.v < -0.0005 ? "lap-turun" : "") : "", c.b ? "lap-tebal" : ""].filter(Boolean).join(" ");
  const td = (c) => `<td${kelasSel(c) ? ` class="${kelasSel(c)}"` : ""}>${escapeHtml(lapTeksSel(c))}</td>`;
  const isi = b.baris.length
    ? `<table class="fsum-tabel lap-tabel">
        <thead><tr>${b.kepala.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead>
        <tbody>${b.baris.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody>
        ${b.kaki ? `<tfoot><tr>${b.kaki.map(td).join("")}</tr></tfoot>` : ""}
      </table>`
    : `<div class="lap-kosong">No data for this period.</div>`;
  return `<div class="lap-blok">
      <div class="lap-blok-judul">${escapeHtml(b.judul)}${b.sub ? ` <small>${escapeHtml(b.sub)}</small>` : ""}</div>
      <div class="fsum-wrap">${isi}</div>
      ${b.catatan ? `<div class="lap-catatan">${escapeHtml(b.catatan)}</div>` : ""}
    </div>`;
}

function lapKpi(a) {
  const banding = (x, label) => (x == null ? `<span class="lap-kpi-banding">${escapeHtml(label)}: no data</span>` :
    `<span class="lap-kpi-banding ${x > 0.0005 ? "lap-naik" : x < -0.0005 ? "lap-turun" : ""}">${x >= 0 ? "▲ up" : "▼ down"} ${Math.abs(x * 100).toFixed(0)}% ${escapeHtml(label)}</span>`);
  const per = `Jan–${lapBulanPendek(a.M)} ${a.Y}`;
  const naikRasio = a.rasio != null && a.rasioLalu != null ? a.rasio - a.rasioLalu : null;
  const kartu = [
    { k: `Revenue · ${per}`, v: a.pendUsdYtd ? lapFmtUsd(a.pendUsdYtd) : a.pendYtd ? lapFmtUang(a.pendYtd) : "—",
      s: (a.pendUsdYtd ? `<span class="lap-kpi-banding">≈ ${escapeHtml(lapFmtUang(a.pendYtd))} at Kurs Pajak · ${a.jumlahInvoice} invoices</span>` : "") + banding(a.pendYoy, `vs ${a.Y - 1}`) },
    { k: `EXIM spending · ${per}`, v: lapFmtUang(a.ytd), s: banding(a.yoy, `vs ${a.Y - 1}`) },
    { k: "Spending per IDR 100 revenue", v: a.rasio != null ? `IDR ${(a.rasio * 100).toFixed(2)}` : "—",
      s: naikRasio == null ? `<span class="lap-kpi-banding">${a.Y - 1}: no data</span>`
        : `<span class="lap-kpi-banding ${naikRasio > 0 ? "lap-naik" : "lap-turun"}">${a.Y - 1}: IDR ${(a.rasioLalu * 100).toFixed(2)}</span>` },
    { k: `${lapNamaBulan(a.M)} ${a.Y}`, v: lapFmtUang(a.bulanIni), s: banding(a.mom, "vs previous month") },
    { k: `${a.Y} full-year estimate`, v: lapFmtUang(a.proyeksiIni),
      s: a.mulai > 1 ? `<span class="lap-kpi-banding">from ${a.bulanEfektif} recorded month${a.bulanEfektif > 1 ? "s" : ""} (since ${escapeHtml(lapBulanPendek(a.mulai))})</span>` : banding(lapPerubahan(a.proyeksiIni, a.totalLalu), `vs ${a.Y - 1}`) },
    { k: `Recommended ${a.Y + 1} budget`, v: lapFmtUang(a.rekomendasi), s: `<span class="lap-kpi-banding">≈ ${escapeHtml(lapFmtUang(a.rekomendasi / 12))} per month</span>`, sorot: true },
  ];
  return `<div class="lap-kpi-grid">${kartu.map((c) => `<div class="lap-kpi${c.sorot ? " lap-kpi--sorot" : ""}">
      <div class="lap-kpi-judul">${escapeHtml(c.k)}</div><div class="lap-kpi-nilai">${escapeHtml(c.v)}</div><div class="lap-kpi-sub">${c.s}</div></div>`).join("")}</div>`;
}

function lapGambar(box) {
  const { a, lap, blok: B } = lapHitungSekarang();
  const graf = lapGrafik(a, lap);
  const tahunData = [...new Set((lapData.dana || []).concat(lapData.invoice || []).map((r) => String(fsumTanggal(r) || r.doc_date || "").slice(0, 4)).filter(Boolean))];
  if (tahunData.indexOf(lapSaringan.tahun) < 0) tahunData.push(lapSaringan.tahun);
  tahunData.sort().reverse();
  const opsi = (arr, nilai) => arr.map(([v, t]) => `<option value="${escapeAttr(v)}"${String(v) === String(nilai) ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");
  const chip = LAP_JENIS.map((j) => `<label class="lap-chip"><input type="checkbox" data-lap-jenis="${escapeAttr(j)}"${lapSaringan.jenis.indexOf(j) >= 0 ? " checked" : ""}> ${escapeHtml(j === "Lainnya" ? "Other" : j)}</label>`).join("");
  const bisaUbah = typeof bolehUbahDocNum === "function" && bolehUbahDocNum();
  const tombolAnggaran = lapData.anggaran && lapData.anggaran.gagal
    ? `<div class="lap-catatan">Budget tracking is enabled once migration-report-settings.sql has been run in Supabase.</div>`
    : bisaUbah ? `<button type="button" class="btn-quiet lap-ubah-anggaran" data-lap-anggaran><i class="bi bi-pencil"></i> Set ${escapeHtml(String(a.Y))} budget</button>` : "";
  const bagian = (no, judul, isi) => `<section class="lap-bagian"><h3 class="lap-judul"><span class="lap-no">${no}</span>${escapeHtml(judul)}</h3>${isi}</section>`;
  const grafik = (svg) => `<div class="lap-grafik">${svg}</div>`;

  box.innerHTML = `
    <div class="fsum-saring lap-saring">
      <div class="lap-saring-baris">
        <label class="fsum-saring-item"><span class="fsum-saring-label">Year</span>
          <select class="form-select form-select-sm" data-lap="tahun">${opsi(tahunData.map((y) => [y, y]), lapSaringan.tahun)}</select></label>
        <label class="fsum-saring-item"><span class="fsum-saring-label">Period up to</span>
          <select class="form-select form-select-sm" data-lap="bulan">${opsi(Array.from({ length: 12 }, (_, i) => [String(i + 1), lapNamaBulan(i + 1)]), lapSaringan.bulan)}</select></label>
        <div class="lap-chips"><span class="fsum-saring-label">Expense types counted</span>${chip}</div>
        <button type="button" class="btn-teal btn-sm lap-unduh" data-lap-unduh><i class="bi bi-file-earmark-excel"></i> Download Excel</button>
      </div>
    </div>

    <div class="lap-kepala">
      <div class="lap-kepala-judul">EXIM Spending Report ${escapeHtml(String(a.Y))}</div>
      <div class="lap-kepala-sub">January – ${escapeHtml(lapNamaBulan(a.M))} ${escapeHtml(String(a.Y))}, compared with ${escapeHtml(String(a.Y - 1))}. All amounts in rupiah (IDR m = million, bn = billion). Every amount is placed in the month of its INVOICE DATE (not payment date). Revenue = Invoice Number values (USD at the weekly Kurs Pajak); spending = Fund Requests before VAT.</div>
    </div>

    ${bagian(1, "Summary", `${lapKpi(a)}
      <div class="lap-wawasan"><div class="lap-blok-judul">In short</div><ul>${a.wawasan.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      ${tombolAnggaran}`)}
    ${bagian(2, "Month by month", `${lapTabelHtml(B.ringkasBulan)}${grafik(graf.yoy)}`)}
    ${bagian(3, "Where the money goes", `<div class="lap-dua-tabel">${lapTabelHtml(B.jenisRingkas)}${lapTabelHtml(B.modaRingkas)}</div>${lapTabelHtml(B.vendorTop)}${lapTabelHtml(B.perKiriman)}`)}
    ${bagian(4, "Vendor comparison", lapTabelHtml(B.bandingVendor))}
    ${bagian(5, "Payments", `${lapTabelHtml(B.bayarStatus)}<div class="lap-dua-tabel">${lapTabelHtml(B.bayarUmur)}${lapTabelHtml(B.bayarVendor)}</div>`)}
    ${bagian(6, `Budget ${a.Y + 1}`, `${lapTabelHtml(B.anggaranRingkas)}${lapTabelHtml(B.rencanaBulan)}`)}
    <details class="lap-detail">
      <summary><i class="bi bi-chevron-right"></i> More details for analysis <small>revenue by customer, monthly comparison, statistics, forecast methods, transport detail, exchange rates</small></summary>
      ${bagian("A", "Revenue vs spending", `${lapTabelHtml(B.pendapatan)}<div class="lap-grafik-dua">${grafik(graf.pendapatan)}${grafik(graf.rasio)}</div>${lapTabelHtml(B.kanal)}${lapTabelHtml(B.custPend)}`)}
      ${bagian("B", "Monthly spending comparison", `${lapTabelHtml(B.bulanan)}${grafik(graf.kumulatif)}`)}
      ${bagian("C", "Breakdown", `${lapTabelHtml(B.jenis)}${lapTabelHtml(B.jenisBulan)}${lapTabelHtml(B.moda)}${grafik(graf.moda)}`)}
      ${bagian("D", "Vendors & customers", `${lapTabelHtml(B.vendor)}${lapTabelHtml(B.customer)}`)}
      ${bagian("E", "Statistics", lapTabelHtml(B.statistik))}
      ${bagian("F", `Forecast ${a.Y + 1} — methods`, `${lapTabelHtml(B.anggaranSaran)}${lapTabelHtml(B.metode)}${lapTabelHtml(B.ramalPend)}${lapTabelHtml(B.fasing)}${grafik(graf.ramalan)}`)}
      ${bagian("G", "Transport cost detail (DD Korea format)", `${lapTabelHtml(B.modaBulan)}${lapTabelHtml(B.jumlahModa)}${lapTabelHtml(B.vendorPpn)}${lapTabelHtml(B.anggaranPakai)}`)}
      ${bagian("H", "Exchange rates", lapTabelHtml(B.kurs))}
    </details>
    <p class="lap-catatan">Spending comes from Fund Requests (IDR, before VAT), dated by invoice date. Revenue comes from Invoice Number requests; foreign-currency invoices are converted at the weekly Kurs Pajak (KMK) valid on the invoice date, local sales are in IDR. Forecasts are statistical estimates from recorded history — review them against planned shipments and sales plans before setting the budget.</p>`;
}

/* Satu pendengar untuk seluruh panel (isinya digambar ulang terus). */
document.addEventListener("change", (e) => {
  const el = e.target.closest && e.target.closest("[data-lap], [data-lap-jenis]");
  if (!el || !lapData) return;
  if (el.dataset.lapJenis) {
    const j = el.dataset.lapJenis;
    lapSaringan.jenis = el.checked ? lapSaringan.jenis.concat([j]) : lapSaringan.jenis.filter((x) => x !== j);
  } else {
    lapSaringan[el.dataset.lap] = el.value;
  }
  const box = document.getElementById("docNumHistory");
  if (!box) return;
  if (el.dataset.lap === "tahun") {
    lapAmbilAnggaran(lapSaringan.tahun)
      .catch(() => ({ gagal: true }))
      .then((x) => {
        lapData.anggaran = x;
        lapGambar(box);
      });
    return;
  }
  lapGambar(box);
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-lap-unduh]")) {
    lapUnduhExcel();
    return;
  }
  if (e.target.closest("[data-lap-anggaran]")) {
    if (typeof requireEdit === "function" && !requireEdit()) return;
    const x = lapData.anggaran || {};
    showPrompt({
      title: `EXIM budget ${lapSaringan.tahun}`,
      icon: "bi-piggy-bank",
      okText: "Save",
      fields: [
        { key: "tahunan", label: "Annual budget (IDR)", type: "number", value: x.tahunan || "" },
        { key: "berubah", label: "Current budget after revisions (IDR) — empty = same", type: "number", value: x.berubah || "" },
      ],
      onSubmit: (v) => {
        lapSimpanAnggaran({ tahunan: lapAngka(v.tahunan), berubah: lapAngka(v.berubah) });
        return true;
      },
    });
  }
});

async function lapSimpanAnggaran(nilai) {
  const { error } = await supabaseClient.from("report_settings").upsert({
    key: lapKunciAnggaran(lapSaringan.tahun),
    value: nilai,
    updated_by: authState && authState.user ? authState.user.id : null,
  });
  if (error) {
    console.error(error);
    showToast("The budget could not be saved.", "danger");
    return;
  }
  lapData.anggaran = nilai;
  const box = document.getElementById("docNumHistory");
  if (box) lapGambar(box);
  showToast("Budget saved.", "dark");
}

/* ---------------------------- Excel ---------------------------- */

/* SVG -> PNG (base64) lewat kanvas, untuk disisipkan ke lembar Excel.
   Gagal (peramban tanpa kanvas) -> null: berkasnya tetap jadi, tanpa
   gambar grafik. */
function lapSvgKePng(svg, lebar, tinggi) {
  return new Promise((ok) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = lebar * 2;
          c.height = tinggi * 2;
          const g = c.getContext("2d");
          g.scale(2, 2);
          g.drawImage(img, 0, 0, lebar, tinggi);
          ok(c.toDataURL("image/png"));
        } catch (err) {
          ok(null);
        }
      };
      img.onerror = () => ok(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (err) {
      ok(null);
    }
  });
}

const LAP_XLS_FMT = { jt: '"IDR "#,##0', usd: '"USD "#,##0', rp: '"IDR "#,##0', rp2: "#,##0.00", pct: "0.0%", pct2: "0.00%", chg: "+0.0%;-0.0%;0.0%", n: "#,##0" };
const LAP_XLS_GARIS = { style: "thin", color: { argb: "FFCBD5E1" } };

/* Nilai sel untuk Excel: angka tetap angka (jt dalam juta, 1 desimal). */
function lapNilaiXls(c) {
  if (c.v == null || c.v === "" || (typeof c.v === "number" && !isFinite(c.v))) return null;
  if (c.f === "jt") return Math.round(c.v);
  if (c.f === "usd") return Math.round(c.v);
  if (c.f === "rp") return Math.round(c.v);
  if (c.f === "pct" || c.f === "pct2" || c.f === "chg") return Math.round(c.v * 1000000) / 1000000;
  if (c.f === "rp2") return Math.round(c.v * 100) / 100;
  if (c.f === "n") return Math.round(c.v);
  return String(c.v);
}

/* Satu blok tabel ke lembar Excel mulai baris `r`; mengembalikan baris
   kosong sesudahnya. Rata tengah semua, seperti di layar. */
function lapXlsBlok(ws, b, r) {
  if (!b) return r;
  ws.getCell(r, 1).value = b.judul;
  ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
  if (b.sub) {
    ws.getCell(r + 1, 1).value = b.sub;
    ws.getCell(r + 1, 1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  }
  r += b.sub ? 2 : 1;
  const tulisBaris = (cells, gaya) => {
    cells.forEach((c, i) => {
      const x = ws.getCell(r, i + 1);
      x.value = gaya.kepala ? c : lapNilaiXls(c);
      if (!gaya.kepala && LAP_XLS_FMT[c.f]) x.numFmt = LAP_XLS_FMT[c.f];
      x.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      x.border = { top: LAP_XLS_GARIS, bottom: LAP_XLS_GARIS, left: LAP_XLS_GARIS, right: LAP_XLS_GARIS };
      if (gaya.kepala) {
        x.font = { bold: true, color: { argb: "FFFFFFFF" } };
        x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      } else if (gaya.kaki) {
        x.font = { bold: true };
        x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      } else {
        if (c.b) x.font = { bold: true };
        if (c.f === "chg" && c.v != null) x.font = Object.assign({}, x.font || {}, { color: { argb: c.v > 0.0005 ? "FFB91C1C" : c.v < -0.0005 ? "FF15803D" : "FF334155" } });
        if (gaya.zebra) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
    r += 1;
  };
  tulisBaris(b.kepala, { kepala: true });
  if (!b.baris.length) {
    ws.getCell(r, 1).value = "No data for this period.";
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
    r += 1;
  }
  b.baris.forEach((row, i) => tulisBaris(row, { zebra: i % 2 === 1 }));
  if (b.kaki) tulisBaris(b.kaki, { kaki: true });
  if (b.catatan) {
    ws.getCell(r, 1).value = b.catatan;
    ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    r += 1;
  }
  return r + 1;
}

/* Lebar kolom secukupnya menurut isi terpanjang (rata tengah tetap rapi). */
function lapXlsLebar(ws, min, maks) {
  ws.columns.forEach((col) => {
    let l = min || 10;
    col.eachCell({ includeEmpty: false }, (c) => {
      const t = c.value == null ? "" : typeof c.value === "number" ? c.value.toLocaleString("en-US") : String(c.value);
      if (t.length < 60) l = Math.max(l, t.length + 3);
    });
    col.width = Math.min(maks || 40, l);
  });
}

function lapXlsGambar(wb, ws, r, gambar) {
  (gambar || []).forEach((g) => {
    if (!g) return;
    const id = wb.addImage({ base64: g, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: r }, ext: { width: 960, height: 352 } });
    r += 20;
  });
  return r;
}

function lapXlsCetak(ws) {
  ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
  ws.views = [{ showGridLines: false }];
}

function lapSusunWorkbook(hasil, gambar) {
  const { a, lap, blok: B } = hasil;
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  const g = gambar || {};

  // 1. Summary -- versi ringkas, yang dibaca dulu
  const s = wb.addWorksheet("Summary");
  s.getCell(1, 1).value = `EXIM SPENDING REPORT ${a.Y}`;
  s.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  s.getCell(2, 1).value = `January – ${lapNamaBulan(a.M)} ${a.Y}, compared with ${a.Y - 1}. Amounts in rupiah (IDR). Revenue = Invoice Number values (USD at Kurs Pajak); spending = Fund Requests before VAT.`;
  s.getCell(2, 1).font = { italic: true, color: { argb: "FF64748B" } };
  let r = lapXlsBlok(s, {
    judul: "Key figures",
    kepala: ["", "Amount", "Compared"],
    baris: [
      [sel(`Revenue Jan–${lapBulanPendek(a.M)} ${a.Y} (USD, export invoices)`), sel(a.pendUsdYtd, "usd"), sel(`${a.jumlahInvoice} invoices`)],
      [sel(`Revenue Jan–${lapBulanPendek(a.M)} ${a.Y} (IDR, at Kurs Pajak)`), sel(a.pendYtd, "jt"), sel(a.pendYoy, "chg")],
      [sel(`EXIM spending Jan–${lapBulanPendek(a.M)} ${a.Y}`), sel(a.ytd, "jt"), sel(a.yoy, "chg")],
      [sel("Spending as % of revenue"), sel(a.rasio, "pct2"), sel(a.rasioLalu != null ? `${a.Y - 1}: ${(a.rasioLalu * 100).toFixed(2)}%` : "")],
      [sel(`${lapNamaBulan(a.M)} ${a.Y} spending`), sel(a.bulanIni, "jt"), sel(a.mom, "chg")],
      [sel(`${a.Y} full-year estimate`), sel(a.proyeksiIni, "jt"), sel(lapPerubahan(a.proyeksiIni, a.totalLalu), "chg")],
      [sel(`Recommended ${a.Y + 1} budget`, "txt", { b: true }), sel(a.rekomendasi, "jt", { b: true }), sel(`≈ ${lapFmtUang(a.rekomendasi / 12)} per month`)],
    ],
  }, 4);
  s.getCell(r, 1).value = "In short";
  s.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  a.wawasan.forEach((x) => {
    s.getCell(r, 1).value = "• " + x;
    s.mergeCells(r, 1, r, 6);
    s.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    s.getRow(r).height = 30;
    r += 1;
  });
  r += 1;
  [B.ringkasBulan, B.jenisRingkas, B.modaRingkas, B.vendorTop, B.perKiriman, B.bayarStatus, B.anggaranRingkas, B.rencanaBulan].forEach((x) => (r = lapXlsBlok(s, x, r)));
  lapXlsLebar(s, 14, 34);
  s.getColumn(1).width = 30;
  lapXlsGambar(wb, s, r + 1, [g.yoy]);
  lapXlsCetak(s);

  const lembar = (nama, blok, gbr) => {
    const ws = wb.addWorksheet(nama);
    let baris = 1;
    blok.forEach((b) => (baris = lapXlsBlok(ws, b, baris)));
    lapXlsLebar(ws, 10, 34);
    lapXlsGambar(wb, ws, baris, gbr);
    lapXlsCetak(ws);
    return ws;
  };
  lembar("Revenue vs Spending", [B.pendapatan, B.kanal, B.custPend], [g.pendapatan, g.rasio]);
  lembar("Monthly Comparison", [B.bulanan], [g.kumulatif]);
  lembar("Breakdown", [B.jenis, B.jenisBulan, B.moda], [g.moda]);
  lembar("Vendors & Customers", [B.vendor, B.customer, B.perKiriman]);
  lembar("Vendor Comparison", [B.bandingVendor]);
  lembar("Payments", [B.bayarStatus, B.bayarUmur, B.bayarVendor]);
  lembar("Statistics", [B.statistik]);
  lembar(`Forecast ${a.Y + 1}`, [B.anggaranSaran, B.metode].concat(B.ramalPend ? [B.ramalPend] : []).concat([B.fasing]), [g.ramalan]);
  lembar("Transport Detail", [B.modaBulan, B.jumlahModa]);
  lembar("Vendor Settlement", [B.vendorPpn].concat(B.anggaranPakai ? [B.anggaranPakai] : []));
  lembar("Exchange Rates", [B.kurs]);

  // Data mentah
  const d = wb.addWorksheet("Cost Data");
  d.columns = [
    { header: "Number", width: 22 }, { header: "Date", width: 12 }, { header: "Vendor", width: 26 }, { header: "Customer", width: 22 },
    { header: "Mode", width: 14 }, { header: "Transaction Type", width: 16 }, { header: "Expense Type", width: 14 }, { header: "Currency", width: 10 },
    { header: "Non-VAT (IDR)", width: 16 }, { header: "VAT-able base (IDR)", width: 18 }, { header: "VAT (IDR)", width: 14 },
    { header: "Total before VAT (IDR)", width: 20 }, { header: "Notes", width: 40 },
  ];
  const kepala = (row) => row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  kepala(d.getRow(1));
  (lapData && lapData.dana ? lapData.dana.map((x) => lapBarisDana(x, lap.kurs)) : lap.biaya)
    .filter((x) => lapSaringan.jenis.indexOf(x.jenis) >= 0)
    .sort((x, y) => x.tanggal.localeCompare(y.tanggal))
    .forEach((x) => {
      const row = d.addRow([x.nomor, x.tanggal, x.vendor, x.customer, lapNamaModa(x.moda), x.transaksi, x.jenis === "Lainnya" ? "Other" : x.jenis, x.mata, x.tanpaPpn, x.kenaPpn, x.ppn, x.total, x.catatan]);
      [9, 10, 11, 12].forEach((k) => (row.getCell(k).numFmt = "#,##0"));
      row.eachCell((c, k) => (c.alignment = { horizontal: k === 13 ? "left" : "center", vertical: "middle" }));
    });
  d.autoFilter = { from: "A1", to: "M1" };
  d.views = [{ state: "frozen", ySplit: 1 }];

  const p = wb.addWorksheet("Sales Data");
  p.columns = [
    { header: "Invoice No.", width: 30 }, { header: "Date", width: 12 }, { header: "Customer", width: 28 }, { header: "Terms of Delivery", width: 22 },
    { header: "Terms group", width: 14 }, { header: "Channel", width: 12 }, { header: "Currency", width: 10 }, { header: "Amount", width: 14 },
    { header: "Kurs Pajak", width: 12 }, { header: "Amount (IDR)", width: 18 }, { header: "QTY", width: 8 },
  ];
  kepala(p.getRow(1));
  lap.jual.slice().sort((x, y) => x.tanggal.localeCompare(y.tanggal)).forEach((x) => {
    const row = p.addRow([x.nomor, x.tanggal, x.customer, x.syaratTeks, x.syarat, x.kanal, x.mata, x.jumlahAsli, x.kurs, x.jumlah, x.qty]);
    row.getCell(8).numFmt = "#,##0.00";
    row.getCell(9).numFmt = "#,##0.00";
    row.getCell(10).numFmt = "#,##0";
    row.eachCell((c) => (c.alignment = { horizontal: "center", vertical: "middle" }));
  });
  p.autoFilter = { from: "A1", to: "K1" };
  p.views = [{ state: "frozen", ySplit: 1 }];
  return wb;
}

async function lapUnduhExcel() {
  if (!lapData) return;
  try {
    await ensureExcelJS();
    const hasil = lapHitungSekarang();
    const graf = lapGrafik(hasil.a, hasil.lap);
    const [yoy, kumulatif, ramalan, moda, pendapatan, rasio] = await Promise.all(
      [graf.yoy, graf.kumulatif, graf.ramalan, graf.moda, graf.pendapatan, graf.rasio].map((svg) => lapSvgKePng(svg, LAP_GRAFIK.W, LAP_GRAFIK.H)));
    const wb = lapSusunWorkbook(hasil, { yoy, kumulatif, ramalan, moda, pendapatan, rasio });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    tautan.download = `EXIM_Spending_Report_${hasil.a.Y}-${String(hasil.a.M).padStart(2, "0")}.xlsx`;
    document.body.appendChild(tautan);
    tautan.click();
    tautan.remove();
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
  } catch (e) {
    console.error(e);
    showToast("The report Excel could not be created.", "danger");
  }
}
