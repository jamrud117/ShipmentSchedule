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
| `core/state.js` | Satu-satunya tempat state mutable app: `data`, `activeMode`, `draftItems`, `draftStops`, `sortDir`, `currentDetailId`, `currentPage`, `pageSize` |
| `core/mapping.js` | Konversi baris Supabase (snake_case) <-> objek JS (camelCase) |
| `data/api.js` | Semua panggilan CRUD ke Supabase (load/create/update/persistFields) |
| `ui/dom.js` | Shortcut `$`/`$$`, referensi elemen DOM yang sering dipakai |
| `ui/feedback.js` | Toast & modal konfirmasi (pengganti alert/confirm bawaan browser) |
| `core/customs.js` | Perhitungan CIF/FOB/BM+PDRI (satu-satunya sumber kebenaran) |
| `core/route-model.js` | Progres lane pengiriman + rute transit multi-terminal + aturan auto-arrive |
| `render/cards.js` | Render kartu pengiriman (expanded & collapsed) |
| `render/list.js` | Filter, group by tanggal, sort, render list, paginasi, mode switch |
| `features/excel-row-format.js` | Format baris Excel (clipboard & native) utk mode Import & Export |
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
| `views/detail-view.js` | Modal detail pengiriman (read-only) |
| `features/bulk-excel.js` | Bulk export/import seluruh data lewat file Excel |
| `app-init.js` | Titik masuk aplikasi — memanggil `loadShipments()` |
