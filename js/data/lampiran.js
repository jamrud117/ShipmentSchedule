"use strict";

/* LAMPIRAN BERKAS — Supabase Storage, bucket PRIVAT "lampiran-jadwal"
   (migration-lampiran-lartas-kebutuhan.sql).

   Dua tempat menyimpan lampiran:
     - tahap Progres Dokumen di kartu (doc-steps.js): s.docProgress[tahap].berkas
     - baris PI & LS kartu Dokumen Pelengkap Pabean di form jadwal
       (dok-pelengkap.js): s.dokPelengkap.pi[i].berkas / .ls[i].berkas
   Isinya sama: { path, nama, ukuran, tipe, at, by, versi? } -- `path`
   kunci berkasnya di bucket, `versi` "draft" / "asli" (tahap yang
   mengenal draft saja).

   BERKAS BARU BARU DIUNGGAH SAAT SIMPAN, BERKAS YANG DIBUANG BARU
   DIHAPUS SESUDAH SIMPAN BERHASIL. Batal di tengah jalan karena itu
   tidak meninggalkan apa pun: tidak ada berkas yatim di bucket, dan
   lampiran yang terlanjur dihapus di layar kembali utuh.

   Bucket-nya privat: berkas dibuka lewat tautan bertanda tangan yang
   kedaluwarsa sendiri (createSignedUrl), bukan alamat publik. Hanya
   akun EXIM yang boleh mengunggah & menghapus (kebijakan storage di
   berkas migrasinya); semua akun boleh membuka. */

const BUCKET_LAMPIRAN = "lampiran-jadwal";
const LAMPIRAN_MAKS_MB = 20;
const LAMPIRAN_MAKS_BYTE = LAMPIRAN_MAKS_MB * 1024 * 1024;
const LAMPIRAN_TERIMA = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.tif,.tiff,.xls,.xlsx,.csv,.doc,.docx,.zip,.msg,.eml,.txt";
const BERKAS_MIGRASI_LAMPIRAN = "migration-lampiran-lartas-kebutuhan.sql";

/* Nama di bucket: huruf, angka, titik, minus & garis bawah saja --
   kunci Storage menolak sebagian tanda, dan spasi menyulitkan tautan.
   Nama aslinya tetap tersimpan utuh di `nama` untuk ditampilkan. */
function namaBerkasAman(nama) {
  const teks = String(nama || "berkas").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const titik = teks.lastIndexOf(".");
  const ekor = titik > 0 ? teks.slice(titik + 1).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase() : "";
  const badan = (titik > 0 ? teks.slice(0, titik) : teks)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80) || "berkas";
  return ekor ? `${badan}.${ekor}` : badan;
}

function idAcakLampiran() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Daftar lampiran tersimpan dirapikan: hanya entri ber-path, tanpa kunci liar
function rapikanBerkas(daftar) {
  if (!Array.isArray(daftar)) return [];
  const sudah = new Set();
  return daftar
    .filter((b) => b && typeof b === "object" && typeof b.path === "string" && b.path.trim())
    .filter((b) => !sudah.has(b.path) && sudah.add(b.path))
    .map((b) => {
      const out = {
        path: b.path,
        nama: String(b.nama || b.path.split("/").pop() || ""),
        ukuran: Math.max(0, Number(b.ukuran) || 0),
        tipe: String(b.tipe || ""),
        at: String(b.at || ""),
        by: String(b.by || ""),
      };
      if (b.versi === "draft" || b.versi === "asli") out.versi = b.versi;
      return out;
    });
}

/* Ikon menurut jenis berkasnya -- dari tipe MIME, atau ekstensi nama
   kalau peramban tidak mengenal tipenya (.msg, .heic di Windows). */
function ikonBerkas(b) {
  const tipe = String((b && b.tipe) || "").toLowerCase();
  const ekor = (String((b && b.nama) || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  if (tipe === "application/pdf" || ekor === "pdf") return "bi-file-earmark-pdf";
  if (tipe.startsWith("image/") || /^(jpe?g|png|webp|gif|heic|heif|tiff?)$/.test(ekor)) return "bi-file-earmark-image";
  if (/sheet|excel|csv/.test(tipe) || /^(xlsx?|csv)$/.test(ekor)) return "bi-file-earmark-spreadsheet";
  if (/word/.test(tipe) || /^docx?$/.test(ekor)) return "bi-file-earmark-word";
  if (/zip/.test(tipe) || ekor === "zip") return "bi-file-earmark-zip";
  return "bi-file-earmark";
}

function ukuranBerkasTeks(byte) {
  const n = Number(byte) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", activeLang === "en" ? "." : ",")} MB`;
}

/* Berkas pilihan pengguna yang ditolak sebelum diunggah: kosong, atau
   lebih dari batas bucket. Pesan, atau "" kalau boleh. */
function periksaBerkasLampiran(file) {
  if (!file || !file.size) return tt(`${(file && file.name) || "Berkas"} kosong.`, `${(file && file.name) || "File"} is empty.`);
  if (file.size > LAMPIRAN_MAKS_BYTE)
    return tt(`${file.name} lebih dari ${LAMPIRAN_MAKS_MB} MB.`, `${file.name} is larger than ${LAMPIRAN_MAKS_MB} MB.`);
  return "";
}

// Galat Storage -> kalimat yang memberi tahu langkah berikutnya
function pesanGalatLampiran(error) {
  if (error && error.pesanPengguna) return error.pesanPengguna;
  const pesan = String((error && (error.message || error.error)) || error || "");
  if (/bucket not found|not found/i.test(pesan))
    return tt(`Tempat lampiran belum disiapkan. Jalankan ${BERKAS_MIGRASI_LAMPIRAN} di Supabase.`,
      `The attachment storage is not set up yet. Run ${BERKAS_MIGRASI_LAMPIRAN} in Supabase.`);
  if (/row-level security|policy|unauthori[sz]ed|403/i.test(pesan))
    return tt("Hanya akun EXIM yang boleh mengunggah atau menghapus lampiran.", "Only EXIM accounts can upload or delete attachments.");
  if (/payload too large|exceeded|413|maximum allowed size/i.test(pesan))
    return tt(`Berkas lebih dari ${LAMPIRAN_MAKS_MB} MB.`, `The file is larger than ${LAMPIRAN_MAKS_MB} MB.`);
  return tt("Lampiran gagal diunggah. Periksa sambungan lalu coba lagi.", "The attachment failed to upload. Check the connection and try again.");
}

function storageLampiran() {
  return supabaseClient.storage.from(BUCKET_LAMPIRAN);
}

/* Unggah berkas-berkas baru ke `folder`, BERURUTAN. Satu gagal -> yang
   sudah terunggah dari kumpulan yang sama dihapus lagi, lalu galatnya
   dilempar: lampiran satu simpanan masuk semua atau tidak sama sekali.
   `baru`: [{ file, versi? }]. Hasil: entri lampiran siap disimpan. */
async function unggahLampiran(baru, folder) {
  const hasil = [];
  try {
    for (const b of baru || []) {
      const galat = periksaBerkasLampiran(b.file);
      if (galat) throw Object.assign(new Error(galat), { pesanPengguna: galat });
      const path = `${folder}/${idAcakLampiran()}-${namaBerkasAman(b.file.name)}`;
      const { error } = await storageLampiran().upload(path, b.file, {
        contentType: b.file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw error;
      const entri = {
        path,
        nama: b.file.name,
        ukuran: b.file.size,
        tipe: b.file.type || "",
        at: new Date().toISOString(),
        by: typeof penggunaSekarang === "function" ? penggunaSekarang() : "",
      };
      if (b.versi === "draft" || b.versi === "asli") entri.versi = b.versi;
      hasil.push(entri);
    }
  } catch (e) {
    await hapusLampiran(hasil.map((b) => b.path));
    throw e;
  }
  return hasil;
}

/* Hapus dari bucket -- usaha terbaik. Data jadwal sudah tersimpan saat
   ini dipanggil; berkas yang gagal terhapus cuma menyisakan sampah di
   bucket, bukan kerusakan data, jadi cukup dicatat di konsol. */
async function hapusLampiran(paths) {
  const daftar = (paths || []).filter(Boolean);
  if (!daftar.length) return;
  try {
    const { error } = await storageLampiran().remove(daftar);
    if (error) console.error("Lampiran gagal dihapus:", error);
  } catch (e) {
    console.error("Lampiran gagal dihapus:", e);
  }
}

/* MEMBUKA LAMPIRAN. Jendela baru dibuka SEKETIKA (masih di dalam klik),
   alamatnya diisi sesudah tautan bertanda tangan didapat: jendela yang
   dibuka sesudah menunggu jaringan diblokir peramban sebagai pop-up. */
async function bukaLampiran(b) {
  if (!b || !b.path) return;
  const jendela = window.open("", "_blank");
  try {
    const { data, error } = await storageLampiran().createSignedUrl(b.path, 300);
    if (error || !data || !data.signedUrl) throw error || new Error("tanpa tautan");
    if (jendela) {
      jendela.opener = null;
      jendela.location.href = data.signedUrl;
    } else {
      window.location.assign(data.signedUrl);
    }
  } catch (e) {
    console.error(e);
    if (jendela) jendela.close();
    showToast(
      /not found/i.test(String((e && e.message) || ""))
        ? tt(`${b.nama || "Lampiran"} tidak ditemukan di tempat lampiran.`, `${b.nama || "The attachment"} was not found in the attachment storage.`)
        : tt("Lampiran gagal dibuka.", "The attachment could not be opened."),
      "danger",
    );
  }
}

/* SATU LAMPIRAN SEBAGAI CHIP: ikon jenis, nama (tombol buka), versi
   Draft/Asli, tombol hapus. `opsi`: { i, baru, hapus, versi } --
   `baru` = berkas pilihan yang belum diunggah (dibuka dari memori
   peramban, ditandai "baru"). */
function chipBerkasHtml(b, opsi) {
  const o = opsi || {};
  const nama = b.nama || "";
  const versi = o.versi !== false && (b.versi === "draft" || b.versi === "asli")
    ? `<span class="berkas-versi berkas-versi--${b.versi}">${b.versi === "draft" ? "Draft" : tt("Asli", "Original")}</span>`
    : "";
  const judul = `${nama} · ${ukuranBerkasTeks(b.ukuran)}${o.baru ? tt(" · diunggah saat Simpan", " · uploaded on Save") : ""}`;
  return `<span class="berkas-chip${o.baru ? " is-baru" : ""}" data-berkas-i="${o.i}" data-berkas-jenis="${o.baru ? "baru" : "lama"}">
      <i class="bi ${ikonBerkas(b)}" aria-hidden="true"></i>
      <button type="button" class="berkas-buka" data-berkas-buka title="${escapeAttr(judul)}">${escapeHtml(nama)}</button>
      ${versi}${o.baru ? `<span class="berkas-baru">${tt("baru", "new")}</span>` : ""}
      ${o.hapus === false ? "" : `<button type="button" class="berkas-hapus" data-berkas-hapus aria-label="${escapeAttr(tt(`Lepas lampiran ${nama}`, `Remove attachment ${nama}`))}" title="${escapeAttr(tt("Lepas lampiran", "Remove attachment"))}"><i class="bi bi-x-lg"></i></button>`}
    </span>`;
}

// Membuka berkas yang belum diunggah langsung dari memori peramban
function bukaBerkasLokal(file) {
  if (!file || typeof URL === "undefined" || !URL.createObjectURL) return;
  const url = URL.createObjectURL(file);
  const jendela = window.open(url, "_blank");
  if (jendela) jendela.opener = null;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* PENGELOLA LAMPIRAN SATU WADAH -- dipakai kotak tahap dokumen
   (showPrompt, isian `type: "berkas"`). Lampiran lama bisa dibuka &
   dilepas; berkas baru ditampung sebagai File sampai Simpan.
   `opsi`: { berkas, versi: () => "draft" | "asli" | "" } -- versi berkas
   baru mengikuti status yang sedang dipilih di kotaknya. */
function buatPengelolaBerkas(opsi) {
  const o = opsi || {};
  const lama = rapikanBerkas(o.berkas);
  const baru = [];
  const dilepas = [];
  let wadah = null;
  const versiKini = () => (typeof o.versi === "function" ? o.versi() : "") || "";

  const gambar = () => {
    if (!wadah) return;
    const daftar = wadah.querySelector(".pb-daftar");
    const isi = lama
      .map((b, i) => chipBerkasHtml(b, { i }))
      .concat(baru.map((b, i) => chipBerkasHtml(Object.assign({}, b, { versi: versiKini() || undefined }), { i, baru: true })));
    daftar.innerHTML = isi.length ? isi.join("") : `<span class="pb-kosong">${escapeHtml(tt("Belum ada lampiran.", "No attachments yet."))}</span>`;
  };

  return {
    pasang(el) {
      wadah = el;
      gambar();
      el.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-berkas-i]");
        if (!chip) return;
        const i = Number(chip.dataset.berkasI);
        const jenisBaru = chip.dataset.berkasJenis === "baru";
        if (e.target.closest("[data-berkas-hapus]")) {
          if (jenisBaru) baru.splice(i, 1);
          else dilepas.push(lama.splice(i, 1)[0]);
          gambar();
          fokuskan(wadah.querySelector("[data-berkas-hapus]") || wadah.querySelector(".pb-tambah input"));
          return;
        }
        if (e.target.closest("[data-berkas-buka]")) {
          if (jenisBaru) bukaBerkasLokal(baru[i] && baru[i].file);
          else bukaLampiran(lama[i]);
        }
      });
      const input = el.querySelector('input[type="file"]');
      if (input) {
        input.addEventListener("change", () => {
          const galat = [];
          [...(input.files || [])].forEach((file) => {
            const g = periksaBerkasLampiran(file);
            if (g) galat.push(g);
            else baru.push({ file, nama: file.name, ukuran: file.size, tipe: file.type || "" });
          });
          input.value = "";
          gambar();
          if (galat.length) showToast(galat.join(" "), "warning");
        });
      }
    },
    gambarUlang: gambar,
    // Dibaca saat Simpan: lampiran yang dipertahankan, berkas baru, & yang dilepas
    nilai() {
      const versi = versiKini();
      return {
        lama: lama.slice(),
        baru: baru.map((b) => ({ file: b.file, versi })),
        dilepas: dilepas.slice(),
      };
    },
    get jumlah() {
      return lama.length + baru.length;
    },
  };
}

/* Isian `type: "berkas"` untuk showPrompt (feedback.js): daftar chip +
   tombol Lampirkan. Nilainya dibaca lewat pengelolanya (`f.pengelola`). */
function isianBerkasHtml(id) {
  return `<div class="prompt-berkas" id="${id}">
      <div class="pb-daftar"></div>
      <label class="pb-tambah">
        <i class="bi bi-paperclip" aria-hidden="true"></i> ${escapeHtml(tt("Lampirkan berkas", "Attach files"))}
        <input type="file" multiple accept="${escapeAttr(LAMPIRAN_TERIMA)}" class="visually-hidden">
      </label>
    </div>`;
}

// Seluruh path lampiran sebuah jadwal -- tahap dokumen & dokumen pelengkap
function semuaLampiranJadwal(s) {
  const paths = [];
  const p = (s && s.docProgress) || {};
  Object.keys(p).forEach((k) => rapikanBerkas(p[k] && p[k].berkas).forEach((b) => paths.push(b.path)));
  const dok = s && s.dokPelengkap;
  if (dok && typeof dok === "object") {
    Object.keys(dok).forEach((j) => (Array.isArray(dok[j]) ? dok[j] : []).forEach((d) => rapikanBerkas(d && d.berkas).forEach((b) => paths.push(b.path))));
  }
  return [...new Set(paths)];
}

/* Tautan lampiran HANYA-BACA (panel detail): klik membuka berkasnya.
   Penangannya satu untuk seluruh halaman, membaca data-* tombolnya. */
function tautanLampiranHtml(daftar) {
  const berkas = rapikanBerkas(daftar);
  if (!berkas.length) return "";
  return `<span class="berkas-tautan">${berkas
    .map(
      (b) => `<button type="button" class="berkas-link" data-buka-lampiran="${escapeAttr(b.path)}" data-nama="${escapeAttr(b.nama)}" title="${escapeAttr(`${b.nama} · ${ukuranBerkasTeks(b.ukuran)}`)}"><i class="bi ${ikonBerkas(b)}" aria-hidden="true"></i> ${escapeHtml(b.nama)}${
        b.versi === "draft" ? ` <span class="berkas-versi berkas-versi--draft">Draft</span>` : ""
      }</button>`,
    )
    .join("")}</span>`;
}
document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest("[data-buka-lampiran]");
  if (!tombol) return;
  bukaLampiran({ path: tombol.dataset.bukaLampiran, nama: tombol.dataset.nama || "" });
});
