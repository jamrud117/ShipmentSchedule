"use strict";

/* CETAK SURAT JALAN

   Menyusun ulang tata letak berkas Excel "SURAT JALAN" sebagai halaman
   HTML yang siap dicetak.

   Datanya datang dari DUA tempat dan disatukan di sini:
     - pengajuan nomor (document_numbers) -> nomor, tanggal, penerima,
       alamat, no. kendaraan, jumlah koli, keterangan
     - jadwal yang ditautkan (shipments)  -> No. Invoice & daftar barang

   Penautannya lewat `payload.shipmentId` yang diisi saat mengajukan
   nomor. Tanpa tautan itu, surat jalannya tetap bisa dicetak — kolom
   barangnya saja yang kosong, dan itu keadaan yang sah (mis. kiriman
   dokumen, bukan barang).
*/

/* Logo diambil dari berkas contoh SURAT JALAN dan ditanam sebagai
   data-URI (4 KB). Ditanam, bukan ditautkan ke berkas, supaya jendela
   cetak tidak perlu memuat apa pun dari jaringan — kalau gambarnya
   belum sampai saat kotak cetak muncul, logonya hilang dari hasil
   cetakan. */
const SJ_LOGO =
  "data:image/png;base64,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";

const SJ_PERUSAHAAN = {
  nama: "PT DYNAMIC DESIGN INDONESIA",
  pusat:
    "Pusat : Jl. Mayjend Sutoyo No. 1 Pabedilan Kulon, Pabedilan, Kabupaten Cirebon",
  cabang: "Cabang: JL. BKR No.27 Pasirluyu, Regol 40254 Kota Bandung",
};

/* Sisa tabel diisi satu ruang kosong setinggi baris yang tersisa,
   supaya blok Total dan tanda tangan selalu jatuh di tempat yang sama
   berapa pun jumlah barangnya. */
const SJ_MIN_BARIS = 10;
const SJ_TINGGI_BARIS = 19;

/* Surat jalan hanya berlaku untuk kiriman EXPORT — bentuk cetaknya
   memang dirancang untuk itu. Yang belum ditautkan jadwal tetap boleh
   dicetak (mis. kiriman dokumen), yang tertaut jadwal IMPORT tidak. */
function sjBolehCetak(row) {
  const id = ((row && row.payload) || {}).shipmentId;
  if (!id) return true;
  const s = sjCariShipment(id);
  return !s || s.mode === "export";
}

function sjCariShipment(id) {
  if (!id) return null;
  return (
    (data.import || []).find((x) => x.id === id) ||
    (data.export || []).find((x) => x.id === id) ||
    null
  );
}

/* Qty & kemasan dijumlahkan per SATUAN, bukan ditotal buta.
   "3 SET" dan "2 BOX" tidak bisa dijumlahkan jadi 5 apa pun. */
function sjTotalPerSatuan(nilaiList) {
  const peta = new Map();
  nilaiList.forEach((v) => {
    const t = String(v || "").trim();
    if (!t) return;
    /* Nilai berbentuk DIMENSI ("82*82*75", "40x30x25") dilewati —
       menjumlahkannya menghasilkan angka tak bermakna.

       Polanya harus ANGKA-pemisah-ANGKA, bukan sekadar mengandung
       huruf x: "1 BOX" juga mengandung x, dan penyaring yang terlalu
       longgar membuat seluruh koli ikut terbuang. */
    if (/\d\s*[*x×]\s*\d/i.test(t)) return;
    const m = t.match(/^([\d.,]+)\s*(.*)$/);
    if (!m) return;
    const angka = Number(m[1].replace(/\./g, "").replace(/,/g, ".")) || 0;
    const satuan = (m[2] || "").trim().toUpperCase();
    peta.set(satuan, (peta.get(satuan) || 0) + angka);
  });
  return Array.from(peta.entries())
    .map(([satuan, jml]) => `${fmtQty(jml)} ${satuan}`.trim())
    .join(" · ");
}

function fmtQty(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/* ------------------------------------------------------------------
   SATU BOX BERISI BEBERAPA BARANG

   Di lapangan, dua atau tiga barang kerap dikemas dalam satu peti.
   Di surat jalan cetak, kolom Package-nya menjadi SATU sel yang
   membentang beberapa baris.

   Cara mencatatnya sengaja dibuat tanpa kolom tambahan: isi kolom
   Koli HANYA pada barang pertama sebuah box; barang berikutnya yang
   Koli-nya dikosongkan dianggap masih di box yang sama.

   Bacaannya sama persis dengan bentuk cetaknya — sel yang kosong di
   layar adalah sel yang menyatu di kertas.

     Koli      Barang
     1 BOX     RUBBER SEAL      ─┐
     (kosong)  DAMPER RUBBER    ─┴─ satu box berisi dua barang
     2 BOX     TYRE MOLD        ─── box terpisah

   Barang PERTAMA selalu memulai box baru walau Koli-nya kosong —
   kalau tidak, tidak ada sel induk untuk ditempeli.
------------------------------------------------------------------ */
function sjKelompokBox(baris) {
  const grup = [];
  baris.forEach((b, i) => {
    const mulaiBaru = i === 0 || String(b.package || "").trim() !== "";
    if (mulaiBaru) grup.push({ package: b.package || "", anggota: [i] });
    else grup[grup.length - 1].anggota.push(i);
  });
  return grup;
}

/* Jenis kemasan cadangan.

   Kalau barang tidak menyebut jenisnya sendiri, dipakai jenis dari
   Total Package pengiriman ("4 BOX" -> "BOX"). Tanpa ini kolom Package
   tercetak berupa angka telanjang, dan "1" tidak menjelaskan apa pun. */
function sjJenisCadangan(shipment) {
  const t = String((shipment && shipment.package) || "").trim();
  const m = t.match(/^[\d.,]+\s*(.+)$/);
  return m ? m[1].trim() : "";
}

function sjBarisBarang(shipment) {
  const items = (shipment && shipment.items) || [];
  const jenisCadangan = sjJenisCadangan(shipment);
  return items
    .filter((it) => (it.namaBarang || "").trim())
    .map((it) => ({
      nama: it.namaBarang,
      qty: [it.qty, it.satuan].filter((v) => v !== "" && v != null).join(" "),
      /* Kolom Package = jumlah + jenis kemasan ("1 BOX"), BUKAN kolom
         `package` yang di buku Export berisi dimensi peti (82*82*75).
         Surat jalan menyebut berapa kemasan yang diserahkan, bukan
         ukurannya. */
      /* Yang menentukan awal kemasan baru adalah JUMLAHNYA. Jenis
         tanpa jumlah ("BOX" saja) tidak bermakna — dan kalau ikut
         dianggap berisi, baris yang seharusnya menyatu ke atas malah
         memulai kemasan sendiri. */
      package: String(it.packing || "").trim()
        ? [it.packing, it.packingUnit || jenisCadangan]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
            .join(" ")
        : "",
    }));
}

/* Satu kotak tanda tangan.

   Kurung hanya dipakai sebagai TEMPAT KOSONG untuk ditulis tangan.
   Begitu namanya sudah diketahui, kurungnya dibuang — "(Yogi
   Firgiawan)" terbaca seolah namanya belum pasti. */
function sjKotakTtd(label, nama) {
  const isi = (nama || "").trim();
  return `
        <td>
          <div class="sj-sign-k">${escapeHtml(label)}</div>
          <div class="sj-sign-v">${
            isi ? escapeHtml(isi) : "(...............................)"
          }</div>
        </td>`;
}

function buildSuratJalanHtml(row, shipment) {
  const p = (row && row.payload) || {};
  const baris = sjBarisBarang(shipment);
  const kosong = Math.max(0, SJ_MIN_BARIS - baris.length);
  // Ruang kosong kini SATU baris, jadi rentang sel Keterangan ikut.
  const totalBaris = baris.length + (kosong ? 1 : 0);

  /* Keterangan: satu sel tinggi membentang seluruh tabel, berisi NOMOR
     KENDARAAN — itu yang tercantum pada contoh berkas ("E 1578 MS").
     Kendaraannya satu untuk seluruh kiriman, jadi memang satu sel. */
  const ket = [p.vehicle, p.notes].map((v) => String(v || "").trim()).filter(Boolean).join(" · ");
  const selKet = `<td class="sj-ket" rowspan="${totalBaris}">${escapeHtml(ket)}</td>`;

  /* Sel Package digambar sekali per BOX, membentang seluruh barang di
     dalamnya. */
  const grup = sjKelompokBox(baris);
  const selPkgUntuk = new Map();
  grup.forEach((g) => {
    selPkgUntuk.set(
      g.anggota[0],
      `<td class="sj-pkg" rowspan="${g.anggota.length}">${escapeHtml(g.package)}</td>`,
    );
  });

  const barisIsi = baris.map(
    (b, i) => `
      <tr>
        <td class="sj-no">${i + 1}</td>
        <td class="sj-nama">${escapeHtml(b.nama)}</td>
        <td class="sj-qty">${escapeHtml(b.qty)}</td>
        ${selPkgUntuk.get(i) || ""}
        ${i === 0 ? selKet : ""}
      </tr>`,
  );
  /* SATU ruang kosong setinggi baris yang tersisa — bukan deretan
     baris bergaris.

     Kolom yang tidak berisi barang tidak digariskan, sama seperti
     Commercial Invoice. Yang dipertahankan cuma garis ATAS-nya:
     itulah penutup baris barang terakhir. */
  const barisKosong = kosong
    ? [
        `<tr class="sj-fill" style="height:${kosong * SJ_TINGGI_BARIS}px">
        <td></td><td></td><td></td><td></td>
        ${baris.length === 0 ? selKet : ""}
      </tr>`,
      ]
    : [];

  const totalQty = sjTotalPerSatuan(baris.map((b) => b.qty));
  /* Dihitung per BOX, bukan per barang — kalau tidak, satu box berisi
     tiga barang akan terhitung tiga kali. */
  const totalPkg = sjTotalPerSatuan(grup.map((g) => g.package));

  return `
  <div class="sj-sheet">
   <div class="sj-box">

    <table class="sj-kop">
      <tr>
        <td class="sj-kop-logo"><img src="${SJ_LOGO}" alt="" /></td>
        <td class="sj-kop-teks">
          <div class="sj-company">${escapeHtml(SJ_PERUSAHAAN.nama)}</div>
          <div class="sj-addr">${escapeHtml(SJ_PERUSAHAAN.pusat)}</div>
          <div class="sj-addr">${escapeHtml(SJ_PERUSAHAAN.cabang)}</div>
        </td>
      </tr>
    </table>

    <div class="sj-title">SURAT JALAN</div>

    <table class="sj-meta">
      <tr>
        <td class="sj-meta-kiri" rowspan="3">
          <div class="sj-kepada">Kepada :</div>
          <div class="sj-to">${escapeHtml(p.receiver || "")}</div>
          <div class="sj-to-addr">${escapeHtml(p.address || "")}</div>
        </td>
        <td class="sj-lbl">Nomor :</td>
        <td class="sj-lbl">Tanggal :</td>
      </tr>
      <tr>
        <td class="sj-val">${escapeHtml(row.doc_number || "")}</td>
        <td class="sj-val">${escapeHtml(fmtDate(row.doc_date))}</td>
      </tr>
      <tr>
        <td class="sj-ref" colspan="2">Ref : ${escapeHtml(
          (shipment && shipment.invoice) || p.reference || "",
        )}</td>
      </tr>
    </table>

    <table class="sj-items">
      <thead>
        <tr>
          <th class="sj-no">No</th>
          <th>Nama Barang / Deskripsi</th>
          <th class="sj-qty">Quantity</th>
          <th class="sj-pkg">Package</th>
          <th class="sj-ket">Keterangan</th>
        </tr>
      </thead>
      <tbody>${barisIsi.concat(barisKosong).join("")}</tbody>
      <tfoot>
        <tr>
          <td class="sj-total-label" colspan="2">Total</td>
          <td class="sj-qty">${escapeHtml(totalQty)}</td>
          <td class="sj-pkg">${escapeHtml(totalPkg)}</td>
          <!-- Sel kelima wajib ada walau kosong: tanpa ini baris Total
               cuma punya empat kolom dari lima, dan sisi kanannya
               kehilangan garis tabel. -->
          <td class="sj-ket"></td>
        </tr>
      </tfoot>
    </table>

    <table class="sj-sign">
      <tr>
        ${sjKotakTtd("Dibuat oleh :", row.requester)}
        ${sjKotakTtd("Mengetahui :")}
        ${sjKotakTtd("Dikirim oleh :")}
        ${sjKotakTtd("Diterima oleh :")}
      </tr>
    </table>

   </div>
  </div>`;
}

/* ------------------------------------------------------------------
   MENCETAK

   Dibuka di jendela terpisah, bukan menyembunyikan halaman utama
   dengan @media print. Alasannya: halaman ini punya bilah menempel,
   panel geser, dan tombol mengambang — menyembunyikan semuanya lewat
   CSS cetak berarti daftar pengecualian yang harus dijaga terus. Satu
   jendela bersih jauh lebih pasti hasilnya.
------------------------------------------------------------------ */
function cetakSuratJalan(rowId) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row) {
    showToast("Data surat jalan tidak ditemukan.", "danger");
    return;
  }
  const shipment = sjCariShipment((row.payload || {}).shipmentId);
  if ((row.payload || {}).shipmentId && !shipment) {
    showToast(
      "Jadwal yang ditautkan tidak ditemukan — daftar barang dikosongkan.",
      "warning",
    );
  }

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast("Jendela cetak diblokir peramban. Izinkan pop-up dulu.", "danger");
    return;
  }
  w.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Surat Jalan ${escapeHtml(row.doc_number || "")}</title>
<style>${suratJalanCss()}</style></head>
<body>${buildSuratJalanHtml(row, shipment)}</body></html>`);
  w.document.close();
  // Menunggu tata letaknya selesai digambar sebelum kotak cetak muncul;
  // tanpa ini sebagian peramban mencetak halaman yang masih kosong.
  w.onload = () => {
    w.focus();
    w.print();
  };
}

function suratJalanCss() {
  return `
  /* margin: 0 menghilangkan kop & kaki bawaan peramban — baris
     "8/2/26 ... about:blank ... 1/1" itu digambar peramban DI DALAM
     margin halaman, jadi ia lenyap sendiri begitu marginnya nol. */
  @page { size: A4; margin: 0; }

  /* SATU NILAI UNTUK SELURUH GARIS.

     Nilainya ditulis di sini dan TIDAK BOLEH mengacu ke --sj-line
     lagi: variabel yang menunjuk dirinya sendiri dianggap tidak sah
     oleh CSS, dan akibatnya bukan garis yang salah tebal melainkan
     SELURUH garis lenyap.

     separate membuat garis tabel tergambar penuh di dalam selnya,
     sama seperti border elemen, sehingga tidak ada yang mendarat di
     tengah piksel lalu terbaca lebih tipis. Konsekuensinya tiap batas
     harus dimiliki SATU sisi saja — di seluruh berkas ini: ATAS dan
     KIRI. */
  :root { --sj-line: 1px solid #000; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Margin "Narrow" — 12,7 mm, sama dengan preset Word/Excel yang
     dipakai orang kantor. Dipasang sebagai padding, bukan @page margin,
     karena @page margin harus tetap 0 supaya kop & kaki bawaan peramban
     tidak ikut tercetak. */
  .sj-sheet { padding: 12.7mm; }
  /* Seluruh isi dikurung satu bingkai, seperti berkas aslinya. */
  .sj-box { border: var(--sj-line); }

  table { border-collapse: separate; border-spacing: 0; width: 100%; }

  .sj-kop td { border-bottom: var(--sj-line); padding: 4px 6px; }
  .sj-kop-logo { width: 74px; vertical-align: middle; text-align: center; }
  .sj-kop-logo img { width: 58px; height: auto; display: inline-block; }
  .sj-kop-teks { text-align: center; padding-right: 74px !important; }
  .sj-company { font-size: 15pt; font-weight: 700; }
  .sj-addr { font-size: 7.5pt; line-height: 1.3; }

  /* TANPA border-bottom. Baris pertama blok meta di bawahnya sudah
     menggambar border-top di batas yang sama — dua pemilik untuk satu
     garis, dan di situ saja tebalnya jadi dua kali lipat. */
  .sj-title {
    text-align: center; font-size: 11pt; font-weight: 700;
    padding: 2px 0;
  }

  /* Blok Kepada / Nomor / Tanggal / Ref — bergaris seperti aslinya. */
  /* Atas+kiri saja. Dengan separate, dua sel bersebelahan yang
     sama-sama menggambar sisi kanan/kiri menghasilkan garis ganda. */
  .sj-meta td { border-top: var(--sj-line); border-left: var(--sj-line);
    padding: 3px 6px; font-size: 9pt; }
  .sj-meta-kiri { width: 55%; vertical-align: top; border-left: 0 !important; }
  .sj-kepada { font-size: 8.5pt; }
  .sj-to { font-weight: 700; font-size: 10pt; margin-top: 2px; }
  .sj-to-addr { font-size: 8.5pt; line-height: 1.35; white-space: pre-line; }
  .sj-lbl { font-size: 8.5pt; text-align: center; }
  .sj-val { text-align: center; font-size: 9pt; }
  .sj-ref { font-size: 9pt; }

  .sj-items { table-layout: fixed; }
  /* Garis bawah blok meta digambar baris judul tabel barang. */
  .sj-items th, .sj-items td {
    border-top: var(--sj-line); border-left: var(--sj-line);
    padding: 2px 5px; font-size: 8.5pt;
    vertical-align: top;
    /* Satu baris untuk semua kolom; overflow: hidden jadi jaring
       pengaman supaya teks yang kepanjangan terpotong rapi alih-alih
       menembus garis ke sel sebelahnya. */
    white-space: nowrap;
    overflow: hidden;
  }
  /* Nama barang SATU-SATUNYA yang boleh turun ke baris berikutnya. */
  .sj-items td.sj-nama {
    white-space: normal;
    word-break: break-word;
    overflow: visible;
  }
  .sj-items th {
    text-align: center; font-weight: 400;
    background: #d9d9d9; font-size: 8.5pt;
  }
  .sj-items tbody td { height: 15px; }
  /* Tepi kiri & kanan diambil alih bingkai kotak. */
  .sj-items tr th:first-child, .sj-items tr td:first-child { border-left: 0; }
  /* Ruang kosong: garis tegaknya tidak digambar, garis atasnya iya. */
  .sj-fill td { border-left: 0; }
  .sj-fill td.sj-ket { border-left: var(--sj-line); }
  .sj-no  { width: 26px; text-align: center; }
  .sj-items td.sj-nama, .sj-items th.sj-nama { text-align: center; }
  .sj-qty { width: 62px; text-align: center; }
  .sj-pkg { width: 62px; text-align: center; }
  /* Kolom Keterangan dilebarkan (96 -> 132px): isinya bisa berupa nomor
     kontainer yang panjang, dan ruangnya diambil dari Nama Barang yang
     memang paling lapang.

     Ditulis td.sj-ket, bukan .sj-ket saja: aturan ".sj-items td" di
     atas ber-kekhususan (0,1,1) dan mengalahkan kelas tunggal (0,1,0),
     sehingga vertical-align: middle tidak pernah berlaku dan isinya
     menempel di atas.

     Tanda petik-balik sengaja TIDAK dipakai di komentar ini — seluruh
     CSS ini berada di dalam template literal, dan satu petik-balik saja
     memotongnya di tengah. */
  .sj-items td.sj-ket,
  .sj-items th.sj-ket {
    width: 132px;
    text-align: center;
    vertical-align: middle;
  }
  /* Baris Total adalah baris TERAKHIR tabel. Di bawah konvensi
     atas+kiri, sisi bawahnya tidak dimiliki siapa pun — tidak ada
     baris berikutnya yang menggambar border-top. Jadi ia menutup
     dirinya sendiri. */
  .sj-items tfoot td { border-bottom: var(--sj-line); }
  .sj-total-label { text-align: center; font-weight: 700; }
  /* Baris Total tetap bergaris penuh — sebelumnya border-bottom
     dimatikan sehingga sisi bawahnya menggantung. */
  .sj-items tfoot td { font-weight: 700; }

  /* Empat kotak tanda tangan, masing-masing berbingkai. */
  .sj-sign { margin: 10px 0; padding: 0 8px; }
  /* Empat kotak berdampingan: tiap sel menggambar atas & kiri, dan
     sel terakhir menutup sisi kanannya karena tidak ada tetangga. */
  .sj-sign td {
    width: 25%;
    border-top: var(--sj-line); border-left: var(--sj-line);
    border-bottom: var(--sj-line);
    padding: 6px 4px 4px;
    text-align: center; font-size: 8pt; color: #333;
    height: 62px; vertical-align: top;
  }
  /* Label & nama sama-sama rata tengah. */
  .sj-sign td:last-child { border-right: var(--sj-line); }
  .sj-sign-k { text-align: center; }
  /* Ruang tanda tangan. 34px terlalu sempit untuk tanda tangan basah
     di atas kertas — nama di bawahnya tertindih. */
  .sj-sign-v { margin-top: 62px; font-size: 8pt; text-align: center; }
  `;
}
