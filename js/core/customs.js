"use strict";

/* CUSTOMS / VALUE CALCULATION (single source of truth) */
function itemTotals(shipmentLike) {
  const qtyPerSatuan = new Map();
  let totalQty = 0,
    totalNetto = 0,
    totalBruto = 0,
    totalUSD = 0,
    totalPackageQty = 0,
    totalCbm = 0;
  (shipmentLike.items || []).forEach((it) => {
    /* parseLooseNumber, BUKAN Number.

       Barang hasil impor CIPL/PDF membawa angka apa adanya dari
       berkasnya — "60,000" atau "1.234,56". Number() mengembalikan NaN
       untuk keduanya, lalu `|| 0` mengubahnya jadi nol tanpa bersuara:
       Unit Price x Qty tampil $0 padahal kedua kolomnya terisi. */
    const qty = parseLooseNumber(it.qty),
      harga = parseLooseNumber(it.harga),
      netto = parseLooseNumber(it.netto),
      bruto = parseLooseNumber(it.bruto);
    totalQty += qty;
    /* Qty dijumlahkan PER SATUAN, bukan digabung jadi satu angka.

       1 EA + 60.000 SET bukan 60.001 apa pun. Menjumlahkannya
       menghasilkan bilangan yang tidak mewakili apa-apa, dan justru
       terlihat meyakinkan karena berupa angka bulat.

       totalQty tetap dihitung: sebagian tempat memang cuma
       butuh satu bilangan (mis. pengurutan), dan menghapusnya berarti
       menyentuh lebih banyak berkas daripada yang perlu. */
    const sat = String(it.satuan || "").trim().toUpperCase();
    if (qty) qtyPerSatuan.set(sat, (qtyPerSatuan.get(sat) || 0) + qty);
    totalNetto += netto;
    totalBruto += bruto;
    totalUSD += qty * harga;
    /* Total Package (mode Import saja — lihat modal-fields.js).

       DIHITUNG DARI `packing`, kolom "Kemasan" yang benar-benar
       tampil. Dulu dari `package` — kolom yang sekarang bernama
       "Dimensi" dan disembunyikan di buku Import. Akibatnya Total
       Package selalu 0 untuk data yang diimpor lewat Excel BC, yang
       memang sudah menulis ke `packing`.

       `package` tetap dipakai sebagai cadangan supaya jadwal LAMA —
       yang menyimpan "5 BOX" di kolom itu — totalnya tidak mendadak
       jadi nol. Di buku Export kolom itu berisi dimensi ("82*42*14"),
       tapi Total Package memang tidak ditampilkan di sana. */
    const pkgNum = extractLeadingNumber(
      String(it.packing || "").trim() ? it.packing : it.package,
    );
    if (pkgNum != null) totalPackageQty += pkgNum;
    // Total CBM (mode Export saja): jumlah meter kubik tiap barang
    totalCbm += computeItemCbm(it);
  });
  totalCbm = Math.round(totalCbm * 1000) / 1000;
  return {
    totalQty,
    // [{ satuan, qty }] urut sesuai kemunculan pertama di daftar barang
    qtyBySatuan: [...qtyPerSatuan].map(([satuan, qty]) => ({ satuan, qty })),
    totalNetto,
    totalBruto,
    totalUSD,
    totalPackageQty,
    totalCbm,
  };
}

/* ------------------------------------------------------------------
   PUNGUTAN IMPOR PERSIS SEPERTI PIB CEISA, MENURUT FASILITAS BARANG

   SATU hitungan untuk Bea & Pajak Impor di tab Kepabeanan & Biaya (=
   kolom Dibayar) dan tab Pungutan Data PIB. Aturannya (PMK 190/2022
   Pasal 22, dan ketentuan perpajakan untuk PDRI):
   1. Semua pungutan dihitung PER SERI BARANG -- tiap baris Daftar
      Barang -- lalu dijumlahkan per jenis pungutan & kolom.
   2. Nilai Pabean seri = porsi nilai barangnya x (Total Nilai Barang +
      Freight + Asuransi) x NDPBM.
   3. BM seri = Nilai Pabean seri x Tarif BM barangnya (Data PIB barang),
      atau Tarif (%) jadwal (kosong = 5%). TOTAL BM dibulatkan KE ATAS ke
      ribuan rupiah (Rp1.506.882,069 -> Rp1.507.000).
   4. Fasilitas barang di jadwal (item.skb) adalah patokannya: SKB BM &
      Masterlist -> BM DIBEBASKAN, SKB PPN -> PPN dibebaskan, SKB PPh ->
      PPh dibebaskan. Yang dibebaskan masuk kolom Dibebaskan, sisanya
      Dibayar (kolom tabel 37-44 PIB).
   5. Nilai Impor seri = Nilai Pabean seri + BM seri yang TIDAK
      dibebaskan, sebelum dibulatkan.
   6. PPN = Nilai Impor x 11% (12% x DPP nilai lain 11/12, PMK
      131/2024). TOTAL PPN dibulatkan KE BAWAH ke rupiah penuh.
   7. PPh 22 = Nilai Impor seri DIBULATKAN KE BAWAH ke ribuan x Tarif
      PPh barangnya (bawaan 2,5%: importir ber-API), dijumlahkan.

   Diperiksa terhadap PIB sungguhan: CIP USD 4.780, 2 seri, NDPBM 17.707,
   BM 5% -> BM 4.232.000, PPN 9.775.857, PPh 2.221.750; dan 17 seri (BM
   5/10/15%, BKPM + SKB PPN & PPh) -> Dibebaskan BM 556.112.000, PPN
   721.904.414, PPh 164.069.075 -- tepat semuanya, juga per serinya.

   bmManual / ppnManual / pphManual: angka yang DIKETIK sendiri di tab
   Kepabeanan & Biaya, tampil apa adanya di kolom Dibayar. BM manual
   dibagi ke seri yang BM-nya tidak dibebaskan (menurut BM hitungannya)
   dan menjadi dasar PPN & PPh -- ia biasanya angka PIB yang sudah
   dibulatkan, jadi PPN-nya bisa selisih beberapa rupiah dari CEISA. */
const TARIF_PPN_IMPOR = 11;
const TARIF_PPH_IMPOR = 2.5;

/* BEA MASUK DIBULATKAN KE ATAS KE RIBUAN RUPIAH PENUH (1.543.235 ->
   1.544.000) -- SATU aturan untuk semua jalan masuk angka BM: dihitung
   dari tarif, dibaca dari draft Excel CEISA (jumlah NILAI BAYAR per
   seri yang belum dibulatkan), dibaca dari PIB, atau diketik sendiri
   di Customs & Charges. Dibersihkan ke 4 desimal dulu: 4.231.999,99999998
   hasil pecahan biner semestinya 4.232.000, bukan naik ke 4.233.000.
   Kosong tetap kosong, nol tetap nol. */
function bulatkanBm(n) {
  if (n == null || n === "") return n;
  const x = Number(n);
  if (!isFinite(x)) return n;
  return Math.ceil(Math.round(x * 1e4) / 1e4 / 1000) * 1000;
}

// Nilai USD tiap seri -- hitungan yang sama dengan Total Nilai Barang.
function nilaiSeriUsd(items) {
  return (items || []).map((it) => parseLooseNumber(it.qty) * parseLooseNumber(it.harga));
}

const FASILITAS_PUNGUTAN = { BM: "BM", Masterlist: "BM", PPN: "PPN", PPH: "PPh" };
const PUNGUTAN_KOLOM_DIBAYAR = 0;
const PUNGUTAN_KOLOM_DIBEBASKAN = 4;
const KUNCI_PUNGUTAN = { BM: "bm", PPN: "ppn", PPh: "pph" };

function fasilitasPungutanBarang(it) {
  const bebas = { BM: false, PPN: false, PPh: false };
  ((it && it.skb) || []).forEach((sk) => {
    const j = FASILITAS_PUNGUTAN[sk && sk.jenis];
    if (j) bebas[j] = true;
  });
  return bebas;
}

const adaAngkaPungutan = (v) => v != null && v !== "" && isFinite(Number(v));

/* Angka Dibayar yang diketik sendiri dibagi ke seri yang tidak
   dibebaskan, menurut hitungannya (nilai pabeannya bila hitungannya nol
   semua). Tanpa dasar sama sekali (nilai pabean nol) tidak dibagi. */
function bagiPungutanManual(seri, jenis, total) {
  if (!adaAngkaPungutan(total)) return;
  const k = KUNCI_PUNGUTAN[jenis];
  const bayar = seri.filter((s) => !s.bebas[jenis]);
  let bobot = bayar.map((s) => s[k]);
  if (!(bobot.reduce((a, b) => a + b, 0) > 0)) bobot = bayar.map((s) => s.nilaiPabean);
  const jumlah = bobot.reduce((a, b) => a + b, 0);
  if (!(jumlah > 0)) return;
  bayar.forEach((s, i) => (s[k] = (Number(total) * bobot[i]) / jumlah));
}

function hitungPungutanFasilitas(o) {
  const bersih = (x) => Math.round(x * 1e4) / 1e4;
  const items = o.items || [];
  const nilai = nilaiSeriUsd(items).map((v) => (v > 0 ? v : 0));
  const totalBarang = nilai.reduce((a, b) => a + b, 0);
  const nilaiPabean = (totalBarang + (o.freightUsd || 0) + (o.asuransiUsd || 0)) * (o.ndpbm || 0);
  const angka = (v) => (v === "" || v == null ? null : Number(v));
  const seri = items.map((it, i) => {
    const dp = it.dataPabean || {};
    const np = totalBarang ? (nilaiPabean * nilai[i]) / totalBarang : 0;
    const tarifBm = angka(dp.tarifBm) != null ? angka(dp.tarifBm) : o.tarifBm == null ? 5 : o.tarifBm;
    const tarifPph = angka(dp.tarifPph) != null ? angka(dp.tarifPph) : TARIF_PPH_IMPOR;
    return { nilaiUsd: nilai[i], nilaiPabean: np, tarifBm, tarifPph, bebas: fasilitasPungutanBarang(it), bm: (np * tarifBm) / 100 };
  });
  bagiPungutanManual(seri, "BM", o.bmManual);
  seri.forEach((s) => {
    s.nilaiImpor = bersih(s.nilaiPabean + (s.bebas.BM ? 0 : s.bm));
    s.ppn = (s.nilaiImpor * TARIF_PPN_IMPOR) / 100;
    s.pph = (Math.floor(s.nilaiImpor / 1000) * 1000 * s.tarifPph) / 100;
  });
  bagiPungutanManual(seri, "PPN", o.ppnManual);
  bagiPungutanManual(seri, "PPh", o.pphManual);

  const kosong = () => [0, 0, 0, 0, 0, 0];
  const tabel = { BM: kosong(), PPN: kosong(), PPh: kosong() };
  seri.forEach((s) =>
    Object.keys(KUNCI_PUNGUTAN).forEach((j) => {
      tabel[j][s.bebas[j] ? PUNGUTAN_KOLOM_DIBEBASKAN : PUNGUTAN_KOLOM_DIBAYAR] += s[KUNCI_PUNGUTAN[j]];
    }),
  );
  tabel.BM = tabel.BM.map((x) => bulatkanBm(x));
  tabel.PPN = tabel.PPN.map((x) => Math.floor(bersih(x)));
  tabel.PPh = tabel.PPh.map((x) => Math.floor(bersih(x)));
  // Yang diketik sendiri tampil apa adanya -- juga bila semua serinya berfasilitas
  const manual = { BM: o.bmManual, PPN: o.ppnManual, PPh: o.pphManual };
  Object.keys(manual).forEach((j) => {
    if (adaAngkaPungutan(manual[j])) tabel[j][PUNGUTAN_KOLOM_DIBAYAR] = j === "BM" ? bulatkanBm(Number(manual[j])) : Number(manual[j]);
  });
  tabel.TOTAL = kosong().map((_, k) => tabel.BM[k] + tabel.PPN[k] + tabel.PPh[k]);
  return { nilaiPabean, seri, tabel };
}

// shipmentLike needs: items, incoterm, ndpbm, bm, ppn, pph
function computeCustoms(shipmentLike) {
  const totals = itemTotals(shipmentLike);
  const ndpbm = Number(shipmentLike.ndpbm) || 0;
  let cifUsd = 0,
    cifRupiah = 0,
    fobUsd = 0,
    fobRupiah = 0;

  if (shipmentLike.incoterm === "CIF") {
    cifUsd = totals.totalUSD;
    cifRupiah = cifUsd * ndpbm;
  } else if (shipmentLike.incoterm === "FOB") {
    fobUsd = totals.totalUSD;
    fobRupiah = fobUsd * ndpbm;
  }
  // Any other incoterm (CFR/EXW/DDP) -> all four stay 0, per requirement.

  const bm = Number(shipmentLike.bm) || 0;
  const ppn = Number(shipmentLike.ppn) || 0;
  const pph = Number(shipmentLike.pph) || 0;
  /* PDRI = Bea Masuk + PPN + PPH. Penjumlahan biasa, tanpa syarat.

     Aturan "kalau Bea Masuk 0 maka 0" TIDAK dipakai: itu membuat
     kiriman berfasilitas SKB, yang bea masuknya memang nol tapi PPN
     dan PPH-nya tetap terutang, menampilkan 0 padahal ada yang harus
     disetor. */
  const bmPdri = bm + ppn + pph;

  return { ...totals, cifUsd, cifRupiah, fobUsd, fobRupiah, bmPdri };
}

/* ------------------------------------------------------------------
   KURS DARI NDPBM JADWAL

   NDPBM di PIB/PEB adalah kurs pajak (KMK) yang berlaku pekan itu,
   jadi transaksi bervaluta asing dikonversi dengan NDPBM kiriman yang
   tanggalnya PALING DEKAT dengan tanggal transaksinya. Satu sumber untuk
   Laporan Biaya & biaya per kiriman -- tanpa unduhan kurs dari luar.

   NDPBM jadwal DDI berdenominasi USD, jadi hanya USD yang punya kurs;
   IDR = 1, mata uang lain = 0 (tidak dikonversi diam-diam).
   Hasil: (mata, tanggal) -> { nilai, tanggal, jarak, s } -- `jarak` dalam
   hari ke NDPBM yang dipakai (di atas 7 hari = di luar pekan KMK-nya).
------------------------------------------------------------------ */
const NDPBM_MINIMAL = 1000; // di bawah ini bukan kurs rupiah per USD (isian salah / kosong)

function tanggalNdpbm(s) {
  const pib = s && s.docProgress && s.docProgress.pib;
  return String((pib && pib.date) || tanggalDariAju(s.noAju) || s.docDate || s.eta || s.etd || "").slice(0, 10);
}

function kursNdpbm(kiriman) {
  const hari = (iso) => Date.parse(String(iso).slice(0, 10) + "T00:00:00Z") / 86400000;
  const titik = (kiriman || [])
    .map((s) => ({ s, n: Number(s.ndpbm) || 0, t: tanggalNdpbm(s) }))
    .filter((x) => x.n > NDPBM_MINIMAL && x.t && Number.isFinite(hari(x.t)));
  return (mata, tanggal) => {
    const kode = String(mata || "IDR").trim().toUpperCase();
    if (kode === "IDR") return { nilai: 1, jarak: 0 };
    if (kode !== "USD" || !titik.length) return { nilai: 0, jarak: null };
    const t0 = hari(tanggal);
    let pilih = null;
    titik.forEach((x) => {
      const jarak = Number.isFinite(t0) ? Math.abs(hari(x.t) - t0) : 0;
      if (!pilih || jarak < pilih.jarak || (jarak === pilih.jarak && x.t > pilih.tanggal))
        pilih = { nilai: x.n, tanggal: x.t, jarak, s: x.s };
    });
    return pilih;
  };
}
