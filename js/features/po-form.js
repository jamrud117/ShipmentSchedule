"use strict";

/* ==================================================================
   PO & PR -- FORM (tab "PO & PR" di halaman Nomor Dokumen)

   SATU pengajuan = satu nomor PO (DDI-YYYYMMDD-SEQ, 3 digit) yang
   membawa DUA dokumen:
     PR  Formulir Pengajuan Pembelian (CF-702-03) -- permintaan barang
         dari departemen, SUMBER PO-nya;
     PO  Purchase Order ke supplier -- TERBENTUK OTOMATIS dari PR: barang,
         spesifikasi, qty & satuan, catatan, harga perkiraan (bila mata
         uangnya sama) dan nama supplier (bila semua barang PR menyebut
         supplier yang sama). PO terus mengikuti PR selama daftar barangnya
         belum diubah sendiri; sesudah diubah ia milik pengguna, dan "Salin
         ulang dari PR" menyalinnya lagi.

   Isiannya kotak ber-data-dn biasa (readDocNumForm) ditambah dua daftar
   barang yang disisipkan poBacaForm():
     prItems [{ nama, spek, qty, harga, pemasok, catatan }]
       qty TEKS bersama satuannya ("1 SET") -- PR tidak punya kolom
       Satuan; harga = angka perkiraan (prMataUang).
     poItems [{ produk, spek, qty, satuan, harga, catatan }]
       qty & harga angka (currency); Amount = qty x harga.
     poManual  true = daftar PO diubah sendiri (tidak lagi ikut PR).

   DOC NO (Groupware): bawaan "DST-<YYMM>-0000" menurut bulan Tanggal PO.
   Selama 0000 belum diganti isian itu TIDAK disimpan, dan PO mencetak
   bawaannya itu (poDocNoCetak) -- tempat nomor Groupware ditulis sesudah
   PO diajukan di sana. Kotaknya juga terisi bawaan saat PO tersimpan
   dibuka untuk diubah: tinggal mengetik nomornya.

   TENGGAT WAKTU PR terisi sendiri = selisih hari Tanggal Permintaan s.d.
   Tgl. Barang Masuk ("19 Hari") selama belum diketik sendiri.
================================================================== */

const PO_DOCNO_RE = /^DST-\d{4}-0000$/i;
const PO_FIELD = {
  pr: ["nama", "spek", "qty", "harga", "pemasok", "catatan"],
  po: ["produk", "spek", "qty", "satuan", "harga", "catatan"],
};
// Isian angka (disimpan sebagai angka; kosong = "")
const PO_ANGKA = { pr: new Set(["harga"]), po: new Set(["qty", "harga"]) };

const PO_LABEL = {
  pr: {
    nama: () => tt("Nama Produk", "Product Name"),
    spek: () => tt("Spesifikasi", "Specification"),
    qty: () => "QTY",
    harga: () => tt("Perk. Harga Satuan", "Est. Unit Price"),
    jumlah: () => tt("Perk. Jumlah Harga", "Est. Amount"),
    pemasok: () => tt("Pemasok / Supplier", "Supplier"),
    catatan: () => tt("Catatan", "Notes"),
  },
  po: {
    produk: () => "Product",
    spek: () => "Spec / Model",
    qty: () => "Qty",
    satuan: () => "Unit",
    harga: () => "Unit Price",
    jumlah: () => "Amount",
    catatan: () => tt("Catatan", "Notes"),
  },
};

function poBarisBaru(jenis) {
  const b = {};
  PO_FIELD[jenis].forEach((f) => (b[f] = ""));
  return b;
}

let poBaris = { pr: [poBarisBaru("pr")], po: [poBarisBaru("po")] };
let poManual = false;

const poPanel = () => (typeof docNumPanelEl === "function" ? docNumPanelEl("po") : null);
const poIsian = (k) => {
  const panel = poPanel();
  return panel ? panel.querySelector(`[data-dn="${k}"]`) : null;
};

/* ---------- nilai & hitungan ---------- */

// Angka dari kotak (koma ribuan, titik desimal -- bentuk kotak aplikasi ini)
function poAngka(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const teks = String(v == null ? "" : v).trim();
  return teks ? parseInputNumber(teks) : 0;
}

// "1 SET" -> 1 & "SET"; "1.000 PCS" (ribuan) -> 1000 -- teks PR datang dari orang / OCR
function poQtyAngka(teks) {
  const m = /^\s*(\d[\d.,]*)/.exec(String(teks == null ? "" : teks));
  return m ? parseLooseNumber(m[1]) : 0;
}
function poQtySatuan(teks) {
  return String(teks == null ? "" : teks).replace(/^\s*\d[\d.,]*\s*/, "").trim();
}

function poJumlahBaris(jenis, b) {
  if (!b) return 0;
  const qty = jenis === "pr" ? poQtyAngka(b.qty) : poAngka(b.qty);
  const harga = poAngka(b.harga);
  return qty && harga ? Math.round(qty * harga * 100) / 100 : 0;
}

function poTotal(jenis, daftar) {
  return Math.round((daftar || []).reduce((s, b) => s + poJumlahBaris(jenis, b), 0) * 100) / 100;
}

function poBarisTerisi(jenis, b) {
  return !!b && PO_FIELD[jenis].some((f) => (typeof b[f] === "number" ? b[f] !== 0 : String(b[f] == null ? "" : b[f]).trim() !== ""));
}

// Baris kosong dibuang; teks dirapikan, angka tetap angka ("" bila kosong)
function poBarisBersih(jenis, daftar) {
  return (Array.isArray(daftar) ? daftar : [])
    .filter((b) => poBarisTerisi(jenis, b))
    .map((b) => {
      const o = {};
      PO_FIELD[jenis].forEach((f) => {
        if (PO_ANGKA[jenis].has(f)) {
          const n = poAngka(b[f]);
          o[f] = n ? n : "";
        } else o[f] = String(b[f] == null ? "" : b[f]).trim();
      });
      return o;
    });
}

// Teks angka di kotak / sel: koma ribuan, desimal hanya bila ada
const poTeksAngka = (n) => (n ? formatNilai(n) : "");

/* ---------- PR -> PO ---------- */

/* Daftar PO dari daftar PR. Harga perkiraan PR ikut hanya bila mata uangnya
   sama dengan mata uang PO -- perkiraan rupiah bukan harga USD. */
function poDariPr(prItems, mataPr, mataPo) {
  const hargaIkut = !mataPr || !mataPo || mataPr === mataPo;
  return poBarisBersih("pr", prItems).map((b) => ({
    produk: b.nama,
    spek: b.spek,
    qty: poQtyAngka(b.qty) || "",
    satuan: poQtySatuan(b.qty),
    harga: hargaIkut && b.harga ? b.harga : "",
    catatan: b.catatan,
  }));
}

// Supplier PO dari PR: hanya bila SEMUA barang ber-supplier menyebut yang sama
function poPemasokDariPr(prItems) {
  const kunci = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const nama = poBarisBersih("pr", prItems).map((b) => b.pemasok).filter(Boolean);
  if (!nama.length) return "";
  return nama.every((n) => kunci(n) === kunci(nama[0])) ? nama[0] : "";
}

/* PO mengikuti PR (selama belum diubah sendiri, atau `paksa`): daftar barang
   & nama supplier. Nama supplier hanya mengisi kotak yang kosong / masih
   berisi isian otomatis sebelumnya. */
function poSelaraskanDariPr(opsi) {
  const paksa = !!(opsi && opsi.paksa);
  if (poManual && !paksa) return false;
  const mataPr = (poIsian("prMataUang") || {}).value || "";
  const mataPo = (poIsian("currency") || {}).value || "";
  const baru = poDariPr(poBaris.pr, mataPr, mataPo);
  poBaris.po = baru.length ? baru : [poBarisBaru("po")];
  if (paksa) poManual = false;
  const kotak = poIsian("poPenjualNama");
  const pemasok = poPemasokDariPr(poBaris.pr);
  if (kotak && (!kotak.value.trim() || kotak.dataset.autoFill === "1")) {
    kotak.value = pemasok;
    if (pemasok) kotak.dataset.autoFill = "1";
    else delete kotak.dataset.autoFill;
  }
  poGambar("po");
  return true;
}

/* ---------- tabel barang ---------- */

function poBarisHtml(jenis, b, i) {
  const L = PO_LABEL[jenis];
  const kotak = (f, kelas, atribut) => {
    const v = PO_ANGKA[jenis].has(f) ? poTeksAngka(poAngka(b[f])) : String(b[f] == null ? "" : b[f]);
    return `<td class="${kelas}" data-label="${escapeAttr(L[f]())}"><input type="text" data-pl-f="${f}" value="${escapeAttr(v)}" aria-label="${escapeAttr(`${L[f]()} ${i + 1}`)}"${atribut || ""}></td>`;
  };
  const angka = ' inputmode="decimal" autocomplete="off" placeholder="0"';
  const jumlah = `<td class="pl-jumlah" data-label="${escapeAttr(L.jumlah())}" data-pl-jumlah>${escapeHtml(poTeksAngka(poJumlahBaris(jenis, b)))}</td>`;
  const sel =
    jenis === "pr"
      ? [
          kotak("nama", "pl-nama"),
          kotak("spek", "pl-spek"),
          kotak("qty", "pl-qty", ' placeholder="1 SET" autocomplete="off" spellcheck="false"'),
          kotak("harga", "pl-harga", angka),
          jumlah,
          kotak("pemasok", "pl-pemasok"),
          kotak("catatan", "pl-catatan"),
        ]
      : [
          kotak("produk", "pl-nama"),
          kotak("spek", "pl-spek"),
          kotak("qty", "pl-qty", angka),
          kotak("satuan", "pl-sat", ' placeholder="SET" autocomplete="off"'),
          kotak("harga", "pl-harga", angka),
          jumlah,
          kotak("catatan", "pl-catatan"),
        ];
  const hapus = tt(`Hapus baris ${i + 1}`, `Remove row ${i + 1}`);
  return `<tr data-pl="${i}">
      <td class="fl-no">${i + 1}</td>${sel.join("")}
      <td class="fl-act"><button type="button" class="rm-row" data-pl-del="${i}" title="${escapeAttr(hapus)}" aria-label="${escapeAttr(hapus)}"><i class="bi bi-x-lg" aria-hidden="true"></i></button></td>
    </tr>`;
}

function poMata(jenis) {
  const el = poIsian(jenis === "pr" ? "prMataUang" : "currency");
  return (el && el.value) || (jenis === "pr" ? "IDR" : "USD");
}

function poGambarKaki(jenis) {
  const kaki = document.getElementById(jenis === "pr" ? "poPrFoot" : "poPoFoot");
  if (kaki) {
    const total = poTotal(jenis, poBaris[jenis]);
    const label = jenis === "pr" ? tt("Total Harga (perkiraan)", "Total Price (estimate)") : "TOTAL";
    kaki.innerHTML = `<div class="fl-sum fl-sum--total"><span>${escapeHtml(label)}</span><b>${escapeHtml(total ? `${poMata(jenis)} ${formatNilai(total)}` : "—")}</b></div>`;
  }
  const hitung = document.querySelector(`[data-po-hitung="${jenis}"]`);
  if (hitung) {
    const n = poBarisBersih(jenis, poBaris[jenis]).length;
    hitung.textContent = n ? tt(`${n} barang`, `${n} item${n === 1 ? "" : "s"}`) : "";
  }
  if (jenis === "po") poGambarStatus();
}

function poGambar(jenis) {
  const body = document.getElementById(jenis === "pr" ? "poPrBody" : "poPoBody");
  if (!poBaris[jenis].length) poBaris[jenis] = [poBarisBaru(jenis)];
  if (body) body.innerHTML = poBaris[jenis].map((b, i) => poBarisHtml(jenis, b, i)).join("");
  poGambarKaki(jenis);
}

// Keterangan "ikut PR" & tombol Salin ulang di kepala daftar PO
function poGambarStatus() {
  const ket = document.getElementById("poIkutPr");
  const tombol = document.getElementById("btnPoSalinPr");
  const adaPr = poBarisBersih("pr", poBaris.pr).length > 0;
  if (ket) {
    ket.textContent = !adaPr ? "" : poManual ? tt("Diubah sendiri — tidak lagi mengikuti PR", "Edited by hand — no longer follows the PR") : tt("Mengikuti PR otomatis", "Follows the PR automatically");
    ket.classList.toggle("is-manual", poManual && adaPr);
  }
  if (tombol) tombol.hidden = !(poManual && adaPr);
}

/* ---------- bagian PR / PO ---------- */

function poTampilBagian(kunci, opsi) {
  const panel = poPanel();
  if (!panel || (kunci !== "pr" && kunci !== "po")) return;
  panel.querySelectorAll("[data-po-bagian]").forEach((tab) => {
    const aktif = tab.dataset.poBagian === kunci;
    tab.classList.toggle("is-aktif", aktif);
    tab.setAttribute("aria-selected", aktif ? "true" : "false");
    tab.tabIndex = aktif ? 0 : -1;
  });
  panel.querySelectorAll("[data-po-isi]").forEach((isi) => {
    isi.hidden = isi.dataset.poIsi !== kunci;
  });
  if (kunci === "po") poGambarStatus();
  if (opsi && opsi.fokus) {
    const tab = panel.querySelector(`[data-po-bagian="${kunci}"]`);
    if (tab) tab.focus();
  }
}

// Isian bertanda merah di bagian yang tersembunyi: bagiannya dibuka dulu
function poTampilkanBagianDari(el) {
  const isi = el && el.closest ? el.closest("[data-po-isi]") : null;
  if (isi && isi.hidden) poTampilBagian(isi.dataset.poIsi);
}

/* ---------- Doc No (Groupware) ---------- */

function poDocNoBawaan(iso) {
  const tgl = /^\d{4}-\d{2}/.test(String(iso || "")) ? String(iso) : todayISO();
  return `DST-${tgl.slice(2, 4)}${tgl.slice(5, 7)}-0000`;
}
const poDocNoAdalahBawaan = (v) => PO_DOCNO_RE.test(String(v == null ? "" : v).trim());

// Doc No yang dicetak di PO: isian tersimpan, atau bawaan bulan Tanggal PO
function poDocNoCetak(p, iso) {
  const v = String((p && p.docNo) || "").trim();
  return v || poDocNoBawaan(iso);
}

function poDocNoKeterangan() {
  const ket = document.getElementById("poDocNoKet");
  const kotak = poIsian("docNo");
  if (!ket || !kotak) return;
  const bawaan = poDocNoAdalahBawaan(kotak.value) || !kotak.value.trim();
  ket.textContent = bawaan
    ? tt("Ganti 0000 dengan nomor Doc No sesudah PO diajukan di Groupware — selama 0000, PO mencetak nomor bawaan ini.",
      "Replace 0000 with the Doc No once the PO is submitted in Groupware — while it is 0000, the PO prints this default.")
    : tt("Tercetak di bagian bawah PO.", "Printed at the bottom of the PO.");
}

// Kotak kosong / masih bawaan -> bawaan bulan Tanggal PO
function poIsiDocNoBawaan() {
  const kotak = poIsian("docNo");
  if (!kotak) return;
  const kini = kotak.value.trim();
  if (!kini || poDocNoAdalahBawaan(kini)) {
    const bawaan = poDocNoBawaan((poIsian("docDate") || {}).value);
    if (kotak.value !== bawaan) kotak.value = bawaan;
  }
  poDocNoKeterangan();
}

/* ---------- Tenggat Waktu PR ---------- */

function poHitungTenggat() {
  const el = poIsian("prTenggat");
  if (!el || (el.value.trim() && el.dataset.autoFill !== "1")) return;
  const a = parseLocalDate((poIsian("prTanggal") || {}).value);
  const b = parseLocalDate((poIsian("prTglMasuk") || {}).value);
  const hari = a && b && b >= a ? Math.round((b - a) / 86400000) : null;
  if (hari == null) {
    if (el.dataset.autoFill === "1") el.value = "";
    delete el.dataset.autoFill;
    return;
  }
  el.value = `${hari} Hari`;
  el.dataset.autoFill = "1";
}

/* ---------- jalur form Nomor Dokumen (docnum-view.js) ---------- */

// Daftar barang + Doc No bawaan (tidak disimpan) ke hasil readDocNumForm
function poBacaForm(out) {
  const pr = poBarisBersih("pr", poBaris.pr);
  const po = poBarisBersih("po", poBaris.po);
  if (pr.length) out.prItems = pr;
  if (po.length) out.poItems = po;
  if (poManual && po.length) out.poManual = true;
  if ("docNo" in out && poDocNoAdalahBawaan(out.docNo)) out.docNo = "";
  return out;
}

function poValidasi() {
  if (poBarisBersih("pr", poBaris.pr).length || poBarisBersih("po", poBaris.po).length) return [];
  const panel = poPanel();
  const kotak = panel && panel.querySelector('#poPrBody [data-pl-f="nama"]');
  if (kotak) kotak.classList.add("is-invalid");
  return [tt("Isi sedikitnya satu barang di daftar PR atau PO.", "Fill in at least one item in the PR or PO list.")];
}

function poReset() {
  poBaris = { pr: [poBarisBaru("pr")], po: [poBarisBaru("po")] };
  poManual = false;
  ["prTenggat", "poPenjualNama"].forEach((k) => {
    const el = poIsian(k);
    if (el) delete el.dataset.autoFill;
  });
  poGambar("pr");
  poGambar("po");
  poTampilBagian("pr");
  const tgl = poIsian("prTanggal");
  if (tgl && !tgl.value) tgl.value = todayISO();
  poIsiDocNoBawaan();
}

function poFotoDraf() {
  const panel = poPanel();
  const aktif = panel && panel.querySelector("[data-po-bagian].is-aktif");
  return {
    baris: JSON.parse(JSON.stringify(poBaris)),
    manual: poManual,
    bagian: aktif ? aktif.dataset.poBagian : "pr",
  };
}

function poPulihkanDraf(d) {
  if (!d) return;
  poBaris = { pr: (d.baris && d.baris.pr) || [], po: (d.baris && d.baris.po) || [] };
  poManual = !!d.manual;
  poGambar("pr");
  poGambar("po");
  poTampilBagian(d.bagian || "pr");
  poDocNoKeterangan();
}

// PO tersimpan dibuka untuk diubah (mulaiUbahDocNum)
function poMuatPayload(p) {
  const x = p || {};
  poBaris = {
    pr: (Array.isArray(x.prItems) ? x.prItems : []).map((b) => Object.assign(poBarisBaru("pr"), b)),
    po: (Array.isArray(x.poItems) ? x.poItems : []).map((b) => Object.assign(poBarisBaru("po"), b)),
  };
  poManual = !!x.poManual || (!!poBaris.po.length && !poBaris.pr.length);
  poGambar("pr");
  poGambar("po");
  poTampilBagian("pr");
  poIsiDocNoBawaan();
}

/* Tab PO & PR dibuka (showDocNumTab): Tanggal Permintaan PR hari ini, Doc No
   bawaan bulan Tanggal PO, Tenggat dihitung. Purchasing / Engineering:
   Departemen bawaan = perannya sendiri (bukan EXIM) selama belum dipilih. */
function poSaatDibuka() {
  const tgl = poIsian("prTanggal");
  if (tgl && !tgl.value) tgl.value = todayISO();
  const dept = poIsian("department");
  if (dept && typeof hanyaPoPr === "function" && hanyaPoPr() && !dept.dataset.disentuh) {
    const label = aturanPeran().label;
    const opsi = [...dept.options].find((o) => o.value === label);
    if (opsi) {
      [...dept.options].forEach((o) => (o.defaultSelected = o === opsi));
      dept.value = label;
    }
  }
  poIsiDocNoBawaan();
  poHitungTenggat();
}

/* ---------- PENDENGAR ---------- */

function poSesudahUbahPr() {
  poGambarKaki("pr");
  if (!poSelaraskanDariPr()) poGambarStatus();
}

// Baris KOSONG disisipkan: isi daftar tidak berubah, jadi PO tidak dianggap diubah sendiri
function poSisipBaris(jenis, idx) {
  poBaris[jenis].splice(idx + 1, 0, poBarisBaru(jenis));
  poGambar(jenis);
}

function poPasangTabel(jenis) {
  const body = document.getElementById(jenis === "pr" ? "poPrBody" : "poPoBody");
  if (!body) return;
  body.addEventListener("input", (e) => {
    const el = e.target;
    const f = el.dataset.plF;
    const tr = el.closest("[data-pl]");
    if (!f || !tr) return;
    const b = poBaris[jenis][Number(tr.dataset.pl)];
    if (!b) return;
    if (PO_ANGKA[jenis].has(f)) {
      formatKotakRupiah(el);
      b[f] = poAngka(el.value) || "";
    } else b[f] = el.value;
    el.classList.remove("is-invalid");
    const sel = tr.querySelector("[data-pl-jumlah]");
    if (sel) sel.textContent = poTeksAngka(poJumlahBaris(jenis, b));
    if (jenis === "pr") poSesudahUbahPr();
    else {
      poManual = true;
      poGambarKaki("po");
    }
  });
  /* Enter = turun ke kotak yang sama di baris berikutnya (baris terakhir:
     baris baru); Ctrl/⌘+Enter = sisipkan baris kosong TEPAT di bawah baris
     aktif -- sama dengan Rincian Biaya Pengajuan Dana. */
  body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const f = e.target.dataset.plF;
    const tr = e.target.closest("[data-pl]");
    if (!f || !tr) return;
    e.preventDefault();
    const idx = Number(tr.dataset.pl);
    const sisip = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    if (sisip || idx === poBaris[jenis].length - 1) poSisipBaris(jenis, idx);
    const kolom = sisip ? (jenis === "pr" ? "nama" : "produk") : f;
    const tuju = body.querySelector(`[data-pl="${idx + 1}"] [data-pl-f="${kolom}"]`);
    if (tuju) {
      tuju.focus();
      if (!sisip && typeof tuju.select === "function") tuju.select();
    }
  });
  body.addEventListener("click", (e) => {
    const del = e.target.closest("[data-pl-del]");
    if (!del) return;
    poBaris[jenis].splice(Number(del.dataset.plDel), 1);
    if (jenis === "po") poManual = true;
    poGambar(jenis);
    if (jenis === "pr") poSesudahUbahPr();
  });
  const tambah = document.getElementById(jenis === "pr" ? "btnPoPrTambah" : "btnPoPoTambah");
  if (tambah) {
    tambah.addEventListener("click", () => {
      poSisipBaris(jenis, poBaris[jenis].length - 1);
      const kotak = body.querySelector(`tr:last-child [data-pl-f="${jenis === "pr" ? "nama" : "produk"}"]`);
      if (kotak) kotak.focus();
    });
  }
}

(function pasangFormPo() {
  const panel = poPanel();
  if (!panel) return;
  poPasangTabel("pr");
  poPasangTabel("po");

  // Tab bagian: klik, dan panah kiri / kanan seperti tablist biasa
  const langkah = panel.querySelector(".po-langkah");
  if (langkah) {
    langkah.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-po-bagian]");
      if (tab) poTampilBagian(tab.dataset.poBagian);
    });
    langkah.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tab = e.target.closest("[data-po-bagian]");
      if (!tab) return;
      e.preventDefault();
      poTampilBagian(tab.dataset.poBagian === "pr" ? "po" : "pr", { fokus: true });
    });
  }

  panel.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.dn;
    if (!k) return;
    if (k === "prTenggat" || k === "poPenjualNama") delete e.target.dataset.autoFill;
    if (k === "docNo") poDocNoKeterangan();
  });
  panel.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.dn;
    if (k === "department") e.target.dataset.disentuh = "1";
    if (k === "prTanggal" || k === "prTglMasuk") poHitungTenggat();
    // Bulan Doc No bawaan ikut Tanggal PO
    if (k === "docDate" && poDocNoAdalahBawaan((poIsian("docNo") || {}).value)) poIsiDocNoBawaan();
    // Mata uang berganti: judul kolom, total, dan harga PR yang ikut ke PO
    if (k === "currency" || k === "prMataUang") {
      panel.querySelectorAll("[data-mata-po]").forEach((el) => (el.textContent = poMata("po")));
      poGambarKaki("pr");
      if (!poSelaraskanDariPr()) poGambarKaki("po");
    }
  });
  // Fokus ke Doc No yang masih bawaan: "0000" langsung terpilih, tinggal diketik
  panel.addEventListener("focusin", (e) => {
    const kotak = e.target;
    if (!kotak.matches || !kotak.matches('[data-dn="docNo"]') || !poDocNoAdalahBawaan(kotak.value)) return;
    const pilih = () => {
      if (document.activeElement !== kotak || !poDocNoAdalahBawaan(kotak.value)) return;
      const n = kotak.value.trim().length;
      try {
        kotak.setSelectionRange(n - 4, n);
      } catch (err) {
        /* kotak tanpa kursor */
      }
    };
    pilih();
    setTimeout(pilih, 0);
  });

  const salin = document.getElementById("btnPoSalinPr");
  if (salin) {
    salin.addEventListener("click", () => {
      poSelaraskanDariPr({ paksa: true });
      showToast(tt("Daftar barang PO disalin ulang dari PR.", "The PO item list was copied again from the PR."), "success");
    });
  }

  poGambar("pr");
  poGambar("po");
  poIsiDocNoBawaan();
})();
