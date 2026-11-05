"use strict";

/* ------------------------------------------------------------------
   FORM PENGAJUAN DANA (Fund Request) — lembar cetak

   Sumber datanya baris nomor dokumen jenis "fund": No. Surat diambil
   dari nomornya sendiri, Subject dari Rincian, sisanya dari payload
   form. Semua nama & jabatan penanda tangan bisa diubah per surat —
   orangnya berganti, dan jabatannya pun tidak selalu sama.
------------------------------------------------------------------ */

/* Sisa tabel diisi ruang kosong supaya blok TOTAL selalu jatuh di
   tempat yang sama berapa pun jumlah barisnya. */
const FR_MIN_BARIS = 9;

const FR_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/* ---------- TERBILANG ----------

   Aturan bahasa Indonesia yang gampang terlewat: 11-19 memakai
   "belas" (sebelas, dua belas), 100 & 1000 memakai "se-" bukan "satu"
   (seratus, seribu — tapi "dua ratus", "dua ribu"). Ditulis rekursif
   per kelompok tiga angka supaya tidak perlu tabel panjang. */
const FR_SATUAN = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
];
const FR_SKALA = ["", "ribu", "juta", "miliar", "triliun"];

function terbilangRatusan(n) {
  if (n < 12) return FR_SATUAN[n];
  if (n < 20) return terbilangRatusan(n - 10) + " belas";
  if (n < 100) {
    const sisa = n % 10;
    return terbilangRatusan(Math.floor(n / 10)) + " puluh" + (sisa ? " " + FR_SATUAN[sisa] : "");
  }
  if (n < 200) {
    const sisa = n - 100;
    return "seratus" + (sisa ? " " + terbilangRatusan(sisa) : "");
  }
  const sisa = n % 100;
  return (
    FR_SATUAN[Math.floor(n / 100)] + " ratus" + (sisa ? " " + terbilangRatusan(sisa) : "")
  );
}

function terbilang(nilai) {
  // Dibulatkan ke rupiah penuh: surat pengajuan tidak menyebut sen.
  let n = Math.floor(Math.abs(Number(nilai) || 0));
  if (n === 0) return "nol";

  const bagian = [];
  let skala = 0;
  while (n > 0) {
    const tiga = n % 1000;
    if (tiga > 0) {
      // 1.000 = "seribu", bukan "satu ribu" — tapi 1.000.000 tetap "satu juta".
      const kata =
        tiga === 1 && skala === 1 ? "seribu" : terbilangRatusan(tiga) + " " + FR_SKALA[skala];
      bagian.unshift(kata.trim());
    }
    n = Math.floor(n / 1000);
    skala++;
  }
  return bagian.join(" ").replace(/\s+/g, " ").trim();
}

// "Enam Juta Sembilan Ratus Tujuh Puluh Lima Ribu Dua Belas Rupiah"
function terbilangRupiah(nilai) {
  const kata = terbilang(nilai);
  const kapital = kata.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return kapital + " Rupiah";
}

/* ---------- data ---------- */

function frAngka(v) {
  return parseLooseNumber(v);
}

/* Baris tabel. Kalau ketiga rincian pungutan kosong, surat mencetak
   SATU baris memakai Jenis Pengeluaran & Nominal — bentuk lama tetap
   bisa dicetak tanpa harus diisi ulang. */
function frBarisRincian(p) {
  const rinci = [
    { label: "Bea Masuk", nilai: frAngka(p.feeBm) },
    { label: "PPN Import", nilai: frAngka(p.feePpn) },
    { label: "PPH Import", nilai: frAngka(p.feePph) },
  ];
  const adaRincian = rinci.some((r) => r.nilai > 0);
  if (adaRincian) return rinci;
  return [
    {
      label: p.expenseType || "Pengajuan Dana",
      nilai: frAngka(p.amount),
    },
  ];
}

function frTotal(baris) {
  return baris.reduce((jumlah, b) => jumlah + (Number(b.nilai) || 0), 0);
}

/* JUMLAH AKHIR SATU PENGAJUAN -- angka yang sama dengan "Terbilang"
   di surat cetaknya.

   Format rinci (p.lines) -> grandTotal-nya (sudah termasuk PPN dan
   sudah dipotong PPH 23). Format lama -> jumlah Bea Masuk + PPN + PPH,
   atau Nominal kalau ketiganya kosong. Satu tempat, supaya Ringkasan
   per Vendor tidak pernah menjumlahkan angka yang berbeda dari yang
   tertulis di surat pengajuannya sendiri. */
function frTotalPengajuan(p) {
  const d = p || {};
  if (Array.isArray(d.lines) && d.lines.length) return fundLineTotals(d.lines, d.currency, d.payee).grandTotal;
  return frTotal(frBarisRincian(d));
}

/* Nilai berawalan mata uang -- di surat cetak DAN di layar (riwayat,
   panel Detail, Summary): "Rp. 6,975,012". Nilai nol ditulis "-",
   seperti pada berkas rujukan — bukan "Rp. 0", yang terbaca seolah
   memang ada tagihan sebesar nol.

   Mata uang selain rupiah tetap memakai kodenya (USD 1,200.50): "Rp."
   khusus untuk IDR, bukan awalan untuk semua mata uang. */
function frNilai(n, mataUang) {
  const v = Number(n) || 0;
  if (!v) return "-";
  const kode = (mataUang || "IDR").toUpperCase();
  return `${kode === "IDR" ? "Rp." : kode} ${formatNilai(v)}`;
}

/* ---------- SEL UANG GAYA AKUNTING ----------

   Di tabel surat, kode mata uang ("Rp.") menempel di tepi KIRI sel dan
   angkanya di tepi KANAN -- seperti format Accounting di Excel. Kode
   mata uang tidak lagi ikut mendorong angka, jadi seluruh angka dalam
   satu kolom berakhir di garis yang sama dan bisa dijumlah dengan mata.

   Desimal: kalau SATU saja angka di tabel punya sen, SEMUA angka
   dicetak dua desimal (714,716.00) supaya titik desimalnya sejajar
   lurus. Tabel yang seluruhnya rupiah bulat tidak diberi ".00".

   Yang tidak berubah dari frNilai(): nol ditulis "-" saja (bukan
   "Rp. 0"), dan mata uang selain rupiah memakai kodenya sendiri (USD).
   Nilai negatif -- baris diskon, potongan PPH -- bertanda minus di sisi
   kiri: "- Rp." lalu angkanya, sama dengan tulisan lamanya "- Rp. 1,000". */
function frAdaSen(daftar) {
  return (daftar || []).some((v) => Math.round((Number(v) || 0) * 100) % 100 !== 0);
}

function frSelUang(n, mataUang, desimal) {
  const v = Number(n) || 0;
  if (!v) return "-";
  const kode = (mataUang || "IDR").toUpperCase();
  const mutlak = Math.abs(v);
  const angka = desimal
    ? angkaLokal(mutlak, "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : formatNilai(mutlak);
  const kiri = `${v < 0 ? "- " : ""}${kode === "IDR" ? "Rp." : kode}`;
  // Spasi di antara kedua span tidak tergambar (kotak flex), tapi membuat salinan teksnya "Rp. 1,000"
  return `<span class="akun"><span class="akun-kode">${escapeHtml(kiri)}</span> <span class="akun-angka">${escapeHtml(angka)}</span></span>`;
}

function frTanggalSurat(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  return `${d.getDate()} ${FR_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/* Baris judul di dalam tabel: "Nomor Billing : ..." atau
   "Nomor Invoice : ...", mengikuti mana yang terisi. Kosong keduanya
   -> tidak ada barisnya sama sekali, bukan baris kosong menggantung. */
function frBarisRujukan(p, kolom) {
  const pasangan = p.billingNo
    ? ["Nomor Billing", p.billingNo]
    : p.invoiceNo
      ? ["Nomor Invoice", p.invoiceNo]
      : null;
  if (!pasangan) return "";
  /* colspan = seluruh kolom SISA sesudah kolom NO.

     Sempat salah hitung (kolom-2), sehingga pada tabel 3 kolom baris
     ini cuma mengisi 2 sel -- kolom terakhir tidak punya sel sama
     sekali dan garis tepinya bolong di baris itu. */
  /* SATU sel melintang penuh, tanpa sekat di dalamnya -- bentuk yang
     sama dengan baris TOTAL di kaki tabel. Memecahnya jadi beberapa sel
     menyisakan garis tegak pendek yang tidak memisahkan apa pun. */
  return `<tr class="baris-rujukan"><td class="c-desc" colspan="${kolom || 3}"><b>${escapeHtml(pasangan[0])} : ${escapeHtml(pasangan[1])}</b></td></tr>`;
}

function frKotakTtd(label, nama, jabatan) {
  /* Nama & jabatan dibungkus SATU blok (.ttd-blok), bukan dua baris
     lepas. Blok itu menempel di tepi kiri selnya -- sejajar dengan
     labelnya ("Made by ;") -- sementara di DALAM blok keduanya rata
     tengah satu sama lain, jadi jabatan tetap duduk di tengah nama.

     Merata-tengahkan keduanya terhadap SEL membuat nama melayang jauh
     dari labelnya: label di tepi kiri, nama di tengah kolom. */
  return `<td class="ttd-cell">
    <div class="ttd-label">${escapeHtml(label)}</div>
    <div class="ttd-ruang"></div>
    <div class="ttd-blok">
      <div class="ttd-nama"><span>${escapeHtml(nama || "")}</span></div>
      <div class="ttd-jabatan">${escapeHtml(jabatan || "")}</div>
    </div>
  </td>`;
}

/* ---------- lembar ---------- */

/* Penanda tangan keempat: Chief Financial Officer. Nilai bawaan yang
   SAMA dengan isian di form (cfoName/cfoRole di index.html), dipakai
   cetakan & kotak Detail kalau isiannya kosong. */
const FR_TTD_CFO = { nama: "Mr. Kim Taewan", jabatan: "Chief Financial Officer" };

/* Penanda tangan keempat (CFO) hanya untuk vendor yang Doc No-nya
   dicetak -- aturan yang sama dengan baris Doc No (fundPakaiDocNo). */
const frPakaiTtdCfo = (p) => typeof fundPakaiDocNo === "function" && fundPakaiDocNo((p || {}).payee);

/* TIGA PENANDA TANGAN -- EMPAT untuk vendor yang Doc No-nya dicetak.

   Kotak persetujuan kedua yang LAMA (President Director, isian
   approver2*) dihapus karena jalur persetujuannya sudah tidak lewat
   sana lagi. Pengajuan lama yang terlanjur menyimpan isian itu TIDAK
   ikut tercetak: kotak yang tidak akan ditandatangani siapa pun lebih
   menyesatkan daripada tidak ada sama sekali. Penanda tangan keempat
   yang sekarang (CFO) memakai kunci sendiri, cfoName/cfoRole.

   Lebarnya dibagi rata (table-layout: fixed di CSS: 33,33% bertiga,
   25% berempat), jadi jarak antar tanda tangan sama besar.

   Keterangan ini sengaja komentar JS, bukan komentar HTML di dalam
   templat: apa pun yang ditulis di dalam templat ikut terbawa ke
   sumber halaman cetak -- termasuk nama jabatan yang justru sudah
   tidak dipakai lagi, yang lalu muncul lagi saat orang mencarinya. */
function buildFundRequestHtml(row) {
  const p = row.payload || {};
  /* DUA BENTUK TABEL.

     Ada `lines` -> format RINCI: tiap pos punya nilai & tarif PPN
     sendiri, dengan potongan PPH 23 di bawahnya. Dipakai untuk jenis
     pengeluaran selain Billing.

     Tidak ada -> format LAMA (Bea Masuk / PPN / PPH). Pengajuan yang
     sudah terbit sebelum format rinci ada tetap tercetak benar lewat
     jalur ini. */
  const pakaiRinci = Array.isArray(p.lines) && p.lines.length > 0;
  const baris = frBarisRincian(p);
  const total = frTotal(baris);
  const mataUang = p.currency || "IDR";

  // Satu aturan desimal untuk seluruh tabel (lihat frSelUang)
  const sen = frAdaSen(baris.map((b) => b.nilai).concat(total));
  const barisHtml = baris
    .map(
      (b, i) => `<tr class="baris-pos">
        <td class="c-no">${i + 1}</td>
        <td class="c-desc">${escapeHtml(b.label)}</td>
        <td class="c-amt">${frSelUang(b.nilai, mataUang, sen)}</td>
      </tr>`,
    )
    .join("");

  // Baris kosong penambal supaya tinggi tabelnya tetap.
  const kosong = Math.max(0, FR_MIN_BARIS - baris.length);
  const kosongHtml = Array.from(
    { length: kosong },
    () => `<tr class="baris-pos"><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-amt"></td></tr>`,
  ).join("");

  /* DOC NO: kotaknya ada di form untuk SEMUA vendor dan isinya tersimpan
     (p.docNo), tetapi baris "Doc No" di bawah No Surat hanya DICETAK untuk
     vendor di luar daftar Aturan Doc No (bawaan: PRIME & WIDE tidak
     dicetak). Jadi pengajuan PRIME/WIDE yang menyimpan Doc No tetap
     tercetak seperti biasa, tanpa baris itu. */
  /* PEMBUNGKUS HALAMAN (.halaman): satu tabel luar dengan satu sel isi,
     ditambah kepala & kaki kosong yang tingginya sama dengan margin atas
     & bawah kertas. Peramban mengulang kepala & kaki tabel di SETIAP
     halaman cetak, jadi halaman ke-2 dan seterusnya juga mendapat margin
     -- padahal @page sengaja bermargin nol (kop & kaki peramban hilang,
     lihat fundRequestCss). Isinya sendiri mengalir apa adanya dan
     terpotong di antara blok, bukan di tengah baris. */
  return `
  <div class="sheet">
   <table class="halaman">
    <thead><tr><td class="tepi-atas"></td></tr></thead>
    <tfoot><tr><td class="tepi-bawah"></td></tr></tfoot>
    <tbody><tr><td class="isi-halaman">
    ${kopSuratHtml()}

    <div class="judul">FORM PENGAJUAN DANA</div>

    <table class="meta">
      <tr><td class="meta-k">No Surat</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(row.doc_number || "")}</td></tr>${
        fundPakaiDocNo(p.payee)
          ? `
      <tr><td class="meta-k">Doc No</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.docNo || "")}</td></tr>`
          : ""
      }
      <tr><td class="meta-k">Subject</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.notes || "")}</td></tr>
      <tr><td class="meta-k">Lampiran</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.attachment || "1 Set")}</td></tr>
    </table>

    <!-- SATU BARIS SAJA. "Sincerely," sebagai pembuka memang keliru
         (itu salam penutup), dan Subject-nya sudah tertulis utuh di
         blok No Surat di atas -- mengulangnya di sini cuma menambah
         satu baris yang dibaca dua kali. -->
    <div class="pembuka">
      <div>Please find the details below :</div>
    </div>

    ${pakaiRinci ? frTabelRinci(p, mataUang) : `
    <table class="rincian">
      <thead>
        <tr>
          <th class="c-no">NO.</th>
          <th class="c-desc">D E S C R I P T I O N S</th>
          <th class="c-amt">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${
          /* Baris rujukan: nomor BILLING untuk pengajuan jenis Billing,
             nomor INVOICE untuk jenis lainnya. Hanya satu yang pernah
             terisi (isian lawannya dinonaktifkan di form), jadi tidak
             perlu memilih mana yang menang. */
          frBarisRujukan(p)
        }
        ${barisHtml}
        ${kosongHtml}
        <tr class="baris-total">
          <td class="c-total" colspan="2">TOTAL</td>
          <td class="c-amt">${frSelUang(total, mataUang, sen)}</td>
        </tr>
      </tbody>
      ${frKakiTutup(3)}
    </table>`}

    <!-- Terbilang sampai catatan = SATU blok (.penutup-blok): tidak
         pernah terpecah antar halaman. Label "Made by ;" tidak terpisah
         dari nama penanda tangannya, dan catatan kaki tidak tertinggal
         sendirian di halaman berikutnya. -->
    <div class="penutup-blok">
      <div class="terbilang">Terbilang : ${escapeHtml(
        terbilangRupiah(frTotalPengajuan(p)),
      )}</div>

      <div class="penutup">
        Thus we convey this letter, for your attention and cooperation,
        we thank you
      </div>

      <div class="tempat-tanggal">Cirebon, ${escapeHtml(frTanggalSurat(row.doc_date))}</div>

      <table class="ttd${frPakaiTtdCfo(p) ? " ttd--empat" : ""}">
        <tr>
          ${frKotakTtd("Made by ;", p.requester || row.requester, "Drafter")}
          ${frKotakTtd("Checked By ;", p.checkedByName || "M. Rangga", p.checkedByRole || "Accounting")}
          ${frKotakTtd("Approved by :", p.approver1Name || "Mr. Shin Na Ra", p.approver1Role || "Chief Marketing Officer")}
          ${frPakaiTtdCfo(p) ? frKotakTtd("Approved by :", p.cfoName || FR_TTD_CFO.nama, p.cfoRole || FR_TTD_CFO.jabatan) : ""}
        </tr>
      </table>

      <div class="catatan">
        <b>Notes (PERHATIAN)</b> : pengajuan dana adalah dokumen tertulis yang
        digunakan untuk meminta dukungan kegiatan, dan menunjukkan dampak positif
        yang dapat dihasilkan finansial dari individu organisasi, atau lembaga
        tertentu. Tujuan utama proposal ini adalah untuk menjelaskan kebutuhan
        dana, menyampaikan rencana.
      </div>
    </div>
    </td></tr></tbody>
   </table>
  </div>`;
}

/* KAKI TABEL = GARIS PENUTUP, tanpa isi.

   Peramban mengulang kaki tabel di dasar SETIAP halaman yang dilewati
   tabel. Dulu baris TOTAL ada di kaki, sehingga TOTAL tercetak juga di
   dasar halaman 1 padahal barisnya masih berlanjut di halaman 2 --
   terbaca seolah semuanya sudah dijumlah. Sekarang TOTAL menjadi baris
   terakhir badan tabel (muncul sekali, di ujung), dan kaki hanya satu
   sel kosong yang bergaris atas: di dasar tiap halaman ia menutup tabel
   dengan garis (garis antar-baris pos sengaja disembunyikan, jadi tanpa
   penutup tabel tampak terbuka di dasar halaman); di halaman terakhir
   garisnya menyatu dengan garis bawah baris TOTAL, tidak menambah garis. */
function frKakiTutup(kolom) {
  return `<tfoot class="tutup" aria-hidden="true"><tr><td colspan="${kolom}"></td></tr></tfoot>`;
}

/* BAGIAN PER BL/AWB -- satu invoice untuk beberapa kiriman. Dicetak
   hanya kalau ada baris yang SENGAJA ditautkan ke BL/AWB-nya (kolom
   BL/AWB di form); pembagian rata semata hitungan aplikasi untuk biaya
   per kiriman, bukan hal yang perlu disetujui di surat. */
function frBagianPerAwb(p) {
  const bagian = typeof fundBagiPerAwb === "function" ? fundBagiPerAwb(p) : [];
  return bagian.length < 2 || !bagian.some((b) => b.tautan) ? [] : bagian;
}

function frBarisPerAwb(p, mataUang, kolom, desimal) {
  const bagian = frBagianPerAwb(p);
  if (!bagian.length) return "";
  return `
      <tr class="baris-rujukan"><td class="c-desc" colspan="${kolom}"><b>BAGIAN PER BL/AWB</b></td></tr>${bagian
        .map(
          (b) => `
      <tr class="baris-awb">
        <td class="c-desc" colspan="${kolom - 1}">${escapeHtml(b.teks)}${b.rata ? " (termasuk bagian rata)" : ""}</td>
        <td class="c-amt">${frSelUang(b.dibayar, mataUang, desimal)}</td>
      </tr>`,
        )
        .join("")}`;
}

/* Tabel format rinci. Kolomnya mengikuti tagihan forwarder: uraian,
   nilai, PPN, lalu jumlah per baris — supaya angkanya bisa dicocokkan
   baris per baris dengan invoice aslinya saat diperiksa. */
function frTabelRinci(p, mataUang) {
  /* Diskon adalah BARIS SENDIRI yang nilainya negatif (fund-lines.js) --
     tercetak sebagai baris biasa dengan tanda minus, tanpa keterangan
     tambahan di samping pos lain. Data lama berkolom diskon per pos
     dipecah dulu oleh normalisasiBarisDana(), jadi tercetak sama. */
  const daftar = normalisasiBarisDana(p.lines || []);
  const nilaiBaris = fundLineValues(daftar);
  const ppnBaris = fundLinePpnDaftar(daftar, nilaiBaris, mataUang, p.payee);
  const r = fundLineTotals(daftar, mataUang, p.payee);
  const KOLOM = 6;
  // Satu aturan desimal untuk SELURUH tabel (lihat frSelUang)
  const sen = frAdaSen(nilaiBaris.concat(ppnBaris, [r.totalNet, r.totalPpn, r.pph, r.grandTotal, r.totalNet + r.totalPpn], frBagianPerAwb(p).map((b) => b.dibayar)));
  const uang = (v) => frSelUang(v, mataUang, sen);

  const barisPos = (b, i) => {
    const nilai = nilaiBaris[i];
    const ppn = ppnBaris[i];
    const tarif = fundLineRate(b);
    return `<tr class="baris-pos">
        <td class="c-no">${i + 1}</td>
        <td class="c-desc">${escapeHtml(b.desc || "")}</td>
        <td class="c-amt">${uang(nilai)}</td>
        <td class="c-rate">${tarif ? tarif + "%" : "-"}</td>
        <td class="c-amt">${uang(ppn)}</td>
        <td class="c-amt"></td>
      </tr>`;
  };
  /* BEBERAPA DOKUMEN (invoice + invoice / debit note): pos dicetak per
     dokumennya, masing-masing di bawah judul "Nomor Invoice : ..." /
     "Nomor Debit Note : ...". Satu dokumen saja -> bentuk lama, dengan
     satu baris rujukan di atas. */
  const dokumen = (Array.isArray(p.dokumen) ? p.dokumen : []).filter((d) => d && d.id);
  const kelompok = [{ id: "", jenis: "invoice", nomor: p.invoiceNo }].concat(dokumen);
  const adaKelompok = new Set(kelompok.map((d) => d.id));
  const judulKelompok = (d) =>
    `<tr class="baris-rujukan"><td class="c-desc" colspan="${KOLOM}"><b>${escapeHtml(d.jenis === "debit" ? "Nomor Debit Note" : "Nomor Invoice")} : ${escapeHtml(d.nomor || "-")}</b></td></tr>`;
  const baris = dokumen.length
    ? kelompok.map((d) => judulKelompok(d) + daftar
      .map((b, i) => (String(b.dok || "") === d.id || (!d.id && !adaKelompok.has(String(b.dok || ""))) ? barisPos(b, i) : ""))
      .join("")).join("")
    : daftar.map(barisPos).join("");

  /* Penambal dibatasi: tabel rinci bisa berisi belasan pos, dan
     menambahkan baris kosong di atasnya membuat lembarnya tumbuh
     melewati satu halaman padahal ruangnya masih cukup. */
  const kosong = Math.max(0, 6 - daftar.length - (dokumen.length ? kelompok.length : 0));
  const kosongHtml = Array.from(
    { length: kosong },
    () =>
      `<tr class="baris-pos"><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-amt"></td><td class="c-rate"></td><td class="c-amt"></td><td class="c-amt"></td></tr>`,
  ).join("");

  /* SUBTOTAL & POTONGAN ADA DI BADAN TABEL, bukan di kaki.

     Keduanya masih bagian dari perincian: jumlah per kolom lalu
     pengurangnya. Yang di kaki hanya angka yang benar-benar dibayarkan
     — itulah satu-satunya baris yang perlu dibaca cepat. */
  const subtotal = `
      <tr class="baris-subtotal">
        <td class="c-no"></td>
        <td class="c-desc">TOTAL :</td>
        <td class="c-amt">${uang(r.totalNet)}</td>
        <td class="c-rate"></td>
        <td class="c-amt">${uang(r.totalPpn)}</td>
        <td class="c-amt">${uang(r.totalNet + r.totalPpn)}</td>
      </tr>
      <tr class="baris-potongan">
        <td class="c-desc" colspan="4">POTONGAN PPH 23 (${FUND_PPH23_RATE}%)</td>
        <td class="c-amt">${uang(r.pph)}</td>
        <td class="c-amt">${
          /* Tanpa potongan, cukup "-" saja. frSelUang() menuliskan nol
             sebagai "-", jadi tidak ada "- -" yang terbaca seperti salah
             cetak; potongannya sendiri bertanda minus di sisi kiri. */
          uang(-r.pph)
        }</td>
      </tr>${frBarisPerAwb(p, mataUang, KOLOM, sen)}`;

  return `
    <table class="rincian rincian--detail">
      <thead>
        <tr>
          <th class="c-no">NO.</th>
          <th class="c-desc">D E S C R I P T I O N S</th>
          <th class="c-amt">AMOUNT (Rp)</th>
          <th class="c-rate">PPN</th>
          <th class="c-amt">PPN (Rp)</th>
          <th class="c-amt">JUMLAH (Rp)</th>
        </tr>
      </thead>
      <tbody>
        ${dokumen.length ? "" : frBarisRujukan(p, KOLOM)}
        ${baris}
        ${kosongHtml}
        ${subtotal}
        <tr class="baris-total">
          <td class="c-total" colspan="${KOLOM - 1}">TOTAL</td>
          <td class="c-amt">${uang(r.grandTotal)}</td>
        </tr>
      </tbody>
      ${frKakiTutup(KOLOM)}
    </table>`;
}

async function cetakFundRequest(rowId) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row) {
    showToast(t("m.data.pengajuan.dana.tidak.ditemukan"), "danger");
    return;
  }
  /* Jendelanya dibuka DULU, selagi masih di dalam klik pengguna --
     dibuka sesudah menunggu apa pun, peramban menganggapnya pop-up liar
     dan memblokirnya. */
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger", { judul: tt("Pop-up diblokir", "Pop-up blocked"), tetap: true });
    return;
  }
  /* Baris Doc No bergantung pada aturan vendor (fund-docno.js) yang
     dimuat saat halaman dibuka: ditunggu dulu, supaya surat yang dicetak
     sesaat setelah halaman tampil tidak memakai aturan lama. */
  await fundDocNoSiap();
  w.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Form Pengajuan Dana ${escapeHtml(row.doc_number || "")}</title>
<style>${fundRequestCss()}</style></head>
<body>${buildFundRequestHtml(row)}</body></html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}

function fundRequestCss() {
  return `
  /* margin: 0 menghilangkan kop & kaki bawaan peramban -- baris
     "9/11/26 ... about:blank ... 1/1" itu digambar peramban DI DALAM
     margin halaman, jadi ia lenyap sendiri begitu marginnya nol.
     Jarak ke tepi kertas pindah ke lembar itu sendiri: kiri-kanan di
     padding .sheet, atas-bawah di kepala & kaki .halaman (di bawah). */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Times New Roman", Times, serif;
    font-size: 10.5pt;
    color: #000;
  }
  /* SELURUH JARAK TEGAK DALAM MILIMETER.

     Lembar ini diukur dalam satuan kertas, jadi jaraknya harus ikut:
     piksel di media cetak bergantung pada penskalaan peramban, dan
     mencampur keduanya membuat tata letaknya bergeser tidak merata
     antar mesin. Lebar kolom, padding sel, dan ukuran logo tetap px --
     itu detail di dalam tabel yang relatif terhadap ukuran huruf,
     bukan terhadap kertas. */
  /* MARGIN A4: 15 mm atas, 10 mm bawah, 20 mm kiri & kanan. Kop surat
     memang lazim duduk tinggi di kertas.

     ATAS & BAWAH BERLAKU DI SETIAP HALAMAN, bukan hanya halaman pertama.

     Margin kertas (@page) sengaja nol, jadi jarak ke tepi harus datang
     dari isi lembar sendiri. Padding .sheet hanya menjaga halaman
     PERTAMA: surat yang berlanjut ke halaman ke-2 akan menempel di tepi
     atas kertas, dan barisnya terpotong di tepi bawah. Maka isi lembar
     dibungkus tabel (.halaman) berkepala & berkaki KOSONG setinggi
     margin itu -- peramban mengulang kepala dan kaki tabel di tiap
     halaman cetak, sehingga margin ikut berulang tanpa @page margin.

     Kaki 10 mm itu ikut dihitung sebagai isi lembar, jadi isi surat
     harus berakhir minimal 10 mm dari tepi bawah. Memang itulah
     margin-nya; surat yang tidak muat berlanjut rapi ke halaman ke-2
     (lihat aturan pemecahan di bawah), bukan terpotong. */
  .sheet { width: 100%; padding: 0 20mm; }
  .halaman { width: 100%; border-collapse: collapse; }
  .halaman > thead > tr > td,
  .halaman > tfoot > tr > td,
  .halaman > tbody > tr > td { padding: 0; border: 0; }
  .halaman > thead > tr > td { height: 15mm; }
  .halaman > tfoot > tr > td { height: 10mm; }
  .halaman > tbody > tr > td { vertical-align: top; }

  /* KOP SURAT bersama (kopSuratCss, surat-jalan-print.js): sama persis
     dengan Surat BC & Surat Jalan Export. */
${kopSuratCss()}

  .judul {
    text-align: center;
    font-weight: 700;
    text-decoration: underline;
    /* Jarak dalam MILIMETER, bukan piksel.

       Lembar ini diukur dalam satuan kertas (@page A4, padding .sheet
       dalam mm), sementara piksel di media cetak bergantung pada
       penskalaan peramban -- 30px bisa jadi 8mm di satu mesin dan lain
       lagi di mesin berikutnya. Dengan mm, jaraknya sama di mana pun
       dicetak.

       Atas lebih besar daripada bawah: judul ini memisahkan kop surat
       (blok besar bergaris tebal) dari blok No Surat, jadi sisi
       atasnya butuh lebih banyak ruang supaya tidak terbaca menempel
       pada garis kop. */
    margin: 11mm 0 9mm;
    font-size: 11pt;
  }

  .meta { border-collapse: collapse; margin-bottom: 4mm; }
  .meta-k { width: 90px; padding: 1px 0; vertical-align: top; }
  .meta-s { width: 12px; padding: 1px 0; vertical-align: top; }
  .meta-v { padding: 1px 0 1px 8px; }

  /* Tidak ada lagi salam pembuka berbahasa Korea (dulu .salam, tinggi
     ~25 mm): ruangnya dipakai untuk pos biaya. Jarak di atas "Please
     find..." menggantikan margin bawah blok salam yang dulu. */
  .pembuka { margin: 7mm 0 3mm; break-after: avoid; }

  /* border-collapse, bukan border per elemen: garis tabel harus jatuh
     TEPAT di batas antar sel, tidak menggandakan diri di pertemuan
     kolom. */
  /* TABEL RINCIAN — dua format, satu aturan garis.

     Format SEDERHANA (Billing) memakai setelan aslinya: tiga kolom,
     huruf seukuran badan surat, lebar kolom mengikuti isi. Format
     RINCI perlu penyesuaian sendiri di bawah karena kolomnya enam. */
  .rincian {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2mm;
  }

  /* SETIAP sel bergaris penuh di keempat sisinya. Menyetel garis lewat
     sapuan "semua td di tbody" lalu mematikan sebagian membuat garis
     tepi bolong di baris yang tidak mengisi seluruh kolom. */
  .rincian th,
  .rincian td {
    border: 1px solid #000;
    padding: 3px 6px;
    vertical-align: top;
  }
  .rincian th {
    text-align: center;
    font-weight: 700;
    vertical-align: middle;
  }

  /* Hanya garis MENDATAR ANTARA DUA BARIS POS yang disembunyikan,
     supaya daftar posnya terbaca sebagai satu bidang. Garis tegaknya
     utuh, dan garis ke baris lain -- judul "Nomor Invoice / Nomor Debit
     Note", TOTAL, potongan, tepi atas & bawah tabel -- tetap tergambar.

     Gaya "hidden", bukan warna transparan: dengan border-collapse,
     "hidden" mengalahkan garis apa pun di batas itu. Cara lama (garis baris pos
     transparan + garis pembatas 1.2px supaya "yang lebih tebal menang")
     gagal di cetakan: peramban membulatkan 1.2px jadi 1px, tebalnya
     seri, dan garis transparan baris DI ATASNYA yang menang -- garis di
     atas "Nomor Debit Note" dan di atas TOTAL lenyap. */
  .rincian .baris-pos + .baris-pos td { border-top-style: hidden; }
  /* Bagian per BL/AWB: baris rincian kecil di bawah potongan */
  .rincian .baris-awb td { font-size: 0.95em; }

  .c-desc { text-align: left; }
  .c-total { text-align: right; font-weight: 700; }
  .rincian .baris-subtotal td,
  .rincian .baris-total td { font-weight: 700; }

  /* ---------- TABEL YANG BERLANJUT KE HALAMAN BERIKUTNYA ----------

     Pos biaya bisa puluhan baris. Aturannya supaya hasilnya tetap rapi:

     - Baris tidak pernah terpotong di tengah (break-inside).
     - Kepala kolom (NO. / DESCRIPTIONS / AMOUNT ...) diulang di tiap
       halaman -- perilaku bawaan thead -- dan tidak pernah tertinggal
       sendirian di dasar halaman.
     - Judul "Nomor Invoice / Debit Note" selalu bersama baris pertama
       di bawahnya.
     - TOTAL, potongan PPH, dan subtotal tidak ditinggal sendirian di
       halaman baru tanpa satu pun pos di atasnya.
     - Garis penutup di dasar tiap halaman (tfoot.tutup, lihat
       frKakiTutup): garis antar-baris pos disembunyikan, jadi tanpa
       ini tabelnya tampak terbuka di dasar halaman yang disambung. */
  .rincian tr { break-inside: avoid; }
  .rincian thead { break-after: avoid; }
  .rincian .baris-rujukan { break-after: avoid; }
  .rincian .baris-subtotal,
  .rincian .baris-potongan,
  .rincian .baris-total { break-before: avoid; }
  .rincian tfoot.tutup { display: table-footer-group; }
  .rincian tfoot.tutup td {
    padding: 0;
    border: 0;
    border-top: 1px solid #000;
    height: 0;
    line-height: 0;
    font-size: 0;
  }

  /* SEL UANG GAYA AKUNTING (frSelUang): "Rp." menempel di tepi kiri sel,
     angkanya di tepi kanan. flex + space-between, bukan tabulasi, supaya
     tetap benar di cetakan mana pun; baseline dijaga agar huruf "Rp."
     dan angkanya satu garis tulisan. */
  .akun {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
  }
  .akun-kode { flex: none; }
  .akun-angka { text-align: right; }

  /* Format sederhana: lebar kolom seperti semula. */
  .c-no { width: 34px; text-align: center; }
  /* nowrap: angka rupiah TIDAK boleh membungkus. Sekali membungkus,
     tinggi barisnya berubah sendiri dan tabelnya tidak lagi sejajar. */
  .c-amt {
    width: 130px;
    text-align: right;
    white-space: nowrap;
  }
  .c-rate {
    text-align: center;
    white-space: nowrap;
  }

  /* FORMAT RINCI: enam kolom pada lebar kertas yang sama, jadi hurufnya
     dikecilkan dan lebarnya dijatah.

     table-layout: fixed -- tanpa ini satu nilai panjang
     ("Rp. 34,354,345,345") melebarkan kolomnya dan menyempitkan yang
     lain sampai angkanya membungkus.

     Jatah: isi lembar 210mm - 30mm margin = 180mm; 8 + 30x3 + 11 =
     109mm untuk kolom tetap, sisanya (~71mm) untuk uraian. 30mm pada
     8pt memuat sekitar 21 karakter -- cukup untuk "Rp. 34,891,544,405"
     (18) tanpa membungkus. */
  .rincian--detail {
    table-layout: fixed;
    font-size: 8pt;
  }
  .rincian--detail th,
  .rincian--detail td { padding: 2px 4px; }
  .rincian--detail .c-no { width: 8mm; }
  .rincian--detail .c-amt { width: 30mm; }
  .rincian--detail .c-rate { width: 11mm; }

  .terbilang { margin: 4mm 0 5mm; }
  .penutup { margin-bottom: 6mm; }
  .tempat-tanggal { margin-bottom: 7mm; }
  /* Terbilang sampai catatan = satu kesatuan: kalau tidak muat di sisa
     halaman, seluruhnya pindah ke halaman berikutnya -- label "Made by ;"
     tidak pernah terpisah dari kotak tanda tangannya, dan catatan kaki
     tidak pernah menjadi satu-satunya isi sebuah halaman. */
  .penutup-blok { break-inside: avoid; }

  /* table-layout: fixed supaya ketiga kolom benar-benar SAMA LEBAR.
     Tanpa itu lebarnya mengikuti isi, dan kotak dengan jabatan
     terpanjang ("Chief Marketing Officer") merebut ruang dari
     tetangganya -- jaraknya jadi tidak rata. */
  .ttd { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .ttd-cell { width: 33.33%; vertical-align: top; }
  .ttd--empat .ttd-cell { width: 25%; }
  .ttd-label { margin-bottom: 1.5mm; }
  /* Ruang tanda tangan basah. */
  .ttd-ruang { height: 24mm; }
  /* Blok nama+jabatan SEJAJAR DENGAN LABELNYA (rata kiri sel), dan di
     dalamnya keduanya rata tengah satu sama lain. Garis bawah ikut
     selebar namanya saja -- garis yang memanjang sampai tepi kolom
     terbaca seperti garis tabel, bukan garis tanda tangan. */
  .ttd-blok { display: inline-block; text-align: center; }
  .ttd-nama { font-weight: 700; }
  .ttd-nama span { text-decoration: underline; }
  .ttd-jabatan { font-size: 9pt; }

  .catatan { margin-top: 9mm; font-size: 8.5pt; }
  `;
}
