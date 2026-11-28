"use strict";

/* ------------------------------------------------------------------
   SALIN KE INVOICE SUMMARY (Pengajuan Dana)

   Satu baris pengajuan disalin dalam urutan kolom tabel INVOICE SUMMARY
   (lembar akunting, Table1) -- kolom B sampai K. Kolom A (NO) berisi
   rumus, jadi kursor diletakkan di kolom INVOICE DATE baris kosong, lalu
   Ctrl+V:

     B INVOICE DATE      Tanggal Invoice (kosong -> tanggal pengajuan)
     C DUE DATE          Due Date Invoice (kosong -> Tanggal Invoice)
     D Paid Date         tanggal ditandai lunas (kosong selama belum lunas)
     E INVOICE NUMBER    No. Invoice + invoice / debit note tambahan, dipisah
                         ", " seperti lembar itu; Billing -> Nomor Billing
                         (sebagai TEKS: kode billing 15 angka tidak boleh
                         jadi 6.4E+14)
     F COMPANY           Dibayarkan Kepada; KAS NEGARA -> STATE TREASURY
     G CUSTOMER          Customer
     H DETAILS           nama barang jadwal yang BL/AWB-nya cocok, SATU
                         BARANG PER BARIS di dalam satu sel (pemisah baris
                         "\n"; di salinan HTML <br mso-data-placement:
                         same-cell>), rata kiri-atas; tanpa jadwal -> Rincian
     I COST(RP)          TOTAL yang dibayar (sesudah potongan PPh 23)
     J EXPENSES CATEGORY daftar CATEGORY lembar itu: IMPORT DUTY TAX,
                         IMPORT DUTY TAX + STORAGE, FREIGHT CHARGE, STORAGE,
                         OTHER
     K TRANSPORT MODE    AIR/SEA IMPORT/EXPORT, TRUCKING

   Disalin dua bentuk sekaligus (copyRichToClipboard, excel-row-format.js):
   tabel HTML -- Excel menghormati format teks/angka/tanggal per sel -- dan
   teks bertab untuk aplikasi lain. Tanggal ditulis "25-Sep-26" (sama
   dengan salinan baris laporan) supaya Excel membacanya sebagai tanggal
   apa pun pengaturan wilayahnya.
------------------------------------------------------------------ */
// Nama vendor di aplikasi -> nama di lembar Invoice Summary
const INVSUM_NAMA_VENDOR = { "KAS NEGARA": "STATE TREASURY" };

function invsumKategori(p) {
  const jenis = String(p.expenseType || "");
  const adaStorage = (Array.isArray(p.lines) ? p.lines : []).some((b) => /storage|penumpukan|sewa gudang/i.test(String((b && b.desc) || "")));
  if (danaJenisBilling(jenis) || jenis === "Tax Advance") return adaStorage ? "IMPORT DUTY TAX + STORAGE" : "IMPORT DUTY TAX";
  if (jenis === "Freight") return "FREIGHT CHARGE";
  if (jenis === "Storage") return "STORAGE";
  return "OTHER";
}

function invsumModa(p) {
  const j = String((typeof fundJenisTransaksiBaku === "function" ? fundJenisTransaksiBaku(p.transactionType) : p.transactionType) || "").trim();
  if (/inland|trucking|local/i.test(j)) return "TRUCKING";
  return j.toUpperCase();
}

// Kunci BL/AWB pengajuan (huruf & angka, >= 5 karakter) -- dasar pencocokan ke jadwal
function invsumKunciAwb(blAwb) {
  const daftar = typeof fundDaftarAwb === "function" ? fundDaftarAwb(blAwb) : [];
  return new Set(daftar.map((a) => a.kunci).filter((k) => k.length >= 5));
}

// Jadwal (kedua buku) yang Master / House BL/AWB-nya disebut di isian BL/AWB pengajuan
function invsumKiriman(blAwb) {
  const kunci = invsumKunciAwb(blAwb);
  if (!kunci.size || typeof data === "undefined" || !data) return [];
  return [...(data.import || []), ...(data.export || [])].filter((s) => bkKunciKiriman(s).some((k) => kunci.has(k)));
}

/* Nama barang (huruf besar, tanpa kembar) jadwal yang BL/AWB-nya cocok --
   satu barang per baris di dalam satu sel DETAILS ("MOTOR\nMOBIL"). */
function invsumBarang(blAwb) {
  const nama = [];
  invsumKiriman(blAwb).forEach((s) => {
    (s.items || []).forEach((it) => {
      const n = String((it && it.namaBarang) || "").trim().replace(/\s+/g, " ").toUpperCase();
      if (n && !nama.includes(n)) nama.push(n);
    });
  });
  return nama.join("\n");
}

/* INVOICE NUMBER: Billing -> Nomor Billing; selainnya No. Invoice + invoice /
   debit note tambahan, dipisah ", " (cara lembar INVOICE SUMMARY menulis
   beberapa nomor dalam satu sel: "IN-WL2607-00005, IN-WL2607-00016"). */
function invsumNomor(p) {
  if (danaJenisBilling(p.expenseType)) return String(p.billingNo || p.invoiceNo || "").trim();
  const semua = typeof fundSemuaNomor === "function" ? fundSemuaNomor(p) : [String(p.invoiceNo || "").trim()].filter(Boolean);
  const unik = [...new Set(semua)];
  return unik.length ? unik.join(", ") : String(p.billingNo || "").trim();
}

/* Satu pengajuan (baris riwayat) -> 10 sel { v, jenis: teks|tanggal|angka, sen? } */
function invsumSel(r) {
  const p = (r && r.payload) || {};
  const tglInvoice = p.invoiceDate || (r && r.doc_date) || "";
  const nomor = invsumNomor(p);
  const vendor = String(p.payee || "").trim().toUpperCase();
  const rincian = String(p.notes || "").replace(/^payment request\s*-\s*/i, "").trim().toUpperCase();
  const total = Number(typeof fundTotalKomponen === "function" ? fundTotalKomponen(p).dibayar : 0) || 0;
  /* Rupiah tanpa sen (lembar akunting); mata uang lain tetap bersen --
     1.213,71 dolar tidak jadi 1.214 -- sama dengan Export (fexBulat). */
  const mata = String(p.currency || "").trim().toUpperCase();
  const rupiah = !mata || mata === "IDR";
  return [
    { v: tglInvoice, jenis: "tanggal" },
    { v: p.invoiceDueDate || tglInvoice, jenis: "tanggal" },
    { v: p.paidAt || "", jenis: "tanggal" },
    { v: String(nomor || "").trim(), jenis: "teks" },
    { v: INVSUM_NAMA_VENDOR[vendor] || vendor, jenis: "teks" },
    { v: String(p.customer || "").trim().toUpperCase(), jenis: "teks" },
    { v: invsumBarang(p.blAwb) || rincian, jenis: "teks", rinci: true },
    rupiah ? { v: Math.round(total), jenis: "angka" } : { v: Math.round(total * 100) / 100, jenis: "angka", sen: true },
    { v: invsumKategori(p), jenis: "teks" },
    { v: invsumModa(p), jenis: "teks" },
  ];
}

function invsumTeksSel(c) {
  if (c.jenis === "tanggal") return c.v ? excelDateFmt(c.v) : "";
  if (c.jenis === "angka") return c.v ? String(c.v) : "";
  return String(c.v || "");
}

/* { teks, html } satu baris, siap ditempel */
function invsumSalinan(r) {
  const sel = invsumSel(r);
  const teks = sel.map((c) => tsvField(invsumTeksSel(c))).join("\t");
  const gaya = { teks: "mso-number-format:'\\@'", tanggal: "mso-number-format:'d\\-mmm\\-yy'", angka: "mso-number-format:'\\#\\,\\#\\#0'" };
  const gayaSen = "mso-number-format:'\\#\\,\\#\\#0\\.00'";
  /* DETAILS: tiap barang di baris sendiri DALAM SATU SEL -- <br> bergaya
     mso-data-placement:same-cell (tanpa itu Excel memecahnya ke baris
     berikutnya); rata kiri-atas seperti kolom DETAILS di Export. Teks
     polosnya: sel berisi baris baru dikutip (tsvField). */
  const isiSel = (c) => (c.rinci
    ? String(invsumTeksSel(c)).split("\n").map(escapeHtml).join('<br style="mso-data-placement:same-cell">')
    : escapeHtml(invsumTeksSel(c)));
  const gayaSel = (c) => (c.sen ? gayaSen : gaya[c.jenis]) + (c.rinci ? ";text-align:left;vertical-align:top;white-space:normal" : "");
  const html = `<table><tr>${sel
    .map((c) => `<td style="${gayaSel(c)}">${isiSel(c)}</td>`)
    .join("")}</tr></table>`;
  return { teks, html, sel };
}

async function salinInvoiceSummary(rowId) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(rowId));
  if (!r) {
    showToast(t("m.data.pengajuan.dana.tidak.ditemukan"), "danger");
    return false;
  }
  const { teks, html } = invsumSalinan(r);
  const ok = await copyRichToClipboard(html, teks);
  showToast(
    ok
      ? tt(
          `Baris ${r.doc_number} disalin. Di INVOICE SUMMARY, klik sel INVOICE DATE (kolom B) di baris kosong, lalu Ctrl+V.`,
          `Row ${r.doc_number} copied. In INVOICE SUMMARY, click the INVOICE DATE cell (column B) on an empty row, then Ctrl+V.`,
        )
      : tt("Gagal menyalin. Coba lagi.", "Could not copy. Try again."),
    ok ? "success" : "danger",
  );
  return ok;
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-copy-invsum]");
  if (tombol) salinInvoiceSummary(tombol.dataset.copyInvsum);
});


/* ------------------------------------------------------------------
   SALIN KE GROUPWARE (Pengajuan Dana)

   Tombol salin di riwayat Pengajuan Dana membuka dua pilihan: "Inv Sum"
   (baris INVOICE SUMMARY di atas) dan "Groupware" -- KODE HTML murni
   (disalin sebagai teks, bukan tempelan berformat) untuk ditempel di
   editor HTML Groupware. Bentuk & gayanya = templat Groupware tim
   (GW_GAYA, blok .inv); isinya dari pengajuan itu sendiri:

   1. Details    tiap baris Rincian Biaya dengan harga MURNI -- sebelum
                 PPN ditambah & PPH 23 dipotong; diskon bernilai minus --
                 lalu PPN (VAT): satu baris per tarif, Notes = tarifnya
                 ("1.1%"), Price = total PPN tarif itu; lalu PPH23 (Notes
                 "2%", Price minus). Billing / Billing SPTNP: BM (Tariff),
                 PPN Import, PPH Import, Penalty -- yang bernilai saja.
                 TOTAL = yang dibayar (sama dengan Inv Sum & surat cetak).
                 Billing biasa tanpa Penalty (isiannya hanya BM, PPN & PPH).
                 Selebar Payment Information (100%, bukan 900px).
      Payment Information: Method (Bank Transfer), BL atau AWB menurut
                 moda (gwDokAngkut), Bill Number (seperti Inv Sum: nomor
                 invoice / billing), Invoice Date & Due Date; BL/AWB Date,
                 CIPL No. & CIPL Date dari jadwal yang BL/AWB-nya cocok
                 (invsumKiriman).
   2. Attachment Billing -> Billing Import, PIB; Billing SPTNP -> Billing
                 SPTNP, PIB; Tax Advance -> Invoice <vendor>, Billing Import;
                 lainnya -> Invoice <vendor>, Commercial Invoice/Packinglist.
   3. Description barang jadwal yang BL/AWB-nya cocok: uraian, HS Code,
                 jumlah + satuan, harga satuan & amount (valuta jadwal), NW &
                 GW (KG), dengan TOTAL. Tanpa jadwal cocok: satu baris kosong
                 untuk diisi sendiri di Groupware.

   Semua teks dari data di-escape (escapeHtml): nama barang / vendor yang
   memuat < > & tidak mengubah susunan HTML-nya.
------------------------------------------------------------------ */
const GW_GAYA = `<style>
  .inv {
    --n: #1f3864;
    --l: #dfe6f2;

    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    font:
      12px Arial,
      sans-serif;
    color: #333;

    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ==============================
     GENERAL
  ============================== */

  .inv h3 {
    margin: 0 0 12px;
    padding: 8px 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--n);
    border-bottom: 2px solid var(--n);
  }

  .inv table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 22px;
  }

  .inv th,
  .inv td {
    padding: 9px;
    border: 1px solid #c9d2e3;
  }

  .inv th {
    background: var(--n);
    border-color: var(--n);
    color: #fff;
  }

  .inv tbody tr:nth-child(even) {
    background: #f4f6fb;
  }

  .inv tfoot td {
    background: var(--l);
    border-color: var(--n);
    color: var(--n);
    font-weight: 700;
  }

  .inv td:empty::after {
    content: "\\a0";
  }

  .inv .c {
    text-align: center;
  }

  .inv .r {
    text-align: right;
  }

  .inv .cur {
    white-space: nowrap;
  }

  .inv .cur div {
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }

  /* ==============================
     1. DETAILS
  ============================== */

  .inv .b {
    width: 100%;
  }

  .inv .b th:not(:nth-child(2)) {
    width: 1%;
  }

  .inv .b th,
  .inv .b td:not(:nth-child(2)) {
    white-space: nowrap;
  }

  .inv .b tfoot td {
    border-top: 2px solid var(--n) !important;
  }

  /* ==============================
     PAYMENT INFORMATION
  ============================== */

  .inv .kv {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .inv .kv th {
    background: var(--l);
    color: var(--n);
    text-align: center;
    border: 0;
    padding: 12px;
  }

  .inv .kv td {
    padding: 12px;
    border: 0;
    vertical-align: middle;
    line-height: 1.5;
  }

  .inv .kv col:nth-child(1) {
    width: 20%;
  }

  .inv .kv col:nth-child(2) {
    width: 30%;
  }

  .inv .kv col:nth-child(3) {
    width: 20%;
  }

  .inv .kv col:nth-child(4) {
    width: 30%;
  }

  .inv .kv td:nth-child(odd) {
    font-weight: 700;
    color: var(--n);
    white-space: normal;
    padding-right: 18px;
  }

  .inv .kv td:nth-child(even) {
    font-weight: 400;
    overflow-wrap: anywhere;
    padding-left: 12px;
  }

  .inv .kv td:nth-child(3) {
    padding-left: 24px;
  }

  /* ==============================
     2. ATTACHMENT
  ============================== */

  .inv ol {
    margin: 0 0 22px;
    padding: 0;
    list-style: decimal inside;
  }

  .inv li {
    padding: 8px 12px;
    border-bottom: 1px solid var(--l);
  }

  /* ==============================
     3. DESCRIPTION
  ============================== */

  .inv .g {
    font-size: 11px;
  }

  .inv .g th,
  .inv .g td {
    padding: 9px 6px;
  }

  .inv .g th + th,
  .inv .g td + td {
    width: 1%;
    white-space: nowrap;
  }

  .inv .g td + td:not(.cur) {
    text-align: center;
  }

  .inv .g td:first-child {
    text-align: left;
    min-width: 150px;
  }

  .inv .g tfoot td {
    white-space: nowrap;
    border-top: 2px solid var(--n) !important;
  }

  /* ==============================
     NW & GW WEIGHT ALIGNMENT
  ============================== */

  .inv .weight {
    display: inline-flex;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .inv .weight .num {
    text-align: right;
    min-width: 0;
  }

  .inv .weight .unit {
    text-align: left;
    width: auto;
  }

  /* Header NW & GW */
  .inv .g th:nth-last-child(2),
  .inv .g th:last-child {
    text-align: center;
  }

  /* ==============================
     NOTES
  ============================== */

  .inv .notes {
    text-align: center;
  }
</style>`;

const GW_LABEL_PUNGUTAN = { feeBm: "BM (Tariff)", feePpn: "PPN Import", feePph: "PPH Import", feePenalty: "Penalty" };

const gwMata = (m) => String(m || "").trim().toUpperCase() || "IDR";
const gwSimbol = (m) => (gwMata(m) === "IDR" ? "Rp" : gwMata(m));
// Tarif: "1.1%", "11%", "2%"
const gwPersen = (r) => `${angkaLokal(Number(r) || 0, "en-US", { maximumFractionDigits: 2 })}%`;
// Berat & harga satuan: bulat tanpa desimal, selainnya 2-4 desimal ("38.50", "0.7025")
function gwAngka(n) {
  const x = Number(n) || 0;
  const desimal = Math.round(x * 10000) % 10000 !== 0;
  return angkaLokal(x, "en-US", { minimumFractionDigits: desimal ? 2 : 0, maximumFractionDigits: 4 });
}
const gwJumlah = (n) => angkaLokal(Number(n) || 0, "en-US", { maximumFractionDigits: 4 });
const gwTgl = (v) => {
  const tgl = v ? fmtDate(v) : "";
  return tgl === "—" ? "" : tgl;
};
// HS 8 digit bertitik seperti BTKI (8466.93.90); bentuk lain apa adanya
function gwHs(kode) {
  const d = String(kode || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : String(kode || "").trim();
}

/* Baris Details: [{ uraian, catatan, nilai, strip }] + total, dalam mata
   uang pengajuan. `strip`: nilai nol ditulis "-" (bukan 0). */
function gwRincian(p) {
  const mata = gwMata(p.currency);
  const baris = [];
  const adaRinci = Array.isArray(p.lines) && p.lines.length;
  if (danaJenisBilling(p.expenseType) || !adaRinci) {
    if (danaJenisBilling(p.expenseType)) {
      /* Billing & Billing SPTNP: SELALU komponennya -- BM, PPN, PPH
         (+ Penalty untuk Billing SPTNP) -- walau nilainya 0 (tertulis
         "-"): pemeriksa di Groupware melihat susunan yang sama di tiap
         pengajuan, dan tahu komponen itu memang nol, bukan terlupa.
         Billing biasa TANPA Penalty: isiannya di form hanya BM, PPN &
         PPH (data lama yang memang berpenalty tetap menuliskannya,
         supaya TOTAL-nya terjelaskan). Pengecualiannya format lama tanpa
         pungutan (hanya Nominal): satu baris di bawah. */
      const denganPenalty = danaJenisSptnp(p.expenseType) || !!frAngka(p.feePenalty);
      const kunci = denganPenalty ? ["feeBm", "feePpn", "feePph", "feePenalty"] : ["feeBm", "feePpn", "feePph"];
      const nilai = kunci.map((k) => frAngka(p[k]));
      if (nilai.some(Boolean) || !frAngka(p.amount))
        kunci.forEach((k, i) => baris.push({ uraian: GW_LABEL_PUNGUTAN[k], catatan: "", nilai: nilai[i], strip: true }));
    }
    // Format lama / tanpa pungutan: satu baris Jenis Pengeluaran & Nominal (frBarisRincian)
    if (!baris.length) frBarisRincian(p).filter((b) => b.nilai).forEach((b) => baris.push({ uraian: b.label, catatan: "", nilai: b.nilai }));
    return { mata, baris, total: fundTotalKomponen(p).dibayar };
  }
  const daftar = normalisasiBarisDana(p.lines);
  const nilai = fundLineValues(daftar);
  daftar.forEach((b, i) => {
    const uraian = String((b && b.desc) || "").replace(/\s+/g, " ").trim() || (barisDiskon(b) ? "Diskon" : "");
    if (uraian || nilai[i]) baris.push({ uraian, catatan: "", nilai: nilai[i] });
  });
  const jumlah = fundTotalsPengajuan(p);
  if (jumlah.totalPpn) {
    // Total PPN per tarif; dibulatkan supaya jumlahnya TEPAT Total PPN form
    const ppnBaris = fundLinePpnDaftar(daftar, nilai, mata, p.payee);
    const perTarif = new Map();
    daftar.forEach((b, i) => {
      const r = fundLineRate(b);
      if (r > 0) perTarif.set(r, (perTarif.get(r) || 0) + (Number(ppnBaris[i]) || 0));
    });
    const tarif = [...perTarif.keys()].sort((a, b) => a - b);
    const bagian = tarif.length > 1 ? fundBulatkanBagian(tarif.map((r) => perTarif.get(r)), jumlah.totalPpn, fundRupiahPenuh(mata) ? 1 : FUND_SEN) : [jumlah.totalPpn];
    (tarif.length ? tarif : [0]).forEach((r, i) => baris.push({ uraian: "PPN (VAT)", catatan: r ? gwPersen(r) : "", nilai: bagian[i] }));
  }
  if (jumlah.pph) baris.push({ uraian: "PPH23", catatan: gwPersen(FUND_PPH23_RATE), nilai: -jumlah.pph });
  return { mata, baris, total: jumlah.grandTotal };
}

/* BL/AWB Date, CIPL No. & CIPL Date dari jadwal yang BL/AWB-nya cocok.
   Tanggal B/L: milik nomor yang disebut (House -> tanggal House, Master
   -> tanggal Master); beberapa jadwal / invoice -> dipisah ", ". */
function gwInfoKiriman(p) {
  const kunci = invsumKunciAwb(p.blAwb);
  const tglBl = [];
  const nomorCipl = [];
  const tglCipl = [];
  const tambah = (arr, v) => {
    const x = String(v || "").trim();
    if (x && !arr.includes(x)) arr.push(x);
  };
  invsumKiriman(p.blAwb).forEach((s) => {
    const house = kunciAlnum(s.houseBL);
    const tgl = house && kunci.has(house) ? s.houseBLDate || s.masterBLDate : s.masterBLDate || s.houseBLDate;
    tambah(tglBl, gwTgl(tgl));
    dokInvoiceJadwal(s).forEach((d) => {
      tambah(nomorCipl, d.nomor);
      tambah(tglCipl, gwTgl(d.tanggal));
    });
  });
  return { tglBl: tglBl.join(", "), nomorCipl: nomorCipl.join(", "), tglCipl: tglCipl.join(", ") };
}

/* BL ATAU AWB menurut moda angkutnya: Jenis Transaksi pengajuan (Sea
   ... -> BL, Air ... -> AWB) lebih dulu, lalu moda jadwal yang BL/AWB-nya
   cocok (semua laut -> BL, semua udara -> AWB). Tidak diketahui /
   campuran (kurir, trucking): "BL/AWB" seperti dulu. */
function gwDokAngkut(p) {
  const jenis = String(p.transactionType || "").trim();
  if (/^sea\b/i.test(jenis)) return "BL";
  if (/^air\b/i.test(jenis)) return "AWB";
  const moda = new Set(invsumKiriman(p.blAwb).map((s) => (s.transport === "udara" ? "AWB" : "BL")));
  return moda.size === 1 ? [...moda][0] : "BL/AWB";
}

/* VENDOR BEREKENING: vendor di daftar Aturan No. Invoice (bawaannya
   JNE) -- isian No. Invoice-nya NOMOR REKENING tujuan bayar, jadi
   Payment Information-nya berisi Bank Name & Bank Number, bukan Bill
   Number. */
const gwVendorRekening = (payee) => typeof fundInvoiceBolehSama === "function" && fundInvoiceBolehSama(payee);
/* JNE sendiri (nama bawaan daftar itu: JNE / Jalur Nugraha Ekakurir):
   lampirannya hanya resi pengiriman. Sengaja tidak memakai daftar yang
   bisa diubah -- vendor lain yang ditambahkan ke sana belum tentu kurir. */
function gwVendorJne(payee) {
  const kata = fundDocNoKata(payee);
  return !!kata.length && FUND_INVOICE_BAWAAN.some((v) => fundDocNoCocok(kata, fundDocNoKata(v)));
}

// Daftar lampiran menurut Jenis Pengeluaran
function gwLampiran(p) {
  const jenis = String(p.expenseType || "").trim();
  const vendor = typeof fundKataJudul === "function" ? fundKataJudul(p.payee) : String(p.payee || "").trim();
  if (gwVendorJne(p.payee) && !danaJenisBilling(jenis)) return ["Shipping Receipt"];
  if (jenis === "Billing") return ["Billing Import", "PIB"];
  if (danaJenisSptnp(jenis)) return ["Billing SPTNP", "PIB"];
  if (jenis === "Tax Advance") return [`Invoice ${vendor || "Wide"}`, "Billing Import"];
  return [`Invoice ${vendor || "Vendor"}`, "Commercial Invoice/Packinglist"];
}

// Barang jadwal yang BL/AWB-nya cocok (valuta = Jenis Valuta jadwalnya, bawaan USD)
function gwBarang(p) {
  const hasil = [];
  invsumKiriman(p.blAwb).forEach((s) => {
    const mata = gwMata((s.dataPabean && s.dataPabean.valuta) || "USD");
    (s.items || []).forEach((it) => {
      if (!it) return;
      const nama = String(it.namaBarang || "").replace(/\s+/g, " ").trim();
      const qty = parseLooseNumber(it.qty);
      const harga = parseLooseNumber(it.harga);
      const nw = parseLooseNumber(it.netto);
      const gw = parseLooseNumber(it.bruto);
      if (!nama && !qty && !harga && !nw && !gw) return;
      hasil.push({ nama, hs: gwHs(it.hsCode), qty, satuan: String(it.satuan || "").trim().toUpperCase(), harga, amount: Math.round(qty * harga * 100) / 100, mata, nw, gw });
    });
  });
  return hasil;
}

/* Kode HTML Groupware satu pengajuan (baris riwayat) */
function groupwareHtml(r) {
  const p = (r && r.payload) || {};
  const e = (v) => escapeHtml(String(v == null ? "" : v));
  const rinci = gwRincian(p);
  const info = gwInfoKiriman(p);
  const barang = gwBarang(p);
  const tglInvoice = p.invoiceDate || (r && r.doc_date) || "";
  const blAwb = (typeof fundDaftarAwb === "function" ? fundDaftarAwb(p.blAwb).map((a) => a.teks).join(" / ") : "") || String(p.blAwb || "").trim();
  const L = [];
  const tulis = (n, teks) => L.push(" ".repeat(n) + teks);
  // Sel uang: <div><span>Rp</span>1,000,000</div>; minus -> <span>-Rp</span>; strip & nol -> <span>Rp</span>-
  const selUang = (n, nilai, mata, strip) => {
    const v = Number(nilai) || 0;
    tulis(n, '<td class="cur">');
    tulis(n + 2, `<div><span>${v < 0 ? "-" : ""}${e(gwSimbol(mata))}</span>${strip && !v ? "-" : e(formatNilai(Math.abs(v)))}</div>`);
    tulis(n, "</td>");
  };
  const selBerat = (n, nilai) => {
    tulis(n, "<td>");
    tulis(n + 2, '<div class="weight">');
    tulis(n + 4, `<span class="num">${e(gwAngka(nilai))}</span><span class="unit">KG</span>`);
    tulis(n + 2, "</div>");
    tulis(n, "</td>");
  };

  L.push(GW_GAYA, "", '<div class="inv">');
  tulis(2, "<!-- 1. DETAILS -->");
  L.push("");
  tulis(2, "<h3>1. Details</h3>");
  L.push("");
  tulis(2, '<table class="b">');
  tulis(4, "<thead>");
  tulis(6, "<tr>");
  ["No.", "Components", "Notes", "Price"].forEach((h) => tulis(8, `<th>${h}</th>`));
  tulis(6, "</tr>");
  tulis(4, "</thead>");
  L.push("");
  tulis(4, "<tbody>");
  rinci.baris.forEach((b, i) => {
    tulis(6, "<tr>");
    tulis(8, `<td class="c">${i + 1}</td>`);
    tulis(8, `<td>${e(b.uraian)}</td>`);
    tulis(8, b.catatan ? `<td class="notes">${e(b.catatan)}</td>` : "<td></td>");
    selUang(8, b.nilai, rinci.mata, b.strip);
    tulis(6, "</tr>");
  });
  tulis(4, "</tbody>");
  L.push("");
  tulis(4, "<tfoot>");
  tulis(6, "<tr>");
  tulis(8, '<td colspan="3" class="r">TOTAL</td>');
  selUang(8, rinci.total, rinci.mata);
  tulis(6, "</tr>");
  tulis(4, "</tfoot>");
  tulis(2, "</table>");
  L.push("");

  tulis(2, "<!-- PAYMENT INFORMATION -->");
  L.push("");
  tulis(2, '<table class="kv">');
  tulis(4, "<colgroup>");
  for (let i = 0; i < 4; i++) tulis(6, "<col />");
  tulis(4, "</colgroup>");
  L.push("");
  tulis(4, "<thead>");
  tulis(6, "<tr>");
  tulis(8, '<th colspan="4">Payment Information</th>');
  tulis(6, "</tr>");
  tulis(4, "</thead>");
  L.push("");
  tulis(4, "<tbody>");
  /* Kiri: cara & tujuan bayar, lalu tanggal tagihan; kanan: dokumen
     kiriman. Vendor berekening (JNE) dibayar ke rekening atau tunai:
     Bank Name + Bank Number (isian No. Invoice-nya) menggantikan Bill
     Number, dan Tracking Number (No. Resi) di kanan paling atas --
     kiri & kanan lima baris. Pasangan kanan yang tidak ada = satu sel
     kosong selebar dua kolom. */
  const rekening = !danaJenisBilling(p.expenseType) && gwVendorRekening(p.payee);
  /* JNE: resi pengirimannya (No. Resi) di kanan paling atas -- kiri &
     kanan sama-sama lima baris. */
  const resi = rekening ? [["TRACKING NUMBER", String(p.trackingNo || "").trim()]] : [];
  const kiri = rekening
    ? [
        ["METHOD", "Bank Transfer/Cash"],
        ["BANK NAME", String(p.bankName || "").trim()],
        ["BANK NUMBER", String(p.invoiceNo || "").trim()],
        ["INVOICE DATE", gwTgl(tglInvoice)],
        ["DUE DATE", gwTgl(p.invoiceDueDate || tglInvoice)],
      ]
    : [
        ["METHOD", "Bank Transfer"],
        ["BILL NUMBER", invsumNomor(p)],
        ["INVOICE DATE", gwTgl(tglInvoice)],
        ["DUE DATE", gwTgl(p.invoiceDueDate || tglInvoice)],
      ];
  // BL atau AWB saja, menurut moda angkutnya
  const dokAngkut = gwDokAngkut(p);
  const kanan = [
    ...resi,
    [dokAngkut, blAwb],
    [`${dokAngkut} DATE`, info.tglBl],
    ["CIPL NO.", info.nomorCipl],
    ["CIPL DATE", info.tglCipl],
  ];
  kiri.forEach((pasangan, i) => {
    tulis(6, "<tr>");
    pasangan.forEach((v) => tulis(8, `<td>${e(v)}</td>`));
    if (kanan[i]) kanan[i].forEach((v) => tulis(8, `<td>${e(v)}</td>`));
    else tulis(8, '<td colspan="2"></td>');
    tulis(6, "</tr>");
  });
  tulis(4, "</tbody>");
  tulis(2, "</table>");
  L.push("");

  tulis(2, "<!-- 2. ATTACHMENT -->");
  L.push("");
  tulis(2, "<h3>2. Attachment</h3>");
  L.push("");
  tulis(2, "<ol>");
  gwLampiran(p).forEach((x) => tulis(4, `<li>${e(x)}</li>`));
  tulis(2, "</ol>");
  L.push("");

  tulis(2, "<!-- 3. DESCRIPTION -->");
  L.push("");
  tulis(2, "<h3>3. Description</h3>");
  L.push("");
  tulis(2, '<table class="g">');
  tulis(4, "<thead>");
  tulis(6, "<tr>");
  ["Goods Description", "HS Code", "Quantity", "Unit Price", "Amount", "NW (KG)", "GW (KG)"].forEach((h) => tulis(8, `<th>${h}</th>`));
  tulis(6, "</tr>");
  tulis(4, "</thead>");
  L.push("");
  tulis(4, "<tbody>");
  if (!barang.length) {
    tulis(6, "<tr>");
    for (let i = 0; i < 7; i++) tulis(8, "<td></td>");
    tulis(6, "</tr>");
  }
  barang.forEach((b, i) => {
    if (i) L.push("");
    tulis(6, "<tr>");
    tulis(8, `<td>${e(b.nama)}</td>`);
    tulis(8, `<td>${e(b.hs)}</td>`);
    tulis(8, `<td>${e([b.qty ? gwJumlah(b.qty) : "", b.satuan].filter(Boolean).join(" "))}</td>`);
    tulis(8, '<td class="cur">');
    tulis(10, `<div><span>${e(b.mata)}</span>${e(gwAngka(b.harga))}</div>`);
    tulis(8, "</td>");
    selUang(8, b.amount, b.mata);
    selBerat(8, b.nw);
    selBerat(8, b.gw);
    tulis(6, "</tr>");
  });
  tulis(4, "</tbody>");
  L.push("");
  tulis(4, "<tfoot>");
  tulis(6, "<tr>");
  tulis(8, '<td colspan="4" class="r">TOTAL</td>');
  if (barang.length) {
    // Amount per valuta (jadwal bervaluta beda tidak dijumlah jadi satu angka)
    const perMata = new Map();
    barang.forEach((b) => perMata.set(b.mata, Math.round(((perMata.get(b.mata) || 0) + b.amount) * 100) / 100));
    tulis(8, '<td class="cur">');
    perMata.forEach((v, m) => tulis(10, `<div><span>${e(m)}</span>${e(formatNilai(v))}</div>`));
    tulis(8, "</td>");
    selBerat(8, Math.round(barang.reduce((x, b) => x + b.nw, 0) * 10000) / 10000);
    selBerat(8, Math.round(barang.reduce((x, b) => x + b.gw, 0) * 10000) / 10000);
  } else {
    for (let i = 0; i < 3; i++) tulis(8, "<td></td>");
  }
  tulis(6, "</tr>");
  tulis(4, "</tfoot>");
  tulis(2, "</table>");
  L.push("</div>");
  return L.join("\n") + "\n";
}

async function salinGroupware(rowId) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(rowId));
  if (!r) {
    showToast(t("m.data.pengajuan.dana.tidak.ditemukan"), "danger");
    return false;
  }
  // Teks polos: yang ditempel di Groupware adalah KODE HTML-nya, bukan hasil tampilannya
  const ok = await copyToClipboard(groupwareHtml(r));
  showToast(
    ok
      ? tt(
          `Kode HTML Groupware ${r.doc_number} disalin. Tempel di mode HTML editor Groupware.`,
          `Groupware HTML code for ${r.doc_number} copied. Paste it into the Groupware editor's HTML mode.`,
        )
      : tt("Gagal menyalin. Coba lagi.", "Could not copy. Try again."),
    ok ? "success" : "danger",
  );
  return ok;
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-copy-groupware]");
  if (tombol) salinGroupware(tombol.dataset.copyGroupware);
});
