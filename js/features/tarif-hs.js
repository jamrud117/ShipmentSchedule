"use strict";

/* ------------------------------------------------------------------
   TARIF BEA MASUK PER BARANG, OTOMATIS DARI HS CODE

   Tarif BM ditentukan HS Code barangnya (BTKI), jadi tarifnya milik
   TIAP BARANG -- item.dataPabean.tarifBm (core/data-pabean.js, kolom
   data_pabean per barang) -- bukan satu angka untuk seluruh jadwal.
   Kolom jadwal `tarif` yang lama tinggal cadangan untuk jadwal yang
   belum pernah dibuka lagi (hitungPungutanFasilitas, core/customs.js).

   Sumber tarif otomatis, berurutan:
     1. Database HS Code (kolom `tarif_bm`, migration-hs-tarif-bm.sql):
        baris ber-HS sama yang tarifnya diisi. Beberapa baris ber-HS
        sama dengan tarif berbeda -> tarif yang paling sering.
     2. Riwayat: tarif yang terakhir dipakai barang ber-HS sama di
        jadwal Import lain (tanggal dokumen terbaru menang).
   Keduanya dibaca lewat peta (petaTarifHs, indeksTarifRiwayat), bukan
   dengan menyisir ulang semua jadwal untuk tiap barang.
   Tidak ditemukan -> kosong, dan perhitungan memakai 5% bawaan.

   Aturan pengisian (segarkanTarifOtomatis):
     - Tarif yang DIKETIK sendiri tidak pernah ditimpa.
     - Tarif otomatis (it._tarifOtomatis = { hs, sumber }) mengikuti HS
       Code-nya: HS berganti -> dicari ulang; HS yang tidak dikenal
       mencabutnya (tarif itu milik HS yang lama).
     - Tarif tersimpan dari jadwal yang dibuka diperlakukan sebagai
       otomatis untuk HS-nya saat itu: tidak diubah selama HS Code-nya
       sama, dan ikut dicari ulang kalau HS Code-nya diganti.
   `_tarifOtomatis` hanya penanda layar (awalan _ tidak disimpan).
------------------------------------------------------------------ */
const TARIF_BM_BAWAAN = 5;
const BERKAS_MIGRASI_TARIF_HS = "migration-hs-tarif-bm.sql";

const kunciHsTarif = (kode) => String(kode == null ? "" : kode).replace(/\D/g, "");

/* Angka tarif (persen) atau null: kosong / bukan angka / di luar 0-100.
   Pembaca KETAT, bukan parseLooseNumber: penebak itu membaca "abc" sebagai
   0 -- huruf yang salah ketik diam-diam menjadi tarif 0%. Tarif tidak
   pernah butuh pemisah ribuan, jadi satu koma / titik = desimal
   ("2,5" = "2.5"). */
function angkaTarifBm(v) {
  if (v === "" || v == null) return null;
  let n;
  if (typeof v === "number") n = v;
  else {
    const teks = String(v).replace("%", "").trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(teks)) return null;
    n = Number(teks);
  }
  return isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

// Tarif tersimpan barang ini (null = belum ada -> bawaan 5%)
function tarifBmBarang(it) {
  return angkaTarifBm(it && it.dataPabean ? it.dataPabean.tarifBm : null);
}

function pasangTarifBmBarang(it, nilai) {
  if (!it) return;
  const dp = Object.assign({}, it.dataPabean && typeof it.dataPabean === "object" ? it.dataPabean : {});
  if (nilai == null) delete dp.tarifBm;
  else dp.tarifBm = nilai;
  it.dataPabean = dp;
}

/* HS (digit saja) -> tarif terbanyak di Database HS Code. Disusun ulang
   hanya bila isi database berubah (versiHsCode / hsCodeRows baru), sama
   seperti peta lartas (core/lartas.js). */
let petaTarifHsSimpan = { versi: -1, rows: null, peta: new Map() };
function petaTarifHs() {
  const rows = typeof hsCodeRows !== "undefined" ? hsCodeRows : [];
  const versi = typeof versiHsCode !== "undefined" ? versiHsCode : rows.length;
  if (petaTarifHsSimpan.versi === versi && petaTarifHsSimpan.rows === rows) return petaTarifHsSimpan.peta;
  const hitung = new Map(); // hs -> Map(tarif -> jumlah)
  rows.forEach((r) => {
    const kunci = kunciHsTarif(r.hs_code);
    const n = angkaTarifBm(r.tarif_bm);
    if (!kunci || n == null) return;
    if (!hitung.has(kunci)) hitung.set(kunci, new Map());
    const m = hitung.get(kunci);
    m.set(n, (m.get(n) || 0) + 1);
  });
  const peta = new Map();
  hitung.forEach((m, kunci) => peta.set(kunci, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]));
  petaTarifHsSimpan = { versi, rows, peta };
  return peta;
}

function tarifBmDariDatabase(hs) {
  const kunci = kunciHsTarif(hs);
  if (!kunci) return null;
  const tarif = petaTarifHs().get(kunci);
  return tarif == null ? null : { tarif, sumber: "database" };
}

/* HS -> tarif terakhir di jadwal Import lain (tanggal dokumen terbaru
   menang). Disusun sekali per putaran kerja -- satu renderItemTable
   memanggilnya untuk tiap barang -- lalu dibuang di mikrotugas
   berikutnya, jadi jadwal yang baru disimpan langsung terbaca. */
let indeksTarifRiwayatSimpan = null;
function indeksTarifRiwayat(kecualiId) {
  const daftar = typeof data !== "undefined" && data && Array.isArray(data.import) ? data.import : null;
  const simpan = indeksTarifRiwayatSimpan;
  if (simpan && simpan.kecuali === kecualiId && simpan.daftar === daftar && simpan.n === (daftar ? daftar.length : 0)) return simpan.peta;
  const peta = new Map();
  if (daftar) {
    daftar
      .filter((s) => s && s.id !== kecualiId && Array.isArray(s.items))
      .sort((a, b) => String(b.docDate || "").localeCompare(String(a.docDate || "")))
      .forEach((s) => {
        s.items.forEach((it) => {
          if (!it) return;
          const kunci = kunciHsTarif(it.hsCode);
          if (!kunci || peta.has(kunci)) return;
          const n = tarifBmBarang(it);
          if (n != null) peta.set(kunci, { tarif: n, sumber: "riwayat", docNo: s.docNo || "" });
        });
      });
  }
  indeksTarifRiwayatSimpan = { kecuali: kecualiId, daftar, n: daftar ? daftar.length : 0, peta };
  queueMicrotask(() => {
    if (indeksTarifRiwayatSimpan && indeksTarifRiwayatSimpan.peta === peta) indeksTarifRiwayatSimpan = null;
  });
  return peta;
}

function tarifBmDariRiwayat(hs, kecualiId) {
  const kunci = kunciHsTarif(hs);
  if (!kunci) return null;
  return indeksTarifRiwayat(kecualiId).get(kunci) || null;
}

function tarifBmUntukHs(hs, kecualiId) {
  return tarifBmDariDatabase(hs) || tarifBmDariRiwayat(hs, kecualiId);
}

// Id jadwal yang sedang disunting (riwayat tidak membaca dirinya sendiri)
function idJadwalForm() {
  const el = typeof document !== "undefined" && document.getElementById("fId");
  return (el && el.value) || null;
}

/* Satu barang. Hasil: tarifnya berubah. */
function segarkanTarifOtomatis(it, kecualiId) {
  if (!it || activeMode === "export") return false;
  const hs = kunciHsTarif(it.hsCode);
  const auto = it._tarifOtomatis;
  if (auto && auto.hs === hs) return false;
  const kini = tarifBmBarang(it);
  if (!auto && kini != null) return false; // diketik sendiri / tersimpan untuk HS ini
  const hasil = hs ? tarifBmUntukHs(hs, kecualiId === undefined ? idJadwalForm() : kecualiId) : null;
  if (hasil) {
    pasangTarifBmBarang(it, hasil.tarif);
    it._tarifOtomatis = { hs, sumber: hasil.sumber, docNo: hasil.docNo || "" };
  } else {
    if (auto) pasangTarifBmBarang(it, null);
    delete it._tarifOtomatis;
  }
  return kini !== tarifBmBarang(it);
}

/* Kolom `tarif` jadwal lama. 0 = TIDAK DIISI: kotak Tarif yang lama
   menampilkan 0 sebagai kotak kosong dan menghitungnya 5%, dan Bulk
   Import menulis 0 untuk sel TARIF yang kosong. */
function tarifJadwalLama(v) {
  const n = angkaTarifBm(v);
  return n ? n : null;
}

/* Jadwal yang dibuka di form: tarif jadwal lama (kolom `tarif`) turun ke
   barang yang belum bertarif, dan tarif tersimpan ditandai milik HS-nya
   saat itu. Dipanggil sebelum tabel barang digambar. */
function siapkanTarifBarangForm(items, tarifJadwal) {
  const lama = tarifJadwalLama(tarifJadwal);
  (items || []).forEach((it) => {
    if (tarifBmBarang(it) == null && lama != null) pasangTarifBmBarang(it, lama);
    if (tarifBmBarang(it) != null) it._tarifOtomatis = { hs: kunciHsTarif(it.hsCode), sumber: "jadwal" };
  });
}

/* Kolom `tarif` jadwal saat disimpan: tarif bersama bila SEMUA barang
   bertarif sama (jadwal satu HS -- tetap terbaca walau kolom
   data_pabean belum dimigrasi), selain itu kosong. */
function tarifRingkasJadwal(items) {
  const daftar = (items || []).map(tarifBmBarang);
  if (!daftar.length || daftar.some((n) => n == null)) return null;
  return daftar.every((n) => n === daftar[0]) ? daftar[0] : null;
}

/* Tampilan kotak Tarif BM: angka tersimpan, penanda asalnya. */
function judulTarifBm(it) {
  const a = it && it._tarifOtomatis;
  if (!a || tarifBmBarang(it) == null) {
    return tarifBmBarang(it) == null
      ? tt(`Kosong = tarif bawaan ${TARIF_BM_BAWAAN}%. Terisi otomatis bila HS Code-nya punya tarif di Database HS Code.`, `Empty = default rate ${TARIF_BM_BAWAAN}%. Filled automatically when the HS Code has a rate in the HS Code Database.`)
      : tt("Tarif diisi sendiri.", "Rate entered manually.");
  }
  if (a.sumber === "database") return tt("Diisi otomatis dari Database HS Code. Ketik untuk mengganti.", "Filled automatically from the HS Code Database. Type to replace it.");
  if (a.sumber === "riwayat") {
    return tt(
      `Diisi otomatis: tarif terakhir untuk HS Code ini${a.docNo ? ` (jadwal ${a.docNo})` : ""}. Ketik untuk mengganti.`,
      `Filled automatically: the last rate used for this HS Code${a.docNo ? ` (schedule ${a.docNo})` : ""}. Type to replace it.`,
    );
  }
  return tt("Tarif tersimpan di jadwal ini. Ganti HS Code untuk mencari ulang, atau ketik untuk mengganti.", "Rate saved with this schedule. Change the HS Code to look it up again, or type to replace it.");
}

const kelasTarifBm = (it) => {
  const a = it && it._tarifOtomatis;
  return a && (a.sumber === "database" || a.sumber === "riwayat") && tarifBmBarang(it) != null ? "tarif-otomatis" : "";
};

// Sel Tarif BM (%) di tabel/kartu barang -- buku Import saja (.import-col)
function isianTarifBmHtml(it) {
  const label = tt("Tarif BM (%)", "Duty Rate (%)");
  const n = tarifBmBarang(it);
  return `<td class="tarif-col import-col" data-k="tarifBm" data-label="${escapeAttr(label)}"><div class="input-affix input-affix--end" data-affix="%"><input type="text" data-f="tarifBm" value="${n == null ? "" : escapeAttr(formatNumberValue(n) || "0")}" inputmode="decimal" placeholder="${TARIF_BM_BAWAAN}" aria-label="${escapeAttr(label)}" title="${escapeAttr(judulTarifBm(it))}" class="${kelasTarifBm(it)}"></div></td>`;
}

// Tulis ulang kotak Tarif BM satu baris (tanpa menggambar ulang tabel)
function tulisKotakTarifBm(tr, it) {
  const kotak = tr && tr.querySelector('[data-f="tarifBm"]');
  if (!kotak) return;
  const n = tarifBmBarang(it);
  if (document.activeElement !== kotak) kotak.value = n == null ? "" : formatNumberValue(n) || "0";
  kotak.title = judulTarifBm(it);
  kotak.className = kelasTarifBm(it);
}

// HS Code baris ini berubah (diketik / otomatis dari nama): tarifnya dicari ulang
function segarkanTarifBaris(tr, it) {
  const berubah = segarkanTarifOtomatis(it);
  tulisKotakTarifBm(tr, it);
  if (berubah && typeof recalcCustoms === "function") recalcCustoms();
  /* Database HS Code belum termuat (form dibuka langsung): dimuat dulu,
     lalu dicoba sekali lagi -- HS Code yang baru diketik tidak menunggu
     halaman HS Code dibuka. */
  if (!berubah && !it._tarifOtomatis && kunciHsTarif(it.hsCode) && typeof hsCodeRows !== "undefined" && !hsCodeRows.length && typeof hsCodeSiap === "function") {
    hsCodeSiap().then((siap) => {
      if (!siap || !segarkanTarifOtomatis(it)) return;
      const idx = draftItems.indexOf(it);
      const baris = idx >= 0 && document.querySelector(`#itemTableBody tr[data-idx="${idx}"]:not(.item-fac-row)`);
      if (baris) tulisKotakTarifBm(baris, it);
      if (typeof recalcCustoms === "function") recalcCustoms();
    });
  }
}

// Kotak Tarif BM diketik: isian sendiri (kosong = bawaan 5%)
function ketikTarifBm(el, it) {
  const teks = String(el.value || "").trim();
  delete it._tarifOtomatis;
  const n = teks === "" ? null : angkaTarifBm(teks);
  pasangTarifBmBarang(it, n);
  el.className = teks !== "" && n == null ? "fl-rumus-salah" : "";
  el.title = teks !== "" && n == null ? tt("Tarif harus angka 0–100.", "The rate must be a number from 0–100.") : judulTarifBm(it);
}

/* Tarif BM yang BERLAKU untuk satu barang jadwal tersimpan: tarifnya
   sendiri, tarif jadwal lama (kolom `tarif`), atau bawaan 5% -- urutan
   yang sama dengan hitungPungutanFasilitas (core/customs.js). */
function tarifBmBerlaku(it, s) {
  const sendiri = tarifBmBarang(it);
  if (sendiri != null) return sendiri;
  const lama = tarifJadwalLama(s && s.tarif);
  return lama != null ? lama : TARIF_BM_BAWAAN;
}

// Ringkasan panel detail: "5%" atau "5% · 10%" (tarif berbeda per barang)
function ringkasTarifBm(s) {
  const daftar = [...new Set(((s && s.items) || []).map((it) => tarifBmBerlaku(it, s)))].sort((a, b) => a - b);
  if (!daftar.length) daftar.push(tarifBmBerlaku(null, s));
  const teks = daftar.map((n) => `${formatNumberValue(n) || "0"}%`).join(" · ");
  return daftar.length > 1 ? `${teks} ${tt("(per barang)", "(per item)")}` : teks;
}
