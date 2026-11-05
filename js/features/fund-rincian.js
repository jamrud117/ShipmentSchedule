"use strict";

/* ==================================================================
   RINCIAN (DETAILS) BAWAAN PENGAJUAN DANA -- Subject surat cetak

   Disusun dari isian form supaya tidak diketik ulang tiap kali:
     Billing         "Payment Request - Billing Import"
     Freight         "Payment Request - Invoice FedEx Freight Charge Import Bead Ring etc."
     Storage         "Payment Request - Invoice Wide Storage Charge Import ..."
     Tax Advance     "Payment Request - Invoice Wide Tax Advance Export ..."
     Lainnya/kosong  "Payment Request - Invoice <Vendor> <Import/Export>"
   Import / Export dari Jenis Transaksi (Inland Trucking ditulis apa
   adanya); nama barang dari jadwal yang BL/AWB-nya (Master / House)
   cocok dengan isian BL/AWB.

   Kotak Rincian diisi selama KOSONG atau masih sama dengan bawaan yang
   terakhir diisikan (data-auto-fill = teks bawaan itu; ikut difoto &
   dipulihkan bersama draf form, docnum-view.js). Begitu diubah sendiri,
   tidak ditimpa lagi -- termasuk Rincian tersimpan pengajuan yang
   dibuka untuk diubah.
================================================================== */

const FUND_RINCIAN_BEBAN = { Freight: "Freight Charge", Storage: "Storage Charge", "Tax Advance": "Tax Advance" };

/* Huruf judul: "BEAD RING" -> "Bead Ring", "WIDE" -> "Wide", FedEx
   dengan ejaan merknya. Singkatan pendek (PT, DHL, CNC) & kata berangka
   (225/50R17) tetap. */
function fundKataJudul(teks) {
  return String(teks || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((k) => {
      if (/^fedex$/i.test(k)) return "FedEx";
      if (/\d/.test(k) || /^[A-Z&.]{1,3}$/.test(k)) return k;
      return k.toLowerCase().replace(/(^|[-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    })
    .join(" ");
}

// "Air Import" -> "Import", "Sea Export" -> "Export"; selain itu apa adanya ("Inland Trucking")
function fundArahTransaksi(jenis) {
  const j = String((typeof fundJenisTransaksiBaku === "function" ? fundJenisTransaksiBaku(jenis) : jenis) || "").trim();
  const m = /\b(import|export)\b/i.exec(j);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : j;
}

/* isian: { expenseType, transactionType, payee, barang } */
function fundRincianBawaan(isian) {
  const x = isian || {};
  const arah = fundArahTransaksi(x.transactionType);
  if (x.expenseType === "Billing") return `Payment Request - Billing ${arah === "Export" ? "Export" : "Import"}`;
  const vendor = String(x.payee || "").trim();
  return ["Payment Request - Invoice", vendor && fundKataJudul(vendor), FUND_RINCIAN_BEBAN[x.expenseType], arah, x.barang]
    .filter(Boolean)
    .join(" ");
}

/* Nama barang (Uraian) jadwal yang BL/AWB-nya cocok: barang PERTAMA
   saja -- "Master Model 255/40R18 PS72"; lebih dari satu barang (tanpa
   kembar) -> "Master Model 255/40R18 PS72 etc." */
function fundBarangDariAwb(blAwb) {
  const kunci = new Set(fundDaftarAwb(blAwb).map((a) => a.kunci).filter((k) => k.length >= 5));
  if (!kunci.size || typeof data === "undefined" || !data) return "";
  const nama = [];
  [...(data.import || []), ...(data.export || [])].forEach((s) => {
    if (!bkKunciKiriman(s).some((k) => kunci.has(k))) return;
    (s.items || []).forEach((it) => {
      const n = fundKataJudul((it && it.namaBarang) || "");
      if (n && !nama.includes(n)) nama.push(n);
    });
  });
  return nama.length > 1 ? `${nama[0]} etc.` : nama[0] || "";
}

/* Kotak Rincian form Pengajuan Dana mengikuti isiannya selama kosong /
   masih bawaan. Dipanggil syncDocNumConditional (Jenis Pengeluaran,
   form dikosongkan / dibuka) dan saat Jenis Transaksi, vendor, atau
   BL/AWB berubah. */
function fundSelaraskanRincian(panel) {
  if (!panel || !panel.matches || !panel.matches('[data-docnum-panel="fund"]')) return;
  const el = panel.querySelector('[data-dn="notes"]');
  if (!el) return;
  if (el.value.trim() && el.value !== el.dataset.autoFill) return;
  const nilai = (k) => {
    const v = String((panel.querySelector(`[data-dn="${k}"]`) || {}).value || "").trim();
    return typeof FUND_VENDOR_BARU !== "undefined" && v === FUND_VENDOR_BARU ? "" : v;
  };
  const bawaan = fundRincianBawaan({
    expenseType: nilai("expenseType"),
    transactionType: nilai("transactionType"),
    payee: nilai("payee"),
    barang: fundBarangDariAwb(nilai("blAwb")),
  });
  el.value = bawaan;
  el.dataset.autoFill = bawaan;
}

/* ISI DARI BL/AWB -- isian PERTAMA form Pengajuan Dana.

   Begitu BL/AWB diketik, jadwal yang BL/AWB-nya (Master / House) cocok
   mengisi:
     Jenis Transaksi    moda (laut -> Sea, udara -> Air) + buku (Import /
                        Export) -> "Sea Import", "Air Export", dst.
     Dibayarkan Kepada  forwarder jadwal, dipetakan ke vendor di daftar
                        yang namanya termuat di nama forwarder ("PT WIDE
                        LOGISTIK" -> WIDE); tanpa padanan -> nama
                        forwarder-nya sendiri jadi pilihan
     Customer           buyer jadwal EXPORT
     (Rincian ikut lewat fundSelaraskanRincian: nama barang jadwal.)

   Tiap isian hanya diisi bila masih KOSONG atau masih isian otomatis
   sebelumnya (data-auto-awb). Yang dipilih / diketik sendiri -- termasuk
   Inland Trucking dan KAS NEGARA untuk Billing -- tidak ditimpa. Beberapa
   BL/AWB yang jadwalnya berbeda isi, atau tidak ada jadwal yang cocok ->
   isian itu dibiarkan. */
function fundJadwalDariAwb(blAwb) {
  const kunci = new Set(fundDaftarAwb(blAwb).map((a) => a.kunci).filter((k) => k.length >= 5));
  if (!kunci.size || typeof data === "undefined" || !data) return [];
  return ["import", "export"].flatMap((buku) =>
    (data[buku] || []).filter((s) => bkKunciKiriman(s).some((k) => kunci.has(k))).map((s) => ({ s, buku })),
  );
}
// Satu-satunya nilai (tanpa kosong) di antara jadwal yang cocok, atau ""
function fundSatuNilai(cocok, ambil) {
  const nilai = new Set(cocok.map(ambil).map((v) => String(v || "").trim()).filter(Boolean));
  return nilai.size === 1 ? [...nilai][0] : "";
}

function fundTransaksiDariAwb(blAwb) {
  return fundSatuNilai(fundJadwalDariAwb(blAwb), ({ s, buku }) => `${s.transport === "udara" ? "Air" : "Sea"} ${buku === "export" ? "Export" : "Import"}`);
}

// Vendor di daftar yang namanya termuat di nama forwarder (yang terpanjang), atau forwarder itu sendiri
function fundVendorDariForwarder(forwarder) {
  const kata = fundDocNoKata(forwarder);
  const umum = (k) => FUND_DOCNO_KATA_UMUM.indexOf(k) >= 0;
  const cocok = fundVendorDaftar()
    .map((v) => ({ v, kata: fundDocNoKata(v) }))
    .filter((x) => x.kata.some((k) => !umum(k)) && fundDocNoCocok(kata, x.kata))
    .sort((a, b) => b.kata.length - a.kata.length)[0];
  return cocok ? cocok.v : fundVendorRapikan(forwarder).toUpperCase();
}

/* Mengisi satu isian otomatis: hanya bila kosong / masih isian otomatis
   sebelumnya. Mengembalikan true bila nilainya berubah. */
function fundIsiOtomatisAwb(el, nilai) {
  if (!el || !nilai) return false;
  if (el.value && el.value !== el.dataset.autoAwb) return false; // diisi sendiri
  if (el.tagName === "SELECT") {
    nilai = el.dataset.dn === "payee" ? fundVendorPastikan(nilai, el) : nilai;
    if (![...el.options].some((o) => o.value === nilai)) return false;
  }
  if (el.value === nilai) return false;
  el.value = nilai;
  el.dataset.autoAwb = nilai;
  // Aturan yang menempel (Rincian, aturan vendor, Inland Trucking) ikut lewat event yang sama dengan pilihan tangan
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fundIsiDariAwb(panel) {
  if (!panel) return false;
  const awb = panel.querySelector('[data-dn="blAwb"]');
  if (!awb) return false;
  const cocok = fundJadwalDariAwb(awb.value);
  if (!cocok.length) return false;
  const kotak = (k) => panel.querySelector(`[data-dn="${k}"]`);
  const forwarder = fundSatuNilai(cocok, ({ s }) => s.forwarder);
  const hasil = [
    fundIsiOtomatisAwb(kotak("transactionType"), fundTransaksiDariAwb(awb.value)),
    fundIsiOtomatisAwb(kotak("payee"), forwarder && fundVendorDariForwarder(forwarder)),
    fundIsiOtomatisAwb(kotak("customer"), fundSatuNilai(cocok.filter((x) => x.buku === "export"), ({ s }) => s.party)),
  ];
  return hasil.some(Boolean);
}

document.addEventListener("input", (e) => {
  const el = e.target.closest('[data-docnum-panel="fund"] [data-dn="blAwb"]');
  if (el) fundIsiDariAwb(el.closest("[data-docnum-panel]"));
});
// Dipilih / diketik sendiri (bukan oleh fundIsiOtomatisAwb): bukan otomatis lagi
document.addEventListener("change", (e) => {
  const el = e.target.closest('[data-docnum-panel="fund"] :is([data-dn="transactionType"], [data-dn="payee"], [data-dn="customer"])');
  if (el && e.isTrusted && el.value !== el.dataset.autoAwb) delete el.dataset.autoAwb;
});

document.addEventListener("change", (e) => {
  if (e.target.closest && e.target.closest('[data-docnum-panel="fund"] [data-dn="blAwb"]')) fundIsiDariAwb(e.target.closest("[data-docnum-panel]"));
  const el = e.target.closest(["transactionType", "payee", "blAwb"].map((k) => `[data-docnum-panel="fund"] [data-dn="${k}"]`).join(", "));
  if (el) fundSelaraskanRincian(el.closest("[data-docnum-panel]"));
});
