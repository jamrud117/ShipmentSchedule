"use strict";

/* ------------------------------------------------------------------
   RINCIAN BIAYA PENGAJUAN DANA (format rinci)

   Dipakai untuk jenis pengeluaran SELAIN Billing. Bentuknya tabel:
   tiap baris punya uraian, nilai, dan tarif PPN sendiri — karena dalam
   satu tagihan forwarder biasanya ada pos yang dipungut PPN
   (freight, handling) dan ada yang tidak (storage).

   Untuk jenis Billing, formatnya tetap yang lama (Bea Masuk / PPN /
   PPH sebagai tiga kotak), karena tagihan bea cukai memang cuma tiga
   pos itu.
------------------------------------------------------------------ */

/* Tarif PPN yang dipakai di lapangan. 1,1% berlaku untuk jasa
   pengurusan transportasi (nilai lain 11% x 10% dari peredaran),
   11% untuk jasa biasa. 0 berarti pos itu memang tidak dipungut. */
const FUND_PPN_RATES = [0, 1.1, 11];

/* Potongan PPH 23 atas jasa. Tarifnya tetap 2%.

   DASARNYA NILAI BARIS, BUKAN PPN-nya. Untuk Agency Fee 150.000
   dengan PPN 1.1% (1.650), PPH dihitung dari 150.000 — bukan dari
   1.650. Dan hanya baris yang DIPUNGUT PPN yang ikut dihitung:
   pos tanpa PPN (storage) di luar objek PPH 23 ini. */
const FUND_PPH23_RATE = 2;

/* PEMBACA NILAI RUPIAH — konvensi Indonesia: titik ribuan, koma
   desimal ("16.873.095,68").

   parseLooseNumber() milik aplikasi memakai konvensi sebaliknya (koma
   ribuan, titik desimal), jadi "256,66666" terbaca 25.666.666 di sana.
   Tagihan forwarder yang diketik ulang di sini ditulis gaya Indonesia,
   dan angkanya berdesimal, sehingga salah baca langsung menghasilkan
   total yang meleset ribuan kali lipat. */
function parseRupiah(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  // Rumus yang belum dihitung ("=1000+") bukan angka -- jangan dibaca
  // sebagian ("1000") seolah-olah nilainya.
  if (/^\s*=/.test(String(v))) return 0;
  const bersih = String(v)
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(bersih);
  return isFinite(n) ? n : 0;
}

/* Tampilan balik: "16.873.095,68". Desimal ditulis hanya kalau memang
   ada -- angka bulat tidak diberi ",00" supaya tabelnya tidak penuh nol
   yang tidak berarti. */
function formatRupiah(n) {
  const x = Number(n) || 0;
  const desimal = Math.round(x * 100) % 100 !== 0;
  return x.toLocaleString("id-ID", {
    minimumFractionDigits: desimal ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/* FORMAT KETIKAN NOMINAL, gaya Indonesia: titik ribuan, koma desimal.
     "133434343" -> "133.434.343"     "420,5" -> "420,5"

   BUKAN formatNumberTyping() milik aplikasi: yang itu menulis gaya
   Inggris (koma ribuan), sementara nominal di sini dibaca parseRupiah()
   yang memperlakukan koma sebagai DESIMAL -- "133,434,343" akan
   terbaca 133,43. Titik yang diketik pengguna dibuang lalu disusun
   ulang: di konvensi ini titik hanyalah pemisah ribuan. Desimal
   dibatasi dua angka (sen). */
function formatRupiahKetik(mentah) {
  if (typeof mentah === "number") {
    return isFinite(mentah) && mentah !== 0 ? formatRupiah(mentah) : "";
  }
  const teks = String(mentah == null ? "" : mentah);
  const negatif = /^\s*-/.test(teks);
  const s = teks.replace(/[^\d,]/g, "");
  if (!s) return negatif ? "-" : "";
  const koma = s.indexOf(",");
  let bulat = koma >= 0 ? s.slice(0, koma) : s;
  bulat = bulat.replace(/^0+(?=\d)/, "");
  const berkelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const hasil = koma >= 0
    ? `${berkelompok || "0"},${s.slice(koma + 1).replace(/,/g, "").slice(0, 2)}`
    : berkelompok;
  return (negatif ? "-" : "") + hasil;
}

/* RUMUS YANG SEDANG DIKETIK ikut diberi titik ribuan, per angkanya:
     "=1000000+250000*2"  ->  "=1.000.000+250.000*2"
   Operator, kurung, dan persen tidak diubah. Bagian desimal (sesudah
   koma) ditulis apa adanya -- di dalam rumus boleh lebih dari dua angka.
   Titik yang diketik sendiri dibuang lalu disusun ulang, sama seperti
   kotak nominal biasa: di konvensi ini titik hanya pemisah ribuan, dan
   hitungRumus() membacanya dengan cara yang sama. */
function formatRumusKetik(teks) {
  return String(teks == null ? "" : teks).replace(/\d[\d.]*(?:,\d*)?/g, (angka) => {
    const koma = angka.indexOf(",");
    const bulat = (koma >= 0 ? angka.slice(0, koma) : angka).replace(/\./g, "").replace(/^0+(?=\d)/, "");
    const berkelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return koma >= 0 ? berkelompok + angka.slice(koma) : berkelompok;
  });
}

/* Kursor tetap di antara karakter yang sama setelah titik ribuan
   disisipkan atau dipindah -- dihitung dari jumlah karakter BUKAN titik
   di kirinya (angka & koma; untuk rumus juga operatornya), bukan dari
   posisi karakter yang bergeser tiap kali titik bertambah. */
function formatKotakRupiah(el) {
  const sebelum = el.value;
  const rumus = /^\s*=/.test(sebelum);
  const berarti = rumus ? /[^.]/ : /[\d,]/;
  const kiri = [...sebelum.slice(0, el.selectionStart || 0)].filter((c) => berarti.test(c)).length;
  const sesudah = rumus ? formatRumusKetik(sebelum) : formatRupiahKetik(sebelum);
  if (sesudah === sebelum) return;
  el.value = sesudah;
  let pos = sesudah.length;
  if (kiri === 0) pos = !rumus && /^-/.test(sesudah) ? 1 : 0;
  else {
    for (let i = 0, n = 0; i < sesudah.length; i++) {
      if (berarti.test(sesudah[i]) && ++n === kiri) { pos = i + 1; break; }
    }
  }
  try { el.setSelectionRange(pos, pos); } catch (err) { /* kotak tanpa kursor */ }
}

function fundLineAmount(baris) {
  return parseRupiah(baris && baris.amount);
}

function fundLineRate(baris) {
  const r = parseLooseNumber(baris && baris.ppnRate);
  return FUND_PPN_RATES.includes(r) ? r : 0;
}

/* ------------------------------------------------------------------
   RUMUS DI KOTAK NILAI

   Kotak nilai yang diawali "=" dihitung saat Enter atau saat pindah
   kotak, seperti sel spreadsheet:
     =1.000+1.000        -> 2.000
     =(1.500+500)*3      -> 6.000
     =2.200.000*10%      -> 220.000
     =10.000/4           -> 2.500
   Operator: + - * / (juga x, ×, :, ÷), kurung, dan % (= dibagi 100).
   Angkanya gaya Indonesia seperti isian lainnya: titik ribuan, koma
   desimal.

   Dihitung dengan pengurai sendiri, BUKAN eval(): isi kotak adalah
   ketikan bebas, dan eval() akan menjalankannya sebagai kode.
------------------------------------------------------------------ */
function hitungRumus(teks) {
  const s = String(teks == null ? "" : teks)
    .trim()
    .replace(/^=/, "")
    .replace(/\s+/g, "")
    .replace(/[x×X]/g, "*")
    .replace(/[:÷]/g, "/");
  if (!s) return NaN;
  let i = 0;
  const gagal = () => { throw new Error("rumus"); };
  function angka() {
    const m = /^(\d[\d.]*)(,\d+)?/.exec(s.slice(i));
    if (!m) gagal();
    i += m[0].length;
    return Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2].slice(1) : ""));
  }
  function faktor() {
    if (s[i] === "-") { i++; return -faktor(); }
    if (s[i] === "+") { i++; return faktor(); }
    let v;
    if (s[i] === "(") {
      i++;
      v = jumlah();
      if (s[i] !== ")") gagal();
      i++;
    } else {
      v = angka();
    }
    if (s[i] === "%") { i++; v /= 100; }
    return v;
  }
  function kali() {
    let v = faktor();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = faktor();
      if (op === "/") { if (r === 0) gagal(); v /= r; } else v *= r;
    }
    return v;
  }
  function jumlah() {
    let v = kali();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = kali();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = jumlah();
    return i === s.length && isFinite(v) ? v : NaN;
  } catch (err) {
    return NaN;
  }
}

const adalahRumus = (v) => /^\s*=/.test(String(v == null ? "" : v));

/* Menghitung rumus di satu kotak. true = kotaknya kini berisi angka
   (atau memang bukan rumus); false = rumusnya tidak valid -- kotak
   ditandai merah dan teksnya dibiarkan supaya bisa diperbaiki. */
function terapkanRumusKotak(el, persen) {
  if (!adalahRumus(el.value)) {
    el.classList.remove("fl-rumus-salah");
    el.removeAttribute("title");
    return true;
  }
  const hasil = hitungRumus(el.value);
  if (!isFinite(hasil)) {
    el.classList.add("fl-rumus-salah");
    el.title = tt(
      "Rumus tidak valid. Contoh: =1.000+500, =2.200.000*10%, =(1.000+500)/2",
      "Invalid formula. Examples: =1.000+500, =2.200.000*10%, =(1.000+500)/2",
    );
    return false;
  }
  el.classList.remove("fl-rumus-salah");
  el.removeAttribute("title");
  const bulat = Math.round(hasil * 100) / 100;
  el.value = persen
    ? String(bulat).replace(".", ",")
    : bulat === 0 ? "0" : formatRupiahKetik(bulat);
  return true;
}

/* ------------------------------------------------------------------
   DISKON SEBAGAI BARIS SENDIRI

   Diskon ditulis sebagai baris rincian tersendiri (mis. "Base
   Discount") yang nilainya MENGURANGI, bukan menambah -- persis seperti
   di tagihan forwarder. Nilainya rupiah langsung, atau PERSEN dari pos
   BIAYA terdekat di atasnya (jadi letakkan baris diskon tepat di bawah
   pos yang didiskon).

   Baris diskon punya tarif PPN sendiri, dan tarif itu MENGURANGI PPN:
   diskon 1.987.451 bertarif 1,1% memotong PPN 21.862. Hasilnya sama
   persis dengan PPN yang dihitung dari nilai setelah diskon -- cara
   tagihan berdiskon dihitung. Bawaannya mengikuti tarif pos di atasnya;
   "—" berarti diskon itu tidak mengurangi dasar pajak. Dasar PPH 23
   ikut berkurang dengan cara yang sama.
------------------------------------------------------------------ */
const FUND_JENIS_DISKON = "diskon";
const barisDiskon = (b) => !!b && b.jenis === FUND_JENIS_DISKON;

function parsePersenDiskon(v) {
  if (adalahRumus(v)) return 0;
  const n = parseFloat(String(v == null ? "" : v).replace(",", ".").replace(/[^\d.]/g, ""));
  return isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
}

/* Data dengan model diskon LAMA -- kolom diskon di setiap pos, sempat
   dipakai sebentar -- dipecah jadi pos + baris diskon tepat di
   bawahnya. Totalnya tidak berubah: tarif PPN baris diskonnya sama
   dengan posnya, dan diskon persen dihitung dari pos yang sama. */
function normalisasiBarisDana(lines) {
  const hasil = [];
  (Array.isArray(lines) ? lines : []).forEach((b) => {
    if (!b) return;
    if (barisDiskon(b)) {
      hasil.push(b);
      return;
    }
    const { disc, discType, ...pos } = b;
    hasil.push(pos);
    if (String(disc == null ? "" : disc).trim() !== "" && parseRupiah(disc) !== 0) {
      hasil.push({
        jenis: FUND_JENIS_DISKON,
        desc: "Diskon",
        amount: String(disc),
        discType: discType === "rp" ? "rp" : "pct",
        ppnRate: pos.ppnRate,
      });
    }
  });
  return hasil;
}

/* Nilai rupiah BERTANDA setiap baris: pos biaya positif, diskon
   negatif. Diskon persen butuh pos di atasnya, jadi dihitung berurutan
   untuk seluruh tabel, bukan per baris. */
function fundLineValues(lines) {
  let dasar = 0;
  return (Array.isArray(lines) ? lines : []).map((b) => {
    if (!barisDiskon(b)) {
      const v = fundLineAmount(b);
      dasar = v;
      return v;
    }
    const v = b.discType === "pct"
      ? Math.round((dasar * parsePersenDiskon(b.amount)) / 100)
      : Math.abs(parseRupiah(b.amount));
    return v ? -v : 0;
  });
}

// PPN dari nilai bertanda sebuah baris (negatif untuk diskon).
function fundLinePpnNilai(nilai, baris) {
  const p = Math.round((nilai * fundLineRate(baris)) / 100);
  return p === 0 ? 0 : p;
}

// PPN sebuah pos BIAYA, dibulatkan ke rupiah penuh seperti di tagihan.
function fundLinePpn(baris) {
  return barisDiskon(baris) ? 0 : fundLinePpnNilai(fundLineAmount(baris), baris);
}

/* PPN PER BARIS -- dengan KELOMPOK PEMBULATAN.

   Biasanya tiap baris dibulatkan sendiri (seperti tagihan forwarder,
   yang menulis PPN per baris). Baris ber-grupPpn sama -- komponen satu
   AWB FedEx: freight, diskon, surcharge -- dibulatkan SEKALI dari
   jumlahnya, persis cara vendor itu menghitung PPN-nya, lalu dibagikan
   lagi ke tiap baris (sisa pembulatan terbesar dulu). Kolom PPN per
   baris tetap menjumlah tepat ke total, dan totalnya sama dengan
   invoice sampai rupiah terakhir. */
function fundLinePpnDaftar(daftar, nilai) {
  const hasil = daftar.map((b, i) => fundLinePpnNilai(nilai[i], b));
  const grup = new Map();
  daftar.forEach((b, i) => {
    const g = String((b && b.grupPpn) || "").trim();
    if (!g) return;
    const k = g + "|" + fundLineRate(b);
    if (!grup.has(k)) grup.set(k, []);
    grup.get(k).push(i);
  });
  grup.forEach((idx) => {
    if (idx.length < 2) return;
    const tarif = fundLineRate(daftar[idx[0]]);
    const mentah = idx.map((i) => (nilai[i] * tarif) / 100);
    let selisih = Math.round(mentah.reduce((x, y) => x + y, 0)) - idx.reduce((x, i) => x + hasil[i], 0);
    const urut = idx
      .map((i, j) => ({ i, sisa: mentah[j] - hasil[i] }))
      .sort((a, b) => (selisih > 0 ? b.sisa - a.sisa : a.sisa - b.sisa));
    for (let n = 0; selisih !== 0 && n < urut.length * 2; n++) {
      const x = urut[n % urut.length];
      const langkah = selisih > 0 ? 1 : -1;
      hasil[x.i] += langkah;
      selisih -= langkah;
    }
  });
  return hasil.map((v) => (v === 0 ? 0 : v));
}

/* Seluruh angka lembar rincian, dihitung dari satu tempat supaya form
   dan surat cetak tidak mungkin menampilkan total yang berbeda. */
function fundLineTotals(lines) {
  const daftar = normalisasiBarisDana(lines);
  const nilai = fundLineValues(daftar);
  const ppnBaris = fundLinePpnDaftar(daftar, nilai);
  let totalNilai = 0;
  let totalDiskon = 0;
  let totalPpn = 0;
  let dppPph = 0;
  daftar.forEach((b, i) => {
    const v = nilai[i];
    if (v >= 0) totalNilai += v;
    else totalDiskon -= v;
    totalPpn += ppnBaris[i];
    // Hanya baris yang dipungut PPN yang masuk dasar PPH 23 -- dengan
    // nilai bertandanya, jadi diskon ikut mengurangi dasarnya.
    if (fundLineRate(b) > 0) dppPph += v;
  });
  const totalNet = Math.round(totalNilai) - totalDiskon;
  const pph = Math.max(0, Math.round((dppPph * FUND_PPH23_RATE) / 100));
  return {
    totalNilai: Math.round(totalNilai), // pos biaya, SEBELUM diskon
    totalDiskon,
    totalNet, // setelah diskon, sebelum pajak
    totalPpn,
    dppPph: Math.round(dppPph),
    pph,
    /* PPH 23 MEMOTONG, bukan menambah: ia dipungut pemberi kerja dan
       disetor atas nama penyedia jasa, jadi yang dibayarkan ke
       forwarder sudah dikurangi angka itu. */
    grandTotal: totalNet + totalPpn - pph,
  };
}

/* ==================================================================
   TAGIHAN PER BL/AWB

   Satu invoice forwarder kerap menagih BEBERAPA kiriman sekaligus (dua
   AWB dalam satu invoice). Kalau seluruh nilainya ditautkan ke setiap
   AWB, biaya per kiriman jadi dobel: kiriman A ikut menanggung ongkos
   kiriman B.

   Tiap baris rincian bisa ditautkan ke SATU BL/AWB (`awb`, kolom BL/AWB
   di tabel rincian -- muncul begitu isian BL/AWB memuat dua nomor atau
   lebih). Baris tanpa tautan -- juga pengajuan lama dan jenis Billing --
   DIBAGI RATA ke semua BL/AWB pengajuan itu. Baris diskon tanpa tautan
   mengikuti pos di atasnya, sama seperti diskon persennya.

   Bagian tiap BL/AWB menjumlah TEPAT ke total pengajuan (sisa
   pembulatan ke bagian terbesar), jadi biaya per kiriman tidak pernah
   dobel dan tidak ada rupiah yang hilang.
================================================================== */
const fundKunciAwb = (x) => String(x == null ? "" : x).toUpperCase().replace(/[^A-Z0-9]/g, "");

/* "8771 4421 8723 / 877334611529" -> [{ kunci: "877144218723",
   teks: "8771 4421 8723" }, { ... }]. Pemisahnya "/", koma, titik koma,
   "|" atau baris baru; spasi DI DALAM satu nomor bukan pemisah. Nomor
   yang sama (beda tulisan) dihitung sekali. */
function fundDaftarAwb(teks) {
  const hasil = [];
  const ada = new Set();
  String(teks == null ? "" : teks)
    .split(/[\/,;|\r\n]+/)
    .forEach((x) => {
      const tampil = x.replace(/\s+/g, " ").trim();
      const kunci = fundKunciAwb(tampil);
      if (!kunci || ada.has(kunci)) return;
      ada.add(kunci);
      hasil.push({ kunci, teks: tampil });
    });
  return hasil;
}

/* Komponen total satu pengajuan, dalam mata uangnya sendiri. Format
   tanpa rincian per baris (Billing, format lama) tidak punya PPN/PPh
   terpisah: seluruhnya dpp = dibayar. */
function fundTotalKomponen(p) {
  const d = p || {};
  if (Array.isArray(d.lines) && d.lines.length) {
    const jumlah = fundLineTotals(d.lines);
    return { dpp: jumlah.totalNet, ppn: jumlah.totalPpn, pph: jumlah.pph, dibayar: jumlah.grandTotal };
  }
  const total = typeof frTotalPengajuan === "function" ? frTotalPengajuan(d) : 0;
  return { dpp: total, ppn: 0, pph: 0, dibayar: total };
}

/* Membulatkan bagian-bagian supaya jumlahnya TEPAT `target` (metode
   sisa terbesar): tiap bagian dibulatkan ke bawah, lalu rupiah yang
   tersisa diberikan satu-satu ke bagian dengan pecahan terbesar --
   kalau sama, ke bagian yang lebih besar, lalu ke yang terakhir.
   Pembagian rata 301 / 3 = 100 + 100 + 101. */
function fundBulatkanBagian(mentah, target) {
  const bulat = mentah.map((v) => Math.floor(v));
  let sisa = Math.round(target) - bulat.reduce((x, v) => x + v, 0);
  if (!bulat.length) return bulat;
  const urut = mentah
    .map((v, i) => ({ i, pecahan: v - Math.floor(v), v }))
    .sort((a, b) => b.pecahan - a.pecahan || b.v - a.v || b.i - a.i);
  for (let n = 0; sisa > 0; n++, sisa--) bulat[urut[n % urut.length].i] += 1;
  // Total yang lebih kecil dari jumlah pembulatan ke bawah (sen): dikurangi dari pecahan terkecil
  for (let n = 0; sisa < 0; n++, sisa++) bulat[urut[urut.length - 1 - (n % urut.length)].i] -= 1;
  return bulat;
}

/* Bagian tiap BL/AWB satu pengajuan:
     [{ kunci, teks, dpp, ppn, pph, dibayar, rata, tautan }]
   rata   = (sebagian) dari baris yang dibagi rata
   tautan = ada baris yang ditautkan langsung ke BL/AWB ini
   Kosong kalau pengajuannya tidak menyebut BL/AWB. */
function fundBagiPerAwb(p) {
  const d = p || {};
  const awb = fundDaftarAwb(d.blAwb);
  if (!awb.length) return [];
  const total = fundTotalKomponen(d);
  if (awb.length === 1) return [Object.assign({}, awb[0], total, { rata: false, tautan: true })];

  const n = awb.length;
  const ada = new Set(awb.map((a) => a.kunci));
  const isi = new Map(awb.map((a) => [a.kunci, { dpp: 0, ppn: 0, dasarPph: 0, tautan: false }]));
  const bersama = { dpp: 0, ppn: 0, dasarPph: 0 };
  const lines = Array.isArray(d.lines) && d.lines.length ? normalisasiBarisDana(d.lines) : [];
  if (lines.length) {
    const nilai = fundLineValues(lines);
    const ppn = fundLinePpnDaftar(lines, nilai);
    let kunciPos = "";
    lines.forEach((b, i) => {
      let k = fundKunciAwb(b.awb);
      if (!ada.has(k)) k = "";
      if (barisDiskon(b)) {
        if (!k) k = kunciPos; // diskon tanpa tautan mengikuti pos di atasnya
      } else {
        kunciPos = k;
      }
      const wadah = k ? isi.get(k) : bersama;
      wadah.dpp += nilai[i];
      wadah.ppn += ppn[i];
      if (fundLineRate(b) > 0) wadah.dasarPph += nilai[i];
      if (k) wadah.tautan = true;
    });
  } else {
    bersama.dpp = total.dpp;
  }
  const adaBersama = bersama.dpp !== 0 || bersama.ppn !== 0;
  const mentah = awb.map((a) => {
    const x = isi.get(a.kunci);
    return {
      dpp: x.dpp + bersama.dpp / n,
      ppn: x.ppn + bersama.ppn / n,
      pph: Math.max(0, ((x.dasarPph + bersama.dasarPph / n) * FUND_PPH23_RATE) / 100),
    };
  });
  const dpp = fundBulatkanBagian(mentah.map((m) => m.dpp), total.dpp);
  const ppnBagian = fundBulatkanBagian(mentah.map((m) => m.ppn), total.ppn);
  const pph = fundBulatkanBagian(mentah.map((m) => m.pph), total.pph);
  return awb.map((a, i) => ({
    kunci: a.kunci,
    teks: a.teks,
    dpp: dpp[i],
    ppn: ppnBagian[i],
    pph: pph[i],
    dibayar: dpp[i] + ppnBagian[i] - pph[i],
    rata: adaBersama,
    tautan: isi.get(a.kunci).tautan,
  }));
}

/* Nomor baris (mulai 1, sama dengan kolom No. di tabel) yang ditautkan
   ke BL/AWB yang TIDAK ada di isian BL/AWB -- nomornya dihapus dari
   isian sesudah ditautkan. Baris kosong tidak ikut tersimpan, jadi
   tidak diperiksa. */
function fundTautanAwbHilang(lines, blAwb) {
  const ada = new Set(fundDaftarAwb(blAwb).map((a) => a.kunci));
  const hasil = [];
  (Array.isArray(lines) ? lines : []).forEach((b, i) => {
    const k = fundKunciAwb(b && b.awb);
    const berisi = b && (String(b.desc || "").trim() || String(b.amount || "").trim());
    if (k && berisi && !ada.has(k)) hasil.push(i + 1);
  });
  return hasil;
}

/* Tautan BL/AWB baris yang akan disimpan: kunci baku; dibuang kalau
   pengajuannya menagih kurang dari dua BL/AWB (tidak ada yang perlu
   dipisahkan). Tautan ke nomor yang hilang dibiarkan -- ditolak saat
   disimpan, supaya pengguna yang memutuskan. */
function fundRapikanTautanAwb(lines, blAwb) {
  const banyak = fundDaftarAwb(blAwb).length > 1;
  return (Array.isArray(lines) ? lines : []).map((b) => {
    const k = fundKunciAwb(b && b.awb);
    const salinan = Object.assign({}, b);
    if (k && banyak) salinan.awb = k;
    else delete salinan.awb;
    return salinan;
  });
}

/* Baris kosong bawaan: satu baris siap isi, bukan tabel kosong yang
   memaksa pengguna menekan "tambah" dulu. */
function fundLineBaru() {
  /* PPN bawaan 1,1%: itu tarif jasa pengurusan transportasi, yang
     dipungut pada hampir semua pos di tagihan forwarder. Pos yang
     memang tidak dipungut (storage) tinggal diubah ke "—". */
  return { desc: "", amount: "", ppnRate: 1.1 };
}

// Baris diskon baru: tarif PPN mengikuti pos yang didiskonnya.
function fundLineDiskonBaru(tarif) {
  return { jenis: FUND_JENIS_DISKON, desc: "", amount: "", discType: "rp", ppnRate: tarif };
}

function fundLinesBersih(lines) {
  return normalisasiBarisDana(lines).filter(
    (b) => String(b.desc || "").trim() !== "" || String(b.amount || "").trim() !== "",
  );
}

// Rumus yang belum valid -- dicegah ikut tersimpan sebagai teks.
function fundLinesRumusGagal(lines) {
  return (Array.isArray(lines) ? lines : []).some((b) => adalahRumus(b && b.amount));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseRupiah,
    formatRupiah,
    hitungRumus,
    FUND_PPN_RATES,
    FUND_PPH23_RATE,
    fundLineAmount,
    fundLineRate,
    fundLinePpn,
    fundLinePpnDaftar,
    fundSemuaNomor,
    fundLineValues,
    fundLineTotals,
    fundLineBaru,
    fundLinesBersih,
    normalisasiBarisDana,
    fundKunciAwb,
    fundDaftarAwb,
    fundBagiPerAwb,
    fundTautanAwbHilang,
    fundRapikanTautanAwb,
  };
}

/* ------------------------------------------------------------------
   TAMPILAN TABEL RINCIAN

   Data disimpan di satu larik `fundLines`; tabelnya digambar ulang dari
   larik itu, bukan dibaca balik dari DOM. Dengan begitu total di kaki
   tabel tidak mungkin berbeda dari apa yang nanti tersimpan.
------------------------------------------------------------------ */

let fundLines = [fundLineBaru()];

// Nilai tersimpan -> isi kotak. Rumus yang belum valid dibiarkan utuh.
const isiKotakNilai = (b) =>
  adalahRumus(b.amount)
    ? b.amount
    : barisDiskon(b) && b.discType === "pct"
      ? b.amount || ""
      : formatRupiahKetik(b.amount || "");

const teksPpnSel = (v) => (v < 0 ? "- " + formatRupiah(-v) : formatRupiah(v));

function pilihanTarifHtml(b) {
  return FUND_PPN_RATES.map(
    (r) => `<option value="${r}"${fundLineRate(b) === r ? " selected" : ""}>${r === 0 ? "—" : r + "%"}</option>`,
  ).join("");
}

/* Nominal diskon dalam rupiah, di KOTAK BACA-SAJA sebaris dengan kotak
   isiannya -- bukan teks di bawahnya, yang membuat baris diskon lebih
   tinggi dari baris lain dan kotak-kotaknya tidak sejajar. Terutama
   untuk diskon persen, yang nilai rupiahnya tidak terlihat dari
   kotaknya sendiri; di mode Rp ia menegaskan tanda minusnya. */
const teksNominalDiskon = (v) => (v ? "- " + formatRupiah(-v) : "0");

/* BL/AWB yang sedang diketik di isian BL/AWB form Pengajuan Dana. */
function fundAwbForm() {
  const el = document.querySelector('[data-docnum-panel="fund"] [data-dn="blAwb"]');
  return fundDaftarAwb(el ? el.value : "");
}

/* Sel BL/AWB satu baris: pos biaya "Dibagi rata" atau satu BL/AWB;
   diskon "Ikut pos di atas" atau satu BL/AWB. Tautan ke nomor yang
   sudah dihapus dari isian BL/AWB tetap terlihat (bertanda) supaya bisa
   dibetulkan -- menyimpannya ditolak (validateDocNumForm). */
function selAwbHtml(b, daftar) {
  const kini = fundKunciAwb(b.awb);
  const ada = daftar.some((a) => a.kunci === kini);
  const pertama = barisDiskon(b) ? tt("Ikut pos di atas", "Same as line above") : tt("Dibagi rata", "Split evenly");
  return `<td class="fl-awb"><select data-fl-f="awb" class="${kini && !ada ? "fl-awb-hilang" : ""}" aria-label="BL/AWB">
      <option value="">${escapeHtml(pertama)}</option>
      ${daftar.map((a) => `<option value="${escapeAttr(a.kunci)}"${a.kunci === kini ? " selected" : ""}>${escapeHtml(a.teks)}</option>`).join("")}
      ${kini && !ada ? `<option value="${escapeAttr(kini)}" selected>⚠ ${escapeHtml(kini)} — ${escapeHtml(tt("tidak ada di isian BL/AWB", "not in the BL/AWB field"))}</option>` : ""}
    </select></td>`;
}

function barisRincianHtml(b, i, v, ppn, daftarAwb) {
  const kolomAwb = daftarAwb && daftarAwb.length > 1 ? selAwbHtml(b, daftarAwb) : "";
  const tombolHapus = `
        <td class="fl-act">
          <button type="button" class="rm-row" data-fl-del="${i}" title="${escapeAttr(t("f.hapus.baris"))}">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>`;
  const kotakNilai = `<input type="text" data-fl-f="amount" inputmode="decimal" value="${escapeAttr(isiKotakNilai(b))}" placeholder="0">`;
  if (!barisDiskon(b)) {
    return `
      <tr data-fl="${i}">
        <td class="fl-no">${i + 1}</td>
        <td><input type="text" data-fl-f="desc" value="${escapeAttr(b.desc || "")}" placeholder="${escapeAttr(t("f.uraian"))}"></td>${kolomAwb}
        <td class="fl-amt">${kotakNilai}</td>
        <td class="fl-rate"><select data-fl-f="ppnRate">${pilihanTarifHtml(b)}</select></td>
        <td class="fl-amt fl-ppn">${teksPpnSel(ppn)}</td>${tombolHapus}
      </tr>`;
  }
  return `
      <tr data-fl="${i}" class="fl-row-diskon">
        <td class="fl-no">${i + 1}</td>
        <td>
          <div class="fl-desc-diskon">
            <span class="fl-tag-diskon">${escapeHtml(tt("Diskon", "Discount"))}</span>
            <input type="text" data-fl-f="desc" value="${escapeAttr(b.desc || "")}" placeholder="${escapeAttr(tt("Keterangan diskon", "Discount description"))}">
          </div>
        </td>${kolomAwb}
        <td class="fl-amt">
          <div class="fl-disc-in">
            ${kotakNilai}
            <select data-fl-f="discType" aria-label="${escapeAttr(tt("Jenis diskon", "Discount type"))}">
              <option value="rp"${b.discType !== "pct" ? " selected" : ""}>Rp</option>
              <option value="pct"${b.discType === "pct" ? " selected" : ""}>%</option>
            </select>
            <!-- Hasil hitungan: TANPA data-fl-f, jadi tidak pernah dibaca
                 sebagai isian, dan dilewati Tab. -->
            <input type="text" class="fl-disc-nominal" readonly tabindex="-1"
              value="${escapeAttr(teksNominalDiskon(v))}"
              aria-label="${escapeAttr(tt("Nominal diskon", "Discount amount"))}">
          </div>
        </td>
        <td class="fl-rate"><select data-fl-f="ppnRate">${pilihanTarifHtml(b)}</select></td>
        <td class="fl-amt fl-ppn">${teksPpnSel(ppn)}</td>${tombolHapus}
      </tr>`;
}

/* ==================================================================
   DOKUMEN TAGIHAN DALAM SATU PENGAJUAN
   Satu pengajuan bisa membayar beberapa tagihan: dua invoice, atau
   invoice + debit note. Dokumen UTAMA = isian No. Invoice; tambahannya
   di fundDokumen. Tiap baris rincian membawa `dok` (id dokumennya;
   kosong = dokumen utama) dan rincian ditampilkan & dicetak berkelompok
   per dokumen ("Nomor Invoice : AI2602094" lalu pos-posnya).
================================================================== */
let fundDokumen = [];

const fundDokJudul = (jenis) => (jenis === "debit" ? "Nomor Debit Note" : "Nomor Invoice");
const fundDokNama = (jenis) => (jenis === "debit" ? "Debit Note" : "Invoice");

/* Nomor dokumen utama, dibaca langsung dari isian No. Invoice */
function fundDokNomorUtama() {
  const el = document.querySelector('[data-docnum-panel="fund"] [data-dn="invoiceNo"]');
  return el ? String(el.value || "").trim() : "";
}

/* Kelompok berurutan: utama dulu, lalu dokumen tambahan */
function fundDokKelompok() {
  return [{ id: "", jenis: "invoice", nomor: fundDokNomorUtama() }].concat(fundDokumen);
}

/* Baris diurutkan per kelompok (urutan stabil di dalam kelompok) --
   urutan larik = urutan tampil = urutan cetak, jadi diskon persen
   tetap mengacu ke pos di atasnya dalam kelompok yang sama. */
function fundLinesUrutkan() {
  const urut = fundDokKelompok().map((d) => d.id);
  const posisi = (b) => {
    const i = urut.indexOf(String((b && b.dok) || ""));
    return i < 0 ? 0 : i;
  };
  fundLines = fundLines.map((b, i) => ({ b, i })).sort((x, y) => posisi(x.b) - posisi(y.b) || x.i - y.i).map((x) => x.b);
}

function setFundDokumen(list) {
  fundDokumen = (Array.isArray(list) ? list : [])
    .filter((d) => d && d.id)
    .map((d) => ({ id: String(d.id), jenis: d.jenis === "debit" ? "debit" : "invoice", nomor: String(d.nomor || ""), tanggal: String(d.tanggal || "") }));
  renderFundDokumen();
}

function fundDokumenBersih() {
  return fundDokumen.map((d) => ({ id: d.id, jenis: d.jenis, nomor: d.nomor.trim(), tanggal: d.tanggal }));
}

/* Semua nomor tagihan sebuah pengajuan (utama + tambahan) */
function fundSemuaNomor(p) {
  return [String((p && p.invoiceNo) || "").trim()]
    .concat(((p && p.dokumen) || []).map((d) => String((d && d.nomor) || "").trim()))
    .filter(Boolean);
}

function tambahFundDokumen(jenis, nomor, tanggal) {
  const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  fundDokumen.push({ id, jenis: jenis === "debit" ? "debit" : "invoice", nomor: String(nomor || ""), tanggal: String(tanggal || "") });
  return id;
}

function renderFundDokumen() {
  const wadah = document.getElementById("fundDokList");
  if (!wadah) return;
  wadah.innerHTML = fundDokumen.map((d) => `
    <div class="fd-baris" data-fd="${escapeAttr(d.id)}">
      <span class="fd-jenis fd-jenis--${d.jenis}">${escapeHtml(fundDokNama(d.jenis))}</span>
      <input type="text" class="form-control form-control-sm" data-fd-f="nomor" value="${escapeAttr(d.nomor)}"
        placeholder="${escapeAttr(tt(`Nomor ${fundDokNama(d.jenis)}`, `${fundDokNama(d.jenis)} number`))}">
      <input type="date" class="form-control form-control-sm" data-fd-f="tanggal" value="${escapeAttr(d.tanggal)}"
        title="${escapeAttr(tt("Tanggal dokumen", "Document date"))}">
      <button type="button" class="rm-row" data-fd-del="${escapeAttr(d.id)}" title="${escapeAttr(tt("Hapus dokumen ini", "Remove this document"))}"><i class="bi bi-x-lg"></i></button>
    </div>`).join("");
}

/* Judul kelompok di tabel rincian -- diperbarui saat nomornya diketik */
function perbaruiJudulKelompok() {
  fundDokKelompok().forEach((d) => {
    const el = document.querySelector(`#fundLinesBody [data-fl-grup="${d.id}"] .fl-grup-nomor`);
    if (el) el.textContent = d.nomor || tt("(nomor belum diisi)", "(number not filled)");
  });
}

function renderFundLines() {
  const body = document.getElementById("fundLinesBody");
  if (!body) return;
  fundLines = normalisasiBarisDana(fundLines);
  if (!fundLines.length) fundLines = [fundLineBaru()];
  if (fundDokumen.length) fundLinesUrutkan();
  const nilai = fundLineValues(fundLines);
  const ppn = fundLinePpnDaftar(fundLines, nilai);
  // Kolom BL/AWB hanya saat pengajuan ini menagih dua BL/AWB atau lebih
  const daftarAwb = fundAwbForm();
  const pakaiAwb = daftarAwb.length > 1;
  const tabel = body.closest("table");
  if (tabel) tabel.classList.toggle("fund-lines--awb", pakaiAwb);
  const baris = (b, i) => barisRincianHtml(b, i, nilai[i], ppn[i], daftarAwb);
  if (!fundDokumen.length) {
    body.innerHTML = fundLines.map(baris).join("");
  } else {
    const ada = new Set(fundDokKelompok().map((d) => d.id));
    body.innerHTML = fundDokKelompok().map((d) => `
      <tr class="fl-grup" data-fl-grup="${escapeAttr(d.id)}">
        <td colspan="${pakaiAwb ? 7 : 6}">
          <span class="fl-grup-judul">${escapeHtml(fundDokJudul(d.jenis))} :</span>
          <b class="fl-grup-nomor">${escapeHtml(d.nomor || tt("(nomor belum diisi)", "(number not filled)"))}</b>
          <button type="button" class="btn-quiet fl-grup-tambah" data-fl-grup-tambah="${escapeAttr(d.id)}"><i class="bi bi-plus-lg"></i> ${escapeHtml(tt("Baris", "Row"))}</button>
          <button type="button" class="btn-quiet fl-grup-tambah" data-fl-grup-diskon="${escapeAttr(d.id)}"><i class="bi bi-dash-lg"></i> ${escapeHtml(tt("Diskon", "Discount"))}</button>
        </td>
      </tr>${fundLines.map((b, i) => (String(b.dok || "") === d.id || (!d.id && !ada.has(String(b.dok || ""))) ? baris(b, i) : "")).join("")}`).join("");
  }
  gambarKakiRincian();
}

/* Sel hasil hitungan SEMUA baris diperbarui tanpa menggambar ulang
   kotak isian (yang akan merebut fokus dari kotak yang sedang
   diketik). Semua baris, bukan hanya yang diketik: diskon persen
   bergantung pada pos di atasnya. */
function perbaruiHitunganRincian() {
  const nilai = fundLineValues(fundLines);
  const ppnBaris = fundLinePpnDaftar(fundLines, nilai);
  fundLines.forEach((b, i) => {
    const tr = document.querySelector(`#fundLinesBody [data-fl="${i}"]`);
    if (!tr) return;
    const ppn = tr.querySelector(".fl-ppn");
    if (ppn) ppn.textContent = teksPpnSel(ppnBaris[i]);
    const nominal = tr.querySelector(".fl-disc-nominal");
    if (nominal) nominal.value = teksNominalDiskon(nilai[i]);
  });
  gambarKakiRincian();
}

/* Kaki tabel digambar ulang UTUH setiap kali -- baris "Total Diskon"
   muncul dan hilang, dan kaki tabel tidak berisi kotak isian, jadi
   menggambarnya ulang tidak merebut fokus. */
function gambarKakiRincian() {
  const kaki = document.getElementById("fundLinesFoot");
  if (!kaki) return;
  const r = fundLineTotals(fundLines);
  kaki.innerHTML = `
      <div class="fl-sum"><span>${escapeHtml(t("f.total.nilai"))}</span><b>Rp. ${formatRupiah(r.totalNilai)}</b></div>
      ${r.totalDiskon ? `<div class="fl-sum fl-sum--minus"><span>${escapeHtml(tt("Total Diskon", "Total Discount"))}</span><b>- Rp. ${formatRupiah(r.totalDiskon)}</b></div>` : ""}
      <div class="fl-sum"><span>${escapeHtml(t("f.total.ppn"))}</span><b>Rp. ${formatRupiah(r.totalPpn)}</b></div>
      <div class="fl-sum fl-sum--minus"><span>${escapeHtml(t("f.potongan.pph23"))}</span><b>- Rp. ${formatRupiah(r.pph)}</b></div>
      <div class="fl-sum fl-sum--total"><span>TOTAL</span><b>Rp. ${formatRupiah(r.grandTotal)}</b></div>
      ${kakiPerAwbHtml()}`;
}

/* BAGIAN PER BL/AWB di bawah TOTAL -- angka yang sama dengan yang
   dibebankan ke tiap kiriman (Biaya Kiriman Ini di panel detail jadwal). */
function kakiPerAwbHtml() {
  const el = document.querySelector('[data-docnum-panel="fund"] [data-dn="blAwb"]');
  const bagian = fundBagiPerAwb({ lines: fundLinesBersih(fundLines), blAwb: el ? el.value : "" });
  if (bagian.length < 2) return "";
  return `
      <div class="fl-awb-bagian">
        <div class="fl-awb-judul">${escapeHtml(tt("Bagian per BL/AWB", "Share per BL/AWB"))}</div>
        ${bagian.map((b) => `
        <div class="fl-sum fl-sum--awb"><span>${escapeHtml(b.teks)}${b.rata ? ` <i class="fl-awb-rata">${escapeHtml(b.tautan ? tt("+ bagian rata", "+ even share") : tt("dibagi rata", "split evenly"))}</i>` : ""}</span><b>Rp. ${formatRupiah(b.dibayar)}</b></div>`).join("")}
      </div>`;
}

function setFundLines(lines) {
  fundLines = Array.isArray(lines) && lines.length ? lines.slice() : [fundLineBaru()];
  renderFundLines();
}

const kotakPersen = (b, f) => f === "amount" && barisDiskon(b) && b.discType === "pct";

const fundLinesBodyEl = document.getElementById("fundLinesBody");
if (fundLinesBodyEl) {
  fundLinesBodyEl.addEventListener("input", (e) => {
    const tr = e.target.closest("[data-fl]");
    const f = e.target.dataset.flF;
    if (!tr || !f) return;
    const baris = fundLines[Number(tr.dataset.fl)];
    if (f === "amount") {
      // Rupiah & rumus ikut titik ribuan saat diketik; persen dibiarkan ("2,5").
      // Rumusnya sendiri baru DIHITUNG saat Enter / pindah kotak.
      if (!kotakPersen(baris, f)) formatKotakRupiah(e.target);
      if (!adalahRumus(e.target.value)) {
        e.target.classList.remove("fl-rumus-salah");
        e.target.removeAttribute("title");
      }
    }
    baris[f] = e.target.value;
    // Tarif / jenis diskon / BL/AWB: digambar ulang. Selain itu hanya sel
    // hitungan, supaya fokus tidak direbut dari kotak yang sedang diketik.
    if (f === "ppnRate" || f === "discType" || f === "awb") return renderFundLines();
    perbaruiHitunganRincian();
  });
  /* Pilihan (tarif PPN, jenis diskon) DISIMPAN di sini juga sebelum
     tabel digambar ulang -- tidak mengandalkan event "input" yang
     kebetulan ikut terpicu pada <select> di peramban modern. */
  fundLinesBodyEl.addEventListener("change", (e) => {
    const f = e.target.dataset.flF;
    if (f !== "ppnRate" && f !== "discType" && f !== "awb") return;
    const tr = e.target.closest("[data-fl]");
    if (tr) fundLines[Number(tr.dataset.fl)][f] = e.target.value;
    renderFundLines();
  });
  // Pindah kotak = rumus dihitung, seperti menekan Enter.
  fundLinesBodyEl.addEventListener("focusout", (e) => {
    if (e.target.dataset.flF !== "amount") return;
    const tr = e.target.closest("[data-fl]");
    if (!tr || !adalahRumus(e.target.value)) return;
    const baris = fundLines[Number(tr.dataset.fl)];
    terapkanRumusKotak(e.target, kotakPersen(baris, "amount"));
    baris.amount = e.target.value;
    perbaruiHitunganRincian();
  });
  fundLinesBodyEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-fl-del]");
    if (!del) return;
    fundLines.splice(Number(del.dataset.flDel), 1);
    renderFundLines();
  });
}

/* ENTER = hitung rumus (kalau ada), lalu turun satu baris di kolom yang
   sama -- seperti spreadsheet.

   Mengisi tabel ini berarti menyalin daftar pos dari tagihan dari atas
   ke bawah; berpindah dengan Tab menyeberang kolom dulu, dan mengetik
   lalu meraih tetikus tiap baris jauh lebih lambat. Di baris terakhir,
   Enter menambah baris baru sekalian. Rumus yang TIDAK valid menahan
   kursor di kotaknya supaya bisa langsung diperbaiki.

   Enter DICEGAH mengirim form: kotak-kotak ini hidup di dalam <form>
   penerbitan nomor, dan tanpa preventDefault satu ketukan Enter akan
   menerbitkan nomor sebelum rinciannya selesai diisi. */
if (fundLinesBodyEl) {
  fundLinesBodyEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const tr = e.target.closest("[data-fl]");
    const f = e.target.dataset.flF;
    if (!tr || !f) return;
    e.preventDefault();

    const idx = Number(tr.dataset.fl);
    if (f === "amount" && adalahRumus(e.target.value)) {
      const baris = fundLines[idx];
      const ok = terapkanRumusKotak(e.target, kotakPersen(baris, f));
      baris.amount = e.target.value;
      perbaruiHitunganRincian();
      if (!ok) return;
    }
    if (idx === fundLines.length - 1) {
      fundLines.push(fundLineBaru());
      renderFundLines();
    }
    const berikut = fundLinesBodyEl.querySelector(
      `[data-fl="${idx + 1}"] [data-fl-f="${f}"]`,
    );
    if (berikut) {
      berikut.focus();
      if (typeof berikut.select === "function") berikut.select();
    }
  });
}

const btnFundLineAddEl = document.getElementById("btnFundLineAdd");
if (btnFundLineAddEl) {
  btnFundLineAddEl.addEventListener("click", () => {
    // Dengan beberapa dokumen: baris baru masuk ke kelompok TERAKHIR
    fundLines.push(Object.assign(fundLineBaru(), { dok: fundDokumen.length ? fundDokumen[fundDokumen.length - 1].id : "" }));
    renderFundLines();
    const kotak = fundLinesBodyEl.querySelector("tr:last-child [data-fl-f='desc']");
    if (kotak) kotak.focus();
  });
}

/* Tambah Diskon: baris diskon di ujung tabel, bertarif PPN sama dengan
   pos biaya terakhir -- pos yang hampir selalu sedang didiskon. */
const btnFundDiscAddEl = document.getElementById("btnFundDiscAdd");
if (btnFundDiscAddEl) {
  btnFundDiscAddEl.addEventListener("click", () => {
    const posTerakhir = [...fundLines].reverse().find((b) => !barisDiskon(b));
    fundLines.push(Object.assign(fundLineDiskonBaru(posTerakhir ? fundLineRate(posTerakhir) : 0),
      { dok: fundDokumen.length ? fundDokumen[fundDokumen.length - 1].id : "" }));
    renderFundLines();
    const kotak = fundLinesBodyEl.querySelector("tr:last-child [data-fl-f='amount']");
    if (kotak) kotak.focus();
  });
}

/* Tombol "+ Baris" / "- Diskon" di judul tiap kelompok dokumen */
if (fundLinesBodyEl) {
  fundLinesBodyEl.addEventListener("click", (e) => {
    const tambah = e.target.closest("[data-fl-grup-tambah]");
    const diskon = e.target.closest("[data-fl-grup-diskon]");
    if (!tambah && !diskon) return;
    const dok = tambah ? tambah.dataset.flGrupTambah : diskon.dataset.flGrupDiskon;
    if (tambah) fundLines.push(Object.assign(fundLineBaru(), { dok }));
    else {
      const pos = [...fundLines].reverse().find((b) => !barisDiskon(b) && String(b.dok || "") === dok);
      fundLines.push(Object.assign(fundLineDiskonBaru(pos ? fundLineRate(pos) : 0), { dok }));
    }
    renderFundLines();
  });
}

/* + Invoice / + Debit Note: dokumen tambahan, langsung dengan satu baris kosongnya */
["invoice", "debit"].forEach((jenis) => {
  const tombol = document.getElementById(jenis === "debit" ? "btnFundTambahDebit" : "btnFundTambahInvoice");
  if (!tombol) return;
  tombol.addEventListener("click", () => {
    const id = tambahFundDokumen(jenis);
    fundLines.push(Object.assign(fundLineBaru(), { dok: id }));
    renderFundDokumen();
    renderFundLines();
    const kotak = document.querySelector(`#fundDokList [data-fd="${id}"] [data-fd-f="nomor"]`);
    if (kotak) kotak.focus();
  });
});

const fundDokListEl = document.getElementById("fundDokList");
if (fundDokListEl) {
  fundDokListEl.addEventListener("input", (e) => {
    const f = e.target.closest("[data-fd-f]");
    if (!f) return;
    const d = fundDokumen.find((x) => x.id === f.closest("[data-fd]").dataset.fd);
    if (d) d[f.dataset.fdF] = f.value;
    perbaruiJudulKelompok();
  });
  fundDokListEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-fd-del]");
    if (!del) return;
    const id = del.dataset.fdDel;
    const dok = fundDokumen.find((d) => d.id === id);
    const isi = fundLines.filter((b) => String(b.dok || "") === id && (String(b.desc || "").trim() || parseRupiah(b.amount)));
    const hapus = () => {
      fundDokumen = fundDokumen.filter((d) => d.id !== id);
      fundLines = fundLines.filter((b) => String(b.dok || "") !== id);
      renderFundDokumen();
      renderFundLines();
    };
    if (!isi.length || typeof showConfirm !== "function") return hapus();
    const nama = `${fundDokNama(dok.jenis)}${dok.nomor ? " " + dok.nomor : ""}`;
    showConfirm(
      tt(`${nama} beserta ${isi.length} baris rinciannya akan dihapus dari pengajuan ini. Dokumen lain tidak berubah.`,
        `${nama} and its ${isi.length} cost line(s) will be removed from this request. Other documents stay as they are.`),
      hapus,
      { title: tt(`Hapus ${fundDokNama(dok.jenis)}?`, `Remove ${fundDokNama(dok.jenis)}?`), confirmText: tt("Ya, Hapus", "Yes, Remove"), icon: "bi-trash3" });
  });
}
// Nomor invoice utama diketik -> judul kelompok utama ikut
document.addEventListener("input", (e) => {
  if (e.target.closest('[data-docnum-panel="fund"] [data-dn="invoiceNo"]') && fundDokumen.length) perbaruiJudulKelompok();
  // BL/AWB diketik -> kolom & pilihan BL/AWB di rincian, dan bagian per BL/AWB
  if (e.target.closest('[data-docnum-panel="fund"] [data-dn="blAwb"]')) renderFundLines();
});

renderFundLines();
