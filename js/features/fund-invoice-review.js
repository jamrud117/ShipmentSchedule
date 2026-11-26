/* ==================================================================
   SPLIT INVOICE -- REVIEW SATU PER SATU SEBELUM DISIMPAN
   (modul tunda, sesudah fund-invoice-import.js)

   Menu "Isi dari Invoice / Billing" -> Split Invoice: semua dokumen yang
   terbaca dari berkas-berkas (satu PDF scan 10 halaman = 10 invoice) masing-
   masing menjadi PENGAJUAN SENDIRI. Pop-up #danaReviewModal menampilkannya
   satu per satu:

     kiri   gambar dokumennya (halaman PDF / foto, ditegakkan seperti OCR-nya:
            halaman lanskap 90° / 270°, scan terbalik 180°) -- pembanding;
     kanan  isian yang terbaca (vendor, nomor, tanggal, BL/AWB, jenis, Rincian),
            rincian biaya (uraian, nilai, tarif PPN), jumlah + GRAND TOTAL yang
            bisa disesuaikan, dan hasil pemeriksaan: total cocok dengan invoice,
            nomor yang belum terbaca, tagihan yang sudah pernah diajukan,
            perbaikan otomatis & hasil belajar (fund-ocr-belajar.js).

   "Simpan & Lanjut" memakai FORM Pengajuan Dana yang sebenarnya sebagai
   mesinnya: dokumen diisikan ke form (danaIsiForm -- aturan vendor, Rincian,
   isian otomatis jadwal ikut berjalan), diterbitkan lewat submitDocNumRequest
   ({ review: true }) -- validasi, pemeriksaan tagihan ganda & nomor urut
   atomik yang sama persis dengan tombol Ajukan --, lalu isi form pengguna
   sebelum review DIKEMBALIKAN (dnFotoDraf / dnPulihkanDraf). Review tidak
   pernah menghapus isian yang sedang diketik.

   Ditutup sebelum selesai: invoice yang belum disimpan tetap menunggu --
   tombol "Lanjutkan review" di kepala form membukanya lagi. Unggahan Split
   berikutnya menggantikan sesi itu.
================================================================== */

let drSesi = null;
let drModal = null;
let drPratinjauKe = 0;
let drGandaJeda = null;

const DR_STATUS = {
  tunggu: { ikon: "bi-circle", id: "Belum", en: "Pending" },
  simpan: { ikon: "bi-check-circle-fill", id: "Tersimpan", en: "Saved" },
  lewat: { ikon: "bi-skip-forward-circle", id: "Dilewati", en: "Skipped" },
};

const drEl = (id) => document.getElementById(id);
// Petunjuk pintasan papan ketik hanya untuk perangkat ber-tetikus (bukan layar sentuh)
const drPapanKetik = () => !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
const drItem = () => (drSesi ? drSesi.daftar[drSesi.i] : null);
const drSisa = () => (drSesi ? drSesi.daftar.filter((x) => x.status === "tunggu").length : 0);
const drUang = (n, mata) => (typeof frNilai === "function" ? frNilai(n, mata || "IDR") : fmtRp(n));

/* ------------------------------------------------------------------
   SESI
------------------------------------------------------------------ */

/* Hasil baca (bacaInvoiceVendor + sumber gambarnya) -> butir review. Rincian
   memakai angka (bukan teks) supaya bisa diketik ulang seperti di form. */
function drButir(h) {
  const x = h;
  x.currency = String(x.currency || "IDR").toUpperCase();
  x.lines = (x.lines || []).map((l) => Object.assign({}, l, { amount: typeof l.amount === "number" ? l.amount : danaAngka(l.amount) }));
  const butir = { h: x, status: "tunggu", nomor: "", galat: "", ganda: null, totalSendiri: false, rincianSendiri: false };
  drSelaraskanTotal(butir);
  return butir;
}

/* Mulai sesi Split dari daftar dokumen terbaca (danaDariBerkasPdf). Billing &
   dokumen tanpa rincian tetap ikut -- tiap dokumen satu pengajuan.
   opsi.memuat = halaman berikutnya masih dibaca: invoice selanjutnya menyusul lewat
   danaReviewTambah, lalu danaReviewSelesaiBaca. */
function danaReviewMulai(dokumen, catatan, opsi) {
  if (!Array.isArray(dokumen) || !dokumen.length) return;
  drSesi = { daftar: dokumen.map(drButir), i: 0, catatan: (catatan || []).slice(), memuat: !!(opsi && opsi.memuat), baca: null };
  if (typeof hideToast === "function") hideToast(); // "Membaca invoice…" digantikan pop-up ini
  drTampilkan();
  drPeriksaGandaSemua();
}

/* Invoice berikutnya yang selesai dibaca selagi review berjalan */
function danaReviewTambah(h) {
  if (!drSesi) return danaReviewMulai([h], [], { memuat: true });
  const butir = drButir(h);
  drSesi.daftar.push(butir);
  if (drSesi.rows) drPeriksaGanda(butir);
  // Sedang menunggu invoice berikutnya: langsung tampil
  if (drSesi.menunggu) {
    drSesi.menunggu = false;
    drKe(drSesi.daftar.length - 1);
  } else {
    drGambarKepala();
    drGambarLangkah();
    drGambarKaki();
  }
  drPerbaruiTombolLanjut();
}

/* Semua berkas selesai dibaca */
function danaReviewSelesaiBaca(catatan) {
  if (!drSesi) return;
  drSesi.memuat = false;
  drSesi.baca = null;
  (catatan || []).forEach((c) => drSesi.catatan.push(c));
  if (drSesi.menunggu) {
    drSesi.menunggu = false;
    drLanjut();
  } else {
    drGambarKepala();
    drGambarLangkah();
    drGambarKaki();
  }
  drPerbaruiTombolLanjut();
}

/* Kemajuan membaca (danaLaporOcr) -> butir "membaca" di deret langkah */
function drLaporBaca(m) {
  if (!drSesi || !drSesi.memuat) return;
  drSesi.baca = m;
  const el = drEl("drLangkahBaca");
  if (el) el.querySelector(".dr-langkah-baca-teks").textContent = drTeksBaca();
  const tunggu = drEl("drTungguTeks");
  if (tunggu) tunggu.textContent = drTeksBaca();
}
const drTeksBaca = () => {
  const m = drSesi && drSesi.baca;
  if (!m || !m.dari) return tt("Membaca halaman berikutnya…", "Reading the next pages…");
  const berkas = m.jumlahBerkas > 1 ? ` · ${tt("berkas", "file")} ${m.berkas}/${m.jumlahBerkas}` : "";
  return tt(`Membaca halaman ${m.halaman}/${m.dari}${berkas}…`, `Reading page ${m.halaman}/${m.dari}${berkas}…`);
};

function drTampilkan() {
  const el = drEl("danaReviewModal");
  if (!el || typeof bootstrap === "undefined" || !drSesi) return;
  drModal = drModal || bootstrap.Modal.getOrCreateInstance(el);
  drGambar();
  drModal.show();
  drPerbaruiTombolLanjut();
}

/* Tombol "Lanjutkan review · n" di kepala form (sesi yang ditutup sebelum selesai) */
function drPerbaruiTombolLanjut() {
  const b = drEl("btnDanaLanjutReview");
  if (!b) return;
  const sisa = drSisa();
  const tampil = !!drSesi && (sisa > 0 || drSesi.memuat);
  b.classList.toggle("d-none", !tampil);
  if (tampil) {
    const membaca = drSesi.memuat ? tt(" · membaca…", " · reading…") : "";
    b.innerHTML = `<i class="bi bi-layout-split" aria-hidden="true"></i> ${escapeHtml(tt(`Lanjutkan review · ${sisa} invoice${membaca}`, `Resume review · ${sisa} invoice${sisa === 1 ? "" : "s"}${membaca}`))}`;
  }
}

/* ------------------------------------------------------------------
   HITUNGAN & PEMERIKSAAN
------------------------------------------------------------------ */

const drTotal = (h) => fundLineTotals(h.lines, h.currency, h.payee, [], h.totalManual || null);

/* TOTAL invoice yang hanya beda pembulatan (<= Rp 2) dipakai sebagai TOTAL
   manual -- sama dengan impor ke form (danaPakaiTotalInvoice) -- selama
   pengguna belum mengetik TOTAL sendiri. Rincian diubah lalu cocok lagi:
   dipakai lagi; tidak cocok: dilepas. */
function drSelaraskanTotal(butir) {
  const h = butir.h;
  if (butir.totalSendiri) return;
  delete h.totalManual;
  if (!(h.totalInvoice > 0) || !h.lines.length || h.jenisDokumen === "billing") return;
  const hitung = fundLineTotals(h.lines, h.currency, h.payee, [], null).grandTotal;
  const selisih = fundBulatSen(h.totalInvoice - hitung);
  if (selisih && Math.abs(selisih) <= DANA_SELISIH_PEMBULATAN) h.totalManual = { "": { nilai: h.totalInvoice, hitung } };
}

/* Tagihan yang sudah pernah diajukan: dari daftar Pengajuan Dana yang termuat
   (dnTagihanGandaLokal) + yang baru saja disimpan di sesi ini */
async function drPeriksaGandaSemua() {
  let rows = null;
  try {
    rows = typeof bkAmbilDana === "function" ? await bkAmbilDana() : null;
  } catch (e) {
    rows = null;
  }
  if (!drSesi) return;
  drSesi.rows = rows || [];
  drSesi.daftar.forEach(drPeriksaGanda);
  drGambarLangkah();
  drGambarPeriksa();
  drGambarKaki();
}

function drPeriksaGanda(butir) {
  if (!drSesi || butir.status !== "tunggu") return;
  const h = butir.h;
  const form = { invoiceNo: h.jenisDokumen === "billing" ? "" : h.invoiceNo || "", billingNo: h.billingNo || "", payee: h.payee || "", dokumen: [] };
  const tersimpan = drSesi.daftar.filter((x) => x.status === "simpan" && x.payload).map((x) => ({ id: "sesi-" + x.nomor, doc_number: x.nomor, payload: x.payload }));
  butir.ganda = typeof dnTagihanGandaLokal === "function" ? dnTagihanGandaLokal(form, (drSesi.rows || []).concat(tersimpan)) : null;
}

/* Daftar pemeriksaan satu butir: [{ jenis: "galat" | "awas" | "ok" | "info", teks }].
   "galat" menahan Simpan. */
function drPeriksa(butir) {
  const h = butir.h;
  const hasil = [];
  const billing = h.jenisDokumen === "billing";
  if (!String(h.payee || "").trim()) hasil.push({ jenis: "galat", teks: tt("Dibayarkan Kepada (vendor) belum terisi.", "Pay To (vendor) is empty.") });
  if (billing ? !String(h.billingNo || "").trim() : !String(h.invoiceNo || "").trim()) {
    hasil.push({ jenis: "galat", teks: billing
      ? tt("Nomor Billing tidak terbaca — isi dari gambar di kiri.", "Billing number could not be read — fill it in from the image.")
      : tt("Nomor invoice tidak terbaca — isi dari gambar di kiri.", "Invoice number could not be read — fill it in from the image.") });
  }
  if (butir.ganda) {
    const r = butir.ganda.baris;
    hasil.push({ jenis: "galat", teks: tt(`${butir.ganda.nomor} sudah diajukan di ${r.doc_number}${r.doc_date ? ` (${fmtDate(r.doc_date)})` : ""} — lewati invoice ini.`,
      `${butir.ganda.nomor} was already submitted in ${r.doc_number}${r.doc_date ? ` (${fmtDate(r.doc_date)})` : ""} — skip this invoice.`) });
  }
  if (!billing) {
    if (!h.lines.some((l) => String(l.desc || "").trim() || Number(l.amount))) hasil.push({ jenis: "awas", teks: tt("Belum ada rincian biaya.", "No cost lines yet.") });
    const r = drTotal(h);
    if (h.totalInvoice > 0) {
      const selisih = fundBulatSen(r.grandTotal - h.totalInvoice);
      if (!selisih) {
        hasil.push(r.manual && !butir.totalSendiri
          ? { jenis: "ok", teks: tt(`GRAND TOTAL mengikuti invoice ${drUang(h.totalInvoice, h.currency)} (hitungan ${drUang(r.grandTotalHitung, h.currency)}, beda pembulatan).`,
            `GRAND TOTAL follows the invoice ${drUang(h.totalInvoice, h.currency)} (computed ${drUang(r.grandTotalHitung, h.currency)}, a rounding difference).`) }
          : { jenis: "ok", teks: tt(`Total cocok dengan invoice: ${drUang(h.totalInvoice, h.currency)}.`, `Total matches the invoice: ${drUang(h.totalInvoice, h.currency)}.`) });
      } else {
        hasil.push({ jenis: "awas", teks: tt(`TOTAL di invoice ${drUang(h.totalInvoice, h.currency)}, hitungan ${drUang(r.grandTotal, h.currency)} (selisih ${drUang(Math.abs(selisih), h.currency)}) — cek rinciannya dengan gambar.`,
          `Invoice TOTAL ${drUang(h.totalInvoice, h.currency)}, computed ${drUang(r.grandTotal, h.currency)} (difference ${drUang(Math.abs(selisih), h.currency)}) — check the lines against the image.`) });
      }
    } else {
      hasil.push({ jenis: "awas", teks: tt("TOTAL invoice tidak terbaca — cocokkan jumlahnya dengan gambar.", "The invoice TOTAL could not be read — compare the amount with the image.") });
    }
  }
  (h.pulih || []).forEach((p) => hasil.push({ jenis: "info", teks: danaPesanPulih(p) }));
  // nilai tepat Qty x Rate -- selama barisnya belum diubah
  (h.tepat || []).filter((x) => h.lines.some((l) => Math.abs(parseRupiah(l.amount) - x.nilai) < 0.005)).forEach((x) => hasil.push({ jenis: "info", ikon: "bi-calculator", teks: danaPesanTepat(x) }));
  (h.belajar || []).forEach((b) => hasil.push({ jenis: "info", ikon: "bi-mortarboard", teks: b.teks }));
  if (h.ocr) hasil.push({ jenis: "info", ikon: "bi-eye", teks: tt("Dibaca dengan OCR — cocokkan angka & nomornya dengan gambar.", "Read with OCR — compare the numbers with the image.") });
  return hasil;
}

const drTertahan = (butir) => drPeriksa(butir).some((x) => x.jenis === "galat");

/* ------------------------------------------------------------------
   GAMBAR
------------------------------------------------------------------ */

function drGambar() {
  if (!drSesi) return;
  drGambarKepala();
  drGambarLangkah();
  const badan = drEl("danaReviewBadan");
  if (!badan) return;
  if (!drSisa() && drSesi.selesai) {
    badan.innerHTML = drRingkasanHtml();
    drGambarKaki();
    return;
  }
  // Semua yang sudah terbaca selesai direview, berkas masih dibaca: menunggu invoice berikutnya
  if (drSesi.menunggu) {
    badan.innerHTML = `<div class="dr-tunggu"><span class="spinner-border" aria-hidden="true"></span>
      <p>${escapeHtml(tt("Invoice yang sudah terbaca selesai direview. Invoice berikutnya tampil di sini begitu terbaca.", "All invoices read so far are reviewed. The next one appears here as soon as it is read."))}</p>
      <small id="drTungguTeks">${escapeHtml(drTeksBaca())}</small></div>`;
    drGambarKaki();
    return;
  }
  const butir = drItem();
  badan.innerHTML = `
    <div class="dr-grid">
      <section class="dr-pratinjau" aria-label="${escapeAttr(tt("Gambar dokumen", "Document image"))}">
        <div class="dr-pratinjau-alat">
          <span class="dr-berkas">${drBerkasHtml(butir.h)}</span>
          <button type="button" class="btn-quiet dr-zoom" data-dr-zoom aria-pressed="false" title="${escapeAttr(tt("Perbesar / perkecil gambar", "Zoom the image in / out"))}">
            <i class="bi bi-zoom-in" aria-hidden="true"></i> <span>${escapeHtml(tt("Perbesar", "Zoom in"))}</span>
          </button>
        </div>
        <div class="dr-halaman" id="drHalaman"><div class="dr-memuat"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${escapeHtml(tt("Menyiapkan gambar…", "Preparing the image…"))}</div></div>
      </section>
      <section class="dr-isi">
        <ul class="dr-periksa" id="drPeriksa"></ul>
        ${drIsianHtml(butir)}
        <div id="drRincian">${drRincianHtml(butir)}</div>
        <div class="dr-jumlah fund-lines-foot" id="drJumlah"></div>
      </section>
    </div>`;
  drGambarPeriksa();
  drGambarJumlah();
  drGambarKaki();
  drGambarPratinjau(butir);
}

function drGambarKepala() {
  const sub = drEl("danaReviewSub");
  if (!sub || !drSesi) return;
  const n = drSesi.daftar.length;
  const simpan = drSesi.daftar.filter((x) => x.status === "simpan").length;
  const butir = drItem();
  const lagi = drSesi.memuat ? tt(" (masih membaca)", " (still reading)") : "";
  sub.textContent = drSesi.selesai && !drSisa()
    ? tt(`${simpan} dari ${n} invoice tersimpan`, `${simpan} of ${n} invoices saved`)
    : drSesi.menunggu
      ? tt(`${simpan} dari ${n} invoice tersimpan${lagi}`, `${simpan} of ${n} invoices saved${lagi}`)
      : tt(`Invoice ${drSesi.i + 1} dari ${n}${lagi}${butir && butir.h.payee ? ` · ${butir.h.payee}` : ""} · ${simpan} tersimpan`,
        `Invoice ${drSesi.i + 1} of ${n}${lagi}${butir && butir.h.payee ? ` · ${butir.h.payee}` : ""} · ${simpan} saved`);
}

function drGambarLangkah() {
  const nav = drEl("danaReviewLangkah");
  if (!nav || !drSesi) return;
  nav.innerHTML = drSesi.daftar.map((x, i) => {
    const st = DR_STATUS[x.status];
    const tahan = x.status === "tunggu" && drTertahan(x);
    const nomor = x.h.jenisDokumen === "billing" ? x.h.billingNo : x.h.invoiceNo;
    const label = `${i + 1}. ${nomor || tt("(tanpa nomor)", "(no number)")} — ${tt(st.id, st.en)}${tahan ? tt(" · perlu dicek", " · needs attention") : ""}`;
    const aktif = i === drSesi.i && !(drSesi.selesai && !drSisa()) && !drSesi.menunggu;
    return `<button type="button" class="dr-langkah-butir is-${x.status}${tahan ? " is-tahan" : ""}${aktif ? " is-aktif" : ""}" data-dr-ke="${i}"
      title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"${aktif ? ' aria-current="step"' : ""}>
      <i class="bi ${tahan ? "bi-exclamation-circle-fill" : st.ikon}" aria-hidden="true"></i><span>${i + 1}</span>
    </button>`;
  }).join("") + (drSesi.memuat
    ? `<span class="dr-langkah-baca" id="drLangkahBaca" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span class="dr-langkah-baca-teks">${escapeHtml(drTeksBaca())}</span></span>`
    : "");
}

function drBerkasHtml(h) {
  const hal = h.sumber && h.sumber.halaman && h.sumber.halaman.length ? ` · ${tt("hal.", "p.")} ${danaSebutHalaman(h.sumber.halaman)}` : "";
  const ikon = h.sumber && h.sumber.berkas ? "bi-file-earmark-image" : "bi-file-earmark-pdf";
  return `<i class="bi ${ikon}" aria-hidden="true"></i> ${escapeHtml(h.berkas || "")}${escapeHtml(hal)}`;
}

/* Pilihan <select> diambil dari form Pengajuan Dana sendiri -- satu daftar */
function drPilihanForm(kunci, nilai) {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  const el = panel && panel.querySelector(`[data-dn="${kunci}"]`);
  const opsi = el ? [...el.options].filter((o) => o.value && !o.hasAttribute("data-pilihan-tambah")).map((o) => [o.value, o.textContent.trim()]) : [];
  if (nilai && !opsi.some(([v]) => v === nilai)) opsi.push([nilai, nilai]);
  return `<option value="">—</option>` + opsi.map(([v, teks]) => `<option value="${escapeAttr(v)}"${v === nilai ? " selected" : ""}>${escapeHtml(teks)}</option>`).join("");
}

function drVendorDatalist() {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  const el = panel && panel.querySelector('[data-dn="payee"]');
  const nama = el ? [...el.options].filter((o) => o.value && !o.hasAttribute("data-pilihan-tambah") && o.value !== (typeof FUND_VENDOR_BARU !== "undefined" ? FUND_VENDOR_BARU : "")).map((o) => o.value) : [];
  return `<datalist id="drVendorDaftar">${[...new Set(nama)].map((n) => `<option value="${escapeAttr(n)}"></option>`).join("")}</datalist>`;
}

/* Rincian bawaan seperti kotak Rincian form (fund-rincian.js) */
function drRincianBawaan(h) {
  if (typeof fundRincianBawaan !== "function") return "";
  return fundRincianBawaan({
    expenseType: h.expenseType,
    transactionType: h.transactionType,
    payee: h.payee,
    barang: typeof fundBarangDariAwb === "function" ? fundBarangDariAwb(h.blAwb) : "",
  });
}

function drIsianHtml(butir) {
  const h = butir.h;
  const kunci = butir.status !== "tunggu" ? " disabled" : "";
  const billing = h.jenisDokumen === "billing";
  const bidang = (k, label, isi, kelas) => `
      <div class="dr-bidang${kelas ? " " + kelas : ""}">
        <label class="dr-label" for="drF-${k}">${escapeHtml(label)}</label>
        ${isi}
      </div>`;
  const teks = (k, v, extra, merah) => `<input type="text" class="form-control form-control-sm${merah ? " is-invalid" : ""}" id="drF-${k}" data-dr-f="${k}" value="${escapeAttr(v || "")}"${merah ? ' aria-invalid="true"' : ""}${extra || ""}${kunci}>`;
  const tanggal = (k, v) => `<input type="date" class="form-control form-control-sm" id="drF-${k}" data-dr-f="${k}" value="${escapeAttr(v || "")}"${kunci}>`;
  const pilih = (k, v) => `<select class="form-select form-select-sm" id="drF-${k}" data-dr-f="${k}"${kunci}>${drPilihanForm(k, v)}</select>`;
  const nomorKosong = billing ? !String(h.billingNo || "").trim() : !String(h.invoiceNo || "").trim();
  const rincian = butir.rincianSendiri ? h.notes : drRincianBawaan(h);
  return `
    <div class="dr-kolom">
      ${bidang("payee", tt("Dibayarkan Kepada", "Pay To"), teks("payee", h.payee, ' list="drVendorDaftar" autocomplete="off"') + drVendorDatalist(), "dr-lebar")}
      ${billing
        ? bidang("billingNo", tt("Nomor Billing", "Billing Number"), teks("billingNo", h.billingNo, "", nomorKosong))
        : bidang("invoiceNo", h.debitNote ? tt("No. Debit Note", "Debit Note No.") : tt("No. Invoice", "Invoice No."), teks("invoiceNo", h.invoiceNo, "", nomorKosong))}
      ${bidang("invoiceDate", tt("Tanggal", "Date"), tanggal("invoiceDate", h.invoiceDate))}
      ${bidang("invoiceDueDate", tt("Jatuh Tempo", "Due Date"), tanggal("invoiceDueDate", h.invoiceDueDate))}
      ${bidang("blAwb", "BL/AWB", teks("blAwb", h.blAwb))}
      ${bidang("transactionType", tt("Jenis Transaksi", "Transaction Type"), pilih("transactionType", h.transactionType))}
      ${bidang("expenseType", tt("Jenis Pengeluaran", "Expense Type"), pilih("expenseType", h.expenseType))}
      ${bidang("notes", tt("Rincian (Subject surat)", "Details (letter subject)"), teks("notes", rincian), "dr-penuh")}
    </div>`;
}

const DR_TARIF = () => (typeof FUND_PPN_RATES !== "undefined" ? FUND_PPN_RATES : [0, 1.1, 11]);

function drRincianHtml(butir) {
  const h = butir.h;
  if (h.jenisDokumen === "billing") {
    const f = h.fee || {};
    const baris = [["Bea Masuk", f.feeBm], ["PPN", f.feePpn], ["PPh", f.feePph]].concat((h.akunLain || []).map((a) => [a.nama, a.nilai]));
    return `<table class="dr-tabel"><thead><tr><th>${escapeHtml(tt("Pungutan", "Levy"))}</th><th class="dr-angka">${escapeHtml(tt("Nilai", "Amount"))}</th></tr></thead>
      <tbody>${baris.filter(([, v]) => v).map(([n, v]) => `<tr><td>${escapeHtml(n)}</td><td class="dr-angka">${escapeHtml(drUang(v, "IDR"))}</td></tr>`).join("")}</tbody></table>`;
  }
  const kunci = butir.status !== "tunggu" ? " disabled" : "";
  const satuan = h.currency === "IDR" ? "Rp" : h.currency;
  const baris = h.lines.map((l, i) => `
      <tr data-dr-baris="${i}">
        <td class="dr-no">${i + 1}</td>
        <td><input type="text" class="form-control form-control-sm" data-dr-l="desc" value="${escapeAttr(l.desc || "")}" aria-label="${escapeAttr(tt(`Uraian baris ${i + 1}`, `Line ${i + 1} description`))}"${kunci}></td>
        <td class="dr-angka"><input type="text" inputmode="decimal" class="form-control form-control-sm" data-dr-l="amount" value="${escapeAttr(l.amount ? formatNilai(l.amount) : "")}" aria-label="${escapeAttr(tt(`Nilai baris ${i + 1}`, `Line ${i + 1} amount`))}"${kunci}></td>
        <td class="dr-tarif"><select class="form-select form-select-sm" data-dr-l="ppnRate" aria-label="${escapeAttr(tt(`Tarif PPN baris ${i + 1}`, `Line ${i + 1} VAT rate`))}"${kunci}>${DR_TARIF().map((r) => `<option value="${r}"${Number(l.ppnRate) === r ? " selected" : ""}>${String(r).replace(".", ",")}%</option>`).join("")}</select></td>
        <td class="dr-hapus">${kunci ? "" : `<div class="dr-baris-aksi">
          <button type="button" class="rm-row dr-sisip" data-dr-sisip="${i}" title="${escapeAttr(tt("Sisipkan baris di bawah baris ini (Ctrl+Enter)", "Insert a line below this one (Ctrl+Enter)"))}" aria-label="${escapeAttr(tt(`Sisipkan baris di bawah baris ${i + 1}`, `Insert a line below line ${i + 1}`))}"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>
          <button type="button" class="rm-row" data-dr-hapus="${i}" title="${escapeAttr(tt("Hapus baris", "Remove line"))}" aria-label="${escapeAttr(tt(`Hapus baris ${i + 1}`, `Remove line ${i + 1}`))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
        </div>`}</td>
      </tr>`).join("");
  return `
    <table class="dr-tabel">
      <thead><tr>
        <th class="dr-no">No</th>
        <th>${escapeHtml(tt("Uraian", "Description"))}</th>
        <th class="dr-angka">${escapeHtml(tt("Nilai", "Amount"))} (${escapeHtml(satuan)})</th>
        <th class="dr-tarif">PPN</th>
        <th class="dr-hapus"><span class="visually-hidden">${escapeHtml(tt("Hapus", "Remove"))}</span></th>
      </tr></thead>
      <tbody>${baris}</tbody>
    </table>
    ${kunci ? "" : `<button type="button" class="btn-quiet dr-tambah" data-dr-tambah><i class="bi bi-plus-lg" aria-hidden="true"></i> ${escapeHtml(tt("Tambah baris", "Add line"))}</button>`}`;
}

function drGambarJumlah() {
  const wadah = drEl("drJumlah");
  const butir = drItem();
  if (!wadah || !butir) return;
  const h = butir.h;
  if (h.jenisDokumen === "billing") {
    wadah.innerHTML = `<div class="fl-sum fl-sum--total"><span>TOTAL</span><b>${escapeHtml(drUang(h.dpp || h.totalInvoice || 0, "IDR"))}</b></div>`;
    return;
  }
  const r = drTotal(h);
  const x = r.perDokumen[0] || { grandTotal: 0, grandTotalHitung: 0, manual: false };
  const uang = (v, minus) => `${minus && v ? "- " : ""}${escapeHtml(drUang(v, h.currency))}`;
  const kunci = butir.status !== "tunggu";
  const kotak = kunci
    ? `<b>${uang(r.grandTotal)}</b>`
    : `<label class="fl-total-ubah${x.manual ? " is-manual" : ""}" title="${escapeAttr(tt("GRAND TOTAL bisa diubah bila berbeda pembulatan dengan invoice / hitungan finance", "GRAND TOTAL can be changed when its rounding differs from the invoice / finance"))}"><input type="text" inputmode="decimal" autocomplete="off" class="fl-total-input" data-dr-total size="${formatNilai(r.grandTotal).length + 1}" value="${escapeAttr(formatNilai(r.grandTotal))}" aria-label="${escapeAttr(tt("GRAND TOTAL (bisa diubah)", "GRAND TOTAL (editable)"))}"><i class="bi bi-pencil fl-total-pensil" aria-hidden="true"></i></label>`;
  const catatan = x.manual
    ? `<div class="fl-total-catatan"><span><i class="bi bi-pencil-square" aria-hidden="true"></i> ${escapeHtml(tt(`Disesuaikan · hitungan sistem ${drUang(x.grandTotalHitung, h.currency)}`, `Adjusted · system total ${drUang(x.grandTotalHitung, h.currency)}`))}</span>${kunci ? "" : `<button type="button" class="btn-quiet fl-total-kembali" data-dr-total-kembali><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> ${escapeHtml(tt("Kembalikan", "Reset"))}</button>`}</div>`
    : "";
  wadah.innerHTML = `
      <div class="fl-sum"><span>${escapeHtml(tt("Total Nilai", "Total Amount"))}</span><b>${uang(r.totalNilai)}</b></div>
      ${r.totalDiskon ? `<div class="fl-sum fl-sum--minus"><span>${escapeHtml(tt("Total Diskon", "Total Discount"))}</span><b>${uang(r.totalDiskon, true)}</b></div>` : ""}
      <div class="fl-sum"><span>${escapeHtml(tt("Total PPN", "Total VAT"))}</span><b>${uang(r.totalPpn)}</b></div>
      <div class="fl-sum fl-sum--minus"><span>${escapeHtml(tt(`Potongan PPH 23 (${FUND_PPH23_RATE}%)`, `PPH 23 deduction (${FUND_PPH23_RATE}%)`))}</span><b>${uang(r.pph, true)}</b></div>
      <div class="fl-sum fl-sum--total fl-sum--ubah"><span>GRAND TOTAL</span>${kotak}</div>
      ${catatan}
      ${h.totalInvoice > 0 ? `<div class="dr-total-invoice"><span>${escapeHtml(tt("TOTAL di invoice", "Invoice TOTAL"))}</span><b>${uang(h.totalInvoice)}</b></div>` : ""}`;
}

function drGambarPeriksa() {
  const ul = drEl("drPeriksa");
  const butir = drItem();
  if (!ul || !butir) return;
  const ikon = { galat: "bi-x-octagon-fill", awas: "bi-exclamation-triangle-fill", ok: "bi-check-circle-fill", info: "bi-info-circle" };
  const daftar = butir.status === "simpan"
    ? [{ jenis: "ok", teks: tt(`Tersimpan sebagai ${butir.nomor}.`, `Saved as ${butir.nomor}.`) }]
    : butir.status === "lewat"
      ? [{ jenis: "info", ikon: "bi-skip-forward-circle", teks: tt("Dilewati — tidak disimpan. Klik Kembalikan untuk mereview lagi.", "Skipped — not saved. Click Restore to review it again.") }]
      : drPeriksa(butir);
  ul.innerHTML = daftar.map((x) => `<li class="dr-cek dr-cek--${x.jenis}"><i class="bi ${x.ikon || ikon[x.jenis]}" aria-hidden="true"></i><span>${escapeHtml(x.teks)}</span></li>`).join("");
}

function drGambarKaki() {
  const pesan = drEl("danaReviewPesan");
  const simpan = drEl("btnDrSimpan");
  const lewat = drEl("btnDrLewati");
  if (!simpan || !lewat || !drSesi) return;
  const butir = drItem();
  // boolean pasti: classList.toggle(kelas, undefined) MEMBALIK kelasnya, bukan memaksanya
  const selesai = !!(drSesi.selesai && !drSisa());
  if (drSesi.menunggu) {
    lewat.classList.add("d-none");
    simpan.disabled = true;
    simpan.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${escapeHtml(tt("Menunggu invoice berikutnya…", "Waiting for the next invoice…"))}`;
    if (pesan) pesan.textContent = "";
    return;
  }
  lewat.classList.toggle("d-none", selesai);
  if (selesai) {
    simpan.disabled = false;
    simpan.innerHTML = `<i class="bi bi-check2" aria-hidden="true"></i> ${escapeHtml(tt("Selesai", "Done"))}`;
    if (pesan) pesan.textContent = "";
    return;
  }
  const tunggu = butir && butir.status === "tunggu";
  lewat.innerHTML = butir && butir.status === "lewat"
    ? `<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> ${escapeHtml(tt("Kembalikan", "Restore"))}`
    : escapeHtml(tt("Lewati", "Skip"));
  lewat.disabled = !!(butir && butir.status === "simpan") || !!drSesi.sibuk;
  const lainTunggu = drSesi.memuat || drSesi.daftar.some((x, i) => i !== drSesi.i && x.status === "tunggu");
  if (tunggu) {
    simpan.disabled = drTertahan(butir) || !!drSesi.sibuk;
    simpan.innerHTML = drSesi.sibuk
      ? `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${escapeHtml(tt("Menyimpan…", "Saving…"))}`
      : `<i class="bi bi-check2-circle" aria-hidden="true"></i> ${escapeHtml(lainTunggu ? tt("Simpan & Lanjut", "Save & Next") : tt("Simpan", "Save"))}`;
  } else {
    simpan.disabled = !!drSesi.sibuk;
    simpan.innerHTML = lainTunggu
      ? `${escapeHtml(tt("Berikutnya", "Next"))} <i class="bi bi-arrow-right" aria-hidden="true"></i>`
      : `<i class="bi bi-flag" aria-hidden="true"></i> ${escapeHtml(tt("Ringkasan", "Summary"))}`;
  }
  if (pesan) {
    pesan.classList.toggle("is-galat", !!(butir && butir.galat));
    pesan.textContent = butir && butir.galat
      ? butir.galat
      : tunggu && drTertahan(butir)
        ? tt("Lengkapi yang bertanda merah dulu.", "Complete the items marked red first.")
        : tunggu && drPapanKetik() ? tt("Ctrl+Enter = simpan · di rincian: sisipkan baris", "Ctrl+Enter = save · in a line: insert a line below") : "";
  }
}

function drRingkasanHtml() {
  const baris = drSesi.daftar.map((x, i) => {
    const st = DR_STATUS[x.status];
    const nomor = x.h.jenisDokumen === "billing" ? x.h.billingNo : x.h.invoiceNo;
    const total = x.h.jenisDokumen === "billing" ? x.h.dpp || x.h.totalInvoice || 0 : drTotal(x.h).grandTotal;
    return `<tr class="is-${x.status}">
      <td>${i + 1}</td>
      <td>${escapeHtml(nomor || "—")}</td>
      <td class="dr-angka">${escapeHtml(drUang(total, x.h.currency))}</td>
      <td><i class="bi ${st.ikon}" aria-hidden="true"></i> ${escapeHtml(x.status === "simpan" ? x.nomor : tt(st.id, st.en))}</td>
    </tr>`;
  }).join("");
  const simpan = drSesi.daftar.filter((x) => x.status === "simpan").length;
  return `
    <div class="dr-ringkasan">
      <p class="dr-ringkasan-judul"><i class="bi bi-check2-all" aria-hidden="true"></i> ${escapeHtml(tt(`${simpan} pengajuan tersimpan dari ${drSesi.daftar.length} invoice.`, `${simpan} request${simpan === 1 ? "" : "s"} saved from ${drSesi.daftar.length} invoices.`))}</p>
      <table class="dr-tabel">
        <thead><tr><th>No</th><th>${escapeHtml(tt("Invoice", "Invoice"))}</th><th class="dr-angka">GRAND TOTAL</th><th>${escapeHtml(tt("Nomor pengajuan", "Request number"))}</th></tr></thead>
        <tbody>${baris}</tbody>
      </table>
      ${drSesi.catatan.length ? `<p class="dr-catatan">${escapeHtml(drSesi.catatan.join(" "))}</p>` : ""}
    </div>`;
}

/* ------------------------------------------------------------------
   PRATINJAU GAMBAR: halaman PDF (pdf.js) / foto, ditegakkan seperti OCR-nya
------------------------------------------------------------------ */

async function drGambarPratinjau(butir) {
  const ke = ++drPratinjauKe;
  const wadah = drEl("drHalaman");
  const s = butir && butir.h.sumber;
  if (!wadah) return;
  if (!s || (!(s.pdf && typeof s.pdf.getPage === "function") && !(s.berkas instanceof Blob))) {
    wadah.innerHTML = `<div class="dr-memuat">${escapeHtml(tt("Gambar tidak tersedia.", "No image available."))}</div>`;
    return;
  }
  try {
    const kanvas = [];
    const lebar = Math.min(1600, Math.max(700, Math.round((wadah.clientWidth || 520) * Math.min(2, window.devicePixelRatio || 1) * 1.5)));
    if (s.pdf && typeof s.pdf.getPage === "function") {
      for (let k = 0; k < s.halaman.length; k++) {
        const hal = await s.pdf.getPage(s.halaman[k]);
        const putar = ((hal.rotate || 0) + (s.putar[k] || 0)) % 360;
        const vp0 = hal.getViewport({ scale: 1, rotation: putar });
        const vp = hal.getViewport({ scale: lebar / vp0.width, rotation: putar });
        const c = document.createElement("canvas");
        c.width = Math.round(vp.width);
        c.height = Math.round(vp.height);
        await hal.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        if (hal.cleanup) hal.cleanup();
        if (ke !== drPratinjauKe) return;
        kanvas.push(c);
      }
    } else {
      const url = URL.createObjectURL(s.berkas);
      try {
        const img = await new Promise((ok, gagal) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = gagal;
          i.src = url;
        });
        const putar = s.putar[0] || 0;
        const tegak = putar === 90 || putar === 270;
        const skala = lebar / (tegak ? img.naturalHeight : img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = Math.round((tegak ? img.naturalHeight : img.naturalWidth) * skala);
        c.height = Math.round((tegak ? img.naturalWidth : img.naturalHeight) * skala);
        const cx = c.getContext("2d");
        cx.translate(c.width / 2, c.height / 2);
        cx.rotate((putar * Math.PI) / 180);
        cx.drawImage(img, (-img.naturalWidth * skala) / 2, (-img.naturalHeight * skala) / 2, img.naturalWidth * skala, img.naturalHeight * skala);
        kanvas.push(c);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (ke !== drPratinjauKe) return;
    wadah.innerHTML = "";
    kanvas.forEach((c, i) => {
      c.className = "dr-kanvas";
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", tt(`Halaman ${s.halaman[i] || i + 1}`, `Page ${s.halaman[i] || i + 1}`));
      wadah.appendChild(c);
    });
  } catch (e) {
    console.warn("Pratinjau review gagal:", e);
    if (ke === drPratinjauKe) wadah.innerHTML = `<div class="dr-memuat">${escapeHtml(tt("Gambar tidak bisa ditampilkan.", "The image could not be shown."))}</div>`;
  }
}

/* ------------------------------------------------------------------
   AKSI
------------------------------------------------------------------ */

function drKe(i) {
  if (!drSesi || i < 0 || i >= drSesi.daftar.length || drSesi.sibuk) return;
  drSesi.i = i;
  drSesi.selesai = false;
  drSesi.menunggu = false;
  drGambar();
  const badan = drEl("danaReviewBadan");
  if (badan) badan.scrollTop = 0;
}

/* Butir berikutnya yang masih menunggu (sesudah yang tampil, lalu dari awal); tidak ada = ringkasan */
function drLanjut() {
  const n = drSesi.daftar.length;
  for (let k = 1; k <= n; k++) {
    const i = (drSesi.i + k) % n;
    if (drSesi.daftar[i].status === "tunggu") return drKe(i);
  }
  if (drSesi.memuat) {
    drSesi.menunggu = true;
    drGambar();
    return;
  }
  drSesi.selesai = true;
  drGambar();
}

function drLewati() {
  const butir = drItem();
  if (!butir || drSesi.sibuk || butir.status === "simpan") return;
  if (butir.status === "lewat") {
    butir.status = "tunggu";
    drPeriksaGanda(butir);
    drGambar();
    return;
  }
  butir.status = "lewat";
  butir.galat = "";
  drPerbaruiTombolLanjut();
  drLanjut();
}

/* Isi form dengan butir ini, terbitkan nomornya, kembalikan isi form pengguna */
async function drSimpan() {
  const butir = drItem();
  if (!drSesi || drSesi.sibuk) return;
  if (drSesi.selesai && !drSisa()) {
    if (drModal) drModal.hide();
    return;
  }
  if (!butir || butir.status !== "tunggu") return drLanjut();
  if (drTertahan(butir)) {
    drGambarKaki();
    return;
  }
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  if (!panel || typeof submitDocNumRequest !== "function") return;
  drSesi.sibuk = true;
  butir.galat = "";
  drGambarKaki();
  const foto = typeof dnFotoDraf === "function" ? dnFotoDraf(panel, "fund") : null;
  let hasil = null;
  try {
    const h = butir.h;
    danaIsiForm(Object.assign({}, h, { lines: h.lines.map((l) => Object.assign({}, l)) }));
    if (typeof setFundTotalManual === "function") setFundTotalManual(h.totalManual || {});
    // Rincian yang diketik di review menggantikan bawaannya (kotak Rincian form)
    const rincian = panel.querySelector('[data-dn="notes"]');
    if (rincian && butir.rincianSendiri) {
      rincian.value = h.notes || "";
      delete rincian.dataset.autoFill;
    }
    hasil = await submitDocNumRequest({ review: true });
  } catch (e) {
    console.error(e);
    hasil = { galat: (e && e.message) || tt("Gagal menyimpan.", "Could not save.") };
  } finally {
    // Isi form sebelum review kembali -- berhasil ataupun gagal
    if (foto && typeof dnPulihkanDraf === "function") dnPulihkanDraf(panel, "fund", foto);
    drSesi.sibuk = false;
  }
  if (hasil && hasil.nomor) {
    butir.status = "simpan";
    butir.nomor = hasil.nomor;
    butir.payload = hasil.payload || null;
    drSesi.daftar.forEach((x) => x !== butir && drPeriksaGanda(x));
    drPerbaruiTombolLanjut();
    drLanjut();
    return;
  }
  if (hasil && hasil.ganda) {
    butir.ganda = hasil.ganda;
    butir.galat = "";
  } else {
    butir.galat = (hasil && hasil.galat) || tt("Pengajuan tidak tersimpan.", "The request was not saved.");
  }
  drGambarLangkah();
  drGambarPeriksa();
  drGambarKaki();
}

/* SISIPKAN BARIS KOSONG tepat di bawah baris `idx` (tombol + di baris itu, atau
   Ctrl/⌘+Enter di kotaknya) -- sama dengan Rincian Biaya di form: pos yang
   terlewat saat membaca invoice tidak perlu ditambah di ujung lalu dipindah.
   Tarif PPN-nya ikut baris di atasnya; kursor ke Uraian baris baru. */
function drSisipBaris(butir, idx) {
  const atas = butir.h.lines[idx] || {};
  butir.h.lines.splice(idx + 1, 0, { desc: "", amount: 0, ppnRate: atas.ppnRate || 0 });
  drEl("drRincian").innerHTML = drRincianHtml(butir);
  const baru = drEl("drRincian").querySelector(`[data-dr-baris="${idx + 1}"] [data-dr-l="desc"]`);
  if (baru) baru.focus();
  drSelaraskanTotal(butir);
  drGambarJumlah();
  drGambarPeriksa();
  drGambarKaki();
}

/* ZOOM YANG BISA DIGESER: gambar yang diperbesar diseret dengan tetikus
   (seperti peta) -- nomor invoice di pojok atas, TOTAL di bawah, tanpa
   mencari bilah gulir mendatar. Klik dua kali = perbesar / perkecil TEPAT
   di titik yang diklik. Sentuhan tetap menggulir biasa (overflow: auto). */
function drAturZoom(hidup, titik) {
  const pratinjau = drEl("danaReviewBadan") && drEl("danaReviewBadan").querySelector(".dr-pratinjau");
  const wadah = drEl("drHalaman");
  if (!pratinjau || !wadah) return;
  // Titik yang dipertahankan: yang diklik, atau tengah bidang yang sedang tampil
  const r = wadah.getBoundingClientRect();
  const px = titik ? titik.x - r.left : wadah.clientWidth / 2;
  const py = titik ? titik.y - r.top : wadah.clientHeight / 2;
  const relX = (wadah.scrollLeft + px) / Math.max(1, wadah.scrollWidth);
  const relY = (wadah.scrollTop + py) / Math.max(1, wadah.scrollHeight);
  pratinjau.classList.toggle("is-zoom", hidup);
  const tombol = pratinjau.querySelector("[data-dr-zoom]");
  if (tombol) {
    tombol.setAttribute("aria-pressed", String(hidup));
    tombol.querySelector("i").className = `bi ${hidup ? "bi-zoom-out" : "bi-zoom-in"}`;
    tombol.querySelector("span").textContent = hidup ? tt("Perkecil", "Zoom out") : tt("Perbesar", "Zoom in");
  }
  wadah.scrollLeft = relX * wadah.scrollWidth - px;
  wadah.scrollTop = relY * wadah.scrollHeight - py;
}

function drPasangGeser(badan) {
  let seret = null;
  badan.addEventListener("pointerdown", (e) => {
    const wadah = e.target.closest && e.target.closest("#drHalaman");
    if (!wadah || e.button !== 0 || e.pointerType !== "mouse" || !wadah.closest(".dr-pratinjau.is-zoom")) return;
    seret = { wadah, x: e.clientX, y: e.clientY, kiri: wadah.scrollLeft, atas: wadah.scrollTop, id: e.pointerId };
    wadah.setPointerCapture(e.pointerId);
    wadah.classList.add("is-geser");
    e.preventDefault(); // tanpa seleksi teks / seret gambar bawaan
  });
  badan.addEventListener("pointermove", (e) => {
    if (!seret || e.pointerId !== seret.id) return;
    seret.wadah.scrollLeft = seret.kiri - (e.clientX - seret.x);
    seret.wadah.scrollTop = seret.atas - (e.clientY - seret.y);
  });
  const lepas = (e) => {
    if (!seret || e.pointerId !== seret.id) return;
    seret.wadah.classList.remove("is-geser");
    seret = null;
  };
  badan.addEventListener("pointerup", lepas);
  badan.addEventListener("pointercancel", lepas);
  badan.addEventListener("dblclick", (e) => {
    if (!e.target.closest || !e.target.closest("#drHalaman .dr-kanvas")) return;
    const pratinjau = e.target.closest(".dr-pratinjau");
    drAturZoom(!pratinjau.classList.contains("is-zoom"), { x: e.clientX, y: e.clientY });
  });
}

/* ------------------------------------------------------------------
   PENDENGAR (sekali; isi pop-up digambar ulang terus)
------------------------------------------------------------------ */

const DR_ISIAN_TOTAL = new Set(["payee"]); // isian yang mengubah hitungan (aturan PPN vendor)

function drSetelahUbahIsian(k) {
  const butir = drItem();
  if (!butir) return;
  if (k === "invoiceNo" || k === "billingNo" || k === "payee") {
    clearTimeout(drGandaJeda);
    drGandaJeda = setTimeout(() => {
      drPeriksaGanda(butir);
      drGambarLangkah();
      drGambarPeriksa();
      drGambarKaki();
    }, 250);
  }
  if (DR_ISIAN_TOTAL.has(k)) {
    drSelaraskanTotal(butir);
    drGambarJumlah();
  }
  // Rincian bawaan mengikuti vendor / jenis / BL selama belum diketik sendiri
  if (!butir.rincianSendiri && ["payee", "expenseType", "transactionType", "blAwb"].includes(k)) {
    const el = drEl("drF-notes");
    if (el) el.value = drRincianBawaan(butir.h);
  }
  drGambarKepala();
  drGambarLangkah();
  drGambarPeriksa();
  drGambarKaki();
}

(function pasangReviewInvoice() {
  const modal = drEl("danaReviewModal");
  if (!modal) return;
  const badan = drEl("danaReviewBadan");

  badan.addEventListener("input", (e) => {
    const butir = drItem();
    if (!butir || butir.status !== "tunggu") return;
    const el = e.target;
    if (el.dataset.drF) {
      const k = el.dataset.drF;
      if (k === "notes") {
        butir.rincianSendiri = true;
        butir.h.notes = el.value;
        return;
      }
      butir.h[k] = el.value;
      if (k === "invoiceNo" || k === "billingNo") {
        el.classList.toggle("is-invalid", !el.value.trim());
        el.setAttribute("aria-invalid", String(!el.value.trim()));
      }
      if (el.tagName !== "SELECT") drSetelahUbahIsian(k);
      return;
    }
    const f = el.dataset.drL;
    const tr = el.closest("[data-dr-baris]");
    if (f && tr) {
      const l = butir.h.lines[Number(tr.dataset.drBaris)];
      if (f === "amount") {
        formatKotakRupiah(el);
        const v = nilaiKotakDana(el.value, false);
        l.amount = typeof v === "number" ? v : 0;
      } else if (f === "desc") {
        l.desc = el.value;
        return;
      } else return;
      drSelaraskanTotal(butir);
      drGambarJumlah();
      drGambarPeriksa();
      drGambarKaki();
    }
  });
  badan.addEventListener("change", (e) => {
    const butir = drItem();
    if (!butir || butir.status !== "tunggu") return;
    const el = e.target;
    if (el.tagName === "SELECT" && el.dataset.drF) {
      butir.h[el.dataset.drF] = el.value;
      drSetelahUbahIsian(el.dataset.drF);
      return;
    }
    if (el.dataset.drL === "ppnRate") {
      const tr = el.closest("[data-dr-baris]");
      butir.h.lines[Number(tr.dataset.drBaris)].ppnRate = Number(el.value);
      drSelaraskanTotal(butir);
      drGambarJumlah();
      drGambarPeriksa();
      drGambarKaki();
    }
  });
  // GRAND TOTAL review: pindah kotak / Enter = simpan; kosong / sama dengan hitungan = kembali
  badan.addEventListener("focusout", (e) => {
    const el = e.target;
    const butir = drItem();
    if (!el.matches || !el.matches("[data-dr-total]") || !butir || butir.status !== "tunggu") return;
    const h = butir.h;
    const hitung = fundLineTotals(h.lines, h.currency, h.payee, [], null).grandTotal;
    const v = adalahRumus(el.value) ? hitungRumus(el.value) : nilaiKotakDana(el.value, false);
    if (v === "") {
      butir.totalSendiri = false;
      drSelaraskanTotal(butir);
    } else if (typeof v === "number" && isFinite(v) && v >= 0) {
      const nilai = fundRupiahPenuh(h.currency) ? Math.round(v) : fundBulatSen(v);
      butir.totalSendiri = true;
      if (fundSen(nilai) === fundSen(hitung)) delete h.totalManual;
      else h.totalManual = { "": { nilai, hitung } };
    }
    drGambarJumlah();
    drGambarPeriksa();
    drGambarKaki();
  });
  badan.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.target.matches && e.target.matches("[data-dr-total]")) {
      e.preventDefault();
      e.target.blur();
      return;
    }
    // Ctrl/⌘+Enter di kotak rincian = sisipkan baris di bawahnya (di luar rincian: Simpan)
    const tr = e.target.closest && e.target.closest("[data-dr-baris]");
    const butir = drItem();
    if (tr && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && butir && butir.status === "tunggu") {
      e.preventDefault();
      e.stopPropagation();
      drSisipBaris(butir, Number(tr.dataset.drBaris));
    }
  });
  drPasangGeser(badan);
  badan.addEventListener("click", (e) => {
    const butir = drItem();
    const t0 = e.target;
    if (t0.closest("[data-dr-zoom]")) {
      drAturZoom(!badan.querySelector(".dr-pratinjau").classList.contains("is-zoom"));
      return;
    }
    if (!butir || butir.status !== "tunggu") return;
    const sisip = t0.closest("[data-dr-sisip]");
    if (sisip) {
      drSisipBaris(butir, Number(sisip.dataset.drSisip));
      return;
    }
    const hapus = t0.closest("[data-dr-hapus]");
    if (hapus) {
      butir.h.lines.splice(Number(hapus.dataset.drHapus), 1);
      drEl("drRincian").innerHTML = drRincianHtml(butir);
    } else if (t0.closest("[data-dr-tambah]")) {
      butir.h.lines.push({ desc: "", amount: 0, ppnRate: (butir.h.lines[butir.h.lines.length - 1] || {}).ppnRate || 0 });
      drEl("drRincian").innerHTML = drRincianHtml(butir);
      const baru = drEl("drRincian").querySelector(`[data-dr-baris="${butir.h.lines.length - 1}"] [data-dr-l="desc"]`);
      if (baru) baru.focus();
    } else if (t0.closest("[data-dr-total-kembali]")) {
      // Kembali ke hitungan rumus -- TOTAL invoice yang beda pembulatan tidak dipakai lagi otomatis
      delete butir.h.totalManual;
      butir.totalSendiri = true;
    } else return;
    drSelaraskanTotal(butir);
    drGambarJumlah();
    drGambarPeriksa();
    drGambarKaki();
  });

  drEl("danaReviewLangkah").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dr-ke]");
    if (b) drKe(Number(b.dataset.drKe));
  });
  drEl("btnDrSimpan").addEventListener("click", () => drSimpan());
  drEl("btnDrLewati").addEventListener("click", () => drLewati());
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.matches("[data-dr-total]")) document.activeElement.blur();
      drSimpan();
    }
  });
  // Tutup sebelum selesai: sesi tetap menunggu di tombol "Lanjutkan review"
  modal.addEventListener("hidden.bs.modal", () => {
    drPratinjauKe++;
    const badanKosong = drEl("danaReviewBadan");
    if (badanKosong) badanKosong.innerHTML = ""; // kanvas pratinjau dilepas
    if (drSesi && !drSisa() && !drSesi.memuat) {
      const simpan = drSesi.daftar.filter((x) => x.status === "simpan");
      if (simpan.length) {
        showToast(tt(`${simpan.length} pengajuan tersimpan: ${simpan.map((x) => x.nomor).join(", ")}.`,
          `${simpan.length} request${simpan.length === 1 ? "" : "s"} saved: ${simpan.map((x) => x.nomor).join(", ")}.`), "success");
      }
      drSesi = null;
    }
    drPerbaruiTombolLanjut();
  });
  const lanjut = drEl("btnDanaLanjutReview");
  if (lanjut) lanjut.addEventListener("click", () => drTampilkan());
})();
