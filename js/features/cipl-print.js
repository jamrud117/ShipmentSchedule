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
const CIPL_SHIPPER = [
  "PT Dynamic Design Indonesia",
  "Jalan Mayjend Sutoyo No. 1,",
  "Desa/Kelurahan Pabedilan Kulon, Kecamatan. Pabedilan",
  "Kabupaten. Cirebon, Provinsi Jawa Barat, Kode Pos: 45193",
  "ATTN : jjh2296@dynamicdesign.co.kr",
  "TEL : +622318886161",
  "TAX ID :  0656 3197 7906 1000",
];

/* Sisa tabel diisi SATU ruang kosong setinggi baris yang tersisa —
   bukan deretan baris bergaris.

   Berkas aslinya menyisakan area kosong yang hanya punya garis kolom
   tegak, tanpa garis mendatar antar baris. Menggambar baris kosong
   satu per satu menghasilkan grid kotak-kotak yang tidak ada di
   dokumen aslinya.

   Tingginya tetap dihitung dari jumlah baris supaya blok Total dan
   tanda tangan selalu jatuh di tempat yang sama. */
const CIPL_MIN_BARIS = 14;
const CIPL_TINGGI_BARIS = 15;

/* LEBAR KOLOM DIDEFINISIKAN DI SINI, BUKAN DI KELAS SEL.

   Dengan table-layout tetap, lebar kolom diambil dari BARIS PERTAMA
   tabel — dan baris pertama di sini berisi header ber-colspan: "Unit
   Price", "Amount", "CBM". Kolom yang tertutup colspan tidak punya
   lebar sendiri, jadi peramban membaginya RATA di antara keduanya.

   Akibatnya lebar yang ditulis pada sel body (.ci-dim, .ci-cur, dst.)
   diabaikan sepenuhnya: kolom "USD" jadi selebar kolom angkanya, dan
   kolom dimensi jadi selebar kolom nilai CBM — sehingga teks dimensi
   terpotong sementara di sebelahnya menganga.

   <colgroup> memberi lebar per kolom terlepas dari colspan di header.
   Jumlah tiap deret HARUS 100 — ada uji penjaganya. */
const CIPL_COLS_INVOICE = [3.5, 23, 25, 8.5, 5, 4.5, 4.5, 10, 4.5, 11.5];
/* Packing List: No, Item, Type, HS, Qty, Unit, NW, GW, Dimensi, CBM.

   Item dinaikkan 17 -> 20 dan Dimensi diturunkan 19 -> 16. Alasannya
   terlihat pada cetakan: "80 CM x 80 CM x 56 CM" duduk longgar di
   kolom dimensi sementara "TYRE MOLD TREAD ONLY" — sama-sama sekitar
   20 huruf — terpotong di kolom sebelahnya. Ruangnya ada, cuma salah
   tempat.

   Type ikut turun 21 -> 20: isinya ("CREDO SUNMODE 195/65R15") memang
   sedikit lebih panjang, tapi ia sudah muat dengan lega sedangkan Item
   tidak. */
const CIPL_COLS_PACKING = [3.5, 20, 20, 8.5, 5, 4.5, 6, 6, 16, 10.5];

/* `peran` menandai kolom mana yang boleh MELEBAR mengikuti isinya dan
   kolom mana yang MENYUMBANG lebarnya. Ditulis sebagai atribut di
   markup, bukan sebagai nomor indeks di dalam skrip pengepas — indeks
   yang ditulis di dua tempat akan bergeser sendiri begitu ada kolom
   disisipkan, dan yang melebar jadi kolom yang salah. */
function ciplColgroupHtml(cols, peran) {
  const p = peran || {};
  return `<colgroup>${cols
    .map((w, i) => {
      const tanda =
        p.item === i ? ' data-pas="item"' : p.penyumbang === i ? ' data-pas="sumbang"' : "";
      return `<col style="width:${w}%"${tanda}>`;
    })
    .join("")}</colgroup>`;
}

function ciplRuangKosongHtml(jumlahBaris, kolom) {
  const sisa = Math.max(0, CIPL_MIN_BARIS - jumlahBaris);
  if (!sisa) return "";
  const sel = Array.from({ length: kolom })
    .map(() => "<td></td>")
    .join("");
  return `<tr class="ci-fill" style="height:${sisa * CIPL_TINGGI_BARIS}px">${sel}</tr>`;
}

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
const CIPL_ALAMAT_BUYER = [
  {
    match: ["DYNAMIC DESIGN CO", "DYNAMIC DESIGN COLTD"],
    lines: [
      "12, Cheomdanyeonsin-ro 29 beon-gil Buk-gu Gwangju, 61089",
      "Republic of Korea",
      "TEL : 82-62-720-7894   FAX : 82-62-443-0993",
    ],
  },
];

function ciplNormalNama(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

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
      const n = ciplPecahNama(it.namaBarang);
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
  return n.toLocaleString("en-US", {
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

/* ------------------------------------------------------------------
   POTONGAN YANG DIPAKAI KEDUA HALAMAN
------------------------------------------------------------------ */

function ciplKopHtml(judul) {
  return `
    <table class="ci-kop">
      <tr>
        <td class="ci-kop-logo"><img src="${SJ_LOGO}" alt="" /></td>
        <td class="ci-kop-teks">
          <div class="ci-company">${escapeHtml(CIPL_PERUSAHAAN.nama)}</div>
          <div class="ci-addr">${escapeHtml(CIPL_PERUSAHAAN.pusat)}</div>
          <div class="ci-addr">${escapeHtml(CIPL_PERUSAHAAN.cabang)}</div>
        </td>
      </tr>
    </table>
    <div class="ci-title">${escapeHtml(judul)}</div>`;
}

function ciplPihakHtml(row, shipment) {
  const p = row.payload || {};
  const consignee = [
    p.customer || (shipment && shipment.party) || "",
    ...ciplBarisTeks(p.consigneeAddress),
  ].filter(Boolean);

  const kotak = (judul, isi) => `
    <div class="ci-cell">
      <div class="ci-k">${escapeHtml(judul)}</div>
      ${isi}
    </div>`;

  const barisTeks = (arr, tebalPertama) =>
    arr
      .map(
        (x, i) =>
          `<div class="ci-v${i === 0 && tebalPertama ? " ci-v-bold" : ""}">${escapeHtml(x)}</div>`,
      )
      .join("");

  const kotakNilai = (judul, nilai, tanggal) => `
    <div class="ci-cell">
      <div class="ci-k">${escapeHtml(judul)}</div>
      <div class="ci-row-split">
        <span class="ci-v">${escapeHtml(nilai || "")}</span>
        <span class="ci-v ci-right">${escapeHtml(tanggal || "")}</span>
      </div>
    </div>`;

  return `
  <table class="ci-parties">
    <tr>
      <td class="ci-left">
        ${kotak("Shipper/Seller", barisTeks(CIPL_SHIPPER, true))}
        ${kotak("Consignee/Buyer", barisTeks(consignee, true))}
        ${kotak("Notify Party", `<div class="ci-v">${escapeHtml(p.notifyParty || "SAME AS CONSIGNEE")}</div>`)}
      </td>
      <td class="ci-right-col">
        ${kotakNilai("Invoice No. & Date", row.doc_number, ciplTanggal(row.doc_date))}
        ${kotakNilai("PO No. & Date", p.poNo, ciplTanggal(p.poDate))}
        ${kotak("Terms of Delivery", `<div class="ci-v ci-indent">${escapeHtml(p.termsDelivery || "")}</div>`)}
        ${kotak("Term of Payment", `<div class="ci-v ci-indent">${escapeHtml(p.termPayment || "")}</div>`)}
        ${kotak("Remarks", `<div class="ci-v ci-indent">${escapeHtml(p.remarks || "")}</div>`)}
      </td>
    </tr>
  </table>`;
}

function ciplAngkutanHtml(row, shipment) {
  const p = row.payload || {};
  const pol = p.portLoading || (shipment ? portCodeLabel(shipment.origin) : "");
  const dest =
    p.finalDestination || (shipment ? portCodeLabel(shipment.destination) : "");
  const carrier = p.carrier || (shipment && shipment.vessel) || "";
  /* Sailing on or about SENGAJA tidak diturunkan dari ETD jadwal.
     Tanggal berlayar di invoice adalah keterangan pengangkut, bukan
     rencana kita — dan invoice kerap terbit sebelum kapalnya pasti.
     Kosong lebih jujur daripada tanggal yang kelihatan resmi. */
  const sailing = p.sailingDate || "";

  return `
  <table class="ci-ship">
    <tr>
      <td class="ci-k">Port of Loading</td>
      <td class="ci-k ci-center">Carrier</td>
      <td class="ci-k ci-center ci-sail">Sailing on<br>or About</td>
      <td class="ci-k">Final Destination</td>
    </tr>
    <tr class="ci-ship-val">
      <td class="ci-center">${escapeHtml(pol)}</td>
      <td class="ci-center">${escapeHtml(carrier)}</td>
      <td class="ci-center">${escapeHtml(ciplTanggal(sailing))}</td>
      <td class="ci-center">${escapeHtml(dest)}</td>
    </tr>
  </table>`;
}

/* Kotak tanda tangan disatukan ke dalam tabel barang sebagai baris
   terakhir. Sebagai tabel terpisah, tepi kirinya tidak pernah benar
   segaris dengan kolom Total di atasnya — lebar kolom tabel barang
   ditentukan isinya, dan tabel kedua tidak tahu berapa hasilnya. */
function ciplBarisTandaTanganHtml(kolomKosong, kolomTtd) {
  return `
    <tr class="ci-sign-row">
      <td colspan="${kolomKosong}" class="ci-sign-empty"></td>
      <td colspan="${kolomTtd}" class="ci-sign-cell">
        <div class="ci-k">Signed by</div>
        <div class="ci-sign-space"></div>
      </td>
    </tr>`;
}

/* ------------------------------------------------------------------
   HALAMAN 1 — COMMERCIAL / NON-COMMERCIAL INVOICE
------------------------------------------------------------------ */
function ciplHalamanInvoice(row, shipment, baris) {
  const p = row.payload || {};
  const mata = p.currency || "USD";
  const total = baris.reduce((s, b) => s + b.amount, 0);

  const isi = baris
    .map(
      (b, i) => `
      <tr>
        <td class="ci-c">${i + 1}</td>
        <td class="ci-c ci-item">${escapeHtml(b.item)}</td>
        <td class="ci-c ci-type">${escapeHtml(b.type)}</td>
        <td class="ci-c">${escapeHtml(b.hs)}</td>
        <td class="ci-c">${escapeHtml(ciplAngka(b.qty))}</td>
        <td class="ci-c">${escapeHtml(b.satuan)}</td>
        <td class="ci-cur">${escapeHtml(mata)}</td>
        <td class="ci-num ci-w-money">${escapeHtml(ciplAngka(b.harga, 2))}</td>
        <td class="ci-cur">${escapeHtml(mata)}</td>
        <td class="ci-num ci-w-money">${escapeHtml(ciplAngka(b.amount, 2))}</td>
      </tr>`,
    )
    .join("");

  return `
  <div class="ci-sheet">
    <div class="ci-box">
      ${ciplKopHtml(ciplJudulInvoice(row))}
      ${ciplPihakHtml(row, shipment)}
      ${ciplAngkutanHtml(row, shipment)}
      <table class="ci-items">
        ${ciplColgroupHtml(CIPL_COLS_INVOICE)}
        <thead>
          <tr>
            <th class="ci-w-no">No</th>
            <th class="ci-w-item">Item</th>
            <th class="ci-w-type">Type</th>
            <th class="ci-w-hs">HS Code</th>
            <th class="ci-w-qty">Qty</th>
            <th class="ci-w-unit">Unit</th>
            <th colspan="2">Unit Price</th>
            <th colspan="2">Amount</th>
          </tr>
        </thead>
        <tbody>${isi}${ciplRuangKosongHtml(baris.length, 10)}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="ci-foot-empty"></td>
            <td colspan="2" class="ci-total-k">Total</td>
            <td class="ci-cur">${escapeHtml(mata)}</td>
            <td class="ci-num ci-w-money">${escapeHtml(ciplAngka(total, 2))}</td>
          </tr>
          ${ciplBarisTandaTanganHtml(6, 4)}
        </tfoot>
      </table>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------
   HALAMAN 2 — PACKING LIST
------------------------------------------------------------------ */
function ciplHalamanPacking(row, shipment, baris) {
  const totNw = baris.reduce((s, b) => s + b.netto, 0);
  const totGw = baris.reduce((s, b) => s + b.bruto, 0);
  const totCbm = baris.reduce((s, b) => s + b.cbmRaw, 0);
  const koli = ciplTotalKoli(shipment);

  const isi = baris
    .map(
      (b, i) => `
      <tr>
        <td class="ci-c">${i + 1}</td>
        <td class="ci-c ci-item">${escapeHtml(b.item)}</td>
        <td class="ci-c ci-type">${escapeHtml(b.type)}</td>
        <td class="ci-c">${escapeHtml(b.hs)}</td>
        <td class="ci-c">${escapeHtml(ciplAngka(b.qty))}</td>
        <td class="ci-c">${escapeHtml(b.satuan)}</td>
        <td class="ci-num">${escapeHtml(ciplAngka(b.netto))}</td>
        <td class="ci-num">${escapeHtml(ciplAngka(b.bruto))}</td>
        <td class="ci-c ci-dim">${escapeHtml(b.dimensi)}</td>
        <td class="ci-num ci-cbm">${b.cbm ? escapeHtml(ciplAngka(b.cbm, 3)) + " M<sup>3</sup>" : ""}</td>
      </tr>`,
    )
    .join("");

  return `
  <div class="ci-sheet ci-page2">
    <div class="ci-box">
      ${ciplKopHtml("PACKING LIST")}
      ${ciplPihakHtml(row, shipment)}
      ${ciplAngkutanHtml(row, shipment)}
      <table class="ci-items ci-items--pl">
        ${ciplColgroupHtml(CIPL_COLS_PACKING, { item: 1, penyumbang: 8 })}
        <thead>
          <tr>
            <th class="ci-w-no">No</th>
            <th class="ci-w-item">Item Description</th>
            <th class="ci-w-type">Type</th>
            <th class="ci-w-hs">HS CODE</th>
            <th class="ci-w-qty">Qty</th>
            <th class="ci-w-unit">Unit</th>
            <th class="ci-w-wt">NW</th>
            <th class="ci-w-wt">GW</th>
            <th colspan="2">CBM</th>
          </tr>
        </thead>
        <tbody>${isi}${ciplRuangKosongHtml(baris.length, 10)}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="ci-pkg-total">${koli ? escapeHtml(ciplAngka(koli)) + " Package" : ""}</td>
            <td colspan="2" class="ci-total-k">TOTAL</td>
            <td class="ci-num">${escapeHtml(ciplAngka(totNw))}</td>
            <td class="ci-num">${escapeHtml(ciplAngka(totGw))}</td>
            <td colspan="2" class="ci-num ci-cbm">${totCbm ? escapeHtml(ciplAngka(totCbm, 3)) + " M<sup>3</sup>" : ""}</td>
          </tr>
          ${ciplBarisTandaTanganHtml(4, 6)}
        </tfoot>
      </table>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------
   HALAMAN 3 — SHIPPING INSTRUCTION

   Berbeda bentuk dari dua halaman sebelumnya: bukan tabel barang,
   melainkan daftar instruksi ke forwarder. Karena itu ia tidak
   memakai potongan bersama — kop pun ditulis ulang tanpa bingkai
   kotak, mengikuti berkas contohnya.

   Beberapa baris SENGAJA dibiarkan kosong (PEB Number, Booking
   Number, Vessel, ETD/ETA, Stuffing Date). Itu yang diisi forwarder
   setelah menerima instruksinya — mengisinya dari tebakan kita
   justru menghilangkan gunanya.
------------------------------------------------------------------ */

/* SUSUNAN SHIPPING INSTRUCTION — dipetakan dari berkas aslinya.

   Enam garis pemisah di berkas asli BUKAN border sel, melainkan bentuk
   gambar 0,75pt yang membentang kolom A-H (baris 32, 35, 45, 51, 53,
   57). Di sini digambar sebagai border bawah baris; hasilnya sama dan
   tidak bergantung pada dukungan gambar.

   Penanda di depan tiap label adalah huruf "T" berfont Wingdings pada
   berkas asli; di HTML dipakai lambang setara.

   `kosong: true` menandai baris yang SENGAJA dibiarkan kosong — diisi
   forwarder setelah menerima instruksinya. */
const CIPL_SI_BARIS = [
  { k: "Bill of Lading", f: "blType", bawaan: "Original/Telex" },
  { k: "Shipper", alamat: "shipper" },
  { k: "Consignee", alamat: "consignee" },
  { k: "Notify Party", f: "notifyParty", bawaan: "SAME AS CONSIGNEE" },
  { k: "Place of Receipt", f: "portLoading", dari: "origin" },
  { k: "Port of Discharge", f: "finalDestination", dari: "destination", garis: true },

  { k: "Description of Goods", hitung: "barang", tebal: true },
  { k: "Volume", hitung: "muatan", garis: true },

  { k: "Gross Weight", hitung: "gw", satuan: "KGS" },
  { k: "Net Weight", hitung: "nw", satuan: "KGS" },
  { k: "QTY", hitung: "koli", tebal: true },
  { k: "PEB NUMBER", kosong: true },
  { k: "PEB DATE", kosong: true },
  { k: "CONT + SEAL", kosong: true },
  { k: "HS CODE", hitung: "hs", tebal: true },
  { k: "Ocean Freight", f: "oceanFreight", garis: true },

  { k: "Booking Number", kosong: true },
  { k: "Vessel", kosong: true },
  { k: "ETD", kosong: true },
  { k: "ETA", kosong: true },
  { k: "Stuffing Date", kosong: true, garis: true },

  { k: "L/C Number", kosong: true, garis: true },
  { k: "Special instruction :", tanpaTitikDua: true, garis: true },
];

/* Nomor SI diambil dari ekor nomor invoice: "DDI-CRBM-VIII-042" -> 42.

   Nol di depan dibuang karena penomoran SI ditulis apa adanya di
   berkas aslinya ("NO. 03" untuk urutan ketiga). Kalau kolom No. SI
   diisi manual, isian itu yang menang — nomor turunan hanya bawaan. */
function ciplNoSiDariInvoice(nomor) {
  const m = /(\d+)\s*$/.exec(String(nomor || ""));
  if (!m) return "";
  return String(Number(m[1]));
}

/* Nilai tiap baris dikumpulkan SEKALI di muka, lalu dipakai bersama
   oleh versi cetak dan versi Excel. Menghitungnya dua kali berarti dua
   sumber angka yang akan berbeda pelan-pelan — dan yang satu tercetak,
   yang satu terkirim ke forwarder. */
function ciplSiData(row, shipment, baris) {
  const p = row.payload || {};
  const consignee = [
    p.customer || (shipment && shipment.party) || "",
    ...ciplBarisTeks(p.consigneeAddress),
  ].filter(Boolean);
  const koli = ciplTotalKoli(shipment);

  return {
    tujuan: p.siTo || (shipment && shipment.forwarder) || "",
    no: p.siNo || ciplNoSiDariInvoice(row.doc_number),
    shipper: CIPL_SHIPPER,
    consignee: consignee,
    barang: (baris.find((b) => b.item) || {}).item || "",
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

function ciplSiNilai(def, d) {
  if (def.kosong || def.tanpaTitikDua) return "";
  if (def.hitung) return d[def.hitung] || "";
  if (def.f) {
    const v = d.payload[def.f];
    if (v) return v;
    if (def.bawaan) return def.bawaan;
  }
  if (def.dari && d.shipment) return portCodeLabel(d.shipment[def.dari]);
  return "";
}

function ciplHalamanShippingInstruction(row, shipment, baris) {
  const d = ciplSiData(row, shipment, baris);
  const teksBaris = (arr) => arr.map((x) => `<div>${escapeHtml(x)}</div>`).join("");
  const penanda = '<span class="si-b">&#10059;</span>';

  const isiBaris = CIPL_SI_BARIS.map((def) => {
    /* Kelompok dipisahkan JARAK, bukan garis — mengikuti berkas
       rujukan, yang tidak punya satu garis pun di lembar ini. */
    const kelas = def.garis ? "si-jeda" : "";
    const label = def.tanpaTitikDua
      ? `${penanda}<u>${escapeHtml(def.k)}</u>`
      : `${penanda}${escapeHtml(def.k)}`;

    if (def.alamat) {
      /* "Address" sub-label di baris berikutnya, bukan bagian dari
         nilainya — mengikuti berkas aslinya. */
      const isi = d[def.alamat];
      return `
      <tr>
        <td class="si-k">${label}</td>
        <td class="si-c">:</td>
        <td class="si-v">${escapeHtml(isi[0] || "")}</td>
      </tr>
      <tr class="${kelas}">
        <td class="si-k si-sub">Address</td>
        <td class="si-c"></td>
        <td class="si-v">${teksBaris(isi.slice(1))}</td>
      </tr>`;
    }

    const nilai = ciplSiNilai(def, d);
    return `
      <tr class="${kelas}">
        <td class="si-k">${label}</td>
        <td class="si-c">${def.tanpaTitikDua ? "" : ":"}</td>
        <td class="si-v${def.tebal ? " si-v-bold" : ""}">${escapeHtml(nilai)}${
          def.satuan && nilai ? ` &nbsp; ${def.satuan}` : ""
        }</td>
      </tr>`;
  }).join("");

  return `
  <div class="ci-sheet ci-page2 si-sheet">
    <div class="ci-box si-box">
    <table class="ci-kop">
      <tr>
        <td class="ci-kop-logo"><img src="${SJ_LOGO}" alt="" /></td>
        <td class="ci-kop-teks">
          <div class="ci-company">${escapeHtml(CIPL_PERUSAHAAN.nama)}</div>
          <div class="ci-addr">${escapeHtml(CIPL_PERUSAHAAN.pusat)}</div>
          <div class="ci-addr">${escapeHtml(CIPL_PERUSAHAAN.cabang)}</div>
        </td>
      </tr>
    </table>

    <div class="si-to">TO : ${escapeHtml(d.tujuan)}</div>
    <div class="si-title">SHIPPING INSTRUCTION</div>
    <div class="si-no">NO. ${escapeHtml(d.no)}</div>
    <div class="si-lead">Please arrange our shipment per description below :</div>

    <table class="si-list">${isiBaris}</table>

    <div class="si-tutup">
      <div>Thank you for your good cooperation.</div>
      <div class="si-kota">Cirebon, ${escapeHtml(d.tanggal)}</div>
      <div>Regards,</div>
      <div class="si-ttd">SIGN &amp; STAMP</div>
    </div>
    </div>
  </div>`;
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
  if (!row) showToast("Data invoice tidak ditemukan.", "danger");
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
    showToast(
      "Jadwal yang ditautkan tidak ditemukan — daftar barang dikosongkan.",
      "warning",
    );
  } else if (!tautId) {
    showToast(
      "Invoice ini belum ditautkan ke jadwal Export — daftar barang tercetak kosong.",
      "warning",
    );
  }

  const baris = ciplBarisBarang(shipment);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast("Jendela cetak diblokir peramban. Izinkan pop-up dulu.", "danger");
    return;
  }
  w.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(ciplJudulInvoice(row))} ${escapeHtml(row.doc_number || "")}</title>
<style>${ciplCss()}</style></head>
<body>${ciplHalamanInvoice(row, shipment, baris)}${ciplHalamanPacking(row, shipment, baris)}${ciplHalamanShippingInstruction(row, shipment, baris)}${ciplSkripPasKolom()}</body></html>`);
  w.document.close();
  w.onload = () => {
    /* Penyesuaian huruf dijalankan LEBIH DULU, baru dicetak. Kalau
       urutannya terbalik, yang tercetak masih ukuran semula — dan di
       layar hasilnya terlihat benar, jadi kesalahannya cuma muncul di
       kertas. */
    if (typeof w.ciplPasKolom === "function") w.ciplPasKolom();
    w.focus();
    w.print();
  };
}

/* PENGEPAS KOLOM — melebarkan kolom nama barang, DALAM BATAS.

   Aturannya:
     - kalau nama terpanjang muat pada lebar sekarang, tidak ada yang
       diubah;
     - kalau tidak muat, kolomnya dilebarkan secukupnya — sebanyak yang
       bisa disumbangkan kolom Dimensi tanpa turun di bawah lantainya;
     - kalau pada lebar maksimum pun masih tidak muat, namanya
       MEMBUNGKUS. CSS sudah melakukannya sendiri; tidak ada yang perlu
       dikerjakan di sini.

   SATU BATAS, BUKAN DUA. Semula ada juga ambang persen tersendiri
   untuk kolom nama. Ternyata ia TIDAK PERNAH TERCAPAI: pertumbuhannya
   sudah lebih dulu dihentikan lantai kolom penyumbang, jadi angka itu
   hanya terlihat seperti pengaman padahal tidak menjaga apa pun.
   Menaikkannya sampai 100 pun tidak mengubah hasil — dan uji yang
   memeriksanya ikut lulus tanpa arti. Sekarang lantai penyumbang yang
   menjadi satu-satunya batas, dan batas itu nyata.

   KENAPA DIBATASI, tidak dibiarkan melebar bebas. Kolom yang mengikuti
   isinya sepenuhnya membuat dua Packing List dari pengiriman berbeda
   tercetak dengan tabel yang berbeda bentuk. Untuk dokumen yang
   dikirim ke pembeli, tabel yang selalu sama bentuknya lebih penting
   daripada memaksakan setiap nama muat dalam satu baris.

   Dengan Dimensi 16% dan lantai 10%, kolom nama tumbuh paling jauh
   dari 20% ke 26%.

   Dijalankan DI DALAM jendela cetak: lebar sebenarnya baru bisa
   diukur setelah gaya di sana selesai diterapkan.

   Diukur dengan canvas, bukan scrollWidth. Untuk sel tabel dengan
   table-layout: fixed, scrollWidth tidak dapat diandalkan — teksnya
   terpotong tapi selisihnya tidak pernah terbaca, jadi pengepasnya
   diam saja. Itu yang membuat versi sebelumnya tidak pernah bekerja. */
function ciplSkripPasKolom() {
  return `<script>
  function ciplPasKolom() {
    var LANTAI_SUMBANG = 10;   // satu-satunya batas: kolom penyumbang
    var AMAN = 1.02;           // sedikit kelebihan supaya huruf terakhir tidak mepet

    var kanvas = document.createElement("canvas");
    var alat = kanvas.getContext("2d");
    var tabel = document.querySelectorAll("table.ci-items");

    for (var t = 0; t < tabel.length; t++) {
      var tb = tabel[t];
      var kolItem = tb.querySelector('col[data-pas="item"]');
      var kolSumbang = tb.querySelector('col[data-pas="sumbang"]');
      if (!kolItem) continue;

      var sel = tb.querySelectorAll("td.ci-item");
      var lebarTabel = tb.clientWidth;
      if (!(lebarTabel > 0)) continue;

      /* SEMUA DIUKUR DULU, baru ditulis. Menyelang-nyeling baca dan
         tulis memaksa peramban menghitung tata letak tiap putaran. */
      var butuhPx = 0;
      var selipan = 0;
      for (var i = 0; i < sel.length; i++) {
        var el = sel[i];
        var teks = el.textContent.trim();
        if (!teks) continue;
        var cs = getComputedStyle(el);
        if (!selipan) {
          selipan = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
        }
        alat.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
        var w = alat.measureText(teks).width;
        if (w > butuhPx) butuhPx = w;
      }
      if (!butuhPx) continue;

      var persenKini = parseFloat(kolItem.style.width) || 0;
      var persenButuh = ((butuhPx * AMAN + selipan) / lebarTabel) * 100;
      if (persenButuh <= persenKini) continue;      // sudah muat

      if (!kolSumbang) continue;      // tanpa penyumbang, jumlahnya tidak lagi 100%
      var sumbangKini = parseFloat(kolSumbang.style.width) || 0;
      /* Yang bisa disumbangkan mungkin lebih sedikit daripada yang
         diminta. Ambil sebanyak yang ada; jangan sampai kolom
         penyumbang menyusut melewati lantainya — di situ isinya
         sendiri yang mulai terpotong. Kalau masih kurang juga, nama
         barangnya membungkus, dan itu memang jalan keluarnya. */
      var tambah = Math.min(
        persenButuh - persenKini,
        Math.max(0, sumbangKini - LANTAI_SUMBANG),
      );
      if (tambah <= 0) continue;
      kolSumbang.style.width = (sumbangKini - tambah).toFixed(2) + "%";
      kolItem.style.width = (persenKini + tambah).toFixed(2) + "%";
    }
  }
  <\/script>`;
}

function ciplCss() {
  return `
  /* MARGIN @page NOL — DISENGAJA, dan bukan berarti tanpa margin.

     Peramban menggambar kop & kaki cetakannya sendiri (tanggal, judul
     tab, "about:blank", nomor halaman) DI DALAM area margin @page.
     Tidak ada CSS yang bisa mematikannya. Satu-satunya cara: tidak
     menyisakan ruang untuk digambari — yaitu margin nol.

     Jarak ke tepi kertas tetap ada, hanya dipindah ke padding
     .ci-sheet di bawah. Hasil cetaknya sama, tanpa tulisan peramban.

     PERNAH DICOBA SEBALIKNYA dan gagal: memindahkan margin narrow ke
     @page memang membuat pratinjau menampilkan angka yang benar, tapi
     kop & kaki peramban langsung muncul di keempat sisinya. */
  @page { size: A4; margin: 0; }

  /* SATU ANGKA UNTUK SELURUH GARIS.

     Ketebalan yang ditulis terpisah di sepuluh tempat akan berbeda
     cepat atau lambat — satu diubah, sembilan tertinggal, dan
     hasilnya garis yang compang-camping.

     1px dipilih, bukan pecahan poin: pecahan harus dibulatkan ke
     piksel perangkat, dan pembulatan itu jatuh berbeda-beda menurut
     posisi tiap garis di halaman. Satu garis jadi 1px, tetangganya
     2px, tanpa ada yang salah di CSS-nya. */
  :root { --ci-line: 1px solid #000; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* JARAK KE TEPI KERTAS — preset "Narrow" Excel, dalam milimeter.

     Excel menyimpannya dalam inci: kiri & kanan 0,25" = 6,35 mm; atas
     & bawah 0,75" = 19,05 mm. Kalau salah satu diubah, ubah
     pasangannya di cipl-excel.js (XLS_MARGIN_NARROW) — ada uji yang
     memastikan keduanya tetap sepasang. */
  .ci-sheet { padding: 19.05mm 6.35mm; }
  /* Halaman kedua dipaksa mulai di lembar baru. Tanpa ini, Packing
     List menyambung di bawah invoice dan keduanya terpotong. */
  .ci-page2 { page-break-before: always; break-before: page; }
  /* Bingkai luar setebal garis dalam. Bingkai yang lebih tebal hanya
     masuk akal kalau ia berdiri sendiri — begitu sel menempel padanya,
     bedanya terbaca sebagai cacat. */
  .ci-box { border: var(--ci-line); }

  /* SATU CARA MENGGAMBAR GARIS UNTUK SELURUH HALAMAN.

     Sebelumnya dua cara bercampur: bingkai kotak, garis judul, dan
     pembatas blok digambar sebagai border ELEMEN — tergambar penuh di
     dalam elemennya, jatuh rapi di batas piksel. Sementara garis tabel
     digambar dengan border-collapse, yang menaruh garis TEPAT DI ATAS
     batas antar sel: separuh di kiri, separuh di kanan.

     Keduanya sama-sama 1px di CSS, tapi yang kedua mendarat di tengah
     piksel dan dihaluskan jadi dua piksel setengah-terang. Mata
     membacanya sebagai garis yang berbeda ketebalan — persis yang
     terlihat: garis struktur tegas, garis tabel samar.

     Dengan separate, garis tabel ikut tergambar penuh di dalam
     selnya. Konsekuensinya: tiap batas antar sel harus dimiliki SATU
     sisi saja, kalau tidak dua border bersebelahan jadi garis ganda.
     Aturannya di bawah — setiap sel hanya menggambar ATAS dan KIRI. */
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  td, th { vertical-align: top; }

  .ci-kop td { border: 0; padding: 4px 6px; }
  .ci-kop-logo { width: 70px; text-align: center; }
  .ci-kop-logo img { width: 52px; }
  .ci-kop-teks { text-align: center; padding-right: 70px; }
  .ci-company { font-size: 16pt; font-weight: 700; letter-spacing: .5px; }
  .ci-addr { font-size: 7pt; }

  .ci-title {
    border-top: var(--ci-line); border-bottom: var(--ci-line);
    text-align: center; font-size: 19pt; font-weight: 700;
    padding: 2px 0; letter-spacing: .5px;
  }

  .ci-parties { border-bottom: var(--ci-line); }
  .ci-parties > tbody > tr > td { padding: 0; }
  .ci-left { width: 52%; border-right: var(--ci-line); }
  .ci-cell { border-bottom: var(--ci-line); padding: 2px 5px; min-height: 15px; }
  .ci-left .ci-cell:last-child,
  .ci-right-col .ci-cell:last-child { border-bottom: 0; }
  .ci-k { font-size: 7.5pt; font-weight: 700; }
  .ci-v { font-size: 8.5pt; line-height: 1.25; }
  .ci-v-bold { font-weight: 700; }
  .ci-indent { padding-left: 10px; }
  .ci-row-split { display: flex; justify-content: space-between; gap: 8px; }
  .ci-right { text-align: right; }

  .ci-ship { border-bottom: var(--ci-line); }
  .ci-ship td { border-right: var(--ci-line); padding: 2px 5px; font-size: 8.5pt; }
  .ci-ship td:last-child { border-right: 0; }
  .ci-ship-val td { height: 26px; vertical-align: middle; }
  .ci-center { text-align: center; }
  .ci-sail { width: 74px; font-size: 7pt; }

  /* Lebar kolom dihormati apa adanya. Tanpa ini, lebar dihitung dari
     isinya dan berakhir di pecahan piksel — garis tegaknya lalu jatuh
     di posisi yang tidak bulat, dan tiap kolom membulatkannya sendiri. */
  .ci-items { table-layout: fixed; }

  /* ATAS & KIRI SAJA — satu batas, satu pemilik.

     Garis mendatar antar baris digambar baris DI BAWAHNYA; garis tegak
     antar kolom digambar kolom DI KANANNYA. Yang tidak digambar siapa
     pun diambil alih bingkai kotak. */
  .ci-items th, .ci-items td {
    border-top: var(--ci-line);
    border-left: var(--ci-line);
    padding: 1px 4px;
    font-size: 8pt;
    /* SATU BARIS untuk semua kolom. Kolom pendek yang membungkus
       membuat tinggi baris tidak seragam dan tabel terlihat berantakan.

       overflow: hidden adalah jaring pengaman, bukan solusi: dengan
       table-layout tetap, teks yang lebih lebar daripada kolomnya akan
       MENEMBUS garis dan menabrak sel sebelahnya. Lebar kolom di bawah
       sudah disetel agar isinya muat — ini untuk memastikan kalau suatu
       saat meleset, yang terjadi terpotong rapi, bukan tabrakan. */
    white-space: nowrap;
    overflow: hidden;
  }
  /* DUA kolom yang boleh turun ke baris berikutnya: Item dan Type.

     Keduanya berisi teks bebas yang panjangnya tidak bisa ditebak —
     "NOKIAN ENTRUST 235/45R19 SAVER" lebih panjang daripada kolomnya,
     dan memotongnya menghilangkan keterangan barang yang justru
     paling penting di dokumen ekspor.

     Kolom lain tetap satu baris: isinya pendek dan tetap (kode, angka,
     satuan), dan membiarkannya membungkus hanya membuat tinggi baris
     tidak seragam tanpa alasan. */
  /* SATU BARIS KALAU MUAT, MEMBUNGKUS KALAU TIDAK.

     Ini perilaku bawaan CSS, dan memang itu yang diinginkan. Yang
     ditambahkan aplikasi cuma satu: LEBAR KOLOMNYA ikut menyesuaikan
     nama barang, sampai batas tertentu (lihat ciplSkripPasKolom).

     Sempat dicoba nowrap + mengecilkan huruf otomatis. Hasilnya
     terlihat cacat: satu baris 6pt, baris di bawahnya 7,5pt, dalam
     tabel yang sama. Ukuran huruf yang berbeda-beda antar baris lebih
     mengganggu daripada satu nama yang turun ke baris kedua.

     word-break dipertahankan untuk nama tanpa spasi sama sekali —
     kode barang panjang tidak punya tempat untuk dipatahkan, dan tanpa
     ini ia menembus garis kolom. */
  .ci-items td.ci-item,
  .ci-items td.ci-type {
    white-space: normal;
    word-break: break-word;
    overflow: visible;
  }
  .ci-items th { text-align: center; font-weight: 700; font-size: 7.5pt; }

  /* ---- GARIS GANDA: dua sumber, dua perbaikan ----

     Garis yang terlihat tebal di sini BUKAN karena ketebalannya —
     melainkan karena tergambar dua kali, berdempetan, tanpa celah.
     Menipiskannya tidak menolong: dua garis tipis berdempetan tetap
     terbaca sebagai satu garis tebal, dan pada beberapa perbesaran
     malah tampak meleber (bleeding).

     1. TEPI KIRI & KANAN. Kotak luar sudah menggambar bingkainya;
        sel paling pinggir menggambar garisnya sendiri tepat di
        sebelahnya. border-collapse tidak menolong — keduanya milik
        elemen yang berbeda, jadi tidak pernah menyatu. */
  /* Tepi kiri tabel diambil alih bingkai kotak. */
  .ci-items tr > th:first-child,
  .ci-items tr > td:first-child { border-left: 0; }

  /* Tepi atas tabel: blok Port of Loading sudah menutup dirinya dengan
     border-bottom. */
  .ci-items thead th { border-top: 0; }

  /* SELURUH sel barang rata tengah, mendatar maupun tegak. Kolom angka
     tetap rata kanan (lihat .ci-num) — deretan angka yang rata tengah
     tidak bisa dibandingkan sekilas karena satuannya tidak sejajar. */
  .ci-items tbody td {
    height: 15px; text-align: center; vertical-align: middle;
  }

  /* Ruang kosong: TIDAK ada garis sama sekali — tidak mendatar, tidak
     tegak. Kolom yang tidak berisi barang tidak digariskan; yang
     membatasinya cuma kotak luar. */
  /* Ruang kosong tetap menggambar garis ATAS — itulah penutup baris
     barang terakhir. Garis tegaknya yang tidak digambar, sehingga area
     tanpa barang tidak berkolom. */
  .ci-fill td { border-left: 0; }
  .ci-c { text-align: center; }
  .ci-num { text-align: right; }
  .ci-cur { text-align: left; }
  /* Kolom angka uang dipatok lebarnya. Tanpa patokan, sisa lebar tabel
     jatuh ke sana dan justru Item & Type yang terjepit — nama barang
     terpaksa membungkus dua baris sementara kolom angka menyisakan
     ruang kosong yang tidak dipakai apa pun. */

  /* Ditulis td.ci-dim, BUKAN .ci-dim saja.

     Aturan ".ci-items th, .ci-items td" di atas berkekhususan (0,2,2)
     dan mengalahkan kelas tunggal (0,1,0) — font-size 6,5pt di sini
     tidak akan pernah berlaku, teksnya tetap 8pt.

     Akibatnya bukan sekadar huruf kebesaran: dengan table-layout
     tetap, teks yang lebih lebar daripada kolomnya TIDAK memaksa
     kolom melebar. Digabung nowrap, ia meluber melewati garis dan
     menabrak angka CBM di sebelahnya.

     Jebakan yang sama pernah dicatat untuk td.sj-ket di surat jalan. */
  .ci-items td.ci-dim {
    font-size: 6.5pt;
    letter-spacing: -0.3px;
  }
  /* Angka CBM tidak boleh terpisah dari satuannya. Tanpa nowrap,
     "0.531 M3" pecah jadi dua baris dan seluruh barisnya ikut melar. */
  /* nilai CBM: lebar dari colgroup */
  /* Pangkat 3 pada M3 tanpa menambah tinggi baris. Perilaku bawaan
     elemen sup menggeser garis dasar dan membuat barisnya melar. */
  .ci-items sup { font-size: 6pt; vertical-align: super; line-height: 0; }
  /* Kelas .ci-w-* hanya penanda kolom untuk keterbacaan markup —
     lebarnya ditentukan <colgroup>, lihat CIPL_COLS_*. */
  /* Sisi kiri baris Total dibiarkan tanpa garis, seperti berkas
     aslinya — kotaknya menyatu dengan area tanda tangan di bawahnya. */
  .ci-foot-empty, .ci-pkg-total { border-left: 0 !important; border-bottom: 0 !important; }
  .ci-pkg-total { text-align: left; font-weight: 700; font-size: 8.5pt; }
  .ci-total-k { text-align: center; font-weight: 700; }
  .ci-items tfoot td { height: 20px; vertical-align: middle; }

  /* ---- KOTAK TANDA TANGAN: SATU GARIS, SATU PEMILIK ----

     Sel di sini mewarisi border penuh dari .ci-items td, sehingga tiap
     garisnya punya DUA pemilik: sisi bawah baris Total dan sisi atas
     baris tanda tangan menggambar garis yang sama.

     border-collapse memang menyatukan keduanya jadi satu garis — tapi
     lebar 0,5pt tidak jatuh persis di batas piksel, dan dua deklarasi
     yang harus dibulatkan bersamaan kerap mendarat di piksel yang
     berbeda. Hasilnya satu garis tampak 2px sementara sisanya 1px.

     Perbaikannya bukan menipiskan, melainkan MENGHAPUS pemilik kedua:
     seluruh sel baris ini dikosongkan, lalu hanya garis yang benar-
     benar belum ada yang digambar.

       atas  <- sudah digambar sisi bawah baris Total
       kanan <- sudah digambar bingkai .ci-box
       kiri & bawah <- digambar di sini
  */
  .ci-sign-row td { border: 0; }
  /* TANPA border-bottom. Baris ini yang paling bawah di dalam kotak,
     jadi sisi bawahnya berimpit dengan bingkai .ci-box — dua garis
     berdempetan, dan di bagian itu saja garisnya jadi dua kali lebih
     tebal daripada sisanya. */
  .ci-sign-row .ci-sign-cell {
    border-top: var(--ci-line);
    border-left: var(--ci-line);
    padding: 2px 5px;
    vertical-align: top;
  }
  .ci-sign-space { height: 76px; }

  /* ---- SHIPPING INSTRUCTION ----
     Berbingkai luar seperti Invoice & Packing List, tapi tanpa sekat
     apa pun di dalamnya: lembar ini surat, bukan formulir berkolom. */
  .si-sheet { font-size: 8.5pt; }
  /* Bingkainya setinggi halaman, bukan setinggi isinya.

     Halaman A4 dikurangi padding .ci-sheet 19,05mm atas & bawah. Angka
     ini HARUS ikut kalau paddingnya diubah — kalau tidak, kotaknya lebih
     tinggi daripada ruang yang tersisa dan mendorong satu halaman
     kosong di belakangnya.

     Tanpa min-height, kotaknya berhenti di baris terakhir yang terisi,
     jadi tingginya berubah-ubah mengikuti panjang alamat consignee —
     dua SI dari pengiriman berbeda tercetak dengan kotak berbeda. */
  .si-box {
    padding: 26px 30px 34px;
    min-height: calc(297mm - 38.1mm - 2px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  /* Blok penutup didorong ke bawah kotak. */
  .si-tutup { margin-top: auto; }
  .si-to { font-weight: 700; font-size: 7.5pt; margin: 10px 0 18px; }
  .si-title {
    text-align: center; font-weight: 700; font-size: 12pt;
    text-decoration: underline;
  }
  .si-no { text-align: center; font-weight: 700; font-size: 9pt; margin-bottom: 14px; }
  .si-lead { font-size: 7.5pt; margin-bottom: 10px; }

  .si-list { width: 100%; }
  .si-list td { vertical-align: top; padding: 1px 0; font-size: 8pt; }
  .si-k { width: 190px; padding-left: 26px !important; }
  /* Titik dua sejajar di satu kolom sendiri — kalau ditempel ke label,
     posisinya ikut panjang labelnya dan barisnya terlihat goyah. */
  .si-c { width: 14px; }
  .si-v-bold { font-weight: 700; }
  /* Penanda di depan label — huruf Wingdings "T" pada berkas asli. */
  .si-b { display: inline-block; width: 14px; font-size: 6.5pt; }
  /* "Address" sub-label. Disejajarkan dengan LABEL di atasnya —
     penandanya selebar 14px, jadi teksnya digeser sejauh itu supaya
     huruf pertamanya lurus dengan "Shipper" dan "Consignee". */
  .si-sub {
    padding-left: 40px !important;
    font-size: 7.5pt;
  }
  /* Jeda antar kelompok keterangan — TANPA GARIS.

     Versi sebelumnya menggambar border bawah di sini. Berkas rujukan
     tidak punya satu garis pun di lembar ini; jaraknya yang memisahkan
     kelompok, dan garis tambahan membuat surat ini terbaca sebagai
     formulir. */
  .si-jeda td { padding-bottom: 6px; }
  .si-jeda + tr td { padding-top: 10px; }

  .si-tutup { margin-top: 26px; font-size: 8pt; }
  .si-kota { margin-top: 12px; }
  /* Ruang untuk materai, tanda tangan basah, dan cap perusahaan.
     40px hanya cukup untuk tanda tangan; materai 10.000 saja sudah
     sekitar 2 cm dan capnya lebih besar lagi. */
  .si-ttd {
    margin-top: 118px;
    text-decoration: underline;
    font-weight: 600;
  }
  `;
}
