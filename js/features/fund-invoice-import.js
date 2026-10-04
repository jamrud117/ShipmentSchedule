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
     - Umum: nomor, tanggal, BL/AWB, dan total saja -- satu baris.
   Teksnya dari extractPdfText() (js/import/pdf.js), pembaca PDF yang
   sama dengan impor PIB/CIPL.
================================================================== */

const DANA_BULAN = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8,
  sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};

/* "28 Sep 2026", "30 September 2026", "30 - September - 2026",
   "18-08-2026" (hari-bulan-tahun, gaya DHL), "2026-09-28" -> ISO.
   Bergaris miring: "09/15/2026" bulan/hari/tahun (FedEx) kecuali
   urutan = "dmy" ("02/10/2026" DHL = 2 Oktober). */
function danaTanggalIso(teks, urutan) {
  const t = String(teks || "").trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})\s*-?\s*([A-Za-z]{3,})\.?\s*-?\s*(\d{4})/);
  if (m) {
    const b = DANA_BULAN[m[2].slice(0, 3).toLowerCase()];
    if (b) return `${m[3]}-${String(b).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [hari, bulan] = urutan === "dmy" ? [m[1], m[2]] : [m[2], m[1]];
    return `${m[3]}-${bulan.padStart(2, "0")}-${hari.padStart(2, "0")}`;
  }
  return "";
}

/* "8,153,951" / "22,210,551.00" / "(4,503,400)" / "-6,633,550" /
   "5.688.963,00" -> angka */
function danaAngka(teks) {
  let t = String(teks || "").trim();
  const negatif = /^\(.*\)$/.test(t) || /^-/.test(t);
  t = t.replace(/[()\s-]/g, "");
  if (/,\d{1,2}$/.test(t) && t.indexOf(".") >= 0) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
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
function danaNamaVendor(teks, dikenal) {
  const besar = String(teks || "").toUpperCase();
  const cocok = (dikenal || [])
    .map((v) => String(v || "").trim())
    .filter((v) => v.length >= 3 && new RegExp(`\\b${v.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(besar))
    .sort((a, b) => b.length - a.length);
  if (cocok.length) return cocok[0];
  if (/FEDEX/.test(besar)) return "FEDEX";
  const bayar = String(teks).match(/PAYABLE TO\s*\n?\s*"?\s*(PT\.?\s+[A-Z0-9 .&-]+?)\s*"?\s*$/im);
  if (bayar) return bayar[1].replace(/\s+/g, " ").trim();
  const pt = (String(teks).match(/\bPT\.?\s+[A-Z][A-Z0-9 .&-]{2,40}/g) || []).find((x) => !/DYNAMIC DESIGN/i.test(x));
  return pt ? pt.replace(/\s+/g, " ").trim() : "";
}

/* FedEx: satu baris per AWB */
function bacaInvoiceFedex(teks) {
  const baris = String(teks).split(/\r?\n/);
  const awb = [];
  let kini = null;
  baris.forEach((l) => {
    let m = l.match(/Air Waybill Number\s+(\d{9,14})/);
    if (m) {
      kini = { awb: m[1], berat: "", total: 0, ppn: 0, tarif: 0, komponen: [] };
      awb.push(kini);
      return;
    }
    if (!kini) return;
    m = l.match(/Weight\s+([\d.]+)\s*kg/i);
    if (m) kini.berat = m[1];
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
  awb.filter((a) => a.total).forEach((a) => {
    const tarif = a.tarif || danaTarifPpn(a.ppn, a.total - a.ppn);
    const bersih = a.total - a.ppn;
    const label = `AWB ${a.awb}${a.berat ? ` (${a.berat} kg)` : ""}`;
    const jumlahKomponen = a.komponen.reduce((x, k) => x + k.nilai, 0);
    if (a.komponen.length && Math.abs(jumlahKomponen - bersih) < 1) {
      a.komponen.forEach((k) => {
        const baris = { desc: `${k.nama} – ${label}`, amount: String(Math.round(Math.abs(k.nilai))), ppnRate: tarif, grupPpn: a.awb };
        if (k.nilai < 0) Object.assign(baris, { jenis: "diskon", discType: "rp" });
        lines.push(baris);
      });
    } else {
      lines.push({ desc: `FedEx express ${label}`, amount: String(Math.round(bersih)), ppnRate: tarif });
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
  const t = String(teks);
  const ambil = (re) => (t.match(re) || [])[1] || "";
  // Nama lengkap biaya tambahan dari "Analysis of Extra Charges" (di rincian bisa terpotong baris)
  const namaPanjang = [...t.matchAll(/^([A-Z][A-Z -]+[A-Z])\s+[\d,]+(?:\s|$)/gm)].map((m) => m[1].trim());
  const lengkapi = (nama) => {
    const dasar = nama.replace(/\s*-\s*$/, "").trim();
    return namaPanjang.find((n) => n.startsWith(dasar) && n.length > dasar.length) || dasar;
  };
  const judulKata = (x) => x.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const lines = [];
  const awbList = [];
  let awb = null;
  let n = 0;
  t.split(/\r?\n/).forEach((l) => {
    let m = l.match(/^(\d{10})\s+\d{2}-\d{2}-\d{4}\b/);
    if (m) {
      awb = { no: m[1], berat: "" };
      awbList.push(awb);
      n = 0;
    }
    if (!awb) return;
    const akhir = l.match(/([\d,]+)\s+A\s+([\d,]+)\s*$/); // PPN "A" & total baris DHL
    if (!akhir) return;
    const diskon = l.match(/(-[\d,]+)\s*d\b/);
    let nama = "";
    let nilai = 0;
    m = l.match(/(\d+\.\d+)\s+[A-Z]\s+\d+\s+([\d,]+)\s/);
    if (m && n === 0) {
      awb.berat = m[1];
      nama = "Standard Charge";
      nilai = danaAngka(m[2]);
    } else {
      m = l.match(/([A-Z][A-Z ]*[A-Z](?:\s*-)?)\s+([\d,]+)\s+[\d,]+\s+A\s+[\d,]+\s*$/);
      if (!m) return;
      nama = judulKata(lengkapi(m[1]));
      nilai = danaAngka(m[2]);
    }
    n += 1;
    const grup = `${awb.no}#${n}`;
    const label = `AWB ${awb.no}${awb.berat ? ` (${awb.berat} kg)` : ""}`;
    lines.push({ desc: `${nama} – ${label}`, amount: String(Math.round(nilai)), ppnRate: 1.1, grupPpn: grup });
    if (diskon) {
      lines.push({ jenis: "diskon", discType: "rp", desc: `Discount – ${label}`, amount: String(Math.abs(danaAngka(diskon[1]))), ppnRate: 1.1, grupPpn: grup });
    }
  });
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
    transactionType: /OUTBOUND/i.test(t) ? "Air Export" : "Air Import",
    currency: "IDR",
    lines,
    totalInvoice: danaAngka(ambil(/Total Amount \(IDR\)\s+[\d,]+\s+[\d,]+\s+([\d,]+)/)),
  };
}

/* DHL INBOUND CHARGES INVOICE (biaya kepabeanan / pengurusan saat tiba):
   baris Billing Details "Uraian | Amount Excl VAT | VAT | Amount Incl VAT". */
function bacaInvoiceDhlCharges(teks) {
  const t = String(teks);
  const ambil = (re) => (t.match(re) || [])[1] || "";
  const baris = t.split(/\r?\n/);
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
    transactionType: /OUTBOUND/i.test(t) ? "Air Export" : "Air Import",
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
  const t = String(teks);
  const ambil = (re) => (t.match(re) || [])[1] || "";
  const fee = { feeBm: 0, feePpn: 0, feePph: 0 };
  const akunLain = [];
  t.split(/\r?\n/).forEach((l) => {
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

/* Tabel forwarder: Description | Qty | CURR | Rate | Amount | VAT | PPH 23 | Total */
function bacaInvoiceTabel(teks) {
  const baris = String(teks).split(/\r?\n/);
  const ambil = (re) => (String(teks).match(re) || [])[1] || "";
  const awal = baris.findIndex((l) => /Description/i.test(l) && /Qty|Rate|Amount/i.test(l));
  const rincian = [];
  if (awal >= 0) {
    for (let i = awal + 1; i < baris.length; i++) {
      const l = baris[i].trim();
      if (/^(SUB ?TOTAL|TOTAL|GRAND TOTAL)\b/i.test(l)) break;
      if (/Amount|VAT \(|PPH 23/i.test(l) && !/\d{1,3},\d{3}/.test(l)) continue; // baris kepala kedua
      const m = l.match(/^(.+?)\s+(\d[\d,.]*)\s+([A-Z]{3})\s+(\d[\d,.]*)\s+(.+)$/);
      if (!m) {
        if (rincian.length && l && !/\d{1,3},\d{3}/.test(l)) rincian[rincian.length - 1].desc += " " + l;
        continue;
      }
      const angka = (m[5].match(/\(?-?[\d,.]+\)?/g) || []).map(danaAngka);
      if (!angka.length) continue;
      const amount = angka[0];
      const total = angka[angka.length - 1];
      let ppn = 0;
      if (angka.length === 3) {
        if (Math.abs(amount + angka[1] - total) < 2) ppn = angka[1];
      } else if (angka.length >= 4) ppn = angka[1];
      rincian.push({ desc: m[1].trim(), amount, ppn });
    }
  }
  const jenis = danaJenisInvoice(rincian);
  const tipe = ambil(/Shipment Type\s*:\s*((?:Sea|Air)\s+(?:Import|Export))/i).replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ");
  /* Baris TOTAL: Amount | VAT | PPH 23 | Total. Empat angka -> invoice
     sudah memotong PPh 23 (angka ketiga); total akhirnya angka terakhir. */
  const totalBaris = baris.find((l) => /^TOTAL\b/i.test(l.trim())) || baris.find((l) => /^SUB ?TOTAL\b/i.test(l.trim()));
  const angkaTotal = totalBaris ? (totalBaris.match(/[\d,]+(?:\.\d+)?/g) || []).map(danaAngka) : [];
  let pphInvoice = 0;
  if (angkaTotal.length >= 4) pphInvoice = angkaTotal[2];
  else if (angkaTotal.length === 3 && Math.abs(angkaTotal[0] - angkaTotal[1] - angkaTotal[2]) < 2) pphInvoice = angkaTotal[1];
  return {
    sumber: "Tabel",
    invoiceNo: ambil(/Invoice\s*(?:No\.?|Number)\s*:\s*([A-Z0-9][A-Z0-9\/.-]+)/i),
    invoiceDate: danaTanggalIso(ambil(/Invoice Date\s*:\s*([^\n]+?)(?:\s{2,}|$)/im)),
    invoiceDueDate: danaTanggalIso(ambil(/Due Date\s*:\s*([^\n]+?)(?:\s{2,}|$)/im)),
    /* Nilai B/L berhenti di label kolom sebelahnya ("... JKT CBM : 4.07"),
       bukan di kata kapital pertama -- nomor B/L sendiri bisa berspasi. */
    blAwb: ambil(/(?:B\/L|BL|AWB|MAWB|HAWB)\s*(?:No\.?|Number)?\s*:\s*(.+?)(?=\s+(?:CBM|Package|Carrier|Container|Freight|Port|Reference|Arrive|Vessel|Voyage|Flight|ETD|ETA|Weight)\b[^:\n]{0,24}:|\s*$)/m).trim(),
    expenseType: jenis,
    transactionType: tipe,
    currency: "IDR",
    lines: rincian.map((r) => ({ desc: r.desc, amount: String(Math.round(r.amount)), ppnRate: danaTarifPpn(r.ppn, r.amount) })),
    totalInvoice: angkaTotal.length ? angkaTotal[angkaTotal.length - 1] : 0,
    pphInvoice,
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

/* Pilih pembaca, lengkapi vendor, dan periksa: rincian (DPP + PPN)
   harus sama dengan total di invoice. */
function bacaInvoiceVendor(teks, vendorDikenal) {
  const t = String(teks || "");
  let h;
  if (/BILLING DJBC|BEA DAN CUKAI[\s\S]*Nomor Billing/i.test(t)) h = bacaBillingDjbc(t);
  else if (/DHL/i.test(t) && /REGULAR INVOICE/i.test(t)) h = bacaInvoiceDhlExpress(t);
  else if (/DHL/i.test(t) && /CHARGES INVOICE/i.test(t)) h = bacaInvoiceDhlCharges(t);
  else if (/FedEx Express|fedex\.com/i.test(t) && /Invoice Number/i.test(t)) h = bacaInvoiceFedex(t);
  else {
    h = bacaInvoiceTabel(t);
    if (!h.lines.length) h = bacaInvoiceUmum(t);
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
  h.payee = h.payee && !vendorDikenal ? h.payee : danaNamaVendor(t, vendorDikenal) || h.payee || "";
  h.debitNote = /DEBIT\s*NOTE/i.test(t);
  /* DPP & PPN dihitung dengan rumus FORM itu sendiri (fundLineTotals):
     diskon mengurangi, PPN berkelompok dibulatkan sekali -- jadi yang
     diperiksa adalah angka yang nanti benar-benar tersimpan. */
  const tl = typeof fundLineTotals === "function" ? fundLineTotals(h.lines) : null;
  const dpp = tl ? tl.totalNet : h.lines.reduce((x, l) => x + (l.jenis === "diskon" ? -1 : 1) * danaAngka(l.amount), 0);
  const ppn = tl ? tl.totalPpn : h.lines.reduce((x, l) => x + (l.jenis === "diskon" ? -1 : 1) * Math.round((danaAngka(l.amount) * Number(l.ppnRate || 0)) / 100), 0);
  h.dpp = dpp;
  h.ppn = ppn;
  h.pphInvoice = h.pphInvoice || 0;
  h.blAwb = danaRapatBl(h.blAwb);
  h.cocok = h.totalInvoice ? Math.abs(dpp + ppn - h.pphInvoice - h.totalInvoice) <= Math.max(2, h.lines.length) : null;
  return h;
}

/* Nama vendor untuk kalimat: singkatan tetap kapital (DHL), FedEx dengan
   ejaan merknya, lainnya Huruf Awal Kapital ("WIDE" -> "Wide"). */
function danaNamaRapi(nama) {
  const n = String(nama || "").trim();
  if (/^fedex$/i.test(n)) return "FedEx";
  if (/^[A-Z]{2,3}$/.test(n)) return n;
  return n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* "Rincian" (Subject surat cetak) bawaan saat mengunggah PDF */
function danaRincianBawaan(h) {
  if (h.jenisDokumen === "billing") return "Payment Request Billing Import";
  return h.payee ? `Payment Request Invoice ${danaNamaRapi(h.payee)}` : "Payment Request Invoice";
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
  if (typeof setFundLines === "function" && (h.lines.length || h.jenisDokumen === "billing")) setFundLines(h.lines);
  /* "Rincian" dicetak sebagai Subject Form Pengajuan Dana. Bawaannya
     "Payment Request Invoice <Vendor>" / "Payment Request Billing Import";
     ketikan pengguna sendiri tidak ditimpa. */
  const catatan = panel.querySelector('[data-dn="notes"]');
  if (catatan && (!catatan.value.trim() || /^Payment Request (Invoice|Billing)\b/.test(catatan.value.trim()))) {
    setel("notes", danaRincianBawaan(h));
  }
  return true;
}

async function danaDariInvoicePdf(file) {
  if (!file) return;
  try {
    if (typeof showToast === "function") showToast(tt("Membaca invoice…", "Reading invoice…"), "info");
    const { text } = await extractPdfText(file);
    let vendor = [];
    try {
      const rows = typeof bkAmbilDana === "function" ? await bkAmbilDana() : [];
      vendor = [...new Set(rows.map((r) => String((r.payload || {}).payee || "").trim()).filter(Boolean))];
    } catch (e) {
      /* tanpa daftar vendor lama: nama diambil dari invoice */
    }
    const h = bacaInvoiceVendor(text, vendor);
    if (h.jenisDokumen === "billing" && h.noAju && typeof data !== "undefined" && data) {
      const rapat = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const kirim = (data.import || []).find((s) => rapat(s.noAju) && rapat(s.noAju) === rapat(h.noAju));
      if (kirim) {
        h.blAwb = danaRapatBl([kirim.masterBL, kirim.houseBL].filter(Boolean).join("/"));
        if (!h.transactionType) h.transactionType = kirim.transport === "udara" ? "Air Import" : "Sea Import";
      }
    }
    if (!h.lines.length && !h.invoiceNo && !h.billingNo) {
      showToast(tt("Invoice ini tidak bisa dibaca otomatis — isi form secara manual.", "This invoice could not be read automatically — please fill the form manually."), "warning");
      return;
    }
    /* Form sudah berisi tagihan vendor yang SAMA dengan nomor berbeda ->
       tawarkan menambahkannya sebagai invoice / debit note kedua. */
    const panelDana = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
    const nilaiForm = (k) => String(((panelDana && panelDana.querySelector(`[data-dn="${k}"]`)) || {}).value || "").trim();
    const adaRincian = typeof fundLines !== "undefined" && fundLines.some((b) => String(b.desc || "").trim() || parseRupiah(b.amount));
    if (h.jenisDokumen !== "billing" && adaRincian && nilaiForm("invoiceNo") && h.invoiceNo && nilaiForm("invoiceNo") !== h.invoiceNo &&
      nilaiForm("payee").toUpperCase() === String(h.payee || "").toUpperCase() && typeof showConfirm === "function") {
      const jenisBaru = h.debitNote ? "Debit Note" : "Invoice";
      showConfirm(
        tt(`Form ini sudah berisi invoice ${nilaiForm("invoiceNo")} dari ${h.payee}. ${jenisBaru} ${h.invoiceNo} (${h.lines.length} baris) bisa ditambahkan ke pengajuan yang sama — rinciannya dikelompokkan terpisah — atau menggantikan isi form.`,
          `This form already holds invoice ${nilaiForm("invoiceNo")} from ${h.payee}. ${jenisBaru} ${h.invoiceNo} (${h.lines.length} lines) can be added to the same request — its lines grouped separately — or replace the form.`),
        () => {
          danaTambahSebagaiDokumen(h);
          showToast(tt(`${jenisBaru} ${h.invoiceNo} ditambahkan: ${h.lines.length} baris. Periksa lalu simpan.`,
            `${jenisBaru} ${h.invoiceNo} added: ${h.lines.length} line(s). Check, then save.`), "success");
        },
        {
          title: tt(`Tambahkan ${jenisBaru} ke Pengajuan Ini?`, `Add ${jenisBaru} to This Request?`),
          confirmText: tt(`Tambahkan ${jenisBaru}`, `Add ${jenisBaru}`),
          cancelText: tt("Ganti Isi Form", "Replace the Form"),
          tone: "primary",
          icon: "bi-file-earmark-plus",
          onCancel: () => {
            if (typeof setFundDokumen === "function") setFundDokumen([]);
            danaIsiForm(h);
            showToast(tt(`Form diganti dengan invoice ${h.invoiceNo}. Periksa lalu simpan.`, `Form replaced with invoice ${h.invoiceNo}. Check, then save.`), "success");
          },
        });
      return;
    }
    danaIsiForm(h);
    const rp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
    const ringkas = h.jenisDokumen === "billing"
      ? tt(`Terisi dari billing ${h.billingNo}: total ${rp(h.dpp)}${h.blAwb ? `, BL/AWB ${h.blAwb}` : ""}. Periksa lalu simpan.`,
        `Filled from billing ${h.billingNo}: total ${rp(h.dpp)}${h.blAwb ? `, B/L/AWB ${h.blAwb}` : ""}. Check, then save.`)
      : tt(`Terisi dari invoice ${h.payee || ""} ${h.invoiceNo || ""}: ${h.lines.length} baris, total ${rp(h.dpp + h.ppn)} (sebelum potong PPh). Periksa lalu simpan.`,
        `Filled from invoice ${h.payee || ""} ${h.invoiceNo || ""}: ${h.lines.length} line(s), total ${rp(h.dpp + h.ppn)} (before withholding tax). Check, then save.`);
    if (h.akunLain && h.akunLain.length) {
      showToast(ringkas + " " + tt(`Akun lain tidak punya isian: ${h.akunLain.map((a) => a.nama).join(", ")} — cek totalnya.`,
        `Other accounts have no field: ${h.akunLain.map((a) => a.nama).join(", ")} — check the total.`), "warning");
      return;
    }
    if (h.cocok === false) {
      showToast(ringkas + " " + tt(`Total di invoice ${rp(h.totalInvoice)} berbeda — cek rinciannya.`, `Invoice total ${rp(h.totalInvoice)} differs — check the lines.`), "warning");
    } else showToast(ringkas, "success");
  } catch (e) {
    console.warn("Invoice vendor tidak terbaca:", e);
    showToast(tt("Gagal membaca PDF invoice.", "Could not read the invoice PDF."), "error");
  }
}

(function pasangTombolInvoiceVendor() {
  const tombol = document.getElementById("btnDanaDariInvoice");
  const berkas = document.getElementById("inpDanaDariInvoice");
  if (!tombol || !berkas) return;
  tombol.addEventListener("click", () => berkas.click());
  berkas.addEventListener("change", async () => {
    const f = berkas.files && berkas.files[0];
    berkas.value = "";
    await danaDariInvoicePdf(f);
  });
})();
