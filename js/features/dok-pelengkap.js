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
   berubah di barangnya; PI yang dihapus dilepas dari barangnya.

   LAMPIRAN PI & LS. Tiap baris PI / LS bisa membawa berkasnya (tombol
   klip kertas). Lampiran tersimpan ada di entri.berkas; berkas pilihan
   baru menunggu di entri._baru sampai Simpan (unggahLampiranForm,
   dipanggil simpanJadwalForm), dan lampiran yang dilepas baru dihapus
   dari bucket sesudah simpanannya berhasil (berkasDilepasForm). Batal
   tidak mengubah apa pun di bucket.

   LARTAS. Di atas daftarnya: PI / LS / SNI yang wajib menurut HS Code
   & kondisi barang, dan petunjuk COO menurut negara asalnya
   (core/lartas.js) -- segarkanLartasForm(). */

// Path lampiran tersimpan yang dilepas di form ini -- dihapus sesudah Simpan berhasil
let berkasDilepasForm = [];
const JENIS_BERLAMPIRAN = ["pi", "ls"];

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

// Chip lampiran satu baris PI / LS: yang tersimpan, lalu yang menunggu Simpan
function dpBerkasHtml(d) {
  const lama = rapikanBerkas(d.berkas);
  const baru = d._baru || [];
  if (!lama.length && !baru.length) return "";
  return `<div class="dp-berkas">${lama
    .map((b, i) => chipBerkasHtml(b, { i, versi: false }))
    .concat(baru.map((b, i) => chipBerkasHtml(b, { i, baru: true, versi: false })))
    .join("")}</div>`;
}

function dpBarisHtml(jenis, d, i) {
  const ke = i + 1;
  const singkat = jenis === "lain" ? tt("dokumen", "document") : DOK_PENGIRIMAN[jenis].singkat;
  const contoh = DP_CONTOH_NOMOR[jenis];
  const berlampiran = JENIS_BERLAMPIRAN.indexOf(jenis) >= 0;
  const nLampiran = berlampiran ? rapikanBerkas(d.berkas).length + (d._baru || []).length : 0;
  return `
    <div class="dp-baris${jenis === "lain" ? " dp-baris--lain" : ""}${berlampiran ? " dp-baris--berkas" : ""}" data-i="${i}">
      ${jenis === "lain" ? `<select class="form-select" data-dp-k="kode" aria-label="${escapeAttr(tt(`Kode dokumen ${ke}`, `Document code ${ke}`))}">${dpOpsiKodeHtml(d.kode || "")}</select>` : ""}
      <input type="text" class="form-control" data-dp-k="nomor" value="${escapeAttr(d.nomor || "")}" placeholder="${escapeAttr(tt(contoh[0], contoh[1]))}" aria-label="${escapeAttr(tt(`Nomor ${singkat} ${ke}`, `${singkat} number ${ke}`))}">
      <input type="date" class="form-control" data-dp-k="tanggal" value="${escapeAttr(d.tanggal || "")}" aria-label="${escapeAttr(tt(`Tanggal ${singkat} ${ke}`, `${singkat} date ${ke}`))}">
      ${
        berlampiran
          ? `<label class="dp-lampir${nLampiran ? " has-value" : ""}" title="${escapeAttr(tt(`Lampirkan berkas ${singkat} (PDF, gambar · maks. ${LAMPIRAN_MAKS_MB} MB)`, `Attach the ${singkat} file (PDF, image · max. ${LAMPIRAN_MAKS_MB} MB)`))}">
               <i class="bi bi-paperclip" aria-hidden="true"></i>${nLampiran ? `<span class="dp-lampir-n">${nLampiran}</span>` : ""}
               <input type="file" multiple accept="${escapeAttr(LAMPIRAN_TERIMA)}" class="visually-hidden" data-dp-berkas aria-label="${escapeAttr(tt(`Lampirkan berkas ${singkat} ${ke}`, `Attach ${singkat} file ${ke}`))}">
             </label>`
          : ""
      }
      <button type="button" class="dp-hapus" data-dp-hapus title="${escapeAttr(tt("Hapus dokumen ini", "Remove this document"))}" aria-label="${escapeAttr(tt(`Hapus ${singkat} ${ke}`, `Remove ${singkat} ${ke}`))}"><i class="bi bi-x-lg"></i></button>
      ${berlampiran ? dpBerkasHtml(d) : ""}
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
  segarkanLartasForm();
}

/* ------------------------------------------------------------------
   LARTAS & COO DI KARTU INI (core/lartas.js)

   Satu kotak di atas daftar dokumen: tiap dokumen wajib -- PI, LS, SNI
   -- beserta sebabnya (HS Code bertanda di Database HS Code, barang
   bukan baru), tanda sudah / belum ada; lalu petunjuk COO menurut
   negara asal barang. Kosong (tersembunyi) kalau tidak ada yang perlu
   diingatkan. Dipanggil tiap tabel barang dihitung ulang (recalcCustoms)
   dan tiap PI / LS diubah.
------------------------------------------------------------------ */
function lartasFormHtml() {
  if (activeMode === "export") return "";
  const sumber = { mode: activeMode };
  const perlu = kebutuhanLartas(sumber, draftItems);
  const kurang = lartasKurang(sumber, draftItems, draftDokPelengkap);
  const baris = LARTAS_KODE.filter((k) => perlu[k].length).map((k) => {
    const sebab = [];
    const hs = [...new Set(perlu[k].filter((a) => a.sebab === "hs").map((a) => a.hs))];
    if (hs.length) sebab.push(tt(`HS ${hs.map(formatHsTampil).join(", ")}`, `HS ${hs.map(formatHsTampil).join(", ")}`));
    const bekas = perlu[k].filter((a) => a.sebab === "bukanBaru").map((a) => a.barang).filter(Boolean);
    if (bekas.length) sebab.push(tt(`barang bukan baru: ${[...new Set(bekas)].join(", ")}`, `used goods: ${[...new Set(bekas)].join(", ")}`));
    const status =
      k === "SNI"
        ? { kelas: "info", ikon: "bi-info-circle", teks: tt("pastikan sertifikatnya ada (Dokumen Lain)", "make sure the certificate is attached (Other Documents)") }
        : kurang.indexOf(k) >= 0
          ? { kelas: "kurang", ikon: "bi-exclamation-triangle-fill", teks: tt("belum ada nomornya", "no number yet") }
          : { kelas: "ada", ikon: "bi-check-circle-fill", teks: tt("sudah diisi", "filled in") };
    return `<li class="lartas-baris lartas-baris--${status.kelas}">
        <i class="bi ${status.ikon}" aria-hidden="true"></i>
        <span><b>${escapeHtml(LARTAS_INFO[k].nama)}</b> — ${escapeHtml(sebab.join("; "))} <span class="lartas-status">· ${escapeHtml(status.teks)}</span></span>
      </li>`;
  });
  const fta = petunjukFtaCoo(sumber, draftItems);
  if (!baris.length && !fta) return "";
  return `${baris.length ? `<div class="lartas-judul"><i class="bi bi-shield-exclamation" aria-hidden="true"></i> ${escapeHtml(tt("Lartas — dokumen wajib menurut barangnya", "Restrictions — documents required by the goods"))}</div><ul class="lartas-daftar">${baris.join("")}</ul>` : ""}${
    fta ? `<div class="lartas-fta"><i class="bi bi-globe2" aria-hidden="true"></i> <span>${escapeHtml(fta)}</span></div>` : ""
  }`;
}
// HS 8 digit ditampilkan bertitik seperti BTKI: 8480.71.90
function formatHsTampil(kode) {
  const d = String(kode || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d;
}
function segarkanLartasForm() {
  const box = $("#lartasForm");
  if (!box) return;
  const html = lartasFormHtml();
  box.innerHTML = html;
  box.classList.toggle("d-none", !html);
  box.classList.toggle("is-kurang", !!html && !!box.querySelector(".lartas-baris--kurang"));
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
  wadahDokPelengkap.addEventListener("input", (e) => {
    const letak = catatIsian(e);
    // Nomor PI / LS diketik: tanda lartas "sudah / belum ada" ikut berubah
    if (letak && e.target.dataset.dpK === "nomor" && JENIS_BERLAMPIRAN.indexOf(letak.jenis) >= 0) segarkanLartasForm();
  });
  // Selesai diubah: pilihan PI di panel barang ikut diperbarui
  wadahDokPelengkap.addEventListener("change", (e) => {
    if (e.target.matches("[data-dp-berkas]")) {
      tampungBerkasDokPelengkap(e.target);
      return;
    }
    catatIsian(e);
    const letak = dpLetak(e.target);
    if (letak && letak.jenis === "pi") renderItemTable();
  });
  wadahDokPelengkap.addEventListener("click", (e) => {
    // Chip lampiran: buka, atau lepas (yang tersimpan baru dihapus sesudah Simpan)
    const chip = e.target.closest("[data-berkas-i]");
    const letakChip = chip && dpLetak(chip);
    if (letakChip) {
      const entri = draftDokPelengkap[letakChip.jenis][letakChip.i];
      const i = Number(chip.dataset.berkasI);
      const baru = chip.dataset.berkasJenis === "baru";
      if (!entri) return;
      if (e.target.closest("[data-berkas-hapus]")) {
        if (baru) entri._baru.splice(i, 1);
        else {
          const lama = rapikanBerkas(entri.berkas);
          const [dilepas] = lama.splice(i, 1);
          if (dilepas) berkasDilepasForm.push(dilepas.path);
          entri.berkas = lama;
        }
        renderDokPelengkapForm();
        const baris = wadahDokPelengkap.querySelector(`[data-dp="${letakChip.jenis}"] .dp-baris[data-i="${letakChip.i}"]`);
        fokuskan(baris && (baris.querySelector("[data-berkas-hapus]") || baris.querySelector("[data-dp-berkas]")));
      } else if (e.target.closest("[data-berkas-buka]")) {
        if (baru) bukaBerkasLokal(entri._baru[i] && entri._baru[i].file);
        else bukaLampiran(rapikanBerkas(entri.berkas)[i]);
      }
      return;
    }
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
      // Dokumen dihapus: lampiran tersimpannya ikut dihapus -- sesudah Simpan
      if (dibuang) rapikanBerkas(dibuang.berkas).forEach((b) => berkasDilepasForm.push(b.path));
      fokus = { jenis: letak.jenis, i: Math.min(letak.i, daftar.length - 1) };
    }
    renderDokPelengkapForm();
    const baris = fokus && wadahDokPelengkap.querySelector(`[data-dp="${fokus.jenis}"] .dp-baris[data-i="${Math.max(0, fokus.i)}"]`);
    fokuskan((baris && baris.querySelector("select, input")) || wadahDokPelengkap.querySelector(`[data-dp="${letak.jenis}"] [data-dp-tambah]`));
  });
}

// Berkas dipilih di baris PI / LS: ditampung sampai Simpan (yang kosong / terlalu besar ditolak)
function tampungBerkasDokPelengkap(input) {
  const letak = dpLetak(input);
  const entri = letak && draftDokPelengkap[letak.jenis][letak.i];
  if (!entri) return;
  const galat = [];
  [...(input.files || [])].forEach((file) => {
    const g = periksaBerkasLampiran(file);
    if (g) galat.push(g);
    else (entri._baru = entri._baru || []).push({ file, nama: file.name, ukuran: file.size, tipe: file.type || "" });
  });
  input.value = "";
  renderDokPelengkapForm();
  if (galat.length) showToast(galat.join(" "), "warning");
  const baris = $(`#dokPelengkapIsi [data-dp="${letak.jenis}"] .dp-baris[data-i="${letak.i}"]`);
  fokuskan(baris && baris.querySelector("[data-dp-berkas]"));
}

/* SAAT SIMPAN (simpanJadwalForm): berkas yang menunggu di baris PI / LS
   diunggah, lalu jadi lampiran tersimpan entrinya. Satu berkas gagal ->
   yang sudah terunggah dari simpanan ini dihapus lagi, galatnya
   dilempar, dan semua berkas tetap menunggu untuk dicoba lagi.

   Kalau sesudahnya simpanan JADWALNYA yang gagal, lampiran yang sudah
   terunggah tetap di entrinya: Simpan berikutnya langsung memakainya
   tanpa mengunggah ulang. (Menghapusnya justru berbahaya: baris jadwal
   bisa saja sudah tersimpan dengan path-nya sebelum daftar barangnya
   gagal.) */
async function unggahLampiranForm(idJadwal) {
  const tugas = [];
  JENIS_BERLAMPIRAN.forEach((j) =>
    (draftDokPelengkap[j] || []).forEach((d) => {
      if (d._baru && d._baru.length) tugas.push({ j, d });
    }),
  );
  const terunggah = [];
  try {
    for (const { j, d } of tugas) {
      const hasil = await unggahLampiran(d._baru.map((b) => ({ file: b.file })), `${idJadwal || "baru"}/dok-${j}`);
      hasil.forEach((b) => terunggah.push({ d, b }));
    }
  } catch (e) {
    await hapusLampiran(terunggah.map((x) => x.b.path));
    throw e;
  }
  terunggah.forEach(({ d, b }) => (d.berkas = rapikanBerkas(d.berkas).concat(b)));
  tugas.forEach(({ d }) => delete d._baru);
  return terunggah.map((x) => x.b.path);
}
// Ada berkas yang menunggu diunggah di kartu ini?
function adaLampiranTertundaForm() {
  return JENIS_BERLAMPIRAN.some((j) => (draftDokPelengkap[j] || []).some((d) => d._baru && d._baru.length));
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
    // Baris yang hanya berlampiran tetap dipertahankan
    const daftar = draftDokPelengkap[jenis].filter(
      (d) => String(d.nomor || "").trim() || d.tanggal || rapikanBerkas(d.berkas).length || (d._baru || []).length,
    );
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
