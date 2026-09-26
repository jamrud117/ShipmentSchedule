let docNumHistoryRows = [];

"use strict";

/* HALAMAN: PERMINTAAN NOMOR DOKUMEN */

/* Sebagian jenis dokumen punya SUB-JENIS yang seri nomornya terpisah */
/* POLA NOMOR */
const DOCNUM_SUBTYPES = {
  invoice: {
    Commercial: {
      key: "invoice",
      label: "Commercial Invoice",
      /* Spasi di kiri-kanan tanda pisah memang disengaja —
         "DDI - CRBM - VIII - 045". Nomor lama tetap tersimpan tanpa
         spasi; pencarian sudah mengabaikan tanda pisah, jadi kedua
         bentuk itu saling ketemu. */
      pattern: "DDI - CRBM - {MM} - {SEQ}",
    },
    "Non-Commercial": {
      key: "invoice_nc",
      label: "Non-Commercial Invoice",
      pattern: "DDI-{SEQ}/{YYYY}-{MM}-EXIM-LOG",
    },
  },
  /* Surat jalan punya DUA seri terpisah.

     Export menyertai barang yang dikapalkan keluar dan menempel pada
     jadwal (daftar barangnya ditarik dari situ). Lokal untuk kiriman
     antar-lokasi di dalam negeri: tidak ada CIPL, jadi daftar barangnya
     diketik sendiri di formnya.

     Dua `key` berbeda berarti dua urutan nomor yang berjalan sendiri --
     nomor Lokal tidak akan memakan jatah nomor Export. */
  do: {
    Export: {
      key: "do",
      get label() { return tt("Surat Jalan Export", "Export Delivery Note"); },
      pattern: "{SEQ}/DDI/EXIM-LOG/{MM}/{YYYY}",
    },
    Lokal: {
      key: "do_lokal",
      get label() { return tt("Surat Jalan Lokal", "Local Delivery Note"); },
      pattern: "{SEQ}/EXIM-LOG/{MM}/{YYYY}",
    },
  },
};

const DOCNUM_TYPES = {
  invoice: {
    label: "Invoice",
    pad: 3,
    // Cadangan kalau sub-jenisnya tidak terpilih — bentuknya harus sama.
    pattern: "DDI - CRBM - {MM} - {SEQ}",
  },
  do: {
    get label() { return tt("Delivery Order / Surat Jalan", "Delivery Order / Delivery Note"); },
    pad: 3,
    pattern: "{SEQ}/DDI/EXIM-LOG/{MM}/{YYYY}",
  },
  fund: {
    get label() { return tt("Permintaan Dana", "Fund Request"); },
    pad: 3,
    pattern: "{SEQ}/EXIM/DDI/{MM}/{YYYY}",
  },
  letter: {
    get label() { return tt("Surat Keluar", "Outgoing Letter"); },
    pad: 3,
    pattern: "DDI-{SEQ}/EXIM-LOG/{MM}/{YYYY}",
  },
};

const DOCNUM_DEFAULT_TAB = "invoice";
const ROMAN_MONTHS = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

// Kolom tersendiri di tabel document_numbers
const DOCNUM_COLUMN_FIELDS = new Set(["docDate", "requester", "department"]);

/* TAB YANG SEDANG DIBUKA, DIINGAT ANTAR KUNJUNGAN.

   Tanpa disimpan, memuat ulang halaman selalu melempar kembali ke tab
   Invoice -- dan orang yang sedang mengerjakan Pengajuan Dana harus
   mengklik ulang tiap kali. Disimpan di peramban, bukan di alamat,
   supaya menyalin tautan #/docnum tetap berarti "halaman nomor
   dokumen", bukan tab tertentu milik orang lain. */
const DOCNUM_TAB_KEY = "exim.docnumTab";

function bacaDocNumTabTersimpan() {
  try {
    const v = localStorage.getItem(DOCNUM_TAB_KEY);
    return v && DOCNUM_TYPES[v] ? v : DOCNUM_DEFAULT_TAB;
  } catch (e) {
    // Penyimpanan bisa dimatikan peramban; bukan alasan untuk gagal.
    return DOCNUM_DEFAULT_TAB;
  }
}

let docNumActiveTab = bacaDocNumTabTersimpan();
/* Sub-jenis yang sedang DITELUSURI di riwayat. null = ikut pilihan di
   form. Dipisah supaya riwayat Lokal bisa dibuka tanpa mengubah form
   yang sedang diisi. */
let docNumHistorySub = null;
let docNumBusy = false;

/* ---------- pembentukan nomor ---------- */

// "2026"; kalau suatu saat ada yang perlu reset BULANAN
/* Jenis yang ditampilkan di RIWAYAT. Tab riwayat menang; kalau belum
   dipilih, ikut sub-jenis yang sedang aktif di form. */
function docNumHistoryKey() {
  const subs = DOCNUM_SUBTYPES[docNumActiveTab];
  if (subs && docNumHistorySub && subs[docNumHistorySub]) {
    return subs[docNumHistorySub].key;
  }
  return resolveDocNumType(docNumActiveTab).key;
}

/* TAB RIWAYAT LEWAT ISI PAYLOAD.

   Berbeda dari sub-jenis: Jenis Pengeluaran TIDAK memisahkan seri
   nomor -- seluruh pengajuan dana memakai satu urutan. Jadi tabnya
   tidak boleh lewat DOCNUM_SUBTYPES (itu akan memecah penomorannya);
   yang disaring isi payload-nya.

   Tab "Semua" sengaja ada dan jadi bawaan. Pengajuan lama tersimpan
   dengan pilihan dropdown yang dulu ("Biaya Kepabeanan", "Freight /
   Trucking", "Operasional") -- tanpa tab ini, riwayat itu tidak akan
   cocok dengan tab mana pun dan seolah lenyap. */
const DOCNUM_HISTORY_FILTERS = {
  fund: {
    field: "expenseType",
    options: ["Billing", "Freight", "Storage", "Lainnya"],
  },
};

/* Saringan tambahan berdasarkan isi payload, untuk jenis yang tabnya
   bukan sub-jenis (Pengajuan Dana). Dikembalikan sebagai argumen
   .filter() supaya bisa disebar; kalau tidak ada saringan, memakai
   pembanding yang selalu benar -- lebih aman daripada mencabangkan
   rantai kueri di dua tempat. */
/* ------------------------------------------------------------------
   PENCARIAN RIWAYAT

   Dikirim ke DATABASE, bukan menyaring baris di layar: riwayatnya
   berhalaman di server (5-50 baris per halaman), jadi saringan di
   layar hanya mencari di halaman yang kebetulan sedang tampil --
   nomor yang dicari di halaman 3 tidak akan pernah ketemu. Jumlah &
   halamannya ikut mengikuti hasil pencarian.

   Kolom yang dicari mencakup isian semua jenis dokumen sekaligus
   (penerima invoice, surat jalan, pengajuan dana, surat keluar); isian
   yang tidak dimiliki suatu jenis bernilai kosong dan tidak pernah
   cocok. Nilai pengajuan tidak ikut -- ia dihitung di aplikasi, tidak
   tersimpan sebagai teks yang bisa dicari.
------------------------------------------------------------------ */
let docNumCari = "";

/* SARINGAN STATUS BAYAR (Pengajuan Dana): "" semua, "lunas", "belum".
   Dikirim ke database seperti kotak cari -- riwayatnya berhalaman di
   server, dan menyaring baris di layar hanya menyaring halaman yang
   sedang tampil. Lunas = payload.paidAt terisi; membatalkan lunas
   MENGHAPUS kuncinya (dnSetelBayar), jadi "belum" = kosong. */
let docNumSaringBayar = "";
function dnTerapkanSaringBayar(kueri) {
  if (docNumActiveTab !== "fund") return kueri;
  if (docNumSaringBayar === "lunas") return kueri.not("payload->>paidAt", "is", null);
  if (docNumSaringBayar === "belum") return kueri.is("payload->>paidAt", null);
  return kueri;
}
/* Pilihannya hanya tampil di Pengajuan Dana, dan TIDAK di tab Summary --
   Summary punya saringan Status Bayar sendiri; dua pilihan untuk hal
   yang sama di satu layar hanya menunggu saatnya saling bertentangan. */
function dnTampilkanSaringBayar() {
  const wadah = document.querySelector(".dn-saring-bayar");
  if (!wadah) return;
  const summary = typeof FSUM_TAB !== "undefined" && docNumHistorySub === FSUM_TAB;
  wadah.classList.toggle("d-none", docNumActiveTab !== "fund" || summary);
}
const DN_KOLOM_CARI = [
  "doc_number", "requester", "department",
  "payload->>payee", "payload->>customer", "payload->>receiver",
  "payload->>recipient", "payload->>subject", "payload->>notes",
  "payload->>invoiceNo", "payload->>billingNo", "payload->>poNo",
];
/* Filter `or` PostgREST untuk kata kunci, atau null. Tanda yang punya
   arti khusus di sintaks filter -- koma, kurung, kutip, garis miring
   terbalik -- dan wildcard (%, *) dibuang: kata kunci "PT (Persero)"
   tidak boleh memecah filternya jadi potongan yang tidak valid.
   Nilainya dikutip ganda supaya titik & spasi aman. */
function dnFilterCari(q) {
  const bersih = String(q || "").replace(/[,()"\\%*]/g, " ").replace(/\s+/g, " ").trim();
  if (!bersih) return null;
  return DN_KOLOM_CARI.map((k) => `${k}.ilike."%${bersih}%"`).join(",");
}

function docNumPayloadFilter() {
  const saring = DOCNUM_HISTORY_FILTERS[docNumActiveTab];
  if (!saring || !docNumHistorySub) return ["id", "not.is", null];
  return [`payload->>${saring.field}`, "eq", docNumHistorySub];
}

function renderDocNumSubTabs() {
  const box = document.getElementById("docNumSubTabs");
  if (!box) return;

  const subs = DOCNUM_SUBTYPES[docNumActiveTab];
  const saring = DOCNUM_HISTORY_FILTERS[docNumActiveTab];
  if (!subs && !saring) {
    box.classList.add("d-none");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("d-none");

  if (subs) {
    const aktif = docNumHistoryKey();
    box.innerHTML = Object.keys(subs)
      .map(
        (label) =>
          `<button type="button" class="docnum-subtab${subs[label].key === aktif ? " active" : ""}" data-dn-subtab="${escapeAttr(label)}">${escapeHtml(label)}</button>`,
      )
      .join("");
    return;
  }

  const semua = t("f.semua");
  box.innerHTML = [null, ...saring.options]
    .map((label) => {
      const nilai = label === null ? "" : label;
      // Nilai tab tetap nilai tersimpan; hanya teksnya yang diterjemahkan.
      const teks = label === null ? semua : label === "Lainnya" ? tt("Lainnya", "Other") : label;
      const aktif = (docNumHistorySub || "") === nilai;
      return `<button type="button" class="docnum-subtab${aktif ? " active" : ""}" data-dn-subtab="${escapeAttr(nilai)}">${escapeHtml(teks)}</button>`;
    })
    /* Tab Summary: seluruh pengajuan dana dalam satu tabel + pivot.
       Nilainya penanda khusus, bukan jenis pengeluaran -- ia tidak
       menyaring riwayat, melainkan mengganti isinya (lihat
       renderDocNumHistory). */
    .concat(
      docNumActiveTab === "fund" && typeof FSUM_TAB !== "undefined"
        ? [`<button type="button" class="docnum-subtab docnum-subtab--summary${docNumHistorySub === FSUM_TAB ? " active" : ""}" data-dn-subtab="${FSUM_TAB}"><i class="bi bi-table"></i> Summary</button>`]
        : [],
    )
    .join("");
  dnTabAktifTerlihat(box);
}

/* Di ponsel baris tab ini digeser mendatar (lihat .docnum-subtabs di
   docnum.css). Setiap kali digambar ulang -- ganti bahasa, simpan
   nomor -- posisi gesernya kembali ke awal, dan tab aktif di ujung
   kanan (Summary) bisa tersembunyi di luar layar padahal sedang
   dipakai. Digeser LEWAT scrollLeft baris ini sendiri, bukan
   scrollIntoView: yang terakhir juga menggulir halaman kalau barisnya
   sedang di luar layar. */
function dnTabAktifTerlihat(baris) {
  const aktif = baris.querySelector(".docnum-subtab.active");
  if (!aktif || baris.scrollWidth <= baris.clientWidth) return;
  baris.scrollLeft = aktif.offsetLeft - (baris.clientWidth - aktif.offsetWidth) / 2;
}

function resolveDocNumType(tabKey) {
  const base = DOCNUM_TYPES[tabKey] || {};
  const subs = DOCNUM_SUBTYPES[tabKey];
  if (subs) {
    const panel = docNumPanelEl(tabKey);
    const el = panel && panel.querySelector("[data-dn-subtype]");
    const hit = el && subs[el.value];
    if (hit) {
      // `pattern` WAJIB ikut diteruskan
      return {
        ...base,
        key: hit.key,
        label: hit.label || base.label,
        pattern: hit.pattern || base.pattern,
      };
    }
  }
  return { ...base, key: tabKey };
}

/* SERI PENOMORAN */
const docNumSeries = {};

async function muatSeri(docType) {
  const { data, error } = await supabaseClient.rpc("current_document_series", {
    p_doc_type: docType,
  });
  if (error) throw error;
  const seri = String(data == null ? "1" : data);
  docNumSeries[docType] = seri;
  return seri;
}

/* Pola dengan {MM}, {YYYY} & {YYYYMMDD} sudah terisi.

   POLA BISA BERBEDA PER PEMBELI. Sebagian pembeli menuntut bentuk
   nomornya sendiri di invoice -- Kumho memakai
   "DDI - CRBM - IX - 052 - 20260924". Urutan nomornya TETAP satu seri
   dengan invoice lain (052 melanjutkan 051); yang berbeda cuma cara
   menuliskannya, jadi polanya diambil dari profil, bukan dari
   sub-jenis baru yang akan memecah penomorannya. */
function docNumTemplate(typeKey, isoDate) {
  const t = resolveDocNumType(typeKey);
  const d = parseLocalDate(isoDate) || new Date();

  let pola = t.pattern || "{SEQ}";
  if (typeKey === "invoice" && typeof ciplProfil === "function") {
    const isi = readDocNumForm(typeKey);
    const prof = ciplProfil(isi.customer);
    if (prof && prof.invoicePattern) pola = prof.invoicePattern;
  }

  const yyyymmdd =
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");

  return String(pola)
    .replace(/\{YYYYMMDD\}/g, yyyymmdd)
    .replace(/\{MM\}/g, ROMAN_MONTHS[d.getMonth()])
    .replace(/\{YYYY\}/g, String(d.getFullYear()));
}

// Dipakai untuk PRATINJAU di layar
function docNumFormat(template, seq, pad) {
  return String(template).replace(
    /\{SEQ\}/g,
    String(seq).padStart(pad || 3, "0"),
  );
}

/* ---------- baca & validasi isian panel ---------- */

function docNumPanelEl(typeKey) {
  return document.querySelector(`[data-docnum-panel="${typeKey}"]`);
}

function readDocNumForm(typeKey) {
  const panel = docNumPanelEl(typeKey);
  const out = {};
  if (!panel) return out;
  panel.querySelectorAll("[data-dn]").forEach((el) => {
    /* Isian yang sedang disembunyikan (lihat data-dn-when) dilewati.
       Tanpa ini, nomor billing & nomor invoice akan tersimpan
       dua-duanya padahal cuma satu yang dimaksud, dan surat cetaknya
       memuat keduanya. */
    if (el.disabled) return;
    out[el.dataset.dn] = String(el.value || "").trim();
  });
  /* Rincian biaya bukan isian ber-data-dn (ia tabel tersendiri), jadi
     disisipkan di sini supaya ikut tersimpan lewat jalur yang sama
     dengan isian lain -- tidak ada cabang penyimpanan kedua. */
  /* Surat jalan Lokal: daftar barangnya diketik sendiri, bukan ditarik
     dari jadwal, jadi ikut disisipkan lewat jalur penyimpanan yang sama. */
  /* Nomor PO kedua dan seterusnya. Yang pertama sudah ikut lewat
     data-dn="poNo" di atas -- pemisahan ini yang membuat pengajuan
     lama tetap terbaca tanpa migrasi. */
  if (typeof poNoKotakTambahan === "function") {
    /* Nomor & tanggal disaring BERPASANGAN, bukan masing-masing.

       Menyaring kosong secara terpisah akan menggeser pasangannya:
       baris kedua yang nomornya kosong membuat tanggal baris ketiga
       naik jadi tanggal baris kedua. Yang dibuang adalah baris yang
       nomornya kosong -- tanggal tanpa nomor tidak menerangkan apa
       pun. */
    const tgl = typeof poTglKotakTambahan === "function" ? poTglKotakTambahan() : [];
    const pasangan = poNoKotakTambahan()
      .map((el, i) => ({
        no: String(el.value || "").trim(),
        tanggal: String((tgl[i] && tgl[i].value) || "").trim(),
      }))
      .filter((x) => x.no);
    if (pasangan.length) {
      out.poNoExtra = pasangan.map((x) => x.no);
      out.poDateExtra = pasangan.map((x) => x.tanggal);
    }
  }
  if (typeof doLines !== "undefined" && typeKey === "do" && out.doKind === "Lokal") {
    const bersih = doLinesBersih(doLines);
    if (bersih.length) out.items = bersih;
  }
  if (typeof fundLines !== "undefined" && typeKey === "fund") {
    const pakaiRinci = out.expenseType && out.expenseType !== "Billing";
    const bersih = pakaiRinci ? fundLinesBersih(fundLines) : [];
    if (bersih.length) out.lines = bersih;
  }
  return out;
}

// Mengembalikan daftar pesan kesalahan; kosong berarti lolos
function validateDocNumForm(typeKey) {
  const panel = docNumPanelEl(typeKey);
  const errors = [];
  if (!panel) return [t("s.panel.form.tidak.ditemukan")];

  panel.querySelectorAll(".is-invalid").forEach((el) =>
    el.classList.remove("is-invalid"),
  );
  /* Rumus di Rincian Biaya yang belum valid ("=1000+") tidak boleh ikut
     tersimpan sebagai teks -- nilainya dihitung 0, jadi total pengajuan
     diam-diam kurang. */
  if (typeKey === "fund" && typeof fundLinesRumusGagal === "function" && fundLinesRumusGagal(fundLines)) {
    errors.push(tt(
      "Ada rumus di Rincian Biaya yang belum valid (kotak bertanda merah).",
      "A formula in the Cost Breakdown is not valid yet (red box).",
    ));
  }

  panel.querySelectorAll("[data-dn]").forEach((el) => {
    // Isian tersembunyi tidak boleh dituntut wajib diisi.
    if (el.disabled) return;
    const nilai = String(el.value || "").trim();
    const label = (
      el.closest(".col-md-2, .col-md-3, .col-md-4, .col-md-6, .col-12")
        ?.querySelector(".form-label")
        ?.textContent || el.dataset.dn
    )
      .replace("*", "")
      .trim();

    if (el.hasAttribute("data-dn-required") && !nilai) {
      errors.push(tt(`${label} wajib diisi.`, `${label} is required.`));
      el.classList.add("is-invalid");
      return;
    }
    if (el.hasAttribute("data-dn-number") && nilai) {
      /* parseInputNumber: kotak ini milik aplikasi, bentuknya kita
         sendiri yang tulis (koma ribuan, titik desimal). excelNum()
         menebak, dan tebakannya untuk "1.050" meleset seribu kali. */
      const angka = parseInputNumber(nilai);
      if (!isFinite(angka) || angka < 0) {
        errors.push(t("x.harus.berupa.angka", { label }));
        el.classList.add("is-invalid");
      }
    }
  });

  // Tanggal dokumen tidak boleh terlalu jauh ke depan: nomor terbit berurutan
  const isoTanggal = readDocNumForm(typeKey).docDate;
  const tgl = parseLocalDate(isoTanggal);
  if (tgl) {
    const batas = new Date();
    batas.setDate(batas.getDate() + 90);
    if (tgl > batas) {
      errors.push(
        t("v.tanggal.dokumen.lebih.dari.90.hari.ke.depan.pe"),
      );
      panel.querySelector('[data-dn="docDate"]')?.classList.add("is-invalid");
    }
  }
  return errors;
}

/* ---------- pratinjau nomor berikutnya ---------- */

// Menampilkan nomor yang AKAN terbit
/* NOMOR URUT PERMINTAAN PRATINJAU.

   Berganti sub-jenis dua kali beruntun (Export -> Lokal -> Export)
   melepas dua permintaan yang tidak saling menunggu. Yang menang
   adalah jawaban yang datang TERAKHIR, bukan yang paling baru diminta
   -- dan urutan datangnya tidak dijamin. Kalau yang menang jawaban
   lama, pratinjau DAN counterCtx menunjuk deret yang sudah tidak
   dipilih lagi: tombol Simpan di panel "Atur Nomor Urut" lalu menyetel
   nomor milik deret sebelah tanpa ada yang terlihat salah.

   Pola yang sama dengan `muatKe` di data/api.js. */
let dnPratinjauKe = 0;

/* Parameter jenis dokumen sengaja TIDAK bernama `t`: nama itu menutupi
   fungsi terjemahan global, dan memanggil t("...") di dalam sini akan
   melempar TypeError yang -- karena fungsinya asinkron -- cuma muncul
   di konsol. Persis jebakan yang sudah pernah kena di
   renderCounterPanel(). */
async function refreshDocNumPreview(typeKey) {
  const el = document.querySelector(`[data-dn-preview="${typeKey}"]`);
  if (!el) return;
  const nomorMinta = ++dnPratinjauKe;
  const jenis = resolveDocNumType(typeKey);
  const isoDate = readDocNumForm(typeKey).docDate;
  const template = docNumTemplate(typeKey, isoDate);

  el.textContent = docNumFormat(template, 1, jenis.pad); // tampilan sementara
  try {
    const periodKey = await muatSeri(jenis.key);
    const { data, error } = await supabaseClient
      .from("document_number_counters")
      .select("last_seq")
      .eq("doc_type", jenis.key)
      .eq("period_key", periodKey)
      .maybeSingle();
    if (error) throw error;
    if (nomorMinta !== dnPratinjauKe) return; // sub-jenis sudah berganti lagi
    const berikut = (data ? data.last_seq : 0) + 1;
    el.textContent = docNumFormat(template, berikut, jenis.pad);
    renderCounterPanel(jenis, periodKey, data ? data.last_seq : 0);
    /* Kotak No. SI dibiarkan KOSONG, bukan diisi otomatis: nomor SI
       bawaannya memang nomor urut CIPL, dan mengisikannya ke kotak
       akan menyimpannya sebagai isian manual — nomor itu lalu ikut
       terbawa ke pengajuan berikutnya. Yang ditulis cuma ancar-ancar
       di placeholder-nya. */
    if (typeKey === "invoice") {
      const elSi = docNumPanelEl("invoice")?.querySelector('[data-dn="siNo"]');
      if (elSi) elSi.placeholder = t("ph.no.si.otomatis", { n: berikut });
    }
  } catch (err) {
    console.error(err);
    if (nomorMinta !== dnPratinjauKe) return;
    el.textContent = docNumFormat(template, 1, jenis.pad);
    /* Panel "Atur Nomor Urut" tetap ditunjuk ke seri yang BENAR walau
       angkanya gagal dibaca. Tanpa ini counterCtx masih menyimpan seri
       yang tadi dibuka, dan tombol Simpan di panel itu akan menyetel
       nomor milik jenis dokumen yang salah. */
    renderCounterPanel(jenis, docNumSeries[jenis.key] || "-", 0);
  }
}

/* ATUR / RESET NOMOR URUT */
let counterCtx = { typeKey: null, periodKey: null, lastSeq: 0, pad: 3 };

/* Parameternya DINAMAI ULANG jadi `jenis`.

   Dulu bernama `t`, yang MENUTUPI fungsi terjemahan global bernama
   sama -- memanggil t("...") di dalam sini melempar TypeError, dan
   karena pemanggilnya asinkron, kesalahannya cuma muncul di konsol
   tanpa ada yang gagal terang-terangan. */
function renderCounterPanel(jenis, periodKey, lastSeq) {
  counterCtx = { typeKey: jenis.key, periodKey, lastSeq: lastSeq || 0, pad: jenis.pad };
  const info = $("#counterInfo");
  const input = $("#counterNext");
  if (!info || !input) return;
  /* NAMA SERINYA DISEBUT, bukan cuma periodenya.

     Surat Jalan Export & Lokal -- juga Commercial & Non-Commercial
     Invoice -- berbagi satu panel ini tapi BERBEDA deret nomor. Tanpa
     namanya tertulis, tidak ada cara membedakan sedang menyetel yang
     mana, dan angka yang diketik gampang mendarat di deret sebelah. */
  const terakhir = lastSeq ? String(lastSeq).padStart(jenis.pad, "0") : t("w.belum.ada.nomor");
  info.textContent = tt(
    `${jenis.label} · seri ${periodKey} · nomor terakhir terbit: ${terakhir}`,
    `${jenis.label} · series ${periodKey} · last issued number: ${terakhir}`,
  );
  input.value = String((lastSeq || 0) + 1);
  input.placeholder = String(1).padStart(jenis.pad, "0");
}

// Nomor urut TERTINGGI yang sudah pernah terbit di periode ini
async function maxIssuedSeq(docType, periodKey) {
  const { data, error } = await supabaseClient
    .from("document_numbers")
    .select("seq")
    .eq("doc_type", docType)
    .eq("period_key", periodKey)
    .order("seq", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0].seq : 0;
}

async function simpanCounter(nilaiBerikutnya) {
  const { typeKey, periodKey, pad } = counterCtx;
  if (!typeKey) return;
  const berikut = parseInt(nilaiBerikutnya, 10);
  if (!isFinite(berikut) || berikut < 1) {
    showToast(t("m.nomor.berikutnya.harus.angka.minimal.1"), "danger");
    return;
  }
  try {
    const terpakai = await maxIssuedSeq(typeKey, periodKey);
    if (berikut <= terpakai) {
      showToast(
        t("w.nomor.sudah.pernah.terbit", { n: String(berikut).padStart(pad, "0"), p: periodKey, m: String(terpakai + 1).padStart(pad, "0") }),
        "danger",
      );
      return;
    }
    const { error } = await supabaseClient.rpc("set_document_counter", {
      p_doc_type: typeKey,
      p_period_key: periodKey,
      p_last_seq: berikut - 1,
    });
    if (error) throw error;
    showToast(
      tt(`Nomor berikutnya disetel ke ${String(berikut).padStart(pad, "0")}.`, `Next number set to ${String(berikut).padStart(pad, "0")}.`),
      "success",
    );
    refreshDocNumPreview(docNumActiveTab);
  } catch (err) {
    console.error(err);
    showToast(t("x.gagal.menyetel.nomor", { err: err.message || t("s.kesalahan.tidak.diketahui") }), "danger");
  }
}

$("#btnCounterSave")?.addEventListener("click", () =>
  !requireEdit() ? null :
  simpanCounter($("#counterNext").value),
);
/* Reset manual: counter tidak dinolkan agar nomor tidak terbit ganda */
$("#btnCounterReset")?.addEventListener("click", () => {
  if (!requireEdit()) return;
  const { typeKey, pad } = counterCtx;
  if (!typeKey) return;
  const jenis = resolveDocNumType(docNumActiveTab);
  const satu = String(1).padStart(pad, "0");
  showConfirm(
    t("w.mulai.ulang.penomoran", { jenis: jenis.label, satu }),
    async () => {
      try {
        const { data, error } = await supabaseClient.rpc(
          "reset_document_series",
          { p_doc_type: typeKey },
        );
        if (error) throw error;
        docNumSeries[typeKey] = String(data == null ? "1" : data);
        showToast(
          tt(`Penomoran ${jenis.label} dimulai ulang (seri ${docNumSeries[typeKey]}).`, `${jenis.label} numbering restarted (series ${docNumSeries[typeKey]}).`),
          "success",
        );
        docNumPage = 1;
        refreshDocNumPreview(docNumActiveTab);
        renderDocNumHistory();
      } catch (err) {
        console.error(err);
        showToast(
          t("x.gagal.memulai.ulang", { err: err.message || t("s.kesalahan.tidak.diketahui") }),
          "danger",
        );
      }
    },
  );
});

/* ==================================================================
   MEMPERBAIKI ISIAN NOMOR YANG SUDAH TERBIT

   Yang boleh diubah HANYA isian permintaannya — tanggal, pemohon,
   departemen, dan seluruh payload. NOMOR dan urutannya tidak ikut,
   dan itu bukan kelalaian: nomor yang sudah terbit sudah beredar di
   invoice, surat jalan, dan berkas pihak lain. Mengubahnya di sini
   menciptakan dua kebenaran yang tidak mungkin dipertemukan lagi.

   Salah nomor diperbaiki dengan menghapus lalu menerbitkan ulang —
   jalur itu sudah ada, dan ia meninggalkan jejak.
================================================================== */
let dnEditingId = null;

/* Mengubah apa pun di Nomor Dokumen -- mengajukan, memperbaiki isian,
   menandai status bayar -- khusus EXIM. Marketing hanya membaca. */
function bolehUbahDocNum() {
  return typeof canEdit !== "function" || canEdit();
}

/* ------------------------------------------------------------------
   STATUS PEMBAYARAN PENGAJUAN DANA

   Disimpan di payload (paidAt = tanggal bayar, paidBy = yang menandai),
   jadi tidak butuh kolom database baru. Bukan isian form: ditandai
   langsung dari daftar riwayat, dan jalur Ubah Isian membawanya
   (lihat simpanUbahDocNum) supaya tidak terhapus.
------------------------------------------------------------------ */
const DN_FIELD_BAYAR = ["paidAt", "paidBy"];

/* NILAI INVOICE di riwayat Invoice Number: angka yang SAMA dengan baris
   Total di Commercial Invoice cetaknya -- dihitung dengan fungsi yang
   sama (barang jadwal yang ditautkan, jumlah x harga; mata uang dari
   isian invoice, bawaan USD), bukan disalin ke tempat lain yang bisa
   berbeda. null kalau invoice belum ditautkan ke jadwal atau jadwalnya
   tidak ada di data yang termuat. */
function dnNilaiInvoice(r) {
  const p = (r && r.payload) || {};
  if (!p.shipmentId || typeof ciplCariShipment !== "function") return null;
  const jadwal = ciplCariShipment(p.shipmentId);
  if (!jadwal) return null;
  const total = ciplBarisBarang(jadwal).reduce((s, b) => s + b.amount, 0);
  return { mata: p.currency || "USD", total };
}
const dnTeksNilaiInvoice = (r) => {
  const v = dnNilaiInvoice(r);
  return v ? `${v.mata} ${ciplAngka(v.total, 2)}` : "\u2014";
};

function dnSudahBayar(r) {
  return !!(r && r.payload && r.payload.paidAt);
}

/* Lencana status. Yang boleh mengubah (EXIM) mendapat tombol; viewer
   hanya melihat lencananya -- status bayar bukan sesuatu yang boleh
   diubah sembarang pembaca. */
function dnTombolBayar(r) {
  const lunas = dnSudahBayar(r);
  const p = r.payload || {};
  const teks = lunas
    ? `<i class="bi bi-check-circle-fill"></i> ${escapeHtml(tt("Lunas", "Paid"))}<span class="dn-bayar-tgl">${escapeHtml(fmtDate(p.paidAt))}</span>`
    : `<i class="bi bi-hourglass-split"></i> ${escapeHtml(tt("Belum Lunas", "Unpaid"))}`;
  const kelas = `dn-bayar ${lunas ? "dn-bayar--lunas" : "dn-bayar--belum"}`;
  if (!bolehUbahDocNum()) return `<span class="${kelas}">${teks}</span>`;
  const judul = lunas
    ? tt(`Ditandai lunas${p.paidBy ? " oleh " + p.paidBy : ""}. Klik untuk membatalkan.`,
         `Marked paid${p.paidBy ? " by " + p.paidBy : ""}. Click to undo.`)
    : tt("Klik untuk menandai sudah dibayar", "Click to mark as paid");
  return `<button type="button" class="${kelas}" data-bayar-num="${r.id}" title="${escapeAttr(judul)}">${teks}</button>`;
}

/* Menulis status bayar: payload TERBARU dibaca dulu dari database, baru
   digabung. Menulis dari salinan di layar akan menimpa perubahan yang
   dibuat orang lain sejak daftar ini dimuat. */
async function dnSetelBayar(id, tanggal) {
  const { data, error } = await supabaseClient
    .from("document_numbers")
    .select("payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const payload = Object.assign({}, (data && data.payload) || {});
  if (tanggal) {
    payload.paidAt = tanggal;
    const pr = (typeof authState !== "undefined" && authState.profile) || {};
    payload.paidBy = pr.full_name || pr.username || "";
  } else {
    DN_FIELD_BAYAR.forEach((k) => delete payload[k]);
  }
  const { error: galat } = await supabaseClient
    .from("document_numbers")
    .update({ payload })
    .eq("id", id);
  if (galat) throw galat;
  const baris = docNumHistoryRows.find((r) => r.id === id);
  if (baris) baris.payload = payload;
}

function dnKlikBayar(id) {
  const r = docNumHistoryRows.find((x) => x.id === id);
  if (!r || !bolehUbahDocNum()) return;
  const simpan = async (tanggal, pesan) => {
    try {
      await dnSetelBayar(id, tanggal);
      await renderDocNumHistory();
      showToast(pesan, "success");
    } catch (err) {
      console.error(err);
      showToast(
        t("x.gagal.menyimpan.perubahan.err", { err: err.message || t("s.kesalahan.tidak.diketahui") }),
        "danger",
      );
    }
  };
  if (dnSudahBayar(r)) {
    /* Membatalkan butuh konfirmasi: satu klik tak sengaja di daftar
       tidak boleh menghapus catatan pembayaran. */
    showConfirm(
      tt(`Batalkan status lunas ${r.doc_number}?`, `Undo the paid status of ${r.doc_number}?`),
      () => simpan(null, tt(`${r.doc_number} ditandai belum lunas.`, `${r.doc_number} marked as unpaid.`)),
      { confirmText: tt("Ya, batalkan", "Yes, undo"), tone: "primary", icon: "bi-arrow-counterclockwise" },
    );
    return;
  }
  /* Tanggal bayar ditanyakan (bawaan hari ini): pembayaran kerap
     ditandai sehari-dua sesudah uangnya keluar, dan tanggal yang
     sebenarnya yang dipakai laporan. */
  showPrompt({
    title: tt("Tandai Sudah Dibayar", "Mark as Paid"),
    desc: `${r.doc_number}${r.payload && r.payload.payee ? " · " + r.payload.payee : ""}`,
    fields: [{ key: "tgl", label: tt("Tanggal bayar", "Payment date"), type: "date", value: todayISO() }],
    okText: tt("Tandai Lunas", "Mark Paid"),
    onSubmit: (v) => {
      if (!v.tgl) return tt("Tanggal bayar wajib diisi.", "Payment date is required.");
      simpan(v.tgl, tt(`${r.doc_number} ditandai lunas.`, `${r.doc_number} marked as paid.`));
    },
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("[data-bayar-num]");
  if (btn) dnKlikBayar(btn.dataset.bayarNum);
});

/* Kunci TAB dari jenis dokumen yang tersimpan.

   Sebagian jenis punya sub-jenis dengan seri nomor terpisah, dan yang
   masuk ke kolom doc_type adalah kunci SUB-JENIS-nya — "invoice_nc"
   untuk Non-Commercial Invoice. Panelnya cuma satu: "invoice".

   Tanpa pemetaan ini, docNumPanelEl("invoice_nc") mengembalikan null
   dan fungsi yang memanggilnya berhenti tanpa suara — tombolnya
   ditekan, tidak terjadi apa-apa, tidak ada pesan galat. */
function docNumTabKeyFor(docType) {
  if (DOCNUM_TYPES[docType]) return docType;
  const tab = Object.keys(DOCNUM_SUBTYPES).find((k) =>
    Object.values(DOCNUM_SUBTYPES[k]).some((s) => s.key === docType),
  );
  return tab || DOCNUM_DEFAULT_TAB;
}

/* Label sub-jenis dari kunci tersimpan — dipakai mengembalikan pilihan
   dropdown-nya saat isian dibuka untuk diperbaiki. */
function docNumSubtypeLabelFor(docType) {
  let hasil = "";
  Object.keys(DOCNUM_SUBTYPES).forEach((tab) => {
    Object.keys(DOCNUM_SUBTYPES[tab]).forEach((label) => {
      if (DOCNUM_SUBTYPES[tab][label].key === docType) hasil = label;
    });
  });
  return hasil;
}

function mulaiUbahDocNum(id) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  if (!bolehUbahDocNum()) {
    showToast(t("m.akun.viewer.tidak.bisa.mengubah.data"), "danger");
    return;
  }

  /* Pindah ke panel jenis dokumennya dulu, baru isian diisi.

     Kalau doc_type tidak terbawa, yang dipakai TAB YANG SEDANG DIBUKA —
     bukan tab bawaan. Daftar riwayat selalu disaring per jenis, jadi
     baris yang sedang dilihat pasti milik tab itu. Jatuh ke tab bawaan
     berarti membuka form jenis lain tanpa ada yang bersuara. */
  const tabKey = docNumTabKeyFor(r.doc_type || docNumActiveTab);
  if (tabKey !== docNumActiveTab) showDocNumTab(tabKey);

  const panel = docNumPanelEl(tabKey);
  if (!panel) {
    showToast(t("m.panel.jenis.dokumen.ini.tidak.ditemukan"), "danger");
    return;
  }
  resetDocNumForm(tabKey);
  dnIsianOtomatis = {};

  /* Sub-jenis dikembalikan ke pilihan semula. resetDocNumForm sengaja
     tidak menyentuhnya, tapi ia juga tidak tahu nomor mana yang sedang
     dibuka — kalau dibiarkan, Non-Commercial Invoice terbuka dengan
     dropdown menunjuk Commercial. */
  const subLabel = docNumSubtypeLabelFor(r.doc_type);
  const elSub = panel.querySelector("[data-dn-subtype]");
  if (elSub && subLabel) elSub.value = subLabel;

  const isi = (nama, nilai) => {
    const el = panel.querySelector(`[data-dn="${nama}"]`);
    if (!el || nilai == null) return;
    /* NILAI LAMA YANG TIDAK ADA DI DAFTAR PILIHAN TETAP DIPERTAHANKAN.

       Isian Pemohon dulu kotak ketik bebas, jadi pengajuan lama bisa
       menyimpan nama mana pun -- termasuk ejaan yang tidak persis sama
       dengan pilihan sekarang. Menyetel .value ke nilai yang tidak ada
       pilihannya membuat <select> diam-diam jatuh ke kosong: membuka
       nomor lama untuk memperbaiki SATU isian lalu menyimpannya akan
       menghapus nama pemohonnya tanpa ada yang terlihat berubah. */
    if (el.tagName === "SELECT" && !dnPunyaPilihan(el, nilai)) {
      const opsi = document.createElement("option");
      opsi.value = nilai;
      opsi.textContent = nilai;
      /* Ditandai supaya bisa dibuang lagi saat form dikosongkan --
         tanpa itu daftar pilihannya memanjang terus setiap satu nomor
         lama dibuka, dan nama yang sudah tidak dipakai ikut ditawarkan
         untuk pengajuan baru. */
      opsi.dataset.dnLawas = "1";
      el.appendChild(opsi);
    }
    el.value = nilai;
  };
  isi("docDate", r.doc_date);
  isi("requester", r.requester);
  isi("department", r.department);
  Object.keys(r.payload || {}).forEach((k) => isi(k, r.payload[k]));
  /* Kotak tersembunyi sudah terisi id-nya oleh isi() di atas, tapi
     kotak yang DITERLIHAT pengguna masih kosong — tanpa baris ini,
     membuka nomor lama untuk diubah menampilkan tautan jadwal sebagai
     kosong padahal datanya ada. */
  DN_PEMILIH_JADWAL.forEach((pas) => dnSegarkanLabelPemilih(pas));

  /* Rincian biaya BUKAN isian ber-data-dn (ia tabel tersendiri), jadi
     isi() di atas melewatinya diam-diam -- membuka nomor lama untuk
     diubah menampilkan tabel kosong padahal datanya tersimpan. */
  if (typeof setPoNoExtra === "function") {
    setPoNoExtra(
      (r.payload && r.payload.poNoExtra) || [],
      (r.payload && r.payload.poDateExtra) || [],
    );
  }
  if (typeof setDoLines === "function" && String(r.doc_type || "").startsWith("do")) {
    setDoLines((r.payload && r.payload.items) || []);
  }
  if (typeof setFundLines === "function" && r.doc_type === "fund") {
    setFundLines((r.payload && r.payload.lines) || []);
  }

  /* Dijalankan SESUDAH semuanya terisi: isian mana yang tampil
     bergantung pada Jenis Pengeluaran yang baru saja dimuat. Dipanggil
     lebih awal, ia membaca dropdown yang masih kosong dan menyembunyikan
     isian yang justru berisi data. */
  syncDocNumConditional(panel);

  dnEditingId = r.id;
  syncModeUbahDocNum(r.doc_number);

  /* DERET NOMOR IKUT BERPINDAH KE SUB-JENIS YANG BARU DIBUKA.

     Sub-jenis di atas disetel lewat kode (elSub.value = ...), dan
     menyetel .value TIDAK memicu event `change` -- jadi pendengar yang
     biasanya menyegarkan pratinjau tidak pernah berjalan. Akibatnya
     membuka satu nomor Surat Jalan LOKAL meninggalkan pratinjau dan
     panel "Atur Nomor Urut" menunjuk deret EXPORT: nomor berikutnya
     yang tampil milik deret sebelah, dan menekan Simpan di panel itu
     menyetel deret sebelah pula.

     Riwayatnya ikut dilepas dari sub-tab yang dipilih sebelumnya
     supaya tab, form, dan panel nomor urut menunjuk deret yang sama. */
  docNumHistorySub = null;
  refreshDocNumPreview(tabKey);

  /* Menggulir ke form itu kenyamanan, bukan bagian dari operasinya.
     Dibiarkan tanpa penjaga, satu peramban yang tidak mendukungnya
     akan melempar SESUDAH isian terisi — form tampak siap diedit,
     padahal mode ubahnya tidak pernah selesai dipasang. */
  if (typeof panel.scrollIntoView === "function") {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Form berada jauh di atas tabel riwayat. Kalau gulirannya tidak
     bergerak — halaman pendek, gulir dihentikan pengguna, atau
     kontainer yang bergulir bukan jendela — tidak ada satu pun tanda
     bahwa tombolnya bekerja. Toast terlihat di mana pun posisinya. */
  showToast(
    t("x.isian.nomor.dibuka", { nomor: r.doc_number }),
    "dark",
  );
}

function batalUbahDocNum() {
  const jenis = dnEditingId ? docNumActiveTab : null;
  dnEditingId = null;
  syncModeUbahDocNum(null);
  if (jenis) resetDocNumForm(jenis, { keepIdentity: true });
}

/* Tombol Ajukan berubah jadi Simpan Perubahan, dan sebuah spanduk
   menyebutkan nomor mana yang sedang diperbaiki — tanpa itu, form yang
   sudah terisi mudah disangka pengajuan baru dan ditekan Ajukan. */
function syncModeUbahDocNum(nomor) {
  const btn = $("#btnDocNumSubmit");
  const banner = $("#dnEditBanner");
  if (btn) {
    btn.innerHTML = nomor
      ? '<i class="bi bi-check2"></i> ' + tt("Simpan Perubahan", "Save Changes")
      : '<i class="bi bi-hash"></i> ' + tt("Ajukan Nomor", "Request Number");
  }
  if (banner) {
    banner.classList.toggle("d-none", !nomor);
    const el = $("#dnEditBannerNum");
    if (el) el.textContent = nomor || "";
  }
}

async function simpanUbahDocNum() {
  const typeKey = docNumActiveTab;
  const errors = validateDocNumForm(typeKey);
  if (errors.length) {
    showToast(errors[0], "danger");
    return;
  }

  const form = readDocNumForm(typeKey);
  const payload = {};
  Object.keys(form).forEach((k) => {
    if (!DOCNUM_COLUMN_FIELDS.has(k) && form[k] !== "") payload[k] = form[k];
  });
  /* STATUS PEMBAYARAN DIBAWA, bukan dibangun ulang dari form.

     Payload di atas dirakit HANYA dari isian form, dan status lunas
     bukan isian form -- ia ditandai dari daftar riwayat. Tanpa baris
     ini, memperbaiki satu salah ketik di pengajuan yang sudah lunas
     diam-diam mengembalikannya jadi "belum lunas". */
  const lama = (docNumHistoryRows.find((r) => r.id === dnEditingId) || {}).payload || {};
  DN_FIELD_BAYAR.forEach((k) => {
    if (lama[k] != null && lama[k] !== "") payload[k] = lama[k];
  });

  docNumBusy = true;
  try {
    const { error } = await supabaseClient
      .from("document_numbers")
      .update({
        doc_date: form.docDate || null,
        requester: form.requester || null,
        department: form.department || null,
        payload,
      })
      .eq("id", dnEditingId);
    if (error) throw error;

    batalUbahDocNum();
    await renderDocNumHistory();
    showToast(t("m.isian.nomor.berhasil.diperbarui"), "success");
  } catch (err) {
    console.error(err);
    showToast(
      t("x.gagal.menyimpan.perubahan.err", { err: err.message || t("s.kesalahan.tidak.diketahui") }),
      "danger",
    );
  } finally {
    docNumBusy = false;
  }
}

/* ---------- penerbitan nomor ---------- */

async function submitDocNumRequest() {
  if (docNumBusy) return;
  // Form yang sedang dipakai memperbaiki tidak boleh menerbitkan nomor baru.
  if (dnEditingId) {
    await simpanUbahDocNum();
    return;
  }
  const typeKey = docNumActiveTab;
  const t = resolveDocNumType(typeKey);
  if (!t.key) return;

  const errors = validateDocNumForm(typeKey);
  const hint = $("#docNumHint");
  if (errors.length) {
    hint.textContent = errors[0];
    hint.classList.add("docnum-hint--error");
    showToast(
      errors.length === 1
        ? errors[0]
        : t("x.isian.belum.benar", { n: errors.length }),
      "danger",
    );
    return;
  }
  hint.textContent = "";
  hint.classList.remove("docnum-hint--error");

  const form = readDocNumForm(typeKey);
  const template = docNumTemplate(typeKey, form.docDate);

  const btn = $("#btnDocNumSubmit");
  const htmlAsli = btn.innerHTML;
  docNumBusy = true;
  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-arrow-repeat spin"></i> ${tt("Menerbitkan...", "Issuing...")}`;

  try {
    // Seri dibaca ULANG tepat sebelum menerbitkan: kalau ada yang mereset dari perangkat lain
    const periodKey = await muatSeri(t.key);

    // LANGKAH 1 — ambil nomor urut dari database
    const { data: hasil, error: errSeq } = await supabaseClient.rpc(
      "next_document_number",
      {
        p_doc_type: t.key,
        p_period_key: periodKey,
        p_template: template,
        p_pad: t.pad,
      },
    );
    if (errSeq) throw errSeq;
    const baris = Array.isArray(hasil) ? hasil[0] : hasil;
    if (!baris || !baris.out_number) {
      throw new Error(t("s.database.tidak.mengembalikan.nomor"));
    }

    // LANGKAH 2 — simpan catatan permintaannya.
    const payload = {};
    Object.keys(form).forEach((k) => {
      if (!DOCNUM_COLUMN_FIELDS.has(k) && form[k] !== "") payload[k] = form[k];
    });

    const { error: errInsert } = await supabaseClient
      .from("document_numbers")
      .insert({
        doc_type: t.key,
        doc_number: baris.out_number,
        period_key: periodKey,
        seq: baris.out_seq,
        doc_date: form.docDate || null,
        requester: form.requester || null,
        department: form.department || null,
        payload,
      });
    if (errInsert) throw errInsert;

    tampilkanHasilDocNum(baris.out_number);
    resetDocNumForm(typeKey, { keepIdentity: true });
    docNumPage = 1;
    await Promise.all([refreshDocNumPreview(typeKey), renderDocNumHistory()]);
    showToast(t("x.nomor.berhasil.diterbitkan", { nomor: baris.out_number }), "success");
  } catch (err) {
    console.error(err);
    // Nomor urut mungkin SUDAH terpakai walau penyimpanan gagal — itu disengaja
    showToast(
      t("w.gagal.menerbitkan.nomor", { err: err.message || t("s.kesalahan.tidak.diketahui") }),
      "danger",
    );
  } finally {
    docNumBusy = false;
    btn.disabled = false;
    btn.innerHTML = htmlAsli;
  }
}

function tampilkanHasilDocNum(nomor) {
  $("#docNumResultNumber").textContent = nomor;
  $("#docNumResult").classList.remove("d-none");
}

// `keepIdentity` mempertahankan nama pemohon & departemen
/* Mengisi pemilih "Jadwal Terkait" dari data yang sudah dimuat.

   HANYA jadwal EXPORT. Surat jalan di sini memang bentuk untuk kiriman
   keluar — menawarkan jadwal Import cuma membuka peluang salah pilih,
   karena hasil cetaknya nanti ditolak oleh pemeriksa tombol cetak. */
/* Pasangan pemilih: kotak yang DITULIS pengguna, dan kotak tersembunyi
   yang menyimpan id jadwalnya. */
const DN_PEMILIH_JADWAL = [
  { cari: "#dnShipmentSearch", id: "#dnShipmentPick" },        // surat jalan
  { cari: "#dnInvoiceShipmentSearch", id: "#dnInvoiceShipmentPick" }, // CIPL
];

/* Label -> id. Dibangun ulang tiap kali daftar jadwal berubah. */
let dnPetaJadwal = new Map();

/* Label yang ditulis di daftar saran. Harus UNIK: dua jadwal dengan
   nomor invoice & buyer yang sama akan saling menimpa di peta, dan
   pengguna memilih satu tapi mendapat yang lain — tanpa ada tanda apa
   pun. Yang bentrok dibedakan dengan tanggal ETD-nya. */
function dnLabelJadwal(s) {
  return [dispVal(s.invoice), dispVal(s.party)]
    .filter((v) => v && v !== "—")
    .join(" · ");
}

function isiPilihanJadwal() {
  const peta = new Map();
  const opsi = [];
  (data.export || []).forEach((s) => {
    let label = dnLabelJadwal(s) || tt("(tanpa nomor)", "(no number)");
    if (peta.has(label)) {
      const beda = s.etd ? fmtDate(s.etd) : String(s.id).slice(0, 6);
      label = `${label} · ETD ${beda}`;
    }
    /* Masih bentrok juga — dibubuhi id supaya tetap bisa dipilih.
       Jelek dibaca, tapi jauh lebih baik daripada dua baris identik
       yang salah satunya tidak pernah bisa terpilih. */
    while (peta.has(label)) label += "·";
    peta.set(label, s.id);
    opsi.push(`<option value="${escapeAttr(label)}"></option>`);
  });
  dnPetaJadwal = peta;

  const dl = $("#dnShipmentList");
  if (dl) dl.innerHTML = opsi.join("");

  // Kotak yang sudah terisi disegarkan labelnya (nomor invoice bisa berubah).
  DN_PEMILIH_JADWAL.forEach((pas) => dnSegarkanLabelPemilih(pas));
}

/* Menulis ulang label yang terlihat dari id yang tersimpan. */
function dnSegarkanLabelPemilih(pas) {
  const elId = $(pas.id);
  const elCari = $(pas.cari);
  if (!elId || !elCari) return;
  if (!elId.value) {
    elCari.value = "";
    return;
  }
  const s = (data.export || []).find((x) => String(x.id) === String(elId.value));
  if (!s) return;                       // jadwalnya terhapus — biarkan apa adanya
  for (const [label, id] of dnPetaJadwal) {
    if (String(id) === String(s.id)) {
      elCari.value = label;
      return;
    }
  }
}

/* Menerjemahkan yang diketik jadi id, lalu memberi tahu pendengar yang
   sudah ada lewat event `change` pada kotak tersembunyi. */
function dnPasangPemilihJadwal() {
  DN_PEMILIH_JADWAL.forEach((pas) => {
    const elCari = $(pas.cari);
    const elId = $(pas.id);
    if (!elCari || !elId || elCari.dataset.dnTerpasang) return;
    elCari.dataset.dnTerpasang = "1";

    const terapkan = () => {
      const teks = String(elCari.value || "").trim();
      const idBaru = teks ? dnPetaJadwal.get(teks) || "" : "";
      /* Kotak yang diisi tapi tidak cocok ditandai merah, bukan
         diam-diam dianggap "tidak ditautkan" — salah ketik satu huruf
         akan mencetak surat jalan tanpa daftar barang. */
      elCari.classList.toggle("is-invalid", !!teks && !idBaru);
      if (String(elId.value) === String(idBaru)) return;
      elId.value = idBaru;
      elId.dispatchEvent(new Event("change", { bubbles: true }));
    };
    // `input` supaya pilihan dari daftar saran langsung terbaca.
    elCari.addEventListener("input", terapkan);
    elCari.addEventListener("change", terapkan);
  });
}
document.addEventListener("DOMContentLoaded", dnPasangPemilihJadwal);
dnPasangPemilihJadwal();

/* Isian CIPL yang bisa DITURUNKAN dari jadwal.

   Yang diisi otomatis DICATAT nilainya. Saat jadwal ditukar, kotak
   yang isinya masih sama persis dengan yang diisikan mesin dianggap
   belum disentuh dan ikut diperbarui; yang sudah diubah pengguna
   dibiarkan.

   Tanpa catatan itu, dua perilaku sama-sama salah: menimpa semuanya
   menghapus koreksi yang sengaja dibuat, sementara mengisi "hanya yang
   kosong" membuat data jadwal LAMA menempel setelah jadwalnya ditukar
   — nilai invoice, pelabuhan, dan carrier tetap milik jadwal
   sebelumnya tanpa ada yang menyadari. */
let dnIsianOtomatis = {};
/* Alamat consignee diisikan dari nama buyer-nya.

   Hanya kalau kotaknya masih KOSONG. Alamat yang sudah diketik boleh
   jadi versi yang sengaja dibetulkan untuk kiriman ini — menimpanya
   menghapus koreksi tanpa ada yang tahu. */
function isiAlamatConsignee() {
  const panel = docNumPanelEl("invoice");
  if (!panel || typeof ciplAlamatBuyer !== "function") return;
  const nama = panel.querySelector('[data-dn="customer"]');
  const alamat = panel.querySelector('[data-dn="consigneeAddress"]');
  if (!nama || !alamat) return;
  const sekarang = String(alamat.value || "").trim();
  const dulu = String(dnIsianOtomatis.consigneeAddress || "");
  if (sekarang && sekarang !== dulu) return;
  const isi = ciplAlamatBuyer(nama.value);
  if (isi) {
    alamat.value = isi;
    dnIsianOtomatis.consigneeAddress = isi;
  }
}

/* Dipasang sekali di sini, bukan di dalam isiPilihanJadwal() — daftar
   opsinya digambar ulang tiap kali data berubah, dan memasang
   pendengar di sana berarti menumpuk pendengar yang sama. */
const elPickInvoice = $("#dnInvoiceShipmentPick");
if (elPickInvoice) {
  elPickInvoice.addEventListener("change", isiOtomatisDariJadwal);
}

/* `change`, bukan `input`: alamat baru diisi setelah nama buyer selesai
   diketik. Pada `input`, "D" sudah cukup untuk mencocokkan sesuatu. */
const elCustomerInv = document.querySelector(
  '[data-docnum-panel="invoice"] [data-dn="customer"]',
);
if (elCustomerInv) {
  elCustomerInv.addEventListener("change", isiAlamatConsignee);
}

function isiOtomatisDariJadwal() {
  const sel = $("#dnInvoiceShipmentPick");
  if (!sel) return;
  const s = (data.export || []).find((x) => x.id === sel.value);
  if (!s) return;

  const panel = docNumPanelEl("invoice");
  if (!panel) return;
  const set = (nama, nilai) => {
    const el = panel.querySelector(`[data-dn="${nama}"]`);
    if (!el) return;
    const sekarang = String(el.value || "").trim();
    const dulu = String(dnIsianOtomatis[nama] || "");
    // Kosong, atau masih persis seperti yang dulu diisikan mesin.
    if (sekarang && sekarang !== dulu) return;
    el.value = nilai || "";
    dnIsianOtomatis[nama] = el.value;
  };

  set("customer", s.party);
  isiAlamatConsignee();

  /* Nilai invoice diambil dari total nilai barang di jadwalnya.

     `set()` tidak dipakai di sini: kotak Nilai kerap berisi "0" — bukan
     kosong — sehingga penjaga "isi hanya kalau kosong" menganggapnya
     sudah terisi dan angkanya tidak pernah masuk. Nol diperlakukan
     sama dengan kosong. */
  const elNilai = panel.querySelector('[data-dn="amount"]');
  if (elNilai && typeof computeCustoms === "function") {
    const total = computeCustoms(s).totalUSD;
    const sekarang = String(elNilai.value || "").trim();
    const dulu = String(dnIsianOtomatis.amount || "");
    // Nol diperlakukan sama dengan kosong: kotak ini kerap berisi "0".
    const belumDisentuh =
      !sekarang || !parseLooseNumber(sekarang) || sekarang === dulu;
    if (belumDisentuh) {
      elNilai.value = total ? formatNumberValue(Math.round(total * 100) / 100) : "";
      dnIsianOtomatis.amount = elNilai.value;
    }
  }
  set("portLoading", portCodeLabel(s.origin));
  set("finalDestination", portCodeLabel(s.destination));
  set("carrier", carrierNameFromShipment(s));
  set("termsDelivery", s.incoterm);
  /* Sailing on or About SENGAJA tidak diisi dari ETD. Tanggal berlayar
     di invoice adalah keterangan pengangkut, bukan rencana kita — dan
     invoice kerap terbit sebelum kapalnya pasti. */
}

/* ISIAN YANG MUNCUL MENGIKUTI PILIHAN.

   data-dn-when="Billing"  -> tampil hanya saat Jenis Pengeluaran Billing
   data-dn-when="!Billing" -> tampil untuk pilihan SELAIN itu

   Yang disembunyikan juga di-disable, bukan cuma ditutup: isian
   tersembunyi yang tetap aktif akan ikut terkirim saat nomor
   diterbitkan, dan surat cetaknya bisa memuat nomor billing DAN nomor
   invoice sekaligus padahal cuma satu yang dimaksud. */
function syncDocNumConditional(panel) {
  if (!panel) return;
  /* Dua pengemudi: Jenis Pengeluaran (Pengajuan Dana) dan Jenis Surat
     Jalan (Delivery Order). Keduanya memakai data-dn-when yang sama. */
  const pilih =
    panel.querySelector('[data-dn="expenseType"]') ||
    panel.querySelector('[data-dn="doKind"]');
  if (!pilih) return;
  const nilai = pilih.value;

  /* Billing selalu disetor ke kas negara -- diisikan otomatis supaya
     tidak diketik ulang tiap kali. Hanya diisi kalau kotaknya KOSONG
     atau masih berisi isian otomatis sebelumnya: begitu pengguna
     mengetik sendiri, ketikannya tidak diganggu. */
  const kotakPayee = panel.querySelector('[data-dn="payee"]');
  if (kotakPayee) {
    if (nilai === "Billing") {
      if (!kotakPayee.value.trim() || kotakPayee.dataset.autoFill === "1") {
        kotakPayee.value = "KAS NEGARA";
        kotakPayee.dataset.autoFill = "1";
      }
    } else if (kotakPayee.dataset.autoFill === "1") {
      kotakPayee.value = "";
      delete kotakPayee.dataset.autoFill;
    }
  }

  panel.querySelectorAll("[data-dn-when]").forEach((el) => {
    const syarat = el.dataset.dnWhen;
    const negasi = syarat.startsWith("!");
    const target = negasi ? syarat.slice(1) : syarat;
    const cocok = negasi ? nilai !== target : nilai === target;
    el.classList.toggle("d-none", !cocok);
    el.querySelectorAll("[data-dn]").forEach((f) => {
      f.disabled = !cocok;
    });
  });
}

function dnPunyaPilihan(sel, nilai) {
  return [...sel.options].some((o) => o.value === String(nilai));
}

function resetDocNumForm(typeKey, opts) {
  const panel = docNumPanelEl(typeKey);
  if (!panel) return;
  const keep = opts && opts.keepIdentity;
  // Pilihan sisipan dari nomor lama yang tadi dibuka (lihat isi()).
  panel.querySelectorAll("option[data-dn-lawas]").forEach((o) => o.remove());
  panel.querySelectorAll("[data-dn]").forEach((el) => {
    if (keep && (el.dataset.dn === "requester" || el.dataset.dn === "department"))
      return;
    if (keep && el.dataset.dn === "docDate") return;
    if (el.hasAttribute("data-dn-subtype")) return;
    /* DIKEMBALIKAN KE NILAI BAWAAN, bukan dikosongkan.

       Beberapa isian memang punya bawaan di HTML (Lampiran "1 Set",
       jabatan Accounting/CFO/President Director, nama penanda tangan).
       Mengosongkannya membuat bawaan itu hilang setelah satu kali
       menerbitkan nomor, dan pengguna harus mengetiknya ulang tiap
       kali.

       defaultValue = atribut value di HTML; untuk <select>, pilihan
       yang bertanda selected. */
    if (el.tagName === "SELECT") {
      const bawaan = [...el.options].find((o) => o.defaultSelected);
      el.value = bawaan ? bawaan.value : "";
    } else {
      el.value = el.defaultValue || "";
    }
    el.classList.remove("is-invalid");
  });
  /* Kotak ketik pemilih jadwal tidak ber-data-dn (yang ber-data-dn
     kotak tersembunyinya), jadi ia tidak ikut terhapus di atas. */
  DN_PEMILIH_JADWAL.forEach((pas) => {
    const elCari = $(pas.cari);
    if (!elCari) return;
    elCari.value = "";
    elCari.classList.remove("is-invalid");
  });
  if (typeof setPoNoExtra === "function") setPoNoExtra([], []);
  if (typeof setDoLines === "function" && typeKey === "do") setDoLines([]);
  if (typeof setFundLines === "function" && typeKey === "fund") setFundLines([]);
  syncDocNumConditional(panel);
}

/* Pilihan jenis pengeluaran menentukan isian mana yang tampil. */
document.addEventListener("change", (e) => {
  const pilih = e.target.closest('[data-dn="expenseType"], [data-dn="doKind"]');
  if (pilih) syncDocNumConditional(pilih.closest("[data-docnum-panel]") || document);
});
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-dn-subtab]");
  if (!tab) return;
  docNumHistorySub = tab.dataset.dnSubtab;
  docNumPage = 1;

  /* SUB-TAB MEMINDAHKAN FORM-nya juga -- untuk jenis yang sub-jenisnya
     memang deret nomor tersendiri (Surat Jalan Export/Lokal, Invoice
     Commercial/Non-Commercial).

     Tanpa ini ada DUA penunjuk deret yang bisa berselisih: tab riwayat
     menunjuk Lokal sementara form (dan panel "Atur Nomor Urut") masih
     menunjuk Export. Yang mana yang sedang disetel jadi soal tebakan,
     dan nomor yang diketik mendarat di deret yang salah.

     Sub-tab Pengajuan Dana TIDAK termasuk: ia menyaring isi payload
     (Jenis Pengeluaran), bukan memilih deret -- seluruh pengajuan dana
     memakai satu urutan. */
  const subs = DOCNUM_SUBTYPES[docNumActiveTab];
  if (subs && subs[docNumHistorySub]) {
    const panel = docNumPanelEl(docNumActiveTab);
    const elSub = panel && panel.querySelector("[data-dn-subtype]");
    if (elSub && elSub.value !== docNumHistorySub) {
      elSub.value = docNumHistorySub;
      syncDocNumConditional(panel);
      refreshDocNumPreview(docNumActiveTab);
    }
  }
  renderDocNumHistory();
});
document.addEventListener("input", (e) => {
  // Begitu diketik sendiri, isinya milik pengguna -- jangan ditimpa lagi.
  const el = e.target.closest('[data-dn="payee"]');
  if (el) delete el.dataset.autoFill;
});

/* ---------- riwayat nomor terbit ---------- */

/* Halaman & jumlah baris riwayat. Riwayat nomor tumbuh terus tiap hari */
let docNumPage = 1;
let docNumPageSize = 5;

async function renderDocNumHistory() {
  const box = $("#docNumHistory");
  const bar = $("#docNumPagination");
  if (!box) return;
  renderDocNumSubTabs();
  dnTampilkanSaringBayar();
  /* Tab Summary TIDAK memakai kueri berhalaman di bawah: ia butuh
     seluruh pengajuan, dan penanda tab-nya bukan jenis pengeluaran --
     dipakai sebagai saringan payload, hasilnya akan selalu kosong. */
  if (docNumActiveTab === "fund" && typeof FSUM_TAB !== "undefined" && docNumHistorySub === FSUM_TAB) {
    return renderRingkasanDana(box, bar);
  }
  box.innerHTML = `<div class="docnum-empty">${tt("Memuat…", "Loading…")}</div>`;
  if (bar) bar.innerHTML = "";

  const jenis = resolveDocNumType(docNumActiveTab);
  try {
    // Ambil HANYA sebanyak satu halaman
    const dari = (docNumPage - 1) * docNumPageSize;
    let kueri = supabaseClient
      .from("document_numbers")
      .select(
        /* doc_type WAJIB ikut diambil.

           Tanpanya, tiap baris di layar punya doc_type undefined —
           dan siapa pun yang menanyakannya akan mendapat jawaban yang
           kelihatan masuk akal tapi salah. Tombol Perbaiki memetakan
           undefined ke tab bawaan, jadi menekan edit pada Surat Jalan
           melompat ke panel Invoice dan mengisi form yang keliru.

           Baris ini memang sudah disaring per jenis di kueri, tapi
           datanya tetap harus membawa jenisnya sendiri — yang menyaring
           dan yang membaca bukan bagian kode yang sama. */
        /* `seq` dipakai sebagai bawaan Nomor SI pada cetak CIPL —
           lihat ciplNoSiBawaan(). Tanpa kolom ini nomor SI jatuh ke
           tebakan dari ekor nomor invoice, yang untuk pola Kumho
           menghasilkan tanggalnya. */
        "id, doc_type, doc_number, doc_date, requester, department, seq, payload, created_at",
        { count: "exact" },
      )
      .eq("doc_type", docNumHistoryKey())
      .filter(...docNumPayloadFilter());
    const saringCari = dnFilterCari(docNumCari);
    if (saringCari) kueri = kueri.or(saringCari);
    kueri = dnTerapkanSaringBayar(kueri);
    const { data, error, count } = await kueri
      .order("created_at", { ascending: false })
      .range(dari, dari + docNumPageSize - 1);
    if (error) throw error;

    /* Disimpan supaya tombol cetak tidak perlu memanggil database lagi —
       barisnya sudah ada di layar. Sengaja dipastikan berupa LARIK:
       kalau kueri mengembalikan null, .find() akan meledak saat ditekan. */
    docNumHistoryRows = Array.isArray(data) ? data : [];

    const total = count || 0;
    // Halaman terakhir bisa jadi kosong setelah data dihapus
    if (total > 0 && (!data || !data.length) && docNumPage > 1) {
      docNumPage = Math.max(1, Math.ceil(total / docNumPageSize));
      return renderDocNumHistory();
    }

    if (!total) {
      const teksBayar = docNumSaringBayar === "lunas" ? tt("Lunas", "Paid") : tt("Belum Lunas", "Unpaid");
      box.innerHTML = docNumCari
        ? `<div class="docnum-empty">${tt(`Tidak ada nomor yang cocok dengan “${escapeHtml(docNumCari)}”.`, `No numbers match “${escapeHtml(docNumCari)}”.`)}</div>`
        : docNumActiveTab === "fund" && docNumSaringBayar
        ? `<div class="docnum-empty">${tt(`Tidak ada pengajuan berstatus ${teksBayar}.`, `No ${teksBayar.toLowerCase()} requests.`)}</div>`
        : `<div class="docnum-empty">${tt(`Belum ada nomor ${escapeHtml(jenis.label)} yang diterbitkan.`, `No ${escapeHtml(jenis.label)} numbers issued yet.`)}</div>`;
      return;
    }

    box.innerHTML = `
      <div class="docnum-history-wrap">
      <table class="docnum-table">
        <thead>
          <tr><th>${jenis.key === "invoice" ? tt("No. Invoice", "Invoice No.") : tt("Nomor", "Number")}</th><th class="dn-col-tgl">${tt("Tanggal", "Date")}</th><th class="dn-col-pemohon">${tt("Pemohon", "Requester")}</th>${
            /* Pengajuan dana perlu dikenali dari BILLING-nya, bukan cuma
               dari "Dibayarkan Kepada" -- beberapa pengajuan bisa punya
               penerima yang sama persis dan cuma beda nomor billing. */
            jenis.key === "fund"
              ? `<th class="dn-col-billing">${escapeHtml(t("f.nomor.billing.invoice"))}</th>`
              : ""
          }<th>${escapeHtml(DN_KOLOM_UTAMA[jenis.key] || tt("Keterangan", "Notes"))}</th>${
            jenis.key === "fund" ? `<th class="dn-col-nilai">${tt("Nilai", "Value")}</th>` : ""
          }${
            jenis.key === "invoice" ? `<th class="dn-col-nilai">Amount</th>` : ""
          }${
            jenis.key === "fund" ? `<th class="dn-col-ket">${tt("Keterangan", "Notes")}</th>` : ""
          }${
            jenis.key === "fund" ? `<th class="dn-col-bayar">${tt("Status Bayar", "Payment")}</th>` : ""
          }<th class="dn-act"></th></tr>
        </thead>
        <tbody>
          ${data
            .map((r) => {
              const p = r.payload || {};
              /* PENGAJUAN DANA: kolom ini berjudul "Dibayarkan Kepada",
                 jadi isinya VENDOR (payee) -- bukan Customer.

                 Sejak pengajuan dana punya isian Customer sendiri,
                 urutan cadangan di bawah (customer lebih dulu) akan
                 menampilkan nama customer di bawah judul Vendor.
                 Customer & Vendor dua pihak yang berbeda: yang satu
                 menanggung biayanya, yang lain ditagih pembayarannya. */
              let ringkas =
                (jenis.key === "fund" ? p.payee : "") ||
                p.customer ||
                p.receiver ||
                p.payee ||
                p.recipient ||
                p.subject ||
                p.notes ||
                "—";
              /* Alamat & isian lain TIDAK lagi ditempel di sini.

                 Kolom Keterangan tadinya memuat penerima + alamat penuh
                 dan melebar melewati tabelnya. Semua isian sekarang bisa
                 dilihat lewat tombol Detail — daftarnya cukup menyebut
                 satu hal yang membedakan tiap baris. */
              return `<tr>
                <td class="dn-num">${escapeHtml(r.doc_number)}</td>
                <!-- Kelas yang sama dengan kepalanya: menyembunyikan
                     hanya <th> membuat kolomnya bergeser, bukan hilang. -->
                <td class="dn-col-tgl">${escapeHtml(fmtDate(r.doc_date))}</td>
                <td class="dn-col-pemohon">${escapeHtml(r.requester || "—")}${r.department ? ` <span class="dn-dept">${escapeHtml(r.department)}</span>` : ""}</td>
                ${
                  jenis.key === "fund"
                    ? /* Nomor rujukannya BERGANTIAN mengikuti jenis pengeluaran:
                         billing untuk Billing, invoice untuk sisanya. Membaca
                         billingNo saja membuat kolomnya kosong untuk jenis
                         lain padahal nomornya tersimpan. */
                      `<td class="dn-col-billing dn-num">${escapeHtml(p.billingNo || p.invoiceNo || "\u2014")}</td>`
                    : ""
                }
                <td>${escapeHtml(String(ringkas).slice(0, 60))}</td>
                ${
                  /* Nilai = jumlah akhir pengajuan, angka yang sama dengan
                     "Terbilang" di surat cetaknya (frTotalPengajuan). */
                  jenis.key === "fund"
                    ? `<td class="dn-col-nilai">${escapeHtml(frNilai(frTotalPengajuan(p), p.currency || "IDR"))}</td>`
                    : ""
                }
                ${
                  // Amount = baris Total di Commercial Invoice cetaknya.
                  jenis.key === "invoice"
                    ? `<td class="dn-col-nilai">${escapeHtml(dnTeksNilaiInvoice(r))}</td>`
                    : ""
                }
                ${
                  /* Rincian = Subject pada surat yang dicetak, jadi di
                     sinilah terbaca "pembayaran billing import apa".
                     Dipotong 80: lebih panjang dari kolom lain karena
                     memang kalimat, bukan satu nama. */
                  jenis.key === "fund"
                    ? `<td class="dn-col-ket" title="${escapeAttr(p.notes || "")}">${escapeHtml(String(p.notes || "\u2014").slice(0, 80))}</td>`
                    : ""
                }
                ${jenis.key === "fund" ? `<td class="dn-col-bayar">${dnTombolBayar(r)}</td>` : ""}
                <td class="dn-act">
                  ${
                    /* Edit hanya untuk isian permintaannya — NOMOR dan
                       urutannya tidak ikut diubah. Nomor yang sudah
                       terbit sudah beredar di dokumen lain; menariknya
                       kembali menciptakan dua kebenaran. */
                    bolehUbahDocNum()
                      ? `<button type="button" class="icon-btn" data-edit-num="${r.id}"
                                 title="${tt("Perbaiki isian", "Edit fields")}"><i class="bi bi-pencil"></i></button>`
                      : ""
                  }
                  <button type="button" class="icon-btn" data-detail-num="${r.id}"
                          title="${tt("Lihat seluruh isian", "View all fields")}"><i class="bi bi-list-ul"></i></button>
                  ${
                    /* Surat jalan hanya dipakai untuk kiriman EXPORT.
                       Yang belum ditautkan pun ditawarkan — jadwalnya
                       bisa dipasang belakangan lewat pengajuan baru. */
                    /* startsWith: Lokal ber-key "do_lokal". Membandingkan
                       persis dengan "do" membuat tombol cetaknya hilang
                       untuk seluruh surat jalan Lokal. */
                    String(jenis.key || "").startsWith("do") && sjBolehCetak(r)
                      ? `<button type="button" class="icon-btn" data-print-sj="${r.id}"
                                 title="${tt("Cetak surat jalan", "Print delivery note")}"><i class="bi bi-printer"></i></button>`
                      : ""
                  }
                  ${
                    /* Form Pengajuan Dana. Tidak perlu tautan jadwal —
                       seluruh isinya datang dari form pengajuan itu
                       sendiri, jadi setiap nomor "fund" bisa dicetak. */
                    jenis.key === "fund"
                      ? `<button type="button" class="icon-btn" data-print-fund="${r.id}"
                                 title="${tt("Cetak Form Pengajuan Dana", "Print Fund Request Form")}"><i class="bi bi-printer"></i></button>`
                      : ""
                  }
                  ${
                    /* Satu tombol, dua halaman: Commercial Invoice &
                       Packing List. Judul halaman pertama mengikuti
                       jenis invoice yang dipilih saat nomor terbit. */
                    /^invoice/.test(jenis.key) && ciplBolehCetak(r)
                      ? `<button type="button" class="icon-btn" data-print-cipl="${r.id}"
                                 title="${tt("Cetak Commercial Invoice, Packing List & Shipping Instruction", "Print Commercial Invoice, Packing List & Shipping Instruction")}"><i class="bi bi-printer"></i></button>
                         <button type="button" class="icon-btn" data-xls-cipl="${r.id}"
                                 title="${tt("Unduh Excel (Invoice, PL, SI)", "Download Excel (Invoice, PL, SI)")}"><i class="bi bi-file-earmark-excel"></i></button>`
                      : ""
                  }
                  <button type="button" class="icon-btn danger" data-del-num="${r.id}"
                          data-num-label="${escapeHtml(r.doc_number)}" title="${tt("Hapus nomor ini", "Delete this number")}">
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      </div>`;
    renderDocNumPagination(total);
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="docnum-empty">${tt("Gagal memuat riwayat", "Failed to load history")}: ${escapeHtml(err.message || t("s.kesalahan.tidak.diketahui"))}</div>`;
  }
}

// Memakai kelas & susunan yang SAMA dengan paginasi daftar jadwal (.pagination-bar
function renderDocNumPagination(total) {
  const bar = $("#docNumPagination");
  if (!bar) return;
  const totalHal = Math.max(1, Math.ceil(total / docNumPageSize));
  if (docNumPage > totalHal) docNumPage = totalHal;
  const awal = (docNumPage - 1) * docNumPageSize + 1;
  const akhir = Math.min(docNumPage * docNumPageSize, total);

  const tombolHal = paginationRange(docNumPage, totalHal)
    .map((h) =>
      h === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn ${h === docNumPage ? "active" : ""}" data-dnpage="${h}">${h}</button>`,
    )
    .join("");

  bar.className = "pagination-bar pagination-bar--compact";
  bar.innerHTML = `
    <div class="pagination-info">${tt(`Menampilkan <b>${awal}–${akhir}</b> dari <b>${total}</b> nomor`, `Showing <b>${awal}–${akhir}</b> of <b>${total}</b> numbers`)}</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" id="dnPagePrev" ${docNumPage <= 1 ? "disabled" : ""} title="${tt("Halaman sebelumnya", "Previous page")}"><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${tombolHal}</div>
      <button type="button" class="page-nav" id="dnPageNext" ${docNumPage >= totalHal ? "disabled" : ""} title="${tt("Halaman berikutnya", "Next page")}"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="dnPageSize">${tt("Per halaman", "Per page")}</label>
      <select id="dnPageSize">
        ${[5, 10, 20, 50, 100]
          .map(
            (n) =>
              `<option value="${n}" ${n === docNumPageSize ? "selected" : ""}>${n}</option>`,
          )
          .join("")}
      </select>
    </div>`;
}

// Satu pendengar untuk seluruh bilah — isinya dirender ulang tiap kali
$("#docNumPagination")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dnpage], #dnPagePrev, #dnPageNext");
  if (!btn || btn.disabled) return;
  if (btn.dataset.dnpage) docNumPage = parseInt(btn.dataset.dnpage, 10);
  else if (btn.id === "dnPagePrev") docNumPage = Math.max(1, docNumPage - 1);
  else docNumPage += 1;
  renderDocNumHistory();
});
$("#docNumPagination")?.addEventListener("change", (e) => {
  if (e.target.id !== "dnPageSize") return;
  docNumPageSize = parseInt(e.target.value, 10) || 5;
  docNumPage = 1; // jumlah baris berubah -> nomor halaman lama tidak lagi bermakna
  renderDocNumHistory();
});

/* HAPUS SATU NOMOR */
$("#docNumHistory")?.addEventListener("click", (e) => {
  const ubah = e.target.closest("[data-edit-num]");
  if (ubah) {
    mulaiUbahDocNum(ubah.dataset.editNum);
    return;
  }
  const detail = e.target.closest("[data-detail-num]");
  if (detail) {
    // Melihat detail tidak mengubah apa pun — viewer pun boleh.
    tampilkanDetailNomor(detail.dataset.detailNum);
    return;
  }
  const cetak = e.target.closest("[data-print-sj]");
  if (cetak) {
    // Mencetak tidak mengubah apa pun, jadi viewer pun boleh.
    cetakSuratJalan(cetak.dataset.printSj);
    return;
  }
  const cetakFund = e.target.closest("[data-print-fund]");
  if (cetakFund) {
    cetakFundRequest(cetakFund.dataset.printFund);
    return;
  }

  const cetakCi = e.target.closest("[data-print-cipl]");
  if (cetakCi) {
    cetakCipl(cetakCi.dataset.printCipl);
    return;
  }
  const xlsCi = e.target.closest("[data-xls-cipl]");
  if (xlsCi) {
    unduhCiplExcel(xlsCi.dataset.xlsCipl);
    return;
  }
  if (e.target.closest("[data-del-num]") && !requireEdit()) return;
  const btn = e.target.closest("[data-del-num]");
  if (!btn) return;
  const id = btn.dataset.delNum;
  const label = btn.dataset.numLabel || "nomor ini";
  showConfirm(
    t("w.hapus.nomor", { label }),
    async () => {
      btn.disabled = true;
      try {
        const { error } = await supabaseClient.rpc("delete_document_number", {
          p_id: id,
        });
        if (error) throw error;
        showToast(t("w.nomor.dihapus", { label }), "success");
        refreshDocNumPreview(docNumActiveTab);
        renderDocNumHistory();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        showToast(
          t("w.gagal.menghapus.err", { err: err.message || t("s.kesalahan.tidak.diketahui") }),
          "danger",
        );
      }
    },
  );
});

/* ---------- tab ---------- */

function showDocNumTab(key) {
  const tabs = document.querySelectorAll("[data-docnum-tab]");
  const panels = document.querySelectorAll("[data-docnum-panel]");
  if (!tabs.length) return;

  // Kalau kunci tidak dikenal (mis
  const known = Array.from(tabs).some((t) => t.dataset.docnumTab === key);
  const active = known ? key : DOCNUM_DEFAULT_TAB;
  /* Berpindah jenis dokumen membatalkan perbaikan yang sedang berjalan.
     Form panel lain sudah kosong; membiarkan dnEditingId hidup membuat
     pengajuan berikutnya diam-diam menimpa nomor yang tadi dibuka. */
  if (typeof dnEditingId !== "undefined" && dnEditingId && active !== docNumActiveTab) {
    dnEditingId = null;
    syncModeUbahDocNum(null);
  }
  /* Pindah jenis dokumen MELEPAS pilihan sub-tab riwayat: label seperti
     "Lokal" tidak ada di jenis lain, dan membiarkannya membuat riwayat
     tampil kosong tanpa alasan yang terlihat. */
  docNumHistorySub = null;
  // Jenis dokumen lain = data lain: kata kunci yang tertinggal hanya
  // membuat riwayatnya tampak kosong tanpa sebab yang terlihat.
  if (active !== docNumActiveTab) {
    docNumCari = "";
    const kotakCari = $("#docNumSearch");
    if (kotakCari) kotakCari.value = "";
    docNumSaringBayar = "";
    const pilihBayar = $("#docNumBayar");
    if (pilihBayar) pilihBayar.value = "";
  }
  docNumActiveTab = active;
  try {
    localStorage.setItem(DOCNUM_TAB_KEY, active);
  } catch (e) {
    /* Diabaikan: tab yang tidak terkenang cuma merepotkan sedikit,
       tidak sebanding dengan menggagalkan perpindahan tab. */
  }

  tabs.forEach((t) =>
    t.classList.toggle("active", t.dataset.docnumTab === active),
  );
  panels.forEach((p) =>
    p.classList.toggle("active", p.dataset.docnumPanel === active),
  );

  $("#docNumResult").classList.add("d-none");
  $("#docNumHint").textContent = "";

  // Tanggal dokumen default = hari ini, biar tidak perlu diketik tiap kali.
  const panel = docNumPanelEl(active);
  const tglEl = panel && panel.querySelector('[data-dn="docDate"]');
  if (tglEl && !tglEl.value) tglEl.value = todayISO();

  docNumPage = 1;
  refreshDocNumPreview(active);
  renderDocNumHistory();
}

const docNumTabsEl = $("#docNumTabs");
if (docNumTabsEl) {
  docNumTabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-docnum-tab]");
    if (!btn) return;
    showDocNumTab(btn.dataset.docnumTab);
  });
}

// Mengubah tanggal berarti mengubah periode penomoran (bulan/tahun di dalam nomor)
document.querySelectorAll('[data-docnum-panel] [data-dn="docDate"]').forEach(
  (el) => {
    el.addEventListener("change", () => refreshDocNumPreview(docNumActiveTab));
  },
);
/* Mengganti sub-jenis berarti pindah DERET nomor: pratinjau, panel
   nomor urut, dan riwayatnya ikut dimuat ulang.

   `docNumHistorySub` dilepas supaya riwayat mengikuti form. Kalau
   dibiarkan, riwayat tetap menampilkan deret yang tadi dipilih lewat
   sub-tab padahal formnya sudah pindah -- dua penunjuk deret yang
   saling membantah di satu layar. */
document.querySelectorAll("[data-dn-subtype]").forEach((el) => {
  el.addEventListener("change", () => {
    docNumPage = 1;
    docNumHistorySub = null;
    refreshDocNumPreview(docNumActiveTab);
    renderDocNumHistory();
  });
});

$("#btnDnEditCancel")?.addEventListener("click", batalUbahDocNum);

$("#btnDocNumSubmit")?.addEventListener("click", () => {
  if (!requireEdit()) return;
  submitDocNumRequest();
});
$("#btnDocNumReset")?.addEventListener("click", () => {
  resetDocNumForm(docNumActiveTab);
  $("#docNumResult").classList.add("d-none");
  $("#docNumHint").textContent = "";
});
$("#btnDocNumRefresh")?.addEventListener("click", () => {
  refreshDocNumPreview(docNumActiveTab);
  renderDocNumHistory();
});
$("#btnCopyDocNum")?.addEventListener("click", async () => {
  const nomor = $("#docNumResultNumber").textContent.trim();
  if (!nomor || nomor === "—") return;
  const ok = await copyToClipboard(nomor);
  showToast(ok ? t("z.nomor.disalin") : t("z.gagal.menyalin.nomor"), ok ? "success" : "danger");
});

/* Penanda halaman aktif di navbar. Dipanggil tiap kali router berpindah */
function setActivePageNav(page) {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === page);
  });
}


/* ------------------------------------------------------------------
   DETAIL PENGAJUAN NOMOR

   Isian tiap jenis dokumen berbeda-beda, dan menampilkan semuanya di
   tabel membuat kolom Keterangan melebar melewati lebarnya. Di sini
   seluruh isian ditampilkan apa adanya — termasuk field yang hanya
   dipunyai satu jenis dokumen.
------------------------------------------------------------------ */
/* Judul kolom keempat mengikuti jenis dokumennya. "Keterangan" terlalu
   samar padahal isinya selalu satu hal tertentu. */
const DN_KOLOM_UTAMA = {
  get do() { return tt("Tujuan / Penerima", "Destination / Recipient"); },
  get invoice() { return tt("Customer", "Customer"); },
  get fund() { return tt("Dibayarkan Kepada", "Paid To"); },
  get letter() { return tt("Perihal", "Subject"); },
};

const DN_LABEL_FIELD = {
  get packages() { return tt("Jumlah Koli", "Number of Packages"); },
  get receiver() { return tt("Tujuan / Penerima", "Destination / Recipient"); },
  get address() { return tt("Alamat Tujuan", "Destination Address"); },
  get vehicle() { return tt("No. Kendaraan", "Vehicle No."); },
  get shipmentId() { return tt("Jadwal Terkait", "Linked Schedule"); },
  get customer() { return tt("Customer", "Customer"); },
  get payee() { return tt("Dibayarkan Kepada", "Paid To"); },
  get recipient() { return tt("Penerima Surat", "Letter Recipient"); },
  get subject() { return tt("Perihal", "Subject"); },
  get amount() { return tt("Nilai", "Amount"); },
  get currency() { return tt("Mata Uang", "Currency"); },
  get purpose() { return tt("Keperluan", "Purpose"); },
  get notes() { return tt("Keterangan", "Notes"); },
  get reference() { return tt("Referensi", "Reference"); },
  // Isian Form Pengajuan Dana
  get billingNo() { return tt("Nomor Billing", "Billing Number"); },
  get invoiceNo() { return tt("Nomor Invoice", "Invoice Number"); },
  get invoiceDate() { return tt("Tanggal Invoice", "Invoice Date"); },
  get invoiceDueDate() { return tt("Due Date Invoice", "Invoice Due Date"); },
  get paidAt() { return tt("Tanggal Bayar", "Paid Date"); },
  get paidBy() { return tt("Ditandai Lunas Oleh", "Marked Paid By"); },
  get attachment() { return tt("Lampiran", "Attachment"); },
  get feeBm() { return tt("Bea Masuk", "Import Duty"); },
  get feePpn() { return tt("PPN Import", "Import VAT (PPN)"); },
  get feePph() { return tt("PPH Import", "Import Income Tax (PPH)"); },
  get checkedByName() { return tt("Checked By", "Checked By"); },
  get checkedByRole() { return tt("Jabatan Checked By", "Checked By Position"); },
  get approver1Name() { return tt("Approved By", "Approved By"); },
  get approver1Role() { return tt("Jabatan Approved By", "Approved By Position"); },
  get quantity() { return tt("Jumlah", "Quantity"); },
  get unit() { return tt("Satuan", "Unit"); },
  // Isian CIPL
  get invoiceKind() { return tt("Jenis Invoice", "Invoice Type"); },
  get consigneeAddress() { return tt("Alamat Consignee", "Consignee Address"); },
  get notifyParty() { return tt("Notify Party", "Notify Party"); },
  get poNo() { return tt("PO No.", "PO No."); },
  get poDate() { return tt("Tanggal PO", "PO Date"); },
  get poNoExtra() { return tt("PO No. lainnya", "Other PO No."); },
  get termsDelivery() { return tt("Terms of Delivery", "Terms of Delivery"); },
  get termPayment() { return tt("Term of Payment", "Term of Payment"); },
  get portLoading() { return tt("Port of Loading", "Port of Loading"); },
  get finalDestination() { return tt("Final Destination", "Final Destination"); },
  get carrier() { return tt("Carrier", "Carrier"); },
  get sailingDate() { return tt("Sailing on or About", "Sailing on or About"); },
  get remarks() { return tt("Remarks", "Remarks"); },
};

/* Urutan tampil di kotak Detail. Yang tidak tersebut di sini ikut di
   belakang, urut sesuai kemunculannya.

   Tanpa urutan tetap, isian tampil mengikuti urutan kunci JSON — dan
   itu berubah-ubah mengikuti urutan pengisian, sehingga dua invoice
   yang isinya sama bisa tampil dengan susunan berbeda. */
const DN_URUTAN_FIELD = [
  "invoiceKind",
  "customer",
  "consigneeAddress",
  "notifyParty",
  "shipmentId",
  "poNo",
  "poDate",
  "termsDelivery",
  "termPayment",
  "currency",
  "amount",
  "portLoading",
  "finalDestination",
  "carrier",
  "sailingDate",
  "remarks",
  "receiver",
  "address",
  "vehicle",
  "packages",
  "payee",
  "invoiceDate",
  "invoiceDueDate",
  "expenseType",
  "letterType",
  "signer",
  "recipient",
  "subject",
  "notes",
];

/* Isian bertipe tanggal: disimpan ISO ("2026-09-20"), ditampilkan
   sebagai tanggal biasa di kotak Detail. */
const DN_FIELD_TANGGAL = new Set([
  "poDate", "sailingDate", "invoiceDate", "invoiceDueDate",
]);

/* Satu baris larik payload -> teks terbaca.

   Bentuknya berbeda antar jenis dokumen (rincian biaya punya
   desc/amount, daftar barang punya nama/qty/satuan), jadi yang
   dikumpulkan adalah nilai yang ADA, bukan susunan tetap. */
function dnRingkasBarisPayload(b) {
  if (b == null) return "";
  if (typeof b !== "object") return String(b);
  const bagian = [
    b.desc || b.nama || "",
    [b.qty, b.satuan].filter((v) => String(v ?? "").trim()).join(" "),
    b.amount != null && String(b.amount).trim()
      ? (typeof formatRupiah === "function"
          ? "Rp " + formatRupiah(parseRupiah(b.amount))
          : String(b.amount))
      : "",
    b.ppnRate ? "PPN " + b.ppnRate + "%" : "",
    b.ket || "",
  ].filter((v) => String(v).trim());
  return bagian.join(" · ");
}

function tampilkanDetailNomor(id) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  const p = r.payload || {};

  const baris = [
    [tt("Nomor", "Number"), r.doc_number],
    [tt("Tanggal", "Date"), fmtDate(r.doc_date)],
    [tt("Pemohon", "Requester"), r.requester],
    [tt("Departemen", "Department"), r.department],
  ].filter(([, v]) => String(v == null ? "" : v).trim() !== "");
  const urut = [
    ...DN_URUTAN_FIELD.filter((k) => k in p),
    ...Object.keys(p).filter((k) => !DN_URUTAN_FIELD.includes(k)),
  ];
  urut.forEach((k) => {
    let nilai = p[k];
    if (k === "shipmentId") {
      const kapal = typeof sjCariShipment === "function" ? sjCariShipment(nilai) : null;
      nilai = kapal
        ? [dispVal(kapal.invoice), dispVal(kapal.party)].filter(Boolean).join(" · ")
        : t("s.jadwal.tidak.ditemukan");
    }
    /* LARIK ISIAN DIRINGKAS JADI BARIS TEKS.

       Rincian biaya & daftar barang tersimpan sebagai larik objek.
       String(objek) menghasilkan "[object Object]" -- terlihat seperti
       kerusakan data padahal isinya utuh. */
    /* Tanggal PO tambahan sudah ikut tercetak bersama nomornya di
       baris "PO No. lainnya" -- barisnya sendiri cuma akan menampilkan
       deretan tanggal tanpa keterangan milik PO yang mana. */
    if (k === "poDateExtra") return;
    if (k === "poNoExtra") {
      const tglLain = p.poDateExtra || [];
      nilai = (nilai || [])
        .map((no, i) =>
          tglLain[i] ? `${no} · ${fmtDate(tglLain[i])}` : String(no),
        )
        .join("\n");
    }
    if (Array.isArray(nilai)) {
      nilai = nilai.map(dnRingkasBarisPayload).filter(Boolean).join("\n");
    }
    if (DN_FIELD_TANGGAL.has(k) && nilai) nilai = fmtDate(nilai);
    if (String(nilai ?? "").trim() === "") return;
    /* Nilai selalu dalam mata uang yang tercatat di baris ini. Angka
       telanjang "30,062" tidak memberi tahu rupiah atau dolar, dan pada
       dokumen ekspor bedanya bukan hal kecil. */
    if (k === "amount") {
      const mata = String(p.currency || "USD").toUpperCase();
      const lambang = mata === "USD" ? "$" : mata === "IDR" ? "Rp " : mata + " ";
      nilai = lambang + formatNumberValue(parseInputNumber(nilai));
    }
    /* Kunci yang belum punya label dirapikan sendiri: "packages" ->
       "Packages". Isian tiap jenis dokumen bisa bertambah, dan yang
       belum terdaftar tidak boleh tampil sebagai potongan kode. */
    const label =
      DN_LABEL_FIELD[k] ||
      k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    baris.push([label, nilai]);
  });

  $("#promptTitle").textContent = tt("Detail Pengajuan Nomor", "Number Request Details");
  $("#promptDesc").textContent = "";
  $("#promptDesc").classList.add("d-none");
  $("#promptIcon").className = "bi bi-list-ul";
  $("#promptError").classList.add("d-none");
  $("#promptFields").innerHTML = `
    <dl class="dn-detail">
      ${baris
        .map(
          ([k, v]) =>
            `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v)).replace(/\n/g, "<br>")}</dd>`,
        )
        .join("")}
    </dl>`;
  /* Kotak ini hanya membaca: tombol Simpan disembunyikan dan "Batal"
     diganti "Tutup" — tidak ada yang dibatalkan. */
  $("#promptOk").classList.add("d-none");
  const batal = $("#promptModal .modal-footer .btn-quiet");
  const teksBatal = batal.textContent;
  batal.textContent = t("a.tutup");
  const modal = bootstrap.Modal.getOrCreateInstance($("#promptModal"));
  $("#promptModal").addEventListener(
    "hidden.bs.modal",
    () => {
      $("#promptOk").classList.remove("d-none");
      batal.textContent = teksBatal;
    },
    { once: true },
  );
  modal.show();
}

/* Ketikan di kotak cari: ditunda 300ms supaya tiap huruf tidak
   memanggil database. Di tab Summary datanya sudah termuat semua, jadi
   cukup menyaring ulang di tempat -- tanpa memuat ulang. */
let dnCariTunda = null;
document.addEventListener("input", (e) => {
  if (!e.target || e.target.id !== "docNumSearch") return;
  clearTimeout(dnCariTunda);
  dnCariTunda = setTimeout(() => {
    docNumCari = e.target.value.trim();
    if (docNumActiveTab === "fund" && typeof FSUM_TAB !== "undefined" && docNumHistorySub === FSUM_TAB) {
      if (typeof fsumGambarHasil === "function") fsumGambarHasil();
      return;
    }
    docNumPage = 1;
    renderDocNumHistory();
  }, 300);
});

document.addEventListener("change", (e) => {
  if (!e.target || e.target.id !== "docNumBayar") return;
  docNumSaringBayar = e.target.value;
  docNumPage = 1;
  renderDocNumHistory();
});
