"use strict";

/* ------------------------------------------------------------------
   DOC NO PADA FORM PENGAJUAN DANA

   Kotak "Doc No" di form, diketik manual, ADA UNTUK SEMUA VENDOR dan
   isinya selalu tersimpan (jadi bisa dicari di riwayat, dan tampil di
   kotak Detail). Yang dibedakan per vendor hanya CETAKANNYA: baris
   "Doc No" di bawah No Surat tercetak untuk SEMUA vendor KECUALI yang
   ada di daftar "Doc No tidak dicetak" -- bawaannya PRIME dan WIDE.

   Daftar yang sama juga menentukan penanda tangan keempat (CFO):
   hanya vendor di luar daftar yang ditandatangani CFO, dan isian CFO
   di form ikut tersembunyi untuk vendor di daftar.

   DAFTARNYA BISA DIATUR dari halaman Nomor Dokumen (kotak "Aturan Doc
   No" di tab Pengajuan Dana, khusus EXIM). Vendor berikutnya yang Doc
   No-nya tidak dicetak cukup ditambahkan di sana -- tanpa mengubah
   kode.

   Tersimpan di tabel report_settings (kunci-nilai, RLS: semua peran
   membaca, hanya EXIM menulis) supaya SAMA untuk semua pengguna. Kalau
   disimpan per peramban, pengajuan yang sama bisa tercetak dengan Doc
   No di satu komputer dan tanpa di komputer lain.

   SATU fungsi, fundPakaiDocNo(), dipakai form DAN cetakannya -- jadi
   keduanya tidak mungkin berbeda pendapat. Artinya: "pengajuan vendor
   ini mencetak Doc No (dan penanda tangan keempat, CFO -- bawaan Mr. Kim
   Taewan, Chief Financial Officer, isian cfoName/cfoRole)". Namanya
   tetap `Pakai` walau kotak Doc No di form kini selalu ada.
------------------------------------------------------------------ */
const FUND_DOCNO_BAWAAN = ["PRIME", "WIDE"];
const FUND_DOCNO_KUNCI = "fund-doc-no-tanpa-vendor";
const FUND_DOCNO_MAKS = 40; // banyaknya vendor di daftar
const FUND_DOCNO_MAKS_HURUF = 60;

/* Kata yang ada di hampir semua nama badan usaha. Entri yang HANYA
   berisi kata-kata ini akan mengenai hampir semua vendor -- Doc No
   tidak tercetak di semua pengajuan -- jadi ditolak saat ditambahkan. */
const FUND_DOCNO_KATA_UMUM = ["PT", "CV", "UD", "TBK", "PERSERO", "CO", "LTD", "INC", "CORP", "LLC", "PTE", "SDN", "BHD"];

/* Daftar yang sedang berlaku: bawaan sampai pengaturannya selesai
   dimuat, dan seterusnya kalau memang belum pernah diubah. */
let fundDocNoTanpa = FUND_DOCNO_BAWAAN.slice();
let fundDocNoJanjiMuat = null; // janji pemuatan yang sedang berjalan
let fundDocNoSibuk = false; // sedang menyimpan

/* Nama -> deretan katanya, huruf besar. Tanda baca & spasi hanyalah
   pemisah: "PT. Prime-Cargo" -> ["PT", "PRIME", "CARGO"]. */
function fundDocNoKata(teks) {
  return String(teks == null ? "" : teks)
    .toUpperCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/* Satu bentuk untuk tiap entri daftar: " pt.  prime " -> "PT PRIME". */
function fundDocNoRapikan(teks) {
  return fundDocNoKata(teks).join(" ");
}

/* Daftar dirapikan: tiap entri satu bentuk, tanpa kosong, tanpa kembar. */
function fundDocNoBersihkan(daftar) {
  const hasil = [];
  (Array.isArray(daftar) ? daftar : []).forEach((v) => {
    const rapi = fundDocNoRapikan(v).slice(0, FUND_DOCNO_MAKS_HURUF).trim();
    if (rapi && hasil.indexOf(rapi) < 0 && hasil.length < FUND_DOCNO_MAKS) hasil.push(rapi);
  });
  return hasil;
}

/* Apakah nama vendor memuat entri itu sebagai KATA UTUH yang berurutan?

   Per kata, bukan per huruf: "PT WIDE INDONESIA" dan "PRIME CARGO"
   kena, "DHL WORLDWIDE EXPRESS" dan "PRIMERA" tidak -- WORLDWIDE memang
   memuat huruf w-i-d-e, tapi bukan vendor WIDE. Entri lebih dari satu
   kata ("KAS NEGARA") harus muncul berurutan. */
function fundDocNoCocok(kataVendor, kataEntri) {
  if (!kataEntri.length) return false;
  for (let i = 0; i + kataEntri.length <= kataVendor.length; i++) {
    if (kataEntri.every((k, j) => kataVendor[i + j] === k)) return true;
  }
  return false;
}

function fundPakaiDocNo(payee) {
  const kata = fundDocNoKata(payee);
  return !fundDocNoTanpa.some((vendor) => fundDocNoCocok(kata, fundDocNoKata(vendor)));
}

/* Pesan galat untuk entri baru, atau "" kalau boleh ditambahkan. */
function fundDocNoPeriksa(teks) {
  const rapi = fundDocNoRapikan(teks);
  if (!rapi) return tt("Nama vendor harus diisi.", "Vendor name is required.");
  if (rapi.length < 2) return tt("Nama vendor terlalu pendek.", "The vendor name is too short.");
  if (rapi.length > FUND_DOCNO_MAKS_HURUF)
    return tt(`Nama vendor paling panjang ${FUND_DOCNO_MAKS_HURUF} huruf.`, `The vendor name can have at most ${FUND_DOCNO_MAKS_HURUF} characters.`);
  if (fundDocNoKata(rapi).every((k) => FUND_DOCNO_KATA_UMUM.indexOf(k) >= 0))
    return tt(
      `"${rapi}" ada di hampir semua nama vendor — Doc No tidak akan tercetak di semua pengajuan. Tulis nama vendornya, mis. PRIME.`,
      `"${rapi}" appears in almost every vendor name — Doc No would not be printed on any request. Enter the vendor's own name, e.g. PRIME.`,
    );
  if (fundDocNoTanpa.indexOf(rapi) >= 0) return tt(`${rapi} sudah ada di daftar.`, `${rapi} is already on the list.`);
  if (fundDocNoTanpa.length >= FUND_DOCNO_MAKS)
    return tt(`Daftar sudah penuh (${FUND_DOCNO_MAKS} vendor).`, `The list is full (${FUND_DOCNO_MAKS} vendors).`);
  return "";
}

/* ---------- form ---------- */

/* Kotak DOC NO selalu tampil dan bisa diisi, apa pun vendornya -- isinya
   tersimpan untuk semua pengajuan (bisa dicari, tampil di Detail). Yang
   mengikuti "Dibayarkan Kepada" hanya dua hal:

   - Keterangan di bawah kotak Doc No: "tercetak di bawah No Surat" atau,
     untuk vendor di daftar Aturan Doc No (PRIME & WIDE), "tersimpan
     saja, tidak dicetak" -- supaya yang mengetik tahu kenapa baris Doc
     No tidak ada di suratnya.
   - Isian penanda tangan keempat (CFO): disembunyikan sekaligus
     dinonaktifkan untuk vendor di daftar. readDocNumForm() melewati
     isian nonaktif, jadi isiannya tidak tersimpan untuk mereka. */
function fundSelaraskanDocNo(panel) {
  const wadah = panel && panel.querySelector(".fund-docno");
  if (!wadah) return;
  const kotakPayee = panel.querySelector('[data-dn="payee"]');
  const pakai = fundPakaiDocNo(kotakPayee && kotakPayee.value);
  [
    [".fund-docno-cetak", pakai],
    [".fund-docno-tak-cetak", !pakai],
  ].forEach(([kelas, tampil]) => {
    const ket = wadah.querySelector(kelas);
    if (ket) ket.classList.toggle("d-none", !tampil);
  });
  panel.querySelectorAll(".fund-ttd-cfo").forEach((el) => {
    el.classList.toggle("d-none", !pakai);
    el.querySelectorAll("[data-dn]").forEach((f) => {
      f.disabled = !pakai;
    });
  });
}

/* ---------- Doc No bawaan: POLANYA BISA DIATUR ----------

   Form pengajuan BARU (pertama dibuka, dikosongkan, sesudah nomor
   terbit) diisi Doc No bawaan menurut POLA, mis. Distribution-{YYMM}-0000
   -> Distribution-2611-0000 di November 2026: {YYMM} = tahun & bulan
   BERJALAN (todayISO), jadi tinggal nomor urutnya yang diganti -- kotaknya
   memilih angka di ujung ("0000") begitu diklik.

   POLANYA BISA DIATUR dari kotak "Aturan Doc No" (baris "Doc No bawaan",
   tombol Ubah): pola berikutnya cukup diketik di sana, tanpa mengubah
   kode. Bawaan kodenya Distribution-{YYMM}-0000 (sebelumnya EI-{YYMM}-
   0000). Tersimpan di report_settings kunci "fund-doc-no-bawaan" -- sama
   untuk semua pengguna, hanya EXIM yang menulis (RLS) -- dengan salinan
   di peramban ("exim.fundDocNoBawaan") supaya form yang terbuka sebelum
   pengaturannya selesai dimuat sudah memakai pola terakhir.

   Kode di pola: {YYMM}, {YYYYMM}, {YYYY}, {YY}, {MM}. Doc No bulan ini
   yang diketik apa adanya ("Distribution-2611-0000") dibaca sebagai
   pola: tahun & bulan berjalan di dalamnya jadi {YYYYMM} / {YYMM}
   (fundDocNoPolaDariContoh). Pola kosong = form baru tidak diisi.

   Bawaan bukan nomor sungguhan. Doc No tidak wajib, jadi bawaan yang
   dibiarkan TIDAK ikut tersimpan (fundDocNoTanpaBawaan, dipanggil
   readDocNumForm) dan tidak tercetak; keterangan di bawah kotak
   mengatakannya selama belum diganti. Yang dianggap bawaan: isian menurut
   pola yang berlaku untuk BULAN MANA PUN -- juga milik bulan lalu yang
   tersisa di draf -- dan menurut pola-pola SEBELUMNYA (riwayat `lama` di
   pengaturannya, pola bawaan kode, dan EI-{YYMM}-0000). Selama masih
   bawaan isinya ikut berganti ke bulan berjalan & ke pola terbaru.

   Kotak yang sudah diketik / dikosongkan sendiri tidak diisi lagi
   sampai formnya dikosongkan. Pengajuan tersimpan yang dibuka untuk
   diubah tidak pernah diberi bawaan: Doc No yang tidak pernah ada tidak
   boleh mendadak muncul di sana. */
const FUND_DOCNO_POLA_BAWAAN = "Distribution-{YYMM}-0000";
// Pola yang pernah berlaku sebelum bisa diatur: sisanya di draf tetap bawaan
const FUND_DOCNO_POLA_TERDAHULU = ["EI-{YYMM}-0000"];
const FUND_DOCNO_POLA_KUNCI = "fund-doc-no-bawaan";
const FUND_DOCNO_POLA_SIMPANAN = "exim.fundDocNoBawaan";
const FUND_DOCNO_POLA_MAKS = 60; // huruf
const FUND_DOCNO_POLA_RIWAYAT = 10; // pola sebelumnya yang tetap dikenali
const FUND_DOCNO_KODE = {
  YYYYMM: (iso) => iso.slice(0, 4) + iso.slice(5, 7),
  YYYY: (iso) => iso.slice(0, 4),
  YYMM: (iso) => iso.slice(2, 4) + iso.slice(5, 7),
  YY: (iso) => iso.slice(2, 4),
  MM: (iso) => iso.slice(5, 7),
};
const FUND_DOCNO_KODE_RE = /\{(YYYYMM|YYYY|YYMM|YY|MM)\}/gi;

function fundDocNoIso(tanggal) {
  return /^\d{4}-\d{2}/.test(String(tanggal || "")) ? String(tanggal) : todayISO();
}

// Pola satu bentuk: tanpa karakter kendali & spasi di ujung, kode berhuruf besar
function fundDocNoPolaRapikan(pola) {
  return String(pola == null ? "" : pola)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(FUND_DOCNO_KODE_RE, (_, k) => `{${k.toUpperCase()}}`);
}

/* Doc No bulan ini yang diketik apa adanya -> pola. Tahun & bulan
   berjalan yang berdiri sendiri (tidak menempel ke angka lain) jadi
   kodenya: "Distribution-2611-0000" -> "Distribution-{YYMM}-0000",
   "DIST-202611-0000" -> "DIST-{YYYYMM}-0000". Pola yang sudah memuat
   kode dibiarkan. */
function fundDocNoPolaDariContoh(teks, tanggal) {
  const pola = fundDocNoPolaRapikan(teks);
  if (!pola || pola.search(FUND_DOCNO_KODE_RE) >= 0) return pola;
  const iso = fundDocNoIso(tanggal);
  for (const kode of ["YYYYMM", "YYMM"]) {
    const re = new RegExp(`(^|\\D)${FUND_DOCNO_KODE[kode](iso)}(?!\\d)`);
    if (re.test(pola)) return pola.replace(re, (_, depan) => `${depan}{${kode}}`);
  }
  return pola;
}

/* Pesan galat untuk pola, atau "" kalau boleh dipakai (kosong boleh:
   form baru tidak diisi Doc No). */
function fundDocNoPolaPeriksa(pola) {
  const p = fundDocNoPolaRapikan(pola);
  if (!p) return "";
  if (p.length > FUND_DOCNO_POLA_MAKS)
    return tt(`Doc No bawaan paling panjang ${FUND_DOCNO_POLA_MAKS} huruf.`, `The default Doc No can have at most ${FUND_DOCNO_POLA_MAKS} characters.`);
  const sisa = p.replace(FUND_DOCNO_KODE_RE, "");
  const asing = sisa.match(/\{[^{}]*\}/);
  if (asing)
    return tt(
      `Kode ${asing[0]} tidak dikenal — pakai {YYMM}, {YYYYMM}, {YYYY}, {YY} atau {MM}.`,
      `Unknown code ${asing[0]} — use {YYMM}, {YYYYMM}, {YYYY}, {YY} or {MM}.`,
    );
  /* Harus ada huruf / tanda selain angka: pola "{YYMM}" saja membuat
     setiap Doc No 4 angka yang diketik dianggap bawaan -- tidak tersimpan. */
  if (!/[^\d\s]/.test(sisa))
    return tt(
      "Doc No bawaan harus memuat huruf atau tanda selain tahun, bulan & angka, mis. Distribution-2611-0000.",
      "The default Doc No must contain letters or symbols besides the year, month & digits, e.g. Distribution-2611-0000.",
    );
  return "";
}

/* Nilai pengaturan { pola, lama } dirapikan; null = belum pernah
   disimpan. Pola tersimpan yang tidak sah (diubah di luar aplikasi)
   diganti bawaan kode. */
function fundDocNoPolaNilai(v) {
  if (!v || typeof v !== "object" || typeof v.pola !== "string") return null;
  const pola = fundDocNoPolaRapikan(v.pola);
  const sah = (p) => !!p && !fundDocNoPolaPeriksa(p);
  return {
    pola: !pola || sah(pola) ? pola : FUND_DOCNO_POLA_BAWAAN,
    lama: (Array.isArray(v.lama) ? v.lama : [])
      .map(fundDocNoPolaRapikan)
      .filter((p, i, a) => sah(p) && a.indexOf(p) === i)
      .slice(0, FUND_DOCNO_POLA_RIWAYAT),
  };
}

function fundDocNoPolaBacaSimpanan() {
  try {
    return fundDocNoPolaNilai(JSON.parse(localStorage.getItem(FUND_DOCNO_POLA_SIMPANAN) || "null"));
  } catch (e) {
    return null;
  }
}

const fundDocNoPolaAwal = fundDocNoPolaBacaSimpanan();
let fundDocNoPolaBerlaku = fundDocNoPolaAwal ? fundDocNoPolaAwal.pola : FUND_DOCNO_POLA_BAWAAN;
let fundDocNoPolaLama = fundDocNoPolaAwal ? fundDocNoPolaAwal.lama : [];

function fundDocNoIsiPola(pola, tanggal) {
  const iso = fundDocNoIso(tanggal);
  return String(pola || "").replace(FUND_DOCNO_KODE_RE, (_, k) => FUND_DOCNO_KODE[k.toUpperCase()](iso));
}

// Doc No bawaan bulan berjalan (atau bulan `tanggal`); "" kalau polanya kosong
function fundDocNoBawaan(tanggal) {
  return fundDocNoIsiPola(fundDocNoPolaBerlaku, tanggal);
}

/* Pola -> { re, urut }: `re` mengenali isian menurut pola itu untuk
   bulan mana pun (huruf besar-kecil sama saja), `urut` = angka di ujung
   pola -- nomor urut yang tinggal diganti -- atau "". */
const FUND_DOCNO_LEBAR_KODE = { YYYYMM: 6, YYYY: 4, YYMM: 4, YY: 2, MM: 2 };
const fundDocNoPengenalSimpanan = new Map();
function fundDocNoPengenal(pola) {
  let hasil = fundDocNoPengenalSimpanan.get(pola);
  if (hasil) return hasil;
  const lolos = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let sumber = "";
  let i = 0;
  pola.replace(FUND_DOCNO_KODE_RE, (cocok, k, posisi) => {
    sumber += `${lolos(pola.slice(i, posisi))}\\d{${FUND_DOCNO_LEBAR_KODE[k.toUpperCase()]}}`;
    i = posisi + cocok.length;
    return cocok;
  });
  sumber += lolos(pola.slice(i));
  hasil = { re: new RegExp(`^${sumber}$`, "i"), urut: (pola.match(/(\d+)$/) || ["", ""])[1] };
  fundDocNoPengenalSimpanan.set(pola, hasil);
  return hasil;
}

// Semua pola yang dikenali sebagai bawaan; yang berlaku paling depan
function fundDocNoPolaDikenal() {
  return [fundDocNoPolaBerlaku, ...fundDocNoPolaLama, FUND_DOCNO_POLA_BAWAAN, ...FUND_DOCNO_POLA_TERDAHULU].filter(
    (p, i, a) => p && a.indexOf(p) === i,
  );
}

// Pengenal pola yang membentuk isian ini, atau null kalau bukan bawaan
function fundDocNoPolaIsian(v) {
  const teks = String(v == null ? "" : v).trim();
  if (!teks) return null;
  for (const pola of fundDocNoPolaDikenal()) {
    const pengenal = fundDocNoPengenal(pola);
    if (pengenal.re.test(teks)) return pengenal;
  }
  return null;
}

function fundDocNoAdalahBawaan(v) {
  return !!fundDocNoPolaIsian(v);
}

// Isi Doc No yang disimpan: bawaan yang belum diganti = tidak ada Doc No
function fundDocNoTanpaBawaan(v) {
  return fundDocNoAdalahBawaan(v) ? "" : String(v == null ? "" : v).trim();
}

/* Keterangan di bawah kotak selama isinya bawaan. Teksnya dirakit di
   sini, bukan data-en tetap: angka yang harus diganti mengikuti polanya
   ("0000", "000", atau tidak ada). */
function fundDocNoKeterangan(panel) {
  const ket = panel && panel.querySelector ? panel.querySelector("#fundDocNoBawaanKet") : null;
  const kotak = panel && panel.querySelector ? panel.querySelector('[data-dn="docNo"]') : null;
  if (!ket) return;
  const pengenal = kotak && !kotak.disabled ? fundDocNoPolaIsian(kotak.value) : null;
  ket.classList.toggle("d-none", !pengenal);
  if (!pengenal) return;
  const urut = pengenal.urut;
  ket.textContent = urut
    ? tt(
        `Ganti ${urut} dengan nomor urut Doc No — dibiarkan ${urut}, Doc No tidak ikut tersimpan.`,
        `Replace ${urut} with the Doc No sequence number — left as ${urut}, no Doc No is saved.`,
      )
    : tt(
        "Lengkapi Doc No bawaan ini — dibiarkan begini, Doc No tidak ikut tersimpan.",
        "Complete this default Doc No — left as is, no Doc No is saved.",
      );
}

/* `baru` = form baru saja dikosongkan / pertama dibuka: kotak kosong
   diisi bawaan. Tanpa itu (penyelarasan biasa) hanya bawaan yang masih
   utuh yang diperbarui ke bulan berjalan & pola terbaru -- kotak yang
   sengaja dikosongkan tetap kosong. `tadinyaBawaan`: isinya bawaan
   menurut pola SEBELUM pengaturannya berganti (fundDocNoPolaTerapkan). */
function fundIsiDocNoBawaan(panel, baru, tadinyaBawaan) {
  if (!panel || !panel.matches || !panel.matches('[data-docnum-panel="fund"]')) return;
  const kotak = panel.querySelector('[data-dn="docNo"]');
  if (!kotak) return;
  /* Sedang mengubah pengajuan tersimpan: panelnya dipinjam pop-up Ubah
     Isian (mulaiUbahDocNum memindahkannya ke #dnEditBadan SEBELUM form
     dikosongkan, dnEditingId baru dipasang sesudahnya) -- tidak disentuh. */
  const sedangUbah = (typeof dnEditingId !== "undefined" && !!dnEditingId) || !!panel.closest("#dnEditBadan, #dnEditModal");
  const kini = kotak.value.trim();
  if (!sedangUbah && !kotak.disabled && ((baru && !kini) || tadinyaBawaan || fundDocNoAdalahBawaan(kini))) {
    const bawaan = fundDocNoBawaan();
    if (kotak.value !== bawaan) kotak.value = bawaan;
  }
  fundDocNoKeterangan(panel);
}

/* Klik / fokus ke kotak yang masih bawaan: nomor urut di ujungnya
   ("0000") langsung terpilih, tinggal diketik; pola tanpa nomor urut ->
   kursor di ujung. Ditunda sesaat -- klik menaruh kursor SESUDAH fokus,
   dan pilihan yang dibuat sebelum itu akan hilang. */
function fundDocNoPilihUrut(kotak) {
  if (!kotak || !fundDocNoAdalahBawaan(kotak.value)) return;
  const pilih = () => {
    const pengenal = document.activeElement === kotak ? fundDocNoPolaIsian(kotak.value) : null;
    if (!pengenal) return;
    const n = kotak.value.replace(/\s+$/, "").length;
    try {
      kotak.setSelectionRange(n - pengenal.urut.length, n);
    } catch (e) {
      /* kotak tanpa kursor */
    }
  };
  pilih();
  setTimeout(pilih, 0);
}

document.addEventListener("focusin", (e) => {
  const kotak = e.target && e.target.closest ? e.target.closest('[data-docnum-panel="fund"] [data-dn="docNo"]') : null;
  if (kotak) fundDocNoPilihUrut(kotak);
});
document.addEventListener("input", (e) => {
  const kotak = e.target && e.target.closest ? e.target.closest('[data-docnum-panel="fund"] [data-dn="docNo"]') : null;
  if (kotak) fundDocNoKeterangan(kotak.closest("[data-docnum-panel]"));
});

/* ---------- mengatur pola Doc No bawaan ---------- */

function fundDocNoBulanDepan(iso) {
  let y = +iso.slice(0, 4);
  let m = +iso.slice(5, 7) + 1;
  if (m > 12) {
    m = 1;
    y++;
  }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/* Pratinjau pola untuk kotak Ubah: isinya bulan ini & bulan depan, atau
   galatnya. */
function fundDocNoPolaPratinjau(pola) {
  const galat = fundDocNoPolaPeriksa(pola);
  if (galat) return galat;
  if (!pola) return tt("Kosong: form baru tidak diisi Doc No.", "Empty: new forms get no Doc No.");
  const iso = todayISO();
  const kini = fundDocNoIsiPola(pola, iso);
  const nanti = fundDocNoIsiPola(pola, fundDocNoBulanDepan(iso));
  return kini === nanti
    ? tt(
        `Form baru: ${kini} — sama setiap bulan. Kode {YYMM}, {YYYY} atau {MM} mengikuti bulan berjalan.`,
        `New forms: ${kini} — the same every month. The codes {YYMM}, {YYYY} or {MM} follow the current month.`,
      )
    : tt(`Bulan ini: ${kini} · bulan depan: ${nanti}`, `This month: ${kini} · next month: ${nanti}`);
}

// Baris "Doc No bawaan" di kotak Aturan Doc No: contoh bulan berjalan
function fundDocNoPolaGambar() {
  const nilai = $("#fundDocNoPolaNilai");
  if (!nilai) return;
  const contoh = fundDocNoBawaan();
  nilai.textContent = contoh || tt("tidak ada — form baru dibiarkan kosong", "none — new forms are left empty");
  nilai.classList.toggle("is-kosong", !contoh);
  nilai.title = contoh && contoh !== fundDocNoPolaBerlaku ? tt(`Pola: ${fundDocNoPolaBerlaku}`, `Pattern: ${fundDocNoPolaBerlaku}`) : "";
  const tombol = $("#btnFundDocNoPola");
  if (tombol) tombol.setAttribute("aria-label", tt("Ubah Doc No bawaan", "Change the default Doc No"));
}

/* Pengaturan baru berlaku: salinan peramban diperbarui, baris di kotak
   aturan digambar ulang, dan form yang sedang terbuka yang MASIH berisi
   bawaan (menurut pola lama) ikut berganti ke bawaan baru. */
function fundDocNoPolaTerapkan(nilai) {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  const kotak = panel && panel.querySelector('[data-dn="docNo"]');
  const tadinyaBawaan = !!kotak && fundDocNoAdalahBawaan(kotak.value);
  fundDocNoPolaBerlaku = nilai ? nilai.pola : FUND_DOCNO_POLA_BAWAAN;
  fundDocNoPolaLama = nilai ? nilai.lama.slice() : [];
  try {
    if (nilai) localStorage.setItem(FUND_DOCNO_POLA_SIMPANAN, JSON.stringify(nilai));
    else localStorage.removeItem(FUND_DOCNO_POLA_SIMPANAN);
  } catch (e) {
    /* penyimpanan peramban diblokir: tetap berlaku selama halaman terbuka */
  }
  fundDocNoPolaGambar();
  if (panel) fundIsiDocNoBawaan(panel, false, tadinyaBawaan);
}

let fundDocNoPolaSibuk = false;
let fundDocNoPolaJanji = null;
/* Bertambah tiap kali pola disimpan dari sini: hasil muat yang dimulai
   SEBELUM penyimpanan itu sudah basi dan dibuang. */
let fundDocNoPolaUbahan = 0;

function fundDocNoPolaMuat() {
  if (typeof supabaseClient === "undefined" || !supabaseClient) return Promise.resolve();
  const ubahanAwal = fundDocNoPolaUbahan;
  fundDocNoPolaJanji = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from("report_settings")
        .select("key, value")
        .eq("key", FUND_DOCNO_POLA_KUNCI)
        .maybeSingle();
      if (error) throw error;
      if (fundDocNoPolaSibuk || ubahanAwal !== fundDocNoPolaUbahan) return;
      // Belum pernah disimpan -> bawaan kode
      fundDocNoPolaTerapkan(fundDocNoPolaNilai(data && data.value));
    } catch (e) {
      console.error(e); // tidak terbaca: salinan di peramban / bawaan kode tetap dipakai
      fundDocNoPolaGambar();
    }
  })();
  return fundDocNoPolaJanji;
}

async function fundDocNoPolaSimpan(polaBaru) {
  if (!requireEdit() || fundDocNoPolaSibuk) return false;
  const pola = fundDocNoPolaRapikan(polaBaru);
  if (fundDocNoPolaPeriksa(pola)) return false;
  const sebelum = { pola: fundDocNoPolaBerlaku, lama: fundDocNoPolaLama.slice() };
  // Pola yang diganti masuk riwayat: bawaannya yang masih tersisa di form / draf tetap dikenali
  const lama = [sebelum.pola, ...sebelum.lama]
    .filter((p, i, a) => p && p !== pola && a.indexOf(p) === i)
    .slice(0, FUND_DOCNO_POLA_RIWAYAT);
  const nilai = { pola, lama };
  fundDocNoPolaSibuk = true;
  fundDocNoPolaUbahan++;
  fundDocNoPolaTerapkan(nilai); // langsung terlihat; dibatalkan kalau gagal disimpan
  let galat = null;
  try {
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: FUND_DOCNO_POLA_KUNCI,
      value: nilai,
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    galat = error;
  } catch (e) {
    galat = e;
  }
  fundDocNoPolaSibuk = false;
  if (galat) {
    console.error(galat);
    fundDocNoPolaTerapkan(sebelum);
    showToast(
      tt(
        "Doc No bawaan gagal disimpan. Pastikan migration-report-settings.sql sudah dijalankan.",
        "The default Doc No could not be saved. Make sure migration-report-settings.sql has been run.",
      ),
      "danger",
    );
    return false;
  }
  const contoh = fundDocNoBawaan();
  showToast(
    contoh
      ? tt(`Doc No bawaan disimpan: form baru bulan ini berisi ${contoh}.`, `Default Doc No saved: new forms this month get ${contoh}.`)
      : tt("Doc No bawaan dikosongkan: form baru tidak diisi Doc No.", "Default Doc No cleared: new forms get no Doc No."),
    "success",
  );
  return true;
}

/* Kotak Ubah. Isiannya Doc No BULAN INI apa adanya (mis.
   Distribution-2611-0000) bila terbaca kembali sebagai pola yang sama;
   pola yang tidak bisa (mis. {MM}/{YYYY}) ditampilkan dengan kodenya. */
function fundDocNoPolaBukaUbah() {
  if (!requireEdit()) return;
  const contoh = fundDocNoBawaan();
  const isiAwal = contoh && fundDocNoPolaDariContoh(contoh) === fundDocNoPolaBerlaku ? contoh : fundDocNoPolaBerlaku;
  const teladan = fundDocNoIsiPola(FUND_DOCNO_POLA_BAWAAN);
  showPrompt({
    title: tt("Doc No bawaan", "Default Doc No"),
    desc: tt(
      `Diisikan ke kotak Doc No setiap form Pengajuan Dana baru — angka di ujungnya tinggal diganti nomor urut. Ketik Doc No bulan ini apa adanya, mis. ${teladan}: tahun & bulannya otomatis ikut berganti tiap bulan. Kosongkan bila form baru tidak perlu diisi.`,
      `Filled into the Doc No box of every new Fund Request form — just replace the trailing number with the sequence number. Type this month's Doc No as is, e.g. ${teladan}: its year & month change automatically every month. Leave it empty if new forms need no Doc No.`,
    ),
    icon: "bi-input-cursor-text",
    okText: tt("Simpan", "Save"),
    fields: [
      {
        key: "pola",
        label: tt("Doc No bawaan", "Default Doc No"),
        value: isiAwal,
        placeholder: teladan,
        hint: fundDocNoPolaPratinjau(fundDocNoPolaBerlaku),
      },
    ],
    onSubmit: (v) => {
      const pola = fundDocNoPolaDariContoh(v.pola);
      const galat = fundDocNoPolaPeriksa(pola);
      if (galat) return galat;
      return fundDocNoPolaSimpan(pola).then((ok) => (ok ? true : tt("Gagal disimpan. Coba lagi.", "Could not be saved. Try again.")));
    },
  });
  // Pratinjau langsung di bawah isian: bulan ini & bulan depan
  const isian = $("#prompt_pola");
  const wadah = isian && isian.closest(".prompt-field");
  const petunjuk = wadah && wadah.querySelector(".prompt-hint");
  if (petunjuk) isian.addEventListener("input", () => (petunjuk.textContent = fundDocNoPolaPratinjau(fundDocNoPolaDariContoh(isian.value))));
}

/* ---------- kotak "Aturan Doc No" ---------- */

function fundDocNoGambar() {
  const wadah = $("#fundDocNoDaftar");
  if (!wadah) return;
  const n = fundDocNoTanpa.length;
  const info = $("#fundDocNoInfo");
  if (info) info.textContent = tt(`${n} vendor`, n === 1 ? "1 vendor" : `${n} vendors`);
  wadah.innerHTML = n
    ? fundDocNoTanpa
        .map(
          (v) => `<span class="dn-aturan-cip">${escapeHtml(v)}<button type="button" class="dn-aturan-hapus" data-docno-hapus="${escapeAttr(v)}"
              title="${escapeAttr(tt("Hapus dari daftar", "Remove from the list"))}"
              aria-label="${escapeAttr(tt(`Hapus ${v} dari daftar`, `Remove ${v} from the list`))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button></span>`,
        )
        .join("")
    : `<span class="dn-aturan-kosong">${escapeHtml(tt("Daftar kosong — Doc No dicetak untuk semua vendor.", "The list is empty — Doc No is printed for every vendor."))}</span>`;
  const kotak = $("#fundDocNoBox");
  if (kotak) kotak.classList.toggle("is-sibuk", fundDocNoSibuk);
  // Baris Doc No bawaan di kotak yang sama (juga saat bahasa berganti)
  fundDocNoPolaGambar();
}

/* Daftar berubah -> kotak aturan digambar ulang dan form yang sedang
   terbuka ikut menyesuaikan (keterangan Doc No, isian CFO). */
function fundDocNoTerapkan() {
  fundDocNoGambar();
  if (typeof docNumPanelEl === "function") fundSelaraskanDocNo(docNumPanelEl("fund"));
}

/* Kotak aturan hanya di tab Pengajuan Dana. (Untuk peran hanya-baca ia
   disembunyikan auth.css bersama kotak Atur Nomor Urut.) */
function fundDocNoTampilkanKotak(tabAktif) {
  const kotak = $("#fundDocNoBox");
  if (kotak) kotak.classList.toggle("d-none", tabAktif !== "fund");
}

/* ---------- muat & simpan ---------- */

/* Dimuat tiap halaman Nomor Dokumen dibuka, supaya perubahan dari
   pengguna lain ikut terbawa -- daftar vendor DAN pola Doc No bawaan
   (dua kunci, dimuat bersamaan). Gagal (tabel report_settings belum
   dibuat, jaringan putus) -> yang sedang berlaku tetap dipakai;
   aplikasinya tidak boleh berhenti hanya karena pengaturan ini. */
function fundDocNoMuat() {
  return Promise.all([fundDocNoMuatDaftar(), fundDocNoPolaMuat()]);
}

function fundDocNoMuatDaftar() {
  fundDocNoJanjiMuat = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from("report_settings")
        .select("key, value")
        .eq("key", FUND_DOCNO_KUNCI)
        .maybeSingle();
      if (error) throw error;
      /* Belum pernah disimpan -> bawaan. Daftar KOSONG yang tersimpan
         tetap kosong: itu pilihan ("Doc No dicetak untuk semua vendor"),
         bukan data yang hilang. */
      const tersimpan = data && data.value && Array.isArray(data.value.vendor) ? data.value.vendor : null;
      if (!fundDocNoSibuk) fundDocNoTanpa = tersimpan ? fundDocNoBersihkan(tersimpan) : FUND_DOCNO_BAWAAN.slice();
    } catch (e) {
      console.error(e);
    }
    fundDocNoTerapkan();
  })();
  return fundDocNoJanjiMuat;
}

/* Menunggu pemuatan yang sedang berjalan -- dipakai cetak, supaya surat
   yang dicetak sesaat setelah halaman dibuka memakai aturan terbaru.
   Paling lama 1,5 detik: jaringan yang menggantung tidak boleh menahan
   jendela cetak tetap kosong; saat itu aturan yang sedang berlaku yang
   dipakai. */
function fundDocNoSiap() {
  if (!fundDocNoJanjiMuat) return Promise.resolve();
  return Promise.race([fundDocNoJanjiMuat, new Promise((selesai) => setTimeout(selesai, 1500))]);
}

async function fundDocNoSimpan(daftarBaru) {
  if (!requireEdit() || fundDocNoSibuk) return false;
  const sebelum = fundDocNoTanpa;
  fundDocNoTanpa = fundDocNoBersihkan(daftarBaru);
  fundDocNoSibuk = true;
  fundDocNoTerapkan(); // langsung terlihat; dibatalkan kalau gagal disimpan
  let galat = null;
  try {
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: FUND_DOCNO_KUNCI,
      value: { vendor: fundDocNoTanpa },
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    galat = error;
  } catch (e) {
    galat = e;
  }
  fundDocNoSibuk = false;
  if (galat) {
    console.error(galat);
    fundDocNoTanpa = sebelum;
    fundDocNoTerapkan();
    showToast(
      tt(
        "Aturan Doc No gagal disimpan. Pastikan migration-report-settings.sql sudah dijalankan.",
        "The Doc No rule could not be saved. Make sure migration-report-settings.sql has been run.",
      ),
      "danger",
    );
    return false;
  }
  fundDocNoTerapkan();
  return true;
}

async function fundDocNoTambah() {
  const kotak = $("#fundDocNoBaru");
  if (!kotak || !requireEdit()) return;
  const galat = fundDocNoPeriksa(kotak.value);
  if (galat) {
    showToast(galat, "danger");
    kotak.focus();
    return;
  }
  const vendor = fundDocNoRapikan(kotak.value);
  if (await fundDocNoSimpan(fundDocNoTanpa.concat([vendor]))) {
    kotak.value = "";
    showToast(tt(`${vendor} ditambahkan: Doc No tidak dicetak untuk vendor ini.`, `${vendor} added: Doc No is not printed for this vendor.`), "dark");
  }
  kotak.focus();
}

async function fundDocNoHapus(vendor) {
  if (!requireEdit()) return;
  if (await fundDocNoSimpan(fundDocNoTanpa.filter((v) => v !== vendor))) {
    showToast(tt(`${vendor} dihapus dari daftar: Doc No kembali dicetak untuk vendor ini.`, `${vendor} removed: Doc No is printed for this vendor again.`), "dark");
  }
}

const fundDocNoBoxEl = $("#fundDocNoBox");
if (fundDocNoBoxEl) {
  fundDocNoBoxEl.addEventListener("click", (e) => {
    if (e.target.closest("#btnFundDocNoTambah")) return void fundDocNoTambah();
    if (e.target.closest("#btnFundDocNoPola")) return void fundDocNoPolaBukaUbah();
    const hapus = e.target.closest("[data-docno-hapus]");
    if (hapus) fundDocNoHapus(hapus.dataset.docnoHapus);
  });
  fundDocNoBoxEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "fundDocNoBaru") {
      e.preventDefault();
      fundDocNoTambah();
    }
  });
  fundDocNoGambar();
}

// Form pengajuan baru saat aplikasi dibuka: Doc No bawaan bulan berjalan
fundIsiDocNoBawaan(document.querySelector('[data-docnum-panel="fund"]'), true);
