"use strict";

/* SAMAKAN ISIAN BARIS 1 KE BARIS-BARIS DI BAWAHNYA.

   Isian detail barang sering sama untuk semua baris -- HS Code, kondisi,
   negara asal, jenis barang, qty, satuan, jenis kemasan -- sedangkan
   Enter di sebuah kotak hanya pindah ke kotak yang sama di baris
   berikutnya. Menyalin satu per satu untuk 20 barang melelahkan dan
   gampang terlewat.

   Maka begitu isian BARIS PERTAMA di salah satu dari tujuh kolom itu
   selesai diisi (kotak ditinggalkan, Enter, atau pilihan dipilih),
   muncul toast:

       Samakan Satuan PCS ke baris 2–12?      [Ya, samakan]  [Tidak]

   "Ya" menyalin nilai itu ke baris 2 sampai baris terakhir -- hanya
   kolom itu. "Tidak" (atau 15 detik tanpa disentuh) menutupnya dan data
   tidak berubah.

   Aturan yang dijaga:
     - HANYA baris pertama. Isian di baris 2 dan seterusnya tidak pernah
       memunculkan toast ini: di sana orang sedang mengisi nilai yang
       memang berbeda. Mengetik di kolom yang sama di baris 2+ malah
       menutup toast yang sedang terbuka.
     - Hanya ketujuh kolom di SAMAKAN_KOLOM.
     - Tidak muncul kalau tidak ada yang perlu disamakan: barisnya cuma
       satu, isian baris 1 kosong (qty 0 dianggap kosong), kode negara
       tidak dikenal, atau semua baris di bawahnya sudah sama. Baris yang
       baru lahir dari Enter di baris terakhir tidak dihitung: Enter itu
       menambah baris SESUDAH isiannya selesai.
     - Menimpa isian orang DIBERITAHUKAN di toast ("3 baris yang sudah
       terisi akan ditimpa"). Nilai bawaan baris baru (SET, BOX,
       BAHAN BAKU, kondisi 1) bukan isian orang, jadi tidak dihitung.
     - Hasil impor / salinan tidak memicunya: toast ini hanya lahir dari
       isian tangan (kejadian `change`) dan pilihan HS Code lewat
       pencarian. Kedua jalan itu memanggil tawarkanSamakan().
     - Bunyinya selalu cocok dengan tabel: diperbarui saat baris
       bertambah / berkurang atau nilai baris 1 diketik ulang, dan
       ditutup begitu sudah tidak ada yang perlu disamakan.

   Toast-nya elemen sendiri (#samakanToast) di tumpukan toast, BUKAN
   #appToast: tabel digambar ulang (innerHTML) di setiap perubahan
   baris, sedangkan toast ini harus tetap hidup supaya tombolnya tidak
   lenyap tepat saat ditekan. Ia juga tidak mencuri fokus -- orang yang
   sedang mengetik dengan papan ketik tidak terputus. */

const SAMAKAN_AUTOTUTUP_MS = 15000;

function samakanTeksBaku(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

function samakanAngka(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/* Tujuh kolom yang ditawarkan. Tiap kolom tahu:
     label()  : nama kolom di pesan (ikut bahasa aktif)
     kunci(it): bentuk BAKU yang dibandingkan; "" = kosong. Dua isian
                dianggap sama kalau kuncinya sama ("pcs" = "PCS").
     salin(it): nilai yang ditulis ke baris lain -- sama dengan yang
                terlihat di kotaknya.
     tampil() : tulisan nilai di pesan.
     sah(it)  : (opsional) nilai pantas disalin; kode negara yang tidak
                dikenal (ditandai merah di tabel) tidak. */
const SAMAKAN_KOLOM = {
  hsCode: {
    label: () => "HS Code",
    kunci: (it) => String(it.hsCode == null ? "" : it.hsCode).replace(/\D/g, ""),
    salin: (it) => it.hsCode,
    tampil: (it) => String(it.hsCode).trim(),
  },
  kondisiBarang: {
    label: () => tt("Kode Kondisi Barang", "Goods Condition Code"),
    kunci: (it) => kodeKondisiBarang(it.kondisiBarang),
    salin: (it) => kodeKondisiBarang(it.kondisiBarang),
    tampil: (it) => labelKondisiBarang(it.kondisiBarang),
  },
  negaraAsal: {
    label: () => tt("Kode Negara Asal", "Country of Origin Code"),
    kunci: (it) => samakanTeksBaku(it.negaraAsal),
    salin: (it) => samakanTeksBaku(it.negaraAsal),
    tampil: (it) => {
      const kode = samakanTeksBaku(it.negaraAsal);
      const nama = namaNegara(kode);
      return nama ? `${kode} — ${nama}` : kode;
    },
    sah: (it) => !!namaNegara(it.negaraAsal),
  },
  jenisBarang: {
    label: () => tt("Jenis Barang", "Goods Category"),
    kunci: (it) => normalisasiJenisBarang(it.jenisBarang),
    salin: (it) => normalisasiJenisBarang(it.jenisBarang),
    tampil: (it) => labelJenisBarang(normalisasiJenisBarang(it.jenisBarang)),
  },
  qty: {
    label: () => "Qty",
    kunci: (it) => {
      const n = samakanAngka(it.qty);
      return n > 0 ? String(n) : "";
    },
    salin: (it) => samakanAngka(it.qty),
    tampil: (it) => formatNumberValue(it.qty),
  },
  satuan: {
    label: () => tt("Satuan", "Unit"),
    kunci: (it) => samakanTeksBaku(it.satuan),
    salin: (it) => samakanTeksBaku(it.satuan),
    tampil: (it) => samakanTeksBaku(it.satuan),
  },
  packingUnit: {
    label: () => tt("Jenis Kemasan", "Package Type"),
    kunci: (it) => samakanTeksBaku(it.packingUnit),
    salin: (it) => samakanTeksBaku(it.packingUnit),
    tampil: (it) => samakanTeksBaku(it.packingUnit),
  },
};

// Yang sedang ditawarkan: { f: kolom, kunci: nilai baris 1 } -- null bila toast tertutup
let tawaranSamakan = null;
let timerSamakan = null;

/* Apa yang akan terjadi kalau "Ya" ditekan untuk kolom `f` SEKARANG,
   dihitung dari data hidup (draftItems) -- bukan dari ingatan toast.
   null = tidak ada yang perlu disamakan. */
function rencanaSamakan(f) {
  const kol = SAMAKAN_KOLOM[f];
  const n = draftItems.length;
  if (!kol || n < 2) return null;
  const sumber = draftItems[0];
  const kunci = kol.kunci(sumber);
  if (!kunci || (kol.sah && !kol.sah(sumber))) return null;
  const bawaan = kol.kunci(newItem());
  let timpa = 0;
  let beda = 0;
  for (let i = 1; i < n; i++) {
    const k = kol.kunci(draftItems[i]);
    if (k === kunci) continue;
    beda++;
    if (k && k !== bawaan) timpa++;
  }
  return beda ? { kol, f, kunci, n, timpa } : null;
}

function rentangSamakan(n) {
  return n === 2 ? tt("baris 2", "row 2") : tt(`baris 2–${n}`, `rows 2–${n}`);
}

function elemenSamakan() {
  let el = document.getElementById("samakanToast");
  if (el) return el;
  const tumpukan = document.getElementById("toastStack");
  if (!tumpukan) return null;
  el = document.createElement("div");
  el.id = "samakanToast";
  el.className = "app-toast app-toast--aksi";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <span class="app-toast-icon"><i class="bi bi-arrow-down-circle-fill"></i></span>
    <div class="app-toast-body">
      <div class="samakan-pesan" id="samakanPesan"></div>
      <div class="samakan-catatan d-none" id="samakanCatatan"></div>
      <div class="samakan-aksi">
        <button type="button" class="samakan-btn samakan-btn--ya" id="samakanYa"></button>
        <button type="button" class="samakan-btn" id="samakanTidak"></button>
      </div>
    </div>`;
  // Paling atas tumpukan: #appToast yang tertutup tetap makan tempat, jadi
  // di bawahnya toast ini akan tampak melorot.
  tumpukan.insertBefore(el, tumpukan.firstChild);
  /* Menekan tombolnya TIDAK memindahkan fokus dari kotak isian yang
     sedang dipakai -- papan ketik tetap di tempatnya sesudah "Ya". */
  el.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  el.querySelector("#samakanYa").addEventListener("click", terapkanSamakan);
  el.querySelector("#samakanTidak").addEventListener("click", sembunyikanTawaranSamakan);
  return el;
}

function isiTawaranSamakan(el, r) {
  const pesan = el.querySelector("#samakanPesan");
  pesan.textContent = "";
  pesan.appendChild(document.createTextNode(tt(`Samakan ${r.kol.label()} `, `Set ${r.kol.label()} to `)));
  const nilai = document.createElement("strong");
  nilai.className = "samakan-nilai";
  nilai.textContent = r.kol.tampil(draftItems[0]);
  pesan.appendChild(nilai);
  pesan.appendChild(document.createTextNode(tt(` ke ${rentangSamakan(r.n)}?`, ` in ${rentangSamakan(r.n)}?`)));

  const catatan = el.querySelector("#samakanCatatan");
  catatan.textContent = r.timpa
    ? tt(`${r.timpa} baris yang sudah terisi akan ditimpa.`, `${r.timpa} filled ${r.timpa === 1 ? "row" : "rows"} will be overwritten.`)
    : "";
  catatan.classList.toggle("d-none", !r.timpa);

  el.querySelector("#samakanYa").textContent = tt("Ya, samakan", "Yes, apply");
  el.querySelector("#samakanTidak").textContent = tt("Tidak", "No");
}

function tampilkanTawaranSamakan(r) {
  const el = elemenSamakan();
  if (!el) return;
  tawaranSamakan = { f: r.f, kunci: r.kunci };
  isiTawaranSamakan(el, r);
  // Sudah terbuka -> hanya isinya yang diperbarui, animasi masuknya tidak diulang
  el.classList.add("is-open");
  clearTimeout(timerSamakan);
  timerSamakan = setTimeout(sembunyikanTawaranSamakan, SAMAKAN_AUTOTUTUP_MS);
}

function sembunyikanTawaranSamakan() {
  tawaranSamakan = null;
  clearTimeout(timerSamakan);
  const el = document.getElementById("samakanToast");
  if (el) el.classList.remove("is-open");
}

/* Enter di baris TERAKHIR menambah baris lalu menggambar ulang tabel
   (item-table.js, keBarisBerikutnya). Chrome menembakkan `change` dari
   kotak yang dilepas SAAT itu juga -- Firefox & Safari tidak -- padahal
   baris di bawahnya baru lahir karena Enter itu, bukan sudah ada waktu
   isiannya selesai. Dibungkus di sini supaya perilakunya sama di semua
   peramban: tidak ada tawaran. */
let samakanDitahan = false;
function tanpaTawaranSamakan(fn) {
  const sebelum = samakanDitahan;
  samakanDitahan = true;
  try {
    fn();
  } finally {
    samakanDitahan = sebelum;
  }
}

/* Pintu masuk dari tabel: isian `f` di baris `idx` baru selesai diisi
   (kejadian `change`) atau diubah lewat pencarian HS Code. Selain baris
   pertama dan ketujuh kolom di atas -- diam. */
function tawarkanSamakan(f, idx) {
  if (samakanDitahan || idx !== 0 || !SAMAKAN_KOLOM[f]) return;
  const r = rencanaSamakan(f);
  if (r) tampilkanTawaranSamakan(r);
  else if (tawaranSamakan && tawaranSamakan.f === f) sembunyikanTawaranSamakan();
}

/* Tiap ketikan di tabel (kejadian `input`): toast yang terbuka untuk
   kolom itu mengikuti -- nilai baris 1 diketik ulang, pesannya ikut
   berubah (atau menutup kalau jadi kosong); mengetik di kolom yang sama
   di baris 2+ berarti orang memilih mengisi sendiri, toast menutup. */
function samakanSaatMengetik(f, idx) {
  if (!tawaranSamakan || tawaranSamakan.f !== f) return;
  if (idx !== 0) {
    sembunyikanTawaranSamakan();
    return;
  }
  const r = rencanaSamakan(f);
  if (!r) {
    sembunyikanTawaranSamakan();
    return;
  }
  tawaranSamakan.kunci = r.kunci;
  const el = document.getElementById("samakanToast");
  if (el) isiTawaranSamakan(el, r);
}

/* Tabel digambar ulang (baris bertambah / berkurang, hasil impor, ...):
   jumlah baris di pesan dibetulkan; kalau baris 1 sudah berganti isi
   atau tidak ada lagi yang perlu disamakan, toast menutup. Tidak pernah
   MEMBUKA toast -- itu hanya lewat tawarkanSamakan(). */
function perbaruiTawaranSamakan() {
  if (!tawaranSamakan) return;
  const r = rencanaSamakan(tawaranSamakan.f);
  if (!r || r.kunci !== tawaranSamakan.kunci) {
    sembunyikanTawaranSamakan();
    return;
  }
  const el = document.getElementById("samakanToast");
  if (el) isiTawaranSamakan(el, r);
}

// Kotak isian tabel yang sedang berfokus -- digambar ulang tabel melenyapkannya
function fokusTabelSamakan() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.f || !a.closest) return null;
  const tr = a.closest("#itemTableBody tr[data-idx]");
  return tr ? { idx: tr.dataset.idx, f: a.dataset.f } : null;
}

function pulihkanFokusSamakan(p) {
  if (!p) return;
  const el = document.querySelector(`#itemTableBody tr[data-idx="${p.idx}"]:not(.item-fac-row) [data-f="${p.f}"]`);
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch (_) {
    el.focus();
  }
  // Kursor di ujung isi, bukan di awal kotak yang baru digambar
  if (typeof el.setSelectionRange === "function") {
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch (_) {
      /* kotak tanpa pilihan teks */
    }
  }
}

/* "Ya, samakan": salin nilai baris 1 ke baris 2..terakhir -- hanya
   kolomnya. Dihitung ulang dari data hidup; kalau sudah tidak cocok
   dengan yang ditawarkan, toast menutup tanpa mengubah apa pun. */
function terapkanSamakan() {
  const o = tawaranSamakan;
  if (!o) return;
  const r = rencanaSamakan(o.f);
  if (!r || r.kunci !== o.kunci) {
    sembunyikanTawaranSamakan();
    return;
  }
  const nilai = r.kol.salin(draftItems[0]);
  for (let i = 1; i < draftItems.length; i++) {
    // Baris yang sudah sama dibiarkan apa adanya (jangan ubah tulisannya)
    if (r.kol.kunci(draftItems[i]) !== r.kunci) draftItems[i][o.f] = nilai;
  }
  const label = r.kol.label();
  const rentang = rentangSamakan(r.n);
  const fokus = fokusTabelSamakan();
  sembunyikanTawaranSamakan();
  renderItemTable();
  pulihkanFokusSamakan(fokus);
  showToast(tt(`${label} disamakan ke ${rentang}.`, `${label} applied to ${rentang}.`), "success");
}

// Pindah halaman / tab: toast untuk tabel yang sudah tak terlihat ikut pergi
window.addEventListener("hashchange", sembunyikanTawaranSamakan);

function tutupBilaPaneBarangTersembunyi(pane) {
  if (pane.classList.contains("d-none")) sembunyikanTawaranSamakan();
}

function amatiPaneBarangSamakan() {
  const pane = document.querySelector('.tab-pane[data-tabpane="barang"]');
  if (!pane || pane.dataset.samakanDiamati) return;
  pane.dataset.samakanDiamati = "1";
  new MutationObserver(() => tutupBilaPaneBarangTersembunyi(pane)).observe(pane, {
    attributes: true,
    attributeFilter: ["class"],
  });
}
document.addEventListener("DOMContentLoaded", amatiPaneBarangSamakan);
amatiPaneBarangSamakan();
