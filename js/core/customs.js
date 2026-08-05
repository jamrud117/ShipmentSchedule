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

       totalQty yang lama tetap dihitung: sebagian tempat memang cuma
       butuh satu bilangan (mis. pengurutan), dan menghapusnya berarti
       menyentuh lebih banyak berkas daripada yang perlu. */
    const sat = String(it.satuan || "").trim().toUpperCase();
    if (qty) qtyPerSatuan.set(sat, (qtyPerSatuan.get(sat) || 0) + qty);
    totalNetto += netto;
    totalBruto += bruto;
    totalUSD += qty * harga;
    // Total Package (mode Import saja — lihat modal-fields.js)
    const pkgNum = extractLeadingNumber(it.package);
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
  const bmPdri = bm !== 0 ? bm + ppn + pph : 0;

  return { ...totals, cifUsd, cifRupiah, fobUsd, fobRupiah, bmPdri };
}
