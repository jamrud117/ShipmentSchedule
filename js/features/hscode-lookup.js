"use strict";

/* CARI HS CODE DARI DATABASE (hs_code_master), dari kolom HS Code di
   Daftar Barang -- Import maupun Export, tombol yang sama.

   hsCodeRows & pastikanHsCodeTermuat() datang dari hscode-view.js --
   dipakai APA ADANYA di sini (bukan query terpisah), supaya membuka
   popover ini berulang kali tidak menghajar Supabase tiap kali. */

let hscodeLookupUntukIdx = null;

function tutupHscodeLookup() {
  const pop = $("#hscodeLookupPop");
  if (pop) pop.classList.add("d-none");
  hscodeLookupUntukIdx = null;
}

function renderHscodeLookupResults(daftar) {
  const box = $("#hscodeLookupResults");
  if (!box) return;
  if (!daftar.length) {
    box.innerHTML = `<div class="hscode-lookup-empty">
      ${hsCodeRows.length ? t("s.tidak.ada.yang.cocok") : tt("Database HS Code masih kosong — tambahkan lewat menu HS Code.", "The HS Code database is empty — add entries from the HS Code menu.")}
    </div>`;
    return;
  }
  box.innerHTML = daftar
    .map(
      (r) => `
      <button type="button" class="hscode-lookup-item" data-hscode-pick="${escapeAttr(r.hs_code)}">
        <span class="hscode-lookup-item-name">${escapeHtml(r.item_name)}</span>
        <span class="hscode-lookup-item-code">${escapeHtml(r.hs_code)}</span>
      </button>`,
    )
    .join("");
}

function saringHscodeLookup() {
  const q = ($("#hscodeLookupInput").value || "").trim().toLowerCase();
  const daftar = !q
    ? hsCodeRows
    : hsCodeRows.filter((r) => (r.item_name || "").toLowerCase().includes(q));
  renderHscodeLookupResults(daftar);
}

async function bukaHscodeLookup(idx, tombol) {
  hscodeLookupUntukIdx = idx;
  const pop = $("#hscodeLookupPop");
  const input = $("#hscodeLookupInput");
  if (!pop || !input) return;

  // Diposisikan DI BAWAH tombolnya, rata kiri -- geser ke kiri sendiri
  // kalau lebarnya (320px) akan meluber dari tepi kanan jendela.
  const r = tombol.getBoundingClientRect();
  const lebarPop = 320;
  let kiri = r.left;
  if (kiri + lebarPop > window.innerWidth - 8) kiri = window.innerWidth - lebarPop - 8;
  pop.style.top = r.bottom + 6 + "px";
  pop.style.left = Math.max(8, kiri) + "px";

  pop.classList.remove("d-none");
  input.value = "";
  input.focus();
  renderHscodeLookupResults(hsCodeRows);

  /* SELALU DISEGARKAN SAAT DIBUKA, bukan cuma saat masih kosong.

     HS Code sering ditambah dari tab lain (satu tab untuk jadwal, satu
     untuk database HS Code) atau dari perangkat orang lain. Daftar yang
     dimuat sekali lalu dipegang terus membuat kode yang baru ditambah
     tidak pernah muncul di sini sampai halamannya dimuat ulang -- dan
     dari sisi pengguna itu terbaca sebagai "kodenya tidak tersimpan".

     Yang sudah ada tetap ditampilkan selama pengambilan berjalan, jadi
     tidak ada kedipan; hasilnya disaring ulang begitu datang, siapa
     tahu pengguna sudah sempat mengetik. */
  const segarkan =
    typeof segarkanHsCodeDiam === "function"
      ? segarkanHsCodeDiam()
      : pastikanHsCodeTermuat();
  await segarkan;
  if (hscodeLookupUntukIdx === idx) saringHscodeLookup();
}

const itemTableBodyElHscode = $("#itemTableBody");
if (itemTableBodyElHscode) {
  itemTableBodyElHscode.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-hscode-lookup]");
    if (!tombol) return;
    e.preventDefault();
    bukaHscodeLookup(Number(tombol.dataset.hscodeLookup), tombol);
  });
}

const hscodeLookupInputEl = $("#hscodeLookupInput");
if (hscodeLookupInputEl) hscodeLookupInputEl.addEventListener("input", saringHscodeLookup);

const hscodeLookupResultsEl = $("#hscodeLookupResults");
if (hscodeLookupResultsEl) {
  hscodeLookupResultsEl.addEventListener("click", (e) => {
    const item = e.target.closest("[data-hscode-pick]");
    if (!item || hscodeLookupUntukIdx == null) return;
    const idx = hscodeLookupUntukIdx;
    draftItems[idx].hsCode = item.dataset.hscodePick;
    tutupHscodeLookup();
    renderItemTable();
  });
}

document.addEventListener("click", (e) => {
  const pop = $("#hscodeLookupPop");
  if (!pop || pop.classList.contains("d-none")) return;
  if (pop.contains(e.target) || e.target.closest("[data-hscode-lookup]")) return;
  tutupHscodeLookup();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") tutupHscodeLookup();
});
