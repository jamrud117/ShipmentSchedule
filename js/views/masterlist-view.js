"use strict";

/* ------------------------------------------------------------------
   HALAMAN MASTERLIST (#/masterlist)

   Masterlist = daftar barang modal yang mendapat fasilitas pembebasan
   bea masuk; tiap baris punya KUOTA. Setiap PIB yang memakai fasilitas
   itu mengurangi kuota barisnya. Halaman ini menjawab tiga pertanyaan,
   berurutan dari atas ke bawah:

     1. Berapa kuota yang masih tersedia, dan di mesin apa?
     2. Apakah dokumennya masih berlaku? Adakah jadwal import yang
        memakai fasilitas ini tapi belum dicatat di sini?
     3. Baris per baris: kuota, terpakai, sisa, dan PIB yang memakainya.

   TERPAKAI & SISA tidak pernah disimpan: selalu dihitung dari catatan
   realisasi (masterlist_usages), jadi tidak mungkin berbeda darinya.
   Database ikut menjaga -- realisasi yang melebihi kuota ditolak pemicu
   di migration-masterlist.sql.

   Semua peran yang boleh membuka halaman ini MEMBACA; hanya EXIM yang
   mencatat realisasi dan mengubah baris: requireEdit() di sini, kelas
   .mst-ubah disembunyikan lewat body.is-viewer (auth.css), dan RLS di
   database.

   Semua teks yang dirakit di sini lewat tt(), dan halaman ini digambar
   ulang saat bahasa diganti (lihat setLang di i18n.js).
------------------------------------------------------------------ */

let mstDok = null; // baris tabel masterlists yang sedang dibuka
let mstBarisDb = []; // masterlist_items
let mstRealisasiDb = []; // masterlist_usages
let mstTermuat = false;

/* Keadaan tampilan. Saringan (cari, status, lini) TIDAK disalin ke sini:
   dibaca langsung dari kotaknya tiap menggambar, jadi tidak ada salinan
   yang bisa tertinggal dari yang terlihat. */
const mstKeadaan = {
  tampilan: "baris", // "baris" | "pib"
  halaman: 1,
  perHalaman: 25,
  terbuka: new Set(), // baris / PIB yang rinciannya sedang dibuka
  jenis: null, // { nama, lini } -- saringan dari panel "Kuota yang masih tersedia"
  semuaJenis: false, // panel itu menampilkan seluruh jenis, bukan 8 teratas
};

const MST_JENIS_AWAL = 8; // jenis mesin yang tampil sebelum "tampilkan semua"
const MST_TALLY_MAKS = 36; // di atas ini satu tanda per unit tidak terbaca lagi
const MST_MASA_DEKAT = 90; // hari menjelang akhir masa berlaku
const MST_UKURAN_HALAMAN = [10, 25, 50, 100];

/* ---------- angka ---------- */

/* Kuota & realisasi bisa berpecahan (kg, meter) -- database menyimpan
   tiga desimal. Dibulatkan ke situ supaya 0,1 + 0,2 tidak tampil
   sebagai 0,30000000000000004. */
function mstBulat(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}
function mstFmt(n) {
  return mstBulat(n).toLocaleString(activeLang === "en" ? "en-US" : "id-ID", { maximumFractionDigits: 3 });
}

/* ---------- spesifikasi ---------- */

/* "TREAD(CASTING MOLD" -> "TREAD (CASTING MOLD)": di dokumen sumbernya
   lini yang sama ditulis dengan dan tanpa spasi, kadang kurungnya tidak
   ditutup. Tanpa dirapikan, satu lini terpecah jadi tiga saringan. */
function mstRapikanLini(teks) {
  let isi = String(teks || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!isi) return "";
  isi = isi.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ")");
  const buka = (isi.match(/\(/g) || []).length;
  const tutup = (isi.match(/\)/g) || []).length;
  if (buka > tutup) isi += ")".repeat(buka - tutup);
  return isi;
}

/* Spesifikasi di masterlist ditulis dalam satu kalimat:

     BRAND DOOSAN; VC630; MV0043-000164; 53.3 KW; FOR FLOW PROSES
     MANUFAKTUR TREAD (CASTING MOLD)

   Diurai jadi merek, rincian (model / nomor seri), daya, dan lini
   proses -- supaya bisa ditampilkan ringkas dan disaring per lini.
   Teks aslinya TIDAK diubah; yang tidak mengikuti pola itu ditampilkan
   apa adanya (`mentah`). */
function mstUraiSpek(spek) {
  const teks = String(spek || "").replace(/\s+/g, " ").trim();
  const m = teks.match(/^(.*?)[\s;]*FOR\s+FLOW\s+PROSES\s+MANUFAKTUR\s*(.*)$/i);
  const kepala = (m ? m[1] : teks).replace(/[\s;]+$/, "");
  const lini = m ? mstRapikanLini(m[2]) : "";
  if (!/^BRAND\b/i.test(kepala)) return { merek: "", rincian: [], daya: "", lini, mentah: kepala };
  const bagian = kepala
    .replace(/^BRAND\b[\s;]*/i, "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  let daya = "";
  if (bagian.length) {
    const d = bagian[bagian.length - 1].match(/^(.*?)(\d+(?:[.,]\d+)?)\s*KW$/i);
    if (d) {
      daya = d[2] + " kW";
      const sisa = d[1].trim();
      if (sisa) bagian[bagian.length - 1] = sisa;
      else bagian.pop();
    }
  }
  return { merek: bagian[0] || "", rincian: bagian.slice(1), daya, lini, mentah: "" };
}

/* Spesifikasi ringkas untuk satu baris tabel: merek, model/seri, daya. */
function mstSpekRingkas(spek) {
  if (spek.mentah) return spek.mentah;
  return [spek.merek].concat(spek.rincian, spek.daya ? [spek.daya] : []).filter(Boolean).join(" · ");
}

/* ---------- baris + realisasinya ---------- */

function mstUrutRealisasi(a, b) {
  return (
    String(a.pib_date || "9999").localeCompare(String(b.pib_date || "9999")) ||
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
}

/* Baris masterlist beserta hitungannya. Terpakai = jumlah realisasinya;
   sisa = kuota - terpakai. Dihitung ulang tiap dipanggil. */
function mstSusun() {
  const perBaris = new Map();
  mstRealisasiDb.forEach((u) => {
    if (!perBaris.has(u.item_id)) perBaris.set(u.item_id, []);
    perBaris.get(u.item_id).push(u);
  });
  return mstBarisDb
    .slice()
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((b) => {
      const realisasi = (perBaris.get(b.id) || []).slice().sort(mstUrutRealisasi);
      const kuota = mstBulat(b.quota);
      const terpakai = mstBulat(realisasi.reduce((s, u) => s + (Number(u.qty) || 0), 0));
      const spek = mstUraiSpek(b.specification);
      return {
        id: b.id,
        no: Number(b.no),
        nama: b.description || "",
        spesifikasi: b.specification || "",
        satuan: b.uom || "",
        kuota,
        terpakai,
        sisa: mstBulat(kuota - terpakai),
        realisasi,
        spek,
        lini: spek.lini,
      };
    });
}

function mstRingkasan(baris) {
  const r = { baris: baris.length, kuota: 0, terpakai: 0, sisa: 0, bersisa: 0, habis: 0, utuh: 0 };
  baris.forEach((b) => {
    r.kuota += b.kuota;
    r.terpakai += b.terpakai;
    if (b.sisa > 0) r.bersisa++;
    else r.habis++;
    if (b.terpakai === 0) r.utuh++;
  });
  r.kuota = mstBulat(r.kuota);
  r.terpakai = mstBulat(r.terpakai);
  r.sisa = mstBulat(r.kuota - r.terpakai);
  return r;
}

/* Kuota per JENIS MESIN (uraian yang sama di lini proses yang sama):
   sembilan baris "5-AXIS MACHINING CENTER" yang masing-masing satu unit
   terbaca sebagai satu jenis berkuota sembilan. */
function mstPerJenis(baris) {
  const peta = new Map();
  baris.forEach((b) => {
    const kunci = b.lini + "\u0000" + b.nama;
    let g = peta.get(kunci);
    if (!g) {
      g = { nama: b.nama, lini: b.lini, baris: 0, kuota: 0, terpakai: 0 };
      peta.set(kunci, g);
    }
    g.baris++;
    g.kuota += b.kuota;
    g.terpakai += b.terpakai;
  });
  return [...peta.values()]
    .map((g) => {
      const kuota = mstBulat(g.kuota);
      const terpakai = mstBulat(g.terpakai);
      return { nama: g.nama, lini: g.lini, baris: g.baris, kuota, terpakai, sisa: mstBulat(kuota - terpakai) };
    })
    .sort((a, b) => b.sisa - a.sisa || b.kuota - a.kuota || a.nama.localeCompare(b.nama));
}

/* ---------- nomor aju ---------- */

const mstDigit = (s) => String(s == null ? "" : s).replace(/\D+/g, "");

/* Satu catatan bisa merujuk lebih dari satu PIB ("7130 / 9204"). */
function mstPecahAju(ref) {
  return String(ref == null ? "" : ref)
    .split(/[/,;&]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* Jadwal import yang nomor ajunya cocok dengan sebuah rujukan.

   Rujukan boleh nomor aju lengkap (26 angka) atau hanya EKORNYA --
   catatan lama dari Excel memakai empat angka terakhir ("7154"). Yang
   dibandingkan angkanya saja; tanda hubung di nomor aju diabaikan.
   Kurang dari empat angka terlalu mudah kebetulan cocok, jadi tidak
   dicocokkan sama sekali. */
function mstJadwalUntukAju(ref) {
  const cari = mstDigit(ref);
  if (cari.length < 4) return [];
  const daftar = (typeof data !== "undefined" && data && data.import) || [];
  return daftar.filter((s) => {
    const aju = mstDigit(s.noAju);
    return !!aju && aju.endsWith(cari);
  });
}

/* Kunci pengelompokan per PIB: nomor aju jadwalnya kalau tepat satu
   jadwal yang cocok (rujukan "7154" dan nomor lengkapnya jadi satu
   kelompok), kalau tidak angka rujukannya sendiri. */
function mstKunciAju(ref) {
  const bagian = mstPecahAju(ref);
  if (bagian.length !== 1) return bagian.map((x) => mstDigit(x) || x.toUpperCase()).join("/");
  const jadwal = mstJadwalUntukAju(bagian[0]);
  if (jadwal.length === 1) return mstDigit(jadwal[0].noAju);
  return mstDigit(bagian[0]) || bagian[0].toUpperCase();
}

/* Nomor aju lengkap terlalu panjang untuk sebuah cip: ditampilkan
   ekornya (enam angka terakhir = nomor urut pendaftarannya), nomor
   lengkapnya di keterangan cip dan di rincian baris. */
function mstAjuRingkas(ref) {
  const teks = String(ref == null ? "" : ref).trim();
  const angka = mstDigit(teks);
  return angka.length > 10 ? "…" + angka.slice(-6) : teks;
}

/* Barang sebuah jadwal yang ditandai berfasilitas Masterlist. */
function mstBarangMasterlist(s) {
  return ((s && s.items) || []).filter((it) => (it.skb || []).some((sk) => sk.jenis === "Masterlist"));
}

/* JADWAL IMPORT YANG BELUM DICATAT: barangnya ditandai berfasilitas
   Masterlist di form jadwal, tapi nomor ajunya belum muncul di catatan
   realisasi mana pun. Jadwal yang belum punya nomor aju ikut didaftar
   -- ia belum bisa dicocokkan, dan itu pun perlu terlihat. */
function mstBelumDicatat() {
  const rujukan = [];
  mstRealisasiDb.forEach((u) =>
    mstPecahAju(u.aju_ref).forEach((x) => {
      const d = mstDigit(x);
      if (d.length >= 4) rujukan.push(d);
    }),
  );
  const daftar = (typeof data !== "undefined" && data && data.import) || [];
  return daftar
    .filter((s) => {
      if (!mstBarangMasterlist(s).length) return false;
      const aju = mstDigit(s.noAju);
      if (!aju) return true;
      return !rujukan.some((r) => aju.endsWith(r));
    })
    .sort((a, b) => String(b.docDate || b.eta || "").localeCompare(String(a.docDate || a.eta || "")));
}

/* ---------- saringan ---------- */

function mstSaringan() {
  return {
    q: (($("#mstSearch") || {}).value || "").trim().toLowerCase(),
    status: ($("#mstStatus") || {}).value || "",
    lini: ($("#mstLini") || {}).value || "",
    jenis: mstKeadaan.jenis,
  };
}

/* Cocok kalau SEMUA kata yang diketik ada di salah satu kolom, termasuk
   nomor aju realisasinya: "doosan 7154" menemukan mesin Doosan yang
   direalisasikan PIB 7154. */
function mstCocok(b, f) {
  if (f.status === "sisa" && !(b.sisa > 0)) return false;
  if (f.status === "habis" && b.sisa > 0) return false;
  if (f.status === "utuh" && b.terpakai !== 0) return false;
  if (f.lini && b.lini !== f.lini) return false;
  if (f.jenis && (b.nama !== f.jenis.nama || b.lini !== f.jenis.lini)) return false;
  if (!f.q) return true;
  const isi = [b.no, b.nama, b.spesifikasi, b.satuan]
    .concat(b.realisasi.map((u) => u.aju_ref))
    .join(" ")
    .toLowerCase();
  return f.q.split(/\s+/).every((kata) => isi.includes(kata));
}

/* Realisasi dikelompokkan per PIB. Dihitung dari baris yang LOLOS
   saringan, jadi kotak cari dan saringan lini berlaku di kedua susunan. */
function mstPerPib(baris) {
  const peta = new Map();
  baris.forEach((b) =>
    b.realisasi.forEach((u) => {
      const kunci = mstKunciAju(u.aju_ref);
      let g = peta.get(kunci);
      if (!g) {
        g = { kunci, aju: String(u.aju_ref || "").trim(), tanggal: "", unit: 0, isi: [] };
        peta.set(kunci, g);
      }
      // Nama kelompoknya rujukan yang paling lengkap di antara anggotanya
      if (String(u.aju_ref || "").trim().length > g.aju.length) g.aju = String(u.aju_ref || "").trim();
      if (u.pib_date && u.pib_date > g.tanggal) g.tanggal = u.pib_date;
      g.unit += Number(u.qty) || 0;
      g.isi.push({ baris: b, realisasi: u });
    }),
  );
  return [...peta.values()]
    .map((g) => {
      const bagian = mstPecahAju(g.aju);
      const jadwal = bagian.length === 1 ? mstJadwalUntukAju(bagian[0]) : [];
      return Object.assign(g, { unit: mstBulat(g.unit), jadwal: jadwal.length === 1 ? jadwal[0] : null });
    })
    .sort(
      (a, b) =>
        String(b.tanggal || "").localeCompare(String(a.tanggal || "")) ||
        a.kunci.localeCompare(b.kunci, undefined, { numeric: true }),
    );
}

/* ---------- potongan tampilan ---------- */

/* Kuota sebagai TANDA: satu tanda per unit, yang masih tersedia lebih
   dulu (rata kiri, supaya antarbaris bisa dibandingkan dari garis yang
   sama), lalu yang sudah terpakai. Kuota besar atau berpecahan memakai
   batang berbanding.

   Hiasan bagi pembaca layar (aria-hidden): angkanya selalu tertulis di
   sebelahnya. */
function mstTallyHtml(sisa, terpakai) {
  const total = mstBulat(sisa + terpakai);
  if (Number.isInteger(sisa) && Number.isInteger(terpakai) && sisa >= 0 && terpakai >= 0 && total > 0 && total <= MST_TALLY_MAKS) {
    return `<span class="mst-tally" aria-hidden="true">${'<i class="mst-t mst-t--ada"></i>'.repeat(sisa)}${'<i class="mst-t"></i>'.repeat(terpakai)}</span>`;
  }
  const persen = total > 0 ? Math.max(0, Math.min(100, (sisa / total) * 100)) : 0;
  return `<span class="mst-meter" aria-hidden="true"><span class="mst-meter-isi" style="width:${persen.toFixed(1)}%"></span></span>`;
}

/* Cip nomor aju. Kalau tepat satu jadwal import yang cocok, cipnya jadi
   tombol yang membuka jadwal itu. */
function mstAjuCipHtml(ref) {
  return mstPecahAju(ref)
    .map((bagian) => {
      const jadwal = mstJadwalUntukAju(bagian);
      if (jadwal.length !== 1) return `<span class="mst-aju" title="${escapeAttr(bagian)}">${escapeHtml(mstAjuRingkas(bagian))}</span>`;
      const s = jadwal[0];
      const ket = tt("Buka jadwal", "Open schedule") + ": " + s.noAju + " · " + dispVal(s.party);
      return `<button type="button" class="mst-aju mst-aju--taut" data-mst-jadwal="${escapeAttr(s.id)}" title="${escapeAttr(ket)}">${escapeHtml(mstAjuRingkas(bagian))}<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></button>`;
    })
    .join("");
}

/* Masa berlaku dokumen: null kalau tanggalnya belum diisi. Status
   memakai warna status + ikon + kalimat -- tidak pernah warna saja. */
function mstMasa(dok) {
  if (!dok || !dok.valid_until) return null;
  const hari = daysFromToday(dok.valid_until);
  if (hari == null) return null;
  if (hari < 0)
    return {
      hari,
      kelas: "mst-masa--lewat",
      ikon: "bi-x-octagon-fill",
      teks: tt(`Berakhir ${mstFmt(-hari)} hari lalu`, `Expired ${mstFmt(-hari)} ${hari === -1 ? "day" : "days"} ago`),
    };
  if (hari === 0) return { hari, kelas: "mst-masa--dekat", ikon: "bi-exclamation-triangle-fill", teks: tt("Berakhir hari ini", "Expires today") };
  if (hari <= MST_MASA_DEKAT)
    return {
      hari,
      kelas: "mst-masa--dekat",
      ikon: "bi-exclamation-triangle-fill",
      teks: tt(`Berakhir dalam ${mstFmt(hari)} hari`, `Expires in ${mstFmt(hari)} ${hari === 1 ? "day" : "days"}`),
    };
  return { hari, kelas: "", ikon: "bi-check-circle-fill", teks: tt(`Berlaku ${mstFmt(hari)} hari lagi`, `Valid for ${mstFmt(hari)} more days`) };
}

const mstKosongHtml = (ikon, teks) => `<div class="panel-empty"><i class="bi ${ikon}"></i> ${teks}</div>`;

/* ---------- kepala halaman ---------- */

function mstGambarPapan(ring) {
  const judul = $("#mstJudul");
  const sub = $("#mstSub");
  if (!judul || !sub) return;
  const masa = mstMasa(mstDok);
  const unit = (n) => tt("unit", n === 1 ? "unit" : "units");

  if (!ring.baris) {
    judul.textContent = "Masterlist";
    sub.textContent = tt("Belum ada baris barang.", "No lines yet.");
    return;
  }
  if (masa && masa.hari < 0) {
    judul.textContent = tt("Masa berlaku masterlist sudah berakhir", "The masterlist has expired");
  } else if (ring.sisa > 0) {
    judul.textContent = tt(
      `${mstFmt(ring.sisa)} unit kuota masterlist masih tersedia`,
      `${mstFmt(ring.sisa)} masterlist quota ${unit(ring.sisa)} still available`,
    );
  } else {
    judul.textContent = tt("Seluruh kuota masterlist sudah terealisasi", "All masterlist quota has been realized");
  }

  const b = (n) => `<b>${escapeHtml(mstFmt(n))}</b>`;
  const bagian = [
    tt(`${b(ring.terpakai)} dari ${b(ring.kuota)} unit terealisasi`, `${b(ring.terpakai)} of ${b(ring.kuota)} units realized`),
    tt(`${b(ring.bersisa)} dari ${b(ring.baris)} baris masih bersisa`, `${b(ring.bersisa)} of ${b(ring.baris)} lines still have quota`),
  ];
  if (masa) {
    bagian.push(
      masa.hari < 0 || masa.hari > MST_MASA_DEKAT
        ? tt(`berlaku sampai ${escapeHtml(fmtDate(mstDok.valid_until))}`, `valid until ${escapeHtml(fmtDate(mstDok.valid_until))}`)
        : escapeHtml(masa.teks.charAt(0).toLowerCase() + masa.teks.slice(1)),
    );
  }
  sub.innerHTML = bagian.join(" · ");
}

/* ---------- panel: kuota yang masih tersedia ---------- */

function mstGambarTersedia(baris) {
  const box = $("#mstTersedia");
  if (!box) return;
  if (!baris.length) {
    box.innerHTML = mstKosongHtml("bi-card-checklist", tt("Belum ada baris masterlist.", "No masterlist lines yet."));
    return;
  }
  const jenis = mstPerJenis(baris);
  const bersisa = jenis.filter((g) => g.sisa > 0);
  const habis = jenis.length - bersisa.length;
  if (!bersisa.length) {
    box.innerHTML = mstKosongHtml(
      "bi-check2-all",
      tt("Seluruh kuota sudah terealisasi — tidak ada yang tersisa.", "All quota has been realized — nothing is left."),
    );
    return;
  }

  const tampil = mstKeadaan.semuaJenis ? bersisa : bersisa.slice(0, MST_JENIS_AWAL);
  const aktif = mstKeadaan.jenis;
  const barisHtml = tampil
    .map((g) => {
      const dipilih = !!aktif && aktif.nama === g.nama && aktif.lini === g.lini;
      const ket = [g.lini, tt(`${mstFmt(g.baris)} baris`, `${mstFmt(g.baris)} ${g.baris === 1 ? "line" : "lines"}`)].filter(Boolean).join(" · ");
      return `<button type="button" class="mst-jenis${dipilih ? " is-aktif" : ""}" aria-pressed="${dipilih}"
          data-mst-jenis="${escapeAttr(g.nama)}" data-mst-jenis-lini="${escapeAttr(g.lini)}"
          title="${escapeAttr(dipilih ? tt("Lepas saringan jenis ini", "Clear this filter") : tt("Tampilkan baris jenis ini di daftar", "Show this type's lines in the list"))}">
          <span class="mst-jenis-nama"><b>${escapeHtml(g.nama)}</b><small>${escapeHtml(ket)}</small></span>
          ${mstTallyHtml(g.sisa, g.terpakai)}
          <span class="mst-jenis-angka"><b>${escapeHtml(mstFmt(g.sisa))}</b> ${escapeHtml(tt("dari", "of"))} ${escapeHtml(mstFmt(g.kuota))}<span class="visually-hidden"> ${escapeHtml(tt("unit tersedia", "units available"))}</span></span>
        </button>`;
    })
    .join("");

  const lagi = bersisa.length - tampil.length;
  const kaki = [];
  if (lagi > 0 || (mstKeadaan.semuaJenis && bersisa.length > MST_JENIS_AWAL)) {
    kaki.push(
      `<button type="button" class="mst-taut" data-mst-semua-jenis>${escapeHtml(
        mstKeadaan.semuaJenis
          ? tt("Tampilkan lebih sedikit", "Show fewer")
          : tt(`Tampilkan ${mstFmt(lagi)} jenis lainnya`, `Show ${mstFmt(lagi)} more ${lagi === 1 ? "type" : "types"}`),
      )}</button>`,
    );
  }
  if (habis > 0) {
    kaki.push(
      `<span>${escapeHtml(
        tt(`${mstFmt(habis)} jenis mesin lain sudah habis terealisasi.`, `${mstFmt(habis)} other machine ${habis === 1 ? "type is" : "types are"} fully realized.`),
      )} <button type="button" class="mst-taut" data-mst-lihat-status="habis">${escapeHtml(tt("Lihat di daftar", "See in the list"))}</button></span>`,
    );
  }
  box.innerHTML = `<div class="mst-jenis-daftar">${barisHtml}</div>${kaki.length ? `<div class="mst-jenis-kaki">${kaki.join("")}</div>` : ""}`;
}

/* ---------- panel: dokumen masterlist ---------- */

function mstGambarDokumen() {
  const box = $("#mstDokumen");
  if (!box) return;
  // Tanpa dokumen tidak ada yang bisa diubah: tombolnya ikut disembunyikan
  const ubah = $("#btnMstDokumen");
  if (ubah) ubah.hidden = !mstDok;
  if (!mstDok) {
    box.innerHTML = mstKosongHtml("bi-file-earmark-text", tt("Belum ada dokumen masterlist.", "No masterlist document yet."));
    return;
  }
  const masa = mstMasa(mstDok);
  const isi = (label, nilai, tambahan) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${nilai ? escapeHtml(nilai) : `<span class="mst-redup">—</span>`}${tambahan || ""}</dd></div>`;
  box.innerHTML = `
    <dl class="mst-dok">
      ${isi(tt("Nama", "Name"), mstDok.name)}
      ${isi(tt("No. SK", "Decree No."), mstDok.sk_no)}
      ${isi(tt("Tanggal SK", "Decree date"), mstDok.sk_date ? fmtDate(mstDok.sk_date) : "")}
      ${isi(
        tt("Berlaku sampai", "Valid until"),
        mstDok.valid_until ? fmtDate(mstDok.valid_until) : "",
        masa ? `<span class="mst-masa ${masa.kelas}"><i class="bi ${masa.ikon}" aria-hidden="true"></i> ${escapeHtml(masa.teks)}</span>` : "",
      )}
    </dl>
    ${
      mstDok.valid_until
        ? ""
        : `<p class="mst-dok-ket"><i class="bi bi-info-circle" aria-hidden="true"></i> ${escapeHtml(
            tt(
              "Masa berlaku belum diisi. Isi tanggalnya supaya pengingat masa berlaku muncul di sini.",
              "The validity date is not filled in yet. Add it to see the expiry reminder here.",
            ),
          )}</p>`
    }
    ${mstDok.notes ? `<p class="mst-dok-catatan">${escapeHtml(mstDok.notes).replace(/\n/g, "<br>")}</p>` : ""}`;
}

/* ---------- panel: belum dicatat ---------- */

function mstGambarBelumDicatat() {
  const box = $("#mstPerlu");
  const note = $("#mstPerluNote");
  if (!box) return;
  const daftar = mstBelumDicatat();
  if (note) note.textContent = daftar.length ? tt(`${mstFmt(daftar.length)} jadwal`, `${mstFmt(daftar.length)} ${daftar.length === 1 ? "schedule" : "schedules"}`) : "";
  if (!daftar.length) {
    box.innerHTML = `<div class="mst-perlu-kosong">
        <p><i class="bi bi-check2-circle" aria-hidden="true"></i> ${escapeHtml(
          tt("Tidak ada jadwal import berfasilitas Masterlist yang belum dicatat.", "No import schedule with the Masterlist facility is waiting to be recorded."),
        )}</p>
        <p class="mst-redup">${escapeHtml(
          tt(
            "Jadwal import yang barangnya ditandai fasilitas Masterlist akan muncul di sini sampai nomor ajunya dicatat sebagai realisasi.",
            "Import schedules whose items are tagged with the Masterlist facility appear here until their aju number is recorded as a realization.",
          ),
        )}</p>
      </div>`;
    return;
  }
  const boleh = canEdit();
  box.innerHTML = daftar
    .map((s) => {
      const barang = mstBarangMasterlist(s);
      const rincian = [
        s.noAju ? "Aju " + mstAjuRingkas(s.noAju) : tt("No. aju belum diisi", "Aju number not filled in"),
        dispVal(s.invoice),
        tt(`${mstFmt(barang.length)} barang`, `${mstFmt(barang.length)} ${barang.length === 1 ? "item" : "items"}`),
      ];
      return `<button type="button" class="task task--doc" data-mst-catat-jadwal="${escapeAttr(s.id)}"
          title="${escapeAttr(boleh ? tt("Catat realisasinya", "Record its realization") : tt("Buka jadwalnya", "Open the schedule"))}">
          <span class="task-main">
            <span class="task-party">${escapeHtml(dispVal(s.party))}</span>
            <span class="task-detail">${escapeHtml(rincian.join(" · "))}</span>
            <span class="task-goods">${escapeHtml(barang.map((it) => itemDisplayName(it)).filter(Boolean).join(", "))}</span>
          </span>
          <i class="bi ${boleh ? "bi-journal-plus" : "bi-chevron-right"} task-go" aria-hidden="true"></i>
        </button>`;
    })
    .join("");
}

/* ---------- daftar: per baris ---------- */

function mstRincianBarisHtml(b) {
  const boleh = canEdit();
  const realisasi = b.realisasi.length
    ? `<table class="mst-rinci-tabel">
        <thead><tr>
          <th>${escapeHtml(tt("Tanggal PIB", "PIB date"))}</th>
          <th>${escapeHtml(tt("Nomor aju", "Aju number"))}</th>
          <th class="mst-kol-angka">${escapeHtml(tt("Jumlah", "Quantity"))}</th>
          <th>${escapeHtml(tt("Catatan", "Notes"))}</th>
          <th class="mst-ubah"></th>
        </tr></thead>
        <tbody>${b.realisasi
          .map(
            (u) => `<tr>
            <td class="mst-mono">${u.pib_date ? escapeHtml(fmtDate(u.pib_date)) : `<span class="mst-redup">—</span>`}</td>
            <td><span class="mst-mono">${escapeHtml(u.aju_ref)}</span></td>
            <td class="mst-kol-angka">${escapeHtml(mstFmt(u.qty))}</td>
            <td>${u.notes ? escapeHtml(u.notes) : `<span class="mst-redup">—</span>`}</td>
            <td class="mst-ubah"><div class="hscode-actions">
              <button type="button" class="icon-btn" data-mst-ubah-realisasi="${escapeAttr(u.id)}" title="${escapeAttr(tt("Ubah realisasi", "Edit realization"))}"><i class="bi bi-pencil"></i></button>
              <button type="button" class="icon-btn danger" data-mst-hapus-realisasi="${escapeAttr(u.id)}" title="${escapeAttr(tt("Hapus realisasi", "Delete realization"))}"><i class="bi bi-trash3"></i></button>
            </div></td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>`
    : `<p class="mst-redup mst-rinci-kosong">${escapeHtml(tt("Belum ada realisasi untuk baris ini.", "No realization recorded for this line yet."))}</p>`;

  return `<div class="mst-rinci">
      <div class="mst-rinci-spek">
        <span class="mst-rinci-label">${escapeHtml(tt("Spesifikasi", "Specification"))}</span>
        <p>${escapeHtml(b.spesifikasi || "—")}</p>
      </div>
      <div class="mst-rinci-realisasi">
        <span class="mst-rinci-label">${escapeHtml(tt("Realisasi", "Realizations"))}</span>
        ${realisasi}
      </div>
      ${
        boleh
          ? `<div class="mst-rinci-aksi mst-ubah">
          ${
            b.sisa > 0
              ? `<button type="button" class="btn-teal" data-mst-catat="${escapeAttr(b.id)}"><i class="bi bi-journal-plus"></i> ${escapeHtml(tt("Catat realisasi", "Record realization"))}</button>`
              : ""
          }
          <button type="button" class="btn btn-form-cancel mst-tombol" data-mst-ubah-baris="${escapeAttr(b.id)}"><i class="bi bi-pencil"></i> ${escapeHtml(tt("Ubah baris", "Edit line"))}</button>
          <button type="button" class="btn btn-form-cancel mst-tombol mst-tombol--hapus" data-mst-hapus-baris="${escapeAttr(b.id)}"><i class="bi bi-trash3"></i> ${escapeHtml(tt("Hapus baris", "Delete line"))}</button>
        </div>`
          : ""
      }
    </div>`;
}

function mstTabelBarisHtml(baris) {
  const L = {
    barang: tt("Barang", "Item"),
    lini: tt("Lini proses", "Process line"),
    kuota: tt("Kuota", "Quota"),
    terpakai: tt("Terpakai", "Used"),
    sisa: tt("Sisa", "Remaining"),
    aju: "PIB aju",
  };
  return `<div class="mst-tabel-wrap">
      <table class="mst-tabel mst-tabel--baris">
        <thead><tr>
          <th class="mst-kol-no">No.</th>
          <th class="mst-kol-barang">${escapeHtml(L.barang)}</th>
          <th class="mst-kol-lini">${escapeHtml(L.lini)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.kuota)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.terpakai)}</th>
          <th class="mst-kol-sisa">${escapeHtml(L.sisa)}</th>
          <th class="mst-kol-aju">${escapeHtml(L.aju)}</th>
          <th class="mst-kol-aksi"></th>
        </tr></thead>
        <tbody>${baris
          .map((b) => {
            const buka = mstKeadaan.terbuka.has("b:" + b.id);
            const rujukan = [...new Set(b.realisasi.map((u) => String(u.aju_ref || "").trim()).filter(Boolean))];
            return `<tr class="mst-baris${buka ? " is-terbuka" : ""}${b.sisa > 0 ? "" : " is-habis"}" data-mst-id="${escapeAttr(b.id)}">
            <td class="mst-kol-no">${escapeHtml(b.no)}</td>
            <td class="mst-kol-barang" data-no="${escapeAttr(b.no)}">
              <span class="mst-nama">${escapeHtml(b.nama)}</span>
              <span class="mst-spek">${escapeHtml(mstSpekRingkas(b.spek))}</span>
            </td>
            <td class="mst-kol-lini" data-label="${escapeAttr(L.lini)}">${b.lini ? escapeHtml(b.lini) : `<span class="mst-redup">—</span>`}</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.kuota)}">${escapeHtml(mstFmt(b.kuota))} <span class="mst-satuan">${escapeHtml(b.satuan)}</span></td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.terpakai)}">${escapeHtml(mstFmt(b.terpakai))}</td>
            <td class="mst-kol-sisa" data-label="${escapeAttr(L.sisa)}">${mstTallyHtml(b.sisa, b.terpakai)}<b>${escapeHtml(mstFmt(b.sisa))}</b></td>
            <td class="mst-kol-aju" data-label="${escapeAttr(L.aju)}">${rujukan.length ? rujukan.map(mstAjuCipHtml).join("") : `<span class="mst-redup">—</span>`}</td>
            <td class="mst-kol-aksi"><div class="hscode-actions">
              ${
                b.sisa > 0
                  ? `<button type="button" class="icon-btn mst-ubah" data-mst-catat="${escapeAttr(b.id)}" title="${escapeAttr(tt("Catat realisasi baris ini", "Record a realization for this line"))}"><i class="bi bi-journal-plus"></i></button>`
                  : ""
              }
              <button type="button" class="icon-btn mst-buka" data-mst-buka="b:${escapeAttr(b.id)}" aria-expanded="${buka}"
                title="${escapeAttr(buka ? tt("Tutup rincian", "Hide details") : tt("Spesifikasi & realisasi", "Specification & realizations"))}"><i class="bi ${buka ? "bi-chevron-up" : "bi-chevron-down"}"></i></button>
            </div></td>
          </tr>${buka ? `<tr class="mst-baris-rinci"><td colspan="8">${mstRincianBarisHtml(b)}</td></tr>` : ""}`;
          })
          .join("")}</tbody>
      </table>
    </div>`;
}

/* ---------- daftar: per PIB ---------- */

function mstTabelPibHtml(kelompok) {
  const L = { tanggal: tt("Tanggal PIB", "PIB date"), jadwal: tt("Jadwal", "Schedule"), baris: tt("Baris", "Lines"), unit: "Unit" };
  return `<div class="mst-tabel-wrap">
      <table class="mst-tabel mst-tabel--pib">
        <thead><tr>
          <th class="mst-kol-pib">PIB aju</th>
          <th class="mst-kol-tgl">${escapeHtml(L.tanggal)}</th>
          <th class="mst-kol-jadwal">${escapeHtml(L.jadwal)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.baris)}</th>
          <th class="mst-kol-angka">${escapeHtml(L.unit)}</th>
          <th class="mst-kol-aksi"></th>
        </tr></thead>
        <tbody>${kelompok
          .map((g) => {
            const buka = mstKeadaan.terbuka.has("p:" + g.kunci);
            const jadwal = g.jadwal
              ? `<button type="button" class="mst-taut" data-mst-jadwal="${escapeAttr(g.jadwal.id)}">${escapeHtml(dispVal(g.jadwal.party))}</button><span class="mst-spek">${escapeHtml(dispVal(g.jadwal.invoice))}</span>`
              : `<span class="mst-redup">—</span>`;
            const isi = buka
              ? `<tr class="mst-baris-rinci"><td colspan="6"><div class="mst-rinci">
                  <table class="mst-rinci-tabel">
                    <thead><tr>
                      <th>No.</th><th>${escapeHtml(tt("Barang", "Item"))}</th><th class="mst-kol-angka">${escapeHtml(tt("Jumlah", "Quantity"))}</th><th>${escapeHtml(tt("Catatan", "Notes"))}</th>
                    </tr></thead>
                    <tbody>${g.isi
                      .slice()
                      .sort((a, b) => a.baris.no - b.baris.no)
                      .map(
                        (x) => `<tr>
                        <td class="mst-mono">${escapeHtml(x.baris.no)}</td>
                        <td><span class="mst-nama">${escapeHtml(x.baris.nama)}</span><span class="mst-spek">${escapeHtml(mstSpekRingkas(x.baris.spek))}</span></td>
                        <td class="mst-kol-angka">${escapeHtml(mstFmt(x.realisasi.qty))} <span class="mst-satuan">${escapeHtml(x.baris.satuan)}</span></td>
                        <td>${x.realisasi.notes ? escapeHtml(x.realisasi.notes) : `<span class="mst-redup">—</span>`}</td>
                      </tr>`,
                      )
                      .join("")}</tbody>
                  </table>
                </div></td></tr>`
              : "";
            return `<tr class="mst-baris${buka ? " is-terbuka" : ""}">
            <td class="mst-kol-pib"><span class="mst-nama mst-mono" title="${escapeAttr(g.aju)}">${escapeHtml(g.jadwal ? g.jadwal.noAju : g.aju)}</span></td>
            <td class="mst-kol-tgl mst-mono" data-label="${escapeAttr(L.tanggal)}">${g.tanggal ? escapeHtml(fmtDate(g.tanggal)) : `<span class="mst-redup">—</span>`}</td>
            <td class="mst-kol-jadwal" data-label="${escapeAttr(L.jadwal)}">${jadwal}</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.baris)}">${escapeHtml(mstFmt(g.isi.length))}</td>
            <td class="mst-kol-angka" data-label="${escapeAttr(L.unit)}">${escapeHtml(mstFmt(g.unit))}</td>
            <td class="mst-kol-aksi"><div class="hscode-actions">
              <button type="button" class="icon-btn mst-buka" data-mst-buka="p:${escapeAttr(g.kunci)}" aria-expanded="${buka}"
                title="${escapeAttr(buka ? tt("Tutup rincian", "Hide details") : tt("Baris yang direalisasikan", "Lines realized"))}"><i class="bi ${buka ? "bi-chevron-up" : "bi-chevron-down"}"></i></button>
            </div></td>
          </tr>${isi}`;
          })
          .join("")}</tbody>
      </table>
    </div>`;
}

/* ---------- daftar + paginasi ---------- */

function mstGambarSaringan(baris) {
  // Pilihan lini proses dirakit dari datanya; nilai yang sedang dipilih dipertahankan
  const pilih = $("#mstLini");
  if (pilih) {
    const kini = pilih.value;
    const lini = [...new Set(baris.map((b) => b.lini).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    pilih.innerHTML =
      `<option value="">${escapeHtml(tt("Semua lini proses", "All process lines"))}</option>` +
      lini.map((l) => `<option value="${escapeAttr(l)}">${escapeHtml(l)}</option>`).join("");
    pilih.value = lini.indexOf(kini) >= 0 ? kini : "";
    pilih.classList.toggle("d-none", lini.length < 2);
  }
  const cip = $("#mstJenisAktif");
  if (cip) {
    const j = mstKeadaan.jenis;
    cip.classList.toggle("d-none", !j);
    cip.innerHTML = j
      ? `<span>${escapeHtml(tt("Jenis", "Type"))}: <b>${escapeHtml(j.nama)}</b></span><button type="button" data-mst-lepas-jenis aria-label="${escapeAttr(tt("Lepas saringan jenis", "Clear the type filter"))}" title="${escapeAttr(tt("Lepas saringan jenis", "Clear the type filter"))}"><i class="bi bi-x-lg" aria-hidden="true"></i></button>`
      : "";
  }
  document.querySelectorAll("[data-mst-tampilan]").forEach((el) => {
    const aktif = el.dataset.mstTampilan === mstKeadaan.tampilan;
    el.classList.toggle("active", aktif);
    el.setAttribute("aria-pressed", String(aktif));
  });
}

function mstGambarDaftar(baris) {
  const box = $("#mstDaftar");
  if (!box) return;
  if (!baris.length) {
    box.innerHTML = mstKosongHtml(
      "bi-card-checklist",
      tt("Belum ada baris. Tambahkan lewat tombol Tambah baris di atas.", "No lines yet. Add one with the Add line button above."),
    );
    mstGambarPaginasi(0);
    return;
  }
  const lolos = baris.filter((b) => mstCocok(b, mstSaringan()));
  const perPib = mstKeadaan.tampilan === "pib";
  const semua = perPib ? mstPerPib(lolos) : lolos;
  if (!semua.length) {
    box.innerHTML = mstKosongHtml(
      "bi-search",
      perPib && lolos.length
        ? tt("Baris yang cocok belum punya realisasi.", "The matching lines have no realization yet.")
        : tt("Tidak ada baris yang cocok.", "No matching lines."),
    );
    mstGambarPaginasi(0);
    return;
  }
  const totalHalaman = Math.max(1, Math.ceil(semua.length / mstKeadaan.perHalaman));
  mstKeadaan.halaman = Math.min(Math.max(1, mstKeadaan.halaman), totalHalaman);
  const mulai = (mstKeadaan.halaman - 1) * mstKeadaan.perHalaman;
  const potong = semua.slice(mulai, mulai + mstKeadaan.perHalaman);
  box.innerHTML = perPib ? mstTabelPibHtml(potong) : mstTabelBarisHtml(potong);
  mstGambarPaginasi(semua.length);
}

/* Paginasi bentuk yang sama dengan HS Code & Jadwal Kapal. */
function mstGambarPaginasi(total) {
  const bar = $("#mstPagination");
  if (!bar) return;
  if (!total) {
    bar.className = "hs-halaman";
    bar.innerHTML = "";
    return;
  }
  const halaman = mstKeadaan.halaman;
  const per = mstKeadaan.perHalaman;
  const totalHalaman = Math.max(1, Math.ceil(total / per));
  const awal = (halaman - 1) * per + 1;
  const akhir = Math.min(halaman * per, total);
  const perPib = mstKeadaan.tampilan === "pib";
  const tombol = paginationRange(halaman, totalHalaman)
    .map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn ${p === halaman ? "active" : ""}" data-mstpage="${p}">${p}</button>`,
    )
    .join("");
  const rentang = `<b>${awal}–${akhir}</b>`;
  const jumlah = `<b>${mstFmt(total)}</b>`;
  bar.className = "pagination-bar hs-halaman";
  bar.innerHTML = `
    <div class="pagination-info">${
      perPib
        ? tt(`Menampilkan ${rentang} dari ${jumlah} PIB`, `Showing ${rentang} of ${jumlah} ${total === 1 ? "PIB" : "PIBs"}`)
        : tt(`Menampilkan ${rentang} dari ${jumlah} baris`, `Showing ${rentang} of ${jumlah} ${total === 1 ? "line" : "lines"}`)
    }</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" data-mstnav="prev" ${halaman <= 1 ? "disabled" : ""} aria-label="${escapeAttr(tt("Halaman sebelumnya", "Previous page"))}"><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${tombol}</div>
      <button type="button" class="page-nav" data-mstnav="next" ${halaman >= totalHalaman ? "disabled" : ""} aria-label="${escapeAttr(tt("Halaman berikutnya", "Next page"))}"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="mstPageSize">${escapeHtml(tt("Per halaman", "Per page"))}</label>
      <select id="mstPageSize">
        ${MST_UKURAN_HALAMAN.map((n) => `<option value="${n}" ${n === per ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </div>`;
}

function renderMasterlist() {
  if (!$("#viewMasterlist")) return;
  const baris = mstSusun();
  mstGambarPapan(mstRingkasan(baris));
  mstGambarTersedia(baris);
  mstGambarDokumen();
  mstGambarBelumDicatat();
  mstGambarSaringan(baris);
  mstGambarDaftar(baris);
}

/* ---------- memuat ---------- */

async function mstAmbil() {
  const { data: dok, error: e1 } = await supabaseClient
    .from("masterlists")
    .select("id, name, sk_no, sk_date, valid_until, notes, created_at")
    .order("created_at", { ascending: true });
  if (e1) throw e1;
  mstDok = (dok || [])[0] || null;
  if (!mstDok) {
    mstBarisDb = [];
    mstRealisasiDb = [];
    return;
  }
  const { data: baris, error: e2 } = await supabaseClient
    .from("masterlist_items")
    .select("id, list_id, no, description, specification, uom, quota, created_at")
    .eq("list_id", mstDok.id)
    .order("no", { ascending: true });
  if (e2) throw e2;
  mstBarisDb = baris || [];
  const { data: realisasi, error: e3 } = await supabaseClient
    .from("masterlist_usages")
    .select("id, item_id, qty, aju_ref, pib_date, notes, created_at")
    .order("created_at", { ascending: true });
  if (e3) throw e3;
  const milik = new Set(mstBarisDb.map((b) => b.id));
  mstRealisasiDb = (realisasi || []).filter((u) => milik.has(u.item_id));
}

/* Pemuatan pertama mengosongkan panel; pemuatan ulang MENAHAN tampilan
   yang ada (sedikit diredupkan) sampai data baru tiba -- daftar yang
   sebenarnya masih benar tidak perlu berkedip jadi "Memuat…". */
async function loadMasterlist() {
  const halaman = $("#viewMasterlist");
  if (!mstTermuat) {
    ["#mstTersedia", "#mstDaftar"].forEach((sel) => {
      const el = $(sel);
      if (el) el.innerHTML = mstKosongHtml("bi-hourglass", tt("Memuat masterlist…", "Loading the masterlist…"));
    });
  } else if (halaman) {
    halaman.classList.add("is-memuat");
  }
  try {
    await mstAmbil();
    mstTermuat = true;
  } catch (e) {
    console.error(e);
    if (halaman) halaman.classList.remove("is-memuat");
    if (!mstTermuat) {
      const pesan = mstKosongHtml(
        "bi-exclamation-triangle",
        tt(
          "Gagal memuat masterlist. Pastikan migration-masterlist.sql sudah dijalankan.",
          "Failed to load the masterlist. Make sure migration-masterlist.sql has been run.",
        ),
      );
      ["#mstTersedia", "#mstDaftar"].forEach((sel) => {
        const el = $(sel);
        if (el) el.innerHTML = pesan;
      });
      const sub = $("#mstSub");
      if (sub) sub.textContent = tt("Data tidak bisa dimuat.", "The data could not be loaded.");
    } else {
      showToast(tt("Gagal memuat ulang masterlist.", "Failed to reload the masterlist."), "danger");
    }
    return false;
  }
  if (halaman) halaman.classList.remove("is-memuat");
  renderMasterlist();
  return true;
}

function showMasterlistView() {
  showPage("masterlist");
  window.scrollTo(0, 0);
  // Sudah pernah dimuat: tampil seketika dengan data yang ada, lalu disegarkan
  if (mstTermuat) renderMasterlist();
  loadMasterlist();
}

/* Pesan dari database untuk penolakan yang memang bisa terjadi: dua
   orang mencatat bersamaan (kuota terlampaui), nomor baris kembar. */
function mstPesanGalat(error, cadangan) {
  const pesan = String((error && error.message) || "");
  if (/melebihi kuota|lebih kecil dari yang sudah terpakai/i.test(pesan)) return pesan;
  if (/masterlist_items_no_unik|duplicate key/i.test(pesan)) return tt("Nomor baris itu sudah dipakai.", "That line number is already in use.");
  return cadangan;
}

/* ---------- catat / ubah realisasi ---------- */

const mstModalEl = $("#mstRealisasiModal");
const mstModal = mstModalEl ? new bootstrap.Modal(mstModalEl) : null;
let mstForm = null; // { mode: "baru" | "ubah", id, asal, baris: [{ itemId, qty }] }
let mstMenyimpan = false;

/* Paling banyak yang boleh dicatat untuk sebuah baris: sisanya -- dan
   saat MENGUBAH sebuah realisasi, jumlah lamanya ikut dikembalikan. */
function mstBatas(b) {
  const tambahan = mstForm && mstForm.mode === "ubah" && mstForm.baris[0] && mstForm.baris[0].itemId === b.id ? mstForm.asal : 0;
  return mstBulat(b.sisa + tambahan);
}

function mstLabelBaris(b) {
  const spek = b.spek.mentah || [b.spek.merek].concat(b.spek.rincian).filter(Boolean).join(" ");
  return `${b.no} · ${b.nama}${spek ? " · " + spek : ""} · ${tt("sisa", "left")} ${mstFmt(mstBatas(b))}`;
}

function mstGambarPilih() {
  const wadah = $("#mstPilih");
  if (!wadah || !mstForm) return;
  const semua = mstSusun();
  const dipilih = new Set(mstForm.baris.map((x) => x.itemId).filter(Boolean));
  const ubah = mstForm.mode === "ubah";
  wadah.innerHTML = mstForm.baris
    .map((x, i) => {
      const b = semua.find((r) => r.id === x.itemId);
      const pilihan = semua.filter((r) => r.id === x.itemId || (mstBatas(r) > 0 && !dipilih.has(r.id)));
      return `<div class="mst-pilih" data-mst-pilih="${i}">
          <select class="login-input mst-pilih-baris" data-mst-pilih-baris ${ubah ? "disabled" : ""}
                  aria-label="${escapeAttr(tt("Baris masterlist", "Masterlist line"))}">
            <option value="">${escapeHtml(tt("— pilih baris —", "— choose a line —"))}</option>
            ${pilihan.map((r) => `<option value="${escapeAttr(r.id)}" ${r.id === x.itemId ? "selected" : ""}>${escapeHtml(mstLabelBaris(r))}</option>`).join("")}
          </select>
          <input type="number" class="login-input mst-pilih-qty" data-mst-pilih-qty min="0" step="any" inputmode="decimal"
                 value="${escapeAttr(x.qty)}" aria-label="${escapeAttr(tt("Jumlah", "Quantity"))}" placeholder="${escapeAttr(tt("Jumlah", "Qty"))}" />
          ${
            !ubah && mstForm.baris.length > 1
              ? `<button type="button" class="rm-row" data-mst-pilih-hapus title="${escapeAttr(tt("Hapus baris ini", "Remove this line"))}" aria-label="${escapeAttr(tt("Hapus baris ini", "Remove this line"))}"><i class="bi bi-x-lg"></i></button>`
              : ""
          }
          <div class="prompt-hint mst-pilih-ket">${
            b ? escapeHtml(tt(`Sisa kuota ${mstFmt(mstBatas(b))} ${b.satuan}`, `Quota left: ${mstFmt(mstBatas(b))} ${b.satuan}`)) : ""
          }</div>
        </div>`;
    })
    .join("");
  // Tidak ada lagi baris bersisa yang belum dipilih -> tidak ada yang bisa ditambahkan
  const tambah = $("#btnMstPilihTambah");
  if (tambah) {
    const tersisa = semua.some((r) => mstBatas(r) > 0 && !dipilih.has(r.id));
    tambah.classList.toggle("d-none", ubah);
    tambah.disabled = !tersisa || mstForm.baris.some((x) => !x.itemId);
  }
}

/* Keterangan di bawah kotak nomor aju: jadwal yang cocok, dan apakah PIB
   itu sudah punya catatan (mencegah dicatat dua kali). */
function mstGambarKetAju() {
  const ket = $("#mstAjuKet");
  const kotak = $("#mstAju");
  if (!ket || !kotak) return;
  const bagian = mstPecahAju(kotak.value);
  const pesan = [];
  if (bagian.length === 1) {
    const jadwal = mstJadwalUntukAju(bagian[0]);
    if (jadwal.length === 1) pesan.push(tt("Jadwal", "Schedule") + ": " + dispVal(jadwal[0].party) + " · " + dispVal(jadwal[0].invoice));
    const kunci = mstKunciAju(bagian[0]);
    const tercatat = mstRealisasiDb.filter((u) => (!mstForm || u.id !== mstForm.id) && mstKunciAju(u.aju_ref) === kunci).length;
    if (tercatat)
      pesan.push(
        tt(`PIB ini sudah punya ${mstFmt(tercatat)} baris realisasi tercatat.`, `This PIB already has ${mstFmt(tercatat)} realization ${tercatat === 1 ? "line" : "lines"} recorded.`),
      );
  }
  ket.textContent = pesan.join(" ");
}

/* opsi: { itemId } baris yang langsung dipilih; { aju, ket } isian awal
   (dari panel Belum dicatat); { realisasi } untuk MENGUBAH satu catatan. */
function mstBukaRealisasi(opsi) {
  if (!requireEdit() || !mstModal) return;
  const o = opsi || {};
  const u = o.realisasi || null;
  /* Mencatat realisasi BARU butuh baris yang masih bersisa. Tanpa itu
     kotaknya terbuka dengan pilihan kosong dan tidak ada yang bisa
     disimpan -- lebih jelas dikatakan langsung. */
  if (!u && !mstSusun().some((b) => b.sisa > 0)) {
    showToast(
      mstBarisDb.length
        ? tt("Seluruh kuota sudah terealisasi — tidak ada baris yang bisa dicatat.", "All quota has been realized — there is no line left to record.")
        : tt("Belum ada baris masterlist untuk dicatat.", "There are no masterlist lines to record yet."),
      "danger",
    );
    return;
  }
  mstForm = u
    ? { mode: "ubah", id: u.id, asal: Number(u.qty) || 0, baris: [{ itemId: u.item_id, qty: String(mstBulat(u.qty)) }] }
    : { mode: "baru", id: null, asal: 0, baris: [{ itemId: o.itemId || "", qty: o.itemId ? "1" : "" }] };

  $("#mstRealisasiJudul").textContent = u ? tt("Ubah realisasi", "Edit realization") : tt("Catat realisasi", "Record realization");
  $("#mstRealisasiKet").textContent = o.ket || "";
  $("#mstAju").value = u ? u.aju_ref || "" : o.aju || "";
  $("#mstTanggal").value = u ? u.pib_date || "" : "";
  $("#mstCatatan").value = u ? u.notes || "" : "";
  $("#mstRealisasiGalat").classList.add("d-none");
  $("#mstAjuList").innerHTML = ((typeof data !== "undefined" && data && data.import) || [])
    .filter((s) => String(s.noAju || "").trim())
    .map((s) => `<option value="${escapeAttr(s.noAju)}">${escapeHtml(dispVal(s.party))}</option>`)
    .join("");
  // Baris yang langsung dipilih: jumlah awalnya 1, atau sisanya kalau kurang dari itu
  if (!u && o.itemId) {
    const b = mstSusun().find((r) => r.id === o.itemId);
    if (b) mstForm.baris[0].qty = String(Math.min(1, mstBatas(b)));
  }
  mstGambarPilih();
  mstGambarKetAju();
  mstModal.show();
  setTimeout(() => {
    const fokus = $("#mstAju").value ? $("#mstPilih select:not(:disabled), #mstPilih input") : $("#mstAju");
    if (fokus) fokus.focus();
  }, 300);
}

/* Isi kotak pilihan -> mstForm.baris, sebelum digambar ulang atau disimpan. */
function mstBacaPilih() {
  if (!mstForm) return;
  document.querySelectorAll("#mstPilih [data-mst-pilih]").forEach((el) => {
    const x = mstForm.baris[Number(el.dataset.mstPilih)];
    if (!x) return;
    x.itemId = el.querySelector("[data-mst-pilih-baris]").value;
    x.qty = el.querySelector("[data-mst-pilih-qty]").value;
  });
}

/* Memeriksa isian. Mengembalikan { galat } atau { aju, tanggal, catatan,
   baris: [{ itemId, qty }] } yang siap disimpan. */
function mstPeriksaForm() {
  mstBacaPilih();
  const aju = $("#mstAju").value.replace(/\s+/g, " ").trim();
  if (!aju) return { galat: tt("Nomor aju PIB harus diisi.", "The PIB aju number is required.") };
  const semua = mstSusun();
  const baris = [];
  for (const x of mstForm.baris) {
    const b = semua.find((r) => r.id === x.itemId);
    if (!b) return { galat: tt("Pilih baris masterlist yang direalisasikan.", "Choose the masterlist line being realized.") };
    const qty = Number(String(x.qty).replace(",", "."));
    if (!(qty > 0)) return { galat: tt(`Jumlah untuk baris ${b.no} harus lebih dari 0.`, `The quantity for line ${b.no} must be greater than 0.`) };
    if (mstBulat(qty) !== qty)
      return { galat: tt(`Jumlah untuk baris ${b.no} paling banyak tiga angka di belakang koma.`, `The quantity for line ${b.no} can have at most three decimals.`) };
    const batas = mstBatas(b);
    if (qty > batas)
      return {
        galat: tt(
          `Jumlah untuk baris ${b.no} melebihi sisa kuotanya (${mstFmt(batas)} ${b.satuan}).`,
          `The quantity for line ${b.no} exceeds its remaining quota (${mstFmt(batas)} ${b.satuan}).`,
        ),
      };
    if (baris.some((y) => y.itemId === b.id)) return { galat: tt(`Baris ${b.no} dipilih dua kali.`, `Line ${b.no} is chosen twice.`) };
    baris.push({ itemId: b.id, qty, no: b.no });
  }
  return { aju, tanggal: $("#mstTanggal").value || null, catatan: $("#mstCatatan").value.trim(), baris };
}

async function mstSimpanRealisasi() {
  if (!requireEdit() || !mstForm || mstMenyimpan) return;
  const kotakGalat = $("#mstRealisasiGalat");
  const tampilGalat = (pesan) => {
    kotakGalat.textContent = pesan;
    kotakGalat.classList.remove("d-none");
  };
  const isi = mstPeriksaForm();
  if (isi.galat) return tampilGalat(isi.galat);
  kotakGalat.classList.add("d-none");

  /* Selama menyimpan tombolnya DITANDAI sibuk, bukan dinonaktifkan:
     tombol yang dinonaktifkan kehilangan fokus, dan sesudah simpan yang
     gagal tombol Esc tidak lagi menutup kotaknya (fokusnya sudah di luar
     kotak). Simpan ganda dicegah lewat mstMenyimpan. */
  const tombol = $("#btnMstSimpanRealisasi");
  mstMenyimpan = true;
  tombol.classList.add("is-sibuk");
  let galat = null;
  try {
    if (mstForm.mode === "ubah") {
      const ubahan = { qty: isi.baris[0].qty, aju_ref: isi.aju, pib_date: isi.tanggal, notes: isi.catatan };
      const { error } = await supabaseClient.from("masterlist_usages").update(ubahan).eq("id", mstForm.id);
      galat = error;
      if (!error) {
        const u = mstRealisasiDb.find((x) => x.id === mstForm.id);
        if (u) Object.assign(u, ubahan);
      }
    } else {
      const { data: hasil, error } = await supabaseClient
        .from("masterlist_usages")
        .insert(
          isi.baris.map((x) => ({
            item_id: x.itemId,
            qty: x.qty,
            aju_ref: isi.aju,
            pib_date: isi.tanggal,
            notes: isi.catatan,
            created_by: authState.user ? authState.user.id : null,
          })),
        )
        .select();
      galat = error;
      if (!error) (hasil || []).forEach((u) => mstRealisasiDb.push(u));
    }
  } catch (e) {
    galat = e;
  }
  mstMenyimpan = false;
  tombol.classList.remove("is-sibuk");
  if (galat) {
    console.error(galat);
    return tampilGalat(mstPesanGalat(galat, tt("Realisasi gagal disimpan. Coba lagi.", "The realization could not be saved. Try again.")));
  }
  const unit = mstBulat(isi.baris.reduce((s, x) => s + x.qty, 0));
  const ubah = mstForm.mode === "ubah";
  mstForm = null;
  mstModal.hide();
  renderMasterlist();
  showToast(
    ubah
      ? tt("Realisasi diperbarui.", "Realization updated.")
      : tt(
          `Realisasi PIB ${mstAjuRingkas(isi.aju)} tercatat: ${mstFmt(isi.baris.length)} baris, ${mstFmt(unit)} unit.`,
          `PIB ${mstAjuRingkas(isi.aju)} recorded: ${mstFmt(isi.baris.length)} ${isi.baris.length === 1 ? "line" : "lines"}, ${mstFmt(unit)} ${unit === 1 ? "unit" : "units"}.`,
        ),
    "success",
  );
}

function mstHapusRealisasi(id) {
  if (!requireEdit()) return;
  const u = mstRealisasiDb.find((x) => x.id === id);
  if (!u) return;
  const b = mstBarisDb.find((x) => x.id === u.item_id);
  showConfirm(
    tt(
      `Hapus realisasi ${mstFmt(u.qty)} unit (PIB ${u.aju_ref}) dari baris ${b ? b.no : "?"}? Kuotanya kembali tersedia.`,
      `Delete the realization of ${mstFmt(u.qty)} ${Number(u.qty) === 1 ? "unit" : "units"} (PIB ${u.aju_ref}) from line ${b ? b.no : "?"}? The quota becomes available again.`,
    ),
    async () => {
      const { error } = await supabaseClient.from("masterlist_usages").delete().eq("id", id);
      if (error) {
        console.error(error);
        showToast(t("m.gagal.menghapus"), "danger");
        return;
      }
      mstRealisasiDb = mstRealisasiDb.filter((x) => x.id !== id);
      renderMasterlist();
      showToast(tt("Realisasi dihapus.", "Realization deleted."), "dark");
    },
    { confirmText: t("u.ya.hapus") },
  );
}

/* ---------- baris masterlist: tambah / ubah / hapus ---------- */

function mstIsianBaris(b) {
  const berikut = mstBarisDb.reduce((m, x) => Math.max(m, Number(x.no) || 0), 0) + 1;
  return [
    { key: "no", label: "No.", type: "number", inputmode: "numeric", value: String(b ? b.no : berikut), lebar: "setengah" },
    { key: "satuan", label: tt("Satuan", "Unit"), value: b ? b.uom || "" : "NIU", placeholder: "NIU", lebar: "setengah" },
    { key: "nama", label: tt("Uraian barang", "Item description"), value: b ? b.description || "" : "", placeholder: tt("Cth: HYDRAULIC PRESS", "e.g. HYDRAULIC PRESS") },
    {
      key: "spek",
      label: tt("Spesifikasi", "Specification"),
      type: "textarea",
      value: b ? b.specification || "" : "",
      hint: tt(
        'Salin dari dokumen masterlist. Bagian "FOR FLOW PROSES MANUFAKTUR …" di akhirnya dibaca sebagai lini proses.',
        'Copy it from the masterlist document. The trailing "FOR FLOW PROSES MANUFAKTUR …" part is read as the process line.',
      ),
    },
    {
      key: "kuota",
      label: tt("Kuota", "Quota"),
      type: "number",
      inputmode: "decimal",
      value: b ? String(mstBulat(b.quota)) : "1",
      hint: b ? mstKetKuota(b) : "",
    },
  ];
}

function mstTerpakai(idBaris) {
  return mstBulat(mstRealisasiDb.filter((u) => u.item_id === idBaris).reduce((s, u) => s + (Number(u.qty) || 0), 0));
}
function mstKetKuota(b) {
  const terpakai = mstTerpakai(b.id);
  return terpakai > 0 ? tt(`Tidak boleh lebih kecil dari yang sudah terpakai (${mstFmt(terpakai)}).`, `Cannot be lower than what is already used (${mstFmt(terpakai)}).`) : "";
}

/* Isian kotak -> baris siap simpan, atau pesan galat (string). */
function mstPeriksaBaris(v, lama) {
  const no = Number(v.no);
  if (!Number.isInteger(no) || no <= 0) return tt("No. harus bilangan bulat lebih dari 0.", "No. must be a whole number greater than 0.");
  if (mstBarisDb.some((x) => Number(x.no) === no && (!lama || x.id !== lama.id)))
    return tt(`No. ${no} sudah dipakai baris lain.`, `No. ${no} is already used by another line.`);
  const nama = String(v.nama || "").replace(/\s+/g, " ").trim();
  if (!nama) return tt("Uraian barang harus diisi.", "The item description is required.");
  const kuota = Number(String(v.kuota).replace(",", "."));
  if (!(kuota > 0)) return tt("Kuota harus lebih dari 0.", "The quota must be greater than 0.");
  if (mstBulat(kuota) !== kuota) return tt("Kuota paling banyak tiga angka di belakang koma.", "The quota can have at most three decimals.");
  if (lama && kuota < mstTerpakai(lama.id))
    return tt(`Kuota tidak boleh lebih kecil dari yang sudah terpakai (${mstFmt(mstTerpakai(lama.id))}).`, `The quota cannot be lower than what is already used (${mstFmt(mstTerpakai(lama.id))}).`);
  return {
    no,
    description: nama,
    specification: String(v.spek || "").replace(/\s+/g, " ").trim(),
    uom: String(v.satuan || "").trim().toUpperCase() || "NIU",
    quota: kuota,
  };
}

function mstTambahBaris() {
  if (!requireEdit()) return;
  if (!mstDok) {
    showToast(tt("Dokumen masterlist belum ada. Jalankan migration-masterlist.sql lebih dulu.", "There is no masterlist document yet. Run migration-masterlist.sql first."), "danger");
    return;
  }
  showPrompt({
    title: tt("Tambah baris masterlist", "Add masterlist line"),
    icon: "bi-card-checklist",
    okText: tt("Simpan", "Save"),
    fields: mstIsianBaris(null),
    onSubmit: (v) => {
      const baris = mstPeriksaBaris(v, null);
      if (typeof baris === "string") return baris;
      mstSimpanBarisBaru(baris);
      return true;
    },
  });
}

async function mstSimpanBarisBaru(baris) {
  const { data: hasil, error } = await supabaseClient
    .from("masterlist_items")
    .insert(Object.assign({ list_id: mstDok.id, created_by: authState.user ? authState.user.id : null }, baris))
    .select()
    .single();
  if (error) {
    console.error(error);
    showToast(mstPesanGalat(error, tt("Baris gagal disimpan.", "The line could not be saved.")), "danger");
    return;
  }
  mstBarisDb.push(hasil);
  renderMasterlist();
  showToast(tt(`Baris ${baris.no} ditambahkan.`, `Line ${baris.no} added.`), "dark");
}

function mstUbahBaris(id) {
  if (!requireEdit()) return;
  const lama = mstBarisDb.find((x) => x.id === id);
  if (!lama) return;
  showPrompt({
    title: tt(`Ubah baris ${lama.no}`, `Edit line ${lama.no}`),
    icon: "bi-pencil-square",
    okText: tt("Simpan", "Save"),
    fields: mstIsianBaris(lama),
    onSubmit: (v) => {
      const baris = mstPeriksaBaris(v, lama);
      if (typeof baris === "string") return baris;
      mstSimpanUbahBaris(id, baris);
      return true;
    },
  });
}

async function mstSimpanUbahBaris(id, baris) {
  const { error } = await supabaseClient.from("masterlist_items").update(baris).eq("id", id);
  if (error) {
    console.error(error);
    showToast(mstPesanGalat(error, t("m.gagal.menyimpan.perubahan")), "danger");
    return;
  }
  const b = mstBarisDb.find((x) => x.id === id);
  if (b) Object.assign(b, baris);
  renderMasterlist();
  showToast(t("m.perubahan.tersimpan"), "dark");
}

function mstHapusBaris(id) {
  if (!requireEdit()) return;
  const b = mstBarisDb.find((x) => x.id === id);
  if (!b) return;
  const realisasi = mstRealisasiDb.filter((u) => u.item_id === id).length;
  showConfirm(
    realisasi
      ? tt(
          `Hapus baris ${b.no} (${b.description})? ${mstFmt(realisasi)} catatan realisasinya IKUT terhapus.`,
          `Delete line ${b.no} (${b.description})? Its ${mstFmt(realisasi)} realization ${realisasi === 1 ? "record is" : "records are"} deleted TOO.`,
        )
      : tt(`Hapus baris ${b.no} (${b.description})?`, `Delete line ${b.no} (${b.description})?`),
    async () => {
      const { error } = await supabaseClient.from("masterlist_items").delete().eq("id", id);
      if (error) {
        console.error(error);
        showToast(t("m.gagal.menghapus"), "danger");
        return;
      }
      mstBarisDb = mstBarisDb.filter((x) => x.id !== id);
      mstRealisasiDb = mstRealisasiDb.filter((u) => u.item_id !== id);
      mstKeadaan.terbuka.delete("b:" + id);
      renderMasterlist();
      showToast(tt(`Baris ${b.no} dihapus.`, `Line ${b.no} deleted.`), "dark");
    },
    { confirmText: t("u.ya.hapus") },
  );
}

/* ---------- dokumen masterlist ---------- */

function mstUbahDokumen() {
  if (!requireEdit() || !mstDok) return;
  showPrompt({
    title: tt("Dokumen masterlist", "Masterlist document"),
    desc: tt(
      "Nomor & tanggal SK serta masa berlakunya. Masa berlaku dipakai untuk pengingat di halaman ini.",
      "The decree number, its date, and the validity period. The validity date drives the reminder on this page.",
    ),
    icon: "bi-file-earmark-text",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nama", label: tt("Nama", "Name"), value: mstDok.name || "" },
      { key: "sk", label: tt("No. SK", "Decree No."), value: mstDok.sk_no || "" },
      { key: "tglSk", label: tt("Tanggal SK", "Decree date"), type: "date", value: mstDok.sk_date || "", lebar: "setengah" },
      { key: "berlaku", label: tt("Berlaku sampai", "Valid until"), type: "date", value: mstDok.valid_until || "", lebar: "setengah" },
      { key: "catatan", label: tt("Catatan (opsional)", "Notes (optional)"), type: "textarea", value: mstDok.notes || "" },
    ],
    onSubmit: (v) => {
      const nama = String(v.nama || "").trim();
      if (!nama) return tt("Nama harus diisi.", "The name is required.");
      if (v.tglSk && v.berlaku && v.berlaku < v.tglSk) return tt("Masa berlaku tidak boleh sebelum tanggal SK.", "The validity date cannot be before the decree date.");
      mstSimpanDokumen({
        name: nama,
        sk_no: String(v.sk || "").trim(),
        sk_date: v.tglSk || null,
        valid_until: v.berlaku || null,
        notes: String(v.catatan || "").trim(),
      });
      return true;
    },
  });
}

async function mstSimpanDokumen(ubahan) {
  const { error } = await supabaseClient.from("masterlists").update(ubahan).eq("id", mstDok.id);
  if (error) {
    console.error(error);
    showToast(t("m.gagal.menyimpan.perubahan"), "danger");
    return;
  }
  Object.assign(mstDok, ubahan);
  renderMasterlist();
  showToast(t("m.perubahan.tersimpan"), "dark");
}

/* ---------- unduh Excel ---------- */

/* Baris lembar Excel -- susunan kolomnya SAMA dengan berkas yang selama
   ini dipakai (NO, DESCRIPTION, SPECIFICATION OF GOODS, UoM, QTTY, USED,
   REMAIN, PIB AJU), jadi hasil unduhan bisa langsung menggantikannya. */
function mstBarisExcel(baris) {
  return baris.map((b) => {
    const rujukan = [...new Set(b.realisasi.map((u) => String(u.aju_ref || "").trim()).filter(Boolean))];
    const aju = rujukan.join(" / ");
    return [b.no, b.nama, b.spesifikasi, b.satuan, b.kuota, b.terpakai, b.sisa, /^\d{1,15}$/.test(aju) ? Number(aju) : aju];
  });
}

const MST_BULAN_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function mstNamaBerkas(iso) {
  const d = parseLocalDate(iso) || new Date();
  return `LAST UPDATE QUOTA MASTER LIST DDI ${String(d.getDate()).padStart(2, "0")} ${MST_BULAN_EN[d.getMonth()]} ${d.getFullYear()}.xlsx`;
}

async function mstUnduhExcel() {
  const baris = mstSusun();
  if (!baris.length) {
    showToast(tt("Belum ada baris untuk diunduh.", "There are no lines to download."), "danger");
    return;
  }
  const tombol = $("#btnMstExcel");
  if (tombol) tombol.disabled = true;
  try {
    await ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "EXIM DDI";
    wb.created = new Date();
    const ws = wb.addWorksheet("Sheet1");
    // Kolom A kosong, tabel mulai di B -- seperti berkas aslinya
    ws.columns = [{ width: 2 }, { width: 5 }, { width: 44 }, { width: 58 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 16 }];
    const tepi = { style: "thin", color: { argb: "FF000000" } };
    const bingkai = { top: tepi, left: tepi, bottom: tepi, right: tepi };
    const tulis = (nomorBaris, nilai, opsi) => {
      const o = opsi || {};
      nilai.forEach((v, i) => {
        const sel = ws.getCell(nomorBaris, i + 2);
        sel.value = v;
        sel.border = bingkai;
        sel.font = { name: "Calibri", size: 11, bold: !!o.tebal };
        // Uraian & spesifikasi rata kiri dan boleh membungkus; sisanya di tengah
        sel.alignment = { vertical: "middle", horizontal: o.tebal || (i !== 1 && i !== 2) ? "center" : "left", wrapText: i === 1 || i === 2 };
      });
    };
    tulis(1, ["NO", "DESCRIPTION", "SPECIFICATION OF GOODS", "UoM", "QTTY", "USED", "REMAIN", "PIB AJU"], { tebal: true });
    ws.getRow(1).height = 36;
    mstBarisExcel(baris).forEach((r, i) => {
      const n = i + 2;
      // REMAIN = QTTY - USED, sebagai rumus (dengan hasilnya) supaya tetap benar kalau berkasnya disunting
      tulis(n, r.slice(0, 6).concat([{ formula: `F${n}-G${n}`, result: r[6] }, r[7]]));
      ws.getRow(n).height = 30.75;
    });
    const akhir = baris.length + 1;
    const total = akhir + 1;
    const ring = mstRingkasan(baris);
    tulis(
      total,
      ["", "", "TOTAL", "", { formula: `SUM(F2:F${akhir})`, result: ring.kuota }, { formula: `SUM(G2:G${akhir})`, result: ring.terpakai }, { formula: `SUM(H2:H${akhir})`, result: ring.sisa }, ""],
      { tebal: true },
    );
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const tautan = document.createElement("a");
    tautan.href = URL.createObjectURL(blob);
    tautan.download = mstNamaBerkas(todayISO());
    document.body.appendChild(tautan);
    tautan.click();
    document.body.removeChild(tautan);
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
    showToast(tt(`Berkas Excel diunduh: ${mstFmt(baris.length)} baris.`, `Excel file downloaded: ${mstFmt(baris.length)} lines.`), "success");
  } catch (e) {
    console.error(e);
    showToast(tt("Berkas Excel gagal dibuat.", "The Excel file could not be created."), "danger");
  } finally {
    if (tombol) tombol.disabled = false;
  }
}

/* ---------- penangan ---------- */

/* Jadwal import dibuka di halaman Jadwal (panel detailnya hanya ada di
   sana, dan urutan telusurnya mengikuti daftar buku Import). */
function mstBukaJadwal(id) {
  if (!id) return;
  if (activeMode !== "import") switchMode("import");
  location.hash = "#/";
  setTimeout(() => openDetailView(id), 60);
}

/* Saringan berubah -> kembali ke halaman 1: halaman 3 dari hasil lama
   bisa jadi tidak ada lagi di hasil baru. */
function mstSaringUlang() {
  mstKeadaan.halaman = 1;
  renderMasterlist();
}

function mstKeDaftar() {
  const panel = $("#mstPanelDaftar");
  if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

const mstHalamanEl = $("#viewMasterlist");
if (mstHalamanEl) {
  mstHalamanEl.addEventListener("click", (e) => {
    const cari = (sel) => e.target.closest(sel);
    let el;

    if (cari("#btnMstCatat")) return mstBukaRealisasi();
    if (cari("#btnMstBaris")) return mstTambahBaris();
    if (cari("#btnMstDokumen")) return mstUbahDokumen();
    if (cari("#btnMstExcel")) return void mstUnduhExcel();
    if (cari("#btnMstMuat")) return void loadMasterlist();

    if ((el = cari("[data-mst-tampilan]"))) {
      if (mstKeadaan.tampilan === el.dataset.mstTampilan) return;
      mstKeadaan.tampilan = el.dataset.mstTampilan;
      return mstSaringUlang();
    }
    // Panel "Kuota yang masih tersedia": klik jenis -> daftar disaring ke jenis itu (klik lagi melepasnya)
    if ((el = cari("[data-mst-jenis]"))) {
      const pilih = { nama: el.dataset.mstJenis, lini: el.dataset.mstJenisLini };
      const sama = mstKeadaan.jenis && mstKeadaan.jenis.nama === pilih.nama && mstKeadaan.jenis.lini === pilih.lini;
      mstKeadaan.jenis = sama ? null : pilih;
      mstKeadaan.tampilan = "baris";
      mstSaringUlang();
      if (!sama) mstKeDaftar();
      return;
    }
    if (cari("[data-mst-lepas-jenis]")) {
      mstKeadaan.jenis = null;
      return mstSaringUlang();
    }
    if (cari("[data-mst-semua-jenis]")) {
      mstKeadaan.semuaJenis = !mstKeadaan.semuaJenis;
      return renderMasterlist();
    }
    if ((el = cari("[data-mst-lihat-status]"))) {
      mstKeadaan.jenis = null;
      mstKeadaan.tampilan = "baris";
      $("#mstSearch").value = "";
      $("#mstStatus").value = el.dataset.mstLihatStatus;
      mstSaringUlang();
      return mstKeDaftar();
    }
    if ((el = cari("[data-mst-buka]"))) {
      const kunci = el.dataset.mstBuka;
      if (mstKeadaan.terbuka.has(kunci)) mstKeadaan.terbuka.delete(kunci);
      else mstKeadaan.terbuka.add(kunci);
      return renderMasterlist();
    }
    if ((el = cari("[data-mst-jadwal]"))) return mstBukaJadwal(el.dataset.mstJadwal);
    if ((el = cari("[data-mst-catat-jadwal]"))) {
      const s = ((data && data.import) || []).find((x) => x.id === el.dataset.mstCatatJadwal);
      if (!s) return;
      // Yang tidak mengubah data membuka jadwalnya; EXIM langsung mencatat
      if (!canEdit()) return mstBukaJadwal(s.id);
      const barang = mstBarangMasterlist(s)
        .map((it) => `${itemDisplayName(it)} (${mstFmt(it.qty)} ${it.satuan || ""})`.replace(/\s+\)/, ")"))
        .join(", ");
      return mstBukaRealisasi({
        aju: s.noAju || "",
        ket: tt(`${dispVal(s.party)} — barang berfasilitas Masterlist: ${barang}.`, `${dispVal(s.party)} — items under the Masterlist facility: ${barang}.`),
      });
    }
    if ((el = cari("[data-mst-catat]"))) return mstBukaRealisasi({ itemId: el.dataset.mstCatat });
    if ((el = cari("[data-mst-ubah-realisasi]"))) {
      const u = mstRealisasiDb.find((x) => x.id === el.dataset.mstUbahRealisasi);
      return u ? mstBukaRealisasi({ realisasi: u }) : undefined;
    }
    if ((el = cari("[data-mst-hapus-realisasi]"))) return mstHapusRealisasi(el.dataset.mstHapusRealisasi);
    if ((el = cari("[data-mst-ubah-baris]"))) return mstUbahBaris(el.dataset.mstUbahBaris);
    if ((el = cari("[data-mst-hapus-baris]"))) return mstHapusBaris(el.dataset.mstHapusBaris);
    if ((el = cari("[data-mstpage]"))) {
      mstKeadaan.halaman = Number(el.dataset.mstpage);
      return renderMasterlist();
    }
    if ((el = cari("[data-mstnav]"))) {
      mstKeadaan.halaman += el.dataset.mstnav === "next" ? 1 : -1;
      return renderMasterlist();
    }
  });
  mstHalamanEl.addEventListener("change", (e) => {
    if (e.target.id === "mstStatus" || e.target.id === "mstLini") return mstSaringUlang();
    if (e.target.id === "mstPageSize") {
      mstKeadaan.perHalaman = Number(e.target.value) || 25;
      mstSaringUlang();
    }
  });
  const mstSearchEl = $("#mstSearch");
  if (mstSearchEl) mstSearchEl.addEventListener("input", mstSaringUlang);
}

if (mstModalEl) {
  mstModalEl.addEventListener("click", (e) => {
    if (e.target.closest("#btnMstSimpanRealisasi")) return void mstSimpanRealisasi();
    if (e.target.closest("#btnMstPilihTambah")) {
      mstBacaPilih();
      mstForm.baris.push({ itemId: "", qty: "" });
      return mstGambarPilih();
    }
    const hapus = e.target.closest("[data-mst-pilih-hapus]");
    if (hapus) {
      mstBacaPilih();
      mstForm.baris.splice(Number(hapus.closest("[data-mst-pilih]").dataset.mstPilih), 1);
      mstGambarPilih();
    }
  });
  mstModalEl.addEventListener("change", (e) => {
    if (!e.target.matches("[data-mst-pilih-baris]") || !mstForm) return;
    mstBacaPilih();
    // Baris baru dipilih: jumlah awalnya 1 (atau sisanya), kecuali sudah diisi dan masih muat
    $("#mstRealisasiGalat").classList.add("d-none");
    const x = mstForm.baris[Number(e.target.closest("[data-mst-pilih]").dataset.mstPilih)];
    const b = mstSusun().find((r) => r.id === x.itemId);
    if (b && !(Number(x.qty) > 0 && Number(x.qty) <= mstBatas(b))) x.qty = String(Math.min(1, mstBatas(b)));
    mstGambarPilih();
  });
  mstModalEl.addEventListener("input", (e) => {
    // Pesan galat milik isian yang lama: begitu ada yang diubah, ia tidak berlaku lagi
    $("#mstRealisasiGalat").classList.add("d-none");
    if (e.target.id === "mstAju") mstGambarKetAju();
  });
  mstModalEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) {
      e.preventDefault();
      mstSimpanRealisasi();
    }
  });
}
