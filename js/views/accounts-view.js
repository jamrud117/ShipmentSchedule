"use strict";

/* HALAMAN KELOLA AKUN — hanya untuk peran exim */

let accountRows = [];

async function loadAccounts() {
  const box = $("#accountList");
  box.innerHTML = `<div class="panel-empty"><i class="bi bi-hourglass"></i> Memuat daftar akun…</div>`;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, full_name, username, role, created_at")
    .order("role", { ascending: true })
    .order("email", { ascending: true });

  if (error) {
    console.error(error);
    box.innerHTML = `
      <div class="panel-empty">
        <i class="bi bi-exclamation-triangle"></i>
        Gagal memuat daftar akun. Pastikan
        <code>auth-roles-migration.sql</code> sudah dijalankan.
      </div>`;
    return;
  }
  accountRows = data || [];
  renderAccounts();
}

function renderAccounts() {
  const box = $("#accountList");
  const q = ($("#accountSearch").value || "").trim().toLowerCase();
  const rows = accountRows.filter(
    (r) =>
      !q ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.username || "").toLowerCase().includes(q) ||
      (r.full_name || "").toLowerCase().includes(q),
  );

  $("#accountCountExim").textContent = accountRows.filter(
    (r) => r.role === "exim",
  ).length;
  $("#accountCountViewer").textContent = accountRows.filter(
    (r) => r.role !== "exim",
  ).length;

  if (!rows.length) {
    box.innerHTML = `<div class="panel-empty"><i class="bi bi-person-x"></i> Tidak ada akun yang cocok.</div>`;
    return;
  }

  const sendiri = authState.user ? authState.user.id : "";
  box.innerHTML = rows
    .map((r) => {
      const isSelf = r.id === sendiri;
      const exim = r.role === "exim";
      return `
      <div class="acct-row" data-acct="${r.id}">
        <div class="acct-avatar ${exim ? "is-exim" : ""}">${escapeHtml(
          (r.full_name || r.email || "?").trim().charAt(0).toUpperCase(),
        )}</div>
        <div class="acct-main">
          <span class="acct-name">${escapeHtml(r.full_name || "—")}${
            isSelf ? ' <span class="acct-self">Anda</span>' : ""
          }</span>
          <span class="acct-email">@${escapeHtml(r.username || "—")}${
            r.email && !r.email.endsWith(INTERNAL_MAIL_DOMAIN)
              ? " · " + escapeHtml(r.email)
              : ""
          }</span>
        </div>
        <span class="acct-since">${r.created_at ? fmtDate(r.created_at.slice(0, 10)) : ""}</span>
        <select class="acct-role control-select" data-role-for="${r.id}" ${
          isSelf ? "disabled" : ""
        } title="${
          isSelf
            ? "Peran sendiri tidak bisa diubah dari sini"
            : "Ubah peran akun ini"
        }">
          <option value="viewer" ${!exim ? "selected" : ""}>Viewer — hanya lihat</option>
          <option value="exim" ${exim ? "selected" : ""}>EXIM — bisa ubah</option>
        </select>
        <button type="button" class="icon-btn" data-edit-acct="${r.id}" title="Ubah nama & username">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="icon-btn" data-pwd-acct="${r.id}" title="Setel ulang kata sandi">
          <i class="bi bi-key"></i>
        </button>
        <button type="button" class="icon-btn danger acct-del" data-del-acct="${r.id}"
          ${isSelf ? "disabled" : ""}
          title="${isSelf ? "Akun sendiri tidak bisa dihapus" : "Hapus akun ini"}">
          <i class="bi bi-trash3"></i>
        </button>
      </div>`;
    })
    .join("");
}

/* Peran sendiri sengaja tidak bisa diubah dari halaman ini. Kalau satu-
   satunya exim menurunkan dirinya jadi viewer, tidak ada lagi yang bisa
   menaikkan siapa pun dan pemulihannya harus lewat SQL Editor. */
async function changeAccountRole(id, peranBaru) {
  if (!requireEdit()) return;
  if (authState.user && id === authState.user.id) {
    showToast("Peran sendiri tidak bisa diubah dari halaman ini.", "danger");
    renderAccounts();
    return;
  }

  const { error } = await supabaseClient
    .from("profiles")
    .update({ role: peranBaru })
    .eq("id", id);

  if (error) {
    console.error(error);
    showToast("Gagal mengubah peran. Perubahan dibatalkan.", "danger");
    renderAccounts();
    return;
  }

  const baris = accountRows.find((r) => r.id === id);
  if (baris) baris.role = peranBaru;
  renderAccounts();
  showToast(
    `Peran ${baris ? baris.email : "akun"} diubah menjadi ${
      peranBaru === "exim" ? "EXIM" : "Viewer"
    }.`,
    "dark",
  );
}

/* ------------------------------------------------------------------
   UBAH NAMA & USERNAME

   Akun yang dibuat lewat Dashboard Supabase tidak punya kolom nama
   lengkap maupun username — keduanya terisi seadanya dari bagian depan
   email. Di sini keduanya bisa dirapikan tanpa membuka SQL Editor.
------------------------------------------------------------------ */
async function editAccount(id) {
  if (!requireEdit()) return;
  const r = accountRows.find((x) => x.id === id);
  if (!r) return;

  showPrompt({
    title: "Ubah data akun",
    desc: "Nama lengkap dan username yang dipakai untuk masuk.",
    icon: "bi-person-gear",
    okText: "Simpan",
    fields: [
      { key: "nama", label: "Nama lengkap", value: r.full_name || "", placeholder: "Nama lengkap pengguna" },
      { key: "user", label: "Username", value: r.username || "", placeholder: "huruf kecil, tanpa spasi" },
    ],
    onSubmit: (v) => {
      const u = (v.user || "").trim().toLowerCase();
      if (!(v.nama || "").trim()) return "Nama lengkap harus diisi.";
      if (!/^[a-z0-9._-]{3,}$/.test(u))
        return "Username minimal 3 karakter: huruf, angka, titik, garis.";
      if (accountRows.some((x) => x.id !== id && (x.username || "").toLowerCase() === u))
        return "Username itu sudah dipakai akun lain.";

      simpanProfil(id, v.nama.trim(), u);
      return true;
    },
  });
}

async function simpanProfil(id, nama, username) {
  const { error } = await supabaseClient
    .from("profiles")
    .update({ full_name: nama, username })
    .eq("id", id);
  if (error) {
    console.error(error);
    showToast("Gagal menyimpan perubahan.", "danger");
    return;
  }
  const r = accountRows.find((x) => x.id === id);
  if (r) {
    r.full_name = nama;
    r.username = username;
  }
  renderAccounts();
  showToast("Nama & username diperbarui.", "dark");
}

/* Setel kata sandi langsung oleh admin — tanpa email sama sekali. */
async function resetAccountPassword(id) {
  if (!requireEdit()) return;
  const r = accountRows.find((x) => x.id === id);
  if (!r) return;

  showPrompt({
    title: "Setel kata sandi",
    desc: `Kata sandi baru untuk "${r.username || r.email}". Sampaikan langsung ke yang bersangkutan — tidak ada email yang dikirim.`,
    icon: "bi-key",
    okText: "Setel sandi",
    fields: [
      { key: "sandi", label: "Kata sandi baru", type: "password", placeholder: "minimal 8 karakter" },
      { key: "ulang", label: "Ulangi kata sandi", type: "password", placeholder: "ketik ulang" },
    ],
    onSubmit: (v) => {
      if ((v.sandi || "").length < 8) return "Kata sandi minimal 8 karakter.";
      if (v.sandi !== v.ulang) return "Kedua kata sandi belum sama.";
      kirimSandiBaru(id, v.sandi, r);
      return true;
    },
  });
}

async function kirimSandiBaru(id, sandi, r) {
  const { error } = await supabaseClient.rpc("admin_set_password", {
    p_id: id,
    p_password: sandi,
  });
  if (error) {
    console.error(error);
    showToast(
      (error.message || "").includes("could not find")
        ? "Fungsi setel sandi belum ada. Jalankan ulang auth-roles-migration.sql."
        : error.message || "Gagal menyetel kata sandi.",
      "danger",
    );
    return;
  }
  showToast(`Kata sandi "${r.username || r.email}" berhasil diganti.`, "dark");
}

/* ------------------------------------------------------------------
   HAPUS AKUN

   Dikerjakan lewat RPC admin_delete_user (SECURITY DEFINER), bukan dari
   peramban langsung: menghapus baris auth.users di luar jangkauan kunci
   anon, dan kunci service_role tidak boleh ada di sisi peramban.

   Seluruh pemeriksaan sebenarnya ada di dalam fungsi itu — bukan di
   sini. Yang di bawah ini hanya supaya pesannya enak dibaca.
------------------------------------------------------------------ */
async function deleteAccount(id) {
  if (!requireEdit()) return;
  const baris = accountRows.find((r) => r.id === id);
  if (!baris) return;

  showConfirm(
    `Hapus akun "${baris.username || baris.email}" secara permanen? Pengguna ini langsung kehilangan akses.`,
    async () => {
      const { error } = await supabaseClient.rpc("admin_delete_user", {
        p_id: id,
      });
      if (error) {
        console.error(error);
        showToast(pesanHapusAkun(error), "danger");
        return;
      }
      accountRows = accountRows.filter((r) => r.id !== id);
      renderAccounts();
      showToast(`Akun "${baris.username || baris.email}" dihapus.`, "dark");
    },
    { confirmText: "Ya, hapus akun" },
  );
}

function pesanHapusAkun(error) {
  const t = (error.message || "").toLowerCase();
  if (t.includes("satu-satunya"))
    return "Ini satu-satunya akun EXIM — naikkan akun lain dulu sebelum menghapusnya.";
  if (t.includes("sendiri")) return "Akun sendiri tidak bisa dihapus.";
  if (t.includes("tidak ditemukan")) return "Akun sudah tidak ada.";
  if (t.includes("could not find") || t.includes("does not exist"))
    return "Fungsi hapus akun belum ada. Jalankan ulang auth-roles-migration.sql.";
  return error.message || "Gagal menghapus akun.";
}

/* ------------------------------------------------------------------
   PENDAFTARAN AKUN BARU

   Memakai signUp biasa, bukan Admin API — kunci service_role tidak
   boleh ada di dalam berkas yang dikirim ke peramban, karena siapa pun
   bisa membacanya dan memakainya untuk apa saja.

   Akibatnya akun baru selalu berperan viewer (ditetapkan oleh trigger
   di database), lalu dinaikkan dari daftar di halaman ini.
------------------------------------------------------------------ */
async function registerAccount() {
  if (!requireEdit()) return;
  const nama = $("#regName").value.trim();
  const username = $("#regUsername").value.trim().toLowerCase();
  /* Alamatnya DIBENTUK dari username. Supabase Auth selalu menuntut
     email sebagai identitas — yang bisa dihindari cuma memintanya ke
     pengguna, bukan keberadaannya. */
  const email = emailFromUsername(username);
  const sandi = $("#regPassword").value;
  const info = $("#regInfo");

  const gagal = (t) => {
    info.className = "reg-info is-error";
    info.textContent = t;
  };
  if (!nama || !username || !sandi)
    return gagal("Nama, username, dan kata sandi harus diisi.");
  if (!/^[a-z0-9._-]{3,}$/.test(username))
    return gagal("Username minimal 3 karakter, hanya huruf/angka/titik/garis.");
  if (accountRows.some((r) => (r.username || "").toLowerCase() === username))
    return gagal("Username itu sudah dipakai.");
  if (sandi.length < 8) return gagal("Kata sandi minimal 8 karakter.");

  const btn = $("#btnRegister");
  btn.disabled = true;
  btn.textContent = "Mendaftarkan…";

  /* Sesi yang sedang berjalan disimpan dulu. Kalau konfirmasi email
     dimatikan di Supabase, signUp() langsung memasang sesi milik akun
     BARU — admin yang sedang membuat akun akan terlempar keluar tanpa
     sadar. Sesinya dipulihkan setelah pendaftaran selesai. */
  const { data: sesiLama } = await supabaseClient.auth.getSession();

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password: sandi,
    options: { data: { full_name: nama, username } },
  });

  if (sesiLama && sesiLama.session) {
    await supabaseClient.auth.setSession({
      access_token: sesiLama.session.access_token,
      refresh_token: sesiLama.session.refresh_token,
    });
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-person-plus"></i> Daftarkan Akun';

  if (error) {
    const t = (error.message || "").toLowerCase();
    if (t.includes("already registered") || t.includes("already been"))
      return gagal("Email itu sudah terdaftar.");
    if (t.includes("signups not allowed") || t.includes("disabled"))
      return gagal(
        "Pendaftaran dimatikan di Supabase. Nyalakan di Authentication → Providers → Email, atau buat akun lewat Add user.",
      );
    if (t.includes("password"))
      return gagal("Kata sandi terlalu lemah. Gunakan minimal 8 karakter.");
    return gagal(error.message || "Pendaftaran gagal.");
  }

  info.className = "reg-info is-ok";
  info.textContent =
    data && data.user && !data.session
      ? `Akun "${username}" dibuat. Kalau login-nya masih ditolak, jalankan ulang auth-roles-migration.sql.`
      : `Akun "${username}" dibuat dengan peran Viewer. Naikkan ke EXIM di daftar sebelah bila perlu.`;

  ["#regName", "#regUsername", "#regPassword"].forEach(
    (sel) => ($(sel).value = ""),
  );
  await loadAccounts();
}

/* ------------------------------------------------------------------
   TAMPILAN HALAMAN
------------------------------------------------------------------ */
function showAccountView() {
  showPage("accounts");
  window.scrollTo(0, 0);
  paintTodayStamps();
  loadAccounts();
}

const accountRoot = $("#viewAccounts");
if (accountRoot) {
  accountRoot.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-role-for]");
    if (sel) changeAccountRole(sel.dataset.roleFor, sel.value);
  });
  accountRoot.addEventListener("click", (e) => {
    const hapus = e.target.closest("[data-del-acct]");
    if (hapus) return deleteAccount(hapus.dataset.delAcct);
    const ubah = e.target.closest("[data-edit-acct]");
    if (ubah) return editAccount(ubah.dataset.editAcct);
    const sandi = e.target.closest("[data-pwd-acct]");
    if (sandi) return resetAccountPassword(sandi.dataset.pwdAcct);
  });
  $("#accountSearch").addEventListener("input", renderAccounts);
  $("#btnRegister").addEventListener("click", registerAccount);
  $("#btnAccountRefresh").addEventListener("click", loadAccounts);
  ["#regName", "#regUsername", "#regPassword"].forEach((sel) => {
    $(sel).addEventListener("keydown", (e) => {
      if (e.key === "Enter") registerAccount();
    });
  });
}
