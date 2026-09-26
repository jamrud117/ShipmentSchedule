"use strict";

/* ------------------------------------------------------------------
   CIPL BENTUK VIETNAM

   Lembar tersendiri, bukan percabangan di dalam templat Korea.
   Susunannya berbeda menyeluruh: kotak Seller/Shipper/Consignee
   bertumpuk di kiri dengan blok keterangan di kanan, kolom tabel
   berbeda (Marks & No. PKGS / Goods Description / Quantity / Unit
   Price / Amount), dan ada blok penutup berisi nomor booking.

   Dipilih lewat profil pelanggan (`layout: "vn"` di cipl-print.js),
   jadi menambah pembeli yang memakai bentuk ini cukup satu entri di
   tabel profil -- tidak ada kode cetak yang perlu disentuh.
------------------------------------------------------------------ */

/* Baris penambal supaya blok TOTAL & tanda tangan selalu jatuh di
   tempat yang sama, berapa pun jumlah barangnya. */

/* TANGGAL BENTUK VIETNAM: "24/09/2026".

   Punya sendiri, BUKAN ciplTanggal() yang dipakai lembar Korea
   ("24 Sep 2026"). Keduanya mengikuti berkas rujukannya masing-masing,
   dan lembar Korea tidak boleh ikut berubah karena lembar ini
   dirapikan. */
function ciplVnTanggal(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/* MARKS: "C# : 8-1" .. "C# : 8-8".

   Angka pertama = jumlah koli seluruh pengapalan, angka kedua = urutan
   koli itu. Dibangkitkan dari jumlah barang, TAPI kolom Marks pada
   barang menang kalau diisi -- penandaan di lapangan tidak selalu
   mengikuti urutan, dan yang tertulis di peti itulah yang harus
   tercetak. */
function ciplVnMarks(it, idx, total) {
  const manual = String((it && it.marks) || "").trim();
  if (manual) return manual;
  return `C# : ${total}-${idx + 1}`;
}

/* Uraian barang pada lembar ini: SIZE, PATTERN, MOLD NO -- tanpa jenis
   barangnya, karena jenisnya sudah disebut sekali di baris
   "#Description Info" di atas tabel. */
function ciplVnUraian(it) {
  return [it.size, it.pattern, it.moldNo]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join("  ");
}

function ciplVnBaris(shipment) {
  const items = ((shipment && shipment.items) || []).filter((it) =>
    String(it.namaBarang || "").trim(),
  );
  const total = items.length;
  return items.map((it, i) => ({
    marks: ciplVnMarks(it, i, total),
    uraian: ciplVnUraian(it),
    /* Dipisah JUGA per bagian: lembar Excel menaruh SIZE+PATTERN dan
       MOLD NO di dua kolom berbeda, karena pembeli menyaring kolom
       mold-nya untuk mencocokkan cetakan. */
    size: String(it.size || "").trim(),
    pattern: String(it.pattern || "").trim(),
    moldNo: String(it.moldNo || "").trim(),
    qty: parseLooseNumber(it.qty),
    satuan: String(it.satuan || "").trim(),
    harga: parseLooseNumber(it.harga),
    netto: parseLooseNumber(it.netto),
    bruto: parseLooseNumber(it.bruto),
    package: String(it.package || "").trim(),
  }));
}

function ciplVnTotal(baris) {
  return baris.reduce(
    (a, b) => ({
      qty: a.qty + b.qty,
      nilai: a.nilai + b.qty * b.harga,
      netto: a.netto + b.netto,
      bruto: a.bruto + b.bruto,
    }),
    { qty: 0, nilai: 0, netto: 0, bruto: 0 },
  );
}

/* Baris DIMENSION pada Packing List: ukuran yang sama digabung dan
   dihitung, mengikuti tulisan di berkas aslinya
   ("120 * 122 * 71 (cm) * 4 BX"). */
function ciplVnDimensi(baris) {
  const hitung = new Map();
  baris.forEach((b) => {
    const d = parsePackageDims(b.package);
    if (!d) return;
    const k = `${d.p} * ${d.l} * ${d.t}`;
    hitung.set(k, (hitung.get(k) || 0) + 1);
  });
  return [...hitung.entries()].map(
    ([ukuran, n]) => `DIMENSION : ${ukuran} (cm) * ${n} BX`,
  );
}

/* ------------------------------------------------------------------
   BAGIAN-BAGIAN LEMBAR
------------------------------------------------------------------ */

function ciplVnBlokKiri(row, shipment, isPacking) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const consigneeNama = p.customer || (shipment && shipment.party) || "";
  const consigneeAlamat = p.consigneeAddress
    ? ciplBarisTeks(p.consigneeAddress)
    : prof.lines || [];

  /* Judul kotak tebal, ISINYA tidak -- termasuk nama consignee.
     Berkas rujukan menulis seluruh isi kotak dengan huruf biasa. */
  const kotak = (judul, baris) => `
    <div class="vn-box">
      <div class="vn-box-k">${escapeHtml(judul)}</div>
      ${baris
        .filter((x) => String(x || "").trim())
        .map((x) => `<div class="vn-box-v">${escapeHtml(x)}</div>`)
        .join("")}
    </div>`;

  /* LEMBAR PACKING LIST MENULIS SELLER TANPA BARIS E-MAIL.

     Begitu adanya di berkas rujukan -- kotak Seller pada PL enam
     baris, pada CI tujuh. Bedanya bukan salah ketik yang perlu
     dirapikan: seluruh garis di bawahnya pada PL memang jatuh 15 px
     lebih tinggi daripada CI, dan menyeragamkannya membuat lembar PL
     tidak lagi sama dengan aslinya. Ekspor Excel-nya pun sudah
     mengikuti aturan yang sama. */
  return (
    kotak("Seller", isPacking ? CIPL_VN_SELLER.slice(0, 5) : CIPL_VN_SELLER) +
    kotak("Shipper", CIPL_VN_SHIPPER) +
    kotak("Consignee", [consigneeNama, ...consigneeAlamat])
  );
}

/* Seller & Shipper tetap, diambil dari data perusahaan yang sama
   dengan lembar Korea supaya alamat kantor tidak pernah berbeda antar
   dokumen. */
const CIPL_VN_SELLER = [
  "Dynamic Design CO., LTD.",
  "12, CHEOMDANYEONSIN-RO 29BEON-GIL,",
  "BUK-GU 61089, GWANGJU, KOREA",
  "ATTN : Jae Jun, Kim",
  "TEL :+82-62-720-7845",
  "E-MAIL : info@dynamicdesign.co.kr",
];

const CIPL_VN_SHIPPER = [
  "PT Dynamic Design Indonesia",
  "Jalan Mayjend Sutoyo No. 1 Desa/Kelurahan Pabedilan Kulon,",
  "Kec. Pabedilan Kab. Cirebon, Provinsi Jawa Barat, 45193",
  "ATTN : MR. JEON JEONGHO",
  "E-mail : jjh2296@dynamicdesign.co.kr",
  "Tel : +622318886161     TAX ID : 0656 3197 7906 1000",
];

function ciplVnBlokKanan(row, shipment) {
  const p = row.payload || {};

  /* Keterangan lain: baris bertanda bintang, mengikuti berkas aslinya.
     Yang kosong DILEWATI -- baris "*PRICE TERM :" tanpa isi terbaca
     seperti isian yang lupa diisi.

     BARIS *P/O NO. DAN * HS-CODE SENGAJA TIDAK ADA di lembar Kumho.
     Isiannya di form tetap dipakai -- nomor PO & HS Code masih
     tersimpan dan ikut ke dokumen lain -- tapi lembar CIPL untuk
     Kumho tidak mencantumkannya. */
  const lain = [
    ["*SHIPPER", "PT Dynamic Design Indonesia"],
    ["*COUNTRY OF ORIGIN", "INDONESIA"],
    ["*PACKING", p.packing || "WOODEN PACKING"],
    ["*PRICE TERM", p.termsDelivery || ""],
    ["*BANKER", "Citibank Korea Inc"],
    ["", "Jungang Citi Service Center (27)"],
    ["", "(SWIFT : CITIKRSX)"],
    ["*ACCOUNT NO.", "1-089331-143-01"],
    ["", "DYNAMIC DESIGN CO.,LTD"],
  ].filter(([k, v]) => String(v || "").trim() || !k);

  /* KOTAK TERMS JATUH DI KAKI KOLOM (margin-top:auto di CSS), sejajar
     dengan baris Vessel/Flight di kolom kiri -- susunan yang sama
     dengan berkas rujukan. Kalau ditaruh menempel di bawah daftar
     keterangan, ia menggantung di tengah dan kolom kanannya
     menyisakan ruang kosong di bawah. */
  return `
    <div class="vn-box vn-box-split">
      <div class="vn-box-k">Invoice No. and Date</div>
      <div class="vn-split">
        <span>${escapeHtml(row.doc_number || "")}</span>
        <span>${escapeHtml(ciplVnTanggal(row.doc_date))}</span>
      </div>
    </div>
    <div class="vn-box"><div class="vn-box-k">L/C No. and Date</div><div class="vn-box-v">&nbsp;</div></div>
    <div class="vn-box vn-box-ref">
      <div class="vn-box-k">Notify(if other than consignee)</div>
      <div class="vn-box-v">${escapeHtml(p.notifyParty || "SAME AS CONSIGNEE")}</div>
      <div class="vn-box-k">Other references</div>
      ${lain
        .map(
          ([k, v]) =>
            /* Tanpa label = baris LANJUTAN dari keterangan di atasnya
               (alamat bank, nama pemilik rekening). Dijorokkan supaya
               terbaca menyambung, bukan sebagai keterangan baru yang
               labelnya lupa ditulis. */
            k
              ? `<div class="vn-ref">${escapeHtml(k)} : ${escapeHtml(v)}</div>`
              : `<div class="vn-ref vn-ref-lanjut">${escapeHtml(v)}</div>`,
        )
        .join("")}
    </div>
    <div class="vn-box vn-box-terms">
      <div class="vn-box-k">Terms of delivery and payment</div>
      <div class="vn-box-v">${escapeHtml(p.termPayment || "T/T 60 days after B/L date")}</div>
    </div>`;
}

/* Blok pengangkutan: DUA kolom, dan ia tinggal DI DALAM kolom kiri.

   Berkas rujukan menaruh Departure date, Port of Loading/Discharge, dan
   Vessel/Final Destination di bawah kotak Consignee -- selebar kolom
   kiri saja, bukan selebar kertas. Yang di sebelah kanannya adalah
   lanjutan kotak keterangan, lalu Terms of delivery and payment.

   Label dan nilainya di BARIS TERPISAH (label rata kiri, nilai rata
   tengah), sama seperti aslinya. */
function ciplVnAngkutan(row, shipment) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const pol =
    p.portLoading || prof.portLoading || (shipment ? portCodeLabel(shipment.origin) : "");
  const pod = p.portDischarge || prof.portDischarge || "";
  const dest =
    p.finalDestination ||
    prof.finalDestination ||
    (shipment ? portCodeLabel(shipment.destination) : "");
  const kapal = p.carrier || (shipment && carrierNameFromShipment(shipment)) || "";
  const berangkat = p.sailingDate || (shipment ? shipment.etd : "") || "";

  /* Label dan nilainya SATU SEL, bertumpuk -- bukan dua baris tabel.

     Di berkas rujukan tidak ada garis di antara "Port of Loading" dan
     "JAKARTA": keduanya isi sel yang sama. Memecahnya jadi dua baris
     menambah garis yang tidak ada di sana, dan blok angkutannya jadi
     lima baris bergaris padahal aslinya tiga. */
  /* Nilai RATA KIRI, sejajar dengan labelnya -- bukan rata tengah.
     "JAKARTA, INDONESIA" yang melayang di tengah sel sementara "Port
     of Loading" menempel di tepi kiri terbaca seperti dua isian yang
     tidak berhubungan. */
  const sel = (label, nilai) =>
    `<td><div class="vn-k">${escapeHtml(label)}</div>
         <div class="vn-nilai">${escapeHtml(nilai)}</div></td>`;

  return `
  <table class="vn-ship">
    <tr>
      <td class="vn-k">Departure date</td>
      <td class="vn-c">${escapeHtml(ciplVnTanggal(berangkat))}</td>
    </tr>
    <tr>
      ${sel("Port of Loading", pol)}
      ${sel("Port of Discharge", pod)}
    </tr>
    <tr class="vn-ship-akhir">
      ${sel("Vessel/Flight", kapal)}
      ${sel("Final Destination", dest)}
    </tr>
  </table>`;
}

/* Blok penutup: penanda pengapalan di kiri, kotak tanda tangan di
   kanan.

   Sekat tegak di antara keduanya JATUH DI TEMPAT YANG SAMA dengan
   sekat kolom kepala (47%) -- di berkas rujukan garis itu satu garis
   lurus dari atas sampai bawah lembar, bukan dua garis yang
   kebetulan berdekatan.

   Nomor booking (BK NO.) tidak lagi dicetak maupun disimpan. */
function ciplVnPenutup(row, shipment) {
  const p = row.payload || {};
  const consignee = p.customer || (shipment && shipment.party) || "";

  return `
  <div class="vn-akhir">
    <div class="vn-akhir-kiri">
      <div class="vn-akhir-marks">
        <div>Dynamic Design</div>
        <div>${escapeHtml(consignee)}</div>
        <div>${escapeHtml(row.doc_number || "")}</div>
      </div>
    </div>
    <div class="vn-akhir-kanan">
      <div class="vn-akhir-ttd">signed by</div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------
   HALAMAN
------------------------------------------------------------------ */

function ciplVnHalaman(row, shipment, isPacking) {
  const baris = ciplVnBaris(shipment);
  const total = ciplVnTotal(baris);
  const p = row.payload || {};
  const judul = isPacking ? "PACKING LIST" : "COMMERCIAL INVOICE";

  /* Kolom berbeda antar lembar: Invoice memakai harga & jumlah uang,
     Packing List memakai berat bersih & berat kotor. Kepala dan
     barisnya dirakit dari satu tempat supaya jumlah kolomnya tidak
     mungkin berbeda dengan kepalanya. */
  const kepalaNilai = isPacking
    ? `<th class="vn-c" colspan="2">Net Wt.</th><th class="vn-c" colspan="2">Gross Wt.</th>`
    : `<th class="vn-c" colspan="2">Unit Price</th><th class="vn-c" colspan="2">Amount</th>`;

  const selNilai = (b) =>
    isPacking
      ? `<td class="vn-r">${escapeHtml(ciplAngka(b.netto, 0))}</td><td class="vn-satuan vn-lanjut">KG</td>
         <td class="vn-r">${escapeHtml(ciplAngka(b.bruto, 0))}</td><td class="vn-satuan vn-lanjut">KG</td>`
      : `<td class="vn-satuan">USD</td><td class="vn-r vn-lanjut">${escapeHtml(ciplAngka(b.harga, 2))}</td>
         <td class="vn-satuan">USD</td><td class="vn-r vn-lanjut">${escapeHtml(ciplAngka(b.qty * b.harga, 2))}</td>`;

  const barisHtml = baris
    .map(
      (b) => `
      <tr>
        <td class="vn-marks">${escapeHtml(b.marks)}</td>
        <td class="vn-desc">${escapeHtml(b.uraian)}</td>
        <td class="vn-r">${escapeHtml(ciplAngka(b.qty, 0))}</td>
        <td class="vn-satuan vn-lanjut">${escapeHtml(b.satuan)}</td>
        ${selNilai(b)}
      </tr>`,
    )
    .join("");

  const dimensi = isPacking
    ? ciplVnDimensi(baris)
        .map(
          (teks) =>
            `<tr><td class="vn-marks"></td><td class="vn-desc vn-dim">${escapeHtml(teks)}</td>
             <td></td><td class="vn-lanjut"></td><td></td><td class="vn-lanjut"></td>
             <td></td><td class="vn-lanjut"></td></tr>`,
        )
        .join("")
    : "";

  /* SATU baris pengisi yang memanjang, bukan sejumlah baris kosong.

     Dulu bidang barang dipenuhi 14 baris kosong supaya tingginya
     lumayan tetap. Dengan bingkai yang tingginya sudah dipatok
     setinggi rujukan, cara itu justru berbahaya: pengapalan dengan
     banyak barang akan mendorong baris TOTAL keluar dari bingkai.
     Baris ini menyerap SISA tinggi berapa pun sisanya -- termasuk nol. */
  const kosongHtml = `<tr class="vn-isi"><td colspan="8"></td></tr>`;

  /* BARIS TOTAL PUNYA TATA LETAKNYA SENDIRI.

     Di berkas rujukan baris ini TIDAK mengikuti kolom tabel di
     atasnya: "TOTAL :" berakhir di 37% lebar bingkai, angka jumlahnya
     di 44%, dan "BOX WOODEN PACKING" mulai di 50% -- semuanya jatuh di
     tengah kolom Goods Description, bukan di batas kolom mana pun.

     Karena itu isinya satu sel melintang dengan pembagian sendiri,
     bukan delapan sel mengikuti colgroup. Dipaksa mengikuti kolom,
     "BOX WOODEN PACKING" tidak muat di jatahnya dan melimpah menempel
     ke "USD" di sebelahnya. */
  const totalEkor = isPacking
    ? `<span class="vn-t-n1">${escapeHtml(ciplAngka(total.netto, 0))}</span>
       <span class="vn-t-s1">KGS</span>
       <span class="vn-t-n2">${escapeHtml(ciplAngka(total.bruto, 0))}</span>
       <span class="vn-t-s2">KGS</span>`
    : `<span class="vn-t-usd">USD</span>
       <span class="vn-t-nilai">${escapeHtml(ciplAngka(total.nilai, 2))}</span>`;

  return `
  <div class="vn-sheet">
   <div class="vn-bingkai">
    <div class="vn-judul">${escapeHtml(judul)}</div>
    <div class="vn-kepala">
      <div class="vn-kepala-kiri">
        ${ciplVnBlokKiri(row, shipment, isPacking)}
        ${ciplVnAngkutan(row, shipment)}
      </div>
      <div class="vn-kepala-kanan">${ciplVnBlokKanan(row, shipment)}</div>
    </div>
    <table class="vn-items${isPacking ? " vn-items--pl" : ""}">
      <!-- Lebar kolom lewat <colgroup>, bukan lewat sel pertama:
           kolom angka dipakai bergantian oleh baris barang, baris
           dimensi, dan baris TOTAL yang ber-colspan berbeda-beda --
           menempelkan lebar pada sel membuat kolomnya berubah-ubah
           mengikuti baris mana yang kebetulan ada. -->
      <colgroup>
        <col class="vn-marks" />
        <col class="vn-desc" />
        <col class="vn-qty-num" />
        <col class="vn-qty-sat" />
        <col class="vn-n1-sat" />
        <col class="vn-n1-num" />
        <col class="vn-n2-sat" />
        <col class="vn-n2-num" />
      </colgroup>
      <thead>
        <tr>
          <th class="vn-marks">Marks &amp; No. PKGS</th>
          <th class="vn-desc">Goods Description</th>
          <th class="vn-c" colspan="2">Quantity</th>
          ${kepalaNilai}
        </tr>
        <tr class="vn-info">
          <td></td>
          <td class="vn-desc vn-c vn-b vn-nowrap" colspan="3">#Description Info : SIZE, PTN, MOLD NO, PO</td>
          <td colspan="4"></td>
        </tr>
      </thead>
      <tbody>
        ${barisHtml}
        ${dimensi}
        ${kosongHtml}
      </tbody>
      <tfoot>
        <tr class="vn-total">
          <td class="vn-marks"></td>
          <!-- Keterangan kemasan TIDAK boleh membungkus: sekali pecah
               jadi dua baris, tinggi baris TOTAL berubah dan seluruh
               blok di bawahnya ikut bergeser turun. -->
          <td colspan="7" class="vn-b">
            <div class="vn-total-isi">
              <span class="vn-t-label">TOTAL :</span>
              <span class="vn-t-qty">${escapeHtml(ciplAngka(total.qty, 0))}</span>
              <span class="vn-t-kemasan">BOX ${escapeHtml(p.packing || "WOODEN PACKING")}</span>
              ${totalEkor}
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
    ${ciplVnPenutup(row, shipment)}
   </div>
  </div>`;
}

function ciplVnHalamanInvoice(row, shipment) {
  return ciplVnHalaman(row, shipment, false);
}

function ciplVnHalamanPacking(row, shipment) {
  return ciplVnHalaman(row, shipment, true);
}

/* ------------------------------------------------------------------
   GAYA CETAK
------------------------------------------------------------------ */
function ciplVnCss() {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Times New Roman", Times, serif; font-size: 8pt; color: #000; }

  /* Satu lembar = satu halaman. break-after menjaga Packing List tidak
     menyambung ke sisa halaman Invoice. */
  /* BINGKAI LUAR mengelilingi seluruh lembar, termasuk judulnya --
     sama seperti berkas aslinya. Dipasang pada pembungkus, bukan pada
     tiap blok, supaya sudutnya menyatu tanpa garis ganda. */
  /* UKURAN & LETAK BINGKAI DIAMBIL DARI BERKAS RUJUKAN.

     Diukur dari PDF Kumho pada 110 dpi: tepi atas bingkai di 64 px
     (14,8 mm), tepi kiri 56 px (12,9 mm), tepi kanan 850 px
     (196,3 mm), tepi bawah 1137 px (262,6 mm). Angka-angka itu yang
     ditulis di sini -- jadi cetakannya jatuh di tempat yang sama di
     atas kertas, bukan sekadar "mirip".

     Tingginya DIPATOK, tidak mengikuti isi: pada berkas aslinya
     bingkai selalu setinggi itu dan bidang barang yang kosong
     memanjang sampai kaki lembar. Kalau tingginya mengikuti isi,
     pengapalan dengan 3 barang menghasilkan lembar pendek yang
     bentuknya sama sekali lain dari yang 8 barang. */
  .vn-sheet {
    width: 210mm;
    height: 297mm;
    /* Jarak bawah = jarak atas (14,8mm): bingkai memanjang sampai kaki
       kertas. Dulu 34,4mm (Invoice) & 43,5mm (Packing List), mengikuti
       wilayah cetak berkas rujukan -- yang menyisakan kaki kertas
       kosong. */
    padding: 14.8mm 13.7mm 14.8mm 12.9mm;
    page-break-after: always;
    break-after: page;
  }
  /* TEBAL GARIS MENGIKUTI PENGUKURAN BERKAS RUJUKAN (110 dpi):
       bingkai luar  3 px -> 0.7 mm
       garis tegas   2 px -> 0.45 mm  (pemisah blok utama & sekat kolom)
       garis tipis   1 px -> 0.25 mm  (pemisah antar baris)

     Ditulis dalam MILIMETER, bukan px atau pt. px layar bukan px
     printer, dan 1pt (1,333 px CSS) jatuh tepat di tengah antara 1
     dan 2 piksel pada 110 dpi -- pembulatannya lalu berbeda-beda
     antar sisi, jadi garis yang seharusnya sama tebal tampil belang. */
  .vn-bingkai {
    border: 0.7mm solid #000;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .vn-sheet:last-child { page-break-after: auto; break-after: auto; }

  /* Judul: tinggi kotaknya 38 px (8,8 mm) pada rujukan, hurufnya 24pt
     -- sama dengan berkas Excel aslinya. */
  .vn-judul {
    border-bottom: 0.25mm solid #000;
    text-align: center;
    font-size: 24pt;
    font-weight: 700;
    line-height: 8.35mm;
    letter-spacing: 0.5px;
  }

  /* Kepala: dua kolom sejajar, tepi luarnya menyatu dengan judul &
     tabel di bawahnya -- karena itu border dipasang per sisi, bukan
     keliling, supaya tidak ada garis ganda di pertemuannya. */
  /* KEDUA KOLOM SAMA TINGGI, dan itu yang membuat kotak Terms di kanan
     sejajar dengan baris Vessel/Flight di kiri: kolom kanan adalah
     flex tegak, kotak terakhirnya didorong ke kaki lewat margin-top
     auto. Menyetel tingginya dengan angka tetap akan meleset begitu
     alamat consignee bertambah satu baris. */
  /* SEKAT KOLOM DI 51,1%, bukan di tengah.

     Diukur dari rujukan: bingkai membentang x=56..849 (793 px) dan
     sekatnya di x=462 -> (462-56)/793 = 51,1%. Kolom kiri memang
     lebih lebar daripada kanan, dan menaruhnya di 47% membuat seluruh
     kotak Seller/Shipper/Consignee menyempit 3 cm dari aslinya.

     Tebalnya 0,5 mm: pada rujukan ia setebal bingkai luar (2 px),
     bukan setipis pemisah baris. */
  .vn-kepala { display: flex; border-bottom: 0.25mm solid #000; }
  .vn-kepala-kiri {
    width: 51.1%;
    border-right: 0.5mm solid #000;
    display: flex;
    flex-direction: column;
  }
  .vn-kepala-kanan { width: 48.9%; display: flex; flex-direction: column; }
  .vn-box { border-bottom: 0.25mm solid #000; padding: 0 1.2mm; }
  /* Pemisah Shipper|Consignee & kaki blok consignee lebih tegas
     (2 px pada rujukan) daripada pemisah Seller|Shipper (1 px). */
  .vn-kepala-kiri .vn-box:nth-child(2),
  .vn-kepala-kiri .vn-box:nth-child(3) { border-bottom-width: 0.5mm; }
  .vn-kepala-kiri > :last-child,
  .vn-kepala-kanan > :last-child { border-bottom: 0; }
  /* Kotak keterangan tidak bergaris bawah: pemisahnya garis ATAS
     kotak Terms -- satu garis, bukan dua yang berhimpit. */
  .vn-box-ref { border-bottom: 0; }
  .vn-box-terms { margin-top: auto; border-top: 0.25mm solid #000; }
  /* SATU IRAMA BARIS untuk seluruh blok kepala.

     Berkas aslinya lembar Excel: tiap baris teks setinggi satu baris
     sel, dan garis pemisahnya jatuh persis di batas baris. Tanpa
     irama yang sama, garis-garis itu meleset beberapa milimeter dari
     tempatnya di rujukan walaupun urutannya benar. */
  /* Tinggi baris diukur dari rujukan: kotak Seller memakai baris yang
     sedikit lebih tinggi (18,9 px) daripada blok lainnya (16,5 px) --
     begitu adanya di berkas aslinya, dan menyeragamkannya membuat
     seluruh garis di bawahnya meleset beberapa milimeter. */
  .vn-box-k,
  .vn-box-v,
  .vn-ref,
  .vn-split { line-height: 3.76mm; }
  .vn-kepala-kiri .vn-box:first-child .vn-box-k,
  .vn-kepala-kiri .vn-box:first-child .vn-box-v { line-height: 4.3mm; }
  /* HANYA Seller/Shipper/Consignee yang ditebalkan.

     Di berkas rujukan label lain -- "Invoice No. and Date", "Notify",
     "Other references", "Port of Loading", "Terms of delivery and
     payment", termasuk baris kepala tabel barang -- semuanya huruf
     biasa. Menebalkan semuanya membuat lembar ini terlihat jauh lebih
     "gelap" daripada aslinya, dan tiga judul kotak yang memang
     seharusnya menonjol jadi tidak menonjol lagi. */
  .vn-box-k { font-weight: 400; font-size: 7.5pt; }
  .vn-kepala-kiri .vn-box-k { font-weight: 700; }
  .vn-box-v { font-size: 7.5pt; }
  .vn-b { font-weight: 700; }
  .vn-split { display: flex; justify-content: space-between; font-size: 7.5pt; }
  .vn-ref { font-size: 7.5pt; }
  /* Baris lanjutan menjorok sejajar dengan nilai di atasnya. */
  .vn-ref-lanjut { padding-left: 18mm; }

  /* Tabel di dalam bingkai: tepi kiri & kanannya dilepas supaya
     menyatu dengan bingkai, bukan menggambar garis kedua di sebelahnya. */
  .vn-ship, .vn-items, .vn-akhir { border-left: 0; border-right: 0; }
  .vn-ship tr > td:first-child,
  .vn-items tr > *:first-child,
  .vn-akhir tr > td:first-child { border-left: 0; }
  .vn-ship tr > td:last-child,
  .vn-items tr > *:last-child,
  .vn-akhir tr > td:last-child { border-right: 0; }
  .vn-akhir tr:last-child td { border-bottom: 0; }

  /* Tabel angkutan berada DI DALAM kolom kiri, jadi lebarnya mengikuti
     kolom itu -- bukan lebar kertas. Baris terakhirnya tidak menggambar
     garis bawah: yang menutup blok kepala adalah .vn-kepala sendiri. */
  .vn-ship { width: 100%; border-collapse: collapse; }
  .vn-ship td {
    border: 0.25mm solid #000;
    padding: 0 1.2mm;
    font-size: 7.5pt;
    width: 50%;
    line-height: 3.76mm;
  }
  /* Nilai Port/Vessel: rata kiri, sedikit menjorok dari labelnya. */
  .vn-nilai { padding-left: 3mm; }
  .vn-ship tr > td:first-child { border-left: 0; }
  .vn-ship tr > td:last-child { border-right: 0; }
  .vn-ship .vn-ship-akhir td { border-bottom: 0; }
  /* Label blok angkutan huruf biasa -- lihat alasannya di .vn-box-k. */
  .vn-k { font-weight: 400; font-size: 7.5pt; }
  .vn-c { text-align: center; }
  .vn-r { text-align: right; }

  /* TABEL BARANG — GARIS DIPASANG, BUKAN DIMATIKAN.

     Semula tiap sel bergaris penuh lalu sebagiannya disembunyikan
     dengan warna transparan. Cara itu tidak bisa dipakai di sini:
     warna bukan gaya garis, jadi sel tetangga tetap membawa garis
     solid -- dan pada border-collapse, solid SELALU menang atas
     dotted. Sekat bertitik yang diminta berkas rujukan tidak akan
     pernah terlihat.

     Jadi bawaannya nol garis, dan yang perlu saja dipasang:
     kepala (atas/bawah), sekat kepala (bertitik), dan garis di atas
     TOTAL (bertitik). Badan tabel memang sepenuhnya kosong -- sama
     seperti aslinya. */
  /* Tabel barang MEMANJANG mengisi sisa tinggi bingkai (flex: 1),
     dengan satu baris pengisi di ekor badan tabel yang menyerap
     kelebihannya. Itulah yang menahan baris TOTAL & blok penutup
     tetap di kaki lembar berapa pun jumlah barangnya -- sama seperti
     berkas aslinya. */
  .vn-items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    flex: 1 1 auto;
    height: 1px; /* dasar flex; tinggi sebenarnya dari flex-grow */
  }
  .vn-items th, .vn-items td {
    border: 0;
    padding: 0.4mm 1.2mm;
    font-size: 7.5pt;
    vertical-align: top;
  }
  /* TANPA garis atas: yang menutup blok kepala adalah border-bottom
     milik .vn-kepala. Dua garis bersebelahan menghasilkan garis tebal
     ganda yang tidak ada di rujukan. */
  .vn-items th {
    text-align: center;
    font-weight: 400;
    border-bottom: 0.5mm solid #000;
    height: 3.9mm;
  }
  .vn-isi td { height: 100%; }
  .vn-items thead th + th { border-left: 0.18mm dotted #000; }
  /* 0,18 mm (=0,5pt): ukuran titik yang digambar peramban MENGIKUTI
     tebal garisnya -- makin tipis garisnya, makin kecil titiknya dan
     makin rapat jaraknya. Ini batas praktis; di bawah ini sebagian
     peramban membulatkannya kembali ke satu piksel dan titiknya justru
     menyatu jadi garis penuh. */
  .vn-items tfoot td { border-top: 0.18mm dotted #000; }
  /* LEBAR KOLOM DIJATAH DARI LEBAR KERTAS.

     Isi lembar = 210mm - 24mm padding = 186mm. Jatahnya:
     Marks 22 + Desc 56 + Qty 12 + Satuan 12 + (14+18)x2 = 186mm.
     Tanpa jatah tetap, satu uraian panjang melebarkan kolomnya dan
     mendorong kolom angka sampai membungkus. */
  /* Kolom Quantity, Unit Price & Amount masing-masing dibagi DUA sel
     (angka + satuannya) supaya angkanya sejajar. Pembagian itu alat
     bantu perataan, bukan kolom: kepalanya tetap satu sel ber-colspan,
     dan badan tabelnya memang tidak bergaris sama sekali. */

  /* Marks dilebarkan: "Marks & No. PKGS" terpotong pada 22mm dan
     hurufnya menabrak garis kolom di sebelahnya. */
  /* LEBAR KOLOM DIUKUR DARI BERKAS RUJUKAN.

     Sekat kolom pada lembar CI jatuh di 22,9% / 62,7% / 72,3% / 85,2%
     dari lebar bingkai; pada lembar PL di 22,9% / 61,4% / 74,1% /
     89,3% (kolomnya berbeda: Net Wt. & Gross Wt., bukan Unit Price &
     Amount). Persentase, bukan milimeter: lebar bingkainya sendiri
     sudah dipatok, jadi persen jatuh di tempat yang sama sekaligus
     ikut benar kalau kertasnya suatu saat bukan A4.

     Tiap kolom angka dibagi DUA sel (satuan + angkanya) supaya
     angkanya sejajar; jumlah keduanya = lebar kolom pada rujukan. */
  .vn-marks { width: 22.9%; text-align: center; white-space: nowrap; }
  .vn-desc { width: 39.8%; }
  .vn-items { --vn-sat: 5.3%; --vn-num: 4.3%; }
  .vn-satuan { width: var(--vn-sat); text-align: center; white-space: nowrap; }
  .vn-items .vn-r { width: var(--vn-num); white-space: nowrap; }
  /* Kolom Quantity: angka lalu satuannya. */
  .vn-items col.vn-qty-num { width: 4.3%; }
  .vn-items col.vn-qty-sat { width: 5.3%; }
  .vn-items col.vn-n1-sat { width: 4.5%; }
  .vn-items col.vn-n1-num { width: 8.4%; }
  .vn-items col.vn-n2-sat { width: 4.5%; }
  .vn-items col.vn-n2-num { width: 10.3%; }
  /* Lembar Packing List: tiga kolom terakhir berbeda lebarnya. */
  .vn-items--pl col.vn-qty-num { width: 6%; }
  .vn-items--pl col.vn-qty-sat { width: 6.7%; }
  .vn-items--pl col.vn-n1-sat { width: 9%; }
  .vn-items--pl col.vn-n1-num { width: 6.2%; }
  .vn-items--pl col.vn-n2-sat { width: 6%; }
  .vn-items--pl col.vn-n2-num { width: 4.7%; }
  .vn-items th.vn-c { white-space: nowrap; }
  .vn-nowrap { white-space: nowrap; }
  /* Kolom keterangan kemasan pada baris TOTAL: melebar dari kolom
     satuan + harga, jadi "BOX WOODEN PACKING" muat sebaris. */
  /* Jatah tiap bagian baris TOTAL, dihitung dari letaknya di berkas
     rujukan (persen di bawah relatif terhadap sel, yang mulai di 22,9%
     lebar bingkai). Lembar PL berbeda: ekornya empat bagian (netto,
     KGS, bruto, KGS), bukan dua. */
  /* display:flex dipasang pada DIV di dalam sel, bukan pada <td>-nya.
     <td> yang diubah jadi flex keluar dari perhitungan lebar tabel,
     dan seluruh baris TOTAL menciut mengikuti isinya. */
  .vn-total-isi { display: flex; white-space: nowrap; }
  .vn-t-label { width: 18.8%; text-align: right; }
  .vn-t-qty { width: 10.5%; text-align: right; }
  .vn-t-kemasan { width: 51.4%; padding-left: 8%; }
  .vn-t-usd { width: 6.4%; text-align: center; }
  .vn-t-nilai { width: 12.9%; text-align: right; }
  .vn-items--pl .vn-t-kemasan { width: 36.4%; }
  .vn-t-n1 { width: 10.4%; text-align: right; }
  .vn-t-s1 { width: 11%; padding-left: 2.5%; }
  .vn-t-n2 { width: 7.6%; text-align: right; }
  .vn-t-s2 { width: 5.3%; padding-left: 1.5%; }
  /* Baris "#Description Info" bagian dari bidang kosong di bawah
     kepala, bukan baris tabel tersendiri. */
  .vn-info td { border: 0; }
  .vn-dim { font-size: 7pt; }

  /* BLOK PENUTUP: dua kolom dengan sekat di 47% -- titik yang sama
     dengan sekat blok kepala, jadi garisnya menyambung lurus dari
     atas lembar sampai bawah. */
  /* Tinggi blok penutup diambil dari rujukan: baris TOTAL berakhir di
     935 px dan bingkai bawah di 1137 px -> 202 px = 46,6 mm. */
  /* 66,4 mm = 46,6 mm rujukan + 19,8 mm tambahan kotak tanda tangan
     (30,2 -> 50 mm): celah di antara baris TOTAL dan atap kotak tetap
     16,4 mm seperti rujukan; yang menyusut bidang barang yang kosong. */
  .vn-akhir { display: flex; height: 66.4mm; }
  /* TANPA sekat tegak di sini.

     Garis tegak yang memanjang dari baris TOTAL sampai kaki lembar
     tidak memisahkan apa pun: di atas kotak tanda tangan kedua sisinya
     sama-sama kosong. Yang perlu bergaris hanya kotak tanda tangannya
     sendiri -- sekat tegaknya dipasang di .vn-akhir-ttd, jadi
     panjangnya persis setinggi kotak itu. */
  .vn-akhir-kiri {
    width: 51.1%;
    padding: 1mm 0;
    font-size: 7.5pt;
  }
  /* PENANDA PENGAPALAN SELEBAR KOLOM MARKS, bukan selebar kolom kiri.

     Diukur dari rujukan: teksnya jatuh di 2,4%-21,9% lebar bingkai --
     seluruhnya di dalam kolom "Marks & No. PKGS" (0-22,9%), persis di
     bawah penanda koli yang didaftarnya. Dibentangkan selebar kolom
     kiri (51,1%), teksnya bergeser ke kanan sampai menggantung di
     tengah-tengah kolom Goods Description dan tidak lagi segaris
     dengan apa pun.

     Lebarnya 44,8% = 22,9/51,1 -- bagian kolom Marks terhadap kolom
     kiri tempatnya bernaung. */
  .vn-akhir-marks {
    width: 44.8%;
    text-align: center;
    /* 9pt, lebih besar daripada isi lembar lainnya (7,5pt) -- diukur
       dari rujukan: tinggi barisnya 13 px lawan 11 px. Begitu adanya
       di berkas aslinya; penanda pengapalan memang ditulis lebih besar
       supaya terbaca dari jarak baca peti. */
    font-size: 9pt;
    line-height: 4.2mm;
  }
  .vn-akhir-kanan { width: 48.9%; display: flex; flex-direction: column; }
  /* Kotak tanda tangan menempel ke kaki lembar, dan TINGGINYA dipatok
     mengikuti rujukan (garis atasnya di 1006 px, bingkai bawah di
     1137 px -> 131 px = 30,2 mm). Dengan tinggi mengikuti isi, letak
     garis atasnya berubah-ubah mengikuti panjang penanda pengapalan
     di kolom sebelah. */
  /* Kotak tanda tangan: bergaris ATAS dan KIRI, menempel ke kaki
     lembar. Garis kirinya jatuh tepat di sekat kolom (51,1%) -- itulah
     satu-satunya bagian sekat tegak yang tersisa di blok penutup. */
  .vn-akhir-ttd {
    margin-top: auto;
    /* MUAT STEMPEL PERUSAHAAN: 50 mm (dulu 30,2 mm dari rujukan) --
       stempel bundar umumnya 40-45 mm, dan tanda tangannya menimpa
       stempel. Sama dengan Excel-nya (XLS_TTD_MM). */
    height: 50mm;
    border-top: 0.5mm solid #000;
    border-left: 0.5mm solid #000;
    padding: 0.4mm 1.2mm;
    font-size: 7.5pt;
  }
  `;
}
