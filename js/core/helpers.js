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
// Tanggal HARI INI dalam format ISO (yyyy-mm-dd), memakai zona waktu
// LOKAL pengguna. Sengaja tidak memakai toISOString(), yang mengubah ke
// UTC — di Indonesia (UTC+7) itu bisa menggeser tanggal ke hari
// sebelumnya untuk jam-jam dini hari.
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
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
// isPastOrToday() (dipakai utk auto-arrive) dihapus -- auto-arrive
// sudah tidak ada lagi (lihat route-model.js / modal-fields.js /
// card-events.js), jadi fungsi ini sudah tidak dipanggil dari manapun.
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
    // Kemasan PER BARANG (dulu 1 field bebas-teks di level shipment,
    // sekarang per barang — lihat item-table.js). Artinya beda per mode:
    //  - Import: teks bebas "Jumlah + Jenis Kemasan", mis. "5 BOX" —
    //    angka depannya dipakai utk Total Package (lihat itemTotals()),
    //    lewat extractLeadingNumber() yang sudah ada di
    //    excel-row-format.js (TIDAK dipindah/diduplikasi di sini).
    //  - Export: dimensi kemasan "P*L*T" cm, mis. "82*82*75" — dipakai
    //    utk hitung meter kubik per barang (lihat computeItemCbm() di
    //    bawah). Total Package utk export SENGAJA tidak dihitung dari
    //    sini — diisi manual oleh user (lihat foot-package di form).
    package: "",
    // Fasilitas per barang — SKB & E-COO sekarang 1 daftar yang sama
    // (skb), bisa berisi berapapun entri. E-COO cuma salah satu "jenis"
    // di dalamnya (lihat SKB_TYPE_OPTIONS), bukan field terpisah lagi.
    skb: [],
    // _facOpen: state UI murni (panel fasilitas terbuka/tertutup di
    // tabel draft), TIDAK pernah dikirim ke database — lihat itemToRow().
    _facOpen: false,
  };
}

// Dimensi P x L x T (cm) dari field Kemasan per barang mode Export
// (mis. "82*82*75" atau "82x82x75" -> {p:82, l:82, t:75}). Pemisah "*"
// ATAU "x"/"X" (fleksibel karena user bisa ketik salah satu). null
// kalau tidak ketemu tepat 3 angka.
function parsePackageDims(raw) {
  const parts = String(raw || "")
    .split(/[x*]/i)
    .map((t) => parseFloat(String(t).trim().replace(",", ".")))
    .filter((n) => !isNaN(n));
  if (parts.length < 3) return null;
  return { p: parts[0], l: parts[1], t: parts[2] };
}

// Meter kubik 1 barang mode Export: (P x L x T dalam cm) / 1.000.000 x
// Qty barang (field qty yang sama dipakai utk kolom QTY/AMOUNT barang
// ini, sesuai rumus dari Bgenius: 82*82*75/1000000*1 = 0.504).
// Dibulatkan 3 desimal. 0 kalau field Kemasan belum/tidak bisa di-parse.
function computeItemCbm(it) {
  const dims = parsePackageDims(it.package);
  if (!dims) return 0;
  const qty = Number(it.qty) || 0;
  const cbm = ((dims.p * dims.l * dims.t) / 1000000) * qty;
  return Math.round(cbm * 1000) / 1000;
}

// Sisa teks SETELAH angka depan field Kemasan mode Import (mis.
// "5 BOX" -> "BOX", "1 PKG" -> "PKG") — Jenis Kemasan-nya. Regex sama
// persis dengan extractLeadingNumber() (excel-row-format.js), cuma
// yang diambil bagian sisanya, bukan angkanya. Dipakai HANYA utk hint
// tampilan; Jumlah yang dipakai di kalkulasi Total Package tetap dari
// extractLeadingNumber() aslinya.
function packageJenisText(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^-?\d+(?:[.,]\d+)?\s*(.*)$/);
  return m ? m[1].trim() : s;
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
