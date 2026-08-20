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
  if (!d) return "";
  /* TENGAH MALAM UTC, BUKAN TENGAH MALAM SETEMPAT.

     ExcelJS mengubah objek Date jadi nomor seri Excel memakai jamnya
     dalam UTC. parseLocalDate mengembalikan tengah malam waktu
     setempat — di WIB (UTC+7) itu berarti pukul 17.00 UTC pada HARI
     SEBELUMNYA. Sel yang formatnya hanya tanggal lalu menampilkan
     tanggal yang mundur satu hari:

       yang dipilih di aplikasi   12 Aug 2026
       yang tercetak di Excel     11 Aug 2026

     Ini bukan soal tampilan: yang mundur adalah Tanggal Invoice pada
     dokumen yang dikirim ke forwarder dan bea cukai negara tujuan.

     Disusun ulang dari komponen tanggalnya — bukan digeser sekian jam
     — supaya benar juga di zona waktu mana pun berkas ini dibuat. */
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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
   tanpa awalan "data:...;base64,".

   UKURAN & POSISI DALAM EMU, satuan asli berkas Excel. Sebelumnya
   ukurannya ditulis 52x52 piksel dan posisinya sebagai pecahan kolom
   (col: 0.2) — pecahan kolom ikut bergerak begitu lebar kolomnya
   berubah, jadi logo di Invoice dan di Packing List tidak pernah
   benar-benar sejajar.

   POSISINYA DIJAGA JARAK DARI GARIS, bukan dirapatkan ke sudut.

   Logo ini bukan gambar transparan sepenuhnya: sisi-sisinya menutupi
   apa pun di bawahnya. Ditaruh menempel di sudut, ia menimpa garis
   bingkai — di layar tidak kelihatan karena garisnya tipis, tapi
   SAAT DICETAK potongan garis itu benar-benar hilang.

   Dua kali sudah kejadian: pertama rowOff 0 memotong garis ATAS, lalu
   colOff 9139 (kurang dari 1 piksel) memotong garis KIRI. Sekarang
   keduanya diberi jarak 7-9 piksel.

   BATASNYA PITA KOP, yaitu baris 1 sampai 5 — garis bawahnya digambar
   di baris 5 (lihat ciplXlsGarisBawah). Tingginya 107 px, logonya
   92,53 px, jadi seluruh ruang gerak ke bawah cuma sekitar 14 px.
   Karena itu geseran ke bawah ditahan di 9 px: masih menyisakan 5,5 px
   sebelum menyentuh garis bawah. Menggesernya lebih jauh menukar satu
   masalah dengan masalah yang sama di sisi berlawanan.

   Ada uji yang menghitung ulang keempat jaraknya — kalau angka di sini
   diubah sampai menyentuh garis, uji itu yang berbunyi. */
const XLS_LOGO_EMU = {
  colOff: 66675,   // 7 px dari garis kiri
  rowOff: 85725,   // 9 px dari garis atas
  lebar: 886211,   // 93,04 px — TIDAK diubah
  tinggi: 881310,  // 92,53 px — TIDAK diubah
};

/* Tinggi pita kop dalam piksel, dihitung dari tinggi barisnya sendiri.

   Ditulis sebagai perhitungan, bukan angka mati: kalau suatu saat
   tinggi baris kop diubah, jarak amannya ikut terhitung ulang dan uji
   di qa/logo-geometry-test.js langsung tahu. */
const XLS_TINGGI_BARIS_BAWAAN = 15;          // poin
const XLS_PITA_KOP_BARIS_TERAKHIR = 5;       // garis bawah kop
function xlsTinggiPitaKopPx() {
  let pt = 0;
  for (let r = 1; r <= XLS_PITA_KOP_BARIS_TERAKHIR; r++) {
    pt += XLS_BARIS_KOP[r] || XLS_TINGGI_BARIS_BAWAAN;
  }
  return (pt * 4) / 3;                        // poin -> piksel (96/72)
}

/* ExcelJS menerima `ext` dalam PIKSEL lalu mengubahnya dengan
   Math.floor(px * 9525). Menambah setengah EMU sebelum dibagi
   memastikan pembulatan ke bawahnya mendarat pas di angka yang
   diminta, bukan meleset satu EMU karena galat pecahan. */
const EMU_PER_PIKSEL = 9525;
function pikselDariEmu(emu) {
  return (emu + 0.5) / EMU_PER_PIKSEL;
}

function ciplXlsLogo(wb, ws) {
  try {
    const m = /^data:image\/(\w+);base64,(.+)$/.exec(SJ_LOGO || "");
    if (!m) return;
    const id = wb.addImage({ base64: m[2], extension: m[1] });
    ws.addImage(id, {
      tl: {
        nativeCol: 0,
        nativeColOff: XLS_LOGO_EMU.colOff,
        nativeRow: 0,
        nativeRowOff: XLS_LOGO_EMU.rowOff,
      },
      ext: {
        width: pikselDariEmu(XLS_LOGO_EMU.lebar),
        height: pikselDariEmu(XLS_LOGO_EMU.tinggi),
      },
    });
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

/* FORMAT ANGKA — disalin dari berkas rujukan.

   "Comma Style" bawaan Excel: ribuan berpemisah, negatif dalam kurung,
   nol jadi tanda hubung, dan ada sedikit lekuk di kanan supaya angkanya
   tidak menempel garis kolom. Ditulis apa adanya, bukan "#,##0" yang
   mirip tapi menghasilkan tampilan berbeda pada nilai nol dan minus. */
const XLS_FMT_UANG = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';
/* Berat: ribuan berpemisah + satu spasi penutup, sepadan lebar dengan
   lekuk kanan pada format uang di atas. */
const XLS_FMT_BERAT = "#,##0_ ";
const XLS_FMT_CBM = "0.000";

/* HURUF LEMBAR SHIPPING INSTRUCTION — 12pt, bukan 8/9pt.

   Lembar ini surat yang dibaca orang lain di layar, bukan formulir
   berkolom yang dipadatkan ke satu halaman. Ukurannya diambil dari
   berkas rujukan.

   Label kiri memakai Calibri: sel itu berisi teks kaya (penanda ✻ +
   tulisannya), dan huruf tingkat selnya memang tertinggal Calibri di
   berkas aslinya. Ditiru apa adanya — yang terlihat huruf di dalam
   teks kayanya, bukan yang ini. */
const XLS_SI = { name: "Arial", size: 12 };
const XLS_SI_TEBAL = { name: "Arial", size: 12, bold: true };
const XLS_SI_LABEL = { name: "Calibri", size: 12 };

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
  ciplXlsSet(ws, "D27", "Sailing on or About", XLS_TEBAL, XLS_TENGAH);
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
/* MARGIN "NARROW" — sama persis dengan preset bawaan Excel.

   Angkanya dalam INCI, karena begitulah Excel menyimpan margin. Preset
   Narrow: kiri & kanan 0,25"; atas & bawah 0,75"; header & footer 0,3".

   Dipakai ketiga lembar, supaya Invoice, Packing List, dan Shipping
   Instruction jatuh di area yang sama pada kertas. Sebelumnya ketiganya
   berbeda-beda (0,3 / 0,7 / 0,7 di kiri), warisan dari berkas yang
   disetel satu per satu oleh tangan.

   CATATAN. Ini MENYIMPANG dari berkas rujukan DDI-CRBM-VIII-045 —
   margin justru satu-satunya hal yang sudah sama persis di sana.
   Diubah atas permintaan; kalau suatu saat ingin kembali menyamai
   rujukan, angka lamanya: INVOICE 0,3/0,3/0,4/0,4/0/0 · PL
   0,7/0,3/0,75/0,75/0,3/0,3 · SI 0,7/0,7/0,75/0,75/0,3/0,3. */
const XLS_MARGIN_NARROW = {
  left: 0.25,
  right: 0.25,
  top: 0.75,
  bottom: 0.75,
  header: 0.3,
  footer: 0.3,
};

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
    margins: o.margins || XLS_MARGIN_NARROW,
  };
  if (o.scale) h.scale = o.scale;
  if (o.tengah) h.horizontalCentered = true;
  return h;
}

function ciplXlsInvoice(wb, row, shipment, baris) {
  const ws = wb.addWorksheet("INVOICE");
  const mata = (row.payload || {}).currency || "USD";
  ciplXlsKerangka(wb, ws, ciplJudulInvoice(row),
    [4.5703125, 22.140625, 30.5703125, 18.28515625, 6.42578125, 5, 7.140625, 10, 7, 10.85546875]);
  ciplXlsBlokPihak(ws, row, shipment);

  ciplXlsJudulTabel(ws,
    ["No", "Item", "Type", "HS Code", "Qty", "Unit", "Unit Price", "", "Amount", ""],
    ["G29:H29", "I29:J29"]);

  baris.forEach((b, i) => {
    const r = XLS_BARIS_ITEM + i;
    [i + 1, b.item, b.type, ciplXlsAngka(b.hs), b.qty, b.satuan, mata, b.harga, mata, b.amount]
      .forEach((v, k) => {
        const a = String.fromCharCode(65 + k) + r;
        /* Kolom H (Unit Price) & J (Amount) TANPA bungkus baris.

           Membungkus baris pada sel angka tidak pernah menolong —
           angka tidak punya tempat patah — tapi ia mengubah tinggi
           baris begitu angkanya sedikit lebih panjang dari kolomnya,
           dan barisnya jadi tidak sama tinggi dengan yang lain. */
        const angka = k === 7 || k === 9;
        ciplXlsSet(ws, a, v, XLS_ARIAL,
          { horizontal: "center", vertical: "middle", wrapText: !angka });
        if (angka) ws.getCell(a).numFmt = XLS_FMT_UANG;
        ciplXlsKotak(ws, a);
      });
  });

  const rt = ciplXlsBarisTotal(baris.length);
  ciplXlsGabung(ws, `G${rt}:H${rt}`);
  ciplXlsSet(ws, "G" + rt, "Total", XLS_TEBAL, XLS_TENGAH);
  ciplXlsSet(ws, "I" + rt, mata, XLS_ARIAL, XLS_TENGAH);
  /* Angka Total: Arial 9 BIASA dan rata tengah — bukan Arial 8 tebal
     rata kanan. Ia sudah berdiri di kotaknya sendiri, jadi tidak butuh
     penebalan untuk dibedakan. */
  ciplXlsSet(ws, "J" + rt, baris.reduce((s, b) => s + b.amount, 0),
    XLS_ARIAL, XLS_TENGAH).numFmt = XLS_FMT_UANG;
  ciplXlsKakiTabel(ws, rt, "G", ["G", "I", "J"]);

  ciplXlsBingkaiLuar(ws, rt + 4);
  ws.pageSetup = ciplXlsHalaman({ area: `A1:J${rt + 5}`, scale: 80, tengah: true });
  return ws;
}

function ciplXlsPacking(wb, row, shipment, baris) {
  /* Garis bantu dimatikan HANYA di lembar ini — begitu adanya di berkas
     rujukan. Hanya memengaruhi tampilan di layar, bukan hasil cetak
     (itu diatur printGridLines yang memang mati di ketiga lembar). */
  const ws = wb.addWorksheet("PL", {
    views: [{ showGridLines: false }],
  });
  ciplXlsKerangka(wb, ws, "PACKING LIST",
    [4.5703125, 22.28515625, 26.140625, 16, 6.42578125, 5, 7.140625,
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
      if (k === 6 || k === 7) ws.getCell(a).numFmt = XLS_FMT_BERAT;  // NW, GW
      ciplXlsKotak(ws, a);
    });
    ws.getCell("J" + r).numFmt = XLS_FMT_CBM;
  });

  const rt = ciplXlsBarisTotal(baris.length);
  ["A" + rt + ":D" + rt, "E" + rt + ":F" + rt, "I" + rt + ":J" + rt]
    .forEach((g) => ciplXlsGabung(ws, g));
  const koli = ciplTotalKoli(shipment);
  ciplXlsSet(ws, "A" + rt, koli ? koli + " Package" : "", XLS_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "E" + rt, "TOTAL", XLS_TEBAL, XLS_TENGAH);
  /* Arial 9 tebal, bukan Arial 8: sebaris dengan angka barang di
     atasnya, jadi ukurannya mengikuti mereka. */
  const tebal9 = { name: "Arial", size: 9, bold: true };
  ciplXlsSet(ws, "G" + rt, baris.reduce((s, b) => s + b.netto, 0), tebal9,
    XLS_TENGAH).numFmt = XLS_FMT_BERAT;
  ciplXlsSet(ws, "H" + rt, baris.reduce((s, b) => s + b.bruto, 0), tebal9,
    XLS_TENGAH).numFmt = XLS_FMT_BERAT;
  ciplXlsSet(ws, "I" + rt, baris.reduce((s, b) => s + b.cbmRaw, 0), tebal9,
    XLS_KANAN).numFmt = XLS_FMT_CBM;
  ciplXlsKakiTabel(ws, rt, "E", ["E", "G", "H", "I"]);

  ciplXlsBingkaiLuar(ws, rt + 4);
  /* Baris 8 rata tengah tegak di lembar ini tapi tidak di INVOICE —
     selisih tak kasatmata yang terbawa dari berkas rujukan. Disamakan
     supaya pembandingan sel-per-sel tetap bersih; tanpa ini uji
     kesamaannya berisik dan yang berisik lama-lama tidak dibaca. */
  for (let c = 1; c <= 10; c++) ws.getRow(8).getCell(c).alignment = XLS_TEGAK;
  ws.pageSetup = ciplXlsHalaman({
    area: `A1:J${rt + 5}`, scale: 73, tengah: true,
  });
  return ws;
}

/* Penanda pada berkas asli adalah RICH TEXT dalam satu sel: huruf "T"
   berfont Wingdings, lalu labelnya berfont biasa.

   Menyetel Wingdings ke SELURUH sel membuat labelnya ikut jadi lambang
   yang tak terbaca — itu yang terjadi pada percobaan sebelumnya. */
function ciplXlsLabelSI(teks, garisBawah) {
  return {
    richText: [
      /* Ukurannya ada DI DALAM teks kaya, bukan di gaya selnya.

         Menaikkan huruf sel jadi 12pt tidak menyentuh label ini sama
         sekali: sel berisi rich text memakai ukuran tiap potongannya
         sendiri, dan gaya sel hanya berlaku untuk sel yang isinya teks
         biasa. Itu sebabnya label sempat tetap kecil sementara nilai di
         sebelahnya sudah membesar. */
      /* charset 2 = himpunan karakter SIMBOL.

         Tanpa penanda itu, huruf "T" Wingdings tercetak sebagai huruf
         T biasa di pembaca yang tidak menebak sendiri — bukan ✻. Excel
         di Windows kebetulan menebak benar; LibreOffice dan pembaca di
         ponsel tidak, dan di situlah dokumennya sering dibuka. Berkas
         rujukan menyertakannya. */
      { font: { name: "Wingdings", size: 12, charset: 2 }, text: "T" },
      {
        font: { name: "Arial", size: 12, family: 2, bold: true, underline: !!garisBawah },
        text: "\u00a0 " + teks,
      },
    ],
  };
}

function ciplXlsShippingInstruction(wb, row, shipment, baris) {
  const ws = wb.addWorksheet("SI");
  const d = ciplSiData(row, shipment, baris);
  /* Kolom F sengaja DILEWATI — di berkas rujukan ia memakai lebar
     bawaan, dan kolom itu memang tidak pernah diisi apa pun. */
  [[1, 36], [2, 4], [3, 46], [4, 10], [5, 8],
   [7, 8.85546875], [8, 8], [9, 9.140625]]
    .forEach(([c, w]) => (ws.getColumn(c).width = w));
  ws.getRow(2).height = 20.25;
  /* Tinggi baris 15,75 dari baris 7 sampai bawah.

     Huruf 12pt tidak muat di baris bawaan 15,0 — Excel akan
     meninggikannya sendiri satu per satu, dan tingginya jadi
     bergantung pada isi tiap baris. Dipatok supaya jarak antar
     keterangan tetap sama, terisi atau tidak.
     Baris 8, 9, 11, dan 12 DILEWATI, mengikuti rujukan: itu jeda di
     sekitar judul, dan membiarkannya bawaan membuat jaraknya sedikit
     lebih rapat daripada daftar keterangan di bawahnya. */
  for (let r = 7; r <= 66; r++) {
    if (r === 8 || r === 9 || r === 11 || r === 12) continue;
    ws.getRow(r).height = 15.75;
  }
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

  ciplXlsSet(ws, "A7", "TO :  " + d.tujuan, XLS_SI_TEBAL, XLS_TEGAK);
  ciplXlsSet(ws, "A10", "SHIPPING INSTRUCTION",
    { name: "Arial", size: 12, bold: true, underline: true }, XLS_TENGAH);
  ciplXlsSet(ws, "A11", "NO. " + d.no,
    { name: "Arial", size: 9, bold: true }, XLS_TENGAH);
  ["A10:H10", "A11:H11"].forEach((r) => ciplXlsGabung(ws, r));
  ciplXlsSet(ws, "A13", "Please arrange our shipment per description below :",
    XLS_SI_TEBAL, XLS_TEGAK);

  /* TIDAK ADA GARIS PEMISAH.

     Versi sebelumnya menggambar border bawah di beberapa kelompok
     keterangan. Berkas rujukan tidak punya satu garis pun di lembar
     ini — jaraknya yang memisahkan kelompok, dan garis tambahan
     membuat lembarnya tidak lagi sama dengan yang beredar. */
  let r = 15;
  CIPL_SI_BARIS.forEach((def) => {
    ciplXlsSet(ws, "A" + r, ciplXlsLabelSI(def.k, !!def.tanpaTitikDua),
      XLS_SI_LABEL, XLS_TEGAK);
    if (!def.tanpaTitikDua) ciplXlsSet(ws, "B" + r, ":", XLS_SI, XLS_TEGAK);

    if (def.alamat) {
      const isi = d[def.alamat];
      ciplXlsSet(ws, "C" + r, isi[0] || "", XLS_SI, XLS_TEGAK);
      r += 1;
      /* "Address" sejajar dengan label di atasnya — didorong spasi,
         karena label di atasnya diawali penanda selebar satu huruf.
         LIMA spasi, dihitung dari berkas rujukan; sebelumnya sepuluh,
         dan barisnya menjorok dua kali lebih jauh daripada seharusnya. */
      ciplXlsSet(ws, "A" + r, "     Address", XLS_SI, XLS_TEGAK);
      isi.slice(1).forEach((x, i) => ciplXlsSet(ws, "C" + (r + i), x, XLS_SI, XLS_TEGAK));
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
      { name: "Arial", size: 12, bold: !!def.tebal },
      def.hitung === "hs" ? { horizontal: "left", vertical: "middle" } : XLS_TEGAK);
    r += def.garis ? 2 : 1;
  });

  r += 1;
  ciplXlsSet(ws, "A" + r, "Thank you for your good cooperation.", XLS_SI, XLS_TEGAK);
  ciplXlsSet(ws, "A" + (r + 2), "Cirebon, " + d.tanggal, XLS_SI, XLS_TEGAK);
  ciplXlsSet(ws, "A" + (r + 3), "Regards,", XLS_SI, XLS_TEGAK);
  /* Ruang materai, tanda tangan basah, dan cap — enam baris (~3 cm). */
  ciplXlsSet(ws, "A" + (r + 10), "SIGN & STAMP",
    { name: "Arial", size: 12, bold: true, underline: true }, XLS_TEGAK);
  ws.pageSetup = ciplXlsHalaman({
    area: `A1:H${r + 10}`,
    scale: 67,
    /* IKUT DIPUSATKAN — dulu tidak. Selama margin kirinya 0,7" lembar
       ini kebetulan terlihat rapi di tengah; dengan margin narrow
       (0,25") ia akan terdorong ke kiri hampir 12 mm dan berdiri
       sendiri di antara dua lembar lain yang dipusatkan. */
    tengah: true,
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

  const row = ciplCariBarisRiwayat(rowId);
  if (!row) return;
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
    /* Nomor dokumen kini memuat spasi ("DDI - CRBM - VIII - 045").
       Untuk NAMA BERKAS spasinya dirapatkan: berkas ini sering
       dilampirkan ke e-mail dan diunggah ke portal, dan nama berspasi
       sering berubah jadi %20 atau terpotong di tengah jalan.
       Isi dokumennya tetap memakai nomor asli, berspasi. */
    const namaBerkas = String(row.doc_number || "CIPL")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, "_");
    tautan.download = `${namaBerkas}.xlsx`;
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
