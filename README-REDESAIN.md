# Redesain UI/UX — EXIM DDI ShipmentSchedule

Tema warna utama tetap **navy**. Yang berubah adalah bagaimana navy dipakai
(sebagai tinta, bukan gradien hiasan), dan yang lebih penting: bagaimana
halaman-halamannya menyusul cara kerja EXIM sehari-hari.

---

## 1. Kenapa diubah — temuan dari versi lama

Sebelum menyentuh apa pun, tampilan lama saya potret dulu lewat harness
Playwright (Supabase di-mock). Enam hal yang paling mahal:

| Temuan | Angka |
|---|---|
| Navbar + hero bergambar + kartu statistik sebelum baris data pertama | **±420 px** hanya untuk sesuatu yang dilihat sekali |
| Satu kartu pengiriman | **±480 px** tinggi → membandingkan 30 jadwal = belasan layar gulir |
| Kartu statistik (Total/PROCESS/DELAY/ARRIVED) | memberi tahu, tapi **tidak bisa diklik** untuk menyaring |
| Toolbar ikut menggulir | ganti filter setelah turun 3 layar harus balik ke atas |
| Tanggal ditampilkan mentah | user menghitung sendiri "ini telat berapa hari", puluhan kali sehari |
| Detail berupa modal tengah | menutupi daftar, dan tidak bisa lompat ke pengiriman berikutnya |

Dan satu yang struktural: **tidak ada halaman yang menjawab "apa yang harus
saya kerjakan hari ini"**. Aplikasi menjawab "apa saja yang ada di daftar".

---

## 2. Arah desain: papan operasi pelabuhan

Bahasanya diambil dari dunia pekerjaannya sendiri — manifes berbaris, nomor
dokumen monospace, cap status, papan keberangkatan yang menghitung mundur.
Bukan halaman pemasaran logistik.

**Warna** — navy tetap utama, kuningan (brass) tetap aksen sekunder:

| Peran | Nilai |
|---|---|
| Tinta / permukaan merek | `#0A1B33` `#102643` `#16375E` |
| Navy interaktif | `#1D5188` |
| Navy terang (di atas permukaan gelap) | `#5588BB` `#86AED4` `#B4CDE6` |
| Kuningan (aksen sekunder) | `#8A6524` `#C79A3E` |
| Status | PROCESS `#B5730F` · DELAY `#C0392B` · SELESAI = navy tenang |

"Selesai" sengaja **tidak** diberi warna cerah — yang sudah tuntas harus
meredup, bukan ikut berebut perhatian.

**Tipografi:**

| Muka | Peran | Kenapa |
|---|---|---|
| **Archivo** | judul, angka metrik, label struktur | grotesk terminal rata — huruf papan penanda |
| **Archivo Narrow** | token papan & kepala kolom manifes | muat di kolom sempit tanpa disingkat, persis papan jadwal |
| **Inter** | antarmuka | terbaik untuk data rapat |
| **JetBrains Mono** | no. aju, B/L, HS Code, kontainer | digit sejajar → jauh lebih mudah dicocokkan dengan dokumen bea cukai |

Manrope diganti Archivo: pasangan Manrope+Inter terlalu netral untuk memberi
karakter, dan Archivo punya sepupu *Narrow* yang membuat token papan mungkin.

---

## 3. Elemen khas: token hitung mundur

Penanda yang membuat aplikasi ini punya wajah sendiri, sekaligus mengerjakan
sesuatu yang nyata.

```
Telat 5h ETA      H-3 ETA      Hari ini ETA      Selesai      Tanpa tgl
  merah            navy          kuningan          abu          garis
```

Muncul di **setiap** baris manifes **dan** kepala setiap kartu — jadi "H-3"
berarti hal yang persis sama di mana pun ia muncul. Acuannya selalu tanggal
**efektif**: kalau jadwal sudah dimundurkan, yang dihitung tanggal barunya.

Perhitungannya hidup di satu tempat (`js/ui/board.js`) dan dipakai bersama
oleh manifes, kartu, saringan cepat, dan halaman Ringkasan.

---

## 4. Yang baru

### a. Tampilan Manifes (tabel) — penambahan terpenting

Kartu bagus untuk **membaca satu** pengiriman; buruk untuk **membandingkan
tiga puluh**.

| | Tinggi per pengiriman |
|---|---|
| Kartu (lama, satu-satunya pilihan) | ±480 px |
| **Manifes (baru, default)** | **58 px** |

Kolom: Papan · Shipper & Dokumen · Rute & Sarana · ETD · ETA · Actual ·
Status · Aksi. Tanpa kotak dan bayangan — hanya garis setipis rambut, seperti
manifes cetak. Sakelar Manifes/Kartu ada di bilah kendali, pilihannya diingat
per peramban (`localStorage`).

Tanggal yang sudah dimundurkan tampil dengan **yang asli dicoret dan yang baru
tegas**, jadi riwayat perubahan terbaca langsung dari baris.

### b. Halaman Ringkasan (`#/ringkasan`)

Menjawab pertanyaan pertama tiap pagi. Empat panel:

- **Perlu Tindakan** — antrean dengan **alasannya ditulis terus terang**
  (Mundur 7h / Telat 5h / H-1 / Dokumen). Setiap baris bisa diklik ke detail.
- **Agenda 7 Hari** — papan mini; klik satu hari → Jadwal tersaring ke tanggal itu.
- **Pantauan Delay** — jumlah, total hari mundur, yang paling parah.
- **Kelengkapan Dokumen** — meteran + rincian per bidang wajib.

Semuanya dihitung dari data yang **sudah ada**. Tidak ada satu pun kolom baru
di database — `schema-migration.sql` tidak berubah.

### c. Metrik yang bisa diklik

Lima ubin di papan navy: Total Aktif · Tiba Hari Ini · Perlu Tindakan ·
Proses · Selesai. Menekan ubin **memasang saringan**; menekan ubin yang sudah
aktif melepasnya. Ubin dan chip yang memasang hal yang sama selalu menyala
bersamaan.

### d. Saringan cepat

`Semua` · `Perlu tindakan` · `7 hari ke depan` · `Dokumen kurang` · `Selesai` —
lengkap dengan angka di tiap chip. Kalau sedang menyaring, muncul satu kalimat
yang menyebutkan **sedang menyaring apa** plus tombol membersihkannya.

### e. Panel geser untuk detail

Menggantikan modal. Daftar tetap terlihat, dan tombol `‹ ›` (atau tombol panah
keyboard) menelusuri **urutan yang benar-benar tampil** — hasil saringan dan
urutan yang sedang dipakai — tanpa menutup panel sekali pun.

### f. Pencarian cepat `Ctrl/⌘ + K`

Mencari **lintas Import DAN Export sekaligus**. Daftar utama hanya menampilkan
satu buku pada satu waktu, jadi tanpa ini mencari pengiriman di buku sebelah
berarti berganti mode dulu — dan kehilangan saringan yang sedang dipakai.
`Enter` buka detail, `Ctrl+Enter` langsung ke form edit. Perintah halaman ikut
masuk daftar yang sama.

Pintasan lain: `/` fokus pencarian · `N` jadwal baru · `V` ganti tampilan ·
`?` daftar pintasan.

### g. Halaman form

- **Bilah simpan menempel di dasar layar** — form ini tiga tab dan tabel
  barangnya bisa puluhan baris; tombol Simpan di ujung dokumen berarti setiap
  penyimpanan diawali menggulir.
- **Penanda kelengkapan** di bilah itu ("Belum lengkap: ETD, ETA, minimal 1
  nama barang"). Syaratnya **sama persis** dengan yang diperiksa
  `btnSaveShipment` — kalau berbeda, penanda seperti ini langsung tidak
  dipercaya lagi.
- **Penanda langkah** (`Langkah 2 dari 3`) mengisi kolom penyeimbang di header
  yang dulu sengaja dikosongkan.
- **Zona isi otomatis** dijadikan panel bergaris putus-putus, bukan tombol
  kecil rata kanan. Ini pintu masuk yang paling sering dipakai — satu PDF PIB
  mengisi puluhan bidang sekaligus — dan ukurannya dulu tidak mencerminkan itu.

### h. Bilah atas 54 px

Merek + navigasi halaman + `Ctrl K` + sakelar Import/Export, semuanya dalam
satu bilah navy yang menempel. Sakelar Import/Export naik ke sini karena itu
bukan filter tampilan: Import dan Export punya label bidang, pilihan status,
dan template salin yang berbeda — praktis dua buku besar.

Bilah kendali (cari/saring/urut) juga menempel, jadi mengganti saringan tidak
lagi menuntut menggulir balik ke atas.

Aksi jarang & merusak (**Bulk Export/Import**, **Hapus Semua**) pindah ke balik
menu `⋯`, supaya "Hapus Semua" tidak lagi berdiri sejajar dengan tombol yang
dipakai tiap hari.

---

## 5. Struktur berkas

`style.css` (3.740 baris, 482 selektor, beberapa lapis tambalan bertumpuk di
bagian bawah) dipecah jadi modul — pola yang sama dengan folder `js/`:

```
css/tokens.css      palet, tipografi, jarak, radius, bayangan, gerak
css/base.css        reset, kerangka halaman, keluarga tombol
css/shell.css       bilah atas, papan kepala halaman, footer
css/dashboard.css   ubin metrik, bilah kendali, chip, pemisah tanggal, paginasi, keadaan layar
css/manifest.css    tampilan tabel  (BARU)
css/card.css        kartu pengiriman
css/overview.css    halaman Ringkasan  (BARU)
css/panel.css       panel geser detail  (BARU)
css/palette.css     pencarian cepat Ctrl+K  (BARU)
css/components.css  modal, toast, kronologi & catatan
css/form.css        halaman Tambah/Edit
css/docnum.css      halaman Permintaan No. Dokumen
css/system.css      lapisan penyeragam komponen — dimuat TERAKHIR
```

**Urutan pemuatan di `index.html` penting**: tokens dulu, system terakhir.

Nama variabel token sengaja dipertahankan sama dengan versi lama
(`--navy`, `--teal`, `--border`, dst). Artinya seluruh aturan CSS yang tidak
saya sentuh otomatis ikut palet baru — bukan ditimpa lapis demi lapis.

### JavaScript

Berkas **baru**:

```
js/ui/board.js                    model kemendesakan & token hitung mundur
js/render/manifest.js             renderer tabel manifes
js/features/quick-filters.js      preset, metrik, sakelar tampilan
js/features/command-palette.js    Ctrl+K + pintasan global
js/views/overview-view.js         halaman Ringkasan
```

Berkas **diubah** (semuanya penyesuaian tampilan/rute, bukan logika bisnis):
`render/list.js`, `views/form-router.js`, `views/detail-view.js`,
`render/cards.js`, `ui/dom.js`, `features/modal-fields.js`,
`features/item-table.js`, `app-init.js`.

**Tidak disentuh sama sekali**: seluruh `js/import/*` (parser PDF PIB/PEB,
CIPL, Excel CEISA), `js/core/*` kecuali tidak ada, `js/data/api.js`,
`js/features/copy-templates.js`, `js/features/bulk-excel.js`,
`js/features/notes-log.js`, `js/features/route-stops.js`,
`js/views/docnum-view.js`, dan `schema-migration.sql`.

> **Kunci kenapa risikonya kecil:** event delegation sudah terpasang di
> `#cardContainer`. Baris manifes memakai atribut `data-action` /
> `data-id` / `data-field` yang **sama persis** dengan kartu — jadi Edit,
> Detail, Hapus, ganti Status, dan ganti tanggal langsung bekerja tanpa satu
> baris penanganan kejadian baru.

---

## 6. Pengujian

Divalidasi dengan harness Playwright (Supabase di-mock, Bootstrap & font
dilayani lokal), bukan dengan asumsi.

**50/50 uji perilaku lulus**, mencakup: metrik & hitungan, chip menyaring,
ubin melepas saringan, sakelar Manifes/Kartu, panel geser + telusur + Esc,
`Ctrl+K` lintas buku, Ringkasan (antrean/agenda/delay/dokumen), rute form
(langkah, kelengkapan, bilah sticky), halaman No. Dokumen, ganti buku
Import/Export, dan layar 390 px.

**29/30 uji kontras lulus WCAG AA.** Satu-satunya "FAIL" adalah artefak alat
ukur — `.cmd-trigger` punya latar putih 6% transparan yang tidak dikomposisi
oleh pengukur; dihitung manual nilainya **7,23:1**.

Tiga bug nyata ketangkap dan diperbaiki sebelum pengemasan:

1. **Telusur panel detail salah urutan.** `detailNavList()` membaca
   `getFiltered()` — urutan penyimpanan database, bukan urutan di layar.
   Akibatnya tombol "berikutnya" melompat acak, dan di baris pertama tombolnya
   bahkan mati. Sekarang panel dan `render()` membaca fungsi yang sama
   (`orderedFiltered()`).
2. **Status DELAY tidak masuk antrean tindakan.** Metrik "perlu tindakan"
   menghitungnya, halaman Ringkasan tidak — dua sumber kebenaran yang saling
   bertentangan. Diperbaiki.
3. **Baris manifes tidak bertingkat di layar kecil.** `.manifest tr` (0,1,1)
   mengalahkan `.mf-row` (0,1,0), jadi `display:block` menang dan tata letak
   grid tidak pernah berlaku. Selektornya dinaikkan jadi `.manifest tr.mf-row`.

---

## 7. Catatan pemasangan

Tidak ada langkah tambahan. Salin isi paket menimpa yang lama.

- `style.css` **dihapus** — diganti folder `css/`. Pastikan ikut terhapus di
  server, atau setidaknya tidak lagi di-`<link>` (index.html baru sudah tidak).
- `js/config.js` **tidak diubah** — `SUPABASE_URL` & `SUPABASE_ANON_KEY` tetap
  seperti sebelumnya.
- Skema database **tidak berubah**.

### Yang layak dipertimbangkan berikutnya

- Definisi "dokumen wajib" saat ini: No. dokumen pabean, No. Aju, No. Invoice
  (`REQUIRED_DOC_FIELDS` di `js/ui/board.js`). Kalau di lapangan daftarnya
  beda per mode Import/Export, itu satu tempat untuk diubah.
- Halaman Ringkasan membaca buku yang sedang aktif saja. Kalau lebih berguna
  menampilkan Import + Export sekaligus, perubahannya kecil.
- Ambang "H-2" untuk peringatan dokumen belum lengkap juga satu angka di
  `buildTaskQueue()`.

---

## 8. Putaran perbaikan setelah uji coba dengan data asli

Sembilan masukan dari pemakaian nyata, semuanya sudah dikerjakan.

| # | Masukan | Yang dilakukan |
|---|---|---|
| 1 | Blok kronologi di Manifes tampak kepotong | Blok itu `inline-flex`, jadi lebarnya mengikuti panjang teks lalu berhenti mendadak di tengah baris. Diubah jadi `flex` selebar penuh. Sekalian: garis pemisah dipindah ke baris kronologi (kelas `--hasnote`) dan rel status diteruskan ke bawah, jadi satu pengiriman terbaca sebagai **satu blok utuh**, bukan dua baris bertetangga |
| 2 | Tampilan search bar `Ctrl+K` | Aturan `:focus-visible` global memasang kotak biru bersudut membulat di dalam panel yang seluruhnya memang sedang fokus — terbaca seperti cacat. Dimatikan khusus untuk kotak ini; tinggi naik 52 → 58px, jarak dilonggarkan |
| 3 | Bilah simpan "floating tapi aneh" | Ia duduk di dalam `.page-form-body` yang ber-`max-width: 1600px`, jadi tepi kiri-kanannya berhenti di tengah layar → terbaca seperti kartu menggantung. Dipindah jadi **anak langsung `#viewForm`** dengan pembungkus `.page-form-actions-inner`. Sekarang selebar jendela penuh dan benar-benar rapat ke dasar (terukur: `left 0`, `width = viewport`, `bottom = window height`) |
| 4 | Tanggal template Report | **Estimasi Stuffing** (Export) tadinya memakai ETD efektif — itu tanggal kapal berangkat dari pelabuhan. Diganti ke **`factoryDate`**, yang di mode Export memang berlabel "Tanggal Stuffing" — tanggal barang dimuat ke kontainer di pabrik. Keduanya bisa berselisih beberapa hari. Urutan laporan ikut memakai tanggal yang sama. **Perkiraan Tiba di Pabrik** (Import) sudah benar memakai Actual Delivery |
| 5 | Ganti Import/Export tidak dinamis di Ringkasan | Bug nyata. `render()` hanya menggambar daftar Jadwal, sementara Ringkasan digambar sekali saat rutenya dibuka — jadi menekan EXPORT dari halaman Ringkasan menyisakan angka & antrean milik buku Import. `switchMode()` sekarang ikut memanggil `renderOverview()` bila halaman itu sedang tampil |
| 6 | Dropdown urutan ETA/ETD terdekat-terjauh | Dihapus. Sebelumnya ada **dua kontrol untuk satu keputusan** — dropdown urutan, plus label ETA/ETD di sebelahnya yang cuma ikut berubah dan tidak bisa disentuh. Sekarang label itu **jadi dropdown-nya**, menempel dengan kotak rentang tanggal sebagai satu alat. Ia menentukan urutan, pengelompokan tanggal, rentang, token hitung mundur, dan agenda 7 hari sekaligus. Arah urutan selalu terdekat lebih dulu |
| 7 | Redaksi "6 pengiriman · 1 jatuh hari ini…" | Dihapus. Angkanya sudah tercetak di ubin metrik tepat di bawahnya **dan** di setiap chip saringan cepat |
| 8 | Jangan terlalu compact | Baris manifes 58 → **70px**; papan, ubin metrik, bilah kendali, chip, kartu, dan panel Ringkasan semuanya dilonggarkan; tinggi kontrol diseragamkan ke 38px |
| 9 | Pengecekan menyeluruh | Sweep otomatis **35 kombinasi** (7 lebar layar × 4 halaman × 2 bentuk tampilan) |

### Lima masalah layout yang ketemu dari sweep

Tidak satu pun terlihat pada lebar 1440px tempat semua pekerjaan sebelumnya dinilai:

1. **Kartu di 390px meluber 107px** — `.date-strip` memakai `repeat(3, 1fr)`; batas bawah `auto` memakai lebar min-content input tanggal bawaan peramban (±145px), jadi tiga kolom memaksa ±470px. Diganti `minmax(0, 1fr)` + ditumpuk di bawah 600px.
2. **Antrean Ringkasan meluber di 390px** — kolom alasan selebar 92px memakan seperempat layar. Di bawah 576px alasannya naik jadi label di atas, teksnya memakai lebar penuh.
3. **Halaman No. Dokumen meluber di 390px** — `.docnum-shell` memakai grid `300px + 1fr`; kolom pertamanya saja sudah menghabiskan hampir seluruh layar ponsel. Ditumpuk di bawah 768px, daftar jenis dokumen jadi baris yang bisa digeser.
4. **Manifes menuntut geseran ~200px di 1024px** — kolom **Actual Delivery** dilepas di bawah 1360px. Dipilih karena ia kolom yang paling jarang berisi: menurut definisinya kosong untuk pengiriman yang masih berjalan, dan begitu terisi barisnya justru sudah selesai. Nilainya tetap ada di panel detail dan tampilan Kartu. Sisa geseran di 1024px turun jadi 11–66px.
5. **Detektor sweep salah lapor** — elemen di dalam kontainer `overflow-x: auto` (tab strip, pembungkus tabel) tadinya dihitung sebagai luapan. Itu perilaku yang disengaja; detektornya diperbaiki agar melaporkannya terpisah sebagai "geser-samping" dengan angka, bukan sebagai cacat.

### Hasil akhir pengujian

| Suite | Hasil |
|---|---|
| Perilaku (`verify.js`) | **68/68 lulus** |
| Kontras WCAG AA (`audit.js`) | **29/30** — satu "FAIL" artefak alat ukur, nilai sebenarnya 7,23:1 |
| Sweep responsif (`sweep.js`) | **35 kombinasi, nol luapan & nol error JS** |
| Kesejajaran kartu simpan (`align.js`) | **9 lebar layar, selisih 0px** |

### Catatan perubahan yang menyentuh state

`sortDir` (nilai `"eta-asc"` / `"etd-desc"`) diganti **`rangeBasis`** (nilai `"eta"` / `"etd"`) di `js/core/state.js`. `sortDirection()` sekarang selalu mengembalikan `"asc"`. Kalau ada kode lain di luar paket ini yang membaca `sortDir`, itu satu-satunya nama yang berubah.

---

## 9. Penyusunan ulang bilah kendali (final)

Susunan `space-between` di kedua baris ternyata salah pola. Pada layar
lebar ia menghasilkan tata letak "empat sudut" dengan lubang ±560px di
tengah: kontrol yang saling berhubungan jadi terlihat tidak
berhubungan, dan kotak cari terpotong di tengah placeholder.

```
sebelum
  [ ETA▾ tgl s/d tgl ]                          [ Cari... ]  [ Status ]
  CEPAT (chip)(chip)(chip)          [Manifes|Kartu] [⋯] [+ Tambah]

sesudah
  (Semua)(Perlu tindakan)(7 hari)(Dok kurang)(Selesai)   [Manifes|Kartu] [⋯] [+ Tambah]
  [ Cari... ] [ Status▾ ] [ ETA▾ tgl s/d tgl ]
```

**Baris 1 — pandangan + aksi.** Chip saringan cepat pada dasarnya
adalah *tab*: ia memilih himpunan mana yang sedang dilihat. Tab selalu
di atas alat penyaring, dan tombol aksi utama duduk di ujung kanan
baris teratas. Pola yang sama dipakai daftar isu GitHub, Linear, dan
Jira — jadi tidak perlu dipelajari ulang.

**Baris 2 — saringan, satu kelompok rapat di kiri.** Sisi kanan yang
kosong itu normal: toolbar tidak perlu memenuhi lebar layar. Urutan di
dalamnya mengikuti cara bertanya — "cari apa" (pencarian) → "yang mana"
(status) → "kapan" (rentang tanggal).

Perubahan pendukung:

- Label **"CEPAT" dihapus** — chip-nya menjelaskan diri sendiri, dan di
  baris teratas ia menggeser tab pertama menjauh dari tepi kiri tempat
  mata mulai membaca.
- `.search-box` kembali `flex: 1 1 300px` tapi dibatasi `max-width:
  380px`, supaya tidak melar sampai ujung layar dan menyeret kontrol
  lain menjauh dari kelompoknya. Placeholder dipendekkan agar tidak
  terpotong.
- Di bawah 1200px deret chip **digeser mendatar**, bukan dibungkus jadi
  dua baris — tab yang pecah baris kehilangan bacaan "satu deret
  pilihan".

### Bug yang ketemu dari screenshot

Ubin metrik yang aktif menampilkan tanda **"×"** kecil sebelum teks
bantunya — terbaca seperti tombol hapus. Penyebabnya `content: "\F62A"`
untuk ikon corong: nomor glyph bootstrap-icons berpindah antar versi,
dan di 1.11.3 kode itu memetakan ke glyph lain. Dihapus sepenuhnya —
ubin yang aktif sudah menyala putih penuh, penandanya tidak mungkin
terlewat.

### Lebar isi bertingkat

Ditambah satu tingkat: **1600px di atas 1800px lebar layar** (sebelumnya
berhenti di 1320px). Pada monitor 2560px isinya tadinya berhenti di
sepertiga layar sementara tabel manifes justru masih perlu digeser.
Berhenti di 1600px, tidak lebih — di atas itu baris manifes jadi terlalu
panjang untuk dipindai.

---

## 10. Scrollbar disembunyikan

Batang gulir peramban dihilangkan dari tampilan tanpa menyentuh
perilakunya. Diverifikasi: roda tetikus dan tombol keyboard (`End`)
tetap menggulir halaman, isi panel detail tetap bisa digulir, dan
batangnya tidak lagi memakan lebar (`window.innerWidth -
clientWidth === 0`).

`overflow-y: scroll` pada `html` sengaja **dipertahankan** meski
batangnya tak terlihat. Kalau dibiarkan `auto`, halaman pendek (form
kosong) tidak punya batang gulir dan halaman panjang punya — sehingga
lebar isi bergeser beberapa piksel setiap kali berpindah halaman.
Pergeseran itu sangat kentara pada tabel.

Wadah gulir di dalam halaman ikut disamakan: isi panel detail, daftar
hasil pencarian cepat, pembungkus tabel manifes, tabel barang, deret
chip, navigasi bilah atas, dan tab No. Dokumen.

> **Pertukaran yang disengaja.** Batang gulir juga berfungsi sebagai
> penunjuk posisi "sudah sampai mana". Kalau suatu saat terasa
> membingungkan pada daftar yang sangat panjang, cukup hapus satu blok
> bertanda di `css/base.css` dan tampilannya kembali seperti semula.

---

## 11. Sakelar buku keluar dari bilah atas

Sakelar Import/Export dipindah dari bilah atas ke **kepala papan tiap
halaman yang isinya bergantung padanya** — Jadwal dan Ringkasan.

Alasannya perbedaan jenis perbuatan. Bilah atas berisi **navigasi**:
menekan sesuatu di sana memindahkan pengguna ke halaman lain. Sakelar
ini tidak melakukan itu — ia mengganti **isi** halaman yang sedang
dibuka. Menaruh dua jenis perbuatan berbeda dalam satu bilah membuat
keduanya sama-sama sulit ditebak.

Ia kini berdiri tepat di posisi eyebrow yang dulu bertuliskan
"BUKU IMPORT" — informasi yang memang dinyatakan sakelarnya sendiri
lewat segmen yang menyala, jadi teks itu dihapus. Label "Import" dan
"Export" tetap terbaca penuh di papan (di bilah atas dulu teksnya
disembunyikan di layar sempit karena ruangnya habis; sakelar berisi dua
ikon tanpa teks adalah tebak-tebakan).

**Catatan teknis.** Karena salinannya kini lebih dari satu, penangan
klik didelegasikan dan `syncModeTabs()` menyapu **semua** salinan
sekaligus. Tanpa itu, menekan sakelar di Ringkasan akan meninggalkan
sakelar di Jadwal menyala pada buku yang salah. Diuji: menekan salah
satu membuat kedua salinan menyala serempak.

Halaman No. Dokumen sengaja tidak diberi sakelar — penomoran invoice,
DO, dana, dan surat tidak bergantung pada buku Import/Export.

---

## 12. Urutan baris bilah kendali dibalik

```
  [ Cari... ] [ Status▾ ] [ ETA▾ tgl s/d tgl ]
  (Semua)(Perlu tindakan)(7 hari)(Dok kurang)(Selesai)   [Manifes|Kartu] [⋯] [+ Tambah]
```

Saringan naik ke atas, deret tab turun ke bawah. Susunan ini punya
kelebihannya sendiri: kotak cari jadi elemen pertama yang ditemui mata
di sudut kiri-atas — posisi yang paling banyak dipakai aplikasi data —
dan deret tab kini menempel langsung di atas daftar yang disaringnya,
sehingga hubungan keduanya tidak perlu dijelaskan.

Konsekuensi yang perlu diketahui: tombol **+ Tambah Jadwal** ikut turun
ke baris kedua. Ia tetap di ujung kanan dan tetap satu-satunya tombol
navy pekat di layar, jadi masih paling menonjol — hanya tidak lagi di
baris paling atas. Kalau nanti terasa kurang menonjol, menukar kembali
kedua baris cukup memindahkan dua blok `.controlbar-row` di
`index.html`; CSS-nya tidak bergantung pada urutan.

---

## 13. Perbaikan tampilan putaran terakhir

### Kotak `Ctrl+K` yang terlihat terpotong — masalah kekhususan CSS

Penyebabnya bukan gaya panelnya, melainkan aturan global di
`css/system.css`:

```css
input[type="text"] { border: 1px solid; border-radius: 9px; background: #fff }
```

`system.css` dimuat **paling akhir** dan kekhususannya (0,1,1)
mengalahkan `.cmdk-input { border: 0 }` (0,1,0). Jadi kotak itu tetap
digambar berbingkai dan bersudut membulat di dalam panel yang
bingkainya sudah datar — terbaca seperti kolom isian yang ditempel
mengambang dengan tepi terpotong.

Diperbaiki dengan menaikkan kekhususan ke `.cmdk .cmdk-input` (0,2,0),
**bukan** dengan `!important`: yang keliru bukan aturan globalnya,
melainkan kekhususan di sisi komponen yang kurang.

**Kontrol lain yang kena masalah yang sama:** `.search-box input`
(0,1,1) **seri** dengan aturan global, jadi yang dimuat belakangan
menang — hasilnya radius kotak cari 9px sementara kontrol tetangganya
7px. Ditulis ulang jadi `.search-box input[type="text"]` (0,1,2).
Sekarang seluruh kontrol di bilah kendali terverifikasi seragam:
radius **7px** dan tinggi **38px** untuk cari, status, tanggal, dan
tombol Tambah.

### Baris kronologi di Manifes

Bidang abu selebar baris dihapus. Ketika catatannya pendek — dan
catatan biasanya pendek — bidang itu terbaca seperti kolom isian
kosong. Sekarang ia sekadar baris keterangan: ikon, cap waktu, isi.
Pengelompokan dengan barisnya sudah datang dari garis pemisah yang
dipindahkan ke bawah (`.mf-row--hasnote`), jadi tidak perlu wadah
lagi. Ditambah jorokan **110px** supaya sejajar dengan kolom identitas
— catatan itu milik nama shipper di atasnya, bukan milik token hitung
mundur di kolom pertama.

### Ikon rute

`bi-water` pada 0,72rem pecah jadi guratan tak terbaca — di layar
terlihat seperti noda pada garis rute. Dinaikkan ke **0,86rem** dengan
ruang bernapas lebih lebar.

### Tanggal yang dimundurkan

Sel dua baris (tanggal lama dicoret + tanggal baru merah) hanya muncul
pada pengiriman yang jadwalnya mundur. Kalau tingginya sama dengan sel
biasa, tinggi antar baris jadi tidak rata. Tanggal lama dikecilkan ke
0,66rem dengan `line-height` rapat.

> **Ini memang disengaja, bukan cacat.** Menampilkan rencana semula
> yang dicoret di sebelah tanggal baru membuat riwayat perubahan
> terbaca langsung dari baris, tanpa membuka detail — dan itu justru
> hal yang paling sering ditanyakan ketika sebuah pengiriman mundur.

---

## 14. Ikon situs & arah hadap animasi

### Ikon situs

Logo kapal peti kemas dipasang sebagai ikon situs dalam empat ukuran,
semuanya dipotong dari satu berkas sumber sehingga tidak ada yang bisa
lupa diperbarui sendirian:

| Berkas | Ukuran | Dipakai untuk |
|---|---|---|
| `favicon-32.png` | 32×32 | tab peramban |
| `apple-touch-icon.png` | 180×180 | pintasan layar utama iOS |
| `icon-192.png` | 192×192 | Android / PWA |
| `icon-512.png` | 512×512 | splash & instalasi PWA |

Ditambah `site.webmanifest` (nama aplikasi, warna latar navy, mode
`standalone`) dan `<meta name="theme-color" content="#0a1b33">` supaya
bilah status ponsel ikut navy saat aplikasi dibuka dari pintasan.

**Tanda merek di bilah atas digambar ulang** mengikuti ikon itu —
haluan kapal, tiang & palang emas di atas lambung terang. Tetap SVG,
bukan PNG ikonnya: pada 26px versi bitmap akan buram. Detail ombak di
ikon aslinya sengaja tidak ikut digambar karena pada ukuran itu ia
hanya jadi guratan.

> Berkas `Logo.png` (1,4 MB) yang ada sejak paket asli **tidak dirujuk
> di mana pun** — tidak di `index.html`, `js/`, maupun `css/`. Saya
> biarkan apa adanya karena mungkin dipakai di luar paket ini, tapi
> kalau memang tidak, menghapusnya memangkas hampir seluruh berat
> folder web.

### Arah hadap pesawat pada strip "Berangkat Hari Ini"

`bi-airplane-fill` digambar menghadap **atas**, jadi ia melayang
menyamping di sepanjang jalur putus-putus. Diputar 90° searah jarum jam
agar hidungnya searah dengan arah geraknya.

Dua hal teknis yang menentukan di sini:

1. **`rotate()` ditulis paling kanan** di dalam `transform`. Fungsi
   transform dijalankan dari kanan ke kiri, jadi ikonnya diputar dulu
   di tempatnya, baru digeser. Kalau urutannya dibalik, sumbu geser
   ikut berputar 90° dan pesawatnya melayang keluar jalur.
2. **Properti `rotate:` yang berdiri sendiri tidak dipakai**, meski
   terlihat lebih rapi. Ia selalu dihitung *setelah* `transform` — jadi
   `translate(-100%, -50%)` yang memusatkan ikon akan ikut terputar dan
   posisinya meleset.

Arah hadapnya disimpan sebagai variabel `--mover-rot`, sehingga jalur
geraknya cukup ditulis sekali untuk laut dan udara — tidak ada dua set
keyframes yang harus dijaga tetap sama. Ikon laut tetap `0deg`.

Terverifikasi dari matriks hasil hitung peramban:
`matrix(0, 1, -1, 0, …)` — tepat 90° searah jarum jam.

---

## 15. Bilah simpan, kotak hitung, & mata uang

### Bilah simpan yang mengambang di tengah

`#viewForm` memakai flex kolom setinggi minimal satu layar. Pada
halaman yang isinya pendek, bilah simpan berhenti tepat di bawah isi
dan menyisakan bidang kosong sangat luas di bawahnya — persis terlihat
seperti bilah yang menggantung di tengah halaman.

Diperbaiki dengan `margin-top: auto`, yang mendorongnya ke **dasar**
wadah flex. Isi pendek → bilah di dasar layar. Isi panjang → bilah
menempel di dasar jendela sambil digulir, seperti sebelumnya.

### Kotak hitung jadi satu baris

Total Nilai Barang tadinya berdiri sendiri di satu baris, lalu CIF/FOB
di baris berikutnya — tiga angka yang saling terkait dipisah dua baris
tanpa alasan. Sekarang satu baris `flex`, dan karena kotaknya melar,
ketika incoterm-nya bukan CIF maupun FOB (dua kotak lain sembunyi)
kotak Total otomatis mengisi lebar penuh tanpa perlu mengganti kelas
kolom dari JavaScript.

### Lambang mata uang pada isian

`$`, `Rp`, dan `%` digambar sebagai **lapisan CSS**
(`::before` + `content: attr(data-affix)`), **bukan** dimasukkan ke
dalam nilai kolom. Ini yang menjamin syaratnya terpenuhi: seluruh
template salin dan Bulk Export membaca `input.value` apa adanya, jadi
kalau lambangnya ikut masuk, sel Excel akan berisi `"Rp 1.200.000"` dan
berhenti terbaca sebagai angka.

| Kolom | Lambang |
|---|---|
| Freight, Insurance, Harga (tabel barang) | `$` di kiri |
| NDPBM, Bea Masuk, PPN, PPH, BM + PDRI | `Rp` di kiri |
| Tarif | `%` di kanan |

Lambangnya meredup saat kolom kosong dan menegas begitu terisi, jadi
terbaca sebagai petunjuk satuan — bukan sebagai isi. Ruang untuknya
disediakan permanen, bukan muncul-hilang: kalau padding ikut berubah,
teks yang sedang diketik melompat, dan itu sangat mengganggu saat
memasukkan belasan angka berurutan.

Kolom `BM + PDRI` yang tadinya berisi teks `"Rp 0"` di dalam nilainya
sekarang berisi angka murni.

### PPN & PPH dihitung otomatis

```
dasar = Total Nilai Barang (USD) × NDPBM
PPN   = dasar × 11%
PPH   = dasar × 2,5%
```

**Bea Masuk sengaja tidak dihitung otomatis** — tarifnya berbeda per HS
Code, jadi angkanya tidak bisa diturunkan dari data yang ada di form
ini. Tarif kini terisi default **5** pada form baru.

**Aturan timpa manual, satu kalimat:** *kosong berarti otomatis, diisi
berarti manual.* Begitu diketik sendiri, kolom itu berhenti ikut
berubah saat Total Nilai Barang atau NDPBM berubah — kalau tidak, angka
yang baru diketik akan tertimpa sendiri. Mengosongkan kolomnya
mengembalikannya ke otomatis, jadi tidak ada jalan buntu. Nilai yang
sudah tersimpan di database dianggap dimasukkan dengan sengaja, jadi
tidak ditimpa saat form dibuka.

> Kalau suatu saat dasarnya perlu diubah — misalnya ke `(CIF + Bea
> Masuk) × 11%` seperti perhitungan PIB pada umumnya — satu-satunya
> tempat yang perlu disunting adalah blok `dasarRupiah` di
> `js/features/modal-fields.js`.

Terverifikasi dengan angka nyata: 100 pcs × $10 = $1.000, NDPBM 16.000
→ dasar Rp 16.000.000 → **PPN Rp 1.760.000**, **PPH Rp 400.000**, Bea
Masuk tetap kosong, BM + PDRI = 0 sampai Bea Masuk diisi. Mengetik PPN
manual membuatnya bertahan ketika NDPBM diubah, sementara PPH yang
masih otomatis ikut menyesuaikan. Ketiga template salin terverifikasi
**bebas lambang mata uang**.

---

## 16. Perbaikan penempatan

### Lambang mata uang menabrak angka — kekhususan selektor lagi

Lambang `$` menempel di angka pertama karena paddingnya **tidak pernah
berlaku**:

```
.page-form .form-control   (0,2,0)  padding: 9px 12px      <- menang
.input-affix > input       (0,1,1)  padding-left: 30px     <- kalah
```

Pola yang sama persis dengan kasus kotak `Ctrl+K` sebelumnya. Ditulis
ulang `.page-form .input-affix > input` (0,2,1).

Angka paddingnya sekarang dihitung, bukan dikira-kira: lambang mulai di
12px, lebar `$` pada JetBrains Mono 0,78rem ±7px, sisakan ±8px jarak
baca → **27px**. `Rp` dua karakter ±14px → **34px**. Diverifikasi
terukur untuk keenam kolom: padding selalu lebih besar daripada tepi
kanan lambang.

### Kolom Harga/Unit di tabel barang

Angkanya tadinya rata **tengah**, jadi `$` di tepi kiri dan angka di
tengah terlihat seperti dua hal yang tidak berhubungan. Diubah jadi
rata **kanan** — menyusul kolom Subtotal di sebelahnya yang memang
sudah rata kanan. Lambang kiri + digit kanan adalah tata letak lajur
uang yang lazim, sama seperti format Currency di Excel. Lambangnya juga
digeser masuk dari tepi.

Sekaligus: `!important` yang dipakai sebagai jalan pintas di aturan
tabel dihapus, diganti kekhususan yang benar
(`.page-form table.item-table .input-affix--tight > input`).

### Sakelar buku dipindah ke sisi kanan kepala papan

Menaruhnya di atas judul membuatnya terbaca mengambang: kontrol
berbingkai yang cukup berat, di pojok kiri-atas, di tempat yang tadinya
hanya berisi eyebrow kecil, tanpa apa pun di sebelahnya untuk
mengimbangi.

Sekarang ia sebaris dengan judul di sisi kanan, mendahului blok
tanggal:

```
Daftar Jadwal Pengiriman Import        [IMPORT|EXPORT]  │ HARI INI
                                                          Selasa, 28 Juli 2026
```

`.board-head` juga diubah dari `align-items: flex-end` ke `center` —
sakelar punya tinggi sendiri, dan meratakan semuanya ke garis dasar
membuatnya tampak melorot dibanding judul. Di layar sempit, sisi
kanannya menumpuk ke bawah.

### Jarak di bilah kendali

Jarak antar baris 12 → **18px**, ruang bawah 14 → 16px. Baris saringan
dan deret tab di bawahnya tadinya terlalu berdempetan sehingga terbaca
sebagai satu blok padat, bukan dua kelompok kendali yang berbeda.

---

## 17. Bilah simpan jadi kartu mengambang

Versi sebelumnya setengah jalan: selebar layar penuh dan menempel rapat
ke dasar, tapi tetap punya garis atas dan latar sendiri — jadi ia
terbaca seperti bagian halaman yang kebetulan lengket, bukan sebagai
alat. Sekarang benar-benar kartu mengambang.

| | Sebelum | Sesudah |
|---|---|---|
| Lebar | selebar layar | selebar isinya, di tengah |
| Sudut | siku | membulat 14px |
| Bayangan | — | berlapis |
| Jarak sisi | 0 | 398px kiri/kanan · 20px bawah |
| Jarak ke isi di atas | ±6px | **32px** |

Pembungkusnya sendiri tidak terlihat — ia hanya mengurus posisi dan
memberi jarak. Isi halaman yang tergulir di bawahnya dilarutkan gradasi
tipis (`transparent → --bg`) supaya teks tidak menabrak tepi kartu, dan
`pointer-events: none` pada pembungkus membuat area kosong di
sampingnya tidak menghalangi klik ke isi di belakangnya.

Keterangan kelengkapan dan tombolnya dipisah garis tipis supaya tidak
terbaca sebagai satu kalimat panjang. Di layar sempit kartunya
melebar penuh dan keterangan disembunyikan — tombolnya yang harus
tetap muat.

> Catatan pengujian: jarak ke isi di atasnya harus diukur saat halaman
> digulir **mentok bawah**, yaitu ketika bilah berada di posisi
> alaminya. Selama masih di tengah halaman ia sedang menempel di dasar
> layar, jadi selisihnya negatif dan tidak menggambarkan apa pun —
> jebakan yang sempat membuat pengujian ini gagal palsu.

---

## 18. Kartu simpan disejajarkan dengan form

Lebarnya kini **persis sama** dengan kartu-kartu form di atasnya, dan
isinya dipisah ke dua ujung: keterangan kelengkapan di kiri, tombol
Batal & Simpan di kanan.

Cara menyamakannya bukan dengan angka tetap. `.page-form-body`
ber-`max-width: 1600px` dengan padding samping 24px, jadi kartu formnya
membentang `1600 − 48 = 1552px` dan berada di tengah. Angka itu yang
dipakai sebagai `max-width` kartu simpan, dan karena pembungkusnya juga
memakai padding samping yang sama, pada layar lebih sempit keduanya
otomatis menyempit bersamaan.

**Kedua tombol dibungkus jadi satu kelompok.** Tanpa itu,
`justify-content: space-between` akan membagi jarak untuk *tiga* anak —
keterangan di kiri, Batal di tengah, Simpan di kanan — dan Batal
berdiri sendirian di tengah kartu. Kelompoknya juga diberi
`margin-left: auto` sebagai pengaman: saat keterangan disembunyikan di
layar sempit, `space-between` kehilangan anak keduanya dan tanpa itu
tombolnya melompat ke kiri.

### Satu meleset 2px yang hanya muncul di ponsel

Uji kesejajaran pada sembilan lebar layar menemukan selisih **4px** di
bawah 768px: pembungkus kartu memakai padding samping `var(--sp-3)`
(12px) sementara `.page-form-body` di media query yang sama memakai
**14px**. Tidak terlihat sama sekali di layar besar. Disamakan jadi
14px.

Hasil akhir pada 390 – 1920px: selisih lebar **0px**, selisih tepi kiri
**0px**, tombol 13px dari tepi kanan kartu, keterangan 19px dari tepi
kiri.

---

## 11. Hasil pengujian akhir

| Suite | Hasil |
|---|---|
| Perilaku (`verify.js`) | **139/139 lulus** |
| Posisi tata letak (`pos.js`) | **9 lebar layar, semua sesuai** |
| Sweep responsif (`sweep.js`) | **35 kombinasi, nol luapan & nol error JS** |
| Kontras WCAG AA (`audit.js`) | **28/29** — satu artefak alat ukur, nilai asli 7,23:1 |
