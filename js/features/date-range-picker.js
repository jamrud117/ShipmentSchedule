"use strict";

/* PEMILIH RENTANG TANGGAL — kalender dua bulan dengan pratinjau &
   tombol Terapkan/Reset, menggantikan tampilan dua <input type="date">
   polos.

   #filterDateFrom / #filterDateTo TETAP ada di DOM (disembunyikan
   lewat CSS, .d-none) dan TETAP satu-satunya sumber kebenaran yang
   dibaca getFiltered()/dateRangeBasisValue()/dateRangeSummaryBit() di
   render/list.js -- widget ini cuma lapisan tampilan di atasnya.
   Artinya jumpToDateFilter() (dipanggil dari agenda 7 hari di halaman
   Ringkasan) dan tombol Hari Ini/Minggu Ini/Minggu Depan tidak perlu
   tahu widget ini ada sama sekali; mereka menulis ke dua input itu
   seperti biasa, lalu event "change" bawaannya yang dipakai di sini
   untuk menyegarkan teks di tombol pemicu. */

/* Nama bulan & hari MENGIKUTI BAHASA TAMPILAN, jadi dipilih saat
   dipakai -- bukan tabel tetap yang dibaca sekali saat dimuat. */
const DRP_NAMA = {
  id: {
    pendek: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    panjang: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
    hari: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
  },
  en: {
    pendek: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    panjang: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    hari: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
};
const drpNama = () => DRP_NAMA[activeLang === "en" ? "en" : "id"];
const bulanPendek = (i) => drpNama().pendek[i];
const bulanPanjang = (i) => drpNama().panjang[((i % 12) + 12) % 12];

function drpFmtDisplay(iso) {
  const dt = parseLocalDate(iso);
  if (!dt) return "";
  return `${String(dt.getDate()).padStart(2, "0")} ${bulanPendek(dt.getMonth())} ${dt.getFullYear()}`;
}

function drpIsoOf(year, month, day) {
  // month boleh di luar 0-11 -- Date menormalkannya sendiri (mis. bulan 12 -> Januari tahun depan)
  const dt = new Date(year, month, day);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/* Kotak-kotak satu bulan, SELALU dari Senin, dengan tanggal bulan
   sebelum/sesudahnya sebagai pengisi (abu-abu, tetap bisa diklik --
   requirement umum date-range picker: memilih akhir Juni sampai awal
   Juli tanpa harus pindah bulan dulu). */
function drpBuildMonthCells(year, month) {
  const pertama = new Date(year, month, 1);
  // getDay(): 0=Minggu..6=Sabtu -> digeser supaya 0=Senin..6=Minggu
  const mulaiKosong = (pertama.getDay() + 6) % 7;
  const jumlahHari = new Date(year, month + 1, 0).getDate();
  const totalSel = Math.ceil((mulaiKosong + jumlahHari) / 7) * 7;

  const sel = [];
  for (let i = 0; i < totalSel; i++) {
    const hariKe = i - mulaiKosong + 1;
    sel.push({
      iso: drpIsoOf(year, month, hariKe),
      label: new Date(year, month, hariKe).getDate(),
      diLuarBulan: hariKe < 1 || hariKe > jumlahHari,
    });
  }
  return sel;
}

let drpViewYear = 0;
let drpViewMonth = 0; // bulan PERTAMA dari dua yang ditampilkan (0-11)
let drpTempFrom = "";
let drpTempTo = "";

/* Penanda sebuah hari terhadap rentang yang sedang dipilih: ujung
   (awal/akhir) atau di antaranya. Satu-satunya tempat aturan ini ada --
   dipakai menggambar kotak-kotak (drpMonthGridHtml) dan mewarnai ulang
   yang sudah tergambar (drpWarnaiUlang). */
function drpKelasHari(iso, dari, sampai) {
  if (iso === dari || iso === sampai) return "drp-day--endpoint";
  if (dari && sampai) {
    const min = dari < sampai ? dari : sampai;
    const maks = dari < sampai ? sampai : dari;
    if (iso > min && iso < maks) return "drp-day--inrange";
  }
  return "";
}

/* `dari`/`sampai` bawaannya status pemilih di halaman Jadwal; pemilih
   lain (lihat buatRentangTanggal() di bawah) mengirim rentangnya
   sendiri, jadi kotak-kotak ini tidak perlu tahu milik siapa. */
function drpMonthGridHtml(year, month, dari = drpTempFrom, sampai = drpTempTo) {
  const sel = drpBuildMonthCells(year, month);
  const baris = [];
  for (let i = 0; i < sel.length; i += 7) baris.push(sel.slice(i, i + 7));

  const kepala = drpNama().hari.map((h) => `<div class="drp-dow">${h}</div>`).join("");
  const badan = baris
    .map(
      (mgg) =>
        `<div class="drp-week">${mgg
          .map((c) => {
            const kelas = ["drp-day"];
            if (c.diLuarBulan) kelas.push("drp-day--muted");
            const tanda = drpKelasHari(c.iso, dari, sampai);
            if (tanda) kelas.push(tanda);
            return `<button type="button" class="${kelas.join(" ")}" data-drp-day="${c.iso}">${c.label}</button>`;
          })
          .join("")}</div>`,
    )
    .join("");
  return `<div class="drp-dow-row">${kepala}</div>${badan}`;
}

/* Mewarnai ulang kotak-kotak hari yang SUDAH tergambar, tanpa
   menggantinya. Dipakai saat tanggalnya diketik di kotak Dari/Sampai:
   mengganti tombol hari pada saat itu bisa membuang tombol yang sedang
   ditekan pengguna (ketikan selesai karena fokus pindah ke tombol itu),
   sehingga kliknya tidak pernah sampai. */
function drpWarnaiUlang(grid, dari, sampai) {
  if (!grid) return;
  grid.querySelectorAll("[data-drp-day]").forEach((btn) => {
    btn.classList.remove("drp-day--endpoint", "drp-day--inrange");
    const tanda = drpKelasHari(btn.dataset.drpDay, dari, sampai);
    if (tanda) btn.classList.add(tanda);
  });
}

/* Bulan `iso` sudah terlihat di kalender? Selisihnya dalam bulan dari
   bulan pertama yang tampil; bulan kedua dihitung hanya bila memang
   ditampilkan (di layar sempit disembunyikan lewat CSS). */
function drpTerlihat(iso, tahunLihat, bulanLihat, duaBulan) {
  const dt = parseLocalDate(iso);
  if (!dt) return true;
  const selisih = (dt.getFullYear() - tahunLihat) * 12 + dt.getMonth() - bulanLihat;
  return selisih === 0 || (duaBulan && selisih === 1);
}
const drpTampilDuaBulan = (grid) => !!grid && getComputedStyle(grid).display !== "none";

function drpRenderCalendars() {
  $("#drpMonthLabel0").textContent = `${bulanPanjang(drpViewMonth)} ${drpViewYear + Math.floor(drpViewMonth / 12)}`;
  const m1 = drpViewMonth + 1;
  $("#drpMonthLabel1").textContent = `${bulanPanjang(m1)} ${drpViewYear + Math.floor(m1 / 12)}`;
  $("#drpGrid0").innerHTML = drpMonthGridHtml(drpViewYear, drpViewMonth);
  $("#drpGrid1").innerHTML = drpMonthGridHtml(drpViewYear, drpViewMonth + 1);
  drpSyncTriggerPreview();
  drpSyncKotak();
}

/* Kotak ketik Dari/Sampai mengikuti rentang sementara kalender. Menulis
   `.value` tidak menembakkan peristiwa (sama seperti kotak bawaan),
   jadi tidak berputar balik ke drpKotakBerubah(). */
function drpSyncKotak() {
  const dari = $("#drpInputFrom");
  const sampai = $("#drpInputTo");
  if (dari) dari.value = drpTempFrom || "";
  if (sampai) sampai.value = drpTempTo || "";
}

function drpSyncTriggerPreview() {
  const teks = $("#dateRangeTriggerText");
  if (!teks) return;
  if (drpTempFrom && drpTempTo) {
    const a = drpTempFrom < drpTempTo ? drpTempFrom : drpTempTo;
    const b = drpTempFrom < drpTempTo ? drpTempTo : drpTempFrom;
    teks.textContent = `${drpFmtDisplay(a)}  –  ${drpFmtDisplay(b)}`;
  } else if (drpTempFrom) {
    teks.textContent = `${drpFmtDisplay(drpTempFrom)}  –  …`;
  } else {
    teks.textContent = tt("Pilih Rentang Tanggal", "Choose Date Range");
  }
}

/* Mesin pemilihan: klik pertama = mulai (belum ada akhir, digambar
   sebagai satu titik). Klik kedua = akhir, DIURUTKAN otomatis (klik
   tanggal yang lebih awal duluan tidak masalah). Klik berikutnya
   sesudah pasangan lengkap MULAI LAGI dari nol -- sama seperti pola
   umum date-range picker, supaya tidak perlu tombol "ulangi" sendiri. */
function drpHandleDayClick(iso) {
  if (!drpTempFrom || (drpTempFrom && drpTempTo)) {
    drpTempFrom = iso;
    drpTempTo = "";
  } else if (iso < drpTempFrom) {
    drpTempTo = drpTempFrom;
    drpTempFrom = iso;
  } else {
    drpTempTo = iso;
  }
  drpRenderCalendars();
}

function drpOpen() {
  const dari = $("#filterDateFrom").value;
  const sampai = $("#filterDateTo").value;
  drpTempFrom = dari || "";
  drpTempTo = sampai || "";
  const acuan = parseLocalDate(dari) || new Date();
  drpViewYear = acuan.getFullYear();
  drpViewMonth = acuan.getMonth();
  drpRenderCalendars();
  $("#dateRangePopover").classList.remove("d-none");
  $("#dateRangeTrigger").setAttribute("aria-expanded", "true");
  $("#dateRangeTrigger").classList.add("is-open");
}
function drpClose() {
  $("#dateRangePopover").classList.add("d-none");
  $("#dateRangeTrigger").setAttribute("aria-expanded", "false");
  $("#dateRangeTrigger").classList.remove("is-open");
  /* Ditutup tanpa Terapkan (Esc, klik di luar): teks pemicu kembali ke
     saringan yang BERLAKU, bukan sisa pratinjau pilihan yang dibatalkan
     (drpSyncTriggerPreview menulisnya selama memilih). */
  drpSyncTriggerFromFilter();
}
function drpIsOpen() {
  return !$("#dateRangePopover").classList.contains("d-none");
}

function drpApply() {
  /* Baru satu tanggal (diklik, atau hanya salah satu kotak ketik yang
     terisi) -> rentang sehari: dari = sampai. */
  const awal = drpTempFrom || drpTempTo;
  const akhir = drpTempTo || drpTempFrom;
  const a = awal && akhir && awal > akhir ? akhir : awal;
  const b = awal && akhir && awal > akhir ? awal : akhir;
  $("#filterDateFrom").value = a || "";
  $("#filterDateTo").value = b || "";
  $("#filterDateFrom").dispatchEvent(new Event("change"));
  drpClose();
}
function drpReset() {
  $("#filterDateFrom").value = "";
  $("#filterDateTo").value = "";
  $("#filterDateFrom").dispatchEvent(new Event("change"));
  drpClose();
}

/* Teks tombol pemicu disegarkan dari #filterDateFrom/To, BUKAN dari
   drpTempFrom/To -- supaya benar juga saat diubah dari luar widget ini
   (tombol Hari Ini/Minggu Ini/Minggu Depan, jumpToDateFilter() dari
   Ringkasan, atau resetAllFilters()), bukan cuma lewat kalender ini
   sendiri. */
function drpSyncTriggerFromFilter() {
  const teks = $("#dateRangeTriggerText");
  if (!teks) return;
  const dari = $("#filterDateFrom").value;
  const sampai = $("#filterDateTo").value;
  if (dari && sampai) {
    teks.textContent = `${drpFmtDisplay(dari)}  –  ${drpFmtDisplay(sampai)}`;
  } else {
    teks.textContent = tt("Pilih Rentang Tanggal", "Choose Date Range");
  }
  $("#dateRangeTrigger").classList.toggle("has-value", !!(dari && sampai));
  $("#btnClearDateRange").classList.toggle("d-none", !(dari || sampai));
}

const drpTrigger = $("#dateRangeTrigger");
if (drpTrigger) {
  drpTrigger.addEventListener("click", () => {
    if (drpIsOpen()) drpClose();
    else drpOpen();
  });
}
const drpGrids = $("#drpGrids");
if (drpGrids) {
  drpGrids.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-drp-day]");
    if (!btn) return;
    /* KRUSIAL: drpHandleDayClick() di bawah memanggil drpRenderCalendars(),
       yang mengganti innerHTML kedua grid -- termasuk MENGHANCURKAN
       tombol yang baru saja diklik ini. Kalau klik dibiarkan lanjut
       menggelembung ke document, listener "klik di luar menutup panel"
       di bawah memeriksa wrap.contains(e.target) -- dan karena
       e.target sudah lepas dari dokumen sama sekali (bukan cuma di
       luar wrap), pemeriksaan itu SELALU salah, jadi panelnya menutup
       sendiri setiap kali satu tanggal diklik. stopPropagation()
       menghentikan klik ini sebelum sampai ke listener itu. */
    e.stopPropagation();
    drpHandleDayClick(btn.dataset.drpDay);
  });
}
const drpPrev = $("#drpNavPrev");
if (drpPrev) drpPrev.addEventListener("click", (e) => { e.stopPropagation(); drpViewMonth--; drpRenderCalendars(); });
const drpNext = $("#drpNavNext");
if (drpNext) drpNext.addEventListener("click", (e) => { e.stopPropagation(); drpViewMonth++; drpRenderCalendars(); });
/* KOTAK KETIK DARI / SAMPAI. Tanggal rentang bisa diketik langsung
   (format apa pun -- dirapikan js/ui/date-input.js), selain diklik di
   kalender. Yang sampai ke sini hanya `change` yang sudah rapi, yaitu
   saat kotaknya ditinggalkan atau Enter. Urutannya diluruskan seperti
   klik di kalender: tanggal akhir yang mendahului awal ditukar. */
function drpKotakBerubah(e) {
  const dari = $("#drpInputFrom").value;
  const sampai = $("#drpInputTo").value;
  const diketik = e.target.value; // "" = baru dikosongkan
  [drpTempFrom, drpTempTo] = dari && sampai && dari > sampai ? [sampai, dari] : [dari, sampai];
  if (diketik && !drpTerlihat(diketik, drpViewYear, drpViewMonth, drpTampilDuaBulan($("#drpGrid1")))) {
    // Bulannya belum terlihat: kalender pindah ke sana (digambar ulang).
    const dt = parseLocalDate(diketik);
    drpViewYear = dt.getFullYear();
    drpViewMonth = dt.getMonth();
    drpRenderCalendars();
    return;
  }
  drpWarnaiUlang($("#drpGrid0"), drpTempFrom, drpTempTo);
  drpWarnaiUlang($("#drpGrid1"), drpTempFrom, drpTempTo);
  drpSyncTriggerPreview();
  drpSyncKotak();
}
/* Enter di "Dari" pindah ke "Sampai"; Enter di "Sampai" menerapkan
   (rapi-rapinya sudah selesai: pendengar Enter milik date-input.js
   jalan lebih dulu, di fase tangkap `document`). */
function drpKotakTombol(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (e.target.id === "drpInputFrom") $("#drpInputTo").focus();
  else drpApply();
}
["drpInputFrom", "drpInputTo"].forEach((id) => {
  const el = $("#" + id);
  if (!el) return;
  el.addEventListener("change", drpKotakBerubah);
  el.addEventListener("keydown", drpKotakTombol);
});
const drpApplyBtn = $("#drpApply");
if (drpApplyBtn) drpApplyBtn.addEventListener("click", drpApply);
const drpResetBtn = $("#drpReset");
if (drpResetBtn) drpResetBtn.addEventListener("click", drpReset);

// Klik di luar popover menutupnya -- pola baku semua dropdown lain di app ini.
document.addEventListener("click", (e) => {
  const wrap = $("#dateRangePicker");
  if (!wrap || !drpIsOpen()) return;
  if (!wrap.contains(e.target)) drpClose();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drpIsOpen()) drpClose();
});

["filterDateFrom", "filterDateTo"].forEach((id) => {
  const el = $("#" + id);
  if (el) el.addEventListener("change", drpSyncTriggerFromFilter);
});
drpSyncTriggerFromFilter();

/* ------------------------------------------------------------------
   PEMILIH RENTANG YANG BISA DIPASANG DI MANA SAJA

   Pemilih di atas terikat ke halaman Jadwal: ID-nya tetap, statusnya
   global, dan sumber kebenarannya #filterDateFrom/To. Untuk tempat
   lain (Ringkasan per Vendor di Pengajuan Dana) dibuat INSTANS
   sendiri lewat fungsi ini -- statusnya milik instans itu, dan
   kotak-kotak kalendernya memakai drpMonthGridHtml() yang sama,
   jadi tampilan & cara memilihnya identik dengan yang sudah dikenal.

   Tombol jalan pintas ditentukan pemanggil (`opsi.pintas`), karena
   yang berguna berbeda per tempat: di jadwal \"Minggu Depan\", di
   ringkasan biaya \"Bulan Ini\" / \"Bulan Lalu\".
------------------------------------------------------------------ */
function drpAwalMinggu(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // mundur ke Senin
  return x;
}
const drpIso = (d) => drpIsoOf(d.getFullYear(), d.getMonth(), d.getDate());

/* Rentang siap pakai. Dihitung SAAT diklik, bukan saat halaman dimuat:
   halaman yang dibiarkan terbuka melewati tengah malam tetap
   menghasilkan \"hari ini\" yang benar. */
const RENTANG_PINTAS = {
  hariIni: () => { const kini = new Date(); return [drpIso(kini), drpIso(kini)]; },
  mingguIni: () => {
    const a = drpAwalMinggu(new Date());
    const b = new Date(a); b.setDate(a.getDate() + 6);
    return [drpIso(a), drpIso(b)];
  },
  bulanIni: () => {
    const kini = new Date();
    return [drpIsoOf(kini.getFullYear(), kini.getMonth(), 1), drpIsoOf(kini.getFullYear(), kini.getMonth() + 1, 0)];
  },
  bulanLalu: () => {
    const kini = new Date();
    return [drpIsoOf(kini.getFullYear(), kini.getMonth() - 1, 1), drpIsoOf(kini.getFullYear(), kini.getMonth(), 0)];
  },
  tahunIni: () => {
    const y = new Date().getFullYear();
    return [drpIsoOf(y, 0, 1), drpIsoOf(y, 11, 31)];
  },
};

function buatRentangTanggal(akar, opsi) {
  const o = opsi || {};
  const pintas = o.pintas || [];
  let dari = (o.awal && o.awal[0]) || "";
  let sampai = (o.awal && o.awal[1]) || "";
  let tDari = "", tSampai = "";
  let lihatTahun = 0, lihatBulan = 0;

  akar.classList.add("date-range-picker");
  akar.innerHTML = `
    <button type="button" class="date-range-trigger" aria-haspopup="true" aria-expanded="false" data-rt="pemicu">
      <span class="date-range-trigger-icon"><i class="bi bi-calendar3"></i></span>
      <span data-rt="teks"></span>
      <i class="bi bi-chevron-down date-range-trigger-caret"></i>
    </button>
    <div class="drp-popover d-none" data-rt="popover">
      ${pintas.length ? `<div class="drp-quick-row">${pintas
        .map((p, i) => `<button type="button" class="quick-date-btn" data-rt-pintas="${i}"></button>`)
        .join("")}</div>` : ""}
      <div class="drp-typed" role="group" data-rt="ketik">
        <label class="drp-typed-field"><span data-rt="labelDari"></span>
          <input type="date" class="drp-typed-input" data-rt="isiDari" data-kotak-tanggal-tanpa-ikon></label>
        <span class="drp-typed-sep" aria-hidden="true">–</span>
        <label class="drp-typed-field"><span data-rt="labelSampai"></span>
          <input type="date" class="drp-typed-input" data-rt="isiSampai" data-kotak-tanggal-tanpa-ikon></label>
      </div>
      <div class="drp-header">
        <button type="button" class="drp-nav" data-rt="mundur" aria-label="${tt("Bulan sebelumnya", "Previous month")}"><i class="bi bi-chevron-left"></i></button>
        <div class="drp-months">
          <div class="drp-month-label" data-rt="label0"></div>
          <div class="drp-month-label drp-month-label--second" data-rt="label1"></div>
        </div>
        <button type="button" class="drp-nav" data-rt="maju" aria-label="${tt("Bulan berikutnya", "Next month")}"><i class="bi bi-chevron-right"></i></button>
      </div>
      <div class="drp-grids" data-rt="grids">
        <div class="drp-grid" data-rt="grid0"></div>
        <div class="drp-grid drp-grid--second" data-rt="grid1"></div>
      </div>
      <div class="drp-footer">
        <button type="button" class="drp-reset" data-rt="reset"></button>
        <button type="button" class="drp-apply" data-rt="terapkan"></button>
      </div>
    </div>`;
  /* Pengamat DOM baru mengubah kotak <input type="date"> sesudah kode
     ini selesai; yang dibutuhkan di bawah (nilai ISO, peristiwa
     rapi-rapi) harus sudah ada sekarang. */
  if (typeof pasangSemuaKotakTanggal === "function") pasangSemuaKotakTanggal(akar);

  const q = (n) => akar.querySelector(`[data-rt="${n}"]`);
  const urut = (a, b) => (a && b && a > b ? [b, a] : [a, b]);
  const teksRentang = (a, b) =>
    a && b ? `${drpFmtDisplay(a)}  –  ${drpFmtDisplay(b)}` : a ? `${drpFmtDisplay(a)}  –  …` : tt("Pilih Rentang Tanggal", "Choose Date Range");

  /* Teks tetap di panel ini (tombol pintas, Reset, Terapkan) ditulis
     ulang TIAP kali digambar, bukan sekali saat dibuat: instans ini
     hidup selama halaman terbuka, dan bahasa bisa diganti di tengahnya.
     Label pintas boleh berupa fungsi supaya ikut bahasa yang aktif. */
  const labelPintas = (p) => (typeof p.label === "function" ? p.label() : p.label);
  function tulisTeksTetap() {
    akar.querySelectorAll("[data-rt-pintas]").forEach((btn) => {
      btn.textContent = labelPintas(pintas[+btn.dataset.rtPintas]);
    });
    q("reset").textContent = "Reset";
    q("terapkan").textContent = tt("Terapkan", "Apply");
    q("labelDari").textContent = tt("Dari", "From");
    q("labelSampai").textContent = tt("Sampai", "To");
    q("isiDari").setAttribute("aria-label", tt("Tanggal awal", "Start date"));
    q("isiSampai").setAttribute("aria-label", tt("Tanggal akhir", "End date"));
    q("mundur").setAttribute("aria-label", tt("Bulan sebelumnya", "Previous month"));
    q("maju").setAttribute("aria-label", tt("Bulan berikutnya", "Next month"));
  }
  function gambarPemicu() {
    tulisTeksTetap();
    q("teks").textContent = teksRentang(dari, sampai);
    q("pemicu").classList.toggle("has-value", !!(dari && sampai));
    // Tombol pintas yang cocok dengan rentang aktif ikut menyala.
    akar.querySelectorAll("[data-rt-pintas]").forEach((btn) => {
      const [a, b] = pintas[+btn.dataset.rtPintas].rentang();
      // .is-active -- kelas yang sama dengan tombol pintas di halaman Jadwal.
      btn.classList.toggle("is-active", a === dari && b === sampai);
    });
  }
  function gambarKalender() {
    const nama = (m) => `${bulanPanjang(m)} ${lihatTahun + Math.floor(m / 12)}`;
    q("label0").textContent = nama(lihatBulan);
    q("label1").textContent = nama(lihatBulan + 1);
    const [a, b] = urut(tDari, tSampai);
    q("grid0").innerHTML = drpMonthGridHtml(lihatTahun, lihatBulan, a, b || a);
    q("grid1").innerHTML = drpMonthGridHtml(lihatTahun, lihatBulan + 1, a, b || a);
    q("teks").textContent = teksRentang(tDari, tSampai);
    sinkronKotak();
    if (!q("popover").classList.contains("d-none")) posisikan();
  }
  // Kotak ketik Dari/Sampai mengikuti rentang sementara (tanpa menembakkan peristiwa)
  function sinkronKotak() {
    q("isiDari").value = tDari || "";
    q("isiSampai").value = tSampai || "";
  }
  const terbuka = () => !q("popover").classList.contains("d-none");

  /* PANEL MENGAMBANG, BUKAN MENEMPEL DI DALAM WADAHNYA.

     Dengan position:absolute panel ini ikut terpotong oleh wadah mana
     pun di atasnya yang ber-overflow:hidden -- di tab Summary itu kartu
     .docnum-shell (dipotong demi sudut membulatnya). Saat hasil
     saringannya kosong, isi kartunya pendek, dan separuh bawah panel --
     tempat Reset & Terapkan -- terpotong di luar kartu: tidak bisa
     diklik sama sekali. position:fixed lepas dari semua wadah itu;
     posisinya dihitung dari tombol pemicunya, dan dihitung ulang saat
     halaman digulir atau diubah ukurannya. */
  const JARAK = 8;
  function posisikan() {
    const pop = q("popover");
    const r = q("pemicu").getBoundingClientRect();
    pop.style.position = "fixed";
    pop.style.right = "auto";
    pop.style.bottom = "auto";
    const lebar = pop.offsetWidth;
    const tinggi = pop.offsetHeight;
    // Tidak menembus tepi kanan layar.
    const kiri = Math.max(JARAK, Math.min(r.left, innerWidth - lebar - JARAK));
    // Di bawah tombol kalau muat; kalau tidak dan ruang di atas lebih
    // lega, di atasnya.
    const muatBawah = r.bottom + JARAK + tinggi <= innerHeight;
    const lebihLegaAtas = r.top > innerHeight - r.bottom;
    const atas = !muatBawah && lebihLegaAtas
      ? Math.max(JARAK, r.top - JARAK - tinggi)
      : r.bottom + JARAK;
    pop.style.left = kiri + "px";
    pop.style.top = atas + "px";
  }
  const ikutiPemicu = () => { if (terbuka()) posisikan(); };

  function buka() {
    tulisTeksTetap();
    tDari = dari; tSampai = sampai;
    const acuan = parseLocalDate(dari) || new Date();
    lihatTahun = acuan.getFullYear(); lihatBulan = acuan.getMonth();
    gambarKalender();
    q("popover").classList.remove("d-none");
    posisikan();
    // capture: gulir di wadah mana pun (bukan cuma halaman) ikut dihitung.
    addEventListener("scroll", ikutiPemicu, true);
    addEventListener("resize", ikutiPemicu);
    q("pemicu").setAttribute("aria-expanded", "true");
    q("pemicu").classList.add("is-open");
  }
  function tutup() {
    q("popover").classList.add("d-none");
    removeEventListener("scroll", ikutiPemicu, true);
    removeEventListener("resize", ikutiPemicu);
    q("pemicu").setAttribute("aria-expanded", "false");
    q("pemicu").classList.remove("is-open");
    gambarPemicu();
  }
  function terapkan(a, b) {
    // Satu tanggal saja (di kotak mana pun) = rentang sehari
    [dari, sampai] = urut(a || b || "", b || a || "");
    tutup();
    if (typeof o.onApply === "function") o.onApply(dari, sampai);
  }

  q("pemicu").addEventListener("click", () => (terbuka() ? tutup() : buka()));
  q("grids").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-drp-day]");
    if (!btn) return;
    e.stopPropagation(); // lihat catatan KRUSIAL pada pemilih halaman Jadwal
    const iso = btn.dataset.drpDay;
    if (!tDari || (tDari && tSampai)) { tDari = iso; tSampai = ""; }
    else [tDari, tSampai] = urut(tDari, iso);
    gambarKalender();
  });
  q("mundur").addEventListener("click", (e) => { e.stopPropagation(); lihatBulan--; gambarKalender(); });
  q("maju").addEventListener("click", (e) => { e.stopPropagation(); lihatBulan++; gambarKalender(); });
  q("terapkan").addEventListener("click", () => terapkan(tDari, tSampai));
  /* Kotak ketik Dari/Sampai -- lihat drpKotakBerubah() di pemilih halaman
     Jadwal untuk alasan tiap langkahnya. */
  function kotakBerubah(e) {
    const a = q("isiDari").value;
    const b = q("isiSampai").value;
    const diketik = e.target.value;
    [tDari, tSampai] = urut(a, b);
    if (diketik && !drpTerlihat(diketik, lihatTahun, lihatBulan, drpTampilDuaBulan(q("grid1")))) {
      const dt = parseLocalDate(diketik);
      lihatTahun = dt.getFullYear();
      lihatBulan = dt.getMonth();
      gambarKalender();
      return;
    }
    drpWarnaiUlang(q("grid0"), tDari, tSampai);
    drpWarnaiUlang(q("grid1"), tDari, tSampai);
    q("teks").textContent = teksRentang(tDari, tSampai);
    sinkronKotak();
  }
  q("isiDari").addEventListener("change", kotakBerubah);
  q("isiSampai").addEventListener("change", kotakBerubah);
  [q("isiDari"), q("isiSampai")].forEach((kotak) =>
    kotak.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (kotak === q("isiDari")) q("isiSampai").focus();
      else terapkan(tDari, tSampai);
    }),
  );
  q("reset").addEventListener("click", () => terapkan("", ""));
  akar.querySelectorAll("[data-rt-pintas]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [a, b] = pintas[+btn.dataset.rtPintas].rentang();
      terapkan(a, b); // jalan pintas langsung berlaku, tanpa perlu Terapkan
    }),
  );
  /* Pendengar di `document` disimpan supaya bisa DILEPAS. Instans yang
     digambar ulang berkali-kali (mis. tab Summary Pengajuan Dana, tiap
     ganti tab atau bahasa) tanpa melepasnya akan menumpuk pendengar
     yang terus menunjuk ke elemen yang sudah tidak ada di halaman. */
  const diLuar = (e) => { if (terbuka() && !akar.contains(e.target)) tutup(); };
  const tombolEsc = (e) => { if (e.key === "Escape" && terbuka()) tutup(); };
  document.addEventListener("click", diLuar);
  document.addEventListener("keydown", tombolEsc);

  gambarPemicu();
  return {
    ambil: () => [dari, sampai],
    setel: (a, b) => { [dari, sampai] = urut(a || "", b || ""); gambarPemicu(); },
    lepas: () => {
      document.removeEventListener("click", diLuar);
      document.removeEventListener("keydown", tombolEsc);
      removeEventListener("scroll", ikutiPemicu, true);
      removeEventListener("resize", ikutiPemicu);
    },
  };
}
