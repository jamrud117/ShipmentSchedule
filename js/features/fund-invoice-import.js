"use strict";

/* ==================================================================
   PENGAJUAN DANA DARI INVOICE VENDOR (PDF)

   Unggah PDF tagihan vendor -> form Pengajuan Dana terisi: vendor,
   nomor & tanggal invoice, jatuh tempo, BL/AWB, jenis pengeluaran,
   jenis transaksi, dan rincian biaya (DPP + tarif PPN per baris).
   Pengguna tinggal memeriksa lalu menyimpan -- tidak ada yang tersimpan
   tanpa dilihat dulu.

   Pembaca:
     - FedEx: tiap AWB dipecah per komponen seperti di halaman "Details
       by Payment Type" -- Freight Charges, Base Discount (baris diskon),
       Fuel Surcharge, Demand Surcharge, ... PPN 1,1% dibulatkan SEKALI
       per AWB (grupPpn), sama dengan cara FedEx -- totalnya tepat.
     - DHL Express (Regular Invoice): tiap AWB per baris DHL -- Standard
       Charge, Fuel Surcharge, GoGreen ... masing-masing dengan diskonnya;
       PPN dibulatkan per baris DHL (grupPpn), sama dengan DHL.
     - DHL Inbound Charges Invoice: baris Billing Details (Non-Routine
       Entry, bea, ...) dengan PPN masing-masing.
     - Billing DJBC (struk billing bea cukai): Nomor Billing, tanggal &
       jatuh tempo, akun Bea Masuk / PPN Impor / PPh Impor -> isian Billing;
       jadwal impornya dicari lewat nomor aju PIB (BL/AWB & jenis transaksi).
     - Tabel forwarder (WIDE dan sejenisnya): kolom Description, Qty,
       CURR, Rate, Amount, VAT, PPH 23, Total.
     - Prime Freight: Invoice dan Debit Note satu format (kolom CUR, RATE,
       AMT (CUR), AMOUNT (IDR), VAT) -- yang membedakan hanya judul lembarnya.
     - Bertabel umum (surveyor LS, EMKL, trucking, ...): tabel Item /
       Description / Quantity / UOM / U/Price / Total + ringkasan Sub Total,
       VAT, Total (bacaInvoiceRincian).
     - Umum: nomor, tanggal, BL/AWB, dan total saja -- satu baris.
   Teksnya dari extractPdfText() (js/import/pdf.js), pembaca PDF yang
   sama dengan impor PIB/CIPL.

   Unggahnya boleh banyak berkas sekaligus (pilih beberapa PDF, atau seret
   ke form): invoice + debit note vendor yang sama masuk ke satu pengajuan
   -- lihat danaDariBerkasPdf() di bawah.
================================================================== */

const DANA_BULAN = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8,
  sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};

/* "28 Sep 2026", "30 September 2026", "30 - September - 2026",
   "18-08-2026" (hari-bulan-tahun, gaya DHL), "2026-09-28" -> ISO.
   Bergaris miring: "09/15/2026" bulan/hari/tahun (FedEx) kecuali
   urutan = "dmy" ("02/10/2026" DHL = 2 Oktober). Tafsiran yang mustahil
   (bulan > 12) tidak pernah dipakai: "17/11/2026" = 17 November apa pun
   urutan bawaannya. */
function danaTanggalIso(teks, urutan) {
  const isi = String(teks || "").trim();
  let m = isi.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = isi.match(/(\d{1,2})\s*-?\s*([A-Za-z]{3,})\.?\s*-?\s*(\d{4})/);
  if (m) {
    const b = DANA_BULAN[m[2].slice(0, 3).toLowerCase()];
    if (b) return `${m[3]}-${String(b).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = isi.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = isi.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dmy = +m[1] > 12 ? true : +m[2] > 12 ? false : urutan === "dmy";
    const [hari, bulan] = dmy ? [m[1], m[2]] : [m[2], m[1]];
    return `${m[3]}-${bulan.padStart(2, "0")}-${hari.padStart(2, "0")}`;
  }
  return "";
}

/* "8,153,951" / "22,210,551.00" / "(4,503,400)" / "-6,633,550" /
   "5.688.963,00" / "1.250.000" -> angka */
function danaAngka(teks) {
  let isi = String(teks || "").trim();
  const negatif = /^\(.*\)$/.test(isi) || /^-/.test(isi);
  isi = isi.replace(/[()\s-]/g, "");
  if (/,\d{1,2}$/.test(isi) && isi.indexOf(".") >= 0) isi = isi.replace(/\./g, "").replace(",", ".");
  // "Rp 1.250.000": dua titik atau lebih tanpa koma = pemisah ribuan (dulu terbaca 1,25)
  else if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(isi)) isi = isi.replace(/\./g, "");
  else isi = isi.replace(/,/g, "");
  const n = parseFloat(isi);
  return isFinite(n) ? (negatif ? -n : n) : 0;
}

/* Tarif PPN dari nilai PPN / DPP, dibulatkan ke tarif yang dipakai form */
function danaTarifPpn(ppn, dpp) {
  if (!(dpp > 0) || !(ppn > 0)) return 0;
  const tarif = (ppn / dpp) * 100;
  const baku = (typeof FUND_PPN_RATES !== "undefined" ? FUND_PPN_RATES : [0, 1.1, 11]).filter((x) => x > 0);
  const dekat = baku.reduce((a, b) => (Math.abs(b - tarif) < Math.abs(a - tarif) ? b : a));
  return Math.abs(dekat - tarif) <= Math.max(0.15, dekat * 0.02) ? dekat : Math.round(tarif * 100) / 100;
}

/* Jenis pengeluaran dari uraian baris */
function danaJenisBaris(uraian) {
  const d = String(uraian || "").toUpperCase();
  if (/TAX|PAJAK|PPN|PPH|BEA MASUK|DUTY|DUTIES|PIB/.test(d)) return "Tax Advance";
  if (/STORAGE|PENUMPUKAN|GUDANG|WAREHOUSE|DEMURRAGE|DETENTION|LIFT ?(ON|OFF)/.test(d)) return "Storage";
  if (/FREIGHT|OCEAN|TRUCK|DELIVERY|HANDLING|\bTHC\b|CLEARANCE|CUSTOMS|EMKL|PPJK|EXPRESS|COURIER|KURIR|SURCHARGE/.test(d)) return "Freight";
  return "Lainnya";
}

/* Jenis pengeluaran SATU invoice (form hanya punya satu jenis):
     - pajak (Tax Advance) >= separuh nilai  -> Tax Advance
     - storage >= separuh nilai              -> Storage
     - ada jasa angkut sama sekali           -> Freight -- seluruh biaya
       forwarder (admin, dokumen, asuransi, fumigasi, ...) ikut kiriman itu
     - selain itu                            -> Lainnya */
function danaJenisInvoice(rincian) {
  const total = rincian.reduce((x, r) => x + Math.abs(r.amount), 0);
  if (!total) return "";
  const porsi = (j) => rincian.filter((r) => danaJenisBaris(r.desc) === j).reduce((x, r) => x + Math.abs(r.amount), 0) / total;
  if (porsi("Tax Advance") >= 0.5) return "Tax Advance";
  if (porsi("Storage") >= 0.5) return "Storage";
  if (porsi("Freight") > 0) return "Freight";
  return "Lainnya";
}

/* Nomor BL/AWB tanpa spasi ("WLS O260 9882 6" -> "WLSO26098826");
   beberapa nomor tetap dipisah "/". */
const danaRapatBl = (teks) => String(teks || "").split("/").map((x) => x.replace(/\s+/g, "")).filter(Boolean).join("/");

/* Nama vendor: utamakan nama yang SUDAH dipakai di Pengajuan Dana
   sebelumnya (supaya ringkasan per vendor tidak terpecah), lalu nama
   perusahaan di invoice. */
function danaVendorDariDaftar(teks, dikenal) {
  const besar = String(teks || "").toUpperCase();
  const cocok = (dikenal || [])
    .map((v) => String(v || "").trim())
    .filter((v) => v.length >= 3 && new RegExp(`\\b${v.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(besar))
    .sort((a, b) => b.length - a.length);
  return cocok.length ? cocok[0] : "";
}

/* Nama perusahaan yang BUKAN vendor: kita sendiri (alamat tagihan, nama rekening
   virtual "Beneficiary Name : Dynamic Design Indonesia PT") dan bank. */
const danaBukanVendor = (nama) => /DYNAMIC\s+DESIGN|\bBANK\b/i.test(String(nama || ""));

function danaNamaVendor(teks, dikenal) {
  const besar = String(teks || "").toUpperCase();
  const dariDaftar = danaVendorDariDaftar(teks, dikenal);
  if (dariDaftar) return dariDaftar;
  if (/FEDEX/.test(besar)) return "FEDEX";
  const bayar = String(teks).match(/PAYABLE TO\s*\n?\s*"?\s*(PT\.?\s+[A-Z0-9 .&-]+?)\s*"?\s*$/im);
  if (bayar) return bayar[1].replace(/\s+/g, " ").trim();
  // Satu baris: "Dynamic Design Indonesia, PT" di ujung baris tidak boleh merangkai baris sesudahnya
  const pt = (String(teks).match(/\bPT\.?[ \t]+[A-Z][A-Z0-9 .&-]{2,40}/g) || []).find((x) => !danaBukanVendor(x));
  if (pt) return pt.replace(/\s+/g, " ").trim();
  /* Nama berhuruf kapital-awal ("PT Anindya Wiraputra Konsult") -- vendor yang kopnya
     berupa logo (gambar, tidak ikut lapisan teks; berwarna, jadi hilang di OCR) dan
     namanya baru tertulis di atas tanda tangan. Satu baris sendiri, atau di ujung baris
     sesudah ":" (OCR merangkai kolom kanan ke "... Virtual Account : PT ..."). Ditulis
     kapital seperti nama vendor lain di daftar. */
  const kata = "[A-Z][A-Za-z0-9&.'-]*";
  const re = new RegExp(`(?:^|:[ \\t]*)(PT\\.?[ \\t]+${kata}(?:[ \\t]+${kata}){0,5})[ \\t]*$`, "gm");
  const calon = [...String(teks).matchAll(re)].map((m) => m[1].replace(/\s+/g, " ").trim()).find((x) => !danaBukanVendor(x));
  return calon ? calon.toUpperCase() : "";
}

/* Uraian baris invoice kurir: cukup nama komponennya ("Duty & Tax") --
   nomor AWB-nya sudah di isian BL/AWB & tautan baris. Hanya invoice
   BEBERAPA AWB yang diberi "– AWB <nomor>", supaya baris tiap kiriman
   tetap terbedakan di surat cetak. Berat tidak ditulis. */
const danaAkhiranAwb = (jumlahAwb, nomor) => (jumlahAwb > 1 ? ` – AWB ${nomor}` : "");

/* FedEx: satu baris per AWB */
function bacaInvoiceFedex(teks) {
  const baris = String(teks).split(/\r?\n/);
  const awb = [];
  let kini = null;
  baris.forEach((l) => {
    let m = l.match(/Air Waybill Number\s+(\d{9,14})/);
    if (m) {
      kini = { awb: m[1], total: 0, ppn: 0, tarif: 0, komponen: [] };
      awb.push(kini);
      return;
    }
    if (!kini) return;
    // Komponen biaya: "Freight Charges 8,188,000", "Discounts Base Discount (4,503,400)",
    // "Other Charges Fuel Surcharge 1,822,359" -- bisa didahului isi kolom kiri
    m = l.match(/Freight Charges\s+(\(?-?[\d,]+\)?)\s*$/);
    if (m) kini.komponen.push({ nama: "Freight Charges", nilai: danaAngka(m[1]) });
    m = l.match(/Discounts\s+(.+?)\s+\(?([\d,]+)\)?\s*$/);
    if (m) kini.komponen.push({ nama: m[1].trim(), nilai: -Math.abs(danaAngka(m[2])) });
    m = l.match(/Other Charges\s+(.+?)\s+(\(?-?[\d,]+\)?)\s*$/);
    if (m) kini.komponen.push({ nama: m[1].trim(), nilai: danaAngka(m[2]) });
    m = l.match(/Indonesia VAT \(([\d.]+)%\)\s+([\d,]+)/);
    if (m) {
      kini.tarif = parseFloat(m[1]);
      kini.ppn = danaAngka(m[2]);
    }
    m = l.match(/^Total\s+([\d,]+)\s*$/);
    if (m) {
      kini.total = danaAngka(m[1]);
      kini = null;
    }
  });
  const ambil = (re) => (String(teks).match(re) || [])[1] || "";
  const subTotal = danaAngka(ambil(/Sub Total\s+([\d,]+)/));
  const ppnTarif = parseFloat(ambil(/PPN \(VAT\)\s*([\d.]+)%/)) || 0;
  const grand = danaAngka(ambil(/Grand Total \(IDR\)\s+([\d,]+)/));
  /* Tiap AWB: komponennya sendiri-sendiri (diskon sebagai baris diskon),
     PPN dibulatkan sekali per AWB lewat grupPpn. Kalau komponennya tidak
     menjumlah ke Total - PPN (format berubah), AWB itu jadi satu baris. */
  const lines = [];
  const ditagih = awb.filter((a) => a.total);
  ditagih.forEach((a) => {
    const tarif = a.tarif || danaTarifPpn(a.ppn, a.total - a.ppn);
    const bersih = a.total - a.ppn;
    const akhiran = danaAkhiranAwb(ditagih.length, a.awb);
    const jumlahKomponen = a.komponen.reduce((x, k) => x + k.nilai, 0);
    if (a.komponen.length && Math.abs(jumlahKomponen - bersih) < 1) {
      a.komponen.forEach((k) => {
        // awb: baris langsung tertaut ke kirimannya (tagihan per BL/AWB, fund-lines.js)
        const baris = { desc: k.nama + akhiran, amount: String(Math.round(Math.abs(k.nilai))), ppnRate: tarif, grupPpn: a.awb, awb: a.awb };
        if (k.nilai < 0) Object.assign(baris, { jenis: "diskon", discType: "rp" });
        lines.push(baris);
      });
    } else {
      lines.push({ desc: "FedEx Express" + akhiran, amount: String(Math.round(bersih)), ppnRate: tarif, awb: a.awb });
    }
  });
  if (!lines.length && subTotal) lines.push({ desc: "FedEx express charges", amount: String(Math.round(subTotal)), ppnRate: ppnTarif });
  return {
    sumber: "FedEx",
    payee: "FEDEX",
    invoiceNo: ambil(/Invoice Number\s*:?\s*(\d{6,})/),
    invoiceDate: danaTanggalIso(ambil(/Invoice Date\s*:?\s*(\d{1,2} [A-Za-z]{3,} \d{4})/)),
    invoiceDueDate: danaTanggalIso(ambil(/(?:due by|jatuh tempo sebelum)\s+(\d{1,2} [A-Za-z]{3,} \d{4})/i)),
    blAwb: awb.map((a) => a.awb).join("/"),
    expenseType: "Freight",
    // Ditagih ke penerima (DDI) = kiriman masuk
    transactionType: /Bill To\s+Consignee/i.test(teks) ? "Air Import" : /Bill To\s+Shipper/i.test(teks) ? "Air Export" : "",
    currency: "IDR",
    lines,
    totalInvoice: grand,
  };
}

const danaTambahHari = (iso, n) => {
  if (!iso || !n) return "";
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(n));
  return d.toISOString().slice(0, 10);
};

/* DHL Express REGULAR INVOICE. Halaman rincian per AWB berisi BARIS DHL:
     baris 1: berat, jumlah koli, Standard Charge, diskon "d", PPN "A", total
     baris berikutnya: diskon "d", biaya tambahan (FUEL SURCHARGE, ...), PPN, total
   PPN DHL dihitung PER BARIS DHL (biaya dikurangi diskonnya), jadi biaya &
   diskon satu baris DHL satu grupPpn. */
function bacaInvoiceDhlExpress(teks) {
  const isi = String(teks);
  const ambil = (re) => (isi.match(re) || [])[1] || "";
  // Nama lengkap biaya tambahan dari "Analysis of Extra Charges" (di rincian bisa terpotong baris)
  const namaPanjang = [...isi.matchAll(/^([A-Z][A-Z -]+[A-Z])\s+[\d,]+(?:\s|$)/gm)].map((m) => m[1].trim());
  const lengkapi = (nama) => {
    const dasar = nama.replace(/\s*-\s*$/, "").trim();
    return namaPanjang.find((n) => n.startsWith(dasar) && n.length > dasar.length) || dasar;
  };
  const judulKata = (x) => x.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const lines = [];
  const awbList = [];
  let awb = null;
  let n = 0;
  isi.split(/\r?\n/).forEach((l) => {
    let m = l.match(/^(\d{10})\s+\d{2}-\d{2}-\d{4}\b/);
    if (m) {
      awb = { no: m[1] };
      awbList.push(awb);
      n = 0;
    }
    if (!awb) return;
    const akhir = l.match(/([\d,]+)\s+A\s+([\d,]+)\s*$/); // PPN "A" & total baris DHL
    if (!akhir) return;
    const diskon = l.match(/(-[\d,]+)\s*d\b/);
    let nama = "";
    let nilai = 0;
    // Baris pertama tiap AWB: berat, kode, koli, Standard Charge
    m = l.match(/\d+\.\d+\s+[A-Z]\s+\d+\s+([\d,]+)\s/);
    if (m && n === 0) {
      nama = "Standard Charge";
      nilai = danaAngka(m[1]);
    } else {
      m = l.match(/([A-Z][A-Z ]*[A-Z](?:\s*-)?)\s+([\d,]+)\s+[\d,]+\s+A\s+[\d,]+\s*$/);
      if (!m) return;
      nama = judulKata(lengkapi(m[1]));
      nilai = danaAngka(m[2]);
    }
    n += 1;
    const grup = `${awb.no}#${n}`;
    // awb: baris langsung tertaut ke kirimannya (tagihan per BL/AWB, fund-lines.js)
    lines.push({ desc: nama, amount: String(Math.round(nilai)), ppnRate: 1.1, grupPpn: grup, awb: awb.no });
    if (diskon) {
      lines.push({ jenis: "diskon", discType: "rp", desc: "Discount", amount: String(Math.abs(danaAngka(diskon[1]))), ppnRate: 1.1, grupPpn: grup, awb: awb.no });
    }
  });
  lines.forEach((x) => (x.desc += danaAkhiranAwb(awbList.length, x.awb)));
  const tarif = parseFloat(ambil(/Taxable\s+([\d.]+)%/)) || 1.1;
  lines.forEach((x) => (x.ppnRate = danaTarifPpn(tarif, 100) || x.ppnRate));
  const tanggal = danaTanggalIso(ambil(/Invoice Date:\s*(\d{2}-\d{2}-\d{4})/));
  return {
    sumber: "DHL",
    payee: "DHL",
    invoiceNo: ambil(/Invoice Number:\s*([A-Z0-9]+)/),
    invoiceDate: tanggal,
    invoiceDueDate: danaTambahHari(tanggal, ambil(/Payment due in (\d+) days/i)),
    blAwb: awbList.map((a) => a.no).join("/"),
    expenseType: "Freight",
    transactionType: /OUTBOUND/i.test(isi) ? "Air Export" : "Air Import",
    currency: "IDR",
    lines,
    totalInvoice: danaAngka(ambil(/Total Amount \(IDR\)\s+[\d,]+\s+[\d,]+\s+([\d,]+)/)),
  };
}

/* DHL INBOUND CHARGES INVOICE (biaya kepabeanan / pengurusan saat tiba):
   baris Billing Details "Uraian | Amount Excl VAT | VAT | Amount Incl VAT". */
function bacaInvoiceDhlCharges(teks) {
  const isi = String(teks);
  const ambil = (re) => (isi.match(re) || [])[1] || "";
  const baris = isi.split(/\r?\n/);
  const awal = baris.findIndex((l) => /Amount Excl VAT/i.test(l));
  const rincian = [];
  for (let i = awal + 1; awal >= 0 && i < baris.length; i++) {
    const l = baris[i].trim();
    if (/^Sub-?Total|Please Pay/i.test(l)) break;
    let m = l.match(/^(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/);
    if (m) rincian.push({ desc: m[1].trim(), amount: danaAngka(m[2]), ppn: danaAngka(m[3]) });
    else if ((m = l.match(/^(.+?)\s+([\d,]+)\s+([\d,]+)\s*$/)) && danaAngka(m[2]) === danaAngka(m[3])) {
      rincian.push({ desc: m[1].trim(), amount: danaAngka(m[2]), ppn: 0 });
    }
  }
  return {
    sumber: "DHL",
    payee: "DHL",
    invoiceNo: ambil(/Invoice Number\s*:\s*([A-Z0-9]+)/),
    invoiceDate: danaTanggalIso(ambil(/(?<!Due )Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/), "dmy"),
    invoiceDueDate: danaTanggalIso(ambil(/Payment Due Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/), "dmy"),
    blAwb: ambil(/HWB Number\s*:\s*(\d+)/),
    expenseType: danaJenisInvoice(rincian),
    transactionType: /OUTBOUND/i.test(isi) ? "Air Export" : "Air Import",
    currency: "IDR",
    lines: rincian.map((r) => ({ desc: r.desc, amount: String(Math.round(r.amount)), ppnRate: danaTarifPpn(r.ppn, r.amount) })),
    totalInvoice: danaAngka(ambil(/Please Pay This Amount:\s*IDR\s*([\d,]+)/)),
  };
}

/* BILLING DJBC: struk billing pembayaran bea & pajak impor.
   Akun dipetakan ke isian Billing di form: Bea Masuk -> feeBm, PPN Impor
   -> feePpn, PPh Impor -> feePph. Akun lain (PPnBM, denda, cukai, ...)
   tidak punya isian -- dicatat di `akunLain` supaya pengguna diingatkan. */
function bacaBillingDjbc(teks) {
  const isi = String(teks);
  const ambil = (re) => (isi.match(re) || [])[1] || "";
  const fee = { feeBm: 0, feePpn: 0, feePph: 0 };
  const akunLain = [];
  isi.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^(\d{6})\s*-\s*(.+?)\s+[\d/]{10,}\s+([\d,.]+)\s*$/);
    if (!m) return;
    const nama = m[2].trim();
    const nilai = danaAngka(m[3]);
    if (/Bea Masuk/i.test(nama)) fee.feeBm += nilai;
    else if (/^PPN\b/i.test(nama)) fee.feePpn += nilai;
    else if (/^PPh/i.test(nama)) fee.feePph += nilai;
    else akunLain.push({ nama: `${m[1]} - ${nama}`, nilai });
  });
  const kantor = (ambil(/Kantor\s*:\s*([^\n]+(?:\n(?![A-Z][a-z]+\s*:)[^\n]+)?)/) || "").replace(/\s+/g, " ");
  // Kantor pelabuhan laut / bandara -> jenis transaksi impor
  const transaksi = /PRIOK|TANJUNG|PELABUHAN|BELAWAN|EMAS|PERAK|MERAK/i.test(kantor) ? "Sea Import"
    : /SOEKARNO|HATTA|BANDARA|UDARA/i.test(kantor) ? "Air Import" : "";
  return {
    sumber: "DJBC",
    jenisDokumen: "billing",
    payee: "KAS NEGARA",
    billingNo: ambil(/Nomor Billing\s*:?\s*(\d{10,})/),
    noAju: ambil(/Nomor\s*:\s*([A-Z0-9]{20,})/),
    invoiceNo: "",
    invoiceDate: danaTanggalIso(ambil(/^Tanggal\s*:\s*([^\n]+)/m)),
    invoiceDueDate: danaTanggalIso(ambil(/Tgl Jt Tempo\s*:\s*([^\n]+)/)),
    blAwb: "",
    expenseType: "Billing",
    transactionType: transaksi,
    currency: "IDR",
    fee,
    akunLain,
    lines: [],
    totalInvoice: danaAngka(ambil(/Total\s*:\s*Rp\.?\s*([\d,.]+)/)),
  };
}

/* Nomor B/L / AWB invoice forwarder. Nilainya = rangkaian kata KAPITAL / angka
   sesudah labelnya, berhenti di label kolom sebelahnya -- kata berhuruf besar-
   kecil ("Chargeable Weight", "Carrier") atau label kapital CBM / ETD / ETA --
   karena nomor B/L sendiri bisa berspasi ("WLS O260 9882 6"). Titik dua
   sesudah label tidak diwajibkan: hasil OCR sering kehilangannya ("Chargeable
   Weight 170.00 KG", "CBM 1 3.3540"). Dulu daftar labelnya tetap, jadi "AWB No. :
   160 1981 5294 Chargeable Weight : 300.00 KG" terbaca "16019815294Chargeable".
   AWB IATA (11 angka) ditulis baku: "160-19815294". */
function danaNomorBlTabel(teks) {
  // garis miring "B/L" pada hasil OCR kerap terbaca huruf / angka tipis: "BIL", "BlL", "B1L", "B|L"
  const m = String(teks || "").match(/\b(B[\/Il1|]L|BL|AWB|MAWB|HAWB)\s*(?:(?:No\.?|Number)\s*:?|:)\s*(.+)$/m);
  if (!m) return "";
  const kata = [];
  for (const k of m[2].trim().split(/\s+/)) {
    if (/^(?:CBM|ETD|ETA|KGS?)$/.test(k) || /^[A-Z][a-z]{3,}:?$/.test(k)) break;
    kata.push(k);
  }
  const nomor = danaRapatBl(kata.join(" "));
  return /AWB/.test(m[1]) && /^\d{11}$/.test(nomor) ? nomor.replace(/^(\d{3})(\d{8})$/, "$1-$2") : nomor;
}

/* ------------------------------------------------------------------
   TABEL FORWARDER (WIDE dan sejenisnya) -- teks PDF digital ATAU hasil OCR

   Kepala tabel pada scan sering berlatar abu-abu bertekstur; hasil OCR-nya
   sampah ("- ED Desctip - ) aol Qty. . Rate."), padahal barisnya terbaca
   sempurna. Maka kepala tidak lagi diwajibkan: baris rincian dikenali dari
   BENTUKNYA sendiri -- Uraian | Qty | kode mata uang | Rate | angka-angka.
------------------------------------------------------------------ */

/* Kepala tabel (hanya penanda awal; boleh tidak terbaca): sedikitnya 3 kata kuncinya */
const danaKepalaTabel = (l) =>
  [/Descrip/i, /\bQty\b/i, /\bCURR?\b/i, /\bRate\b/i, /Amount/i, /\bVAT\b/i, /\bPPH\b/i, /\bTotal\s*\(/i].filter((re) => re.test(String(l || ""))).length >= 3;

/* Baris SUB TOTAL / TOTAL; noda OCR di depannya (". TOTAL") diabaikan */
const DANA_RE_SUBTOTAL = /^[^A-Za-z0-9]{0,3}SUB\s*-?\s*TOTAL\b/i;
const DANA_RE_TOTAL = /^[^A-Za-z0-9]{0,3}(?:GRAND\s+)?TOTAL\b/i;

/* Satu baris rincian -> { uraian, qty, mata, rate, token } atau null. Kode mata uang
   yang rusak hasil OCR ("lDR", "1DR") dipulihkan. Letak "Qty KODE Rate" yang pertama
   dengan kode mata uang yang sah dipakai -- angka + 3 huruf di dalam uraian
   ("Lift Off 2 X20 1.000 IDR ...") bukan kolomnya. */
function danaBarisTabel(l) {
  const s = String(l || "");
  const re = /\s(\d[\d,.]*)\s+([A-Za-z0-9|]{3})\.?\s+(\d[\d,.]*)\s+(?=\S)/g;
  let m;
  while ((m = re.exec(s))) {
    const mata = danaMataUangBaris(m[2]);
    const uraian = s.slice(0, m.index).trim();
    if (mata && uraian) {
      const token = s.slice(re.lastIndex).match(/\(?-?\d[\d,.]*\)?/g) || [];
      return token.length ? { uraian, qty: danaAngka(m[1]), mata, rate: danaAngka(m[3]), token } : null;
    }
    re.lastIndex = m.index + 1;
  }
  /* Kode mata uang hilang dari hasil baca ("Agency Fee 1.000 400,000.00 400,000 ..."):
     Qty berdesimal tiga lalu Rate berdesimal dua tetap bentuk kolom tabel ini. Amount
     selalu kolom rupiah, jadi bacaannya sama dengan baris ber-IDR. */
  const tanpaKode = s.match(/^(.*?[A-Za-z)].*?)\s(\d{1,3}[.,]\d{3})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(?=\d)/);
  if (tanpaKode) {
    const token = s.slice(tanpaKode[0].length).match(/\(?-?\d[\d,.]*\)?/g) || [];
    if (token.length) return { uraian: tanpaKode[1].trim(), qty: danaAngka(tanpaKode[2]), mata: "IDR", rate: danaAngka(tanpaKode[3]), token };
  }
  return null;
}

/* Uraian panjang yang terpotong ke baris berikutnya: kata-kata sungguhan, bukan
   sisa garis / noda OCR ("D", ". -", "a ow mu A)") */
function danaLanjutanUraian(l) {
  const s = String(l || "").trim();
  if (s.length < 3 || s.length > 60 || /\d{1,3},\d{3}/.test(s) || !/^[A-Za-z(]/.test(s) || /[^A-Za-z0-9 &().,\/'-]/.test(s) || !/[AEIOUaeiou]/.test(s)) return false;
  const kata = s.split(/\s+/);
  return kata.filter((k) => k.replace(/[^A-Za-z]/g, "").length >= 3).length * 2 >= kata.length;
}

/* Nilai yang MUNGKIN dari satu angka. Pada scan, koma ribuan kerap terbaca titik:
   "7.000" bisa 7 atau 7.000 -- satu titik diikuti tepat tiga angka itu ambigu, dan
   hitungan barisnya yang memutuskan. Bentuk lain hanya satu tafsiran (danaAngka). */
function danaTafsirAngka(tok) {
  const s = String(tok || "").trim();
  const m = /^(\(?-?)(\d{1,3})\.(\d{3})(\)?)$/.exec(s);
  return m ? [danaAngka(s), danaAngka(`${m[1]}${m[2]}${m[3]}${m[4]}`)] : [danaAngka(s)];
}

/* Angka-angka sesudah Rate. Kolom yang kosong tidak tercetak:
     4 angka  Amount, VAT, PPH 23, Total   (Amount + VAT - PPH = Total)
     3 angka  Amount, VAT, Total  atau  Amount, PPH 23, Total
     2 angka  Amount, Total
   Dari semua tafsiran angka yang ambigu dipilih yang hitungannya benar (selisih
   pembulatan <= 1); Qty x Rate = Amount menguatkan bila beberapa sama-sama benar.
   Tidak ada yang benar -> tafsiran biasa, `cocok` false. */
function danaAngkaBarisTabel(token, qty, rate) {
  let kombinasi = [[]];
  token.map(danaTafsirAngka).forEach((c) => { kombinasi = kombinasi.flatMap((k) => c.map((v) => k.concat([v]))).slice(0, 64); });
  const urai = (a) => {
    const n = a.length, total = a[n - 1];
    if (n >= 4) return { amount: a[0], ppn: a[1], pph: a[2], total, cocok: Math.abs(a[0] + a[1] - a[2] - total) <= 1 };
    if (n === 3) {
      if (Math.abs(a[0] + a[1] - total) <= 1) return { amount: a[0], ppn: a[1], pph: 0, total, cocok: true };
      if (Math.abs(a[0] - a[1] - total) <= 1) return { amount: a[0], ppn: 0, pph: a[1], total, cocok: true };
      return { amount: a[0], ppn: 0, pph: 0, total, cocok: false };
    }
    return { amount: a[0], ppn: 0, pph: 0, total, cocok: n === 1 || Math.abs(a[0] - total) <= 1 };
  };
  const hasil = kombinasi.map(urai);
  const kali = qty > 0 && rate > 0 ? Math.round(qty * rate * 100) / 100 : 0;
  const pilih = hasil.find((h) => h.cocok && kali && Math.abs(h.amount - kali) <= 1) || hasil.find((h) => h.cocok);
  if (pilih) return pilih;
  /* Tak ada tafsiran yang benar, tetapi Qty x Rate membuat hitungan baris benar: kolom
     Rate dan kolom Total (+ VAT / PPh) saling menguatkan, hanya Amount yang salah baca
     ("5,556,443.00 5,656,443 5,556,443") -> Amount = Qty x Rate, dicatat `pulih`.
     Bila Rate ikut salah (sama dengan Amount yang salah), tidak ada yang ditebak. */
  if (kali && token.length >= 2) {
    const coba = kombinasi.map((a) => urai([kali].concat(a.slice(1)))).find((h) => h.cocok);
    if (coba && Math.abs(coba.amount - hasil[0].amount) > 1) return Object.assign(coba, { dariAmount: hasil[0].amount });
  }
  return hasil[0];
}

/* Baris SUB TOTAL / TOTAL -> { dpp, ppn, pph, total, angka, sendiri }. `sendiri` = baris itu
   tidak bertentangan dengan dirinya (Amount + VAT - PPH = Total). Total invoice
   forwarder dibulatkan KE ATAS sekali dari PPh 23 yang tepat (fund-lines.js), jadi
   bisa 1 rupiah di atas Amount + VAT - PPH yang tertulis -- itu masih "sendiri". */
function danaAngkaTotalTabel(l) {
  const token = (String(l || "").replace(/^[^A-Za-z0-9]*(?:SUB\s*-?\s*|GRAND\s+)?TOTAL\b/i, "").match(/\d[\d,.]*\d|\d/g) || []);
  let kombinasi = [[]];
  token.map(danaTafsirAngka).forEach((c) => { kombinasi = kombinasi.flatMap((k) => c.map((v) => k.concat([v]))).slice(0, 64); });
  const urai = (a) => {
    const n = a.length;
    if (n >= 4) return { dpp: a[0], ppn: a[1], pph: a[2], total: a[n - 1], angka: a, sendiri: Math.abs(a[0] + a[1] - a[2] - a[n - 1]) <= 1 };
    if (n === 3 && Math.abs(a[0] - a[1] - a[2]) <= 1) return { dpp: a[0], ppn: 0, pph: a[1], total: a[2], angka: a, sendiri: true };
    if (n === 3) return { dpp: a[0], ppn: a[1], pph: 0, total: a[2], angka: a, sendiri: Math.abs(a[0] + a[1] - a[2]) <= 1 };
    return { dpp: a[0] || 0, ppn: 0, pph: 0, total: n ? a[n - 1] : 0, angka: a, sendiri: n >= 2 && Math.abs(a[0] - a[n - 1]) <= 1 };
  };
  const hasil = kombinasi.map(urai);
  return hasil.find((h) => h.sendiri) || hasil[0];
}

/* Nomor invoice di samping labelnya. Hasil OCR: label rusak ("Involce", "lnvoice"),
   titik dua terbaca "1" / ";" / "i", dan nomor terpenggal spasi ("IN-WL 2611-00016").
   Potongan yang belum memuat angka, atau berujung / berawalan pemisah, disambung
   dengan potongan berikutnya. Nomor WIDE dirapikan ke bentuk bakunya IN-WL<TTBB>-<urut>
   (O/I/l/S/B di bagian angka = 0/1/1/5/8). */
function danaNomorInvoiceLabel(teks) {
  for (const m of String(teks || "").matchAll(/(?:^|[^A-Za-z])[Il1|]n[vy]o[il1|!]?c[ea][ \t]*(?:No\b\.?|Number\b|Nbr\b\.?)[ \t]*([^\n]*)/gi)) {
    const kata = m[1].trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < kata.length && /^[:;.,|!1lIi]$/.test(kata[i])) i++;
    let nomor = "";
    for (; i < kata.length && nomor.length < 30; i++) {
      const k = kata[i].replace(/^[:;]+/, "");
      if (!/^[A-Za-z0-9\/.\-|]+$/.test(k) || (!nomor && /^[\/.\-]/.test(k))) break;
      if (nomor && /\d/.test(nomor) && !/[\/.\-]$/.test(nomor) && !/^[\/.\-]/.test(k)) break;
      nomor += k;
    }
    nomor = nomor.replace(/[.\/-]+$/, "");
    const wide = /^IN-?WL-?([0-9OoIlSB]{4})-?([0-9OoIlSB]{5})$/i.exec(nomor);
    if (wide) {
      const angka = (x) => x.replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
      return `IN-WL${angka(wide[1])}-${angka(wide[2])}`;
    }
    if (/\d/.test(nomor)) return nomor;
  }
  return "";
}

/* Tanggal di samping label ("Invoice Date", "Due Date"); label OCR yang rusak
   ("Involce Date") & titik dua yang hilang dimaafkan */
function danaTanggalLabel(teks, reLabel) {
  const m = String(teks || "").match(new RegExp(`${reLabel.source}[ \\t]*[:;.]?[ \\t]*([^\\n]+?)(?:\\s{2,}|$)`, "im"));
  return m ? danaTanggalIso(m[1]) : "";
}

/* Jenis transaksi invoice forwarder: "Shipment Type : Sea Import". Hasil OCR merekatkan /
   merusaknya ("Sealmport", "Sea |mport"); bagian yang tak terbaca sama sekali diambil dari
   label dokumennya: B/L / Port of Loading = laut, AWB / Chargeable Weight = udara;
   Arrive Date = impor, Onboard Date = ekspor (format WIDE). */
function danaJenisKirimanTabel(teks) {
  const isi = String(teks || "");
  const nilai = (isi.match(/Sh[il1|]pment[ \t]*Typ[eo][ \t]*[:;.]?[ \t]*([^\n]*)/i) || [])[1] || "";
  const inti = nilai.toUpperCase().replace(/[|!1]/g, "I").replace(/0/g, "O").replace(/[^A-Z]+/g, " ");
  let moda = (inti.match(/\b(SEA|AIR)/) || [])[1] || "";
  let arah = /\b(?:SEA|AIR)?\s*[IL]?MPORT/.test(inti) ? "Import" : /\b(?:SEA|AIR)?\s*E?XPORT/.test(inti) ? "Export" : "";
  if (!moda) {
    const laut = /\bB\/L\s*No\b|Port\s*of\s*Loading|Port\s*of\s*Discharge|\bCBM\b/i.test(isi), udara = /\bAWB\s*No\b|Chargeable\s*Weight|Flight\s*No/i.test(isi);
    moda = laut !== udara ? (laut ? "SEA" : "AIR") : "";
  }
  if (!arah) {
    const masuk = /\bArr?[il1|]v[ae]\s*Date\b/i.test(isi), keluar = /\bOnboard\s*Date\b/i.test(isi);
    arah = masuk !== keluar ? (masuk ? "Import" : "Export") : "";
  }
  return moda && arah ? `${moda === "SEA" ? "Sea" : "Air"} ${arah}` : "";
}

/* Tabel forwarder: Description | Qty | CURR | Rate | Amount | VAT | PPH 23 | Total */
function bacaInvoiceTabel(teks) {
  const baris = String(teks).split(/\r?\n/);
  const awal = baris.findIndex(danaKepalaTabel);
  const rincian = [];
  const pulihBaris = [];
  for (let i = awal + 1; i < baris.length; i++) {
    const l = baris[i].trim();
    // SUB TOTAL / TOTAL menutup tabel -- tanpa kepala, hanya sesudah baris rincian pertama
    if ((DANA_RE_SUBTOTAL.test(l) || DANA_RE_TOTAL.test(l)) && (rincian.length || awal >= 0)) break;
    const r = danaBarisTabel(l);
    if (!r) {
      if (rincian.length && danaLanjutanUraian(l)) rincian[rincian.length - 1].desc += " " + l;
      continue;
    }
    const a = danaAngkaBarisTabel(r.token, r.qty, r.rate);
    rincian.push({ desc: danaRapikanUraian(r.uraian), amount: a.amount, ppn: a.ppn });
    if (a.dariAmount != null) pulihBaris.push({ uraian: rincian[rincian.length - 1].desc, dari: a.dariAmount, ke: a.amount, alasan: "baris" });
  }
  const jenis = danaJenisInvoice(rincian);
  /* Baris TOTAL: Amount | VAT | PPH 23 | Total. Empat angka -> invoice sudah memotong
     PPh 23 (angka ketiga); total akhirnya angka terakhir. SUB TOTAL & TOTAL memuat
     angka yang sama -- dua pembacaan: yang tidak bertentangan dengan dirinya dipakai
     ("TOTAL 9,604,184 ..." salah baca satu digit, "SUB TOTAL 9,694,184 ..." benar). */
  const totalBaris = baris.find((l) => DANA_RE_TOTAL.test(l.trim()) && !DANA_RE_SUBTOTAL.test(l.trim()));
  const subBaris = baris.find((l) => DANA_RE_SUBTOTAL.test(l.trim()));
  const tTotal = totalBaris ? danaAngkaTotalTabel(totalBaris) : null;
  const tSub = subBaris ? danaAngkaTotalTabel(subBaris) : null;
  const jumlahAkhir = [tTotal, tSub].find((x) => x && x.sendiri && x.angka.length >= 2) || tTotal || tSub;
  const angkaTotal = jumlahAkhir ? jumlahAkhir.angka : [];
  const pphInvoice = jumlahAkhir ? jumlahAkhir.pph : 0;
  /* Baris TOTAL yang tidak bertentangan dengan dirinya (Amount + VAT - PPH = Total)
     = dua pembacaan yang saling menguatkan; jumlah baris harus sama dengan Amount-nya. */
  const pulih = pulihBaris.slice();
  if (rincian.length && angkaTotal.length >= 2 && jumlahAkhir.sendiri) {
    const r = danaPulihJumlahBaris(rincian.map((x) => x.amount), jumlahAkhir.dpp);
    if (r) {
      pulih.push({ uraian: rincian[r.i].desc, dari: r.dari, ke: r.ke });
      rincian[r.i].amount = r.ke;
    }
  }
  return {
    sumber: "Tabel",
    pulih,
    invoiceNo: danaNomorInvoiceLabel(teks),
    invoiceDate: danaTanggalLabel(teks, /[Il1|]n[vy]o[il1|!]?c[ea][ \t]*Dat[ea]/) ||
      // label "Invoice" terpisah dari "Date" (OCR merangkai "45193 Date : 05 November 2026")
      danaTanggalIso((String(teks).match(/(?:^|[^A-Za-z\s]\s*)\bDate\s*[:;]\s*(\d{1,2}\s*-?\s*[A-Za-z]{3,}\.?\s*-?\s*\d{4})/m) || [])[1] || ""),
    invoiceDueDate: danaTanggalLabel(teks, /Due[ \t]*Dat[ea]/),
    blAwb: danaNomorBlTabel(teks),
    expenseType: jenis,
    transactionType: danaJenisKirimanTabel(teks),
    currency: "IDR",
    lines: rincian.map((r) => ({ desc: r.desc, amount: String(Math.round(r.amount)), ppnRate: danaTarifPpn(r.ppn, r.amount) })),
    totalInvoice: jumlahAkhir ? jumlahAkhir.total : 0,
    pphInvoice,
  };
}

/* ------------------------------------------------------------------
   HASIL OCR
   Teks hasil OCR (js/import/ocr.js) masuk ke pembaca yang SAMA dengan teks PDF
   digital, tetapi hurufnya kadang tertukar ("I" jadi "l", "O" jadi "0"), kepala
   tabel terpotong, judul diberi coretan. Yang dipulihkan di sini HANYA yang
   bentuknya sudah pasti, supaya tebakan tidak pernah menimpa isi dokumen yang
   benar; selebihnya diserahkan ke pemeriksaan jumlah (h.cocok).
------------------------------------------------------------------ */

/* "P.1.B Charge" -> "P.I.B Charge" (singkatan bertitik: angka 1 di antara huruf);
   P.I.B yang "I"-nya hilang / jadi huruf lain ("P..B", "P.l.B", "P.L.B") -> "P.I.B";
   kode biaya "7B FEE" -> "ZB FEE" (Z dibaca 7 pada scan); noda tanda baca lepas di
   ujung uraian hasil OCR ("Insurance Fee :") dibuang -- kurung tutup tetap */
const danaRapikanUraian = (d) => String(d || "")
  .replace(/\b([A-Z])\.1\.([A-Z])\b/g, "$1.I.$2")
  .replace(/\bP\s?[.,]\s?[lLI|!]?\s?[.,]\s?B\b/g, "P.I.B")
  .replace(/^7([A-Z])(?=\s|$)/, "Z$1")
  .replace(/(?:\s+[:;.,'"`~_|\-—–=*•·]{1,2})+\s*$/, "")
  .replace(/\s+/g, " ").trim();

/* Nomor invoice Prime = 2 huruf + 7 angka (jenis + tahun-bulan + urut):
   "AI2602950", "AO2607101". Hasil OCR: "Al2602950", "A02606744". */
function danaPulihNoPrime(kode) {
  const asal = String(kode || "");
  const m = asal.match(/^([A-Za-z0-9|]{2})([0-9OoIl|SsBZG]{7})$/);
  if (!m) return asal;
  const jadiHuruf = { 0: "O", 1: "I", l: "I", "|": "I", 5: "S", 8: "B", 2: "Z" };
  const jadiAngka = { O: "0", o: "0", I: "1", l: "1", "|": "1", S: "5", s: "5", B: "8", Z: "2", G: "6" };
  const awalan = m[1].split("").map((c) => (jadiHuruf[c] || c).toUpperCase()).join("");
  const angka = m[2].split("").map((c) => jadiAngka[c] || c).join("");
  return /^[A-Z]{2}$/.test(awalan) && /^\d{7}$/.test(angka) ? awalan + angka : asal;
}

/* HAWB Prime = huruf kantor + angka ("PFIJKT006824"): "O" / "I" / "l" di EKOR angka
   ("PFIJKTO06787") hanyalah angka 0 / 1 yang salah baca. */
function danaPulihHawb(kode) {
  const asal = String(kode || "");
  const m = asal.match(/^([A-Z]{3,6})([0-9OIl|]{5,7})$/);
  if (!m || !/\d/.test(m[2])) return asal;
  return m[1] + m[2].replace(/O/g, "0").replace(/[Il|]/g, "1");
}

/* Kepala tabel Prime: DESCRIPTION CUR RATE AMT (CUR) AMOUNT (IDR) VAT. Hasil OCR
   sering merusak sebagian ("DESCRIPTIO", "AMOUN IDR)", "cur"), jadi sebuah baris
   dianggap kepala bila memuat sedikitnya 3 dari 4 kata kuncinya. */
function danaKepalaPrime(baris) {
  const l = String(baris || "");
  return [/\bDESCRIPTI?O?N?\b/i, /\bCUR\b/i, /\bRATE\b/i, /\bAMT\b|\bAMOUN?T?\b/i].filter((re) => re.test(l)).length >= 3;
}

/* Cetakan Prime: kepala tabel (atau, bila hilang dari hasil OCR, nama perusahaan +
   INCOTERMS + SUB TOTAL) dan nomor invoice. */
function danaAdalahPrime(isi) {
  if (!/INVOICE\s*NO\b/i.test(isi)) return false;
  if (String(isi).split(/\r?\n/).some(danaKepalaPrime)) return true;
  return /PRIME/i.test(isi) && /FREIGHT/i.test(isi) && /\bINCOTERMS\b/i.test(isi) && /SUB\s*TOTAL/i.test(isi);
}

/* Judul lembar: "INVOICE" / "DEBIT NOTE" / "CREDIT NOTE" berdiri sendiri di bagian
   atas. Coretan OCR di tepinya ("i INVOICE .", "DEBIT NOTE :") diabaikan. Judul yang
   tak terbaca sama sekali: kata "debit note" di bagian atas, lalu REMARK
   "REIMBURSEMENT" (isi khas debit note Prime) -- selain itu dianggap invoice. */
function danaJudulLembar(isi) {
  const atas = String(isi || "").split(/\r?\n/).slice(0, 30);
  for (const l of atas) {
    const inti = l.replace(/[^A-Za-z]+/g, " ").trim();
    const m = inti.match(/^(?:[A-Za-z]{1,2}\s+)?(INVOICE|DEBIT NOTE|CREDIT NOTE)(?:\s+(?!NO\b|TO\b)[A-Za-z]{1,2})?$/i);
    if (m) return m[1].toUpperCase();
  }
  if (/DEBIT\s*NOTE/i.test(atas.join("\n"))) return "DEBIT NOTE";
  return /REIMBURS/i.test(isi) ? "DEBIT NOTE" : "";
}

/* Mata uang pada baris tabel Prime; "IDR" yang rusak ("lDR", "1DR") dipulihkan, token
   3 huruf lain yang bukan mata uang ("FEE") bukan kode. */
const DANA_MATA_UANG = ["IDR", "USD", "SGD", "EUR", "CNY", "RMB", "JPY", "KRW", "AUD", "MYR", "THB", "HKD", "GBP", "INR", "CHF", "TWD", "VND", "NZD", "CAD", "AED", "SAR", "PHP"];
function danaMataUangBaris(token) {
  const k = String(token || "").toUpperCase();
  if (/^[I1L|][D0O][RK]$/.test(k)) return "IDR";
  return DANA_MATA_UANG.includes(k) ? k : "";
}

/* ------------------------------------------------------------------
   JUMLAH BARIS = SUB TOTAL
   Satu angka baris yang salah baca SATU digit ketahuan dari jumlahnya, dan
   selisihnya menunjuk barisnya: 17,638 yang seharusnya 17,538 membuat jumlah
   baris lebih 100 dari SUB TOTAL, dan hanya baris itu yang bisa dibetulkan 100
   lewat SATU digit yang memang sering tertukar. Diperbaiki hanya bila TEPAT satu
   baris cocok -- dua kemungkinan atau lebih dibiarkan (lalu h.cocok memperingatkan).
------------------------------------------------------------------ */
const DANA_DIGIT_MIRIP = ["06", "08", "09", "17", "27", "38", "49", "56", "58", "68", "89"]; // pasangan yang sering tertukar pada scan

function danaBedaSatuDigit(a, b) {
  const x = Math.abs(a).toFixed(2), y = Math.abs(b).toFixed(2);
  if (x.length !== y.length) return false;
  let beda = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    if (!/\d/.test(x[i]) || !/\d/.test(y[i]) || !DANA_DIGIT_MIRIP.includes([x[i], y[i]].sort().join(""))) return false;
    beda++;
  }
  return beda === 1;
}

function danaPulihJumlahBaris(nilai, subtotal) {
  const selisih = Math.round((nilai.reduce((x, y) => x + y, 0) - subtotal) * 100) / 100;
  if (!nilai.length || !(subtotal > 0) || Math.abs(selisih) < 0.005) return null;
  const calon = [];
  nilai.forEach((n, i) => {
    const ke = Math.round((n - selisih) * 100) / 100;
    if (ke >= 0 && danaBedaSatuDigit(n, ke)) calon.push({ i, dari: n, ke });
  });
  return calon.length === 1 ? calon[0] : null;
}

/* PRIME FREIGHT INDONESIA (cetakan Crystal Reports). INVOICE dan DEBIT NOTE
   satu format; yang membedakan hanya judul lembarnya:

     DEBIT NOTE                      <- judul (atau INVOICE)
     REF NO.   AOR26080219           INVOICE DATE  2026-08-23
     MAWB NO.  12604393060          INVOICE NO.   AO2607102
     HAWB NO.  PFIJKT006824         E.T.D. / E.T.A. ...
     DESCRIPTION  CUR  RATE  AMT (CUR)  AMOUNT (IDR)  VAT
     FREIGHT CHARGE IDR 380,000.00 380,000.00 4,180.00
     FUEL SURCHARGES IDR 1,887.00 16,983.00 186.81     <- RATE x berat
     STORAGE AVATAR IDR 17,538.00 17,538.00            <- tanpa PPN
     SUB TOTAL 8,543,486.00 93,978.35
     TOTAL : (IDR) 0.00 (IDR) 8,637,464.35             <- DPP + PPN

   Kolom yang kosong tidak tercetak, jadi kolomnya dibaca dari URUTAN
   angka: baris IDR = RATE, AMOUNT[, VAT]; mata uang lain = RATE, AMT (CUR),
   AMOUNT (IDR)[, VAT]. Selalu kolom AMOUNT (IDR) yang dipakai, jadi
   pengajuannya IDR walau ada baris berkurs.

   PPN tiap baris vendor ini 2 desimal (186,81 ; 22.571,40) dan tarif barisnya
   dihitung dari PPN / nilai; form menghitung ulang dengan aturan PRIME
   (fund-vendor-aturan.js), jadi jumlahnya sama dengan yang tercetak.

   BL/AWB: nomor HAWB (nomor forwarder, yang juga dipakai menamai berkas);
   MAWB hanya kalau tidak ada HAWB. Keduanya satu kiriman -- mengisi dua
   nomor akan membagi biayanya jadi dua kiriman (fundBagiPerAwb). */
function bacaInvoicePrime(teks) {
  const isi = String(teks);
  const ambil = (re) => (isi.match(re) || [])[1] || "";
  const baris = isi.split(/\r?\n/);
  let awal = baris.findIndex(danaKepalaPrime);
  if (awal < 0) awal = baris.findIndex((l) => /\bINCOTERMS\b/i.test(l)); // kepala tabel hilang dari hasil OCR
  const rincian = [];
  for (let i = awal + 1; awal >= 0 && i < baris.length; i++) {
    // coretan pendek di ujung baris (hasil OCR) dibuang: baris tabel selalu berakhir dengan angka
    const l = baris[i].trim().replace(/(?:\s+[^\d\s]{1,2})+$/, "");
    if (!l || danaKepalaPrime(l)) continue; // kepala tabel yang berulang di halaman berikutnya
    if (/^(SUB\s*TOTAL|TOTAL)\b/i.test(l)) break;
    let uraian, mataUang, deretAngka;
    const m = l.match(/^(.+?)\s+([A-Za-z0-9|]{3})((?:\s+-?[\d,]+(?:\.\d+)?)+)\s*$/);
    if (m && danaMataUangBaris(m[2])) {
      [uraian, mataUang, deretAngka] = [m[1], danaMataUangBaris(m[2]), m[3]];
    } else {
      // kode mata uang hilang dari hasil baca ("DOC FEE 750,000.00 750,000.00 8,250.00"): angka berdesimal, anggap IDR
      const n = l.match(/^(.+?)((?:\s+-?[\d,]+\.\d{2})+)\s*$/);
      if (!n) {
        // Uraian panjang yang terpotong ke baris berikutnya (tanpa angka)
        if (rincian.length && /^[A-Z][A-Z &().,\/-]{2,40}$/.test(l) && /[AEIOU]/.test(l)) rincian[rincian.length - 1].desc += " " + l;
        continue;
      }
      [uraian, mataUang, deretAngka] = [n[1], "IDR", n[2]];
    }
    const angka = deretAngka.trim().split(/\s+/).map(danaAngka);
    const kolomAmount = mataUang === "IDR" ? 1 : 2;
    if (angka.length <= kolomAmount) continue;
    rincian.push({ desc: danaRapikanUraian(uraian.replace(/^[^A-Za-z0-9]+/, "")), amount: angka[kolomAmount], ppn: angka.length > kolomAmount + 1 ? angka[kolomAmount + 1] : 0 });
  }
  const angkaBaris = (re) => {
    const b = baris.find((l) => re.test(l.trim()));
    return b ? (b.match(/-?[\d,]+\.\d{2}/g) || []).map(danaAngka) : [];
  };
  const angkaSub = angkaBaris(/^SUB\s*TOTAL\b/i);
  const angkaTotal = angkaBaris(/^TOTAL\b/i);
  // "TOTAL : (IDR) 0.00 (IDR) 8,637,464.35" -- angka terakhir = total dalam rupiah
  const total = angkaTotal.length ? angkaTotal[angkaTotal.length - 1] : angkaSub.length ? angkaSub.reduce((x, y) => x + y, 0) : 0;
  /* SUB TOTAL (DPP, PPN) yang cocok dengan TOTAL = dua pembacaan yang saling
     menguatkan: jumlah baris harus sama dengan DPP-nya (lihat danaPulihJumlahBaris). */
  const pulih = [];
  if (rincian.length && angkaSub.length && total > 0 && Math.abs(angkaSub[0] + (angkaSub[1] || 0) - total) < 1) {
    const r = danaPulihJumlahBaris(rincian.map((x) => x.amount), angkaSub[0]);
    if (r) {
      pulih.push({ uraian: rincian[r.i].desc, dari: r.dari, ke: r.ke });
      rincian[r.i].amount = r.ke;
    }
  }
  const judul = danaJudulLembar(isi);
  const hawb = danaPulihHawb(ambil(/\bH(?:AWB|BL)\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9-]*)/i));
  const mawb = ambil(/\bM(?:AWB|BL)\s*NO\.?\s*:?\s*([A-Z0-9][A-Z0-9-]*)/i);
  const arah = isi.match(/\((AIR|SEA)\s+(INBOUND|OUTBOUND)\)/i);
  /* Perusahaan: baris kop "PT. PRIME FREIGHT INDONESIA" (juga di tanda tangan). Hasil OCR kadang
     memecah kop besar itu jadi potongan ("PT. PRIME" / "FREIGHT INDONESIA") -- nama terpanjang menang. */
  const kandidat = [...isi.matchAll(/^\s*(PT\.?\s+[A-Z][A-Z0-9 .&-]+?)\s*$/gm)].map((x) => x[1].replace(/\s+/g, " ")).sort((x, y) => y.length - x.length);
  const payee = /PRIME/i.test(isi) && /FREIGHT/i.test(isi) && /INDONESIA/i.test(isi) && !/PRIME FREIGHT INDONESIA/i.test(kandidat[0] || "") ? "PT. PRIME FREIGHT INDONESIA" : kandidat[0] || "";
  // Nilai bulat tetap teks ("380000"); yang berpecahan tetap ANGKA -- teks "1234.5" dibaca gaya Indonesia (parseRupiah)
  const nilaiBaris = (x) => (Number.isInteger(x) ? String(x) : Math.round(x * 100) / 100);
  return {
    sumber: "Prime",
    pulih,
    payee,
    debitNote: /DEBIT\s*NOTE/i.test(judul),
    invoiceNo: danaPulihNoPrime(ambil(/INVOICE\s*NO\.?\s*:?\s*([A-Z0-9|][A-Z0-9|\/.-]*)/i).replace(/[.\/-]+$/, "")),
    invoiceDate: danaTanggalIso(ambil(/INVOICE\s*DATE\s*:?\s*(\d{4}-\d{2}-\d{2})/i)),
    invoiceDueDate: danaTanggalIso(ambil(/DUE\s*DATE\s*:?\s*(\d{4}-\d{2}-\d{2})/i)),
    blAwb: hawb || (/^\d{11}$/.test(mawb) ? mawb.replace(/^(\d{3})(\d{8})$/, "$1-$2") : mawb),
    expenseType: danaJenisInvoice(rincian),
    transactionType: arah ? `${arah[1][0].toUpperCase()}${arah[1].slice(1).toLowerCase()} ${/^IN/i.test(arah[2]) ? "Import" : "Export"}` : "",
    currency: "IDR",
    lines: rincian.map((r) => ({ desc: r.desc, amount: nilaiBaris(r.amount), ppnRate: danaTarifPpn(r.ppn, r.amount) })),
    totalInvoice: total,
    pphInvoice: 0,
  };
}

/* Umum: hanya yang bisa dikenali dengan aman -- satu baris total */
function bacaInvoiceUmum(teks) {
  const ambil = (re) => (String(teks).match(re) || [])[1] || "";
  const totalTeks = [...String(teks).matchAll(/(?:Grand Total|Total Tagihan|Total Amount|Jumlah Tagihan|TOTAL)\s*(?:\(IDR\))?\s*:?\s*(?:Rp\.?|IDR)?\s*([\d.,]{4,})/gi)]
    .map((m) => danaAngka(m[1])).filter((n) => n > 0);
  const total = totalTeks.length ? Math.max(...totalTeks) : 0;
  const nomor = ambil(/(?:Invoice\s*(?:No\.?|Number)|No\.?\s*Invoice|Nomor Invoice)\s*:?\s*([A-Z0-9][A-Z0-9\/.-]{3,})/i);
  return {
    sumber: "Umum",
    invoiceNo: nomor,
    invoiceDate: danaTanggalIso(ambil(/(?:Invoice Date|Tanggal Invoice|Tanggal)\s*:?\s*([^\n]{6,30})/i)),
    invoiceDueDate: danaTanggalIso(ambil(/(?:Due Date|Jatuh Tempo)\s*:?\s*([^\n]{6,30})/i)),
    blAwb: ambil(/(?:B\/L|BL|AWB|Air Waybill)\s*(?:No\.?|Number)?\s*:?\s*([A-Z0-9][A-Z0-9 -]{5,})/i).trim(),
    expenseType: "",
    transactionType: "",
    currency: "IDR",
    lines: total ? [{ desc: `Tagihan ${nomor || "vendor"}`, amount: String(Math.round(total)), ppnRate: 0 }] : [],
    totalInvoice: total,
  };
}

/* ------------------------------------------------------------------
   INVOICE BERTABEL BARANG / JASA -- vendor yang belum punya pembaca sendiri

   Banyak tagihan lokal (surveyor, EMKL, trucking, konsultan) berbentuk sama:
   kepala "No. / Date / Terms / Currency" di kanan atas, tabel "Item |
   Description | Quantity | UOM | U/Price | Total", dan RINGKASAN di kaki --
   Sub Total, VAT / PPN, Total. Dulu tagihan seperti ini jatuh ke pembaca Umum:
   satu baris "Tagihan <nomor>" berisi TOTAL (sudah termasuk PPN) dengan PPN 0,
   tanpa tanggal & vendor.

   Ringkasan yang menjadi jangkarnya: Sub Total + VAT = Total memastikan ketiga
   angka (label & angkanya kerap terpisah baris -- kotak nilai sedikit lebih
   tinggi dari labelnya, dan OCR merangkainya ke kalimat di sebelah). Baris
   tabel dipakai bila jumlahnya sama dengan Sub Total; kalau baris tabel tak
   terbaca utuh (angka terpecah spasi pada scan buruk), satu baris seharga Sub
   Total. Tarif PPN = VAT / Sub Total.

   Tagihan SURVEYOR (LS): rinciannya bukan nama jasa, melainkan nomor-nomor
   verifikasi -- VR No (permintaan verifikasi), Job / VO No, LS No (Laporan
   Surveyor). Uraiannya "Surveyor Fee (LS <nomor>)", dan LS No juga dipakai
   mencari jadwal impornya (dokumen pelengkap LS, danaLengkapiDariJadwal).
------------------------------------------------------------------ */

// Angka uang berpemisah ribuan: "50,000,000.00", "5.500.000,00", "750,000"
const DANA_UANG = String.raw`\(?-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\)?`;
const DANA_RE_UANG_EKOR = new RegExp(`(${DANA_UANG})\\s*$`);
const DANA_RE_UANG_SAJA = new RegExp(`^\\s*(?:Rp\\.?|IDR)?\\s*(${DANA_UANG})\\s*$`, "i");
// Sesudah label ringkasan: tarif "(11%)" / "11 %", titik dua, "Rp" -- lalu angkanya mengakhiri baris
const DANA_RE_SESUDAH_LABEL = new RegExp(`^\\s*(?:\\(?\\s*(\\d{1,2}(?:[.,]\\d{1,2})?)\\s*%\\s*\\)?)?\\s*[:;.]?\\s*(?:Rp\\.?|IDR)?\\s*(${DANA_UANG})\\s*$`, "i");

/* Calon nilai sebuah label ringkasan: [{ teks, tarif, dekat }]. Label diikuti angka di
   baris yang sama ("VAT 5,500,000.00", "... payment date. Total 55,500,000.00") -> dekat 0.
   Label tanpa angka sesudahnya ("Sub Total", "amount Sub Total"): angka di UJUNG baris
   sebelumnya, atau baris sesudahnya yang hanya berisi angka -> dekat 1. Label di tengah
   kalimat ("... before VAT and submit ...", kepala tabel) bukan label ringkasan. */
function danaCalonRingkasan(baris, cari) {
  const calon = [];
  baris.forEach((l, i) => {
    const s = String(l || "");
    for (const m of cari(s)) {
      const sesudah = s.slice(m.index + m[0].length);
      const n = sesudah.match(DANA_RE_SESUDAH_LABEL);
      if (n) {
        calon.push({ teks: n[2], tarif: n[1] ? danaAngka(n[1]) : null, dekat: 0 });
        continue;
      }
      if (/[A-Za-z]{2,}/.test(sesudah)) continue;
      const sebelum = i > 0 ? String(baris[i - 1]).match(DANA_RE_UANG_EKOR) : null;
      if (sebelum) calon.push({ teks: sebelum[1], tarif: null, dekat: 1 });
      const lanjut = i + 1 < baris.length ? String(baris[i + 1]).match(DANA_RE_UANG_SAJA) : null;
      if (lanjut) calon.push({ teks: lanjut[1], tarif: null, dekat: 1 });
    }
  });
  return calon;
}

// Kemunculan label di satu baris (label harus kata utuh; "Total" milik "Sub Total" bukan Total)
const danaCariLabel = (re) => (s) => [...s.matchAll(re)];
const danaCariTotal = (s) => [...s.matchAll(/\b(?:Grand\s*)?Total\b(?:\s*(?:Amount|Tagihan|Invoice|Due))?/gi)].filter((m) => !/Sub\s*-?\s*$/i.test(s.slice(0, m.index)));

/* Ringkasan kaki invoice -> { dpp, ppn, pph, total, tarif, sendiri } atau null.
   Dari semua calon (dan tafsiran angka yang ambigu, danaTafsirAngka) dipilih yang
   Sub Total + VAT - PPh = Total; tidak ada yang cocok -> yang terdekat ke labelnya,
   `sendiri` false. */
function danaRingkasanInvoice(baris) {
  const sub = danaCalonRingkasan(baris, danaCariLabel(/\bSub\s*-?\s*Total\b|\bDPP\b|Dasar\s+Pengenaan\s+Pajak/gi));
  const vat = danaCalonRingkasan(baris, danaCariLabel(/\b(?:VAT|PPN|V\.A\.T\.?)(?=[\s:(]|$)/gi));
  const pph = danaCalonRingkasan(baris, danaCariLabel(/\b(?:PPh|WHT|Withholding\s+Tax)\s*(?:Art\.?\s*|Pasal\s*)?(?:23)?(?=[\s:(]|$)/gi));
  const total = danaCalonRingkasan(baris, danaCariTotal);
  if (!total.length && !sub.length) return null;
  const tafsir = (daftar) => daftar.flatMap((c) => danaTafsirAngka(c.teks).map((v) => ({ v, c })));
  const tTotal = tafsir(total), tSub = tafsir(sub), tVat = tafsir(vat), tPph = tafsir(pph);
  const kosong = { v: 0, c: { dekat: 0, tarif: null } };
  let terbaik = null;
  // jt / js / jv / jp = calon Total / Sub Total / VAT / PPh (nama t & tt milik penerjemah)
  (tTotal.length ? tTotal : [null]).forEach((jt) => (tSub.length ? tSub : [null]).forEach((js) => [kosong].concat(tVat).forEach((jv) => [kosong].concat(tPph).forEach((jp) => {
    if (!jt && !js) return;
    const dpp = js ? js.v : jt.v - jv.v + jp.v;
    const jumlah = jt ? jt.v : dpp + jv.v - jp.v;
    if (!(dpp > 0) || !(jumlah > 0)) return;
    const sendiri = !!(jt && js) && Math.abs(dpp + jv.v - jp.v - jumlah) <= 1;
    const skor = (sendiri ? 1000 : 0) + (jv.v ? 10 : 0) - [jt, js, jv === kosong ? null : jv, jp === kosong ? null : jp].reduce((x, a) => x + (a ? a.c.dekat : 0), 0);
    if (!terbaik || skor > terbaik.skor) terbaik = { skor, dpp, ppn: jv.v, pph: jp.v, total: jumlah, tarif: jv.c.tarif, sendiri };
  }))));
  return terbaik;
}

/* Satu baris tabel: [No] Uraian Qty [Satuan] Harga Jumlah. Dua angka uang terakhir =
   harga satuan & jumlah; Qty x Harga = Jumlah memastikan ("1.000" = 1 berdesimal tiga,
   "2" = 2). Tanpa Qty / Satuan: Harga = Jumlah (qty 1). */
function danaBarisBarang(l) {
  const s = String(l || "").trim();
  const uang = String.raw`\(?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\)?`;
  const m = s.match(new RegExp(String.raw`^(.*?[A-Za-z].*?)\s+(?:(\d{1,4}(?:[.,]\d{1,3})?)\s+(?:([A-Za-z][A-Za-z.\/]{0,7})\s+)?)?(${uang})\s+(${uang})$`));
  if (!m) return null;
  const harga = danaAngka(m[4]), jumlah = danaAngka(m[5]);
  if (!(jumlah > 0)) return null;
  const qtyCalon = m[2] ? danaTafsirAngka(m[2]).concat(/^\d+[.,]\d{3}$/.test(m[2]) ? [danaAngka(m[2].replace(/[.,]\d{3}$/, ""))] : []) : [1];
  const qty = qtyCalon.find((q) => q > 0 && Math.abs(q * harga - jumlah) <= Math.max(1, jumlah * 0.0005));
  if (qty == null) return null;
  const uraian = m[1].replace(/^\s*\d{1,3}[.)]?\s+(?=\S)/, "").trim();
  return uraian ? { uraian, qty, satuan: m[3] || "", harga, jumlah } : null;
}

/* Kepala tabel barang / jasa: sedikitnya tiga kata kuncinya */
const danaKepalaBarang = (l) =>
  [/\bItem\b|\bNo\b/i, /Descrip|Uraian|Keterangan|Particular/i, /\bQ(?:ty|uantity)\b|Kuantitas|\bJml\b/i, /\bUOM\b|\bUnit\b|Satuan/i, /U\s*\/\s*Price|Unit\s*Price|\bPrice\b|Harga|\bRate\b/i, /\bTotal\b|\bAmount\b|\bJumlah\b/i]
    .filter((re) => re.test(String(l || ""))).length >= 3;

/* Nomor di samping label surveyor ("VR No : TB21G2549"); sisa titik dua hasil OCR ("1",
   "i", "|", ";") di antara label & nomornya dimaafkan */
function danaNomorSesudahLabel(teks, reLabel) {
  const m = String(teks || "").match(new RegExp(String.raw`${reLabel.source}\.?[ \t]*(?:[:;.|>©]|[ \t][1Il|i](?=[ \t]))?[ \t]*([A-Z0-9][A-Z0-9-]{4,})`, "i"));
  return m ? m[1].toUpperCase() : "";
}

/* Nomor-nomor invoice surveyor -> { vr, ls, job } atau null */
function danaSurveyor(teks) {
  const vr = danaNomorSesudahLabel(teks, /\bVR[ \t]*No/);
  let ls = danaNomorSesudahLabel(teks, /\bLS[ \t]*No/);
  if (!vr && !ls) return null;
  /* LS = "I" + nomor VR + ... ("ITB21G2549826..." untuk VR "TB21G2549"): huruf I
     di depannya yang terbaca 1 / l pada scan dipulihkan dari VR-nya */
  if (vr && ls && /^[1lI|i!]/.test(ls) && ls.slice(1).startsWith(vr)) ls = "I" + ls.slice(1);
  return { vr, ls, job: danaNomorSesudahLabel(teks, /\bJob[ \t]*No(?:[ \t]*\/[ \t]*VO[ \t]*No)?/) };
}

/* Nomor invoice di kanan judul "INVOICE": label "No." di awal baris, beberapa baris
   sesudah judulnya ("INVOICE" / "No. : 264163281"). "No." di tempat lain (alamat
   "No. 1", nomor rekening) tidak dipakai. */
function danaNomorSesudahJudul(teks) {
  const baris = String(teks || "").split(/\r?\n/);
  const j = baris.findIndex((l) => /^\s*(?:TAX\s+)?INVOICE\b/i.test(l));
  if (j < 0) return "";
  for (let i = j; i < Math.min(baris.length, j + 8); i++) {
    const m = baris[i].match(/(?:^|INVOICE\s+)No\.?[ \t]*(?:[:;.|]+[ \t]*)?([A-Z0-9][A-Z0-9\/.\-]{3,})/i);
    if (m && /\d/.test(m[1])) return m[1].replace(/[.\/-]+$/, "");
  }
  return "";
}

/* Tanggal invoice: "Invoice Date", atau label "Date" / "Tanggal" yang bukan tanggal
   lain (Due Date, LS Date, Arrive Date, ...). Garis miring = hari/bulan/tahun --
   tagihan lokal. */
function danaTanggalInvoiceUmum(teks) {
  const isi = String(teks || "");
  const label = danaTanggalLabel(isi, /[Il1|]n[vy]o[il1|!]?c[ea][ \t]*Dat[ea]/);
  if (label) return label;
  for (const m of isi.matchAll(/^([^\n]*?)\b(?:Date|Tanggal|Tgl)\b\.?[ \t]*(?:[:;|]|[ \t]1(?=[ \t]))?[ \t]*([^\n]+)/gim)) {
    if (/\b(?:Due|LS|Arr[il1|]ve|Onboard|Delivery|Shipment|Ship|ETD|ETA|Order|PO|DO|Print|Payment|Jatuh|Tempo|Kirim|Expiry|Valid)\s*$/i.test(m[1])) continue;
    const tgl = danaTanggalIso(m[2].trim().split(/\s{2,}/)[0], "dmy");
    if (tgl) return tgl;
  }
  return "";
}

/* Jatuh tempo dari syarat bayar: "Terms : 30 Days", "TOP 14 hari", "Net 30" */
function danaJatuhTempoTerms(teks, tanggal) {
  const m = String(teks || "").match(/\b(?:Payment\s+)?(?:Terms?(?:\s+of\s+Payment)?|TOP)\b[ \t]*[:;.]?[ \t]*(?:Net[ \t]*)?(\d{1,3})[ \t]*(?:Days?|Hari)\b/i);
  const tgl = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tanggal || ""));
  if (!m || !tgl) return "";
  const d = new Date(+tgl[1], +tgl[2] - 1, +tgl[3] + Number(m[1]));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bacaInvoiceRincian(teks) {
  const isi = String(teks || "");
  const baris = isi.split(/\r?\n/);
  const umum = bacaInvoiceUmum(isi);
  const ringkas = danaRingkasanInvoice(baris);
  const surveyor = danaSurveyor(isi);
  // Baris tabel: sesudah kepala (kalau terbaca) sampai ringkasan / kaki
  const awal = baris.findIndex(danaKepalaBarang);
  const kaki = /\bSub\s*-?\s*Total\b|\b(?:In\s+Words?|Terbilang|Say)\b|^\s*(?:Grand\s+)?Total\b/i;
  const barang = [];
  for (let i = awal + 1; i < baris.length; i++) {
    if (kaki.test(baris[i]) && (barang.length || awal >= 0)) break;
    const b = danaBarisBarang(baris[i]);
    if (b) barang.push(b);
  }
  const jumlahBarang = barang.reduce((x, b) => x + b.jumlah, 0);
  const tarif = ringkas && ringkas.ppn > 0 ? (ringkas.tarif || danaTarifPpn(ringkas.ppn, ringkas.dpp)) : 0;
  const uraianSurveyor = surveyor ? `Surveyor Fee (${surveyor.ls ? `LS ${surveyor.ls}` : `VR ${surveyor.vr}`})` : "";
  const nilai = (x) => (Number.isInteger(x) ? String(x) : Math.round(x * 100) / 100);
  const invoiceNo = danaNomorInvoiceLabel(isi) || danaNomorSesudahJudul(isi) || umum.invoiceNo;
  let lines = [];
  if (barang.length && (!ringkas || Math.abs(jumlahBarang - ringkas.dpp) <= 1)) {
    lines = barang.map((b) => ({ desc: danaRapikanUraian(barang.length === 1 && uraianSurveyor ? uraianSurveyor : b.uraian), amount: nilai(b.jumlah), ppnRate: tarif }));
  } else if (ringkas && ringkas.sendiri) {
    /* Baris tabel tak terbaca utuh, tapi ringkasannya pasti: satu baris seharga Sub
       Total. Uraian satu baris yang TERBACA tidak dipinjam -- jumlahnya bukan Sub Total. */
    lines = [{ desc: uraianSurveyor || `Tagihan ${invoiceNo || "vendor"}`, amount: nilai(ringkas.dpp), ppnRate: tarif }];
  }
  if (!lines.length) return Object.assign(umum, { sumber: "Umum" });
  const mata = danaMataUangBaris((isi.match(/\bCurrency\b[ \t]*[:;.]?[ \t]*([A-Za-z]{3})\b/i) || [])[1] || "") || "IDR";
  const invoiceDate = danaTanggalInvoiceUmum(isi) || umum.invoiceDate;
  return {
    sumber: "Rincian",
    invoiceNo,
    invoiceDate,
    invoiceDueDate: danaTanggalLabel(isi, /Due[ \t]*Dat[ea]/) || umum.invoiceDueDate || danaJatuhTempoTerms(isi, invoiceDate),
    // Label B/L / AWB yang utuh saja (pembaca Umum juga menangkap "Bl" di "Blok D6")
    blAwb: danaNomorBlTabel(isi),
    expenseType: danaJenisInvoice(lines.map((l) => ({ desc: l.desc, amount: danaAngka(l.amount) }))),
    transactionType: danaJenisKirimanTabel(isi),
    currency: mata,
    surveyor,
    lines,
    totalInvoice: ringkas ? ringkas.total : jumlahBarang,
    pphInvoice: ringkas ? ringkas.pph : 0,
  };
}

/* Pilih pembaca, lengkapi vendor, dan periksa: rincian (DPP + PPN)
   harus sama dengan total di invoice. */
function bacaInvoiceVendor(teks, vendorDikenal) {
  const isi = String(teks || "");
  let h;
  if (/BILLING DJBC|BEA DAN CUKAI[\s\S]*Nomor Billing/i.test(isi)) h = bacaBillingDjbc(isi);
  else if (/DHL/i.test(isi) && /REGULAR INVOICE/i.test(isi)) h = bacaInvoiceDhlExpress(isi);
  else if (/DHL/i.test(isi) && /CHARGES INVOICE/i.test(isi)) h = bacaInvoiceDhlCharges(isi);
  else if (/FedEx Express|fedex\.com/i.test(isi) && /Invoice Number/i.test(isi)) h = bacaInvoiceFedex(isi);
  else if (danaAdalahPrime(isi)) h = bacaInvoicePrime(isi);
  else {
    h = bacaInvoiceTabel(isi);
    /* Tabel forwarder yang tidak meyakinkan -- tanpa total dan tanpa satu pun angka
       baris (pada scan buruk "Kurs ... 1 USD 18.135 00" terbaca sebagai baris
       berkode mata uang) -- diberi kesempatan kedua lewat pembaca bertabel umum. */
    const yakin = h.totalInvoice > 0 && h.lines.some((l) => danaAngka(l.amount) > 0);
    if (!yakin) {
      const r = bacaInvoiceRincian(isi);
      if (r.lines.length && (r.sumber === "Rincian" || !h.lines.length)) h = r;
    }
  }
  if (h.jenisDokumen === "billing") {
    // Billing: bukan tagihan vendor -- dibayar ke kas negara, tanpa rincian baris
    const jumlah = h.fee.feeBm + h.fee.feePpn + h.fee.feePph + h.akunLain.reduce((x, a) => x + a.nilai, 0);
    h.dpp = jumlah;
    h.ppn = 0;
    h.pphInvoice = 0;
    h.cocok = h.totalInvoice ? Math.abs(jumlah - h.totalInvoice) < 1 && !h.akunLain.length : null;
    return h;
  }
  /* Nama vendor: yang sudah ada di daftar Pengajuan Dana dulu; nama di kop Prime (yang
     pembacanya sendiri sudah memilih) lebih tepat daripada tebakan umum "PT" pertama. */
  const dariDaftar = vendorDikenal ? danaVendorDariDaftar(isi, vendorDikenal) : "";
  h.payee = dariDaftar || (h.sumber === "Prime" && h.payee) || (h.payee && !vendorDikenal ? h.payee : danaNamaVendor(isi, vendorDikenal) || h.payee || "");
  /* Nama di dokumen yang hanya beda titik / huruf besar dari vendor yang sudah ada
     ("PT PRIME FREIGHT INDONESIA" vs "PT. PRIME ...", mis. dari tanda tangan hasil scan)
     adalah vendor itu juga: pesan dan ringkasan memakai satu ejaan. */
  const ejaanDaftar = (vendorDikenal || []).find((v) => v && danaVendorSama(v, h.payee));
  if (ejaanDaftar) h.payee = String(ejaanDaftar).trim();
  // Pembaca yang membaca judul lembarnya sendiri (Prime) sudah menentukan; selebihnya: kata "debit note" di mana saja
  if (typeof h.debitNote !== "boolean") h.debitNote = /DEBIT\s*NOTE/i.test(isi);
  /* DPP & PPN dihitung dengan rumus FORM itu sendiri (fundLineTotals):
     diskon mengurangi, PPN berkelompok dibulatkan sekali -- jadi yang
     diperiksa adalah angka yang nanti benar-benar tersimpan. */
  const tl = typeof fundLineTotals === "function" ? fundLineTotals(h.lines, h.currency, h.payee) : null;
  const dpp = tl ? tl.totalNet : h.lines.reduce((x, l) => x + (l.jenis === "diskon" ? -1 : 1) * danaAngka(l.amount), 0);
  const ppn = tl ? tl.totalPpn : h.lines.reduce((x, l) => x + (l.jenis === "diskon" ? -1 : 1) * Math.round((danaAngka(l.amount) * Number(l.ppnRate || 0)) / 100), 0);
  h.dpp = dpp;
  h.ppn = ppn;
  h.pphInvoice = h.pphInvoice || 0;
  h.blAwb = danaRapatBl(h.blAwb);
  h.cocok = h.totalInvoice ? Math.abs(dpp + ppn - h.pphInvoice - h.totalInvoice) <= Math.max(2, h.lines.length) : null;
  return h;
}

/* Invoice / debit note KEDUA dari vendor yang sama -> ditambahkan sebagai
   dokumen tambahan pengajuan yang sedang diisi (bukan menimpanya). */
function danaTambahSebagaiDokumen(h) {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  if (!panel || typeof tambahFundDokumen !== "function") return false;
  const id = tambahFundDokumen(h.debitNote ? "debit" : "invoice", h.invoiceNo, h.invoiceDate);
  const lama = fundLines.filter((b) => String(b.desc || "").trim() || parseRupiah(b.amount));
  fundLines = lama.concat(h.lines.map((l) => Object.assign({}, l, { dok: id }, l.grupPpn ? { grupPpn: `${id}:${l.grupPpn}` } : {})));
  renderFundDokumen();
  renderFundLines();
  const bl = panel.querySelector('[data-dn="blAwb"]');
  if (bl && h.blAwb) {
    const semua = [...new Set(danaRapatBl(bl.value).split("/").concat(h.blAwb.split("/")).filter(Boolean))];
    bl.value = semua.join("/");
  }
  return true;
}

/* Isi form Pengajuan Dana dengan hasil baca */
function danaIsiForm(h) {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  if (!panel) return false;
  const setel = (kunci, nilai) => {
    const el = panel.querySelector(`[data-dn="${kunci}"]`);
    if (!el || nilai == null || nilai === "") return;
    // Vendor dari invoice: masuk ke dropdown vendor (nama yang sama memakai tulisan yang sudah ada)
    if (kunci === "payee" && typeof fundVendorPastikan === "function") nilai = fundVendorPastikan(nilai, el);
    if (el.tagName === "SELECT" && ![...el.options].some((o) => o.value === nilai)) return;
    el.value = nilai;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // Jenis pengeluaran dulu: ia menentukan isian mana yang tampil (nomor invoice / billing)
  setel("expenseType", h.expenseType);
  setel("transactionType", h.transactionType);
  setel("currency", h.currency);
  setel("payee", h.payee);
  setel("invoiceNo", h.invoiceNo);
  if (h.jenisDokumen === "billing") {
    setel("billingNo", h.billingNo);
    ["feeBm", "feePpn", "feePph"].forEach((k) => setel(k, h.fee[k] ? String(Math.round(h.fee[k])) : ""));
  }
  setel("invoiceDate", h.invoiceDate);
  setel("invoiceDueDate", h.invoiceDueDate);
  setel("blAwb", h.blAwb);
  const tglButuh = panel.querySelector('[data-dn="docDate"]');
  if (tglButuh && !tglButuh.value) setel("docDate", h.invoiceDueDate || h.invoiceDate);
  const dept = panel.querySelector('[data-dn="department"]');
  if (dept && !dept.value) setel("department", "EXIM");
  if (typeof setFundLines === "function" && (h.lines.length || h.jenisDokumen === "billing")) {
    // Mengisi = mengganti: dokumen tambahan form lama ikut hilang bersama barisnya (tidak tersisa judul kosong)
    if (typeof setFundDokumen === "function") setFundDokumen([]);
    setFundLines(h.lines);
  }
  /* "Rincian" (Subject surat cetak): bawaan dari jenis, vendor, jenis
     transaksi & barang BL/AWB-nya (fund-rincian.js); ketikan pengguna
     sendiri tidak ditimpa. */
  if (typeof fundSelaraskanRincian === "function") fundSelaraskanRincian(panel);
  return true;
}

/* ==================================================================
   SATU ATAU BEBERAPA PDF SEKALIGUS

   Dipilih lewat tombol (boleh banyak berkas) atau diseret ke form --
   keduanya masuk ke danaDariBerkasPdf(), satu penangan satu perilaku.

   Beberapa berkas = satu pengajuan, jadi hanya yang cocok yang digabung:
     - vendor yang sama (nama dibandingkan tanpa titik / spasi / huruf besar);
     - sama-sama tagihan: billing DJBC berdiri sendiri (satu form hanya
       memuat satu billing);
     - nomor yang sama dengan dokumen lain dilewati (berkas yang terseret dua kali).
   Dokumen UTAMA (isian No. Invoice) = invoice pertama; debit note tidak
   boleh menjadi "No. Invoice". Sisanya menyusul sebagai dokumen tambahan,
   invoice dulu lalu debit note, menurut urutan berkasnya -- urutan memilih
   berkas tidak menentukan hasil. Yang tidak digabung disebut di pesan.
================================================================== */

const DANA_MAKS_BERKAS = 10;
/* Berkas yang dibaca bersamaan: yang sedang ditunggu + satu yang disiapkan (lihat danaDariBerkasPdf) */
const DANA_BACA_SERENTAK = 2;
let danaSedangMembaca = false;

const danaAdalahPdf = (f) => !!f && (/^application\/pdf$/i.test(f.type || "") || /\.pdf$/i.test(f.name || ""));
/* Foto / hasil scan berupa gambar dibaca lewat OCR (js/import/ocr.js) */
const danaAdalahGambar = (f) => typeof ocrAdalahGambar === "function" && ocrAdalahGambar(f);
const danaBisaDibaca = (f) => danaAdalahPdf(f) || danaAdalahGambar(f);
const danaNomorKunci = (n) => String(n || "").trim().toUpperCase();
const danaNamaJenis = (h) => (h.debitNote ? "Debit Note" : "Invoice");
const danaTerbaca = (h) => !!(h && (h.lines.length || h.invoiceNo || h.billingNo));
/* "PT. PRIME FREIGHT INDONESIA" = "PT Prime Freight Indonesia": kunci
   vendor yang sama dengan dropdown "Dibayarkan Kepada" (fund-vendor.js) */
const danaKunciVendor = (nama) => (typeof fundVendorKunci === "function" ? fundVendorKunci(nama) : String(nama || "").toUpperCase());
const danaVendorSama = (a, b) => danaKunciVendor(a) === danaKunciVendor(b);

/* "Invoice AO2607101 (12 baris) + Debit Note AO2607102 (2 baris)" */
const danaRingkasDokumen = (daftar) =>
  daftar
    .map((h) => `${danaNamaJenis(h)} ${h.invoiceNo || "?"} (${tt(`${h.lines.length} baris`, `${h.lines.length} lines`)})`)
    .join(" + ");

async function danaDaftarVendor() {
  try {
    const rows = typeof bkAmbilDana === "function" ? await bkAmbilDana() : [];
    return [...new Set(rows.map((r) => String((r.payload || {}).payee || "").trim()).filter(Boolean))];
  } catch (e) {
    return []; /* tanpa daftar vendor lama: nama diambil dari invoice */
  }
}

/* ------------------------------------------------------------------
   SATU BERKAS -> SATU ATAU BEBERAPA DOKUMEN

   Teksnya dari lapisan teks PDF (extractPdfText); PDF hasil scan & gambar tidak
   punya lapisan teks, jadi dibaca lewat OCR (ocrBacaBerkas) -- teks keduanya
   masuk ke pembaca vendor yang SAMA. Satu berkas bisa memuat beberapa dokumen
   (invoice + debit note dalam satu scan, atau banyak invoice vendor yang sama):
   halaman bernomor invoice BARU = dokumen baru, halaman tanpa nomor (lanjutan)
   ikut dokumen sebelumnya, dan halaman yang mengulang dokumen yang sudah ada
   (scan ganda) dilewati.
------------------------------------------------------------------ */

/* Nomor invoice yang tercetak di sebuah halaman -- hanya untuk memutuskan halaman itu
   dokumen BARU atau lanjutan; nilai akhirnya tetap dibaca pembaca vendornya. */
function danaNomorHalaman(teks) {
  const nomor = danaNomorInvoiceLabel(teks);
  return nomor.length >= 4 ? danaNomorKunci(danaPulihNoPrime(nomor)) : "";
}

/* Teks per halaman -> dokumen [{ halaman: [nomor halaman], teks }]; null = satu dokumen
   saja (kurang dari dua nomor invoice berbeda) -- pembacanya memakai seluruh teks. */
function danaPecahHalaman(teksHalaman) {
  const daftar = (teksHalaman || []).map((x) => String(x || ""));
  if (daftar.length < 2) return null;
  const nomor = daftar.map(danaNomorHalaman);
  if (new Set(nomor.filter(Boolean)).size < 2) return null;
  const bagian = [];
  let kini = null;
  daftar.forEach((teks, i) => {
    if (!kini || (nomor[i] && kini.nomor && nomor[i] !== kini.nomor)) {
      kini = { nomor: nomor[i], halaman: [], teks: [] };
      bagian.push(kini);
    }
    if (nomor[i] && !kini.nomor) kini.nomor = nomor[i];
    kini.halaman.push(i + 1);
    kini.teks.push(teks);
  });
  return bagian.map((b) => ({ halaman: b.halaman, teks: b.teks.join("\n") }));
}

const danaSebutHalaman = (halaman) => (halaman && halaman.length ? (halaman.length > 1 ? `${halaman[0]}–${halaman[halaman.length - 1]}` : String(halaman[0])) : "");

/* Dokumen dengan nomor yang sama dalam satu berkas (scan ganda): satu saja yang dipakai --
   yang jumlahnya cocok, lalu yang barisnya lebih banyak. */
function danaBuangKembar(dokumen) {
  const unik = [];
  const catatan = [];
  dokumen.forEach((h) => {
    const kunci = danaNomorKunci(h.invoiceNo);
    const i = kunci ? unik.findIndex((x) => danaNomorKunci(x.invoiceNo) === kunci) : -1;
    if (i < 0) {
      unik.push(h);
      return;
    }
    const lebihBaik = (h.cocok !== false) - (unik[i].cocok !== false) || h.lines.length - unik[i].lines.length;
    const dibuang = lebihBaik > 0 ? unik[i] : h;
    if (lebihBaik > 0) unik[i] = h;
    const hal = danaSebutHalaman(dibuang.halaman);
    catatan.push(tt(`${hal ? `Halaman ${hal}` : "Satu bagian"} mengulang ${danaNamaJenis(h)} ${h.invoiceNo} — dilewati.`,
      `${hal ? `Page ${hal}` : "One part"} repeats ${danaNamaJenis(h)} ${h.invoiceNo} — skipped.`));
  });
  return { unik, catatan };
}

/* JADWAL IMPOR TAGIHAN INI -- BL/AWB & jenis transaksinya diambil dari sana:
     - billing DJBC: nomor aju PIB-nya;
     - invoice surveyor: LS No (dokumen pelengkap LS jadwal, juga kolom lama `ls`).
       Nomor LS di invoice kerap lebih PANJANG dari yang tercatat di PIB
       ("ITB21G2549826168252" vs "ITB21G2549826"): cocok bila yang satu awalan yang
       lain (sedikitnya 8 karakter), atau nomor LS jadwal memuat nomor VR-nya.
       Hanya bila tepat SATU jadwal yang cocok.
   Isian yang sudah terbaca dari dokumennya sendiri tidak ditimpa. */
function danaJadwalDariLs(sv) {
  if (!sv || typeof data === "undefined" || !data) return null;
  const kLs = kunciAlnum(sv.ls), kVr = kunciAlnum(sv.vr);
  if (kLs.length < 8 && kVr.length < 6) return null;
  const cocok = (nomor) => {
    const k = kunciAlnum(nomor);
    if (k.length < 8) return false;
    if (kLs.length >= 8 && (k === kLs || kLs.startsWith(k) || k.startsWith(kLs))) return true;
    return kVr.length >= 6 && k.includes(kVr);
  };
  const nomorLs = (s) => {
    const dp = typeof rapikanDokPelengkap === "function" ? rapikanDokPelengkap(s.dokPelengkap) : { ls: [] };
    return dp.ls.map((d) => d.nomor).concat(String(s.ls || "").split(/[,;\n]+|\s+\/\s+|\s+&\s+/));
  };
  const semua = (data.import || []).filter((s) => nomorLs(s).some(cocok));
  return semua.length === 1 ? semua[0] : null;
}

function danaLengkapiDariJadwal(h) {
  if (!h || typeof data === "undefined" || !data) return h;
  let kirim = null;
  if (h.jenisDokumen === "billing" && h.noAju) kirim = (data.import || []).find((s) => kunciAlnum(s.noAju) && kunciAlnum(s.noAju) === kunciAlnum(h.noAju)) || null;
  else if (h.surveyor) kirim = danaJadwalDariLs(h.surveyor);
  if (!kirim) return h;
  if (h.jenisDokumen === "billing" || !h.blAwb) h.blAwb = danaRapatBl([kirim.masterBL, kirim.houseBL].filter(Boolean).join("/"));
  if (!h.transactionType) h.transactionType = kirim.transport === "udara" ? "Air Import" : "Sea Import";
  return h;
}

/* Nomor invoice hasil OCR yang berlebih SATU tanda di depannya -- titik dua yang
   terbaca "1" ("No. 1264163281" untuk "No. : 264163281") -- dicocokkan dengan nama
   berkasnya ("264163281 - INV.pdf"): hanya bila nama berkas memuat nomor itu PERSIS
   sebagai satu potongan, tanpa tanda depannya. */
function danaNomorDariNamaBerkas(nomor, nama) {
  const n = String(nomor || "");
  const potongan = String(nama || "").replace(/\.[A-Za-z0-9]{2,5}$/, "").toUpperCase().split(/[^A-Z0-9-]+/).filter(Boolean);
  if (n.length < 6 || !/^[1lI|i!:;]/.test(n) || potongan.includes(n.toUpperCase())) return n;
  return potongan.includes(n.slice(1).toUpperCase()) ? n.slice(1) : n;
}

/* Satu berkas -> { dokumen: [h], catatan: [pesan] }. Billing dilengkapi dari jadwal impor.
   `progres` = pelapor kemajuan OCR (lihat danaLaporOcr). */
async function danaBacaBerkasBanyak(file, vendor, progres) {
  let teks = "";
  let halaman = null;
  let pdf = null;
  if (!danaAdalahGambar(file)) {
    const ekstrak = await extractPdfText(file);
    teks = ekstrak.text || "";
    halaman = Array.isArray(ekstrak.pageTexts) && ekstrak.pageTexts.length ? ekstrak.pageTexts : null;
    pdf = ekstrak.pdf || null;
  }
  const catatan = [];
  let utuh = null; // hasil baca seluruh teks (dipakai ulang bila berkasnya satu dokumen)
  let ocr = null;
  const bisaOcr = typeof ocrBacaBerkas === "function";
  if (!danaAdalahGambar(file)) utuh = bacaInvoiceVendor(teks, vendor);
  if (bisaOcr && (danaAdalahGambar(file) || (!danaTerbaca(utuh) && pdf))) {
    try {
      ocr = await ocrBacaBerkas(file, { pdf, progres });
    } catch (e) {
      e.galatOcr = true;
      throw e;
    }
    halaman = ocr.halaman.map((x) => x.teks);
    teks = ocr.teks;
    utuh = null;
    if (ocr.terpotong) catatan.push(tt("Hanya halaman-halaman pertama yang dibaca OCR.", "Only the first pages were read with OCR."));
  } else if (danaAdalahGambar(file)) {
    throw Object.assign(new Error("OCR tidak tersedia"), { galatOcr: true });
  }
  const potongan = danaPecahHalaman(halaman);
  const bagian = potongan || [{ halaman: null, teks }];
  const dokumen = [];
  bagian.forEach((b) => {
    const h = !potongan && utuh ? utuh : bacaInvoiceVendor(b.teks, vendor);
    if (!danaTerbaca(h)) return;
    danaLengkapiDariJadwal(h);
    if (ocr) h.invoiceNo = danaNomorDariNamaBerkas(h.invoiceNo, file.name);
    h.berkas = String(file.name || "");
    h.halaman = b.halaman;
    h.ocr = !!ocr;
    dokumen.push(h);
  });
  const { unik, catatan: kembar } = danaBuangKembar(dokumen);
  return { dokumen: unik, catatan: catatan.concat(kembar) };
}

/* Pelapor kemajuan OCR -> toast tetap (OCR beberapa detik per halaman; toast biasa
   hilang sebelum selesai). `urutan`/`jumlah` = berkas ke-berapa dari berapa.
   `bolehTampil()` (pilihan): pelapor tetap MENCATAT tahapnya, tetapi hanya menampilkan
   bila diizinkan -- berkas yang disiapkan di belakang berkas yang sedang ditunggu
   (danaDariBerkasPdf) diam dulu, lalu `.tampilkan()` begitu gilirannya tiba. */
const DANA_TAHAP_OCR = {
  render: ["Menyiapkan halaman", "Preparing the page"],
  olah: ["Membersihkan gambar", "Cleaning the image"],
  baca: ["Membaca tulisan (1/3)", "Reading the text (1/3)"],
  baca2: ["Membaca tulisan (2/3)", "Reading the text (2/3)"],
  baca3: ["Membaca tulisan (3/3)", "Reading the text (3/3)"],
  // tiga pembacaan sekaligus di beberapa pekerja (ocr.js, ocrTigaBacaan)
  bacaSerentak: ["Membaca tulisan (3 cara sekaligus)", "Reading the text (3 passes at once)"],
  angka: ["Memeriksa angka", "Checking the numbers"],
};
function danaLaporOcr(nama, urutan, jumlah, bolehTampil) {
  let kini = { tahap: "siap", halaman: 1, dari: 1, persen: 0 };
  let terakhir = 0;
  let dicatat = false;
  const tampilkan = () => {
    if (!dicatat) return;
    terakhir = Date.now();
    const awalan = jumlah > 1 ? `[${urutan}/${jumlah}] ` : "";
    const hal = kini.dari > 1 && kini.tahap !== "siap" ? ` — ${tt("hal.", "p.")} ${kini.halaman}/${kini.dari}` : "";
    const tahap = DANA_TAHAP_OCR[kini.tahap];
    const uraian = tahap
      ? tt(tahap[0], tahap[1])
      : tt("Menyiapkan mesin OCR (unduhan pertama ±7 MB, hanya sekali)", "Preparing the OCR engine (first-time download ≈7 MB, once only)");
    const persen = kini.persen > 0 && kini.persen < 1 ? ` ${Math.round(kini.persen * 100)}%` : "";
    showToast(`${awalan}${nama}${hal}: ${uraian}${persen}…`, "info", { tetap: true, judul: tt("Membaca hasil scan (OCR)", "Reading the scan (OCR)") });
  };
  const lapor = (m) => {
    dicatat = true;
    if (m.tahap === "mesin") {
      // status Tesseract: unduhan / persiapan mesin (sebelum halaman pertama) atau kemajuan membaca
      if (/recogniz/i.test(m.status || "")) kini = Object.assign({}, kini, { persen: m.persen });
      else kini = Object.assign({}, kini, { tahap: "siap", persen: m.persen });
    } else kini = Object.assign({}, kini, m, { persen: 0 });
    if (bolehTampil && !bolehTampil()) return;
    if (Date.now() - terakhir < 150 && kini.tahap !== "siap") return;
    tampilkan();
  };
  lapor.tampilkan = tampilkan;
  return lapor;
}

/* Dua nomor yang bedanya BISA berasal dari salah baca OCR: paling banyak 2 suntingan,
   dan tiap suntingan memang kekeliruan OCR -- huruf <-> angka yang mirip (O/0, I/1/l,
   S/5, B/8, Z/2, G/6), I/J/U yang tertukar, atau huruf tipis yang muncul / hilang
   ("PFIJKT" vs "PFUKT"). ANGKA <-> ANGKA bukan: nomor B/L berurutan satu vendor
   ("SREBUS45076JKT" vs "SREBUS45083JKT") memang kiriman yang berbeda -- dulu
   delapan invoice WIDE sekaligus disamakan jadi dua nomor B/L. */
const DANA_OCR_MIRIP = ["0OQD", "1ILJU|!", "5S", "8B", "2Z", "6G"];
const DANA_OCR_TIPIS = "1ILJ|!.-' ";
function danaBedaBacaan(a, b) {
  const x = String(a || "").toUpperCase(), y = String(b || "").toUpperCase();
  const mirip = (p, q) => DANA_OCR_MIRIP.some((g) => g.includes(p) && g.includes(q));
  const tipis = (c) => DANA_OCR_TIPIS.includes(c);
  let sebelum = [0];
  for (let j = 1; j <= y.length; j++) sebelum[j] = sebelum[j - 1] + (tipis(y[j - 1]) ? 1 : Infinity);
  for (let i = 1; i <= x.length; i++) {
    const kini = [sebelum[0] + (tipis(x[i - 1]) ? 1 : Infinity)];
    for (let j = 1; j <= y.length; j++) {
      const ganti = x[i - 1] === y[j - 1] ? 0 : mirip(x[i - 1], y[j - 1]) ? 1 : Infinity;
      kini[j] = Math.min(sebelum[j - 1] + ganti, sebelum[j] + (tipis(x[i - 1]) ? 1 : Infinity), kini[j - 1] + (tipis(y[j - 1]) ? 1 : Infinity));
    }
    sebelum = kini;
  }
  return sebelum[y.length] <= 2;
}

/* Dokumen satu kiriman memuat nomor BL/AWB yang sama. Pembacaan OCR bisa salah di
   satu dokumen saja ("PFUKT006824" vs "PFIJKT006824") dan nomor yang sedikit berbeda
   akan membagi biaya jadi dua kiriman (fundBagiPerAwb). Nomor yang beda tipis KARENA
   OCR (danaBedaBacaan) dianggap satu nomor: yang dipakai nomor yang muncul di paling
   banyak dokumen, lalu yang paling panjang. Nomor yang benar-benar berbeda dibiarkan
   (satu MAWB bisa membawa beberapa HAWB; satu vendor menagih banyak kiriman). Hanya
   untuk dokumen hasil OCR. */
function danaSamakanBl(terbaca) {
  const catatan = [];
  const ocr = terbaca.filter((h) => h.ocr && h.blAwb && !/[/]/.test(h.blAwb));
  const nomor = [...new Set(ocr.map((h) => h.blAwb))];
  nomor.forEach((n) => {
    if (!ocr.some((h) => h.blAwb === n)) return; // sudah diganti di putaran ini
    const dekat = nomor.filter((m) => m !== n && ocr.some((h) => h.blAwb === m) && danaBedaBacaan(n, m));
    if (!dekat.length) return;
    const kelompok = [n].concat(dekat);
    const hitung = (x) => ocr.filter((h) => h.blAwb === x).length;
    const pilih = kelompok.slice().sort((a, b) => hitung(b) - hitung(a) || b.length - a.length)[0];
    kelompok.filter((x) => x !== pilih).forEach((x) => ocr.filter((h) => h.blAwb === x).forEach((h) => { h.blAwb = pilih; }));
    catatan.push(tt(`Nomor B/L / AWB sedikit berbeda antar dokumen (${kelompok.join(" / ")}) — dipakai ${pilih}.`,
      `B/L / AWB numbers differ slightly between documents (${kelompok.join(" / ")}) — using ${pilih}.`));
  });
  return catatan;
}

/* Dari semua hasil baca: yang dipakai (utama dulu) dan yang dilewati + alasannya */
function danaSusunSet(terbaca) {
  const bukanBilling = (h) => h.jenisDokumen !== "billing";
  const utama = terbaca.find((h) => bukanBilling(h) && !h.debitNote) || terbaca.find(bukanBilling) || terbaca[0];
  const pakai = [utama];
  const lewat = [];
  terbaca.forEach((h) => {
    if (h === utama) return;
    const nomor = danaNomorKunci(h.invoiceNo);
    if (!bukanBilling(utama) || !bukanBilling(h)) lewat.push({ h, id: "billing tidak bisa digabung dengan dokumen lain", en: "a billing cannot be combined with other documents" });
    else if (!danaVendorSama(h.payee, utama.payee)) lewat.push({ h, id: "vendor berbeda", en: "different vendor" });
    else if (nomor && pakai.some((x) => danaNomorKunci(x.invoiceNo) === nomor)) lewat.push({ h, id: "nomor sama dengan dokumen lain", en: "same number as another document" });
    else pakai.push(h);
  });
  return { pakai: pakai.filter((h) => !h.debitNote).concat(pakai.filter((h) => h.debitNote)), lewat };
}

/* Terapkan hasil baca ke form. `catatan` = pesan tambahan dari pemanggil
   (berkas bukan PDF / tidak terbaca / kelebihan) yang ikut ditampilkan. */
function danaTerapkanDokumen(terbaca, catatan) {
  if (!terbaca || !terbaca.length) return;
  const rp = fmtRp;
  const peringatan = (catatan || []).slice();
  danaSamakanBl(terbaca).forEach((c) => peringatan.push(c));
  const { pakai, lewat } = danaSusunSet(terbaca);
  lewat.forEach(({ h, id, en }) => {
    const nama = h.berkas || h.invoiceNo || "?";
    peringatan.push(tt(`Tidak digabung: ${nama} (${id}).`, `Not combined: ${nama} (${en}).`));
  });
  const utama = pakai[0];
  const banyak = pakai.length > 1;
  /* Satu pengajuan hanya punya satu jenis transaksi (milik dokumen utama). Dokumen
     satu vendor yang jenis transaksinya berbeda (Air Import & Air Export) patut
     dicek. Jenis PENGELUARAN sengaja tidak diperingatkan: invoice (Freight) +
     debit note (Storage) itu pasangan yang wajar, dan tiap barisnya tetap
     membawa uraiannya sendiri. */
  if (banyak) {
    const beda = [...new Set(pakai.map((h) => h.transactionType).filter(Boolean))];
    if (beda.length > 1) peringatan.push(tt(`Jenis transaksi berbeda antar dokumen (${beda.join(", ")}) — form memakai milik dokumen utama.`,
      `Transaction type differs between documents (${beda.join(", ")}) — the form uses the main document's.`));
  }
  const dariOcr = pakai.some((h) => h.ocr);

  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  const nilaiForm = (k) => String(((panel && panel.querySelector(`[data-dn="${k}"]`)) || {}).value || "").trim();
  const adaRincian = typeof fundLines !== "undefined" && fundLines.some((b) => String(b.desc || "").trim() || parseRupiah(b.amount));
  const nomorUtamaForm = nilaiForm("invoiceNo");
  const nomorForm = new Set([nomorUtamaForm].concat(typeof fundDokumen !== "undefined" ? fundDokumen.map((d) => d.nomor) : []).map(danaNomorKunci).filter(Boolean));
  const sudahAda = (h) => !!h.invoiceNo && nomorForm.has(danaNomorKunci(h.invoiceNo));
  const baru = pakai.filter((h) => h.invoiceNo && !sudahAda(h));
  /* Form sudah berisi tagihan vendor yang SAMA -> dokumen baru bisa
     ditambahkan sebagai invoice / debit note berikutnya (bukan menimpa). */
  const formSama = utama.jenisDokumen !== "billing" && adaRincian && !!nomorUtamaForm && !!nilaiForm("payee") && danaVendorSama(nilaiForm("payee"), utama.payee);

  /* Peringatan per dokumen yang baru saja dimasukkan, lalu satu pemberitahuan */
  const selesai = (pesan, dokumen) => {
    dokumen.forEach((h) => {
      (h.pulih || []).forEach((p) => peringatan.push(p.alasan === "baris"
        ? tt(`Amount diperbaiki otomatis dari Qty × Rate karena Total barisnya cocok dengan itu: ${p.uraian} ${rp(p.dari)} → ${rp(p.ke)}.`,
          `Amount corrected automatically from Qty × Rate, which the line's Total confirms: ${p.uraian} ${rp(p.dari)} → ${rp(p.ke)}.`)
        : tt(`Angka diperbaiki otomatis agar jumlahnya sesuai SUB TOTAL: ${p.uraian} ${rp(p.dari)} → ${rp(p.ke)}.`,
          `Number corrected automatically to match the SUB TOTAL: ${p.uraian} ${rp(p.dari)} → ${rp(p.ke)}.`)));
      if (h.akunLain && h.akunLain.length) {
        peringatan.push(tt(`Akun lain tidak punya isian: ${h.akunLain.map((a) => a.nama).join(", ")} — cek totalnya.`,
          `Other accounts have no field: ${h.akunLain.map((a) => a.nama).join(", ")} — check the total.`));
      } else if (h.cocok === false) {
        peringatan.push(dokumen.length > 1
          ? tt(`Total di ${danaNamaJenis(h)} ${h.invoiceNo} ${rp(h.totalInvoice)} berbeda — cek rinciannya.`, `Total of ${danaNamaJenis(h)} ${h.invoiceNo} ${rp(h.totalInvoice)} differs — check the lines.`)
          : tt(`Total di invoice ${rp(h.totalInvoice)} berbeda — cek rinciannya.`, `Invoice total ${rp(h.totalInvoice)} differs — check the lines.`));
      }
    });
    // Hasil scan: angka & nomornya selalu dicocokkan dengan dokumen asli (OCR tidak pernah 100%)
    const catatanOcr = dariOcr ? ` ${tt("Dibaca dengan OCR dari hasil scan — cocokkan angka & nomornya dengan dokumen asli.", "Read with OCR from a scan — match the numbers against the original document.")}` : "";
    showToast(peringatan.length ? `${pesan}${catatanOcr} ${peringatan.join(" ")}` : pesan + catatanOcr, peringatan.length ? "warning" : "success");
  };

  /* Dokumen BARU saja yang masuk; yang sudah ada di form dibiarkan */
  const tambah = () => {
    baru.forEach(danaTambahSebagaiDokumen);
    selesai(baru.length === 1
      ? tt(`${danaNamaJenis(baru[0])} ${baru[0].invoiceNo} ditambahkan: ${baru[0].lines.length} baris. Periksa lalu simpan.`,
        `${danaNamaJenis(baru[0])} ${baru[0].invoiceNo} added: ${baru[0].lines.length} line(s). Check, then save.`)
      : tt(`${baru.length} dokumen ditambahkan: ${danaRingkasDokumen(baru)}. Periksa lalu simpan.`,
        `${baru.length} documents added: ${danaRingkasDokumen(baru)}. Check, then save.`), baru);
  };

  /* Isi form dari awal: dokumen utama mengisi form, sisanya jadi dokumen tambahan */
  const ganti = (diganti) => {
    danaIsiForm(utama);
    pakai.slice(1).forEach(danaTambahSebagaiDokumen);
    let pesan;
    if (diganti) {
      pesan = banyak
        ? tt(`Form diganti dengan ${pakai.length} dokumen: ${danaRingkasDokumen(pakai)}. Periksa lalu simpan.`, `Form replaced with ${pakai.length} documents: ${danaRingkasDokumen(pakai)}. Check, then save.`)
        : tt(`Form diganti dengan ${danaNamaJenis(utama)} ${utama.invoiceNo}. Periksa lalu simpan.`, `Form replaced with ${danaNamaJenis(utama)} ${utama.invoiceNo}. Check, then save.`);
    } else if (utama.jenisDokumen === "billing") {
      pesan = tt(`Terisi dari billing ${utama.billingNo}: total ${rp(utama.dpp)}${utama.blAwb ? `, BL/AWB ${utama.blAwb}` : ""}. Periksa lalu simpan.`,
        `Filled from billing ${utama.billingNo}: total ${rp(utama.dpp)}${utama.blAwb ? `, B/L/AWB ${utama.blAwb}` : ""}. Check, then save.`);
    } else if (banyak) {
      // Total gabungan, dihitung form sendiri: jumlah total per dokumen (tiap dokumen dibulatkan sendiri, lihat fundLineTotals)
      const tl = typeof fundLineTotals === "function" ? fundLineTotals(fundLines, fundMataForm(), fundPayeeForm(), typeof fundDokumen !== "undefined" ? fundDokumen : []) : null;
      const jumlah = tl ? tl.totalNet + tl.totalPpn : pakai.reduce((x, h) => x + h.dpp + h.ppn, 0);
      pesan = tt(`Terisi dari ${pakai.length} dokumen ${utama.payee || ""}: ${danaRingkasDokumen(pakai)}, total ${rp(jumlah)} (sebelum potong PPh). Periksa lalu simpan.`,
        `Filled from ${pakai.length} documents of ${utama.payee || ""}: ${danaRingkasDokumen(pakai)}, total ${rp(jumlah)} (before withholding tax). Check, then save.`);
    } else {
      pesan = tt(`Terisi dari invoice ${utama.payee || ""} ${utama.invoiceNo || ""}: ${utama.lines.length} baris, total ${rp(utama.dpp + utama.ppn)} (sebelum potong PPh). Periksa lalu simpan.`,
        `Filled from invoice ${utama.payee || ""} ${utama.invoiceNo || ""}: ${utama.lines.length} line(s), total ${rp(utama.dpp + utama.ppn)} (before withholding tax). Check, then save.`);
    }
    selesai(pesan, pakai);
  };

  if (formSama && baru.length && typeof showConfirm === "function") {
    const sebut = danaRingkasDokumen(baru);
    const judulBaru = baru.length === 1 ? danaNamaJenis(baru[0]) : tt(`${baru.length} Dokumen`, `${baru.length} Documents`);
    showConfirm(
      tt(`Form ini sudah berisi invoice ${nomorUtamaForm} dari ${utama.payee}. ${sebut} bisa ditambahkan ke pengajuan yang sama — rinciannya dikelompokkan terpisah — atau menggantikan isi form.`,
        `This form already holds invoice ${nomorUtamaForm} from ${utama.payee}. ${sebut} can be added to the same request — its lines grouped separately — or replace the form.`),
      tambah,
      {
        title: tt(`Tambahkan ${judulBaru} ke Pengajuan Ini?`, `Add ${judulBaru} to This Request?`),
        confirmText: tt(`Tambahkan ${judulBaru}`, `Add ${judulBaru}`),
        cancelText: tt("Ganti Isi Form", "Replace the Form"),
        tone: "primary",
        icon: "bi-file-earmark-plus",
        onCancel: () => ganti(true),
      });
    return;
  }
  /* Semuanya sudah ada di form dan yang diunggah bukan dokumen utamanya
     (mis. debit note yang sama terseret lagi): jangan menimpa apa pun. */
  if (formSama && pakai.every(sudahAda) && danaNomorKunci(utama.invoiceNo) !== danaNomorKunci(nomorUtamaForm)) {
    showToast(`${tt(`Dokumen ini sudah ada di pengajuan: ${pakai.map((h) => h.invoiceNo).join(", ")}.`, `Already in this request: ${pakai.map((h) => h.invoiceNo).join(", ")}.`)}${peringatan.length ? " " + peringatan.join(" ") : ""}`, "info");
    return;
  }
  ganti(false);
}

/* Pintu masuk tunggal: daftar berkas dari tombol ATAU dari seret-lepas */
async function danaDariBerkasPdf(berkas) {
  const semua = Array.from(berkas || []).filter(Boolean);
  if (!semua.length) return;
  const bisa = semua.filter(danaBisaDibaca);
  const bukanBerkas = semua.filter((f) => !danaBisaDibaca(f)).map((f) => f.name || "?");
  if (!bisa.length) {
    showToast(tt(`Hanya berkas PDF atau gambar (JPG / PNG) yang bisa dibaca (dilewati: ${bukanBerkas.join(", ")}).`,
      `Only PDF or image (JPG / PNG) files can be read (skipped: ${bukanBerkas.join(", ")}).`), "warning");
    return;
  }
  if (danaSedangMembaca) {
    showToast(tt("Masih membaca berkas sebelumnya — tunggu sebentar.", "Still reading the previous files — please wait."), "info");
    return;
  }
  danaSedangMembaca = true;
  try {
    const dipakai = bisa.slice(0, DANA_MAKS_BERKAS);
    const catatan = [];
    if (bukanBerkas.length) catatan.push(tt(`Bukan PDF / gambar, dilewati: ${bukanBerkas.join(", ")}.`, `Not a PDF / image, skipped: ${bukanBerkas.join(", ")}.`));
    if (bisa.length > dipakai.length) {
      catatan.push(tt(`Paling banyak ${DANA_MAKS_BERKAS} berkas sekali unggah; ${bisa.length - dipakai.length} berkas terakhir dilewati.`,
        `At most ${DANA_MAKS_BERKAS} files per upload; the last ${bisa.length - dipakai.length} were skipped.`));
    }
    showToast(dipakai.length > 1 ? tt(`Membaca ${dipakai.length} berkas…`, `Reading ${dipakai.length} files…`) : tt("Membaca invoice…", "Reading invoice…"), "info");
    const vendor = await danaDaftarVendor();
    const terbaca = [];
    const tidakTerbaca = [];
    let galat = 0;
    let galatOcr = 0;
    let ocrJalan = false;
    /* BERKAS BERIKUTNYA DISIAPKAN SELAGI YANG INI DIBACA. Begitu halaman sebuah berkas
       sudah di tangan pekerja OCR (tahap baca), berkas sesudahnya mulai dibuka, digambar
       & dibersihkan di utas halaman -- yang dulu menunggu menganggur. Paling banyak
       DANA_BACA_SERENTAK berkas sekaligus; pembacaannya mengantre di kolam pekerja yang
       sama dengan berkas yang lebih dulu didahulukan (ocr.js). Hasil tetap diolah
       menurut urutan berkas, dan toast kemajuan hanya mengikuti berkas yang sedang
       ditunggu (pesan terakhir berkas berikutnya diulang begitu gilirannya tiba). */
    const n = dipakai.length;
    const janji = [];
    const sudahBaca = [];
    let depan = 0;
    const pelapor = dipakai.map((f, i) => danaLaporOcr(f.name || "?", i + 1, n, () => i === depan));
    const mulai = (i) => {
      if (i >= n || janji[i] || i - depan >= DANA_BACA_SERENTAK) return;
      janji[i] = danaBacaBerkasBanyak(dipakai[i], vendor, (m) => {
        ocrJalan = true;
        pelapor[i](m);
        if (/^baca/.test(m.tahap || "") && !sudahBaca[i]) {
          sudahBaca[i] = true;
          mulai(i + 1);
        }
      }).then((hasil) => ({ hasil }), (galatBaca) => ({ galatBaca }));
    };
    for (let i = 0; i < n; i++) {
      depan = i;
      mulai(i);
      if (sudahBaca[i]) mulai(i + 1);
      pelapor[i].tampilkan(); // berkas yang disiapkan di belakang: tahap terakhirnya tampil sekarang
      const { hasil, galatBaca: e } = await janji[i];
      if (e) {
        console.warn("Invoice vendor tidak terbaca:", e);
        galat++;
        if (e && e.galatOcr) galatOcr++;
        tidakTerbaca.push(dipakai[i].name || "?");
        continue;
      }
      hasil.catatan.forEach((c) => catatan.push(c));
      if (hasil.dokumen.length) hasil.dokumen.forEach((h) => terbaca.push(h));
      else tidakTerbaca.push(dipakai[i].name || "?");
    }
    if (ocrJalan && typeof hideToast === "function") hideToast(); // toast kemajuan OCR bersifat tetap
    if (!terbaca.length) {
      if (galat === dipakai.length && galatOcr === galat) {
        showToast(tt("Hasil scan tidak bisa dibaca: mesin OCR gagal dimuat — periksa koneksi internet lalu coba lagi.",
          "The scan could not be read: the OCR engine failed to load — check your internet connection and try again."), "error");
      } else if (galat === dipakai.length) showToast(tt("Gagal membaca PDF invoice.", "Could not read the invoice PDF."), "error");
      else if (dipakai.length > 1) showToast(tt("Tidak satu pun berkas bisa dibaca otomatis — isi form secara manual.", "None of the files could be read automatically — please fill the form manually."), "warning");
      else showToast(tt("Invoice ini tidak bisa dibaca otomatis — isi form secara manual.", "This invoice could not be read automatically — please fill the form manually."), "warning");
      return;
    }
    if (tidakTerbaca.length) catatan.push(tt(`Tidak terbaca: ${tidakTerbaca.join(", ")}.`, `Could not be read: ${tidakTerbaca.join(", ")}.`));
    danaTerapkanDokumen(terbaca, catatan);
  } catch (e) {
    console.warn("Invoice vendor tidak terbaca:", e);
    showToast(tt("Gagal membaca PDF invoice.", "Could not read the invoice PDF."), "error");
  } finally {
    danaSedangMembaca = false;
  }
}

(function pasangTombolInvoiceVendor() {
  const tombol = document.getElementById("btnDanaDariInvoice");
  const berkas = document.getElementById("inpDanaDariInvoice");
  if (!tombol || !berkas) return;
  tombol.addEventListener("click", () => berkas.click());
  berkas.addEventListener("change", async () => {
    const daftar = Array.from(berkas.files || []);
    berkas.value = "";
    await danaDariBerkasPdf(daftar);
  });

  /* SERET & LEPAS: seluruh form Pengajuan Dana adalah area lepasnya.
     Hanya seretan BERKAS yang ditangani -- menyeret teks antar kotak isian
     tetap bekerja seperti biasa. Sorotan + petunjuknya lewat CSS
     (.is-dragover, teks dari data-drop-teks dalam bahasa yang sedang
     dipakai); pelepasan memakai penangan yang sama dengan tombol. */
  const form = berkas.closest("[data-docnum-panel]");
  if (!form) return;
  const bawaBerkas = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  const sorot = (hidup) => {
    if (hidup && !form.classList.contains("is-dragover")) {
      form.setAttribute("data-drop-teks", tt("Lepas PDF / gambar Invoice, Debit Note, atau Billing di sini", "Drop the Invoice, Debit Note or Billing PDF / image here"));
    }
    form.classList.toggle("is-dragover", hidup);
  };
  ["dragenter", "dragover"].forEach((ev) =>
    form.addEventListener(ev, (e) => {
      if (!bawaBerkas(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      sorot(true);
    }),
  );
  form.addEventListener("dragleave", (e) => {
    /* dragleave juga menyala saat kursor melintas ke elemen ANAK */
    if (!bawaBerkas(e) || form.contains(e.relatedTarget)) return;
    sorot(false);
  });
  form.addEventListener("drop", (e) => {
    if (!bawaBerkas(e)) return;
    e.preventDefault();
    sorot(false);
    danaDariBerkasPdf(Array.from(e.dataTransfer.files || []));
  });
})();
