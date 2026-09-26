"use strict";

/* ITEM TABLE (draft, inside modal) */
function skbEntryLabel(sk) {
  if (sk.jenis === "Lainnya")
    return (sk.jenisLainnya || "").trim() || tt("Lainnya", "Other");
  return sk.jenis;
}

function facilitiesButtonLabel(it) {
  const list = it.skb || [];
  if (!list.length) return tt("Fasilitas", "Facility");
  const ecooCount = list.filter((sk) => sk.jenis === "E-COO").length;
  const skbCount = list.length - ecooCount;
  const parts = [];
  if (skbCount) parts.push(`SKB ${skbCount}`);
  if (ecooCount) parts.push("E-COO");
  return parts.join(" · ");
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
            ${SKB_TYPE_OPTIONS.map((o) => `<option value="${o}" ${o === sk.jenis ? "selected" : ""}>${o === "Lainnya" ? tt("Lainnya", "Other") : o}</option>`).join("")}
          </select>
          ${
            sk.jenis === "Lainnya"
              ? `<input type="text" class="skb-lainnya" data-fac="jenisLainnya" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.jenisLainnya)}" placeholder="${tt("Sebutkan jenisnya", "Specify the type")}">`
              : ""
          }
          <input type="text" data-fac="nomor" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.nomor)}" placeholder="${sk.jenis === "E-COO" ? tt("Nomor E-COO", "E-COO number") : tt("Nomor SKB", "SKB number")}">
          <input type="date" data-fac="tanggal" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.tanggal)}">
          <button type="button" class="rm-skb" data-idx="${idx}" data-skidx="${skIdx}" title="${tt("Hapus fasilitas ini", "Remove this facility")}"><i class="bi bi-x-lg"></i></button>
        </div>`,
        )
        .join("")
    : `<div class="item-fac-empty">${t("c.belum.ada.fasilitas.untuk.barang.ini")}</div>`;

  return `
    <tr class="item-fac-row" data-idx="${idx}">
      <td colspan="15">
        <div class="item-fac-panel">
          <div class="item-fac-skb-head">
            <b>${tt("Fasilitas (SKB &amp; E-COO)", "Facilities (SKB &amp; E-COO)")}</b>
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

/* Textarea "Nama Barang" tumbuh otomatis mengikuti isinya.

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
    .querySelectorAll("textarea.nama-barang-input")
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
  if (el && el.matches && el.matches("textarea.nama-barang-input")) {
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
      .querySelectorAll("textarea.nama-barang-input")
      .forEach(autoGrowTextarea);
  });
}

function renderItemTable() {
  // Penanda kelengkapan & tinggi nama barang ikut diperbarui tiap tabel
  // digambar ulang — termasuk setelah data hasil impor masuk.
  setTimeout(() => {
    if (typeof syncFormValidity === "function") syncFormValidity();
    amatiTabelBarang();
    requestAnimationFrame(autoGrowAllItemNames);
  }, 0);
  /* Header kolom pertama: "Uraian" di Export (dipasangkan dengan
     kolom Size di sebelahnya), "Nama Barang" di Import (field yang
     SAMA, cuma labelnya beda -- tidak ada kolom Size di Import, jadi
     tidak perlu dipisah). */
  const thNama = $("#thNamaBarang");
  if (thNama) thNama.textContent = activeMode === "export" ? tt("Uraian", "Description") : t("c.nama.barang");
  const tbody = $("#itemTableBody");
  tbody.innerHTML = draftItems
    .map((it, idx) => {
      const mainRow = `
    <tr data-idx="${idx}">
      <td class="seri-col text-center" title="${tt("Nomor urut barang, mengikuti urutan baris", "Item sequence number, follows the row order")}">${idx + 1}</td>
      <td class="namabarang-col"><textarea rows="1" class="nama-barang-input" data-f="namaBarang" placeholder="${activeMode === "export" ? tt("Uraian barang", "Item description") : tt("Nama barang", "Item name")}">${escapeHtml(it.namaBarang)}</textarea></td>
      <td class="size-col"><input type="text" data-f="size" placeholder="Size" value="${escapeAttr(it.size)}"></td>
      <td class="export-col"><input type="text" data-f="pattern" placeholder="Pattern" value="${escapeAttr(it.pattern)}"></td>
      <td class="export-col"><input type="text" data-f="moldNo" placeholder="Mold No." value="${escapeAttr(it.moldNo)}"></td>
      <td class="export-col"><input type="text" data-f="poNo" placeholder="PO No." value="${escapeAttr(it.poNo)}"></td>
      <td class="export-col"><input type="text" data-f="marks" placeholder="otomatis" value="${escapeAttr(it.marks)}"></td>
      <td>
        <div class="hscode-cell">
          <input type="text" data-f="hsCode" value="${escapeAttr(it.hsCode)}" placeholder="00000000" inputmode="numeric">
          <button type="button" class="hscode-lookup-btn" data-hscode-lookup="${idx}" title="${escapeAttr(t("s.cari.hs.code.dari.database.berdasarkan.nama.ba"))}">
            <i class="bi bi-search"></i>
          </button>
        </div>
      </td>
      <td>
        <select data-f="jenisBarang">
          ${jenisOptionsUntuk(it.jenisBarang).map((o) => `<option value="${o}" ${o === normalisasiJenisBarang(it.jenisBarang) ? "selected" : ""}>${escapeHtml(labelJenisBarang(o))}</option>`).join("")}
        </select>
      </td>
      <td class="text-center">
        <button type="button" class="btn-facilities ${(it.skb || []).length ? "has-value" : ""}" data-act="toggle-fac" data-idx="${idx}">
          <span>${facilitiesButtonLabel(it)}</span> <i class="bi bi-chevron-${it._facOpen ? "up" : "down"}"></i>
        </button>
      </td>
      <td><input type="text" data-f="qty" value="${formatNumberValue(it.qty)}" inputmode="decimal"></td>
      <td><input type="text" data-f="satuan" value="${escapeAttr(it.satuan)}" placeholder="${tt("Satuan", "Unit")}" list="satuanList"></td>
      <td><div class="input-affix input-affix--tight" data-affix="$"><input type="text" data-f="harga" value="${formatNumberValue(it.harga)}" inputmode="decimal"></div></td>
      <td><input type="text" data-f="netto" value="${formatNumberValue(it.netto)}" inputmode="decimal"></td>
      <td><input type="text" data-f="bruto" value="${formatNumberValue(it.bruto)}" inputmode="decimal"></td>
      <td class="pkg-cell dim-col">
        <input type="text" data-f="package" value="${escapeAttr(it.package)}" placeholder="P*L*T (cm)">

      </td>
      <td>
        <input type="text" data-f="packing" value="${escapeAttr(it.packing || "")}"
               placeholder="${idx === 0 ? "1" : tt("↳ ikut", "↳ same")}"
               title="${
                 idx === 0
                   ? t("s.jumlah.kemasan.untuk.barang.ini")
                   : t("s.kosongkan.kalau.barang.ini.masih.satu.kemasan.")
               }"
               class="${idx > 0 && !(it.packing || "").trim() ? "is-ikut" : ""}">
      </td>
      <td>
        <input type="text" data-f="packingUnit" value="${escapeAttr(it.packingUnit || "")}"
               list="packageUnitList" placeholder="${idx === 0 ? "BOX" : tt("↳ ikut", "↳ same")}"
               class="${idx > 0 && !(it.packing || "").trim() ? "is-ikut" : ""}">
      </td>
      <td class="cbm-col text-center ${activeMode === "import" ? "d-none" : ""}">
        <input type="text" class="cbm-readonly" readonly value="${computeItemCbm(it)}">
      </td>
      <td><input type="text" class="subtotal" readonly value="${fmtUSD(parseLooseNumber(it.qty) * parseLooseNumber(it.harga))}"></td>
      <td><button type="button" class="rm-row" data-idx="${idx}" title="${tt("Hapus barang ini", "Remove this item")}"><i class="bi bi-x-lg"></i></button></td>
    </tr>`;
      return mainRow + (it._facOpen ? facilitiesPanelHtml(it, idx) : "");
    })
    .join("");
  tbody.querySelectorAll(".nama-barang-input").forEach(autoGrowTextarea);
  tbody
    .querySelectorAll('.pkg-cell input[data-f="package"]')
    .forEach((el) => autoSizeInput(el, 96, 210));
  recalcCustoms();
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
  /* NAMA BARANG SELALU HURUF BESAR.

     Dirapikan SEBELUM dibaca, dengan alasan yang sama seperti angka di
     atas: kalau diubah sesudahnya, yang tersimpan huruf kecil sementara
     yang tertulis huruf besar.

     Berlaku untuk ketikan MAUPUN tempelan — kejadian `input` menyala
     untuk keduanya, jadi tidak perlu penangan `paste` tersendiri.
     Justru tempelan yang paling butuh: nama yang disalin dari invoice
     pemasok datang dengan huruf campur, dan "Tyre Mold" dengan "TYRE
     MOLD" terhitung dua barang berbeda saat dikelompokkan di laporan. */
  if (field === "namaBarang" && typeof jadikanHurufBesar === "function") {
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
    if (field === "namaBarang") autoGrowTextarea(e.target);
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
  // Field fasilitas (nomor/tanggal/jenisLainnya per entri SKB/E-COO)
  const fac = e.target.dataset.fac;
  if (!fac) return;
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
  e.preventDefault();
  const row = field.closest("tr");
  const idx = Number(row.dataset.idx);

  /* DI BARIS TERAKHIR, Enter MENAMBAH barang baru.

     Mengisi daftar barang berarti menyalin pos demi pos dari dokumen;
     berhenti di baris terakhir memaksa meraih tetikus untuk menekan
     "Tambah Barang" lalu kembali mengetik. Kalau masih ada baris di
     bawahnya, Enter tetap sekadar berpindah -- menyisipkan baris baru
     di tengah daftar bukan yang dimaksud. */
  if (idx === draftItems.length - 1) {
    draftItems.push(newItem());
    renderItemTable();
  }

  const nextRow = $(
    `#itemTableBody tr[data-idx="${idx + 1}"]:not(.item-fac-row)`,
  );
  if (!nextRow) return;
  const nextField = nextRow.querySelector(`[data-f="${field.dataset.f}"]`);
  if (!nextField) return;
  nextField.focus();
  if (typeof nextField.select === "function") nextField.select();
});

$("#itemTableBody").addEventListener("change", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const fac = e.target.dataset.fac;
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
});
