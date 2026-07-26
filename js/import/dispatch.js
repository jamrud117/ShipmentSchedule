"use strict";

/* ==================================================================
   DISPATCH FILE IMPORT: deteksi tipe file lalu panggil parser yang
   sesuai. Yang dikenali sekarang:
     - PDF PIB BC 2.0            -> pdf.js       (Jadwal Import)
     - PDF PEB BC 3.0            -> pdf-peb.js   (Jadwal Export)  [BARU]
     - PDF Commercial Invoice /
       Packing List (CIPL)       -> pdf-cipl.js  (dua-duanya)
     - Excel draft CEISA (BC)    -> excel-bc.js
     - Excel CIPL supplier       -> excel-cipl.js

   Boleh pilih LEBIH DARI 1 file sekaligus: kalau yang terpilih adalah
   pasangan CI + PL (mau file PDF terpisah, mau Excel), hasilnya digabung
   otomatis lewat mergeItemSources() — harga & qty dari CI, netto/bruto
   dari PL. Sejak pdf-cipl.js membaca PER HALAMAN, satu file PDF yang
   memuat CI dan PL sekaligus juga sudah tergabung sendiri tanpa perlu
   memilih dua file.
================================================================== */

// Item mentah CIPL (name/qty/satuan/harga/netto/bruto) -> bentuk item
// form yang sama dipakai semua sumber import lain.
function ciplRawItemsToFinalItems(rawItems) {
  return (rawItems || []).map((it) => ({
    ...newItem(),
    namaBarang: it.name || "",
    hsCode: normalizeHsCodeInput(it.hsCode),
    jenisBarang: activeMode === "export" ? "Barang Jadi" : "Bahan Baku",
    qty: it.qty != null ? it.qty : 0,
    satuan: it.satuan || "",
    harga: it.harga != null ? it.harga : 0,
    netto: it.netto != null ? it.netto : 0,
    bruto: it.bruto != null ? it.bruto : 0,
    package: it.package || "",
  }));
}

// Gabung field dari 2 hasil parse CIPL: pakai yang PERTAMA tidak kosong.
// Aman karena field yang sama-sama terisi di kedua sisi (invoice,
// consignee, dst) memang bernilai sama persis — 1 shipment yang sama.
function mergeCiplPdfFields(a, b) {
  const out = {};
  new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach((k) => {
    out[k] = (a && a[k]) || (b && b[k]) || "";
  });
  return out;
}

async function parseOneImportFile(file) {
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (isPdf) {
    const { text, pagesItems } = await extractPdfText(file);

    // Judul dokumen dicek DULUAN (murah, cuma cek teks) sebelum mencoba
    // parser PIB/PEB yang jauh lebih berat.
    if (detectCiplPdfKind(text)) return parseCiplPdfText(text, pagesItems);

    // PEB dicek sebelum PIB: keduanya dokumen bea cukai berformat mirip,
    // tapi judulnya jelas berbeda ("EKSPOR" vs "IMPOR").
    if (isPebPdfText(text)) return parsePebPdfText(text, pagesItems);

    const pib = parsePibPdfText(text, pagesItems);
    if (!pib.isPib && !pib.fields.docNo && !pib.items.length) {
      throw new Error(
        `"${file.name}" sepertinya bukan format PIB BC 2.0, PEB BC 3.0, Packing List, atau Commercial Invoice yang dikenali, atau teksnya tidak terbaca (mis. hasil scan/gambar).`,
      );
    }
    return pib;
  }

  await ensureXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const hasBcFormat = wb.Sheets["HEADER"] && wb.Sheets["BARANG"];
  if (hasBcFormat) return parseBcExcelWorkbook(wb);

  const cipl = parseCiplWorkbook(wb);
  if (!cipl.items.length && !cipl.fields.invoice && !cipl.fields.party) {
    throw new Error(
      `"${file.name}" tidak terbaca sbg format dokumen BC (sheet HEADER/BARANG) maupun CIPL manapun yang dikenali.`,
    );
  }
  return cipl;
}

// Dua hasil CIPL (CI & PL, file terpisah) -> satu hasil gabungan.
function combineCiplPair(results) {
  const sources = results.map((r) => r.rawItems || r.items || []);
  const merged = mergeItemSources(sources);
  // Bruto ditangani TERPISAH: dari dua file yang digabung, biasanya cuma
  // Packing List yang memuat berat kotor. Totalnya diambil dari sisi yang
  // punya angka terbesar (sisi CI umumnya kosong), lalu dipasang di
  // barang pertama — aturan yang sama dipakai semua parser lain.
  const totalBruto = Math.max(
    ...sources.map((list) =>
      list.reduce((sum, it) => sum + (Number(it.bruto) || 0), 0),
    ),
    0,
  );
  applyTotalBrutoToFirstItem(merged, totalBruto);
  const combinedNotes = [
    "Digabung otomatis dari 2 file yang dipilih sekaligus (Commercial Invoice + Packing List) — harga & qty dari CI, berat dari PL.",
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

$("#fileImportExcel").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const btn = $("#btnImportExcel");
  const originalHtml = btn.innerHTML;
  btn.classList.add("is-loading");
  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-arrow-repeat spin"></i> Membaca ${files.length > 1 ? "file-file" : "file"}...`;
  try {
    const results = [];
    for (const f of files) results.push(await parseOneImportFile(f));

    const isCiplPair =
      results.length === 2 &&
      results.every((r) => /^cipl/.test(r.source || "")) &&
      results[0].source !== results[1].source;

    let toApply;
    if (isCiplPair) {
      toApply = [combineCiplPair(results)];
    } else {
      // Beberapa file berbeda jenis (mis. PIB + CIPL) diterapkan
      // BERURUTAN — aturan prioritas sumber di apply-to-form.js yang
      // menentukan field mana boleh menimpa field mana, jadi tidak perlu
      // lagi membuang file selain yang pertama seperti versi lama.
      toApply = results.map((r) =>
        r.rawItems ? { ...r, items: ciplRawItemsToFinalItems(r.rawItems) } : r,
      );
    }

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
      `${summaries.join(" ")}${allNotes.length ? " Ada catatan yang perlu dicek di atas form." : ""}`,
      allNotes.length ? "warning" : "success",
    );
  } catch (err) {
    console.error(err);
    showToast(
      (err && err.message) || "Gagal membaca file yang dipilih. Coba lagi.",
      "danger",
    );
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});
