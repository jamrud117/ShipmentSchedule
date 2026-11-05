"use strict";

/* ------------------------------------------------------------------
   VENDOR YANG NO. INVOICE-NYA BOLEH SAMA (Pengajuan Dana)

   Satu tagihan hanya boleh diajukan sekali (docnum-view.js, "tagihan
   ganda"). Pengecualiannya: vendor yang isian "No. Invoice"-nya bukan
   nomor tagihan. JNE, misalnya, diisi NOMOR REKENING tujuan bayar --
   sama di tiap pengajuan, jadi nomor yang berulang itu wajar.

   DAFTARNYA BISA DIATUR dari halaman Nomor Dokumen (kotak "Aturan No.
   Invoice" di tab Pengajuan Dana, khusus EXIM), seperti Aturan Doc No
   (fund-docno.js): vendor berikutnya cukup ditambahkan di sana, tanpa
   mengubah kode. Bawaannya JNE.

   Yang dikecualikan HANYA No. Invoice, dan HANYA bila pengajuan yang
   sedang diisi / disimpan itu sendiri milik vendor di daftar. Nomor
   Billing tetap diperiksa untuk semua vendor, dan vendor lain tetap
   diperiksa (juga terhadap nomor yang dipakai vendor di daftar).

   Tersimpan di tabel report_settings (kunci-nilai, RLS: semua peran
   membaca, hanya EXIM menulis) supaya SAMA untuk semua pengguna -- dan
   dibaca juga oleh pemicu database (dn_tagihan_boleh_sama,
   migration-invoice-boleh-sama.sql) yang menjaga pengajuan serentak.
   Dicocokkan per kata seperti Aturan Doc No (fundDocNoKata /
   fundDocNoCocok): "JNE" mengenai "PT JNE EXPRESS", tidak mengenai
   "JNEXT". Aturan nama yang sama ditulis di SQL; mengubah yang satu
   berarti mengubah keduanya (dijaga tes).

   SATU fungsi, fundInvoiceBolehSama(), dipakai tanda langsung di form
   maupun pemeriksaan saat Simpan (docnum-view.js, dnTagihanBolehSama).
------------------------------------------------------------------ */
const FUND_INVOICE_BAWAAN = ["JNE", "JALUR NUGRAHA EKAKURIR"];
const FUND_INVOICE_KUNCI = "fund-invoice-boleh-sama";
const FUND_INVOICE_MAKS = 40; // banyaknya vendor di daftar
const FUND_INVOICE_MAKS_HURUF = 60;

/* Daftar yang sedang berlaku: bawaan sampai pengaturannya selesai
   dimuat, dan seterusnya kalau memang belum pernah diubah. */
let fundInvoiceSama = FUND_INVOICE_BAWAAN.slice();
let fundInvoiceJanjiMuat = null; // janji pemuatan yang sedang berjalan
let fundInvoiceSibuk = false; // sedang menyimpan

/* Daftar dirapikan: tiap entri satu bentuk (" pt.  jne " -> "PT JNE"),
   tanpa kosong, tanpa kembar. */
function fundInvoiceBersihkan(daftar) {
  const hasil = [];
  (Array.isArray(daftar) ? daftar : []).forEach((v) => {
    const rapi = fundDocNoRapikan(v).slice(0, FUND_INVOICE_MAKS_HURUF).trim();
    if (rapi && hasil.indexOf(rapi) < 0 && hasil.length < FUND_INVOICE_MAKS) hasil.push(rapi);
  });
  return hasil;
}

/* Apakah pengajuan untuk vendor ini boleh memakai No. Invoice yang sudah
   dipakai pengajuan lain? Entri daftar harus muncul sebagai KATA UTUH
   (berurutan, kalau lebih dari satu kata) di nama vendor. */
function fundInvoiceBolehSama(payee) {
  const kata = fundDocNoKata(payee);
  if (!kata.length) return false;
  return fundInvoiceSama.some((vendor) => fundDocNoCocok(kata, fundDocNoKata(vendor)));
}

/* Pesan galat untuk entri baru, atau "" kalau boleh ditambahkan. */
function fundInvoicePeriksa(teks) {
  const rapi = fundDocNoRapikan(teks);
  if (!rapi) return tt("Nama vendor harus diisi.", "Vendor name is required.");
  if (rapi.length < 2) return tt("Nama vendor terlalu pendek.", "The vendor name is too short.");
  if (rapi.length > FUND_INVOICE_MAKS_HURUF)
    return tt(`Nama vendor paling panjang ${FUND_INVOICE_MAKS_HURUF} huruf.`, `The vendor name can have at most ${FUND_INVOICE_MAKS_HURUF} characters.`);
  /* Kata yang ada di hampir semua nama badan usaha (PT, CV, ...): entri
     yang HANYA berisi itu mengenai hampir semua vendor, dan penjagaan
     tagihan ganda praktis mati untuk semuanya. */
  if (fundDocNoKata(rapi).every((k) => FUND_DOCNO_KATA_UMUM.indexOf(k) >= 0))
    return tt(
      `"${rapi}" ada di hampir semua nama vendor — No. Invoice semua vendor akan boleh sama, tanpa penjagaan tagihan ganda. Tulis nama vendornya, mis. JNE.`,
      `"${rapi}" appears in almost every vendor name — every vendor's Invoice No would be allowed to repeat, with no duplicate-invoice check. Enter the vendor's own name, e.g. JNE.`,
    );
  if (fundInvoiceSama.indexOf(rapi) >= 0) return tt(`${rapi} sudah ada di daftar.`, `${rapi} is already on the list.`);
  if (fundInvoiceSama.length >= FUND_INVOICE_MAKS)
    return tt(`Daftar sudah penuh (${FUND_INVOICE_MAKS} vendor).`, `The list is full (${FUND_INVOICE_MAKS} vendors).`);
  return "";
}

/* Vendor di pilihan "Dibayarkan Kepada" yang dikenai entri ini -- untuk
   memberi tahu pengguna apa yang sebenarnya berubah saat entri ditambah. */
function fundInvoiceVendorTercakup(entri) {
  const kataEntri = fundDocNoKata(entri);
  const daftar = typeof fundVendorDaftar === "function" ? fundVendorDaftar() : [];
  return daftar.filter((v) => fundDocNoCocok(fundDocNoKata(v), kataEntri));
}

/* ---------- kotak "Aturan No. Invoice" ---------- */

function fundInvoiceGambar() {
  const wadah = $("#fundInvoiceDaftar");
  if (!wadah) return;
  const n = fundInvoiceSama.length;
  const info = $("#fundInvoiceInfo");
  if (info) info.textContent = tt(`${n} vendor`, n === 1 ? "1 vendor" : `${n} vendors`);
  wadah.innerHTML = n
    ? fundInvoiceSama
        .map(
          (v) => `<span class="dn-aturan-cip">${escapeHtml(v)}<button type="button" class="dn-aturan-hapus" data-invoice-hapus="${escapeAttr(v)}"
              title="${escapeAttr(tt("Hapus dari daftar", "Remove from the list"))}"
              aria-label="${escapeAttr(tt(`Hapus ${v} dari daftar`, `Remove ${v} from the list`))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button></span>`,
        )
        .join("")
    : `<span class="dn-aturan-kosong">${escapeHtml(tt("Daftar kosong — No. Invoice semua vendor diperiksa.", "The list is empty — every vendor's Invoice No is checked."))}</span>`;
  const kotak = $("#fundInvoiceBox");
  if (kotak) kotak.classList.toggle("is-sibuk", fundInvoiceSibuk);
}

/* Daftar berubah -> kotak aturan digambar ulang dan tanda "sudah
   diajukan" di form yang sedang terbuka dihitung ulang (vendor yang baru
   masuk daftar tidak lagi ditandai, yang baru keluar mulai ditandai). */
function fundInvoiceTerapkan() {
  fundInvoiceGambar();
  if (typeof docNumPanelEl === "function" && typeof dnPeriksaTagihanGandaLangsung === "function") {
    const panel = docNumPanelEl("fund");
    if (panel) dnPeriksaTagihanGandaLangsung(panel, true);
  }
}

/* Kotak aturan hanya di tab Pengajuan Dana. (Untuk peran hanya-baca ia
   disembunyikan auth.css bersama kotak Atur Nomor Urut.) */
function fundInvoiceTampilkanKotak(tabAktif) {
  const kotak = $("#fundInvoiceBox");
  if (kotak) kotak.classList.toggle("d-none", tabAktif !== "fund");
}

/* ---------- muat & simpan ---------- */

/* Dimuat tiap halaman Nomor Dokumen dibuka, supaya perubahan dari
   pengguna lain ikut terbawa. Gagal (tabel report_settings belum
   dibuat, jaringan putus) -> daftar yang sedang berlaku tetap dipakai;
   aplikasinya tidak boleh berhenti hanya karena pengaturan ini. */
function fundInvoiceMuat() {
  fundInvoiceJanjiMuat = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from("report_settings")
        .select("key, value")
        .eq("key", FUND_INVOICE_KUNCI)
        .maybeSingle();
      if (error) throw error;
      /* Belum pernah disimpan -> bawaan. Daftar KOSONG yang tersimpan
         tetap kosong: itu pilihan ("semua vendor diperiksa"), bukan data
         yang hilang. */
      const tersimpan = data && data.value && Array.isArray(data.value.vendor) ? data.value.vendor : null;
      if (!fundInvoiceSibuk) fundInvoiceSama = tersimpan ? fundInvoiceBersihkan(tersimpan) : FUND_INVOICE_BAWAAN.slice();
    } catch (e) {
      console.error(e);
    }
    fundInvoiceTerapkan();
  })();
  return fundInvoiceJanjiMuat;
}

/* Menunggu pemuatan yang sedang berjalan -- dipakai pemeriksaan saat
   Simpan, supaya pengajuan yang disimpan sesaat setelah halaman dibuka
   memakai daftar terbaru. Paling lama 1,5 detik: jaringan yang menggantung
   tidak boleh menahan penyimpanan; saat itu daftar yang sedang berlaku
   yang dipakai. */
function fundInvoiceSiap() {
  if (!fundInvoiceJanjiMuat) return Promise.resolve();
  return Promise.race([fundInvoiceJanjiMuat, new Promise((selesai) => setTimeout(selesai, 1500))]);
}

async function fundInvoiceSimpan(daftarBaru) {
  if (!requireEdit() || fundInvoiceSibuk) return false;
  const sebelum = fundInvoiceSama;
  fundInvoiceSama = fundInvoiceBersihkan(daftarBaru);
  fundInvoiceSibuk = true;
  fundInvoiceTerapkan(); // langsung terlihat; dibatalkan kalau gagal disimpan
  let galat = null;
  try {
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: FUND_INVOICE_KUNCI,
      value: { vendor: fundInvoiceSama },
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    galat = error;
  } catch (e) {
    galat = e;
  }
  fundInvoiceSibuk = false;
  if (galat) {
    console.error(galat);
    fundInvoiceSama = sebelum;
    fundInvoiceTerapkan();
    showToast(
      tt(
        "Aturan No. Invoice gagal disimpan. Pastikan migration-report-settings.sql sudah dijalankan.",
        "The Invoice No rule could not be saved. Make sure migration-report-settings.sql has been run.",
      ),
      "danger",
    );
    return false;
  }
  fundInvoiceTerapkan();
  return true;
}

async function fundInvoiceTambah() {
  const kotak = $("#fundInvoiceBaru");
  if (!kotak || !requireEdit()) return;
  const galat = fundInvoicePeriksa(kotak.value);
  if (galat) {
    showToast(galat, "danger");
    kotak.focus();
    return;
  }
  const vendor = fundDocNoRapikan(kotak.value);
  if (await fundInvoiceSimpan(fundInvoiceSama.concat([vendor]))) {
    kotak.value = "";
    /* Menyebut vendor yang benar-benar terkena: entri yang terlalu umum
       ("INDONESIA") langsung kelihatan dari daftar ini. */
    const kena = fundInvoiceVendorTercakup(vendor);
    const tampil = kena.slice(0, 4).join(", ") + (kena.length > 4 ? ` +${kena.length - 4}` : "");
    showToast(
      kena.length
        ? tt(`${vendor} ditambahkan: No. Invoice boleh sama untuk ${tampil}.`, `${vendor} added: Invoice No may repeat for ${tampil}.`)
        : tt(`${vendor} ditambahkan: No. Invoice boleh sama untuk vendor ini.`, `${vendor} added: Invoice No may repeat for this vendor.`),
      "dark",
    );
  }
  kotak.focus();
}

async function fundInvoiceHapus(vendor) {
  if (!requireEdit()) return;
  if (await fundInvoiceSimpan(fundInvoiceSama.filter((v) => v !== vendor))) {
    showToast(
      tt(`${vendor} dihapus dari daftar: No. Invoice vendor ini kembali diperiksa.`, `${vendor} removed: this vendor's Invoice No is checked again.`),
      "dark",
    );
  }
}

const fundInvoiceBoxEl = $("#fundInvoiceBox");
if (fundInvoiceBoxEl) {
  fundInvoiceBoxEl.addEventListener("click", (e) => {
    if (e.target.closest("#btnFundInvoiceTambah")) return void fundInvoiceTambah();
    const hapus = e.target.closest("[data-invoice-hapus]");
    if (hapus) fundInvoiceHapus(hapus.dataset.invoiceHapus);
  });
  fundInvoiceBoxEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "fundInvoiceBaru") {
      e.preventDefault();
      fundInvoiceTambah();
    }
  });
  fundInvoiceGambar();
}
