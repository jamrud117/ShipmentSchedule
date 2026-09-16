"use strict";

/* ------------------------------------------------------------------
   DAFTAR NOMOR PO PADA PENGAJUAN INVOICE

   Satu pengapalan kerap menggabung beberapa pesanan pembeli, dan
   invoice harus menyebut semuanya.

   Kotak PERTAMA tetap memakai data-dn="poNo" -- jalur penyimpanan yang
   sudah ada. Kotak kedua dan seterusnya dikumpulkan terpisah sebagai
   `poNoExtra`, sehingga pengajuan lama yang menyimpan satu nomor tetap
   terbaca apa adanya tanpa migrasi data.
------------------------------------------------------------------ */

function poNoKotakTambahan() {
  return [...document.querySelectorAll("#poNoList [data-po-extra]")];
}

/* Seluruh nomor PO yang terisi, berurutan, tanpa yang kosong. */
function poNoSemua(payload) {
  const p = payload || {};
  return [p.poNo, ...(p.poNoExtra || [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function poNoTambahKotak(nilai) {
  const box = document.getElementById("poNoList");
  if (!box) return null;
  const el = document.createElement("div");
  el.className = "po-extra-row";
  el.innerHTML = `
    <input type="text" class="form-control" data-po-extra
           value="${escapeAttr(nilai || "")}"
           placeholder="${escapeAttr(t("ph.nomor.po.pembeli"))}">
    <button type="button" class="rm-row" data-po-del
            title="${escapeAttr(t("f.hapus.baris"))}">
      <i class="bi bi-x-lg"></i>
    </button>`;
  box.appendChild(el);
  return el.querySelector("input");
}

/* Mengisi ulang kotak tambahan dari data tersimpan. */
function setPoNoExtra(daftar) {
  const box = document.getElementById("poNoList");
  if (!box) return;
  poNoKotakTambahan().forEach((el) => {
    const baris = el.closest(".po-extra-row");
    if (baris) baris.remove();
  });
  (daftar || []).forEach((v) => poNoTambahKotak(v));
}

const btnPoNoAddEl = document.getElementById("btnPoNoAdd");
if (btnPoNoAddEl) {
  btnPoNoAddEl.addEventListener("click", () => {
    const kotak = poNoTambahKotak("");
    if (kotak) kotak.focus();
  });
}

const poNoListEl = document.getElementById("poNoList");
if (poNoListEl) {
  poNoListEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-po-del]");
    if (!del) return;
    const baris = del.closest(".po-extra-row");
    if (baris) baris.remove();
  });
  /* Enter menambah kotak berikutnya, bukan menerbitkan nomor: kotak
     ini ada di dalam form penerbitan. */
  poNoListEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (!e.target.closest("#poNoList input")) return;
    e.preventDefault();
    const kotak = poNoTambahKotak("");
    if (kotak) kotak.focus();
  });
}
