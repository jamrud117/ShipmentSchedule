"use strict";

/* ==================================================================
   NOTIFIKASI KEBERANGKATAN & KEDATANGAN (ikon lonceng)

   Pemicu: H-1 dari ETD dan H-1 dari ETA yang BERLAKU -- revisi delay
   ikut (effectiveEtd / effectiveEta). Notifikasinya tampil sejak H-1
   ("besok") sampai akhir hari H ("hari ini"), lalu hilang sendiri.

   Notifikasi DIHITUNG dari jadwal, bukan baris database: semua yang
   bisa membuka Jadwal melihat yang sama. Yang disimpan -- localStorage,
   per akun & per perangkat -- hanya:
     dibaca  notifikasi mana yang sudah dibaca;
     lacak   tanggal yang terakhir DINOTIFIKASI per jadwal & jenis.

   NOTIFIKASI ULANG. Kunci tiap notifikasi memuat tanggal & generasinya.
   Begitu ETD/ETA jadwal yang sudah pernah dinotifikasi berubah,
   generasinya naik: notifikasi lama hilang, dan yang baru muncul (belum
   dibaca) begitu tanggal barunya mencapai H-1 -- juga kalau tanggalnya
   dikembalikan ke yang semula.

   Buku Import: jadwal yang sudah tiba (In Factory) tidak dinotifikasi.
   Buku Export dinyatakan Delivered sejak ETD-nya lewat (status.js),
   jadi tidak disaring: ETA ke pelabuhan pembeli tetap diberitahukan.
================================================================== */

const NOTIF_AWALAN_SIMPAN = "exim.notif.";
const NOTIF_SEGAR_MS = 5 * 60 * 1000; // menangkap pergantian hari saat aplikasi terus terbuka
const NOTIF_SIMPAN_HARI = 45; // catatan dibaca / lacak yang lebih tua dibuang

let notifDaftar = [];
let notifBelumDibacaTerakhir = 0;

function notifKunciSimpan() {
  const u = typeof authState !== "undefined" && authState.user;
  return NOTIF_AWALAN_SIMPAN + ((u && u.id) || "anon");
}
function notifMuatKeadaan() {
  try {
    const x = JSON.parse(localStorage.getItem(notifKunciSimpan()) || "null");
    if (x && typeof x === "object") return { dibaca: x.dibaca || {}, lacak: x.lacak || {} };
  } catch (e) {
    /* Rusak / tidak bisa dibaca: mulai bersih */
  }
  return { dibaca: {}, lacak: {} };
}
function notifSimpanKeadaan(k) {
  try {
    localStorage.setItem(notifKunciSimpan(), JSON.stringify(k));
  } catch (e) {
    /* Penuh / diblokir: notifikasinya tetap tampil, hanya status dibacanya yang tidak diingat */
  }
}

function notifTanggal(s, jenis) {
  return (jenis === "etd" ? effectiveEtd(s) : effectiveEta(s)) || "";
}

/* Notifikasi yang aktif hari ini, sekaligus memperbarui pelacak tanggal.
   `hariIni` hanya untuk pengujian. */
function hitungNotifikasi(hariIni) {
  const kini = hariIni || todayISO();
  const keadaan = notifMuatKeadaan();
  let berubah = false;
  const semua = typeof data !== "undefined" && data ? [].concat(data.import || [], data.export || []) : [];
  const ada = new Set();
  const hasil = [];

  semua.forEach((s) => {
    if (!s || !s.id) return;
    ada.add(String(s.id));
    ["etd", "eta"].forEach((jenis) => {
      const tgl = notifTanggal(s, jenis);
      const kLacak = s.id + "|" + jenis;
      let lacak = keadaan.lacak[kLacak];
      // Tanggalnya berubah sesudah pernah dinotifikasi -> generasi baru
      if (lacak && lacak.tgl !== tgl) {
        lacak = { tgl, gen: (lacak.gen || 0) + 1, dulu: lacak.tgl || lacak.dulu || "" };
        keadaan.lacak[kLacak] = lacak;
        berubah = true;
      }
      if (!tgl) return;
      const pemicu = addCalendarDaysISO(tgl, -1);
      if (!pemicu || kini < pemicu || kini > tgl) return;
      if (s.mode !== "export" && isArrived(s)) return;
      if (!lacak) {
        lacak = { tgl, gen: 0, dulu: "" };
        keadaan.lacak[kLacak] = lacak;
        berubah = true;
      }
      const kunci = `${kLacak}|${tgl}|${lacak.gen}`;
      hasil.push({
        kunci,
        s,
        jenis,
        tgl,
        hariIni: tgl === kini,
        dulu: lacak.dulu && lacak.dulu !== tgl ? lacak.dulu : "",
        dibaca: !!keadaan.dibaca[kunci],
      });
    });
  });

  /* Bersih-bersih: jadwal yang sudah dihapus, tanggal yang sudah lama
     lewat, catatan dibaca milik notifikasi yang sudah lama selesai.
     Hanya sesudah data benar-benar dimuat -- daftar kosong saat masih
     memuat bukan berarti semua jadwal dihapus. */
  if (typeof shipmentsLoaded !== "undefined" && shipmentsLoaded) {
    const batas = addCalendarDaysISO(kini, -NOTIF_SIMPAN_HARI);
    Object.keys(keadaan.lacak).forEach((k) => {
      const l = keadaan.lacak[k];
      if (!ada.has(k.split("|")[0]) || (l.tgl && l.tgl < batas)) {
        delete keadaan.lacak[k];
        berubah = true;
      }
    });
    Object.keys(keadaan.dibaca).forEach((k) => {
      const tgl = k.split("|")[2] || "";
      if (!ada.has(k.split("|")[0]) || tgl < batas) {
        delete keadaan.dibaca[k];
        berubah = true;
      }
    });
  }
  if (berubah) notifSimpanKeadaan(keadaan);

  // Hari ini dulu, lalu besok; yang belum dibaca di atas; berangkat sebelum tiba
  hasil.sort(
    (a, b) =>
      (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) ||
      Number(a.dibaca) - Number(b.dibaca) ||
      (a.jenis === b.jenis ? 0 : a.jenis === "etd" ? -1 : 1) ||
      String(a.s.party || "").localeCompare(String(b.s.party || "")),
  );
  return hasil;
}

function tandaiNotifDibaca(kunciDaftar) {
  const keadaan = notifMuatKeadaan();
  const kini = todayISO();
  [].concat(kunciDaftar).forEach((k) => {
    if (k) keadaan.dibaca[k] = kini;
  });
  notifSimpanKeadaan(keadaan);
  notifDaftar.forEach((n) => {
    if ([].concat(kunciDaftar).indexOf(n.kunci) >= 0) n.dibaca = true;
  });
  gambarLonceng();
  if (panelNotifTerbuka()) gambarPanelNotif();
}

/* ---------- tampilan ---------- */

function notifJudul(n) {
  const kapan = n.hariIni ? tt("hari ini", "today") : tt("besok", "tomorrow");
  return n.jenis === "etd"
    ? tt(`Berangkat ${kapan}`, `Departs ${kapan}`) + ` · ETD ${fmtDate(n.tgl)}`
    : tt(`Tiba ${kapan}`, `Arrives ${kapan}`) + ` · ETA ${fmtDate(n.tgl)}`;
}

function notifMeta(n) {
  const s = n.s;
  const rute = [s.origin, s.destination].filter(hasMeaningfulValue).join(" → ");
  const angkut = carrierNameFromShipment(s);
  const bl = [s.houseBL, s.masterBL].find(hasMeaningfulValue) || "";
  return [s.mode === "export" ? "Export" : "Import", rute, angkut, bl].filter(Boolean).join(" · ");
}

function notifItemHtml(n) {
  return `<button type="button" class="notif-item${n.dibaca ? "" : " is-baru"}" data-notif-kunci="${escapeAttr(n.kunci)}" data-notif-jadwal="${escapeAttr(n.s.id)}">
    <span class="notif-ikon notif-ikon--${n.jenis}" aria-hidden="true"><i class="bi ${n.jenis === "etd" ? "bi-arrow-up-right" : "bi-arrow-down-left"}"></i></span>
    <span class="notif-teks">
      <span class="notif-judul">${escapeHtml(notifJudul(n))}</span>
      <span class="notif-pihak">${escapeHtml(dispVal(n.s.party))}</span>
      <span class="notif-meta">${escapeHtml(notifMeta(n))}</span>
      ${n.dulu ? `<span class="notif-ubah"><i class="bi bi-arrow-repeat" aria-hidden="true"></i> ${escapeHtml(tt(`Jadwal diubah dari ${fmtDate(n.dulu)}`, `Rescheduled from ${fmtDate(n.dulu)}`))}</span>` : ""}
    </span>
    ${n.dibaca ? "" : `<span class="notif-titik"><span class="visually-hidden">${escapeHtml(tt("Belum dibaca", "Unread"))}</span></span>`}
  </button>`;
}

function gambarPanelNotif() {
  const isi = document.getElementById("notifIsi");
  if (!isi) return;
  const belum = notifDaftar.filter((n) => !n.dibaca).length;
  const tombolSemua = document.getElementById("btnNotifBacaSemua");
  if (tombolSemua) tombolSemua.hidden = belum === 0;
  if (!notifDaftar.length) {
    isi.innerHTML = `<div class="notif-kosong"><i class="bi bi-bell-slash" aria-hidden="true"></i><p>${escapeHtml(
      tt("Belum ada notifikasi. Jadwal yang berangkat atau tiba besok akan muncul di sini.", "No notifications yet. Schedules departing or arriving tomorrow will appear here."),
    )}</p></div>`;
    return;
  }
  const kelompok = [
    [tt("Hari ini", "Today"), notifDaftar.filter((n) => n.hariIni)],
    [tt("Besok", "Tomorrow"), notifDaftar.filter((n) => !n.hariIni)],
  ].filter(([, d]) => d.length);
  isi.innerHTML = kelompok
    .map(([judul, daftar]) => `<div class="notif-kelompok">${escapeHtml(judul)}</div>${daftar.map(notifItemHtml).join("")}`)
    .join("");
}

function gambarLonceng() {
  const belum = notifDaftar.filter((n) => !n.dibaca).length;
  document.querySelectorAll("[data-notif-buka]").forEach((b) => {
    const lencana = b.querySelector(".notif-lencana");
    if (lencana) {
      lencana.textContent = belum > 99 ? "99+" : String(belum);
      lencana.hidden = belum === 0;
    }
    b.setAttribute(
      "aria-label",
      belum
        ? tt(`Notifikasi, ${belum} belum dibaca`, `Notifications, ${belum} unread`)
        : tt("Notifikasi", "Notifications"),
    );
    // Lonceng bergoyang sekali saat ada yang BARU, bukan tiap digambar ulang
    if (belum > notifBelumDibacaTerakhir) goyangLonceng(b);
  });
  notifBelumDibacaTerakhir = belum;
}

/* Lewat Web Animations, bukan kelas CSS yang dilepas-pasang: memulai
   ulang animasi kelas butuh membaca tata letak, dan ini terjadi tepat
   saat papan baru selesai digambar. */
function goyangLonceng(tombol) {
  const ikon = tombol.querySelector(".ic");
  if (!ikon || typeof ikon.animate !== "function") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ikon.animate(
    [
      { transform: "rotate(0)" },
      { transform: "rotate(16deg)" },
      { transform: "rotate(-13deg)" },
      { transform: "rotate(9deg)" },
      { transform: "rotate(-5deg)" },
      { transform: "rotate(0)" },
    ],
    { duration: 800, easing: "ease-in-out" },
  );
}

/* Dari render(): dikumpulkan & dijalankan SESUDAH gambar, sekali untuk
   serentetan render (mengetik di kotak cari, ganti halaman). */
let notifTunda = null;
function jadwalkanNotif() {
  clearTimeout(notifTunda);
  notifTunda = setTimeout(notifSegarkan, 120);
}

/* Hitung ulang & gambar. Lewat jadwalkanNotif() setiap data jadwal
   digambar ulang, berkala, dan saat tab kembali dilihat. */
function notifSegarkan() {
  if (typeof authState === "undefined" || !authState.user) return;
  if (typeof shipmentsLoaded !== "undefined" && !shipmentsLoaded) return;
  notifDaftar = hitungNotifikasi();
  gambarLonceng();
  if (panelNotifTerbuka()) gambarPanelNotif();
}

/* ---------- panel ---------- */

function panelNotifTerbuka() {
  const p = document.getElementById("notifPanel");
  return !!(p && !p.hidden);
}

let notifPemicuTerakhir = null;
function bukaPanelNotif(pemicu) {
  const p = document.getElementById("notifPanel");
  if (!p) return;
  notifPemicuTerakhir = pemicu || null;
  // Di laci ponsel: tutup lacinya dulu supaya panelnya tidak tertutup
  if (typeof sbTutup === "function") sbTutup(false);
  notifSegarkan();
  gambarPanelNotif();
  p.hidden = false;
  document.querySelectorAll("[data-notif-buka]").forEach((b) => b.setAttribute("aria-expanded", "true"));
  p.focus({ preventScroll: true });
}

function tutupPanelNotif(kembalikanFokus) {
  const p = document.getElementById("notifPanel");
  if (!p || p.hidden) return;
  p.hidden = true;
  document.querySelectorAll("[data-notif-buka]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  // Lonceng yang sedang tersembunyi (bilah atas di desktop) diabaikan peramban saat difokus
  if (kembalikanFokus && notifPemicuTerakhir) notifPemicuTerakhir.focus({ preventScroll: true });
}

document.addEventListener("click", (e) => {
  const pemicu = e.target.closest("[data-notif-buka]");
  if (pemicu) {
    e.preventDefault();
    if (panelNotifTerbuka()) tutupPanelNotif(false);
    else bukaPanelNotif(pemicu);
    return;
  }
  if (e.target.closest("#btnNotifBacaSemua")) {
    tandaiNotifDibaca(notifDaftar.filter((n) => !n.dibaca).map((n) => n.kunci));
    return;
  }
  if (e.target.closest("#btnNotifTutup")) {
    tutupPanelNotif(true);
    return;
  }
  const item = e.target.closest("[data-notif-kunci]");
  if (item) {
    // Klik notifikasi: tandai dibaca, lalu buka detail jadwalnya
    tandaiNotifDibaca(item.dataset.notifKunci);
    tutupPanelNotif(false);
    openDetailView(item.dataset.notifJadwal);
    return;
  }
  // Klik di luar panel menutupnya
  if (panelNotifTerbuka() && !e.target.closest("#notifPanel")) tutupPanelNotif(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panelNotifTerbuka()) {
    e.preventDefault();
    tutupPanelNotif(true);
  }
});

// Berkala + saat tab kembali dilihat: hari bisa berganti saat aplikasi terbuka terus
setInterval(notifSegarkan, NOTIF_SEGAR_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") notifSegarkan();
});
