"use strict";

/* ==================================================================
   SARAN HOUSE BL/AWB -- kotak BL/AWB form Pengajuan Dana

   Mengetik beberapa huruf / angka di kotak BL/AWB memunculkan, tepat
   di bawah kotak, paling banyak 4 nomor House B/L / House AWB dari
   jadwal (Import & Export) yang mirip ketikannya. Dipilih dengan klik,
   atau panah bawah lalu Enter -- sisanya tidak perlu diketik.

   MIRIP = memuat ketikan; spasi, strip, titik, dan besar-kecil huruf
   tidak dihitung ("sre 4538" cocok dengan "SRE-453812"). Urutannya:
   nomor yang SAMA persis, berawalan ketikan, berakhiran ketikan (cukup
   mengetik empat angka terakhir), lalu yang sekadar memuatnya; yang
   setara diurut dari jadwal terbaru, karena tagihan paling sering
   menyangkut kiriman yang baru.

   Kotak ini boleh memuat BEBERAPA nomor (dipisah "/", koma, titik
   koma). Saran hanya untuk nomor yang sedang diketik -- yang ada di
   sekitar kursor --, nomor yang sudah ada di isian tidak disarankan
   lagi, dan memilih saran hanya mengganti nomor itu, bukan seluruh isi.

   Yang diketik TIDAK PERNAH diganti sendiri. Saran baru terpasang bila
   diklik, atau disorot dengan panah lalu Enter; Enter / Tab tanpa
   sorotan tidak memilih apa pun. Nomor yang tidak ada di jadwal
   (tagihan kiriman yang belum dijadwalkan) tetap bebas diketik --
   daftar saran tidak muncul dan tidak ada yang menghalangi.

   Memilih saran memicu `input` + `change` di kotaknya, persis seperti
   diketik: isian otomatis dari jadwal (Jenis Transaksi, vendor,
   customer, Rincian -- fund-rincian.js) dan tabel rincian ikut jalan.
================================================================== */

const FUND_SARAN_AWB_MAKS = 4; // baris saran paling banyak
const FUND_SARAN_AWB_MIN = 2; // huruf / angka yang diketik sebelum saran muncul
const FUND_SARAN_AWB_PANJANG = 5; // nomor lebih pendek tak dianggap nomor (sama dengan bkKunciKiriman)
const FUND_SARAN_AWB_RUANG = 232; // px yang dibutuhkan daftar penuh (4 baris + bingkai + jarak 4px dari kotak), dengan sedikit longgar
const FUND_AWB_PEMISAH = /[\/,;|\r\n]/; // sama dengan pemisah nomor di fundDaftarAwb (fund-lines.js)

/* Semua House B/L / House AWB jadwal Import & Export -- satu per kunci
   (huruf & angka saja); ejaan yang tampil adalah yang paling sering
   dipakai. Keterangannya ("Air Import", nama Shipper / Buyer) dan tanggal
   urutnya diambil dari jadwal TERBARU yang memuat nomor itu.
     [{ kunci, nomor, jenis, pihak, tgl }] */
function fundDaftarHouseAwb() {
  if (typeof data === "undefined" || !data) return [];
  const perKunci = new Map();
  ["import", "export"].forEach((buku) => {
    (data[buku] || []).forEach((s) => {
      if (!s) return;
      const tgl = String((buku === "export" ? effectiveEtd(s) || effectiveEta(s) : effectiveEta(s) || effectiveEtd(s)) || "");
      fundDaftarAwb(s.houseBL).forEach((a) => {
        if (a.kunci.length < FUND_SARAN_AWB_PANJANG) return;
        if (!perKunci.has(a.kunci)) perKunci.set(a.kunci, { ejaan: new Map(), jadwal: [] });
        const isi = perKunci.get(a.kunci);
        isi.ejaan.set(a.teks, (isi.ejaan.get(a.teks) || 0) + 1);
        isi.jadwal.push({ s, buku, tgl });
      });
    });
  });
  return [...perKunci].map(([kunci, isi]) => {
    const baru = isi.jadwal.slice().sort((a, b) => (a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : 0))[0];
    const pihak = String(baru.s.party || "").replace(/\s+/g, " ").trim();
    return {
      kunci,
      nomor: [...isi.ejaan].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      jenis: `${baru.s.transport === "udara" ? "Air" : "Sea"} ${baru.buku === "export" ? "Export" : "Import"}`,
      pihak: pihak === "-" ? "" : pihak,
      tgl: baru.tgl,
    };
  });
}

/* Nomor yang sedang diketik = bagian isian di sekitar kursor, di antara
   dua pemisah. `awal` dan `akhir` ikut utuh saat sebuah saran dipilih.
   Kursor kosong / di luar isi = akhir isian. */
function fundPecahAwb(teks, kursor) {
  const isi = String(teks == null ? "" : teks);
  const k = Number.isInteger(kursor) && kursor >= 0 && kursor <= isi.length ? kursor : isi.length;
  let mulai = k;
  while (mulai > 0 && !FUND_AWB_PEMISAH.test(isi[mulai - 1])) mulai--;
  let selesai = k;
  while (selesai < isi.length && !FUND_AWB_PEMISAH.test(isi[selesai])) selesai++;
  return { awal: isi.slice(0, mulai), ketik: isi.slice(mulai, selesai), akhir: isi.slice(selesai) };
}

/* Saran untuk isi kotak `teks` dengan kursor di `kursor`. `daftar` =
   fundDaftarHouseAwb() (diberikan pemanggil supaya satu sesi mengetik
   tidak menyusunnya berkali-kali).
     { awal, ketik, akhir, kunci, saran: [{ kunci, nomor, jenis, pihak, tgl, peringkat }] }
   peringkat: 0 sama persis, 1 berawalan, 2 berakhiran, 3 memuat. */
function fundSaranAwb(teks, kursor, daftar) {
  const bagian = fundPecahAwb(teks, kursor);
  const kunci = kunciAlnum(bagian.ketik);
  const hasil = Object.assign({ kunci, saran: [] }, bagian);
  if (kunci.length < FUND_SARAN_AWB_MIN) return hasil;
  // Nomor lain yang sudah ada di isian tidak disarankan lagi
  const sudah = new Set(fundDaftarAwb(bagian.awal + "/" + bagian.akhir).map((a) => a.kunci));
  hasil.saran = (daftar || fundDaftarHouseAwb())
    .filter((n) => n.kunci.includes(kunci) && !sudah.has(n.kunci))
    .map((n) => Object.assign({ peringkat: n.kunci === kunci ? 0 : n.kunci.startsWith(kunci) ? 1 : n.kunci.endsWith(kunci) ? 2 : 3 }, n))
    .sort((a, b) => a.peringkat - b.peringkat || (a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : 0) || a.nomor.localeCompare(b.nomor))
    .slice(0, FUND_SARAN_AWB_MAKS);
  return hasil;
}

/* Isi kotak sesudah `nomor` dipilih untuk menggantikan bagian yang
   sedang diketik; spasi di kiri-kanan bagian itu dibiarkan. `kursor` =
   posisi tepat di belakang nomor yang baru dipasang. */
function fundPasangSaranAwb(hasil, nomor) {
  const kiri = /^\s*/.exec(hasil.ketik)[0];
  const kanan = /\s*$/.exec(hasil.ketik)[0];
  const sebelum = hasil.awal + kiri + nomor;
  return { nilai: sebelum + kanan + hasil.akhir, kursor: sebelum.length };
}

/* Nomor dengan bagian yang cocok ditebalkan. Pencocokan memakai kunci
   huruf & angka, jadi posisinya dipetakan kembali ke tulisan aslinya
   ("SRE-453812" + "4538" -> "SRE-<mark>4538</mark>12"). */
function fundSorotAwb(nomor, kunci) {
  const teks = String(nomor);
  // posisi[n] = letak huruf / angka ke-n di tulisan aslinya (cara menyaringnya sama dengan kunciAlnum)
  const posisi = [];
  for (let i = 0; i < teks.length; i++) for (let n = kunciAlnum(teks[i]).length; n > 0; n--) posisi.push(i);
  const mulai = kunciAlnum(teks).indexOf(kunci);
  if (!kunci || mulai < 0) return escapeHtml(teks);
  const dari = posisi[mulai];
  const sampai = posisi[mulai + kunci.length - 1] + 1;
  return `${escapeHtml(teks.slice(0, dari))}<mark>${escapeHtml(teks.slice(dari, sampai))}</mark>${escapeHtml(teks.slice(sampai))}`;
}

/* ------------------------------------------------------------------
   TAMPILAN -- dropdown di bawah kotak (gaya sama dengan dropdown Nama
   Shipper / Buyer, pilih-pihak.js). Satu kotak saja yang aktif pada
   satu waktu, jadi keadaannya satu objek.
------------------------------------------------------------------ */
const SELEKTOR_AWB_ISIAN = '[data-dn="blAwb"]';
const SELEKTOR_AWB = `[data-docnum-panel="fund"] ${SELEKTOR_AWB_ISIAN}`;

const saranAwb = {
  daftar: null, // semua House BL/AWB jadwal (disusun sekali per giliran mengetik)
  hasil: null, // hasil fundSaranAwb terakhir
  aktif: -1, // saran yang disorot (-1 = tidak ada: Enter tidak memilih apa pun)
  memilih: false, // pilihSaranAwb sedang mengabarkan isian barunya
};

/* Daftar naik ke atas kotak HANYA bila di bawah kurang lega DAN di atas
   benar-benar muat sampai ke bingkai yang memotongnya. Kalau di atas pun
   sempit, tetap di bawah: bagian yang melewati tepi layar masih bisa
   digulir, sedangkan bagian yang terpotong bingkai (overflow:hidden) tak
   akan pernah terlihat. Diukur dengan tinggi daftar PENUH, bukan tinggi
   baris yang sedang tampil, supaya daftar tidak berpindah atas-bawah
   selagi mengetik dan barisnya berkurang. */
function fundNaikSaranAwb(ruangBawah, ruangAtas) {
  return ruangBawah < FUND_SARAN_AWB_RUANG && ruangAtas >= FUND_SARAN_AWB_RUANG;
}

/* Ruang (px) di bawah dan di atas kotak yang benar-benar terlihat:
   dibatasi layar yang tampak (papan ketik ponsel mengecilkan visualViewport,
   bukan innerHeight) dan bingkai terdekat yang memotong isinya
   (overflow bukan visible, mis. .docnum-shell). */
function fundRuangSaranAwb(el) {
  const r = el.getBoundingClientRect();
  const vv = window.visualViewport;
  const atasLayar = vv ? vv.offsetTop : 0;
  const bawahLayar = vv ? vv.offsetTop + vv.height : window.innerHeight;
  let batasAtas = atasLayar;
  for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    if (/auto|scroll|hidden|clip|overlay/.test(getComputedStyle(n).overflowY)) batasAtas = Math.max(batasAtas, n.getBoundingClientRect().top);
  }
  return { bawah: bawahLayar - r.bottom, atas: r.top - batasAtas };
}

const wadahSaranAwb = (el) => (el && el.closest ? el.closest(".saran-awb") : null);
const daftarSaranAwb = (el) => {
  const wadah = wadahSaranAwb(el);
  return wadah ? wadah.querySelector(".saran-awb-daftar") : null;
};
const saranAwbTerbuka = (el) => {
  const dl = daftarSaranAwb(el);
  return !!dl && !dl.classList.contains("d-none");
};

function tutupSaranAwb(el) {
  const dl = daftarSaranAwb(el);
  if (!dl) return;
  dl.classList.add("d-none");
  dl.innerHTML = "";
  wadahSaranAwb(el).classList.remove("is-buka", "is-atas");
  el.setAttribute("aria-expanded", "false");
  el.removeAttribute("aria-activedescendant");
  saranAwb.aktif = -1;
  saranAwb.hasil = null;
}

// i < 0 = tanpa sorotan
function sorotSaranAwb(el, i) {
  const dl = daftarSaranAwb(el);
  const hasil = saranAwb.hasil;
  if (!dl || !hasil) return;
  saranAwb.aktif = i < 0 || !hasil.saran.length ? -1 : Math.min(i, hasil.saran.length - 1);
  dl.querySelectorAll(".saran-awb-opsi").forEach((opsi) => opsi.classList.toggle("is-aktif", Number(opsi.dataset.i) === saranAwb.aktif));
  const opsi = saranAwb.aktif >= 0 ? dl.querySelector(`[data-i="${saranAwb.aktif}"]`) : null;
  if (opsi) el.setAttribute("aria-activedescendant", opsi.id);
  else el.removeAttribute("aria-activedescendant");
}

/* Gambar ulang daftar sesuai isi kotak sekarang; ditutup bila tak ada
   saran. Dipanggil tiap ketikan, dan oleh panah bawah untuk membuka lagi
   daftar yang ditutup Esc. */
function segarkanSaranAwb(el) {
  const dl = daftarSaranAwb(el);
  if (!dl) return;
  if (!saranAwb.daftar) saranAwb.daftar = fundDaftarHouseAwb();
  const hasil = fundSaranAwb(el.value, el.selectionStart, saranAwb.daftar);
  if (!hasil.saran.length) {
    tutupSaranAwb(el);
    return;
  }
  const lama = saranAwb.hasil && saranAwb.hasil.saran[saranAwb.aktif];
  saranAwb.hasil = hasil;
  const sama = (n) => n.kunci === hasil.kunci;
  dl.innerHTML = hasil.saran
    .map((n, i) => {
      const keterangan = [n.jenis, n.pihak].filter(Boolean).join(" · ");
      // Spasi di antara nomor dan keterangan: dibaca/disalin sebagai "NOMOR Sea Import · PT X", bukan "NOMORSea Import…"
      return `<div class="saran-awb-opsi" id="saranAwbOpsi${i}" role="option" data-i="${i}" aria-selected="${sama(n)}"><span class="saran-awb-isi"><span class="saran-awb-nomor">${fundSorotAwb(n.nomor, hasil.kunci)}</span> <span class="saran-awb-ket">${escapeHtml(keterangan)}</span></span>${sama(n) ? '<i class="bi bi-check2" aria-hidden="true"></i>' : ""}</div>`;
    })
    .join("");
  dl.classList.remove("d-none");
  /* Dibuka ke atas bila ruang di bawah kotak tak cukup untuk empat baris
     (kotak di dekat tepi bawah layar, papan ketik ponsel terbuka) dan di
     atasnya muat. Bila tidak muat di mana pun, tetap di bawah dan halaman
     digulir secukupnya agar seluruh daftar terlihat. */
  const wadah = wadahSaranAwb(el);
  const ruang = fundRuangSaranAwb(el);
  const naik = fundNaikSaranAwb(ruang.bawah, ruang.atas);
  wadah.classList.toggle("is-atas", naik);
  wadah.classList.add("is-buka");
  if (!naik && ruang.bawah < FUND_SARAN_AWB_RUANG && typeof dl.scrollIntoView === "function") dl.scrollIntoView({ block: "nearest" });
  el.setAttribute("aria-expanded", "true");
  // Sorotan dipertahankan di nomor yang sama bila masih ada; selain itu tanpa sorotan
  sorotSaranAwb(el, lama ? hasil.saran.findIndex((n) => n.kunci === lama.kunci) : -1);
}

function pilihSaranAwb(el, i) {
  const n = saranAwb.hasil && saranAwb.hasil.saran[i];
  if (!n) return;
  const pasang = fundPasangSaranAwb(saranAwb.hasil, n.nomor);
  tutupSaranAwb(el);
  el.value = pasang.nilai;
  try {
    el.setSelectionRange(pasang.kursor, pasang.kursor);
  } catch (err) {
    /* kursor tak bisa dipindah di kotak ini -- isinya tetap terpasang */
  }
  // Seperti diketik lalu ditinggalkan: isian otomatis jadwal & tabel rincian ikut
  saranAwb.memilih = true;
  try {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } finally {
    saranAwb.memilih = false;
  }
}

document.addEventListener("focusin", (e) => {
  // Giliran mengetik baru: daftar jadwal disusun ulang pada ketikan pertama
  if (e.target.closest && e.target.closest(SELEKTOR_AWB)) saranAwb.daftar = null;
});

document.addEventListener("input", (e) => {
  const el = e.target.closest && e.target.closest(SELEKTOR_AWB);
  if (!el || saranAwb.memilih || e.isComposing) return;
  /* Hanya saat kotaknya sedang dipakai mengetik: isian dari impor invoice /
     draf yang dipulihkan mengirim `input` juga, tanpa fokus di kotak ini. */
  if (document.activeElement !== el) return;
  segarkanSaranAwb(el);
});

/* Fase TANGKAP: harus jalan sebelum pendengar Enter di ui/fokus.js yang
   memindahkan kursor ke isian berikutnya -- begitu kursor pindah, daftar
   ini ikut tertutup (focusout) dan saran yang disorot tak sempat terpilih. */
document.addEventListener("keydown", (e) => {
  const el = e.target.closest && e.target.closest(SELEKTOR_AWB);
  if (!el || e.isComposing) return;
  const buka = saranAwbTerbuka(el);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!buka) {
      if (e.key !== "ArrowDown") return;
      segarkanSaranAwb(el);
      if (!saranAwbTerbuka(el)) return; // tak ada saran: panah tetap menggeser kursor
      e.preventDefault();
      sorotSaranAwb(el, 0);
      return;
    }
    e.preventDefault();
    // Panah atas dari saran pertama = kembali tanpa sorotan
    sorotSaranAwb(el, e.key === "ArrowDown" ? saranAwb.aktif + 1 : saranAwb.aktif - 1);
  } else if (e.key === "Enter" && buka) {
    /* Hanya saran yang SENGAJA disorot yang dipilih. Enter yang sama tetap
       memindahkan kursor ke isian berikutnya (ui/fokus.js), seperti kotak
       bersaran lain di form ini. */
    if (saranAwb.aktif >= 0) pilihSaranAwb(el, saranAwb.aktif);
    else tutupSaranAwb(el);
  } else if (e.key === "Escape" && buka) {
    e.preventDefault();
    e.stopPropagation();
    tutupSaranAwb(el);
  } else if (e.key === "Tab" && buka) {
    tutupSaranAwb(el);
  }
}, true);

// Klik di daftar tidak memindahkan fokus dari kotaknya
document.addEventListener("mousedown", (e) => {
  if (e.target.closest && e.target.closest(".saran-awb-daftar")) e.preventDefault();
});
document.addEventListener("click", (e) => {
  const opsi = e.target.closest && e.target.closest(".saran-awb-opsi");
  if (!opsi) return;
  const el = wadahSaranAwb(opsi).querySelector(SELEKTOR_AWB_ISIAN);
  if (el) pilihSaranAwb(el, Number(opsi.dataset.i));
});

// Fokus pindah ke luar kotak & daftarnya (Tab, klik di tempat lain): daftar ditutup
document.addEventListener("focusout", (e) => {
  const el = e.target.closest && e.target.closest(SELEKTOR_AWB);
  if (!el) return;
  const wadah = wadahSaranAwb(el);
  if (wadah && wadah.contains(e.relatedTarget)) return;
  tutupSaranAwb(el);
});
