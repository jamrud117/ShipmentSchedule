"use strict";

/* GROUPING BY DATE + FILTER/SORT + MAIN RENDER */
/* Urutan & pengelompokan SELALU memakai sortBasis() di bawah — tidak
   ada pemilih ETA/ETD untuk itu. Saringan rentang tanggal (#filterDateBasis dkk., di bawah dekat
   getFiltered()) sengaja dibuat LEPAS dari urutan/pengelompokan ini —
   filter boleh menyaring ETD sementara daftar tetap terurut menurut
   sortBasis() mode aktif; keduanya operasi yang berbeda. */
/* Label dasar urutan yang ditampilkan di pemisah tanggal.

   Import diurutkan menurut ESTIMATED DELIVERY — itulah tanggal yang
   dijanjikan ke bagian lain, dan yang menentukan kapan sebuah kiriman
   perlu ditindak. ETA hanya tanggal tiba di pelabuhan; masih ada
   clearance dan pengantaran sesudahnya.

   Export tetap menurut Stuffing: yang dikerjakan tim untuk sebuah
   ekspor adalah menyiapkan muatan pada hari itu. */
function sortBasis() {
  return activeMode === "export" ? "stuffing" : "estimasi kirim";
}
/* Label TAMPILAN untuk sortBasis(). Nilai aslinya tetap dipakai sebagai
   kunci (board.js membandingkannya), jadi yang diterjemahkan hanya
   teks yang tampil di kepala kelompok tanggal. */
function sortBasisLabel() {
  return sortBasis() === "stuffing" ? tt("stuffing", "stuffing") : tt("estimasi kirim", "est. delivery");
}
// Selalu menaik: yang paling dekat di paling atas
function sortDirection() {
  return "asc";
}

/* Tanda pisah dibuang supaya "PFSX-260480" dan "PFSX260480" saling
   ketemu. Hanya dipakai sebagai pencocokan CADANGAN — pencarian apa
   adanya tetap dicoba lebih dulu, supaya spasi yang sengaja diketik
   pengguna masih berarti. */
function tanpaPemisah(teks) {
  return String(teks || "").replace(/[\s./_-]+/g, "");
}

/* SARINGAN RENTANG TANGGAL (#filterDateBasis + #filterDateFrom/To)

   Independen dari sortBasis() di atas — lihat komentar di sana. Basis
   ETA/ETD memakai versi EFEKTIF (effectiveEta/effectiveEtd dari
   core/status.js) supaya jadwal yang tanggalnya sudah dimundurkan ikut
   tersaring menurut tanggal BARUNYA, bukan rencana lama. "Estimasi
   Delivery" memakai `actual` apa adanya — kolom itu sendiri sudah
   berarti "Stuffing" di buku Export (lihat MODE_LABELS di config.js). */
function dateRangeBasisValue(s, basis) {
  if (basis === "etd") return effectiveEtd(s);
  if (basis === "actual") return s.actual || "";
  return effectiveEta(s);
}

/* Pencarian menjangkau SEMUA yang terbaca di kartu & panel detail.

   Master/House B/L-AWB WAJIB ikut: nomor itulah yang paling sering
   dipakai mencari, entah dari e-mail forwarder atau dari dokumen di
   tangan. Seluruh kolom barang CEISA ikut dicari (teksCariBarang):
   orang gudang menelusuri kiriman lewat kode barang, tipe, ukuran, atau
   nomor cetakan (Spesifikasi Lain), bukan cuma uraiannya. */
function teksCariJadwal(s) {
  return [
    s.party,
    s.docNo,
    s.noAju,
    s.invoice,
    s.masterBL,
    s.houseBL,
    s.vessel,
    s.voyage,
    s.container,
    s.forwarder,
    s.forwarderPic,
    s.origin,
    s.destination,
    s.incoterm,
    s.muatan,
    s.notes,
    ...(s.items || []).flatMap((i) => teksCariBarang(i).concat(i.hsCode)),
  ]
    .join(" ")
    .toLowerCase();
}

function getFiltered() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const qRapat = tanpaPemisah(q);
  const statusFilter = $("#filterStatus").value;
  const dateBasis = $("#filterDateBasis").value || "actual";
  const dateFrom = $("#filterDateFrom").value;
  const dateTo = $("#filterDateTo").value;
  return currentList().filter((s) => {
    /* Nomor B/L, kontainer, dan HS Code kerap ditulis dengan tanda
       pisah yang berbeda-beda ("PFSX-260480" vs "PFSX260480"), jadi
       pencarian dicocokkan DUA KALI: apa adanya, dan setelah tanda
       baca dibuang di kedua sisi. Teksnya hanya dirakit kalau memang
       ada yang dicari. */
    let matchQ = true;
    if (q) {
      const hay = teksCariJadwal(s);
      matchQ = hay.includes(q) || tanpaPemisah(hay).includes(qRapat);
    }
    const matchStatus = !statusFilter || s.status === statusFilter;

    /* Rentang tanggal. Perbandingan memakai teks ISO (yyyy-mm-dd), yang
       sudah urut secara alfabet, jadi tidak perlu mengurai Date sama
       sekali. Kiriman yang tanggal basisnya belum diisi disembunyikan
       HANYA kalau rentangnya memang sedang dipakai — kalau tidak, ia
       tetap tampil seperti biasa. */
    let matchRange = true;
    if (dateFrom || dateTo) {
      const tgl = dateRangeBasisValue(s, dateBasis);
      if (!tgl) matchRange = false;
      else if (dateFrom && tgl < dateFrom) matchRange = false;
      else if (dateTo && tgl > dateTo) matchRange = false;
    }

    /* "Perlu Tindakan" (Ringkasan/command palette) ikut menyaring di
       sini juga, supaya paginasi, hitungan, dan Bulk Export melihat
       daftar yang sama dengan layar. */
    if (onlyNeedsAction && !needsAction(s)) return false;

    return matchQ && matchStatus && matchRange;
  });
}

/* Label opsi dropdown basis, dipakai juga oleh catatan saringan di
   bawah — supaya teksnya PERSIS sama dengan yang tertulis di
   dropdown-nya sendiri (termasuk "Estimasi Delivery" vs "Stuffing"
   yang berbeda per mode lewat ML().actual). */
function dateRangeBasisLabel(basis) {
  if (basis === "etd") return "ETD";
  if (basis === "actual") return ML().actual;
  return "ETA";
}

function dateRangeSummaryBit() {
  const dateFrom = ($("#filterDateFrom") || {}).value || "";
  const dateTo = ($("#filterDateTo") || {}).value || "";
  if (!dateFrom && !dateTo) return "";
  const basis = ($("#filterDateBasis") || {}).value || "actual";
  const rentang = [dateFrom, dateTo].filter(Boolean).map(fmtDate).join(" s/d ");
  return `${dateRangeBasisLabel(basis)} ${rentang}`;
}

function applyDateRangeClearVisibility() {
  const ada = $("#filterDateFrom").value || $("#filterDateTo").value;
  $("#btnClearDateRange").classList.toggle("d-none", !ada);
}

// Dipakai resetAllFilters() (quick-filters.js) & switchMode() di bawah.
function resetDateRangeFilter() {
  $("#filterDateBasis").value = "actual";
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  applyDateRangeClearVisibility();
}

/* Dipakai halaman Ringkasan (klik satu hari di agenda 7 hari) untuk
   menyaring daftar ke SATU tanggal lewat mekanisme yang sama dengan
   filter rentang di atas, bukan lewat jalur penyaringan tanggal
   terpisah. Saringan status ikut dikosongkan supaya jumlahnya cocok dengan yang dihitung agenda —
   lihat renderAgenda() di views/overview-view.js, basis & syarat
   !isArrived(s)-nya harus sama persis dengan di sini. */
/* Menyaring daftar ke SATU kata kunci -- dipakai dari daftar "Perlu
   Tindakan" di Ringkasan untuk membuka kartu lewat nomor House
   B/L-AWB-nya.

   Saringan lain ikut dilepas (status & rentang tanggal): kiriman yang
   dicari bisa saja berstatus apa pun dan tanggalnya di luar rentang
   yang kebetulan sedang aktif -- kalau tidak dilepas, hasilnya nol
   kartu padahal nomornya jelas ada. */
function jumpToSearch(kataKunci) {
  $("#searchInput").value = kataKunci;
  $("#filterStatus").value = "";
  resetDateRangeFilter();
  if (typeof onlyNeedsAction !== "undefined") onlyNeedsAction = false;
  currentPage = 1;
  syncSearchClear();
  render();
}

function jumpToDateFilter(basis, iso) {
  $("#filterDateBasis").value = basis;
  $("#filterDateFrom").value = iso;
  $("#filterDateTo").value = iso;
  $("#filterStatus").value = "";
  applyDateRangeClearVisibility();
  currentPage = 1;
  render();
}

// Pemisah tanggal & urutan selalu memakai ETA efektif
/* Kunci pengelompokan (jadi pemisah tanggal di layar).

   Untuk yang SUDAH TIBA, yang relevan bukan lagi perkiraan tiba
   melainkan tanggal barang benar-benar masuk pabrik. Kalau tanggal itu
   kosong (ditandai tiba secara manual), dipakai ETA efektifnya. */
function groupKeyOf(s) {
  /* Yang sudah tiba dikelompokkan menurut tanggal KEJADIANNYA:
       Import -> In Factory (barang masuk pabrik)
       Export -> Stuffing   (muatan selesai dinaikkan)
     Estimated Delivery sengaja tidak dipakai — ia perkiraan, dan
     mengurutkan riwayat menurut perkiraan membuat urutannya meleset
     dari kejadian sebenarnya. */
  if (isArrived(s)) {
    const nyata =
      s.mode === "export" ? s.actual : s.factoryDate;
    return nyata || effectiveEta(s) || effectiveEtd(s) || null;
  }

  /* Buku EXPORT diurutkan menurut tanggal STUFFING, bukan ETA.
     Yang dikerjakan tim EXIM untuk sebuah ekspor adalah menyiapkan
     muatan pada hari stuffing; ETA-nya (tiba di pelabuhan pembeli)
     baru urusan berminggu-minggu kemudian dan tidak menuntut apa pun
     dari sisi sini.

     Kolom `actual` di buku Export memang berlabel "Stuffing": selama
     tanggalnya belum tercapai ia berperan sebagai RENCANA, dan begitu
     terlewati jadwalnya otomatis dianggap selesai (lihat isArrived). */
  if (activeMode === "export") {
    return s.actual || effectiveEtd(s) || effectiveEta(s) || null;
  }
  /* IMPORT yang belum tiba: Estimated Delivery.

     `actual` di buku Import berisi Estimated Delivery — hasil mesin
     prediksi saat mode Auto, atau tanggal yang dipatok pengguna saat
     mode Manual. Itulah tanggal yang dijanjikan ke bagian lain.

     Jatuh ke ETA lalu ETD kalau belum ada: jadwal yang baru dibuat
     belum tentu punya perkiraan, dan menaruhnya di kelompok "tanpa
     tanggal" membuatnya hilang dari pandangan. */
  return s.actual || effectiveEta(s) || effectiveEtd(s) || null;
}

/* ------------------------------------------------------------------
   URUTAN DAFTAR

   Dua kelompok, bukan satu deret:

     1. BELUM TIBA  — diurutkan dari tanggal terdekat, karena inilah
                      yang perlu ditindak lebih dulu.
     2. SUDAH TIBA  — ditaruh di belakang seluruhnya, diurutkan dari
                      tanggal tiba TERBARU ke terlama.

   Yang sudah tiba tidak menuntut tindakan, jadi tidak ada gunanya
   ia menyela di tengah daftar hanya karena tanggalnya kebetulan
   berdekatan. Dan begitu dilihat, yang dicari biasanya "yang baru saja
   masuk" — karena itu urutannya dibalik.
------------------------------------------------------------------ */
function groupAndSort(list) {
  const aktif = new Map();
  const tiba = new Map();
  const tanpaTanggal = [];

  list.forEach((s) => {
    const key = groupKeyOf(s);
    if (!key) {
      tanpaTanggal.push(s);
      return;
    }
    const wadah = isArrived(s) ? tiba : aktif;
    if (!wadah.has(key)) wadah.set(key, []);
    wadah.get(key).push(s);
  });

  const susun = (peta, menaik) =>
    Array.from(peta.keys())
      .sort((a, b) => (menaik ? (a < b ? -1 : 1) : a > b ? -1 : 1))
      .map((k) => ({ key: k, items: peta.get(k) }));

  const ordered = [
    ...susun(aktif, sortDirection() === "asc"),
    ...susun(tiba, false),
  ];
  if (tanpaTanggal.length) ordered.push({ key: null, items: tanpaTanggal });
  return ordered;
}

/* URUTAN TAMPIL — satu sumber */
function flattenGroups(groups) {
  const flat = [];
  groups.forEach((g) => {
    g.items.forEach((s) => flat.push({ key: g.key, shipment: s }));
  });
  return flat;
}

// Urutan yang benar-benar tampil. Dipakai bersama render() & panel detail
function orderedFiltered() {
  return flattenGroups(groupAndSort(getFiltered())).map((e) => e.shipment);
}

/* ------------------------------------------------------------------
   POSISI GULIR SAAT DAFTAR DIGAMBAR ULANG

   render() mengganti SELURUH isi daftar. Kartu yang baru dibuat belum
   punya "tinggi yang diingat" (content-visibility: auto, lihat
   css/card.css), jadi kartu yang sedang di atas layar kembali ke
   perkiraan tinggi 760px. Selisihnya menggeser seluruh isi layar:
   sesudah konfirmasi tahap dokumen, ubah status, atau ubah tanggal di
   kartu, kartu yang sedang dikerjakan melompat turun dan halaman
   terasa menggulir ke atas sendiri.

   Dua langkah, keduanya hanya saat daftar sudah tergulir:
     1. Tinggi tiap kartu lama diwariskan ke kartu baru ber-id sama
        (contain-intrinsic-height). Kartu di atas layar tetap setinggi
        semula selama belum digambar, jadi tidak ada yang bergeser.
     2. Penanda gulir bawaan peramban (scroll anchoring) tidak menolong
        karena elemen penandanya ikut dibuang. Jadi penandanya dipegang
        sendiri: kartu pertama yang masih terlihat dicatat jarak
        atasnya, lalu dikembalikan ke jarak itu -- untuk kartu di
        atasnya yang memang berubah urutan atau isi. Seketika, bukan
        digulir halus (html memakai scroll-behavior: smooth).
   Kartu yang hilang dari daftar (pindah halaman, tersaring) tidak
   dikejar: posisi gulir dibiarkan apa adanya. */
function catatPenandaGulir() {
  const wadah = cardContainer.getBoundingClientRect();
  // Daftar belum tergulir (atau tidak tampil): tidak ada yang bisa bergeser
  if (wadah.top >= 0 || wadah.bottom <= 0) return null;
  const tinggi = new Map();
  let penanda = null;
  for (const kartu of cardContainer.querySelectorAll(":scope > .ship-card")) {
    const r = kartu.getBoundingClientRect();
    tinggi.set(kartu.dataset.id, r.height);
    if (!penanda && r.bottom > 0) penanda = { id: kartu.dataset.id, top: r.top };
  }
  return penanda ? { ...penanda, tinggi } : null;
}
function wariskanTinggiKartu(penanda) {
  if (!penanda) return;
  for (const kartu of cardContainer.querySelectorAll(":scope > .ship-card")) {
    const lama = penanda.tinggi.get(kartu.dataset.id);
    if (!lama) continue;
    // contain-intrinsic-* mengukur kotak ISI: padding & garis tepi dikurangkan
    const cs = getComputedStyle(kartu);
    const tepi = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]
      .reduce((n, k) => n + (parseFloat(cs[k]) || 0), 0);
    kartu.style.containIntrinsicHeight = `auto ${Math.max(0, lama - tepi)}px`;
  }
}
function pulihkanPenandaGulir(penanda) {
  if (!penanda || !penanda.id) return;
  const kartu = [...cardContainer.querySelectorAll(":scope > .ship-card")]
    .find((k) => k.dataset.id === penanda.id);
  if (!kartu) return;
  const geser = Math.round(kartu.getBoundingClientRect().top - penanda.top);
  if (geser) window.scrollBy({ top: geser, behavior: "instant" });
}

/* POSISI DAFTAR SEBELUM FORM JADWAL DIBUKA.

   Form jadwal adalah halaman tersendiri (#/new, #/edit/<id>) yang dibuka
   dari atas. Kembali ke daftar -- sesudah Simpan maupun Batal -- tampilan
   dikembalikan ke posisi gulir SEBELUM form dibuka, bukan mengejar kartu
   yang diubah: urutannya bisa berubah (ETD / ETA / Estimated Delivery
   baru), tapi yang sedang dilihat pengguna tetap di tempatnya. Tinggi
   tiap kartu diwariskan seperti render biasa (wariskanTinggiKartu),
   supaya kartu di atas layar yang belum tergambar tidak menggesernya. */
let posisiDaftarSebelumForm = null;
function catatPosisiDaftar() {
  if ($("#viewList").classList.contains("d-none")) return;
  const tinggi = new Map();
  cardContainer.querySelectorAll(":scope > .ship-card").forEach((k) => tinggi.set(k.dataset.id, k.getBoundingClientRect().height));
  posisiDaftarSebelumForm = { y: window.scrollY, tinggi };
}
function pulihkanPosisiDaftar() {
  const p = posisiDaftarSebelumForm;
  posisiDaftarSebelumForm = null;
  if (!p) return;
  wariskanTinggiKartu(p);
  window.scrollTo({ top: p.y, left: 0, behavior: "instant" });
}

/* FOKUS IKUT BERTAHAN.

   Kalau yang sedang difokus ada di dalam daftar -- kotak kronologi
   yang sedang diketik, pil status, kotak tanggal, tombol tahap dokumen
   -- kembarannya di kartu yang baru difokus lagi, lengkap dengan isi &
   posisi kursornya (kunciFokus, js/ui/fokus.js). Tanpa ini pembaruan
   dari pengguna lain (realtime) membuang kalimat kronologi yang sedang
   setengah diketik, dan pengguna papan ketik terlempar ke awal halaman
   setiap kali mengubah status. */
function catatFokusDaftar() {
  const el = document.activeElement;
  if (!el || el === document.body || !cardContainer.contains(el)) return null;
  const kunci = kunciFokus(el);
  if (!kunci) return null;
  const teks = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type === "text");
  return { kunci, teks, nilai: el.value, awal: teks ? el.selectionStart : null, akhir: teks ? el.selectionEnd : null };
}
function pulihkanFokusDaftar(lama) {
  if (!lama) return;
  const aktif = document.activeElement;
  if (aktif && aktif !== document.body && aktif.isConnected) return; // sudah ada yang mengambil fokus
  const el = cardContainer.querySelector(lama.kunci);
  if (!el) return;
  // Isi yang sedang diketik tidak ikut terbuang (kotak tanggal & pilihan mengikuti data)
  if (lama.teks && el.value !== lama.nilai) el.value = lama.nilai;
  fokuskan(el, { tanpaGulir: true });
  if (lama.teks && lama.awal != null) {
    try {
      el.setSelectionRange(lama.awal, lama.akhir);
    } catch (err) {
      /* abaikan */
    }
  }
}

function render() {
  const penanda = catatPenandaGulir();
  const fokusLama = catatFokusDaftar();
  // Data jadwal mungkin berubah -> notifikasi lonceng dihitung ulang (notifikasi.js)
  if (typeof jadwalkanNotif === "function") jadwalkanNotif();
  applyModeLabels();
  syncSearchClear();
  const filtered = getFiltered();
  const totalInBook = currentList().length;

  if (filtered.length === 0) {
    cardContainer.innerHTML = "";
    emptyState.classList.remove("d-none");
    renderPaginationBar(0);
    updateStats(0);
    renderFilterNote(0, totalInBook);
    return;
  }
  emptyState.classList.add("d-none");

  const groups = groupAndSort(filtered);
  const groupByKey = new Map(groups.map((g) => [g.key, g]));

  const flat = flattenGroups(groups);

  const totalPages = Math.max(1, Math.ceil(flat.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  const pageSlice = flat.slice(start, start + pageSize);

  let html = "";
  let lastKey;

  pageSlice.forEach((entry, idx) => {
    if (idx === 0 || entry.key !== lastKey) {
      // anyArrived dihitung dari SELURUH anggota grup (bukan cuma yang tampil di halaman ini)
      const g = groupByKey.get(entry.key);
      const anyArrived = g
        ? g.items.every((s) => isArrived(s))
        : false;
      const jumlah = g ? g.items.length : 0;
      const label = entry.key
        ? fmtDateLong(entry.key)
        : t("s.tanggal.tidak.diketahui");
      html += `
        <div class="date-section">
          <span class="date-section-badge ${anyArrived ? "is-arrived-group" : ""}"><i class="bi ${anyArrived ? "bi-check-circle" : "bi-calendar-event"}"></i> ${label}</span>
          <span class="date-section-line"></span>
          <span class="date-section-count">${tt(`${jumlah} pengiriman`, `${jumlah} shipment${jumlah === 1 ? "" : "s"}`)} · ${sortBasisLabel().toUpperCase()}</span>
        </div>`;
    }
    html += renderCard(entry.shipment);
    lastKey = entry.key;
  });
  cardContainer.innerHTML = html;
  wariskanTinggiKartu(penanda);

  renderPaginationBar(flat.length);
  updateStats(flat.length);
  renderFilterNote(flat.length, totalInBook);
  pulihkanPenandaGulir(penanda);
  pulihkanFokusDaftar(fokusLama);
}

/* PAGINATION */
function paginationRange(current, total) {
  const delta = 1;
  const range = [];
  const withDots = [];
  let last;
  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - delta && i <= current + delta)
    ) {
      range.push(i);
    }
  }
  range.forEach((i) => {
    if (last != null) {
      if (i - last === 2) withDots.push(last + 1);
      else if (i - last !== 1) withDots.push("...");
    }
    withDots.push(i);
    last = i;
  });
  return withDots;
}

/* Digulir ke JUDUL daftar, bukan ke elemen yang sudah tidak ada.

   Sebelum ini sasarannya #lblListCaption -- id yang tidak pernah ada di
   halaman. Karena dijaga `if (el)`, tidak ada yang error: pindah
   halaman sekadar diam di posisi gulir yang lama, sehingga baris
   pertama halaman baru berada di luar layar. */
function scrollToListTop() {
  const el = $(".list-head") || $("#lblSectionList");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPaginationBar(totalItems) {
  const bar = $("#paginationBar");
  if (!bar) return;
  if (totalItems === 0) {
    bar.className = "";
    bar.innerHTML = "";
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  const pageBtns = paginationRange(currentPage, totalPages)
    .map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`,
    )
    .join("");

  bar.className = "pagination-bar";
  bar.innerHTML = `
    <div class="pagination-info">${tt(`Menampilkan <b>${startIdx}–${endIdx}</b> dari <b>${totalItems}</b> pengiriman`, `Showing <b>${startIdx}–${endIdx}</b> of <b>${totalItems}</b> shipments`)}</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" id="pagePrev" ${currentPage <= 1 ? "disabled" : ""} title="${tt("Halaman sebelumnya", "Previous page")}" aria-label="${tt("Halaman sebelumnya", "Previous page")}"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
      <div class="page-numbers">${pageBtns}</div>
      <button type="button" class="page-nav" id="pageNext" ${currentPage >= totalPages ? "disabled" : ""} title="${tt("Halaman berikutnya", "Next page")}" aria-label="${tt("Halaman berikutnya", "Next page")}"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
    </div>
    <div class="pagination-size">
      <label for="pageSizeSelect">${tt("Per halaman", "Per page")}</label>
      <select id="pageSizeSelect">
        ${[5, 10, 20, 50]
          .map(
            (n) =>
              `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n}</option>`,
          )
          .join("")}
      </select>
    </div>`;
}

$("#paginationBar").addEventListener("click", (e) => {
  const pageBtn = e.target.closest("[data-page]");
  if (pageBtn) {
    currentPage = Number(pageBtn.dataset.page);
    render();
    scrollToListTop();
    return;
  }
  if (e.target.closest("#pagePrev")) {
    currentPage = Math.max(1, currentPage - 1);
    render();
    scrollToListTop();
    return;
  }
  if (e.target.closest("#pageNext")) {
    currentPage = currentPage + 1;
    render();
    scrollToListTop();
  }
});
$("#paginationBar").addEventListener("change", (e) => {
  if (e.target.id === "pageSizeSelect") {
    pageSize = Number(e.target.value) || 10;
    currentPage = 1;
    render();
  }
});

/* updateStats() sekarang tinggal di js/features/quick-filters.js — */

let filterStatusPernahDisetel = false;
function applyModeLabels() {
  const lbl = ML();
  document.body.classList.toggle("mode-export", activeMode === "export");
  document.body.classList.toggle("mode-import", activeMode !== "export");
  $("#lblAddBtn").textContent = lbl.addBtn;
  /* Tooltip ikut berubah: di layar sempit labelnya disembunyikan dan
     tooltip jadi satu-satunya keterangan tombol itu. */
  $("#btnAdd").title = lbl.addBtn;
  $("#lblSectionList").textContent = lbl.section;
  // Cakupan tombol hapus disebutkan di labelnya, bukan hanya di dialog konfirmasi
  $("#lblDeleteAll").textContent =
    activeMode === "import" ? t("v.hapus.semua.import") : t("v.hapus.semua.export");
  // Pilihan filter status ikut section aktif (requirement D).
  const cur = $("#filterStatus").value;
  $("#filterStatus").innerHTML =
    `<option value="">${tt("Semua Status", "All Statuses")}</option>` +
    statusOptionsHtml(activeMode, "").replace(/ selected/g, "");
  /* Pilihan yang sedang aktif dikembalikan setelah daftarnya diisi
     ulang — KECUALI pada gambar pertama, yang dimulai dari nilai
     bawaan. Sesudah itu pilihan pengguna dihormati; kalau tidak,
     saringannya akan melompat balik ke Process setiap kali daftar
     digambar ulang. */
  $("#filterStatus").value = filterStatusPernahDisetel
    ? cur
    : nilaiFilterStatusBawaan();
  filterStatusPernahDisetel = true;
  /* Opsi ke-3 dropdown rentang tanggal mengikuti label `actual` per
     mode: "Estimated Delivery" (Import) / "Stuffing" (Export). ETA/ETD
     tidak berubah nama antar mode, jadi cukup opsi ini saja. */
  const optActual = $('#filterDateBasis option[value="actual"]');
  if (optActual) optActual.textContent = lbl.actual;
}

/* Nilai bawaan hanya dipakai kalau memang ADA pilihannya di buku ini.
   Kalau suatu saat "process" dihapus dari salah satu buku, lebih baik
   jatuh ke "Semua Status" daripada menyetel nilai yang tidak ada —
   <select> yang nilainya asing akan diam-diam jadi kosong. */
function nilaiFilterStatusBawaan() {
  const ada = (STATUS_OPTIONS_BY_MODE[activeMode] || []).includes(
    FILTER_STATUS_DEFAULT,
  );
  return ada ? FILTER_STATUS_DEFAULT : "";
}

/* Penyegaran ringan: hanya geser penanda, DOM & fokus tidak disentuh */
function refreshLanePositions() {
  currentList().forEach((s) => {
    const card = cardContainer.querySelector(`.ship-card[data-id="${s.id}"]`);
    if (!card) return;
    const lane = computeLaneModel(s);
    const fill = card.querySelector(".lane-fill");
    const marker = card.querySelector(".ship-marker");
    if (fill) fill.style.width = lane.progress * 100 + "%";
    const sisa = card.querySelector(".lane-remaining");
    if (sisa) sisa.textContent = laneRemainingLabel(s);
    if (marker) {
      marker.style.left = lane.progress * 100 + "%";
      const ikon = marker.querySelector(".marker-icon");
      if (ikon) ikon.innerHTML = lane.icon;
      /* Kelasnya ikut diperbarui: sebuah pengiriman bisa berangkat atau
         sampai sementara halaman dibiarkan terbuka */
      const bergerak = !isArrived(s) && lane.progress > 0.05 && lane.progress < 1;
      marker.classList.toggle("at-start", lane.progress <= 0.001);
      marker.classList.toggle("at-end", lane.progress >= 0.999);
      marker.classList.toggle("is-moving", bergerak);
      marker.classList.toggle("is-air", !!lane.leg && lane.leg.mode === "udara");
      marker.classList.toggle("is-sea", !lane.leg || lane.leg.mode !== "udara");
    }
    $$(".port-node", card).forEach((dot, i) => {
      const reached = lane.fractions[i] <= lane.progress + 0.0001;
      dot.classList.toggle("reached", reached);
    });
  });
}
setInterval(refreshLanePositions, 60000);

/* MODE SWITCH (navbar) */
/* Sakelar buku Import/Export kini muncul di kepala papan SETIAP halaman */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-tabs [data-mode]");
  if (!btn) return;
  if (btn.dataset.mode !== activeMode) switchMode(btn.dataset.mode);
});

function syncModeTabs(mode) {
  $$(".mode-tabs [data-mode]").forEach((b) => {
    const aktif = b.dataset.mode === mode;
    b.classList.toggle("active", aktif);
    b.setAttribute("aria-selected", aktif ? "true" : "false");
  });
}
// Section aktif diingat supaya REFRESH halaman tidak melempar user kembali ke Import
const ACTIVE_MODE_KEY = "eximddi.activeMode";
function rememberActiveMode(mode) {
  try {
    localStorage.setItem(ACTIVE_MODE_KEY, mode);
  } catch (err) {
    /* localStorage bisa diblokir (mode privat) — abaikan, tidak fatal */
  }
}
function restoreActiveMode() {
  try {
    const saved = localStorage.getItem(ACTIVE_MODE_KEY);
    if (saved === "import" || saved === "export") activeMode = saved;
  } catch (err) {
    /* abaikan */
  }
  syncModeTabs(activeMode);
}

function switchMode(mode) {
  activeMode = mode;
  rememberActiveMode(mode);
  syncModeTabs(mode);
  $("#searchInput").value = "";
  // Pindah buku = membuka daftar yang lain; mulai dari bawaan lagi.
  $("#filterStatus").value = nilaiFilterStatusBawaan();
  // Rentang tanggal ikut dilepas — rentang di buku Import bukan pertanyaan yang sama dengan di buku Export.
  resetDateRangeFilter();
  // "Perlu tindakan" ikut dilepas: itu di buku Import bukan pertanyaan yang sama dengan di buku Export.
  onlyNeedsAction = false;
  syncSearchClear();
  currentPage = 1;
  render();

  
  if (
    typeof renderOverview === "function" &&
    !$("#viewOverview").classList.contains("d-none")
  ) {
    renderOverview();
  }
}

/* FILTERS (search / status / sort dir) */

/* FILTERS */

let searchTimer = null;
$("#searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 1;
    render();
  }, 180);
});
$("#filterStatus").addEventListener("change", () => {
  currentPage = 1;
  render();
});

// Rentang tanggal: ganti basis atau tanggal -> saring ulang dari halaman 1
["filterDateBasis", "filterDateFrom", "filterDateTo"].forEach((id) => {
  $("#" + id).addEventListener("change", () => {
    currentPage = 1;
    applyDateRangeClearVisibility();
    render();
  });
});
$("#btnClearDateRange").addEventListener("click", () => {
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  currentPage = 1;
  applyDateRangeClearVisibility();
  render();
});

