"use strict";

/* HALAMAN DATABASE HS CODE — semua peran boleh MEMBACA (dipakai fitur
   cari HS Code di Daftar Barang), hanya exim yang boleh menambah/
   mengubah/menghapus (lihat RLS di migration-hs-code-database.sql). */

/* HS CODE INDONESIA (BTKI) PANJANGNYA 8 ANGKA.

   Titik hanya pemisah baca ("6404.19.00"), jadi yang dihitung
   ANGKANYA saja. Ketikan yang melebihi 8 angka dipotong saat itu juga
   -- bukan ditolak saat Simpan, supaya kelebihannya ketahuan sebelum
   seluruh kodenya terlanjur diketik. */
const HSCODE_MAKS_ANGKA = 8;

function batasiHsCode(teks) {
  let angka = 0;
  let hasil = "";
  for (const c of String(teks == null ? "" : teks)) {
    if (c >= "0" && c <= "9") {
      if (angka >= HSCODE_MAKS_ANGKA) continue;
      angka++;
      hasil += c;
    } else if (c === "." && hasil) {
      // Titik ganda tidak menambah keterbacaan apa pun.
      if (!hasil.endsWith(".")) hasil += c;
    }
    // Huruf & tanda lain dibuang: HS Code tidak pernah memuatnya.
  }
  return hasil;
}

function periksaHsCode(kode) {
  const angka = (String(kode || "").match(/\d/g) || []).length;
  if (!angka) return tt("HS Code harus diisi.", "HS Code is required.");
  if (angka > HSCODE_MAKS_ANGKA) return tt("HS Code paling banyak 8 angka.", "HS Code can have at most 8 digits.");
  return null;
}

let hsCodeRows = [];

/* ------------------------------------------------------------------
   PEMBERITAHUAN ANTAR-TAB

   HS Code kerap diisi sambil mengisi jadwal: satu tab untuk jadwal,
   satu tab untuk menambah kodenya. Dua tab itu TIDAK berbagi memori --
   `hsCodeRows` milik masing-masing halaman -- jadi kode yang baru
   ditambah di tab sebelah tidak akan pernah muncul di tombol cari HS
   Code sampai halamannya dimuat ulang.

   localStorage adalah satu-satunya kabar yang lewat antar tab tanpa
   tambahan apa pun: penulisnya menyetel penanda, tab lain menerima
   event `storage`. Yang dikirim cuma cap waktu -- isi datanya tetap
   diambil dari database, supaya tab penerima tidak pernah menampilkan
   salinan yang sudah basi.
------------------------------------------------------------------ */
const HSCODE_SINYAL = "exim.hscodeBerubah";

function siarkanHsCodeBerubah() {
  try {
    localStorage.setItem(HSCODE_SINYAL, String(Date.now()));
  } catch (e) {
    /* Penyimpanan bisa dimatikan peramban. Tab ini tetap benar;
       yang hilang cuma kabar ke tab sebelah. */
  }
}

async function ambilHsCodes() {
  const { data, error } = await supabaseClient
    .from("hs_code_master")
    .select("id, item_name, hs_code, notes, created_at")
    .order("item_name", { ascending: true });
  if (error) throw error;
  hsCodeRows = data || [];
  return hsCodeRows;
}

async function loadHsCodes() {
  const box = $("#hsCodeList");
  if (box) {
    box.innerHTML = `<div class="panel-empty"><i class="bi bi-hourglass"></i> ${t("hscode.loading")}</div>`;
  }

  try {
    await ambilHsCodes();
  } catch (error) {
    console.error(error);
    if (box) {
      box.innerHTML = `
        <div class="panel-empty">
          <i class="bi bi-exclamation-triangle"></i>
          ${t("hscode.loadFail")}
        </div>`;
    }
    return;
  }
  renderHsCodes();
}

/* Memuat ulang TANPA mengosongkan layar dulu.

   Dipakai saat daftarnya disegarkan di latar (tombol cari HS Code
   dibuka, atau tab sebelah memberi kabar). Memanggil loadHsCodes() di
   situ akan menampilkan "Memuat…" menggantikan daftar yang sebenarnya
   masih benar -- berkedip tanpa alasan. */
async function segarkanHsCodeDiam() {
  try {
    await ambilHsCodes();
  } catch (e) {
    console.error(e);
    return false;
  }
  if ($("#hsCodeList")) renderHsCodes();
  return true;
}

window.addEventListener("storage", (e) => {
  if (e.key !== HSCODE_SINYAL) return;
  segarkanHsCodeDiam().then((ok) => {
    // Popover cari HS Code yang sedang terbuka ikut disegarkan.
    if (ok && typeof saringHscodeLookup === "function") {
      const pop = $("#hscodeLookupPop");
      if (pop && !pop.classList.contains("d-none")) saringHscodeLookup();
    }
  });
});

/* Halaman yang sedang dilihat. Dijepit ke jumlah halaman yang benar
   di setiap render -- menghapus baris terakhir di halaman terakhir
   mengurangi jumlah halaman, dan tanpa penjepitan layarnya jadi kosong
   padahal datanya masih ada. */
let hsCodePage = 1;
let hsCodePageSize = 10;

function renderHsCodes() {
  const box = $("#hsCodeList");
  if (!box) return;
  const q = (($("#hsCodeSearch") || {}).value || "").trim().toLowerCase();
  const cocok = hsCodeRows.filter(
    (r) =>
      !q ||
      (r.item_name || "").toLowerCase().includes(q) ||
      (r.hs_code || "").toLowerCase().includes(q),
  );
  /* Selalu A-Z menurut Nama Barang. Tidak ada pilihan urutan: daftar
     ini dipakai untuk MENCARI satu barang, dan abjad satu-satunya
     urutan yang bisa ditebak tanpa membacanya dulu. */
  const terurut = cocok
    .slice()
    .sort((a, b) =>
      String(a.item_name || "").localeCompare(String(b.item_name || ""), "id", {
        sensitivity: "base",
      }),
    );

  const totalEl = $("#hsCodeCount");
  if (totalEl) totalEl.textContent = hsCodeRows.length;

  if (!terurut.length) {
    box.innerHTML = hsCodeRows.length
      ? `<div class="panel-empty"><i class="bi bi-search"></i> ${t("hscode.empty.search")}</div>`
      : `<div class="panel-empty"><i class="bi bi-upc-scan"></i> ${t("hscode.empty.none")}</div>`;
    renderHsCodePagination(0);
    return;
  }

  const totalHalaman = Math.max(1, Math.ceil(terurut.length / hsCodePageSize));
  hsCodePage = Math.min(Math.max(1, hsCodePage), totalHalaman);
  const mulai = (hsCodePage - 1) * hsCodePageSize;
  const rows = terurut.slice(mulai, mulai + hsCodePageSize);

  renderHsCodePagination(terurut.length);

  /* TABEL selebar halaman: nama barang, HS Code, catatan, aksi. Di
     ponsel tiap baris jadi kartu ringkas (hs-panel di auth.css). HS Code
     berupa tombol: sekali klik tersalin, siap ditempel ke CEISA atau
     Daftar Barang tanpa memilih teksnya dulu. */
  const salinJudul = escapeAttr(tt("Salin HS Code", "Copy HS Code"));
  box.innerHTML = `
    <div class="hs-tabel-wrap">
      <table class="hs-tabel">
        <thead><tr>
          <th class="hs-kol-nama">${tt("Nama Barang", "Item Name")}</th>
          <th class="hs-kol-kode">HS Code</th>
          <th class="hs-kol-catatan">${tt("Catatan", "Notes")}</th>
          <th class="hs-kol-aksi"></th>
        </tr></thead>
        <tbody>${rows
          .map(
            (r) => `
          <tr data-hscode="${r.id}">
            <td class="hs-kol-nama"><span class="hscode-name">${escapeHtml(r.item_name)}</span></td>
            <td class="hs-kol-kode">
              <button type="button" class="hscode-code" data-salin-hs="${escapeAttr(r.hs_code)}" title="${salinJudul}"
                aria-label="${escapeAttr(tt(`Salin HS Code ${r.hs_code}`, `Copy HS Code ${r.hs_code}`))}">
                <span class="hscode-kode">${escapeHtml(r.hs_code)}</span>
                <i class="bi bi-clipboard" aria-hidden="true"></i>
              </button>
            </td>
            <td class="hs-kol-catatan${r.notes ? "" : " hs-tanpa-catatan"}">${r.notes ? escapeHtml(r.notes) : "\u2014"}</td>
            <td class="hs-kol-aksi">
              <div class="hscode-actions">
                <button type="button" class="icon-btn" data-edit-hscode="${r.id}" title="${tt("Ubah", "Edit")}">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="icon-btn danger" data-del-hscode="${r.id}" title="${tt("Hapus", "Delete")}">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`;
}

/* Salin HS Code sekali klik. Cadangan execCommand untuk peramban tanpa
   Clipboard API (atau halaman yang dibuka bukan lewat https).

   Tanda berhasil di TOMBOLNYA SENDIRI -- ikon papan klip jadi centang,
   pil sesaat hijau -- bukan hanya pesan di pojok layar: mata sedang
   melihat tombol yang baru diklik, dan di ponsel pesannya mudah
   tertutup jari. */
async function salinHsCode(kode, tombol) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(kode);
    else {
      const ta = document.createElement("textarea");
      ta.value = kode;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    showToast(tt(`HS Code ${kode} disalin.`, `HS Code ${kode} copied.`), "success");
    if (tombol) {
      const ikon = tombol.querySelector("i");
      tombol.classList.add("is-tersalin");
      if (ikon) ikon.className = "bi bi-clipboard-check";
      clearTimeout(tombol._tundaSalin);
      tombol._tundaSalin = setTimeout(() => {
        tombol.classList.remove("is-tersalin");
        if (ikon) ikon.className = "bi bi-clipboard";
      }, 1500);
    }
  } catch (err) {
    showToast(tt("Gagal menyalin HS Code.", "Failed to copy the HS Code."), "danger");
  }
}
document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-salin-hs]");
  if (tombol) salinHsCode(tombol.dataset.salinHs, tombol);
});

/* Dipakai juga dari luar halaman ini -- tombol cari HS Code di Daftar
   Barang (item-table.js) mencari lewat array yang sama, tanpa perlu
   muat ulang dari Supabase tiap kali dibuka. Memuat sendiri kalau
   belum pernah (mis. pengguna langsung buka form tanpa pernah mampir
   ke halaman HS Code). */
async function pastikanHsCodeTermuat() {
  if (!hsCodeRows.length) await loadHsCodes();
}

function tambahHsCodeBaru() {
  if (!requireEdit()) return;
  showPrompt({
    title: tt("Tambah HS Code", "Add HS Code"),
    desc: t("s.nama.barang.hs.code.yang.sudah.pernah.dipakai."),
    icon: "bi-upc-scan",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nama", label: tt("Nama barang", "Item name"), placeholder: tt("Cth: Sole Material", "e.g. Sole Material") },
      {
        key: "kode",
        label: "HS Code",
        placeholder: tt("Cth: 6404.19.00", "e.g. 6404.19.00"),
        hint: tt("Maksimal 8 angka (titik hanya pemisah).", "At most 8 digits (dots are only separators)."),
        inputmode: "numeric",
        filter: batasiHsCode,
      },
      { key: "catatan", label: tt("Catatan (opsional)", "Notes (optional)"), placeholder: tt("Cth: EVA Sole", "e.g. EVA Sole") },
    ],
    onSubmit: (v) => {
      if (!(v.nama || "").trim()) return tt("Nama barang harus diisi.", "Item name is required.");
      const galat = periksaHsCode(v.kode);
      if (galat) return galat;
      simpanHsCodeBaru(v.nama.trim(), batasiHsCode(v.kode), (v.catatan || "").trim());
      return true;
    },
  });
}

async function simpanHsCodeBaru(nama, kode, catatan) {
  const { data, error } = await supabaseClient
    .from("hs_code_master")
    .insert({
      item_name: nama,
      hs_code: kode,
      notes: catatan || null,
      created_by: authState.user ? authState.user.id : null,
    })
    .select()
    .single();
  if (error) {
    console.error(error);
    showToast(t("m.gagal.menyimpan.hs.code.baru"), "danger");
    return;
  }
  hsCodeRows.push(data);
  renderHsCodes();
  siarkanHsCodeBerubah();
  showToast(t("w.hs.code.untuk.tersimpan", { x: nama }), "dark");
}

function editHsCode(id) {
  if (!requireEdit()) return;
  const r = hsCodeRows.find((x) => x.id === id);
  if (!r) return;
  showPrompt({
    title: tt("Ubah HS Code", "Edit HS Code"),
    icon: "bi-pencil-square",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nama", label: tt("Nama barang", "Item name"), value: r.item_name || "" },
      {
        key: "kode",
        label: "HS Code",
        value: r.hs_code || "",
        hint: tt("Maksimal 8 angka (titik hanya pemisah).", "At most 8 digits (dots are only separators)."),
        inputmode: "numeric",
        filter: batasiHsCode,
      },
      { key: "catatan", label: tt("Catatan (opsional)", "Notes (optional)"), value: r.notes || "" },
    ],
    onSubmit: (v) => {
      if (!(v.nama || "").trim()) return tt("Nama barang harus diisi.", "Item name is required.");
      const galat = periksaHsCode(v.kode);
      if (galat) return galat;
      simpanUbahHsCode(id, v.nama.trim(), batasiHsCode(v.kode), (v.catatan || "").trim());
      return true;
    },
  });
}

async function simpanUbahHsCode(id, nama, kode, catatan) {
  const { error } = await supabaseClient
    .from("hs_code_master")
    .update({ item_name: nama, hs_code: kode, notes: catatan || null })
    .eq("id", id);
  if (error) {
    console.error(error);
    showToast(t("m.gagal.menyimpan.perubahan"), "danger");
    return;
  }
  const r = hsCodeRows.find((x) => x.id === id);
  if (r) {
    r.item_name = nama;
    r.hs_code = kode;
    r.notes = catatan || null;
  }
  renderHsCodes();
  siarkanHsCodeBerubah();
  showToast(t("m.perubahan.tersimpan"), "dark");
}

function deleteHsCode(id) {
  if (!requireEdit()) return;
  const r = hsCodeRows.find((x) => x.id === id);
  if (!r) return;
  showConfirm(
    t("w.hapus.hs.code.untuk", { n: r.item_name, k: r.hs_code }),
    async () => {
      const { error } = await supabaseClient
        .from("hs_code_master")
        .delete()
        .eq("id", id);
      if (error) {
        console.error(error);
        showToast(t("m.gagal.menghapus"), "danger");
        return;
      }
      hsCodeRows = hsCodeRows.filter((x) => x.id !== id);
      renderHsCodes();
      siarkanHsCodeBerubah();
      showToast(t("w.hs.code.untuk.dihapus", { x: r.item_name }), "dark");
    },
    { confirmText: t("u.ya.hapus") },
  );
}

function showHsCodeView() {
  showPage("hscode");
  window.scrollTo(0, 0);
  loadHsCodes();
}

const btnHsCodeAdd = $("#btnHsCodeAdd");
if (btnHsCodeAdd) btnHsCodeAdd.addEventListener("click", tambahHsCodeBaru);
const btnHsCodeRefresh = $("#btnHsCodeRefresh");
if (btnHsCodeRefresh) btnHsCodeRefresh.addEventListener("click", loadHsCodes);
const hsCodeSearchEl = $("#hsCodeSearch");
if (hsCodeSearchEl) {
  hsCodeSearchEl.addEventListener("input", () => {
    hsCodePage = 1;
    renderHsCodes();
  });
}
/* Paginasi bentuk yang SAMA dengan daftar jadwal (renderPaginationBar
   di render/list.js): keterangan jumlah di kiri, nomor halaman di
   tengah, pemilih "per halaman" di kanan. Ditulis ulang di sini, bukan
   dipakai bersama, karena yang di sana terikat pada currentPage &
   pageSize milik daftar jadwal. */
function renderHsCodePagination(totalItems) {
  const bar = $("#hsCodePagination");
  if (!bar) return;
  /* Kelas hs-halaman DIPERTAHANKAN: ia yang memberi jarak kiri-kanan
     (panel HS Code tidak berpadding). Dulu className ditimpa jadi
     "pagination-bar" saja, dan teks "Showing ..." / "Per page" menempel
     ke tepi panel. */
  if (!totalItems) {
    bar.className = "hs-halaman";
    bar.innerHTML = "";
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / hsCodePageSize));
  const awal = (hsCodePage - 1) * hsCodePageSize + 1;
  const akhir = Math.min(hsCodePage * hsCodePageSize, totalItems);
  const tombol = paginationRange(hsCodePage, totalPages)
    .map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">\u2026</span>`
        : `<button type="button" class="page-btn ${p === hsCodePage ? "active" : ""}" data-hspage="${p}">${p}</button>`,
    )
    .join("");

  bar.className = "pagination-bar hs-halaman";
  bar.innerHTML = `
    <div class="pagination-info">${t("hscode.pager.showing", {
      awal: `<b>${awal}\u2013${akhir}</b>`,
      total: `<b>${totalItems}</b>`,
    })}</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" data-hsnav="prev" ${hsCodePage <= 1 ? "disabled" : ""}><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${tombol}</div>
      <button type="button" class="page-nav" data-hsnav="next" ${hsCodePage >= totalPages ? "disabled" : ""}><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="hsCodePageSize">${t("hscode.pager.perPage")}</label>
      <select id="hsCodePageSize">
        ${[5, 10, 20, 50]
          .map((n) => `<option value="${n}" ${n === hsCodePageSize ? "selected" : ""}>${n}</option>`)
          .join("")}
      </select>
    </div>`;
}

const hsCodePagerEl = $("#hsCodePagination");
if (hsCodePagerEl) {
  hsCodePagerEl.addEventListener("click", (e) => {
    const nomor = e.target.closest("[data-hspage]");
    if (nomor) {
      hsCodePage = Number(nomor.dataset.hspage);
      renderHsCodes();
      return;
    }
    const nav = e.target.closest("[data-hsnav]");
    if (nav) {
      hsCodePage += nav.dataset.hsnav === "next" ? 1 : -1;
      renderHsCodes();
    }
  });
  hsCodePagerEl.addEventListener("change", (e) => {
    if (e.target.id !== "hsCodePageSize") return;
    hsCodePageSize = Number(e.target.value);
    hsCodePage = 1;
    renderHsCodes();
  });
}

const hsCodeListEl = $("#hsCodeList");
if (hsCodeListEl) {
  hsCodeListEl.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-hscode]");
    if (editBtn) return editHsCode(editBtn.dataset.editHscode);
    const delBtn = e.target.closest("[data-del-hscode]");
    if (delBtn) return deleteHsCode(delBtn.dataset.delHscode);
  });
}
