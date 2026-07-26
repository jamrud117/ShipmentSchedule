# EXIM DDI / ShipmentSchedule — Ringkasan Perubahan

Paket ini menindaklanjuti requirement A–G. Struktur tetap: HTML, CSS, dan JS
terpisah per file, tanpa bundler, dependensi lewat CDN.

## 0. Langkah wajib sebelum dipakai

Jalankan **`schema-migration.sql`** di SQL Editor Supabase — menambah
`eta_update`, `etd_update` (tanggal update delay), `notes_log` (kronologi),
serta tabel + fungsi **Permintaan Nomor Dokumen**.
Aman diulang.

---

## Revisi terbaru (putaran 19) - lambat saat halaman dibuka

Gejalanya muncul SETELAH pembaruan tampilan, jadi penyebabnya dicari di
antara yang saya tambahkan sendiri di putaran-putaran itu. Empat ditemukan:

**1. Animasi kerangka muat menggambar ulang tiap frame.** `skeleton-line`
menganimasikan `background-position` pada gradien 400% - itu memaksa
peramban MENGGAMBAR ULANG elemennya di setiap frame. Terjadi tepat saat
halaman dibuka, bersamaan dengan pengambilan data, pada belasan elemen
sekaligus. Diganti animasi `opacity`, yang dikerjakan GPU tanpa menggambar
ulang.

**2. `backdrop-filter: blur()` pada navbar yang sticky.** Blur pada elemen
yang ikut bergerak saat menggulir memaksa penyusunan ulang lapisan di tiap
frame. Latar di belakangnya sekarang navy pekat, jadi efek buramnya toh
tidak terlihat - ongkos dibayar tanpa hasil. Dibuang dari navbar dan
toggle Import/Export.

**3. `<mask>` gradasi di gambar hero.** Mask memaksa peramban menyiapkan
buffer terpisah lalu menggabungkannya, hanya untuk meredupkan gambar ke
arah kiri. Diganti satu lapisan `opacity` biasa.

**4. Terlalu banyak ketebalan font.** Manrope 4 + Inter 5 + Mono 3 = 12
berkas font, semuanya menahan tampilan pertama. Dipangkas ke ketebalan yang
benar-benar dipakai: **8 berkas**.

Ditambah `preconnect` ke server font & CDN, supaya jabat tangan TLS dimulai
bersamaan dengan pembacaan HTML - bukan setelah peramban menemukan
tautannya.

### Sejauh mana terukur
Pengukuran headless di lingkungan tanpa akses CDN: FCP 392 -> 376 ms. Angka
ini TIDAK mencerminkan perbaikan sebenarnya, karena bagian terbesarnya -
berkas font dan pustaka Excel ~1 MB - justru di sisi jaringan, yang tidak
bisa diukur di lingkungan tersebut. Yang bisa dipastikan: berkas xlsx tidak
lagi diminta saat halaman dibuka, dan berkas font berkurang dari 12 ke 8.

---

## Revisi terbaru (putaran 18) - perbaikan error & penyetelan kecepatan

### Error: submitDocNumRequest is not defined
Regresi yang SAYA sebabkan di putaran 17. Saat mengganti blok tombol reset,
potongan kode yang saya ambil terlalu panjang dan ikut membuang tiga fungsi
di bawahnya: `submitDocNumRequest`, `tampilkanHasilDocNum`, dan
`resetDocNumForm` - sehingga tombol Ajukan Nomor mati total. Ketiganya sudah
dipulihkan, dan seluruh berkas dipindai ulang untuk memastikan tidak ada
fungsi lain yang dipanggil tapi tidak terdefinisi.

### Kenapa terasa berat - dua penyebab yang ditemukan

**1. Kotak cari me-render ulang tiap ketukan huruf.** Setiap huruf memicu
`render()` penuh: menyaring, mengurutkan, mengelompokkan, lalu menyusun
ulang seluruh HTML kartu. Mengetik "dynamic" berarti tujuh kali kerja itu,
dan enam di antaranya hasilnya langsung dibuang. Sekarang render ditunda
180 ms sejak ketukan terakhir - cukup cepat untuk terasa seketika, tapi
hanya sekali kerja.

**2. Pustaka Excel ~1 MB diunduh di setiap kunjungan.** SheetJS dipakai
hanya saat impor/ekspor Excel, tapi dulu ikut diunduh setiap kali halaman
dibuka. Sekarang diunduh saat benar-benar dipanggil, sekali saja. Diverifikasi
lewat pemuatan headless: berkas xlsx tidak lagi diminta saat halaman dibuka.

PDF.js sudah lebih dulu dimuat dinamis, jadi tidak ada perubahan di sana.

---

## Revisi terbaru (putaran 17) - reset manual, bukan otomatis tahunan

### JALANKAN ULANG schema-migration.sql
Ada dua fungsi baru: `current_document_series` dan `reset_document_series`.

### Penomoran berjalan terus
Sebelumnya `period_key` diisi tahun dari tanggal dokumen, sehingga deret
otomatis mulai 001 setiap Januari. Nyaman, tapi memaksakan satu asumsi alur
bisnis. Sekarang deret **berjalan terus** sampai direset manual.

### Masalah yang muncul dari perubahan itu
Kalau reset sekadar menolkan counter, nomor 001 yang baru akan **menabrak**
001 yang lama - pasangan (jenis, seri, urutan) harus unik, jadi penerbitan
berikutnya langsung ditolak database. Menghapus riwayat lama juga bukan
jawaban: itu membuang jejak dokumen yang sudah terlanjur dipakai.

### Penyelesaiannya: seri
Reset tidak menolkan counter, melainkan **membuka seri baru** - `period_key`
naik dari `1` ke `2`, dan seterusnya. Hasilnya:

- catatan lama tetap utuh di serinya sendiri;
- deret baru mulai bersih dari 001;
- tidak ada satu pun nomor yang perlu dihapus.

Seri yang sedang berjalan tampil di kotak Atur Nomor Urut ("Seri 1 · nomor
terakhir terbit: 035"). Seri dibaca ulang tepat sebelum menerbitkan, jadi
kalau ada yang mereset dari perangkat lain, nomor tetap masuk ke seri yang
benar.

---

## Revisi terbaru (putaran 16) - hapus per baris, bukan per rentang

### JALANKAN ULANG schema-migration.sql
`reset_document_numbers` dibuang, diganti `delete_document_number(uuid)`.

### Yang sebelumnya berlebihan
Pembersihan massal per rentang tanggal dibuang seluruhnya. Alasannya
sederhana dan seharusnya saya sampaikan sejak awal: **penomoran sudah
mereset sendiri tiap pergantian tahun**, karena `period_key` memang berisi
tahun dari tanggal dokumen. Begitu masuk 2027, deret 2027 dimulai dari 001
tanpa perlu menekan apa pun. Jadi mekanisme hapus-serentak itu memecahkan
masalah yang tidak ada.

### Yang benar-benar dibutuhkan
Tombol hapus di **tiap baris riwayat**, dengan konfirmasi yang menyebut
nomornya. Tombolnya sengaja dibuat redup sampai barisnya disorot -
menghapus nomor resmi bukan tindakan yang boleh terlihat mengundang.

Penyetelan ulang counter tetap dikerjakan di database dalam transaksi yang
sama, dengan aturan yang menangani dua keadaan sekaligus:

- yang dihapus nomor **terakhir** -> counter mundur -> nomor itu dipakai
  lagi pada penerbitan berikutnya, tidak meninggalkan lompatan;
- yang dihapus nomor **di tengah** -> counter tetap di puncak -> nomor
  berikutnya tidak menabrak nomor yang masih ada.

Kotak "Atur Nomor Urut" (setel nomor berikutnya + Reset ke 001) tetap ada
untuk perpindahan dari penomoran manual.

---

## Revisi terbaru (putaran 15) - paginasi riwayat nomor

Riwayat "Nomor Terakhir Terbit" kini berhalaman: **5 baris** per halaman,
dengan pilihan 5 / 10 / 20 / 50 / 100. Sebelumnya 15 baris ditampilkan
sekaligus dan halaman memanjang ke bawah, sehingga kotak Atur Nomor Urut
di atasnya jadi jauh dari pandangan.

Dua hal yang dijaga:

- **Paginasi dilakukan di database**, bukan di browser: hanya satu halaman
  yang diambil (`.range()`), sedangkan jumlah keseluruhan diminta terpisah
  lewat `count: "exact"`. Jadi jumlah halaman tetap benar tanpa mengunduh
  seluruh riwayat - penting karena daftar ini bertambah tiap hari.
- **Halaman kosong ditangani**: kalau data terhapus dan halaman yang sedang
  dibuka jadi kosong, tampilan mundur otomatis ke halaman terakhir yang
  masih ada isinya.

Nomor halaman kembali ke 1 setiap ganti jenis dokumen, ganti sub-jenis
(Commercial/Non-Commercial), atau ganti jumlah baris per halaman.

Komponennya memakai kelas yang SAMA dengan paginasi daftar jadwal
(`.pagination-bar`, `.page-btn`, `.page-nav`) agar terasa satu komponen -
hanya variannya dibuat ringkas karena berada di dalam kartu.

---

## Revisi terbaru (putaran 14) - angka berpemisah ribuan saat diketik

Ketik `5000` -> kotak langsung menampilkan `5,000`. Format mengikuti standar
yang sudah dipakai seluruh aplikasi: **ribuan koma, desimal titik**, jadi
hasil salin-tempel ke Excel langsung terbaca sebagai angka.

Berlaku di kolom QTY / Harga / Netto / Bruto pada tabel barang, Freight,
Asuransi, NDPBM, Tarif, BM, PPN, PPh, Total Package, dan isian Nilai/Nominal
di Permintaan No. Dokumen.

### Bug berbahaya yang ditemukan saat mengerjakannya
Pembaca angka lama, `String(v).replace(",", ".")`, salah untuk dua bentuk
yang justru paling sering muncul begitu format ribuan dinyalakan:

| Isi kotak | Hasil lama | Seharusnya |
|---|---|---|
| `5,000` | **5** | 5000 |
| `1,234.56` | NaN -> 0 | 1234.56 |

Kesalahan pertama itu yang paling berbahaya karena **tidak terlihat**:
angkanya tetap masuk, hanya nilainya seribu kali lebih kecil. Diganti
`parseLooseNumber()` yang menentukan pemisah desimal dari posisinya (yang
paling belakang) dan mengenali pola ribuan, sehingga `5,000`, `1,234.56`,
`1.234,56`, dan `5,25` semuanya terbaca benar. `excelNum()` kini meneruskan
ke fungsi ini, jadi impor Excel ikut terbantu.

### Dua hal yang membuat ini tidak sesepele kelihatannya
**Posisi kursor.** Menulis ulang isi kotak tiap ketikan membuat kursor
melompat ke ujung - mengetik di tengah angka jadi mustahil. Posisi kursor
dihitung ulang dari JUMLAH DIGIT di sebelah kirinya, bukan jumlah karakter,
sehingga koma yang muncul/hilang tidak menggesernya.

**Ketikan setengah jadi.** Saat mengetik `1500.`, sesaat isinya berakhir
dengan titik tanpa angka. Titik itu dipertahankan - kalau dibuang, desimal
tidak akan pernah bisa diketik. Dirapikan saat kotak ditinggalkan.

---

## Revisi terbaru (putaran 13) - reset berbasis tanggal pengajuan

### JALANKAN ULANG schema-migration.sql
`reset_document_year` diganti `reset_document_numbers(from, to, types)`.

### Dasar penghapusan pindah ke Tanggal Pengajuan
Sebelumnya penghapusan memakai `period_key` - nilai TURUNAN internal.
Sekarang memakai `doc_date`, yaitu Tanggal Permintaan yang diisi pemohon,
tercatat di tiap nomor, dan terlihat di riwayat. Tindakannya jadi bisa
dijelaskan apa adanya: *"hapus semua nomor yang diajukan antara tanggal A
dan B"* - bukan *"semua yang kebetulan masuk kunci periode X"*.

### Satu mekanisme, dua kebutuhan
Karena rentangnya bebas, fungsi yang sama melayani reset tahunan (1 Jan -
31 Des, ada tombol isi cepat) maupun pembersihan sebagian, misalnya
membuang data uji coba minggu lalu tanpa mengganggu nomor produksi.

### Counter tidak dinolkan membabi buta
Setelah penghapusan, tiap deret yang tersentuh disetel ulang ke nomor urut
**tertinggi yang masih tersisa**, bukan langsung 0:

- seluruh isi satu tahun dihapus -> tidak ada sisa -> counter 0 ->
  penomoran mulai lagi dari 001;
- hanya sebagian dihapus -> counter mengikuti sisanya, sehingga nomor
  berikutnya tidak mungkin menabrak yang masih ada.

Menolkan counter secara membabi buta akan menghasilkan tabrakan pada kasus
kedua. Penghapusan dan penyelarasan counter berjalan dalam SATU transaksi.

### Jumlah ditampilkan sebelum konfirmasi
Sistem menghitung dulu berapa nomor yang akan terhapus, menampilkan
angkanya berikut rentang tanggalnya, baru meminta persetujuan - pengguna
tahu dampaknya SEBELUM menekan setuju, bukan sesudah.

---

## Revisi terbaru (putaran 12) - reset tahunan

### JALANKAN ULANG schema-migration.sql
Ada perubahan CONSTRAINT dan fungsi baru `reset_document_year`.

### Format Surat Jalan
`{SEQ}/DDI/EXIM-LOG/{MM}/{YYYY}` -> `001/DDI/EXIM-LOG/VII/2026`.
Kini kelima format sudah terisi resmi, tidak ada lagi yang ditebak.

### Masalah yang ditemukan saat menyiapkan reset tahunan
Format Commercial Invoice - `DDI-CRBM-VII-035` - **tidak memuat tahun**.
Dengan `doc_number` unik secara global, nomor 035 di Juli 2027 akan
identik dengan 035 di Juli 2026 dan langsung ditolak database, padahal
keduanya dokumen berbeda di deret tahun berbeda. Keunikan diubah jadi
**per periode**: `UNIQUE (doc_type, period_key, doc_number)`. Migrasi juga
melepas constraint lama pada database yang terlanjur memakai versi
sebelumnya.

### Reset tahunan yang benar-benar bersih
Menyetel counter ke 0 saja tidak cukup: selama catatan nomor lama masih
ada, pasangan (jenis, periode, urutan) yang harus unik membuat penerbitan
berikutnya langsung ditolak. Jadi `reset_document_year()` menghapus
riwayat nomor tahun tersebut DAN menghapus baris counter-nya, dalam SATU
transaksi supaya tidak mungkin berhenti setengah jalan.

Berlaku untuk seluruh jenis dokumen sekaligus, dan mencakup kunci periode
tahunan (`2026`) maupun bulanan (`2026-07`).

**Pengamannya**: tahun harus diketik sendiri - tidak dipilih dari daftar,
tidak diisi otomatis - lalu masih ada konfirmasi. Tombolnya mustahil
tertekan tanpa sengaja, dan tahun yang salah ketik tidak cocok dengan data
mana pun sehingga tidak ada yang terhapus.

---

## Revisi terbaru (putaran 11) - format & pengaturan nomor

### JALANKAN ULANG schema-migration.sql
Fungsi `next_document_number` diganti tanda tangannya (dari awalan jadi
POLA), dan ada fungsi baru `set_document_counter`.

### Nomor urut tidak lagi selalu di ujung
Format yang diminta menaruh nomor urut di posisi berbeda-beda:

| Jenis | Format | Contoh |
|---|---|---|
| Invoice Commercial | `DDI-CRBM-{MM}-{SEQ}` | `DDI-CRBM-VII-035` |
| Invoice Non-Commercial | `DDI-{SEQ}/{YYYY}-{MM}-EXIM-LOG` | `DDI-026/2026-VII-EXIM-LOG` |
| Letter | `DDI-{SEQ}/EXIM-LOG/{MM}/{YYYY}` | `DDI-001/EXIM-LOG/VII/2026` |
| Fund Request | `{SEQ}/EXIM/DDI/{MM}/{YYYY}` | `007/EXIM/DDI/VII/2026` |
| Delivery Order | `DDI-{SEQ}/DO/EXIM-LOG/{MM}/{YYYY}` | `DDI-128/DO/EXIM-LOG/XII/2026` |

Karena itu pembentuk nomor kini berbasis POLA dengan penanda `{SEQ}`,
`{MM}` (bulan romawi), `{YYYY}` - bukan lagi awalan yang ditempeli angka.
Mengubah format cukup satu baris di `DOCNUM_TYPES` / `DOCNUM_SUBTYPES`.
Nomor urut kini **3 digit**.

### Atur & reset nomor urut
Kotak baru di halaman Permintaan No. Dokumen. Yang diisi adalah **nomor
berikutnya** (bukan angka terakhir) karena itu yang ada di kepala pengguna:
"invoice terakhir 035, berarti berikutnya 036". Ada juga tombol Reset ke
001 dengan konfirmasi.

Penyetelan mundur DICEGAH kalau nomornya sudah pernah terbit di periode
yang sama - kolomnya unik, jadi kalau dibiarkan, penerbitan berikutnya
pasti gagal di tengah jalan. Lebih baik ditolak sekarang dengan pesan yang
menyebutkan angka aman terdekat.

Berlaku per jenis dokumen DAN per periode; Commercial & Non-Commercial
punya deret masing-masing.

---

## Revisi terbaru (putaran 10)

### PENTING - jalankan ulang schema-migration.sql
Fitur Permintaan Nomor Dokumen gagal dengan pesan *"new row violates
row-level security policy"*. Penyebabnya: Supabase menyalakan Row Level
Security pada tabel baru, dan tanpa policy apa pun semua operasi ditolak
walau kunci API sudah benar. Migrasi kini menambahkan policy untuk
`document_numbers` & `document_number_counters`, dan fungsi penomoran
dijadikan `SECURITY DEFINER` supaya nomor tetap bisa naik walau nanti
policy tabel counter diperketat.

### Aksen teal diganti navy
Ramp aksen diganti jadi keluarga navy lewat token, jadi satu tempat. Yang
perlu perlakuan khusus: elemen teal yang berada DI ATAS latar navy (ikon
judul header form, aksen gambar hero) - kalau ikut jadi navy tua, elemen
itu lenyap. Semuanya dipindah ke ujung TERANG ramp (`--p-300/400`) atau
putih transparan. Bilah di belakang navbar juga jadi navy, menyambung
dengan hero; pil putihnya justru makin tegas.

Status ikut dirapikan: **PROCESS amber, DELAY merah, ARRIVED navy**.
Sebelumnya PROCESS dan DELAY sama-sama amber sehingga praktis tak
terbedakan sekilas.

### Filter rentang tanggal
Pemilih urutan kini punya empat pilihan (ETA/ETD x terdekat/terjauh), dan
rentang tanggal di sebelahnya **menyaring dasar yang sama** dengan yang
sedang diurutkan - labelnya ikut berubah ETA/ETD supaya tidak ada
tebak-tebakan. Pengelompokan tanggal ikut dasar aktif juga.

### Format Report jadi satu baris
`1. Shipment From X | Incoterm: FCA | Mode: LCL | Perkiraan Tiba di Pabrik:
27 Juli 2026`, lalu satu butir berisi nama barang pertama + `+ N Items`.
Sebelumnya tiap pengiriman memakan 3 baris dan seluruh nama barang
didaftar, sehingga satu kiriman bisa 9 baris dan isi pentingnya tenggelam.

### Invoice: Commercial & Non-Commercial
Ditambah pilihan Jenis Invoice. Keduanya **deret nomor terpisah** (INV dan
NCI) karena secara kepabeanan dua dokumen berbeda. Kalau ternyata ingin
satu deret bersama, cukup samakan `key` di `DOCNUM_SUBTYPES`.

### Kotak tanggal bisa diklik di mana saja
Bawaan browser hanya membuka kalender kalau ikon kecil di ujung kanan yang
ditekan - target sempit, apalagi di layar sentuh. Kini seluruh kotak
membuka pemilih tanggal lewat `showPicker()`, dengan fallback aman untuk
browser lama.

### Redaksi dipadatkan
Enam blok teks terpanjang dipangkas - catatan kolom Kemasan, kronologi,
delay, status, dan dua subjudul hero. Ruang bawah hero ringkas juga
ditambah karena baris terakhirnya sempat terpotong lengkungan.

---

## Revisi terbaru (putaran 9) - sistem desain

Dikerjakan sebagai **lapisan token**, bukan tambal per-aturan: 74 token
(warna, jarak, radius, bayangan, tipografi, gerak) di `:root`, lalu satu
bagian "Lapisan Sistem Desain" di akhir `style.css` yang menyeragamkan
keluarga komponen. Nama variabel lama dipertahankan sebagai **alias** ke
token baru, sehingga 2.900 baris CSS yang sudah ada tetap berfungsi dan
ganti tema cukup dilakukan di satu tempat.

- **Palet**: netral dingin (slate) + SATU aksen (teal `#0d9488`). Amber,
  merah, hijau kini hanya untuk status - bukan hiasan.
- **Tipografi**: Manrope (judul) + Inter (antarmuka) + JetBrains Mono
  (no. aju, B/L, HS Code, kontainer). Monospace di sini fungsional: digit
  yang sejajar jauh lebih mudah dicocokkan dengan dokumen bea cukai.
  `tabular-nums` dinyalakan pada semua angka.
- **Komponen**: radius 10-16px, bayangan halus berlapis, hover/active/
  disabled yang jelas pada semua tombol, fokus `:focus-visible` konsisten,
  isian dengan cincin fokus teal dan validasi tanpa menggeser tata letak.
- **Tabel**: zebra rows, hover, sticky header (dimatikan di layar sempit).
- **Keadaan layar**: skeleton loading yang meniru bentuk kartu (tata letak
  tidak melompat saat data datang), empty state sebagai ajakan bertindak,
  dan error state yang menyebut apa yang gagal + tombol coba lagi.
- **Aksesibilitas**: `prefers-reduced-motion` dihormati, `aria-live` pada
  area yang sedang memuat, kontras teks dinaikkan.
- **Penanda status**: garis tipis di tepi kiri kartu jadwal - status
  terbaca dari ujung mata sebelum teksnya dibaca.

### Dua hal yang sengaja TIDAK diubah, beserta alasannya

**Framer Motion tidak dipakai.** Framer Motion adalah pustaka React;
aplikasi ini vanilla JS tanpa bundler. Animasi memakai CSS transition
150-300ms sesuai brief.

**Ikon tetap Bootstrap Icons.** Tujuan brief - ikon yang konsisten - sudah
terpenuhi: seluruh aplikasi memakai satu set. Menukarnya ke Lucide berarti
menulis ulang ratusan referensi ikon di 35 berkas JS, dengan risiko ikon
hilang, tanpa perubahan yang terlihat bagi pengguna.

---

## Revisi terbaru (putaran 8) - tampilan

### Akar masalah navigasi: dua aturan CSS bertabrakan
Navbar memakai kelas `.page-nav`, yang **persis sama** dengan kelas tombol
PAGINASI daftar (`min-width:32px; height:32px; border; background:#fff`).
Dua aturan itu saling menimpa, itulah kenapa navigasinya tampil kacau.
Kelas navbar diganti jadi `.site-nav` / `.site-nav-link` sehingga tidak bisa
bertabrakan lagi.

### Navbar mengambang
Balok navy selebar layar diganti "pil" putih membulat dengan bayangan
lembut dan `backdrop-filter`, sticky di atas. Logo navy + ikon teal di kiri,
menu di kanan.

### Warna aktif diperbaiki
Halaman aktif di navbar ditandai **garis teal di bawah label**, bukan pil
putih: di dalam pil putih yang sudah terang, pil kedua membuat dua permukaan
putih bertumpuk dan batasnya nyaris tak terbaca. Toggle Import/Export tetap
memakai tab putih pekat karena kini berada di atas hero gelap.

### Toggle Import/Export pindah ke kanan atas
Sebelumnya melayang di bawah hero: wadahnya putih di atas latar terang,
sehingga terlihat seperti kotak nyasar. Sekarang menempel di kanan atas hero.

### Hero bergambar
Ditambah pemandangan pelabuhan peti kemas: tumpukan kontainer, derek, garis
rute pelayaran putus-putus, dan titik pelabuhan. Digambar sebagai **SVG di
dalam halaman**, bukan file gambar dari internet - tidak menambah unduhan,
tidak pecah saat di-zoom, dan tetap tampil walau jaringan mati. Diredupkan
ke kiri lewat mask gradasi supaya teks tetap terbaca.

### Header halaman form
Judul kini **tepat di tengah** (grid `1fr auto 1fr` dengan kolom penyeimbang
kanan), tombol kembali tetap di kiri, dan latarnya memakai gradasi tema
navy-ocean. Ikon judul jadi teal dan tombol kembali jadi transparan-berkabut
karena keduanya akan lenyap kalau tetap navy di atas latar navy.

---

## Revisi terbaru (putaran 7) - Improvement Request

### 1. Smart extraction (High Priority)
Diuji terhadap 3 file baru; semua kegagalan yang ditemukan sudah diperbaiki.

| Masalah nyata | Akar penyebab | Perbaikan |
|---|---|---|
| qty/satuan/netto PIB 009447 kosong | Kolom field 35 dibaca dengan urutan baris KAKU (wajib persis 5 baris). Dokumen ini memakai satuan 2 baris ("NUMBER OF" + "PACKAGE (PK)") dan token berawalan "-", jadi jumlah baris tidak 5 dan SELURUH hasil dibatalkan | Token dipilah per PERAN (angka vs teks), bukan per posisi. Potongan satuan yang belum berakhir kode dalam kurung disambung otomatis |
| Nama barang terpotong di tengah kalimat | Pada teks polos, baris antar kolom saling MENYISIP - baris sesudah "Uraian : VERTICAL TURNING CENTER FOR FLOW" ternyata "NUMBER OF METODE 1" milik kolom lain | Kolom Uraian (field 32) diambil lewat KOORDINAT lalu digabung, sehingga sambungan barisnya urut & bersih |
| Total Package "2 PACKAGE, Tanpa Merk" | Merek kemasan ikut terbawa | Sufiks ", Tanpa Merk" dibuang |
| CIPL Sheng Guang: 0 barang | Header kolom "Quantity" (bukan "Qty."), dan ada DUA kolom di kiri nama ("Shipping Marks" + "Item") | Kedua ejaan header diterima; batas buang memakai header kiri paling KANAN |
| Nama shipper salah (jadi PT DDI) | Penjual ditulis "Consigner:", bukan "Seller" | Consigner/Consignor/Shipper/Exporter diterima; pola dikunci sampai batas kata agar tidak tertukar dengan "Consignee" |
| Satuan barang kosong | Satuan ada di SUB-LABEL header ("Quantity" lalu "SET"), bukan di tiap baris | Satuan bawaan diambil dari sub-label header |
| Nama grup hilang di Packing List | Baris "Bead Ring" adalah JUDUL GRUP untuk 2 baris di bawahnya, bukan lanjutan | Baris tanpa angka dibedakan: menempel di bawah barang = lanjutan; belum ada barang = judul grup yang jadi awalan |
| Berat hilang saat CI & PL diupload sebagai 2 file | Nilai yang tidak ada dipaksa jadi 0, sehingga 0 dari sisi CI dianggap "sudah terisi" | Nilai kosong dibiarkan null sampai tahap akhir; total bruto diambil dari sisi yang punya angka |

Hasil akhir: kontainer FCL `HDMU2770419, TRIU0628134` + `FCL` terbaca; CI+PL 2 file
tergabung utuh (qty & harga dari CI, netto dari PL, bruto total di barang pertama).

### 2. Animasi keberangkatan
Strip "Berangkat hari ini" dengan ikon kapal/pesawat bergerak, muncul HANYA saat
`ETD == hari ini` - tidak sebelum, tidak sesudah. Ikon mengikuti moda. Animasi
berhenti otomatis bila sistem pengguna meminta `prefers-reduced-motion`.

### 3. Copy Report: hanya barang pertama
`reportItemNames()` kini mengembalikan satu nama saja. Rincian lengkap tetap ada
di template All Import / All Export.

### 4. Ctrl+F
Di halaman daftar, Ctrl/Cmd+F mencegah pencarian bawaan browser lalu fokus +
menyeleksi isi kotak pencarian aplikasi. Di halaman form dibiarkan normal agar
pencarian teks di form panjang tetap bisa.

### 5. Nama item tanpa scroll (Option A + B)
`max-height: 220px` dan `overflow-y: auto` DIHAPUS (itu penyebab terpotong &
munculnya gagang scroll). Sekarang `resize: none` + `overflow: hidden`, tinggi
mengikuti jumlah baris, kolomnya dilebarkan ke 26%.

### 6. Shipment Tracking - lihat analisa di jawaban chat
Belum diimplementasikan; butuh keputusan penyedia + API key.

### 8. Halaman baru: Permintaan Nomor Dokumen
Navbar kini navigasi ANTAR HALAMAN (Jadwal EXIM / Permintaan No. Dokumen);
toggle Import/Export dipindah ke halaman Jadwal sebagai segmented control.
Halaman baru di `#/docnum` dengan 4 tab (Invoice / Delivery Order / Fund Request
/ Letter Number), form dummy disabled, dan catatan bahwa logika belum aktif.
Tab dibuat data-driven (`data-docnum-tab` / `data-docnum-panel`) - menambah jenis
dokumen cukup 1 tombol + 1 panel di HTML, tanpa menyentuh JS.
Routing dirapikan: `showPage()` jadi satu-satunya tempat yang mengatur halaman
mana yang tampil, jadi tidak mungkin dua halaman tampil sekaligus.

### 9. UI Tambah Jadwal
- Judul di TENGAH memakai grid 3 kolom (bukan flex+space-between; dengan flex
  judul akan bergeser ke kanan sebesar lebar tombol Back).
- Tombol Back tetap di kiri, kini berlatar navy sesuai tema.
- Stepper SATU warna navy untuk ketiga step (dulu ungu & amber ikut dipakai).

---

## Revisi terbaru (putaran 7)

### Halaman Permintaan Nomor Dokumen - logika bisnis lengkap

Kerangka sebelumnya (tab + tata letak + form nonaktif) kini berfungsi penuh.

**Format nomor**: `DDI/<KODE>/<BULAN ROMAWI>/<TAHUN>/<URUT 4 DIGIT>` -
contoh `DDI/INV/VII/2026/0007`. Kode per jenis: INV, DO, FR, SK. Bulan &
tahun diambil dari **tanggal dokumen yang diisi user**, bukan tanggal hari
ini, supaya dokumen yang dibuat mundur tetap memakai periode yang benar.

**Aman dari nomor kembar.** Ini bagian paling rawan: kalau nomor dihitung
dengan `SELECT MAX(seq)` lalu `INSERT seq+1`, dua orang yang menekan tombol
hampir bersamaan bisa menerima nomor yang sama. Karena itu penambahan
dilakukan di dalam SATU pernyataan `INSERT ... ON CONFLICT DO UPDATE`
(fungsi `next_document_number` di database) yang dijamin atomik oleh
PostgreSQL - padanan dari pola `INSERT ... ON DUPLICATE KEY UPDATE`. Nomor
urut TIDAK pernah dihitung di sisi browser. Sebagai jaring pengaman
terakhir, tabel `document_numbers` punya UNIQUE di `(doc_type, period_key,
seq)` dan di `doc_number`.

**Validasi**: isian wajib ditandai `*` dan dicek sebelum kirim (kotak yang
salah diberi garis merah di tempatnya), isian angka divalidasi lewat
`excelNum()` sehingga format Indonesia maupun Inggris sama-sama diterima,
dan tanggal lebih dari 90 hari ke depan ditolak - salah ketik tahun akan
membuat periode penomoran melompat dan sulit dirapikan lagi.

**Tetap data-driven**: `docnum-view.js` tidak memuat daftar isian sama
sekali, ia membaca atribut `data-dn` / `data-dn-required` / `data-dn-number`
dari HTML. Menambah isian = tambah satu `<input>`; menambah jenis dokumen =
tambah tab + panel di HTML lalu satu baris di `DOCNUM_TYPES`. Field khas
tiap jenis disimpan di kolom `payload` (jsonb), jadi jenis baru tidak butuh
kolom baru.

**Reset periode bisa diubah**: `reset: "year"` (bawaan) atau `"month"` per
jenis dokumen - kunci periodenya otomatis `2026` atau `2026-07`.

Ditambah: pratinjau nomor berikutnya (dihitung ulang saat tanggal diubah),
banner hasil + tombol Salin, dan riwayat 15 nomor terakhir per jenis.

**Hak akses**: tabel sengaja dibiarkan tanpa Row Level Security karena
aplikasi belum memakai Supabase Auth (masih anon key bersama, tanpa login
per pengguna). Kolom `created_by` sudah disiapkan dan perintah RLS sudah
ditulis dalam keadaan dikomentari di `schema-migration.sql` - begitu login
diaktifkan, tinggal dinyalakan tanpa mengubah struktur tabel maupun kode.

### Kontainer FCL terverifikasi
Diuji dengan PEB FCL nyata (`notul_003791.pdf`): `KMTU7504681 / 20 FEET /
FCL` terbaca jadi Kontainer `KMTU7504681` dan Jenis Muatan `FCL`. Seluruh
17 field header + 6 barang cocok dengan dokumen.

### Urutan kartu ikut Tanggal Update Delay
Ditambahkan `effectiveEta()` / `effectiveEtd()` di `js/core/status.js`:
kalau ada Tanggal Update Delay, itulah yang dipakai untuk pengelompokan &
pengurutan kartu, penanda "berangkat hari ini", serta baris *Estimasi
Stuffing* dan urutan section Export di template Report. Rencana semula tetap
disimpan & ditampilkan sebagai pembanding, bukan sebagai acuan urutan.

---

## Revisi terbaru (putaran 6) - PERBAIKAN ARAH HITUNG DELAY

Blok delay sebelumnya diberi judul "Jadwal Awal (sebelum delay)" dan
menghitung `jadwal sekarang - jadwal awal`. Yang sebenarnya diisi di situ
adalah tanggal **baru** hasil pemunduran, sehingga selisihnya selalu keluar
bertanda minus ("-5 HARI") padahal maksudnya mundur 5 hari - berlawanan
arti dan membingungkan.

Sekarang:

| | Sebelum | Sesudah |
|---|---|---|
| Judul blok | Jadwal Awal (sebelum delay) | **Tanggal Update Delay** |
| Label field | ETA Awal / ETD Awal | **Update ETA / Update ETD** |
| Isi field | tanggal lama | **tanggal baru hasil pemunduran** |
| Badge | `-5 HARI` | **`+5 hari dari ETA`** |
| Rumus | jadwal sekarang - jadwal awal | **tanggal update - jadwal asli** |

ETD & ETA di date-strip SENGAJA tidak ditimpa - itulah rencana semula yang
jadi pembanding. Ringkasan di form kini juga menyebut rentangnya:
*"Mundur 5 hari dari ETA (27 Jul 2026 -> 01 Agu 2026)."*
Badge di kartu: *"Mundur 5 hari dari ETA"*.

Kolom database ikut diganti nama agar tidak menyesatkan:
`eta_awal`/`etd_awal` -> **`eta_update`/`etd_update`**. Migrasi memindahkan
isi kolom lama secara otomatis kalau versi sebelumnya sempat dijalankan
(blok `DO $$` yang mengecek `information_schema` dulu), dan perintah DROP
kolom lama disediakan dalam keadaan dikomentari.

---

## Revisi terbaru (putaran 5)

### Report diurutkan dari tanggal terdekat
Tiap section diurutkan dari yang paling dekat ke paling jauh, memakai
tanggal yang ditampilkan di baris ke-3 — Import pakai *Perkiraan tiba di
pabrik*, Export pakai *Estimasi Stuffing*. Jadwal yang tanggalnya belum
diisi ditaruh paling bawah (string kosong secara teknis "lebih kecil" dari
tanggal mana pun, jadi kalau dibiarkan default justru nangkring di puncak
dan terlihat paling mendesak). Perbandingan memakai string ISO langsung,
tanpa parsing `Date`.

### Kartu ARRIVED/DELIVERED kini memuat nama barang & kronologi
Kartu berstatus selesai tetap ringkas satu baris di bagian atas, tapi di
bawahnya ditambahkan blok `collapsed-extra` berisi **nama barang**
(4 teratas + "+N lainnya") dan **panel Kronologi & Catatan** lengkap dengan
kotak tambah cepat — sehingga riwayat pengiriman lama tetap bisa ditelusuri
dan masih bisa dicatat tanpa membuka form. Gayanya sengaja lebih redup agar
tetap terbaca sekunder dibanding kartu yang masih berjalan.

---

## Revisi terbaru (putaran 4)

### All Export jadi 18 kolom (opsi B)
Kolom **PENGIRIMAN DARI PABRIK** disisipkan sebagai kolom ke-2 (isi: tanggal
In Factory), supaya hasil copy yang ditempel MULAI DARI kolom NO langsung
lurus dengan sheet tujuan. Urutan final:

`NO | PENGIRIMAN DARI PABRIK | PEB | PEB DATE | AJU | CONSIGNEE | HS CODE |
DESCRIPTION | QTY | AMOUNT | INCOTERMS | FREIGHT | INSURANCE | BL/AWB |
NO. INVOICE | VESSEL NAME | PACKAGE | REMARK`

Header & indeks Bulk Export ikut disesuaikan.

### Report: format email
Report tidak lagi satu baris panjang dipisah tanda pisah. Tiap pengiriman
kini 3 baris berlabel + daftar barang:

```
IMPORT

1. Shipment From DYNAMIC DESIGN CO., LTD.
   Incoterm: CIP  |  Mode: LCL
   Perkiraan tiba di pabrik: 23 Juli 2026
     - SPINDLE - Serial Number: 1B1214220V
```

Sisi Export memakai `Packages:` dan `Estimasi Stuffing:`.

Saat disalin, clipboard diisi **dua format sekaligus**: `text/html`
(berformat, judul tebal, penomoran & sub-daftar) dan `text/plain`
(ber-indentasi). Outlook/Gmail otomatis mengambil versi HTML sehingga hasil
paste langsung rapi tanpa dirapikan manual; Notepad/chat mengambil versi
teks. Browser lama yang tidak mendukung `ClipboardItem` otomatis mundur ke
salin teks biasa - isinya tetap lengkap, hanya tanpa format.

Daftar barang menampilkan **semua** nama barang; nama kembar digabung jadi
satu baris. Jadwal berstatus ARRIVED/DELIVERED tetap tidak ikut.

**Urutan**: tiap section diurutkan dari tanggal **terdekat ke terjauh**,
memakai tanggal yang ditampilkan di baris ke-3 — Import pakai *Perkiraan tiba
di pabrik*, Export pakai *Estimasi Stuffing*. Jadwal yang tanggalnya belum
diisi ditaruh paling bawah, bukan di atas: belum ada kepastian, jadi tidak
pantas terlihat paling mendesak.

---

## Revisi terbaru (putaran 3)

### Label Voyager konsisten di semua layar
Aturan requirement B (laut = "Voyager", udara = "Vessel") dulu hanya
diterapkan di form; kartu dashboard dan modal Detail masih menulis "Vessel"
untuk pengiriman laut. Sekarang label diambil dari satu sumber di
`js/config.js` (`vesselNoun()`, `voyageNoun()`, `portNoun()`) yang dipakai
bersama oleh form, kartu, dan modal Detail. Label pelabuhan menjadi
"Terminal" saat moda udara juga ikut terpusat di situ.

### Kolom VESSEL akhirnya benar-benar di-concat
Penyebab sebenarnya: `buildExcelCopyRows()` (All Import) dan
`buildExportCopyRows()` mengisi kolom VESSEL dengan **No. Voyage saja** —
aturan lama yang tertinggal. Sekarang keduanya memakai
`vesselNameForTemplate()`, sama seperti Daily Import/Export dan All Export.
Hasil: laut -> `TIANJIN VOYAGER 2606S`, udara -> `2606S` saja.

### All Export: kolom PACKAGE per barang
Dulu kolom PACKAGE hanya diisi di baris pertama dari Total Package tingkat
pengiriman. Di Jadwal Export, Kemasan dicatat **per barang** berupa dimensi
PxLxT, jadi kolom ini sekarang mengambil `item.package` di tiap baris —
mis. `82*82*75`, `77*77*39`.

---

## Revisi terbaru (putaran 2)

### Bruto = TOTAL, ditaruh di 1 barang
Dulu total berat kotor dibagi **proporsional** menurut porsi netto, hasilnya
angka pecahan yang tampak presisi padahal cuma hasil bagi (430.0755 /
716.7925 / …) dan gampang dikira timbangan asli per barang. Sekarang total
dokumen dipasang apa adanya di **barang pertama**, sisanya 0 — berlaku untuk
PIB (field 29), PEB (field 45), Packing List (baris TOTAL), dan CIPL Excel.
Terverifikasi: PIB 114 kg · PEB 2.440 kg · CIPL 6,5 kg · NOKIAN 3.248 kg.

### Tanggal delay tampil di kartu
Saat status **DELAY**, kartu memunculkan strip "Jadwal Awal" tepat di bawah
baris ETD/ETA yang berlaku sekarang: **ETD Awal** dan **ETA Awal**, masing-masing
dengan selisih hari (`+7 hari`). Keduanya bisa diedit langsung dari kartu, jadi
riwayat jadwal lama tersimpan dan tidak hilang saat tanggalnya digeser. Dua-duanya
ditampilkan karena delay bisa bersumber dari mundurnya keberangkatan maupun
kedatangan.

### Kronologi & Catatan (riwayat seperti chat)
Field "Catatan" satu baris diganti **daftar entri ber-tanggal & jam**.

- **Di form** — panel penuh: kotak tulis (Ctrl+Enter kirim) + timeline
  (terbaru di atas) + hapus per entri. Menggantikan field Catatan lama, jadi
  form tidak bertambah panjang.
- **Di kartu dashboard** — 3 entri terakhir + kotak tulis cepat (Enter kirim),
  supaya kejadian harian bisa dicatat tanpa membuka form edit.
- **Di modal Detail** — seluruh riwayat, read-only.

Kolom `notes` lama **tetap diisi** dengan teks entri terbaru, sehingga kolom
REMARK/NOTES di semua template copy & Bulk Export tidak perlu diubah. Catatan
lama otomatis muncul sebagai entri pertama (ditandai "catatan lama (tanpa
waktu)"), tidak ada data yang hilang.

### Nama barang & kolom Kemasan tidak kepotong
- Textarea Nama Barang: batas tinggi & scroll **dihapus**, tinggi mengikuti
  jumlah baris isinya; kolomnya dilebarkan 22% → 26%.
- Kolom Kemasan & kotak Total Package: lebar dihitung JS dalam satuan `ch`
  mengikuti panjang teks (`autoSizeInput()`), ikut menyesuaikan saat diketik,
  saat dihitung otomatis, dan saat diisi dari file.

---

## A. Auto-fill dari file yang diupload

### Parser baru: PDF PEB BC 3.0 — `js/import/pdf-peb.js`
Mengisi: No PEB, Tanggal PEB, No Aju, Nama Buyer/Consignee (field 15 PEMBELI),
No Invoice, Master/House BL, Nama Forwarder (**nama PPJK saja**, field 9),
Moda, Nama Vessel, No Voyage, Kontainer + FCL/LCL (field 43), Nama Barang,
HS Code, Fasilitas SKB, Bruto total, dan seluruh field Kepabeanan & Biaya
(incoterm field 35, freight 39, asuransi 40, NDPBM 55).

### Bug yang diperbaiki

| Bug | Sebelum | Sesudah |
|---|---|---|
| **Nama Shipper salah (PIB)** | Diambil dari field 3 (IMPORTIR) — selalu terisi "PT DYNAMIC DESIGN INDONESIA", yaitu perusahaan sendiri | Diambil dari field 1 (PENGIRIM); nomor pendaftaran yang menempel dari kolom sebelah ikut dibersihkan |
| **Nama Shipper salah (CIPL)** | Selalu Consignee | Import → Seller, Export → Consignee (`pickCiplParty()`) |
| **Nama barang CIPL Excel** | Kolom "Item" ikut digabung → "Items of PO DDI20260708 MASTER MODEL…" | Hanya dari kolom **Goods Descriptions** |
| **Qty/satuan/netto PIB selalu 0** | Batas atas jendela koordinat dihitung dari item paling kiri; kolom qty berbeda Y ±2,4pt sehingga angka barang pertama terbuang → jumlah token meleset → **seluruh** hasil dibatalkan | Jendela per-barang + batas kolom dinamis dari header field 35. Terverifikasi: total netto cocok persis dengan field 30 di 3 dokumen uji |
| **CIPL PDF CI+PL satu file** | Hanya 400 karakter pertama dicek → halaman PL diabaikan, berat tak pernah terisi | Deteksi **per halaman**, CI & PL digabung otomatis |
| **Nama barang CIPL PDF bocor** | Kolom "Shipping Mark"/"Items of PO" dan blok rekening bank ikut masuk nama | Isolasi kolom berbasis koordinat + batas jarak baris lanjutan |

### Aturan tambahan
- **Anti-timpa**: prioritas sumber — PIB/PEB (30) > draft CEISA (20) > CIPL (10).
  Field kosong selalu diisi; field terisi hanya ditimpa sumber berprioritas
  sama/lebih tinggi. Field yang diketik user sendiri tidak pernah ditimpa.
- **CIPL tidak mengisi** ETD, ETA, Tanggal/No SPPB, No Aju, Master/House BL.
- **HS Code** disimpan angka saja — otomatis membuang `.` dan `-`, baik dari
  ekstraksi maupun saat user paste manual ke kolom HS Code.
- **ETD/ETA/Actual (PIB)**: ETD = tanggal Master BL/AWB (cadangan: House BL);
  ETA = laut ETD+7 hari, udara sama dengan ETD; Actual = ETA+3 hari.
  Kalau field 11 PIB berbeda, muncul catatan agar bisa dicek.
- **Kontainer** diambil dari field 27 (PIB) / 43 (PEB) dengan isolasi kolom.
- **Import 2 file terpisah** (CI + PL, PDF atau Excel): pilih keduanya
  sekaligus, digabung otomatis (harga & qty dari CI, berat dari PL).

## B. Label & penamaan dinamis
- Nilai **Nama Vessel di template copy**: udara → No. Flight saja;
  laut → `Nama Vessel + No. Voyage` digabung (`vesselNameForTemplate()`).
- Label form: laut → "Nama Voyager" / "No. Voyage"; udara → "Nama Vessel"
  (bukan "Nama Maskapai") / "No. Flight".
- Udara → "Pelabuhan Asal/Tujuan" berubah jadi "Terminal Asal/Tujuan".
- Pelabuhan tampil sebagai **kode UN/LOCODE** (`IDTPP`, `KRICN`, …).

## C. Field & form (UX)
- "Barang Jadi" ditambahkan ke dropdown Jenis Barang (dipakai Export).
- Package per item (Import) dari kolom field 35 PIB; kalau tidak ada rincian
  per item, kemasan total ditaruh di item pertama.
- Total Package: kotak angka + kotak **satuan** terpisah (tersimpan "12 BOX").
  Hasil template copy tetap **angka saja**.
- Lebar field Total Kemasan mengikuti panjang teks (`field-sizing: content`).
- Field Nama Item diperbesar (min-height 58px, min-width 300px).
- Hint merah yang menggeser baris **dihapus** — diganti tooltip + garis tepi
  merah pada input, sehingga tinggi baris tidak berubah saat mengetik.
- Section aktif diingat saat refresh (`localStorage`).
- Daftar referensi **UN/LOCODE** (`js/core/unlocode.js`, ±70 lokasi + alias),
  tampil sebagai saran isian di field Pelabuhan/Terminal.

## D. Status & workflow
- Import: PROCESS / DELAY / ARRIVED · Export: PROCESS / DELAY / DELIVERED.
  Di database keduanya tetap `arrived` — hanya labelnya berbeda, sehingga
  data lama tidak perlu dimigrasi.
- Status DELAY memunculkan blok **Jadwal Awal** (ETA Awal & ETD Awal) plus
  ringkasan "mundur N hari". Delay dihitung dari ETA, cadangan ETD.
- Badge delay muncul di kartu dashboard.
- **Hapus Semua** kini per section.
- Sort & grouping berdasarkan **ETA**.
- Bulk export/import: dropdown pilihan mode dihapus, ikut section aktif.
- Nilai 0 pada bulk export ditulis sebagai sel kosong.

## E. Copy template & kolom
- Menu copy mengikuti section: Import → All Import, Daily Import, Report;
  Export → All Export, Daily Export, Report.
- **All Import**: +1 kolom "NO" kosong di paling kiri (30 kolom).
- **All Export**: 17 kolom persis urutan yang diminta.
- **Daily Import**: 25 kolom persis urutan yang diminta.
- Kolom STATUS: PROCESS → `PROCESS`; ARRIVED/DELIVERED → `COMPLETED`.
- Kalau Master BL/AWB kosong, **House BL tetap di baris pertama**.
- Report: indentasi dirapikan (nomor rata kanan, pemisah section, butir "•").
- Bulk export membuat sheet terpisah per template copy, kecuali Report.

## G. Format angka
Format PIB diterapkan di seluruh output copy: ribuan koma, desimal titik,
desimal nol tidak ditampilkan — `3800.0000` → `3,800`, `0` → sel kosong.

---

## Catatan & batasan

1. **Angka dengan pemisah ribuan saat paste ke Excel.** Format PIB (`3,800`)
   dikenali sebagai angka oleh Excel ber-locale English. Kalau Excel Anda
   ber-locale Indonesia dan hasil paste terbaca sebagai teks, beri tahu saya —
   tinggal satu baris di `clipboardFormatter.num` (`js/features/excel-row-format.js`).
2. **Kontainer belum teruji dengan data nyata.** Semua PDF sampel yang ada
   berkargo LCL/koli lepas (field 27 & 43 kosong), jadi jalur ekstraksinya
   belum pernah kena data berisi. Kalau ada PIB/PEB FCL, kirim satu file —
   saya verifikasi.
3. **Kolom yang memang tidak ada field-nya** dikosongkan: SHIPPER DOC dan
   NO. POL di Daily Import.
4. **Bulk Import** membaca sheet pertama (format All Import/All Export).
5. Ekstraksi PDF tetap best-effort untuk dokumen hasil scan/gambar — PDF
   berbasis teks (hasil cetak CEISA) yang didukung penuh.
