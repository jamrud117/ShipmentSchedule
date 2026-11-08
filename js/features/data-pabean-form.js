"use strict";

/* ==================================================================
   HALAMAN DATA PIB / PEB (tab 4 form jadwal)

   Disusun seperti layar isian CEISA 4.0: deret tab Header · Entitas ·
   Dokumen · Pengangkut · Kemasan & Peti Kemas · Transaksi · Barang ·
   Pungutan (PIB) · Pernyataan, tiap tab berisi bagian-bagian berjudul.
   SEMUA ISIAN OPSIONAL -- dipakai Cek PIB/PEB untuk memeriksa draft.

   Satu sumber untuk tiap isian: yang sudah punya kotak di tab lain (No.
   Aju, invoice, B/L, sarana angkut, pelabuhan, incoterm, freight,
   asuransi, NDPBM, kemasan, kontainer, barang & fasilitasnya) tampil
   HANYA-BACA dengan tombol Ubah menuju kotak asalnya; yang dihitung
   darinya (harga barang, CIF/FOB, nilai pabean, berat, pungutan)
   tampil sebagai hasil hitung (dpNilaiHitung, core/data-pabean.js).
   Selebihnya tersimpan di draftDataPabean (s.dataPabean) -- No. & Tgl
   Packing List diisi di tab Dokumen & Umum -- dan per barang di
   draftItems[i].dataPabean lewat tombol pena tab Barang
   (data-pabean-barang.js).

   Nilai bawaan (dpBawaan) diisikan saat form dibuka dan mengikuti moda,
   Shipper/Buyer & pihak sumber pasangannya (Pemilik Barang = Importir /
   Eksportir, Penjual = Pengirim, Penerima = Pembeli) selama isiannya
   belum diubah sendiri.
================================================================== */

let draftDataPabean = {};
// Nilai bawaan yang terakhir diisikan: isian yang masih sama dengannya ikut berganti
let dpbBawaanKini = null;
let dpbTabAktif = "header";

function dataPabeanForm() {
  return rapikanDataPabean(draftDataPabean);
}

/* ---------------- nilai bawaan ---------------- */

const dpbKonteksBawaan = () => ({ mode: activeMode, transport: $("#fTransport").value, party: $("#fParty").value, pihak: draftDataPabean.pihak });

/* awal: form baru dibuka -- isian kosong saja yang diisi. Diulang
   sampai bawaannya tetap: bawaan bersambung (Shipper -> Pengirim ->
   Penjual -> Afiliasi pemilik barang), tiap putaran membaca isian yang
   baru saja ikut berganti. */
function segarkanBawaanDataPabean(awal) {
  for (let i = 0; i < 4; i++) {
    const baru = dpBawaan(dpbKonteksBawaan());
    const tetap = i > 0 && JSON.stringify(baru) === JSON.stringify(dpbBawaanKini);
    draftDataPabean = terapkanBawaan(draftDataPabean, baru, awal && i === 0 ? null : dpbBawaanKini);
    dpbBawaanKini = baru;
    if (tetap) break;
  }
}

// Form jadwal dibuka (renderFormPage): bawaan diisikan, tab Header lebih dulu
function bukaDataPabeanForm() {
  dpbTabAktif = "header";
  dpbBawaanKini = null;
  segarkanBawaanDataPabean(true);
  isiPackingListForm();
  renderDataPabeanForm();
}

/* ---------------- kotak isian ---------------- */

const dpbEsc = (s) => escapeHtml(s == null ? "" : String(s));
// Daftar yang lebih panjang dari ini: kotak ketik + saran (bisa dicari menurut kode atau nama)
const DPB_PILIHAN_PENDEK = 25;

function dpbDaftar(pilihan) {
  if (pilihan === "negara") return [...NEGARA_PER_KODE.values()].map((n) => [n[0], String(n[2] || n[1]).toUpperCase()]);
  return DP_PILIHAN[pilihan] || [];
}
// <datalist> sebuah daftar, dibuat sekali di dokumen
function dpbDatalist(id, opsi) {
  if (!document.getElementById(id)) {
    const dl = document.createElement("datalist");
    dl.id = id;
    dl.innerHTML = opsi().map((v) => `<option value="${dpbEsc(v)}"></option>`).join("");
    document.body.appendChild(dl);
  }
  return id;
}
const dpbTeksPilihan = (k, n) => (k === n ? n : `${k} - ${n}`);
const dpbDaftarPilihan = (pilihan) => dpbDatalist(`dpbDaftar-${pilihan}`, () => dpbDaftar(pilihan).map(([k, n]) => dpbTeksPilihan(k, n)));
const dpbDaftarSaran = (saran) => dpbDatalist(`dpbSaran-${saran}`, () => (DP_SARAN[saran] ? DP_SARAN[saran]() : []));
// Angka tersimpan -> isi kotak; 0 tetap "0" (tarif 0% bukan kosong)
const dpbAngkaKotak = (v) => (!dpAda(v) ? "" : Number(v) === 0 ? "0" : formatNumberValue(v));

/* Satu isian tersimpan. o.alamat = atribut pengenalnya: data-dpb="k",
   data-dpb-pihak="p:k", atau data-dpbb="k" (editor barang). */
function dpbKotakHtml(o) {
  const v = o.nilai == null ? "" : String(o.nilai);
  const id = o.id;
  let kotak;
  if (o.jenis === "pilihan") {
    const daftar = dpbDaftar(o.pilihan);
    const tampil = dpNamaPilihan(o.pilihan, v);
    if (daftar.length > DPB_PILIHAN_PENDEK || o.pilihan === "negara") {
      kotak = `<input type="text" class="form-control" id="${id}" ${o.alamat} data-dpb-pilihan="${o.pilihan}" list="${dpbDaftarPilihan(o.pilihan)}"
        value="${dpbEsc(tampil)}" title="${dpbEsc(tampil)}" autocomplete="off" spellcheck="false" placeholder="${dpbEsc(tt("Ketik kode atau nama", "Type a code or name"))}">`;
    } else {
      const opsi = [["", "—"]].concat(daftar.map(([k, n]) => [k, dpbTeksPilihan(k, n)]));
      if (v && !daftar.some(([k]) => k === v)) opsi.push([v, v]);
      kotak = `<select class="form-select" id="${id}" ${o.alamat} data-dpb-pilihan="${o.pilihan}" title="${dpbEsc(tampil)}">${opsi
        .map(([k, n]) => `<option value="${dpbEsc(k)}"${k === v ? " selected" : ""}>${dpbEsc(n)}</option>`).join("")}</select>`;
    }
  } else if (o.jenis === "panjang") {
    kotak = `<textarea class="form-control" id="${id}" rows="2" ${o.alamat}>${dpbEsc(v)}</textarea>`;
  } else if (o.jenis === "tanggal") {
    kotak = `<input type="date" class="form-control" id="${id}" value="${dpbEsc(v)}" ${o.alamat}>`;
  } else if (o.jenis === "angka") {
    kotak = `<input type="text" inputmode="decimal" class="form-control" id="${id}" value="${dpbEsc(dpbAngkaKotak(o.nilai))}" ${o.alamat} data-dpb-jenis="angka" data-num${o.placeholder ? ` placeholder="${dpbEsc(o.placeholder)}"` : ""}>`;
  } else {
    kotak = `<input type="text" class="form-control" id="${id}" value="${dpbEsc(v)}" ${o.alamat}${o.saran ? ` list="${dpbDaftarSaran(o.saran)}" autocomplete="off"` : ""}>`;
  }
  return `<div${o.lebar ? ` class="${o.lebar}"` : ""}><label class="form-label" for="${id}">${dpbEsc(o.label)}</label>${kotak}</div>`;
}

function dpbRapikanPilihan(el) {
  const tampil = dpNamaPilihan(el.dataset.dpbPilihan, dpbBacaKotak(el));
  if (el.tagName === "INPUT" && tampil && el.value !== tampil) el.value = tampil;
  el.title = el.tagName === "SELECT" ? (el.selectedOptions[0] || {}).text || "" : el.value;
}

// Isi kotak -> nilai tersimpan (angka kosong = tidak diisi, pilihan = kodenya)
function dpbBacaKotak(el) {
  if (el.dataset.dpbJenis === "angka") return String(el.value || "").trim() === "" ? null : parseInputNumber(el.value);
  if (el.dataset.dpbPilihan && el.tagName !== "SELECT") return dpKodePilihan(el.dataset.dpbPilihan, el.value);
  return el.value;
}

const dpbNamaTab = (tab) => ({ umum: tt("Dokumen & Umum", "Documents & General"), barang: tt("Daftar Barang", "Item List"), pabean: tt("Kepabeanan & Biaya", "Customs & Charges") })[tab] || "";

/* Nilai dari tab lain (o.ke = kotak asalnya, o.tab = tabnya) atau hasil
   hitung (o.hitung): hanya-baca, tidak disinggahi Enter. */
function dpbBacaHtml(o) {
  const tombol = o.ke
    ? `<button type="button" class="dpb-ke" data-dpb-ke="${dpbEsc(o.ke)}" data-dpb-ke-tab="${o.tab}" title="${dpbEsc(tt(`Diisi di tab ${dpbNamaTab(o.tab)}`, `Filled in on the ${dpbNamaTab(o.tab)} tab`))}">${tt("Ubah", "Edit")}</button>`
    : o.hitung ? `<span class="dpb-chip">${tt("otomatis", "auto")}</span>` : "";
  // Blok, bukan <input>: nilai panjang (uraian, daftar kontainer) membungkus, tidak terpotong
  const kosong = !String(o.nilai || "").trim();
  return `<div${o.lebar ? ` class="${o.lebar}"` : ""}><div class="form-label dpb-label-baca"><span id="${o.id}-l">${dpbEsc(o.label)}</span>${tombol}</div>
    <div class="form-control dpb-baca${o.kanan ? " dpb-angka" : ""}${kosong ? " is-kosong" : ""}" id="${o.id}" role="textbox" aria-readonly="true" aria-labelledby="${o.id}-l">${kosong ? "—" : dpbEsc(o.nilai)}</div></div>`;
}

let DPB_DEF = null;
function dpbDef(k) {
  if (!DPB_DEF) DPB_DEF = new Map(DP_GRUP.flatMap((g) => g.isian).map((f) => [f.k, f]));
  return DPB_DEF.get(k);
}
// Isian tersimpan menurut kuncinya (kosong bila bukan isian buku ini)
function dpbIsian(k, lebar) {
  const f = dpbDef(k);
  if (!f || !dpBerlaku(f, activeMode)) return "";
  return dpbKotakHtml({ id: `dpb-${k}`, label: dpLabel(f.label), nilai: draftDataPabean[k], jenis: f.jenis, pilihan: dpPilihanIsian(f, activeMode), saran: f.saran, alamat: `data-dpb="${k}"`, lebar });
}

/* Isian + tanggalnya sepasang setengah baris (.fl-bertanggal, components.css):
   isiannya mengisi sisa sel, kotak tanggalnya selebar tanggalnya -- bukan
   dua sel seperempat baris dengan celah kosong di samping kotak tanggal.
   Salah satunya bukan isian buku ini (dpbIsian kosong): tanpa pasangan. */
const dpbPasangTanggal = (isian, tanggal) => (isian && tanggal ? `<div class="s6 fl-bertanggal">${isian}${tanggal}</div>` : isian + tanggal);

function dpbBagian(judul, isi, opsi) {
  if (!isi) return "";
  const o = opsi || {};
  return `<section class="dpb-bagian"><h3 class="dpb-bagian-judul">${dpbEsc(judul)}</h3>${o.catatan ? `<p class="dpb-catatan">${o.catatan}</p>` : ""}${
    o.mentah ? isi : `<div class="fgrid">${isi}</div>`}</section>`;
}

/* ---------------- isi form lain (hanya-baca) ---------------- */

// Jadwal dalam bentuk tersimpan dari isian form -- untuk dpNilaiHitung & dpDokumenJadwal
function dpbJadwalForm() {
  return {
    mode: activeMode, transport: $("#fTransport").value, party: $("#fParty").value.trim(), noAju: $("#fNoAju").value.trim(),
    invoice: $("#fInvoice").value.trim(), invoiceDate: $("#fInvoiceDate").value,
    masterBL: $("#fMasterBL").value.trim(), masterBLDate: $("#fMasterBLDate").value,
    houseBL: $("#fHouseBL").value.trim(), houseBLDate: $("#fHouseBLDate").value,
    incoterm: $("#fIncoterm").value, freight: parseInputNumber($("#fFreight").value), insurance: parseInputNumber($("#fInsurance").value),
    ndpbm: parseInputNumber($("#fNdpbm").value),
    // Tarif BM per barang (item.dataPabean.tarifBm); barang tanpa tarif = bawaan 5%
    tarif: null,
    dokPelengkap: typeof dokPelengkapForm === "function" ? dokPelengkapForm() : null,
    dataPabean: draftDataPabean, items: draftItems,
    // BM / PPN / PPh yang diketik sendiri di Kepabeanan & Biaya = kolom Dibayar (modal-fields.js)
    pungutanManual: typeof pungutanManualForm === "function" ? pungutanManualForm() : null,
  };
}

const dpbKotakIsi = (sel) => ($(sel) ? String($(sel).value || "").trim() : "");
const dpbRp = (n) => (n ? formatNumberValue(Math.round(n * 100) / 100) : "");
const dpbUsd = (n) => (n ? formatNumberValue(Math.round(n * 100) / 100) : "");
const dpbKg = (n) => (n ? formatNumberValue(Math.round(n * 10000) / 10000) : "");
const dpbBarangAda = (it) => !!String((it && it.namaBarang) || "").trim();

/* ---------------- isi tiap tab ---------------- */

function dpbTabHeader(c) {
  const aju = dpbKotakIsi("#fNoAju");
  const tglAju = typeof tanggalDariAju === "function" ? tanggalDariAju(aju) : "";
  const pengajuan = dpbBacaHtml({ id: "dpbr-aju", label: tt("Nomor Pengajuan", "Submission No."), nilai: aju, ke: "#fNoAju", tab: "umum", lebar: "s6" })
    + dpbBacaHtml({ id: "dpbr-tglaju", label: tt("Tanggal Pengajuan", "Submission Date"), nilai: tglAju ? fmtDate(tglAju) : "", hitung: true });
  if (c.pib) {
    return dpbBagian(tt("Pengajuan", "Submission"), pengajuan)
      + dpbBagian(tt("Kantor Pabean", "Customs Office"), dpbIsian("kodeKantor", "s6"))
      + dpbBagian(tt("Keterangan Lain", "Other Details"), dpbIsian("jenisPib") + dpbIsian("jenisImpor") + dpbIsian("caraBayar", "s6"));
  }
  return dpbBagian(tt("Pengajuan", "Submission"), pengajuan)
    + dpbBagian(tt("Kantor Pabean", "Customs Office"), dpbIsian("kantorMuat", "s6") + dpbIsian("pelabuhanEkspor", "s6") + dpbIsian("kantorEkspor", "s6") + dpbIsian("kantorDaftar", "s6"))
    + dpbBagian(tt("Keterangan Lain", "Other Details"), dpbIsian("jenisEkspor", "s6") + dpbIsian("kategoriEkspor", "s6") + dpbIsian("caraDagang") + dpbIsian("caraBayar", "s6")
      + dpbIsian("keteranganBayar") + dpbIsian("komoditas") + dpbIsian("barangKiriman", "s6") + dpbIsian("curah"));
}

function dpbPihakIsian(p) {
  const isi = (draftDataPabean.pihak || {})[p.k] || {};
  const dok = dpDok(activeMode);
  const LEBAR = { nama: "s6", alamat: "s12", kategori: "s6" };
  // Negara tepat di samping nama, sebelum alamat
  const urut = p.isian.filter((k) => k !== "negara");
  if (p.isian.includes("negara")) urut.splice(urut.indexOf("nama") + 1, 0, "negara");
  return urut.filter((k) => !DP_PIHAK_ISIAN_DOK[k] || DP_PIHAK_ISIAN_DOK[k] === dok).map((k) => {
    const pil = DP_PIHAK_PILIHAN[k];
    return dpbKotakHtml({
      id: `dpb-${p.k}-${k}`, label: dpLabel(DP_PIHAK_LABEL[k]), nilai: isi[k], jenis: k === "alamat" ? "panjang" : pil ? "pilihan" : "teks",
      pilihan: pil, alamat: `data-dpb-pihak="${p.k}:${k}"`, lebar: LEBAR[k] || "",
    });
  }).join("");
}
const dpbTabEntitas = () => DP_PIHAK.filter((p) => dpBerlaku(p, activeMode)).map((p) => dpbBagian(dpLabel(p.label), dpbPihakIsian(p))).join("");

function dpbTabDokumen(c) {
  const daftar = dpDokumenJadwal(c.jadwal);
  // Nomor & tanggal tidak dibungkus ("29-10-" / "2026"): tabelnya yang digeser (.dpb-tabel-gulir)
  const baris = daftar.map((d, i) => `<tr><td class="dpb-no">${i + 1}</td><td>${dpbEsc(d.kode || "—")}</td><td>${dpbEsc(d.nama)}</td>
    <td class="dpb-utuh">${dpbEsc(d.nomor)}</td><td class="dpb-utuh">${d.tanggal ? dpbEsc(fmtDate(d.tanggal)) : "—"}</td><td class="dpb-asal">${dpbEsc(dpbNamaTab(d.asal))}</td></tr>`).join("");
  const tabel = daftar.length
    ? `<div class="dpb-tabel-gulir"><table class="dpb-tabel"><thead><tr><th scope="col">${tt("No.", "No.")}</th><th scope="col">${tt("Kode", "Code")}</th>
        <th scope="col">${tt("Jenis Dokumen", "Document Type")}</th><th scope="col">${tt("Nomor", "Number")}</th><th scope="col">${tt("Tanggal", "Date")}</th>
        <th scope="col">${tt("Diisi di", "Filled in on")}</th></tr></thead><tbody>${baris}</tbody></table></div>`
    : `<p class="dpb-kosong">${tt("Belum ada dokumen di jadwal ini.", "This schedule has no documents yet.")}</p>`;
  return dpbBagian(tt("Dokumen", "Documents"), tabel, {
    mentah: true,
    catatan: tt("Dari isian jadwal: Invoice, Packing List & B/L-AWB di tab Dokumen &amp; Umum, PI / LS / Polis di tab Kepabeanan &amp; Biaya, SKB / Masterlist / COO dari fasilitas tiap barang di tab Daftar Barang.",
      "From the schedule's fields: Invoice, Packing List & B/L-AWB on the Documents &amp; General tab, PI / LS / Policy on the Customs &amp; Charges tab, SKB / Masterlist / COO from each item's facilities on the Item List tab."),
  });
}

function dpbTabPengangkut(c) {
  const laut = $("#fTransport").value !== "udara";
  const cara = laut ? "1 - LAUT" : "4 - UDARA";
  const sarana = dpbBacaHtml({ id: "dpbr-cara", label: tt("Cara Pengangkutan", "Mode of Transport"), nilai: cara, ke: "#fTransport", tab: "umum" })
    + dpbBacaHtml({ id: "dpbr-sarana", label: tt("Nama Sarana Pengangkut", "Means of Transport"), nilai: dpbKotakIsi("#fVessel"), ke: "#fVessel", tab: "umum" })
    + dpbBacaHtml({ id: "dpbr-voy", label: tt("No. Voy / Flight", "Voyage / Flight No."), nilai: dpbKotakIsi("#fVoyage"), ke: "#fVoyage", tab: "umum" });
  const muat = dpbBacaHtml({ id: "dpbr-muat", label: c.pib ? tt("Pelabuhan Muat", "Port of Loading") : tt("Pelabuhan Muat Asal", "Port of Origin"), nilai: dpbKotakIsi("#fOrigin"), ke: "#fOrigin", tab: "umum" });
  const tujuan = dpbBacaHtml({ id: "dpbr-tujuan", label: tt("Pelabuhan Tujuan", "Port of Destination"), nilai: dpbKotakIsi("#fDestination"), ke: "#fDestination", tab: "umum" });
  const bc11 = dpbPasangTanggal(dpbIsian("bc11Nomor"), dpbIsian("bc11Tanggal")) + dpbIsian("bc11Pos") + dpbIsian("bc11SubPos");
  if (c.pib) {
    const eta = dpbKotakIsi("#fEta");
    return dpbBagian(tt("BC 1.1 (Tutup PU)", "BC 1.1 (Manifest)"), bc11)
      + dpbBagian(tt("Pengangkutan", "Transport"), sarana + dpbIsian("bendera"))
      + dpbBagian(tt("Pelabuhan & Tempat Penimbunan", "Ports & Storage"), muat + dpbIsian("pelabuhanTransit") + tujuan + dpbIsian("tempatTimbun")
        + dpbBacaHtml({ id: "dpbr-eta", label: tt("Tanggal Tiba", "Arrival Date"), nilai: eta ? fmtDate(eta) : "", ke: "#fEta", tab: "umum" }));
  }
  const etd = dpbKotakIsi("#fEtd");
  return dpbBagian(tt("Pengangkutan", "Transport"), dpbIsian("jenisPengangkutan", "s6") + sarana + dpbIsian("bendera")
      + dpbBacaHtml({ id: "dpbr-etd", label: tt("Tanggal Perkiraan Ekspor", "Estimated Export Date"), nilai: etd ? fmtDate(etd) : "", ke: "#fEtd", tab: "umum" }))
    + dpbBagian(tt("Pelabuhan & Tempat Muat", "Ports & Loading Place"), muat + tujuan + dpbIsian("tempatTimbun"))
    + dpbBagian(tt("BC 1.1", "BC 1.1"), bc11)
    + dpbBagian(tt("Pemeriksaan", "Inspection"), dpbIsian("lokasiPeriksa", "s6") + dpbIsian("tanggalPeriksa") + dpbIsian("kantorPeriksa", "s6"));
}

function dpbTabKemasan() {
  const laut = $("#fTransport").value !== "udara";
  const kemasan = dpbBacaHtml({ id: "dpbr-kemasan", label: tt("Jumlah & Jenis Kemasan", "Package Count & Type"), nilai: dpbKotakIsi("#fPackage"), ke: "#fPackage", tab: "barang", lebar: "s6" })
    + dpbIsian("merekKemasan", "s6");
  const peti = laut
    ? dpbBacaHtml({ id: "dpbr-muatan", label: tt("Jenis Muatan", "Load Type"), nilai: dpbKotakIsi("#fMuatan"), ke: "#fMuatan", tab: "umum" })
      + dpbBacaHtml({ id: "dpbr-kontainer", label: tt("Nomor Peti Kemas", "Container No."), nilai: dpbKotakIsi("#fContainer"), ke: "#fContainer", tab: "umum", lebar: "s9" })
    : `<p class="dpb-kosong s12">${tt("Kiriman udara tanpa peti kemas.", "Air shipments carry no containers.")}</p>`;
  return dpbBagian(tt("Kemasan", "Packages"), kemasan) + dpbBagian(tt("Peti Kemas", "Containers"), peti);
}

function dpbTabTransaksi(c) {
  const n = c.nilai;
  const baca = (id, label, nilai, ke, lebar) => dpbBacaHtml({ id, label, nilai, ke, tab: "pabean", lebar, kanan: true });
  const hitung = (id, label, nilai, lebar) => dpbBacaHtml({ id, label, nilai, hitung: true, lebar, kanan: true });
  const ndpbm = baca("dpbr-ndpbm", "NDPBM", dpbKotakIsi("#fNdpbm"), "#fNdpbm");
  const incoterm = dpbBacaHtml({ id: "dpbr-incoterm", label: tt("Cara Penyerahan (Incoterm)", "Delivery Terms (Incoterm)"), nilai: dpbKotakIsi("#fIncoterm"), ke: "#fIncoterm", tab: "pabean" });
  const freight = baca("dpbr-freight", "Freight", dpbKotakIsi("#fFreight"), "#fFreight");
  const asuransi = baca("dpbr-asuransi", tt("Nilai Asuransi", "Insurance Value"), dpbKotakIsi("#fInsurance"), "#fInsurance");
  const berat = hitung("dpbr-bruto", tt("Berat Kotor (kg)", "Gross Weight (kg)"), dpbKg(n.bruto)) + hitung("dpbr-netto", tt("Berat Bersih (kg)", "Net Weight (kg)"), dpbKg(n.netto));
  const catatanBerat = tt("Jumlah berat tiap barang di tab Daftar Barang.", "Sum of each item's weight on the Item List tab.");
  if (c.pib) {
    return dpbBagian(tt("Harga", "Price"), dpbIsian("valuta") + ndpbm + incoterm + hitung("dpbr-harga", tt("Harga Barang", "Goods Price"), dpbUsd(n.harga))
        + freight + dpbIsian("kodeAsuransi") + asuransi + hitung("dpbr-cif", tt("Nilai CIF", "CIF Value"), dpbUsd(n.cif))
        + hitung("dpbr-pabean", tt("Nilai Pabean (Rp)", "Customs Value (IDR)"), dpbRp(n.nilaiPabean), "s6"),
      { catatan: tt("Harga Barang = jumlah Amount barang; Nilai CIF = Harga Barang + Freight + Asuransi; Nilai Pabean = CIF × NDPBM.", "Goods Price = sum of item Amounts; CIF = Goods Price + Freight + Insurance; Customs Value = CIF × NDPBM.") })
      + dpbBagian(tt("Transaksi Perdagangan", "Trade Transaction"), dpbIsian("transaksiJenis", "s6") + dpbPasangTanggal(dpbIsian("transaksiNomor"), dpbIsian("transaksiTanggal")) + dpbIsian("ikb", "s6"))
      + dpbBagian(tt("Berat", "Weight"), berat, { catatan: catatanBerat });
  }
  return dpbBagian(tt("Harga", "Price"), dpbIsian("valuta") + ndpbm + incoterm + hitung("dpbr-harga", tt("Harga Penyerahan", "Delivery Price"), dpbUsd(n.harga))
      + freight + dpbIsian("kodeAsuransi") + asuransi + hitung("dpbr-fob", tt("Nilai Ekspor (FOB)", "Export Value (FOB)"), dpbUsd(n.fob)) + dpbIsian("nilaiMaklon"),
    { catatan: tt("Harga Penyerahan = jumlah Amount barang; FOB = Harga Penyerahan dikurangi Freight (CFR/CPT) atau Freight + Asuransi (CIF/CIP).", "Delivery Price = sum of item Amounts; FOB = Delivery Price less Freight (CFR/CPT) or Freight + Insurance (CIF/CIP).") })
    + dpbBagian(tt("Bank Devisa & Penerimaan Negara", "Proceeds Bank & State Revenue"), dpbIsian("bankDevisa", "s6") + dpbIsian("beaKeluar") + dpbIsian("pph22") + dpbIsian("danaPerkebunan", "s6"))
    + dpbBagian(tt("Berat", "Weight"), berat, { catatan: catatanBerat });
}

// Nama fasilitas barang seperti di dokumen pabean: "SKB PPh", "Masterlist", "COO"
const DPB_NAMA_FASILITAS = { BM: "SKB BM", PPN: "SKB PPN", PPH: "SKB PPh" };
const dpbNamaFasilitas = (sk) => DPB_NAMA_FASILITAS[sk.jenis] || (typeof skbEntryLabel === "function" ? skbEntryLabel(sk) : sk.jenis);

// Ringkasan fasilitas barang di jadwal: "Masterlist · SKB PPN · PI #5"
function dpbFasilitasRingkas(it) {
  const jenis = [...new Set((it.skb || []).filter((sk) => sk && sk.jenis).map(dpbNamaFasilitas))];
  if (activeMode !== "export" && String(it.piNomor || "").trim()) jenis.push(it.piNoItem ? `PI #${String(it.piNoItem).trim()}` : "PI");
  return jenis.join(" · ");
}

function dpbTabBarang(c) {
  const barang = draftItems.map((it, i) => ({ it, i })).filter(({ it }) => dpbBarangAda(it));
  if (!barang.length) return dpbBagian(tt("Barang", "Items"), `<p class="dpb-kosong">${tt("Belum ada barang di tab Daftar Barang.", "No items on the Item List tab yet.")}</p>`, { mentah: true });
  const tarifJadwal = c.jadwal.tarif == null ? TARIF_BM_BAWAAN : c.jadwal.tarif;
  const persen = (v, cadangan) => (dpAda(v) ? `${formatNumberValue(v) || "0"}%` : `<span class="dpb-redup" title="${dpbEsc(c.jadwal.tarif == null ? tt("Tarif bawaan", "Default rate") : tt("Tarif jadwal", "Schedule rate"))}">${formatNumberValue(cadangan) || "0"}%</span>`);
  const kepala = c.pib
    ? [tt("Seri", "Serial"), tt("Pos Tarif / HS", "HS Code"), tt("Uraian Barang", "Description"), tt("Jumlah Satuan", "Quantity"), tt("Nilai (USD)", "Value (USD)"), tt("Fasilitas", "Facility"), "BM", "PPh", ""]
    : [tt("Seri", "Serial"), tt("Pos Tarif / HS", "HS Code"), tt("Uraian Barang", "Description"), tt("Jumlah Satuan", "Quantity"), tt("Nilai (USD)", "Value (USD)"), tt("Jenis Ekspor", "Export Type"), tt("Daerah Asal", "Region of Origin"), ""];
  const baris = barang.map(({ it, i }) => {
    const dp = rapikanDataPabeanBarang(it.dataPabean);
    const nilai = parseLooseNumber(it.qty) * parseLooseNumber(it.harga);
    const jumlah = [formatNumberValue(it.qty) || "0", String(it.satuan || "").trim()].filter(Boolean).join(" ");
    const sel = c.pib
      ? `<td>${dpbEsc(dpbFasilitasRingkas(it) || "—")}</td><td>${persen(dp.tarifBm, tarifJadwal)}</td><td>${persen(dp.tarifPph, TARIF_PPH_IMPOR)}</td>`
      : `<td>${dpbEsc(dpNamaPilihan("jenisEkspor", dp.jenisEkspor) || "—")}</td><td>${dpbEsc(dpNamaPilihan("daerah", dp.daerahAsal) || "—")}</td>`;
    return `<tr><td class="dpb-no">${i + 1}</td><td>${dpbEsc(it.hsCode || "—")}</td><td class="dpb-uraian">${dpbEsc(itemDisplayName(it))}</td>
      <td>${dpbEsc(jumlah)}</td><td>${dpbUsd(nilai) || "0"}</td>${sel}
      <td class="dpb-aksi"><button type="button" class="dpb-pena" data-dpb-pena="${i}" title="${dpbEsc(tt(`Ubah data barang seri ${i + 1}`, `Edit item ${i + 1} data`))}"
        aria-label="${dpbEsc(tt(`Ubah data barang seri ${i + 1}`, `Edit item ${i + 1} data`))}"><i class="bi bi-pencil" aria-hidden="true"></i></button></td></tr>`;
  }).join("");
  // Seluruh kolom rata tengah (.dpb-tabel-barang, css/form.css) -- tanpa kelas rata kanan per kolom
  const kepalaHtml = kepala.map((k) => `<th scope="col">${k}</th>`).join("");
  return dpbBagian(tt("Barang", "Items"), `<div class="dpb-tabel-gulir"><table class="dpb-tabel dpb-tabel-barang"><thead><tr>${kepalaHtml}</tr></thead><tbody>${baris}</tbody></table></div>`, {
    mentah: true,
    catatan: c.pib
      ? tt("Uraian, HS, jumlah, harga & fasilitas diisi di tab Daftar Barang. Tombol pena: tarif BM & PPh, metode penentuan nilai, perbedaan harga & voluntary declaration per barang. Tarif kelabu = Tarif (%) jadwal / PPh 2,5%.",
        "Description, HS, quantity, price & facilities are filled in on the Item List tab. Pencil button: BM & PPh rates, valuation method, price difference & voluntary declaration per item. Grey rates = the schedule's Rate (%) / 2.5% PPh.")
      : tt("Uraian, HS, jumlah & harga diisi di tab Daftar Barang. Tombol pena: jenis ekspor, daerah asal, HE & tarif bea keluar per barang.",
        "Description, HS, quantity & price are filled in on the Item List tab. Pencil button: export type, region of origin, HE & export duty rate per item."),
  });
}

function dpbTabelPungutanHtml(tabel) {
  const kolom = DP_PUNGUTAN_KOLOM.map((k) => `<th scope="col" class="dpb-angka">${dpbEsc(dpLabel(k))}</th>`).join("");
  const baris = DP_PUNGUTAN_JENIS.map((j) => {
    const v = tabel[j] || [0, 0, 0, 0, 0, 0];
    return `<tr${j === "TOTAL" ? ' class="dpb-total"' : ""}><th scope="row">${dpbEsc(j)}</th>${v.map((x) => `<td class="dpb-angka">${x ? formatNumberValue(x) : "0"}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="dpb-tabel-gulir"><table class="dpb-tabel dpb-tabel-pungutan"><thead><tr><th scope="col">${tt("Jenis Pungutan", "Levy")}</th>${kolom}</tr></thead><tbody>${baris}</tbody></table></div>`;
}

function dpbTabPungutan(c) {
  return dpbBagian(tt("Pungutan", "Duties & Taxes"), dpbTabelPungutanHtml(c.nilai.pungutan.tabel), {
    mentah: true,
    catatan: tt("Dihitung otomatis per seri barang: tarif BM & PPh tiap barang (tab Barang) atau Tarif (%) jadwal, PPN 12% × DPP 11/12. Fasilitas barang di Daftar Barang (SKB BM / Masterlist, SKB PPN, SKB PPh) memindahkan pungutannya ke kolom Dibebaskan. Kolom Dibayar = Bea Masuk, PPN & PPH di tab Kepabeanan &amp; Biaya (yang diketik sendiri di sana tampil apa adanya); NDPBM, Freight & Asuransi juga dari tab itu.",
      "Calculated per item: each item's BM & PPh rate (Items tab) or the schedule's Rate (%), PPN 12% × 11/12 base. Item facilities on the Item List (SKB BM / Masterlist, SKB PPN, SKB PPh) move the levy to the Exempted column. The Paid column = Import Duty, PPN & PPH on the Customs &amp; Charges tab (values typed there are shown as typed); NDPBM, Freight & Insurance also come from that tab."),
  }) + dpbBagian(tt("Pembayaran & Jaminan", "Payment & Guarantee"), dpbIsian("pembayaran", "s6") + dpbIsian("jaminanJenis", "s6") + dpbPasangTanggal(dpbIsian("jaminanNomor"), dpbIsian("jaminanTanggal")));
}

const dpbTabPernyataan = () => dpbBagian(tt("Pernyataan", "Declaration"), dpbPasangTanggal(dpbIsian("kotaPernyataan"), dpbIsian("tanggalPernyataan")) + dpbIsian("namaPernyataan") + dpbIsian("jabatanPernyataan"));

function dpbTabDaftar(mode) {
  return [
    ["header", tt("Header", "Header"), dpbTabHeader],
    ["entitas", tt("Entitas", "Parties"), dpbTabEntitas],
    ["dokumen", tt("Dokumen", "Documents"), dpbTabDokumen],
    ["pengangkut", tt("Pengangkut", "Transport"), dpbTabPengangkut],
    ["kemasan", tt("Kemasan & Peti Kemas", "Packages & Containers"), dpbTabKemasan],
    ["transaksi", tt("Transaksi", "Transaction"), dpbTabTransaksi],
    ["barang", tt("Barang", "Items"), dpbTabBarang],
    ...(mode === "export" ? [] : [["pungutan", tt("Pungutan", "Duties & Taxes"), dpbTabPungutan]]),
    ["pernyataan", tt("Pernyataan", "Declaration"), dpbTabPernyataan],
  ];
}

/* ---------------- gambar ---------------- */

function renderDataPabeanForm() {
  const wadah = $("#dataPabeanIsi");
  const deret = $("#dpbTabs");
  if (!wadah || !deret) return;
  const nama = activeMode === "export" ? "Data PEB" : "Data PIB";
  if ($("#tabDataPabeanLabel")) $("#tabDataPabeanLabel").textContent = tt(nama, activeMode === "export" ? "PEB Data" : "PIB Data");
  if ($("#dpbJudul")) $("#dpbJudul").textContent = tt(nama, activeMode === "export" ? "PEB Data" : "PIB Data");
  draftDataPabean = rapikanDataPabean(draftDataPabean);
  const daftar = dpbTabDaftar(activeMode);
  if (!daftar.some(([k]) => k === dpbTabAktif)) dpbTabAktif = "header";
  deret.innerHTML = daftar.map(([k, label], i) => {
    const aktif = k === dpbTabAktif;
    return `<button type="button" class="dpb-tab${aktif ? " is-aktif" : ""}" role="tab" id="dpbTab-${k}" data-dpb-tab="${k}" aria-selected="${aktif}"
      aria-controls="dataPabeanIsi" tabindex="${aktif ? 0 : -1}"><span class="dpb-tab-no">${i + 1}</span>${dpbEsc(label)}</button>`;
  }).join("");
  const i = daftar.findIndex(([k]) => k === dpbTabAktif);
  const jadwal = dpbJadwalForm();
  const konteks = { pib: activeMode !== "export", jadwal, nilai: dpNilaiHitung(jadwal) };
  wadah.setAttribute("aria-labelledby", `dpbTab-${dpbTabAktif}`);
  wadah.innerHTML = daftar[i][2](konteks);
  // Enter di isian terakhir: tab berikutnya; di tab terakhir: tombol Simpan Jadwal
  if (i < daftar.length - 1) {
    wadah.dataset.enterKirim = `#dpbTabs [data-dpb-tab="${daftar[i + 1][0]}"]`;
    delete wadah.dataset.enterAkhir;
  } else {
    delete wadah.dataset.enterKirim;
    wadah.dataset.enterAkhir = "#btnSaveShipment";
  }
}

function pilihTabDataPabean(k, fokus) {
  dpbTabAktif = k;
  renderDataPabeanForm();
  if (fokus === "isian") fokusIsianPertama($("#dataPabeanIsi"), { pertama: true });
  else if (fokus === "tab") fokuskan($(`#dpbTabs [data-dpb-tab="${k}"]`));
}

/* ---------------- No. & Tgl Packing List (tab Dokumen & Umum) ---------------- */

function isiPackingListForm() {
  if ($("#fPackingList")) $("#fPackingList").value = draftDataPabean.packingListNomor || "";
  if ($("#fPackingListDate")) $("#fPackingListDate").value = draftDataPabean.packingListTanggal || "";
}
[["#fPackingList", "packingListNomor"], ["#fPackingListDate", "packingListTanggal"]].forEach(([sel, k]) => {
  const el = $(sel);
  if (el) el.addEventListener("input", () => (draftDataPabean[k] = el.value));
});

// Moda & Supplier/Customer menentukan nilai bawaan
["#fTransport", "#fParty"].forEach((sel) => {
  const el = $(sel);
  if (el) el.addEventListener("change", () => segarkanBawaanDataPabean(false));
});

/* ---------------- ketikan & tombol ---------------- */

// "pihak:isian" yang menentukan bawaan pihak lain
function dpbPihakPenentu(alamat) {
  const [p, k] = String(alamat || "").split(":");
  return !!p && (DP_PIHAK_PASANGAN[dpDok(activeMode)].some(([sumber]) => sumber === p) || (k === "nama" && (p === "pengirim" || p === "penjual")));
}
// Kotak pihak di layar = isi draft sesudah bawaan pengikutnya ikut berganti
function dpbSegarkanKotakPihak() {
  wadahDataPabean.querySelectorAll("[data-dpb-pihak]").forEach((el) => {
    const [p, k] = el.dataset.dpbPihak.split(":");
    const v = ((draftDataPabean.pihak || {})[p] || {})[k];
    const nilai = v == null ? "" : String(v);
    const pilihan = el.dataset.dpbPilihan;
    if (el.tagName === "SELECT") {
      if (nilai && ![...el.options].some((o) => o.value === nilai)) el.add(new Option(nilai, nilai));
      if (el.value !== nilai) el.value = nilai;
    } else {
      const tampil = pilihan ? dpNamaPilihan(pilihan, nilai) : nilai;
      if (el.value !== tampil) el.value = tampil;
    }
    if (pilihan) el.title = el.tagName === "SELECT" ? (el.selectedOptions[0] || {}).text || "" : el.value;
  });
}

const wadahDataPabean = $("#dataPabeanIsi");
if (wadahDataPabean) {
  wadahDataPabean.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.dpb) {
      draftDataPabean[el.dataset.dpb] = dpbBacaKotak(el);
    } else if (el.dataset.dpbPihak) {
      const [p, k] = el.dataset.dpbPihak.split(":");
      draftDataPabean.pihak = Object.assign({}, draftDataPabean.pihak);
      draftDataPabean.pihak[p] = Object.assign({}, draftDataPabean.pihak[p], { [k]: dpbBacaKotak(el) });
    }
  });
  wadahDataPabean.addEventListener("change", (e) => {
    const el = e.target;
    // Kotak bersaran: tampil "kode - NAMA" begitu kodenya dikenali; keterangan kotak = nama lengkapnya
    if (el.dataset.dpbPilihan) dpbRapikanPilihan(el);
    /* Isian pihak sumber DP_PIHAK_PASANGAN menjadi bawaan pengikutnya
       (Importir -> Pemilik Barang, Pengirim -> Penjual, Eksportir ->
       Pemilik Barang, Pembeli -> Penerima); nama pengirim / penjual impor
       menentukan Afiliasi pemilik barang (AFL / TAH). */
    if (dpbPihakPenentu(el.dataset.dpbPihak)) {
      segarkanBawaanDataPabean(false);
      dpbSegarkanKotakPihak();
    }
  });
  wadahDataPabean.addEventListener("click", (e) => {
    const ke = e.target.closest("[data-dpb-ke]");
    if (ke) {
      const tujuan = $(ke.dataset.dpbKe);
      pilihTabForm(ke.dataset.dpbKeTab);
      if (tujuan) {
        fokuskan(tujuan, { tanpaGulir: true });
        if (typeof tujuan.scrollIntoView === "function") tujuan.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    const pena = e.target.closest("[data-dpb-pena]");
    if (pena && typeof bukaEditorBarangDp === "function") bukaEditorBarangDp(Number(pena.dataset.dpbPena));
  });
}

const deretTabDataPabean = $("#dpbTabs");
if (deretTabDataPabean) {
  // Klik tetikus: pindah tab; Enter dari isian terakhir (klik tanpa tetikus): langsung ke isian pertamanya
  deretTabDataPabean.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dpb-tab]");
    if (b) pilihTabDataPabean(b.dataset.dpbTab, e.detail === 0 && document.activeElement !== b ? "isian" : "tab");
  });
  // Panah kiri/kanan, Home/End di antara tab (pola tablist)
  deretTabDataPabean.addEventListener("keydown", (e) => {
    const tombol = [...deretTabDataPabean.querySelectorAll("[data-dpb-tab]")];
    const i = tombol.indexOf(e.target);
    if (i < 0) return;
    const ke = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tombol.length - 1 }[e.key];
    if (ke == null) return;
    e.preventDefault();
    const b = tombol[(ke + tombol.length) % tombol.length];
    pilihTabDataPabean(b.dataset.dpbTab, "tab");
  });
}

/* Hasil baca dokumen pabean ke form: data jadwal & data per barang
   (barang dipasangkan menurut urutannya). Mengembalikan jumlah isian. */
function terapkanDataPabeanImpor(dataJadwal, dataBarang) {
  let n = 0;
  if (dataJadwal && adaDataPabean(dataJadwal)) {
    draftDataPabean = gabungDataPabean(draftDataPabean, dataJadwal);
    n += 1;
  }
  (dataBarang || []).forEach((dp, i) => {
    const it = draftItems[i];
    if (!it || !adaDataPabeanBarang(dp)) return;
    it.dataPabean = gabungDataPabeanBarang(it.dataPabean, dp);
    n += 1;
  });
  isiPackingListForm();
  renderDataPabeanForm();
  return n;
}
