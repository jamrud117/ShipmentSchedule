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
    return { ok: false, message: "Username atau email itu tidak terdaftar." };
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
  if (t.includes("invalid login")) return "Username/email atau kata sandi salah.";
  if (t.includes("email not confirmed"))
    return "Akun belum aktif. Minta admin menjalankan ulang auth-roles-migration.sql.";
  if (t.includes("rate limit") || t.includes("too many"))
    return "Terlalu banyak percobaan. Coba lagi beberapa menit.";
  if (t.includes("failed to fetch") || t.includes("network"))
    return "Tidak bisa menghubungi server. Periksa koneksi.";
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
    pesan || "Hanya peran EXIM yang boleh mengubah data.",
    "danger",
  );
  return false;
}

/* ------------------------------------------------------------------
   LAYAR LOGIN
------------------------------------------------------------------ */
function toggleFabLogout(tampil) {
  const fab = $("#btnLogout");
  if (fab) fab.classList.toggle("d-none", !tampil);
}

/* Tombol keluar dijaga selalu DI ATAS footer. Diukur, bukan ditebak:
   tinggi footer berubah mengikuti panjang teksnya dan lebar layar. */
function liftFabAboveFooter() {
  const fab = $("#btnLogout");
  const footer = $("#appFooter");
  if (!fab) return;
  if (!footer || footer.classList.contains("d-none")) {
    fab.style.bottom = "";
    return;
  }
  const r = footer.getBoundingClientRect();
  const terlihat = Math.max(0, window.innerHeight - r.top);
  fab.style.bottom = terlihat + 20 + "px";
}

window.addEventListener("scroll", liftFabAboveFooter, { passive: true });
window.addEventListener("resize", liftFabAboveFooter);

/* Tinggi halaman berubah setelah data termuat, setelah saringan
   ditekan, dan setiap kali daftar digambar ulang. Tanpa pemantau ini,
   posisi tombol dihitung SEKALI saat halaman masih kosong — footernya
   waktu itu masih tinggi di layar, jadi tombolnya ikut terangkat jauh
   ke atas dan tidak pernah turun lagi. */
if (typeof ResizeObserver !== "undefined") {
  const pantau = new ResizeObserver(() => liftFabAboveFooter());
  pantau.observe(document.body);
}

function hideBootScreen() {
  const b = $("#bootScreen");
  if (!b || b.classList.contains("is-done")) return;
  b.classList.add("is-done");
  setTimeout(() => b.remove(), 350);
}

function showLoginView() {
  hideBootScreen();
  $("#viewLogin").classList.remove("d-none");
  toggleFabLogout(false);
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
  toggleFabLogout(true);
  setTimeout(liftFabAboveFooter, 50);
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
    ? '<span class="spinner-border spinner-border-sm"></span> Masuk…'
    : '<i class="bi bi-box-arrow-in-right"></i> Masuk';
}

async function handleLoginSubmit() {
  const user = $("#loginUsername").value;
  const sandi = $("#loginPassword").value;
  if (!user.trim() || !sandi) {
    setLoginError("Username/email dan kata sandi harus diisi.");
    return;
  }
  setLoginError("");
  setLoginBusy(true);
  const hasil = await signIn(user, sandi);
  setLoginBusy(false);
  if (!hasil.ok) {
    setLoginError(hasil.message);
    $("#loginPassword").select();
    return;
  }
  hideLoginView();
  applyPermissions();
  if (typeof resetIdleTimer === "function") resetIdleTimer();
  router();
  await loadShipments();
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

$("#btnLogout").addEventListener("click", () => {
  showConfirm("Sesi Anda akan ditutup dan halaman kembali ke layar masuk.", () => signOut(), {
    title: "Keluar dari Aplikasi",
    confirmText: "Ya, Keluar",
    tone: "primary",
    icon: "bi-power",
  });
});

/* ------------------------------------------------------------------
   INISIALISASI

   Mengembalikan true kalau sudah ada sesi yang sah.
------------------------------------------------------------------ */
async function initAuth() {
  const { data } = await supabaseClient.auth.getSession();
  const sesi = data && data.session;

  if (!sesi) {
    authState.siap = true;
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
