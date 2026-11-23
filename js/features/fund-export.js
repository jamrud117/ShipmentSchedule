"use strict";

/* ------------------------------------------------------------------
   EXPORT EXCEL PENGAJUAN DANA

   Tombol Export di riwayat Pengajuan Dana (juga di tab Summary; tab
   Report punya unduhan sendiri) membuka kotak dialog dengan SARINGANNYA
   SENDIRI -- data yang diekspor dipilih di sana, lepas dari saringan
   riwayat di belakangnya:
     - Status bayar: Semua / Lunas / Belum Lunas (payload.paidAt);
     - Vendor ("Dibayarkan Kepada"): ejaan yang hanya beda huruf besar /
       tanda baca ("PT. WIDE LOGISTICS", "PT WIDE LOGISTICS") satu vendor;
     - Rentang tanggal menurut Tanggal Invoice ATAU Jatuh Tempo.
   Jumlah pengajuan, totalnya, dan beberapa baris pertama tampil langsung
   setiap saringan diubah: yang diunduh persis yang terlihat. Pilihan
   saringan bertahan selama halaman terbuka.

   Seluruh Pengajuan Dana dimuat sekali tiap dialog dibuka (per 1.000,
   batas satu permintaan Supabase) -- pengajuan yang baru terbit langsung
   ikut; saringan dihitung di aplikasi, jadi mengganti pilihan instan.

   BERKAS: satu lembar "Fund Request", kolom berurutan seperti diminta:
     Subject | Nominal | Due Date | Drafter | Vendor Name | Invoice No. | Invoice Date
   Subject = Rincian (Subject pada surat cetak); Nominal = jumlah akhir
   pengajuan (frTotalPengajuan: angka yang sama dengan "Terbilang" di
   surat, kolom Nilai di riwayat, Cost di Summary); Drafter = pembuat
   pengajuan; Invoice No. = isi kolom Nomor Billing/Invoice di riwayat
   (Billing -> Nomor Billing; selainnya No. Invoice + invoice / debit
   note tambahan, satu nomor per baris di selnya). Tanggal = tanggal
   Excel sungguhan (dd-mm-yyyy),
   Nominal = angka, nomor = TEKS (nomor billing 15 angka tidak berubah
   jadi 6,4E+14). Urut menurut tanggal yang dipakai saringan, terlama
   dulu. Di bawahnya baris TOTAL: SUBTOTAL(109) -- ikut menyusut kalau
   tabelnya disaring lagi di Excel; mata uang campuran dijumlah per mata
   uang dan tiap nominal berawalan kodenya ("USD 1,250.00").
------------------------------------------------------------------ */

const FEX_KOLOM = [
  { judul: "Subject", lebar: 46, ambil: (b) => b.subject, kiri: true, bungkus: true },
  { judul: "Nominal", lebar: 18, ambil: (b) => b.nominal, uang: true },
  { judul: "Due Date", lebar: 13, ambil: (b) => b.jatuhTempo, tanggal: true },
  { judul: "Drafter", lebar: 16, ambil: (b) => b.drafter, kiri: true },
  // Dibungkus: nama vendor panjang tidak terpotong oleh sel di sebelahnya; invoice /
  // debit note tambahan masing-masing di baris sendiri dalam selnya -- " / " membuat
  // Excel memotong di tanda hubung nomornya ("DN-" | "77/XI/2026")
  { judul: "Vendor Name", lebar: 30, ambil: (b) => b.vendor, kiri: true, bungkus: true },
  { judul: "Invoice No.", lebar: 24, ambil: (b) => b.nomorDaftar.join("\n"), kiri: true, bungkus: true },
  { judul: "Invoice Date", lebar: 13, ambil: (b) => b.tglInvoice, tanggal: true },
];
const FEX_SARINGAN_AWAL = { bayar: "", vendor: "", dasar: "invoice", dari: "", sampai: "" };
const fexSaringan = Object.assign({}, FEX_SARINGAN_AWAL);
const FEX_PRATINJAU = 5; // baris contoh di dialog
const FEX_PER_AMBIL = 1000;

/* ----------------------------- data ------------------------------ */

const fexIso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");
// Kunci vendor: huruf & angka saja -- "PT. Wide Logistics" = "PT WIDE LOGISTICS"
const fexKunciVendor = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
// Rupiah tanpa sen (dibulatkan seperti totalnya), mata uang lain dua desimal
const fexBulat = (n, m) => (m === "IDR" ? Math.round(Number(n) || 0) : Math.round((Number(n) || 0) * 100) / 100);

/* Sama dengan kolom Nomor Billing/Invoice riwayat Pengajuan Dana (docnum-view.js):
   Billing -> [Nomor Billing]; selainnya No. Invoice + invoice / debit note tambahan. */
function fexNomorTagihan(p) {
  if (String(p.billingNo || "").trim()) return [String(p.billingNo).trim()];
  const semua = typeof fundSemuaNomor === "function" ? fundSemuaNomor(p) : [p.invoiceNo];
  return semua.map((x) => String(x || "").trim()).filter(Boolean);
}

// Satu baris document_numbers (doc_type "fund") -> satu baris ekspor
function fexBaris(r) {
  const p = (r && r.payload) || {};
  const mataUang = String(p.currency || "IDR").trim().toUpperCase() || "IDR";
  return {
    id: r.id,
    nomorSurat: String(r.doc_number || ""),
    subject: String(p.notes || "").trim(),
    nominal: fexBulat(typeof frTotalPengajuan === "function" ? frTotalPengajuan(p) : 0, mataUang),
    mataUang,
    jatuhTempo: fexIso(p.invoiceDueDate),
    // kolom requester (yang diubah Ubah Isian); payload.requester untuk data lama -- "Made by" surat cetak
    drafter: String(r.requester || p.requester || "").trim(),
    vendor: String(p.payee || "").trim(),
    nomorDaftar: fexNomorTagihan(p),
    nomor: fexNomorTagihan(p).join(" / "), // pratinjau dialog, seperti di riwayat
    tglInvoice: fexIso(p.invoiceDate),
    lunas: !!p.paidAt,
  };
}

/* Saringan dialog. Rentang tanggal menurut f.dasar ("invoice" | "jatuhTempo");
   pengajuan yang tanggal itu kosong tidak bisa dinilai, jadi tidak ikut
   SELAMA rentangnya diisi (sama dengan saringan rentang di riwayat). */
function fexSaring(baris, f) {
  const s = f || {};
  return baris.filter((b) => {
    if (s.bayar === "lunas" && !b.lunas) return false;
    if (s.bayar === "belum" && b.lunas) return false;
    if (s.vendor && fexKunciVendor(b.vendor) !== s.vendor) return false;
    const tgl = s.dasar === "jatuhTempo" ? b.jatuhTempo : b.tglInvoice;
    if ((s.dari || s.sampai) && !tgl) return false;
    if (s.dari && tgl < s.dari) return false;
    if (s.sampai && tgl > s.sampai) return false;
    return true;
  });
}

// Urut menurut tanggal saringan (terlama dulu; tanpa tanggal di akhir), lalu nomor surat
function fexUrut(baris, dasar) {
  const tgl = (b) => (dasar === "jatuhTempo" ? b.jatuhTempo : b.tglInvoice);
  return baris.slice().sort((a, b) => {
    const x = tgl(a), y = tgl(b);
    if (x !== y) return !x ? 1 : !y ? -1 : x < y ? -1 : 1;
    return a.nomorSurat.localeCompare(b.nomorSurat, undefined, { numeric: true });
  });
}

/* Pilihan vendor: [{ kunci, nama, jumlah }] urut nama. Nama = ejaan yang
   paling sering dipakai untuk vendor itu; kalau seri, ejaan yang muncul
   lebih dulu -- data dimuat terbaru dulu, jadi ejaan pengajuan terbaru. */
function fexDaftarVendor(baris) {
  const peta = new Map();
  baris.forEach((b) => {
    const kunci = fexKunciVendor(b.vendor);
    if (!kunci) return;
    const v = peta.get(kunci) || { kunci, ejaan: new Map(), jumlah: 0 };
    v.jumlah += 1;
    v.ejaan.set(b.vendor, (v.ejaan.get(b.vendor) || 0) + 1);
    peta.set(kunci, v);
  });
  return [...peta.values()]
    .map((v) => ({ kunci: v.kunci, nama: [...v.ejaan].sort((a, b) => b[1] - a[1])[0][0], jumlah: v.jumlah }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

// Total per mata uang, rupiah lebih dulu: [[mataUang, total]]
function fexTotal(baris) {
  const per = new Map();
  baris.forEach((b) => per.set(b.mataUang, (per.get(b.mataUang) || 0) + b.nominal));
  return [...per]
    .map(([m, n]) => [m, fexBulat(n, m)])
    .sort((a, b) => (a[0] === "IDR" ? -1 : b[0] === "IDR" ? 1 : a[0].localeCompare(b[0])));
}

/* Nama berkas menyebut saringannya: Fund_Request_Unpaid_PT_WIDE_LOGISTICS_Due_2026-11-01_2026-11-30.xlsx.
   Tanpa rentang tanggal: tanggal ekspor. */
function fexNamaBerkas(f, daftarVendor, hariIni) {
  const s = f || {};
  const bagian = ["Fund_Request"];
  if (s.bayar) bagian.push(s.bayar === "lunas" ? "Paid" : "Unpaid");
  if (s.vendor) {
    const v = (daftarVendor || []).find((x) => x.kunci === s.vendor);
    bagian.push(String(v ? v.nama : s.vendor).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30));
  }
  if (s.dari || s.sampai) bagian.push(`${s.dasar === "jatuhTempo" ? "Due" : "Inv"}_${s.dari || s.sampai}_${s.sampai || s.dari}`);
  else bagian.push(hariIni || todayISO());
  return bagian.filter(Boolean).join("_") + ".xlsx";
}

async function fexAmbilSemua() {
  const semua = [];
  for (let mulai = 0; mulai < 50 * FEX_PER_AMBIL; mulai += FEX_PER_AMBIL) {
    const { data, error } = await supabaseClient
      .from("document_numbers")
      .select("id, doc_number, doc_date, requester, department, payload, created_at")
      .eq("doc_type", "fund")
      .order("created_at", { ascending: false })
      .order("id")
      .range(mulai, mulai + FEX_PER_AMBIL - 1);
    if (error) throw error;
    semua.push(...(data || []));
    if (!data || data.length < FEX_PER_AMBIL) break;
  }
  return semua;
}

/* ---------------------------- berkas ----------------------------- */

// Tengah malam UTC: ExcelJS menghitung nomor seri dari waktu UTC (lihat nativeFormatter.date)
function fexTanggalExcel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
function fexFormatUang(mataUang, campur) {
  const pola = mataUang === "IDR" ? "#,##0" : "#,##0.00";
  return campur ? `"${mataUang} "${pola}` : pola;
}

function fexSusunWorkbook(baris) {
  const NAVY = typeof XL_NAVY !== "undefined" ? XL_NAVY : "FF0A1B33";
  const TEPI = typeof XL_TEPI !== "undefined" ? XL_TEPI : "FFDFE5ED";
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();
  const ws = wb.addWorksheet("Fund Request", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = FEX_KOLOM.map((k) => ({ width: k.lebar }));
  const total = fexTotal(baris);
  const campur = total.length > 1;
  const garis = { style: "thin", color: { argb: TEPI } };
  const tepi = { top: garis, left: garis, bottom: garis, right: garis };

  const kepala = ws.addRow(FEX_KOLOM.map((k) => k.judul));
  kepala.height = 22;
  kepala.eachCell((sel) => {
    sel.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    sel.alignment = { horizontal: "center", vertical: "middle" };
    sel.border = tepi;
  });
  baris.forEach((b) => {
    const row = ws.addRow(FEX_KOLOM.map((k) => {
      const v = k.ambil(b);
      if (k.tanggal) return fexTanggalExcel(v);
      if (k.uang) return v;
      return v ? String(v) : null;
    }));
    FEX_KOLOM.forEach((k, i) => {
      const sel = row.getCell(i + 1);
      sel.font = { name: "Calibri", size: 11, color: { argb: "FF1C2B45" } };
      sel.border = tepi;
      sel.alignment = { horizontal: k.uang ? "right" : k.tanggal ? "center" : "left", vertical: "middle", wrapText: !!k.bungkus };
      if (k.uang) sel.numFmt = fexFormatUang(b.mataUang, campur);
      if (k.tanggal) sel.numFmt = "dd-mm-yyyy";
    });
  });

  const akhir = baris.length + 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: akhir, column: FEX_KOLOM.length } };
  if (!baris.length) return wb;
  /* TOTAL satu baris kosong di bawah tabel (di luar jangkauan saringan
     Excel). Satu mata uang: SUBTOTAL(109) -- hanya baris yang terlihat,
     jadi ikut menyusut saat tabelnya disaring; hasilnya ikut disimpan
     supaya pratinjau tanpa hitung ulang pun benar. */
  const cUang = FEX_KOLOM.findIndex((k) => k.uang) + 1;
  const huruf = ws.getColumn(cUang).letter;
  total.forEach(([m, n], i) => {
    const row = ws.getRow(akhir + 2 + i);
    row.getCell(1).value = campur ? `TOTAL ${m}` : "TOTAL";
    const sel = row.getCell(cUang);
    sel.value = campur ? n : { formula: `SUBTOTAL(109,${huruf}2:${huruf}${akhir})`, result: n };
    sel.numFmt = fexFormatUang(m, campur);
    sel.alignment = { horizontal: "right", vertical: "middle" };
    sel.border = { top: { style: "thin", color: { argb: "FF1C2B45" } }, bottom: { style: "double", color: { argb: "FF1C2B45" } } };
    [row.getCell(1), sel].forEach((c) => (c.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1C2B45" } }));
  });
  return wb;
}

// Diunduh lewat tautan sementara (sama dengan Bulk Export / laporan); dipisah supaya bisa diganti di uji
function fexSimpanBerkas(blob, nama) {
  const tautan = document.createElement("a");
  tautan.href = URL.createObjectURL(blob);
  tautan.download = nama;
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
}

async function fexUnduh(baris, nama) {
  await ensureExcelJS(); // pustaka Excel diunduh saat dibutuhkan saja
  const buf = await fexSusunWorkbook(baris).xlsx.writeBuffer();
  fexSimpanBerkas(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nama);
}

/* ---------------------------- dialog ----------------------------- */

let fexSemua = null;   // seluruh Pengajuan Dana (baris ekspor), dimuat tiap dialog dibuka
let fexGalat = null;   // galat muat terakhir
let fexMuatKe = 0;     // penanda muatan: jawaban yang terlambat dibuang
let fexPemilih = null; // pemilih rentang tanggal di dialog
let fexModal = null;
let fexSibuk = false;

const fexDialog = () => document.getElementById("danaEksporModal");
const fexHasil = () => (fexSemua ? fexUrut(fexSaring(fexSemua, fexSaringan), fexSaringan.dasar) : []);
const fexTeksTotal = (baris) => fexTotal(baris).map(([m, n]) => escapeHtml(typeof frNilai === "function" ? frNilai(n, m) : `${m} ${n}`)).join(" + ");

function fexIsiDialogHtml() {
  const f = fexSaringan;
  const bayar = [["", tt("Semua", "All")], ["lunas", tt("Lunas", "Paid")], ["belum", tt("Belum Lunas", "Unpaid")]];
  return `
    <div class="dialog-head">
      <div class="dialog-icon" aria-hidden="true"><i class="bi bi-file-earmark-spreadsheet"></i></div>
      <h6 class="dialog-title" id="danaEksporJudul">${escapeHtml(tt("Export Excel Pengajuan Dana", "Export Fund Requests to Excel"))}</h6>
      <button type="button" class="dialog-tutup" data-bs-dismiss="modal" aria-label="${escapeAttr(tt("Tutup", "Close"))}" title="${escapeAttr(tt("Tutup (Esc)", "Close (Esc)"))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
    </div>
    <div class="modal-body dialog-body">
      <p class="dialog-text">${escapeHtml(tt(
        "Pilih pengajuan yang diekspor. Kolom: Subject, Nominal, Due Date, Drafter, Vendor Name, Invoice No., Invoice Date.",
        "Choose the requests to export. Columns: Subject, Nominal, Due Date, Drafter, Vendor Name, Invoice No., Invoice Date."))}</p>
      <div class="fex-saring">
        <div class="prompt-field">
          <span class="prompt-label" id="fexLabelBayar">${escapeHtml(tt("Status bayar", "Payment status"))}</span>
          <div class="fex-seg" role="radiogroup" aria-labelledby="fexLabelBayar">${bayar
            .map(([v, teks]) => `<label class="fex-seg-pilih"><input type="radio" name="fexBayar" value="${v}"${f.bayar === v ? " checked" : ""}><span>${escapeHtml(teks)}</span></label>`)
            .join("")}</div>
        </div>
        <div class="prompt-field">
          <label class="prompt-label" for="fexVendor">Vendor</label>
          <select class="login-input" id="fexVendor" data-fex="vendor"></select>
        </div>
        <div class="prompt-field">
          <span class="prompt-label" id="fexLabelTanggal">${escapeHtml(tt("Rentang tanggal", "Date range"))}</span>
          <div class="fex-tanggal" role="group" aria-labelledby="fexLabelTanggal">
            <select class="login-input fex-dasar" id="fexDasar" data-fex="dasar" aria-label="${escapeAttr(tt("Rentang tanggal menurut", "Date range by"))}">
              <option value="invoice"${f.dasar === "invoice" ? " selected" : ""}>${escapeHtml(tt("Tanggal Invoice", "Invoice Date"))}</option>
              <option value="jatuhTempo"${f.dasar === "jatuhTempo" ? " selected" : ""}>${escapeHtml(tt("Jatuh Tempo", "Due Date"))}</option>
            </select>
            <div class="fex-rentang" id="fexRentang"></div>
          </div>
        </div>
      </div>
      <div class="fex-pratinjau" id="fexPratinjau" aria-live="polite"></div>
    </div>
    <div class="modal-footer dialog-foot">
      <button type="button" class="btn-quiet fex-reset" data-fex-reset><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
      <button type="button" class="btn-quiet" data-bs-dismiss="modal">${escapeHtml(tt("Batal", "Cancel"))}</button>
      <button type="button" class="btn-primary-navy fex-unduh" id="danaEksporUnduh" data-fex-unduh disabled><i class="bi bi-download"></i> ${escapeHtml(tt("Unduh Excel", "Download Excel"))}</button>
    </div>`;
}

// Pilihan vendor dari seluruh Pengajuan Dana (bukan yang sudah tersaring: memilih satu tidak menghilangkan yang lain)
function fexIsiVendor() {
  const sel = document.getElementById("fexVendor");
  if (!sel) return;
  const daftar = fexSemua ? fexDaftarVendor(fexSemua) : [];
  if (fexSaringan.vendor && !daftar.some((v) => v.kunci === fexSaringan.vendor)) fexSaringan.vendor = "";
  sel.innerHTML = `<option value="">${escapeHtml(tt("Semua vendor", "All vendors"))}</option>` +
    daftar.map((v) => `<option value="${escapeAttr(v.kunci)}"${v.kunci === fexSaringan.vendor ? " selected" : ""}>${escapeHtml(v.nama)} (${v.jumlah})</option>`).join("");
  sel.disabled = !fexSemua;
}

function fexGambarPratinjau() {
  const box = document.getElementById("fexPratinjau");
  const tombol = document.querySelector("[data-fex-unduh]");
  if (!box) return;
  const hasil = fexHasil();
  if (tombol && !fexSibuk) tombol.disabled = !hasil.length;
  if (fexGalat) {
    box.innerHTML = `<div class="fex-pesan fex-pesan--galat"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(tt("Data Pengajuan Dana gagal dimuat.", "The fund requests could not be loaded."))}
      <button type="button" class="btn-quiet fex-ulang" data-fex-ulang>${escapeHtml(tt("Coba lagi", "Try again"))}</button></div>`;
    return;
  }
  if (!fexSemua) {
    box.innerHTML = `<div class="fex-pesan"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${escapeHtml(tt("Memuat Pengajuan Dana…", "Loading fund requests…"))}</div>`;
    return;
  }
  if (!hasil.length) {
    box.innerHTML = `<div class="fex-pesan"><i class="bi bi-inbox"></i> ${escapeHtml(tt("Tidak ada pengajuan yang cocok dengan saringan ini.", "No requests match these filters."))}</div>`;
    return;
  }
  const jatuh = fexSaringan.dasar === "jatuhTempo";
  /* Tiga kolom: No. Invoice di bawah nama vendor (bukan kolom sendiri) --
     tabelnya tetap muat di ponsel 360px tanpa menggeser Nominal keluar. */
  const contoh = hasil.slice(0, FEX_PRATINJAU).map((b) => `
    <tr>
      <td class="fex-vendor">${escapeHtml(b.vendor || "—")}${b.nomor ? `<span class="fex-nomor">${escapeHtml(b.nomor)}</span>` : ""}</td>
      <td class="fex-nowrap">${escapeHtml(fmtDate(jatuh ? b.jatuhTempo : b.tglInvoice) || "—")}</td>
      <td class="fex-angka">${escapeHtml(typeof frNilai === "function" ? frNilai(b.nominal, b.mataUang) : String(b.nominal))}</td>
    </tr>`).join("");
  const sisa = hasil.length - FEX_PRATINJAU;
  box.innerHTML = `
    <div class="fex-ringkas">${tt(
      `<b>${hasil.length}</b> pengajuan · Total <b>${fexTeksTotal(hasil)}</b>`,
      `<b>${hasil.length}</b> request${hasil.length === 1 ? "" : "s"} · Total <b>${fexTeksTotal(hasil)}</b>`)}</div>
    <table class="fex-tabel">
      <thead><tr><th>Vendor · Invoice No.</th><th>${escapeHtml(jatuh ? "Due Date" : "Invoice Date")}</th><th class="fex-angka">Nominal</th></tr></thead>
      <tbody>${contoh}</tbody>
    </table>
    ${sisa > 0 ? `<div class="fex-lagi">${escapeHtml(tt(`… dan ${sisa} pengajuan lainnya`, `… and ${sisa} more`))}</div>` : ""}`;
}

// Isi dialog digambar ulang tiap dibuka (bahasa saat itu) & saat Reset; data yang sudah dimuat dipakai lagi
function fexGambarDialog() {
  const el = fexDialog();
  const konten = el && el.querySelector(".modal-content");
  if (!konten) return;
  if (fexPemilih) fexPemilih.lepas();
  konten.innerHTML = fexIsiDialogHtml();
  fexPemilih = typeof buatRentangTanggal === "function"
    ? buatRentangTanggal(document.getElementById("fexRentang"), {
        pintas: [
          { label: () => t("u.minggu.ini"), rentang: RENTANG_PINTAS.mingguIni },
          { label: () => t("u.bulan.ini"), rentang: RENTANG_PINTAS.bulanIni },
          { label: () => t("u.bulan.lalu"), rentang: RENTANG_PINTAS.bulanLalu },
          // Jatuh tempo bulan depan: tagihan yang sebentar lagi harus dibayar
          { label: () => tt("Bulan Depan", "Next Month"), rentang: () => {
            const kini = new Date();
            return [drpIsoOf(kini.getFullYear(), kini.getMonth() + 1, 1), drpIsoOf(kini.getFullYear(), kini.getMonth() + 2, 0)];
          } },
          { label: () => t("u.tahun.ini"), rentang: RENTANG_PINTAS.tahunIni },
        ],
        awal: [fexSaringan.dari, fexSaringan.sampai],
        onApply: (a, b) => {
          fexSaringan.dari = a;
          fexSaringan.sampai = b;
          fexGambarPratinjau();
        },
      })
    : null;
  fexIsiVendor();
  fexGambarPratinjau();
}

async function fexMuat() {
  const ke = ++fexMuatKe;
  fexSemua = null;
  fexGalat = null;
  fexIsiVendor();
  fexGambarPratinjau();
  try {
    const baris = (await fexAmbilSemua()).map(fexBaris);
    if (ke !== fexMuatKe) return;
    fexSemua = baris;
  } catch (e) {
    console.error(e);
    if (ke !== fexMuatKe) return;
    fexGalat = e;
  }
  fexIsiVendor();
  fexGambarPratinjau();
}

function fexBuka() {
  const el = fexDialog();
  if (!el || typeof bootstrap === "undefined") return;
  fexModal = fexModal || bootstrap.Modal.getOrCreateInstance(el);
  fexGambarDialog();
  fexModal.show();
  return fexMuat();
}

async function fexKlikUnduh() {
  const hasil = fexHasil();
  const tombol = document.querySelector("[data-fex-unduh]");
  if (!hasil.length || fexSibuk || !tombol) return;
  fexSibuk = true;
  const isiAsli = tombol.innerHTML;
  tombol.disabled = true;
  tombol.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${escapeHtml(tt("Menyiapkan…", "Preparing…"))}`;
  try {
    await fexUnduh(hasil, fexNamaBerkas(fexSaringan, fexDaftarVendor(fexSemua)));
    if (fexModal) fexModal.hide();
    showToast(tt(`Excel Pengajuan Dana diunduh: ${hasil.length} pengajuan.`, `Fund request Excel downloaded: ${hasil.length} request${hasil.length === 1 ? "" : "s"}.`), "success");
  } catch (e) {
    console.error(e);
    // Sebabnya disebut -- satu-satunya petunjuk untuk yang memperbaikinya
    showToast(tt(`Excel gagal dibuat: ${(e && e.message) || "kesalahan tidak diketahui"}`, `The Excel file could not be created: ${(e && e.message) || "unknown error"}`), "danger");
  } finally {
    fexSibuk = false;
    if (tombol.isConnected) {
      tombol.innerHTML = isiAsli;
      tombol.disabled = !fexHasil().length;
    }
  }
}

/* Pendengar sekali untuk seluruh dialog -- isinya digambar ulang terus */
document.addEventListener("click", (e) => {
  const el = e.target && e.target.closest ? e.target : null;
  if (!el) return;
  if (el.closest("#btnDnEkspor")) {
    fexBuka();
    return;
  }
  if (!el.closest("#danaEksporModal")) return;
  if (el.closest("[data-fex-unduh]")) fexKlikUnduh();
  else if (el.closest("[data-fex-ulang]")) fexMuat();
  else if (el.closest("[data-fex-reset]")) {
    Object.assign(fexSaringan, FEX_SARINGAN_AWAL);
    fexGambarDialog();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (!el || !el.closest || !el.closest("#danaEksporModal")) return;
  if (el.name === "fexBayar") fexSaringan.bayar = el.value;
  else if (el.dataset.fex === "vendor") fexSaringan.vendor = el.value;
  else if (el.dataset.fex === "dasar") fexSaringan.dasar = el.value === "jatuhTempo" ? "jatuhTempo" : "invoice";
  else return;
  fexGambarPratinjau();
});
/* Esc saat kalender rentang terbuka menutup KALENDERNYA saja, bukan
   seluruh dialog: ditangkap lebih dulu (fase capture) dari pendengar
   Bootstrap di elemen dialog yang sama. */
(() => {
  const el = fexDialog();
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const pemicu = el.querySelector('#fexRentang [data-rt="pemicu"][aria-expanded="true"]');
    if (!pemicu) return;
    e.stopPropagation();
    e.preventDefault();
    pemicu.click();
  }, true);
})();
