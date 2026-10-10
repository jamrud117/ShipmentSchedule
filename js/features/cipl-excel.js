"use strict";

/* UNDUH CIPL SEBAGAI EXCEL

   Dynamic Design (CI, PL, SI): kisi rapi yang mudah disunting
   (cipl-excel-rapi.js) -- tampilannya mengikuti cetakan, datanya dari
   pembangun yang sama (ciplRefBaris, ciplDdRincianData, ciplFormat*).
   Kumho: penyusunnya sendiri (cipl-vn-excel.js), meniru berkas rujukan
   pembeli; pembantu tinggi & skala halaman di bawah dipakai bersama.
*/

function ciplXlsTanggal(iso) {
  const d = parseLocalDate(iso);
  if (!d) return "";
  /* TENGAH MALAM UTC, BUKAN TENGAH MALAM SETEMPAT.

     ExcelJS mengubah objek Date jadi nomor seri Excel memakai jamnya
     dalam UTC. parseLocalDate mengembalikan tengah malam waktu
     setempat — di WIB (UTC+7) itu berarti pukul 17.00 UTC pada HARI
     SEBELUMNYA. Sel yang formatnya hanya tanggal lalu menampilkan
     tanggal yang mundur satu hari:

       yang dipilih di aplikasi   12 Aug 2026
       yang tercetak di Excel     11 Aug 2026

     Ini bukan soal tampilan: yang mundur adalah Tanggal Invoice pada
     dokumen yang dikirim ke forwarder dan bea cukai negara tujuan.

     Disusun ulang dari komponen tanggalnya — bukan digeser sekian jam
     — supaya benar juga di zona waktu mana pun berkas ini dibuat. */
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/* ------------------------------------------------------------------
   LEMBAR SETINGGI KERTAS A4 -- dipakai Excel Kumho.

   fitToPage hanya MEMPERKECIL; Excel tidak pernah memperbesar isi untuk
   memenuhi kertas. Lembar yang lebih pendek daripada rasio bidang
   cetaknya tercetak selebar kertas tapi berhenti di tengah, menyisakan
   kaki kertas kosong. Jarak ke tepi bawah baru sama dengan ke tepi atas
   kalau tinggi isinya PAS dengan skala yang dipakai.

   Skala itu ditentukan lebar: lebar bidang cetak / lebar kolom.
   Tinggi isi yang dibutuhkan = tinggi bidang cetak / skala. Kekurangannya
   ditambahkan ke SATU baris kosong di atas Total -- bidang barang yang
   kosong memanjang, persis seperti lembar cetaknya.

   LEBAR KOLOM SAAT DICETAK = lebar (satuan karakter) x lebar angka
   huruf Normal yang SEBENARNYA. Bukan rumus layar Excel (7 px bulat
   per angka Calibri 11): saat mencetak, lebar huruf dipakai tanpa
   dibulatkan. Angka Calibri (dan Carlito, kembarannya) selebar
   1038/2048 em = 7,4336 px pada 11pt -- 6% lebih lebar daripada 7 px.
   Dengan 7 px, lembarnya dikira muat pada skala 87%, padahal dicetak
   82%, dan kaki kertasnya tetap kosong 2 cm. Diperiksa terhadap PDF
   hasil cetak: skala yang diramalkan 0,8226, yang terukur 0,822.

   Kurang 0,25% sebagai pengaman: sedikit lebih pendek menyisakan jarak
   bawah beberapa persepuluh milimeter lebih lebar; sedikit lebih tinggi
   membuat fitToPage memperkecil SELURUH lembar, termasuk lebarnya.

   Bidang cetak berakhir TEPAT di garis bawah bingkai (dulu satu baris
   kosong di bawahnya ikut tercetak, warisan berkas rujukan) -- seperti
   tepi atasnya yang juga garis bingkai di baris 1. */
const XLS_A4_PT = { w: 595.28, h: 841.89 };

/* LEBAR KOLOM TIDAK SAMA DI SEMUA APLIKASI -- jadi lembarnya dibuat
   PAS TINGGI, bukan pas lebar.

   Lebar kolom Excel ditulis dalam "karakter", dan tiap aplikasi
   mengubahnya ke milimeter dengan ukuran hurufnya sendiri. Hitungan di
   bawah cocok dengan LibreOffice (diukur), tapi pada cetakan pengguna
   kolomnya ~15% lebih lebar: skala cetaknya 13% lebih kecil, dan kaki
   kertas kosong ~3 cm -- "belum full".

   Karena itu tinggi lembar dihitung untuk kolom yang 15% lebih lebar
   daripada hitungan. fitToPage memakai yang lebih kecil dari skala-pas-
   lebar dan skala-pas-tinggi, jadi di aplikasi mana pun yang kolomnya
   tidak lebih lebar dari itu, yang menentukan adalah TINGGI: lembarnya
   selalu penuh dari margin atas sampai margin bawah. Di aplikasi yang
   kolomnya sempit, sisi kiri-kanan sedikit lebih lega (rata tengah),
   bukan kaki kertas yang kosong. Kotak tanda tangan memakai skala yang
   sama, jadi tetap 50 mm di kertas. */
const XLS_FAKTOR_LEBAR = 1.15;
const XLS_LEBAR_HURUF_PX = (1038 / 2048) * 11 * (96 / 72); // 7,4336

function ciplXlsKolomPt(lebar) {
  const w = lebar == null ? 8.43 : lebar;
  return w * XLS_LEBAR_HURUF_PX * 0.75;
}

/* KOTAK TANDA TANGAN MUAT STEMPEL PERUSAHAAN.

   Stempel perusahaan umumnya bundar 40-45 mm dan tanda tangannya
   menimpa stempel itu; kotak setinggi 50 mm DI KERTAS memberi ruang
   untuk keduanya. Dipakai Excel Dynamic Design & Kumho, dan sama
   dengan lembar cetaknya (CIPL_TTD_MM di cipl-print.js).

   Tinggi di kertas = tinggi baris x skala cetak, dan skalanya
   ditentukan lebar kolom -- jadi tinggi baris dihitung dari skala itu,
   bukan dipatok dalam poin. Dipanggil SEBELUM ciplXlsPenuhiHalaman(),
   supaya bidang barang yang kosong ikut menyusut sebanyak kotak ini
   bertambah dan lembarnya tetap setinggi kertas. */
const XLS_TTD_MM = 50;

function ciplXlsSkalaCetak(ws) {
  const m = /^\$?([A-Z]+)\$?\d+:\$?([A-Z]+)\$?\d+$/.exec(String(ws.pageSetup.printArea || ""));
  if (!m) return 1;
  const nomorKolom = (s) => s.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  let lebar = 0;
  for (let c = nomorKolom(m[1]); c <= nomorKolom(m[2]); c++) lebar += ciplXlsKolomPt(ws.getColumn(c).width);
  const mg = ws.pageSetup.margins || XLS_MARGIN_NARROW;
  return Math.min(1, (XLS_A4_PT.w - (mg.left + mg.right) * 72) / (lebar * XLS_FAKTOR_LEBAR));
}

/* Baris r1..r2 dibagi rata sampai kotaknya setinggi `mm` di kertas. */
function ciplXlsTinggiTercetak(ws, r1, r2, mm) {
  const total = ((mm / 25.4) * 72) / ciplXlsSkalaCetak(ws);
  const tiap = Math.round((total / (r2 - r1 + 1)) * 100) / 100;
  for (let r = r1; r <= r2; r++) ws.getRow(r).height = tiap;
}

function ciplXlsPenuhiHalaman(ws, barisPengisi) {
  const m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(String(ws.pageSetup.printArea || ""));
  if (!m || !barisPengisi) return 0;
  const nomorKolom = (s) => s.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const tinggiBaku = (ws.properties && ws.properties.defaultRowHeight) || 15;
  /* TINGGI SETIAP BARIS DITULIS EKSPLISIT. Baris tanpa tinggi tertulis
     digambar Excel setinggi bawaan (15pt), tapi LibreOffice, Google
     Sheets, dan WPS menyesuaikannya dengan hurufnya sendiri -- lembar
     Dynamic Design punya 48 baris seperti itu, dan di aplikasi-aplikasi
     itu kaki lembarnya naik 20 mm dari hitungan. Di Excel tidak ada yang
     berubah: nilainya sama dengan yang sudah dipakainya. */
  for (let r = Number(m[2]); r <= Number(m[4]); r++) {
    const b = ws.getRow(r);
    if (b.height == null) b.height = tinggiBaku;
  }
  const tinggiBaris = (r) => ws.getRow(r).height || tinggiBaku;
  let lebar = 0;
  for (let c = nomorKolom(m[1]); c <= nomorKolom(m[3]); c++) lebar += ciplXlsKolomPt(ws.getColumn(c).width);
  let tinggi = 0;
  for (let r = Number(m[2]); r <= Number(m[4]); r++) tinggi += tinggiBaris(r);
  const mg = ws.pageSetup.margins || XLS_MARGIN_NARROW;
  const bidangW = XLS_A4_PT.w - (mg.left + mg.right) * 72;
  const bidangH = XLS_A4_PT.h - (mg.top + mg.bottom) * 72;
  const skala = Math.min(1, bidangW / (lebar * XLS_FAKTOR_LEBAR));
  const kurang = (bidangH / skala) * 0.9975 - tinggi;
  if (kurang <= 0) return 0;
  const baris = ws.getRow(barisPengisi);
  baris.height = Math.round((tinggiBaris(barisPengisi) + kurang) * 100) / 100;
  return kurang;
}

/* PENGATURAN CETAK — diambil dari berkas rujukan.

   Skalanya ditulis apa adanya (80% untuk Invoice, 67% untuk SI), bukan
   fitToPage. Keduanya sama-sama memuatkan halaman, tapi fitToPage
   menyerahkan angkanya ke Excel dan hasilnya bergeser mengikuti
   pengandar pencetak yang sedang terpasang. */
/* MARGIN "NARROW" — sama persis dengan preset bawaan Excel.

   Angkanya dalam INCI, karena begitulah Excel menyimpan margin. Preset
   Narrow: kiri & kanan 0,25"; atas & bawah 0,75"; header & footer 0,3".

   Dipakai ketiga lembar, supaya Invoice, Packing List, dan Shipping
   Instruction jatuh di area yang sama pada kertas. Margin per-lembar
   yang berbeda-beda (0,3 / 0,7 / 0,7 di kiri) adalah warisan dari berkas yang
   disetel satu per satu oleh tangan.

   CATATAN. Ini MENYIMPANG dari berkas rujukan DDI-CRBM-VIII-045 —
   margin justru satu-satunya hal yang sudah sama persis di sana.
   Diubah atas permintaan; kalau suatu saat ingin kembali menyamai
   rujukan, angka lamanya: INVOICE 0,3/0,3/0,4/0,4/0/0 · PL
   0,7/0,3/0,75/0,75/0,3/0,3 · SI 0,7/0,7/0,75/0,75/0,3/0,3. */
const XLS_MARGIN_NARROW = {
  left: 0.25,
  right: 0.25,
  top: 0.75,
  bottom: 0.75,
  header: 0.3,
  footer: 0.3,
};

/* Satu unduhan pada satu waktu.

   Menyusun tiga lembar butuh waktu; klik kedua sebelum yang pertama
   selesai menjalankan dua penyusunan sekaligus, dan keduanya
   memicu unduhan — pengguna mendapat dua berkas identik dan tidak
   tahu mana yang benar. */
let ciplXlsSedangDibuat = false;

function ciplNamaBerkas(nomor) {
  return String(nomor || "CIPL").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "CIPL";
}

async function unduhCiplExcel(rowId) {
  if (ciplXlsSedangDibuat) return;

  const row = ciplCariBarisRiwayat(rowId);
  if (!row) return;
  const shipment = ciplCariShipment((row.payload || {}).shipmentId);
  const baris = ciplBarisBarang(shipment);

  ciplXlsSedangDibuat = true;
  const tombol = document.querySelector(`[data-xls-cipl="${rowId}"]`);
  if (tombol) tombol.disabled = true;
  try {
    /* ExcelJS DIMUAT SESUAI KEBUTUHAN, bukan ikut di halaman.

       Bulk Export memanggil ensureExcelJS() lebih dulu, jadi di sana
       pustakanya selalu siap. Fungsi ini langsung memakai ExcelJS —
       dan gagal pada klik pertama di sesi yang belum pernah membuka
       Bulk Export. */
    await ensureExcelJS();

    const wb = new ExcelJS.Workbook();
    wb.creator = "EXIM DDI";
    wb.created = new Date();
    /* Bentuk berkas mengikuti PROFIL PEMBELI, sama seperti lembar
       cetaknya. Percabangan di satu titik ini saja -- kedua penyusun
       tidak perlu tahu keberadaan satu sama lain. */
    const prof = ciplProfil((row.payload || {}).customer || (shipment && shipment.party));
    if (prof.layout === "vn" && typeof ciplVnExcelInvoice === "function") {
      ciplVnExcelInvoice(wb, row, shipment);
      ciplVnExcelPacking(wb, row, shipment);
    } else {
      // CI, PL, SI dengan kisi rapi yang mudah disunting (cipl-excel-rapi.js)
      ciplXlsRapi(wb, row, shipment, baris);
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    /* Nama berkas = nomor invoice APA ADANYA, spasinya ikut
       ("DDI - CRBM - X - 061.xlsx"). Hanya karakter yang dilarang
       sistem berkas diganti tanda hubung (ciplNamaBerkas). */
    const namaBerkas = ciplNamaBerkas(row.doc_number);
    tautan.download = `${namaBerkas}.xlsx`;
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);

    showToast(`Berkas Excel ${row.doc_number || ""} diunduh.`, "success");
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
