"use strict";

/* ==================================================================
   DISPATCH FILE IMPORT: deteksi tipe file yang dipilih (PDF PIB/CEISA,
   PDF Packing List, PDF Commercial Invoice, Excel format BC, Excel
   format CIPL) lalu panggil parser yang sesuai. Menyatukan semua modul
   import/*.js di atas.

   Boleh pilih LEBIH DARI 1 file sekaligus sekarang (mis. PL.pdf +
   CI.pdf pasangannya) -- kalau PERSIS 2 file terpilih dan keduanya
   sama-sama terdeteksi sbg PDF CIPL (1 Packing List + 1 Commercial
   Invoice), hasilnya digabung OTOMATIS lewat mergeItemSources yang
   sama dipakai excel-cipl.js (harga & qty dari CI, netto/bruto dari
   PL, field yang kosong di satu sisi diisi dari sisi lain) -- persis
   seperti sheet CI+PL digabung otomatis dalam 1 file Excel.
================================================================== */

// Item mentah dari PDF CIPL (name/qty/satuan/harga/netto/bruto, TANPA
// hsCode -- dokumen jenis ini biasanya tidak mencantumkannya) diubah ke
// bentuk item form yang sama dipakai semua sumber import lain.
function ciplPdfRawItemsToFinalItems(rawItems) {
  return (rawItems || []).map((it) => ({
    ...newItem(),
    namaBarang: it.name || "",
    hsCode: "",
    jenisBarang: "Bahan Baku",
    qty: it.qty != null ? it.qty : 0,
    satuan: it.satuan || "",
    harga: it.harga != null ? it.harga : 0,
    netto: it.netto != null ? it.netto : 0,
    bruto: it.bruto != null ? it.bruto : 0,
  }));
}

// Field dari 2 hasil parse PDF CIPL (PL & CI) digabung: utk tiap field,
// pakai yang PERTAMA tidak kosong (urutan a lalu b) -- aman krn field yg
// SAMA-SAMA terisi di kedua sisi (mis. invoice/consignee) memang nilainya
// sama persis (1 shipment yang sama), dan yang cuma ada di salah satu
// sisi (mis. incoterm cuma di CI) otomatis terisi dari situ.
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
    // Judul dokumen dicek DULUAN (murah, cuma cek teks) sebelum nyoba
    // parser PIB yang jauh lebih berat -- PDF Packing List/Commercial
    // Invoice sama sekali bukan format PIB, jadi tidak perlu dipaksakan
    // lewat parsePibPdfText dulu baru gagal.
    const ciplKind = detectCiplPdfKind(text);
    if (ciplKind) return parseCiplPdfText(text, pagesItems);

    const pib = parsePibPdfText(text, pagesItems);
    if (!pib.isPib && !pib.fields.docNo && !pib.items.length) {
      throw new Error(
        `"${file.name}" sepertinya bukan format PIB BC 2.0, Packing List, atau Commercial Invoice yang dikenali, atau teksnya tidak terbaca (mis. hasil scan/gambar).`,
      );
    }
    return pib;
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const hasBcFormat = wb.Sheets["HEADER"] && wb.Sheets["BARANG"];
  if (hasBcFormat) return parseBcExcelWorkbook(wb);

  // Bukan format BC bawaan aplikasi -- dicoba sbg CIPL (sheet CI/PL
  // terpisah, sheet gabungan, atau nama lain yg tidak dikenali sekalipun,
  // krn parseCiplWorkbook sendiri sudah punya fallback scan-semua-sheet).
  // Cuma dianggap GAGAL kalau benar-benar tidak ketemu barang MAUPUN
  // field kunci apa pun.
  const cipl = parseCiplWorkbook(wb);
  if (!cipl.items.length && !cipl.fields.invoice && !cipl.fields.party) {
    throw new Error(
      `"${file.name}" tidak terbaca sbg format dokumen BC (sheet HEADER/BARANG) maupun CIPL manapun yang dikenali.`,
    );
  }
  return cipl;
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

    let parsed;
    const isCiplPdfPair =
      results.length === 2 &&
      results.every(
        (r) => r.source === "cipl-pdf-ci" || r.source === "cipl-pdf-pl",
      ) &&
      results[0].source !== results[1].source;

    if (isCiplPdfPair) {
      const merged = mergeItemSources([
        results[0].rawItems || [],
        results[1].rawItems || [],
      ]);
      const combinedNotes = [
        "Digabung otomatis dari 2 file PDF (Packing List + Commercial Invoice) yang dipilih sekaligus -- harga & qty dari Commercial Invoice, berat dari Packing List.",
        ...results.flatMap((r) =>
          (r.notes || []).filter((n) => !/pasangannya/i.test(n)),
        ),
      ];
      parsed = {
        fields: mergeCiplPdfFields(results[0].fields, results[1].fields),
        items: ciplPdfRawItemsToFinalItems(merged),
        // Catatan disclaimer umum ("best-effort", dst) SAMA persis di kedua
        // hasil parse individual -- dihilangkan duplikatnya biar tidak
        // nongol 2x di daftar catatan.
        notes: [...new Set(combinedNotes)],
        modeHint: "import",
        source: "cipl-pdf",
      };
    } else {
      parsed = results[0];
      if (parsed.rawItems) {
        parsed = {
          ...parsed,
          items: ciplPdfRawItemsToFinalItems(parsed.rawItems),
        };
      }
      if (results.length > 1) {
        parsed = {
          ...parsed,
          notes: [
            `${results.length} file dipilih sekaligus, tapi cuma bisa digabung otomatis utk pasangan PDF Packing List + Commercial Invoice -- hanya "${files[0].name}" yang diproses, sisanya diabaikan.`,
            ...(parsed.notes || []),
          ],
        };
      }
    }

    const { summary, notes } = applyImportedBcData(parsed);
    showImportNotes(summary, notes);
    showToast(
      `${summary}${notes.length ? " Ada catatan yang perlu dicek di atas form." : ""}`,
      notes.length ? "warning" : "success",
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
