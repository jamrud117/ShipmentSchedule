"use strict";

/* HALAMAN KELOLA AKUN — hanya untuk peran exim */

let accountRows = [];

async function loadAccounts() {
  const box = $("#accountList");
  box.innerHTML = `<div class="panel-empty"><i class="bi bi-hourglass"></i> ${tt("Memuat daftar akun…", "Loading accounts…")}</div>`;

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
        ${tt("Gagal memuat daftar akun. Pastikan <code>auth-roles-migration.sql</code> sudah dijalankan.",
            "Failed to load accounts. Make sure <code>auth-roles-migration.sql</code> has been run.")}
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

  $("#accountCountExim").textContent = accountRows.filter((r) => r.role === "exim").length;
  $("#accountCountMarketing").textContent = accountRows.filter((r) => r.role === "marketing").length;
  // Viewer = selain EXIM & marketing (termasuk peran lama/kosong).
  $("#accountCountViewer").textContent = accountRows.filter(
    (r) => r.role !== "exim" && r.role !== "marketing",
  ).length;

  if (!rows.length) {
    box.innerHTML = `<div class="panel-empty"><i class="bi bi-person-x"></i> ${t("c.tidak.ada.akun.yang.cocok")}</div>`;
    return;
  }

  const sendiri = authState.user ? authState.user.id : "";
  box.innerHTML = rows
    .map((r) => {
      const isSelf = r.id === sendiri;
      const exim = r.role === "exim";
      const marketing = r.role === "marketing";
      return `
      <div class="acct-row" data-acct="${r.id}">
        <div class="acct-avatar ${exim ? "is-exim" : marketing ? "is-marketing" : ""}">${escapeHtml(
          (r.full_name || r.email || "?").trim().charAt(0).toUpperCase(),
        )}</div>
        <div class="acct-main">
          <span class="acct-name">${escapeHtml(r.full_name || "—")}${
            isSelf ? ` <span class="acct-self">${tt("Anda", "You")}</span>` : ""
          }</span>
          <!-- Email SELALU ditampilkan. Menyembunyikannya saat
               berdomain internal membuat akun baru terlihat "tidak
               punya email" sementara akun lama (yang domainnya belum
               ikut berubah) menampilkannya -- dua baris yang bentuknya
               berbeda tanpa alasan yang bisa dilihat pengguna. -->
          <span class="acct-email">@${escapeHtml(r.username || "—")}${
            r.email ? " · " + escapeHtml(r.email) : ""
          }</span>
        </div>
        <span class="acct-since">${r.created_at ? fmtDate(r.created_at.slice(0, 10)) : ""}</span>
        <select class="acct-role control-select" data-role-for="${r.id}" ${
          isSelf ? "disabled" : ""
        } title="${
          isSelf
            ? t("s.peran.sendiri.tidak.bisa.diubah.dari.sini")
            : t("a.ubah.peran.akun.ini")
        }">
          <option value="viewer" ${!exim && !marketing ? "selected" : ""}>${tt("Viewer — hanya lihat", "Viewer — read only")}</option>
          <option value="marketing" ${marketing ? "selected" : ""}>${tt("Marketing — lihat saja, termasuk No. Dokumen", "Marketing — view only, incl. Doc. Number")}</option>
          <option value="exim" ${exim ? "selected" : ""}>${tt("EXIM — bisa ubah", "EXIM — can edit")}</option>
        </select>
        <button type="button" class="icon-btn" data-edit-acct="${r.id}" title="${escapeAttr(t("a.ubah.nama.username"))}">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="icon-btn" data-pwd-acct="${r.id}" title="${escapeAttr(t("a.setel.ulang.kata.sandi"))}">
          <i class="bi bi-key"></i>
        </button>
        <button type="button" class="icon-btn danger acct-del" data-del-acct="${r.id}"
          ${isSelf ? "disabled" : ""}
          title="${isSelf ? t("s.akun.sendiri.tidak.bisa.dihapus") : t("a.hapus.akun.ini")}">
          <i class="bi bi-trash3"></i>
        </button>
      </div>`;
    })
    .join("");
}

/* Peran sendiri sengaja tidak bisa diubah dari halaman ini. Kalau satu-
   satunya exim menurunkan dirinya jadi viewer, tidak ada lagi yang bisa
   menaikkan siapa pun dan pemulihannya harus lewat SQL Editor. */
const LABEL_PERAN = { exim: "EXIM", marketing: "Marketing", viewer: "Viewer" };

async function changeAccountRole(id, peranBaru) {
  if (!requireEdit()) return;
  if (authState.user && id === authState.user.id) {
    showToast(t("m.peran.sendiri.tidak.bisa.diubah.dari.halaman.i"), "danger");
    renderAccounts();
    return;
  }

  const { error } = await supabaseClient
    .from("profiles")
    .update({ role: peranBaru })
    .eq("id", id);

  if (error) {
    console.error(error);
    showToast(t("m.gagal.mengubah.peran.perubahan.dibatalkan"), "danger");
    renderAccounts();
    return;
  }

  const baris = accountRows.find((r) => r.id === id);
  if (baris) baris.role = peranBaru;
  renderAccounts();
  showToast(
    tt(
      `Peran ${baris ? baris.email : "akun"} diubah menjadi ${LABEL_PERAN[peranBaru] || "Viewer"}.`,
      `Role of ${baris ? baris.email : "the account"} changed to ${LABEL_PERAN[peranBaru] || "Viewer"}.`,
    ),
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
    title: t("a.ubah.data.akun"),
    desc: t("s.nama.lengkap.dan.username.yang.dipakai.untuk.m"),
    icon: "bi-person-gear",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nama", label: t("a.nama.lengkap"), value: r.full_name || "", placeholder: tt("Nama lengkap pengguna", "User's full name") },
      { key: "user", label: "Username", value: r.username || "", placeholder: tt("huruf kecil, tanpa spasi", "lowercase, no spaces") },
    ],
    onSubmit: (v) => {
      const u = (v.user || "").trim().toLowerCase();
      if (!(v.nama || "").trim()) return tt("Nama lengkap harus diisi.", "Full name is required.");
      if (!/^[a-z0-9._-]{3,}$/.test(u))
        return tt("Username minimal 3 karakter: huruf, angka, titik, garis.", "Username must be at least 3 characters: letters, digits, dots, dashes.");
      if (accountRows.some((x) => x.id !== id && (x.username || "").toLowerCase() === u))
        return t("s.username.itu.sudah.dipakai.akun.lain");

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
    showToast(t("m.gagal.menyimpan.perubahan"), "danger");
    return;
  }
  const r = accountRows.find((x) => x.id === id);
  if (r) {
    r.full_name = nama;
    r.username = username;
  }
  renderAccounts();
  showToast(t("m.nama.username.diperbarui"), "dark");
}

/* Setel kata sandi langsung oleh admin — tanpa email sama sekali. */
async function resetAccountPassword(id) {
  if (!requireEdit()) return;
  const r = accountRows.find((x) => x.id === id);
  if (!r) return;

  showPrompt({
    title: t("a.setel.kata.sandi"),
    desc: t("w.kata.sandi.baru.untuk", { x: r.username || r.email }),
    icon: "bi-key",
    okText: t("a.setel.sandi"),
    fields: [
      { key: "sandi", label: tt("Kata sandi baru", "New password"), type: "password", placeholder: tt("minimal 8 karakter", "at least 8 characters") },
      { key: "ulang", label: tt("Ulangi kata sandi", "Repeat password"), type: "password", placeholder: tt("ketik ulang", "type it again") },
    ],
    onSubmit: (v) => {
      if ((v.sandi || "").length < 8) return t("a.kata.sandi.minimal.8.karakter");
      if (v.sandi !== v.ulang) return t("s.kedua.kata.sandi.belum.sama");
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
        ? t("a.fungsi.setel.sandi.belum.ada.jalankan.ulang.au")
        : error.message || t("z.gagal.menyetel.kata.sandi"),
      "danger",
    );
    return;
  }
  showToast(t("x.kata.sandi.berhasil.diganti", { nama: r.username || r.email }), "dark");
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
    tt(`Hapus akun "${baris.username || baris.email}" secara permanen? Pengguna ini langsung kehilangan akses.`,
      `Permanently delete the account "${baris.username || baris.email}"? This user loses access immediately.`),
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
      showToast(t("x.akun.dihapus", { nama: baris.username || baris.email }), "dark");
    },
    { confirmText: t("a.ya.hapus.akun") },
  );
}

function pesanHapusAkun(error) {
  const t = (error.message || "").toLowerCase();
  if (t.includes("satu-satunya"))
    return t("s.ini.satu.satunya.akun.exim.naikkan.akun.lain.d");
  if (t.includes("sendiri")) return t("s.akun.sendiri.tidak.bisa.dihapus");
  if (t.includes(t("w.tidak.ditemukan"))) return t("s.akun.sudah.tidak.ada");
  if (t.includes("could not find") || t.includes("does not exist"))
    return t("a.fungsi.hapus.akun.belum.ada.jalankan.ulang.aut");
  return error.message || t("a.gagal.menghapus.akun");
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
    return gagal(t("s.nama.username.dan.kata.sandi.harus.diisi"));
  if (!/^[a-z0-9._-]{3,}$/.test(username))
    return gagal(t("v.username.minimal.3.karakter.hanya.huruf.angka."));
  if (accountRows.some((r) => (r.username || "").toLowerCase() === username))
    return gagal(t("s.username.itu.sudah.dipakai"));
  if (sandi.length < 8) return gagal(t("a.kata.sandi.minimal.8.karakter"));

  const btn = $("#btnRegister");
  btn.disabled = true;
  btn.textContent = t("a.mendaftarkan");

  /* Sesi yang sedang berjalan disimpan dulu. Kalau konfirmasi email
     dimatikan di Supabase, signUp() langsung memasang sesi milik akun
     BARU — admin yang sedang membuat akun akan terlempar keluar tanpa
     sadar. Sesinya dipulihkan setelah pendaftaran selesai.

     PEMULIHAN & TOMBOL DI DALAM finally. Kalau salah satu panggilan di
     bawah MELEMPAR (jaringan putus di tengah jalan), tanpa finally dua
     hal buruk terjadi sekaligus: tombolnya terkunci selamanya, dan
     admin tertinggal memakai sesi akun yang baru dibuat tanpa tahu. */
  const { data: sesiLama } = await supabaseClient.auth.getSession();

  let data, error;
  try {
    ({ data, error } = await supabaseClient.auth.signUp({
      email,
      password: sandi,
      options: { data: { full_name: nama, username } },
    }));
  } catch (err) {
    console.error(err);
    error = err;
  } finally {
    if (sesiLama && sesiLama.session) {
      try {
        await supabaseClient.auth.setSession({
          access_token: sesiLama.session.access_token,
          refresh_token: sesiLama.session.refresh_token,
        });
      } catch (err2) {
        console.error(err2);
      }
    }
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-person-plus"></i> ${t("a.daftarkan.akun")}`;
  }

  if (error) {
    const t = (error.message || "").toLowerCase();
    if (t.includes("already registered") || t.includes("already been"))
      return gagal(t("s.email.itu.sudah.terdaftar"));
    if (t.includes("signups not allowed") || t.includes("disabled"))
      return gagal(
        t("v.pendaftaran.dimatikan.di.supabase.nyalakan.di."),
      );
    if (t.includes("password"))
      return gagal(t("a.kata.sandi.terlalu.lemah.gunakan.minimal.8.kar"));
    return gagal(error.message || tt("Pendaftaran gagal.", "Registration failed."));
  }

  info.className = "reg-info is-ok";
  info.textContent =
    data && data.user && !data.session
      ? tt(`Akun "${username}" dibuat. Kalau login-nya masih ditolak, jalankan ulang auth-roles-migration.sql.`,
          `Account "${username}" created. If its sign-in is still rejected, re-run auth-roles-migration.sql.`)
      : t("x.akun.dibuat.viewer", { nama: username });

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
