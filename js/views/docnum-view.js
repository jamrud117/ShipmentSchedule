let docNumHistoryRows = [];

"use strict";

/* HALAMAN: PERMINTAAN NOMOR DOKUMEN */

/* Sebagian jenis dokumen punya SUB-JENIS yang seri nomornya terpisah */
/* POLA NOMOR */
const DOCNUM_SUBTYPES = {
  invoice: {
    Commercial: {
      key: "invoice",
      label: "Commercial Invoice",
      /* Spasi di kiri-kanan tanda pisah memang disengaja —
         "DDI - CRBM - VIII - 045". Nomor lama tetap tersimpan tanpa
         spasi; pencarian sudah mengabaikan tanda pisah, jadi kedua
         bentuk itu saling ketemu. */
      pattern: "DDI - CRBM - {MM} - {SEQ}",
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
    // Cadangan kalau sub-jenisnya tidak terpilih — bentuknya harus sama.
    pattern: "DDI - CRBM - {MM} - {SEQ}",
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

// Kolom tersendiri di tabel document_numbers
const DOCNUM_COLUMN_FIELDS = new Set(["docDate", "requester", "department"]);

let docNumActiveTab = DOCNUM_DEFAULT_TAB;
let docNumBusy = false;

/* ---------- pembentukan nomor ---------- */

// "2026"; kalau suatu saat ada yang perlu reset BULANAN
function resolveDocNumType(tabKey) {
  const base = DOCNUM_TYPES[tabKey] || {};
  const subs = DOCNUM_SUBTYPES[tabKey];
  if (subs) {
    const panel = docNumPanelEl(tabKey);
    const el = panel && panel.querySelector("[data-dn-subtype]");
    const hit = el && subs[el.value];
    if (hit) {
      // `pattern` WAJIB ikut diteruskan
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

/* SERI PENOMORAN */
const docNumSeries = {};

async function muatSeri(docType) {
  const { data, error } = await supabaseClient.rpc("current_document_series", {
    p_doc_type: docType,
  });
  if (error) throw error;
  const seri = String(data == null ? "1" : data);
  docNumSeries[docType] = seri;
  return seri;
}

// Pola dengan {MM} & {YYYY} sudah terisi
function docNumTemplate(typeKey, isoDate) {
  const t = resolveDocNumType(typeKey);
  const d = parseLocalDate(isoDate) || new Date();
  return String(t.pattern || "{SEQ}")
    .replace(/\{MM\}/g, ROMAN_MONTHS[d.getMonth()])
    .replace(/\{YYYY\}/g, String(d.getFullYear()));
}

// Dipakai untuk PRATINJAU di layar
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

// Mengembalikan daftar pesan kesalahan; kosong berarti lolos
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
      /* parseInputNumber: kotak ini milik aplikasi, bentuknya kita
         sendiri yang tulis (koma ribuan, titik desimal). excelNum()
         menebak, dan tebakannya untuk "1.050" meleset seribu kali. */
      const angka = parseInputNumber(nilai);
      if (!isFinite(angka) || angka < 0) {
        errors.push(`${label} harus berupa angka (tidak boleh negatif).`);
        el.classList.add("is-invalid");
      }
    }
  });

  // Tanggal dokumen tidak boleh terlalu jauh ke depan: nomor terbit berurutan
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

// Menampilkan nomor yang AKAN terbit
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

/* ATUR / RESET NOMOR URUT */
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

// Nomor urut TERTINGGI yang sudah pernah terbit di periode ini
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
  !requireEdit() ? null :
  simpanCounter($("#counterNext").value),
);
/* Reset manual: counter tidak dinolkan agar nomor tidak terbit ganda */
$("#btnCounterReset")?.addEventListener("click", () => {
  if (!requireEdit()) return;
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

/* ==================================================================
   MEMPERBAIKI ISIAN NOMOR YANG SUDAH TERBIT

   Yang boleh diubah HANYA isian permintaannya — tanggal, pemohon,
   departemen, dan seluruh payload. NOMOR dan urutannya tidak ikut,
   dan itu bukan kelalaian: nomor yang sudah terbit sudah beredar di
   invoice, surat jalan, dan berkas pihak lain. Mengubahnya di sini
   menciptakan dua kebenaran yang tidak mungkin dipertemukan lagi.

   Salah nomor diperbaiki dengan menghapus lalu menerbitkan ulang —
   jalur itu sudah ada, dan ia meninggalkan jejak.
================================================================== */
let dnEditingId = null;

function bolehUbahDocNum() {
  return typeof canEdit !== "function" || canEdit();
}

/* Kunci TAB dari jenis dokumen yang tersimpan.

   Sebagian jenis punya sub-jenis dengan seri nomor terpisah, dan yang
   masuk ke kolom doc_type adalah kunci SUB-JENIS-nya — "invoice_nc"
   untuk Non-Commercial Invoice. Panelnya cuma satu: "invoice".

   Tanpa pemetaan ini, docNumPanelEl("invoice_nc") mengembalikan null
   dan fungsi yang memanggilnya berhenti tanpa suara — tombolnya
   ditekan, tidak terjadi apa-apa, tidak ada pesan galat. */
function docNumTabKeyFor(docType) {
  if (DOCNUM_TYPES[docType]) return docType;
  const tab = Object.keys(DOCNUM_SUBTYPES).find((k) =>
    Object.values(DOCNUM_SUBTYPES[k]).some((s) => s.key === docType),
  );
  return tab || DOCNUM_DEFAULT_TAB;
}

/* Label sub-jenis dari kunci tersimpan — dipakai mengembalikan pilihan
   dropdown-nya saat isian dibuka untuk diperbaiki. */
function docNumSubtypeLabelFor(docType) {
  let hasil = "";
  Object.keys(DOCNUM_SUBTYPES).forEach((tab) => {
    Object.keys(DOCNUM_SUBTYPES[tab]).forEach((label) => {
      if (DOCNUM_SUBTYPES[tab][label].key === docType) hasil = label;
    });
  });
  return hasil;
}

function mulaiUbahDocNum(id) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  if (!bolehUbahDocNum()) {
    showToast("Akun Viewer tidak bisa mengubah data.", "danger");
    return;
  }

  /* Pindah ke panel jenis dokumennya dulu, baru isian diisi.

     Kalau doc_type tidak terbawa, yang dipakai TAB YANG SEDANG DIBUKA —
     bukan tab bawaan. Daftar riwayat selalu disaring per jenis, jadi
     baris yang sedang dilihat pasti milik tab itu. Jatuh ke tab bawaan
     berarti membuka form jenis lain tanpa ada yang bersuara. */
  const tabKey = docNumTabKeyFor(r.doc_type || docNumActiveTab);
  if (tabKey !== docNumActiveTab) showDocNumTab(tabKey);

  const panel = docNumPanelEl(tabKey);
  if (!panel) {
    showToast("Panel jenis dokumen ini tidak ditemukan.", "danger");
    return;
  }
  resetDocNumForm(tabKey);
  dnIsianOtomatis = {};

  /* Sub-jenis dikembalikan ke pilihan semula. resetDocNumForm sengaja
     tidak menyentuhnya, tapi ia juga tidak tahu nomor mana yang sedang
     dibuka — kalau dibiarkan, Non-Commercial Invoice terbuka dengan
     dropdown menunjuk Commercial. */
  const subLabel = docNumSubtypeLabelFor(r.doc_type);
  const elSub = panel.querySelector("[data-dn-subtype]");
  if (elSub && subLabel) elSub.value = subLabel;

  const isi = (nama, nilai) => {
    const el = panel.querySelector(`[data-dn="${nama}"]`);
    if (el && nilai != null) el.value = nilai;
  };
  isi("docDate", r.doc_date);
  isi("requester", r.requester);
  isi("department", r.department);
  Object.keys(r.payload || {}).forEach((k) => isi(k, r.payload[k]));
  /* Kotak tersembunyi sudah terisi id-nya oleh isi() di atas, tapi
     kotak yang DITERLIHAT pengguna masih kosong — tanpa baris ini,
     membuka nomor lama untuk diubah menampilkan tautan jadwal sebagai
     kosong padahal datanya ada. */
  DN_PEMILIH_JADWAL.forEach((pas) => dnSegarkanLabelPemilih(pas));

  dnEditingId = r.id;
  syncModeUbahDocNum(r.doc_number);

  /* Menggulir ke form itu kenyamanan, bukan bagian dari operasinya.
     Dibiarkan tanpa penjaga, satu peramban yang tidak mendukungnya
     akan melempar SESUDAH isian terisi — form tampak siap diedit,
     padahal mode ubahnya tidak pernah selesai dipasang. */
  if (typeof panel.scrollIntoView === "function") {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Form berada jauh di atas tabel riwayat. Kalau gulirannya tidak
     bergerak — halaman pendek, gulir dihentikan pengguna, atau
     kontainer yang bergulir bukan jendela — tidak ada satu pun tanda
     bahwa tombolnya bekerja. Toast terlihat di mana pun posisinya. */
  showToast(
    `Isian nomor ${r.doc_number} dibuka untuk diperbaiki — form ada di atas.`,
    "dark",
  );
}

function batalUbahDocNum() {
  const jenis = dnEditingId ? docNumActiveTab : null;
  dnEditingId = null;
  syncModeUbahDocNum(null);
  if (jenis) resetDocNumForm(jenis, { keepIdentity: true });
}

/* Tombol Ajukan berubah jadi Simpan Perubahan, dan sebuah spanduk
   menyebutkan nomor mana yang sedang diperbaiki — tanpa itu, form yang
   sudah terisi mudah disangka pengajuan baru dan ditekan Ajukan. */
function syncModeUbahDocNum(nomor) {
  const btn = $("#btnDocNumSubmit");
  const banner = $("#dnEditBanner");
  if (btn) {
    btn.innerHTML = nomor
      ? '<i class="bi bi-check2"></i> Simpan Perubahan'
      : '<i class="bi bi-hash"></i> Ajukan Nomor';
  }
  if (banner) {
    banner.classList.toggle("d-none", !nomor);
    const el = $("#dnEditBannerNum");
    if (el) el.textContent = nomor || "";
  }
}

async function simpanUbahDocNum() {
  const typeKey = docNumActiveTab;
  const errors = validateDocNumForm(typeKey);
  if (errors.length) {
    showToast(errors[0], "danger");
    return;
  }

  const form = readDocNumForm(typeKey);
  const payload = {};
  Object.keys(form).forEach((k) => {
    if (!DOCNUM_COLUMN_FIELDS.has(k) && form[k] !== "") payload[k] = form[k];
  });

  docNumBusy = true;
  try {
    const { error } = await supabaseClient
      .from("document_numbers")
      .update({
        doc_date: form.docDate || null,
        requester: form.requester || null,
        department: form.department || null,
        payload,
      })
      .eq("id", dnEditingId);
    if (error) throw error;

    batalUbahDocNum();
    await renderDocNumHistory();
    showToast("Isian nomor berhasil diperbarui.", "success");
  } catch (err) {
    console.error(err);
    showToast(
      `Gagal menyimpan perubahan: ${err.message || "kesalahan tidak diketahui"}`,
      "danger",
    );
  } finally {
    docNumBusy = false;
  }
}

/* ---------- penerbitan nomor ---------- */

async function submitDocNumRequest() {
  if (docNumBusy) return;
  // Form yang sedang dipakai memperbaiki tidak boleh menerbitkan nomor baru.
  if (dnEditingId) {
    await simpanUbahDocNum();
    return;
  }
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
    // Seri dibaca ULANG tepat sebelum menerbitkan: kalau ada yang mereset dari perangkat lain
    const periodKey = await muatSeri(t.key);

    // LANGKAH 1 — ambil nomor urut dari database
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
    // Nomor urut mungkin SUDAH terpakai walau penyimpanan gagal — itu disengaja
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

// `keepIdentity` mempertahankan nama pemohon & departemen
/* Mengisi pemilih "Jadwal Terkait" dari data yang sudah dimuat.

   HANYA jadwal EXPORT. Surat jalan di sini memang bentuk untuk kiriman
   keluar — menawarkan jadwal Import cuma membuka peluang salah pilih,
   karena hasil cetaknya nanti ditolak oleh pemeriksa tombol cetak. */
/* Pasangan pemilih: kotak yang DITULIS pengguna, dan kotak tersembunyi
   yang menyimpan id jadwalnya. */
const DN_PEMILIH_JADWAL = [
  { cari: "#dnShipmentSearch", id: "#dnShipmentPick" },        // surat jalan
  { cari: "#dnInvoiceShipmentSearch", id: "#dnInvoiceShipmentPick" }, // CIPL
];

/* Label -> id. Dibangun ulang tiap kali daftar jadwal berubah. */
let dnPetaJadwal = new Map();

/* Label yang ditulis di daftar saran. Harus UNIK: dua jadwal dengan
   nomor invoice & buyer yang sama akan saling menimpa di peta, dan
   pengguna memilih satu tapi mendapat yang lain — tanpa ada tanda apa
   pun. Yang bentrok dibedakan dengan tanggal ETD-nya. */
function dnLabelJadwal(s) {
  return [dispVal(s.invoice), dispVal(s.party)]
    .filter((v) => v && v !== "—")
    .join(" · ");
}

function isiPilihanJadwal() {
  const peta = new Map();
  const opsi = [];
  (data.export || []).forEach((s) => {
    let label = dnLabelJadwal(s) || "(tanpa nomor)";
    if (peta.has(label)) {
      const beda = s.etd ? fmtDate(s.etd) : String(s.id).slice(0, 6);
      label = `${label} · ETD ${beda}`;
    }
    /* Masih bentrok juga — dibubuhi id supaya tetap bisa dipilih.
       Jelek dibaca, tapi jauh lebih baik daripada dua baris identik
       yang salah satunya tidak pernah bisa terpilih. */
    while (peta.has(label)) label += "·";
    peta.set(label, s.id);
    opsi.push(`<option value="${escapeAttr(label)}"></option>`);
  });
  dnPetaJadwal = peta;

  const dl = $("#dnShipmentList");
  if (dl) dl.innerHTML = opsi.join("");

  // Kotak yang sudah terisi disegarkan labelnya (nomor invoice bisa berubah).
  DN_PEMILIH_JADWAL.forEach((pas) => dnSegarkanLabelPemilih(pas));
}

/* Menulis ulang label yang terlihat dari id yang tersimpan. */
function dnSegarkanLabelPemilih(pas) {
  const elId = $(pas.id);
  const elCari = $(pas.cari);
  if (!elId || !elCari) return;
  if (!elId.value) {
    elCari.value = "";
    return;
  }
  const s = (data.export || []).find((x) => String(x.id) === String(elId.value));
  if (!s) return;                       // jadwalnya terhapus — biarkan apa adanya
  for (const [label, id] of dnPetaJadwal) {
    if (String(id) === String(s.id)) {
      elCari.value = label;
      return;
    }
  }
}

/* Menerjemahkan yang diketik jadi id, lalu memberi tahu pendengar yang
   sudah ada lewat event `change` pada kotak tersembunyi. */
function dnPasangPemilihJadwal() {
  DN_PEMILIH_JADWAL.forEach((pas) => {
    const elCari = $(pas.cari);
    const elId = $(pas.id);
    if (!elCari || !elId || elCari.dataset.dnTerpasang) return;
    elCari.dataset.dnTerpasang = "1";

    const terapkan = () => {
      const teks = String(elCari.value || "").trim();
      const idBaru = teks ? dnPetaJadwal.get(teks) || "" : "";
      /* Kotak yang diisi tapi tidak cocok ditandai merah, bukan
         diam-diam dianggap "tidak ditautkan" — salah ketik satu huruf
         akan mencetak surat jalan tanpa daftar barang. */
      elCari.classList.toggle("is-invalid", !!teks && !idBaru);
      if (String(elId.value) === String(idBaru)) return;
      elId.value = idBaru;
      elId.dispatchEvent(new Event("change", { bubbles: true }));
    };
    // `input` supaya pilihan dari daftar saran langsung terbaca.
    elCari.addEventListener("input", terapkan);
    elCari.addEventListener("change", terapkan);
  });
}
document.addEventListener("DOMContentLoaded", dnPasangPemilihJadwal);
dnPasangPemilihJadwal();

/* Isian CIPL yang bisa DITURUNKAN dari jadwal.

   Yang diisi otomatis DICATAT nilainya. Saat jadwal ditukar, kotak
   yang isinya masih sama persis dengan yang dulu diisikan mesin
   dianggap belum disentuh dan ikut diperbarui; yang sudah diubah
   pengguna dibiarkan.

   Tanpa catatan itu, dua perilaku sama-sama salah: menimpa semuanya
   menghapus koreksi yang sengaja dibuat, sementara mengisi "hanya yang
   kosong" membuat data jadwal LAMA menempel setelah jadwalnya ditukar
   — nilai invoice, pelabuhan, dan carrier tetap milik jadwal
   sebelumnya tanpa ada yang menyadari. */
let dnIsianOtomatis = {};
/* Alamat consignee diisikan dari nama buyer-nya.

   Hanya kalau kotaknya masih KOSONG. Alamat yang sudah diketik boleh
   jadi versi yang sengaja dibetulkan untuk kiriman ini — menimpanya
   menghapus koreksi tanpa ada yang tahu. */
function isiAlamatConsignee() {
  const panel = docNumPanelEl("invoice");
  if (!panel || typeof ciplAlamatBuyer !== "function") return;
  const nama = panel.querySelector('[data-dn="customer"]');
  const alamat = panel.querySelector('[data-dn="consigneeAddress"]');
  if (!nama || !alamat) return;
  const sekarang = String(alamat.value || "").trim();
  const dulu = String(dnIsianOtomatis.consigneeAddress || "");
  if (sekarang && sekarang !== dulu) return;
  const isi = ciplAlamatBuyer(nama.value);
  if (isi) {
    alamat.value = isi;
    dnIsianOtomatis.consigneeAddress = isi;
  }
}

/* Dipasang sekali di sini, bukan di dalam isiPilihanJadwal() — daftar
   opsinya digambar ulang tiap kali data berubah, dan memasang
   pendengar di sana berarti menumpuk pendengar yang sama. */
const elPickInvoice = $("#dnInvoiceShipmentPick");
if (elPickInvoice) {
  elPickInvoice.addEventListener("change", isiOtomatisDariJadwal);
}

/* `change`, bukan `input`: alamat baru diisi setelah nama buyer selesai
   diketik. Pada `input`, "D" sudah cukup untuk mencocokkan sesuatu. */
const elCustomerInv = document.querySelector(
  '[data-docnum-panel="invoice"] [data-dn="customer"]',
);
if (elCustomerInv) {
  elCustomerInv.addEventListener("change", isiAlamatConsignee);
}

function isiOtomatisDariJadwal() {
  const sel = $("#dnInvoiceShipmentPick");
  if (!sel) return;
  const s = (data.export || []).find((x) => x.id === sel.value);
  if (!s) return;

  const panel = docNumPanelEl("invoice");
  if (!panel) return;
  const set = (nama, nilai) => {
    const el = panel.querySelector(`[data-dn="${nama}"]`);
    if (!el) return;
    const sekarang = String(el.value || "").trim();
    const dulu = String(dnIsianOtomatis[nama] || "");
    // Kosong, atau masih persis seperti yang dulu diisikan mesin.
    if (sekarang && sekarang !== dulu) return;
    el.value = nilai || "";
    dnIsianOtomatis[nama] = el.value;
  };

  set("customer", s.party);
  isiAlamatConsignee();

  /* Nilai invoice diambil dari total nilai barang di jadwalnya.

     `set()` tidak dipakai di sini: kotak Nilai kerap berisi "0" — bukan
     kosong — sehingga penjaga "isi hanya kalau kosong" menganggapnya
     sudah terisi dan angkanya tidak pernah masuk. Nol diperlakukan
     sama dengan kosong. */
  const elNilai = panel.querySelector('[data-dn="amount"]');
  if (elNilai && typeof computeCustoms === "function") {
    const total = computeCustoms(s).totalUSD;
    const sekarang = String(elNilai.value || "").trim();
    const dulu = String(dnIsianOtomatis.amount || "");
    // Nol diperlakukan sama dengan kosong: kotak ini kerap berisi "0".
    const belumDisentuh =
      !sekarang || !parseLooseNumber(sekarang) || sekarang === dulu;
    if (belumDisentuh) {
      elNilai.value = total ? formatNumberValue(Math.round(total * 100) / 100) : "";
      dnIsianOtomatis.amount = elNilai.value;
    }
  }
  set("portLoading", portCodeLabel(s.origin));
  set("finalDestination", portCodeLabel(s.destination));
  set("carrier", s.vessel);
  set("termsDelivery", s.incoterm);
  /* Sailing on or About SENGAJA tidak diisi dari ETD. Tanggal berlayar
     di invoice adalah keterangan pengangkut, bukan rencana kita — dan
     invoice kerap terbit sebelum kapalnya pasti. */
}

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
  /* Kotak ketik pemilih jadwal tidak ber-data-dn (yang ber-data-dn
     kotak tersembunyinya), jadi ia tidak ikut terhapus di atas. */
  DN_PEMILIH_JADWAL.forEach((pas) => {
    const elCari = $(pas.cari);
    if (!elCari) return;
    elCari.value = "";
    elCari.classList.remove("is-invalid");
  });
}

/* ---------- riwayat nomor terbit ---------- */

/* Halaman & jumlah baris riwayat. Riwayat nomor tumbuh terus tiap hari */
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
    // Ambil HANYA sebanyak satu halaman
    const dari = (docNumPage - 1) * docNumPageSize;
    const { data, error, count } = await supabaseClient
      .from("document_numbers")
      .select(
        /* doc_type WAJIB ikut diambil.

           Tanpanya, tiap baris di layar punya doc_type undefined —
           dan siapa pun yang menanyakannya akan mendapat jawaban yang
           kelihatan masuk akal tapi salah. Tombol Perbaiki memetakan
           undefined ke tab bawaan, jadi menekan edit pada Surat Jalan
           melompat ke panel Invoice dan mengisi form yang keliru.

           Baris ini memang sudah disaring per jenis di kueri, tapi
           datanya tetap harus membawa jenisnya sendiri — yang menyaring
           dan yang membaca bukan bagian kode yang sama. */
        "id, doc_type, doc_number, doc_date, requester, department, payload, created_at",
        { count: "exact" },
      )
      .eq("doc_type", jenis.key)
      .order("created_at", { ascending: false })
      .range(dari, dari + docNumPageSize - 1);
    if (error) throw error;

    /* Disimpan supaya tombol cetak tidak perlu memanggil database lagi —
       barisnya sudah ada di layar. Sengaja dipastikan berupa LARIK:
       kalau kueri mengembalikan null, .find() akan meledak saat ditekan. */
    docNumHistoryRows = Array.isArray(data) ? data : [];

    const total = count || 0;
    // Halaman terakhir bisa jadi kosong setelah data dihapus
    if (total > 0 && (!data || !data.length) && docNumPage > 1) {
      docNumPage = Math.max(1, Math.ceil(total / docNumPageSize));
      return renderDocNumHistory();
    }

    if (!total) {
      box.innerHTML = `<div class="docnum-empty">Belum ada nomor ${escapeHtml(jenis.label)} yang diterbitkan.</div>`;
      return;
    }

    box.innerHTML = `
      <div class="docnum-history-wrap">
      <table class="docnum-table">
        <thead>
          <tr><th>Nomor</th><th class="dn-col-tgl">Tanggal</th><th class="dn-col-pemohon">Pemohon</th><th>${escapeHtml(DN_KOLOM_UTAMA[jenis.key] || "Keterangan")}</th><th class="dn-act"></th></tr>
        </thead>
        <tbody>
          ${data
            .map((r) => {
              const p = r.payload || {};
              let ringkas =
                p.customer ||
                p.receiver ||
                p.payee ||
                p.recipient ||
                p.subject ||
                p.notes ||
                "—";
              /* Alamat & isian lain TIDAK lagi ditempel di sini.

                 Kolom Keterangan tadinya memuat penerima + alamat penuh
                 dan melebar melewati tabelnya. Semua isian sekarang bisa
                 dilihat lewat tombol Detail — daftarnya cukup menyebut
                 satu hal yang membedakan tiap baris. */
              return `<tr>
                <td class="dn-num">${escapeHtml(r.doc_number)}</td>
                <!-- Kelas yang sama dengan kepalanya: menyembunyikan
                     hanya <th> membuat kolomnya bergeser, bukan hilang. -->
                <td class="dn-col-tgl">${escapeHtml(fmtDate(r.doc_date))}</td>
                <td class="dn-col-pemohon">${escapeHtml(r.requester || "—")}${r.department ? ` <span class="dn-dept">${escapeHtml(r.department)}</span>` : ""}</td>
                <td>${escapeHtml(String(ringkas).slice(0, 60))}</td>
                <td class="dn-act">
                  ${
                    /* Edit hanya untuk isian permintaannya — NOMOR dan
                       urutannya tidak ikut diubah. Nomor yang sudah
                       terbit sudah beredar di dokumen lain; menariknya
                       kembali menciptakan dua kebenaran. */
                    bolehUbahDocNum()
                      ? `<button type="button" class="icon-btn" data-edit-num="${r.id}"
                                 title="Perbaiki isian"><i class="bi bi-pencil"></i></button>`
                      : ""
                  }
                  <button type="button" class="icon-btn" data-detail-num="${r.id}"
                          title="Lihat seluruh isian"><i class="bi bi-list-ul"></i></button>
                  ${
                    /* Surat jalan hanya dipakai untuk kiriman EXPORT.
                       Yang belum ditautkan pun ditawarkan — jadwalnya
                       bisa dipasang belakangan lewat pengajuan baru. */
                    jenis.key === "do" && sjBolehCetak(r)
                      ? `<button type="button" class="icon-btn" data-print-sj="${r.id}"
                                 title="Cetak surat jalan"><i class="bi bi-printer"></i></button>`
                      : ""
                  }
                  ${
                    /* Satu tombol, dua halaman: Commercial Invoice &
                       Packing List. Judul halaman pertama mengikuti
                       jenis invoice yang dipilih saat nomor terbit. */
                    /^invoice/.test(jenis.key) && ciplBolehCetak(r)
                      ? `<button type="button" class="icon-btn" data-print-cipl="${r.id}"
                                 title="Cetak Commercial Invoice, Packing List & Shipping Instruction"><i class="bi bi-printer"></i></button>
                         <button type="button" class="icon-btn" data-xls-cipl="${r.id}"
                                 title="Unduh Excel (Invoice, PL, SI)"><i class="bi bi-file-earmark-excel"></i></button>`
                      : ""
                  }
                  <button type="button" class="icon-btn danger" data-del-num="${r.id}"
                          data-num-label="${escapeHtml(r.doc_number)}" title="Hapus nomor ini">
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      </div>`;
    renderDocNumPagination(total);
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="docnum-empty">Gagal memuat riwayat: ${escapeHtml(err.message || "kesalahan tidak diketahui")}</div>`;
  }
}

// Memakai kelas & susunan yang SAMA dengan paginasi daftar jadwal (.pagination-bar
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

// Satu pendengar untuk seluruh bilah — isinya dirender ulang tiap kali
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

/* HAPUS SATU NOMOR */
$("#docNumHistory")?.addEventListener("click", (e) => {
  const ubah = e.target.closest("[data-edit-num]");
  if (ubah) {
    mulaiUbahDocNum(ubah.dataset.editNum);
    return;
  }
  const detail = e.target.closest("[data-detail-num]");
  if (detail) {
    // Melihat detail tidak mengubah apa pun — viewer pun boleh.
    tampilkanDetailNomor(detail.dataset.detailNum);
    return;
  }
  const cetak = e.target.closest("[data-print-sj]");
  if (cetak) {
    // Mencetak tidak mengubah apa pun, jadi viewer pun boleh.
    cetakSuratJalan(cetak.dataset.printSj);
    return;
  }
  const cetakCi = e.target.closest("[data-print-cipl]");
  if (cetakCi) {
    cetakCipl(cetakCi.dataset.printCipl);
    return;
  }
  const xlsCi = e.target.closest("[data-xls-cipl]");
  if (xlsCi) {
    unduhCiplExcel(xlsCi.dataset.xlsCipl);
    return;
  }
  if (e.target.closest("[data-del-num]") && !requireEdit()) return;
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

  // Kalau kunci tidak dikenal (mis
  const known = Array.from(tabs).some((t) => t.dataset.docnumTab === key);
  const active = known ? key : DOCNUM_DEFAULT_TAB;
  /* Berpindah jenis dokumen membatalkan perbaikan yang sedang berjalan.
     Form panel lain sudah kosong; membiarkan dnEditingId hidup membuat
     pengajuan berikutnya diam-diam menimpa nomor yang tadi dibuka. */
  if (typeof dnEditingId !== "undefined" && dnEditingId && active !== docNumActiveTab) {
    dnEditingId = null;
    syncModeUbahDocNum(null);
  }
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

// Mengubah tanggal berarti mengubah periode penomoran (bulan/tahun di dalam nomor)
document.querySelectorAll('[data-docnum-panel] [data-dn="docDate"]').forEach(
  (el) => {
    el.addEventListener("change", () => refreshDocNumPreview(docNumActiveTab));
  },
);
// Mengganti sub-jenis berarti pindah DERET nomor, jadi pratinjau dan riwayatnya ikut dimuat ulang.
document.querySelectorAll("[data-dn-subtype]").forEach((el) => {
  el.addEventListener("change", () => {
    docNumPage = 1;
    refreshDocNumPreview(docNumActiveTab);
    renderDocNumHistory();
  });
});

$("#btnDnEditCancel")?.addEventListener("click", batalUbahDocNum);

$("#btnDocNumSubmit")?.addEventListener("click", () => {
  if (!requireEdit()) return;
  submitDocNumRequest();
});
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

/* Penanda halaman aktif di navbar. Dipanggil tiap kali router berpindah */
function setActivePageNav(page) {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === page);
  });
}


/* ------------------------------------------------------------------
   DETAIL PENGAJUAN NOMOR

   Isian tiap jenis dokumen berbeda-beda, dan menampilkan semuanya di
   tabel membuat kolom Keterangan melebar melewati lebarnya. Di sini
   seluruh isian ditampilkan apa adanya — termasuk field yang hanya
   dipunyai satu jenis dokumen.
------------------------------------------------------------------ */
/* Judul kolom keempat mengikuti jenis dokumennya. "Keterangan" terlalu
   samar padahal isinya selalu satu hal tertentu. */
const DN_KOLOM_UTAMA = {
  do: "Tujuan / Penerima",
  invoice: "Customer",
  fund: "Dibayarkan Kepada",
  letter: "Perihal",
};

const DN_LABEL_FIELD = {
  packages: "Jumlah Koli",
  receiver: "Tujuan / Penerima",
  address: "Alamat Tujuan",
  vehicle: "No. Kendaraan",
  shipmentId: "Jadwal Terkait",
  customer: "Customer",
  payee: "Dibayarkan Kepada",
  recipient: "Penerima Surat",
  subject: "Perihal",
  amount: "Nilai",
  currency: "Mata Uang",
  purpose: "Keperluan",
  notes: "Keterangan",
  reference: "Referensi",
  packages: "Jumlah Koli",
  quantity: "Jumlah",
  unit: "Satuan",
  // Isian CIPL
  invoiceKind: "Jenis Invoice",
  consigneeAddress: "Alamat Consignee",
  notifyParty: "Notify Party",
  poNo: "PO No.",
  poDate: "Tanggal PO",
  termsDelivery: "Terms of Delivery",
  termPayment: "Term of Payment",
  portLoading: "Port of Loading",
  finalDestination: "Final Destination",
  carrier: "Carrier",
  sailingDate: "Sailing on or About",
  remarks: "Remarks",
};

/* Urutan tampil di kotak Detail. Yang tidak tersebut di sini ikut di
   belakang, urut sesuai kemunculannya.

   Tanpa urutan tetap, isian tampil mengikuti urutan kunci JSON — dan
   itu berubah-ubah mengikuti urutan pengisian, sehingga dua invoice
   yang isinya sama bisa tampil dengan susunan berbeda. */
const DN_URUTAN_FIELD = [
  "invoiceKind",
  "customer",
  "consigneeAddress",
  "notifyParty",
  "shipmentId",
  "poNo",
  "poDate",
  "termsDelivery",
  "termPayment",
  "currency",
  "amount",
  "portLoading",
  "finalDestination",
  "carrier",
  "sailingDate",
  "remarks",
  "receiver",
  "address",
  "vehicle",
  "packages",
  "payee",
  "expenseType",
  "letterType",
  "signer",
  "recipient",
  "subject",
  "notes",
];

function tampilkanDetailNomor(id) {
  const r = (docNumHistoryRows || []).find((x) => String(x.id) === String(id));
  if (!r) return;
  const p = r.payload || {};

  const baris = [
    ["Nomor", r.doc_number],
    ["Tanggal", fmtDate(r.doc_date)],
    ["Pemohon", r.requester],
    ["Departemen", r.department],
  ].filter(([, v]) => String(v == null ? "" : v).trim() !== "");
  const urut = [
    ...DN_URUTAN_FIELD.filter((k) => k in p),
    ...Object.keys(p).filter((k) => !DN_URUTAN_FIELD.includes(k)),
  ];
  urut.forEach((k) => {
    let nilai = p[k];
    if (k === "shipmentId") {
      const kapal = typeof sjCariShipment === "function" ? sjCariShipment(nilai) : null;
      nilai = kapal
        ? [dispVal(kapal.invoice), dispVal(kapal.party)].filter(Boolean).join(" · ")
        : "(jadwal tidak ditemukan)";
    }
    if (String(nilai ?? "").trim() === "") return;
    /* Nilai selalu dalam mata uang yang tercatat di baris ini. Angka
       telanjang "30,062" tidak memberi tahu rupiah atau dolar, dan pada
       dokumen ekspor bedanya bukan hal kecil. */
    if (k === "amount") {
      const mata = String(p.currency || "USD").toUpperCase();
      const lambang = mata === "USD" ? "$" : mata === "IDR" ? "Rp " : mata + " ";
      nilai = lambang + formatNumberValue(parseInputNumber(nilai));
    }
    /* Kunci yang belum punya label dirapikan sendiri: "packages" ->
       "Packages". Isian tiap jenis dokumen bisa bertambah, dan yang
       belum terdaftar tidak boleh tampil sebagai potongan kode. */
    const label =
      DN_LABEL_FIELD[k] ||
      k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    baris.push([label, nilai]);
  });

  $("#promptTitle").textContent = "Detail Pengajuan Nomor";
  $("#promptDesc").textContent = "";
  $("#promptDesc").classList.add("d-none");
  $("#promptIcon").className = "bi bi-list-ul";
  $("#promptError").classList.add("d-none");
  $("#promptFields").innerHTML = `
    <dl class="dn-detail">
      ${baris
        .map(
          ([k, v]) =>
            `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v)).replace(/\n/g, "<br>")}</dd>`,
        )
        .join("")}
    </dl>`;
  /* Kotak ini hanya membaca: tombol Simpan disembunyikan dan "Batal"
     diganti "Tutup" — tidak ada yang dibatalkan. */
  $("#promptOk").classList.add("d-none");
  const batal = $("#promptModal .modal-footer .btn-quiet");
  const teksBatal = batal.textContent;
  batal.textContent = "Tutup";
  const modal = bootstrap.Modal.getOrCreateInstance($("#promptModal"));
  $("#promptModal").addEventListener(
    "hidden.bs.modal",
    () => {
      $("#promptOk").classList.remove("d-none");
      batal.textContent = teksBatal;
    },
    { once: true },
  );
  modal.show();
}
