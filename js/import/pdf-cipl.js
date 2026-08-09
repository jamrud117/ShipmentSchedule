"use strict";

/* IMPORT DARI PDF CIPL (Packing List / Commercial Invoice hasil print */

// Header kolom pada templat ini POSISINYA DI TENGAH kolom, bukan di tepi kiri
function ciplPdfColumnSplits(pageItems) {
  /* Kolom di kiri nama barang dipotong HANYA kalau isinya Shipping
     Marks — tanda pengapalan memang bukan nama barang.

     Kolom "Item" sebaliknya: ia BAGIAN dari nama. Pada invoice yang
     memisah "Item" dan "Description", nama lengkapnya tersebar di
     keduanya ("STAND" + "HS 40*50"). Memotongnya membuang separuh nama
     barang tanpa ada yang bersuara — yang tersisa cuma keterangan
     tekniknya. */
  const leftCandidates = (pageItems || [])
    .filter((it) => /^\s*Shipping\s+Marks?\s*$/i.test(it.str))
    .map((it) => ({ x: it.transform[4], width: it.width || 0 }));
  const desc = pdfFindItemOnPage(
    pageItems,
    /^\s*(Goods\s+)?Descriptions?\s*$/i,
  );
  // "Qty." maupun "Quantity" — dua-duanya dipakai di lapangan.
  const qty = pdfFindItemOnPage(pageItems, /^\s*(Qty\.?|Quantity)\s*$/i);
  if (!desc || !qty) return null;

  let nameStart = 0;
  if (leftCandidates.length) {
    const left = leftCandidates.reduce((a, b) => (b.x > a.x ? b : a));
    nameStart = left.x + left.width;
    // Jangan sampai batas ini malah memakan teks nama barang
    if (desc.x > left.x) nameStart = Math.min(nameStart, desc.x - 5);
  }
  // Sebagian templat menaruh SATUAN sebagai sub-label header, bukan di tiap baris
  let defaultUnit = "";
  (pageItems || []).forEach((it) => {
    const x = it.transform[4];
    const y = it.transform[5];
    if (Math.abs(x - qty.x) > 34) return;
    if (y >= qty.y || qty.y - y > 18) return;
    const t = (it.str || "").trim();
    if (!defaultUnit && UNIT_QTY_RE.test(t)) defaultUnit = t.toUpperCase();
  });

  return { nameStart, valueStart: qty.x - 3, headerY: desc.y, defaultUnit };
}

/* PECAHAN ANGKA DARI PDF.

   Sebagian PDF memecah satu angka jadi beberapa potongan teks yang
   bersebelahan: "26,400.00" keluar sebagai "2" lalu "6,400.00",
   "101.00" jadi "1" lalu "01.00". Dibaca apa adanya, potongan pertama
   terbaca sebagai angka tersendiri dan seluruh kolom setelahnya
   bergeser — Amount jadi 2, harga jadi Amount, dan seterusnya.

   Digabung berdasarkan KOORDINAT, bukan tebakan atas teksnya: dua
   potongan disatukan hanya kalau berada di baris yang sama DAN
   benar-benar berdempet. Menebak dari teks saja akan ikut menyatukan
   angka yang memang bersebelahan di kolom berbeda. */
function mergeSplitNumberFragments(pageItems) {
  const urut = (pageItems || []).slice().sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    return Math.abs(dy) > 2 ? dy : a.transform[4] - b.transform[4];
  });

  const hasil = [];
  urut.forEach((it) => {
    const prev = hasil[hasil.length - 1];
    if (prev) {
      const sebaris = Math.abs(prev.transform[5] - it.transform[5]) <= 2;
      const jarak = it.transform[4] - (prev.transform[4] + (prev.width || 0));
      const a = String(prev.str || "");
      const b = String(it.str || "");
      if (sebaris && jarak < 1.5 && /\d$/.test(a) && /^[\d,.]/.test(b)) {
        hasil[hasil.length - 1] = Object.assign({}, prev, {
          str: a + b,
          width: (prev.width || 0) + (it.width || 0),
        });
        return;
      }
    }
    hasil.push(it);
  });
  return hasil;
}

// Baris tabel barang 1 halaman -> [{ nameText, valueText, y }]
function ciplPdfTableRows(pageItems) {
  pageItems = mergeSplitNumberFragments(pageItems);
  const split = ciplPdfColumnSplits(pageItems);
  if (!split) return [];

  const allLines = pdfLines(pageItems);
  // Batas bawah tabel: baris "TOTAL n BOX(ES) ..." (ringkasan) atau "DIMENSION: ..."
  const stopYs = allLines
    .filter((l) =>
      /^(TOTAL\b|DIMENSION\s*:|Account\s+of|Bank\s+name|Signed\s+by)/i.test(
        l.text.trim(),
      ),
    )
    .map((l) => l.y);
  const yBottom = stopYs.length ? Math.max(...stopYs) : -Infinity;
  const yRange = { yTop: split.headerY - 4, yBottom };

  const nameLines = pdfLinesInBox(
    pageItems,
    split.nameStart,
    split.valueStart,
    yRange,
  );
  const valueLines = pdfLinesInBox(pageItems, split.valueStart, 100000, yRange);

  return nameLines
    .map((nl) => {
      const vl = valueLines.find((v) => Math.abs(v.y - nl.y) <= 3);
      return repairSpilledQty({
        y: nl.y,
        nameText: nl.text.trim(),
        valueText: vl ? vl.text.trim() : "",
        defaultUnit: split.defaultUnit || "",
      });
    })
    .filter((r) => r.nameText);
}

/* ANGKA QUANTITY YANG TUMPAH KE KOTAK NAMA.

   Batas kolom diambil dari posisi JUDUL kolom, sementara isinya rata
   kanan. Nilai yang lebih lebar daripada judulnya — "60,000" di bawah
   judul "Quantity" — karena itu mulai di sebelah kiri batas, lalu
   tersedot ke kotak nama. Akibatnya barisnya kehilangan qty dan
   diperlakukan sebagai baris lanjutan: satu barang hilang sama sekali.

   Diperbaiki dari BENTUK datanya, bukan dari menggeser batas kolom.
   Menggeser batas menebak seberapa jauh nilai bisa menjorok, dan
   tebakan yang kelewat longgar akan ikut menyedot kode HS ke kolom
   nilai. Yang diperiksa di sini pasti: nama berakhir angka SEMENTARA
   kolom nilainya justru tidak dimulai angka. Angka itu memang milik
   kolom nilai. */
function repairSpilledQty(row) {
  const nama = row.nameText;
  const nilai = row.valueText;
  if (!nama || !nilai) return row;
  if (/^[\d,.]/.test(nilai)) return row;

  const m = /\s([\d][\d,.]*)$/.exec(nama);
  if (!m) return row;
  // Kode HS & nomor part berekor huruf bukan quantity.
  if (!/^\d[\d,]*(\.\d+)?$/.test(m[1])) return row;

  return Object.assign({}, row, {
    nameText: nama.slice(0, m.index).trim(),
    valueText: (m[1] + " " + nilai).trim(),
  });
}

// Angka pada kolom berat sering terpecah jadi beberapa potongan teks ("1" lalu ".0")
function normalizeCiplValueText(s) {
  return String(s || "")
    .replace(/(\d)\s+\.(\d)/g, "$1.$2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// "1 SET USD 40 USD 40" (CI) -> { qty:1, satuan:"SET", nums:[40,40] } "1 SET 1.0 KG"
function parseCiplValueTokens(valueText) {
  const toks = normalizeCiplValueText(valueText).split(/\s+/).filter(Boolean);
  const nums = [];
  let satuan = "";
  toks.forEach((t) => {
    if (/^[\d,]+\.?\d*$/.test(t)) {
      const n = Number(t.replace(/,/g, ""));
      if (isFinite(n)) nums.push(n);
      return;
    }
    if (CURRENCY_TOKEN_RE.test(t)) return;
    if (/^KGS?$/i.test(t)) return;
    if (!satuan && UNIT_QTY_RE.test(t)) satuan = t.toUpperCase();
  });
  return { qty: nums.length ? nums[0] : null, satuan, nums: nums.slice(1) };
}

// Baris lanjutan: sebagian templat memecah nama barang panjang ke baris berikutnya TANPA angka
/* Baris nama tanpa angka bisa berperan dua macam */
function ciplRowsToItems(rows, kind) {
  const items = [];
  let lastY = null;
  let groupPrefix = "";
  rows.forEach((r) => {
    const name = r.nameText.trim();
    // Baris catatan HS Code ("..
    if (/HS\s*CODE\s*:/i.test(name) && !r.valueText) return;

    const parsed = parseCiplValueTokens(r.valueText);
    if (parsed.qty == null) {
      // Baris lanjutan hanya kalau posisinya MASIH menempel di bawah baris barang sebelumnya
      const nearPrev = lastY != null && Math.abs(lastY - r.y) < 24;
      if (items.length && name && nearPrev) {
        items[items.length - 1].name = (
          items[items.length - 1].name +
          " " +
          name
        ).trim();
        lastY = r.y;
      } else if (name) {
        groupPrefix = name;
      }
      return;
    }
    lastY = r.y;
    const full =
      groupPrefix && !name.toLowerCase().startsWith(groupPrefix.toLowerCase())
        ? `${groupPrefix} ${name}`.trim()
        : name;
    /* HS Code kerap punya kolom sendiri yang jatuh di dalam kotak nama.
       Dikeluarkan dari namanya, bukan dibiarkan menempel: nama barang
       yang berekor "6903.10-0000" tidak cocok saat dibandingkan dengan
       dokumen lain, dan kolom HS Code-nya sendiri tetap kosong. */
    const hs = extractBareHsCode(full);
    const it = {
      name: hs.cleaned,
      qty: parsed.qty,
      satuan: parsed.satuan || r.defaultUnit || "",
    };
    if (hs.hsCode) it.hsCode = hs.hsCode;
    if (kind === "ci") {
      if (parsed.nums.length >= 1) it.harga = parsed.nums[0];
      if (parsed.nums.length >= 2) it.amount = parsed.nums[1];
    } else {
      if (parsed.nums.length >= 1) it.netto = parsed.nums[0];
      if (parsed.nums.length >= 2) it.bruto = parsed.nums[1];
    }
    items.push(it);
  });
  return items;
}

/* ---- field header (2 kolom kiri/kanan) --------------------------- */
function findTwoColumnThreshold(pageItems) {
  const leftX = pdfFindItemOnPage(pageItems, /^Consign(er|ee)/i);
  const rightX = pdfFindItemOnPage(
    pageItems,
    /Invoice\s*No\.?\s*(and|&)\s*Date/i,
  );
  if (!leftX || !rightX || rightX.x <= leftX.x) return 170; // fallback aman
  return (leftX.x + rightX.x) / 2;
}

function grab(text, re) {
  const m = re.exec(text);
  return m ? m[1].trim() : "";
}

// Kalau suatu field nilainya KOSONG di dokumen (mis
const KNOWN_LABEL_RES = [
  /^Shipping\s+Marks?/i,
  /^Items?\s*$/i,
  /^Goods\s+Descriptions/i,
  /^Consign(er|ee)/i,
  /^Seller\s*$/i,
  /^Notify\s+Party/i,
  /^Terms?\s+of\s+(Payment|Delivery)/i,
  // "Depature" bukan salah ketik saya — begitu tertulis di templat
  // invoice yang beredar, dan berkas yang salah ketik tetap harus terbaca.
  /^Depa(?:rt|t)ure\s*Date/i,
  /^Final\s+Destination/i,
  /^Other\s+References/i,
  /^Vessel\s*\/\s*Flight/i,
  /^(Port\s+of\s+Loading|Loading\s+Port)/i,
  /^Final\s+Destination/i,
  /^From\s*$/i,
  /^Special\s+Item/i,
  /^OBL\s+TYPE/i,
];
function looksLikeAnotherLabel(s) {
  const t = (s || "").trim();
  return KNOWN_LABEL_RES.some((re) => re.test(t));
}
/* Baris pertama SETELAH sebuah label yang berisi tanggal. Baris kosong
   dan baris label lain dilewati; pencarian berhenti setelah beberapa
   baris supaya tidak menyeret tanggal milik kotak lain. */
function grabDateAfterLabel(text, labelRe, maxLines) {
  const baris = String(text || "").split("\n");
  const batas = maxLines || 4;
  for (let i = 0; i < baris.length; i++) {
    if (!labelRe.test(baris[i].trim())) continue;
    for (let j = i + 1; j <= i + batas && j < baris.length; j++) {
      const s = baris[j].trim();
      if (!s) continue;
      if (looksLikeAnotherLabel(s)) break;
      if (parseFlexibleDateText(s)) return s;
    }
  }
  return "";
}

function grabNextLine(text, labelRe) {
  const v = grab(text, labelRe);
  return looksLikeAnotherLabel(v) ? "" : v;
}

function parseCiplPdfPageFields(pageItems, pageText) {
  const threshold = findTwoColumnThreshold(pageItems);
  const leftText = pdfLinesInBox(pageItems, 0, threshold)
    .map((l) => l.text)
    .join("\n");
  const rightText = pdfLinesInBox(pageItems, threshold, 100000)
    .map((l) => l.text)
    .join("\n");

  const invoice = grab(
    rightText,
    /Invoice\s*No\.?\s*(?:and|&)\s*Date\s*\n\s*(\S+)/i,
  );
  const invDateRaw = grab(
    rightText,
    /Invoice\s*No\.?\s*(?:and|&)\s*Date\s*\n\s*\S+\s+([\d.\/\- A-Za-z,]+)/i,
  );
  const docDate = parseFlexibleDateText(invDateRaw.replace(/\./g, "-"));

  // DUA pihak diambil terpisah — lihat pickCiplParty() di cipl-common.js
  const seller = grabNextLine(
    leftText,
    /^\s*(?:Seller|Shipper|Exporter|Consignors?|Consigners?)\s*:?\s*\n\s*([^\n]+)/im,
  );
  // "Consignee", "Consignee/Buyer", "Consignee & Buyer" — semuanya dipakai.
  const consignee = grabNextLine(
    leftText,
    /Consignee(?:\s*[\/&]\s*Buyer)?\s*\n\s*([^\n]+)/i,
  );

  /* Tanggal berangkat kerap dipisahkan satu baris kosong dari
     labelnya, karena kotak di sebelahnya lebih tinggi. Dicari baris
     BERISI TANGGAL pertama setelah labelnya, bukan baris berikutnya
     begitu saja. */
  const etdRaw = grabDateAfterLabel(leftText, /Depa(?:rt|t)ure\s*date/i);
  const etd = parseFlexibleDateText(etdRaw);

  const destination = grabNextLine(
    rightText,
    /Final\s+Destination\s*\n\s*([^\n]+)/i,
  );
  const originRaw =
    grabNextLine(rightText, /(?:Port\s+of\s+Loading|Loading\s+Port)\s*\n\s*([^\n]+)/i) ||
    grabNextLine(rightText, /^\s*From\s*\n\s*([^\n]+)/im);
  const voyageRaw = grabNextLine(
    leftText,
    /Vessel\s*\/\s*Flight\s*\n\s*([^\n]+)/i,
  );
  const voyage = /^(0|00:00:00|-)$/.test(voyageRaw.trim()) ? "" : voyageRaw;

  // Baris "TOTAL n BOX(ES) FCA INCHEON AIRPORT" melebar melewati batas kolom
  const totalLine = pageText
    .split("\n")
    .find((l) => /^TOTAL\s+\d/i.test(l.trim()));
  /* Incoterm paling sering ada di baris TOTAL, tapi sebagian templat
     menaruhnya di kotak sendiri ("Price Condition: EXW"). Baris TOTAL
     tetap didahulukan — di sana ia menyebut pelabuhannya sekalian. */
  let incoterm = guessIncotermFromText(pageText) || "";
  let packageText = "";
  if (totalLine) {
    incoterm = guessIncotermFromText(totalLine) || incoterm;
    const pkgM = new RegExp(
      `^TOTAL\\s+(.+?)\\s+(?:${INCOTERM_RE.source})\\b`,
      "i",
    ).exec(totalLine.trim());
    packageText = pkgM ? pkgM[1].trim() : "";
    /* Yang diambil harus benar-benar SATUAN KEMASAN. Baris
       "TOTAL 33.8 KGS 34.3 KGS" tidak menyebut jumlah koli sama sekali;
       tanpa penyaring ini, berat netto masuk ke kolom Package. */
    if (packageText && !/\b(BOX|CTN|CARTON|PALLET|PLT|CASE|CRATE|DRUM|BAG|ROLL|PKG|PACKAGE)/i.test(packageText)) {
      packageText = "";
    }
    if (!packageText) {
      const pkgOnly = /^TOTAL\s+(.+?)\s+[\d.,]+\s*(?:CBM|KGS?|M3)\b/i.exec(
        totalLine.trim(),
      );
      packageText = pkgOnly ? pkgOnly[1].trim() : "";
      if (packageText && !/\b(BOX|CTN|CARTON|PALLET|PLT|CASE|CRATE|DRUM|BAG|ROLL|PKG|PACKAGE)/i.test(packageText)) {
        packageText = "";
      }
    }
  }

  // HS Code sering ditulis sbg CATATAN di bawah tabel, bukan kolom sendiri: "MOLD BAR GAUGE
  const hsNotes = [];
  pageText.split("\n").forEach((line) => {
    const m = /^(.+?)\s*HS\s*CODE\s*:\s*([\d.\-]+)\s*$/i.exec(line.trim());
    if (m) {
      m[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((prefix) =>
          hsNotes.push({
            prefix: prefix.toLowerCase(),
            hsCode: normalizeHsCodeInput(m[2]),
          }),
        );
    }
  });

  // Berat TOTAL sering cuma ada di baris ringkasan ("TOTAL 1 BOX(ES) ..
  let totalNetto = null;
  let totalBruto = null;
  if (totalLine) {
    const kgs = normalizeCiplValueText(totalLine).match(
      /([\d,]+\.?\d*)\s*KGS?\b/gi,
    );
    if (kgs && kgs.length) {
      const nums = kgs.map((t) => Number(t.replace(/[^\d.]/g, "")));
      totalNetto = nums[0] != null ? nums[0] : null;
      totalBruto = nums.length > 1 ? nums[1] : null;
    }
  }

  return {
    invoice,
    docDate,
    seller,
    consignee,
    etd,
    destination,
    origin: originRaw,
    voyage,
    incoterm,
    package: packageText,
    totalNetto,
    totalBruto,
    hsNotes,
  };
}

// Cocokkan catatan HS Code ke barang lewat awalan nama
/* Baris ukuran di bawah TOTAL Packing List:

     SIZE :50*42*14(CM) /1BOX
     SIZE :46*24*14CM) /1BOX     <- kurung pembuka hilang, sering terjadi

   Yang diambil hanya tiga angkanya. Tanda kurung, satuan, dan jumlah
   box sengaja diabaikan supaya salah ketik seperti di atas tidak
   membuat barisnya gagal terbaca sama sekali. */
function extractCiplSizeLines(pageText) {
  const out = [];
  String(pageText || "")
    .split(/\n/)
    .forEach((baris) => {
      /* Kata pembukanya berbeda-beda antar pemasok:

           SIZE :50*42*14(CM) /1BOX
           Dimension : 460*380*200 * 1 BOX(ES)

         Yang dicari tiga angka berpemisah x atau *, didahului salah
         satu kata kunci ukuran. Sisanya — kurung, satuan cm, spasi —
         diabaikan supaya salah ketik tidak membuat barisnya gagal
         terbaca sama sekali. */
      const m = /^\s*(?:SIZE|DIMENSIONS?|UKURAN)\s*:?\s*([\d.,]+)\s*[x*]\s*([\d.,]+)\s*[x*]\s*([\d.,]+)/i.exec(
        baris,
      );
      if (!m) return;
      /* Jumlah koli ditulis di ekor baris, juga dengan dua gaya:

           /1BOX                 -> pemisah garis miring
           * 1 BOX(ES)           -> pemisah bintang, satuan berkurung

         "(ES)" dibuang: yang disimpan jenis kemasannya, bukan bentuk
         jamaknya. */
      const k = /[\/*]\s*(\d+)\s*([A-Z]+)/i.exec(baris.slice(m[0].length - 1));
      const jenis = k ? k[2].toUpperCase().replace(/\(?ES\)?$/, "") : "";
      out.push({
        dims: `${m[1]}*${m[2]}*${m[3]}`,
        boxes: k ? `${k[1]} ${jenis}` : "",
        boxCount: k ? Number(k[1]) || 0 : 0,
        unit: jenis,
      });
    });
  return out;
}

/* Ukuran dipasangkan MENURUT URUTAN, karena baris SIZE tidak menyebut
   barang mana yang dimaksud. Kalau jumlahnya tidak sama, tidak
   dipasangkan sama sekali — menebak pasangan lebih buruk daripada
   membiarkan kosong: dimensi yang salah langsung menyesatkan CBM. */
/* Jumlah & jenis koli dari baris TOTAL: "TOTAL 1 BOX(ES) FCA ...".

   Dipakai saat baris ukuran tidak menyebut kolinya, atau saat barangnya
   cuma satu — seluruh kemasan kiriman itu memang miliknya. Untuk
   kiriman berisi banyak barang, angka total TIDAK dibagi rata: menebak
   pembagian koli lebih buruk daripada membiarkannya kosong. */
function ciplTotalPackageFromText(pageText) {
  const m = /^\s*TOTAL\s+(\d+)\s*([A-Z]+)\(?ES\)?/im.exec(String(pageText || ""));
  if (!m) return null;
  return { jumlah: Number(m[1]) || 0, unit: m[2].toUpperCase() };
}

function applyCiplSizes(items, sizes, total) {
  if (!items.length) return;

  /* Barang tunggal tanpa baris ukuran: kemasannya diambil dari TOTAL. */
  if (items.length === 1 && total && total.jumlah && !items[0].package) {
    items[0].package = `${total.jumlah} ${total.unit}`;
    items[0].packageUnit = total.unit;
  }

  if (!sizes.length) return;
  if (sizes.length !== items.length) return;
  items.forEach((it, i) => {
    /* DUA nilai, bukan satu, karena kolom Kemasan dipakai dua cara:
       buku Import menghitung total koli dari angka depannya, buku
       Export menghitung CBM dari dimensinya. Menyimpan dimensi untuk
       Import berarti "50*42*14" terbaca sebagai 50 koli. Yang memilih
       nanti ciplRawItemsToFinalItems(), yang memang tahu bukunya. */
    if (!it.package) it.package = sizes[i].boxes;
    if (!it.packageUnit) it.packageUnit = sizes[i].unit;
    if (!it.dimensions) it.dimensions = sizes[i].dims;
  });
}

function applyCiplHsNotes(items, hsNotes) {
  if (!hsNotes || !hsNotes.length) return items;
  const sorted = [...hsNotes].sort((a, b) => b.prefix.length - a.prefix.length);
  items.forEach((it) => {
    if (it.hsCode) return;
    const lower = (it.name || "").toLowerCase();
    const hit = sorted.find((h) => lower.startsWith(h.prefix));
    if (hit) it.hsCode = hit.hsCode;
  });
  return items;
}

function detectCiplPdfKind(text) {
  const head = (text || "").slice(0, 400);
  if (/PACKING\s+LIST/i.test(head)) return "pl";
  if (/COMMERCIAL\s+INVOICE/i.test(head)) return "ci";
  return null;
}

// Dipanggil dari import/dispatch.js
function parseCiplPdfText(text, pagesItems) {
  const notes = [];
  const pages = (pagesItems || []).map((items) => {
    const pageText = pdfLines(items)
      .map((l) => l.text)
      .join("\n");
    return { items, pageText, kind: detectCiplPdfKind(pageText) };
  });

  const known = pages.filter((p) => p.kind);
  const usable = known.length ? known : pages;

  const itemSources = [];
  const fieldsList = [];
  const kinds = new Set();
  const allHsNotes = [];
  const allSizes = [];

  usable.forEach((p) => {
    const kind = p.kind || detectCiplPdfKind(text) || "ci";
    kinds.add(kind);
    const f = parseCiplPdfPageFields(p.items, p.pageText);
    fieldsList.push(f);
    allHsNotes.push(...(f.hsNotes || []));
    const rows = ciplPdfTableRows(p.items);
    const its = ciplRowsToItems(rows, kind);
    if (its.length) itemSources.push(its);
    allSizes.push(...extractCiplSizeLines(p.pageText));
  });

  // Field: pakai nilai PERTAMA yang tidak kosong lintas halaman
  const pick = (key) => {
    for (const f of fieldsList) {
      if (f[key] != null && String(f[key]).trim() !== "") return f[key];
    }
    return "";
  };

  const merged = mergeItemSources(itemSources);
  applyCiplHsNotes(merged, allHsNotes);
  applyCiplSizes(merged, allSizes, ciplTotalPackageFromText(text));

  // Bruto = TOTAL dari baris ringkasan Packing List ("TOTAL 1 BOX(ES) ..
  const totBruto = (() => {
    for (const f of fieldsList) if (f.totalBruto != null) return f.totalBruto;
    return null;
  })();
  applyTotalBrutoToFirstItem(merged, totBruto);

  /* Kemasan tingkat pengiriman. Baris "TOTAL n BOX(ES)" tidak selalu
     ada — sebagian Packing List hanya menyebut berat totalnya. Kalau
     begitu, jumlah koli dijumlahkan dari baris-baris SIZE. */
  const totalKoli = allSizes.reduce((n, s) => n + (s.boxCount || 0), 0);
  const satuanKoli = (allSizes.find((s) => s.boxes) || {}).boxes || "";
  const packageFallback =
    totalKoli > 0 && satuanKoli
      ? `${totalKoli} ${satuanKoli.split(/\s+/).pop()}`
      : "";

  const origin = pick("origin");
  const destination = pick("destination");
  const modeHint = guessCiplModeFromPorts(origin, destination);
  const seller = pick("seller");
  const consignee = pick("consignee");

  // Nilai yang TIDAK ADA di dokumen ini dibiarkan null, JANGAN dijadikan 0
  const rawItems = merged.map((it) => ({
    /* Dibersihkan DI SINI, bukan saat baris pertama dibaca.

       Label rujukan seperti "Items of PO ..." datang sebagai baris
       LANJUTAN dan ditempelkan ke nama setelah baris pertamanya
       selesai diproses. Membersihkan di awal berarti membersihkan
       teks yang belum ada. */
    name: bersihkanLabelNama(it.name || ""),
    hsCode: it.hsCode || "",
    qty: it.qty != null ? it.qty : null,
    satuan: it.satuan || "",
    harga: it.harga != null ? it.harga : null,
    netto: it.netto != null ? it.netto : null,
    bruto: it.bruto != null ? it.bruto : null,
    package: it.package || "",
    dimensions: it.dimensions || "",
  }));

  if (!rawItems.length) {
    notes.push(
      "Tidak ada baris barang yang terbaca dari tabel Goods Descriptions.",
    );
  }
  const hasCi = kinds.has("ci");
  const hasPl = kinds.has("pl");
  if (hasCi && hasPl) {
    notes.push(
      "File ini memuat Commercial Invoice DAN Packing List sekaligus — harga & qty diambil dari halaman CI, berat netto/bruto dari halaman PL, lalu digabung otomatis.",
    );
  } else if (hasCi) {
    notes.push(
      "PDF ini Commercial Invoice: harga & qty terbaca, TAPI berat netto/bruto TIDAK ada di dokumen ini — kalau ada file Packing List (PL) pasangannya, pilih keduanya sekaligus supaya berat ikut terisi otomatis.",
    );
  } else if (hasPl) {
    notes.push(
      "PDF ini Packing List: berat netto/bruto & qty terbaca, TAPI harga TIDAK ada di dokumen ini — kalau ada file Commercial Invoice (CI) pasangannya, pilih keduanya sekaligus supaya harga ikut terisi otomatis.",
    );
  }
  if (rawItems.length && rawItems.some((it) => !it.hsCode)) {
    notes.push(
      "Sebagian barang tidak ketemu HS Code-nya (dokumen CIPL sering tidak mencantumkannya sama sekali) — isi manual di tab Daftar Barang.",
    );
  }
  notes.push(
    "Hasil baca PDF CIPL ini best-effort — mohon cek ulang moda transportasi, HS Code, dan nama barang sebelum simpan.",
  );

  return {
    fields: {
      invoice: pick("invoice"),
      docDate: pick("docDate"),
      party: pickCiplParty(seller, consignee, modeHint || activeMode),
      seller,
      consignee,
      origin: portDisplay(origin),
      destination: portDisplay(destination),
      incoterm: pick("incoterm"),
      transport: guessTransportFromText(origin, destination),
      voyage: pick("voyage"),
      etd: pick("etd"),
      package: pick("package") || packageFallback,
    },
    rawItems,
    itemsKind: hasCi && hasPl ? "cipl" : hasCi ? "ci" : "pl",
    notes,
    modeHint,
    source: hasCi && hasPl ? "cipl-pdf" : hasCi ? "cipl-pdf-ci" : "cipl-pdf-pl",
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseCiplPdfText,
    detectCiplPdfKind,
    parseCiplValueTokens,
    ciplPdfTableRows,
  };
}
