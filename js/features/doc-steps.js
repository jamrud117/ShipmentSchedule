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
   membuat papan ini berbohong pada hari yang paling genting.
   Satu-satunya pengecualian: berkas pabean resmi yang DIIMPOR ke form
   (draft CEISA / PIB / PEB) -- lihat PROGRES DARI DOKUMEN PABEAN di
   bawah.

   DRAFT DULU, ASLI MENYUSUL. CI/PL, B/L-AWB, Asuransi, COO, Manifest,
   PIB / PEB (dan Fumigasi di Export) biasanya datang sebagai DRAFT untuk
   disetujui, aslinya menyusul. Tahap itu dicentang begitu draftnya
   disetujui -- `bisaDraft` -- dengan status "Draft" (entri `draft: true`):
   dihitung terkumpul, tapi digambar lain dan diingatkan "menunggu asli"
   di Ringkasan sampai statusnya diubah ke Asli. Tanggal draft disimpan
   di `tglDraft` begitu aslinya dicatat. PIB berstatus draft BELUM
   diajukan dan Manifest draft belum menjadi BC 1.1, jadi keduanya bukan
   milestone prediksi (milestoneDateOf melewati entri draft).

   MEKANISME YANG SAMA DIPAKAI untuk dua tahap yang kenyataannya juga
   berjalan dua langkah, dengan kosakatanya sendiri (`kata`, kataTahap):
   Billing -- diterima dulu, dibayar menyusul (draft = belum dibayar) --
   dan Berths / ATA -- jadwal sandar dari forwarder dulu, kejadian aktual
   menyusul (draft = estimasi). Keduanya bukan milestone prediksi selama
   masih draft, jadi billing yang belum dibayar dan estimasi sandar tidak
   menggeser perkiraan siapa pun.

   LAMPIRAN. Tiap tahap berkas bisa membawa berkasnya (`berkas`, lihat
   js/data/lampiran.js) -- draft maupun asli, ditandai versinya. */

/* ------------------------------------------------------------------
   DAFTAR TAHAP — berbeda antara Import & Export

   Alur berkasnya memang tidak sama. Import berakhir di SPPB (izin
   keluar dari kawasan pabean); Export berakhir di Tally (hitung fisik
   saat muat). Karena itu dua daftar, bukan satu yang dipaksakan.

   Label AWB/BL ditulis sebagai fungsi, bukan teks mati: yang benar
   tergantung moda pengangkutnya — AWB untuk udara, B/L untuk laut.
------------------------------------------------------------------ */
/* E-COO -- COO elektronik dari negara asal barang impor. Datangnya
   terpisah dari lembar COO, jadi tahap sendiri tepat sesudahnya -- HANYA
   di buku Import; di Export cukup satu tahap COO (opsional) tanpa
   E-COO. `induk: "coo"`: kalau
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

/* ASURANSI -- hanya kiriman yang incoterm-nya mewajibkan penjual
   mengasuransikan barangnya: CIF (laut) dan padanannya untuk moda apa
   pun, CIP. Polis / sertifikatnya datang seperti berkas pengiriman lain:
   draft lebih dulu, final menyusul. Incoterm lain tidak menggambar
   tahapnya sama sekali (`berlaku`, docStepsFor) -- bukan strip "tidak
   dipakai", karena memang bukan bagian dari kiriman itu. Entri yang
   sudah tercatat tetap tersimpan kalau incoterm-nya diganti; ia muncul
   lagi bila incoterm kembali ke CIF / CIP. */
const INCOTERM_BERASURANSI = ["CIF", "CIP"];
function pakaiAsuransi(s) {
  return INCOTERM_BERASURANSI.indexOf(String((s && s.incoterm) || "").trim().toUpperCase()) >= 0;
}
const DOC_STEP_ASURANSI = {
  key: "asuransi",
  label: () => tt("Asuransi", "Insurance"),
  full: () => tt("Polis / Sertifikat Asuransi", "Insurance Policy / Certificate"),
  bisaDraft: true,
  berlaku: pakaiAsuransi,
};

/* MANIFEST -- draft dari forwarder / pengangkut kerap sampai lebih dulu
   untuk dicek (nama pihak, jumlah koli, berat harus sama dengan B/L-AWB),
   BC 1.1-nya terbit menyusul. Draft dihitung terkumpul; di buku Import
   hanya Manifest final (BC 1.1) yang menjadi bukti kedatangan mesin
   prediksi. */
const DOC_STEP_MANIFEST = {
  key: "manifest",
  label: "Manifest",
  full: "Manifest (BC 1.1)",
  bisaDraft: true,
  keteranganDraft: (nama) =>
    tt(
      `${nama}. Draft dari forwarder dicatat sebagai Draft; begitu BC 1.1 terbit, ubah ke Asli / final dan isi tanggal BC 1.1-nya — tanggal itulah yang dipakai mesin prediksi.`,
      `${nama}. A draft from the forwarder is recorded as Draft; once the BC 1.1 is issued, change it to Original / final and enter the BC 1.1 date — that date is what the prediction engine uses.`,
    ),
};

/* BILLING — billing diterima belum tentu langsung dibayar.

   Kode billing terbit lebih dulu; bayarnya menyusul, sering menunggu
   Pengajuan Dana cair. Karena itu tahap ini mengenal DUA keadaan, dengan
   mekanisme yang sama seperti Draft / Asli (`bisaDraft`):
     - "Billing diterima — belum dibayar" = `draft: true` (tanggal billing
       diterima). Dihitung terkumpul & digambar jam pasir, tapi BELUM
       milestone prediksi (milestoneDateOf melewati entri draft): gerbang
       Billing baru lewat setelah dibayar;
     - "Sudah dibayar" = tanggal bayar, milestone prediksi seperti
       sebelumnya. Entri lama yang tersimpan tanpa status artinya sudah
       dibayar ("Billing / bukti bayar"), jadi maknanya tidak berubah.
   Tanggal billing diterima disimpan di `tglDraft` begitu bayarnya dicatat.

   `kata`: kosakata dua keadaan itu -- satu sumber untuk kotak tahap,
   tooltip, kepala stepper, Ringkasan, dan panel detail (kataTahap()).
   `perluDikejar`: billing yang belum dibayar jadi tugas di Ringkasan. */
const DOC_STEP_BILLING = {
  key: "billing",
  label: "Billing",
  full: () => tt("Billing / bukti bayar", "Billing / proof of payment"),
  bisaDraft: true,
  perluDikejar: true,
  kata: () => ({
    status: tt("Status billing", "Billing status"),
    opsiDraft: tt("Billing diterima — belum dibayar", "Billing received — not paid yet"),
    opsiAsli: tt("Sudah dibayar — bukti bayar ada", "Paid — proof of payment in hand"),
    tglDraft: tt("Tanggal billing diterima", "Billing received date"),
    tglAsli: tt("Tanggal bayar", "Payment date"),
    keadaan: tt("belum dibayar", "not paid yet"),
    detail: tt("belum dibayar", "not paid yet"),
    draftSaat: tt("billing diterima", "billing received"),
    asliSaat: tt("dibayar", "paid"),
    menunggu: tt("menunggu pembayaran", "awaiting payment"),
    begitu: tt("Begitu billingnya dibayar", "Once the billing is paid"),
    baru: (nama) =>
      tt(
        `${nama}. Billing yang baru diterima dicatat sebagai "belum dibayar"; begitu dibayar, ubah ke "sudah dibayar" dan isi tanggal bayarnya — tanggal itulah yang dipakai mesin prediksi.`,
        `${nama}. A billing just received is recorded as "not paid yet"; once it is paid, change it to "paid" and enter the payment date — that date is what the prediction engine uses.`,
      ),
  }),
};

/* SPJM — Surat Pemberitahuan Jalur Merah.

   Terbit hanya kalau PIB-nya jatuh ke JALUR MERAH (pemeriksaan fisik &
   dokumen), sebelum SPPB. Jalur lain tidak punya tahap ini, jadi tahapnya
   BERSYARAT (`berlaku`, disaring docStepsFor() seperti Asuransi): muncul
   begitu jalur Merah dicatat di PIB / Billing / SPPB (docIsianJalur,
   jalurOf), hilang lagi kalau jalurnya dikoreksi. Entri yang sudah
   tercatat TIDAK dihapus saat hilang -- ia muncul kembali bila jalurnya
   kembali Merah. Tahap berkas biasa: tanggal diterima + lampiran. */
function pakaiSpjm(s) {
  return typeof jalurOf === "function" && jalurOf(s) === "merah";
}
const DOC_STEP_SPJM = {
  key: "spjm",
  label: "SPJM",
  full: () => tt("Surat Pemberitahuan Jalur Merah (SPJM)", "Red Lane Notification (SPJM)"),
  berlaku: pakaiSpjm,
};

const DOC_STEPS_IMPORT = [
  { key: "cipl", label: "CI/PL", full: "Commercial Invoice & Packing List", bisaDraft: true },
  { key: "bl", label: blLabel, full: blFull, bisaDraft: true },
  DOC_STEP_ASURANSI,
  { key: "coo", label: "COO", full: "Certificate of Origin", optional: true, bisaDraft: true, petunjuk: (s) => petunjukFtaCoo(s) },
  DOC_STEP_ECOO,
  DOC_STEP_MANIFEST,
  /* KEDATANGAN — satu-satunya tahap yang bukan berkas.

     Ditambahkan karena mesin prediksi butuh tahu KAPAN alat angkut
     benar-benar tiba, dan tidak ada dokumen yang bisa menjawab itu
     dengan pasti. Manifest (BC 1.1) diajukan pengangkut sebelum kapal
     sandar, jadi memakainya sebagai bukti kedatangan selalu meleset
     ke arah yang sama — sehari terlalu awal, tiap kali.

     Bagi LCL ini penentu: stripping tidak bisa mulai sebelum kapalnya
     sandar, secepat apa pun dokumennya diurus.

     `peristiwa`: bukan berkas yang "diterima" -- tooltip & kotak
     isiannya cukup menyebut tanggalnya.

     ESTIMASI ATAU AKTUAL. Jadwal sandar dari forwarder / agen biasanya
     sudah ada jauh sebelum kapalnya benar-benar sandar, dan belum tentu
     tepat. Maka tahap ini mengenal dua keadaan (`bisaDraft`, kosakata di
     kataBerth): "Estimasi" = `draft: true` (tanggalnya boleh ke depan) dan
     "Aktual" = kejadian yang sudah terjadi. HANYA yang Aktual dipakai
     mesin prediksi dan kiriman lain di kapal yang sama -- estimasi
     melewati milestoneDateOf, seperti draft yang lain. Entri lama tanpa
     status artinya Aktual. */
  { key: "berth", label: berthLabel, full: berthFull, peristiwa: true, bisaDraft: true, kata: kataBerth },
  /* `full` berupa FUNGSI, bukan teks: daftar ini dibuat sekali saat
     halaman dimuat. Teks biasa -- termasuk hasil t() -- akan terkunci
     di bahasa saat itu, dan ganti bahasa tidak lagi mengubahnya.
     stepText() memanggil fungsinya saat ditampilkan. */
  { key: "pib", label: "PIB", full: () => t("c.pemberitahuan.impor.barang"), bisaDraft: true, labelDraft: labelDraftPabean, labelAsli: labelAsliPabean, keteranganDraft: keteranganDraftPabean },
  DOC_STEP_BILLING,
  DOC_STEP_SPJM,
  { key: "sppb", label: "SPPB", full: () => tt("Surat Persetujuan Pengeluaran Barang", "Goods Release Approval (SPPB)") },
];

/* Export: tanpa E-COO (lihat DOC_STEP_ECOO). COO & Fumigasi sama-sama
   OPSIONAL -- kadang dipakai, kadang tidak: COO menurut permintaan
   pembeli / negara tujuan, Fumigasi menurut KEMASAN barangnya (kemasan
   kayu -> fumigasi / ISPM-15; karton, plastik -> tidak perlu). Keduanya
   bisa ditandai "Tidak dipakai", dan kotak Fumigasi menyebut kemasan
   jadwalnya sebagai petunjuk (petunjukFumigasi) -- tidak menandai apa
   pun sendiri. */
const DOC_STEPS_EXPORT = [
  { key: "cipl", label: "CI/PL", full: "Commercial Invoice & Packing List", bisaDraft: true },
  { key: "peb", label: "PEB", full: () => t("c.pemberitahuan.ekspor.barang"), bisaDraft: true, labelDraft: labelDraftPabean, labelAsli: labelAsliPabean },
  { key: "npe", label: "NPE", full: () => tt("Nota Pelayanan Ekspor", "Export Service Note (NPE)") },
  { key: "bl", label: blLabel, full: blFull, bisaDraft: true },
  DOC_STEP_ASURANSI,
  DOC_STEP_MANIFEST,
  { key: "coo", label: "COO", full: "Certificate of Origin", optional: true, bisaDraft: true },
  {
    key: "fumigasi",
    label: () => tt("Fumigasi", "Fumigation"),
    full: () => tt("Sertifikat Fumigasi & ISPM-15", "Fumigation & ISPM-15 Certificate"),
    optional: true,
    bisaDraft: true,
    petunjuk: (s) => petunjukFumigasi(s),
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

/* Kosakata dua keadaan tahap kedatangan: Estimasi (draft) / Aktual.
   Kalimatnya mengikuti moda -- kapal sandar, pesawat tiba.

   Estimasi adalah perkiraan, bukan kejadian: tanggalnya BOLEH KE DEPAN
   (`masaDepan`) dan bawaannya ETA jadwal (`bawaan`) -- tinggal disesuaikan
   dengan kabar terakhir dari forwarder. Tanggal Aktual tetap tanggal
   kejadiannya (label bawaan tahap: "Tanggal Berths" / "Tanggal ATA"). */
function kataBerth(s) {
  const udara = !!(s && s.transport === "udara");
  return {
    status: tt("Status kedatangan", "Arrival status"),
    opsiDraft: udara
      ? tt("Estimasi — jadwal tiba, belum aktual", "Estimate — scheduled arrival, not actual yet")
      : tt("Estimasi — jadwal sandar, belum aktual", "Estimate — scheduled berthing, not actual yet"),
    opsiAsli: udara
      ? tt("Aktual — pesawat sudah tiba", "Actual — aircraft has arrived")
      : tt("Aktual — kapal sudah sandar", "Actual — vessel has berthed"),
    tglDraft: udara
      ? tt("Tanggal estimasi tiba", "Estimated arrival date")
      : tt("Tanggal estimasi sandar", "Estimated berthing date"),
    tglAsli: "",
    keadaan: tt("estimasi", "estimate"),
    detail: tt("estimasi, menunggu aktual", "estimate, awaiting the actual date"),
    draftSaat: tt("estimasi", "estimated"),
    asliSaat: "",
    menunggu: tt("menunggu aktual", "awaiting the actual date"),
    begitu: udara
      ? tt("Begitu pesawat benar-benar tiba", "Once the aircraft has actually arrived")
      : tt("Begitu kapal benar-benar sandar", "Once the vessel has actually berthed"),
    masaDepan: true,
    bawaan: (status) => (status === "draft" && s ? s.etaUpdate || s.eta || "" : ""),
    hint: (status, dariBawaan) =>
      status !== "draft"
        ? ""
        : dariBawaan
          ? tt(
              "Perkiraan, bukan kejadian — tanggalnya boleh ke depan. Terisi dari ETA jadwal; ubah sesuai kabar terakhir dari forwarder.",
              "An estimate, not an event — the date may be in the future. Filled from the schedule's ETA; change it to the forwarder's latest news.",
            )
          : tt("Perkiraan, bukan kejadian — tanggalnya boleh ke depan.", "An estimate, not an event — the date may be in the future."),
    baru: (nama) =>
      tt(
        `${nama}. Jadwal dari forwarder / agen dicatat sebagai Estimasi (tanggalnya boleh ke depan); begitu benar-benar tiba, ubah ke Aktual dan isi tanggal kejadiannya — hanya yang Aktual dipakai mesin prediksi dan kiriman lain di kapal yang sama.`,
        `${nama}. A schedule from the forwarder / agent is recorded as an Estimate (the date may be in the future); once it has actually arrived, change it to Actual and enter the real date — only Actual is used by the prediction engine and by other shipments on the same vessel.`,
      ),
  };
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

/* Status PIB / PEB: "asli"-nya dokumen yang sudah DIDAFTARKAN (bernomor
   pendaftaran), draft-nya yang masih diperiksa sebelum diajukan. */
function labelDraftPabean() {
  return tt("Draft — sudah dicek, belum didaftarkan", "Draft — checked, not yet lodged");
}
function labelAsliPabean() {
  return tt("Terdaftar — sudah bernomor pendaftaran", "Lodged — registration number issued");
}
// Keterangan kotak PIB (milestone prediksi yang mengenal draft) yang belum dicatat
function keteranganDraftPabean(nama) {
  return tt(
    `${nama}. Draft yang sudah dicek dicatat sebagai Draft; begitu terdaftar, isi tanggal pendaftarannya — tanggal itulah yang dipakai mesin prediksi.`,
    `${nama}. A checked draft is recorded as Draft; once lodged, enter its registration date — that date is what the prediction engine uses.`,
  );
}

/* FUMIGASI MENGIKUTI KEMASAN. Sertifikat fumigasi / cap ISPM-15 diminta
   negara tujuan untuk kemasan KAYU (palet, peti, krat, wooden case);
   karton, plastik, karung, drum logam tidak perlu. Jenis kemasan dibaca
   dari kolom Jenis Kemasan barang (nama bebas atau kode kemasan CEISA,
   REF_CEISA.kemasan). Hasilnya satu kalimat PETUNJUK di kotak & tooltip
   tahap Fumigasi -- tidak ada yang dicentang atau dilewati sendiri.
   Kemasan yang tidak jelas bahannya ("PACKAGE", "CASE") -> tanpa
   petunjuk. */
const KEMASAN_KAYU = /WOOD|KAYU|TIMBER|LUMBER/;
const KEMASAN_BENTUK_KAYU = /\b(PALL?ETS?|PALET|SKIDS?|CRATES?|PETI)\b/;
const KEMASAN_BUKAN_KAYU = /\b(CARTONS?|CTNS?|CARDBOARD|KARTON|KARDUS|FIBRE|FIBER|PAPER|KERTAS|PLASTIC|PLASTIK|POLYBAGS?|BAGS?|SACKS?|KARUNG|DRUMS?|STEEL|METAL|ALUMINIUM|BESI|ENVELOPES?|AMPLOP)\b/;
function namaJenisKemasan(jenis) {
  const j = String(jenis || "").trim().toUpperCase();
  const ref = typeof REF_CEISA !== "undefined" && REF_CEISA && Array.isArray(REF_CEISA.kemasan) ? REF_CEISA.kemasan : [];
  const kode = ref.find((x) => x[0] === j);
  return kode ? kode[1] : j;
}
function bahanKemasan(jenis) {
  const nama = namaJenisKemasan(jenis);
  if (!nama) return "";
  if (KEMASAN_KAYU.test(nama)) return "kayu";
  if (KEMASAN_BUKAN_KAYU.test(nama)) return "bukan";
  return KEMASAN_BENTUK_KAYU.test(nama) ? "kayu" : "";
}
function petunjukFumigasi(s) {
  if (!s || s.mode !== "export") return "";
  const jenis = [...new Set((s.items || []).map((it) => String((it && it.packingUnit) || "").trim().toUpperCase()).filter(Boolean))];
  if (!jenis.length) return "";
  const bahan = jenis.map((j) => ({ j, b: bahanKemasan(j) }));
  const kayu = bahan.filter((x) => x.b === "kayu").map((x) => x.j);
  if (kayu.length) {
    return tt(
      `Kemasan ${kayu.join(", ")} — kemasan kayu umumnya wajib fumigasi / cap ISPM-15 di negara tujuan.`,
      `${kayu.join(", ")} packaging — wooden packaging generally needs fumigation / an ISPM-15 mark at the destination.`,
    );
  }
  if (bahan.every((x) => x.b === "bukan")) {
    return tt(
      `Kemasan ${jenis.join(", ")} bukan kayu — fumigasi biasanya tidak perlu; tandai "Tidak dipakai" kalau memang tidak ada.`,
      `${jenis.join(", ")} packaging is not wood — fumigation is usually not needed; mark it "Not used" if there is none.`,
    );
  }
  return "";
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
  const kurir = pakaiKurirEkspres(s);
  /* Tahap bersyarat (`berlaku`: Asuransi hanya untuk CIF / CIP) ikut
     disaring di sini, satu tempat untuk stepper, hitungan, saran
     berikutnya, "berkas belum ada", dan "menunggu asli". */
  return docStepsForDasar(s).filter((x) => !(kurir && x.key === "manifest") && (!x.berlaku || x.berlaku(s)));
}

/* Teks tahap bisa berupa fungsi (label dinamis) atau string biasa. */
function stepText(nilai, s) {
  return typeof nilai === "function" ? nilai(s) : nilai;
}

/* Kosakata tahap berstatus yang BUKAN Draft / Asli biasa (`kata`:
   Billing belum dibayar / dibayar, Berths estimasi / aktual), atau null
   untuk tahap lain -- yang tetap memakai kalimat Draft / Asli di bawah.
   Dibaca saat ditampilkan, bukan disimpan: bahasa & moda bisa berubah. */
function kataTahap(st, s) {
  return st && typeof st.kata === "function" ? st.kata(s) : null;
}
const kapitalAwal = (teks) => String(teks || "").charAt(0).toUpperCase() + String(teks || "").slice(1);

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

/* Tahap berstatus DRAFT -- dihitung terkumpul, tapi aslinya masih
   ditunggu. [{ st, entri }] menurut urutan tampilan. */
function docStepsDraft(s) {
  return docStepsFor(s)
    .map((st) => ({ st, entri: docStepEntri(s, st) }))
    .filter((x) => x.entri && !x.entri.skipped && x.entri.draft);
}
/* Label berkas yang masih DRAFT ("B/L", "COO") -- Ringkasan & antrean
   tindakan. Tahap berkosakata sendiri (Billing belum dibayar, Berths
   estimasi) bukan draft berkas: Billing punya tugasnya di bawah, Berths
   tidak ada yang bisa "dikejar" (kedatangan terjadi sendiri). */
function draftDocs(s) {
  return docStepsDraft(s)
    .filter((x) => !kataTahap(x.st, s))
    .map((x) => stepText(x.st.label, s));
}
/* Label tahap yang sudah diterima tapi BELUM DIBAYAR (`perluDikejar`:
   Billing) -- tugas sendiri di Ringkasan, karena barang tidak bisa
   keluar sebelum dibayar. */
function belumDibayarDocs(s) {
  return docStepsDraft(s)
    .filter((x) => x.st.perluDikejar)
    .map((x) => stepText(x.st.label, s));
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
      const jalur = entri.jalur ? jalurInfo(entri.jalur) : null;
      const nLampiran = rapikanBerkas(entri.berkas).length;
      const oleh =
        (jalur ? tt(` · jalur ${jalur.label}`, ` · ${jalur.label} lane`) : "") +
        (entri.sumber === "ceisa" ? tt(" · dari impor dokumen pabean", " · from the customs document import") : "") +
        (nLampiran ? tt(` · ${nLampiran} lampiran`, ` · ${nLampiran} attachment${nLampiran === 1 ? "" : "s"}`) : "") +
        (by ? tt(` · dicatat oleh ${by}`, ` · recorded by ${by}`) : "");
      // Billing / Berths: kosakata keadaannya sendiri (belum dibayar, estimasi)
      const k = kataTahap(st, s);
      if (entri.draft) {
        if (k) return `${nama} — ${k.draftSaat} ${tgl} · ${k.menunggu}${oleh}`;
        return tt(`${nama} — draft diterima ${tgl} · menunggu asli${oleh}`, `${nama} — draft received ${tgl} · awaiting the original${oleh}`);
      }
      const draft = entri.tglDraft
        ? k
          ? ` (${k.draftSaat} ${fmtDate(entri.tglDraft)})`
          : tt(` (draft ${fmtDate(entri.tglDraft)})`, ` (draft ${fmtDate(entri.tglDraft)})`)
        : "";
      if (st.peristiwa) return `${nama} — ${tgl}${k ? draft : ""}${oleh}`;
      if (k) return `${nama} — ${k.asliSaat} ${tgl}${draft}${oleh}`;
      return tt(`${nama} — diterima ${tgl}${draft}${oleh}`, `${nama} — received ${tgl}${draft}${oleh}`);
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
  /* Petunjuk tahap (`petunjuk`): COO buku Import menyebut skema FTA negara
     asal barangnya (lartas.js), Fumigasi menyebut kemasannya. */
  const petunjuk = st.petunjuk ? st.petunjuk(s) : "";
  if (kini) return t("x.klik.kalau.berkasnya.ada", { x: nama, opsional: st.optional ? t("x.atau.tandai.tidak.dipakai") : "" }) + (petunjuk ? `. ${petunjuk}` : "");
  return tt(`${nama} — menunggu tahap sebelumnya`, `${nama} — waiting for the previous step`) + (petunjuk ? ` · ${petunjuk}` : "");
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

  let jumlahDraft = 0;
  // Billing belum dibayar / Berths estimasi: jam pasir juga, tapi penandanya sendiri di kepala
  const menungguKhusus = [];
  const langkah = docStepsFor(s).map((st, i) => {
    const entri = docStepEntri(s, st);
    const dilewati = !!(entri && entri.skipped);
    const sudah = !!entri && !dilewati;
    // Draft disetujui, aslinya ditunggu: terkumpul, tapi jam pasir -- bukan centang
    const draft = sudah && !!entri.draft;
    if (draft) {
      const k = kataTahap(st, s);
      if (k) menungguKhusus.push({ st, k });
      else jumlahDraft++;
    }
    const kini = i === berikut;
    const judul = docStepJudul(s, st, entri, kini);
    const nLampiran = sudah ? rapikanBerkas(entri.berkas).length : 0;

    const isi = dilewati
      ? "–"
      : draft
        ? '<i class="bi bi-hourglass-split"></i>'
        : sudah
          ? '<i class="bi bi-check-lg"></i>'
          : i + 1;

    return `
      <button type="button"
        class="docstep${sudah ? " is-done" : ""}${draft ? " is-draft" : ""}${dilewati ? " is-skipped" : ""}${kini ? " is-next" : ""}"
        data-action="docStep" data-id="${s.id}" data-step="${st.key}"
        title="${escapeAttr(judul)}">
        <span class="docstep-dot">${isi}${nLampiran ? `<span class="docstep-lampir" aria-hidden="true"><i class="bi bi-paperclip"></i>${nLampiran}</span>` : ""}</span>
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

  /* Tahap berikutnya disebut dengan kata-kata, bukan hanya cincin
     kuningan di deretannya: "Berikutnya: Billing". */
  const tahapBerikut = berikut >= 0 ? docStepsFor(s)[berikut] : null;
  const hitung = docStepCount(s);
  return `
  <div class="docsteps">
    <div class="docsteps-head">
      <span class="docsteps-judul"><i class="bi bi-files" aria-hidden="true"></i> ${tt("Progres Dokumen", "Document Progress")}</span>
      <span class="docsteps-hitung"><span class="docsteps-count">${hitung.selesai} / ${hitung.berlaku}</span>${
        jumlahDraft ? `<span class="docsteps-draft" title="${escapeAttr(tt("Draft sudah disetujui, aslinya masih ditunggu", "Draft approved, the original is still awaited"))}"><i class="bi bi-hourglass-split" aria-hidden="true"></i> ${jumlahDraft} draft</span>` : ""
      }${menungguKhusus
        .map(
          ({ st, k }) =>
            `<span class="docsteps-draft" title="${escapeAttr(`${stepText(st.full, s)} — ${k.menunggu}`)}"><i class="bi bi-hourglass-split" aria-hidden="true"></i> ${escapeHtml(stepText(st.label, s))}: ${escapeHtml(k.keadaan)}</span>`,
        )
        .join("")}${
        tahapBerikut ? `<span class="docsteps-next">${tt("Berikutnya", "Next")}: <b>${escapeHtml(stepText(tahapBerikut.label, s))}</b></span>` : ""
      }</span>
    </div>
    <div class="docsteps-track">${langkah}</div>
  </div>`;
}

/* ------------------------------------------------------------------
   KOTAK TAHAP DOKUMEN

   Menekan tahap mana pun membuka SATU kotak yang sama:
     - status (tahap yang mengenal draft / boleh dilewati):
         Draft (disetujui, menunggu asli) / Asli / Tidak dipakai;
         Billing: diterima belum dibayar / sudah dibayar;
         Berths: estimasi / aktual (kataTahap);
     - tanggal: tanggal DITERIMA berkasnya (draft: tanggal draftnya;
       Manifest/PIB/Billing/SPPB: tanggal dokumen yang dipakai prediksi;
       Billing dibayar: tanggal bayar; Berths/ATA & Sailing/ATD: tanggal
       kejadiannya, Berths estimasi: tanggal perkiraan -- boleh ke depan);
     - jalur PIB (PIB terdaftar, Billing, SPPB);
     - lampiran berkas (tahap berkas, bukan kejadian).
   Tahap yang sudah terisi dibuka dengan isiannya, plus tombol "Batalkan
   tahap" -- HANYA tahap itu yang dibatalkan (lihat di bawah).
------------------------------------------------------------------ */

/* Tanggal PIB / PEB bawaan = tanggal di nomor ajunya
   ("000020POL85820261016024172" -> 16-10-2026, tanggalDariAju di
   helpers.js); tetap bisa diubah di kotaknya. Draftnya pun disusun pada
   hari ajunya dibuat. Tahap lain, nomor aju tidak lengkap, atau tanggal
   aju yang belum tiba -> "" (hari ini). */
function docTanggalDariAju(st, s) {
  if (st.key !== "pib" && st.key !== "peb") return "";
  const tgl = tanggalDariAju(s && s.noAju);
  return tgl && tgl <= todayISO() ? tgl : "";
}
const docTanggalBawaan = (st, s) => docTanggalDariAju(st, s) || todayISO();
const docHintDariAju = (st, s) =>
  docTanggalDariAju(st, s) ? tt("Terisi dari tanggal di nomor aju — ubah kalau berbeda.", "Filled from the date in the aju number — change it if it differs.") : "";

/* JALUR PIB — ditanyakan di konfirmasi PIB (terdaftar), Billing, dan SPPB.

   Jalur (SPPJ) keluar sesaat setelah PIB diajukan; kalau PIB sudah
   dicentang sebelum jalurnya diketahui, Billing atau SPPB jadi
   kesempatan berikutnya. Mesin prediksi memakainya untuk lama
   clearance (PREDICTION_CONFIG.customsLanes) dan belajar per jalur. */
function docIsianJalur(s) {
  return {
    key: "jalur",
    label: tt("Jalur PIB", "PIB lane"),
    type: "select",
    value: jalurOf(s),
    options: [
      { value: "", label: tt("Belum diketahui", "Not known yet") },
      ...(PREDICTION_CONFIG.customsLanes || []).map((l) => ({ value: l.key, label: l.label })),
    ],
    hint: tt(
      "Dipakai memperkirakan lama clearance sampai SPPB. Jalur Merah menambah tahap SPJM sebelum SPPB.",
      "Used to estimate how long clearance takes until SPPB. The Red lane adds an SPJM step before SPPB.",
    ),
  };
}

/* Progres baru: tahap `stepKey` dicatat (`entri`), dengan jalur yang
   dipilih. Jalur yang diisi ikut disamakan di tahap PIB/Billing/SPPB
   lain yang sudah dicatat -- koreksi di SPPB tidak boleh kalah oleh
   jalur lama di PIB. "Belum diketahui" tidak menghapus apa pun. PIB yang
   masih draft belum berjalur, jadi tidak ikut disamakan. */
function docProgresDenganJalur(progres, stepKey, jalur, entri) {
  const baru = { ...progres, [stepKey]: jalur ? { ...entri, jalur } : entri };
  if (jalur) {
    TAHAP_PENCATAT_JALUR.forEach((k) => {
      if (k !== stepKey && baru[k] && !baru[k].skipped && !baru[k].draft) baru[k] = { ...baru[k], jalur };
    });
  }
  return baru;
}

/* `bolehMasaDepan`: tanggal PERKIRAAN (estimasi sandar) memang jatuh ke
   depan; tanggal kejadian & berkas diterima tidak boleh sesudah hari ini. */
function docPeriksaTanggal(tanggal, bolehMasaDepan) {
  if (!tanggal) return tt("Tanggal wajib diisi.", "The date is required.");
  if (!bolehMasaDepan && tanggal > todayISO()) return tt("Tanggal tidak boleh sesudah hari ini.", "The date cannot be later than today.");
  return "";
}

// Keadaan entri tersimpan: "" (belum), "draft", "ada" (asli / diterima), "lewati"
function statusEntriTahap(entri) {
  if (!entri) return "";
  if (entri.skipped) return "lewati";
  return entri.draft ? "draft" : "ada";
}

/* Pilihan status sebuah tahap. Kosong = tahap tanpa pilihan (hanya
   tanggal): Billing, SPPB, NPE, Tally, kejadian. */
function opsiStatusTahap(st, s) {
  const opsi = [];
  const k = kataTahap(st, s);
  if (st.bisaDraft) {
    opsi.push({ value: "draft", label: k ? k.opsiDraft : st.labelDraft ? st.labelDraft() : tt("Draft — disetujui, menunggu asli", "Draft — approved, awaiting the original") });
    opsi.push({ value: "ada", label: k ? k.opsiAsli : st.labelAsli ? st.labelAsli() : tt("Asli / final", "Original / final") });
  } else if (st.optional) {
    opsi.push({ value: "ada", label: tt("Sudah diterima", "Received") });
  }
  if (st.optional) opsi.push({ value: "lewati", label: tt("Tidak dipakai — lewati tahap ini", "Not used — skip this step") });
  return opsi;
}

// Folder lampiran satu tahap di bucket: <id jadwal>/<tahap>
const folderLampiranTahap = (s, st) => `${s.id}/${st.key}`;

// Kalimat keadaan tahap yang sudah dicatat -- keterangan kotak tahapnya
function ringkasanEntriTahap(s, st, entri) {
  if (!entri) return "";
  if (entri.skipped) return tt("Ditandai tidak dipakai untuk pengiriman ini.", "Marked as not used for this shipment.");
  const tgl = entri.date ? fmtDate(entri.date) : "";
  const oleh = entri.by ? tt(` · dicatat oleh ${entri.by}`, ` · recorded by ${entri.by}`) : "";
  const k = kataTahap(st, s);
  if (entri.draft) {
    const asli = (opsiStatusTahap(st, s).find((o) => o.value === "ada") || {}).label || tt("Asli / final", "Original / final");
    if (k) {
      return tt(
        `${kapitalAwal(k.draftSaat)} ${tgl}${oleh}. ${k.begitu}, ubah statusnya ke "${asli}".`,
        `${kapitalAwal(k.draftSaat)} ${tgl}${oleh}. ${k.begitu}, change its status to "${asli}".`,
      );
    }
    return tt(
      `Draft diterima ${tgl}${oleh}. Begitu yang asli datang, ubah statusnya ke "${asli}".`,
      `Draft received ${tgl}${oleh}. Once the original arrives, change its status to "${asli}".`,
    );
  }
  const draft = entri.tglDraft ? ` (${k ? k.draftSaat : "draft"} ${fmtDate(entri.tglDraft)})` : "";
  if (st.peristiwa) return `${stepText(st.full, s)} — ${tgl}${k ? draft : ""}${oleh}.`;
  if (k && tgl) return `${kapitalAwal(k.asliSaat)} ${tgl}${draft}${oleh}.`;
  return tgl
    ? tt(`Diterima ${tgl}${draft}${oleh}.`, `Received ${tgl}${draft}${oleh}.`)
    : tt(`Sudah dikonfirmasi${oleh}.`, `Already confirmed${oleh}.`);
}

async function toggleDocStep(id, stepKey) {
  if (!requireEdit()) return;
  const s = currentList().find((x) => x.id === id);
  if (!s) return;

  const st = docStepsFor(s).find((x) => x.key === stepKey);
  if (!st) return;
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
  bukaTahapDokumen(s, st);
}

function bukaTahapDokumen(s, st) {
  const progres = { ...docProgressOf(s) };
  const lama = progres[st.key] || null;
  const statusLama = statusEntriTahap(lama);
  const label = stepText(st.label, s);
  const nama = stepText(st.full, s);

  /* ------------------------------------------------------------------
     TAHAP YANG MENGGERAKKAN PREDIKSI

     Manifest, PIB, Billing, dan SPPB bukan sekadar centang: tanggalnya
     dipakai mesin prediksi sebagai titik mulai hitungan berikutnya.
     Karena itu yang ditanyakan tanggal DOKUMEN, bukan sekadar "ya,
     sudah ada" -- dan boleh dikosongkan (= hari ini).

     Tanggal konfirmasi tidak bisa menggantikannya. SPPB terbit Jumat
     sore lalu dicentang Senin pagi akan menggeser seluruh perkiraan
     dua hari terlalu jauh — tiap kali, ke arah yang sama.

     Daftar tahapnya dibaca dari konfigurasi, bukan ditulis di sini.
  ------------------------------------------------------------------ */
  const milestone = predictionMilestoneForStep(st.key, s);
  const tanyaJalur = !!milestone && TAHAP_PENCATAT_JALUR.indexOf(st.key) >= 0;
  /* Billing (belum dibayar / dibayar) & Berths (estimasi / aktual) punya
     kosakata sendiri: `kata` menggantikan kalimat Draft / Asli. */
  const kata = kataTahap(st, s);
  const opsiStatus = opsiStatusTahap(st, s);
  /* Tahap yang mengenal draft dibuka sebagai Draft: begitulah berkasnya
     biasa datang lebih dulu -- billing diterima sebelum dibayar, jadwal
     sandar sebelum kapalnya sandar. Keadaan tersimpan yang tidak dikenal
     tahap ini (mis. draft di tahap tanpa draft) dibaca sebagai Asli. */
  const statusSah = (v) => v === "ada" || (v === "draft" && !!st.bisaDraft) || (v === "lewati" && !!st.optional);
  const statusAwal = statusSah(statusLama) ? statusLama : !lama && st.bisaDraft ? "draft" : "ada";
  let status = statusAwal;
  // Milestone yang sudah terdaftar: tanggal dokumennya boleh kosong (= hari ini) & tanpa batas
  const tanggalMilestone = (stt) => !!milestone && stt === "ada";
  // Estimasi (Berths) adalah perkiraan: tanggalnya boleh jatuh ke depan
  const masaDepan = (stt) => !!(kata && kata.masaDepan && stt === "draft");
  const tanggalTersimpan = (stt) => !!(lama && statusLama === stt && lama.date);
  const tanggalUntuk = (stt) => {
    if (tanggalTersimpan(stt)) return lama.date;
    return (kata && kata.bawaan && kata.bawaan(stt)) || docTanggalBawaan(st, s);
  };
  const labelTanggal = (stt) => {
    const khas = kata && (stt === "draft" ? kata.tglDraft : kata.tglAsli);
    if (khas) return khas;
    return stt === "draft"
      ? tt("Tanggal draft diterima", "Draft received date")
      : milestone || st.peristiwa
        ? tt(`Tanggal ${label}`, `${label} date`)
        : st.bisaDraft
          ? tt("Tanggal asli diterima", "Original received date")
          : tt("Tanggal diterima", "Date received");
  };
  const hintTanggal = (stt) =>
    (kata && kata.hint && kata.hint(stt, !tanggalTersimpan(stt) && !!(kata.bawaan && kata.bawaan(stt)))) ||
    docHintDariAju(st, s) ||
    (tanggalMilestone(stt) ? t("s.kosongkan.kalau.tanggal.dokumennya.belum.diket") : "");

  /* Lampiran: tahap berkas saja (kejadian -- Berths/ATA, Sailing/ATD --
     tidak berberkas). Tanda Draft / Asli di berkasnya hanya untuk berkas
     yang memang punya versi draft; billing bukan -- yang dilampirkan
     kode billing atau bukti bayarnya. */
  const pengelola = st.peristiwa
    ? null
    : buatPengelolaBerkas({ berkas: lama && lama.berkas, versi: () => (st.bisaDraft && !kata ? (status === "draft" ? "draft" : "asli") : "") });

  const fields = [];
  if (opsiStatus.length) {
    fields.push({ key: "pilih", label: kata ? kata.status : tt("Status dokumen", "Document status"), type: "select", value: statusAwal, options: opsiStatus });
  }
  fields.push(
    Object.assign(
      { key: "tanggal", label: labelTanggal(statusAwal), type: "date", value: tanggalUntuk(statusAwal) },
      tanggalMilestone(statusAwal) || masaDepan(statusAwal) ? {} : { max: todayISO() },
      hintTanggal(statusAwal) ? { hint: hintTanggal(statusAwal) } : {},
    ),
  );
  if (tanyaJalur) fields.push(docIsianJalur(s));
  if (pengelola) {
    fields.push({
      key: "berkas",
      label: tt("Lampiran berkas", "Attachments"),
      type: "berkas",
      pengelola,
      hint: tt(`PDF, gambar, Excel, Word · maks. ${LAMPIRAN_MAKS_MB} MB per berkas`, `PDF, image, Excel, Word · max. ${LAMPIRAN_MAKS_MB} MB per file`),
    });
  }

  const petunjuk = st.petunjuk ? st.petunjuk(s) : "";
  // Keterangan kotak: keadaan tersimpan, atau apa yang ditanyakan untuk tahap ini
  const keteranganBaru = () => {
    // Billing / Berths: kalimat dua keadaannya sendiri
    if (kata && kata.baru) return kata.baru(nama);
    // Milestone prediksi yang mengenal draft (PIB, Manifest buku Import): kalimatnya milik tahapnya
    if (milestone && st.bisaDraft) return (st.keteranganDraft || keteranganDraftPabean)(nama);
    if (milestone) return t("x.isi.tanggal.dokumen", { x: nama });
    if (st.optional) return t("x.tandai.sudah.diterima", { x: nama });
    if (st.peristiwa) return tt(`${nama}? Isi tanggalnya.`, `${nama}? Enter the date.`);
    return t("x.konfirmasi.berkas.diterima", { x: nama });
  };
  const keterangan = lama ? ringkasanEntriTahap(s, st, lama) : keteranganBaru();

  showPrompt({
    title: lama || st.optional ? tt(`Tahap ${label}`, `Step: ${label}`) : t("x.konfirmasi.tahap", { x: label }),
    desc: keterangan + (petunjuk ? "\n" + petunjuk : ""),
    icon: lama ? "bi-pencil-square" : milestone ? "bi-calendar-check" : st.optional ? "bi-patch-question" : "bi-check2-circle",
    okText: lama || opsiStatus.length || st.peristiwa || milestone ? tt("Simpan", "Save") : tt("Ya, Sudah Ada", "Yes, it's here"),
    busyText: tt("Mengunggah…", "Uploading…"),
    fields,
    aksiKiri: lama
      ? { label: tt("Batalkan tahap", "Undo step"), icon: "bi-arrow-counterclockwise", onClick: () => batalkanTahapDokumen(s, st) }
      : null,
    onSubmit: (v) => {
      const pilihan = opsiStatus.length ? v.pilih : statusAwal;
      const lampiran = v.berkas || { lama: [], baru: [], dilepas: [] };
      const sekarang = { at: new Date().toISOString(), by: penggunaSekarang() };
      // Dilewati: tanpa tanggal & tanpa lampiran -- berkas lamanya ikut dihapus
      if (pilihan === "lewati") {
        simpanDocStep(s, { ...progres, [st.key]: { ...sekarang, skipped: true } }, {
          dihapus: rapikanBerkas(lama && lama.berkas).map((b) => b.path),
        });
        return true;
      }
      let tanggal = v.tanggal;
      if (tanggalMilestone(pilihan)) tanggal = tanggal || todayISO();
      else {
        const galat = docPeriksaTanggal(tanggal, masaDepan(pilihan));
        if (galat) return galat;
      }
      const susun = (unggahan) => {
        const berkas = lampiran.lama.concat(unggahan);
        const entri = { ...sekarang, date: tanggal };
        if (pilihan === "draft") entri.draft = true;
        else if (lama && (lama.draft || lama.tglDraft)) entri.tglDraft = lama.draft ? lama.date : lama.tglDraft;
        // "Dari impor dokumen pabean" hanya selama isinya tidak diubah tangan
        if (lama && lama.sumber && pilihan === statusLama && tanggal === lama.date) entri.sumber = lama.sumber;
        if (berkas.length) entri.berkas = berkas;
        return tanyaJalur && pilihan === "ada"
          ? docProgresDenganJalur(progres, st.key, v.jalur, entri)
          : { ...progres, [st.key]: entri };
      };
      const dihapus = lampiran.dilepas.map((b) => b.path);
      if (!lampiran.baru.length) {
        simpanDocStep(s, susun([]), { dihapus });
        return true;
      }
      // Berkas baru diunggah dulu -- kotaknya menunggu; gagal = tetap terbuka dengan pesannya
      return (async () => {
        let unggahan;
        try {
          unggahan = await unggahLampiran(lampiran.baru, folderLampiranTahap(s, st));
        } catch (e) {
          console.error(e);
          return pesanGalatLampiran(e);
        }
        simpanDocStep(s, susun(unggahan), { unggahan: unggahan.map((b) => b.path), dihapus });
        return true;
      })();
    },
  });

  /* Isian mengikuti status yang dipilih: "Tidak dipakai" menyembunyikan
     tanggal & lampiran, jalur hanya untuk PIB terdaftar, label & isi
     tanggal bawaan berganti -- selama tanggalnya belum diubah sendiri. */
  const pilih = document.getElementById("prompt_pilih");
  const kotakTanggal = document.getElementById("prompt_tanggal");
  if (!pilih || !kotakTanggal) return;
  const bidang = (key) => {
    const el = document.getElementById("prompt_" + key);
    return el ? el.closest(".prompt-field") : null;
  };
  let tanggalDiubah = false;
  kotakTanggal.addEventListener("input", () => (tanggalDiubah = true));
  const sinkron = () => {
    status = pilih.value;
    const lewati = status === "lewati";
    bidang("tanggal").classList.toggle("d-none", lewati);
    if (bidang("berkas")) bidang("berkas").classList.toggle("d-none", lewati);
    if (bidang("jalur")) bidang("jalur").classList.toggle("d-none", status !== "ada");
    if (lewati) return;
    const lbl = bidang("tanggal").querySelector(".prompt-label");
    if (lbl) lbl.textContent = labelTanggal(status);
    if (tanggalMilestone(status) || masaDepan(status)) kotakTanggal.removeAttribute("max");
    else kotakTanggal.max = todayISO();
    if (!tanggalDiubah) kotakTanggal.value = tanggalUntuk(status);
    const hint = hintTanggal(status);
    let elHint = bidang("tanggal").querySelector(".prompt-hint");
    if (hint && !elHint) {
      elHint = document.createElement("div");
      elHint.className = "prompt-hint";
      bidang("tanggal").appendChild(elHint);
    }
    if (elHint) {
      elHint.textContent = hint;
      elHint.classList.toggle("d-none", !hint);
    }
    if (pengelola) pengelola.gambarUlang();
  };
  pilih.addEventListener("change", sinkron);
  sinkron();
}

/* Membatalkan tahap: HANYA tahap ini, bukan tahap-tahap sesudahnya.

   Menghapus yang sesudahnya baru masuk akal kalau pengisiannya dipaksa
   berurutan — dan di sini tidak: PIB bisa saja dibetulkan sementara
   SPPB memang sudah benar-benar di tangan. Membuangnya berarti membuang
   catatan yang sah. Lampiran tahap ini ikut dihapus. */
function batalkanTahapDokumen(s, st) {
  const label = stepText(st.label, s);
  const lampiran = rapikanBerkas((docProgressOf(s)[st.key] || {}).berkas).map((b) => b.path);
  const ekor = lampiran.length
    ? tt(` ${lampiran.length} lampiran berkasnya ikut dihapus.`, ` Its ${lampiran.length} attachment${lampiran.length === 1 ? "" : "s"} will be deleted too.`)
    : "";
  showConfirm(tt(`Batalkan konfirmasi ${label}?`, `Cancel the ${label} confirmation?`) + ekor, () => {
    const tanpa = { ...docProgressOf(s) };
    delete tanpa[st.key];
    simpanDocStep(s, tanpa, { dihapus: lampiran });
  }, {
    title: t("c.batalkan.tahap.dokumen"),
    confirmText: tt("Ya, Batalkan", "Yes, cancel"),
    tone: lampiran.length ? "warning" : "primary",
    icon: "bi-arrow-counterclockwise",
  });
}

/* ------------------------------------------------------------------
   PROGRES DARI DOKUMEN PABEAN (impor berkas ke form jadwal)

   Draft CEISA (Excel) / PIB / PEB (PDF) yang diimpor ke form adalah
   bukti resmi tahap-tahap pabean -- satu-satunya yang boleh mencentang
   stepper tanpa diklik:
     - nomor aju tanpa nomor pendaftaran -> PIB / PEB DRAFT (tanggal di
       nomor ajunya; berkas yang belum didaftarkan memang draft);
     - nomor & tanggal pendaftaran      -> PIB / PEB terdaftar;
     - respon SPPB (KODE RESPON 2003)   -> SPPB, tanggal responnya;
     - nomor & tanggal BC 1.1 di HEADER -> Manifest (Import);
     - respon NPE                       -> NPE (Export);
     - jalur yang tertulis di respon    -> Jalur PIB.
   Hanya MENAMBAH atau MENAIKKAN (draft -> terdaftar): tahap yang sudah
   dicatat tangan, atau ditandai tidak dipakai, tidak disentuh. Ditandai
   `sumber: "ceisa"` dan baru tersimpan bersama jadwalnya saat Simpan --
   Batal membuangnya.
------------------------------------------------------------------ */
let progresImporForm = {};
function resetProgresImporForm() {
  progresImporForm = {};
}

// Berkas hasil impor -> { tahap: { date, draft?, jalur? } } (murni, tanpa menyentuh form)
function progresDariDokumenPabean(parsed, mode) {
  const out = {};
  if (!parsed || !/^(excel|pdf|pdf-peb)$/.test(parsed.source || "")) return out;
  if (parsed.modeHint && parsed.modeHint !== mode) return out;
  const f = parsed.fields || {};
  const p = parsed.progres || {};
  const hariIni = todayISO();
  const sah = (tgl) => (tgl && tgl <= hariIni ? tgl : "");
  const tahapDok = mode === "export" ? "peb" : "pib";
  const nomorDaftar = String((p.nomorDaftar != null ? p.nomorDaftar : f.docNo) || "").trim();
  const tanggalDaftar = sah(p.tanggalDaftar != null ? p.tanggalDaftar : f.docDate);
  if (nomorDaftar && tanggalDaftar) out[tahapDok] = { date: tanggalDaftar };
  else if (String(f.noAju || "").trim() && !nomorDaftar) out[tahapDok] = { date: sah(tanggalDariAju(f.noAju)) || hariIni, draft: true };
  if (mode === "import") {
    if (sah(p.sppb)) out.sppb = { date: p.sppb };
    if (p.bc11 && sah(p.bc11.tanggal)) out.manifest = { date: p.bc11.tanggal };
    if (p.jalur && (PREDICTION_CONFIG.customsLanes || []).some((l) => l.key === p.jalur)) {
      ["pib", "sppb"].forEach((k) => out[k] && !out[k].draft && (out[k].jalur = p.jalur));
    }
  } else if (sah(p.npe)) out.npe = { date: p.npe };
  return out;
}

/* Progres tersimpan + hasil impor -> { progres, berubah: [tahap] }.
   Tahap baru ditambahkan, draft dinaikkan ke terdaftar (tanggal
   draftnya & lampirannya dibawa), selebihnya milik pengguna. Jalur dari
   dokumen hanya mengisi tahap yang belum berjalur. */
function gabungProgresImpor(progres, patch, cap) {
  const out = { ...(progres || {}) };
  const berubah = [];
  const tanda = cap || { at: new Date().toISOString(), by: penggunaSekarang() };
  Object.keys(patch || {}).forEach((k) => {
    const p = patch[k];
    const lama = out[k];
    const entri = { ...tanda, date: p.date, sumber: "ceisa" };
    if (p.draft) entri.draft = true;
    if (p.jalur) entri.jalur = p.jalur;
    if (!lama) {
      out[k] = entri;
      berubah.push(k);
    } else if (!lama.skipped && lama.draft && !p.draft) {
      out[k] = { ...entri, tglDraft: lama.date || "", ...(lama.berkas ? { berkas: lama.berkas } : {}) };
      if (!out[k].tglDraft) delete out[k].tglDraft;
      berubah.push(k);
    } else if (p.jalur && !lama.skipped && !lama.draft && !lama.jalur) {
      out[k] = { ...lama, jalur: p.jalur };
      berubah.push(k);
    }
  });
  return { progres: out, berubah };
}

/* Dipanggil impor berkas di form (apply-to-form.js): hasilnya ditampung
   sampai Simpan & langsung dipakai panel prediksi form. Hasil: kalimat
   catatan impor, atau "" kalau tidak ada yang berubah. */
function catatProgresImporForm(parsed) {
  const patch = progresDariDokumenPabean(parsed, activeMode);
  if (!Object.keys(patch).length) return "";
  const { progres, berubah } = gabungProgresImpor(formDocProgress, patch);
  if (!berubah.length) return "";
  // Impor berikutnya hanya menaikkan: terdaftar tidak turun lagi jadi draft
  Object.keys(patch).forEach((k) => {
    const lama = progresImporForm[k];
    const baru = patch[k];
    if (!lama || (lama.draft && !baru.draft)) progresImporForm[k] = { ...baru };
    else if (baru.jalur && !lama.jalur && !lama.draft) progresImporForm[k] = { ...lama, jalur: baru.jalur };
  });
  formDocProgress = progres;
  const langkah = docStepsFor({ mode: activeMode, transport: $("#fTransport").value });
  const teks = berubah.map((k) => {
    const st = langkah.find((x) => x.key === k);
    const e = progres[k];
    const nama = st ? stepText(st.label, { transport: $("#fTransport").value }) : k.toUpperCase();
    const jalur = e.jalur ? jalurInfo(e.jalur) : null;
    return `${nama}${e.draft ? " (draft)" : ""} ${fmtDate(e.date)}${jalur ? tt(` · jalur ${jalur.label}`, ` · ${jalur.label} lane`) : ""}`;
  });
  return tt(
    `Progres Dokumen ikut dicentang dari berkas: ${teks.join(", ")} — tersimpan bersama jadwal saat Simpan.`,
    `Document Progress ticked from the file: ${teks.join(", ")} — saved with the schedule on Save.`,
  );
}

// Saat Simpan: progres tersimpan TERBARU + hasil impor (null bila tidak ada impor)
function progresSimpanForm(idJadwal) {
  if (!Object.keys(progresImporForm).length) return null;
  const s = idJadwal ? currentList().find((x) => x.id === idJadwal) : null;
  return gabungProgresImpor(docProgressOf(s), progresImporForm).progres;
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


/* `lampiran`: { unggahan, dihapus } -- path berkas yang baru diunggah
   untuk simpanan ini (dihapus lagi kalau simpanannya gagal) dan yang
   dilepas pengguna (baru dihapus dari bucket sesudah simpanannya
   berhasil, jadi gagal simpan tidak menghilangkan berkas). */
async function simpanDocStep(s, progresBaru, lampiran) {
  const l = lampiran || {};
  const sebelum = s.docProgress;
  s.docProgress = progresBaru; // layar berubah lebih dulu
  render();

  // Gema perubahan ini dari realtime dilewati: layarnya sudah berubah
  if (typeof realtimeCatatTulis === "function") realtimeCatatTulis("shipments", s.id);
  const { error } = await supabaseClient
    .from("shipments")
    .update({ doc_progress: progresBaru })
    .eq("id", s.id);

  if (error) {
    console.error(error);
    s.docProgress = sebelum; // dikembalikan kalau gagal
    render();
    hapusLampiran(l.unggahan);
    showToast(
      (error.message || "").includes("doc_progress")
        ? t("v.kolom.doc.progress.belum.ada.jalankan.ulang.sc")
        : t("z.gagal.menyimpan.progres.dokumen"),
      "danger",
    );
    return;
  }
  hapusLampiran(l.dihapus);
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
    // Sandar/Manifest di kiriman ini juga kedatangan kiriman lain di kapal yang sama
    const ikut = await segarkanKirimanSekapal(s);
    if (ikut.length) {
      pesanPrediksi += tt(
        ` ${ikut.length} kiriman lain di kapal yang sama ikut diperbarui.`,
        ` ${ikut.length} other shipment(s) on the same vessel updated too.`,
      );
    }
  }

  const c = docStepCount(s);
  showToast(
    tt(`Progres dokumen: ${c.selesai}/${c.berlaku}.${pesanPrediksi}`, `Document progress: ${c.selesai}/${c.berlaku}.${pesanPrediksi}`),
    "success",
  );
}
