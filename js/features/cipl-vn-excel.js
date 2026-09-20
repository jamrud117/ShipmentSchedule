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

/* LEBAR KOLOM — PERBANDINGANNYA dari berkas asli, UKURANNYA disetel
   supaya lembar ini tercetak selebar lembar cetak CIPL (183,1 mm).

   Angka mentah dari berkas asli hanya menghasilkan 139,9 mm -- diukur
   dari hasil cetaknya, bukan dikira-kira. Selisihnya tetap 1,309x di
   semua kolom, jadi yang dikalikan cukup satu faktor dan perbandingan
   antar kolom tidak berubah: sekat kolomnya tetap jatuh di 50,7%
   seperti aslinya.

   Kolom B DIBERI lebar eksplisit (dulu dibiarkan bawaan Excel): kalau
   ia satu-satunya yang tidak ikut diperbesar, perbandingan kolom
   kirinya melenceng dan sekatnya bergeser. */
const VNXL_SKALA = 1.309;
const VNXL_LEBAR_ASLI = {
  A: 9.78, B: 8.43, C: 12.22, D: 11.89, E: 9.78, F: 4.11, G: 4.0, H: 3.78,
  I: 7.22, J: 3.78, K: 8.78, L: 8.89, N: 9.78, O: 10.89, P: 13.44,
  Q: 8.89, R: 11.22, S: 8.89,
};
const VNXL_LEBAR = Object.fromEntries(
  Object.entries(VNXL_LEBAR_ASLI).map(([k, v]) => [k, Math.round(v * VNXL_SKALA * 100) / 100]),
);

const VNXL_FMT_UANG = '#,##0.00_);[Red](#,##0.00)';
/* dd/mm/yyyy -- sama dengan lembar cetaknya (ciplVnTanggal). Bentuk
   mm-dd-yy dari berkas asli terbaca sebagai tanggal yang SAMA SEKALI
   LAIN di sini: 09/12 berarti 9 Desember, bukan 12 September. */
const VNXL_FMT_TGL = "dd/mm/yyyy";

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
/* Nilai pelabuhan/kapal menjorok satu huruf dari labelnya -- padanan
   padding-left 3mm pada .vn-nilai di lembar cetak. */
const VNXL_KIRI_JOROK = { horizontal: "left", vertical: "middle", indent: 1 };

/* Garis tipis pada sisi tertentu saja. Menyetel keliling pada tiap sel
   menghasilkan garis ganda di pertemuannya -- berkas aslinya memakai
   sisi-per-sisi. */
function vnxlSisi(ws, alamat, sisi, gaya) {
  const c = ws.getCell(alamat);
  const b = Object.assign({}, c.border);
  String(sisi || "")
    .split("")
    .forEach((s) => {
      const nama = { l: "left", r: "right", t: "top", b: "bottom" }[s];
      if (nama) b[nama] = { style: gaya || "thin" };
    });
  c.border = b;
}

function vnxlGarisBaris(ws, baris, kolomAwal, kolomAkhir, sisi, gaya) {
  for (let i = kolomAwal; i <= kolomAkhir; i++) {
    vnxlSisi(ws, ws.getRow(baris).getCell(i).address, sisi, gaya);
  }
}

/* Bingkai luar SELALU medium, sama dengan lembar cetak (0,7 mm).
   Dipanggil di ujung supaya menimpa garis tipis yang sudah dipasang
   blok-blok di dalamnya -- kalau dipasang lebih dulu, sisi yang sama
   ditulis ulang jadi tipis oleh blok berikutnya. */
function vnxlBingkaiLuar(ws, barisAkhir) {
  vnxlGarisBaris(ws, 1, 1, 11, "t", "medium");
  vnxlGarisBaris(ws, barisAkhir, 1, 11, "b", "medium");
  for (let r = 1; r <= barisAkhir; r++) {
    vnxlSisi(ws, "A" + r, "l", "medium");
    vnxlSisi(ws, "K" + r, "r", "medium");
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
  /* Huruf biasa. Di berkas rujukan hanya JUDUL kotak (Seller,
     Shipper, Consignee) yang tebal; isinya -- termasuk nama consignee
     dan nomor invoice -- tidak. */
  vnxlSet(ws, "A" + (18 - g), consignee, VNXL_FONT);
  alamat.slice(0, 6).forEach((t, i) => vnxlSet(ws, "A" + (19 - g + i), t));

  vnxlSet(ws, "E2", "Invoice No. and Date");
  vnxlSet(ws, "E3", row.doc_number || "", VNXL_FONT, VNXL_KIRI);
  ws.mergeCells("J3:K3");
  vnxlSet(ws, "J3", ciplXlsTanggal(row.doc_date), VNXL_FONT, VNXL_KANAN, VNXL_FMT_TGL);
  vnxlSet(ws, "E4", "L/C No. and Date ");
  vnxlSet(ws, "E6", "Notify(if other than consignee)");
  vnxlSet(ws, "E7", p.notifyParty || "SAME AS CONSIGNEE");
  vnxlSet(ws, "E8", "Other references");

  /* Tanpa baris *P/O NO. & * HS-CODE -- sama seperti lembar cetaknya.
     Keduanya tetap tersimpan di pengajuan dan dipakai dokumen lain;
     lembar Kumho saja yang tidak mencantumkannya. */
  /* Tanpa spasi di depan: di berkas asli baris pertama menjorok satu
     spasi sementara sisanya tidak, jadi "*SHIPPER" tampak tidak
     sebaris dengan "*COUNTRY OF ORIGIN" di bawahnya. Lembar cetak
     meratakan semuanya, dan ini menyamakannya. */
  const refs = [
    "*SHIPPER : PT Dynamic Design Indonesia",
    "*COUNTRY OF ORIGIN : INDONESIA",
    "*PACKING : " + (p.packing || "WOODEN PACKING"),
    "*PRICE TERM : " + (p.termsDelivery || ""),
    "*BANKER : Citibank Korea Inc",
    "                       Jungang Citi Service Center (27)",
    "                       (SWIFT : CITIKRSX)",
    "*ACCOUNT NO. : 1-089331-143-01",
    "                    DYNAMIC DESIGN CO.,LTD",
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
    VNXL_FONT, VNXL_KIRI_JOROK,
  );
  vnxlSet(
    ws, "C" + (r + 2),
    p.portDischarge || prof.portDischarge || "",
    VNXL_FONT, VNXL_KIRI_JOROK,
  );

  vnxlSet(ws, "A" + (r + 3), "Vessel/Flight                        ");
  vnxlSet(ws, "C" + (r + 3), "Final Destination                       ");
  vnxlSet(ws, "E" + (r + 3), "Terms of delivery and payment");
  ws.mergeCells(`A${r + 4}:B${r + 4}`);
  ws.mergeCells(`C${r + 4}:D${r + 4}`);
  vnxlSet(
    ws, "A" + (r + 4),
    p.carrier || (shipment && carrierNameFromShipment(shipment)) || "",
    VNXL_FONT, VNXL_KIRI_JOROK,
  );
  vnxlSet(
    ws, "C" + (r + 4),
    p.finalDestination || prof.finalDestination || "",
    VNXL_FONT, VNXL_KIRI_JOROK,
  );
  /* Rata KIRI, tanpa gabungan sel: teksnya lebih panjang dari kolom E,
     dan di Excel teks rata kiri meluber ke kolom kosong di kanannya.
     Dirata-tengahkan, ia terpotong di kedua sisi -- "T/T 60 " hilang
     dan yang terbaca cuma "days after B/L date". */
  vnxlSet(ws, "E" + (r + 4), p.termPayment || "T/T 60 days after B/L date",
    VNXL_FONT, VNXL_KIRI_JOROK);

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
  /* Sekat kolom pada BARIS KEPALA saja, dan bertitik -- sama dengan
     lembar cetak. Kolom A tidak ikut: sisi kirinya bagian dari bingkai
     luar, bukan sekat antar kolom. */
  ["C", "F", "H", "J"].forEach((k) => vnxlSisi(ws, k + rk, "l", "dotted"));
  vnxlGarisBaris(ws, rk, 1, 11, "t");
  // Garis bawah kepala lebih tegas (2 px pada rujukan).
  vnxlGarisBaris(ws, rk, 1, 11, "b", "medium");

  vnxlSet(ws, "C" + (rk + 1), "#Description Info : SIZE, PTN, MOLD NO, PO", VNXL_FONT_B);

  /* Barang mulai DUA baris di bawah kepala: satu baris keterangan,
     satu baris kosong -- sama seperti berkas aslinya. */
  const r0 = rk + 3;

  /* DUA BARIS ANTARA KEPALA & BARANG IKUT DIBERI TEPI.

     Keduanya tidak berisi barang, jadi mudah terlewat -- dan memang
     terlewat: bingkai luar lembar CI bolong di baris 31-32 (PL di
     30-31), satu-satunya potongan tepi yang putus di seluruh
     halaman. Ketahuan setelah berkas .xlsx-nya benar-benar dibuka dan
     tepi tiap barisnya ditelusuri, bukan dari membaca kode. */
  for (let r = rk + 1; r < r0; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }
  baris.forEach((b, i) => {
    const r = r0 + i;
    /* 11pt (3,9 mm): sedekat mungkin dengan baris barang di lembar
       cetak. 13,5pt membuat blok barangnya jauh lebih longgar
       daripada cetakan untuk jumlah barang yang sama. */
    ws.getRow(r).height = 11;
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
  /* Tinggi minimum bidang barang disetel supaya lembar ini tercetak
     SETINGGI lembar cetaknya: CI ~248 mm, PL ~238 mm (PL memang lebih
     pendek -- wilayah cetaknya begitu di berkas rujukan). Diukur dari
     hasil konversi ke PDF, bukan dikira-kira. */
  const rTotal = Math.max(rAkhir + dimensi.length + 1, rk + (isPacking ? 23 : 26));

  /* Baris DIMENSION ditaruh TEPAT DI ATAS baris TOTAL, bukan menempel
     di bawah barangnya -- begitu susunannya pada berkas aslinya, dan
     posisinya ikut turun kalau tabelnya diperpanjang. */
  dimensi.forEach((teks, i) => {
    const r = rTotal - dimensi.length + i;
    vnxlSet(ws, "C" + r, teks, VNXL_FONT);
  });
  /* BADAN TABEL TANPA SEKAT TEGAK DI DALAMNYA -- sama dengan lembar
     cetak dan dengan berkas rujukan, yang menggambar bidang barang
     sebagai satu kotak kosong. Sekat kolom hanya ada di baris kepala
     (bertitik) dan berhenti di situ. */
  for (let r = r0; r < rTotal; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }
  // Garis bertitik tepat di atas baris TOTAL.
  vnxlGarisBaris(ws, rTotal - 1, 1, 11, "b", "dotted");

  return { rTotal, total, jumlah: baris.length };
}

/* Baris TOTAL + blok penutup (penanda pengapalan, signed by). */
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
  /* Baris TOTAL: tanpa garis atas sendiri -- yang membatasinya adalah
     garis BERTITIK di kaki baris sebelumnya (dipasang di vnxlTabel). */
  vnxlSisi(ws, "A" + rt, "l");
  vnxlSisi(ws, "K" + rt, "r");

  /* Di baris PERTAMA kotaknya (rt+3), bukan baris terakhir: kotak
     tanda tangan membentang rt+3..rt+5, dan tulisannya menempel di
     tepi ATAS kotak -- sama seperti lembar cetak. Ditulis di baris
     terakhir, ia tampil di dasar kotak seolah tanda tangannya
     ditaruh di bawah keterangannya. */
  vnxlSet(ws, "E" + (rt + 3), "signed by", VNXL_FONT, { vertical: "top" });

  /* Kotak penutup: tepi luar sampai baris terakhir.

     Sekat tegak di kolom E (batas kolom kiri/kanan) HANYA dipasang
     sepanjang kotak tanda tangan, bukan dari baris TOTAL. Di atas
     kotak itu kedua sisinya sama-sama kosong, jadi garisnya tidak
     memisahkan apa pun -- sama dengan lembar cetaknya. */
  for (let r = rt + 1; r <= rt + 5; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }
  for (let r = rt + 3; r <= rt + 5; r++) vnxlSisi(ws, "E" + r, "l");
  // Garis mendatar di atas "signed by" -- atap kotak tanda tangan.
  vnxlGarisBaris(ws, rt + 2, 5, 11, "b");
  vnxlGarisBaris(ws, rt + 5, 1, 11, "b");
  return rt + 5;
}

function vnxlLembar(wb, row, shipment, isPacking) {
  const ws = wb.addWorksheet(isPacking ? "PL" : "CI", {
    /* MARGIN & WILAYAH CETAK MENGIKUTI LEMBAR CETAK CIPL.

       Diukur dari berkas rujukan: bingkai mulai 12,9 mm dari tepi kiri
       (0,508"), 14,8 mm dari atas (0,583"), dan berakhir 13,7 mm dari
       tepi kanan (0,539"). Tanpa wilayah cetak, kolom L-S -- yang ada
       di berkas asli tapi di luar bingkai -- ikut terbawa ke halaman
       kedua. */
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      printArea: "A1:K61",
      margins: {
        left: 0.508, right: 0.539, top: 0.583, bottom: 0.394,
        header: 0, footer: 0,
      },
    },
    /* GARIS KISI DIMATIKAN. Lembar ini sudah punya garis tabelnya
       sendiri; kisi bawaan Excel menambah garis kedua di seluruh
       halaman dan membuat kotaknya tidak lagi terbaca sebagai bentuk
       dokumen. */
    views: [{ showGridLines: false }],
  });
  vnxlKerangka(ws, isPacking ? "PACKING LIST" : "COMMERCIAL INVOICE");
  vnxlBlokAtas(ws, row, shipment, isPacking);
  /* CI mulai baris 25, PL 24 -- mengikuti berkas aslinya. */
  const rAngkut = isPacking ? 24 : 25;
  vnxlBlokAngkutan(ws, row, shipment, rAngkut);
  const info = vnxlTabel(ws, row, shipment, rAngkut + 5, isPacking);
  const barisAkhir = vnxlPenutup(ws, row, shipment, info, isPacking);
  vnxlBingkaiLuar(ws, barisAkhir);
  return ws;
}

function ciplVnExcelInvoice(wb, row, shipment) {
  return vnxlLembar(wb, row, shipment, false);
}
function ciplVnExcelPacking(wb, row, shipment) {
  return vnxlLembar(wb, row, shipment, true);
}
