"use strict";

/* BATAS WAKTU SESI

   Papan ini sering ditinggalkan terbuka di komputer bersama. Tanpa
   batas waktu, siapa pun yang lewat bisa mengubah jadwal memakai akun
   yang masih terbuka.

   Yang dihitung adalah DIAM, bukan lama masuk: selama masih ada
   ketikan, klik, atau gulir, sesi tidak akan berakhir. Peringatan
   muncul satu menit sebelum waktunya habis, lengkap dengan hitung
   mundur — bukan tiba-tiba terlempar keluar di tengah mengisi form.
*/

const SESI_DIAM_MENIT = 30;
const SESI_PERINGATAN_DETIK = 60;

let sesiTimerDiam = null;
let sesiTimerHitung = null;
let sesiSisaDetik = 0;
let sesiPeringatanTampil = false;

function sesiAktif() {
  return !!(authState && authState.user);
}

/* Menghitung ulang dari nol. Dipanggil tiap ada tanda pengguna masih
   di depan layar. */
function resetIdleTimer() {
  if (!sesiAktif()) return;
  clearTimeout(sesiTimerDiam);
  sesiTimerDiam = setTimeout(
    mulaiPeringatanSesi,
    Math.max(0, SESI_DIAM_MENIT * 60 - SESI_PERINGATAN_DETIK) * 1000,
  );
}

function hentikanTimerSesi() {
  clearTimeout(sesiTimerDiam);
  clearInterval(sesiTimerHitung);
  sesiTimerDiam = null;
  sesiTimerHitung = null;
  sesiPeringatanTampil = false;
}

function mulaiPeringatanSesi() {
  if (!sesiAktif() || sesiPeringatanTampil) return;
  sesiPeringatanTampil = true;
  sesiSisaDetik = SESI_PERINGATAN_DETIK;

  showConfirm(pesanHitungMundur(), lanjutkanSesi, {
    title: "Sesi Akan Berakhir",
    confirmText: "Lanjutkan Sesi",
    tone: "primary",
    icon: "bi-clock-history",
  });

  clearInterval(sesiTimerHitung);
  sesiTimerHitung = setInterval(() => {
    sesiSisaDetik -= 1;
    const kotak = $("#confirmMessage");
    if (kotak) kotak.textContent = pesanHitungMundur();
    if (sesiSisaDetik <= 0) {
      clearInterval(sesiTimerHitung);
      tutupKotakKonfirmasi();
      showToast("Sesi berakhir karena tidak ada aktivitas.", "danger");
      setTimeout(signOut, 400);
    }
  }, 1000);
}

function pesanHitungMundur() {
  return `Tidak ada aktivitas selama ${SESI_DIAM_MENIT} menit. Anda akan keluar otomatis dalam ${sesiSisaDetik} detik.`;
}

function lanjutkanSesi() {
  sesiPeringatanTampil = false;
  clearInterval(sesiTimerHitung);
  resetIdleTimer();
  showToast("Sesi dilanjutkan.", "dark");
}

function tutupKotakKonfirmasi() {
  const el = document.getElementById("confirmModal");
  if (!el) return;
  const inst = bootstrap.Modal.getInstance(el);
  if (inst) inst.hide();
}

/* Menutup kotak peringatan dianggap "saya masih di sini" — sama
   seperti menekan Lanjutkan. Membiarkannya terbuka sampai hitungan
   habis barulah keluar. */
const kotakKonfirmasiEl = document.getElementById("confirmModal");
if (kotakKonfirmasiEl) {
  kotakKonfirmasiEl.addEventListener("hidden.bs.modal", () => {
    if (sesiPeringatanTampil && sesiSisaDetik > 0) lanjutkanSesi();
  });
}

/* Tanda pengguna masih di depan layar. `passive` supaya pemantauan ini
   tidak memperlambat gulir. */
["mousedown", "keydown", "wheel", "touchstart", "scroll"].forEach((ev) => {
  window.addEventListener(
    ev,
    () => {
      if (sesiPeringatanTampil) return; // biarkan hitung mundur berjalan
      resetIdleTimer();
    },
    { passive: true },
  );
});

/* Kembali dari tab lain: hitung ulang, karena timer bisa saja
   diperlambat peramban saat tab tidak aktif. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !sesiPeringatanTampil) resetIdleTimer();
});
