"use strict";

/* TOAST / CONFIRM (replaces native alert()/confirm() so it always */
function showToast(msg, type) {
  type = type || "danger";
  const el = $("#appToast");
  el.className = "toast align-items-center text-white border-0 bg-" + type;
  $("#toastMsg").textContent = msg;
  new bootstrap.Toast(el, { delay: 3200 }).show();
}

let confirmCallback = null;
/* opsi: { confirmText, tone: "danger" | "primary", icon } — kotak ini
   dipakai untuk menghapus DAN untuk hal biasa seperti keluar, jadi
   tombolnya tidak boleh selalu bertuliskan "Ya, Hapus" dengan segitiga
   merah. */
function showConfirm(message, onConfirm, opsi) {
  const o = opsi || {};
  $("#confirmMessage").textContent = message;

  const btn = $("#confirmActionBtn");
  btn.textContent = o.confirmText || "Ya, hapus";
  btn.className =
    "btn " + (o.tone === "primary" ? "btn-primary-navy" : "btn-danger");

  $("#confirmTitle").textContent = o.title || (o.tone === "primary" ? "Konfirmasi" : "Hapus Data");

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
  $("#promptTitle").textContent = o.title || "Isian";
  $("#promptDesc").textContent = o.desc || "";
  $("#promptDesc").classList.toggle("d-none", !o.desc);
  $("#promptFields").classList.toggle("mt-3", !!o.desc);
  $("#promptIcon").className = "bi " + (o.icon || "bi-pencil-square");
  $("#promptTitle").textContent = o.title || "Isian";
  $("#promptOk").textContent = o.okText || "Simpan";
  $("#promptError").classList.add("d-none");

  const fields = o.fields || [];
  $("#promptFields").innerHTML = fields
    .map(
      (f) => `
      <label class="prompt-label" for="prompt_${f.key}">${escapeHtml(f.label)}</label>
      ${
        f.type === "password"
          ? `<div class="pwd-wrap">
               <input class="login-input" id="prompt_${f.key}" type="password"
                 placeholder="${escapeAttr(f.placeholder || "")}" value="${escapeAttr(f.value || "")}" />
               <button type="button" class="pwd-eye" data-pwd-toggle="prompt_${f.key}"><i class="bi bi-eye"></i></button>
             </div>`
          : `<input class="login-input" id="prompt_${f.key}" type="${f.type || "text"}"
               placeholder="${escapeAttr(f.placeholder || "")}" value="${escapeAttr(f.value || "")}" />`
      }
      ${f.hint ? `<div class="prompt-hint">${escapeHtml(f.hint)}</div>` : ""}`,
    )
    .join("");

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
