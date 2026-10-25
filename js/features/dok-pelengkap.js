"use strict";

/* DOKUMEN PELENGKAP PABEAN DI FORM JADWAL

   Kartu "Dokumen Pelengkap Pabean" di tab Kepabeanan:
     - PI, LS & Polis Asuransi (buku Import) -- masing-masing bisa lebih
       dari satu, tiap dokumen bernomor & bertanggal;
     - Dokumen Lain ber-kode CEISA (kedua buku) -- dokumen draft yang
       tidak punya isian sendiri (packing list, L/C, sertifikat, ...).
   Keadaannya di draftDokPelengkap (state.js), tersimpan sebagai
   s.dokPelengkap (helpers.js: dokPelengkapKosong / rapikanDokPelengkap).

   PI per barang (item.piNomor) dipilih dari daftar PI ini di panel
   Fasilitas tabel barang (item-table.js). Nomor PI yang diubah ikut
   berubah di barangnya; PI yang dihapus dilepas dari barangnya. */

function jenisDokPelengkapTampil() {
  return (ML().showDuty ? JENIS_DOK_PENGIRIMAN : []).concat("lain");
}

// Isi form yang disimpan: entri kosong dibuang, jenis yang tidak tampil di buku ini dikosongkan
function dokPelengkapForm() {
  const tampil = new Set(jenisDokPelengkapTampil());
  const d = rapikanDokPelengkap(draftDokPelengkap);
  JENIS_DOK_PENGIRIMAN.forEach((j) => {
    if (!tampil.has(j)) d[j] = [];
  });
  return d;
}

// Nomor PI yang dipilih barang-barang: yang masih ada di daftar PI
function nomorPiForm() {
  return draftDokPelengkap.pi.map((d) => String(d.nomor || "").trim()).filter(Boolean);
}

const DP_CONTOH_NOMOR = {
  pi: ["mis. 04.PI-02.26.0131", "e.g. 04.PI-02.26.0131"],
  ls: ["mis. ITB21G2672826137141", "e.g. ITB21G2672826137141"],
  polis: ["mis. EKD2273805 - KMC260031", "e.g. EKD2273805 - KMC260031"],
  lain: ["Nomor dokumen", "Document number"],
};

function dpJudul(jenis) {
  return jenis === "lain" ? tt("Dokumen Lain", "Other Documents") : DOK_PENGIRIMAN[jenis].label;
}

/* Pilihan kode Dokumen Lain: seluruh KODE_DOKUMEN_CEISA kecuali yang punya
   isian sendiri (invoice, B/L-AWB, PI, LS, polis); kode tersimpan yang di
   luar daftar ikut tampil. */
const DP_KODE_LAIN = Object.keys(KODE_DOKUMEN_CEISA).filter(
  (k) => !KODE_DOKUMEN_BERISIAN.has(k) && !JENIS_DOK_PENGIRIMAN.some((j) => DOK_PENGIRIMAN[j].kode === k),
);
function dpOpsiKodeHtml(kini) {
  const kode = kini && !DP_KODE_LAIN.includes(kini) ? DP_KODE_LAIN.concat(kini) : DP_KODE_LAIN;
  return [`<option value="">${escapeHtml(tt("Kode…", "Code…"))}</option>`]
    .concat(kode.map((k) => `<option value="${escapeAttr(k)}"${k === kini ? " selected" : ""}>${escapeHtml(`${k} — ${namaDokumenCeisa(k)}`)}</option>`))
    .join("");
}

function dpBarisHtml(jenis, d, i) {
  const ke = i + 1;
  const singkat = jenis === "lain" ? tt("dokumen", "document") : DOK_PENGIRIMAN[jenis].singkat;
  const contoh = DP_CONTOH_NOMOR[jenis];
  return `
    <div class="dp-baris${jenis === "lain" ? " dp-baris--lain" : ""}" data-i="${i}">
      ${jenis === "lain" ? `<select class="form-select" data-dp-k="kode" aria-label="${escapeAttr(tt(`Kode dokumen ${ke}`, `Document code ${ke}`))}">${dpOpsiKodeHtml(d.kode || "")}</select>` : ""}
      <input type="text" class="form-control" data-dp-k="nomor" value="${escapeAttr(d.nomor || "")}" placeholder="${escapeAttr(tt(contoh[0], contoh[1]))}" aria-label="${escapeAttr(tt(`Nomor ${singkat} ${ke}`, `${singkat} number ${ke}`))}">
      <input type="date" class="form-control" data-dp-k="tanggal" value="${escapeAttr(d.tanggal || "")}" aria-label="${escapeAttr(tt(`Tanggal ${singkat} ${ke}`, `${singkat} date ${ke}`))}">
      <button type="button" class="dp-hapus" data-dp-hapus title="${escapeAttr(tt("Hapus dokumen ini", "Remove this document"))}" aria-label="${escapeAttr(tt(`Hapus ${singkat} ${ke}`, `Remove ${singkat} ${ke}`))}"><i class="bi bi-x-lg"></i></button>
    </div>`;
}

function dpGrupHtml(jenis) {
  const daftar = draftDokPelengkap[jenis];
  const kode = jenis === "lain" ? "" : `<span class="dp-kode" title="${escapeAttr(tt("Kode dokumen CEISA", "CEISA document code"))}">${DOK_PENGIRIMAN[jenis].kode}</span>`;
  const tambah = jenis === "lain" ? tt("Tambah Dokumen", "Add Document") : tt(`Tambah ${DOK_PENGIRIMAN[jenis].singkat}`, `Add ${DOK_PENGIRIMAN[jenis].singkat}`);
  return `
    <section class="dp-grup${jenis === "lain" ? " dp-grup--lain" : ""}" data-dp="${jenis}" aria-label="${escapeAttr(dpJudul(jenis))}">
      <div class="dp-kepala"><span class="dp-judul">${escapeHtml(dpJudul(jenis))}</span>${kode}</div>
      ${daftar.length ? daftar.map((d, i) => dpBarisHtml(jenis, d, i)).join("") : `<div class="dp-kosong">${escapeHtml(tt("Belum ada dokumen lain.", "No other documents yet."))}</div>`}
      <button type="button" class="dp-tambah" data-dp-tambah><i class="bi bi-plus-lg"></i> ${escapeHtml(tambah)}</button>
    </section>`;
}

/* PI, LS & Polis selalu punya satu baris siap ketik (sama seperti satu
   isian dulu); baris kosong tidak ikut tersimpan. */
function renderDokPelengkapForm() {
  const wadah = $("#dokPelengkapIsi");
  if (!wadah) return;
  JENIS_DOK_PENGIRIMAN.forEach((j) => {
    if (!draftDokPelengkap[j].length) draftDokPelengkap[j].push({ nomor: "", tanggal: "" });
  });
  wadah.innerHTML = jenisDokPelengkapTampil().map(dpGrupHtml).join("");
}

function dpLetak(el) {
  const grup = el.closest("[data-dp]");
  const baris = el.closest(".dp-baris");
  return grup ? { jenis: grup.dataset.dp, i: baris ? Number(baris.dataset.i) : -1 } : null;
}

/* Nomor PI berubah / dihapus (entrinya sudah diubah / dibuang): barang
   yang memakai nomor lama ikut. Nomor lama yang masih dimiliki entri PI
   lain tetap milik barangnya -- mengetik "PI-A" di entri baru lalu
   melanjutkannya jadi "PI-AB" tidak memindahkan barang PI-A. */
function ikutkanPiBarang(lama, baru) {
  const kunci = String(lama || "").trim();
  if (!kunci || nomorPiForm().includes(kunci)) return false;
  let berubah = false;
  draftItems.forEach((it) => {
    if (String(it.piNomor || "").trim() !== kunci) return;
    it.piNomor = String(baru || "").trim();
    if (!it.piNomor) it.piNoItem = "";
    berubah = true;
  });
  return berubah;
}

const wadahDokPelengkap = $("#dokPelengkapIsi");
if (wadahDokPelengkap) {
  // Isian -> keadaan (input & change sama-sama: kotak tanggal / pilihan kode bisa hanya memicu salah satunya)
  const catatIsian = (e) => {
    const k = e.target.dataset.dpK;
    const letak = k && dpLetak(e.target);
    const entri = letak && draftDokPelengkap[letak.jenis][letak.i];
    if (!entri || entri[k] === e.target.value) return null;
    const lama = entri[k];
    entri[k] = e.target.value;
    if (letak.jenis === "pi" && k === "nomor") ikutkanPiBarang(lama, e.target.value);
    return letak;
  };
  wadahDokPelengkap.addEventListener("input", catatIsian);
  // Selesai diubah: pilihan PI di panel barang ikut diperbarui
  wadahDokPelengkap.addEventListener("change", (e) => {
    catatIsian(e);
    const letak = dpLetak(e.target);
    if (letak && letak.jenis === "pi") renderItemTable();
  });
  wadahDokPelengkap.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-dp-tambah], [data-dp-hapus]");
    const letak = tombol && dpLetak(tombol);
    if (!letak) return;
    const daftar = draftDokPelengkap[letak.jenis];
    let fokus = null;
    if (tombol.hasAttribute("data-dp-tambah")) {
      daftar.push(letak.jenis === "lain" ? { kode: "", nomor: "", tanggal: "" } : { nomor: "", tanggal: "" });
      fokus = { jenis: letak.jenis, i: daftar.length - 1 };
    } else {
      const [dibuang] = daftar.splice(letak.i, 1);
      if (letak.jenis === "pi" && dibuang && ikutkanPiBarang(dibuang.nomor, "")) renderItemTable();
      fokus = { jenis: letak.jenis, i: Math.min(letak.i, daftar.length - 1) };
    }
    renderDokPelengkapForm();
    const baris = fokus && wadahDokPelengkap.querySelector(`[data-dp="${fokus.jenis}"] .dp-baris[data-i="${Math.max(0, fokus.i)}"]`);
    fokuskan((baris && baris.querySelector("select, input")) || wadahDokPelengkap.querySelector(`[data-dp="${letak.jenis}"] [data-dp-tambah]`));
  });
}

/* IMPOR DOKUMEN PABEAN: daftar dari berkas DIGABUNG ke form per nomor --
   dokumen bernomor sama mengambil tanggal dari berkas (dokumen itulah
   rujukannya), yang belum ada ditambahkan, yang sudah diketik dibiarkan.
   PI, LS & Polis hanya di buku Import. Hasil: jumlah dokumen yang
   ditambah / dilengkapi. */
function gabungDokPelengkapImpor(dari) {
  const sumber = rapikanDokPelengkap(dari);
  const tampil = new Set(jenisDokPelengkapTampil());
  let berubah = 0;
  Object.keys(sumber).forEach((jenis) => {
    if (!tampil.has(jenis)) return;
    const daftar = draftDokPelengkap[jenis].filter((d) => String(d.nomor || "").trim() || d.tanggal);
    sumber[jenis].forEach((d) => {
      const sama = d.nomor && daftar.find((x) => String(x.nomor || "").trim() === d.nomor && (jenis !== "lain" || x.kode === d.kode));
      if (!sama) {
        daftar.push(Object.assign({}, d));
        berubah++;
      } else if (d.tanggal && sama.tanggal !== d.tanggal) {
        sama.tanggal = d.tanggal;
        berubah++;
      }
    });
    draftDokPelengkap[jenis] = daftar;
  });
  renderDokPelengkapForm();
  return berubah;
}
