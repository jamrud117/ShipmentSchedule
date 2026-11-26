/* ==================================================================
   OCR YANG BELAJAR DARI PENGAJUAN YANG SUDAH DISIMPAN
   (modul tunda, sesudah fund-invoice-import.js)

   Setiap Pengajuan Dana yang disimpan sudah DIPERIKSA pengguna: ejaan
   uraian yang dibetulkan, tarif PPN yang dipilih, nomor invoice yang
   diketik ulang. Itu bahan belajar yang paling jujur -- dan sudah ada di
   Supabase (document_numbers). Tidak perlu server, tabel, atau model
   tambahan: pengetahuannya DISUSUN DI PERAMBAN dari daftar Pengajuan Dana
   yang memang dimuat aplikasi (bkAmbilDana), per vendor:

     uraian     ejaan yang dipakai pengguna (yang tersering) + tarif PPN &
                nilai yang biasa untuk uraian itu;
     nomor      bentuk nomor invoice vendor itu ("IN-WL2611-00037" ->
                AA-AA9999-99999);
     tempo      jarak Tanggal Invoice -> Jatuh Tempo (hari).

   Semakin banyak invoice vendor yang diunggah & disimpan, semakin banyak
   yang dikenali. Hasil baca BARU (OCR maupun PDF digital) dibetulkan hanya
   bila pengetahuannya meyakinkan, dan setiap perbaikan disebut (h.belajar)
   -- di pop-up review Split Invoice dan di pemberitahuan Merge:

     1. Uraian: kunci tanpa tanda baca / huruf besar sama persis
        ("PIB Charge" = "P.I.B Charge"), atau sama sesudah noda 1-3 huruf di
        depannya dibuang ("M Trucking Charge"), atau sangat mirip (jarak
        suntingan <= 15% dan satu-satunya calon) -> ejaan yang dipakai pengguna.
     2. Nilai: hasil baca yang jumlahnya TIDAK cocok dengan baris TOTAL
        invoice -- satu baris diganti nilai yang biasa untuk uraiannya
        (sedikitnya 3 kali, >= 60%) bila itu membuat jumlah DPP tepat sama
        dengan TOTAL; tepat satu calon, selebihnya tidak ditebak.
     3. Tarif PPN: baris yang bacaannya belum yakin (hitungan barisnya tidak
        membenarkan) dan hasil baca tidak cocok -> tarif yang SELALU dipakai
        untuk uraian itu (sedikitnya 3 kali, 100%).
     4. Nomor invoice: tidak cocok bentuk vendor itu tetapi cocok sesudah
        huruf / angka yang mirip ditukar (O/0, I/1, S/5, B/8) -> dibetulkan.
     5. Jatuh tempo kosong: tanggal invoice + tempo yang hampir selalu sama
        (sedikitnya 3 kali, >= 80%).
================================================================== */

let belajarCache = null; // { tanda, peta: Map(kunciVendor -> pengetahuan) }

const BELAJAR_MIN = 3;
const belajarKunciUraian = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
const belajarMasker = (s) => String(s || "").toUpperCase().replace(/[0-9]/g, "9").replace(/[A-Z]/g, "A");

function belajarTambah(peta, k, v) {
  peta.set(k, (peta.get(k) || 0) + (v || 1));
}
function belajarTerbanyak(peta) {
  let pilih = null, n = 0, jumlah = 0;
  peta.forEach((v, k) => {
    jumlah += v;
    if (v > n) { n = v; pilih = k; }
  });
  return { nilai: pilih, n, jumlah, bagian: jumlah ? n / jumlah : 0 };
}

/* Daftar Pengajuan Dana -> pengetahuan per vendor */
function belajarSusun(rows) {
  const peta = new Map();
  (rows || []).forEach((r) => {
    const p = (r && r.payload) || {};
    const vendor = danaKunciVendor(p.payee);
    if (!vendor) return;
    if (!peta.has(vendor)) peta.set(vendor, { contoh: 0, uraian: new Map(), nomor: new Map(), tempo: new Map() });
    const v = peta.get(vendor);
    v.contoh++;
    const tambahNomor = (no) => {
      const n = String(no || "").trim();
      if (n.length >= 4) belajarTambah(v.nomor, belajarMasker(n));
    };
    tambahNomor(p.invoiceNo);
    (Array.isArray(p.dokumen) ? p.dokumen : []).forEach((d) => tambahNomor(d && d.nomor));
    if (p.invoiceDate && p.invoiceDueDate) {
      const hari = Math.round((Date.parse(p.invoiceDueDate) - Date.parse(p.invoiceDate)) / 86400000);
      if (isFinite(hari) && hari >= 0 && hari <= 180) belajarTambah(v.tempo, hari);
    }
    (Array.isArray(p.lines) ? p.lines : []).forEach((b) => {
      if (!b || b.jenis === "diskon") return;
      const teks = String(b.desc || "").trim();
      const k = belajarKunciUraian(teks);
      if (k.length < 3) return;
      if (!v.uraian.has(k)) v.uraian.set(k, { ejaan: new Map(), tarif: new Map(), nilai: new Map() });
      const u = v.uraian.get(k);
      belajarTambah(u.ejaan, teks);
      belajarTambah(u.tarif, Number(b.ppnRate) || 0);
      const nilai = typeof b.amount === "number" ? b.amount : parseRupiah(b.amount);
      if (nilai > 0) belajarTambah(u.nilai, Math.round(nilai * 100) / 100);
    });
  });
  return peta;
}

/* Pengetahuan semua vendor, disusun ulang hanya bila daftarnya berubah */
async function belajarPengetahuan() {
  let rows = null;
  try {
    rows = typeof bkAmbilDana === "function" ? await bkAmbilDana() : null;
  } catch (e) {
    rows = null;
  }
  if (!Array.isArray(rows) || !rows.length) return null;
  const tanda = `${rows.length}|${rows.reduce((x, r) => (String((r && (r.updated_at || r.created_at)) || "") > x ? String(r.updated_at || r.created_at) : x), "")}`;
  if (!belajarCache || belajarCache.tanda !== tanda) belajarCache = { tanda, peta: belajarSusun(rows) };
  return belajarCache.peta;
}

/* Jarak suntingan (Levenshtein) dibatasi -- berhenti begitu melewati `batas` */
function belajarJarak(a, b, batas) {
  if (Math.abs(a.length - b.length) > batas) return batas + 1;
  let sebelum = Array.from({ length: b.length + 1 }, (x, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const kini = [i];
    let terkecil = i;
    for (let j = 1; j <= b.length; j++) {
      kini[j] = Math.min(sebelum[j] + 1, kini[j - 1] + 1, sebelum[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (kini[j] < terkecil) terkecil = kini[j];
    }
    if (terkecil > batas) return batas + 1;
    sebelum = kini;
  }
  return sebelum[b.length];
}

/* Uraian hasil baca -> { kunci, teks } yang dikenal vendor itu, atau null */
function belajarCariUraian(v, desc) {
  const asli = String(desc || "").trim();
  const k = belajarKunciUraian(asli);
  if (k.length < 3) return null;
  const kenal = (kunci) => {
    const u = v.uraian.get(kunci);
    return u ? { kunci, teks: belajarTerbanyak(u.ejaan).nilai } : null;
  };
  if (v.uraian.has(k)) return kenal(k);
  // noda 1-3 huruf / tanda di depan ("M Trucking Charge", "fi Clearence Charge")
  const tanpaNoda = asli.replace(/^[^A-Za-z0-9(]*[A-Za-z]{1,3}[^A-Za-z0-9(]+/, "");
  if (tanpaNoda !== asli && v.uraian.has(belajarKunciUraian(tanpaNoda))) return kenal(belajarKunciUraian(tanpaNoda));
  // sangat mirip: satu-satunya calon dengan jarak <= 15% panjangnya
  const batas = Math.max(1, Math.floor(k.length * 0.15));
  let pilih = null;
  let jarakPilih = batas + 1;
  let kembar = false;
  v.uraian.forEach((u, kunci) => {
    const j = belajarJarak(k, kunci, batas);
    if (j < jarakPilih) {
      pilih = kunci;
      jarakPilih = j;
      kembar = false;
    } else if (j === jarakPilih && j <= batas) kembar = true;
  });
  return pilih && !kembar ? kenal(pilih) : null;
}

/* Satu hasil baca dibetulkan dengan pengetahuan vendornya. Mengubah `h` di
   tempat; perbaikannya dicatat di h.belajar = [{ jenis, teks }]. */
function belajarBetulkan(h, peta) {
  if (!h || !peta || h.jenisDokumen === "billing") return [];
  const v = peta.get(danaKunciVendor(h.payee));
  if (!v || v.contoh < 1) return [];
  const catat = [];
  const uang = (n) => (typeof frNilai === "function" ? frNilai(n, h.currency || "IDR") : fmtRp(n));
  const lines = Array.isArray(h.lines) ? h.lines : [];
  const info = Array.isArray(h.infoBaris) ? h.infoBaris : [];
  const nama = h.payee;

  // 1. Ejaan uraian
  const kunciBaris = lines.map((l) => {
    const ketemu = belajarCariUraian(v, l.desc);
    if (ketemu && ketemu.teks && ketemu.teks !== String(l.desc || "").trim()) {
      catat.push({ jenis: "uraian", teks: tt(`Uraian "${l.desc}" → "${ketemu.teks}" (ejaan di pengajuan ${nama} sebelumnya).`, `Description "${l.desc}" → "${ketemu.teks}" (as spelled in earlier ${nama} requests).`) });
      l.desc = ketemu.teks;
    }
    return ketemu ? ketemu.kunci : "";
  });

  const angka = (l) => (typeof l.amount === "number" ? l.amount : danaAngka(l.amount));
  const tidakCocok = h.cocok === false;

  // 2. Nilai yang biasa: hanya bila hasil baca tidak cocok & baris TOTAL meyakinkan
  if (tidakCocok && h.ringkasan && h.ringkasan.dpp > 0) {
    const jumlah = lines.reduce((x, l) => x + (l.jenis === "diskon" ? -1 : 1) * angka(l), 0);
    const calon = [];
    lines.forEach((l, i) => {
      if (l.jenis === "diskon" || !kunciBaris[i]) return;
      const t0 = belajarTerbanyak(v.uraian.get(kunciBaris[i]).nilai);
      if (t0.n < BELAJAR_MIN || t0.bagian < 0.6 || Math.abs(t0.nilai - angka(l)) < 0.5) return;
      if (Math.abs(jumlah - angka(l) + t0.nilai - h.ringkasan.dpp) <= 1) calon.push({ i, dari: angka(l), ke: t0.nilai });
    });
    if (calon.length === 1) {
      const c = calon[0];
      lines[c.i].amount = typeof lines[c.i].amount === "number" ? c.ke : String(c.ke);
      catat.push({ jenis: "nilai", teks: tt(`Nilai ${lines[c.i].desc} ${uang(c.dari)} → ${uang(c.ke)}: nilai yang biasa di ${nama} dan membuat jumlahnya sama dengan TOTAL invoice.`,
        `Amount of ${lines[c.i].desc} ${uang(c.dari)} → ${uang(c.ke)}: the usual ${nama} amount, and it makes the sum match the invoice TOTAL.`) });
    }
  }

  // 3. Tarif PPN yang selalu sama untuk uraian itu (baris yang bacaannya belum yakin)
  if (tidakCocok) {
    lines.forEach((l, i) => {
      if (!kunciBaris[i] || (info[i] && info[i].yakin)) return;
      const t0 = belajarTerbanyak(v.uraian.get(kunciBaris[i]).tarif);
      if (t0.n < BELAJAR_MIN || t0.bagian < 1 || Number(l.ppnRate) === t0.nilai) return;
      catat.push({ jenis: "tarif", teks: tt(`Tarif PPN ${l.desc} ${String(l.ppnRate).replace(".", ",")}% → ${String(t0.nilai).replace(".", ",")}% (selalu begitu di ${nama}).`,
        `VAT rate of ${l.desc} ${l.ppnRate}% → ${t0.nilai}% (always so at ${nama}).`) });
      l.ppnRate = t0.nilai;
    });
  }

  // 4. Bentuk nomor invoice vendor
  const no = String(h.invoiceNo || "").trim();
  const bentuk = belajarTerbanyak(v.nomor);
  if (no && bentuk.n >= BELAJAR_MIN && bentuk.bagian >= 0.8 && belajarMasker(no) !== bentuk.nilai && no.length === bentuk.nilai.length) {
    const jadiAngka = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", S: "5", B: "8", Z: "2", G: "6" };
    const jadiHuruf = { 0: "O", 1: "I", 5: "S", 8: "B", 2: "Z", 6: "G" };
    const baru = no.toUpperCase().split("").map((c, i) => {
      const m = bentuk.nilai[i];
      if (m === "9" && !/\d/.test(c)) return jadiAngka[c] || c;
      if (m === "A" && !/[A-Z]/.test(c)) return jadiHuruf[c] || c;
      return c;
    }).join("");
    if (belajarMasker(baru) === bentuk.nilai && baru !== no) {
      catat.push({ jenis: "nomor", teks: tt(`Nomor invoice ${no} → ${baru} (bentuk nomor ${nama}).`, `Invoice number ${no} → ${baru} (${nama}'s number format).`) });
      h.invoiceNo = baru;
    }
  }

  // 5. Jatuh tempo dari tempo yang biasa
  if (!h.invoiceDueDate && h.invoiceDate) {
    const tempo = belajarTerbanyak(v.tempo);
    if (tempo.n >= BELAJAR_MIN && tempo.bagian >= 0.8) {
      const d = new Date(Date.parse(h.invoiceDate) + tempo.nilai * 86400000);
      if (!isNaN(d)) {
        h.invoiceDueDate = d.toISOString().slice(0, 10);
        catat.push({ jenis: "tempo", teks: tt(`Jatuh tempo diisi ${tempo.nilai} hari sesudah tanggal invoice (tempo ${nama} yang biasa).`, `Due date set ${tempo.nilai} days after the invoice date (${nama}'s usual term).`) });
      }
    }
  }

  if (catat.length) {
    h.belajar = (h.belajar || []).concat(catat);
    h.belajarDari = v.contoh;
    // Jumlah dihitung ulang dengan rincian yang sudah dibetulkan (sama seperti bacaInvoiceVendor)
    const tl = fundLineTotals(lines, h.currency, h.payee);
    h.dpp = tl.totalNet;
    h.ppn = tl.totalPpn;
    if (h.totalInvoice) h.cocok = Math.abs(h.dpp + h.ppn - (h.pphInvoice || 0) - h.totalInvoice) <= Math.max(2, lines.length);
  }
  return catat;
}

/* Semua hasil baca satu unggahan (danaDariBerkasPdf). Gagal memuat daftar =
   tanpa belajar, hasil baca apa adanya. */
async function belajarTerapkan(dokumen) {
  if (!Array.isArray(dokumen) || !dokumen.length) return 0;
  let peta = null;
  try {
    peta = await belajarPengetahuan();
  } catch (e) {
    peta = null;
  }
  if (!peta) return 0;
  let n = 0;
  dokumen.forEach((h) => { n += belajarBetulkan(h, peta).length; });
  return n;
}

/* Kalimat pemberitahuan (impor Merge): "Dipelajari dari 12 pengajuan ...: 3 perbaikan" */
function belajarPesan(dokumen) {
  const semua = (dokumen || []).filter((h) => h.belajar && h.belajar.length);
  if (!semua.length) return "";
  const n = semua.reduce((x, h) => x + h.belajar.length, 0);
  const dari = Math.max(...semua.map((h) => h.belajarDari || 0));
  return tt(`Dibetulkan dari ${dari} pengajuan sebelumnya (${n} perbaikan): ${semua.flatMap((h) => h.belajar.map((b) => b.teks)).join(" ")}`,
    `Corrected using ${dari} earlier request${dari === 1 ? "" : "s"} (${n} fix${n === 1 ? "" : "es"}): ${semua.flatMap((h) => h.belajar.map((b) => b.teks)).join(" ")}`);
}
