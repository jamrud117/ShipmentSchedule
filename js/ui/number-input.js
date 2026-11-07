"use strict";

/* ANGKA BERPEMISAH RIBUAN SAAT DIKETIK */

/* PEMBACA ANGKA UNTUK KOTAK ISIAN APLIKASI SENDIRI

   Aturannya PASTI, bukan tebakan: koma = pemisah ribuan, titik =
   pemisah desimal. Itu memang satu-satunya bentuk yang pernah ditulis
   aplikasi ini — formatNumberValue(11319) selalu "11,319" dan
   formatNumberValue(1.05) selalu "1.05".

   parseLooseNumber di bawah menebak, dan tebakannya SELALU salah untuk
   bentuk itu ketika titiknya diikuti tepat tiga angka:

     "1.050"   dibaca 1050    seharusnya 1,05    (berat 1,05 kg jadi 1 ton)
     "11.319"  dibaca 11319   seharusnya 11,319
     "60.000"  dibaca 60000   seharusnya 60

   Tebakan itu ada karena berkas CIPL/PDF dari luar bisa memakai
   bentuk Eropa ("1.234,56"). Itu alasan yang sah — untuk teks yang
   datang dari berkas orang lain. Untuk kotak yang bentuknya ditulis
   aplikasi ini sendiri, tidak ada yang perlu ditebak, dan menebak
   berarti sesekali salah seribu kali lipat.

   Karena itu dua pembaca, bukan satu yang dipaksa melayani keduanya:
   yang ini untuk isian pengguna, parseLooseNumber untuk hasil impor. */
function parseInputNumber(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/,/g, "");   // koma = ribuan, dibuang
  if (!s) return 0;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

/* PEMBACA ANGKA SERBAGUNA — untuk teks dari berkas luar (CIPL/PDF/Excel),
   yang bentuknya tidak kita kendalikan. Menebak koma vs titik dari
   susunan angkanya. */
function parseLooseNumber(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;
  const negatif = /^-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return 0;

  const iKoma = s.lastIndexOf(",");
  const iTitik = s.lastIndexOf(".");
  let posDesimal = -1;

  if (iKoma > -1 && iTitik > -1) {
    posDesimal = Math.max(iKoma, iTitik);
  } else if (iKoma > -1) {
    posDesimal = /^\d{1,3}(,\d{3})+$/.test(s) ? -1 : iKoma;
  } else if (iTitik > -1) {
    posDesimal = /^\d{1,3}(\.\d{3})+$/.test(s) ? -1 : iTitik;
  }

  let bagianBulat = posDesimal > -1 ? s.slice(0, posDesimal) : s;
  let bagianDesimal = posDesimal > -1 ? s.slice(posDesimal + 1) : "";
  bagianBulat = bagianBulat.replace(/[.,]/g, "");
  bagianDesimal = bagianDesimal.replace(/[.,]/g, "");

  const n = Number(
    (bagianBulat || "0") + (bagianDesimal ? "." + bagianDesimal : ""),
  );
  if (!isFinite(n)) return 0;
  return negatif ? -n : n;
}

/* PEMBENTUK TAMPILAN */
function formatNumberTyping(raw) {
  let s = String(raw == null ? "" : raw);
  const negatif = /^\s*-/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return negatif ? "-" : "";

  // Koma diperlakukan sebagai pemisah ribuan (hasil format kita sendiri)
  s = s.replace(/,/g, "");

  // Titik desimal: hanya yang PERTAMA yang dihitung
  const potong = s.split(".");
  let bulat = potong.shift() || "";
  const adaTitik = potong.length > 0;
  let desimal = potong.join("");

  bulat = bulat.replace(/^0+(?=\d)/, ""); // buang nol di depan
  const berkelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  let hasil = berkelompok;
  if (adaTitik) hasil += "." + desimal; // titik dipertahankan walau desimal masih kosong
  return (negatif ? "-" : "") + hasil;
}

// Angka -> tampilan untuk mengisi kotak dari data (bukan dari ketikan)
function formatNumberValue(n) {
  const x = Number(n);
  if (!isFinite(x) || x === 0) return "";
  return formatNumberTyping(String(x));
}

/* PENJAGA POSISI KURSOR */
function hitungDigitSebelum(teks, posisi) {
  return (String(teks).slice(0, posisi).match(/[\d.]/g) || []).length;
}
function posisiSetelahDigitKe(teks, jumlahDigit) {
  if (jumlahDigit <= 0) return 0;
  let n = 0;
  for (let i = 0; i < teks.length; i++) {
    if (/[\d.]/.test(teks[i])) {
      n++;
      if (n === jumlahDigit) return i + 1;
    }
  }
  return teks.length;
}

/* ------------------------------------------------------------------
   RUMUS "=" DI KOTAK ANGKA -- satu pengurai untuk seluruh aplikasi:
   kotak nilai Rincian Biaya Pengajuan Dana (fund-lines.js) dan kotak
   Unit Price, Neto & Bruto tabel barang (item-table.js).
------------------------------------------------------------------ */
/* RUMUS YANG SEDANG DIKETIK ikut diberi koma ribuan, per angkanya:
     "=1000000+250000*2"  ->  "=1,000,000+250,000*2"
   Operator, kurung, dan persen tidak diubah. Bagian desimal (sesudah
   titik) ditulis apa adanya -- di dalam rumus boleh lebih dari dua
   angka. Koma yang diketik sendiri dibuang lalu disusun ulang, sama
   seperti kotak nominal biasa; hitungRumus() membacanya dengan cara
   yang sama. */
function formatRumusKetik(teks) {
  return String(teks == null ? "" : teks).replace(/\d[\d,]*(?:\.\d*)?/g, (angka) => {
    const titik = angka.indexOf(".");
    const bulat = (titik >= 0 ? angka.slice(0, titik) : angka).replace(/,/g, "").replace(/^0+(?=\d)/, "");
    const berkelompok = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return titik >= 0 ? berkelompok + angka.slice(titik) : berkelompok;
  });
}



/* ------------------------------------------------------------------
   RUMUS DI KOTAK NILAI

   Kotak nilai yang diawali "=" dihitung saat Enter atau saat pindah
   kotak, seperti sel spreadsheet:
     =1,000+1,000        -> 2,000
     =(1,500+500)*3      -> 6,000
     =2,200,000*10%      -> 220,000
     =10,000/4           -> 2,500
   Operator: + - * / (juga x, ×, :, ÷), kurung, dan % (= dibagi 100).
   Angkanya bergaya ketik aplikasi seperti kotak nilainya: koma ribuan,
   titik desimal.

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
    const m = /^(\d[\d,]*)(\.\d+)?/.exec(s.slice(i));
    if (!m) gagal();
    i += m[0].length;
    return Number(m[1].replace(/,/g, "") + (m[2] || ""));
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

/* Kotak tabel barang yang menerima rumus "=": Unit Price (USD), Neto &
   Bruto (KG). Rumus dibiarkan apa adanya selama diketik -- angka di
   dalamnya diberi koma ribuan (formatRumusKetik) -- dan dihitung saat
   kotaknya ditinggalkan / Enter (terapkanRumusBarang, item-table.js).
   Qty tidak termasuk: hanya tiga kotak ini yang diminta. */
const NUMBER_INPUT_RUMUS = [
  'table.item-table input[data-f="harga"]',
  'table.item-table input[data-f="netto"]',
  'table.item-table input[data-f="bruto"]',
].join(", ");

/* Rumus yang sedang diketik: koma ribuan per angka, kursor tetap di
   antara karakter yang sama (dihitung dari karakter BUKAN koma di
   kirinya -- operator ikut dihitung, tidak seperti angka biasa). */
function applyLiveRumusFormat(el) {
  const sebelum = el.value;
  const sesudah = formatRumusKetik(sebelum);
  if (sesudah === sebelum) return;
  const kiri = [...sebelum.slice(0, el.selectionStart == null ? sebelum.length : el.selectionStart)].filter((c) => c !== ",").length;
  el.value = sesudah;
  let pos = sesudah.length;
  if (kiri === 0) pos = 0;
  else {
    for (let i = 0, n = 0; i < sesudah.length; i++) {
      if (sesudah[i] !== "," && ++n === kiri) {
        pos = i + 1;
        break;
      }
    }
  }
  try {
    el.setSelectionRange(pos, pos);
  } catch (err) {
    /* kotak tanpa kursor */
  }
}

// Selektor semua isian yang diberlakukan format ini.
const NUMBER_INPUT_SELECTOR = [
  "[data-num]",
  '[data-dn-number]',
  'table.item-table input[data-f="qty"]',
  'table.item-table input[data-f="harga"]',
  'table.item-table input[data-f="netto"]',
  'table.item-table input[data-f="bruto"]',
].join(", ");

function applyLiveNumberFormat(el) {
  if (!el || el.readOnly || el.disabled) return;
  // Rumus "=" di kotak yang menerimanya: bukan angka biasa -- jangan dibuang operatornya
  if (adalahRumus(el.value) && el.matches && el.matches(NUMBER_INPUT_RUMUS)) return applyLiveRumusFormat(el);
  const sebelum = el.value;
  const kursor = el.selectionStart;
  const digitKiri = hitungDigitSebelum(sebelum, kursor);
  const sesudah = formatNumberTyping(sebelum);
  if (sesudah === sebelum) return;
  el.value = sesudah;
  // Hanya kotak teks biasa yang punya selectionStart
  try {
    const posBaru = posisiSetelahDigitKe(sesudah, digitKiri);
    el.setSelectionRange(posBaru, posBaru);
  } catch (err) {
    /* abaikan — kotak yang tidak mendukung pengaturan kursor */
  }
}

/* NOMOR URUT -- [data-hanya-angka]: bilangan bulat tanpa pemisah ribuan
   (nomor dokumen berikutnya "036", bukan "36" atau "3,600"). Selain
   angka dibuang saat diketik; kursor tetap di tempatnya. */
function applyDigitOnly(el) {
  const sebelum = el.value;
  const sesudah = sebelum.replace(/\D/g, "");
  if (sesudah === sebelum) return;
  const kursor = el.selectionStart == null ? sesudah.length : el.selectionStart;
  const digitKiri = (sebelum.slice(0, kursor).match(/\d/g) || []).length;
  el.value = sesudah;
  try {
    el.setSelectionRange(digitKiri, digitKiri);
  } catch (err) {
    /* abaikan */
  }
}

// Satu pendengar untuk seluruh halaman: isian yang dibuat belakangan (baris barang baru
document.addEventListener("input", (e) => {
  if (!e.target.closest) return;
  const el = e.target.closest(NUMBER_INPUT_SELECTOR);
  if (el) applyLiveNumberFormat(el);
  else if (e.target.matches("[data-hanya-angka]")) applyDigitOnly(e.target);
});

// Rapikan sekali lagi saat kotak ditinggalkan
document.addEventListener(
  "blur",
  (e) => {
    const el = e.target.closest && e.target.closest(NUMBER_INPUT_SELECTOR);
    if (!el || el.readOnly || el.disabled) return;
    const bersih = el.value.replace(/\.$/, "");
    if (bersih !== el.value) el.value = bersih;
  },
  true,
);
