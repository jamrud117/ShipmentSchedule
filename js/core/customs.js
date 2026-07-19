"use strict";

/* ==================================================================
   CUSTOMS / VALUE CALCULATION (single source of truth)
================================================================== */
function itemTotals(shipmentLike) {
  let totalQty = 0,
    totalNetto = 0,
    totalBruto = 0,
    totalUSD = 0;
  (shipmentLike.items || []).forEach((it) => {
    const qty = Number(it.qty) || 0,
      harga = Number(it.harga) || 0,
      netto = Number(it.netto) || 0,
      bruto = Number(it.bruto) || 0;
    totalQty += qty;
    totalNetto += netto;
    totalBruto += bruto;
    totalUSD += qty * harga;
  });
  return { totalQty, totalNetto, totalBruto, totalUSD };
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
