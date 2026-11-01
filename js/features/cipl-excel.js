"use strict";

/* UNDUH CIPL SEBAGAI EXCEL

   Lembar Excel digambar dari MODEL YANG SAMA dengan lembar cetaknya
   (ciplDaftarTata -> ttExcel, lihat cipl-tata.js): Dynamic Design CI,
   PL & SI; Kumho CI & PL. Kolom, baris, gabungan sel, huruf, warna,
   garis, dan tempat teks turun baris sama persis dengan cetakan; satu
   kotak di cetakan = satu sel di Excel. Lembar diberi nama CI / PL / SI,
   tanpa garis kisi, setinggi A4 saat dicetak.
*/

/* Satu unduhan pada satu waktu.

   Menyusun lembar butuh waktu; klik kedua sebelum yang pertama selesai
   menjalankan dua penyusunan sekaligus, dan keduanya memicu unduhan --
   pengguna mendapat dua berkas identik dan tidak tahu mana yang benar. */
let ciplXlsSedangDibuat = false;

function ciplNamaBerkas(nomor) {
  return String(nomor || "CIPL").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "CIPL";
}

/* Buku kerja CIPL (tanpa mengunduh) -- dipakai tombol unduh & uji. */
function ciplBukuKerja(row, shipment) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EXIM DDI";
  wb.created = new Date();
  const lebarAngka = ttExcelHurufNormal(wb);
  ciplDaftarTata(row, shipment).forEach((T) => ttExcel(wb, T, lebarAngka));
  return wb;
}

async function unduhCiplExcel(rowId) {
  if (ciplXlsSedangDibuat) return;

  const row = ciplCariBarisRiwayat(rowId);
  if (!row) return;
  const shipment = ciplCariShipment((row.payload || {}).shipmentId);

  ciplXlsSedangDibuat = true;
  const tombol = document.querySelector(`[data-xls-cipl="${rowId}"]`);
  if (tombol) tombol.disabled = true;
  try {
    /* ExcelJS DIMUAT SESUAI KEBUTUHAN, bukan ikut di halaman. */
    await ensureExcelJS();

    const buf = await ciplBukuKerja(row, shipment).xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    /* Nama berkas = nomor invoice APA ADANYA, spasinya ikut
       ("DDI - CRBM - X - 061.xlsx"). Hanya karakter yang dilarang
       sistem berkas diganti tanda hubung (ciplNamaBerkas). */
    tautan.download = `${ciplNamaBerkas(row.doc_number)}.xlsx`;
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);

    showToast(tt(`Berkas Excel ${row.doc_number || ""} diunduh.`, `Excel file ${row.doc_number || ""} downloaded.`), "success");
  } catch (err) {
    console.error(err);
    /* Sebabnya ikut ditulis. Pesan generik menyembunyikan satu-satunya
       petunjuk yang dimiliki pengguna — dan juga yang memperbaikinya. */
    showToast(
      t("x.gagal.menyusun.excel", { err: err && err.message ? err.message : t("s.kesalahan.tidak.diketahui") }),
      "danger",
    );
  } finally {
    /* Dilepas di finally: kalau penyusunan gagal dan bendera tetap
       menyala, tombolnya mati selamanya sampai halaman dimuat ulang. */
    ciplXlsSedangDibuat = false;
    if (tombol) tombol.disabled = false;
  }
}
