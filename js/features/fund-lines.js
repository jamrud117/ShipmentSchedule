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
  // Rumus yang belum dihitung ("=1000+") bukan angka -- jangan dibaca
  // sebagian ("1000") seolah-olah nilainya.
  if (/^\s*=/.test(String(v))) return 0;
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

/* FORMAT KETIKAN NOMINAL, gaya Indonesia: titik ribuan, koma desimal.
     "133434343" -> "133.434.343"     "420,5" -> "420,5"

   BUKAN formatNumberTyping() milik aplikasi: yang itu menulis gaya
   Inggris (koma ribuan), sementara nominal di sini dibaca parseRupiah()
   yang memperlakukan koma sebagai DESIMAL -- "133,434,343" akan
   terbaca 133,43. Titik yang diketik pengguna dibuang lalu disusun
   ulang: di konvensi ini titik hanyalah pemisah ribuan. Desimal
   dibatasi dua angka (sen). */
function formatRupiahKetik(mentah) {
  if (typeof mentah === "number") {
    return isFinite(mentah) && mentah !== 0 ? formatRupiah(mentah) : "";
  }
  const teks = String(mentah == null ? "" : mentah);
  const negatif = /^\s*-/.test(teks);
  const s = teks.replace(/[^\d,]/g, "");
  if (!s) return negatif ? "-" : "";
  const koma = s.indexOf(",");
  let bulat = koma >= 0 ? s.slice(0, koma) : s;
  bulat = bulat.replace(/^0+(?=\d)/, "");
  const berkelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const hasil = koma >= 0
    ? `${berkelompok || "0"},${s.slice(koma + 1).replace(/,/g, "").slice(0, 2)}`
    : berkelompok;
  return (negatif ? "-" : "") + hasil;
}

/* Kursor tetap di antara angka yang sama setelah titik ribuan disisipkan
   atau dipindah -- dihitung dari jumlah angka (dan koma) di kirinya,
   bukan dari posisi karakter yang bergeser tiap kali titik bertambah. */
function formatKotakRupiah(el) {
  const sebelum = el.value;
  // Rumus sedang diketik: dibiarkan apa adanya sampai Enter / pindah kotak.
  if (/^\s*=/.test(sebelum)) return;
  const kiri = (sebelum.slice(0, el.selectionStart || 0).match(/[\d,]/g) || []).length;
  const sesudah = formatRupiahKetik(sebelum);
  if (sesudah === sebelum) return;
  el.value = sesudah;
  let pos = sesudah.length;
  if (kiri === 0) pos = /^-/.test(sesudah) ? 1 : 0;
  else {
    for (let i = 0, n = 0; i < sesudah.length; i++) {
      if (/[\d,]/.test(sesudah[i]) && ++n === kiri) { pos = i + 1; break; }
    }
  }
  try { el.setSelectionRange(pos, pos); } catch (err) { /* kotak tanpa kursor */ }
}

function fundLineAmount(baris) {
  return parseRupiah(baris && baris.amount);
}

function fundLineRate(baris) {
  const r = parseLooseNumber(baris && baris.ppnRate);
  return FUND_PPN_RATES.includes(r) ? r : 0;
}

/* ------------------------------------------------------------------
   RUMUS DI KOTAK NILAI

   Kotak nilai yang diawali "=" dihitung saat Enter atau saat pindah
   kotak, seperti sel spreadsheet:
     =1.000+1.000        -> 2.000
     =(1.500+500)*3      -> 6.000
     =2.200.000*10%      -> 220.000
     =10.000/4           -> 2.500
   Operator: + - * / (juga x, ×, :, ÷), kurung, dan % (= dibagi 100).
   Angkanya gaya Indonesia seperti isian lainnya: titik ribuan, koma
   desimal.

   Dihitung dengan pengurai sendiri, BUKAN eval(): isi kotak adalah
   ketikan bebas, dan eval() akan menjalankannya sebagai kode.
------------------------------------------------------------------ */
function hitungRumus(teks) {
  const s = String(teks == null ? "" : teks)
    .trim()
    .replace(/^=/, "")
    .replace(/\s+/g, "")
    .replace(/[x×X]/g, "*")
    .replace(/[:÷]/g, "/");
  if (!s) return NaN;
  let i = 0;
  const gagal = () => { throw new Error("rumus"); };
  function angka() {
    const m = /^(\d[\d.]*)(,\d+)?/.exec(s.slice(i));
    if (!m) gagal();
    i += m[0].length;
    return Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2].slice(1) : ""));
  }
  function faktor() {
    if (s[i] === "-") { i++; return -faktor(); }
    if (s[i] === "+") { i++; return faktor(); }
    let v;
    if (s[i] === "(") {
      i++;
      v = jumlah();
      if (s[i] !== ")") gagal();
      i++;
    } else {
      v = angka();
    }
    if (s[i] === "%") { i++; v /= 100; }
    return v;
  }
  function kali() {
    let v = faktor();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = faktor();
      if (op === "/") { if (r === 0) gagal(); v /= r; } else v *= r;
    }
    return v;
  }
  function jumlah() {
    let v = kali();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = kali();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = jumlah();
    return i === s.length && isFinite(v) ? v : NaN;
  } catch (err) {
    return NaN;
  }
}

const adalahRumus = (v) => /^\s*=/.test(String(v == null ? "" : v));

/* Menghitung rumus di satu kotak. true = kotaknya kini berisi angka
   (atau memang bukan rumus); false = rumusnya tidak valid -- kotak
   ditandai merah dan teksnya dibiarkan supaya bisa diperbaiki. */
function terapkanRumusKotak(el, persen) {
  if (!adalahRumus(el.value)) {
    el.classList.remove("fl-rumus-salah");
    el.removeAttribute("title");
    return true;
  }
  const hasil = hitungRumus(el.value);
  if (!isFinite(hasil)) {
    el.classList.add("fl-rumus-salah");
    el.title = tt(
      "Rumus tidak valid. Contoh: =1.000+500, =2.200.000*10%, =(1.000+500)/2",
      "Invalid formula. Examples: =1.000+500, =2.200.000*10%, =(1.000+500)/2",
    );
    return false;
  }
  el.classList.remove("fl-rumus-salah");
  el.removeAttribute("title");
  const bulat = Math.round(hasil * 100) / 100;
  el.value = persen
    ? String(bulat).replace(".", ",")
    : bulat === 0 ? "0" : formatRupiahKetik(bulat);
  return true;
}

/* ------------------------------------------------------------------
   DISKON SEBAGAI BARIS SENDIRI

   Diskon ditulis sebagai baris rincian tersendiri (mis. "Base
   Discount") yang nilainya MENGURANGI, bukan menambah -- persis seperti
   di tagihan forwarder. Nilainya rupiah langsung, atau PERSEN dari pos
   BIAYA terdekat di atasnya (jadi letakkan baris diskon tepat di bawah
   pos yang didiskon).

   Baris diskon punya tarif PPN sendiri, dan tarif itu MENGURANGI PPN:
   diskon 1.987.451 bertarif 1,1% memotong PPN 21.862. Hasilnya sama
   persis dengan PPN yang dihitung dari nilai setelah diskon -- cara
   tagihan berdiskon dihitung. Bawaannya mengikuti tarif pos di atasnya;
   "—" berarti diskon itu tidak mengurangi dasar pajak. Dasar PPH 23
   ikut berkurang dengan cara yang sama.
------------------------------------------------------------------ */
const FUND_JENIS_DISKON = "diskon";
const barisDiskon = (b) => !!b && b.jenis === FUND_JENIS_DISKON;

function parsePersenDiskon(v) {
  if (adalahRumus(v)) return 0;
  const n = parseFloat(String(v == null ? "" : v).replace(",", ".").replace(/[^\d.]/g, ""));
  return isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
}

/* Data dengan model diskon LAMA -- kolom diskon di setiap pos, sempat
   dipakai sebentar -- dipecah jadi pos + baris diskon tepat di
   bawahnya. Totalnya tidak berubah: tarif PPN baris diskonnya sama
   dengan posnya, dan diskon persen dihitung dari pos yang sama. */
function normalisasiBarisDana(lines) {
  const hasil = [];
  (Array.isArray(lines) ? lines : []).forEach((b) => {
    if (!b) return;
    if (barisDiskon(b)) {
      hasil.push(b);
      return;
    }
    const { disc, discType, ...pos } = b;
    hasil.push(pos);
    if (String(disc == null ? "" : disc).trim() !== "" && parseRupiah(disc) !== 0) {
      hasil.push({
        jenis: FUND_JENIS_DISKON,
        desc: "Diskon",
        amount: String(disc),
        discType: discType === "rp" ? "rp" : "pct",
        ppnRate: pos.ppnRate,
      });
    }
  });
  return hasil;
}

/* Nilai rupiah BERTANDA setiap baris: pos biaya positif, diskon
   negatif. Diskon persen butuh pos di atasnya, jadi dihitung berurutan
   untuk seluruh tabel, bukan per baris. */
function fundLineValues(lines) {
  let dasar = 0;
  return (Array.isArray(lines) ? lines : []).map((b) => {
    if (!barisDiskon(b)) {
      const v = fundLineAmount(b);
      dasar = v;
      return v;
    }
    const v = b.discType === "pct"
      ? Math.round((dasar * parsePersenDiskon(b.amount)) / 100)
      : Math.abs(parseRupiah(b.amount));
    return v ? -v : 0;
  });
}

// PPN dari nilai bertanda sebuah baris (negatif untuk diskon).
function fundLinePpnNilai(nilai, baris) {
  const p = Math.round((nilai * fundLineRate(baris)) / 100);
  return p === 0 ? 0 : p;
}

// PPN sebuah pos BIAYA, dibulatkan ke rupiah penuh seperti di tagihan.
function fundLinePpn(baris) {
  return barisDiskon(baris) ? 0 : fundLinePpnNilai(fundLineAmount(baris), baris);
}

/* Seluruh angka lembar rincian, dihitung dari satu tempat supaya form
   dan surat cetak tidak mungkin menampilkan total yang berbeda. */
function fundLineTotals(lines) {
  const daftar = normalisasiBarisDana(lines);
  const nilai = fundLineValues(daftar);
  let totalNilai = 0;
  let totalDiskon = 0;
  let totalPpn = 0;
  let dppPph = 0;
  daftar.forEach((b, i) => {
    const v = nilai[i];
    if (v >= 0) totalNilai += v;
    else totalDiskon -= v;
    totalPpn += fundLinePpnNilai(v, b);
    // Hanya baris yang dipungut PPN yang masuk dasar PPH 23 -- dengan
    // nilai bertandanya, jadi diskon ikut mengurangi dasarnya.
    if (fundLineRate(b) > 0) dppPph += v;
  });
  const totalNet = Math.round(totalNilai) - totalDiskon;
  const pph = Math.max(0, Math.round((dppPph * FUND_PPH23_RATE) / 100));
  return {
    totalNilai: Math.round(totalNilai), // pos biaya, SEBELUM diskon
    totalDiskon,
    totalNet, // setelah diskon, sebelum pajak
    totalPpn,
    dppPph: Math.round(dppPph),
    pph,
    /* PPH 23 MEMOTONG, bukan menambah: ia dipungut pemberi kerja dan
       disetor atas nama penyedia jasa, jadi yang dibayarkan ke
       forwarder sudah dikurangi angka itu. */
    grandTotal: totalNet + totalPpn - pph,
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

// Baris diskon baru: tarif PPN mengikuti pos yang didiskonnya.
function fundLineDiskonBaru(tarif) {
  return { jenis: FUND_JENIS_DISKON, desc: "", amount: "", discType: "rp", ppnRate: tarif };
}

function fundLinesBersih(lines) {
  return normalisasiBarisDana(lines).filter(
    (b) => String(b.desc || "").trim() !== "" || String(b.amount || "").trim() !== "",
  );
}

// Rumus yang belum valid -- dicegah ikut tersimpan sebagai teks.
function fundLinesRumusGagal(lines) {
  return (Array.isArray(lines) ? lines : []).some((b) => adalahRumus(b && b.amount));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseRupiah,
    formatRupiah,
    hitungRumus,
    FUND_PPN_RATES,
    FUND_PPH23_RATE,
    fundLineAmount,
    fundLineRate,
    fundLinePpn,
    fundLineValues,
    fundLineTotals,
    fundLineBaru,
    fundLinesBersih,
    normalisasiBarisDana,
  };
}

/* ------------------------------------------------------------------
   TAMPILAN TABEL RINCIAN

   Data disimpan di satu larik `fundLines`; tabelnya digambar ulang dari
   larik itu, bukan dibaca balik dari DOM. Dengan begitu total di kaki
   tabel tidak mungkin berbeda dari apa yang nanti tersimpan.
------------------------------------------------------------------ */

let fundLines = [fundLineBaru()];

// Nilai tersimpan -> isi kotak. Rumus yang belum valid dibiarkan utuh.
const isiKotakNilai = (b) =>
  adalahRumus(b.amount)
    ? b.amount
    : barisDiskon(b) && b.discType === "pct"
      ? b.amount || ""
      : formatRupiahKetik(b.amount || "");

const teksPpnSel = (v) => (v < 0 ? "- " + formatRupiah(-v) : formatRupiah(v));

function pilihanTarifHtml(b) {
  return FUND_PPN_RATES.map(
    (r) => `<option value="${r}"${fundLineRate(b) === r ? " selected" : ""}>${r === 0 ? "—" : r + "%"}</option>`,
  ).join("");
}

/* Nominal diskon dalam rupiah, di KOTAK BACA-SAJA sebaris dengan kotak
   isiannya -- bukan teks di bawahnya, yang membuat baris diskon lebih
   tinggi dari baris lain dan kotak-kotaknya tidak sejajar. Terutama
   untuk diskon persen, yang nilai rupiahnya tidak terlihat dari
   kotaknya sendiri; di mode Rp ia menegaskan tanda minusnya. */
const teksNominalDiskon = (v) => (v ? "- " + formatRupiah(-v) : "0");

function barisRincianHtml(b, i, v) {
  const tombolHapus = `
        <td class="fl-act">
          <button type="button" class="rm-row" data-fl-del="${i}" title="${escapeAttr(t("f.hapus.baris"))}">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>`;
  const kotakNilai = `<input type="text" data-fl-f="amount" inputmode="decimal" value="${escapeAttr(isiKotakNilai(b))}" placeholder="0">`;
  if (!barisDiskon(b)) {
    return `
      <tr data-fl="${i}">
        <td class="fl-no">${i + 1}</td>
        <td><input type="text" data-fl-f="desc" value="${escapeAttr(b.desc || "")}" placeholder="${escapeAttr(t("f.uraian"))}"></td>
        <td class="fl-amt">${kotakNilai}</td>
        <td class="fl-rate"><select data-fl-f="ppnRate">${pilihanTarifHtml(b)}</select></td>
        <td class="fl-amt fl-ppn">${teksPpnSel(fundLinePpnNilai(v, b))}</td>${tombolHapus}
      </tr>`;
  }
  return `
      <tr data-fl="${i}" class="fl-row-diskon">
        <td class="fl-no">${i + 1}</td>
        <td>
          <div class="fl-desc-diskon">
            <span class="fl-tag-diskon">${escapeHtml(tt("Diskon", "Discount"))}</span>
            <input type="text" data-fl-f="desc" value="${escapeAttr(b.desc || "")}" placeholder="${escapeAttr(tt("Keterangan diskon", "Discount description"))}">
          </div>
        </td>
        <td class="fl-amt">
          <div class="fl-disc-in">
            ${kotakNilai}
            <select data-fl-f="discType" aria-label="${escapeAttr(tt("Jenis diskon", "Discount type"))}">
              <option value="rp"${b.discType !== "pct" ? " selected" : ""}>Rp</option>
              <option value="pct"${b.discType === "pct" ? " selected" : ""}>%</option>
            </select>
            <!-- Hasil hitungan: TANPA data-fl-f, jadi tidak pernah dibaca
                 sebagai isian, dan dilewati Tab. -->
            <input type="text" class="fl-disc-nominal" readonly tabindex="-1"
              value="${escapeAttr(teksNominalDiskon(v))}"
              aria-label="${escapeAttr(tt("Nominal diskon", "Discount amount"))}">
          </div>
        </td>
        <td class="fl-rate"><select data-fl-f="ppnRate">${pilihanTarifHtml(b)}</select></td>
        <td class="fl-amt fl-ppn">${teksPpnSel(fundLinePpnNilai(v, b))}</td>${tombolHapus}
      </tr>`;
}

function renderFundLines() {
  const body = document.getElementById("fundLinesBody");
  if (!body) return;
  fundLines = normalisasiBarisDana(fundLines);
  if (!fundLines.length) fundLines = [fundLineBaru()];
  const nilai = fundLineValues(fundLines);
  body.innerHTML = fundLines.map((b, i) => barisRincianHtml(b, i, nilai[i])).join("");
  gambarKakiRincian();
}

/* Sel hasil hitungan SEMUA baris diperbarui tanpa menggambar ulang
   kotak isian (yang akan merebut fokus dari kotak yang sedang
   diketik). Semua baris, bukan hanya yang diketik: diskon persen
   bergantung pada pos di atasnya. */
function perbaruiHitunganRincian() {
  const nilai = fundLineValues(fundLines);
  fundLines.forEach((b, i) => {
    const tr = document.querySelector(`#fundLinesBody [data-fl="${i}"]`);
    if (!tr) return;
    const ppn = tr.querySelector(".fl-ppn");
    if (ppn) ppn.textContent = teksPpnSel(fundLinePpnNilai(nilai[i], b));
    const nominal = tr.querySelector(".fl-disc-nominal");
    if (nominal) nominal.value = teksNominalDiskon(nilai[i]);
  });
  gambarKakiRincian();
}

/* Kaki tabel digambar ulang UTUH setiap kali -- baris "Total Diskon"
   muncul dan hilang, dan kaki tabel tidak berisi kotak isian, jadi
   menggambarnya ulang tidak merebut fokus. */
function gambarKakiRincian() {
  const kaki = document.getElementById("fundLinesFoot");
  if (!kaki) return;
  const r = fundLineTotals(fundLines);
  kaki.innerHTML = `
      <div class="fl-sum"><span>${escapeHtml(t("f.total.nilai"))}</span><b>Rp. ${formatRupiah(r.totalNilai)}</b></div>
      ${r.totalDiskon ? `<div class="fl-sum fl-sum--minus"><span>${escapeHtml(tt("Total Diskon", "Total Discount"))}</span><b>- Rp. ${formatRupiah(r.totalDiskon)}</b></div>` : ""}
      <div class="fl-sum"><span>${escapeHtml(t("f.total.ppn"))}</span><b>Rp. ${formatRupiah(r.totalPpn)}</b></div>
      <div class="fl-sum fl-sum--minus"><span>${escapeHtml(t("f.potongan.pph23"))}</span><b>- Rp. ${formatRupiah(r.pph)}</b></div>
      <div class="fl-sum fl-sum--total"><span>TOTAL</span><b>Rp. ${formatRupiah(r.grandTotal)}</b></div>`;
}

function setFundLines(lines) {
  fundLines = Array.isArray(lines) && lines.length ? lines.slice() : [fundLineBaru()];
  renderFundLines();
}

const kotakPersen = (b, f) => f === "amount" && barisDiskon(b) && b.discType === "pct";

const fundLinesBodyEl = document.getElementById("fundLinesBody");
if (fundLinesBodyEl) {
  fundLinesBodyEl.addEventListener("input", (e) => {
    const tr = e.target.closest("[data-fl]");
    const f = e.target.dataset.flF;
    if (!tr || !f) return;
    const baris = fundLines[Number(tr.dataset.fl)];
    if (f === "amount") {
      // Rupiah ikut titik ribuan; persen dibiarkan ("2,5"); rumus dibiarkan
      // sampai Enter / pindah kotak (formatKotakRupiah sendiri melewatinya).
      if (!kotakPersen(baris, f)) formatKotakRupiah(e.target);
      if (!adalahRumus(e.target.value)) {
        e.target.classList.remove("fl-rumus-salah");
        e.target.removeAttribute("title");
      }
    }
    baris[f] = e.target.value;
    // Tarif / jenis diskon: digambar ulang. Selain itu hanya sel hitungan,
    // supaya fokus tidak direbut dari kotak yang sedang diketik.
    if (f === "ppnRate" || f === "discType") return renderFundLines();
    perbaruiHitunganRincian();
  });
  /* Pilihan (tarif PPN, jenis diskon) DISIMPAN di sini juga sebelum
     tabel digambar ulang -- tidak mengandalkan event "input" yang
     kebetulan ikut terpicu pada <select> di peramban modern. */
  fundLinesBodyEl.addEventListener("change", (e) => {
    const f = e.target.dataset.flF;
    if (f !== "ppnRate" && f !== "discType") return;
    const tr = e.target.closest("[data-fl]");
    if (tr) fundLines[Number(tr.dataset.fl)][f] = e.target.value;
    renderFundLines();
  });
  // Pindah kotak = rumus dihitung, seperti menekan Enter.
  fundLinesBodyEl.addEventListener("focusout", (e) => {
    if (e.target.dataset.flF !== "amount") return;
    const tr = e.target.closest("[data-fl]");
    if (!tr || !adalahRumus(e.target.value)) return;
    const baris = fundLines[Number(tr.dataset.fl)];
    terapkanRumusKotak(e.target, kotakPersen(baris, "amount"));
    baris.amount = e.target.value;
    perbaruiHitunganRincian();
  });
  fundLinesBodyEl.addEventListener("click", (e) => {
    const del = e.target.closest("[data-fl-del]");
    if (!del) return;
    fundLines.splice(Number(del.dataset.flDel), 1);
    renderFundLines();
  });
}

/* ENTER = hitung rumus (kalau ada), lalu turun satu baris di kolom yang
   sama -- seperti spreadsheet.

   Mengisi tabel ini berarti menyalin daftar pos dari tagihan dari atas
   ke bawah; berpindah dengan Tab menyeberang kolom dulu, dan mengetik
   lalu meraih tetikus tiap baris jauh lebih lambat. Di baris terakhir,
   Enter menambah baris baru sekalian. Rumus yang TIDAK valid menahan
   kursor di kotaknya supaya bisa langsung diperbaiki.

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
    if (f === "amount" && adalahRumus(e.target.value)) {
      const baris = fundLines[idx];
      const ok = terapkanRumusKotak(e.target, kotakPersen(baris, f));
      baris.amount = e.target.value;
      perbaruiHitunganRincian();
      if (!ok) return;
    }
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

/* Tambah Diskon: baris diskon di ujung tabel, bertarif PPN sama dengan
   pos biaya terakhir -- pos yang hampir selalu sedang didiskon. */
const btnFundDiscAddEl = document.getElementById("btnFundDiscAdd");
if (btnFundDiscAddEl) {
  btnFundDiscAddEl.addEventListener("click", () => {
    const posTerakhir = [...fundLines].reverse().find((b) => !barisDiskon(b));
    fundLines.push(fundLineDiskonBaru(posTerakhir ? fundLineRate(posTerakhir) : 0));
    renderFundLines();
    const kotak = fundLinesBodyEl.querySelector("tr:last-child [data-fl-f='amount']");
    if (kotak) kotak.focus();
  });
}

renderFundLines();
