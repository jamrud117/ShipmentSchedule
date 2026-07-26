"use strict";

/* ==================================================================
   CUSTOMS / VALUE CALCULATION (single source of truth)
================================================================== */
function itemTotals(shipmentLike) {
  let totalQty = 0,
    totalNetto = 0,
    totalBruto = 0,
    totalUSD = 0,
    totalPackageQty = 0,
    totalCbm = 0;
  (shipmentLike.items || []).forEach((it) => {
    const qty = Number(it.qty) || 0,
      harga = Number(it.harga) || 0,
      netto = Number(it.netto) || 0,
      bruto = Number(it.bruto) || 0;
    totalQty += qty;
    totalNetto += netto;
    totalBruto += bruto;
    totalUSD += qty * harga;
    // Total Package (mode Import saja — lihat modal-fields.js): jumlah
    // angka depan field Kemasan tiap barang, mis. "5 BOX" -> 5. Barang
    // yang field Kemasan-nya kosong/tidak ada angka depan dihitung 0,
    // bukan bikin NaN. extractLeadingNumber() ada di
    // features/excel-row-format.js (dipanggil dari sini, bukan
    // dipindah/diduplikasi — aman krn dipanggil dari dalam function,
    // bukan top-level, jadi tidak masalah soal urutan <script> load).
    const pkgNum = extractLeadingNumber(it.package);
    if (pkgNum != null) totalPackageQty += pkgNum;
    // Total CBM (mode Export saja): jumlah meter kubik tiap barang,
    // computeItemCbm() sudah ada di core/helpers.js (P*L*T/1.000.000 x
    // Qty barang, dibulatkan 3 desimal per barang). Barang yang field
    // Kemasan-nya bukan dimensi valid dihitung 0 oleh computeItemCbm()
    // sendiri, jadi aman dijumlah langsung di sini.
    totalCbm += computeItemCbm(it);
  });
  totalCbm = Math.round(totalCbm * 1000) / 1000;
  return {
    totalQty,
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
