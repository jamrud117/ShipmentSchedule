"use strict";

/* ==================================================================
   NOMOR GANDA DI FORM JADWAL

   Hanya HOUSE B/L-AWB yang harus unik: House B/L-AWB yang SUDAH dipakai
   jadwal lain (kedua buku) ditandai di bawah kotaknya saat diketik,
   lalu ditanyakan sekali lagi saat Simpan -- supaya jadwal yang sama
   tidak terbuat dua kali. Tetap peringatan, bukan larangan: yang
   memutuskan pengguna ("Tetap Simpan").

   Yang lain BOLEH SAMA dan tidak diperiksa:
     - No. Aju & No. SPPB / PEB -- kiriman kurir bernilai rendah semuanya
       berisi "CONSIGNEE NOTE" (aturAjuConsigneeNote, modal-fields.js);
     - Master B/L-AWB -- satu master dipakai beberapa jadwal (konsolidasi
       LCL / udara);
     - Invoice -- satu invoice kadang dikirim bertahap.

   Dicocokkan tanpa beda huruf besar/kecil, spasi & tanda baca
   ("PFSX-260480" = "pfsx 260480"), per nomor kalau satu kotak memuat
   beberapa: dipisah koma / titik koma / baris baru. Isian pengisi
   ("-", "TBA", "N/A") diabaikan.
================================================================== */

// Kotak form -> kolom jadwal lain (kedua buku) yang dibandingkan
const DUP_ISIAN = [{ id: "fHouseBL", kunci: "houseBL", kolom: ["houseBL"] }];
const DUP_PENGISI = new Set(["NA", "NIL", "TBA", "TBC", "NONE", "BELUM", "KOSONG"]);

function dupPecah(nilai) {
  return String(nilai == null ? "" : nilai)
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Kunci pembanding satu nomor -- "" kalau bukan nomor sungguhan
function dupKunci(no) {
  const k = String(no == null ? "" : no).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (k.length < 3 || DUP_PENGISI.has(k) || /^0+$/.test(k)) return "";
  return k;
}

/* Jadwal LAIN (kedua buku) yang memakai nomor di `isi` (nama kolom
   jadwal: houseBL). opsi.id: jadwal yang sedang diubah -- tidak dihitung
   ganda dengan dirinya sendiri.
   Hasil: [{ isian, nomor, kiriman: [...] }], satu per nomor yang ganda. */
function cariNomorGanda(isi, opsi) {
  const idSendiri = String((opsi && opsi.id) || "");
  const semua = semuaKiriman();
  const hasil = [];
  DUP_ISIAN.forEach((isian) => {
    dupPecah(isi && isi[isian.kunci]).forEach((nomor) => {
      const k = dupKunci(nomor);
      if (!k) return;
      // Nomor yang sama dua kali di satu kotak cukup disebut sekali
      if (hasil.some((h) => h.isian === isian && h.kunciNomor === k)) return;
      const kiriman = semua.filter(
        (s) =>
          s &&
          String(s.id) !== idSendiri &&
          isian.kolom.some((kol) => dupPecah(s[kol]).some((x) => dupKunci(x) === k)),
      );
      if (kiriman.length) hasil.push({ isian, nomor, kunciNomor: k, kiriman });
    });
  });
  return hasil;
}

// Label kotaknya apa adanya di layar (B/L vs AWB, SPPB vs PEB ikut moda & buku)
function dupLabel(isian) {
  const lbl = document.querySelector(`label[for="${isian.id}"]`);
  return lbl ? lbl.textContent.replace(/\s+/g, " ").trim() : isian.kunci;
}

function dupRingkasKiriman(s) {
  const etd = effectiveEtd(s);
  const eta = effectiveEta(s);
  return [
    dispVal(s.party),
    s.mode === "export" ? "Export" : "Import",
    etd ? "ETD " + fmtDate(etd) : eta ? "ETA " + fmtDate(eta) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ---------- di form: tanda di bawah kotak ---------- */

function dupWadah(isian) {
  const kotak = document.getElementById(isian.id);
  if (!kotak) return null;
  let wadah = document.getElementById("dup-" + isian.id);
  if (!wadah) {
    wadah = document.createElement("div");
    wadah.id = "dup-" + isian.id;
    wadah.className = "dup-peringatan";
    wadah.setAttribute("role", "status");
    wadah.hidden = true;
    kotak.insertAdjacentElement("afterend", wadah);
  }
  return wadah;
}

function dupIsiForm() {
  const isi = {};
  DUP_ISIAN.forEach((x) => {
    const el = document.getElementById(x.id);
    isi[x.kunci] = el ? el.value : "";
  });
  return isi;
}

/* Tandai ulang SEMUA kotak dari isian form saat ini. Dipanggil saat
   mengetik, saat form dibuka, dan sesudah form diisi dari berkas. */
function periksaNomorGandaForm() {
  const idEl = document.getElementById("fId");
  const ganda = cariNomorGanda(dupIsiForm(), { id: idEl ? idEl.value : "" });
  DUP_ISIAN.forEach((isian) => {
    const wadah = dupWadah(isian);
    const kotak = document.getElementById(isian.id);
    if (!wadah || !kotak) return;
    const temuan = ganda.filter((g) => g.isian.id === isian.id);
    kotak.classList.toggle("is-ganda", temuan.length > 0);
    if (!temuan.length) {
      wadah.hidden = true;
      wadah.innerHTML = "";
      return;
    }
    wadah.hidden = false;
    wadah.innerHTML = temuan
      .map((g) => {
        const s = g.kiriman[0];
        const lain = g.kiriman.length - 1;
        return `<div class="dup-baris"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><span>${escapeHtml(
          tt(`${g.nomor} sudah dipakai:`, `${g.nomor} is already used by:`),
        )} <b>${escapeHtml(dupRingkasKiriman(s))}</b>${
          lain > 0 ? escapeHtml(tt(` dan ${lain} jadwal lain`, ` and ${lain} other schedule${lain === 1 ? "" : "s"}`)) : ""
        }</span><button type="button" class="dup-lihat" data-dup-buka="${escapeAttr(s.id)}">${escapeHtml(tt("Lihat", "View"))}</button></div>`;
      })
      .join("");
  });
  return ganda;
}

// Pesan konfirmasi saat Simpan (teks polos; baris baru dipertahankan .dialog-text)
function pesanNomorGanda(ganda) {
  const baris = ganda.map((g) => {
    const s = g.kiriman[0];
    const lain = g.kiriman.length - 1;
    return `• ${dupLabel(g.isian)} ${g.nomor} — ${dupRingkasKiriman(s)}${
      lain > 0 ? tt(` (+${lain} jadwal lain)`, ` (+${lain} more)`) : ""
    }`;
  });
  return tt(
    `Nomor berikut sudah dipakai jadwal lain:\n\n${baris.join("\n")}\n\nPastikan ini bukan jadwal yang sama sebelum menyimpan.`,
    `These numbers are already used by other schedules:\n\n${baris.join("\n")}\n\nMake sure this is not the same schedule before saving.`,
  );
}

let dupTunda = null;
DUP_ISIAN.forEach((isian) => {
  const kotak = document.getElementById(isian.id);
  if (!kotak) return;
  kotak.addEventListener("input", () => {
    clearTimeout(dupTunda);
    dupTunda = setTimeout(periksaNomorGandaForm, 250);
  });
});

// "Lihat" membuka panel detail jadwal yang sudah memakai nomornya, di atas form
document.addEventListener("click", (e) => {
  const tombol = e.target.closest("[data-dup-buka]");
  if (!tombol) return;
  e.preventDefault();
  openDetailView(tombol.dataset.dupBuka);
});
