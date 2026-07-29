"use strict";

/* HELPERS */
function uid(p) {
  return (p || "s") + "_" + Math.random().toString(36).slice(2, 10);
}

function parseLocalDate(d) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt) ? null : dt;
}
// Tanggal HARI INI dalam format ISO (yyyy-mm-dd), memakai zona waktu LOKAL pengguna
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/* Tanggal tampilan: DD-MM-YYYY.
   Sengaja disusun sendiri, bukan lewat toLocaleDateString — hasil
   locale bergantung pada setelan peramban tiap pengguna, dan justru
   itu yang membuat formatnya berbeda-beda antar komputer. */
function fmtDate(d) {
  const dt = parseLocalDate(d);
  if (!dt) return "—";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(dt.getDate())}-${p2(dt.getMonth() + 1)}-${dt.getFullYear()}`;
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
// isPastOrToday() (dipakai utk auto-arrive) dihapus -- auto-arrive sudah tidak ada lagi
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
    // Kemasan PER BARANG (dulu 1 field bebas-teks di level shipment, sekarang per barang
    package: "",
    // Fasilitas per barang — SKB & E-COO sekarang 1 daftar yang sama (skb)
    skb: [],
    // _facOpen: state UI murni (panel fasilitas terbuka/tertutup di tabel draft)
    _facOpen: false,
  };
}

// Dimensi P x L x T (cm) dari field Kemasan per barang mode Export (mis
function parsePackageDims(raw) {
  const parts = String(raw || "")
    .split(/[x*]/i)
    .map((t) => parseFloat(String(t).trim().replace(",", ".")))
    .filter((n) => !isNaN(n));
  if (parts.length < 3) return null;
  return { p: parts[0], l: parts[1], t: parts[2] };
}

// Meter kubik 1 barang mode Export: (P x L x T dalam cm) / 1.000.000 x Qty barang
function computeItemCbm(it) {
  const dims = parsePackageDims(it.package);
  if (!dims) return 0;
  const qty = Number(it.qty) || 0;
  const cbm = ((dims.p * dims.l * dims.t) / 1000000) * qty;
  return Math.round(cbm * 1000) / 1000;
}

// Satu entri SKB dalam daftar per-barang
function newSkbEntry() {
  return { jenis: "PPH", jenisLainnya: "", nomor: "", tanggal: "" };
}

// Kompatibilitas dengan data lama: ubah teks bebas gaya lama, mis
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

// Bersihkan 1 entri SKB (dipakai baik untuk draft di form maupun hasil baca dari Supabase)
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
