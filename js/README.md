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

## Peta file

| File | Isi |
|---|---|
| `config.js` | Koneksi Supabase, STATUS_META, MODE_LABELS, JENIS_OPTIONS, SKB_TYPE_OPTIONS |
| `core/helpers.js` | Formatter tanggal/angka, escapeHtml, factory objek baru (newItem/newSkbEntry/newStop). Format BEROPSI selalu lewat `angkaLokal()` / `tanggalLokal()` (formatter Intl disimpan) -- `toLocaleString(locale, opsi)` membangun formatter baru tiap panggilan |
| `core/state.js` | Satu-satunya tempat state mutable app: `data`, `activeMode`, `draftItems`, `draftStops`, `currentDetailId`, `currentPage`, `pageSize` |
| `core/mapping.js` | Konversi baris Supabase (snake_case) <-> objek JS (camelCase) |
| `data/api.js` | Semua panggilan CRUD ke Supabase (load/create/update/persistFields) |
| `ui/dom.js` | Shortcut `$`/`$$`, referensi elemen DOM yang sering dipakai |
| `ui/fokus.js` | Langsung siap mengetik: kursor ke isian KOSONG pertama saat membuka form jadwal, pop-up, panel nomor dokumen, atau menambah baris (`fokusIsianPertama`). Enter = isian berikutnya di wadah `[data-enter-lanjut]` (di isian terakhir: `data-enter-kirim` ditekan / `data-enter-akhir` difokus; `[data-enter-sendiri]` = tabel yang mengurus Enter-nya sendiri). Fokus kembali ke tombol pemicu saat dialog ditutup (`kunciFokus` menemukan kembarannya sesudah digambar ulang). iOS tidak memperbesar halaman saat kotak difokus |
| `ui/feedback.js` | Toast & modal konfirmasi (pengganti alert/confirm bawaan browser); pop-up yang dibuka di atas pop-up lain dinaikkan lapisannya (latar meredupkan yang di bawah). Posisi toast murni CSS (`.toast-stack`). Pop-up isian: kursor di isian kosong pertama, Enter ke isian berikutnya, Enter di isian terakhir = Simpan. Konfirmasi hapus/peringatan memfokus Batal, konfirmasi biasa memfokus tombol utamanya |
| `ui/icons.js` | Ikon halaman: satu set garis (Lucide, ISC) untuk sidebar, rel, bilah atas ponsel, palet perintah, aksi cepat & tab jenis dokumen. Bentuknya di `<svg class="ikon-sprite">` awal index.html (`#ik-*`), gayanya `.ic` (base.css); `ikonSvg(nama)` / `ikonDari("ik:nama" atau "bi-…")` untuk markup yang dirakit JS |
| `ui/sidebar.js` | Sidebar navigasi: desktop menempel di kiri & bisa diciutkan jadi rel ikon (pilihan diingat, `exim.sidebar`); ponsel/tablet jadi laci dari tombol menu di bilah atas. `aturKerangka()` menampilkan/menyembunyikan sidebar + bilah atas bersama (disembunyikan di layar masuk & halaman form) |
| `ui/search-clear.js` | Tombol hapus (×) di setiap kotak cari (`.search-clear[data-cari-hapus]`): mengosongkan lalu mengirim event `input` supaya saringan halamannya berjalan sendiri. Kapan tampil diurus CSS (`:placeholder-shown`) |
| `core/customs.js` | Perhitungan CIF/FOB/BM+PDRI (satu-satunya sumber kebenaran). `bulatkanBm()` = aturan tunggal BM ke atas ke ribuan, dipakai semua jalan masuk BM (hitungan tarif, draft CEISA, PIB PDF, Bulk Import, form) |
| `core/carrier-master.js` | Deteksi pelayaran/maskapai/kurir untuk prediksi. `carrierNameFromShipment()` = nama sarana angkut yang ditampilkan (kartu, detail, Bulk Excel, surat BC: Nama Vessel/Voyager + No. Voyage/Flight); `carrierVesselFlight()` = satu kolom Vessel/Flight di CIPL & kolom VESSEL templat salin (udara cukup No Flight); `carrierCipl()` = carrier yang dicetak di CIPL. Hasil deteksi diingat per teks (`ingatDeteksi`) |
| `core/route-model.js` | Progres lane pengiriman + rute transit multi-terminal + aturan auto-arrive |
| `render/cards.js` | Render kartu pengiriman (expanded & collapsed) |
| `render/list.js` | Filter, group by tanggal, sort, render list, paginasi, mode switch. Teks pencarian (`teksCariJadwal`) hanya dirakit saat ada kata kunci; lebar pil status & kartu di luar layar diurus CSS (`field-sizing`, `content-visibility`). Saat daftar digambar ulang posisi gulir tidak melompat (tinggi kartu diwariskan + penanda gulir) dan fokus/isi kotak yang sedang diketik ikut bertahan |
| `features/excel-row-format.js` | Format baris Excel (clipboard & native) utk mode Import & Export. `formatter.vessel`: salinan (clipboard) menulis No Flight saja untuk kiriman udara; Bulk Excel (native) tetap nama + nomor supaya Bulk Import tidak kehilangan nama maskapai |
| `features/copy-templates.js` | Dropdown pilihan template di tombol Copy (All Import/Export, Daily Import/Export, Report) — builder & dispatcher-nya, TANPA mengubah excel-row-format.js |
| `features/card-events.js` | Delegasi event di kartu (status, tanggal, edit, hapus, dll) |
| `features/doc-steps.js` | Progres Dokumen di kartu (stepper). Tiap tahap dikonfirmasi dengan TANGGAL DITERIMA-nya (tooltip menampilkan tanggal itu, bukan waktu klik); tahap E-COO sesudah COO ikut strip kalau COO tidak dipakai (`docStepEntri`), tapi tidak ikut terisi saat COO diterima |
| `features/modal-fields.js` | Tab modal, toggle label transport, live feedback auto-arrive, recalc kepabeanan |
| `features/item-table.js` | Tabel draft barang + panel fasilitas SKB/COO (tombol berhitungan "SKB 1 · COO 1"; jenis tersimpan "E-COO" tampil sebagai COO lewat `skbJenisLabel`) |
| `features/route-stops.js` | Kartu draft terminal transit |
| `import/excel-bc.js` | Parser Excel dokumen BC mentah (HEADER/BARANG/dst) |
| `import/excel-cipl.js` | Parser Excel CIPL (Commercial Invoice + Packing List) |
| `import/apply-to-form.js` | Terapkan hasil parsing (dari ketiganya) ke form + tampilkan catatan |
| `import/pdf.js` | Parser PDF PIB BC 2.0 (pakai pdf.js, dimuat lazy) |
| `import/dispatch.js` | Deteksi file PDF vs Excel BC vs Excel CIPL, panggil parser yang sesuai |
| `views/form-router.js` | Routing hash (#/new, #/edit/:id), render & simpan halaman form |
| `views/detail-view.js` | Panel detail pengiriman (read-only). Bisa dibuka untuk jadwal di buku mana pun (`kirimanDenganId`): label & kolomnya mengikuti buku jadwalnya sendiri |
| `features/bulk-excel.js` | Bulk export/import seluruh data lewat file Excel |
| `features/cek-duplikat.js` | Nomor ganda di form jadwal: B/L-AWB (Master & House saling dibandingkan, kedua buku), No. Aju (kedua buku), Invoice & No. SPPB/PEB (buku yang sama) yang sudah dipakai jadwal lain ditandai di bawah kotaknya saat diketik, lalu ditanyakan saat Simpan ("Tetap Simpan" / "Periksa Lagi") -- peringatan, bukan larangan: Master B/L konsolidasi & invoice bertahap memang sah |
| `features/notifikasi.js` | Lonceng notifikasi (sidebar & bilah atas ponsel): jadwal yang berangkat / tiba besok -- H-1 dari ETD & ETA yang berlaku -- tampil sampai hari H. Dihitung dari data jadwal; yang disimpan (localStorage per akun & perangkat) hanya status dibaca & pelacak tanggal: ETD/ETA yang diubah sesudah dinotifikasi memunculkan notifikasi ULANG di H-1 tanggal barunya. Klik satu notifikasi = panel detail jadwalnya |
| `auth/session.js` | Sesi login & hak akses. Tabel `PERAN` (exim, marketing, finance, viewer): nama tampil, boleh mengubah atau tidak, dan halaman yang boleh dibuka — router, navbar, palet perintah, dan halaman Akun membaca dari sini. Peran baru = satu baris di tabel itu + nilainya di database (contoh: migration-role-finance.sql). `tandaiBayar` / `bolehTandaiBayar()` = satu-satunya hak ubah di luar EXIM: Finance menandai Pengajuan Dana Paid / Unpaid (selebihnya `canEdit()` tetap false) |
| `views/masterlist-view.js` | Halaman Masterlist (#/masterlist): kuota fasilitas per baris barang & realisasinya per PIB. Terpakai & sisa selalu DIHITUNG dari catatan realisasi; panel "Kuota yang masih tersedia" per jenis mesin, masa berlaku dokumen, jadwal import berfasilitas Masterlist yang belum dicatat, daftar per baris / per PIB, unduh Excel dalam susunan berkas aslinya (+ lembar "REALISASI PER PIB": nomor aju berpasangan dengan tanggalnya). Satu realisasi bisa memuat BEBERAPA PIB (mesin dikirim bertahap; kuota dihitung sekali), masing-masing bernomor aju + tanggal sendiri -- kolom `pibs`; PIB kiriman berikutnya ditambahkan ke realisasi yang ada ("kiriman lanjutan" / tombol + PIB), dan tanggal satu PIB diatur sekali untuk semua catatannya dari susunan Per PIB. NILAI (USD) dilacak seperti unit: nilai masterlist per baris (`value_quota`) & nilai invoice per realisasi (`invoice_value`); terpakai & sisa nilai dihitung, baris yang nilainya lebih / unit habis tapi nilai belum sama / realisasi belum bernilai ditandai (saringan "Nilai perlu dicek"). Kolom dari migrasi lanjutan dibaca & ditulis lewat `mstBacaKolom` / `mstKirim`, jadi halaman tetap jalan sebelum migrasinya dijalankan. Tabel `masterlists`, `masterlist_items`, `masterlist_usages` (migration-masterlist.sql, lalu migration-masterlist-pib-parsial.sql & migration-masterlist-nilai.sql) |
| `features/fund-docno.js` | Aturan "Doc No" di Form Pengajuan Dana: daftar vendor TANPA Doc No (bawaan PRIME & WIDE) yang bisa diatur dari kotak Aturan Doc No di halaman Nomor Dokumen. Tersimpan di `report_settings`; `fundPakaiDocNo()` dipakai form dan cetakannya |
| `features/fund-vendor.js` | Dropdown "Dibayarkan Kepada" (vendor) di Pengajuan Dana: daftar tersimpan di `report_settings` (kunci `fund-vendor`) + vendor pengajuan lama, tanpa kembar; "+ Tambah vendor baru…" menyimpan ke daftar |
| `features/fund-lines.js` | Rincian biaya Pengajuan Dana: rumus di kotak nilai (titik ribuan saat diketik), PPN/PPh, diskon, dan pembagian per BL/AWB (`fundBagiPerAwb`) supaya satu invoice beberapa AWB terhitung per kiriman |
| `views/docnum-view.js` | Halaman Nomor Dokumen: penerbitan nomor, riwayat (cari, status bayar, rentang tanggal Pengajuan Dana), dan Ubah Isian lewat pop-up -- panel form jenisnya dipinjam ke `#dnEditModal` lalu dikembalikan, draf pengajuan baru di belakangnya dipulihkan utuh. Status bayar (EXIM & Finance) ditulis lewat fungsi database `set_fund_paid` (migration-finance-tanda-bayar.sql): hanya `paidAt`/`paidBy` yang berubah; sebelum migrasinya ada, EXIM memakai jalur lama (`dnSetelBayarLangsung`). Ubah Isian membawa status bayar dari database (`dnPayloadTerbaru`), bukan dari salinan di layar |
| `features/docnum-detail.js` | Kotak Detail pengajuan nomor ("Lihat seluruh isian") untuk keempat jenis dokumen: susunan bagian per jenis (`DN_DETAIL_SUSUNAN`), tabel rincian biaya / daftar barang, dan bagian "Lainnya" untuk isian yang belum terdaftar |
| `app-init.js` | Titik masuk aplikasi — memanggil `loadShipments()` |
