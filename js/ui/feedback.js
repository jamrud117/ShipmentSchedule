"use strict";

/* TOAST / CONFIRM (replaces native alert()/confirm() so it always */
/* Toast sendiri, bukan komponen Bootstrap: yang bawaan memaksa satu
   warna latar penuh (bg-danger dsb) sehingga pesan biasa pun terlihat
   seperti peringatan, dan tidak bisa diberi lambang per jenis. */
const TOAST_IKON = {
  success: "bi-check-circle-fill",
  danger: "bi-exclamation-octagon-fill",
  warning: "bi-exclamation-triangle-fill",
  info: "bi-info-circle-fill",
  dark: "bi-info-circle-fill",
};
let toastTimer = null;

/* Menaruh toast tepat di bawah bilah yang sedang menempel.

   Diukur, bukan ditebak: bilah kendali membungkus jadi dua baris di
   layar sempit, dan di halaman form bilah itu tidak ada sama sekali. */
/* Toast diposisikan tepat di bawah BILAH ATAS saja.

   Bilah kendali (.controlbar) SENGAJA tidak ikut diukur: ia cuma ada
   di halaman Jadwal, jadi mengukurnya membuat posisi toast berbeda
   antar halaman. Bilah atas ada di semua halaman dan tingginya tetap,
   jadi hasilnya sama di mana pun.

   Tidak ada pendengar "scroll": bilah atas itu sticky, posisinya tidak
   berubah saat digulir — menghitung ulang tiap kali digulir cuma
   membuat toast bergeser-geser halus tanpa alasan. */
function posisikanToast() {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const topbar = document.querySelector(".app-topbar");
  let bawah = 0;
  if (topbar && !topbar.classList.contains("d-none")) {
    bawah = topbar.getBoundingClientRect().bottom;
  }
  stack.style.top = Math.max(12, bawah + 12) + "px";
}

window.addEventListener("resize", posisikanToast);

function showToast(msg, type) {
  type = TOAST_IKON[type] ? type : "info";
  posisikanToast();
  const el = $("#appToast");
  if (!el) return;

  el.className = "app-toast app-toast--" + type;
  $("#toastIcon").className = "bi " + TOAST_IKON[type];
  $("#toastMsg").textContent = msg;

  // Dua putaran gambar dipisah supaya transisinya benar-benar berjalan
  // saat toast yang sama dimunculkan berturut-turut.
  el.classList.remove("is-open");
  requestAnimationFrame(() => el.classList.add("is-open"));

  clearTimeout(toastTimer);
  // Pesan panjang butuh waktu baca lebih lama; galat ditahan lebih lama
  // lagi karena biasanya memuat langkah yang harus dikerjakan.
  const lama = Math.min(
    9000,
    Math.max(3200, msg.length * 55 + (type === "danger" ? 2000 : 0)),
  );
  toastTimer = setTimeout(hideToast, lama);
}

function hideToast() {
  const el = $("#appToast");
  if (el) el.classList.remove("is-open");
}

const toastCloseEl = document.getElementById("toastClose");
if (toastCloseEl) toastCloseEl.addEventListener("click", hideToast);

let confirmCallback = null;
/* opsi: { confirmText, tone: "danger" | "primary", icon } — kotak ini
   dipakai untuk menghapus DAN untuk hal biasa seperti keluar, jadi
   tombolnya tidak boleh selalu bertuliskan "Ya, Hapus" dengan segitiga
   merah. */
function showConfirm(message, onConfirm, opsi) {
  const o = opsi || {};
  $("#confirmMessage").textContent = message;

  const btn = $("#confirmActionBtn");
  btn.textContent = o.confirmText || t("u.ya.hapus");

  /* Tombol kiri tidak selalu berarti "batal". Pada pilihan yang
     dua-duanya sah — mis. "Pertahankan ETA Manual" vs "Hitung Ulang
     Otomatis" — menamainya Batal membuat salah satu pilihan yang benar
     terlihat seperti membatalkan sesuatu. */
  const btnBatal = $("#confirmCancelBtn");
  if (btnBatal) btnBatal.textContent = o.cancelText || t("a.batal");
  btn.className =
    "btn " + (o.tone === "primary" ? "btn-primary-navy" : "btn-danger");

  $("#confirmTitle").textContent = o.title || (o.tone === "primary" ? t("a.konfirmasi") : tt("Hapus Data", "Delete Data"));

  const ikon = $("#confirmIcon");
  ikon.className = "bi " + (o.icon || "bi-exclamation-triangle-fill");
  const kotak = ikon.parentElement;
  kotak.classList.toggle("is-power", o.icon === "bi-power");
  kotak.style.background = o.tone === "primary" ? "var(--p-50)" : "var(--s-danger-bg)";
  kotak.style.color = o.tone === "primary" ? "var(--p-600)" : "var(--s-danger)";

  confirmCallback = onConfirm;
  confirmModal.show();
}
$("#confirmActionBtn").addEventListener("click", () => {
  confirmModal.hide();
  if (typeof confirmCallback === "function") confirmCallback();
  confirmCallback = null;
});


/* ------------------------------------------------------------------
   KOTAK ISIAN

   Pengganti prompt() bawaan peramban: tampilannya berbeda-beda, tidak
   bisa ditata, tidak bisa memuat lebih dari satu isian, dan di
   sebagian peramban bisa diblokir pengguna tanpa pemberitahuan.

   fields: [{ key, label, type, value, placeholder, hint }]
   onSubmit(nilai) -> kembalikan string pesan galat untuk menahan, atau
   apa pun yang bukan string untuk menutup.
------------------------------------------------------------------ */
const promptModalEl = $("#promptModal");
const promptModal = promptModalEl ? new bootstrap.Modal(promptModalEl) : null;
let promptSubmit = null;

function showPrompt(opsi) {
  const o = opsi || {};
  $("#promptDesc").textContent = o.desc || "";
  $("#promptDesc").classList.toggle("d-none", !o.desc);
  $("#promptFields").classList.toggle("mt-3", !!o.desc);
  $("#promptIcon").className = "bi " + (o.icon || "bi-pencil-square");
  $("#promptTitle").textContent = o.title || tt("Isian", "Input");
  $("#promptOk").textContent = o.okText || tt("Simpan", "Save");
  $("#promptError").classList.add("d-none");

  const fields = o.fields || [];
  $("#promptFields").innerHTML = fields
    .map(
      (f) => `
      <label class="prompt-label" for="prompt_${f.key}">${escapeHtml(f.label)}</label>
      ${
        f.type === "select"
          ? `<select class="login-input" id="prompt_${f.key}">${(f.options || [])
              .map(
                (o) =>
                  `<option value="${escapeAttr(o.value)}"${o.value === f.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
              )
              .join("")}</select>`
          : f.type === "password"
          ? `<div class="pwd-wrap">
               <input class="login-input" id="prompt_${f.key}" type="password"
                 placeholder="${escapeAttr(f.placeholder || "")}" value="${escapeAttr(f.value || "")}" />
               <button type="button" class="pwd-eye" data-pwd-toggle="prompt_${f.key}"><i class="bi bi-eye"></i></button>
             </div>`
          : `<input class="login-input" id="prompt_${f.key}" type="${f.type || "text"}"
               placeholder="${escapeAttr(f.placeholder || "")}" value="${escapeAttr(f.value || "")}"
               ${f.inputmode ? `inputmode="${escapeAttr(f.inputmode)}"` : ""} />`
      }
      ${f.hint ? `<div class="prompt-hint">${escapeHtml(f.hint)}</div>` : ""}`,
    )
    .join("");

  /* PENYARING KETIKAN.

     Isian yang memberi `filter` merapikan nilainya saat diketik --
     dipakai HS Code untuk menahan ketikan di 8 angka. Disaring di
     sini, bukan cuma diperiksa saat Simpan: menolak setelah selesai
     mengetik berarti pengguna baru tahu kelebihannya ketika sudah
     terlanjur mengetik semuanya. */
  fields.forEach((f) => {
    if (typeof f.filter !== "function") return;
    const el = $("#prompt_" + f.key);
    if (!el) return;
    el.addEventListener("input", () => {
      const posisi = el.selectionStart;
      const asli = el.value;
      const rapi = f.filter(asli);
      if (rapi === asli) return;
      el.value = rapi;
      // Kursor dikembalikan supaya tidak melompat ke ujung saat menyaring.
      const geser = rapi.length - asli.length;
      el.setSelectionRange(Math.max(0, posisi + geser), Math.max(0, posisi + geser));
    });
  });

  promptSubmit = () => {
    const nilai = {};
    fields.forEach((f) => (nilai[f.key] = $("#prompt_" + f.key).value));
    const galat = o.onSubmit ? o.onSubmit(nilai) : null;
    if (typeof galat === "string" && galat) {
      const box = $("#promptError");
      box.textContent = galat;
      box.classList.remove("d-none");
      return;
    }
    promptModal.hide();
  };

  promptModal.show();
  setTimeout(() => {
    const p = fields[0] && $("#prompt_" + fields[0].key);
    if (p) p.focus();
  }, 300);
}

if (promptModalEl) {
  $("#promptOk").addEventListener("click", () => promptSubmit && promptSubmit());
  promptModalEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && promptSubmit) {
      e.preventDefault();
      promptSubmit();
    }
  });
}
