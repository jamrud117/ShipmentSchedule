"use strict";

/* ==================================================================
   IMPORT DARI PDF (dokumen PIB BC 2.0)
   Tombol "Import Excel/PDF" sekarang juga menerima file .pdf hasil
   cetak/simpan Pemberitahuan Impor Barang. pdf.js dimuat lazy (baru
   di-fetch saat file .pdf pertama kali dipilih) lewat dynamic import
   dari CDN, supaya pengguna yang cuma pakai Excel tidak perlu
   men-download library ini sama sekali.

   CATATAN JUJUR soal akurasi: teks yang diekstrak dari PDF TIDAK
   selalu mengikuti urutan visual form (label & isi kadang jadi 2
   blok terpisah karena PDF-nya multi-kolom). Bagian yang paling
   bisa diandalkan adalah lembar "PEMENUHAN PERSYARATAN/FASILITAS"
   (satu baris = satu dokumen/fasilitas, urutannya selalu rapi) —
   dari situ SKB (bisa banyak) dan E-COO diambil. Bagian header
   (freight/insurance/NDPBM/berat) memakai urutan tetap sesuai
   template resmi BC 2.0 dan sudah divalidasi silang lewat rumus
   Nilai FOB + Freight + Insurance = Nilai Pabean — tapi tetap
   tandai sebagai "best-effort" karena baru diuji dari 1 contoh
   dokumen. Selalu cek ulang sebelum simpan.
================================================================== */
let pdfjsLibPromise = null;
function ensurePdfJs() {
  if (!pdfjsLibPromise) {
    const VER = "6.1.200";
    pdfjsLibPromise = import(
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VER}/build/pdf.mjs`
    ).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VER}/build/pdf.worker.mjs`;
      return lib;
    });
  }
  return pdfjsLibPromise;
}

// Versi groupPdfItemsIntoLines yang juga membawa koordinat Y & item
// mentah tiap baris (bukan cuma teks gabungannya) — dipakai
// extractItemDetailColumn() di bawah utk membatasi wilayah pencarian
// per kolom x/y. groupPdfItemsIntoLines (versi lama, dipakai di
// hampir semua ekstraksi berbasis teks) jadi cuma pembungkus tipis:
// ambil field .text-nya saja, tidak ada perubahan perilaku sama
// sekali dari sebelumnya.
function groupPdfItemsIntoLinesWithMeta(items, yTolerance = 2.5) {
  const sorted = [...items].sort(
    (a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  );
  const lines = [];
  let current = null;
  let currentY = null;
  sorted.forEach((item) => {
    const y = item.transform[5];
    if (current === null || Math.abs(y - currentY) > yTolerance) {
      current = [];
      lines.push(current);
      currentY = y;
    }
    current.push(item);
  });
  return lines
    .map((line) => line.sort((a, b) => a.transform[4] - b.transform[4]))
    .map((line) => {
      let text = "";
      let prevEnd = null;
      line.forEach((it) => {
        const x = it.transform[4];
        const fontSize =
          Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 1;
        const gapThreshold = Math.max(0.5, fontSize * 0.15);
        if (prevEnd !== null && x - prevEnd > gapThreshold) text += " ";
        text += it.str;
        prevEnd = x + (it.width || 0);
      });
      return { text, y: line[0].transform[5], items: line };
    });
}

// Susun ulang item teks PDF (yang datang sebagai daftar potongan kata
// dengan koordinat x/y) jadi baris-baris teks mengikuti posisi vertikal
// (atas ke bawah), lalu horizontal (kiri ke kanan) dalam 1 baris — jauh
// lebih terbaca utk regex daripada sekadar digabung mentah-mentah.
//
// CATATAN soal spasi: sebagian PDF PIB (terutama kolom "Uraian" isian
// barang) menulis teksnya KARAKTER PER KARAKTER — tiap huruf jadi 1
// "item" pdf.js sendiri dengan jarak x persis 0 dari huruf sebelumnya
// (dipakai dokumen sumbernya utk justify teks supaya pas lebar kolom).
// Kalau tiap ganti item SELALU disambung pakai 1 spasi (perilaku lama),
// hasilnya rusak: "U r a i a n : B E A D R I N G ..." — bikin SEMUA
// regex label di bawah gagal total (termasuk yang nentuin PDF ini
// "dikenali" atau tidak). Makanya spasi HANYA disisipkan kalau memang
// ada jarak horizontal nyata antar-item, diukur relatif ke ukuran
// fontnya (transform[0]) supaya tetap akurat di font besar/kecil —
// dari sampel dokumen nyata, jarak antar-huruf dalam 1 kata yang
// di-justify = 0, sedangkan jarak spasi asli antar-kata = ~30% ukuran
// font, jadi threshold 15% di bawah aman membedakan keduanya.
function groupPdfItemsIntoLines(items, yTolerance = 2.5) {
  return groupPdfItemsIntoLinesWithMeta(items, yTolerance).map((l) => l.text);
}

async function extractPdfText(file) {
  const pdfjsLib = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts = [];
  const pagesItems = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pageTexts.push(groupPdfItemsIntoLines(content.items).join("\n"));
    pagesItems.push(content.items);
  }
  return { text: pageTexts.join("\n\n"), pagesItems };
}

function pibDateToISO(dmy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((dmy || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
// Angka gaya PIB: koma = pemisah ribuan, titik = desimal (mis.
// "17,979,311.70") — beda dari excelNum() yang koma-nya desimal ala ID.
function pibNum(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

// Dipakai handler file-change utk memutuskan "PDF ini PIB atau bukan"
// TANPA bergantung ke field mana pun yang berhasil di-parse posisinya —
// judul dokumen ini SELALU 1 baris utuh di baris paling atas halaman 1,
// jadi jauh lebih tahan-banting dibanding cek "docNo ada / items ada"
// yang gampang false-negative kalau kolom form-nya berantakan.
const PIB_TITLE_RE = /PEMBERITAHUAN\s+IMPOR\s+BARANG/i;

// Ekstraksi qty/satuan/netto per barang berdasarkan KOORDINAT, bukan
// urutan baris teks — field 35 ("Jumlah dan Jenis Satuan Barang" /
// "Berat Bersih (Kg)" / "Jumlah dan Jenis Kemasan") pada template
// resmi BC 2.0 SELALU ada di kolom x ≈ 393-468, terpisah dari kolom
// Uraian (field 32, x kecil) maupun kolom Tarif & Fasilitas (field 34,
// x menengah) — koordinat ini stabil karena formnya baku, jauh lebih
// bisa diandalkan daripada nebak dari jarak baris teks yang gampang
// kena tabrakan kolom sebelah.
//
// Per barang, kolom field 35 ini SELALU berisi 5 baris berurutan dari
// atas ke bawah: [qty, satuan, netto, jumlah kemasan, jenis kemasan].
// Wilayah pencariannya dibatasi vertikal per HALAMAN: dari baris
// "Pos Tarif :" PALING ATAS di halaman itu (awal daftar barang) sampai
// SEBELUM baris "Jenis Pungutan" (tabel BM/PPN/PPh) atau "JAKARTA,"/
// "Importir/PPJK" (blok tanda tangan) — mana yang muncul duluan —
// supaya tidak ikut kebawa nilai dari tabel pajak atau blok lain yang
// kebetulan x-nya nyerempet kolom yang sama.
//
// Hasilnya CUMA dipakai kalau jumlah baris yang ketemu PAS sama
// jumlah barang dikali 5 — kalau ada yang tidak pas (mis. ada baris
// ekstra/kurang krn format beda), semua dilewati; lebih aman kosong
// (isi manual) daripada salah pasang nilai punya barang lain.
// Blok teks kolom "32. Uraian Jenis Barang" per barang, diambil lewat
// KOORDINAT. Perlu karena pada teks polos, baris-baris antar kolom saling
// MENYISIP — nyata ditemui, baris sesudah "Uraian : VERTICAL TURNING
// CENTER FOR FLOW" bukan sambungannya, melainkan "NUMBER OF METODE 1"
// milik kolom 35 & 36, sedangkan sambungan aslinya ("PROSES MANUFAKTUR
// SIDE") baru muncul 2 baris kemudian bercampur teks kolom 33. Akibatnya
// nama barang selalu terpotong di tengah kalimat. Dengan memotong per
// rentang x, isi kolom ini bersih dan sambungannya urut.
function extractItemUraianColumn(pagesItems, nItems) {
  if (!nItems || !pagesItems || !pagesItems.length) return [];
  const results = [];
  pagesItems.forEach((rawItems) => {
    if (!rawItems || !rawItems.length) return;
    const allLines = groupPdfItemsIntoLinesWithMeta(rawItems);
    const lineTopY = (l) => Math.max(...l.items.map((it) => it.transform[5]));
    const posTarifLines = allLines.filter((l) => /Pos Tarif\s*:/.test(l.text));
    if (!posTarifLines.length) return;

    const endYs = allLines
      .filter((l) => /Jenis Pungutan|JAKARTA,|Importir\/PPJK/.test(l.text))
      .map(lineTopY);
    const pageBottomY = endYs.length ? Math.max(...endYs) : -Infinity;

    const h32 = pdfFindItemOnPage(rawItems, /^32\.\s*-?\s*Pos Tarif/i);
    const h33 = pdfFindItemOnPage(rawItems, /^33\.\s*Keterangan/i);
    const xMin = h32 ? h32.x - 8 : 20;
    const xMax = h33 && h33.x > xMin ? h33.x - 6 : 200;

    posTarifLines.forEach((line, i) => {
      const yTop = lineTopY(line) + 1;
      const yBottom =
        i + 1 < posTarifLines.length
          ? lineTopY(posTarifLines[i + 1]) + 1
          : pageBottomY;
      // Digabung dengan SPASI (bukan baris baru) supaya sub-field yang
      // terpotong di tengah ("Tipe: MODEL: PUMA" + "V8300R, Ukuran: ...")
      // menyatu kembali & bisa dibaca satu regex.
      results.push(
        pdfLinesInBox(rawItems, xMin, xMax, { yTop, yBottom })
          .map((l) => l.text.trim())
          .filter(Boolean)
          .join(" "),
      );
    });
  });
  return results.length === nItems ? results : [];
}

function extractItemDetailColumn(pagesItems, nItems) {
  if (!nItems || !pagesItems || !pagesItems.length) return [];
  const results = [];

  pagesItems.forEach((rawItems) => {
    if (!rawItems || !rawItems.length) return;
    const allLines = groupPdfItemsIntoLinesWithMeta(rawItems);

    // Y baris "Pos Tarif :" diambil dari Y item TERTINGGI di baris itu,
    // BUKAN dari l.y (yang isinya Y item paling kiri). Ini bug halus yang
    // bikin ekstraksi gagal total sebelumnya: dalam 1 baris visual, tiap
    // kolom bisa beda Y sampai ~2.4pt (mis. nomor urut barang di x=26
    // ber-Y 713.9 sedangkan angka qty di x=400 ber-Y 716.2). Karena batas
    // atas jendela dulu dihitung dari Y item paling kiri, angka qty
    // barang PERTAMA selalu jatuh DI ATAS batas & ikut terbuang — jumlah
    // token jadi kurang 1 dari yang diharapkan, dan seluruh hasil (qty,
    // satuan, netto SEMUA barang) dibatalkan.
    const lineTopY = (l) => Math.max(...l.items.map((it) => it.transform[5]));
    const posTarifLines = allLines.filter((l) => /Pos Tarif\s*:/.test(l.text));
    if (!posTarifLines.length) return;

    // Batas bawah wilayah barang: tabel pungutan / blok tanda tangan.
    const endYs = allLines
      .filter((l) => /Jenis Pungutan|JAKARTA,|Importir\/PPJK/.test(l.text))
      .map(lineTopY);
    const pageBottomY = endYs.length ? Math.max(...endYs) : -Infinity;

    // Batas kolom field 35 dicari dari posisi header-nya sendiri (dulu
    // di-hardcode 393-468) — ikut menyesuaikan kalau lebar form berbeda.
    const h35 = pdfFindItemOnPage(rawItems, /^35\.\s*-?\s*Jumlah dan Jenis/i);
    const h36 = pdfFindItemOnPage(rawItems, /^36\.\s*-?\s*Nilai Pabean/i);
    const xMin = h35 ? h35.x - 6 : 393;
    const xMax = h36 && h36.x > xMin ? h36.x - 6 : 468;

    posTarifLines.forEach((line, i) => {
      const yTop = lineTopY(line) + 1;
      const yBottom =
        i + 1 < posTarifLines.length
          ? lineTopY(posTarifLines[i + 1]) + 1
          : pageBottomY;
      const tokens = pdfLinesInBox(rawItems, xMin, xMax, { yTop, yBottom }).map(
        (l) => l.text.trim(),
      );
      results.push(tokens);
    });
  });

  if (results.length !== nItems) return [];

  // Token bisa berawalan "-" (varian cetakan CEISA tertentu) dan satuan
  // bisa TERPECAH jadi beberapa baris ("NUMBER OF" lalu "PACKAGE (PK)").
  // Karena itu isi kolom TIDAK lagi dibaca berdasarkan urutan baris yang
  // kaku (dulu wajib persis 5 baris [qty, satuan, netto, jmlKemasan,
  // jenisKemasan] — begitu satu dokumen memakai satuan 2 baris, SELURUH
  // hasil dibatalkan). Sekarang token dipilah dulu berdasarkan PERAN:
  // yang berbentuk angka jadi urutan angka, yang berbentuk teks jadi
  // urutan satuan. Jauh lebih tahan terhadap variasi cetakan.
  const numTok = (s) => {
    const m = /^-?\s*([\d,]+\.?\d*)$/.exec((s || "").trim());
    return m ? pibNum(m[1]) : null;
  };
  // "SET (SET)" -> "SET" · "NUMBER OF PACKAGE (PK)" -> "PK"
  const satuanCode = (s) => {
    const t = (s || "").trim();
    const inKurung = /\(([A-Z0-9]{1,12})\)\s*$/i.exec(t);
    if (inKurung) return inKurung[1].toUpperCase();
    return t.split("(")[0].trim().toUpperCase();
  };
  // Teks satuan yang terpecah disambung: potongan yang BELUM diakhiri
  // kode dalam kurung dianggap awalan dari potongan sesudahnya.
  const joinSatuanParts = (texts) => {
    const out = [];
    let buf = "";
    texts.forEach((t) => {
      const cur = (buf ? buf + " " : "") + t;
      if (/\([A-Z0-9]{1,12}\)\s*$/i.test(t)) {
        out.push(cur);
        buf = "";
      } else {
        buf = cur;
      }
    });
    if (buf) out.push(buf);
    return out;
  };
  // Urutan baku field 35 (atas ke bawah, per barang):
  //   [0] jumlah satuan barang (qty)   [1] jenis satuan, mis. "SET (SET)"
  //   [2] berat bersih (netto)         [3] jumlah kemasan
  //   [4] jenis kemasan, mis. "PACKAGE (PK)"
  return results.map((tokens) => {
    const nums = [];
    const texts = [];
    tokens.forEach((t) => {
      const n = numTok(t);
      if (n != null) nums.push(n);
      else if ((t || "").trim()) texts.push(t.trim().replace(/^-\s*/, ""));
    });
    const satuanParts = joinSatuanParts(texts);
    // Urutan baku field 35: jumlah satuan barang, berat bersih, lalu
    // jumlah kemasan. Satuan barang = potongan teks pertama, jenis
    // kemasan = potongan berikutnya (kalau dokumennya memisahkan).
    const qty = nums.length > 0 ? nums[0] : null;
    const netto = nums.length > 1 ? nums[1] : null;
    const pkgQty = nums.length > 2 ? nums[2] : null;
    const satuan = satuanParts.length ? satuanCode(satuanParts[0]) : "";
    const pkgJenis =
      satuanParts.length > 1 ? satuanCode(satuanParts[1]) : satuan;
    if (qty == null || qty <= 0 || !satuan || netto == null) return null;
    return {
      qty,
      satuan,
      netto,
      // Kemasan per barang (requirement C: "Package Per Item (Import):
      // kalau tidak ada rincian package per item, isi saja di item
      // pertama"). Di PIB, jumlah kemasan memang cuma diisi di barang
      // yang "membawa" kemasannya — barang lain 0, dan itu memang benar
      // apa adanya, jadi diteruskan seperti di dokumen.
      packageQty: pkgQty,
      packageJenis: pkgJenis,
    };
  });
}

function parsePibPdfText(text, pagesItems) {
  const notes = [];
  const grab = (re) => {
    const mm = text.match(re);
    return mm ? mm[1].trim() : "";
  };
  // Field 1-baris yang labelnya kadang kena tempel nomor field LAIN di
  // ujungnya (kolom sebelah numpang di baris yang sama akibat tata
  // letak 2 kolom form ini) — potong sebelum penanda field baru itu
  // muncul, mis. "PT ... INDONESIA 16. Transaksi" -> berhenti sebelum
  // " 16. ".
  const stopAtNextField = (s) =>
    (s || "").split(/\s+\d{1,2}[a]?\.\s+(?=[A-Z])/)[0].trim();

  // --- Lembar "Pemenuhan Persyaratan/Fasilitas": baris per baris,
  // paling reliable karena tidak ada kolom bersisian yang bikin teks
  // ekstraksi jadi kacau. Dari sini: Invoice, AWB, Master AWB, semua
  // SKB (bisa lebih dari 1), dan E-COO. Kolom terakhir tabel ini ("YA /
  // TIDAK" — dokumen dilampirkan atau tidak) ada di baris yang sama
  // dengan nomor dokumen jadi kadang ikut nempel; dibuang lewat grup
  // opsional di regex-nya + dibersihkan sekali lagi sebagai jaring
  // pengaman. Label yang panjang (mis. "ELECTRONIC CERTIFICATE OF
  // ORIGIN (E-CO)") kadang wrap ke baris berikutnya SEBELUM "Tgl." —
  // makanya ada toleransi sampai ~20 karakter tambahan sebelum "Tgl.".
  const docTableRe =
    /(\d+)\s+(\d{3})\s+([A-Z][A-Z()./\-\s]*?)\s*No\.\s*([^\n]+?)(?:\s+YA\s*\/\s*TIDAK)?\s*\n\s*[^\n]{0,20}?Tgl\.\s*(\d{2}-\d{2}-\d{4})/g;
  const docRows = [];
  let m;
  while ((m = docTableRe.exec(text))) {
    const nomorClean = m[4]
      .trim()
      .replace(/\s+YA\s*\/\s*TIDAK\s*$/i, "")
      .trim();
    docRows.push({ label: m[3].trim(), nomor: nomorClean, tanggalDMY: m[5] });
  }
  const findDoc = (re) => docRows.find((r) => re.test(r.label));
  const invoiceRow = findDoc(/^INVOICE$/i);
  // "AWB" (udara) atau "B/L" polos (laut) sama-sama berarti dokumen level
  // house (lawan dari "MASTER AWB"/"MASTER B/L") -- sebelumnya cuma AWB/
  // HOUSE yg dikenali, jadi PIB pengiriman LAUT (label dokumennya "B/L",
  // bukan "AWB") houseBL-nya selalu kosong walau datanya ada di tabel.
  const houseRow = findDoc(/^(AWB|B\/?L)$/i) || findDoc(/HOUSE/i);
  const masterRow = findDoc(/MASTER\s*(AWB|B\/?L)/i);
  const skbRows = docRows.filter((r) =>
    /SURAT KETERANGAN BEBAS/i.test(r.label),
  );
  const ecoRow = findDoc(/ELECTRONIC CERTIFICATE OF ORIGIN|\bE-?CO\b/i);

  const skbList = skbRows.map((r) => {
    const tm = /\(SKB\)\s*([A-Z%0-9]*)/i.exec(r.label);
    const raw = (tm && tm[1] ? tm[1] : "").toUpperCase();
    const known =
      SKB_TYPE_OPTIONS.includes(raw) && raw !== "LAINNYA" ? raw : null;
    return known
      ? {
          jenis: known,
          jenisLainnya: "",
          nomor: r.nomor,
          tanggal: pibDateToISO(r.tanggalDMY),
        }
      : {
          jenis: "Lainnya",
          jenisLainnya: raw || "SKB",
          nomor: r.nomor,
          tanggal: pibDateToISO(r.tanggalDMY),
        };
  });

  // --- Nomor Aju & Nomor/Tanggal Pendaftaran (SPPB): diambil dari
  // baris "Nomor Pengajuan : ... Tanggal Pengajuan : ..." (kop di
  // SETIAP halaman) dan "Nomor : ... Tanggal : ..." (kop lembar
  // lanjutan Pemenuhan Persyaratan) — keduanya SELALU 1 baris utuh
  // tanpa kolom bersisian, jauh lebih stabil dibanding pola lama yang
  // mengandalkan urutan "label lalu isi di baris terpisah" ala field
  // "G. Nomor dan Tanggal Pendaftaran" yang gampang berantakan kena
  // kolom PENGIRIM di sebelahnya. Pola lama tetap disimpan sebagai
  // fallback kalau lembar lanjutannya tidak ada/tidak kebaca.
  const noAju = grab(/Nomor Pengajuan\s*:\s*(\S+)/);
  const pendaftaranMatch =
    text.match(/\bNomor\s*:\s*(\d+)\s*Tanggal\s*:\s*(\d{2}-\d{2}-\d{4})/) ||
    text.match(
      /G\.\s*Nomor dan Tanggal Pendaftaran[\s\S]*?\n(\d{4,})\n(\d{2}-\d{2}-\d{4})/,
    );

  // --- Field berlabel jelas yang isinya 1 baris. Anchor pakai nomor
  // field resminya (mis. "9.", "11.", "12.") sesuai penomoran form BC
  // 2.0 — lebih presisi daripada cuma cocokkan nama labelnya sendiri,
  // karena nomor field itu unik & tidak mungkin ketemu di tempat lain
  // di dokumen (idenya sama kayak dipakai di label 3/23/24/25 yang
  // sudah lebih dulu jalan).
  // PERBAIKAN BUG (requirement A): "Nama Shipper" pada Jadwal Import =
  // PENGIRIM, yaitu field 1 — BUKAN field 3 (IMPORTIR), yang isinya
  // justru PT DDI sendiri sebagai penerima barang. Versi sebelumnya
  // memakai field 3 sehingga Nama Shipper SELALU salah terisi nama
  // perusahaan sendiri. Field 1a (PENJUAL) dipakai sbg cadangan kalau
  // PENGIRIM kosong (sebagian PIB cuma mengisi salah satunya).
  // Kolom kanan ("G. Nomor dan Tanggal Pendaftaran") sering numpang di
  // baris yang sama, jadi nomor pendaftaran 4+ digit ikut menempel di
  // ujung nama ("CHANGYOUNG TOOLING CO.,LTD 463276") -- dipotong di sini.
  const stripTrailingRegNo = (s) => (s || "").replace(/\s+\d{4,}\s*$/, "").trim();
  const partyName = stripTrailingRegNo(
    stopAtNextField(grab(/(?:^|\n)1\.\s*Nama,\s*Alamat\s*:\s*([^\n]+)/)) ||
      stopAtNextField(grab(/1a\.\s*Nama,\s*Alamat\s*:\s*([^\n]+)/)),
  );
  // Nama Forwarder diambil dari nama PPJK (field 7). Perhatikan: di
  // sebagian PIB label ini TIDAK diikuti titik dua ("7. Nama, Alamat
  // KAY OCEAN INDONESIA"), makanya ":" dibuat opsional.
  const forwarder = stopAtNextField(
    grab(/7\.\s*Nama,\s*Alamat\s*:?\s*([^\n]+)/),
  );
  const pelabuhanMuat = grab(/12\.\s*Pelabuhan Muat\s*:\s*([^\n]+)/);
  const transportMatch = text.match(
    /9\.\s*Cara Pengangkutan\s*:\s*(UDARA|LAUT)/i,
  );
  const etaMatch = text.match(
    /11\.\s*Perkiraan Tanggal Tiba\s*:\s*(\d{2}-\d{2}-\d{4})/,
  );
  // Pelabuhan Tujuan sering kepotong jadi 2 baris (nama lalu kode
  // bandara/pelabuhan) — baris ke-2 ikut disambung KALAU memang cuma
  // berisi kode singkat huruf besar (mis. "IDCGK"), supaya tidak asal
  // menempel baris tak terkait kalau formatnya beda.
  const destM = text.match(/14\.\s*Pelabuhan Tujuan\s*:\s*([^\n]+)\n([^\n]+)/);
  let destination = destM ? destM[1].trim() : "";
  if (destM && /^[A-Z]{3,6}$/.test(destM[2].trim()))
    destination += " " + destM[2].trim();
  // Incoterm paling stabil diambil dari field "23. Nilai : <INCOTERM>
  // <angka>" — bukan dari asumsi posisi baris di dekat kata PENGIRIM.
  const incoterm = grab(/23\.\s*Nilai\s*:\s*([A-Z]{3})\b/).toUpperCase();
  const nilaiFobMatch = text.match(/23\.\s*Nilai\s*:\s*[A-Z]*\s*([\d,.]+)/);
  const asuransiMatch = text.match(/24\.\s*Asuransi\/LDN\s*:\s*([\d,.]+)/);
  const freightMatch = text.match(/25\.\s*Freight\s*:\s*([\d,.]+)/);
  // NDPBM: labelnya ("22. NDPBM :") dan angkanya sering terpisah >1
  // baris (kolom NPWP PPJK numpang di antaranya), tapi angkanya SELALU
  // muncul tepat sesudah teks "US DOLLAR" (nama lengkap mata uang) —
  // penanda yang jauh lebih stabil daripada jarak baris ke label.
  const ndpbmMatch = text.match(/US DOLLAR\s+([\d,.]+)/i);
  // Berat Kotor/Berat Bersih TOTAL (field 29/30) + Package (field 28,
  // "Jumlah, Jenis, dan Merek Kemas", mis. "1 BOX, Tanpa Merk"). Diasumsikan
  // sebelumnya ini 1 baris bersih langsung sesudah header field 27-30 --
  // TERNYATA kalau peti-nya lebih dari 1 (umum utk kargo laut), baris
  // kemasan ("2 PACKAGE, Tanpa Merk") dan baris angka berat (nempel di
  // baris kode peti PERTAMA, mis. "HDMU2770419 20 FCL 12,800.0000
  // 10,980.0000") jadi 2 baris TERPISAH, bukan satu — dicari independen
  // supaya tetap kebaca di kedua kasus (1 baris gabung ATAU 2 baris
  // terpisah).
  const berat27to30Idx = text.search(/Berat Kotor[^\n]*Berat Bersih/);
  const berat27to30Window =
    berat27to30Idx === -1
      ? ""
      : text.slice(berat27to30Idx, berat27to30Idx + 400);
  // Baris kemasan: dimulai angka lalu kata kemasan umum (PACKAGE/COLLI/
  // KEMASAN/dst), TIDAK diawali kode peti ala ISO 6346 (4 huruf+7 angka).
  const packageTextMatch = berat27to30Window.match(
    /^(\d+\s+(?:PACKAGE|PACKAGES|KEMASAN|COLLI|CARTON|CARTONS|KOLI|PALLET|PALLETS|CRATE|CRATES|DRUM|DRUMS|BOX|BOXES)\b[^\n]*)$/im,
  );
  // Field 28 sering memuat uraian kemasan yang panjang:
  //   "4 BOX, WOODEN, NATURAL WOOD, ORDINARY,"
  // Yang dibutuhkan kotak Total Package hanya JUMLAH + JENIS-nya
  // ("4 BOX"); sisanya keterangan bahan yang justru bikin kotaknya
  // meluber dan koma menggantung ikut tersimpan.
  const packageDefault = (() => {
    const raw = packageTextMatch ? packageTextMatch[1].trim() : "";
    if (!raw) return "";
    const m = /^([\d.,]+)\s+([A-Za-z]+)/.exec(raw);
    return m ? `${m[1]} ${m[2].toUpperCase()}` : raw.replace(/[,\s]+$/, "");
  })();
  // Angka berat: baris APA PUN dlm jendela ini yg diakhiri PERSIS 2 angka
  // desimal (kotor lalu bersih) -- baik itu masih nempel di baris kemasan
  // (format lama, 1 peti) maupun di baris kode peti (format baru, >1 peti).
  const beratNumMatch = berat27to30Window.match(
    /^[^\n]*?([\d,]+\.\d+)\s+([\d,]+\.\d+)\s*$/m,
  );
  const beratMatch = beratNumMatch
    ? [beratNumMatch[0], packageDefault, beratNumMatch[1], beratNumMatch[2]]
    : null;
  // BM/PPN/PPh (field 37/41/43, tabel "Jenis Pungutan"): tabelnya
  // punya 6 kolom (Dibayar/Ditanggung/Ditunda/Tidak Dipungut/
  // Dibebaskan/Telah Dilunasi) — HANYA kolom Dibayar (angka PERTAMA di
  // baris masing-masing) yang diambil, sesuai permintaan. Anchor pakai
  // nomor field + label PERSIS (case-sensitive, "PPh" bukan "PPH")
  // supaya baris "BM KITE"/"PPnBM" (yang juga diawali "BM"/"PPn") tidak
  // ikut ketangkep — begitu nama field diikuti spasi lalu ANGKA, baris
  // "BM KITE 0.00..."/"PPnBM 0.00..." otomatis gagal cocok karena kata
  // "KITE"/"BM" nempel langsung tanpa spasi+angka di posisi itu.
  const bmM = text.match(/^\d+\.\s*BM\s+([\d,.]+)/m);
  const ppnM = text.match(/^\d+\.\s*PPN\s+([\d,.]+)/m);
  const pphM = text.match(/^\d+\.\s*PPh\s+([\d,.]+)/m);

  // --- Nama sarana pengangkut & no. voyage/flight (field 10): bendera
  // (2 huruf) nempel langsung di label jadi paling stabil diambil
  // duluan. Nama vessel/maskapai & nomor voyage ada di beberapa baris
  // sesudahnya tapi kolom PENJUAL di sebelahnya sering ikut nyelip
  // (mis. "PENJUAL CN" muncul sebelum nama maskapai aslinya) — nomor
  // voyage/flight dicari lewat pola khas kode maskapai (2-3 huruf +
  // 3-5 angka, mis. "GA0879"), nama vessel diambil dari baris
  // ALL-CAPS pertama di jendela yang sama yang BUKAN header blok
  // pihak lain. Best-effort — boleh kosong, sudah ditandai di notes.
  let vessel = "";
  let voyage = "";
  const saranaWindow = text.match(/Nama Sarana Pengangkutan[\s\S]{0,320}/);
  if (saranaWindow) {
    const w = saranaWindow[0];
    // Dua gaya penomoran voyage yg sama-sama umum: huruf lalu angka
    // (kode maskapai penerbangan, mis. "GA0879") ATAU angka lalu 1-2
    // huruf (nomor voyage kapal laut, mis. "0025W" -- W/E/N/S di
    // belakang sering jadi indikator arah pelayaran). Sebelumnya cuma
    // pola pertama yg dikenali, jadi dokumen pengiriman LAUT (mayoritas
    // PIB BC 2.0 dari pelabuhan) selalu voyage-nya kosong.
    const voyM = w.match(/\b([A-Z]{1,3}\d{3,5}|\d{3,5}[A-Z]{1,2})\b/);
    if (voyM) voyage = voyM[1];
    const EXCLUDE_WORDS = [
      "PENGIRIM",
      "PENJUAL",
      "PEMILIK",
      "IMPORTIR",
      "PPJK",
      "NAMA SARANA",
    ];
    /* Nama sarana pengangkut selalu TEPAT DI BAWAH baris moda
       ("LAUT 1" / "UDARA 4"), lalu disusul kode bendera, nama negara,
       dan tanggal perkiraan tiba:

           LAUT 1
           BELAWAN          <- nama sarana
           HK               <- kode bendera
           HONG KONG SAR    <- negara
           28-07-2026       <- perkiraan tiba

       Aturan lama mencari baris huruf kapital mana pun yang MENGANDUNG
       SPASI. Syarat spasi itu menyaring kata nyasar, tapi sekaligus
       menolak nama kapal SATU KATA — dan itu umum sekali ("BELAWAN",
       "MERATUS", "TIANJIN"). Sekarang POSISI-nya yang jadi patokan,
       bukan bentuk namanya. */
    const barisW = w.split("\n").map((l) => l.trim());
    const idxModa = barisW.findIndex((l) =>
      /^(LAUT|UDARA|DARAT)\s+\d+$/.test(l),
    );
    if (idxModa !== -1) {
      for (let i = idxModa + 1; i < Math.min(idxModa + 5, barisW.length); i++) {
        const cand = barisW[i];
        if (!cand) continue;
        if (/^[A-Z]{2}$/.test(cand)) continue; // kode bendera, bukan nama
        if (/^\d{2}-\d{2}-\d{4}$/.test(cand)) break; // sudah sampai tanggal
        if (
          /^[A-Z][A-Z0-9\s./&'-]{2,45}$/.test(cand) &&
          !EXCLUDE_WORDS.some((word) => cand.includes(word))
        ) {
          vessel = cand;
          break;
        }
      }
    }
    // Cadangan untuk cetakan yang susunannya berbeda.
    if (!vessel) {
      const candidate = barisW.find(
        (l) =>
          /^[A-Z][A-Z0-9\s./&'-]{3,45}$/.test(l) &&
          !/^\d/.test(l) &&
          !EXCLUDE_WORDS.some((word) => l.includes(word)),
      );
      if (candidate) vessel = candidate;
    }
  }

  // --- Kontainer & Jenis Muatan (field 27, requirement A: "Kontainer
  // (biasanya ada di poin 27 PIB)"). Kolom 27 bersebelahan dengan kolom
  // 28 (Jumlah/Jenis Kemasan) pada Y yang SAMA, jadi kalau dibaca sbg
  // teks polos isinya nempel ("4 BOX, WOODEN..." punya field 28 ikut
  // terbaca sbg nomor peti). Dipisah lewat KOORDINAT: batas kanan kolom
  // 27 = posisi x label "28." itu sendiri. Nomor peti kemas mengikuti
  // ISO 6346 (4 huruf + 6-7 angka); ukuran/jenis muatan (20/40, FCL/LCL)
  // ikut diambil kalau ada.
  const petiKemas = (() => {
    const out = { container: "", muatan: "" };
    const hit27 = pdfFindItem(pagesItems, /^27\.\s*Nomor/i);
    const hit28 = pdfFindItem(pagesItems, /^28\.\s*Jumlah/i);
    if (!hit27) return out;
    const pageItems = pagesItems[hit27.page] || [];
    const xMax = hit28 && hit28.x > hit27.x ? hit28.x - 3 : hit27.x + 200;
    // Wilayah vertikal: dari baris header 27 ke bawah, berhenti sebelum
    // header tabel barang (baris "31." / "32. - Pos Tarif HS").
    const stopY = (() => {
      const hit = pdfFindItemOnPage(pageItems, /^32\.\s*-?\s*Pos Tarif/i);
      return hit ? hit.y : -Infinity;
    })();
    const lines = pdfLinesInBox(pageItems, hit27.x - 3, xMax, {
      yTop: hit27.y - 1,
      yBottom: stopY,
    });
    const blob = lines.map((l) => l.text).join(" ");
    const cont = blob.match(/\b([A-Z]{4}\s?\d{6,7})\b/g);
    if (cont) out.container = cont.join(", ").replace(/\s+/g, "");
    const mu = blob.match(/\b(FCL|LCL)\b/i);
    if (mu) out.muatan = mu[1].toUpperCase();
    return out;
  })();

  // --- Tanggal B/L & AWB (dipakai menurunkan ETD — requirement A:
  // "ETD (dari tanggal Master BL/AWB)"). Baris field 17/18 dibaca
  // langsung karena di situ nomor & tanggalnya sudah sebaris; tabel
  // dokumen di lembar lanjutan dipakai sbg cadangan.
  const masterBlM = text.match(
    /Master-BL\/AWB\s*:\s*No\.\s*(\S+)\s*Tgl\.\s*(\d{2}-\d{2}-\d{4})/i,
  );
  const houseBlM = text.match(
    /17\.\s*House-BL\/AWB\s*:\s*No\.\s*(\S+)\s*Tgl\.\s*(\d{2}-\d{2}-\d{4})/i,
  );
  const masterBlDate =
    (masterBlM && pibDateToISO(masterBlM[2])) ||
    (masterRow && pibDateToISO(masterRow.tanggalDMY)) ||
    "";
  const houseBlDate =
    (houseBlM && pibDateToISO(houseBlM[2])) ||
    (houseRow && pibDateToISO(houseRow.tanggalDMY)) ||
    "";

  const fields = {
    noAju,
    docNo: pendaftaranMatch ? pendaftaranMatch[1] : "",
    docDate: pendaftaranMatch ? pibDateToISO(pendaftaranMatch[2]) : "",
    party: partyName,
    forwarder,
    container: petiKemas.container,
    muatan: petiKemas.muatan,
    invoice: invoiceRow ? invoiceRow.nomor : "",
    masterBL: masterRow ? masterRow.nomor : (masterBlM ? masterBlM[1] : ""),
    houseBL: houseRow ? houseRow.nomor : (houseBlM ? houseBlM[1] : ""),
    masterBlDate,
    houseBlDate,
    origin: portDisplay(pelabuhanMuat),
    destination: portDisplay(destination),
    incoterm,
    transport: transportMatch
      ? transportMatch[1].toUpperCase() === "UDARA"
        ? "udara"
        : "laut"
      : "",
    vessel,
    voyage,
    ndpbm: ndpbmMatch ? pibNum(ndpbmMatch[1]) : null,
    freight: freightMatch ? pibNum(freightMatch[1]) : null,
    insurance: asuransiMatch ? pibNum(asuransiMatch[1]) : null,
    bm: bmM ? pibNum(bmM[1]) : null,
    ppn: ppnM ? pibNum(ppnM[1]) : null,
    pph: pphM ? pibNum(pphM[1]) : null,
    // "2 PACKAGE, Tanpa Merk" -> "2 PACKAGE" (merek kemasan bukan bagian
    // dari jumlah/jenis kemasan yang dipakai Total Package).
    package: (packageDefault || "")
      .replace(/,\s*(Tanpa\s+Merk|Tanpa\s+Merek|-)\s*$/i, "")
      .trim(),
  };

  // --- ETD / ETA / Actual Delivery (requirement A)
  //   ETD    = tanggal Master BL/AWB (cadangan: House BL/AWB — sebagian
  //            PIB laut cuma mencantumkan satu B/L)
  //   ETA    = laut  : ETD + 1 minggu
  //            udara : hari yang SAMA dengan ETD
  //   Actual = ETA + 3 hari (laut maupun udara)
  fields.etd = masterBlDate || houseBlDate || "";
  fields.eta = deriveEtaFromEtd(fields.etd, fields.transport);
  fields.actual = deriveActualFromEta(fields.eta);
  if (!fields.etd) {
    notes.push(
      "Tanggal Master/House BL-AWB tidak terbaca, jadi ETD (dan ETA & Actual Delivery yang diturunkan darinya) tidak terisi — isi manual.",
    );
  } else {
    // Field 11 PIB ("Perkiraan Tanggal Tiba") adalah perkiraan versi
    // dokumen itu sendiri. ETA yang dipakai aplikasi SENGAJA diturunkan
    // dari ETD sesuai aturan yang diminta — kalau keduanya beda, cukup
    // diberitahukan supaya user bisa memutuskan mana yang dipakai.
    const pibEta = etaMatch ? pibDateToISO(etaMatch[1]) : "";
    if (pibEta && pibEta !== fields.eta) {
      notes.push(
        `ETA diisi ${fields.eta} (aturan: ${fields.transport === "udara" ? "sama dengan ETD" : "ETD + 1 minggu"}). Dokumen PIB sendiri mencantumkan Perkiraan Tanggal Tiba ${pibEta} di field 11 — ganti manual kalau yang dipakai angka dokumen.`,
      );
    }
  }

  // --- Barang: field 32 form resmi BC 2.0 urutannya SELALU "Pos Tarif
  // HS" dulu, baru "Uraian Jenis Barang, Merek, Tipe, Ukuran,
  // Spesifikasi lain", lalu "Negara Asal Barang" (1 sel gabungan per
  // barang) — jadi tiap "Pos Tarif :" menandai AWAL 1 barang baru, dan
  // field lain dicari DI DALAM potongan teks milik barang itu (dari 1
  // "Pos Tarif :" ke "Pos Tarif :" berikutnya), bukan dengan jarak/
  // urutan kaku — supaya tahan terhadap kolom "34. Tarif dan
  // Fasilitas" di sebelahnya yang sering ikut ke-gabung ke baris yang
  // sama.
  //
  // Nama barang = gabungan Uraian + Merk + Tipe + Ukuran + Spesifikasi
  // lain (persis sub-baris field 32 itu sendiri), bukan cuma Uraian
  // saja. Merk/Tipe/Ukuran/Spesifikasi lain masing-masing DILEWATI
  // (tidak ikut digabung) kalau isinya kosong, "-", "TANPA MEREK",
  // atau "TANPA TIPE" — dianggap tidak ada isinya. Field-field ini
  // (Merk:X, Tipe:Y, Ukuran:Z,) dibatasi KOMA jadi presisi walau ada
  // teks kolom sebelah yang ikut nempel SETELAH koma terakhirnya.
  // "Uraian" sendiri tidak punya pembatas koma seperti itu, jadi tetap
  // perlu dipotong pakai TAX_COLUMN_BLEED — daftar pola baku field 34
  // ("34. Tarif dan Fasilitas") yang sering ikut ke-gabung ke baris
  // yang sama, mis. "- PREFERENSI TARIF...", "PPH 2.5% 100% BBS",
  // "METODE 1". Ini pola BLACKLIST (tahu apa yang harus dibuang),
  // beda dari Merk/Tipe/dst yang WHITELIST (tahu persis batasnya).
  // "34. Tarif dan Fasilitas" BUKAN satu-satunya kolom tetangga yang suka
  // ikut ke-gabung ke baris Uraian -- legenda field 33 "Keterangan" (yang
  // berisi daftar "- KETERANGAN PAJAK (5)", "- SURAT PERSETUJUAN IMPOR
  // DEP.DAG (6-1)", "- LAPORAN SURVEYOR / DEPDAG (7)", "- PREFERENSI
  // TARIF IMPORTASI ... (8)") posisinya SERING pas se-Y dg baris Uraian
  // juga (nyata ketemu: "SURAT PERSETUJUAN" nyambung tepat ke "Uraian :
  // VERTICAL TURNING CENTER FOR FLOW"), jadi ikut masuk daftar blacklist.
  const TAX_COLUMN_BLEED =
    /\s+-?\s*(?:KETERANGAN PAJAK\b|SURAT PERSETUJUAN\b|LAPORAN SURVEYOR\b|PREFERENSI TARIF\b|IMPOR(?:TASI)?\s+(?:DEP\.?DAG\b|[A-Z-]+(?:\s*\([A-Z]+\))?)|METODE\s*\d|(?:BM|PPH|PPN|PPnBM|Cukai)\s+\d+(?:[.,]\d+)?\s*%)/i;
  const isEmptySpecValue = (v) => {
    const t = (v || "").trim();
    return (
      !t || t === "-" || /^tanpa\s+merek$/i.test(t) || /^tanpa\s+tipe$/i.test(t)
    );
  };
  const posTarifMatches = [];
  const posTarifRe = /Pos Tarif\s*:\s*(\d+)/g;
  let ptm;
  while ((ptm = posTarifRe.exec(text))) {
    posTarifMatches.push({ index: ptm.index, hsCode: ptm[1].trim() });
  }
  // Koordinat (lebih diandalkan) dicoba duluan; hasilnya array sepanjang
  // jumlah barang, tiap slot {qty,satuan,netto} atau null kalau bentuk
  // kolomnya tidak sesuai dugaan (lihat extractItemDetailColumn).
  const columnResults = extractItemDetailColumn(
    pagesItems,
    posTarifMatches.length,
  );
  const uraianBlocks = extractItemUraianColumn(
    pagesItems,
    posTarifMatches.length,
  );
  const rawItems = posTarifMatches
    .map((pt, i) => {
      const blockEnd =
        i + 1 < posTarifMatches.length
          ? posTarifMatches[i + 1].index
          : text.length;
      // Blok hasil potong koordinat lebih dipercaya; teks polos cuma
      // dipakai kalau koordinatnya gagal (mis. PDF hasil scan).
      const block = uraianBlocks[i] || text.slice(pt.index, blockEnd);
      // Uraian = teks setelah "Uraian :" sampai sub-field berikutnya.
      // Karena blok sudah bersih per kolom, sambungan baris otomatis
      // ikut tergabung tanpa perlu menebak baris mana lanjutannya.
      const uraianRe =
        /Uraian\s*:\s*(.+?)(?=\s*(?:Merk\s*:|Kondisi\s*Brg|Negara\s*:|Pos Tarif\s*:)|$)/i;
      const uraianM = uraianRe.exec(block);
      const mtuM =
        /Merk:\s*([^,\n]*),\s*Tipe:\s*([^,\n]*),\s*Ukuran:\s*([^,\n]*),/i.exec(
          block,
        );
      const spekM = /Spesifikasi lain:\s*([^,\n]*),/i.exec(block);

      const nameParts = [];
      if (uraianM) {
        const uraianClean = uraianM[1].trim().split(TAX_COLUMN_BLEED)[0].trim();
        if (uraianClean) nameParts.push(uraianClean);
      }
      if (mtuM) {
        if (!isEmptySpecValue(mtuM[1])) nameParts.push(mtuM[1].trim());
        if (!isEmptySpecValue(mtuM[2])) nameParts.push(mtuM[2].trim());
        if (!isEmptySpecValue(mtuM[3])) nameParts.push(mtuM[3].trim());
      }
      if (spekM && !isEmptySpecValue(spekM[1])) nameParts.push(spekM[1].trim());
      const namaBarang = stripFieldLabels(nameParts.join(" "));

      // Fallback berbasis teks (jarang cocok krn kolom sering ke-gabung)
      // — dipakai HANYA kalau extractItemDetailColumn (koordinat, lebih
      // diandalkan) tidak menghasilkan apa-apa utk barang ini.
      const col = columnResults[i];
      let qty = null;
      let netto = null;
      let satuan = "";
      if (col) {
        qty = col.qty;
        netto = col.netto;
        satuan = col.satuan;
      } else {
        const qtyM =
          /Pos Tarif\s*:\s*\d+[^\n]*\n\s*([\d.]+)\n\s*([\d.]+)\n\s*(\d+)\n\s*([A-Z]+)\s*\(([A-Z]+)\)/.exec(
            block,
          );
        if (qtyM) {
          qty = pibNum(qtyM[1]);
          netto = pibNum(qtyM[2]);
          satuan = qtyM[4];
        }
      }
      return {
        namaBarang,
        hsCode: pt.hsCode,
        qty,
        netto,
        satuan,
        packageQty: col ? col.packageQty : null,
        packageJenis: col ? col.packageJenis : "",
      };
    })
    .filter((it) => it.namaBarang);

  // Berat Kotor (bruto) di form BC 2.0 CUMA ada di level pengiriman
  // (field 29, total) — tidak ada kolom bruto per barang sama sekali.
  // Sebagai perkiraan terbaik, total itu dibagi proporsional ke tiap
  // barang berdasarkan porsi netto-nya (barang yang lebih berat netto
  // dapat porsi bruto lebih besar) — jauh lebih masuk akal daripada
  // taruh semua di barang pertama & 0 di sisanya. Kalau netto tidak
  // diketahui sama sekali (semua barang gagal ke-parse), dibiarkan cara
  // lama: semua ditaruh di barang pertama saja.
  const totalBrutoVal = beratMatch ? pibNum(beratMatch[2]) : null;
  const totalNettoKnown = rawItems.reduce(
    (sum, it) => sum + (it.netto || 0),
    0,
  );

  const items = rawItems.map((it, idx) => {
    const base = {
      ...newItem(),
      namaBarang: it.namaBarang,
      hsCode: it.hsCode,
      jenisBarang: "Bahan Baku",
    };
    const gotQty = it.qty != null;
    if (gotQty) base.qty = it.qty;
    // Kemasan PER BARANG dari kolom field 35 ("Jumlah dan Jenis
    // Kemasan"). Di PIB, jumlah kemasan cuma dicantumkan pada barang
    // yang "membawa" kemasan itu; barang lain 0 — dibiarkan apa adanya
    // supaya Total Package (yang menjumlah kolom ini) tidak dobel.
    if (it.packageQty != null && it.packageQty > 0) {
      base.package = [fmtPibNumber(it.packageQty, 2), it.packageJenis]
        .filter(Boolean)
        .join(" ");
    }
    if (it.netto != null) base.netto = it.netto;
    if (it.satuan) base.satuan = it.satuan;
    if (rawItems.length === 1 && gotQty) {
      const nilaiFob = nilaiFobMatch ? pibNum(nilaiFobMatch[1]) : null;
      if (nilaiFob != null && base.qty)
        base.harga = roundNum(nilaiFob / base.qty, 4);
    }
    if (!gotQty) {
      notes.push(
        `Barang #${idx + 1} ("${it.namaBarang}"): qty/satuan/berat tidak terbaca otomatis dari PDF — isi manual.`,
      );
    }
    return base;
  });
  // Bruto = TOTAL dokumen (field 29), ditaruh di barang pertama saja.
  applyTotalBrutoToFirstItem(items, totalBrutoVal);

  // Requirement C: "Package Per Item (Import): kalau tidak ada rincian
  // package per item, isi saja di item pertama."
  if (items.length && !items.some((it) => (it.package || "").trim())) {
    if (packageDefault) items[0].package = packageDefault;
  }

  if (rawItems.length > 1 && rawItems.some((it) => it.qty != null)) {
    notes.push(
      "Harga satuan (USD) tidak dihitung otomatis untuk PDF dengan lebih dari 1 barang (nilai pabean per barang tidak diambil) — isi manual per barang di tab Daftar Barang.",
    );
  }

  // E-COO sekarang cuma salah satu entri di array skb yang sama (jenis
  // "E-COO"), bukan field terpisah — digabung ke skbList SEBELUM
  // diterapkan ke barang.
  if (ecoRow) {
    skbList.push({
      jenis: "E-COO",
      jenisLainnya: "",
      nomor: ecoRow.nomor,
      tanggal: pibDateToISO(ecoRow.tanggalDMY),
    });
  }
  // Lembar Pemenuhan Persyaratan/Fasilitas cuma nyantumin SATU daftar
  // SKB/E-COO utk 1 dokumen PIB (tidak dipecah per-barang), jadi dari
  // situ saja tidak bisa tahu SKB/E-COO ini sebenarnya punya barang
  // yang mana. Default-nya: terapkan ke SEMUA barang dulu (di-clone
  // per barang, bukan referensi objek yang sama, supaya edit di 1
  // barang tidak ikut mengubah barang lain) — SKB (BM/PPN/PPH/
  // Masterlist) memang lazimnya berlaku utk seluruh barang dalam 1
  // PIB, sedangkan E-COO lazimnya cuma utk barang tertentu (beda asal
  // / tarif preferensi per barang) tapi tetap diikutkan ke semua
  // barang sebagai default supaya tidak ada yang kelewat — lebih
  // aman user tinggal HAPUS lewat tombol Fasilitas pada barang yang
  // seharusnya tidak dapat, daripada harus nambah manual krn kelewat.
  if (skbList.length) {
    items.forEach((it) => {
      it.skb = skbList.map((sk) => ({ ...sk }));
    });
    if (items.length > 1) {
      notes.push(
        "Fasilitas SKB/E-COO dari PDF diterapkan ke SEMUA barang secara default (lembar Pemenuhan Persyaratan tidak memisahkan per-barang) — cek tiap barang lewat tombol Fasilitas, hapus yang tidak seharusnya dapat (E-COO biasanya cuma berlaku untuk barang tertentu, bukan semua).",
      );
    }
  }

  if (!fields.docNo)
    notes.push(
      "Nomor & Tanggal Pendaftaran (SPPB) tidak terbaca dari PDF — isi manual.",
    );
  if (!fields.vessel)
    notes.push(
      "Nama Vessel/Maskapai tidak terbaca otomatis dari PDF — isi manual.",
    );
  if (!items.length)
    notes.push(
      'Tidak ada baris "Pos Tarif :" / "Uraian :" yang ditemukan di PDF — daftar barang tidak terisi otomatis.',
    );
  if (!skbList.length && !ecoRow)
    notes.push(
      "Tidak ditemukan entri SKB atau E-COO di lembar Pemenuhan Persyaratan/Fasilitas — cek manual kalau seharusnya ada.",
    );
  notes.push(
    "Hasil baca PDF ini best-effort (posisi teks di PDF tidak selalu berurutan) — mohon cek ulang semua field sebelum simpan, terutama Vessel, Freight/Insurance/NDPBM, dan berat per barang.",
  );

  return {
    fields,
    items,
    notes,
    modeHint: "import",
    source: "pdf",
    isPib: PIB_TITLE_RE.test(text),
  };
}
