"use strict";

/* ==================================================================
   TITLE CASE DI SELURUH ANTARMUKA (desain Peta Laut)

   Permintaan pengguna: semua teks antarmuka yang belum berhuruf kapital
   ditulis Title Case, di setiap halaman. Tiap kata berhuruf besar di
   depan KECUALI kata tugas di tengah ruas (di, ke, dari, dan, yang,
   untuk, atau, ... ; of, and, the, to, ...) -- kaidah judul PUEBI.

   Diterapkan saat DITAMPILKAN, bukan di sumber teksnya. Ribuan teks
   antarmuka (tt(), kamus i18n, HTML) tetap ditulis biasa -- dan teruji
   apa adanya -- lalu modul ini mengubah tampilannya: seluruh teks
   halaman, plus atribut title (tooltip) & placeholder.
   Yang TIDAK disentuh (JK_LEWATI): isian yang sedang diketik (input,
   textarea), kode & nomor monospace, kronologi tulisan pengguna, nomor
   dokumen yang baru terbit, ikon. Label PILIHAN dropdown ikut ("Semua
   baris" -> "Semua Baris"); <option> tanpa atribut value dikunci dulu
   nilainya (jkJagaNilaiOpsi) supaya nilai yang tersimpan tidak berubah.

   Kata yang dibiarkan apa adanya: singkatan berkapital (PIB, CI/PL),
   kapital di tengah (eCOO), menempel angka (40HC, 2x, m3), alamat surel,
   tautan, nama berkas, dan format tanggal (dd-mm-yyyy). Kata tugas yang
   SUDAH berhuruf besar tidak dikecilkan (bisa jadi nama).

   Ringan: satu lintasan saat halaman dimuat, lalu hanya simpul yang
   BARU ditambahkan / diubah (MutationObserver). Teks yang sudah Title
   Case tidak ditulis ulang, jadi tidak memicu dirinya sendiri.
   Di jsdom (tes otomatis) tidak dipasang: teks sumber diuji apa adanya;
   judulKata() sendiri diuji terpisah.
   ================================================================== */

const JK_TUGAS = new Set([
  // Indonesia (PUEBI: kata tugas yang tidak di posisi awal)
  "di", "ke", "dari", "dan", "yang", "untuk", "atau", "pada", "dengan", "oleh", "bagi",
  "dalam", "tentang", "kepada", "terhadap", "sebagai", "daripada", "serta", "per",
  // Inggris
  "a", "an", "the", "and", "or", "nor", "of", "to", "in", "on", "at", "for", "by",
  "with", "from", "as", "vs", "via", "into", "than",
]);

/* Potongan (dipisah spasi) yang dibiarkan utuh: surel, tautan, nama
   berkas, format tanggal / jam. */
const JK_POTONGAN_UTUH =
  /@|:\/\/|^www\.|\.(?:xlsx?|xlsm|pdf|csv|docx?|png|jpe?g|json|txt|zip)\b|^\(?(?:dd|mm|yyyy|yy|hh)(?:[-\/.:](?:dd|mm|yyyy|yy|hh|ss))+\)?[.,;:]?$/i;
// Sesudah tanda ini ruas baru dimulai: kata tugas pertamanya ikut berhuruf besar
const JK_AKHIR_RUAS = /[.!?:·•—–|]$/;
const JK_BUKA_RUAS = /[(\[“"‘']/;
// Singkatan bertitik ("No.", "Tgl.", "PT.", "dll.") bukan akhir ruas
const JK_SINGKATAN = /^(?:no|tgl|jl|pt|cv|kg|dll|dsb|dst|mis|vs|etc|inc|ltd|co|mr|mrs|ms|dr|ir|hlm|[a-z])\.$/i;
const jkAkhirRuas = (potong) => JK_AKHIR_RUAS.test(potong) && !JK_SINGKATAN.test(potong);

/* `lanjutan` = teksnya menyambung kalimat sebelumnya (simpul teks sesudah
   <b>/<a>/<span> sebaris): kata tugas pertamanya tetap kecil --
   "Dipakai sebagai <b>Subject</b> pada form". */
function judulKata(teks, lanjutan) {
  if (typeof teks !== "string" || !/[a-zà-ÿ]/.test(teks)) return teks;
  let mulai = !lanjutan;
  return teks.replace(/\S+/g, (potong) => {
    if (JK_POTONGAN_UTUH.test(potong)) {
      mulai = jkAkhirRuas(potong);
      return potong;
    }
    const baru = potong.replace(/\p{L}[\p{L}'’]*/gu, (kata, pos) => {
      const pertama = mulai || JK_BUKA_RUAS.test(potong[pos - 1] || "");
      mulai = false;
      const sebelum = potong[pos - 1] || "";
      const sesudah = potong[pos + kata.length] || "";
      if (/\p{N}/u.test(sebelum) || /\p{N}/u.test(sesudah)) return kata; // 40HC, 2x, m3
      if (kata.length > 1 && kata === kata.toUpperCase()) return kata; // singkatan
      if (/\p{Lu}/u.test(kata.slice(1))) return kata; // eCOO, iPhone
      if (kata === "x") return kata; // 2 x 40HC
      if (!pertama && kata === kata.toLowerCase() && JK_TUGAS.has(kata)) return kata;
      return kata.charAt(0).toUpperCase() + kata.slice(1);
    });
    mulai = jkAkhirRuas(potong);
    return baru;
  });
}

/* Simpul teks ini menyambung teks sebaris sebelumnya? Dilihat saudara
   sebelumnya (melewati spasi), naik lewat induk sebaris (<b>, <a>, ...).
   Elemen blok, <br> & ikon (<i> tanpa teks) = awal ruas. */
const JK_SEBARIS = new Set(["B", "STRONG", "I", "EM", "SPAN", "A", "SMALL", "ABBR", "MARK", "SUB", "SUP", "U", "S", "TIME", "Q", "CITE", "DFN", "VAR"]);
function jkLanjutan(simpul) {
  for (let n = simpul; n; ) {
    let prev = n.previousSibling;
    while (prev && prev.nodeType === 3 && !prev.data.trim()) prev = prev.previousSibling;
    if (prev) {
      const sebelum = prev.nodeType === 3 ? prev.data.trim() : prev.nodeType === 1 && JK_SEBARIS.has(prev.tagName) ? prev.textContent.trim() : "";
      return !!sebelum && !jkAkhirRuas(sebelum.split(/\s+/).pop());
    }
    const induk = n.parentNode;
    if (!induk || induk.nodeType !== 1 || !JK_SEBARIS.has(induk.tagName)) return false;
    n = induk;
  }
  return false;
}

/* Yang TIDAK diubah: isian yang sedang diketik, kode & nomor bertanda
   monospace, kronologi tulisan pengguna, nomor dokumen yang baru terbit,
   ikon. Seluruh isi elemen ini dilewati. */
const JK_LEWATI = [
  "input", "textarea", "script", "style", "noscript", "code", "kbd", "samp",
  "pre", "svg", "iframe", "[contenteditable]", ".mono", ".font-monospace", ".card-note-text",
  ".docnum-result-number", ".dn-tiket-nomor", ".tanpa-judul", "[data-tanpa-judul]", ".notranslate",
].join(",");

const JK_SARING = {
  acceptNode(n) {
    if (n.nodeType === 1) return n.matches(JK_LEWATI) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
    return NodeFilter.FILTER_ACCEPT;
  },
};

/* <option> tanpa atribut value: nilainya = teksnya. Dikunci ke nilai
   aslinya sebelum labelnya ditulis ulang -- yang terpilih & tersimpan
   tetap sama ("Ahmad Riyan", "1 Set"). */
function jkJagaNilaiOpsi(el) {
  if (el && el.tagName === "OPTION" && !el.hasAttribute("value")) el.setAttribute("value", el.value);
}

function jkUbahTeks(simpul) {
  const induk = simpul.parentElement;
  if (!induk || induk.closest(JK_LEWATI)) return;
  const lama = simpul.data;
  const baru = judulKata(lama, jkLanjutan(simpul));
  if (baru === lama) return;
  jkJagaNilaiOpsi(induk);
  simpul.data = baru;
}

function jkUbahAtribut(el, nama) {
  const lama = el.getAttribute(nama);
  if (!lama || el.closest(".tanpa-judul,[data-tanpa-judul]")) return;
  // Placeholder kotak tanggal ("dd-mm-yyyy") dsb. dijaga JK_POTONGAN_UTUH
  const baru = judulKata(lama);
  if (baru !== lama) el.setAttribute(nama, baru);
}

function jkProsesElemen(akar) {
  if (!akar || akar.nodeType !== 1 || akar.closest(JK_LEWATI)) return;
  // Seluruh teks di bawahnya; anak yang dilewati (JK_LEWATI) tidak dimasuki sama sekali
  const jalan = document.createTreeWalker(akar, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, JK_SARING);
  let n;
  while ((n = jalan.nextNode())) {
    const lama = n.data;
    if (!/[a-z\u00e0-\u00ff]/.test(lama)) continue;
    const baru = judulKata(lama, jkLanjutan(n));
    if (baru === lama) continue;
    jkJagaNilaiOpsi(n.parentElement);
    n.data = baru;
  }
  const beratribut = akar.matches("[title],[placeholder]") ? [akar] : [];
  beratribut.concat([...akar.querySelectorAll("[title],[placeholder]")]).forEach((el) => {
    if (el.hasAttribute("title")) jkUbahAtribut(el, "title");
    if (el.hasAttribute("placeholder")) jkUbahAtribut(el, "placeholder");
  });
}

(function pasangJudulKata() {
  if (typeof document === "undefined" || typeof MutationObserver !== "function") return;
  if (/jsdom/i.test((typeof navigator !== "undefined" && navigator.userAgent) || "")) return;
  const mulaiAmati = () => {
    jkProsesElemen(document.body);
    new MutationObserver((daftar) => {
      for (const m of daftar) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) jkProsesElemen(n);
            else if (n.nodeType === 3) jkUbahTeks(n);
          });
        } else if (m.type === "characterData") jkUbahTeks(m.target);
        else if (m.type === "attributes") jkUbahAtribut(m.target, m.attributeName);
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "placeholder"],
    });
  };
  if (document.body) mulaiAmati();
  else document.addEventListener("DOMContentLoaded", mulaiAmati);
})();
