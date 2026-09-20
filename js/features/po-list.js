"use strict";

/* ------------------------------------------------------------------
   DAFTAR NOMOR PO PADA PENGAJUAN INVOICE

   Satu pengapalan kerap menggabung beberapa pesanan pembeli, dan
   invoice harus menyebut semuanya.

   TIAP PESANAN PUNYA TANGGALNYA SENDIRI, jadi yang ditambahkan selalu
   SEPASANG: nomor PO dan tanggalnya, sekali klik. Nomor tanpa tanggal
   bukan keadaan yang perlu dilayani -- ia cuma menyisakan kotak yang
   harus ditebak isinya nanti.

   Baris PERTAMA tetap memakai data-dn="poNo" & data-dn="poDate" --
   jalur penyimpanan yang sudah ada. Baris kedua dan seterusnya
   dikumpulkan terpisah sebagai `poNoExtra` & `poDateExtra`, sehingga
   pengajuan lama yang menyimpan satu nomor tetap terbaca apa adanya
   tanpa migrasi data.
------------------------------------------------------------------ */

function poNoKotakTambahan() {
  return [...document.querySelectorAll("#poNoList [data-po-extra]")];
}

function poTglKotakTambahan() {
  return [...document.querySelectorAll("#poNoList [data-po-tgl-extra]")];
}

/* Seluruh nomor PO yang terisi, berurutan, tanpa yang kosong. */
function poNoSemua(payload) {
  const p = payload || {};
  return [p.poNo, ...(p.poNoExtra || [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function poNoTambahKotak(nilai, tanggal) {
  const box = document.getElementById("poNoList");
  if (!box) return null;
  const el = document.createElement("div");
  el.className = "po-row po-extra-row";
  el.innerHTML = `
    <input type="text" class="form-control" data-po-extra
           value="${escapeAttr(nilai || "")}"
           placeholder="${escapeAttr(t("ph.nomor.po.pembeli"))}">
    <input type="date" class="form-control po-tgl" data-po-tgl-extra
           value="${escapeAttr(tanggal || "")}">
    <button type="button" class="rm-row" data-po-del
            title="${escapeAttr(t("f.hapus.baris"))}">
      <i class="bi bi-x-lg"></i>
    </button>`;
  box.appendChild(el);
  return el.querySelector("input");
}

/* Mengisi ulang baris tambahan dari data tersimpan.

   Tanggalnya dipasangkan MENURUT URUTAN, bukan menurut jumlah: daftar
   tanggal bisa lebih pendek (pengajuan yang tersimpan sebelum tanggal
   per-PO ada), dan baris yang tidak kebagian tanggal tetap harus
   memunculkan nomornya. */
function setPoNoExtra(daftar, tanggalDaftar) {
  const box = document.getElementById("poNoList");
  if (!box) return;
  poNoKotakTambahan().forEach((el) => {
    const baris = el.closest(".po-extra-row");
    if (baris) baris.remove();
  });
  const tgl = tanggalDaftar || [];
  (daftar || []).forEach((v, i) => poNoTambahKotak(v, tgl[i]));
}

const btnPoNoAddEl = document.getElementById("btnPoNoAdd");
if (btnPoNoAddEl) {
  btnPoNoAddEl.addEventListener("click", () => {
    const kotak = poNoTambahKotak("", "");
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
    const kotak = poNoTambahKotak("", "");
    if (kotak) kotak.focus();
  });
}
