"use strict";

/* ==================================================================
   BLOK LAPORAN BUKU BESAR -- tabel, grafik, dan kalimat dari hasil
   fund-report-ledger.js.

   Seperti seluruh laporan: BERBAHASA INGGRIS (dikirim ke kantor pusat),
   tabelnya disusun sebagai DATA (judul, kepala, baris, kaki) yang sama
   untuk layar dan Excel. Memakai pembantu fund-report.js (sel, lapFmtUang,
   grafik SVG, ...) yang baru dipanggil saat laporan digambar, bukan saat
   berkas dimuat -- urutan muat berkas tidak menjadi masalah.
================================================================== */

const lapPc = (x, d) => (x == null || !isFinite(x) ? "—" : (x * 100).toFixed(d == null ? 1 : d) + "%");
const lapTgl = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${Number(m[3])} ${lapBulanPendek(Number(m[2]))} ${m[1]}` : "—";
};
const lapJamak = (n, satu, banyak) => `${n} ${n === 1 ? satu : banyak || satu + "s"}`;

/* Jalur pengeluaran Bea Cukai, dalam bahasa laporan (label aplikasi
   mengikuti bahasa pengguna; laporan selalu Inggris). */
const LAP_JALUR_BC = { mita: "MITA (priority)", hijau: "Green", merah: "Red" };

/* Arti tiap status rekonsiliasi bea & pajak, dalam bahasa pembaca. */
const LAP_ARTI_BEA = {
  "Matched": "Payment equals the PIB within the tolerance",
  "Paid more than PIB": "Billing is higher than the PIB: duplicate payment, a second PIB on the same BL, or an amended PIB",
  "Paid less than PIB": "Billing is lower than the PIB: partial payment, or a request still to be made",
  "PIB, no payment request": "Duties are assessed, but no Billing / Tax Advance request mentions this BL/AWB",
  "Payment, no PIB amounts": "Money was paid, but the shipment has no BM / PPN / PPh amounts in Customs & Charges",
};

/* Satu kalimat tafsir untuk satu hubungan korelasi -- tidak mengklaim
   yang tidak didukung datanya: hubungan dari titik yang terlalu sedikit
   disebut belum meyakinkan. */
function lapTafsirKorelasi(c) {
  const arah = c.r >= 0 ? "positive" : "negative";
  if (!c.signifikan) {
    return c.n < 8
      ? `A ${c.kekuatan} ${arah} pattern so far, but ${c.n} points are too few to rely on.`
      : `No reliable relationship in ${c.n} points (r = ${c.r.toFixed(2)}).`;
  }
  const naik = c.slope >= 0 ? "adds" : "removes";
  const besar = Math.abs(c.slope);
  const tetap = (per) => (c.intercept > 0 ? ` Fixed part ≈ ${lapFmtUang(c.intercept)} per ${per}.` : "");
  let isi = "";
  if (c.id.indexOf("berat:") === 0) isi = `Each extra kg ${naik} ≈ ${lapFmtRp(besar)} of service cost.${tetap("shipment")}`;
  else if (c.id === "nilai:import") isi = `Each IDR 100 of goods value ${naik} ≈ IDR ${(besar * 100).toFixed(2)} of service cost.`;
  else if (c.id === "dwell:storage") isi = `Each extra day between arrival and SPPB ${naik} ≈ ${lapFmtRp(besar)} of storage cost.`;
  else if (c.id === "bulan:pendapatan") isi = `Each IDR 100 of monthly revenue goes with ≈ IDR ${(c.slope * 100).toFixed(2)} of EXIM spending.${tetap("month")}`;
  return `${c.kekuatan.charAt(0).toUpperCase()}${c.kekuatan.slice(1)} ${arah} relationship: ${lapPc(c.r2, 0)} of the variation is explained. ${isi}`.trim();
}

/* ---------------------------- kalimat "In short" ---------------------------- */

function lapWawasanBuku(a) {
  const L = a.ledger;
  const out = [];
  const per = `Jan–${lapBulanPendek(a.M)} ${a.Y}`;
  const J = L.jembatan.total;
  if (J.kas) {
    const kotor = J.kas + J.tahan;
    out.push(`Of ${lapFmtUang(kotor)} billed ${per} (before PPh 23 withholding), ${lapFmtUang(J.biaya)} (${lapPc(kotor ? J.biaya / kotor : null, 0)}) is true cost and ${lapFmtUang(J.pulih)} (${lapPc(kotor ? J.pulih / kotor : null, 0)}) is creditable tax paid in advance — a receivable from the tax office, not an expense. HQ funded ${lapFmtUang(J.kas)} in cash.`);
  }
  const impor = L.ekonomi.jalur.filter((g) => /Import$/.test(g.nama) && g.nilai > 0);
  if (impor.length) {
    const s = (f) => impor.reduce((x, g) => x + g[f], 0);
    out.push(`Imports: logistics and import duty add ${lapPc(s("biaya") / s("nilai"), 2)} to goods value across ${lapJamak(s("berbiaya"), "shipment")} with costs recorded (duty alone ${lapPc(s("bm") / s("nilai"), 2)}).`);
  }
  const c = L.ekonomi.cocok;
  if (c.tertaut) {
    out.push(`Exports: logistics cost is ${lapPc(c.persen, 2)} of the revenue of the same ${lapJamak(c.tertaut, "shipment")}${c.kasus > c.tertaut ? `; ${c.kasus - c.tertaut} more with costs have no linked invoice` : ""}.`);
  }
  const R = L.rekon;
  if (R.baris.length) {
    const cocok = R.baris.filter((b) => b.status === "Matched").length;
    out.push(cocok === R.baris.length
      ? `Duties & taxes: all ${R.baris.length} import shipments reconcile to the PIB.`
      : `Duties & taxes: ${cocok} of ${R.baris.length} import shipments reconcile to the PIB; ${R.masalah.length} need review (net difference ${lapFmtUang(R.masalah.reduce((x, b) => x + b.selisih, 0))}).`);
  }
  const H = L.hutang;
  if (H.penutup.jumlah) {
    out.push(`Payables at ${lapTgl(H.acuan)}: ${lapFmtUang(H.penutup.nilai)} (${lapJamak(H.penutup.jumlah, "request")})${H.terlambat.jumlah ? `, of which ${lapFmtUang(H.terlambat.nilai)} is overdue (oldest ${H.terlambat.tertua} days)` : ", none overdue"}.${H.disiplin.persenTepat != null ? ` ${lapPc(H.disiplin.persenTepat, 0)} of this year's payments were on time.` : ""}`);
  }
  const K = L.kontrol;
  if (K.butir.length) {
    out.push(`Data quality: ${lapPc(K.persenTaut, 0)} of cash is linked to a shipment; ${K.jumlahReview === 0 ? "all checks passed" : `${K.jumlahReview} of ${K.butir.length} checks need review`} (see Controls).`);
  }
  return out;
}

/* ---------------------------- kartu indikator ---------------------------- */

function lapKartuBuku(a) {
  const L = a.ledger;
  const J = L.jembatan.total;
  const impor = L.ekonomi.jalur.filter((g) => /Import$/.test(g.nama) && g.nilai > 0);
  const nilai = impor.reduce((x, g) => x + g.nilai, 0);
  const biaya = impor.reduce((x, g) => x + g.biaya, 0);
  const bm = impor.reduce((x, g) => x + g.bm, 0);
  const H = L.hutang;
  const sub = (teks, kelas) => `<span class="lap-kpi-banding${kelas ? " " + kelas : ""}">${escapeHtml(teks)}</span>`;
  return {
    kas: {
      k: `Cash requested · Jan–${lapBulanPendek(a.M)} ${a.Y}`,
      v: J.kas ? lapFmtUang(J.kas) : "—",
      s: sub(J.kas ? `true cost ${lapFmtUang(J.biaya)} · creditable tax ${lapFmtUang(J.pulih)}` : "no requests"),
    },
    landed: {
      k: "Import landed-cost add-on",
      v: nilai ? lapPc(biaya / nilai, 2) : "—",
      s: sub(nilai ? `of goods value · duty ${lapPc(bm / nilai, 2)} · ${lapJamak(impor.reduce((x, g) => x + g.berbiaya, 0), "shipment")}` : "no import costs linked yet"),
    },
    hutang: {
      k: `Payables · ${lapTgl(H.acuan)}`,
      v: H.penutup.jumlah ? lapFmtUang(H.penutup.nilai) : "—",
      s: sub(H.terlambat.jumlah ? `${lapFmtUang(H.terlambat.nilai)} overdue · oldest ${H.terlambat.tertua} days` : H.penutup.jumlah ? "none overdue" : "nothing outstanding", H.terlambat.jumlah ? "lap-naik" : ""),
    },
  };
}

/* ---------------------------- grafik tambahan ---------------------------- */

/* Kata panjang dipecah dua baris supaya label sumbu tidak saling tindih. */
function lapPecahLabel(teks, maks) {
  const batas = maks || 16;
  const kata = String(teks).split(" ");
  const baris = [];
  let cur = "";
  kata.forEach((k) => {
    if ((cur + " " + k).trim().length > batas && cur) {
      baris.push(cur);
      cur = k;
    } else {
      cur = (cur + " " + k).trim();
    }
  });
  if (cur) baris.push(cur);
  return baris.slice(0, 3);
}

/* Air terjun (waterfall): batang "total" mulai dari nol; batang lain
   melayang dari posisi berjalan. langkah: [{ nama, nilai, total? }]. */
function lapSvgAir(judul, langkah, satuan) {
  const { W, H } = LAP_GRAFIK;
  const kiri = 78, kanan = W - 24, atas = 92, bawah = 86;
  let jalan = 0;
  const bar = langkah.map((l) => {
    if (l.total) {
      jalan = l.nilai;
      return Object.assign({}, l, { dari: 0, ke: l.nilai });
    }
    const dari = jalan;
    jalan += l.nilai;
    return Object.assign({}, l, { dari, ke: jalan });
  });
  const maks = Math.max(1e-9, ...bar.flatMap((b) => [b.dari, b.ke])) * 1.14;
  const y = (v) => H - bawah - ((H - bawah - atas) * v) / maks;
  const lebarGrup = (kanan - kiri) / bar.length;
  const lb = Math.min(120, lebarGrup * 0.6);
  const isi = bar.map((b, i) => {
    const x = kiri + i * lebarGrup + (lebarGrup - lb) / 2;
    const tinggi = Math.max(2, Math.abs(y(b.dari) - y(b.ke)));
    const puncak = y(Math.max(b.dari, b.ke));
    const warna = b.total ? LAP_WARNA.ini : b.nilai >= 0 ? "#d97706" : "#0d9488";
    const teks = (b.total ? "" : b.nilai >= 0 ? "+" : "−") + lapLabelNilai(Math.abs(b.nilai));
    const garis = i < bar.length - 1 ? `<line x1="${(x + lb).toFixed(1)}" x2="${(x + lebarGrup).toFixed(1)}" y1="${y(b.ke).toFixed(1)}" y2="${y(b.ke).toFixed(1)}" stroke="#94a3b8" stroke-dasharray="4 3"/>` : "";
    const nama = lapPecahLabel(b.nama, 18).map((baris, n) => `<text x="${(x + lb / 2).toFixed(1)}" y="${H - bawah + 24 + n * 17}" font-size="13" text-anchor="middle" fill="#334155">${escapeHtml(baris)}</text>`).join("");
    return `<rect x="${x.toFixed(1)}" y="${puncak.toFixed(1)}" width="${lb.toFixed(1)}" height="${tinggi.toFixed(1)}" rx="2" fill="${warna}"/>` +
      `<text x="${(x + lb / 2).toFixed(1)}" y="${(puncak - 7).toFixed(1)}" font-size="14" font-weight="600" text-anchor="middle" fill="#0f172a">${teks}</text>${garis}${nama}`;
  }).join("");
  return lapSvgKerangka(judul, lapSvgSumbu(maks, y, kiri, kanan, 0) + isi, "", satuan);
}

/* Batang per kategori (umur hutang, dst.): satu deret, nama di bawah. */
function lapSvgKategori(judul, nama, nilai, warna, satuan) {
  const { W, H } = LAP_GRAFIK;
  const kiri = 78, kanan = W - 24, atas = 92, bawah = 76;
  const maks = Math.max(1e-9, ...nilai.map((v) => v || 0)) * 1.14;
  const y = (v) => H - bawah - ((H - bawah - atas) * v) / maks;
  const lebarGrup = (kanan - kiri) / nama.length;
  const lb = Math.min(110, lebarGrup * 0.6);
  const isi = nama.map((n, i) => {
    const v = nilai[i] || 0;
    const x = kiri + i * lebarGrup + (lebarGrup - lb) / 2;
    const tinggi = Math.max(0, H - bawah - y(v));
    const label = v > 0 ? `<text x="${(x + lb / 2).toFixed(1)}" y="${(y(v) - 7).toFixed(1)}" font-size="14" font-weight="600" text-anchor="middle" fill="#0f172a">${lapLabelNilai(v)}</text>` : "";
    const nm = lapPecahLabel(n, 16).map((baris, k) => `<text x="${(x + lb / 2).toFixed(1)}" y="${H - bawah + 24 + k * 17}" font-size="13" text-anchor="middle" fill="#334155">${escapeHtml(baris)}</text>`).join("");
    return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${lb.toFixed(1)}" height="${tinggi.toFixed(1)}" rx="2" fill="${(warna && warna[i]) || LAP_WARNA.ini}"/>${label}${nm}`;
  }).join("");
  return lapSvgKerangka(judul, lapSvgSumbu(maks, y, kiri, kanan, 0) + isi, "", satuan);
}

const lapAngkaSumbu = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + " bn";
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + " m";
  if (a >= 1e4) return (v / 1e3).toFixed(0) + "k";
  return a >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 10) / 10);
};

/* Nama sumbu tiap hubungan korelasi. */
const LAP_SUMBU_KORELASI = {
  "nilai:import": ["Goods value (IDR)", "Service cost (IDR)"],
  "dwell:storage": ["Days from arrival to SPPB", "Storage cost (IDR)"],
  "bulan:pendapatan": ["Monthly revenue (IDR)", "Monthly EXIM spending (IDR)"],
};
const lapSumbuKorelasi = (c) => LAP_SUMBU_KORELASI[c.id] || ["Gross weight (kg)", "Service cost (IDR)"];

/* Diagram sebar + garis regresi: setiap titik satu kiriman / bulan. */
function lapSvgSebar(judul, c, namaX, namaY, satuan) {
  const { W, H } = LAP_GRAFIK;
  const kiri = 96, kanan = W - 28, atas = 92, bawah = 62;
  const xs = c.titik.map((p) => p[0]);
  const ys = c.titik.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  /* Sumbu biaya mulai dari nol (bukan dari ujung garis regresi, yang bisa
     jatuh di bawah nol karena bagian tetapnya negatif); garisnya yang
     dipotong di batas sumbu. */
  const y1 = Math.max(...ys) * 1.12;
  const y0 = Math.min(0, ...ys);
  let xa = x0, xb = x1;
  if (c.slope) {
    const kena = [(y0 - c.intercept) / c.slope, (y1 - c.intercept) / c.slope].sort((p, q) => p - q);
    xa = Math.max(x0, kena[0]);
    xb = Math.min(x1, kena[1]);
  }
  const ujung = [c.intercept + c.slope * xa, c.intercept + c.slope * xb];
  const px = (v) => kiri + ((kanan - kiri) * (v - x0)) / (x1 - x0 || 1);
  const py = (v) => H - bawah - ((H - bawah - atas) * (v - y0)) / (y1 - y0 || 1);
  const sumbu = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const vy = y0 + (y1 - y0) * f;
    const vx = x0 + (x1 - x0) * f;
    return `<line x1="${kiri}" x2="${kanan}" y1="${py(vy).toFixed(1)}" y2="${py(vy).toFixed(1)}" stroke="#e2e8f0"/>` +
      `<text x="${kiri - 10}" y="${(py(vy) + 5).toFixed(1)}" font-size="13" text-anchor="end" fill="#64748b">${lapAngkaSumbu(vy)}</text>` +
      `<text x="${px(vx).toFixed(1)}" y="${H - bawah + 22}" font-size="13" text-anchor="middle" fill="#64748b">${lapAngkaSumbu(vx)}</text>`;
  }).join("");
  const titik = c.titik.map((p) => `<circle cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="6" fill="${LAP_WARNA.ini}" fill-opacity="0.65"/>`).join("");
  const garis = xa <= xb ? `<line x1="${px(xa).toFixed(1)}" y1="${py(ujung[0]).toFixed(1)}" x2="${px(xb).toFixed(1)}" y2="${py(ujung[1]).toFixed(1)}" stroke="${LAP_WARNA.ramal}" stroke-width="3"/>` : "";
  const ket = `<text x="${kanan}" y="64" font-size="15" text-anchor="end" fill="#334155">r = ${c.r.toFixed(2)} · R² = ${lapPc(c.r2, 0)} · n = ${c.n}${c.signifikan ? "" : " · not reliable yet"}</text>`;
  const label = `<text x="${(kiri + kanan) / 2}" y="${H - 10}" font-size="14" text-anchor="middle" fill="#334155">${escapeHtml(namaX)}</text>` +
    `<text x="16" y="${(atas + H - bawah) / 2}" font-size="14" text-anchor="middle" fill="#334155" transform="rotate(-90 16 ${(atas + H - bawah) / 2})">${escapeHtml(namaY)}</text>`;
  return lapSvgKerangka(judul, sumbu + garis + titik + ket + label, "", satuan);
}

function lapGrafikBuku(a) {
  const L = a.ledger;
  const S = L.jembatan.sifat;
  const J = L.jembatan.total;
  const jt = lapJuta;
  const per = `Jan–${lapBulanPendek(a.M)} ${a.Y}`;
  const langkah = [{ nama: "Cash requested", nilai: jt(J.kas), total: true }];
  if (S.pph23) langkah.push({ nama: "PPh 23 withheld", nilai: jt(S.pph23) });
  if (S.ppnJasa) langkah.push({ nama: "Input VAT on services", nilai: -jt(S.ppnJasa) });
  if (S.ppnImpor) langkah.push({ nama: "Import VAT (PPN)", nilai: -jt(S.ppnImpor) });
  if (S.pph22) langkah.push({ nama: "PPh 22 import", nilai: -jt(S.pph22) });
  langkah.push({ nama: "True cost", nilai: jt(J.biaya), total: true });
  const umur = L.hutang.umur;
  const warnaUmur = ["#0d9488", "#f59e0b", "#d97706", "#c2410c", "#991b1b", "#94a3b8"];
  // Diagram sebar: hubungan yang meyakinkan lebih dulu, lalu yang titiknya paling banyak; maksimal dua
  const sebar = L.penggerak.korelasi.filter((c) => c.titik.length >= 5)
    .sort((x, y) => (y.signifikan ? 1 : 0) - (x.signifikan ? 1 : 0) || y.n - x.n || y.r2 - x.r2).slice(0, 2);
  return {
    jembatan: J.kas ? lapSvgAir(`From cash requested to true cost — ${per}`, langkah, "IDR million") : null,
    umurHutang: L.hutang.penutup.jumlah ? lapSvgKategori(`Payables by days past due — ${lapTgl(L.hutang.acuan)}`, umur.map((u) => u.nama), umur.map((u) => jt(u.nilai)), warnaUmur, "IDR million") : null,
    sebar: sebar.map((c) => lapSvgSebar(c.nama, c, lapSumbuKorelasi(c)[0], lapSumbuKorelasi(c)[1], c.id === "bulan:pendapatan" ? "each dot is one month" : "each dot is one shipment")),
  };
}

/* ---------------------------- blok tabel ---------------------------- */

function lapBlokBuku(a) {
  const L = a.ledger;
  const Y = a.Y;
  const M = a.M;
  const per = `Jan–${lapBulanPendek(M)} ${Y}`;
  const nama = (j) => (j === "Lainnya" ? "Other" : j);
  const B = {};

  /* ---- 1. jembatan kas -> biaya ---- */
  const J = L.jembatan;
  const T = J.total;
  B.jembatan = {
    judul: "From cash requested to true cost",
    sub: `${per} · all expense types, regardless of the filter above`,
    kepala: ["Expense type", "Requests", "Cash requested", "+ PPh 23 withheld", "= Billed amount", "− Creditable taxes", "= True cost", "Share of true cost"],
    baris: J.baris.map((r) => [sel(nama(r.jenis)), sel(r.jumlah, "n"), sel(r.kas, "jt"), sel(r.tahan, "jt"), sel(r.kas + r.tahan, "jt"), sel(r.pulih, "jt"), sel(r.biaya, "jt"), sel(T.biaya ? r.biaya / T.biaya : null, "pct")]),
    kaki: [sel("Total"), sel(T.jumlah, "n"), sel(T.kas, "jt"), sel(T.tahan, "jt"), sel(T.kas + T.tahan, "jt"), sel(T.pulih, "jt"), sel(T.biaya, "jt"), sel(T.biaya ? 1 : 0, "pct")],
    catatan: "Cash requested is what leaves the company's accounts, not what the shipment costs. PPh 23 is withheld from the vendor and remitted by the company by the 10th of the next month (a liability). Input VAT, import VAT (PPN) and PPh 22 are creditable and come back through the VAT return and corporate tax (a receivable). True cost is what is left: service expenses, plus import duty (BM) that is capitalised into the cost of the goods (PSAK 14 / IAS 2).",
  };
  const S = J.sifat;
  const sifatBaris = [
    ["Logistics services (freight, storage, other)", S.jasa, "Expense — cost of the shipment"],
    ["Import duty (BM)", S.bm, "Capitalised into cost of goods (landed cost)"],
    ["Other duty-related (fines, PPnBM, forwarder fees)", S.lainPajak, "Expense"],
    ["VAT on services (input VAT)", S.ppnJasa, "Creditable — receivable from the tax office"],
    ["Import VAT (PPN impor)", S.ppnImpor, "Creditable — receivable from the tax office"],
    ["PPh 22 on imports", S.pph22, "Prepaid income tax — credited against corporate tax"],
    ["PPh 23 withheld from vendors", -S.pph23, "Liability — remit to the tax office by the 10th of next month"],
  ].filter((r) => r[1]);
  B.jembatanSifat = {
    judul: "What the cash pays for",
    sub: `${per} · accounting treatment`,
    kepala: ["Component", "Amount", "Share of cash", "Accounting treatment"],
    baris: sifatBaris.map((r) => [sel(r[0]), sel(r[1], "jt"), sel(T.kas ? r[1] / T.kas : null, "pct"), sel(r[2], "txt", { teks: true })]),
    kaki: [sel("Cash requested"), sel(T.kas, "jt"), sel(T.kas ? 1 : 0, "pct"), sel("")],
  };
  const bulanAda = J.bulan.map((b, i) => ({ b, i })).filter((x) => x.b.jumlah > 0);
  B.jembatanBulan = {
    judul: "Cash vs true cost by month",
    sub: "by vendor invoice date",
    kepala: ["Month", "Requests", "Cash requested", "Creditable taxes", "PPh 23 withheld", "True cost", "True cost ÷ cash"],
    baris: bulanAda.map(({ b, i }) => [sel(lapNamaBulan(i + 1)), sel(b.jumlah, "n"), sel(b.kas, "jt"), sel(b.pulih, "jt"), sel(b.tahan, "jt"), sel(b.biaya, "jt"), sel(b.kas ? b.biaya / b.kas : null, "pct")]),
    kaki: [sel(`Total ${per}`), sel(T.jumlah, "n"), sel(T.kas, "jt"), sel(T.pulih, "jt"), sel(T.tahan, "jt"), sel(T.biaya, "jt"), sel(T.kas ? T.biaya / T.kas : null, "pct")],
    catatan: "HQ funds the cash column; only the true-cost column belongs in the shipment's cost. A month with heavy import duties shows a low true-cost ÷ cash ratio because most of the cash is creditable tax.",
  };

  /* ---- 2. ekonomi kiriman ---- */
  const E = L.ekonomi;
  const barisEko = (g, tebal) => {
    const o = tebal ? { b: true } : undefined;
    return [sel(g.nama, "txt", o), sel(g.kasus, "n", o), sel(g.berbiaya, "n", o), sel(g.nilai, "jt", o), sel(g.jasa, "jt", o), sel(g.bm, "jt", o), sel(g.lainPajak, "jt", o), sel(g.biaya, "jt", o), sel(g.persen, "pct2", o), sel(g.perKasus, "jt", o), sel(g.perKg, "rp", o)];
  };
  // Impor lalu ekspor; subtotal per arah (bukan satu Total: nilai pabean impor dan penjualan ekspor tidak dijumlah)
  const barisEkonomi = [];
  [["import", /Import$/], ["export", /Export$/]].forEach(([arah, pola]) => {
    const isi = E.jalur.filter((g) => pola.test(g.nama));
    isi.forEach((g) => barisEkonomi.push(barisEko(g)));
    if (isi.length > 1) barisEkonomi.push(barisEko(E.arah[arah], true));
  });
  B.ekonomi = {
    judul: "Landed cost and cost ratio per shipment",
    sub: `${per} · shipments grouped by PIB / PEB date`,
    kepala: ["Lane", "Shipments", "With costs", "Goods value / revenue", "Services", "Import duty (BM)", "Other duty-related", "Total cost", "% of value", "Avg per shipment", "Service cost per kg (GW)"],
    baris: barisEkonomi,
    catatan: `Every cost linked to a shipment is counted, even when it was invoiced in another month (matching principle). Goods value is the customs value for imports and the linked invoice for exports, so imports and exports are subtotalled separately and never added together. The % of value only uses shipments that already have costs, so unbilled shipments (${E.tanpaBiaya} in this period) do not flatter the ratio. Import VAT and PPh 22 are creditable and left out. Cost per kg is shown per lane only: sea and air rates are not comparable.`,
  };
  B.ekonomiSyarat = {
    judul: "Cost ratio by trade terms",
    sub: `${per} · shipments with costs`,
    kepala: ["Direction · terms group", "Shipments", "Goods value / revenue", "Total cost", "% of value", "Avg per shipment"],
    baris: E.syarat.map((g) => [sel(g.nama), sel(g.berbiaya, "n"), sel(g.nilai, "jt"), sel(g.biaya, "jt"), sel(g.persen, "pct2"), sel(g.perKasus, "jt")]),
    catatan: "Terms groups: E = ex-works, F = free carrier / FOB, C = CIF / CFR (seller pays main carriage), D = delivered. Under C and D terms the seller pays the main freight, so an exporter's cost ratio is expected to be higher than under F terms, and an importer's lower.",
  };
  B.eksporPelanggan = {
    judul: "Export customers — revenue vs logistics cost of the same shipments",
    sub: per,
    kepala: ["Customer", "Shipments", "Revenue", "Logistics cost", "Cost % of revenue", "Revenue after logistics"],
    baris: E.pelanggan.map((g) => [sel(g.nama), sel(g.kasus, "n"), sel(g.pendapatan, "jt"), sel(g.biaya, "jt"), sel(g.persen, "pct2"), sel(g.sisa, "jt")]),
    kaki: E.cocok.tertaut ? [sel("Total"), sel(E.cocok.tertaut, "n"), sel(E.cocok.pendapatan, "jt"), sel(E.cocok.biaya, "jt"), sel(E.cocok.persen, "pct2"), sel(E.cocok.pendapatan - E.cocok.biaya, "jt")] : null,
    catatan: `Matched on the shipment the invoice is linked to, not on the customer's typed name. ${E.cocok.kasus > E.cocok.tertaut ? `${E.cocok.kasus - E.cocok.tertaut} export shipment(s) with costs have no linked invoice and are excluded. ` : ""}Revenue after logistics is not profit: product cost and other overheads are not in this data.`,
  };

  /* ---- 3. bea & pajak ---- */
  const R = L.rekon;
  B.bea = {
    judul: "Duties & taxes: PIB vs payment",
    sub: `${per} · import shipments · tolerance IDR ${R.toleransi.toLocaleString("en-US")}`,
    kepala: ["Result", "Shipments", "PIB assessed", "Paid (Billing / Tax Advance)", "Difference", "What it means"],
    baris: R.ringkas.filter((r) => r.jumlah).map((r) => [sel(r.nama, "txt", { b: r.nama !== "Matched" }), sel(r.jumlah, "n"), sel(r.pib, "jt"), sel(r.bayar, "jt"), sel(r.selisih, "jt"), sel(LAP_ARTI_BEA[r.nama], "txt", { teks: true })]),
    kaki: R.baris.length ? [sel("Total"), sel(R.baris.length, "n"), sel(R.baris.reduce((x, b) => x + b.pib, 0), "jt"), sel(R.bayarTotal, "jt"), sel(R.baris.reduce((x, b) => x + b.selisih, 0), "jt"), sel("")] : null,
    catatan: `PIB amounts come from Customs & Charges on each schedule; payments from Billing and Tax Advance requests that name the same BL/AWB. ${R.beban != null ? `Duties and taxes assessed are ${lapPc(R.beban, 2)} of the customs value (import duty ${lapPc(R.bebanBm, 2)}); the PPN and PPh 22 part is creditable, so it ties up cash rather than adding cost.` : ""}`,
  };
  const urutSelisih = R.masalah.slice().sort((x, y) => Math.abs(y.selisih) - Math.abs(x.selisih));
  B.beaDaftar = {
    judul: "Duty exceptions to review",
    sub: "largest differences first",
    kepala: ["Shipment", "BL/AWB", "PIB date", "PIB assessed", "Paid", "Difference", "Result"],
    baris: urutSelisih.slice(0, 10)
      .map((b) => [sel(b.k.pihak || b.k.id), sel(b.k.blAwb || "—"), sel(lapTgl(b.k.tanggal)), sel(b.pib, "jt"), sel(b.bayar, "jt"), sel(b.selisih, "jt", { kelas: "lap-naik" }), sel(b.status)]),
    catatan: R.masalah.length > 10 ? `Showing 10 of ${R.masalah.length}; every import shipment is listed on the Duties & Taxes sheet of the Excel file.` : "",
  };
  // Excel: semua kiriman impor, komponen demi komponen -- PIB vs yang dibayar
  B.beaRinci = {
    judul: "Duties & taxes by import shipment — PIB vs payment, component by component",
    sub: `${per} · IDR`,
    kepala: ["Shipment", "BL/AWB", "PIB date", "PIB: BM", "PIB: PPN", "PIB: PPh", "PIB total", "Paid: BM", "Paid: PPN", "Paid: PPh 22", "Paid to state", "Difference", "Result"],
    baris: R.baris.slice().sort((x, y) => (x.k.tanggal < y.k.tanggal ? -1 : 1))
      .map((b) => [sel(b.k.pihak || b.k.id), sel(b.k.blAwb || "—"), sel(lapTgl(b.k.tanggal)), sel(b.k.pib.bm, "rp"), sel(b.k.pib.ppn, "rp"), sel(b.k.pib.pph, "rp"), sel(b.pib, "rp"),
        sel(b.bm, "rp"), sel(b.ppnImpor, "rp"), sel(b.pph22, "rp"), sel(b.bayar, "rp"), sel(b.selisih, "rp", b.status === "Matched" ? {} : { kelas: "lap-naik" }), sel(b.status, "txt", b.status === "Matched" ? {} : { b: true })]),
    catatan: "Paid: BM / PPN / PPh 22 are the parts of Billing and Tax Advance requests that name the shipment's BL/AWB; \"Paid to state\" can include fines and other duty-related charges.",
  };

  /* ---- 4. hutang usaha ---- */
  const H = L.hutang;
  B.hutangRingkas = {
    judul: "Payables roll-forward",
    sub: `${lapTgl(`${Y}-01-01`)} to ${lapTgl(H.acuan)} · amounts as requested from HQ (net of PPh 23)`,
    kepala: ["", "Requests", "Amount"],
    baris: [
      [sel(`Opening payables (${lapTgl(`${Y - 1}-12-31`)})`), sel(H.pembuka.jumlah, "n"), sel(H.pembuka.nilai, "jt")],
      [sel("+ Invoiced this year"), sel(H.ditagih.jumlah, "n"), sel(H.ditagih.nilai, "jt")],
      [sel("− Paid this year"), sel(H.dibayar.jumlah, "n"), sel(H.dibayar.nilai, "jt")],
    ],
    kaki: [sel(`Closing payables (${lapTgl(H.acuan)})`), sel(H.penutup.jumlah, "n"), sel(H.penutup.nilai, "jt")],
    catatan: `Opening + invoiced − paid = closing${Math.abs(H.seimbang) < 1 ? " ✓" : ` — does not balance by ${lapFmtUang(H.seimbang)}`}. Position at ${lapTgl(H.acuan)}: the earlier of the end of the selected month and today. A request is open from its vendor invoice date until its paid date.`,
  };
  B.hutangUmur = {
    judul: "Payables by days past due",
    sub: `at ${lapTgl(H.acuan)} · by the vendor's due date, not the invoice date`,
    kepala: ["Bucket", "Requests", "Amount", "Share"],
    baris: H.umur.map((u) => [sel(u.nama), sel(u.jumlah, "n"), sel(u.nilai, "jt"), sel(H.penutup.nilai ? u.nilai / H.penutup.nilai : null, "pct")]),
    kaki: [sel("Total payables"), sel(H.penutup.jumlah, "n"), sel(H.penutup.nilai, "jt"), sel(H.penutup.nilai ? 1 : 0, "pct")],
    catatan: "Requests without a due date cannot be aged; they are listed apart rather than guessed.",
  };
  const D = H.disiplin;
  const nota = (teks) => sel(teks, "txt", { teks: true });
  B.hutangDisiplin = {
    judul: "Payment discipline",
    sub: `${lapJamak(D.jumlah, "request")} paid ${per}`,
    kepala: ["Indicator", "Value", "Note"],
    baris: [
      [sel("Average days from invoice to payment"), sel(D.rataHari != null ? D.rataHari : null, "hari"), nota(D.medianHari != null ? `median ${Math.round(D.medianHari)} days` : "")],
      [sel("Amount-weighted days to pay (DPO)"), sel(D.dpo, "hari"), nota("large invoices count more")],
      [sel("Paid on or before the due date"), sel(D.persenTepat, "pct"), nota(`${D.tepat.jumlah} of ${D.adaTempo} with a due date · ${lapFmtUang(D.tepat.nilai)}`)],
      [sel("Paid late"), sel(D.telat.jumlah, "n"), nota(D.telat.jumlah ? `${lapFmtUang(D.telat.nilai)} · on average ${D.rataTelat.toFixed(1)} days late` : "")],
      [sel("Paid 7+ days before the due date"), sel(D.awal.jumlah, "n"), nota(D.awal.jumlah ? `${lapFmtUang(D.awal.nilai)} left the company earlier than needed` : "")],
      [sel("Paid without a due date on record"), sel(D.tanpaTempo, "n"), nota(D.tanpaTempo ? "on-time cannot be judged for these" : "")],
    ],
  };
  B.hutangDatang = {
    judul: "Cash needed for open payables",
    sub: `from ${lapTgl(H.acuan)}`,
    kepala: ["When", "Requests", "Amount"],
    baris: [[sel("Overdue now", "txt", { b: !!H.terlambat.jumlah }), sel(H.terlambat.jumlah, "n"), sel(H.terlambat.nilai, "jt", H.terlambat.jumlah ? { kelas: "lap-naik" } : {})]]
      .concat(H.datang.map((d) => [sel(d.nama), sel(d.jumlah, "n"), sel(d.nilai, "jt")])),
    catatan: "Use the first rows to ask HQ for funds before the due dates, not after.",
  };
  B.hutangVendor = {
    judul: "Payables and payment behaviour by vendor",
    sub: `at ${lapTgl(H.acuan)}`,
    kepala: ["Vendor", "Open payables", "Overdue", "Oldest overdue (days)", "Avg days to pay", "Paid on time"],
    baris: H.perVendor.filter((r) => r.terbuka || r.bayarN).map((r) => [sel(r.nama), sel(r.terbuka, "jt"), sel(r.telat, "jt", r.telat ? { kelas: "lap-naik" } : {}), sel(r.tertua || null, "n"), sel(r.rataHari, "hari"), sel(r.persenTepat, "pct")]),
  };
  B.pph23 = {
    judul: "PPh 23 withheld — remittance deadlines",
    sub: "withheld from vendors, remitted by the company by the 10th of the following month",
    kepala: ["Invoice month", "PPh 23 withheld", "Remit by"],
    baris: H.pph23.filter((r) => r.nilai).map((r) => [sel(lapNamaBulan(r.bulan)), sel(r.nilai, "jt"), sel(lapTgl(r.batas))]),
    kaki: [sel("Total"), sel(H.pph23.reduce((x, r) => x + r.nilai, 0), "jt"), sel("")],
    catatan: "Based on the vendor invoice month; PPh 23 is due when the income is paid or accrued, whichever is earlier — confirm the exact month with the tax team.",
  };

  /* ---- 5. kartu vendor ---- */
  const K = L.kartu;
  const kons = K.konsentrasi;
  B.kartuVendor = {
    judul: "Vendor scorecard",
    sub: `${per} · logistics services (freight, storage, other), before VAT`,
    kepala: ["Vendor", "Spend", "Share", "Cumulative", "Requests", "Shipments", "Avg per shipment", "Open payables", "Overdue", "Avg days to pay", "Paid on time"],
    baris: K.daftar.map((r) => [sel(r.nama), sel(r.belanja, "jt"), sel(r.porsi, "pct"), sel(r.kumulatif, "pct"), sel(r.pengajuan, "n"), sel(r.kiriman, "n"), sel(r.perKiriman, "jt"), sel(r.terbuka, "jt"), sel(r.telat, "jt", r.telat ? { kelas: "lap-naik" } : {}), sel(r.rataHari, "hari"), sel(r.persenTepat, "pct")]),
    kaki: K.daftar.length ? [sel("Total"), sel(K.total, "jt"), sel(1, "pct"), sel(""), sel(K.daftar.reduce((x, r) => x + r.pengajuan, 0), "n"), sel(""), sel(""), sel(K.daftar.reduce((x, r) => x + r.terbuka, 0), "jt"), sel(K.daftar.reduce((x, r) => x + r.telat, 0), "jt"), sel(""), sel("")] : null,
    catatan: kons.n ? `Concentration: the largest vendor takes ${lapPc(kons.teratas, 0)} and the top three ${lapPc(kons.tiga, 0)} of spend; HHI ${Math.round(kons.hhi).toLocaleString("en-US")} (${kons.tingkat}). ${kons.tingkat === "high" ? "Dependence on one or two vendors weakens negotiating power and is a continuity risk." : "Spend is spread across enough vendors to negotiate."} Customs duties (Billing) are paid to the state, not a vendor, and are left out.` : "",
  };

  /* ---- 6. kontrol ---- */
  const KT = L.kontrol;
  B.kontrol = {
    judul: "Data and control checks",
    sub: `${per} · ${KT.jumlahReview === 0 ? "all passed" : `${KT.jumlahReview} to review`}`,
    kepala: ["Check", "Count", "Amount", "Status", "What to do"],
    baris: KT.butir.map((b) => [sel(b.nama), sel(b.jumlah, "n"), sel(b.uang || null, "jt"), sel(b.status === "ok" ? "OK" : "Review", "txt", b.status === "ok" ? { kelas: "lap-turun" } : { b: true, kelas: "lap-naik" }), sel(b.status === "ok" ? "" : b.saran, "txt", { teks: true })]),
    catatan: "Unlinked or undated records still count in the totals, but they weaken every ratio built on shipments, due dates or invoices.",
  };
  const tabelAkrual = (maks) => ({
    judul: "Shipments under way with no cost recorded",
    sub: "possible unbooked liabilities · 14+ days after SPPB / arrival (import) or departure (export)",
    kepala: ["Lane", "Party", "Forwarder", "BL/AWB", "Event date", "Days since", "Terms"],
    baris: L.akrual.slice(0, maks).map((x) => [sel(x.k.jalur), sel(x.k.pihak || "—"), sel(x.k.forwarder || "—"), sel(x.k.blAwb || "—"), sel(lapTgl(x.peristiwa)), sel(x.umur, "n"), sel(x.k.incoterm || "—")]),
    catatan: L.akrual.length > maks ? `Showing the ${maks} oldest of ${L.akrual.length}; the full list is on the Controls sheet of the Excel file.` : L.akrual.length ? "Ask the forwarder for the invoice, or book an accrual at month-end." : "No such shipments.",
  });
  const tabelPencilan = (maks) => ({
    judul: "Shipments with unusually high service cost",
    sub: "modified z-score above 3.5 within the lane · lanes with 6+ shipments",
    kepala: ["Lane", "Party", "BL/AWB", "Service cost", "Lane median", "Times the median"],
    baris: L.pencilan.slice(0, maks).map((p) => [sel(p.jalur), sel(p.k.pihak || "—"), sel(p.k.blAwb || "—"), sel(p.jasa, "jt"), sel(p.median, "jt"), sel(p.kali, "kali")]),
    catatan: L.pencilan.length ? "Check for a duplicated or mis-keyed invoice, an extra charge (demurrage, detention), or a genuinely different service." : "No outliers.",
  });
  B.akrual = tabelAkrual(10);
  B.akrualSemua = tabelAkrual(1e9);
  B.pencilan = tabelPencilan(10);
  B.pencilanSemua = tabelPencilan(1e9);

  /* ---- 7. pendorong biaya ---- */
  const P = L.penggerak;
  B.penggerak = {
    judul: "What drives the cost — correlations",
    sub: "Pearson r on shipments / months with data · 95% significance test",
    kepala: ["Relationship", "Points", "r", "R²", "Strength", "Reliable", "Reading"],
    baris: P.korelasi.map((c) => [sel(c.nama), sel(c.n, "n"), sel(c.r, "dec2"), sel(c.r2, "pct", {}), sel(c.kekuatan), sel(c.signifikan ? "Yes" : "Not yet", "txt", c.signifikan ? {} : { kelas: "lap-naik" }), sel(lapTafsirKorelasi(c), "txt", { teks: true })]),
    catatan: P.korelasi.length ? "A strong r alone proves nothing with few points; 'Reliable' means the relationship would be unlikely by chance at 95% confidence. Correlation is not causation — use it to ask why, then confirm with the forwarder's rate card." : "Not enough linked shipments with costs yet — links appear once requests carry the shipment's BL/AWB.",
  };
  B.jalurBc = {
    judul: "Customs lane vs time held and local costs",
    sub: "import shipments with costs · SPPB lane recorded on the PIB / Billing / SPPB step",
    kepala: ["Customs lane", "Shipments", "Avg days arrival → SPPB", "Avg storage + other cost per shipment"],
    baris: P.jalurBc.map((g) => [sel(LAP_JALUR_BC[g.jalur] || g.jalur), sel(g.kasus, "n"), sel(g.rataDwell, "hari"), sel(g.rataLokal, "jt")]),
    catatan: "Red-lane shipments are inspected, which holds the cargo longer; that is where storage cost is created.",
  };

  /* ---- 8. kontrol anggaran ---- */
  if (a.anggaran) {
    const sisaBulan = 12 - M;
    const sisa = a.anggaran - a.ytd;
    B.anggaranKontrol = {
      judul: `Budget control ${Y}`,
      sub: "spending vs budget and time elapsed",
      kepala: ["Indicator", "Value", "Reading"],
      baris: [
        [sel("Budget (current)"), sel(a.anggaran, "jt"), sel("")],
        [sel(`Used ${per}`), sel(a.ytd, "jt"), sel(`${lapPc(a.pakaiAnggaran, 1)} of the budget`)],
        [sel("Time elapsed"), sel(M / 12, "pct"), sel(a.pakaiAnggaran > M / 12 + 0.02 ? "spending is running ahead of the calendar" : a.pakaiAnggaran < M / 12 - 0.02 ? "spending is running behind the calendar" : "on pace")],
        [sel("Year-end estimate"), sel(a.proyeksiIni, "jt"), sel(a.proyeksiAnggaran > 1 ? `${lapFmtUang(a.proyeksiIni - a.anggaran)} over budget` : `${lapFmtUang(a.anggaran - a.proyeksiIni)} under budget`)],
        [sel("Left to spend"), sel(Math.max(0, sisa), "jt"), sel(sisa < 0 ? `budget already exceeded by ${lapFmtUang(-sisa)}` : sisaBulan ? `≈ ${lapFmtUang(sisa / sisaBulan)} per month for ${sisaBulan} month${sisaBulan > 1 ? "s" : ""} (current pace ≈ ${lapFmtUang(a.ytd / a.bulanEfektif)})` : "year complete")],
      ],
    };
  }
  return B;
}

/* Kamus data untuk lembar Excel: arti tiap kolom dan asalnya, supaya
   pengguna lain bisa membuat pivot tanpa menebak. */
function lapKamusData() {
  const baris = (lembar, kolom, arti, asal) => [sel(lembar), sel(kolom, "txt", { b: true }), sel(arti, "txt", { teks: true }), sel(asal, "txt", { teks: true })];
  return {
    judul: "Data dictionary",
    sub: "how the data sheets connect, what each key column means and where it comes from",
    kepala: ["Sheet", "Column", "Meaning", "Source / formula"],
    baris: [
      baris("Keys", "Shipment ID", "One shipment on the Shipment Schedule. It links Shipment Ledger, Request-Shipment Links, Cost Data and Sales Data.", "Shipment Schedule"),
      baris("Keys", "BL / AWB", "The key between a Fund Request and a shipment: the master or house BL / AWB, with spaces and punctuation ignored.", "BL/AWB on the request vs the schedule"),
      baris("Cost Data", "Cash requested", "What the company asks HQ for: DPP + VAT − PPh 23 (Billing: the duties and taxes).", "Fund Request"),
      baris("Cost Data", "PPh 23 withheld", "Income tax withheld from the vendor (2% of the VAT-able base for services); a liability the company remits.", "Fund Request lines"),
      baris("Cost Data", "Creditable taxes", "Input VAT + import VAT (PPN) + PPh 22 on imports — tax paid in advance that is credited, not an expense.", "Fund Request lines / Billing and Tax Advance fields"),
      baris("Cost Data", "True cost", "Cash requested + PPh 23 withheld − creditable taxes. Equals the services plus import duty and other duty-related charges.", "calculated"),
      baris("Cost Data", "Date", "The vendor's invoice date; the request date when none was typed.", "Fund Request"),
      baris("Cost Data", "Due date / Paid date", "When the vendor expects payment; the date the request was marked paid. Payables are aged from the due date.", "Fund Request"),
      baris("Cost Data", "Link result", "Linked = every BL/AWB found in the schedule · Partly linked · BL/AWB not in schedule · No BL/AWB · Trucking (trucking requests use DO / delivery-order numbers).", "calculated"),
      baris("Cost Data", "Shipment ID(s)", "Schedules the request was matched to; several when one request covers more than one shipment.", "BL/AWB match"),
      baris("Request-Shipment Links", "Share of request", "The part of the request that belongs to this shipment: the per-line BL/AWB when lines name different shipments, otherwise an even split. Shares of one request add up to 100%.", "fundBagiPerAwb"),
      baris("Request-Shipment Links", "Cash / True cost / Creditable allocated", "The request's amounts times the share. Their sums tie to Cost Data, so no rupiah is lost or counted twice.", "calculated"),
      baris("Shipment Ledger", "Cohort date", "The date that puts the shipment in a report month: PIB date (import) or PEB date (export); then the Aju date, document date, ETA / ETD.", "Shipment Schedule"),
      baris("Shipment Ledger", "Goods value", "Customs value for imports (CIF or FOB × NDPBM); items × the nearest NDPBM for exports.", "Shipment Schedule items"),
      baris("Shipment Ledger", "PIB: BM / PPN / PPh", "Duties and taxes assessed on the PIB.", "Customs & Charges"),
      baris("Shipment Ledger", "Paid to state", "Billing and the duty part of Tax Advance requests that name this shipment.", "Fund Request"),
      baris("Shipment Ledger", "Landed cost add-on", "Services + import duty (BM) + other duty-related. Import VAT, input VAT and PPh 22 are excluded because they are credited.", "calculated"),
      baris("Shipment Ledger", "Cost % of value / revenue", "Landed cost add-on ÷ goods value (imports) or ÷ the linked invoice (exports). Only for shipments with costs.", "calculated"),
      baris("Shipment Ledger", "Duty result", "PIB assessed vs paid, tolerance IDR 1,000: Matched · Paid more / less than PIB · PIB, no payment request · Payment, no PIB amounts.", "calculated"),
      baris("Sales Data", "Shipment ID", "The shipment the invoice is linked to; blank = not linked, so the revenue cannot be matched to its cost.", "Invoice Number"),
    ],
  };
}
