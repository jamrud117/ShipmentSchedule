"use strict";

/* UNDUH CIPL SEBAGAI EXCEL

   Excel CIPL disusun sebagai LEMBAR KERJA yang bersih, bukan salinan
   kisi cetakan. Datanya dari sumber yang SAMA dengan Print:
   ciplDaftarTata() -- fungsi yang sama yang dipakai cetakan -- menyimpan
   spek setiap lembar di modelnya (T.spek: CI & PL Dynamic Design dan
   Kumho; T.si: Shipping Instruction). Isi, urutan, dan angka Excel
   karena itu tidak bisa berbeda dari cetakannya; hanya bentuknya yang
   dibuat untuk lembar kerja.

   KOLOM = KOLOM TABEL BARANG. CI & PL: NO (Kumho: MARKS & NO. PKGS) |
     GOODS DESCRIPTION | QTY | UNIT | UNIT PRICE / NET WT. | AMOUNT /
     GROSS WT. -- lebarnya sebanding dengan cetakan. Kotak di atas & di
     bawah tabel menempati kolom yang sama (kiri: dua kolom pertama,
     kanan: empat sesudahnya), jadi tidak ada kolom kecil pengatur
     posisi. SI: penanda | label | : | isi.
   SATU BARANG = SATU BARIS, tanpa sel gabungan. Deskripsi dibungkus
     (wrap) di selnya sendiri; angka tetap angka dengan format yang sama
     dengan teks cetakannya ("USD 6,524.50", "840 KG"); Amount = rumus
     Qty x Unit Price; TOTAL = rumus SUM yang ikut mencakup baris yang
     disisipkan atau dihapus di antara kepala tabel dan TOTAL. Belang
     baris lewat format bersyarat, jadi tetap selang-seling sesudah baris
     ditambah atau dihapus.
   SEL GABUNGAN hanya untuk teks yang melintasi beberapa kolom (judul,
     kotak pihak, label & isi rincian, TOTAL, tanda tangan). Jumlahnya
     tetap -- tidak bertambah dengan banyaknya barang.
   TANGGAL = sel tanggal sungguhan, format Inggris "d mmm yyyy" apa pun
     bahasa Excel-nya.
   TINGGI BARIS dihitung dari panjang teks (metrik huruf cipl-tata.js),
     jadi tidak ada teks yang terpotong saat berkas dibuka.
   TAHAN AUTOFIT. AutoFit Excel mengabaikan sel gabungan. Pengancar di
     LUAR area cetak (spasi tak-putus berwarna putih, tidak tercetak)
     menjaga hasilnya: satu kolom sesudah dokumen membuat AutoFit Row
     Height mengembalikan tinggi rancangan baris kotak, satu baris sesudah
     dokumen membuat AutoFit Column Width tidak menyempitkan kolom di
     bawah lebar rancangannya. Baris barang tanpa pengancar -- AutoFit
     menyesuaikan tingginya dengan deskripsi.
   SEMUA BARIS BARANG SAMA TINGGI seperti cetakannya (setinggi deskripsi
     yang paling banyak baris).
   CETAK: A4 tegak, area cetak = dokumen saja, lebar 1 halaman, rata
     tengah. Tinggi: satu halaman bila muat (atau hanya sedikit lebih --
     skala >= 80%, seperti cetakannya); daftar panjang mengalir ke halaman
     berikutnya dengan kepala tabel barang diulang, Packing details &
     tanda tangan tidak terbelah.
*/

/* Satu unduhan pada satu waktu.

   Menyusun lembar butuh waktu; klik kedua sebelum yang pertama selesai
   menjalankan dua penyusunan sekaligus, dan keduanya memicu unduhan --
   pengguna mendapat dua berkas identik dan tidak tahu mana yang benar. */
let ciplXlsSedangDibuat = false;

function ciplNamaBerkas(nomor) {
  return String(nomor || "CIPL").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "CIPL";
}

/* ---------------- UKURAN & GAYA ---------------- */

const CIPL_XL_TEPI = 1.5; // pt, jarak teks ke tepi sel Excel (~2 px)
// Satu tingkat indent Excel = 3 spasi huruf Normal (Arial 11, ttExcelHurufNormal)
const CIPL_XL_INDENT_PT = 3 * (569 / 2048) * 11;
// Bagian lebar sel yang dipakai saat menghitung bungkus: Excel di layar ~2% lebih sempit, sisanya cadangan
const CIPL_XL_LONGGAR = 0.94;
// Tinggi satu baris teks Excel = ukuran huruf x 1,2 (Arial/Times ~1,15 + pembulatan piksel)
const CIPL_XL_JARAK = 1.2;
// "3 Oct 2026" -- [$-409] = nama bulan Inggris di Excel berbahasa apa pun
const CIPL_XL_TANGGAL = "[$-409]d mmm yyyy";
/* Margin cetak (mm). Kiri-kanan 10 mm + rata tengah: dokumen 170-177 mm
   jatuh di tengah kertas seperti cetakannya (tepi isi ~16,5 mm). */
const CIPL_XL_MARGIN = { kiri: 10, kanan: 10, atas: 15, bawah: 12, kepala: 5, kaki: 5 };
// Tinggi satu baris paling banyak (pt) -- Excel membatasinya 409 pt; kotak yang lebih tinggi dipecah beberapa baris
const CIPL_XL_TINGGI_MAKS = 400;

const ciplXlLebar = (mm, mdw) => Math.round((ttPt(mm) / mdw) * 1000) / 1000;
// Tinggi baris dibulatkan KE ATAS ke piksel (0,75 pt) -- Excel menggambar baris dalam piksel bulat
const ciplXlTinggi = (pt) => Math.ceil(pt / 0.75 - 1e-6) * 0.75;
// Tinggi isi sel untuk baris-baris teks berukuran `ukuran` (pt), + ~2 pt jarak dalam sel
const ciplXlTinggiTeks = (ukuran) => ukuran.reduce((n, s) => n + s * CIPL_XL_JARAK, 0) + 2;

function ciplXlHuruf(f, s, o) {
  const x = o || {};
  const h = { name: f === "times" ? "Times New Roman" : "Arial", size: Math.round(s * 100) / 100, color: { argb: ttArgb(x.c || "#222222") } };
  if (x.b) h.bold = true;
  if (x.i) h.italic = true;
  if (x.u) h.underline = "single";
  return h;
}
const ciplXlLatar = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: ttArgb(hex) } });

/* "2026-09-29" -> NOMOR SERI tanggal Excel (hari sejak 30-12-1899) --
   bentuk yang disimpan Excel sendiri untuk sel tanggal; tampilannya dari
   format sel (CIPL_XL_TANGGAL). Ditulis sebagai angka, bukan objek Date:
   tidak bergeser zona waktu, dan tidak bergantung pada asal objeknya. */
function ciplXlTanggal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isFinite(ms) ? ms / 86400000 + 25569 : null;
}

/* Sel (gabungan bila rentangnya lebih dari satu sel). Digabung DULU,
   baru diberi gaya: ExcelJS menyalin gaya sel induk ke seluruh rentang
   saat menggabung. gaya: { font, numFmt, ha, va, wrap, indent, fill }. */
function ciplXlSel(ws, r1, c1, r2, c2, nilai, gaya) {
  const g = gaya || {};
  if (r2 > r1 || c2 > c1) ws.mergeCells(r1, c1, r2, c2);
  const sel = ws.getCell(r1, c1);
  if (nilai != null && nilai !== "") sel.value = nilai;
  if (g.font) sel.font = g.font;
  if (g.numFmt) sel.numFmt = g.numFmt;
  const rata = { horizontal: g.ha || "left", vertical: g.va || "top" };
  if (g.wrap) rata.wrapText = true;
  if (g.indent) rata.indent = g.indent;
  sel.alignment = rata;
  if (g.fill) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).fill = ciplXlLatar(g.fill);
  }
  return sel;
}

/* Garis di sisi rentang -- dipasang di SETIAP sel tepinya (sel gabungan
   juga), jadi garisnya utuh walau gabungannya kelak dilepas.
   sisi: "atas" | "bawah" | "kiri" | "kanan" (boleh beberapa).
   spek: { gaya: "thin" | "medium", warna }. */
function ciplXlGaris(ws, r1, c1, r2, c2, sisi, spek) {
  const s = spek || {};
  const g = { style: s.gaya || "thin", color: { argb: ttArgb(s.warna || "#222222") } };
  const pasang = (r, c, k) => {
    const sel = ws.getCell(r, c);
    sel.border = Object.assign({}, sel.border, { [k]: g });
  };
  const ada = (k) => (" " + sisi + " ").includes(" " + k + " ");
  if (ada("atas")) for (let c = c1; c <= c2; c++) pasang(r1, c, "top");
  if (ada("bawah")) for (let c = c1; c <= c2; c++) pasang(r2, c, "bottom");
  if (ada("kiri")) for (let r = r1; r <= r2; r++) pasang(r, c1, "left");
  if (ada("kanan")) for (let r = r1; r <= r2; r++) pasang(r, c2, "right");
}

/* Teks kaya (beberapa gaya dalam satu sel), baris dipisah "\n".
   bagian: [[teks, font] ...] -> nilai sel. */
function ciplXlTeksKaya(bagian) {
  const isi = bagian.filter(([tx]) => String(tx == null ? "" : tx) !== "");
  if (!isi.length) return "";
  return { richText: isi.map(([tx, font], i) => ({ text: (i ? "\n" : "") + tx, font })) };
}

/* Penyusun baris: mencatat tinggi rancangan tiap baris dan baris mana
   yang dijaga pengancar AutoFit (semua kecuali baris barang). */
function ciplXlPenyusun() {
  const tinggi = [null]; // indeks = nomor baris Excel
  const jaga = new Set();
  const P = {
    tinggi,
    jaga,
    baris(pt, bebas) {
      const r = tinggi.length;
      tinggi.push(pt);
      if (!bebas) jaga.add(r);
      return r;
    },
    // Blok setinggi `pt` untuk satu sel (digabung tegak bila lebih dari CIPL_XL_TINGGI_MAKS) -> [baris awal, baris akhir]
    blok(pt) {
      const n = Math.max(1, Math.ceil(pt / CIPL_XL_TINGGI_MAKS));
      const awal = P.baris(pt / n);
      for (let i = 1; i < n; i++) P.baris(pt / n);
      return [awal, awal + n - 1];
    },
    /* Tambah tinggi baris TERAKHIR `r`; kelebihan di atas batas Excel
       menjadi baris baru di bawahnya. Mengembalikan baris terakhir. */
    tambah(r, pt) {
      let akhir = r;
      const muat = Math.min(Math.max(0, CIPL_XL_TINGGI_MAKS - tinggi[r]), pt);
      tinggi[r] += muat;
      for (let sisa = pt - muat; sisa > 1e-6; sisa -= CIPL_XL_TINGGI_MAKS) {
        akhir = P.baris(Math.min(CIPL_XL_TINGGI_MAKS, sisa), !jaga.has(r));
      }
      return akhir;
    },
    get akhir() { return tinggi.length - 1; },
  };
  return P;
}

/* SATU HALAMAN BILA WAJAR. Cetakan CIPL selalu satu halaman A4. Lembar
   Excel yang muat satu halaman dicetak apa adanya; yang hanya SEDIKIT
   lebih tinggi (muat satu halaman dengan skala >= 80%, mis. beberapa nama
   barang turun baris) dicetak satu halaman tinggi seperti cetakannya
   (fitToHeight 1); yang lebih panjang mengalir ke halaman berikutnya
   (tinggi otomatis, kepala tabel diulang) -- huruf tidak dikecilkan
   berlebihan. "Muat" diberi cadangan 3% untuk pembulatan aplikasi. */
const CIPL_XL_SKALA_MIN = 0.8;
function ciplXlUkuranHalaman(P) {
  const M = CIPL_XL_MARGIN;
  const halaman = ttPt(297 - M.atas - M.bawah);
  let tinggi = 0;
  for (let r = 1; r <= P.akhir; r++) tinggi += ciplXlTinggi(P.tinggi[r]);
  if (tinggi <= halaman * 0.97) return "muat";
  return tinggi * CIPL_XL_SKALA_MIN <= halaman ? "rapat" : "panjang";
}

/* Tinggi baris, pengancar AutoFit, dan pengaturan cetak -- penutup
   setiap lembar.

   PENGANCAR (di luar area cetak, putih):
     kolom nK+1 -- tiap baris yang dijaga diberi satu spasi tak-putus
       berhuruf setinggi barisnya: AutoFit Row Height kembali ke tinggi
       rancangan (kotak bergabung tidak terpotong / menyusut).
     baris akhir+1 -- tiap kolom diberi spasi tak-putus Arial 13,5 pt
       (5 px per spasi) selebar kolomnya: AutoFit Column Width tidak
       menyempitkan kolom di bawah lebar rancangan (teks kotak gabungan
       tetap muat), tapi tetap melebar bila isinya lebih panjang. */
function ciplXlTutup(ws, P, nK, opsi) {
  const o = opsi || {};
  for (let r = 1; r <= P.akhir; r++) ws.getRow(r).height = ciplXlTinggi(P.tinggi[r]);
  const putih = { argb: "FFFFFFFF" };
  ws.getColumn(nK + 1).width = 1.5;
  P.jaga.forEach((r) => {
    const sel = ws.getCell(r, nK + 1);
    sel.value = TT_NBSP;
    sel.font = { name: "Arial", size: ttXlHurufPengancarBaris(ciplXlTinggi(P.tinggi[r])), color: putih };
  });
  for (let c = 1; c <= nK; c++) {
    const n = Math.max(0, Math.round((ws.getColumn(c).width * 8 - 5) / 5)); // lebar kolom (px) dalam spasi 5 px
    if (!n) continue;
    const sel = ws.getCell(P.akhir + 1, c);
    sel.value = TT_NBSP.repeat(n);
    sel.font = { name: "Arial", size: 13.5, color: putih };
  }
  ws.getRow(P.akhir + 1).height = 3;

  const inci = (mm) => Math.round((mm / 25.4) * 10000) / 10000;
  const M = CIPL_XL_MARGIN;
  Object.assign(ws.pageSetup, {
    paperSize: 9, // A4
    orientation: "portrait",
    // 1 halaman lebar; tinggi mengikuti isi -- kecuali sedikit lebih dari satu halaman: 1 halaman (ciplXlUkuranHalaman)
    fitToPage: true, fitToWidth: 1, fitToHeight: ciplXlUkuranHalaman(P) === "rapat" ? 1 : 0,
    horizontalCentered: true, verticalCentered: false,
    margins: { left: inci(M.kiri), right: inci(M.kanan), top: inci(M.atas), bottom: inci(M.bawah), header: inci(M.kepala), footer: inci(M.kaki) },
    // "A$1" -> ExcelJS menulis "$A$1": area cetak mutlak, tanpa pengancar
    printArea: `A$1:${ttKolomHuruf(nK)}$${P.akhir}`,
  });
  if (o.kepalaTabel) ws.pageSetup.printTitlesRow = `${o.kepalaTabel}:${o.kepalaTabel}`;
}

/* BAGIAN AKHIR TIDAK TERBELAH HALAMAN. Daftar barang yang panjang
   mengalir ke halaman berikutnya (kepala tabelnya diulang); kotak Packing
   details & tanda tangan sebaiknya tidak terpotong di tengah -- kepala
   kotak di satu halaman, isinya di halaman lain. Dari tinggi baris yang
   sudah pasti, halaman A4 disimulasikan (skala 100%: lebar dokumen muat);
   kalau bagian sesudah TOTAL akan terbelah, ia dipindah UTUH ke halaman
   berikutnya lewat pemisah halaman sesudah baris TOTAL (Excel menurutinya
   pada "1 halaman lebar, tinggi otomatis"). Isi satu halaman tidak muat
   persis sama di tiap aplikasi (pembulatan baris, printer), jadi halaman
   disimulasikan 1,5% lebih pendek, pas, dan 1,5% lebih panjang: terbelah
   di salah satunya = diberi pemisah. Lembar yang dicetak satu halaman
   (ciplXlUkuranHalaman "muat" / "rapat") tidak diberi pemisah. */
function ciplXlJagaBagianAkhir(ws, P, rKepala, rTotal) {
  if (ciplXlUkuranHalaman(P) !== "panjang") return;
  const M = CIPL_XL_MARGIN;
  const tinggi = (r) => ciplXlTinggi(P.tinggi[r]);
  const terbelah = (muat) => {
    const halaman = [];
    let ke = 0;
    let y = 0;
    for (let r = 1; r <= P.akhir; r++) {
      if (y > 0 && y + tinggi(r) > muat) {
        ke++;
        y = r > rKepala ? tinggi(rKepala) : 0; // kepala tabel diulang di halaman baru
      }
      y += tinggi(r);
      halaman[r] = ke;
    }
    return halaman[rTotal + 1] !== halaman[P.akhir];
  };
  const halamanPt = ttPt(297 - M.atas - M.bawah);
  if ([0.985, 1, 1.015].some((k) => terbelah(halamanPt * k))) ws.getRow(rTotal).addPageBreak();
}

/* ---------------- LEMBAR CI / PL (Dynamic Design & Kumho) ----------------

   Dari spek ciplTataFormal (cipl-print.js), urutan cetakannya:
     judul (garis hitam 2 px di bawahnya)
     pita kartu: kepala navy, isi pihak / Document reference
     rincian pengiriman -- 8 kotak label & isi, di sini 4 baris x 2 kotak
       (kiri | kanan) mengikuti kolom kartu di atasnya; urutan baca sama
     tabel barang, TOTAL
     kiri bawah: Packing details / Other references / Shipping marks;
     kanan bawah: tanda tangan 50 mm (muat stempel)
*/
function ciplXlFormal(wb, spek, mdw) {
  const W = DD_WARNA;
  const ws = wb.addWorksheet(spek.nama, { views: [{ showGridLines: false }] });
  const tb = spek.tabel;

  // KOLOM: satu kolom Excel per kolom tabel barang, lebar dari kisi persen cetakannya
  const kolomMm = tb.kolom.map(([k1, k2]) => {
    let persen = 0;
    for (let k = k1; k <= Math.floor(k2); k++) persen += spek.persen[k];
    return (DD_ISI_MM * persen) / 100;
  });
  const nK = kolomMm.length;
  kolomMm.forEach((mm, i) => (ws.getColumn(i + 1).width = ciplXlLebar(mm, mdw)));
  // Kotak kiri = kolom yang seluruhnya di kisi 0..3 (kartu kiri cetakan), kotak kanan = sisanya
  const nKiri = tb.kolom.filter(([, k2]) => k2 < 4).length;
  const KI = [1, nKiri];
  const KA = [nKiri + 1, nK];
  // Rentang kisi spek ([k1, k2]) -> kolom Excel pertama & terakhir di dalamnya
  const kolomRentang = ([k1, k2]) => {
    const di = tb.kolom.map(([a, b], i) => (a >= k1 && b <= k2 ? i + 1 : 0)).filter(Boolean);
    return [di[0], di[di.length - 1]];
  };
  const huruf = (c) => ttKolomHuruf(c);
  const lebarPt = (c1, c2) => kolomMm.slice(c1 - 1, c2).reduce((n, mm) => n + ttPt(mm), 0);
  const ruang = (c1, c2, indent) => (lebarPt(c1, c2) - 2 * CIPL_XL_TEPI - (indent || 0) * CIPL_XL_INDENT_PT) * CIPL_XL_LONGGAR;
  const A = (s, o) => ciplXlHuruf("arial", s, Object.assign({ c: W.teks }, o || {}));
  const ukur = (s, o) => ttH("arial", s, o);
  const P = ciplXlPenyusun();

  // JUDUL -- garis hitam 2 px di bawahnya
  const rJudul = P.baris(Math.max(22 + ttPx(6), ciplXlTinggiTeks([20]) + 3));
  ciplXlSel(ws, rJudul, 1, rJudul, nK, spek.judul, { font: A(20, { b: true }), ha: "center", va: "middle" });
  ciplXlGaris(ws, rJudul, 1, rJudul, nK, "bawah", { gaya: "medium", warna: W.bingkai });
  P.baris(ttPx(10) + ttPx(2));

  /* KOTAK PIHAK: nama tebal 9 pt (boleh turun baris) + alamat -- satu
     ukuran huruf sekotak, dikecilkan seperlunya (min. CIPL_UKURAN_MIN_PT)
     supaya tiap baris alamat tetap satu baris, sama dengan cetakan
     (ddIsiPihak). Satu sel, baris dipisah "\n". */
  const isiPihak = (kotak, [c1, c2]) => {
    const lebar = ruang(c1, c2, 1);
    const [nama, ...alamat] = kotak.teks || [];
    const barisNama = nama ? ttBungkus(nama, ukur(9, { b: true }), lebar) : [];
    const pas = alamat.length && kotak.alamatSatuBaris ? ttUkuranPas(alamat, ukur(8.5), lebar, CIPL_UKURAN_MIN_PT) : null;
    const s = pas || 8.5;
    const barisAlamat = pas ? alamat : alamat.flatMap((tx) => ttBungkus(tx, ukur(8.5), lebar));
    return {
      nilai: ciplXlTeksKaya([[nama, A(9, { b: true })]].concat(alamat.map((tx) => [tx, A(s)]))),
      tinggi: ciplXlTinggiTeks(barisNama.map(() => 9).concat(barisAlamat.map(() => s))),
    };
  };
  const kepalaKotak = (r, [c1, c2], judul, tengah) => ciplXlSel(ws, r, c1, r, c2, String(judul).toUpperCase(),
    { font: A(7, { b: true, c: W.putih }), fill: W.navy, va: "middle", ha: tengah ? "center" : "left", indent: tengah ? 0 : 1 });

  /* DOCUMENT REFERENCE: label abu-abu kecil di barisnya sendiri, lalu
     satu baris per nomor -- nomor (dikecilkan seperlunya supaya satu
     baris, seperti cetakan) dan tanggalnya sebagai SEL TANGGAL rata kanan
     di kolom terakhir. HS Code angka murni = sel angka. Mengembalikan
     nomor baris pertama & terakhir. */
  const isiReferensi = (ref, [c1, c2]) => {
    let awal = null;
    let akhir = null;
    ref.forEach(([label, isi], k) => {
      const teksLabel = String(label).toUpperCase();
      const barisLabel = ttBungkus(teksLabel, ukur(6.8, { b: true }), ruang(c1, c2, 1));
      const rL = P.baris((k ? ttPx(11) : 0) + ciplXlTinggiTeks(barisLabel.map(() => 6.8)));
      if (awal == null) awal = rL;
      ciplXlSel(ws, rL, c1, rL, c2, teksLabel, { font: A(6.8, { b: true, c: W.abu }), va: "bottom", indent: 1, wrap: true });
      isi.forEach((x) => {
        const tanggal = ciplXlTanggal(x.iso);
        const adaTgl = !!(tanggal || x.tgl);
        const cNo = adaTgl ? c2 - 1 : c2;
        const lebarNo = ruang(c1, cNo, 1);
        const no = String(x.no == null ? "" : x.no);
        const s = x.satuBaris ? ttUkuranPas([no], ukur(8.8, { b: true }), lebarNo, CIPL_UKURAN_MIN_PT) : null;
        const nBaris = s ? 1 : ttBungkus(no, ukur(8.8, { b: true }), lebarNo).length;
        const rV = P.baris(ciplXlTinggiTeks(new Array(nBaris).fill(s || 8.8)));
        if (x.nilaiExcel) {
          ciplXlSel(ws, rV, c1, rV, cNo, x.nilaiExcel.v, { numFmt: x.nilaiExcel.fmt, font: A(8.8, { b: true }), indent: 1 });
        } else {
          ciplXlSel(ws, rV, c1, rV, cNo, no, { font: A(s || 8.8, { b: true }), indent: 1, wrap: !s });
        }
        if (adaTgl) {
          ciplXlSel(ws, rV, c2, rV, c2, tanggal || x.tgl, { numFmt: tanggal ? CIPL_XL_TANGGAL : null, font: A(8.8, { b: true }), ha: "right", indent: 1 });
        }
        akhir = rV;
      });
    });
    return { awal, akhir };
  };

  // PITA KARTU: kepala navy + jarak dalam + isi; kotak bergaris navy
  spek.kartu.forEach((pita, i) => {
    if (i) P.baris(ttPx(8));
    const rK = P.baris(7 * 1.15 + ttPx(9));
    kepalaKotak(rK, KI, pita.kiri.judul);
    kepalaKotak(rK, KA, pita.kanan.judul);
    P.baris(ttPx(6));
    const sisi = [[pita.kiri, KI], [pita.kanan, KA]];
    const ref = sisi.find(([k]) => k.ref);
    let rAwal;
    let rAkhir;
    const bawah = ttPx(7) + ttPx(1); // jarak dalam bawah
    if (ref) {
      // Butir referensi berbaris sendiri-sendiri; kotak pihak di sebelahnya digabung setinggi semuanya
      const { awal, akhir } = isiReferensi(ref[0].ref, ref[1]);
      const pihak = sisi.filter(([k]) => !k.ref).map(([k, cols]) => [isiPihak(k, cols), cols]);
      let ada = 0;
      for (let r = awal; r <= akhir; r++) ada += P.tinggi[r];
      const kurang = Math.max(0, ...pihak.map(([isi]) => isi.tinggi - ada));
      rAwal = awal;
      rAkhir = P.tambah(akhir, kurang + bawah);
      pihak.forEach(([isi, cols]) => ciplXlSel(ws, rAwal, cols[0], rAkhir, cols[1], isi.nilai, { indent: 1, wrap: true }));
    } else {
      const isi = sisi.map(([k, cols]) => isiPihak(k, cols));
      [rAwal, rAkhir] = P.blok(Math.max(...isi.map((x) => x.tinggi)) + bawah);
      sisi.forEach(([, cols], j) => ciplXlSel(ws, rAwal, cols[0], rAkhir, cols[1], isi[j].nilai, { indent: 1, wrap: true }));
    }
    ciplXlGaris(ws, rK, KI[0], rAkhir, KI[1], "atas bawah kiri kanan", { warna: W.navy });
    ciplXlGaris(ws, rK, KA[0], rAkhir, KA[1], "atas bawah kiri kanan", { warna: W.navy });
  });
  P.baris(ttPx(8));

  /* RINCIAN PENGIRIMAN: tiap kotak = label (baris sendiri) + isi (baris
     sendiri, sel tanggal untuk tanggal berlayar) -- isinya bisa diubah
     tanpa menyentuh labelnya. 4 baris x 2 kotak; urutan baca = cetakan. */
  const satuBaris = spek.rinciSatuBaris || CIPL_RINCI_SATU_BARIS;
  const rRinciAwal = P.akhir + 1;
  for (let p = 0; p < spek.rinci.length; p += 2) {
    const kotak = [[spek.rinci[p], KI], [spek.rinci[p + 1], KA]].filter(([x]) => x);
    const rL = P.baris(ttPx(5) + ciplXlTinggiTeks([6.8]));
    const isi = kotak.map(([[label, nilai, meta], cols]) => {
      const lebar = ruang(cols[0], cols[1], 1);
      const tanggal = ciplXlTanggal(meta && meta.iso);
      const teks = String(nilai || "").trim() || "—";
      const s = satuBaris.includes(label) ? ttUkuranPas([teks], ukur(9, { b: true }), lebar, CIPL_UKURAN_MIN_PT) : null;
      const n = tanggal || s ? 1 : ttBungkus(teks, ukur(9, { b: true }), lebar).length;
      return { label, teks, tanggal, s: s || 9, wrap: !tanggal && !s, tinggi: ciplXlTinggiTeks(new Array(n).fill(s || 9)) };
    });
    const rV = P.baris(Math.max(...isi.map((x) => x.tinggi)) + ttPx(5) + ttPx(1));
    kotak.forEach(([, cols], j) => {
      const x = isi[j];
      ciplXlSel(ws, rL, cols[0], rL, cols[1], String(x.label).toUpperCase(), { font: A(6.8, { b: true, c: W.abu }), va: "bottom", indent: 1 });
      ciplXlSel(ws, rV, cols[0], rV, cols[1], x.tanggal || x.teks,
        { numFmt: x.tanggal ? CIPL_XL_TANGGAL : null, font: A(x.s, { b: true }), indent: 1, wrap: x.wrap });
    });
    if (p) ciplXlGaris(ws, rL, 1, rL, nK, "atas", { warna: W.garisRinciDalam });
  }
  ciplXlGaris(ws, rRinciAwal, KI[1], P.akhir, KI[1], "kanan", { warna: W.garisRinciDalam });
  ciplXlGaris(ws, rRinciAwal, 1, P.akhir, nK, "atas bawah kiri kanan", { warna: W.garisRinci });
  P.baris(ttPx(10));

  // KEPALA TABEL BARANG: navy, judul + sub-judul ("Description info : PTN, SIZE, MOLD NO")
  const kepala = tb.kepala.map(([judul, sub], k) => {
    const lebar = ruang(k + 1, k + 1, 0);
    const jd = String(judul).toUpperCase();
    const n = ttBungkus(jd, ukur(7, { b: true }), lebar).map(() => 7)
      .concat(sub ? ttBungkus(sub, ukur(6), lebar).map(() => 6) : []);
    return { nilai: sub ? ciplXlTeksKaya([[jd, A(7, { b: true, c: W.putih })], [sub, A(6, { c: "#c9d0e0" })]]) : jd, tinggi: ciplXlTinggiTeks(n) };
  });
  const rKepala = P.baris(Math.max(...kepala.map((x) => x.tinggi)) + ttPx(12));
  kepala.forEach((x, k) => ciplXlSel(ws, rKepala, k + 1, rKepala, k + 1, x.nilai,
    { font: A(7, { b: true, c: W.putih }), fill: W.navy, ha: "center", va: "middle", wrap: true }));

  /* BARANG: satu baris per barang, tanpa sel gabungan. Teks dibungkus di
     selnya, angka = sel angka berformat (huruf dikecilkan seperti cetakan
     bila angkanya tak muat), Amount = rumus. Baris barang tidak dijaga
     pengancar: AutoFit Row Height menyesuaikan tingginya dengan isi.
     SEMUA BARIS BARANG SAMA TINGGI seperti cetakannya -- setinggi barang
     yang deskripsinya paling banyak baris (dibungkus selebar kolom Excel),
     teks yang lebih pendek di tengah barisnya. */
  const padIsi = tb.padBaris == null ? ttPx(8) : tb.padBaris;
  // GOODS DESCRIPTION (tb.rataKiri) rata kiri berjarak satu indent, seperti cetakannya
  const rataKiri = new Set(tb.rataKiri || []);
  const indentBarang = (k) => (rataKiri.has(k) ? 1 : 0);
  const nBarisBarang = Math.max(1, ...tb.baris.map((sel) => Math.max(1, ...sel.map((x, k) => (x && x.teks && !x.nilaiExcel
    ? x.teks.flatMap((tx) => ttBungkus(tx, ukur(8.5), ruang(k + 1, k + 1, indentBarang(k)))).length : 1)))));
  const tinggiBarang = ciplXlTinggiTeks(new Array(nBarisBarang).fill(8.5)) + padIsi + ttPx(1);
  const rBarangAwal = P.akhir + 1;
  tb.baris.forEach((sel) => {
    const r = P.baris(tinggiBarang, true);
    sel.forEach((x, k) => {
      const c = k + 1;
      if (x && x.angka) {
        const s = ttUkuranPas([x.angka.teks], ukur(8.5), ruang(c, c, 0), 5) || 8.5;
        const kali = tb.kali && tb.kali[k];
        const nilai = kali ? { formula: `${huruf(kali[0] + 1)}${r}*${huruf(kali[1] + 1)}${r}`, result: x.angka.v } : x.angka.v;
        ciplXlSel(ws, r, c, r, c, nilai, { numFmt: x.angka.fmt, font: A(s), ha: "center", va: "middle" });
      } else if (x && x.nilaiExcel) {
        ciplXlSel(ws, r, c, r, c, x.nilaiExcel.v, { numFmt: x.nilaiExcel.fmt, font: A(8.5), ha: "center", va: "middle" });
      } else {
        ciplXlSel(ws, r, c, r, c, x && x.teks ? x.teks.join("\n") : "",
          { font: A(8.5), ha: rataKiri.has(k) ? "left" : "center", indent: indentBarang(k), va: "middle", wrap: true });
      }
    });
    ciplXlGaris(ws, r, 1, r, nK, "bawah", { warna: W.garisBarang });
  });
  const rBarangAkhir = P.akhir;
  if (rBarangAkhir > rBarangAwal) {
    // Belang lewat format bersyarat, dihitung dari kepala tabel: tetap selang-seling sesudah baris disisipkan / dihapus
    ws.addConditionalFormatting({
      ref: `A${rBarangAwal}:${huruf(nK)}${rBarangAkhir}`,
      rules: [{ type: "expression", priority: 1, formulae: [`MOD(ROW()-ROW($A$${rKepala}),2)=0`],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: ttArgb(W.zebra) } } } }],
    });
  }

  /* TOTAL: satu baris tepat di bawah barang. Angkanya rumus SUM dari
     kepala tabel sampai baris tepat di atas TOTAL -- baris yang disisipkan
     di mana pun di antaranya ikut terjumlah (teks kepala diabaikan SUM). */
  const rTotal = P.baris(9 * 1.15 + ttPx(12) + ttPx(2));
  tb.total.forEach((x) => {
    const [c1, c2] = x.rentang ? kolomRentang(x.rentang) : [x.kolom + 1, x.kolom + 1];
    if (x.angka) {
      const kol = huruf(c1);
      const s = ttUkuranPas([x.angka.teks], ukur(9, { b: true }), ruang(c1, c2, 0), 5) || 9;
      ciplXlSel(ws, rTotal, c1, rTotal, c2, { formula: `SUM(${kol}${rKepala}:INDEX(${kol}:${kol},ROW()-1))`, result: x.angka.v },
        { numFmt: x.angka.fmt, font: A(s, { b: true }), ha: "center", va: "middle", fill: W.total });
    } else {
      ciplXlSel(ws, rTotal, c1, rTotal, c2, x.teks || "", x.kiri
        ? { font: A(9, { b: true }), ha: "left", va: "middle", indent: 1, fill: W.total }
        : { font: A(9, { b: true }), ha: "center", va: "middle", fill: W.total });
    }
  });
  ciplXlGaris(ws, rTotal, 1, rTotal, nK, "atas bawah", { gaya: "medium", warna: W.navy });
  P.baris(ttPt(6));

  /* BAGIAN AKHIR: kotak kiri bertumpuk (Packing details, Other references,
     Shipping marks) & tanda tangan 50 mm di kanan -- nama penanda tangan
     di atas, ruang stempel, garis + "Authorized Signature". */
  const rAkhirAtas = P.akhir + 1;
  (spek.kiriBawah || []).forEach((k, j) => {
    if (j) P.baris(ttPx(8));
    const rKK = P.baris(7 * 1.15 + ttPx(9));
    kepalaKotak(rKK, KI, k.judul, true);
    P.baris(ttPx(6));
    const daftar = k.baris.length ? k.baris : [["—", false]];
    const lebar = ruang(KI[0], KI[1], 1);
    const n = daftar.flatMap(([tx, tebal]) => ttBungkus(tx, ukur(8.5, { b: tebal }), lebar).map(() => 8.5));
    const [rKB1, rKB2] = P.blok(ciplXlTinggiTeks(n) + ttPx(7) + ttPx(1));
    ciplXlSel(ws, rKB1, KI[0], rKB2, KI[1], ciplXlTeksKaya(daftar.map(([tx, tebal]) => [tx, A(8.5, { b: tebal })])), { indent: 1, wrap: true });
    ciplXlGaris(ws, rKK, KI[0], rKB2, KI[1], "atas bawah kiri kanan", { warna: W.navy });
  });
  const atas = (spek.ttd.atas || []).map((tx, i) => [tx, i ? A(8.5, { b: true }) : A(8)]);
  const tinggiTtd = ttPx(3) + ciplXlTinggiTeks([8]);
  const ruangTtd = ttPt(CIPL_TTD_MM) - tinggiTtd;
  let sudah = 0;
  for (let r = rAkhirAtas; r <= P.akhir; r++) sudah += P.tinggi[r];
  if (sudah < ruangTtd) P.baris(ruangTtd - sudah); // ruang stempel di bawah nama penanda tangan
  ciplXlSel(ws, rAkhirAtas, KA[0], P.akhir, KA[1], ciplXlTeksKaya(atas), { ha: "center", wrap: true });
  const rTtd = P.baris(tinggiTtd);
  ciplXlSel(ws, rTtd, KA[0], rTtd, KA[1], "Authorized Signature", { font: A(8), ha: "center", va: "bottom" });
  ciplXlGaris(ws, rTtd, KA[0], rTtd, KA[1], "atas", { warna: W.teks });

  ciplXlJagaBagianAkhir(ws, P, rKepala, rTotal);
  ciplXlTutup(ws, P, nK, { kepalaTabel: rKepala });
  return ws;
}

/* ---------------- LEMBAR SHIPPING INSTRUCTION ----------------

   Surat berkop (Times New Roman), dari data yang sama dengan cetakannya
   (ciplSiData, CIPL_SI_BARIS, ciplSiNilai -- cipl-print.js). Kolom
   mengikuti cetakan: penanda | label | : | isi. Tiap butir instruksi satu
   baris tanpa sel gabungan; isi panjang (alamat) dibungkus di selnya.
   Berat, jumlah koli & HS Code = sel angka berformat. Jarak antarbagian
   menyatu dengan tinggi baris berikutnya (teks rata bawah), bukan baris
   kosong. */
function ciplXlSi(wb, d, mdw) {
  const ws = wb.addWorksheet("SI", { views: [{ showGridLines: false }] });
  const px = (n) => ttMm(ttPx(n));
  // Bidang teks cetakan = bingkai 190 mm - 2 x (1 px garis + 36 px jarak dalam)
  const bidang = 190 - 2 * px(37);
  const kolomMm = [px(46), px(194), px(16), 0];
  kolomMm[3] = bidang - kolomMm.reduce((a, b) => a + b, 0);
  const nK = kolomMm.length;
  kolomMm.forEach((mm, i) => (ws.getColumn(i + 1).width = ciplXlLebar(mm, mdw)));
  const lebarPt = (c1, c2) => kolomMm.slice(c1 - 1, c2).reduce((n, mm) => n + ttPt(mm), 0);
  const ruang = (c1, c2) => (lebarPt(c1, c2) - 2 * CIPL_XL_TEPI) * CIPL_XL_LONGGAR;
  const H = (s, o) => ciplXlHuruf("times", s, Object.assign({ c: "#000000" }, o || {}));
  const ukur = (s, o) => ttH("times", s, o);
  /* Jarak baris = cetakannya (x 1,15): Times New Roman di Excel ~1,14 x
     ukurannya per baris, jadi suratnya tetap muat satu halaman A4. */
  const tinggiTeks = (ukuran) => ukuran.reduce((n, s) => n + s * 1.15, 0) + ttPx(2);
  const P = ciplXlPenyusun();
  const teksPenuh = (jarakAtas, isi, gaya) => {
    const r = P.baris(jarakAtas + isi.tinggi);
    ciplXlSel(ws, r, 1, r, nK, isi.nilai, Object.assign({ va: "bottom", wrap: true }, gaya || {}));
    return r;
  };
  const satu = (tx, s, o) => ({ nilai: tx, tinggi: tinggiTeks(ttBungkus(tx, ukur(s, o), ruang(1, nK)).map(() => s)), font: H(s, o) });

  /* KOP: logo di kiri, nama & alamat perusahaan di tengah sisa lebarnya
     -- alamat dikecilkan seperlunya supaya satu baris dan tidak menimpa
     logo, seperti cetakan. */
  const logoKiri = ttPx(9); // dari tepi kiri bidang teks
  const logoW = ttPx(52);
  const logoH = ttPx((52 * 94) / 127);
  const tengahKop = lebarPt(1, 1) + lebarPt(2, nK) / 2;
  const lebarKop = 2 * (tengahKop - (logoKiri + logoW + ttPx(6))) * CIPL_XL_LONGGAR;
  const sAlamat = ttUkuranPas([CIPL_PERUSAHAAN.pusat, CIPL_PERUSAHAAN.cabang], ukur(9), lebarKop, 6) || 9;
  const rKop = P.baris(tinggiTeks([19, sAlamat, sAlamat]) + ttPx(8));
  ciplXlSel(ws, rKop, 2, rKop, nK, ciplXlTeksKaya([[CIPL_PERUSAHAAN.nama, H(19, { b: true })],
    [CIPL_PERUSAHAAN.pusat, H(sAlamat)], [CIPL_PERUSAHAAN.cabang, H(sAlamat)]]), { ha: "center", va: "middle", wrap: true });
  if (typeof SJ_LOGO !== "undefined" && SJ_LOGO) {
    const id = wb.addImage({ base64: SJ_LOGO, extension: "png" });
    const yOff = Math.max(0, (ciplXlTinggi(P.tinggi[rKop]) - logoH) / 2);
    ws.addImage(id, {
      tl: { nativeCol: 0, nativeColOff: Math.round(logoKiri * 12700), nativeRow: rKop - 1, nativeRowOff: Math.round(yOff * 12700) },
      ext: { width: logoW / 0.75, height: logoH / 0.75 },
      editAs: "oneCell",
    });
  }

  // JUDUL, NOMOR, TUJUAN, PEMBUKA
  const judul = satu("SHIPPING INSTRUCTION", 16, { b: true, u: true });
  teksPenuh(ttPx(36), judul, { font: judul.font, ha: "center" });
  const no = satu(`NO. ${d.no}`, 11.5, { b: true });
  teksPenuh(ttPx(2), no, { font: no.font, ha: "center" });
  const kepada = satu(`To : ${d.tujuan}`, 10.5);
  teksPenuh(ttPx(30), kepada, { font: kepada.font });
  const pembuka = satu("Please arrange our shipment per description below :", 10.5);
  teksPenuh(ttPx(4), pembuka, { font: pembuka.font });

  /* DAFTAR INSTRUKSI: penanda | label | : | isi -- satu baris per butir,
     tanpa sel gabungan (AutoFit menyesuaikan tingginya dengan isinya).
     Rata atas seperti cetakan: label sejajar baris PERTAMA isinya. Jarak
     10 px di atas daftar = satu baris tipis (bukan bagian butir pertama,
     supaya butir itu tetap rata atas). */
  P.baris(ttPx(10));
  const butir = (label, nilai, o) => {
    const isiTeks = typeof nilai === "string" ? nilai : "";
    const n = ttBungkus(isiTeks, ukur(10.5, { b: !!o.tebal }), ruang(4, 4)).length;
    const r = P.baris(tinggiTeks(new Array(Math.max(1, n)).fill(10.5)), true);
    /* Penanda 8,5 pt di depan label 10,5 pt: berjarak satu indent dari label
       (seperti cetakan), di tengah tinggi baris satu-baris -- rata atas ia
       tampak naik seperti pangkat. */
    if (!o.sub) ciplXlSel(ws, r, 1, r, 1, "❋", { font: H(8.5), ha: "right", indent: 1, va: n > 1 ? "top" : "middle" });
    ciplXlSel(ws, r, 2, r, 2, label, { font: o.sub ? H(9.5) : H(10.5) });
    if (!o.sub) ciplXlSel(ws, r, 3, r, 3, ":", { font: H(10.5) });
    const gaya = { font: H(10.5, { b: !!o.tebal }), wrap: true, ha: "left" };
    if (o.angka) ciplXlSel(ws, r, 4, r, 4, o.angka.v, Object.assign(gaya, { numFmt: o.angka.fmt }));
    else ciplXlSel(ws, r, 4, r, 4, isiTeks, gaya);
  };
  const fmtBerat = (v, satuan) => `#,##0${Math.abs(v - Math.round(v)) < 1e-9 ? "" : ".00"}"   ${satuan}"`;
  CIPL_SI_BARIS.forEach((def) => {
    if (def.alamat) {
      const isi = d[def.alamat] || [];
      butir(def.k, isi[0] || "", {});
      butir("Address", isi.slice(1).join("\n"), { sub: true });
      return;
    }
    const nilai = ciplSiNilai(def, d);
    let angka = null;
    const a = d.angka || {};
    if (def.hitung === "hs" && /^[1-9]\d{3,11}$/.test(nilai)) angka = { v: Number(nilai), fmt: "0" };
    else if ((def.hitung === "gw" || def.hitung === "nw") && nilai && isFinite(a[def.hitung])) angka = { v: a[def.hitung], fmt: fmtBerat(a[def.hitung], def.satuan) };
    else if (def.hitung === "koli" && a.koli > 0) angka = { v: a.koli, fmt: `#,##0${Math.abs(a.koli - Math.round(a.koli)) < 1e-9 ? "" : ".00"}" PACKAGE"` };
    butir(def.k, `${nilai}${def.satuan && nilai ? `   ${def.satuan}` : ""}`, { tebal: def.tebal, angka });
  });

  // PENUTUP & TANDA TANGAN
  const terima = satu("Thank you for your good cooperation.", 10.5);
  teksPenuh(ttPx(16), terima, { font: terima.font });
  const tempat = satu(`Cirebon, ${d.tanggal}`, 10.5);
  teksPenuh(ttPx(12), tempat, { font: tempat.font });
  const salam = satu("Regards,", 10.5);
  teksPenuh(0, salam, { font: salam.font });
  const ttd = satu("SIGN & STAMP", 10.5, { b: true, u: true });
  teksPenuh(ttPx(84), ttd, { font: ttd.font });

  ciplXlTutup(ws, P, nK);
  return ws;
}

/* Satu lembar ke buku kerja: dari speknya (CI / PL), data SI, atau --
   model lain tanpa spek -- replika kisi cetakannya (ttExcel). */
function ciplXlLembar(wb, T, mdw) {
  if (T.spek) return ciplXlFormal(wb, T.spek, mdw);
  if (T.si) return ciplXlSi(wb, T.si, mdw);
  return ttExcel(wb, T, mdw);
}

/* Buku kerja CIPL (tanpa mengunduh) -- dipakai tombol unduh & uji.
   Lembar dari ciplDaftarTata(): daftar & data yang sama dengan Print. */
function ciplBukuKerja(row, shipment) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();
  // Rumus (Amount, TOTAL) dihitung ulang Excel saat berkas dibuka; hasil tersimpannya = angka cetakan
  wb.calcProperties.fullCalcOnLoad = true;
  const lebarAngka = ttExcelHurufNormal(wb);
  ciplDaftarTata(row, shipment).forEach((T) => ciplXlLembar(wb, T, lebarAngka));
  return wb;
}

async function unduhCiplExcel(rowId) {
  if (ciplXlsSedangDibuat) return;

  const row = ciplCariBarisRiwayat(rowId);
  if (!row) return;
  const shipment = ciplCariShipment((row.payload || {}).shipmentId);

  ciplXlsSedangDibuat = true;
  const tombol = document.querySelector(`[data-xls-cipl="${rowId}"]`);
  if (tombol) tombol.disabled = true;
  try {
    /* ExcelJS DIMUAT SESUAI KEBUTUHAN, bukan ikut di halaman. */
    await ensureExcelJS();

    const buf = await ciplBukuKerja(row, shipment).xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    /* Nama berkas = nomor invoice APA ADANYA, spasinya ikut
       ("DDI - CRBM - X - 061.xlsx"). Hanya karakter yang dilarang
       sistem berkas diganti tanda hubung (ciplNamaBerkas). */
    tautan.download = `${ciplNamaBerkas(row.doc_number)}.xlsx`;
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);

    showToast(tt(`Berkas Excel ${row.doc_number || ""} diunduh.`, `Excel file ${row.doc_number || ""} downloaded.`), "success");
  } catch (err) {
    console.error(err);
    /* Sebabnya ikut ditulis. Pesan generik menyembunyikan satu-satunya
       petunjuk yang dimiliki pengguna — dan juga yang memperbaikinya. */
    showToast(
      t("x.gagal.menyusun.excel", { err: err && err.message ? err.message : t("s.kesalahan.tidak.diketahui") }),
      "danger",
    );
  } finally {
    /* Dilepas di finally: kalau penyusunan gagal dan bendera tetap
       menyala, tombolnya mati selamanya sampai halaman dimuat ulang. */
    ciplXlsSedangDibuat = false;
    if (tombol) tombol.disabled = false;
  }
}
