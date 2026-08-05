"use strict";

/* PROGRES DOKUMEN PER PENGIRIMAN

   Tujuh berkas yang harus terkumpul sebelum barang bisa dikeluarkan.
   Tiap tahap hanya berpindah setelah pengguna mengonfirmasi — tidak
   ada yang ditebak dari data lain.

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
const DOC_STEPS_IMPORT = [
  { key: "cipl", label: "CI/PL", full: "Commercial Invoice & Packing List" },
  { key: "bl", label: blLabel, full: blFull },
  { key: "coo", label: "COO", full: "Certificate of Origin", optional: true },
  { key: "manifest", label: "Manifest", full: "Manifest (BC 1.1)" },
  /* KEDATANGAN — satu-satunya tahap yang bukan berkas.

     Ditambahkan karena mesin prediksi butuh tahu KAPAN alat angkut
     benar-benar tiba, dan tidak ada dokumen yang bisa menjawab itu
     dengan pasti. Manifest (BC 1.1) diajukan pengangkut sebelum kapal
     sandar, jadi memakainya sebagai bukti kedatangan selalu meleset
     ke arah yang sama — sehari terlalu awal, tiap kali.

     Bagi LCL ini penentu: stripping tidak bisa mulai sebelum kapalnya
     sandar, secepat apa pun dokumennya diurus. */
  { key: "berth", label: berthLabel, full: berthFull },
  { key: "pib", label: "PIB", full: "Pemberitahuan Impor Barang" },
  { key: "billing", label: "Billing", full: "Billing / bukti bayar" },
  { key: "sppb", label: "SPPB", full: "Surat Persetujuan Pengeluaran Barang" },
];

const DOC_STEPS_EXPORT = [
  { key: "cipl", label: "CI/PL", full: "Commercial Invoice & Packing List" },
  { key: "peb", label: "PEB", full: "Pemberitahuan Ekspor Barang" },
  { key: "npe", label: "NPE", full: "Nota Pelayanan Ekspor" },
  { key: "bl", label: blLabel, full: blFull },
  { key: "manifest", label: "Manifest", full: "Manifest (BC 1.1)" },
  { key: "coo", label: "COO", full: "Certificate of Origin", optional: true },
  {
    key: "fumigasi",
    label: "Fumigasi",
    full: "Sertifikat Fumigasi & ISPM-15",
    optional: true,
  },
  { key: "tally", label: "Tally", full: "Tally sheet (hitung fisik saat muat)" },
];

/* Kedatangan alat angkut. Untuk laut istilahnya "Sandar"; untuk udara
   tidak ada padanan yang lazim dipakai orang lapangan, jadi dipakai
   ATA apa adanya. */
function berthLabel(s) {
  return s && s.transport === "udara" ? "ATA" : "Berths";
}
function berthFull(s) {
  return s && s.transport === "udara"
    ? "Pesawat tiba di bandara tujuan (ATA)"
    : "Kapal sandar di pelabuhan tujuan / berths (ATA)";
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
function docStepsFor(s) {
  if ((s && s.mode) === "export") return DOC_STEPS_EXPORT;

  const tanpaAta = DOC_STEPS_IMPORT.filter((x) => x.key !== "berth");
  const ata = DOC_STEPS_IMPORT.find((x) => x.key === "berth");
  const iSppb = tanpaAta.findIndex((x) => x.key === "sppb");
  if (!ata || iSppb < 0) return DOC_STEPS_IMPORT;
  return [...tanpaAta.slice(0, iSppb + 1), ata, ...tanpaAta.slice(iSppb + 1)];
}

/* Teks tahap bisa berupa fungsi (label dinamis) atau string biasa. */
function stepText(nilai, s) {
  return typeof nilai === "function" ? nilai(s) : nilai;
}

function docProgressOf(s) {
  const p = s && s.docProgress;
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}

/* Tahap paling awal yang BELUM terisi — dipakai sebagai saran, bukan
   syarat. Kalau semuanya sudah terisi, hasilnya -1. */
function docNextIndex(s) {
  const p = docProgressOf(s);
  return docStepsFor(s).findIndex((st) => !p[st.key]);
}

/* Tahap yang dilewati tidak dihitung sebagai "terkumpul", dan tidak
   ikut menambah penyebut — berkasnya memang tidak ada dalam pengiriman
   ini. Jadi 3/6, bukan 3/7 atau 4/7. */
function docStepCount(s) {
  const p = docProgressOf(s);
  let selesai = 0;
  let berlaku = 0;
  docStepsFor(s).forEach((st) => {
    const e = p[st.key];
    if (e && e.skipped) return;
    berlaku++;
    if (e) selesai++;
  });
  return { selesai, berlaku };
}

function docStepHtml(s) {
  const p = docProgressOf(s);
  const berikut = docNextIndex(s);

  const langkah = docStepsFor(s).map((st, i) => {
    const entri = p[st.key];
    const dilewati = !!(entri && entri.skipped);
    const sudah = !!entri && !dilewati;
    const kini = i === berikut;
    const cap = entri && entri.at ? fmtNoteStamp(entri.at) : "";
    const judul = dilewati
      ? `${stepText(st.full, s)} — ditandai tidak dipakai ${cap}`
      : sudah
        ? `${stepText(st.full, s)} — dikonfirmasi ${cap}${entri.by ? " oleh " + entri.by : ""}`
        : kini
          ? `${stepText(st.full, s)} — klik kalau berkasnya sudah ada${st.optional ? " (atau tandai tidak dipakai)" : ""}`
          : `${st.full} — menunggu tahap sebelumnya`;

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

  return `
  <div class="docsteps">
    <div class="docsteps-head">
      <span><i class="bi bi-files"></i> Progres Dokumen</span>
      <span class="docsteps-count">${docStepCount(s).selesai} / ${docStepCount(s).berlaku}</span>
    </div>
    <div class="docsteps-track">${langkah}</div>
  </div>`;
}

/* ------------------------------------------------------------------
   KONFIRMASI

   Menekan tahap BERIKUTNYA menandainya selesai. Menekan tahap yang
   sudah selesai membatalkannya — beserta seluruh tahap sesudahnya,
   karena urutan ini berantai: kalau PIB dibatalkan, Billing dan SPPB
   yang bergantung padanya tidak mungkin masih sah.
------------------------------------------------------------------ */
async function toggleDocStep(id, stepKey) {
  if (!requireEdit()) return;
  const s = currentList().find((x) => x.id === id);
  if (!s) return;

  const DAFTAR = docStepsFor(s);
  const idx = DAFTAR.findIndex((x) => x.key === stepKey);
  if (idx < 0) return;
  const progres = { ...docProgressOf(s) };
  const st = DAFTAR[idx];

  if (progres[stepKey]) {
    /* HANYA tahap ini yang dibatalkan, bukan tahap-tahap sesudahnya.

       Menghapus yang sesudahnya baru masuk akal kalau pengisiannya
       dipaksa berurutan — dan di sini tidak: PIB bisa saja dibetulkan
       sementara SPPB memang sudah benar-benar di tangan. Membuangnya
       berarti membuang catatan yang sah. */
    showConfirm(`Batalkan konfirmasi ${stepText(st.label, s)}?`, () => {
      const tanpa = { ...progres };
      delete tanpa[stepKey];
      simpanDocStep(s, tanpa);
    }, {
      title: "Batalkan Tahap Dokumen",
      confirmText: "Ya, Batalkan",
      tone: "primary",
      icon: "bi-arrow-counterclockwise",
    });
    return;
  }

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
      title: `Konfirmasi ${stepText(st.label, s)}`,
      desc: `${stepText(st.full, s)}. Isi tanggal yang tertera pada dokumennya — tanggal inilah yang dipakai mesin prediksi.`,
      icon: "bi-calendar-check",
      okText: "Simpan",
      fields: [
        {
          key: "tanggal",
          label: `Tanggal ${stepText(st.label, s)}`,
          type: "date",
          value: todayISO(),
          hint: "Kosongkan kalau tanggal dokumennya belum diketahui — hari ini yang dipakai.",
        },
      ],
      onSubmit: (v) => {
        simpanDocStep(s, {
          ...progres,
          [stepKey]: {
            at: new Date().toISOString(),
            by: penggunaSekarang(),
            date: v.tanggal || todayISO(),
          },
        });
        return true;
      },
    });
    return;
  }

  /* Tahap yang boleh dilewati diberi PILIHAN, bukan konfirmasi
     ya/tidak — pengguna harus bisa menyatakan "dokumen ini memang
     tidak ada untuk pengiriman ini". */
  if (st.optional) {
    showPrompt({
      title: `Tahap ${stepText(st.label, s)}`,
      desc: `${stepText(st.full, s)}. Tandai sudah diterima, atau nyatakan tidak dipakai untuk pengiriman ini.`,
      icon: "bi-patch-question",
      okText: "Simpan",
      fields: [
        {
          key: "pilih",
          label: "Status dokumen",
          type: "select",
          value: "ada",
          options: [
            { value: "ada", label: "Sudah diterima" },
            { value: "lewati", label: "Tidak dipakai — lewati tahap ini" },
          ],
        },
      ],
      onSubmit: (v) => {
        simpanDocStep(s, {
          ...progres,
          [stepKey]: {
            at: new Date().toISOString(),
            by: penggunaSekarang(),
            ...(v.pilih === "lewati" ? { skipped: true } : {}),
          },
        });
        return true;
      },
    });
    return;
  }

  showConfirm(
    `Konfirmasi bahwa berkas ${stepText(st.full, s)} sudah diterima?`,
    () =>
      simpanDocStep(s, {
        ...progres,
        [stepKey]: { at: new Date().toISOString(), by: penggunaSekarang() },
      }),
    {
      title: `Konfirmasi ${stepText(st.label, s)}`,
      confirmText: "Ya, Sudah Ada",
      tone: "primary",
      icon: "bi-check2-circle",
    },
  );
}

/* Tahap ini termasuk milestone prediksi atau bukan.

   Hanya berlaku di buku Import: mesin prediksi memang khusus jadwal
   import, dan meminta "tanggal dokumen" pada tahap Export hanya akan
   menambah langkah tanpa ada yang memakainya. */
function predictionMilestoneForStep(stepKey, s) {
  if (typeof PREDICTION_CONFIG === "undefined") return null;
  if (typeof predictionAppliesTo === "function" && !predictionAppliesTo(s)) {
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
        ? "Kolom doc_progress belum ada. Jalankan ulang schema-migration.sql."
        : "Gagal menyimpan progres dokumen.",
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
    `Progres dokumen: ${c.selesai}/${c.berlaku}.${pesanPrediksi}`,
    "success",
  );
}
