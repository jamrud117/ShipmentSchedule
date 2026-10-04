"use strict";

/* ==================================================================
   BIAYA PER KIRIMAN — di panel detail jadwal

   Semua Pengajuan Dana yang menyebut BL/AWB kiriman ini (Master atau
   House) dikumpulkan, lalu dijumlahkan NILAI YANG DIBAYAR-nya -- uang
   yang benar-benar keluar, termasuk pajak:
     Total dikeluarkan = Bea & pajak (Billing, Tax Advance)
                       + Biaya logistik (freight, storage, lainnya; + PPN)
   Satu angka utama, dua rinciannya, dan perbandingannya dengan nilai
   barang -- tanpa istilah akuntansi.
   Nomor BL/AWB dicocokkan tanpa spasi, titik, dan tanda hubung; satu
   pengajuan boleh memuat beberapa nomor ("877144218723/877334611529").
================================================================== */

const BK_TTL_MS = 60 * 1000;
let bkCache = null;

/* Dipanggil setiap Pengajuan Dana disimpan / diubah status bayarnya:
   detail kiriman yang dibuka sesudahnya memuat ulang angkanya. */
function bkLupakan() {
  bkCache = null;
}

async function bkAmbilDana(paksa) {
  if (!paksa && bkCache && Date.now() - bkCache.waktu < BK_TTL_MS) return bkCache.rows;
  const rows = await fsumAmbilSemua();
  bkCache = { waktu: Date.now(), rows };
  return rows;
}

const bkNormal = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const bkAngka = (v) => {
  const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};

/* Nomor BL/AWB kiriman (Master & House) */
function bkKunciKiriman(s) {
  return [...new Set([s && s.masterBL, s && s.houseBL].map(bkNormal).filter((k) => k.length >= 5))];
}

/* Nomor BL/AWB di sebuah pengajuan -- bisa lebih dari satu, dipisah
   "/", koma, titik koma, atau baris baru. Spasi DI DALAM satu nomor
   ("SRE 453834", "MAEU 1234567") bukan pemisah -- dirapatkan saja. */
function bkKunciDana(p) {
  return String((p && p.blAwb) || "")
    .split(/[\/,;|\r\n]+/)
    .map(bkNormal)
    .filter((k) => k.length >= 5);
}

function bkCocokkan(s, rows) {
  const kunci = new Set(bkKunciKiriman(s));
  if (!kunci.size) return [];
  return (rows || []).filter((r) => bkKunciDana((r && r.payload) || {}).some((k) => kunci.has(k)));
}

/* Hitungan biaya satu kiriman. `kursFn(mata, tanggal)` untuk pengajuan
   non-IDR & nilai barang ekspor; impor memakai NDPBM kirimannya. */
const BK_JENIS_PAJAK = ["Billing", "Tax Advance"];
function hitungBiayaKiriman(s, rows, kursFn) {
  const kurs = (mata, tgl) => (String(mata || "IDR").toUpperCase() === "IDR" ? 1 : Number(kursFn && kursFn(mata, tgl)) || bkAngka(s.ndpbm) || 0);
  const baris = (rows || []).map((r) => {
    const p = r.payload || {};
    const tanggal = String(p.invoiceDate || r.doc_date || "");
    return {
      id: r.id,
      nomor: r.doc_number || "",
      tanggal,
      vendor: String(p.payee || "").trim() || "—",
      jenis: String(p.expenseType || "").trim() || "Lainnya",
      /* Nilai AKHIR yang dibayar -- sama dengan "Total Dibayar" di
         Pengajuan Dana: DPP + PPN - potongan PPh 23 (jasa), atau bea &
         pajak impor (Billing). Bukan DPP, bukan DPP + PPN saja. */
      dibayar: frTotalPengajuan(p) * kurs(p.currency, tanggal),
      lunas: String(p.paidAt || "").slice(0, 10),
    };
  }).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const jumlah = (arr) => arr.reduce((x, b) => x + b.dibayar, 0);
  const pajak = baris.filter((b) => BK_JENIS_PAJAK.indexOf(b.jenis) >= 0);
  const belum = baris.filter((b) => !b.lunas);
  const calc = computeCustoms(s);
  const impor = s.mode !== "export";
  const nilaiUsd = Number(calc.totalUSD) || 0;
  const kursBarang = impor ? bkAngka(s.ndpbm) : kurs("USD", s.etd || s.docDate || "");
  const nilaiBarang = impor ? calc.cifRupiah || calc.fobRupiah || nilaiUsd * kursBarang : nilaiUsd * kursBarang;
  const total = jumlah(baris);
  const logistik = total - jumlah(pajak);
  return {
    baris,
    total,
    pajak: jumlah(pajak),
    logistik,
    belumJumlah: belum.length,
    belumNilai: jumlah(belum),
    nilaiBarang,
    kursBarang,
    persen: nilaiBarang ? total / nilaiBarang : null,
    impor,
  };
}

const bkRp = (n) => (Math.round(n) ? "Rp " + Math.round(n).toLocaleString("id-ID") : "—");
const bkNamaJenis = (j) => (j === "Lainnya" ? tt("Lainnya", "Other") : j);

function bkHtml(s, h) {
  const kunci = bkKunciKiriman(s);
  if (!kunci.length) {
    return `<div class="form-text-note">${escapeHtml(tt(
      "Isi Master/House B/L atau AWB kiriman ini untuk menautkan biayanya dari Pengajuan Dana.",
      "Fill in this shipment's Master/House B/L or AWB to link its costs from Fund Requests."))}</div>`;
  }
  if (!h.baris.length) {
    return `<div class="form-text-note">${escapeHtml(tt(
      `Belum ada Pengajuan Dana dengan BL/AWB ${[s.masterBL, s.houseBL].filter(Boolean).join(" / ")}.`,
      `No Fund Request mentions B/L/AWB ${[s.masterBL, s.houseBL].filter(Boolean).join(" / ")} yet.`))}</div>`;
  }
  const isi = h.baris.map((b) => `
      <tr>
        <td>${escapeHtml(b.nomor)}</td>
        <td>${fmtDate(b.tanggal)}</td>
        <td>${escapeHtml(b.vendor)}</td>
        <td>${escapeHtml(bkNamaJenis(b.jenis))}</td>
        <td>${bkRp(b.dibayar)}</td>
        <td>${b.lunas ? `<span class="bk-lunas">${escapeHtml(tt("Lunas", "Paid"))}</span>` : `<span class="bk-belum">${escapeHtml(tt("Belum lunas", "Unpaid"))}</span>`}</td>
      </tr>`).join("");
  const kotak = (judul, nilai, ket, utama) => `
      <div class="bk-kotak${utama ? " bk-kotak--utama" : ""}">
        <div class="bk-kotak-judul">${escapeHtml(judul)}</div>
        <div class="bk-kotak-nilai">${nilai}</div>
        <div class="bk-kotak-ket">${escapeHtml(ket)}</div>
      </div>`;
  const statusTotal = h.belumJumlah
    ? tt(`${h.belumJumlah} belum lunas (${bkRp(h.belumNilai)})`, `${h.belumJumlah} unpaid (${bkRp(h.belumNilai)})`)
    : tt("Semua sudah lunas", "All paid");
  return `
    <div class="bk-ringkas">
      ${kotak(tt("Total dikeluarkan", "Total spent"), bkRp(h.total), tt("semua pengajuan, termasuk pajak", "all requests, taxes included"), true)}
      ${kotak(tt("Bea & pajak", "Duties & taxes"), bkRp(h.pajak), tt("Billing & Tax Advance", "Billing & Tax Advance"))}
      ${kotak(tt("Biaya logistik", "Logistics cost"), bkRp(h.logistik), "Freight, Storage, Other Charge")}
    </div>
    <div class="bk-wrap mb-2">
      <table class="bk-tabel">
        <thead><tr>
          <th>${escapeHtml(tt("No. Pengajuan", "Request No."))}</th><th>${escapeHtml(tt("Tgl Invoice", "Invoice Date"))}</th>
          <th>Vendor</th><th>${escapeHtml(tt("Jenis", "Type"))}</th>
          <th>${escapeHtml(tt("Dibayar", "Paid amount"))}</th><th>Status</th>
        </tr></thead>
        <tbody>${isi}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td>${bkRp(h.total)}</td><td>${escapeHtml(statusTotal)}</td></tr></tfoot>
      </table>
    </div>
    ${h.nilaiBarang ? `<div class="form-text-note">${escapeHtml(tt(
      `Nilai barang ${bkRp(h.nilaiBarang)} (kurs ${h.impor ? "NDPBM" : "pajak"} ${bkRp(h.kursBarang)}) — biaya kiriman ini ${(h.persen * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari nilai barang.`,
      `Goods value ${bkRp(h.nilaiBarang)} (${h.impor ? "NDPBM" : "tax"} rate ${bkRp(h.kursBarang)}) — this shipment's cost is ${(h.persen * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% of the goods value.`))}</div>` : ""}`;
}

/* Bagian di panel detail: kerangka langsung, isinya menyusul. */
function biayaKirimanKerangka(s) {
  return `
    <div class="subsection-title"><i class="bi bi-calculator"></i> ${tt("Biaya Kiriman Ini", "This Shipment's Cost")}</div>
    <div id="detailBiaya" data-id="${escapeAttr(s.id)}"><div class="form-text-note">${escapeHtml(tt("Memuat biaya…", "Loading costs…"))}</div></div>`;
}

async function isiBiayaKiriman(s) {
  const wadah = () => {
    const el = document.getElementById("detailBiaya");
    return el && el.dataset.id === String(s.id) ? el : null; // panel sudah pindah kiriman lain -> abaikan
  };
  try {
    const [rows] = await Promise.all([bkAmbilDana(), typeof muatKursPajak === "function" ? muatKursPajak() : null]);
    const kursFn = (mata, tgl) => (typeof kursPajakPada === "function" ? kursPajakPada(mata, tgl).nilai : 0);
    const el = wadah();
    if (el) el.innerHTML = bkHtml(s, hitungBiayaKiriman(s, bkCocokkan(s, rows), kursFn));
  } catch (e) {
    console.warn("Biaya kiriman tidak termuat:", e);
    const el = wadah();
    if (el) el.innerHTML = `<div class="form-text-note">${escapeHtml(tt("Biaya kiriman tidak bisa dimuat.", "Shipment costs could not be loaded."))}</div>`;
  }
}
