"use strict";

/* ------------------------------------------------------------------
   HALAMAN MASTERLIST (#/masterlist)

   Masterlist = daftar barang modal yang mendapat fasilitas pembebasan
   bea masuk; tiap baris punya KUOTA. Setiap PIB yang memakai fasilitas
   itu mengurangi kuota barisnya. Halaman ini menjawab tiga pertanyaan,
   berurutan dari atas ke bawah:

     1. Berapa kuota yang masih tersedia, dan di mesin apa?
     2. Apakah dokumennya masih berlaku? Adakah jadwal import yang
        memakai fasilitas ini tapi belum dicatat di sini?
     3. Baris per baris: kuota, terpakai, sisa, dan PIB yang memakainya.

   TERPAKAI & SISA tidak pernah disimpan: selalu dihitung dari catatan
   realisasi (masterlist_usages), jadi tidak mungkin berbeda darinya.
   Database ikut menjaga -- realisasi yang melebihi kuota ditolak pemicu
   di migration-masterlist.sql.

   Semua peran yang boleh membuka halaman ini MEMBACA; hanya EXIM yang
   mencatat realisasi dan mengubah baris: requireEdit() di sini, kelas
   .mst-ubah disembunyikan lewat body.is-viewer (auth.css), dan RLS di
   database.

   Semua teks yang dirakit di sini lewat tt(), dan halaman ini digambar
   ulang saat bahasa diganti (lihat setLang di i18n.js).
------------------------------------------------------------------ */

let mstDok = null; // baris tabel masterlists yang sedang dibuka
let mstBarisDb = []; // masterlist_items
let mstRealisasiDb = []; // masterlist_usages
let mstTermuat = false;

/* KOLOM DARI MIGRASI LANJUTAN. Halaman ini tetap jalan sebelum migrasinya
   dijalankan: kolom yang belum ada dibuang dari bacaan & kiriman
   (mstBacaKolom, mstKirim). Isian yang HANYA bisa disimpan di kolom itu
   -- lebih dari satu PIB, nilai USD, HS Code -- ditolak dengan pesan
   yang menunjuk berkas migrasinya. */
const MST_MIGRASI = {
  pibs: "migration-masterlist-pib-parsial.sql",
  value_quota: "migration-masterlist-nilai.sql",
  invoice_value: "migration-masterlist-nilai.sql",
  hs_code: "migration-masterlist-hs-code.sql",
};
const mstKolomBelumAda = new Set();
const mstAdaKolom = (k) => !mstKolomBelumAda.has(k);

/* Keadaan tampilan. Saringan (cari, status, lini) TIDAK disalin ke sini:
   dibaca langsung dari kotaknya tiap menggambar, jadi tidak ada salinan
   yang bisa tertinggal dari yang terlihat. */
const mstKeadaan = {
  tampilan: "baris", // "baris" | "pib"
  halaman: 1,
  perHalaman: 25,
  terbuka: new Set(), // baris / PIB yang rinciannya sedang dibuka
  jenis: null, // { nama, lini } -- saringan dari panel "Kuota yang masih tersedia"
  semuaJenis: false, // panel itu menampilkan seluruh jenis, bukan 8 teratas
};

const MST_JENIS_AWAL = 8; // jenis mesin yang tampil sebelum "tampilkan semua"
const MST_TALLY_MAKS = 36; // di atas ini satu tanda per unit tidak terbaca lagi
const MST_MASA_DEKAT = 90; // hari menjelang akhir masa berlaku
const MST_UKURAN_HALAMAN = [10, 25, 50, 100];

/* ---------- angka ---------- */

/* Kuota & realisasi bisa berpecahan (kg, meter) -- database menyimpan
   tiga desimal. Dibulatkan ke situ supaya 0,1 + 0,2 tidak tampil
   sebagai 0,30000000000000004. */
function mstBulat(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}
function mstFmt(n) {
  return angkaLokal(mstBulat(n), activeLang === "en" ? "en-US" : "id-ID", { maximumFractionDigits: 3 });
}

/* NILAI (USD) -- dua desimal, ditulis seperti di invoice & kotak harga
   barang di form jadwal: koma ribuan, titik desimal ("116,700.00"). */
const MST_MATA_UANG = "USD";
const MST_TOLERANSI_NILAI = 0.005; // di bawah satu sen = sama
function mstUang(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function mstAngkaUang(n) {
  return angkaLokal(mstUang(n), "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const mstFmtUang = (n) => MST_MATA_UANG + " " + mstAngkaUang(n);
/* Nilai dari database: null / "" = belum diisi (bukan nol). */
const mstNilaiDb = (v) => (v == null || v === "" ? null : mstUang(v));

/* ---------- spesifikasi ---------- */

/* "TREAD(CASTING MOLD" -> "TREAD (CASTING MOLD)": di dokumen sumbernya
   lini yang sama ditulis dengan dan tanpa spasi, kadang kurungnya tidak
   ditutup. Tanpa dirapikan, satu lini terpecah jadi tiga saringan. */
function mstRapikanLini(teks) {
  let isi = String(teks || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!isi) return "";
  isi = isi.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ")");
  const buka = (isi.match(/\(/g) || []).length;
  const tutup = (isi.match(/\)/g) || []).length;
  if (buka > tutup) isi += ")".repeat(buka - tutup);
  return isi;
}

/* Spesifikasi di masterlist ditulis dalam satu kalimat:

     BRAND DOOSAN; VC630; MV0043-000164; 53.3 KW; FOR FLOW PROSES
     MANUFAKTUR TREAD (CASTING MOLD)

   Diurai jadi merek, rincian (model / nomor seri), daya, dan lini
   proses -- supaya bisa ditampilkan ringkas dan disaring per lini.
   Teks aslinya TIDAK diubah; yang tidak mengikuti pola itu ditampilkan
   apa adanya (`mentah`). */
function mstUraiSpek(spek) {
  const teks = String(spek || "").replace(/\s+/g, " ").trim();
  const m = teks.match(/^(.*?)[\s;]*FOR\s+FLOW\s+PROSES\s+MANUFAKTUR\s*(.*)$/i);
  const kepala = (m ? m[1] : teks).replace(/[\s;]+$/, "");
  const lini = m ? mstRapikanLini(m[2]) : "";
  if (!/^BRAND\b/i.test(kepala)) return { merek: "", rincian: [], daya: "", lini, mentah: kepala };
  const bagian = kepala
    .replace(/^BRAND\b[\s;]*/i, "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  let daya = "";
  if (bagian.length) {
    const d = bagian[bagian.length - 1].match(/^(.*?)(\d+(?:[.,]\d+)?)\s*KW$/i);
    if (d) {
      daya = d[2] + " kW";
      const sisa = d[1].trim();
      if (sisa) bagian[bagian.length - 1] = sisa;
      else bagian.pop();
    }
  }
  return { merek: bagian[0] || "", rincian: bagian.slice(1), daya, lini, mentah: "" };
}

/* Spesifikasi ringkas untuk satu baris tabel: merek, model/seri, daya. */
function mstSpekRingkas(spek) {
  if (spek.mentah) return spek.mentah;
  return [spek.merek].concat(spek.rincian, spek.daya ? [spek.daya] : []).filter(Boolean).join(" · ");
}

/* ---------- baris + realisasinya ---------- */

function mstUrutRealisasi(a, b) {
  return (
    String(mstTanggalAwal(a) || "9999").localeCompare(String(mstTanggalAwal(b) || "9999")) ||
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
}

/* Baris masterlist beserta hitungannya. Terpakai = jumlah realisasinya;
   sisa = kuota - terpakai. Dihitung ulang tiap dipanggil. */
function mstSusun() {
  const perBaris = new Map();
  mstRealisasiDb.forEach((u) => {
    if (!perBaris.has(u.item_id)) perBaris.set(u.item_id, []);
    perBaris.get(u.item_id).push(u);
  });
  return mstBarisDb
    .slice()
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((b) => {
      const realisasi = (perBaris.get(b.id) || []).slice().sort(mstUrutRealisasi);
      const kuota = mstBulat(b.quota);
      const terpakai = mstBulat(realisasi.reduce((s, u) => s + (Number(u.qty) || 0), 0));
      const spek = mstUraiSpek(b.specification);
      /* NILAI (USD): sama seperti unit -- terpakai = jumlah nilai invoice
         realisasinya, sisa = nilai masterlist - terpakai. Realisasi yang
         belum dicatat nilainya dihitung terpisah (tanpaNilai): sisanya
         belum pasti, bukan nol. */
      const nilaiKuota = mstNilaiDb(b.value_quota);
      const bernilai = realisasi.filter((u) => mstNilaiDb(u.invoice_value) != null);
      const nilaiTerpakai = mstUang(bernilai.reduce((s, u) => s + Number(u.invoice_value), 0));
      const r = {
        id: b.id,
        no: Number(b.no),
        nama: b.description || "",
        // HS Code barang -- di rincian baris & unduhan Excel, tidak di cetakan stock opname
        hsCode: String(b.hs_code || "").trim(),
        spesifikasi: b.specification || "",
        satuan: b.uom || "",
        kuota,
        terpakai,
        sisa: mstBulat(kuota - terpakai),
        realisasi,
        spek,
        lini: spek.lini,
        nilaiKuota,
        nilaiTerpakai,
        nilaiSisa: nilaiKuota == null ? null : mstUang(nilaiKuota - nilaiTerpakai),
        tanpaNilai: realisasi.length - bernilai.length,
        // Harga per unit di masterlist -- patokan nilai invoice per unit
        hargaSatuan: nilaiKuota == null || !(kuota > 0) ? null : nilaiKuota / kuota,
      };
      r.statusNilai = mstStatusNilai(r);
      return r;
    });
}

/* Nilai masterlist vs nilai invoice yang sudah direalisasikan:
     kosong   nilai masterlist belum diisi
     lebih    nilai invoice melebihi nilai masterlist
     belum    ada realisasi yang belum dicatat nilainya (sisanya belum pasti)
     selisih  unit sudah habis, tapi nilainya belum sama dengan masterlist
     sesuai   selebihnya */
function mstStatusNilai(b) {
  if (b.nilaiKuota == null) return "kosong";
  if (b.nilaiSisa < -MST_TOLERANSI_NILAI) return "lebih";
  if (b.tanpaNilai > 0) return "belum";
  if (b.sisa <= 0 && Math.abs(b.nilaiSisa) > MST_TOLERANSI_NILAI) return "selisih";
  return "sesuai";
}
const MST_NILAI_DICEK = ["lebih", "belum", "selisih"];

function mstRingkasan(baris) {
  const r = { baris: baris.length, kuota: 0, terpakai: 0, sisa: 0, bersisa: 0, habis: 0, utuh: 0, nilaiBaris: 0, nilaiKuota: 0, nilaiTerpakai: 0, nilaiDicek: 0 };
  baris.forEach((b) => {
    r.kuota += b.kuota;
    r.terpakai += b.terpakai;
    if (b.sisa > 0) r.bersisa++;
    else r.habis++;
    if (b.terpakai === 0) r.utuh++;
    // Nilai dijumlahkan hanya dari baris yang nilai masterlist-nya sudah diisi
    if (b.nilaiKuota != null) {
      r.nilaiBaris++;
      r.nilaiKuota += b.nilaiKuota;
      r.nilaiTerpakai += b.nilaiTerpakai;
    }
    if (MST_NILAI_DICEK.indexOf(b.statusNilai) >= 0) r.nilaiDicek++;
  });
  r.kuota = mstBulat(r.kuota);
  r.terpakai = mstBulat(r.terpakai);
  r.sisa = mstBulat(r.kuota - r.terpakai);
  r.nilaiKuota = mstUang(r.nilaiKuota);
  r.nilaiTerpakai = mstUang(r.nilaiTerpakai);
  r.nilaiSisa = mstUang(r.nilaiKuota - r.nilaiTerpakai);
  return r;
}

/* Kuota per JENIS MESIN (uraian yang sama di lini proses yang sama):
   sembilan baris "5-AXIS MACHINING CENTER" yang masing-masing satu unit
   terbaca sebagai satu jenis berkuota sembilan. */
function mstPerJenis(baris) {
  const peta = new Map();
  baris.forEach((b) => {
    const kunci = b.lini + "\u0000" + b.nama;
    let g = peta.get(kunci);
    if (!g) {
      g = { nama: b.nama, lini: b.lini, baris: 0, kuota: 0, terpakai: 0, nilaiKuota: 0, nilaiTerpakai: 0, nilaiLengkap: true };
      peta.set(kunci, g);
    }
    g.baris++;
    g.kuota += b.kuota;
    g.terpakai += b.terpakai;
    // Sisa nilai sebuah jenis hanya pasti kalau SEMUA barisnya sudah bernilai
    if (b.nilaiKuota == null || b.tanpaNilai > 0) g.nilaiLengkap = false;
    else {
      g.nilaiKuota += b.nilaiKuota;
      g.nilaiTerpakai += b.nilaiTerpakai;
    }
  });
  return [...peta.values()]
    .map((g) => {
      const kuota = mstBulat(g.kuota);
      const terpakai = mstBulat(g.terpakai);
      return {
        nama: g.nama,
        lini: g.lini,
        baris: g.baris,
        kuota,
        terpakai,
        sisa: mstBulat(kuota - terpakai),
        nilaiSisa: g.nilaiLengkap ? mstUang(g.nilaiKuota - g.nilaiTerpakai) : null,
      };
    })
    .sort((a, b) => b.sisa - a.sisa || b.kuota - a.kuota || a.nama.localeCompare(b.nama));
}

/* ---------- nomor aju ---------- */

const mstDigit = (s) => String(s == null ? "" : s).replace(/\D+/g, "");

/* Satu catatan bisa merujuk lebih dari satu PIB ("7130 / 9204"). */
function mstPecahAju(ref) {
  return String(ref == null ? "" : ref)
    .split(/[/,;&]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* Jadwal import yang nomor ajunya cocok dengan sebuah rujukan.

   Rujukan boleh nomor aju lengkap (26 angka) atau hanya EKORNYA --
   catatan lama dari Excel memakai empat angka terakhir ("7154"). Yang
   dibandingkan angkanya saja; tanda hubung di nomor aju diabaikan.
   Kurang dari empat angka terlalu mudah kebetulan cocok, jadi tidak
   dicocokkan sama sekali. */
function mstJadwalUntukAju(ref) {
  const cari = mstDigit(ref);
  if (cari.length < 4) return [];
  const daftar = (typeof data !== "undefined" && data && data.import) || [];
  return daftar.filter((s) => {
    const aju = mstDigit(s.noAju);
    return !!aju && aju.endsWith(cari);
  });
}

/* Kunci pengelompokan per PIB: nomor aju jadwalnya kalau tepat satu
   jadwal yang cocok (rujukan "7154" dan nomor lengkapnya jadi satu
   kelompok), kalau tidak angka rujukannya sendiri. */
function mstKunciAju(ref) {
  const bagian = mstPecahAju(ref);
  if (bagian.length !== 1) return bagian.map((x) => mstDigit(x) || x.toUpperCase()).join("/");
  const jadwal = mstJadwalUntukAju(bagian[0]);
  if (jadwal.length === 1) return mstDigit(jadwal[0].noAju);
  return mstDigit(bagian[0]) || bagian[0].toUpperCase();
}

/* Nomor aju lengkap terlalu panjang untuk sebuah cip: ditampilkan
   ekornya (enam angka terakhir = nomor urut pendaftarannya), nomor
   lengkapnya di keterangan cip dan di rincian baris. */
function mstAjuRingkas(ref) {
  const teks = String(ref == null ? "" : ref).trim();
  const angka = mstDigit(teks);
  return angka.length > 10 ? "…" + angka.slice(-6) : teks;
}

/* ---------- PIB sebuah realisasi ---------- */

/* SATU REALISASI, BEBERAPA PIB. Mesin yang dikirim bertahap -- sebagian
   di PIB bulan Mei, sisanya di PIB bulan Agustus -- memakai kuotanya
   SEKALI, tapi punya dua PIB, masing-masing dengan nomor aju dan
   tanggalnya sendiri. Daftarnya di kolom `pibs`
   (migration-masterlist-pib-parsial.sql), urut tanggal.

   Catatan dari sebelum kolom itu ada diurai dari aju_ref ("7130 / 9204")
   dan tanggalnya milik PIB pertama -- sama persis dengan isian awal di
   migrasinya, jadi tampilannya tidak berubah begitu migrasi dijalankan. */
function mstPibs(u) {
  if (!u) return [];
  const daftar = Array.isArray(u.pibs) ? u.pibs : [];
  const pibs = daftar.length
    ? daftar.map((p) => ({ aju: String((p && p.aju_ref) || "").trim(), tanggal: (p && p.pib_date) || null }))
    : mstPecahAju(u.aju_ref).map((aju, i) => ({ aju, tanggal: (i === 0 && u.pib_date) || null }));
  return pibs.filter((p) => p.aju);
}

const mstTanggalTerawal = (pibs) => pibs.reduce((min, p) => (p.tanggal && (!min || p.tanggal < min) ? p.tanggal : min), null);

/* Tanggal PIB paling awal sebuah realisasi = kapan kirimannya dimulai. */
function mstTanggalAwal(u) {
  return mstTanggalTerawal(mstPibs(u));
}

/* Kiriman pertama dulu -- kalau SEMUA PIB-nya sudah bertanggal. Selama
   ada yang belum, urutan yang ada dipertahankan: PIB lama dari Excel
   (tanpa tanggal) tidak boleh terlempar ke belakang kiriman lanjutannya. */
function mstUrutPib(pibs) {
  if (!pibs.every((p) => p.tanggal)) return pibs.slice();
  return pibs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.tanggal === b.p.tanggal ? a.i - b.i : a.p.tanggal < b.p.tanggal ? -1 : 1))
    .map((o) => o.p);
}

/* Daftar PIB -> kolom simpanannya. aju_ref & pib_date tetap diisi
   (pemicu di database juga menurunkannya) supaya yang membaca kolom lama
   tetap benar, dan supaya realisasi satu PIB tetap bisa disimpan sebelum
   migrasinya dijalankan. */
function mstKolomPib(pibs) {
  const kolom = { aju_ref: pibs.map((p) => p.aju).join(" / "), pib_date: mstTanggalTerawal(pibs) };
  if (mstAdaKolom("pibs")) kolom.pibs = pibs.map((p) => ({ aju_ref: p.aju, pib_date: p.tanggal || null }));
  return kolom;
}

/* Tanggal yang sudah tercatat untuk sebuah PIB di realisasi LAIN. Satu
   PIB hanya punya satu tanggal, jadi isian berikutnya mengikutinya. */
function mstTanggalTercatat(kunci, kecualiId) {
  const tanggal = new Set();
  let catatan = 0;
  mstRealisasiDb.forEach((u) => {
    if (u.id === kecualiId) return;
    const cocok = mstPibs(u).filter((p) => mstKunciAju(p.aju) === kunci);
    if (!cocok.length) return;
    catatan++;
    cocok.forEach((p) => p.tanggal && tanggal.add(p.tanggal));
  });
  return { catatan, tanggal: [...tanggal].sort() };
}

/* ---------- kolom dari migrasi lanjutan ---------- */

function mstPesanMigrasi(kolom) {
  const berkas = MST_MIGRASI[kolom];
  const [apa, what] =
    kolom === "pibs"
      ? ["Realisasi dengan lebih dari satu PIB", "A realization with more than one PIB needs"]
      : kolom === "hs_code"
        ? ["HS Code", "The HS Code needs"]
        : ["Nilai (USD)", "Values (USD) need"];
  return tt(
    `${apa} butuh pembaruan database: jalankan ${berkas} di Supabase (SQL Editor), lalu muat ulang halaman ini.`,
    `${what} a database update: run ${berkas} in Supabase (SQL Editor), then reload this page.`,
  );
}
const mstPesanMigrasiPib = () => mstPesanMigrasi("pibs");

/* Isian yang hilang kalau kolomnya dibuang -- itu yang ditolak, bukan dibuang diam-diam. */
const MST_BERISI = {
  pibs: (v) => Array.isArray(v) && v.length > 1,
  value_quota: (v) => v != null,
  invoice_value: (v) => v != null,
  hs_code: (v) => v != null && String(v).trim() !== "",
};

/* Kolom opsional yang disebut galat database: "column masterlist_usages.pibs
   does not exist" (membaca) atau "Could not find the 'pibs' column of ..."
   (menulis). Pesan lain tidak dihitung -- "duplicate key value" bukan
   kolom yang hilang. */
function mstKolomDariGalat(e) {
  const pesan = String((e && (e.message || e.details)) || "");
  const m = pesan.match(/column\s+(?:"?\w+"?\.)?"?(\w+)"?\s+does not exist/i) || pesan.match(/Could not find the '(\w+)' column/i);
  return m && MST_MIGRASI[m[1]] ? m[1] : null;
}

/* Membaca satu tabel bersama kolom opsionalnya; yang belum ada dibuang
   lalu dibaca ulang. */
async function mstBacaKolom(tabel, dasar, opsional, susun) {
  let kolom = opsional.filter(mstAdaKolom);
  for (;;) {
    const { data, error } = await susun(supabaseClient.from(tabel).select([dasar].concat(kolom).join(", ")));
    const k = error && mstKolomDariGalat(error);
    if (k && kolom.indexOf(k) >= 0) {
      mstKolomBelumAda.add(k);
      kolom = kolom.filter((x) => x !== k);
      continue;
    }
    if (error) throw error;
    return data || [];
  }
}

/* Menulis (insert / update) dengan kolom opsional. Kolom yang belum ada
   dibuang; kalau isinya tidak boleh hilang, ditolak dengan pesan
   migrasinya. Hasil { data, error, muatan }; muatan = yang benar-benar
   terkirim, untuk disalin ke layar. */
async function mstKirim(kirim, muatan) {
  for (;;) {
    for (const k of mstKolomBelumAda) {
      if (muatan.some((r) => k in r && MST_BERISI[k](r[k]))) return { data: null, error: { message: mstPesanMigrasi(k) }, muatan };
    }
    muatan = muatan.map((r) => {
      const x = Object.assign({}, r);
      mstKolomBelumAda.forEach((k) => delete x[k]);
      return x;
    });
    const hasil = await kirim(muatan);
    const k = hasil && hasil.error && mstKolomDariGalat(hasil.error);
    if (k && !mstKolomBelumAda.has(k) && muatan.some((r) => k in r)) {
      mstKolomBelumAda.add(k);
      continue;
    }
    return { data: hasil ? hasil.data : null, error: hasil ? hasil.error : null, muatan };
  }
}

/* Barang sebuah jadwal yang ditandai berfasilitas Masterlist. */
function mstBarangMasterlist(s) {
  return ((s && s.items) || []).filter((it) => (it.skb || []).some((sk) => sk.jenis === "Masterlist"));
}

/* JADWAL IMPORT YANG BELUM DICATAT: barangnya ditandai berfasilitas
   Masterlist di form jadwal, tapi nomor ajunya belum muncul di catatan
   realisasi mana pun. Jadwal yang belum punya nomor aju ikut didaftar
   -- ia belum bisa dicocokkan, dan itu pun perlu terlihat. */
function mstBelumDicatat() {
  const rujukan = [];
  mstRealisasiDb.forEach((u) =>
    mstPibs(u).forEach((p) => {
      const d = mstDigit(p.aju);
      if (d.length >= 4) rujukan.push(d);
    }),
  );
  const daftar = (typeof data !== "undefined" && data && data.import) || [];
  return daftar
    .filter((s) => {
      if (!mstBarangMasterlist(s).length) return false;
      const aju = mstDigit(s.noAju);
      if (!aju) return true;
      return !rujukan.some((r) => aju.endsWith(r));
    })
    .sort((a, b) => String(b.docDate || b.eta || "").localeCompare(String(a.docDate || a.eta || "")));
}

/* ---------- saringan ---------- */

function mstSaringan() {
  return {
    q: (($("#mstSearch") || {}).value || "").trim().toLowerCase(),
    status: ($("#mstStatus") || {}).value || "",
    lini: ($("#mstLini") || {}).value || "",
    jenis: mstKeadaan.jenis,
  };
}

/* Cocok kalau SEMUA kata yang diketik ada di salah satu kolom, termasuk
   nomor aju realisasinya: "doosan 7154" menemukan mesin Doosan yang
   direalisasikan PIB 7154. */
function mstCocok(b, f) {
  if (f.status === "sisa" && !(b.sisa > 0)) return false;
  if (f.status === "habis" && b.sisa > 0) return false;
  // Sudah ada yang masuk (sebagian atau seluruhnya) -- yang dihitung saat stock opname
  if (f.status === "pakai" && !(b.terpakai > 0)) return false;
  if (f.status === "utuh" && b.terpakai !== 0) return false;
  if (f.status === "nilai" && MST_NILAI_DICEK.indexOf(b.statusNilai) < 0) return false;
  if (f.lini && b.lini !== f.lini) return false;
  if (f.jenis && (b.nama !== f.jenis.nama || b.lini !== f.jenis.lini)) return false;
  if (!f.q) return true;
  // HS Code juga tanpa titik: "84807190" menemukan "8480.71.90"
  const isi = [b.no, b.nama, b.hsCode, b.hsCode.replace(/\D/g, ""), b.spesifikasi, b.satuan]
    .concat(b.realisasi.flatMap((u) => mstPibs(u).map((p) => p.aju)))
    .join(" ")
    .toLowerCase();
  return f.q.split(/\s+/).every((kata) => isi.includes(kata));
}

/* Realisasi dikelompokkan per PIB. Dihitung dari baris yang LOLOS
   saringan, jadi kotak cari dan saringan lini berlaku di kedua susunan.

   Realisasi PARSIAL (beberapa PIB) masuk ke kelompok tiap PIB-nya.
   Jumlahnya milik gabungan PIB itu, bukan salah satunya -- jadi dihitung
   terpisah (unitParsial), tidak ditambahkan ke unit PIB yang utuh. */
function mstPerPib(baris) {
  const peta = new Map();
  baris.forEach((b) =>
    b.realisasi.forEach((u) => {
      const pibs = mstPibs(u);
      const parsial = pibs.length > 1;
      pibs.forEach((p) => {
        const kunci = mstKunciAju(p.aju);
        let g = peta.get(kunci);
        if (!g) {
          g = { kunci, aju: p.aju, tanggal: "", semuaTanggal: new Set(), tanpaTanggal: 0, unit: 0, unitParsial: 0, nilai: 0, nilaiParsial: 0, tanpaNilai: 0, isi: [] };
          peta.set(kunci, g);
        }
        // Nama kelompoknya rujukan yang paling lengkap di antara anggotanya
        if (p.aju.length > g.aju.length) g.aju = p.aju;
        if (p.tanggal) {
          g.semuaTanggal.add(p.tanggal);
          if (p.tanggal > g.tanggal) g.tanggal = p.tanggal;
        } else g.tanpaTanggal++;
        if (parsial) g.unitParsial += Number(u.qty) || 0;
        else g.unit += Number(u.qty) || 0;
        // Nilai invoice mengikuti aturan yang sama dengan unit
        const nilai = mstNilaiDb(u.invoice_value);
        if (nilai == null) g.tanpaNilai++;
        else if (parsial) g.nilaiParsial += nilai;
        else g.nilai += nilai;
        g.isi.push({ baris: b, realisasi: u, pib: p, lain: parsial ? pibs.filter((x) => x !== p) : [] });
      });
    }),
  );
  return [...peta.values()]
    .map((g) => {
      const jadwal = mstJadwalUntukAju(g.aju);
      return Object.assign(g, {
        unit: mstBulat(g.unit),
        unitParsial: mstBulat(g.unitParsial),
        nilai: mstUang(g.nilai),
        nilaiParsial: mstUang(g.nilaiParsial),
        jadwal: jadwal.length === 1 ? jadwal[0] : null,
        // Satu PIB, satu tanggal: catatan yang tanggalnya berbeda-beda (atau sebagian kosong) ditandai
        tanggalBeda: g.semuaTanggal.size > 1 || (g.semuaTanggal.size === 1 && g.tanpaTanggal > 0),
      });
    })
    .sort(
      (a, b) =>
        String(b.tanggal || "").localeCompare(String(a.tanggal || "")) ||
        a.kunci.localeCompare(b.kunci, undefined, { numeric: true }),
    );
}

/* ---------- potongan tampilan ---------- */

/* Kuota sebagai TANDA: satu tanda per unit, yang masih tersedia lebih
   dulu (rata kiri, supaya antarbaris bisa dibandingkan dari garis yang
   sama), lalu yang sudah terpakai. Kuota besar atau berpecahan memakai
   batang berbanding.

   Hiasan bagi pembaca layar (aria-hidden): angkanya selalu tertulis di
   sebelahnya. */
function mstTallyHtml(sisa, terpakai) {
  const total = mstBulat(sisa + terpakai);
  if (Number.isInteger(sisa) && Number.isInteger(terpakai) && sisa >= 0 && terpakai >= 0 && total > 0 && total <= MST_TALLY_MAKS) {
    return `<span class="mst-tally" aria-hidden="true">${'<i class="mst-t mst-t--ada"></i>'.repeat(sisa)}${'<i class="mst-t"></i>'.repeat(terpakai)}</span>`;
  }
  const persen = total > 0 ? Math.max(0, Math.min(100, (sisa / total) * 100)) : 0;
  return `<span class="mst-meter" aria-hidden="true"><span class="mst-meter-isi" style="width:${persen.toFixed(1)}%"></span></span>`;
}

/* Kalimat status nilai sebuah baris (kosong kalau tidak ada yang perlu dicek). */
function mstKetNilai(b) {
  switch (b.statusNilai) {
    case "lebih":
      return tt(
        `Nilai invoice melebihi nilai masterlist sebesar ${mstFmtUang(-b.nilaiSisa)}.`,
        `The invoice value exceeds the masterlist value by ${mstFmtUang(-b.nilaiSisa)}.`,
      );
    case "selisih":
      return tt(
        `Unit sudah habis, tapi nilai invoicenya masih kurang ${mstFmtUang(b.nilaiSisa)} dari nilai masterlist.`,
        `All units are used, but the invoice value is still ${mstFmtUang(b.nilaiSisa)} short of the masterlist value.`,
      );
    case "belum":
      return tt(
        `${mstFmt(b.tanpaNilai)} realisasi belum dicatat nilainya — sisa nilai belum pasti.`,
        `${mstFmt(b.tanpaNilai)} ${b.tanpaNilai === 1 ? "realization has" : "realizations have"} no value yet — the remaining value is not final.`,
      );
    default:
      return "";
  }
}

const MST_IKON_NILAI = { lebih: "bi-exclamation-octagon-fill", selisih: "bi-exclamation-triangle-fill", belum: "bi-hourglass-split" };

/* Sisa nilai sebuah baris: angka + penanda statusnya (ikon + kalimat untuk
   pembaca layar; bukan warna saja). Kosong kalau nilai masterlist belum diisi. */
function mstNilaiSisaHtml(b) {
  if (b.nilaiKuota == null) return "";
  const ket = mstKetNilai(b);
  const ikon = MST_IKON_NILAI[b.statusNilai];
  const angka = b.statusNilai === "lebih" ? tt(`lebih ${mstFmtUang(-b.nilaiSisa)}`, `${mstFmtUang(-b.nilaiSisa)} over`) : mstFmtUang(b.nilaiSisa);
  return ` <span class="mst-nilai mst-nilai--${b.statusNilai}"${ket ? ` title="${escapeAttr(ket)}"` : ""}>${
    ikon ? `<i class="bi ${ikon}" aria-hidden="true"></i>` : ""
  }${escapeHtml(angka)}${ket ? `<span class="visually-hidden"> — ${escapeHtml(ket)}</span>` : ""}</span>`;
}

/* Baris kedua sel Kuota / Terpakai: nilainya dalam USD. */
const mstNilaiHtml = (n) => ` <span class="mst-nilai">${escapeHtml(mstFmtUang(n))}</span>`;

/* Cip nomor aju. Kalau tepat satu jadwal import yang cocok, cipnya jadi
   tombol yang membuka jadwal itu. Tanggal PIB-nya (kalau ada) ikut di
   keterangan cip. */
function mstAjuCipHtml(ref, tanggal) {
  const tgl = tanggal ? " · " + fmtDate(tanggal) : "";
  return mstPecahAju(ref)
    .map((bagian) => {
      const jadwal = mstJadwalUntukAju(bagian);
      if (jadwal.length !== 1) return `<span class="mst-aju" title="${escapeAttr(bagian + tgl)}">${escapeHtml(mstAjuRingkas(bagian))}</span>`;
      const s = jadwal[0];
      const ket = tt("Buka jadwal", "Open schedule") + ": " + s.noAju + tgl + " · " + dispVal(s.party);
      return `<button type="button" class="mst-aju mst-aju--taut" data-mst-jadwal="${escapeAttr(s.id)}" title="${escapeAttr(ket)}">${escapeHtml(mstAjuRingkas(bagian))}<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></button>`;
    })
    .join("");
}

/* PIB yang memakai sebuah baris, tanpa kembar (satu PIB bisa tercatat
   di beberapa realisasi baris yang sama), urut tanggal. */
function mstPibBaris(b) {
  const peta = new Map();
  b.realisasi.forEach((u) =>
    mstPibs(u).forEach((p) => {
      const ada = peta.get(p.aju);
      if (!ada) peta.set(p.aju, { aju: p.aju, tanggal: p.tanggal });
      else if (!ada.tanggal && p.tanggal) ada.tanggal = p.tanggal;
    }),
  );
  return mstUrutPib([...peta.values()]);
}

/* Masa berlaku dokumen: null kalau tanggalnya belum diisi. Status
   memakai warna status + ikon + kalimat -- tidak pernah warna saja. */
function mstMasa(dok) {
  if (!dok || !dok.valid_until) return null;
  const hari = daysFromToday(dok.valid_until);
  if (hari == null) return null;
  if (hari < 0)
    return {
      hari,
      kelas: "mst-masa--lewat",
      ikon: "bi-x-octagon-fill",
      teks: tt(`Berakhir ${mstFmt(-hari)} hari lalu`, `Expired ${mstFmt(-hari)} ${hari === -1 ? "day" : "days"} ago`),
    };
  if (hari === 0) return { hari, kelas: "mst-masa--dekat", ikon: "bi-exclamation-triangle-fill", teks: tt("Berakhir hari ini", "Expires today") };
  if (hari <= MST_MASA_DEKAT)
    return {
      hari,
      kelas: "mst-masa--dekat",
      ikon: "bi-exclamation-triangle-fill",
      teks: tt(`Berakhir dalam ${mstFmt(hari)} hari`, `Expires in ${mstFmt(hari)} ${hari === 1 ? "day" : "days"}`),
    };
  return { hari, kelas: "", ikon: "bi-check-circle-fill", teks: tt(`Berlaku ${mstFmt(hari)} hari lagi`, `Valid for ${mstFmt(hari)} more days`) };
}

const mstKosongHtml = (ikon, teks) => `<div class="panel-empty"><i class="bi ${ikon}"></i> ${teks}</div>`;

/* ---------- kepala halaman ---------- */

function mstGambarPapan(ring) {
  const judul = $("#mstJudul");
  const sub = $("#mstSub");
  if (!judul || !sub) return;
  const masa = mstMasa(mstDok);
  const unit = (n) => tt("unit", n === 1 ? "unit" : "units");

  if (!ring.baris) {
    judul.textContent = "Masterlist";
    sub.textContent = tt("Belum ada baris barang.", "No lines yet.");
    return;
  }
  if (masa && masa.hari < 0) {
    judul.textContent = tt("Masa berlaku masterlist sudah berakhir", "The masterlist has expired");
  } else if (ring.sisa > 0) {
    judul.textContent = tt(
      `${mstFmt(ring.sisa)} unit kuota masterlist masih tersedia`,
      `${mstFmt(ring.sisa)} masterlist quota ${unit(ring.sisa)} still available`,
    );
  } else {
    judul.textContent = tt("Seluruh kuota masterlist sudah terealisasi", "All masterlist quota has been realized");
  }

  const b = (n) => `<b>${escapeHtml(mstFmt(n))}</b>`;
  const bagian = [
    tt(`${b(ring.terpakai)} dari ${b(ring.kuota)} unit terealisasi`, `${b(ring.terpakai)} of ${b(ring.kuota)} units realized`),
    tt(`${b(ring.bersisa)} dari ${b(ring.baris)} baris masih bersisa`, `${b(ring.bersisa)} of ${b(ring.baris)} lines still have quota`),
  ];
  // Nilai (USD) -- hanya dari baris yang nilai masterlist-nya sudah diisi
  if (ring.nilaiBaris) {
    const u = (n) => `<b>${escapeHtml(mstFmtUang(n))}</b>`;
    bagian.push(tt(`nilai ${u(ring.nilaiTerpakai)} dari ${u(ring.nilaiKuota)} terealisasi`, `value ${u(ring.nilaiTerpakai)} of ${u(ring.nilaiKuota)} realized`));
  }
  if (masa) {
    bagian.push(
      masa.hari < 0 || masa.hari > MST_MASA_DEKAT
        ? tt(`berlaku sampai ${escapeHtml(fmtDate(mstDok.valid_until))}`, `valid until ${escapeHtml(fmtDate(mstDok.valid_until))}`)
        : escapeHtml(masa.teks.charAt(0).toLowerCase() + masa.teks.slice(1)),
    );
  }
  sub.innerHTML = bagian.join(" · ");
}

/* ---------- panel: kuota yang masih tersedia ---------- */

function mstGambarTersedia(baris) {
  const box = $("#mstTersedia");
  if (!box) return;
  if (!baris.length) {
    box.innerHTML = mstKosongHtml("bi-card-checklist", tt("Belum ada baris masterlist.", "No masterlist lines yet."));
    return;
  }
  const jenis = mstPerJenis(baris);
  const bersisa = jenis.filter((g) => g.sisa > 0);
  const habis = jenis.length - bersisa.length;
  if (!bersisa.length) {
    box.innerHTML = mstKosongHtml(
      "bi-check2-all",
      tt("Seluruh kuota sudah terealisasi — tidak ada yang tersisa.", "All quota has been realized — nothing is left."),
    );
    return;
  }

  const tampil = mstKeadaan.semuaJenis ? bersisa : bersisa.slice(0, MST_JENIS_AWAL);
  const aktif = mstKeadaan.jenis;
  const barisHtml = tampil
    .map((g) => {
      const dipilih = !!aktif && aktif.nama === g.nama && aktif.lini === g.lini;
      const ket = [
        g.lini,
        tt(`${mstFmt(g.baris)} baris`, `${mstFmt(g.baris)} ${g.baris === 1 ? "line" : "lines"}`),
        g.nilaiSisa != null ? tt(`sisa ${mstFmtUang(g.nilaiSisa)}`, `${mstFmtUang(g.nilaiSisa)} left`) : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<button type="button" class="mst-jenis${dipilih ? " is-aktif" : ""}" aria-pressed="${dipilih}"
          data-mst-jenis="${escapeAttr(g.nama)}" data-mst-jenis-lini="${escapeAttr(g.lini)}"
          title="${escapeAttr(dipilih ? tt("Lepas saringan jenis ini", "Clear this filter") : tt("Tampilkan baris jenis ini di daftar", "Show this type's lines in the list"))}">
          <span class="mst-jenis-nama"><b>${escapeHtml(g.nama)}</b><small>${escapeHtml(ket)}</small></span>
          ${mstTallyHtml(g.sisa, g.terpakai)}
          <span class="mst-jenis-angka"><b>${escapeHtml(mstFmt(g.sisa))}</b> ${escapeHtml(tt("dari", "of"))} ${escapeHtml(mstFmt(g.kuota))}<span class="visually-hidden"> ${escapeHtml(tt("unit tersedia", "units available"))}</span></span>
        </button>`;
    })
    .join("");

  const lagi = bersisa.length - tampil.length;
  const kaki = [];
  if (lagi > 0 || (mstKeadaan.semuaJenis && bersisa.length > MST_JENIS_AWAL)) {
    kaki.push(
      `<button type="button" class="mst-taut" data-mst-semua-jenis>${escapeHtml(
        mstKeadaan.semuaJenis
          ? tt("Tampilkan lebih sedikit", "Show fewer")
          : tt(`Tampilkan ${mstFmt(lagi)} jenis lainnya`, `Show ${mstFmt(lagi)} more ${lagi === 1 ? "type" : "types"}`),
      )}</button>`,
    );
  }
  if (habis > 0) {
    kaki.push(
      `<span>${escapeHtml(
        tt(`${mstFmt(habis)} jenis mesin lain sudah habis terealisasi.`, `${mstFmt(habis)} other machine ${habis === 1 ? "type is" : "types are"} fully realized.`),
      )} <button type="button" class="mst-taut" data-mst-lihat-status="habis">${escapeHtml(tt("Lihat di daftar", "See in the list"))}</button></span>`,
    );
  }
  box.innerHTML = `<div class="mst-jenis-daftar">${barisHtml}</div>${kaki.length ? `<div class="mst-jenis-kaki">${kaki.join("")}</div>` : ""}`;
}

/* ---------- panel: dokumen masterlist ---------- */

function mstGambarDokumen() {
  const box = $("#mstDokumen");
  if (!box) return;
  // Tanpa dokumen tidak ada yang bisa diubah: tombolnya ikut disembunyikan
  const ubah = $("#btnMstDokumen");
  if (ubah) ubah.hidden = !mstDok;
  if (!mstDok) {
    box.innerHTML = mstKosongHtml("bi-file-earmark-text", tt("Belum ada dokumen masterlist.", "No masterlist document yet."));
    return;
  }
  const masa = mstMasa(mstDok);
  const isi = (label, nilai, tambahan) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${nilai ? escapeHtml(nilai) : `<span class="mst-redup">—</span>`}${tambahan || ""}</dd></div>`;
  box.innerHTML = `
    <dl class="mst-dok">
      ${isi(tt("Nama", "Name"), mstDok.name)}
      ${isi(tt("No. SK", "Decree No."), mstDok.sk_no)}
      ${isi(tt("Tanggal SK", "Decree date"), mstDok.sk_date ? fmtDate(mstDok.sk_date) : "")}
      ${isi(
        tt("Berlaku sampai", "Valid until"),
        mstDok.valid_until ? fmtDate(mstDok.valid_until) : "",
        masa ? `<span class="mst-masa ${masa.kelas}"><i class="bi ${masa.ikon}" aria-hidden="true"></i> ${escapeHtml(masa.teks)}</span>` : "",
      )}
    </dl>
    ${
      mstDok.valid_until
        ? ""
        : `<p class="mst-dok-ket"><i class="bi bi-info-circle" aria-hidden="true"></i> ${escapeHtml(
            tt(
              "Masa berlaku belum diisi. Isi tanggalnya supaya pengingat masa berlaku muncul di sini.",
              "The validity date is not filled in yet. Add it to see the expiry reminder here.",
            ),
          )}</p>`
    }
    ${mstDok.notes ? `<p class="mst-dok-catatan">${escapeHtml(mstDok.notes).replace(/\n/g, "<br>")}</p>` : ""}`;
}

/* ---------- panel: belum dicatat ---------- */

function mstGambarBelumDicatat() {
  const box = $("#mstPerlu");
  const note = $("#mstPerluNote");
  if (!box) return;
  const daftar = mstBelumDicatat();
  if (note) note.textContent = daftar.length ? tt(`${mstFmt(daftar.length)} jadwal`, `${mstFmt(daftar.length)} ${daftar.length === 1 ? "schedule" : "schedules"}`) : "";
  if (!daftar.length) {
    box.innerHTML = `<div class="mst-perlu-kosong">
        <p><i class="bi bi-check2-circle" aria-hidden="true"></i> ${escapeHtml(
          tt("Tidak ada jadwal import berfasilitas Masterlist yang belum dicatat.", "No import schedule with the Masterlist facility is waiting to be recorded."),
        )}</p>
        <p class="mst-redup">${escapeHtml(
          tt(
            "Jadwal import yang barangnya ditandai fasilitas Masterlist akan muncul di sini sampai nomor ajunya dicatat sebagai realisasi.",
            "Import schedules whose items are tagged with the Masterlist facility appear here until their aju number is recorded as a realization.",
          ),
        )}</p>
      </div>`;
    return;
  }
  const boleh = canEdit();
  box.innerHTML = daftar
    .map((s) => {
      const barang = mstBarangMasterlist(s);
      const rincian = [
        s.noAju ? "Aju " + mstAjuRingkas(s.noAju) : tt("No. aju belum diisi", "Aju number not filled in"),
        dispVal(s.invoice),
        tt(`${mstFmt(barang.length)} barang`, `${mstFmt(barang.length)} ${barang.length === 1 ? "item" : "items"}`),
      ];
      return `<button type="button" class="task task--doc" data-mst-catat-jadwal="${escapeAttr(s.id)}"
          title="${escapeAttr(boleh ? tt("Catat realisasinya", "Record its realization") : tt("Buka jadwalnya", "Open the schedule"))}">
          <span class="task-main">
            <span class="task-party">${escapeHtml(dispVal(s.party))}</span>
            <span class="task-detail">${escapeHtml(rincian.join(" · "))}</span>
            <span class="task-goods">${escapeHtml(barang.map((it) => itemDisplayName(it)).filter(Boolean).join(", "))}</span>
          </span>
          <i class="bi ${boleh ? "bi-journal-plus" : "bi-chevron-right"} task-go" aria-hidden="true"></i>
        </button>`;
    })
    .join("");
}

/* ---------- daftar: per baris ---------- */

/* Satu realisasi di rincian baris = satu <tbody>, satu baris tabel per
   PIB: tanggal & nomor aju berpasangan di baris yang sama. Jumlah,
   catatan & tombolnya milik realisasi (bukan per PIB), jadi selnya
   setinggi seluruh PIB-nya. */
function mstRincianRealisasiHtml(u) {
  const pibs = mstPibs(u);
  const isi = pibs.length ? pibs : [{ aju: String(u.aju_ref || ""), tanggal: null }];
  const tinggi = isi.length > 1 ? ` rowspan="${isi.length}"` : "";
  const parsial =
    isi.length > 1
      ? `<span class="mst-parsial" title="${escapeAttr(
          tt(
            `Dikirim bertahap lewat ${isi.length} PIB; kuotanya dihitung sekali.`,
            `Shipped in stages under ${isi.length} PIBs; the quota is counted once.`,
          ),
        )}">${escapeHtml(tt(`${isi.length} PIB · parsial`, `${isi.length} PIBs · partial`))}</span>`
      : "";
  const id = escapeAttr(u.id);
  const milikRealisasi = `
    <td class="mst-kol-angka"${tinggi}>${escapeHtml(mstFmt(u.qty))} ${parsial}</td>
    <td class="mst-kol-angka"${tinggi}>${mstNilaiDb(u.invoice_value) != null ? escapeHtml(mstAngkaUang(u.invoice_value)) : `<span class="mst-redup">—</span>`}</td>
    <td class="mst-rinci-catatan"${tinggi}>${u.notes ? escapeHtml(u.notes) : `<span class="mst-redup">—</span>`}</td>
    <td class="mst-ubah"${tinggi}><div class="hscode-actions">
      <button type="button" class="mst-pib-tambah" data-mst-tambah-pib="${id}" title="${escapeAttr(
        tt("Tambah PIB kiriman berikutnya ke realisasi ini", "Add the next shipment's PIB to this realization"),
      )}"><i class="bi bi-plus-lg" aria-hidden="true"></i> PIB</button>
      <button type="button" class="icon-btn" data-mst-ubah-realisasi="${id}" title="${escapeAttr(tt("Ubah realisasi", "Edit realization"))}"><i class="bi bi-pencil"></i></button>
      <button type="button" class="icon-btn danger" data-mst-hapus-realisasi="${id}" title="${escapeAttr(tt("Hapus realisasi", "Delete realization"))}"><i class="bi bi-trash3"></i></button>
    </div></td>`;
  return `<tbody class="${isi.length > 1 ? "mst-rinci-parsial" : ""}">${isi
    .map(
      (p, i) => `<tr>
        <td class="mst-mono">${p.tanggal ? escapeHtml(fmtDate(p.tanggal)) : `<span class="mst-redup">—</span>`}</td>
        <td class="mst-rinci-aju"><span class="mst-mono">${escapeHtml(p.aju)}</span></td>${i === 0 ? milikRealisasi : ""}
      </tr>`,
    )
    .join("")}</tbody>`;
}

/* Nilai (USD) baris yang dibuka: nilai masterlist, harga satuannya,
   terpakai & sisa, lalu kalimat statusnya kalau ada yang perlu dicek. */
function mstRincianNilaiHtml(b) {
  const label = `<span class="mst-rinci-label">${escapeHtml(tt(`Nilai (${MST_MATA_UANG})`, `Value (${MST_MATA_UANG})`))}</span>`;
  if (b.nilaiKuota == null) {
    const kalimat = [tt("Nilai masterlist baris ini belum diisi.", "This line's masterlist value is not filled in yet.")];
    if (b.nilaiTerpakai > 0) kalimat.push(tt(`Nilai invoice tercatat ${mstFmtUang(b.nilaiTerpakai)}.`, `Recorded invoice value: ${mstFmtUang(b.nilaiTerpakai)}.`));
    if (canEdit()) kalimat.push(tt("Isi lewat Ubah baris supaya sisa nilainya terlacak.", "Fill it in with Edit line to track the remaining value."));
    return `<div class="mst-rinci-nilai">${label}<p class="mst-redup mst-nilai-kosong">${escapeHtml(kalimat.join(" "))}</p></div>`;
  }
  const isi = (dt, dd, kelas) => `<div><dt>${escapeHtml(dt)}</dt><dd${kelas ? ` class="${kelas}"` : ""}>${escapeHtml(dd)}</dd></div>`;
  const lebih = b.statusNilai === "lebih";
  const ket = mstKetNilai(b);
  return `<div class="mst-rinci-nilai">${label}
      <dl class="mst-nilai-ring">
        ${isi(tt("Masterlist", "Masterlist"), mstAngkaUang(b.nilaiKuota))}
        ${isi(tt("Harga satuan", "Unit price"), mstAngkaUang(b.hargaSatuan))}
        ${isi(tt("Terpakai", "Used"), mstAngkaUang(b.nilaiTerpakai))}
        ${isi(tt("Sisa", "Remaining"), lebih ? tt(`lebih ${mstAngkaUang(-b.nilaiSisa)}`, `${mstAngkaUang(-b.nilaiSisa)} over`) : mstAngkaUang(b.nilaiSisa), lebih ? "mst-nilai--lebih" : "")}
      </dl>
      ${ket ? `<p class="mst-nilai-ket mst-nilai-ket--${b.statusNilai}"><i class="bi ${MST_IKON_NILAI[b.statusNilai]}" aria-hidden="true"></i>${escapeHtml(ket)}</p>` : ""}
    </div>`;
}

function mstRincianBarisHtml(b) {
  const boleh = canEdit();
  const realisasi = b.realisasi.length
    ? `<table class="mst-rinci-tabel">
        <thead><tr>
          <th>${escapeHtml(tt("Tanggal PIB", "PIB date"))}</th>
          <th>${escapeHtml(tt("Nomor aju", "Aju number"))}</th>
          <th class="mst-kol-angka">${escapeHtml(tt("Jumlah", "Quantity"))}</th>
          <th class="mst-kol-angka">${escapeHtml(tt(`Nilai (${MST_MATA_UANG})`, `Value (${MST_MATA_UANG})`))}</th>
          <th>${escapeHtml(tt("Catatan", "Notes"))}</th>
          <th class="mst-ubah"></th>
        </tr></thead>
        ${b.realisasi.map(mstRincianRealisasiHtml).join("")}
      </table>`
    : `<p class="mst-redup mst-rinci-kosong">${escapeHtml(tt("Belum ada realisasi untuk baris ini.", "No realization recorded for this line yet."))}</p>`;

  // HS Code lalu spesifikasi -- urutan kolom unduhan Excel
  return `<div class="mst-rinci">
      <div class="mst-rinci-kepala">
        <div class="mst-rinci-hs">
          <span class="mst-rinci-label">HS Code</span>
          <p class="mst-mono">${b.hsCode ? escapeHtml(b.hsCode) : `<span class="mst-redup">—</span>`}</p>
        </div>
        <div class="mst-rinci-spek">
          <span class="mst-rinci-label">${escapeHtml(tt("Spesifikasi", "Specification"))}</span>
          <p>${escapeHtml(b.spesifikasi || "—")}</p>
        </div>
      </div>
      ${mstRincianNilaiHtml(b)}
      <div class="mst-rinci-realisasi">
        <span class="mst-rinci-label">${escapeHtml(tt("Realisasi", "Realizations"))}</span>
        ${realisasi}
      </div>
      ${
        boleh
          ? `<div class="mst-rinci-aksi mst-ubah">
          ${
            b.sisa > 0
              ? `<button type="button" class="btn-teal" data-mst-catat="${escapeAttr(b.id)}"><i class="bi bi-journal-plus"></i> ${escapeHtml(tt("Catat realisasi", "Record realization"))}</button>`
              : ""
          }
          <button type="button" class="btn btn-form-cancel mst-tombol" data-mst-ubah-baris="${escapeAttr(b.id)}"><i class="bi bi-pencil"></i> ${escapeHtml(tt("Ubah baris", "Edit line"))}</button>
          <button type="button" class="btn btn-form-cancel mst-tombol mst-tombol--hapus" data-mst-hapus-baris="${escapeAttr(b.id)}"><i class="bi bi-trash3"></i> ${escapeHtml(tt("Hapus baris", "Delete line"))}</button>
        </div>`
          : ""
      }
    </div>`;
}

function mstTabelBarisHtml(baris) {
  const L = {
    barang: tt("Barang", "Item"),
    lini: tt("Lini proses", "Process line"),
    kuota: tt("Kuota", "Quota"),
    terpakai: tt("Terpakai", "Used"),
    sisa: tt("Sisa", "Remaining"),
    aju: "PIB aju",
  };
  return `<div class="mst-tabel-wrap">
      <table class="mst-tabel mst-tabel--baris">
        <thead><tr>
          <th class="mst-kol-no">No.</th>
          <th class="mst-kol-barang">${escapeHtml(L.barang)}</th>
          <th class="mst-kol-lini">${escapeHtml(L.lini)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.kuota)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.terpakai)}</th>
          <th class="mst-kol-sisa">${escapeHtml(L.sisa)}</th>
          <th class="mst-kol-aju">${escapeHtml(L.aju)}</th>
          <th class="mst-kol-aksi"></th>
        </tr></thead>
        <tbody>${baris
          .map((b) => {
            const buka = mstKeadaan.terbuka.has("b:" + b.id);
            const rujukan = mstPibBaris(b);
            return `<tr class="mst-baris${buka ? " is-terbuka" : ""}${b.sisa > 0 ? "" : " is-habis"}" data-mst-id="${escapeAttr(b.id)}">
            <td class="mst-kol-no">${escapeHtml(b.no)}</td>
            <td class="mst-kol-barang" data-no="${escapeAttr(b.no)}">
              <span class="mst-nama">${escapeHtml(b.nama)}</span>
              <span class="mst-spek">${escapeHtml(mstSpekRingkas(b.spek))}</span>
            </td>
            <td class="mst-kol-lini" data-label="${escapeAttr(L.lini)}">${b.lini ? escapeHtml(b.lini) : `<span class="mst-redup">—</span>`}</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.kuota)}">${escapeHtml(mstFmt(b.kuota))} <span class="mst-satuan">${escapeHtml(b.satuan)}</span>${
              b.nilaiKuota != null ? mstNilaiHtml(b.nilaiKuota) : ""
            }</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.terpakai)}">${escapeHtml(mstFmt(b.terpakai))}${
              b.nilaiKuota != null || b.nilaiTerpakai > 0 ? mstNilaiHtml(b.nilaiTerpakai) : ""
            }</td>
            <td class="mst-kol-sisa" data-label="${escapeAttr(L.sisa)}">${mstTallyHtml(b.sisa, b.terpakai)}<b>${escapeHtml(mstFmt(b.sisa))}</b>${mstNilaiSisaHtml(b)}</td>
            <td class="mst-kol-aju" data-label="${escapeAttr(L.aju)}">${rujukan.length ? rujukan.map((p) => mstAjuCipHtml(p.aju, p.tanggal)).join("") : `<span class="mst-redup">—</span>`}</td>
            <td class="mst-kol-aksi"><div class="hscode-actions">
              ${
                b.sisa > 0
                  ? `<button type="button" class="icon-btn mst-ubah" data-mst-catat="${escapeAttr(b.id)}" title="${escapeAttr(tt("Catat realisasi baris ini", "Record a realization for this line"))}"><i class="bi bi-journal-plus"></i></button>`
                  : ""
              }
              <button type="button" class="icon-btn mst-buka" data-mst-buka="b:${escapeAttr(b.id)}" aria-expanded="${buka}"
                title="${escapeAttr(buka ? tt("Tutup rincian", "Hide details") : tt("Spesifikasi & realisasi", "Specification & realizations"))}"><i class="bi ${buka ? "bi-chevron-up" : "bi-chevron-down"}"></i></button>
            </div></td>
          </tr>${buka ? `<tr class="mst-baris-rinci"><td colspan="8">${mstRincianBarisHtml(b)}</td></tr>` : ""}`;
          })
          .join("")}</tbody>
      </table>
    </div>`;
}

/* ---------- daftar: per PIB ---------- */

function mstTabelPibHtml(kelompok) {
  const L = { tanggal: tt("Tanggal PIB", "PIB date"), jadwal: tt("Jadwal", "Schedule"), baris: tt("Baris", "Lines"), unit: "Unit", nilai: tt(`Nilai (${MST_MATA_UANG})`, `Value (${MST_MATA_UANG})`) };
  return `<div class="mst-tabel-wrap">
      <table class="mst-tabel mst-tabel--pib">
        <thead><tr>
          <th class="mst-kol-pib">PIB aju</th>
          <th class="mst-kol-tgl">${escapeHtml(L.tanggal)}</th>
          <th class="mst-kol-jadwal">${escapeHtml(L.jadwal)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.baris)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.unit)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.nilai)}</th>
          <th class="mst-kol-aksi"></th>
        </tr></thead>
        <tbody>${kelompok
          .map((g) => {
            const buka = mstKeadaan.terbuka.has("p:" + g.kunci);
            const jadwal = g.jadwal
              ? `<button type="button" class="mst-taut" data-mst-jadwal="${escapeAttr(g.jadwal.id)}">${escapeHtml(dispVal(g.jadwal.party))}</button><span class="mst-spek">${escapeHtml(dispVal(g.jadwal.invoice))}</span>`
              : `<span class="mst-redup">—</span>`;
            const isi = buka
              ? `<tr class="mst-baris-rinci"><td colspan="7"><div class="mst-rinci">
                  <table class="mst-rinci-tabel">
                    <thead><tr>
                      <th>No.</th><th>${escapeHtml(tt("Barang", "Item"))}</th><th class="mst-kol-angka">${escapeHtml(tt("Jumlah", "Quantity"))}</th><th class="mst-kol-angka">${escapeHtml(L.nilai)}</th><th>${escapeHtml(tt("Catatan", "Notes"))}</th>
                    </tr></thead>
                    <tbody>${g.isi
                      .slice()
                      .sort((a, b) => a.baris.no - b.baris.no)
                      .map(
                        (x) => `<tr>
                        <td class="mst-mono">${escapeHtml(x.baris.no)}</td>
                        <td><span class="mst-nama">${escapeHtml(x.baris.nama)}</span><span class="mst-spek">${escapeHtml(mstSpekRingkas(x.baris.spek))}</span>${
                          x.lain.length
                            ? `<span class="mst-parsial">${escapeHtml(
                                tt("Parsial, juga di PIB", "Partial, also under PIB") +
                                  " " +
                                  x.lain.map((p) => mstAjuRingkas(p.aju) + (p.tanggal ? " (" + fmtDate(p.tanggal) + ")" : "")).join(", "),
                              )}</span>`
                            : ""
                        }</td>
                        <td class="mst-kol-angka">${escapeHtml(mstFmt(x.realisasi.qty))} <span class="mst-satuan">${escapeHtml(x.baris.satuan)}</span></td>
                        <td class="mst-kol-angka">${
                          mstNilaiDb(x.realisasi.invoice_value) != null ? escapeHtml(mstAngkaUang(x.realisasi.invoice_value)) : `<span class="mst-redup">—</span>`
                        }</td>
                        <td>${x.realisasi.notes ? escapeHtml(x.realisasi.notes) : `<span class="mst-redup">—</span>`}</td>
                      </tr>`,
                      )
                      .join("")}</tbody>
                  </table>
                </div></td></tr>`
              : "";
            const beda = g.tanggalBeda
              ? `<i class="bi bi-exclamation-triangle-fill mst-tgl-beda" role="img" aria-label="${escapeAttr(tt("Tanggal belum seragam", "Dates not uniform"))}" title="${escapeAttr(
                  tt(
                    `Tanggal PIB ini belum sama di semua catatannya (${[...g.semuaTanggal].sort().map(fmtDate).join(", ")}${g.tanpaTanggal ? `; ${mstFmt(g.tanpaTanggal)} belum bertanggal` : ""}). Samakan lewat Atur tanggal.`,
                    `This PIB's date differs between its records (${[...g.semuaTanggal].sort().map(fmtDate).join(", ")}${g.tanpaTanggal ? `; ${mstFmt(g.tanpaTanggal)} undated` : ""}). Align them with Set date.`,
                  ),
                )}"></i>`
              : "";
            const unit =
              (g.unit || !g.unitParsial ? escapeHtml(mstFmt(g.unit)) + " " : "") +
              (g.unitParsial
                ? `<span class="mst-parsial" title="${escapeAttr(
                    tt(
                      `${mstFmt(g.unitParsial)} unit dikirim bertahap bersama PIB lain; di kuota dihitung sekali.`,
                      `${mstFmt(g.unitParsial)} ${g.unitParsial === 1 ? "unit" : "units"} shipped in stages with another PIB; counted once against the quota.`,
                    ),
                  )}">${escapeHtml((g.unit ? "+" : "") + tt(`${mstFmt(g.unitParsial)} parsial`, `${mstFmt(g.unitParsial)} partial`))}</span>`
                : "");
            /* Nilai invoice PIB ini: aturannya sama dengan unit -- nilai realisasi
               parsial milik gabungan PIB-nya, jadi ditulis terpisah. */
            const adaNilai = g.nilai > 0 || g.nilaiParsial > 0 || g.tanpaNilai < g.isi.length;
            const nilai = adaNilai
              ? (g.nilai || !g.nilaiParsial ? escapeHtml(mstAngkaUang(g.nilai)) + " " : "") +
                (g.nilaiParsial
                  ? `<span class="mst-parsial">${escapeHtml((g.nilai ? "+" : "") + tt(`${mstAngkaUang(g.nilaiParsial)} parsial`, `${mstAngkaUang(g.nilaiParsial)} partial`))}</span>`
                  : "") +
                (g.tanpaNilai
                  ? `<span class="mst-spek">${escapeHtml(tt(`${mstFmt(g.tanpaNilai)} baris belum bernilai`, `${mstFmt(g.tanpaNilai)} ${g.tanpaNilai === 1 ? "line" : "lines"} without value`))}</span>`
                  : "")
              : `<span class="mst-redup">—</span>`;
            return `<tr class="mst-baris${buka ? " is-terbuka" : ""}">
            <td class="mst-kol-pib"><span class="mst-nama mst-mono" title="${escapeAttr(g.aju)}">${escapeHtml(g.jadwal ? g.jadwal.noAju : g.aju)}</span></td>
            <td class="mst-kol-tgl mst-mono" data-label="${escapeAttr(L.tanggal)}">${g.tanggal ? escapeHtml(fmtDate(g.tanggal)) : `<span class="mst-redup">—</span>`}${beda}</td>
            <td class="mst-kol-jadwal" data-label="${escapeAttr(L.jadwal)}">${jadwal}</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.baris)}">${escapeHtml(mstFmt(g.isi.length))}</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.unit)}">${unit}</td>
            <td class="mst-kol-angka mst-kol-nilai" data-label="${escapeAttr(L.nilai)}">${nilai}</td>
            <td class="mst-kol-aksi"><div class="hscode-actions">
              <button type="button" class="icon-btn mst-ubah" data-mst-tanggal-pib="${escapeAttr(g.kunci)}" title="${escapeAttr(
                tt("Atur tanggal PIB ini di semua catatannya", "Set this PIB's date on all its records"),
              )}"><i class="bi bi-calendar-event"></i></button>
              <button type="button" class="icon-btn mst-buka" data-mst-buka="p:${escapeAttr(g.kunci)}" aria-expanded="${buka}"
                title="${escapeAttr(buka ? tt("Tutup rincian", "Hide details") : tt("Baris yang direalisasikan", "Lines realized"))}"><i class="bi ${buka ? "bi-chevron-up" : "bi-chevron-down"}"></i></button>
            </div></td>
          </tr>${isi}`;
          })
          .join("")}</tbody>
      </table>
    </div>`;
}

/* ---------- daftar + paginasi ---------- */

function mstGambarSaringan(baris) {
  // Pilihan lini proses dirakit dari datanya; nilai yang sedang dipilih dipertahankan
  const pilih = $("#mstLini");
  if (pilih) {
    const kini = pilih.value;
    const lini = [...new Set(baris.map((b) => b.lini).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    pilih.innerHTML =
      `<option value="">${escapeHtml(tt("Semua lini proses", "All process lines"))}</option>` +
      lini.map((l) => `<option value="${escapeAttr(l)}">${escapeHtml(l)}</option>`).join("");
    pilih.value = lini.indexOf(kini) >= 0 ? kini : "";
    pilih.classList.toggle("d-none", lini.length < 2);
  }
  const cip = $("#mstJenisAktif");
  if (cip) {
    const j = mstKeadaan.jenis;
    cip.classList.toggle("d-none", !j);
    cip.innerHTML = j
      ? `<span>${escapeHtml(tt("Jenis", "Type"))}: <b>${escapeHtml(j.nama)}</b></span><button type="button" data-mst-lepas-jenis aria-label="${escapeAttr(tt("Lepas saringan jenis", "Clear the type filter"))}" title="${escapeAttr(tt("Lepas saringan jenis", "Clear the type filter"))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>`
      : "";
  }
  document.querySelectorAll("[data-mst-tampilan]").forEach((el) => {
    const aktif = el.dataset.mstTampilan === mstKeadaan.tampilan;
    el.classList.toggle("active", aktif);
    el.setAttribute("aria-pressed", String(aktif));
  });
}

function mstGambarDaftar(baris) {
  const box = $("#mstDaftar");
  if (!box) return;
  if (!baris.length) {
    box.innerHTML = mstKosongHtml(
      "bi-card-checklist",
      tt("Belum ada baris. Tambahkan lewat tombol Tambah baris di atas.", "No lines yet. Add one with the Add line button above."),
    );
    mstGambarPaginasi(0);
    return;
  }
  const lolos = baris.filter((b) => mstCocok(b, mstSaringan()));
  const perPib = mstKeadaan.tampilan === "pib";
  const semua = perPib ? mstPerPib(lolos) : lolos;
  if (!semua.length) {
    box.innerHTML = mstKosongHtml(
      "bi-search",
      perPib && lolos.length
        ? tt("Baris yang cocok belum punya realisasi.", "The matching lines have no realization yet.")
        : tt("Tidak ada baris yang cocok.", "No matching lines."),
    );
    mstGambarPaginasi(0);
    return;
  }
  const totalHalaman = Math.max(1, Math.ceil(semua.length / mstKeadaan.perHalaman));
  mstKeadaan.halaman = Math.min(Math.max(1, mstKeadaan.halaman), totalHalaman);
  const mulai = (mstKeadaan.halaman - 1) * mstKeadaan.perHalaman;
  const potong = semua.slice(mulai, mulai + mstKeadaan.perHalaman);
  box.innerHTML = perPib ? mstTabelPibHtml(potong) : mstTabelBarisHtml(potong);
  mstGambarPaginasi(semua.length);
}

/* Paginasi bentuk yang sama dengan HS Code & Jadwal Kapal. */
function mstGambarPaginasi(total) {
  const bar = $("#mstPagination");
  if (!bar) return;
  if (!total) {
    bar.className = "hs-halaman";
    bar.innerHTML = "";
    return;
  }
  const halaman = mstKeadaan.halaman;
  const per = mstKeadaan.perHalaman;
  const totalHalaman = Math.max(1, Math.ceil(total / per));
  const awal = (halaman - 1) * per + 1;
  const akhir = Math.min(halaman * per, total);
  const perPib = mstKeadaan.tampilan === "pib";
  const tombol = paginationRange(halaman, totalHalaman)
    .map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn ${p === halaman ? "active" : ""}" data-mstpage="${p}">${p}</button>`,
    )
    .join("");
  const rentang = `<b>${awal}–${akhir}</b>`;
  const jumlah = `<b>${mstFmt(total)}</b>`;
  bar.className = "pagination-bar hs-halaman";
  bar.innerHTML = `
    <div class="pagination-info">${
      perPib
        ? tt(`Menampilkan ${rentang} dari ${jumlah} PIB`, `Showing ${rentang} of ${jumlah} ${total === 1 ? "PIB" : "PIBs"}`)
        : tt(`Menampilkan ${rentang} dari ${jumlah} baris`, `Showing ${rentang} of ${jumlah} ${total === 1 ? "line" : "lines"}`)
    }</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" data-mstnav="prev" ${halaman <= 1 ? "disabled" : ""} aria-label="${escapeAttr(tt("Halaman sebelumnya", "Previous page"))}"><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${tombol}</div>
      <button type="button" class="page-nav" data-mstnav="next" ${halaman >= totalHalaman ? "disabled" : ""} aria-label="${escapeAttr(tt("Halaman berikutnya", "Next page"))}"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="mstPageSize">${escapeHtml(tt("Per halaman", "Per page"))}</label>
      <select id="mstPageSize">
        ${MST_UKURAN_HALAMAN.map((n) => `<option value="${n}" ${n === per ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </div>`;
}

function renderMasterlist() {
  if (!$("#viewMasterlist")) return;
  const baris = mstSusun();
  mstGambarPapan(mstRingkasan(baris));
  mstGambarTersedia(baris);
  mstGambarDokumen();
  mstGambarBelumDicatat();
  mstGambarSaringan(baris);
  mstGambarDaftar(baris);
}

/* ---------- memuat ---------- */

async function mstAmbil() {
  const { data: dok, error: e1 } = await supabaseClient
    .from("masterlists")
    .select("id, name, sk_no, sk_date, valid_until, notes, created_at")
    .order("created_at", { ascending: true });
  if (e1) throw e1;
  mstDok = (dok || [])[0] || null;
  if (!mstDok) {
    mstBarisDb = [];
    mstRealisasiDb = [];
    return;
  }
  /* Kolom dari migrasi lanjutan (daftar PIB, nilai USD, HS Code)
     diperiksa ulang tiap memuat: begitu migrasinya dijalankan, muat ulang
     sudah cukup. */
  mstKolomBelumAda.clear();
  mstBarisDb = await mstBacaKolom("masterlist_items", "id, list_id, no, description, specification, uom, quota, created_at", ["value_quota", "hs_code"], (q) =>
    q.eq("list_id", mstDok.id).order("no", { ascending: true }),
  );
  const realisasi = await mstBacaKolom("masterlist_usages", "id, item_id, qty, aju_ref, pib_date, notes, created_at", ["pibs", "invoice_value"], (q) =>
    q.order("created_at", { ascending: true }),
  );
  const milik = new Set(mstBarisDb.map((b) => b.id));
  mstRealisasiDb = realisasi.filter((u) => milik.has(u.item_id));
}

/* Pemuatan pertama mengosongkan panel; pemuatan ulang MENAHAN tampilan
   yang ada (sedikit diredupkan) sampai data baru tiba -- daftar yang
   sebenarnya masih benar tidak perlu berkedip jadi "Memuat…". */
async function loadMasterlist() {
  const halaman = $("#viewMasterlist");
  if (!mstTermuat) {
    ["#mstTersedia", "#mstDaftar"].forEach((sel) => {
      const el = $(sel);
      if (el) el.innerHTML = mstKosongHtml("bi-hourglass", tt("Memuat masterlist…", "Loading the masterlist…"));
    });
  } else if (halaman) {
    halaman.classList.add("is-memuat");
  }
  try {
    await mstAmbil();
    mstTermuat = true;
  } catch (e) {
    console.error(e);
    if (halaman) halaman.classList.remove("is-memuat");
    if (!mstTermuat) {
      const pesan = mstKosongHtml(
        "bi-exclamation-triangle",
        tt(
          "Gagal memuat masterlist. Pastikan migration-masterlist.sql sudah dijalankan.",
          "Failed to load the masterlist. Make sure migration-masterlist.sql has been run.",
        ),
      );
      ["#mstTersedia", "#mstDaftar"].forEach((sel) => {
        const el = $(sel);
        if (el) el.innerHTML = pesan;
      });
      const sub = $("#mstSub");
      if (sub) sub.textContent = tt("Data tidak bisa dimuat.", "The data could not be loaded.");
    } else {
      showToast(tt("Gagal memuat ulang masterlist.", "Failed to reload the masterlist."), "danger");
    }
    return false;
  }
  if (halaman) halaman.classList.remove("is-memuat");
  renderMasterlist();
  return true;
}

function showMasterlistView() {
  showPage("masterlist");
  window.scrollTo(0, 0);
  // Sudah pernah dimuat: tampil seketika dengan data yang ada, lalu disegarkan
  if (mstTermuat) renderMasterlist();
  loadMasterlist();
}

/* Pesan dari database untuk penolakan yang memang bisa terjadi: dua
   orang mencatat bersamaan (kuota terlampaui), nomor baris kembar. */
function mstPesanGalat(error, cadangan) {
  const pesan = String((error && error.message) || "");
  if (/melebihi kuota|lebih kecil dari yang sudah terpakai|harus punya nomor aju PIB|Tanggal PIB harus berbentuk|migration-masterlist-(pib-parsial|nilai|hs-code)/i.test(pesan)) return pesan;
  if (/masterlist_items_no_unik|duplicate key/i.test(pesan)) return tt("Nomor baris itu sudah dipakai.", "That line number is already in use.");
  return cadangan;
}

/* ---------- catat / ubah realisasi ---------- */

const mstModalEl = $("#mstRealisasiModal");
const mstModal = mstModalEl ? new bootstrap.Modal(mstModalEl) : null;
/* Isian kotak yang sedang terbuka:
     mode   "baru" | "ubah" (mengubah SATU realisasi: id, asal = jumlah lamanya)
     pib    [{ aju, tanggal, otomatis }] -- PIB realisasi ini. otomatis =
            tanggalnya diisikan dari catatan lain PIB yang sama, bukan diketik
     baris  [{ itemId, qty, lanjutId }] -- lanjutId: realisasi yang sudah ada
            yang mendapat PIB kotak ini (kiriman lanjutan); tanpa jumlah */
let mstForm = null;
let mstMenyimpan = false;

/* Paling banyak yang boleh dicatat untuk sebuah baris: sisanya -- dan
   saat MENGUBAH sebuah realisasi, jumlah lamanya ikut dikembalikan. */
function mstBatas(b) {
  const tambahan = mstForm && mstForm.mode === "ubah" && mstForm.baris[0] && mstForm.baris[0].itemId === b.id ? mstForm.asal : 0;
  return mstBulat(b.sisa + tambahan);
}

function mstLabelBaris(b) {
  const spek = b.spek.mentah || [b.spek.merek].concat(b.spek.rincian).filter(Boolean).join(" ");
  return `${b.no} · ${b.nama}${spek ? " · " + spek : ""} · ${tt("sisa", "left")} ${mstFmt(mstBatas(b))}`;
}

/* "7130 (12-05-2025) + 9204" */
function mstRingkasPib(pibs) {
  return pibs.map((p) => mstAjuRingkas(p.aju) + (p.tanggal ? ` (${fmtDate(p.tanggal)})` : "")).join(" + ");
}

function mstLabelLanjutan(b, u) {
  return `${b.no} · ${b.nama} · ${mstFmt(u.qty)} ${b.satuan} · PIB ${mstRingkasPib(mstPibs(u))}`;
}

/* ---- PIB di kotak: nomor aju | tanggal | hapus, keterangannya di bawah ---- */

/* Digambar ulang hanya saat PIB ditambah / dihapus. Saat mengetik cukup
   keterangan & tanggalnya yang diperbarui, supaya fokus kotak tidak hilang. */
function mstGambarPib() {
  const wadah = $("#mstPib");
  if (!wadah || !mstForm) return;
  const banyak = mstForm.pib.length > 1;
  const daftar = $("#mstPibDaftar");
  if (daftar) daftar.classList.toggle("is-banyak", banyak);
  wadah.innerHTML = mstForm.pib
    .map(
      (p, i) => `<div class="mst-pib" data-mst-pib="${i}">
        <input type="text" class="login-input" data-mst-pib-aju list="mstAjuList" autocomplete="off" maxlength="80"
               value="${escapeAttr(p.aju)}" placeholder="${escapeAttr(tt("Nomor aju, atau 4 angka terakhirnya", "Aju number, or its last 4 digits"))}"
               aria-label="${escapeAttr(banyak ? tt(`Nomor aju PIB ${i + 1}`, `PIB ${i + 1} aju number`) : tt("Nomor aju PIB", "PIB aju number"))}" />
        <input type="date" class="login-input" data-mst-pib-tgl value="${escapeAttr(p.tanggal || "")}"
               aria-label="${escapeAttr(banyak ? tt(`Tanggal PIB ${i + 1}`, `PIB ${i + 1} date`) : tt("Tanggal PIB", "PIB date"))}" />
        ${
          banyak
            ? `<button type="button" class="rm-row" data-mst-pib-hapus title="${escapeAttr(tt("Hapus PIB ini", "Remove this PIB"))}" aria-label="${escapeAttr(
                tt(`Hapus PIB ${i + 1}`, `Remove PIB ${i + 1}`),
              )}"><i class="bi bi-x-lg"></i></button>`
            : ""
        }
        <div class="prompt-hint mst-pib-ket" data-mst-pib-ket></div>
      </div>`,
    )
    .join("");
  mstForm.pib.forEach((_, i) => mstGambarKetPib(i));
  mstAturTombolPib();
}

/* PIB berikutnya baru bisa ditambah kalau yang ada sudah bernomor aju. */
function mstAturTombolPib() {
  const tambah = $("#btnMstPibTambah");
  if (tambah && mstForm) tambah.disabled = mstForm.pib.some((p) => !String(p.aju || "").trim());
}

/* Isi kotak-kotak PIB -> mstForm.pib. Tanggal yang diubah tangan bukan
   lagi isian otomatis. */
function mstBacaPib() {
  if (!mstForm) return;
  document.querySelectorAll("#mstPib [data-mst-pib]").forEach((el) => {
    const p = mstForm.pib[Number(el.dataset.mstPib)];
    if (!p) return;
    p.aju = el.querySelector("[data-mst-pib-aju]").value;
    const tgl = el.querySelector("[data-mst-pib-tgl]").value;
    if (tgl !== (p.tanggal || "")) p.otomatis = false;
    p.tanggal = tgl;
  });
}

/* Tanggal PIB dari nomor ajunya (tanggalDariAju, helpers.js). Yang
   diketik hanya ekornya ("4172"): nomor lengkapnya dari jadwal yang
   cocok. */
function mstTanggalDariAju(ref) {
  const langsung = tanggalDariAju(ref);
  if (langsung) return langsung;
  const jadwal = mstJadwalUntukAju(ref);
  return jadwal.length === 1 ? tanggalDariAju(jadwal[0].noAju) : "";
}

/* SATU PIB, SATU TANGGAL. Nomor aju yang sudah tercatat di realisasi lain
   dengan satu tanggal: tanggal itu diisikan, kalau kotaknya kosong atau
   isinya hasil isian otomatis sebelumnya. PIB yang belum pernah
   tercatat: tanggal di nomor ajunya. Nomor ajunya berganti ke PIB tanpa
   keduanya: tanggal ikutan yang lama dilepas lagi. Tetap bisa diubah
   sendiri di kotaknya. */
function mstSelaraskanTanggal(i) {
  const p = mstForm && mstForm.pib[i];
  const kotak = document.querySelector(`#mstPib [data-mst-pib="${i}"] [data-mst-pib-tgl]`);
  if (!p) return;
  const bagian = mstPecahAju(p.aju);
  const info = bagian.length === 1 ? mstTanggalTercatat(mstKunciAju(bagian[0]), mstForm.id) : { tanggal: [] };
  const dariAju = bagian.length === 1 && !info.tanggal.length ? mstTanggalDariAju(bagian[0]) : "";
  const ikut = info.tanggal.length === 1 ? info.tanggal[0] : dariAju;
  if (ikut && (!p.tanggal || p.otomatis)) {
    p.tanggal = ikut;
    p.otomatis = true;
  } else if (p.otomatis && !ikut) {
    p.tanggal = "";
    p.otomatis = false;
  }
  if (kotak) kotak.value = p.tanggal || "";
}

/* Keterangan di bawah satu PIB: jadwal yang cocok, apakah PIB itu sudah
   punya catatan (mencegah dicatat dua kali), dan tanggal yang tercatat. */
function mstGambarKetPib(i) {
  const p = mstForm && mstForm.pib[i];
  const ket = document.querySelector(`#mstPib [data-mst-pib="${i}"] [data-mst-pib-ket]`);
  if (!p || !ket) return;
  const bagian = mstPecahAju(p.aju);
  const pesan = [];
  let awas = false;
  if (bagian.length > 1) {
    pesan.push(tt("Satu kotak untuk satu nomor aju — PIB berikutnya ditambahkan lewat Tambah PIB.", "One box per aju number — add the next PIB with Add PIB."));
    awas = true;
  } else if (bagian.length === 1) {
    const jadwal = mstJadwalUntukAju(bagian[0]);
    if (jadwal.length === 1) pesan.push(tt("Jadwal", "Schedule") + ": " + dispVal(jadwal[0].party) + " · " + dispVal(jadwal[0].invoice));
    const info = mstTanggalTercatat(mstKunciAju(bagian[0]), mstForm.id);
    if (info.catatan)
      pesan.push(
        tt(
          `PIB ini sudah punya ${mstFmt(info.catatan)} baris realisasi tercatat.`,
          `This PIB already has ${mstFmt(info.catatan)} realization ${info.catatan === 1 ? "line" : "lines"} recorded.`,
        ),
      );
    if (info.tanggal.length === 1 && p.otomatis) {
      pesan.push(tt(`Tanggalnya mengikuti catatan itu (${fmtDate(info.tanggal[0])}).`, `Its date follows those records (${fmtDate(info.tanggal[0])}).`));
    } else if (!info.tanggal.length && p.otomatis && p.tanggal) {
      pesan.push(tt(`Tanggal dari nomor aju (${fmtDate(p.tanggal)}) — ubah kalau berbeda.`, `Date from the aju number (${fmtDate(p.tanggal)}) — change it if it differs.`));
    } else if (info.tanggal.length === 1 && p.tanggal && p.tanggal !== info.tanggal[0]) {
      pesan.push(tt(`Catatan lain PIB ini bertanggal ${fmtDate(info.tanggal[0])}.`, `Other records of this PIB are dated ${fmtDate(info.tanggal[0])}.`));
      awas = true;
    } else if (info.tanggal.length > 1) {
      const daftar = info.tanggal.map(fmtDate).join(", ");
      pesan.push(tt(`Catatan lain PIB ini memakai beberapa tanggal: ${daftar}.`, `Other records of this PIB use several dates: ${daftar}.`));
      awas = true;
    }
  }
  // Peringatan: ikon + kalimat (warna peringatan hanya di ikonnya; teksnya tetap terbaca)
  ket.innerHTML = (awas ? '<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>' : "") + escapeHtml(pesan.join(" "));
  ket.classList.toggle("is-awas", awas);
}

/* ---- baris masterlist yang direalisasikan ---- */

/* Batas nilai sebuah baris: sisa nilainya -- dan saat MENGUBAH sebuah
   realisasi, nilai lamanya ikut dikembalikan. null = nilai masterlist
   belum diisi (tidak ada batas yang bisa dibandingkan). */
function mstBatasNilai(b) {
  if (b.nilaiKuota == null) return null;
  const tambahan = mstForm && mstForm.mode === "ubah" && mstForm.baris[0] && mstForm.baris[0].itemId === b.id ? mstForm.asalNilai || 0 : 0;
  return mstUang(b.nilaiSisa + tambahan);
}

/* NILAI INVOICE OTOMATIS: jumlah x harga satuan masterlist, begitu
   jumlahnya diisi. null kalau tidak bisa dihitung (nilai masterlist
   belum diisi, jumlah kosong). Realisasi yang menghabiskan seluruh sisa
   unit mengambil sisa nilainya kalau bedanya cuma pembulatan sen --
   1000 / 3 unit = 333.33 x 3 tidak boleh menyisakan 0.01 yang lalu
   ditandai "selisih". */
function mstNilaiOtomatis(x, b) {
  // Sebelum migrasi nilai: nilai yang terisi justru membuat simpannya tertolak (mstPeriksaNilai)
  if (!b || b.hargaSatuan == null || x.lanjutId || !mstAdaKolom("invoice_value")) return null;
  const qty = mstBacaJumlah(x.qty);
  if (!(qty > 0)) return null;
  const taksiran = mstUang(qty * b.hargaSatuan);
  const sisaNilai = mstBatasNilai(b);
  if (qty === mstBatas(b) && sisaNilai != null && sisaNilai >= 0 && Math.abs(sisaNilai - taksiran) < 0.01 * Math.max(1, qty)) return sisaNilai;
  return taksiran;
}

/* Kotak nilai yang masih OTOMATIS (belum diketik sendiri, atau
   dikosongkan lagi) mengikuti jumlahnya -- aturan yang sama dengan BM /
   PPN / PPH di form jadwal: kosong = otomatis, diisi = manual. */
function mstIsiNilaiOtomatis(i) {
  const x = mstForm && mstForm.baris[i];
  if (!x || !x.nilaiOtomatis) return;
  // Kiriman lanjutan / baris tanpa nilai masterlist: nilai otomatis sebelumnya tidak berlaku lagi
  const b = x.lanjutId ? null : mstSusun().find((r) => r.id === x.itemId);
  const nilai = b ? mstNilaiOtomatis(x, b) : null;
  x.nilai = nilai == null ? "" : formatNumberTyping(String(nilai));
  const kotak = document.querySelector(`#mstPilih [data-mst-pilih="${i}"] [data-mst-pilih-nilai]`);
  if (kotak) kotak.value = x.nilai;
}

function mstGambarPilih() {
  const wadah = $("#mstPilih");
  if (!wadah || !mstForm) return;
  const semua = mstSusun();
  const ubah = mstForm.mode === "ubah";
  const dipilih = new Set(mstForm.baris.map((x) => x.itemId).filter(Boolean));
  const disambung = new Set(mstForm.baris.map((x) => x.lanjutId).filter(Boolean));
  /* KIRIMAN LANJUTAN: PIB kotak ini DITAMBAHKAN ke realisasi yang sudah
     ada -- mesin yang sebagian sudah tiba lewat PIB sebelumnya. Kuotanya
     tidak berkurang lagi, jadi baris yang kuotanya habis pun bisa. */
  const sambungan = ubah ? [] : semua.flatMap((b) => b.realisasi.map((u) => ({ b, u })));
  const banyak = !ubah && mstForm.baris.length > 1;
  const daftar = $("#mstPilihDaftar");
  if (daftar) daftar.classList.toggle("is-banyak", banyak);
  wadah.innerHTML = mstForm.baris
    .map((x, i) => {
      const lanjut = x.lanjutId ? sambungan.find((s) => s.u.id === x.lanjutId) : null;
      const opsiBaru = semua
        .filter((r) => r.id === x.itemId || (mstBatas(r) > 0 && !dipilih.has(r.id)))
        .map((r) => `<option value="${escapeAttr(r.id)}" ${!lanjut && r.id === x.itemId ? "selected" : ""}>${escapeHtml(mstLabelBaris(r))}</option>`)
        .join("");
      const opsiLanjut = sambungan
        .filter((s) => s.u.id === x.lanjutId || !disambung.has(s.u.id))
        .map((s) => `<option value="r:${escapeAttr(s.u.id)}" ${s.u.id === x.lanjutId ? "selected" : ""}>${escapeHtml(mstLabelLanjutan(s.b, s.u))}</option>`)
        .join("");
      const opsi = opsiLanjut
        ? (opsiBaru ? `<optgroup label="${escapeAttr(tt("Realisasi baru — memakai kuota", "New realization — uses quota"))}">${opsiBaru}</optgroup>` : "") +
          `<optgroup label="${escapeAttr(tt("Kiriman lanjutan — tambahkan PIB ke realisasi yang ada (jumlah tetap)", "Follow-up shipment — add the PIB to an existing realization (quantity unchanged)"))}">${opsiLanjut}</optgroup>`
        : opsiBaru;
      return `<div class="mst-pilih${lanjut ? " is-lanjutan" : ""}" data-mst-pilih="${i}">
          <select class="login-input mst-pilih-baris" data-mst-pilih-baris ${ubah ? "disabled" : ""}
                  aria-label="${escapeAttr(tt("Baris masterlist", "Masterlist line"))}">
            <option value="">${escapeHtml(tt("— pilih baris —", "— choose a line —"))}</option>
            ${opsi}
          </select>
          <input type="text" class="login-input mst-pilih-qty" data-mst-pilih-qty data-num inputmode="decimal" autocomplete="off"
                 value="${escapeAttr(formatNumberTyping(String(lanjut ? mstBulat(lanjut.u.qty) : x.qty)))}" ${lanjut ? "disabled" : ""}
                 aria-label="${escapeAttr(tt("Jumlah", "Quantity"))}" placeholder="${escapeAttr(tt("Jumlah", "Qty"))}" />
          <input type="text" class="login-input mst-pilih-nilai" data-mst-pilih-nilai data-num inputmode="decimal" autocomplete="off"
                 value="${escapeAttr(x.nilai || "")}"
                 aria-label="${escapeAttr(
                   lanjut
                     ? tt(`Tambahan nilai invoice (${MST_MATA_UANG})`, `Added invoice value (${MST_MATA_UANG})`)
                     : tt(`Nilai invoice (${MST_MATA_UANG})`, `Invoice value (${MST_MATA_UANG})`),
                 )}" />
          ${
            banyak
              ? `<button type="button" class="rm-row" data-mst-pilih-hapus title="${escapeAttr(tt("Hapus baris ini", "Remove this line"))}" aria-label="${escapeAttr(tt("Hapus baris ini", "Remove this line"))}"><i class="bi bi-x-lg"></i></button>`
              : ""
          }
          <div class="prompt-hint mst-pilih-ket"></div>
        </div>`;
    })
    .join("");
  mstForm.baris.forEach((_, i) => mstGambarKetPilih(i));
  // Tidak ada lagi yang bisa dipilih -> tidak ada yang bisa ditambahkan
  const tambah = $("#btnMstPilihTambah");
  if (tambah) {
    const tersisa = semua.some((r) => mstBatas(r) > 0 && !dipilih.has(r.id)) || sambungan.some((s) => !disambung.has(s.u.id));
    tambah.classList.toggle("d-none", ubah);
    tambah.disabled = !tersisa || mstForm.baris.some((x) => !x.itemId && !x.lanjutId);
  }
}

/* Keterangan di bawah satu baris pilihan: sisa kuota & sisa nilainya, lalu
   peringatan nilai -- melebihi sisa nilai, atau beda dari harga masterlist.
   Peringatan TIDAK menghalangi simpan: invoice bisa memang berbeda, dan
   catatannya harus menyimpan kenyataan (bedanya terlihat di daftar).
   Diperbarui saat jumlah / nilai diketik, tanpa menggambar ulang barisnya. */
function mstGambarKetPilih(i) {
  const x = mstForm && mstForm.baris[i];
  const el = document.querySelector(`#mstPilih [data-mst-pilih="${i}"] .mst-pilih-ket`);
  const kotakNilai = document.querySelector(`#mstPilih [data-mst-pilih="${i}"] [data-mst-pilih-nilai]`);
  if (!x || !el) return;
  const semua = mstSusun();
  const nilai = mstBacaNilai(x.nilai);
  const pesan = [];
  const awas = [];
  let taruh = tt("Nilai invoice", "Invoice value");
  if (x.lanjutId) {
    const u = mstRealisasiDb.find((r) => r.id === x.lanjutId);
    const b = u && semua.find((r) => r.id === u.item_id);
    if (b) {
      pesan.push(
        tt(
          `Kiriman lanjutan: PIB di atas ditambahkan ke realisasi ini (sekarang PIB ${mstRingkasPib(mstPibs(u))}). Kuotanya tidak berkurang lagi.`,
          `Follow-up shipment: the PIB above is added to this realization (now PIB ${mstRingkasPib(mstPibs(u))}). No more quota is used.`,
        ),
      );
      /* Kiriman lanjutan TIDAK menambah jumlah. Baris yang masih bersisa:
         kiriman ini mungkin justru membawa unit baru (2 unit lalu 3 unit)
         -- itu realisasi baru dengan jumlahnya sendiri, bukan lanjutan. */
      if (b.sisa > 0)
        pesan.push(
          tt(
            `Kiriman ini membawa unit tambahan? Pilih baris ${b.no} di Realisasi baru dan isi jumlahnya (sisa ${mstFmt(b.sisa)} ${b.satuan}).`,
            `Does this shipment bring more units? Choose line ${b.no} under New realization and enter its quantity (${mstFmt(b.sisa)} ${b.satuan} left).`,
          ),
        );
      const nilaiLama = mstNilaiDb(u.invoice_value);
      if (nilaiLama != null || b.nilaiKuota != null)
        pesan.push(
          nilaiLama != null
            ? tt(`Nilai invoice PIB ini ditambahkan ke nilai realisasinya (sekarang ${mstFmtUang(nilaiLama)}).`, `This PIB's invoice value is added to the realization's value (now ${mstFmtUang(nilaiLama)}).`)
            : tt("Isi nilai invoice PIB ini supaya sisa nilainya ikut terlacak.", "Enter this PIB's invoice value so the remaining value stays tracked."),
        );
      if (nilai > 0 && b.nilaiKuota != null && nilai > b.nilaiSisa + MST_TOLERANSI_NILAI)
        awas.push(tt(`Melebihi sisa nilai masterlist (${mstFmtUang(b.nilaiSisa)}).`, `More than the remaining masterlist value (${mstFmtUang(b.nilaiSisa)}).`));
      taruh = tt("Tambahan nilai", "Added value");
    }
  } else {
    const b = semua.find((r) => r.id === x.itemId);
    if (b) {
      const batasNilai = mstBatasNilai(b);
      pesan.push(
        [tt(`Sisa kuota ${mstFmt(mstBatas(b))} ${b.satuan}`, `Quota left: ${mstFmt(mstBatas(b))} ${b.satuan}`)]
          .concat(batasNilai != null ? [tt(`sisa nilai ${mstFmtUang(batasNilai)}`, `value left: ${mstFmtUang(batasNilai)}`)] : [])
          .join(" · "),
      );
      // Patokan: jumlah x harga satuan masterlist (mstNilaiOtomatis -- yang juga mengisi kotaknya)
      const qty = mstBacaJumlah(x.qty);
      const taksiran = mstNilaiOtomatis(x, b);
      if (taksiran != null) taruh = "≈ " + mstAngkaUang(taksiran);
      if (x.nilaiOtomatis && taksiran != null && nilai === taksiran)
        pesan.push(
          tt(
            `Nilai invoice dihitung otomatis: ${mstFmt(qty)} × ${mstFmtUang(b.hargaSatuan)} — ketik sendiri kalau invoicenya berbeda.`,
            `Invoice value calculated automatically: ${mstFmt(qty)} × ${mstFmtUang(b.hargaSatuan)} — type your own if the invoice differs.`,
          ),
        );
      if (nilai != null && !Number.isNaN(nilai)) {
        if (batasNilai != null && nilai > batasNilai + MST_TOLERANSI_NILAI)
          awas.push(tt(`Melebihi sisa nilai masterlist (${mstFmtUang(batasNilai)}).`, `More than the remaining masterlist value (${mstFmtUang(batasNilai)}).`));
        else if (taksiran != null && Math.abs(nilai - taksiran) > MST_TOLERANSI_NILAI)
          awas.push(
            tt(
              `Beda dari harga masterlist: ${mstFmt(qty)} × ${mstFmtUang(b.hargaSatuan)} = ${mstFmtUang(taksiran)}.`,
              `Differs from the masterlist price: ${mstFmt(qty)} × ${mstFmtUang(b.hargaSatuan)} = ${mstFmtUang(taksiran)}.`,
            ),
          );
      }
    }
  }
  if (kotakNilai) kotakNilai.placeholder = taruh;
  el.innerHTML =
    escapeHtml(pesan.join(" ")) +
    awas.map((a) => ` <span class="mst-pilih-awas"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>${escapeHtml(a)}</span>`).join("");
}

/* opsi: { itemId } baris yang langsung dipilih; { aju, ket } isian awal
   (dari panel Belum dicatat); { realisasi } untuk MENGUBAH satu catatan,
   dengan { tambahPib: true } langsung bersama satu PIB kosong untuk
   kiriman berikutnya. */
function mstBukaRealisasi(opsi) {
  if (!requireEdit() || !mstModal) return;
  const o = opsi || {};
  const u = o.realisasi || null;
  /* Tanpa baris sama sekali tidak ada yang bisa dicatat -- lebih jelas
     dikatakan langsung daripada membuka kotak dengan pilihan kosong.
     Kuota yang sudah habis semua TIDAK menghalangi: kiriman lanjutan
     (PIB berikutnya untuk realisasi yang ada) tidak memakai kuota. */
  if (!u && !mstBarisDb.length) {
    showToast(tt("Belum ada baris masterlist untuk dicatat.", "There are no masterlist lines to record yet."), "danger");
    return;
  }
  const pibKosong = () => ({ aju: "", tanggal: "", otomatis: false });
  const pib = u ? mstPibs(u).map((p) => ({ aju: p.aju, tanggal: p.tanggal || "", otomatis: false })) : [Object.assign(pibKosong(), { aju: o.aju || "" })];
  if (!pib.length || (u && o.tambahPib)) pib.push(pibKosong());
  mstForm = u
    ? {
        mode: "ubah",
        id: u.id,
        asal: Number(u.qty) || 0,
        asalNilai: mstNilaiDb(u.invoice_value) || 0,
        pib,
        /* Nilai yang sudah tercatat tetap milik pengguna; catatan yang
           belum bernilai baru dihitung begitu jumlahnya diubah. */
        baris: [{ itemId: u.item_id, qty: String(mstBulat(u.qty)), lanjutId: "", nilai: mstTeksNilai(u.invoice_value), nilaiOtomatis: mstNilaiDb(u.invoice_value) == null }],
      }
    : { mode: "baru", id: null, asal: 0, asalNilai: 0, pib, baris: [{ itemId: o.itemId || "", qty: o.itemId ? "1" : "", lanjutId: "", nilai: "", nilaiOtomatis: true }] };

  const habis = !u && !mstSusun().some((b) => b.sisa > 0);
  $("#mstRealisasiJudul").textContent = u
    ? o.tambahPib
      ? tt("Tambah PIB kiriman berikutnya", "Add the next shipment's PIB")
      : tt("Ubah realisasi", "Edit realization")
    : tt("Catat realisasi", "Record realization");
  $("#mstRealisasiKet").textContent =
    o.ket ||
    (habis
      ? tt(
          "Seluruh kuota sudah terealisasi — yang masih bisa dicatat hanya kiriman lanjutan: PIB berikutnya untuk realisasi yang sudah ada.",
          "All quota has been realized — only follow-up shipments can still be recorded: the next PIB of an existing realization.",
        )
      : "");
  $("#mstCatatan").value = u ? u.notes || "" : "";
  $("#mstRealisasiGalat").classList.add("d-none");
  $("#mstAjuList").innerHTML = ((typeof data !== "undefined" && data && data.import) || [])
    .filter((s) => String(s.noAju || "").trim())
    .map((s) => `<option value="${escapeAttr(s.noAju)}">${escapeHtml(dispVal(s.party))}</option>`)
    .join("");
  // Baris yang langsung dipilih: jumlah awalnya 1, atau sisanya kalau kurang dari itu -- nilainya langsung terhitung
  if (!u && o.itemId) {
    const b = mstSusun().find((r) => r.id === o.itemId);
    if (b) mstForm.baris[0].qty = String(Math.min(1, mstBatas(b)));
    mstIsiNilaiOtomatis(0);
  }
  mstGambarPib();
  mstForm.pib.forEach((_, i) => {
    mstSelaraskanTanggal(i);
    mstGambarKetPib(i);
  });
  mstGambarPilih();
  if (mstModalEl.classList.contains("show")) mstFokusAwal();
  mstModal.show();
}

/* Fokus pertama: kotak PIB yang masih kosong, atau pilihan baris. Dipasang
   sesudah kotaknya SELESAI tampil (shown.bs.modal, lihat penangan di bawah):
   Bootstrap memindahkan fokus ke kotak itu sendiri di akhir animasinya,
   jadi fokus yang dipasang lebih awal tertimpa. */
function mstFokusAwal() {
  if (!mstForm) return;
  const kosong = [...document.querySelectorAll("#mstPib [data-mst-pib-aju]")].find((el) => !el.value);
  const fokus = kosong || $("#mstPilih select:not(:disabled), #mstPilih input:not(:disabled)");
  if (fokus) fokus.focus();
}

/* Isi kotak pilihan -> mstForm.baris, sebelum digambar ulang atau
   disimpan. Pilihan "r:<id>" = kiriman lanjutan ke realisasi itu. */
function mstBacaPilih() {
  if (!mstForm) return;
  document.querySelectorAll("#mstPilih [data-mst-pilih]").forEach((el) => {
    const x = mstForm.baris[Number(el.dataset.mstPilih)];
    if (!x) return;
    const nilai = el.querySelector("[data-mst-pilih-baris]").value;
    const lanjut = nilai.indexOf("r:") === 0;
    x.itemId = lanjut ? "" : nilai;
    x.lanjutId = lanjut ? nilai.slice(2) : "";
    // Kotak jumlah kiriman lanjutan hanya menampilkan jumlah realisasinya
    if (!lanjut) x.qty = el.querySelector("[data-mst-pilih-qty]").value;
    x.nilai = el.querySelector("[data-mst-pilih-nilai]").value;
  });
}

/* Nilai invoice sebuah baris pilihan: { nilai } (null = kosong) atau { galat }. */
function mstPeriksaNilai(x, b) {
  const nilai = mstBacaNilai(x.nilai);
  if (Number.isNaN(nilai)) return { galat: tt(`Nilai invoice untuk baris ${b.no} bukan angka.`, `The invoice value for line ${b.no} is not a number.`) };
  if (nilai != null && mstUang(nilai) !== nilai)
    return { galat: tt(`Nilai invoice untuk baris ${b.no} paling banyak dua angka di belakang koma.`, `The invoice value for line ${b.no} can have at most two decimals.`) };
  if (nilai != null && !mstAdaKolom("invoice_value")) return { galat: mstPesanMigrasi("invoice_value") };
  return { nilai };
}

/* Memeriksa isian. Mengembalikan { galat } atau
   { pib: [{ aju, tanggal }] (urut tanggal), catatan, baris } yang siap
   disimpan; baris = [{ itemId, qty, no, nilai }] atau [{ lanjutId, itemId, no, nilai }]
   (nilai = nilai invoice USD, null kalau tidak diisi). */
function mstPeriksaForm() {
  mstBacaPilih();
  mstBacaPib();
  const pib = [];
  for (let i = 0; i < mstForm.pib.length; i++) {
    const p = mstForm.pib[i];
    const aju = String(p.aju || "").replace(/\s+/g, " ").trim();
    const tanggal = p.tanggal || null;
    if (!aju && !tanggal) continue; // kotak PIB tambahan yang dibiarkan kosong
    const ke = mstForm.pib.length > 1 ? " " + (i + 1) : "";
    if (!aju) return { galat: tt(`Nomor aju PIB${ke} harus diisi.`, `The aju number of PIB${ke} is required.`) };
    if (mstPecahAju(aju).length > 1)
      return { galat: tt("Satu kotak untuk satu nomor aju. PIB berikutnya ditambahkan lewat tombol Tambah PIB.", "One box per aju number. Add the next PIB with the Add PIB button.") };
    const kunci = mstKunciAju(aju);
    if (pib.some((x) => x.kunci === kunci)) return { galat: tt(`PIB ${aju} diisi dua kali.`, `PIB ${aju} is entered twice.`) };
    pib.push({ aju, tanggal, kunci });
  }
  if (!pib.length) return { galat: tt("Nomor aju PIB harus diisi.", "The PIB aju number is required.") };
  if (pib.length > 1 && !mstAdaKolom("pibs")) return { galat: mstPesanMigrasiPib() };

  const semua = mstSusun();
  const baris = [];
  for (const x of mstForm.baris) {
    if (x.lanjutId) {
      const u = mstRealisasiDb.find((r) => r.id === x.lanjutId);
      const b = u && semua.find((r) => r.id === u.item_id);
      if (!b) return { galat: tt("Pilih baris masterlist yang direalisasikan.", "Choose the masterlist line being realized.") };
      if (baris.some((y) => y.lanjutId === u.id)) return { galat: tt(`Realisasi baris ${b.no} dipilih dua kali.`, `The line ${b.no} realization is chosen twice.`) };
      const ada = new Set(mstPibs(u).map((p) => mstKunciAju(p.aju)));
      const sudah = pib.find((p) => ada.has(p.kunci));
      if (sudah) return { galat: tt(`PIB ${sudah.aju} sudah ada di realisasi baris ${b.no}.`, `PIB ${sudah.aju} is already in the line ${b.no} realization.`) };
      if (!mstAdaKolom("pibs")) return { galat: mstPesanMigrasiPib() };
      const n = mstPeriksaNilai(x, b);
      if (n.galat) return n;
      baris.push({ lanjutId: u.id, itemId: b.id, no: b.no, nilai: n.nilai });
      continue;
    }
    const b = semua.find((r) => r.id === x.itemId);
    if (!b) return { galat: tt("Pilih baris masterlist yang direalisasikan.", "Choose the masterlist line being realized.") };
    const qty = mstBacaJumlah(x.qty);
    if (!(qty > 0)) return { galat: tt(`Jumlah untuk baris ${b.no} harus lebih dari 0.`, `The quantity for line ${b.no} must be greater than 0.`) };
    if (mstBulat(qty) !== qty)
      return { galat: tt(`Jumlah untuk baris ${b.no} paling banyak tiga angka di belakang koma.`, `The quantity for line ${b.no} can have at most three decimals.`) };
    const batas = mstBatas(b);
    if (qty > batas)
      return {
        galat: tt(
          `Jumlah untuk baris ${b.no} melebihi sisa kuotanya (${mstFmt(batas)} ${b.satuan}).`,
          `The quantity for line ${b.no} exceeds its remaining quota (${mstFmt(batas)} ${b.satuan}).`,
        ),
      };
    if (baris.some((y) => !y.lanjutId && y.itemId === b.id)) return { galat: tt(`Baris ${b.no} dipilih dua kali.`, `Line ${b.no} is chosen twice.`) };
    const n = mstPeriksaNilai(x, b);
    if (n.galat) return n;
    baris.push({ itemId: b.id, qty, no: b.no, nilai: n.nilai });
  }
  return {
    pib: mstUrutPib(pib.map((p) => ({ aju: p.aju, tanggal: p.tanggal }))),
    catatan: $("#mstCatatan").value.trim(),
    baris,
  };
}

async function mstSimpanRealisasi() {
  if (!requireEdit() || !mstForm || mstMenyimpan) return;
  const kotakGalat = $("#mstRealisasiGalat");
  const tampilGalat = (pesan) => {
    kotakGalat.textContent = pesan;
    kotakGalat.classList.remove("d-none");
  };
  const isi = mstPeriksaForm();
  if (isi.galat) return tampilGalat(isi.galat);
  kotakGalat.classList.add("d-none");

  /* Selama menyimpan tombolnya DITANDAI sibuk, bukan dinonaktifkan:
     tombol yang dinonaktifkan kehilangan fokus, dan sesudah simpan yang
     gagal tombol Esc tidak lagi menutup kotaknya (fokusnya sudah di luar
     kotak). Simpan ganda dicegah lewat mstMenyimpan. */
  const tombol = $("#btnMstSimpanRealisasi");
  mstMenyimpan = true;
  tombol.classList.add("is-sibuk");
  const ubah = mstForm.mode === "ubah";
  // Mengubah satu realisasi bukan mencatat yang baru / menyambung yang lain
  const baru = ubah ? [] : isi.baris.filter((x) => !x.lanjutId);
  const lanjut = ubah ? [] : isi.baris.filter((x) => x.lanjutId);
  const ubahRealisasi = (id, ubahan) => mstKirim((m) => supabaseClient.from("masterlist_usages").update(m[0]).eq("id", id), [ubahan]);
  let galat = null; // belum ada yang tersimpan: kotak tetap terbuka dengan pesannya
  const gagalLanjut = []; // sebagian tersimpan, kiriman lanjutan baris-baris ini tidak
  let galatLanjut = null;
  try {
    if (ubah) {
      const h = await ubahRealisasi(mstForm.id, Object.assign({ qty: isi.baris[0].qty, invoice_value: isi.baris[0].nilai, notes: isi.catatan }, mstKolomPib(isi.pib)));
      galat = h.error;
      if (!galat) {
        const u = mstRealisasiDb.find((x) => x.id === mstForm.id);
        if (u) Object.assign(u, h.muatan[0]);
      }
    } else {
      if (baru.length) {
        const h = await mstKirim(
          (m) => supabaseClient.from("masterlist_usages").insert(m).select(),
          baru.map((x) =>
            Object.assign(
              { item_id: x.itemId, qty: x.qty, invoice_value: x.nilai, notes: isi.catatan, created_by: authState.user ? authState.user.id : null },
              mstKolomPib(isi.pib),
            ),
          ),
        );
        galat = h.error;
        if (!galat) (h.data || []).forEach((u) => mstRealisasiDb.push(u));
      }
      // Kiriman lanjutan: PIB-nya ditambahkan ke realisasi yang sudah ada, jumlahnya tetap
      if (!galat) {
        for (const x of lanjut) {
          const u = mstRealisasiDb.find((r) => r.id === x.lanjutId);
          const ubahan = Object.assign({ notes: [u.notes, isi.catatan].filter(Boolean).join(" · ") }, mstKolomPib(mstUrutPib(mstPibs(u).concat(isi.pib))));
          // Nilai invoice PIB ini DITAMBAHKAN ke nilai realisasinya (jumlah unitnya tetap)
          if (x.nilai != null) ubahan.invoice_value = mstUang((mstNilaiDb(u.invoice_value) || 0) + x.nilai);
          const h = await ubahRealisasi(u.id, ubahan);
          if (h.error) {
            gagalLanjut.push(x.no);
            galatLanjut = h.error;
          } else Object.assign(u, h.muatan[0]);
        }
        if (!baru.length && lanjut.length && gagalLanjut.length === lanjut.length) galat = galatLanjut;
      }
    }
  } catch (e) {
    galat = e;
  }
  mstMenyimpan = false;
  tombol.classList.remove("is-sibuk");
  if (galat) {
    console.error(galat);
    return tampilGalat(mstPesanGalat(galat, tt("Realisasi gagal disimpan. Coba lagi.", "The realization could not be saved. Try again.")));
  }
  const unit = mstBulat(baru.reduce((s, x) => s + x.qty, 0));
  const bernilai = baru.filter((x) => x.nilai != null);
  const nilaiBaru = bernilai.length ? ", " + mstFmtUang(bernilai.reduce((s, x) => s + x.nilai, 0)) : "";
  const labelPib = isi.pib.map((p) => mstAjuRingkas(p.aju)).join(" + ");
  mstForm = null;
  mstModal.hide();
  renderMasterlist();
  if (gagalLanjut.length) {
    console.error(galatLanjut);
    showToast(
      tt(
        `Sebagian tersimpan, tetapi PIB ${labelPib} belum masuk ke realisasi baris ${gagalLanjut.join(", ")}. Tambahkan lewat tombol + PIB di rincian barisnya.`,
        `Partly saved, but PIB ${labelPib} was not added to the line ${gagalLanjut.join(", ")} realization. Add it with the + PIB button in the line details.`,
      ),
      "danger",
    );
    return;
  }
  const pesan = [];
  if (ubah) pesan.push(tt("Realisasi diperbarui.", "Realization updated."));
  if (baru.length)
    pesan.push(
      tt(
        `Realisasi PIB ${labelPib} tercatat: ${mstFmt(baru.length)} baris, ${mstFmt(unit)} unit${nilaiBaru}.`,
        `PIB ${labelPib} recorded: ${mstFmt(baru.length)} ${baru.length === 1 ? "line" : "lines"}, ${mstFmt(unit)} ${unit === 1 ? "unit" : "units"}${nilaiBaru}.`,
      ),
    );
  if (lanjut.length) {
    const no = lanjut.map((x) => x.no).join(", ");
    pesan.push(tt(`PIB ${labelPib} ditambahkan ke realisasi baris ${no}.`, `PIB ${labelPib} added to the line ${no} realization${lanjut.length === 1 ? "" : "s"}.`));
  }
  showToast(pesan.join(" "), "success");
}

function mstHapusRealisasi(id) {
  if (!requireEdit()) return;
  const u = mstRealisasiDb.find((x) => x.id === id);
  if (!u) return;
  const b = mstBarisDb.find((x) => x.id === u.item_id);
  const pib = mstPibs(u)
    .map((p) => p.aju)
    .join(" / ");
  showConfirm(
    tt(
      `Hapus realisasi ${mstFmt(u.qty)} unit (PIB ${pib}) dari baris ${b ? b.no : "?"}? Kuotanya kembali tersedia.`,
      `Delete the realization of ${mstFmt(u.qty)} ${Number(u.qty) === 1 ? "unit" : "units"} (PIB ${pib}) from line ${b ? b.no : "?"}? The quota becomes available again.`,
    ),
    async () => {
      const { error } = await supabaseClient.from("masterlist_usages").delete().eq("id", id);
      if (error) {
        console.error(error);
        showToast(t("m.gagal.menghapus"), "danger");
        return;
      }
      mstRealisasiDb = mstRealisasiDb.filter((x) => x.id !== id);
      renderMasterlist();
      showToast(tt("Realisasi dihapus.", "Realization deleted."), "dark");
    },
    { confirmText: t("u.ya.hapus") },
  );
}

/* ---------- tanggal satu PIB di semua catatannya ---------- */

/* Satu PIB, satu tanggal. Catatan lama (dari Excel) belum bertanggal, dan
   satu PIB bisa tercatat di belasan baris: tanggalnya diatur SEKALI dari
   susunan Per PIB lalu dipasang ke semua catatan PIB itu -- termasuk PIB
   yang menjadi bagian sebuah realisasi parsial. */
function mstAturTanggalPib(kunci) {
  if (!requireEdit()) return;
  const g = mstPerPib(mstSusun()).find((x) => x.kunci === kunci);
  if (!g) return;
  const realisasi = [...new Set(g.isi.map((x) => x.realisasi))];
  const tanggal = [...g.semuaTanggal].sort();
  const n = realisasi.length;
  const sekarang = tanggal.map(fmtDate).join(", ") + (g.tanpaTanggal ? tt(`; ${mstFmt(g.tanpaTanggal)} belum bertanggal`, `; ${mstFmt(g.tanpaTanggal)} undated`) : "");
  // Nama PIB-nya sama dengan yang tertulis di susunan Per PIB (nomor jadwalnya kalau ada)
  const label = mstAjuRingkas(g.jadwal ? g.jadwal.noAju : g.aju);
  showPrompt({
    title: tt(`Tanggal PIB ${label}`, `PIB ${label} date`),
    desc: tt(
      `Dipasang ke ${mstFmt(n)} catatan realisasi PIB ini — satu PIB, satu tanggal.`,
      `Applied to this PIB's ${mstFmt(n)} realization ${n === 1 ? "record" : "records"} — one PIB, one date.`,
    ),
    icon: "bi-calendar-event",
    okText: tt("Simpan", "Save"),
    fields: [
      {
        key: "tanggal",
        label: tt("Tanggal PIB", "PIB date"),
        type: "date",
        value: tanggal.length ? tanggal[tanggal.length - 1] : "",
        hint: g.tanggalBeda ? tt(`Sekarang tercatat: ${sekarang}. Semuanya disamakan.`, `Currently recorded: ${sekarang}. All of them are aligned.`) : "",
      },
    ],
    onSubmit: (v) => {
      mstSimpanTanggalPib(g.kunci, label, realisasi, v.tanggal || null);
      return true;
    },
  });
}

async function mstSimpanTanggalPib(kunci, label, realisasi, tanggal) {
  const hasil = await Promise.all(
    realisasi.map(async (u) => {
      const pibs = mstPibs(u).map((p) => (mstKunciAju(p.aju) === kunci ? { aju: p.aju, tanggal } : p));
      // Tanggal per PIB sebuah realisasi parsial hanya bisa disimpan di kolom pibs
      if (pibs.length > 1 && !mstAdaKolom("pibs")) return { lewat: true };
      try {
        const h = await mstKirim((m) => supabaseClient.from("masterlist_usages").update(m[0]).eq("id", u.id), [mstKolomPib(mstUrutPib(pibs))]);
        if (!h.error) Object.assign(u, h.muatan[0]);
        return { error: h.error };
      } catch (e) {
        return { error: e };
      }
    }),
  );
  renderMasterlist();
  const gagal = hasil.filter((h) => h.error);
  const lewat = hasil.filter((h) => h.lewat).length;
  if (gagal.length) {
    console.error(gagal[0].error);
    showToast(
      tt(
        `${mstFmt(gagal.length)} dari ${mstFmt(hasil.length)} catatan PIB ${label} gagal diperbarui. Coba lagi.`,
        `${mstFmt(gagal.length)} of ${mstFmt(hasil.length)} PIB ${label} records could not be updated. Try again.`,
      ),
      "danger",
    );
  } else if (lewat) {
    showToast(mstPesanMigrasiPib(), "danger");
  } else {
    const n = hasil.length;
    showToast(
      tanggal
        ? tt(`Tanggal PIB ${label} (${fmtDate(tanggal)}) dipasang ke ${mstFmt(n)} catatan.`, `PIB ${label} date (${fmtDate(tanggal)}) applied to ${mstFmt(n)} ${n === 1 ? "record" : "records"}.`)
        : tt(`Tanggal PIB ${label} dikosongkan di ${mstFmt(n)} catatan.`, `PIB ${label} date cleared on ${mstFmt(n)} ${n === 1 ? "record" : "records"}.`),
      "success",
    );
  }
}

/* ---------- baris masterlist: tambah / ubah / hapus ---------- */

function mstIsianBaris(b) {
  const berikut = mstBarisDb.reduce((m, x) => Math.max(m, Number(x.no) || 0), 0) + 1;
  return [
    { key: "no", label: "No.", inputmode: "numeric", value: String(b ? b.no : berikut), filter: (v) => v.replace(/\D/g, ""), lebar: "setengah" },
    { key: "satuan", label: tt("Satuan", "Unit"), value: b ? b.uom || "" : "NIU", placeholder: "NIU", lebar: "setengah" },
    // HS Code di samping uraian barang -- seperti di unduhan Excel
    { key: "nama", label: tt("Uraian barang", "Item description"), value: b ? b.description || "" : "", placeholder: tt("Cth: HYDRAULIC PRESS", "e.g. HYDRAULIC PRESS"), lebar: "setengah" },
    {
      key: "hs",
      label: "HS Code",
      value: b ? b.hs_code || "" : "",
      placeholder: tt("Cth: 8477.80.10", "e.g. 8477.80.10"),
      inputmode: "numeric",
      filter: batasiHsCode,
      hint: tt("Opsional. Ikut di unduhan Excel, tidak di cetakan.", "Optional. Included in the Excel download, not in the printout."),
      lebar: "setengah",
    },
    {
      key: "spek",
      label: tt("Spesifikasi", "Specification"),
      type: "textarea",
      value: b ? b.specification || "" : "",
      hint: tt(
        'Salin dari dokumen masterlist. Bagian "FOR FLOW PROSES MANUFAKTUR …" di akhirnya dibaca sebagai lini proses.',
        'Copy it from the masterlist document. The trailing "FOR FLOW PROSES MANUFAKTUR …" part is read as the process line.',
      ),
    },
    {
      key: "kuota",
      label: tt("Kuota", "Quota"),
      inputmode: "decimal",
      value: b ? formatNumberTyping(String(mstBulat(b.quota))) : "1",
      filter: formatNumberTyping,
      hint: b ? mstKetKuota(b) : "",
      lebar: "setengah",
    },
    {
      key: "nilai",
      label: tt(`Nilai masterlist (${MST_MATA_UANG})`, `Masterlist value (${MST_MATA_UANG})`),
      inputmode: "decimal",
      value: b ? mstTeksNilai(b.value_quota) : "",
      placeholder: tt("Nilai total baris ini", "This line's total value"),
      filter: formatNumberTyping,
      hint: mstKetNilaiKuota(b),
      lebar: "setengah",
    },
  ];
}

/* Nilai -> isi kotak ("116,700.5"); kosong kalau belum diisi. Nol tetap
   ditulis 0 (barang tanpa nilai dagang), tidak dianggap kosong. */
function mstTeksNilai(v) {
  const n = mstNilaiDb(v);
  return n == null ? "" : formatNumberTyping(String(n));
}

/* Isi kotak jumlah / kuota -> angka; 0 kalau kosong, NaN kalau bukan
   angka. Ditulis seperti kotak angka lain di aplikasi: koma ribuan,
   titik desimal ("1,250.5"). */
function mstBacaJumlah(teks) {
  const isi = String(teks == null ? "" : teks).trim();
  if (!isi) return 0;
  if (!/^[\d,]*\.?\d*$/.test(isi) || !/\d/.test(isi)) return NaN;
  return parseInputNumber(isi);
}

/* Isi kotak nilai -> angka, null kalau kosong, NaN kalau bukan angka. */
function mstBacaNilai(teks) {
  const isi = String(teks == null ? "" : teks).trim();
  if (!isi) return null;
  if (!/^[\d,]*\.?\d*$/.test(isi) || !/\d/.test(isi)) return NaN;
  return parseInputNumber(isi);
}

function mstTerpakaiNilai(idBaris) {
  return mstUang(mstRealisasiDb.filter((u) => u.item_id === idBaris).reduce((s, u) => s + (mstNilaiDb(u.invoice_value) || 0), 0));
}
function mstKetNilaiKuota(b) {
  const terpakai = b ? mstTerpakaiNilai(b.id) : 0;
  return terpakai > 0
    ? tt(`Nilai invoice yang sudah terealisasi: ${mstFmtUang(terpakai)}.`, `Invoice value already realized: ${mstFmtUang(terpakai)}.`)
    : tt("Opsional. Nilai total baris ini di masterlist — sisa nilai invoicenya dilacak seperti sisa unit.", "Optional. This line's total value in the masterlist — the remaining invoice value is tracked like the remaining units.");
}

function mstTerpakai(idBaris) {
  return mstBulat(mstRealisasiDb.filter((u) => u.item_id === idBaris).reduce((s, u) => s + (Number(u.qty) || 0), 0));
}
function mstKetKuota(b) {
  const terpakai = mstTerpakai(b.id);
  return terpakai > 0 ? tt(`Tidak boleh lebih kecil dari yang sudah terpakai (${mstFmt(terpakai)}).`, `Cannot be lower than what is already used (${mstFmt(terpakai)}).`) : "";
}

/* Isian kotak -> baris siap simpan, atau pesan galat (string). */
function mstPeriksaBaris(v, lama) {
  const no = Number(v.no);
  if (!Number.isInteger(no) || no <= 0) return tt("No. harus bilangan bulat lebih dari 0.", "No. must be a whole number greater than 0.");
  if (mstBarisDb.some((x) => Number(x.no) === no && (!lama || x.id !== lama.id)))
    return tt(`No. ${no} sudah dipakai baris lain.`, `No. ${no} is already used by another line.`);
  const nama = String(v.nama || "").replace(/\s+/g, " ").trim();
  if (!nama) return tt("Uraian barang harus diisi.", "The item description is required.");
  const kuota = mstBacaJumlah(v.kuota);
  if (!(kuota > 0)) return tt("Kuota harus lebih dari 0.", "The quota must be greater than 0.");
  if (mstBulat(kuota) !== kuota) return tt("Kuota paling banyak tiga angka di belakang koma.", "The quota can have at most three decimals.");
  if (lama && kuota < mstTerpakai(lama.id))
    return tt(`Kuota tidak boleh lebih kecil dari yang sudah terpakai (${mstFmt(mstTerpakai(lama.id))}).`, `The quota cannot be lower than what is already used (${mstFmt(mstTerpakai(lama.id))}).`);
  // Nilai masterlist: boleh kosong; kalau diisi harus angka > 0, paling banyak dua desimal
  const nilai = mstBacaNilai(v.nilai);
  if (nilai != null && !(nilai > 0)) return tt("Nilai masterlist harus angka lebih dari 0 — atau kosongkan.", "The masterlist value must be a number greater than 0 — or leave it empty.");
  if (nilai != null && mstUang(nilai) !== nilai) return tt("Nilai masterlist paling banyak dua angka di belakang koma.", "The masterlist value can have at most two decimals.");
  // HS Code: boleh kosong; paling banyak 8 angka, titik hanya pemisah (batasiHsCode, hscode-view.js)
  const hs = batasiHsCode(v.hs).replace(/\.+$/, "");
  return {
    no,
    description: nama,
    hs_code: /\d/.test(hs) ? hs : null,
    specification: String(v.spek || "").replace(/\s+/g, " ").trim(),
    uom: String(v.satuan || "").trim().toUpperCase() || "NIU",
    quota: kuota,
    value_quota: nilai,
  };
}

function mstTambahBaris() {
  if (!requireEdit()) return;
  if (!mstDok) {
    showToast(tt("Dokumen masterlist belum ada. Jalankan migration-masterlist.sql lebih dulu.", "There is no masterlist document yet. Run migration-masterlist.sql first."), "danger");
    return;
  }
  showPrompt({
    title: tt("Tambah baris masterlist", "Add masterlist line"),
    icon: "bi-card-checklist",
    okText: tt("Simpan", "Save"),
    fields: mstIsianBaris(null),
    onSubmit: (v) => {
      const baris = mstPeriksaBaris(v, null);
      if (typeof baris === "string") return baris;
      mstSimpanBarisBaru(baris);
      return true;
    },
  });
}

async function mstSimpanBarisBaru(baris) {
  const { data: hasil, error } = await mstKirim(
    (m) => supabaseClient.from("masterlist_items").insert(m[0]).select().single(),
    [Object.assign({ list_id: mstDok.id, created_by: authState.user ? authState.user.id : null }, baris)],
  );
  if (error) {
    console.error(error);
    showToast(mstPesanGalat(error, tt("Baris gagal disimpan.", "The line could not be saved.")), "danger");
    return;
  }
  mstBarisDb.push(hasil);
  renderMasterlist();
  showToast(tt(`Baris ${baris.no} ditambahkan.`, `Line ${baris.no} added.`), "dark");
}

function mstUbahBaris(id) {
  if (!requireEdit()) return;
  const lama = mstBarisDb.find((x) => x.id === id);
  if (!lama) return;
  showPrompt({
    title: tt(`Ubah baris ${lama.no}`, `Edit line ${lama.no}`),
    icon: "bi-pencil-square",
    okText: tt("Simpan", "Save"),
    fields: mstIsianBaris(lama),
    onSubmit: (v) => {
      const baris = mstPeriksaBaris(v, lama);
      if (typeof baris === "string") return baris;
      mstSimpanUbahBaris(id, baris);
      return true;
    },
  });
}

async function mstSimpanUbahBaris(id, baris) {
  const { error, muatan } = await mstKirim((m) => supabaseClient.from("masterlist_items").update(m[0]).eq("id", id), [baris]);
  if (error) {
    console.error(error);
    showToast(mstPesanGalat(error, t("m.gagal.menyimpan.perubahan")), "danger");
    return;
  }
  const b = mstBarisDb.find((x) => x.id === id);
  if (b) Object.assign(b, muatan[0]);
  renderMasterlist();
  showToast(t("m.perubahan.tersimpan"), "dark");
}

function mstHapusBaris(id) {
  if (!requireEdit()) return;
  const b = mstBarisDb.find((x) => x.id === id);
  if (!b) return;
  const realisasi = mstRealisasiDb.filter((u) => u.item_id === id).length;
  showConfirm(
    realisasi
      ? tt(
          `Hapus baris ${b.no} (${b.description})? ${mstFmt(realisasi)} catatan realisasinya IKUT terhapus.`,
          `Delete line ${b.no} (${b.description})? Its ${mstFmt(realisasi)} realization ${realisasi === 1 ? "record is" : "records are"} deleted TOO.`,
        )
      : tt(`Hapus baris ${b.no} (${b.description})?`, `Delete line ${b.no} (${b.description})?`),
    async () => {
      const { error } = await supabaseClient.from("masterlist_items").delete().eq("id", id);
      if (error) {
        console.error(error);
        showToast(t("m.gagal.menghapus"), "danger");
        return;
      }
      mstBarisDb = mstBarisDb.filter((x) => x.id !== id);
      mstRealisasiDb = mstRealisasiDb.filter((u) => u.item_id !== id);
      mstKeadaan.terbuka.delete("b:" + id);
      renderMasterlist();
      showToast(tt(`Baris ${b.no} dihapus.`, `Line ${b.no} deleted.`), "dark");
    },
    { confirmText: t("u.ya.hapus") },
  );
}

/* ---------- dokumen masterlist ---------- */

function mstUbahDokumen() {
  if (!requireEdit() || !mstDok) return;
  showPrompt({
    title: tt("Dokumen masterlist", "Masterlist document"),
    desc: tt(
      "Nomor & tanggal SK serta masa berlakunya. Masa berlaku dipakai untuk pengingat di halaman ini.",
      "The decree number, its date, and the validity period. The validity date drives the reminder on this page.",
    ),
    icon: "bi-file-earmark-text",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nama", label: tt("Nama", "Name"), value: mstDok.name || "" },
      { key: "sk", label: tt("No. SK", "Decree No."), value: mstDok.sk_no || "" },
      { key: "tglSk", label: tt("Tanggal SK", "Decree date"), type: "date", value: mstDok.sk_date || "", lebar: "setengah" },
      { key: "berlaku", label: tt("Berlaku sampai", "Valid until"), type: "date", value: mstDok.valid_until || "", lebar: "setengah" },
      { key: "catatan", label: tt("Catatan (opsional)", "Notes (optional)"), type: "textarea", value: mstDok.notes || "" },
    ],
    onSubmit: (v) => {
      const nama = String(v.nama || "").trim();
      if (!nama) return tt("Nama harus diisi.", "The name is required.");
      if (v.tglSk && v.berlaku && v.berlaku < v.tglSk) return tt("Masa berlaku tidak boleh sebelum tanggal SK.", "The validity date cannot be before the decree date.");
      mstSimpanDokumen({
        name: nama,
        sk_no: String(v.sk || "").trim(),
        sk_date: v.tglSk || null,
        valid_until: v.berlaku || null,
        notes: String(v.catatan || "").trim(),
      });
      return true;
    },
  });
}

async function mstSimpanDokumen(ubahan) {
  const { error } = await supabaseClient.from("masterlists").update(ubahan).eq("id", mstDok.id);
  if (error) {
    console.error(error);
    showToast(t("m.gagal.menyimpan.perubahan"), "danger");
    return;
  }
  Object.assign(mstDok, ubahan);
  renderMasterlist();
  showToast(t("m.perubahan.tersimpan"), "dark");
}

/* ---------- unduh Excel ---------- */

/* Tanggal PIB sebuah baris, berpasangan dengan kolom PIB AJU: satu PIB
   bertanggal -> tanggal ISO (ditulis sebagai sel tanggal Excel); beberapa
   PIB -> teks berurutan sama dengan nomornya ("12-05-2025 / -"); tanpa
   tanggal sama sekali -> kosong. */
function mstTanggalPibBaris(pibs) {
  if (!pibs.some((p) => p.tanggal)) return "";
  if (pibs.length === 1) return pibs[0].tanggal;
  return pibs.map((p) => (p.tanggal ? fmtDate(p.tanggal) : "-")).join(" / ");
}

/* Baris lembar Excel -- susunan kolom berkas yang selama ini dipakai
   (NO, DESCRIPTION, SPECIFICATION OF GOODS, UoM, QTTY, USED, REMAIN, PIB
   AJU) dengan HS CODE di samping DESCRIPTION; HS Code hanya ada di sini,
   tidak di cetakan stock opname. Sesudahnya PIB DATE dan ACTUAL QTY
   (sengaja kosong: diisi saat stock opname), lalu nilai (USD) -- VALUE,
   USED VALUE, REMAIN VALUE. Baris yang nilai masterlist-nya belum diisi:
   kolom nilainya kosong. */
function mstBarisExcel(baris) {
  return baris.map((b) => {
    const pibs = mstPibBaris(b);
    const aju = pibs.map((p) => p.aju).join(" / ");
    const kosong = (n) => (n == null ? "" : n);
    return [
      b.no,
      b.nama,
      b.hsCode,
      b.spesifikasi,
      b.satuan,
      b.kuota,
      b.terpakai,
      b.sisa,
      /^\d{1,15}$/.test(aju) ? Number(aju) : aju,
      mstTanggalPibBaris(pibs),
      "", // ACTUAL QTY
      kosong(b.nilaiKuota),
      b.nilaiKuota != null || b.nilaiTerpakai > 0 ? b.nilaiTerpakai : "",
      kosong(b.nilaiSisa),
    ];
  });
}

/* Lembar kedua, "REALISASI PER PIB": tiap realisasi satu blok, SATU BARIS
   PER PIB -- nomor aju dan tanggalnya berpasangan di baris yang sama
   (di Sheet1 kolom PIB AJU hanya bisa memuat nomornya). Isian milik
   realisasi (No, uraian, HS Code, satuan, jumlah, catatan) ditulis sekali
   dan selnya digabung setinggi blok, jadi SUM kolom QTTY tetap =
   terpakai. */
function mstBlokRealisasiExcel(baris) {
  const blok = [];
  baris.forEach((b) =>
    b.realisasi.forEach((u) => {
      const pibs = mstPibs(u);
      blok.push({
        no: b.no,
        nama: b.nama,
        hsCode: b.hsCode,
        satuan: b.satuan,
        qty: mstBulat(u.qty),
        nilai: mstNilaiDb(u.invoice_value),
        catatan: u.notes || "",
        pib: (pibs.length ? pibs : [{ aju: String(u.aju_ref || ""), tanggal: null }]).map((p) => ({ aju: p.aju, tanggal: p.tanggal || null })),
      });
    }),
  );
  return blok;
}

/* "2025-05-12" -> tanggal Excel. Tengah malam UTC: ExcelJS menghitung
   nomor serinya dari waktu UTC, jadi tanggalnya tidak bergeser oleh zona
   waktu komputer yang mengunduh. */
function mstTanggalExcel(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const MST_BULAN_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function mstNamaBerkas(iso) {
  const d = parseLocalDate(iso) || new Date();
  return `LAST UPDATE QUOTA MASTER LIST DDI ${String(d.getDate()).padStart(2, "0")} ${MST_BULAN_EN[d.getMonth()]} ${d.getFullYear()}.xlsx`;
}

async function mstUnduhExcel() {
  const baris = mstSusun();
  if (!baris.length) {
    showToast(tt("Belum ada baris untuk diunduh.", "There are no lines to download."), "danger");
    return;
  }
  const tombol = $("#btnMstExcel");
  if (tombol) tombol.disabled = true;
  try {
    await ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "EXIM DDI";
    wb.created = new Date();
    const ws = wb.addWorksheet("Sheet1");
    /* Tabel mulai di kolom A: NO, DESCRIPTION, HS CODE, SPECIFICATION ...
       -- dari SPECIFICATION ke kanan hurufnya tetap (D s.d. N), jadi
       rumus di bawah sama dengan berkas aslinya. */
    ws.columns = [5, 44, 13, 58, 8, 8, 8, 11, 22, 13, 13, 16, 16, 16].map((width) => ({ width }));
    const FORMAT_UANG = "#,##0.00";
    const tepi = { style: "thin", color: { argb: "FF000000" } };
    const bingkai = { top: tepi, left: tepi, bottom: tepi, right: tepi };
    /* kiri = kolom teks panjang (rata kiri & boleh membungkus); sisanya --
       termasuk QTTY, USED, REMAIN & nilai -- rata tengah, sama dengan
       lembar cetaknya (masterlist-print.js). */
    const penulis = (lembar, kiri) => (nomorBaris, nilai, opsi) => {
      const o = opsi || {};
      nilai.forEach((v, i) => {
        const sel = lembar.getCell(nomorBaris, i + 1);
        sel.value = v;
        sel.border = bingkai;
        sel.font = { name: "Calibri", size: 11, bold: !!o.tebal };
        sel.alignment = { vertical: "middle", horizontal: o.tebal || kiri.indexOf(i) < 0 ? "center" : "left", wrapText: kiri.indexOf(i) >= 0 };
      });
    };
    const tulis = penulis(ws, [1, 3]);
    const U = MST_MATA_UANG;
    tulis(1, ["NO", "DESCRIPTION", "HS CODE", "SPECIFICATION OF GOODS", "UoM", "QTTY", "USED", "REMAIN", "PIB AJU", "PIB DATE", "ACTUAL QTY", `VALUE (${U})`, `USED VALUE (${U})`, `REMAIN VALUE (${U})`], { tebal: true });
    ws.getRow(1).height = 36;
    mstBarisExcel(baris).forEach((r, i) => {
      const n = i + 2;
      // Satu PIB bertanggal = sel tanggal sungguhan; beberapa PIB = teks "dd-mm-yyyy / dd-mm-yyyy"
      const tglPib = /^\d{4}-\d{2}-\d{2}$/.test(r[9]) ? mstTanggalExcel(r[9]) : r[9];
      // REMAIN = QTTY - USED (dan REMAIN VALUE = VALUE - USED VALUE), sebagai rumus
      // dengan hasilnya, supaya tetap benar kalau berkasnya disunting
      tulis(n, r.slice(0, 7).concat([{ formula: `F${n}-G${n}`, result: r[7] }, r[8], tglPib, r[10], r[11], r[12], r[11] === "" ? "" : { formula: `L${n}-M${n}`, result: r[13] }]));
      if (tglPib instanceof Date) ws.getCell(n, 10).numFmt = "dd-mm-yyyy";
      [12, 13, 14].forEach((kol) => (ws.getCell(n, kol).numFmt = FORMAT_UANG));
      ws.getRow(n).height = 30.75;
    });
    const akhir = baris.length + 1;
    const total = akhir + 1;
    const ring = mstRingkasan(baris);
    const jumlah = (kol, hasil) => ({ formula: `SUM(${kol}2:${kol}${akhir})`, result: hasil });
    const bernilai = baris.filter((b) => b.nilaiKuota != null || b.nilaiTerpakai > 0);
    tulis(
      total,
      [
        "",
        "",
        "",
        "TOTAL",
        "",
        jumlah("F", ring.kuota),
        jumlah("G", ring.terpakai),
        jumlah("H", ring.sisa),
        "",
        "",
        // ACTUAL QTY masih kosong; jumlahnya ikut terisi begitu hasil opname ditulis
        jumlah("K", 0),
        jumlah("L", ring.nilaiKuota),
        jumlah("M", mstUang(bernilai.reduce((s, b) => s + b.nilaiTerpakai, 0))),
        jumlah("N", ring.nilaiSisa),
      ],
      { tebal: true },
    );
    [12, 13, 14].forEach((kol) => (ws.getCell(total, kol).numFmt = FORMAT_UANG));
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // Lembar kedua: pasangan nomor aju - tanggal PIB, satu baris per PIB
    const ws2 = wb.addWorksheet("REALISASI PER PIB");
    // Juga mulai di kolom A, HS CODE di samping DESCRIPTION; dari UoM ke kanan hurufnya tetap (D s.d. I)
    ws2.columns = [5, 40, 13, 8, 8, 16, 32, 13, 40].map((width) => ({ width }));
    const tulis2 = penulis(ws2, [1, 8]);
    tulis2(1, ["NO", "DESCRIPTION", "HS CODE", "UoM", "QTTY", `VALUE (${U})`, "PIB AJU", "PIB DATE", "NOTES"], { tebal: true });
    ws2.getRow(1).height = 30;
    let n2 = 2;
    const blok = mstBlokRealisasiExcel(baris);
    blok.forEach((k) => {
      k.pib.forEach((p, j) => {
        const aju = /^\d{1,15}$/.test(p.aju) ? Number(p.aju) : p.aju;
        const tgl = p.tanggal ? mstTanggalExcel(p.tanggal) : "";
        tulis2(n2 + j, j === 0 ? [k.no, k.nama, k.hsCode, k.satuan, k.qty, k.nilai == null ? "" : k.nilai, aju, tgl, k.catatan] : ["", "", "", "", "", "", aju, tgl, ""]);
        if (p.tanggal) ws2.getCell(n2 + j, 8).numFmt = "dd-mm-yyyy";
      });
      ws2.getCell(n2, 6).numFmt = FORMAT_UANG;
      // Realisasi parsial: No, uraian, HS Code, satuan, jumlah, nilai & catatan setinggi seluruh PIB-nya
      if (k.pib.length > 1) [1, 2, 3, 4, 5, 6, 9].forEach((kol) => ws2.mergeCells(n2, kol, n2 + k.pib.length - 1, kol));
      n2 += k.pib.length;
    });
    const nilaiBlok = mstUang(blok.reduce((s, k) => s + (k.nilai || 0), 0));
    tulis2(
      n2,
      ["", "TOTAL", "", "", n2 > 2 ? { formula: `SUM(E2:E${n2 - 1})`, result: ring.terpakai } : 0, n2 > 2 ? { formula: `SUM(F2:F${n2 - 1})`, result: nilaiBlok } : 0, "", "", ""],
      { tebal: true },
    );
    ws2.getCell(n2, 6).numFmt = FORMAT_UANG;
    ws2.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    tautan.download = mstNamaBerkas(todayISO());
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
    showToast(tt(`Berkas Excel diunduh: ${mstFmt(baris.length)} baris.`, `Excel file downloaded: ${mstFmt(baris.length)} lines.`), "success");
  } catch (e) {
    console.error(e);
    showToast(tt("Berkas Excel gagal dibuat.", "The Excel file could not be created."), "danger");
  } finally {
    if (tombol) tombol.disabled = false;
  }
}

/* ---------- penangan ---------- */

/* Jadwal import dibuka di halaman Jadwal (panel detailnya hanya ada di
   sana, dan urutan telusurnya mengikuti daftar buku Import). */
function mstBukaJadwal(id) {
  if (!id) return;
  if (activeMode !== "import") switchMode("import");
  location.hash = "#/";
  setTimeout(() => openDetailView(id), 60);
}

/* Saringan berubah -> kembali ke halaman 1: halaman 3 dari hasil lama
   bisa jadi tidak ada lagi di hasil baru. */
function mstSaringUlang() {
  mstKeadaan.halaman = 1;
  renderMasterlist();
}

function mstKeDaftar() {
  const panel = $("#mstPanelDaftar");
  if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

const mstHalamanEl = $("#viewMasterlist");
if (mstHalamanEl) {
  mstHalamanEl.addEventListener("click", (e) => {
    const cari = (sel) => e.target.closest(sel);
    let el;

    if (cari("#btnMstCatat")) return mstBukaRealisasi();
    if (cari("#btnMstBaris")) return mstTambahBaris();
    if (cari("#btnMstDokumen")) return mstUbahDokumen();
    if (cari("#btnMstExcel")) return void mstUnduhExcel();
    if (cari("#btnMstCetak")) return cetakMasterlist();
    if (cari("#btnMstMuat")) return void loadMasterlist();

    if ((el = cari("[data-mst-tampilan]"))) {
      if (mstKeadaan.tampilan === el.dataset.mstTampilan) return;
      mstKeadaan.tampilan = el.dataset.mstTampilan;
      return mstSaringUlang();
    }
    // Panel "Kuota yang masih tersedia": klik jenis -> daftar disaring ke jenis itu (klik lagi melepasnya)
    if ((el = cari("[data-mst-jenis]"))) {
      const pilih = { nama: el.dataset.mstJenis, lini: el.dataset.mstJenisLini };
      const sama = mstKeadaan.jenis && mstKeadaan.jenis.nama === pilih.nama && mstKeadaan.jenis.lini === pilih.lini;
      mstKeadaan.jenis = sama ? null : pilih;
      mstKeadaan.tampilan = "baris";
      mstSaringUlang();
      if (!sama) mstKeDaftar();
      return;
    }
    if (cari("[data-mst-lepas-jenis]")) {
      mstKeadaan.jenis = null;
      return mstSaringUlang();
    }
    if (cari("[data-mst-semua-jenis]")) {
      mstKeadaan.semuaJenis = !mstKeadaan.semuaJenis;
      return renderMasterlist();
    }
    if ((el = cari("[data-mst-lihat-status]"))) {
      mstKeadaan.jenis = null;
      mstKeadaan.tampilan = "baris";
      $("#mstSearch").value = "";
      $("#mstStatus").value = el.dataset.mstLihatStatus;
      mstSaringUlang();
      return mstKeDaftar();
    }
    if ((el = cari("[data-mst-buka]"))) {
      const kunci = el.dataset.mstBuka;
      if (mstKeadaan.terbuka.has(kunci)) mstKeadaan.terbuka.delete(kunci);
      else mstKeadaan.terbuka.add(kunci);
      return renderMasterlist();
    }
    if ((el = cari("[data-mst-jadwal]"))) return mstBukaJadwal(el.dataset.mstJadwal);
    if ((el = cari("[data-mst-catat-jadwal]"))) {
      const s = ((data && data.import) || []).find((x) => x.id === el.dataset.mstCatatJadwal);
      if (!s) return;
      // Yang tidak mengubah data membuka jadwalnya; EXIM langsung mencatat
      if (!canEdit()) return mstBukaJadwal(s.id);
      // Nilai barangnya (jumlah x harga di form jadwal, USD) ikut ditulis: patokan mengisi nilai invoice
      const barang = mstBarangMasterlist(s)
        .map((it) => {
          const nilai = mstUang((Number(it.qty) || 0) * (Number(it.harga) || 0));
          return `${itemDisplayName(it)} (${`${mstFmt(it.qty)} ${it.satuan || ""}`.trim()}${nilai > 0 ? ", " + mstFmtUang(nilai) : ""})`;
        })
        .join(", ");
      return mstBukaRealisasi({
        aju: s.noAju || "",
        ket: tt(`${dispVal(s.party)} — barang berfasilitas Masterlist: ${barang}.`, `${dispVal(s.party)} — items under the Masterlist facility: ${barang}.`),
      });
    }
    if ((el = cari("[data-mst-catat]"))) return mstBukaRealisasi({ itemId: el.dataset.mstCatat });
    if ((el = cari("[data-mst-tambah-pib]"))) {
      const u = mstRealisasiDb.find((x) => x.id === el.dataset.mstTambahPib);
      return u ? mstBukaRealisasi({ realisasi: u, tambahPib: true }) : undefined;
    }
    if ((el = cari("[data-mst-tanggal-pib]"))) return mstAturTanggalPib(el.dataset.mstTanggalPib);
    if ((el = cari("[data-mst-ubah-realisasi]"))) {
      const u = mstRealisasiDb.find((x) => x.id === el.dataset.mstUbahRealisasi);
      return u ? mstBukaRealisasi({ realisasi: u }) : undefined;
    }
    if ((el = cari("[data-mst-hapus-realisasi]"))) return mstHapusRealisasi(el.dataset.mstHapusRealisasi);
    if ((el = cari("[data-mst-ubah-baris]"))) return mstUbahBaris(el.dataset.mstUbahBaris);
    if ((el = cari("[data-mst-hapus-baris]"))) return mstHapusBaris(el.dataset.mstHapusBaris);
    if ((el = cari("[data-mstpage]"))) {
      mstKeadaan.halaman = Number(el.dataset.mstpage);
      return renderMasterlist();
    }
    if ((el = cari("[data-mstnav]"))) {
      mstKeadaan.halaman += el.dataset.mstnav === "next" ? 1 : -1;
      return renderMasterlist();
    }
  });
  mstHalamanEl.addEventListener("change", (e) => {
    if (e.target.id === "mstStatus" || e.target.id === "mstLini") return mstSaringUlang();
    if (e.target.id === "mstPageSize") {
      mstKeadaan.perHalaman = Number(e.target.value) || 25;
      mstSaringUlang();
    }
  });
  const mstSearchEl = $("#mstSearch");
  if (mstSearchEl) mstSearchEl.addEventListener("input", mstSaringUlang);
}

if (mstModalEl) {
  mstModalEl.addEventListener("shown.bs.modal", mstFokusAwal);
  mstModalEl.addEventListener("click", (e) => {
    if (e.target.closest("#btnMstSimpanRealisasi")) return void mstSimpanRealisasi();
    if (e.target.closest("#btnMstPibTambah")) {
      mstBacaPib();
      mstForm.pib.push({ aju: "", tanggal: "", otomatis: false });
      mstGambarPib();
      const kotak = document.querySelector(`#mstPib [data-mst-pib="${mstForm.pib.length - 1}"] [data-mst-pib-aju]`);
      if (kotak) kotak.focus();
      return;
    }
    const hapusPib = e.target.closest("[data-mst-pib-hapus]");
    if (hapusPib) {
      mstBacaPib();
      mstForm.pib.splice(Number(hapusPib.closest("[data-mst-pib]").dataset.mstPib), 1);
      $("#mstRealisasiGalat").classList.add("d-none");
      return mstGambarPib();
    }
    if (e.target.closest("#btnMstPilihTambah")) {
      mstBacaPilih();
      mstForm.baris.push({ itemId: "", qty: "", lanjutId: "", nilai: "", nilaiOtomatis: true });
      mstGambarPilih();
      // Baris pilihan baru langsung siap dipilih barisnya
      fokuskan(document.querySelector(`#mstPilih [data-mst-pilih="${mstForm.baris.length - 1}"] [data-mst-pilih-baris]`));
      return;
    }
    const hapus = e.target.closest("[data-mst-pilih-hapus]");
    if (hapus) {
      mstBacaPilih();
      mstForm.baris.splice(Number(hapus.closest("[data-mst-pilih]").dataset.mstPilih), 1);
      mstGambarPilih();
    }
  });
  mstModalEl.addEventListener("change", (e) => {
    if (!e.target.matches("[data-mst-pilih-baris]") || !mstForm) return;
    mstBacaPilih();
    // Baris baru dipilih: jumlah awalnya 1 (atau sisanya), kecuali sudah diisi dan masih muat
    $("#mstRealisasiGalat").classList.add("d-none");
    const i = Number(e.target.closest("[data-mst-pilih]").dataset.mstPilih);
    const x = mstForm.baris[i];
    const b = mstSusun().find((r) => r.id === x.itemId);
    const qty = mstBacaJumlah(x.qty);
    if (b && !(qty > 0 && qty <= mstBatas(b))) x.qty = String(Math.min(1, mstBatas(b)));
    mstIsiNilaiOtomatis(i);
    mstGambarPilih();
  });
  mstModalEl.addEventListener("input", (e) => {
    // Pesan galat milik isian yang lama: begitu ada yang diubah, ia tidak berlaku lagi
    $("#mstRealisasiGalat").classList.add("d-none");
    /* Jumlah diketik: nilai invoice yang masih otomatis ikut dihitung.
       Nilai diketik sendiri: tidak lagi otomatis -- kecuali dikosongkan.
       Keterangan & peringatan nilai baris itu diperbarui. */
    const pilih = mstForm && e.target.matches("[data-mst-pilih-qty], [data-mst-pilih-nilai]") && e.target.closest("[data-mst-pilih]");
    if (pilih) {
      const i = Number(pilih.dataset.mstPilih);
      mstBacaPilih();
      const x = mstForm.baris[i];
      if (e.target.matches("[data-mst-pilih-nilai]")) x.nilaiOtomatis = !String(x.nilai || "").trim();
      else mstIsiNilaiOtomatis(i);
      return mstGambarKetPilih(i);
    }
    const pib = mstForm && e.target.closest("[data-mst-pib]");
    if (!pib) return;
    const i = Number(pib.dataset.mstPib);
    const p = mstForm.pib[i];
    if (!p) return;
    if (e.target.matches("[data-mst-pib-aju]")) {
      p.aju = e.target.value;
      mstSelaraskanTanggal(i);
      mstAturTombolPib();
    } else if (e.target.matches("[data-mst-pib-tgl]")) {
      p.tanggal = e.target.value;
      p.otomatis = false;
    }
    mstGambarKetPib(i);
  });
  /* Enter: ke isian berikutnya (PIB -> tanggal -> baris -> jumlah ->
     nilai -> catatan); di isian terakhir -> Simpan. Dulu Enter di kotak
     mana pun langsung menyimpan, termasuk saat baru nomor aju yang
     terisi. Ctrl+Enter tetap langsung menyimpan. */
  mstModalEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || !e.target.matches("input, select")) return;
    e.preventDefault();
    const berikut = e.ctrlKey || e.metaKey ? null : isianBerikutnya(e.target, mstModalEl);
    if (berikut) fokuskan(berikut, { pilihIsi: true });
    else mstSimpanRealisasi();
  });
}
