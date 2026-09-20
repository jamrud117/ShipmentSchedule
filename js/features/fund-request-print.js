"use strict";

/* ------------------------------------------------------------------
   FORM PENGAJUAN DANA (Fund Request) — lembar cetak

   Sumber datanya baris nomor dokumen jenis "fund": No. Surat diambil
   dari nomornya sendiri, Subject dari Rincian, sisanya dari payload
   form. Semua nama & jabatan penanda tangan bisa diubah per surat —
   orangnya berganti, dan jabatannya pun tidak selalu sama.
------------------------------------------------------------------ */

const FR_PERUSAHAAN = SJ_PERUSAHAAN;
const FR_LOGO = SJ_LOGO;

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
  return baris.reduce((t, b) => t + (Number(b.nilai) || 0), 0);
}

/* Angka pada surat: "Rp. 6.975.012". Nilai nol dicetak sebagai "-",
   seperti pada berkas rujukan — bukan "Rp. 0", yang terbaca seolah
   memang ada tagihan sebesar nol.

   Mata uang selain rupiah tetap memakai kodenya (USD 1.200): "Rp."
   khusus untuk IDR, bukan awalan untuk semua mata uang. */
function frNilai(n, mataUang) {
  const v = Number(n) || 0;
  if (!v) return "-";
  const kode = (mataUang || "IDR").toUpperCase();
  /* formatRupiah, bukan fmtNum: angka rupiah di lembar ini ditulis
     gaya Indonesia (titik ribuan, koma desimal) supaya cocok dengan
     tagihan aslinya DAN dengan yang terlihat di form. */
  const angka = typeof formatRupiah === "function" ? formatRupiah(v) : fmtNum(v);
  return kode === "IDR" ? `Rp. ${angka}` : `${kode} ${angka}`;
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

/* TIGA PENANDA TANGAN, bukan empat.

   Kotak persetujuan kedua dihapus karena jalur persetujuannya memang
   sudah tidak lewat sana lagi. Pengajuan LAMA yang terlanjur menyimpan
   isian itu TIDAK ikut tercetak: kotak yang tidak akan ditandatangani
   siapa pun lebih menyesatkan daripada tidak ada sama sekali.

   Lebarnya dibagi rata bertiga (33,33% lewat table-layout: fixed di
   CSS), jadi jarak antar tanda tangan sama besar.

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

  const barisHtml = baris
    .map(
      (b, i) => `<tr class="baris-pos">
        <td class="c-no">${i + 1}</td>
        <td class="c-desc">${escapeHtml(b.label)}</td>
        <td class="c-amt">${escapeHtml(frNilai(b.nilai, mataUang))}</td>
      </tr>`,
    )
    .join("");

  // Baris kosong penambal supaya tinggi tabelnya tetap.
  const kosong = Math.max(0, FR_MIN_BARIS - baris.length);
  const kosongHtml = Array.from(
    { length: kosong },
    () => `<tr class="baris-pos"><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-amt"></td></tr>`,
  ).join("");

  return `
  <div class="sheet">
    <div class="kop">
      <img src="${FR_LOGO}" alt="">
      <div class="kop-teks">
        <div class="kop-nama">${escapeHtml(FR_PERUSAHAAN.nama)}</div>
        <div class="kop-alamat">${escapeHtml(FR_PERUSAHAAN.pusat)}</div>
        <div class="kop-alamat">${escapeHtml(FR_PERUSAHAAN.cabang)}</div>
      </div>
    </div>

    <div class="judul">FORM PENGAJUAN DANA</div>

    <table class="meta">
      <tr><td class="meta-k">No Surat</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(row.doc_number || "")}</td></tr>
      <tr><td class="meta-k">Subject</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.notes || "")}</td></tr>
      <tr><td class="meta-k">Lampiran</td><td class="meta-s">:</td><td class="meta-v">${escapeHtml(p.attachment || "1 Set")}</td></tr>
    </table>

    <div class="salam">
      <div>안녕하세요.</div>
    </div>

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
          <th class="c-desc">D E S C R I P T I O N S 정보</th>
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
      </tbody>
      <tfoot>
        <tr>
          <td class="c-total" colspan="2">TOTAL</td>
          <td class="c-amt">${escapeHtml(frNilai(total, mataUang))}</td>
        </tr>
      </tfoot>
    </table>`}

    <div class="terbilang">Terbilang : ${escapeHtml(
      terbilangRupiah(pakaiRinci ? fundLineTotals(p.lines).grandTotal : total),
    )}</div>

    <div class="penutup">
      Thus we convey this letter, for your attention and cooperation,
      we thank you 감사합니다
    </div>

    <div class="tempat-tanggal">Cirebon, ${escapeHtml(frTanggalSurat(row.doc_date))}</div>

    <table class="ttd">
      <tr>
        ${frKotakTtd("Made by ;", p.requester || row.requester, "Drafter")}
        ${frKotakTtd("Checked By ;", p.checkedByName || "M. Rangga", p.checkedByRole || "Accounting")}
        ${frKotakTtd("Approved by :", p.approver1Name || "Mr. Shin Nara", p.approver1Role || "Chief Marketing Officer")}
      </tr>
    </table>

    <div class="catatan">
      <b>Notes (PERHATIAN)</b> : pengajuan dana adalah dokumen tertulis yang
      digunakan untuk meminta dukungan kegiatan, dan menunjukkan dampak positif
      yang dapat dihasilkan finansial dari individu organisasi, atau lembaga
      tertentu. Tujuan utama proposal ini adalah untuk menjelaskan kebutuhan
      dana, menyampaikan rencana.
    </div>
  </div>`;
}

/* Tabel format rinci. Kolomnya mengikuti tagihan forwarder: uraian,
   nilai, PPN, lalu jumlah per baris — supaya angkanya bisa dicocokkan
   baris per baris dengan invoice aslinya saat diperiksa. */
function frTabelRinci(p, mataUang) {
  const daftar = p.lines || [];
  const r = fundLineTotals(daftar);
  const KOLOM = 6;

  const baris = daftar
    .map((b, i) => {
      const nilai = fundLineAmount(b);
      const ppn = fundLinePpn(b);
      const tarif = fundLineRate(b);
      return `<tr class="baris-pos">
        <td class="c-no">${i + 1}</td>
        <td class="c-desc">${escapeHtml(b.desc || "")}</td>
        <td class="c-amt">${escapeHtml(frNilai(nilai, mataUang))}</td>
        <td class="c-rate">${tarif ? tarif + "%" : "-"}</td>
        <td class="c-amt">${escapeHtml(frNilai(ppn, mataUang))}</td>
        <td class="c-amt"></td>
      </tr>`;
    })
    .join("");

  /* Penambal dibatasi: tabel rinci bisa berisi belasan pos, dan
     menambahkan baris kosong di atasnya membuat lembarnya tumbuh
     melewati satu halaman padahal ruangnya masih cukup. */
  const kosong = Math.max(0, 6 - daftar.length);
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
        <td class="c-amt">${escapeHtml(frNilai(r.totalNilai, mataUang))}</td>
        <td class="c-rate"></td>
        <td class="c-amt">${escapeHtml(frNilai(r.totalPpn, mataUang))}</td>
        <td class="c-amt">${escapeHtml(frNilai(r.totalNilai + r.totalPpn, mataUang))}</td>
      </tr>
      <tr class="baris-potongan">
        <td class="c-desc" colspan="4">POTONGAN PPH 23 (${FUND_PPH23_RATE}%)</td>
        <td class="c-amt">${escapeHtml(frNilai(r.pph, mataUang))}</td>
        <td class="c-amt">${
          /* Tanpa potongan, cukup "-" saja. frNilai() sudah menuliskan
             nol sebagai "-", jadi menambahkan tanda minus di depannya
             menghasilkan "- -" yang terbaca seperti salah cetak. */
          r.pph ? "- " + escapeHtml(frNilai(r.pph, mataUang)) : "-"
        }</td>
      </tr>`;

  return `
    <table class="rincian rincian--detail">
      <thead>
        <tr>
          <th class="c-no">NO.</th>
          <th class="c-desc">D E S C R I P T I O N S 정보</th>
          <th class="c-amt">AMOUNT (Rp)</th>
          <th class="c-rate">PPN</th>
          <th class="c-amt">PPN (Rp)</th>
          <th class="c-amt">JUMLAH (Rp)</th>
        </tr>
      </thead>
      <tbody>
        ${frBarisRujukan(p, KOLOM)}
        ${baris}
        ${kosongHtml}
        ${subtotal}
      </tbody>
      <tfoot>
        <tr class="baris-total">
          <td class="c-total" colspan="${KOLOM - 1}">TOTAL</td>
          <td class="c-amt">${escapeHtml(frNilai(r.grandTotal, mataUang))}</td>
        </tr>
      </tfoot>
    </table>`;
}

function cetakFundRequest(rowId) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row) {
    showToast(t("m.data.pengajuan.dana.tidak.ditemukan"), "danger");
    return;
  }
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger");
    return;
  }
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
     Jarak ke tepi kertas pindah ke padding .sheet. */
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
  .sheet { width: 100%; padding: 14mm 15mm; }

  .kop { display: flex; align-items: center; gap: 10px; justify-content: center; }
  .kop img { width: 78px; height: auto; }
  .kop-teks { text-align: center; }
  .kop-nama { font-size: 16pt; font-weight: 700; letter-spacing: .3px; }
  .kop-alamat { font-size: 8pt; line-height: 1.35; }

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
       pada alamat perusahaan. */
    margin: 13mm 0 10mm;
    font-size: 11pt;
  }

  .meta { border-collapse: collapse; margin-bottom: 4mm; }
  .meta-k { width: 90px; padding: 1px 0; vertical-align: top; }
  .meta-s { width: 12px; padding: 1px 0; vertical-align: top; }
  .meta-v { padding: 1px 0 1px 8px; }

  .salam { margin: 4mm 0 13mm; }
  .pembuka { margin-bottom: 3mm; }

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

  /* Hanya garis MENDATAR antar baris pos yang disembunyikan, supaya
     daftar posnya terbaca sebagai satu bidang. Garis tegaknya utuh. */
  .rincian .baris-pos td {
    border-top-color: transparent;
    border-bottom-color: transparent;
  }
  .rincian tbody tr:first-child td { border-top-color: #000; }
  .rincian tbody tr:last-child td { border-bottom-color: #000; }

  /* GARIS PEMBATAS LEBIH TEBAL, dan itu bukan soal tampilan.

     Dengan border-collapse, dua garis yang bertemu di satu batas
     diperebutkan: baris pos memberi garis TRANSPARAN di sisi bawahnya,
     baris TOTAL memberi garis hitam di sisi atasnya. Kalau tebalnya
     sama, peramban boleh memenangkan yang transparan -- dan garis di
     atas TOTAL lenyap. Yang LEBIH TEBAL selalu menang, jadi 1.2px di
     sini mengalahkan 1px milik baris pos. */
  .rincian .baris-rujukan td,
  .rincian .baris-potongan td,
  .rincian .baris-subtotal td,
  .rincian tfoot td { border-top: 1.2px solid #000; }

  .c-desc { text-align: left; }
  .c-total { text-align: right; font-weight: 700; }
  .rincian .baris-subtotal td { font-weight: 700; }
  .rincian tfoot td { font-weight: 700; }

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
     ("Rp. 34.354.345.345") melebarkan kolomnya dan menyempitkan yang
     lain sampai angkanya membungkus.

     Jatah: isi lembar 210mm - 30mm margin = 180mm; 8 + 30x3 + 11 =
     109mm untuk kolom tetap, sisanya (~71mm) untuk uraian. 30mm pada
     8pt memuat sekitar 21 karakter -- cukup untuk "Rp. 34.891.544.405"
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

  /* table-layout: fixed supaya ketiga kolom benar-benar SAMA LEBAR.
     Tanpa itu lebarnya mengikuti isi, dan kotak dengan jabatan
     terpanjang ("Chief Marketing Officer") merebut ruang dari
     tetangganya -- jaraknya jadi tidak rata. */
  .ttd { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .ttd-cell { width: 33.33%; vertical-align: top; }
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
