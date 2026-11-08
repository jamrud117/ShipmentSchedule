"use strict";

/* ==================================================================
   EDITOR DATA PIB / PEB PER BARANG (tombol pena di tab Barang)

   Seperti tombol pena daftar barang CEISA 4.0: satu barang sekali
   tampil dengan seluruh isiannya, pindah barang dengan ‹ › (perubahan
   barang yang ditinggalkan ikut disimpan), Simpan / Tutup. Menutup
   dengan perubahan yang belum disimpan bertanya dulu di kaki dialog.

   Isian barang jadwal (uraian, HS, jumlah, harga, fasilitas) tampil
   hanya-baca -- diubah di Daftar Barang, yang juga menjadi patokan
   fasilitasnya. Yang diisi di sini item.dataPabean (DP_BARANG): PIB
   tarif BM & PPh, metode penentuan nilai, perbedaan harga & voluntary
   declaration; PEB jenis ekspor, daerah asal, HE & tarif bea keluar.
   Pungutan barang ini dihitung ulang setiap tarifnya diketik.
================================================================== */

const dpbbModalEl = document.getElementById("dpbBarangModal");
const dpbbModal = dpbbModalEl ? new bootstrap.Modal(dpbbModalEl, { backdrop: "static", keyboard: false }) : null;
let dpbbIdx = -1; // indeks draftItems yang sedang diubah
let dpbbIsi = {}; // isian editor, belum disimpan
let dpbbAwal = "{}"; // isian saat dimuat / terakhir disimpan
let dpbbTanyaTutup = false;

const dpbbDaftarIdx = () => [...draftItems.keys()].filter((i) => dpbBarangAda(draftItems[i]));
const dpbbBerubah = () => JSON.stringify(rapikanDataPabeanBarang(dpbbIsi)) !== dpbbAwal;

function bukaEditorBarangDp(idx) {
  if (!dpbbModal || !draftItems[idx]) return;
  dpbbMuat(idx);
  dpbbModal.show();
}

function dpbbMuat(idx) {
  dpbbIdx = idx;
  dpbbIsi = rapikanDataPabeanBarang(draftItems[idx].dataPabean);
  dpbbAwal = JSON.stringify(dpbbIsi);
  dpbbTanyaTutup = false;
  dpbbRender();
}

function dpbbSimpan() {
  const it = draftItems[dpbbIdx];
  if (!it) return;
  const d = rapikanDataPabeanBarang(dpbbIsi);
  // Tarif BM yang diganti di sini = isian sendiri (tarif-hs.js), sama dengan kolom Tarif BM di Daftar Barang
  if (String(d.tarifBm) !== String(rapikanDataPabeanBarang(it.dataPabean).tarifBm)) delete it._tarifOtomatis;
  if (Object.keys(d).length) it.dataPabean = d;
  else delete it.dataPabean;
  dpbbAwal = JSON.stringify(d);
  const baris = $(`#itemTableBody tr[data-idx="${dpbbIdx}"]:not(.item-fac-row)`);
  if (baris && typeof tulisKotakTarifBm === "function") tulisKotakTarifBm(baris, it);
  // Tarif BM / PPh barang ikut menentukan Bea & Pajak Impor di Kepabeanan & Biaya
  recalcCustoms();
}

function dpbbTutup() {
  dpbbTanyaTutup = false;
  dpbbModal.hide();
  // Tabel Barang & Pungutan memakai tarif yang baru
  if ($('.tab-pane[data-tabpane="dpb"]') && !$('.tab-pane[data-tabpane="dpb"]').classList.contains("d-none")) renderDataPabeanForm();
}

function dpbbCobaTutup() {
  if (dpbbBerubah() && !dpbbTanyaTutup) {
    dpbbTanyaTutup = true;
    dpbbKaki();
    fokuskan($("#dpbBarangSimpan"));
    return;
  }
  dpbbTutup();
}

// Pindah barang: perubahan barang ini disimpan dulu
function dpbbPindah(arah) {
  const daftar = dpbbDaftarIdx();
  const ke = daftar[daftar.indexOf(dpbbIdx) + arah];
  if (ke == null) return;
  dpbbSimpan();
  dpbbMuat(ke);
  fokusIsianPertama($("#dpbBarangIsi"), { pertama: true, tanpaGulir: true });
}

/* ---------------- isi dialog ---------------- */

const dpbbDef = (k) => DP_BARANG.find((f) => f.k === k);
function dpbbIsian(k, lebar, placeholder) {
  const f = dpbbDef(k);
  if (!f || !dpBerlaku(f, activeMode)) return "";
  return dpbKotakHtml({ id: `dpbb-${k}`, label: dpLabel(f.label), nilai: dpbbIsi[k], jenis: f.jenis, pilihan: f.pilihan, alamat: `data-dpbb="${k}"`, lebar, placeholder });
}
const dpbbBaca = (id, label, nilai, lebar, kanan) => dpbBacaHtml({ id, label, nilai, lebar, kanan });

// Barang ini dengan isian editor yang belum disimpan -> pungutan serinya
function dpbbPungutan() {
  const items = draftItems.map((it, i) => (i === dpbbIdx ? Object.assign({}, it, { dataPabean: rapikanDataPabeanBarang(dpbbIsi) }) : it));
  const jadwal = Object.assign(dpbJadwalForm(), { items });
  const n = dpNilaiHitung(jadwal);
  return { seri: n.pungutan ? n.pungutan.seri[dpbbIdx] : null, tarifJadwal: jadwal.tarif == null ? TARIF_BM_BAWAAN : jadwal.tarif };
}

function dpbbBarisTarifHtml() {
  const { seri, tarifJadwal } = dpbbPungutan();
  const it = draftItems[dpbbIdx];
  const fasilitas = (jenis) => {
    const sk = (it.skb || []).filter((x) => x && FASILITAS_PUNGUTAN[x.jenis] === jenis);
    return sk.length
      ? `${tt("Dibebaskan", "Exempted")} 100% · ${sk.map((x) => [dpbNamaFasilitas(x), String(x.nomor || "").trim()].filter(Boolean).join(" ")).join("; ")}`
      : "—";
  };
  const rp = (x) => formatNumberValue(Math.round(x || 0)) || "0";
  const baris = [
    ["BM", dpbbIsianTarif("tarifBm", tt(`${formatNumberValue(tarifJadwal) || "0"} (bawaan)`, `${formatNumberValue(tarifJadwal) || "0"} (default)`)), seri ? seri.bm : 0, seri && seri.bebas.BM],
    ["PPN", `<span class="dpbb-tetap">12% × DPP 11/12</span>`, seri ? seri.ppn : 0, seri && seri.bebas.PPN],
    ["PPh", dpbbIsianTarif("tarifPph", tt("2,5", "2.5")), seri ? seri.pph : 0, seri && seri.bebas.PPh],
  ];
  return `<div class="dpb-tabel-gulir"><table class="dpb-tabel dpbb-tarif"><thead><tr><th scope="col">${tt("Pungutan", "Levy")}</th><th scope="col">${tt("Tarif (%)", "Rate (%)")}</th>
    <th scope="col">${tt("Fasilitas", "Facility")}</th><th scope="col" class="dpb-angka">${tt("Dibayar (Rp)", "Paid (IDR)")}</th><th scope="col" class="dpb-angka">${tt("Dibebaskan (Rp)", "Exempted (IDR)")}</th></tr></thead>
    <tbody>${baris.map(([j, tarif, nilai, bebas]) => `<tr><th scope="row">${j}</th><td>${tarif}</td><td class="dpbb-fas">${dpbEsc(fasilitas(j))}</td>
      <td class="dpb-angka" id="dpbb-${j}-0">${bebas ? "0" : rp(nilai)}</td><td class="dpb-angka" id="dpbb-${j}-4">${bebas ? rp(nilai) : "0"}</td></tr>`).join("")}</tbody></table></div>`;
}
function dpbbIsianTarif(k, placeholder) {
  return `<input type="text" inputmode="decimal" class="form-control dpb-angka" id="dpbb-${k}" data-dpbb="${k}" data-dpb-jenis="angka" data-num
    value="${dpbEsc(dpbAngkaKotak(dpbbIsi[k]))}" placeholder="${dpbEsc(placeholder)}" aria-label="${dpbEsc(dpLabel(dpbbDef(k).label))}">`;
}

// Angka pungutan & nilai pabean ikut tarif yang sedang diketik, tanpa menggambar ulang kotaknya
function dpbbSegarkanHitung() {
  const { seri } = dpbbPungutan();
  if (!seri) return;
  const rp = (x) => formatNumberValue(Math.round(x || 0)) || "0";
  [["BM", seri.bm, seri.bebas.BM], ["PPN", seri.ppn, seri.bebas.PPN], ["PPh", seri.pph, seri.bebas.PPh]].forEach(([j, nilai, bebas]) => {
    const dibayar = $(`#dpbb-${j}-0`);
    const dibebaskan = $(`#dpbb-${j}-4`);
    if (dibayar) dibayar.textContent = bebas ? "0" : rp(nilai);
    if (dibebaskan) dibebaskan.textContent = bebas ? rp(nilai) : "0";
  });
}

function dpbbFasilitasHtml(it) {
  const baris = (it.skb || []).filter((sk) => sk && sk.jenis).map((sk) =>
    `<li><b>${dpbEsc(dpbNamaFasilitas(sk))}</b>${sk.nomor ? ` · ${dpbEsc(sk.nomor)}` : ""}${sk.tanggal ? ` · ${dpbEsc(fmtDate(sk.tanggal))}` : ""}</li>`);
  if (activeMode !== "export" && String(it.piNomor || "").trim()) {
    baris.unshift(`<li><b>PI</b> · ${dpbEsc(it.piNomor)}${it.piNoItem ? ` · ${tt("No. item", "Item no.")} ${dpbEsc(it.piNoItem)}` : ""}</li>`);
  }
  return baris.length ? `<ul class="dpbb-fasilitas">${baris.join("")}</ul>` : `<p class="dpb-kosong">${tt("Barang ini tanpa fasilitas.", "This item has no facilities.")}</p>`;
}

function dpbbRender() {
  const it = draftItems[dpbbIdx];
  const daftar = dpbbDaftarIdx();
  const pos = daftar.indexOf(dpbbIdx);
  const pib = activeMode !== "export";
  $("#dpbBarangJudul").textContent = tt(`Data Barang Seri ${dpbbIdx + 1}`, `Item ${dpbbIdx + 1} Data`);
  $("#dpbBarangSub").textContent = itemDisplayName(it);
  $("#dpbBarangPosisi").textContent = `${pos + 1} / ${daftar.length}`;
  $("#dpbBarangSebelum").disabled = pos <= 0;
  $("#dpbBarangSesudah").disabled = pos >= daftar.length - 1;

  const nilai = parseLooseNumber(it.qty) * parseLooseNumber(it.harga);
  const negara = String(it.negaraAsal || "").trim().toUpperCase();
  const ubah = `<button type="button" class="dpb-ke dpbb-ke-barang" data-dpbb-ke-barang>${tt("Ubah di Daftar Barang", "Edit on the Item List")}</button>`;
  const dataBarang = dpbbBaca("dpbbr-hs", tt("Pos Tarif / HS", "HS Code"), it.hsCode) + dpbbBaca("dpbbr-uraian", tt("Uraian Barang", "Description"), itemDisplayName(it), "s9")
    + dpbbBaca("dpbbr-merek", tt("Merek", "Brand"), it.merek) + dpbbBaca("dpbbr-tipe", tt("Tipe", "Type"), it.tipe)
    + dpbbBaca("dpbbr-ukuran", tt("Ukuran", "Size"), it.ukuran) + dpbbBaca("dpbbr-spek", tt("Spesifikasi Lain", "Other Specification"), it.spesifikasiLain)
    + dpbbBaca("dpbbr-negara", tt("Negara Asal", "Country of Origin"), negara ? labelNegara(negara) : "")
    + (pib ? dpbbBaca("dpbbr-kondisi", tt("Kondisi Barang", "Goods Condition"), labelKondisiBarang(kodeKondisiBarang(it.kondisiBarang))) : "")
    + dpbbBaca("dpbbr-jumlah", tt("Jumlah Satuan", "Quantity"), [formatNumberValue(it.qty) || "0", String(it.satuan || "").trim()].filter(Boolean).join(" "))
    + dpbbBaca("dpbbr-netto", tt("Berat Bersih (kg)", "Net Weight (kg)"), formatNumberValue(it.netto), "", true)
    + dpbbBaca("dpbbr-harga", tt("Harga Satuan (USD)", "Unit Price (USD)"), formatNumberValue(it.harga), "", true)
    + dpbbBaca("dpbbr-nilai", tt("Jumlah Nilai (USD)", "Amount (USD)"), dpbUsd(nilai) || "0", "", true);

  let isi = `<section class="dpb-bagian"><div class="dpb-bagian-judul dpbb-judul-baris"><h3>${tt("Data Barang", "Item Data")}</h3>${ubah}</div><div class="fgrid">${dataBarang}</div></section>`;
  if (pib) {
    const { seri } = dpbbPungutan();
    isi += dpbBagian(tt("Nilai Pabean", "Customs Value"), dpbbBaca("dpbbr-pabean", tt("Nilai Pabean (Rp)", "Customs Value (IDR)"), seri ? dpbRp(seri.nilaiPabean) : "", "", true)
      + dpbbIsian("metodeNilai", "s6") + dpbbIsian("bedaHargaLevel"))
      + dpbBagian(tt("Tarif & Fasilitas", "Rates & Facilities"), dpbbBarisTarifHtml(), {
        mentah: true,
        catatan: tt("Tarif kosong = Tarif (%) jadwal untuk BM, 2,5% untuk PPh. Fasilitasnya mengikuti fasilitas barang di Daftar Barang.",
          "An empty rate uses the schedule's Rate (%) for BM and 2.5% for PPh. Facilities follow the item's facilities on the Item List."),
      })
      + dpbBagian(tt("Voluntary Declaration", "Voluntary Declaration"), dpbbIsian("jenisVd", "s6") + dpbbIsian("nilaiVd") + dpbbIsian("jatuhTempo"));
  } else {
    isi += dpbBagian(tt("Data Ekspor", "Export Data"), dpbbIsian("jenisEkspor", "s6") + dpbbIsian("daerahAsal", "s6") + dpbbIsian("he") + dpbbIsian("tarifBk"));
  }
  isi += dpbBagian(pib ? tt("Fasilitas & Persyaratan", "Facilities & Requirements") : tt("Fasilitas", "Facilities"), dpbbFasilitasHtml(it), { mentah: true });
  $("#dpbBarangIsi").innerHTML = isi;
  dpbbKaki();
}

function dpbbKaki() {
  const tanya = dpbbTanyaTutup && dpbbBerubah();
  $("#dpbBarangPeringatan").hidden = !tanya;
  const tutup = $("#dpbBarangTutup");
  tutup.textContent = tanya ? tt("Tutup tanpa menyimpan", "Close without saving") : tt("Tutup", "Close");
  tutup.classList.toggle("is-bahaya", tanya);
}

/* ---------------- ketikan & tombol ---------------- */

if (dpbbModalEl) {
  const isi = $("#dpbBarangIsi");
  isi.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.dpbb) return;
    dpbbIsi[el.dataset.dpbb] = dpbBacaKotak(el);
    if (dpbbTanyaTutup) {
      dpbbTanyaTutup = false;
      dpbbKaki();
    }
    if (el.dataset.dpbb === "tarifBm" || el.dataset.dpbb === "tarifPph") dpbbSegarkanHitung();
  });
  isi.addEventListener("change", (e) => {
    if (e.target.dataset.dpbb && e.target.dataset.dpbPilihan) dpbRapikanPilihan(e.target);
  });
  isi.addEventListener("click", (e) => {
    if (!e.target.closest("[data-dpbb-ke-barang]")) return;
    // Ke baris barang ini di Daftar Barang (perubahan di sini disimpan dulu)
    const idx = dpbbIdx;
    dpbbSimpan();
    dpbbTutup();
    pilihTabForm("barang");
    const baris = $(`#itemTableBody tr[data-idx="${idx}"] [data-f="namaBarang"]`);
    if (baris) {
      fokuskan(baris, { tanpaGulir: true });
      if (typeof baris.scrollIntoView === "function") baris.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
  $("#dpbBarangSimpan").addEventListener("click", () => {
    dpbbSimpan();
    dpbbTutup();
  });
  $("#dpbBarangTutup").addEventListener("click", dpbbCobaTutup);
  $("#dpbBarangTutupX").addEventListener("click", dpbbCobaTutup);
  $("#dpbBarangSebelum").addEventListener("click", () => dpbbPindah(-1));
  $("#dpbBarangSesudah").addEventListener("click", () => dpbbPindah(1));
  dpbbModalEl.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    dpbbCobaTutup();
  });
  dpbbModalEl.addEventListener("shown.bs.modal", () => fokusIsianPertama($("#dpbBarangIsi"), { pertama: true, tanpaGulir: true }));
}
