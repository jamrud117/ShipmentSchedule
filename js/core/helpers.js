"use strict";

/* ==================================================================
   HELPERS
================================================================== */
function uid(p) {
  return (p || "s") + "_" + Math.random().toString(36).slice(2, 10);
}

function parseLocalDate(d) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt) ? null : dt;
}
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return "—";
  return dt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateLong(d) {
  const dt = parseLocalDate(d);
  if (!dt) return "Tanggal Tidak Diketahui";
  return dt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
function todayStripped() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}
function isPastOrToday(dateStr) {
  const dt = parseLocalDate(dateStr);
  if (!dt) return false;
  return dt.getTime() <= todayStripped().getTime();
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function fmtUSD(n) {
  n = Number(n) || 0;
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}
function fmtRp(n) {
  n = Math.round(Number(n) || 0);
  return "Rp " + n.toLocaleString("id-ID");
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString("id-ID");
}
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function escapeAttr(str) {
  return escapeHtml(str);
}

function newItem() {
  return {
    id: uid("it"),
    namaBarang: "",
    hsCode: "",
    jenisBarang: "Bahan Baku",
    qty: 0,
    satuan: "PCS",
    harga: 0,
    netto: 0,
    bruto: 0,
    // Fasilitas per barang — SKB & E-COO sekarang 1 daftar yang sama
    // (skb), bisa berisi berapapun entri. E-COO cuma salah satu "jenis"
    // di dalamnya (lihat SKB_TYPE_OPTIONS), bukan field terpisah lagi.
    skb: [],
    // _facOpen: state UI murni (panel fasilitas terbuka/tertutup di
    // tabel draft), TIDAK pernah dikirim ke database — lihat itemToRow().
    _facOpen: false,
  };
}

// Satu entri SKB dalam daftar per-barang. "jenis" salah satu dari
// SKB_TYPE_OPTIONS; kalau "Lainnya", teks bebasnya ada di jenisLainnya.
function newSkbEntry() {
  return { jenis: "PPH", jenisLainnya: "", nomor: "", tanggal: "" };
}

// Kompatibilitas dengan data lama: ubah teks bebas gaya lama, mis. "PPH"
// atau "PPH, PPN" (dari kolom FASILITAS/SKB di file Excel legacy), jadi
// daftar entri SKB terstruktur. Dipakai di Bulk Import untuk mengisi SKB
// barang pertama (data lama tidak punya info per-barang, jadi baris
// pertama dipakai sebagai perkiraan terbaik).
function skbTextToEntries(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const match = SKB_TYPE_OPTIONS.find(
        (o) => o !== "Lainnya" && o.toLowerCase() === t.toLowerCase(),
      );
      return match
        ? { jenis: match, jenisLainnya: "", nomor: "", tanggal: "" }
        : { jenis: "Lainnya", jenisLainnya: t, nomor: "", tanggal: "" };
    });
}

// Bersihkan 1 entri SKB (dipakai baik untuk draft di form maupun hasil
// baca dari Supabase) supaya selalu punya ke-4 key-nya dengan tipe yang
// benar, jadi kode lain tidak perlu jaga-jaga field hilang/undefined.
function sanitizeSkbEntry(sk) {
  const jenis = SKB_TYPE_OPTIONS.includes(sk && sk.jenis)
    ? sk.jenis
    : "Lainnya";
  return {
    jenis,
    jenisLainnya: (sk && sk.jenisLainnya) || "",
    nomor: (sk && sk.nomor) || "",
    tanggal: (sk && sk.tanggal) || "",
  };
}

function sanitizeSkbList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeSkbEntry);
}

function newStop() {
  return {
    id: uid("st"),
    terminal: "",
    transport: "laut",
    vessel: "",
    voyage: "",
    arrivalDate: "",
    departureDate: "",
  };
}
