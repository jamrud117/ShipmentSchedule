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
  // kalau lebarnya (320px, menyempit di layar < 336px; form.css) akan
  // meluber dari tepi kanan jendela.
  const r = tombol.getBoundingClientRect();
  const lebarPop = Math.min(320, window.innerWidth - 16);
  let kiri = r.left;
  if (kiri + lebarPop > window.innerWidth - 8) kiri = window.innerWidth - lebarPop - 8;
  pop.style.top = r.bottom + 6 + "px";
  pop.style.left = Math.max(8, kiri) + "px";

  pop.classList.remove("d-none");
  // Nama barang yang cocok dengan beberapa kode: pencariannya langsung dengan nama itu
  const it = draftItems[idx];
  input.value = (it && it._hsSaran) || "";
  input.focus();
  saringHscodeLookup();

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
    const it = draftItems[idx];
    it.hsCode = item.dataset.hscodePick;
    // Dipilih sendiri: bukan isian otomatis lagi
    delete it._hsOtomatis;
    delete it._hsSaran;
    tutupHscodeLookup();
    renderItemTable();
    // Dipilih lewat pencarian, bukan diketik: tidak ada kejadian `change`, jadi ditawarkan di sini
    if (typeof tawarkanSamakan === "function") tawarkanSamakan("hsCode", idx);
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

/* ------------------------------------------------------------------
   HS CODE OTOMATIS DARI NAMA BARANG

   Nama barang yang diketik (Uraian, juga Tipe) dicocokkan dengan Database
   HS Code -- aturan yang sama dengan impor CIPL (hsDatabaseUntukBarang,
   hscode-view.js): nama di database yang termuat utuh di nama barang
   ("SIPE" di "SIPES BLADE 0.4T", "MASTER MODEL" di "MASTER MODEL
   225/45R17"), yang terpanjang menang. Begitu cocok, HS Code baris itu
   terisi -- tanpa menunggu kotaknya ditinggalkan.

     - Hanya HS Code yang KOSONG atau masih isian otomatis
       (it._hsOtomatis = nama di database yang cocok). Kode yang diketik
       sendiri, dipilih lewat pencarian, disamakan, atau datang dari
       berkas impor tidak pernah ditimpa.
     - Nama yang tidak lagi cocok mencabut kode otomatisnya -- kode itu
       milik nama yang lama.
     - Beberapa nama setara berbeda kode = tidak menebak: tombol cari
       ditandai (it._hsSaran) dan pencariannya dibuka dengan nama itu.
     - Kotaknya ditandai (.hs-otomatis, keterangan di tooltip); mengetik
       di kotak HS Code menjadikannya isian sendiri.
   Kotak HS Code & tombol cari baris itu saja yang ditulis ulang -- tabel
   tidak digambar ulang, kursor di Uraian tidak terganggu.
------------------------------------------------------------------ */
const HS_OTOMATIS_JEDA = 250;
let timerHsOtomatis = null;
const hsOtomatisTertunda = new Set(); // objek barang yang namanya baru diubah

/* Satu barang. Hasil: ada yang berubah. Database harus sudah termuat. */
function hsOtomatisBarang(it) {
  const sebelum = [it.hsCode, it._hsOtomatis, it._hsSaran].join("|");
  if (normalizeHsCodeInput(it.hsCode || "") && !it._hsOtomatis) {
    delete it._hsSaran;
  } else {
    const hasil = hsDatabaseUntukBarang(it.namaBarang, it.tipe);
    delete it._hsSaran;
    if (hasil && hasil.kode) {
      it.hsCode = hasil.kode;
      it._hsOtomatis = hasil.label;
    } else {
      if (it._hsOtomatis) it.hsCode = "";
      delete it._hsOtomatis;
      if (hasil && hasil.kandidat) it._hsSaran = hasil.cari;
    }
  }
  return sebelum !== [it.hsCode, it._hsOtomatis, it._hsSaran].join("|");
}

// Tanda di kotak HS Code & tombol cari -- sama dengan yang dirakit renderItemTable (item-table.js)
function tandaiHsOtomatis(tr, it) {
  const kotak = tr.querySelector('[data-f="hsCode"]');
  if (kotak) {
    if (kotak.value !== String(it.hsCode || "")) kotak.value = it.hsCode || "";
    kotak.classList.toggle("hs-otomatis", !!it._hsOtomatis);
    if (it._hsOtomatis) kotak.title = judulHsOtomatis(it._hsOtomatis);
    else kotak.removeAttribute("title");
  }
  const tombol = tr.querySelector("[data-hscode-lookup]");
  if (tombol) {
    tombol.classList.toggle("is-saran", !!it._hsSaran);
    tombol.title = judulTombolCariHs(it);
    tombol.setAttribute("aria-label", tombol.title);
  }
}

function jalankanHsOtomatis() {
  timerHsOtomatis = null;
  const barang = [...hsOtomatisTertunda];
  hsOtomatisTertunda.clear();
  let berubah = false;
  barang.forEach((it) => {
    const idx = draftItems.indexOf(it);
    if (idx < 0 || !hsOtomatisBarang(it)) return;
    berubah = true;
    const tr = $(`#itemTableBody tr[data-idx="${idx}"]:not(.item-fac-row)`);
    if (tr) tandaiHsOtomatis(tr, it);
  });
  if (berubah && typeof syncFormValidity === "function") syncFormValidity();
}

// Nama barang `it` berubah: dicocokkan sesaat lagi (sekali untuk ketikan beruntun)
function jadwalkanHsOtomatis(it) {
  if (!it) return;
  hsOtomatisTertunda.add(it);
  clearTimeout(timerHsOtomatis);
  timerHsOtomatis = setTimeout(async () => {
    // Database belum pernah dimuat (form dibuka langsung): dimuat dulu, tanpa menggambar halaman HS Code
    if (!hsCodeRows.length && !(await hsCodeSiap())) {
      hsOtomatisTertunda.clear();
      return;
    }
    jalankanHsOtomatis();
  }, HS_OTOMATIS_JEDA);
}

if (itemTableBodyElHscode) {
  // Database disiapkan begitu tabel barang mulai dipakai -- pencocokan pertama tidak menunggu jaringan
  itemTableBodyElHscode.addEventListener("focusin", () => {
    if (!hsCodeRows.length) hsCodeSiap();
  });
  itemTableBodyElHscode.addEventListener("input", (e) => {
    const f = e.target.dataset.f;
    const tr = e.target.closest("tr[data-idx]");
    const it = tr && draftItems[Number(tr.dataset.idx)];
    if (!it) return;
    if (f === "namaBarang" || f === "tipe") jadwalkanHsOtomatis(it);
    else if (f === "hsCode" && (it._hsOtomatis || it._hsSaran)) {
      // Diketik sendiri: bukan isian otomatis lagi
      delete it._hsOtomatis;
      if (normalizeHsCodeInput(e.target.value)) delete it._hsSaran;
      tandaiHsOtomatis(tr, it);
    }
  });
}
