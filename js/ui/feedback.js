"use strict";

/* ------------------------------------------------------------------
   TOAST -- pengganti alert() bawaan

   Toast sendiri, bukan komponen Bootstrap: yang bawaan memaksa satu
   warna latar penuh (bg-danger dsb) sehingga pesan biasa pun terlihat
   seperti peringatan, dan tidak bisa diberi lambang per jenis.

   showToast(pesan, jenis, opsi)
     jenis  "success" | "danger" | "warning" | "info". Dua nama lama
            tetap diterima: "dark" (tindakan selesai -- sama dengan
            success) dan "error" (= danger).
     opsi   { judul } judul singkat sendiri; bawaannya menurut jenis
            ("Berhasil", "Terjadi kesalahan", "Perhatian", "Info").
            { tetap: true } tidak hilang sendiri -- untuk pesan yang
            menuntut tindakan (pop-up diblokir, migrasi database).
            Pesan yang menyuruh menjalankan berkas migration-*.sql
            otomatis tetap & berjudul "Database perlu diperbarui":
            pembacanya biasanya harus meneruskannya ke admin.

   SATU toast: pesan berikutnya menggantikan yang sedang tampil (satu
   tindakan = satu pemberitahuan -- js/views/form-router.js menggabung
   kalimat-kalimatnya). Pesan yang SAMA selagi masih tampil tidak
   dimunculkan ulang; waktunya saja yang diperpanjang.

   Lamanya mengikuti panjang pesan (galat lebih lama -- biasanya memuat
   langkah yang harus dikerjakan). Hitungannya BERHENTI selama tab
   peramban tidak terlihat dan selama tombol tutupnya difokus, jadi
   pesan tidak hilang tanpa sempat dibaca.

   Posisi (tepat di bawah bilah atas) diurus CSS sepenuhnya -- lihat
   .toast-stack di css/components.css. Tidak diukur dengan JS:
   mengukur bilah atas saat halaman baru selesai dirender memaksa
   seluruh tata letak dihitung di tengah skrip.
------------------------------------------------------------------ */
const TOAST_IKON = {
  success: "bi-check-circle-fill",
  danger: "bi-exclamation-octagon-fill",
  warning: "bi-exclamation-triangle-fill",
  info: "bi-info-circle-fill",
};
const TOAST_ALIAS = { dark: "success", error: "danger" };
const toastJudulBawaan = (jenis) =>
  ({
    success: tt("Berhasil", "Success"),
    danger: tt("Terjadi kesalahan", "Something went wrong"),
    warning: tt("Perhatian", "Heads up"),
    info: tt("Info", "Info"),
  })[jenis];
const RE_TOAST_MIGRASI = /migration-[\w-]+\.sql/;

let toastTimer = null;
let toastSisa = 0;
let toastMulai = 0;
let toastTetap = false;
let toastTerakhir = "";

function jalankanWaktuToast(ms) {
  clearTimeout(toastTimer);
  toastTimer = null;
  if (toastTetap) return;
  toastSisa = ms;
  toastMulai = Date.now();
  toastTimer = setTimeout(hideToast, ms);
}
function jedaToast() {
  const el = $("#appToast");
  if (!el || !toastTimer) return;
  clearTimeout(toastTimer);
  toastTimer = null;
  toastSisa = Math.max(0, toastSisa - (Date.now() - toastMulai));
  el.classList.add("is-jeda");
}
function lanjutkanToast() {
  const el = $("#appToast");
  if (!el || toastTimer || toastTetap || !el.classList.contains("is-open")) return;
  el.classList.remove("is-jeda");
  // Sesudah jeda selalu tersisa waktu baca yang wajar
  jalankanWaktuToast(Math.max(2000, toastSisa));
}

function showToast(msg, type, opsi) {
  const o = opsi || {};
  type = TOAST_ALIAS[type] || type;
  type = TOAST_IKON[type] ? type : "info";
  msg = String(msg == null ? "" : msg);
  const el = $("#appToast");
  if (!el) return;

  const migrasi = RE_TOAST_MIGRASI.test(msg);
  const judul = o.judul || (migrasi ? tt("Database perlu diperbarui", "Database update needed") : toastJudulBawaan(type));
  toastTetap = !!o.tetap || migrasi;
  const kunci = type + "|" + judul + "|" + msg;
  const sama = el.classList.contains("is-open") && kunci === toastTerakhir;
  toastTerakhir = kunci;

  // Pembaca layar: galat langsung disela, lainnya menunggu jeda bicara
  const suara = $("#toastSuara");
  if (suara && !sama) {
    suara.setAttribute("aria-live", type === "danger" ? "assertive" : "polite");
    suara.textContent = "";
    setTimeout(() => (suara.textContent = judul + ". " + msg), 60);
  }

  // Lamanya: pesan panjang lebih lama dibaca; galat ditambah 2 detik
  const lama = Math.min(type === "danger" ? 12000 : 9000, Math.max(3200, msg.length * 55 + (type === "danger" ? 2000 : 0)));
  el.style.setProperty("--toast-lama", lama + "ms");
  el.classList.toggle("is-tetap", toastTetap);
  el.classList.remove("is-jeda");
  /* Garis waktu dimulai lagi dari penuh: dua nama animasi bergantian
     (lihat .app-toast-waktu), tanpa memaksa tata letak dihitung ulang. */
  el.dataset.putaran = el.dataset.putaran === "a" ? "b" : "a";

  el.classList.remove("app-toast--success", "app-toast--danger", "app-toast--warning", "app-toast--info");
  el.classList.add("app-toast--" + type);
  $("#toastIcon").className = "bi " + TOAST_IKON[type];
  const judulEl = $("#toastJudul");
  if (judulEl) judulEl.textContent = judul;
  $("#toastMsg").textContent = msg;

  /* Pesan yang sama selagi masih tampil: tidak dimunculkan ulang (tidak
     berkedip), waktunya saja yang dimulai lagi. Selain itu dua putaran
     gambar dipisah supaya transisinya benar-benar berjalan saat toast
     dimunculkan berturut-turut. */
  if (!sama) {
    el.classList.remove("is-open");
    requestAnimationFrame(() => el.classList.add("is-open"));
  }
  jalankanWaktuToast(lama);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  toastTetap = false;
  const el = $("#appToast");
  if (!el) return;
  el.classList.remove("is-open", "is-jeda");
  /* Fokus di tombol tutup tidak boleh tertinggal di toast yang sudah
     tersembunyi: kembali ke tempat asalnya sebelum Tab masuk ke sini. */
  if (el.contains(document.activeElement)) {
    const asal = toastFokusAsal;
    if (asal && asal.isConnected && typeof asal.focus === "function") asal.focus({ preventScroll: true });
    else document.activeElement.blur();
  }
  toastFokusAsal = null;
}
let toastFokusAsal = null;

const toastCloseEl = document.getElementById("toastClose");
if (toastCloseEl) {
  toastCloseEl.addEventListener("click", hideToast);
  toastCloseEl.addEventListener("focus", (e) => {
    toastFokusAsal = e.relatedTarget && !$("#appToast").contains(e.relatedTarget) ? e.relatedTarget : toastFokusAsal;
    jedaToast();
  });
  toastCloseEl.addEventListener("blur", lanjutkanToast);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) jedaToast();
  else if (document.activeElement !== toastCloseEl) lanjutkanToast();
});

let confirmCallback = null;
let confirmBatalCallback = null;
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
  if (btnBatal) {
    btnBatal.textContent = o.cancelText || t("a.batal");
    /* PEMBERITAHUAN (tanpaBatal): satu tombol saja -- tidak ada yang
       bisa dibatalkan, jadi tombol Batal di sebelahnya cuma membingungkan.
       Dipulihkan lagi pada panggilan berikutnya yang tidak memintanya. */
    btnBatal.classList.toggle("d-none", !!o.tanpaBatal);
  }
  /* tone "warning": peringatan yang bukan tindakan merusak -- tombolnya
     navy (bukan merah "hapus"), ikonnya kuning. */
  const navy = o.tone === "primary" || o.tone === "warning";
  btn.className = "btn " + (navy ? "btn-primary-navy" : "btn-danger");

  $("#confirmTitle").textContent = o.title || (o.tone === "primary" ? t("a.konfirmasi") : tt("Hapus Data", "Delete Data"));

  const ikon = $("#confirmIcon");
  ikon.className = "bi " + (o.icon || "bi-exclamation-triangle-fill");
  const kotak = ikon.parentElement;
  kotak.classList.toggle("is-power", o.icon === "bi-power");
  const warna = {
    primary: ["var(--p-50)", "var(--p-600)"],
    warning: ["var(--s-warn-bg)", "var(--s-warn)"],
  }[o.tone] || ["var(--s-danger-bg)", "var(--s-danger)"];
  kotak.style.background = warna[0];
  kotak.style.color = warna[1];

  confirmCallback = onConfirm;
  /* onCancel: tombol kiri sebagai PILIHAN kedua (mis. "Ganti Isi Form"),
     bukan sekadar batal. Menutup lewat X / klik di luar tidak memanggilnya. */
  confirmBatalCallback = typeof o.onCancel === "function" ? o.onCancel : null;
  /* TOMBOL YANG MENUNGGU ENTER. Konfirmasi biasa (navy) dan pemberitahuan
     satu tombol: tombol utamanya -- Enter langsung melanjutkan. Hapus
     (merah) dan peringatan (kuning): tombol Batal -- Enter yang
     tertekan tanpa sengaja tidak boleh menghapus atau menyimpan nomor
     ganda. */
  const aman = !o.tanpaBatal && (o.tone === "warning" || !navy) && btnBatal;
  confirmFokusAwal = aman ? btnBatal : btn;
  confirmModal.show();
}
let confirmFokusAwal = null;
confirmModalEl.addEventListener("shown.bs.modal", () => {
  if (confirmFokusAwal) confirmFokusAwal.focus();
  confirmFokusAwal = null;
});
$("#confirmActionBtn").addEventListener("click", () => {
  confirmModal.hide();
  confirmBatalCallback = null;
  if (typeof confirmCallback === "function") confirmCallback();
  confirmCallback = null;
});
if ($("#confirmCancelBtn")) {
  $("#confirmCancelBtn").addEventListener("click", () => {
    const cb = confirmBatalCallback;
    confirmBatalCallback = null;
    confirmCallback = null;
    if (typeof cb === "function") cb();
  });
}


/* ------------------------------------------------------------------
   KOTAK ISIAN

   Pengganti prompt() bawaan peramban: tampilannya berbeda-beda, tidak
   bisa ditata, tidak bisa memuat lebih dari satu isian, dan di
   sebagian peramban bisa diblokir pengguna tanpa pemberitahuan.

   fields: [{ key, label, type, value, placeholder, hint, lebar, min, max }]
   onSubmit(nilai) -> kembalikan string pesan galat untuk menahan, atau
   apa pun yang bukan string untuk menutup. Boleh juga JANJI (mis.
   mengunggah lampiran dulu): selama ditunggu tombolnya terkunci &
   berputar, kotaknya tidak bisa ditutup; hasilnya dibaca dengan aturan
   yang sama.

   type: "select" (dengan options), "password", "textarea" (teks panjang
   -- Enter di dalamnya membuat baris baru, bukan menyimpan), "checks"
   (beberapa kotak centang dari options; nilainya daftar value yang
   dicentang), "berkas" (lampiran, js/data/lampiran.js -- nilainya dari
   `pengelola`), atau jenis <input> lain ("date", ...). Bawaannya
   "text". Angka TIDAK memakai
   jenis isian angka bawaan peramban (roda gulir mengubah nilainya
   diam-diam, tombol panahnya sempit, dan pemisah ribuan tidak bisa
   ditampilkan): pakai inputmode "numeric"/"decimal" dengan filter
   formatNumberTyping.

   lebar: "setengah" -> dua isian per baris. Dipakai kotak yang isiannya
   banyak (baris Masterlist): ditumpuk satu-satu kotaknya lebih
   tinggi dari layar laptop dan tombol Simpan baru terlihat setelah
   menggulir. Kotaknya ikut melebar sedikit supaya tiap isian tetap lega.

   aksiKiri: { label, icon, onClick } -> tombol ketiga di kiri bawah
   (mis. "Batalkan tahap" di kotak tahap dokumen). Menekannya menutup
   kotak ini lalu memanggil onClick.
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
  /* Lebar dua kolom ditentukan ulang tiap kali kotak dibuka. Hanya
     showPrompt() yang mengisi kotak ini, jadi tidak ada lebar yang
     perlu dilepas saat ditutup. */
  const LEBAR_ISIAN = { setengah: " prompt-field--half", sepertiga: " prompt-field--third" };
  const duaKolom = fields.some((f) => LEBAR_ISIAN[f.lebar]);
  promptModalEl.querySelector(".modal-dialog").classList.toggle("prompt-dialog--lebar", duaKolom);
  // Isian berkelompok (centang, lampiran) dilabeli lewat aria-labelledby, bukan <label for>
  const berkelompok = (f) => f.type === "checks" || f.type === "berkas";
  $("#promptFields").innerHTML = fields
    .map(
      (f) => `
      <div class="prompt-field${LEBAR_ISIAN[f.lebar] || ""}">
      ${
        berkelompok(f)
          ? `<span class="prompt-label" id="prompt_${f.key}_label">${escapeHtml(f.label)}</span>`
          : `<label class="prompt-label" for="prompt_${f.key}">${escapeHtml(f.label)}</label>`
      }
      ${
        f.type === "checks"
          ? `<div class="prompt-checks" id="prompt_${f.key}" role="group" aria-labelledby="prompt_${f.key}_label">${(f.options || [])
              .map(
                (o) => `<label class="prompt-check"><input type="checkbox" value="${escapeAttr(o.value)}"${(f.value || []).indexOf(o.value) >= 0 ? " checked" : ""}>
                  <span><b>${escapeHtml(o.label)}</b>${o.hint ? `<small>${escapeHtml(o.hint)}</small>` : ""}</span></label>`,
              )
              .join("")}</div>`
          : f.type === "berkas"
          ? isianBerkasHtml("prompt_" + f.key).replace('class="prompt-berkas"', `class="prompt-berkas" role="group" aria-labelledby="prompt_${f.key}_label"`)
          : f.type === "select"
          ? `<select class="login-input" id="prompt_${f.key}">${(f.options || [])
              .map(
                (o) =>
                  `<option value="${escapeAttr(o.value)}"${o.value === f.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
              )
              .join("")}</select>`
          : f.type === "textarea"
          ? `<textarea class="login-input prompt-textarea" id="prompt_${f.key}" rows="${f.rows || 3}"
               placeholder="${escapeAttr(f.placeholder || "")}">${escapeHtml(f.value || "")}</textarea>`
          : f.type === "password"
          ? `<div class="pwd-wrap">
               <input class="login-input" id="prompt_${f.key}" type="password"
                 placeholder="${escapeAttr(f.placeholder || "")}" value="${escapeAttr(f.value || "")}" />
               <button type="button" class="pwd-eye" data-pwd-toggle="prompt_${f.key}"><i class="bi bi-eye"></i></button>
             </div>`
          : `<input class="login-input" id="prompt_${f.key}" type="${f.type || "text"}"
               placeholder="${escapeAttr(f.placeholder || "")}" value="${escapeAttr(f.value || "")}"
               ${f.inputmode ? `inputmode="${escapeAttr(f.inputmode)}"` : ""}
               ${f.min != null ? `min="${escapeAttr(f.min)}"` : ""} ${f.max != null ? `max="${escapeAttr(f.max)}"` : ""} />`
      }
      ${f.hint ? `<div class="prompt-hint">${escapeHtml(f.hint)}</div>` : ""}
      </div>`,
    )
    .join("");

  // Lampiran: pengelolanya memasang daftar & pemilih berkasnya sendiri
  fields.forEach((f) => {
    if (f.type === "berkas" && f.pengelola) f.pengelola.pasang($("#prompt_" + f.key));
  });

  const kiri = $("#promptAksiKiri");
  if (kiri) {
    kiri.classList.toggle("d-none", !o.aksiKiri);
    kiri.innerHTML = o.aksiKiri ? `<i class="bi ${o.aksiKiri.icon || "bi-arrow-counterclockwise"}"></i> ${escapeHtml(o.aksiKiri.label)}` : "";
    promptAksiKiri = o.aksiKiri && typeof o.aksiKiri.onClick === "function" ? o.aksiKiri.onClick : null;
  }

  /* Tombol Enter papan ketik ponsel: "Berikutnya" sampai isian
     terakhir, "Selesai" di isian terakhir (lihat Enter di bawah). */
  const isianTeks = [...$("#promptFields").querySelectorAll('input:not([type="checkbox"]):not([type="file"]), select')];
  isianTeks.forEach((el, i) => el.setAttribute("enterkeyhint", i < isianTeks.length - 1 ? "next" : "done"));

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

  const bacaIsian = (f) => {
    const el = $("#prompt_" + f.key);
    if (f.type === "checks") return el ? [...el.querySelectorAll("input:checked")].map((c) => c.value) : [];
    if (f.type === "berkas") return f.pengelola ? f.pengelola.nilai() : { lama: [], baru: [], dilepas: [] };
    return el ? el.value : "";
  };
  const selesai = (galat) => {
    if (typeof galat === "string" && galat) {
      const box = $("#promptError");
      box.textContent = galat;
      box.classList.remove("d-none");
      return;
    }
    promptModal.hide();
  };
  promptSubmit = () => {
    if (promptSibuk) return;
    const nilai = {};
    fields.forEach((f) => (nilai[f.key] = bacaIsian(f)));
    const hasil = o.onSubmit ? o.onSubmit(nilai) : null;
    if (hasil && typeof hasil.then === "function") {
      $("#promptError").classList.add("d-none");
      aturPromptSibuk(true, o.busyText || tt("Menyimpan…", "Saving…"));
      hasil.then(
        (galat) => {
          aturPromptSibuk(false);
          selesai(galat);
        },
        (err) => {
          console.error(err);
          aturPromptSibuk(false);
          selesai(tt("Gagal menyimpan. Coba lagi.", "Failed to save. Please try again."));
        },
      );
      return;
    }
    selesai(hasil);
  };

  /* Kursor langsung di isian pertama yang perlu diisi (yang KOSONG --
     No. urut atau satuan bawaan dilewati). Dipasang saat "shown":
     Bootstrap memindahkan fokus ke kotaknya sendiri di akhir animasi,
     jadi fokus yang dipasang lebih awal tertimpa. Kalau kotaknya sudah
     terbuka (isian diganti di tempat), tidak ada "shown" -- langsung. */
  promptFokusAwal = () => {
    promptFokusAwal = null;
    const aktif = document.activeElement;
    if (!aktif || !promptModalEl.contains(aktif) || !aktif.matches(ISIAN_KETIK))
      fokusIsianPertama($("#promptFields"));
  };
  const sudahTerbuka = promptModalEl.classList.contains("show");
  promptModal.show();
  if (sudahTerbuka) promptFokusAwal();
}
let promptFokusAwal = null;
let promptAksiKiri = null;

/* SELAMA JANJI onSubmit DITUNGGU: tombol Simpan berputar, seluruh
   tombol lain terkunci, dan kotaknya tidak bisa ditutup -- menutupnya
   di tengah unggahan membuat hasilnya tidak terlihat siapa pun. */
let promptSibuk = false;
function aturPromptSibuk(sibuk, teks) {
  promptSibuk = sibuk;
  const ok = $("#promptOk");
  if (sibuk) {
    ok.dataset.teks = ok.textContent;
    ok.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${escapeHtml(teks || "")}`;
  } else if (ok.dataset.teks != null) {
    ok.textContent = ok.dataset.teks;
    delete ok.dataset.teks;
  }
  promptModalEl.querySelectorAll("button, input, select, textarea").forEach((el) => (el.disabled = sibuk));
}

if (promptModalEl) {
  promptModalEl.addEventListener("shown.bs.modal", () => promptFokusAwal && promptFokusAwal());
  promptModalEl.addEventListener("hide.bs.modal", (e) => {
    if (promptSibuk) e.preventDefault();
  });
  $("#promptOk").addEventListener("click", () => promptSubmit && promptSubmit());
  const tombolKiri = $("#promptAksiKiri");
  if (tombolKiri) {
    tombolKiri.addEventListener("click", () => {
      const fn = promptAksiKiri;
      if (!fn || promptSibuk) return;
      promptModal.hide();
      fn();
    });
  }
  /* ENTER: ke isian berikutnya; di isian terakhir -> Simpan. Kotak
     satu isian tetap tersimpan dengan sekali Enter, kotak banyak isian
     tidak lagi tersimpan setengah jadi karena Enter di isian pertama. */
  promptModalEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !promptSubmit || e.isComposing) return;
    // Di kotak teks panjang, Enter adalah baris baru
    if (e.target && e.target.tagName === "TEXTAREA") return;
    /* Tombol & kotak centang menjalankan dirinya sendiri: Enter di
       tombol lepas lampiran melepas lampiran itu, bukan menyimpan --
       dan Enter di tombol Batal membatalkan. */
    if (e.target && e.target.closest && e.target.closest('button, a, input[type="checkbox"], .prompt-berkas')) return;
    e.preventDefault();
    const isian = e.target && e.target.matches && e.target.matches(ISIAN_KETIK) ? e.target : null;
    const berikut = isian && !e.ctrlKey && !e.metaKey ? isianBerikutnya(isian, $("#promptFields")) : null;
    if (berikut) fokuskan(berikut, { pilihIsi: true });
    else promptSubmit();
  });
}

/* POP-UP BERTUMPUK. Bootstrap tidak mengatur kotak yang dibuka di atas
   kotak lain -- mis. "Tambah vendor baru" atau penolakan tagihan ganda
   dari dalam pop-up Ubah Isian. Keduanya ber-z-index 1055 dan latar
   keduanya 1050: kotak di bawah tidak ikut diredupkan dan terbaca
   setara dengan kotak yang sedang menunggu jawaban. Kotak berikutnya
   dinaikkan 20 tingkat per kotak yang masih terbuka, latarnya tepat di
   bawahnya (latar ditambahkan Bootstrap sesudah event ini, jadi
   ditunggu satu microtask). */
document.addEventListener("show.bs.modal", (e) => {
  const kotak = e.target;
  const terbuka = [...document.querySelectorAll(".modal.show")].filter((m) => m !== kotak).length;
  if (!terbuka) {
    kotak.style.zIndex = "";
    return;
  }
  const z = 1055 + 20 * terbuka;
  kotak.style.zIndex = String(z);
  Promise.resolve().then(() => {
    const latar = document.querySelectorAll(".modal-backdrop");
    if (latar.length) latar[latar.length - 1].style.zIndex = String(z - 5);
  });
});
document.addEventListener("hidden.bs.modal", (e) => {
  e.target.style.zIndex = "";
});

/* TAB BERPUTAR DI DALAM POP-UP. Perangkap fokus Bootstrap hanya
   menangkap fokus yang MASUK ke elemen halaman di luar pop-up; pop-up
   letaknya di ujung <body>, jadi Tab dari tombol terakhirnya lolos ke
   bilah alamat peramban -- dan Esc tidak lagi menutup apa pun. Di sini
   Tab di tombol terakhir kembali ke yang pertama (tombol X), Shift+Tab
   di yang pertama ke yang terakhir. Yang tersembunyi dilewati. */
const SEL_BISA_FOKUS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const aktif = document.activeElement;
  const kotak = aktif && aktif.closest && aktif.closest(".modal.show");
  if (!kotak) return;
  const bisa = [...kotak.querySelectorAll(SEL_BISA_FOKUS)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  if (!bisa.length) return;
  const pertama = bisa[0];
  const terakhir = bisa[bisa.length - 1];
  if (!e.shiftKey && aktif === terakhir) {
    e.preventDefault();
    pertama.focus();
  } else if (e.shiftKey && (aktif === pertama || aktif === kotak)) {
    e.preventDefault();
    terakhir.focus();
  }
});
