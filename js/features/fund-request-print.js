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

/* Nama bulan tanggal surat -- bahasa Inggris, seperti isi suratnya. */
const FR_BULAN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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
  return terbilangMataUang(nilai, "IDR");
}

/* TERBILANG MENGIKUTI MATA UANG PENGAJUANNYA. Pengajuan USD dulu tetap
   ditutup "... Rupiah" walau seluruh angkanya USD. Kalimatnya tetap
   bahasa Indonesia (seperti label "Terbilang"-nya); mata uang selain
   rupiah menyebut sen-nya: USD 18,530.50 = "Delapan Belas Ribu Lima Ratus
   Tiga Puluh Dolar Amerika Serikat dan Lima Puluh Sen". Rupiah tetap
   dibulatkan ke rupiah penuh -- surat pengajuan tidak menyebut sen. */
const FR_NAMA_MATA_UANG = {
  IDR: "Rupiah",
  USD: "Dolar Amerika Serikat",
  EUR: "Euro",
  SGD: "Dolar Singapura",
  JPY: "Yen Jepang",
  CNY: "Yuan Tiongkok",
};
function terbilangMataUang(nilai, mataUang) {
  const kode = String(mataUang || "IDR").toUpperCase();
  const kapital = (kata) => kata.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const mutlak = Math.abs(Number(nilai) || 0);
  const utuh = Math.floor(mutlak + 1e-9);
  const sen = kode === "IDR" ? 0 : Math.round((mutlak - utuh) * 100) % 100;
  const teks = `${kapital(terbilang(utuh))} ${FR_NAMA_MATA_UANG[kode] || kode}`;
  return sen ? `${teks} dan ${kapital(terbilang(sen))} Sen` : teks;
}

/* Satuan kolom uang di judul tabel: "(Rp)" untuk rupiah, kodenya untuk
   mata uang lain -- "AMOUNT (USD)", bukan "(Rp)" di atas angka USD. */
function frSatuanKolom(mataUang) {
  const kode = String(mataUang || "IDR").toUpperCase();
  return kode === "IDR" ? "Rp" : kode;
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
  // TOTAL manual (fundSesuaikanManual) ikut: angka Terbilang = GRAND TOTAL surat = yang dibayar
  if (Array.isArray(d.lines) && d.lines.length) return fundTotalsPengajuan(d).grandTotal;
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

   Desimal: TIAP ANGKA berdiri sendiri. Yang punya sen ditulis lengkap dua
   desimal ("58,395,870.78", "8,250.50"); yang bulat ditulis bulat
   ("714,716") -- TIDAK PERNAH ".00", walaupun baris di sebelahnya
   bersen. Aturan lama (satu angka bersen -> semua angka diberi ".00"
   supaya titik desimalnya sejajar) dicabut atas permintaan: ".00" yang
   tidak berarti hanya memenuhi tabel dengan nol. Konsekuensinya angka
   bulat rata kanan apa adanya, jadi titik desimal antar-baris tidak lagi
   sejajar -- sengaja, tanpa spasi tak terlihat sebagai penyejajar.

   Yang tidak berubah dari frNilai(): nol ditulis "-" saja (bukan
   "Rp. 0"), dan mata uang selain rupiah memakai kodenya sendiri (USD).
   Nilai negatif -- baris diskon, potongan PPH -- bertanda minus di sisi
   kiri: "- Rp." lalu angkanya, sama dengan tulisan lamanya "- Rp. 1,000". */
function frSelUang(n, mataUang) {
  const v = Number(n) || 0;
  if (!v) return "-";
  const kode = (mataUang || "IDR").toUpperCase();
  const mutlak = Math.abs(v);
  const angka = formatNilai(mutlak);
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
    ? ["Billing No.", p.billingNo]
    : p.invoiceNo
      ? ["Invoice No.", p.invoiceNo]
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

  // data-fr*: peran angka untuk Ubah teks sebelum cetak (frHitungUlangCetakan)
  const barisHtml = baris
    .map(
      (b, i) => `<tr class="baris-pos" data-fr-baris="pos">
        <td class="c-no">${i + 1}</td>
        <td class="c-desc">${escapeHtml(b.label)}</td>
        <td class="c-amt"${frPeran("nilai", b.nilai)}>${frSelUang(b.nilai, mataUang)}</td>
      </tr>`,
    )
    .join("");

  // Baris kosong penambal supaya tinggi tabelnya tetap.
  const kosong = Math.max(0, FR_MIN_BARIS - baris.length);
  const kosongHtml = Array.from(
    { length: kosong },
    () => `<tr class="baris-pos" data-fr-baris="pos"><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-amt"${frPeranKosong("nilai")}></td></tr>`,
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

    <div class="judul">FUND REQUEST FORM</div>

    <!-- Surat berbahasa Inggris (judul, label, total, catatan) KECUALI
         "Terbilang", yang tetap bahasa Indonesia. -->
    <table class="meta">
      <tr><td class="meta-k">Letter No.</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(row.doc_number || "")}</td></tr>${
        fundPakaiDocNo(p.payee)
          ? `
      <tr><td class="meta-k">Doc No</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.docNo || "")}</td></tr>`
          : ""
      }
      <tr><td class="meta-k">Subject</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.notes || "")}</td></tr>
      <tr><td class="meta-k">Attachment</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.attachment || "1 Set")}</td></tr>
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
          <th class="c-amt">AMOUNT (${frSatuanKolom(mataUang)})</th>
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
          <td class="c-total" colspan="2">GRAND TOTAL</td>
          <td class="c-amt"${frPeran("grand", total)}>${frSelUang(total, mataUang)}</td>
        </tr>
      </tbody>
      ${frKakiTutup(3)}
    </table>`}

    <!-- Terbilang sampai catatan = SATU blok (.penutup-blok): tidak
         pernah terpecah antar halaman. Label "Made by ;" tidak terpisah
         dari nama penanda tangannya, dan catatan kaki tidak tertinggal
         sendirian di halaman berikutnya. -->
    <div class="penutup-blok">
      <div class="terbilang" data-fr="terbilang">Terbilang : ${escapeHtml(
        terbilangMataUang(frTotalPengajuan(p), mataUang),
      )}</div>

      <div class="penutup">
        Thus we convey this letter, for your attention and cooperation,
        we thank you
      </div>

      <div class="tempat-tanggal">Cirebon, ${escapeHtml(frTanggalSurat(row.doc_date))}</div>

      <table class="ttd${frPakaiTtdCfo(p) ? " ttd--empat" : ""}">
        <tr>
          ${frKotakTtd("Made by :", p.requester || row.requester, "Drafter")}
          ${frKotakTtd("Checked by :", p.checkedByName || "M. Rangga", p.checkedByRole || "Accounting")}
          ${frKotakTtd("Approved by :", p.approver1Name || "Mr. Shin Na Ra", p.approver1Role || "Chief Marketing Officer")}
          ${frPakaiTtdCfo(p) ? frKotakTtd("Approved by :", p.cfoName || FR_TTD_CFO.nama, p.cfoRole || FR_TTD_CFO.jabatan) : ""}
        </tr>
      </table>

      <div class="catatan">
        <b>Notes (ATTENTION)</b> : a fund request is a written document used to
        request support for an activity and to show the positive financial impact
        it can bring to an individual, organization, or institution. Its main
        purpose is to explain the funding need and convey the plan.
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

function frBarisPerAwb(p, mataUang, kolom) {
  const bagian = frBagianPerAwb(p);
  if (!bagian.length) return "";
  return `
      <tr class="baris-rujukan"><td class="c-desc" colspan="${kolom}"><b>SHARE PER BL/AWB</b></td></tr>${bagian
        .map(
          (b) => `
      <tr class="baris-awb">
        <td class="c-desc" colspan="${kolom - 1}">${escapeHtml(b.teks)}${b.rata ? " (incl. equal share)" : ""}</td>
        <td class="c-amt">${frSelUang(b.dibayar, mataUang)}</td>
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
  const dokumen = (Array.isArray(p.dokumen) ? p.dokumen : []).filter((d) => d && d.id);
  const r = fundLineTotals(daftar, mataUang, p.payee, dokumen, p.totalManual);
  const KOLOM = 6;
  const uang = (v) => frSelUang(v, mataUang);
  /* TINGKAT JUMLAH, dari kecil ke besar -- supaya tidak ada lima "TOTAL"
     yang berbeda arti: kolom TOTAL = nilai + PPN per baris; SUBTOTAL =
     jumlah per kolom (per dokumen bila lebih dari satu); PPH (2%) =
     potongan PPh 23-nya (cukup "PPH (2%)", baris di bawah SUBTOTAL); TOTAL INVOICE x = yang dibayar untuk satu dokumen;
     GRAND TOTAL = yang dibayar seluruhnya (= Terbilang). */
  const satuan = frSatuanKolom(mataUang);

  const barisPos = (b, i, dokId) => {
    const nilai = nilaiBaris[i];
    const ppn = ppnBaris[i];
    const tarif = fundLineRate(b);
    /* JUMLAH per baris = nilai + PPN baris itu. Kolomnya dulu dibiarkan
       kosong (hanya baris TOTAL yang berisi), dan tabel yang separuh
       kosong terbaca aneh. Dibulatkan ke sen supaya sisa pecahan biner
       (0.1 + 0.2) tidak muncul; baris diskon ikut bertanda minus, baris
       bernilai nol tetap "-". Untuk vendor yang Total PPN-nya dibulatkan
       ke rupiah penuh (PRIME), jumlah per baris memakai PPN per baris
       apa adanya -- sama dengan kolom PPN di sebelahnya. */
    const jumlah = Math.round((nilai + ppn) * 100) / 100;
    return `<tr class="baris-pos" data-fr-baris="pos"${frDok(dokId)}>
        <td class="c-no">${i + 1}</td>
        <td class="c-desc">${escapeHtml(b.desc || "")}</td>
        <td class="c-amt"${frPeran("nilai", nilai)}>${uang(nilai)}</td>
        <td class="c-rate">${tarif ? tarif + "%" : "-"}</td>
        <td class="c-amt"${frPeran("ppn", ppn)}>${uang(ppn)}</td>
        <td class="c-amt"${frPeran("jumlah", jumlah)}>${uang(jumlah)}</td>
      </tr>`;
  };
  /* BEBERAPA DOKUMEN (invoice + invoice / debit note): pos dicetak per
     dokumennya, masing-masing di bawah judul "Nomor Invoice : ..." /
     "Nomor Debit Note : ...". Satu dokumen saja -> bentuk lama, dengan
     satu baris rujukan di atas. */
  const kelompok = [{ id: "", jenis: "invoice", nomor: p.invoiceNo }].concat(dokumen);
  const adaKelompok = new Set(kelompok.map((d) => d.id));
  const judulKelompok = (d) =>
    `<tr class="baris-rujukan"><td class="c-desc" colspan="${KOLOM}"><b>${escapeHtml(d.jenis === "debit" ? "Debit Note No." : "Invoice No.")} : ${escapeHtml(d.nomor || "-")}</b></td></tr>`;
  /* TOTAL PER DOKUMEN, tepat di bawah pos-pos dokumen itu: nilai, PPN
     dan jumlahnya, potongan PPH 23-nya, lalu TOTAL dokumen itu -- supaya
     PPN & PPH 23 invoice pertama dan invoice / debit note kedua bisa
     dicocokkan masing-masing dengan dokumen aslinya. Angkanya dari
     fundLineTotals().perDokumen; TOTAL pengajuan di bawah = jumlah
     TOTAL tiap dokumen. Dokumen tanpa pos tidak diberi baris total. */
  const perDok = new Map((r.perDokumen || []).map((x) => [x.id, x]));
  const totalDokumen = (d) => {
    const x = perDok.get(d.id);
    if (!x) return "";
    const nama = `${d.jenis === "debit" ? "DEBIT NOTE" : "INVOICE"}${String(d.nomor || "").trim() ? " " + String(d.nomor).trim() : ""}`;
    return `
      <tr class="baris-subtotal baris-dok" data-fr-baris="sub"${frDok(d.id)}>
        <td class="c-no"></td>
        <td class="c-desc">SUBTOTAL ${escapeHtml(nama)}</td>
        <td class="c-amt"${frPeran("nilai", x.totalNet)}>${uang(x.totalNet)}</td>
        <td class="c-rate"></td>
        <td class="c-amt"${frPeran("ppn", x.totalPpn)}>${uang(x.totalPpn)}</td>
        <td class="c-amt"${frPeran("jumlah", x.totalNet + x.totalPpn)}>${uang(x.totalNet + x.totalPpn)}</td>
      </tr>
      <tr class="baris-potongan baris-dok" data-fr-baris="pph"${frDok(d.id)}>
        <td class="c-desc" colspan="4">PPH (${FUND_PPH23_RATE}%)</td>
        <td class="c-amt"${frPeran("pph", x.pph)}>${uang(x.pph)}</td>
        <td class="c-amt"${frPeran("pph-neg", -x.pph)}>${uang(-x.pph)}</td>
      </tr>
      <tr class="baris-total-dok baris-dok" data-fr-baris="total"${frDok(d.id)}>
        <td class="c-total" colspan="${KOLOM - 1}">TOTAL ${escapeHtml(nama)}</td>
        <td class="c-amt"${frPeran("total", x.grandTotal)}>${uang(x.grandTotal)}</td>
      </tr>`;
  };
  const baris = dokumen.length
    ? kelompok.map((d) => judulKelompok(d) + daftar
      .map((b, i) => (String(b.dok || "") === d.id || (!d.id && !adaKelompok.has(String(b.dok || ""))) ? barisPos(b, i, d.id) : ""))
      .join("") + totalDokumen(d)).join("")
    : daftar.map((b, i) => barisPos(b, i)).join("");

  /* Penambal dibatasi: tabel rinci bisa berisi belasan pos, dan
     menambahkan baris kosong di atasnya membuat lembarnya tumbuh
     melewati satu halaman padahal ruangnya masih cukup. Judul dan baris
     total per dokumen ikut dihitung sebagai isi. */
  const isiDokumen = dokumen.length ? kelompok.length + 3 * perDok.size : 0;
  const kosong = Math.max(0, 6 - daftar.length - isiDokumen);
  const kosongHtml = Array.from(
    { length: kosong },
    () =>
      `<tr class="baris-pos" data-fr-baris="pos"><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-amt"${frPeranKosong("nilai")}></td><td class="c-rate"></td><td class="c-amt"${frPeranKosong("ppn")}></td><td class="c-amt"${frPeranKosong("jumlah")}></td></tr>`,
  ).join("");

  /* SUBTOTAL & POTONGAN ADA DI BADAN TABEL, bukan di kaki.

     Keduanya masih bagian dari perincian: jumlah per kolom lalu
     pengurangnya. Yang di kaki hanya angka yang benar-benar dibayarkan
     — itulah satu-satunya baris yang perlu dibaca cepat. */
  const subtotal = `
      <tr class="baris-subtotal" data-fr-baris="sub">
        <td class="c-no"></td>
        <td class="c-desc">${dokumen.length ? "SUBTOTAL ALL DOCUMENTS" : "SUBTOTAL"}</td>
        <td class="c-amt"${frPeran("nilai", r.totalNet)}>${uang(r.totalNet)}</td>
        <td class="c-rate"></td>
        <td class="c-amt"${frPeran("ppn", r.totalPpn)}>${uang(r.totalPpn)}</td>
        <td class="c-amt"${frPeran("jumlah", r.totalNet + r.totalPpn)}>${uang(r.totalNet + r.totalPpn)}</td>
      </tr>
      <tr class="baris-potongan" data-fr-baris="pph">
        <td class="c-desc" colspan="4">PPH (${FUND_PPH23_RATE}%)</td>
        <td class="c-amt"${frPeran("pph", r.pph)}>${uang(r.pph)}</td>
        <td class="c-amt"${frPeran("pph-neg", -r.pph)}>${
          /* Tanpa potongan, cukup "-" saja. frSelUang() menuliskan nol
             sebagai "-", jadi tidak ada "- -" yang terbaca seperti salah
             cetak; potongannya sendiri bertanda minus di sisi kiri. */
          uang(-r.pph)
        }</td>
      </tr>${frBarisPerAwb(p, mataUang, KOLOM)}`;

  return `
    <table class="rincian rincian--detail">
      <thead>
        <tr>
          <th class="c-no">NO.</th>
          <th class="c-desc">D E S C R I P T I O N S</th>
          <th class="c-amt">AMOUNT (${satuan})</th>
          <th class="c-rate">PPN (%)</th>
          <th class="c-amt">PPN (${satuan})</th>
          <th class="c-amt">TOTAL (${satuan})</th>
        </tr>
      </thead>
      <tbody>
        ${dokumen.length ? "" : frBarisRujukan(p, KOLOM)}
        ${baris}
        ${kosongHtml}
        ${subtotal}
        <tr class="baris-total">
          <td class="c-total" colspan="${KOLOM - 1}">GRAND TOTAL</td>
          <td class="c-amt"${frPeran("grand", r.grandTotal)}>${uang(r.grandTotal)}</td>
        </tr>
      </tbody>
      ${frKakiTutup(KOLOM)}
    </table>`;
}

/* ---------- UBAH TEKS SEBELUM CETAK (ui/cetak-modal.js) ----------

   Tiap angka di tabel membawa perannya (data-fr) dan nilai awalnya
   (data-fr-v0, persis angka yang tertulis); baris membawa jenisnya
   (data-fr-baris: pos, sub, pph, total) dan dokumennya (data-fr-dok,
   bila lebih dari satu dokumen). Baris kosong penambal ikut berperan
   (bernilai nol), jadi pos yang terlewat bisa diketik di situ.

   Angka yang diubah di pratinjau -- mis. PPN yang selisih Rp1 dengan
   tagihan aslinya -- ikut mengubah angka turunannya, supaya surat tetap
   menjumlah benar:
     TOTAL baris          <- AMOUNT + PPN baris itu
     SUBTOTAL             <- AMOUNT & PPN baris-barisnya (per dokumen; ALL
                             DOCUMENTS dari subtotal tiap dokumen); kolom
                             TOTAL-nya <- AMOUNT + PPN subtotal itu
     potongan PPH         <- PPH di sebelahnya (PPH semua dokumen <- PPH
                             tiap dokumen)
     TOTAL dokumen        <- SUBTOTAL TOTAL - PPH dokumen itu
     GRAND TOTAL          <- SUBTOTAL TOTAL - PPH (format lama: AMOUNT
                             tiap baris)
     Terbilang            <- GRAND TOTAL
   Angka turunan yang diketik langsung (mis. TOTAL satu invoice) juga
   diteruskan selisihnya ke jumlah di atasnya, tanpa terhitung dua kali.

   Turunan = nilai AWALNYA + perubahan sumbernya, bukan dijumlah ulang dari
   nol: pembulatan aturan vendor di angka awal (Total PPN dibulatkan ke
   atas, dsb.) tetap utuh -- angka yang sumbernya tidak berubah tidak ikut
   bergeser. Sel yang diketik sendiri (data-ubah="manual") tidak pernah
   ditimpa; yang ikut berubah ditandai data-ubah="hitung" (biru di layar),
   dan kembali polos bila nilainya kembali seperti semula. PPN & PPH TIDAK
   dihitung ulang dari AMOUNT -- pembulatannya aturan vendor; ketik sendiri
   bila perlu. Data pengajuannya tidak berubah: hanya cetakan ini. */
const frNilaiTampil = (v) => {
  const n = Number(v) || 0;
  return (n < 0 ? -1 : 1) * parseLooseNumber(formatNilai(Math.abs(n)));
};
const frPeran = (peran, v) => ` data-fr="${peran}" data-fr-v0="${frNilaiTampil(v)}"`;
const frPeranKosong = (peran) => ` data-fr="${peran}" data-fr-v0="0" data-fr-kosong=""`;
const frDok = (id) => (id == null ? "" : ` data-fr-dok="${escapeAttr(String(id))}"`);

/* Angka dari teks sel uang: bentuk cetakan ("Rp. 1,000", "- Rp. 1,000",
   "-") maupun yang diketik ("1000", "Rp 1.000", "Rp. -1.000", "(1,000)",
   "Rp 1.000,-", "USD 1,213.71"). */
function frBacaUang(teks) {
  let s = String(teks == null ? "" : teks).replace(/\u00a0/g, " ").trim();
  let negatif = /^\(.*\)$/.test(s);
  s = s.replace(/^\(|\)$/g, "").trim();
  if (/^-/.test(s)) {
    negatif = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/^[A-Za-z]{2,3}\.?/, "").trim();
  if (/^-/.test(s)) {
    negatif = true;
    s = s.slice(1).trim();
  }
  const n = Math.abs(parseLooseNumber(s));
  return negatif && n ? -n : n;
}
/* Teksnya sudah berupa angka utuh (boleh berkode mata uang, minus, ",-" di
   ujung) -- atau kosong / "-" (= nol)? Kelompok ribuan yang belum lengkap
   BELUM dihitung sebagai angka: "Rp. 53,55" sesaat sesudah angka terakhir
   "53,554" dihapus untuk diganti bukan 53.55, jadi totalnya tidak melompat
   jauh selagi diketik. */
function frTeksBerangka(teks) {
  const s = String(teks == null ? "" : teks).replace(/\u00a0/g, " ").trim();
  if (!/\d/.test(s) && !/^-?$/.test(s)) return false;
  if (!/^\(?-?\s*(?:[A-Za-z]{2,3}\.?)?\s*-?\s*[\d.,]*(?:,-|\.-)?\)?$/.test(s)) return false;
  let angka = (s.match(/\d[\d.,]*/) || [""])[0];
  if (/[.,]-\)?$/.test(s)) angka = angka.replace(/[.,]$/, ""); // "Rp 1.000,-"
  if (!angka) return true;
  if (/[.,]$/.test(angka)) return false; // "53," -- masih diketik
  const koma = angka.lastIndexOf(","), titik = angka.lastIndexOf(".");
  if (koma > -1 && titik > -1) {
    // Pemisah yang terakhir = desimal; sebelum itu kelompok ribuan tiga angka
    const bulat = angka.slice(0, Math.max(koma, titik));
    return (koma < titik ? /^\d{1,3}(,\d{3})*$/ : /^\d{1,3}(\.\d{3})*$/).test(bulat);
  }
  if (koma > -1) return /^\d{1,3}(,\d{3})+$/.test(angka);
  if (titik > -1 && angka.indexOf(".") !== titik) return /^\d{1,3}(\.\d{3})+$/.test(angka); // "4.824.659"
  return true;
}

function frHitungUlangCetakan(dok, mataUang) {
  if (!dok) return;
  const sen = (x) => Math.round(x * 100) / 100;
  const awal = (el) => Number(el.getAttribute("data-fr-v0")) || 0;
  const manual = (el) => el.getAttribute("data-ubah") === "manual";
  const harap = new Map(); // sel turunan -> nilai hitungannya
  /* Nilai sekarang: turunan = hasil hitungnya; isian & yang diketik = isinya.
     Teks yang bukan angka (sedang diketik, mis. "Rp") dianggap belum berubah. */
  const kini = (el) => {
    if (!el) return 0;
    if (!manual(el) && harap.has(el)) return harap.get(el);
    return frTeksBerangka(el.textContent) ? frBacaUang(el.textContent) : awal(el);
  };
  const geser = (el) => (el ? kini(el) - awal(el) : 0);
  // Turunan yang diketik langsung: selisihnya dengan hasil hitungannya
  const selisih = (el) => (el && manual(el) && harap.has(el) ? kini(el) - harap.get(el) : 0);
  const turunan = (el, perubahan) => {
    if (!el) return;
    const v = sen(awal(el) + perubahan);
    harap.set(el, v);
    if (manual(el)) return;
    if (v === awal(el)) {
      if (el.hasAttribute("data-ubah")) {
        el.innerHTML = el.hasAttribute("data-fr-kosong") ? "" : frSelUang(v, mataUang);
        el.removeAttribute("data-ubah");
      }
      return;
    }
    const isi = frSelUang(v, mataUang);
    if (el.innerHTML !== isi) el.innerHTML = isi;
    el.setAttribute("data-ubah", "hitung");
  };
  const sel = (tr, peran) => (tr ? tr.querySelector(`[data-fr="${peran}"]`) : null);
  const kolom = (daftar, peran) => daftar.map((tr) => sel(tr, peran));
  const jumlahGeser = (sels) => sels.reduce((s, el) => s + geser(el), 0);
  const jumlahSelisih = (sels) => sels.reduce((s, el) => s + selisih(el), 0);
  const baris = (jenis) => Array.from(dok.querySelectorAll(`tr[data-fr-baris="${jenis}"]`));
  const dokDari = (tr) => tr.getAttribute("data-fr-dok"); // null = di luar dokumen mana pun
  // Satu baris SUBTOTAL dari baris-baris di bawahnya (+ TOTAL anak yang diketik langsung)
  const subtotal = (tr, anak) => {
    if (!tr) return;
    turunan(sel(tr, "nilai"), jumlahGeser(kolom(anak, "nilai")));
    turunan(sel(tr, "ppn"), jumlahGeser(kolom(anak, "ppn")));
    turunan(sel(tr, "jumlah"), geser(sel(tr, "nilai")) + geser(sel(tr, "ppn")) + jumlahSelisih(kolom(anak, "jumlah")));
  };
  const potongan = (tr) => {
    if (tr) turunan(sel(tr, "pph-neg"), -geser(sel(tr, "pph")));
  };

  const pos = baris("pos");
  pos.forEach((tr) => turunan(sel(tr, "jumlah"), geser(sel(tr, "nilai")) + geser(sel(tr, "ppn"))));
  const subDok = baris("sub").filter((tr) => dokDari(tr) != null);
  const pphDok = baris("pph").filter((tr) => dokDari(tr) != null);
  const totalDok = baris("total");
  subDok.forEach((sub) => {
    const id = dokDari(sub);
    const pph = pphDok.find((tr) => dokDari(tr) === id);
    subtotal(sub, pos.filter((tr) => dokDari(tr) === id));
    potongan(pph);
    turunan(sel(totalDok.find((tr) => dokDari(tr) === id), "total"), geser(sel(sub, "jumlah")) - geser(sel(pph, "pph")));
  });
  const adaSub = new Set(subDok.map(dokDari));
  const lepas = pos.filter((tr) => !adaSub.has(dokDari(tr))); // tanpa SUBTOTAL dokumen (format satu dokumen, baris penambal)
  const subSemua = baris("sub").find((tr) => dokDari(tr) == null);
  const pphSemua = baris("pph").find((tr) => dokDari(tr) == null);
  subtotal(subSemua, subDok.concat(lepas));
  if (pphSemua && pphDok.length) turunan(sel(pphSemua, "pph"), jumlahGeser(kolom(pphDok, "pph")));
  potongan(pphSemua);
  const grand = dok.querySelector('[data-fr="grand"]');
  turunan(
    grand,
    subSemua
      ? geser(sel(subSemua, "jumlah")) - geser(sel(pphSemua, "pph")) + jumlahSelisih(kolom(totalDok, "total"))
      : jumlahGeser(kolom(pos, "nilai")),
  );
  // Terbilang mengikuti GRAND TOTAL -- kecuali kalimatnya diketik sendiri
  const kata = dok.querySelector('[data-fr="terbilang"]');
  if (kata && grand && !manual(kata)) {
    const v = kini(grand);
    const teks = `Terbilang : ${terbilangMataUang(v, mataUang)}`;
    if (kata.textContent !== teks) kata.textContent = teks;
    if (v === awal(grand)) kata.removeAttribute("data-ubah");
    else kata.setAttribute("data-ubah", "hitung");
  }
}

/* Sebelum mencetak: angka yang diketik ditulis ulang dalam bentuk sel
   uang biasa ("Rp." di kiri, angka di kanan, ribuan berkoma) -- mis.
   "4936171" menjadi "Rp. 4,936,171". Teks yang bukan angka dan sel yang
   dikosongkan dibiarkan apa adanya. */
function frRapikanUangCetakan(dok, mataUang) {
  if (!dok) return;
  dok.querySelectorAll('[data-fr][data-ubah="manual"]').forEach((el) => {
    const teks = String(el.textContent || "").replace(/\u00a0/g, " ").trim();
    if (el.getAttribute("data-fr") === "terbilang" || !teks || !frTeksBerangka(teks)) return;
    const baru = frSelUang(frBacaUang(teks), mataUang);
    if (el.innerHTML !== baru) el.innerHTML = baru;
  });
}

/* Tombol cetak di riwayat: surat tampil sebagai pratinjau di kotak cetak
   aplikasi (ui/cetak-modal.js), lalu dicetak dari situ -- tidak ada jendela
   kedua yang harus ditutup terpisah dari dialog cetak peramban. */
async function cetakFundRequest(rowId) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row) {
    showToast(t("m.data.pengajuan.dana.tidak.ditemukan"), "danger");
    return;
  }
  const nomor = row.doc_number || "";
  const mataUang = (row.payload || {}).currency || "IDR";
  return bukaModalCetak({
    jenis: tt("Form Pengajuan Dana", "Fund Request Form"),
    nomor,
    judulBerkas: `Form Pengajuan Dana ${nomor}`,
    // Ubah teks sebelum cetak: angka turunan & Terbilang ikut menyesuaikan
    ubah: {
      diubah: (dok) => frHitungUlangCetakan(dok, mataUang),
      rapikan: (dok) => frRapikanUangCetakan(dok, mataUang),
      petunjuk: tt(
        "Angka yang diubah ikut menghitung ulang SUBTOTAL, TOTAL, GRAND TOTAL & Terbilang (biru). PPN & PPH tidak dihitung ulang dari AMOUNT.",
        "Changed amounts also update SUBTOTAL, TOTAL, GRAND TOTAL & Terbilang (blue). PPN & PPH are not recalculated from AMOUNT.",
      ),
    },
    muat: async () => {
      /* Baris Doc No bergantung pada aturan vendor (fund-docno.js) yang
         dimuat saat halaman dibuka: ditunggu dulu, supaya surat yang
         dicetak sesaat setelah halaman tampil tidak memakai aturan lama.
         Kotaknya sudah tampil selagi menunggu. */
      await fundDocNoSiap();
      return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Form Pengajuan Dana ${escapeHtml(nomor)}</title>
<style>${fundRequestCss()}</style></head>
<body>${buildFundRequestHtml(row)}</body></html>`;
    },
  });
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
  .rincian .baris-total td,
  .rincian .baris-total-dok td { font-weight: 700; }

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
  .rincian .baris-total-dok,
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

     Jatah: isi lembar 210mm - 30mm margin = 180mm; 8 + 30x3 + 16 =
     114mm untuk kolom tetap, sisanya (~66mm) untuk uraian. 30mm pada
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
  /* "PPN (%)" muat sebaris di judulnya (dulu "PPN" saja, 11mm) --
     diukur di Chrome dengan huruf tebal 8pt, tanpa meluber ke kolom
     sebelahnya. */
  .rincian--detail .c-rate { width: 16mm; white-space: nowrap; }

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
