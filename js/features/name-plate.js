"use strict";

/* ==================================================================
   NAME PLATE & BERAT PER BOX -- CIPL KUMHO

   Buku kerja CIPL Kumho (Excel) punya tabel bantu di samping Packing
   List, satu baris per box:

     Carton No. | Pattern | Size | Mold No | Tread | Side | B/R | BOX |
     N/W | GW | FINISHED DATE OF PRODUCTION

   dan lembar NAME PLATE yang dirakit dari tabel itu. Di aplikasi
   keduanya jadi satu halaman (#/nameplate/<id nomor invoice>,
   views/name-plate-view.js). Berkas ini memegang hitungannya, cetakan
   A4-nya, dan lembar Excel-nya -- satu model (npModel) untuk ketiganya,
   jadi angka di layar, di PL, di name plate, dan di Excel tidak bisa
   berbeda.

   HITUNGAN (rumus lembar aslinya, U = Q+R+S, V = U+T):
     N/W = Tread + Side + B/R          GW = N/W + BOX
   Isian boleh berupa penjumlahan seperti sel Excel-nya ("126+127",
   "=16.73+16.32+..."): berat tread memang ditimbang per segmen. Isian
   kosong = 0 -- mold TREAD ONLY tidak punya Side & B/R -- tetapi baris
   yang Tread, Side & B/R-nya kosong semua BELUM punya berat (bukan 0 kg).

   PL DIBULATKAN PER BARANG (profil `beratPlBulat`, cipl-print.js): Net
   & Gross Wt. tiap barang = ROUND(berat per set x Qty, 0) dan TOTAL =
   jumlah angka bulat itu -- persis =ROUND(U32*F32,0) dan =SUM(H32:H55)
   di lembar aslinya. BUKAN total mentah yang dibulatkan: baris yang
   tercetak harus menjumlah tepat ke TOTAL di bawahnya (contoh nyata
   DDI - CRBM - XI - 073: total mentah 4.686,39 -> 4.686, sedangkan
   barisnya yang sudah bulat menjumlah 4.687).

   NAME PLATE = 4 COPY PER BOX (`sisi`, bisa diubah): satu di tiap sisi
   box. Box per barang = kolom Kemasan barang itu -- aturan yang sama
   dengan "N PACKAGES" & DIMENSION di Packing List (ciplVnDimensi):
   barang tanpa jumlah kemasan ikut box barang di atasnya, dan jadwal
   yang sama sekali tidak mencatat jumlah kemasan = satu set satu box.
   Isi plate = lembar NAME PLATE aslinya: MODEL NAME (Pattern), PART
   NAME, MATERIAL, MAKER | DATE(Y/M/D), WEIGHT (N/W per set, dibulatkan),
   EDITION/CAV, TYPE (Size); di kanannya kotak Carton No. penanda box.

   DATA tersimpan di payload nomor invoice -- tanpa kolom database baru:
     payload.namePlate = {
       baris: [{ nama, marks, tread, side, br, box, tanggal }],  // per barang
       material, edisi, sisi,
     }
   `nama` = nama barang saat disimpan: urutan barang jadwal yang berubah
   tidak menukar berat antarbarang (npCocokkan). Isian ditulis apa adanya
   (rumusnya ikut), supaya bisa diperiksa lagi segmen per segmen.
================================================================== */

// Isian bawaan -- sama dengan lembar NAME PLATE buku kerja CIPL Kumho
const NP_BAWAAN = { material: "AC7A, SS400", edisi: "1/1", sisi: 4 };
const NP_MAKER = "PT. DYNAMIC DESIGN INDONESIA";
const NP_SISI_MAKS = 8;
// Isian berat per baris (kg) & semua isian yang tersimpan
const NP_ISIAN_BERAT = ["tread", "side", "br", "box"];
const NP_ISIAN = NP_ISIAN_BERAT.concat(["tanggal"]);

/* UKURAN CETAK (mm). Satu plate = 2 kolom x 4 baris seperti lembar
   aslinya (kiri 98 | kanan 60), lalu celah 4 dan kotak Carton No. 28 --
   190 mm, selebar bidang cetak A4 bermargin 10 mm. 8 plate per halaman
   (= 2 box x 4 sisi): 8 x 30 + 7 x 4,5 = 271,5 mm. */
const NP_UKURAN = { kiri: 98, kanan: 60, celah: 4, tag: 28, baris: 7.5, jarak: 4.5, pad: 2.5, margin: 10, hurufMaks: 13, hurufMin: 8 };
const NP_PER_HALAMAN = 8;

/* ---------------- PROFIL ---------------- */

// Profil pelanggan nomor invoice ini (CIPL_PROFIL, cipl-print.js)
function npProfilBaris(row, shipment) {
  const p = (row && row.payload) || {};
  return (typeof ciplProfil === "function" && ciplProfil(p.customer || (shipment && shipment.party))) || {};
}

// Nomor invoice ini memakai name plate? (tombol di riwayat, halaman, Excel)
function npBolehDibuat(row) {
  if (!row) return false;
  const shipment = typeof ciplCariShipment === "function" ? ciplCariShipment((row.payload || {}).shipmentId) : null;
  return !!npProfilBaris(row, shipment).namePlate;
}

/* ---------------- ANGKA ---------------- */

/* Satu angka dari ketikan / tempelan Excel:
     "132.49"    titik desimal (bentuk aplikasi & Excel berbahasa Inggris)
     "132,49"    koma desimal (Excel berbahasa Indonesia) -- koma yang
                 diikuti 1-2 angka tidak mungkin pemisah ribuan
     "1,250"     koma ribuan
     "1.234,56"  bentuk Eropa lengkap */
function npAngkaPotong(tok) {
  const s = String(tok);
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) return s.replace(/\./g, "").replace(",", ".");
  if (/^\d+,\d{1,2}$/.test(s)) return s.replace(",", ".");
  return s.replace(/,/g, "");
}

/* Isian berat -> kg. "" -> null (belum diisi); yang tidak terbaca atau
   negatif -> NaN. Penjumlahan ala sel Excel boleh, dengan atau tanpa
   "=" -- dihitung pengurai bersama hitungRumus (ui/number-input.js),
   BUKAN eval(): isinya ketikan bebas. */
function npAngka(teks) {
  const s = String(teks == null ? "" : teks).trim().replace(/^=/, "").replace(/\s*kgs?\.?$/i, "").replace(/\s+/g, "");
  if (!s) return null;
  const rapi = s.replace(/\d[\d.,]*/g, npAngkaPotong);
  const v = typeof hitungRumus === "function" ? hitungRumus(rapi) : Number(rapi);
  return isFinite(v) && v >= 0 ? v : NaN;
}

// Isian yang berupa rumus (lebih dari satu angka): hasilnya ditampilkan di bawah kotaknya
const npAdaRumus = (teks) => /\d[^\d.,\s]+\d/.test(String(teks == null ? "" : teks).replace(/^\s*=/, "").replace(/\s+/g, ""));

/* ROUND(x, 0) Excel: setengah ke atas, tanpa sisa biner -- 16.73 + ...
   bisa jadi 220.49999999999997 padahal yang diketik menjumlah 220.5. */
const npBulat = (v) => Math.round(Number((Number(v) || 0).toFixed(6)));

// Angka berat di layar: dua desimal seperti tabel aslinya (424.49, 253.00)
const npAngkaTeks = (v) => (v == null || !isFinite(v) ? "" : angkaLokal(v, "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// Angka bulat berpemisah ribuan (PL & total): 4,687
const npBulatTeks = (v) => (v == null || !isFinite(v) ? "" : angkaLokal(v, "en-US", { maximumFractionDigits: 0 }));

/* Hitungan satu baris dari isiannya. Hasil: tread/side/br/box (kg atau
   null), nw & gw (null = belum ada beratnya), salah = isian yang tidak
   terbaca. Isian Tread/Side/B/R yang salah membuat N/W tidak dihitung
   -- angka setengah jadi lebih berbahaya daripada kosong. */
function npHitung(isian) {
  const x = isian || {};
  const v = { salah: [] };
  NP_ISIAN_BERAT.forEach((k) => {
    const n = npAngka(x[k]);
    if (n != null && !isFinite(n)) v.salah.push(k);
    v[k] = n != null && isFinite(n) ? n : null;
  });
  const salahBerat = v.salah.some((k) => k !== "box");
  const adaBerat = ["tread", "side", "br"].some((k) => v[k] != null);
  v.nw = adaBerat && !salahBerat ? (v.tread || 0) + (v.side || 0) + (v.br || 0) : null;
  v.gw = v.nw == null || v.salah.includes("box") ? null : v.nw + (v.box || 0);
  return v;
}

/* ---------------- BARANG ---------------- */

// Barang yang tercetak di CIPL -- saringan yang sama dengan ciplVnBaris (indeksnya sejajar)
function npBarang(shipment) {
  return ((shipment && shipment.items) || []).filter((it) => String((it && it.namaBarang) || "").trim());
}

const npQty = (it) => parseLooseNumber(it && it.qty) || 1;

/* UKURAN BAN di nama barang: 215/60R16, 195/65 R15, 225/45ZR18,
   31X10.50R15, LT265/75R16, 11R22.5, 6.50-16. */
const NP_UKURAN_BAN = /(?:^|\s)((?:LT|ST|P)?\d{2,3}(?:[.,]\d{1,2})?(?:\/\d{2,3}(?:[.,]\d{1,2})?|X\d{1,2}(?:[.,]\d{1,2})?)?\s?Z?R\s?\d{2}(?:[.,]\d)?C?|\d{1,2}[.,]\d{2}-\d{2})(?=\s|$)/i;
const npRegexAman = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/* Nama barang lama (seluruhnya di Uraian): "TYRE MOLD FULL SET HA52
   215/60R16 S03" -> Part Name | Pattern | Size | Mold No. Jenis barang
   dipisah lewat aturan CIPL yang sudah ada (ciplPecahNama: " - " atau
   CIPL_JENIS_BARANG), lalu ukuran ban menjadi patokan: sebelum ukuran =
   Pattern, sesudahnya = Mold No. Tanpa pemisah & jenis terdaftar,
   Pattern = kata tepat sebelum ukuran. Yang tidak terurai dibiarkan di
   Part Name, tidak ditebak. */
function npUraiNama(nama) {
  const s = String(nama || "").replace(/\s+/g, " ").trim();
  const kosong = { part: s, pattern: "", size: "", mold: "" };
  if (!s) return kosong;
  const pisah = typeof ciplPecahNama === "function" ? ciplPecahNama(s) : { item: s, type: "" };
  if (pisah.type) {
    const m = NP_UKURAN_BAN.exec(pisah.type);
    if (!m) return { part: pisah.item, pattern: pisah.type, size: "", mold: "" };
    return {
      part: pisah.item,
      pattern: pisah.type.slice(0, m.index).trim(),
      size: m[1].trim(),
      mold: pisah.type.slice(m.index + m[0].length).trim(),
    };
  }
  const m = NP_UKURAN_BAN.exec(s);
  if (!m) return kosong;
  const depan = s.slice(0, m.index).trim().split(" ").filter(Boolean);
  const pattern = depan.length > 1 ? depan.pop() : "";
  return { part: depan.join(" "), pattern, size: m[1].trim(), mold: s.slice(m.index + m[0].length).trim() };
}

/* IDENTITAS BARANG untuk tabel berat & name plate -- dari kolom barang
   CEISA: Uraian = Part Name, Tipe = Pattern, Ukuran = Size, Spesifikasi
   Lain = Mold No (urutan nama CIPL Kumho: Description + Pattern + Size +
   Mold No). Kolom yang kosong diisi dari Uraian (barang lama). Ukuran
   yang tertulis juga di Uraian tidak diulang di Part Name. */
function npIdentitas(it) {
  const k = (f) => (typeof rapiBagianNama === "function" ? rapiBagianNama(it && it[f]) : String((it && it[f]) || "").trim());
  const ceisa = { part: k("namaBarang"), pattern: k("tipe"), size: k("ukuran"), mold: k("spesifikasiLain") };
  const urai = npUraiNama(ceisa.part);
  const berkolom = !!(ceisa.pattern || ceisa.size || ceisa.mold);
  const hasil = {
    part: berkolom ? ceisa.part : urai.part,
    pattern: ceisa.pattern || urai.pattern,
    size: ceisa.size || urai.size,
    mold: ceisa.mold || urai.mold,
  };
  if (hasil.size && berkolom) {
    const tanpa = hasil.part.replace(new RegExp(`(^|\\s)${npRegexAman(hasil.size)}(?=\\s|$)`, "i"), " ").replace(/\s+/g, " ").trim();
    if (tanpa) hasil.part = tanpa;
  }
  return hasil;
}

/* Box per barang -- aturan "N PACKAGES" / DIMENSION Packing List
   (ciplKoliBarang, ciplVnDimensi): angka di kolom Kemasan; kosong = ikut
   box barang di atasnya (0); jadwal tanpa jumlah kemasan sama sekali =
   satu set satu box. */
function npJumlahBox(items) {
  const daftar = items || [];
  const koli = (it) => (typeof ciplKoliBarang === "function" ? Math.round(ciplKoliBarang(it)) : 0);
  const adaKoli = daftar.some((it) => koli(it) > 0);
  return daftar.map((it) => {
    const n = koli(it);
    if (n > 0) return n;
    return adaKoli ? 0 : Math.max(1, Math.round(parseLooseNumber(it && it.qty)) || 1);
  });
}

// Carton No. = Marks & No. PKGS di CI & PL (ciplVnMarks): yang diketik di barang menang
function npMarks(it, i, total) {
  return typeof ciplVnMarks === "function" ? ciplVnMarks(it, i, total) : `C# : ${total}-${i + 1}`;
}

/* ---------------- ISIAN TERSIMPAN ---------------- */

const npTeks = (v) => (v == null ? "" : String(v).trim());
const npSisi = (v) => {
  const n = Math.round(Number(v));
  return n >= 1 && n <= NP_SISI_MAKS ? n : NP_BAWAAN.sisi;
};

// Satu baris tersimpan -> isian berbentuk teks (tanggal yyyy-mm-dd yang sah saja)
function npIsianBaris(b) {
  const x = b || {};
  const hasil = {};
  NP_ISIAN_BERAT.forEach((k) => (hasil[k] = npTeks(x[k])));
  const tgl = npTeks(x.tanggal);
  hasil.tanggal = typeof tanggalIsoSah === "function" ? (tanggalIsoSah(tgl) ? tgl : "") : tgl;
  return hasil;
}
const npIsianKosong = (isian) => NP_ISIAN.every((k) => !npTeks(isian && isian[k]));

/* BARIS TERSIMPAN -> BARANG JADWAL. Disimpan per barang beserta namanya:
     1. tempat & nama sama -- keadaan biasa;
     2. nama sama di tempat lain -- urutan barang jadwal berubah;
     3. nama berubah tetapi jumlah barangnya tetap -- tempat yang sama
        (salah ketik nama yang dibetulkan).
   Barang tanpa pasangan mulai kosong; berat tidak pernah pindah ke
   barang lain hanya karena urutannya. */
function npCocokkan(simpan, items) {
  const baris = Array.isArray(simpan && simpan.baris) ? simpan.baris : [];
  const kunci = (s) => kunciAlnum(s);
  const nama = items.map((it) => kunci(itemDisplayName(it)));
  const hasil = items.map(() => null);
  const dipakai = new Set();
  const pasang = (i, j) => {
    hasil[i] = baris[j];
    dipakai.add(j);
  };
  items.forEach((_, i) => {
    if (baris[i] && kunci(baris[i].nama) === nama[i]) pasang(i, i);
  });
  items.forEach((_, i) => {
    if (hasil[i]) return;
    const j = baris.findIndex((b, k) => !dipakai.has(k) && b && kunci(b.nama) === nama[i]);
    if (j >= 0) pasang(i, j);
  });
  if (baris.length === items.length) {
    items.forEach((_, i) => {
      if (!hasil[i] && baris[i] && !dipakai.has(i)) pasang(i, i);
    });
  }
  return hasil;
}

// Ada isian name plate yang tersimpan? (lembar Excel hanya disertakan bila ada)
function npAdaIsian(simpan) {
  return !!(simpan && Array.isArray(simpan.baris) && simpan.baris.some((b) => !npIsianKosong(npIsianBaris(b))));
}

/* Ringkasan satu baris untuk pop-up Detail nomor invoice (docnum-detail.js):
   "14 barang · berat 14/14 · tanggal produksi 14/14 · 4 copy per box (56
   name plate)". Kosong bila belum pernah diisi. */
function npRingkasPayload(row) {
  const simpan = ((row && row.payload) || {}).namePlate;
  if (!npAdaIsian(simpan)) return "";
  const shipment = typeof ciplCariShipment === "function" ? ciplCariShipment((row.payload || {}).shipmentId) : null;
  const m = npModel(row, shipment);
  if (!m.baris.length) {
    const n = simpan.baris.filter((b) => !npIsianKosong(npIsianBaris(b))).length;
    return tt(`${n} baris berat tersimpan (jadwalnya belum termuat)`, `${n} weight row(s) saved (schedule not loaded)`);
  }
  const n = m.baris.length;
  return tt(
    `${n} barang · berat ${m.total.berat}/${n} · tanggal produksi ${m.total.tanggal}/${n} · ${m.sisi} copy per box (${m.total.plat} name plate)`,
    `${n} item(s) · weight ${m.total.berat}/${n} · production date ${m.total.tanggal}/${n} · ${m.sisi} copies per box (${m.total.plat} name plates)`,
  );
}

/* Bentuk tersimpan dari isian per barang (sejajar `items`). */
function npBentukSimpan(items, isian, pengaturan) {
  const o = pengaturan || {};
  return {
    baris: items.map((it, i) => Object.assign({ nama: itemDisplayName(it), marks: npMarks(it, i, items.length) }, npIsianBaris(isian[i]))),
    material: npTeks(o.material) || NP_BAWAAN.material,
    edisi: npTeks(o.edisi) || NP_BAWAAN.edisi,
    sisi: npSisi(o.sisi),
  };
}

/* ---------------- MODEL ---------------- */

/* SATU MODEL untuk halaman, PL, cetakan & Excel. `simpan` (opsional) =
   isian yang sedang diketik di halaman (bentuk npBentukSimpan); tanpa
   itu = yang tersimpan di payload. */
function npModel(row, shipment, simpan) {
  const p = (row && row.payload) || {};
  const sumber = simpan || p.namePlate || {};
  const items = npBarang(shipment);
  const tersimpan = npCocokkan(sumber, items);
  const box = npJumlahBox(items);
  const sisi = npSisi(sumber.sisi);
  const baris = items.map((it, i) => {
    const isian = npIsianBaris(tersimpan[i]);
    const hitung = npHitung(isian);
    const qty = npQty(it);
    return {
      it,
      idx: i,
      marks: npMarks(it, i, items.length),
      id: npIdentitas(it),
      qty,
      box: box[i],
      plat: box[i] * sisi,
      isian,
      hitung,
      // Berat Packing List: per set x Qty, dibulatkan -- hanya bila beratnya sudah diisi
      pl: hitung.nw == null ? null : { netto: npBulat(hitung.nw * qty), bruto: npBulat(hitung.gw * qty) },
      jadwal: { netto: parseLooseNumber(it.netto), bruto: parseLooseNumber(it.bruto) },
    };
  });
  const jumlah = (f) => baris.reduce((n, b) => n + (f(b) || 0), 0);
  return {
    row,
    shipment,
    prof: npProfilBaris(row, shipment),
    items,
    baris,
    material: npTeks(sumber.material) || NP_BAWAAN.material,
    edisi: npTeks(sumber.edisi) || NP_BAWAAN.edisi,
    sisi,
    total: {
      box: jumlah((b) => b.box),
      plat: jumlah((b) => b.plat),
      nw: jumlah((b) => b.hitung.nw),
      gw: jumlah((b) => b.hitung.gw),
      berat: baris.filter((b) => b.hitung.nw != null).length,
      tanggal: baris.filter((b) => b.isian.tanggal).length,
    },
  };
}

/* BERAT PACKING LIST per barang (sejajar ciplVnBaris), dipakai
   ciplVnTata: dari tabel berat bila barisnya sudah berisi, selain itu
   Netto/Bruto barang jadwal; dibulatkan per barang untuk profil
   `beratPlBulat`. `simpan` opsional -- isian halaman yang belum disimpan. */
function npBeratPl(row, shipment, simpan) {
  const model = npModel(row, shipment, simpan);
  const bulat = model.prof.beratPlBulat ? npBulat : (v) => v;
  return model.baris.map((b) => ({
    netto: bulat(b.pl ? b.pl.netto : b.jadwal.netto),
    bruto: bulat(b.pl ? b.pl.bruto : b.jadwal.bruto),
    dariTabel: !!b.pl,
  }));
}

/* ---------------- NAME PLATE ---------------- */

// Semua plate berurutan: tiap barang `box x sisi` copy, copy satu box berdampingan
function npPlat(model) {
  const daftar = [];
  model.baris.forEach((b) => {
    for (let k = 1; k <= b.plat; k++) daftar.push({ b, ke: k, dari: b.plat });
  });
  return daftar;
}

// "2026-11-23" -> "2026.11.23" -- bentuk tanggal name plate aslinya
const npTanggalPlat = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? String(iso).replace(/-/g, ".") : "");

/* Isi satu plate: kolom kiri & kanan, masing-masing [label, nilai].
   WEIGHT = N/W per set, dibulatkan (=ROUND(PL!U32,0) di lembar aslinya). */
function npIsiPlat(b, model) {
  const kapital = (s) => String(s == null ? "" : s).toUpperCase();
  return {
    kiri: [
      ["MODEL NAME", kapital(b.id.pattern)],
      ["PART NAME", kapital(b.id.part)],
      ["MATERIAL", kapital(model.material)],
      ["MAKER", NP_MAKER],
    ],
    kanan: [
      ["DATE(Y/M/D)", npTanggalPlat(b.isian.tanggal)],
      ["WEIGHT", b.hitung.nw == null ? "" : `${npBulat(b.hitung.nw)} (KG)`],
      ["EDITION/CAV", kapital(model.edisi)],
      ["TYPE", kapital(b.id.size)],
    ],
  };
}

/* SATU UKURAN HURUF untuk semua plate (paling besar NP_UKURAN.hurufMaks
   pt): yang terlebar -- label biasa + nilai tebal -- tetap satu baris di
   kolomnya. Diukur dengan metrik Arial cipl-tata.js, jadi cetakan &
   Excel memakai ukuran yang sama. */
function npUkuranHuruf(model) {
  const U = NP_UKURAN;
  if (typeof ttLebar !== "function") return 12;
  const lebar = ([label, nilai]) => ttLebar(`${label} : `, ttH("arial", 1)) + ttLebar(nilai, ttH("arial", 1, { b: true }));
  const ruang = (mm) => ttPt(mm - 2 * U.pad) * TT_LONGGAR;
  let s = U.hurufMaks;
  model.baris.forEach((b) => {
    const isi = npIsiPlat(b, model);
    const kiri = Math.max(...isi.kiri.map(lebar));
    const kanan = Math.max(...isi.kanan.map(lebar));
    if (kiri > 0) s = Math.min(s, ruang(U.kiri) / kiri);
    if (kanan > 0) s = Math.min(s, ruang(U.kanan) / kanan);
  });
  return Math.max(U.hurufMin, Math.floor(s * 4) / 4);
}

/* LEMBAR CETAK A4: 8 plate per halaman, berurutan per box (4 copy satu
   box berdampingan -- sesudah dipotong, satu tumpuk = satu box). Plate
   bergaris tepi untuk dipotong; kotak Carton No. di kanannya (penanda
   box & copy ke berapa, seperti kolom D lembar aslinya). */
function npDokumenHtml(model) {
  const U = NP_UKURAN;
  const plat = npPlat(model);
  const s = npUkuranHuruf(model);
  const nomor = String((model.row && model.row.doc_number) || "");
  const halaman = [];
  for (let i = 0; i < plat.length; i += NP_PER_HALAMAN) halaman.push(plat.slice(i, i + NP_PER_HALAMAN));
  const sel = ([label, nilai]) => `<td><span class="np-l">${escapeHtml(label)} : </span><b>${escapeHtml(nilai)}</b></td>`;
  const slot = (x) => {
    const isi = npIsiPlat(x.b, model);
    const baris = [0, 1, 2, 3].map((k) => `<tr>${sel(isi.kiri[k])}${sel(isi.kanan[k])}</tr>`).join("");
    return `<div class="np-slot"><table class="np-plat"><colgroup><col style="width:${U.kiri}mm"><col style="width:${U.kanan}mm"></colgroup><tbody>${baris}</tbody></table>` +
      `<div class="np-tag"><b>${escapeHtml(x.b.marks)}</b><small>${x.ke}/${x.dari}</small></div></div>`;
  };
  const isiHalaman = halaman.length
    ? halaman.map((daftar, i) => `<section class="np-hal">${daftar.map(slot).join("")}` +
        `<div class="np-kaki"><span>NAME PLATE${nomor ? " &middot; " + escapeHtml(nomor) : ""}</span><span>${i + 1} / ${halaman.length}</span></div></section>`).join("")
    : `<section class="np-hal"><p class="np-kosong">No goods to label.</p></section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(`NAME PLATE ${nomor}`.trim())}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .np-hal { position: relative; width: 210mm; height: 297mm; padding: ${U.margin}mm; overflow: hidden; break-after: page; page-break-after: always; }
  .np-hal:last-child { break-after: auto; page-break-after: auto; }
  .np-slot { display: flex; align-items: stretch; height: ${U.baris * 4}mm; margin-bottom: ${U.jarak}mm; }
  .np-plat { border-collapse: collapse; table-layout: fixed; width: ${U.kiri + U.kanan}mm; height: ${U.baris * 4}mm; }
  .np-plat td { height: ${U.baris}mm; padding: 0 ${U.pad}mm; border: 0.75pt solid #000; font-family: Arial, 'Liberation Sans', Helvetica, sans-serif; font-size: ${s}pt; white-space: nowrap; overflow: hidden; vertical-align: middle; }
  .np-plat b { font-weight: 700; }
  .np-tag { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm; width: ${U.tag}mm; margin-left: ${U.celah}mm; border: 0.75pt solid #000; font-family: Arial, 'Liberation Sans', Helvetica, sans-serif; text-align: center; }
  .np-tag b { font-size: 10pt; white-space: nowrap; }
  .np-tag small { font-size: 7pt; color: #555; }
  .np-kaki { position: absolute; left: ${U.margin}mm; right: ${U.margin}mm; bottom: 6mm; display: flex; justify-content: space-between; font-family: Arial, 'Liberation Sans', Helvetica, sans-serif; font-size: 7pt; color: #777; }
  .np-kosong { font-family: Arial, sans-serif; font-size: 11pt; color: #555; }
</style></head>
<body>${isiHalaman}</body></html>`;
}

/* Cetak lewat kotak cetak aplikasi (ui/cetak-modal.js). `model` dari
   npModel -- halaman mengirim isian yang sedang tampil, jadi yang
   dicetak = yang terlihat, sudah disimpan atau belum. */
function cetakNamePlate(model) {
  const nomor = String((model.row && model.row.doc_number) || "");
  return bukaModalCetak({
    jenis: "Name Plate",
    nomor,
    judulBerkas: `NAME PLATE ${nomor}`.trim(),
    muat: async () => npDokumenHtml(model),
  });
}

/* ---------------- LEMBAR EXCEL "NAME PLATE" ----------------

   Ikut unduhan Excel CIPL Kumho (ciplBukuKerja, cipl-excel.js) begitu
   tabel beratnya pernah diisi -- seperti lembar NAME PLATE buku kerja
   aslinya. Susunannya sama dengan cetakan: A = kolom kiri plate, B =
   kanan, C = celah, D = Carton No.; label biasa + nilai tebal dalam satu
   sel (teks kaya), 8 plate per halaman A4 (pemisah halaman sesudah
   plate ke-8, ke-16, ...). */
function npXlLembar(wb, row, shipment, mdw) {
  const simpan = ((row && row.payload) || {}).namePlate;
  if (!npProfilBaris(row, shipment).namePlate || !npAdaIsian(simpan)) return null;
  const model = npModel(row, shipment);
  const plat = npPlat(model);
  if (!plat.length) return null;
  const U = NP_UKURAN;
  const ws = wb.addWorksheet("NAME PLATE", { views: [{ showGridLines: false }] });
  [U.kiri, U.kanan, U.celah, U.tag].forEach((mm, i) => (ws.getColumn(i + 1).width = ciplXlLebar(mm, mdw)));
  const s = npUkuranHuruf(model);
  // Tinggi baris dibulatkan ke piksel (0,75 pt) KE BAWAH: 8 plate tetap muat satu halaman
  const pt = (mm) => Math.floor(ttPt(mm) / 0.75) * 0.75;
  const huruf = (ukuran, o) => Object.assign({ name: "Arial", size: ukuran, color: { argb: "FF000000" } }, o || {});
  const garis = { style: "thin", color: { argb: "FF000000" } };
  const kotak = { top: garis, bottom: garis, left: garis, right: garis };
  let r = 1;
  plat.forEach((x, i) => {
    if (i % NP_PER_HALAMAN) ws.getRow(r++).height = pt(U.jarak);
    const isi = npIsiPlat(x.b, model);
    for (let k = 0; k < 4; k++) {
      ws.getRow(r + k).height = pt(U.baris);
      [isi.kiri[k], isi.kanan[k]].forEach(([label, nilai], c) => {
        const sel = ws.getCell(r + k, c + 1);
        sel.value = { richText: [{ text: `${label} : `, font: huruf(s) }].concat(nilai ? [{ text: nilai, font: huruf(s, { bold: true }) }] : []) };
        sel.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        sel.border = kotak;
      });
    }
    ws.mergeCells(r, 4, r + 3, 4);
    const tag = ws.getCell(r, 4);
    tag.value = { richText: [{ text: x.b.marks, font: huruf(10, { bold: true }) }, { text: `\n${x.ke}/${x.dari}`, font: huruf(7, { color: { argb: "FF555555" } }) }] };
    tag.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let k = 0; k < 4; k++) {
      ws.getCell(r + k, 4).border = { left: garis, right: garis, top: k === 0 ? garis : undefined, bottom: k === 3 ? garis : undefined };
    }
    r += 4;
    if ((i + 1) % NP_PER_HALAMAN === 0 && i + 1 < plat.length) ws.getRow(r - 1).addPageBreak();
  });
  const inci = (mm) => Math.round((mm / 25.4) * 10000) / 10000;
  Object.assign(ws.pageSetup, {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: inci(U.margin), right: inci(U.margin), top: inci(U.margin), bottom: inci(U.margin), header: 0, footer: 0 },
    printArea: `A$1:D$${r - 1}`,
  });
  return ws;
}
