"use strict";

/* ITEM TABLE (draft, inside modal) */

/* Nama TAMPIL jenis fasilitas. Nilai tersimpannya tetap "E-COO" (data
   lama & hasil impor PDF/CEISA memakainya), tapi di layar & salinan
   fasilitas itu disebut COO -- "E-COO" kini nama tahap tersendiri di
   Progres Dokumen (COO elektronik), dan dua hal berbeda tidak boleh
   bernama sama. */
function skbJenisLabel(jenis) {
  if (jenis === "E-COO") return "COO";
  if (jenis === "Lainnya") return tt("Lainnya", "Other");
  return jenis;
}
function skbEntryLabel(sk) {
  if (sk.jenis === "Lainnya")
    return (sk.jenisLainnya || "").trim() || tt("Lainnya", "Other");
  return skbJenisLabel(sk.jenis);
}

/* Hitungan fasilitas: COO tersendiri, semua jenis lain dihitung SKB. */
function hitungFasilitas(daftar) {
  const semua = daftar || [];
  const coo = semua.filter((sk) => sk.jenis === "E-COO").length;
  return { skb: semua.length - coo, coo };
}

// PI barang ini hanya di buku Import (Persetujuan Impor)
function piBarangBerlaku(it) {
  return ML().showDuty && !!String((it && it.piNomor) || "").trim();
}

/* Tombol kolom Fasilitas: "PI #5 · SKB 1 · COO 1" -- PI barang ini (buku
   Import) beserta No. item-nya, lalu SKB & COO berhitungan. */
function facilitiesButtonLabel(it) {
  const h = hitungFasilitas(it.skb);
  const parts = [];
  if (piBarangBerlaku(it)) parts.push(it.piNoItem ? `PI #${String(it.piNoItem).trim()}` : "PI");
  if (h.skb) parts.push(`SKB ${h.skb}`);
  if (h.coo) parts.push(`COO ${h.coo}`);
  return parts.join(" · ") || tt("Fasilitas", "Facility");
}

/* HS Code dari Database HS Code menurut nama barangnya (hscode-lookup.js):
   kotak yang diisi otomatis & tombol cari untuk nama yang cocok dengan
   beberapa kode. */
function judulHsOtomatis(nama) {
  return tt(`Diisi otomatis dari Database HS Code ("${nama}"). Ketik untuk mengganti.`, `Filled automatically from the HS Code Database ("${nama}"). Type to replace it.`);
}
function judulTombolCariHs(it) {
  return it._hsSaran
    ? tt(`Beberapa HS Code cocok untuk "${it._hsSaran}" — pilih salah satu.`, `Several HS Codes match "${it._hsSaran}" — pick one.`)
    : t("s.cari.hs.code.dari.database.berdasarkan.nama.ba");
}

// Pilihan PI kosong: barang BARU memang tidak memakai PI
function labelTanpaPi(it) {
  return kodeKondisiBarang(it.kondisiBarang) === "1" ? tt("Tidak Menggunakan PI", "No PI Used") : tt("— Pilih PI —", "— Select PI —");
}

/* PI BARANG INI (buku Import): dipilih dari daftar PI jadwal (kartu
   Dokumen Pelengkap Pabean, dok-pelengkap.js); No. item = nomor urut
   barang ini di dokumen PI-nya. Barang BARU (kode kondisi 1) tidak
   memakai PI -- pilihan kosongnya berbunyi begitu. Nomor yang tidak ada
   lagi di daftar tetap tampil, tidak diam-diam dilepas. */
function piBarangHtml(it, idx) {
  if (!ML().showDuty) return "";
  const daftar = draftDokPelengkap.pi.filter((d) => String(d.nomor || "").trim());
  const kini = String(it.piNomor || "").trim();
  const opsi = [["", labelTanpaPi(it)]].concat(daftar.map((d) => [d.nomor.trim(), d.tanggal ? `${d.nomor.trim()} · ${fmtDate(d.tanggal)}` : d.nomor.trim()]));
  if (kini && !opsi.some((o) => o[0] === kini)) opsi.push([kini, tt(`${kini} (tidak ada di daftar PI)`, `${kini} (not in the PI list)`)]);
  return `
          <div class="item-fac-pi">
            <label>${tt("PI (Persetujuan Impor)", "PI (Import Approval)")}
              <select data-fac="piNomor" data-idx="${idx}">${opsi
                .map(([v, label]) => `<option value="${escapeAttr(v)}"${v === kini ? " selected" : ""}>${escapeHtml(label)}</option>`)
                .join("")}</select>
            </label>
            <label>${tt("No. item di PI", "Item no. in PI")}
              <input type="text" data-fac="piNoItem" data-idx="${idx}" value="${escapeAttr(it.piNoItem || "")}" inputmode="numeric" placeholder="${escapeAttr(tt("mis. 5", "e.g. 5"))}"${kini ? "" : " disabled"}>
            </label>
            ${daftar.length ? "" : `<span class="item-fac-pi-catatan">${tt("Nomor PI diisi di kartu Dokumen Pelengkap Pabean, tab 3.", "PI numbers are entered in the Supporting Customs Documents card, tab 3.")}</span>`}
          </div>`;
}

/* SERI BARANG — nomor urut barang, dari POSISI baris (idx+1), BUKAN
   field tersimpan sendiri. Sengaja begitu: kalau field-nya sendiri
   disimpan lalu barisnya diurutkan ulang atau satu barang dihapus di
   tengah, nomor yang tersimpan langsung tidak lagi mewakili urutan
   yang sebenarnya. Dihitung ulang setiap
   renderItemTable() dipanggil, jadi SELALU 1, 2, 3, ... berurutan
   mengikuti apa yang benar-benar tampil saat itu — termasuk sesudah
   Import CEISA yang baris BARANG-nya sudah diurutkan numerik menurut
   Seri Barang aslinya (lihat excel-bc.js). */
function facilitiesPanelHtml(it, idx) {
  const skbList = it.skb || [];
  const skbRowsHtml = skbList.length
    ? skbList
        .map(
          (sk, skIdx) => `
        <div class="item-fac-skb-row">
          <select data-fac="jenis" data-idx="${idx}" data-skidx="${skIdx}">
            ${SKB_TYPE_OPTIONS.map((o) => `<option value="${o}" ${o === sk.jenis ? "selected" : ""}>${escapeHtml(skbJenisLabel(o))}</option>`).join("")}
          </select>
          ${
            sk.jenis === "Lainnya"
              ? `<input type="text" class="skb-lainnya" data-fac="jenisLainnya" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.jenisLainnya)}" placeholder="${tt("Sebutkan jenisnya", "Specify the type")}">`
              : ""
          }
          <input type="text" data-fac="nomor" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.nomor)}" placeholder="${sk.jenis === "E-COO" ? tt("Nomor COO", "COO number") : tt("Nomor SKB", "SKB number")}">
          <input type="date" data-fac="tanggal" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.tanggal)}">
          <button type="button" class="rm-skb" data-idx="${idx}" data-skidx="${skIdx}" title="${tt("Hapus fasilitas ini", "Remove this facility")}"><i class="bi bi-x-lg"></i></button>
        </div>`,
        )
        .join("")
    : `<div class="item-fac-empty">${t("c.belum.ada.fasilitas.untuk.barang.ini")}</div>`;

  return `
    <tr class="item-fac-row" data-idx="${idx}">
      <td colspan="24">
        <div class="item-fac-panel">
          ${piBarangHtml(it, idx)}
          <div class="item-fac-skb-head">
            <b>${tt("Fasilitas (SKB &amp; COO)", "Facilities (SKB &amp; COO)")}</b>
            <button type="button" class="btn-add-skb" data-idx="${idx}"><i class="bi bi-plus-lg"></i> ${tt("Tambah Fasilitas", "Add Facility")}</button>
          </div>
          ${skbRowsHtml}
        </div>
      </td>
    </tr>`;
}

// Hint kecil di bawah input Kemasan (kolom per barang)
function packageWarnTitle(it) {
  const raw = String(it.package || "").trim();
  if (!raw) return "";
  if (activeMode === "import") {
    return extractLeadingNumber(raw) == null
      ? t("w.jumlah.kemasan.tidak.terbaca")
      : "";
  }
  return parsePackageDims(raw)
    ? ""
    : tt("Format dimensi: P*L*T, mis. 82*82*75.", "Dimension format: L*W*H, e.g. 82*82*75.");
}

/* Isian kolom barang CEISA (Kode Barang s.d. Spesifikasi Lain, juga
   Marks) adalah textarea yang tumbuh otomatis mengikuti isinya --
   lebarnya seragam, teks panjang membungkus ke baris berikutnya.

   TIDAK BISA DIUKUR SAAT TERSEMBUNYI. Tabel ini tinggal di dalam
   tab-pane "barang", dan tab yang tidak aktif memakai `d-none` —
   yaitu display:none. Elemen tanpa tata letak mengembalikan
   scrollHeight 0.

   Menulis tingginya walau nol justru MERUSAK: "0px" menimpa tinggi
   benar yang sudah dihitung. Impor
   PDF/Excel biasanya berjalan saat tab Umum yang terbuka, jadi seluruh
   kolom nama diukur dalam keadaan tersembunyi, dapat nol, lalu
   dikunci di situ. Begitu tab Data Barang dibuka, kotaknya sudah
   terlanjur pendek — dan baru betul setelah diketik, karena mengetik
   memicu perhitungan ulang saat elemennya sudah kelihatan.

   Sekarang pengukuran dilewati kalau elemennya belum tergambar, dan
   dihitung ulang begitu tabnya benar-benar terbuka. */
function terlihat(el) {
  /* getClientRects kosong = tidak tergambar sama sekali. Lebih jujur
     daripada memeriksa offsetParent, yang juga null untuk elemen
     position:fixed padahal elemen itu terlihat. */
  return !!(el && el.getClientRects && el.getClientRects().length);
}

function autoGrowTextarea(el) {
  if (!terlihat(el)) return;
  el.style.height = "auto";
  // TANPA batas atas: nama barang bisa sangat panjang
  el.style.height = `${el.scrollHeight}px`;
}

/* Menyesuaikan SELURUH kolom nama barang.

   Harus dipanggil setiap kali tabel digambar ulang, TERMASUK setelah
   data hasil impor masuk. Kalau hanya dipanggil saat pengguna
   mengetik, nama panjang dari PDF/Excel akan terpotong sampai
   kolomnya kebetulan disentuh.

   DIKERJAKAN BERKELOMPOK, bukan satu-satu. Memanggil autoGrowTextarea
   berulang kali menyelang-nyeling TULIS dan BACA: menyetel height
   membatalkan tata letak, lalu membaca scrollHeight memaksa peramban
   menghitungnya ulang saat itu juga. Satu kiriman berisi 60 barang
   berarti 60 perhitungan paksa berturut-turut — dan itu terasa
   sebagai jeda saat tab Data Barang dibuka.

   Di sini semuanya ditulis dulu, baru semuanya dibaca, baru semuanya
   ditulis lagi. Peramban cukup menghitung sekali. */
function autoGrowAllItemNames() {
  const kotak = [];
  document
    .querySelectorAll("textarea.isian-barang")
    .forEach((el) => { if (terlihat(el)) kotak.push(el); });
  if (!kotak.length) return;

  kotak.forEach((el) => (el.style.height = "auto"));       // tulis semua
  const tinggi = kotak.map((el) => el.scrollHeight);        // baca semua
  kotak.forEach((el, i) => (el.style.height = `${tinggi[i]}px`));
}

/* Lebar kolom berubah saat jendela diubah ukurannya; teks yang tadinya
   dua baris bisa jadi tiga. */
window.addEventListener("resize", () => {
  clearTimeout(window.__growTimer);
  window.__growTimer = setTimeout(autoGrowAllItemNames, 150);
});

/* Menempel teks (Ctrl+V).

   Kejadian `paste` menyala SEBELUM isinya masuk ke kotak, jadi tingginya
   harus dihitung pada putaran gambar berikutnya — kalau tidak, yang
   terukur masih isi yang lama. */
document.addEventListener("paste", (e) => {
  const el = e.target;
  if (el && el.matches && el.matches("textarea.isian-barang")) {
    setTimeout(() => autoGrowTextarea(el), 0);
  }
});

/* Perubahan yang datang dari KODE, bukan dari mengetik.

   Impor PDF/Excel dan tempel-massal mengisi kotak lewat `.value`, dan
   itu tidak memicu kejadian apa pun. Pengamat ini menangkap saat
   baris-baris baru masuk ke tabel, lalu menghitung ulang tingginya.

   requestAnimationFrame dipakai supaya pengukuran terjadi setelah
   peramban selesai menata letaknya; scrollHeight yang dibaca terlalu
   dini akan mengembalikan tinggi satu baris. */
function amatiTabelBarang() {
  const tbody = document.getElementById("itemTableBody");
  if (!tbody || tbody.dataset.grownObserved) return;
  tbody.dataset.grownObserved = "1";
  new MutationObserver(() => {
    requestAnimationFrame(autoGrowAllItemNames);
  }).observe(tbody, { childList: true, subtree: true });
}
document.addEventListener("DOMContentLoaded", amatiTabelBarang);
amatiTabelBarang();

/* SAAT TABNYA DIBUKA.

   Inilah pasangan dari penjagaan di autoGrowTextarea. Selama tabnya
   tertutup tidak ada yang bisa diukur, jadi perhitungannya ditunda
   sampai di sini — momen pertama kotak-kotak itu punya ukuran.

   Yang diamati atribut `class` pada pane-nya, bukan klik tombol tab.
   Klik hanyalah SALAH SATU jalan menuju terbuka; berpindah lewat kode
   atau apa pun yang mencabut `d-none` nanti akan ikut tertangkap tanpa
   perlu diingat-ingat. */
function amatiPaneBarang() {
  const pane = document.querySelector('.tab-pane[data-tabpane="barang"]');
  if (!pane || pane.dataset.growPaneObserved) return;
  pane.dataset.growPaneObserved = "1";
  new MutationObserver(() => {
    if (!pane.classList.contains("d-none")) {
      requestAnimationFrame(autoGrowAllItemNames);
    }
  }).observe(pane, { attributes: true, attributeFilter: ["class"] });
}
document.addEventListener("DOMContentLoaded", amatiPaneBarang);
amatiPaneBarang();

// Font body (Inter) dimuat dengan `display=swap` (lihat index.html)
if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    document
      .querySelectorAll("textarea.isian-barang")
      .forEach(autoGrowTextarea);
  });
}

/* Kolom barang CEISA di tabel isian, kiri ke kanan -- sesudah HS Code
   (KOLOM_NAMA_BARANG, helpers.js). Label dibaca saat digambar, supaya
   ikut bahasa aktif. */
function kolomIsianBarang() {
  return [
    ["kodeBarang", tt("Kode Barang", "Item Code")],
    ["namaBarang", tt("Uraian", "Description")],
    ["merek", tt("Merek", "Brand")],
    ["tipe", tt("Tipe", "Type")],
    ["ukuran", tt("Ukuran", "Size")],
    ["spesifikasiLain", tt("Spesifikasi Lain", "Other Specification")],
  ];
}

/* Kelas sel untuk tata letak kartu (form.css, @container barang-isi):
   Uraian dua kolom. */
const KELAS_KARTU_BARANG = { namaBarang: "uraian-col" };

// Isian yang selalu HURUF BESAR (kolom CEISA ditulis kapital; "Tyre Mold" & "TYRE MOLD" bukan dua barang)
const ISIAN_BARANG_KAPITAL = new Set(KOLOM_NAMA_BARANG.concat(["marks", "satuan", "packingUnit"]));

function isianBarangHtml(it, field, label, placeholder, kelas) {
  return `<td class="kolom-ceisa${kelas ? " " + kelas : ""}" data-label="${escapeAttr(label)}"><textarea rows="1" class="isian-barang" data-f="${field}" placeholder="${escapeAttr(placeholder || label)}" aria-label="${escapeAttr(label)}">${escapeHtml(it[field] || "")}</textarea></td>`;
}

/* KODE KONDISI BARANG (buku Import; kolomnya disembunyikan di Export,
   .import-col): pilihan 1 / 2 (KONDISI_BARANG, helpers.js). Nilai lain
   yang terlanjur tersimpan tetap tampil sebagai pilihan sendiri, tidak
   diam-diam diganti. */
function isianKondisiHtml(it) {
  const kini = kodeKondisiBarang(it.kondisiBarang);
  const opsi = [["", "—"]].concat(KONDISI_BARANG.map((k) => [k[0], labelKondisiBarang(k[0])]));
  if (kini && !opsi.some((o) => o[0] === kini)) opsi.push([kini, kini]);
  return `<td class="kolom-kode import-col" data-label="${escapeAttr(tt("Kondisi Barang", "Goods Condition"))}"><select data-f="kondisiBarang" aria-label="${escapeAttr(tt("Kondisi Barang", "Goods Condition"))}">${opsi
    .map(([v, label]) => `<option value="${escapeAttr(v)}"${v === kini ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("")}</select></td>`;
}

/* KODE NEGARA ASAL BARANG: kotak ketik + saran #negaraList (negara.js)
   -- mengetik kode, nama Indonesia, atau nama Inggris menemukannya.
   Yang tersimpan KODENYA: dibakukan begitu kotaknya ditinggalkan atau
   Enter (bakukanIsianNegara). Nama negaranya redup di dalam kotak,
   sesudah kodenya (form.css); kode yang tidak dikenal dibiarkan (huruf
   besar), ditandai merah, keterangannya di tooltip. */
function keteranganNegara(kode) {
  const nama = namaNegara(kode);
  const salah = !!kode && !nama;
  return {
    salah,
    teks: salah ? "" : nama,
    judul: salah ? tt("Kode negara tidak dikenal — pilih dari daftar.", "Unknown country code — pick one from the list.") : nama ? `${kode} — ${nama}` : "",
  };
}

function isianNegaraHtml(it) {
  const kode = String(it.negaraAsal || "").trim().toUpperCase();
  const ket = keteranganNegara(kode);
  return `<td class="kolom-kode" data-label="${escapeAttr(tt("Negara Asal", "Country of Origin"))}"><div class="negara-isian"><input type="text" data-f="negaraAsal" list="negaraList" value="${escapeAttr(kode)}" placeholder="${escapeAttr(tt("Kode / nama", "Code / name"))}" autocomplete="off" spellcheck="false" aria-label="${escapeAttr(tt("Negara Asal", "Country of Origin"))}" title="${escapeAttr(ket.judul)}"${ket.salah ? ' class="negara-salah"' : ""}><span class="negara-nama" aria-hidden="true">${escapeHtml(ket.teks)}</span></div></td>`;
}

// Keterangan di bawah kotak negara mengikuti isinya: `kode` = yang sudah dibakukan, atau tebakan dari ketikan
function tulisKeteranganNegara(el, kode) {
  const ket = keteranganNegara(kode);
  el.classList.toggle("negara-salah", ket.salah);
  el.title = ket.judul;
  const kecil = el.parentElement && el.parentElement.querySelector(".negara-nama");
  if (kecil) kecil.textContent = ket.teks;
}

function bakukanIsianNegara(el, idx) {
  const teks = el.value.trim();
  const nilai = kodeNegara(teks) || teks.toUpperCase();
  if (el.value !== nilai) el.value = nilai;
  if (draftItems[idx]) draftItems[idx].negaraAsal = nilai;
  tulisKeteranganNegara(el, nilai);
}

function renderItemTable() {
  // Penanda kelengkapan & tinggi isian barang ikut diperbarui tiap tabel
  // digambar ulang — termasuk setelah data hasil impor masuk.
  setTimeout(() => {
    if (typeof syncFormValidity === "function") syncFormValidity();
    amatiTabelBarang();
    requestAnimationFrame(autoGrowAllItemNames);
  }, 0);
  const kolom = kolomIsianBarang();
  const tbody = $("#itemTableBody");
  tbody.innerHTML = draftItems
    .map((it, idx) => {
      const mainRow = `
    <tr data-idx="${idx}">
      <td class="seri-col" data-label="${escapeAttr(t("f.seri"))}" title="${tt("Nomor urut barang, mengikuti urutan baris", "Item sequence number, follows the row order")}">${idx + 1}</td>
      <td data-label="HS Code">
        <div class="hscode-cell">
          <input type="text" data-f="hsCode" value="${escapeAttr(it.hsCode)}" placeholder="00000000" inputmode="numeric" aria-label="HS Code"${
            it._hsOtomatis ? ` class="hs-otomatis" title="${escapeAttr(judulHsOtomatis(it._hsOtomatis))}"` : ""
          }>
          <button type="button" class="hscode-lookup-btn${it._hsSaran ? " is-saran" : ""}" data-hscode-lookup="${idx}" title="${escapeAttr(judulTombolCariHs(it))}" aria-label="${escapeAttr(judulTombolCariHs(it))}">
            <i class="bi bi-search" aria-hidden="true"></i>
          </button>
        </div>
      </td>
      ${kolom.map(([field, label]) => isianBarangHtml(it, field, label, "", KELAS_KARTU_BARANG[field])).join("")}
      ${isianKondisiHtml(it)}
      ${isianNegaraHtml(it)}
      ${isianBarangHtml(it, "marks", "Marks", tt("otomatis", "auto"), "export-col")}
      <td class="jenis-col" data-label="${escapeAttr(t("f.jenis.barang"))}">
        <select data-f="jenisBarang" aria-label="${escapeAttr(t("f.jenis.barang"))}">
          ${jenisOptionsUntuk(it.jenisBarang).map((o) => `<option value="${o}" ${o === normalisasiJenisBarang(it.jenisBarang) ? "selected" : ""}>${escapeHtml(labelJenisBarang(o))}</option>`).join("")}
        </select>
      </td>
      <td data-label="${escapeAttr(t("f.fasilitas"))}">
        <button type="button" class="btn-facilities ${(it.skb || []).length || piBarangBerlaku(it) ? "has-value" : ""}" data-act="toggle-fac" data-idx="${idx}">
          <span>${facilitiesButtonLabel(it)}</span> <i class="bi bi-chevron-${it._facOpen ? "up" : "down"}"></i>
        </button>
      </td>
      <td data-label="Qty"><input type="text" data-f="qty" value="${formatNumberValue(it.qty)}" inputmode="decimal" aria-label="Qty"></td>
      <td data-label="${escapeAttr(t("f.satuan"))}"><input type="text" data-f="satuan" value="${escapeAttr(it.satuan)}" placeholder="${tt("Satuan", "Unit")}" list="satuanList" aria-label="${escapeAttr(t("f.satuan"))}"></td>
      <td data-label="${escapeAttr(t("f.harga.unit.usd"))}"><div class="input-affix input-affix--tight" data-affix="$"><input type="text" data-f="harga" value="${formatNumberValue(it.harga)}" inputmode="decimal" aria-label="${escapeAttr(t("f.harga.unit.usd"))}"></div></td>
      <td data-label="${escapeAttr(t("f.netto.kg"))}"><input type="text" data-f="netto" value="${formatNumberValue(it.netto)}" inputmode="decimal" aria-label="${escapeAttr(t("f.netto.kg"))}"></td>
      <td data-label="${escapeAttr(t("f.bruto.kg"))}"><input type="text" data-f="bruto" value="${formatNumberValue(it.bruto)}" inputmode="decimal" aria-label="${escapeAttr(t("f.bruto.kg"))}"></td>
      <td class="pkg-cell dim-col" data-label="${escapeAttr(t("f.dimensi"))}">
        <input type="text" data-f="package" value="${escapeAttr(it.package)}" placeholder="P*L*T (cm)" aria-label="${escapeAttr(t("f.dimensi"))}">

      </td>
      <td data-label="${escapeAttr(t("f.kemasan"))}">
        <input type="text" data-f="packing" value="${escapeAttr(it.packing || "")}" aria-label="${escapeAttr(t("f.kemasan"))}"
               placeholder="${idx === 0 ? "1" : tt("↳ ikut", "↳ same")}"
               title="${
                 idx === 0
                   ? t("s.jumlah.kemasan.untuk.barang.ini")
                   : t("s.kosongkan.kalau.barang.ini.masih.satu.kemasan.")
               }"
               class="${idx > 0 && !(it.packing || "").trim() ? "is-ikut" : ""}">
      </td>
      <td data-label="${escapeAttr(t("f.jenis.kemasan"))}">
        <input type="text" data-f="packingUnit" value="${escapeAttr(it.packingUnit || "")}" aria-label="${escapeAttr(t("f.jenis.kemasan"))}"
               list="packageUnitList" placeholder="${idx === 0 ? "BOX" : tt("↳ ikut", "↳ same")}"
               class="${idx > 0 && !(it.packing || "").trim() ? "is-ikut" : ""}">
      </td>
      <td class="cbm-col${activeMode === "import" ? " d-none" : ""}" data-label="CBM (m³)">
        <input type="text" class="cbm-readonly" readonly value="${computeItemCbm(it)}" aria-label="CBM (m³)">
      </td>
      <td class="subtotal-col" data-label="${escapeAttr(t("f.subtotal.usd"))}"><input type="text" class="subtotal" readonly value="${fmtUSD(parseLooseNumber(it.qty) * parseLooseNumber(it.harga))}" aria-label="${escapeAttr(t("f.subtotal.usd"))}"></td>
      <td class="hapus-col"><button type="button" class="rm-row" data-idx="${idx}" title="${tt("Hapus barang ini", "Remove this item")}" aria-label="${tt("Hapus barang ini", "Remove this item")}"><i class="bi bi-x-lg" aria-hidden="true"></i></button></td>
    </tr>`;
      return mainRow + (it._facOpen ? facilitiesPanelHtml(it, idx) : "");
    })
    .join("");
  tbody.querySelectorAll("textarea.isian-barang").forEach(autoGrowTextarea);
  tbody
    .querySelectorAll('.pkg-cell input[data-f="package"]')
    .forEach((el) => autoSizeInput(el, 96, 210));
  recalcCustoms();
  // Tawaran "Samakan … ke baris 2–N?" & Urungkan (item-samakan.js) mengikuti isi tabel
  if (typeof perbaruiTawaranSamakan === "function") perbaruiTawaranSamakan();
}
$("#itemTableBody").addEventListener("input", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const field = e.target.dataset.f;
  /* DIRAPIKAN DULU, BARU DIBACA.

     Kotak angka di tabel ini dirapikan oleh pendengar di `document`
     (number-input.js), sementara pendengar ini menempel di
     #itemTableBody. Pendengar elemen SELALU berjalan lebih dulu
     daripada pendengar document, jadi yang terbaca di sini adalah teks
     yang BELUM dirapikan — lalu kotaknya berubah sesaat kemudian.

     Selama keduanya terbaca sama, tidak ada yang terasa. Tapi tidak
     selalu sama:

       ketik "11319"
         setelah 4 huruf kotak jadi "1,131"
         huruf ke-5 membuat teks mentahnya "1,1319"
         yang TERSIMPAN  : parseLooseNumber("1,1319") = 1,1319
         yang TERTULIS   : "11,319"                   = 11.319

     Selisihnya sepuluh ribu kali. Kotaknya menulis 11.319, Subtotal
     menghitung dari 1,1319 — dan yang ikut ke Invoice, PIB, serta
     perhitungan bea masuk adalah angka yang tersimpan, bukan yang
     terbaca di layar.

     Merapikan lebih dulu di sini membuat keduanya PASTI angka yang
     sama. applyLiveNumberFormat aman dipanggil dua kali: kalau tidak
     ada yang berubah ia langsung keluar. */
  if (["qty", "harga", "netto", "bruto"].includes(field) &&
      typeof applyLiveNumberFormat === "function") {
    applyLiveNumberFormat(e.target);
  }
  /* ISIAN BARANG SELALU HURUF BESAR (ISIAN_BARANG_KAPITAL).

     Dirapikan SEBELUM dibaca, dengan alasan yang sama seperti angka di
     atas: kalau diubah sesudahnya, yang tersimpan huruf kecil sementara
     yang tertulis huruf besar.

     Berlaku untuk ketikan MAUPUN tempelan — kejadian `input` menyala
     untuk keduanya, jadi tidak perlu penangan `paste` tersendiri.
     Justru tempelan yang paling butuh: nama yang disalin dari invoice
     pemasok datang dengan huruf campur, dan "Tyre Mold" dengan "TYRE
     MOLD" terhitung dua barang berbeda saat dikelompokkan di laporan. */
  if (ISIAN_BARANG_KAPITAL.has(field) && typeof jadikanHurufBesar === "function") {
    jadikanHurufBesar(e.target);
  }
  if (field) {
    if (field === "hsCode") {
      // Requirement A: HS Code disimpan sebagai ANGKA saja
      const cleaned = normalizeHsCodeInput(e.target.value);
      if (e.target.value !== cleaned) e.target.value = cleaned;
      draftItems[idx][field] = cleaned;
    } else {
      /* parseInputNumber, BUKAN parseLooseNumber.

         Isi kotak ini bentuknya ditulis aplikasi sendiri (koma =
         ribuan, titik = desimal), jadi tidak ada yang perlu ditebak.
         parseLooseNumber menebak, dan tebakannya salah seribu kali
         lipat untuk "1.050" — berat 1,05 kg tersimpan jadi 1.050 kg. */
      draftItems[idx][field] = ["qty", "harga", "netto", "bruto"].includes(field)
        ? parseInputNumber(e.target.value)
        : e.target.value;
    }
    if (e.target.tagName === "TEXTAREA") autoGrowTextarea(e.target);
    // Saran yang dipilih / kode yang diketik langsung bernama; ketikan lain dibakukan saat ditinggalkan
    if (field === "negaraAsal") tulisKeteranganNegara(e.target, kodeNegara(e.target.value));
    if (field === "package") {
      autoSizeInput(e.target, 96, 210);
      // Peringatan format ditaruh di tooltip + kelas penanda
      const warn = packageWarnTitle(draftItems[idx]);
      e.target.title = warn;
      e.target.classList.toggle("pkg-invalid", !!warn);
    }
    const subtotalInput = tr.querySelector(".subtotal");
    subtotalInput.value = fmtUSD(
      parseInputNumber(draftItems[idx].qty) * parseInputNumber(draftItems[idx].harga),
    );
    // CBM dipengaruhi package (dimensi) MAUPUN qty
    const cbmInput = tr.querySelector(".cbm-readonly");
    if (cbmInput) cbmInput.value = computeItemCbm(draftItems[idx]);
    recalcCustoms();
    return;
  }
  // Field fasilitas (nomor/tanggal/jenisLainnya per entri SKB/COO) & No. item di PI
  const fac = e.target.dataset.fac;
  if (!fac) return;
  if (fac === "piNoItem") {
    draftItems[idx].piNoItem = e.target.value.trim();
    const label = tr.parentElement.querySelector(`tr[data-idx="${idx}"]:not(.item-fac-row) [data-act="toggle-fac"] span`);
    if (label) label.textContent = facilitiesButtonLabel(draftItems[idx]);
    return;
  }
  const skIdxAttr = e.target.dataset.skidx;
  if (skIdxAttr !== undefined) {
    const entry = draftItems[idx].skb[Number(skIdxAttr)];
    if (
      entry &&
      (fac === "nomor" || fac === "tanggal" || fac === "jenisLainnya")
    ) {
      entry[fac] = e.target.value;
    }
  }
});

// Enter di kotak isian (bukan tombol) -> pindah ke field YANG SAMA di baris BERIKUTNYA
$("#itemTableBody").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return;
  const field = e.target.closest("[data-f]");
  if (!field) return;
  const idx = Number(field.closest("tr").dataset.idx);
  /* Kotak bersaran (datalist: Kode Negara Asal, Satuan, Jenis
     Kemasan): Enter yang sama memasang saran yang dipilih -- bawaannya
     tidak dicegah dan pindahnya ditunda sesaat, sesudah sarannya
     terpasang (sama dengan fokus.js). */
  if (field.list) {
    setTimeout(() => keBarisBerikutnya(field, idx), 0);
    return;
  }
  e.preventDefault();
  keBarisBerikutnya(field, idx);
});

function keBarisBerikutnya(field, idx) {
  if (field.dataset.f === "negaraAsal") bakukanIsianNegara(field, idx);

  /* DI BARIS TERAKHIR, Enter MENAMBAH barang baru.

     Mengisi daftar barang berarti menyalin pos demi pos dari dokumen;
     berhenti di baris terakhir memaksa meraih tetikus untuk menekan
     "Tambah Barang" lalu kembali mengetik. Kalau masih ada baris di
     bawahnya, Enter tetap sekadar berpindah -- menyisipkan baris baru
     di tengah daftar bukan yang dimaksud. */
  if (idx === draftItems.length - 1) {
    draftItems.push(newItem());
    /* Chrome menembakkan `change` dari kotak yang dilepas selagi tabel
       digambar ulang; itu tidak boleh menawarkan "samakan" ke baris
       yang justru lahir dari Enter ini (item-samakan.js). */
    if (typeof tanpaTawaranSamakan === "function") tanpaTawaranSamakan(renderItemTable);
    else renderItemTable();
  }

  const nextRow = $(
    `#itemTableBody tr[data-idx="${idx + 1}"]:not(.item-fac-row)`,
  );
  if (!nextRow) return;
  const nextField = nextRow.querySelector(`[data-f="${field.dataset.f}"]`);
  if (!nextField) return;
  nextField.focus();
  if (typeof nextField.select === "function") nextField.select();
}

$("#itemTableBody").addEventListener("change", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  /* Isian BARIS PERTAMA selesai diisi -> tawarkan menyamakannya ke baris
     di bawahnya (item-samakan.js; baris lain & kolom lain diabaikan di
     sana). Untuk negara, SESUDAH dibakukan ke kodenya. */
  const f = e.target.dataset.f;
  if (f === "negaraAsal") {
    bakukanIsianNegara(e.target, idx);
    if (typeof tawarkanSamakan === "function") tawarkanSamakan(f, idx);
    return;
  }
  if (f) {
    if (f === "kondisiBarang") {
      const tanpaPi = $(`select[data-fac="piNomor"][data-idx="${idx}"] option[value=""]`);
      if (tanpaPi) tanpaPi.textContent = labelTanpaPi(draftItems[idx]);
    }
    if (typeof tawarkanSamakan === "function") tawarkanSamakan(f, idx);
    return;
  }
  const fac = e.target.dataset.fac;
  if (fac === "piNomor") {
    const it = draftItems[idx];
    if (it.piNomor !== e.target.value) it.piNoItem = "";
    it.piNomor = e.target.value;
    renderItemTable();
    if (it.piNomor) fokuskan($(`input[data-fac="piNoItem"][data-idx="${idx}"]`));
    // PI baris 1 -> tawarkan ke barang lain yang belum ber-PI (item-samakan.js)
    if (typeof tawarkanSamakan === "function") tawarkanSamakan("piNomor", idx);
    return;
  }
  if (fac === "jenis") {
    const skIdx = Number(e.target.dataset.skidx);
    const entry = draftItems[idx].skb[skIdx];
    if (!entry) return;
    entry.jenis = e.target.value;
    renderItemTable();
    if (entry.jenis === "Lainnya" || entry.jenis === "E-COO") {
      const focusField = entry.jenis === "Lainnya" ? "jenisLainnya" : "nomor";
      const target = $(
        `input[data-fac="${focusField}"][data-idx="${idx}"][data-skidx="${skIdx}"]`,
      );
      if (target) target.focus();
    }
  }
});

$("#itemTableBody").addEventListener("click", (e) => {
  const rmRow = e.target.closest(".rm-row");
  if (rmRow) {
    if (draftItems.length <= 1) {
      showToast(t("m.minimal.harus.ada.1.barang.dalam.pengiriman.in"), "danger");
      return;
    }
    draftItems.splice(Number(rmRow.dataset.idx), 1);
    renderItemTable();
    return;
  }
  const toggleBtn = e.target.closest("[data-act='toggle-fac']");
  if (toggleBtn) {
    const idx = Number(toggleBtn.dataset.idx);
    draftItems[idx]._facOpen = !draftItems[idx]._facOpen;
    renderItemTable();
    return;
  }
  const addSkbBtn = e.target.closest(".btn-add-skb");
  if (addSkbBtn) {
    const idx = Number(addSkbBtn.dataset.idx);
    draftItems[idx].skb.push(newSkbEntry());
    renderItemTable();
    const newSkIdx = draftItems[idx].skb.length - 1;
    const target = $(
      `input[data-fac="nomor"][data-idx="${idx}"][data-skidx="${newSkIdx}"]`,
    );
    if (target) target.focus();
    return;
  }
  const rmSkbBtn = e.target.closest(".rm-skb");
  if (rmSkbBtn) {
    const idx = Number(rmSkbBtn.dataset.idx);
    const skIdx = Number(rmSkbBtn.dataset.skidx);
    draftItems[idx].skb.splice(skIdx, 1);
    renderItemTable();
  }
});

$("#btnAddItem").addEventListener("click", () => {
  draftItems.push(newItem());
  renderItemTable();
  // Baris baru langsung siap diisi nama barangnya
  fokuskan($(`#itemTableBody tr[data-idx="${draftItems.length - 1}"]:not(.item-fac-row) [data-f="namaBarang"]`));
});
