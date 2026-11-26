"use strict";

/* ==================================================================
   DROPDOWN DRAFTER / PEMOHON DARI AKUN

   Pilihan Pemohon / Drafter di form Nomor Dokumen (select
   [data-dn="requester"]) = nama bawaan (PEMOHON_BAWAAN) + nama setiap
   akun yang perannya BOLEH MENGUBAH jenis dokumen itu (tabel PERAN,
   session.js):
     Invoice, Surat Jalan, Pengajuan Dana, Surat  peran ber-`ubah` (EXIM);
     PO & PR                                      + peran ber-`poPr`
                                                    (Purchasing, Engineering).
   Akun BARU dengan peran itu langsung ikut muncul: daftarnya dibaca saat
   halaman Nomor Dokumen dibuka dan dibaca ulang setiap tabel profiles
   berubah (realtime). Tanpa izin membaca akun lain, daftarnya tetap nama
   bawaan + akun sendiri.

   Pilihan yang sedang terpilih -- juga nama lama yang sudah tidak ada di
   daftar -- tidak pernah hilang. Bawaan (defaultSelected, dipakai Reset)
   = akun yang sedang masuk bila ia boleh mengubah jenis itu: pembuatnya
   hampir selalu dirinya sendiri; selain itu bawaan HTML.
================================================================== */
const PEMOHON_BAWAAN = ["Ahmad Riyan", "M Thorik Maulana", "Yogi Firgiawan"];
let pemohonAkun = null; // [{ nama, peran }] dari profiles; null = belum dibaca
let pemohonJanji = null;
let pemohonRtTunda = null;

const pemohonKunci = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pemohonNamaAkun = (r) => String((r && (r.full_name || r.username)) || "").replace(/\s+/g, " ").trim();

// Peran yang boleh mengubah jenis dokumen `tab`
function pemohonPeranBoleh(peran, tab) {
  if (!Object.prototype.hasOwnProperty.call(PERAN, peran)) return false;
  return !!(PERAN[peran].ubah || (tab === "po" && PERAN[peran].poPr));
}

// Nama-nama pilihan untuk jenis `tab`, urut abjad, tanpa kembar (huruf & tanda baca diabaikan)
function pemohonDaftar(tab) {
  const lihat = new Set();
  const hasil = [];
  const tambah = (nama) => {
    const k = pemohonKunci(nama);
    if (!k || lihat.has(k)) return;
    lihat.add(k);
    hasil.push(nama);
  };
  PEMOHON_BAWAAN.forEach(tambah);
  (pemohonAkun || []).filter((x) => pemohonPeranBoleh(x.peran, tab)).forEach((x) => tambah(x.nama));
  const saya = authState && authState.profile;
  if (saya && pemohonPeranBoleh(saya.role, tab)) tambah(pemohonNamaAkun(saya));
  return hasil.sort((a, b) => a.localeCompare(b, "id"));
}

// Nama akun yang sedang masuk, sebagaimana tertulis di daftar -- "" bila tidak ada
function pemohonSaya(daftar, tab) {
  const saya = authState && authState.profile;
  if (!saya || !pemohonPeranBoleh(saya.role, tab)) return "";
  const k = pemohonKunci(pemohonNamaAkun(saya));
  return daftar.find((n) => pemohonKunci(n) === k) || "";
}

function pemohonIsiSelect(sel) {
  const panel = sel.closest("[data-docnum-panel]");
  const tab = panel ? panel.dataset.docnumPanel : "";
  const daftar = pemohonDaftar(tab);
  const kini = sel.value;
  const bawaanLama = [...sel.options].find((o) => o.defaultSelected && o.value);
  const bawaan = pemohonSaya(daftar, tab) || (bawaanLama ? bawaanLama.value : "");
  // Pilihan kosong "— pilih —" (elemen aslinya: teksnya diterjemahkan i18n) & nama lama yang disisipkan tetap
  const kosong = [...sel.options].find((o) => o.value === "");
  const lawas = [...sel.options].filter((o) => o.dataset.dnLawas && !daftar.some((n) => n === o.value));
  const baru = daftar.map((nama) => {
    const o = document.createElement("option");
    o.value = nama;
    o.textContent = nama;
    o.defaultSelected = nama === bawaan;
    return o;
  });
  sel.replaceChildren(...[kosong].filter(Boolean), ...baru, ...lawas);
  /* Yang belum disentuh pengguna ikut bawaan barunya; pilihan sendiri (atau
     nama pengajuan lama yang sedang diubah) dipertahankan. */
  const tetap = sel.dataset.disentuh || (kini && kini !== (bawaanLama && bawaanLama.value));
  if (tetap && kini && typeof dnSetelIsian === "function") dnSetelIsian(sel, kini);
  else sel.value = bawaan;
}

function pemohonTerapkan() {
  document.querySelectorAll('[data-docnum-panel] select[data-dn="requester"]').forEach(pemohonIsiSelect);
}

async function pemohonMuat(paksa) {
  if (pemohonJanji && !paksa) return pemohonJanji;
  pemohonJanji = (async () => {
    try {
      const { data, error } = await supabaseClient.from("profiles").select("full_name, username, role");
      if (error) throw error;
      pemohonAkun = (data || []).map((r) => ({ nama: pemohonNamaAkun(r), peran: r.role })).filter((x) => x.nama);
    } catch (e) {
      console.warn("Daftar Drafter dari akun tidak terbaca:", e);
      if (!pemohonAkun) pemohonAkun = [];
    }
    pemohonTerapkan();
    return pemohonAkun;
  })();
  return pemohonJanji;
}

// Pilihan sendiri tidak ditimpa bawaan akun saat daftar dibaca ulang
document.addEventListener("change", (e) => {
  const sel = e.target;
  if (sel && sel.matches && sel.matches('[data-docnum-panel] select[data-dn="requester"]')) sel.dataset.disentuh = "1";
});

if (typeof realtimeDaftar === "function") {
  realtimeDaftar("profiles", () => {
    if (pemohonAkun === null) return; // belum pernah dibaca: dibaca saat halaman dibuka
    clearTimeout(pemohonRtTunda);
    pemohonRtTunda = setTimeout(() => pemohonMuat(true), typeof RT_JEDA !== "undefined" ? RT_JEDA.umum : 800);
  });
}
