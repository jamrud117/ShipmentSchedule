"use strict";

/* ==================================================================
   SURAT UNTUK BEA CUKAI (Jenis Surat di form Nomor Surat)

     Certificate of No Proof of Payment
       -> Surat Pernyataan Tanpa Bukti Bayar
     Certificate of Function and Use of Goods
       -> Surat Keterangan Fungsi Barang

   Datanya diambil dari JADWAL IMPOR lewat NOMOR AJU: kotak Nomor Aju
   bisa diketik untuk mencari (daftar saran berisi aju, shipper, AWB).
   Memilih satu nomor aju mengisi shipper, invoice, AWB/BL, koli/berat,
   nama barang, negara asal, flight & tanggal tiba, nilai barang, dan
   daftar barang (untuk surat fungsi barang -- fungsi & foto tiap barang
   ditambahkan pengguna). Isian yang sudah diubah pengguna tidak ditimpa
   saat nomor aju ditukar.

   Cetak: surat resmi berkop perusahaan -- nomor, lampiran, perihal,
   tujuan, isi, tabel data, penutup, dan blok tanda tangan (dengan kotak
   meterai untuk surat pernyataan).
================================================================== */

const SURAT_BC_TANPA_BAYAR = "Certificate of No Proof of Payment";
const SURAT_BC_FUNGSI = "Certificate of Function and Use of Goods";
const SURAT_BC_JENIS = [SURAT_BC_TANPA_BAYAR, SURAT_BC_FUNGSI];

const SURAT_BC_PERUSAHAAN = {
  nama: "PT DYNAMIC DESIGN INDONESIA",
  alamat: "Jalan Mayjend Sutoyo No. 1, Desa Pabedilan Kulon, Kec. Pabedilan, Kab. Cirebon, Jawa Barat 45193",
  kota: "Cirebon",
};

const SURAT_BC_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/* "2026-09-03" -> "03 September 2026" */
function suratTanggalPanjang(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]} ${SURAT_BC_BULAN[Number(m[2]) - 1]} ${m[1]}` : String(iso || "");
}

/* Kode negara ISO (dari pelabuhan asal) -> nama negara dalam bahasa Indonesia, kapital */
function suratNamaNegara(kode) {
  const k = String(kode || "").toUpperCase();
  if (!k) return "";
  const tetap = { KR: "KOREA SELATAN", CN: "TIONGKOK", TW: "TAIWAN", JP: "JEPANG", US: "AMERIKA SERIKAT", CZ: "REPUBLIK CEKO" };
  if (tetap[k]) return tetap[k];
  try {
    const n = new Intl.DisplayNames(["id"], { type: "region" }).of(k);
    if (n && n !== k) return n.toUpperCase();
  } catch (e) {
    /* peramban tanpa Intl.DisplayNames: pakai kodenya */
  }
  return k;
}

const suratRapatAju = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* Daftar barang unik (per nama) sebuah jadwal */
function suratBarangUnik(s) {
  const peta = new Map();
  (s.items || []).forEach((it) => {
    const nama = String(it.namaBarang || "").trim();
    if (!nama) return;
    const k = nama.toUpperCase();
    if (!peta.has(k)) peta.set(k, { nama, hs: String(it.hsCode || "").trim(), fungsi: "", foto: "" });
  });
  return [...peta.values()];
}

/* "A", "A dan B", "A, B dan C" */
const suratGabung = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} dan ${arr[arr.length - 1]}`);

/* Data surat dari satu jadwal impor */
function suratDataDariJadwal(s) {
  const calc = typeof computeCustoms === "function" ? computeCustoms(s) : { totalBruto: 0, totalUSD: 0 };
  const bruto = Number(calc.totalBruto) || 0;
  const nilai = Number(calc.totalUSD) || 0;
  const barang = suratBarangUnik(s);
  const negara = typeof resolvePortCountry === "function" ? resolvePortCountry(s.origin) : "";
  const angkut = carrierNameFromShipment(s);
  return {
    noAju: String(s.noAju || "").trim(),
    invoiceRef: String(s.invoice || "").trim(),
    shipper: String(s.party || "").trim(),
    awb: [s.masterBL, s.houseBL].map((x) => String(x || "").trim()).filter(Boolean).join(" / "),
    koliBerat: [String(s.package || "").trim(), bruto ? `${bruto.toLocaleString("en-US", { maximumFractionDigits: 2 })} KG` : ""].filter(Boolean).join(" / "),
    namaBarang: suratGabung(barang.map((b) => b.nama)),
    negaraAsal: suratNamaNegara(negara),
    // ETA yang BERLAKU (revisi delay kalau ada), sama dengan kartunya
    flightTiba: [angkut, effectiveEta(s) ? suratTanggalPanjang(effectiveEta(s)) : ""].filter(Boolean).join(" / "),
    nilaiBarang: nilai ? `USD ${nilai.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "",
    barang,
  };
}

/* ------------------------------------------------------------------
   FORM: pilihan nomor aju (bisa dicari), isi otomatis, tabel barang
------------------------------------------------------------------ */
const SURAT_BC_ISIAN = ["invoiceRef", "shipper", "awb", "koliBerat", "namaBarang", "negaraAsal", "flightTiba", "nilaiBarang"];
let suratIsianOtomatis = {};
let suratBarang = [];

function isiPilihanAju() {
  const dl = document.getElementById("dnAjuList");
  if (!dl || typeof data === "undefined" || !data) return;
  dl.innerHTML = (data.import || [])
    .filter((s) => String(s.noAju || "").trim())
    .map((s) => {
      const ket = [s.party, [s.masterBL, s.houseBL].filter(Boolean).join(" / "), effectiveEta(s) ? fmtDate(effectiveEta(s)) : ""].filter(Boolean).join(" · ");
      return `<option value="${escapeAttr(String(s.noAju).trim())}">${escapeHtml(ket)}</option>`;
    })
    .join("");
}

function suratCariJadwalAju(aju) {
  const k = suratRapatAju(aju);
  if (!k || typeof data === "undefined" || !data) return null;
  return (data.import || []).find((s) => suratRapatAju(s.noAju) === k) || null;
}

/* Isi kotak dari jadwal. Kotak yang isinya sudah diubah pengguna (beda
   dari yang dulu diisikan mesin) dibiarkan. */
function suratIsiDariAju(aju) {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl("letter") : null;
  const s = suratCariJadwalAju(aju);
  if (!panel || !s) return false;
  const d = suratDataDariJadwal(s);
  SURAT_BC_ISIAN.forEach((k) => {
    const el = panel.querySelector(`[data-dn="${k}"]`);
    if (!el) return;
    const sekarang = String(el.value || "").trim();
    if (sekarang && sekarang !== String(suratIsianOtomatis[k] || "")) return;
    el.value = d[k] || "";
    suratIsianOtomatis[k] = el.value;
  });
  // Moda angkut kiriman -> label Flight / Sail (form & surat cetak)
  const moda = panel.querySelector('[data-dn="moda"]');
  if (moda) moda.value = s.transport === "laut" ? "laut" : "udara";
  suratPerbaruiLabelAngkut(panel);
  // Daftar barang: diganti kalau masih kosong atau belum disentuh pengguna
  const disentuh = suratBarang.some((b) => String(b.fungsi || "").trim() || b.foto);
  if (!disentuh) setSuratBarang(d.barang);
  const subjek = panel.querySelector('[data-dn="subject"]');
  const jenis = panel.querySelector('[data-dn="letterType"]');
  if (subjek && !subjek.value.trim() && jenis) subjek.value = suratPerihalBawaan(jenis.value);
  return true;
}

/* Label isian "Flight & Tanggal Tiba" / "Sail & Tanggal Tiba" di form */
function suratPerbaruiLabelAngkut(panel) {
  const moda = panel && panel.querySelector('[data-dn="moda"]');
  const label = panel && panel.querySelector("[data-label-angkut]");
  if (label) label.textContent = suratLabelAngkut(moda && moda.value === "laut" ? "laut" : "udara", tt(" & Tanggal Tiba", " & Arrival Date"));
}

function suratPerihalBawaan(jenis) {
  if (jenis === SURAT_BC_TANPA_BAYAR) return "Pernyataan Tanpa Bukti Bayar";
  if (jenis === SURAT_BC_FUNGSI) return "Keterangan Fungsi Barang";
  return "";
}

/* Penanda tangan & jabatan bawaan surat bea cukai -- hanya kalau kosong */
function suratBawaanPenandaTangan(panel) {
  const nama = panel.querySelector('[data-dn="signer"]');
  const jabatan = panel.querySelector('[data-dn="signerTitle"]');
  if (nama && !nama.value.trim()) nama.value = "Shin Nara";
  if (jabatan && !jabatan.value.trim()) jabatan.value = "Chief Marketing Officer";
  const kepada = panel.querySelector('[data-dn="recipient"]');
  if (kepada && !kepada.value.trim()) kepada.value = "Kantor Pelayanan Utama Bea dan Cukai Tipe C Soekarno-Hatta";
}

function setSuratBarang(list) {
  suratBarang = (Array.isArray(list) ? list : []).map((b) => ({
    nama: String((b && b.nama) || ""),
    hs: String((b && b.hs) || ""),
    fungsi: String((b && b.fungsi) || ""),
    foto: String((b && b.foto) || ""),
  }));
  renderSuratBarang();
}

function suratBarangBersih() {
  return suratBarang.filter((b) => b.nama.trim() || b.fungsi.trim() || b.foto);
}

function renderSuratBarang() {
  const body = document.getElementById("suratBarangBody");
  if (!body) return;
  if (!suratBarang.length) suratBarang = [{ nama: "", hs: "", fungsi: "", foto: "" }];
  body.innerHTML = suratBarang.map((b, i) => `
    <tr data-sb="${i}">
      <td class="sb-no">${i + 1}</td>
      <td>
        <input type="text" class="form-control form-control-sm" data-sb-f="nama" value="${escapeAttr(b.nama)}" placeholder="${escapeAttr(tt("Nama barang", "Item name"))}">
        <input type="text" class="form-control form-control-sm mt-1" data-sb-f="hs" value="${escapeAttr(b.hs)}" placeholder="HS Code">
      </td>
      <td><textarea class="form-control form-control-sm" rows="3" data-sb-f="fungsi" placeholder="${escapeAttr(tt("Jelaskan fungsi & kegunaan barang…", "Describe the function & use of the goods…"))}">${escapeHtml(b.fungsi)}</textarea></td>
      <td class="sb-foto">
        ${b.foto ? `<img src="${escapeAttr(b.foto)}" alt="">` : ""}
        <label class="btn-quiet sb-pilih-foto">
          <i class="bi bi-image"></i> ${escapeHtml(b.foto ? tt("Ganti", "Change") : tt("Foto", "Photo"))}
          <input type="file" accept="image/*" data-sb-foto="${i}" hidden>
        </label>
        ${b.foto ? `<button type="button" class="btn btn-sm btn-link text-danger" data-sb-hapus-foto="${i}">${escapeHtml(tt("Hapus", "Remove"))}</button>` : ""}
      </td>
      <td class="sb-aksi"><button type="button" class="rm-row" data-sb-del="${i}" title="${escapeAttr(tt("Hapus baris", "Delete row"))}"><i class="bi bi-x-lg"></i></button></td>
    </tr>`).join("");
}

/* Foto diperkecil (sisi terpanjang 800 px, JPEG) supaya tersimpan ringan */
function suratPerkecilFoto(file) {
  return new Promise((ok, gagal) => {
    const baca = new FileReader();
    baca.onerror = gagal;
    baca.onload = () => {
      const img = new Image();
      img.onerror = gagal;
      img.onload = () => {
        const skala = Math.min(1, 800 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * skala);
        c.height = Math.round(img.height * skala);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.78));
      };
      img.src = baca.result;
    };
    baca.readAsDataURL(file);
  });
}

(function pasangFormSuratBc() {
  document.addEventListener("input", (e) => {
    const aju = e.target.closest("#dnSuratAju");
    if (aju) {
      suratIsiDariAju(aju.value);
      return;
    }
    const f = e.target.closest("[data-sb-f]");
    if (f) {
      const i = Number(f.closest("[data-sb]").dataset.sb);
      if (suratBarang[i]) suratBarang[i][f.dataset.sbF] = f.value;
    }
  });
  document.addEventListener("change", async (e) => {
    const jenis = e.target.closest('[data-docnum-panel="letter"] [data-dn="letterType"]');
    if (jenis && SURAT_BC_JENIS.indexOf(jenis.value) >= 0) {
      const panel = jenis.closest("[data-docnum-panel]");
      suratBawaanPenandaTangan(panel);
      const subjek = panel.querySelector('[data-dn="subject"]');
      if (subjek && (!subjek.value.trim() || SURAT_BC_JENIS.map(suratPerihalBawaan).indexOf(subjek.value) >= 0)) subjek.value = suratPerihalBawaan(jenis.value);
      return;
    }
    const foto = e.target.closest("[data-sb-foto]");
    if (foto && foto.files && foto.files[0]) {
      const i = Number(foto.dataset.sbFoto);
      try {
        suratBarang[i].foto = await suratPerkecilFoto(foto.files[0]);
      } catch (err) {
        showToast(tt("Foto tidak bisa dibaca.", "The photo could not be read."), "danger");
      }
      renderSuratBarang();
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#btnSuratTambahBarang")) {
      suratBarang.push({ nama: "", hs: "", fungsi: "", foto: "" });
      renderSuratBarang();
      return;
    }
    const del = e.target.closest("[data-sb-del]");
    if (del) {
      suratBarang.splice(Number(del.dataset.sbDel), 1);
      renderSuratBarang();
      return;
    }
    const hapusFoto = e.target.closest("[data-sb-hapus-foto]");
    if (hapusFoto) {
      suratBarang[Number(hapusFoto.dataset.sbHapusFoto)].foto = "";
      renderSuratBarang();
    }
  });
  if (document.readyState !== "loading") renderSuratBarang();
  else document.addEventListener("DOMContentLoaded", renderSuratBarang);
})();

/* ------------------------------------------------------------------
   CETAK: surat resmi berkop
------------------------------------------------------------------ */
function suratBcBolehCetak(r) {
  return !!r && r.doc_type === "letter" && SURAT_BC_JENIS.indexOf((r.payload || {}).letterType) >= 0;
}

/* Kop surat SAMA dengan Form Pengajuan Dana (fund-request-print.js):
   logo + nama + alamat Pusat/Cabang (SJ_PERUSAHAAN), ditutup garis kop
   tebal-tipis. */
function suratKopHtml() {
  const kop = typeof SJ_PERUSAHAAN !== "undefined" ? SJ_PERUSAHAAN : { nama: SURAT_BC_PERUSAHAAN.nama, pusat: "", cabang: "" };
  const logo = typeof SJ_LOGO !== "undefined" ? `<img src="${SJ_LOGO}" alt="">` : "";
  return `
  <div class="kop">
    ${logo}
    <div class="kop-teks">
      <div class="kop-nama">${escapeHtml(kop.nama)}</div>
      <div class="kop-alamat">${escapeHtml(kop.pusat)}</div>
      <div class="kop-alamat">${escapeHtml(kop.cabang)}</div>
    </div>
  </div>`;
}

function suratDaftarHtml(baris) {
  return `<table class="daftar">${baris
    .map(([k, v]) => `<tr><td class="d-k">${escapeHtml(k)}</td><td class="d-t">:</td><td class="d-v">${escapeHtml(v || "-")}</td></tr>`)
    .join("")}</table>`;
}

function suratTtdHtml(p, tanggal) {
  return `
  <div class="ttd">
    <div>${escapeHtml(SURAT_BC_PERUSAHAAN.kota)}, ${escapeHtml(suratTanggalPanjang(tanggal))}</div>
    <div>Hormat kami,</div>
    <!-- Ruang tanda tangan, cap & meterai -- dibiarkan kosong -->
    <div class="ttd-ruang"></div>
    <div class="ttd-nama">${escapeHtml(String(p.signer || "").toUpperCase())}</div>
    <div class="ttd-jabatan">${escapeHtml(p.signerTitle || "")}</div>
  </div>`;
}

/* Kiriman laut memakai "Sail" (kapal), udara "Flight". Modanya ikut
   tersimpan saat nomor aju dipilih (p.moda); surat lama tanpa isian itu
   membacanya dari jadwal dengan nomor aju yang sama. */
function suratModa(p) {
  if (p.moda) return p.moda;
  const s = typeof suratCariJadwalAju === "function" ? suratCariJadwalAju(p.noAju) : null;
  return (s && s.transport) || "udara";
}
const suratLabelAngkut = (moda, pemisah) => `${moda === "laut" ? "Sail" : "Flight"}${pemisah}`;

function suratBcHtml(row) {
  const p = row.payload || {};
  const moda = suratModa(p);
  const tgl = row.doc_date || "";
  const nomor = row.doc_number || "";
  if (p.letterType === SURAT_BC_TANPA_BAYAR) {
    return `
  <div class="lembar">
    ${suratKopHtml()}
    <div class="judul">SURAT PERNYATAAN TANPA BUKTI BAYAR</div>
    <div class="nomor">Nomor : ${escapeHtml(nomor)}</div>
    <p>Yang bertanda tangan di bawah ini :</p>
    ${suratDaftarHtml([["Nama", String(p.signer || "").toUpperCase()], ["Jabatan", String(p.signerTitle || "").toUpperCase()],
      ["Nama Perusahaan", SURAT_BC_PERUSAHAAN.nama], ["Alamat", SURAT_BC_PERUSAHAAN.alamat.toUpperCase()]])}
    <p>Dengan ini menyatakan bahwa barang kiriman kami dengan data sebagai berikut :</p>
    ${suratDaftarHtml([["Nomor Aju", p.noAju], ["MAWB / HAWB", p.awb], ["Nama Barang", p.namaBarang], ["Koli / Berat", p.koliBerat],
      [suratLabelAngkut(moda, " / Tanggal"), p.flightTiba], ["Negara Asal", p.negaraAsal], ["Nilai Barang", p.nilaiBarang]])}
    <p class="rata">tidak memiliki bukti bayar, karena pembayaran kepada pengirim baru akan dilakukan pada tanggal
      <b>${escapeHtml(suratTanggalPanjang(p.tglBayar) || "-")}</b> sesuai termin pembayaran yang disepakati. Dengan ini kami
      menyatakan tidak mempunyai bukti bayar (dokumentasi pembayaran) kepada pengirim atas barang tersebut di atas.</p>
    <p class="rata">Demikian surat pernyataan ini kami buat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana
      mestinya. Atas bantuan dan kebijaksanaan Bapak/Ibu, kami ucapkan terima kasih.</p>
    ${suratTtdHtml(p, tgl)}
  </div>`;
  }
  const barang = (p.itemsFungsi || []).filter((b) => b && (b.nama || b.fungsi || b.foto));
  return `
  <div class="lembar">
    ${suratKopHtml()}
    <table class="kepala-surat">
      <tr><td class="ks-k">Nomor</td><td class="ks-t">:</td><td>${escapeHtml(nomor)}</td>
          <td class="ks-tgl" rowspan="3">${escapeHtml(SURAT_BC_PERUSAHAAN.kota)}, ${escapeHtml(suratTanggalPanjang(tgl))}</td></tr>
      <tr><td class="ks-k">Lampiran</td><td class="ks-t">:</td><td>${barang.some((b) => b.foto) ? "Foto barang" : "-"}</td></tr>
      <tr><td class="ks-k">Perihal</td><td class="ks-t">:</td><td>${escapeHtml(p.subject || "Keterangan Fungsi Barang")}</td></tr>
    </table>
    <div class="judul">SURAT KETERANGAN FUNGSI BARANG</div>
    <p>Dengan hormat,</p>
    <p class="rata">Menunjuk ${escapeHtml(p.recipient || "Kantor Pelayanan Utama Bea dan Cukai")} perihal permintaan
      data dan keterangan tambahan, bersama ini kami sampaikan penjelasan sebagai berikut :</p>
    ${suratDaftarHtml([["Nomor Pengajuan", p.noAju], ["Invoice", p.invoiceRef], ["Shipper", p.shipper],
      ["Total Barang", p.koliBerat], ["Jenis Barang", p.namaBarang], ["No. AWB / BL", p.awb], ["Negara Asal", p.negaraAsal],
      [suratLabelAngkut(moda, " & Tanggal Tiba"), p.flightTiba]])}
    <table class="barang">
      <colgroup><col style="width:6%"><col style="width:22%"><col style="width:48%"><col style="width:24%"></colgroup>
      <thead><tr><th>No.</th><th>Nama Barang</th><th>Fungsi Barang</th><th>Foto</th></tr></thead>
      <tbody>${(barang.length ? barang : [{}]).map((b, i) => `
        <tr><td class="c">${i + 1}</td>
          <td><b>${escapeHtml(b.nama || "")}</b>${b.hs ? `<div class="hs">HS Code : ${escapeHtml(b.hs)}</div>` : ""}</td>
          <td class="rata">${escapeHtml(b.fungsi || "")}</td>
          <td class="c">${b.foto ? `<img src="${escapeAttr(b.foto)}" alt="">` : ""}</td></tr>`).join("")}
      </tbody>
    </table>
    <p class="rata">Demikian keterangan ini kami sampaikan sebagai bahan pertimbangan. Atas perhatian dan bantuan Bapak/Ibu,
      kami ucapkan terima kasih.</p>
    ${suratTtdHtml(p, tgl)}
  </div>`;
}

function suratBcCss() {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", Times, serif; color: #000; font-size: 12pt; line-height: 1.38; }
  /* Satu surat = satu lembar A4 */
  .lembar { width: 210mm; min-height: 297mm; padding: 14mm 22mm 12mm; page-break-after: always; break-after: page; }
  .lembar:last-child { page-break-after: auto; break-after: auto; }

  /* KOP: sama dengan Form Pengajuan Dana -- logo, nama, alamat, garis tebal-tipis */
  .kop {
    display: flex; align-items: center; justify-content: center; gap: 5mm;
    padding-bottom: 3mm; border-bottom: 0.7mm solid #000; position: relative;
  }
  .kop::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -1.4mm;
    border-bottom: 0.25mm solid #000;
  }
  .kop img { height: 22mm; width: auto; }
  .kop-teks { text-align: center; }
  .kop-nama { font-size: 20pt; font-weight: 700; letter-spacing: .3px; line-height: 1.2; }
  .kop-alamat { font-size: 9.5pt; line-height: 1.35; }

  /* Jarak antarbagian: lega & seragam */
  .judul { text-align: center; font-weight: 700; font-size: 13pt; text-decoration: underline; margin: 7mm 0 0; }
  .nomor { text-align: center; margin: 0.5mm 0 5mm; }
  p { margin: 0 0 2.6mm; }
  .rata { text-align: justify; }
  .daftar { border-collapse: collapse; margin: 0.5mm 0 3.6mm 8mm; line-height: 1.32; }
  .daftar td { padding: 0.3mm 0; vertical-align: top; }
  .d-k { width: 50mm; } .d-t { width: 6mm; }
  .kepala-surat { width: 100%; border-collapse: collapse; margin: 5mm 0 0; }
  .kepala-surat td { padding: 0.2mm 0; vertical-align: top; }
  .ks-k { width: 22mm; } .ks-t { width: 5mm; }
  .ks-tgl { text-align: right; white-space: nowrap; }
  .barang { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4.5mm; font-size: 11pt; line-height: 1.35; }
  /* Surat fungsi barang: Nomor/Lampiran/Perihal -> judul -> "Dengan hormat,"
     diberi jarak lega supaya ketiganya tidak berdempetan */
  .kepala-surat + .judul { margin-top: 9mm; }
  .judul + p { margin-top: 6mm; }
  .barang th, .barang td { border: 1px solid #000; padding: 1.6mm 2.4mm; vertical-align: top; }
  .barang th { background: #f0f0f0; text-align: center; }
  .barang .c { text-align: center; }
  .barang .hs { margin-top: 2mm; font-size: 10pt; }
  .barang img { max-width: 100%; max-height: 34mm; }
  /* Blok tanda tangan selebar isinya dan menempel ke margin KANAN --
     baris terpanjangnya (tanggal) berakhir tepat di garis margin. */
  .ttd { width: max-content; max-width: 90mm; margin: 7mm 0 0 auto; text-align: left; break-inside: avoid; }
  .ttd-ruang { height: 21mm; }
  .ttd-nama { font-weight: 700; text-decoration: underline; }
  `;
}

function cetakSuratBc(rowId) {
  const row = (docNumHistoryRows || []).find((r) => String(r.id) === String(rowId));
  if (!row || !suratBcBolehCetak(row)) {
    showToast(tt("Data surat tidak ditemukan.", "Letter data not found."), "danger");
    return;
  }
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    showToast(t("m.jendela.cetak.diblokir.peramban.izinkan.pop.up"), "danger");
    return;
  }
  w.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>${escapeHtml(row.doc_number || "Surat")}</title>
<style>${suratBcCss()}</style></head>
<body>${suratBcHtml(row)}</body></html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}
