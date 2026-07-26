"use strict";

/* ==================================================================
   IMPORT DARI PDF PEB (Pemberitahuan Ekspor Barang, BC 3.0)
   Pasangan pdf.js (PIB BC 2.0) untuk sisi EXPORT — requirement A.

   Struktur form BC 3.0 (diverifikasi dari dokumen nyata):
     - Halaman 1: header 2 kolom (KANTOR PABEAN / EKSPORTIR / PEMBELI /
       PPJK / DATA PENGANGKUTAN / DATA PELABUHAN / DOKUMEN PELENGKAP /
       DATA PENYERAHAN / DATA TRANSAKSI / DATA PETI KEMAS / DATA KEMASAN).
       Hampir semua field bernomor unik (1..58), jadi paling stabil
       diambil lewat "nomor field + label", bukan lewat posisi baris.
     - Halaman 2+: "LEMBAR LANJUTAN DATA BARANG EKSPOR" — tabel barang
       kolom 47..54. Di sini WAJIB pakai koordinat (lihat pdf-coords.js):
       kolom 48 (Uraian) & kolom 51 (Jumlah/Berat/Kemasan) berada di
       baris Y yang SAMA, jadi kalau dibaca sbg teks polos, "- 1.0000 SET
       (SET)" nempel ke nama barang.
     - Halaman terakhir: "LEMBAR LANJUTAN DOKUMEN PELENGKAP PABEAN" —
       tabel 1 baris = 1 dokumen (INVOICE / PACKING LIST / B/L / SKB /
       E-CO). Dari sinilah B/L, invoice, dan fasilitas diambil, sama
       seperti lembar "Pemenuhan Persyaratan" di PIB.
================================================================== */

const PEB_TITLE_RE = /PEMBERITAHUAN\s+EKSPOR\s+BARANG/i;

function isPebPdfText(text) {
  return PEB_TITLE_RE.test(text || "");
}

// Tanggal gaya dokumen bea cukai (DD-MM-YYYY) -> ISO. Sama dengan
// pibDateToISO() di pdf.js; ditulis ulang di sini supaya modul PEB tidak
// bergantung urutan <script> terhadap modul PIB.
function pebDateToISO(dmy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((dmy || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function pebNum(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

/* ---- tabel "LEMBAR LANJUTAN DOKUMEN PELENGKAP PABEAN" -------------
   Formatnya: "<no> <JENIS DOKUMEN> <nomor> <tanggal DD-MM-YYYY>".
   Nama jenis dokumen bisa mengandung spasi & garis miring ("PACKING
   LIST", "B/L", "SURAT KETERANGAN BEBAS (SKB) PPH"), sedangkan nomor
   dokumen TIDAK pernah mengandung spasi — jadi pemisahnya: ambil token
   TERAKHIR sebelum tanggal sebagai nomor, sisanya nama dokumen. */
function parsePebDocTable(text) {
  const rows = [];
  const re = /^\s*(\d{1,2})\s+([A-Z][A-Z0-9()/.\-\s]*?)\s+(\S+)\s+(\d{2}-\d{2}-\d{4})\s*$/gm;
  let m;
  while ((m = re.exec(text))) {
    rows.push({
      label: m[2].trim(),
      nomor: m[3].trim(),
      tanggalDMY: m[4],
    });
  }
  return rows;
}

/* ---- barang (kolom 47..54, halaman lanjutan) ---------------------
   Tiap barang diawali baris "<n> - <pos tarif 8 digit>" di kolom 48.
   Isi kolom 48 per barang (4 baris khas):
     - 84807190
     - TYRE MOLD FULL SET, Merk: -, Tipe: NOKIAN ENTRUST 255/45R19,
     Ukuran: - , Kode Barang : -
     - EKSPOR BIASA
   Isi kolom 51 per barang:
     - 1.0000 SET (SET)
     - 300.0000 Kg
     - Kemasan: 6 PK
   Isi kolom 54 per barang: nilai ekspor (mis. "11,229").              */
const PEB_ITEM_HEADERS = [
  { key: "no", re: /^47\.$/ },
  { key: "uraian", re: /^48\.\s*-?Pos\s*Tarif/i },
  { key: "izin", re: /^49\.\s*Perizinan/i },
  { key: "he", re: /^50\.\s*HE\s*barang/i },
  { key: "satuan", re: /^51\.\s*-?\s*Jumlah\s*&\s*Jenis/i },
  { key: "negara", re: /^52\.\s*Negara\s*Asal/i },
  { key: "nilai", re: /^54\.\s*Nilai\s*Ekspor/i },
];

function isEmptyPebSpec(v) {
  const t = (v || "").trim();
  return (
    !t ||
    t === "-" ||
    /^tanpa\s+(merek|merk|tipe)$/i.test(t) ||
    /^kode\s+barang$/i.test(t)
  );
}

// Nama barang dari blok teks kolom 48 satu barang.
// Formatnya bisa terpotong lintas baris, jadi baris-barisnya digabung
// dulu jadi 1 string sebelum di-regex.
function parsePebItemName(blockText) {
  const joined = blockText.replace(/\s+/g, " ").trim();
  // Buang "- <pos tarif>" di depan & "- EKSPOR BIASA/..." di belakang.
  let s = joined
    .replace(/^-\s*\d{6,10}\s*/, "")
    .replace(/-\s*EKSPOR\s+[A-Z\s]+$/i, "")
    .trim();

  const parts = [];
  // Uraian = teks sebelum "Merk:" (atau seluruhnya kalau tidak ada).
  const uraianM = /^-?\s*(.+?)(?=,?\s*Merk\s*:|$)/i.exec(s);
  if (uraianM && uraianM[1]) {
    const u = uraianM[1].replace(/^-\s*/, "").replace(/,\s*$/, "").trim();
    if (!isEmptyPebSpec(u)) parts.push(u);
  }
  const merkM = /Merk\s*:\s*([^,]*)/i.exec(s);
  const tipeM = /Tipe\s*:\s*([^,]*)/i.exec(s);
  const ukuranM = /Ukuran\s*:\s*([^,]*)/i.exec(s);
  [merkM, tipeM, ukuranM].forEach((mm) => {
    if (mm && !isEmptyPebSpec(mm[1])) parts.push(mm[1].trim());
  });
  return parts
    .filter(Boolean)
    .filter((p, i, arr) => arr.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i)
    .join(" ");
}

function extractPebItems(pagesItems) {
  const items = [];
  pagesItems.forEach((pageItems) => {
    if (!pageItems || !pageItems.length) return;
    const bounds = pdfColumnBounds(pageItems, PEB_ITEM_HEADERS);
    if (!bounds.uraian || !bounds.satuan) return; // halaman ini bukan lembar barang

    const uraianLines = pdfLinesInBox(
      pageItems,
      bounds.uraian.xMin,
      bounds.uraian.xMax,
    );
    // Awal tiap barang = baris "- <8 digit pos tarif>" di kolom 48.
    const starts = [];
    uraianLines.forEach((l) => {
      const m = /^-\s*(\d{6,10})\s*$/.exec(l.text.trim());
      if (m) starts.push({ y: l.y, hsCode: m[1] });
    });
    if (!starts.length) return;

    // Batas bawah tiap barang = awal barang berikutnya; barang TERAKHIR
    // dibatasi blok tanda tangan ("JAKARTA, dd-mm-yyyy"/"Eksportir/PPJK")
    // supaya tidak menyerap teks kaki halaman.
    const footerY = Math.max(
      ...pdfLines(pageItems)
        .filter((l) => /Eksportir\/PPJK|^JAKARTA,/i.test(l.text.trim()))
        .map((l) => l.y),
      -Infinity,
    );

    starts.forEach((st, i) => {
      const yTop = st.y + 1;
      const yBottom =
        i + 1 < starts.length
          ? starts[i + 1].y - 0.5
          : isFinite(footerY)
            ? footerY
            : -Infinity;
      const yRange = { yTop, yBottom };

      const nameBlock = pdfLinesInBox(
        pageItems,
        bounds.uraian.xMin,
        bounds.uraian.xMax,
        yRange,
      )
        .map((l) => l.text)
        .join(" ");

      const satuanLines = pdfLinesInBox(
        pageItems,
        bounds.satuan.xMin,
        bounds.satuan.xMax,
        yRange,
      ).map((l) => l.text.trim());

      let qty = null;
      let satuan = "";
      let netto = null;
      let packageText = "";
      satuanLines.forEach((t) => {
        let m = /^-?\s*([\d,]+\.?\d*)\s+([A-Z]{1,12})\s*(?:\(([A-Z]{1,12})\))?\s*$/i.exec(t);
        if (m && qty == null) {
          qty = pebNum(m[1]);
          satuan = (m[3] || m[2]).toUpperCase();
          return;
        }
        m = /^-?\s*([\d,]+\.?\d*)\s*Kgs?\b/i.exec(t);
        if (m && netto == null) {
          netto = pebNum(m[1]);
          return;
        }
        m = /Kemasan\s*:\s*(.+)$/i.exec(t);
        if (m && !packageText) packageText = m[1].trim();
      });

      let nilai = null;
      if (bounds.nilai) {
        const nilaiLines = pdfLinesInBox(
          pageItems,
          bounds.nilai.xMin,
          bounds.nilai.xMax,
          yRange,
        ).map((l) => l.text.trim());
        const hit = nilaiLines.find((t) => /^[\d,]+\.?\d*$/.test(t));
        if (hit) nilai = pebNum(hit);
      }

      items.push({
        name: parsePebItemName(nameBlock),
        hsCode: st.hsCode,
        qty,
        satuan,
        netto,
        nilai,
        package: packageText,
      });
    });
  });
  return items;
}

/* ================================================================== */
function parsePebPdfText(text, pagesItems) {
  const notes = [];
  const grab = (re) => {
    const mm = text.match(re);
    return mm ? mm[1].trim() : "";
  };
  // Label field lain sering ikut nempel di ujung baris karena form ini
  // 2 kolom — dipotong sebelum penanda field baru ("14. Alamat :").
  const stopAtNextField = (s) =>
    (s || "").split(/\s+\d{1,2}[a]?\.\s+(?=[A-Z])/)[0].trim();

  /* ---- identitas dokumen ---- */
  const noAju = grab(/Nomor Pengajuan\s*:\s*(\S+)/i);
  const docNo = grab(/1\.\s*Nomor Pendaftaran\s*:\s*(\d+)/i);
  // "Tanggal :" pendaftaran ada di baris BERBEDA dari nomornya (kolom
  // kanan "H. KOLOM KHUSUS BEA DAN CUKAI"), dan baris itu ikut memuat
  // teks kolom kiri. Dicari sebagai tanggal PERTAMA sesudah posisi
  // "Nomor Pendaftaran" — stabil karena "2. Nomor BC 1.1" di bawahnya
  // biasanya kosong.
  let docDate = "";
  const pendIdx = text.search(/1\.\s*Nomor Pendaftaran/i);
  if (pendIdx !== -1) {
    const win = text.slice(pendIdx, pendIdx + 260);
    const dm = /Tanggal\s*:\s*(\d{2}-\d{2}-\d{4})/i.exec(win);
    if (dm) docDate = pebDateToISO(dm[1]);
  }

  /* ---- pihak-pihak ----
     party (Nama Buyer/Consignee) = PEMBELI (field 15), BUKAN eksportir
     (field 2 = PT DDI sendiri). Kalau PEMBELI kosong, dipakai PENERIMA
     (field 18) sebagai cadangan. */
  const pembeli = stopAtNextField(grab(/15\.\s*Nama\s*:\s*([^\n]+)/i));
  const penerima = stopAtNextField(grab(/18\.\s*Nama\s*:\s*([^\n]+)/i));
  const party = pembeli || penerima;
  // Forwarder = nama PPJK saja (field 9), sesuai requirement.
  const forwarder = stopAtNextField(grab(/9\.\s*Nama\s*:\s*([^\n]+)/i));

  /* ---- pengangkutan ---- */
  const transportM = text.match(/21\.\s*Cara Pengangkutan\s*:\s*(LAUT|UDARA|DARAT)/i);
  const transport = transportM
    ? transportM[1].toUpperCase() === "UDARA"
      ? "udara"
      : "laut"
    : "";
  const voyage = grab(/23\.\s*No\.\s*Pengangkut[^:\n]*:\s*([^\n]+)/i)
    .split(/\s+\d{1,2}\.\s+/)[0]
    .trim();
  // Nama sarana pengangkut ada di baris SESUDAH labelnya (labelnya
  // sendiri cuma diikuti kode bendera 2 huruf, mis. ": KR").
  let vessel = "";
  const saranaIdx = text.search(/22\.\s*Nama\s*&\s*Bendera\s*Sarana\s*Pengangkut/i);
  if (saranaIdx !== -1) {
    const lines = text.slice(saranaIdx, saranaIdx + 400).split("\n");
    for (let i = 1; i < lines.length && i < 5; i++) {
      const cand = lines[i].split(/\s+\d{1,2}\.\s+/)[0].trim();
      if (
        cand &&
        !/^\d/.test(cand) &&
        !/^(DATA|PPJK|PEMBELI|PENERIMA|EKSPORTIR)\b/i.test(cand) &&
        /^[A-Z][A-Z0-9\s./&'-]{2,45}$/.test(cand)
      ) {
        vessel = cand.trim();
        break;
      }
    }
  }
  const etd = pebDateToISO(
    grab(/24\.\s*Tanggal Perkiraan Ekspor\s*:\s*(\d{2}-\d{2}-\d{4})/i),
  );

  /* ---- pelabuhan (ditampilkan sbg KODE UN/LOCODE, requirement B) ---- */
  const originRaw =
    grab(/25\.\s*Pelabuhan Muat Asal\s*:\s*([^\n]+)/i) ||
    grab(/26\.\s*Pelabuhan Muat Ekspor\s*:\s*([^\n]+)/i);
  const destinationRaw = grab(/28\.\s*Pelabuhan Tujuan\s*:\s*([^\n]+)/i);
  const origin = portDisplay(stopAtNextField(originRaw));
  const destination = portDisplay(stopAtNextField(destinationRaw));

  /* ---- peti kemas & kemasan (field 42/43/44) ----
     Blok ini 2 KOLOM bersebelahan pada Y yang sama: "DATA PETI KEMAS"
     (field 42/43) di kiri, "DATA KEMASAN" (field 44) di kanan. Dibaca
     sbg teks polos, isi keduanya nempel jadi satu baris — nyata ketemu:
     "43. No, Ukuran, Jenis Muatan, & Tipe Peti Kemas 6 PACKAGE/ -",
     yang bikin "6 PACKAGE" (punya field 44) salah terbaca sbg isi field
     43. Makanya di sini dipisah lewat KOORDINAT: batas kolomnya = posisi
     x label "44." itu sendiri. */
  const petiKemas = (() => {
    const out = { container: "", muatan: "", package: "" };
    const hit44 = pdfFindItem(pagesItems, /^44\.\s*Jenis/i);
    if (!hit44) return out;
    const pageItems = pagesItems[hit44.page] || [];
    const split = hit44.x - 3;

    // Kolom KANAN (field 44) — baris sesudah labelnya = jumlah & jenis
    // kemasan, mis. "6 PACKAGE/ -".
    const rightLines = pdfLinesInBox(pageItems, split, 100000);
    const i44 = rightLines.findIndex((l) => /^44\.\s*Jenis/i.test(l.text));
    if (i44 !== -1) {
      for (const l of rightLines.slice(i44, i44 + 3)) {
        const cand = l.text.replace(/^44\.[^:]*:?\s*/i, "").trim();
        const cleaned = cand.replace(/\s*\/\s*-\s*$/, "").trim();
        if (/^\d/.test(cleaned)) {
          out.package = cleaned;
          break;
        }
      }
    }

    // Kolom KIRI (field 43) — nomor/ukuran/jenis muatan peti kemas.
    const leftLines = pdfLinesInBox(pageItems, 0, split);
    const i43 = leftLines.findIndex((l) => /^43\.\s*No,\s*Ukuran/i.test(l.text));
    if (i43 !== -1) {
      const blob = leftLines
        .slice(i43, i43 + 4)
        .map((l) => l.text.replace(/^43\.[^:]*/i, "").replace(/^\s*:\s*/, ""))
        .join(" ");
      const cont = blob.match(/\b([A-Z]{4}\s?\d{6,7})\b/g);
      if (cont) out.container = cont.join(", ").replace(/\s+/g, "");
      const mu = blob.match(/\b(FCL|LCL)\b/i);
      if (mu) out.muatan = mu[1].toUpperCase();
    }
    return out;
  })();
  const container = petiKemas.container;
  const muatan = petiKemas.muatan;
  const packageText = petiKemas.package;

  /* ---- dokumen pelengkap (invoice / B-L / fasilitas) ---- */
  const docRows = parsePebDocTable(text);
  const findDoc = (re) => docRows.find((r) => re.test(r.label));
  const invoiceRow = findDoc(/^INVOICE$/i);
  const masterRow = findDoc(/MASTER\s*(AWB|B\/?L)/i);
  const houseRow =
    findDoc(/^(HOUSE\s*)?(AWB|B\/?L)$/i) || findDoc(/HOUSE/i);
  const skbRows = docRows.filter((r) => /SURAT KETERANGAN BEBAS/i.test(r.label));
  const ecoRow = findDoc(/ELECTRONIC CERTIFICATE OF ORIGIN|\bE-?COO?\b/i);

  const invoice =
    (invoiceRow && invoiceRow.nomor) ||
    grab(/30\.\s*No\s*&\s*Tgl Invoice\s*:\s*No\.\s*(\S+)/i);

  // Di PEB, B/L biasanya cuma SATU baris (dokumen ekspor jarang punya
  // Master & House sekaligus). Kalau memang cuma satu, dia dianggap
  // MASTER — sesuai perlakuan template copy yang menaruh Master di baris
  // pertama (requirement E: "Kalau tidak ada Master BL/AWB, isian tetap
  // di row pertama").
  let masterBL = masterRow ? masterRow.nomor : "";
  let houseBL = houseRow ? houseRow.nomor : "";
  if (!masterBL && houseBL) {
    masterBL = houseBL;
    houseBL = "";
  }

  const skbList = skbRows.map((r) => {
    const tm = /\(SKB\)\s*([A-Z%0-9]*)/i.exec(r.label);
    const raw = (tm && tm[1] ? tm[1] : "").toUpperCase();
    const known = SKB_TYPE_OPTIONS.includes(raw) && raw !== "LAINNYA" ? raw : null;
    return known
      ? { jenis: known, jenisLainnya: "", nomor: r.nomor, tanggal: pebDateToISO(r.tanggalDMY) }
      : { jenis: "Lainnya", jenisLainnya: raw || "SKB", nomor: r.nomor, tanggal: pebDateToISO(r.tanggalDMY) };
  });
  if (ecoRow) {
    skbList.push({
      jenis: "E-COO",
      jenisLainnya: "",
      nomor: ecoRow.nomor,
      tanggal: pebDateToISO(ecoRow.tanggalDMY),
    });
  }

  /* ---- kepabeanan & biaya ---- */
  const incoterm = grab(/35\.\s*Cara Penyerahan Barang\s*:\s*([A-Z]{3})\b/i).toUpperCase();
  const freight = pebNum(grab(/39\.\s*Biaya Pengangkutan\s*:\s*([\d,.]+)/i));
  const insurance = pebNum(grab(/40\.\s*Asuransi[^:\n]*:\s*([\d,.]+)/i));
  const ndpbm = pebNum(grab(/55\.\s*Nilai Tukar Mata Uang\s*:\s*Rp\.?\s*([\d,.]+)/i));
  const nilaiEkspor = pebNum(grab(/38\.\s*Jumlah Nilai Ekspor\s*:\s*([\d,.]+)/i));
  const bruto = pebNum(grab(/45\.\s*Berat Kotor\s*\(kg\)\s*:\s*([\d,.]+)/i));
  const netto = pebNum(grab(/46\.\s*Berat Bersih\s*\(kg\)\s*:\s*([\d,.]+)/i));

  /* ---- barang ---- */
  const rawItems = extractPebItems(pagesItems);
  const totalNettoKnown = rawItems.reduce((s, it) => s + (it.netto || 0), 0);

  const items = rawItems
    .filter((it) => it.name || it.hsCode)
    .map((it) => {
      const base = {
        ...newItem(),
        namaBarang: it.name || "",
        hsCode: normalizeHsCodeInput(it.hsCode),
        jenisBarang: "Barang Jadi",
        qty: it.qty != null ? it.qty : 0,
        satuan: it.satuan || "",
        netto: it.netto != null ? it.netto : 0,
      };
      // Harga satuan = Nilai Ekspor barang itu / qty (kolom 54 memang
      // nilai TOTAL per barang, bukan harga satuan).
      if (it.nilai != null && base.qty) {
        base.harga = roundNum(it.nilai / base.qty, 4);
      }
      return base;
    });

  // Bruto = TOTAL dokumen (field 45 Berat Kotor), di barang pertama saja.
  applyTotalBrutoToFirstItem(items, bruto);

  if (skbList.length && items.length) {
    items.forEach((it) => {
      it.skb = skbList.map((sk) => ({ ...sk }));
    });
  }

  /* ---- catatan ---- */
  if (!docNo)
    notes.push("Nomor & Tanggal Pendaftaran (PEB) tidak terbaca dari PDF — isi manual.");
  if (!vessel)
    notes.push("Nama Vessel/Sarana Pengangkut tidak terbaca otomatis dari PDF — isi manual.");
  if (!items.length)
    notes.push(
      'Tidak ada baris barang yang terbaca dari lembar lanjutan "DATA BARANG EKSPOR" — isi manual di tab Daftar Barang.',
    );
  if (!container && !muatan)
    notes.push(
      "Peti kemas (field 43) kosong di dokumen ini — Kontainer & Jenis Muatan (FCL/LCL) tidak terisi, isi manual kalau memang ada.",
    );
  notes.push(
    "Hasil baca PDF PEB ini best-effort — mohon cek ulang Vessel, Freight/Asuransi, dan berat per barang sebelum simpan.",
  );

  return {
    fields: {
      noAju,
      docNo,
      docDate,
      party,
      forwarder,
      invoice,
      masterBL,
      houseBL,
      transport,
      vessel,
      voyage,
      container,
      muatan,
      origin,
      destination,
      etd,
      incoterm,
      freight,
      insurance,
      ndpbm,
      package: packageText,
      bruto,
      netto,
      nilaiEkspor,
    },
    items,
    notes,
    modeHint: "export",
    source: "pdf-peb",
    isPeb: true,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parsePebPdfText, isPebPdfText, parsePebDocTable, parsePebItemName };
}
