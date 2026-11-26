"use strict";

/* ------------------------------------------------------------------
   DETAIL PENGAJUAN NOMOR -- kotak "Lihat seluruh isian" di riwayat

   Satu kotak untuk keempat jenis dokumen (Invoice, Surat Jalan,
   Pengajuan Dana, Surat). Isinya disusun seperti lembar dokumen, bukan
   daftar kunci-nilai bergaris:

     KEPALA   jenis dokumen, NOMOR-nya, tanggal / pemohon / departemen,
              dan angka yang paling dicari di sisi kanan (total
              pengajuan + status bayar; nilai invoice).
     BAGIAN   isian dikelompokkan menurut maknanya (Tagihan, Kepala
              Surat, Data Cetak CIPL, ...), label di atas nilainya dan
              beberapa kolom per baris -- isian panjang selebar kotak.
     TABEL    rincian biaya, daftar barang, barang & fungsi tampil
              sebagai tabel sungguhan lengkap dengan totalnya. Dulu
              semuanya diringkas jadi kalimat bersambung di satu sel.

   Susunannya ada di DN_DETAIL_SUSUNAN. Isian yang belum punya tempat
   di sana TIDAK hilang: ia jatuh ke bagian "Lainnya" dengan label yang
   dirapikan dari nama kuncinya -- isian tiap jenis dokumen bisa
   bertambah, dan yang belum terdaftar tidak boleh lenyap dari layar.

   Angka rincian biaya dihitung oleh fungsi yang SAMA dengan form dan
   surat cetaknya (fundLineTotals & kawan-kawan di fund-lines.js), jadi
   ketiganya tidak mungkin menampilkan total yang berbeda.
------------------------------------------------------------------ */

const DN_LABEL_FIELD = {
  get transactionType() { return tt("Jenis Transaksi", "Transaction Type"); },
  get expenseType() { return tt("Jenis Pengeluaran", "Expense Type"); },
  get packages() { return tt("Jumlah Koli", "Number of Packages"); },
  get receiver() { return tt("Tujuan / Penerima", "Destination / Recipient"); },
  get address() { return tt("Alamat Tujuan", "Destination Address"); },
  get vehicle() { return tt("No. Kendaraan", "Vehicle No."); },
  get shipmentId() { return tt("Jadwal Terkait", "Linked Schedule"); },
  get customer() { return tt("Customer", "Customer"); },
  get payee() { return tt("Dibayarkan Kepada", "Paid To"); },
  get recipient() { return tt("Penerima Surat", "Letter Recipient"); },
  get letterType() { return tt("Jenis Surat", "Letter Type"); },
  get signer() { return tt("Penanda Tangan", "Signatory"); },
  get signerTitle() { return tt("Jabatan Penanda Tangan", "Signatory Title"); },
  get noAju() { return tt("Nomor Aju", "Aju No."); },
  get invoiceRef() { return tt("No. & Tanggal Invoice", "Invoice No. & Date"); },
  get shipper() { return "Shipper"; },
  get awb() { return "AWB / BL"; },
  get koliBerat() { return tt("Koli / Berat", "Packages / Weight"); },
  get namaBarang() { return tt("Nama Barang", "Goods"); },
  get negaraAsal() { return tt("Negara Asal", "Country of Origin"); },
  get flightTiba() { return tt("Flight & Tanggal Tiba", "Flight & Arrival Date"); },
  get nilaiBarang() { return tt("Nilai Barang", "Goods Value"); },
  get tglBayar() { return tt("Tanggal Pembayaran", "Payment Date"); },
  get itemsFungsi() { return tt("Barang & Fungsi", "Goods & Function"); },
  get subject() { return tt("Perihal", "Subject"); },
  get amount() { return tt("Nilai", "Amount"); },
  get currency() { return tt("Mata Uang", "Currency"); },
  get purpose() { return tt("Keperluan", "Purpose"); },
  get notes() { return tt("Keterangan", "Notes"); },
  get reference() { return tt("Referensi", "Reference"); },
  // Isian Form Pengajuan Dana
  get billingNo() { return tt("Nomor Billing", "Billing Number"); },
  get invoiceNo() { return tt("Nomor Invoice", "Invoice Number"); },
  get dokumen() { return tt("Invoice / Debit Note Tambahan", "Additional Invoice / Debit Note"); },
  get invoiceDate() { return tt("Tanggal Invoice", "Invoice Date"); },
  get invoiceDueDate() { return tt("Due Date Invoice", "Invoice Due Date"); },
  get blAwb() { return "BL/AWB"; },
  get docNo() { return "Doc No"; },
  get paidAt() { return tt("Tanggal Bayar", "Paid Date"); },
  get paidBy() { return tt("Ditandai Lunas Oleh", "Marked Paid By"); },
  get paidProof() { return tt("Bukti Bayar", "Payment Proof"); },
  get attachment() { return tt("Lampiran", "Attachment"); },
  get lines() { return tt("Rincian Biaya", "Cost Breakdown"); },
  get feeBm() { return tt("Bea Masuk", "Import Duty"); },
  get feePpn() { return tt("PPN Import", "Import VAT (PPN)"); },
  get feePph() { return tt("PPH Import", "Import Income Tax (PPH)"); },
  get checkedByName() { return tt("Checked By", "Checked By"); },
  get checkedByRole() { return tt("Jabatan Checked By", "Checked By Position"); },
  get approver1Name() { return tt("Approved By", "Approved By"); },
  get approver1Role() { return tt("Jabatan Approved By", "Approved By Position"); },
  get cfoName() { return tt("Approved By 2", "Approved By 2"); },
  get cfoRole() { return tt("Jabatan Approved By 2", "Approved By 2 Position"); },
  get quantity() { return tt("Jumlah", "Quantity"); },
  get unit() { return tt("Satuan", "Unit"); },
  // Isian Surat Jalan
  get doKind() { return tt("Jenis Surat Jalan", "Delivery Note Type"); },
  get knownBy() { return tt("Mengetahui", "Acknowledged By"); },
  get sentBy() { return tt("Dikirim Oleh", "Sent By"); },
  get receivedBy() { return tt("Diterima Oleh", "Received By"); },
  get categoryWork() { return "Category Work"; },
  get totalNote() { return tt("Keterangan Total", "Total Notes"); },
  get items() { return tt("Daftar Barang", "Item List"); },
  // Isian CIPL
  get invoiceKind() { return tt("Jenis Invoice", "Invoice Type"); },
  get consigneeAddress() { return tt("Alamat Penerima (Consignee)", "Consignee Address"); },
  get namePlate() { return tt("Berat per Box & Name Plate", "Weight per Box & Name Plate"); },
  // Pihak invoice (invoice-pihak.js)
  get polaPihak() { return tt("Skema Invoice", "Invoice Scheme"); },
  get penjualNama() { return tt("Penjual / Shipper", "Seller / Shipper"); },
  get penjualAlamat() { return tt("Alamat Penjual", "Seller Address"); },
  get penjualNpwp() { return tt("NPWP Penjual", "Seller Tax ID"); },
  get pemilikNama() { return tt("Pemilik Barang", "Goods Owner"); },
  get pemilikAlamat() { return tt("Alamat Pemilik Barang", "Goods Owner Address"); },
  get pemilikNpwp() { return tt("NPWP Pemilik Barang", "Goods Owner Tax ID"); },
  get pembeliNama() { return tt("Pembeli / Buyer", "Buyer"); },
  get pembeliAlamat() { return tt("Alamat Pembeli", "Buyer Address"); },
  get pembeliNegara() { return tt("Negara Pembeli", "Buyer Country"); },
  get penerimaNama() { return tt("Penerima / Consignee", "Consignee"); },
  get penerimaNegara() { return tt("Negara Penerima", "Consignee Country"); },
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
  get siTo() { return tt("SI Ditujukan Ke", "SI Addressed To"); },
  get siNo() { return tt("No. SI", "SI No."); },
  get blType() { return "Bill of Lading"; },
  get oceanFreight() { return "Ocean Freight"; },
  get specialInstruction() { return "Special Instruction"; },
  get remarks() { return tt("Remarks", "Remarks"); },
  // PO & PR (po-form.js)
  get prNo() { return tt("No. Pembelian", "Purchase No."); },
  get prProduk() { return tt("Nama Produk", "Product Name"); },
  get prPemasok() { return tt("Pemasok / Supplier", "Supplier"); },
  get prKategori() { return tt("Kategori Barang", "Goods Category"); },
  get prTujuan() { return tt("Tujuan Penggunaan", "Purpose of Use"); },
  get prTanggal() { return tt("Tanggal Permintaan", "Request Date"); },
  get prTglMasuk() { return tt("Tgl. Permintaan Barang Masuk", "Requested Goods-In Date"); },
  get prTenggat() { return tt("Tenggat Waktu", "Lead Time"); },
  get prTglKirim() { return tt("Tgl. Permintaan Pengiriman", "Requested Shipping Date"); },
  get prMataUang() { return tt("Mata Uang Perkiraan", "Est. Price Currency"); },
  get prDepartemen() { return tt("Nama Departemen", "Department Name"); },
  get prKepalaDept() { return tt("Kepala Departemen", "Head of Department"); },
  get prPenanggungJawab() { return tt("Penanggung Jawab", "Person in Charge"); },
  get prDisusun() { return tt("Disusun", "Prepared By"); },
  get prDisusunTgl() { return tt("Tanggal Disusun", "Prepared Date"); },
  get prDisesuaikan() { return tt("Disesuaikan", "Adjusted By"); },
  get prDiperiksa() { return tt("Diperiksa", "Checked By"); },
  get prDisetujui() { return tt("Disetujui", "Approved By"); },
  get prCatatan() { return tt("Catatan PR", "PR Notes"); },
  get prItems() { return tt("Daftar Barang PR", "PR Items"); },
  get poPenjualNama() { return tt("Nama Penjual", "Seller Name"); },
  get poPenjualAlamat() { return tt("Alamat Penjual", "Seller Address"); },
  get poPenjualAttn() { return "ATTN"; },
  get poPenjualTel() { return "TEL"; },
  get poPembeliNama() { return tt("Nama Pembeli", "Buyer Name"); },
  get poPembeliAlamat() { return tt("Alamat Pembeli", "Buyer Address"); },
  get poPembeliAttn() { return "ATTN"; },
  get poPembeliTel() { return tt("Telepon", "Phone"); },
  get poDelivery() { return "Delivery"; },
  get poPayment() { return "Payment Term"; },
  get poPortLoading() { return "Port of Loading"; },
  get poFinalDest() { return "Final Destination"; },
  get poShipment() { return "Shipment"; },
  get poCarrier() { return "Carrier"; },
  get poNotify() { return "Notify Party"; },
  get poRemarks() { return "Remarks"; },
  get poItems() { return tt("Daftar Barang PO", "PO Items"); },
  get poTtdNama() { return tt("Signed By — Nama", "Signed By — Name"); },
  get poTtdJabatan() { return tt("Signed By — Jabatan", "Signed By — Position"); },
};

/* Isian bertipe tanggal: disimpan ISO ("2026-09-20"), ditampilkan
   sebagai tanggal biasa. */
const DN_FIELD_TANGGAL = new Set([
  "poDate", "sailingDate", "invoiceDate", "invoiceDueDate", "tglBayar", "paidAt",
  "prTanggal", "prTglMasuk", "prTglKirim", "prDisusunTgl",
]);

/* SUSUNAN PER JENIS DOKUMEN.

   Tiap bagian: judul + daftar isian, ATAU satu blok khusus (tabel).
   Isian ditulis sebagai nama kuncinya; bentuk objek dipakai kalau
   labelnya berbeda di dokumen itu (Keterangan di Pengajuan Dana adalah
   Subject suratnya) atau nilainya butuh tempat lebih dari satu kolom:
   `lebar: true` selebar kotak, `lebar: 2` dua kolom (isian sebelahnya
   tetap sebaris -- Rincian dan Lampiran, nomor aju 26 digit).

   Blok khusus (`khusus`) menyebut kunci yang DIPAKAINYA di `memakai`,
   supaya kunci itu tidak muncul sekali lagi di bagian "Lainnya". Kunci
   yang tampil di kepala kotak ada di DN_DETAIL_TERPAKAI. */
const DN_DETAIL_SUSUNAN = {
  invoice: [
    {
      judul: () => "Invoice",
      isian: ["customer", "currency", "amount", { k: "notes", lebar: true }],
    },
    {
      judul: () => tt("Pihak", "Parties"),
      isian: [
        "polaPihak", "penjualNama", "penjualNpwp", { k: "penjualAlamat", lebar: true },
        "pemilikNama", "pemilikNpwp", { k: "pemilikAlamat", lebar: true },
        "pembeliNama", "pembeliNegara", { k: "pembeliAlamat", lebar: true },
        "penerimaNama", "penerimaNegara", { k: "consigneeAddress", lebar: true },
      ],
    },
    {
      judul: () => tt("Data Cetak Commercial Invoice & Packing List", "Commercial Invoice & Packing List Print Data"),
      isian: [
        { k: "shipmentId", lebar: 2 }, "poNo", "notifyParty",
        "termsDelivery", "termPayment", "portLoading", "finalDestination", "carrier",
        "sailingDate", "siTo", "siNo", "blType", "oceanFreight",
        { k: "specialInstruction", lebar: true }, { k: "remarks", lebar: true },
        { k: "namePlate", lebar: true },
      ],
    },
  ],
  do: [
    {
      judul: () => tt("Pengiriman", "Delivery"),
      isian: [
        "receiver", { k: "shipmentId", lebar: 2 }, "vehicle", "poNo", "categoryWork", "totalNote",
        "packages", { k: "address", lebar: true },
      ],
    },
    {
      judul: () => tt("Tanda Tangan", "Signatures"),
      isian: ["knownBy", "sentBy", "receivedBy"],
    },
    { khusus: "barangSuratJalan", memakai: ["items"] },
  ],
  fund: [
    {
      judul: () => tt("Tagihan", "Bill"),
      isian: [
        "payee", "customer", "invoiceNo", "billingNo", "invoiceDate", "invoiceDueDate",
        "blAwb", "docNo", "currency", { k: "dokumen", lebar: true },
      ],
    },
    {
      judul: () => tt("Kepala Surat", "Letter Heading"),
      isian: [
        { k: "notes", lebar: 2, label: () => tt("Rincian (Subject)", "Details (Subject)") },
        "attachment",
      ],
    },
    /* `amount` = Nominal pengajuan format lama: tampil sebagai satu baris
       di tabel pungutan, bukan sebagai isian tersendiri. */
    { khusus: "biaya", memakai: ["lines", "feeBm", "feePpn", "feePph", "amount"] },
    { khusus: "penandaTangan", memakai: ["checkedByName", "checkedByRole", "approver1Name", "approver1Role", "cfoName", "cfoRole"] },
    { judul: () => tt("Pembayaran", "Payment"), isian: ["paidAt", "paidBy", { k: "paidProof", lebar: 2 }] },
  ],
  /* PO & PR: `grup` = dokumen bagiannya -- kotak Detail menampilkan satu
     dokumen sekaligus, dipilih lewat pilihan bergeser PO | PR (dndGrupHtml). */
  po: [
    { grup: "po", judul: () => "Shipper / Seller", isian: ["poPenjualNama", "poPenjualAttn", "poPenjualTel", { k: "poPenjualAlamat", lebar: true }] },
    { grup: "po", judul: () => "Consignee / Buyer", isian: ["poPembeliNama", "poPembeliAttn", "poPembeliTel", { k: "poPembeliAlamat", lebar: true }] },
    {
      grup: "po",
      judul: () => tt("Syarat & Pengiriman", "Terms & Shipping"),
      isian: ["currency", "poDelivery", "poPayment", "poShipment", "poPortLoading", "poFinalDest", "poCarrier", "poNotify", { k: "poRemarks", lebar: true }],
    },
    { grup: "po", khusus: "barangPo", memakai: ["poItems", "poManual"] },
    { grup: "po", judul: () => tt("Tanda Tangan & Groupware", "Signature & Groupware"), isian: ["docNo", "poTtdNama", "poTtdJabatan"] },
    {
      grup: "pr",
      judul: () => tt("Pengajuan Pembelian (PR)", "Purchase Request (PR)"),
      isian: ["prNo", "prProduk", "prPemasok", "prKategori", { k: "prTujuan", lebar: 2 }, "prTanggal", "prTglMasuk", "prTenggat", "prTglKirim", "prMataUang"],
    },
    { grup: "pr", khusus: "barangPr", memakai: ["prItems"] },
    {
      grup: "pr",
      judul: () => tt("Pemohon & Persetujuan", "Requester & Approval"),
      isian: ["prDepartemen", "prKepalaDept", "prPenanggungJawab", "prDisusun", "prDisusunTgl", "prDisesuaikan", "prDiperiksa", "prDisetujui", { k: "prCatatan", lebar: true }],
    },
  ],
  letter: [
    {
      judul: () => tt("Surat", "Letter"),
      isian: ["recipient", "signer", "signerTitle", { k: "subject", lebar: true }, { k: "notes", lebar: true, label: () => tt("Isi Ringkas", "Summary") }],
    },
    {
      judul: () => tt("Data Kiriman", "Shipment Data"),
      isian: [
        { k: "noAju", lebar: 2 }, "invoiceRef", "shipper", "awb", "koliBerat", "negaraAsal", "flightTiba",
        "nilaiBarang", "tglBayar", { k: "namaBarang", lebar: true },
      ],
    },
    { khusus: "barangFungsi", memakai: ["itemsFungsi"] },
  ],
};

/* Kunci yang sudah tampil di KEPALA kotak, menumpang isian lain, atau
   memang bukan untuk dibaca orang -- tidak diulang di "Lainnya". */
const DN_DETAIL_TERPAKAI = new Set([
  // kepala: jenis, tanggal, pemohon
  "docDate", "requester", "department", "invoiceKind", "doKind", "letterType",
  "expenseType", "transactionType",
  // tampil bersama PO No. (nomor & tanggalnya berpasangan)
  "poDate", "poNoExtra", "poDateExtra",
  // mobil kedua dst. tampil bersama No. Kendaraan (vehicle-list.js)
  "vehicleExtra",
  // penanda internal: moda kiriman surat, isian moda yang sudah dihapus
  "moda", "transportMode",
  // PO & PR: daftar PO diubah sendiri (tampil sebagai keterangan tabelnya)
  "poManual",
]);

const DND_IKON = {
  invoice: "bi-receipt",
  do: "bi-truck",
  fund: "bi-cash-coin",
  po: "bi-cart3",
  letter: "bi-envelope-paper",
};

const dndKosong = (v) => String(v == null ? "" : v).trim() === "";

/* Kunci yang belum punya label dirapikan sendiri: "categoryWork" ->
   "Category Work". Isian yang belum terdaftar tidak boleh tampil
   sebagai potongan kode. */
function dndLabel(k) {
  return (
    DN_LABEL_FIELD[k] ||
    String(k)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/* Satu baris larik payload -> teks terbaca. Dipakai untuk larik yang
   belum punya tabelnya sendiri (bagian "Lainnya").

   Bentuknya berbeda antar jenis dokumen (rincian biaya punya
   desc/amount, daftar barang punya nama/qty/satuan), jadi yang
   dikumpulkan adalah nilai yang ADA, bukan susunan tetap. */
function dnRingkasBarisPayload(b) {
  if (b == null) return "";
  if (typeof b !== "object") return String(b);
  const bagian = [
    b.desc || b.nama || "",
    [b.qty, b.satuan].filter((v) => String(v ?? "").trim()).join(" "),
    b.amount != null && String(b.amount).trim() ? "Rp " + formatNilai(parseRupiah(b.amount)) : "",
    b.ppnRate ? "PPN " + b.ppnRate + "%" : "",
    b.ket || "",
  ].filter((v) => String(v).trim());
  return bagian.join(" · ");
}

/* Nama jenis dokumen sebuah baris: sub-jenisnya kalau ada ("Surat
   Jalan Lokal", "Non-Commercial Invoice"), kalau tidak nama jenisnya. */
function dndNamaJenis(r, tab) {
  const sub = DOCNUM_SUBTYPES[tab];
  if (sub) {
    const kena = Object.values(sub).find((s) => s.key === r.doc_type);
    if (kena && kena.label) return kena.label;
  }
  return (DOCNUM_TYPES[tab] || {}).label || "";
}

/* Nomor PO beserta tanggalnya -- yang pertama dan yang tambahan,
   berpasangan menurut urutan. */
function dndDaftarPo(p) {
  const tglLain = p.poDateExtra || [];
  const daftar = [{ no: p.poNo, tgl: p.poDate }]
    .concat((p.poNoExtra || []).map((no, i) => ({ no, tgl: tglLain[i] })))
    .filter((x) => !dndKosong(x.no));
  return daftar
    .map(
      (x) =>
        `<span class="dnd-butir">${escapeHtml(x.no)}${
          x.tgl ? ` <span class="dnd-redup">${escapeHtml(fmtDate(x.tgl))}</span>` : ""
        }</span>`,
    )
    .join("");
}

/* Nomor mobil -- yang pertama dan yang tambahan, satu butir per mobil.
   Disaring sjDaftarKendaraan (surat-jalan-print.js), aturan yang sama
   dengan cetakan surat jalannya. */
function dndDaftarKendaraan(p) {
  return sjDaftarKendaraan(p)
    .map((v) => `<span class="dnd-butir">${escapeHtml(v)}</span>`)
    .join("");
}

/* Nilai satu isian -> HTML siap tampil. String kosong = tidak ada yang
   perlu ditampilkan, dan isiannya dilewati. */
function dndNilai(k, r) {
  const p = r.payload || {};
  const v = p[k];

  if (k === "shipmentId") {
    if (dndKosong(v)) return "";
    const jadwal = typeof sjCariShipment === "function" ? sjCariShipment(v) : null;
    return jadwal
      ? escapeHtml([dispVal(jadwal.invoice), dispVal(jadwal.party)].filter(Boolean).join(" · "))
      : `<span class="dnd-redup">${escapeHtml(t("s.jadwal.tidak.ditemukan"))}</span>`;
  }
  // Bukti bayar (Tandai Sudah Dibayar): tautan yang membuka berkasnya -- hanya selama lunas
  if (k === "paidProof") return p.paidAt && typeof tautanLampiranHtml === "function" ? tautanLampiranHtml(v) : "";
  if (k === "poNo") return dndDaftarPo(p);
  // Tabel berat per box & name plate (invoice Kumho): ringkasan, rinciannya di halamannya sendiri
  if (k === "namePlate") return typeof npRingkasPayload === "function" ? escapeHtml(npRingkasPayload(r)) : "";
  if (k === "vehicle") return dndDaftarKendaraan(p);
  if (k === "polaPihak") return INV_POLA_LABEL[v] ? escapeHtml(tt(...INV_POLA_LABEL[v])) : "";
  if (k === "portLoading" || k === "finalDestination") return escapeHtml(portKodeKeAlias(v));
  // Nama lama "Local Sale" / "Inland Trucking" tampil dengan nama barunya, Trucking (fund-summary.js)
  if (k === "transactionType") {
    const jenis = fundJenisTransaksiBaku(v);
    return dndKosong(jenis) ? "" : escapeHtml(jenis);
  }
  if (k === "carrier") {
    const kapal = typeof dnCarrierInvoice === "function" ? dnCarrierInvoice(p) : v;
    return dndKosong(kapal) ? "" : escapeHtml(kapal);
  }
  /* Nilai selalu dalam mata uang yang tercatat di baris ini. Angka
     telanjang "30,062" tidak memberi tahu rupiah atau dolar, dan pada
     dokumen ekspor bedanya bukan hal kecil. Ditulis dengan KODE-nya
     ("USD 30,062") -- sama dengan kolom Amount di riwayat dan dengan
     Commercial Invoice cetaknya. */
  if (k === "amount") {
    if (dndKosong(v)) return "";
    const mata = String(p.currency || "USD").toUpperCase();
    return escapeHtml(mata + " " + formatNumberValue(parseInputNumber(v)));
  }
  if (k === "dokumen") {
    return (Array.isArray(v) ? v : [])
      .filter((d) => d && !dndKosong(d.nomor))
      .map(
        (d) =>
          `<span class="dnd-butir">${escapeHtml(d.jenis === "debit" ? "Debit Note" : "Invoice")} ${escapeHtml(d.nomor)}${
            d.tanggal ? ` <span class="dnd-redup">${escapeHtml(fmtDate(d.tanggal))}</span>` : ""
          }</span>`,
      )
      .join("");
  }
  if (Array.isArray(v)) {
    return v.map(dnRingkasBarisPayload).filter(Boolean).map(escapeHtml).join("<br>");
  }
  if (dndKosong(v)) return "";
  if (DN_FIELD_TANGGAL.has(k)) return escapeHtml(fmtDate(v));
  return escapeHtml(String(v)).replace(/\n/g, "<br>");
}

/* Label sebuah isian. "Flight & Tanggal Tiba" mengikuti moda kiriman
   surat itu -- "Sail" untuk kapal -- seperti di form dan cetakannya. */
function dndLabelIsian(butir, r) {
  if (butir.label) return butir.label();
  if (butir.k === "flightTiba" && typeof suratLabelAngkut === "function") {
    const moda = (r.payload || {}).moda === "laut" ? "laut" : "udara";
    return suratLabelAngkut(moda, tt(" & Tanggal Tiba", " & Arrival Date"));
  }
  return dndLabel(butir.k);
}

function dndIsianHtml(butir, r) {
  const nilai = dndNilai(butir.k, r);
  if (!nilai) return "";
  const kelas = butir.lebar === 2 ? " dnd-isian--dua" : butir.lebar ? " dnd-isian--lebar" : "";
  return `<div class="dnd-isian${kelas}" data-dnd="${escapeAttr(butir.k)}">
      <dt>${escapeHtml(dndLabelIsian(butir, r))}</dt>
      <dd>${nilai}</dd>
    </div>`;
}

function dndBagianHtml(judul, isi) {
  if (!isi) return "";
  return `<section class="dnd-bagian">
      <h3>${escapeHtml(judul)}</h3>
      ${isi}
    </section>`;
}

/* ---------- blok khusus ---------- */

/* RINCIAN BIAYA Pengajuan Dana.

   Ada `lines` -> tabel rinci (uraian, nilai, tarif PPN, PPN), dipecah
   per invoice / debit note kalau pengajuannya memuat beberapa dokumen,
   lalu Total Nilai, Total PPN, Potongan PPH 23, dan TOTAL.

   Tidak ada -> format lama / Billing: Bea Masuk, PPN Import, PPH
   Import (atau satu baris Jenis Pengeluaran), lalu TOTAL. */
/* TOTAL PER DOKUMEN (invoice + invoice / debit note) -- sama dengan kaki
   form dan baris total per dokumen di surat cetak: Total Nilai, PPN,
   PPH 23 dan TOTAL tiap dokumen yang berisi pos. Satu dokumen saja ->
   tidak ada apa-apa (angkanya sama dengan TOTAL di atasnya). */
function dndTotalPerDokumenHtml(kelompok, tot, mata, jumlah) {
  const perDok = new Map(((tot && tot.perDokumen) || []).map((x) => [x.id, x]));
  const blok = (kelompok || [])
    .filter((d) => perDok.has(d.id))
    .map((d) => {
      const x = perDok.get(d.id);
      const nomor = String(d.nomor || "").trim();
      return `<div class="fl-dok-blok">
          <div class="fl-dok-judul">${escapeHtml(fundDokNama(d.jenis))}${nomor ? ` <b>${escapeHtml(nomor)}</b>` : ""}</div>
          ${jumlah(tt("Total Nilai", "Total Amount"), frNilai(x.totalNet, mata))}
          ${jumlah(tt("Total PPN", "Total PPN"), frNilai(x.totalPpn, mata))}
          ${jumlah(tt(`Potongan PPH 23 (${FUND_PPH23_RATE}%)`, `PPH 23 deduction (${FUND_PPH23_RATE}%)`), x.pph ? "- " + frNilai(x.pph, mata) : "-", "fl-sum--minus")}
          ${jumlah("TOTAL", frNilai(x.grandTotal, mata), "fl-sum--total")}
        </div>`;
    });
  if (blok.length < 2) return "";
  return `<div class="fl-dok-bagian"><div class="fl-dok-kepala">${escapeHtml(tt("Total per dokumen", "Totals per document"))}</div><div class="fl-dok-daftar">${blok.join("")}</div></div>`;
}

/* TOTAL yang disesuaikan manual di form (fundSesuaikanManual): hitungan
   rumusnya disebut, supaya selisih Rp 1-nya tidak membingungkan. */
function dndCatatanManualHtml(tot, mata) {
  const selisih = fundBulatSen(tot.grandTotal - tot.grandTotalHitung);
  return `<div class="fl-total-catatan"><span><i class="bi bi-pencil-square" aria-hidden="true"></i> ${escapeHtml(tt(
    `TOTAL disesuaikan manual · hitungan sistem ${frNilai(tot.grandTotalHitung, mata)} (selisih ${selisih > 0 ? "+" : "−"}${frNilai(Math.abs(selisih), mata)})`,
    `TOTAL adjusted manually · system total ${frNilai(tot.grandTotalHitung, mata)} (difference ${selisih > 0 ? "+" : "−"}${frNilai(Math.abs(selisih), mata)})`))}</span></div>`;
}

function dndBiayaHtml(r) {
  const p = r.payload || {};
  const mata = String(p.currency || "IDR").toUpperCase();
  /* Sel tabel berisi angka POLOS; satuannya sekali saja di kepala kolom
     ("Nilai (Rp)"), seperti di form. "Rp." yang diulang di tiap sel
     hanya menambah tinta dan membuat angkanya lebih sulit dibandingkan
     dari baris ke baris. Nol ditulis tanda pisah, bukan "0". */
  const satuan = `<span class="dnd-satuan">(${escapeHtml(mata === "IDR" ? "Rp" : mata)})</span>`;
  const polos = (v) => (v ? (v < 0 ? "- " : "") + formatNilai(Math.abs(v)) : "—");
  const jumlah = (label, nilai, kelas) =>
    `<div class="fl-sum${kelas ? " " + kelas : ""}"><span>${escapeHtml(label)}</span><b>${escapeHtml(nilai)}</b></div>`;

  if (Array.isArray(p.lines) && p.lines.length) {
    const daftar = normalisasiBarisDana(p.lines);
    const nilai = fundLineValues(daftar);
    const ppn = fundLinePpnDaftar(daftar, nilai, mata, p.payee);
    const tot = fundLineTotals(daftar, mata, p.payee, p.dokumen || [], p.totalManual);
    /* Pengajuan untuk beberapa BL/AWB: kolom BL/AWB per baris dan bagian
       tiap BL/AWB di bawah TOTAL -- sama dengan form & surat cetaknya. */
    const awb = fundDaftarAwb(p.blAwb);
    // Trucking: nomor DO / Surat Jalan, tidak dipecah per BL/AWB
    const pakaiAwb = awb.length > 1 && !fundTanpaPecahAwb(p);
    const teksAwb = (b) => {
      const k = kunciAlnum(b.awb);
      const a = awb.find((x) => x.kunci === k);
      if (a) return escapeHtml(a.teks);
      return `<span class="dnd-redup">${escapeHtml(barisDiskon(b) ? tt("ikut pos di atas", "same as above") : tt("dibagi rata", "split evenly"))}</span>`;
    };
    /* Tarif PPN ditulis dua kali: di kolomnya sendiri, dan kecil di bawah
       angka PPN-nya. Yang kedua hanya tampil di ponsel, tempat kolom
       tarif (dan nomor urut) disembunyikan supaya uraian dan kedua angka
       muat tanpa menggeser tabel ke samping. */
    const barisPos = (b, i) => {
      const tarif = fundLineRate(b) ? escapeHtml(String(fundLineRate(b))) + "%" : "";
      return `<tr${barisDiskon(b) ? ' class="dnd-diskon"' : ""}>
        <td class="dnd-no">${i + 1}</td>
        <td>${escapeHtml(b.desc || "")}</td>${pakaiAwb ? `<td class="dnd-awb">${teksAwb(b)}</td>` : ""}
        <td class="dnd-angka">${escapeHtml(polos(nilai[i]))}</td>
        <td class="dnd-tarif">${tarif || "—"}</td>
        <td class="dnd-angka">${escapeHtml(polos(ppn[i]))}${tarif ? `<span class="dnd-tarif-kecil">${tarif}</span>` : ""}</td>
      </tr>`;
    };
    /* Beberapa dokumen: pos tampil di bawah judul dokumennya -- sama
       dengan pengelompokan di form dan di surat cetak. */
    const dokumen = (Array.isArray(p.dokumen) ? p.dokumen : []).filter((d) => d && d.id);
    const kelompok = [{ id: "", jenis: "invoice", nomor: p.invoiceNo }].concat(dokumen);
    const idKelompok = new Set(kelompok.map((d) => d.id));
    const milik = (b, d) => String(b.dok || "") === d.id || (!d.id && !idKelompok.has(String(b.dok || "")));
    const badan = dokumen.length
      ? kelompok
          .map(
            (d) =>
              `<tr class="dnd-grup"><td colspan="${pakaiAwb ? 6 : 5}">${escapeHtml(d.jenis === "debit" ? "Debit Note" : "Invoice")} ${escapeHtml(d.nomor || "—")}</td></tr>` +
              daftar.map((b, i) => (milik(b, d) ? barisPos(b, i) : "")).join(""),
          )
          .join("")
      : daftar.map(barisPos).join("");

    return dndBagianHtml(
      tt("Rincian Biaya", "Cost Breakdown"),
      `<div class="dnd-tabel-wrap">
        <table class="dnd-tabel dnd-tabel--biaya">
          <thead><tr>
            <th class="dnd-no">No.</th>
            <th>${escapeHtml(tt("Uraian", "Description"))}</th>${pakaiAwb ? `<th class="dnd-awb">BL/AWB</th>` : ""}
            <th class="dnd-angka">${escapeHtml(tt("Nilai", "Amount"))} ${satuan}</th>
            <th class="dnd-tarif">PPN</th>
            <th class="dnd-angka">PPN ${satuan}</th>
          </tr></thead>
          <tbody>${badan}</tbody>
        </table>
      </div>
      <div class="fund-lines-foot dnd-jumlah">
        ${jumlah(tt("Total Nilai", "Total Amount"), frNilai(tot.totalNet, mata))}
        ${jumlah(tt("Total PPN", "Total PPN"), frNilai(tot.totalPpn, mata))}
        ${jumlah(tt(`Potongan PPH 23 (${FUND_PPH23_RATE}%)`, `PPH 23 deduction (${FUND_PPH23_RATE}%)`), tot.pph ? "- " + frNilai(tot.pph, mata) : "-", "fl-sum--minus")}
        ${jumlah("TOTAL", frNilai(tot.grandTotal, mata), "fl-sum--total")}
        ${tot.manual ? dndCatatanManualHtml(tot, mata) : ""}
        ${dndTotalPerDokumenHtml(kelompok, tot, mata, jumlah)}
        ${
          pakaiAwb
            ? `<div class="fl-awb-bagian"><div class="fl-awb-judul">${escapeHtml(tt("Bagian per BL/AWB", "Share per BL/AWB"))}</div>${fundBagiPerAwb(p)
                .map((b) => jumlah(b.teks + (b.rata && !b.tautan ? " · " + tt("dibagi rata", "split evenly") : ""), frNilai(b.dibayar, mata), "fl-sum--awb"))
                .join("")}</div>`
            : ""
        }
      </div>`,
    );
  }

  const baris = frBarisRincian(p).filter((b) => b.nilai);
  if (!baris.length) return "";
  // Bea Masuk + PPN + PPH = Total PDRI, seperti di form Billing (gambarTotalPdri); Nominal format lama tetap TOTAL
  const pungutan = [p.feeBm, p.feePpn, p.feePph].some((v) => frAngka(v) > 0);
  return dndBagianHtml(
    tt("Rincian Pungutan", "Charge Breakdown"),
    `<div class="dnd-tabel-wrap">
      <table class="dnd-tabel">
        <thead><tr>
          <th class="dnd-no">No.</th>
          <th>${escapeHtml(tt("Uraian", "Description"))}</th>
          <th class="dnd-angka">${escapeHtml(tt("Nilai", "Amount"))} ${satuan}</th>
        </tr></thead>
        <tbody>${baris
          .map(
            (b, i) => `<tr>
          <td class="dnd-no">${i + 1}</td>
          <td>${escapeHtml(b.label)}</td>
          <td class="dnd-angka">${escapeHtml(polos(b.nilai))}</td>
        </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>
    <div class="fund-lines-foot dnd-jumlah">
      ${jumlah(pungutan ? "Total PDRI" : "TOTAL", frNilai(frTotal(baris), mata), "fl-sum--total")}
    </div>`,
  );
}

/* Penanda tangan Form Pengajuan Dana -- tiga, atau empat (CFO) untuk
   vendor yang Doc No-nya dicetak; nama & jabatan bawaannya sama dengan
   yang tercetak (lihat buildFundRequestHtml). */
function dndPenandaTanganHtml(r) {
  const p = r.payload || {};
  const cfo = typeof frPakaiTtdCfo === "function" && frPakaiTtdCfo(p);
  const kotak = (peran, nama, jabatan) => `<div class="dnd-ttd-kotak">
      <span class="dnd-ttd-peran">${escapeHtml(peran)}</span>
      <b>${escapeHtml(nama || "—")}</b>
      <span class="dnd-redup">${escapeHtml(jabatan || "")}</span>
    </div>`;
  return dndBagianHtml(
    tt("Penanda Tangan", "Signatories"),
    `<div class="dnd-ttd${cfo ? " dnd-ttd--empat" : ""}">
      ${kotak("Made by", p.requester || r.requester, "Drafter")}
      ${kotak("Checked by", p.checkedByName || "M. Rangga", p.checkedByRole || "Accounting")}
      ${kotak("Approved by", p.approver1Name || "Mr. Shin Na Ra", p.approver1Role || "Chief Marketing Officer")}
      ${cfo ? kotak("Approved by", p.cfoName || FR_TTD_CFO.nama, p.cfoRole || FR_TTD_CFO.jabatan) : ""}
    </div>`,
  );
}

/* Daftar barang surat jalan Lokal (diketik di formnya). Surat jalan
   Export mengambil barangnya dari jadwal yang ditautkan, jadi tidak
   punya daftar sendiri. */
function dndBarangSuratJalanHtml(r) {
  const daftar = ((r.payload || {}).items || []).filter(Boolean);
  if (!daftar.length) return "";
  return dndBagianHtml(
    tt("Daftar Barang", "Item List"),
    `<div class="dnd-tabel-wrap">
      <table class="dnd-tabel dnd-tabel--barang">
        <thead><tr>
          <th class="dnd-no">No.</th>
          <th>${escapeHtml(tt("Nama Barang", "Item Name"))}</th>
          <th class="dnd-angka">Qty</th>
          <th>${escapeHtml(tt("Satuan", "Unit"))}</th>
          <th>${escapeHtml(tt("Keterangan", "Notes"))}</th>
        </tr></thead>
        <tbody>${daftar
          .map(
            (b, i) => `<tr>
          <td class="dnd-no">${i + 1}</td>
          <td>${escapeHtml(b.nama || b.desc || "")}</td>
          <td class="dnd-angka">${escapeHtml(String(b.qty == null ? "" : b.qty))}</td>
          <td>${escapeHtml(b.satuan || "")}</td>
          <td>${escapeHtml(b.ket || "")}</td>
        </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`,
  );
}

/* Barang, fungsi & foto pada Surat Keterangan Fungsi Barang. */
function dndBarangFungsiHtml(r) {
  const daftar = ((r.payload || {}).itemsFungsi || []).filter(Boolean);
  if (!daftar.length) return "";
  return dndBagianHtml(
    tt("Barang, Fungsi & Foto", "Goods, Function & Photo"),
    `<div class="dnd-tabel-wrap">
      <table class="dnd-tabel dnd-tabel--fungsi">
        <thead><tr>
          <th class="dnd-no">No.</th>
          <th>${escapeHtml(tt("Barang / HS Code", "Item / HS Code"))}</th>
          <th>${escapeHtml(tt("Fungsi & Kegunaan", "Function & Use"))}</th>
          <th>${escapeHtml(tt("Foto", "Photo"))}</th>
        </tr></thead>
        <tbody>${daftar
          .map(
            (b, i) => `<tr>
          <td class="dnd-no">${i + 1}</td>
          <td>${escapeHtml(b.nama || "")}${b.hs ? `<div class="dnd-redup dnd-mono">${escapeHtml(b.hs)}</div>` : ""}</td>
          <td>${escapeHtml(b.fungsi || "").replace(/\n/g, "<br>")}</td>
          <td class="dnd-foto">${b.foto ? `<img src="${escapeAttr(b.foto)}" alt="">` : `<span class="dnd-redup">—</span>`}</td>
        </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`,
  );
}

/* Daftar barang PO & PR (po-form.js): tabel + totalnya. PO yang belum
   punya daftar sendiri menampilkan turunan PR-nya -- yang juga dicetak. */
function dndBarangPoPrHtml(r, jenis) {
  const p = r.payload || {};
  const daftar = jenis === "pr" ? poBarisBersih("pr", p.prItems) : poBarangCetak(p);
  if (!daftar.length) return "";
  const mata = jenis === "pr" ? p.prMataUang || "IDR" : p.currency || "USD";
  const angka = (n) => (n ? escapeHtml(formatNilai(n)) : "");
  let kolom = jenis === "pr"
    ? [["nama", tt("Nama Produk", "Product Name")], ["spek", tt("Spesifikasi", "Specification")], ["qty", "QTY"], ["harga", tt("Perk. Harga Satuan", "Est. Unit Price")], ["jumlah", tt("Perk. Jumlah", "Est. Amount")], ["pemasok", "Supplier"], ["catatan", tt("Catatan", "Notes")]]
    : [["produk", "Product"], ["spek", "Spec / Model"], ["qty", "Qty"], ["harga", "Unit Price"], ["jumlah", "Amount"], ["catatan", tt("Catatan", "Notes")]];
  const uang = new Set(["harga", "jumlah"]);
  /* Qty & satuan SATU kolom ("1 SET", rata tengah) -- sama dengan cetakan PO
     & PR; di form tetap dua kotak */
  const kelas = (k) => (k === "qty" ? ' class="dnd-tengah"' : uang.has(k) ? ' class="dnd-angka"' : "");
  const total = poTotal(jenis, daftar);
  // Kolom yang kosong di SEMUA barang tidak ditampilkan (harga PR yang belum diperkirakan, catatan)
  const adaIsi = (k) => (k === "jumlah" ? !!total : k === "qty" ? daftar.some((b) => poQtyTeks(b)) : daftar.some((b) => (uang.has(k) ? poAngka(b[k]) : String(b[k] == null ? "" : b[k]).trim())));
  kolom = kolom.filter(([k]) => k === "nama" || k === "produk" || adaIsi(k));
  const turunan = jenis === "po" && !poBarisBersih("po", p.poItems).length;
  return dndBagianHtml(
    jenis === "pr" ? tt("Daftar Barang PR", "PR Items") : tt("Daftar Barang PO", "PO Items"),
    `${turunan ? `<p class="dnd-redup dnd-po-turunan">${escapeHtml(tt("Dari daftar barang PR (PO belum diubah sendiri).", "From the PR item list (the PO has not been edited by hand)."))}</p>` : ""}
    <div class="dnd-tabel-wrap">
      <table class="dnd-tabel dnd-tabel--po">
        <thead><tr><th class="dnd-no">No.</th>${kolom.map(([k, label]) => `<th${kelas(k)}>${escapeHtml(label)}${k === "harga" || k === "jumlah" ? ` (${escapeHtml(mata)})` : ""}</th>`).join("")}</tr></thead>
        <tbody>${daftar
          .map(
            (b, i) => `<tr><td class="dnd-no">${i + 1}</td>${kolom
              .map(([k]) => {
                if (k === "jumlah") return `<td class="dnd-angka">${angka(poJumlahBaris(jenis, b))}</td>`;
                if (k === "qty") return `<td${kelas(k)}>${escapeHtml(poQtyTeks(b))}</td>`;
                if (uang.has(k)) return `<td${kelas(k)}>${angka(poAngka(b[k]))}</td>`;
                return `<td${kelas(k)}>${escapeHtml(String(b[k] == null ? "" : b[k]))}</td>`;
              })
              .join("")}</tr>`,
          )
          .join("")}</tbody>
        ${total ? (() => {
          // TOTAL tepat di bawah kolom jumlahnya
          const iJumlah = kolom.findIndex(([k]) => k === "jumlah");
          return `<tfoot><tr><th colspan="${iJumlah + 1}" class="dnd-angka">${escapeHtml(jenis === "pr" ? tt("Total Harga", "Total Price") : "TOTAL")}</th><td class="dnd-angka"><b>${escapeHtml(`${mata} ${formatNilai(total)}`)}</b></td>${kolom.length - iJumlah - 1 > 0 ? `<td colspan="${kolom.length - iJumlah - 1}"></td>` : ""}</tr></tfoot>`;
        })() : ""}
      </table>
    </div>`,
  );
}

const DND_BLOK_KHUSUS = {
  biaya: dndBiayaHtml,
  penandaTangan: dndPenandaTanganHtml,
  barangSuratJalan: dndBarangSuratJalanHtml,
  barangFungsi: dndBarangFungsiHtml,
  barangPo: (r) => dndBarangPoPrHtml(r, "po"),
  barangPr: (r) => dndBarangPoPrHtml(r, "pr"),
};

/* ---------- kepala ---------- */

/* Invoice yang BELUM ditautkan ke jadwal: angka di kepala kotak adalah
   isian Nilai-nya sendiri, jadi isian itu tidak diulang di badan. Yang
   sudah ditautkan menampilkan Total dari jadwalnya di kepala, dan isian
   Nilai tetap tampil di badan -- keduanya bisa berbeda, dan bedanya
   justru yang perlu terlihat. */
function dndNilaiDariIsian(r, tab) {
  if (tab !== "invoice" || dndKosong((r.payload || {}).amount)) return false;
  return !(typeof dnNilaiInvoice === "function" && dnNilaiInvoice(r));
}

function dndKepalaHtml(r, tab) {
  const p = r.payload || {};
  /* Penjelas jenis. Invoice & Surat Jalan sudah menyebut sub-jenisnya di
     namanya ("Non-Commercial Invoice", "Surat Jalan Lokal"); Pengajuan
     Dana dan Surat membawanya sebagai isian tersendiri. */
  const cip = (tab === "fund" ? [p.expenseType, fundJenisTransaksiBaku(p.transactionType)] : tab === "letter" ? [p.letterType] : [])
    .filter((x) => !dndKosong(x))
    .map((x) => `<span class="dnd-cip">${escapeHtml(x)}</span>`)
    .join("");
  const meta = [r.doc_date ? fmtDate(r.doc_date) : "", r.requester, r.department]
    .filter((x) => !dndKosong(x))
    .map((x) => `<span>${escapeHtml(x)}</span>`)
    .join("");

  let sisi = "";
  if (tab === "fund") {
    const lunas = !!p.paidAt;
    sisi = `<div class="dnd-sisi">
        <span class="dn-bayar ${lunas ? "dn-bayar--lunas" : "dn-bayar--belum"}">${
          lunas
            ? `<i class="bi bi-check-circle-fill"></i> ${escapeHtml(tt("Lunas", "Paid"))}<span class="dn-bayar-tgl">${escapeHtml(fmtDate(p.paidAt))}</span>`
            : `<i class="bi bi-hourglass-split"></i> ${escapeHtml(tt("Belum Lunas", "Unpaid"))}`
        }</span>
        <span class="dnd-sisi-label">${escapeHtml(tt("Total pengajuan", "Request total"))}</span>
        <span class="dnd-sisi-nilai">${escapeHtml(frNilai(frTotalPengajuan(p), p.currency || "IDR"))}</span>
      </div>`;
  } else if (tab === "po") {
    const teks = typeof dnTeksNilaiPo === "function" ? dnTeksNilaiPo(p) : "";
    sisi = `<div class="dnd-sisi">
        <span class="dnd-sisi-label">${escapeHtml(p.docNo ? `Doc No ${p.docNo}` : tt("Doc No Groupware belum diisi", "Groupware Doc No not filled yet"))}</span>
        ${teks ? `<span class="dnd-sisi-nilai">${escapeHtml(teks)}</span>` : ""}
      </div>`;
  } else if (tab === "invoice") {
    /* Nilai invoice = baris Total di Commercial Invoice cetaknya (dari
       jadwal yang ditautkan); belum ditautkan -> isian Nilai. */
    const dariJadwal = typeof dnNilaiInvoice === "function" ? dnNilaiInvoice(r) : null;
    const teks = dariJadwal ? dnTeksNilaiInvoice(r) : dndNilai("amount", r);
    if (teks) {
      sisi = `<div class="dnd-sisi">
          <span class="dnd-sisi-label">${escapeHtml(tt("Nilai invoice", "Invoice value"))}</span>
          <span class="dnd-sisi-nilai">${dariJadwal ? escapeHtml(teks) : teks}</span>
        </div>`;
    }
  }

  return `<div class="dnd-utama">
      <div class="dnd-jenis"><i class="bi ${DND_IKON[tab] || "bi-file-earmark-text"}"></i><span>${escapeHtml(dndNamaJenis(r, tab))}</span>${cip}</div>
      <div class="dnd-nomor">
        <span id="dnDetailNomor">${escapeHtml(r.doc_number || "—")}</span>
        <button type="button" class="dnd-salin" data-dnd-salin="${escapeAttr(r.doc_number || "")}"
                title="${escapeAttr(tt("Salin nomor", "Copy number"))}" aria-label="${escapeAttr(tt("Salin nomor", "Copy number"))}"><i class="bi bi-clipboard"></i></button>
      </div>
      <div class="dnd-meta">${meta}</div>
    </div>
    ${sisi}`;
}

/* ---------- badan ---------- */

let dndGrupAktif = "po"; // PO & PR: dokumen yang sedang ditampilkan kotak Detail

function dndBadanHtml(r, tab) {
  const p = r.payload || {};
  const tampil = new Set(DN_DETAIL_TERPAKAI);
  const grup = {}; // grup -> html bagian-bagiannya (PO & PR)
  const bagian = [];
  (DN_DETAIL_SUSUNAN[tab] || []).forEach((b) => {
    let html;
    if (b.khusus) {
      (b.memakai || []).forEach((k) => tampil.add(k));
      html = DND_BLOK_KHUSUS[b.khusus](r);
    } else {
      const butir = b.isian.map((x) => (typeof x === "string" ? { k: x } : x));
      butir.forEach((x) => tampil.add(x.k));
      const isi = butir
        .filter((x) => !(x.k === "amount" && dndNilaiDariIsian(r, tab)))
        .map((x) => dndIsianHtml(x, r))
        .join("");
      html = dndBagianHtml(b.judul(), isi ? `<dl class="dnd-kisi">${isi}</dl>` : "");
    }
    if (b.grup) grup[b.grup] = (grup[b.grup] || "") + html;
    else bagian.push(html);
  });
  if (Object.keys(grup).length) bagian.unshift(dndGrupHtml(grup));

  // Isian yang belum punya tempat di susunan jenis ini
  const lain = Object.keys(p)
    .filter((k) => !tampil.has(k))
    .map((k) => dndIsianHtml({ k, lebar: Array.isArray(p[k]) }, r))
    .join("");
  bagian.push(dndBagianHtml(tt("Lainnya", "Other"), lain ? `<dl class="dnd-kisi">${lain}</dl>` : ""));

  const html = bagian.join("");
  return html || `<div class="dnd-kosong">${escapeHtml(tt("Pengajuan ini tidak membawa isian lain.", "This request carries no other fields."))}</div>`;
}

/* Pilihan bergeser PO | PR di atas isi kotak Detail -- gaya yang sama dengan
   pilihan dokumen pratinjau cetak (.cetak-varian). Dokumen tanpa isi tetap
   bisa dipilih: "belum diisi". */
function dndGrupHtml(grup) {
  const daftar = [["po", "PO"], ["pr", "PR"]];
  if (!daftar.some(([k]) => k === dndGrupAktif)) dndGrupAktif = "po";
  const ke = daftar.findIndex(([k]) => k === dndGrupAktif);
  const kosong = `<div class="dnd-kosong">${escapeHtml(tt("Bagian ini belum diisi.", "This part has not been filled in yet."))}</div>`;
  return `<div class="dnd-grup-pilih"><div class="cetak-varian" role="tablist" aria-label="${escapeAttr(tt("Dokumen", "Document"))}" style="--varian-n:2;--varian-ke:${ke}">${daftar
    .map(([k, label]) => `<button type="button" role="tab" class="cetak-varian-btn${k === dndGrupAktif ? " is-aktif" : ""}" data-dnd-grup="${k}" aria-selected="${k === dndGrupAktif}">${label}</button>`)
    .join("")}</div></div>${daftar.map(([k]) => `<div data-dnd-isi-grup="${k}"${k === dndGrupAktif ? "" : " hidden"}>${grup[k] || kosong}</div>`).join("")}`;
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-dnd-grup]");
  if (!tombol) return;
  dndGrupAktif = tombol.dataset.dndGrup;
  const badan = tombol.closest("#dnDetailBadan");
  if (!badan) return;
  const pilih = tombol.closest(".cetak-varian");
  pilih.querySelectorAll("[data-dnd-grup]").forEach((b, i) => {
    const aktif = b === tombol;
    b.classList.toggle("is-aktif", aktif);
    b.setAttribute("aria-selected", String(aktif));
    if (aktif) pilih.style.setProperty("--varian-ke", String(i));
  });
  badan.querySelectorAll("[data-dnd-isi-grup]").forEach((isi) => (isi.hidden = isi.dataset.dndIsiGrup !== dndGrupAktif));
});

let dndTerbuka = null; // id nomor yang sedang dibuka di pop-up Detail

function dndGambar(r) {
  /* doc_type selalu ikut diambil bersama riwayat; penjagaan ini hanya
     untuk baris yang tidak membawanya -- lebih baik membaca jenis dari
     tab yang sedang dibuka daripada menebak "invoice". */
  const tab = r.doc_type ? docNumTabKeyFor(r.doc_type) : docNumActiveTab;
  $("#dnDetailKepala").innerHTML = dndKepalaHtml(r, tab);
  $("#dnDetailBadan").innerHTML = dndBadanHtml(r, tab);
}

function tampilkanDetailNomor(id) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  dndGrupAktif = "po";
  dndGambar(r);
  dndTerbuka = r.id;
  bootstrap.Modal.getOrCreateInstance($("#dnDetailModal")).show();
}
$("#dnDetailModal")?.addEventListener("hidden.bs.modal", () => {
  dndTerbuka = null;
});

/* Pembaruan realtime (docnum-view.js): pop-up yang sedang membuka nomor
   yang diubah pengguna lain digambar ulang dari riwayat yang baru saja
   disegarkan; yang dihapus diberi tahu di kepalanya. */
function dndSegarkan(id, dihapus) {
  if (dndTerbuka == null || String(dndTerbuka) !== String(id)) return;
  if (dihapus) {
    const nomor = $("#dnDetailKepala .dnd-nomor");
    if (nomor && !nomor.querySelector(".dnd-dihapus")) {
      nomor.insertAdjacentHTML("beforeend", ` <span class="dnd-dihapus">${escapeHtml(tt("— baru saja dihapus pengguna lain", "— just deleted by another user"))}</span>`);
    }
    return;
  }
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(id));
  if (r) dndGambar(r);
}

document.addEventListener("click", async (e) => {
  const tombol = e.target.closest && e.target.closest("[data-dnd-salin]");
  if (!tombol || !tombol.dataset.dndSalin) return;
  const ok = await copyToClipboard(tombol.dataset.dndSalin);
  showToast(ok ? t("z.nomor.disalin") : t("z.gagal.menyalin.nomor"), ok ? "success" : "danger");
});
