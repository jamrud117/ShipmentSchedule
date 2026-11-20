"use strict";

/* TERAPKAN HASIL PARSE KE FORM */

const IMPORT_SOURCE_PRIORITY = {
  "pdf": 30, // PIB BC 2.0
  "pdf-peb": 30, // PEB BC 3.0
  /* Draft CEISA (HEADER/BARANG/ENTITAS/DOKUMEN). Kuncinya "excel" --
     nama sumber yang memang dikembalikan parseBcExcelWorkbook(). Dulu
     tertulis "excel-bc", tidak pernah cocok, dan draft CEISA jatuh ke
     prioritas bawaan 15. */
  "excel": 20,
  "cipl": 10, // CIPL Excel
  "cipl-pdf": 10, // CIPL PDF (CI+PL 1 file)
  "cipl-pdf-ci": 10,
  "cipl-pdf-pl": 10,
};

let importFieldOrigin = {};

function resetImportFieldOrigins() {
  importFieldOrigin = {};
}

function sourcePriority(source) {
  return IMPORT_SOURCE_PRIORITY[source] != null
    ? IMPORT_SOURCE_PRIORITY[source]
    : 15;
}

/* SUMBER YANG DIPEGANG UNTUK SATU ISIAN, di atas urutan prioritas umum.

   Nama & nomor sarana angkut diambil dari draft CEISA, sheet
   PENGANGKUT (NAMA PENGANGKUT & NOMOR PENGANGKUT), untuk buku Import
   maupun Export. Isiannya MENIMPA yang sudah ada -- ketikan, CIPL
   ("Vessel/Flight" yang kerap menggabungkan keduanya), maupun PDF --
   dan tidak tertimpa sumber lain yang diimpor sesudahnya. Kalau
   sheet-nya kosong, isian lama tetap. */
const SUMBER_UTAMA_ISIAN = {
  fVessel: "excel",
  fVoyage: "excel",
};
const PRIORITAS_SUMBER_UTAMA = 100;

function prioritasIsian(id, source) {
  return SUMBER_UTAMA_ISIAN[id] === source ? PRIORITAS_SUMBER_UTAMA : sourcePriority(source);
}

// Field mana yang BOLEH diisi oleh sumber ini
const CIPL_BLOCKED_FIELDS = new Set([
  "fEtd",
  "fEta",
  "fActual",
  "fDocDate",
  "fDocNo",
  "fMasterBL",
  "fMasterBLDate",
  "fHouseBL",
  "fHouseBLDate",
  "fNoAju",
]);

function isCiplSource(source) {
  return /^cipl/.test(source || "");
}

/* HARGA SATUAN HANYA BOLEH DATANG DARI CIPL.

   Invoice komersial ADALAH sumber harga. PIB, PEB, dan draft CEISA
   cuma menyatakannya ulang — kerap sudah dibulatkan, dikonversi, atau
   dibagi rata ke beberapa pos tarif. Membiarkannya menimpa berarti
   mengganti angka yang benar dengan turunannya.

   Dokumen kepabeanan tetap boleh MENGISI harga yang masih kosong:
   angka turunan lebih berguna daripada kolom kosong. Yang dilarang
   hanya menimpa yang sudah ada.

   Termasuk draft Excel CEISA: harga satuannya turunan kolom FOB / CIF
   sheet BARANG (dibulatkan; kolom CIF bisa sudah ditambah freight &
   asuransi), jadi bukan harga satuan invoice. Tetapi harga
   yang dipertahankan harus milik BARANG YANG SAMA -- dicocokkan menurut
   nama (sama / mirip), tidak pernah menurut urutan baris: harga seri 5
   tidak boleh menempel di barang 1 (preserveUnitPrices, `ketat`). */
function isPriceAuthority(source) {
  return isCiplSource(source);
}

/* Nama barang untuk pencocokan -- nama lengkapnya (Uraian beserta
   merek, tipe, ukuran, dst.): dua barang ber-Uraian sama dengan tipe
   berbeda bukan barang yang sama. Beda spasi & huruf besar bukan beda
   barang. */
function itemMatchKey(it) {
  return String(itemDisplayName(it) || (it && it.name) || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* PASANGAN BARANG LAMA UNTUK BARANG BARU.

   Barang baru dari draft CEISA sudah urut menurut Seri Barang
   (excel-bc.js); barang lama urut menurut tabel di form. Pasangan
   dicari berlapis -- mis. nama sama dulu untuk SEMUA barang, baru HS
   Code untuk sisanya -- supaya barang yang namanya cocok tidak
   didahului barang lain yang kebetulan ber-HS sama. Dari kandidat yang
   lolos & belum terpakai, dipilih yang URUTANNYA PALING DEKAT dengan
   barang baru itu, bukan yang kebetulan ditemukan pertama: banyak
   cetakan ber-HS sama (8480.71.90), dan harga, nama, atau dimensinya
   tidak boleh saling tertukar hanya karena urutan baris.

   `lama`: barang lama yang boleh dipakai, [{ it, i }] (i = posisinya di
   tabel). `lapisan`: (barangBaru) => uji(barangLama), atau null kalau
   barang baru itu tidak punya kuncinya -- atau lapisan NAMA MIRIP
   (cocokMirip), yang memasangkan sisa barang sekaligus menurut
   kemiripan namanya (pasangkanNamaMirip, helpers.js). Hasil: barang
   lama per barang baru (null = tanpa pasangan). */
function pasangkanBarangLama(newItems, lama, lapisan) {
  const terpakai = new Set();
  const hasil = newItems.map(() => null);
  lapisan.forEach((ujiUntuk) => {
    if (ujiUntuk && ujiUntuk.hsTunggal) {
      const hs = (it) => normalizeHsCodeInput(it && it.hsCode);
      newItems.forEach((it, posisi) => {
        const h = hs(it);
        if (hasil[posisi] || !h) return;
        const lamaSama = lama.filter((o) => !terpakai.has(o.i) && hs(o.it) === h);
        const baruSama = newItems.filter((x, k) => !hasil[k] && hs(x) === h);
        if (lamaSama.length !== 1 || baruSama.length !== 1) return;
        terpakai.add(lamaSama[0].i);
        hasil[posisi] = lamaSama[0].it;
      });
      return;
    }
    if (ujiUntuk && ujiUntuk.mirip) {
      const sisa = lama.filter((o) => !terpakai.has(o.i));
      const idx = pasangkanNamaMirip(newItems.map((it) => itemDisplayName(it)), sisa.map((o) => itemDisplayName(o.it)), {
        bolehA: (posisi) => !hasil[posisi] && ujiUntuk.perlu(newItems[posisi]),
      });
      idx.forEach((j, posisi) => {
        if (j < 0) return;
        terpakai.add(sisa[j].i);
        hasil[posisi] = sisa[j].it;
      });
      return;
    }
    newItems.forEach((it, posisi) => {
      if (hasil[posisi]) return;
      const uji = ujiUntuk(it);
      if (!uji) return;
      let pilih = null;
      lama.forEach((o) => {
        if (terpakai.has(o.i) || !uji(o.it)) return;
        if (!pilih || Math.abs(o.i - posisi) < Math.abs(pilih.i - posisi)) pilih = o;
      });
      if (!pilih) return;
      terpakai.add(pilih.i);
      hasil[posisi] = pilih.it;
    });
  });
  return hasil;
}

/* Lapisan pencocokan yang dipakai bersama: nama lengkap sama, lalu nama
   MIRIP (kata yang sama, ukuran paling menentukan -- "195/65R15 95V"
   tetap bertemu "195/65 R15", tidak dengan "195/55R16"), baru HS Code
   sama. Tanpa lapisan mirip, barang ber-HS sama yang namanya ditulis
   sedikit lain dipasangkan menurut urutan saja: 14 cetakan 8480.71.90
   dari CIPL yang urutannya lain dari Seri Barang draft saling
   bertukar harga. `perlu` (opsional): barang baru yang memang perlu
   dicarikan pasangan. */
const cocokMirip = (perlu) => ({ mirip: true, perlu: perlu || (() => true) });
const COCOK_MIRIP = cocokMirip();
/* HS Code sama, tetapi HANYA bila pasangannya tidak bisa salah: tinggal
   satu barang lama ber-HS itu dan satu barang baru ber-HS itu. Beberapa
   barang ber-HS sama (14 cetakan 8480.71.90) tidak dipasangkan menurut
   urutan -- tanpa pasangan lebih baik daripada pasangan yang tertukar. */
const COCOK_HS_TUNGGAL = { hsTunggal: true };
const COCOK_NAMA = (it) => {
  const nama = itemMatchKey(it);
  return nama ? (o) => itemMatchKey(o) === nama : null;
};
const COCOK_HS = (it) => {
  const hs = normalizeHsCodeInput(it.hsCode);
  return hs ? (o) => normalizeHsCodeInput(o.hsCode) === hs : null;
};

/* CEISA (excel-bc.js) TIDAK PERNAH mengisi `package` (dimensi P*L*T) --
   sheet BARANG di file itu memang tidak punya kolomnya sama sekali
   (beda dari Packing List, yang punya). Tanpa penjagaan ini, meng-
   import ulang excel CEISA ke draft Export yang dimensinya sudah
   diisi manual akan MENGHAPUS dimensi itu: item baru dari CEISA tidak
   membawa `package` apa pun, jadi field itu ikut ke nilai kosong
   begitu item lama ditimpa oleh preserveUnitPrices() di atas.

   Dicocokkan lewat nama/HS dengan cara yang SAMA dengan
   preserveUnitPrices (pasangkanBarangLama), supaya dimensi menempel ke
   barang yang benar walau urutan barisnya berubah.

   Khusus Export saja: di Import, `package` berarti JUMLAH KOLI ("5
   BOX"), bukan dimensi -- konsep yang beda sama sekali (lihat
   ciplPackagingFor() di import/dispatch.js), dan itu di luar yang
   diminta di sini. */
function preserveDimensionsForCeisa(newItems, oldItems, src) {
  if (src !== "excel" || activeMode !== "export") return newItems;
  const lama = (oldItems || []).map((it, i) => ({ it, i })).filter((o) => String(o.it.package || "").trim());
  if (!lama.length || !newItems.length) return newItems;
  // Barang yang dimensinya sudah terisi tidak mencari pasangan (dan tidak memakai jatah barang lama)
  const perlu = (cari) => (it) => (String(it.package || "").trim() ? null : cari(it));
  const pasangan = pasangkanBarangLama(newItems, lama, [perlu(COCOK_NAMA), cocokMirip((it) => !String(it.package || "").trim()), perlu(COCOK_HS)]);
  return newItems.map((it, i) => (pasangan[i] ? Object.assign({}, it, { package: pasangan[i].package }) : it));
}

/* NAMA BARANG YANG SUDAH DIKETIK SENDIRI TIDAK DITIMPA IMPOR CEISA.

   Di buku Export, nama barang di jadwal adalah sumber CIPL yang
   dicetak aplikasi ini -- yang diketik EXIM itulah rujukannya, dan Cek
   PIB/PEB membandingkan draft dengannya. Draft yang menimpanya membuat
   pemeriksaan itu selalu sama dengan dirinya sendiri.

   Jadi yang sudah diketik orang DIPERTAHANKAN (seluruh kolom barang
   CEISA baris itu, KOLOM_NAMA_BARANG), dan kolom dari CEISA hanya
   dipakai untuk baris yang belum berisi apa pun selain tanda kosong
   bawaan ("-", TANPA MEREK). Impor CEISA memang dilakukan untuk
   mengambil angka kepabeanannya (HS, nilai, berat, kemasan) -- bukan
   namanya.

   PENCOCOKANNYA: nama yang sama persis lebih dulu (pasangan pasti,
   walau urutan Seri Barang di draft berbeda dari tabel), lalu MENURUT
   URUTAN -- Seri Barang draft yang tersisa dengan baris tabel yang
   tersisa, berurutan. Nama biasanya justru berbeda antara kedua sisi
   (itu seluruh alasan fungsi ini ada), jadi urutanlah sandaran
   utamanya; urutan dipakai hanya kalau jumlah barangnya sama persis.
   Kalau berbeda, dicocokkan lewat HS Code (urutan terdekat), dan baris
   yang tak berpasangan memakai kolom dari berkas apa adanya.

   Khusus Export: barang Import diambil dari dokumen pemasok, dan draft
   CEISA-nya mengisi kolom barangnya apa adanya. */
function punyaNamaManual(it) {
  return !!it && KOLOM_NAMA_BARANG.some((k) => rapiBagianNama(it[k]));
}

function salinNama(baru, lama) {
  const out = Object.assign({}, baru);
  KOLOM_NAMA_BARANG.forEach((k) => {
    out[k] = lama[k] || "";
  });
  return out;
}

/* Baris yang BENAR-BENAR dipakai, bukan baris kosong di ekor tabel.

   Tabel barang selalu menyisakan satu baris kosong di bawah (ditambah
   sendiri begitu baris terakhir mulai diisi). Baris itu bagian dari
   cara mengisi, bukan barang -- tapi ia tetap masuk hitungan panjang
   daftar, dan dulu itu yang menggagalkan pencocokan menurut urutan:
   2 barang terisi + 1 baris kosong tidak pernah sama dengan 2 barang
   dari berkas CEISA. */
function barisBarangTerisi(it) {
  if (!it) return false;
  if (punyaNamaManual(it)) return true;
  if (String(it.hsCode || "").trim()) return true;
  return ["qty", "harga", "netto", "bruto"].some(
    (k) => parseLooseNumber(it[k]) > 0,
  );
}

function preserveNamesForCeisa(newItems, oldItems, src) {
  if (src !== "excel" || activeMode !== "export") return { items: newItems, kept: 0 };
  const lamaIsi = (oldItems || []).filter(barisBarangTerisi);
  const lama = lamaIsi.filter(punyaNamaManual);
  if (!lama.length || !newItems.length) return { items: newItems, kept: 0 };

  let kept = 0;

  /* URUTAN LEBIH DULU, dan tanpa syarat HS Code.

     Orang mengimpor CEISA justru UNTUK mengambil HS Code, nilai, dan
     beratnya -- jadi baris yang baru saja diketik namanya biasanya
     BELUM ber-HS Code sama sekali. Pencocokan lewat HS Code karena itu
     tidak pernah kena pada kasus yang paling sering terjadi, dan nama
     yang sudah diketik ikut tertimpa. Urutan barislah yang bisa
     diandalkan: berkas CEISA disusun dari invoice yang sama. */
  const salin = (pasangan) =>
    newItems.map((it, i) => {
      const o = pasangan[i];
      if (!o || !punyaNamaManual(o)) return it;
      kept++;
      return salinNama(it, o);
    });
  if (lamaIsi.length === newItems.length) {
    const lamaPos = lamaIsi.map((it, i) => ({ it, i }));
    const pasangan = pasangkanBarangLama(newItems, lamaPos, [COCOK_NAMA]);
    const dipakai = new Set(pasangan.filter(Boolean));
    const sisa = lamaIsi.filter((it) => !dipakai.has(it));
    let k = 0;
    pasangan.forEach((o, i) => {
      if (!o) pasangan[i] = sisa[k++] || null;
    });
    return { items: salin(pasangan), kept, byOrder: true };
  }
  const pasangan = pasangkanBarangLama(newItems, lama.map((it) => ({ it, i: oldItems.indexOf(it) })), [COCOK_HS]);
  return { items: salin(pasangan), kept };
}

/* KODE KONDISI BARANG, KODE NEGARA ASAL & PI BARANG YANG TIDAK DIBAWA
   BERKASNYA.

   Draft CEISA memuat kedua kode (dan PI barang lewat BARANGDOKUMEN); PIB
   PDF tidak selalu tercetak terbaca, dan CIPL tidak pernah memuat
   kondisi barang maupun PI. Barang baru yang
   kodenya kosong / tidak dibawa (undefined) mengambil isian barang lama
   pasangannya -- nama, lalu HS Code (pasangkanBarangLama) -- supaya
   pilihan yang sudah dibuat tidak hilang hanya karena berkas yang
   diimpor belakangan tidak memuatnya. Yang dibawa berkas tetap dipakai.
   Yang tetap tidak dibawa memakai bawaan buku (newItem); yang dibawa
   kosong tetap kosong (draft memang tidak mengisinya). */
/* Invoice barang (item.invoiceNomor, jadwal berinvoice lebih dari satu)
   juga: draft CEISA jarang menautkan 380 ke barang, jadi barang draft
   mewarisi invoice barang lamanya yang sama namanya (dari CIPL). */
const KOLOM_KODE_BARANG = ["kondisiBarang", "negaraAsal", "piNomor", "invoiceNomor"];
function lengkapiKodeBarang(newItems, oldItems, lapisan) {
  const isi = (it, k) => String((it && it[k]) || "").trim();
  const lama = (oldItems || []).map((it, i) => ({ it, i })).filter((o) => KOLOM_KODE_BARANG.some((k) => isi(o.it, k)));
  const perluKode = (it) => KOLOM_KODE_BARANG.some((k) => !isi(it, k));
  const perlu = (cari) => (cari && cari.mirip ? cocokMirip(perluKode) : (it) => (perluKode(it) ? cari(it) : null));
  const pasangan = lama.length ? pasangkanBarangLama(newItems, lama, (lapisan || [COCOK_NAMA, COCOK_MIRIP, COCOK_HS]).map(perlu)) : [];
  const bawaan = newItem(activeMode);
  return newItems.map((it, i) => {
    const out = Object.assign({}, it);
    const o = pasangan[i];
    KOLOM_KODE_BARANG.forEach((k) => {
      if (!isi(out, k) && o && isi(o, k)) out[k] = o[k];
      else if (out[k] == null) out[k] = bawaan[k];
    });
    // No. item di PI tidak pernah dibawa berkas: ikut barang lamanya selama PI-nya sama
    out.piNoItem = o && isi(o, "piNoItem") && isi(o, "piNomor") === isi(out, "piNomor") ? o.piNoItem : out.piNoItem || "";
    return out;
  });
}

/* Data PIB/PEB per barang (item.dataPabean, core/data-pabean.js) ikut
   barang lamanya -- dicocokkan seperti harga satuan di bawah: berkas yang
   tidak membawanya (CIPL, invoice) tidak menghapusnya, dan isian yang
   dibawa berkas baru hanya menimpa isian yang sama. `lapisan` (opsional):
   pencocokan yang boleh dipakai -- draft Excel CEISA hanya nama sama /
   mirip, tanpa jatuh ke urutan. */
function pertahankanDataPabeanBarang(newItems, oldItems, lapisan) {
  const lama = (oldItems || []).map((it, i) => ({ it, i })).filter((o) => adaDataPabeanBarang(o.it.dataPabean));
  if (!lama.length) return newItems;
  let pasangan = pasangkanBarangLama(newItems, lama, lapisan || [COCOK_NAMA, COCOK_MIRIP, COCOK_HS]);
  if (!lapisan && !pasangan.some(Boolean) && newItems.length === lama.length) pasangan = lama.map((o) => o.it);
  return newItems.map((it, i) =>
    pasangan[i] ? Object.assign({}, it, { dataPabean: gabungDataPabeanBarang(pasangan[i].dataPabean, it.dataPabean) }) : it,
  );
}

/* Mengembalikan harga satuan yang sudah ada ke daftar barang yang baru.

   Dicocokkan berlapis — nama sama dulu untuk semua barang, lalu nama
   mirip, baru HS Code untuk sisanya, urutan terdekat
   (pasangkanBarangLama) — karena satu HS
   Code kerap dipakai beberapa barang sekaligus, sementara namanya
   jarang sama persis. Tiap barang lama hanya boleh dipakai sekali,
   supaya dua pos yang ber-HS sama tidak sama-sama mewarisi harga dari
   satu baris.

   Kalau tidak ada yang cocok sama sekali TAPI jumlah barangnya persis
   sama, dicocokkan menurut urutan: dokumen kepabeanan hampir selalu
   menyusun barang dalam urutan yang sama dengan invoice-nya. */
function preserveUnitPrices(newItems, oldItems, opsi) {
  const ketat = !!(opsi && opsi.ketat);
  const lama = (oldItems || []).map((it, i) => ({ it, i })).filter((o) => parseLooseNumber(o.it.harga) > 0);
  if (!lama.length || !newItems.length) return { items: newItems, kept: 0, tanpaPasangan: [] };

  /* `ketat` (draft Excel CEISA): hanya nama sama / mirip / HS tunggal --
     tanpa urutan terdekat & tanpa pencocokan menurut urutan. Barang yang
     tidak berpasangan memakai harga draft-nya; nomornya dilaporkan. */
  const pasangan = pasangkanBarangLama(newItems, lama, ketat ? [COCOK_NAMA, COCOK_MIRIP, COCOK_HS_TUNGGAL] : [COCOK_NAMA, COCOK_MIRIP, COCOK_HS]);
  const kept = pasangan.filter(Boolean).length;
  if (ketat) {
    return {
      items: newItems.map((it, i) => (pasangan[i] ? Object.assign({}, it, { harga: pasangan[i].harga }) : it)),
      kept,
      tanpaPasangan: pasangan.map((o, i) => (o ? 0 : i + 1)).filter(Boolean),
    };
  }
  if (!kept && newItems.length === lama.length) {
    return {
      items: newItems.map((it, i) => Object.assign({}, it, { harga: lama[i].it.harga })),
      kept: newItems.length,
      byOrder: true,
    };
  }
  return { items: newItems.map((it, i) => (pasangan[i] ? Object.assign({}, it, { harga: pasangan[i].harga }) : it)), kept, tanpaPasangan: [] };
}

/* BARANG CIPL UNTUK SEBAGIAN INVOICE JADWAL (rencana dispatch.js):
     "tambah"   -- barang invoice baru di bawah barang yang sudah ada;
     "perbarui" -- barang invoice CIPL ini diganti, di tempat barang
                   pertamanya; barang invoice lain tidak disentuh.
   Barang lama yang belum bertanda invoice (jadwal satu invoice yang
   tersimpan, isian tangan): milik satu-satunya invoice lain bila hanya
   ada satu; untuk "perbarui" barang lama yang namanya sama dengan barang
   CIPL ini milik invoicenya. Kode & Data PIB/PEB per barang diwarisi
   barang lama invoice yang sama (lengkapiKodeBarang /
   pertahankanDataPabeanBarang); barang invoice baru hanya mewarisi kode
   barang lain yang namanya persis sama. */
function gabungBarangCiplInvoice(baru, lama, rencana, notes) {
  const daftar = (typeof dokInvoiceForm === "function" ? dokInvoiceForm() : []).filter((d) => d.nomor);
  const lamaNyata = lama.filter((it) => String(it.namaBarang || "").trim() !== "");
  const kunciCipl = new Set(baru.map((it) => kunciInvoice(it.invoiceNomor)).filter(Boolean));
  const lain = daftar.map((d) => kunciInvoice(d.nomor)).filter((k) => !kunciCipl.has(k));
  let tanda = kunciInvoiceBarang(lamaNyata, daftar);
  if (!tanda.some(Boolean)) {
    if (rencana === "tambah") tanda = lamaNyata.map(() => (lain.length === 1 ? lain[0] : ""));
    else {
      const pasangan = pasangkanBarangLama(baru, lamaNyata.map((it, i) => ({ it, i })), [COCOK_NAMA, COCOK_MIRIP]);
      tanda = lamaNyata.map((it) => {
        const j = pasangan.indexOf(it);
        return j >= 0 ? kunciInvoice(baru[j].invoiceNomor) : lain.length === 1 ? lain[0] : "";
      });
    }
  }
  const lamaDitandai = lamaNyata.map((it, i) => (tanda[i] ? Object.assign({}, it, { invoiceNomor: nomorInvoiceDariKunci(daftar, tanda[i]) || it.invoiceNomor }) : it));
  const nomorCipl = [...kunciCipl].map((k) => nomorInvoiceDariKunci(daftar, k) || k).join(", ");
  if (rencana === "tambah") {
    const dari = lamaDitandai.length + 1;
    const sampai = lamaDitandai.length + baru.length;
    const rentang = dari === sampai ? String(dari) : dari + "–" + sampai;
    notes.push(t("y.barang.invoice.ditambahkan", { nomor: nomorCipl, n: baru.length, rentang }));
    return lamaDitandai.concat(lengkapiKodeBarang(baru, lamaDitandai, [COCOK_NAMA]));
  }
  const diganti = lamaDitandai.filter((it, i) => kunciCipl.has(tanda[i]));
  const sudahAda = new Set(tanda.filter(Boolean));
  const baruRapi = diganti.length ? pertahankanDataPabeanBarang(lengkapiKodeBarang(baru, diganti), diganti) : lengkapiKodeBarang(baru, lamaDitandai, [COCOK_NAMA]);
  const diTempat = baruRapi.filter((it) => sudahAda.has(kunciInvoice(it.invoiceNomor)));
  const tambahan = baruRapi.filter((it) => !sudahAda.has(kunciInvoice(it.invoiceNomor)));
  const out = [];
  let disisip = false;
  lamaDitandai.forEach((it, i) => {
    if (!kunciCipl.has(tanda[i])) return void out.push(it);
    if (!disisip) out.push(...diTempat);
    disisip = true;
  });
  if (!disisip) out.push(...diTempat);
  out.push(...tambahan);
  notes.push(t("y.barang.invoice.diganti", { nomor: nomorCipl, lama: diganti.length, baru: baru.length }));
  return out;
}

/* CIPL yang barangnya tidak diterapkan (daftar barang sudah dari dokumen
   berprioritas lebih tinggi, mis. draft CEISA): invoicenya tetap
   ditandaikan ke barang yang sama namanya -- jadwal berinvoice lebih dari
   satu -- supaya pembagian barang per invoice tidak perlu diisi tangan.
   Hasil: jumlah barang yang ditandai. */
function tandaiInvoiceDariCipl(baru) {
  const daftar = (typeof dokInvoiceForm === "function" ? dokInvoiceForm() : []).filter((d) => d.nomor);
  if (daftar.length < 2) return 0;
  const lama = draftItems.map((it, i) => ({ it, i })).filter((o) => String(o.it.namaBarang || "").trim() !== "");
  const pasangan = pasangkanBarangLama(baru, lama, [COCOK_NAMA, COCOK_MIRIP]);
  let n = 0;
  pasangan.forEach((o, j) => {
    const nomor = nomorInvoiceDariKunci(daftar, kunciInvoice(baru[j].invoiceNomor));
    if (!o || !nomor || o.invoiceNomor === nomor) return;
    o.invoiceNomor = nomor;
    n++;
  });
  if (n && typeof segarkanRentangInvoice === "function") segarkanRentangInvoice();
  return n;
}

// Satu-satunya pintu penulisan field form dari hasil import.
function setImportField(id, value, source, opts) {
  if (value === "" || value == null) return false;
  if (isCiplSource(source) && CIPL_BLOCKED_FIELDS.has(id)) return false;

  const el = $("#" + id);
  if (!el) return false;

  const current = String(el.value || "").trim();
  const prio = prioritasIsian(id, source);
  const prevPrio = importFieldOrigin[id];
  const utama = prio === PRIORITAS_SUMBER_UTAMA;

  if (current !== "" && prevPrio != null && prio < prevPrio) return false;
  // Field terisi yang BELUM pernah disentuh import (kecuali sumber utamanya)
  if (current !== "" && prevPrio == null && !utama && !(opts && opts.force)) return false;

  // Kotak angka ditulis dalam bentuk BERFORMAT (mis
  el.value = el.hasAttribute("data-num") ? formatNumberValue(value) : value;
  importFieldOrigin[id] = prio;
  return true;
}

function setImportSelect(id, value, source, notes, labelForNote) {
  if (!value) return false;
  const el = $("#" + id);
  if (!el) return false;
  const hasOpt = Array.from(el.options).some((o) => o.value === value);
  if (!hasOpt) {
    if (notes)
      notes.push(
        t("w.nilai.tidak.ada.di.dropdown", { label: labelForNote || id, nilai: value }),
      );
    return false;
  }
  const prio = sourcePriority(source);
  const prevPrio = importFieldOrigin[id];
  if (prevPrio != null && prio < prevPrio) return false;
  el.value = value;
  importFieldOrigin[id] = prio;
  return true;
}

/* Nama Shipper / Buyer: dokumen memuat DUA pihak sekaligus, dan mana */
function resolvePartyForActiveMode(f) {
  if (f.seller || f.consignee) {
    return pickCiplParty(f.seller, f.consignee, activeMode);
  }
  return f.party || "";
}

/* ETD & ETA DARI DOKUMEN PABEAN (draft CEISA, PIB, PEB) -- bukan CIPL.
     - ETD: tanggal Master / House B/L-AWB -- dari berkas maupun yang sudah
       ada di form (etdIkutTanggalBl, form-router.js). Tanpa tanggal
       B/L-AWB: tanggal berangkat / perkiraan tanggal ekspor dokumennya,
       hanya mengisi ETD yang masih kosong.
     - ETA: perkiraan tanggal tiba dokumen (draft CEISA: TANGGAL TIBA di
       HEADER; PIB: field 11) -- menimpa ETA, dan mode ETA jadi Manual:
       tanggal dokumen, bukan hitungan mesin. Tanpa itu ETA dihitung dari
       ETD (mode Otomatis), atau -- ETA manual yang masih kosong -- diisi
       hitungan mesin.
     - Status Delay: yang diubah tanggal revisinya (Update ETD / Update
       ETA); ETD & ETA rencana tetap, karena selisih keduanya itulah
       lamanya delay.
   Kotaknya diubah lewat event "change", jadi aturan form yang menempel
   (revisi gugur, status Export, panel prediksi) ikut berjalan; kalimat
   penyesuaiannya jadi catatan impor (tampungKabarForm). Hasil: jumlah
   isian yang diubah. */
function terapkanTanggalDokumen(f, src, notes) {
  if (isCiplSource(src)) return 0;
  let terisi = 0;
  const ubah = (el) => {
    terisi++;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  notes.push(
    ...tampungKabarForm(() => {
      if ($("#fMasterBLDate").value || $("#fHouseBLDate").value) {
        if (etdIkutTanggalBl()) terisi++;
      } else if (setImportField("fEtd", f.etd, src)) ubah($("#fEtd"));
      if (f.eta) {
        const delay = $("#fStatus").value === "delayed" && !!$("#fEta").value;
        const id = delay ? "fEtaUpdate" : "fEta";
        if ($("#" + id).value !== f.eta && setImportField(id, f.eta, src, { force: true })) {
          kabarkanForm(t(delay ? "y.eta.revisi.dari.perkiraan.tiba" : "y.eta.dari.perkiraan.tiba", { tgl: fmtDate(f.eta) }));
          if (!delay && typeof setFormEtaMode === "function") setFormEtaMode("manual", { recalc: false });
          ubah($("#" + id));
        }
      }
      if (!$("#fEta").value && typeof hitungUlangEtaForm === "function") hitungUlangEtaForm({ paksa: true });
    }),
  );
  return terisi;
}

function applyImportedBcData(parsed) {
  const f = parsed.fields || {};
  const notes = (parsed.notes || []).slice();
  const src = parsed.source;
  let filled = 0;
  /* CIPL untuk SEBAGIAN invoice jadwal (rencana "tambah" / "perbarui",
     dispatch.js): isian kepala jadwal yang sudah terisi tidak ditimpa --
     satu PIB/PEB, satu kapal, satu pihak; CIPL invoice berikutnya hanya
     melengkapi yang masih kosong. */
  const isiKosongSaja = parsed.rencanaInvoice === "tambah" || parsed.rencanaInvoice === "perbarui";
  const sudahTerisi = (id) => isiKosongSaja && !!$("#" + id) && String($("#" + id).value || "").trim() !== "";
  const put = (id, val, opts) => {
    if (sudahTerisi(id)) return;
    if (setImportField(id, val, src, opts)) filled++;
  };

  put("fNoAju", f.noAju);
  put("fDocNo", f.docNo);
  put("fDocDate", f.docDate);
  put("fParty", resolvePartyForActiveMode(f));
  // Ejaan lain dari nama yang sudah ada di daftar Shipper/Buyer disamakan (pilih-pihak.js)
  if (typeof samakanNamaPihakForm === "function") samakanNamaPihakForm();
  /* Invoice & Packing List -- satu atau beberapa (entriInvoiceImpor);
     diterapkan di bawah, sesudah Data PIB/PEB (terapkanInvoiceImpor). */
  const entriInvoice = entriInvoiceImpor(f, src);
  /* Dokumen pelengkap: PI (959), LS (958) & Polis Asuransi (530) --
     buku Import saja, buku Export tidak diisi diam-diam -- dan dokumen
     lain ber-kode CEISA, digabung ke kartu Dokumen Pelengkap Pabean per
     nomornya (gabungDokPelengkapImpor, dok-pelengkap.js). */
  if (f.dokPelengkap) filled += gabungDokPelengkapImpor(f.dokPelengkap);
  /* Data PIB/PEB lengkap (kartu "Data PIB/PEB Lengkap", data-pabean-form.js):
     isian dokumen yang tidak punya kotak sendiri. Data per barang ikut di
     barangnya (item.dataPabean). */
  /* Packing List-nya TIDAK lewat sini: tiap PL milik invoicenya, dan
     invoice pertama berkas belum tentu baris ke-1 form (terapkanInvoiceImpor). */
  const dpTanpaPl = Object.assign({}, f.dataPabean);
  delete dpTanpaPl.packingListNomor;
  delete dpTanpaPl.packingListTanggal;
  if (f.dataPabean && typeof terapkanDataPabeanImpor === "function" && adaDataPabean(dpTanpaPl)) {
    terapkanDataPabeanImpor(dpTanpaPl);
    filled++;
  }
  /* INVOICE & PACKING LIST: nomor & tanggal yang dibawa berkas = isian
     MANUAL (bukan ikutan); yang kosong pasangannya mengikuti (aturan yang
     sama dengan mengetik, form-router.js). Invoice kedua dst. jadi baris
     berikutnya (invoice-form.js). Berkas yang membawa Invoice & Packing
     List dengan nomor / tanggal BERBEDA diberi peringatan -- CI & PL satu
     kiriman seharusnya sama (bedaCiplDiBerkas). */
  const bedaCipl = bedaCiplDiBerkas(f, src, entriInvoice);
  filled += terapkanInvoiceImpor(entriInvoice, src, parsed.rencanaInvoice);
  if (bedaCipl.length) notes.unshift(t("y.cipl.invoice.packing.beda", { dok: labelDokumenImpor(src), beda: kalimatBedaCipl(bedaCipl) }));
  put("fMasterBL", f.masterBL);
  put("fHouseBL", f.houseBL);
  /* Tanggal B/L-AWB dari dokumen = isian MANUAL (bukan ikutan); yang
     kosong pasangannya diisi sesudahnya (lengkapiTanggalBl). PIB PDF
     menamainya masterBlDate / houseBlDate. */
  [
    ["fMasterBLDate", f.masterBLDate || f.masterBlDate],
    ["fHouseBLDate", f.houseBLDate || f.houseBlDate],
  ].forEach(([id, nilai]) => {
    if (setImportField(id, nilai, src)) {
      filled++;
      delete $("#" + id).dataset.ikut;
    }
  });
  if (typeof lengkapiTanggalBl === "function") lengkapiTanggalBl();
  // Export: Tanggal PEB kosong (draft belum didaftarkan) diisi dari tanggal di nomor aju
  if (typeof tandaiTanggalPebDariAju === "function") tandaiTanggalPebDariAju();
  put("fForwarder", f.forwarder);
  put("fVessel", f.vessel);
  put("fVoyage", f.voyage);
  put("fContainer", f.container);
  put("fOrigin", f.origin);
  put("fDestination", f.destination);
  if (f.package) {
    // Dari file, Total Package datang sbg satu teks ("2 PACKAGE")
    const before = $("#fPackage").value.trim();
    if (put("fPackage", f.package)) {
      setPackageFields(f.package);
    } else if (!before) {
      setPackageFields(f.package);
    }
  }

  // Tarif BM tidak di sini: tarifnya per barang (item.dataPabean.tarifBm, tarif-hs.js)
  ["freight", "insurance", "ndpbm", "bm", "ppn", "pph"].forEach(
    (key) => {
      const id =
        "f" +
        (key === "bm"
          ? "BM"
          : key === "ppn"
            ? "PPN"
            : key === "pph"
              ? "PPH"
              : key === "ndpbm"
                ? "Ndpbm"
                : key.charAt(0).toUpperCase() + key.slice(1));
      /* BM/PPN/PPH DIPAKSA menimpa isi kotak.

         Kotak yang sudah terisi biasanya TIDAK ditimpa impor -- itu
         yang melindungi ketikan pengguna. Tapi untuk tiga pungutan
         ini, dokumen kepabeanan justru sumber yang paling berwenang:
         angkanya keluar dari CEISA, bukan dikarang.

         Tanpa paksaan ini, mengubah jadwal yang sudah tersimpan
         dengan PPN 0 tidak akan pernah memperbarui PPN-nya: kotaknya
         berisi "0" (nilaiPungutan menulis nol apa adanya, bukan
         kosong), jadi terbaca "sudah diisi" dan impor menolak
         menyentuhnya. */
      const paksa = key === "bm" || key === "ppn" || key === "pph";
      if (f[key] != null && f[key] !== "") put(id, f[key], paksa ? { force: true } : undefined);
    },
  );

  /* Angka BM, PPN & PPH hasil impor: NOL DITULIS "0", lalu ditandai
     MANUAL.

     Aturan "kosong = otomatis, diisi = manual" (AUTO_DUTY_FIELDS di
     modal-fields.js) membaca ISI KOTAK. Padahal formatNumberValue()
     menulis 0 sebagai kotak kosong — konvensi yang benar untuk Freight
     & Asuransi (kosong di situ berarti "tidak ada"), tapi salah untuk
     pungutan: nol dari dokumen adalah FAKTA (tarifnya 0% atau
     dibebaskan fasilitas), bukan kolom yang menunggu diisi.

     Dibiarkan kosong, penandanya cuma bertahan selama form terbuka.
     initAutoDutyFlags() jalan lagi setiap form dibuka, membaca kotak
     kosong itu sebagai "otomatis", lalu recalcCustoms() menimpanya
     dengan 5% x Nilai Pabean — angka dari dokumen berubah sendiri
     hanya karena jadwalnya dibuka ulang.

     Ditulis "0", ketiganya jadi benar tanpa bergantung pada penanda:
     kotak terisi = manual, sekarang maupun nanti. Sama dengan yang
     dilakukan nilaiPungutan() saat memuat jadwal tersimpan. */
  ["bm", "ppn", "pph"].forEach((key) => {
    if (f[key] == null || f[key] === "") return;
    const el = $("#f" + key.toUpperCase());
    if (!el) return;
    if (Number(f[key]) === 0) el.value = "0";
    el.dataset.auto = "0";
  });

  if (f.transport && !sudahTerisi("fTransport")) {
    if (setImportSelect("fTransport", f.transport, src)) filled++;
  }
  if (f.muatan && !sudahTerisi("fMuatan")) {
    if (setImportSelect("fMuatan", f.muatan, src)) filled++;
  }
  if (f.incoterm && !sudahTerisi("fIncoterm")) {
    if (setImportSelect("fIncoterm", f.incoterm, src, notes, "Kode incoterm"))
      filled++;
  }
  // Sesudah moda, kapal & pelabuhan terisi: ETA otomatis dihitung dari isian yang sudah lengkap
  filled += terapkanTanggalDokumen(f, src, notes);

  /* ---- daftar barang ---- */
  if (parsed.items && parsed.items.length) {
    // HS Code disimpan sebagai DIGIT saja (requirement A)
    /* KOLOM BARANG (KOLOM_NAMA_BARANG) DISERAGAMKAN KE HURUF BESAR.

       Dipasang di sini karena SEMUA impor berkas lewat titik ini —
       CIPL Excel, CIPL PDF, PIB, PEB. Menaruhnya di tiap parser berarti
       empat salinan aturan yang sama, dan parser yang ditambahkan nanti
       akan terlewat tanpa ada yang menyadarinya.

       Nama dari invoice pemasok datang dengan huruf campur-campur.
       "Tyre Mold Full Set" dan "TYRE MOLD FULL SET" terhitung sebagai
       dua barang berbeda saat dikelompokkan di laporan — dan itu baru
       ketahuan berbulan-bulan kemudian, saat jumlahnya tidak cocok. */
    const cleaned = parsed.items.map((it) => {
      const out = { ...it, hsCode: normalizeHsCodeInput(it.hsCode) };
      KOLOM_NAMA_BARANG.forEach((k) => (out[k] = String(it[k] == null ? "" : it[k]).toUpperCase()));
      // Kode CEISA dibakukan (1 / 2, kode negara ISO); undefined = tidak dibawa berkasnya (lengkapiKodeBarang)
      if (it.kondisiBarang != null) out.kondisiBarang = kodeKondisiBarang(it.kondisiBarang);
      if (it.negaraAsal != null) out.negaraAsal = kodeNegara(it.negaraAsal) || String(it.negaraAsal).trim().toUpperCase();
      return out;
    });
    // Barang dari sumber berprioritas LEBIH RENDAH tidak menimpa daftar barang yang sudah terisi
    const prevPrio = importFieldOrigin.__items;
    const prio = sourcePriority(src);
    const hasRealItems = draftItems.some(
      (it) => (it.namaBarang || "").trim() !== "",
    );
    if (!hasRealItems || prevPrio == null || prio >= prevPrio) {
      if (isPriceAuthority(src) && hasRealItems && (parsed.rencanaInvoice === "tambah" || parsed.rencanaInvoice === "perbarui")) {
        // CIPL satu invoice di jadwal berinvoice lebih dari satu: barang invoice lain tetap (gabungBarangCiplInvoice)
        draftItems = gabungBarangCiplInvoice(cleaned, draftItems, parsed.rencanaInvoice, notes);
      } else if (isPriceAuthority(src)) {
        draftItems = pertahankanDataPabeanBarang(lengkapiKodeBarang(cleaned, draftItems), draftItems);
      } else {
        /* Nama dipertahankan LEBIH DULU: pencocokan harga & dimensi di
           bawah memakai nama sebagai kunci, jadi urutannya penting --
           setelah nama manual dikembalikan, keduanya bisa mencocokkan
           lewat nama alih-alih jatuh ke pencocokan urutan. */
        const jagaNama = preserveNamesForCeisa(cleaned, draftItems, src);
        if (jagaNama.kept) {
          notes.push(
            t("w.nama.barang.dipertahankan", {
              n: jagaNama.kept,
              urut: jagaNama.byOrder ? tt(" (dicocokkan menurut urutan)", " (matched by order)") : "",
            }),
          );
        }
        /* Draft Excel CEISA: barang ke-n = Seri Barang n, dan isiannya
           (jumlah, kemasan, berat, HS, kode, fasilitas, Data PIB) dari
           baris seri itu sendiri. Harga satuan barang yang sudah ada
           (invoice) dipertahankan -- nilai draft turunan kolom FOB / CIF
           yang dibulatkan -- tetapi hanya dari barang YANG SAMA menurut namanya
           (preserveUnitPrices ketat); barang lama tidak pernah
           diwariskan ke seri lain menurut urutan baris. */
        const draftCeisa = src === "excel";
        const jaga = preserveUnitPrices(jagaNama.items, draftItems, { ketat: draftCeisa });
        const lapisLama = draftCeisa ? [COCOK_NAMA, COCOK_MIRIP] : undefined;
        draftItems = pertahankanDataPabeanBarang(
          lengkapiKodeBarang(preserveDimensionsForCeisa(jaga.items, draftItems, src), draftItems, lapisLama),
          draftItems,
          lapisLama,
        );
        if (jaga.kept) {
          notes.push(
            t("w.harga.satuan.dipertahankan", { n: jaga.kept, urut: jaga.byOrder ? tt(" (dicocokkan menurut urutan)", " (matched by order)") : "" }),
          );
        }
        // Barang draft yang tidak ditemukan di daftar sebelumnya: harganya dari draft (bisa termasuk freight & asuransi)
        if (jaga.kept && jaga.tanpaPasangan.length) notes.push(t("w.harga.dari.draft", { daftar: jaga.tanpaPasangan.join(", ") }));
      }
      importFieldOrigin.__items = prio;
    } else {
      notes.push(
        t("y.daftar.barang.tidak.diterapkan"),
      );
      // Barangnya tidak diganti, tetapi invoicenya tetap ditandaikan ke barang yang sama namanya
      if (isPriceAuthority(src)) {
        const n = tandaiInvoiceDariCipl(cleaned);
        if (n) notes.push(t("y.barang.invoice.ditandai", { n }));
      }
    }
  }

  if (parsed.modeHint && parsed.modeHint !== activeMode) {
    notes.push(
      t("y.berkas.mode.berbeda", { dokumen: parsed.modeHint === "import" ? "IMPORT" : "EXPORT", form: activeMode === "import" ? "IMPORT" : "EXPORT" }),
    );
  }
  /* Dokumen pabean resmi (draft CEISA, PIB/PEB) ikut mencentang Progres
     Dokumen: PIB/PEB draft atau terdaftar, SPPB, Manifest, jalur
     (doc-steps.js) -- ditampung sampai Simpan. */
  if (typeof catatProgresImporForm === "function") {
    const progres = catatProgresImporForm(parsed);
    if (progres) notes.push(progres);
  }

  applyTransportLabels();
  renderItemTable();
  if (typeof renderDataPabeanForm === "function") renderDataPabeanForm();
  // Isian yang diisi tanpa event (kapal, pelabuhan, moda) ikut dihitung panel prediksi & penanda form
  if (typeof hitungUlangEtaForm === "function") hitungUlangEtaForm();
  if (typeof syncPredictionForm === "function") syncPredictionForm();
  applyDelayFieldVisibility();
  syncFormValidity();

  const items = parsed.items || [];
  const fasilitas = hitungFasilitas(items.flatMap((it) => it.skb || []));
  const facParts = [];
  if (fasilitas.skb) facParts.push(`${fasilitas.skb} SKB`);
  if (fasilitas.coo) facParts.push(`${fasilitas.coo} COO`);
  const facSuffix = facParts.length
    ? tt(` (termasuk ${facParts.join(" & ")})`, ` (incl. ${facParts.join(" & ")})`)
    : "";
  const sourceLabel = /pdf/i.test(src || "") ? "PDF" : "Excel";
  const docLabel =
    src === "pdf"
      ? "PIB"
      : src === "pdf-peb"
        ? "PEB"
        : isCiplSource(src)
          ? "CIPL"
          : "BC";
  const summary = t("x.field.barang.terisi.otomatis", { f: filled, b: items.length, dok: docLabel, sumber: sourceLabel, fac: facSuffix });
  // Nomor dari berkas bisa saja sudah dipakai jadwal lain (cek-duplikat.js)
  if (typeof periksaNomorGandaForm === "function") periksaNomorGandaForm();
  return { summary, notes, bedaCipl: bedaCipl.length > 0 };
}

/* Nama jenis berkas untuk kalimat peringatan */
function labelDokumenImpor(src) {
  if (isCiplSource(src)) return "CIPL";
  if (src === "pdf") return "PIB PDF";
  if (src === "pdf-peb") return "PEB PDF";
  return tt("draft CEISA", "CEISA draft");
}

/* Nomor / tanggal Invoice vs Packing List DI DALAM SATU BERKAS: CIPL
   (sheet CI vs sheet PL) atau draft CEISA / PIB-PEB (dokumen 380 vs 217).
   CIPL tanpa sheet PL memakai nomor invoice sebagai nomor PL -- selalu
   sama, tidak pernah diperingatkan. Bentuknya sama dengan
   bedaInvoicePackingList (form-router.js). */
function bedaCiplDiBerkas(f, src, entri) {
  const kunci = (x) => x.replace(/\s+/g, "").toUpperCase();
  const beda = [];
  // Tiap invoice berkas dengan Packing List-nya sendiri (entriInvoiceImpor)
  (entri || entriInvoiceImpor(f || {}, src)).forEach((e) => {
    if (e.nomor && e.pl && kunci(e.nomor) !== kunci(e.pl)) beda.push({ jenis: "nomor", invoice: e.nomor, pl: e.pl });
    if (e.tanggal && e.plTanggal && e.tanggal !== e.plTanggal) beda.push({ jenis: "tanggal", invoice: e.tanggal, pl: e.plTanggal });
  });
  return beda;
}

/* INVOICE & PACKING LIST SATU BERKAS: f.dokInvoice -- draft CEISA / PIB /
   PEB dengan beberapa dokumen 380, beberapa CIPL yang digabung -- atau,
   berkas yang tidak memuatnya, invoice tunggalnya. Tanggal invoice CIPL:
   pembaca lama menamainya docDate (tanggal invoice, bukan tanggal SPPB).
   Packing List yang hanya terbaca di kotak PL dokumennya (field 31 PEB,
   sheet PL CIPL) melengkapi invoice yang sama -- atau yang pertama. */
function entriInvoiceImpor(f, src) {
  const dp = f.dataPabean || {};
  const tunggal = { nomor: f.invoice, tanggal: f.invoiceDate || (isCiplSource(src) ? f.docDate : ""), pl: dp.packingListNomor, plTanggal: dp.packingListTanggal };
  const entri = rapikanDokInvoice(Array.isArray(f.dokInvoice) && f.dokInvoice.length ? f.dokInvoice : [tunggal]);
  const pl = teksInvoice(dp.packingListNomor);
  if (pl && !entri.some((e) => kunciInvoice(e.pl) === kunciInvoice(pl))) {
    const sasaran = entri.find((e) => e.nomor && kunciInvoice(e.nomor) === kunciInvoice(f.invoice)) || entri[0];
    if (sasaran && !sasaran.pl) {
      sasaran.pl = pl;
      sasaran.plTanggal = sasaran.plTanggal || tanggalInvoice(dp.packingListTanggal);
    }
  }
  return entri;
}

/* Packing List baris ke-1 (Data PIB/PEB form): seperti isian Data PIB/PEB
   lain, yang dibawa berkas menimpa (gabungDataPabean). */
function setelPackingListBaris1(pl, tanggal) {
  if (typeof draftDataPabean !== "object" || !draftDataPabean) return false;
  if (pl) draftDataPabean.packingListNomor = pl;
  if (tanggal) draftDataPabean.packingListTanggal = tanggal;
  if (typeof isiPackingListForm === "function") isiPackingListForm();
  return !!(pl || tanggal);
}

/* Invoice berkas ke form. Baris ke-1 diisi entri yang nomornya sama
   dengan baris ke-1 -- atau, kalau baris ke-1 masih kosong (atau
   rencananya mengganti), entri pertama -- lewat setImportField:
   prioritas sumber berlaku seperti dulu. Entri lainnya jadi baris ke-2
   dst. (tambahInvoiceLainImpor, invoice-form.js). rencana "gantiSemua"
   (pengguna memilih mengganti invoice lama, dispatch.js): baris ke-1
   ditimpa paksa, baris lainnya dibuang. Hasil: jumlah isian. */
function terapkanInvoiceImpor(entri, src, rencana) {
  if (!entri.length) return 0;
  let n = 0;
  const gantiSemua = rencana === "gantiSemua";
  const k1 = kunciInvoice($("#fInvoice") && $("#fInvoice").value);
  let utama = k1 && !gantiSemua ? entri.find((e) => kunciInvoice(e.nomor) === k1) : null;
  if (!utama && (!k1 || gantiSemua || !rencana || rencana === "ganti")) utama = entri[0];
  if (gantiSemua) {
    // Invoice lama diganti: baris ke-1 dikosongkan dulu (isian yang tidak dibawa CIPL baru tidak tertinggal), baris lain dibuang
    ["fInvoice", "fInvoiceDate"].forEach((id) => {
      if ($("#" + id)) $("#" + id).value = "";
      delete importFieldOrigin[id];
    });
    if (typeof draftDataPabean === "object" && draftDataPabean) {
      delete draftDataPabean.packingListNomor;
      delete draftDataPabean.packingListTanggal;
      if (typeof isiPackingListForm === "function") isiPackingListForm();
    }
    if (typeof bukaInvoiceForm === "function") bukaInvoiceForm([]);
  }
  if (utama) {
    const opsi = gantiSemua ? { force: true } : undefined;
    if (setImportField("fInvoice", utama.nomor, src, opsi)) n++;
    if (setImportField("fInvoiceDate", utama.tanggal, src, opsi)) n++;
    if (setelPackingListBaris1(utama.pl, utama.plTanggal)) n++;
    [
      ["fInvoice", utama.nomor],
      ["fInvoiceDate", utama.tanggal],
      ["fPackingList", utama.pl],
      ["fPackingListDate", utama.plTanggal],
    ].forEach(([id, nilai]) => {
      const el = $("#" + id);
      if (el && nilai && el.value === String(nilai).trim()) delete el.dataset.ikut;
    });
    if (typeof catatTandaInvoiceBaris1 === "function") catatTandaInvoiceBaris1();
  }
  if (typeof lengkapiPasangan === "function") lengkapiPasangan(PASANGAN_CI_PL);
  const lain = entri.filter((e) => e !== utama && !(k1 && !gantiSemua && kunciInvoice(e.nomor) === k1));
  if (lain.length && typeof tambahInvoiceLainImpor === "function") n += tambahInvoiceLainImpor(lain);
  else if (typeof segarkanRentangInvoice === "function") segarkanRentangInvoice();
  return n;
}

function showImportNotes(summary, notes) {
  const box = $("#importNotesBox");
  const summaryEl = $("#importNotesSummary");
  const list = $("#importNotesList");
  if (!summary && !notes.length) {
    box.classList.add("d-none");
    summaryEl.innerHTML = "";
    list.innerHTML = "";
    return;
  }
  summaryEl.innerHTML = summary
    ? `<i class="bi bi-check-circle-fill"></i> ${escapeHtml(summary)}`
    : "";
  list.innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  box.classList.remove("d-none");
}

$("#btnImportExcel").addEventListener("click", () => {
  $("#fileImportExcel").value = "";
  $("#fileImportExcel").click();
});
