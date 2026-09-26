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

/* LEBAR KOLOM — dibaca langsung dari berkas Kumho aslinya, apa adanya.

   Kolom B 9,78 (bukan bawaan Excel 8,43): itu yang tertulis di sana.
   Pernah dikira B memakai bawaan, dan seluruh kolom sempat dikalikan
   1,309 untuk mengejar lebar cetak yang kurang -- keduanya keliru.
   Lebarnya tidak pernah kurang; yang bikin mengecil adalah fitToPage
   (lihat VNXL_HALAMAN di bawah). */
const VNXL_LEBAR_ASLI = {
  A: 9.78, B: 9.78, C: 12.22, D: 11.89, E: 9.78, F: 4.11, G: 4.0, H: 3.78,
  I: 7.22, J: 3.78, K: 8.78, L: 8.89, M: 8.89, N: 9.78, O: 10.89, P: 13.44,
  Q: 8.89, R: 11.22, S: 8.89,
};

/* SATUAN LEBAR KOLOM EXCEL BERGANTUNG PADA HURUF BAWAAN BERKAS.

   Angkanya bukan milimeter melainkan "berapa angka 0 yang muat" pada
   huruf normal buku kerja. Berkas Kumho memakai 돋움 (Dotum) 11 sebagai
   huruf normal; berkas yang kita hasilkan memakai Calibri 11, yang
   angkanya lebih sempit. Lebar 9,78 yang sama karena itu tercetak
   183 mm di sana dan hanya 157 mm di sini.

   Yang disamakan HASIL CETAKNYA, bukan angkanya: seluruh kolom
   dikalikan satu faktor. Perbandingan antar kolom tidak berubah, jadi
   sekat kolomnya tetap jatuh di tempat yang sama.

   FAKTORNYA DIKALIBRASI DARI CETAKAN EXCEL SUNGGUHAN, bukan LibreOffice.
   Faktor lama (1,096) diukur lewat konversi LibreOffice dan di sana
   menghasilkan 183 mm -- tapi Excel menggambar kolom lebih sempit
   daripada LibreOffice untuk berkas yang sama: di pratinjau cetak
   pengguna bingkainya hanya 154 mm, tingginya sudah memenuhi halaman,
   dan 43 mm di kanan kosong. Dikali 1,2 lagi, lembarnya jadi cukup
   lebar untuk dibatasi LEBAR halaman (bukan tingginya) di Excel,
   sehingga selebar kertas.

   Akibatnya di LibreOffice lembar ini sedikit lebih pendek daripada
   halaman (ia menggambar kolom lebih lebar, jadi diperkecil lebih
   banyak). Yang diutamakan Excel: di situlah berkas ini dibuka dan
   dicetak, oleh tim maupun oleh pembeli. */
const VNXL_SKALA_HURUF = 1.315;
/* LEMBAR PL PUNYA LEBAR KOLOMNYA SENDIRI di berkas asli -- bukan
   salinan lembar CI. Kolom H & J (Net Wt. / Gross Wt.) di sana 5,66,
   sementara di CI kolom yang sama (USD / USD) cuma 3,78.

   Dulu kedua lembar memakai lebar CI, dan berat berdesimal seperti
   "378,70" tidak muat di kolom 3,78: Excel menampilkannya sebagai
   "###". */
const VNXL_LEBAR_ASLI_PL = {
  A: 9.78, B: 11.33, C: 13.0, D: 13.33, E: 10.44, F: 6.0, G: 4.78,
  H: 5.66, I: 7.22, J: 5.66, K: 4.78,
};

const vnxlSkalakan = (tabel) =>
  Object.fromEntries(
    Object.entries(tabel).map(([k, v]) => [
      k,
      Math.round(v * VNXL_SKALA_HURUF * 100) / 100,
    ]),
  );
const VNXL_LEBAR = vnxlSkalakan(VNXL_LEBAR_ASLI);
const VNXL_LEBAR_PL = vnxlSkalakan(VNXL_LEBAR_ASLI_PL);

const VNXL_FMT_BERAT = "#,##0.00";
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
/* Hanya perataan TEGAK -- untuk label yang di berkas asli memakai
   perataan mendatar bawaan (General) tapi tetap di tengah baris. */
const VNXL_TENGAH_V = { vertical: "middle" };

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

function vnxlKerangka(ws, judul, isPacking) {
  const lebar = isPacking ? VNXL_LEBAR_PL : VNXL_LEBAR;
  Object.keys(lebar).forEach((k) => {
    ws.getColumn(k).width = lebar[k];
  });
  /* IRAMA BARIS MENGIKUTI LEMBAR CETAK, bukan angka mentah berkas
     asli. Berkas asli memakai 12,75pt (4,5 mm) untuk blok kepala;
     lembar cetak 3,76 mm.

     10,5pt, bukan 10,65: Excel menggambar tinggi baris dalam kelipatan
     piksel (0,75pt pada 96 dpi). 10,65 bukan kelipatannya dan dibulatkan
     ke atas jadi 11,25 -- tiap baris 6% lebih tinggi, dan lembarnya
     jadi terlalu tinggi sampai dibatasi tinggi halaman. 10,5 = 14 px,
     tidak ada yang dibulatkan. Memakai 12,75pt membuat blok kepalanya 16 mm
     lebih tinggi daripada cetakan, dan sisanya terdorong sampai
     tumpah ke halaman kedua. */
  ws.getRow(1).height = 25;
  for (let r = 2; r <= 29; r++) ws.getRow(r).height = 10.5;

  ws.mergeCells("A1:K1");
  vnxlSet(ws, "A1", judul, VNXL_JUDUL, VNXL_TENGAH);
  // Kotak judul bergaris MEDIUM atas & bawah (berkas asli: row 1 tM bM).
  vnxlGarisBaris(ws, 1, 1, 11, "tb", "medium");
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
  /* Kaki kotak Consignee: A-D saja. Kolom kanan (Other references)
     masih berlanjut ke bawah tanpa putus -- garis selebar lembar di
     sini memotong kotak keterangan jadi dua. */
  vnxlGarisBaris(ws, rAkhir, 1, 4, "b");
}

/* Blok pengangkutan. barisMulai berbeda antar lembar: CI mulai 25,
   PL mulai 24 -- mengikuti berkas aslinya. */
function vnxlBlokAngkutan(ws, row, shipment, barisMulai) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const r = barisMulai;

  vnxlSet(ws, "A" + r, "Departure date", VNXL_FONT, VNXL_TENGAH_V);
  ws.mergeCells(`C${r}:D${r}`);
  vnxlSet(
    ws,
    "C" + r,
    ciplXlsTanggal(p.sailingDate || (shipment && shipment.etd)),
    VNXL_FONT,
    VNXL_TENGAH,
    VNXL_FMT_TGL,
  );

  vnxlSet(ws, "A" + (r + 1), "Port of Loading", VNXL_FONT, VNXL_KIRI);
  vnxlSet(ws, "C" + (r + 1), "Port of Discharge", VNXL_FONT, VNXL_KIRI);
  ws.mergeCells(`A${r + 2}:B${r + 2}`);
  ws.mergeCells(`C${r + 2}:D${r + 2}`);
  vnxlSet(
    ws, "A" + (r + 2),
    p.portLoading || prof.portLoading || "",
    VNXL_FONT, VNXL_TENGAH,
  );
  vnxlSet(
    ws, "C" + (r + 2),
    p.portDischarge || prof.portDischarge || "",
    VNXL_FONT, VNXL_TENGAH,
  );

  vnxlSet(ws, "A" + (r + 3), "Vessel/Flight                        ", VNXL_FONT, VNXL_TENGAH_V);
  vnxlSet(ws, "C" + (r + 3), "Final Destination                       ", VNXL_FONT, VNXL_TENGAH_V);
  vnxlSet(ws, "E" + (r + 3), "Terms of delivery and payment", VNXL_FONT, VNXL_KIRI);
  ws.mergeCells(`A${r + 4}:B${r + 4}`);
  ws.mergeCells(`C${r + 4}:D${r + 4}`);
  vnxlSet(
    ws, "A" + (r + 4),
    p.carrier || (shipment && carrierNameFromShipment(shipment)) || "",
    VNXL_FONT_KECIL, VNXL_TENGAH,
  );
  vnxlSet(
    ws, "C" + (r + 4),
    p.finalDestination || prof.finalDestination || "",
    VNXL_FONT_KECIL, VNXL_TENGAH,
  );
  /* Rata KIRI, tanpa gabungan sel: teksnya lebih panjang dari kolom E,
     dan di Excel teks rata kiri meluber ke kolom kosong di kanannya.
     Dirata-tengahkan, ia terpotong di kedua sisi -- "T/T 60 " hilang
     dan yang terbaca cuma "days after B/L date". */
  vnxlSet(ws, "E" + (r + 4), p.termPayment || "T/T 60 days after B/L date",
    VNXL_FONT, VNXL_KIRI);

  /* GARIS BLOK ANGKUTAN — DIPETAKAN DARI BERKAS ASLI, garis demi garis.

     Dulu setiap baris blok ini diberi garis bawah selebar A-K. Di
     berkas asli tidak begitu:

       baris r   Departure date      garis bawah hanya A-D -- kolom
                                     kanan (Other references) tetap
                                     satu kotak yang utuh
       baris r+1 label pelabuhan     TANPA garis bawah: label & nilainya
       baris r+2 nilai pelabuhan     berbagi satu kotak; garis bawahnya
                                     selebar A-K (atap kotak Terms)
       baris r+3 label kapal         TANPA garis bawah, sama alasannya
       baris r+4 nilai kapal         garis bawah A-K

     Sekat tegak kiri-kanan (kolom E) menerus dari r sampai r+4;
     sebelumnya hanya r+3..r+4, jadi di baris Departure & pelabuhan
     kolom kiri dan kanan menyatu tanpa sekat. Sekat antara dua kolom
     pelabuhan/kapal (kolom C) mulai di r+1. */
  for (let i = 0; i <= 4; i++) {
    vnxlSisi(ws, "A" + (r + i), "l");
    vnxlSisi(ws, "K" + (r + i), "r");
    vnxlSisi(ws, "E" + (r + i), "l");
  }
  vnxlGarisBaris(ws, r, 1, 4, "b");
  vnxlGarisBaris(ws, r + 2, 1, 11, "b");
  vnxlGarisBaris(ws, r + 4, 1, 11, "b");
  for (let i = 1; i <= 4; i++) vnxlSisi(ws, "C" + (r + i), "l");
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
  // Atas & bawah kepala TIPIS -- begitu di berkas asli (row 30: ttbt).
  vnxlGarisBaris(ws, rk, 1, 11, "tb");

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
    ws.getRow(r).height = 11;
    ws.mergeCells(`A${r}:B${r}`);
    vnxlSet(ws, "A" + r, b.marks, VNXL_FONT, VNXL_TENGAH);
    /* Uraian dipecah dua sel: SIZE+PATTERN di C, MOLD NO di D --
       pembeli menyaring kolom D untuk mencocokkan cetakannya. */
    /* PERATAAN & UKURAN HURUF DIBACA DARI BERKAS ASLI, sel demi sel.

       Semuanya sempat rata tengah. Di berkas asli uraian & nomor
       cetakan RATA KIRI (C, D), dan Size+Pattern di lembar CI memakai
       9pt sementara di PL 10pt. Rata tengah membuat kolom uraian
       bergerigi: "225/50R17  PS72" dan "205/55R16  HS52" tidak lagi
       berawal di garis yang sama. */
    vnxlSet(ws, "C" + r, [b.size, b.pattern].filter(Boolean).join("  "),
      isPacking ? VNXL_FONT : VNXL_FONT_KECIL, VNXL_KIRI);
    vnxlSet(ws, "D" + r, b.moldNo || "", VNXL_FONT, VNXL_KIRI);
    vnxlSet(ws, "F" + r, b.qty, VNXL_FONT, VNXL_KANAN);
    vnxlSet(ws, "G" + r, b.satuan, VNXL_FONT, isPacking ? VNXL_TENGAH : VNXL_KIRI);
    if (isPacking) {
      /* Berat dengan DUA desimal ("378,70"), bukan bilangan bulat --
         berat per barang jarang bulat, dan membulatkannya membuat
         jumlah per barang tidak lagi cocok dengan totalnya. */
      vnxlSet(ws, "H" + r, b.netto, VNXL_FONT, VNXL_KANAN, VNXL_FMT_BERAT);
      vnxlSet(ws, "I" + r, "KG", VNXL_FONT, VNXL_KIRI);
      vnxlSet(ws, "J" + r, b.bruto, VNXL_FONT, VNXL_KANAN, VNXL_FMT_BERAT);
      vnxlSet(ws, "K" + r, "KG", VNXL_FONT, VNXL_KIRI);
    } else {
      vnxlSet(ws, "H" + r, "USD", VNXL_FONT, VNXL_TENGAH);
      vnxlSet(ws, "I" + r, b.harga, VNXL_FONT, VNXL_KANAN, VNXL_FMT_UANG);
      vnxlSet(ws, "J" + r, "USD", VNXL_FONT_KECIL, VNXL_KANAN);
      vnxlSet(ws, "K" + r, b.qty * b.harga, VNXL_FONT, VNXL_TENGAH, VNXL_FMT_UANG);
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
  /* Jarak baris TOTAL dari baris kepala. Berkas asli memakai 26 (CI)
     dan 18 (PL) pada baris 12,75pt; dengan irama 10,5pt di sini
     jaraknya disetel ulang supaya bidang barangnya seluas cetakan
     (~80 mm) dan kaki lembarnya jatuh di tempat yang sama. */
  /* PL diberi lebih banyak baris pengisi: kolomnya lebih lebar (lebar
     PL sendiri, lihat VNXL_LEBAR_ASLI_PL), jadi fitToPage memperkecil
     lembarnya lebih banyak dan tingginya ikut menyusut. Baris
     tambahan mengembalikan tinggi cetaknya ke ~238 mm. */
  /* +2: SELALU tersisa satu baris kosong di antara barang terakhir dan
     baris dimensi -- baris itu yang dipanjangkan ciplXlsPenuhiHalaman()
     supaya lembarnya setinggi kertas. Untuk jumlah barang biasa yang
     menentukan tetap jarak minimumnya, jadi tidak ada yang bergeser. */
  const rTotal = Math.max(rAkhir + dimensi.length + 2, rk + (isPacking ? 26 : 22));
  // Baris pengisi & baris TOTAL ikut irama yang sama.
  for (let r = rk + 1; r <= rTotal; r++) {
    if (ws.getRow(r).height == null) ws.getRow(r).height = 10.5;
  }

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
  // Garis bertitik sebagai sisi ATAS baris TOTAL (berkas asli: row 56 "t.").
  vnxlGarisBaris(ws, rTotal, 1, 11, "t", "dotted");

  return { rTotal, total, jumlah: baris.length, rPengisi: rTotal - dimensi.length - 1 };
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
    // Total berat ikut dua desimal, sama dengan berat per barangnya.
    vnxlSet(ws, "H" + rt, info.total.netto, VNXL_FONT_B, VNXL_KANAN, VNXL_FMT_BERAT);
    vnxlSet(ws, "I" + rt, "KGS", VNXL_FONT_B, VNXL_TENGAH);
    vnxlSet(ws, "J" + rt, info.total.bruto, VNXL_FONT_B, VNXL_KANAN, VNXL_FMT_BERAT);
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
  /* Kotak tanda tangan mulai LIMA baris di bawah TOTAL dan berakhir di
     baris ke-sembilan -- persis seperti berkas asli (CI: TOTAL 56,
     atap kotak 61, kaki bingkai 65; PL: 47 / 52 / 56). Dulu kotaknya
     hanya tiga baris, jadi bingkai bawahnya berhenti terlalu tinggi
     dan ruang tanda tangannya lebih sempit daripada aslinya. */
  vnxlSet(ws, "E" + (rt + 5), "signed by", VNXL_FONT, { vertical: "top" });

  /* Kotak penutup: tepi luar sampai baris terakhir.

     Sekat tegak di kolom E (batas kolom kiri/kanan) HANYA dipasang
     sepanjang kotak tanda tangan, bukan dari baris TOTAL. Di atas
     kotak itu kedua sisinya sama-sama kosong, jadi garisnya tidak
     memisahkan apa pun -- sama dengan lembar cetaknya. */
  for (let r = rt + 1; r <= rt + 9; r++) {
    vnxlSisi(ws, "A" + r, "l");
    vnxlSisi(ws, "K" + r, "r");
  }
  /* Sisi kiri kotak tanda tangan MEDIUM, sama tebal dengan bingkai
     luar -- begitu di berkas asli (E61..E65 semuanya lM). */
  for (let r = rt + 5; r <= rt + 9; r++) vnxlSisi(ws, "E" + r, "l", "medium");
  /* Atap kotak tanda tangan: MEDIUM, dipasang sebagai sisi ATAS baris
     kotaknya (berkas asli: row 61 E..K semuanya tM). */
  vnxlGarisBaris(ws, rt + 5, 5, 11, "t", "medium");
  vnxlGarisBaris(ws, rt + 9, 1, 11, "b", "medium");
  return rt + 9;
}

function vnxlLembar(wb, row, shipment, isPacking) {
  const ws = wb.addWorksheet(isPacking ? "PL" : "CI", {
    /* PENGATURAN HALAMAN DARI BERKAS ASLI, ANGKA DEMI ANGKA.

       fitToPage MATI dan skalanya 94% -- itu kuncinya. Dengan
       fitToPage menyala + fitToHeight 1, lembar yang lebih tinggi dari
       satu halaman diperkecil sampai muat, dan LEBARNYA ikut menyusut:
       bingkai yang seharusnya 183 mm tercetak 140 mm. Bukan lebar
       kolomnya yang kurang, melainkan halamannya yang diperkecil.

       Wilayah cetak menahan kolom L-S -- ada di berkas asli tapi di
       luar bingkai -- supaya tidak ikut ke halaman berikutnya. */
    pageSetup: Object.assign(
      {
        paperSize: 9,
        orientation: "portrait",
        /* fitToPage sebagai JARING PENGAMAN, bukan alat ukur: lebar &
           tinggi sudah disetel supaya muat satu halaman pada 100%,
           dan fitToPage hanya memperkecil kalau ternyata lewat --
           mencegah satu baris tambahan melempar separuh lembar ke
           halaman berikutnya. */
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        /* Kalau di suatu aplikasi lembarnya tetap sedikit lebih sempit
           daripada kertas, sisa ruangnya dibagi rata ke kiri & kanan --
           bukan menumpuk di kanan seperti potongan yang terlupa. */
        horizontalCentered: true,
        margins: {
          left: 0.5118, right: 0.4724, top: 0.5906, bottom: 0.5906,
          header: 0.4331, footer: 0.5512,
        },
      },
      // printArea disetel setelah isinya jadi -- lihat vnxlLembar().
    ),
    /* GARIS KISI DIMATIKAN. Lembar ini sudah punya garis tabelnya
       sendiri; kisi bawaan Excel menambah garis kedua di seluruh
       halaman dan membuat kotaknya tidak lagi terbaca sebagai bentuk
       dokumen. */
    views: [{ showGridLines: false }],
  });
  vnxlKerangka(ws, isPacking ? "PACKING LIST" : "COMMERCIAL INVOICE", isPacking);
  vnxlBlokAtas(ws, row, shipment, isPacking);
  /* CI mulai baris 25, PL 24 -- mengikuti berkas aslinya. */
  const rAngkut = isPacking ? 24 : 25;
  vnxlBlokAngkutan(ws, row, shipment, rAngkut);
  const info = vnxlTabel(ws, row, shipment, rAngkut + 5, isPacking);
  const barisAkhir = vnxlPenutup(ws, row, shipment, info, isPacking);
  vnxlBingkaiLuar(ws, barisAkhir);
  /* WILAYAH CETAK PERSIS SEBATAS ISINYA.

     Dipatok ke baris tetap (A1:K65), baris kosong di bawah bingkai
     ikut terbawa dan mendorong terbitnya satu halaman kosong di
     antara CI dan PL. */
  ws.pageSetup.printArea = "A1:K" + barisAkhir;
  /* Setinggi kertas: jarak ke tepi bawah sama dengan ke tepi atas (margin
     0,59" keduanya), bukan berhenti di tengah kertas. */
  /* Kotak tanda tangan (rt+5..rt+9) setinggi 50 mm di kertas, muat
     stempel perusahaan. rt+5 -- baris "signed by" -- tidak diubah: ia
     juga baris terakhir blok penanda pengapalan di kiri (A:B gabung
     rt..rt+5), dan memanjangkannya menggeser teks penanda itu.
     Tambahannya masuk ke empat baris di bawahnya. */
  if (typeof ciplXlsTinggiTercetak === "function") {
    const rt = info.rTotal;
    const labelMm = ((ws.getRow(rt + 5).height || 15) / 72) * 25.4 * ciplXlsSkalaCetak(ws);
    ciplXlsTinggiTercetak(ws, rt + 6, rt + 9, XLS_TTD_MM - labelMm);
  }
  if (typeof ciplXlsPenuhiHalaman === "function") ciplXlsPenuhiHalaman(ws, info.rPengisi);
  return ws;
}

function ciplVnExcelInvoice(wb, row, shipment) {
  return vnxlLembar(wb, row, shipment, false);
}
function ciplVnExcelPacking(wb, row, shipment) {
  return vnxlLembar(wb, row, shipment, true);
}
