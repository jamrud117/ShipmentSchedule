"use strict";

/* ==================================================================
   CUSTOMER, SKEMA INVOICE & PIHAK (form Permintaan Nomor Invoice)

   Empat pihak seperti entitas PEB, masing-masing nama + alamat + NPWP
   (Penjual, Pemilik) atau Negara (Pembeli, Penerima):

     Penjual / Shipper     bawaannya perusahaan sendiri (kotak Shipper CIPL)
     Pemilik Barang
     Pembeli / Buyer
     Penerima / Consignee  nama mengikuti Customer; alamatnya = Alamat
                           Consignee yang tercetak (kunci consigneeAddress)

   SKEMA INVOICE menentukan pihak mana yang otomatis SAMA:

     Direct Invoice       Pemilik = Penjual, Pembeli = Penerima
                          (mis. Dynamic Design)
     Third Party Invoice  Pemilik = Penjual; Pembeli & Penerima diisi
                          masing-masing (mis. Kumho: shipper PT DDI, buyer
                          Dynamic Design Korea, penerima Kumho Vietnam)

   "Ikut" berarti: isian pengikut yang masih kosong, masih bawaan, atau
   masih persis yang diisikan mesin (dnIsianOtomatis, docnum-view.js) ikut
   berganti saat sumbernya diketik. Begitu diketik sendiri ia tidak
   ditimpa lagi. Yang diteruskan hanya isian yang DIISI: mengosongkan
   sumber tidak mengosongkan pengikutnya. Pindah ke Third Party
   mengosongkan Pembeli yang tadinya hanya salinan Penerima.

   CUSTOMER = dropdown yang bisa ditambah (js/ui/pilihan-tambah.js).
   Tiap customer punya DATA PENGISIAN: Skema Invoice + isian Pihak,
   tersimpan di report_settings ("invoice-customer", sama untuk semua
   pengguna) dan diperbarui tiap kali nomor invoice untuknya terbit atau
   diubah (invCustomerIngat). Memilih customer mengisi form dari data itu
   -- atau, untuk customer yang belum punya, dari pengajuan invoice
   terakhirnya di riwayat, lalu profil pelanggan (CIPL_PROFIL). Hanya
   isian yang belum diubah sendiri yang diisi.

   Dipakai cetak & Excel CIPL (ciplShipperBaris, ciplPembeliBaris,
   ciplKonsigneeBaris di cipl-print.js); pengajuan lama tanpa isian ini
   tetap tercetak seperti dulu.
================================================================== */
const INV_PIHAK_ISIAN = {
  penjual: ["nama", "alamat", "npwp"],
  pemilik: ["nama", "alamat", "npwp"],
  pembeli: ["nama", "alamat", "negara"],
  penerima: ["nama", "alamat", "negara"],
};
const INV_POLA = {
  langsung: [["penjual", "pemilik"], ["penerima", "pembeli"]],
  "pihak-ketiga": [["penjual", "pemilik"]],
};
const INV_POLA_BAWAAN = "langsung";
const INV_POLA_LABEL = {
  langsung: ["Direct Invoice — Pembeli = Penerima", "Direct Invoice — Buyer = Consignee"],
  "pihak-ketiga": ["Third Party Invoice — Pembeli ≠ Penerima", "Third Party Invoice — Buyer ≠ Consignee"],
};
const INV_PIHAK_LABEL = { penjual: ["Penjual", "Seller"], pemilik: ["Pemilik Barang", "Goods Owner"], pembeli: ["Pembeli", "Buyer"], penerima: ["Penerima", "Consignee"] };

const INV_CUSTOMER_KUNCI = "invoice-customer";
const INV_CUSTOMER_BARU = "__customer-baru__";
const INV_CUSTOMER_MAKS_HURUF = 120;

// Kunci payload satu isian pihak ("pembeliNama"); alamat penerima memakai kunci lama
const invKunci = (pihak, isian) =>
  pihak === "penerima" && isian === "alamat" ? "consigneeAddress" : pihak + isian.charAt(0).toUpperCase() + isian.slice(1);
const INV_KUNCI_PIHAK = Object.keys(INV_PIHAK_ISIAN).flatMap((p) => INV_PIHAK_ISIAN[p].map((f) => invKunci(p, f)));
// Data pengisian satu customer: Skema Invoice + isian Pihak
const INV_KUNCI_DATA = ["polaPihak"].concat(INV_KUNCI_PIHAK);

const invPola = (v) => (INV_POLA[v] ? v : INV_POLA_BAWAAN);

/* [sumber, pengikut] satu Skema Invoice, dalam urutan penerusannya:
   Customer -> Nama Penerima lebih dulu, karena Penerima sendiri bisa
   jadi sumber (Direct: Penerima -> Pembeli). */
function invPasanganKunci(pola) {
  const hasil = [["customer", "penerimaNama"]];
  INV_POLA[invPola(pola)].forEach(([a, b]) => {
    INV_PIHAK_ISIAN[a].filter((f) => INV_PIHAK_ISIAN[b].includes(f)).forEach((f) => hasil.push([invKunci(a, f), invKunci(b, f)]));
  });
  return hasil;
}

/* ---------- akses form ---------- */
const invPanel = () => (typeof docNumPanelEl === "function" ? docNumPanelEl("invoice") : null);
const invEl = (panel, k) => (panel ? panel.querySelector(`[data-dn="${k}"]`) : null);
const invNilai = (el) => String((el && el.value) || "").trim();
const invOtomatis = (k) => String(((typeof dnIsianOtomatis === "object" && dnIsianOtomatis) || {})[k] || "").trim();
const invPolaForm = (panel) => invPola(invNilai(invEl(panel, "polaPihak")));

// Belum diubah pengguna: kosong, nilai bawaan HTML, atau persis yang diisikan mesin
function invBelumDiubah(el) {
  const v = invNilai(el);
  if (!v) return true;
  const bawaan = el.tagName === "SELECT" ? ([...el.options].find((o) => o.defaultSelected) || {}).value : el.defaultValue;
  return v === String(bawaan || "").trim() || v === invOtomatis(el.dataset.dn);
}
function invIsiOtomatis(el, nilai) {
  el.value = nilai;
  dnIsianOtomatis[el.dataset.dn] = el.value;
}

/* ---------- penerusan sumber -> pengikut ---------- */
function invTeruskan(panel, kunci, sudah) {
  const dari = invEl(panel, kunci);
  if (!invNilai(dari)) return;
  invPasanganKunci(invPolaForm(panel))
    .filter(([a]) => a === kunci)
    .forEach(([, b]) => {
      const ke = invEl(panel, b);
      if (!ke || sudah.has(b)) return;
      sudah.add(b);
      if (invNilai(ke) === invNilai(dari)) dnIsianOtomatis[b] = ke.value; // sudah sama = ikutan
      else if (invBelumDiubah(ke)) invIsiOtomatis(ke, dari.value);
      else return;
      invTeruskan(panel, b, sudah);
    });
}
function invTeruskanSemua(panel) {
  const sudah = new Set();
  [...new Set(invPasanganKunci(invPolaForm(panel)).map(([a]) => a))].forEach((k) => invTeruskan(panel, k, sudah));
}

/* ---------- tanda "= Penjual" & keterangan Skema Invoice ---------- */
function invSegarkanTanda(panel) {
  const pola = invPolaForm(panel);
  panel.querySelectorAll("[data-inv-ikut]").forEach((chip) => {
    const pihak = chip.dataset.invIkut;
    const pas = INV_POLA[pola].find(([, b]) => b === pihak);
    const sama =
      !!pas &&
      INV_PIHAK_ISIAN[pihak]
        .filter((f) => INV_PIHAK_ISIAN[pas[0]].includes(f))
        .every((f) => invNilai(invEl(panel, invKunci(pihak, f))) === invNilai(invEl(panel, invKunci(pas[0], f))));
    chip.hidden = !sama;
    chip.textContent = sama ? `= ${tt(...INV_PIHAK_LABEL[pas[0]])}` : "";
  });
  const ket = panel.querySelector("#dnPolaKet");
  if (ket)
    ket.textContent =
      pola === "langsung"
        ? tt("Direct Invoice: Pemilik Barang = Penjual, Pembeli = Penerima — terisi sama otomatis, tetap bisa diubah.",
          "Direct Invoice: Goods Owner = Seller, Buyer = Consignee — filled in automatically, still editable.")
        : tt("Third Party Invoice: Pemilik Barang = Penjual; Pembeli & Penerima berbeda — isi masing-masing.",
          "Third Party Invoice: Goods Owner = Seller; Buyer & Consignee differ — fill in each.");
  panel.dataset.polaKini = pola;
}

/* Skema berganti. Pengikut yang LEPAS (Pembeli saat pindah ke Third
   Party) dikosongkan bila isinya masih SALINAN sumbernya yang diisikan
   mesin: pihak itu kini harus diisi orang lain, dan salinan yang
   tertinggal mudah terkirim tanpa diperiksa. Isian dari data customer
   (bukan salinan) tetap. */
function invGantiPola(panel) {
  const lama = panel.dataset.polaKini;
  const baru = invPolaForm(panel);
  if (lama && lama !== baru) {
    const tetap = new Set(invPasanganKunci(baru).map(([, b]) => b));
    invPasanganKunci(lama).forEach(([a, b]) => {
      const el = invEl(panel, b);
      const v = invNilai(el);
      if (tetap.has(b) || !v || v !== invNilai(invEl(panel, a)) || v !== invOtomatis(b)) return;
      el.value = "";
      delete dnIsianOtomatis[b];
    });
  }
  invTeruskanSemua(panel);
  invSegarkanTanda(panel);
}

/* ---------- data pengisian customer ---------- */

let invCustomerTersimpan = []; // [{ nama, isian: { polaPihak, penjualNama, ... } }]

const invCustomerKotak = () => invEl(invPanel(), "customer");
const invCustomerEntri = (nama) => {
  const k = pilihanKunci(nama);
  return (k && invCustomerTersimpan.find((c) => pilihanKunci(c.nama) === k)) || null;
};
const invRiwayatInvoice = () =>
  (typeof docNumHistoryRows !== "undefined" ? docNumHistoryRows || [] : []).filter((r) => /^invoice/.test(String(r.doc_type || "")) && r.payload);

// Isian data pengisian dari sebuah objek (payload / form): hanya kunci data yang terisi
function invAmbilData(sumber) {
  const isian = {};
  INV_KUNCI_DATA.forEach((k) => {
    const v = String((sumber || {})[k] == null ? "" : sumber[k]).trim();
    if (v) isian[k] = v;
  });
  return isian;
}

/* Data pengisian satu customer: tersimpan, lalu pengajuan invoice
   terakhirnya yang berisi pihak, lalu profilnya. */
function invSumberCustomer(nama, opsi) {
  if (!pilihanKunci(nama)) return null;
  if (!(opsi && opsi.profilSaja)) {
    const entri = invCustomerEntri(nama);
    if (entri) return entri.isian;
    const k = pilihanKunci(nama);
    const terakhir = invRiwayatInvoice()
      .filter((r) => r.payload.polaPihak && pilihanKunci(r.payload.customer) === k)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    if (terakhir) return terakhir.payload;
  }
  const prof = ciplProfilCocok(nama);
  return prof && prof.isianPihak ? prof.isianPihak : null;
}

function invIsiDariSumber(panel, sumber) {
  if (!sumber) return;
  const pola = invEl(panel, "polaPihak");
  if (pola && INV_POLA[sumber.polaPihak] && invBelumDiubah(pola)) invIsiOtomatis(pola, sumber.polaPihak);
  INV_KUNCI_PIHAK.forEach((k) => {
    const el = invEl(panel, k);
    const v = sumber[k] == null ? "" : String(sumber[k]);
    if (el && v.trim() && invBelumDiubah(el)) invIsiOtomatis(el, v);
  });
}

// Pilihan Customer: tersimpan, profil pelanggan, riwayat invoice, buyer jadwal export
function invCustomerDaftar() {
  return pilihanSatukan(
    invCustomerTersimpan.map((c) => c.nama),
    CIPL_PROFIL.map((b) => b.nama || ""),
    invRiwayatInvoice().map((r) => r.payload.customer || ""),
    typeof daftarNamaPihak === "function" ? daftarNamaPihak("export") : [],
  ).filter((n) => n !== INV_CUSTOMER_BARU);
}
function invCustomerGambar() {
  pilihanGambar(invCustomerKotak(), invCustomerDaftar(), {
    kosong: tt("— pilih customer —", "— choose a customer —"),
    tambah: tt("+ Tambah customer baru…", "+ Add a new customer…"),
    sentinel: INV_CUSTOMER_BARU,
  });
}
// Nama dari luar daftar (jadwal ditautkan, pengajuan lama) jadi pilihan; ejaan yang ada menang
function invCustomerPastikan(nama) {
  return pilihanPastikan(invCustomerKotak(), nama);
}

/* report_settings "invoice-customer" = { customer: [{ nama, isian }] }.
   Dimuat tiap halaman Nomor Dokumen dibuka; gagal -> daftar yang ada
   tetap dipakai, form tetap bisa diisi. */
async function invCustomerBaca() {
  const { data, error } = await supabaseClient.from("report_settings").select("key, value").eq("key", INV_CUSTOMER_KUNCI).maybeSingle();
  if (error) throw error;
  const daftar = data && data.value && Array.isArray(data.value.customer) ? data.value.customer : [];
  return daftar.filter((c) => c && pilihanKunci(c.nama)).map((c) => ({ nama: pilihanRapikan(c.nama), isian: invAmbilData(c.isian) }));
}
async function invCustomerMuat() {
  try {
    invCustomerTersimpan = await invCustomerBaca();
  } catch (e) {
    console.warn("Daftar customer invoice tidak termuat:", e);
  }
  invCustomerGambar();
}

/* Menyimpan data pengisian satu customer. Dibaca ulang lebih dulu lalu
   digabung, supaya customer yang ditambahkan pengguna lain tidak
   tertimpa. Tidak menulis apa pun bila datanya tidak berubah. */
async function invCustomerSimpan(nama, isian, opsi) {
  const rapi = pilihanRapikan(nama);
  const k = pilihanKunci(rapi);
  if (!k) return false;
  try {
    const daftar = await invCustomerBaca();
    const i = daftar.findIndex((c) => pilihanKunci(c.nama) === k);
    const baru = { nama: i >= 0 ? daftar[i].nama : rapi, isian: Object.assign({}, i >= 0 ? daftar[i].isian : {}, isian) };
    if (i >= 0 && JSON.stringify(daftar[i]) === JSON.stringify(baru)) {
      invCustomerTersimpan = daftar;
      return true;
    }
    if (i >= 0) daftar[i] = baru;
    else daftar.push(baru);
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: INV_CUSTOMER_KUNCI,
      value: { customer: daftar },
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    if (error) throw error;
    invCustomerTersimpan = daftar;
    return true;
  } catch (e) {
    console.error(e);
    if (!(opsi && opsi.diam))
      showToast(
        tt(
          `${rapi} dipakai untuk pengajuan ini, tetapi datanya belum tersimpan ke daftar customer. Pastikan migration-report-settings.sql sudah dijalankan.`,
          `${rapi} is used for this request, but its data was not saved to the customer list. Make sure migration-report-settings.sql has been run.`,
        ),
        "warning",
      );
    return false;
  }
}

/* Nomor invoice terbit / diubah: data pengisian customernya diperbarui,
   jadi invoice berikutnya untuk customer itu langsung terisi sama. */
function invCustomerIngat(payload) {
  const p = payload || {};
  if (!pilihanKunci(p.customer) || p.customer === INV_CUSTOMER_BARU) return Promise.resolve(false);
  return invCustomerSimpan(p.customer, invAmbilData(p), { diam: true });
}

/* "+ Tambah customer baru…": nama + Skema Invoice-nya. Customer langsung
   terpilih; isian Pihak-nya diisi di form dan ikut tersimpan saat nomor
   terbit. */
function invCustomerTambah(kotak) {
  showPrompt({
    title: tt("Tambah customer baru", "Add a new customer"),
    icon: "bi-person-plus",
    desc: tt(
      "Customer langsung terpilih. Lengkapi Penjual, Pemilik, Pembeli & Penerima di form — datanya tersimpan saat nomor diterbitkan dan terisi lagi otomatis berikutnya.",
      "The customer is selected right away. Complete the Seller, Goods Owner, Buyer & Consignee on the form — the data is saved when the number is issued and filled in automatically next time.",
    ),
    okText: tt("Tambah", "Add"),
    fields: [
      { key: "nama", label: tt("Nama customer", "Customer name"), placeholder: tt("Cth: KUMHO TIRE (VIETNAM) CO., LTD", "e.g. KUMHO TIRE (VIETNAM) CO., LTD") },
      {
        key: "polaPihak",
        label: tt("Skema Invoice", "Invoice Scheme"),
        type: "select",
        value: INV_POLA_BAWAAN,
        options: Object.keys(INV_POLA_LABEL).map((v) => ({ value: v, label: tt(...INV_POLA_LABEL[v]) })),
      },
    ],
    onSubmit: (v) => {
      const nama = pilihanRapikan(v.nama).toUpperCase();
      if (!nama) return tt("Nama customer harus diisi.", "The customer name is required.");
      if (nama.length > INV_CUSTOMER_MAKS_HURUF)
        return tt(`Nama customer paling panjang ${INV_CUSTOMER_MAKS_HURUF} huruf.`, `The customer name can have at most ${INV_CUSTOMER_MAKS_HURUF} characters.`);
      pilihanPilih(kotak, nama); // data customer bernama sama (bila ada) ikut terisi
      // Skema yang dipilih di kotak isian ini yang berlaku
      const panel = invPanel();
      const pola = invEl(panel, "polaPihak");
      if (pola) {
        invIsiOtomatis(pola, invPola(v.polaPihak));
        invGantiPola(panel);
      }
      invCustomerSimpan(kotak.value, { polaPihak: invPola(v.polaPihak) });
      return true;
    },
  });
}

/* Jadwal export yang ditautkan: pihak dari Data PEB-nya (bila ada) --
   eksportir -> Penjual. set = pengisi isian otomatis docnum-view.js. */
function invIsiDariJadwal(s, set) {
  const pihak = (s && s.dataPabean && s.dataPabean.pihak) || {};
  [["eksportir", "penjual"], ["pemilik", "pemilik"], ["pembeli", "pembeli"], ["penerima", "penerima"]].forEach(([dari, ke]) => {
    const x = pihak[dari] || {};
    INV_PIHAK_ISIAN[ke].forEach((f) => {
      const v = f === "npwp" ? x.identitas || x.npwp : x[f];
      if (dpAda(v)) set(invKunci(ke, f), String(v));
    });
  });
  const panel = invPanel();
  if (panel) invGantiPola(panel);
}

/* ---------- pasang ---------- */

/* Bawaan Penjual & Pemilik = perusahaan sendiri: nama & alamat persis
   kotak Shipper CIPL (CIPL_SHIPPER), NPWP dari data PEB perusahaan.
   Satu sumber -- tidak ditulis ulang di HTML. */
function invPasangBawaan(panel) {
  const nama = CIPL_SHIPPER[0];
  const alamat = CIPL_SHIPPER.slice(1).join("\n");
  ["penjual", "pemilik"].forEach((p) => {
    [["Nama", nama], ["Alamat", alamat], ["Npwp", DP_PERUSAHAAN.npwp]].forEach(([f, v]) => {
      const el = invEl(panel, p + f);
      if (!el) return;
      const kosong = !el.value;
      el.defaultValue = v;
      if (kosong) el.value = v;
    });
  });
}

/* Dipanggil sesudah form diisi ulang tanpa peristiwa ketik (dikosongkan,
   pengajuan dibuka untuk diubah, draf dipulihkan). lengkapi: pengajuan
   LAMA tanpa isian pihak dilengkapi dari profil customernya. */
function invPihakSegarkan(opsi) {
  const panel = invPanel();
  if (!panel) return;
  if (opsi && opsi.lengkapi && !invNilai(invEl(panel, "penerimaNama")))
    invIsiDariSumber(panel, invSumberCustomer(invNilai(invEl(panel, "customer")), { profilSaja: true }));
  invTeruskanSemua(panel);
  invSegarkanTanda(panel);
}

(function invPasang() {
  const panel = invPanel();
  if (!panel || !invEl(panel, "polaPihak")) return;
  invPasangBawaan(panel);
  invCustomerGambar();
  panel.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.dn;
    if (!k || (k !== "customer" && !INV_KUNCI_PIHAK.includes(k))) return;
    invTeruskan(panel, k, new Set());
    invSegarkanTanda(panel);
  });
  panel.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.dn;
    if (k === "polaPihak") invGantiPola(panel);
    else if (k === "customer" && e.target.value !== INV_CUSTOMER_BARU) {
      invIsiDariSumber(panel, invSumberCustomer(e.target.value));
      invGantiPola(panel);
    }
  });
  // Pilihan disegarkan tiap dibuka: riwayat & jadwal bisa sudah bertambah
  invCustomerKotak().addEventListener("focus", invCustomerGambar);
  pilihanPasangTambah('[data-docnum-panel="invoice"] [data-dn="customer"]', INV_CUSTOMER_BARU, invCustomerTambah);
  invSegarkanTanda(panel);
})();
