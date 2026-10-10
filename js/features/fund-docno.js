"use strict";

/* ------------------------------------------------------------------
   DOC NO PADA FORM PENGAJUAN DANA

   Baris "Doc No" di bawah No Surat, diketik manual. Berlaku untuk
   SEMUA vendor KECUALI yang ada di daftar "tanpa Doc No" -- bawaannya
   PRIME dan WIDE: untuk vendor di daftar itu kotaknya tidak tampil di
   form dan barisnya tidak tercetak.

   DAFTARNYA BISA DIATUR dari halaman Nomor Dokumen (kotak "Aturan Doc
   No" di tab Pengajuan Dana, khusus EXIM). Vendor berikutnya yang tidak
   memakai Doc No cukup ditambahkan di sana -- tanpa mengubah kode.

   Tersimpan di tabel report_settings (kunci-nilai, RLS: semua peran
   membaca, hanya EXIM menulis) supaya SAMA untuk semua pengguna. Kalau
   disimpan per peramban, pengajuan yang sama bisa tercetak dengan Doc
   No di satu komputer dan tanpa di komputer lain.

   SATU fungsi, fundPakaiDocNo(), dipakai form DAN cetakannya -- jadi
   keduanya tidak mungkin berbeda pendapat.
------------------------------------------------------------------ */
const FUND_DOCNO_BAWAAN = ["PRIME", "WIDE"];
const FUND_DOCNO_KUNCI = "fund-doc-no-tanpa-vendor";
const FUND_DOCNO_MAKS = 40; // banyaknya vendor di daftar
const FUND_DOCNO_MAKS_HURUF = 60;

/* Kata yang ada di hampir semua nama badan usaha. Entri yang HANYA
   berisi kata-kata ini akan mengenai hampir semua vendor -- Doc No
   lenyap dari semua pengajuan -- jadi ditolak saat ditambahkan. */
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
      `"${rapi}" ada di hampir semua nama vendor — Doc No akan hilang dari semua pengajuan. Tulis nama vendornya, mis. PRIME.`,
      `"${rapi}" appears in almost every vendor name — Doc No would disappear from every request. Enter the vendor's own name, e.g. PRIME.`,
    );
  if (fundDocNoTanpa.indexOf(rapi) >= 0) return tt(`${rapi} sudah ada di daftar.`, `${rapi} is already on the list.`);
  if (fundDocNoTanpa.length >= FUND_DOCNO_MAKS)
    return tt(`Daftar sudah penuh (${FUND_DOCNO_MAKS} vendor).`, `The list is full (${FUND_DOCNO_MAKS} vendors).`);
  return "";
}

/* ---------- form ---------- */

/* DOC NO mengikuti "Dibayarkan Kepada". Saat disembunyikan kotaknya
   ikut dinonaktifkan -- readDocNumForm() melewati isian nonaktif, jadi
   Doc No yang terlanjur diketik tidak ikut tersimpan untuk vendor yang
   tidak memakainya. */
function fundSelaraskanDocNo(panel) {
  const wadah = panel && panel.querySelector(".fund-docno");
  if (!wadah) return;
  const kotakPayee = panel.querySelector('[data-dn="payee"]');
  const pakai = fundPakaiDocNo(kotakPayee && kotakPayee.value);
  wadah.classList.toggle("d-none", !pakai);
  const kotak = wadah.querySelector('[data-dn="docNo"]');
  if (kotak) kotak.disabled = !pakai;
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
    : `<span class="dn-aturan-kosong">${escapeHtml(tt("Daftar kosong — Doc No dipakai untuk semua vendor.", "The list is empty — Doc No applies to every vendor."))}</span>`;
  const kotak = $("#fundDocNoBox");
  if (kotak) kotak.classList.toggle("is-sibuk", fundDocNoSibuk);
}

/* Daftar berubah -> kotak aturan digambar ulang dan form yang sedang
   terbuka ikut menyesuaikan (kotak Doc No tampil / sembunyi). */
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
   pengguna lain ikut terbawa. Gagal (tabel report_settings belum
   dibuat, jaringan putus) -> daftar yang sedang berlaku tetap dipakai;
   aplikasinya tidak boleh berhenti hanya karena pengaturan ini. */
function fundDocNoMuat() {
  fundDocNoJanjiMuat = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from("report_settings")
        .select("key, value")
        .eq("key", FUND_DOCNO_KUNCI)
        .maybeSingle();
      if (error) throw error;
      /* Belum pernah disimpan -> bawaan. Daftar KOSONG yang tersimpan
         tetap kosong: itu pilihan ("semua vendor memakai Doc No"),
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
    showToast(tt(`${vendor} ditambahkan: Doc No tidak dipakai untuk vendor ini.`, `${vendor} added: Doc No is not used for this vendor.`), "dark");
  }
  kotak.focus();
}

async function fundDocNoHapus(vendor) {
  if (!requireEdit()) return;
  if (await fundDocNoSimpan(fundDocNoTanpa.filter((v) => v !== vendor))) {
    showToast(tt(`${vendor} dihapus dari daftar: Doc No kembali dipakai untuk vendor ini.`, `${vendor} removed: Doc No is used for this vendor again.`), "dark");
  }
}

const fundDocNoBoxEl = $("#fundDocNoBox");
if (fundDocNoBoxEl) {
  fundDocNoBoxEl.addEventListener("click", (e) => {
    if (e.target.closest("#btnFundDocNoTambah")) return void fundDocNoTambah();
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
