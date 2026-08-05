"use strict";

/* ITEM TABLE (draft, inside modal) */
function skbEntryLabel(sk) {
  if (sk.jenis === "Lainnya")
    return (sk.jenisLainnya || "").trim() || "Lainnya";
  return sk.jenis;
}

function facilitiesButtonLabel(it) {
  const list = it.skb || [];
  if (!list.length) return "Fasilitas";
  const ecooCount = list.filter((sk) => sk.jenis === "E-COO").length;
  const skbCount = list.length - ecooCount;
  const parts = [];
  if (skbCount) parts.push(`SKB ${skbCount}`);
  if (ecooCount) parts.push("E-COO");
  return parts.join(" · ");
}

function facilitiesPanelHtml(it, idx) {
  const skbList = it.skb || [];
  const skbRowsHtml = skbList.length
    ? skbList
        .map(
          (sk, skIdx) => `
        <div class="item-fac-skb-row">
          <select data-fac="jenis" data-idx="${idx}" data-skidx="${skIdx}">
            ${SKB_TYPE_OPTIONS.map((o) => `<option value="${o}" ${o === sk.jenis ? "selected" : ""}>${o}</option>`).join("")}
          </select>
          ${
            sk.jenis === "Lainnya"
              ? `<input type="text" class="skb-lainnya" data-fac="jenisLainnya" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.jenisLainnya)}" placeholder="Sebutkan jenisnya">`
              : ""
          }
          <input type="text" data-fac="nomor" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.nomor)}" placeholder="${sk.jenis === "E-COO" ? "Nomor E-COO" : "Nomor SKB"}">
          <input type="date" data-fac="tanggal" data-idx="${idx}" data-skidx="${skIdx}" value="${escapeAttr(sk.tanggal)}">
          <button type="button" class="rm-skb" data-idx="${idx}" data-skidx="${skIdx}" title="Hapus fasilitas ini"><i class="bi bi-x-lg"></i></button>
        </div>`,
        )
        .join("")
    : `<div class="item-fac-empty">Belum ada fasilitas untuk barang ini.</div>`;

  return `
    <tr class="item-fac-row" data-idx="${idx}">
      <td colspan="13">
        <div class="item-fac-panel">
          <div class="item-fac-skb-head">
            <b>Fasilitas (SKB &amp; E-COO)</b>
            <button type="button" class="btn-add-skb" data-idx="${idx}"><i class="bi bi-plus-lg"></i> Tambah Fasilitas</button>
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
      ? "Jumlah kemasan tidak terbaca — awali dengan angka, mis. \"5 BOX\"."
      : "";
  }
  return parsePackageDims(raw)
    ? ""
    : "Format dimensi: P*L*T, mis. 82*82*75.";
}

// Textarea "Nama Barang" tumbuh otomatis mengikuti isinya
function autoGrowTextarea(el) {
  el.style.height = "auto";
  // TANPA batas atas: nama barang bisa sangat panjang
  el.style.height = `${el.scrollHeight}px`;
}

/* Menyesuaikan SELURUH kolom nama barang.

   Harus dipanggil setiap kali tabel digambar ulang, TERMASUK setelah
   data hasil impor masuk. Kalau hanya dipanggil saat pengguna
   mengetik, nama panjang dari PDF/Excel tetap terpotong sampai
   kolomnya kebetulan disentuh. */
function autoGrowAllItemNames() {
  document
    .querySelectorAll("textarea.nama-barang-input")
    .forEach(autoGrowTextarea);
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
   baris-baris baru masuk ke tabel, lalu menghitung ulang tingginya —
   inilah sebab nama panjang hasil impor tetap terpotong sebelumnya.

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
  const tbody = $("#itemTableBody");
  tbody.innerHTML = draftItems
    .map((it, idx) => {
      const mainRow = `
    <tr data-idx="${idx}">
      <td><textarea rows="1" class="nama-barang-input" data-f="namaBarang" placeholder="Nama barang">${escapeHtml(it.namaBarang)}</textarea></td>
      <td><input type="text" data-f="hsCode" value="${escapeAttr(it.hsCode)}" placeholder="00000000" inputmode="numeric"></td>
      <td>
        <select data-f="jenisBarang">
          ${JENIS_OPTIONS.map((o) => `<option value="${o}" ${o === it.jenisBarang ? "selected" : ""}>${o}</option>`).join("")}
        </select>
      </td>
      <td class="text-center">
        <button type="button" class="btn-facilities ${(it.skb || []).length ? "has-value" : ""}" data-act="toggle-fac" data-idx="${idx}">
          <span>${facilitiesButtonLabel(it)}</span> <i class="bi bi-chevron-${it._facOpen ? "up" : "down"}"></i>
        </button>
      </td>
      <td><input type="text" data-f="qty" value="${formatNumberValue(it.qty)}" inputmode="decimal"></td>
      <td><input type="text" data-f="satuan" value="${escapeAttr(it.satuan)}" placeholder="KG/PCS/SET" list="satuanList"></td>
      <td><div class="input-affix input-affix--tight" data-affix="$"><input type="text" data-f="harga" value="${formatNumberValue(it.harga)}" inputmode="decimal"></div></td>
      <td><input type="text" data-f="netto" value="${formatNumberValue(it.netto)}" inputmode="decimal"></td>
      <td><input type="text" data-f="bruto" value="${formatNumberValue(it.bruto)}" inputmode="decimal"></td>
      <td class="pkg-cell dim-col">
        <input type="text" data-f="package" value="${escapeAttr(it.package)}" placeholder="82*82*75">

      </td>
      <td>
        <input type="text" data-f="packing" value="${escapeAttr(it.packing || "")}"
               placeholder="${idx === 0 ? "1" : "↳ ikut"}"
               title="${
                 idx === 0
                   ? "Jumlah kemasan untuk barang ini"
                   : "Kosongkan kalau barang ini masih satu kemasan dengan baris di atas"
               }"
               class="${idx > 0 && !(it.packing || "").trim() ? "is-ikut" : ""}">
      </td>
      <td>
        <input type="text" data-f="packingUnit" value="${escapeAttr(it.packingUnit || "")}"
               list="packageUnitList" placeholder="${idx === 0 ? "BOX" : "↳ ikut"}"
               class="${idx > 0 && !(it.packing || "").trim() ? "is-ikut" : ""}">
      </td>
      <td class="cbm-col text-center ${activeMode === "import" ? "d-none" : ""}">
        <input type="text" class="cbm-readonly" readonly value="${computeItemCbm(it)}">
      </td>
      <td><input type="text" class="subtotal" readonly value="${fmtUSD(parseLooseNumber(it.qty) * parseLooseNumber(it.harga))}"></td>
      <td><button type="button" class="rm-row" data-idx="${idx}" title="Hapus barang ini"><i class="bi bi-x-lg"></i></button></td>
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
  if (field) {
    if (field === "hsCode") {
      // Requirement A: HS Code disimpan sebagai ANGKA saja
      const cleaned = normalizeHsCodeInput(e.target.value);
      if (e.target.value !== cleaned) e.target.value = cleaned;
      draftItems[idx][field] = cleaned;
    } else {
      draftItems[idx][field] = ["qty", "harga", "netto", "bruto"].includes(field)
        ? parseLooseNumber(e.target.value)
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
      parseLooseNumber(draftItems[idx].qty) * parseLooseNumber(draftItems[idx].harga),
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
  const nextRow = $(
    `#itemTableBody tr[data-idx="${Number(row.dataset.idx) + 1}"]:not(.item-fac-row)`,
  );
  if (!nextRow) return; // sudah baris terakhir, tidak ada tujuan
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
      showToast("Minimal harus ada 1 barang dalam pengiriman ini.", "danger");
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
