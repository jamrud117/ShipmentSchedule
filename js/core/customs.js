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
   PUNGUTAN IMPOR PERSIS SEPERTI PIB CEISA

   Aturannya (PMK 190/2022 Pasal 22, dan ketentuan perpajakan untuk
   PDRI):
   1. Semua pungutan dihitung PER SERI BARANG -- tiap baris Daftar
      Barang -- lalu dijumlahkan per jenis pungutan.
   2. Nilai Pabean seri = porsi nilai barangnya x (Total Nilai Barang +
      Freight + Asuransi) x NDPBM.
   3. BM seri = Nilai Pabean seri x tarif. TOTAL BM satu PIB dibulatkan
      KE ATAS ke ribuan rupiah (Rp1.506.882,069 -> Rp1.507.000).
   4. Nilai Impor seri = Nilai Pabean seri + BM seri SEBELUM dibulatkan.
   5. PPN = Nilai Impor x 11% (12% x DPP nilai lain 11/12, PMK
      131/2024). TOTAL PPN dibulatkan KE BAWAH ke rupiah penuh.
   6. PPh 22 = Nilai Impor seri DIBULATKAN KE BAWAH ke ribuan x tarif
      (2,5% untuk importir ber-API), dijumlahkan.

   Diperiksa terhadap PIB sungguhan (CIP USD 4.780, 2 seri, NDPBM
   17.707, BM 5%): BM 4.232.000, PPN 9.775.857, PPh 2.221.750 -- tepat
   ketiganya. Rumus lama (tingkat total, tanpa aturan pembulatan, PPh
   dari Nilai Pabean saja) meleset: 4.231.973 / 9.775.858 / 2.115.987.

   bmManual: BM yang diketik sendiri (tarif HS Code tertentu). Dibagi ke
   seri menurut porsinya, dan dipakai APA ADANYA sebagai dasar PPN &
   PPh -- ia biasanya sudah angka yang dibulatkan dari PIB, jadi PPN-
   nya bisa selisih beberapa rupiah dari CEISA. */
const TARIF_PPN_IMPOR = 11;
const TARIF_PPH_IMPOR = 2.5;

// Nilai USD tiap seri -- hitungan yang sama dengan Total Nilai Barang.
function nilaiSeriUsd(items) {
  return (items || []).map((it) => parseLooseNumber(it.qty) * parseLooseNumber(it.harga));
}

function hitungPungutanImpor(o) {
  /* Dibersihkan ke 4 desimal sebelum dibulatkan: 4.231.999,99999998
     hasil pecahan biner semestinya 4.232.000, bukan naik ke 4.233.000. */
  const bersih = (x) => Math.round(x * 1e4) / 1e4;
  const nilai = (o.nilaiSeriUsd || []).filter((v) => v > 0);
  const totalBarang = nilai.reduce((a, b) => a + b, 0);
  const nilaiPabean = (totalBarang + (o.freightUsd || 0) + (o.asuransiUsd || 0)) * (o.ndpbm || 0);
  if (!nilaiPabean) return { nilaiPabean: 0, bm: 0, ppn: 0, pph: 0 };
  const tarifPpn = o.tarifPpn == null ? TARIF_PPN_IMPOR : o.tarifPpn;
  const tarifPph = o.tarifPph == null ? TARIF_PPH_IMPOR : o.tarifPph;
  // Tanpa barang bernilai (hanya freight?), seluruhnya dianggap satu seri.
  const porsi = totalBarang ? nilai.map((v) => v / totalBarang) : [1];
  let bm = 0, ppn = 0, pph = 0;
  porsi.forEach((p) => {
    const npSeri = nilaiPabean * p;
    const bmSeri = o.bmManual != null ? o.bmManual * p : (npSeri * (o.tarifBm || 0)) / 100;
    const niSeri = bersih(npSeri + bmSeri);
    bm += bmSeri;
    ppn += (niSeri * tarifPpn) / 100;
    pph += (Math.floor(niSeri / 1000) * 1000 * tarifPph) / 100;
  });
  return {
    nilaiPabean,
    bm: o.bmManual != null ? o.bmManual : Math.ceil(bersih(bm) / 1000) * 1000,
    ppn: Math.floor(bersih(ppn)),
    pph: Math.floor(bersih(pph)),
  };
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
