"use strict";

/* ------------------------------------------------------------------
   DIBAYARKAN KEPADA (Paid To) -- PILIHAN VENDOR

   Dulu kotak ketik bebas, sehingga "PT DSV", "DSV" dan "DSV SOLUTIONS"
   tercatat sebagai tiga vendor di Ringkasan per Vendor, Laporan Biaya,
   dan pencocokan tagihan. Sekarang dropdown. Pilihannya gabungan:

     - daftar vendor tersimpan (tabel report_settings, sama untuk semua
       pengguna -- sama seperti Aturan Doc No di fund-docno.js), dan
     - nama yang sudah pernah dipakai di pengajuan sebelumnya,

   tanpa kembar (dibandingkan tanpa beda huruf besar/kecil & tanda baca),
   urut abjad. Vendor baru lewat pilihan paling bawah "+ Tambah vendor
   baru…": namanya langsung terpilih dan tersimpan ke daftar.

   Nilai yang datang dari luar daftar -- invoice PDF yang dibaca,
   pengajuan lama yang dibuka -- ikut ditambahkan sebagai pilihan, jadi
   tidak pernah diam-diam hilang dari kotaknya.
------------------------------------------------------------------ */
const FUND_VENDOR_KUNCI = "fund-vendor";
const FUND_VENDOR_BARU = "__vendor-baru__";
const FUND_VENDOR_MAKS_HURUF = 80;
// Selalu ada: penerima setoran Billing (diisikan otomatis, lihat syncDocNumConditional)
const FUND_VENDOR_BAWAAN = ["KAS NEGARA"];

let fundVendorTersimpan = [];
let fundVendorRiwayat = [];

// Perilaku dropdown-nya bersama dropdown Customer invoice: js/ui/pilihan-tambah.js
const fundVendorRapikan = pilihanRapikan;
const fundVendorKunci = pilihanKunci;

function fundVendorDaftar() {
  return pilihanSatukan(FUND_VENDOR_BAWAAN, fundVendorTersimpan, fundVendorRiwayat).filter((n) => n !== FUND_VENDOR_BARU);
}

function fundVendorKotak() {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  return panel ? panel.querySelector('[data-dn="payee"]') : null;
}

/* Tidak ada pilihan bertanda `selected` di HTML-nya, jadi mengosongkan
   form (resetDocNumForm) kembali ke "— pilih vendor —". */
function fundVendorGambar(el) {
  pilihanGambar(el || fundVendorKotak(), fundVendorDaftar(), {
    kosong: tt("— pilih vendor —", "— choose a vendor —"),
    tambah: tt("+ Tambah vendor baru…", "+ Add a new vendor…"),
    sentinel: FUND_VENDOR_BARU,
  });
}

/* Vendor yang sama dengan tulisan lain ("pt. dsv" vs "PT DSV") memakai
   nama yang sudah ada. */
function fundVendorPastikan(nama, el) {
  return pilihanPastikan(el || fundVendorKotak(), nama);
}
function fundVendorPilih(el, nama) {
  pilihanPilih(el, nama);
}

/* Dimuat tiap halaman Nomor Dokumen dibuka (bersama Aturan Doc No).
   Gagal -> pilihan yang ada tetap dipakai; isiannya tetap bisa diisi. */
async function fundVendorMuat() {
  const [tersimpan, riwayat] = await Promise.all([
    (async () => {
      try {
        const { data, error } = await supabaseClient
          .from("report_settings")
          .select("key, value")
          .eq("key", FUND_VENDOR_KUNCI)
          .maybeSingle();
        if (error) throw error;
        return data && data.value && Array.isArray(data.value.vendor) ? data.value.vendor : [];
      } catch (e) {
        console.warn("Daftar vendor tidak termuat:", e);
        return null;
      }
    })(),
    (async () => {
      try {
        const rows = typeof bkAmbilDana === "function" ? await bkAmbilDana() : [];
        return (rows || []).map((r) => (r && r.payload && r.payload.payee) || "");
      } catch (e) {
        return null;
      }
    })(),
  ]);
  if (tersimpan) fundVendorTersimpan = tersimpan;
  if (riwayat) fundVendorRiwayat = riwayat;
  fundVendorGambar();
}

/* Vendor baru ke daftar tersimpan. Dibaca ulang lebih dulu lalu
   digabung, supaya vendor yang baru ditambahkan pengguna lain tidak
   tertimpa. Gagal (migrasi belum dijalankan, bukan EXIM) -> vendornya
   tetap terpilih untuk pengajuan ini, hanya belum masuk daftar. */
async function fundVendorSimpan(nama) {
  let galat = null;
  try {
    const { data, error: e1 } = await supabaseClient
      .from("report_settings")
      .select("key, value")
      .eq("key", FUND_VENDOR_KUNCI)
      .maybeSingle();
    if (e1) throw e1;
    const lama = data && data.value && Array.isArray(data.value.vendor) ? data.value.vendor : [];
    const daftar = lama.some((v) => fundVendorKunci(v) === fundVendorKunci(nama)) ? lama : lama.concat([nama]);
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: FUND_VENDOR_KUNCI,
      value: { vendor: daftar },
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    if (error) throw error;
    fundVendorTersimpan = daftar;
  } catch (e) {
    galat = e;
  }
  if (galat) {
    console.error(galat);
    showToast(
      tt(
        `${nama} dipakai untuk pengajuan ini, tetapi belum tersimpan ke daftar vendor. Pastikan migration-report-settings.sql sudah dijalankan.`,
        `${nama} is used for this request but was not saved to the vendor list. Make sure migration-report-settings.sql has been run.`,
      ),
      "warning",
    );
    return false;
  }
  showToast(tt(`${nama} ditambahkan ke daftar vendor.`, `${nama} added to the vendor list.`), "dark");
  return true;
}

function fundVendorTambah(el) {
  showPrompt({
    title: tt("Tambah vendor baru", "Add a new vendor"),
    icon: "bi-building-add",
    desc: tt(
      "Nama ini langsung terpilih, dan tersimpan ke daftar vendor untuk pengajuan berikutnya.",
      "This name is selected right away and saved to the vendor list for the next requests.",
    ),
    okText: tt("Tambah", "Add"),
    fields: [
      {
        key: "nama",
        label: tt("Nama vendor", "Vendor name"),
        placeholder: tt("Cth: PT DSV SOLUTIONS INDONESIA", "e.g. PT DSV SOLUTIONS INDONESIA"),
      },
    ],
    onSubmit: (v) => {
      const nama = fundVendorRapikan(v.nama);
      if (!nama) return tt("Nama vendor harus diisi.", "The vendor name is required.");
      if (nama.length > FUND_VENDOR_MAKS_HURUF)
        return tt(`Nama vendor paling panjang ${FUND_VENDOR_MAKS_HURUF} huruf.`, `The vendor name can have at most ${FUND_VENDOR_MAKS_HURUF} characters.`);
      const sudah = [...el.options].find((o) => o.value && !o.hasAttribute("data-pilihan-tambah") && fundVendorKunci(o.value) === fundVendorKunci(nama));
      fundVendorPilih(el, nama);
      if (sudah) showToast(tt(`${sudah.value} sudah ada di daftar — langsung dipilih.`, `${sudah.value} is already on the list — selected.`), "info");
      else fundVendorSimpan(nama);
      return true;
    },
  });
}

// "+ Tambah vendor baru…" membuka isian nama vendor
pilihanPasangTambah('[data-docnum-panel="fund"] [data-dn="payee"]', FUND_VENDOR_BARU, fundVendorTambah);

fundVendorGambar();
