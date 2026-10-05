/* ==================================================================
   AMBIL KURS PAJAK MINGGUAN -> data/kurs-pajak.json

   Dijalankan GitHub Actions tiap Rabu 05.00 WIB (.github/workflows/
   kurs-pajak.yml), dengan --pekan-ini. KMK kurs pajak baru berlaku tiap Rabu, untuk satu
   pekan (Rabu-Selasa). Halaman dibaca langsung (scraping) -- tanpa API
   dan tanpa kunci apa pun. Aplikasi membaca berkas JSON-nya dari situs
   yang sama, jadi tidak ada masalah CORS.

   node scripts/ambil-kurs-pajak.mjs                 periode yang berlaku
   node scripts/ambil-kurs-pajak.mjs --sejak 2025-01-01
       ikut mengisi riwayat mundur sampai tanggal itu (per pekan), lewat
       pemilih tanggal di halaman yang sama (?date=YYYY-MM-DD).
================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parseKursPajak, gabungPeriode, tanggalWib, periodeMencakup } = require("./kurs-pajak-parser.js");

const URL_KURS = "https://fiskal.kemenkeu.go.id/informasi-publik/kurs-pajak";
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BERKAS = path.join(AKAR, "data", "kurs-pajak.json");
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

function baca() {
  try {
    return JSON.parse(readFileSync(BERKAS, "utf8"));
  } catch {
    return { sumber: URL_KURS, periode: [] };
  }
}

async function ambil(tanggal) {
  const url = tanggal ? `${URL_KURS}?date=${tanggal}` : URL_KURS;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (EXIM-DDI weekly tax-rate reader)", Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
  return parseKursPajak(await res.text());
}

const isoHari = (d) => d.toISOString().slice(0, 10);

async function main() {
  const data = baca();
  /* --pekan-ini (jalan terjadwal Rabu 05.00 WIB): kurs yang terbaca HARUS
     berlaku hari ini. Kalau situs Kemenkeu masih menampilkan pekan lalu,
     coba lagi tiap 30 menit, paling banyak 4 kali (2 jam), lalu berhenti
     dengan galat -- berkas lama tidak disentuh. */
  const wajibPekanIni = process.argv.includes("--pekan-ini");
  const hariIni = tanggalWib();
  let kini = await ambil("");
  for (let coba = 1; wajibPekanIni && !periodeMencakup(kini, hariIni); coba++) {
    if (coba > 4) {
      throw new Error(`kurs pajak untuk ${hariIni} belum terbit (situs masih ${kini.mulai} s.d. ${kini.sampai}); jalankan ulang workflow ini nanti`);
    }
    console.log(`Situs masih memuat ${kini.mulai} s.d. ${kini.sampai}; coba lagi 30 menit lagi (${coba}/4)...`);
    await tunggu(30 * 60 * 1000);
    kini = await ambil("");
  }
  data.periode = gabungPeriode(data.periode, kini);
  console.log(`Periode berlaku: ${kini.mulai} s.d. ${kini.sampai} (KMK ${kini.kmk}) USD ${kini.kurs.USD}`);

  const i = process.argv.indexOf("--sejak");
  const sejak = i > 0 ? process.argv[i + 1] : "";
  if (sejak) {
    // Mundur per pekan dari periode berlaku sampai tanggal `sejak`
    let d = new Date(kini.mulai + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7);
    while (isoHari(d) >= sejak) {
      const tgl = isoHari(d);
      if (!data.periode.some((p) => p.mulai <= tgl && tgl <= p.sampai)) {
        await tunggu(1500); // sopan: satu permintaan tiap 1,5 detik
        try {
          const p = await ambil(tgl);
          if (!(p.mulai <= tgl && tgl <= p.sampai)) {
            console.log(`Pemilih tanggal tidak mengembalikan periode ${tgl} -- pengisian riwayat dihentikan.`);
            break;
          }
          data.periode = gabungPeriode(data.periode, p);
          console.log(`  ${p.mulai} s.d. ${p.sampai} USD ${p.kurs.USD}`);
        } catch (e) {
          console.log(`  ${tgl}: ${e.message}`);
        }
      }
      d.setUTCDate(d.getUTCDate() - 7);
    }
  }
  data.sumber = URL_KURS;
  data.diperbarui = new Date().toISOString();
  data.periode = data.periode.slice(0, 520); // 10 tahun cukup
  mkdirSync(path.dirname(BERKAS), { recursive: true });
  writeFileSync(BERKAS, JSON.stringify(data, null, 2) + "\n");
}

main().catch((e) => {
  console.error("Gagal membaca kurs pajak:", e.message);
  process.exit(1); // berkas lama tidak disentuh
});
