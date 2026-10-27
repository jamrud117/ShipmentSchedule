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
   berapa pun jumlah barangnya.

   Ini tinggi MINIMUM ruang kosong itu. Di jendela cetak, sjIsiKertas()
   melebarkannya lagi sampai kotak surat jalan memenuhi kertas A4. */
const SJ_MIN_BARIS = 10;
const SJ_TINGGI_BARIS = 19;

/* Selisih aman (px) yang SENGAJA disisakan sjIsiKertas() di dasar kotak.
   Tata letak saat diukur (layar jendela cetak) dan saat dicetak bisa
   berselisih beberapa piksel; tanpa sisa, selisih sekecil itu cukup
   untuk mendorong satu halaman kosong di belakang surat jalan. */
const SJ_SISA_AMAN_PX = 4;

/* Nama & alamat penerima dicetak KAPITAL, seragam dengan kotak pihak
   di Commercial Invoice. Yang sudah kapital tidak berubah. */
const sjKapital = (s) => String(s == null ? "" : s).toUpperCase();

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

/* Semua nomor mobil sebuah pengajuan: yang pertama (`vehicle`) lalu yang
   tambahan (`vehicleExtra`, lihat js/features/vehicle-list.js).

   Kiriman export kerap diangkut lebih dari satu mobil. Yang kosong
   dibuang, dan nomor yang sama diketik dua kali dihitung sekali (spasi &
   huruf besar-kecil diabaikan saat membandingkan) -- dua baris
   "B 1234 XY" di surat jalan terbaca seperti dua mobil. Dipakai form
   (saat menyimpan), cetakan, dan detail, supaya ketiganya satu aturan. */
function sjDaftarKendaraan(p) {
  const sumber = p || {};
  const lihat = new Set();
  return []
    .concat(sumber.vehicle || [], sumber.vehicleExtra || [])
    .map((v) => String(v == null ? "" : v).trim())
    .filter((v) => {
      if (!v) return false;
      const kunci = v.replace(/\s+/g, "").toUpperCase();
      if (lihat.has(kunci)) return false;
      lihat.add(kunci);
      return true;
    });
}

/* Qty & kemasan dijumlahkan per SATUAN, bukan ditotal buta.
   "3 SET" dan "2 BOX" tidak bisa dijumlahkan jadi 5 apa pun. */
function sjTotalPerSatuan(nilaiList) {
  const peta = new Map();
  nilaiList.forEach((v) => {
    const teks = String(v || "").trim();
    if (!teks) return;
    /* Nilai berbentuk DIMENSI ("82*82*75", "40x30x25") dilewati —
       menjumlahkannya menghasilkan angka tak bermakna.

       Polanya harus ANGKA-pemisah-ANGKA, bukan sekadar mengandung
       huruf x: "1 BOX" juga mengandung x, dan penyaring yang terlalu
       longgar membuat seluruh koli ikut terbuang. */
    if (/\d\s*[*x×]\s*\d/i.test(teks)) return;
    const m = teks.match(/^([\d.,]+)\s*(.*)$/);
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
  const teks = String((shipment && shipment.package) || "").trim();
  const m = teks.match(/^[\d.,]+\s*(.+)$/);
  return m ? m[1].trim() : "";
}

/* Baris barang untuk surat jalan LOKAL.

   Kiriman lokal tidak punya jadwal maupun CIPL, jadi daftarnya diketik
   sendiri di form (lihat js/features/do-lines.js). Bentuk keluarannya
   dibuat sama persis dengan yang dari jadwal supaya bagian pencetak di
   bawah tidak perlu tahu asal datanya. */
function sjBarisManual(payload) {
  return ((payload && payload.items) || [])
    .filter((it) => String(it.nama || "").trim())
    .map((it) => ({
      nama: it.nama,
      qty: [it.qty, it.satuan].filter((v) => v !== "" && v != null).join(" "),
      /* Kolom Package dikosongkan: daftar manual tidak mencatat jumlah
         kemasan per barang. Keterangan bebasnya dipakai di sana supaya
         ruang itu tidak terbuang. */
      package: String(it.ket || "").trim(),
    }));
}

function sjBarisBarang(shipment) {
  const items = (shipment && shipment.items) || [];
  const jenisCadangan = sjJenisCadangan(shipment);
  return items
    .filter((it) => (it.namaBarang || "").trim())
    .map((it) => ({
      nama: itemDisplayName(it),
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

/* SARAN NAMA PENANDA TANGAN (Mengetahui / Dikirim oleh / Diterima oleh):
   nama yang pernah dipakai di surat jalan yang sudah termuat, ditambah
   daftar Pemohon. Disusun saat kotaknya difokus -- bukan tiap riwayat
   digambar. */
const SJ_KOLOM_TTD = ["knownBy", "sentBy", "receivedBy"];
function sjIsiSaranTtd() {
  const daftar = document.getElementById("dnTtdList");
  if (!daftar) return;
  const nama = new Set();
  (typeof docNumHistoryRows !== "undefined" ? docNumHistoryRows : []).forEach((r) => {
    const p = (r && r.payload) || {};
    SJ_KOLOM_TTD.forEach((k) => p[k] && nama.add(String(p[k]).trim()));
  });
  document.querySelectorAll('[data-docnum-panel="do"] [data-dn="requester"] option').forEach((o) => o.value && nama.add(o.value));
  daftar.innerHTML = [...nama]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${escapeAttr(n)}"></option>`)
    .join("");
}
document.addEventListener("focusin", (e) => {
  if (e.target.matches && e.target.matches('input[list="dnTtdList"]')) sjIsiSaranTtd();
});

/* Sel NOPOL: satu sel yang membentang `rentang` baris, di sebelah barang.

   Isinya satu kotak per mobil, tingginya DIBAGI RATA sehingga seluruh
   kotak persis setinggi baris barang di sampingnya. Pembagian rata
   dikerjakan CSS (kolom flex di atas sel, tiap kotak flex: 1), bukan
   dihitung di sini -- tinggi baris barang baru diketahui peramban
   sesudah nama barangnya membungkus, dan tidak sama untuk tiap surat.

   Tanpa mobil tetap ada SATU kotak kosong: tempat menulis nomor mobil
   dengan tangan. Tanpa baris sama sekali tidak ada sel (mengembalikan
   string kosong). */
function sjSelNopol(mobil, rentang) {
  if (!(rentang > 0)) return "";
  const isi = (mobil.length ? mobil : [""])
    .map((v) => `<div class="sj-nopol-sel">${escapeHtml(v)}</div>`)
    .join("");
  return `<td class="sj-nopol" rowspan="${rentang}"><div class="sj-nopol-bagi">${isi}</div></td>`;
}

function buildSuratJalanHtml(row, shipment) {
  const p = (row && row.payload) || {};
  /* Sumber daftar barang: jadwal kalau ada yang ditautkan (Export),
     ketikan sendiri kalau tidak (Lokal). Dipilih di SATU tempat supaya
     bagian pencetak di bawah tidak perlu tahu asalnya. */
  const baris = shipment
    ? sjBarisBarang(shipment)
    : sjBarisManual(row.payload);
  const kosong = Math.max(0, SJ_MIN_BARIS - baris.length);

  /* NOPOL: kolom di SAMPING baris barang, tidak ditarik sampai Total.

     Rentangnya sebanyak baris barang (bukan baris barang + ruang kosong),
     jadi di bawah barang terakhir kolom ini terbuka seperti kolom lain.
     Mobil yang lebih banyak daripada barang menambah baris pelengkap
     kosong -- tiap mobil butuh tinggi minimum supaya nomornya terbaca. */
  const mobil = sjDaftarKendaraan(p);
  const jumlahBarisNopol = Math.max(baris.length, mobil.length);
  const selNopol = sjSelNopol(mobil, jumlahBarisNopol);
  const barisPelengkap = Array.from(
    { length: Math.max(0, mobil.length - baris.length) },
    (_, k) => `
      <tr class="sj-pelengkap">
        <td class="sj-no">&nbsp;</td>
        <td class="sj-nama"></td>
        <td class="sj-qty"></td>
        <td class="sj-pkg"></td>
        ${baris.length === 0 && k === 0 ? selNopol : ""}
      </tr>`,
  );

  /* Catatan bebas (payload.notes) dulu menumpang di sel Keterangan. Kolom
     itu kini milik Nopol, jadi catatannya dipindah ke ruang kosong di
     bawah barang. Formulir DO sendiri tidak punya isian catatan; ini
     hanya agar data lama yang memilikinya tidak ikut hilang. */
  const catatan = String(p.notes || "").trim();
  const selCatatan = catatan
    ? `<td class="sj-catatan">Catatan : ${escapeHtml(catatan)}</td>`
    : "<td></td>";

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
        ${i === 0 ? selNopol : ""}
      </tr>`,
  );
  /* SATU ruang kosong setinggi baris yang tersisa — bukan deretan
     baris bergaris. SELALU ada, juga untuk 10 barang ke atas: dialah
     yang dilebarkan sjIsiKertas() supaya tabel memenuhi kertas.

     Kolom yang tidak berisi barang tidak digariskan, sama seperti
     Commercial Invoice. Yang dipertahankan cuma garis ATAS-nya:
     itulah penutup baris barang terakhir. Sel kelimanya (kolom Nopol)
     wajib ada walau kosong: garis atasnya menutup sisi bawah sel Nopol
     di atasnya, dan di bawah itu kolomnya terbuka. */
  const barisKosong = [
    `<tr class="sj-fill" style="height:${kosong * SJ_TINGGI_BARIS}px">
        <td></td>${selCatatan}<td></td><td></td><td></td>
      </tr>`,
  ];

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
          <!-- KEPADA / nama / garis / ALAMAT PENERIMA / alamat: label
               kecil di atas isinya, supaya jelas siapa yang dituju dan
               ke mana barangnya dikirim. -->
          <div class="sj-kepada">KEPADA</div>
          <div class="sj-to">${escapeHtml(sjKapital(p.receiver))}</div>
          <div class="sj-garis"></div>
          <div class="sj-alamat-k">ALAMAT PENERIMA</div>
          <div class="sj-to-addr">${escapeHtml(sjKapital(p.address))}</div>
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
          <th class="sj-nopol">Nopol</th>
        </tr>
      </thead>
      <tbody>${barisIsi.concat(barisPelengkap, barisKosong).join("")}</tbody>
      <tfoot>
        <tr>
          <td class="sj-total-label" colspan="2">Total</td>
          <td class="sj-qty">${escapeHtml(totalQty)}</td>
          <td class="sj-pkg">${escapeHtml(totalPkg)}</td>
          <!-- Sel kelima wajib ada walau kosong: tanpa ini baris Total
               cuma punya empat kolom dari lima, dan sisi kanannya
               kehilangan garis tabel. -->
          <td></td>
        </tr>
      </tfoot>
    </table>

    <table class="sj-sign">
      <tr>
        ${sjKotakTtd("Dibuat oleh :", row.requester)}
        ${sjKotakTtd("Mengetahui :", p.knownBy)}
        ${sjKotakTtd("Dikirim oleh :", p.sentBy)}
        ${sjKotakTtd("Diterima oleh :", p.receivedBy)}
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
    showToast(t("m.data.surat.jalan.tidak.ditemukan"), "danger");
    return;
  }
  /* LEMBAR LOKAL PUNYA TEMPLAT SENDIRI.

     Bentuknya berbeda menyeluruh dari surat jalan Export -- kop
     berlogo, dua kotak alamat, tabel bergaris jingga. Percabangan
     ditaruh di SINI, di satu titik masuk, supaya kedua templat tidak
     saling mengetahui isi satu sama lain. */
  const lokal =
    (row.payload || {}).doKind === "Lokal" ||
    String(row.doc_type || "") === "do_lokal";

  const shipment = lokal ? null : sjCariShipment((row.payload || {}).shipmentId);
  if (!lokal && (row.payload || {}).shipmentId && !shipment) {
    showToast(t("m.jadwal.yang.ditautkan.tidak.ditemukan.daftar.b"),
      "warning",
    );
  }

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger", { judul: tt("Pop-up diblokir", "Pop-up blocked"), tetap: true });
    return;
  }
  const gaya = lokal ? suratJalanLokalCss() : suratJalanCss();
  const isi = lokal
    ? buildSuratJalanLokalHtml(row)
    : buildSuratJalanHtml(row, shipment);
  w.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Surat Jalan ${escapeHtml(row.doc_number || "")}</title>
<style>${gaya}</style></head>
<body>${isi}</body></html>`);
  w.document.close();
  // Menunggu tata letaknya selesai digambar sebelum kotak cetak muncul;
  // tanpa ini sebagian peramban mencetak halaman yang masih kosong.
  w.onload = () => {
    /* Surat jalan memenuhi kertas A4: ruang kosong tabel dilebarkan
       (Export) / baris kosong ditambah (Lokal) sampai tanda tangan jatuh
       di dasar halaman. Harus SESUDAH tata letak jadi -- ia mengukur. */
    if (lokal) sjlIsiKertas(w.document);
    else sjIsiKertas(w.document);
    w.focus();
    w.print();
  };
}

/* SURAT JALAN EXPORT MEMENUHI KERTAS A4.

   Kotak surat jalan sudah dipatok setinggi kertas (min-height di CSS),
   tapi tanpa ini isinya berhenti di tanda tangan dan sisa kotaknya
   kosong. Yang dilakukan di sini: mengukur jarak antara tanda tangan dan
   dasar kotak, lalu menambahkannya ke ruang kosong tabel barang. Hasilnya
   daftar barang di atas, ruang lega di tengah, Total dan tanda tangan di
   dasar halaman -- seperti lembar Excel aslinya.

   Diukur, bukan dihitung dari jumlah baris: nama barang yang membungkus
   atau nomor mobil yang banyak membuat tinggi tabel berbeda-beda, dan
   tinggi yang salah berarti satu halaman kosong di belakangnya atau
   tanda tangan yang tidak menempel ke dasar.

   SJ_SISA_AMAN_PX sengaja disisakan, dan pelebaran yang kelewat ditarik
   kembali. Kalau tidak ada ruang kosongnya atau sudah penuh, tidak ada
   yang diubah. Mengembalikan jumlah piksel yang ditambahkan. */
function sjIsiKertas(dok) {
  const d = dok || document;
  const kotak = d.querySelector(".sj-box");
  const isi = d.querySelector(".sj-fill");
  const ttd = d.querySelector(".sj-sign");
  if (!kotak || !isi || !ttd) return 0;
  const jendela = d.defaultView || window;
  const angka = (v) => parseFloat(v) || 0;
  // Jarak (px) dari bawah tanda tangan (termasuk jaraknya sendiri) ke dasar kotak.
  const sisa = () => {
    const gk = jendela.getComputedStyle(kotak);
    const dasar =
      kotak.getBoundingClientRect().bottom -
      angka(gk.borderBottomWidth) -
      angka(gk.paddingBottom);
    return (
      dasar -
      (ttd.getBoundingClientRect().bottom +
        angka(jendela.getComputedStyle(ttd).marginBottom))
    );
  };
  const tambah = Math.floor(sisa() - SJ_SISA_AMAN_PX);
  if (!(tambah > 0)) return 0;
  const semula = isi.getBoundingClientRect().height;
  isi.style.height = semula + tambah + "px";
  // Tabel kadang membulatkan tinggi barisnya; yang melewati batas aman ditarik kembali.
  const lebih = SJ_SISA_AMAN_PX - sisa();
  if (lebih > 0) {
    isi.style.height = Math.max(semula, semula + tambah - Math.ceil(lebih)) + "px";
  }
  return tambah;
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
    /* Ukuran huruf persis seperti yang ditulis di sini. Tanpa ini peramban
       ponsel (iOS) membesarkan sebagian teks sendiri, tiap blok berbeda
       banyaknya -- tampilan jadi tidak sama dengan yang tercetak, dan
       pengukur tinggi di sjIsiKertas() mengukur tata letak yang salah. */
    -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
  }
  /* Margin "Narrow" — 12,7 mm, sama dengan preset Word/Excel yang
     dipakai orang kantor. Dipasang sebagai padding, bukan @page margin,
     karena @page margin harus tetap 0 supaya kop & kaki bawaan peramban
     tidak ikut tercetak.

     LEBARNYA DIPATOK selebar kertas A4 (210 mm), bukan selebar jendela:
     di layar dan di kertas tata letaknya jadi SAMA, dan pengukur tinggi
     di sjIsiKertas() mengukur apa yang benar-benar tercetak. */
  .sj-sheet { width: 210mm; padding: 12.7mm; }
  /* Seluruh isi dikurung satu bingkai, seperti berkas aslinya.

     DASAR BINGKAI = DASAR KERTAS: tinggi minimumnya kertas A4 (297 mm)
     dikurangi padding atas + bawah .sj-sheet (2 x 12,7 mm) dan 2px
     selisih aman. Angka 25.4mm HARUS ikut kalau padding di atas diubah
     -- bingkai yang lebih tinggi dari sisa kertas mendorong satu halaman
     kosong di belakangnya; yang lebih rendah menyisakan kertas kosong. */
  .sj-box { border: var(--sj-line); min-height: calc(297mm - 25.4mm - 2px); }

  table { border-collapse: separate; border-spacing: 0; width: 100%; }

  .sj-kop td { border-bottom: var(--sj-line); padding: 4px 6px; }
  /* LOGO DIPERBESAR — 58px -> 72px.

     Tiga angka ini HARUS bergerak bersama:
       - lebar sel logo
       - lebar gambarnya
       - padding kanan sel teks

     Yang terakhir sering terlupa. Nama perusahaan dipusatkan pada sel
     di sebelah kanan logo; padding kanan itulah yang menyeimbangkannya
     supaya terlihat di tengah HALAMAN, bukan di tengah selnya sendiri.
     Kalau logonya diperbesar tanpa paddingnya ikut, judulnya bergeser
     ke kiri — halus, dan justru karena halus tidak ada yang menyadari.

     Selnya 88px dengan padding 6px di kiri-kanan, jadi ruang isinya
     76px: gambar 72px masih menyisakan 4px dan tidak menyentuh garis
     bawah kop. Ada ujinya. */
  .sj-kop-logo { width: 88px; vertical-align: middle; text-align: center; }
  .sj-kop-logo img { width: 72px; height: auto; display: inline-block; }
  .sj-kop-teks { text-align: center; padding-right: 88px !important; }
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
  /* Blok penerima: label kecil abu-abu (KEPADA, ALAMAT PENERIMA) di atas
     isinya -- nama tebal, garis tipis, lalu alamat -- supaya jelas siapa
     yang dituju dan ke mana. Garis tipisnya latar setinggi 1px, bukan
     border: semua border surat jalan lewat satu variabel (--sj-line). */
  /* Seluruh blok Kepada diperkecil supaya tidak padat: label 7pt -> 6pt,
     nama 10pt -> 9pt (tetap tebal), alamat 7.5pt -> 6.5pt. Jarak di
     sekitar garis pemisah dan antarbaris alamat dilonggarkan sedikit --
     alamat tiga baris yang panjang sebelumnya membuat kotak ini penuh
     dan ikut menarik tinggi baris Nomor/Tanggal/Ref di sebelahnya. */
  .sj-kepada, .sj-alamat-k { font-size: 6pt; letter-spacing: .5px; color: #555; }
  .sj-to { font-weight: 700; font-size: 9pt; margin-top: 2px; }
  .sj-garis { height: 1px; background: #999; margin: 5px 0 4px; }
  .sj-to-addr { font-size: 6.5pt; line-height: 1.35; white-space: pre-line; margin-top: 1px; }
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
  /* Ruang kosong: garis tegaknya tidak digambar, garis atasnya iya --
     juga di kolom Nopol, jadi kolom itu berhenti di barang terakhir dan
     terbuka di bawahnya. */
  .sj-fill td { border-left: 0; }
  /* Ruang kosong dilebarkan sjIsiKertas() lewat tinggi barisnya; tanpa
     padding, yang tersisa kalau kertas sudah penuh hanya garisnya. */
  .sj-fill td { padding-top: 0; padding-bottom: 0; }
  /* Catatan bebas (kalau ada) di sudut kiri atas ruang kosong. Ditulis
     td.sj-catatan supaya mengalahkan aturan ".sj-fill td" di atas. */
  .sj-items td.sj-catatan {
    text-align: left; vertical-align: top;
    white-space: normal; word-break: break-word; overflow: visible;
    padding: 6px 8px 0; font-size: 7.5pt; color: #333;
  }
  .sj-no  { width: 26px; text-align: center; }
  .sj-qty { width: 62px; text-align: center; }
  .sj-pkg { width: 62px; text-align: center; }
  /* ISI BARIS DATA rata tengah HORIZONTAL dan VERTIKAL di semua kolom:
     No, Nama Barang, Quantity, Package (Nopol punya aturan sendiri di
     bawah). Nama barang yang membungkus membuat barisnya lebih tinggi --
     tanpa ini nomor dan jumlahnya menempel di atas baris setinggi itu --
     dan sel kemasan yang membentang beberapa baris (satu box berisi tiga
     barang) jadi tepat di tengah rentangnya.

     Ditulis td.sj-xxx, bukan .sj-xxx saja: aturan ".sj-items td" di atas
     ber-kekhususan (0,1,1) dan mengalahkan kelas tunggal (0,1,0), jadi
     vertical-align: middle tidak akan pernah berlaku. */
  .sj-items td.sj-no,
  .sj-items td.sj-nama,
  .sj-items td.sj-qty,
  .sj-items td.sj-pkg { text-align: center; vertical-align: middle; }
  /* KOLOM NOPOL. Lebarnya tetap 132px (dulu kolom Keterangan).

     Ditulis td.sj-nopol, bukan .sj-nopol saja: aturan ".sj-items td" di
     atas ber-kekhususan (0,1,1) dan mengalahkan kelas tunggal (0,1,0),
     sehingga padding: 0 di bawah tidak pernah berlaku.

     Selnya membentang sebanyak baris barang. Isinya satu kotak per
     mobil di dalam kolom flex yang menutupi seluruh sel (position:
     absolute, keempat sisi 0), tiap kotak flex: 1 -- jadi tingginya
     DIBAGI RATA, berapa pun tinggi baris barang di sampingnya dan berapa
     pun jumlah mobilnya. Dipilih daripada height: 100% di dalam sel
     tabel, yang hasilnya berbeda antarmesin peramban. Sel ini yang
     menjadi acuan penempatannya, makanya position: relative.

     Garis antarkotak hanya sisi ATAS kotak kedua dan seterusnya; garis
     atas kotak pertama milik selnya sendiri, dan garis bawah kotak
     terakhir milik sel kelima baris ruang kosong di bawahnya.

     Tanda petik-balik sengaja TIDAK dipakai di komentar ini — seluruh
     CSS ini berada di dalam template literal, dan satu petik-balik saja
     memotongnya di tengah. */
  .sj-items td.sj-nopol,
  .sj-items th.sj-nopol {
    width: 132px;
    text-align: center;
    vertical-align: middle;
  }
  .sj-items td.sj-nopol { position: relative; padding: 0; }
  .sj-nopol-bagi {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    display: flex; flex-direction: column;
  }
  .sj-nopol-sel {
    flex: 1 1 0; min-height: 0;
    display: flex; align-items: center; justify-content: center;
    white-space: nowrap; overflow: hidden;
  }
  .sj-nopol-sel + .sj-nopol-sel { border-top: var(--sj-line); }
  /* Baris Total adalah baris TERAKHIR tabel. Di bawah konvensi
     atas+kiri, sisi bawahnya tidak dimiliki siapa pun — tidak ada
     baris berikutnya yang menggambar border-top. Jadi ia menutup
     dirinya sendiri. */
  .sj-items tfoot td { border-bottom: var(--sj-line); }
  .sj-total-label { text-align: center; font-weight: 700; }
  /* Baris Total tetap bergaris penuh — mematikan border-bottom-nya
     membuat sisi bawahnya menggantung. */
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
