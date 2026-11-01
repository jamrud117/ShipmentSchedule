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
const TIP_SASARAN = 'button[title], a[title], [role="button"][title], summary[title]';
const TIP_TUNDA_SOROT = 350;

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
  return (el.getAttribute("title") || el.dataset.tipJudul || "").trim();
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

function tipTampilkan(el, dariSorot) {
  const teks = tipTeks(el);
  if (!teks || !el.isConnected) return;
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
  tip.classList.add("is-siap");
  tipLetakkan(el);
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
