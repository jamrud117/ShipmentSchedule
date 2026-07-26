"use strict";

/* ==================================================================
   HALAMAN: PERMINTAAN NOMOR DOKUMEN

   Menerbitkan nomor berurutan untuk Invoice, Delivery Order,
   Permintaan Dana, dan Surat keluar, lalu mencatatnya di database.

   DATA-DRIVEN: berkas ini TIDAK memuat daftar isian tiap jenis dokumen
   sama sekali. Isian dibaca dari atribut di index.html:
     data-docnum-panel="<kunci>"  -> panel form
     data-dn="<namaField>"        -> nilainya ikut terkirim
     data-dn-required             -> wajib diisi
     data-dn-number               -> harus berupa angka
   Menambah isian baru = tambah satu <input> ber-atribut di HTML.
   Menambah JENIS dokumen baru = tambah tab + panel di HTML, lalu satu
   baris di DOCNUM_TYPES di bawah.

   FORMAT NOMOR: DDI/<KODE>/<BULAN ROMAWI>/<TAHUN>/<URUT 4 DIGIT>
   contoh: DDI/INV/VII/2026/0007
   Bulan & tahun diambil dari TANGGAL DOKUMEN yang diisi user (bukan
   tanggal hari ini), supaya dokumen yang dibuat mundur tetap memakai
   periode yang benar.
================================================================== */

const DOCNUM_ORG = "DDI";

/* Sebagian jenis dokumen punya SUB-JENIS yang seri nomornya terpisah.
   Invoice misalnya: Commercial dan Non-Commercial adalah dokumen yang
   berbeda secara kepabeanan, jadi masing-masing punya kode dan urutan
   sendiri — bukan berbagi satu deret. Sub-jenis dipilih lewat isian
   ber-atribut `data-dn-subtype` di panelnya.
   Kalau ternyata Bgenius ingin keduanya memakai SATU deret bersama,
   cukup samakan `key` kedua baris di bawah ini. */
/* POLA NOMOR
   Nomor urut TIDAK selalu di ujung — di sebagian format ia berada di
   tengah, bahkan di awal. Karena itu tiap jenis dokumen menyimpan POLA
   berisi tiga penanda:
     {SEQ}  -> nomor urut (3 digit, dipasang di database)
     {MM}   -> bulan romawi dari tanggal dokumen
     {YYYY} -> tahun dari tanggal dokumen
   Menambah/mengubah format cukup mengubah satu baris pola di bawah. */
const DOCNUM_SUBTYPES = {
  invoice: {
    Commercial: {
      key: "invoice",
      label: "Commercial Invoice",
      pattern: "DDI-CRBM-{MM}-{SEQ}",
    },
    "Non-Commercial": {
      key: "invoice_nc",
      label: "Non-Commercial Invoice",
      pattern: "DDI-{SEQ}/{YYYY}-{MM}-EXIM-LOG",
    },
  },
};

const DOCNUM_TYPES = {
  invoice: {
    label: "Invoice",
    pad: 3,
    pattern: "DDI-CRBM-{MM}-{SEQ}",
  },
  do: {
    label: "Delivery Order / Surat Jalan",
    pad: 3,
    pattern: "{SEQ}/DDI/EXIM-LOG/{MM}/{YYYY}",
  },
  fund: {
    label: "Permintaan Dana",
    pad: 3,
    pattern: "{SEQ}/EXIM/DDI/{MM}/{YYYY}",
  },
  letter: {
    label: "Surat Keluar",
    pad: 3,
    pattern: "DDI-{SEQ}/EXIM-LOG/{MM}/{YYYY}",
  },
};

const DOCNUM_DEFAULT_TAB = "invoice";
const ROMAN_MONTHS = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

// Kolom tersendiri di tabel document_numbers; sisanya masuk `payload`
// (jsonb) supaya jenis dokumen baru tidak perlu kolom baru.
const DOCNUM_COLUMN_FIELDS = new Set(["docDate", "requester", "department"]);

let docNumActiveTab = DOCNUM_DEFAULT_TAB;
let docNumBusy = false;

/* ---------- pembentukan nomor ---------- */

// "2026"; kalau suatu saat ada yang perlu reset BULANAN, cukup ubah
// Jenis dokumen EFEKTIF: gabungan tab yang aktif + sub-jenis yang
// dipilih. Inilah yang dipakai sebagai kunci penomoran, kode nomor, dan
// penyaring riwayat — supaya Commercial & Non-Commercial benar-benar
// berjalan di deret masing-masing.
function resolveDocNumType(tabKey) {
  const base = DOCNUM_TYPES[tabKey] || {};
  const subs = DOCNUM_SUBTYPES[tabKey];
  if (subs) {
    const panel = docNumPanelEl(tabKey);
    const el = panel && panel.querySelector("[data-dn-subtype]");
    const hit = el && subs[el.value];
    if (hit) {
      // `pattern` WAJIB ikut diteruskan — tanpa ini sub-jenis memakai
      // pola milik jenis induknya, sehingga Non-Commercial ikut tercetak
      // dengan format Commercial.
      return {
        ...base,
        key: hit.key,
        label: hit.label || base.label,
        pattern: hit.pattern || base.pattern,
      };
    }
  }
  return { ...base, key: tabKey };
}

/* SERI PENOMORAN

   Nomor TIDAK reset sendiri tiap ganti tahun. Dulu kunci periode diisi
   tahun dari tanggal dokumen, sehingga deret otomatis mulai 001 setiap
   Januari — nyaman, tapi memaksakan satu asumsi alur bisnis yang belum
   tentu bertahan. Sekarang deret berjalan terus sampai direset manual.

   Seri yang sedang berjalan disimpan per jenis dokumen dan disegarkan
   bersamaan dengan pratinjau, jadi tidak menambah bolak-balik ke
   database. */
const docNumSeries = {};

function docNumPeriodKey(typeKey) {
  const t = resolveDocNumType(typeKey);
  return docNumSeries[t.key] || "1";
}

async function muatSeri(docType) {
  const { data, error } = await supabaseClient.rpc("current_document_series", {
    p_doc_type: docType,
  });
  if (error) throw error;
  const seri = String(data == null ? "1" : data);
  docNumSeries[docType] = seri;
  return seri;
}

// Pola dengan {MM} & {YYYY} sudah terisi; {SEQ} sengaja DIBIARKAN —
// diisi di database bersamaan dengan kenaikan counter-nya.
function docNumTemplate(typeKey, isoDate) {
  const t = resolveDocNumType(typeKey);
  const d = parseLocalDate(isoDate) || new Date();
  return String(t.pattern || "{SEQ}")
    .replace(/\{MM\}/g, ROMAN_MONTHS[d.getMonth()])
    .replace(/\{YYYY\}/g, String(d.getFullYear()));
}

// Dipakai untuk PRATINJAU di layar. Nomor yang benar-benar terbit tetap
// dibentuk di database dari pola yang sama.
function docNumFormat(template, seq, pad) {
  return String(template).replace(
    /\{SEQ\}/g,
    String(seq).padStart(pad || 3, "0"),
  );
}

/* ---------- baca & validasi isian panel ---------- */

function docNumPanelEl(typeKey) {
  return document.querySelector(`[data-docnum-panel="${typeKey}"]`);
}

function readDocNumForm(typeKey) {
  const panel = docNumPanelEl(typeKey);
  const out = {};
  if (!panel) return out;
  panel.querySelectorAll("[data-dn]").forEach((el) => {
    out[el.dataset.dn] = String(el.value || "").trim();
  });
  return out;
}

// Mengembalikan daftar pesan kesalahan; kosong berarti lolos.
// Isian yang bermasalah ditandai langsung di kotaknya (kelas
// `is-invalid`) supaya user tahu yang mana tanpa membaca daftar.
function validateDocNumForm(typeKey) {
  const panel = docNumPanelEl(typeKey);
  const errors = [];
  if (!panel) return ["Panel form tidak ditemukan."];

  panel.querySelectorAll(".is-invalid").forEach((el) =>
    el.classList.remove("is-invalid"),
  );

  panel.querySelectorAll("[data-dn]").forEach((el) => {
    const nilai = String(el.value || "").trim();
    const label = (
      el.closest(".col-md-2, .col-md-3, .col-md-4, .col-md-6, .col-12")
        ?.querySelector(".form-label")
        ?.textContent || el.dataset.dn
    )
      .replace("*", "")
      .trim();

    if (el.hasAttribute("data-dn-required") && !nilai) {
      errors.push(`${label} wajib diisi.`);
      el.classList.add("is-invalid");
      return;
    }
    if (el.hasAttribute("data-dn-number") && nilai) {
      // excelNum() menerima format Indonesia maupun Inggris ("1.234,56"
      // dan "1,234.56") — dipakai supaya isian angka di sini konsisten
      // dengan cara aplikasi membaca angka di tempat lain.
      const angka = excelNum(nilai);
      if (!isFinite(angka) || angka < 0) {
        errors.push(`${label} harus berupa angka (tidak boleh negatif).`);
        el.classList.add("is-invalid");
      }
    }
  });

  // Tanggal dokumen tidak boleh terlalu jauh ke depan: nomor terbit
  // berurutan, jadi tanggal yang keliru (mis. salah ketik tahun) akan
  // membuat periode penomoran melompat dan sulit dirapikan lagi.
  const isoTanggal = readDocNumForm(typeKey).docDate;
  const tgl = parseLocalDate(isoTanggal);
  if (tgl) {
    const batas = new Date();
    batas.setDate(batas.getDate() + 90);
    if (tgl > batas) {
      errors.push(
        "Tanggal dokumen lebih dari 90 hari ke depan — periksa lagi tahunnya.",
      );
      panel.querySelector('[data-dn="docDate"]')?.classList.add("is-invalid");
    }
  }
  return errors;
}

/* ---------- pratinjau nomor berikutnya ---------- */

// Menampilkan nomor yang AKAN terbit. Angka urutnya dibaca dari counter
// di database, jadi ini perkiraan — nomor final tetap ditentukan server
// saat tombol ditekan (lihat catatan race condition di
// schema-migration.sql). Karena itu tulisannya "berikutnya", bukan
// "nomor Anda".
async function refreshDocNumPreview(typeKey) {
  const el = document.querySelector(`[data-dn-preview="${typeKey}"]`);
  if (!el) return;
  const t = resolveDocNumType(typeKey);
  const isoDate = readDocNumForm(typeKey).docDate;
  const template = docNumTemplate(typeKey, isoDate);

  el.textContent = docNumFormat(template, 1, t.pad); // tampilan sementara
  try {
    const periodKey = await muatSeri(t.key);
    const { data, error } = await supabaseClient
      .from("document_number_counters")
      .select("last_seq")
      .eq("doc_type", t.key)
      .eq("period_key", periodKey)
      .maybeSingle();
    if (error) throw error;
    const berikut = (data ? data.last_seq : 0) + 1;
    el.textContent = docNumFormat(template, berikut, t.pad);
    renderCounterPanel(t, periodKey, data ? data.last_seq : 0);
  } catch (err) {
    console.error(err);
    el.textContent = docNumFormat(template, 1, t.pad);
  }
}

/* ==================================================================
   ATUR / RESET NOMOR URUT

   Penomoran ini menggantikan pencatatan manual yang SUDAH berjalan,
   jadi harus bisa disambung dari nomor terakhir yang sudah dipakai —
   bukan selalu mulai dari 001.

   Yang diisi pengguna adalah NOMOR BERIKUTNYA (angka yang ingin terbit
   berikutnya), bukan "last_seq". Itu yang ada di kepala pengguna:
   "invoice terakhir 035, berarti berikutnya 036".
================================================================== */
let counterCtx = { typeKey: null, periodKey: null, lastSeq: 0, pad: 3 };

function renderCounterPanel(t, periodKey, lastSeq) {
  counterCtx = { typeKey: t.key, periodKey, lastSeq: lastSeq || 0, pad: t.pad };
  const info = $("#counterInfo");
  const input = $("#counterNext");
  if (!info || !input) return;
  info.textContent = `Seri ${periodKey} · nomor terakhir terbit: ${
    lastSeq ? String(lastSeq).padStart(t.pad, "0") : "belum ada"
  }`;
  input.value = String((lastSeq || 0) + 1);
  input.placeholder = String(1).padStart(t.pad, "0");
}

// Nomor urut TERTINGGI yang sudah pernah terbit di periode ini. Dipakai
// mencegah penyetelan mundur yang akan menabrak nomor lama: kolomnya
// unik, jadi kalau dibiarkan, penerbitan berikutnya pasti gagal di
// tengah jalan — lebih baik dicegah sekarang dengan pesan yang jelas.
async function maxIssuedSeq(docType, periodKey) {
  const { data, error } = await supabaseClient
    .from("document_numbers")
    .select("seq")
    .eq("doc_type", docType)
    .eq("period_key", periodKey)
    .order("seq", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length ? data[0].seq : 0;
}

async function simpanCounter(nilaiBerikutnya) {
  const { typeKey, periodKey, pad } = counterCtx;
  if (!typeKey) return;
  const berikut = parseInt(nilaiBerikutnya, 10);
  if (!isFinite(berikut) || berikut < 1) {
    showToast("Nomor berikutnya harus angka minimal 1.", "danger");
    return;
  }
  try {
    const terpakai = await maxIssuedSeq(typeKey, periodKey);
    if (berikut <= terpakai) {
      showToast(
        `Nomor ${String(berikut).padStart(pad, "0")} sudah pernah terbit di periode ${periodKey}. Pakai ${String(terpakai + 1).padStart(pad, "0")} atau lebih besar, atau hapus dulu riwayatnya.`,
        "danger",
      );
      return;
    }
    const { error } = await supabaseClient.rpc("set_document_counter", {
      p_doc_type: typeKey,
      p_period_key: periodKey,
      p_last_seq: berikut - 1,
    });
    if (error) throw error;
    showToast(
      `Nomor berikutnya disetel ke ${String(berikut).padStart(pad, "0")}.`,
      "success",
    );
    refreshDocNumPreview(docNumActiveTab);
  } catch (err) {
    console.error(err);
    showToast(`Gagal menyetel nomor: ${err.message || "kesalahan tidak diketahui"}`, "danger");
  }
}

$("#btnCounterSave")?.addEventListener("click", () =>
  simpanCounter($("#counterNext").value),
);
/* Reset MANUAL. Tidak menolkan counter — itu akan membuat nomor 001 yang
   baru menabrak 001 yang lama, karena pasangan jenis+seri+urutan harus
   unik. Yang dilakukan: membuka SERI BARU. Catatan lama tetap utuh di
   serinya sendiri, deret baru mulai bersih dari 001, dan tidak ada satu
   pun nomor yang perlu dihapus. */
$("#btnCounterReset")?.addEventListener("click", () => {
  const { typeKey, pad } = counterCtx;
  if (!typeKey) return;
  const jenis = resolveDocNumType(docNumActiveTab);
  const satu = String(1).padStart(pad, "0");
  showConfirm(
    `Mulai ulang penomoran ${jenis.label} dari ${satu}?\n\n` +
      `Nomor yang sudah terbit TIDAK dihapus — tetap tersimpan di seri sebelumnya. ` +
      `Penerbitan berikutnya masuk ke seri baru dan dimulai dari ${satu}.`,
    async () => {
      try {
        const { data, error } = await supabaseClient.rpc(
          "reset_document_series",
          { p_doc_type: typeKey },
        );
        if (error) throw error;
        docNumSeries[typeKey] = String(data == null ? "1" : data);
        showToast(
          `Penomoran ${jenis.label} dimulai ulang (seri ${docNumSeries[typeKey]}).`,
          "success",
        );
        docNumPage = 1;
        refreshDocNumPreview(docNumActiveTab);
        renderDocNumHistory();
      } catch (err) {
        console.error(err);
        showToast(
          `Gagal memulai ulang: ${err.message || "kesalahan tidak diketahui"}`,
          "danger",
        );
      }
    },
  );
});

/* ---------- penerbitan nomor ---------- */

async function submitDocNumRequest() {
  if (docNumBusy) return;
  const typeKey = docNumActiveTab;
  const t = resolveDocNumType(typeKey);
  if (!t.key) return;

  const errors = validateDocNumForm(typeKey);
  const hint = $("#docNumHint");
  if (errors.length) {
    hint.textContent = errors[0];
    hint.classList.add("docnum-hint--error");
    showToast(
      errors.length === 1
        ? errors[0]
        : `${errors.length} isian belum benar — yang bertanda merah perlu diperbaiki.`,
      "danger",
    );
    return;
  }
  hint.textContent = "";
  hint.classList.remove("docnum-hint--error");

  const form = readDocNumForm(typeKey);
  const template = docNumTemplate(typeKey, form.docDate);

  const btn = $("#btnDocNumSubmit");
  const htmlAsli = btn.innerHTML;
  docNumBusy = true;
  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-arrow-repeat spin"></i> Menerbitkan...`;

  try {
    // Seri dibaca ULANG tepat sebelum menerbitkan: kalau ada yang mereset
    // dari perangkat lain, nomor ini harus masuk ke seri yang baru — bukan
    // seri lama yang sudah ditutup.
    const periodKey = await muatSeri(t.key);

    // LANGKAH 1 — ambil nomor urut dari database.
    // Penambahan dilakukan di dalam satu pernyataan SQL yang atomik
    // (lihat next_document_number di schema-migration.sql), jadi dua
    // pemohon yang menekan tombol bersamaan TIDAK bisa mendapat nomor
    // kembar. Nomor urut sengaja TIDAK dihitung di sini.
    const { data: hasil, error: errSeq } = await supabaseClient.rpc(
      "next_document_number",
      {
        p_doc_type: t.key,
        p_period_key: periodKey,
        p_template: template,
        p_pad: t.pad,
      },
    );
    if (errSeq) throw errSeq;
    const baris = Array.isArray(hasil) ? hasil[0] : hasil;
    if (!baris || !baris.out_number) {
      throw new Error("Database tidak mengembalikan nomor.");
    }

    // LANGKAH 2 — simpan catatan permintaannya.
    const payload = {};
    Object.keys(form).forEach((k) => {
      if (!DOCNUM_COLUMN_FIELDS.has(k) && form[k] !== "") payload[k] = form[k];
    });

    const { error: errInsert } = await supabaseClient
      .from("document_numbers")
      .insert({
        doc_type: t.key,
        doc_number: baris.out_number,
        period_key: periodKey,
        seq: baris.out_seq,
        doc_date: form.docDate || null,
        requester: form.requester || null,
        department: form.department || null,
        payload,
      });
    if (errInsert) throw errInsert;

    tampilkanHasilDocNum(baris.out_number);
    resetDocNumForm(typeKey, { keepIdentity: true });
    docNumPage = 1;
    await Promise.all([refreshDocNumPreview(typeKey), renderDocNumHistory()]);
    showToast(`Nomor ${baris.out_number} berhasil diterbitkan.`, "success");
  } catch (err) {
    console.error(err);
    // Nomor urut mungkin SUDAH terpakai walau penyimpanan gagal — itu
    // disengaja: lebih baik ada nomor yang lompat daripada dua dokumen
    // memakai nomor yang sama. Pesannya dibuat jelas supaya user tidak
    // menekan tombol berkali-kali.
    showToast(
      `Gagal menerbitkan nomor: ${err.message || "kesalahan tidak diketahui"}. Jangan tekan ulang berkali-kali — cek dulu daftar "Nomor Terakhir Terbit" di bawah.`,
      "danger",
    );
  } finally {
    docNumBusy = false;
    btn.disabled = false;
    btn.innerHTML = htmlAsli;
  }
}

function tampilkanHasilDocNum(nomor) {
  $("#docNumResultNumber").textContent = nomor;
  $("#docNumResult").classList.remove("d-none");
}

// `keepIdentity` mempertahankan nama pemohon & departemen: satu orang
// biasanya mengajukan beberapa nomor berturut-turut, jadi mengosongkan
// identitasnya tiap kali justru menambah pekerjaan.
function resetDocNumForm(typeKey, opts) {
  const panel = docNumPanelEl(typeKey);
  if (!panel) return;
  const keep = opts && opts.keepIdentity;
  panel.querySelectorAll("[data-dn]").forEach((el) => {
    if (keep && (el.dataset.dn === "requester" || el.dataset.dn === "department"))
      return;
    if (keep && el.dataset.dn === "docDate") return;
    if (el.hasAttribute("data-dn-subtype")) return;
    el.value = "";
    el.classList.remove("is-invalid");
  });
}

/* ---------- riwayat nomor terbit ---------- */

/* Halaman & jumlah baris riwayat. Riwayat nomor tumbuh terus tiap hari;
   tanpa dibatasi, halaman ini akan memanjang tak terkendali ke bawah dan
   kotak "Atur Nomor Urut" di atasnya jadi jauh dari pandangan. */
let docNumPage = 1;
let docNumPageSize = 5;

async function renderDocNumHistory() {
  const box = $("#docNumHistory");
  const bar = $("#docNumPagination");
  if (!box) return;
  box.innerHTML = `<div class="docnum-empty">Memuat…</div>`;
  if (bar) bar.innerHTML = "";

  const jenis = resolveDocNumType(docNumActiveTab);
  try {
    // Ambil HANYA sebanyak satu halaman. Jumlah keseluruhan diminta
    // terpisah lewat `count: "exact"` — jadi jumlah halaman tetap benar
    // tanpa harus mengunduh seluruh riwayat ke browser.
    const dari = (docNumPage - 1) * docNumPageSize;
    const { data, error, count } = await supabaseClient
      .from("document_numbers")
      .select(
        "id, doc_number, doc_date, requester, department, payload, created_at",
        { count: "exact" },
      )
      .eq("doc_type", jenis.key)
      .order("created_at", { ascending: false })
      .range(dari, dari + docNumPageSize - 1);
    if (error) throw error;

    const total = count || 0;
    // Halaman terakhir bisa jadi kosong setelah data dihapus; kalau itu
    // terjadi, mundur ke halaman yang masih ada isinya.
    if (total > 0 && (!data || !data.length) && docNumPage > 1) {
      docNumPage = Math.max(1, Math.ceil(total / docNumPageSize));
      return renderDocNumHistory();
    }

    if (!total) {
      box.innerHTML = `<div class="docnum-empty">Belum ada nomor ${escapeHtml(jenis.label)} yang diterbitkan.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="docnum-table">
        <thead>
          <tr><th>Nomor</th><th>Tanggal</th><th>Pemohon</th><th>Keterangan</th><th class="dn-act"></th></tr>
        </thead>
        <tbody>
          ${data
            .map((r) => {
              const p = r.payload || {};
              const ringkas =
                p.customer ||
                p.receiver ||
                p.payee ||
                p.recipient ||
                p.subject ||
                p.notes ||
                "—";
              return `<tr>
                <td class="dn-num">${escapeHtml(r.doc_number)}</td>
                <td>${escapeHtml(fmtDate(r.doc_date))}</td>
                <td>${escapeHtml(r.requester || "—")}${r.department ? ` <span class="dn-dept">${escapeHtml(r.department)}</span>` : ""}</td>
                <td>${escapeHtml(String(ringkas).slice(0, 60))}</td>
                <td class="dn-act">
                  <button type="button" class="icon-btn danger" data-del-num="${r.id}"
                          data-num-label="${escapeHtml(r.doc_number)}" title="Hapus nomor ini">
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
    renderDocNumPagination(total);
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="docnum-empty">Gagal memuat riwayat: ${escapeHtml(err.message || "kesalahan tidak diketahui")}</div>`;
  }
}

// Memakai kelas & susunan yang SAMA dengan paginasi daftar jadwal
// (.pagination-bar, .page-btn, .page-nav) supaya keduanya terasa satu
// komponen, bukan dua gaya berbeda di aplikasi yang sama.
function renderDocNumPagination(total) {
  const bar = $("#docNumPagination");
  if (!bar) return;
  const totalHal = Math.max(1, Math.ceil(total / docNumPageSize));
  if (docNumPage > totalHal) docNumPage = totalHal;
  const awal = (docNumPage - 1) * docNumPageSize + 1;
  const akhir = Math.min(docNumPage * docNumPageSize, total);

  const tombolHal = paginationRange(docNumPage, totalHal)
    .map((h) =>
      h === "..."
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn ${h === docNumPage ? "active" : ""}" data-dnpage="${h}">${h}</button>`,
    )
    .join("");

  bar.className = "pagination-bar pagination-bar--compact";
  bar.innerHTML = `
    <div class="pagination-info">Menampilkan <b>${awal}–${akhir}</b> dari <b>${total}</b> nomor</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" id="dnPagePrev" ${docNumPage <= 1 ? "disabled" : ""} title="Halaman sebelumnya"><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${tombolHal}</div>
      <button type="button" class="page-nav" id="dnPageNext" ${docNumPage >= totalHal ? "disabled" : ""} title="Halaman berikutnya"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="dnPageSize">Per halaman</label>
      <select id="dnPageSize">
        ${[5, 10, 20, 50, 100]
          .map(
            (n) =>
              `<option value="${n}" ${n === docNumPageSize ? "selected" : ""}>${n}</option>`,
          )
          .join("")}
      </select>
    </div>`;
}

// Satu pendengar untuk seluruh bilah — isinya dirender ulang tiap kali,
// jadi tombolnya tidak bisa didaftarkan satu per satu.
$("#docNumPagination")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dnpage], #dnPagePrev, #dnPageNext");
  if (!btn || btn.disabled) return;
  if (btn.dataset.dnpage) docNumPage = parseInt(btn.dataset.dnpage, 10);
  else if (btn.id === "dnPagePrev") docNumPage = Math.max(1, docNumPage - 1);
  else docNumPage += 1;
  renderDocNumHistory();
});
$("#docNumPagination")?.addEventListener("change", (e) => {
  if (e.target.id !== "dnPageSize") return;
  docNumPageSize = parseInt(e.target.value, 10) || 5;
  docNumPage = 1; // jumlah baris berubah -> nomor halaman lama tidak lagi bermakna
  renderDocNumHistory();
});

/* ------------------------------------------------------------------
   HAPUS SATU NOMOR

   Menggantikan pembersihan massal per rentang tanggal, yang ternyata
   berlebihan: penomoran sudah mereset sendiri tiap pergantian tahun
   (kunci periodenya memang tahun), jadi yang benar-benar dibutuhkan
   hanya membuang satu nomor yang salah terbit.

   Penyetelan ulang counter dikerjakan di database dalam transaksi yang
   sama (lihat delete_document_number di schema-migration.sql): kalau
   yang dihapus nomor TERAKHIR, nomor itu bisa dipakai lagi sehingga
   tidak meninggalkan lompatan; kalau yang dihapus nomor di TENGAH,
   counter tetap di puncak agar nomor berikutnya tidak menabrak.
------------------------------------------------------------------ */
$("#docNumHistory")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del-num]");
  if (!btn) return;
  const id = btn.dataset.delNum;
  const label = btn.dataset.numLabel || "nomor ini";
  showConfirm(
    `Hapus nomor ${label}?\n\n` +
      `Catatannya hilang permanen. Kalau ini nomor terakhir di deretnya, ` +
      `nomor tersebut akan dipakai lagi pada penerbitan berikutnya.`,
    async () => {
      btn.disabled = true;
      try {
        const { error } = await supabaseClient.rpc("delete_document_number", {
          p_id: id,
        });
        if (error) throw error;
        showToast(`Nomor ${label} dihapus.`, "success");
        refreshDocNumPreview(docNumActiveTab);
        renderDocNumHistory();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        showToast(
          `Gagal menghapus: ${err.message || "kesalahan tidak diketahui"}`,
          "danger",
        );
      }
    },
  );
});

/* ---------- tab ---------- */

function showDocNumTab(key) {
  const tabs = document.querySelectorAll("[data-docnum-tab]");
  const panels = document.querySelectorAll("[data-docnum-panel]");
  if (!tabs.length) return;

  // Kalau kunci tidak dikenal (mis. hash lama), jatuh ke tab pertama
  // supaya halaman tidak pernah tampil kosong tanpa panel aktif.
  const known = Array.from(tabs).some((t) => t.dataset.docnumTab === key);
  const active = known ? key : DOCNUM_DEFAULT_TAB;
  docNumActiveTab = active;

  tabs.forEach((t) =>
    t.classList.toggle("active", t.dataset.docnumTab === active),
  );
  panels.forEach((p) =>
    p.classList.toggle("active", p.dataset.docnumPanel === active),
  );

  $("#docNumResult").classList.add("d-none");
  $("#docNumHint").textContent = "";

  // Tanggal dokumen default = hari ini, biar tidak perlu diketik tiap kali.
  const panel = docNumPanelEl(active);
  const tglEl = panel && panel.querySelector('[data-dn="docDate"]');
  if (tglEl && !tglEl.value) tglEl.value = todayISO();

  docNumPage = 1;
  refreshDocNumPreview(active);
  renderDocNumHistory();
}

const docNumTabsEl = $("#docNumTabs");
if (docNumTabsEl) {
  docNumTabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-docnum-tab]");
    if (!btn) return;
    showDocNumTab(btn.dataset.docnumTab);
  });
}

// Mengubah tanggal berarti mengubah periode penomoran (bulan/tahun di
// dalam nomor), jadi pratinjaunya ikut dihitung ulang.
document.querySelectorAll('[data-docnum-panel] [data-dn="docDate"]').forEach(
  (el) => {
    el.addEventListener("change", () => refreshDocNumPreview(docNumActiveTab));
  },
);
// Mengganti sub-jenis berarti pindah DERET nomor, jadi pratinjau dan
// riwayatnya ikut dimuat ulang.
document.querySelectorAll("[data-dn-subtype]").forEach((el) => {
  el.addEventListener("change", () => {
    docNumPage = 1;
    refreshDocNumPreview(docNumActiveTab);
    renderDocNumHistory();
  });
});

$("#btnDocNumSubmit")?.addEventListener("click", submitDocNumRequest);
$("#btnDocNumReset")?.addEventListener("click", () => {
  resetDocNumForm(docNumActiveTab);
  $("#docNumResult").classList.add("d-none");
  $("#docNumHint").textContent = "";
});
$("#btnDocNumRefresh")?.addEventListener("click", () => {
  refreshDocNumPreview(docNumActiveTab);
  renderDocNumHistory();
});
$("#btnCopyDocNum")?.addEventListener("click", async () => {
  const nomor = $("#docNumResultNumber").textContent.trim();
  if (!nomor || nomor === "—") return;
  const ok = await copyToClipboard(nomor);
  showToast(ok ? "Nomor disalin." : "Gagal menyalin nomor.", ok ? "success" : "danger");
});

/* ------------------------------------------------------------------
   Penanda halaman aktif di navbar. Dipanggil tiap kali router berpindah
   halaman, bukan sekali di awal — supaya tetap benar saat pengguna
   menekan tombol Back/Forward browser.
------------------------------------------------------------------ */
function setActivePageNav(page) {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === page);
  });
}
