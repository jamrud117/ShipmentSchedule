"use strict";

/* CETAK COMMERCIAL INVOICE & PACKING LIST

   Satu tombol, DUA halaman. Keduanya memakai kop, blok pihak, dan blok
   pengangkutan yang sama persis — yang berbeda hanya judul dan kolom
   tabelnya. Karena itu bagian yang sama dibangun sekali lalu dipakai
   dua kali; menyalinnya akan membuat keduanya berbeda cepat atau
   lambat, dan perbedaan pada dokumen ekspor bukan hal sepele.

   Datanya dari DUA tempat:
     - pengajuan nomor (document_numbers) -> nomor & tanggal invoice,
       consignee, PO, terms, pelabuhan, carrier, remarks
     - jadwal yang ditautkan (shipments)  -> daftar barang, berat,
       dimensi, nilai

   JUDULNYA mengikuti jenis invoice yang dipilih saat menerbitkan nomor:
   "COMMERCIAL INVOICE" atau "NON - COMMERCIAL INVOICE".
*/

const CIPL_PERUSAHAAN = {
  nama: "PT. DYNAMIC DESIGN INDONESIA",
  pusat:
    "Pusat : Jl. Mayjend Sutoyo No. 1 Pabedilan Kulon, Pabedilan, Kabupaten Cirebon, Jawa Barat - Indonesia 45193",
  cabang:
    "Cabang: JL. BKR No.27 Pasirluyu, Regol 40254 Kota Bandung 022-30507575",
};

/* Shipper selalu PT Dynamic Design Indonesia — dokumen ini hanya
   dipakai untuk kiriman KELUAR. Ditulis di sini, bukan diisi pengguna:
   satu kolom yang isinya selalu sama hanya menambah peluang salah
   ketik pada dokumen yang dibaca bea cukai negara lain. */
/* SELURUH kotak pihak (nama, alamat, ATTN) KAPITAL -- sama dengan nama
   consignee & baris tanda tangan, dan seragam di satu dokumen. Dulu
   alamatnya Huruf Awal Kapital; atas permintaan pengguna kini kapital
   semua, termasuk alamat surel pada baris ATTN. */
const CIPL_SHIPPER = [
  "PT DYNAMIC DESIGN INDONESIA",
  "JALAN MAYJEND SUTOYO NO. 1, DESA PABEDILAN KULON,",
  "KEC. PABEDILAN, KAB. CIREBON, JAWA BARAT 45193",
  "ATTN : JJH2296@DYNAMICDESIGN.CO.KR",
  "TEL : +622318886161",
  "TAX ID : 0656 3197 7906 1000",
];

/* Teks kotak pihak dicetak KAPITAL, dari SATU tempat ini.

   Alamat consignee diketik pengguna di form (atau terisi otomatis dari
   profil pembeli, yang sengaja dibiarkan bertulis aslinya supaya form
   tetap mudah dibaca). Dikapitalkan baru saat dicetak: cetak CI, cetak
   Packing List, Shipping Instruction, dan Excel memakai fungsi pembangun
   baris yang sama, sehingga tidak mungkin ada yang tertinggal berhuruf
   kecil. */
const ciplKapital = (s) => String(s == null ? "" : s).toUpperCase();

/* ------------------------------------------------------------------
   ALAMAT BUYER YANG SUDAH DIKENAL

   Diisikan otomatis begitu nama buyer-nya cocok, supaya alamat yang
   sama tidak diketik ulang tiap menerbitkan invoice — dan tidak
   berbeda-beda tiap kali diketik ulang.

   Dicocokkan dengan `includes` pada teks yang sudah dinormalkan
   (tanda baca dibuang), jadi "DYNAMIC DESIGN CO., LTD." dan
   "Dynamic Design Co Ltd" sama-sama ketemu.

   Menambah buyer baru cukup satu entri di sini.
------------------------------------------------------------------ */
function ciplNormalNama(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/* ------------------------------------------------------------------
   PROFIL PELANGGAN

   Tiap pembeli punya bentuk CIPL sendiri: susunan kotaknya berbeda,
   pelabuhan bawaannya berbeda, dan sebagian isian yang wajib di satu
   pembeli tidak ada sama sekali di pembeli lain.

   Dikumpulkan di SATU tabel, bukan disebar sebagai percabangan di
   dalam kode cetak. Menambah pembeli baru berarti menambah satu entri
   di sini -- bukan menyisipkan `if` di belasan tempat yang harus
   ditemukan satu per satu.

   `layout` menunjuk templat mana yang dipakai. Pembeli yang bentuk
   suratnya sama cukup berbagi nilai yang sama.
------------------------------------------------------------------ */
const CIPL_PROFIL = [
  {
    id: "kumho-vn",
    match: ["KUMHO TIRE VIETNAM", "KUMHO TIRE"],
    layout: "vn",
    /* Bentuk nomor invoice khusus pembeli ini. {SEQ} tetap mengambil
       urutan yang sama dengan invoice lain -- lihat docNumTemplate(). */
    invoicePattern: "DDI - CRBM - {MM} - {SEQ} - {YYYYMMDD}",
    portLoading: "JAKARTA",
    portDischarge: "HOCHIMINH, VIETNAM",
    finalDestination: "HOCHIMINH CITY, VIETNAM",
    lines: [
      "LOT D-3-CN, MY PHUOC 3 INDUSTRIAL PARK",
      "THOI HOA WARD, HO CHI MINH CITY, VIETNAM.",
      "ATTN   : Nguyen Thi Hiep, Dang Thi Ninh",
      "T E L      : +84 274 3599 000 , TAX ID : 3700747000",
      "E-MAIL : thihiep@kumhotire.com , dangninh@kumhotire.com",
      "Fax : +84-274-357-6939",
    ],
  },
  {
    id: "ddi-kr",
    match: ["DYNAMIC DESIGN CO", "DYNAMIC DESIGN COLTD"],
    layout: "kr",
    portLoading: "Jakarta, Indonesia",
    portDischarge: "BUSAN, KOREA",
    finalDestination: "BUSAN, KOREA",
    lines: [
      "12, Cheomdanyeonsin-ro 29 beon-gil Buk-gu Gwangju, 61089",
      "Republic of Korea",
      "TEL : 82-62-720-7894   FAX : 82-62-443-0993",
    ],
  },
];

/* Profil yang dipakai untuk satu pengajuan. Dicocokkan ke nama
   consignee; kalau tidak ada yang cocok, dipakai profil pertama yang
   layout-nya "kr" -- bentuk yang sudah dipakai selama ini. */
function ciplProfil(nama) {
  const key = ciplNormalNama(nama);
  const hit = key
    ? CIPL_PROFIL.find((b) =>
        (b.match || []).some((m) => key.includes(ciplNormalNama(m))),
      )
    : null;
  return hit || CIPL_PROFIL.find((b) => b.layout === "kr") || CIPL_PROFIL[0];
}

/* Dipertahankan: dipakai di beberapa tempat untuk alamat saja. */
const CIPL_ALAMAT_BUYER = CIPL_PROFIL;

function ciplAlamatBuyer(nama) {
  const key = ciplNormalNama(nama);
  if (!key) return "";
  const hit = CIPL_ALAMAT_BUYER.find((b) =>
    (b.match || []).some((m) => key.includes(ciplNormalNama(m))),
  );
  return hit ? hit.lines.join("\n") : "";
}

/* ------------------------------------------------------------------
   PENGAMBILAN DATA
------------------------------------------------------------------ */

function ciplCariShipment(id) {
  if (!id) return null;
  return (
    (data.export || []).find((x) => x.id === id) ||
    (data.import || []).find((x) => x.id === id) ||
    null
  );
}

/* CIPL hanya untuk kiriman EXPORT. Yang belum ditautkan tetap boleh
   dicetak — kotak barangnya saja yang kosong, dan itu keadaan yang sah
   saat nomornya diterbitkan lebih dulu daripada jadwalnya. */
function ciplBolehCetak(row) {
  const id = ((row && row.payload) || {}).shipmentId;
  if (!id) return true;
  const s = ciplCariShipment(id);
  return !s || s.mode === "export";
}

/* Judul halaman pertama. Bentuk nomornya sendiri sudah membedakan
   keduanya, tapi yang dibaca orang adalah judulnya — jadi yang
   menentukan tetap pilihan jenis invoice saat nomor diterbitkan. */
function ciplJudulInvoice(row) {
  const jenis = ((row && row.payload) || {}).invoiceKind || "";
  return /non/i.test(jenis) ? "NON - COMMERCIAL INVOICE" : "COMMERCIAL INVOICE";
}

/* Nama barang di aplikasi ditulis "TYRE MOLD FULL SET - NOKIAN ENTRUST
   235/45R19", sementara berkas CIPL memisahkannya jadi kolom Item dan
   kolom Type. Dipecah pada tanda hubung PERTAMA yang diapit spasi;
   tanpa pemisah, seluruhnya masuk kolom Item dan kolom Type dibiarkan
   kosong — bukan ditebak. */
/* NAMA BARANG BAKU yang menempati kolom Item.

   Sebagian nama memakai tanda hubung sebagai pemisah — "TYRE MOLD FULL
   SET - NOKIAN ENTRUST 235/45R19" — dan itu sudah cukup jelas. Tapi
   sebagian lain menuliskannya menyambung tanpa pemisah apa pun:

     TYRE MOLD FULL SET CREDO SUNMODE SUV 215/65R16
     └──── jenis barang ────┘└──── keterangan ────┘

   Tanpa daftar ini tidak ada cara menebak di mana batasnya: "FULL SET"
   dan "CREDO SUNMODE" sama-sama huruf besar, sama-sama beberapa kata.
   Yang tahu batasnya cuma orang yang tahu katalog barangnya.

   Menambah jenis barang baru cukup satu baris di sini. Yang tidak
   terdaftar TIDAK dipecah — seluruhnya masuk kolom Item dan kolom Type
   dibiarkan kosong, bukan ditebak. */
const CIPL_JENIS_BARANG = [
  "TYRE MOLD FULL SET",
  "TYRE MOLD SIDE ONLY",
  "TYRE MOLD TREAD ONLY",
];

function ciplPecahNama(nama) {
  const s = String(nama || "").trim();

  /* Tanda hubung didahulukan: kalau penulisnya sudah memisahkan
     sendiri, itu batas yang paling bisa dipercaya. */
  const i = s.indexOf(" - ");
  if (i >= 0) {
    return { item: s.slice(0, i).trim(), type: s.slice(i + 3).trim() };
  }

  /* Jenis TERPANJANG dulu, supaya "TYRE MOLD FULL SET" tidak kalah
     oleh entri lain yang kebetulan jadi awalannya. */
  const urut = CIPL_JENIS_BARANG.slice().sort((a, b) => b.length - a.length);
  const atas = s.toUpperCase();
  const cocok = urut.find((j) => atas.startsWith(j.toUpperCase()));
  if (cocok) {
    return {
      item: s.slice(0, cocok.length).trim(),
      type: s.slice(cocok.length).trim(),
    };
  }

  return { item: s, type: "" };
}

/* "81*81*81" -> "81 CM x 81 CM x 81 CM", mengikuti tulisan di berkas
   aslinya. Yang tidak berbentuk dimensi ditulis apa adanya. */
function ciplDimensiTeks(paket) {
  const d = parsePackageDims(paket);
  if (!d) return String(paket || "").trim();
  return `${d.p} CM x ${d.l} CM x ${d.t} CM`;
}

function ciplCbmMentah(it) {
  const d = parsePackageDims(it.package);
  if (!d) return 0;
  const m = String(it.packing || "").match(/[\d.,]+/);
  const koli = m ? parseLooseNumber(m[0]) : 0;
  const jumlah = koli > 0 ? koli : parseLooseNumber(it.qty);
  return ((d.p * d.l * d.t) / 1000000) * jumlah;
}

function ciplBarisBarang(shipment) {
  const items = (shipment && shipment.items) || [];
  return items
    .filter((it) => String(it.namaBarang || "").trim())
    .map((it) => {
      /* NAMA BARANG = kolom barang CEISA kiri ke kanan, aturan yang sama
         dengan CIPL Kumho (itemDisplayName, core/helpers.js). Lembar ini
         punya dua kolom: Item = Kode Barang + Uraian, Type = sisanya
         (Merek, Tipe, Ukuran, Spesifikasi Lain) -- dibaca dari kiri ke
         kanan hasilnya urutan yang sama.

         ciplPecahNama() (menebak dari " - " atau CIPL_JENIS_BARANG)
         tinggal cadangan untuk barang yang kolom sesudah Uraian-nya
         kosong -- barang lama, seluruh namanya di Uraian. */
      const bagian = bagianNamaBarang(it);
      const rincian = rincianNamaBarang(it);
      const depan = bagian.filter((b) => !KOLOM_SESUDAH_URAIAN.includes(b.kolom)).map((b) => b.teks).join(" ");
      const n = rincian.length ? { item: depan, type: rincian.join(" ") } : ciplPecahNama(depan);
      const qty = parseLooseNumber(it.qty);
      const harga = parseLooseNumber(it.harga);
      return {
        item: n.item,
        type: n.type,
        hs: String(it.hsCode || "").trim(),
        qty: qty,
        satuan: String(it.satuan || "").trim().toUpperCase(),
        harga: harga,
        amount: qty * harga,
        netto: parseLooseNumber(it.netto),
        bruto: parseLooseNumber(it.bruto),
        dimensi: ciplDimensiTeks(it.package),
        cbm: computeItemCbm(it),
        /* CBM tanpa pembulatan, khusus untuk menjumlah total.

           Menjumlahkan angka yang SUDAH dibulatkan menggeser totalnya:
           0,531441 + 1,594323 = 2,126 kalau dijumlah dulu, tapi 2,125
           kalau masing-masing dibulatkan lebih dulu. Berkas aslinya
           menulis 2,126, dan selisih satu angka di belakang koma pada
           dokumen ekspor bukan hal yang bisa diabaikan. */
        cbmRaw: ciplCbmMentah(it),
      };
    });
}

/* Jumlah koli seluruh kiriman, untuk tulisan "4 Package" di Packing
   List. Diambil dari kolom `packing` per barang — di buku Export kolom
   `package` berisi DIMENSI, bukan jumlah. */
function ciplTotalKoli(shipment) {
  const items = (shipment && shipment.items) || [];
  let n = 0;
  items.forEach((it) => {
    const m = String(it.packing || "").match(/[\d.,]+/);
    if (m) n += parseLooseNumber(m[0]);
  });
  return n;
}

/* Angka bulat ditulis TANPA desimal; hanya yang pecahan yang diberi
   angka di belakang koma.

   "10,490.00" pada dokumen ekspor terbaca seperti hasil hitungan
   mesin, sementara berkas aslinya menulis "10,490". Yang pecahan tetap
   perlu desimalnya — harga satuan 0,44 tidak boleh dibulatkan jadi 0.

   `maks` = jumlah desimal untuk nilai pecahan. Bawaannya 2 (uang);
   CBM memakai 3 karena selisih angka ketiganya masih bermakna.

   Perbandingan dengan toleransi, bukan `n % 1 === 0`: hasil perkalian
   pecahan kerap menyisakan sisa mikroskopis (0,531441 x 4 tidak persis
   2,125764 dalam biner), dan tanpa toleransi angka yang sebenarnya
   bulat akan tampil dengan desimal nol. */
function ciplAngka(n, maks) {
  if (!isFinite(n)) return "";
  const d = maks == null ? 2 : maks;
  const bulat = Math.abs(n - Math.round(n)) < 1e-9;
  const pakai = bulat ? 0 : d;
  return angkaLokal(n, "en-US", {
    minimumFractionDigits: pakai,
    maximumFractionDigits: pakai,
  });
}

// "3 Aug 2026" — bentuk tanggal yang dipakai berkas aslinya.
function ciplTanggal(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const bln = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

function ciplBarisTeks(teks) {
  return String(teks || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}


/* ==================================================================
   COMMERCIAL INVOICE & PACKING LIST — DYNAMIC DESIGN (desain formal)

   Disusun sebagai MODEL KISI (cipl-tata.js). Lembar cetak (ttHtml) dan
   lembar Excel (ttExcel) digambar dari model yang SAMA -- kolom, baris,
   gabungan sel, garis, huruf, pemotongan baris -- jadi keduanya sama
   persis, dan Excel-nya cukup 11 kolom dengan satu sel per kotak.

   Dibaca dari atas:
     judul (garis hitam di bawahnya)
     kartu pihak: Shipper | Document reference, Consignee | Notify Party
     delapan rincian pengiriman (2 pita x 4)
     tabel barang -- kepala navy, baris bergaris tipis, TOTAL satu baris
     ruang kosong yang mendorong bagian akhir ke dasar halaman
     kiri: Packing details (PL); kanan: tanda tangan 50 mm (muat stempel)
   Mata uang SELALU di kiri angkanya: "USD 4,500".

   KISI KOLOM (11 + 1 bila kotak Packing details perlu batas sendiri):
     A | No | Item | Type | HS Code | celah | Qty | Unit | Harga/NW | Jumlah/GW | K
   A & K = tepi dalam bingkai. "celah" = jarak 8 px antara kartu kiri &
   kanan, di tabel menyatu dengan kolom HS Code.
================================================================== */
const CIPL_ASAL_BARANG = "INDONESIA";
const DD_WARNA = {
  navy: "#1f2a44", teks: "#222222", abu: "#777777", putih: "#ffffff",
  garisRinci: "#c8c8c8", garisRinciDalam: "#e4e4e4", garisBarang: "#e2e2e2",
  zebra: "#fafafa", total: "#eeeeee", bingkai: "#222222",
};
const DD_ISI_MM = 176.94; // 190 mm bingkai - 2 x 2 px garis - 2 x 6 mm jarak dalam
const DD_TABEL_PERSEN = [4, 18, 24, 12, 7, 7, 14, 14];
const CIPL_TTD_MM = 50; // kotak tanda tangan di kertas, muat stempel perusahaan
const DD_PAD = ttPx(10); // 9 px jarak + 1 px garis kartu
const ddH = (s, o) => ttH("arial", s, Object.assign({ c: DD_WARNA.teks }, o || {}));

/* NOMOR + TANGGAL satu baris: nomor di kiri, tanggalnya menempel ke
   kanan kotak ("DD-260928-DDI-01_R1 ........ 28 SEP 2026"), tanpa tanda
   kurung. Tiap PO punya tanggalnya sendiri (po-list.js), satu PO per baris. */
const ciplNoTanggal = (no, tanggal) => ({ no, tgl: ciplTanggal(tanggal || "").toUpperCase() });
function ciplPoPasangan(p) {
  const no = [p.poNo].concat(p.poNoExtra || []);
  const tanggal = [p.poDate].concat(p.poDateExtra || []);
  return no
    .map((x, i) => ({ no: String(x || "").trim(), tgl: tanggal[i] }))
    .filter((x) => x.no)
    .map((x) => ciplNoTanggal(x.no, x.tgl));
}

/* Referensi dokumen: label di atas, isinya di bawah -- nomor PO yang
   banyak tetap rapi, satu per baris. */
function ciplRefBaris(row) {
  const p = row.payload || {};
  return [
    ["Invoice No. & Date", [row.doc_number ? ciplNoTanggal(row.doc_number, row.doc_date) : { no: "—", tgl: "" }]],
    ["PO No. & Date", ciplPoPasangan(p).length ? ciplPoPasangan(p) : [{ no: "—", tgl: "" }]],
  ];
}

/* Baris kotak Consignee: nama pembeli lalu alamatnya (cetak & Excel),
   KAPITAL semua -- lihat ciplKapital(). */
function ciplKonsigneeBaris(row, shipment) {
  const p = row.payload || {};
  return [p.customer || (shipment && shipment.party) || "", ...ciplBarisTeks(p.consigneeAddress)]
    .filter(Boolean)
    .map(ciplKapital);
}

/* NAMA BARANG DUA BARIS: "TYRE MOLD" di atas, jenisnya di bawah
   ("TREAD ONLY", "FULL SET", "SIDE ONLY", ...) -- kolomnya bisa lebih
   sempit dan daftar barang lebih mudah dipindai. Nama lain apa adanya. */
function ciplNamaDuaBaris(nama) {
  const m = String(nama || "").match(/^(T[YI]RE\s+MOLDS?)\s+(.+)$/i);
  return m ? [m[1], m[2]] : [String(nama || "")];
}

/* FORMAT ANGKA BERSAMA cetak & Excel -- teks cetaknya dan format sel
   Excel-nya menampilkan hal yang sama.
   Uang: mata uang di kiri; desimal seragam satu kolom (dua desimal kalau
   ada satu saja yang bersen). */
function ciplFormatUang(mata, nilai) {
  const d = (nilai || []).some((n) => Math.round(Number(n) * 100) % 100 !== 0) ? 2 : 0;
  return {
    f: `"${mata} "#,##0${d ? ".00" : ""}`,
    teks: (n) => `${mata} ${angkaLokal(Number(n) || 0, "en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`,
  };
}
/* Angka bersatuan (berat KG, jumlah): desimal mengikuti nilainya
   (170 -> "170", 1,275.5 -> "1,275.5"). */
function ciplFormatAngka(n, satuan) {
  const v = Number(n) || 0;
  const d = Math.round(v * 100) % 100 === 0 ? 0 : Math.round(v * 100) % 10 === 0 ? 1 : 2;
  return {
    v,
    f: `#,##0${d ? "." + "0".repeat(d) : ""}${satuan ? `" ${satuan}"` : ""}`,
    teks: angkaLokal(v, "en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + (satuan ? ` ${satuan}` : ""),
  };
}

/* ISI KOTAK PACKING DETAILS -- [teks, tebal]: jenis kemasan, ukuran peti
   (diringkas per ukuran seperti lembar Kumho), MEASUREMENT (total M3),
   lalu jumlah koli. */
function ciplRincianKemasan(p, shipment, baris) {
  const cbm = baris.reduce((x, b) => x + b.cbmRaw, 0);
  const koli = ciplTotalKoli(shipment);
  const dimensi = typeof ciplVnDimensi === "function" ? ciplVnDimensi((shipment && shipment.items) || []) : [];
  return (p.packing ? [[p.packing, false]] : [])
    .concat(dimensi.map((teks) => [teks, false]))
    .concat(cbm ? [[`MEASUREMENT : ${ciplAngka(cbm, 3)} M³`, true]] : [])
    .concat(koli ? [[`${ciplAngka(koli)} PACKAGE${koli > 1 ? "S" : ""}`, true]] : []);
}

/* Rincian pengiriman [label, isi] -- cetak & Excel.
   Urutan sumber pelabuhan: ketikan pengguna -> profil pembeli ->
   pelabuhan jadwal. Tanggal berlayar TIDAK diambil dari ETD jadwal:
   itu keterangan pengangkut, dan kosong lebih jujur. */
function ciplDdRincianData(row, shipment) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  return [
    ["Port of Loading", p.portLoading || prof.portLoading || (shipment ? portCodeLabel(shipment.origin) : "")],
    ["Final Destination", p.finalDestination || prof.finalDestination || (shipment ? portCodeLabel(shipment.destination) : "")],
    // Udara: No Flight saja; laut: kapal + voyage (carrierCipl, core/carrier-master.js)
    ["Vessel / Flight", carrierCipl(p, shipment)],
    ["Sailing on or About", ciplTanggal(p.sailingDate || "")],
    ["Terms of Delivery", p.termsDelivery || ""],
    ["Terms of Payment", p.termPayment || ""],
    ["Country of Origin", CIPL_ASAL_BARANG],
    ["Remarks", p.remarks || ""],
  ];
}

/* Isian yang WAJIB satu baris: nama pelabuhan ("JAKARTA, INDONESIA").
   Hurufnya dikecilkan seperlunya (paling kecil 7 pt) supaya ", INDONESIA"
   tidak turun sendiri; kalau tetap tak muat, dibiarkan turun baris pada
   ukuran semula -- teks yang turun masih terbaca, yang terpotong tidak.
   Isian lain boleh turun baris. */
const CIPL_RINCI_SATU_BARIS = ["Port of Loading", "Final Destination"];
const CIPL_UKURAN_MIN_PT = 7;

/* ---------------- POTONGAN MODEL ---------------- */

/* Isi kotak pihak: nama tebal 9 pt (boleh turun baris), lalu alamat 8,5 pt.
   Baris alamat dijaga SATU baris masing-masing, SATU ukuran huruf untuk
   seluruh alamat sekotak (dikecilkan seperlunya, min. 7 pt); kalau tetap
   tak muat, alamat dibungkus pada ukuran semula. */
function ddIsiPihak(teks, lebar, alamatSatuBaris) {
  const isi = [ttSpasi(ttPx(6))];
  const [nama, ...alamat] = teks;
  const hNama = ddH(9, { b: true });
  ttBungkus(nama || "", hNama, lebar).forEach((tx) => isi.push(ttBaris(tx, hNama, 9 * 1.42)));
  if (alamat.length) {
    const s = alamatSatuBaris ? ttUkuranPas(alamat, ddH(8.5), lebar, CIPL_UKURAN_MIN_PT) : null;
    if (s) alamat.forEach((tx) => isi.push(ttBaris(tx, ddH(s), s * 1.42)));
    else alamat.forEach((tx) => ttTeks(tx, ddH(8.5), lebar, 1.42).forEach((b) => isi.push(b)));
  }
  return isi;
}

/* Isi kotak Document reference: dua sel berdampingan dengan baris yang
   sejajar -- nomor (kiri) & tanggalnya (rata kanan). */
function ddIsiReferensi(kelompok, lebarNo, lebarLabel) {
  const no = [ttSpasi(ttPx(6))];
  const tgl = [ttSpasi(ttPx(6))];
  const hK = ddH(6.8, { b: true, c: DD_WARNA.abu });
  const hV = ddH(8.8, { b: true });
  kelompok.forEach(([label, isi], k) => {
    if (k) { no.push(ttSpasi(ttPx(11))); tgl.push(ttSpasi(ttPx(11))); }
    ttBungkus(label.toUpperCase(), hK, lebarLabel).forEach((tx) => {
      no.push(ttBaris(tx, hK, 6.8 * 1.42));
      tgl.push(ttSpasi(6.8 * 1.42));
    });
    isi.forEach((x) => {
      ttBungkus(x.no, hV, lebarNo).forEach((tx, i) => {
        no.push(ttBaris(tx, hV, 8.8 * 1.3));
        tgl.push(i === 0 && x.tgl ? ttBaris(x.tgl, hV, 8.8 * 1.3) : ttSpasi(8.8 * 1.3));
      });
    });
  });
  return { no, tgl };
}

/* Isi satu kotak rincian: label abu-abu kecil, nilainya tebal 9 pt. */
function ddIsiRinci(label, nilai, lebar, satuBaris) {
  const hK = ddH(6.8, { b: true, c: DD_WARNA.abu });
  const hV = ddH(9, { b: true });
  const isi = [ttSpasi(ttPx(5))].concat(ttTeks(label.toUpperCase(), hK, lebar, 1.15), [ttSpasi(ttPx(2))]);
  const teks = String(nilai || "").trim() || "—";
  const s = (satuBaris || CIPL_RINCI_SATU_BARIS).includes(label) ? ttUkuranPas([teks], hV, lebar, CIPL_UKURAN_MIN_PT) : null;
  return isi.concat(s ? [ttBaris(teks, ddH(s, { b: true }), s * 1.15)] : ttTeks(teks, hV, lebar, 1.15));
}

/* Sel angka (rata tengah, satu baris): dikecilkan seperlunya kalau tak muat */
function ddSelAngka(T, r, c1, c2, nilai, fmt, teks, h, gaya) {
  const lebar = ttLebarIsi(T, c1, c2, ttPx(5), ttPx(5));
  const s = ttUkuranPas([teks], h, lebar, 5) || h.s;
  return ttSel(T, r, c1, r, c2, [ttBaris(teks, Object.assign({}, h, { s }), h.s * 1.3)],
    Object.assign({ ha: "center", va: "middle", angka: { v: nilai, fmt } }, gaya || {}));
}

/* ---------------- LEMBAR BERGAYA FORMAL (CI / PL) ----------------

   Satu penyusun untuk SEMUA CI & PL bergaya Dynamic Design: lembar
   Dynamic Design sendiri (ciplDdTata) dan lembar Kumho (ciplVnTata,
   cipl-vn-print.js) hanya berbeda ISI -- pita kartu, rincian, kolom
   tabel, kotak kiri bawah -- yang diserahkan lewat `spek`:

     nama, judul
     persen       8 kolom kisi tabel (%, jumlah 100); celah kartu dipotong
                  dari ujung kolom ke-4 (kartu kiri 58% - celah, kanan 42%)
     kartu        [{ kiri: { judul, isi(lebar) }, kanan: { judul, isi(lebar) }
                    | { judul, referensi(lebarNo, lebarLabel) -> { no, tgl } } }]
     rinci        8 x [label, nilai] dalam 2 pita x 4 kotak
     tabel        { kolom: [[k1, k2] ...] (indeks kisi 0..7), kepala: [[judul, sub?]],
                    baris: [[sel ...]], total: [sel ...] }
                  sel = { teks: [baris...] } | { angka: { v, fmt, teks } } | null,
                  sel total boleh { rentang: [k1, k2], teks, kiri }
     kiriBawah    [{ judul, baris: [[teks, tebal]] }] kotak bertumpuk, selebar isinya
     ttd          { atas: [teks...] } -- kotak tanda tangan 50 mm di kanan bawah
*/
function ciplTataFormal(spek) {
  const W = DD_WARNA;
  const isiMm = spek.persen.map((x) => (DD_ISI_MM * x) / 100);
  const celah = ttMm(ttPx(8));
  const tepi = 6 + ttMm(ttPx(2));
  const kolom = [tepi, isiMm[0], isiMm[1], isiMm[2], isiMm[3] - celah, celah, isiMm[4], isiMm[5], isiMm[6], isiMm[7], tepi];

  // Kotak kiri bawah selebar isinya -> satu batas kolom sendiri (dibelah)
  const kotakKiri = spek.kiriBawah || [];
  let belah = null;
  let ujungKiri = null;
  if (kotakKiri.length) {
    const lebarPt = Math.max(...kotakKiri.map((k) => Math.max(
      ttLebar(String(k.judul).toUpperCase(), ddH(7, { b: true })) + ttPx(20),
      Math.max(...(k.baris.length ? k.baris : [["—", false]]).map(([tx, b]) => ttLebar(tx, ddH(8.5, { b }))) ) / TT_LONGGAR + ttPx(10) + ttPx(15),
    )));
    const n0 = kolom.length;
    ujungKiri = ttBelahKolom(kolom, 1, Math.min(ttMm(lebarPt), isiMm[0] + isiMm[1] + isiMm[2]), 1.5);
    if (kolom.length > n0) belah = ujungKiri - 1;
  }
  // indeks kisi tabel (0..7, plus celah) -> kolom sesungguhnya sesudah dibelah
  const asli = [1, 2, 3, 4, 6, 7, 8, 9];
  const geser = (i) => (belah == null || i <= belah ? i : i + 1);
  const awal = (k) => geser(asli[k]);
  const akhir = (k) => (belah != null && asli[k] === belah ? belah + 1 : geser(asli[k]));
  const cA = 0, cK = kolom.length - 1;
  const cKiri1 = awal(0), cKiri2 = akhir(3), cCelah = geser(5), cKanan1 = awal(4), cKanan2 = akhir(7);
  const rentang = ([k1, k2]) => [awal(k1), k2 === 3.5 ? cCelah : akhir(k2)];

  const T = ttTataBaru(spek.nama, kolom);
  const tambah = (pt) => ttTambahBaris(T, pt);

  // JARAK DALAM ATAS + JUDUL (garis hitam 2 px di bawahnya)
  tambah(ttPt(6) + ttPx(2));
  const rJudul = tambah(22 + ttPx(6));
  ttSel(T, rJudul, cKiri1, rJudul, cKanan2, [ttBaris(spek.judul, ddH(20, { b: true }), 22)], { ha: "center" });
  ttGaris(T, rJudul, cKiri1, rJudul, cKanan2, "bawah", { w: 2, warna: W.bingkai });
  tambah(ttPx(10) + ttPx(2));

  // PITA KARTU: kepala navy + badan; dua kartu berdampingan berbagi baris
  const lebarKiri = ttLebarIsi(T, cKiri1, cKiri2, DD_PAD, DD_PAD);
  const lebarKanan = ttLebarIsi(T, cKanan1, cKanan2, DD_PAD, DD_PAD);
  const lebarNo = ttLebarIsi(T, cKanan1, cKanan2 - 1, DD_PAD, ttPx(8));
  const kepalaKartu = (r, c1, c2, teks) => ttSel(T, r, c1, r, c2, [ttBaris(String(teks).toUpperCase(), ddH(7, { b: true, c: W.putih }), 7 * 1.15)],
    { fill: W.navy, va: "middle", padL: DD_PAD });
  spek.kartu.forEach((pita, i) => {
    if (i) tambah(ttPx(8));
    const isiKiri = pita.kiri.isi(lebarKiri);
    let tinggiKanan;
    let pasangKanan;
    if (pita.kanan.referensi) {
      const ref = pita.kanan.referensi(lebarNo, lebarKanan);
      tinggiKanan = ttTinggiIsi(ref.no);
      pasangKanan = (r) => {
        ttSel(T, r, cKanan1, r, cKanan2 - 1, ref.no, { padL: DD_PAD });
        ttSel(T, r, cKanan2, r, cKanan2, ref.tgl, { ha: "right", padR: DD_PAD });
      };
    } else {
      const isi = pita.kanan.isi(lebarKanan);
      tinggiKanan = ttTinggiIsi(isi);
      pasangKanan = (r) => ttSel(T, r, cKanan1, r, cKanan2, isi, { padL: DD_PAD, padR: DD_PAD });
    }
    const rK = tambah(ttPx(8) + 7 * 1.15 + ttPx(1));
    kepalaKartu(rK, cKiri1, cKiri2, pita.kiri.judul);
    kepalaKartu(rK, cKanan1, cKanan2, pita.kanan.judul);
    const rB = tambah(Math.max(ttTinggiIsi(isiKiri), tinggiKanan) + ttPx(7) + ttPx(1));
    ttSel(T, rB, cKiri1, rB, cKiri2, isiKiri, { padL: DD_PAD, padR: DD_PAD });
    pasangKanan(rB);
    ttKotak(T, rK, cKiri1, rB, cKiri2, { warna: W.navy });
    ttKotak(T, rK, cKanan1, rB, cKanan2, { warna: W.navy });
  });
  tambah(ttPx(8));

  // RINCIAN PENGIRIMAN: 2 pita x 4 kotak (22% | 24% | 26% | 28% dari kisi DD)
  const kelompok = (spek.rinciKelompok || [[0, 1], [2, 2], [3, 5], [6, 7]]).map(([k1, k2]) => [awal(k1), akhir(k2)]);
  const rRinci = [];
  [0, 1].forEach((pitaKe) => {
    const isi = kelompok.map(([c1, c2], k) => {
      const [label, nilai] = spek.rinci[pitaKe * 4 + k];
      return ddIsiRinci(label, nilai, ttLebarIsi(T, c1, c2, DD_PAD, DD_PAD), spek.rinciSatuBaris || CIPL_RINCI_SATU_BARIS);
    });
    const r = tambah(Math.max(...isi.map(ttTinggiIsi)) + ttPx(5) + ttPx(1));
    kelompok.forEach(([c1, c2], k) => {
      ttSel(T, r, c1, r, c2, isi[k], { padL: DD_PAD, padR: DD_PAD });
      if (k < 3) ttGaris(T, r, c1, r, c2, "kanan", { warna: W.garisRinciDalam });
    });
    rRinci.push(r);
  });
  ttGaris(T, rRinci[0], cKiri1, rRinci[0], cKanan2, "bawah", { warna: W.garisRinciDalam });
  ttKotak(T, rRinci[0], cKiri1, rRinci[1], cKanan2, { warna: W.garisRinci });
  tambah(ttPx(10));

  // TABEL BARANG
  const tb = spek.tabel;
  const kol = tb.kolom.map(rentang);
  const lebarKol = (i) => ttLebarIsi(T, kol[i][0], kol[i][1], ttPx(5), ttPx(5));
  const hKepala = ddH(7, { b: true, c: W.putih });
  const hSub = ddH(6, { c: "#c9d0e0" });
  const isiKepala = tb.kepala.map(([judul, sub], i) => ttTeks(String(judul).toUpperCase(), hKepala, lebarKol(i), 1.15)
    .concat(sub ? ttTeks(sub, hSub, lebarKol(i), 1.15) : []));
  const rKepala = tambah(Math.max(...isiKepala.map(ttTinggiIsi)) + ttPx(12));
  kol.forEach(([c1, c2], i) => ttSel(T, rKepala, c1, rKepala, c2, isiKepala[i], { ha: "center", va: "middle", fill: W.navy }));

  const hIsi = ddH(8.5);
  const pitchIsi = 8.5 * 1.3;
  const padIsi = tb.padBaris == null ? ttPx(8) : tb.padBaris;
  tb.baris.forEach((sel, i) => {
    const teks = sel.map((x, k) => (x && x.teks ? x.teks.flatMap((tx) => ttBungkus(tx, hIsi, lebarKol(k))) : null));
    const n = Math.max(1, ...teks.map((x) => (x ? x.length : 1)));
    const r = tambah(n * pitchIsi + padIsi + ttPx(1));
    const g = { ha: "center", va: "middle", fill: i % 2 === 1 ? W.zebra : null };
    sel.forEach((x, k) => {
      const [c1, c2] = kol[k];
      if (x && x.angka) ddSelAngka(T, r, c1, c2, x.angka.v, x.angka.fmt, x.angka.teks, hIsi, g);
      else {
        const s = ttSel(T, r, c1, r, c2, (teks[k] || [""]).map((tx) => ttBaris(tx, hIsi, pitchIsi)), g);
        if (x && x.nilaiExcel) s.angka = x.nilaiExcel;
      }
    });
    ttGaris(T, r, cKiri1, r, cKanan2, "bawah", { warna: W.garisBarang });
  });

  // TOTAL: satu baris memanjang tepat di bawah barang
  const rTotal = tambah(9 * 1.15 + ttPx(12) + ttPx(2));
  const hT = ddH(9, { b: true });
  const gT = { ha: "center", va: "middle", fill: W.total };
  tb.total.forEach((x) => {
    const [c1, c2] = x.rentang ? rentang(x.rentang) : kol[x.kolom];
    if (x.angka) ddSelAngka(T, rTotal, c1, c2, x.angka.v, x.angka.fmt, x.angka.teks, hT, gT);
    else ttSel(T, rTotal, c1, rTotal, c2, x.teks ? [ttBaris(x.teks, hT, 9 * 1.15)] : [],
      Object.assign({}, gT, x.kiri ? { ha: "left", padL: ttPx(9) } : {}));
  });
  ttGaris(T, rTotal, cKiri1, rTotal, cKanan2, "atas bawah", { w: 2, warna: W.navy });

  // RUANG PENGISI (mendorong bagian akhir ke dasar halaman, min. 6 mm)
  const rPengisi = tambah(ttPt(6));

  // BAGIAN AKHIR: kotak kiri bertumpuk & tanda tangan 50 mm di kanan
  const ttdAtas = [];
  (spek.ttd.atas || []).forEach((tx, i) => {
    if (i) ttdAtas.push(ttSpasi(ttPx(1)));
    ttdAtas.push(ttBaris(tx, i ? ddH(8.5, { b: true }) : ddH(8), (i ? 8.5 : 8) * 1.15));
  });
  const ttdBawah = [ttSpasi(ttPx(3)), ttBaris("Authorized Signature", ddH(8), 8 * 1.15)];
  const rAkhirAtas = T.baris.length;
  kotakKiri.forEach((k, i) => {
    if (i) tambah(ttPx(8));
    const isi = [ttSpasi(ttPx(6))].concat((k.baris.length ? k.baris : [["—", false]]).map(([tx, tebal]) => ttBaris(tx, ddH(8.5, { b: tebal }), 8.5 * 1.55)));
    const rKK = tambah(ttPx(8) + 7 * 1.15 + ttPx(1));
    const rKB = tambah(ttTinggiIsi(isi) + ttPx(7) + ttPx(1));
    const cUjung = ujungKiri - 1;
    ttSel(T, rKK, cKiri1, rKK, cUjung, [ttBaris(String(k.judul).toUpperCase(), ddH(7, { b: true, c: W.putih }), 7 * 1.15)], { ha: "center", va: "middle", fill: W.navy });
    ttSel(T, rKB, cKiri1, rKB, cUjung, isi, { padL: DD_PAD, padR: ttPx(15) });
    ttKotak(T, rKK, cKiri1, rKB, cUjung, { warna: W.navy });
  });
  const sudah = T.baris.slice(rAkhirAtas).reduce((a, b) => a + b, 0);
  const rRuang = tambah(Math.max(ttPx(10), ttPt(CIPL_TTD_MM) - sudah - ttTinggiIsi(ttdBawah), kotakKiri.length ? 0 : ttTinggiIsi(ttdAtas)));
  const rTtd = tambah(ttTinggiIsi(ttdBawah));
  ttSel(T, rAkhirAtas, cKanan1, rRuang, cKanan2, ttdAtas, { ha: "center" });
  ttSel(T, rTtd, cKanan1, rTtd, cKanan2, ttdBawah, { ha: "center" });
  ttGaris(T, rTtd, cKanan1, rTtd, cKanan2, "atas", { warna: W.teks });

  // JARAK DALAM BAWAH, BINGKAI, SETINGGI HALAMAN
  const rAkhir = tambah(ttPt(5) + ttPx(2));
  ttKotak(T, 0, cA, rAkhir, cK, { w: 2, warna: W.bingkai });
  ttPenuhiHalaman(T, rPengisi);
  return T;
}

/* ---------------- LEMBAR CI / PL DYNAMIC DESIGN ---------------- */
function ciplDdTata(jenis, row, shipment, baris) {
  const ci = jenis === "CI";
  const p = row.payload || {};
  const uang = ciplFormatUang(p.currency || "USD", baris.flatMap((b) => [b.harga, b.amount]));
  const angka = (n, satuan) => {
    const f = ciplFormatAngka(n, satuan);
    return { angka: { v: f.v, fmt: f.f, teks: f.teks } };
  };
  const duit = (n) => ({ angka: { v: Number(n) || 0, fmt: uang.f, teks: uang.teks(n) } });
  const satuan = [...new Set(baris.map((b) => b.satuan).filter(Boolean))];
  const kemasan = ci ? [] : ciplRincianKemasan(p, shipment, baris);
  return ciplTataFormal({
    nama: jenis,
    judul: ci ? ciplJudulInvoice(row) : "PACKING LIST",
    persen: DD_TABEL_PERSEN,
    kartu: [
      { kiri: { judul: "Shipper / Exporter", isi: (l) => ddIsiPihak(CIPL_SHIPPER, l, true) },
        kanan: { judul: "Document reference", referensi: (lNo, lLabel) => ddIsiReferensi(ciplRefBaris(row), lNo, lLabel) } },
      { kiri: { judul: "Consignee / Buyer", isi: (l) => ddIsiPihak(ciplKonsigneeBaris(row, shipment), l, true) },
        kanan: { judul: "Notify Party", isi: (l) => ddIsiPihak([ciplKapital(p.notifyParty || "SAME AS CONSIGNEE")], l, false) } },
    ],
    rinci: ciplDdRincianData(row, shipment),
    tabel: {
      kolom: [[0, 0], [1, 1], [2, 2], [3, 3.5], [4, 4], [5, 5], [6, 6], [7, 7]],
      kepala: (ci ? ["No", "Item", "Type", "HS Code", "Qty", "Unit", "Unit Price", "Amount"]
        : ["No", "Item Description", "Type", "HS Code", "Qty", "Unit", "Net Weight", "Gross Weight"]).map((k) => [k]),
      baris: baris.map((b, i) => {
        const hs = String(b.hs || "");
        return [
          { teks: [String(i + 1)], nilaiExcel: { v: i + 1, fmt: "0" } },
          { teks: ciplNamaDuaBaris(b.item) },
          { teks: [b.type || ""] },
          // HS Code berupa angka murni -> angka di Excel (tanpa segitiga hijau "angka sebagai teks")
          Object.assign({ teks: [hs] }, /^[1-9]\d{3,11}$/.test(hs) ? { nilaiExcel: { v: Number(hs), fmt: "0" } } : {}),
          angka(b.qty, ""),
          { teks: [b.satuan || ""] },
          ci ? duit(b.harga) : angka(b.netto, "KG"),
          ci ? duit(b.amount) : angka(b.bruto, "KG"),
        ];
      }),
      total: [
        { rentang: [0, 3.5], teks: "TOTAL", kiri: true },
        Object.assign({ kolom: 4 }, angka(baris.reduce((x, b) => x + (Number(b.qty) || 0), 0), "")),
        { kolom: 5, teks: satuan.length === 1 ? satuan[0] : "" },
        ci ? { kolom: 6 } : Object.assign({ kolom: 6 }, angka(baris.reduce((x, b) => x + b.netto, 0), "KG")),
        ci ? Object.assign({ kolom: 7 }, duit(baris.reduce((x, b) => x + b.amount, 0)))
          : Object.assign({ kolom: 7 }, angka(baris.reduce((x, b) => x + b.bruto, 0), "KG")),
      ],
    },
    kiriBawah: ci ? [] : [{ judul: "Packing details", baris: kemasan }],
    ttd: { atas: ["For and on behalf of", CIPL_PERUSAHAAN.nama] },
  });
}

/* ------------------------------------------------------------------
   HALAMAN 3 — SHIPPING INSTRUCTION

   Berbeda bentuk dari dua halaman di atas: bukan tabel barang,
   melainkan surat berisi daftar instruksi ke forwarder, berkop
   perusahaan (Times New Roman). Disusun dengan model kisi yang sama
   (ciplSiTata), jadi cetakan & Excel-nya pun sama persis.

   Beberapa baris SENGAJA dibiarkan kosong (PEB Number, Booking
   Number, Vessel, ETD/ETA, Stuffing Date). Itu yang diisi forwarder
   setelah menerima instruksinya — mengisinya dari tebakan kita
   justru menghilangkan gunanya.
------------------------------------------------------------------ */

/* SUSUNAN SHIPPING INSTRUCTION — dipetakan dari berkas aslinya.

   Penanda di depan tiap label adalah huruf "T" berfont Wingdings pada
   berkas asli; di sini dipakai lambang setara (❋).

   `kosong: true` menandai baris yang SENGAJA dibiarkan kosong — diisi
   forwarder setelah menerima instruksinya. */
const CIPL_SI_BARIS = [
  { k: "Bill of Lading", f: "blType", bawaan: "Original/Telex" },
  { k: "Shipper", alamat: "shipper" },
  { k: "Consignee", alamat: "consignee" },
  { k: "Notify Party", f: "notifyParty", bawaan: "SAME AS CONSIGNEE", kapital: true },
  { k: "Place of Receipt", f: "portLoading", dari: "origin" },
  { k: "Port of Discharge", f: "finalDestination", dari: "destination" },
  { k: "Description of Goods", hitung: "barang", tebal: true },
  { k: "Volume", hitung: "muatan" },
  { k: "Gross Weight", hitung: "gw", satuan: "KG" },
  { k: "Net Weight", hitung: "nw", satuan: "KG" },
  { k: "QTY", hitung: "koli", tebal: true },
  { k: "PEB Number", kosong: true },
  { k: "PEB Date", kosong: true },
  { k: "Cont + Seal", kosong: true },
  { k: "HS Code", hitung: "hs", tebal: true },
  { k: "Ocean Freight", f: "oceanFreight" },
  { k: "Booking Number", kosong: true },
  { k: "Vessel", kosong: true },
  { k: "ETD", kosong: true },
  { k: "ETA", kosong: true },
  { k: "Stuffing Date", kosong: true },
  { k: "L/C Number", kosong: true },
  { k: "Special Instruction", kosong: true },
];

/* NOMOR SI = NOMOR URUT CIPL-nya sendiri.

   Yang dipakai kolom `seq` pada baris nomor dokumen — urutan yang
   diterbitkan database saat nomor invoice dibuat. Itulah "nomor urut
   CIPL" yang dimaksud, dan ia benar untuk SEMUA bentuk nomor.

   Ekor nomor invoice dipakai HANYA kalau seq tidak terbawa (baris
   lama yang dimuat sebelum kolomnya ikut diambil). Ekor itu tidak
   bisa jadi sumber utama: pola Kumho berakhir dengan TANGGAL —
   "DDI - CRBM - IX - 051 - 20260924" — sehingga yang terbaca
   20260924, bukan 51.

   Kalau kolom No. SI diisi manual, isian itu yang menang; nomor
   turunan ini hanya bawaan. */
function ciplNoSiDariInvoice(nomor) {
  const m = /(\d+)\s*$/.exec(String(nomor || ""));
  if (!m) return "";
  return String(Number(m[1]));
}

function ciplNoSiBawaan(row) {
  const seq = Number(row && row.seq);
  if (isFinite(seq) && seq > 0) return String(seq);
  return ciplNoSiDariInvoice(row && row.doc_number);
}

/* Nilai tiap baris dikumpulkan SEKALI di muka, lalu dipakai bersama
   oleh versi cetak dan versi Excel. Menghitungnya dua kali berarti dua
   sumber angka yang akan berbeda pelan-pelan — dan yang satu tercetak,
   yang satu terkirim ke forwarder. */
function ciplSiData(row, shipment, baris) {
  const p = row.payload || {};
  /* Kotak Consignee SI = kotak Consignee CI (satu pembangun baris,
     ikut kapital semua). Dulu disalin di sini dan bisa berbeda
     diam-diam dari yang tercetak di halaman 1. */
  const consignee = ciplKonsigneeBaris(row, shipment);
  const koli = ciplTotalKoli(shipment);

  return {
    tujuan: p.siTo || (shipment && shipment.forwarder) || "",
    no: p.siNo || ciplNoSiBawaan(row),
    shipper: CIPL_SHIPPER,
    consignee: consignee,
    // Nama dasar barang ("TYRE MOLD"), tanpa jenisnya (TREAD ONLY, FULL SET, ...)
    barang: [...new Set(baris.map((b) => ciplNamaDuaBaris(b.item)[0].trim()).filter(Boolean))].join(", "),
    muatan: (shipment && shipment.muatan) || "",
    gw: ciplAngka(baris.reduce((s, b) => s + b.bruto, 0)),
    nw: ciplAngka(baris.reduce((s, b) => s + b.netto, 0)),
    koli: koli ? ciplAngka(koli) + " PACKAGE" : "",
    hs: (baris.find((b) => b.hs) || {}).hs || "",
    tanggal: ciplTanggalId(row.doc_date),
    payload: p,
    shipment: shipment,
  };
}

/* `kapital: true` pada definisi baris = nilainya dicetak KAPITAL (kotak
   pihak, seperti di CI). Baris lain tidak disentuh -- "Original/Telex"
   memang bertulis campur. */
function ciplSiNilai(def, d) {
  const nilai = ciplSiNilaiMentah(def, d);
  return def.kapital ? ciplKapital(nilai) : nilai;
}

function ciplSiNilaiMentah(def, d) {
  if (def.kosong) return "";
  if (def.hitung) return d[def.hitung] || "";
  if (def.f) {
    const v = d.payload[def.f];
    if (v) return v;
    if (def.bawaan) return def.bawaan;
  }
  if (def.dari && d.shipment) return portCodeLabel(d.shipment[def.dari]);
  return "";
}


/* LEMBAR SHIPPING INSTRUCTION -- model kisi yang sama dengan CI & PL.

   Kolom: A (tepi + jorok label) | penanda | label | titik dua | isi | F.
   Bingkai 1 px hitam setinggi halaman; isi mengalir dari atas (kop,
   judul, nomor, tujuan, daftar instruksi, penutup), sisa tinggi di
   bawah tanda tangan. Huruf Times New Roman. */
function ciplSiTata(row, shipment, baris) {
  const d = ciplSiData(row, shipment, baris);
  const H = (s, o) => ttH("times", s, Object.assign({ c: "#000000" }, o || {}));
  const garis = ttMm(ttPx(1));
  const dalam = ttMm(ttPx(36));
  const kolom = [garis + dalam + ttMm(ttPx(26)), ttMm(ttPx(20)), ttMm(ttPx(194)), ttMm(ttPx(16)), 0, garis + dalam];
  kolom[4] = 190 - kolom.reduce((a, b) => a + b, 0);
  const T = ttTataBaru("SI", kolom);
  const tambah = (pt) => ttTambahBaris(T, pt);
  const [cA, cTanda, cLabel, cTitik, cIsi, cF] = [0, 1, 2, 3, 4, 5];
  const padTeks = ttPx(37); // garis + jarak dalam: tepi kiri teks bebas
  const lh = 1.15;
  const teks = (r, isi, gaya) => ttSel(T, r, cA, r, cF, isi, Object.assign({ padL: padTeks, padR: padTeks }, gaya || {}));

  tambah(ttPx(20) + ttPx(1));
  // KOP: logo di kiri (70 px), nama & alamat di tengah sisa lebarnya
  const padKopL = ttPx(37 + 70 + 6);
  const padKopR = ttPx(37 + 6);
  const lebarKop = ttLebarIsi(T, cA, cF, padKopL, padKopR);
  const hAlamat = H(9);
  const sAlamat = ttUkuranPas([CIPL_PERUSAHAAN.pusat, CIPL_PERUSAHAAN.cabang], hAlamat, lebarKop, 6) || 9;
  const kop = [ttSpasi(ttPx(4)), ttBaris(CIPL_PERUSAHAAN.nama, H(19, { b: true }), 19 * lh),
    ttBaris(CIPL_PERUSAHAAN.pusat, H(sAlamat), 9 * lh), ttBaris(CIPL_PERUSAHAAN.cabang, H(sAlamat), 9 * lh)];
  const rKop = tambah(ttTinggiIsi(kop) + ttPx(4));
  ttSel(T, rKop, cA, rKop, cF, kop, { ha: "center", padL: padKopL, padR: padKopR });
  if (typeof SJ_LOGO !== "undefined") {
    T.gambar.push({ src: SJ_LOGO, xMm: ttMm(ttPx(46)), yMm: ttMm(ttPx(25)), wMm: ttMm(ttPx(52)), hMm: ttMm(ttPx((52 * 94) / 127)) });
  }

  tambah(ttPx(36));
  const rJudul = tambah(16 * lh);
  ttSel(T, rJudul, cA, rJudul, cF, [ttBaris("SHIPPING INSTRUCTION", H(16, { b: true, u: true }), 16 * lh)], { ha: "center", va: "middle" });
  const rNo = tambah(ttPx(2) + 11.5 * lh);
  ttSel(T, rNo, cA, rNo, cF, [ttBaris(`NO. ${d.no}`, H(11.5, { b: true }), 11.5 * lh)], { ha: "center", va: "bottom" });
  tambah(ttPx(30));
  const hBiasa = H(10.5);
  const lebarBebas = ttLebarIsi(T, cA, cF, padTeks, padTeks);
  const isiTo = ttTeks(`To : ${d.tujuan}`, hBiasa, lebarBebas, lh);
  teks(tambah(ttTinggiIsi(isiTo) + ttPx(4)), isiTo);
  const rLead = tambah(10.5 * lh + ttPx(10));
  teks(rLead, [ttBaris("Please arrange our shipment per description below :", hBiasa, 10.5 * lh)]);

  // DAFTAR INSTRUKSI: penanda | label | : | isi -- satu baris kisi per butir
  const lebarIsi = ttLebarIsi(T, cIsi, cIsi, 0, 0);
  const butir = (label, nilai, o) => {
    const isi = ttTeks(nilai, H(10.5, { b: !!o.tebal }), lebarIsi, lh);
    const r = tambah(ttTinggiIsi(isi) + ttPx(2));
    if (label != null) {
      if (!o.sub) ttSel(T, r, cTanda, r, cTanda, [ttBaris("❋", H(8.5), 10.5 * lh)], { va: "top" });
      ttSel(T, r, cLabel, r, cLabel, [ttBaris(label, o.sub ? H(9.5) : hBiasa, 10.5 * lh)]);
      if (!o.sub) ttSel(T, r, cTitik, r, cTitik, [ttBaris(":", hBiasa, 10.5 * lh)]);
    }
    const s = ttSel(T, r, cIsi, r, cIsi, isi);
    if (o.angka) s.angka = o.angka;
  };
  CIPL_SI_BARIS.forEach((def) => {
    if (def.alamat) {
      const isi = d[def.alamat];
      butir(def.k, isi[0] || "", {});
      butir("Address", isi.slice(1).join("\n"), { sub: true });
      return;
    }
    const nilai = ciplSiNilai(def, d);
    // HS Code angka murni -> angka di Excel (tanpa segitiga hijau "angka sebagai teks")
    const angka = def.hitung === "hs" && /^[1-9]\d{3,11}$/.test(nilai) ? { v: Number(nilai), fmt: "0" } : null;
    butir(def.k, `${nilai}${def.satuan && nilai ? `   ${def.satuan}` : ""}`, { tebal: def.tebal, angka });
  });

  // PENUTUP
  tambah(ttPx(16));
  teks(tambah(10.5 * lh), [ttBaris("Thank you for your good cooperation.", hBiasa, 10.5 * lh)]);
  tambah(ttPx(12));
  teks(tambah(10.5 * lh), [ttBaris(`Cirebon, ${d.tanggal}`, hBiasa, 10.5 * lh)]);
  teks(tambah(10.5 * lh), [ttBaris("Regards,", hBiasa, 10.5 * lh)]);
  tambah(ttPx(84));
  teks(tambah(10.5 * lh), [ttBaris("SIGN & STAMP", H(10.5, { b: true, u: true }), 10.5 * lh)]);
  const rPengisi = tambah(0);
  const rAkhir = tambah(ttPx(22) + ttPx(1));
  ttKotak(T, 0, cA, rAkhir, cF, { warna: "#000000" });
  ttPenuhiHalaman(T, rPengisi);
  return T;
}

/* Lembar-lembar CIPL menurut profil pembeli: Kumho (layout "vn") CI & PL,
   selain itu Dynamic Design CI, PL & SI. Dipakai cetak DAN Excel. */
function ciplDaftarTata(row, shipment) {
  const prof = ciplProfil((row.payload || {}).customer || (shipment && shipment.party));
  if (prof.layout === "vn" && typeof ciplVnTata === "function") {
    return [ciplVnTata("CI", row, shipment), ciplVnTata("PL", row, shipment)];
  }
  const baris = ciplBarisBarang(shipment);
  return [ciplDdTata("CI", row, shipment, baris), ciplDdTata("PL", row, shipment, baris), ciplSiTata(row, shipment, baris)];
}

/* "03 Agustus 2026" — bentuk tanggal Indonesia untuk penutup surat. */
function ciplTanggalId(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const bln = ["Januari","Februari","Maret","April","Mei","Juni",
               "Juli","Agustus","September","Oktober","November","Desember"];
  return `${String(d.getDate()).padStart(2, "0")} ${bln[d.getMonth()]} ${d.getFullYear()}`;
}

/* Cari baris riwayat nomor dokumen, atau beri tahu kalau tidak ada.

   Dipakai bersama oleh pencetakan DAN pengunduhan Excel. Dulu keduanya
   punya salinan pencariannya sendiri, termasuk perbandingan
   String(id) === String(rowId) dan bunyi pesannya. Perbandingan itu
   sengaja longgar karena id bisa datang sebagai angka dari database
   atau sebagai teks dari atribut DOM — persis jenis aturan yang tidak
   boleh hidup di dua tempat. */
function ciplCariBarisRiwayat(rowId) {
  const row = (docNumHistoryRows || []).find(
    (r) => String(r.id) === String(rowId),
  );
  if (!row) showToast(t("m.data.invoice.tidak.ditemukan"), "danger");
  return row || null;
}


/* ------------------------------------------------------------------
   PEMICU CETAK
------------------------------------------------------------------ */
function cetakCipl(rowId) {
  const row = ciplCariBarisRiwayat(rowId);
  if (!row) return;

  const tautId = (row.payload || {}).shipmentId;
  const shipment = ciplCariShipment(tautId);
  if (tautId && !shipment) {
    showToast(t("m.jadwal.yang.ditautkan.tidak.ditemukan.daftar.b"),
      "warning",
    );
  } else if (!tautId) {
    showToast(t("m.invoice.ini.belum.ditautkan.ke.jadwal.export.d"),
      "warning",
    );
  }

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger", { judul: tt("Pop-up diblokir", "Pop-up blocked"), tetap: true });
    return;
  }
  /* Lembar dipilih dari PROFIL PEMBELI (ciplDaftarTata) -- model yang
     sama dipakai unduhan Excel, jadi cetakan & Excel tidak bisa berbeda. */
  w.document.write(ttDokumenHtml(`${ciplJudulInvoice(row)} ${row.doc_number || ""}`, ciplDaftarTata(row, shipment)));
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}
