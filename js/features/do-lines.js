"use strict";

/* ------------------------------------------------------------------
   DAFTAR BARANG SURAT JALAN LOKAL

   Kiriman lokal tidak punya CIPL, jadi tidak ada dokumen yang bisa
   ditarik daftar barangnya. Barangnya diketik langsung di sini supaya
   surat jalannya tetap bisa dicetak lengkap.

   Surat jalan EXPORT tidak memakai tabel ini: daftar barangnya ditarik
   dari jadwal yang ditautkan, yang sudah pasti cocok dengan dokumen
   kepabeanannya.
------------------------------------------------------------------ */

function doLineBaru() {
  return { nama: "", qty: "", satuan: "", ket: "" };
}

let doLines = [doLineBaru()];

function doLinesBersih(lines) {
  return (Array.isArray(lines) ? lines : []).filter(
    (b) => String(b.nama || "").trim() !== "",
  );
}

function renderDoLines() {
  const body = document.getElementById("doLinesBody");
  if (!body) return;
  if (!doLines.length) doLines = [doLineBaru()];

  body.innerHTML = doLines
    .map(
      (b, i) => `
      <tr data-dl="${i}">
        <td class="fl-no">${i + 1}</td>
        <td><input type="text" data-dl-f="nama" value="${escapeAttr(b.nama || "")}" placeholder="${escapeAttr(t("f.nama.barang"))}"></td>
        <td class="fl-rate"><input type="text" data-dl-f="qty" inputmode="decimal" value="${escapeAttr(b.qty || "")}" placeholder="0"></td>
        <td class="fl-rate"><input type="text" data-dl-f="satuan" value="${escapeAttr(b.satuan || "")}" placeholder="PCS"></td>
        <td><input type="text" data-dl-f="ket" value="${escapeAttr(b.ket || "")}"></td>
        <td class="fl-act">
          <button type="button" class="rm-row" data-dl-del="${i}" title="${escapeAttr(t("f.hapus.baris"))}">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>
      </tr>`,
    )
    .join("");
}

function setDoLines(lines) {
  doLines = Array.isArray(lines) && lines.length ? lines.slice() : [doLineBaru()];
  renderDoLines();
}

const doLinesBodyEl = document.getElementById("doLinesBody");
if (doLinesBodyEl) {
  doLinesBodyEl.addEventListener("input", (e) => {
    const tr = e.target.closest("[data-dl]");
    const f = e.target.dataset.dlF;
    if (!tr || !f) return;
    /* Nilainya dicatat TANPA menggambar ulang: menggambar ulang pada
       tiap ketukan merebut fokus dari kotak yang sedang diketik. */
    doLines[Number(tr.dataset.dl)][f] = e.target.value;
  });

  /* Enter = turun satu baris di kolom yang sama, dan menambah baris
     baru kalau sudah di baris terakhir. Dicegah mengirim form:
     kotak-kotak ini ada di dalam form penerbitan nomor. */
  doLinesBodyEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const tr = e.target.closest("[data-dl]");
    const f = e.target.dataset.dlF;
    if (!tr || !f) return;
    e.preventDefault();
    const idx = Number(tr.dataset.dl);
    if (idx === doLines.length - 1) {
      doLines.push(doLineBaru());
      renderDoLines();
    }
    const berikut = doLinesBodyEl.querySelector(
      `[data-dl="${idx + 1}"] [data-dl-f="${f}"]`,
    );
    if (berikut) {
      berikut.focus();
      if (typeof berikut.select === "function") berikut.select();
    }
  });

  doLinesBodyEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-dl-del]");
    if (!del) return;
    doLines.splice(Number(del.dataset.dlDel), 1);
    renderDoLines();
  });
}

const btnDoLineAddEl = document.getElementById("btnDoLineAdd");
if (btnDoLineAddEl) {
  btnDoLineAddEl.addEventListener("click", () => {
    doLines.push(doLineBaru());
    renderDoLines();
    const kotak = doLinesBodyEl.querySelector("tr:last-child [data-dl-f='nama']");
    if (kotak) kotak.focus();
  });
}

renderDoLines();
