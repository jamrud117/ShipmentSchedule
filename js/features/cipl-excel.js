"use strict";

/* UNDUH CIPL SEBAGAI EXCEL

   Tiga lembar dalam satu berkas — INVOICE, PL, SI — mengikuti berkas
   contoh yang dipakai tim.

   Datanya diambil dari fungsi yang SAMA dengan versi cetak
   (ciplBarisBarang, ciplTotalKoli, ciplPecahNama). Membangun ulang
   perhitungannya di sini berarti dua sumber angka yang akan berbeda
   pelan-pelan — dan yang satu tercetak, yang satu terkirim ke
   forwarder.
*/

function ciplXlsTanggal(iso) {
  const d = parseLocalDate(iso);
  return d || "";
}

/* Menggabung sel tanpa menggagalkan seluruh penyusunan.

   ExcelJS melempar kalau rentangnya bersinggungan dengan gabungan yang
   sudah ada. Gagal menggabung hanya membuat satu judul tidak terpusat —
   jauh lebih ringan daripada kehilangan seluruh berkasnya. */
function ciplXlsGabung(ws, rentang) {
  try {
    ws.mergeCells(rentang);
  } catch (e) {
    console.warn("gabung sel dilewati:", rentang, e && e.message);
  }
}

const XLS_ARIAL = { name: "Arial", size: 9 };
const XLS_KECIL = { name: "Arial", size: 7 };

function ciplXlsSet(ws, alamat, nilai, font, rata) {
  const c = ws.getCell(alamat);
  c.value = nilai;
  if (font) c.font = font;
  if (rata) c.alignment = rata;
  return c;
}

/* KOP & BLOK PIHAK — koordinat sel mengikuti berkas asli persis.

   Dibangun dengan menaruh nilai pada alamat tertentu, bukan dengan
   addRow berurutan. Menyusun baris satu per satu membuat posisinya
   bergeser begitu jumlah baris alamat berbeda — dan seluruh blok kanan
   ikut melenceng, karena ia disandingkan menurut nomor baris. */
/* Logo perusahaan. SJ_LOGO berupa data URL; ExcelJS meminta base64
   tanpa awalan "data:...;base64,". */
function ciplXlsLogo(wb, ws) {
  try {
    const m = /^data:image\/(\w+);base64,(.+)$/.exec(SJ_LOGO || "");
    if (!m) return;
    const id = wb.addImage({ base64: m[2], extension: m[1] });
    ws.addImage(id, { tl: { col: 0.2, row: 0.3 }, ext: { width: 52, height: 52 } });
  } catch (e) {
    /* Logo hanya hiasan kop — kegagalan memuatnya tidak boleh
       menggagalkan seluruh berkas. */
    console.warn("logo dilewati:", e && e.message);
  }
}

/* ------------------------------------------------------------------
   GARIS — SATU BATAS, SATU PEMILIK

   Versi cetak menggambar SATU bingkai luar (.ci-box) mengelilingi
   seluruh dokumen, lalu mengisi bagian dalamnya dengan pemisah. Versi
   ini dulu melakukan kebalikannya: tiap blok diberi kotaknya sendiri,
   dan bagian bawah — daftar barang, ruang kosong, Total, tanda tangan —
   tidak dilingkupi apa pun.

   Akibatnya bukan sekadar beda gaya. Pada cetakan, sisi kiri & kanan
   halaman adalah satu garis lurus dari kop sampai kotak tanda tangan;
   pada Excel, garis itu putus tepat di bawah baris barang dan kotak
   Total tampak melayang di tengah halaman kosong.

   Sekarang keduanya memakai model yang sama: bingkai luar digambar
   TERAKHIR (setelah seluruh isi), pemisah di dalamnya digambar per
   sisi — bukan per kotak — supaya tidak ada batas yang digambar dua
   kali.
------------------------------------------------------------------ */
const XLS_GARIS = { style: "thin" };

/* Menambah SATU sisi tanpa menghapus sisi yang sudah ada.

   Penting untuk sel gabungan: ExcelJS memakai bersama satu objek gaya
   untuk seluruh rentang, jadi menimpa `border` di satu sel menghapus
   garis yang tadi digambar di sel lain pada rentang yang sama. */
function ciplXlsSisi(ws, r, c, sisi) {
  const sel = ws.getRow(r).getCell(c);
  const b = Object.assign({}, sel.border);
  b[sisi] = XLS_GARIS;
  sel.border = b;
  /* Seluruh area berkotak rata tengah tegak; kop & pita judul di
     atasnya tidak. Sel yang cuma kena garis pun ikut — di rujukan
     gayanya sama rata, dan sel kosong yang tertinggal rata bawah baru
     kelihatan kalau nanti ada yang mengetik di situ.

     Perataan yang sudah ada tidak diganggu, supaya kotak tanda tangan
     tetap rata atas. */
  if (r >= XLS_BARIS_PIHAK && !sel.alignment) sel.alignment = XLS_TEGAK;
}

function ciplXlsGarisBawah(ws, baris, c1, c2) {
  for (let c = c1; c <= c2; c++) ciplXlsSisi(ws, baris, c, "bottom");
}

function ciplXlsGarisAtas(ws, baris, c1, c2) {
  for (let c = c1; c <= c2; c++) ciplXlsSisi(ws, baris, c, "top");
}

function ciplXlsGarisKanan(ws, kolom, r1, r2) {
  for (let r = r1; r <= r2; r++) ciplXlsSisi(ws, r, kolom, "right");
}

/* Bingkai luar — padanan .ci-box pada cetakan.

   Dipanggil PALING AKHIR. ciplXlsKotak() menimpa seluruh sisi sebuah
   sel; kalau bingkainya digambar lebih dulu, sisi kanan pada kolom J
   dan sisi bawah pada baris terakhir akan terhapus oleh kotak barang. */
function ciplXlsBingkaiLuar(ws, barisAkhir) {
  for (let r = 1; r <= barisAkhir; r++) {
    ciplXlsSisi(ws, r, 1, "left");
    ciplXlsSisi(ws, r, 10, "right");
  }
  for (let c = 1; c <= 10; c++) {
    ciplXlsSisi(ws, 1, c, "top");
    ciplXlsSisi(ws, barisAkhir, c, "bottom");
  }
}

/* ==================================================================
   TATA LETAK MENGIKUTI BERKAS RUJUKAN

   Nomor baris, lebar kolom, gabungan sel, font, dan perataan di bawah
   ini BUKAN pilihan gaya — semuanya disalin dari berkas rujukan
   DDI-CRBM-VIII-042.xlsx. Menggesernya "supaya lebih rapi" membuat
   hasil unduhan tidak lagi sama dengan berkas yang beredar ke
   forwarder dan bea cukai negara tujuan.

   Ada uji yang membandingkan hasilnya sel per sel dengan rujukan itu.
================================================================== */

const XLS_BARIS_PIHAK = 9;   // awal area berkotak
const XLS_BARIS_ITEM = 30;   // barang pertama
const XLS_MIN_BARIS = 16;    // 30..45; baris Total selalu jatuh di 46
const XLS_BARIS_KOP = { 2: 20.25, 7: 22.5 };

const XLS_TEBAL = { name: "Arial", size: 8, bold: true };
/* "middle", bukan "center".

   ExcelJS memakai kosakata CSS untuk rata tegak (top/middle/bottom) dan
   MEMBUANG diam-diam nilai yang tidak dikenalnya. Ditulis "center",
   perataannya hilang tanpa galat — selnya tampak benar di kode dan
   rata bawah di Excel. */
const XLS_TENGAH = { horizontal: "center", vertical: "middle" };
const XLS_TEGAK = { vertical: "middle" };
const XLS_KANAN = { horizontal: "right", vertical: "middle" };

/* Excel menyimpan spasi dalam format angka sebagai karakter lolos.
   Ditulis polos, berkasnya menyimpan "dd mmm yyyy" dan tidak lagi
   sebanding sel-per-sel dengan rujukan walau tampil sama. */
const XLS_FMT_TANGGAL = "dd\\ mmm\\ yyyy";

function ciplXlsBarisTotal(jumlahBarang) {
  return XLS_BARIS_ITEM + Math.max(jumlahBarang, XLS_MIN_BARIS);
}

/* Angka yang ditulis SEBAGAI ANGKA, bukan teks.

   Kode HS di rujukan tersimpan sebagai bilangan biasa. Menyimpannya
   sebagai teks membuat selnya bertanda segitiga hijau di Excel dan
   tidak ikut terjumlah kalau ada yang menyalinnya ke lembar lain. */
function ciplXlsAngka(v) {
  const t = String(v == null ? "" : v).trim();
  if (t !== "" && /^\d+$/.test(t)) return Number(t);
  return t;
}

function ciplXlsKerangka(wb, ws, judul, lebar) {
  lebar.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  Object.entries(XLS_BARIS_KOP).forEach(([r, h]) => (ws.getRow(+r).height = h));
  ciplXlsLogo(wb, ws);

  ciplXlsSet(ws, "B2", CIPL_PERUSAHAAN.nama,
    { name: "Times New Roman", size: 16, bold: true }, { horizontal: "center" });
  ciplXlsSet(ws, "B3", CIPL_PERUSAHAAN.pusat, XLS_KECIL, { horizontal: "center" });
  ciplXlsSet(ws, "B4", CIPL_PERUSAHAAN.cabang, XLS_KECIL, { horizontal: "center" });
  ["B2:J2", "B3:J3", "B4:J4"].forEach((r) => ciplXlsGabung(ws, r));

  ciplXlsSet(ws, "A7", judul,
    { name: "Times New Roman", size: 18, bold: true }, { horizontal: "center" });
  ciplXlsGabung(ws, "A7:J7");

  /* Pita judul: garis atas & bawahnya saja. Sisi kiri & kanan diambil
     alih bingkai luar. */
  ciplXlsGarisBawah(ws, 5, 1, 10);
  ciplXlsGarisBawah(ws, 8, 1, 10);
}

/* Blok pihak & pengangkutan, rows 9-28.

   Kolom kiri (A:D) dan kanan (E:J) adalah dua tumpukan yang berdiri
   sendiri; sekatnya jatuh di baris yang berbeda, jadi tidak bisa
   diturunkan dari satu daftar bersama. */
function ciplXlsBlokPihak(ws, row, shipment) {
  const p = row.payload || {};
  const consignee = [
    p.customer || (shipment && shipment.party) || "",
    ...ciplBarisTeks(p.consigneeAddress),
  ].filter(Boolean);

  for (let r = 9; r <= 24; r++) ciplXlsGabung(ws, `A${r}:D${r}`);
  ciplXlsGabung(ws, "A25:D26");

  ciplXlsSet(ws, "A9", "Shipper/Seller", XLS_TEBAL, XLS_TEGAK);
  CIPL_SHIPPER.forEach((x, i) => ciplXlsSet(ws, `A${10 + i}`, x, XLS_ARIAL, XLS_TEGAK));
  ciplXlsSet(ws, "A17", "Consignee/Buyer", XLS_TEBAL, XLS_TEGAK);
  consignee.slice(0, 6).forEach((x, i) =>
    ciplXlsSet(ws, `A${18 + i}`, x, XLS_ARIAL, XLS_TEGAK));
  ciplXlsSet(ws, "A24", "Notify Party", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "A25", p.notifyParty || "SAME AS CONSIGNEE", XLS_ARIAL, XLS_TEGAK);

  ["E9:J9", "E10:G10", "E14:J14", "E17:J17", "E18:J18", "E20:J20",
   "E21:J21", "E22:J23", "E24:J24", "E26:J26"].forEach((r) => ciplXlsGabung(ws, r));

  ciplXlsSet(ws, "E9", "Invoice No. & Date", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E10", row.doc_number || "", XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "J10", ciplXlsTanggal(row.doc_date), XLS_ARIAL,
    XLS_KANAN).numFmt = XLS_FMT_TANGGAL;
  ciplXlsSet(ws, "E14", "PO No. & Date", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E15", p.poNo || "", XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "J15", ciplXlsTanggal(p.poDate), XLS_ARIAL,
    XLS_KANAN).numFmt = XLS_FMT_TANGGAL;
  ciplXlsSet(ws, "E17", "Terms of Delivery", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E18", p.termsDelivery || "", XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "E21", "Term of Payment", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E22", p.termPayment || "", XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "E24", "Remarks", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E26", p.remarks || "", XLS_ARIAL, XLS_TEGAK);

  ["A27:B27", "A28:B28", "E27:J27", "E28:J28"].forEach((r) => ciplXlsGabung(ws, r));
  ciplXlsSet(ws, "A27", "Port of Loading", XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "C27", "Carrier", XLS_TEBAL, XLS_TENGAH);
  /* SATU tulisan untuk kedua lembar.

     Berkas rujukan menuliskan ketiga sel ini berbeda antara INVOICE dan
     PL: "about" vs "About", spasi di depan "Invoice No. & Date", dan
     Final Destination rata tengah di satu lembar tapi rata kiri di
     lembar lain. Perbedaan itu kecelakaan, bukan aturan bea cukai —
     Yogi memutuskan menyeragamkannya: sailing ikut bentuk PL, dua
     lainnya ikut bentuk Invoice.

     Karena itu ketiganya TIDAK lagi jadi parameter per lembar. Sebuah
     parameter yang kedua pemanggilnya mengisi sama hanya menyisakan
     kesan bahwa keduanya boleh berbeda. */
  ciplXlsSet(ws, "D27", "Sailing on or About", { name: "Arial", size: 8 }, XLS_TENGAH);
  ciplXlsSet(ws, "E27", "Final Destination", XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "A28", p.portLoading || (shipment ? portCodeLabel(shipment.origin) : ""),
    XLS_ARIAL, XLS_TENGAH);
  ciplXlsSet(ws, "C28", p.carrier || (shipment && shipment.vessel) || "",
    XLS_ARIAL, XLS_TENGAH);
  ciplXlsSet(ws, "D28", ciplXlsTanggal(p.sailingDate), XLS_ARIAL, XLS_TENGAH);
  ciplXlsSet(ws, "E28", p.finalDestination || (shipment ? portCodeLabel(shipment.destination) : ""),
    XLS_ARIAL, XLS_TENGAH);

  /* Sekat. Dua tumpukan, dua deret nomor baris — hanya tiga di
     antaranya kebetulan sejajar (16, 23, 26) dan tergambar selebar
     halaman. */
  ciplXlsGarisKanan(ws, 4, 9, 28);              // pemisah kiri | kanan
  [13, 20].forEach((r) => ciplXlsGarisBawah(ws, r, 5, 10));
  [16, 23, 26, 28].forEach((r) => ciplXlsGarisBawah(ws, r, 1, 10));
  /* Blok pengangkutan: pemisah TEGAK saja — baris judul dan baris
     isinya satu kotak, tanpa garis mendatar di antaranya. */
  [2, 3].forEach((c) => ciplXlsGarisKanan(ws, c, 27, 28));
}

/* Baris Total & kotak tanda tangan. Sisi kiri baris Total dibiarkan
   terbuka: garis atasnya menutup ruang kosong di atasnya, lalu kotaknya
   menyatu dengan area tanda tangan sampai bertemu bingkai luar. */
function ciplXlsKakiTabel(ws, rt, kolomMulai, kotak) {
  ciplXlsGarisAtas(ws, rt, 1, 10);
  kotak.forEach((a) => ciplXlsKotak(ws, a + rt));

  const rs = rt + 1;
  ciplXlsGabung(ws, `${kolomMulai}${rs}:J${rt + 4}`);
  /* Rata ATAS. Bawaan sel gabungan adalah rata bawah, jadi "Signed by"
     tenggelam ke dasar kotak — tepat di tempat tanda tangannya
     dibubuhkan. */
  ciplXlsSet(ws, kolomMulai + rs, "Signed by", XLS_TEBAL,
    { horizontal: "left", vertical: "top" });
  /* Hanya ATAS & KIRI: sisi kanan & bawah berimpit dengan bingkai luar. */
  const c = kolomMulai.charCodeAt(0) - 64;
  ciplXlsSisi(ws, rs, c, "top");
  ciplXlsSisi(ws, rs, c, "left");
}

/* Garis kotak untuk sel tabel barang. */
function ciplXlsKotak(ws, alamat) {
  const g = { style: "thin" };
  ws.getCell(alamat).border = { top: g, left: g, bottom: g, right: g };
}

/* Baris judul tabel barang (baris 29) — sama bentuknya di kedua lembar,
   yang berbeda hanya tulisan & sel mana yang digabung. */
function ciplXlsJudulTabel(ws, judul, gabung) {
  gabung.forEach((g) => ciplXlsGabung(ws, g));
  judul.forEach((teks, i) => {
    const a = String.fromCharCode(65 + i) + "29";
    if (teks) ciplXlsSet(ws, a, teks, XLS_TEBAL, XLS_TENGAH);
    ciplXlsKotak(ws, a);
  });
}

/* PENGATURAN CETAK — diambil dari berkas rujukan.

   Skalanya ditulis apa adanya (80% untuk Invoice, 67% untuk SI), bukan
   fitToPage. Keduanya sama-sama memuatkan halaman, tapi fitToPage
   menyerahkan angkanya ke Excel dan hasilnya bergeser mengikuti
   pengandar pencetak yang sedang terpasang. */
function ciplXlsHalaman(o) {
  const h = {
    paperSize: 9, // A4
    orientation: "portrait",
    /* fitToPage BERSAMA skala — bukan salah satunya.

       Skala yang tersimpan (80% / 67%) adalah angka terakhir yang
       dipakai manusia; fitToPage yang menentukan hasil cetaknya, dan
       tanpa itu Excel memakai skala mentah sehingga halamannya keluar
       ~2,4% lebih kecil daripada rujukan. Keduanya ada di berkas
       rujukan, jadi keduanya ditulis. */
    fitToPage: true,
    printArea: o.area,
    margins: o.margins || {
      left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0,
    },
  };
  if (o.scale) h.scale = o.scale;
  if (o.tengah) h.horizontalCentered = true;
  return h;
}

function ciplXlsInvoice(wb, row, shipment, baris) {
  const ws = wb.addWorksheet("INVOICE");
  const mata = (row.payload || {}).currency || "USD";
  ciplXlsKerangka(wb, ws, ciplJudulInvoice(row),
    [4.5703125, 19.85546875, 30.5703125, 15.42578125, 6.42578125, 5, 7.140625, 10, 7, 15]);
  ciplXlsBlokPihak(ws, row, shipment);

  ciplXlsJudulTabel(ws,
    ["No", "Item", "Type", "HS Code", "Qty", "Unit", "Unit Price", "", "Amount", ""],
    ["G29:H29", "I29:J29"]);

  baris.forEach((b, i) => {
    const r = XLS_BARIS_ITEM + i;
    [i + 1, b.item, b.type, ciplXlsAngka(b.hs), b.qty, b.satuan, mata, b.harga, mata, b.amount]
      .forEach((v, k) => {
        const a = String.fromCharCode(65 + k) + r;
        ciplXlsSet(ws, a, v, XLS_ARIAL,
          { horizontal: "center", vertical: "middle", wrapText: true });
        ciplXlsKotak(ws, a);
      });
  });

  const rt = ciplXlsBarisTotal(baris.length);
  ciplXlsGabung(ws, `G${rt}:H${rt}`);
  ciplXlsSet(ws, "G" + rt, "Total", XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "I" + rt, mata, XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "J" + rt, baris.reduce((s, b) => s + b.amount, 0),
    XLS_TEBAL, XLS_KANAN);
  ciplXlsKakiTabel(ws, rt, "G", ["G", "I", "J"]);

  ciplXlsBingkaiLuar(ws, rt + 4);
  ws.pageSetup = ciplXlsHalaman({ area: `A1:J${rt + 5}`, scale: 80, tengah: true });
  return ws;
}

function ciplXlsPacking(wb, row, shipment, baris) {
  const ws = wb.addWorksheet("PL");
  ciplXlsKerangka(wb, ws, "PACKING LIST",
    [4.5703125, 19.42578125, 30.140625, 15.140625, 6.42578125, 5, 7.140625,
     8.42578125, 19.42578125, 10.85546875]);
  ciplXlsBlokPihak(ws, row, shipment);

  ciplXlsJudulTabel(ws,
    ["No", "Item Description", "Type", "HS CODE", "Qty", "Unit", "NW", "GW", "CBM", ""],
    ["I29:J29"]);

  baris.forEach((b, i) => {
    const r = XLS_BARIS_ITEM + i;
    [i + 1, b.item, b.type, ciplXlsAngka(b.hs), b.qty, b.satuan,
     b.netto, b.bruto, b.dimensi, b.cbmRaw].forEach((v, k) => {
      const a = String.fromCharCode(65 + k) + r;
      ciplXlsSet(ws, a, v, XLS_ARIAL, XLS_TENGAH);
      ciplXlsKotak(ws, a);
    });
    ws.getCell("J" + r).numFmt = "0.000";
  });

  const rt = ciplXlsBarisTotal(baris.length);
  ["A" + rt + ":D" + rt, "E" + rt + ":F" + rt, "I" + rt + ":J" + rt]
    .forEach((g) => ciplXlsGabung(ws, g));
  const koli = ciplTotalKoli(shipment);
  ciplXlsSet(ws, "A" + rt, koli ? koli + " Package" : "", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E" + rt, "TOTAL", XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "G" + rt, baris.reduce((s, b) => s + b.netto, 0), XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "H" + rt, baris.reduce((s, b) => s + b.bruto, 0), XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "I" + rt, baris.reduce((s, b) => s + b.cbmRaw, 0), XLS_TEBAL,
    XLS_KANAN).numFmt = "0.000";
  ciplXlsKakiTabel(ws, rt, "E", ["E", "G", "H", "I"]);

  ciplXlsBingkaiLuar(ws, rt + 4);
  /* Baris 8 rata tengah tegak di lembar ini tapi tidak di INVOICE —
     selisih tak kasatmata yang terbawa dari berkas rujukan. Disamakan
     supaya pembandingan sel-per-sel tetap bersih; tanpa ini uji
     kesamaannya berisik dan yang berisik lama-lama tidak dibaca. */
  for (let c = 1; c <= 10; c++) ws.getRow(8).getCell(c).alignment = XLS_TEGAK;
  ws.pageSetup = ciplXlsHalaman({ area: `A1:J${rt + 5}`, tengah: true });
  return ws;
}

/* Penanda pada berkas asli adalah RICH TEXT dalam satu sel: huruf "T"
   berfont Wingdings, lalu labelnya berfont biasa.

   Menyetel Wingdings ke SELURUH sel membuat labelnya ikut jadi lambang
   yang tak terbaca — itu yang terjadi pada percobaan sebelumnya. */
function ciplXlsLabelSI(teks, garisBawah) {
  return {
    richText: [
      { font: { name: "Wingdings", size: 8 }, text: "T" },
      {
        font: { name: "Arial", size: 8, bold: true, underline: !!garisBawah },
        text: "\u00a0 " + teks,
      },
    ],
  };
}

function ciplXlsShippingInstruction(wb, row, shipment, baris) {
  const ws = wb.addWorksheet("SI");
  const d = ciplSiData(row, shipment, baris);
  /* Delapan kolom saja; I ke kanan memakai lebar bawaan lembar. */
  [36, 4, 46, 10, 8, 8, 8.85546875, 8]
    .forEach((w, i) => (ws.getColumn(i + 1).width = w));
  /* Rujukan menuliskan lebar bawaan Excel (9.140625) untuk SELURUH
     kolom sisanya. Di luar wilayah cetak, jadi tak terlihat di kertas —
     tapi kolom I & J bersebelahan dengan isi dan ikut disamakan. */
  [9, 10].forEach((c) => (ws.getColumn(c).width = 9.140625));
  ws.getRow(2).height = 20.25;
  ws.getRow(10).height = 15.75;
  ciplXlsLogo(wb, ws);

  /* Kop dipusatkan mulai dari kolom A — bukan B seperti pada Invoice.
     Lembar ini tidak berbingkai, jadi tidak ada kolom sempit di kiri
     yang harus dilewati logo. */
  ciplXlsGabung(ws, "A1:H1");
  ciplXlsSet(ws, "A2", CIPL_PERUSAHAAN.nama,
    { name: "Times New Roman", size: 16, bold: true }, XLS_TENGAH);
  ciplXlsSet(ws, "A3", CIPL_PERUSAHAAN.pusat, XLS_KECIL, XLS_TENGAH);
  ciplXlsSet(ws, "A4", CIPL_PERUSAHAAN.cabang, XLS_KECIL, XLS_TENGAH);
  ["A2:H2", "A3:H3", "A4:H4"].forEach((r) => ciplXlsGabung(ws, r));

  ciplXlsSet(ws, "A7", "TO :  " + d.tujuan,
    { name: "Arial", size: 8, bold: true }, XLS_TEGAK);
  ciplXlsSet(ws, "A10", "SHIPPING INSTRUCTION",
    { name: "Arial", size: 12, bold: true, underline: true }, XLS_TENGAH);
  ciplXlsSet(ws, "A11", "NO. " + d.no,
    { name: "Arial", size: 9, bold: true }, XLS_TENGAH);
  ["A10:H10", "A11:H11"].forEach((r) => ciplXlsGabung(ws, r));
  ciplXlsSet(ws, "A13", "Please arrange our shipment per description below :",
    { name: "Arial", size: 8, bold: true }, XLS_TEGAK);

  /* TIDAK ADA GARIS PEMISAH.

     Versi sebelumnya menggambar border bawah di beberapa kelompok
     keterangan. Berkas rujukan tidak punya satu garis pun di lembar
     ini — jaraknya yang memisahkan kelompok, dan garis tambahan
     membuat lembarnya tidak lagi sama dengan yang beredar. */
  let r = 15;
  CIPL_SI_BARIS.forEach((def) => {
    ciplXlsSet(ws, "A" + r, ciplXlsLabelSI(def.k, !!def.tanpaTitikDua),
      null, XLS_TEGAK);
    if (!def.tanpaTitikDua) ciplXlsSet(ws, "B" + r, ":", XLS_ARIAL, XLS_TEGAK);

    if (def.alamat) {
      const isi = d[def.alamat];
      ciplXlsSet(ws, "C" + r, isi[0] || "", XLS_ARIAL, XLS_TEGAK);
      r += 1;
      /* "Address" sejajar dengan label di atasnya — didorong spasi,
         karena label di atasnya diawali penanda selebar satu huruf. */
      ciplXlsSet(ws, "A" + r, "          Address", { name: "Arial", size: 8 }, XLS_TEGAK);
      isi.slice(1).forEach((x, i) => ciplXlsSet(ws, "C" + (r + i), x, XLS_ARIAL, XLS_TEGAK));
      r += Math.max(isi.length - 1, 1);
      return;
    }

    const nilai = ciplSiNilai(def, d);
    /* Satuan ditulis DI DALAM sel yang sama dengan angkanya. Sebagai
       sel terpisah ia terlempar jauh ke kanan mengikuti lebar kolom
       nilai, dan "1.200" dengan "KGS" berjarak setengah halaman tidak
       terbaca sebagai satu keterangan. */
    const isi = def.satuan && nilai ? `${nilai}   ${def.satuan}` : nilai;
    ciplXlsSet(ws, "C" + r,
      def.hitung === "hs" ? ciplXlsAngka(isi) : isi,
      { name: "Arial", size: 8, bold: !!def.tebal },
      def.hitung === "hs" ? { horizontal: "left", vertical: "middle" } : XLS_TEGAK);
    r += def.garis ? 2 : 1;
  });

  r += 1;
  ciplXlsSet(ws, "A" + r, "Thank you for your good cooperation.", XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "A" + (r + 2), "Cirebon,  " + d.tanggal, XLS_ARIAL, XLS_TEGAK);
  ciplXlsSet(ws, "A" + (r + 3), "Regards,", XLS_ARIAL, XLS_TEGAK);
  /* Ruang materai, tanda tangan basah, dan cap — enam baris (~3 cm). */
  ciplXlsSet(ws, "A" + (r + 10), "SIGN & STAMP.",
    { name: "Arial", size: 8, bold: true, underline: true }, XLS_TEGAK);
  ws.pageSetup = ciplXlsHalaman({
    area: `A1:H${r + 10}`,
    scale: 67,
    margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  });
  return ws;
}

/* Satu unduhan pada satu waktu.

   Menyusun tiga lembar butuh waktu; klik kedua sebelum yang pertama
   selesai menjalankan dua penyusunan sekaligus, dan keduanya
   memicu unduhan — pengguna mendapat dua berkas identik dan tidak
   tahu mana yang benar. */
let ciplXlsSedangDibuat = false;

async function unduhCiplExcel(rowId) {
  if (ciplXlsSedangDibuat) return;

  const row = (docNumHistoryRows || []).find(
    (r) => String(r.id) === String(rowId),
  );
  if (!row) {
    showToast("Data invoice tidak ditemukan.", "danger");
    return;
  }
  const shipment = ciplCariShipment((row.payload || {}).shipmentId);
  const baris = ciplBarisBarang(shipment);

  ciplXlsSedangDibuat = true;
  const tombol = document.querySelector(`[data-xls-cipl="${rowId}"]`);
  if (tombol) tombol.disabled = true;
  try {
    /* ExcelJS DIMUAT SESUAI KEBUTUHAN, bukan ikut di halaman.

       Bulk Export memanggil ensureExcelJS() lebih dulu, jadi di sana
       pustakanya selalu siap. Fungsi ini langsung memakai ExcelJS —
       dan gagal pada klik pertama di sesi yang belum pernah membuka
       Bulk Export. */
    await ensureExcelJS();

    const wb = new ExcelJS.Workbook();
    wb.creator = "EXIM DDI";
    wb.created = new Date();
    ciplXlsInvoice(wb, row, shipment, baris);
    ciplXlsPacking(wb, row, shipment, baris);
    ciplXlsShippingInstruction(wb, row, shipment, baris);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    tautan.download = `${row.doc_number || "CIPL"}.xlsx`;
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);

    showToast(`Berkas Excel ${row.doc_number || ""} diunduh.`, "success");
  } catch (err) {
    console.error(err);
    /* Sebabnya ikut ditulis. Pesan generik menyembunyikan satu-satunya
       petunjuk yang dimiliki pengguna — dan juga yang memperbaikinya. */
    showToast(
      `Gagal menyusun berkas Excel: ${err && err.message ? err.message : "kesalahan tidak diketahui"}`,
      "danger",
    );
  } finally {
    /* Dilepas di finally: kalau penyusunan gagal dan bendera tetap
       menyala, tombolnya mati selamanya sampai halaman dimuat ulang. */
    ciplXlsSedangDibuat = false;
    if (tombol) tombol.disabled = false;
  }
}
