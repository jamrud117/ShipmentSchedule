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
function extractItemDetailColumn(pagesItems, nItems) {
  if (!nItems || !pagesItems || !pagesItems.length) return [];
  const COL_X_MIN = 393;
  const COL_X_MAX = 468;
  const tokens = [];
  pagesItems.forEach((rawItems) => {
    if (!rawItems || !rawItems.length) return;
    const allLines = groupPdfItemsIntoLinesWithMeta(rawItems);
    const posTarifYs = allLines
      .filter((l) => /Pos Tarif\s*:/.test(l.text))
      .map((l) => l.y);
    if (!posTarifYs.length) return;
    const yStart = Math.max(...posTarifYs);
    const endYs = allLines
      .filter((l) => /Jenis Pungutan|JAKARTA,|Importir\/PPJK/.test(l.text))
      .map((l) => l.y);
    const yEnd = endYs.length ? Math.max(...endYs) : -Infinity;
    const colItems = rawItems.filter((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      return x >= COL_X_MIN && x <= COL_X_MAX && y <= yStart + 1 && y > yEnd;
    });
    groupPdfItemsIntoLinesWithMeta(colItems).forEach((l) =>
      tokens.push(l.text),
    );
  });
  if (tokens.length !== nItems * 5) return [];
  const numTok = (s) => {
    const m = /^-?([\d,]+\.?\d*)$/.exec((s || "").trim());
    return m ? pibNum(m[1]) : null;
  };
  const out = [];
  for (let i = 0; i < nItems; i++) {
    const chunk = tokens.slice(i * 5, i * 5 + 5);
    const qty = numTok(chunk[0]);
    const satuan = (chunk[1] || "").split("(")[0].trim();
    // Satuan asli selalu kode pendek tanpa spasi (UNIT/KG/SET/PCS/dst) --
    // kalau yg ke-ekstrak malah berupa frasa (mis. "NUMBER OF", kebaca
    // dari baris lain yg numpang di rentang koordinat yg sama), dianggap
    // GAGAL drpd disimpan sbg satuan yg jelas salah.
    const satuanPlausible = /^[A-Z0-9°%/.\-]{1,12}$/i.test(satuan);
    const netto = numTok(chunk[2]);
    out.push(
      qty != null && qty > 0 && satuan && satuanPlausible && netto != null
        ? { qty, satuan, netto }
        : null,
    );
  }
  return out;
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
  const partyName = stopAtNextField(
    grab(/3\.\s*Nama,\s*Alamat\s*:\s*([^\n]+)/),
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
  const packageDefault = packageTextMatch ? packageTextMatch[1].trim() : "";
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
    const candidate = w
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          /^[A-Z][A-Z\s./&-]{3,40}$/.test(l) &&
          l.includes(" ") &&
          !EXCLUDE_WORDS.some((word) => l.includes(word)),
      );
    if (candidate) vessel = candidate;
  }

  const fields = {
    noAju,
    docNo: pendaftaranMatch ? pendaftaranMatch[1] : "",
    docDate: pendaftaranMatch ? pibDateToISO(pendaftaranMatch[2]) : "",
    party: partyName,
    invoice: invoiceRow ? invoiceRow.nomor : "",
    masterBL: masterRow ? masterRow.nomor : "",
    houseBL: houseRow ? houseRow.nomor : "",
    origin: pelabuhanMuat,
    destination,
    incoterm,
    transport: transportMatch
      ? transportMatch[1].toUpperCase() === "UDARA"
        ? "udara"
        : "laut"
      : "",
    vessel,
    voyage,
    actual: etaMatch ? pibDateToISO(etaMatch[1]) : "",
    ndpbm: ndpbmMatch ? pibNum(ndpbmMatch[1]) : null,
    freight: freightMatch ? pibNum(freightMatch[1]) : null,
    insurance: asuransiMatch ? pibNum(asuransiMatch[1]) : null,
    bm: bmM ? pibNum(bmM[1]) : null,
    ppn: ppnM ? pibNum(ppnM[1]) : null,
    pph: pphM ? pibNum(pphM[1]) : null,
    package: packageDefault,
  };

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
  const rawItems = posTarifMatches
    .map((pt, i) => {
      const blockEnd =
        i + 1 < posTarifMatches.length
          ? posTarifMatches[i + 1].index
          : text.length;
      const block = text.slice(pt.index, blockEnd);
      const uraianM = /Uraian\s*:\s*([^\n]+)/.exec(block);
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
      return { namaBarang, hsCode: pt.hsCode, qty, netto, satuan };
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
    if (it.netto != null) base.netto = it.netto;
    if (it.satuan) base.satuan = it.satuan;
    if (totalBrutoVal != null) {
      if (totalNettoKnown > 0 && it.netto != null) {
        base.bruto = roundNum(totalBrutoVal * (it.netto / totalNettoKnown), 4);
      } else if (idx === 0) {
        base.bruto = totalBrutoVal;
      }
    }
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
