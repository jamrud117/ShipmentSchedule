"use strict";

/* ------------------------------------------------------------------
   PENANDA TANGAN BAWAAN -- tombol "Simpan penanda tangan"

   Nama & jabatan penanda tangan punya bawaan: Form Pengajuan Dana
   (Checked By, Approved By, Approved By 2 -- dulu ditulis di HTML,
   value="M. Rangga") dan Surat Jalan Export (Mengetahui, Dikirim oleh /
   PPIC -- dulu selalu kosong; Diterima oleh = sopir tiap mobil, bukan
   bawaan). Orangnya berganti, dan mengganti bawaannya dulu
   berarti mengubah kode. Tombol "Simpan penanda tangan" di judul bagian
   penanda tangan menjadikan isian yang tampil sekarang bawaan SETIAP
   pengajuan baru, untuk semua pengguna:

     - disimpan di report_settings (kunci TTD_BAWAAN_KUNCI[jenis], tabel
       yang sama dengan Doc No bawaan; migration-report-settings.sql),
       dengan salinan di peramban supaya langsung berlaku saat halaman
       dibuka -- dan tetap berlaku di peramban ini bila tabelnya belum ada;
     - diterapkan ke defaultValue kotaknya: resetDocNumForm() mengembalikan
       isian ke defaultValue, jadi form baru sesudah menerbitkan nomor
       otomatis memakai bawaan baru. Isian form baru yang belum diubah
       ikut berganti sekarang juga -- kecuali form yang sedang dipinjam
       untuk MENGUBAH nomor lama (isinya milik nomor itu).

   Tombolnya selalu ada; ikonnya menandai keadaan: penanda (bookmark)
   tercentang = isian sama dengan bawaan, plus = ada yang berbeda dan
   bisa disimpan. Hanya peran yang boleh mengubah (requireEdit).
------------------------------------------------------------------ */

const TTD_BAWAAN_ISIAN = {
  fund: ["checkedByName", "checkedByRole", "approver1Name", "approver1Role", "cfoName", "cfoRole"],
  do: ["knownBy", "sentBy"],
};
const TTD_BAWAAN_KUNCI = { fund: "ttd_bawaan_fund", do: "ttd_bawaan_do" };
const ttdBawaanLokal = (jenis) => "exim.ttd.bawaan." + jenis;
const ttdBawaanSibuk = {};

function ttdBawaanKotak(jenis, k) {
  const panel = typeof docNumPanelEl === "function" ? docNumPanelEl(jenis) : document.querySelector(`[data-docnum-panel="${jenis}"]`);
  return panel ? panel.querySelector(`[data-dn="${k}"]`) : null;
}

// Isian yang tampil / bawaan yang berlaku (defaultValue) -> { kunci: nilai }
function ttdBawaanBaca(jenis, bawaan) {
  const out = {};
  TTD_BAWAAN_ISIAN[jenis].forEach((k) => {
    const el = ttdBawaanKotak(jenis, k);
    if (el) out[k] = String(bawaan ? el.defaultValue : el.value).trim();
  });
  return out;
}

const ttdBawaanSama = (a, b) => TTD_BAWAAN_ISIAN.fund.concat(TTD_BAWAAN_ISIAN.do).every((k) => (a[k] || "") === (b[k] || ""));

// Panel sedang dipinjam pop-up Ubah (docnum-view.js): isinya milik nomor lama
const ttdBawaanSedangDiubah = (jenis) => typeof dnUbahSesi !== "undefined" && !!dnUbahSesi && dnUbahSesi.tab === jenis;

function ttdBawaanTerapkan(jenis, nilai) {
  if (!nilai || typeof nilai !== "object") return;
  const diubah = ttdBawaanSedangDiubah(jenis);
  TTD_BAWAAN_ISIAN[jenis].forEach((k) => {
    const el = ttdBawaanKotak(jenis, k);
    if (!el || typeof nilai[k] !== "string") return;
    const lama = el.defaultValue;
    // Isian form baru yang belum diubah (masih = bawaan lama) ikut berganti
    if (!diubah && el.value === lama) el.value = nilai[k];
    el.defaultValue = nilai[k];
  });
  ttdBawaanSegarkan(jenis);
}

function ttdBawaanSegarkan(jenis) {
  const tombol = document.querySelector(`[data-ttd-simpan="${jenis}"]`);
  if (!tombol) return;
  const sama = ttdBawaanSama(ttdBawaanBaca(jenis), ttdBawaanBaca(jenis, true));
  tombol.classList.toggle("is-tersimpan", sama);
  const ikon = tombol.querySelector(".bi");
  if (ikon) ikon.className = "bi " + (sama ? "bi-bookmark-check" : "bi-bookmark-plus");
  tombol.title = sama
    ? tt("Nama & jabatan di bawah sudah menjadi bawaan setiap pengajuan baru", "The names & titles below are already the default for every new request")
    : tt("Jadikan nama & jabatan di bawah bawaan setiap pengajuan baru", "Make the names & titles below the default for every new request");
}

function ttdBawaanMuatLokal(jenis) {
  try {
    return JSON.parse(localStorage.getItem(ttdBawaanLokal(jenis)) || "null");
  } catch (e) {
    return null;
  }
}

function ttdBawaanSimpanLokal(jenis, nilai) {
  try {
    localStorage.setItem(ttdBawaanLokal(jenis), JSON.stringify(nilai));
  } catch (e) {
    /* penyimpanan peramban diblokir: tetap berlaku selama halaman terbuka */
  }
}

/* Dimuat tiap halaman Nomor Dokumen dibuka (showDocNumView) & saat pengguna
   lain menyimpannya (realtime): salinan peramban dulu, lalu database. */
function ttdBawaanMuat() {
  Object.keys(TTD_BAWAAN_ISIAN).forEach((jenis) => ttdBawaanTerapkan(jenis, ttdBawaanMuatLokal(jenis)));
  if (typeof supabaseClient === "undefined" || !supabaseClient) return Promise.resolve();
  return Promise.all(
    Object.keys(TTD_BAWAAN_KUNCI).map(async (jenis) => {
      if (ttdBawaanSibuk[jenis]) return;
      try {
        const { data, error } = await supabaseClient.from("report_settings").select("key, value").eq("key", TTD_BAWAAN_KUNCI[jenis]).maybeSingle();
        if (error) throw error;
        if (!data || !data.value || ttdBawaanSibuk[jenis]) return; // belum pernah disimpan: bawaan HTML / salinan peramban
        ttdBawaanSimpanLokal(jenis, data.value);
        ttdBawaanTerapkan(jenis, data.value);
      } catch (e) {
        console.error(e); // tabel belum ada / jaringan putus: salinan peramban tetap berlaku
      }
    }),
  );
}

async function ttdBawaanSimpan(jenis) {
  if (!TTD_BAWAAN_ISIAN[jenis] || ttdBawaanSibuk[jenis] || !requireEdit()) return false;
  const nilai = ttdBawaanBaca(jenis);
  if (ttdBawaanSama(nilai, ttdBawaanBaca(jenis, true))) {
    showToast(tt("Penanda tangan ini sudah menjadi bawaan.", "These signatories are already the default."), "info", { judul: tt("Tidak ada perubahan", "No change") });
    return true;
  }
  ttdBawaanSibuk[jenis] = true;
  const tombol = document.querySelector(`[data-ttd-simpan="${jenis}"]`);
  if (tombol) tombol.disabled = true;
  ttdBawaanSimpanLokal(jenis, nilai);
  ttdBawaanTerapkan(jenis, nilai);
  let galat = null;
  try {
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: TTD_BAWAAN_KUNCI[jenis],
      value: nilai,
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    galat = error;
  } catch (e) {
    galat = e;
  }
  ttdBawaanSibuk[jenis] = false;
  if (tombol) tombol.disabled = false;
  ttdBawaanSegarkan(jenis);
  if (galat) {
    console.error(galat);
    showToast(
      tt(
        "Bawaan penanda tangan hanya tersimpan di peramban ini — database belum menerimanya. Pastikan migration-report-settings.sql sudah dijalankan.",
        "The default signatories were saved in this browser only — the database did not accept them. Make sure migration-report-settings.sql has been run.",
      ),
      "warning",
      { judul: tt("Belum tersimpan untuk semua", "Not saved for everyone yet") },
    );
    return false;
  }
  showToast(
    tt("Nama & jabatan ini kini terisi otomatis di setiap pengajuan baru.", "These names & titles now fill in automatically on every new request."),
    "success",
    { judul: tt("Penanda tangan disimpan", "Signatories saved") },
  );
  return true;
}

document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-ttd-simpan]");
  if (tombol) ttdBawaanSimpan(tombol.dataset.ttdSimpan);
});
// Mengetik di isian penanda tangan: ikon tombol mengikuti (sama / berbeda dari bawaan)
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el || !el.dataset || !el.dataset.dn) return;
  Object.keys(TTD_BAWAAN_ISIAN).forEach((jenis) => {
    if (TTD_BAWAAN_ISIAN[jenis].indexOf(el.dataset.dn) >= 0 && el.closest(`[data-docnum-panel="${jenis}"]`)) ttdBawaanSegarkan(jenis);
  });
});

// Salinan peramban berlaku sejak modul dimuat; database menyusul saat halaman dibuka
Object.keys(TTD_BAWAAN_ISIAN).forEach((jenis) => {
  ttdBawaanTerapkan(jenis, ttdBawaanMuatLokal(jenis));
  ttdBawaanSegarkan(jenis);
});
