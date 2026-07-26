"use strict";

/* ==================================================================
   ITEM TABLE (draft, inside modal)
   Kolom "Fasilitas" membuka panel per-barang (baris tambahan, penuh
   lebar) berisi 1 daftar fasilitas per barang, jumlahnya bebas (0, 1,
   2, atau lebih). E-COO cuma salah satu "jenis" yang bisa dipilih di
   situ (sama seperti BM/PPN/PPH/Masterlist/Lainnya) — bukan blok
   terpisah lagi, karena secara input keduanya memang sama: pilih
   jenis, isi nomor & tanggal dokumen. Re-render penuh hanya untuk
   perubahan STRUKTUR (buka/tutup panel, tambah/hapus entri, ganti
   jenis) — mengetik di nomor/tanggal memutasi draftItems langsung
   tanpa render ulang, supaya fokus tidak hilang (pola yang sama
   dipakai di seluruh tabel barang & stop transit).
================================================================== */
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

// Hint kecil di bawah input Kemasan (kolom per barang) — SEKARANG
// CUMA peringatan kalau isinya tidak bisa dibaca, bukan lagi
// nampilin hasil hitung (m³/Jumlah-nya sudah ada kolom CBM readonly
// sendiri di sebelah kanan — lihat renderItemTable()). Kosong total
// kalau field Kemasan belum diisi user sama sekali.
// Requirement C: "Hilangkan hint/warning berwarna merah yang muncul saat
// input di suatu field menyebabkan field tersebut naik/bergeser ke atas."
// Teks peringatan di BAWAH input bikin tinggi baris berubah begitu user
// mengetik, sehingga seluruh baris (dan kursor) melompat. Peringatannya
// tidak dihapus total — dipindah jadi atribut title (tooltip) + kelas
// penanda di input-nya sendiri, yang TIDAK memengaruhi tata letak.
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

// Textarea "Nama Barang" tumbuh otomatis mengikuti isinya (dipanggil
// tiap render tabel & tiap kali user ngetik) — supaya nama panjang
// wrap ke bawah dengan rapi, bukan discroll horizontal atau kepotong.
function autoGrowTextarea(el) {
  el.style.height = "auto";
  // TANPA batas atas: nama barang bisa sangat panjang ("TYRE MOLD FULL
  // SET NOKIAN ENTRUST 215/55R18") dan harus kebaca UTUH. Dulu ada
  // max-height + overflow-y:auto di CSS, jadi nama panjang tetap
  // kepotong & harus discroll di dalam kotak yang sempit.
  el.style.height = `${el.scrollHeight}px`;
}


function renderItemTable() {
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
      <td><input type="text" data-f="harga" value="${formatNumberValue(it.harga)}" inputmode="decimal"></td>
      <td><input type="text" data-f="netto" value="${formatNumberValue(it.netto)}" inputmode="decimal"></td>
      <td><input type="text" data-f="bruto" value="${formatNumberValue(it.bruto)}" inputmode="decimal"></td>
      <td class="pkg-cell">
        <input type="text" data-f="package" value="${escapeAttr(it.package)}" placeholder="${activeMode === "import" ? "1 PKG" : "82*82*75"}">

      </td>
      <td class="cbm-col text-center ${activeMode === "import" ? "d-none" : ""}">
        <input type="text" class="cbm-readonly" readonly value="${computeItemCbm(it)}">
      </td>
      <td><input type="text" class="subtotal" readonly value="${fmtUSD((Number(it.qty) || 0) * (Number(it.harga) || 0))}"></td>
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
      // Requirement A: HS Code disimpan sebagai ANGKA saja — titik &
      // strip dari hasil paste manual ("8480.71-0000") dibuang seketika,
      // termasuk memperbaiki isi kotaknya supaya yang dilihat user sama
      // dengan yang tersimpan. Posisi kursor dijaga di ujung teks agar
      // pengetikan berurutan tidak melompat-lompat.
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
      // Peringatan format ditaruh di tooltip + kelas penanda, BUKAN
      // sebagai elemen baru di bawah input (yang dulu bikin baris
      // bergeser tiap kali user mengetik).
      const warn = packageWarnTitle(draftItems[idx]);
      e.target.title = warn;
      e.target.classList.toggle("pkg-invalid", !!warn);
    }
    const subtotalInput = tr.querySelector(".subtotal");
    subtotalInput.value = fmtUSD(
      (Number(draftItems[idx].qty) || 0) * (Number(draftItems[idx].harga) || 0),
    );
    // CBM dipengaruhi package (dimensi) MAUPUN qty, jadi dihitung ulang
    // tiap ada perubahan field apapun di baris ini — sama seperti pola
    // subtotal di atas, bukan cuma waktu field package yang diketik.
    const cbmInput = tr.querySelector(".cbm-readonly");
    if (cbmInput) cbmInput.value = computeItemCbm(draftItems[idx]);
    recalcCustoms();
    return;
  }
  // Field fasilitas (nomor/tanggal/jenisLainnya per entri SKB/E-COO):
  // mutasi langsung ke draftItems TANPA render ulang, supaya fokus/cursor
  // tidak hilang saat mengetik.
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
