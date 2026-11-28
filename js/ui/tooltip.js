"use strict";

/* ------------------------------------------------------------------
   TOOLTIP

   Keterangan tombol ikon (pensil, tempat sampah, mata, ⋯, tombol tutup,
   tautan rel menu) ditulis di atribut `title` -- tetap sumbernya. Yang
   diganti hanya CARA MENAMPILKANNYA:

     - Tooltip bawaan peramban baru muncul sesudah ~1 detik, rupanya lain
       di tiap peramban, dan TIDAK PERNAH muncul saat tombolnya difokus
       lewat papan ketik.
     - Di sini: muncul 350 ms sesudah disorot tetikus, langsung saat
       difokus dengan Tab, sewarna aplikasi, dan tidak keluar layar.

   Hanya untuk tombol & tautan (bukan kotak isian: tooltip di atas kotak
   yang sedang diketik menutupi daftar sarannya). Layar sentuh tidak
   punya sorot, jadi tidak ada yang berubah di sana.

   Supaya tooltip bawaan tidak ikut muncul, `title` dipindah sebentar ke
   data-tip-judul selama tooltip ini tampil, lalu dikembalikan -- kecuali
   kodenya sudah menulis `title` baru selama itu (yang baru dipakai).
   Pembaca layar tidak terpengaruh: saat fokus papan ketik `title`
   tidak disentuh, dan tooltip ini sendiri aria-hidden (keterangannya
   sudah dibacakan dari title / aria-label tombolnya).
------------------------------------------------------------------ */
/* .tip-ringkas[title]: keterangan teks yang ditampilkan SINGKAT, kalimat
   lengkapnya di title (keterangan kurs NDPBM, petunjuk status form). */
const TIP_SASARAN =
  'button[title], a[title], [role="button"][title], summary[title], .tip-ringkas[title], [data-pintasan], .modal [data-bs-dismiss="modal"]';
const TIP_TUNDA_SOROT = 350;

/* ------------------------------------------------------------------
   PINTASAN PAPAN KETIK DI TOOLTIP

   Tombol yang punya pintasan menampilkan tombol papan ketiknya sebagai
   <kbd> di tooltip-nya: "Terbitkan Nomor  [Ctrl] [S]". Sumbernya:

     - data-pintasan="Mod+S" -- Mod = Ctrl (⌘ di Mac; semua pendengar
       pintasan menerima Ctrl maupun ⌘). Beberapa pilihan dipisah " / ".
       Keterangan singkat opsional: data-pintasan-ket (+ data-pintasan-
       ket-en), mis. "di baris terakhir" untuk Enter yang menambah baris.
     - keterangan lama yang sudah tertulis di title: "Tutup (Esc)",
       "Simpan (Ctrl+S)" -- tanda kurungnya diangkat jadi <kbd>.

   Tombol yang hanya ber-data-pintasan (tanpa title) tetap bertooltip:
   teksnya label tombol itu sendiri. aria-keyshortcuts dipasang supaya
   pembaca layar ikut menyebut pintasannya.
------------------------------------------------------------------ */
const PINTASAN_MAC = /Mac|iPhone|iPad|iPod/i.test(
  (typeof navigator !== "undefined" && ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)) || "",
);
const PINTASAN_NAMA = { mod: PINTASAN_MAC ? "⌘" : "Ctrl", ctrl: PINTASAN_MAC ? "⌘" : "Ctrl", shift: "Shift", alt: PINTASAN_MAC ? "⌥" : "Alt", esc: "Esc", escape: "Esc", enter: "Enter", tab: "Tab", space: "Spasi" };
const PINTASAN_ARIA = { mod: PINTASAN_MAC ? "Meta" : "Control", ctrl: PINTASAN_MAC ? "Meta" : "Control", shift: "Shift", alt: "Alt", esc: "Escape", escape: "Escape", enter: "Enter", tab: "Tab", "←": "ArrowLeft", "→": "ArrowRight", "↑": "ArrowUp", "↓": "ArrowDown", space: "Space" };
/* Satu tombol papan ketik yang dikenali di dalam tanda kurung title */
const PINTASAN_DI_JUDUL =
  /\s*\(((?:(?:Ctrl|⌘|Cmd|Shift|Alt|Mod)\+)+(?:Esc|Enter|Tab|←|→|↑|↓|F\d{1,2}|[A-Z0-9/?])|Esc|Enter|Tab|←|→|↑|↓|F\d{1,2}|[/?])\)/;

// "Mod+S / Enter" -> [["Mod","S"],["Enter"]]
function pintasanUrai(spec) {
  return String(spec || "")
    .split(" / ")
    .map((alt) => alt.split("+").map((k) => k.trim()).filter(Boolean))
    .filter((alt) => alt.length);
}
const pintasanNama = (k) => PINTASAN_NAMA[k.toLowerCase()] || (k.length === 1 ? k.toUpperCase() : k);
const pintasanAriaDari = (spec) =>
  pintasanUrai(spec)
    .map((alt) => alt.map((k) => PINTASAN_ARIA[k.toLowerCase()] || (k.length === 1 ? k.toUpperCase() : k)).join("+"))
    .join(" ");

/* Isi tooltip: teks + pintasan (+ keterangannya). */
function tipIsi(el) {
  let teks = (el.getAttribute("title") || el.dataset.tipJudul || "").trim();
  let spec = el.dataset.pintasan || "";
  if (!spec && teks) {
    const m = teks.match(PINTASAN_DI_JUDUL);
    if (m) {
      spec = m[1].replace(/^Cmd\+|^⌘\+/, "Mod+");
      teks = teks.replace(m[0], "").replace(/\s{2,}/g, " ").trim();
    }
  }
  /* Tombol penutup pop-up (X, Batal, Tutup): Esc menutup pop-up yang
     sama -- kecuali pop-up yang sengaja tidak bisa ditutup dengan Esc
     (data-bs-keyboard="false"). */
  if (!spec && el.matches('.modal [data-bs-dismiss="modal"]')) {
    const kotak = el.closest(".modal");
    if (kotak && kotak.getAttribute("data-bs-keyboard") !== "false") spec = "Esc";
  }
  if (!teks && spec) teks = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  const en = typeof activeLang !== "undefined" && activeLang === "en";
  const ket = (en && el.dataset.pintasanKetEn) || el.dataset.pintasanKet || "";
  return { teks, spec, ket };
}

/* Pintasan sebagai elemen <span class="app-tip-kunci"><kbd>Ctrl</kbd><kbd>S</kbd></span> */
function pintasanEl(spec, ket) {
  const wadah = document.createElement("span");
  wadah.className = "app-tip-kunci";
  pintasanUrai(spec).forEach((alt, i) => {
    if (i) wadah.appendChild(document.createTextNode("/"));
    alt.forEach((k) => {
      const kbd = document.createElement("kbd");
      kbd.textContent = pintasanNama(k);
      wadah.appendChild(kbd);
    });
  });
  if (ket) {
    const k = document.createElement("span");
    k.className = "app-tip-ket";
    k.textContent = ket;
    wadah.appendChild(k);
  }
  return wadah;
}

/* aria-keyshortcuts untuk tombol ber-data-pintasan (sekali sapu saat
   dimuat; tombol yang digambar kemudian mendapatkannya saat tooltip-nya
   pertama tampil). */
function pintasanPasangAria(akar) {
  (akar || document).querySelectorAll("[data-pintasan]:not([aria-keyshortcuts])").forEach((el) => {
    el.setAttribute("aria-keyshortcuts", pintasanAriaDari(el.dataset.pintasan));
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => pintasanPasangAria());
else pintasanPasangAria();

let tipEl = null;
let tipTarget = null; // tombol yang tooltipnya sedang tampil
let tipCalon = null; // tombol yang sedang ditunggu (jeda sorot)
let tipTimer = null;

function tipElemen() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "app-tip";
  tipEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(tipEl);
  return tipEl;
}

function tipTeks(el) {
  return tipIsi(el).teks;
}

function tipFokusPapanKetik(el) {
  try {
    return el.matches(":focus-visible");
  } catch (e) {
    return false;
  }
}

/* Letak: di ATAS tombolnya, di tengah; kalau ruang di atas tidak cukup
   -> di bawah. Di rel menu kiri (sidebar diciutkan) -> di kanan ikon.
   Selalu dijepit 8px dari tepi layar. */
function tipLetakkan(el) {
  const tip = tipElemen();
  const r = el.getBoundingClientRect();
  const kotak = tip.getBoundingClientRect();
  const jarak = 8;
  let arah = "atas";
  let x;
  let y;
  if (el.closest(".app-sidebar")) {
    arah = "kanan";
    x = r.right + jarak;
    y = r.top + r.height / 2 - kotak.height / 2;
  } else {
    x = r.left + r.width / 2 - kotak.width / 2;
    y = r.top - kotak.height - jarak;
    if (y < 8) {
      arah = "bawah";
      y = r.bottom + jarak;
    }
  }
  const maksX = window.innerWidth - kotak.width - 8;
  const xJepit = Math.max(8, Math.min(x, maksX));
  tip.style.left = Math.round(xJepit) + "px";
  tip.style.top = Math.round(Math.max(8, y)) + "px";
  tip.dataset.arah = arah;
  // Ujung panah tetap menunjuk tengah tombol walau kotaknya dijepit
  if (arah !== "kanan") tip.style.setProperty("--tip-panah", Math.round(r.left + r.width / 2 - xJepit) + "px");
}

/* TOOLTIP DI ATAS PERMUKAAN GELAP. Tooltipnya navy: di atas kartu navy
   (Nomor Berikutnya di Nomor Dokumen, menu & pita navy lain) ia nyaru
   dengan latarnya. Yang dilihat warna permukaan TEPAT di bawah tooltip
   (tooltipnya pointer-events: none, jadi elementFromPoint menembusnya)
   -- bukan warna tombolnya sendiri, yang bisa terang di atas kartu
   gelap. Permukaan gelap -> tooltip terang (.app-tip--kontras); di tema
   gelap kebalikannya (tooltip terang bawaannya, navy di atas permukaan
   terang). Tanpa tata letak (uji DOM): bukan gelap. */
function tipDiAtasGelap(tip) {
  if (typeof document.elementFromPoint !== "function") return false;
  const r = tip.getBoundingClientRect();
  if (!r.width) return false;
  for (let x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); x && x.nodeType === 1; x = x.parentElement) {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(x).backgroundColor || "");
    if (!m) continue;
    const [merah, hijau, biru, alfa = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (!(alfa > 0.5)) continue;
    return (0.2126 * merah + 0.7152 * hijau + 0.0722 * biru) / 255 < 0.45;
  }
  return false;
}

function tipTampilkan(el, dariSorot) {
  const isi = tipIsi(el);
  const teks = isi.teks;
  if (!teks || !el.isConnected) return;
  if (isi.spec && !el.hasAttribute("aria-keyshortcuts")) el.setAttribute("aria-keyshortcuts", pintasanAriaDari(isi.spec));
  tipSembunyikan();
  tipTarget = el;
  if (dariSorot && el.hasAttribute("title")) {
    el.dataset.tipJudul = el.getAttribute("title");
    el.removeAttribute("title");
    /* Tombol ikon yang namanya HANYA dari title tetap bernama selama
       title-nya dipinjam (kendali suara: "klik Hapus"). */
    if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !el.textContent.trim()) {
      el.setAttribute("aria-label", el.dataset.tipJudul);
      el.dataset.tipAria = "1";
    }
  }
  const tip = tipElemen();
  tip.textContent = teks;
  if (isi.spec) tip.appendChild(pintasanEl(isi.spec, isi.ket));
  tip.classList.add("is-siap");
  tipLetakkan(el);
  const temaGelap = document.documentElement.dataset.tema === "gelap";
  const bawahGelap = tipDiAtasGelap(tip);
  tip.classList.toggle("app-tip--kontras", temaGelap ? !bawahGelap : bawahGelap);
  tip.classList.add("is-open");
}

function tipSembunyikan() {
  clearTimeout(tipTimer);
  clearTimeout(tipTimerTutup);
  tipTimer = null;
  tipCalon = null;
  const el = tipTarget;
  tipTarget = null;
  if (tipEl) tipEl.classList.remove("is-open", "is-siap");
  if (el && el.dataset.tipJudul != null) {
    if (!el.hasAttribute("title")) el.setAttribute("title", el.dataset.tipJudul);
    if (el.dataset.tipAria && el.getAttribute("aria-label") === el.dataset.tipJudul) el.removeAttribute("aria-label");
    delete el.dataset.tipJudul;
    delete el.dataset.tipAria;
  }
}

/* Pindah dari satu tombol bertooltip ke tombol di sebelahnya: yang baru
   langsung tampil, tanpa jeda lagi (barisan ikon dibaca sekali sapu). */
function tipJadwalkan(el, dariSorot, tunda) {
  clearTimeout(tipTimer);
  tipCalon = el;
  tipTimer = setTimeout(() => {
    tipCalon = null;
    tipTampilkan(el, dariSorot);
  }, tunda);
}

/* Meninggalkan tombol: tooltip ditutup sesaat kemudian (80 ms), bukan
   seketika -- kalau tetikus langsung masuk ke tombol bertooltip lain
   dalam jeda itu, tooltip berpindah tanpa menunggu jeda sorot lagi. */
let tipTimerTutup = null;
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest && e.target.closest(TIP_SASARAN + ", [data-tip-judul]");
  if (!el || el.disabled) return;
  if (el === tipTarget) {
    clearTimeout(tipTimerTutup);
    return;
  }
  if (el === tipCalon) return;
  const berpindah = !!tipTarget;
  clearTimeout(tipTimerTutup);
  tipJadwalkan(el, true, berpindah ? 0 : TIP_TUNDA_SOROT);
});
document.addEventListener("mouseout", (e) => {
  const dari = e.target.closest && e.target.closest(TIP_SASARAN + ", [data-tip-judul]");
  if (!dari) return;
  // Masih di dalam tombol yang sama (pindah ke ikon di dalamnya): biarkan
  if (e.relatedTarget && dari.contains(e.relatedTarget)) return;
  if (dari === tipCalon) {
    clearTimeout(tipTimer);
    tipCalon = null;
  }
  if (dari === tipTarget) {
    clearTimeout(tipTimerTutup);
    tipTimerTutup = setTimeout(tipSembunyikan, 80);
  }
});
document.addEventListener("focusin", (e) => {
  const el = e.target.closest && e.target.closest(TIP_SASARAN);
  if (!el || !tipFokusPapanKetik(el)) return;
  tipJadwalkan(el, false, 120);
});
document.addEventListener("focusout", (e) => {
  if (e.target === tipTarget || (tipTarget && tipTarget.contains(e.target))) tipSembunyikan();
  else clearTimeout(tipTimer);
});
// Tekan, gulir, Esc, ganti halaman: tooltip lenyap seketika
document.addEventListener("pointerdown", tipSembunyikan, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && tipTarget) tipSembunyikan();
});
window.addEventListener("scroll", () => tipTarget && tipSembunyikan(), true);
window.addEventListener("hashchange", tipSembunyikan);
