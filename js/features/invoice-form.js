"use strict";

/* INVOICE & PACKING LIST KEDUA DST. DI FORM JADWAL (tab Dokumen & Umum)

   Satu PIB / PEB bisa memakai beberapa invoice, masing-masing dengan
   Packing List-nya. Baris ke-1 = isian tetap di index.html (#fInvoice,
   #fInvoiceDate, #fPackingList, #fPackingListDate -- pasangan & tanda
   bedanya di form-router.js). Baris ke-2 dst. digambar di sini dari
   draftInvoiceLain dan tersimpan bersama baris ke-1 sebagai
   s.dokInvoice (dokInvoiceForm; core/helpers.js: rapikanDokInvoice).

   BARISNYA BERTAMBAH SENDIRI saat impor membawa lebih dari satu invoice
   -- draft CEISA / PIB / PEB dengan beberapa dokumen 380, atau beberapa
   CIPL sekaligus (terapkanInvoiceImpor, import/apply-to-form.js) -- atau
   lewat tombol "Tambah Invoice & Packing List".

   Aturan tiap baris sama dengan baris ke-1: nomor & tanggal Invoice dan
   Packing List saling mengikuti selama yang lain kosong / masih ikutan;
   yang diketik sendiri tidak ditimpa; mengosongkan satu tidak
   mengosongkan pasangannya; yang berbeda ditandai kuning + satu kalimat
   di bawah barisnya.

   BARANG TIAP INVOICE. Bila invoicenya lebih dari satu dan barangnya
   sudah ada, di bawah tiap invoice tertulis barang miliknya menurut Seri
   Barang (item.invoiceNomor; kunciInvoiceBarang, helpers.js), dan invoice
   ke-2 dst. punya kotak "Barang mulai ke-": barang sejak nomor itu sampai
   sebelum invoice berikutnya menjadi miliknya. Dasarnya kolom NO.
   INVOICE templat salin -- nomor tiap invoice di barang pertama
   kelompoknya. Impor CIPL menandai barangnya sendiri; mengganti nomor
   invoice ikut mengganti tanda barangnya. */

let draftInvoiceLain = [];
/* Nomor baris ke-1 yang terakhir menandai barang: nomor itu diganti ->
   tanda barangnya ikut (gantiInvoiceBarang). */
let tandaInvoiceBaris1 = "";

const invTeks = (v) => String(v == null ? "" : v).trim();
// Nomor dibandingkan seperti bedaInvoicePackingList (form-router.js): tanpa spasi, tanpa beda huruf besar
const invKunciPasangan = (v) => invTeks(v).replace(/\s+/g, "").toUpperCase();
const INV_PASANGAN = { nomor: "pl", pl: "nomor", tanggal: "plTanggal", plTanggal: "tanggal" };
const INV_KOLOM = ["nomor", "tanggal", "pl", "plTanggal"];

/* Entri form: isian + penanda ikutan tiap kotak. Dua isian yang sama =
   ikutan (yang mana pun diubah, yang lain mengikuti); berbeda = dua-
   duanya isian sendiri -- tandaiPasanganTersimpan di form-router.js. */
function tandaiIkutInvoice(e) {
  const sama = (a, b) => !!invTeks(a) && invTeks(a) === invTeks(b);
  const nomor = sama(e.nomor, e.pl);
  const tanggal = sama(e.tanggal, e.plTanggal);
  e._ikut = { nomor, pl: nomor, tanggal, plTanggal: tanggal };
  return e;
}
function entriInvoiceForm(d) {
  const e = tandaiIkutInvoice(entriInvoiceRapi(d));
  e._tanda = e.nomor;
  return e;
}
// Isian yang terisi mengisi pasangannya yang masih kosong (aturan mengetik)
function lengkapiPasanganInvoice(e) {
  ["nomor", "tanggal"].forEach((k) => {
    const p = INV_PASANGAN[k];
    if (invTeks(e[k]) && !invTeks(e[p])) e[p] = e[k];
    else if (invTeks(e[p]) && !invTeks(e[k])) e[k] = e[p];
    else return;
    e._ikut[k] = e._ikut[p] = true;
  });
  return e;
}

// Baris ke-1 dari isian tetapnya
function invoiceBaris1() {
  const v = (id) => ($("#" + id) ? $("#" + id).value : "");
  return { nomor: invTeks(v("fInvoice")), tanggal: v("fInvoiceDate"), pl: invTeks(v("fPackingList")), plTanggal: v("fPackingListDate") };
}

// Isi form yang disimpan: semua baris; yang kosong dibuang, nomor kembar disatukan
function dokInvoiceForm() {
  return rapikanDokInvoice([invoiceBaris1()].concat(draftInvoiceLain));
}

/* Form dibuka (renderFormPage): baris ke-2 dst. dari daftar invoice
   jadwalnya; baris ke-1 sudah diisi pemanggilnya. */
function bukaInvoiceForm(daftar) {
  const d = rapikanDokInvoice(daftar);
  draftInvoiceLain = d.slice(1).map(entriInvoiceForm);
  tandaInvoiceBaris1 = d.length ? d[0].nomor : "";
  renderInvoiceLain();
}
// Nomor baris ke-1 yang ditulis kode (impor): jadi patokan tanda barang berikutnya
function catatTandaInvoiceBaris1() {
  tandaInvoiceBaris1 = invTeks($("#fInvoice") && $("#fInvoice").value);
}

/* ---------------- tanda invoice tiap barang ---------------- */

// Nomor invoice diganti: barang bertanda nomor lama ikut berganti tanda
function gantiInvoiceBarang(lama, baru) {
  const kl = kunciInvoice(lama);
  const nb = invTeks(baru);
  if (!kl || !kunciInvoice(nb) || kl === kunciInvoice(nb)) return false;
  let ubah = false;
  draftItems.forEach((it) => {
    if (kunciInvoice(it.invoiceNomor) !== kl) return;
    it.invoiceNomor = nb;
    ubah = true;
  });
  return ubah;
}

// Barang yang benar-benar diisi, beserta Seri Barang-nya di tabel (posisi baris)
function barangInvoiceForm() {
  return draftItems.map((it, i) => ({ it, no: i + 1 })).filter((x) => invTeks(x.it.namaBarang));
}

/* "Barang mulai ke-" invoice `nomor`: barang sejak Seri Barang `mulai`
   menjadi miliknya, sampai awal invoice berikutnya. Awal invoice lain
   tetap seperti sekarang; invoice pertama tetap mulai dari barang 1. */
function aturMulaiBarangInvoice(nomor, mulai) {
  const daftar = dokInvoiceForm().filter((d) => d.nomor);
  const barang = barangInvoiceForm();
  const kini = kunciInvoice(nomor);
  if (daftar.length < 2 || !barang.length || !kini || !(mulai >= 1)) return false;
  const tanda = kunciInvoiceBarang(barang.map((x) => x.it), daftar);
  const awal = new Map();
  tanda.forEach((k, i) => {
    if (k && !awal.has(k)) awal.set(k, barang[i].no);
  });
  const pertama = kunciInvoice(daftar[0].nomor);
  if (!awal.has(pertama)) awal.set(pertama, 1);
  awal.delete(kini);
  // Urutan stabil: invoice yang sedang diatur menang bila awalnya sama dengan invoice lain
  const urut = [...awal.entries()].concat([[kini, mulai]]).sort((a, b) => a[1] - b[1]);
  barang.forEach((x) => {
    let k = "";
    urut.forEach(([kk, mulaiKk]) => {
      if (mulaiKk <= x.no) k = kk;
    });
    x.it.invoiceNomor = nomorInvoiceDariKunci(daftar, k);
  });
  return true;
}

/* Rentang barang tiap invoice: kunci -> [[awal, akhir], ...] (Seri Barang),
   atau null bila tidak perlu ditampilkan (satu invoice / belum ada barang). */
function rentangBarangInvoice() {
  const daftar = dokInvoiceForm().filter((d) => d.nomor);
  const barang = barangInvoiceForm();
  if (daftar.length < 2 || !barang.length) return null;
  const tanda = kunciInvoiceBarang(barang.map((x) => x.it), daftar);
  const rentang = new Map();
  tanda.forEach((k, i) => {
    if (!k) return;
    const r = rentang.get(k) || [];
    const akhir = r[r.length - 1];
    if (akhir && i > 0 && tanda[i - 1] === k) akhir[1] = barang[i].no;
    else r.push([barang[i].no, barang[i].no]);
    rentang.set(k, r);
  });
  return { rentang, ditandai: tanda.some(Boolean) };
}
const teksRentangBarang = (r) => (r || []).map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");

/* Keterangan barang di bawah tiap invoice (dipanggil tiap tabel barang
   digambar ulang, tab Dokumen dibuka, atau nomor invoice berubah).
   Kotak "mulai" yang sedang diketik tidak ditimpa, kecuali `paksa`
   (Enter / selesai mengisinya). */
function segarkanRentangInvoice(opsi) {
  const paksa = !!(opsi && opsi.paksa);
  const hasil = rentangBarangInvoice();
  const ket1 = $("#invoiceRentang1");
  if (ket1) {
    const k1 = kunciInvoice(invoiceBaris1().nomor);
    const r1 = hasil && k1 ? hasil.rentang.get(k1) : null;
    ket1.hidden = !hasil;
    ket1.textContent = !hasil
      ? ""
      : !hasil.ditandai
        ? tt(
            "Barang mana milik invoice mana belum diketahui — isi “Barang mulai ke-” di invoice berikutnya, supaya nomor invoice di templat salin tepat di barang pertamanya.",
            "Which items belong to which invoice is not known yet — fill in “Items start at” on the next invoice, so each invoice number in the copy templates sits on its first item.",
          )
        : r1
          ? tt(`Barang ${teksRentangBarang(r1)} milik invoice ini.`, `Items ${teksRentangBarang(r1)} belong to this invoice.`)
          : tt("Belum ada barang milik invoice ini.", "No items belong to this invoice yet.");
  }
  $$("#invoiceLainIsi [data-inv-i]").forEach((baris) => {
    const d = draftInvoiceLain[Number(baris.dataset.invI)];
    const wadah = baris.querySelector("[data-inv-rentang]");
    if (!d || !wadah) return;
    const k = kunciInvoice(d.nomor);
    const r = hasil && k ? hasil.rentang.get(k) : null;
    wadah.hidden = !hasil || !k;
    const kotak = wadah.querySelector("[data-inv-mulai]");
    if (kotak && (paksa || document.activeElement !== kotak)) kotak.value = r ? String(r[0][0]) : "";
    const ket = wadah.querySelector("[data-inv-rentang-ket]");
    if (ket) {
      ket.textContent = !hasil || !k
        ? ""
        : r
          ? tt(`· barang ${teksRentangBarang(r)}`, `· items ${teksRentangBarang(r)}`)
          : tt("· belum ada barang", "· no items yet");
    }
  });
}

/* ---------------- baris ke-2 dst. ---------------- */

function invoiceLainHtml(d, i) {
  const ke = i + 2;
  const id = (dasar) => `${dasar}${ke}`;
  const isian = (k, label, jenis, ph) => `
          <div>
            <label class="form-label" for="${id(k.id)}">${escapeHtml(label)}</label>
            <input type="${jenis}" class="form-control" id="${id(k.id)}" data-inv-k="${k.k}" value="${escapeAttr(d[k.k] || "")}"${
              ph ? ` placeholder="${escapeAttr(ph)}" autocomplete="off"` : ""
            }>
          </div>`;
  return `
    <div class="inv-baris" data-inv-i="${i}">
      <div class="fgrid">
        <div class="s6 fl-bertanggal">${isian({ id: "fInvoice", k: "nomor" }, tt(`No. Invoice ${ke}`, `Invoice No. ${ke}`), "text", tt("Nomor invoice", "Invoice number"))}${isian(
          { id: "fInvoiceDate", k: "tanggal" },
          tt(`Tanggal Invoice ${ke}`, `Invoice Date ${ke}`),
          "date",
        )}
        </div>
        <div class="s6 fl-bertanggal">${isian({ id: "fPackingList", k: "pl" }, tt(`No. Packing List ${ke}`, `Packing List No. ${ke}`), "text", tt("Nomor packing list", "Packing list number"))}${isian(
          { id: "fPackingListDate", k: "plTanggal" },
          tt(`Tanggal Packing List ${ke}`, `Packing List Date ${ke}`),
          "date",
        )}
        </div>
        <div class="s12 form-text-note fg-note cipl-beda-ket" data-inv-beda role="status" hidden></div>
        <div class="s12 fg-note inv-info">
          <div class="inv-rentang" data-inv-rentang hidden>
            <label class="inv-mulai-label" for="${id("invMulai")}">${escapeHtml(tt("Barang mulai ke-", "Items start at no."))}</label>
            <input type="text" class="form-control inv-mulai" id="${id("invMulai")}" data-inv-mulai inputmode="numeric" autocomplete="off"
              title="${escapeAttr(tt("Seri Barang pertama invoice ini — barang sejak nomor ini sampai sebelum invoice berikutnya menjadi miliknya", "This invoice's first item (Seri Barang) — items from this number up to the next invoice belong to it"))}">
            <span class="inv-rentang-ket" data-inv-rentang-ket></span>
          </div>
          <button type="button" class="dp-hapus inv-hapus" data-inv-hapus title="${escapeAttr(tt(`Hapus invoice ${ke}`, `Remove invoice ${ke}`))}">
            <i class="bi bi-x-lg" aria-hidden="true"></i><span>${escapeHtml(tt(`Hapus invoice ${ke}`, `Remove invoice ${ke}`))}</span>
          </button>
        </div>
      </div>
    </div>`;
}

// Perbedaan Invoice vs Packing List satu baris -- bentuknya sama dengan bedaInvoicePackingList (form-router.js)
function bedaBarisInvoice(d) {
  const beda = [];
  if (!d) return beda;
  if (invTeks(d.nomor) && invTeks(d.pl) && invKunciPasangan(d.nomor) !== invKunciPasangan(d.pl))
    beda.push({ jenis: "nomor", invoice: invTeks(d.nomor), pl: invTeks(d.pl) });
  if (d.tanggal && d.plTanggal && d.tanggal !== d.plTanggal) beda.push({ jenis: "tanggal", invoice: d.tanggal, pl: d.plTanggal });
  return beda;
}
// Semua baris ke-2 dst. yang berbeda: [{ ke, beda }] -- catatan sesudah impor (dispatch.js)
function bedaInvoicePackingListLain() {
  return draftInvoiceLain.map((d, i) => ({ ke: i + 2, beda: bedaBarisInvoice(d) })).filter((x) => x.beda.length);
}
function tandaiBedaInvoiceLain(baris, d) {
  if (!baris) return;
  const beda = bedaBarisInvoice(d);
  const ket = baris.querySelector("[data-inv-beda]");
  if (ket) {
    ket.hidden = !beda.length;
    ket.textContent = beda.length
      ? `${kalimatBedaCipl(beda)}. ${tt("Seharusnya nomor & tanggal Invoice dan Packing List sama — periksa dokumennya.", "Invoice and Packing List number & date should match — check the documents.")}`
      : "";
  }
  [
    ["pl", "nomor"],
    ["plTanggal", "tanggal"],
  ].forEach(([k, jenis]) => {
    const el = baris.querySelector(`[data-inv-k="${k}"]`);
    if (el) el.classList.toggle("is-beda", beda.some((b) => b.jenis === jenis));
  });
}

function renderInvoiceLain() {
  const wadah = $("#invoiceLainIsi");
  if (!wadah) return;
  wadah.innerHTML = draftInvoiceLain.map(invoiceLainHtml).join("");
  wadah.querySelectorAll("[data-inv-i]").forEach((baris) => tandaiBedaInvoiceLain(baris, draftInvoiceLain[Number(baris.dataset.invI)]));
  segarkanRentangInvoice();
}

/* Invoice hasil impor selain baris ke-1 (terapkanInvoiceImpor,
   apply-to-form.js): nomor yang sudah ada melengkapi isiannya yang
   kosong / masih ikutan -- yang diketik sendiri tidak ditimpa; nomor
   baru mengisi baris yang masih kosong atau menjadi baris baru. Isian
   dari berkas = isian sendiri; pasangannya yang kosong mengikuti.
   Hasil: jumlah baris yang bertambah atau berubah. */
function tambahInvoiceLainImpor(daftar) {
  let berubah = 0;
  rapikanDokInvoice(daftar).forEach((e) => {
    const k = kunciInvoice(e.nomor);
    let d = k ? draftInvoiceLain.find((x) => kunciInvoice(x.nomor) === k) : null;
    if (!d) d = draftInvoiceLain.find((x) => INV_KOLOM.every((f) => !invTeks(x[f])));
    if (!d) {
      draftInvoiceLain.push(lengkapiPasanganInvoice(entriInvoiceForm(e)));
      berubah++;
      return;
    }
    let ubah = false;
    INV_KOLOM.forEach((f) => {
      if (!e[f] || (invTeks(d[f]) && !d._ikut[f]) || d[f] === e[f]) return;
      d[f] = e[f];
      ubah = true;
    });
    if (!ubah) return;
    if (!invTeks(d._tanda)) d._tanda = d.nomor;
    tandaiIkutInvoice(d);
    lengkapiPasanganInvoice(d);
    berubah++;
  });
  if (berubah) renderInvoiceLain();
  return berubah;
}

// Hapus baris ke-(i+2): barangnya pindah ke invoice sebelumnya
function hapusInvoiceLain(i) {
  const d = draftInvoiceLain[i];
  if (!d) return;
  const sebelum = i > 0 ? draftInvoiceLain[i - 1].nomor : invoiceBaris1().nomor;
  if (invTeks(sebelum)) gantiInvoiceBarang(d.nomor || d._tanda, sebelum);
  draftInvoiceLain.splice(i, 1);
  renderInvoiceLain();
  const sisa = $$("#invoiceLainIsi [data-inv-i]");
  const sasaran = sisa[Math.min(i, sisa.length - 1)];
  fokuskan(sasaran ? sasaran.querySelector('[data-inv-k="nomor"]') : $("#btnTambahInvoice"));
}

const wadahInvoiceLain = $("#invoiceLainIsi");
if (wadahInvoiceLain) {
  const letak = (el) => {
    const b = el && el.closest("[data-inv-i]");
    return b ? Number(b.dataset.invI) : -1;
  };
  const isiKotak = (baris, k, v) => {
    const el = baris.querySelector(`[data-inv-k="${k}"]`);
    if (el && el.value !== v) el.value = v;
  };
  // Isian -> keadaan (input & change sama-sama: kotak tanggal bisa hanya memicu salah satunya)
  const catat = (e) => {
    const k = e.target.dataset.invK;
    const baris = e.target.closest("[data-inv-i]");
    const d = draftInvoiceLain[letak(e.target)];
    if (!k || !d || d[k] === e.target.value) return;
    const nomorLama = d.nomor;
    d[k] = e.target.value;
    d._ikut[k] = false;
    const p = INV_PASANGAN[k];
    if (invTeks(d[k]) && (!invTeks(d[p]) || d._ikut[p])) {
      d[p] = d[k];
      d._ikut[p] = true;
      isiKotak(baris, p, d[k]);
    }
    if (d.nomor !== nomorLama && invTeks(d.nomor)) {
      gantiInvoiceBarang(d._tanda || nomorLama, d.nomor);
      d._tanda = invTeks(d.nomor);
    }
    tandaiBedaInvoiceLain(baris, d);
    if (d.nomor !== nomorLama) segarkanRentangInvoice();
  };
  // Nomor yang tidak sah dikembalikan ke awal yang berlaku; yang sah membagi ulang barangnya
  const aturMulai = (el) => {
    const d = draftInvoiceLain[letak(el)];
    const n = parseInt(String(el.value || "").replace(/\D/g, ""), 10);
    if (d && invTeks(d.nomor) && n >= 1) aturMulaiBarangInvoice(d.nomor, n);
    segarkanRentangInvoice({ paksa: true });
  };
  wadahInvoiceLain.addEventListener("input", (e) => {
    if (!e.target.matches("[data-inv-mulai]")) catat(e);
  });
  wadahInvoiceLain.addEventListener("change", (e) => {
    if (e.target.matches("[data-inv-mulai]")) aturMulai(e.target);
    else catat(e);
  });
  wadahInvoiceLain.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || !e.target.matches("[data-inv-mulai]")) return;
    e.preventDefault();
    e.stopPropagation();
    aturMulai(e.target);
    e.target.select && e.target.select();
  });
  wadahInvoiceLain.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-inv-hapus]");
    if (tombol) hapusInvoiceLain(letak(tombol));
  });
}

const tombolTambahInvoice = $("#btnTambahInvoice");
if (tombolTambahInvoice) {
  tombolTambahInvoice.addEventListener("click", () => {
    draftInvoiceLain.push(entriInvoiceForm({}));
    renderInvoiceLain();
    const baris = $$("#invoiceLainIsi [data-inv-i]");
    fokuskan(baris.length ? baris[baris.length - 1].querySelector('[data-inv-k="nomor"]') : null);
  });
}

// Nomor invoice baris ke-1 diganti: tanda barangnya ikut, keterangan barangnya diperbarui
const isianInvoiceBaris1 = $("#fInvoice");
if (isianInvoiceBaris1) {
  isianInvoiceBaris1.addEventListener("input", () => {
    const baru = invTeks(isianInvoiceBaris1.value);
    if (!baru) return;
    if (tandaInvoiceBaris1) gantiInvoiceBarang(tandaInvoiceBaris1, baru);
    tandaInvoiceBaris1 = baru;
    segarkanRentangInvoice();
  });
}
