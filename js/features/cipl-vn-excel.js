"use strict";

/* ------------------------------------------------------------------
   EKSPOR EXCEL — CIPL BENTUK VIETNAM (Kumho)

   Koordinat sel, lebar kolom, tinggi baris, dan gabungan sel
   MENGIKUTI BERKAS ASLINYA persis. Berkas ini dibuka & diedit lagi
   oleh pembeli, jadi pergeseran satu kolom pun membuat rumus dan
   makro di sisi mereka meleset.

   Nilainya ditaruh pada alamat tertentu (A3, E9, ...), bukan lewat
   addRow berurutan: jumlah baris alamat berbeda antar pengapalan, dan
   menyusun berurutan membuat seluruh blok kanan ikut melenceng.
------------------------------------------------------------------ */

const VNXL_FONT = { name: "Times New Roman", size: 10 };
const VNXL_FONT_B = { name: "Times New Roman", size: 10, bold: true };
const VNXL_FONT_KECIL = { name: "Times New Roman", size: 9 };
const VNXL_JUDUL = { name: "Times New Roman", size: 24, bold: true };

/* Lebar kolom dari berkas aslinya. B & M sengaja tanpa lebar --
   memakai bawaan Excel, sama seperti di sana. */
const VNXL_LEBAR = {
  A: 9.78, C: 12.22, D: 11.89, E: 9.78, F: 4.11, G: 4.0, H: 3.78,
  I: 7.22, J: 3.78, K: 8.78, L: 8.89, N: 9.78, O: 10.89, P: 13.44,
  Q: 8.89, R: 11.22, S: 8.89,
};

const VNXL_FMT_UANG = '#,##0.00_);[Red](#,##0.00)';
const VNXL_FMT_TGL = "mm-dd-yy";

function vnxlSet(ws, alamat, nilai, font, rata, fmt) {
  const c = ws.getCell(alamat);
  c.value = nilai;
  c.font = font || VNXL_FONT;
  if (rata) c.alignment = rata;
  if (fmt) c.numFmt = fmt;
  return c;
}

const VNXL_TENGAH = { horizontal: "center", vertical: "middle" };
const VNXL_KIRI = { horizontal: "left", vertical: "middle" };
const VNXL_KANAN = { horizontal: "right", vertical: "middle" };

/* Garis tipis pada sisi tertentu saja. Menyetel keliling pada tiap sel
   menghasilkan garis ganda di pertemuannya -- berkas aslinya memakai
   sisi-per-sisi. */
function vnxlSisi(ws, alamat, sisi) {
  const c = ws.getCell(alamat);
  const b = Object.assign({}, c.border);
  String(sisi || "")
    .split("")
    .forEach((s) => {
      const nama = { l: "left", r: "right", t: "top", b: "bottom" }[s];
      if (nama) b[nama] = { style: "thin" };
    });
  c.border = b;
}

function vnxlGarisBaris(ws, baris, kolomAwal, kolomAkhir, sisi) {
  for (let i = kolomAwal; i <= kolomAkhir; i++) {
    vnxlSisi(ws, ws.getRow(baris).getCell(i).address, sisi);
  }
}

function vnxlKerangka(ws, judul) {
  Object.keys(VNXL_LEBAR).forEach((k) => {
    ws.getColumn(k).width = VNXL_LEBAR[k];
  });
  ws.getRow(1).height = 28.5;
  for (let r = 2; r <= 29; r++) ws.getRow(r).height = 12.75;

  ws.mergeCells("A1:K1");
  vnxlSet(ws, "A1", judul, VNXL_JUDUL, VNXL_TENGAH);
  vnxlGarisBaris(ws, 1, 1, 11, "tb");
  vnxlSisi(ws, "A1", "l");
  vnxlSisi(ws, "K1", "r");
}

/* Blok kiri (Seller/Shipper/Consignee) & kanan (nomor, notify, refs).
   Nomor barisnya tetap, mengikuti berkas aslinya. */
/* isPacking menggeser blok kiri satu baris ke atas: pada berkas
   aslinya lembar PL menulis Seller TANPA baris e-mail, sehingga
   Shipper mulai di A9 (bukan A10) dan Consignee di A16. Perbedaan itu
   ada di berkas rujukan, jadi ditiru apa adanya -- bukan dirapikan
   diam-diam. */
function vnxlBlokAtas(ws, row, shipment, isPacking) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const consignee = p.customer || (shipment && shipment.party) || "";
  const alamat = p.consigneeAddress
    ? ciplBarisTeks(p.consigneeAddress)
    : prof.lines || [];

  const seller = isPacking ? CIPL_VN_SELLER.slice(0, 5) : CIPL_VN_SELLER;
  const g = isPacking ? 1 : 0; // geseran baris untuk lembar PL

  vnxlSet(ws, "A2", "Seller", VNXL_FONT_B);
  seller.forEach((t, i) => vnxlSet(ws, "A" + (3 + i), t));

  vnxlSet(ws, "A" + (10 - g), "Shipper", VNXL_FONT_B);
  CIPL_VN_SHIPPER.forEach((t, i) => vnxlSet(ws, "A" + (11 - g + i), t));

  vnxlSet(ws, "A" + (17 - g), "Consignee", VNXL_FONT_B);
  vnxlSet(ws, "A" + (18 - g), consignee, VNXL_FONT_B);
  alamat.slice(0, 6).forEach((t, i) => vnxlSet(ws, "A" + (19 - g + i), t));

  vnxlSet(ws, "E2", "Invoice No. and Date");
  vnxlSet(ws, "E3", row.doc_number || "", VNXL_FONT_B, VNXL_KIRI);
  ws.mergeCells("J3:K3");
  vnxlSet(ws, "J3", ciplXlsTanggal(row.doc_date), VNXL_FONT, VNXL_KANAN, VNXL_FMT_TGL);
  vnxlSet(ws, "E4", "L/C No. and Date ");
  vnxlSet(ws, "E6", "Notify(if other than consignee)");
  vnxlSet(ws, "E7", p.notifyParty || "SAME AS CONSIGNEE");
  vnxlSet(ws, "E8", "Other references");

  const poSemua =
    typeof poNoSemua === "function" ? poNoSemua(p) : [p.poNo].filter(Boolean);
  const refs = [
    " *SHIPPER : PT Dynamic Design Indonesia",
    " *COUNTRY OF ORIGIN : INDONESIA",
    " *P/O NO. : " + poSemua.join(", "),
    " *PACKING : " + (p.packing || "WOODEN PACKING"),
    "*PRICE TERM : " + (p.termsDelivery || ""),
    " *BANKER : Citibank Korea Inc",
    "                       Jungang Citi Service Center (27)",
    "                       (SWIFT : CITIKRSX)",
    " *ACCOUNT NO. : 1-089331-143-01",
    "                    DYNAMIC DESIGN CO.,LTD",
    " * HS-CODE : " + (p.hsCode || "8480.71 (Tire Mold)"),
  ];
  refs.forEach((t, i) => vnxlSet(ws, "E" + (9 + i), t));

  /* Garis pemisah blok: kiri, tengah, kanan -- sisi-per-sisi supaya
     tidak ada garis ganda di pertemuannya. */
  const rAkhir = 24 - g;
  for (let r = 2; r <= rAkhir; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "E" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }
  vnxlGarisBaris(ws, 3, 5, 11, "b");
  vnxlGarisBaris(ws, 5, 5, 11, "b");
  vnxlGarisBaris(ws, 9 - g, 1, 4, "b");
  vnxlGarisBaris(ws, 16 - g, 1, 4, "b");
  vnxlGarisBaris(ws, rAkhir, 1, 11, "b");
}

/* Blok pengangkutan. barisMulai berbeda antar lembar: CI mulai 25,
   PL mulai 24 -- mengikuti berkas aslinya. */
function vnxlBlokAngkutan(ws, row, shipment, barisMulai) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const r = barisMulai;

  vnxlSet(ws, "A" + r, "Departure date");
  ws.mergeCells(`C${r}:D${r}`);
  vnxlSet(
    ws,
    "C" + r,
    ciplXlsTanggal(p.sailingDate || (shipment && shipment.etd)),
    VNXL_FONT,
    VNXL_TENGAH,
    VNXL_FMT_TGL,
  );

  vnxlSet(ws, "A" + (r + 1), "Port of Loading");
  vnxlSet(ws, "C" + (r + 1), "Port of Discharge");
  ws.mergeCells(`A${r + 2}:B${r + 2}`);
  ws.mergeCells(`C${r + 2}:D${r + 2}`);
  vnxlSet(
    ws, "A" + (r + 2),
    p.portLoading || prof.portLoading || "",
    VNXL_FONT_B, VNXL_TENGAH,
  );
  vnxlSet(
    ws, "C" + (r + 2),
    p.portDischarge || prof.portDischarge || "",
    VNXL_FONT_B, VNXL_TENGAH,
  );

  vnxlSet(ws, "A" + (r + 3), "Vessel/Flight                        ");
  vnxlSet(ws, "C" + (r + 3), "Final Destination                       ");
  vnxlSet(ws, "E" + (r + 3), "Terms of delivery and payment");
  ws.mergeCells(`A${r + 4}:B${r + 4}`);
  ws.mergeCells(`C${r + 4}:D${r + 4}`);
  vnxlSet(
    ws, "A" + (r + 4),
    p.carrier || (shipment && carrierNameFromShipment(shipment)) || "",
    VNXL_FONT_B, VNXL_TENGAH,
  );
  vnxlSet(
    ws, "C" + (r + 4),
    p.finalDestination || prof.finalDestination || "",
    VNXL_FONT_B, VNXL_TENGAH,
  );
  vnxlSet(ws, "E" + (r + 4), p.termsPayment || "T/T 60 days after B/L date",
    VNXL_FONT, VNXL_TENGAH);

  for (let i = 0; i <= 4; i++) {
    vnxlSisi(ws, "A" + (r + i), "l");
    vnxlSisi(ws, "K" + (r + i), "r");
    vnxlGarisBaris(ws, r + i, 1, 11, "b");
  }
  for (let i = 1; i <= 4; i++) vnxlSisi(ws, "C" + (r + i), "l");
  for (let i = 3; i <= 4; i++) vnxlSisi(ws, "E" + (r + i), "l");
}

/* Tabel barang + baris penutup.

   `isPacking` mengubah tiga kolom terakhir saja: Unit Price/Amount
   menjadi Net Wt./Gross Wt. Sisanya identik, jadi dirakit dari satu
   tempat -- dua salinan akan pelan-pelan berbeda. */
function vnxlTabel(ws, row, shipment, barisKepala, isPacking) {
  const p = row.payload || {};
  const baris = ciplVnBaris(shipment);
  const total = ciplVnTotal(baris);
  const rk = barisKepala;

  ws.mergeCells(`A${rk}:B${rk}`);
  ws.mergeCells(`C${rk}:E${rk}`);
  ws.mergeCells(`F${rk}:G${rk}`);
  ws.mergeCells(`H${rk}:I${rk}`);
  ws.mergeCells(`J${rk}:K${rk}`);
  vnxlSet(ws, "A" + rk, "Marks & No. PKGS", VNXL_FONT, VNXL_TENGAH);
  vnxlSet(ws, "C" + rk, " Goods Description", VNXL_FONT, VNXL_TENGAH);
  vnxlSet(ws, "F" + rk, "Quantity", VNXL_FONT, VNXL_TENGAH);
  vnxlSet(ws, "H" + rk, isPacking ? "Net Wt." : "Unit Price", VNXL_FONT, VNXL_TENGAH);
  vnxlSet(ws, "J" + rk, isPacking ? "Gross Wt." : "Amount", VNXL_FONT, VNXL_TENGAH);
  ["A", "C", "F", "H", "J"].forEach((k) => vnxlSisi(ws, k + rk, "l"));
  vnxlSisi(ws, "K" + rk, "r");
  vnxlGarisBaris(ws, rk, 1, 11, "tb");

  vnxlSet(ws, "C" + (rk + 1), "#Description Info : SIZE, PTN, MOLD NO, PO", VNXL_FONT_B);

  /* Barang mulai DUA baris di bawah kepala: satu baris keterangan,
     satu baris kosong -- sama seperti berkas aslinya. */
  const r0 = rk + 3;
  baris.forEach((b, i) => {
    const r = r0 + i;
    ws.getRow(r).height = 13.5;
    ws.mergeCells(`A${r}:B${r}`);
    vnxlSet(ws, "A" + r, b.marks, VNXL_FONT, VNXL_TENGAH);
    /* Uraian dipecah dua sel: SIZE+PATTERN di C, MOLD NO di D --
       pembeli menyaring kolom D untuk mencocokkan cetakannya. */
    vnxlSet(ws, "C" + r, [b.size, b.pattern].filter(Boolean).join("  "),
      VNXL_FONT_KECIL, VNXL_TENGAH);
    vnxlSet(ws, "D" + r, b.moldNo || "", VNXL_FONT_KECIL, VNXL_TENGAH);
    vnxlSet(ws, "F" + r, b.qty, VNXL_FONT, VNXL_KANAN);
    vnxlSet(ws, "G" + r, b.satuan, VNXL_FONT, VNXL_TENGAH);
    if (isPacking) {
      vnxlSet(ws, "H" + r, b.netto, VNXL_FONT, VNXL_KANAN);
      vnxlSet(ws, "I" + r, "KG", VNXL_FONT, VNXL_TENGAH);
      vnxlSet(ws, "J" + r, b.bruto, VNXL_FONT, VNXL_KANAN);
      vnxlSet(ws, "K" + r, "KG", VNXL_FONT, VNXL_TENGAH);
    } else {
      vnxlSet(ws, "H" + r, "USD", VNXL_FONT, VNXL_TENGAH);
      vnxlSet(ws, "I" + r, b.harga, VNXL_FONT, VNXL_KANAN, VNXL_FMT_UANG);
      vnxlSet(ws, "J" + r, "USD", VNXL_FONT, VNXL_TENGAH);
      vnxlSet(ws, "K" + r, b.qty * b.harga, VNXL_FONT, VNXL_KANAN, VNXL_FMT_UANG);
    }
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  });

  const rAkhir = r0 + baris.length;

  /* Kotak tabel dipanjangkan sampai baris TOTAL supaya tepinya tidak
     putus di tengah, berapa pun jumlah barangnya. */
  const dimensi = isPacking ? ciplVnDimensi(baris) : [];
  const rTotal = Math.max(rAkhir + dimensi.length + 1, rk + (isPacking ? 18 : 26));

  /* Baris DIMENSION ditaruh TEPAT DI ATAS baris TOTAL, bukan menempel
     di bawah barangnya -- begitu susunannya pada berkas aslinya, dan
     posisinya ikut turun kalau tabelnya diperpanjang. */
  dimensi.forEach((teks, i) => {
    const r = rTotal - dimensi.length + i;
    vnxlSet(ws, "C" + r, teks, VNXL_FONT);
  });
  for (let r = r0; r < rTotal; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "C" + r, "l");
    vnxlSisi(ws, "F" + r, "l");
    vnxlSisi(ws, "H" + r, "l");
    vnxlSisi(ws, "J" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }

  return { rTotal, total, jumlah: baris.length };
}

/* Baris TOTAL + blok penutup (penanda pengapalan, BK NO., signed by). */
function vnxlPenutup(ws, row, shipment, info, isPacking) {
  const p = row.payload || {};
  const consignee = p.customer || (shipment && shipment.party) || "";
  const rt = info.rTotal;

  /* Penanda pengapalan: satu sel tinggi di kiri, teksnya membungkus --
     sama seperti berkas aslinya (A56:B61). */
  ws.mergeCells(`A${rt}:B${rt + 5}`);
  /* Akhiran badan hukum ("CO., LTD", "PT") dibuang dari penanda
     pengapalan: ruangnya sempit dan berkas aslinya menulisnya singkat
     -- penandanya untuk dibaca di gudang, bukan dokumen resmi. */
  const penanda = String(consignee)
    .replace(/[,\s]*(CO\.?,?\s*LTD\.?|LTD\.?|INC\.?)\s*$/i, "")
    .trim();
  vnxlSet(
    ws, "A" + rt,
    `Dynamic Design\n${penanda} ${row.doc_number || ""}`,
    VNXL_FONT,
    { horizontal: "center", vertical: "middle", wrapText: true },
  );

  vnxlSet(ws, "C" + rt, " TOTAL :", VNXL_FONT, VNXL_KANAN);
  vnxlSet(ws, "D" + rt, info.total.qty, VNXL_FONT, VNXL_TENGAH);
  vnxlSet(ws, "E" + rt, "BOX " + (p.packing || "WOODEN PACKING"), VNXL_FONT, VNXL_KIRI);
  if (isPacking) {
    vnxlSet(ws, "H" + rt, info.total.netto, VNXL_FONT_B, VNXL_KANAN);
    vnxlSet(ws, "I" + rt, "KGS", VNXL_FONT_B, VNXL_TENGAH);
    vnxlSet(ws, "J" + rt, info.total.bruto, VNXL_FONT_B, VNXL_KANAN);
    vnxlSet(ws, "K" + rt, "KGS", VNXL_FONT_B, VNXL_TENGAH);
  } else {
    vnxlSet(ws, "J" + rt, "USD", VNXL_FONT, VNXL_TENGAH);
    vnxlSet(ws, "K" + rt, info.total.nilai, VNXL_FONT, VNXL_KANAN, "#,##0.00_ ");
  }
  vnxlGarisBaris(ws, rt, 1, 11, "t");
  vnxlSisi(ws, "A" + rt, "l");
  vnxlSisi(ws, "K" + rt, "r");

  const bk = String(p.bookingNo || "").trim();
  if (bk) vnxlSet(ws, "E" + (rt + 3), "BK NO. " + bk, VNXL_FONT_B, VNXL_KIRI);
  vnxlSet(ws, "E" + (rt + 5), "signed by", VNXL_FONT, { vertical: "top" });

  /* Kotak penutup: tepi luar sampai baris terakhir. */
  for (let r = rt + 1; r <= rt + 5; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "C" + r, "l");
    vnxlSisi(ws, "E" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }
  vnxlGarisBaris(ws, rt + 2, 5, 11, "b");
  vnxlGarisBaris(ws, rt + 5, 1, 11, "b");
}

function vnxlLembar(wb, row, shipment, isPacking) {
  const ws = wb.addWorksheet(isPacking ? "PL" : "CI", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  vnxlKerangka(ws, isPacking ? "PACKING LIST" : "COMMERCIAL INVOICE");
  vnxlBlokAtas(ws, row, shipment, isPacking);
  /* CI mulai baris 25, PL 24 -- mengikuti berkas aslinya. */
  const rAngkut = isPacking ? 24 : 25;
  vnxlBlokAngkutan(ws, row, shipment, rAngkut);
  const info = vnxlTabel(ws, row, shipment, rAngkut + 5, isPacking);
  vnxlPenutup(ws, row, shipment, info, isPacking);
  return ws;
}

function ciplVnExcelInvoice(wb, row, shipment) {
  return vnxlLembar(wb, row, shipment, false);
}
function ciplVnExcelPacking(wb, row, shipment) {
  return vnxlLembar(wb, row, shipment, true);
}
