"use strict";

/* Deteksi tipe file lalu panggil parser yang sesuai */

/* Item mentah CIPL -> bentuk item form yang sama dipakai. Kolom barang
   CEISA dari `kolom` (pembaca mesin EXIM, kolomBarangCipl); pembaca
   lama hanya memberi satu teks nama -> Uraian. Kolom lain: nilai
   bawaan newItem(). */
function ciplRawItemsToFinalItems(rawItems) {
  return (rawItems || []).map((it) => ({
    ...newItem(),
    ...(it.kolom || { namaBarang: it.name || "" }),
    /* CIPL tidak memuat kondisi barang; negara asalnya dari COUNTRY OF
       ORIGIN (ciplDariMesin). undefined = tidak dibawa berkasnya:
       isian barang lama / bawaan form yang berlaku (lengkapiKodeBarang). */
    kondisiBarang: undefined,
    negaraAsal: it.negaraAsal || undefined,
    hsCode: normalizeHsCodeInput(it.hsCode),
    jenisBarang: activeMode === "export" ? "BARANG JADI" : "BAHAN BAKU",
    qty: it.qty != null ? it.qty : 0,
    satuan: it.satuan || "",
    harga: it.harga != null ? it.harga : 0,
    netto: it.netto != null ? it.netto : 0,
    bruto: it.bruto != null ? it.bruto : 0,
    ...ciplPackagingFor(it),
  }));
}

/* KEMASAN: satu sumber, dua bentuk, dan bukunya yang menentukan.

   Packing List memberi DUA keterangan sekaligus untuk tiap barang:

     "SIZE :50*42*14(CM) /1BOX"
            └─ dimensi ┘  └ koli ┘

   IMPORT hanya butuh jumlah kolinya. Kolom `package` di sana dibaca
   sebagai "5 BOX" — angka depannya dijumlahkan jadi total koli. Mengisi
   dimensi ke situ membuat "50*42*14" terbaca sebagai 50 koli.

   EXPORT butuh KEDUANYA: dimensi untuk menghitung CBM, jumlah koli
   untuk surat jalan. Karena itu modelnya memang sudah punya dua kolom
   terpisah — `package` (dimensi) dan `packing` (koli). Mengisi salah
   satunya saja berarti membuang keterangan yang sudah terbaca. */
function ciplPackagingFor(it) {
  const koli = String(it.package || "").trim();
  const dims = String(it.dimensions || "").trim();

  if (activeMode !== "export") {
    return { package: koli || dims, packing: "", packingUnit: "" };
  }

  // "1 BOX" / "2 PALLET" -> angka & jenisnya dipisah supaya bisa
  // dijumlahkan per jenis tanpa mengurai teks lagi di hilir.
  const m = /^(\d+(?:[.,]\d+)?)\s*([A-Za-z]+)?/.exec(koli);
  return {
    package: dims || koli,
    packing: koli,
    packingUnit: m && m[2] ? m[2].toUpperCase() : "",
  };
}

// Gabung field dari 2 hasil parse CIPL: pakai yang PERTAMA tidak kosong
function mergeCiplPdfFields(a, b) {
  const out = {};
  new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((k) => {
    out[k] = (a && a[k]) || (b && b[k]) || "";
  });
  return out;
}

/* ------------------------------------------------------------------
   CIPL LEWAT MESIN EXIM

   CIPL dibaca js/import/exim-engine.js -- mesin yang sama dengan
   halaman Cek PIB/PEB dan EXIM Checker: label & kolom dikenali dari
   artinya (bukan alamat sel), satu sheet CI,PL maupun CI & PL terpisah
   (dua berkas Excel/PDF dibaca sebagai SATU CIPL), baris tersembunyi
   dilewati, angka 1.234,56 / 1,234.56, satuan EA = PCS, SIZE & koli per
   barang, judul berbahasa Korea, dan seterusnya. Perbaikan ekstraksi
   cukup ditulis sekali di mesinnya.

   Pembaca lama (excel-cipl.js / pdf-cipl.js) tetap ada sebagai
   CADANGAN: dipakai kalau mesinnya tidak menemukan satu barang pun,
   dan untuk isian kepala yang dibiarkan kosong oleh mesin.

   HS Code 8 digit dilengkapi dari Database HS Code menurut nama barang
   (hsDatabaseUntukBarang, hscode-view.js) -- CIPL biasanya hanya benar
   sampai 6 digit, atau menulis kode 10 digit negara asalnya.
------------------------------------------------------------------ */

/* Sisi CIPL yang ada di satu berkas: "CI", "PL", atau "CIPL" (keduanya). */
function ciplSisiMesin(src) {
  try {
    const r = src.wb ? EximEngine.resolveCiplSheets(src.wb) : src.pages ? EximEngine.pdfCiplGrids(src.pages) : null;
    if (!r) return "";
    return r.missingSide === "PL" ? "CI" : r.missingSide === "CI" ? "PL" : "CIPL";
  } catch (e) {
    return "";
  }
}

/* Pembaca lama untuk satu berkas CIPL (cadangan). */
function bacaCiplLama(src) {
  if (src.wbLama) return parseCiplWorkbook(src.wbLama);
  if (src.text != null) return parseCiplPdfText(src.text, src.pagesItems);
  return null;
}

/* Kolom CIPL -> kolom barang CEISA jadwal: uraian -> Uraian, tipe /
   spesifikasi -> Tipe, merek -> Merek -- susunan yang sama dengan draft
   CEISA yang disusun dari CIPL ini. Yang tidak tercetak tidak diisi
   (nilai bawaan newItem()); tanpa uraian, tipe & mereknya jadi Uraian. */
function kolomBarangCipl(it) {
  const bersih = (v) => {
    const teks = bersihkanLabelNama(String(v == null ? "" : v).replace(/\s+/g, " ").trim());
    return isPlaceholderValue(teks) ? "" : teks;
  };
  const uraian = bersih(it.description);
  const tipe = bersih(it.type);
  const merek = bersih(it.brand);
  if (!uraian) return { namaBarang: [tipe, merek].filter(Boolean).join(" ") };
  const kolom = { namaBarang: uraian };
  if (tipe && tipe.toUpperCase() !== uraian.toUpperCase()) kolom.tipe = tipe;
  if (merek && merek.toUpperCase() !== uraian.toUpperCase()) kolom.merek = merek;
  return kolom;
}

/* HS Code satu barang CIPL untuk form: 8 digit dari Database HS Code
   kalau namanya dikenal dan 6 digit awalnya tidak bertentangan dengan
   CIPL; selain itu kode CIPL apa adanya (dipotong 8 digit). */
function hsBarangCipl(it, catat) {
  const cipl = String(it.hs || "").replace(/\D/g, "");
  const hit = typeof hsDatabaseUntukBarang === "function" ? hsDatabaseUntukBarang(it.description, it.type) : null;
  if (hit && hit.kode) {
    if (cipl.length < 6 || hit.kode.startsWith(cipl.slice(0, 6))) {
      if (hit.kode !== cipl.slice(0, 8)) catat.dariDb.push(it.no);
      return hit.kode;
    }
    catat.bentrok.push(`${it.no} (CIPL ${it.hs}, database ${EximEngine.fmtHs(hit.kode)})`);
  }
  if (cipl.length > 8) catat.negara.push(it.no);
  else if (cipl && cipl.length < 8) catat.pendek.push(it.no);
  return normalizeHsCodeInput(cipl);
}

/* Hasil mesin -> bentuk hasil impor form (fields + items), sama dengan
   yang dulu dikembalikan parseCiplWorkbook / parseCiplPdfText. */
function ciplDariMesin(c, sumber, lama) {
  const pdf = sumber.every((s) => !s.wb);
  const catat = { dariDb: [], bentrok: [], negara: [], pendek: [] };
  // COUNTRY OF ORIGIN CIPL ("KOREA", "MADE IN CHINA") -> kode negara semua barangnya
  const negaraAsal = typeof kodeNegara === "function" ? kodeNegara(String(c.country_origin || "").replace(/^\s*MADE\s+IN\s+/i, "")) : "";
  const raw = c.items.map((it) => ({
    kolom: kolomBarangCipl(it),
    negaraAsal,
    hsCode: hsBarangCipl(it, catat),
    qty: it.qty != null ? it.qty : null,
    satuan: it.unit || "",
    harga: it.unit_price != null ? it.unit_price : it.qty && it.amount != null ? roundNum(it.amount / it.qty, 4) : null,
    netto: it.net != null ? it.net : null,
    bruto: it.gross != null ? it.gross : null,
    package: it.package || "",
    dimensions: it.dimensions || "",
  }));
  const notes = [];
  // Berat yang hanya tercetak sebagai TOTAL ditumpuk ke barang pertama (aturan yang sama dengan pembaca lama)
  if (raw.length && !raw.some((it) => Number(it.netto) > 0) && Number(c.total_net) > 0) {
    raw.forEach((it, i) => (it.netto = i === 0 ? c.total_net : 0));
    notes.push(t("y.netto.total.ke.barang.pertama", { kg: c.total_net }));
  }
  applyTotalBrutoToFirstItem(raw, c.total_gross);

  const f = (lama.find((x) => x && x.fields) || {}).fields || {};
  const seller = c.exporter || c.seller || f.seller || "";
  const consignee = c.buyer || f.consignee || "";
  const origin = c.port_loading || "";
  const destination = c.final_destination || c.port_destination || "";
  const modeHint = guessCiplModeFromPorts(origin, destination) || guessCiplModeFromPorts(f.origin, f.destination);
  const kemasan = c.packages ? `${c.packages} ${c.package_unit || ""}`.trim() : "";
  const fields = {
    invoice: c.invoice_no || f.invoice || "",
    invoiceDate: c.invoice_date || f.docDate || "",
    docDate: c.invoice_date || f.docDate || "",
    party: pickCiplParty(seller, consignee, modeHint || activeMode),
    seller,
    consignee,
    masterBL: c.master_bl || f.masterBL || "",
    houseBL: c.house_bl || (!c.master_bl && c.bl_no) || f.houseBL || "",
    origin: origin ? portDisplay(origin) : f.origin || "",
    destination: destination ? portDisplay(destination) : f.destination || "",
    incoterm: c.incoterm || f.incoterm || "",
    transport: origin || destination ? guessTransportFromText(origin, destination) : f.transport || "",
    voyage: c.vessel || f.voyage || "",
    etd: c.etd || f.etd || "",
    package: kemasan || f.package || "",
    muatan: c.muatan || f.muatan || "",
  };

  // Catatan HS Code -- gugur kalau draft CEISA ikut dipilih (ciplTanpaCatatanHs)
  const daftar = (nos) => nos.join(", ");
  const catatanHs = [];
  if (catat.dariDb.length) catatanHs.push(t("y.hs.dari.database.hs", { no: daftar(catat.dariDb), cipl: catat.negara.length ? tt("kode negara asal", "the origin country's code") : tt("6 digit", "6 digits") }));
  if (catat.bentrok.length) catatanHs.push(t("y.hs.beda.dengan.database", { no: daftar(catat.bentrok) }));
  if (catat.negara.length) catatanHs.push(t("y.hs.cipl.kode.negara", { no: daftar(catat.negara) }));
  if (catat.pendek.length) catatanHs.push(t("y.hs.cipl.belum.8.digit", { no: daftar(catat.pendek) }));
  if (raw.some((it) => !it.hsCode)) catatanHs.push(t("y.sebagian.tanpa.hs.code.cipl"));
  notes.push(...catatanHs);
  (c.warnings || []).slice(0, 6).forEach((w) => notes.push(w));
  notes.push(t("y.cipl.dibaca.mesin.exim", { format: c.sourceFormat || (pdf ? "PDF" : "Excel") }));

  return {
    fields,
    items: ciplRawItemsToFinalItems(raw),
    notes,
    notesHs: catatanHs,
    modeHint,
    source: pdf ? "cipl-pdf" : "cipl",
  };
}

/* CIPL + draft CEISA dipilih bersama: HS Code tiap barang datang dari
   draft (prioritasnya lebih tinggi dari CIPL), jadi catatan HS Code CIPL
   ("belum 8 digit, lengkapi", "diambil dari Database HS Code", ...)
   sudah tidak berlaku -- dibuang supaya tidak menyuruh mengisi yang
   sudah terisi. Pembaca lama hanya punya catatan umumnya. */
function ciplTanpaCatatanHs(hasilCipl, hasilDokumen) {
  const hsLengkap = hasilDokumen.some(
    (r) => (r.items || []).length && r.items.every((it) => String(it.hsCode || "").replace(/\D/g, "").length >= 8),
  );
  if (!hsLengkap) return hasilCipl;
  const umum = t("y.sebagian.tanpa.hs.code.cipl");
  return hasilCipl.map((r) => ({
    ...r,
    notes: (r.notes || []).filter((n) => n !== umum && !(r.notesHs || []).includes(n)),
  }));
}

/* Satu atau dua berkas CIPL -> hasil impor. Dua berkas yang satu CI dan
   satunya PL dibaca sebagai SATU CIPL; berkas yang masing-masing sudah
   memuat CI & PL (dua invoice) tetap diterapkan sendiri-sendiri. */
function hasilCipl(sumber) {
  const mesinAda = typeof EximEngine !== "undefined";
  const sisi = sumber.map((s) => (mesinAda ? ciplSisiMesin(s) : ""));
  const pasangan = sumber.length === 2 && sisi.includes("CI") && sisi.includes("PL");
  const kelompok = pasangan ? [sumber] : sumber.map((s) => [s]);
  const hasil = [];
  kelompok.forEach((grup) => {
    const lama = grup.map((s) => {
      try {
        return bacaCiplLama(s);
      } catch (e) {
        console.warn("Pembaca CIPL lama:", e);
        return null;
      }
    });
    let c = null;
    if (mesinAda && grup.every((s) => s.wb || s.pages)) {
      try {
        c = EximEngine.readCiplSources(grup.map((s) => (s.wb ? { wb: s.wb, name: s.name } : { pages: s.pages, name: s.name })));
      } catch (e) {
        console.warn("Mesin EXIM gagal, pakai pembaca lama:", e);
      }
    }
    if (c && c.items && c.items.length) {
      hasil.push(ciplDariMesin(c, grup, lama));
      return;
    }
    // Cadangan: perilaku pembaca lama apa adanya
    const ada = lama.filter(Boolean);
    if (ada.length === 2 && ada.every((r) => /^cipl/.test(r.source || "")) && ada[0].source !== ada[1].source) {
      hasil.push(combineCiplPair(ada));
      return;
    }
    ada.forEach((r, i) => {
      if (!r.items.length && !(r.rawItems || []).length && !r.fields.invoice && !r.fields.party) {
        throw new Error(t("y.tidak.terbaca.bc.maupun.cipl", { nama: grup[i] ? grup[i].name : "" }));
      }
      hasil.push(r.rawItems ? { ...r, items: ciplRawItemsToFinalItems(r.rawItems) } : r);
    });
  });
  return hasil;
}

/* Satu berkas -> { hasil } (PIB / PEB / draft CEISA, sudah dibaca) atau
   { cipl } (bahan CIPL, dibaca bersama berkas CIPL lainnya). */
async function bacaBerkasImport(file) {
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (isPdf) {
    const { text, pagesItems, pdf, lib } = await extractPdfText(file);

    // Judul dokumen dicek DULUAN (murah
    if (detectCiplPdfKind(text)) {
      let pages = null;
      if (typeof EximEngine !== "undefined" && pdf) {
        try {
          pages = await EximEngine.pdfPagesFromDocument(pdf, lib);
        } catch (e) {
          console.warn("Halaman PDF untuk mesin EXIM:", e);
        }
      }
      return { cipl: { name: file.name, pages, text, pagesItems } };
    }

    // PEB dicek sebelum PIB: keduanya dokumen bea cukai berformat mirip
    if (isPebPdfText(text)) return { hasil: parsePebPdfText(text, pagesItems) };

    const pib = parsePibPdfText(text, pagesItems);
    if (!pib.isPib && !pib.fields.docNo && !pib.items.length) {
      throw new Error(
        t("y.bukan.format.dikenali", { nama: file.name }),
      );
    }
    return { hasil: pib };
  }

  await ensureXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const hasBcFormat = wb.Sheets["HEADER"] && wb.Sheets["BARANG"];
  if (hasBcFormat) return { hasil: parseBcExcelWorkbook(wb) };

  let wbMesin = null;
  if (typeof EximEngine !== "undefined") {
    try {
      wbMesin = XLSX.read(buf, EximEngine.XLSX_READ_OPTS);
    } catch (e) {
      console.warn("Workbook untuk mesin EXIM:", e);
    }
  }
  return { cipl: { name: file.name, wb: wbMesin, wbLama: wb } };
}

// Dua hasil CIPL (CI & PL, file terpisah) -> satu hasil gabungan.
function combineCiplPair(results) {
  const sources = results.map((r) => r.rawItems || r.items || []);
  const merged = mergeItemSources(sources);
  // Bruto ditangani TERPISAH: dari dua file yang digabung
  const totalBruto = Math.max(
    ...sources.map((list) =>
      list.reduce((sum, it) => sum + (Number(it.bruto) || 0), 0),
    ),
    0,
  );
  applyTotalBrutoToFirstItem(merged, totalBruto);
  const combinedNotes = [
    t("w.digabung.otomatis.dari.2.berkas"),
    ...results.flatMap((r) =>
      (r.notes || []).filter((n) => !/pasangannya/i.test(n)),
    ),
  ];
  const mergedFields = mergeCiplPdfFields(results[0].fields, results[1].fields);
  return {
    fields: mergedFields,
    items: ciplRawItemsToFinalItems(merged),
    notes: [...new Set(combinedNotes)],
    modeHint: guessCiplModeFromPorts(
      mergedFields.origin,
      mergedFields.destination,
    ),
    source: "cipl-pdf",
  };
}

/* SERET & LEPAS BERKAS.

   Teks di layar sudah menjanjikannya ("atau seret ke sini") dan CSS
   .is-dragover sudah ada — tapi tidak ada satu pun pendengar yang
   memasangnya. Janji yang tidak ditepati lebih buruk daripada tidak
   dijanjikan: orang mencoba sekali, gagal, lalu berhenti percaya pada
   petunjuk lain di layar yang sama.

   Berkas yang dilepas diproses lewat jalur yang sama persis dengan
   yang dipilih lewat tombol — satu penangan, satu perilaku. */
const importZone = $("#importZone");
if (importZone) {
  const tahan = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  ["dragenter", "dragover"].forEach((ev) =>
    importZone.addEventListener(ev, (e) => {
      tahan(e);
      importZone.classList.add("is-dragover");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    importZone.addEventListener(ev, (e) => {
      tahan(e);
      /* dragleave juga menyala saat kursor melintas ke elemen ANAK.
         Tanpa penjaga ini sorotannya berkedip-kedip saat menyeret. */
      if (ev === "dragleave" && importZone.contains(e.relatedTarget)) return;
      importZone.classList.remove("is-dragover");
    }),
  );
  importZone.addEventListener("drop", (e) => {
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) prosesBerkasImport(files);
  });
}

$("#fileImportExcel").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  await prosesBerkasImport(files);
});

async function prosesBerkasImport(files) {
  /* Kotak berkas dikosongkan lebih dulu: tanpa ini, memilih berkas
     yang SAMA dua kali tidak memicu apa-apa karena nilainya tak
     berubah. */
  $("#fileImportExcel").value = "";
  const btn = $("#btnImportExcel");
  const originalHtml = btn.innerHTML;
  btn.classList.add("is-loading");
  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-arrow-repeat spin"></i> Membaca ${files.length > 1 ? "file-file" : "file"}...`;
  try {
    const dibaca = [];
    for (const f of files) dibaca.push(await bacaBerkasImport(f));

    /* CIPL dikumpulkan dulu: CI & PL di dua berkas dibaca sebagai satu
       CIPL. Hasilnya diterapkan PALING AWAL, apa pun urutan berkasnya:
       dokumen kepabeanan sesudahnya menimpa isian kepala (prioritasnya
       lebih tinggi) tapi mempertahankan harga satuan dari CIPL -- urutan
       yang dulu hanya benar kalau CIPL kebetulan dipilih lebih dulu. */
    const sumberCipl = dibaca.filter((x) => x.cipl).map((x) => x.cipl);
    if (sumberCipl.length && typeof hsCodeSiap === "function") await hsCodeSiap();
    const hasilDokumen = dibaca.filter((x) => x.hasil).map((x) => x.hasil);
    const toApply = ciplTanpaCatatanHs(sumberCipl.length ? hasilCipl(sumberCipl) : [], hasilDokumen).concat(hasilDokumen);

    const summaries = [];
    let allNotes = [];
    toApply.forEach((parsed) => {
      const { summary, notes } = applyImportedBcData(parsed);
      summaries.push(summary);
      allNotes = allNotes.concat(notes);
    });
    allNotes = [...new Set(allNotes)];

    showImportNotes(summaries.join(" "), allNotes);
    showToast(
      `${summaries.join(" ")}${allNotes.length ? t("y.ada.catatan.perlu.dicek") : ""}`,
      allNotes.length ? "warning" : "success",
    );
  } catch (err) {
    console.error(err);
    showToast(
      (err && err.message) || t("v.gagal.membaca.file.yang.dipilih.coba.lagi"),
      "danger",
    );
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
