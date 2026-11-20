"use strict";

/* ------------------------------------------------------------------
   FORMAT NOMOR DOKUMEN -- BISA DIATUR

   Bentuk nomor tiap jenis dokumen (Commercial / Non-Commercial Invoice,
   Surat Jalan Export / Lokal, Pengajuan Dana, Surat Keluar -- juga bentuk
   khusus pembeli, mis. invoice KUMHO) tidak lagi tertanam di kode:
   baris "Format nomor" di kotak Atur Nomor Urut (halaman Nomor Dokumen,
   khusus EXIM) membuka kotak Ubah untuk jenis yang sedang aktif.

   Yang diketik boleh berupa KODE ({SEQ}/EXIM/DDI/{ROM}/{YYYY}) atau
   CONTOH NOMOR HARI INI apa adanya ("346/EXIM/DDI/XI/2026",
   "INV-20261120-0001") -- sistem mengenali bagian tanggalnya (tanggal
   hari ini dalam bentuk YYYYMMDD, YYMMDD, YYYYMM, YYMM, YYYY, bulan
   romawi, bulan 2 angka di samping tahun) dan menjadikan kelompok angka
   TERAKHIR yang tersisa nomor urutnya; banyak digitnya = panjang angka
   itu ("0001" = 4 digit). Pratinjau bulan ini & bulan depan tampil
   selagi mengetik.

   Kode: {SEQ} nomor urut · {YYYY} {YY} tahun · {MM} bulan 01-12 · {ROM}
   bulan romawi I-XII · {DD} tanggal · {YYYYMMDD} {YYMMDD} {YYYYMM} {YYMM}
   gabungan. (Pola bawaan lama menulis bulan romawi sebagai {MM}; kini
   {ROM}, dan {MM} = bulan dua angka seperti di Doc No bawaan.)

   Nomor urut TIDAK dimulai ulang karena formatnya berganti: seri yang
   berjalan melanjutkan (Atur Nomor Urut -> Reset untuk memulai ulang).
   Tanggal di nomor = Tanggal dokumen di form (docNumTemplate).

   Tersimpan di report_settings kunci "format-nomor-dokumen" -- sama
   untuk semua pengguna, hanya EXIM yang menulis (RLS), diperbarui lewat
   realtime -- dengan salinan di peramban supaya nomor yang diajukan
   sebelum pengaturannya termuat sudah memakai format terakhir.
------------------------------------------------------------------ */
const FORMAT_NOMOR_KUNCI = "format-nomor-dokumen";
const FORMAT_NOMOR_SIMPANAN = "exim.formatNomor";
const FORMAT_NOMOR_MAKS = 60; // huruf
const FORMAT_NOMOR_DIGIT = [1, 8];
const FN_ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const FN_KODE = {
  YYYYMMDD: (iso) => iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10),
  YYMMDD: (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10),
  YYYYMM: (iso) => iso.slice(0, 4) + iso.slice(5, 7),
  YYMM: (iso) => iso.slice(2, 4) + iso.slice(5, 7),
  YYYY: (iso) => iso.slice(0, 4),
  YY: (iso) => iso.slice(2, 4),
  MM: (iso) => iso.slice(5, 7),
  DD: (iso) => iso.slice(8, 10),
  ROM: (iso) => FN_ROMAWI[Number(iso.slice(5, 7)) - 1] || "",
};
const FN_KODE_RE = /\{(YYYYMMDD|YYMMDD|YYYYMM|YYMM|YYYY|YY|MM|DD|ROM|SEQ)\}/gi;

// { [kunci jenis]: { pola, digit } } -- hanya yang diubah dari bawaan kode
let formatNomorAtur = {};
let formatNomorJanji = null;
let formatNomorSibuk = false;
let formatNomorUbahan = 0; // hasil muat yang dimulai sebelum penyimpanan = basi

const fnIso = (tanggal) => (/^\d{4}-\d{2}-\d{2}/.test(String(tanggal || "")) ? String(tanggal).slice(0, 10) : todayISO());

// Satu bentuk: tanpa karakter kendali & spasi di ujung, kode berhuruf besar
function fnRapikan(pola) {
  return String(pola == null ? "" : pola)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(FN_KODE_RE, (_, k) => `{${k.toUpperCase()}}`);
}

/* Kode tanggal diisi (nomor urut dibiarkan {SEQ} -- diisi database saat
   nomor terbit, next_document_number). */
function fnIsiTanggal(pola, tanggal) {
  const iso = fnIso(tanggal);
  return String(pola || "").replace(FN_KODE_RE, (cocok, k) => {
    const kode = k.toUpperCase();
    return kode === "SEQ" ? "{SEQ}" : FN_KODE[kode](iso);
  });
}

// Nomor lengkap untuk pratinjau
function fnContoh(pola, digit, seq, tanggal) {
  return fnIsiTanggal(pola, tanggal).replace(/\{SEQ\}/g, String(seq).padStart(digit || 3, "0"));
}

/* CONTOH NOMOR -> FORMAT. "346/EXIM/DDI/XI/2026" -> { pola:
   "{SEQ}/EXIM/DDI/{ROM}/{YYYY}", digit: 3 }. Yang sudah berkode
   dibiarkan (digit: null = ikut isian digit). Kelompok angka dicocokkan
   UTUH (tidak menempel ke angka lain) dengan tanggal `tanggal`; bulan 2
   angka hanya bila formatnya juga memuat tahun (11 saja bisa nomor
   urut). Tanggal bergabung yang menempel di depan nomor urut
   ("20261120001") dipisah: {YYYYMMDD}{SEQ}. */
function fnDariContoh(teks, tanggal) {
  const awal = fnRapikan(teks);
  if (!awal || awal.search(FN_KODE_RE) >= 0) return { pola: awal, digit: null, dariContoh: false };
  const iso = fnIso(tanggal);
  const bagian = awal.match(/\d+|[A-Za-z]+|[^\dA-Za-z]+/g) || [];
  const kode = bagian.map(() => null);
  const ADA_TAHUN = ["YYYYMMDD", "YYMMDD", "YYYYMM", "YYMM", "YYYY", "YY"];
  const angka = (i) => /^\d+$/.test(bagian[i]);
  // 1. Tanggal utuh & gabungan, tahun
  bagian.forEach((b, i) => {
    if (!angka(i)) return;
    const k = ["YYYYMMDD", "YYMMDD", "YYYYMM", "YYMM", "YYYY"].find((x) => FN_KODE[x](iso) === b);
    if (k) kode[i] = `{${k}}`;
  });
  // 2. Bulan romawi (kata utuh, huruf besar)
  bagian.forEach((b, i) => {
    if (!kode[i] && /^[IVX]+$/.test(b) && b === FN_KODE.ROM(iso)) kode[i] = "{ROM}";
  });
  const adaTahun = kode.some((k) => k && ADA_TAHUN.some((x) => k === `{${x}}`));
  // 3. Bulan 2 angka -- hanya di samping tahun ("2026/11", "11-2026")
  if (adaTahun) {
    bagian.forEach((b, i) => {
      if (kode[i] || !angka(i) || b !== FN_KODE.MM(iso)) return;
      const dekat = [i - 2, i + 2].some((j) => kode[j] && /Y/.test(kode[j]));
      if (dekat) kode[i] = "{MM}";
    });
  }
  // 4. Nomor urut: kelompok angka TERAKHIR yang tersisa -- tanggal yang menempel di depannya dipisah
  let digit = null;
  for (let i = bagian.length - 1; i >= 0; i--) {
    if (!angka(i) || kode[i]) continue;
    const k = ["YYYYMMDD", "YYMMDD", "YYYYMM", "YYMM"].find((x) => bagian[i].length > FN_KODE[x](iso).length && bagian[i].startsWith(FN_KODE[x](iso)));
    digit = bagian[i].length - (k ? FN_KODE[k](iso).length : 0);
    kode[i] = k ? `{${k}}{SEQ}` : "{SEQ}";
    break;
  }
  return { pola: bagian.map((b, i) => kode[i] || b).join(""), digit, dariContoh: true };
}

/* Pesan galat, atau "" bila format boleh dipakai. */
function fnPeriksa(pola, digit) {
  const p = fnRapikan(pola);
  if (!p) return tt("Format nomor harus diisi.", "The number format is required.");
  if (p.length > FORMAT_NOMOR_MAKS)
    return tt(`Format nomor paling panjang ${FORMAT_NOMOR_MAKS} huruf.`, `The number format can have at most ${FORMAT_NOMOR_MAKS} characters.`);
  const asing = p.replace(FN_KODE_RE, "").match(/\{[^{}]*\}/);
  if (asing)
    return tt(
      `Kode ${asing[0]} tidak dikenal — pakai {SEQ}, {YYYY}, {YY}, {MM}, {ROM}, {DD}, {YYYYMMDD}, {YYMMDD}, {YYYYMM} atau {YYMM}.`,
      `Unknown code ${asing[0]} — use {SEQ}, {YYYY}, {YY}, {MM}, {ROM}, {DD}, {YYYYMMDD}, {YYMMDD}, {YYYYMM} or {YYMM}.`,
    );
  const seq = (p.match(/\{SEQ\}/g) || []).length;
  if (seq !== 1)
    return seq
      ? tt("Nomor urut {SEQ} hanya boleh sekali.", "The sequence {SEQ} may appear only once.")
      : tt("Tidak ada nomor urut — tulis {SEQ}, atau sertakan angka nomor urut di contohnya (mis. 001).", "No sequence number — write {SEQ}, or include the sequence digits in the example (e.g. 001).");
  const d = Number(digit);
  if (!Number.isInteger(d) || d < FORMAT_NOMOR_DIGIT[0] || d > FORMAT_NOMOR_DIGIT[1])
    return tt(`Digit nomor urut harus ${FORMAT_NOMOR_DIGIT[0]}–${FORMAT_NOMOR_DIGIT[1]}.`, `The sequence digits must be ${FORMAT_NOMOR_DIGIT[0]}–${FORMAT_NOMOR_DIGIT[1]}.`);
  return "";
}

/* Pengaturan tersimpan dirapikan; entri yang tidak sah (diubah di luar
   aplikasi) dibuang -- jenis itu kembali ke bawaan kode. */
function fnNilai(v) {
  const hasil = {};
  const daftar = v && typeof v === "object" && v.format && typeof v.format === "object" ? v.format : {};
  Object.keys(daftar).forEach((k) => {
    const x = daftar[k] || {};
    const pola = fnRapikan(x.pola);
    const digit = Number(x.digit);
    if (/^[\w@-]{1,60}$/.test(k) && !fnPeriksa(pola, digit)) hasil[k] = { pola, digit };
  });
  return hasil;
}

(function fnBacaSimpanan() {
  try {
    formatNomorAtur = fnNilai(JSON.parse(localStorage.getItem(FORMAT_NOMOR_SIMPANAN) || "null"));
  } catch (e) {
    formatNomorAtur = {};
  }
})();

// Format yang diatur untuk satu kunci jenis ("fund", "invoice", "invoice@kumho-vn"), atau null = bawaan kode
function formatNomorUntuk(kunci) {
  return formatNomorAtur[kunci] || null;
}

/* ---------- muat & simpan ---------- */

function formatNomorTerapkan(nilai) {
  formatNomorAtur = nilai || {};
  try {
    localStorage.setItem(FORMAT_NOMOR_SIMPANAN, JSON.stringify({ format: formatNomorAtur }));
  } catch (e) {
    /* penyimpanan peramban diblokir: tetap berlaku selama halaman terbuka */
  }
  // Pratinjau nomor & baris format di kotak Atur Nomor Urut ikut berganti
  if (typeof refreshDocNumPreview === "function" && typeof docNumActiveTab !== "undefined" && document.documentElement.dataset.halaman === "docnum")
    refreshDocNumPreview(docNumActiveTab, { diam: true });
}

function formatNomorMuat() {
  if (typeof supabaseClient === "undefined" || !supabaseClient) return Promise.resolve();
  const ubahanAwal = formatNomorUbahan;
  formatNomorJanji = (async () => {
    try {
      const { data, error } = await supabaseClient.from("report_settings").select("key, value").eq("key", FORMAT_NOMOR_KUNCI).maybeSingle();
      if (error) throw error;
      if (formatNomorSibuk || ubahanAwal !== formatNomorUbahan) return;
      formatNomorTerapkan(fnNilai(data && data.value));
    } catch (e) {
      console.error(e); // tidak terbaca: salinan di peramban / bawaan kode tetap dipakai
    }
  })();
  return formatNomorJanji;
}

/* Sebelum nomor terbit: pengaturan yang sedang dimuat ditunggu, paling
   lama 1,5 detik (jaringan yang menggantung tidak boleh menahan
   penerbitan; saat itu yang berlaku dipakai). */
function formatNomorSiap() {
  if (!formatNomorJanji) return Promise.resolve();
  return Promise.race([formatNomorJanji, new Promise((selesai) => setTimeout(selesai, 1500))]);
}

async function formatNomorSimpan(kunci, nilaiBaru) {
  if (!requireEdit() || formatNomorSibuk) return false;
  const sebelum = formatNomorAtur;
  const baru = Object.assign({}, formatNomorAtur);
  if (nilaiBaru) baru[kunci] = nilaiBaru;
  else delete baru[kunci];
  formatNomorSibuk = true;
  formatNomorUbahan++;
  formatNomorTerapkan(baru); // langsung terlihat; dibatalkan kalau gagal disimpan
  let galat = null;
  try {
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: FORMAT_NOMOR_KUNCI,
      value: { format: baru },
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    galat = error;
  } catch (e) {
    galat = e;
  }
  formatNomorSibuk = false;
  if (galat) {
    console.error(galat);
    formatNomorTerapkan(sebelum);
    showToast(
      tt("Format nomor gagal disimpan. Pastikan migration-report-settings.sql sudah dijalankan.", "The number format could not be saved. Make sure migration-report-settings.sql has been run."),
      "danger",
    );
    return false;
  }
  return true;
}

/* ---------- baris "Format nomor" di kotak Atur Nomor Urut ---------- */

/* Jenis yang sedang aktif + bentuk khusus pembeli (invoice KUMHO): kunci
   pengaturan, nama, format berlaku & bawaannya. */
function formatNomorKonteks() {
  if (typeof resolveDocNumType !== "function" || typeof docNumActiveTab === "undefined") return null;
  const jenis = resolveDocNumType(docNumActiveTab);
  if (!jenis.key) return null;
  const prof = typeof docNumProfilPola === "function" ? docNumProfilPola(docNumActiveTab) : null;
  if (prof) {
    const kunci = `${jenis.key}@${prof.id}`;
    const atur = formatNomorUntuk(kunci);
    return { kunci, nama: `${jenis.label} — ${prof.nama}`, pola: atur ? atur.pola : prof.pola, digit: atur ? atur.digit : jenis.padBawaan || jenis.pad, bawaan: prof.pola, diatur: !!atur };
  }
  const atur = formatNomorUntuk(jenis.key);
  return { kunci: jenis.key, nama: jenis.label, pola: jenis.pattern, digit: jenis.pad, bawaan: jenis.patternBawaan || jenis.pattern, diatur: !!atur };
}

function formatNomorGambar(seqBerikut) {
  const wadah = $("#formatNomorBaris");
  if (!wadah) return;
  const k = formatNomorKonteks();
  if (!k) return;
  const contoh = fnContoh(k.pola, k.digit, seqBerikut || 1, (typeof readDocNumForm === "function" ? readDocNumForm(docNumActiveTab).docDate : "") || todayISO());
  $("#formatNomorPola").textContent = k.pola;
  $("#formatNomorContoh").textContent = contoh;
  $("#formatNomorPola").title = k.diatur ? tt(`Diatur · bawaan: ${k.bawaan}`, `Customised · default: ${k.bawaan}`) : tt("Bawaan", "Default");
  wadah.classList.toggle("is-diatur", k.diatur);
  const tombol = $("#btnFormatNomor");
  if (tombol) tombol.setAttribute("aria-label", tt(`Ubah format nomor ${k.nama}`, `Change the ${k.nama} number format`));
}

// Pratinjau di bawah kotak Format: bulan ini & bulan depan (nomor urut melanjutkan)
function fnPratinjau(teks, digitIsian, seq) {
  const tafsir = fnDariContoh(teks);
  const digit = tafsir.digit || Number(digitIsian);
  const galat = fnPeriksa(tafsir.pola, digit);
  if (galat) return { galat, tafsir, digit };
  const iso = todayISO();
  const depan = typeof fundDocNoBulanDepan === "function" ? fundDocNoBulanDepan(iso) : iso;
  const kini = fnContoh(tafsir.pola, digit, seq, iso);
  const nanti = fnContoh(tafsir.pola, digit, seq + 1, depan);
  const dibaca = tafsir.dariContoh ? tt(`Dibaca sebagai ${tafsir.pola} (${digit} digit). `, `Read as ${tafsir.pola} (${digit} digits). `) : "";
  return { teks: dibaca + tt(`Nomor berikutnya: ${kini} · bulan depan: ${nanti}`, `Next number: ${kini} · next month: ${nanti}`), tafsir, digit };
}

function formatNomorBukaUbah() {
  if (!requireEdit()) return;
  const k = formatNomorKonteks();
  if (!k) return;
  const seq = (typeof counterCtx !== "undefined" && counterCtx.lastSeq ? counterCtx.lastSeq : 0) + 1;
  const kodeTeks = "{SEQ} nomor urut · {YYYY} / {YY} tahun · {MM} bulan 01–12 · {ROM} bulan romawi · {DD} tanggal · {YYYYMMDD}, {YYMMDD}, {YYYYMM}, {YYMM}";
  showPrompt({
    title: tt(`Format nomor — ${k.nama}`, `Number format — ${k.nama}`),
    desc: tt(
      `Ketik dengan kode, atau ketik contoh nomor HARI INI apa adanya (mis. ${fnContoh(k.bawaan, k.digit, seq)}) — tanggal di dalamnya dikenali sendiri, angka terakhir jadi nomor urut. Kosongkan untuk kembali ke bawaan (${k.bawaan}). Nomor urut tidak dimulai ulang. Kode: ${kodeTeks}.`,
      `Type it with codes, or type TODAY's number as is (e.g. ${fnContoh(k.bawaan, k.digit, seq)}) — its date parts are recognised, the last number becomes the sequence. Leave empty to return to the default (${k.bawaan}). The sequence does not restart. Codes: ${kodeTeks}.`,
    ),
    icon: "bi-hash",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "pola", label: tt("Format", "Format"), value: k.diatur ? k.pola : "", placeholder: k.pola, lebar: "", hint: fnPratinjau(k.pola, k.digit, seq).teks },
      /* Bukan isian angka bawaan peramban (roda gulir mengubah nilainya diam-diam):
         kotak teks berpapan angka, selain angka dibuang saat diketik. */
      { key: "digit", label: tt("Digit nomor urut", "Sequence digits"), inputmode: "numeric", value: String(k.digit || 3), lebar: "sepertiga",
        placeholder: `${FORMAT_NOMOR_DIGIT[0]}–${FORMAT_NOMOR_DIGIT[1]}` },
    ],
    onSubmit: (v) => {
      const teks = String(v.pola || "").trim();
      if (!teks) return formatNomorSimpan(k.kunci, null).then((ok) => (ok ? true : tt("Gagal disimpan. Coba lagi.", "Could not be saved. Try again.")));
      const p = fnPratinjau(teks, v.digit, seq);
      if (p.galat) return p.galat;
      return formatNomorSimpan(k.kunci, { pola: p.tafsir.pola, digit: p.digit }).then((ok) => (ok ? true : tt("Gagal disimpan. Coba lagi.", "Could not be saved. Try again.")));
    },
  });
  // Pratinjau langsung: format & digit
  const isian = $("#prompt_pola");
  const digit = $("#prompt_digit");
  const petunjuk = isian && isian.closest(".prompt-field").querySelector(".prompt-hint");
  const segarkan = () => {
    const teks = isian.value.trim() || k.pola;
    const p = fnPratinjau(teks, digit ? digit.value : k.digit, seq);
    if (petunjuk) petunjuk.textContent = p.galat || p.teks;
    // Contoh yang menyebut banyak digit: isian digit ikut
    if (p.tafsir.dariContoh && p.tafsir.digit && digit && document.activeElement !== digit) digit.value = String(p.tafsir.digit);
  };
  if (isian) isian.addEventListener("input", segarkan);
  if (digit) {
    digit.maxLength = 1;
    digit.addEventListener("input", () => {
      const angka = digit.value.replace(/\D/g, "");
      if (angka !== digit.value) digit.value = angka;
      segarkan();
    });
  }
}

const formatNomorBarisEl = $("#formatNomorBaris");
if (formatNomorBarisEl) formatNomorBarisEl.addEventListener("click", (e) => {
  if (e.target.closest("#btnFormatNomor")) formatNomorBukaUbah();
});
