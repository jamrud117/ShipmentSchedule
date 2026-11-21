"use strict";

/* ==================================================================
   OCR -- MEMBACA INVOICE HASIL SCAN / FOTO

   PDF hasil scan (atau PDF yang dicetak dari sistem vendor sebagai
   gambar) tidak punya teks yang bisa dibaca pdf.js, jadi
   extractPdfText() mengembalikan kosong. Berkas ini mengisi celah itu:

     halaman PDF / gambar -> pembersihan gambar -> Tesseract.js
       -> kata + koordinat -> BARIS TEKS seperti hasil extractPdfText()

   Teks hasilnya diumpankan ke pembaca invoice yang SAMA dengan PDF
   bertext layer (fund-invoice-import.js) -- tidak ada pembaca kedua.

   KENAPA PEMBERSIHAN GAMBAR YANG PALING MENENTUKAN
   Tesseract membaca halaman utuh dengan bagus, tapi invoice berbentuk
   tabel penuh hal yang mengacaukannya: garis tabel (utuh maupun titik-
   titik halus antar-baris), bayangan kepala tabel, stempel meterai,
   sticky note & coretan tangan, noda hasil scan. Tanpa pembersihan,
   angka "55,500.00" bisa terbaca "55,50000..~---" -- dan satu angka
   rupiah yang salah jauh lebih buruk daripada baris yang tidak terbaca.
   Maka urutannya selalu:

     1. abu-abu = kanal TERTERANG (max R,G,B): tinta hitam tetap gelap,
        tinta berwarna (stempel, sticky note, logo berwarna) jadi terang
        dan hilang sendiri;
     2. dua ambang (hysteresis): piksel dianggap tinta bila cukup gelap
        DAN dekat piksel yang pasti gelap -- garis titik abu-abu halus
        tidak punya piksel pasti-gelap, jadi hilang; tepi huruf tetap;
     3. garis tabel panjang (mendatar & tegak) dibuang;
     4. bintik & coretan datar kecil dibuang (titik desimal TETAP: luasnya
        di atas ambang);
     5. kemiringan scan diluruskan.

   TIGA PEMBACAAN + PEMBACAAN ULANG ANGKA
   Halaman dibaca tiga kali dengan mode Tesseract yang berbeda dan angkanya
   dipungut suaranya digit demi digit (ocrGabungBacaan). Angka yang tak
   disepakati, atau yang meragukan (kepercayaan rendah / bentuk bukan angka
   yang sah), dibaca ULANG sendirian dengan daftar karakter hanya angka --
   Tesseract jauh lebih akurat bila tidak perlu menebak huruf.

   KECEPATAN
   - Ketiga pembacaan berjalan SERENTAK di kolam tiga pekerja (ocrKolam,
     ocrBaca), bukan bergiliran di satu pekerja.
   - Gambar dikirim ke Tesseract sebagai PBM 1-bit (ocrBwKePbm), bukan PNG:
     tanpa kanvas & pemampatan, dan Tesseract tidak perlu membuka gambar
     32-bit -- hasil bacanya identik.
   - Selagi pekerja membaca satu halaman, halaman berikutnya sudah digambar &
     dibersihkan di utas halaman (ocrBacaBerkas; untuk beberapa berkas
     sekaligus lihat danaDariBerkasPdf).
   Diukur pada 8 invoice WIDE hasil scan (CPU 2 inti): 13,1 -> 6,8 detik per
   halaman; unggah 8 berkas sekaligus 47 detik (dulu 109). Di CPU 4 inti ke
   atas ketiga pembacaan benar-benar berjalan bersamaan, jadi lebih cepat lagi.

   Berkas ini TIDAK memuat apa pun saat halaman dibuka: Tesseract.js
   (~2 MB kode + ~3 MB data bahasa, disimpan peramban sesudah unduhan
   pertama) baru diunduh saat ada berkas tanpa teks yang perlu dibaca,
   dari CDN yang sama dengan pdf.js.
================================================================== */

const OCR_VER_TESSERACT = "7.0.0";
const OCR_BAHASA = "eng";
/* Resolusi halaman saat dirender / dibaca. 300 dpi = ukuran yang dipakai
   hampir semua mesin scan; di bawah ±200 dpi huruf kecil (titik desimal,
   koma) mulai hilang. */
const OCR_DPI = 300;
/* Batas piksel per halaman (memori peramban): A4 300 dpi = 8,7 juta. */
const OCR_MAKS_PIKSEL = 14e6;
/* Ambang kepercayaan Tesseract (0-100) di bawahnya sebuah kata dianggap
   meragukan -- angka seperti itu dibaca ulang. */
const OCR_RAGU = 88;
/* Lebar minimum komponen yang boleh dibuang karena PUDAR (bayangan / stempel
   abu-abu). Di bawah ini = titik, koma, "l", "1": tidak pernah disentuh. */
const OCR_PUDAR_LEBAR = 20;
/* Pekerja Tesseract dilepas bila tidak dipakai selama ini (ms): ia
   menahan ±100 MB memori. */
const OCR_LEPAS_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------
   PRA-PROSES GAMBAR -- murni larik bertipe, tanpa DOM, jadi bisa diuji
------------------------------------------------------------------ */

/* RGBA -> abu-abu = kanal terterang. Piksel transparan dianggap putih. */
function ocrAbuAbu(rgba, n) {
  const abu = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
    let v = r > g ? (r > b ? r : b) : g > b ? g : b;
    const a = rgba[j + 3];
    if (a < 255) v = 255 - (((255 - v) * a) / 255 | 0);
    abu[i] = v;
  }
  return abu;
}

/* Ambang Otsu: piksel <= ambang = gelap. */
function ocrOtsu(abu) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < abu.length; i++) hist[abu[i]]++;
  const total = abu.length;
  let jumlah = 0;
  for (let v = 0; v < 256; v++) jumlah += v * hist[v];
  let sumB = 0, wB = 0, maks = -1, ambang = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB, mF = (jumlah - sumB) / wF;
    const antar = wB * wF * (mB - mF) * (mB - mF);
    if (antar > maks) { maks = antar; ambang = v; }
  }
  return ambang;
}

/* Cahaya latar tak rata (foto, scan bayangan): bagi tiap piksel dengan
   perkiraan warna kertas di sekitarnya. Perkiraannya = nilai TERTERANG di
   jendela besar (tinta lebih gelap dari kertas, jadi tinta tidak ikut
   terhitung) pada salinan yang diperkecil 8x, lalu dihaluskan. Hanya
   dijalankan bila latarnya memang tidak rata -- scan bersih tidak disentuh. */
function ocrRataiLatar(abu, w, h) {
  const f = 8;
  const sw = Math.ceil(w / f), sh = Math.ceil(h / f);
  const kecil = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let maks = 0;
      const y1 = Math.min(h, (y + 1) * f), x1 = Math.min(w, (x + 1) * f);
      for (let yy = y * f; yy < y1; yy += 2) {
        for (let xx = x * f; xx < x1; xx += 2) if (abu[yy * w + xx] > maks) maks = abu[yy * w + xx];
      }
      kecil[y * sw + x] = maks;
    }
  }
  const r = Math.max(6, Math.round(sw / 28)); // jendela ±r sel (~±r*8 piksel)
  // dilatasi maks mendatar lalu tegak (jendela persegi), lalu rata-rata kotak
  const tmp = new Uint8Array(sw * sh), lat = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(sw - 1, x + r); k++) if (kecil[y * sw + k] > m) m = kecil[y * sw + k];
      tmp[y * sw + x] = m;
    }
  }
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(sh - 1, y + r); k++) if (tmp[k * sw + x] > m) m = tmp[k * sw + x];
      lat[y * sw + x] = m;
    }
  }
  let min = 255, maks = 0;
  for (let i = 0; i < lat.length; i++) { if (lat[i] < min) min = lat[i]; if (lat[i] > maks) maks = lat[i]; }
  if (!maks || min >= maks * 0.9) return false; // latar sudah rata
  // haluskan (rata-rata 3x3 dua kali) supaya tidak berpetak, lalu pakai dengan interpolasi bilinear
  let a = lat, b = new Uint8Array(sw * sh);
  for (let ulang = 0; ulang < 2; ulang++) {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < sh && xx >= 0 && xx < sw) { s += a[yy * sw + xx]; c++; }
        }
        b[y * sw + x] = (s / c) | 0;
      }
    }
    const tukar = a; a = b; b = tukar;
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const bg = (a[y0 * sw + x0] * (1 - tx) + a[y0 * sw + x1] * tx) * (1 - ty) + (a[y1 * sw + x0] * (1 - tx) + a[y1 * sw + x1] * tx) * ty;
      const v = bg > 8 ? (abu[y * w + x] * 255) / bg : abu[y * w + x];
      abu[y * w + x] = v > 255 ? 255 : v | 0;
    }
  }
  return true;
}

/* Tinta (1) / kertas (0) dari abu-abu, dengan DUA ambang (hysteresis):
   "mungkin tinta" (<= tinggi) hanya berlaku bila ada piksel "pasti tinta"
   (<= rendah) dalam jarak 2 piksel. Garis titik abu-abu halus antar-baris
   tabel invoice tidak punya piksel pasti-tinta, jadi hilang; tepi huruf
   (selalu menempel pada intinya yang gelap) tetap. */
function ocrTinta(abu, w, h) {
  const otsu = ocrOtsu(abu);
  const tinggi = Math.max(100, Math.min(185, otsu));
  const rendah = Math.max(70, Math.round(tinggi * 0.72));
  const n = w * h;
  const dekat = new Uint8Array(n);
  // piksel pasti-tinta, diperlebar 2 piksel mendatar...
  const R = 2;
  for (let y = 0; y < h; y++) {
    const baris = y * w;
    let terakhir = -1e9;
    for (let x = 0; x < w; x++) {
      if (abu[baris + x] <= rendah) terakhir = x;
      if (x - terakhir <= R) dekat[baris + x] = 1;
    }
    terakhir = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (abu[baris + x] <= rendah) terakhir = x;
      if (terakhir - x <= R) dekat[baris + x] = 1;
    }
  }
  // ...lalu 2 piksel menegak
  const ink = new Uint8Array(n);
  const lalu = new Int32Array(w).fill(-1e9);
  const baris1 = new Uint8Array(n); // hasil pelebaran menegak (arah bawah)
  for (let y = 0; y < h; y++) {
    const baris = y * w;
    for (let x = 0; x < w; x++) {
      if (dekat[baris + x]) lalu[x] = y;
      if (y - lalu[x] <= R) baris1[baris + x] = 1;
    }
  }
  const depan = new Int32Array(w).fill(1e9);
  for (let y = h - 1; y >= 0; y--) {
    const baris = y * w;
    for (let x = 0; x < w; x++) {
      if (dekat[baris + x]) depan[x] = y;
      if (depan[x] - y <= R) baris1[baris + x] = 1;
    }
  }
  for (let i = 0; i < n; i++) ink[i] = baris1[i] && abu[i] <= tinggi ? 1 : 0;
  return ink;
}

/* Buang garis tabel: rentetan tinta mendatar / tegak yang panjang. Huruf
   tak pernah semenerus itu (judul terbesar pun < 80 px pada 300 dpi). */
function ocrBuangGaris(ink, w, h) {
  const minH = Math.max(60, Math.round(w * 0.03));
  const minV = Math.max(60, Math.round(h * 0.022));
  const gh = new Uint8Array(w * h);
  const gv = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const baris = y * w;
    let x = 0;
    while (x < w) {
      if (!ink[baris + x]) { x++; continue; }
      const mulai = x;
      while (x < w && ink[baris + x]) x++;
      if (x - mulai >= minH) for (let k = mulai; k < x; k++) gh[baris + k] = 1;
    }
  }
  const awal = new Int32Array(w).fill(-1);
  for (let y = 0; y <= h; y++) {
    const baris = y * w;
    for (let x = 0; x < w; x++) {
      const ada = y < h && ink[baris + x] === 1;
      if (ada) {
        if (awal[x] < 0) awal[x] = y;
      } else if (awal[x] >= 0) {
        if (y - awal[x] >= minV) for (let k = awal[x]; k < y; k++) gv[k * w + x] = 1;
        awal[x] = -1;
      }
    }
  }
  // garis + 1 piksel tepi (anti-alias) tegak lurus arahnya
  for (let y = 0; y < h; y++) {
    const baris = y * w;
    for (let x = 0; x < w; x++) {
      const i = baris + x;
      if (!ink[i]) continue;
      if (gh[i] || gv[i] || (y > 0 && gh[i - w]) || (y < h - 1 && gh[i + w]) || (x > 0 && gv[i - 1]) || (x < w - 1 && gv[i + 1])) ink[i] = 0;
    }
  }
}

/* Buang bintik (< 5 piksel), coretan datar tipis (sisa garis putus-putus),
   dan SERPIHAN BAYANGAN lewat pelabelan komponen terhubung berbasis
   rentetan. Titik desimal (±12-30 piksel pada 300 dpi) dan tanda minus
   (tinggi ≥ 4, lebar < 20) tidak ikut terbuang.

   SERPIHAN BAYANGAN: kotak judul ("INVOICE") dan garis kepala pada invoice
   scan sering punya bayangan abu-abu berpola halftone, tebalnya 5-16 piksel.
   Pada ambang tinta, bayangan itu pecah jadi batang-batang pendek tepat di
   bawah / di atas judul. Tesseract menggabungkannya dengan baris judul dan
   mengembalikan sampah ("mT / eed / EE ee a FT"), judulnya sendiri hilang
   -- padahal huruf judul sudah bersih.

   Satu PIKSEL bayangan tidak bisa dibedakan dari satu piksel huruf (bayangan
   57-190, tepi huruf juga abu-abu), tapi satu KOMPONEN bisa: tinta cetak
   hitam, jadi rata-rata abu-abunya rendah (huruf: 25-60); bayangan abu-abu
   di seluruh tubuhnya (rata-rata 100-125). Komponen LEBAR (>= 20 px) yang
   rata-rata abu-abunya jauh di atas huruf halaman itu sendiri dibuang.
   Acuannya diukur per halaman -- scan pudar seluruhnya tidak ikut terhapus --
   dan komponen sempit (titik, koma, "l", "1") tidak pernah disentuh. */
function ocrBuangNoda(ink, w, h, abu) {
  const x0 = [], x1 = [], yy = [];
  const barisAwal = new Int32Array(h + 1);
  for (let y = 0; y < h; y++) {
    barisAwal[y] = x0.length;
    const baris = y * w;
    let x = 0;
    while (x < w) {
      if (!ink[baris + x]) { x++; continue; }
      const mulai = x;
      while (x < w && ink[baris + x]) x++;
      x0.push(mulai); x1.push(x); yy.push(y);
    }
  }
  barisAwal[h] = x0.length;
  const nRun = x0.length;
  const induk = new Int32Array(nRun);
  for (let i = 0; i < nRun; i++) induk[i] = i;
  const cari = (a) => {
    while (induk[a] !== a) { induk[a] = induk[induk[a]]; a = induk[a]; }
    return a;
  };
  const satukan = (a, b) => {
    a = cari(a); b = cari(b);
    if (a !== b) induk[a < b ? b : a] = a < b ? a : b;
  };
  for (let y = 1; y < h; y++) {
    let p = barisAwal[y - 1];
    const pAkhir = barisAwal[y];
    for (let c = barisAwal[y]; c < barisAwal[y + 1]; c++) {
      while (p < pAkhir && x1[p] < x0[c]) p++; // 8-tetangga: boleh bersentuhan diagonal
      let q = p;
      while (q < pAkhir && x0[q] <= x1[c]) { satukan(c, q); q++; }
    }
  }
  const luas = new Int32Array(nRun), minX = new Int32Array(nRun).fill(1e9), maksX = new Int32Array(nRun), minY = new Int32Array(nRun).fill(1e9), maksY = new Int32Array(nRun);
  const jumlahAbu = new Float64Array(nRun); // jumlah nilai abu-abu piksel tinta (untuk rata-rata komponen)
  for (let i = 0; i < nRun; i++) {
    const r = cari(i);
    luas[r] += x1[i] - x0[i];
    if (x0[i] < minX[r]) minX[r] = x0[i];
    if (x1[i] > maksX[r]) maksX[r] = x1[i];
    if (yy[i] < minY[r]) minY[r] = yy[i];
    if (yy[i] > maksY[r]) maksY[r] = yy[i];
    if (abu) {
      const baris = yy[i] * w;
      let j = 0;
      for (let x = x0[i]; x < x1[i]; x++) j += abu[baris + x];
      jumlahAbu[r] += j;
    }
  }
  /* Komponen "datar" (lebar >= 2,2x tinggi, tinggi <= 4): tanda hubung /
     minus yang sah atau sisa garis putus-putus? Tanda hubung SELALU ada di
     dalam rentang tinggi sebuah huruf / angka di sebelahnya; sisa garis
     tabel jatuh di celah ANTAR baris, di luar rentang tinggi semua huruf.
     Yang dilindungi = ada komponen setinggi huruf (>= 10 px) tidak jauh di
     kirinya / kanannya yang rentang tingginya memuat tengah komponen ini. */
  const datar = [];
  const tinggiHuruf = [];
  const akar = new Set();
  for (let i = 0; i < nRun; i++) akar.add(cari(i));
  /* Acuan abu-abu tinta cetak halaman ini: median rata-rata abu-abu
     komponen setinggi huruf (>= 14 px, luas >= 80). Komponen lebar yang
     rata-ratanya jauh di atas itu = bayangan / stempel pudar, bukan teks. */
  const pudar = new Set();
  if (abu) {
    const contoh = [];
    akar.forEach((r) => {
      if (maksY[r] - minY[r] + 1 >= 14 && luas[r] >= 80) contoh.push(jumlahAbu[r] / luas[r]);
    });
    if (contoh.length >= 20) {
      contoh.sort((a, b) => a - b);
      const batas = Math.min(150, Math.max(85, contoh[contoh.length >> 1] + 45));
      akar.forEach((r) => {
        if (luas[r] >= 5 && maksX[r] - minX[r] >= OCR_PUDAR_LEBAR && jumlahAbu[r] / luas[r] >= batas) pudar.add(r);
      });
    }
  }
  akar.forEach((r) => {
    const lebar = maksX[r] - minX[r], tinggi = maksY[r] - minY[r] + 1;
    if (luas[r] < 5 || pudar.has(r)) return; // yang pudar dibuang di bawah; tidak boleh melindungi apa pun
    if (tinggi <= 4 && lebar >= 2.2 * tinggi) datar.push(r);
    else if (tinggi >= 10) tinggiHuruf.push(r);
  });
  // kisi 64 px untuk mencari huruf di sekitar komponen datar
  const SEL = 64;
  const kisi = new Map();
  tinggiHuruf.forEach((r) => {
    for (let gx = Math.floor(minX[r] / SEL); gx <= Math.floor(maksX[r] / SEL); gx++) {
      const kunci = gx;
      if (!kisi.has(kunci)) kisi.set(kunci, []);
      kisi.get(kunci).push(r);
    }
  });
  const dilindungi = (r) => {
    const lebar = maksX[r] - minX[r];
    const celah = Math.max(10, Math.round(lebar * 0.9));
    const yc = (minY[r] + maksY[r]) / 2;
    for (let gx = Math.floor((minX[r] - celah) / SEL); gx <= Math.floor((maksX[r] + celah) / SEL); gx++) {
      const daftar = kisi.get(gx);
      if (!daftar) continue;
      for (const g of daftar) {
        if (maksX[g] < minX[r] - celah || minX[g] > maksX[r] + celah) continue;
        if (yc >= minY[g] - 1 && yc <= maksY[g] + 1) return true;
      }
    }
    return false;
  };
  const buang = new Set();
  datar.forEach((r) => { if (!dilindungi(r)) buang.add(r); });
  for (let i = 0; i < nRun; i++) {
    const r = cari(i);
    if (luas[r] < 5 || buang.has(r) || pudar.has(r)) {
      const baris = yy[i] * w;
      for (let x = x0[i]; x < x1[i]; x++) ink[baris + x] = 0;
    }
  }
}

/* Kemiringan scan (derajat, + = searah jarum jam) lewat profil proyeksi:
   pada sudut yang benar baris-baris teks & garis tabel menumpuk di baris
   yang sama, sehingga ragam jumlah-tinta-per-baris paling besar. Dihitung
   pada salinan kecil (±700 px lebar) -- murah. Dicari sampai ±OCR_MIRING_MAKS
   derajat: foto ponsel tanpa aplikasi pemindai mudah miring lebih dari 3°. */
const OCR_MIRING_MAKS = 5;
function ocrMiring(ink, w, h) {
  const f = Math.max(1, Math.floor(w / 700));
  const sw = Math.floor(w / f), sh = Math.floor(h / f);
  const titik = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let ada = 0;
      for (let dy = 0; dy < f && !ada; dy++) {
        const baris = (y * f + dy) * w + x * f;
        for (let dx = 0; dx < f; dx++) if (ink[baris + dx]) { ada = 1; break; }
      }
      if (ada) titik.push(x, y);
    }
  }
  if (titik.length < 400) return 0;
  const skor = (derajat) => {
    const rad = (derajat * Math.PI) / 180, s = Math.sin(rad), c = Math.cos(rad);
    const histo = new Float64Array(sh + sw + 2);
    const geser = sw;
    for (let i = 0; i < titik.length; i += 2) {
      // koordinat y setelah diputar berlawanan arah dengan miringnya
      const yb = Math.round(titik[i + 1] * c - titik[i] * s) + geser;
      if (yb >= 0 && yb < histo.length) histo[yb]++;
    }
    /* Jumlah kuadrat isi tiap baris. Jumlah titiknya tetap di semua sudut, jadi ini
       sebanding dengan ragam terhadap banyak baris yang TETAP. Dulu dikurangi
       (jumlah^2 / banyak baris BERISI) -- pada sudut yang benar tinta menumpuk di
       baris yang lebih sedikit, pengurangnya membesar, dan skornya justru TERENDAH
       di sudut yang benar: halaman uji miring 1,5° terbaca 2°, -1,2° terbaca -0,75°,
       halaman lurus berskor 0 sehingga sudut mana pun "lebih baik". */
    let kuadrat = 0;
    for (let i = 0; i < histo.length; i++) kuadrat += histo[i] * histo[i];
    return kuadrat;
  };
  /* Sudut baru dipakai bila skornya JELAS lebih baik dari 0 derajat (>= 3%):
     halaman yang sudah lurus punya skor yang nyaris datar di sekitar nol,
     dan memutarnya karena selisih kecil hanya menambah pembuyaran tepi. */
  const skorNol = skor(0);
  let terbaik = 0, skorTerbaik = skorNol;
  for (let d = -OCR_MIRING_MAKS; d <= OCR_MIRING_MAKS + 0.0001; d += 0.25) {
    const s = skor(d);
    if (s > skorTerbaik) { skorTerbaik = s; terbaik = d; }
  }
  if (Math.abs(terbaik) < 0.3 || skorTerbaik < skorNol * 1.03) return 0;
  let halus = terbaik;
  for (let d = terbaik - 0.25; d <= terbaik + 0.2501; d += 0.05) {
    const s = skor(d);
    if (s > skorTerbaik) { skorTerbaik = s; halus = d; }
  }
  return Math.abs(halus) < 0.3 ? 0 : halus;
}

/* Putar abu-abu sebesar `derajat` (searah jarum jam = +) di sekitar pusat
   dengan interpolasi bilinear; latar yang terbuka diisi putih. */
function ocrPutar(abu, w, h, derajat) {
  const rad = (-derajat * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
  const cx = w / 2, cy = h / 2;
  const hasil = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = dx * c - dy * s + cx, sy = dx * s + dy * c + cy;
      if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
      const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0;
      const i = y0 * w + x0;
      hasil[y * w + x] = (abu[i] * (1 - tx) + abu[i + 1] * tx) * (1 - ty) + (abu[i + w] * (1 - tx) + abu[i + w + 1] * tx) * ty;
    }
  }
  return hasil;
}

/* RGBA halaman -> gambar hitam-putih bersih untuk Tesseract.
   Hasil: { bw (0 = tinta, 255 = kertas), w, h, miring (derajat yang diluruskan) } */
function ocrPraolah(rgba, w, h) {
  let abu = ocrAbuAbu(rgba, w * h);
  ocrRataiLatar(abu, w, h);
  let ink = ocrTinta(abu, w, h);
  ocrBuangGaris(ink, w, h);
  const miring = ocrMiring(ink, w, h);
  if (miring) {
    /* Halaman yang miring `miring` derajat diluruskan dengan memutarnya ke arah
       SEBALIKNYA. Dulu diputar searah miringnya: scan miring 0,85° keluar
       miring 1,7° dan kolom kanan tabel naik satu baris dari uraiannya. */
    abu = ocrPutar(abu, w, h, -miring);
    ink = ocrTinta(abu, w, h);
    ocrBuangGaris(ink, w, h);
  }
  ocrBuangNoda(ink, w, h, abu);
  const bw = new Uint8Array(w * h);
  for (let i = 0; i < bw.length; i++) bw[i] = ink[i] ? 0 : 255;
  return { bw, w, h, miring };
}

/* ------------------------------------------------------------------
   KATA -> BARIS TEKS
   Tesseract memberi kata + kotak pembatasnya. Barisnya dirakit di sini
   (bukan memakai garis Tesseract) dengan cara yang sama seperti pdfLines()
   merakit potongan teks PDF: kata sebaris = pusat vertikalnya berdekatan,
   urut dari kiri ke kanan, dipisah satu spasi. Hasilnya berbentuk sama
   dengan teks extractPdfText(), jadi pembaca invoice tidak membedakannya.
------------------------------------------------------------------ */

/* Karakter sampah hasil garis, stempel & noda -- bukan isi dokumen. ":" "/" "-"
   dan kurung TIDAK termasuk: itu pemisah isian & tanda angka. */
const OCR_RE_SAMPAH = /^[|~_—–=`´‘’“”«»©®°•·¢¥£§¤^<>\\{}[\]*#+;"']+$/;
const OCR_RE_TEPI = /^[|~_—–=`´‘’“”«»©®°•·¢¥£§¤^<>\\{}[\]*#+;"']+|[|~_—–=`´‘’“”«»©®°•·¢¥£§¤^<>\\{}[\]*#+;"']+$/g;

/* Kata mirip angka: hanya angka, pemisah, kurung / minus, ditambah huruf
   yang sering tertukar dengan angka (O 0, I l | 1, S 5, B 8, Z 2). */
const OCR_RE_MIRIP_ANGKA = /^[\d.,()\-OoIl|!SsBZz]+$/;
function ocrBakuAngka(teks) {
  const s = String(teks || "");
  if (!OCR_RE_MIRIP_ANGKA.test(s)) return s;
  const digit = (s.match(/\d/g) || []).length;
  if (digit < 1 || digit < s.replace(/[.,()\-]/g, "").length * 0.6) return s; // kebanyakan huruf: bukan angka
  /* Hanya yang BENTUKNYA angka: diawali angka / tanda, atau bersambung
     pemisah desimal-ribuan ("l50,000.00"). Kode berawalan huruf TANPA
     pemisah ("SO2607101", "BO26") adalah nomor dokumen -- hurufnya
     sungguhan, jangan diubah jadi angka. */
  if (!/^[\d(\-.,]/.test(s) && !/[.,]\d/.test(s)) return s;
  return ocrRapikanPemisah(s.replace(/[Oo]/g, "0").replace(/[Il|!]/g, "1").replace(/[Ss]/g, "5").replace(/B/g, "8").replace(/[Zz]/g, "2"));
}

/* Pemisah ribuan & desimal yang TERTUKAR pada hasil baca. Pada scan,
   koma dan titik nyaris tak terbedakan, dan satu angka bisa keluar sebagai
   "1.000.368.00" (semua titik) padahal tertulis "1,000,368.00". Aturannya:
   kalau angka berakhir pada kelompok 1-2 digit sesudah SATU atau lebih
   kelompok 3 digit, kelompok terakhir itu desimal dan sisanya ribuan --
   dibentuk ulang berformat "1,000,368.00". Angka dengan satu pemisah saja
   ("1.000") TIDAK disentuh: bisa ribuan, bisa desimal. Berlaku juga untuk
   tulisan gaya Indonesia ("1.234,56" -> "1,234.56"). Bentuk yang sudah
   benar tidak berubah. */
function ocrRapikanPemisah(teks) {
  const m = /^(\(?-?)(\d{1,3}(?:[.,]\d{3})+)[.,](\d{1,2})(\)?)$/.exec(String(teks || ""));
  return m ? `${m[1]}${m[2].replace(/[.,]/g, ",")}.${m[3]}${m[4]}` : String(teks || "");
}

/* Bentuk angka uang yang sah: ribuan berkoma ("8,543,486.00"), atau polos
   ("833.00", "3562652.24", "380000"). Bentuk campuran ("8,543486.00",
   "300,00000") pasti salah baca. */
function ocrAngkaSah(teks) {
  const s = String(teks || "").replace(/^\(|\)$/g, "").replace(/^-/, "");
  if (/^\d{1,3}(,\d{3})+(\.\d{1,4})?$/.test(s)) return true;
  return /^\d+(\.\d{1,4})?$/.test(s) && !/^\d{1,3},/.test(s);
}

/* TITIK DUA YANG TERBACA "1"

   Di depan angka, Tesseract kerap membaca titik dua pemisah isian sebagai
   "1" berkepercayaan rendah (kadang "©", ">", "i") -- sendirian ("Date 1
   17/11/2026", "LS No 1 ITB21G...") atau MENEMPEL di depan nilainya ("No.
   1264163281" untuk "No. : 264163281"). Dua mode baca yang sama-sama salah
   begitu lalu mengalahkan mode ketiga yang benar, dan nomor invoice keluar
   dengan "1" palsu di depannya.

   Bentuk simbolnya membuka kedoknya: titik dua setinggi huruf KECIL --
   lebih pendek dari angka & huruf besar di sebelahnya, puncaknya lebih
   rendah, kakinya di garis dasar yang sama -- dan sempit. Angka 1 dan huruf
   I sungguhan setinggi angka lain. Acuannya simbol angka / huruf besar
   TERDEKAT di baris yang sama, di KIRI (labelnya) dan di KANAN (nilainya)
   masing-masing: kolom nilai kerap tercetak beberapa piksel lebih rendah
   dari labelnya, dan titik dua ikut salah satunya. Cukup cocok dengan satu
   sisi. Simbol seperti itu yang berdiri sendiri dijadikan ":"; yang di
   AWAL kata dilepas jadi kata ":" sendiri bila sisanya ANGKA ("1264163281"
   -> ":" + "264163281") -- huruf besar yang ujungnya rusak ("INTERNATIONAL"
   di kop berarsir, "IDR") dan "item" yang titik huruf i-nya pudar tidak
   terbelah. */
const OCR_RE_MIRIP_TITIK_DUA = /^[1lI|!i:;>©®]$/;
const OCR_ACUAN_TITIK_DUA = 4; // simbol acuan terdekat per sisi yang ditimbang
function ocrMiripTitikDua(s, acuanBaris) {
  if (!s || !s.bbox || !OCR_RE_MIRIP_TITIK_DUA.test(String(s.text || ""))) return false;
  const cx = (s.bbox.x0 + s.bbox.x1) / 2;
  const pusat = (a) => (a.bbox.x0 + a.bbox.x1) / 2;
  const tinggiS = s.bbox.y1 - s.bbox.y0;
  const cocok = (dekat) => {
    if (dekat.length < 2) return false;
    const med = (f) => dekat.map(f).sort((x, y) => x - y)[dekat.length >> 1];
    const tinggi = med((a) => a.bbox.y1 - a.bbox.y0), atas = med((a) => a.bbox.y0), kaki = med((a) => a.bbox.y1);
    return tinggi > 0 &&
      tinggiS >= 0.45 * tinggi && tinggiS <= 0.85 * tinggi &&
      s.bbox.y0 - atas >= 0.12 * tinggi &&
      Math.abs(s.bbox.y1 - kaki) <= 0.2 * tinggi &&
      s.bbox.x1 - s.bbox.x0 <= 0.3 * tinggi;
  };
  const sisi = (kiri) => acuanBaris
    .filter((a) => a !== s && (kiri ? pusat(a) < cx : pusat(a) > cx))
    .sort((a, b) => Math.abs(pusat(a) - cx) - Math.abs(pusat(b) - cx))
    .slice(0, OCR_ACUAN_TITIK_DUA);
  return cocok(sisi(true)) || cocok(sisi(false));
}

function ocrKataDariBlocks(blocks) {
  const kata = [];
  (blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
    // Simbol angka & huruf besar sebaris: acuan tinggi untuk mengenali titik dua
    const acuan = [];
    (l.words || []).forEach((w) => (w && Array.isArray(w.symbols) ? w.symbols : []).forEach((s) => {
      if (s && s.bbox && /^[0-9A-Z]$/.test(String(s.text || ""))) acuan.push(s);
    }));
    (l.words || []).forEach((w) => {
      if (!w || !w.bbox) return;
      const k = { t: String(w.text || ""), c: Number(w.confidence) || 0, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 };
      const sim = Array.isArray(w.symbols) ? w.symbols.filter((s) => s && s.bbox) : [];
      const utuh = sim.length && sim.map((s) => String(s.text || "")).join("") === k.t;
      // Yang menempel hanya dilepas dari ANGKA: huruf besar yang ujungnya rusak ("INTERNATIONAL" di kop) bukan titik dua
      const nilaiSesudah = sim.length >= 3 && /^[0-9(]/.test(String(sim[1].text || ""));
      if (utuh && (sim.length === 1 || nilaiSesudah) && ocrMiripTitikDua(sim[0], acuan)) {
        const [a, ...sisa] = sim;
        // Bentuknya yang memastikan: titik dua ini diberi kepercayaan tinggi supaya menang di pemungutan suara
        kata.push({ t: ":", c: Math.max(k.c, 90), x0: a.bbox.x0, y0: a.bbox.y0, x1: a.bbox.x1, y1: a.bbox.y1 });
        if (sisa.length) {
          const c = sisa.reduce((x, s) => x + (Number(s.confidence) || 0), 0) / sisa.length;
          kata.push({
            t: k.t.slice(String(a.text).length), c: Math.round(c) || k.c,
            x0: sisa[0].bbox.x0, y0: Math.min(...sisa.map((s) => s.bbox.y0)), x1: k.x1, y1: Math.max(...sisa.map((s) => s.bbox.y1)),
          });
        }
        return;
      }
      kata.push(k);
    });
  })));
  return kata;
}

/* kata[{t,c,x0,y0,x1,y1}] -> baris[{ y, teks, kata }] dari atas ke bawah.

   Kata dirangkai dari KIRI ke kanan: tiap kata masuk ke baris yang kata
   terakhirnya (yang paling kanan sejauh ini) setinggi dia -- bukan ke baris
   yang RATA-RATA tingginya dekat. Scan / foto yang sedikit miring atau
   melengkung (sisa pelurusan, kertas tertekuk) membuat ujung kanan satu baris
   tabel beberapa piksel lebih tinggi dari ujung kirinya; dulu kata diurutkan
   menurut tinggi dulu, jadi kolom angka baris N tercampur ke baris N-1 dan
   uraiannya tertinggal di baris sendiri. Tanda kecil (titik, koma, titik dua)
   ikut barisnya tetapi tidak dipakai sebagai patokan tinggi -- letaknya di
   kaki huruf. Batas longgar (1x tinggi huruf dari rata-rata baris) menjaga
   rangkaian tidak "merambat" ke baris tetangga. */
function ocrSusunBaris(kata) {
  const layak = (kata || [])
    .map((k) => {
      const bersih = String(k.t || "").trim().replace(OCR_RE_TEPI, "");
      return Object.assign({}, k, { t: ocrBakuAngka(bersih) });
    })
    .filter((k) => k.t && !OCR_RE_SAMPAH.test(k.t) && k.x1 > k.x0 && k.y1 > k.y0)
    // titik / koma / tanda lepas berkepercayaan rendah = noda
    .filter((k) => k.t.length > 1 || /[A-Za-z0-9:/()-]/.test(k.t) || k.c >= 60);
  if (!layak.length) return [];
  const tinggi = layak.map((k) => k.y1 - k.y0).sort((a, b) => a - b);
  const med = tinggi[tinggi.length >> 1] || 20;
  const yc = (k) => (k.y0 + k.y1) / 2;
  const urut = layak.slice().sort((a, b) => a.x0 - b.x0 || yc(a) - yc(b));
  const baris = []; // { ujung: tinggi patokan (kata penuh terakhir), jumlah: jumlah tinggi semua kata, kata }
  urut.forEach((k) => {
    const y = yc(k);
    let pilih = null, jarak = Infinity;
    baris.forEach((b) => {
      const d = Math.abs(y - b.ujung);
      if (d <= 0.5 * med && d < jarak && Math.abs(y - b.jumlah / b.kata.length) <= med) { pilih = b; jarak = d; }
    });
    const penuh = k.y1 - k.y0 >= 0.6 * med;
    if (!pilih) baris.push({ ujung: y, jumlah: y, kata: [k], penuh });
    else {
      pilih.kata.push(k);
      pilih.jumlah += y;
      if (penuh || !pilih.penuh) { pilih.ujung = y; pilih.penuh = pilih.penuh || penuh; }
    }
  });
  return baris
    .map((b) => ({ y: b.jumlah / b.kata.length, teks: b.kata.map((k) => k.t).join(" "), kata: b.kata }))
    .sort((a, b) => a.y - b.y || a.kata[0].x0 - b.kata[0].x0);
}

const ocrRata2 = (kata) => (kata && kata.length ? kata.reduce((x, k) => x + k.c, 0) / kata.length : 0);

/* ------------------------------------------------------------------
   TESSERACT.JS -- diunduh saat pertama dibutuhkan; SEKUMPULAN pekerja

   Tiga pembacaan satu halaman (PSM 6 / 4 / 11) saling lepas, jadi dijalankan
   SERENTAK di tiga pekerja -- tiap pekerja satu Web Worker. Dulu ketiganya
   bergiliran di satu pekerja dan menghabiskan ±80% waktu OCR. Diukur pada
   8 invoice scan: 1 pekerja 10,4 dtk/halaman, 2 pekerja 8,1, 3 pekerja 6,8 --
   bahkan di CPU 2 inti tiga pekerja tetap paling cepat (tidak ada inti yang
   menganggur menunggu pembacaan ketiga). Perangkat 1 inti atau bermemori kecil
   (navigator.deviceMemory < 4 GB) memakai satu pekerja dan membaca bergiliran
   seperti dulu. Pekerja pertama dibuat lebih dulu: data bahasanya diunduh
   sekali, pekerja berikutnya mengambilnya dari cache peramban.

   Tiap pekerja mengingat parameter terakhirnya (ocrKeadaan); pembacaan yang
   butuh parameter lain menyetelnya sendiri sebelum membaca, jadi tidak ada
   "kembalikan ke parameter halaman" sesudahnya.
------------------------------------------------------------------ */

/* Pekerja serentak: satu per pembacaan halaman. Tiap pekerja menahan ±60-100 MB
   selama hidup (dilepas bersama setelah OCR_LEPAS_MS menganggur). */
const OCR_PEKERJA_MAKS = 3;

let ocrTesseractPromise = null;
let ocrPekerjaPromise = null; // pekerja utama
let ocrTambahanPromise = null; // pekerja tambahan (kolam)
let ocrLepasTimer = null;
/* Pelapor kemajuan pembacaan berkas yang sedang berjalan: pesan mesin yang bukan
   milik satu pembacaan (unduhan data bahasa, persiapan pekerja) dikirim ke semuanya. */
const ocrPelapor = new Set();
/* pekerja -> { param terakhir, sibuk, kemajuan: pelapor persen milik pembacaan yang sedang dikerjakannya } */
const ocrKeadaan = new WeakMap();
/* Peminjam yang antre menunggu pekerja bebas: [{ urutan, beres }]. Urutan = nomor
   pembacaan berkas (ocrBacaBerkas) -- berkas yang lebih dulu didahulukan, jadi
   pembacaan ulang angka berkas yang sedang ditunggu tidak tertahan di belakang
   halaman berkas berikutnya yang sudah disiapkan. */
const ocrMenunggu = [];
let ocrNomorBaca = 0;

function ocrMuatTesseract() {
  if (!ocrTesseractPromise) {
    ocrTesseractPromise = import(`https://cdn.jsdelivr.net/npm/tesseract.js@${OCR_VER_TESSERACT}/dist/tesseract.esm.min.js`)
      .then((m) => {
        const T = m.default || m;
        if (!T || typeof T.createWorker !== "function") throw new Error("Tesseract.js tidak termuat");
        return T;
      })
      .catch((e) => {
        ocrTesseractPromise = null; // percobaan berikutnya boleh mengulang
        throw e;
      });
  }
  return ocrTesseractPromise;
}

/* Pesan mesin Tesseract: kemajuan MEMBACA milik pembacaan yang sedang dikerjakan
   pekerja itu (st.kemajuan); pesan lain (memuat, menyiapkan) ke semua pelapor. */
function ocrCatatMesin(st, m) {
  if (!m || !m.status) return;
  const status = String(m.status), persen = Number(m.progress) || 0;
  if (/recogniz/i.test(status)) {
    if (st.kemajuan) st.kemajuan(persen);
    return;
  }
  ocrPelapor.forEach((lapor) => lapor({ tahap: "mesin", status, persen }));
}

/* Satu pekerja Tesseract (WebAssembly di Web Worker), siap membaca halaman */
async function ocrBuatPekerja() {
  const T = await ocrMuatTesseract();
  const st = { param: OCR_PARAM_HALAMAN, sibuk: false, kemajuan: null };
  const pekerja = await T.createWorker(OCR_BAHASA, 1, { logger: (m) => ocrCatatMesin(st, m) });
  await pekerja.setParameters(OCR_PARAM_HALAMAN);
  ocrKeadaan.set(pekerja, st);
  return pekerja;
}

/* Pekerja UTAMA: dibuat sekali (unduhan pertama terjadi di sini), dipakai semua
   halaman, dilepas setelah OCR_LEPAS_MS menganggur. */
function ocrPekerja() {
  clearTimeout(ocrLepasTimer);
  if (!ocrPekerjaPromise) {
    ocrPekerjaPromise = ocrBuatPekerja().catch((e) => {
      ocrPekerjaPromise = null;
      throw e;
    });
  }
  return ocrPekerjaPromise;
}

/* Berapa pekerja yang dipakai: OCR_PEKERJA_MAKS, kecuali CPU satu inti atau memori
   perangkat < 4 GB (navigator.deviceMemory, Chrome / Edge) = 1. */
function ocrJumlahPekerja() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  if ((nav.deviceMemory && nav.deviceMemory < 4) || Number(nav.hardwareConcurrency) === 1) return 1;
  return OCR_PEKERJA_MAKS;
}

/* Kolam pekerja: utama + tambahan. Pekerja tambahan yang gagal dibuat (memori)
   dilewati -- OCR tetap jalan dengan yang ada. */
async function ocrKolam() {
  const utama = await ocrPekerja();
  const n = ocrJumlahPekerja();
  if (n < 2) return [utama];
  if (!ocrTambahanPromise) {
    ocrTambahanPromise = Promise.allSettled(Array.from({ length: n - 1 }, () => ocrBuatPekerja()))
      .then((hasil) => hasil.filter((x) => x.status === "fulfilled").map((x) => x.value));
  }
  return [utama].concat((await ocrTambahanPromise).slice(0, n - 1));
}

const ocrStatus = (p) => {
  if (!ocrKeadaan.has(p)) ocrKeadaan.set(p, { param: OCR_PARAM_HALAMAN, sibuk: false, kemajuan: null });
  return ocrKeadaan.get(p);
};

/* Pinjam pekerja yang bebas -- yang parameternya sudah sama didahulukan; semua
   sibuk = antre menurut `urutan` (lalu kedatangan). Dikembalikan lewat ocrKembalikan. */
function ocrPinjam(kolam, param, urutan) {
  const bebas = kolam.filter((p) => !ocrStatus(p).sibuk);
  const pilih = bebas.find((p) => ocrStatus(p).param === param) || bebas[0];
  if (pilih) {
    ocrStatus(pilih).sibuk = true;
    return Promise.resolve(pilih);
  }
  return new Promise((beres) => {
    const u = urutan || 0;
    let i = ocrMenunggu.length;
    while (i > 0 && ocrMenunggu[i - 1].urutan > u) i--;
    ocrMenunggu.splice(i, 0, { urutan: u, beres });
  });
}

function ocrKembalikan(p) {
  const berikut = ocrMenunggu.shift();
  if (berikut) berikut.beres(p); // langsung dipinjamkan lagi, tetap sibuk
  else ocrStatus(p).sibuk = false;
}

/* SATU pembacaan (gambar PBM, lihat ocrBwKePbm) di pekerja mana pun yang bebas.
   tugas = { urutan, kemajuan(persen) } -- keduanya boleh tidak ada. */
async function ocrBaca(gambar, param, kolam, tugas) {
  const tg = tugas || {};
  const daftar = kolam || (await ocrKolam());
  const p = await ocrPinjam(daftar, param, tg.urutan);
  const st = ocrStatus(p);
  try {
    if (st.param !== param) {
      await p.setParameters(param);
      st.param = param;
    }
    st.kemajuan = tg.kemajuan || null;
    return await p.recognize(gambar, {}, { blocks: true });
  } finally {
    st.kemajuan = null;
    ocrKembalikan(p);
  }
}

/* Parameter pembacaan satu halaman utuh: satu blok teks seragam (kolom
   tabel tetap terbaca baris demi baris; barisnya dirakit ulang dari
   koordinat kata, jadi urutan blok Tesseract tidak menentukan). Spasi
   antar-kata dipertahankan supaya kolom tidak menempel. */
const OCR_PARAM_HALAMAN = {
  tessedit_pageseg_mode: "6",
  preserve_interword_spaces: "1",
  user_defined_dpi: String(OCR_DPI),
  tessedit_char_whitelist: "",
};
/* Pembacaan pelengkap (lihat ocrGabungBacaan): satu kolom berukuran huruf
   bervariasi ... */
const OCR_PARAM_KOLOM = Object.assign({}, OCR_PARAM_HALAMAN, { tessedit_pageseg_mode: "4" });
/* ... dan teks jarang -- kata ditemukan di mana pun, tanpa anggapan soal tata letak. */
const OCR_PARAM_JARANG = Object.assign({}, OCR_PARAM_HALAMAN, { tessedit_pageseg_mode: "11" });
/* Pembacaan ulang SATU angka: satu baris, hanya karakter angka. */
const OCR_PARAM_ANGKA = {
  tessedit_pageseg_mode: "7",
  preserve_interword_spaces: "0",
  user_defined_dpi: String(OCR_DPI),
  tessedit_char_whitelist: "0123456789.,()-",
};

/* Dijadwalkan oleh pembacaan berkas TERAKHIR yang selesai -- selama berkas lain
   masih dibaca (ocrPelapor), pekerjanya tidak boleh dilepas. */
function ocrJadwalLepas() {
  clearTimeout(ocrLepasTimer);
  if (ocrPelapor.size) return;
  ocrLepasTimer = setTimeout(ocrLepas, OCR_LEPAS_MS);
}

async function ocrLepas() {
  clearTimeout(ocrLepasTimer);
  const daftar = [ocrPekerjaPromise, ocrTambahanPromise];
  ocrPekerjaPromise = null;
  ocrTambahanPromise = null;
  for (const janji of daftar) {
    if (!janji) continue;
    try {
      const isi = await janji;
      for (const pekerja of [].concat(isi)) await pekerja.terminate();
    } catch (e) {
      /* sudah mati / gagal dibuat: tidak ada yang perlu dilepas */
    }
  }
}

/* ------------------------------------------------------------------
   HALAMAN -> PIKSEL
------------------------------------------------------------------ */

function ocrBuatKanvas(w, h) {
  const k = document.createElement("canvas");
  k.width = w;
  k.height = h;
  return k;
}

/* Satu halaman pdf.js -> RGBA ~300 dpi (dibatasi OCR_MAKS_PIKSEL) */
async function ocrRenderHalaman(halaman) {
  const vp1 = halaman.getViewport({ scale: 1 });
  let skala = OCR_DPI / 72;
  if (vp1.width * vp1.height * skala * skala > OCR_MAKS_PIKSEL) skala = Math.sqrt(OCR_MAKS_PIKSEL / (vp1.width * vp1.height));
  const vp = halaman.getViewport({ scale: skala });
  const w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height));
  const kanvas = ocrBuatKanvas(w, h);
  const ctx = kanvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; // halaman transparan = kertas putih
  ctx.fillRect(0, 0, w, h);
  await halaman.render({ canvasContext: ctx, viewport: vp, canvas: kanvas }).promise;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  kanvas.width = kanvas.height = 0; // lepas memori kanvas secepatnya
  return { rgba, w, h };
}

/* Berkas gambar (foto / hasil scan JPG, PNG, ...) -> RGBA. Sisi panjang
   dibawa ke ±3300 px (A4 300 dpi): gambar kecil diperbesar (maks 3x),
   yang sangat besar diperkecil sampai OCR_MAKS_PIKSEL. Arah foto (EXIF)
   diikuti peramban. */
const OCR_SISI_TARGET = 3300;
async function ocrMuatGambar(berkas) {
  const bmp = await createImageBitmap(berkas);
  try {
    const sisi = Math.max(bmp.width, bmp.height);
    let skala = sisi < OCR_SISI_TARGET * 0.8 ? Math.min(3, OCR_SISI_TARGET / sisi) : 1;
    if (bmp.width * bmp.height * skala * skala > OCR_MAKS_PIKSEL) skala = Math.sqrt(OCR_MAKS_PIKSEL / (bmp.width * bmp.height));
    const w = Math.max(1, Math.round(bmp.width * skala)), h = Math.max(1, Math.round(bmp.height * skala));
    const kanvas = ocrBuatKanvas(w, h);
    const ctx = kanvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    kanvas.width = kanvas.height = 0;
    return { rgba, w, h };
  } finally {
    if (bmp.close) bmp.close();
  }
}

/* Hitam-putih (0 = tinta) -> gambar PBM 1-bit (P4) untuk Tesseract; `kotak` =
   potongan [x0, y0, x1, y1] dengan tepi putih `tepi` piksel.

   KENAPA PBM, BUKAN PNG: gambarnya memang sudah hitam-putih. PNG berarti kanvas
   selebar halaman + pemampat zlib di peramban, lalu di TIAP pembacaan dibuka lagi
   jadi gambar 32-bit (±56 MB untuk 14 juta piksel) di dalam WebAssembly dan
   diubah ke abu-abu. PBM = 1 bit per piksel (±1,8 MB), disusun langsung dari
   larik ini tanpa kanvas, dibaca Leptonica tanpa diurai. Hasil baca Tesseract-nya
   SAMA persis (diuji: kata, kotak & kepercayaan identik), satu pembacaan
   halaman ±20-35% lebih cepat. Uint8Array diterima Tesseract.js apa adanya. */
function ocrBwKePbm(bw, w, h, kotak, tepi) {
  const [x0, y0, x1, y1] = kotak || [0, 0, w, h];
  const pad = tepi || 0;
  const lebar = x1 - x0 + 2 * pad, tinggi = y1 - y0 + 2 * pad;
  const kepala = `P4\n${lebar} ${tinggi}\n`;
  const perBaris = (lebar + 7) >> 3;
  const hasil = new Uint8Array(kepala.length + perBaris * tinggi);
  for (let i = 0; i < kepala.length; i++) hasil[i] = kepala.charCodeAt(i);
  for (let y = 0; y < y1 - y0; y++) {
    const asal = (y0 + y) * w + x0;
    const tuju = kepala.length + (y + pad) * perBaris;
    for (let x = 0; x < x1 - x0; x++) {
      if (bw[asal + x] === 0) {
        const xx = x + pad;
        hasil[tuju + (xx >> 3)] |= 0x80 >> (xx & 7); // 1 = hitam
      }
    }
  }
  return hasil;
}

/* Beri napas ke peramban (toast, animasi) di antara tahap yang berat */
const ocrJeda = () => new Promise((selesai) => setTimeout(selesai, 0));

/* ------------------------------------------------------------------
   PEMBACAAN ULANG ANGKA
   Satu angka rupiah yang salah lebih buruk daripada baris yang tak
   terbaca, jadi angka yang diragukan tidak dibiarkan: dibaca ULANG
   sendirian (satu baris, hanya karakter angka) dan hasil yang lebih
   masuk akal dipakai. "Masuk akal" = bentuk angka uang yang sah
   ("8,543,486.00", bukan "8,543486.00"); kalau keduanya sah, yang
   kepercayaannya lebih tinggi.
------------------------------------------------------------------ */

/* Teks sebuah kata yang sudah dibersihkan: tanda sampah di tepi dibuang,
   huruf yang tertukar dengan angka diperbaiki, pemisah dirapikan. */
const ocrNorm = (teks) => ocrBakuAngka(String(teks || "").trim().replace(OCR_RE_TEPI, ""));
/* Angka uang: ada pemisah desimal / ribuan ("8,543,486.00", "833.00") */
const ocrMiripUang = (s) => /\d/.test(s) && /[.,]\d/.test(s) && /^[\d.,()\-]+$/.test(s) && s.replace(/[^\d]/g, "").length >= 3;
/* Hanya angka, pemisah boleh tidak ada ("5263118") */
const ocrSemuaAngka = (s) => /^[\d.,()\-]+$/.test(s) && s.replace(/\D/g, "").length >= 3;
/* Tanda sebuah angka = digitnya (+ tanda minus / kurung): "5,263,118" dan "5263118"
   sama nilainya, "(4,503)" dan "4,503" tidak */
const ocrTandaAngka = (s) => (/^\(.*\)$|^-/.test(String(s || "")) ? "-" : "") + String(s || "").replace(/\D/g, "");
/* Ribuan berkoma dengan benar: "41,250" "5,263,118.00" */
const ocrBentukRibuan = (s) => /^\(?-?\d{1,3}(,\d{3})+(\.\d+)?\)?$/.test(String(s || ""));

/* PEMUNGUTAN SUARA untuk satu angka. calon = [{ t, c }]: pembacaan utama,
   pembacaan kedua (bila berbeda), dan pembacaan ulang khusus angka.

   1. Dua pembacaan atau lebih yang digitnya SAMA menang -- tiga pembaca
      yang bekerja berbeda jarang salah di digit yang sama.
   2. Tidak ada yang sepakat: pilih bentuk angka yang SAH, lalu yang
      kepercayaannya tertinggi.
   `pasti` = ada kesepakatan dan -- untuk angka berbentuk uang -- bentuknya
   sah; selain itu angkanya dilaporkan sebagai "meragukan". Tanggal & nomor
   ("2026-08-15", "1115-213-000043-11") cukup disepakati. */
function ocrPilihAngka(calon) {
  const item = calon.map((x, i) => {
    const angka = ocrNorm(x.t);
    return { t: angka, c: x.c, urut: i, tanda: ocrTandaAngka(angka), sah: ocrAngkaSah(angka) };
  });
  const suara = new Map();
  item.forEach((x) => { if (x.tanda) suara.set(x.tanda, (suara.get(x.tanda) || 0) + 1); });
  let menang = null;
  suara.forEach((n, tanda) => { if (n >= 2 && (!menang || n > menang.n)) menang = { tanda, n }; });
  const kolam = menang ? item.filter((x) => x.tanda === menang.tanda) : item;
  const urut = kolam.slice().sort((a, b) =>
    (Number(b.sah) - Number(a.sah)) || (Number(ocrBentukRibuan(b.t)) - Number(ocrBentukRibuan(a.t))) || (b.c - a.c) || (a.urut - b.urut));
  return { t: urut[0].t, c: urut[0].c, pasti: !!menang && (urut[0].sah || !ocrMiripUang(urut[0].t)) };
}

/* ------------------------------------------------------------------
   TIGA PEMBACAAN, SATU HASIL
   Salah baca satu digit rupiah jauh lebih buruk daripada baris yang hilang,
   dan tiap mode baca Tesseract punya titik buta sendiri. Halaman yang sama
   dibaca TIGA kali, mode-mode yang bekerja berbeda:

     1. "blok"   (PSM 6)  paling teliti untuk isi tabel, tetapi kerap MELEWATKAN
                          baris yang ukuran hurufnya beda -- judul "INVOICE" /
                          "DEBIT NOTE", nama perusahaan di kop;
     2. "kolom"  (PSM 4)  tata letak lain: menemukan judul, dan benar di digit
                          yang salah di mode lain;
     3. "jarang" (PSM 11) menemukan kata di mana pun tanpa anggapan tata letak,
                          tetapi paling sering salah di digit ("17,538.00" ->
                          "17,638.00" pada gambar yang jelas).

   Kata dari ketiganya dikelompokkan menurut KOTAKNYA (satu kelompok = satu
   kata di halaman), lalu tiap kelompok diputuskan:

   - kata yang hanya ada di pembacaan pelengkap -> ditambahkan bila meyakinkan
     (judul yang hilang);
   - angka -> pemungutan suara menurut DIGIT: dua pembacaan atau lebih yang
     digitnya sama menang, apa pun pemisah ribuannya; tak ada yang sepakat ->
     dibaca ULANG sendirian lalu dipungut suara lagi (ocrBacaUlangAngka);
   - kode (huruf + angka: nomor invoice / HAWB) -> suara terbanyak;
   - kata biasa -> pembacaan blok, kecuali ia jelas buruk (kepercayaan rendah).
------------------------------------------------------------------ */

/* Kata yang hanya ditemukan SATU pembacaan pelengkap ditambahkan bila kepercayaannya setinggi ini */
const OCR_ISI_MIN = 90;

/* Irisan dua kotak, dibagi luas kotak yang LEBIH KECIL (0-1) */
function ocrIrisan(a, b) {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  if (x1 <= x0) return 0;
  const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  if (y1 <= y0) return 0;
  const kecil = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
  return kecil > 0 ? ((x1 - x0) * (y1 - y0)) / kecil : 0;
}

/* Kode: huruf DAN angka bercampur, tanpa spasi ("PFIJKT006824", "AO2607101") */
const ocrMiripKode = (s) => /^[A-Za-z0-9|/.\-]{5,}$/.test(s) && /\d/.test(s) && /[A-Za-z|]/.test(s);
/* Kunci kode: huruf besar + angka saja ("Al2602950" dan "AL2602950" sama) */
const ocrTandaKode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* Memutuskan SATU kelompok: `anggota` = kata yang sama dari tiap pembacaan,
   berurutan menurut prioritas (blok, kolom, jarang). Hasilnya satu kata;
   angka yang tak disepakati membawa `suara` untuk pembacaan ulang. */
function ocrPutuskanGugus(anggota) {
  const dasar = anggota[0];
  const kata = { t: dasar.t, c: dasar.c, x0: dasar.x0, y0: dasar.y0, x1: dasar.x1, y1: dasar.y1 };
  if (anggota.length < 2) return kata;
  const norm = anggota.map((x) => ocrNorm(x.t));
  // 1. angka
  if (ocrSemuaAngka(norm[0])) {
    const angka = anggota.filter((x, i) => ocrSemuaAngka(norm[i]));
    if (angka.length >= 2) {
      const pilih = ocrPilihAngka(angka.map((x) => ({ t: x.t, c: x.c })));
      kata.t = pilih.t;
      kata.c = pilih.c;
      kata.pasti = pilih.pasti;
      if (!pilih.pasti) kata.suara = angka.map((x) => ({ t: x.t, c: x.c }));
      return kata;
    }
  }
  // 2. kode: suara terbanyak; tanpa kesepakatan, pembacaan berprioritas tertinggi
  if (ocrMiripKode(norm[0])) {
    const kelompok = new Map();
    anggota.forEach((x, i) => {
      if (!ocrMiripKode(norm[i])) return;
      const kunci = ocrTandaKode(x.t);
      kelompok.set(kunci, (kelompok.get(kunci) || []).concat([x]));
    });
    let menang = null;
    kelompok.forEach((m) => { if (m.length >= 2 && (!menang || m.length > menang.length)) menang = m; });
    if (menang) {
      const terbaik = menang.reduce((p, x) => (x.c > p.c ? x : p), menang[0]);
      kata.t = terbaik.t;
      kata.c = terbaik.c;
    }
    return kata;
  }
  /* 3. kata biasa: pembacaan utama, kecuali jelas buruk dan ada yang jauh lebih yakin.
     Penggantinya harus selebar kata itu: POTONGANNYA ("Sea" dari "Sealimport") bukan
     pengganti -- dulu "Sea" menggantikan seluruh "Sea Import" dan "Import" hilang. */
  const lebarDasar = dasar.x1 - dasar.x0;
  let lebih = null;
  anggota.slice(1).forEach((x) => { if (dasar.c < 50 && x.c >= dasar.c + 25 && x.x1 - x.x0 >= 0.7 * lebarDasar && (!lebih || x.c > lebih.c)) lebih = x; });
  if (lebih) {
    kata.t = lebih.t;
    kata.c = lebih.c;
  } else {
    anggota.forEach((x, i) => { if (norm[i] === norm[0] && x.c > kata.c) kata.c = x.c; });
  }
  return kata;
}

/* Kata GABUNGAN yang lemah di pembacaan sebelumnya ("Sealimport" 16%, "/Incoterm" 4%)
   dipecah bila pembacaan berikutnya membacanya sebagai beberapa kata yang yakin
   ("Sea" 92% + "Import" 92%). Ambang: gabungan di bawah OCR_PECAH_LEMAH, tiap
   potongan sedikitnya OCR_PECAH_YAKIN. Kebalikannya -- kata utuh yang sudah yakin
   ("131,000.00" 90%) dan potongan baca lain ("131," + "000.00") -- tidak dipecah. */
const OCR_PECAH_LEMAH = 55;
const OCR_PECAH_YAKIN = 80;

/* bacaan = [kata[] dari tiap pembacaan, berurutan menurut prioritas]
   -> { kata, diisi, diganti, sengketa } -- `diganti` = gugus yang diganti
   pemenggalan kata pembacaan lain (kata utuh menggantikan serpihan, atau potongan
   menggantikan gabungan) */
function ocrGabungBacaan(bacaan) {
  const gugus = []; // { a: kotak wakil, anggota: [kata + { r }], mati, pecahan }
  let diganti = 0;
  (bacaan || []).forEach((daftar, r) => {
    const sudah = new Set(); // satu kata dari satu pembacaan = satu gugus
    const layak = (daftar || []).filter((b) => {
      const nb = ocrNorm(b.t);
      return nb && !OCR_RE_SAMPAH.test(nb);
    }).map((b) => Object.assign({}, b, { r }));
    /* Pemecahan dulu: gugus yang ditimpa >= 2 kata pembacaan ini, masing-masing hanya
       menimpa gugus itu, bersebelahan dalam satu baris (tidak bertumpuk). */
    const dalam = new Map();
    layak.forEach((kata) => {
      const kena = [];
      gugus.forEach((g, i) => { if (!g.mati && ocrIrisan(g.a, kata) >= 0.4) kena.push(i); });
      if (kena.length === 1) dalam.set(kena[0], (dalam.get(kena[0]) || []).concat([kata]));
    });
    const pecahan = new Set();
    dalam.forEach((potong, i) => {
      const g = gugus[i];
      if (potong.length < 2 || g.anggota.some((x) => x.c >= OCR_PECAH_LEMAH) || potong.some((x) => x.c < OCR_PECAH_YAKIN)) return;
      const urut = potong.slice().sort((a, b) => a.x0 - b.x0);
      // tiap potongan setinggi gabungannya, dan tidak menimpa potongan di kirinya lebih dari seperempat
      const sebaris = urut.every((x, j) =>
        Math.min(x.y1, g.a.y1) - Math.max(x.y0, g.a.y0) > 0.5 * (x.y1 - x.y0) &&
        (!j || x.x0 >= urut[j - 1].x1 - 0.25 * (urut[j - 1].x1 - urut[j - 1].x0)));
      if (!sebaris) return;
      g.mati = true;
      diganti++;
      urut.forEach((x) => {
        pecahan.add(x);
        sudah.add(gugus.push({ a: x, anggota: [x], pecahan: true }) - 1);
      });
    });
    layak.forEach((kata) => {
      if (pecahan.has(kata)) return;
      const cocok = [];
      let tumpang = 0;
      gugus.forEach((g, i) => {
        if (g.mati || ocrIrisan(g.a, kata) < 0.4) return;
        tumpang++;
        if (!sudah.has(i)) cocok.push(i);
      });
      // serpihan kata yang sudah dicakup pembacaan ini ("131,000" -> "131," + "000,"): bukan kata baru
      if (!cocok.length && tumpang) return;
      if (!cocok.length) {
        sudah.add(gugus.push({ a: kata, anggota: [kata] }) - 1);
        return;
      }
      if (cocok.length === 1) {
        gugus[cocok[0]].anggota.push(kata);
        sudah.add(cocok[0]);
        return;
      }
      // satu kata menimpa beberapa gugus (kata yang terpecah di pembacaan sebelumnya): ganti bila semuanya buruk
      if (kata.c >= 80 && cocok.every((i) => gugus[i].anggota.length === 1 && gugus[i].anggota[0].c < 55)) {
        cocok.forEach((i) => { gugus[i].mati = true; });
        sudah.add(gugus.push({ a: kata, anggota: [kata] }) - 1);
        diganti++;
      }
    });
  });
  const hasil = [];
  let diisi = 0, sengketa = 0;
  gugus.forEach((g) => {
    if (g.mati) return;
    // potongan kata gabungan yang lemah sudah lolos syarat yakin saat dipecah
    if (g.anggota[0].r !== 0 && !g.pecahan) {
      /* Hanya ditemukan pembacaan pelengkap -- paling sering serpihan garis tabel
         ("4", "000,") yang dibaca yakin. Diterima bila DUA pembacaan sepakat, atau
         satu pembacaan sangat yakin dan bentuknya kata / angka uang, bukan serpihan. */
      const norm = g.anggota.map((x) => ocrNorm(x.t));
      const sepakat = g.anggota.length >= 2 && g.anggota.some((x, i) => i > 0 && norm[i] === norm[0] && Math.min(x.c, g.anggota[0].c) >= 55);
      const tegas = g.anggota.some((x, i) => x.c >= OCR_ISI_MIN && (/[A-Za-z]{3,}/.test(norm[i]) || ocrMiripUang(norm[i])));
      if (!sepakat && !tegas) return;
      diisi++;
    }
    const k = ocrPutuskanGugus(g.anggota);
    if (k.suara) sengketa++;
    hasil.push(k);
  });
  return { kata: hasil, diisi, diganti, sengketa };
}

/* Potong sebuah kata dari gambar bersih lalu baca SENDIRIAN, hanya angka */
async function ocrBacaSatuAngka(pra, k, kolam, urutan) {
  const tepiBaca = 6;
  const x0 = Math.max(0, Math.floor(k.x0 - tepiBaca)), y0 = Math.max(0, Math.floor(k.y0 - tepiBaca));
  const x1 = Math.min(pra.w, Math.ceil(k.x1 + tepiBaca)), y1 = Math.min(pra.h, Math.ceil(k.y1 + tepiBaca));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  const hasil = await ocrBaca(ocrBwKePbm(pra.bw, pra.w, pra.h, [x0, y0, x1, y1], 14), OCR_PARAM_ANGKA, kolam, { urutan });
  const k2 = ocrKataDariBlocks(hasil.data.blocks);
  if (!k2.length) return null;
  // beberapa "kata" dalam satu potongan = digabung kiri ke kanan tanpa spasi
  k2.sort((a, b) => a.x0 - b.x0);
  return { t: k2.map((x) => x.t).join(""), c: Math.min.apply(null, k2.map((x) => x.c)) };
}

/* Angka yang TIDAK disepakati pembacaan (kata.suara) atau yang meragukan
   (kepercayaan rendah, bentuk bukan angka sah) dibaca ULANG sendirian; hasilnya
   dipungut suaranya bersama pembacaan sebelumnya. Semua potongan dibaca serentak
   di kolam pekerja; potongan yang gagal dibaca = tanpa suara tambahan. */
async function ocrBacaUlangAngka(pra, kata, kolam, urutan) {
  const calon = kata.filter((k) => {
    if (k.suara) return true;
    const n = ocrNorm(k.t);
    return ocrMiripUang(n) && !k.pasti && (k.c < OCR_RAGU || !ocrAngkaSah(n));
  });
  if (!calon.length) return { kata, diulang: 0, diubah: 0 };
  const ulang = await Promise.all(calon.map((k) => ocrBacaSatuAngka(pra, k, kolam, urutan).catch(() => null)));
  let diubah = 0;
  calon.forEach((k, i) => {
    const suara = k.suara ? k.suara.slice() : [{ t: k.t, c: k.c }];
    if (ulang[i]) suara.push(ulang[i]);
    const pilih = ocrPilihAngka(suara);
    if (pilih.t !== ocrNorm(k.t)) {
      k.asal = k.t;
      k.t = pilih.t;
      diubah++;
    }
    k.c = pilih.c;
    k.pasti = pilih.pasti;
    k.diulang = !!ulang[i];
    delete k.suara;
  });
  return { kata, diulang: calon.length, diubah };
}

/* ------------------------------------------------------------------
   SATU HALAMAN (RGBA) -> BARIS TEKS
------------------------------------------------------------------ */

/* Tiga pembacaan halaman (lihat ocrGabungBacaan). Lebih dari satu pekerja =
   SERENTAK (tahap "bacaSerentak", kemajuannya rata-rata ketiganya); satu pekerja =
   bergiliran (baca, baca2, baca3). Pembacaan utama (PSM 6) wajib berhasil;
   pembacaan pelengkap yang gagal hanya mengurangi ketelitian. */
async function ocrTigaBacaan(gambar, kolam, ganda, lapor, urutan) {
  const daftar = [["baca", OCR_PARAM_HALAMAN]].concat(ganda ? [["baca2", OCR_PARAM_KOLOM], ["baca3", OCR_PARAM_JARANG]] : []);
  // semua pembacaan mulai dari 0 supaya rata-ratanya tidak mundur saat pembacaan berikutnya mulai
  const persen = new Map(daftar.map(([tahap]) => [tahap, 0]));
  const kemajuan = (kunci) => (x) => {
    persen.set(kunci, x);
    const nilai = [...persen.values()];
    lapor({ tahap: "mesin", status: "recognizing text", persen: nilai.reduce((a, b) => a + b, 0) / nilai.length });
  };
  const bacaan = [];
  if (kolam.length > 1 && daftar.length > 1) {
    lapor({ tahap: "bacaSerentak" });
    const hasil = await Promise.allSettled(daftar.map(([tahap, param]) => ocrBaca(gambar, param, kolam, { urutan, kemajuan: kemajuan(tahap) })));
    if (hasil[0].status === "rejected") throw hasil[0].reason;
    hasil.forEach((x) => { if (x.status === "fulfilled") bacaan.push(ocrKataDariBlocks(x.value.data.blocks)); });
    return bacaan;
  }
  for (const [tahap, param] of daftar) {
    lapor({ tahap });
    persen.clear();
    persen.set(tahap, 0);
    try {
      const hasil = await ocrBaca(gambar, param, kolam, { urutan, kemajuan: kemajuan(tahap) });
      bacaan.push(ocrKataDariBlocks(hasil.data.blocks));
    } catch (e) {
      if (!bacaan.length) throw e;
      break;
    }
  }
  return bacaan;
}

/* Bagian UTAS HALAMAN dari pembacaan satu halaman: pembersihan gambar -> { pra, gambar }.
   Dipisah dari bagian pekerja (ocrBacaSiap) supaya halaman BERIKUTNYA bisa
   disiapkan selagi halaman ini dibaca pekerja (ocrBacaBerkas). */
async function ocrSiapkanPiksel(rgba, w, h, lapor) {
  (lapor || (() => {}))({ tahap: "olah" });
  await ocrJeda();
  const pra = ocrPraolah(rgba, w, h);
  await ocrJeda();
  return { pra, gambar: ocrBwKePbm(pra.bw, pra.w, pra.h) };
}

/* Bagian PEKERJA: tiga pembacaan -> gabung -> baca ulang angka -> baris teks.
   opsi = { progres, bacaGanda, bacaUlang, urutan } */
async function ocrBacaSiap(siap, opsi) {
  const o = opsi || {};
  const lapor = typeof o.progres === "function" ? o.progres : () => {};
  const { pra, gambar } = siap;
  const kolam = await ocrKolam();
  const bacaan = await ocrTigaBacaan(gambar, kolam, o.bacaGanda !== false, lapor, o.urutan);
  const gabung = ocrGabungBacaan(bacaan);
  let kata = gabung.kata;
  let ulang = { diulang: 0, diubah: 0 };
  if (o.bacaUlang !== false) {
    lapor({ tahap: "angka" });
    ulang = await ocrBacaUlangAngka(pra, kata, kolam, o.urutan);
    kata = ulang.kata;
  }
  const baris = ocrSusunBaris(kata);
  const angka = kata.filter((k) => ocrMiripUang(ocrNorm(k.t)));
  return {
    baris,
    teks: baris.map((b) => b.teks).join("\n"),
    kepercayaan: Math.round(ocrRata2(kata)),
    miring: pra.miring,
    jumlahKata: kata.length,
    angkaRagu: angka.filter((k) => !k.pasti && (k.c < OCR_RAGU || !ocrAngkaSah(ocrNorm(k.t)))).map((k) => ocrNorm(k.t)),
    angkaDiulang: ulang.diulang,
    angkaDiubah: ulang.diubah,
    kataDiisi: gabung.diisi,
    angkaSengketa: gabung.sengketa,
    pekerja: kolam.length,
  };
}

/* Satu halaman RGBA -> baris teks (kedua bagian berurutan) */
async function ocrBacaPiksel(rgba, w, h, opsi) {
  const o = opsi || {};
  return ocrBacaSiap(await ocrSiapkanPiksel(rgba, w, h, o.progres), o);
}

/* ------------------------------------------------------------------
   BERKAS -> TEKS PER HALAMAN
   opsi.pdf      dokumen pdf.js yang SUDAH terbuka (dari extractPdfText) --
                 kalau tidak ada, berkas PDF dibuka di sini
   opsi.progres  ({ tahap, halaman, dari, status, persen })
   opsi.maksHalaman
   Hasil: { halaman: [{ teks, kepercayaan, miring, ... }], teks, kepercayaan,
            terpotong }
------------------------------------------------------------------ */

const OCR_MAKS_HALAMAN = 20;
const ocrAdalahGambar = (f) => !!f && (/^image\/(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(f.type || "") || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(f.name || ""));

/* Halaman PDF -> { pra, gambar } (render pdf.js lalu pembersihan); `lapor` per halaman */
async function ocrSiapkanHalamanPdf(dok, p, lapor) {
  lapor({ tahap: "render" });
  const hal = await dok.getPage(p);
  let r;
  try {
    r = await ocrRenderHalaman(hal);
  } finally {
    if (hal.cleanup) hal.cleanup();
  }
  return ocrSiapkanPiksel(r.rgba, r.w, r.h, lapor);
}

async function ocrBacaBerkas(berkas, opsi) {
  const o = opsi || {};
  const lapor = typeof o.progres === "function" ? o.progres : () => {};
  const maks = o.maksHalaman || OCR_MAKS_HALAMAN;
  const urutan = ++ocrNomorBaca;
  const halaman = [];
  let terpotong = false;
  const laporMesin = (m) => lapor(Object.assign({ halaman: halaman.length + 1, dari: o.dari || 1 }, m));
  ocrPelapor.add(laporMesin);
  try {
    lapor({ tahap: "siap", halaman: 1, dari: 1 });
    await ocrKolam(); // unduhan pertama (kode + data bahasa) & pekerja tambahan disiapkan di sini, sebelum halaman pertama diolah
    const baca = { bacaUlang: o.bacaUlang, bacaGanda: o.bacaGanda, urutan };
    if (ocrAdalahGambar(berkas)) {
      const info = (m) => lapor(Object.assign({ halaman: 1, dari: 1 }, m));
      info({ tahap: "render" });
      const g = await ocrMuatGambar(berkas);
      halaman.push(await ocrBacaPiksel(g.rgba, g.w, g.h, Object.assign({ progres: info }, baca)));
    } else {
      let dok = o.pdf;
      if (!dok) {
        const lib = typeof ensurePdfJs === "function" ? await ensurePdfJs() : null;
        if (!lib) throw new Error("pdf.js tidak tersedia");
        dok = await lib.getDocument({ data: await berkas.arrayBuffer(), wasmUrl: PDFJS_WASM_URL }).promise;
      }
      const n = Math.min(dok.numPages, maks);
      terpotong = dok.numPages > n;
      /* Halaman BERIKUTNYA digambar & dibersihkan di utas halaman selagi halaman ini
         dibaca pekerja. Kemajuannya baru ditampilkan begitu halaman itu yang
         ditunggu (pesan terakhirnya diulang saat gilirannya tiba). */
      const siapkan = (p) => {
        const info = (m) => lapor(Object.assign({ halaman: p, dari: n }, m));
        const jejak = { aktif: p === 1, pesan: null };
        const janji = ocrSiapkanHalamanPdf(dok, p, (m) => {
          jejak.pesan = m;
          if (jejak.aktif) info(m);
        });
        janji.catch(() => {}); // galatnya diteruskan saat ditunggu, bukan "unhandled"
        return { janji, info, jejak };
      };
      let berikut = siapkan(1);
      for (let p = 1; p <= n; p++) {
        const kini = berikut;
        if (!kini.jejak.aktif) {
          kini.jejak.aktif = true;
          if (kini.jejak.pesan) kini.info(kini.jejak.pesan);
        }
        const siap = await kini.janji;
        const hasil = ocrBacaSiap(siap, Object.assign({ progres: kini.info }, baca));
        berikut = p < n ? siapkan(p + 1) : null;
        halaman.push(await hasil);
      }
    }
  } finally {
    ocrPelapor.delete(laporMesin);
    ocrJadwalLepas();
  }
  const semua = halaman.filter((p) => p.jumlahKata);
  return {
    halaman,
    teks: halaman.map((p) => p.teks).join("\n\n"),
    kepercayaan: semua.length ? Math.round(semua.reduce((x, p) => x + p.kepercayaan, 0) / semua.length) : 0,
    terpotong,
  };
}
