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
const CIPL_VN_MIN_BARIS = 14;

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

function ciplVnBlokKiri(row, shipment) {
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const consigneeNama = p.customer || (shipment && shipment.party) || "";
  const consigneeAlamat = p.consigneeAddress
    ? ciplBarisTeks(p.consigneeAddress)
    : prof.lines || [];

  const kotak = (judul, baris, tebalPertama) => `
    <div class="vn-box">
      <div class="vn-box-k">${escapeHtml(judul)}</div>
      ${baris
        .filter((x) => String(x || "").trim())
        .map(
          (x, i) =>
            `<div class="vn-box-v${i === 0 && tebalPertama ? " vn-b" : ""}">${escapeHtml(x)}</div>`,
        )
        .join("")}
    </div>`;

  return (
    kotak("Seller", CIPL_VN_SELLER, false) +
    kotak("Shipper", CIPL_VN_SHIPPER, false) +
    kotak("Consignee", [consigneeNama, ...consigneeAlamat], true)
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
  const poSemua =
    typeof poNoSemua === "function" ? poNoSemua(p) : [p.poNo].filter(Boolean);

  /* Keterangan lain: baris bertanda bintang, mengikuti berkas aslinya.
     Yang kosong DILEWATI -- baris "*P/O NO. :" tanpa isi terbaca
     seperti isian yang lupa diisi. */
  const lain = [
    ["*SHIPPER", "PT Dynamic Design Indonesia"],
    ["*COUNTRY OF ORIGIN", "INDONESIA"],
    ["*P/O NO.", poSemua.join(", ")],
    ["*PACKING", p.packing || "WOODEN PACKING"],
    ["*PRICE TERM", p.termsDelivery || ""],
    ["*BANKER", "Citibank Korea Inc"],
    ["", "Jungang Citi Service Center (27)"],
    ["", "(SWIFT : CITIKRSX)"],
    ["*ACCOUNT NO.", "1-089331-143-01"],
    ["", "DYNAMIC DESIGN CO.,LTD"],
    ["* HS-CODE", p.hsCode || "8480.71 (Tire Mold)"],
  ].filter(([k, v]) => String(v || "").trim() || !k);

  return `
    <div class="vn-box vn-box-split">
      <div class="vn-box-k">Invoice No. and Date</div>
      <div class="vn-split">
        <span class="vn-b">${escapeHtml(row.doc_number || "")}</span>
        <span>${escapeHtml(ciplTanggal(row.doc_date))}</span>
      </div>
    </div>
    <div class="vn-box"><div class="vn-box-k">L/C No. and Date</div><div class="vn-box-v">&nbsp;</div></div>
    <div class="vn-box">
      <div class="vn-box-k">Notify(if other than consignee)</div>
      <div class="vn-box-v">${escapeHtml(p.notifyParty || "SAME AS CONSIGNEE")}</div>
      <div class="vn-box-k">Other references</div>
      ${lain
        .map(
          ([k, v]) =>
            `<div class="vn-ref"><span class="vn-ref-k">${escapeHtml(k)}</span>${
              k ? " : " : ""
            }<span>${escapeHtml(v)}</span></div>`,
        )
        .join("")}
    </div>`;
}

/* Blok pengangkutan: tiga baris kotak, mengikuti berkas aslinya. */
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

  return `
  <table class="vn-ship">
    <tr>
      <td class="vn-k" colspan="2">Departure date</td>
      <td class="vn-c vn-b" colspan="2">${escapeHtml(ciplTanggal(berangkat))}</td>
    </tr>
    <tr>
      <td class="vn-k">Port of Loading</td>
      <td class="vn-k" colspan="3">Port of Discharge</td>
    </tr>
    <tr>
      <td class="vn-c vn-b">${escapeHtml(pol)}</td>
      <td class="vn-c vn-b" colspan="3">${escapeHtml(pod)}</td>
    </tr>
    <tr>
      <td class="vn-k">Vessel/Flight</td>
      <td class="vn-k">Final Destination</td>
      <td class="vn-k" colspan="2">Terms of delivery and payment</td>
    </tr>
    <tr>
      <td class="vn-c vn-b">${escapeHtml(kapal)}</td>
      <td class="vn-c vn-b">${escapeHtml(dest)}</td>
      <td class="vn-c" colspan="2">${escapeHtml(p.termsPayment || "T/T 60 days after B/L date")}</td>
    </tr>
  </table>`;
}

/* Blok penutup: penanda pengapalan di kiri, nomor booking di tengah,
   kotak tanda tangan di kanan. */
function ciplVnPenutup(row, shipment, total, satuan, isPacking) {
  const p = row.payload || {};
  const consignee = p.customer || (shipment && shipment.party) || "";
  const bk = String(p.bookingNo || "").trim();

  const nilaiTotal = isPacking
    ? `<td class="vn-c vn-b">${escapeHtml(ciplAngka(total.netto, 0))}</td>
       <td class="vn-c">KGS</td>
       <td class="vn-c vn-b">${escapeHtml(ciplAngka(total.bruto, 0))}</td>
       <td class="vn-c">KGS</td>`
    : `<td class="vn-c vn-b" colspan="3">USD</td>
       <td class="vn-c vn-b">${escapeHtml(ciplAngka(total.nilai, 2))}</td>`;

  return `
  <table class="vn-akhir">
    <tr>
      <td class="vn-akhir-kiri" rowspan="2">
        <div>Dynamic Design</div>
        <div>${escapeHtml(consignee)}</div>
        <div>${escapeHtml(row.doc_number || "")}</div>
      </td>
      <td class="vn-akhir-bk">${bk ? "BK NO. " + escapeHtml(bk) : "&nbsp;"}</td>
    </tr>
    <tr>
      <td class="vn-akhir-ttd"><div class="vn-k">signed by</div><div class="vn-ttd-ruang"></div></td>
    </tr>
  </table>`;
}

/* ------------------------------------------------------------------
   HALAMAN
------------------------------------------------------------------ */

function ciplVnHalaman(row, shipment, isPacking) {
  const baris = ciplVnBaris(shipment);
  const total = ciplVnTotal(baris);
  const p = row.payload || {};
  const satuan = baris.length ? baris[0].satuan : "";
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
      ? `<td class="vn-r">${escapeHtml(ciplAngka(b.netto, 0))}</td><td class="vn-satuan">KG</td>
         <td class="vn-r">${escapeHtml(ciplAngka(b.bruto, 0))}</td><td class="vn-satuan">KG</td>`
      : `<td class="vn-satuan">USD</td><td class="vn-r">${escapeHtml(ciplAngka(b.harga, 2))}</td>
         <td class="vn-satuan">USD</td><td class="vn-r">${escapeHtml(ciplAngka(b.qty * b.harga, 2))}</td>`;

  const barisHtml = baris
    .map(
      (b) => `
      <tr>
        <td class="vn-marks">${escapeHtml(b.marks)}</td>
        <td class="vn-desc">${escapeHtml(b.uraian)}</td>
        <td class="vn-r">${escapeHtml(ciplAngka(b.qty, 0))}</td>
        <td class="vn-satuan">${escapeHtml(b.satuan)}</td>
        ${selNilai(b)}
      </tr>`,
    )
    .join("");

  const dimensi = isPacking
    ? ciplVnDimensi(baris)
        .map(
          (teks) =>
            `<tr><td class="vn-marks"></td><td class="vn-desc vn-dim">${escapeHtml(teks)}</td>
             <td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
        )
        .join("")
    : "";

  const kosong = Math.max(0, CIPL_VN_MIN_BARIS - baris.length - (isPacking ? 2 : 0));
  const kosongHtml = Array.from(
    { length: kosong },
    () =>
      `<tr class="vn-kosong"><td class="vn-marks">&nbsp;</td><td class="vn-desc"></td>
       <td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
  ).join("");

  const totalNilai = isPacking
    ? `<td class="vn-r vn-b">${escapeHtml(ciplAngka(total.netto, 0))}</td><td class="vn-satuan vn-b">KGS</td>
       <td class="vn-r vn-b">${escapeHtml(ciplAngka(total.bruto, 0))}</td><td class="vn-satuan vn-b">KGS</td>`
    : `<td class="vn-satuan vn-b">USD</td><td class="vn-r vn-b" colspan="3">${escapeHtml(ciplAngka(total.nilai, 2))}</td>`;

  return `
  <div class="vn-sheet">
   <div class="vn-bingkai">
    <div class="vn-judul">${escapeHtml(judul)}</div>
    <div class="vn-kepala">
      <div class="vn-kepala-kiri">${ciplVnBlokKiri(row, shipment)}</div>
      <div class="vn-kepala-kanan">${ciplVnBlokKanan(row, shipment)}</div>
    </div>
    ${ciplVnAngkutan(row, shipment)}
    <table class="vn-items">
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
          <td class="vn-desc vn-r vn-b">TOTAL :</td>
          <td class="vn-r vn-b">${escapeHtml(ciplAngka(total.qty, 0))}</td>
          <!-- Keterangan kemasan TIDAK boleh membungkus: sekali pecah
               jadi tiga baris, tinggi baris TOTAL berubah dan seluruh
               blok di bawahnya ikut bergeser turun. -->
          <td class="vn-kemasan vn-b">BOX ${escapeHtml(p.packing || "WOODEN PACKING")}</td>
          ${totalNilai}
        </tr>
      </tfoot>
    </table>
    ${ciplVnPenutup(row, shipment, total, satuan, isPacking)}
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
  .vn-sheet {
    width: 100%;
    padding: 10mm 12mm;
    page-break-after: always;
    break-after: page;
  }
  .vn-bingkai { border: 1px solid #000; }
  .vn-sheet:last-child { page-break-after: auto; break-after: auto; }

  .vn-judul {
    border-bottom: 1px solid #000;
    text-align: center;
    font-size: 19pt;
    font-weight: 700;
    padding: 1.5mm 0;
    letter-spacing: 0.5px;
  }

  /* Kepala: dua kolom sejajar, tepi luarnya menyatu dengan judul &
     tabel di bawahnya -- karena itu border dipasang per sisi, bukan
     keliling, supaya tidak ada garis ganda di pertemuannya. */
  .vn-kepala { display: flex; border-bottom: 1px solid #000; }
  .vn-kepala-kiri { width: 47%; border-right: 1px solid #000; }
  .vn-kepala-kanan { width: 53%; }
  .vn-box { border-bottom: 1px solid #000; padding: 0.6mm 1.2mm; }
  .vn-kepala-kiri .vn-box:last-child,
  .vn-kepala-kanan .vn-box:last-child { border-bottom: 0; }
  .vn-box-k { font-weight: 700; font-size: 7.5pt; }
  .vn-box-v { font-size: 7.5pt; line-height: 1.25; }
  .vn-b { font-weight: 700; }
  .vn-split { display: flex; justify-content: space-between; font-size: 7.5pt; }
  .vn-ref { font-size: 7.5pt; line-height: 1.25; }
  .vn-ref-k { display: inline-block; min-width: 26mm; }

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

  .vn-ship { width: 100%; border-collapse: collapse; }
  .vn-ship td { border: 1px solid #000; padding: 0.5mm 1.2mm; font-size: 7.5pt; }
  .vn-k { font-weight: 700; font-size: 7.5pt; }
  .vn-c { text-align: center; }
  .vn-r { text-align: right; }

  .vn-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .vn-items th, .vn-items td {
    border: 1px solid #000;
    padding: 0.4mm 1.2mm;
    font-size: 7.5pt;
    vertical-align: top;
  }
  .vn-items th { text-align: center; font-weight: 700; }
  /* Baris barang tanpa garis mendatar di dalamnya: daftar pos terbaca
     sebagai satu bidang, sama seperti berkas aslinya. Garis TEGAK
     tetap utuh -- disembunyikan lewat warna, bukan lebar 0, supaya
     tidak kalah saat batasnya diperebutkan border-collapse. */
  .vn-items tbody td {
    border-top-color: transparent;
    border-bottom-color: transparent;
  }
  .vn-items tbody tr:first-child td { border-top-color: #000; }
  .vn-items tfoot td { border-top: 1.2px solid #000; }
  /* LEBAR KOLOM DIJATAH DARI LEBAR KERTAS.

     Isi lembar = 210mm - 24mm padding = 186mm. Jatahnya:
     Marks 22 + Desc 56 + Qty 12 + Satuan 12 + (14+18)x2 = 186mm.
     Tanpa jatah tetap, satu uraian panjang melebarkan kolomnya dan
     mendorong kolom angka sampai membungkus. */
  .vn-marks { width: 22mm; text-align: center; white-space: nowrap; }
  .vn-desc { width: 56mm; }
  .vn-satuan { width: 12mm; text-align: center; white-space: nowrap; }
  .vn-items .vn-r { width: 18mm; white-space: nowrap; }
  .vn-items th.vn-c { white-space: nowrap; }
  .vn-nowrap { white-space: nowrap; }
  /* Kolom keterangan kemasan pada baris TOTAL: melebar dari kolom
     satuan + harga, jadi "BOX WOODEN PACKING" muat sebaris. */
  .vn-kemasan { white-space: nowrap; text-align: left; }
  .vn-info td { border-top-color: #000; }
  .vn-dim { font-size: 7pt; }

  .vn-akhir { width: 100%; border-collapse: collapse; }
  .vn-akhir td { border: 1px solid #000; padding: 1mm 1.2mm; font-size: 7.5pt; }
  .vn-akhir-kiri { width: 47%; text-align: center; vertical-align: top; }
  .vn-akhir-bk { font-weight: 700; padding-bottom: 3mm !important; }
  .vn-ttd-ruang { height: 14mm; }
  `;
}
