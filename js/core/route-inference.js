"use strict";

/* ==================================================================
   TEBAK RUTE — TRANSIT ATAU TIDAK, DARI KAPAL / PESAWAT YANG DIPILIH

   Jadwal kapal dan penerbangan berganti tiap musim, jadi tidak ada
   daftar tetap "kapal X selalu direct" yang bisa dijaga tetap benar.
   Tebakan ini memakai bukti yang memang bisa dipercaya, dari yang
   paling kuat:

     1. TRANSIT YANG DICATAT untuk kapal / no. penerbangan yang sama di
        rute yang sama (pelabuhan induk sama), lengkap dengan tempatnya.
     2. TRANSIT YANG DICATAT untuk carrier yang sama di rute yang sama
        (minimal 2 kiriman).
     3. POLA MASKAPAI (udara) -- maskapai negara ketiga membawa kargo
        lewat hub-nya; maskapai negara asal/tujuan yang berangkat dari
        bandara bukan hub-nya singgah dulu di hub (AIRLINE_NETWORK).
     4. POLA RUTE (laut) -- Rusia <-> Indonesia tidak punya layanan
        langsung yang rutin: transit.

   HANYA PERNAH MENEBAK "TRANSIT". Label Direct di riwayat bukan bukti:
   itu nilai bawaan form, dan di riwayat DDI hampir semua kiriman
   tercatat Direct karena rute aslinya tidak diketahui saat diisi --
   bukan karena kapalnya benar-benar langsung. Kalau Direct dihitung,
   riwayat itu akan "membuktikan" bahwa Korean Air dari Busan terbang
   langsung ke Jakarta, dan menimpa pola hub yang benar. Yang dihitung
   hanya Transit yang terminal transitnya diisi -- itu pasti disengaja.

   Tidak ada bukti transit -> null: kolom Tipe Rute tetap Direct.
================================================================== */

/* Kunci "sarana yang sama": nama kapal tanpa nomor voyage, atau nomor
   penerbangan untuk udara (nama maskapai saja terlalu umum). */
function kunciSarana(s) {
  const bersih = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if ((s.transport || "laut") === "udara") return bersih(s.voyage) || bersih(s.vessel);
  // Nomor di ujung nama kapal biasanya nomor voyage yang ikut terketik
  return bersih(String(s.vessel || "").replace(/\s+\d+[A-Z]?\s*$/i, ""));
}

function terminalTransitPertama(s) {
  const st = (s.routeStops || []).find((x) => String(x.terminal || "").trim());
  return st ? String(st.terminal).trim() : "";
}

// Unlocode bandara dari kode IATA hub (SIN -> SGSIN). Kosong kalau tak dikenal.
function bandaraHub(iata) {
  if (typeof UNLOCODES === "undefined") return "";
  const e = UNLOCODES.find((u) => u.type === "udara" && u.code === iata);
  return e ? e.unlocode : "";
}

/* Tempat transit yang paling sering dicatat, dikelompokkan per
   pelabuhan induk (Shekou & Yantian = satu). */
function transitTerbanyak(daftar, minimal) {
  if (daftar.length < minimal) return null;
  const hitung = new Map();
  daftar.forEach((via) => {
    const k = (typeof resolvePortMetro === "function" && resolvePortMetro(via)) || via.toUpperCase();
    const ada = hitung.get(k) || { via, n: 0 };
    ada.n++;
    hitung.set(k, ada);
  });
  const terbanyak = [...hitung.values()].sort((a, b) => b.n - a.n)[0];
  return { routeType: "transit", via: [terbanyak.via], n: daftar.length };
}

function inferRoute(src, opsi) {
  const o = opsi || {};
  if (!src) return null;
  const ctx = predictionContext(src);
  const dari = ctx.fromMetro || ctx.fromPort;
  const ke = ctx.toMetro || ctx.toPort;
  if (!dari || !ke || dari === ke) return null;
  const udara = ctx.transport === "udara";

  /* 1 & 2 — TRANSIT YANG DICATAT */
  const kunci = kunciSarana(src);
  const sama = [];
  const sejenis = [];
  const riwayat = typeof predictionHistory === "function" ? predictionHistory() : [];
  riwayat.forEach((h) => {
    if (!h || h === src || (o.kecualiId && h.id === o.kecualiId)) return;
    if ((h.transport || "laut") !== ctx.transport) return;
    const via = h.routeType === "transit" ? terminalTransitPertama(h) : "";
    if (!via) return; // Direct / Transit tanpa terminal: bukan bukti
    const c = typeof sampelKiriman === "function" ? sampelKiriman(h).ctx : predictionContext(h);
    if ((c.fromMetro || c.fromPort) !== dari || (c.toMetro || c.toPort) !== ke) return;
    if (kunci && kunciSarana(h) === kunci) sama.push(via);
    else if (ctx.carrier && c.carrier === ctx.carrier) sejenis.push(via);
  });
  let r = transitTerbanyak(sama, 1);
  if (r) {
    return Object.assign(r, {
      source: "sarana",
      reason: tt(
        `${r.n} kiriman ${udara ? "penerbangan" : "kapal"} ini di rute yang sama tercatat transit`,
        `${r.n} shipment(s) on this ${udara ? "flight" : "vessel"} and route were recorded as transit`,
      ),
    });
  }
  r = transitTerbanyak(sejenis, 2);
  if (r) {
    return Object.assign(r, {
      source: "carrier",
      reason: tt(
        `${r.n} kiriman ${ctx.carrier} di rute yang sama tercatat transit`,
        `${r.n} ${ctx.carrier} shipments on this route were recorded as transit`,
      ),
    });
  }

  /* 3 — POLA MASKAPAI */
  if (udara) {
    const net = typeof airlineNetwork === "function" ? airlineNetwork(ctx.carrier) : null;
    if (!net || !net.hubs.length || !ctx.fromCountry || !ctx.toCountry) return null;
    const hub = net.hubs[0];
    const viaHub = bandaraHub(hub);
    const asing = net.country !== ctx.fromCountry && net.country !== ctx.toCountry;
    if (asing && hub !== ctx.fromPort && hub !== ctx.toPort) {
      return {
        routeType: "transit", via: viaHub ? [viaHub] : [], n: 0, source: "maskapai",
        reason: tt(
          `${ctx.carrier} bukan maskapai negara asal/tujuan — kargonya lazim singgah di hub ${hub}`,
          `${ctx.carrier} is not based in the origin/destination country — its cargo usually connects via its ${hub} hub`,
        ),
      };
    }
    const ujungRumah = net.country === ctx.fromCountry ? ctx.fromPort : ctx.toPort;
    if (!asing && ujungRumah && net.hubs.indexOf(ujungRumah) < 0) {
      return {
        routeType: "transit", via: viaHub ? [viaHub] : [], n: 0, source: "maskapai",
        reason: tt(
          `${ujungRumah} bukan hub ${ctx.carrier} — penerbangan internasionalnya lewat ${hub}`,
          `${ujungRumah} is not a ${ctx.carrier} hub — its international flights go via ${hub}`,
        ),
      };
    }
    return null;
  }

  /* 4 — POLA RUTE LAUT */
  const pasangan = [ctx.fromCountry, ctx.toCountry].sort().join("-");
  if (pasangan === "ID-RU") {
    return {
      routeType: "transit", via: [], n: 0, source: "rute",
      reason: tt(
        "Rusia ↔ Indonesia tidak punya layanan kapal langsung yang rutin — umumnya transshipment di Cina atau Korea",
        "Russia ↔ Indonesia has no regular direct vessel service — usually transshipped in China or Korea",
      ),
    };
  }
  return null;
}

/* Kenapa TIDAK ada tebakan -- supaya pengguna tahu rute otomatisnya
   sudah berjalan, bukan diam. Tidak mengubah apa pun. */
function routeInferenceNote(src) {
  if (!src) return "";
  const ctx = predictionContext(src);
  const dari = ctx.fromMetro || ctx.fromPort;
  const ke = ctx.toMetro || ctx.toPort;
  if (!dari || !ke) {
    return tt(
      "Isi Terminal Asal & Tujuan — rute ditentukan setelah keduanya terbaca.",
      "Fill in the Origin & Destination Terminals — the route is determined once both are recognised.",
    );
  }
  if (ctx.transport === "udara") {
    const net = typeof airlineNetwork === "function" ? airlineNetwork(ctx.carrier) : null;
    if (!ctx.carrier) {
      return tt("Maskapai belum dikenali — isi nama maskapai atau No. Flight (mis. OZ761).",
        "Airline not recognised yet — enter the airline name or Flight No. (e.g. OZ761).");
    }
    if (net && net.hubs.length) {
      return tt(
        `Tidak ada tanda transit: ${ctx.carrier} terbang dari/ke hub-nya (${net.hubs.join("/")}). Tipe Rute dibiarkan Direct.`,
        `No sign of transit: ${ctx.carrier} flies from/to its hub (${net.hubs.join("/")}). Route Type stays Direct.`,
      );
    }
    return tt(`Belum ada data hub untuk ${ctx.carrier} — Tipe Rute dibiarkan.`, `No hub data for ${ctx.carrier} yet — Route Type left as is.`);
  }
  return tt(
    "Belum ada transit yang tercatat untuk kapal/pelayaran ini di rute ini — Tipe Rute dibiarkan.",
    "No transit recorded for this vessel/line on this route yet — Route Type left as is.",
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { inferRoute, kunciSarana, routeInferenceNote };
}
