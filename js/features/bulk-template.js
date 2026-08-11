"use strict";

/* TEMPLATE EXCEL UNTUK BULK IMPORT

   Menghasilkan berkas .xlsx yang siap diisi: kolomnya persis sama
   dengan yang dibaca Bulk Import, lengkap dengan dua baris contoh dan
   satu lembar keterangan.

   Kenapa dibuat dari kode, bukan disimpan sebagai berkas contoh:
   daftar kolomnya diambil langsung dari IMPORT_BULK_HEADERS dan
   EXPORT_BULK_HEADERS — sumber yang sama dengan pembacanya. Templat
   yang disimpan terpisah akan tertinggal begitu ada kolom bertambah,
   dan pengguna baru menyadarinya saat unggahannya ditolak.
*/

/* Satu pengiriman berisi dua barang: memperlihatkan aturan yang paling
   sering salah dipahami — baris kedua hanya mengisi kolom barang,
   kolom pengiriman dibiarkan kosong agar tidak terbaca sebagai jadwal
   terpisah. */
function templateRowsImport() {
  const kosong = new Array(IMPORT_BULK_HEADERS.length).fill("");
  const b1 = kosong.slice();
  b1[IMPORT_IDX.NO] = 1;
  b1[IMPORT_IDX.FACTORY] = new Date(2026, 7, 20);
  b1[IMPORT_IDX.DOCNO] = "000123";
  b1[IMPORT_IDX.DATE] = new Date(2026, 7, 15);
  b1[IMPORT_IDX.AJU] = "000020123456789012345678";
  b1[IMPORT_IDX.PARTY] = "NAMA SUPPLIER";
  b1[IMPORT_IDX.ITEM] = "NAMA BARANG PERTAMA";
  b1[IMPORT_IDX.HS] = "84807190";
  b1[IMPORT_IDX.DESC] = "Keterangan / tipe barang";
  b1[IMPORT_IDX.QTY] = 10;
  b1[IMPORT_IDX.SAT] = "PCS";
  b1[IMPORT_IDX.AMOUNT] = 1500;
  b1[IMPORT_IDX.NDPBM] = 16000;
  b1[IMPORT_IDX.INCOTERM] = "CIF";
  b1[IMPORT_IDX.TARIF] = 0.05;
  b1[IMPORT_IDX.BLAWB] = "BL-2026-0001";
  b1[IMPORT_IDX.INVOICE] = "INV-2026-0001";
  b1[IMPORT_IDX.VESSEL] = "NAMA KAPAL 001S";
  b1[IMPORT_IDX.PACKAGE] = "5 BOX";
  b1[IMPORT_IDX.REMARK] = "Catatan bebas";

  const b2 = kosong.slice();
  b2[IMPORT_IDX.ITEM] = "NAMA BARANG KEDUA";
  b2[IMPORT_IDX.HS] = "39269099";
  b2[IMPORT_IDX.DESC] = "Barang kedua pada pengiriman yang SAMA";
  b2[IMPORT_IDX.QTY] = 4;
  b2[IMPORT_IDX.SAT] = "SET";
  b2[IMPORT_IDX.AMOUNT] = 800;

  return [b1, b2];
}

function templateRowsExport() {
  const kosong = new Array(EXPORT_BULK_HEADERS.length).fill("");
  const b1 = kosong.slice();
  b1[EXPORT_IDX.NO] = 1;
  b1[EXPORT_IDX.FACTORY] = new Date(2026, 7, 18);
  b1[EXPORT_IDX.DOCNO] = "000456";
  b1[EXPORT_IDX.DATE] = new Date(2026, 7, 16);
  b1[EXPORT_IDX.AJU] = "000030123456789012345678";
  b1[EXPORT_IDX.PARTY] = "NAMA BUYER";
  b1[EXPORT_IDX.HS] = "84807190";
  b1[EXPORT_IDX.DESC] = "Nama barang pertama";
  b1[EXPORT_IDX.QTY] = 2;
  b1[EXPORT_IDX.AMOUNT] = 20000;
  b1[EXPORT_IDX.INCOTERM] = "FOB";
  b1[EXPORT_IDX.BLAWB] = "BL-EX-2026-0001";
  b1[EXPORT_IDX.INVOICE] = "DDI-CRBM-VIII-001";
  b1[EXPORT_IDX.VESSEL] = "NAMA KAPAL 002E";
  b1[EXPORT_IDX.PACKAGE] = "82*82*75";
  b1[EXPORT_IDX.REMARK] = "Catatan bebas";

  const b2 = kosong.slice();
  b2[EXPORT_IDX.HS] = "73269099";
  b2[EXPORT_IDX.DESC] = "Barang kedua pada pengiriman yang SAMA";
  b2[EXPORT_IDX.QTY] = 1;
  b2[EXPORT_IDX.AMOUNT] = 5000;

  return [b1, b2];
}

/* Keterangan ditaruh di lembar TERPISAH, bukan sebagai baris catatan di
   atas tabel. Baris tambahan di lembar data akan ikut terbaca sebagai
   jadwal saat berkasnya diunggah kembali. */
function templateCatatanRows(mode) {
  const umum = [
    ["Kolom", "Keterangan"],
    ["NO", "Nomor urut pengiriman. Diisi HANYA pada baris pertama tiap pengiriman."],
    [
      "(baris barang)",
      "Satu pengiriman boleh punya banyak barang: isi kolom barang saja, kosongkan kolom pengiriman.",
    ],
    ["Tanggal", "Isi sebagai TANGGAL Excel, bukan teks. Format tampilan bebas."],
    ["Angka", "Tanpa pemisah ribuan dan tanpa simbol mata uang."],
    ["HS CODE", "8 digit. Titik dan tanda hubung boleh, akan dibersihkan otomatis."],
    ["Baris kosong", "Diabaikan. Aman untuk memberi jarak antar pengiriman."],
    ["Urutan kolom", "Jangan diubah, jangan ada kolom disisipkan atau dihapus."],
  ];
  const khusus =
    mode === "import"
      ? [
          ["PACKAGE", 'Jumlah + jenis, mis. "5 BOX". Total koli dijumlah otomatis.'],
          ["TARIF", "Persen bea masuk. Isi 5% atau 0,05 — keduanya terbaca."],
          ["SAT", "Satuan barang, mis. PCS / SET / KG."],
        ]
      : [
          ["PACKAGE", 'Dimensi P*L*T dalam cm, mis. "82*82*75". CBM dihitung otomatis.'],
          ["CONSIGNEE", "Nama pembeli di luar negeri."],
        ];
  return umum.concat(khusus);
}

let templateSedangDibuat = false;

async function unduhTemplateBulk(mode) {
  if (templateSedangDibuat) return;
  templateSedangDibuat = true;
  try {
    return await susunTemplateBulk(mode);
  } catch (err) {
    console.error(err);
    showToast(
      `Gagal menyusun template: ${err && err.message ? err.message : "kesalahan tidak diketahui"}`,
      "danger",
    );
  } finally {
    /* Dilepas di finally: kalau gagal dan bendera tetap menyala,
       tombolnya mati selamanya sampai halaman dimuat ulang. */
    templateSedangDibuat = false;
  }
}

async function susunTemplateBulk(mode) {
  const m = mode === "export" ? "export" : "import";
  const headers = m === "import" ? IMPORT_BULK_HEADERS : EXPORT_BULK_HEADERS;
  const rows = m === "import" ? templateRowsImport() : templateRowsExport();

  /* Pustakanya dimuat sesuai kebutuhan, sama seperti Bulk Export.
     Tanpa ini, klik pertama di sesi yang belum pernah membuka Bulk
     Export akan gagal. */
  await ensureExcelJS();

  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();

  /* Nama lembar HARUS sama dengan yang dibaca Bulk Import. */
  const namaSheet = m === "import" ? "ALL IMPORT" : "ALL EXPORT";
  isiSheet(wb.addWorksheet(namaSheet), headers, rows, {
    kolomTanggal:
      m === "import"
        ? [IMPORT_IDX.FACTORY, IMPORT_IDX.DATE]
        : [EXPORT_IDX.FACTORY, EXPORT_IDX.DATE],
    kolomPersen: m === "import" ? IMPORT_IDX.TARIF : null,
  });

  const wsCatatan = wb.addWorksheet("CARA MENGISI");
  const catatan = templateCatatanRows(m);
  isiSheet(wsCatatan, catatan[0], catatan.slice(1), {});
  wsCatatan.getColumn(1).width = 22;
  wsCatatan.getColumn(2).width = 86;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const tautan = document.createElement("a");
  tautan.href = URL.createObjectURL(blob);
  tautan.download = `template-bulk-${m}.xlsx`;
  document.body.appendChild(tautan);
  tautan.click();
  document.body.removeChild(tautan);
  setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);

  showToast(
    `Template Bulk ${m === "import" ? "Import" : "Export"} diunduh. Isi lembar "${namaSheet}", jangan ubah urutan kolomnya.`,
    "success",
  );
}
