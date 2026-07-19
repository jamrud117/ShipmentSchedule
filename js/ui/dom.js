"use strict";

/* ==================================================================
   DOM SHORTCUTS
================================================================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const cardContainer = $("#cardContainer");
const emptyState = $("#emptyState");
const viewListEl = $("#viewList");
const viewFormEl = $("#viewForm");
const detailViewModalEl = $("#detailViewModal");
const detailViewModal = new bootstrap.Modal(detailViewModalEl);
const confirmModalEl = $("#confirmModal");
const confirmModal = new bootstrap.Modal(confirmModalEl);
const bulkModalEl = $("#bulkModal");
const bulkModal = new bootstrap.Modal(bulkModalEl);

function currentList() {
  return data[activeMode];
}
function ML() {
  return MODE_LABELS[activeMode];
}
