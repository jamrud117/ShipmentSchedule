"use strict";

/* LARTAS & FTA — dokumen yang wajib / menguntungkan menurut barangnya
   (buku Import).

   1. LARTAS PER HS CODE. Database HS Code (hs_code_master.lartas,
      migration-lampiran-lartas-kebutuhan.sql) menandai HS yang wajib
      PI (Persetujuan Impor), LS (Laporan Surveyor) atau SNI. Barang
      ber-HS itu -> dokumennya wajib ada di jadwal.

   2. BARANG BUKAN BARU. Barang ber-Kondisi 2 (BUKAN BARU) wajib PI --
      Permendag 24/2025 tentang impor barang dalam keadaan tidak baru,
      Pasal 5 (PI sebelum barang masuk daerah pabean). Verifikasi
      surveyor + LS hanya untuk HS tertentu (Pasal 7), jadi LS-nya
      mengikuti tanda di Database HS Code, bukan aturan ini.

   3. COO & FTA. Negara asal barang yang punya perjanjian dagang (FTA)
      dengan Indonesia -> COO (SKA) dengan form skemanya memberi tarif
      bea masuk preferensi. Ditampilkan sebagai petunjuk di tahap COO &
      kartu Dokumen Pelengkap Pabean -- bukan kewajiban.

   "Terpenuhi" dibaca dari kartu Dokumen Pelengkap Pabean: PI / LS
   dianggap ada begitu satu nomornya terisi. SNI tidak punya isian
   sendiri (sertifikatnya di Dokumen Lain), jadi hanya diingatkan. */

const LARTAS_KODE = ["PI", "LS", "SNI"];
const LARTAS_INFO = {
  PI: { get nama() { return tt("PI — Persetujuan Impor", "PI — Import Approval"); }, get singkat() { return tt("Terbitan Kemendag, harus ada sebelum barang tiba", "Issued by the Ministry of Trade, needed before the goods arrive"); } },
  LS: { get nama() { return tt("LS — Laporan Surveyor", "LS — Surveyor Report"); }, get singkat() { return tt("Hasil verifikasi surveyor sebelum barang dimuat", "Surveyor verification before loading"); } },
  SNI: { get nama() { return tt("SNI wajib", "Mandatory SNI"); }, get singkat() { return tt("SPPT-SNI / pertimbangan teknis, dilampirkan di Dokumen Lain", "SPPT-SNI / technical clearance, listed under Other Documents"); } },
};

// "PI, LS" / ["ls","pi"] -> ["PI", "LS"] menurut urutan baku; kode lain dibuang
function rapikanLartas(x) {
  const daftar = Array.isArray(x) ? x : String(x == null ? "" : x).split(/[\s,;/]+/);
  const ada = new Set(daftar.map((v) => String(v || "").trim().toUpperCase()));
  return LARTAS_KODE.filter((k) => ada.has(k));
}

const hsDelapanDigit = (kode) => String(kode == null ? "" : kode).replace(/\D/g, "").slice(0, 8);

/* HS 8 digit -> Set lartas dari Database HS Code (hsCodeRows, dimuat
   hscode-view.js). Disusun ulang hanya kalau isi database berubah
   (versiHsCode naik tiap dimuat / ditambah / diubah / dihapus). */
let petaLartasSimpan = { versi: -1, peta: new Map() };
function petaLartasHs() {
  const rows = typeof hsCodeRows !== "undefined" ? hsCodeRows : [];
  const versi = typeof versiHsCode !== "undefined" ? versiHsCode : rows.length;
  if (petaLartasSimpan.versi === versi && petaLartasSimpan.rows === rows) return petaLartasSimpan.peta;
  const peta = new Map();
  rows.forEach((r) => {
    const kode = hsDelapanDigit(r.hs_code);
    const lartas = rapikanLartas(r.lartas);
    if (kode.length !== 8 || !lartas.length) return;
    if (!peta.has(kode)) peta.set(kode, new Set());
    lartas.forEach((k) => peta.get(kode).add(k));
  });
  petaLartasSimpan = { versi, rows, peta };
  return peta;
}

// Lartas satu HS Code menurut database: ["PI", "LS"], [] bila tidak ada
function lartasHsCode(kode) {
  const set = petaLartasHs().get(hsDelapanDigit(kode));
  return set ? LARTAS_KODE.filter((k) => set.has(k)) : [];
}

/* KEBUTUHAN LARTAS satu jadwal: { PI: [alasan], LS: [...], SNI: [...] }
   -- alasan { sebab: "hs" | "bukanBaru", hs, barang }. `items` boleh
   diberikan (form: draftItems); bawaannya barang jadwalnya. */
function kebutuhanLartas(s, items) {
  const out = { PI: [], LS: [], SNI: [] };
  if (!s || s.mode === "export") return out;
  (items || s.items || []).forEach((it) => {
    if (!it) return;
    const barang = (typeof itemDisplayName === "function" ? itemDisplayName(it) : it.namaBarang) || "";
    if (!String(barang).trim() && !it.hsCode) return;
    const hs = hsDelapanDigit(it.hsCode);
    lartasHsCode(hs).forEach((k) => out[k].push({ sebab: "hs", hs, barang }));
    if (kodeKondisiBarang(it.kondisiBarang) === "2") out.PI.push({ sebab: "bukanBaru", hs, barang });
  });
  return out;
}

/* PI / LS yang WAJIB tapi BELUM ADA nomornya di Dokumen Pelengkap
   Pabean: ["PI", "LS"]. `dok` boleh diberikan (form: draftDokPelengkap). */
function lartasKurang(s, items, dok) {
  const perlu = kebutuhanLartas(s, items);
  const d = dok || dokPelengkapJadwal(s);
  const ada = (j) => ((d && d[j]) || []).some((x) => String((x && x.nomor) || "").trim());
  return ["PI", "LS"].filter((k) => perlu[k].length && !ada(k.toLowerCase()));
}

/* ------------------------------------------------------------------
   PERJANJIAN DAGANG (FTA) YANG BERLAKU UNTUK IMPOR KE INDONESIA

   Dipakai sebagai petunjuk COO, bukan perhitungan tarif. Form SKA
   ditulis hanya bila namanya baku. Sumber: portal FTA DJBC
   (ftadjbc.info) & daftar perjanjian berlaku Kemendag; diperiksa
   Oktober 2026. Perjanjian yang baru berlaku (mis. Indonesia-Kanada,
   Indonesia-Uni Eropa) ditambahkan di sini begitu berlaku.
------------------------------------------------------------------ */
const NEGARA_ASEAN = ["BN", "KH", "LA", "MY", "MM", "PH", "SG", "TH", "VN"];
const FTA_INDONESIA = [
  { kode: "ATIGA", form: "Form D", negara: NEGARA_ASEAN },
  { kode: "ACFTA", form: "Form E", negara: ["CN"] },
  { kode: "AKFTA", form: "Form AK", negara: ["KR"] },
  { kode: "IK-CEPA", form: "", negara: ["KR"] },
  { kode: "AJCEP", form: "Form AJ", negara: ["JP"] },
  { kode: "IJEPA", form: "Form IJEPA", negara: ["JP"] },
  { kode: "AIFTA", form: "Form AI", negara: ["IN"] },
  { kode: "AANZFTA", form: "Form AANZ", negara: ["AU", "NZ"] },
  { kode: "IA-CEPA", form: "", negara: ["AU"] },
  { kode: "AHKFTA", form: "Form AHK", negara: ["HK"] },
  { kode: "RCEP", form: "Form RCEP", negara: NEGARA_ASEAN.concat(["CN", "JP", "KR", "AU", "NZ"]) },
  { kode: "IP-PTA", form: "Form IP", negara: ["PK"] },
  { kode: "IC-CEPA", form: "", negara: ["CL"] },
  { kode: "IE-CEPA", form: "", negara: ["CH", "NO", "IS", "LI"] },
  { kode: "IUAE-CEPA", form: "", negara: ["AE"] },
  { kode: "IM-PTA", form: "", negara: ["MZ"] },
];

const skemaFtaNegara = (kode) => FTA_INDONESIA.filter((f) => f.negara.indexOf(kode) >= 0);
const teksSkemaFta = (f) => (f.form ? `${f.kode} (${f.form})` : f.kode);

// Kode negara asal barang-barang sebuah jadwal, unik, menurut urutan barang
function negaraAsalBarang(items) {
  const out = [];
  (items || []).forEach((it) => {
    const k = it && typeof kodeNegara === "function" ? kodeNegara(it.negaraAsal) : "";
    if (k && k !== "ID" && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}

/* Satu kalimat petunjuk COO (buku Import), "" bila negara asal belum
   diisi: skema FTA per negara asal, atau keterangan bahwa negaranya
   tidak punya FTA -- COO-nya tidak menurunkan tarif. */
function petunjukFtaCoo(s, items) {
  if (!s || s.mode === "export") return "";
  const negara = negaraAsalBarang(items || s.items);
  if (!negara.length) return "";
  const dengan = negara.filter((k) => skemaFtaNegara(k).length);
  const tanpa = negara.filter((k) => !skemaFtaNegara(k).length);
  if (!dengan.length) {
    return tt(
      `Negara asal ${tanpa.join(", ")} tidak punya perjanjian dagang (FTA) dengan Indonesia — COO tidak memberi tarif preferensi.`,
      `Origin ${tanpa.join(", ")} has no free trade agreement with Indonesia — a COO gives no preferential tariff.`,
    );
  }
  const bagian = dengan.map((k) => `${k}: ${skemaFtaNegara(k).map(teksSkemaFta).join(" · ")}`);
  const sisa = tanpa.length ? tt(`; ${tanpa.join(", ")}: tanpa FTA`, `; ${tanpa.join(", ")}: no FTA`) : "";
  return tt(`Tarif preferensi dengan COO — ${bagian.join("; ")}${sisa}.`, `Preferential tariff with a COO — ${bagian.join("; ")}${sisa}.`);
}
