"use strict";

/* ------------------------------------------------------------------
   CIPL KUMHO (layout "vn") -- BERGAYA DYNAMIC DESIGN

   Isinya tetap milik pembeli ini: Seller (Dynamic Design Korea),
   Shipper (PT DDI), Consignee Kumho, nomor invoice berakhiran tanggal,
   L/C, notify, keterangan bank, penanda koli ("C# : 8-1") dan penanda
   pengapalan. Tampilannya mengikuti lembar Dynamic Design -- kartu
   berkepala navy, rincian pengiriman, tabel bergaris tipis, TOTAL satu
   baris, tanda tangan 50 mm -- lewat penyusun yang SAMA
   (ciplTataFormal, cipl-print.js), jadi cetakan & Excel-nya sama persis.

   Dipilih lewat profil pelanggan (`layout: "vn"` di cipl-print.js).

   ATURAN NAMA BARANG: Description + Pattern + Size + Mold No -- kolom
   barang CEISA kiri ke kanan (itemDisplayName, core/helpers.js), satu
   spasi, yang sudah tertulis tidak diulang.
------------------------------------------------------------------ */

/* MARKS: "C# : 8-1" .. "C# : 8-8".

   Angka pertama = jumlah koli seluruh pengapalan, angka kedua = urutan
   koli itu. Dibangkitkan dari jumlah barang, TAPI kolom Marks pada
   barang menang kalau diisi -- penandaan di lapangan tidak selalu
   mengikuti urutan, dan yang tertulis di peti itulah yang harus
   tercetak. */
function ciplVnMarks(it, idx, total) {
  const manual = String((it && it.marks) || "").trim();
  if (manual) return manual;
  return `C# : ${total}-${idx + 1}`;
}

function ciplVnUraian(it) {
  return itemDisplayName(it);
}

function ciplVnBaris(shipment) {
  const items = ((shipment && shipment.items) || []).filter((it) =>
    String(it.namaBarang || "").trim(),
  );
  const total = items.length;
  return items.map((it, i) => ({
    marks: ciplVnMarks(it, i, total),
    uraian: ciplVnUraian(it),
    qty: parseLooseNumber(it.qty),
    satuan: String(it.satuan || "").trim().toUpperCase(),
    harga: parseLooseNumber(it.harga),
    netto: parseLooseNumber(it.netto),
    bruto: parseLooseNumber(it.bruto),
    package: String(it.package || "").trim(),
  }));
}

function ciplVnTotal(baris) {
  return baris.reduce(
    (a, b) => ({
      qty: a.qty + b.qty,
      nilai: a.nilai + b.qty * b.harga,
      netto: a.netto + b.netto,
      bruto: a.bruto + b.bruto,
    }),
    { qty: 0, nilai: 0, netto: 0, bruto: 0 },
  );
}

/* Baris DIMENSION pada Packing List: peti seukuran dan sejenis digabung,
   jumlahnya DIJUMLAHKAN dari kolom Kemasan tiap barang
   ("120 * 122 * 71 (cm) * 4 BX", "100 * 100 * 90 (cm) * 2 PLT").
   Dipakai juga lembar Dynamic Design.

   Yang dihitung KEMASANNYA, bukan baris barangnya: satu barang bisa
   terdiri dari beberapa peti, dan peti seukuran dari barang berbeda
   dijumlahkan. (Dulu tiap baris barang dihitung satu, jadi barang
   berkemasan 3 BOX tetap tercetak "* 1 BX" -- tak cocok dengan total
   "N PACKAGES" dan CBM di bawahnya.) Jenisnya dari kolom Jenis Kemasan
   barang itu; kosong = ikut barang di atasnya, BOX bila belum ada
   ("↳ ikut" di tabel barang). Ukuran sama tapi jenis beda = baris sendiri.

   Barang yang kolom Kemasan-nya KOSONG masih satu kemasan dengan barang
   di atasnya, jadi tidak menambah hitungan -- sama dengan total
   "N PACKAGES" (ciplTotalKoli). Satu-satunya pengecualian: data lama
   yang sama sekali tak mencatat jumlah kemasan. Di sana satu set = satu
   peti, jadi jumlahnya qty barang -- aturan yang sama dengan CBM
   (computeItemCbm) dan total PACKAGES lembar Kumho. */
function ciplVnDimensi(items) {
  const daftar = items || [];
  const adaJumlah = daftar.some((it) => ciplKoliBarang(it) > 0);
  const hitung = new Map();
  let jenisAtas = "";
  daftar.forEach((it) => {
    const jumlah = ciplKoliBarang(it) || (adaJumlah ? 0 : parseLooseNumber(it && it.qty) || 1);
    if (!jumlah) return;
    const satuan = ciplSatuanKemasan(ciplJenisKemasanBarang(it) || jenisAtas || "BOX");
    jenisAtas = satuan;
    const d = parsePackageDims(it && it.package);
    if (!d) return;
    const ukuran = `${d.p} * ${d.l} * ${d.t}`;
    const kunci = `${ukuran}|${satuan}`;
    const grup = hitung.get(kunci) || { ukuran, satuan, jumlah: 0 };
    grup.jumlah += jumlah;
    hitung.set(kunci, grup);
  });
  return [...hitung.values()].map(
    (g) => `DIMENSION : ${g.ukuran} (cm) * ${Math.round(g.jumlah * 1000) / 1000} ${g.satuan}`,
  );
}

/* Seller & Shipper tetap. */
const CIPL_VN_SELLER = [
  "Dynamic Design CO., LTD.",
  "12, CHEOMDANYEONSIN-RO 29BEON-GIL,",
  "BUK-GU 61089, GWANGJU, KOREA",
  "ATTN : Jae Jun, Kim",
  "TEL :+82-62-720-7845",
  "E-MAIL : info@dynamicdesign.co.kr",
];

const CIPL_VN_SHIPPER = [
  "PT Dynamic Design Indonesia",
  "Jalan Mayjend Sutoyo No. 1 Desa/Kelurahan Pabedilan Kulon,",
  "Kec. Pabedilan Kab. Cirebon, Provinsi Jawa Barat, 45193",
  "ATTN : MR. JEON JEONGHO",
  "E-mail : jjh2296@dynamicdesign.co.kr",
  "Tel : +622318886161     TAX ID : 0656 3197 7906 1000",
];

/* Keterangan bank penerima pembayaran (Seller) -- kotak kiri bawah CI. */
const CIPL_VN_BANK = [
  "*BANKER : Citibank Korea Inc",
  "Jungang Citi Service Center (27)",
  "(SWIFT : CITIKRSX)",
  "*ACCOUNT NO. : 1-089331-143-01",
  "DYNAMIC DESIGN CO.,LTD",
];

/* Penanda pengapalan: "Dynamic Design" / pembeli tanpa akhiran badan
   hukum / nomor invoice -- untuk dibaca di gudang, jadi ditulis ringkas. */
function ciplVnPenanda(row, shipment) {
  const p = row.payload || {};
  const pembeli = String(p.customer || (shipment && shipment.party) || "")
    .replace(/[,\s]*(CO\.?,?\s*LTD\.?|LTD\.?|INC\.?)\s*$/i, "")
    .trim();
  return ["Dynamic Design", pembeli, row.doc_number || ""].filter(Boolean).map(ciplKapital);
}

/* LEMBAR CI / PL KUMHO */
function ciplVnTata(jenis, row, shipment) {
  const ci = jenis === "CI";
  const p = row.payload || {};
  const prof = ciplProfil(p.customer || (shipment && shipment.party));
  const baris = ciplVnBaris(shipment);
  const total = ciplVnTotal(baris);
  const uang = ciplFormatUang(p.currency || "USD", baris.flatMap((b) => [b.harga, b.qty * b.harga]));
  const angka = (n, satuan) => {
    const f = ciplFormatAngka(n, satuan);
    return { angka: { v: f.v, fmt: f.f, teks: f.teks } };
  };
  const duit = (n) => ({ angka: { v: Number(n) || 0, fmt: uang.f, teks: uang.teks(n) } });
  // Consignee = Penerima (alamat profil bila belum diisi); Seller = Pembeli; Shipper = Penjual
  const consignee = ciplPihakBaris(p.penerimaNama || p.customer || (shipment && shipment.party) || "",
    p.consigneeAddress || (prof.lines || []).join("\n"));
  const seller = String(p.pembeliNama || "").trim() ? ciplPihakBaris(p.pembeliNama, p.pembeliAlamat) : CIPL_VN_SELLER.map(ciplKapital);
  const packing = p.packing || "WOODEN PACKING";
  const satuan = [...new Set(baris.map((b) => b.satuan).filter(Boolean))];
  const berangkat = p.sailingDate || (shipment ? shipment.etd : "") || "";
  const penanda = ciplVnPenanda(row, shipment);
  const kemasan = ciplRincianKemasan(Object.assign({}, p, { packing }), shipment, ciplBarisBarang(shipment));
  if (!ciplTotalKoli(shipment) && total.qty) {
    // Tanpa jumlah koli tercatat: satu set satu peti, seperti lembar Kumho selama ini
    kemasan.push([`${ciplAngka(total.qty)} PACKAGE${total.qty > 1 ? "S" : ""}`, true]);
  }

  return ciplTataFormal({
    nama: jenis,
    judul: ci ? ciplJudulInvoice(row) : "PACKING LIST",
    persen: [15, 7, 24, 12, 7, 7, 14, 14],
    kartu: [
      { kiri: { judul: "Shipper", isi: (l) => ddIsiPihak(ciplShipperBaris(row, CIPL_VN_SHIPPER), l, true) },
        kanan: { judul: "Seller", isi: (l) => ddIsiPihak(seller, l, true) } },
      { kiri: { judul: "Consignee", isi: (l) => ddIsiPihak(consignee, l, true) },
        kanan: { judul: "Document reference", referensi: (lNo, lLabel) => ddIsiReferensi([
          ["Invoice No. & Date", [row.doc_number ? ciplNoTanggal(row.doc_number, row.doc_date) : { no: "—", tgl: "" }]],
          ["L/C No. & Date", [{ no: "—", tgl: "" }]],
          ["Notify (if other than consignee)", [{ no: ciplKapital(p.notifyParty || "SAME AS CONSIGNEE"), tgl: "" }]],
        ], lNo, lLabel) } },
    ],
    rinci: [
      ["Departure Date", ciplTanggal(berangkat)],
      ["Port of Loading", portKodeKeAlias(p.portLoading) || prof.portLoading || (shipment ? portKotaNegara(shipment.origin) : "")],
      ["Port of Discharge", p.portDischarge || prof.portDischarge || ""],
      ["Final Destination", portKodeKeAlias(p.finalDestination) || prof.finalDestination || (shipment ? portKotaNegara(shipment.destination) : "")],
      ["Vessel / Flight", carrierCipl(p, shipment)],
      ["Price Term", p.termsDelivery || ""],
      ["Terms of Payment", p.termPayment || "T/T 60 days after B/L date"],
      ["Country of Origin", CIPL_ASAL_BARANG],
    ],
    rinciSatuBaris: ["Port of Loading", "Port of Discharge", "Final Destination"],
    tabel: {
      kolom: [[0, 0], [1, 3.5], [4, 4], [5, 5], [6, 6], [7, 7]],
      kepala: [["Marks & No. PKGS"], ["Goods Description", "Description info : PTN, SIZE, MOLD NO"], ["Qty"], ["Unit"],
        [ci ? "Unit Price" : "Net Wt."], [ci ? "Amount" : "Gross Wt."]],
      baris: baris.map((b) => [
        { teks: [b.marks] },
        { teks: [b.uraian] },
        angka(b.qty, ""),
        { teks: [b.satuan] },
        ci ? duit(b.harga) : angka(b.netto, "KG"),
        ci ? duit(b.qty * b.harga) : angka(b.bruto, "KG"),
      ]),
      total: [
        { rentang: [0, 3.5], teks: "TOTAL", kiri: true },
        Object.assign({ kolom: 2 }, angka(total.qty, "")),
        { kolom: 3, teks: satuan.length === 1 ? satuan[0] : "" },
        ci ? { kolom: 4 } : Object.assign({ kolom: 4 }, angka(total.netto, "KG")),
        Object.assign({ kolom: 5 }, ci ? duit(total.nilai) : angka(total.bruto, "KG")),
      ],
      padBaris: ttPx(6),
    },
    kiriBawah: [
      // Jenis kemasan hanya di Packing details PL, bukan di CI
      ci ? { judul: "Other references", baris: CIPL_VN_BANK.map((tx) => [tx, false]) }
        : { judul: "Packing details", baris: kemasan },
      { judul: "Shipping marks", baris: penanda.map((tx, i) => [tx, i === 0]) },
    ],
    ttd: { atas: ["Signed by"] },
  });
}
