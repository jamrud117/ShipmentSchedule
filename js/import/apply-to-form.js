"use strict";

/* TERAPKAN HASIL PARSE KE FORM */

const IMPORT_SOURCE_PRIORITY = {
  "pdf": 30, // PIB BC 2.0
  "pdf-peb": 30, // PEB BC 3.0
  "excel-bc": 20, // draft CEISA (HEADER/BARANG/ENTITAS/DOKUMEN)
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

// Field mana yang BOLEH diisi oleh sumber ini
const CIPL_BLOCKED_FIELDS = new Set([
  "fEtd",
  "fEta",
  "fActual",
  "fDocDate",
  "fDocNo",
  "fMasterBL",
  "fHouseBL",
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
   hanya menimpa yang sudah ada. */
function isPriceAuthority(source) {
  return isCiplSource(source);
}

// Nama barang untuk pencocokan: beda spasi & huruf besar bukan beda barang.
function itemMatchKey(it) {
  return String((it && it.namaBarang) || (it && it.name) || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* CEISA (excel-bc.js) TIDAK PERNAH mengisi `package` (dimensi P*L*T) --
   sheet BARANG di file itu memang tidak punya kolomnya sama sekali
   (beda dari Packing List, yang punya). Tanpa penjagaan ini, meng-
   import ulang excel CEISA ke draft Export yang dimensinya sudah
   diisi manual akan MENGHAPUS dimensi itu: item baru dari CEISA tidak
   membawa `package` apa pun, jadi field itu ikut ke nilai kosong
   begitu item lama ditimpa oleh preserveUnitPrices() di atas.

   Dicocokkan lewat nama/HS yang SAMA persis dengan preserveUnitPrices,
   supaya dimensi menempel ke barang yang benar walau urutan barisnya
   berubah — bukan sekadar berdasar posisi baris.

   Khusus Export saja: di Import, `package` berarti JUMLAH KOLI ("5
   BOX"), bukan dimensi -- konsep yang beda sama sekali (lihat
   ciplPackagingFor() di import/dispatch.js), dan itu di luar yang
   diminta di sini. */
function preserveDimensionsForCeisa(newItems, oldItems, src) {
  if (src !== "excel" || activeMode !== "export") return newItems;
  const lama = (oldItems || []).filter((it) => String(it.package || "").trim());
  if (!lama.length || !newItems.length) return newItems;

  const terpakai = new Set();
  const ambil = (uji) => {
    for (let i = 0; i < lama.length; i++) {
      if (terpakai.has(i)) continue;
      if (uji(lama[i])) {
        terpakai.add(i);
        return lama[i];
      }
    }
    return null;
  };

  return newItems.map((it) => {
    if (String(it.package || "").trim()) return it; // sudah terisi, jangan timpa
    const nama = itemMatchKey(it);
    const hs = normalizeHsCodeInput(it.hsCode);
    const cocok =
      (nama && ambil((o) => itemMatchKey(o) === nama)) ||
      (hs && ambil((o) => normalizeHsCodeInput(o.hsCode) === hs));
    return cocok ? Object.assign({}, it, { package: cocok.package }) : it;
  });
}

/* NAMA BARANG YANG SUDAH DIKETIK SENDIRI TIDAK DITIMPA IMPOR CEISA.

   Berkas CEISA menulis nama barang sebagai SATU teks gabungan; di
   aplikasi ini nama itu terbagi empat kolom (Uraian, Pattern, Size,
   Mold No) yang dipakai membentuk nama di kartu, CIPL, dan template
   salinan. Tidak ada aturan yang bisa memecah teks CEISA jadi empat
   kolom itu -- sudah dicoba dan selalu meleset, karena susunannya
   bergantung kebiasaan penulis berkas.

   Jadi arahnya dibalik: yang sudah diketik orang DIPERTAHANKAN, dan
   teks dari CEISA hanya dipakai untuk baris yang keempat kolomnya
   masih kosong. Impor CEISA memang dilakukan untuk mengambil angka
   kepabeanannya (HS, nilai, berat, kemasan) -- bukan namanya.

   PENCOCOKANNYA MENURUT URUTAN, bukan nama. Nama justru yang berbeda
   antara kedua sisi -- itu seluruh alasan fungsi ini ada -- jadi
   mencocokkan lewat nama pasti gagal. Urutan baris dipakai hanya
   kalau jumlah barangnya sama persis; kalau berbeda, dicocokkan lewat
   HS Code sekali pakai, dan baris yang tak berpasangan memakai nama
   dari berkas apa adanya.

   Khusus Export: di Import keempat kolom itu tidak ada. */
const ITEM_NAMA_FIELD = ["namaBarang", "pattern", "size", "moldNo"];

function punyaNamaManual(it) {
  return ITEM_NAMA_FIELD.some((k) => String((it && it[k]) || "").trim());
}

function salinNama(baru, lama) {
  const out = Object.assign({}, baru);
  ITEM_NAMA_FIELD.forEach((k) => {
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
  if (lamaIsi.length === newItems.length) {
    return {
      items: newItems.map((it, i) => {
        if (!punyaNamaManual(lamaIsi[i])) return it;
        kept++;
        return salinNama(it, lamaIsi[i]);
      }),
      kept,
      byOrder: true,
    };
  }

  const terpakai = new Set();
  const items = newItems.map((it) => {
    const hs = normalizeHsCodeInput(it.hsCode);
    if (!hs) return it;
    for (let i = 0; i < lama.length; i++) {
      if (terpakai.has(i)) continue;
      if (normalizeHsCodeInput(lama[i].hsCode) !== hs) continue;
      terpakai.add(i);
      kept++;
      return salinNama(it, lama[i]);
    }
    return it;
  });
  return { items, kept };
}

/* Mengembalikan harga satuan yang sudah ada ke daftar barang yang baru.

   Dicocokkan berlapis — nama dulu, baru HS Code — karena satu HS Code
   kerap dipakai beberapa barang sekaligus, sementara namanya jarang
   sama persis. Tiap barang lama hanya boleh dipakai sekali, supaya dua
   pos yang ber-HS sama tidak sama-sama mewarisi harga dari satu baris.

   Kalau tidak ada yang cocok sama sekali TAPI jumlah barangnya persis
   sama, dicocokkan menurut urutan: dokumen kepabeanan hampir selalu
   menyusun barang dalam urutan yang sama dengan invoice-nya. */
function preserveUnitPrices(newItems, oldItems) {
  const lama = (oldItems || []).filter((it) => parseLooseNumber(it.harga) > 0);
  if (!lama.length || !newItems.length) return { items: newItems, kept: 0 };

  const terpakai = new Set();
  let kept = 0;

  const ambil = (uji) => {
    for (let i = 0; i < lama.length; i++) {
      if (terpakai.has(i)) continue;
      if (uji(lama[i])) {
        terpakai.add(i);
        return lama[i];
      }
    }
    return null;
  };

  const items = newItems.map((it) => {
    const nama = itemMatchKey(it);
    const hs = normalizeHsCodeInput(it.hsCode);
    const cocok =
      (nama && ambil((o) => itemMatchKey(o) === nama)) ||
      (hs && ambil((o) => normalizeHsCodeInput(o.hsCode) === hs));
    if (!cocok) return it;
    kept++;
    return Object.assign({}, it, { harga: cocok.harga });
  });

  if (!kept && newItems.length === lama.length) {
    return {
      items: newItems.map((it, i) => Object.assign({}, it, { harga: lama[i].harga })),
      kept: newItems.length,
      byOrder: true,
    };
  }
  return { items, kept };
}

// Satu-satunya pintu penulisan field form dari hasil import.
function setImportField(id, value, source, opts) {
  if (value === "" || value == null) return false;
  if (isCiplSource(source) && CIPL_BLOCKED_FIELDS.has(id)) return false;

  const el = $("#" + id);
  if (!el) return false;

  const current = String(el.value || "").trim();
  const prio = sourcePriority(source);
  const prevPrio = importFieldOrigin[id];

  if (current !== "" && prevPrio != null && prio < prevPrio) return false;
  // Field terisi yang BELUM pernah disentuh import
  if (current !== "" && prevPrio == null && !(opts && opts.force)) return false;

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

function applyImportedBcData(parsed) {
  const f = parsed.fields || {};
  const notes = (parsed.notes || []).slice();
  const src = parsed.source;
  let filled = 0;
  const put = (id, val, opts) => {
    if (setImportField(id, val, src, opts)) filled++;
  };

  put("fNoAju", f.noAju);
  put("fDocNo", f.docNo);
  put("fDocDate", f.docDate);
  put("fParty", resolvePartyForActiveMode(f));
  put("fInvoice", f.invoice);
  put("fMasterBL", f.masterBL);
  put("fHouseBL", f.houseBL);
  put("fForwarder", f.forwarder);
  put("fVessel", f.vessel);
  put("fVoyage", f.voyage);
  put("fContainer", f.container);
  put("fOrigin", f.origin);
  put("fDestination", f.destination);
  put("fEtd", f.etd);
  put("fEta", f.eta);
  put("fActual", f.actual);
  if (f.package) {
    // Dari file, Total Package datang sbg satu teks ("2 PACKAGE")
    const before = $("#fPackage").value.trim();
    if (put("fPackage", f.package)) {
      setPackageFields(f.package);
    } else if (!before) {
      setPackageFields(f.package);
    }
  }

  ["freight", "insurance", "ndpbm", "bm", "ppn", "pph", "tarif"].forEach(
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

  if (f.transport) {
    if (setImportSelect("fTransport", f.transport, src)) filled++;
  }
  if (f.muatan) {
    if (setImportSelect("fMuatan", f.muatan, src)) filled++;
  }
  if (f.incoterm) {
    if (setImportSelect("fIncoterm", f.incoterm, src, notes, "Kode incoterm"))
      filled++;
  }

  /* ---- daftar barang ---- */
  if (parsed.items && parsed.items.length) {
    // HS Code disimpan sebagai DIGIT saja (requirement A)
    /* NAMA BARANG DISERAGAMKAN KE HURUF BESAR.

       Dipasang di sini karena SEMUA impor berkas lewat titik ini —
       CIPL Excel, CIPL PDF, PIB, PEB. Menaruhnya di tiap parser berarti
       empat salinan aturan yang sama, dan parser yang ditambahkan nanti
       akan terlewat tanpa ada yang menyadarinya.

       Nama dari invoice pemasok datang dengan huruf campur-campur.
       "Tyre Mold Full Set" dan "TYRE MOLD FULL SET" terhitung sebagai
       dua barang berbeda saat dikelompokkan di laporan — dan itu baru
       ketahuan berbulan-bulan kemudian, saat jumlahnya tidak cocok. */
    const cleaned = parsed.items.map((it) => ({
      ...it,
      namaBarang: String(it.namaBarang || "").toUpperCase(),
      hsCode: normalizeHsCodeInput(it.hsCode),
    }));
    // Barang dari sumber berprioritas LEBIH RENDAH tidak menimpa daftar barang yang sudah terisi
    const prevPrio = importFieldOrigin.__items;
    const prio = sourcePriority(src);
    const hasRealItems = draftItems.some(
      (it) => (it.namaBarang || "").trim() !== "",
    );
    if (!hasRealItems || prevPrio == null || prio >= prevPrio) {
      if (isPriceAuthority(src)) {
        draftItems = cleaned;
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
              urut: jagaNama.byOrder ? " (dicocokkan menurut urutan)" : "",
            }),
          );
        }
        const jaga = preserveUnitPrices(jagaNama.items, draftItems);
        draftItems = preserveDimensionsForCeisa(jaga.items, draftItems, src);
        if (jaga.kept) {
          notes.push(
            t("w.harga.satuan.dipertahankan", { n: jaga.kept, urut: jaga.byOrder ? " (dicocokkan menurut urutan)" : "" }),
          );
        }
      }
      importFieldOrigin.__items = prio;
    } else {
      notes.push(
        t("y.daftar.barang.tidak.diterapkan"),
      );
    }
  }

  if (parsed.modeHint && parsed.modeHint !== activeMode) {
    notes.push(
      t("y.berkas.mode.berbeda", { dokumen: parsed.modeHint === "import" ? "IMPORT" : "EXPORT", form: activeMode === "import" ? "IMPORT" : "EXPORT" }),
    );
  }

  applyTransportLabels();
  renderItemTable();

  const items = parsed.items || [];
  const facParts = [];
  const skbCount = items.reduce(
    (n, it) => n + (it.skb || []).filter((sk) => sk.jenis !== "E-COO").length,
    0,
  );
  if (skbCount) facParts.push(`${skbCount} SKB`);
  if (items.some((it) => (it.skb || []).some((sk) => sk.jenis === "E-COO")))
    facParts.push("E-COO");
  const facSuffix = facParts.length ? ` (termasuk ${facParts.join(" & ")})` : "";
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
  return { summary, notes };
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
