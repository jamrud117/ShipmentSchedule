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
     E INVOICE NUMBER    No. Invoice; Billing -> Nomor Billing (sebagai TEKS:
                         kode billing 15 angka tidak boleh jadi 6.4E+14)
     F COMPANY           Dibayarkan Kepada; KAS NEGARA -> STATE TREASURY
     G CUSTOMER          Customer
     H DETAILS           nama barang jadwal yang BL/AWB-nya cocok
                         ("SPRING VENT - MINI PLUG"); tanpa jadwal -> Rincian
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
  if (jenis === "Billing" || jenis === "Tax Advance") return adaStorage ? "IMPORT DUTY TAX + STORAGE" : "IMPORT DUTY TAX";
  if (jenis === "Freight") return "FREIGHT CHARGE";
  if (jenis === "Storage") return "STORAGE";
  return "OTHER";
}

function invsumModa(p) {
  const j = String((typeof fundJenisTransaksiBaku === "function" ? fundJenisTransaksiBaku(p.transactionType) : p.transactionType) || "").trim();
  if (/inland|trucking|local/i.test(j)) return "TRUCKING";
  return j.toUpperCase();
}

/* Nama barang (huruf besar, tanpa kembar) jadwal yang BL/AWB-nya cocok */
function invsumBarang(blAwb) {
  const daftar = typeof fundDaftarAwb === "function" ? fundDaftarAwb(blAwb) : [];
  const kunci = new Set(daftar.map((a) => a.kunci).filter((k) => k.length >= 5));
  if (!kunci.size || typeof data === "undefined" || !data) return "";
  const nama = [];
  [...(data.import || []), ...(data.export || [])].forEach((s) => {
    if (!bkKunciKiriman(s).some((k) => kunci.has(k))) return;
    (s.items || []).forEach((it) => {
      const n = String((it && it.namaBarang) || "").trim().replace(/\s+/g, " ").toUpperCase();
      if (n && !nama.includes(n)) nama.push(n);
    });
  });
  return nama.join(" - ");
}

/* Satu pengajuan (baris riwayat) -> 10 sel { v, jenis: teks|tanggal|angka } */
function invsumSel(r) {
  const p = (r && r.payload) || {};
  const tglInvoice = p.invoiceDate || (r && r.doc_date) || "";
  const nomor = p.expenseType === "Billing" ? p.billingNo || p.invoiceNo : p.invoiceNo || p.billingNo;
  const vendor = String(p.payee || "").trim().toUpperCase();
  const rincian = String(p.notes || "").replace(/^payment request\s*-\s*/i, "").trim().toUpperCase();
  const total = typeof fundTotalKomponen === "function" ? fundTotalKomponen(p).dibayar : 0;
  return [
    { v: tglInvoice, jenis: "tanggal" },
    { v: p.invoiceDueDate || tglInvoice, jenis: "tanggal" },
    { v: p.paidAt || "", jenis: "tanggal" },
    { v: String(nomor || "").trim(), jenis: "teks" },
    { v: INVSUM_NAMA_VENDOR[vendor] || vendor, jenis: "teks" },
    { v: String(p.customer || "").trim().toUpperCase(), jenis: "teks" },
    { v: invsumBarang(p.blAwb) || rincian, jenis: "teks" },
    { v: Math.round(Number(total) || 0), jenis: "angka" },
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
  const html = `<table><tr>${sel
    .map((c) => `<td style="${gaya[c.jenis]}">${escapeHtml(invsumTeksSel(c))}</td>`)
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
