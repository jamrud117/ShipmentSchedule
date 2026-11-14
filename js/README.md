# Struktur js/ (hasil pemisahan dari script.js)

`script.js` (dulu 1 file, ~4700 baris, 1 IIFE besar) sudah dipecah jadi 25
file bertema di bawah ini. **Tidak ada logika yang diubah** — murni
pemindahan blok kode ke file masing-masing (kecuali 1 baris yang memang
harus disesuaikan, lihat catatan di `features/card-events.js`).

## Kenapa bukan ES Modules (import/export)?

Sengaja tetap dipakai gaya lama proyek ini: file polos (bukan
`type="module"`), tanpa bundler, di-load lewat banyak tag `<script>`
berurutan di `index.html` — sama seperti pola yang sudah dipakai di
Checker & tools lain. Semua file berbagi satu global scope, persis
seperti dulu semuanya berbagi 1 scope IIFE.

## ⚠️ Urutan <script> di index.html WAJIB persis seperti sekarang

Karena semua file berbagi 1 scope global (bukan modul terisolasi), file
yang lebih awal dimuat TIDAK BOLEH memanggil sesuatu yang baru
didefinisikan di file yang dimuat belakangan (kecuali dipanggil dari
dalam function/arrow function, bukan langsung di top-level). Urutan di
`index.html` sudah disusun mengikuti urutan asli di script.js lama, jadi
aman — tapi kalau mau menambah file baru atau mengubah urutan, perhatikan
dependency-nya dulu.

Pengecualian: `core/csp.js`, `core/anti-bingkai.js`, lalu `core/tema.js`
dimuat di `<head>` SEBELUM lembar gaya (tanpa defer): kebijakan konten
(CSP) dipasang paling awal, penjaga clickjacking sebelum apa pun tampil,
dan mode gelap terpasang sebelum halaman digambar. Ketiganya mandiri --
tidak boleh memakai fungsi file lain (termasuk `t` / `tt`).
Begitu pula `auth/login-awal.js`, tepat sesudah markup `#viewLogin`:
tanpa sesi tersimpan, layar masuk tampil seketika (bahasa dari `data-en`,
bukan kamus) sementara skrip lain masih dimuat.
Tidak ada `<script>` sebaris sama sekali (CSP menolaknya -- lihat
"Keamanan").

## Tabel di layar sempit: kartu berlabel

Tabel yang lebih lebar dari wadahnya tidak dibiarkan digeser di ponsel:
tiap sel membawa `data-label` (judul kolomnya, dirakit JS di bahasa
aktif) dan CSS-nya mengubah tiap baris jadi kartu lewat container query
menurut lebar WADAHNYA, bukan lebar layar -- jendela terbagi & tablet
memberi wadah sempit di layar lebar. Wadahnya: `.barang-isi` (Daftar
Barang form -- KARTU di semua lebar, lihat di bawah), `.detail-barang` & `.bk-isi` (panel detail),
`.tabel-isian` (Rincian Biaya, barang Surat Jalan Lokal & Surat Fungsi,
< 860px), `dn-riwayat` (riwayat No. Dokumen), `mst-daftar` / `mst-rinci`
(Masterlist). Dua aturan: (1) wadah ukur tidak boleh membungkus elemen
`position: fixed` (popover HS Code) -- wadah ukur menjadi bingkai
posisinya; (2) jangan menyetel `display` sel yang kolomnya bisa
disembunyikan per buku (`.dim-col`, `.export-col`, `.import-col`) --
anak kisi sudah jadi blok dengan sendirinya. Label ikut ganti bahasa:
`setLang()` menggambar ulang tabel-tabel isian ini -- juga, selagi form
jadwal terbuka, papan Mesin Prediksi + Rencana Mundur, kronologi catatan
& keterangan kurs NDPBM, dan di Nomor Dokumen keterangan skema pihak
invoice (`invSegarkanTanda`).

**Daftar Barang di form: kartu bawaan, tabel pilihan.** Tabelnya 25 kolom
(±3.000px): di layar 1440px hanya enam kolom pertama yang tampak, Qty /
Satuan / Harga jauh di kanan. Maka tiap barang tampil sebagai kartu
berlabel di SEMUA lebar. Kartunya (css/form.css, "DAFTAR BARANG DI
FORM") satu "lembar barang" bersusunan TETAP: pita kepala (Seri, Subtotal, hapus),
lalu tiga bagian berjudul -- Identitas barang (HS Code, Tarif BM, kolom
CEISA), Klasifikasi & fasilitas, Jumlah, nilai & kemasan. Kisinya 2 / 4 /
8 kolom menurut lebar WADAH (`@container barang-isi`), lebar tiap isian
ditetapkan per isian lewat `td[data-k]` (item-table.js) dan per buku
(`body.mode-import/-export`) sehingga tiap baris kisi terisi penuh; judul
bagian = sel `td.kartu-grup` (aria-hidden, disembunyikan di mode Tabel).
Pengalih Kartu / Tabel di kepala daftar (`features/barang-tampilan.js`) memasang
`.barang-isi--tabel`, dan kelas itu MENGGANTI NAMA kontainer wadah
(`barang-isi` -> `barang-tabel`): semua aturan kartu ditulis di
`@container barang-isi (min-width: 0px)` -- syarat yang selalu benar,
karena yang dipakai hanya namanya -- jadi di mode tabel seluruhnya
berhenti cocok tanpa satu selektor pun yang dibalik. Aturan (2) di atas
tetap berlaku: jangan menyetel `display` sel di blok kartu.

## Lebar isian: LAJUR kisi, bukan batas kotak (`css/lebar-isian.css`)

Dulu lebar tiap kotak ditentukan sel kisi tempatnya, jadi di layar 1920px
kotak tanggal membentang 441px dan "Nama Shipper" 1.840px. Percobaan
pertama membatasi KOTAKNYA (tanggal 190px di sel 325px, dst.) -- hasilnya
lubang kosong di samping tiap kotak. Sekarang:

- Di dalam kisi `.fgrid` kotak SELALU mengisi selnya; yang diatur banyaknya
  lajur (css/components.css): isian biasa 3 lajur, `.s2` isian pendek
  (Mata Uang, Nilai), `.s4`, `.s6` / `.s12`. Di layar sedang jadi setengah
  baris, di ponsel penuh.
- KECUALI KOTAK TANGGAL: selebar tanggalnya di mana pun (css/date-input.css),
  jadi ia tidak diberi sel sendiri (sel 200-300px untuk kotak 140px =
  lubang kosong). Dua pola menggantikannya:
  - `.fl-bertanggal` (sel `.s6` / `.s8`): isian + tanggalnya sepasang --
    No. Invoice + Tanggal Invoice, Jenis Surat + Tanggal Surat, Nomor BC
    1.1 + Tanggalnya, Nilai Barang + Tanggal Bayar. Isiannya mengisi sisa
    sel, tanggalnya di ujung kanan; tidak muat sebaris (isian < 200px,
    ponsel) -> tanggalnya turun. Label galat wajib isi dicari dari sel
    berlabel terdekat (`.fl-bertanggal > *, .fgrid > *`, docnum-view.js).
  - `.fl-tanggal` (baris): kelompok tanggal berjajar selebar isinya dengan
    jarak tetap 40px -- ETD / ETA / Estimated Delivery / In Factory,
    Update ETA / ETD (+ ringkasan delay yang mengisi sisa baris), Tiba /
    Berangkat di kartu Terminal Transit. Dilipat bila tidak muat.
  Baris di luar kisi mengikuti hal yang sama: lajur tanggal `max-content`
  (Dokumen Pelengkap `.dp-baris`, invoice/debit note tambahan `.fd-baris`,
  baris PO, B/L-AWB pembanding di halaman Cek, Dibutuhkan di Pabrik).
- Halaman form Jadwal & No. Dokumen SELEBAR LAYAR (batas 1440px / 1280px
  sempat dicoba lalu dicabut: di monitor lebar lebih banyak informasi
  harus terlihat tanpa menggulir).
- `css/lebar-isian.css` (dimuat PALING AKHIR, hanya `max-width`) membatasi
  kotak isian pop-up saja. Tidak boleh ada batas kotak di dalam `.fgrid`,
  batas kotak tanggal, atau aturan kisi / `width` di lembar ini (dijaga tes).

URUTAN ISIAN = urutan dokumen datang, dan itulah urutan Tab:

- Kartu Dokumen jadwal: Nama Shipper/Buyer | No. Aju -> Invoice | Packing
  List -> Master | House B/L-AWB -> SPPB / PEB (terbit paling akhir).
- Pengajuan Dana: BL/AWB | Dibayarkan Kepada | Jenis Pengeluaran | Jenis
  Transaksi -> No. Invoice/Billing + tanggal + jatuh tempo | Customer ->
  Rincian | Mata Uang | Lampiran -> Doc No | Tanggal Dibutuhkan | Pemohon |
  Departemen (baris terakhir sudah terisi bawaan, jarang diubah).
  BL/AWB PALING ATAS karena mengisi banyak isian sekaligus dari jadwal yang
  BL/AWB-nya cocok (`fundIsiDariAwb`, features/fund-rincian.js): Jenis
  Transaksi (moda laut -> Sea, udara -> Air + buku Import/Export),
  Dibayarkan Kepada (forwarder jadwal -> vendor di daftar yang namanya
  termuat di nama forwarder, `fundVendorDariForwarder`), Customer (buyer
  jadwal Export) & Rincian. Hanya isian yang kosong / masih otomatis
  (`data-auto-awb`); yang dipilih sendiri tidak ditimpa. Mengetik di kotak
  BL/AWB juga memunculkan SARAN: paling banyak 4 nomor House BL/AWB dari
  jadwal yang mirip ketikannya (features/fund-saran-awb.js) -- memilih
  satu menjalankan pengisian otomatis yang sama.
- Permintaan Nomor Invoice: Jenis Invoice | Tanggal | Pemohon | Departemen
  -> Customer (dropdown bisa ditambah) | Skema Invoice | Mata Uang | Nilai
  -> kartu Pihak (Penjual | Pemilik Barang | Pembeli | Penerima) ->
  Keterangan -> data cetak CIPL. Lihat features/invoice-pihak.js.
- Pengaturan di bawah form No. Dokumen (Atur Nomor Urut, Aturan Doc No,
  Aturan No. Invoice) tiga sebaris; penjelasan panjangnya dilipat di
  "Cara kerja" (`details.dn-bantuan`).

## Mesin prediksi: data yang mendekatkan perkiraan ke kenyataan

Angka & data ada di `core/prediction-config.js`; hitungannya di
`core/prediction-*.js` + `core/workdays.js` (komentar di tiap berkas).

- **Kalender** (`calendar`): libur nasional & cuti bersama SKB 3 Menteri
  2025–2027 (cuti bersama ikut tutup, `countCollectiveLeave`), dan masa
  pembatasan truk sumbu ≥3 Lebaran/Nataru (`freightRestrictions`) yang
  hanya menahan langkah antar ke pabrik kiriman FCL
  (`hariTutupLangkah`). Tahun berikutnya cukup ditambahkan di sini
  begitu SKB-nya terbit. Rincian prediksi menyebut hari tutup yang
  dilewati (`hariTutupDiAntara`, `predLiburHtml` di render/prediction-view.js).
- **Jalur PIB** (`customsLanes`): lama clearance per jalur (MITA 0, Hijau 1,
  Merah 2–4 hari kerja), dipelajari per jalur dari riwayat
  (`hitungOpsDariRiwayat`). Jalur Kuning sudah dihapus (PER-02/BC/2022).
- **Kedatangan** (`kedatanganTercatat`, core/prediction-milestones.js):
  ATA/Berths sendiri → Berths kiriman lain di kapal + voyage yang sama
  (`kedatanganSekapal`) → Manifest + jeda BC 1.1→sandar
  (`arrival.manifestLeadDays`, dipelajari: `learnedManifestLagDays`).
  Manifest buku Export (outward) bukan bukti kedatangan.
- **Riwayat**: clearance diukur dari barang siap (SPPB sebelum tiba = 0),
  antar ke pabrik dari yang terakhir di antara SPPB & barang siap; LCL
  yang SPPB-nya terbit lebih dulu tetap menunggu stripping.
- **Delay kapal** di Ringkasan (`ringkasDelayKapal`, core/status.js;
  `rataDelayKapalHtml`, views/overview-view.js): rata-rata telat dari
  ETA rencana (Import) / ETD rencana (Export), 12 bulan, per moda &
  pelayaran.
- **Lama transit laut impor & ekspor** (`asumsiTransitKonfigurasi`,
  core/prediction-eta.js):
  - Aturan rute **dua arah** (`rankRouteRules`, core/prediction-rules.js):
    tabel ditulis per arah impor; ekspor memakai angka arah sebaliknya
    (skor −0,5, jadi aturan searah yang sama rincinya selalu menang;
    `searah: true` mematikannya per aturan). Dulu ekspor jatuh ke 14 hari
    bawaan -- Singapura maupun Manzanillo "dua minggu".
  - **Tingkat 3** di `routes[]`: rentang per negara/wilayah di luar tabel
    forwarder (SG, MY, TH, PH, HK, TW, JP, IN, Timur Tengah, TR, Eropa,
    AS barat/lainnya, AU) dari jadwal pelayaran publik.
  - Laut berlabel **Direct** yang pelabuhannya hanya punya angka Transit
    memakai angka pelabuhan itu (Vladivostok 23), bukan aturan negara.
  - **Keraguan asumsi** (`ragu`): rentang, arah sebaliknya
    (`reverseLaneExtraDays`), dan aturan cadangan
    (`priorSpreadFallbackDays`) membuat riwayat lebih cepat mengambil alih.
  - **Belajar lintas rute** (`geserDariRuteLain`, core/prediction-learning.js):
    rute tanpa riwayat digeser selisih rute lain dari negara yang sama
    (tiap kiriman diukur terhadap asumsinya sendiri; rute itu sendiri
    tidak dihitung dua kali; per arah impor/ekspor). Tingkat "umum"
    (`poolSpreadDays.umum`) mati secara bawaan -- di uji tiruan menambah
    meleset.
  - **Kapal yang sama** (`etaSekapal`, core/prediction-milestones.js):
    ETA otomatis ikut Sandar/ATA atau ETA MANUAL kiriman lain di kapal +
    voyage + tujuan yang sama (impor & ekspor; bukan Transit/kurir).
    `segarkanKirimanSekapal` menyegarkan kiriman sekapalnya saat ETA/ETD
    diubah dari kartu.
  - **Uji mundur** (core/prediction-backtest.js) memisah ETA laut impor &
    ekspor (`eta.lautImpor`, `eta.lautEkspor`); panel Akurasi Ringkasan
    menampilkan keduanya. Pada riwayat tiruan bergaya DDI (8 benih,
    190 kiriman/benih) MAE ETA laut impor 2,58 → 1,69 hari (±1 hari
    52 → 59%), ekspor 6,05 → 2,03 hari (±1 hari 28 → 54%).

Uji: `qa/engine-test.js` & `qa/dom-test.js` memakai kalender netral untuk
uji aturan lama; data aslinya diuji lewat `pakaiKalenderAsli()`.

## Lampiran, draft/asli, lartas & COO, impor CEISA, Dibutuhkan di Pabrik

Migrasi: `migration-lampiran-lartas-kebutuhan.sql` (bucket Storage privat
`lampiran-jadwal` + kebijakannya, `hs_code_master.lartas`,
`shipments.needed_date`). Sebelum dijalankan aplikasi tetap jalan.

- **Draft / Asli di stepper** (`features/doc-steps.js`): CI/PL, B/L-AWB,
  Asuransi, COO, Manifest, PIB (+ PEB & Fumigasi di Export) bertanda
  `bisaDraft` -- dicentang sebagai Draft (`draft: true`, jam pasir,
  "· N draft" di kepala stepper, tugas "Menunggu asli" di Ringkasan) lalu
  dinaikkan ke Asli (`tglDraft` menyimpan tanggal draftnya). PIB draft &
  Manifest draft (belum BC 1.1) bukan milestone prediksi
  (`milestoneDateOf`, `jalurOf` melewatinya). Satu kotak tahap untuk
  semua keadaan (`bukaTahapDokumen`): status, tanggal, jalur, lampiran,
  dan "Batalkan tahap" (`batalkanTahapDokumen`).
- **Billing & Berths berstatus** (`features/doc-steps.js`): mekanisme
  draft yang sama, kosakata sendiri (`kata` di definisi tahap,
  `kataTahap(st, s)`). **Billing**: "diterima -- belum dibayar" (`draft:
  true`, tanggal billing diterima) / "sudah dibayar" (tanggal bayar;
  tanggal billing diterima ikut di `tglDraft`); belum dibayar jadi tugas
  "Belum dibayar" & baris "Billing belum dibayar" di Ringkasan
  (`belumDibayarDocs`, `perluDikejar`). **Berths / ATA**: "Estimasi"
  (`draft: true`, tanggalnya BOLEH KE DEPAN, bawaan = ETA jadwal) /
  "Aktual" (kejadian); estimasi bukan bukti kedatangan, tidak dibagikan ke
  kiriman lain di kapal yang sama, dan bukan tugas (kedatangan terjadi
  sendiri). Keduanya bukan milestone prediksi selama masih draft
  (`milestoneDateOf`), jadi tidak menggeser Estimated Delivery; entri lama
  tanpa status dibaca sudah dibayar / aktual. Kepala stepper menandainya
  sendiri ("Billing: belum dibayar", "Berths: estimasi"), bukan "N draft".
  Bawaan kotak untuk entri BARU adalah keadaan yang belum pasti
  (belum dibayar / estimasi): salah mencatat "dibayar" atau "aktual"
  mengubah prediksi diam-diam, salah mencatat sebaliknya langsung
  kelihatan (jam pasir).
- **Tahap per buku & bersyarat**: E-COO hanya di buku Import (sesudah
  COO, mengikuti COO yang tidak dipakai). Export: COO & Fumigasi sama-sama
  opsional ("Tidak dipakai"); kotak & tooltip Fumigasi menyebut kemasan
  barangnya sebagai petunjuk (`petunjukFumigasi`: kolom Jenis Kemasan,
  nama bebas atau kode kemasan CEISA -- kayu / palet / peti -> umumnya
  wajib fumigasi / ISPM-15, karton / plastik / karung -> biasanya tidak)
  tanpa mencentang apa pun. **Asuransi** (polis / sertifikat, draft &
  final) hanya untuk incoterm CIF & CIP (`INCOTERM_BERASURANSI`,
  `berlaku` di definisi tahap, disaring `docStepsFor`), sesudah B/L-AWB di
  kedua buku; incoterm lain tidak menggambar tahapnya. **SPJM** (Surat
  Pemberitahuan Jalur Merah, hanya buku Import) muncul tepat sebelum SPPB
  selama jalur PIB-nya Merah (`pakaiSpjm` = `jalurOf(s) === "merah"`,
  jalur dicatat di kotak PIB / Billing / SPPB); jalur dikoreksi -> tahapnya
  hilang tapi entrinya tetap tersimpan dan kembali bila jalurnya Merah
  lagi. Tahap berkas biasa (tanggal diterima + lampiran), bukan milestone
  prediksi. Petunjuk tahap (`petunjuk`: FTA di COO Import, kemasan di
  Fumigasi) satu jalur untuk tooltip & kotak tahap.
- **Lampiran** (`data/lampiran.js`): `berkas: [{ path, nama, ukuran, tipe,
  at, by, versi? }]` di entri tahap dan di baris PI / LS
  (`s.dokPelengkap`). Berkas baru diunggah saat Simpan, yang dilepas
  dihapus sesudah simpanannya berhasil; jadwal yang dihapus ikut
  menghapus lampirannya (`semuaLampiranJadwal`). Dibuka lewat tautan
  bertanda tangan 5 menit (`bukaLampiran`); panel detail menampilkan
  progres & lampiran hanya-baca untuk semua akun.
- **Lartas & COO** (`core/lartas.js`): PI / LS / SNI per HS Code dari
  Database HS Code (`hs_code_master.lartas`, kotak centang di Tambah/Ubah
  HS Code) dan PI untuk barang bukan baru (Permendag 24/2025). Yang
  wajib tapi belum bernomor -> `missingDocs` ("PI (lartas)"), tag kartu,
  kotak di kartu Dokumen Pelengkap Pabean. Skema FTA per negara asal
  (`FTA_INDONESIA`) -> petunjuk COO di tahap COO & kotak yang sama.
- **Impor CEISA mencentang progres** (`progresDariDokumenPabean`,
  `gabungProgresImpor`): aju tanpa nomor daftar -> PIB/PEB draft; nomor &
  tanggal daftar -> terdaftar; respon 2003 -> SPPB; BC 1.1 HEADER ->
  Manifest; tulisan SPJM/SPJH/MITA di RESPON -> jalur; NPE (Export). Hanya
  menambah / menaikkan, ditampung sampai Simpan (`progresSimpanForm`).
- **Dibutuhkan di Pabrik** (`core/prediction-mundur.js`): `rencanaMundur`
  = ETA paling lambat (jadwal darat yang sama dengan Estimated Delivery,
  dicari mundur) & ETD paling lambat (dikurangi transit terpanjang);
  `statusKebutuhan` = telat / mepet (cadangan <= 2 hari) / aman. Form
  (`renderRencanaMundurForm`), tag kartu, tugas "Kebutuhan +Nh".

## Data PIB/PEB (tab 4 form) & cetak draft berstabilo

Migrasi: `migration-data-pabean.sql` (jsonb `shipments.data_pabean` &
`shipment_items.data_pabean`). Sebelum dijalankan aplikasi tetap jalan,
isiannya hanya belum tersimpan.

- **Halaman Data PIB / Data PEB** (tab ke-4 form jadwal,
  `features/data-pabean-form.js`): deret tab seperti layar isian CEISA
  4.0 -- Header, Entitas, Dokumen, Pengangkut, Kemasan & Peti Kemas,
  Transaksi, Barang, Pungutan (PIB), Pernyataan -- tiap tab berisi bagian
  berjudul. Semua isian opsional. Yang sudah punya kotak di tab lain
  (No. Aju, invoice, B/L, sarana angkut, pelabuhan, incoterm, freight,
  asuransi, NDPBM, kemasan, kontainer, barang & fasilitasnya) tampil
  hanya-baca dengan tombol Ubah ke kotak asalnya; yang dihitung darinya
  (harga barang, CIF/FOB, nilai pabean, berat, pungutan) bertanda
  "otomatis" (`dpNilaiHitung`). No. & Tgl Packing List diisi di tab 1
  (Documents & General, sebaris dengan Invoice; baris pertama = Nama
  Shipper/Customer, Negara, No. Aju) -- BUKAN di Dokumen Lain: kode 217 dikeluarkan
  dari pilihan Dokumen Lain (`KODE_DOKUMEN_BERISIAN`), impor PDF PIB /
  PEB / Excel CEISA / CIPL mengisi kotaknya, dan 217 lama di Dokumen Lain
  dipindah ke kotak itu saat dimuat (`pindahkanPackingList`).
- **Tombol pena** di tab Barang (`features/data-pabean-barang.js`):
  editor satu barang seperti CEISA (‹ n/N › menyimpan barang yang
  ditinggalkan, Simpan / Tutup; Tutup dengan perubahan bertanya dulu di
  kaki dialog) -- tarif BM & PPh, metode nilai, perbedaan harga, VD
  (PIB); jenis ekspor, daerah asal, HE, tarif BK (PEB). Pungutan barang
  itu ikut tarif yang sedang diketik.
- **Kode CEISA** (`core/referensi-ceisa.js`, `REF_CEISA`): tabel
  Referensi CEISA 4.0 (kantor, dokumen, fasilitas, valuta, bank, daerah,
  kemasan, jenis impor/ekspor/prosedur, cara bayar, jenis transaksi, API,
  lokasi bayar, jaminan, kategori ekspor & konsolidator) dari
  dokumentasi PIA CEISA 4.0 (cermin: github.com/wisnubaldas/docs-api-ceisa),
  dilengkapi nama dari layar & cetakan CEISA. Disimpan sebagai KODE,
  tampil "kode - NAMA" (`dpNamaPilihan`); kode / nama / "kode - NAMA" /
  "NAMA (KODE)" dikenali (`dpKodePilihan`, kode angka "02" = "2"). Daftar
  panjang = kotak ketik bersaran (bisa dicari), yang pendek = pilihan.
  Kode di luar daftar tetap tersimpan apa adanya.
- **Nilai bawaan** (`dpBawaan`, `terapkanBawaan`): Import -- Kantor
  040300 (laut) / 050100 (udara), Jenis PIB 1, Jenis Impor 1, Cara Bayar
  1, valuta USD, Jenis Transaksi LAI, Importir / Pemilik Barang / NPWP
  Pemusatan = data perusahaan (`DP_PERUSAHAAN`), Jenis API Importir 1
  (API U), Afiliasi AFL bila pemasoknya Dynamic Design Co., selain itu
  TAH, Pengirim = Shipper. SHIPPER YANG DIKENAL (`DP_PEMASOK`,
  `dpPemasok`: nama dicocokkan tanpa huruf besar/kecil, spasi & tanda
  baca): alamat & negara Pengirim bawaan -- Dynamic Design Co., Ltd.
  (KR), Qingdao Jiasong Machinery Technology (CN), Qingdao Saehwa Mold
  (CN), Changyoung Tooling (KR); Penjual ikut. Shipper lain tanpa
  alamat / negara bawaan. Ganti shipper: bawaan shipper lama yang belum
  diubah ikut berganti, atau hilang bila shipper barunya tidak dikenal
  (`terapkanBawaan`). NEGARA SHIPPER / BUYER di tab Documents & General
  (`#fNegaraPihak`, di samping Nama Shipper; `isiNegaraPihakForm`) =
  Negara Pengirim (Import) / Pembeli (Export) Data PIB/PEB -- satu isian,
  bisa diubah di kotak itu atau di tab Entitas; kotak bersaran
  `#negaraList` seperti Negara Asal barang (kode / nama Indonesia /
  nama Inggris -> kode, nama negaranya redup di dalam kotak).
  Export laut / udara: kantor muat & ekspor, pelabuhan muat ekspor,
  jenis ekspor, kategori, cara dagang, cara bayar (+ keterangan)
  komoditas, barang kiriman, curah menurut moda; Eksportir & Pemilik =
  perusahaan, Jenis API Eksportir 2 (API P), Pembeli = Buyer. Bawaan
  hanya mengisi isian yang kosong: jadwal lama yang sudah menyimpan API
  lain tetap memakai nilainya. PASANGAN PIHAK (`DP_PIHAK_PASANGAN`):
  isian bersama pihak kedua = isian pihak pertama yang tersimpan /
  sedang diketik -- Import: Pemilik Barang = Importir, Penjual =
  Pengirim; Export: Pemilik Barang = Eksportir, Penerima = Pembeli (API,
  NIB, Status, Afiliasi tidak ikut). Diisikan saat form dibuka; isian
  yang masih sama dengan bawaan lama ikut berganti saat moda, Shipper /
  Buyer, atau isian pihak pertamanya berubah (kotaknya di layar ikut,
  `dpbSegarkanKotakPihak`), yang diubah sendiri tetap. Bawaan
  bersambung (Shipper -> Pengirim -> Penjual -> Afiliasi) diulang
  sampai tetap (`segarkanBawaanDataPabean`).
- **Pungutan per fasilitas** (`hitungPungutanFasilitas`, core/customs.js):
  per seri barang, tarif BM / PPh barang (kolom jadwal `tarif` lama hanya
  cadangan; 0 / kosong = 5%), PPN 11% dibulatkan ke bawah PER SERI lalu
  dijumlahkan (= NILAI BAYAR PPN BARANGTARIF & sheet PUNGUTAN draft
  CEISA; PPN tersimpan dengan cara lama -- dibulatkan dari jumlahnya --
  tetap dikenali otomatis, `initAutoDutyFlags`);
  fasilitas barang di Daftar Barang (SKB BM / Masterlist, SKB PPN, SKB
  PPh) memindahkan pungutannya ke kolom Dibebaskan dan BM yang
  dibebaskan tidak masuk Nilai Impor. Tepat sama dengan PIB sungguhan 17
  seri (BM, PPN, PPh per seri & total). Barang yang memakai COO (fasilitas
  tersimpan "E-COO", `barangPakaiCoo`) bertarif BM 0% -- aturan di dalam
  `hitungPungutanFasilitas`, jadi form, Data PIB, editor barang, ekspor
  Excel, dan Cek PIB/PEB satu suara; tarif isian / HS / bawaan tidak
  dipakai selama COO terpasang, tetapi juga tidak dihapus (kotak Tarif BM
  barang itu menampilkan 0 dan terkunci, `tarif-hs.js`; COO dilepas ->
  tarif tersimpannya kembali). SATU hitungan untuk dua tempat:
  Bea Masuk / PPN / PPH di tab Kepabeanan & Biaya = kolom Dibayar tab
  Pungutan (`recalcCustoms`, modal-fields.js); yang diketik sendiri di
  sana tampil apa adanya di kolom Dibayar (`pungutanManualForm`), BM
  manual dibagi ke seri yang tidak dibebaskan & jadi dasar PPN / PPh.
  Saat form dibuka, angka tersimpan yang sama dengan hitungan otomatis
  (per fasilitas, atau cara lama tanpa fasilitas, atau hitungan
  SEBELUM aturan COO -- `abaikanCoo` -- sehingga jadwal lama ber-BM 5%
  untuk barang ber-COO ikut jadi 0) tetap otomatis (`initAutoDutyFlags`,
  dijalankan SEBELUM tabel barang menghitung ulang); angka lain -- mis.
  dari PIB -- dianggap manual.
- **Pembaca** (`import/data-pabean-baca.js`): PDF PIB, PDF PEB, Excel
  CEISA -- semuanya menghasilkan kode. Yang tidak terbaca tidak diisi.
  Data per barang bertahan saat impor ulang (`pertahankanDataPabeanBarang`,
  apply-to-form.js).
- **Bulk Excel**: sheet "DATA PIB-PEB", satu baris per isian (NO, AJU,
  SERI BARANG, KELOMPOK, ISIAN, NILAI "kode - NAMA", KUNCI); diimpor balik
  per NO, bila tidak cocok per AJU.
- **Tanggal di WIB**: ExcelJS mengubah Date lewat UTC, SheetJS
  (`cellDates`) membuat Date lokal dengan galat detik -- tanggal ditulis
  sebagai tengah malam UTC dan Date dibaca dibulatkan ke menit
  (`excelValueToISODate`). Tanpa itu tanggal mundur sehari.
- **Cek PIB/PEB, ISIAN WAJIB** (`cekTerapkanWajib`, dijalankan
  `cekJalankan` sesudah semua baris tersusun): isian yang ditandai
  pengguna di PDF draft PIB & PEB (`CEK_WAJIB.PIB` / `.PEB`) WAJIB sama
  dengan jadwal -- beda, belum diisi di jadwal, atau tidak tercantum di
  draft = MISMATCH ("Isian wajib PIB: ..."). Isian lain yang ikut
  diperiksa hanya INFO walau berbeda ("Bukan isian wajib PIB, jadi hanya
  informasi."). PIB: Jenis PIB, Jenis Impor, Cara Pembayaran; Pengirim &
  Penjual (nama, alamat, negara), Importir (identitas, NITKU, nama, alamat,
  status, NIB), NPWP Pemusatan, Pemilik Barang (+ afiliasi); 9-19
  (moda, sarana & voyage, perkiraan tanggal tiba, pelabuhan muat /
  transit / tujuan, invoice, House & Master B/L-AWB, fasilitas); 21-23
  (valuta, NDPBM, incoterm & nilai), 27-30 (peti kemas, kemasan & merek,
  bruto, netto); pungutan 37-44 kolom Dibayar & Dibebaskan; seluruh dokumen
  lembar lanjutan; tiap barang: pos tarif, kode barang, uraian, merek,
  tipe, ukuran, spesifikasi lain, kondisi, negara asal, fasilitas (33),
  tarif BM & PPh (34), jumlah & satuan, netto, kemasan (35), nilai,
  metode & beda harga (36).
  PEB: jenis ekspor, kategori, cara dagang, cara bayar; Eksportir,
  Pemilik Barang, Pembeli & Penerima; 21-31 (moda, sarana & voyage,
  tanggal perkiraan ekspor, pelabuhan muat asal / muat ekspor / tujuan,
  negara tujuan, invoice, packing list, B/L-AWB); 35-38 (incoterm, bank
  devisa, valuta, nilai FOB), 42-46 (peti kemas, kemasan & merek, bruto,
  netto), 55 NDPBM; tiap barang: pos tarif, kode barang, uraian, merek,
  tipe, ukuran, spesifikasi, jenis ekspor, perizinan & No. Urut (49), HE
  & tarif BK (50), jumlah & satuan, netto, kemasan, negara & daerah asal,
  nilai. Kolom barang berlaku untuk SEMUA
  barang. Kunci isian per baris: `cekKunciKanon` ("dp:x" -> "x",
  "barang:n:k" / "Item n Kolom" -> "barang.k", baris mesin menurut nama
  isiannya). Tetap INFO walau wajib: kosong di kedua sisi, `tetapInfo`
  (kurs valutanya tidak ada, draft tanpa sheet PUNGUTAN / tanpa
  kolomnya), HS menurut Database HS Code (`hs_ref`), dan isian yang
  tidak dicetak CIPL. Tidak diubah: urutan Seri Barang, barang yang tidak
  ada, jumlah baris barang, volume, No. Aju & No. Daftar (`infoSaja`).
- **Cek PIB/PEB**: Data PIB/PEB jadwal (tersimpan + nilai bawaan,
  `dpEfektif`) dibandingkan isian yang sama di draft
  (`cekBarisDataPabean`, per barang `cekBarisDataPabeanBarang`); isian
  kosong di jadwal / tidak ada di draft INFO, alamat yang ditulis lain
  INFO -- lalu isian wajib menjadikannya MISMATCH. Alamat sama
  (`cekSamaAlamat`) bila yang satu memuat yang lain, atau kata-katanya
  sama sesudah JALAN = JL, NOMOR = NO, label wilayah (DESA, KELURAHAN,
  KEC., KAB., PROVINSI) diabaikan & 0 di depan nomor dibuang ("NO. 01" =
  "NO.1"). PEB: pembanding Eksportir = data perusahaan seperti TERCETAK
  di PEB CEISA (`DP_PERUSAHAAN.peb`, alamat pendek tanpa kode pos karena
  batas huruf PEB); Pemilik Barang sama dengan Eksportir KECUALI Third
  Party Invoice (`cekPebPihakKetiga`: pembeli ≠ penerima di Data PEB
  jadwal, lalu Skema Invoice customernya -- `invSumberCustomer` --
  lalu Seller ≠ Shipper di CIPL) -- Pemilik Barang hanya dari Data PEB
  jadwal. Packing List yang tidak dicatat di Data PIB/PEB = nomor &
  tanggal invoice jadwal (satu invoice; Packing List CIPL tetap
  didahulukan). Tarif BM / PPh barang yang kosong di jadwal tampil
  dengan tarif yang dipakai hitungan jadwal ("5 (bawaan)", PPh 2,5);
  tarif (kolom 34) isian wajib, jadi beda dengan draft = MISMATCH
  (catatannya menyebut bawaan & meminta tarif barang itu diisi di
  jadwal), dan BM draft yang lebih rendah menyebut dokumen tarif
  preferensinya
  (`cekPreferensiTarifDraft`: BARANGDOKUMEN -> DOKUMEN ber-KODE
  FASILITAS "PREFERENSI TARIF ...", mis. 55 AKFTA). Barang ber-COO:
  Tarif BM jadwalnya 0% (aturan COO), apa pun tarif lama yang
  tersimpan; draft yang masih memungut BM = MISMATCH (tarif & Pungutan
  BM).
  Pungutan (`cekBarisRupiah`, hanya PIB): BM, PPN, PPh & TOTAL, kolom
  Dibayar & Dibebaskan. Dibayar TIDAK dihitung ulang: isian jadwal apa
  adanya (`s.bm`, `s.ppn`, `s.pph`, Bea & Pajak Impor; TOTAL =
  jumlahnya). Dibebaskan = kolom Dibebaskan tab Pungutan Data PIB jadwal
  (`cekPungutanJadwal`: `dpNilaiHitung`, angka Dibayar tersimpan yang
  berbeda dari hitungan otomatis diperlakukan seperti diketik sendiri).
  Draft: sheet PUNGUTAN, TOTAL = semua jenis pungutannya (BMT / Cukai /
  PPnBM ikut, disebut di catatan). Selisih <= Rp 1 = MATCH. Nilai Pabean
  (Rp) dan kolom Ditanggung / Ditunda / Tidak Dipungut / Telah Dilunasi
  tidak diperiksa. BM, PPN & PPh 0 semua di jadwal = belum diisi ->
  MISMATCH "Belum diisi"; tanpa sheet PUNGUTAN -> satu baris INFO.
  Selisih BM menyebut jumlah barang ber-COO dan barang yang Tarif BM-nya
  belum diisi (bawaan); selisih Dibebaskan menyebut jumlah barang yang
  berfasilitasnya. Kemasan tiap barang (`cekBarisKemasanBarang`: Kemasan
  & Jenis Kemasan barang jadwal vs JUMLAH / KODE KEMASAN sheet BARANG;
  0 di kedua sisi tanpa baris) dan nilai transaksi (`cekBarisNilaiTotal`:
  PIB NILAI INCOTERM = jumlah nilai barang jadwal; PEB FOB = nilai barang
  dikurangi freight & asuransi yang termasuk incoterm) ikut diperiksa.
- **Cek PIB/PEB, harga tiap barang** (baris `Item N Amount / FOB|CIF`):
  nilai barang jadwal (jumlah x harga satuan) dibandingkan dengan kolom
  FOB atau CIF sheet BARANG draft yang TERISI (angka > 0; draft PEB
  mengisi FOB dan membiarkan CIF 0, draft PIB mengisi CIF dan membiarkan
  FOB kosong) -- bukan kolom yang "seharusnya" menurut incoterm.
  Satu aturan di mesin (`EximEngine.declaredItemValues`,
  `itemAmountRow`, `amountsAgree`) untuk dua jalur: tanpa CIPL
  (`cekBarisHargaBarang`, jadwal vs draft) dan dengan CIPL (`runCheck`;
  nilai barang jadwal menggantikan nilai CIPL). Satu kolom terisi -> itu;
  keduanya terisi -> yang searah `hint` didahulukan (PIB selalu CIF; PEB:
  FOB/FCA/EXW/FAS = FOB, selain itu CIF -- `cekBasisHarga`) dan yang
  lain tetap diterima bila itulah yang sama; draft PEB ber-incoterm CIF
  yang hanya mengisi FOB: CIF turunan (FOB + Freight + Asuransi dibagi
  rata, `cif_derived`) dicoba lebih dulu, FOB apa adanya juga diterima
  (jadwal yang diisi dari draft PEB-nya sendiri berharga FOB). Harga
  satuan disimpan 4 desimal, jadi jumlah x harga boleh meleset dari nilai
  draft hanya karena pembulatan itu (harga satuan = nilai draft / jumlah
  dibulatkan 4 desimal). Jadwal belum berharga dan draft tanpa nilai =
  INFO; salah satunya kosong = MISMATCH dengan catatan sebabnya. Catatan
  baris mengikuti bahasa tampilan lewat `extra.catatanNilai`
  (`cekCatatanNilai`); mesin sendiri hanya punya kalimat Indonesia.
- **Cetak draft** (`features/cek-cetak.js`, tombol "Cetak draft" di Cek
  PIB/PEB): draft CEISA digambar sama persis dengan PDF PIB / PEB (SVG A4
  berkoordinat PDF asli, templat `features/cek-cetak-templat.js`),
  bertanda DRAFT; isian MISMATCH -- termasuk isian Data PIB/PEB (slot
  `dp:` / `barang:n:isian`) -- distabilo kuning bernomor dan dirinci di
  Lembar Koreksi. Tabel pungutan dari sheet PUNGUTAN draft.

## CIPL: satu sumber untuk cetak & Excel

`features/cipl-tata.js` menyusun lembar CETAK sebagai kisi (kolom mm,
baris pt, sel gabungan, garis per sisi) lalu menggambarnya dengan
`ttHtml`. Pemotongan baris & pengecilan huruf dihitung di sini dari metrik
Arial / Times, bukan oleh peramban. Dynamic Design: CI, PL & SI
(`cipl-print.js`); Kumho (`cipl-vn-print.js`) memakai penyusun yang sama
(`ciplTataFormal`). Nomor di kotak Document reference (No. Invoice &
Packing List, `ciplNoTanggal`) SELALU satu baris: hurufnya dikecilkan
seperlunya (`ttUkuranPas`, paling kecil `CIPL_UKURAN_MIN_PT`), tidak
dibungkus.

Excel (`cipl-excel.js`) = LEMBAR KERJA, bukan salinan kisi cetakan.
`ciplBukuKerja` memanggil `ciplDaftarTata` -- fungsi yang sama dengan
Print -- dan membaca spek yang disimpan modelnya (`T.spek` dari
`ciplTataFormal`: kartu dengan datanya `teks` / `ref`, rincian dengan
`{ iso }` untuk tanggal, tabel dengan `kali` untuk rumus Amount; `T.si`
= `ciplSiData`, termasuk `angka`). Isi, urutan & angka Excel karena itu
sama dengan cetakan; data tambahan itu tidak dibaca cetakan.

- Kolom = kolom tabel barang: CI & PL `NO` (Kumho `MARKS & NO. PKGS`) |
  `GOODS DESCRIPTION` | `QTY` | `UNIT` | `UNIT PRICE`/`NET WT.` |
  `AMOUNT`/`GROSS WT.`, lebar sebanding kisi cetakan. Kotak atas & bawah
  menempati kolom yang sama (kiri dua kolom pertama, kanan sisanya);
  rincian pengiriman 4 baris x 2 kotak, urutan baca = cetakan. SI:
  penanda | label | : | isi.
- Satu barang = satu baris tanpa sel gabungan; deskripsi wrap di selnya,
  angka tetap angka dengan format sama dengan teks cetakan
  (`"USD "#,##0.00`, `#,##0" KG"`), Amount = rumus Qty x Unit Price,
  TOTAL = `SUM(<kepala>:INDEX(<kolom>,ROW()-1))` -- baris yang disisipkan
  / dihapus di antara kepala & TOTAL ikut terhitung; belang baris lewat
  format bersyarat. Tanggal = sel tanggal (`[$-409]d mmm yyyy`). HS Code
  angka murni = sel angka.
- Sel gabungan hanya untuk teks lintas kolom (judul, kotak pihak, label &
  isi rincian, TOTAL, tanda tangan); jumlahnya tetap, tidak bertambah
  dengan banyaknya barang. Kotak lebih tinggi dari 400 pt dipecah
  beberapa baris (batas Excel 409 pt per baris).
- Tahan AutoFit: kolom sesudah dokumen (spasi tak-putus putih seukuran
  tinggi tiap baris bergabung) & satu baris sesudah dokumen (spasi
  tak-putus selebar tiap kolom), keduanya di luar area cetak. Baris
  barang tanpa pengancar -- AutoFit mengikuti deskripsi.
- Baris barang (cetak & Excel): SEMUA sama tinggi -- setinggi barang yang
  namanya paling banyak baris, teks pendek di tengah barisnya (tegak);
  GOODS DESCRIPTION rata kiri (`tabel.rataKiri`, berjarak 9 px seperti
  TOTAL; Excel satu indent), kepala tabel & kolom lain rata tengah.
- Cetak: A4 tegak, 1 halaman lebar, rata tengah, margin `CIPL_XL_MARGIN`,
  kepala tabel barang diulang tiap halaman (`printTitlesRow`). Tinggi
  (`ciplXlUkuranHalaman`): muat satu halaman -> tinggi otomatis; sedikit
  lebih (muat dengan skala >= `CIPL_XL_SKALA_MIN` 80%) -> `fitToHeight` 1,
  satu halaman seperti cetakannya; lebih panjang -> tinggi otomatis, dan
  bila bagian sesudah TOTAL (Packing details & tanda tangan) akan terbelah
  halaman (`ciplXlJagaBagianAkhir`, simulasi A4) pemisah halaman dipasang
  sesudah TOTAL.
- `ttExcel` (replika kisi) tetap ada; dipakai `ciplXlLembar` hanya untuk
  model tanpa spek. CI Kumho tanpa jenis kemasan ("Other references"
  saja) -- WOODEN PACKING di Packing details PL.

## Sistem tampilan (UI) -- komponen bersama

Identitas DDI tetap: navy + kuningan (`--sec-*`), kini dalam konsep
"Lajur" (papan jadwal pelabuhan): kanvas abu beton, lembar putih datar
bergaris tipis (tanpa bayangan kecuali yang melayang), navy HANYA di
sidebar, biru sinyal untuk aksi (`--p-600`), kuningan hanya untuk "hari
ini / sekarang" dan merek, merah-ambar-hijau hanya untuk status.

- **Berkas CSS & urutannya** (index.html): `tokens.css` (warna, huruf,
  jarak, sudut, bayangan -- NAMA token tidak berubah, hanya nilainya) ->
  `fonts.css` -> ... -> `system.css` (aturan lintas komponen) ->
  **`desain.css`** (lapisan penimpa konsep Lajur) -> `date-input.css`
  -> `lebar-isian.css` (HARUS terakhir). Tidak ada deklarasi yang ditulis
  di dua lapisan: bila desain.css (atau aturan mana pun) menimpa selektor
  yang persis sama di konteks @media/@container yang sama, deklarasi lama
  DIHAPUS, bukan dibiarkan kalah -- dijaga uji "CSS: tidak ada deklarasi
  yang pasti tertimpa" (qa/dom-test.js; cadangan sengaja seperti
  `100vh` lalu `100dvh` di satu blok dikecualikan). Uji CSS yang butuh
  nilai berlaku membacanya lewat `nilaiCssBerlaku(pemilih, properti)`,
  bukan teks satu berkas.
  Bagian desain.css: A dasar, B sidebar, C kepala halaman `.board`,
  D panel & lembar, E tombol, F footer, G Jadwal, H Ringkasan, I form,
  J Cek PIB/PEB, K Masterlist / HS / Akun / Login (+K2 layar masuk),
  L kurs, M huruf kecil & kotak hitung, N panel detail & Cari cepat.
- **Huruf dikemas sendiri** (`css/fonts.css`, `assets/fonts/*.woff2`,
  lisensi OFL di `assets/fonts/LISENSI.txt`), tanpa Google Fonts: tetap
  tampil saat offline dan tidak ada pergeseran saat huruf pengganti
  dipasang. IBM Plex Sans = seluruh antarmuka; **Barlow Condensed**
  (`--font-board`) = judul halaman, angka besar, tanggal, merek -- seperti
  papan penunjuk di pelabuhan; IBM Plex Mono = hanya pengenal (no. aju,
  B/L, invoice, HS Code, nilai kurs). Label kecil memakai huruf
  antarmuka, bukan huruf papan (terlalu rapat pada 11px).
- **Label berhuruf biasa**: tidak ada lagi label struktur huruf besar
  berjarak renggang; ukuran & bobot yang membedakannya dari isi data.
- **Kepadatan daftar jadwal** (`ui/kepadatan.js`, tombol Ringkas /
  Nyaman di bilah kendali; diingat di `exim.kepadatan`): Ringkas
  menyembunyikan rincian & catatan kartu lewat CSS
  (`html[data-kepadatan="ringkas"]`) -- murni tampilan, data tak berubah.
  NAMA BARANG tetap tampil di Ringkas, di KANAN baris tanggal
  (`barangRingkasHtml`: kolom keempat bergaris kiri; panel < 900px kisi
  2x2 ETD | ETA, Estimated Delivery | Nama Barang; paling banyak dua nama +
  "+n lainnya", daftar utuh di tooltip; kartu selesai juga). Lencana &
  progres dokumen satu wadah (`cardDokumenHtml`, `.ship-dokumen`): di
  Ringkas lencana kiri, hitungan progres kanan, stepper di bawahnya;
  garis tipis di atas baris lencana DAN di atas stepper (ponsel < 576px:
  lencana & hitungan bertumpuk berjarak).
- **Layar masuk**: dua kolom di layar >= 900px (papan navy dengan lajur
  status Diproses -> Transit -> Tiba -> Dokumen lengkap, penanda kuningan
  berjalan satu kali; formulir di kanan), satu kolom di ponsel.

- **Warna teks** lolos AA (4,5:1): `--text-subtle` (n-500) untuk teks
  redup, `--text-placeholder` (4,54:1) untuk teks contoh, `--s-warn-ink`
  untuk TEKS peringatan (`--s-warn` hanya ikon & garis). `--n-400` bukan
  warna teks. Hijau `--s-success` hanya untuk "berhasil".
- **Tombol**: satu tinggi (`--ctl-h` 38px; 40px di kaki dialog), satu
  sudut (`--r-md`) & satu ukuran huruf untuk utama (`.btn-primary-navy`,
  `.btn-teal`, `.btn-save-primary`), kedua (`.btn-quiet`,
  `.btn-form-cancel`), tinta (`.btn-import-excel`), merusak (`.btn-danger`,
  `.btn-outline-danger`), ikon (`.icon-btn`, `.btn-more`). Hover menggelap
  tanpa melompat; sibuk = pemutar + kursor tunggu.
- **Toast** (`ui/feedback.js`): `showToast(pesan, jenis, { judul, tetap })`
  -- judul singkat per jenis (Berhasil / Terjadi kesalahan / Perhatian /
  Info; "dark" = success, "error" = danger), garis sisa waktu, jeda saat
  tombol tutup difokus / tab tersembunyi, pesan sama tidak berkedip
  ulang. `tetap: true` (dan pesan berisi `migration-*.sql`) menunggu
  ditutup. Pembaca layar lewat `#toastSuara`; posisinya tetap murni CSS.
- **Dialog**: kepala (ikon, judul, tombol X `.dialog-tutup`) & kaki di
  luar badan, `modal-dialog-scrollable` -- tombol aksi selalu terlihat.
  Konfirmasi (`.dialog-ringkas`, 460px): judul berupa pertanyaan,
  kalimat menjelaskan akibatnya, tombol menyebut tindakannya ("Hapus
  Jadwal"). X / Esc / klik di luar = batal tanpa memilih.
- **Tooltip** (`ui/tooltip.js`): `title` pada tombol & tautan tampil
  sebagai tooltip aplikasi -- saat disorot DAN saat difokus lewat Tab.
- **Label**: setiap isian punya label yang terhubung (`<label for>`
  atau `aria-label` untuk sel tabel); placeholder hanya contoh.
- **Mode gelap** (`core/tema.js`; menu akun "Tampilan": Terang / Gelap /
  Ikuti sistem, tersimpan per peramban `ss-tema`): `data-tema` di
  `<html>` + `data-bs-theme` untuk Bootstrap. Nilainya di blok
  `:root[data-tema="gelap"]` css/tokens.css, hanya `@media screen` --
  cetakan selalu terang. Rampa netral dibalik, latar aksen (navy,
  kuningan) tetap. TEKS beraksen pakai `--tp-*` / `--tsec-*` / `--ts-*`
  (bukan `--p-*` / `--s-*`, yang di mode gelap tetap warna isian); warna
  komponen pakai token `--w-<bg|garis|teks>-<hex>`. Warna baru: token,
  bukan hex lepas.
- **Kartu jadwal** (render/cards.js, css/card.css): judul (pihak, jumlah
  barang, nomor dokumen & No. Aju) → peringatan (`cardAlertsHtml`: telat,
  kebutuhan pabrik, lartas) → **panel perjalanan** (`shipJourneyHtml`:
  keadaan sekarang sebagai judul, jalur dengan kode + nama pelabuhan,
  baris tanggal ETD / ETA / Estimated Delivery, strip delay) → rincian
  (incoterm & nilai di bawah nomor invoice, jenis muatan di sel
  kontainer; dipisah GARIS TIPIS + jarak dari baris tanggal supaya
  keterangan tanggal tidak menyambung ke label rincian) → lencana
  fasilitas → progres dokumen ("Berikutnya: …") → kronologi. Garis
  pemisah selalu garis penuh tipis, tidak putus-putus.
  Kolom tanggal mengikuti lebar PANEL (kueri wadah `perjalanan`), bukan
  layar.
- **Satu model kotak tanggal** (`kt-nilai`, css/date-input.css): SEMUA
  kotak tanggal -- kartu, form jadwal, No. Dokumen, kotak dialog, tabel
  isian -- diberi kelas `kt-nilai` oleh js/ui/date-input.js (kecuali
  Dari/Sampai pemilih rentang, `data-kotak-tanggal-tanpa-ikon`): kotak
  BERBINGKAI (selalu, bukan hanya saat disorot -- supaya tidak menyaru
  jadi teks), huruf tegas berangka tabular, ikon kalender pucat yang
  menebal saat disorot, latar tipis saat disorot, cincin fokus saat
  diketik, penunjuk tangan di atas ikonnya (`kt-di-ikon`); klik pertama
  memilih seluruh tanggal. LEBARNYA SELEBAR TANGGALNYA di mana pun
  (field-sizing; paling sempit selebar "dd-mm-yyyy" -- `min-width`
  9,7ch + padding lewat variabel `--kt-kiri` / `--kt-kanan` -- jadi kotak
  kosong & berisi sama lebar dan tidak menyusut mengikuti ketikan yang
  belum utuh). Tinggi mengikuti tempatnya: 30px di kartu, setinggi
  tetangganya di form/dialog/tabel (38px / 32px `.form-control-sm`). Ruang
  sisa diatur TATA LETAKNYA (`.fl-bertanggal`, `.fl-tanggal`, lajur
  `max-content` -- lihat "Lebar isian"), bukan dengan melebarkan kotaknya
  (sempat dicoba: kotak 300-an px untuk sepuluh angka). Hanya-baca (kartu
  selesai, kartu bagi Viewer / Marketing / Finance) = nilai polos tanpa
  bingkai, ikon & cincin fokus. Kartu peran baca-saja menggambar
  tanggalnya `readonly tabindex="-1"` dan status `disabled` SEJAK
  DIGAMBAR (`atributKendaliKartu`, cards.js) -- bukan disamarkan CSS:
  dulu kotaknya tetap bisa difokus lewat label/Tab, ikon kalendernya
  tergambar berulang, dan status bisa diganti panah papan ketik. Ikon
  kalender: gambar, ulang, posisi & ukurannya di SATU aturan; sorot /
  fokus / tema gelap / layar sentuh hanya mengganti `--kt-ikon` (aturan
  keadaan yang memasang background-image sendiri bisa berulang begitu
  ada shorthand `background:` di antaranya). Tetap
  bisa diketik format apa pun & tetap punya kalender. Di kartu, di
  bawahnya keterangan SEBARIS dengan harinya (`hariTanggalKartu`,
  `keteranganEtaKartu`, `predictionStripHtml`).
- **Kerangka muat** (`showLoadingSkeleton`, data/api.js; css/dashboard.css):
  kartu kerangka berbentuk kartu jadwal (judul & status, jalur, tiga
  tanggal, progres) yang MENGISI LAYAR sampai tepi bawah -- wadahnya
  setinggi sisa layar (`--kerangka-atas`, diukur di bingkai berikutnya
  lewat requestAnimationFrame: mengukur saat itu juga memaksa seluruh
  halaman ditata di tengah pembukaan aplikasi), banyaknya kartu dari
  tinggi layar; warna baloknya token `--kerangka` / `--kerangka-kilau`
  (mode gelap punya pasangannya sendiri, --n-100 nyaris sama dengan
  --surface).
- **Pengalih Auto/Manual di form** (`.fl-mode`, components.css): di BAWAH
  kotak ETA & Estimated Delivery, sekecil & sewarna penanda Auto/Manual
  di kartu (Auto kuningan, Manual navy + pin), tidak lebih lebar daripada
  kotaknya -- kepala kedua kelompok itu cuma label, sebaris rapi dengan
  ETD & In Factory. Chip "Auto"/"Manual" di samping label dicabut (hanya
  mengulang pengalihnya); tombol yang berlaku ditandai `is-active` +
  `aria-pressed` (`tandaiSakelarMode`, prediction-ui.js). Keterangan di
  bawah Estimated Delivery ikut mode: "Dihitung otomatis." / "Dikunci
  untuk laporan." (`[data-ket-mode]`).
- **Bilah ringkasan** (Total / In Process / Delayed / Arrived) di layar
  <= 991px = kisi 2x2 bersekat garis tipis antarkolom & antarbaris
  (desain.css bagian G), bukan lajur lentur 3 + 1 yang rapat.
- **Sekat kartu**: tiap bagian kartu berjalan dipisah garis tipis penuh --
  kepala (judul, tombol, peringatan) | perjalanan & tanggal | rincian |
  progres dokumen | kronologi; di Ringkas: kepala | tanggal & nama barang
  | lencana & hitungan progres | stepper.
- **Penanda mode & keyakinan** (render/prediction-view.js): Auto
  (kuningan) / Manual (navy + pin) berbingkai tipis huruf biasa
  (`modeChipHtml`); keyakinan = meteran lima ruas + "60% · Sedang"
  (`confidenceChipHtml`). Tanggal hasil hitungan bertinta SAMA dengan
  tanggal lain -- penandanya chip Auto di bawahnya (`.date-field--auto`
  hanya penanda, tanpa warna; biru = bisa diklik).

## Nomor dokumen: ditentukan database

Nomor terbit dari fungsi database `next_document_number` (nomor urut di
`document_number_counters`), bukan dari peramban: dua orang yang menekan
Ajukan Nomor bersamaan dilayani bergiliran -- yang lebih dulu sampai
mendapat 346, berikutnya 347. "Nomor berikutnya" di layar hanya
perkiraan (`data-pasti` = sudah dibaca dari nomor urut); kalau yang
terbit berbeda, pengguna diberi tahu di bawah tombol Ajukan.

`next_document_number` atomik (`insert ... on conflict do update ...
returning`), dan constraint `document_numbers_number_unique` /
`_seq_unique` menolak nomor kembar dalam satu seri: nomor yang ternyata
sudah tersimpan (nomor urut di belakang) langsung diganti nomor
berikutnya oleh `submitDocNumRequest` -- paling banyak `DN_COBA_NOMOR`
kali.

## Database: aturan akses & optimasi

`migration-optimasi-database.sql` (sekali jalan di SQL Editor; data
tidak disentuh; dibatalkan persis oleh `migration-optimasi-database-
batal.sql`):
- **Akses**: semua yang login MEMBACA; hanya EXIM yang MENULIS -- satu
  policy per perintah, peran dibaca sekali per perintah
  (`(select public.is_exim())`, bukan per baris). Policy `dn_all` /
  `dnc_all` (terbuka untuk semua peran, termasuk anon) dihapus.
- **Fungsi nomor** (`next_document_number`, `delete_document_number`,
  `set_document_counter`, `reset_document_series`): `assert_exim()`
  dulu, search_path tetap. `set_fund_paid` (EXIM & Finance) mencari
  lewat primary key.
- **Bukti bayar** (`migration-bukti-bayar.sql`, sesudah berkas ini):
  Finance boleh mengunggah & menghapus HANYA di folder `bukti-bayar/`
  bucket `lampiran-jadwal`; `set_fund_paid(text, date, jsonb)`
  menggantikan versi dua argumen (dibuang -- dua versi = PGRST203),
  menyimpan `paidProof` hanya dari rujukan `bukti-bayar/<id itu>/` dan
  menghapusnya saat lunas dibatalkan. Menjalankan ulang migrasi lama yang
  membuat versi dua argumen -> jalankan berkas ini lagi.
- **Tanggal Dibutuhkan di Pabrik oleh Viewer** (`migration-tanggal-pabrik-viewer.sql`):
  fungsi `set_needed_date(p_id text, p_tanggal date)` -- SECURITY
  DEFINER, hanya peran exim & viewer, hanya kolom `needed_date` jadwal
  Import (selain itu P0002 / 42501); viewer tetap tanpa izin UPDATE ke
  `shipments`. Diuji di Postgres 16: viewer mengisi & mengosongkan,
  Export / id asing / marketing / tanpa login ditolak, anon tanpa hak.
- **Urutan barang** (`migration-urutan-barang.sql`): kolom
  `shipment_items.urutan` (1 = barang pertama = Seri Barang 1), ditulis
  setiap simpan (`sisipkanBarang`) dan dipakai saat memuat
  (`urutkanBarisBarang`, core/mapping.js). Tanpa kolom itu barang
  terbaca dalam urutan FISIK barisnya, dan simpan ulang (hapus semua +
  sisipkan) menggesernya: diuji di Postgres, Seri 1-14 terbaca kembali
  9..14, 1..8 -- Seri Barang di tabel barang & Cek PIB/PEB ikut teracak
  walau impornya sudah urut seri. Barang lama diberi urutan yang tampil
  saat migrasi (urutan fisiknya, aman diulang); jadwal yang terlanjur
  teracak dibetulkan dengan impor ulang draft CEISA-nya lalu Simpan.
  Sebelum dijalankan: barang tetap tersimpan tanpa urutannya + toast
  nama berkasnya (tidak ditimpa "Jadwal berhasil disimpan.",
  `toastMigrasiKe` di ui/feedback.js).
- **Tagihan ganda serentak**: pemicu `dn_cegah_tagihan_ganda` memeriksa
  ulang nomor invoice / billing Pengajuan Dana di database, bergiliran
  per nomor tagihan (advisory lock), aturan pembanding sama dengan
  aplikasi (`dn_kunci_tagihan` = `dnPecahNomorTagihan` +
  `dnKunciNomorTagihan`), dicari lewat index GIN
  `document_numbers_dana_invoice_idx` / `_billing_idx`. Tolakannya
  (`TAGIHAN_GANDA:...`, `dnTolakanTagihanGanda`) tampil sebagai pop-up
  tagihan ganda biasa. Ubah isian yang tidak mengganti nomor tagihannya
  (Paid / Unpaid, salah ketik lain) tidak diperiksa.
  **Pengecualian No. Invoice** (`migration-invoice-boleh-sama.sql`):
  vendor yang isian No. Invoice-nya bukan nomor tagihan (JNE: nomor
  rekening tujuan bayar) boleh mengulang nomornya. Daftar vendornya
  diatur pengguna EXIM di kotak "Aturan No. Invoice" (halaman Nomor
  Dokumen, tab Pengajuan Dana; `features/fund-invoice-sama.js`),
  tersimpan di `report_settings` kunci `fund-invoice-boleh-sama`
  (`{"vendor":[...]}`, bawaan JNE & Jalur Nugraha Ekakurir) dan dibaca
  KEDUA sisi: form (`fundInvoiceBolehSama`, dipakai `dnTagihanBolehSama`)
  dan pemicu database (`dn_tagihan_boleh_sama`, membaca daftar yang
  sama). Pencocokan per kata utuh -- "JNE" mengenai "PT JNE EXPRESS",
  bukan "JNEXT"; aturan nama yang sama ditulis di JS dan SQL (dijaga
  tes). Hanya No. Invoice, dan hanya bila pengajuan yang disimpan milik
  vendor di daftar: Nomor Billing tetap diperiksa, vendor lain tetap
  ditolak (juga terhadap nomor yang dipakai vendor di daftar). Vendor
  yang masuk daftar kehilangan perlindungan bayar-ganda untuk No.
  Invoice-nya. Jalankan migrasinya SEBELUM aplikasi baru dipakai --
  database lama masih menolak, dan nomor urut sudah terambil saat
  tolakan datang (nomor bolong); form menerjemahkan tolakan itu jadi
  petunjuk menjalankan migrasinya (`dnGalatInvoiceSama`). Pembatal:
  `migration-invoice-boleh-sama-batal.sql`.
  **Invoice ke-2 & debit note** (`migration-tagihan-ganda-dokumen.sql`,
  berdiri sendiri, menggantikan pemicu kedua migrasi di atas): SEMUA
  nomor tagihan sebuah pengajuan -- No. Invoice utama + `payload.dokumen`
  (invoice / debit note tambahan) -- dibandingkan dengan semua nomor
  pengajuan lain (`dn_kunci_tagihan_dokumen`, index GIN
  `document_numbers_dana_invoice_semua_idx`). Saat diubah hanya nomor
  yang BARU ditambahkan yang diperiksa; pengecualian vendor berlaku juga
  untuk dokumen tambahannya; tolakan tetap `TAGIHAN_GANDA:invoiceNo:...`.
  Aplikasinya memakai aturan yang sama (`dnNomorTagihan`, `dnDokTagihan`
  di `views/docnum-view.js`): cek langsung, cek saat Ajukan / Simpan
  (kueri juga `payload->>dokumen`), kotak dokumen tambahan yang kembar
  ditandai merah di barisnya sendiri. Pembatal:
  `migration-tagihan-ganda-dokumen-batal.sql` (pemicu kembali ke versi
  sebelumnya dulu, baru fungsi & index barunya dihapus);
  `migration-optimasi-database-batal.sql` ikut menghapus index & fungsi
  baru itu SEBELUM `dn_kunci_tagihan`.
- `hs_code_master.created_by` `on delete set null`: akun yang pernah
  menambah HS Code bisa dihapus.

## Keamanan

Kunci publishable di `js/config.js` terbaca oleh siapa pun yang membuka
situsnya. Itu memang disengaja: penyerang bisa memanggil Supabase
langsung, tanpa aplikasi ini. Penjaga sebenarnya ada tiga: RLS di
database, CSP di peramban, dan escape setiap teks yang ditulis ke HTML.

- **Akun baru `nonaktif`** (`migration-keamanan.sql`). Pendaftaran Supabase
  terbuka, karena halaman Akun membuat akun lewat `auth.signUp`. Dulu
  setiap pendaftar langsung menjadi viewer yang emailnya terverifikasi, dan
  bisa membaca semua jadwal, invoice, pengajuan dana, profil, dan lampiran.
  Kini setiap akun baru berperan `nonaktif`. Kebijakan baca & lampiran
  menuntut `public.peran_aktif()`. Halaman Akun langsung menetapkan peran
  Viewer (`registerAccount`). Akun nonaktif dikeluarkan dengan pesan, baik
  saat login maupun saat dinonaktifkan di tengah sesi (`akunNonaktif`).
  Hitungannya tampil di kepala halaman Akun.
  MENJALANKAN ULANG migrasi lama yang membuat kebijakan
  `using (true)` membuka celahnya lagi: jalankan `migration-keamanan.sql`
  sesudahnya.
- **Uji dari luar**: `qa/uji-penetrasi.sql` (SQL Editor, aman di database
  sungguhan: semua percobaan menulis dibatalkan, akun ujinya dihapus).
  Yang dicoba: pendaftar mandiri, pengunjung tanpa login (anon), dan
  viewer yang mencoba menulis. Semua vonis harus AMAN.
  `qa/ekspor-skema.sql` mengekspor struktur (tanpa data) untuk ditinjau.
- **anon**: hak tabel & fungsi dicabut, kecuali `email_for_login`. Fungsi
  itu kini selalu menjawab dengan alamat email (username tak terdaftar
  dijawab alamat bentukan), jadi daftar username tidak bisa ditebak.
- **CSP** (`core/csp.js`, skrip PERTAMA di `<head>`, memasang
  `<meta http-equiv="Content-Security-Policy">` lewat DOM). JANGAN
  menulisnya sebagai tag meta di `index.html`: tag meta CSP di HTML
  mematikan pemindai pramuat Chrome, ±130 skrip lalu diunduh satu per
  satu -- di jaringan 10 Mbps / 40 ms, membuka aplikasi dengan tembolok
  kedaluwarsa jadi ±10 detik sampai papan tampil (vs ±3,5 detik), dan klik
  Masuk menunggu ±9,5 detik (dijaga tes). Kebijakan yang dipasang lewat
  DOM sama ketatnya (diuji di peramban). Isinya: tidak ada skrip atau
  penangan sebaris, tidak ada `eval`. Pustaka CDN diizinkan per paket & versi,
  bukan seluruh jsDelivr. Form pakai `data-tanpa-kirim` (`ui/dom.js`),
  bukan `onsubmit`. Tombol pakai `data-*` + pendengar, bukan `onclick`.
  Menaikkan versi pustaka, mengganti proyek Supabase, atau mengganti
  lembar kurs = perbarui CSP juga (dijaga tes).
- **SRI**: Bootstrap, Bootstrap Icons, supabase-js, dan ExcelJS ber-`integrity`
  (sha384 berkas npm-nya). Cara menghitung hash versi baru:
  `npm pack <paket>@<versi>`, lalu `openssl dgst -sha384 -binary <berkas> | openssl base64 -A`.
  SheetJS dari `cdn.sheetjs.com` (0.20.3). Versi npm berhenti di 0.18.5,
  yang rentan CVE-2023-30533 & CVE-2024-22363 saat membaca berkas buatan
  orang lain.
- **Anti-bingkai** (`core/anti-bingkai.js`, sesudah `core/csp.js`):
  halaman disembunyikan bila dimuat di dalam iframe situs lain
  (clickjacking). GitHub Pages tidak bisa mengirim X-Frame-Options.
- **Salin ke Excel**: sel berawalan `= + - @` diberi awalan `'`
  (`selAmanRumus`). Nama barang dari CIPL vendor tidak bisa menjadi rumus
  saat ditempel.
- **Lampiran**: jenis berkas diperiksa dari ekstensi (`LAMPIRAN_JENIS`), dan
  Content-Type dikirim sesuai ekstensi itu. Bucket privat, maks. 20 MB,
  dengan daftar jenis yang sama (bukan HTML / SVG / skrip).
- **`.gitignore`**: kunci, `.env`, dump & CSV database, dokumen kerja
  (PDF/Excel/Word/ZIP), dan seluruh `qa/` tidak ikut ter-push. Fixture uji
  berisi teks dokumen asli (NPWP, rekening, email vendor), dan GitHub Pages
  menerbitkan setiap berkas yang di-commit ke internet. `js/config.js` tetap
  di-commit karena kuncinya publishable. Kunci `service_role` /
  `sb_secret_…` dan sandi database tidak boleh ada di repositori ini.

## Pembaruan langsung (realtime)

Simpanan satu pengguna tampil di layar pengguna lain tanpa memuat ulang
halaman (`data/realtime.js`, Supabase Realtime lewat WebSocket -- paket
Free cukup, GitHub Pages tetap cukup). Sekali jalan:
`migration-realtime.sql` mendaftarkan tabel aplikasi ke publication
`supabase_realtime` (aman diulang; pembatal `migration-realtime-
batal.sql`). Keadaannya di menu akun ("Pembaruan langsung": Aktif /
Aktif sebagian / Menyambung… / Belum aktif -- EXIM diberi tahu sekali
per sesi bila migrasinya belum dijalankan).
- **Satu kanal per tabel** (`RT_TABEL`), `postgres_changes_options.wait`
  -- tabel yang belum terdaftar hanya mematikan kanalnya sendiri.
- **Kabar = pemicu.** Jadwal yang dikabarkan diambil ulang SATU PER SATU
  (`kueriShipments().in("id", ...)`), digabung per jeda
  (`RT_JEDA.jadwal`: barang & terminal transitnya disimpan menyusul),
  dipasang di tempatnya; > `RT_BATAS_TERTARGET` sekaligus (Bulk Import)
  = muat ulang penuh DIAM-DIAM (`loadShipments({ diam: true })`: tanpa
  kerangka muat; gagal -> papan yang ada tetap). Penulis menyiarkan id
  jadwalnya SESUDAH semua tersimpan (`realtimeSiarkanJadwal`; Bulk
  Import sekali untuk semua). Gema simpanan sendiri dilewati
  (`realtimeCatatTulis` sebelum menulis); siaran tidak pernah.
- **Tampilan**: papan (`render()` -- fokus & gulir tetap), Ringkasan,
  panel detail (`segarkanDetailView`), form Ubah jadwal TIDAK ditimpa --
  pemberitahuan + "Muat versi terbaru" (`tandaiFormDiubahLain`), lonceng
  notifikasi, pilihan jadwal & No. AJU di halaman Nomor Dokumen (kotak
  cari yang sedang diketik tidak ditimpa). Nomor Dokumen: salinan Pengajuan Dana dipasangi barisnya
  (`realtimePasangBaris`: `bkTerapkanBaris`, `fsumTerapkanBaris`,
  `lapTerapkanBaris` -- tanpa memuat ulang semua pengajuan), tanda
  "sudah diajukan" dihitung ulang seketika, riwayat digambar ulang
  diam-diam (`renderDocNumHistory({ diam: true })`,
  `realtimeGambarUlang`: ditunda selagi pilihan / menu dipakai, fokus
  kembali), "nomor berikutnya" dibaca ulang tanpa berkedip, pop-up Ubah
  isian / Detail ikut tahu. Pengaturan (`report_settings`) dimuat ulang
  per kunci oleh pemiliknya; Masterlist, HS Code (juga tanda lartas di
  papan), Akun, dan profil sendiri (peran baru langsung berlaku) ikut.
- **Sambung ulang** (laptop tidur, jaringan putus): kabar selama
  terputus hilang -> data yang dipakai dimuat ulang diam-diam begitu
  kanalnya tersambung lagi. Detak sambungan berjalan di Web Worker
  (`config.js`, `realtime.worker`) supaya tab di latar tidak terputus.
- Penjaga terakhir tetap database (nomor dokumen & tagihan ganda) --
  kabar realtime hanya memperpendek jeda layar basi.

## Performa

- **Simpan form jadwal** (`data/api.js`): jadwal, barang & terminal
  transit ditulis BERSAMAAN (`tungguSemua` menunggu semua jalur sebelum
  melempar galat -- tombol Simpan tidak aktif lagi selagi barang masih
  dihapus/disisipkan). Barang / transit yang sama dengan saat form
  dibuka (`sidikAsalForm` = `sidikIsiJadwal`) tidak ditulis ulang, cukup
  ikut terbaca di jawaban simpan jadwalnya. Jawaban simpan (baris +
  barang + transit) langsung dipasang ke papan (`terapkanJadwalTersimpan`)
  -- tanpa memuat ulang seluruh jadwal; muat penuh hanya bila papan
  belum termuat, ada muat penuh di jalan, atau jawabannya tidak lengkap.
  Ubah isian jadwal saja = 1 permintaan (dulu 5 + muat ulang semua).
- **`:has()`**: jangan di `<html>` / `body`, dan jangan dengan kelas yang
  sering berganti (`.show`, `.d-none`) di argumennya -- tiap pergantian
  di mana pun memeriksa ulang dokumen (terukur ~1 ms per hitung gaya,
  50-100x lebih lambat). Halaman aktif = `html[data-halaman]` (dipasang
  `showPage`); menu salin di kartu = `.ship-card.is-menu-buka`.
- **Ukur teks** (`measureTextWidth`, ui/dom.js) lewat kanvas, bukan
  elemen ukur di DOM: tidak memaksa tata letak.
- **Mulai**: `routerSesudahMuat` tidak menggambar ulang daftar yang
  baru saja digambar `loadShipments` (dan tidak menimpa layar "Data
  tidak bisa dimuat").
- **Jangan memaksa tata letak di tengah penggambaran.** Membaca ukuran
  (getBoundingClientRect, offsetHeight, scrollWidth) sesudah menulis DOM
  memaksa seluruh halaman ditata saat itu juga -- lalu ditata lagi
  sesudah tulisan berikutnya. Yang perlu ukuran diukur di bingkai
  berikutnya (`requestAnimationFrame`: jarak atas kerangka muat, geser
  tab aktif No. Dokumen `dnTabAktifTerlihat`), atau dibaca dari yang
  sudah tersedia (ResizeObserver: `borderBoxSize`; tinggi bilah lengket
  dibaca semua dulu baru ditulis, dan hanya yang berubah -- variabel di
  `:root` diwarisi seluruh halaman). Belum digulir = posisi daftar
  sebelum form tidak perlu mengukur kartu (`catatPosisiDaftar`). Saat
  aplikasi dibuka kini tidak ada pemaksaan tata letak sama sekali (dulu
  ±40ms).
- **Pencarian daftar**: teks cari tiap jadwal (`teksCariJadwal`, semua
  kolom + barang) diingat selama mengetik (`teksCariIngat`, list.js) --
  dibuang setiap kali daftar digambar ulang karena sebab lain, jadi teks
  basi tidak pernah dipakai.

## Uji

`qa/engine-test.js` (mesin prediksi, Node `vm`) & `qa/dom-test.js`
(jsdom, seluruh index.html) membaca fungsi langsung dari lingkup global
skrip -- berkas di `js/` tidak punya `module.exports`. Pembantu yang
hanya dibutuhkan uji (halaman CIPL tunggal, riwayat prediksi tiruan,
`isWorkingDayISO`) ada di berkas ujinya, bukan di `js/`.

## Peta file

| File | Isi |
|---|---|
| `config.js` | Koneksi Supabase, STATUS_META, MODE_LABELS, JENIS_OPTIONS, SKB_TYPE_OPTIONS. `normalisasiJenisBarang()` membakukan ejaan jenis barang ("SPARE PART", "SPARE-PARTS" -> SPAREPART) Klien dibuat dengan `realtime.worker` (detak realtime di Web Worker, lihat "Pembaruan langsung (realtime)"). |
| `core/csp.js` | Content-Security-Policy (`CSP_KEBIJAKAN`), dipasang sebagai `<meta>` lewat DOM oleh skrip PERTAMA di `<head>` -- bukan tag meta di HTML, yang membuat Chrome mengunduh ±130 skrip satu per satu (login & muat ulang 4–10 detik). Daftar asal yang diizinkan per paket & versi |
| `core/anti-bingkai.js` | Anti-clickjacking: dimuat di dalam iframe situs lain -> halaman disembunyikan & jendela teratas diarahkan ke alamat aplikasi. Skrip KEDUA di `<head>`, sesudah csp.js (GitHub Pages tidak bisa mengirim X-Frame-Options) |
| `core/tema.js` | Mode gelap: Terang / Gelap / Ikuti sistem (`setTema`, `terapkanTema`; `data-tema` & `data-bs-theme` di `<html>`, tombol `[data-tema-pick]` di menu akun). Dimuat di `<head>` sebelum CSS, mandiri. Warnanya di css/tokens.css |
| `core/kurs.js` | KURS TERBARU DARI GOOGLE SHEET (sheet "KURS", id & gid di `KURS_SHEET_*`). Membaca lewat gviz (JSON, JSONP, CSV, JSON-gid -- berurutan sampai ada yang berhasil), menyimpan salinan di `exim.kurs.sheet` (segar 10 menit, basi 8 hari). `kursMuat({paksa})` -> `{ok, dariCache, galat, data}` (tidak pernah menolak), `kursCari(kode)`, `kursUsd()`, `kursBandingkan(ndpbmDraft, kode)` (JPY: sheet per 100, NDPBM per 1 yen; `skalaMentah` = draft salah skala), `kursPantau(fn)`, `kursPasang(daftar, opsi)` (kait uji). **Dipakai HANYA di Cek PIB/PEB (checker-view.js) dan tombol Sync kurs (features/kurs-sync.js)** -- dijaga qa/dom-test.js; laporan biaya & dana tetap `kursNdpbm` (customs.js, NDPBM jadwal terdekat tanggalnya) karena sheet tidak bertanggal. Dimuat sesudah customs.js |
| `features/kurs-sync.js` | Tombol "Sync kurs terbaru" di kotak NDPBM form jadwal. NDPBM jadwal TIDAK PERNAH berubah sendiri (membuka / mengedit / menyimpan tidak menyentuhnya); kurs USD sheet hanya masuk ke kotak saat tombol ditekan, lalu berlaku bila jadwal disimpan. Keterangan di bawah kotak (`#kursSyncInfo`, `data-status` = info / sama / beda / kosong), tombol "Kembalikan <nilai lama>" (`#btnSyncKursKembali`); gagal baca / hanya salinan = isian tak diubah + toast. Dimuat sesudah form-router.js (`kursSyncMulai()` dipanggil saat form dibuka: hanya membaca kurs & menggambar keterangan) |
| `ui/kepadatan.js` | Tombol Ringkas / Nyaman (`#btnKepadatan`): `html[data-kepadatan]` + `aria-pressed`, diingat di `exim.kepadatan` (penyimpanan diblokir: tetap bisa bolak-balik, keadaan dibaca dari `<html>`). Murni tampilan. Dimuat sesudah sidebar.js |
| `core/helpers.js` | Formatter tanggal/angka (angka di layar & cetakan koma ribuan, titik desimal: `fmtRp`, `fmtRpPresisi`, `fmtNum`), escapeHtml, factory objek baru (newItem/newSkbEntry/newStop). Kolom barang CEISA & nama barang: `KOLOM_NAMA_BARANG`, `newItem(mode)` (Kode Barang "-", Merek TANPA MEREK, Tipe TANPA TIPE di Import), `itemDisplayName()` = kolom kiri ke kanan tanpa tanda kosong (`rapiBagianNama`: "-", TANPA MEREK/TIPE/...) dan tanpa bagian yang sudah tertulis -- satu aturan untuk kartu, salinan, laporan, surat & CIPL; `barangBerkolomCeisa()` membedakan barang lama (nama utuh di Uraian). Kode CEISA per barang: `KONDISI_BARANG` / `kodeKondisiBarang()` / `labelKondisiBarang()` (1 = BARU, 2 = BUKAN BARU; bawaan Import 1, Export kosong). Peti kemas di Container/Seal Number: `teksKontainer()` = "NOMOR / UKURAN / TIPE" per kontainer, `muatanDariKode()` (KODE JENIS KONTAINER F/L -> FCL/LCL). Jenis muatan & peti kemas hanya untuk kiriman laut (`muatanKiriman`, `kontainerKiriman`; isian lama di jadwal udara tidak ditampilkan / disalin). Pengecualian: kolom LCL/FCL Daily Import menulis LCL untuk kiriman udara (`muatanDailyImport`, features/copy-templates.js). DOKUMEN PELENGKAP: `KODE_DOKUMEN_CEISA` = nama seluruh kode dokumen pelengkap pabean (`namaDokumenCeisa`; kode di luar daftar tetap terbaca "Dokumen kode 123"); `kenaliDokumenPelengkap(dok, opsi)` menentukan peran satu dokumen -- dokumen pengiriman PI 959 / LS 958 / Polis 530 (`DOK_PENGIRIMAN`), fasilitas per barang (456 SKB PPN, 457 SKB PPh, 912 Masterlist, 860/861 COO), atau dokumen lain; kode umum (911, 999) / tak dikenal lewat label PDF, dan lewat nomornya bila `opsi.tebakNomor`. Satu jadwal: `s.dokPelengkap` = `{ pi: [], ls: [], polis: [], lain: [] }` -- tiap dokumen `{ nomor, tanggal }` (dokumen lain + `kode`), nomor yang sama tidak diulang (`tambahDokumenPengiriman`, `rapikanDokPelengkap`, `dokPelengkapKosong`); `dokPelengkapJadwal(s)` membacanya, atau menyusunnya dari kolom lama (`pecahNomorDokumen`: "A, B" -> dua dokumen); `ringkasDokPelengkap()` = kolom lama (nomor "A, B" + tanggal dokumen pertama) untuk templat salin, Bulk Excel & data lama. `semuaKiriman()` = jadwal kedua buku. `tanggalDariAju()`: tanggal di nomor aju CEISA (karakter 13-20 = tahun-bulan-tanggal, `000020POL85820261016024172` -> 2026-10-16; tanda pisah diabaikan, yang tidak sah -> "") -- dipakai sebagai tanggal PIB/PEB BAWAAN, selalu bisa diubah. Format BEROPSI selalu lewat `angkaLokal()` / `tanggalLokal()` (formatter Intl disimpan) -- `toLocaleString(locale, opsi)` membangun formatter baru tiap panggilan. `kunciAlnum(v)` = SATU kunci pembanding nomor & nama (huruf besar, hanya A-Z 0-9: "PT. Abc-1" -> "PTABC1") -- dipakai nomor aju, BL/AWB, nomor invoice, nama pihak/customer, kode sarana angkut; jangan menulis normalisasi serupa lagi di berkas lain |
| `core/date-parse.js` | Pembaca tanggal yang DIKETIK: `bacaTanggalKetik(teks)` -> "yyyy-mm-dd" atau "" (murni string, tanpa DOM; diuji di qa/engine-test.js). Hari dulu baru bulan ("5/11/2026" = 5 November; bulan-hari hanya bila hari-bulan mustahil), tahun di depan = ISO, nama bulan Indonesia / Inggris / Romawi, lengkap atau singkatan (Agu, Agt, Ags, Agst, Okt, Des, Mei, Sept, ...), nama hari / "tgl" / jam di belakang diabaikan, tahun dua angka = yang terdekat dengan tahun ini, tahun tak ditulis = tahun ini, tanpa pemisah hanya 8 / 6 / 4 angka (panjang lain tidak ditebak), kata hari ini / besok / kemarin / lusa. Tanggal yang tidak ada ("31/04/2026") dan tahun di luar 1900-2100 DITOLAK, tidak digeser ke bulan lain. `tanggalIsoSah(iso)` = syarat penyetel `.value` kotak tanggal (hanya yyyy-mm-dd baku yang tanggalnya ada). "Hari ini" memakai `todayISO()` bila ada, supaya uji bisa membekukannya |
| `core/lartas.js` | Lartas per barang (buku Import): `kebutuhanLartas(s, items)` = PI / LS / SNI yang wajib beserta sebabnya -- HS Code bertanda di Database HS Code (`lartasHsCode`, peta per HS disusun ulang tiap `versiHsCode` berubah) atau barang bukan baru (PI, Permendag 24/2025 Pasal 5); `lartasKurang(s, items, dok)` = PI / LS yang wajib tapi belum bernomor. `FTA_INDONESIA` (perjanjian dagang yang berlaku untuk impor, form SKA-nya bila baku) & `petunjukFtaCoo(s, items)` = kalimat petunjuk COO menurut negara asal barang |
| `core/prediction-mundur.js` | Dibutuhkan di Pabrik: `rencanaMundur(s, butuh)` -> ETA paling lambat (pembagian dua atas `buildDeliverySchedule` kiriman "polos" berute sama, tanpa milestone & tanpa kapal) & ETD paling lambat (ETA - transit terpanjang), beserta langkah daratnya; `statusKebutuhan(s)` -> telat / mepet / aman (Estimated Delivery) atau tepat / telat (In Factory) |
| `core/state.js` | Satu-satunya tempat state mutable app: `data`, `activeMode`, `draftItems`, `draftStops`, `draftDokPelengkap` (PI, LS, Polis & dokumen lain di form), `currentDetailId`, `currentPage`, `pageSize` |
| `core/negara.js` | Kode negara ISO 3166-1 alpha-2 (Referensi Negara CEISA, KODE NEGARA ASAL): `DAFTAR_NEGARA` 249 negara (nama Indonesia, nama resmi ISO, nama Inggris lazim). `kodeNegara()` teks apa pun -> kode ("kr", "KOREA, REPUBLIC OF (KR)", "Korea Selatan", "South Korea", "KOREA"), `labelNegara()` "KR — Korea Selatan", saran `#negaraList` untuk kotak Kode Negara Asal (bisa diketik: kode atau nama) |
| `core/unlocode.js` | Referensi pelabuhan & bandara: satu daftar UN/LOCODE (`KRPUS`, `IDCGK`) yang dikenali dua arah dengan kode pendek gaya IATA (`PUS`, `CGK`): `resolvePortCode()`, `resolveUnlocode()`, `resolvePortCountry()`, `portDisplay()`, `portCodeLabel()`. ALIAS DOKUMEN `portKotaNegara()` = "KOTA, NEGARA" untuk isian yang tercetak (VNSGN -> "HOCHIMINH, VIETNAM", KRPUS -> "BUSAN, KOREA", IDJKT -> "JAKARTA, INDONESIA"): kota induk metro, nama tanpa kata Port/Airport/Terminal/International, ejaan dokumen di `PORT_KOTA_DOKUMEN`, nama negara singkat di `PORT_NEGARA_DOKUMEN` (KR -> KOREA, US -> USA); kode tak dikenal dikembalikan apa adanya. Dipakai Port of Loading & Final Destination Permintaan Nomor Invoice dan cetak CIPL/SI. `portKodeKeAlias()` = isian yang berisi UN/LOCODE POLOS (pengajuan lama menyimpan "KRPUS", atau kode yang diketik) -> aliasnya; teks lain apa adanya ("HOCHIMINH CITY, VIETNAM" yang ditulis sendiri tidak disentuh) -- dipakai form (saat isian berubah & saat pengajuan lama dibuka untuk diubah), kolom riwayat, rincian, dan cetak CI/PL/SI |
| `core/mapping.js` | Konversi baris Supabase (snake_case) <-> objek JS (camelCase). Barang: kolom CEISA `kode_barang`, `nama_barang` (Uraian), `merek`, `tipe`, `ukuran`, `spesifikasi_lain`, `kode_kondisi_barang`, `kode_negara_asal`; barang lama yang masih punya Pattern / Size / Mold No di kolom lamanya dilebur ke Uraian saat dimuat (`uraianBarangTersimpan`), kolom lama tidak ditulis lagi. Pengiriman: `pi_date`, `ls_date`, `polis_asuransi`, `polis_asuransi_date` (Tanggal PI & LS, Polis Asuransi -- migration-tanggal-pi-ls-polis.sql); `dokumen_pelengkap` jsonb = `s.dokPelengkap` (PI, LS, Polis lebih dari satu + dokumen lain -- migration-dokumen-pelengkap.sql), kolom lama tetap ditulis sebagai ringkasannya; jadwal sebelum kolom itu ada dibaca dari kolom lama. Barang: `pi_nomor` & `pi_no_item` (PI barang ini & nomor urutnya di dokumen PI). Barang dimuat menurut kolom `urutan` (`urutkanBarisBarang`; migration-urutan-barang.sql), bukan urutan jawaban database; baris tanpa urutan di belakang, urutan jawabannya |
| `core/referensi-ceisa.js` | `REF_CEISA`: tabel Referensi CEISA 4.0 ([kode, NAMA]) untuk pilihan Data PIB/PEB & nama tercetak di cetak draft. Dimuat sebelum core/data-pabean.js |
| `core/data-pabean.js` | Data PIB/PEB: daftar definisi isian per tab CEISA (`DP_GRUP`, `DP_PIHAK`, `DP_PUNGUTAN_*`, `DP_BARANG`; `dok` pib/peb), daftar pilihan (`DP_PILIHAN` dari `REF_CEISA`), kode <-> tampilan (`dpKodePilihan`, `dpNamaPilihan`), `rapikanDataPabean` (data lama dipindah ke bentuk berkode), nilai bawaan (`dpBawaan`, `terapkanBawaan`, `dpEfektif`; alamat & negara shipper yang dikenal `DP_PEMASOK` / `dpPemasok`), nilai dari jadwal (`dpNilaiHitung`, `dpDokumenJadwal`), baris datar untuk Bulk Excel (`dpKeBaris` / `dpDariBaris`, versi barang `dpBarangKeBaris` / `dpBarangDariBaris`) |
| `data/lampiran.js` | Lampiran di Supabase Storage (bucket privat `lampiran-jadwal`): `unggahLampiran` (berurutan; satu gagal -> yang sudah terunggah dihapus lagi), `hapusLampiran` (usaha terbaik), `bukaLampiran` (jendela dibuka dulu, alamat bertanda tangan menyusul -- tidak diblokir sebagai pop-up), `rapikanBerkas`, chip lampiran (`chipBerkasHtml`), pengelola lampiran kotak isian (`buatPengelolaBerkas`: lama / baru / dilepas; `kosong` = teks saat belum ada lampiran, "" = tanpa teks), isian showPrompt `type: "berkas"` (`isianBerkasHtml`, tulisan tombolnya `tombol`), tautan hanya-baca (`tautanLampiranHtml`), `semuaLampiranJadwal`, pesan galat yang menunjuk langkah berikutnya (`pesanGalatLampiran`) |
| `data/realtime.js` | Pembaruan langsung (Supabase Realtime): satu kanal per tabel (`RT_TABEL`), `realtimeMulai` / `realtimeBerhenti` (sesudah masuk / sesi berakhir), `realtimeDaftar(tabel, fn)` untuk penangan tiap berkas, gema sendiri (`realtimeCatatTulis`, `realtimeTulisanSendiri`), siaran jadwal tersimpan (`realtimeSiarkanJadwal`), sinkron jadwal tertarget / muat ulang diam-diam, `realtimePasangBaris`, `realtimeGambarUlang`, keadaan di menu akun (`realtimeKeadaan`, `rtGambarStatus`), pengaturan per kunci (`RT_PENGATURAN`). Lihat "Pembaruan langsung (realtime)" |
| `data/api.js` | Semua panggilan CRUD ke Supabase (load/create/update/persistFields). `simpanTanggalPabrik(id, tanggal)`: Tanggal Dibutuhkan di Pabrik lewat fungsi database `set_needed_date` (Viewer & EXIM, hanya kolom needed_date jadwal Import); fungsinya belum ada -> EXIM menulis langsung, Viewer diberi tahu berkas migrasinya. `loadShipments({ diam: true })` = muat ulang di latar (realtime). Menulis jadwal mencatat gemanya (`realtimeCatatTulis`); simpan form & jadwal baru menyiarkan id-nya sesudah barang & terminal transit tersimpan (`realtimeSiarkanJadwal`; `createShipment(..., { tanpaSiaran })` untuk Bulk Import). Simpan form = tulis bersamaan + jawaban simpan dipasang langsung ke papan (`terapkanJadwalTersimpan`, lihat Performa). Sesudah papan tergambar, Database HS Code disiapkan di latar (`siapkanLartasLatar`) supaya tanda lartas terbaca di kartu & Ringkasan. `needed_date` (Dibutuhkan di Pabrik) termasuk `KOLOM_OPSIONAL`; Kolom dari migrasi yang mungkin belum dijalankan ada di `KOLOM_OPSIONAL` (No. Kendaraan; LS, Tanggal Invoice, Tanggal Master & House B/L-AWB -- migration-ls-tanggal-dokumen.sql; Tanggal PI, Tanggal LS, Polis Asuransi & tanggalnya -- migration-tanggal-pi-ls-polis.sql): jadwal tetap tersimpan tanpa kolom itu, satu pemberitahuan menyebut isian yang tertinggal (nama isian dua bahasa). `dokumen_pelengkap` (migration-dokumen-pelengkap.sql) hanya dilaporkan tertinggal bila memang ada yang hilang -- dokumen kedua dst. atau dokumen lain (`hilang`); satu dokumen per jenis tetap utuh di kolom lama. Barang (`sisipkanBarang`): sebelum migration-barang-ceisa.sql, hanya kolom yang ditolak database yang ditinggalkan -- Kode Barang s.d. Spesifikasi Lain dilebur ke Uraian, Kode Kondisi, Negara Asal, PI barang & No. item di PI (`KOLOM_BARANG_OPSIONAL`) dibuang -- lalu disisipkan ulang; barang tidak pernah hilang. Tiap baris barang membawa `urutan` (posisinya di daftar, 1 = Seri Barang 1); database yang belum mengenalnya (migration-urutan-barang.sql, juga di `KOLOM_BARANG_OPSIONAL`) menyimpan barang tanpa urutan + pemberitahuan |
| `ui/dom.js` | Shortcut `$`/`$$`, referensi elemen DOM yang sering dipakai |
| `ui/fokus.js` | Langsung siap mengetik: kursor ke isian KOSONG pertama saat membuka form jadwal, pop-up, panel nomor dokumen, atau menambah baris (`fokusIsianPertama`). Enter = isian berikutnya di wadah `[data-enter-lanjut]` (di isian terakhir: `data-enter-kirim` ditekan / `data-enter-akhir` difokus; `[data-enter-sendiri]` = tabel yang mengurus Enter-nya sendiri). Fokus kembali ke tombol pemicu saat dialog ditutup (`kunciFokus` menemukan kembarannya sesudah digambar ulang); kotak yang ditutup di atas kotak lain mengembalikan fokus ke kotak teratas yang masih terbuka. iOS tidak memperbesar halaman saat kotak difokus |
| `ui/pilihan-tambah.js` | DROPDOWN YANG BISA DITAMBAH: `<select>` + pilihan "+ Tambah …" (`data-pilihan-tambah`) untuk daftar nama yang tumbuh -- Dibayarkan Kepada (features/fund-vendor.js) & Customer invoice (features/invoice-pihak.js). `pilihanSatukan` (gabungan tanpa kembar, kunci tanpa beda huruf & tanda baca, urut abjad), `pilihanGambar` (yang terpilih tetap terpilih), `pilihanPastikan` (nilai dari luar daftar jadi pilihan; ejaan yang ada menang), `pilihanPilih`, `pilihanPasangTambah` (pilihan "+ Tambah" tidak pernah tinggal terpilih) |
| `ui/feedback.js` | Toast (judul + kalimat per jenis, `{ judul, tetap }`, jeda saat difokus / tab tersembunyi) & modal konfirmasi (pengganti alert/confirm bawaan browser); pop-up yang dibuka di atas pop-up lain dinaikkan lapisannya (latar meredupkan yang di bawah). Posisi toast murni CSS (`.toast-stack`). Pop-up isian: kursor di isian kosong pertama, Enter ke isian berikutnya, Enter di isian terakhir = Simpan. Konfirmasi hapus/peringatan memfokus Batal, konfirmasi biasa memfokus tombol utamanya Pop-up isian juga punya isian kotak centang (`type: "checks"`) & lampiran (`type: "berkas"`, pengelola dari data/lampiran.js), aksi ketiga di kiri (`aksiKiri`), dan onSubmit berupa janji (tombol berputar, kotak terkunci sampai selesai; Enter di tombol menjalankan tombolnya). `toastMigrasiKe` bertambah tiap toast migrasi (menyebut migration-*.sql): simpan form jadwal & Bulk Import tidak menutup dengan toast "berhasil" bila penyimpanannya sendiri memunculkan peringatan migrasi |
| `ui/cetak-modal.js` | MODAL CETAK (`#cetakModal` di index.html): surat tampil sebagai pratinjau selebar kertas A4 di kotak aplikasi (iframe `sandbox="allow-same-origin allow-modals"` -- tanpa izin skrip), lalu dicetak dari iframe itu; menggantikan jendela baru (about:blank) + `print()` yang meninggalkan dua lapis untuk ditutup dan bisa diblokir peramban sebagai pop-up. `bukaModalCetak({ jenis, nomor, judulBerkas, muat, kertas, siapkan })`: kotak dibuka DULU, `muat()` (async, mengembalikan HTML dokumen lengkap) dipanggil sesudahnya, hasilnya ditulis ke iframe (`document.write`, bukan `srcdoc` -- hasil sama di jsdom), kertas dikecilkan (`transform: scale`) di layar sempit dan pembungkusnya (`#cetakUkur`) mengikuti ukuran hasil kecilnya. Tombol Cetak (atau Ctrl/Cmd+P selagi kotak terbuka) memanggil `print()` pada iframe; selama dialog cetak terbuka `document.title` diganti `judulBerkas` karena nama berkas "Save as PDF" diambil dari judul halaman induk, lalu dikembalikan pada `afterprint`. Sesudah dialog cetak ditutup kotak menutup SENDIRI (kotak centang "Tutup otomatis setelah dicetak", diingat di localStorage `cetak-tutup-otomatis`, bawaan menyala; `afterprint` datang juga saat dibatalkan, jadi yang membatalkan membuka lagi dari daftar). `kertas`: "a4" (bawaan) atau "a4-mendatar" (`CETAK_KERTAS`, `cetakUkuranKertas`) -- lebar bingkai = lebar kertas. `siapkan(dok)` (opsional, boleh async): dipanggil sesudah surat tertulis & bingkainya tampil (tata letak jadi), sebelum tombol Cetak menyala -- untuk surat yang menata diri dengan mengukur. SEMUA cetak lewat kotak ini, tidak ada lagi `window.open` untuk mencetak: `cetakFundRequest` (Form Pengajuan Dana), `cetakSuratJalan` (Export & Lokal; `siapkan` = `sjIsiKertas` / `sjlIsiKertas`), `cetakSuratBc`, `cetakCipl` (CI/PL/SI satu dokumen), `cetakMasterlist` (Stock Opname, `kertas: "a4-mendatar"`; `siapkan` mengukur lalu memecah halaman), `cekCetakDraft` (draf PIB/PEB + Lembar Koreksi). Gaya di `css/components.css` (MODAL CETAK): kartu selalu setinggi dialog supaya tidak melompat saat surat tampil, lebar maksimum 900px hanya di layar >= 768px (di bawahnya layar penuh), tombol Cetak sengaja TANPA kelas Bootstrap `.btn` (kelas itu menghapus latar tombol navy begitu kursor papan ketik mendarat di sana) -- semuanya dijaga `qa/dom-test.js` |
| `ui/tooltip.js` | Tooltip aplikasi dari atribut `title` tombol & tautan: muncul 350 ms sesudah disorot, langsung saat difokus lewat Tab, di kanan ikon pada rel menu; `title` dipinjam sebentar (data-tip-judul) supaya tooltip bawaan tidak ikut muncul |
| `ui/icons.js` | Ikon halaman: satu set garis (Lucide, ISC) untuk sidebar, rel, bilah atas ponsel, palet perintah, aksi cepat & tab jenis dokumen. Bentuknya di `<svg class="ikon-sprite">` awal index.html (`#ik-*`), gayanya `.ic` (base.css); `ikonSvg(nama)` / `ikonDari("ik:nama" atau "bi-…")` untuk markup yang dirakit JS |
| `ui/sidebar.js` | Sidebar navigasi: desktop menempel di kiri & bisa diciutkan jadi rel ikon (pilihan diingat, `exim.sidebar`); ponsel/tablet jadi laci dari tombol menu di bilah atas. `aturKerangka()` menampilkan/menyembunyikan sidebar + bilah atas bersama (disembunyikan di layar masuk & halaman form) |
| `ui/search-clear.js` | Tombol hapus (×) di setiap kotak cari (`.search-clear[data-cari-hapus]`): mengosongkan lalu mengirim event `input` supaya saringan halamannya berjalan sendiri. Kapan tampil diurus CSS (`:placeholder-shown`) |
| `ui/date-input.js` | Kotak tanggal yang bisa diketik dengan format apa pun. SEMUA `<input type="date">` -- di index.html, dibuat render() / showPrompt() / baris dinamis, atau muncul belakangan (MutationObserver) -- dijadikan `type="text"` + `data-kotak-tanggal` (placeholder dd-mm-yyyy); kode pemanggil tetap menulis `type="date"`. `el.value` TETAP "yyyy-mm-dd" dibaca maupun ditulis (penyetel ketat seperti kotak bawaan: bentuk lain dikosongkan). Dirapikan saat keluar kotak / Enter / change, bukan tiap ketikan; `input` & `change` hanya menembak SAAT TANGGALNYA BERUBAH (ketikan setengah jalan tidak sampai ke pendengar mana pun, peristiwa buatan kode lewat apa adanya). Tidak terbaca -> dikembalikan ke tanggal sebelumnya (BUKAN dikosongkan) + garis merah + toast; mengosongkan kotak sah. Ikon kalender di ujung kanan (gambar latar, css/date-input.css) atau Alt+Panah-bawah / F4 membuka kalender bawaan peramban lewat `<input type="date">` pembantu sesaat. Pengecualian: `data-kotak-tanggal-off` (#filterDateFrom/To -- sumber kebenaran pemilih rentang, tetap type=date) dan `data-kotak-tanggal-tanpa-ikon` (kotak Dari/Sampai di panel kalender pemilih rentang). Letak kalender: kotak pembantu `position:fixed` DIPATOKKAN ke patokan yang DIUKUR (`ktAsalPatokan` -- penanda sekali pakai di sebelah kotak; leluhur ber-`contain`/`content-visibility:auto` seperti `.ship-card` membuat `fixed` berpatokan pada leluhur itu, bukan layar), gayanya dipasang SEBELUM disisipkan, dan `showPicker()` ditunda dua bingkai (`ktBukaKalenderSetelahTergambar`, penghitung `_bukaKe` membatalkan pembukaan yang basi) supaya peramban menempelkan kalender pada letak yang sudah tergambar. KOTAK YANG DIGAMBAR ULANG DI TENGAH KLIK: merapikan ketikan menembakkan `change` dan daftar jadwal langsung menggambar ulang kartunya (innerHTML), jadi kotak yang diklik sudah dibuang -- kalender dibuka untuk KEMBARANNYA (`ktKembaran`: kunciFokus() di ui/fokus.js, kotak yang belum dirapikan MutationObserver dirapikan saat itu juga), begitu juga pilihan kalender & fokus sesudahnya. Klik yang tak pernah sampai (ketikan di kotak LAIN dirapikan saat fokus berpindah -> kartu digambar ulang di antara pointerdown & click) ditangkap di pointerup bila penunjuk dilepas di atas ikon kembarannya. Dulu kalender baru muncul pada klik kedua. Dicoba di Chromium saja; Safari/Firefox/iOS belum |
| `core/customs.js` | Perhitungan CIF/FOB/BM+PDRI (satu-satunya sumber kebenaran). `bulatkanBm()` = aturan tunggal BM ke atas ke ribuan, dipakai semua jalan masuk BM (hitungan tarif, draft CEISA, PIB PDF, Bulk Import, form). `hitungPungutanFasilitas()` = tabel pungutan PIB per seri menurut tarif & fasilitas barang (tab Pungutan Data PIB; kolom Dibayar = Bea & Pajak Impor tab Kepabeanan & Biaya) |
| `core/carrier-master.js` | Deteksi pelayaran/maskapai/kurir untuk prediksi. `carrierNameFromShipment()` = nama sarana angkut yang ditampilkan (kartu, detail, Bulk Excel, surat BC: Nama Vessel/Voyager + No. Voyage/Flight); `carrierVesselFlight()` = satu kolom Vessel/Flight di CIPL & kolom VESSEL templat salin (udara cukup No Flight); `carrierCipl()` = carrier yang dicetak di CIPL. Hasil deteksi diingat per teks (`ingatDeteksi`) |
| `core/route-model.js` | Progres lane pengiriman + rute transit multi-terminal + aturan auto-arrive. Label simpul transit: baris kedua (`assignLabelRows`) hanya untuk label yang berdekatan -- wadahnya setinggi satu baris kecuali ada yang memakai baris kedua (`.port-labels--dua-baris`) |
| `render/cards.js` | Render kartu pengiriman (expanded & collapsed). Tag PI: "PI × 2" untuk lebih dari satu dokumen PI (`tagPiHtml`); sel peti kemas hanya untuk kiriman laut (`infoKontainerHtml`). Tag Dibutuhkan di Pabrik (`tagKebutuhanHtml`: telat merah / mepet kuning / aman) & lartas yang belum bernomor (`tagLartasHtml`) di baris tag kartu aktif. Baris tanggal (ETD / ETA / Estimated Delivery, `.date-strip`) = kolom selebar isinya (`repeat(auto-fill, minmax(200px, 224px))`, card.css) rata kiri berjarak tetap 28px -- bukan 1fr yang merentangkan tanggal sejauh lebar kartu; isian Delay Update di bawahnya selebar & sejajar kolom yang sama (`.delay-strip-fields`, lebar-isian.css). JADWAL DELAY TERBEDAKAN SEKALI PANDANG: ETD/ETA rencana awal yang sudah diganti Update ETD/ETA dicoret & berlabel "· rencana awal" (`date-field--diganti`, opsi `diganti` di `kotakTanggalKartu`, keterangannya di tooltip), tanggal update merah tegas di kotak bertinta merah muda (status Delay; revisi yang tertinggal cukup tebal), selisih "+N hari" & lencana "Mundur N hari" merah, panel detail mencoret rencana (`.tgl-rencana`). Kartu terkuncup: tanggal tibanya utuh di ponsel (`.collapsed-meta b` nowrap) -- barisnya yang turun. Nama barang untuk tampilan Ringkas di baris tanggal (`barangRingkasHtml`, tersembunyi di Nyaman); lencana + progres dokumen dalam satu wadah `.ship-dokumen` (`cardDokumenHtml`) yang di Ringkas menjadi kisi lencana kiri / hitungan kanan / stepper. |
| `render/list.js` | Filter, group by tanggal, sort, render list, paginasi, mode switch. Teks pencarian (`teksCariJadwal`) hanya dirakit saat ada kata kunci; lebar pil status & kartu di luar layar diurus CSS (`field-sizing`, `content-visibility`). Saat daftar digambar ulang posisi gulir tidak melompat (tinggi kartu diwariskan + penanda gulir) dan fokus/isi kotak yang sedang diketik ikut bertahan. Kembali dari form jadwal (Simpan / Batal): daftar kembali ke posisi gulir sebelum form dibuka (`catatPosisiDaftar` / `pulihkanPosisiDaftar`). Penanda gulir hanya diukur bila halaman SUDAH tergulir (`halamanTergulir`, dari event `scroll` pasif): membaca `scrollY` / `getBoundingClientRect()` di tengah render memaksa tata letak sinkron (dulu terjadi tiap muat halaman) |
| `features/excel-row-format.js` | Format baris Excel (clipboard & native) utk mode Import & Export. Kolom TARIF ditulis PER BARIS (Tarif BM barang itu, `tarifBmBerlaku`; 0% tertulis "0%"), bukan lagi baris pertama saja; Bulk Import membacanya balik per baris ke `dataPabean.tarifBm` (berkas lama berisi baris pertama saja -> tarif jadwal cadangan). Kotak FOB (USD) di tab Kepabeanan sudah tidak ada: FOB Rupiah (Incoterm FOB) & CIF Rupiah (Incoterm CIF) = Total Nilai Barang (USD) × NDPBM, sama dengan jumlah kolom FOB/CIF RUPIAH per baris di sini. Kolom PI (All Import / laporan harian) memuat SEMUA dokumen pelengkap non-fasilitas, SATU DOKUMEN PER BARIS LEMBAR seperti kolom FASILITAS / SKB (`barisKolomPi`, core/helpers.js; dokumen ke-n di baris barang ke-n, sisanya di baris tambahan -- bukan satu sel bergaris baru yang diulang di tiap baris barang): tiap nomor PI, "LS <nomor>", "POLIS <nomor>", Dokumen Lain "<NAMA DOKUMEN CEISA> <nomor>" (kode di luar daftar "DOKUMEN KODE <kode> <nomor>", tanpa kode "DOKUMEN LAIN <nomor>"); SKB PPN/PPh, Masterlist & COO tetap di kolom FASILITAS / SKB. Bulk Import membaca kolom PI di semua baris jadwal (berkas lama bersel bergaris baru: baris kembar dibuang) lalu memisahkannya lewat `pecahKolomPi` (PI, LS, Polis & Dokumen Lain kembali ke daftarnya masing-masing). Kolom FASILITAS / SKB: satu dokumen per baris, label + nomor ("MASTER LIST 72/PABEAN-PB/..."), dibaca balik Bulk Import lewat `skbTextToEntries()`. `formatter.vessel`: salinan (clipboard) menulis No Flight saja untuk kiriman udara; Bulk Excel (native) tetap nama + nomor supaya Bulk Import tidak kehilangan nama maskapai |
| `features/copy-templates.js` | Dropdown pilihan template di tombol Copy (All Import/Export, Daily Import/Export, Report) — builder & dispatcher-nya, TANPA mengubah excel-row-format.js. Report: baris Mode di kedua buku (`modeReport`) -- udara "Air Import" / "Air Export", laut FCL / LCL. |
| `features/card-events.js` | Delegasi event di kartu (status, tanggal, edit, hapus, dll) |
| `features/doc-steps.js` | Progres Dokumen di kartu (stepper). Satu kotak tahap untuk semua keadaan (`bukaTahapDokumen`): status Draft / Asli / Tidak dipakai (`opsiStatusTahap`; tahap `bisaDraft` dibuka sebagai Draft), tanggal, jalur, lampiran (diunggah saat Simpan; kotaknya menunggu, gagal = tetap terbuka), "Batalkan tahap" (`batalkanTahapDokumen`, lampirannya ikut dihapus). Draft digambar jam pasir & dihitung terkumpul (`docStepsDraft`, `draftDocs`). Impor dokumen pabean di form ikut mencentang tahap (`progresDariDokumenPabean`, `gabungProgresImpor`, `catatProgresImporForm`, `progresSimpanForm`). Tiap tahap dikonfirmasi dengan TANGGAL DITERIMA-nya (tooltip menampilkan tanggal itu, bukan waktu klik); tahap E-COO (buku Import saja) sesudah COO ikut strip kalau COO tidak dipakai (`docStepEntri`), tapi tidak ikut terisi saat COO diterima. Manifest berstatus Draft / Asli (draft bukan bukti kedatangan); Billing berstatus belum dibayar / dibayar dan Berths estimasi / aktual (`kata`, `kataTahap`; estimasi boleh bertanggal ke depan; `belumDibayarDocs` untuk tugas Ringkasan); tahap Asuransi hanya untuk incoterm CIF / CIP (`pakaiAsuransi`); tahap SPJM sebelum SPPB hanya bila jalur PIB Merah (`pakaiSpjm`); petunjuk kemasan di Fumigasi (`petunjukFumigasi`). Tahap PIB / PEB: tanggal bawaan dari nomor aju jadwalnya (`docTanggalBawaan`; aju yang belum tiba / tidak lengkap -> hari ini). Konfirmasi PIB, Billing & SPPB juga menanyakan JALUR (MITA/Hijau/Merah, `docIsianJalur`; disimpan di entri tahapnya dan disamakan ke tahap lain, `docProgresDenganJalur`). Sandar/Manifest yang dicatat ikut menghitung ulang kiriman lain di kapal yang sama (`segarkanKirimanSekapal`) |
| `features/date-range-picker.js` | Pemilih rentang tanggal dua bulan: halaman Jadwal (sumber kebenaran #filterDateFrom/To) dan `buatRentangTanggal(akar, opsi)` untuk tempat lain (Nomor Dokumen, Ringkasan Pengajuan Dana). Tanggal dipilih di kalender ATAU diketik di kotak Dari/Sampai di atasnya (format apa pun, lewat ui/date-input.js): Tab / Enter / klik di luar merapikan, Dari lebih akhir dari Sampai ditukar seperti klik di kalender, bulan yang belum terlihat memindahkan kalender; mewarnai ulang tombol hari yang sudah ada alih-alih menggantinya (klik yang sedang berjalan tidak hilang). Enter di Dari pindah ke Sampai, Enter di Sampai = Terapkan. Satu tanggal saja (kotak mana pun) = rentang sehari. Ditutup tanpa Terapkan: teks pemicu kembali ke saringan yang berlaku |
| `features/modal-fields.js` | Tab modal, toggle label transport (termasuk label Tanggal Master / House B/L atau AWB; moda udara menyembunyikan Jenis Muatan LCL/FCL & No. Kontainer), live feedback auto-arrive, recalc kepabeanan. No. Aju bawaan "CONSIGNEE NOTE" untuk kiriman kurir (FedEx/DHL/UPS, `isKurirNilaiRendah`) Import bernilai di bawah USD 1.500 (`aturAjuConsigneeNote`): diisi bila kosong atau berisi tanda kosong ("-", "N/A", "TBA"), dikosongkan lagi bila syaratnya tidak berlaku, terisi lagi bila dikosongkan lalu ditinggalkan; ketikan pengguna tidak disentuh. Keterangan di bawah No. Aju (`#ajuKurirKet`, `gambarKetAjuKurir`) menjelaskan kenapa terisi / belum (harga belum diisi, USD 1.500 ke atas, kotak sudah berisi nomor lain). Buku Export: Tanggal PEB yang kosong diisi dari nomor aju & ikut berubah (`aturTanggalPebDariAju`, data-auto="aju"); yang diubah sendiri tidak ditimpa |
| `features/pilih-pihak.js` | Nama Shipper (Import) / Buyer (Export) `#fParty` = dropdown bersaring yang bisa ditambah (combobox): daftar nama dari jadwal buku itu (`daftarNamaPihak`: satu per kunci huruf & angka, ejaan terbanyak), mengetik menyaring, baris 'Tambah "…"' untuk nama baru (masuk daftar setelah jadwal disimpan, `#fPartyKet`). Ejaan lain dari nama yang sudah ada disamakan saat ditinggalkan & saat impor dokumen (`samakanNamaPihakForm`). `.value` tetap teks biasa |
| `features/tarif-hs.js` | TARIF BM PER BARANG (`item.dataPabean.tarifBm`), kolom Tarif BM (%) di Daftar Barang tepat sesudah HS Code (buku Import, `.import-col`). Terisi otomatis menurut HS Code (`segarkanTarifOtomatis`): Database HS Code (`hs_code_master.tarif_bm`, `migration-hs-tarif-bm.sql`; beberapa baris ber-HS sama -> tarif terbanyak) lalu tarif terakhir untuk HS itu di jadwal Import lain (tanggal dokumen terbaru; jadwal yang sedang disunting dilewati). Tarif otomatis ditandai (`it._tarifOtomatis`, kotak `.tarif-otomatis`) dan mengikuti HS-nya: HS berganti -> dicari ulang, HS tak dikenal mencabutnya; yang diketik sendiri / disamakan / dari editor pena tidak pernah ditimpa. Dipanggil di `renderItemTable` (hasil impor, pilihan pencarian, penyamaan), ketikan HS Code, dan HS Code otomatis dari nama (`tandaiHsOtomatis`). Jadwal lama dibuka: kolom jadwal `tarif` turun ke barang yang belum bertarif (`siapkanTarifBarangForm`, sebelum sidik; 0 = tidak diisi); disimpan: `tarif` = tarif bersama bila semua barang bertarif sama, selain itu null (`tarifRingkasJadwal`). `tarifBmBerlaku` (tarif barang / tarif jadwal lama / 5%) dipakai copy template All Import & Bulk Export (kolom TARIF per baris) dan panel detail |
| `features/item-table.js` | Tabel draft barang + panel fasilitas SKB/COO (tombol berhitungan "SKB 1 · COO 1"; jenis tersimpan "E-COO" tampil sebagai COO lewat `skbJenisLabel`). Kolom barang = kolom CEISA kiri ke kanan sesudah HS Code (& Tarif BM, tarif-hs.js): Kode Barang, Uraian, Merek, Tipe, Ukuran, Spesifikasi Lain (+ Marks di Export) -- textarea adaptif selebar sama (`--lebar-kolom-ceisa`; tingginya ditumbuhkan peramban lewat `field-sizing: content`, form.css -- autoGrowTextarea / autoGrowAllItemNames hanya untuk peramban tanpa field-sizing, berkelompok: semua tulis, semua baca, semua tulis), selalu huruf besar (`ISIAN_BARANG_KAPITAL`, juga Satuan & Jenis Kemasan); lalu Kondisi Barang (pilihan 1 / 2, buku Import saja: `.import-col`) & Negara Asal (kotak ketik + saran `#negaraList`, dibakukan ke kode saat ditinggalkan / Enter -- `bakukanIsianNegara`; nama negaranya redup di DALAM kotak sesudah kodenya, kode tak dikenal ditandai merah + tooltip) -- kedua kolom selebar isinya, judulnya boleh dua baris; semua isian satu garis (textarea `display: block`). Enter di kotak bersaran menunggu sarannya terpasang dulu. Panel fasilitas (buku Import): PI barang ini dipilih dari daftar PI jadwal (`piBarangHtml`; barang BARU: "Tidak Menggunakan PI") + No. item di PI. Tiap sel membawa `data-label`: di wadah < 760px tabelnya jadi satu kartu per barang (`.barang-isi`, form.css) RUMUS "=" di Unit Price, Neto & Bruto (`RUMUS_BARANG`; Qty tidak): diketik apa adanya (angka berkoma ribuan, `applyLiveRumusFormat`), angka barang BELUM berubah selama diketik; dihitung `terapkanRumusBarang` saat kotak ditinggalkan (`change`), Enter (juga baris terakhir; rumus salah menahan kursor), dan Simpan (`terapkanRumusBarangSemua`, form-router.js -- rumus salah menahan simpanan & membawa ke kotaknya); hasil dibulatkan 4 desimal (`bulatRumusBarang`); rumus salah bertanda `.fl-rumus-salah`, teksnya dibiarkan. |
| `features/fund-invoice-summary.js` | Tombol SALIN KE INVOICE SUMMARY (ikon clipboard di riwayat Pengajuan Dana, `[data-copy-invsum]`): satu baris dalam urutan kolom B-K tabel INVOICE SUMMARY akunting -- INVOICE DATE, DUE DATE, Paid Date (`paidAt`), INVOICE NUMBER (Billing -> Nomor Billing; disalin sebagai teks), COMPANY (KAS NEGARA -> STATE TREASURY), CUSTOMER, DETAILS (nama barang jadwal yang BL/AWB-nya cocok, " - "; tanpa jadwal -> Rincian), COST(RP) (TOTAL dibayar), EXPENSES CATEGORY (Billing/Tax Advance -> IMPORT DUTY TAX [+ STORAGE], Freight -> FREIGHT CHARGE, Storage -> STORAGE, lainnya OTHER), TRANSPORT MODE (Trucking, juga nama lama Inland Trucking / Local Sale -> TRUCKING). HTML + teks bertab (`copyRichToClipboard`); ditempel di kolom INVOICE DATE baris kosong (kolom NO berisi rumus) |
| `features/invoice-pihak.js` | CUSTOMER, SKEMA INVOICE & PIHAK form Permintaan Nomor Invoice. Empat pihak seperti entitas PEB -- Penjual/Shipper, Pemilik Barang, Pembeli/Buyer, Penerima/Consignee -- nama + alamat + NPWP (Penjual, Pemilik) / Negara (Pembeli, Penerima); kunci payload `penjualNama`, `pemilikNpwp`, `pembeliNegara`, ..., alamat Penerima = kunci lama `consigneeAddress`, nama Penerima mengikuti Customer. SKEMA INVOICE (`polaPihak`): Direct Invoice (Pemilik = Penjual, Pembeli = Penerima) / Third Party Invoice (Pemilik = Penjual; Pembeli & Penerima diisi masing-masing, mis. Kumho). Pengikut yang masih kosong / bawaan / isian mesin (`dnIsianOtomatis`) ikut sumbernya; yang diketik sendiri tidak ditimpa; mengosongkan sumber tidak mengosongkan pengikut; pindah ke Third Party mengosongkan Pembeli yang hanya salinan Penerima. Bawaan Penjual & Pemilik = `CIPL_SHIPPER` + NPWP `DP_PERUSAHAAN`. SHIPPER BAKU UNTUK SEMUA CUSTOMER (`ciplShipperBaku()` = `CIPL_SHIPPER`, alamat CIPL Dynamic Design: "DESA PABEDILAN KULON", bukan gaya data PEB "DESA/KELURAHAN") -- kolom Penjual (nama & alamat) selalu berisi blok itu dan TERKUNCI (`readOnly`) lewat `invTerapkanShipperBaku`, customer apa pun (Dynamic Design, Kumho, customer baru, form kosong), dipanggil paling awal di `invTeruskanSemua` sehingga semua jalur pengisian (ganti customer, jadwal ditautkan, draf dipulihkan, pengajuan dibuka untuk diubah, form dikosongkan) ikut dan data PEB / data tersimpan / riwayat / sisa customer sebelumnya tidak bisa mengubahnya; Pemilik yang masih ikut Penjual ikut berganti; NPWP Penjual tetap bebas; keterangan di `#dnPolaKet`. CUSTOMER = dropdown bisa ditambah (ui/pilihan-tambah.js): customer tersimpan + profil pelanggan (`CIPL_PROFIL.nama`) + customer invoice di riwayat + buyer jadwal export. Tiap customer punya DATA PENGISIAN (skema + isian pihak) di report_settings `invoice-customer` (`{ customer: [{ nama, isian }] }`), diperbarui tiap nomor invoice terbit / diubah (`invCustomerIngat`); memilih customer mengisi dari data itu, lalu pengajuan terakhirnya di riwayat, lalu profilnya (`isianPihak`). Jadwal export ditautkan: pihak dari Data PEB jadwal (`invIsiDariJadwal`). Pengajuan lama tanpa pihak dilengkapi dari profil saat dibuka untuk diubah. TATA LETAK (docnum.css, PIHAK INVOICE): keempat kolom pihak berbagi baris kisi (subgrid, `.inv-isian` = satu pasang label + isian), jadi Nama / Alamat / NPWP-Negara sejajar meski panjang alamatnya berbeda; kotak alamat tumbuh mengikuti isi (`field-sizing: content`, paling pendek 7.2em) dan barisnya ikut setinggi alamat terpanjang |
| `features/skb-bawaan.js` | SKB PPh BAWAAN (buku Import): nomor, tanggal & (boleh kosong) "berlaku sampai" yang otomatis dipasang ke tiap barang BARU -- baris pertama jadwal baru, Tambah Barang, barang hasil impor CIPL (`newItem()` memanggil `skbBawaanBarang(mode)`). Barang dari draft CEISA / PIB PDF mengikuti dokumennya. Diatur di bilah `#skbBawaanBar` tab Daftar Barang (Atur / Ubah / Perbarui, `showPrompt`); tombol "Pasang ke semua barang" untuk barang jadwal yang sedang dibuka yang belum punya SKB PPh. Lewat "berlaku sampai" -> tidak dipasang lagi dan bilahnya kuning. Tersimpan di `report_settings` kunci `skb-pph-bawaan` (sama untuk semua pengguna, hanya EXIM yang menulis) + salinan peramban `exim.skbPphBawaan`; dimuat ulang tiap form dibuka (`skbBawaanMuat`) -- jadwal baru yang sedang terbuka ikut diganti bila bawaannya berubah. Barang yang sudah tersimpan tidak pernah diubah |
| `features/barang-tampilan.js` | Pengalih Kartu / Tabel di kepala Daftar Barang form (`.barang-tampilan`, tombol `[data-barang-tampilan]`). BAWAANNYA kartu: satu kartu berlabel per barang di layar mana pun, supaya Qty / Satuan / Harga tidak tersembunyi di x = 2.000px. Memilih Tabel hanya memasang `.barang-isi--tabel` -- kelas itu mengganti NAMA wadah kontainer (`barang-isi` -> `barang-tabel`, form.css), jadi seluruh aturan `@container barang-isi` berhenti cocok tanpa satu selektor pun yang dibalik. Pilihan diingat per peramban (`exim.barangTampilan` = `kartu` / `tabel`; ditulis hanya saat pengguna memilih -- `pasangTampilanBarang(mode, simpan)`), penyimpanan yang diblokir tidak merusak apa pun, dan tinggi kotak Uraian diukur ulang sesudah pergantian (`autoGrowAllItemNames`) |
| `features/item-samakan.js` | Samakan isian baris 1 ke baris di bawahnya, dan Urungkan -- SEMUA isian barang (`SAMAKAN_KOLOM`, urut kolom tabel; termasuk Fasilitas SKB/COO -- disalin sebagai salinan sendiri tiap baris -- dan PI barang, yang mengosongkan No. item baris yang PI-nya berganti: `pasang` / `simpan` / `pulihkan`). Tawaran OTOMATIS saat isian baris 1 selesai diisi (kejadian `change`, atau HS Code dipilih lewat pencarian; `tawarkanSamakan(kolom, idx)`) menurut `otomatis` kolomnya: "selalu" (HS Code, Kode Kondisi, Negara Asal, Jenis Barang, Qty, Satuan, Jenis Kemasan) bila ada baris yang berbeda; "pintar" (Kode Barang, Merek, Tipe, Spesifikasi Lain, PI) hanya bila baris lain belum diisi sendiri -- kosong / bawaan, atau masih sama dengan isian LAMA baris 1 (`samakanAwal`, dicatat saat kotaknya mulai dipakai); kolom yang biasanya beda per barang (Uraian, Ukuran, Marks, Harga, Netto, Bruto, Dimensi, Kemasan, No. item di PI, Fasilitas) tidak menawarkan sendiri. ATAS PERMINTAAN, semua kolom kapan pun (`samakanAtasPermintaan`, langsung dijalankan -- Urungkan pengamannya; tak ada yang berbeda -> alasannya di bilah): menu "Samakan baris 1" di kepala Daftar Barang (`#samakanMenu`, dirakit saat dibuka -- `isiMenuSamakan`: kolom yang berbeda, nilai baris 1, jumlah baris yang berubah; tersembunyi bila barangnya satu) dan Ctrl/⌘+D di kotak baris 1. Tawaran otomatis = KOTAK DIALOG di tengah layar (`#samakanLapis`, markup di index.html; rupa `.dialog-*` tapi bukan modal Bootstrap -- buka/tutup seketika, gulir tidak dikunci): "Samakan Satuan ke baris 2–12?" + nilai baris 1 + catatan isian yang akan ditimpa. Fokus pindah ke "Ya, samakan" sesudah kejadian pemicunya selesai (`setTimeout 0` -> `fokuskanTawaranSamakan`): Enter = tombol yang berfokus, Esc / "Tidak" / klik latar = tolak, Tab berputar di kedua tombol, mengetik huruf = mengisi sendiri (kotak menutup, hurufnya masuk ke kotak isian). Sesudah dijawab fokus & seleksi kembali ke kotak yang dipakai (baris 2 sesudah Enter; isian panel fasilitas juga, `letakKotakSamakan`). HANYA baris 1; tidak ada yang disamakan bila barisnya satu, isian baris 1 kosong (qty 0), kode negara tak dikenal, atau semua baris di bawahnya sudah sama; nilai bawaan baris baru (SET, BOX, BAHAN BAKU, kondisi 1, TANPA MEREK, ...) tidak dihitung sebagai isian yang ditimpa. Hasil impor tidak memicunya; Enter di baris terakhir (menambah baris) juga tidak -- `tanpaTawaranSamakan`. Menyamakan (`salinBaris1`) menghitung ulang dari data hidup, menyalin hanya kolom itu, sel yang berubah berkedip (`.is-disamakan`; kolom fasilitas/PI: tombol Fasilitas-nya), Uraian / Tipe yang disamakan ikut mengisi HS Code otomatis baris itu, lalu BILAH URUNGKAN navy di kiri bawah (`#samakanUrung`), tepat di atas bilah Simpan form / papan ketik layar (`letakkanBilahUrung`, `--samakan-dasar`): cincin hitung mundur 15 detik yang berhenti selama bilahnya ditunjuk / difokus atau kotak dialog terbuka (`jedaBilahUrung`), tombol Urungkan (juga Ctrl/⌘+Z, kecuali di kotak teks yang sudah diketik) yang tidak mengambil fokus. `urungkanSamakan` mengembalikan nilai LAMA tiap sel (dicatat per objek barang, bukan nomor baris), MELEWATI sel yang diubah lagi / baris yang dihapus, dan mengabarkan hasilnya di bilah yang sama. Hanya penyamaan TERAKHIR yang bisa diurungkan. `perbaruiTawaranSamakan()` dipanggil di ujung `renderItemTable()`; semuanya menutup saat pindah halaman (`hashchange`) atau tab Barang disembunyikan |
| `features/dok-pelengkap.js` | Kartu "Dokumen Pelengkap Pabean" di tab Kepabeanan form: PI, LS & Polis Asuransi (buku Import) -- masing-masing bisa lebih dari satu, tiap dokumen bernomor & bertanggal -- dan Dokumen Lain ber-kode CEISA (kedua buku). Keadaannya di `draftDokPelengkap`; `dokPelengkapForm()` = isi yang disimpan (jenis yang tidak tampil di buku ini dikosongkan). Nomor PI yang diubah ikut berubah di barangnya, PI yang dihapus dilepas dari barangnya (`ikutkanPiBarang`). Hasil impor digabung per nomor (`gabungDokPelengkapImpor`). Baris PI & LS berlampiran (tombol klip; `entri._baru` menunggu Simpan -> `unggahLampiranForm`, yang dilepas di `berkasDilepasForm`). Kotak lartas & petunjuk COO di atas daftarnya (`segarkanLartasForm`, dipanggil juga oleh `recalcCustoms`) |
| `features/data-pabean-form.js` | Tab 4 form "Data PIB" / "Data PEB": deret tab bergaya CEISA (`dpbTabDaftar`, panah kiri/kanan antar tab, Enter di isian terakhir pindah tab), isian tersimpan (`dpbIsian`; pilihan panjang = kotak bersaran; nomor + tanggalnya sepasang setengah baris, `dpbPasangTanggal`), nilai tab lain hanya-baca + tombol Ubah (`dpbBacaHtml`), hasil hitung, tabel Dokumen / Barang / Pungutan (nomor & tanggal dokumen tidak dibungkus -- `.dpb-utuh`; tabelnya yang digulir ke samping), No. & Tgl Packing List tab 1, kotak Negara di samping Nama Shipper/Buyer tab 1 (`#fNegaraPihak`, `isiNegaraPihakForm` = Negara Pengirim / Pembeli). Nilai bawaan diisikan saat form dibuka (`bukaDataPabeanForm`) & mengikuti moda / Shipper-Buyer / pihak pertama pasangannya (`segarkanBawaanDataPabean`, `dpbPihakPenentu`). Tabel Barang rata tengah. Keadaan `draftDataPabean`; impor mengisinya lewat `terapkanDataPabeanImpor()` |
| `features/data-pabean-barang.js` | Editor Data PIB/PEB per barang (tombol pena tab Barang, dialog `#dpbBarangModal`): data barang hanya-baca, isian `item.dataPabean`, tabel tarif & fasilitas dengan pungutan barang yang dihitung ulang tiap tarif diketik, ‹ › antar barang (menyimpan), Tutup dengan perubahan bertanya dulu |
| `features/route-stops.js` | Kartu draft terminal transit (Nama Terminal setengah baris; Tiba & Berangkat berjajar selebar isinya, `.fl-tanggal`) |
| `import/excel-bc.js` | Parser Excel dokumen BC mentah (HEADER/BARANG/dst). Barang diurutkan menurut SERI BARANG lebih dulu (`urutMenurutSeri`, numerik; baris sheet BARANG tidak selalu berurutan), dan tiap rincian dibaca dari barisnya sendiri atau lewat Seri Barang-nya (`kunciSeri`: "1" = 1 = "001"), tidak pernah lewat posisi; kepala kolom dibakukan (`kunciKolomExcel`: "Seri Barang" = "SERI BARANG"). Sheet DOKUMEN dikenali lewat `kenaliDokumenPelengkap()` (core/helpers.js, aturan yang sama dengan PIB PDF): 912 Masterlist, 457 SKB PPh, 456 SKB PPN, 860/861 COO menjadi fasilitas per barang lengkap dengan nomor & tanggalnya (lewat BARANGDOKUMEN -- seri dokumen dari kolom SERI atau SERI DOKUMEN; yang tak bertaut berlaku untuk semua barang), 959 PI, 958 LS & 530 Polis Asuransi masuk daftar dokumen pengiriman (`dokPelengkap`, semuanya, beserta tanggalnya; PI yang ditautkan ke barang jadi PI barang itu), dokumen lain (selain invoice & B/L-AWB) dicatat beserta kodenya. ETD dari tanggal berangkat / perkiraan tanggal ekspor HEADER, ETA dari perkiraan tanggal tiba (diterapkan `terapkanTanggalDokumen`). Kolom barang KODE BARANG, URAIAN, MEREK, TIPE, UKURAN & SPESIFIKASI LAIN masuk satu lawan satu ke kolom barang jadwal (`kolomBarangDraft`), dan disimpan mentah per Seri Barang (`kolomBarang`) untuk Cek PIB/PEB; KODE KONDISI BARANG & KODE NEGARA ASAL ke kolom kodenya (`kodeBarangDraft`; kolom yang tidak ada = undefined, bukan kosong). Fasilitas per barang dibaca dari BARANGDOKUMEN (tiap Seri Barang hanya menerima dokumen yang ditautkan kepadanya); fasilitas yang TIDAK ditautkan ke barang mana pun (`fasilitasUmum`) dipasang ke semua barang -- Masterlist & SKB PPN/PPh -- KECUALI COO: COO selalu per barang dan berarti BM 0% (`barangPakaiCoo`), jadi COO tak tertaut tidak dipasang ke barang mana pun dan hanya diberi catatan `y.coo.tidak.tertaut.barang`. Dokumen fasilitas yang ditautkan per Seri Barang beserta No. Urut-nya (`fasilitasBarang`, `fasilitasUmum` -- COO tak tertaut tetap di sini) dan sheet KONTAINER (`kontainer`: nomor, ukuran, jenis, tipe) ikut dikembalikan untuk Cek PIB/PEB; Container/Seal Number diisi "NOMOR / UKURAN / TIPE" (`teksKontainer`), Jenis Muatan dari KODE JENIS KONTAINER F/L. B/L-AWB menurut UN/EDIFACT 1001: Master 704 / 741, House 714 / 703 lalu 705 / 740 (umum) -- nomor & tanggalnya; 380 memberi tanggal invoice. Bahan progres dokumen (`progres`): nomor & tanggal daftar apa adanya, SPPB (respon 2003), BC 1.1 HEADER, jalur dari tulisan respon (`jalurDokumenCeisa`: SPJM/SPJH/MITA; tanpa tulisan = kosong, tidak ditebak), NPE (Export). Data PIB/PEB lengkap lewat `ceisaDataPabean` (data-pabean-baca.js). KODE JENIS KONTAINER 8 = FCL (`muatanDariKode`). |
| `import/data-pabean-baca.js` | Pembaca data PIB/PEB lengkap: PDF PIB (`pibDataPabean`; per barang `pibBarangDataPabean` -- kolom 33, 34 & 36, "-" = kosong), PDF PEB (`pebDataPabean`, `pebBarangDataPabean`; pihak lewat pengelompokan kolom), Excel CEISA (`ceisaDataPabean`). Semua isian berkode (kantor, jenis, cara bayar, bendera, pelabuhan, negara, API, status). Tidak pernah menebak |
| `import/exim-engine.js` | MESIN EXIM BERSAMA (`window.EximEngine`): berkas yang SAMA PERSIS dengan exim-engine.js di EXIM Checker -- jangan diubah di satu sisi saja. Ekstraksi CIPL Excel & PDF (satu berkas atau CI + PL terpisah, label dikenali dari artinya), pembacaan draft PIB/PEB CEISA, dan seluruh aturan pemeriksaannya. Berdiri sendiri: tidak memanggil `t()`, DOM, atau data aplikasi (diuji di qa/dom-test.js), pesannya berbahasa Indonesia milik mesin. Dimuat SEBELUM dispatch.js & checker-view.js |
| `import/excel-cipl.js` | Parser Excel CIPL lama -- kini CADANGAN mesin EXIM (dipakai bila mesin tidak menemukan satu barang pun, dan untuk isian kepala yang dibiarkan kosong mesin) |
| `import/apply-to-form.js` | Terapkan hasil parsing (dari ketiganya) ke form + tampilkan catatan. Barang yang sudah ada di form dipasangkan dengan barang draft (urut Seri Barang) lewat `pasangkanBarangLama`: berlapis (nama sama untuk semua barang dulu, lalu nama MIRIP -- `pasangkanNamaMirip`, helpers.js: kata huruf/angka ditimbang menurut kelangkaannya, skor = kata bersama / nama yang lebih ringkas, jadi "195/65 R15" bertemu "195/65R15 95V", tidak dengan "195/55R16" -- lalu HS Code), dan dari kandidat yang setara dipilih yang urutannya paling dekat -- harga CIPL, nama Export, dan dimensi tidak tertukar antar barang ber-HS sama. DRAFT EXCEL CEISA: barang ke-n = Seri n, jumlah, kemasan, berat, HS, kode, fasilitas & Data PIB dari baris seri itu; harga satuan invoice yang sudah ada dipertahankan (nilai draft sudah ditambah freight & asuransi) tetapi hanya dari barang yang sama menurut nama / HS tunggal (`preserveUnitPrices` `ketat`) -- tanpa urutan terdekat, tanpa pasangan menurut urutan; barang yang tidak ditemukan memakai harga draft dan nomornya disebut di catatan impor. Kode Kondisi & Negara Asal yang tidak dibawa berkasnya diambil dari barang lama pasangannya (`lengkapiKodeBarang`), selain itu bawaan buku. Dokumen pelengkap digabung ke kartu Dokumen Pelengkap Pabean (PI, LS & Polis hanya buku Import; dokumen lain kedua buku). ETD & ETA DARI DOKUMEN PABEAN, bukan CIPL (`terapkanTanggalDokumen`): ETD = tanggal Master / House B/L-AWB (cadangan: tanggal berangkat dokumen, hanya mengisi yang kosong); ETA = perkiraan tanggal tiba dokumen -> mode ETA Manual; tanpa itu ETA dihitung dari ETD; status Delay mengubah tanggal revisinya (Update ETD / ETA). Kabar penyesuaiannya jadi catatan impor. Dokumen pabean ikut mencentang Progres Dokumen lewat `catatProgresImporForm` (doc-steps.js), dengan satu catatan impor. |
| `import/pdf.js` | Parser PDF PIB BC 2.0 (pakai pdf.js, dimuat lazy). Uraian, Merk, Tipe, Ukuran, Spesifikasi lain (& Kode Barang bila tercetak) ke kolom barangnya masing-masing; Kondisi Brg -> Kode Kondisi Barang, Negara -> Kode Negara Asal (`kodeNegaraPib`) bila terbaca. Lembar Pemenuhan Persyaratan: fasilitas per kode/label -- dipasang PER BARANG menurut kolom 33 (Keterangan) barangnya (`extractItemKeteranganColumn`: "- KETERANGAN PAJAK (5)" = dokumen No. Urut 5 di lembar itu), padanan BARANGDOKUMEN Excel CEISA; dokumen yang tidak disebut barang mana pun: Masterlist/SKB ke semua barang, COO TIDAK (BM 0%, selalu per barang -- catatan `y.coo.pdf.tidak.tertaut.barang`); kolom 33 tak terbaca: Masterlist/SKB ke semua barang, COO tidak dipasang kecuali PIB satu barang, PI 959, LS 958 & Polis Asuransi 530 (semuanya, nomor + tanggal) dan dokumen lain beserta kodenya. ETA = Perkiraan Tanggal Tiba (field 11); ETD mengikuti tanggal B/L-AWB (`terapkanTanggalDokumen`). Data PIB lengkap (`pibDataPabean`, `pibBarangDataPabean`), BC 1.1 ke progres, kontainer lewat `pdfTeksKontainer` (pdf-coords.js, dipakai juga pdf-peb.js) |
| `import/ocr.js` | OCR hasil scan -- Tesseract.js 7.0.0 dari jsDelivr (±7 MB, diunduh sekali saat pertama dibutuhkan lalu di-cache peramban; satu pekerja WebAssembly dipakai bersama dan dilepas setelah 5 menit menganggur). `ocrBacaBerkas(berkas, { pdf, progres })` -> teks per halaman: PDF dirender 300 dpi lewat pdf.js (`wasmUrl` WAJIB, tanpa itu halaman scan JBIG2 keluar kosong), gambar JPG / PNG / WEBP dibawa ke sisi panjang ±3300 px. Pra-proses murni larik bertipe (`ocrPraolah`, bisa diuji tanpa DOM): abu-abu, perataan latar tak rata, tinta berhisterisis, buang garis tabel, luruskan miring (`ocrMiring`), buang noda (`ocrBuangNoda`: bintik, coretan datar, bayangan pucat). Halaman dibaca TIGA kali -- PSM 6 "blok", PSM 4 "kolom", PSM 11 "jarang"; tiap mode punya titik buta sendiri (PSM 11 dan baca-ulang sendirian sama-sama membaca "17,538.00" sebagai "17,638.00") -- lalu digabung menurut kotak kata (`ocrGabungBacaan`): angka dipungut suara menurut DIGIT (dua pembacaan yang sama menang, apa pun pemisah ribuannya), kode (nomor invoice / HAWB) menurut huruf besar + angka, kata biasa dari pembacaan blok; kata yang hanya ditemukan pembacaan pelengkap diterima bila meyakinkan (`OCR_ISI_MIN`), serpihan kata yang sudah dicakup ditolak. Angka yang tak disepakati dibaca ULANG sendirian (`ocrBacaUlangAngka`, PSM 7, hanya "0123456789.,()-") lalu dipungut suara lagi; bentuk uang yang sah (`ocrAngkaSah`) menentukan "pasti" / "meragukan". Keluarannya baris teks yang bentuknya SAMA dengan `extractPdfText` (`ocrSusunBaris`), jadi pembaca invoice tidak membedakan teks digital dan hasil scan. Dimuat sesudah pdf.js, sebelum fund-invoice-import.js |
| `import/dispatch.js` | Deteksi file PDF vs Excel BC vs Excel CIPL, panggil parser yang sesuai. CIPL dibaca mesin EXIM (`readCiplSources`; dua berkas CI & PL = satu CIPL; uraian / tipe / merek CIPL -> Uraian / Tipe / Merek, `kolomBarangCipl`; COUNTRY OF ORIGIN -> Kode Negara Asal semua barang), HS Code 8 digit dilengkapi dari Database HS Code menurut nama barang (`hsDatabaseUntukBarang`). CIPL selalu diterapkan sebelum draft CEISA; bila draft ikut dipilih dan memberi HS 8 digit semua barangnya, catatan HS Code dari CIPL dibuang (`ciplTanpaCatatanHs`) |
| `views/form-router.js` | Routing hash (#/new, #/edit/:id, #/cek, ...), render & simpan halaman form. PASANGAN ISIAN yang saling mengikuti (`PASANGAN_ISIAN`, `samakanPasangan`): Tanggal Master <-> House B/L-AWB, No. Invoice <-> No. Packing List, Tanggal Invoice <-> Tanggal Packing List (Packing List ikutan ikut ditulis ke `draftDataPabean`). Invoice & Packing List yang berbeda ditandai kuning + satu kalimat di bawah barisnya (`tandaiCiplBeda`, `bedaInvoicePackingList`); impor CIPL / draft CEISA yang nomor / tanggal CI & PL-nya berbeda diberi peringatan di catatan impor (`bedaCiplDiBerkas`, import/apply-to-form.js). Aturan pasangannya: mengisi satu mengisi yang lain selama yang lain kosong atau masih ikut; yang diketik sendiri tidak ditimpa; MENGOSONGKAN satu TIDAK mengosongkan yang lain (hanya tanggal yang diisi yang diteruskan -- tanggal tidak boleh hilang dua-duanya sekaligus). ETD mengikuti tanggal B/L-AWB (`etdIkutTanggalBl`; status Delay: ETD revisi). Buku Import: status Arrived <-> Tanggal In Factory dua arah (`selaraskanTibaDariStatus` / `selaraskanStatusDariTiba`). Kalimat penyesuaian satu perubahan digabung jadi satu toast (`tampungKabarForm`). PI, LS, Polis Asuransi & dokumen lain di kartu Dokumen Pelengkap Pabean (features/dok-pelengkap.js) `tandaiFormDiubahLain(id, dihapus)`: jadwal yang sedang diubah, diubah / dihapus pengguna lain (realtime) -- isian tidak ditimpa, pemberitahuan + "Muat versi terbaru" (`#formRemoteKet`). |
| `views/checker-view.js` | Halaman Cek PIB/PEB (#/cek, khusus EXIM): CIPL vs draft CEISA lewat mesin EXIM, dibantu data Shipment Schedule -- jadwal terkait dicari dari aju / invoice / B/L-AWB / kontainer (Master & House B/L-AWB + tanggalnya mengisi kotak pembanding), hanya di antara jadwal yang PIB/PEB-nya masih mungkin diperiksa (`cekJadwalTerbuka`: Import berstatus process / delay, Export yang ETD-nya belum lewat). JADWAL RUJUKAN UTAMA: isian jadwal vs draft (`cekBarisJadwal`) di bagiannya masing-masing (Dokumen, Header, Pengangkutan, Nilai, Kemasan, Entitas); baris mesin CIPL untuk isian yang sama diganti baris jadwalnya, CIPL hanya untuk isian yang kosong di jadwal (`cekRujukJadwal`, ditandai "CIPL"); kode kantor dan ETD ↔ tanggal B/L-AWB tidak diperiksa (PEB: ETD ↔ TANGGAL EKSPOR; PIB: ETA ↔ tanggal tiba -- keduanya isian wajib, beda = MISMATCH). Status akhir tiap baris mengikuti ISIAN WAJIB PIB / PEB (`cekTerapkanWajib`, `CEK_WAJIB`): isian yang ditandai di PDF draft wajib sama (kosong di satu sisi pun MISMATCH), isian lain hanya INFO. SEMUA isian draft yang tercetak punya baris -- yang tidak bisa dibandingkan tampil INFO ("Belum diisi di jadwal" / "Draft tidak mencantumkannya"), tidak dilewati; PENGECUALIAN: **No. Aju dan No. SPPB / No. Daftar hanya INFO** (`infoSaja`, tidak pernah MISMATCH, tidak ikut vonis, tidak bernomor temuan). **NDPBM = kurs otomatis** (`cekBarisNdpbm`): sisi "jadwal" = kurs terbaru sheet KURS (core/kurs.js) untuk valuta draft, JPY per 1 yen; tanpa data kurs, USD kembali ke NDPBM tersimpan jadwal, valuta lain INFO; NDPBM di jadwal TIDAK disentuh. Kepingan "Kurs otomatis" (`cekGambarKurs`, `#cekKurs`) menampilkan status, kurs USD + valuta draft, umur data, Perbarui, tautan sheet. Baris pungutan (`cekBarisRupiah`, hanya PIB): BM, PPN, PPh & TOTAL -- Dibayar = isian jadwal apa adanya (`s.bm/ppn/pph`), tidak dihitung ulang; Dibebaskan = tab Pungutan Data PIB jadwal (`cekPungutanJadwal`) -- dibandingkan dengan sheet PUNGUTAN draft (TOTAL = semua jenisnya; tanpa sheet = INFO; yang 0 / belum diisi di jadwal sementara draft berisi = MISMATCH, ketiganya 0 ditulis "Belum diisi"). Total bruto & netto MISMATCH bila beda atau belum diisi di jadwal; nilai transaksi (`cekBarisNilaiTotal`: PIB 23 NILAI INCOTERM, PEB 38 FOB) dan kemasan tiap barang (`cekBarisKemasanBarang`) ikut; jumlah baris tetap INFO. Nomor penerbangan dibandingkan lewat `kunciPenerbangan` (tanpa spasi, tanda baca & 0 di depan nomornya: OZ0761 = OZ761). Dokumen lain di sheet DOKUMEN (`cekBarisDokumenLain`, nomor & tanggal menurut kode). PEB: volume (CBM). Peti kemas: nomor, ukuran & tipe tiap kontainer vs Container/Seal Number (`cekBarisPetiKemas`, `cekUraiKontainer`). BARANG DARI JADWAL DULU (`cekBarangGabungan`): ada jadwal terkait -> nama, HS, jumlah, satuan, nilai & berat pembanding diambil dari barang jadwal (sudah diperiksa EXIM); isian jadwal yang kosong dan barang yang tidak ada di jadwal diambil dari CIPL (dipasangkan per kata nama, `cekPasangkanBarang`), sumber tiap baris ditandai (kolom "Jadwal", tanda "CIPL"); kolom barang CEISA dibandingkan kolom demi kolom dengan kolom yang sama di draft (`cekBarisKolomBarang`; tanda kosong setara), barang lama per kata dengan gabungan kolom draft (`cekBandingNama`); Kode Kondisi Barang (PIB) & Kode Negara Asal (`cekBarisKodeBarang`) dan Fasilitas & No. Urut -- dokumen yang ditautkan ke Seri Barang-nya (`cekBarisFasilitasBarang`; nilai draft ditulis seperti jadwal, urutan pasangannya, No. Urut di catatan); barang draft diurutkan menurut Seri Barang begitu dibaca (`cekBacaDraft`; bila urutan di berkasnya memang acak, `draftDiurutkan` menambah keterangan "barang diurutkan menurut Seri Barang" di kotak draft, `cekRingkasDraft`); URUTAN JADWAL TIDAK DIUBAH: barang ke-n jadwal (atau CIPL) dibandingkan dengan Seri Barang n, dan seksi "Urutan Seri Barang" (seksi ORDER, `cekBarisUrutanBarang`, tepat sebelum Barang 1) SATU BARIS PER BARANG -- barang ke-n acuan vs Seri n draft, MATCH bila barang itu memang di Seri n, selain itu catatan di seri mana barang itu berada dan barang acuan mana yang menempati Seri n; seri yang lompat / bukan nomor urut ikut (dicari menurut nama: nama lengkap, Uraian, kata yang termuat -- hanya bila calonnya tidak meragukan -- lalu nama mirip, `cekSeriMenurutNama`; barang kembar menurut urutannya), HS Code 8 digit dari Database HS Code -> barang jadwal terkait -> riwayat jadwal (kode draft yang belum dikenal bisa langsung disimpan ke database), PI 959 / LS 958 -- tiap nomor di daftar jadwal -- beserta tanggalnya (`cekNomorDokumen`, `cekBarisTanggalDokumen`) / fasilitas barang vs dokumen draft (dokumen 912 tidak dibandingkan dengan halaman Masterlist), Polis Asuransi 530 + tanggalnya di bagian Dokumen. Tanpa CIPL: draft vs barang jadwal terkait. Kolom nilai membungkus teks panjang di mana saja, tetapi nilai yang berupa TANGGAL tetap satu baris (`cekUtuhBilaTanggal` -> `.cek-utuh`). Gaya di css/checker.css. Tombol "Cetak draft" -> `cekCetakDraft()` |
| `features/cek-cetak.js` | Cetak draft PIB/PEB berstabilo dari halaman Cek PIB/PEB: halaman muka, lanjutan barang & dokumen dalam tata letak PIB (BC 2.0) / PEB (BC 3.0), isian MISMATCH distabilo kuning + nomor (`ppPenanda`), Lembar Koreksi di akhir. Pemetaan baris hasil -> isian lembar: `ppSlot` (termasuk Perkiraan Tanggal Tiba PIB 11 `tglTiba`, nilai PIB 23 / PEB 38, kemasan tiap barang PIB 35 / PEB 51). Selalu berbahasa Indonesia |
| `views/hscode-view.js` | Halaman HS Code (#/hscode) + pencarian HS menurut nama barang yang dipakai bersama impor CIPL, HS Code otomatis di form & halaman Cek PIB/PEB (`kunciNamaHs`, `cariHsMenurutNama`, `hsDatabaseUntukBarang`): sama persis > nama database terkandung di uraian (yang terpanjang) > uraian terkandung di nama; beberapa kode setara = kandidat (+ `cari`: nama yang cocok), bukan tebakan. `hsDatabaseUntukBarang` melipat kata jamak di kedua sisi (`lipatJamakHs`: SIPES = SIPE, bukan PRESS). Kolom Lartas (PI / LS / SNI, kotak centang `isianLartasHs` di Tambah/Ubah); database tanpa kolom `lartas` -> tersimpan tanpanya & pengguna diberi tahu berkas migrasinya (`simpanHsDenganLartas`). Data dimuat dengan `select("*")` |
| `features/hscode-lookup.js` | Tombol cari HS Code di Daftar Barang (popover `#hscodeLookupPop`, `position: fixed`), dan HS CODE OTOMATIS DARI NAMA BARANG: Uraian / Tipe yang diketik dicocokkan dengan Database HS Code sesaat sesudahnya (`jadwalkanHsOtomatis`, jeda 250 ms; database dimuat begitu tabel barang mulai dipakai) -- HS Code yang KOSONG atau masih otomatis terisi (`hsOtomatisBarang`; `it._hsOtomatis` = nama yang cocok, kotaknya `.hs-otomatis` berketerangan), nama yang tak lagi cocok mencabutnya, beberapa kode setara tidak ditebak (`it._hsSaran`: tombol cari `.is-saran`, pencariannya dibuka dengan nama itu). Kode yang diketik sendiri, dipilih lewat pencarian, disamakan, atau dari berkas impor tidak pernah ditimpa. Hanya kotak HS Code & tombol cari baris itu yang ditulis ulang (`tandaiHsOtomatis`) -- kursor di Uraian tidak terganggu |
| `views/detail-view.js` | Panel detail pengiriman (read-only). Bisa dibuka untuk jadwal di buku mana pun (`kirimanDenganId`): label & kolomnya mengikuti buku jadwalnya sendiri. Kepala: label pihak (Nama Shipper / Buyer), namanya -- tidak diulang di daftar -- nomor & tanggal SPPB/PEB, buku & status. Tiap bagian (Dokumen & Umum, Transportasi & Rute, Incoterm & Nilai Barang, Bea & Pajak Impor, Dokumen Pelengkap Pabean) = daftar label-nilai `dl.detail-kv` (`detailBaris` / `detailDaftar`, panel.css): dua lajur bergaris, label sebaris di kiri, nilai rata kanan yang turun UTUH ke baris sendiri bila tidak muat, satu lajur bila isi panel < 760px (container `detail-isi`). Nomor dokumen + tanggalnya dalam satu nilai (`nomorTanggal`); Dokumen Pelengkap satu lajur: PI, LS, Polis Asuransi (beberapa dokumen sejenis bertumpuk, `daftarDokumenHtml`) lalu tiap dokumen lain berlabel nama dokumennya. Data PIB/PEB TIDAK ditampilkan di sini (hanya No. Packing List). Daftar Barang dirakit dari satu daftar kolom (`kolomBarang`): judul `<th>` sekaligus `data-label` sel; judul & isi tidak membungkus, tabel yang lebih lebar dari panel digulir ke samping -- di panel < 880px tiap barang jadi kartu (`.detail-barang`, form.css). Progres Dokumen hanya-baca (`detailProgresDokumenHtml`: status draft / asli / tidak dipakai, lampiran bisa dibuka) & lampiran PI / LS di daftar dokumennya; Dibutuhkan di Pabrik beserta statusnya -- EXIM & Viewer mendapat tombol Atur / Ubah di barisnya (baris tampil walau masih kosong; `aturTanggalPabrik`: kotak tanggal, kosong = dihapus, disimpan lewat `simpanTanggalPabrik`, kartu & panel digambar ulang). `segarkanDetailView()`: panel yang terbuka digambar ulang dari data terbaru (realtime) -- gulir & fokus tetap; jadwal yang dihapus pengguna lain menutupnya. |
| `features/bulk-excel.js` | Bulk export/import seluruh data lewat file Excel. Kolom DESCRIPTION berisi nama barang utuh: diimpor ke Uraian, kolom CEISA lain dikosongkan (seperti barang lama). Sheet "DATA PIB-PEB" (`barisSheetPabean` / `terapkanSheetPabean`). Tanggal ditulis sebagai tengah malam UTC dan dibaca dari angka serial -- tidak bergeser di WIB |
| `features/cek-duplikat.js` | Nomor ganda di form jadwal: hanya HOUSE B/L-AWB yang harus unik (kedua buku) -- ditandai di bawah kotaknya saat diketik, lalu ditanyakan saat Simpan ("Tetap Simpan" / "Periksa Lagi"). No. Aju & No. SPPB/PEB boleh sama (kiriman kurir bernilai rendah berisi CONSIGNEE NOTE), Master B/L-AWB juga (konsolidasi), Invoice juga (kirim bertahap) |
| `features/notifikasi.js` | Lonceng notifikasi (sidebar & bilah atas ponsel): jadwal yang berangkat / tiba / dikirim ke pabrik besok -- H-1 dari ETD & ETA yang berlaku dan dari Estimated Delivery jadwal Import (Delivery to Factory) -- tampil sampai hari H. Dihitung dari data jadwal; yang disimpan (localStorage per akun & perangkat) hanya status dibaca & pelacak tanggal: ETD/ETA yang diubah sesudah dinotifikasi (juga Estimated Delivery) memunculkan notifikasi ULANG di H-1 tanggal barunya. Panel dikelompokkan dua tingkat: HARI (Hari ini / Besok, kepalanya menempel saat digulir) lalu JENIS -- Berangkat, Tiba, Dikirim ke pabrik (`NOTIF_JENIS_TAMPIL`) -- masing-masing satu kotak berkepala ikon, nama, tanggal acuan & jumlahnya (`notifGrupHtml`); tiap notifikasi cukup nama pihak + rute/angkutan. Klik satu notifikasi = panel detail jadwalnya. MASA BERLAKU (`hitungNotifMasa`): SKB PPh bawaan (skb-bawaan.js) & Masterlist (`valid_until` tabel masterlists -- dibaca sekali per sesi, `notifMuatMasaBerlaku`, atau `mstDok` bila halaman Masterlist sudah dimuat). Dua tahap per dokumen: sejak 2 bulan kalender sebelum berlaku sampai (`NOTIF_MASA_BULAN`, `notifMasaMulai`: 31 Des -> 31 Okt, 30 Apr -> akhir Februari) "Berakhir dalam N hari", sesudah lewat "Sudah berakhir" (merah) sampai dokumen barunya dicatat; kunci `masa|dok|id|tanggal|tahap`, jadi SKB / masterlist baru = notifikasi baru dan catatan dibaca yang lama dibuang. Bagian "Masa berlaku" paling atas di panel; klik SKB = kotak Ubah SKB bawaan (hanya yang boleh menyunting), klik masterlist = #/masterlist |
| `auth/login-awal.js` | Layar masuk SEKETIKA. Dimuat tepat sesudah markup `#viewLogin`, sebelum skrip lain. Tanpa kunci sesi Supabase (`sb-…-auth-token`) di localStorage: layar sambutan disembunyikan, layar masuk ditampilkan dalam bahasa tersimpan (`data-en`, cara yang sama dengan `applyI18nSebaris`), username yang diingat diisi, kursor di isian kosong. Masuk sebelum aplikasi siap ditampung (`window.__masukTertunda`) lalu dijalankan `initAuth()`. Sebelumnya layar sambutan bertahan sampai ±130 skrip terbaca (2–4 detik), paling terasa sesudah Keluar yang memuat ulang halaman. Teks layar masuk karena itu memakai `data-en`, bukan kamus. |
| `auth/session.js` | Sesi login & hak akses. Tabel `PERAN` (exim, marketing, finance, viewer): nama tampil, boleh mengubah atau tidak, dan halaman yang boleh dibuka — router, navbar, palet perintah, pintasan N (jadwal baru: hanya bila form boleh dibuka; baris N di kaki halaman ikut `body.tutup-form`), dan halaman Akun membaca dari sini. Peran baru = satu baris di tabel itu + nilainya di database (contoh: migration-role-finance.sql). `tandaiBayar` / `bolehTandaiBayar()` = hak ubah di luar EXIM: Finance menandai Pengajuan Dana Paid / Unpaid (selebihnya `canEdit()` tetap false); `aturTanggalPabrik` / `bolehAturTanggalPabrik()` = Viewer (orang produksi) mengatur Tanggal Dibutuhkan di Pabrik jadwal Import dari panel Detail (`set_needed_date`, migration-tanggal-pabrik-viewer.sql) Masuk dibuat ringkas: alamat email username yang diingat ("Ingat saya") dipakai langsung tanpa RPC `email_for_login` (`exim.remember.email`; ditolak -> tanya server sekali & ulang bila alamatnya berganti), dan jadwal diminta BERSAMAAN dengan profil (`mulaiAmbilShipments`). |
| `views/masterlist-view.js` | Halaman Masterlist (#/masterlist): kuota fasilitas per baris barang & realisasinya per PIB. DAFTAR RINGKAS + KOTAK RINCIAN: tiap baris (per baris / per PIB) hanya yang perlu terlihat sekilas -- nomor, barang, kuota, terpakai, sisa -- dan tombol mata (atau klik barisnya) membuka kotak rincian `#mstDetailModal` (`mstBukaDetail`, `mstGambarDetail`; kunci "b:<id>" / "p:<PIB>" di `mstKeadaan.detail`): HS Code, spesifikasi, lini, nilai USD, realisasi & dokumennya; isinya dirakit ulang dari data hidup setiap halaman digambar ulang dan menutup sendiri kalau yang dibukanya sudah tidak ada. Satu penangan klik untuk halaman & kotak itu (`mstTanganiKlik`). Tata letak menurut lebar panelnya (container query `mst-daftar` / `mst-rinci`): panel < 820px = kartu. DOKUMEN TIAP PIB -- PI, LS, SKB PPh, SKB PPN, Masterlist 912 -- dari jadwal import yang nomor ajunya cocok (`mstDokumenJadwal`, barang jadwal dipasangkan dengan baris masterlist lewat uraiannya), atau diatur sendiri per PIB ("Atur dokumen", `mstAturDokumen`); ikut di unduhan Excel ("nomor (dd-mm-yyyy)", PI dengan " ITEM n"). Terpakai & sisa selalu DIHITUNG dari catatan realisasi; panel "Kuota yang masih tersedia" per jenis mesin, masa berlaku dokumen, jadwal import berfasilitas Masterlist yang belum dicatat, daftar per baris / per PIB, unduh Excel dalam susunan berkas aslinya, mulai kolom A, dengan HS CODE di samping DESCRIPTION (+ lembar "REALISASI PER PIB": nomor aju berpasangan dengan tanggalnya, juga ber-HS CODE). HS Code per baris (`hs_code`, isian di samping Uraian barang di Tambah/Ubah baris, dibatasi 8 angka lewat `batasiHsCode`): tampil di rincian baris & ikut dicari, ikut di unduhan Excel, TIDAK di cetakan stock opname. Satu realisasi bisa memuat BEBERAPA PIB (mesin dikirim bertahap; kuota dihitung sekali), masing-masing bernomor aju + tanggal sendiri -- kolom `pibs`; PIB kiriman berikutnya ditambahkan ke realisasi yang ada ("kiriman lanjutan" / tombol + PIB), dan tanggal satu PIB diatur sekali untuk semua catatannya dari susunan Per PIB. Tanggal PIB yang belum tercatat di realisasi lain diisi dari nomor ajunya (`mstTanggalDariAju`; ekor aju -> jadwal yang cocok), tetap bisa diubah. NILAI (USD) dilacak seperti unit: nilai masterlist per baris (`value_quota`) & nilai invoice per realisasi (`invoice_value`); terpakai & sisa nilai dihitung, baris yang nilainya lebih / unit habis tapi nilai belum sama / realisasi belum bernilai ditandai (saringan "Nilai perlu dicek"). Kolom dari migrasi lanjutan dibaca & ditulis lewat `mstBacaKolom` / `mstKirim`, jadi halaman tetap jalan sebelum migrasinya dijalankan. Tanpa satu baris pun, Unduh Excel & Cetak nonaktif (`mstSegarkanTombolEkspor`; Excel juga selama berkasnya dibuat) dan petunjuk "Tambah baris" hanya untuk peran yang punya tombolnya. Tabel `masterlists`, `masterlist_items`, `masterlist_usages` (migration-masterlist.sql, lalu migration-masterlist-pib-parsial.sql, migration-masterlist-nilai.sql & migration-masterlist-hs-code.sql) |
| `features/masterlist-print.js` | Cetak lembar STOCK OPNAME masterlist (A4 landscape): baris yang tersaring di layar, per lini proses, kolom sama dengan Excel unduhan kecuali HS CODE (hanya di Excel) + PIB DATE, ACTUAL QTY & REMARKS kosong untuk diisi tangan; total per satuan & kotak tanda tangan di halaman terakhir. Margin @page nol (tanpa kop/kaki peramban), jadi halaman dipecah sendiri: tinggi baris diukur di bingkai kotak cetak (`siapkan`, A4 mendatar) lalu dibagi `mstBagiHalaman()` (murni, teruji) -- tiap lembar berkepala tabel, "Halaman x dari y" & paraf |
| `features/surat-jalan-print.js` | Cetak SURAT JALAN EXPORT (A4, di kotak cetak aplikasi `ui/cetak-modal.js`) + KOP SURAT BERSAMA. `kopSuratHtml()` / `kopSuratCss()` = satu-satunya kop berlogo: logo DDI 22 mm, nama perusahaan 20pt (huruf Times dipatok di kop), alamat Pusat/Cabang 9,5pt, garis kop tebal-tipis -- dipakai Form Pengajuan Dana (`fund-request-print.js`), Surat BC (`surat-bc.js`) dan Surat Jalan Export, jadi ketiganya sama persis (`SJ_LOGO`, `SJ_PERUSAHAAN` juga dipakai CIPL, masterlist, Surat Jalan Lokal). Tata letak tanpa bingkai luar: kop -> judul -> blok penerima (KEPADA / nama / garis / ALAMAT PENERIMA / alamat, kapital) di samping Nomor / Tanggal / Ref -> tabel barang (No, Nama, Quantity, Package -- satu sel per box, `sjKelompokBox` -- dan Nopol: satu kotak per mobil dibagi rata setinggi baris barang, `sjSelNopol`) -> Total per satuan -> empat kotak tanda tangan. Huruf isi 10pt (judul 16pt, nama penerima 12pt). Garis lewat SATU variabel `--sj-line`; tabel barang memakai konvensi bawah+kiri (tiap baris menutup dirinya sendiri) dan tepi kanannya digambar kolom Nopol. MEMENUHI A4: `sjIsiKertas()` melebarkan ruang kosong tabel sampai tanda tangan jatuh di dasar kertas; sebelumnya `sjPasKertas()` merapatkan tabel BERTINGKAT (`SJ_TINGKAT_RAPAT`: 9pt / 8,5pt / 8pt) bila daftar barang tidak muat satu lembar (huruf normal sekitar 16 baris; tingkat 1-3 sekitar 21, 26, 31); yang tetap tidak muat menyambung ke halaman berikutnya (judul kolom berulang, Total sekali, tanda tangan tidak sendirian). Kop, judul & blok penerima tidak ikut dirapatkan |
| `features/fund-docno.js` | Aturan "Doc No" di Form Pengajuan Dana: kotak Doc No ada & tersimpan untuk SEMUA vendor (termasuk PRIME & WIDE; bisa dicari di riwayat, tampil di Detail), yang diatur hanya CETAKANNYA -- daftar vendor yang Doc No-nya TIDAK dicetak (bawaan PRIME & WIDE), diatur dari kotak Aturan Doc No di halaman Nomor Dokumen. Daftar yang sama menentukan penanda tangan keempat (CFO). Tersimpan di `report_settings`; `fundPakaiDocNo()` ("vendor ini mencetak Doc No") dipakai cetakan dan isian CFO di form, `fundSelaraskanDocNo()` mengganti keterangan di bawah kotak Doc No DOC NO BAWAAN, POLANYA BISA DIATUR: bawaan kode `Distribution-{YYMM}-0000` (`FUND_DOCNO_POLA_BAWAAN`; dulu `EI-{YYMM}-0000`, tetap dikenali lewat `FUND_DOCNO_POLA_TERDAHULU`), diganti dari baris "Doc No bawaan" di kotak Aturan Doc No (`#fundDocNoPolaNilai` = contoh bulan berjalan, tombol Ubah -> `fundDocNoPolaBukaUbah`: showPrompt berpratinjau bulan ini & bulan depan, khusus EXIM). Tersimpan di `report_settings` kunci `fund-doc-no-bawaan` = `{ pola, lama }` (`fundDocNoPolaSimpan`; pola yang diganti masuk riwayat `lama`, maks. 10) dengan salinan peramban `exim.fundDocNoBawaan`; dimuat bersama daftar vendor (`fundDocNoMuat` -> `fundDocNoPolaMuat`, realtime per kuncinya). Kode `{YYMM}`, `{YYYYMM}`, `{YYYY}`, `{YY}`, `{MM}`; Doc No bulan ini yang diketik apa adanya ("Distribution-2611-0000") dibaca sebagai pola (`fundDocNoPolaDariContoh`); pola kosong = form baru tanpa Doc No; pola harus memuat huruf/tanda selain angka & kode (`fundDocNoPolaPeriksa`). Diisikan `fundIsiDocNoBawaan` ke form BARU (resetDocNumForm & saat aplikasi dibuka), diperbarui ke bulan berjalan & pola terbaru selama masih bawaan (syncDocNumConditional, `fundDocNoPolaTerapkan`), TIDAK diberikan ke pengajuan yang dibuka untuk diubah (panel di #dnEditBadan / dnEditingId); kotak yang dikosongkan / diketik sendiri tidak diisi lagi; klik memilih angka di ujung pola ("0000"; pola tanpa angka di ujung -> kursor di ujung); keterangan `#fundDocNoBawaanKet` dirakit `fundDocNoKeterangan` (angkanya ikut pola) selama masih bawaan; bawaan yang belum diganti TIDAK tersimpan & tidak tercetak (`fundDocNoTanpaBawaan` di readDocNumForm -- isian menurut pola yang berlaku, riwayatnya, bawaan kode, atau EI lama, untuk bulan mana pun: `fundDocNoPolaIsian`). |
| `features/fund-vendor.js` | Dropdown "Dibayarkan Kepada" (vendor) di Pengajuan Dana: daftar tersimpan di `report_settings` (kunci `fund-vendor`) + vendor pengajuan lama, tanpa kembar; "+ Tambah vendor baru…" menyimpan ke daftar. Gambar daftar, pilihan tambah, rapikan & kunci nama lewat `ui/pilihan-tambah.js` (sama dengan dropdown Customer Permintaan Nomor Invoice); `fundVendorPastikan(nama, el)` menambah pilihan bila belum ada |
| `features/fund-vendor-aturan.js` | Aturan per VENDOR di Pengajuan Dana (tabel `FUND_VENDOR_ATURAN`, dicocokkan per kata utuh seperti Aturan Doc No: "PRIME" mengenai "PT PRIME FREIGHT INDONESIA", "WIDE" mengenai "PT. WIDE LOGISTICS", bukan "WORLDWIDE"): `ppnDesimal` (PRIME: PPN per baris 2 desimal; selain itu rupiah penuh -- `fundVendorPpnDesimal`) dan `noInvoice` (WIDE: No. Invoice BAWAAN `IN-WL<TTBB>-00000`, TTBB = tahun-bulan dari Tanggal Invoice -- `fundNoInvoiceBawaan`; bulan diambil dari hari ini bila tanggal belum diisi). Bawaan terisi hanya selagi kotak kosong atau masih berisi bawaan sebelumnya (`dataset.autoFill`, pola fund-rincian.js), mengikuti vendor & tanggal, tidak menimpa ketikan, tidak terisi saat membuka pengajuan tersimpan; Keterangan di bawah kotak tampil selama isinya masih bawaan (hilang begitu nomor diketik). Simpan DITOLAK selama masih berisi bawaan (00000 harus diganti nomor urut di invoice). Dimuat SEBELUM fund-lines.js (yang menghitung saat dimuat) |
| `features/fund-invoice-sama.js` | Kotak "Aturan No. Invoice" (khusus EXIM): daftar vendor yang No. Invoice-nya boleh sama (bawaan JNE), tersimpan di `report_settings` dan dibaca juga oleh pemicu database -- lihat "Pengecualian No. Invoice" di atas. `fundInvoiceBolehSama(payee)` dipakai tanda langsung & pemeriksaan Simpan |
| `features/fund-lines.js` | Rincian biaya Pengajuan Dana: kotak nilai bergaya ketik aplikasi -- koma ribuan, titik desimal (`formatRupiahKetik`, `formatNilai`; tempelan gaya Indonesia "59.883.994,65" dikenali) -- dan menerima rumus ("=1,000+500", `hitungRumus` / `adalahRumus` / `formatRumusKetik` -- pengurai bersama di ui/number-input.js, dipakai juga Unit Price, Neto & Bruto tabel barang). Nilai di larik & payload berupa ANGKA (`nilaiKotakDana`, `fundBarisDariSimpanan`); teks di payload = pengajuan lama gaya Indonesia, dibaca `parseRupiah`. Di layar (form, riwayat, panel Detail, Summary) DAN di surat cetak: "Rp. 1,234,567.89" (`formatNilai`, `frNilai`). PPN/PPh, diskon, dan pembagian per BL/AWB (`fundBagiPerAwb`) supaya satu invoice beberapa AWB terhitung per kiriman. PEMBULATAN (cara akunting): PPN PER BARIS menurut VENDOR (`fundPpnSen(mata, payee)`; tabel aturannya di `features/fund-vendor-aturan.js`) -- hanya PRIME yang 2 desimal, vendor lain (WIDE dsb.) rupiah penuh per baris, terdekat dan setengahnya naik menjauhi nol; mata uang selain rupiah selalu sen. `fundLinePpnNilai(nilai, baris, perSen)` bekerja dengan bilangan bulat (tarif per-10.000: 1,1% = 110), bukan pecahan biner. TOTAL PPN (rupiah) dibulatkan KE ATAS ke rupiah penuh (`fundNaikRupiah`: 8,758,011.35 -> 8,758,012; USD tetap bersen). PPH 23 yang tertulis dibulatkan biasa ke rupiah penuh (2% x 9,077,683 = 181,553.66 -> 181,554, seperti invoice). TOTAL (rupiah) TIDAK dijumlah dari angka-angka bulat itu: dihitung TEPAT -- Total Nilai + PPN baris + PPH 23 apa adanya, dalam 1/10.000 rupiah (bilangan bulat) -- lalu dibulatkan KE ATAS SEKALI (10,518,322 + 99,855 - 181,553.66 = 10,436,623.34 -> 10,436,624), jadi bisa 1 rupiah di atas Total Nilai + Total PPN - PPH 23 tertulis, sama seperti invoice forwarder. Bagian per BL/AWB: DPP + PPN - PPH bagian, selisih pembulatan TOTAL diberikan ke bagian yang paling jauh dari bagian tepatnya, jadi jumlahnya tetap TOTAL. Non-rupiah: TOTAL = DPP + PPN - PPH 23 (`Math.round`) per sen. Semua total dihitung SATU fungsi, `fundLineTotals(lines, mata, payee, dokumen)` (form, surat cetak, Detail, laporan, impor invoice, biaya kiriman, Summary) dan TIDAK tersimpan. BEBERAPA DOKUMEN (invoice + invoice / debit note, `dok` tiap baris): tiap dokumen dihitung & dibulatkan sendiri (`fundTotalKelompok`) dan TOTAL pengajuan = jumlah TOTAL tiap dokumen; rinciannya di `perDokumen` ([{ id, totalNilai, totalDiskon, totalNet, totalPpn, dppPph, pph, grandTotal }], utama dulu lalu urutan `dokumen`; baris yang dokumennya sudah tidak ada masuk dokumen utama) -- ditampilkan sebagai blok "Total per dokumen" di kaki form (`kakiPerDokumenHtml`) & panel Detail (`dndTotalPerDokumenHtml`), dan sebagai baris SUBTOTAL / POTONGAN PPH 23 / TOTAL tiap dokumen di surat cetak (`frTabelRinci`). Surat cetak: kolom JUMLAH (Rp) tiap baris = nilai + PPN baris itu; angka bulat TIDAK diberi ".00" walau baris lain bersen (`frSelUang` -> `formatNilai`) -- dihitung dari rincian, jadi aturan vendor berlaku juga untuk pengajuan lama saat ditampilkan / dicetak. Bagian PPN per BL/AWB dibagi dalam satuan yang sama (`fundBulatkanBagian`, sen untuk non-rupiah), jadi jumlah bagian tetap pas dengan total. Baris ber-`grupPpn` (impor invoice FedEx / DHL) tetap RUPIAH PENUH per grup mengikuti vendornya (`fundLinePpnRupiah`) supaya totalnya persis invoice. Trucking (`fundTanpaPecahAwb`; nama lama Inland Trucking / Local Sale ikut, `fundJenisTransaksiBaku` + migration-fund-trucking.sql) TIDAK dipecah: isian BL/AWB-nya berisi nomor DO / Surat Jalan, jadi seluruh pengajuan satu bagian, tanpa kolom BL/AWB di rincian. ENTER di kotak rincian: rumus dihitung dulu; di baris TENGAH sebuah kelompok turun ke baris berikutnya di kelompok yang sama, di baris TERAKHIR KELOMPOKNYA (invoice utama, tiap invoice tambahan, tiap Debit Note) menambah baris baru di kelompok itu (`fundKelompokBaris`; baris yatim = kelompok utama), lalu kursor pindah ke kolom yang sama di baris baru. Sel rincian membawa `data-label`: di wadah < 860px tiap pos jadi kartu isian (`.tabel-isian`, docnum.css) -- begitu juga barang Surat Jalan Lokal (do-lines.js) & Surat Keterangan Fungsi (surat-bc.js) |
| `features/fund-invoice-import.js` | Isi form Pengajuan Dana dari PDF tagihan (tombol "Isi dari invoice / billing"): FedEx & DHL Express per komponen tiap AWB -- uraiannya cukup nama komponennya ("Duty & Tax"); hanya invoice BEBERAPA AWB yang diberi "– AWB <nomor>" (`danaAkhiranAwb`), tanpa berat --, DHL Inbound Charges, billing DJBC, tabel forwarder (WIDE dsb.: nomor B/L / AWB berhenti di label kolom sebelahnya, AWB 11 angka ditulis "160-19815294", `danaNomorBlTabel`), dan PRIME FREIGHT (`bacaInvoicePrime`: INVOICE dan DEBIT NOTE satu format -- DESCRIPTION / CUR / RATE / AMT (CUR) / AMOUNT (IDR) / VAT, kolom kosong tidak tercetak jadi dibaca dari urutan angka; judul lembar menentukan `debitNote`; BL/AWB = nomor HAWB saja, MAWB hanya bila tak ada HAWB karena keduanya satu kiriman; selalu kolom AMOUNT (IDR), pengajuan IDR). UNGGAH BANYAK BERKAS: tombol menerima beberapa PDF dan seluruh form Pengajuan Dana adalah area seret-lepas (`.is-dragover`, petunjuk dari `data-drop-teks`; hanya seretan BERKAS yang ditangani) -- keduanya masuk `danaDariBerkasPdf`. Yang digabung dalam satu pengajuan: vendor sama (`fundVendorKunci`), sama-sama tagihan (billing berdiri sendiri), nomor berbeda; dokumen utama = invoice pertama (debit note tidak jadi "No. Invoice"), sisanya dokumen tambahan -- invoice dulu lalu debit note, urutan memilih berkas tidak berpengaruh; yang dilewati disebut di pesan (bukan PDF atau gambar / tidak terbaca / vendor beda / nomor sama / lebih dari `DANA_MAKS_BERKAS` = 10). Form sudah berisi tagihan vendor yang sama -> satu pertanyaan "Tambahkan" (hanya yang baru) atau "Ganti Isi Form"; dokumen yang sudah ada tidak ditimpa. Mengisi form (`danaIsiForm`) membuang dokumen tambahan lama. Rincian bawaan lewat fund-rincian.js. HASIL SCAN: PDF tanpa lapisan teks dan gambar (JPG / PNG / WEBP) dibaca lewat `ocrBacaBerkas` (import/ocr.js) dan teksnya masuk pembaca vendor yang SAMA. Pembaca memulihkan HANYA yang bentuknya sudah pasti: nomor invoice Prime (`danaPulihNoPrime`, "Al2602950" -> "AI2602950"), HAWB (`danaPulihHawb`, "PFIJKTO06787" -> "PFIJKT006787"), kepala tabel / judul / mata uang yang rusak (`danaKepalaPrime`, `danaJudulLembar`, `danaMataUangBaris`), "P.1.B" -> "P.I.B" dan "7B FEE" -> "ZB FEE" (`danaRapikanUraian`); satu digit salah baca dibetulkan dari SUB TOTAL bila TEPAT satu baris bisa dibetulkan satu digit yang memang sering tertukar (`danaPulihJumlahBaris`; dicatat di `h.pulih` dan disebut di toast) -- selebihnya diserahkan ke pemeriksaan jumlah `h.cocok`. Satu berkas bisa memuat beberapa dokumen: halaman bernomor invoice baru = dokumen baru (`danaPecahHalaman`), halaman yang mengulang dokumen dibuang dan disebut (`danaBuangKembar`), nomor BL / AWB hasil OCR yang beda tipis disamakan (`danaSamakanBl`). Toast kemajuan OCR bersifat tetap (`showToast(..., { tetap: true })`, `danaLaporOcr`) dan toast hasil selalu mengingatkan untuk mencocokkan angka dengan dokumen asli. Peringatan jenis transaksi berbeda antar dokumen ada; jenis PENGELUARAN tidak (invoice Freight + debit note Storage itu wajar) |
| `features/fund-rincian.js` | Rincian (Details, Subject surat cetak) bawaan Pengajuan Dana (`fundRincianBawaan`): Billing "Payment Request - Billing Tax <Import / Export> <barang>" (contoh "Payment Request - Billing Tax Import Bead Ring etc."; impor PDF billing DJBC mengisi BL/AWB dari jadwal yang No. Aju-nya cocok, jadi barangnya ikut); selainnya "Payment Request - Invoice <Vendor> <Freight Charge / Storage Charge / Tax Advance> <Import / Export> <barang>" -- barang = Uraian PERTAMA jadwal yang BL/AWB-nya cocok, ditambah "etc." bila barangnya lebih dari satu (`fundBarangDariAwb`). Diisi selama kosong / masih sama dengan bawaan terakhir (`data-auto-fill` = teksnya), ikut berganti saat Jenis Pengeluaran, Jenis Transaksi, vendor, atau BL/AWB berubah dan saat impor invoice (`fundSelaraskanRincian`). BL/AWB = ISIAN PERTAMA form: jadwal yang nomornya cocok (`fundJadwalDariAwb`) mengisi Jenis Transaksi (moda + Import/Export), Dibayarkan Kepada (vendor terpanjang yang kata khasnya ada di nama forwarder jadwal -- `fundVendorDariForwarder`, PT WIDE LOGISTIK INDONESIA -> WIDE; tanpa padanan -> nama forwarder sebagai pilihan baru) dan Customer (party jadwal Export) -- `fundIsiDariAwb`; hanya isian kosong / masih isian otomatis (`data-auto-awb`), nilai yang diubah user tidak ditimpa, dan beberapa jadwal yang nilainya berbeda tidak mengisi apa pun |
| `features/fund-saran-awb.js` | SARAN HOUSE BL/AWB di kotak BL/AWB form Pengajuan Dana (`#dn-fund-blAwb`, dibungkus `.saran-awb`; gaya di form.css di samping dropdown Nama Shipper / Buyer yang jadi contohnya -- bukan di docnum.css, karena tes "riwayat nomor digeser, bukan dibungkus" melarang elipsis di seluruh berkas itu): mengetik minimal 2 huruf / angka memunculkan PALING BANYAK 4 (`FUND_SARAN_AWB_MAKS`) nomor House B/L / House AWB dari SEMUA jadwal Import & Export (`fundDaftarHouseAwb`: satu per kunci huruf & angka, ejaan terbanyak; keterangan "Sea Import · PT X" dari jadwal terbaru; hanya House -- Master tidak ikut; nomor di bawah 5 huruf / angka tidak ikut, sama dengan `bkKunciKiriman`). MIRIP = memuat ketikan, spasi / strip / besar-kecil huruf tak dihitung; urut sama persis > berawalan > berakhiran (cukup mengetik empat angka belakang) > memuat, yang setara dari jadwal terbaru (`fundSaranAwb`); bagian yang cocok ditebalkan (`fundSorotAwb`). Kotak boleh memuat BEBERAPA nomor (pemisah "/", koma, titik koma, seperti `fundDaftarAwb`): yang disaring nomor di sekitar KURSOR (`fundPecahAwb`), nomor lain di isian tidak disarankan lagi, dan memilih hanya mengganti nomor itu (`fundPasangSaranAwb`). Ketikan TIDAK PERNAH diganti sendiri: saran terpasang hanya lewat klik atau panah + Enter -- Enter / Tab tanpa sorotan tidak memilih apa pun, Esc menutup, panah bawah membuka lagi --; nomor di luar jadwal tetap bebas diketik. Daftar hanya terbuka selagi kotak difokus (isian oleh impor invoice / draf yang dipulihkan tidak membukanya) dan ditutup begitu fokus keluar. LETAK: di bawah kotak; naik ke atas (`.is-atas`) HANYA bila ruang bawah kurang dari `FUND_SARAN_AWB_RUANG` DAN di atas muat penuh sampai bingkai yang memotongnya (`fundNaikSaranAwb`, ruangnya diukur `fundRuangSaranAwb`: tepi bingkai ber-overflow terdekat seperti `.docnum-shell`, dan `visualViewport` supaya papan ketik ponsel terhitung) -- daftar yang naik ke bingkai overflow:hidden terpotong dan barisnya tak terlihat; kalau tak muat di mana pun tetap di bawah dan halaman digulir secukupnya (`scrollIntoView` nearest). Diukur dengan tinggi daftar PENUH, bukan baris yang tampil, supaya tak berpindah atas-bawah selagi mengetik. Pendengar `keydown`-nya di fase TANGKAP: harus jalan sebelum Enter-pindah-isian di ui/fokus.js, kalau tidak saran yang disorot tak sempat terpilih. Memilih saran memicu `input` + `change` seperti diketik, jadi `fundIsiDariAwb` (Jenis Transaksi, vendor, customer, Rincian) dan tabel rincian ikut jalan. Daftar jadwal disusun sekali per giliran mengetik (dibuang saat kotak difokus lagi) |
| `features/fund-report-ledger.js` | MESIN analisis sub-tab Report Pengajuan Dana (murni, tanpa DOM; dimuat sebelum `fund-report-blok.js` & `fund-report.js`). Menyatukan pengajuan dana + invoice + jadwal jadi satu "buku besar" (`lapBangunBuku`) supaya semua angka saling berhubungan dan bisa dianalisis. PENAUTAN: pengajuan -> kiriman lewat nomor BL/AWB (`kunciAlnum`; tiap BL/AWB satu bagian `perAwb`, porsinya menjumlah TEPAT ke kas pengajuan), trucking (nomor DO) sengaja tidak ditautkan; invoice -> kiriman lewat `payload.shipmentId` (bukan nama customer). HITUNGAN (semua IDR): `lapUrai` -- kas yang diminta = jasa + bea masuk + lain-lain + PPN jasa + PPN impor + PPh 22 − PPh 23 yang ditahan; `lapJembatan` kas -> BIAYA SEJATI (PPN masukan, PPN impor, PPh 22 dapat dikreditkan = bukan biaya; bea masuk masuk harga pokok barang, PSAK 14 / IAS 2); `lapEkonomi` landed cost per KOHORT kiriman (tanggal PIB/PEB; biaya yang tertaut dihitung walau ditagih bulan lain = matching principle), subtotal per ARAH (nilai pabean impor dan penjualan ekspor tidak pernah dijumlah jadi satu rasio), ekspor dibanding invoice kiriman yang SAMA; `lapRekonBea` PIB vs Billing / Tax Advance (toleransi Rp 1.000, lima status `LAP_STATUS_BEA`); `lapHutang` roll-forward (pembuka + ditagih − dibayar = penutup, umur menurut JATUH TEMPO bukan tanggal invoice, disiplin bayar, kebutuhan kas ke depan, PPh 23 disetor tanggal 10 bulan berikutnya); `lapKartuVendor` (skor + konsentrasi HHI); `lapAkrual` (kiriman berjalan >= 14 hari tanpa biaya = kandidat accrual); `lapPencilan` (modified z-score > 3,5 per jalur dengan >= 6 kiriman); `lapKorelasi` / `lapPenggerak` (Pearson r, R², regresi OLS, uji-t dua sisi 95%: hubungan hanya dinyatakan bila datanya cukup & signifikan); `lapKontrol` (daftar pemeriksaan data); `lapDaftarKiriman` / `lapDaftarTautan` (data lembar Excel relasional). TANPA perubahan skema database: semua dari payload `document_numbers` & jadwal yang sudah ada |
| `features/fund-report-blok.js` | Penyusun BLOK laporan dari hasil mesin `fund-report-ledger.js`: `lapBlokBuku` (blok tabel; tiap sel `sel(nilai, format, { b, kelas, teks })` -- satu sumber untuk layar DAN Excel, sehingga angkanya selalu sama), `lapWawasanBuku` (kalimat "In short"), `lapKartuBuku` (kartu KPI), `lapTafsirKorelasi` (bahasa tafsir: data sedikit / tidak signifikan -> "too few to rely on", bukan klaim), grafik SVG (`lapSvgAir` air terjun kas -> biaya sejati, `lapSvgKategori` umur hutang, `lapSvgSebar` diagram sebar + garis regresi; sumbu biaya mulai dari nol, garis dipotong di batas sumbu) dan `lapKamusData` (kamus data lembar Excel). Seluruh teks BAHASA INGGRIS (laporan dikirim ke HQ DD Korea; diuji) |
| `features/fund-report.js` | Sub-tab Report di riwayat Pengajuan Dana (laporan EXIM Spending): saringan (tahun, sampai bulan, jenis pengeluaran), 8 kartu KPI, "In short", 11 bagian berurutan (Summary, From cash to true cost, Month by month, Where the money goes, Shipment economics, Duties & taxes, Payables & payment discipline, Vendor comparison & scorecard, Data quality & controls, What drives the cost, Budget tahun depan) dengan daftar loncat, "More details" (A-I), dan unduhan Excel (`lapUnduhExcel` -> `lapSusunWorkbook`, 23 lembar termasuk lembar data relasional Shipment Ledger / Request-Shipment Links / Cost Data / Sales Data dan Data Dictionary). Baris laporan: `lapBarisDana` (satu pengajuan -> angka IDR: `tagihan` uang yang diminta, `tahan` PPh 23, `pulih` pajak dikreditkan, `biayaEko` biaya sejati, `perAwb`), `lapBarisInvoice`, kurs = NDPBM kiriman yang tanggalnya terdekat (`kursNdpbm`). DASAR TANGGAL tiap bagian dinyatakan di kepala laporan: bagian lama (Month by month, Where the money goes, rincian) = TANGGAL INVOICE vendor; From cash to true cost & Payables = kas penuh (pajak ikut); Shipment economics & Duties & taxes = kohort tanggal PIB/PEB. `hitungAnalisis` (YoY, MoM, ramalan, anggaran) -> `lapSusunBlok` -> `lapGambar` (HTML) / Excel. Perbandingan vendor (`lapBandingVendor`) hanya membandingkan vendor pada jalur DAN layanan yang sama (Freight dengan Freight, Storage dengan Storage; biaya "Other" tidak diperingkat). Anggaran tahunan di `report_settings` (`lapAmbilAnggaran`) |
| `views/docnum-view.js` | Halaman Nomor Dokumen: penerbitan nomor (dari database, nomor kembar diganti nomor berikutnya -- lihat "Nomor dokumen: ditentukan database"), TAGIHAN GANDA Pengajuan Dana: nomor invoice / billing yang sudah diajukan ditandai merah begitu diketik / terisi dari impor invoice (jeda 300 ms, `dnPeriksaTagihanGandaLangsung` atas daftar `bkAmbilDana`) dengan satu kalimat di bawah kotaknya ("Sudah diajukan di 344/EXIM/DDI/X/2026 (20-10-2026, FEDEX)", `dnTandaiTagihanGanda`); saat Simpan diperiksa lagi ke database (`dnCariTagihanGanda`) dengan pop-up singkat -- pengajuan serentak ditahan pemicu database --; No. Invoice vendor di daftar "Aturan No. Invoice" (bawaan JNE: nomor rekening) tidak diperiksa, Nomor Billing & vendor lain tetap (`dnTagihanBolehSama`, `dnJenisTagihan`; ganti vendor ke / dari vendor itu memasang / melepas tandanya), riwayat (cari -- teks lewat database, kolomnya `DN_KOLOM_CARI` termasuk Doc No Pengajuan Dana (`payload->>docNo`; di tab Summary lewat `fsumSaring`); kata kunci berupa angka juga mencocokkan Nilai / Amount yang tampil, dihitung di aplikasi atas seluruh riwayat (`dnAngkaCari`, `dnCocokCari`) --, status bayar, rentang tanggal Pengajuan Dana menurut Tanggal Terbit / Tanggal Invoice / Jatuh Tempo / Tanggal Bayar -- `DN_DASAR_TANGGAL`; SARINGAN RIWAYAT SEBARIS (docnum.css, `@container dn-riwayat`): tanggal dasar + pemicu rentang & status bayar selebar ISINYA (pemicu tidak direntang -- tanpa ruang kosong sesudah panahnya; margin tumpuk -1px di wadah `.dn-saring-tanggal`, bukan di tombol, supaya teksnya tidak terpotong 1px), kotak cari mengisi sisa baris, kotak cari + muat ulang satu kelompok `.dn-cari-grup` (tidak muat -> turun BERSAMA); riwayat ≤560px: tiap saringan selebar baris, panah pemicu di ujung kanan; kolom riwayat Pengajuan Dana di `DN_KOLOM_DANA`, Status Bayar terakhir sebelum aksi karena menempel di kanan, jatuh tempo terlewat ditandai), dan Ubah Isian lewat pop-up -- panel form jenisnya dipinjam ke `#dnEditModal` lalu dikembalikan, draf pengajuan baru di belakangnya dipulihkan utuh. Status bayar (EXIM & Finance) ditulis lewat fungsi database `set_fund_paid(p_id, p_paid_at, p_bukti)` (migration-bukti-bayar.sql; versi dua argumen dari migration-finance-tanda-bayar.sql): hanya `paidAt`/`paidBy`/`paidProof` yang berubah; `p_bukti` selalu dikirim (null tanpa bukti) supaya panggilannya tidak mendua; database yang belum mengenal bukti -> tanpa bukti dicoba ulang dua argumen, EXIM memakai jalur lama (`dnSetelBayarLangsung`), Finance diberi tahu berkas migrasinya. BUKTI BAYAR opsional di kotak Tandai Sudah Dibayar (`dnKlikBayar`): tanggal & lampiran sebaris (dua kolom), berkas diunggah saat Tandai Lunas ke `bukti-bayar/<id>/` di bucket `lampiran-jadwal` lalu rujukannya tersimpan sekali jalan (`payload.paidProof`); simpan gagal -> unggahan dihapus lagi, kotak tetap terbuka (`dnPesanGalatBukti` menunjuk migrasinya untuk Finance yang ditolak Storage). Klip per berkas di sebelah lencana Lunas (`dnTautanBuktiBayar`, semua peran) & baris Bukti Bayar di kotak Detail; membatalkan lunas menghapus berkasnya sesudah tersimpan. Ubah Isian membawa status bayar dari database (`dnPayloadTerbaru`), bukan dari salinan di layar. Tab jenis dokumen selebar kartu & riwayat menurut lebar panelnya (container query `dn-shell` / `dn-riwayat`): riwayat < 560px = kartu ringkas berlabel (`data-label` tiap sel), menengah = tabel bergeser dengan kolom aksi menempel. Baris tab riwayat di ponsel: tepi yang masih bisa digeser memudar (`dnTandaiTepiTab`). Riwayat di ponsel (kartu, docnum.css): sel Tanggal / Tanggal Invoice / Jatuh Tempo & tanggal Lunas tidak pernah dipecah di tanda hubungnya Tagihan ganda memeriksa SEMUA nomor sebuah pengajuan (`dnNomorTagihan`: No. Invoice utama + invoice / debit note tambahan `payload.dokumen`; `dnDokTagihan` menandai kotak dokumen tambahan yang kembar, `dnLabelTemuan`). Pembaruan realtime di ujung berkas (`dnRtProses`): salinan Pengajuan Dana dipasangi barisnya, tanda "sudah diajukan" seketika, riwayat diam-diam (`renderDocNumHistory({ diam })`), `refreshDocNumPreview(tab, { diam })`, pemberitahuan di pop-up Ubah isian. |
| `features/docnum-detail.js` | Kotak Detail pengajuan nomor ("Lihat seluruh isian") untuk keempat jenis dokumen: susunan bagian per jenis (`DN_DETAIL_SUSUNAN`), tabel rincian biaya / daftar barang, dan bagian "Lainnya" untuk isian yang belum terdaftar. Nomor Mobil Delivery Order (`vehicle` + `vehicleExtra`) tampil satu butir per mobil (`dndDaftarKendaraan`) `dndSegarkan(id, dihapus)`: pop-up Detail yang terbuka ikut isi terbarunya (realtime). |
| `features/vehicle-list.js` | Daftar Nomor Mobil di pengajuan Delivery Order (tombol "+ Nomor Mobil" di baris label No. Kendaraan): kotak pertama tetap `data-dn="vehicle"` (jalur simpan lama, jadi pengajuan lama terbaca tanpa migrasi data), mobil kedua dst. kotak `[data-veh-extra]` yang disimpan sebagai `vehicleExtra` di payload (`kendaraanTambahKotak`, `setKendaraanExtra`; dibaca `readDocNumForm`, ikut draf form & pop-up Ubah Isian). Enter tidak diambil alih -- tetap pindah ke isian berikutnya. Penyatuan daftarnya (kosong dibuang, nomor kembar dicetak sekali) ada di `sjDaftarKendaraan()` (`features/surat-jalan-print.js`), satu aturan untuk form, cetakan (kolom Nopol Surat Jalan: satu kotak per mobil, tinggi dibagi rata, hanya setinggi baris barang) & detail |
| `features/cipl-tata.js` | Model kisi lembar cetak CIPL (kolom mm, baris pt, sel gabungan, garis per sisi) -> `ttHtml` (cetak). Pemotongan baris & huruf yang dikecilkan dihitung dari metrik Arial / Times (`TT_METRIK`); `ttBungkus` / `ttUkuranPas` juga dipakai unduhan Excel untuk tinggi baris. `ttExcel` = replika kisi (satu baris teks = satu baris Excel, `ttExcelRuns`) -- kini hanya untuk model tanpa spek; `ttExcelHurufNormal` (huruf Normal Arial 11) & `ttXlHurufPengancarBaris` (huruf pengancar AutoFit) dipakai unduhan CIPL |
| `features/cipl-print.js` | Cetak Commercial Invoice, Packing List (& Shipping Instruction Dynamic Design) dari pengajuan nomor + jadwal tertaut. Profil pelanggan memilih tata letak; `ciplDaftarTata` = daftar lembar untuk cetak & Excel. `ciplProfilCocok(nama)` = profil yang namanya cocok (`kunciAlnum`) atau null (`ciplProfil` jatuh ke profil Korea); profil juga membawa `isianPihak` -- Skema Invoice & pihak bawaan form Permintaan Nomor (Kumho: Third Party, Pembeli = penjual Korea; Penjual tidak dibawa profil mana pun -- selalu blok baku). Kotak pihak dari isian Pihak pengajuan: Shipper/Exporter = blok BAKU untuk SEMUA customer (`ciplShipperBaris()` = `CIPL_SHIPPER` kapital, di CI, PL, SI & Excel, Dynamic Design maupun Kumho, apa pun isian Penjual tersimpannya -- isian itu tidak dipakai lagi untuk mencetak), Consignee = Penerima (`ciplKonsigneeBaris`), Buyer = Pembeli bila Third Party Invoice & berbeda dari Penerima (`ciplPembeliBaris`); tata letak Third Party: [Shipper | Referensi dokumen + Notify] lalu [Consignee | Buyer] (`ciplDdKartu`). Kotak Packing details Packing List (`ciplRincianKemasan`, satu sumber untuk cetak, Excel, Dynamic Design & Kumho) = teks packing + baris DIMENSION (`ciplVnDimensi`) + MEASUREMENT (jumlah M³) + "N PACKAGES" (`ciplTotalKoli`). Baris DIMENSION mengikuti kolom **Kemasan** (`ciplKoliBarang`, angka pertama di kolom itu) dan **Jenis Kemasan** (`ciplJenisKemasanBarang`, lalu huruf sesudah angka di kolom Kemasan, lalu jenis barang di atasnya, lalu BOX) tiap barang -- bukan jumlah baris barang; singkatan `ciplSatuanKemasan` (BOX = BX, PALLET = PLT, CARTON = CTN, PACKAGE = PKG, CRATE, CASE, DRUM, ROLL; kode CEISA & jamak dikenali, selebihnya ditulis apa adanya) TABEL BARANG CI / PL Dynamic Design bergaya lembar Kumho (`ciplDdTata`): NO | GOODS DESCRIPTION + sub-judul "Description info : PTN, SIZE, MOLD NO" (nama utuh, `itemDisplayName` -> `b.uraian` dari `ciplBarisBarang`) | QTY | UNIT | UNIT PRICE & AMOUNT (PL: NET WT. & GROSS WT.); HS Code tidak per baris -- ditulis SEKALI sebagai butir kartu DOCUMENT REFERENCE (`ciplRefHsCode`, sesudah No. Invoice & PO, sebelum Notify; HS berbeda dipisah koma; satu HS angka murni = sel angka di Excel lewat `nilaiExcel`). Shipping Instruction tetap menulis HS Code-nya sendiri. |
| `features/cipl-vn-print.js` | CIPL Kumho (layout "vn") bergaya Dynamic Design lewat penyusun yang sama (`ciplTataFormal`); isi khas Kumho tetap (Seller, L/C, notify, marks "C# : 8-1"). Nama barang = Description + Pattern + Size + Mold No. Consignee & Seller (= Pembeli) diambil dari isian Pihak pengajuan bila terisi, selain itu bawaan profil; Shipper = blok baku semua customer (`ciplShipperBaris()`, cipl-print.js) -- tulisan shipper Kumho sendiri (`CIPL_VN_SHIPPER`, "Desa/Kelurahan") dihapus. `ciplVnDimensi(items)` = baris DIMENSION Packing List (dipakai juga lembar Dynamic Design): peti seukuran & sejenis digabung, jumlahnya DIJUMLAHKAN dari kolom Kemasan tiap barang ("120 * 122 * 71 (cm) * 4 BX", "100 * 100 * 90 (cm) * 2 PLT"); ukuran sama tapi jenis beda = baris sendiri; urutan = kemunculan pertama. Barang yang kolom Kemasan-nya kosong ("↳ ikut" = satu kemasan dengan barang di atasnya) tidak menambah hitungan, jadi jumlah semua baris = "N PACKAGES". Hanya data lama yang sama sekali tak mencatat jumlah kemasan memakai qty (satu set = satu peti, sama dengan CBM & total PACKAGES Kumho). `computeItemCbm` tidak diubah |
| `features/cipl-excel.js` | Unduh CIPL sebagai Excel (`ciplBukuKerja`): lembar kerja dari spek / data yang sama dengan cetakan (`ciplDaftarTata` -> `T.spek` / `T.si`; `ciplXlFormal` CI & PL, `ciplXlSi` SI) -- kolom = kolom tabel barang, satu barang satu baris, rumus Amount & TOTAL, sel tanggal, pengancar AutoFit di luar area cetak, A4 1 halaman lebar dengan kepala tabel berulang; nama berkas = nomor invoice; satu unduhan pada satu waktu. Lihat "CIPL: satu sumber untuk cetak & Excel" |
| `app-init.js` | Titik masuk aplikasi — memanggil `loadShipments()` |
