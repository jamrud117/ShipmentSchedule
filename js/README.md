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
| `core/helpers.js` | Formatter tanggal/angka, escapeHtml, factory objek baru (newItem/newSkbEntry/newStop) |
| `core/state.js` | Satu-satunya tempat state mutable app: `data`, `activeMode`, `draftItems`, `draftStops`, `currentDetailId`, `currentPage`, `pageSize` |
| `core/mapping.js` | Konversi baris Supabase (snake_case) <-> objek JS (camelCase) |
| `data/api.js` | Semua panggilan CRUD ke Supabase (load/create/update/persistFields) |
| `ui/dom.js` | Shortcut `$`/`$$`, referensi elemen DOM yang sering dipakai |
| `ui/feedback.js` | Toast & modal konfirmasi (pengganti alert/confirm bawaan browser); pop-up yang dibuka di atas pop-up lain dinaikkan lapisannya (latar meredupkan yang di bawah) |
| `ui/sidebar.js` | Sidebar navigasi: desktop menempel di kiri & bisa diciutkan jadi rel ikon (pilihan diingat, `exim.sidebar`); ponsel/tablet jadi laci dari tombol menu di bilah atas. `aturKerangka()` menampilkan/menyembunyikan sidebar + bilah atas bersama (disembunyikan di layar masuk & halaman form) |
| `ui/search-clear.js` | Tombol hapus (×) di setiap kotak cari (`.search-clear[data-cari-hapus]`): mengosongkan lalu mengirim event `input` supaya saringan halamannya berjalan sendiri. Kapan tampil diurus CSS (`:placeholder-shown`) |
| `core/customs.js` | Perhitungan CIF/FOB/BM+PDRI (satu-satunya sumber kebenaran). `bulatkanBm()` = aturan tunggal BM ke atas ke ribuan, dipakai semua jalan masuk BM (hitungan tarif, draft CEISA, PIB PDF, Bulk Import, form) |
| `core/carrier-master.js` | Deteksi pelayaran/maskapai/kurir untuk prediksi. `carrierNameFromShipment()` = nama sarana angkut tampil di mana pun (Nama Vessel/Voyager + No. Voyage/Flight); `carrierCipl()` = carrier di CIPL (udara cukup No Flight) |
| `core/route-model.js` | Progres lane pengiriman + rute transit multi-terminal + aturan auto-arrive |
| `render/cards.js` | Render kartu pengiriman (expanded & collapsed) |
| `render/list.js` | Filter, group by tanggal, sort, render list, paginasi, mode switch |
| `features/excel-row-format.js` | Format baris Excel (clipboard & native) utk mode Import & Export |
| `features/copy-templates.js` | Dropdown pilihan template di tombol Copy (All Import/Export, Daily Import/Export, Report) — builder & dispatcher-nya, TANPA mengubah excel-row-format.js |
| `features/card-events.js` | Delegasi event di kartu (status, tanggal, edit, hapus, dll) |
| `features/modal-fields.js` | Tab modal, toggle label transport, live feedback auto-arrive, recalc kepabeanan |
| `features/item-table.js` | Tabel draft barang + panel fasilitas SKB/E-COO |
| `features/route-stops.js` | Kartu draft terminal transit |
| `import/excel-bc.js` | Parser Excel dokumen BC mentah (HEADER/BARANG/dst) |
| `import/excel-cipl.js` | Parser Excel CIPL (Commercial Invoice + Packing List) |
| `import/apply-to-form.js` | Terapkan hasil parsing (dari ketiganya) ke form + tampilkan catatan |
| `import/pdf.js` | Parser PDF PIB BC 2.0 (pakai pdf.js, dimuat lazy) |
| `import/dispatch.js` | Deteksi file PDF vs Excel BC vs Excel CIPL, panggil parser yang sesuai |
| `views/form-router.js` | Routing hash (#/new, #/edit/:id), render & simpan halaman form |
| `views/vessel-schedule-view.js` | Halaman Shipment Schedule (#/shipment-schedule): daftar jadwal kapal per rute, saring From/To + tombol Cari, tambah/ubah/hapus. Tabel `vessel_schedules` (migration-vessel-schedule.sql) |
| `views/detail-view.js` | Modal detail pengiriman (read-only) |
| `features/bulk-excel.js` | Bulk export/import seluruh data lewat file Excel |
| `auth/session.js` | Sesi login & hak akses. Tabel `PERAN` (exim, marketing, finance, viewer): nama tampil, boleh mengubah atau tidak, dan halaman yang boleh dibuka — router, navbar, palet perintah, dan halaman Akun membaca dari sini. Peran baru = satu baris di tabel itu + nilainya di database (contoh: migration-role-finance.sql) |
| `views/masterlist-view.js` | Halaman Masterlist (#/masterlist): kuota fasilitas per baris barang & realisasinya per PIB. Terpakai & sisa selalu DIHITUNG dari catatan realisasi; panel "Kuota yang masih tersedia" per jenis mesin, masa berlaku dokumen, jadwal import berfasilitas Masterlist yang belum dicatat, daftar per baris / per PIB, unduh Excel dalam susunan berkas aslinya. Tabel `masterlists`, `masterlist_items`, `masterlist_usages` (migration-masterlist.sql) |
| `features/fund-docno.js` | Aturan "Doc No" di Form Pengajuan Dana: daftar vendor TANPA Doc No (bawaan PRIME & WIDE) yang bisa diatur dari kotak Aturan Doc No di halaman Nomor Dokumen. Tersimpan di `report_settings`; `fundPakaiDocNo()` dipakai form dan cetakannya |
| `features/fund-vendor.js` | Dropdown "Dibayarkan Kepada" (vendor) di Pengajuan Dana: daftar tersimpan di `report_settings` (kunci `fund-vendor`) + vendor pengajuan lama, tanpa kembar; "+ Tambah vendor baru…" menyimpan ke daftar |
| `features/fund-lines.js` | Rincian biaya Pengajuan Dana: rumus di kotak nilai (titik ribuan saat diketik), PPN/PPh, diskon, dan pembagian per BL/AWB (`fundBagiPerAwb`) supaya satu invoice beberapa AWB terhitung per kiriman |
| `views/docnum-view.js` | Halaman Nomor Dokumen: penerbitan nomor, riwayat (cari, status bayar, rentang tanggal Pengajuan Dana), dan Ubah Isian lewat pop-up -- panel form jenisnya dipinjam ke `#dnEditModal` lalu dikembalikan, draf pengajuan baru di belakangnya dipulihkan utuh |
| `features/docnum-detail.js` | Kotak Detail pengajuan nomor ("Lihat seluruh isian") untuk keempat jenis dokumen: susunan bagian per jenis (`DN_DETAIL_SUSUNAN`), tabel rincian biaya / daftar barang, dan bagian "Lainnya" untuk isian yang belum terdaftar |
| `app-init.js` | Titik masuk aplikasi — memanggil `loadShipments()` |
