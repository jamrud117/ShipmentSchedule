"use strict";

/* ------------------------------------------------------------------
   RINCIAN BIAYA PENGAJUAN DANA (format rinci)

   Dipakai untuk jenis pengeluaran SELAIN Billing. Bentuknya tabel:
   tiap baris punya uraian, nilai, dan tarif PPN sendiri — karena dalam
   satu tagihan forwarder biasanya ada pos yang dipungut PPN
   (freight, handling) dan ada yang tidak (storage).

   Untuk jenis Billing, formatnya tetap yang lama (Bea Masuk / PPN /
   PPH sebagai tiga kotak), karena tagihan bea cukai memang cuma tiga
   pos itu.
------------------------------------------------------------------ */

/* Tarif PPN yang dipakai di lapangan. 1,1% berlaku untuk jasa
   pengurusan transportasi (nilai lain 11% x 10% dari peredaran),
   11% untuk jasa biasa. 0 berarti pos itu memang tidak dipungut. */
const FUND_PPN_RATES = [0, 1.1, 11];

/* Potongan PPH 23 atas jasa. Tarifnya tetap 2%.

   DASARNYA NILAI BARIS, BUKAN PPN-nya. Untuk Agency Fee 150.000
   dengan PPN 1.1% (1.650), PPH dihitung dari 150.000 — bukan dari
   1.650. Dan hanya baris yang DIPUNGUT PPN yang ikut dihitung:
   pos tanpa PPN (storage) di luar objek PPH 23 ini. */
const FUND_PPH23_RATE = 2;

/* PEMBACA NILAI RUPIAH — konvensi Indonesia: titik ribuan, koma
   desimal ("16.873.095,68").

   parseLooseNumber() milik aplikasi memakai konvensi sebaliknya (koma
   ribuan, titik desimal), jadi "256,66666" terbaca 25.666.666 di sana.
   Tagihan forwarder yang diketik ulang di sini ditulis gaya Indonesia,
   dan angkanya berdesimal, sehingga salah baca langsung menghasilkan
   total yang meleset ribuan kali lipat. */
function parseRupiah(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const bersih = String(v)
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(bersih);
  return isFinite(n) ? n : 0;
}

/* Tampilan balik: "16.873.095,68". Desimal ditulis hanya kalau memang
   ada -- angka bulat tidak diberi ",00" supaya tabelnya tidak penuh nol
   yang tidak berarti. */
function formatRupiah(n) {
  const x = Number(n) || 0;
  const desimal = Math.round(x * 100) % 100 !== 0;
  return x.toLocaleString("id-ID", {
    minimumFractionDigits: desimal ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function fundLineAmount(baris) {
  return parseRupiah(baris && baris.amount);
}

function fundLineRate(baris) {
  const r = parseLooseNumber(baris && baris.ppnRate);
  return FUND_PPN_RATES.includes(r) ? r : 0;
}

// PPN per baris, dibulatkan ke rupiah penuh seperti pada tagihannya.
function fundLinePpn(baris) {
  return Math.round((fundLineAmount(baris) * fundLineRate(baris)) / 100);
}

/* Seluruh angka lembar rincian, dihitung dari satu tempat supaya form
   dan surat cetak tidak mungkin menampilkan total yang berbeda. */
function fundLineTotals(lines) {
  const daftar = Array.isArray(lines) ? lines : [];
  let totalNilai = 0;
  let totalPpn = 0;
  let dppPph = 0;

  daftar.forEach((b) => {
    const nilai = fundLineAmount(b);
    totalNilai += nilai;
    totalPpn += fundLinePpn(b);
    // Hanya pos yang dipungut PPN yang masuk dasar PPH 23.
    if (fundLineRate(b) > 0) dppPph += nilai;
  });

  const pph = Math.round((dppPph * FUND_PPH23_RATE) / 100);
  return {
    totalNilai: Math.round(totalNilai),
    totalPpn,
    dppPph: Math.round(dppPph),
    pph,
    /* PPH 23 MEMOTONG, bukan menambah: ia dipungut pemberi kerja dan
       disetor atas nama penyedia jasa, jadi yang dibayarkan ke
       forwarder sudah dikurangi angka itu. */
    grandTotal: Math.round(totalNilai) + totalPpn - pph,
  };
}

/* Baris kosong bawaan: satu baris siap isi, bukan tabel kosong yang
   memaksa pengguna menekan "tambah" dulu. */
function fundLineBaru() {
  /* PPN bawaan 1,1%: itu tarif jasa pengurusan transportasi, yang
     dipungut pada hampir semua pos di tagihan forwarder. Pos yang
     memang tidak dipungut (storage) tinggal diubah ke "—". */
  return { desc: "", amount: "", ppnRate: 1.1 };
}

function fundLinesBersih(lines) {
  return (Array.isArray(lines) ? lines : []).filter(
    (b) => String(b.desc || "").trim() !== "" || fundLineAmount(b) > 0,
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseRupiah,
    formatRupiah,
    FUND_PPN_RATES,
    FUND_PPH23_RATE,
    fundLineAmount,
    fundLineRate,
    fundLinePpn,
    fundLineTotals,
    fundLineBaru,
    fundLinesBersih,
  };
}

/* ------------------------------------------------------------------
   TAMPILAN TABEL RINCIAN

   Data disimpan di satu larik `fundLines`; tabelnya digambar ulang dari
   larik itu, bukan dibaca balik dari DOM. Dengan begitu total di kaki
   tabel tidak mungkin berbeda dari apa yang nanti tersimpan.
------------------------------------------------------------------ */

let fundLines = [fundLineBaru()];

function renderFundLines() {
  const body = document.getElementById("fundLinesBody");
  if (!body) return;
  if (!fundLines.length) fundLines = [fundLineBaru()];

  body.innerHTML = fundLines
    .map(
      (b, i) => `
      <tr data-fl="${i}">
        <td class="fl-no">${i + 1}</td>
        <td><input type="text" data-fl-f="desc" value="${escapeAttr(b.desc || "")}" placeholder="${escapeAttr(t("f.uraian"))}"></td>
        <td class="fl-amt"><input type="text" data-fl-f="amount" inputmode="decimal" value="${escapeAttr(b.amount || "")}" placeholder="0"></td>
        <td class="fl-rate">
          <select data-fl-f="ppnRate">
            ${FUND_PPN_RATES.map(
              (r) =>
                `<option value="${r}"${fundLineRate(b) === r ? " selected" : ""}>${r === 0 ? "—" : r + "%"}</option>`,
            ).join("")}
          </select>
        </td>
        <td class="fl-amt fl-ppn">${formatRupiah(fundLinePpn(b))}</td>
        <td class="fl-act">
          <button type="button" class="rm-row" data-fl-del="${i}" title="${escapeAttr(t("f.hapus.baris"))}">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>
      </tr>`,
    )
    .join("");

  const kaki = document.getElementById("fundLinesFoot");
  if (kaki) {
    const r = fundLineTotals(fundLines);
    kaki.innerHTML = `
      <div class="fl-sum"><span>${escapeHtml(t("f.total.nilai"))}</span><b>Rp. ${formatRupiah(r.totalNilai)}</b></div>
      <div class="fl-sum"><span>${escapeHtml(t("f.total.ppn"))}</span><b>Rp. ${formatRupiah(r.totalPpn)}</b></div>
      <div class="fl-sum fl-sum--minus"><span>${escapeHtml(t("f.potongan.pph23"))}</span><b>- Rp. ${formatRupiah(r.pph)}</b></div>
      <div class="fl-sum fl-sum--total"><span>TOTAL</span><b>Rp. ${formatRupiah(r.grandTotal)}</b></div>`;
  }
}

function setFundLines(lines) {
  const bersih = Array.isArray(lines) && lines.length ? lines.slice() : [fundLineBaru()];
  fundLines = bersih;
  renderFundLines();
}

const fundLinesBodyEl = document.getElementById("fundLinesBody");
if (fundLinesBodyEl) {
  fundLinesBodyEl.addEventListener("input", (e) => {
    const tr = e.target.closest("[data-fl]");
    const f = e.target.dataset.flF;
    if (!tr || !f) return;
    fundLines[Number(tr.dataset.fl)][f] = e.target.value;
    /* Digambar ulang HANYA saat tarif berubah. Menggambar ulang pada
       tiap ketukan akan merebut fokus dari kotak yang sedang diketik;
       kolom PPN & kaki tabel diperbarui langsung di bawah. */
    if (f === "ppnRate") return renderFundLines();
    const baris = fundLines[Number(tr.dataset.fl)];
    const sel = tr.querySelector(".fl-ppn");
    if (sel) sel.textContent = formatRupiah(fundLinePpn(baris));
    const kaki = document.getElementById("fundLinesFoot");
    if (kaki) {
      const r = fundLineTotals(fundLines);
      kaki.querySelectorAll(".fl-sum b")[0].textContent = "Rp. " + formatRupiah(r.totalNilai);
      kaki.querySelectorAll(".fl-sum b")[1].textContent = "Rp. " + formatRupiah(r.totalPpn);
      kaki.querySelectorAll(".fl-sum b")[2].textContent = "- Rp. " + formatRupiah(r.pph);
      kaki.querySelectorAll(".fl-sum b")[3].textContent = "Rp. " + formatRupiah(r.grandTotal);
    }
  });
  fundLinesBodyEl.addEventListener("change", (e) => {
    if (e.target.dataset.flF === "ppnRate") renderFundLines();
  });
  fundLinesBodyEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-fl-del]");
    if (!del) return;
    fundLines.splice(Number(del.dataset.flDel), 1);
    renderFundLines();
  });
}

/* ENTER = turun satu baris, tetap di kolom yang sama.

   Mengisi tabel ini berarti menyalin daftar pos dari tagihan dari atas
   ke bawah; berpindah dengan Tab menyeberang kolom dulu, dan mengetik
   lalu meraih tetikus tiap baris jauh lebih lambat. Di baris terakhir,
   Enter menambah baris baru sekalian -- itu yang hampir selalu
   diinginkan saat masih ada pos tersisa.

   Enter DICEGAH mengirim form: kotak-kotak ini hidup di dalam <form>
   penerbitan nomor, dan tanpa preventDefault satu ketukan Enter akan
   menerbitkan nomor sebelum rinciannya selesai diisi. */
if (fundLinesBodyEl) {
  fundLinesBodyEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const tr = e.target.closest("[data-fl]");
    const f = e.target.dataset.flF;
    if (!tr || !f) return;
    e.preventDefault();

    const idx = Number(tr.dataset.fl);
    if (idx === fundLines.length - 1) {
      fundLines.push(fundLineBaru());
      renderFundLines();
    }
    const berikut = fundLinesBodyEl.querySelector(
      `[data-fl="${idx + 1}"] [data-fl-f="${f}"]`,
    );
    if (berikut) {
      berikut.focus();
      if (typeof berikut.select === "function") berikut.select();
    }
  });
}

const btnFundLineAddEl = document.getElementById("btnFundLineAdd");
if (btnFundLineAddEl) {
  btnFundLineAddEl.addEventListener("click", () => {
    fundLines.push(fundLineBaru());
    renderFundLines();
    const kotak = fundLinesBodyEl.querySelector("tr:last-child [data-fl-f='desc']");
    if (kotak) kotak.focus();
  });
}

renderFundLines();
