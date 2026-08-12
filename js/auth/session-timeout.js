"use strict";

/* BATAS WAKTU SESI

   Papan ini sering ditinggalkan terbuka di komputer bersama. Tanpa
   batas waktu, siapa pun yang lewat bisa mengubah jadwal memakai akun
   yang masih terbuka.

   Yang dihitung adalah DIAM, bukan lama masuk: selama masih ada
   ketikan, klik, atau gulir, sesi tidak akan berakhir. Peringatan
   muncul satu menit sebelum waktunya habis, lengkap dengan hitung
   mundur — bukan tiba-tiba terlempar keluar di tengah mengisi form.

   BATASNYA MENGIKUTI PILIHAN "INGAT SAYA".

   Sebelumnya batasnya 30 menit untuk semua orang, tanpa memandang
   centang "Ingat saya di perangkat ini". Akibatnya centang itu terasa
   tidak berguna: ia menjanjikan sesi yang bertahan, lalu timer ini
   mencabutnya setengah jam kemudian — ditinggal rapat sekali saja
   sudah harus masuk lagi.

   Sekarang yang mencentangnya dapat 8 jam, kira-kira sepanjang satu
   hari kerja. Yang tidak mencentang tetap 30 menit: ia justru sedang
   menyatakan perangkat ini bukan miliknya sendiri.

   Batasnya TIDAK dihapus sama sekali walau dicentang. Di komputer yang
   dipakai bergantian, sesi yang tidak pernah putus berarti akun yang
   satu bisa dipakai menyimpan pekerjaan atas nama yang lain — dan
   riwayat perubahannya akan menunjuk orang yang salah.
*/

const SESI_DIAM_MENIT = 30;          // tanpa "ingat saya"
const SESI_DIAM_MENIT_INGAT = 480;   // 8 jam — dengan "ingat saya"
const SESI_PERINGATAN_DETIK = 60;

/* Dibaca SETIAP KALI timer disetel, bukan sekali saat berkas dimuat.

   bacaRemember() ada di session.js yang dimuat lebih dulu, tapi
   nilainya baru pasti setelah pengguna menekan Masuk. Menyimpannya ke
   dalam sebuah const di sini akan memakai nilai dari sesi SEBELUMNYA
   pada login pertama setelah pilihannya diubah. */
function batasDiamMenit() {
  const ingat = typeof bacaRemember === "function" ? bacaRemember() : true;
  return ingat ? SESI_DIAM_MENIT_INGAT : SESI_DIAM_MENIT;
}

let sesiTimerDiam = null;
let sesiTimerHitung = null;
let sesiSisaDetik = 0;
let sesiPeringatanTampil = false;
/* Batas yang BENAR-BENAR dipakai timer yang sedang berjalan. Pesan
   hitung mundur membacanya dari sini, bukan menghitung ulang: kalau
   dihitung ulang, pesannya bisa menyebut angka yang berbeda dari
   waktu yang sebenarnya sudah berlalu. */
let sesiDiamDipakai = SESI_DIAM_MENIT;

function sesiAktif() {
  return !!(authState && authState.user);
}

/* Menghitung ulang dari nol. Dipanggil tiap ada tanda pengguna masih
   di depan layar. */
function resetIdleTimer() {
  if (!sesiAktif()) return;
  clearTimeout(sesiTimerDiam);
  sesiDiamDipakai = batasDiamMenit();
  sesiTimerDiam = setTimeout(
    mulaiPeringatanSesi,
    Math.max(0, sesiDiamDipakai * 60 - SESI_PERINGATAN_DETIK) * 1000,
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
  return `Tidak ada aktivitas selama ${lamaDiamTerbaca()}. Anda akan keluar otomatis dalam ${sesiSisaDetik} detik.`;
}

/* "8 jam", bukan "480 menit". */
function lamaDiamTerbaca() {
  const m = sesiDiamDipakai;
  if (m < 60) return `${m} menit`;
  const jam = m / 60;
  const sisa = m % 60;
  return sisa === 0 ? `${jam} jam` : `${Math.floor(jam)} jam ${sisa} menit`;
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
