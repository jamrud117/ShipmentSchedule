"use strict";

/* ==================================================================
   CETAK PO & PR -- satu tombol printer di riwayat PO & PR

   Pratinjau cetak (bukaModalCetak, ui/cetak-modal.js) dengan pilihan
   bergeser PO | PR di kepalanya (opsi `varian`): satu pengajuan membawa
   dua dokumen, keduanya dicetak dari kotak yang sama.

   KEDUA LEMBAR A4 TEGAK. Margin atas & bawah 25,4 mm ("Normal"), kiri &
   kanan 12,7 mm ("Narrow") -- bidang cetak selebar 184,6 mm, cukup untuk
   huruf yang sedikit lebih besar (lebih jelas) tanpa sisi kertas yang
   lapang kosong. Isinya PENUH selebar & setinggi bidang cetak: bingkainya
   selalu sampai ke margin bawah -- bagian yang lentur (ruang kosong tabel
   barang PO, kotak Catatan PR) yang memanjang, bukan lembar yang berhenti
   di tengah kertas. Margin kertas (@page) nol supaya kop & kaki bawaan
   peramban tidak ikut tercetak; jaraknya ditanggung tabel .halaman yang
   kepala & kakinya berulang di tiap halaman (sama dengan Form Pengajuan
   Dana), jadi PO berbarang banyak yang berlanjut ke halaman 2 tetap
   bermargin.

   PO (dirancang ulang dari PO Purchasing): KEPALA DOKUMEN di dalam
   bingkai -- perusahaan (logo, nama, alamat; rata kiri, bukan kop surat
   yang di tengah) | judul PURCHASE ORDER + PO No. & PO Date --, kotak
   Shipper / Seller (ATTN & telepon sebaris) + syarat, Consignee / Buyer +
   Notify Party & Remarks, baris pengiriman (semua garis tengahnya segaris,
   58 : 42), tabel barang (Qty BERSATUAN satu kolom "1 SET" -- isiannya
   tetap dua kotak Qty & Unit; Unit Price & Amount) yang garis kolomnya
   memanjang LURUS sampai TOTAL, SAY (jumlah dalam kata, bahasa
   Indonesia), Doc No Groupware -- bawaan DST-<YYMM>-0000 bila belum diisi
   (poDocNoCetak) -- dan kotak Signed by SETINGGI 50 mm: cukup untuk tanda
   tangan + cap perusahaan tanpa terpotong.

   PR (Formulir Pengajuan Pembelian CF-702-03, seperti aslinya): kolom
   Satuan TIDAK ADA -- QTY dicetak bersama satuannya ("1 SET"; di form
   dua kotak seperti PO); NO hanya untuk baris berisi; baris yang
   seluruhnya kosong tidak diberi "-" (sel kosong di baris berisi tetap
   "-", seperti formulir aslinya). Paling sedikit 10 baris supaya bentuk
   formulirnya tetap.
================================================================== */

// Margin kertas (mm): atas & bawah "Normal", kiri & kanan "Narrow" -- lihat kepala berkas
const PO_MARGIN_TEGAK = 25.4;
const PO_MARGIN_SISI = 12.7;
const PR_MIN_BARIS = 10;
/* Lebar kolom tabel = PERBANDINGAN (poPersen), bukan mm mutlak. PO:
   No | Product | Spec / Model | Qty ("1 SET") | Unit Price | Amount | Catatan
   = 184,6 mm; Amount cukup untuk "USD 1,234,567.89" tebal. */
const PO_KOLOM_MM = [9, 40, 33, 19, 27, 30, 26.6];
// Pemasok paling lebar: nama supplier luar negeri panjang ("Qingdao Jiasong Machinery Technology")
const PR_KOLOM_MM = [9, 27, 22, 14, 18, 19, 36, 14.2];
const PO_BULAN_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PO_TANPA_SEN = new Set(["IDR", "JPY", "KRW"]);
/* Alamat kantor pusat di kepala PO, DUA BARIS persis: jalan & desa |
   kecamatan, kabupaten, provinsi & kode pos. Kop surat lain (Surat Jalan,
   Form Pengajuan Dana, ...) tetap memakai SJ_PERUSAHAAN. */
const PO_ALAMAT_PUSAT = ["JL. Mayjend Sutoyo No. 1 Pabedilan Kulon,", "Pabedilan, Kabupaten Cirebon, Jawa Barat 45193"];

const poCetakTeks = (v) => escapeHtml(String(v == null ? "" : v).trim());
// Teks banyak baris (alamat): baris baru tetap baris baru
const poCetakBaris = (v) => poCetakTeks(v).replace(/\r?\n/g, "<br>");

function poTglInggris(iso) {
  const d = parseLocalDate(iso);
  return d ? `${PO_BULAN_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "";
}
function poTglPr(iso) {
  const d = parseLocalDate(iso);
  const p2 = (n) => String(n).padStart(2, "0");
  return d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}

// Uang di PO: dua desimal tetap (kecuali IDR / JPY / KRW) -- rapi sejajar di kolomnya
function poUangCetak(n, mata) {
  const desimal = PO_TANPA_SEN.has(mata) ? 0 : 2;
  return angkaLokal(Number(n) || 0, "en-US", { minimumFractionDigits: desimal, maximumFractionDigits: desimal });
}

/* SAY: jumlah dalam kata BAHASA INDONESIA, huruf besar -- terbilang yang
   sama dengan Form Pengajuan Dana (terbilangMataUang, fund-request-print.js):
   IDR 9.000.000 -> "SEMBILAN JUTA RUPIAH"; USD 7,500.50 -> "TUJUH RIBU LIMA
   RATUS DOLAR AMERIKA SERIKAT DAN LIMA PULUH SEN". Mata uang tanpa sen
   (IDR / JPY / KRW) dibulatkan seperti angka TOTAL-nya. */
function poSay(n, mata) {
  const total = Math.round((Number(n) || 0) * 100) / 100;
  if (total <= 0) return "";
  return terbilangMataUang(PO_TANPA_SEN.has(mata) ? Math.round(total) : total, mata).toUpperCase();
}

/* ---------- data ---------- */

// Barang PO yang dicetak: daftar PO, atau -- PO yang belum dilengkapi -- turunan PR-nya
function poBarangCetak(p) {
  const po = poBarisBersih("po", p.poItems);
  return po.length ? po : poDariPr(p.prItems, p.prMataUang, p.currency || "USD");
}

const poPerusahaan = () => ({
  nama: "PT. DYNAMIC DESIGN INDONESIA",
  pusat: PO_ALAMAT_PUSAT,
  cabang: String(SJ_PERUSAHAAN.cabang).replace(/^\s*cabang\s*:\s*/i, ""),
});

/* ---------- PO ---------- */

/* Lebar kolom dalam PERSEN dari jumlahnya: tabel selebar bingkai (dikurangi
   garis bingkainya) dan ruang lentur di bawahnya membagi lebar yang sama
   persis, jadi garis kolomnya segaris. */
const poPersen = (lebar, mm) => `${((mm / lebar.reduce((a, b) => a + b, 0)) * 100).toFixed(3)}%`;
function poColgroup(lebar) {
  return `<colgroup>${lebar.map((mm) => `<col style="width:${poPersen(lebar, mm)}">`).join("")}</colgroup>`;
}

function buildPoHtml(row) {
  const p = row.payload || {};
  const mata = p.currency || "USD";
  const barang = poBarangCetak(p);
  const total = poTotal("po", barang);
  const usaha = poPerusahaan();
  const ada = (v) => String(v == null ? "" : v).trim() !== "";
  const blokPihak = (judul, nama, alamat, attn, tel) => {
    /* ATTN & TEL SEBARIS -- turun ke baris berikutnya hanya bila tidak muat.
       Label telepon kedua pihak sama: "TEL", seperti di form-nya. */
    const kontak = [ada(attn) ? `<span>ATTN : ${poCetakTeks(attn)}</span>` : "", ada(tel) ? `<span>TEL : ${poCetakTeks(tel)}</span>` : ""].filter(Boolean);
    return `
      <div class="po-label">${judul}</div>
      ${ada(nama) ? `<div class="po-pihak-nama">${poCetakTeks(nama)}</div>` : ""}
      ${ada(alamat) ? `<div>${poCetakBaris(alamat)}</div>` : ""}
      ${kontak.length ? `<div class="po-kontak">${kontak.join("")}</div>` : ""}`;
  };
  const kv = (k, v) => `<tr><th>${k}</th><td>${poCetakBaris(v) || "&nbsp;"}</td></tr>`;
  const barisBarang = barang
    .map((b, i) => {
      const jumlah = poJumlahBaris("po", b);
      return `<tr>
        <td class="po-c">${i + 1}</td>
        <td>${poCetakTeks(b.produk)}</td>
        <td class="po-c">${poCetakTeks(b.spek)}</td>
        <td class="po-c">${poCetakTeks(poQtyTeks(b))}</td>
        <td class="po-r">${b.harga ? poCetakTeks(poUangCetak(b.harga, mata)) : ""}</td>
        <td class="po-r">${jumlah ? poCetakTeks(poUangCetak(jumlah, mata)) : ""}</td>
        <td>${poCetakTeks(b.catatan)}</td>
      </tr>`;
    })
    .join("");
  const say = poSay(total, mata);
  return `
  <table class="halaman"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="lembar po">
    <div class="po-bingkai">
      <!-- Kepala DOKUMEN di dalam bingkai (bukan kop surat): perusahaan | judul +
           nomor & tanggal PO. Garis tengahnya segaris dengan kotak di bawahnya. -->
      <div class="po-kepala">
        <div class="po-kepala-usaha">
          <img src="${SJ_LOGO}" alt="">
          <div>
            <div class="po-kop-nama">${poCetakTeks(usaha.nama)}</div>
            <div class="po-kop-alamat"><b>Headquarters :</b> ${usaha.pusat.map(poCetakTeks).join("<br>")}</div>
            <div class="po-kop-alamat"><b>Branch Office :</b> ${poCetakTeks(usaha.cabang)}</div>
          </div>
        </div>
        <div class="po-kepala-dok">
          <div class="po-kop-judul">PURCHASE ORDER</div>
          <table class="po-kop-kv">
            <tr><th>PO No.</th><td>${poCetakTeks(row.doc_number) || "&nbsp;"}</td></tr>
            <tr><th>PO Date</th><td>${poCetakTeks(poTglInggris(row.doc_date)) || "&nbsp;"}</td></tr>
          </table>
        </div>
      </div>
      <div class="po-kisi">
        <div class="po-sel">${blokPihak("Shipper / Seller", p.poPenjualNama, p.poPenjualAlamat, p.poPenjualAttn, p.poPenjualTel)}</div>
        <div class="po-sel po-sel--kv">
          <table class="po-kv">
            ${kv("Delivery", p.poDelivery)}
            ${kv("Payment Term", p.poPayment)}
            ${kv("Currency", mata)}
            ${ada(p.prNo) ? kv("PR No.", p.prNo) : ""}
          </table>
        </div>
        <div class="po-sel">${blokPihak("Consignee / Buyer", p.poPembeliNama, p.poPembeliAlamat, p.poPembeliAttn, p.poPembeliTel)}</div>
        <!-- Notify Party | Remarks: dua bagian bergaris pemisah, berbagi tinggi kotaknya -->
        <div class="po-sel po-sel--dua">
          <div class="po-sub">
            <div class="po-label">Notify Party</div>
            <div class="po-isi-bebas">${poCetakBaris(p.poNotify) || "&nbsp;"}</div>
          </div>
          <div class="po-sub">
            <div class="po-label">Remarks</div>
            <div class="po-isi-bebas">${poCetakBaris(p.poRemarks) || "&nbsp;"}</div>
          </div>
        </div>
      </div>
      <div class="po-kirim-wadah">
        <table class="po-kirim">
          <tr><th>Port of Loading</th><th>Carrier</th><th>Shipment</th><th>Final Destination</th></tr>
          <tr><td>${poCetakTeks(p.poPortLoading) || "&nbsp;"}</td><td>${poCetakTeks(p.poCarrier)}</td><td>${poCetakTeks(p.poShipment)}</td><td>${poCetakTeks(p.poFinalDest)}</td></tr>
        </table>
      </div>
      <div class="po-barang">
        <table class="po-tabel">
          ${poColgroup(PO_KOLOM_MM)}
          <thead><tr>
            <th>No</th><th>Product</th><th>Spec / Model</th><th>Qty</th>
            <th>Unit Price</th><th>Amount</th><th>Catatan</th>
          </tr></thead>
          <tbody>${barisBarang}</tbody>
        </table>
        <!-- Garis kolom memanjang sampai TOTAL: ruang lentur berisi TABEL berkolom
             & bergaris sama persis dengan tabel barang, jadi garisnya menyambung
             lurus. Dulu deretan span: garisnya di tepi kiri tiap span, sedangkan
             garis tabel berpusat di batas kolom -- bergeser setengah tebal garis
             dan tampak bengkok tepat di bawah baris barang terakhir. -->
        <div class="po-pengisi" aria-hidden="true">
          <table class="po-tabel po-tabel--sisa">${poColgroup(PO_KOLOM_MM)}<tr>${"<td></td>".repeat(PO_KOLOM_MM.length)}</tr></table>
        </div>
        <div class="po-total-wadah">
          <table class="po-tabel po-tabel--total">
            ${poColgroup(PO_KOLOM_MM)}
            <tr>
              <td colspan="4" class="po-say">${say ? `<b>SAY :</b> ${poCetakTeks(say)}` : ""}</td>
              <th>TOTAL</th>
              <td class="po-r po-total">${total ? `${poCetakTeks(mata)} ${poCetakTeks(poUangCetak(total, mata))}` : ""}</td>
              <td></td>
            </tr>
          </table>
        </div>
      </div>
      <div class="po-kaki">
        <div class="po-docno">
          <div class="po-label">Doc No</div>
          <div class="po-docno-nilai">${poCetakTeks(poDocNoCetak(p, row.doc_date))}</div>
        </div>
        <div class="po-ttd">
          <div class="po-label">Signed by</div>
          <div class="po-ttd-ruang"></div>
          <div class="po-ttd-nama">${poCetakTeks(p.poTtdNama)}</div>
          <div class="po-ttd-jabatan">${poCetakTeks(p.poTtdJabatan)}</div>
        </div>
      </div>
    </div>
  </div>
  </td></tr></tbody></table>`;
}

/* ---------- PR ---------- */

function buildPrHtml(row) {
  const p = row.payload || {};
  const mata = p.prMataUang || "IDR";
  const barang = poBarisBersih("pr", p.prItems);
  const totalHarga = poTotal("pr", barang);
  const strip = (v) => poCetakTeks(v) || "-";
  // Angka saja di sel -- mata uangnya di judul kolom (sel sempit tidak terpecah dua baris)
  const uang = (n) => (n ? poCetakTeks(formatNilai(n)) : "-");
  const baris = barang.map(
    (b, i) => `<tr>
      <td class="po-c">${i + 1}</td>
      <td class="po-c">${strip(b.nama)}</td>
      <td class="po-c">${strip(b.spek)}</td>
      <td class="po-c">${strip(poQtyTeks(b))}</td>
      <td class="po-c">${uang(poAngka(b.harga))}</td>
      <td class="po-c">${uang(poJumlahBaris("pr", b))}</td>
      <td class="po-c pr-pemasok">${strip(b.pemasok)}</td>
      <td class="po-c">${strip(b.catatan)}</td>
    </tr>`,
  );
  // Baris pengisi sampai 10: TANPA nomor dan tanpa "-" -- kosong sama sekali
  for (let i = barang.length; i < PR_MIN_BARIS; i++) baris.push(`<tr class="pr-kosong">${"<td></td>".repeat(PR_KOLOM_MM.length)}</tr>`);
  const tglIsi = (iso) => poTglPr(iso) || "-";
  const setuju = (nama, tgl) => `<td class="pr-ttd">${nama ? `<div>${poCetakTeks(nama)}</div>` : ""}${tgl ? `<div>${poCetakTeks(tgl)}</div>` : ""}</td>`;
  const info = (k1, v1, k2, v2) => `<tr><th>${k1}</th><td>${v1}</td><th>${k2}</th><td>${v2}</td></tr>`;
  const pemohon = [
    ["Tanggal Permintaan", poTglPr(p.prTanggal)],
    ["Nama Departemen", p.prDepartemen],
    ["Kepala Departemen", p.prKepalaDept],
    ["Penanggung Jawab", p.prPenanggungJawab],
  ];
  return `
  <table class="halaman"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="lembar pr">
    <div class="pr-bingkai">
      <div class="pr-bagian"><table class="pr-kepala">
        ${poColgroup([29.2, 52, 6, 18, 18, 18, 18])}
        <tr>
          <td rowspan="2" class="pr-logo"><img src="${SJ_LOGO}" alt=""><div>PT dynamic design Indonesia</div></td>
          <td rowspan="2" class="pr-judul">Formulir Pengajuan<br>Pembelian</td>
          <td rowspan="2" class="pr-persetujuan"><span>Persetujuan</span></td>
          <th>Disusun</th><th>Disesuaikan</th><th>Diperiksa</th><th>Disetujui</th>
        </tr>
        <tr>${setuju(p.prDisusun, poTglPr(p.prDisusunTgl))}${setuju(p.prDisesuaikan)}${setuju(p.prDiperiksa)}${setuju(p.prDisetujui)}</tr>
      </table></div>
      <div class="pr-bagian"><table class="pr-info">
        ${poColgroup([29.2, 52, 30, 48])}
        ${info("No. Pembelian", strip(p.prNo), "Pemasok/Supplier", strip(p.prPemasok))}
        ${info("Nama Produk", strip(p.prProduk), "Tgl. Permintaan Barang Masuk", tglIsi(p.prTglMasuk))}
        ${info("Tgl. Permintaan Pengiriman", tglIsi(p.prTglKirim), "Tenggat Waktu", strip(p.prTenggat))}
        ${info("Tujuan Penggunaan", strip(p.prTujuan), "Kategori Barang", strip(p.prKategori))}
      </table></div>
      <table class="pr-tabel">
        ${poColgroup(PR_KOLOM_MM)}
        <thead><tr>
          <th>NO</th><th>Nama Produk</th><th>Spesifikasi</th><th>QTY</th><th>Perkiraan Harga Satuan${totalHarga ? ` (${poCetakTeks(mata)})` : ""}</th>
          <th>Perkiraan Jumlah Harga${totalHarga ? ` (${poCetakTeks(mata)})` : ""}</th><th>Pemasok/Supplier</th><th>Catatan</th>
        </tr></thead>
        <tbody>${baris.join("")}</tbody>
        <tfoot><tr><th colspan="2">※ Total Harga</th><td colspan="6" class="po-c">${totalHarga ? poCetakTeks(`${mata} ${formatNilai(totalHarga)}`) : "-"}</td></tr></tfoot>
      </table>
      <div class="pr-pernyataan">
        <p>Dengan ini kami mengajukan permohonan pembelian sesuai dengan rincian tersebut di atas.</p>
        <table class="pr-pemohon">${pemohon.map(([k, v]) => `<tr><th>${k}</th><td>: ${poCetakTeks(v) || "-"}</td></tr>`).join("")}</table>
      </div>
      <div class="pr-catatan">
        <b>Catatan</b>
        <div>${poCetakBaris(p.prCatatan)}</div>
      </div>
    </div>
    <footer class="pr-kaki">
      <div>CF-702-03 REV: 0<br>Classified as Confidential</div>
      <div class="pr-kaki-pt">PT Dynamic Design Indonesia</div>
    </footer>
  </div>
  </td></tr></tbody></table>`;
}

/* ---------- gaya ---------- */

function poCetakCss() {
  const tegak = PO_MARGIN_TEGAK;
  const sisi = PO_MARGIN_SISI;
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 10pt; }
  /* Margin berulang di tiap halaman: kepala & kaki tabel kosong setinggi
     margin atas & bawah, kiri-kanan di sel badannya (lihat kepala berkas). */
  .halaman { width: 100%; border-collapse: collapse; }
  .halaman > thead > tr > td { height: ${tegak}mm; padding: 0; }
  .halaman > tfoot > tr > td { height: ${tegak}mm; padding: 0; }
  .halaman > tbody > tr > td { padding: 0 ${sisi}mm; vertical-align: top; }
  /* Satu bidang cetak penuh (297 - 2 x margin atas/bawah; 1 mm cadangan pembulatan) */
  .lembar { display: flex; flex-direction: column; min-height: ${(297 - 2 * tegak - 1).toFixed(1)}mm; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 0; }
  .po-c { text-align: center; }
  .po-r { text-align: right; }

  /* ===== PO ===== */
  /* Kepala dokumen DI DALAM bingkai -- perusahaan (logo + nama + alamat, rata kiri) |
     judul PURCHASE ORDER + PO No. & PO Date. Pembagiannya 58 : 42, sama dengan kotak
     di bawahnya (pihak beralamat panjang di kiri), jadi garis tengahnya segaris. */
  .po-kepala, .po-kisi { display: grid; grid-template-columns: minmax(0, 58fr) minmax(0, 42fr); }
  .po-kepala { border-bottom: .35mm solid #000; }
  .po-kepala-usaha { display: flex; align-items: center; gap: 3.5mm; padding: 3mm 3mm 3mm 2.5mm; border-right: .25mm solid #000; }
  .po-kepala-usaha img { flex: none; height: 16mm; width: auto; }
  .po-kop-nama { font-size: 12pt; font-weight: 700; letter-spacing: .1px; line-height: 1.15; margin-bottom: 1.2mm; white-space: nowrap; }
  /* text-wrap: pretty -- baris terakhir alamat tidak tersisa satu kata ("Kota / Bandung") */
  .po-kop-alamat { font-size: 7.8pt; line-height: 1.4; color: #333; text-wrap: pretty; }
  .po-kop-alamat b { color: #000; }
  .po-kepala-dok { display: flex; flex-direction: column; justify-content: center; padding: 2.5mm 3mm;
    background: #eef1f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .po-kop-judul { font-size: 17pt; font-weight: 700; letter-spacing: 1.5px; line-height: 1; text-align: center; margin-bottom: 2.5mm; }
  /* Label kecil & isinya segaris dasar (bukan rata atas) */
  .po-kop-kv th { width: 21mm; padding: .7mm 0; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .3px; color: #333; vertical-align: baseline; }
  .po-kop-kv td { padding: .7mm 0; font-size: 10.5pt; font-weight: 700; white-space: nowrap; vertical-align: baseline; }
  /* Bingkai luar tebal; tabel di dalamnya hanya menggambar garis DALAM
     (border-style: hidden memadamkan garis tepinya) -- garis pemisah
     antarbagian datang dari pembungkusnya, jadi tidak ada garis dobel. */
  .po-bingkai { flex: 1 1 auto; display: flex; flex-direction: column; border: .35mm solid #000; }
  .po-bingkai table { border-style: hidden; }
  .po-sel { padding: 2mm 2.5mm; border-bottom: .25mm solid #000; line-height: 1.4; min-height: 24mm; overflow-wrap: anywhere; }
  .po-sel:nth-child(odd) { border-right: .25mm solid #000; }
  .po-label { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; color: #333; margin-bottom: .8mm; }
  .po-sel--dua { display: flex; flex-direction: column; padding: 0; }
  .po-sub { flex: 1 1 0; padding: 2mm 2.5mm; }
  .po-sub + .po-sub { border-top: .25mm solid #000; }
  .po-pihak-nama { font-weight: 700; }
  /* ATTN & telepon sebaris; yang tidak muat turun utuh ke baris berikutnya */
  .po-kontak { display: flex; flex-wrap: wrap; column-gap: 6mm; }
  .po-sel--kv { padding: 1.5mm 2.5mm; }
  .po-kv th { width: 30mm; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .3px; color: #333; padding: .9mm 0; vertical-align: baseline; }
  .po-kv td { padding: .9mm 0; font-weight: 700; vertical-align: baseline; }
  .po-kirim-wadah { border-bottom: .25mm solid #000; }
  /* 29 + 29 | 21 + 21: garis tengahnya di 58%, segaris dengan kotak di atasnya */
  .po-kirim { table-layout: fixed; }
  .po-kirim th, .po-kirim td { width: 29%; padding: 1.2mm 2.5mm; text-align: left; border-left: .25mm solid #000; }
  .po-kirim :is(th, td):nth-child(n + 3) { width: 21%; }
  .po-kirim th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .3px; color: #333; padding-bottom: 0; }
  .po-kirim td { padding-top: .5mm; }
  /* Tabel barang + ruang lentur + TOTAL: bagian yang memanjang sampai margin bawah */
  .po-barang { flex: 1 1 auto; display: flex; flex-direction: column; }
  .po-tabel { table-layout: fixed; }
  .po-tabel th { font-size: 9pt; font-weight: 700; padding: 1.5mm 1mm; border: .25mm solid #000;
    background: #eef1f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .po-tabel th span { font-weight: 400; font-size: 8pt; }
  .po-tabel td { padding: 1.6mm 1.2mm; border-left: .25mm solid #000; border-right: .25mm solid #000; vertical-align: middle; overflow-wrap: anywhere; }
  .po-tabel tbody tr + tr td { border-top: .15mm solid #9aa3ad; }
  /* Ruang lentur: tabel berkolom sama (.po-tabel--sisa) setinggi sisa ruangnya --
     garis kolomnya dihitung persis seperti tabel barang di atasnya */
  .po-pengisi { flex: 1 1 auto; position: relative; min-height: 4mm; }
  .po-tabel--sisa { position: absolute; inset: 0; height: 100%; }
  .po-total-wadah { border-top: .35mm solid #000; }
  .po-tabel--total td, .po-tabel--total th { padding: 2mm 1.2mm; }
  .po-tabel--total th { background: none; font-size: 10pt; border-top: 0; border-bottom: 0; }
  .po-say { font-size: 8.5pt; line-height: 1.35; text-align: left; }
  .po-total { font-weight: 700; white-space: nowrap; }
  .po-kaki { display: flex; border-top: .35mm solid #000; }
  .po-docno { flex: 1; padding: 2.5mm; }
  .po-docno-nilai { font-size: 12pt; font-weight: 700; letter-spacing: .3px; }
  /* Signed by: 42% (±66 mm, garis kirinya segaris dengan kotak-kotak di atas) x
     50 mm -- tanda tangan + cap perusahaan (diameter ±40 mm) muat utuh, tidak
     terpotong garis bingkai. */
  .po-ttd { width: 42%; height: 50mm; display: flex; flex-direction: column; padding: 2.5mm; border-left: .25mm solid #000; text-align: center; }
  .po-ttd .po-label { text-align: left; }
  .po-ttd-ruang { flex: 1; }
  .po-ttd-nama { font-weight: 700; text-decoration: underline; }
  .po-ttd-jabatan { font-size: 9.5pt; }
  .po-isi-bebas { min-height: 4mm; }

  /* ===== PR ===== */
  .pr { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 10.5pt; }
  .pr-bingkai { flex: 1 1 auto; display: flex; flex-direction: column; border: .35mm solid #000; }
  .pr-bingkai table { border-style: hidden; table-layout: fixed; }
  .pr-bingkai th, .pr-bingkai td { border: .25mm solid #000; padding: 1.2mm 1.5mm; vertical-align: middle; }
  .pr-bagian { border-bottom: .25mm solid #000; }
  .pr-logo { text-align: center; font-size: 8pt; font-style: italic; line-height: 1.2; }
  .pr-logo img { height: 12.5mm; width: auto; display: block; margin: 0 auto 1mm; }
  .pr-judul { text-align: center; font-size: 16pt; font-weight: 700; line-height: 1.25; }
  .pr-persetujuan { padding: 1mm 0; text-align: center; }
  .pr-persetujuan span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9.5pt; font-weight: 700; }
  .pr-kepala th { text-align: center; font-size: 9.5pt; height: 7mm; }
  .pr-ttd { height: 17mm; text-align: center; vertical-align: bottom; font-size: 9.5pt; line-height: 1.3; }
  .pr-info th { text-align: center; font-size: 9.5pt; line-height: 1.15; height: 9mm; padding-top: .6mm; padding-bottom: .6mm; }
  .pr-info td { text-align: center; }
  .pr-tabel thead th { text-align: center; font-size: 9pt; line-height: 1.15; padding: 1mm .8mm; }
  .pr-tabel tbody td { height: 9.5mm; padding-top: .8mm; padding-bottom: .8mm; font-size: 9.5pt; line-height: 1.2; overflow-wrap: anywhere; }
  .pr-pemasok { font-size: 8.5pt; }
  .pr-tabel tfoot th, .pr-tabel tfoot td { height: 7.5mm; }
  .pr-tabel tfoot th { text-align: left; }
  .pr-pernyataan { border-top: .35mm solid #000; padding: 2mm 2.5mm 2.5mm; }
  .pr-pernyataan p { margin: 0 0 2mm; font-weight: 700; }
  /* Rincian pemohon SEJAJAR dengan kalimat di atasnya -- tanpa menjorok ke kanan */
  .pr-bingkai table.pr-pemohon { width: auto; table-layout: auto; }
  .pr-bingkai .pr-pemohon th, .pr-bingkai .pr-pemohon td { border: 0; padding: .4mm 0; text-align: left; font-weight: 400; }
  .pr-bingkai .pr-pemohon th { padding-right: 1.5mm; white-space: nowrap; }
  /* Catatan: bagian yang memanjang sampai margin bawah */
  .pr-catatan { flex: 1 1 auto; min-height: 14mm; border-top: .25mm solid #000; padding: 2mm 2.5mm; }
  .pr-kaki { display: flex; align-items: flex-end; gap: 10mm; padding-top: 2mm; font-family: Arial, sans-serif; font-size: 8.5pt; line-height: 1.3; }
  .pr-kaki-pt { flex: 1; text-align: center; padding-right: 30mm; }
  `;
}

function poDokumenHtml(jenis, row) {
  const judul = jenis === "pr" ? `PR ${(row.payload || {}).prNo || row.doc_number || ""}` : `PO ${row.doc_number || ""}`;
  return `<!doctype html>
<html lang="${jenis === "pr" ? "id" : "en"}"><head><meta charset="utf-8">
<title>${escapeHtml(judul)}</title>
<style>${poCetakCss()}</style></head>
<body>${jenis === "pr" ? buildPrHtml(row) : buildPoHtml(row)}</body></html>`;
}

/* Tombol printer di riwayat. `awal` = dokumen yang tampil lebih dulu
   ("po" bawaan). */
function cetakPoPr(rowId, awal) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row) {
    showToast(tt("Data PO tidak ditemukan.", "PO data not found."), "danger");
    return Promise.resolve(false);
  }
  const nomor = row.doc_number || "";
  const p = row.payload || {};
  return bukaModalCetak({
    nomor,
    awal: awal === "pr" ? "pr" : "po",
    varian: [
      { kunci: "po", label: "PO", jenis: "Purchase Order", judulBerkas: `PO ${nomor}`, muat: async () => poDokumenHtml("po", row) },
      {
        kunci: "pr",
        label: "PR",
        jenis: tt("Formulir Pengajuan Pembelian (PR)", "Purchase Request Form (PR)"),
        judulBerkas: `PR ${p.prNo || nomor}`,
        muat: async () => poDokumenHtml("pr", row),
      },
    ],
  });
}
