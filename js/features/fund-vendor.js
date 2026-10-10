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

const fundVendorRapikan = (teks) => String(teks == null ? "" : teks).replace(/\s+/g, " ").trim();
const fundVendorKunci = (teks) => fundVendorRapikan(teks).toUpperCase().replace(/[^\p{L}\p{N}]+/gu, "");

function fundVendorDaftar() {
  const hasil = [];
  const ada = new Set();
  FUND_VENDOR_BAWAAN.concat(fundVendorTersimpan, fundVendorRiwayat).forEach((v) => {
    const nama = fundVendorRapikan(v);
    const kunci = fundVendorKunci(nama);
    if (!kunci || nama === FUND_VENDOR_BARU || ada.has(kunci)) return;
    ada.add(kunci);
    hasil.push(nama);
  });
  return hasil.sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
}

function fundVendorKotak() {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("fund") : null;
  return panel ? panel.querySelector('[data-dn="payee"]') : null;
}

const fundVendorOpsiHtml = (nama) => `<option value="${escapeAttr(nama)}">${escapeHtml(nama)}</option>`;

/* Pilihan digambar ulang dari daftar; nilai yang sedang terpilih tetap
   terpilih, termasuk yang tidak ada di daftar. Tidak ada pilihan
   bertanda `selected` di HTML-nya, jadi mengosongkan form
   (resetDocNumForm) kembali ke "— pilih vendor —". */
function fundVendorGambar(el) {
  const kotak = el || fundVendorKotak();
  if (!kotak) return;
  const kini = kotak.value === FUND_VENDOR_BARU ? "" : kotak.value;
  const daftar = fundVendorDaftar();
  if (kini && daftar.indexOf(kini) < 0) daftar.push(kini);
  kotak.innerHTML =
    `<option value="">${escapeHtml(tt("— pilih vendor —", "— choose a vendor —"))}</option>` +
    daftar.map(fundVendorOpsiHtml).join("") +
    `<option value="${FUND_VENDOR_BARU}">${escapeHtml(tt("+ Tambah vendor baru…", "+ Add a new vendor…"))}</option>`;
  kotak.value = kini;
}

/* Memastikan sebuah nama ada di pilihan, lalu mengembalikan nilai yang
   dipakai: vendor yang sama dengan tulisan lain ("pt. dsv" vs "PT DSV")
   memakai nama yang sudah ada -- itulah gunanya dropdown ini. */
function fundVendorPastikan(nama, el) {
  const kotak = el || fundVendorKotak();
  const rapi = fundVendorRapikan(nama);
  if (!kotak || !rapi) return rapi;
  const kunci = fundVendorKunci(rapi);
  const ada = [...kotak.options].find((o) => o.value && o.value !== FUND_VENDOR_BARU && fundVendorKunci(o.value) === kunci);
  if (ada) return ada.value;
  const opsi = document.createElement("option");
  opsi.value = rapi;
  opsi.textContent = rapi;
  kotak.insertBefore(opsi, [...kotak.options].find((o) => o.value === FUND_VENDOR_BARU) || null);
  return rapi;
}

function fundVendorPilih(el, nama) {
  el.value = fundVendorPastikan(nama, el);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
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
      const sudah = [...el.options].find((o) => o.value && o.value !== FUND_VENDOR_BARU && fundVendorKunci(o.value) === fundVendorKunci(nama));
      fundVendorPilih(el, nama);
      if (sudah) showToast(tt(`${sudah.value} sudah ada di daftar — langsung dipilih.`, `${sudah.value} is already on the list — selected.`), "dark");
      else fundVendorSimpan(nama);
      return true;
    },
  });
}

/* Pilihan "+ Tambah vendor baru…": dropdown kembali ke pilihan
   sebelumnya dulu (membatalkan kotak isiannya tidak boleh meninggalkan
   pilihan aneh itu terpilih), lalu kotak nama vendor dibuka. */
document.addEventListener("focusin", (e) => {
  const el = e.target.closest && e.target.closest('[data-docnum-panel="fund"] [data-dn="payee"]');
  if (el && el.value !== FUND_VENDOR_BARU) el.dataset.sebelum = el.value;
});
document.addEventListener("change", (e) => {
  const el = e.target.closest && e.target.closest('[data-docnum-panel="fund"] [data-dn="payee"]');
  if (!el) return;
  if (el.value !== FUND_VENDOR_BARU) {
    el.dataset.sebelum = el.value;
    return;
  }
  el.value = el.dataset.sebelum || "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  if (!requireEdit()) return;
  fundVendorTambah(el);
});

fundVendorGambar();
