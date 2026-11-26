"use strict";

/* ==================================================================
   ISI PO & PR DARI PDF / SCAN PR -- tombol "Isi dari PR (PDF / scan)"
   di tab PO & PR, atau seret berkasnya ke form itu.

   Formulir Pengajuan Pembelian (CF-702-03) adalah FORMULIR TETAP: letak
   setiap isian selalu sama. Maka pembacanya membaca LETAK, bukan hanya
   teks -- kata hasil OCR membawa koordinatnya (ocr.js: baris[].kata[]),
   dan PDF bertext layer diubah ke bentuk yang sama (prKataDariPdf):

     1. PATOKAN: kepala tabel barang -- "NO" di kiri dan "Catatan" di
        kanan. Semua kolom formulir dinyatakan sebagai posisi RELATIF di
        antara keduanya (PR_TATA), jadi scan yang bergeser, berskala lain
        atau foto berbingkai tetap terbaca. Tanpa patokan: lebar halaman.
     2. DUA BENTUK FORMULIR: asli (ada kolom Satuan) dan cetakan aplikasi
        ini (po-print.js: tanpa Satuan, QTY "1 SET"). Dibedakan dari ada
        tidaknya judul kolom "Satuan" tersendiri di kepala tabel.
     3. BARIS BARANG dari angka di kolom NO: tinggi baris = garis lurus
        melalui angka-angka yang terbaca (angka yang terlewat OCR -- "4"
        di scan contoh -- tidak membuat barisnya hilang). Sel bertingkat
        ("Master Model" / "PS72") digabung. Baris berisi = ada nama produk
        / spesifikasi sungguhan; baris "-" dan noda garis bukan barang.
     4. KEPALA (No. Pembelian, Nama Produk, Pemasok, tanggal, Tenggat,
        Tujuan, Kategori) dari kisi empat baris di atas tabel; Disusun
        (nama + tanggal) dari kolomnya di kotak persetujuan -- kotak tanda
        tangan lain hanya diisi bila terbaca nama yang jelas; pemohon
        (Tanggal Permintaan, Departemen, Kepala Departemen, Penanggung
        Jawab) & Catatan dari teks "Label : nilai" di bawahnya.

   Noda: kata yang terlalu tipis (garis tegak tabel terbaca "1" / "i") atau
   terlalu lebar untuk jumlah hurufnya (bayangan garis terbaca "Cb", "CL")
   dibuang menurut ukurannya (prKataSah).

   Hasilnya mengisi bagian PR, lalu PO terbentuk otomatis darinya
   (po-form.js). Selalu diingatkan untuk mencocokkan dengan PR aslinya.
================================================================== */

const PR_LEBAR_ACUAN = 2480; // A4 300 dpi -- ukuran kata dibakukan ke lebar ini

/* Tata letak formulir dalam posisi RELATIF terhadap patokan: 0 = pusat
   judul "NO", 1 = pusat judul "Catatan" di kepala tabel barang. `kolom` =
   batas kanan tiap kolom tabel barang (kolom terakhir s.d. tak hingga);
   `kisi` = batas kisi kepala (label kiri | nilai kiri | label kanan |
   nilai kanan). Diukur dari formulir asli & dari cetakan po-print.js. */
const PR_TATA = {
  asli: {
    kolom: [["no", 0.034], ["nama", 0.176], ["spek", 0.2995], ["qty", 0.38], ["satuan", 0.447], ["harga", 0.568], ["jumlah", 0.7907], ["pemasok", 0.9544], ["catatan", Infinity]],
    kisi: [0.219, 0.5196, 0.6914],
  },
  aplikasi: {
    kolom: [["no", 0.0305], ["nama", 0.2337], ["spek", 0.3963], ["qty", 0.498], ["harga", 0.6267], ["jumlah", 0.769], ["pemasok", 0.952], ["catatan", Infinity]],
    kisi: [0.2, 0.52, 0.723],
  },
};
const PR_PITCH_ASLI = 0.0628; // tinggi satu baris barang, relatif terhadap jarak patokan

const prNorm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
const prPusatX = (k) => (k.x0 + k.x1) / 2;
const prPusatY = (k) => (k.y0 + k.y1) / 2;

/* Kata sungguhan, bukan noda garis / bayangan: lebar per huruf masuk akal
   (diukur pada skala halaman 2480 px). Tanda "-" (sel kosong formulir)
   tetap lolos -- ia ditangani pembacanya. */
function prKataSah(k, skala) {
  const isi = String(k.t || "");
  if (!isi) return false;
  const perHuruf = (k.x1 - k.x0) / skala / isi.length;
  if (perHuruf < 6.5) return false;
  if (isi.length <= 2 && perHuruf > 70) return false;
  // Kepercayaan rendah TIDAK dibuang di sini: "PS72" di samping garis tabel bisa 19% tapi benar
  return k.c == null || k.c >= 10;
}

const prStrip = (isi) => /^[-–—_.:;,'"|!]+$/.test(String(isi || "").trim());

/* ---------- berkas -> halaman berkata ---------- */

// PDF bertext layer -> [{ lebar, baris: [{ y, teks, kata }] }] berskala 2480
async function prKataDariPdf(ex) {
  const hasil = [];
  for (let p = 1; p <= Math.min(ex.pdf.numPages, 2); p++) {
    const hal = await ex.pdf.getPage(p);
    const vp = hal.getViewport({ scale: 1 });
    const skala = PR_LEBAR_ACUAN / vp.width;
    const kata = [];
    (ex.pagesItems[p - 1] || []).forEach((it) => {
      const str = String(it.str || "");
      if (!str.trim() || !it.transform) return;
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const tinggi = Math.abs(it.height || it.transform[3] || 10);
      const lebar = Math.abs(it.width || 0) || str.length * tinggi * 0.5;
      // Kata-kata di dalam satu potongan teks: letaknya dibagi menurut jumlah hurufnya
      let pos = 0;
      str.split(/(\s+)/).forEach((bagian) => {
        const awal = pos;
        pos += bagian.length;
        if (!bagian.trim()) return;
        const x0 = x + (lebar * awal) / str.length;
        const x1 = x + (lebar * pos) / str.length;
        kata.push({ t: bagian, c: 99, x0: x0 * skala, x1: x1 * skala, y0: (y - tinggi) * skala, y1: y * skala });
      });
    });
    hasil.push({ lebar: PR_LEBAR_ACUAN, baris: prSusunBaris(kata) });
  }
  return hasil;
}

// Kata -> baris (pusat tegak berdekatan), urut atas-bawah lalu kiri-kanan
function prSusunBaris(kata) {
  if (typeof ocrSusunBaris === "function") return ocrSusunBaris(kata);
  const urut = kata.slice().sort((a, b) => prPusatY(a) - prPusatY(b) || a.x0 - b.x0);
  const baris = [];
  urut.forEach((k) => {
    const b = baris[baris.length - 1];
    if (b && Math.abs(prPusatY(k) - b.y) < (k.y1 - k.y0) * 0.6) b.kata.push(k);
    else baris.push({ y: prPusatY(k), kata: [k] });
  });
  return baris.map((b) => ({ y: b.y, kata: b.kata.sort((p, q) => p.x0 - q.x0), teks: b.kata.map((k) => k.t).join(" ") }));
}

async function prBacaBerkas(berkas, lapor) {
  let pdf = null;
  if (!ocrAdalahGambar(berkas)) {
    const ex = await extractPdfText(berkas);
    pdf = ex.pdf;
    const berteks = (ex.pageTexts || []).some((isi) => /Pembelian|Pengajuan|Spesifikasi/i.test(isi));
    if (berteks) return { halaman: await prKataDariPdf(ex), ocr: false };
  }
  const ocr = await ocrBacaBerkas(berkas, { pdf, progres: lapor, maksHalaman: 2 });
  return {
    halaman: ocr.halaman.map((h) => ({ lebar: h.lebar || Math.max(1, ...h.baris.flatMap((b) => b.kata.map((k) => k.x1))), baris: h.baris })),
    ocr: true,
    kepercayaan: ocr.kepercayaan,
  };
}

/* ---------- halaman -> isi PR ---------- */

// "30/10/2026" -> ISO. Hari/bulan yang mendua dipilih yang tidak sebelum `acuan` (bila ada)
function prTanggalIso(teks, acuan) {
  const m = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/.exec(String(teks || ""));
  if (!m) return "";
  let a = +m[1], b = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  const iso = (d, mo) => (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "");
  const dm = iso(a, b); // hari/bulan (bentuk Indonesia)
  const md = iso(b, a); // bulan/hari (bentuk Excel AS: 11/18/2026)
  if (dm && md && dm !== md && acuan) return dm >= acuan || md < acuan ? dm : md;
  return dm || md;
}

/* Urutan BACA: kata dikelompokkan per baris (pusat tegak berdekatan), tiap
   baris kiri ke kanan. Mengurutkan menurut tepi atas saja membalik kata
   sebaris yang hurufnya beda tinggi ("Model Master"). */
function prUrutBaca(kata) {
  const ks = kata.slice().sort((p, q) => prPusatY(p) - prPusatY(q));
  const tinggi = ks.map((k) => k.y1 - k.y0).sort((p, q) => p - q)[ks.length >> 1] || 20;
  const baris = [];
  ks.forEach((k) => {
    const b = baris[baris.length - 1];
    if (b && Math.abs(prPusatY(k) - b.y) < tinggi * 0.6) b.kata.push(k);
    else baris.push({ y: prPusatY(k), kata: [k] });
  });
  return baris.flatMap((b) => b.kata.sort((p, q) => p.x0 - q.x0));
}
const prGabung = (kata) => prUrutBaca(kata).map((k) => k.t).join(" ").replace(/\s+/g, " ").trim();

// Kode yang huruf kecil di depannya salah baca ("pS72" -> "PS72")
const prRapikanKata = (isi) => (/^[a-z][A-Z0-9]*\d[A-Z0-9]*$/.test(isi) ? isi.toUpperCase() : isi);

function bacaPrHalaman(hal) {
  const semua = hal.baris.flatMap((b) => b.kata);
  if (!semua.length) return null;
  const skala = (hal.lebar || PR_LEBAR_ACUAN) / PR_LEBAR_ACUAN;
  const kata = semua.filter((k) => prKataSah(k, skala)).map((k) => Object.assign({}, k, { t: prNorm(k.t).trim() }));
  const cocok = (k, re) => re.test(k.t);

  /* 1. KEPALA TABEL BARANG & PATOKAN */
  const barisKepala = hal.baris.find((b) => {
    const isi = prNorm(b.teks);
    return /\bN[O0]\b/i.test(isi) && [/Spesifikasi/i, /Satuan|QTY/i, /Catatan/i, /Produk/i, /Jumlah/i].filter((re) => re.test(isi)).length >= 3;
  });
  const yKepala = barisKepala ? barisKepala.y : null;
  const sekitarKepala = yKepala == null ? [] : kata.filter((k) => Math.abs(prPusatY(k) - yKepala) < 60 * skala);
  const kNo = sekitarKepala.find((k) => /^N[O0]\.?$/i.test(k.t));
  const kCat = sekitarKepala.filter((k) => /^Catatan/i.test(k.t)).sort((a, b) => b.x0 - a.x0)[0];
  let x0 = kNo ? prPusatX(kNo) : 272 * skala;
  let x1 = kCat ? prPusatX(kCat) : 2135 * skala;
  if (x1 - x0 < 400 * skala) {
    x0 = 272 * skala;
    x1 = 2135 * skala;
  }
  const rel = (k) => (prPusatX(k) - x0) / (x1 - x0);
  const span = x1 - x0;
  // Bentuk formulir: judul "Satuan" TERSENDIRI (bukan "Harga Satuan") di antara QTY dan Harga = formulir asli
  const adaSatuan = sekitarKepala.some((k) => /^Satuan$/i.test(k.t) && rel(k) > 0.36 && rel(k) < 0.46 && Math.abs(prPusatY(k) - yKepala) < 25 * skala);
  const adaQty = sekitarKepala.some((k) => /^QTY$/i.test(k.t));
  const tata = !adaSatuan && adaQty ? PR_TATA.aplikasi : PR_TATA.asli;
  const kolomDari = (k) => {
    const r = rel(k);
    return (tata.kolom.find(([, batas]) => r < batas) || [])[0];
  };

  /* 2. BATAS BAWAH TABEL: "Total Harga" / kalimat "Dengan ini kami ..." */
  const bawah = hal.baris.find((b) => yKepala != null && b.y > yKepala && /Total\s*Harga|Dengan ini kami/i.test(prNorm(b.teks)));
  const yBawah = bawah ? bawah.y : Infinity;

  /* 3. BARIS BARANG dari angka kolom NO: y = a + b·n (kuadrat terkecil) */
  const angkaNo = yKepala == null ? [] : kata.filter((k) => /^\d{1,2}$/.test(k.t) && rel(k) > -0.03 && rel(k) < tata.kolom[0][1] && prPusatY(k) > yKepala && prPusatY(k) < yBawah)
    .map((k) => ({ n: +k.t, y: prPusatY(k) }))
    .filter((x) => x.n >= 1 && x.n <= 40);
  let a = null, b = PR_PITCH_ASLI * span;
  if (angkaNo.length >= 2) {
    const n = angkaNo.length;
    const sn = angkaNo.reduce((s, x) => s + x.n, 0), sy = angkaNo.reduce((s, x) => s + x.y, 0);
    const snn = angkaNo.reduce((s, x) => s + x.n * x.n, 0), sny = angkaNo.reduce((s, x) => s + x.n * x.y, 0);
    const pembagi = n * snn - sn * sn;
    if (pembagi) {
      b = (n * sny - sn * sy) / pembagi;
      a = (sy - b * sn) / n;
    }
  } else if (angkaNo.length === 1) a = angkaNo[0].y - b * angkaNo[0].n;
  else if (yKepala != null) a = yKepala + 0.4 * b; // tanpa nomor: baris pertama tepat di bawah kepala tabel
  const items = [];
  if (a != null && b > 10 * skala) {
    const maks = Math.max(10, ...angkaNo.map((x) => x.n));
    for (let n = 1; n <= maks; n++) {
      const yc = a + b * n;
      if (yc - b / 2 > yBawah) break;
      const sel = {};
      kata
        .filter((k) => Math.abs(prPusatY(k) - yc) < b / 2 && prPusatY(k) < yBawah - 10 * skala)
        .forEach((k) => {
          const kol = kolomDari(k);
          if (!kol || kol === "no" || prStrip(k.t)) return;
          (sel[kol] = sel[kol] || []).push(k);
        });
      // Teks sel bertingkat ("Master Model" / "PS72"): urut baca
      const teks = (kol) => prUrutBaca(sel[kol] || []).map((k) => prRapikanKata(k.t)).join(" ").replace(/\s+/g, " ").trim();
      const nama = teks("nama"), spek = teks("spek");
      // Barang sungguhan: nama / spesifikasi berisi kata yang yakin terbaca -- bukan "-" atau noda
      const yakin = [...(sel.nama || []), ...(sel.spek || [])].some((k) => (k.c == null || k.c >= 45) && /[A-Za-z0-9]{2,}/.test(k.t));
      if (!yakin || !/[A-Za-z0-9]{2,}/.test(nama + " " + spek)) continue;
      const qtyAngka = teks("qty").replace(/[^\d.,]/g, "");
      const satuan = (tata === PR_TATA.asli ? teks("satuan") : teks("qty").replace(/^[\d.,\s]+/, "")).replace(/[^A-Za-z]/g, "").toUpperCase();
      const uang = (isi) => {
        const v = String(isi || "").replace(/[^\d.,]/g, "");
        return v && /\d/.test(v) ? parseLooseNumber(v) || "" : "";
      };
      items.push({
        nama,
        spek,
        // Qty & Satuan dua kotak, seperti form PR & PO ("1" | "SET"); tampil bersama: 1 SET
        qty: /\d/.test(qtyAngka) ? parseLooseNumber(qtyAngka) || "" : "",
        satuan,
        harga: uang(teks("harga")),
        pemasok: teks("pemasok"),
        catatan: teks("catatan"),
      });
    }
  }

  /* 4. KISI KEPALA: empat baris di atas tabel. Tiap baris dikenali dari
     label kiri / kanannya; yang tak terbaca ditaksir dari baris lain. */
  const atas = (k) => yKepala == null || prPusatY(k) < yKepala - 30 * skala;
  const [bKiri, bTengah, bKanan] = tata.kisi;
  const labelKiri = (k) => rel(k) < bKiri && atas(k);
  const labelKanan = (k) => rel(k) >= bTengah && rel(k) < bKanan && atas(k);
  const LABEL_KISI = [
    { kiri: /Pembelian/i, kanan: /Pemasok|Supplier/i },
    { kiri: /^Produk$|Nama\s*Produk/i, kanan: /Masuk/i },
    { kiri: /Pengiriman/i, kanan: /Tenggat|Waktu/i },
    { kiri: /Tujuan|Penggunaan/i, kanan: /Kategori/i },
  ];
  const yLabel = LABEL_KISI.map((L) => {
    const ys = kata.filter((k) => (labelKiri(k) && cocok(k, L.kiri)) || (labelKanan(k) && cocok(k, L.kanan))).map(prPusatY);
    return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : null;
  });
  const dikenal = yLabel.map((y, i) => (y == null ? null : { i, y })).filter(Boolean);
  if (dikenal.length >= 2) {
    const p = dikenal[0], q = dikenal[dikenal.length - 1];
    const langkah = (q.y - p.y) / (q.i - p.i || 1);
    yLabel.forEach((y, i) => {
      if (y == null) yLabel[i] = p.y + langkah * (i - p.i);
    });
  }
  const pitchKisi = dikenal.length >= 2 ? Math.abs((yLabel[3] - yLabel[0]) / 3) || 100 * skala : 100 * skala;
  const nilaiKisi = (i, sisi) => {
    if (yLabel[i] == null) return "";
    const ks = kata.filter((k) => {
      const r = rel(k);
      const kolom = sisi === "kiri" ? r >= bKiri && r < bTengah : r >= bKanan;
      return kolom && Math.abs(prPusatY(k) - yLabel[i]) < pitchKisi * 0.5 && !prStrip(k.t);
    });
    return prGabung(ks);
  };
  const h = {
    prNo: nilaiKisi(0, "kiri").replace(/\s+/g, ""),
    prPemasok: nilaiKisi(0, "kanan"),
    prProduk: nilaiKisi(1, "kiri"),
    prTglKirim: prTanggalIso(nilaiKisi(2, "kiri")),
    prTenggat: nilaiKisi(2, "kanan"),
    prTujuan: nilaiKisi(3, "kiri"),
    prKategori: nilaiKisi(3, "kanan"),
    items,
  };
  // No. Pembelian yang tak terbaca di kisinya: bentuknya khas (DDI-MPD-301026-39)
  if (!/\d/.test(h.prNo)) {
    const kode = kata.find((k) => atas(k) && /^[A-Z]{2,5}-[A-Z0-9]{2,6}-\d{4,8}-\d{1,4}$/.test(k.t));
    h.prNo = kode ? kode.t : "";
  }

  /* 5. PEMOHON & CATATAN: "Label : nilai" di bawah tabel */
  const teksBaris = hal.baris.map((x) => ({ y: x.y, teks: prNorm(x.teks) }));
  const sesudah = (re) => {
    const x = teksBaris.find((r) => re.test(r.teks) && (yKepala == null || r.y > yKepala));
    if (!x) return "";
    const m = re.exec(x.teks);
    return x.teks.slice(m.index + m[0].length).replace(/^\s*[:;.]?\s*/, "").trim();
  };
  h.prTanggal = prTanggalIso(sesudah(/Tanggal\s*Permintaan/i));
  h.prDepartemen = sesudah(/Nama\s*Departemen/i);
  h.prKepalaDept = sesudah(/Kepala\s*Departemen/i);
  h.prPenanggungJawab = sesudah(/Penanggung\s*Jawab/i);
  h.prTglMasuk = prTanggalIso(nilaiKisi(1, "kanan"), h.prTanggal);
  const iCatatan = teksBaris.findIndex((r) => /^Catatan\b/i.test(r.teks.trim()) && (yKepala == null || r.y > yBawah));
  if (iCatatan >= 0) {
    const isi = [teksBaris[iCatatan].teks.replace(/^\s*Catatan\s*[:]?\s*/i, "")];
    for (let i = iCatatan + 1; i < teksBaris.length && !/CF-\d|Classified|Confidential/i.test(teksBaris[i].teks); i++) isi.push(teksBaris[i].teks);
    h.prCatatan = isi.join("\n").replace(/^[\s\-.]+$/gm, "").trim();
  }

  /* 6. PERSETUJUAN: kolom "Disusun" (nama + tanggal); kotak lain hanya bila
     terbaca nama yang jelas -- coretan tanda tangan bukan nama. */
  const kepalaSetuju = ["Disusun", "Disesuaikan", "Diperiksa", "Disetujui"].map((n) => kata.find((k) => new RegExp(`^${n}$`, "i").test(k.t)));
  if (kepalaSetuju[0]) {
    const pusat = kepalaSetuju.map((k) => (k ? prPusatX(k) : null));
    const lebarKol = pusat[1] != null ? pusat[1] - pusat[0] : 225 * skala;
    const yAtas = prPusatY(kepalaSetuju[0]);
    const yBatas = yLabel[0] != null ? yLabel[0] - pitchKisi * 0.5 : yAtas + 220 * skala;
    const isiKolom = (i) => {
      const cx = pusat[i] != null ? pusat[i] : pusat[0] + lebarKol * i;
      return kata.filter((k) => prPusatY(k) > yAtas + 20 * skala && prPusatY(k) < yBatas && Math.abs(prPusatX(k) - cx) < lebarKol * 0.5);
    };
    const nama = (ks, ketat) => ks.filter((k) => /^[A-Za-z][A-Za-z.'-]{2,}$/.test(k.t) && (!ketat || k.c == null || k.c >= 70)).map((k) => k.t).join(" ");
    const disusun = isiKolom(0);
    h.prDisusun = nama(disusun, false);
    h.prDisusunTgl = prTanggalIso(prGabung(disusun));
    h.prDisesuaikan = nama(isiKolom(1), true);
    h.prDiperiksa = nama(isiKolom(2), true);
    h.prDisetujui = nama(isiKolom(3), true);
  }
  return h;
}

// Halaman yang memuat formulir PR (berkas bisa berisi PR + lampiran)
function bacaPrDariHalaman(halaman) {
  const skor = (hal) => {
    const isi = prNorm(hal.baris.map((b) => b.teks).join(" "));
    return [/Pengajuan/i, /Pembelian/i, /Spesifikasi/i, /Pemasok/i, /Tenggat/i, /Kategori/i].filter((re) => re.test(isi)).length;
  };
  const urut = (halaman || []).filter((hal) => hal && hal.baris && hal.baris.length).sort((p, q) => skor(q) - skor(p));
  return urut.length && skor(urut[0]) >= 2 ? bacaPrHalaman(urut[0]) : null;
}

/* ---------- isi form ---------- */

const PR_ISIAN = ["prNo", "prProduk", "prPemasok", "prKategori", "prTujuan", "prTanggal", "prTglMasuk", "prTenggat", "prTglKirim",
  "prDepartemen", "prKepalaDept", "prPenanggungJawab", "prDisusun", "prDisusunTgl", "prDisesuaikan", "prDiperiksa", "prDisetujui", "prCatatan"];

function prAdaIsi() {
  const panel = poPanel();
  return !!panel && (poBarisBersih("pr", poBaris.pr).length > 0 || PR_ISIAN.some((k) => {
    const el = panel.querySelector(`[data-dn="${k}"]`);
    return el && el.value.trim() && k !== "prTanggal" && !el.dataset.autoFill;
  }));
}

function prIsiForm(h) {
  const panel = poPanel();
  if (!panel) return;
  PR_ISIAN.forEach((k) => {
    const el = panel.querySelector(`[data-dn="${k}"]`);
    if (!el) return;
    el.value = h[k] || "";
    el.classList.remove("is-invalid");
    delete el.dataset.autoFill;
  });
  if (!h.prTanggal) panel.querySelector('[data-dn="prTanggal"]').value = todayISO();
  poHitungTenggat();
  poBaris.pr = h.items.length ? h.items.map((b) => Object.assign(poBarisBaru("pr"), b)) : [poBarisBaru("pr")];
  poGambar("pr");
  /* PO terbentuk dari PR ini -- kecuali daftar PO yang sudah diubah sendiri:
     itu dibiarkan (tombol "Salin ulang dari PR" untuk menimpanya). */
  const poSendiri = poManual && poBarisBersih("po", poBaris.po).length > 0;
  if (!poSendiri) poSelaraskanDariPr({ paksa: true });
  else poGambarStatus();
  poTampilBagian("pr");
  return { poSendiri };
}

async function prDariBerkas(berkas) {
  if (!berkas) return;
  const pdf = /pdf$/i.test(berkas.type || "") || /\.pdf$/i.test(berkas.name || "");
  if (!pdf && !ocrAdalahGambar(berkas)) {
    showToast(tt("Pilih PDF atau gambar (JPG / PNG) Formulir Pengajuan Pembelian.", "Choose a PDF or image (JPG / PNG) of the Purchase Request form."), "warning");
    return;
  }
  const tombol = document.getElementById("btnPoDariPr");
  if (tombol) {
    tombol.disabled = true;
    tombol.setAttribute("aria-busy", "true");
  }
  try {
    const lapor = typeof danaLaporOcr === "function" ? danaLaporOcr(berkas.name || "PR", 1, 1) : () => {};
    const baca = await prBacaBerkas(berkas, lapor);
    const h = bacaPrDariHalaman(baca.halaman);
    if (!h || (!h.items.length && !h.prNo)) {
      showToast(tt("Berkas ini tidak terbaca sebagai Formulir Pengajuan Pembelian (PR). Isi form secara manual, atau coba scan yang lebih jelas.",
        "This file could not be read as a Purchase Request (PR) form. Fill in the form by hand, or try a clearer scan."), "warning", { judul: tt("PR tidak terbaca", "PR not readable") });
      return;
    }
    const isi = () => {
      const hasil = prIsiForm(h);
      const n = h.items.length;
      const ragu = baca.ocr && baca.kepercayaan && baca.kepercayaan < 70 ? tt(" Hasil scan kurang jelas — periksa teliti.", " The scan is not very clear — check carefully.") : "";
      const po = hasil && hasil.poSendiri
        ? tt(" Daftar PO tidak diubah karena sudah diubah sendiri — pakai \"Salin ulang dari PR\" bila perlu.", " The PO list was kept because it was edited by hand — use \"Copy again from PR\" if needed.")
        : tt(" PO terisi otomatis dari PR ini.", " The PO was filled in from this PR.");
      showToast(
        tt(`PR ${h.prNo || ""} terbaca: ${n} barang.${po} Cocokkan dengan PR aslinya sebelum mengajukan.${ragu}`,
          `PR ${h.prNo || ""} read: ${n} item${n === 1 ? "" : "s"}.${po} Check it against the original PR before submitting.${ragu}`).replace(/\s+/g, " "),
        ragu ? "warning" : "success",
        { judul: tt("Isi dari PR", "Filled from PR") },
      );
      const pertama = poPanel() && poPanel().querySelector('[data-dn="prNo"]');
      if (pertama) fokuskan(pertama, { tanpaGulir: false });
    };
    if (prAdaIsi()) {
      if (typeof hideToast === "function") hideToast();
      showConfirm(
        tt("Form PR sudah berisi. Ganti isinya dengan PR dari berkas ini?", "The PR form already has data. Replace it with the PR from this file?"),
        isi,
        { title: tt("Ganti isi PR?", "Replace the PR?"), confirmText: tt("Ganti Isi PR", "Replace PR"), icon: "bi-arrow-repeat" },
      );
    } else isi();
  } catch (err) {
    console.error(err);
    showToast(tt(`PR tidak bisa dibaca: ${(err && err.message) || "kesalahan tidak diketahui"}.`, `The PR could not be read: ${(err && err.message) || "unknown error"}.`), "danger");
  } finally {
    if (tombol) {
      tombol.disabled = false;
      tombol.removeAttribute("aria-busy");
    }
  }
}

(function pasangImporPr() {
  const tombol = document.getElementById("btnPoDariPr");
  const input = document.getElementById("inpPoDariPr");
  const panel = poPanel();
  if (!tombol || !input || !panel) return;
  // Mesin OCR disiapkan selagi pengguna memilih / menyeret berkas (ocrPanaskan)
  const panaskan = () => {
    if (typeof ocrPanaskan === "function") ocrPanaskan();
  };
  tombol.addEventListener("click", () => {
    if (typeof bolehUbahDocNum === "function" && !bolehUbahDocNum("po")) return;
    panaskan();
    input.value = "";
    input.click();
  });
  input.addEventListener("change", () => {
    if (input.files && input.files[0]) prDariBerkas(input.files[0]);
  });
  /* SERET & LEPAS berkas PR ke form PO & PR -- sorotan yang sama dengan
     form Pengajuan Dana (pasangZonaLepas, ui/dom.js); hanya berkas pertama. */
  pasangZonaLepas(panel, {
    teks: () => tt("Lepas PDF / gambar PR di sini", "Drop the PR PDF / image here"),
    boleh: () => typeof bolehUbahDocNum !== "function" || bolehUbahDocNum("po"),
    mulai: panaskan,
    lepas: (daftar) => prDariBerkas(daftar[0]),
  });
})();
