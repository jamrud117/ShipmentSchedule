"use strict";

/* MODAL TABS */
function pilihTabForm(nama) {
  $$("#detailTabs .nav-link").forEach((b) => b.classList.toggle("active", b.dataset.tab === nama));
  $$(".tab-pane").forEach((p) => p.classList.toggle("d-none", p.dataset.tabpane !== nama));
  // Penanda langkah di kepala halaman ikut berpindah.
  if (typeof syncFormStep === "function") syncFormStep();
  return $(`.tab-pane[data-tabpane="${nama}"]`);
}

/* Isian yang ditunggu di tiap langkah. Daftar Barang bukan "isian kosong
   pertama" -- di tabel barang itu bisa kolom Ukuran baris ketiga --
   melainkan Uraian pertama yang masih kosong (atau Uraian pertama). */
function fokusLangkahForm(pane) {
  if (!pane) return;
  if (pane.dataset.tabpane === "barang") {
    const nama = [...pane.querySelectorAll('#itemTableBody [data-f="namaBarang"]')].filter(bisaDiisi);
    fokuskan(nama.find(isianKosong) || nama[0]);
    return;
  }
  // Mengubah jadwal: isian pertama; jadwal baru: isian kosong pertama
  fokusIsianPertama(pane, { pertama: !!$("#fId").value });
}

$$("#detailTabs .nav-link").forEach((btn) => {
  btn.addEventListener("click", () => fokusLangkahForm(pilihTabForm(btn.dataset.tab)));
});

/* Ctrl/⌘ + S di form jadwal = Simpan Jadwal -- tanpa ini peramban
   menawarkan menyimpan halaman web sebagai berkas. */
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key !== "s" && e.key !== "S")) return;
  const form = $("#viewForm");
  if (!form || form.classList.contains("d-none")) return;
  e.preventDefault();
  if (document.querySelector(".modal.show")) return;
  $("#btnSaveShipment").click();
});

/* TRANSPORT LABEL TOGGLE (modal) */
$("#fTransport").addEventListener("change", applyTransportLabels);
$("#fRouteType").addEventListener("change", () => {
  renderRouteStopsUI();
  applyTransportLabels();
});
function applyTransportLabels() {
  const air = $("#fTransport").value === "udara";
  // Saran pelabuhan/bandara ikut moda yang dipilih
  if (typeof refreshUnlocodeDatalist === "function") refreshUnlocodeDatalist();
  const lbl = ML();
  // Requirement B (label dinamis): moda LAUT -> "Nama Vessel" jadi "Nama Voyager", "No
  const transport = air ? "udara" : "laut";
  /* Awalannya lewat kamus, kata bendanya dari vesselNoun (Vessel /
     Voyager -- sudah sama di kedua bahasa). Digabung lewat sisipan
     supaya urutan katanya bisa berbeda antar bahasa. */
  $("#lblVesselText").textContent = t("c.nama.sarana", { x: vesselNoun(transport) });
  $("#lblVoyageText").textContent = voyageNoun(transport);
  // Pelabuhan -> Terminal saat moda udara.
  $("#lblOrigin").textContent = portNoun("origin", transport);
  $("#lblDestination").textContent = portNoun("destination", transport);
  $("#fVessel").placeholder = air ? "Garuda Cargo" : "MV Ever Given";
  /* Saran carrier ikut moda: pelayaran untuk laut, maskapai untuk
     udara. Tanpa ini kotak Nama Pesawat menawarkan daftar pelayaran —
     sarannya justru menghalangi. */
  $("#fVessel").setAttribute("list", air ? "carrierListUdara" : "carrierListLaut");
  $("#fVoyage").placeholder = air ? "GA880/04JUL" : "V.023E";
  const dokMaster = air ? "Master AWB" : "Master B/L";
  const dokHouse = air ? "House AWB" : "House B/L";
  $("#lblMasterBL").textContent = dokMaster;
  $("#lblHouseBL").textContent = dokHouse;
  $("#lblMasterBLDate").textContent = tt(`Tanggal ${dokMaster}`, `${dokMaster} Date`);
  $("#lblHouseBLDate").textContent = tt(`Tanggal ${dokHouse}`, `${dokHouse} Date`);
  /* FCL/LCL & kontainer itu konsep laut — muatan udara tidak dikapalkan
     dalam kontainer. Udara -> Jenis Muatan & Kontainer disembunyikan dan
     dikosongkan, supaya tidak ada isian laut nyasar ikut tersimpan pada
     jadwal pesawat (kartu & detail juga tidak menampilkannya). */
  $("#fAngkutCard").classList.toggle("is-udara", air);
  ["#fMuatanWrap", "#fContainerWrap"].forEach((sel) => $(sel).classList.toggle("d-none", air));
  if (air) {
    $("#fContainer").value = "";
    $("#fMuatan").value = "";
  }
  // Vessel/Voyage di atas hanya "leg terakhir" kalau rutenya transit DAN sudah ada minimal 1 kartu
  const showFinalLegHint =
    $("#fRouteType").value === "transit" && draftStops.length > 0;
  $("#finalLegHintVessel").classList.toggle("d-none", !showFinalLegHint);
  $("#finalLegHintVoyage").classList.toggle("d-none", !showFinalLegHint);
}


/* INCOTERM / CUSTOMS RECALCULATION (modal) */
$("#fIncoterm").addEventListener("change", recalcCustoms);

/* Bea Masuk, PPN & PPH otomatis. Aturannya: kosong = otomatis, diisi = manual */
const AUTO_DUTY_FIELDS = ["fBM", "fPPN", "fPPH"];
AUTO_DUTY_FIELDS.forEach((id) => {
  $("#" + id).addEventListener("input", (e) => {
    e.target.dataset.auto = e.target.value.trim() === "" ? "1" : "0";
  });
});

function isAutoDuty(el) {
  return el.dataset.auto !== "0";
}

/* BM yang DIKETIK sendiri ikut aturan pembulatan yang sama (bulatkanBm,
   core/customs.js): begitu kotaknya ditinggalkan, angka yang belum bulat
   ribuan dibulatkan ke atas -- dan dikatakan, supaya tidak terasa
   angkanya berubah sendiri. PPN & PPh otomatis ikut dihitung ulang. */
$("#fBM").addEventListener("change", (e) => {
  const el = e.target;
  if (!String(el.value || "").trim()) return;
  const n = nilaiKotakAngka("#fBM");
  const bulat = bulatkanBm(n);
  if (bulat === n) return;
  el.value = formatNumberValue(bulat);
  recalcCustoms();
  showToast(
    tt(`BM dibulatkan ke ribuan ke atas: ${formatNumberValue(n)} → ${formatNumberValue(bulat)}.`,
      `Import duty rounded up to the nearest thousand: ${formatNumberValue(n)} → ${formatNumberValue(bulat)}.`),
    "dark",
  );
});

// Dipanggil saat form dibuka: nilai yang sudah tersimpan dianggap dimasukkan dengan sengaja
function initAutoDutyFlags() {
  AUTO_DUTY_FIELDS.forEach((id) => {
    const el = $("#" + id);
    el.dataset.auto = el.value.trim() === "" ? "1" : "0";
  });
}

["fFreight", "fInsurance", "fNdpbm", "fTarif", "fBM", "fPPN", "fPPH"].forEach(
  (id) => {
    $("#" + id).addEventListener("input", recalcCustoms);
  },
);

/* NILAI KOTAK ANGKA, dibaca dengan aturan tetap: pemisah ribuan
   dibuang, titik desimal dipertahankan.

   parseLooseNumber() sengaja serbaguna — ia menebak apakah koma itu
   pemisah ribuan atau desimal dari jumlah digit sesudahnya. Tebakan
   itu benar untuk teks yang sudah rapi, tapi kotak ini dibaca SAAT
   DIKETIK, ketika isinya sesaat belum dinormalkan:

     ketik "0" pada "2,600"  ->  isi jadi "2,6000"
     empat digit sesudah koma -> koma dianggap desimal -> 2,6

   Itulah PDRI yang tiba-tiba jadi 26.002,6.

   Pemformat hidup memang membetulkan isinya sesaat kemudian, tapi ia
   terpasang di `document` sementara penghitung ini terpasang di
   kotaknya sendiri — dan pendengar elemen SELALU berjalan lebih dulu
   daripada pendengar document. Jadi penghitung tidak pernah melihat
   teks yang sudah rapi, berapa pun urutan berkasnya diatur. */
function nilaiKotakAngka(sel) {
  const el = $(sel);
  if (!el) return 0;
  const n = Number(String(el.value || "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}

function recalcCustoms(opsi) {
  const tmp = {
    items: draftItems,
    incoterm: $("#fIncoterm").value,
    ndpbm: nilaiKotakAngka("#fNdpbm"),
    bm: nilaiKotakAngka("#fBM"),
    ppn: nilaiKotakAngka("#fPPN"),
    pph: nilaiKotakAngka("#fPPH"),
  };

  /* DASAR PUNGUTAN = NILAI PABEAN, BUKAN HARGA BARANG SAJA.

     Ongkos angkut & asuransi WAJIB ikut. Pada kiriman udara ongkos
     angkutnya bisa lebih dari separuh harga barangnya sendiri (barang
     $640 dengan freight $382,40 bukan hal aneh), jadi memakai
     `totalUSD * ndpbm` saja membuat pungutannya meleset jauh di bawah
     yang sebenarnya terutang. */
  /* BM, PPN, PPh DIHITUNG PERSIS SEPERTI PIB CEISA -- per seri barang,
     dengan aturan pembulatannya masing-masing. Lihat
     hitungPungutanImpor() di core/customs.js.

     Tarif BM dari kotak Tarif (%). Dulu kotak itu diabaikan dan BM
     selalu 5%. Kotak yang kosong (jadwal lama) tetap dianggap 5%; "0"
     berarti 0% (mis. fasilitas FTA).

     Kalau BM diisi manual (tarif HS Code tertentu), PPN & PPh memakai
     nilai manual itu -- yang penting keduanya dihitung dari BM yang
     BENAR-BENAR berlaku. */
  const elBm = $("#fBM");
  const tarifTeks = String($("#fTarif").value || "").trim();
  const pungutan = hitungPungutanImpor({
    nilaiSeriUsd: nilaiSeriUsd(draftItems),
    freightUsd: nilaiKotakAngka("#fFreight"),
    asuransiUsd: nilaiKotakAngka("#fInsurance"),
    ndpbm: tmp.ndpbm,
    tarifBm: tarifTeks === "" ? 5 : nilaiKotakAngka("#fTarif"),
    bmManual: isAutoDuty(elBm) ? null : nilaiKotakAngka("#fBM"),
  });
  const dasarRupiah = pungutan.nilaiPabean;
  if (isAutoDuty(elBm)) {
    elBm.value = dasarRupiah ? formatNumberValue(pungutan.bm) : "";
  }

  const elPpn = $("#fPPN");
  const elPph = $("#fPPH");
  if (isAutoDuty(elPpn)) {
    elPpn.value = dasarRupiah ? formatNumberValue(pungutan.ppn) : "";
  }
  if (isAutoDuty(elPph)) {
    elPph.value = dasarRupiah ? formatNumberValue(pungutan.pph) : "";
  }
  // Nilai Pabean ditampilkan apa adanya — dasar yang sama persis yang
  // baru saja dipakai menghitung BM/PPN/PPH di atas, bukan dihitung ulang.
  $("#calcNilaiPabean").textContent = fmtRpPresisi(dasarRupiah);

  // Dihitung ulang memakai BM/PPN/PPH terbaru supaya PDRI ikut benar pada putaran yang sama
  tmp.bm = nilaiKotakAngka("#fBM");
  tmp.ppn = nilaiKotakAngka("#fPPN");
  tmp.pph = nilaiKotakAngka("#fPPH");
  const calc = computeCustoms(tmp);

  $("#calcTotalUSD").textContent = fmtUSD(calc.totalUSD);
  // Nilai CIF = barang + freight + asuransi, apa pun Incoterm-nya.
  $("#calcCIF").textContent = fmtUSD(
    calc.totalUSD + nilaiKotakAngka("#fFreight") + nilaiKotakAngka("#fInsurance"),
  );

  const isFOB = tmp.incoterm === "FOB";
  /* Disembunyikan lewat KELAS, bukan el.style.display.

     Dengan gaya sebaris, keadaan awal "tersembunyi" harus ditulis di
     HTML sebagai style="display:none" -- dan gaya sebaris tidak bisa
     hidup di berkas CSS. Kelas d-none bisa: HTML tinggal membawanya
     sejak awal, dan di sini ia dinyalakan/dimatikan. */
  $$(".calc-box--fob").forEach((el) => {
    el.classList.toggle("d-none", !isFOB);
  });
  if (isFOB) {
    $("#calcFOB").textContent = fmtUSD(calc.fobUsd);
    $("#calcFOBRupiah").textContent = fmtRp(calc.fobRupiah);
  }

  // Tanpa awalan "Rp" di dalam nilainya
  $("#calcPDRI").value = formatNumberValue(calc.bmPdri);
  syncAffixState();

  $("#footTotalQty").textContent = fmtQtyBySatuan(calc.qtyBySatuan);
  $("#footTotalNetto").textContent = fmtNum(calc.totalNetto);
  $("#footTotalBruto").textContent = fmtNum(calc.totalBruto);
  $("#footTotalUSD").textContent = fmtUSD(calc.totalUSD);
  // Total CBM (mode Export) — beda dari Total Package: ini SELALU hasil hitung otomatis
  $("#footTotalCbm").textContent = fmtNum(calc.totalCbm);

  /* Total Package: dijumlahkan dari kolom Kemasan tiap barang, lengkap
     dengan jenisnya — "4 BOX", bukan "4". Berlaku Import MAUPUN Export
     lewat fungsi yang sama (totalKemasanBarang() di bawah).

     Masih boleh ditimpa manual sesudahnya (tidak readonly), bukan
     dikunci total. */
  $("#fPackage").value = totalKemasanBarang();
  autoSizeInput($("#fPackage"), 92, 210);

  // Nilai barang bisa saja baru melewati / turun di bawah USD 1.500
  aturAjuConsigneeNote();
  // HS Code, kondisi & negara asal barang menentukan lartas & petunjuk COO (dok-pelengkap.js)
  if (typeof segarkanLartasForm === "function") segarkanLartasForm();
}

/* NO. AJU KIRIMAN KURIR BERNILAI RENDAH = "CONSIGNEE NOTE".

   Kiriman FedEx / DHL / UPS di buku Import yang nilai barangnya di
   bawah USD 1.500 diselesaikan dengan Consignment Note, bukan PIB --
   tidak ada nomor aju. Aturan kurir & ambangnya SATU dengan progres
   dokumen di kartu: isKurirNilaiRendah() di doc-steps.js (nilai 0 =
   harga belum diisi, belum dihitung). Kurirnya dikenali dari Forwarder,
   Nama Kapal/Pesawat, atau No. Flight (CIPL kurir menulis "DHL" di
   kolom Vessel/Flight).

   Kotak No. Aju yang KOSONG -- atau berisi tanda kosong ("-", "N/A",
   "TBA") -- diisi sendiri dan ditandai otomatis (data-auto="cn");
   begitu syaratnya tidak terpenuhi lagi (nilai naik, kurir diganti)
   dikosongkan kembali. Yang diketik sendiri -- termasuk "CONSIGNEE
   NOTE" yang diketik di kiriman lain -- tidak disentuh; kotak yang
   dikosongkan sendiri terisi lagi begitu ditinggalkan. Keterangan di
   bawah kotaknya (#ajuKurirKet) menjelaskan kenapa terisi, atau kenapa
   belum: harga barang belum diisi, nilainya USD 1.500 ke atas, atau
   kotaknya sudah berisi nomor lain. */
const AJU_CONSIGNEE_NOTE = "CONSIGNEE NOTE";
const AJU_TANDA_KOSONG = /^(?:-+|\.|N\/?A|TBA|TBC|NIL)$/i;

// Isian form yang menentukan kiriman kurir (bentuk jadwal untuk isKurirNilaiRendah)
function kirimanKurirForm() {
  return {
    mode: activeMode,
    forwarder: $("#fForwarder").value,
    vessel: [$("#fVessel").value, $("#fVoyage").value].join(" "),
    items: draftItems,
  };
}

function syaratAjuConsigneeNote() {
  if (typeof isKurirNilaiRendah !== "function") return false;
  return isKurirNilaiRendah(kirimanKurirForm());
}

function aturAjuConsigneeNote() {
  const el = $("#fNoAju");
  if (!el) return;
  const isi = el.value.trim();
  if (syaratAjuConsigneeNote()) {
    if (!isi || AJU_TANDA_KOSONG.test(isi)) {
      el.value = AJU_CONSIGNEE_NOTE;
      el.dataset.auto = "cn";
    }
  } else if (el.dataset.auto === "cn" && isi.toUpperCase() === AJU_CONSIGNEE_NOTE) {
    el.value = "";
    delete el.dataset.auto;
  }
  gambarKetAjuKurir();
}

/* Keterangan di bawah No. Aju untuk kiriman kurir di buku Import. */
function gambarKetAjuKurir() {
  const ket = $("#ajuKurirKet");
  if (!ket) return;
  const s = kirimanKurirForm();
  let teks = "";
  if (s.mode === "import" && typeof pakaiKurirEkspres === "function" && pakaiKurirEkspres(s)) {
    const nilai = itemTotals(s).totalUSD;
    const isi = $("#fNoAju").value.trim();
    const kosong = !isi || AJU_TANDA_KOSONG.test(isi);
    if ($("#fNoAju").dataset.auto === "cn") {
      teks = tt(`Otomatis: kiriman kurir bernilai ${fmtUSD(nilai)} (di bawah USD 1.500) memakai Consignment Note.`, `Automatic: a courier shipment worth ${fmtUSD(nilai)} (under USD 1,500) uses a Consignment Note.`);
    } else if (nilai >= AMBANG_KURIR_TANPA_PIB) {
      teks = tt(`Kiriman kurir bernilai ${fmtUSD(nilai)} (USD 1.500 ke atas): wajib PIB, bukan CONSIGNEE NOTE.`, `Courier shipment worth ${fmtUSD(nilai)} (USD 1,500 or more): a PIB is required, not a CONSIGNEE NOTE.`);
    } else if (!nilai) {
      if (kosong) teks = tt("Kiriman kurir: isi harga barang — di bawah USD 1.500, No. Aju terisi CONSIGNEE NOTE sendiri.", "Courier shipment: fill in the item prices — under USD 1,500 the Aju No. becomes CONSIGNEE NOTE by itself.");
    } else if (!kosong && isi.toUpperCase() !== AJU_CONSIGNEE_NOTE) {
      teks = tt(
        `Kiriman kurir bernilai ${fmtUSD(nilai)} (di bawah USD 1.500) biasanya CONSIGNEE NOTE — kosongkan No. Aju untuk mengisinya otomatis.`,
        `A courier shipment worth ${fmtUSD(nilai)} (under USD 1,500) is usually a CONSIGNEE NOTE — clear the Aju No. to fill it automatically.`,
      );
    }
  }
  ket.textContent = teks;
  ket.hidden = !teks;
}

/* TANGGAL PEB DARI NOMOR AJU (buku Export). Nomor aju CEISA memuat
   tanggalnya (tanggalDariAju, helpers.js): kotak Tanggal PEB yang
   KOSONG diisi dari situ dan ditandai otomatis (data-auto="aju"),
   jadi ikut berubah saat nomor ajunya diubah. Yang diketik sendiri --
   atau terisi dari PEB / draft CEISA yang diimpor -- tidak ditimpa.
   Buku Import tidak: kotak itu Tanggal SPPB, tanggal yang lain (tanggal
   PIB-nya di tahap PIB progres dokumen, doc-steps.js). */
function aturTanggalPebDariAju() {
  const el = $("#fDocDate");
  if (!el || activeMode !== "export") return;
  if (el.value && el.dataset.auto !== "aju") return;
  const tgl = tanggalDariAju($("#fNoAju").value);
  el.value = tgl;
  if (tgl) el.dataset.auto = "aju";
  else delete el.dataset.auto;
}

// Form dibuka / berkas diimpor: Tanggal PEB yang sama dengan tanggal nomor ajunya ikut dikelola otomatis
function tandaiTanggalPebDariAju() {
  const el = $("#fDocDate");
  if (!el) return;
  if (activeMode === "export" && el.value && el.value === tanggalDariAju($("#fNoAju").value)) el.dataset.auto = "aju";
  else delete el.dataset.auto;
  aturTanggalPebDariAju();
}

/* Form dibuka: "CONSIGNEE NOTE" tersimpan ikut dikelola otomatis hanya
   kalau syaratnya memang masih berlaku -- kalau tidak (kurir di luar
   daftar, harga belum diisi), itu ketikan pengguna dan dibiarkan. */
function tandaiAjuConsigneeNoteTersimpan() {
  const el = $("#fNoAju");
  if (!el) return;
  delete el.dataset.auto;
  if (el.value.trim().toUpperCase() === AJU_CONSIGNEE_NOTE && syaratAjuConsigneeNote()) el.dataset.auto = "cn";
}

$("#fNoAju").addEventListener("input", (e) => {
  delete e.target.dataset.auto;
  gambarKetAjuKurir();
  aturTanggalPebDariAju();
});
// Dikosongkan sendiri lalu ditinggalkan: CONSIGNEE NOTE kembali (tidak selagi mengetik)
$("#fNoAju").addEventListener("change", aturAjuConsigneeNote);
["fForwarder", "fVessel", "fVoyage"].forEach((id) => {
  $("#" + id).addEventListener("input", aturAjuConsigneeNote);
});
// Tanggal PEB yang diubah sendiri tidak lagi mengikuti nomor aju
["input", "change"].forEach((ev) => $("#fDocDate").addEventListener(ev, (e) => delete e.target.dataset.auto));

/* KEADAAN LAMBANG MATA UANG */
function syncAffixState(scope) {
  const root = scope || document;
  root.querySelectorAll(".input-affix").forEach((wrap) => {
    const inp = wrap.querySelector("input");
    wrap.classList.toggle("has-value", !!(inp && inp.value.trim()));
  });
}

document.addEventListener("input", (e) => {
  const wrap = e.target.closest && e.target.closest(".input-affix");
  if (wrap) wrap.classList.toggle("has-value", !!e.target.value.trim());
});


/* Menjumlahkan kolom Kemasan seluruh barang, dikelompokkan per jenis.

   Barang yang kolom Kemasan-nya dikosongkan dianggap masih satu
   kemasan dengan barang di atasnya (lihat catatan di tab Daftar
   Barang), jadi ia memang tidak ikut menambah hitungan. */
function totalKemasanBarang() {
  const peta = new Map();
  (draftItems || []).forEach((it) => {
    const jml = parseLooseNumber(it.packing);
    if (!jml) return;
    const jenis = String(it.packingUnit || "").trim().toUpperCase();
    peta.set(jenis, (peta.get(jenis) || 0) + jml);
  });
  return Array.from(peta.entries())
    .map(([jenis, n]) => `${fmtNum(n)} ${jenis}`.trim())
    .join(" · ");
}

/* NAMA SHIPPER/BUYER SELALU HURUF BESAR.

   Nama yang sama diketik berbeda-beda — "PT Wide Logistics", "pt wide
   logistics", "PT WIDE LOGISTICS" — akan terhitung sebagai tiga pihak
   berbeda saat dikelompokkan di laporan dan papan. Diseragamkan saat
   diketik, bukan saat disimpan, supaya pengguna langsung melihat
   bentuk yang akan tersimpan.

   Posisi kursor dijaga: tanpa itu, mengetik di tengah teks akan
   melemparkan kursor ke ujung tiap huruf. */

/* Dipakai bersama oleh Nama Pihak dan Nama Barang. Ditaruh di satu
   tempat, bukan disalin: dua salinan aturan huruf besar akan berbeda
   perlakuannya begitu salah satunya diperbaiki. */
function jadikanHurufBesar(el) {
  if (!el) return;
  const pos = el.selectionStart;
  const atas = String(el.value).toUpperCase();
  if (el.value === atas) return;
  el.value = atas;
  /* Sebagian jenis kotak (mis. type=email) melempar saat kursornya
     diatur. Nama barang & pihak bukan salah satunya, tapi penjaga ini
     membuat helper-nya aman dipakai di kotak mana pun nanti. */
  try {
    el.setSelectionRange(pos, pos);
  } catch (err) {
    /* abaikan — kotak yang tidak mendukung pengaturan kursor */
  }
}

const elParty = $("#fParty");
if (elParty) {
  elParty.addEventListener("input", () => jadikanHurufBesar(elParty));
}
