"use strict";

/* ==================================================================
   NOTIFIKASI KEBERANGKATAN, KEDATANGAN & DELIVERY TO FACTORY (lonceng)

   Pemicu: H-1 dari ETD dan H-1 dari ETA yang BERLAKU -- revisi delay
   ikut (effectiveEtd / effectiveEta) -- dan H-1 dari Estimated Delivery
   jadwal Import (kolom `actual`: barang diantar ke pabrik). Notifikasinya
   tampil sejak H-1 ("besok") sampai akhir hari H ("hari ini"), lalu
   hilang sendiri.

   Notifikasi DIHITUNG dari jadwal, bukan baris database: semua yang
   bisa membuka Jadwal melihat yang sama. Yang disimpan -- localStorage,
   per akun & per perangkat -- hanya:
     dibaca  notifikasi mana yang sudah dibaca;
     lacak   tanggal yang terakhir DINOTIFIKASI per jadwal & jenis.

   NOTIFIKASI ULANG. Kunci tiap notifikasi memuat tanggal & generasinya.
   Begitu ETD/ETA/Estimated Delivery yang sudah pernah dinotifikasi berubah,
   generasinya naik: notifikasi lama hilang, dan yang baru muncul (belum
   dibaca) begitu tanggal barunya mencapai H-1 -- juga kalau tanggalnya
   dikembalikan ke yang semula.

   Buku Import: jadwal yang sudah tiba (In Factory) tidak dinotifikasi.
   Buku Export dinyatakan Delivered sejak ETD-nya lewat (status.js),
   jadi tidak disaring: ETA ke pelabuhan pembeli tetap diberitahukan.
   Delivery to Factory hanya Import -- kolom `actual` di buku Export
   adalah tanggal Stuffing, bukan pengantaran ke pabrik.

   MASA BERLAKU DOKUMEN (hitungNotifMasa): SKB PPh bawaan (skb-bawaan.js)
   dan Masterlist (masterlist-view.js) yang "berlaku sampai"-nya tinggal
   2 bulan (NOTIF_MASA_BULAN) -- lalu sekali lagi begitu sudah berakhir --
   tampil di bagian "Masa berlaku" di atas panel.
================================================================== */

const NOTIF_AWALAN_SIMPAN = "exim.notif.";
const NOTIF_SEGAR_MS = 5 * 60 * 1000; // menangkap pergantian hari saat aplikasi terus terbuka
const NOTIF_SIMPAN_HARI = 45; // catatan dibaca / lacak yang lebih tua dibuang

let notifDaftar = [];
let notifBelumDibacaTerakhir = 0;

function notifKunciSimpan() {
  const u = typeof authState !== "undefined" && authState.user;
  return NOTIF_AWALAN_SIMPAN + ((u && u.id) || "anon");
}
function notifMuatKeadaan() {
  try {
    const x = JSON.parse(localStorage.getItem(notifKunciSimpan()) || "null");
    if (x && typeof x === "object") return { dibaca: x.dibaca || {}, lacak: x.lacak || {} };
  } catch (e) {
    /* Rusak / tidak bisa dibaca: mulai bersih */
  }
  return { dibaca: {}, lacak: {} };
}
function notifSimpanKeadaan(k) {
  try {
    localStorage.setItem(notifKunciSimpan(), JSON.stringify(k));
  } catch (e) {
    /* Penuh / diblokir: notifikasinya tetap tampil, hanya status dibacanya yang tidak diingat */
  }
}

const NOTIF_JENIS = ["etd", "eta", "delivery"];

function notifTanggal(s, jenis) {
  if (jenis === "etd") return effectiveEtd(s) || "";
  if (jenis === "eta") return effectiveEta(s) || "";
  return (s && s.mode !== "export" && s.actual) || "";
}

/* Notifikasi yang aktif hari ini, sekaligus memperbarui pelacak tanggal.
   `hariIni` hanya untuk pengujian. */
function hitungNotifikasi(hariIni) {
  const kini = hariIni || todayISO();
  const keadaan = notifMuatKeadaan();
  let berubah = false;
  const semua = semuaKiriman();
  const ada = new Set();
  const hasil = [];

  semua.forEach((s) => {
    if (!s || !s.id) return;
    ada.add(String(s.id));
    NOTIF_JENIS.forEach((jenis) => {
      const tgl = notifTanggal(s, jenis);
      const kLacak = s.id + "|" + jenis;
      let lacak = keadaan.lacak[kLacak];
      // Tanggalnya berubah sesudah pernah dinotifikasi -> generasi baru
      if (lacak && lacak.tgl !== tgl) {
        lacak = { tgl, gen: (lacak.gen || 0) + 1, dulu: lacak.tgl || lacak.dulu || "" };
        keadaan.lacak[kLacak] = lacak;
        berubah = true;
      }
      if (!tgl) return;
      const pemicu = addCalendarDaysISO(tgl, -1);
      if (!pemicu || kini < pemicu || kini > tgl) return;
      if (s.mode !== "export" && isArrived(s)) return;
      if (!lacak) {
        lacak = { tgl, gen: 0, dulu: "" };
        keadaan.lacak[kLacak] = lacak;
        berubah = true;
      }
      const kunci = `${kLacak}|${tgl}|${lacak.gen}`;
      hasil.push({
        kunci,
        s,
        jenis,
        tgl,
        hariIni: tgl === kini,
        dulu: lacak.dulu && lacak.dulu !== tgl ? lacak.dulu : "",
        dibaca: !!keadaan.dibaca[kunci],
      });
    });
  });

  /* Bersih-bersih: jadwal yang sudah dihapus, tanggal yang sudah lama
     lewat, catatan dibaca milik notifikasi yang sudah lama selesai.
     Hanya sesudah data benar-benar dimuat -- daftar kosong saat masih
     memuat bukan berarti semua jadwal dihapus. */
  if (typeof shipmentsLoaded !== "undefined" && shipmentsLoaded) {
    const batas = addCalendarDaysISO(kini, -NOTIF_SIMPAN_HARI);
    Object.keys(keadaan.lacak).forEach((k) => {
      const l = keadaan.lacak[k];
      if (!ada.has(k.split("|")[0]) || (l.tgl && l.tgl < batas)) {
        delete keadaan.lacak[k];
        berubah = true;
      }
    });
    Object.keys(keadaan.dibaca).forEach((k) => {
      if (k.startsWith(NOTIF_MASA_AWALAN)) return; // milik hitungNotifMasa()
      const tgl = k.split("|")[2] || "";
      if (!ada.has(k.split("|")[0]) || tgl < batas) {
        delete keadaan.dibaca[k];
        berubah = true;
      }
    });
  }
  if (berubah) notifSimpanKeadaan(keadaan);

  // Hari ini dulu, lalu besok; yang belum dibaca di atas; berangkat, tiba, lalu diantar ke pabrik
  hasil.sort(
    (a, b) =>
      (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) ||
      Number(a.dibaca) - Number(b.dibaca) ||
      NOTIF_JENIS.indexOf(a.jenis) - NOTIF_JENIS.indexOf(b.jenis) ||
      String(a.s.party || "").localeCompare(String(b.s.party || "")),
  );
  return hasil;
}

/* ---------- MASA BERLAKU: SKB PPh bawaan & Masterlist ----------

   Peringatan dua tahap per dokumen, masing-masing satu notifikasi:
     dekat  sejak 2 BULAN sebelum "berlaku sampai" (NOTIF_MASA_BULAN) sampai
            harinya -- "Berakhir dalam 12 hari". Dua bulan KALENDER, bukan
            60 hari: berlaku s.d. 31 Desember -> mulai 31 Oktober; tanggal
            yang tidak ada di bulan itu jatuh ke akhir bulannya (30 April
            -> 28/29 Februari, 31 Desember -> 31 Oktober);
     lewat  sesudahnya, sampai dokumen barunya dicatat -- "Sudah berakhir".
   Kuncinya memuat nomor/id & tanggal berlakunya: SKB atau masterlist baru
   (tanggal baru) = notifikasi baru, yang lama hilang sendiri.

   Sumbernya data yang sudah ada: `skbBawaan` (report_settings, salinan
   di peramban) dan baris tabel masterlists -- `mstDok` kalau halaman
   Masterlist sudah dimuat, selain itu dibaca sekali saat aplikasi
   dibuka (notifMuatMasaBerlaku). */
const NOTIF_MASA_BULAN = 2;
const NOTIF_MASA_AWALAN = "masa|";

/* Hari pertama peringatan "dekat": `sampai` mundur NOTIF_MASA_BULAN bulan
   kalender, tanggalnya dipotong ke akhir bulan bila tidak ada. "" bila
   tanggalnya tak terbaca. */
function notifMasaMulai(sampai) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sampai || "").slice(0, 10));
  if (!m) return "";
  let tahun = Number(m[1]);
  let bulan = Number(m[2]) - NOTIF_MASA_BULAN; // 1..12, boleh <= 0 sebelum dirapikan
  while (bulan < 1) {
    bulan += 12;
    tahun -= 1;
  }
  const akhirBulan = new Date(tahun, bulan, 0).getDate();
  const hari = Math.min(Number(m[3]), akhirBulan);
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
}
let notifMasterlist = null; // { id, name, valid_until } -- baris pertama tabel masterlists
let notifMasaJanji = null;
let notifMasaSiap = false;

async function notifMuatMasterlist() {
  if (typeof supabaseClient === "undefined" || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("masterlists")
      .select("id, name, valid_until")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    notifMasterlist = (data || [])[0] || null;
  } catch (e) {
    console.error(e); // tabel belum ada / tak terbaca: tanpa peringatan masterlist
  }
}

/* Sekali per sesi: SKB PPh bawaan terbaru & masa berlaku masterlist. */
function notifMuatMasaBerlaku() {
  if (!notifMasaJanji) {
    notifMasaJanji = Promise.all([typeof skbBawaanMuat === "function" ? skbBawaanMuat() : null, notifMuatMasterlist()]).then(() => {
      notifMasaSiap = true;
      jadwalkanNotif();
    });
  }
  return notifMasaJanji;
}

// Masterlist yang berlaku: dari halaman Masterlist bila sudah dimuat (paling baru)
function notifMasterlistKini() {
  return typeof mstTermuat !== "undefined" && mstTermuat ? mstDok || null : notifMasterlist;
}

/* Peringatan masa berlaku yang aktif hari ini. `hariIni` untuk pengujian. */
function hitungNotifMasa(hariIni) {
  const kini = hariIni || todayISO();
  const keadaan = notifMuatKeadaan();
  const hasil = [];
  const tambah = (dok, id, nama, sampai, buka) => {
    const sisa = calendarDaysBetweenISO(kini, sampai);
    const mulai = notifMasaMulai(sampai);
    if (sisa == null || !mulai || kini < mulai) return;
    const tahap = sisa < 0 ? "lewat" : "dekat";
    const kunci = `${NOTIF_MASA_AWALAN}${dok}|${String(id).replace(/\|/g, "/")}|${sampai}|${tahap}`;
    hasil.push({ kunci, jenis: "masa", dok, nama, tgl: sampai, sisa, lewat: sisa < 0, buka, dibaca: !!keadaan.dibaca[kunci] });
  };
  const skb = typeof skbBawaan !== "undefined" ? skbBawaan : null;
  if (skb && skb.nomor && skb.berlakuSampai) tambah("skb", skb.nomor, `SKB PPh ${skb.nomor}`, skb.berlakuSampai, "skb");
  const ml = notifMasterlistKini();
  if (ml && ml.valid_until) {
    const namaMl = String(ml.name || "").trim();
    tambah("masterlist", ml.id, /masterlist/i.test(namaMl) ? namaMl : ["Masterlist", namaMl].filter(Boolean).join(" "), ml.valid_until, "masterlist");
  }

  // Catatan dibaca milik peringatan yang sudah tidak aktif dibuang -- hanya
  // sesudah sumbernya termuat (sebelum itu "tidak ada" belum tentu benar)
  if (notifMasaSiap) {
    const aktif = new Set(hasil.map((n) => n.kunci));
    const basi = Object.keys(keadaan.dibaca).filter((k) => k.startsWith(NOTIF_MASA_AWALAN) && !aktif.has(k));
    if (basi.length) {
      basi.forEach((k) => delete keadaan.dibaca[k]);
      notifSimpanKeadaan(keadaan);
    }
  }
  // Yang sudah berakhir dulu, lalu yang paling dekat
  return hasil.sort((a, b) => a.sisa - b.sisa);
}

function notifMasaStatus(n) {
  if (n.sisa < 0) return tt(`Sudah berakhir ${-n.sisa} hari lalu`, `Expired ${-n.sisa} ${n.sisa === -1 ? "day" : "days"} ago`);
  if (n.sisa === 0) return tt("Berakhir hari ini", "Expires today");
  return tt(`Berakhir dalam ${n.sisa} hari`, `Expires in ${n.sisa} ${n.sisa === 1 ? "day" : "days"}`);
}

/* Kartu masa berlaku: statusnya JUDUL kartu ("Berakhir dalam 12 hari" /
   "Sudah berakhir 3 hari lalu" -- merah), nama dokumennya di bawah, lalu
   tanggal berlaku & tindakannya. */
function notifMasaItemHtml(n) {
  const aksi =
    n.buka === "masterlist"
      ? tt("Buka Masterlist", "Open the Masterlist")
      : typeof canEdit !== "function" || canEdit()
        ? tt("Perbarui SKB PPh bawaan", "Update the default SKB PPh")
        : "";
  return `<button type="button" class="notif-item notif-item--masa${n.dibaca ? "" : " is-baru"}${n.lewat ? " is-lewat" : ""}" data-notif-kunci="${escapeAttr(n.kunci)}" data-notif-masa="${escapeAttr(n.buka)}" data-notif-jenis="masa">
    <span class="notif-ikon notif-ikon--masa${n.lewat ? " notif-ikon--merah" : ""}" aria-hidden="true"><i class="bi bi-shield-exclamation"></i></span>
    <span class="notif-teks">
      <span class="notif-aksi notif-masa-status">${escapeHtml(notifMasaStatus(n))}</span>
      <span class="notif-dokumen-nama">${escapeHtml(n.nama)}</span>
      <span class="notif-meta">${escapeHtml(tt("Berlaku sampai", "Valid until"))} ${escapeHtml(fmtDate(n.tgl))}</span>
      ${aksi ? `<span class="notif-masa-aksi">${escapeHtml(aksi)} <i class="bi bi-arrow-right" aria-hidden="true"></i></span>` : ""}
    </span>
    ${n.dibaca ? "" : `<span class="notif-titik"><span class="visually-hidden">${escapeHtml(tt("Belum dibaca", "Unread"))}</span></span>`}
  </button>`;
}

function notifMasaHtml(daftar) {
  if (!daftar.length) return "";
  const judul = tt("Masa berlaku", "Validity");
  return `<section class="notif-hari notif-hari--masa" aria-label="${escapeAttr(`${judul} (${daftar.length})`)}">
    <h3 class="notif-kelompok"><span class="notif-kelompok-judul">${escapeHtml(judul)}</span><span class="notif-kelompok-tgl">${escapeHtml(tt(`SKB PPh & Masterlist · ≤ ${NOTIF_MASA_BULAN} bulan`, `SKB PPh & Masterlist · ≤ ${NOTIF_MASA_BULAN} months`))}</span><span class="notif-kelompok-n">${daftar.length}</span></h3>
    ${daftar.map(notifMasaItemHtml).join("")}
  </section>`;
}

function tandaiNotifDibaca(kunciDaftar) {
  const keadaan = notifMuatKeadaan();
  const kini = todayISO();
  [].concat(kunciDaftar).forEach((k) => {
    if (k) keadaan.dibaca[k] = kini;
  });
  notifSimpanKeadaan(keadaan);
  notifDaftar.forEach((n) => {
    if ([].concat(kunciDaftar).indexOf(n.kunci) >= 0) n.dibaca = true;
  });
  gambarLonceng();
  if (panelNotifTerbuka()) gambarPanelNotif();
}

/* ---------- tampilan ----------

   Tiap notifikasi SATU KARTU yang terbaca sebagai kalimat:

     [ikon]  Tiba di Tanjung Priok                          ●
             SUMITOMO CHEMICAL ASIA  Import  [Delay 8 Hari]
             Antioxidant 6PPD +1 lainnya
             Dari Singapore · ONE COMMITMENT 071W · B/L ...
             ▬▬▬───── Dokumen 3/10 · Berikutnya: PIB

   Apa yang terjadi & di mana = judul kartu (dulu kotak jenis terpisah
   + nama pihak saja); siapa & barang apa = baris berikutnya (pemasok
   oranye seperti di papan); dari mana / kapal / B/L, lalu progres
   dokumen -- yang menentukan barang bisa langsung keluar pelabuhan.
   Ikonnya berwarna KEADAAN jadwal: biru sesuai jadwal, merah delay.
   Dikelompokkan per HARI (Hari ini / Besok: kepala menempel berisi
   tanggal & jumlahnya); kepala panel meringkas semuanya dalam satu
   kalimat (notifRingkasan). Judul lengkap (notifJudul) tetap dibacakan
   pembaca layar. */
const NOTIF_JENIS_TAMPIL = {
  etd: { ikon: "bi-arrow-up-right", acuan: "ETD", label: () => tt("Berangkat", "Departs") },
  eta: { ikon: "bi-arrow-down-left", acuan: "ETA", label: () => tt("Tiba", "Arrives") },
  delivery: { ikon: "bi-truck", acuan: "Est. Delivery", label: () => tt("Dikirim ke pabrik", "Delivery to factory") },
};

function notifJudul(n) {
  const j = NOTIF_JENIS_TAMPIL[n.jenis];
  const kapan = n.hariIni ? tt("hari ini", "today") : tt("besok", "tomorrow");
  return `${j.label()} ${kapan} · ${j.acuan} ${fmtDate(n.tgl)}`;
}

// Nama pelabuhan yang terbaca ("Tanjung Priok", bukan IDTPP) -- sama dengan ujung garis rute papan
function notifPelabuhan(raw, s) {
  if (!hasMeaningfulValue(raw)) return "";
  return typeof pelabuhanPapan === "function" ? pelabuhanPapan(raw, s.transport).teks : String(raw).trim();
}

/* Judul kartu: apa yang terjadi + di mana. */
function notifAksi(n) {
  const s = n.s;
  if (n.jenis === "etd") {
    const asal = notifPelabuhan(s.origin, s);
    return asal ? tt(`Berangkat dari ${asal}`, `Departs ${asal}`) : tt("Berangkat", "Departs");
  }
  if (n.jenis === "eta") {
    const tujuan = notifPelabuhan(s.destination, s);
    return tujuan ? tt(`Tiba di ${tujuan}`, `Arrives at ${tujuan}`) : tt("Tiba", "Arrives");
  }
  return tt("Diantar ke pabrik", "Delivery to the factory");
}

/* Baris keterangan: arah lawannya (dari / menuju), angkutan & nomor
   dokumen angkutnya -- Delivery: dari pelabuhan, forwarder, kendaraan,
   kontainer. */
function notifMeta(n) {
  const s = n.s;
  if (n.jenis === "delivery") {
    const dari = notifPelabuhan(s.destination, s);
    return [dari ? tt(`Dari ${dari}`, `From ${dari}`) : "", s.forwarder, s.vehicleNo, kontainerKiriman(s)].filter(hasMeaningfulValue).join(" · ");
  }
  const lawan = n.jenis === "etd" ? notifPelabuhan(s.destination, s) : notifPelabuhan(s.origin, s);
  const arah = lawan ? (n.jenis === "etd" ? tt(`Menuju ${lawan}`, `To ${lawan}`) : tt(`Dari ${lawan}`, `From ${lawan}`)) : "";
  const angkut = carrierNameFromShipment(s);
  const bl = [s.houseBL, s.masterBL].find(hasMeaningfulValue) || "";
  return [arah, angkut, bl ? `${s.transport === "udara" ? "AWB" : "B/L"} ${bl}` : ""].filter(hasMeaningfulValue).join(" · ");
}

// Barang: dua nama pertama (tanpa kembar) + "+N lainnya"
function notifBarang(s) {
  const semua = typeof namaBarangUnik === "function" ? namaBarangUnik(s) : (s.items || []).map((it) => itemDisplayName(it)).filter(Boolean);
  if (!semua.length) return "";
  const sisa = semua.length - 2;
  return semua.slice(0, 2).join(", ") + (sisa > 0 ? " " + tt(`+${sisa} lainnya`, `+${sisa} more`) : "");
}

// Progres dokumen: { selesai, total, berikut } -- null untuk kurir tanpa PIB / tanpa tahap
function notifDokumen(s) {
  if (typeof docStepsFor !== "function" || (typeof isKurirNilaiRendah === "function" && isKurirNilaiRendah(s))) return null;
  const langkah = docStepsFor(s);
  let total = 0;
  let selesai = 0;
  langkah.forEach((st) => {
    const e = docStepEntri(s, st);
    if (e && e.skipped) return;
    total++;
    if (e) selesai++;
  });
  if (!total) return null;
  const idx = docNextIndex(s);
  return { selesai, total, berikut: idx >= 0 ? stepText(langkah[idx].label, s) : "" };
}

function notifDelayTeks(s) {
  if (effectiveStatus(s) !== "delayed") return "";
  const info = shipmentDelayInfo(s);
  return info && info.days > 0 ? tt(`Delay ${info.days} Hari`, `Delayed ${info.days} ${info.days === 1 ? "Day" : "Days"}`) : "Delay";
}

function notifItemHtml(n) {
  const s = n.s;
  const j = NOTIF_JENIS_TAMPIL[n.jenis];
  const delay = notifDelayTeks(s);
  const barang = notifBarang(s);
  const meta = notifMeta(n);
  const dok = notifDokumen(s);
  const dokTeks = dok
    ? dok.selesai === dok.total
      ? tt(`Dokumen lengkap ${dok.selesai}/${dok.total}`, `Documents complete ${dok.selesai}/${dok.total}`)
      : tt(`Dokumen ${dok.selesai}/${dok.total}`, `Documents ${dok.selesai}/${dok.total}`) + (dok.berikut ? " · " + tt(`Berikutnya: ${dok.berikut}`, `Next: ${dok.berikut}`) : "")
    : "";
  return `<button type="button" class="notif-item notif-item--${n.jenis}${n.dibaca ? "" : " is-baru"}${delay ? " is-telat" : ""}" data-notif-kunci="${escapeAttr(n.kunci)}" data-notif-jadwal="${escapeAttr(s.id)}" data-notif-jenis="${n.jenis}">
    <span class="notif-ikon notif-ikon--${n.jenis}${delay ? " notif-ikon--merah" : ""}" aria-hidden="true"><i class="bi ${j.ikon}"></i></span>
    <span class="notif-teks">
      <span class="visually-hidden">${escapeHtml(notifJudul(n))}: </span>
      <span class="notif-aksi">${escapeHtml(notifAksi(n))}</span>
      <span class="notif-pihak-baris">
        <span class="notif-pihak">${escapeHtml(dispVal(s.party))}</span>
        <span class="notif-buku">${s.mode === "export" ? "Export" : "Import"}</span>
        ${delay ? `<span class="notif-delay">${escapeHtml(delay)}</span>` : ""}
      </span>
      ${barang ? `<span class="notif-barang">${escapeHtml(barang)}</span>` : ""}
      ${meta ? `<span class="notif-meta">${escapeHtml(meta)}</span>` : ""}
      ${dok ? `<span class="notif-dok${dok.selesai === dok.total ? " is-lengkap" : ""}"><span class="notif-dok-meter" style="--isi:${Math.round((dok.selesai / dok.total) * 100)}%" aria-hidden="true"></span>${escapeHtml(dokTeks)}</span>` : ""}
      ${n.dulu ? `<span class="notif-ubah"><i class="bi bi-arrow-repeat" aria-hidden="true"></i> ${escapeHtml(tt(`Jadwal diubah dari ${fmtDate(n.dulu)}`, `Rescheduled from ${fmtDate(n.dulu)}`))}</span>` : ""}
    </span>
    ${n.dibaca ? "" : `<span class="notif-titik"><span class="visually-hidden">${escapeHtml(tt("Belum dibaca", "Unread"))}</span></span>`}
  </button>`;
}

/* Satu baris di kepala panel: "2 belum dibaca · 3 hari ini · 1 besok ·
   1 masa berlaku". Rinciannya per jenis ada di judul tiap kartu. */
function notifRingkasan(daftar) {
  const belum = daftar.filter((n) => !n.dibaca).length;
  const jadwal = daftar.filter((n) => n.jenis !== "masa");
  const hariIni = jadwal.filter((n) => n.hariIni).length;
  const besok = jadwal.length - hariIni;
  const masa = daftar.length - jadwal.length;
  return [
    belum ? tt(`${belum} belum dibaca`, `${belum} unread`) : tt("Semua sudah dibaca", "All read"),
    hariIni ? tt(`${hariIni} hari ini`, `${hariIni} today`) : "",
    besok ? tt(`${besok} besok`, `${besok} tomorrow`) : "",
    masa ? tt(`${masa} masa berlaku`, `${masa} expiring`) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function gambarPanelNotif() {
  const isi = document.getElementById("notifIsi");
  if (!isi) return;
  const belum = notifDaftar.filter((n) => !n.dibaca).length;
  const tombolSemua = document.getElementById("btnNotifBacaSemua");
  if (tombolSemua) tombolSemua.hidden = belum === 0;
  const ringkas = document.getElementById("notifRingkas");
  if (ringkas) {
    ringkas.textContent = notifDaftar.length ? notifRingkasan(notifDaftar) : "";
    ringkas.hidden = !notifDaftar.length;
  }
  if (!notifDaftar.length) {
    isi.innerHTML = `<div class="notif-kosong"><span class="notif-kosong-ikon" aria-hidden="true"><i class="bi bi-bell-slash"></i></span><p>${escapeHtml(
      tt(
        "Belum ada notifikasi. Jadwal yang berangkat, tiba, atau dikirim ke pabrik besok — serta SKB PPh & Masterlist yang masa berlakunya tinggal 2 bulan — akan muncul di sini.",
        "No notifications yet. Schedules departing, arriving or being delivered to the factory tomorrow — and an SKB PPh or Masterlist within 2 months of expiry — will appear here.",
      ),
    )}</p></div>`;
    return;
  }
  const jadwal = notifDaftar.filter((n) => n.jenis !== "masa");
  isi.innerHTML = notifMasaHtml(notifDaftar.filter((n) => n.jenis === "masa")) + [
    [tt("Hari ini", "Today"), jadwal.filter((n) => n.hariIni)],
    [tt("Besok", "Tomorrow"), jadwal.filter((n) => !n.hariIni)],
  ]
    .filter(([, daftar]) => daftar.length)
    .map(
      ([judul, daftar]) => `<section class="notif-hari" aria-label="${escapeAttr(`${judul} (${daftar.length})`)}">
        <h3 class="notif-kelompok"><span class="notif-kelompok-judul">${escapeHtml(judul)}</span><span class="notif-kelompok-tgl">${escapeHtml(fmtDateLong(daftar[0].tgl))}</span><span class="notif-kelompok-n">${daftar.length}</span></h3>
        ${
          /* Berangkat, tiba, lalu diantar ke pabrik; yang belum dibaca lebih dulu di tiap jenis */
          NOTIF_JENIS.flatMap((jenis) => daftar.filter((n) => n.jenis === jenis)).map(notifItemHtml).join("")
        }
      </section>`,
    )
    .join("");
}

function gambarLonceng() {
  const belum = notifDaftar.filter((n) => !n.dibaca).length;
  document.querySelectorAll("[data-notif-buka]").forEach((b) => {
    const lencana = b.querySelector(".notif-lencana");
    if (lencana) {
      lencana.textContent = belum > 99 ? "99+" : String(belum);
      lencana.hidden = belum === 0;
    }
    b.setAttribute(
      "aria-label",
      belum
        ? tt(`Notifikasi, ${belum} belum dibaca`, `Notifications, ${belum} unread`)
        : tt("Notifikasi", "Notifications"),
    );
    // Lonceng bergoyang sekali saat ada yang BARU, bukan tiap digambar ulang
    if (belum > notifBelumDibacaTerakhir) goyangLonceng(b);
  });
  notifBelumDibacaTerakhir = belum;
}

/* Lewat Web Animations, bukan kelas CSS yang dilepas-pasang: memulai
   ulang animasi kelas butuh membaca tata letak, dan ini terjadi tepat
   saat papan baru selesai digambar. */
function goyangLonceng(tombol) {
  const ikon = tombol.querySelector(".ic");
  if (!ikon || typeof ikon.animate !== "function") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ikon.animate(
    [
      { transform: "rotate(0)" },
      { transform: "rotate(16deg)" },
      { transform: "rotate(-13deg)" },
      { transform: "rotate(9deg)" },
      { transform: "rotate(-5deg)" },
      { transform: "rotate(0)" },
    ],
    { duration: 800, easing: "ease-in-out" },
  );
}

/* Dari render(): dikumpulkan & dijalankan SESUDAH gambar, sekali untuk
   serentetan render (mengetik di kotak cari, ganti halaman). */
let notifTunda = null;
function jadwalkanNotif() {
  clearTimeout(notifTunda);
  notifTunda = setTimeout(notifSegarkan, 120);
}

/* Hitung ulang & gambar. Lewat jadwalkanNotif() setiap data jadwal
   digambar ulang, berkala, dan saat tab kembali dilihat. */
function notifSegarkan() {
  if (typeof authState === "undefined" || !authState.user) return;
  if (typeof shipmentsLoaded !== "undefined" && !shipmentsLoaded) return;
  notifMuatMasaBerlaku();
  notifDaftar = hitungNotifMasa().concat(hitungNotifikasi());
  gambarLonceng();
  if (panelNotifTerbuka()) gambarPanelNotif();
}

/* ---------- panel ---------- */

function panelNotifTerbuka() {
  const p = document.getElementById("notifPanel");
  return !!(p && !p.hidden);
}

let notifPemicuTerakhir = null;
function bukaPanelNotif(pemicu) {
  const p = document.getElementById("notifPanel");
  if (!p) return;
  notifPemicuTerakhir = pemicu || null;
  // Di laci ponsel: tutup lacinya dulu supaya panelnya tidak tertutup
  if (typeof sbTutup === "function") sbTutup(false);
  notifSegarkan();
  gambarPanelNotif();
  p.hidden = false;
  document.querySelectorAll("[data-notif-buka]").forEach((b) => b.setAttribute("aria-expanded", "true"));
  p.focus({ preventScroll: true });
}

function tutupPanelNotif(kembalikanFokus) {
  const p = document.getElementById("notifPanel");
  if (!p || p.hidden) return;
  p.hidden = true;
  document.querySelectorAll("[data-notif-buka]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  // Lonceng yang sedang tersembunyi (bilah atas di desktop) diabaikan peramban saat difokus
  if (kembalikanFokus && notifPemicuTerakhir) notifPemicuTerakhir.focus({ preventScroll: true });
}

document.addEventListener("click", (e) => {
  const pemicu = e.target.closest("[data-notif-buka]");
  if (pemicu) {
    e.preventDefault();
    if (panelNotifTerbuka()) tutupPanelNotif(false);
    else bukaPanelNotif(pemicu);
    return;
  }
  if (e.target.closest("#btnNotifBacaSemua")) {
    tandaiNotifDibaca(notifDaftar.filter((n) => !n.dibaca).map((n) => n.kunci));
    return;
  }
  if (e.target.closest("#btnNotifTutup")) {
    tutupPanelNotif(true);
    return;
  }
  const item = e.target.closest("[data-notif-kunci]");
  if (item) {
    // Klik notifikasi: tandai dibaca, lalu buka detail jadwalnya / dokumennya
    tandaiNotifDibaca(item.dataset.notifKunci);
    tutupPanelNotif(false);
    const masa = item.dataset.notifMasa;
    if (masa === "masterlist") location.hash = "#/masterlist";
    else if (masa === "skb") {
      if (typeof skbBawaanBukaUbah === "function" && (typeof canEdit !== "function" || canEdit())) skbBawaanBukaUbah();
    } else openDetailView(item.dataset.notifJadwal);
    return;
  }
  // Klik di luar panel menutupnya
  if (panelNotifTerbuka() && !e.target.closest("#notifPanel")) tutupPanelNotif(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panelNotifTerbuka()) {
    e.preventDefault();
    tutupPanelNotif(true);
  }
});

// Berkala + saat tab kembali dilihat: hari bisa berganti saat aplikasi terbuka terus
setInterval(notifSegarkan, NOTIF_SEGAR_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") notifSegarkan();
});
