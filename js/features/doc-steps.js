"use strict";

/* PROGRES DOKUMEN PER PENGIRIMAN

   Berkas yang harus terkumpul sebelum barang bisa dikeluarkan. Tiap
   tahap hanya berpindah setelah pengguna mengonfirmasi — tidak ada yang
   ditebak dari data lain — dan saat dikonfirmasi ditanyakan TANGGAL
   DITERIMA berkasnya. Tanggal itu yang tampil di tooltip, bukan waktu
   tombolnya ditekan: berkas yang datang Jumat dan dicentang Senin tetap
   tercatat diterima Jumat.

   URUTAN TAMPILAN TETAP, URUTAN PENGISIAN BEBAS.

   Deretannya digambar menurut alur kepabeanan yang baku supaya mudah
   dibaca sekilas dan sama di semua pengiriman. Tapi berkasnya tidak
   selalu datang berurutan — forwarder kerap mengirim COO belakangan,
   atau AWB menyusul setelah Manifest. Karena itu tahap mana pun boleh
   dikonfirmasi kapan pun.

   Tahap paling awal yang belum terisi tetap ditandai sebagai SARAN
   (cincin kuningan) — penunjuk arah, bukan penghalang.

   Alasan tidak diotomatiskan: keberadaan sebuah kolom di aplikasi
   tidak sama dengan berkasnya sudah di tangan. No. Aju bisa sudah
   diketik sementara PIB-nya belum terbit. Menandainya otomatis akan
   membuat papan ini berbohong pada hari yang paling genting. */

/* ------------------------------------------------------------------
   DAFTAR TAHAP — berbeda antara Import & Export

   Alur berkasnya memang tidak sama. Import berakhir di SPPB (izin
   keluar dari kawasan pabean); Export berakhir di Tally (hitung fisik
   saat muat). Karena itu dua daftar, bukan satu yang dipaksakan.

   Label AWB/BL ditulis sebagai fungsi, bukan teks mati: yang benar
   tergantung moda pengangkutnya — AWB untuk udara, B/L untuk laut.
------------------------------------------------------------------ */
/* E-COO -- COO elektronik. Datangnya terpisah dari lembar COO, jadi
   tahap sendiri tepat sesudahnya, di kedua buku. `induk: "coo"`: kalau
   COO ditandai tidak dipakai, E-COO ikut tidak dipakai (strip) dengan
   sendirinya; kalau COO DITERIMA, E-COO tidak ikut terisi -- ia
   dikonfirmasi sendiri saat memang sudah ada. Lihat docStepEntri(). */
const DOC_STEP_ECOO = {
  key: "ecoo",
  label: "E-COO",
  full: () => tt("Certificate of Origin elektronik (E-COO)", "Electronic Certificate of Origin (E-COO)"),
  optional: true,
  induk: "coo",
};

const DOC_STEPS_IMPORT = [
  { key: "cipl", label: "CI/PL", full: "Commercial Invoice & Packing List" },
  { key: "bl", label: blLabel, full: blFull },
  { key: "coo", label: "COO", full: "Certificate of Origin", optional: true },
  DOC_STEP_ECOO,
  { key: "manifest", label: "Manifest", full: "Manifest (BC 1.1)" },
  /* KEDATANGAN — satu-satunya tahap yang bukan berkas.

     Ditambahkan karena mesin prediksi butuh tahu KAPAN alat angkut
     benar-benar tiba, dan tidak ada dokumen yang bisa menjawab itu
     dengan pasti. Manifest (BC 1.1) diajukan pengangkut sebelum kapal
     sandar, jadi memakainya sebagai bukti kedatangan selalu meleset
     ke arah yang sama — sehari terlalu awal, tiap kali.

     Bagi LCL ini penentu: stripping tidak bisa mulai sebelum kapalnya
     sandar, secepat apa pun dokumennya diurus.

     `peristiwa`: bukan berkas yang "diterima" -- tooltip & kotak
     isiannya cukup menyebut tanggalnya. */
  { key: "berth", label: berthLabel, full: berthFull, peristiwa: true },
  /* `full` berupa FUNGSI, bukan teks: daftar ini dibuat sekali saat
     halaman dimuat. Teks biasa -- termasuk hasil t() -- akan terkunci
     di bahasa saat itu, dan ganti bahasa tidak lagi mengubahnya.
     stepText() memanggil fungsinya saat ditampilkan. */
  { key: "pib", label: "PIB", full: () => t("c.pemberitahuan.impor.barang") },
  { key: "billing", label: "Billing", full: () => tt("Billing / bukti bayar", "Billing / proof of payment") },
  { key: "sppb", label: "SPPB", full: () => tt("Surat Persetujuan Pengeluaran Barang", "Goods Release Approval (SPPB)") },
];

const DOC_STEPS_EXPORT = [
  { key: "cipl", label: "CI/PL", full: "Commercial Invoice & Packing List" },
  { key: "peb", label: "PEB", full: () => t("c.pemberitahuan.ekspor.barang") },
  { key: "npe", label: "NPE", full: () => tt("Nota Pelayanan Ekspor", "Export Service Note (NPE)") },
  { key: "bl", label: blLabel, full: blFull },
  { key: "manifest", label: "Manifest", full: "Manifest (BC 1.1)" },
  { key: "coo", label: "COO", full: "Certificate of Origin", optional: true },
  DOC_STEP_ECOO,
  {
    key: "fumigasi",
    label: () => tt("Fumigasi", "Fumigation"),
    full: () => tt("Sertifikat Fumigasi & ISPM-15", "Fumigation & ISPM-15 Certificate"),
    optional: true,
  },
  { key: "tally", label: "Tally", full: () => tt("Tally sheet (hitung fisik saat muat)", "Tally sheet (physical count at loading)") },
  /* BERANGKAT — seperti Berths/ATA di buku Import, ini tahap yang
     bukan berkas: tanggal kapal/pesawat benar-benar meninggalkan
     pelabuhan muat.

     Ditaruh PALING AKHIR karena memang kejadian terakhir yang masih
     diurus tim EXIM; sesudahnya barang dalam perjalanan. Tally
     (hitung fisik saat muat) mendahuluinya: barang dihitung dulu,
     baru alat angkutnya berangkat. */
  { key: "sailing", label: sailingLabel, full: sailingFull, peristiwa: true },
];

/* Keberangkatan alat angkut. Istilahnya berbeda per moda, sama
   seperti B/L vs AWB dan Berths vs ATA.

   UDARA MEMAKAI "ATD", bukan "Sailing": kapal berlayar, pesawat tidak.
   ATD dipilih karena ia pasangan langsung dari "ATA" yang sudah
   dipakai tahap kedatangan pada kiriman udara di buku Import -- satu
   pasang istilah yang sudah dikenal tim, bukan istilah ketiga yang
   harus dihafal. Padanan lain yang lazim di angkutan udara: "Flown",
   "Uplift", atau "Departure"; ketiganya sama-sama benar, tapi tidak
   berpasangan dengan ATA. */
function sailingLabel(s) {
  return s && s.transport === "udara" ? "ATD" : "Sailing";
}
function sailingFull(s) {
  return s && s.transport === "udara"
    ? tt("Pesawat berangkat dari bandara muat (ATD)", "Aircraft departed from the origin airport (ATD)")
    : tt("Kapal berangkat dari pelabuhan muat (ATD)", "Vessel departed from the port of loading (ATD)");
}

/* Kedatangan alat angkut. Untuk laut istilahnya "Sandar"; untuk udara
   tidak ada padanan yang lazim dipakai orang lapangan, jadi dipakai
   ATA apa adanya. */
function berthLabel(s) {
  return s && s.transport === "udara" ? "ATA" : "Berths";
}
function berthFull(s) {
  return s && s.transport === "udara"
    ? tt("Pesawat tiba di bandara tujuan (ATA)", "Aircraft arrived at the destination airport (ATA)")
    : tt("Kapal sandar di pelabuhan tujuan / berths (ATA)", "Vessel berthed at the destination port (ATA)");
}

/* Label & nama panjang B/L mengikuti moda pengangkut. */
function blLabel(s) {
  return s && s.transport === "udara" ? "AWB" : "B/L";
}
function blFull(s) {
  return s && s.transport === "udara"
    ? "Air Waybill"
    : "Bill of Lading";
}

/* Daftar tahap milik SEBUAH pengiriman — dibaca dari mode pengiriman
   itu sendiri, bukan dari buku yang sedang dibuka. Kalau tidak,
   pencarian cepat yang membuka pengiriman Export dari buku Import akan
   menggambar tahap yang salah. */
/* Urutan TAMPILAN tahap dokumen.

   Kedatangan (Berths / ATA) ditaruh SETELAH SPPB untuk kedua moda.
   Dokumen kerap rampung sebelum alat angkutnya tiba — PIB diajukan,
   billing dibayar, bahkan SPPB terbit lebih dulu, baik pada kiriman
   udara maupun laut. Menampilkannya di tengah membuat stepper terlihat
   melompat-lompat padahal urutannya wajar.

   Ini hanya urutan gambar. Urutan pengisiannya tetap bebas, dan mesin
   prediksi tidak membaca posisi ini sama sekali: kedatangan
   diperlakukan sebagai GERBANG, bukan anak tangga. */
function docStepsForDasar(s) {
  if ((s && s.mode) === "export") return DOC_STEPS_EXPORT;

  const tanpaAta = DOC_STEPS_IMPORT.filter((x) => x.key !== "berth");
  const ata = DOC_STEPS_IMPORT.find((x) => x.key === "berth");
  const iSppb = tanpaAta.findIndex((x) => x.key === "sppb");
  if (!ata || iSppb < 0) return DOC_STEPS_IMPORT;
  return [...tanpaAta.slice(0, iSppb + 1), ata, ...tanpaAta.slice(iSppb + 1)];
}

/* Kurir ekspres (FedEx/DHL/UPS — lihat isKurirEkspres() di bawah)
   tidak menerbitkan Manifest BC 1.1: proses kepabeanannya sendiri
   terintegrasi, apa pun nilai kirimannya. Beda dari isKurirNilaiRendah()
   di bawah, yang di bawah USD 1.500 menyembunyikan SELURUH balok
   karena rezimnya CN (bukan PIB sama sekali) — ini cuma tahap
   Manifest-nya saja yang dibuang, berlaku pada kiriman kurir berapa
   pun nilainya dan pada Import maupun Export (isKurirEkspres() dibaca
   dari daftar KURIR_EKSPRES_TANPA_PIB, definisi "kurir" untuk kedua
   keperluan ini sengaja sama). */
function docStepsFor(s) {
  const dasar = docStepsForDasar(s);
  if (!pakaiKurirEkspres(s)) return dasar;
  return dasar.filter((x) => x.key !== "manifest");
}

/* Teks tahap bisa berupa fungsi (label dinamis) atau string biasa. */
function stepText(nilai, s) {
  return typeof nilai === "function" ? nilai(s) : nilai;
}

function docProgressOf(s) {
  const p = s && s.docProgress;
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}

/* Entri sebuah tahap SEPERTI YANG BERLAKU -- satu-satunya tempat yang
   menimbang aturan induk, dipakai stepper, hitungan, saran berikutnya,
   dan daftar "berkas belum ada" (missingDocs, board.js).

   Tahap ber-`induk` (E-COO -> COO) ikut DILEWATI selama induknya
   ditandai tidak dipakai: tanpa COO tidak ada E-COO. Diturunkan, bukan
   disimpan -- membatalkan "tidak dipakai" di COO langsung mengembalikan
   E-COO ke keadaannya semula. Selain itu tahapnya berdiri sendiri: COO
   yang diterima TIDAK membuat E-COO ikut terisi. */
function docStepEntri(s, st) {
  const p = docProgressOf(s);
  const induk = st.induk && p[st.induk];
  if (induk && induk.skipped) return { skipped: true, ikutInduk: true };
  return p[st.key] || null;
}

/* Tahap paling awal yang BELUM terisi — dipakai sebagai saran, bukan
   syarat. Kalau semuanya sudah terisi, hasilnya -1. */
function docNextIndex(s) {
  return docStepsFor(s).findIndex((st) => !docStepEntri(s, st));
}

/* Tahap yang dilewati tidak dihitung sebagai "terkumpul", dan tidak
   ikut menambah penyebut — berkasnya memang tidak ada dalam pengiriman
   ini. Jadi 3/6, bukan 3/7 atau 4/7. */
function docStepCount(s) {
  let selesai = 0;
  let berlaku = 0;
  docStepsFor(s).forEach((st) => {
    const e = docStepEntri(s, st);
    if (e && e.skipped) return;
    berlaku++;
    if (e) selesai++;
  });
  return { selesai, berlaku };
}

/* TOOLTIP TAHAP: TANGGAL DITERIMA, bukan waktu konfirmasi.

   `date` = tanggal yang diisi saat mengonfirmasi (berkas: tanggal
   diterima; Manifest/PIB/Billing/SPPB: tanggal dokumen yang juga
   dipakai prediksi; Berths/ATA & Sailing/ATD: tanggal kejadiannya).
   Entri lama yang dicatat sebelum tanggal itu ditanyakan hanya punya
   waktu konfirmasi -- ditulis apa adanya sebagai "dikonfirmasi", tidak
   disamarkan jadi tanggal diterima. */
function docStepJudul(s, st, entri, kini) {
  const nama = stepText(st.full, s);
  if (entri && entri.skipped) {
    if (entri.ikutInduk) {
      const induk = docStepsFor(s).find((x) => x.key === st.induk);
      const namaInduk = induk ? stepText(induk.label, s) : st.induk;
      return tt(`${nama} — tidak dipakai, mengikuti ${namaInduk}`, `${nama} — not used, follows ${namaInduk}`);
    }
    return tt(`${nama} — tidak dipakai untuk pengiriman ini`, `${nama} — not used for this shipment`);
  }
  if (entri) {
    const by = entri.by || "";
    if (entri.date) {
      const tgl = fmtDate(entri.date);
      const oleh = by ? tt(` · dicatat oleh ${by}`, ` · recorded by ${by}`) : "";
      return st.peristiwa
        ? `${nama} — ${tgl}${oleh}`
        : tt(`${nama} — diterima ${tgl}${oleh}`, `${nama} — received ${tgl}${oleh}`);
    }
    const belum = st.peristiwa
      ? tt("tanggalnya belum dicatat", "date not recorded")
      : tt("tanggal diterima belum dicatat", "date received not recorded");
    if (!entri.at) return `${nama} — ${belum}`;
    const stempel = fmtNoteStamp(entri.at);
    return by
      ? tt(`${nama} — ${belum} (dikonfirmasi ${stempel} oleh ${by})`, `${nama} — ${belum} (confirmed ${stempel} by ${by})`)
      : tt(`${nama} — ${belum} (dikonfirmasi ${stempel})`, `${nama} — ${belum} (confirmed ${stempel})`);
  }
  /* stepText(), BUKAN st.full langsung.

     Nama panjang sebagian tahap berupa FUNGSI — ia menyesuaikan moda
     ("Bill of Lading" vs "Air Waybill"). Ditempel apa adanya ke
     template, fungsinya diubah jadi string dan tooltip menampilkan
     kode sumber JavaScript. */
  if (kini) return t("x.klik.kalau.berkasnya.ada", { x: nama, opsional: st.optional ? t("x.atau.tandai.tidak.dipakai") : "" });
  return tt(`${nama} — menunggu tahap sebelumnya`, `${nama} — waiting for the previous step`);
}

/* ------------------------------------------------------------------
   KIRIMAN KURIR EKSPRES BERNILAI RENDAH — TIDAK PAKAI PIB

   Kiriman lewat kurir ekspres yang nilainya di bawah USD 1.500
   diselesaikan dengan Consignment Note, bukan PIB. Tidak ada Manifest
   BC 1.1, tidak ada No. Aju, tidak ada SPPB — jadi deretan tahap yang
   menuju ke sana tidak punya arti apa pun untuk kiriman itu, dan
   tujuh lingkaran yang tidak akan pernah terisi cuma membuat papan ini
   terbaca seperti ada berkas yang tertinggal.

   HANYA TIGA PERUSAHAAN INI, bukan seluruh CARRIER_MASTER.couriers.

   Daftar kurir di carrier-master juga memuat PRIME, WIDE, dan TNT.
   PRIME & WIDE adalah forwarder lokal yang di riwayat DDI dipakai
   untuk kiriman LAUT biasa — WIDE muncul sebagai forwarder pada
   kiriman LCL dengan kapal SAWASDEE ALTAIR. Memakai daftar itu apa
   adanya akan menghapus progres dokumen dari kiriman laut yang
   PIB-nya justru sedang berjalan.

   Yang menghapus kewajiban PIB adalah rezim CN pada kurir ekspres
   terintegrasi, bukan kata "kurir" di daftar pengangkut.

   HANYA IMPORT. Ambang USD 1.500 itu batas PIB/CN pada jalur impor;
   ekspor tetap butuh PEB berapa pun nilainya.

   Ambangnya PERSIS di bawah 1.500 — nilai tepat 1.500 masih wajib PIB.

   Nilai barang saja, tanpa freight & asuransi: ambang CN dihitung dari
   harga barang, bukan dari nilai pabean.
------------------------------------------------------------------ */
const AMBANG_KURIR_TANPA_PIB = 1500;
const KURIR_EKSPRES_TANPA_PIB = ["FEDEX", "FEDERAL EXPRESS", "DHL", "UPS"];

function isKurirEkspres(teks) {
  const kata = " " + String(teks || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim() + " ";
  if (kata.trim() === "") return false;
  /* Kata UTUH: "UPS" tidak boleh cocok dengan "UPSTREAM", dan nama
     kapal "DHL AIR" tetap terbaca sebagai kurir. */
  return KURIR_EKSPRES_TANPA_PIB.some((n) => kata.indexOf(" " + n + " ") >= 0);
}

function isKurirNilaiRendah(s) {
  if (!s || s.mode !== "import") return false;
  /* Dibaca dari kolom Forwarder MAUPUN Nama Kapal: pada kiriman kurir
     keduanya kerap berisi hal yang sama ("FEDEX" / "FEDEX PRIORITY"),
     tapi tidak selalu — ada yang hanya mengisi salah satunya. */
  if (!isKurirEkspres(s.forwarder) && !isKurirEkspres(s.vessel)) return false;
  const nilai = itemTotals(s).totalUSD;
  /* Nilai 0 berarti harga barang BELUM DIISI, bukan kiriman gratis.
     Menyembunyikan stepper karena kolom yang masih kosong akan
     menghilangkan progres dokumen tepat pada pengiriman yang baru
     dibuat — saat papan ini justru paling dibutuhkan. */
  if (!nilai) return false;
  return nilai < AMBANG_KURIR_TANPA_PIB;
}

/* Sama seperti pemeriksaan Forwarder/Nama Kapal di isKurirNilaiRendah()
   di atas, tapi TANPA syarat nilai atau moda — dipakai docStepsFor()
   untuk membuang tahap Manifest saja (lihat komentar di sana). */
function pakaiKurirEkspres(s) {
  if (!s) return false;
  return isKurirEkspres(s.forwarder) || isKurirEkspres(s.vessel);
}

function docStepHtml(s) {
  /* Kiriman kurir bernilai rendah tidak lewat PIB — lihat
     isKurirNilaiRendah(). Diperiksa PALING DULU, sebelum tahap apa pun
     dihitung: yang disembunyikan seluruh baloknya, bukan lingkarannya
     saja. */
  if (isKurirNilaiRendah(s)) return "";

  const berikut = docNextIndex(s);

  const langkah = docStepsFor(s).map((st, i) => {
    const entri = docStepEntri(s, st);
    const dilewati = !!(entri && entri.skipped);
    const sudah = !!entri && !dilewati;
    const kini = i === berikut;
    const judul = docStepJudul(s, st, entri, kini);

    const isi = dilewati
      ? "–"
      : sudah
        ? '<i class="bi bi-check-lg"></i>'
        : i + 1;

    return `
      <button type="button"
        class="docstep${sudah ? " is-done" : ""}${dilewati ? " is-skipped" : ""}${kini ? " is-next" : ""}"
        data-action="docStep" data-id="${s.id}" data-step="${st.key}"
        title="${escapeAttr(judul)}">
        <span class="docstep-dot">${isi}</span>
        <span class="docstep-label">${escapeHtml(stepText(st.label, s))}</span>
      </button>`;
  }).join('<span class="docstep-line"></span>');

  /* VIEWER TIDAK MELIHAT STEPPER INI SAMA SEKALI.

     Tiap tahap di sini adalah TOMBOL — satu klik mengubah progres
     dokumen. Bagi akun yang memang tidak boleh mengubah apa pun,
     menampilkannya cuma menyodorkan tombol yang akan ditolak: ia
     mengundang klik, lalu menjawabnya dengan penolakan.

     Yang disembunyikan seluruh baloknya, bukan tombolnya saja.
     Menyisakan judul "Progres Dokumen" dengan isi kosong justru
     terbaca seperti data yang gagal dimuat. */
  if (typeof canEdit === "function" && !canEdit()) return "";

  return `
  <div class="docsteps">
    <div class="docsteps-head">
      <span><i class="bi bi-files"></i> ${tt("Progres Dokumen", "Document Progress")}</span>
      <span class="docsteps-count">${docStepCount(s).selesai} / ${docStepCount(s).berlaku}</span>
    </div>
    <div class="docsteps-track">${langkah}</div>
  </div>`;
}

/* ------------------------------------------------------------------
   KONFIRMASI

   Menekan tahap yang belum terisi menanyakan TANGGAL DITERIMA-nya
   (bawaan hari ini) lalu menandainya selesai. Menekan tahap yang sudah
   terisi membatalkannya -- HANYA tahap itu (lihat di bawah).
------------------------------------------------------------------ */

/* Isian tanggal diterima: bawaan hari ini, tidak boleh kosong, tidak
   boleh sesudah hari ini (berkas yang belum datang belum diterima). */
function docIsianTanggal(st, s) {
  return {
    key: "tanggal",
    label: st.peristiwa
      ? tt(`Tanggal ${stepText(st.label, s)}`, `${stepText(st.label, s)} date`)
      : tt("Tanggal diterima", "Date received"),
    type: "date",
    value: todayISO(),
    max: todayISO(),
  };
}
function docPeriksaTanggal(tanggal) {
  if (!tanggal) return tt("Tanggal wajib diisi.", "The date is required.");
  if (tanggal > todayISO()) return tt("Tanggal tidak boleh sesudah hari ini.", "The date cannot be later than today.");
  return "";
}

async function toggleDocStep(id, stepKey) {
  if (!requireEdit()) return;
  const s = currentList().find((x) => x.id === id);
  if (!s) return;

  const st = docStepsFor(s).find((x) => x.key === stepKey);
  if (!st) return;
  const progres = { ...docProgressOf(s) };
  const label = stepText(st.label, s);

  /* Tahap yang ikut induknya tidak dipakai (E-COO saat COO ditandai
     tidak dipakai) tidak punya keadaan sendiri untuk diubah -- yang
     diubah tahap induknya. */
  const entri = docStepEntri(s, st);
  if (entri && entri.ikutInduk) {
    const induk = docStepsFor(s).find((x) => x.key === st.induk);
    const namaInduk = induk ? stepText(induk.label, s) : st.induk;
    showToast(
      tt(
        `${label} mengikuti ${namaInduk} yang ditandai tidak dipakai. Ubah tahap ${namaInduk} dulu kalau ternyata dipakai.`,
        `${label} follows ${namaInduk}, which is marked as not used. Change the ${namaInduk} step first if it is used after all.`,
      ),
      "info",
    );
    return;
  }

  if (progres[stepKey]) {
    /* HANYA tahap ini yang dibatalkan, bukan tahap-tahap sesudahnya.

       Menghapus yang sesudahnya baru masuk akal kalau pengisiannya
       dipaksa berurutan — dan di sini tidak: PIB bisa saja dibetulkan
       sementara SPPB memang sudah benar-benar di tangan. Membuangnya
       berarti membuang catatan yang sah. */
    showConfirm(tt(`Batalkan konfirmasi ${label}?`, `Cancel the ${label} confirmation?`), () => {
      const tanpa = { ...progres };
      delete tanpa[stepKey];
      simpanDocStep(s, tanpa);
    }, {
      title: t("c.batalkan.tahap.dokumen"),
      confirmText: tt("Ya, Batalkan", "Yes, cancel"),
      tone: "primary",
      icon: "bi-arrow-counterclockwise",
    });
    return;
  }

  const catat = (tambahan) =>
    simpanDocStep(s, {
      ...progres,
      [stepKey]: { at: new Date().toISOString(), by: penggunaSekarang(), ...tambahan },
    });

  /* ------------------------------------------------------------------
     TAHAP YANG MENGGERAKKAN PREDIKSI

     Manifest, PIB, dan SPPB bukan sekadar centang: tanggalnya dipakai
     mesin prediksi sebagai titik mulai hitungan berikutnya. Karena itu
     yang ditanyakan tanggal DOKUMEN, bukan sekadar "ya, sudah ada".

     Tanggal konfirmasi tidak bisa menggantikannya. SPPB terbit Jumat
     sore lalu dicentang Senin pagi akan menggeser seluruh perkiraan
     dua hari terlalu jauh — tiap kali, ke arah yang sama.

     Daftar tahapnya dibaca dari konfigurasi, bukan ditulis di sini.
  ------------------------------------------------------------------ */
  const milestone = predictionMilestoneForStep(stepKey, s);
  if (milestone) {
    showPrompt({
      title: t("x.konfirmasi.tahap", { x: label }),
      desc: t("x.isi.tanggal.dokumen", { x: stepText(st.full, s) }),
      icon: "bi-calendar-check",
      okText: tt("Simpan", "Save"),
      fields: [
        {
          key: "tanggal",
          label: tt(`Tanggal ${label}`, `${label} date`),
          type: "date",
          value: todayISO(),
          hint: t("s.kosongkan.kalau.tanggal.dokumennya.belum.diket"),
        },
      ],
      onSubmit: (v) => {
        catat({ date: v.tanggal || todayISO() });
        return true;
      },
    });
    return;
  }

  /* Tahap yang boleh dilewati diberi PILIHAN, bukan konfirmasi
     ya/tidak — pengguna harus bisa menyatakan "dokumen ini memang
     tidak ada untuk pengiriman ini". Tanggal diterima disembunyikan
     selama yang dipilih "tidak dipakai". */
  if (st.optional) {
    showPrompt({
      title: tt(`Tahap ${label}`, `Step: ${label}`),
      desc: t("x.tandai.sudah.diterima", { x: stepText(st.full, s) }),
      icon: "bi-patch-question",
      okText: tt("Simpan", "Save"),
      fields: [
        {
          key: "pilih",
          label: tt("Status dokumen", "Document status"),
          type: "select",
          value: "ada",
          options: [
            { value: "ada", label: tt("Sudah diterima", "Received") },
            { value: "lewati", label: tt("Tidak dipakai — lewati tahap ini", "Not used — skip this step") },
          ],
        },
        docIsianTanggal(st, s),
      ],
      onSubmit: (v) => {
        if (v.pilih === "lewati") {
          catat({ skipped: true });
          return true;
        }
        const galat = docPeriksaTanggal(v.tanggal);
        if (galat) return galat;
        catat({ date: v.tanggal });
        return true;
      },
    });
    const pilih = document.getElementById("prompt_pilih");
    const kotakTanggal = document.getElementById("prompt_tanggal");
    if (pilih && kotakTanggal) {
      pilih.addEventListener("change", () => {
        kotakTanggal.closest(".prompt-field").classList.toggle("d-none", pilih.value === "lewati");
      });
    }
    return;
  }

  showPrompt({
    title: t("x.konfirmasi.tahap", { x: label }),
    desc: st.peristiwa
      ? tt(`${stepText(st.full, s)}? Isi tanggalnya.`, `${stepText(st.full, s)}? Enter the date.`)
      : t("x.konfirmasi.berkas.diterima", { x: stepText(st.full, s) }),
    icon: "bi-check2-circle",
    okText: st.peristiwa ? tt("Simpan", "Save") : tt("Ya, Sudah Ada", "Yes, it's here"),
    fields: [docIsianTanggal(st, s)],
    onSubmit: (v) => {
      const galat = docPeriksaTanggal(v.tanggal);
      if (galat) return galat;
      catat({ date: v.tanggal });
      return true;
    },
  });
}

/* Tahap ini termasuk milestone prediksi atau bukan.

   Hanya berlaku di buku Import: mesin prediksi memang khusus jadwal
   import, dan meminta "tanggal dokumen" pada tahap Export hanya akan
   menambah langkah tanpa ada yang memakainya. */
function predictionMilestoneForStep(stepKey, s) {
  if (typeof PREDICTION_CONFIG === "undefined") return null;
  /* Tetap khusus Import: milestone di sini dokumen pabean impor, dan
     yang memakainya perhitungan Estimated Delivery. */
  if (
    typeof deliveryPredictionAppliesTo === "function" &&
    !deliveryPredictionAppliesTo(s)
  ) {
    return null;
  }
  return (
    (PREDICTION_CONFIG.milestones || []).find(
      (m) => m.step === stepKey && m.asksDate,
    ) || null
  );
}

function penggunaSekarang() {
  const p = authState && authState.profile;
  return (p && (p.username || p.full_name)) || "";
}


async function simpanDocStep(s, progresBaru) {
  const sebelum = s.docProgress;
  s.docProgress = progresBaru; // layar berubah lebih dulu
  render();

  const { error } = await supabaseClient
    .from("shipments")
    .update({ doc_progress: progresBaru })
    .eq("id", s.id);

  if (error) {
    console.error(error);
    s.docProgress = sebelum; // dikembalikan kalau gagal
    render();
    showToast(
      (error.message || "").includes("doc_progress")
        ? t("v.kolom.doc.progress.belum.ada.jalankan.ulang.sc")
        : t("z.gagal.menyimpan.progres.dokumen"),
      "danger",
    );
    return;
  }
  /* Milestone baru = ketidakpastian berkurang. Estimated Delivery
     dihitung ulang di sini, bukan menunggu form dibuka: tahap dokumen
     dikonfirmasi dari kartu, dan angka di kartu yang sama harus ikut
     bergerak pada detik itu juga. */
  let pesanPrediksi = "";
  if (typeof refreshShipmentPrediction === "function") {
    const berubah = await refreshShipmentPrediction(s);
    if (berubah.includes("actual")) {
      const d = predictDelivery(s);
      pesanPrediksi = ` Estimated Delivery → ${fmtDate(s.actual)} (${d.sourceLabel}).`;
    }
  }

  const c = docStepCount(s);
  showToast(
    tt(`Progres dokumen: ${c.selesai}/${c.berlaku}.${pesanPrediksi}`, `Document progress: ${c.selesai}/${c.berlaku}.${pesanPrediksi}`),
    "success",
  );
}
