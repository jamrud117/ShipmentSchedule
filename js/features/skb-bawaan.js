"use strict";

/* ------------------------------------------------------------------
   SKB PPh BAWAAN UNTUK BARANG BARU (buku Import)

   Hampir semua kiriman impor memakai SKB PPh (Surat Keterangan Bebas
   PPh Pasal 22 impor, dokumen CEISA 457) yang SAMA -- satu nomor untuk
   semua barang, sampai masa berlakunya habis dan terbit SKB baru. Jadi:

     - nomor & tanggal SKB PPh disimpan SEKALI sebagai bawaan
       (bilah "SKB PPh bawaan" di tab Daftar Barang);
     - tiap barang BARU -- baris pertama jadwal baru, "Tambah Barang",
       barang hasil impor CIPL -- otomatis membawa fasilitas SKB PPh itu
       (newItem(), core/helpers.js, memanggil skbBawaanBarang());
     - tetap bisa diubah / dihapus per barang lewat tombol Fasilitas;
     - begitu SKB baru terbit, bawaannya cukup diganti di bilah itu.
       Barang yang SUDAH tersimpan tidak ikut berubah -- SKB lama memang
       yang berlaku untuk kiriman lama. Untuk jadwal yang sedang dibuka
       ada tombol "Pasang ke semua barang".

   "Berlaku sampai" boleh diisi: lewat dari tanggal itu bawaannya TIDAK
   lagi dipasang otomatis (SKB kedaluwarsa tidak boleh terbawa diam-diam)
   dan bilahnya berubah kuning meminta SKB baru.

   Barang dari draft CEISA / PIB PDF tidak ditambahi: fasilitasnya
   mengikuti dokumen itu apa adanya (Cek PIB/PEB yang membandingkan).

   Tersimpan di report_settings (kunci "skb-pph-bawaan", sama untuk semua
   pengguna; hanya EXIM yang boleh mengubah -- RLS), dengan salinan di
   peramban ("exim.skbPphBawaan") supaya barang baru langsung terisi
   sebelum pengaturannya selesai dimuat.
------------------------------------------------------------------ */
const SKB_BAWAAN_KUNCI = "skb-pph-bawaan";
const SKB_BAWAAN_SIMPANAN = "exim.skbPphBawaan";

function skbBawaanRapikan(v) {
  const o = v && typeof v === "object" ? v : {};
  const tgl = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || "")) ? String(x) : "");
  return {
    nomor: String(o.nomor || "").trim().replace(/\s+/g, " ").slice(0, 80),
    tanggal: tgl(o.tanggal),
    berlakuSampai: tgl(o.berlakuSampai),
  };
}

function skbBawaanBacaSimpanan() {
  try {
    return skbBawaanRapikan(JSON.parse(localStorage.getItem(SKB_BAWAAN_SIMPANAN) || "null"));
  } catch (e) {
    return skbBawaanRapikan(null);
  }
}

let skbBawaan = skbBawaanBacaSimpanan();
let skbBawaanSibuk = false;

// Masa berlakunya sudah lewat (hari ini SESUDAH tanggal "berlaku sampai")
function skbBawaanKedaluwarsa(b) {
  const x = b || skbBawaan;
  return !!x.berlakuSampai && x.berlakuSampai < todayISO();
}

/* Daftar fasilitas awal untuk satu barang baru: [entri SKB PPh] atau []
   (belum diatur / kedaluwarsa / buku Export). Dipanggil newItem(). */
function skbBawaanBarang(mode) {
  const modeKini = mode || (typeof activeMode === "string" ? activeMode : "import");
  if (modeKini === "export" || !skbBawaan.nomor || skbBawaanKedaluwarsa()) return [];
  return [{ jenis: "PPH", jenisLainnya: "", nomor: skbBawaan.nomor, tanggal: skbBawaan.tanggal }];
}

/* ---------- bilah di tab Daftar Barang ---------- */

function skbBawaanGambar() {
  const bilah = $("#skbBawaanBar");
  if (!bilah) return;
  const b = skbBawaan;
  const bolehUbah = typeof canEdit !== "function" || canEdit();
  const lewat = skbBawaanKedaluwarsa();
  bilah.classList.toggle("is-kosong", !b.nomor);
  bilah.classList.toggle("is-lewat", !!b.nomor && lewat);
  bilah.classList.toggle("is-sibuk", skbBawaanSibuk);
  let teks;
  if (!b.nomor) {
    teks = tt(
      "<b>SKB PPh bawaan belum diatur.</b> Atur sekali, lalu tiap barang baru otomatis membawa SKB PPh beserta tanggalnya.",
      "<b>No default SKB PPh yet.</b> Set it once and every new item automatically carries the SKB PPh and its date.",
    );
  } else {
    const nomor = `<b>${escapeHtml(b.nomor)}</b>`;
    const tgl = b.tanggal ? ` · ${escapeHtml(fmtDate(b.tanggal))}` : "";
    const sampai = b.berlakuSampai
      ? ` · ${escapeHtml(tt("berlaku s.d.", "valid until"))} ${escapeHtml(fmtDate(b.berlakuSampai))}`
      : "";
    teks = lewat
      ? tt(
          `SKB PPh bawaan ${nomor}${tgl} <b>sudah lewat masa berlakunya</b>${sampai} — tidak lagi dipasang otomatis. Perbarui dengan SKB yang baru.`,
          `The default SKB PPh ${nomor}${tgl} <b>has expired</b>${sampai} — it is no longer added automatically. Update it with the new SKB.`,
        )
      : tt(`SKB PPh bawaan untuk barang baru: ${nomor}${tgl}${sampai}`, `Default SKB PPh for new items: ${nomor}${tgl}${sampai}`);
  }
  const tombol = [];
  if (b.nomor && !lewat && Array.isArray(draftItems) && draftItems.some((it) => !(it.skb || []).some((sk) => sk.jenis === "PPH")))
    tombol.push(
      `<button type="button" class="btn-quiet" data-skb-bawaan="pasang">${escapeHtml(tt("Pasang ke semua barang", "Apply to all items"))}</button>`,
    );
  if (bolehUbah)
    tombol.push(
      `<button type="button" class="btn-quiet" data-skb-bawaan="ubah"><i class="bi bi-pencil" aria-hidden="true"></i> ${escapeHtml(
        b.nomor ? (lewat ? tt("Perbarui", "Update") : tt("Ubah", "Change")) : tt("Atur", "Set"),
      )}</button>`,
    );
  bilah.innerHTML = `<i class="bi ${lewat ? "bi-exclamation-triangle" : "bi-patch-check"}" aria-hidden="true"></i><span class="skb-bawaan-teks">${teks}</span>${
    tombol.length ? `<span class="skb-bawaan-aksi">${tombol.join("")}</span>` : ""
  }`;
}

/* Pasang ke barang jadwal yang sedang dibuka yang BELUM punya SKB PPh
   (SKB PPh yang sudah ada, nomor apa pun, dibiarkan). */
function skbBawaanPasangSemua() {
  const entri = skbBawaanBarang();
  if (!entri.length) return 0;
  let n = 0;
  draftItems.forEach((it) => {
    it.skb = Array.isArray(it.skb) ? it.skb : [];
    if (it.skb.some((sk) => sk.jenis === "PPH")) return;
    it.skb.push(Object.assign({}, entri[0]));
    n++;
  });
  if (n) {
    renderItemTable();
    showToast(
      tt(`SKB PPh ${skbBawaan.nomor} dipasang ke ${n} barang.`, `SKB PPh ${skbBawaan.nomor} applied to ${n} item(s).`),
      "success",
    );
  }
  skbBawaanGambar();
  return n;
}

function skbBawaanBukaUbah() {
  if (!requireEdit()) return;
  const b = skbBawaan;
  showPrompt({
    title: tt("SKB PPh bawaan", "Default SKB PPh"),
    desc: tt(
      "Dipasang otomatis ke tiap barang baru di buku Import (jadwal baru, Tambah Barang, impor CIPL). Barang yang sudah tersimpan tidak berubah. Kosongkan nomornya untuk berhenti memasang otomatis.",
      "Added automatically to every new Import item (new schedule, Add Item, CIPL import). Saved items are not changed. Clear the number to stop adding it automatically.",
    ),
    icon: "bi-patch-check",
    okText: tt("Simpan", "Save"),
    fields: [
      { key: "nomor", label: tt("Nomor SKB PPh", "SKB PPh number"), value: b.nomor, placeholder: "KET-00001/PPUT-CT/KPP.2211/2026" },
      { key: "tanggal", label: tt("Tanggal SKB", "SKB date"), type: "date", value: b.tanggal, lebar: "setengah" },
      {
        key: "berlakuSampai",
        label: tt("Berlaku sampai (boleh kosong)", "Valid until (optional)"),
        type: "date",
        value: b.berlakuSampai,
        lebar: "setengah",
      },
    ],
    onSubmit: (v) => {
      const baru = skbBawaanRapikan(v);
      if (baru.nomor && !baru.tanggal) return tt("Tanggal SKB harus diisi.", "The SKB date is required.");
      if (baru.berlakuSampai && baru.tanggal && baru.berlakuSampai < baru.tanggal)
        return tt("\"Berlaku sampai\" tidak boleh sebelum tanggal SKB.", "\"Valid until\" cannot be before the SKB date.");
      return skbBawaanSimpan(baru).then((ok) => (ok ? true : tt("Gagal disimpan. Coba lagi.", "Could not be saved. Try again.")));
    },
  });
}

/* ---------- muat & simpan ---------- */

function skbBawaanTerapkan(baru) {
  skbBawaan = skbBawaanRapikan(baru);
  try {
    localStorage.setItem(SKB_BAWAAN_SIMPANAN, JSON.stringify(skbBawaan));
  } catch (e) {
    /* penyimpanan peramban diblokir: tetap berlaku selama halaman terbuka */
  }
  skbBawaanGambar();
  // Peringatan masa berlaku di lonceng notifikasi ikut SKB yang baru (notifikasi.js)
  if (typeof jadwalkanNotif === "function") jadwalkanNotif();
}

/* Jadwal BARU yang sedang dibuka: barang yang masih membawa bawaan LAMA
   (pengaturan baru selesai dimuat sesudah form dibuka) ikut diganti. */
function skbBawaanSegarkanDraftBaru(lama) {
  if (!$("#fId") || $("#fId").value || !Array.isArray(draftItems)) return;
  const kini = skbBawaanBarang();
  let berubah = false;
  draftItems.forEach((it) => {
    const skb = it.skb || [];
    const i = skb.findIndex((sk) => sk.jenis === "PPH" && sk.nomor === lama.nomor && sk.tanggal === lama.tanggal);
    if (lama.nomor && i >= 0) {
      if (kini.length) skb[i] = Object.assign({}, kini[0]);
      else skb.splice(i, 1);
      berubah = true;
    } else if (!skb.length && kini.length && !lama.nomor) {
      it.skb = [Object.assign({}, kini[0])];
      berubah = true;
    }
  });
  if (berubah && typeof renderItemTable === "function") renderItemTable();
}

let skbBawaanJanji = null;
/* Bertambah tiap kali bawaan disimpan dari sini: hasil muat yang
   dimulai SEBELUM penyimpanan itu sudah basi dan dibuang. */
let skbBawaanUbahan = 0;
function skbBawaanMuat() {
  if (typeof supabaseClient === "undefined" || !supabaseClient) return Promise.resolve();
  const ubahanAwal = skbBawaanUbahan;
  skbBawaanJanji = (async () => {
    try {
      const { data, error } = await supabaseClient.from("report_settings").select("key, value").eq("key", SKB_BAWAAN_KUNCI).maybeSingle();
      if (error) throw error;
      if (skbBawaanSibuk || ubahanAwal !== skbBawaanUbahan) return;
      const lama = skbBawaan;
      const baru = skbBawaanRapikan(data && data.value);
      if (JSON.stringify(baru) !== JSON.stringify(lama)) {
        skbBawaanTerapkan(baru);
        skbBawaanSegarkanDraftBaru(lama);
      }
    } catch (e) {
      console.error(e); // pengaturan tidak terbaca: salinan di peramban tetap dipakai
    }
    skbBawaanGambar();
  })();
  return skbBawaanJanji;
}

async function skbBawaanSimpan(baru) {
  if (!requireEdit() || skbBawaanSibuk) return false;
  const sebelum = skbBawaan;
  skbBawaanSibuk = true;
  skbBawaanUbahan++;
  skbBawaanTerapkan(baru);
  let galat = null;
  try {
    const { error } = await supabaseClient.from("report_settings").upsert({
      key: SKB_BAWAAN_KUNCI,
      value: skbBawaan,
      updated_by: authState && authState.user ? authState.user.id : null,
    });
    galat = error;
  } catch (e) {
    galat = e;
  }
  skbBawaanSibuk = false;
  if (galat) {
    console.error(galat);
    skbBawaanTerapkan(sebelum);
    showToast(
      tt(
        "SKB PPh bawaan gagal disimpan. Pastikan migration-report-settings.sql sudah dijalankan.",
        "The default SKB PPh could not be saved. Make sure migration-report-settings.sql has been run.",
      ),
      "danger",
    );
    return false;
  }
  skbBawaanSegarkanDraftBaru(sebelum);
  skbBawaanGambar();
  showToast(
    skbBawaan.nomor
      ? tt(`SKB PPh bawaan disimpan: ${skbBawaan.nomor}. Barang baru otomatis membawanya.`, `Default SKB PPh saved: ${skbBawaan.nomor}. New items carry it automatically.`)
      : tt("SKB PPh bawaan dikosongkan: barang baru tidak lagi membawa SKB PPh otomatis.", "Default SKB PPh cleared: new items no longer carry an SKB PPh automatically."),
    "success",
  );
  return true;
}

const skbBawaanBilahEl = $("#skbBawaanBar");
if (skbBawaanBilahEl) {
  skbBawaanBilahEl.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-skb-bawaan]");
    if (!tombol) return;
    if (tombol.dataset.skbBawaan === "ubah") skbBawaanBukaUbah();
    else if (tombol.dataset.skbBawaan === "pasang") skbBawaanPasangSemua();
  });
  skbBawaanGambar();
}
