"use strict";

/* SESI & HAK AKSES */

const authState = { user: null, profile: null, siap: false };

/* Peran 'exim' boleh mengubah data; sisanya hanya melihat */
function canEdit() {
  return !!authState.profile && authState.profile.role === "exim";
}

function currentRoleLabel() {
  if (!authState.profile) return "—";
  return authState.profile.role === "exim" ? "EXIM" : "Viewer";
}

/* Ambil profil (berisi peran) milik akun yang sedang login */
async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, full_name, username, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Gagal membaca profil:", error);
    return null;
  }
  /* Belum punya baris profil: diperlakukan sebagai viewer, bukan exim */
  return data || { id: userId, email: "", full_name: "", username: "", role: "viewer" };
}

/* Supabase Auth hanya mengenal email. Username ditukar jadi email lebih
   dulu lewat RPC email_for_login (lihat auth-roles-migration.sql).
   Kalau yang diketik sudah berbentuk email, dipakai apa adanya — jadi
   akun lama tetap bisa masuk seperti biasa. */
async function resolveLoginEmail(masukan) {
  const t = (masukan || "").trim();
  if (!t) return null;
  if (t.includes("@")) return t;

  const { data, error } = await supabaseClient.rpc("email_for_login", {
    p_username: t,
  });
  if (!error && data) return data;
  if (error) console.error("Gagal menukar username:", error);

  /* Cadangan: akun yang dibuat lewat halaman Akun memakai alamat bentukan
     "<username>@<domain internal>". Kalau RPC tidak menemukan apa pun —
     misalnya baris profilnya belum sempat dibuat — alamat itu masih bisa
     disusun sendiri dan login tetap jalan. */
  return emailFromUsername(t);
}

async function signIn(masukan, password) {
  const email = await resolveLoginEmail(masukan);
  if (!email) {
    return { ok: false, message: t("s.username.atau.email.itu.tidak.terdaftar") };
  }
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password: password || "",
  });
  if (error) return { ok: false, message: pesanLogin(error) };
  authState.user = data.user;
  authState.profile = await loadProfile(data.user.id);
  return { ok: true };
}

async function signOut() {
  if (typeof hentikanTimerSesi === "function") hentikanTimerSesi();
  await supabaseClient.auth.signOut();
  authState.user = null;
  authState.profile = null;
  location.hash = "#/";
  location.reload();
}

/* Pesan bawaan Supabase berbahasa Inggris & teknis */
function pesanLogin(error) {
  const t = (error && error.message ? error.message : "").toLowerCase();
  if (t.includes("invalid login")) return t("s.username.email.atau.kata.sandi.salah");
  if (t.includes("email not confirmed"))
    return t("s.akun.belum.aktif.minta.admin.menjalankan.ulang");
  if (t.includes("rate limit") || t.includes("too many"))
    return "Terlalu banyak percobaan. Coba lagi beberapa menit.";
  if (t.includes("failed to fetch") || t.includes("network"))
    return t("s.tidak.bisa.menghubungi.server.periksa.koneksi");
  return error && error.message ? error.message : "Login gagal.";
}

/* ------------------------------------------------------------------
   PENERAPAN HAK AKSES DI TAMPILAN

   Dikerjakan lewat satu kelas di <body>, bukan menyunting tiap tombol.
   Daftar & kartu digambar ulang terus-menerus; kalau tombolnya
   dimatikan satu per satu, setiap render baru akan mengembalikannya.
------------------------------------------------------------------ */
function applyPermissions() {
  const boleh = canEdit();
  document.body.classList.toggle("is-viewer", !boleh);
  document.body.classList.toggle("is-editor", boleh);

  const chip = $("#userChip");
  if (chip && authState.profile) {
    /* Email sengaja TIDAK ditampilkan di sini: bilah atas terlihat oleh
       siapa pun yang lewat di depan layar. Cukup nama & peran. */
    $("#userChipName").textContent =
      authState.profile.full_name ||
      authState.profile.username ||
      "Pengguna";
    const badge = $("#userChipRole");
    badge.textContent = currentRoleLabel();
    badge.classList.toggle("is-exim", boleh);
  }

  /* Isian yang sudah tergambar dimatikan juga — CSS bisa menyembunyikan
     tombol, tapi tidak bisa membuat <input> berhenti menerima ketikan */
  if (!boleh) lockInputs();
}

function lockInputs() {
  document
    .querySelectorAll(
      "#cardContainer input, #cardContainer select, #cardContainer textarea," +
        " #viewDocNum input, #viewDocNum select, #viewDocNum textarea",
    )
    .forEach((el) => {
      if (el.dataset.viewerLocked) return;
      el.dataset.viewerLocked = "1";
      el.disabled = true;
    });
}

/* Penjaga untuk aksi yang mengubah data. Dipanggil di awal tiap
   penangan; UI-nya memang sudah disembunyikan, ini lapis kedua */
function requireEdit(pesan) {
  if (canEdit()) return true;
  showToast(
    pesan || t("s.hanya.peran.exim.yang.boleh.mengubah.data"),
    "danger",
  );
  return false;
}

/* ------------------------------------------------------------------
   LAYAR LOGIN
------------------------------------------------------------------ */

function hideBootScreen() {
  const b = $("#bootScreen");
  if (!b || b.classList.contains("is-done")) return;
  b.classList.add("is-done");
  setTimeout(() => b.remove(), 350);
}

function showLoginView() {
  hideBootScreen();
  $("#viewLogin").classList.remove("d-none");
  tutupUserMenu();
  document.body.classList.add("is-locked");
  ["#viewList", "#viewForm", "#viewDocNum", "#viewOverview"].forEach((sel) => {
    const el = $(sel);
    if (el) el.classList.add("d-none");
  });
  $(".app-topbar").classList.add("d-none");
  const footer = $("#appFooter");
  if (footer) footer.classList.add("d-none");
  setTimeout(() => $("#loginUsername").focus(), 60);
}

function hideLoginView() {
  hideBootScreen();
  $("#viewLogin").classList.add("d-none");
  document.body.classList.remove("is-locked");
  $(".app-topbar").classList.remove("d-none");
  const footer = $("#appFooter");
  if (footer) footer.classList.remove("d-none");
}

function setLoginError(pesan) {
  const box = $("#loginError");
  box.textContent = pesan || "";
  box.classList.toggle("d-none", !pesan);
}

function setLoginBusy(sibuk) {
  const btn = $("#btnLogin");
  btn.disabled = sibuk;
  btn.innerHTML = sibuk
    ? `<span class="spinner-border spinner-border-sm"></span> ${t("c.masuk.2")}`
    : `<i class="bi bi-box-arrow-in-right"></i> ${t("c.masuk")}`;
}

async function handleLoginSubmit() {
  const user = $("#loginUsername").value;
  const sandi = $("#loginPassword").value;
  if (!user.trim() || !sandi) {
    setLoginError(t("s.username.email.dan.kata.sandi.harus.diisi"));
    return;
  }
  setLoginError("");
  setLoginBusy(true);
  const ingat = !!($("#loginRemember") && $("#loginRemember").checked);
  simpanRemember(ingat, user.trim());

  /* try/finally: tanpa ini, sekali saja signIn() MELEMPAR error
     (jaringan putus, Supabase tak terjangkau) barisnya terlewat dan
     tombolnya berputar selamanya -- pengguna tidak punya cara mencoba
     lagi selain memuat ulang halaman. */
  let hasil;
  try {
    hasil = await signIn(user, sandi);
  } catch (err) {
    console.error(err);
    hasil = { ok: false, message: t("s.tidak.bisa.menghubungi.server.periksa.koneksi") };
  } finally {
    setLoginBusy(false);
  }
  if (!hasil.ok) {
    setLoginError(hasil.message);
    $("#loginPassword").select();
    return;
  }
  hideLoginView();
  applyPermissions();
  if (typeof resetIdleTimer === "function") resetIdleTimer();
  /* Dua kali, sama seperti initApp(): yang pertama menampilkan
     halamannya supaya layar tidak kosong selama data diambil, yang
     kedua membuka #/edit/<id> setelah jadwalnya ada. */
  router();
  await loadShipments();
  router();
}

$("#btnLogin").addEventListener("click", handleLoginSubmit);
["#loginUsername", "#loginPassword"].forEach((sel) => {
  $(sel).addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLoginSubmit();
  });
});
/* Memakai kotak konfirmasi aplikasi, bukan confirm() bawaan peramban —
   tampilannya berbeda di tiap peramban dan tidak mengikuti tema. */
/* Tombol mata pada isian sandi */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pwd-toggle]");
  if (!btn) return;
  const inp = $("#" + btn.dataset.pwdToggle);
  const buka = inp.type === "password";
  inp.type = buka ? "text" : "password";
  btn.querySelector("i").className = buka ? "bi bi-eye-slash" : "bi bi-eye";
  btn.title = buka ? "Sembunyikan kata sandi" : "Tampilkan kata sandi";
  inp.focus();
});

/* ------------------------------------------------------------------
   MENU AKUN (di bawah nama pengguna, bilah atas)

   Menggantikan tombol keluar mengambang di sudut kanan-bawah. */
function tutupUserMenu() {
  const menu = $("#userMenu");
  const chip = $("#userChip");
  if (menu) menu.classList.add("d-none");
  if (chip) chip.classList.remove("is-open");
}

/* Isi menu diperbarui tiap kali dibuka, bukan sekali saat halaman
   dimuat: profilnya baru tersedia setelah sesi terbaca. */
function isiUserMenu() {
  if (!authState.profile) return;
  /* Email boleh tampil di sini karena menu ini baru terbuka kalau
     pemiliknya sendiri yang membukanya. Chip-nya sendiri sengaja cuma
     nama & peran: bilah atas terlihat siapa pun yang lewat di depan
     layar. */
  const nm = $("#userMenuName");
  const em = $("#userMenuEmail");
  if (nm) {
    nm.textContent =
      authState.profile.full_name || authState.profile.username || "Pengguna";
  }
  if (em) {
    em.textContent =
      (authState.user && authState.user.email) ||
      authState.profile.username ||
      "";
  }
}

function bukaUserMenu() {
  const menu = $("#userMenu");
  const chip = $("#userChip");
  if (!menu || !chip) return;
  menu.classList.remove("d-none");
  chip.classList.add("is-open");
  isiUserMenu();
}

const userChipEl = $("#userChip");
if (userChipEl) {
  /* DIBUKA SAAT KURSOR MELINTAS, bukan hanya saat diklik.

     Klik TETAP dipertahankan, bukan diganti: perangkat sentuh tidak
     punya hover sama sekali, jadi menu yang hanya mengandalkan hover
     tidak akan pernah bisa dibuka di ponsel.

     Penutupannya diberi jeda pendek -- kursor yang bergerak dari chip
     ke menu sempat keluar dari keduanya di sela-sela, dan tanpa jeda
     menunya menutup tepat saat hendak diklik. Jembatan tak terlihat
     (.user-menu::before di auth.css) menutup celah itu secara visual;
     jeda ini menjaganya saat kursor bergerak cepat. */
  let tundaTutup = null;
  userChipEl.addEventListener("mouseenter", () => {
    clearTimeout(tundaTutup);
    bukaUserMenu();
  });
  userChipEl.addEventListener("mouseleave", () => {
    clearTimeout(tundaTutup);
    tundaTutup = setTimeout(tutupUserMenu, 220);
  });

  userChipEl.addEventListener("click", (e) => {
    // Klik DI DALAM menunya sendiri tidak boleh ikut menutup/membuka lagi.
    if (e.target.closest("#userMenu")) return;
    clearTimeout(tundaTutup);
    const menu = $("#userMenu");
    if (!menu) return;
    const akanBuka = menu.classList.contains("d-none");
    menu.classList.toggle("d-none", !akanBuka);
    userChipEl.classList.toggle("is-open", akanBuka);
    if (akanBuka) isiUserMenu();
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#userChip")) tutupUserMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") tutupUserMenu();
});

const btnLogoutMenuEl = $("#btnLogoutMenu");
if (btnLogoutMenuEl) {
  btnLogoutMenuEl.addEventListener("click", () => {
    tutupUserMenu();
    showConfirm(t("s.sesi.anda.akan.ditutup.dan.halaman.kembali.ke."), () => signOut(), {
      title: t("s.keluar.dari.aplikasi"),
      confirmText: "Ya, Keluar",
      tone: "primary",
      icon: "bi-power",
    });
  });
}

/* ------------------------------------------------------------------
   INISIALISASI

   Mengembalikan true kalau sudah ada sesi yang sah.
------------------------------------------------------------------ */
/* ==================================================================
   "INGAT SAYA DI PERANGKAT INI"

   Supabase menyimpan sesi di localStorage, jadi bawaannya pengguna
   SELALU tetap masuk sampai menekan Keluar — termasuk di komputer
   bersama. Kotak centang ini yang menentukan apakah itu yang
   diinginkan.

   Dicentang   : nama pengguna diingat, sesi bertahan seperti biasa.
   Tidak       : nama pengguna dilupakan, dan sesi berakhir begitu
                 peramban ditutup.

   Akhir-sesi dideteksi lewat sessionStorage: penandanya hilang saat
   peramban ditutup tapi bertahan saat tab dimuat ulang. Jadi menyegarkan
   halaman tidak akan melempar pengguna keluar — hanya menutup
   peramban yang melakukannya.
================================================================== */
const REMEMBER_KEY = "exim.remember";
const REMEMBER_USER_KEY = "exim.remember.user";
const SESSION_ALIVE_KEY = "exim.session-alive";

function bacaRemember() {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch (e) {
    return true;
  }
}

function simpanRemember(ingat, username) {
  try {
    localStorage.setItem(REMEMBER_KEY, ingat ? "1" : "0");
    if (ingat && username) localStorage.setItem(REMEMBER_USER_KEY, username);
    else localStorage.removeItem(REMEMBER_USER_KEY);
  } catch (e) {
    /* Mode privat memblokir penyimpanan. Login tetap jalan — yang
       hilang cuma kenyamanannya, dan itu bukan alasan untuk gagal. */
  }
}

/* true kalau peramban baru saja dibuka (bukan sekadar tab dimuat ulang). */
function perambanBaruDibuka() {
  try {
    const ada = sessionStorage.getItem(SESSION_ALIVE_KEY);
    sessionStorage.setItem(SESSION_ALIVE_KEY, "1");
    return !ada;
  } catch (e) {
    return false;
  }
}

function siapkanFormRemember() {
  const cb = document.getElementById("loginRemember");
  const inp = document.getElementById("loginUsername");
  if (cb) cb.checked = bacaRemember();
  if (inp && bacaRemember()) {
    try {
      inp.value = localStorage.getItem(REMEMBER_USER_KEY) || "";
    } catch (e) {}
  }
  // Fokus ke kolom yang memang masih perlu diisi
  const sandi = document.getElementById("loginPassword");
  if (inp && sandi && inp.value) sandi.focus();
}

async function initAuth() {
  /* Sesi yang tidak diminta bertahan dihapus SEBELUM dibaca — kalau
     tidak, halaman sempat terbuka dulu baru menendang penggunanya. */
  if (!bacaRemember() && perambanBaruDibuka()) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {}
  }

  const { data } = await supabaseClient.auth.getSession();
  const sesi = data && data.session;

  if (!sesi) {
    authState.siap = true;
    siapkanFormRemember();
    showLoginView();
    return false;
  }

  authState.user = sesi.user;
  authState.profile = await loadProfile(sesi.user.id);
  authState.siap = true;
  hideLoginView();
  applyPermissions();
  if (typeof resetIdleTimer === "function") resetIdleTimer();
  return true;
}

/* Sesi bisa berakhir sendiri (token kedaluwarsa, atau ditutup dari tab
   lain). Kalau itu terjadi, halaman dikembalikan ke layar login */
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && authState.siap) {
    authState.user = null;
    authState.profile = null;
    showLoginView();
  }
});
