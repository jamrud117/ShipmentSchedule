"use strict";

/* MODAL TABS */
$$("#detailTabs .nav-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#detailTabs .nav-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".tab-pane").forEach((p) => p.classList.add("d-none"));
    $(`.tab-pane[data-tabpane="${btn.dataset.tab}"]`).classList.remove(
      "d-none",
    );
    // Penanda langkah di kepala halaman ikut berpindah.
    if (typeof syncFormStep === "function") syncFormStep();
  });
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
  $("#lblVesselText").textContent = "Nama " + vesselNoun(transport);
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
  $("#lblMasterBL").textContent = air ? "Master AWB" : "Master B/L";
  $("#lblHouseBL").textContent = air ? "House AWB" : "House B/L";
  // Vessel/Voyage di atas hanya "leg terakhir" kalau rutenya transit DAN sudah ada minimal 1 kartu
  const showFinalLegHint =
    $("#fRouteType").value === "transit" && draftStops.length > 0;
  $("#finalLegHintVessel").classList.toggle("d-none", !showFinalLegHint);
  $("#finalLegHintVoyage").classList.toggle("d-none", !showFinalLegHint);
}

// Auto-arrive (ETA lewat/hari ini -> status otomatis ARRIVED) SUDAH DIHAPUS sesuai permintaan

/* INCOTERM / CUSTOMS RECALCULATION (modal) */
$("#fIncoterm").addEventListener("change", recalcCustoms);

/* PPN & PPH otomatis. Aturannya: kosong = otomatis, diisi = manual */
const AUTO_DUTY_FIELDS = ["fPPN", "fPPH"];
AUTO_DUTY_FIELDS.forEach((id) => {
  $("#" + id).addEventListener("input", (e) => {
    e.target.dataset.auto = e.target.value.trim() === "" ? "1" : "0";
  });
});

function isAutoDuty(el) {
  return el.dataset.auto !== "0";
}

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
  const calc0 = computeCustoms(tmp);

  /* PPN & PPH otomatis.

     DASARNYA NILAI PABEAN, BUKAN HARGA BARANG SAJA.

     Sebelumnya dasarnya cuma `totalUSD * ndpbm` — ongkos angkut dan
     asuransi tidak ikut. Pada kiriman udara ongkos angkutnya bisa
     lebih dari separuh harga barangnya sendiri (contoh nyata: barang
     $640, freight $382,40), jadi PPN yang terhitung meleset jauh di
     bawah yang sebenarnya terutang.

     Freight & asuransi memang sudah lama tersimpan per pengiriman,
     tapi selama ini hanya dipajang di halaman rincian dan tidak pernah
     ikut satu pun perhitungan. */
  const dasarUsd = calc0.totalUSD
    + nilaiKotakAngka("#fFreight")
    + nilaiKotakAngka("#fInsurance");
  const dasarRupiah = dasarUsd * tmp.ndpbm;
  const elPpn = $("#fPPN");
  const elPph = $("#fPPH");
  if (isAutoDuty(elPpn)) {
    elPpn.value = dasarRupiah ? formatNumberValue(Math.round(dasarRupiah * 0.11)) : "";
  }
  if (isAutoDuty(elPph)) {
    elPph.value = dasarRupiah ? formatNumberValue(Math.round(dasarRupiah * 0.025)) : "";
  }

  // Dihitung ulang memakai PPN/PPH terbaru supaya PDRI ikut benar pada putaran yang sama
  tmp.ppn = nilaiKotakAngka("#fPPN");
  tmp.pph = nilaiKotakAngka("#fPPH");
  const calc = computeCustoms(tmp);

  $("#calcTotalUSD").textContent = fmtUSD(calc.totalUSD);

  const isCIF = tmp.incoterm === "CIF";
  const isFOB = tmp.incoterm === "FOB";
  $$(".calc-box--cif").forEach((el) => {
    el.style.display = isCIF ? "" : "none";
  });
  $$(".calc-box--fob").forEach((el) => {
    el.style.display = isFOB ? "" : "none";
  });
  $("#noCifFobNote").style.display = !isCIF && !isFOB ? "block" : "none";

  if (isCIF) {
    $("#calcCIF").textContent = fmtUSD(calc.cifUsd);
    $("#calcCIFRupiah").textContent = fmtRp(calc.cifRupiah);
  } else if (isFOB) {
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

  /* Total Package (Import): dijumlahkan dari kolom Kemasan tiap barang,
     lengkap dengan jenisnya — "4 BOX", bukan "4".

     Dijumlahkan PER JENIS: 3 BOX dan 1 PALLET tidak mungkin jadi 4 apa
     pun, jadi hasilnya ditulis "3 BOX · 1 PALLET". */
  if (activeMode === "import") {
    $("#fPackage").value = totalKemasanBarang();
    autoSizeInput($("#fPackage"), 92, 210);
  }
}

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
