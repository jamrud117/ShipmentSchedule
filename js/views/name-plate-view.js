"use strict";

/* ==================================================================
   HALAMAN NAME PLATE & BERAT PER BOX -- #/nameplate/<id nomor invoice>

   Dibuka dari tombol label (bi-tags) di riwayat invoice Kumho, halaman
   Nomor Dokumen. Satu tabel seperti tabel bantu buku kerja CIPL Kumho
   -- satu baris per box: Carton No., Pattern, Size, Mold No (dari barang
   jadwal yang ditautkan), lalu Tread, Side, B/R, BOX & tanggal selesai
   produksi yang diisi; N/W, GW, dan Net/Gross Wt. Packing List dihitung
   langsung. Hitungan, cetakan & Excel: features/name-plate.js.

   MENGISI SECEPAT MUNGKIN
     - UPLOAD EXCEL (tombol di kepala tabel, atau berkasnya diseret ke
       panel tabel): buku kerja CIPL Kumho -- tabel berat di lembar PL --
       atau tabel berat dari produksi; tabelnya dicari sendiri di semua
       lembar (npXlTabelBerat) lalu diisikan seperti tempelan. Isian yang
       sudah diketik & akan berubah ditanyakan dulu.
     - Tabel berat dari produksi biasanya sudah ada di Excel: salin
       blok selnya (boleh dengan baris judulnya, boleh seluruh kolom
       Carton No. s.d. FINISHED DATE OF PRODUCTION) lalu tempel di kotak
       mana pun -- baris dicocokkan lewat Carton No., lalu Pattern / Size
       / Mold No, baru urutan. Tanpa judul: diisi mulai kotak yang dipilih,
       ke kanan & ke bawah (npTerapkanTempelan).
     - Kotak boleh berisi penjumlahan ("126+127", "16.73+16.32+...").
     - BOX & tanggal produksi biasanya sama untuk semua box: tombol
       "samakan" di judul kolomnya (di kartu layar sempit: di kartu baris 1)
       menyalin baris 1 ke semua baris.
     - Enter = kotak yang sama di baris berikutnya (Shift+Enter: ke atas).
     - Tombol ? di kepala tabel membuka "Cara kerja" (#npPanduanModal,
       index.html) -- pengganti kalimat petunjuk panjang yang dulu di sana.

   SIMPAN = dua hal sekaligus:
     1. isiannya ke payload nomor invoice (`namePlate`) -- dibaca ulang
        dari database tepat sebelum menulis, isian lain tidak tertimpa;
     2. Netto & Bruto barang jadwal yang ditautkan disamakan dengan
        angka Packing List-nya (per set x Qty, dibulatkan) -- jadi kartu
        jadwal, Cek PIB/PEB, templat salin & Shipping Instruction memakai
        angka yang sama dengan PL. Hanya kolom netto & bruto barang yang
        berubah yang ditulis (npSelaraskanJadwal).
   Packing List Kumho sendiri selalu membaca tabel ini (npBeratPl), jadi
   PL & name plate tidak bisa berbeda walau langkah 2 gagal.

   Isian yang belum disimpan tetap ada selama aplikasi terbuka -- pindah
   halaman lalu kembali ke nomor yang sama tidak menghapusnya. Semua
   peran yang boleh membuka Nomor Dokumen boleh melihat & mencetak;
   mengisi & menyimpan khusus EXIM.
================================================================== */

let npHal = null;
// Urutan kotak isian per baris: arah tempelan tanpa judul & tombol samakan
const NP_KOLOM_KETIK = ["tread", "side", "br", "box", "tanggal"];
const NP_LABEL_KOLOM = { tread: "Tread", side: "Side", br: "B/R", box: "BOX", get tanggal() { return tt("Tanggal produksi", "Production date"); } };

const npEl = (id) => document.getElementById(id);
const npBolehUbah = () => typeof canEdit !== "function" || canEdit();
const npJadwal = () => (npHal && npHal.row && typeof ciplCariShipment === "function" ? ciplCariShipment((npHal.row.payload || {}).shipmentId) : null);
const npSidikBarang = (items) => (items || []).map((it) => kunciAlnum(itemDisplayName(it))).join("|");
// Isian halaman dalam bentuk tersimpan (npBentukSimpan) -- dasar model, PL & cetakan
const npSimpanSekarang = () => npBentukSimpan(npHal.items, npHal.isian, npHal);
const npModelHalaman = () => npModel(npHal.row, npJadwal(), npSimpanSekarang());

/* ---------------- MEMBUKA ---------------- */

async function npAmbilBaris(id) {
  const { data, error } = await supabaseClient
    .from("document_numbers")
    .select("id, doc_type, doc_number, doc_date, requester, department, seq, payload, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/* Dipanggil router (form-router.js). Tiga keadaan:
     - halaman ini sedang tampil untuk nomor yang sama (router dipanggil
       lagi sesudah jadwal termuat): cukup barang jadwalnya disegarkan;
     - kembali ke nomor yang sama dengan isian belum disimpan: isiannya
       dipertahankan;
     - selain itu: nomornya dibaca dari database (versi terbaru). */
async function bukaHalamanNamePlate(id) {
  const view = npEl("viewNamePlate");
  const sudahTampil = !!view && !view.classList.contains("d-none");
  showPage("nameplate");
  if (typeof paintTodayStamps === "function") paintTodayStamps();
  const sama = !!npHal && npHal.id === String(id);
  // Masih dibaca (router dipanggil lagi selagi menunggu), atau sedang tampil / berisi ketikan
  if (sama && (npHal.memuat || (npHal.row && (sudahTampil || npHal.kotor)))) {
    npGambar();
    return;
  }
  window.scrollTo(0, 0);
  npHal = { id: String(id), row: null, memuat: true, galat: "", items: [], isian: [], material: "", edisi: "", sisi: NP_BAWAAN.sisi, kotor: false, sibuk: false, mengunggah: false, diubahLain: "" };
  npGambar();
  try {
    const row = await npAmbilBaris(id);
    if (!npHal || npHal.id !== String(id)) return; // sudah pindah ke nomor / halaman lain
    npHal.memuat = false;
    if (row) npMulai(row);
    else npHal.galat = tt("Nomor invoice ini tidak ditemukan — mungkin sudah dihapus.", "This invoice number was not found — it may have been deleted.");
  } catch (err) {
    console.error(err);
    if (!npHal || npHal.id !== String(id)) return;
    npHal.memuat = false;
    npHal.galat = tt(`Gagal memuat nomor invoice: ${(err && err.message) || "kesalahan tidak diketahui"}`, `Failed to load the invoice number: ${(err && err.message) || "unknown error"}`);
  }
  npGambar();
}

// Isian halaman dari baris nomor invoice (payload.namePlate)
function npMulai(row) {
  npHal.row = row;
  const simpan = (row.payload || {}).namePlate || {};
  npHal.material = npTeks(simpan.material) || NP_BAWAAN.material;
  npHal.edisi = npTeks(simpan.edisi) || NP_BAWAAN.edisi;
  npHal.sisi = npSisi(simpan.sisi);
  npSusunIsian(simpan);
  npHal.kotor = false;
  npHal.diubahLain = "";
  npHal.barisTerbaru = null;
}

function npSusunIsian(simpan) {
  const items = npBarang(npJadwal());
  const tersimpan = npCocokkan(simpan, items);
  npHal.items = items;
  npHal.isian = items.map((_, i) => npIsianBaris(tersimpan[i]));
}

/* BARANG JADWAL BERUBAH (jadwal baru termuat, diubah di form, realtime):
   isian disusun ulang per barang -- yang sedang diketik ikut barangnya
   (dicocokkan lewat nama, npCocokkan), yang belum diketik dari payload. */
function npSegarkanJadwal() {
  if (!npHal || !npHal.row) return;
  const items = npBarang(npJadwal());
  if (npSidikBarang(items) === npSidikBarang(npHal.items) && items.length === npHal.isian.length) {
    npHal.items = items; // Netto/Bruto barang bisa saja berubah: objek terbarunya yang dipakai
    return;
  }
  const sumber = npHal.kotor ? npSimpanSekarang() : (npHal.row.payload || {}).namePlate || {};
  npSusunIsian(sumber);
}

/* ---------------- MENGGAMBAR ---------------- */

function npGambar() {
  if (!npHal || !npEl("viewNamePlate")) return;
  npSegarkanJadwal();
  const model = npHal.row ? npModelHalaman() : null;
  npGambarKepala(model);
  npGambarKabar(model);
  const isi = npEl("npIsi");
  if (isi) isi.hidden = !npIsiTampil(model);
  npGambarTabel(model);
  npGambarAtur(model);
  npGambarAksi(model);
}

// Tabel & name plate hanya untuk invoice Kumho yang jadwalnya termuat & berbarang
const npIsiTampil = (model) => !!(model && model.prof.namePlate && model.baris.length);

function npGambarKepala(model) {
  const judul = npEl("npJudul");
  const sub = npEl("npSub");
  if (!judul || !sub) return;
  if (!model) {
    judul.textContent = npHal.memuat ? tt("Memuat…", "Loading…") : "—";
    sub.innerHTML = `<b>${escapeHtml(tt("Berat per box & name plate", "Weight per box & name plate"))}</b>`;
    return;
  }
  const p = model.row.payload || {};
  judul.textContent = model.row.doc_number || "—";
  const s = model.shipment;
  const kapal = s && typeof carrierCipl === "function" ? carrierCipl(p, s) : "";
  /* Tiap keterangan berikon sendiri (bukan dipisah titik): di layar sempit
     yang turun baris satu keterangan utuh, tanpa titik yang menggantung. */
  const bagian = [
    ["bi-building", tt("Customer", "Customer"), p.customer || (s && s.party) || ""],
    ["bi-calendar3", tt("Tanggal invoice", "Invoice date"), model.row.doc_date ? fmtDate(model.row.doc_date) : ""],
    ["bi-water", tt("Kapal", "Vessel"), kapal],
    ["bi-box-arrow-up-right", "ETD", s && s.etd ? `ETD ${fmtDate(s.etd)}` : ""],
  ].filter((x) => x[2]);
  // Tujuan halaman di depan: eyebrow di atas judul (.board-label) sengaja disembunyikan sistem tampilan
  sub.innerHTML = `<b class="np-sub-judul">${escapeHtml(tt("Berat per box & name plate", "Weight per box & name plate"))}</b>` +
    bagian.map(([ikon, label, isi]) => `<span class="np-meta" title="${escapeAttr(label)}"><i class="bi ${ikon}" aria-hidden="true"></i><span>${escapeHtml(isi)}</span></span>`).join("");
}

function npKabarHtml(jenis, ikon, teks, tombol) {
  return `<div class="np-kabar np-kabar--${jenis}"><i class="bi ${ikon}" aria-hidden="true"></i><div class="np-kabar-teks">${teks}</div>${tombol || ""}</div>`;
}

function npGambarKabar(model) {
  const el = npEl("npKabar");
  if (!el) return;
  const kabar = [];
  if (npHal.memuat) kabar.push(npKabarHtml("info", "bi-arrow-repeat", escapeHtml(tt("Memuat nomor invoice…", "Loading the invoice number…"))));
  if (npHal.galat) kabar.push(npKabarHtml("bahaya", "bi-exclamation-octagon", escapeHtml(npHal.galat)));
  if (npHal.diubahLain === "hapus") {
    kabar.push(npKabarHtml("bahaya", "bi-trash3", tt("<b>Nomor invoice ini baru saja dihapus pengguna lain.</b> Isian di halaman ini tidak bisa disimpan lagi.", "<b>This invoice number was just deleted by another user.</b> This page can no longer be saved.")));
  } else if (npHal.diubahLain === "ubah") {
    kabar.push(npKabarHtml("info", "bi-people",
      tt("<b>Nomor invoice ini baru saja diubah pengguna lain.</b> Kalau disimpan, isian di halaman ini yang dipakai.", "<b>This invoice number was just changed by another user.</b> Saving keeps what is on this page."),
      `<button type="button" class="btn btn-form-cancel btn-sm" data-np-muat-terbaru>${escapeHtml(tt("Muat versi terbaru", "Load latest version"))}</button>`));
  }
  if (model) {
    const p = model.row.payload || {};
    if (!model.prof.namePlate) {
      kabar.push(npKabarHtml("info", "bi-info-circle", escapeHtml(tt("Name plate & tabel berat per box hanya untuk CIPL Kumho — customer invoice ini memakai bentuk CIPL lain.", "Name plates & the weight-per-box table are only for Kumho CIPLs — this invoice's customer uses another CIPL layout."))));
    } else if (!p.shipmentId) {
      kabar.push(npKabarHtml("peringatan", "bi-link-45deg", escapeHtml(tt("Invoice ini belum ditautkan ke jadwal export. Box, Pattern, Size & Mold No diambil dari barang jadwal — tautkan dulu lewat Perbaiki isian di riwayat invoice.", "This invoice is not linked to an export schedule yet. Boxes, Pattern, Size & Mold No come from the schedule's items — link it first via Edit fields in the invoice history."))));
    } else if (!model.shipment) {
      kabar.push(typeof shipmentsLoaded !== "undefined" && !shipmentsLoaded
        ? npKabarHtml("info", "bi-arrow-repeat", escapeHtml(tt("Memuat jadwal yang ditautkan…", "Loading the linked schedule…")))
        : npKabarHtml("peringatan", "bi-exclamation-triangle", escapeHtml(tt("Jadwal yang ditautkan ke invoice ini tidak ditemukan di daftar jadwal.", "The schedule linked to this invoice was not found in the schedule list."))));
    } else if (!model.baris.length) {
      kabar.push(npKabarHtml("peringatan", "bi-exclamation-triangle", escapeHtml(tt("Jadwal yang ditautkan belum berisi barang.", "The linked schedule has no items yet."))));
    } else {
      const n = model.baris.length;
      const tanpaBerat = n - model.total.berat;
      const tanpaTanggal = n - model.total.tanggal;
      const salah = model.baris.filter((b) => b.hitung.salah.length).length;
      if (salah) {
        kabar.push(npKabarHtml("bahaya", "bi-exclamation-octagon", escapeHtml(tt(`${salah} baris berisi angka / rumus yang tidak terbaca (ditandai merah). Contoh yang benar: 132.49 atau 126+127.`, `${salah} row(s) contain an unreadable number / formula (marked red). Valid examples: 132.49 or 126+127.`))));
      }
      const beda = model.baris.filter(npBedaJadwal).length;
      if (beda && npBolehUbah()) {
        kabar.push(npKabarHtml("info", "bi-arrow-left-right", escapeHtml(tt(
          `Netto/Bruto ${beda} barang di jadwal belum sama dengan angka Packing List-nya (keterangan "jadwal" di kolom Packing List) — disamakan saat Simpan.`,
          `The schedule's Net/Gross of ${beda} item(s) do not match their Packing List figures yet ("schedule" note in the Packing List column) — they are matched on Save.`))));
      }
      if ((tanpaBerat || tanpaTanggal) && (model.total.berat || model.total.tanggal)) {
        const apa = [
          tanpaBerat ? tt(`${tanpaBerat} barang belum berisi berat (PL memakai Netto/Bruto jadwal, WEIGHT di name plate kosong)`, `${tanpaBerat} item(s) have no weights yet (the PL uses the schedule's Net/Gross, WEIGHT on the name plate stays blank)`) : "",
          tanpaTanggal ? tt(`${tanpaTanggal} barang belum bertanggal produksi`, `${tanpaTanggal} item(s) have no production date`) : "",
        ].filter(Boolean).join(tt("; ", "; "));
        kabar.push(npKabarHtml("peringatan", "bi-exclamation-triangle", escapeHtml(apa + ".")));
      }
    }
  }
  el.innerHTML = kabar.join("");
}

/* ---------------- TABEL ---------------- */

/* Sel tabel. `kelas` memuat np-a-<kolom>: letak sel di kartu layar sempit
   (grid-area, docnum.css) -- tidak bergantung pada urutan / jumlah sel. */
const npSel = (label, isi, kelas) => `<td${kelas ? ` class="${kelas}"` : ""} data-label="${escapeAttr(label)}">${isi}</td>`;
const npStrip = '<span class="np-redup">—</span>';

/* Deret "Samakan baris 1 ke semua" di atas kartu (BOX & tanggal): di bentuk
   kartu judul kolom -- tempat tombol samakan tabel -- tidak tampil. CSS-nya
   hanya menampilkannya di bentuk kartu (container query, docnum.css). */
function npSamakanBarisHtml(ubah) {
  if (!ubah || npHal.isian.length < 2) return "";
  const pil = (k) => `<button type="button" class="np-samakan-pil" data-np-samakan="${k}"><i class="bi bi-arrow-down-square" aria-hidden="true"></i> ${escapeHtml(NP_LABEL_KOLOM[k])}</button>`;
  return `<div class="np-samakan-baris"><span>${escapeHtml(tt("Samakan baris 1 ke semua:", "Copy row 1 to every row:"))}</span>${pil("box")}${pil("tanggal")}</div>`;
}

// Kotak isian satu kolom satu baris; rumus yang terbaca menampilkan hasilnya di bawah
function npKotakHtml(b, i, k, ubah) {
  const label = NP_LABEL_KOLOM[k];
  const nilai = b.isian[k];
  const aria = `${label} ${b.marks}`;
  if (k === "tanggal") {
    return `<input type="date" class="np-in np-in-tgl" data-np-i="${i}" data-np-k="tanggal" value="${escapeAttr(nilai)}" aria-label="${escapeAttr(aria)}"${ubah ? "" : " readonly"}>`;
  }
  const salah = b.hitung.salah.includes(k);
  const hasil = !salah && npAdaRumus(nilai) && b.hitung[k] != null ? `= ${npAngkaTeks(b.hitung[k])}` : salah ? tt("tidak terbaca", "unreadable") : "";
  return `<input type="text" class="np-in${salah ? " is-salah" : ""}" data-np-i="${i}" data-np-k="${k}" value="${escapeAttr(nilai)}" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="${escapeAttr(aria)}"${salah ? ' aria-invalid="true"' : ""}${ubah ? "" : " readonly"}>` +
    `<small class="np-hasil${salah ? " is-salah" : ""}" data-np-hasil="${k}">${escapeHtml(hasil)}</small>`;
}

/* Kolom Packing List: angka bulat yang tercetak (per set x Qty). Belum
   berisi berat = Netto/Bruto jadwal (dibulatkan), redup. Jadwal yang
   berbeda dari PL disebut -- Simpan akan menyamakannya. */
function npPlHtml(b, pl) {
  const angka = `<b>${escapeHtml(npBulatTeks(pl.netto))}</b> <span class="np-redup">/</span> <b>${escapeHtml(npBulatTeks(pl.bruto))}</b>`;
  if (!b.pl) return `<span class="np-pl-jadwal">${angka}</span><small class="np-ket">${escapeHtml(tt("dari jadwal", "from schedule"))}</small>`;
  return angka + (npBedaJadwal(b)
    ? `<small class="np-ket np-ket--beda" title="${escapeAttr(tt("Netto / Bruto barang ini di jadwal — disamakan dengan angka PL saat Simpan", "This item's Net / Gross in the schedule — matched to the PL figures on Save"))}">${escapeHtml(tt(`jadwal ${npAngkaTeksRingkas(b.jadwal.netto)} / ${npAngkaTeksRingkas(b.jadwal.bruto)}`, `schedule ${npAngkaTeksRingkas(b.jadwal.netto)} / ${npAngkaTeksRingkas(b.jadwal.bruto)}`))}</small>`
    : "");
}
// Netto/Bruto barang jadwal berbeda dari angka PL-nya (disamakan saat Simpan)
const npBedaJadwal = (b) => !!b.pl && (Math.abs(b.pl.netto - b.jadwal.netto) > 1e-9 || Math.abs(b.pl.bruto - b.jadwal.bruto) > 1e-9);
// 424.49 / 424 / 0 -- desimal hanya bila ada
const npAngkaTeksRingkas = (v) => angkaLokal(Number(v) || 0, "en-US", { maximumFractionDigits: 2 });

function npBarisHtml(b, i, pl, ubah) {
  const boxKet = b.box === 1 ? "" : b.box > 1
    ? `<small class="np-ket">${escapeHtml(tt(`${b.box} box`, `${b.box} boxes`))}</small>`
    : `<small class="np-ket">${escapeHtml(tt("ikut box di atas", "shares the box above"))}</small>`;
  return `<tr data-np-baris="${i}">
    <td class="np-c-no" data-label="No">${i + 1}</td>
    ${npSel("Carton No.", `<b class="np-marks">${escapeHtml(b.marks)}</b>${boxKet}`, "np-c-marks np-a-carton")}
    ${npSel("Pattern", b.id.pattern ? escapeHtml(b.id.pattern) : npStrip, "np-c-id np-a-pattern")}
    ${npSel("Size", b.id.size ? escapeHtml(b.id.size) : npStrip, "np-c-id np-a-size")}
    ${npSel("Mold No", b.id.mold ? escapeHtml(b.id.mold) : npStrip, "np-c-id np-a-mold")}
    ${["tread", "side", "br", "box"].map((k) => npSel(NP_LABEL_KOLOM[k], npKotakHtml(b, i, k, ubah), `np-c-isi np-a-${k}`)).join("")}
    ${npSel("N/W", b.hitung.nw == null ? npStrip : escapeHtml(npAngkaTeks(b.hitung.nw)), "np-c-hit np-a-nw")}
    ${npSel("GW", b.hitung.gw == null ? npStrip : escapeHtml(npAngkaTeks(b.hitung.gw)), "np-c-hit np-a-gw")}
    ${npSel(NP_LABEL_KOLOM.tanggal, npKotakHtml(b, i, "tanggal", ubah), "np-c-tgl np-a-tgl")}
    ${npSel(tt("Packing List (KG)", "Packing List (KG)"), npPlHtml(b, pl), "np-c-pl np-a-pl")}
  </tr>`;
}

function npTombolSamakan(k) {
  if (!npBolehUbah()) return "";
  const label = NP_LABEL_KOLOM[k];
  const judul = tt(`Samakan ${label} baris 1 ke semua baris`, `Copy row 1's ${label} to every row`);
  return `<button type="button" class="np-samakan" data-np-samakan="${k}" title="${escapeAttr(judul)}" aria-label="${escapeAttr(judul)}"><i class="bi bi-arrow-down-square" aria-hidden="true"></i></button>`;
}

function npKakiHtml(model, pl) {
  const tot = model.total;
  const n = pl.reduce((x, b) => x + b.netto, 0);
  const g = pl.reduce((x, b) => x + b.bruto, 0);
  return `<tr>
    <th colspan="5" scope="row" class="np-kaki-judul">TOTAL <span class="np-kaki-ket">${escapeHtml(tt(`${tot.box} box · ${tot.plat} name plate`, `${tot.box} boxes · ${tot.plat} name plates`))}</span></th>
    <td colspan="4" class="np-kaki-kosong"></td>
    <td class="np-c-hit np-a-nw" data-label="N/W">${tot.berat ? escapeHtml(npAngkaTeks(tot.nw)) : npStrip}</td>
    <td class="np-c-hit np-a-gw" data-label="GW">${tot.berat ? escapeHtml(npAngkaTeks(tot.gw)) : npStrip}</td>
    <td class="np-kaki-kosong"></td>
    <td class="np-c-pl np-a-pl" data-label="${escapeAttr(tt("Packing List (KG)", "Packing List (KG)"))}"><b>${escapeHtml(npBulatTeks(n))}</b> <span class="np-redup">/</span> <b>${escapeHtml(npBulatTeks(g))}</b></td>
  </tr>`;
}

function npGambarTabel(model) {
  const wadah = npEl("npTabel");
  if (!wadah) return;
  if (!npIsiTampil(model)) {
    wadah.innerHTML = "";
    return;
  }
  // Kotak yang sedang diketik tetap terpilih sesudah tabelnya digambar ulang (realtime, tempel)
  const aktif = document.activeElement;
  const fokus = aktif && aktif.classList && aktif.classList.contains("np-in") && wadah.contains(aktif)
    ? { i: aktif.dataset.npI, k: aktif.dataset.npK, a: aktif.selectionStart, z: aktif.selectionEnd }
    : null;
  const ubah = npBolehUbah() && !npHal.sibuk && npHal.diubahLain !== "hapus";
  const pl = npBeratPl(model.row, model.shipment, npSimpanSekarang());
  wadah.innerHTML = `${npSamakanBarisHtml(ubah)}<table class="np-tabel">
    <thead><tr>
      <th class="np-c-no" scope="col">No</th>
      <th scope="col">Carton No.</th>
      <th scope="col">Pattern</th>
      <th scope="col">Size</th>
      <th scope="col">Mold No</th>
      <th class="np-c-isi" scope="col">Tread</th>
      <th class="np-c-isi" scope="col">Side</th>
      <th class="np-c-isi" scope="col">B/R</th>
      <th class="np-c-isi" scope="col"><span class="np-th">BOX ${npTombolSamakan("box")}</span></th>
      <th class="np-c-hit" scope="col">N/W</th>
      <th class="np-c-hit" scope="col">GW</th>
      <th class="np-c-tgl" scope="col"><span class="np-th">${escapeHtml(NP_LABEL_KOLOM.tanggal)} ${npTombolSamakan("tanggal")}</span></th>
      <th class="np-c-pl" scope="col">${escapeHtml(tt("Packing List (KG)", "Packing List (KG)"))}<small>${escapeHtml(tt("Net / Gross, dibulatkan", "Net / Gross, rounded"))}</small></th>
    </tr></thead>
    <tbody>${model.baris.map((b, i) => npBarisHtml(b, i, pl[i], ubah)).join("")}</tbody>
    <tfoot>${npKakiHtml(model, pl)}</tfoot>
  </table>`;
  if (fokus) {
    const el = wadah.querySelector(`.np-in[data-np-i="${fokus.i}"][data-np-k="${fokus.k}"]`);
    if (el) {
      el.focus();
      try {
        if (fokus.a != null) el.setSelectionRange(fokus.a, fokus.z);
      } catch (err) {
        /* kotak tanggal: seleksinya diatur kotaknya sendiri */
      }
    }
  }
}

/* Satu baris diketik: yang dihitung saja yang diganti (hasil rumus, N/W,
   GW, Packing List, total) -- kotak isiannya tidak digambar ulang, jadi
   kursor tidak meloncat. */
function npPerbaruiBaris(i) {
  const wadah = npEl("npTabel");
  const tr = wadah && wadah.querySelector(`tr[data-np-baris="${i}"]`);
  const model = npModelHalaman();
  const b = model.baris[i];
  if (!tr || !b) return npGambar();
  ["tread", "side", "br", "box"].forEach((k) => {
    const el = tr.querySelector(`.np-in[data-np-k="${k}"]`);
    const hasil = tr.querySelector(`[data-np-hasil="${k}"]`);
    const salah = b.hitung.salah.includes(k);
    if (el) {
      el.classList.toggle("is-salah", salah);
      if (salah) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    }
    if (hasil) {
      hasil.classList.toggle("is-salah", salah);
      hasil.textContent = !salah && npAdaRumus(b.isian[k]) && b.hitung[k] != null ? `= ${npAngkaTeks(b.hitung[k])}` : salah ? tt("tidak terbaca", "unreadable") : "";
    }
  });
  const pl = npBeratPl(model.row, model.shipment, npSimpanSekarang());
  const sel = tr.querySelectorAll("td.np-c-hit");
  if (sel[0]) sel[0].innerHTML = b.hitung.nw == null ? npStrip : escapeHtml(npAngkaTeks(b.hitung.nw));
  if (sel[1]) sel[1].innerHTML = b.hitung.gw == null ? npStrip : escapeHtml(npAngkaTeks(b.hitung.gw));
  const selPl = tr.querySelector("td.np-c-pl");
  if (selPl) selPl.innerHTML = npPlHtml(b, pl[i]);
  const kaki = wadah.querySelector("tfoot");
  if (kaki) kaki.innerHTML = npKakiHtml(model, pl);
  npGambarKabar(model);
  npGambarAtur(model);
  npGambarAksi(model);
}

/* ---------------- NAME PLATE: PENGATURAN & CONTOH ---------------- */

function npGambarAtur(model) {
  const tampil = npIsiTampil(model);
  [["npMaterial", npHal.material], ["npEdisi", npHal.edisi], ["npSisi", String(npHal.sisi)]].forEach(([id, nilai]) => {
    const el = npEl(id);
    if (!el) return;
    if (document.activeElement !== el) el.value = nilai;
    el.readOnly = !npBolehUbah() || npHal.sibuk;
  });
  const jumlah = npEl("npJumlahPlat");
  const contoh = npEl("npContoh");
  if (!tampil) {
    if (jumlah) jumlah.textContent = "";
    if (contoh) contoh.innerHTML = "";
    return;
  }
  const tot = model.total;
  const lembar = Math.ceil(tot.plat / NP_PER_HALAMAN);
  if (jumlah) {
    jumlah.textContent = tt(`${tot.box} box × ${model.sisi} copy = ${tot.plat} name plate · ${lembar} lembar A4`,
      `${tot.box} box(es) × ${model.sisi} copies = ${tot.plat} name plates · ${lembar} A4 sheet(s)`);
  }
  if (contoh) contoh.innerHTML = npContohHtml(model);
}

/* Contoh satu name plate -- box pertama yang sudah berisi berat (atau box
   pertama), bentuk yang sama dengan cetakannya. */
function npContohHtml(model) {
  const b = model.baris.find((x) => x.hitung.nw != null && x.plat) || model.baris.find((x) => x.plat) || model.baris[0];
  if (!b) return "";
  const isi = npIsiPlat(b, model);
  const sel = ([label, nilai]) => `<td><span>${escapeHtml(label)} : </span><b>${escapeHtml(nilai)}</b></td>`;
  return `<div class="np-contoh" aria-label="${escapeAttr(tt("Contoh name plate", "Name plate sample"))}">
      <table class="np-contoh-plat"><tbody>${[0, 1, 2, 3].map((k) => `<tr>${sel(isi.kiri[k])}${sel(isi.kanan[k])}</tr>`).join("")}</tbody></table>
      <div class="np-contoh-tag"><b>${escapeHtml(b.marks)}</b><small>1/${b.plat || model.sisi}</small></div>
    </div>
    <p class="np-contoh-ket">${escapeHtml(tt(
      `Dicetak ${model.sisi} copy per box — satu untuk tiap sisi — berurutan per box, ${NP_PER_HALAMAN} name plate per lembar A4. Kotak kanan = Carton No. penanda box & copy ke berapa.`,
      `Printed ${model.sisi} copies per box — one for each side — box by box, ${NP_PER_HALAMAN} name plates per A4 sheet. The right box = Carton No. marking the box & copy number.`))}</p>`;
}

/* ---------------- STATUS & TOMBOL ---------------- */

function npGambarAksi(model) {
  const status = npEl("npStatus");
  const simpan = npEl("btnNpSimpan");
  const cetak = npEl("btnNpCetak");
  const tampil = npIsiTampil(model);
  const ubah = npBolehUbah();
  if (simpan) {
    simpan.hidden = !ubah || !tampil;
    simpan.disabled = npHal.sibuk || npHal.diubahLain === "hapus";
    simpan.innerHTML = npHal.sibuk
      ? `<i class="bi bi-arrow-repeat spin" aria-hidden="true"></i> ${escapeHtml(tt("Menyimpan…", "Saving…"))}`
      : `<i class="bi bi-check2" aria-hidden="true"></i> ${escapeHtml(tt("Simpan", "Save"))}`;
  }
  if (cetak) cetak.disabled = !tampil || !model.total.plat || npHal.sibuk;
  const unggah = npEl("btnNpUnggah");
  if (unggah) {
    unggah.hidden = !ubah;
    unggah.disabled = !!(npHal.sibuk || npHal.mengunggah || npHal.diubahLain === "hapus");
    const isi = npHal.mengunggah
      ? `<i class="bi bi-arrow-repeat spin" aria-hidden="true"></i> <span>${escapeHtml(tt("Membaca…", "Reading…"))}</span>`
      : '<i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i> <span>Upload Excel</span>';
    if (unggah.innerHTML !== isi) unggah.innerHTML = isi;
  }
  if (!status) return;
  if (!tampil) {
    status.className = "form-validity";
    status.innerHTML = "";
    return;
  }
  const n = model.baris.length;
  const lengkap = `${escapeHtml(tt("Berat", "Weight"))} ${model.total.berat}/${n} · ${escapeHtml(tt("Tanggal", "Date"))} ${model.total.tanggal}/${n}`;
  if (!ubah) {
    status.className = "form-validity";
    status.innerHTML = `<i class="bi bi-eye" aria-hidden="true"></i> ${escapeHtml(tt("Lihat & cetak saja — mengubah khusus EXIM", "View & print only — editing is EXIM only"))} · ${lengkap}`;
  } else if (npHal.kotor) {
    status.className = "form-validity form-validity--warn";
    status.innerHTML = `<i class="bi bi-exclamation-circle" aria-hidden="true"></i> ${escapeHtml(tt("Belum disimpan", "Not saved yet"))} · ${lengkap}`;
  } else {
    status.className = "form-validity form-validity--ok";
    status.innerHTML = `<i class="bi bi-check-circle-fill" aria-hidden="true"></i> ${escapeHtml(npAdaIsian((model.row.payload || {}).namePlate) ? tt("Tersimpan", "Saved") : tt("Belum diisi", "Not filled in yet"))} · ${lengkap}`;
  }
}

/* ---------------- MENGETIK ---------------- */

function npTandaiKotor() {
  npHal.kotor = true;
}

function npKetik(el) {
  const i = Number(el.dataset.npI);
  const k = el.dataset.npK;
  if (!npHal || !npHal.isian[i] || !NP_ISIAN.includes(k)) return;
  // Kotak tanggal: el.value selalu "yyyy-mm-dd" / "" (date-input.js)
  const nilai = el.value;
  if (npHal.isian[i][k] === nilai) return;
  npHal.isian[i][k] = nilai;
  npTandaiKotor();
  npPerbaruiBaris(i);
}

function npPindahBaris(el, arah) {
  const i = Number(el.dataset.npI) + arah;
  const ke = npEl("npTabel").querySelector(`.np-in[data-np-i="${i}"][data-np-k="${el.dataset.npK}"]`);
  if (!ke) return false;
  ke.focus();
  if (typeof ke.select === "function") ke.select();
  return true;
}

/* ---------------- TEMPEL DARI EXCEL ---------------- */

// Teks salinan Excel -> baris x sel (baris kosong di ujung dibuang)
function npUraiTempelan(teks) {
  const baris = String(teks == null ? "" : teks).replace(/\r\n?/g, "\n").split("\n").map((b) => b.split("\t").map((x) => x.trim()));
  while (baris.length && baris[baris.length - 1].every((x) => !x)) baris.pop();
  return baris;
}

/* Judul kolom tabel berat (buku kerja Kumho & tabel dari produksi) ->
   kunci isian. Dibandingkan tanpa spasi & tanda baca: "Carton No." =
   "CARTONNO", "B/R" = "BR", "FINISHED DATE OF PRODUCTION" mengandung DATE. */
const NP_JUDUL_TEMPEL = [
  ["carton", /^(CARTON(NO|NUMBER)?|CNO|MARKS?(NOPKGS)?|NOPKGS)$/],
  ["pattern", /^(PATTERN|PTN)$/],
  ["size", /^SIZE$/],
  ["mold", /^MOLD(NO|NUMBER)?$/],
  ["tread", /^TREAD$/],
  ["side", /^SIDE$/],
  ["br", /^(BR|BEADRING)$/],
  ["box", /^BOX$/],
  ["nw", /^(NW|NETT?(WT|WEIGHT)?)$/],
  ["gw", /^(GW|GROSS(WT|WEIGHT)?)$/],
  ["tanggal", /(DATE|TANGGAL|PRODUCTION|PRODUKSI)/],
];
// Urutan kolom tabel berat lengkap tanpa judul (Carton No. ... FINISHED DATE)
const NP_URUTAN_LENGKAP = ["carton", "pattern", "size", "mold", "tread", "side", "br", "box", "nw", "gw", "tanggal"];

function npPetaJudul(sel) {
  const peta = {};
  sel.forEach((x, c) => {
    const kunci = kunciAlnum(x);
    if (!kunci) return;
    const hit = NP_JUDUL_TEMPEL.find(([k, re]) => !(k in peta) && re.test(kunci));
    if (hit) peta[hit[0]] = c;
  });
  return Object.keys(peta).length >= 2 ? peta : null;
}

// "C# : 14-1", "C#:14-1", "14-1" -> "14-1"
function npKunciCarton(s) {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(s || ""));
  return m ? `${Number(m[1])}-${Number(m[2])}` : kunciAlnum(s);
}

/* Isi tempelan ke isian halaman. Hasil: { terisi, takCocok: [teks],
   beda: [Carton No.], tanggalSalah: [teks] }.
     - ada baris judul (atau tabel lengkap 11 kolom berawalan Carton No.):
       tiap baris dicocokkan ke box lewat Carton No., lalu Pattern + Size
       + Mold No; tanpa keduanya = urutan. N/W & GW tempelan dibandingkan
       dengan hitungannya -- beda = kolom yang tergeser / salah salin.
     - tanpa judul: mulai kotak yang dipilih, ke kanan (Tread, Side, B/R,
       BOX, tanggal) & ke bawah. */
function npTerapkanTempelan(baris, iAwal, kAwal) {
  const hasil = { terisi: 0, takCocok: [], beda: [], tanggalSalah: [] };
  const model = npModelHalaman();
  const isi = (i, k, v) => {
    if (!npHal.isian[i] || !NP_ISIAN.includes(k)) return false;
    const teks = String(v == null ? "" : v).trim();
    if (k === "tanggal") {
      if (!teks) return false;
      const iso = typeof bacaTanggalKetik === "function" ? bacaTanggalKetik(teks) : /^\d{4}-\d{2}-\d{2}$/.test(teks) ? teks : "";
      if (!iso) {
        hasil.tanggalSalah.push(teks);
        return false;
      }
      npHal.isian[i].tanggal = iso;
      return true;
    }
    npHal.isian[i][k] = teks;
    return true;
  };

  let peta = null;
  let mulai = 0;
  for (let r = 0; r < Math.min(3, baris.length); r++) {
    peta = npPetaJudul(baris[r]);
    if (peta) {
      mulai = r + 1;
      break;
    }
  }
  const lengkap = !peta && baris[0] && baris[0].length >= 10 && /C\s*#|^\d+\s*-\s*\d+$/i.test(baris[0][0] || "");
  if (lengkap) peta = Object.fromEntries(NP_URUTAN_LENGKAP.map((k, c) => [k, c]));

  if (!peta) {
    // TANPA JUDUL: mulai kotak yang dipilih, ke kanan & ke bawah
    const c0 = Math.max(0, NP_KOLOM_KETIK.indexOf(kAwal));
    baris.forEach((sel, r) => {
      const i = iAwal + r;
      if (!npHal.isian[i]) {
        if (sel.some(Boolean)) hasil.takCocok.push(sel.join(" "));
        return;
      }
      let ada = false;
      sel.forEach((v, c) => {
        const k = NP_KOLOM_KETIK[c0 + c];
        if (k && v !== "" && isi(i, k, v)) ada = true;
      });
      if (ada) hasil.terisi++;
    });
    return hasil;
  }

  const dipakai = new Set();
  const ambil = (sel, k) => (peta[k] == null ? "" : String(sel[peta[k]] == null ? "" : sel[peta[k]]).trim());
  const sama = (a, b) => !a || kunciAlnum(a) === kunciAlnum(b);
  let urut = 0;
  baris.slice(mulai).forEach((sel) => {
    if (!sel.some(Boolean)) return;
    const carton = ambil(sel, "carton");
    const id = { pattern: ambil(sel, "pattern"), size: ambil(sel, "size"), mold: ambil(sel, "mold") };
    const adaId = !!(id.pattern || id.size || id.mold);
    const bebas = (i) => !dipakai.has(i);
    let i = -1;
    if (carton) i = model.baris.findIndex((b, j) => bebas(j) && npKunciCarton(b.marks) === npKunciCarton(carton));
    if (i < 0 && adaId) i = model.baris.findIndex((b, j) => bebas(j) && sama(id.pattern, b.id.pattern) && sama(id.size, b.id.size) && sama(id.mold, b.id.mold));
    if (i < 0 && !carton && !adaId) {
      while (urut < model.baris.length && dipakai.has(urut)) urut++;
      i = urut < model.baris.length ? urut : -1;
    }
    if (i < 0) {
      hasil.takCocok.push(carton || [id.pattern, id.size, id.mold].filter(Boolean).join(" ") || sel.join(" "));
      return;
    }
    dipakai.add(i);
    let ada = false;
    NP_KOLOM_KETIK.forEach((k) => {
      const v = ambil(sel, k);
      if (v !== "" && isi(i, k, v)) ada = true;
    });
    if (!ada) return;
    hasil.terisi++;
    // N/W & GW tempelan = pemeriksa: hitungan kita dari Tread/Side/B/R/BOX yang sama harus sama
    const h = npHitung(npHal.isian[i]);
    const nw = npAngka(ambil(sel, "nw"));
    const gw = npAngka(ambil(sel, "gw"));
    if ((nw != null && isFinite(nw) && h.nw != null && Math.abs(nw - h.nw) > 0.005) || (gw != null && isFinite(gw) && h.gw != null && Math.abs(gw - h.gw) > 0.005)) {
      hasil.beda.push(model.baris[i].marks);
    }
  });
  return hasil;
}

function npTempel(e) {
  const el = e.target && e.target.closest ? e.target.closest(".np-in") : null;
  if (!el || el.readOnly || !npHal) return;
  const data = e.clipboardData || window.clipboardData;
  const baris = npUraiTempelan(data ? data.getData("text/plain") : "");
  // Satu sel: tempel biasa ke kotaknya
  if (baris.length <= 1 && (baris[0] || []).length <= 1) return;
  e.preventDefault();
  const hasil = npTerapkanTempelan(baris, Number(el.dataset.npI), el.dataset.npK);
  if (hasil.terisi) npTandaiKotor();
  npGambar();
  npLaporIsi(hasil, null);
}

/* Kabar sesudah tempel / upload: berapa baris terisi, dan yang perlu
   diperiksa -- baris yang tidak cocok dengan box mana pun, N/W / GW yang
   beda dengan hitungan (kolom tergeser), tanggal yang tidak terbaca.
   `asal` = { berkas, lembar } untuk upload Excel; null = tempelan. */
function npLaporIsi(hasil, asal) {
  const dari = asal
    ? tt(`dari ${asal.berkas} (lembar ${asal.lembar})`, `from ${asal.berkas} (sheet ${asal.lembar})`)
    : tt("dari tempelan", "from the paste");
  const catatan = [];
  if (hasil.takCocok.length) catatan.push(tt(`${hasil.takCocok.length} baris ${asal ? "Excel" : "tempelan"} tidak cocok dengan box mana pun (${hasil.takCocok.slice(0, 3).join(", ")}${hasil.takCocok.length > 3 ? ", …" : ""}).`,
    `${hasil.takCocok.length} ${asal ? "Excel" : "pasted"} row(s) matched no box (${hasil.takCocok.slice(0, 3).join(", ")}${hasil.takCocok.length > 3 ? ", …" : ""}).`));
  if (hasil.beda.length) catatan.push(tt(`N/W / GW ${asal ? "di Excel" : "tempelan"} berbeda dengan hitungan di ${hasil.beda.join(", ")} — periksa kolomnya.`,
    `${asal ? "The Excel" : "Pasted"} N/W / GW differ from the calculation at ${hasil.beda.join(", ")} — check the columns.`));
  if (hasil.tanggalSalah.length) catatan.push(tt(`Tanggal tidak terbaca: ${hasil.tanggalSalah.slice(0, 3).join(", ")}.`, `Unreadable date(s): ${hasil.tanggalSalah.slice(0, 3).join(", ")}.`));
  if (!hasil.terisi) {
    showToast(catatan.join(" ") || (asal
      ? tt(`Tidak ada berat yang bisa diisi ${dari}.`, `No weights could be filled in ${dari}.`)
      : tt("Tidak ada yang bisa diisi dari tempelan itu.", "Nothing could be filled in from that paste.")), "warning");
    return;
  }
  const simpan = asal ? " " + tt("Periksa lalu Simpan.", "Check, then Save.") : "";
  showToast(tt(`${hasil.terisi} baris terisi ${dari}.`, `${hasil.terisi} row(s) filled in ${dari}.`) + simpan + (catatan.length ? " " + catatan.join(" ") : ""),
    catatan.length ? "warning" : "success");
}

/* ---------------- UPLOAD EXCEL ----------------

   Buku kerja CIPL Kumho menyimpan tabel berat di lembar PL, di kanan
   Packing List-nya (M31:W45: Carton No. | Pattern | Size | Mold No |
   Tread | Side | B/R | BOX | N/W | GW | FINISHED DATE OF PRODUCTION);
   tabel dari produksi bisa di lembar & letak mana pun. Jadi seluruh
   lembar disapu mencari BARIS JUDUL yang dikenali npPetaJudul DAN memuat
   kolom berat (Tread / Side / B/R / BOX) -- judul tabel PL di atasnya
   (Marks & No. PKGS ... Net Wt., Gross Wt.) tidak berkolom berat, jadi
   tidak terpilih. Baris di bawahnya diambil sampai baris kosong pertama,
   lalu diisikan lewat jalur yang sama dengan tempel (npTerapkanTempelan):
   dicocokkan lewat Carton No., lalu Pattern / Size / Mold No.

   Isi sel: hasil rumus yang tersimpan di berkas (Carton No. dkk. di
   lembar PL adalah rumus ke lembar CI); kotak berat yang berisi
   PENJUMLAHAN POLOS (=16.73+16.32+..., =126+127) dibawa sebagai rumusnya
   -- rincian per segmen tetap terlihat di kotaknya, seperti diketik di
   Excel; tanggal Excel / teks "2026.11.23" dibaca kotak tanggal. */
const NP_XL_MAKS_BARIS = 500;
const NP_XL_MAKS_KOLOM = 60;
const NP_XL_KOLOM_BERAT = ["tread", "side", "br", "box"];

// Nilai sel ExcelJS -> teks seperti yang tampil di Excel. `k` = kunci kolomnya (tread, tanggal, ...)
function npXlTeks(v, k) {
  if (v == null) return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    if (!isFinite(v)) return "";
    // Nomor seri tanggal Excel tanpa format tanggal di kolom tanggal produksi
    if (k === "tanggal" && v > 20000 && v < 80000) return npXlTeks(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000), k);
    return String(Number(v.toFixed(6))); // tanpa derau biner: 424.48999999999995 -> 424.49
  }
  if (typeof v === "string") return v.trim();
  if (typeof v !== "object") return "";
  if (Array.isArray(v.richText)) return v.richText.map((x) => (x && x.text) || "").join("").trim();
  if (v.formula != null || v.sharedFormula != null) {
    const rumus = String(v.formula || "").replace(/\s+/g, "");
    if (NP_XL_KOLOM_BERAT.includes(k) && /^\d+(\.\d+)?(\+\d+(\.\d+)?)+$/.test(rumus)) return rumus;
    return v.result && typeof v.result === "object" && v.result.error ? "" : npXlTeks(v.result, k);
  }
  if (v.error) return "";
  if (v.text != null) return String(v.text).trim(); // tautan
  return "";
}

/* Tabel berat di buku kerja ExcelJS -> { lembar, baris: [judul, ...isi] }
   berbentuk tempelan (larik teks per baris), atau null kalau tidak ada.
   Lebih dari satu kandidat: yang judulnya paling banyak dikenali. */
function npXlTabelBerat(wb) {
  let pilih = null;
  wb.eachSheet((ws) => {
    const akhirBaris = Math.min(ws.rowCount || 0, NP_XL_MAKS_BARIS);
    const akhirKolom = Math.min(ws.columnCount || 0, NP_XL_MAKS_KOLOM);
    for (let r = 1; r <= akhirBaris; r++) {
      const row = ws.getRow(r);
      const sel = [];
      for (let c = 1; c <= akhirKolom; c++) sel.push(npXlTeks(row.getCell(c).value, ""));
      const peta = npPetaJudul(sel);
      if (!peta) continue;
      const berat = NP_XL_KOLOM_BERAT.filter((k) => k in peta).length;
      if (!berat || !("carton" in peta || "pattern" in peta || "size" in peta)) continue;
      const skor = Object.keys(peta).length + berat;
      if (!pilih || skor > pilih.skor) pilih = { ws, r, peta, skor, akhirBaris, akhirKolom };
    }
  });
  if (!pilih) return null;
  const { ws, r, peta } = pilih;
  const kolom = Object.values(peta);
  const awal = Math.min(...kolom);
  const akhir = Math.max(...kolom);
  const kunciKolom = {};
  Object.keys(peta).forEach((k) => (kunciKolom[peta[k]] = k));
  const barisTeks = (row, judul) => {
    const sel = [];
    for (let c = awal; c <= akhir; c++) sel.push(npXlTeks(row.getCell(c + 1).value, judul ? "" : kunciKolom[c] || ""));
    return sel;
  };
  const hasil = [barisTeks(ws.getRow(r), true)];
  const batas = Math.min(ws.rowCount || 0, r + NP_XL_MAKS_BARIS);
  let kosong = 0;
  for (let y = r + 1; y <= batas; y++) {
    const sel = barisTeks(ws.getRow(y), false);
    if (!kolom.some((c) => sel[c - awal])) {
      // Sampai baris kosong pertama sesudah isinya; satu dua baris kosong tepat di bawah judul dilewati
      if (hasil.length > 1 || ++kosong > 3) break;
      continue;
    }
    hasil.push(sel);
  }
  return hasil.length > 1 ? { lembar: ws.name, baris: hasil } : null;
}

const npAdaPerubahanIsian = (lama, baru) => lama.some((x, i) => NP_ISIAN.some((k) => npTeks(x[k]) && npTeks(x[k]) !== npTeks((baru[i] || {})[k])));

async function npUnggahExcel(berkas) {
  if (!berkas || !npHal || !npHal.row || npHal.sibuk || npHal.mengunggah) return;
  if (!npBolehUbah()) {
    showToast(tt("Mengisi tabel berat khusus EXIM.", "Filling in the weight table is EXIM only."), "warning");
    return;
  }
  if (!npIsiTampil(npModelHalaman())) return;
  if (!/\.(xlsx|xlsm)$/i.test(berkas.name || "")) {
    showToast(tt(`${berkas.name || "Berkas itu"} bukan buku kerja Excel .xlsx.`, `${berkas.name || "That file"} is not an .xlsx Excel workbook.`), "warning");
    return;
  }
  npHal.mengunggah = true;
  npGambarAksi(npModelHalaman());
  try {
    await ensureExcelJS(); // pustaka Excel diunduh saat dibutuhkan saja
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await berkas.arrayBuffer());
    const tabel = npXlTabelBerat(wb);
    if (!tabel) {
      showToast(tt(`Tabel berat (Carton No. … Tread, Side, B/R, BOX) tidak ditemukan di ${berkas.name}.`,
        `No weight table (Carton No. … Tread, Side, B/R, BOX) was found in ${berkas.name}.`), "warning");
      return;
    }
    const asal = { berkas: berkas.name, lembar: tabel.lembar };
    /* Dicoba dulu pada salinan: isian yang SUDAH diketik dan akan berubah
       ditanyakan sebelum ditimpa -- tabel kosong langsung diisi. */
    const lama = npHal.isian.map((x) => Object.assign({}, x));
    const hasil = npTerapkanTempelan(tabel.baris, 0, NP_KOLOM_KETIK[0]);
    const baru = npHal.isian.map((x) => Object.assign({}, x));
    const terapkan = () => {
      npHal.isian = baru.map((x) => Object.assign({}, x));
      if (hasil.terisi) npTandaiKotor();
      npGambar();
      npLaporIsi(hasil, asal);
    };
    if (!npAdaPerubahanIsian(lama, baru)) return terapkan();
    npHal.isian = lama;
    npGambar();
    const n = lama.filter((x, i) => NP_ISIAN.some((k) => npTeks(x[k]) && npTeks(x[k]) !== npTeks((baru[i] || {})[k]))).length;
    showConfirm(
      tt(`${n} baris sudah berisi berat / tanggal yang berbeda dari ${berkas.name} dan akan diganti isian Excel-nya.`,
        `${n} row(s) already hold weights / dates that differ from ${berkas.name} and will be replaced with the Excel values.`),
      terapkan,
      { title: tt("Ganti dengan isian Excel?", "Replace with the Excel values?"), confirmText: tt("Ya, ganti", "Yes, replace"), tone: "warning", icon: "bi-file-earmark-arrow-up" },
    );
  } catch (err) {
    console.error(err);
    showToast(tt(`Berkas Excel tidak bisa dibaca: ${(err && err.message) || "kesalahan tidak diketahui"}`, `The Excel file could not be read: ${(err && err.message) || "unknown error"}`), "danger");
  } finally {
    npHal.mengunggah = false;
    npGambarAksi(npModelHalaman());
  }
}

function npBukaPanduan() {
  const el = npEl("npPanduanModal");
  if (!el || typeof bootstrap === "undefined") return;
  bootstrap.Modal.getOrCreateInstance(el).show();
}

/* ---------------- SAMAKAN BARIS 1 ---------------- */

function npSamakan(k) {
  if (!npHal || !npBolehUbah() || npHal.sibuk || npHal.isian.length < 2) return;
  const label = NP_LABEL_KOLOM[k];
  const nilai = npTeks(npHal.isian[0][k]);
  if (!nilai) {
    showToast(tt(`Isi dulu ${label} baris pertama.`, `Fill in row 1's ${label} first.`), "warning");
    return;
  }
  const tampil = k === "tanggal" ? fmtDate(nilai) : nilai;
  const timpa = npHal.isian.slice(1).filter((x) => npTeks(x[k]) && npTeks(x[k]) !== nilai).length;
  const berubah = npHal.isian.slice(1).filter((x) => npTeks(x[k]) !== nilai).length;
  if (!berubah) {
    showToast(tt(`${label} semua baris sudah ${tampil}.`, `Every row's ${label} is already ${tampil}.`), "info");
    return;
  }
  const jalankan = () => {
    npHal.isian.forEach((x, i) => {
      if (i) x[k] = nilai;
    });
    npTandaiKotor();
    npGambar();
    showToast(tt(`${label} ${tampil} disamakan ke ${berubah} baris.`, `${label} ${tampil} copied to ${berubah} row(s).`), "success");
  };
  if (!timpa) return jalankan();
  showConfirm(
    tt(`${timpa} baris sudah berisi ${label} lain dan akan diganti ${tampil}.`, `${timpa} row(s) already have another ${label} and will be replaced with ${tampil}.`),
    jalankan,
    { title: tt(`Samakan ${label}?`, `Copy ${label} to every row?`), confirmText: tt("Ya, samakan", "Yes, copy"), tone: "warning", icon: "bi-arrow-down-square" },
  );
}

/* ---------------- SIMPAN ---------------- */

async function npSimpanPayload(simpan) {
  const id = npHal.id;
  const terbaru = typeof dnPayloadTerbaru === "function" ? await dnPayloadTerbaru(id) : Object.assign({}, npHal.row.payload);
  const payload = Object.assign({}, terbaru, { namePlate: simpan });
  if (typeof realtimeCatatTulis === "function") realtimeCatatTulis("document_numbers", id);
  const { error } = await supabaseClient.from("document_numbers").update({ payload }).eq("id", id);
  if (error) throw error;
  // Riwayat Nomor Dokumen yang tersimpan di memori ikut basi (docnum-view.js)
  if (typeof dnSimpananBersih === "function") dnSimpananBersih();
  npHal.row = Object.assign({}, npHal.row, { payload });
  // Salinan riwayat di layar (tombol cetak & Excel membacanya tanpa ke database)
  const r = (typeof docNumHistoryRows !== "undefined" && Array.isArray(docNumHistoryRows) ? docNumHistoryRows : []).find((x) => String(x.id) === id);
  if (r) r.payload = payload;
}

/* NETTO & BRUTO BARANG JADWAL = ANGKA PACKING LIST.

   Barang jadwal dibaca ulang dari database dulu -- bukan salinan di
   layar -- dan harus masih barang yang sama (nama per urutan); kalau
   daftar barangnya berubah sejak halaman ini dibuka, tidak ada yang
   ditulis. Hanya kolom netto & bruto barang yang angkanya berbeda yang
   diperbarui. Bila database tidak menerima pembaruan per barang (baris
   tidak kembali), seluruh barang ditulis ulang lewat jalur simpan form
   (gantiBarang, data/api.js) dari salinan yang baru dibaca itu.
   Hasil: jumlah barang yang diperbarui. */
async function npSelaraskanJadwal(model) {
  const s = model.shipment;
  if (!s) return 0;
  const ubah = model.baris.filter((b) => b.pl && (Math.abs(b.pl.netto - b.jadwal.netto) > 1e-9 || Math.abs(b.pl.bruto - b.jadwal.bruto) > 1e-9));
  if (!ubah.length) return 0;
  const { data: rows, error } = await kueriShipments().eq("id", s.id);
  if (error) throw error;
  const segar = rows && rows[0] ? rowToShipment(rows[0]) : null;
  if (!segar) throw new Error(tt("jadwal yang ditautkan tidak ditemukan lagi", "the linked schedule no longer exists"));
  const barangSegar = npBarang(segar);
  if (npSidikBarang(barangSegar) !== npSidikBarang(model.items)) {
    throw new Error(tt("daftar barang jadwalnya baru saja berubah — periksa tabel ini lalu Simpan lagi", "the schedule's item list just changed — check this table and Save again"));
  }
  const tulis = ubah.map((b) => ({ it: barangSegar[b.idx], netto: b.pl.netto, bruto: b.pl.bruto }));
  if (typeof realtimeCatatTulis === "function") realtimeCatatTulis("shipments", s.id);
  const hasil = await Promise.all(
    tulis.map((x) => supabaseClient.from("shipment_items").update({ netto: x.netto, bruto: x.bruto }).eq("id", x.it.id).select("id")),
  );
  if (hasil.some((h) => h.error || !Array.isArray(h.data) || !h.data.length)) {
    tulis.forEach((x) => {
      x.it.netto = x.netto;
      x.it.bruto = x.bruto;
    });
    await gantiBarang(s.id, segar.items);
  }
  // Papan & salinan jadwal di aplikasi ini memakai angka barunya; pengguna lain diberi tahu (realtime)
  const { data: akhir } = await kueriShipments().eq("id", s.id);
  if (akhir && akhir[0] && typeof terapkanJadwalTersimpan === "function") await terapkanJadwalTersimpan(akhir[0]);
  if (typeof realtimeSiarkanJadwal === "function") realtimeSiarkanJadwal([s.id]);
  return tulis.length;
}

async function npSimpan() {
  if (!npHal || !npHal.row || npHal.sibuk) return;
  if (!requireEdit()) return;
  if (npHal.diubahLain === "hapus") return;
  npSegarkanJadwal();
  const model = npModelHalaman();
  const salah = model.baris.find((b) => b.hitung.salah.length);
  if (salah) {
    npGambar();
    showToast(tt(`Ada angka / rumus yang tidak terbaca di ${salah.marks}. Perbaiki dulu (contoh: 132.49 atau 126+127).`,
      `There is an unreadable number / formula at ${salah.marks}. Fix it first (e.g. 132.49 or 126+127).`), "danger", { judul: tt("Periksa isian", "Check the form") });
    const el = npEl("npTabel").querySelector(`tr[data-np-baris="${salah.idx}"] .np-in.is-salah`);
    if (el) el.focus();
    return;
  }
  npHal.sibuk = true;
  npGambarAksi(model);
  let pesan = "";
  let jenis = "success";
  try {
    await npSimpanPayload(npSimpanSekarang());
    npHal.kotor = false;
    npHal.diubahLain = "";
    pesan = tt("Berat per box & name plate tersimpan.", "Weights per box & name plate saved.");
    try {
      const n = await npSelaraskanJadwal(model);
      if (n) pesan += " " + tt(`Netto/Bruto ${n} barang di jadwal disamakan dengan Packing List (dibulatkan).`, `Net/Gross of ${n} item(s) in the schedule now match the Packing List (rounded).`);
    } catch (err) {
      console.error(err);
      jenis = "warning";
      pesan += " " + tt(`Tetapi Netto/Bruto barang di jadwal belum disamakan: ${(err && err.message) || err}. Packing List tetap memakai tabel ini.`,
        `But the schedule's item Net/Gross were not updated: ${(err && err.message) || err}. The Packing List still uses this table.`);
    }
  } catch (err) {
    console.error(err);
    jenis = "danger";
    pesan = t("x.gagal.menyimpan.perubahan.err", { err: (err && err.message) || t("s.kesalahan.tidak.diketahui") });
  } finally {
    npHal.sibuk = false;
    npGambar();
  }
  showToast(pesan, jenis);
}

/* ---------------- CETAK ---------------- */

function npCetak() {
  if (!npHal || !npHal.row) return;
  npSegarkanJadwal();
  const model = npModelHalaman();
  if (!model.total.plat) {
    showToast(tt("Belum ada box untuk dibuatkan name plate — periksa barang & kolom Kemasan jadwalnya.", "No boxes to make name plates for — check the schedule's items & Packing column."), "warning");
    return;
  }
  cetakNamePlate(model);
}

/* ---------------- PEMBARUAN DARI LUAR (realtime) ---------------- */

/* Nomor invoice yang sedang dibuka diubah / dihapus pengguna lain
   (dnRtProses, docnum-view.js). Tanpa isian yang belum disimpan: versi
   terbarunya langsung dipakai. Dengan isian: diberi tahu saja. */
function npNomorBerubah(x) {
  if (!npHal || !npHal.row || String(x.id) !== npHal.id || (x.kabar && x.kabar.sendiri)) return;
  const tampil = !npEl("viewNamePlate").classList.contains("d-none");
  if (!x.baris) {
    npHal.diubahLain = "hapus";
  } else if (!npHal.kotor && !npHal.sibuk) {
    npMulai(x.baris);
    if (tampil) showToast(tt("Nomor invoice ini baru saja diubah pengguna lain — yang tampil kini versi terbarunya.", "This invoice number was just changed by another user — the latest version is shown now."), "info");
  } else {
    npHal.diubahLain = "ubah";
    npHal.barisTerbaru = x.baris;
  }
  if (tampil) npGambar();
}

// Jadwal yang ditautkan berubah (rtSegarkanTampilanJadwal, data/realtime.js)
function npJadwalBerubah(berubah, penuh) {
  if (!npHal || !npHal.row) return;
  const sid = String((npHal.row.payload || {}).shipmentId || "");
  if (penuh || (sid && berubah && berubah.has(sid))) npGambar();
}

/* ---------------- PENDENGAR ---------------- */

(() => {
  const tabel = npEl("npTabel");
  if (tabel) {
    tabel.addEventListener("input", (e) => {
      if (e.target.classList && e.target.classList.contains("np-in") && !e.target.readOnly) npKetik(e.target);
    });
    // Kotak tanggal mengabarkan tanggal yang sudah utuh lewat change
    tabel.addEventListener("change", (e) => {
      if (e.target.classList && e.target.classList.contains("np-in") && !e.target.readOnly) npKetik(e.target);
    });
    tabel.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.classList || !e.target.classList.contains("np-in")) return;
      if (e.target.dataset.npK === "tanggal") {
        // Kotak tanggal merapikan ketikannya dulu (date-input.js), baru pindah
        setTimeout(() => npPindahBaris(e.target, e.shiftKey ? -1 : 1), 0);
        return;
      }
      e.preventDefault();
      npPindahBaris(e.target, e.shiftKey ? -1 : 1);
    });
    tabel.addEventListener("paste", npTempel);
    tabel.addEventListener("click", (e) => {
      const tombol = e.target.closest && e.target.closest("[data-np-samakan]");
      if (tombol) npSamakan(tombol.dataset.npSamakan);
    });
  }
  const atur = [["npMaterial", "material"], ["npEdisi", "edisi"], ["npSisi", "sisi"]];
  atur.forEach(([id, kunci]) => {
    const el = npEl(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (!npHal || el.readOnly) return;
      let nilai = el.value;
      if (kunci === "sisi") {
        // 1-8 saja; ketikan lain (kosong, 0, 9, huruf) belum mengubah apa pun -- dirapikan saat ditinggalkan
        const n = Number(String(el.value).trim());
        if (!(Number.isInteger(n) && n >= 1 && n <= NP_SISI_MAKS)) return;
        nilai = n;
      }
      if (String(npHal[kunci]) === String(nilai)) return;
      npHal[kunci] = nilai;
      npTandaiKotor();
      const model = npModelHalaman();
      npGambarAtur(model);
      npGambarAksi(model);
      npGambarTabel(model);
    });
    // Kosong / di luar 1-8 dirapikan saat ditinggalkan
    el.addEventListener("change", () => {
      if (!npHal) return;
      if (kunci === "sisi") el.value = String(npHal.sisi);
      else if (!npTeks(el.value)) {
        npHal[kunci] = NP_BAWAAN[kunci];
        el.value = npHal[kunci];
        npGambar();
      }
    });
  });
  const simpan = npEl("btnNpSimpan");
  if (simpan) simpan.addEventListener("click", npSimpan);
  const cetak = npEl("btnNpCetak");
  if (cetak) cetak.addEventListener("click", npCetak);
  // Upload Excel: tombol membuka pemilih berkas; berkas yang sama boleh dipilih lagi
  const berkas = npEl("npBerkas");
  const unggah = npEl("btnNpUnggah");
  if (unggah && berkas) unggah.addEventListener("click", () => berkas.click());
  if (berkas) {
    berkas.addEventListener("change", () => {
      const f = berkas.files && berkas.files[0];
      berkas.value = "";
      if (f) npUnggahExcel(f);
    });
  }
  const bantuan = npEl("btnNpBantuan");
  if (bantuan) bantuan.addEventListener("click", npBukaPanduan);
  /* Berkas Excel diseret ke panel tabel = Upload Excel (EXIM, tabel tampil).
     Hanya seretan BERKAS yang ditandai -- teks yang diseret dibiarkan. */
  const panel = tabel && tabel.closest(".np-panel");
  if (panel) {
    const adaBerkas = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"));
    const boleh = () => !!(npHal && npHal.row && npBolehUbah() && !npHal.sibuk && !npHal.mengunggah);
    ["dragenter", "dragover"].forEach((jenis) => panel.addEventListener(jenis, (e) => {
      if (!adaBerkas(e) || !boleh()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      panel.classList.add("is-seret");
    }));
    panel.addEventListener("dragleave", (e) => {
      if (!panel.contains(e.relatedTarget)) panel.classList.remove("is-seret");
    });
    panel.addEventListener("drop", (e) => {
      panel.classList.remove("is-seret");
      if (!adaBerkas(e) || !boleh()) return;
      e.preventDefault();
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) npUnggahExcel(f);
    });
  }
  const kabar = npEl("npKabar");
  if (kabar) {
    kabar.addEventListener("click", (e) => {
      if (!(e.target.closest && e.target.closest("[data-np-muat-terbaru]")) || !npHal) return;
      if (npHal.barisTerbaru) npMulai(npHal.barisTerbaru);
      npGambar();
    });
  }
  // Kembali dengan isian yang belum disimpan: ditanya dulu
  const kembali = npEl("npKembali");
  if (kembali) {
    kembali.addEventListener("click", (e) => {
      if (!npHal || !npHal.kotor || !npBolehUbah()) return;
      e.preventDefault();
      showConfirm(
        tt("Isian berat & name plate di halaman ini belum disimpan. Tetap kembali? Isiannya masih ada kalau halaman ini dibuka lagi selama aplikasi belum ditutup.",
          "The weights & name plate on this page are not saved yet. Go back anyway? They are kept if you reopen this page before closing the app."),
        () => {
          location.hash = "#/docnum";
        },
        { title: tt("Belum disimpan", "Not saved"), confirmText: tt("Kembali", "Go back"), cancelText: tt("Tetap di sini", "Stay here"), tone: "warning", icon: "bi-exclamation-circle" },
      );
    });
  }
  // Ctrl/⌘+S di halaman ini = Simpan (seperti form jadwal, modal-fields.js)
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key !== "s" && e.key !== "S")) return;
    const view = npEl("viewNamePlate");
    if (!view || view.classList.contains("d-none")) return;
    e.preventDefault();
    if (document.querySelector(".modal.show")) return;
    if (npHal && npBolehUbah()) npSimpan();
  });
})();
