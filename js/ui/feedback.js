"use strict";

/* ==================================================================
   TOAST / CONFIRM (replaces native alert()/confirm() so it always
   works reliably, including inside sandboxed preview frames)
================================================================== */
function showToast(msg, type) {
  type = type || "danger";
  const el = $("#appToast");
  el.className = "toast align-items-center text-white border-0 bg-" + type;
  $("#toastMsg").textContent = msg;
  new bootstrap.Toast(el, { delay: 3200 }).show();
}

let confirmCallback = null;
function showConfirm(message, onConfirm) {
  $("#confirmMessage").textContent = message;
  confirmCallback = onConfirm;
  confirmModal.show();
}
$("#confirmActionBtn").addEventListener("click", () => {
  confirmModal.hide();
  if (typeof confirmCallback === "function") confirmCallback();
  confirmCallback = null;
});
