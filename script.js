(function () {
  "use strict";

  /* ==================================================================
     SUPABASE CONFIG
     Isi 2 nilai di bawah dengan Project URL & anon public key dari
     project Supabase-mu (Settings > API di dashboard Supabase).
     Lihat README.md untuk panduan lengkap step-by-step.
  ================================================================== */
  const SUPABASE_URL = "https://nigxxpzgunibuotluapv.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_ZMgHTAl6ELfm4UeR-Gqn6w_by8JbSFd";
  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );

  /* ==================================================================
     CONSTANTS
  ================================================================== */
  const STATUS_META = {
    process: { label: "PROCESS", class: "status-process" },
    transit: { label: "IN TRANSIT", class: "status-transit" },
    arrived: { label: "ARRIVED", class: "status-arrived" },
    delayed: { label: "DELAYED", class: "status-delayed" },
  };

  const MODE_LABELS = {
    import: {
      addBtn: "Tambah Jadwal Import",
      section: "Daftar Jadwal Pengiriman Import",
      arrivedStat: "ARRIVED",
      docNo: "No. SPPB",
      docDate: "Tanggal SPPB",
      party: "Nama Shipper",
      factoryDate: "Tanggal In Factory",
      factoryTime: "Jam In Factory",
      origin: "Pelabuhan Asal",
      destination: "Pelabuhan Tujuan",
      actual: "Actual Delivery",
      showDuty: true,
      modalTitleNew: "Tambah Jadwal Import",
      modalTitleEdit: "Edit Jadwal Import",
      arrivedNoun: "arrived",
    },
    export: {
      addBtn: "Tambah Jadwal Export",
      section: "Daftar Jadwal Pengiriman Export",
      arrivedStat: "DELIVERED",
      docNo: "No. PEB",
      docDate: "Tanggal PEB",
      party: "Nama Buyer / Consignee",
      factoryDate: "Tanggal Stuffing",
      factoryTime: "Jam Stuffing",
      origin: "Pelabuhan Muat",
      destination: "Pelabuhan Tujuan",
      actual: "Actual Shipped Date",
      showDuty: false,
      modalTitleNew: "Tambah Jadwal Export",
      modalTitleEdit: "Edit Jadwal Export",
      arrivedNoun: "delivered",
    },
  };

  const JENIS_OPTIONS = ["Bahan Baku", "Barang Modal", "Barang Penolong"];

  /* ==================================================================
     HELPERS
  ================================================================== */
  function uid(p) {
    return (p || "s") + "_" + Math.random().toString(36).slice(2, 10);
  }

  function parseLocalDate(d) {
    if (!d) return null;
    const dt = new Date(d + "T00:00:00");
    return isNaN(dt) ? null : dt;
  }
  function fmtDate(d) {
    const dt = parseLocalDate(d);
    if (!dt) return "—";
    return dt.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  function fmtDateLong(d) {
    const dt = parseLocalDate(d);
    if (!dt) return "Tanggal Tidak Diketahui";
    return dt.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  function todayStripped() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }
  function isPastOrToday(dateStr) {
    const dt = parseLocalDate(dateStr);
    if (!dt) return false;
    return dt.getTime() <= todayStripped().getTime();
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }
  function fmtUSD(n) {
    n = Number(n) || 0;
    return (
      "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  function fmtRp(n) {
    n = Math.round(Number(n) || 0);
    return "Rp " + n.toLocaleString("id-ID");
  }
  function fmtNum(n) {
    return (Number(n) || 0).toLocaleString("id-ID");
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function newItem() {
    return {
      id: uid("it"),
      namaBarang: "",
      hsCode: "",
      jenisBarang: "Bahan Baku",
      qty: 0,
      satuan: "PCS",
      harga: 0,
      netto: 0,
      bruto: 0,
    };
  }

  function newStop() {
    return {
      id: uid("st"),
      terminal: "",
      transport: "laut",
      vessel: "",
      voyage: "",
      arrivalDate: "",
      departureDate: "",
    };
  }

  /* ==================================================================
     DATA (dimuat dari Supabase saat startup — lihat loadShipments())
  ================================================================== */
  let data = {
    import: [],
    export: [],
  };

  /* ==================================================================
     MAPPING: baris database (snake_case) <-> objek JS (camelCase)
     Tujuannya supaya seluruh kode render/hitung di bawah ini (yang
     sudah ditulis memakai nama field camelCase seperti sebelumnya)
     TIDAK perlu diubah sama sekali.
  ================================================================== */
  const FIELD_MAP = {
    transport: "transport",
    docNo: "doc_no",
    docDate: "doc_date",
    noAju: "no_aju",
    party: "party",
    invoice: "invoice",
    masterBL: "master_bl",
    houseBL: "house_bl",
    factoryDate: "factory_date",
    factoryTime: "factory_time",
    forwarder: "forwarder",
    forwarderPic: "forwarder_pic",
    vessel: "vessel",
    voyage: "voyage",
    container: "container",
    muatan: "muatan",
    origin: "origin",
    destination: "destination",
    etd: "etd",
    eta: "eta",
    actual: "actual",
    status: "status",
    notes: "notes",
    incoterm: "incoterm",
    freight: "freight",
    insurance: "insurance",
    ndpbm: "ndpbm",
    tarif: "tarif",
    bm: "bm",
    ppn: "ppn",
    pph: "pph",
    pi: "pi",
    skb: "skb",
    package: "package",
    routeType: "route_type",
  };
  const NUMERIC_FIELDS = [
    "freight",
    "insurance",
    "ndpbm",
    "tarif",
    "bm",
    "ppn",
    "pph",
  ];

  function columnFor(camelField) {
    return FIELD_MAP[camelField] || camelField;
  }

  // Payload form (camelCase) -> baris siap INSERT/UPDATE (snake_case)
  function shipmentToRow(payload) {
    const row = {};
    Object.keys(FIELD_MAP).forEach((camel) => {
      if (!(camel in payload)) return;
      const col = FIELD_MAP[camel];
      let val = payload[camel];
      if (NUMERIC_FIELDS.includes(camel)) {
        val = Number(val) || 0;
      } else if (val === "") {
        val = null; // tanggal/teks kosong disimpan sebagai NULL di database
      }
      row[col] = val;
    });
    return row;
  }

  // Baris dari Supabase (snake_case + items[] hasil join) -> objek shipment (camelCase)
  function rowToShipment(row) {
    const s = { id: row.id, mode: row.mode };
    Object.keys(FIELD_MAP).forEach((camel) => {
      const col = FIELD_MAP[camel];
      let val = row[col];
      if (NUMERIC_FIELDS.includes(camel)) {
        val = Number(val) || 0;
      } else if (val == null) {
        val = "";
      }
      s[camel] = val;
    });
    s.items = (row.items || []).map(rowToItem);
    // Terminal transit diurutkan berdasar "seq" di sini (bukan lewat query
    // Supabase) supaya tidak bergantung pada dukungan order-by-embedded-
    // resource versi supabase-js tertentu — lebih aman & predictable.
    s.routeStops = (row.routeStops || [])
      .map(rowToStop)
      .sort((a, b) => a.seq - b.seq);
    return s;
  }

  function itemToRow(it, shipmentId) {
    return {
      shipment_id: shipmentId,
      nama_barang: it.namaBarang || "",
      hs_code: it.hsCode || "",
      jenis_barang: it.jenisBarang || "",
      qty: Number(it.qty) || 0,
      satuan: it.satuan || "",
      harga: Number(it.harga) || 0,
      netto: Number(it.netto) || 0,
      bruto: Number(it.bruto) || 0,
    };
  }

  function rowToItem(row) {
    return {
      id: row.id,
      namaBarang: row.nama_barang || "",
      hsCode: row.hs_code || "",
      jenisBarang: row.jenis_barang || "",
      qty: Number(row.qty) || 0,
      satuan: row.satuan || "",
      harga: Number(row.harga) || 0,
      netto: Number(row.netto) || 0,
      bruto: Number(row.bruto) || 0,
    };
  }

  // Terminal transit (shipment_route_stops) — field transport/vessel/voyage
  // pada 1 baris menjelaskan leg yang MEMBAWA barang TIBA di terminal itu.
  function stopToRow(st, shipmentId, seq) {
    return {
      shipment_id: shipmentId,
      seq: seq,
      terminal: st.terminal || "",
      transport: st.transport || "laut",
      vessel: st.vessel || "",
      voyage: st.voyage || "",
      arrival_date: st.arrivalDate || null,
      departure_date: st.departureDate || null,
    };
  }

  function rowToStop(row) {
    return {
      id: row.id,
      seq: Number(row.seq) || 1,
      terminal: row.terminal || "",
      transport: row.transport || "laut",
      vessel: row.vessel || "",
      voyage: row.voyage || "",
      arrivalDate: row.arrival_date || "",
      departureDate: row.departure_date || "",
    };
  }

  /* ==================================================================
     CRUD KE SUPABASE
  ================================================================== */
  async function loadShipments() {
    const { data: rows, error } = await supabaseClient
      .from("shipments")
      .select("*, items:shipment_items(*), routeStops:shipment_route_stops(*)")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      showDbErrorState();
      return;
    }

    data.import = [];
    data.export = [];
    (rows || []).forEach((row) => {
      const s = rowToShipment(row);
      if (data[row.mode]) data[row.mode].push(s);
    });
    render();
  }

  function showDbErrorState() {
    emptyState.classList.add("d-none");
    cardContainer.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-plug"></i>
        <h5 class="mt-3 mb-1" style="font-family:var(--font-display); color:var(--navy)">Gagal memuat data dari database</h5>
        <p class="mb-0">Pastikan <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code> di bagian atas <b>script.js</b> sudah diisi dengan benar, dan <b>schema.sql</b> sudah dijalankan lewat Supabase SQL Editor. Cek juga tab Console di browser untuk detail error.</p>
      </div>`;
  }

  async function createShipment(payload, items, stops) {
    const row = shipmentToRow(payload);
    row.mode = activeMode;
    const { data: inserted, error } = await supabaseClient
      .from("shipments")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    if (items.length) {
      const itemRows = items.map((it) => itemToRow(it, inserted.id));
      const { error: itemErr } = await supabaseClient
        .from("shipment_items")
        .insert(itemRows);
      if (itemErr) throw itemErr;
    }
    if (stops && stops.length) {
      const stopRows = stops.map((st, i) => stopToRow(st, inserted.id, i + 1));
      const { error: stopErr } = await supabaseClient
        .from("shipment_route_stops")
        .insert(stopRows);
      if (stopErr) throw stopErr;
    }
    return inserted;
  }

  async function updateShipmentRecord(id, payload, items, stops) {
    const row = shipmentToRow(payload);
    const { error } = await supabaseClient
      .from("shipments")
      .update(row)
      .eq("id", id);
    if (error) throw error;

    // Cara paling sederhana & aman untuk menyamakan daftar barang:
    // hapus semua item lama, lalu masukkan ulang daftar item yang berlaku sekarang.
    const { error: delErr } = await supabaseClient
      .from("shipment_items")
      .delete()
      .eq("shipment_id", id);
    if (delErr) throw delErr;

    if (items.length) {
      const itemRows = items.map((it) => itemToRow(it, id));
      const { error: insErr } = await supabaseClient
        .from("shipment_items")
        .insert(itemRows);
      if (insErr) throw insErr;
    }

    // Sama persis dengan pola daftar barang di atas: hapus semua terminal
    // transit lama, lalu masukkan ulang daftar yang berlaku sekarang. Kalau
    // route_type = "direct", "stops" yang dikirim ke sini sudah dikosongkan
    // duluan oleh pemanggilnya, jadi baris lama otomatis ikut terhapus.
    const { error: delStopErr } = await supabaseClient
      .from("shipment_route_stops")
      .delete()
      .eq("shipment_id", id);
    if (delStopErr) throw delStopErr;

    if (stops && stops.length) {
      const stopRows = stops.map((st, i) => stopToRow(st, id, i + 1));
      const { error: insStopErr } = await supabaseClient
        .from("shipment_route_stops")
        .insert(stopRows);
      if (insStopErr) throw insStopErr;
    }
  }

  async function persistFields(id, patch) {
    const row = {};
    Object.keys(patch).forEach((camel) => {
      row[columnFor(camel)] = patch[camel] === "" ? null : patch[camel];
    });
    const { error } = await supabaseClient
      .from("shipments")
      .update(row)
      .eq("id", id);
    if (error) {
      console.error(error);
      showToast(
        "Gagal menyimpan perubahan ke database — memuat ulang data.",
        "danger",
      );
      loadShipments();
    }
  }

  let activeMode = "import";
  let draftItems = [];
  let draftStops = [];
  let sortDir = "asc";
  let currentDetailId = null;
  let currentPage = 1;
  let pageSize = 5;

  /* ==================================================================
     DOM SHORTCUTS
  ================================================================== */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const cardContainer = $("#cardContainer");
  const emptyState = $("#emptyState");
  const shipmentModalEl = $("#shipmentModal");
  const shipmentModal = new bootstrap.Modal(shipmentModalEl);
  const detailViewModalEl = $("#detailViewModal");
  const detailViewModal = new bootstrap.Modal(detailViewModalEl);
  const confirmModalEl = $("#confirmModal");
  const confirmModal = new bootstrap.Modal(confirmModalEl);
  const bulkModalEl = $("#bulkModal");
  const bulkModal = new bootstrap.Modal(bulkModalEl);

  function currentList() {
    return data[activeMode];
  }
  function ML() {
    return MODE_LABELS[activeMode];
  }

  /* ==================================================================
     TOAST / CONFIRM (replaces native alert()/confirm() so it always
     works reliably, including inside sandboxed preview frames)
  ================================================================== */
  function showToast(msg, type) {
    type = type || "danger";
    const el = $("#appToast");
    el.className = "toast align-items-center text-white border-0 bg-" + type;
    $("#toastMsg").textContent = msg;
    new bootstrap.Toast(el, { delay: 3200 }).show();
  }

  let confirmCallback = null;
  function showConfirm(message, onConfirm) {
    $("#confirmMessage").textContent = message;
    confirmCallback = onConfirm;
    confirmModal.show();
  }
  $("#confirmActionBtn").addEventListener("click", () => {
    confirmModal.hide();
    if (typeof confirmCallback === "function") confirmCallback();
    confirmCallback = null;
  });

  /* ==================================================================
     CUSTOMS / VALUE CALCULATION (single source of truth)
  ================================================================== */
  function itemTotals(shipmentLike) {
    let totalQty = 0,
      totalNetto = 0,
      totalBruto = 0,
      totalUSD = 0;
    (shipmentLike.items || []).forEach((it) => {
      const qty = Number(it.qty) || 0,
        harga = Number(it.harga) || 0,
        netto = Number(it.netto) || 0,
        bruto = Number(it.bruto) || 0;
      totalQty += qty;
      totalNetto += netto;
      totalBruto += bruto;
      totalUSD += qty * harga;
    });
    return { totalQty, totalNetto, totalBruto, totalUSD };
  }

  // shipmentLike needs: items, incoterm, ndpbm, bm, ppn, pph
  function computeCustoms(shipmentLike) {
    const totals = itemTotals(shipmentLike);
    const ndpbm = Number(shipmentLike.ndpbm) || 0;
    let cifUsd = 0,
      cifRupiah = 0,
      fobUsd = 0,
      fobRupiah = 0;

    if (shipmentLike.incoterm === "CIF") {
      cifUsd = totals.totalUSD;
      cifRupiah = cifUsd * ndpbm;
    } else if (shipmentLike.incoterm === "FOB") {
      fobUsd = totals.totalUSD;
      fobRupiah = fobUsd * ndpbm;
    }
    // Any other incoterm (CFR/EXW/DDP) -> all four stay 0, per requirement.

    const bm = Number(shipmentLike.bm) || 0;
    const ppn = Number(shipmentLike.ppn) || 0;
    const pph = Number(shipmentLike.pph) || 0;
    const bmPdri = bm !== 0 ? bm + ppn + pph : 0;

    return { ...totals, cifUsd, cifRupiah, fobUsd, fobRupiah, bmPdri };
  }

  /* ==================================================================
     LANE / TRANSPORT ICON
  ================================================================== */
  function laneProgress(s) {
    if (s.status === "arrived") return 1;
    if (s.status === "process") return 0.04;
    const etd = parseLocalDate(s.etd);
    const eta = parseLocalDate(s.eta);
    const today = new Date();
    if (!etd || !eta || eta <= etd) return 0.5;
    let frac = (today - etd) / (eta - etd);
    return Math.min(0.96, Math.max(0.06, frac));
  }
  function iconForMode(mode, status) {
    const air = mode === "udara";
    if (status === "arrived") return air ? "🛬" : "⚓";
    return air ? "✈️" : "🚢";
  }

  /* ==================================================================
     RUTE TRANSIT (multi-terminal)
     Kalau route_type !== "transit" atau tidak ada routeStops sama sekali,
     semua fungsi di bawah ini otomatis "collapse" jadi 1 leg
     origin -> destination — PERSIS seperti shipment direct sebelumnya,
     tidak ada perubahan tampilan/perilaku untuk data lama.

     Field transport/vessel/voyage pada 1 baris shipment_route_stops
     menjelaskan alat angkut yang MEMBAWA barang TIBA di terminal
     tersebut (bukan leg berikutnya). Leg TERAKHIR (dari terminal transit
     paling akhir menuju s.destination) tetap memakai
     s.transport / s.vessel / s.voyage — field yang sudah ada dari dulu.
  ================================================================== */
  function routeStopList(s) {
    return Array.isArray(s.routeStops) ? s.routeStops : [];
  }
  function isTransitRoute(s) {
    return s.routeType === "transit" && routeStopList(s).length > 0;
  }

  // Susun titik-titik rute secara urut: asal -> tiap terminal transit -> tujuan.
  function buildRouteNodes(s) {
    const nodes = [{ kind: "origin", terminal: s.origin, date: s.etd }];
    routeStopList(s).forEach((st) => {
      nodes.push({
        kind: "stop",
        terminal: st.terminal,
        arrivalDate: st.arrivalDate,
        departureDate: st.departureDate,
        date: st.arrivalDate || st.departureDate || "",
        transport: st.transport,
        vessel: st.vessel,
        voyage: st.voyage,
      });
    });
    nodes.push({ kind: "destination", terminal: s.destination, date: s.eta });
    return nodes;
  }

  // Ubah tanggal tiap titik jadi posisi 0..1 di sepanjang lane. Titik yang
  // tanggalnya kosong diisi otomatis lewat interpolasi linear terhadap
  // titik bertanggal terdekat kiri/kanan. Kalau rentang keseluruhan tidak
  // valid (sama/mundur), semua titik disebar rata berdasar urutan saja —
  // konsisten dengan cara laneProgress() menangani etd/eta yang tidak
  // valid (fallback ke nilai tetap, bukan NaN).
  function computeNodeFractions(nodes) {
    const n = nodes.length;
    const times = nodes.map((nd) => {
      const dt = parseLocalDate(nd.date);
      return dt ? dt.getTime() : null;
    });
    if (times[0] == null) times[0] = 0;
    if (times[n - 1] == null) times[n - 1] = times[0] + 1;

    for (let i = 1; i < n - 1; i++) {
      if (times[i] != null) continue;
      let left = i - 1;
      while (left > 0 && times[left] == null) left--;
      let right = i + 1;
      while (right < n - 1 && times[right] == null) right++;
      const span = right - left || 1;
      const frac = (i - left) / span;
      times[i] = times[left] + (times[right] - times[left]) * frac;
    }

    const minT = times[0];
    const maxT = times[n - 1];
    let fractions;
    if (!isFinite(maxT - minT) || maxT <= minT) {
      fractions = nodes.map((_, i) => i / (n - 1));
    } else {
      fractions = times.map((t) =>
        Math.min(1, Math.max(0, (t - minT) / (maxT - minT))),
      );
    }
    // Jaga urutan selalu maju supaya titik di rute tidak pernah terlihat
    // mundur ke kiri walau ada input tanggal yang keliru.
    for (let i = 1; i < n; i++) {
      if (fractions[i] < fractions[i - 1]) fractions[i] = fractions[i - 1];
    }
    return fractions;
  }

  // Leg mana yang sedang berjalan sekarang, berdasar posisi progress
  // keseluruhan (laneProgress) terhadap fraksi tiap titik.
  function activeLegIndex(fractions, progress) {
    let idx = 0;
    for (let i = 0; i < fractions.length - 1; i++) {
      if (progress >= fractions[i]) idx = i;
    }
    return idx;
  }

  // Alat angkut yang dipakai utk 1 leg tertentu. Leg terakhir (menuju
  // destination) selalu pakai field shipments.* yang sudah ada; leg
  // lainnya pakai field milik titik TUJUAN leg tsb (lihat catatan di atas).
  function transportForLeg(s, nodes, legIndex) {
    const lastLegIndex = nodes.length - 2;
    if (legIndex >= lastLegIndex) {
      return { mode: s.transport, vessel: s.vessel, voyage: s.voyage };
    }
    const arrivingNode = nodes[legIndex + 1];
    return {
      mode: arrivingNode.transport || s.transport,
      vessel: arrivingNode.vessel,
      voyage: arrivingNode.voyage,
    };
  }

  // Satu fungsi terpusat dipakai baik saat render awal card maupun saat
  // refresh posisi berkala (refreshLanePositions) — single source of truth.
  function computeLaneModel(s) {
    const nodes = buildRouteNodes(s);
    const fractions = computeNodeFractions(nodes);
    const progress = laneProgress(s);
    const legIdx = activeLegIndex(fractions, progress);
    const leg = transportForLeg(s, nodes, legIdx);
    const icon = iconForMode(leg.mode, s.status);
    return { nodes, fractions, progress, legIdx, leg, icon };
  }

  // Teks rute lengkap (dipakai di info-grid card & detail view).
  function routeChainText(s) {
    if (!isTransitRoute(s)) {
      return `${dispVal(s.origin)} → ${dispVal(s.destination)}`;
    }
    const names = [
      s.origin,
      ...routeStopList(s).map((st) => st.terminal),
      s.destination,
    ];
    return names.map((nm) => dispVal(nm)).join(" → ");
  }

  function laneNodeTitle(nd) {
    const parts = [dispVal(nd.terminal)];
    if (nd.kind === "stop") {
      if (nd.arrivalDate) parts.push("Tiba " + fmtDate(nd.arrivalDate));
      if (nd.departureDate)
        parts.push("Berangkat " + fmtDate(nd.departureDate));
      if (hasMeaningfulValue(nd.vessel))
        parts.push(
          (nd.transport === "udara" ? "Pesawat " : "Vessel ") + nd.vessel,
        );
      if (hasMeaningfulValue(nd.voyage))
        parts.push(
          (nd.transport === "udara" ? "No. Flight " : "No. Voyage ") +
            nd.voyage,
        );
    } else {
      parts.push(fmtDate(nd.date));
    }
    return escapeAttr(parts.join(" · "));
  }

  // Render seluruh isi ".lane" (judul + track + label tanggal). Untuk
  // shipment direct (2 titik) outputnya PERSIS sama seperti sebelumnya;
  // untuk transit (>2 titik) menampilkan seluruh terminal + leg aktif.
  // Cegah label antar terminal saling tumpuk kalau tanggalnya berdekatan
  // (atau bahkan sama persis): label yang jaraknya terlalu dekat dengan
  // label terakhir di baris atas otomatis digeser ke baris ke-2.
  function assignLabelRows(fractions) {
    const MIN_GAP = 0.12;
    const lastInRow = [-Infinity, -Infinity];
    return fractions.map((f) => {
      const row = f - lastInRow[0] >= MIN_GAP ? 0 : 1;
      lastInRow[row] = f;
      return row;
    });
  }

  function buildLaneHtml(s) {
    const lane = computeLaneModel(s);
    const { nodes, fractions, progress, icon } = lane;
    const laneClass =
      s.status === "delayed"
        ? "is-delayed"
        : s.status === "process"
          ? "is-process"
          : "";
    const sailing = s.status === "transit" ? "sailing" : "";
    const multi = nodes.length > 2;

    const dotsHtml = nodes
      .map((nd, i) => {
        const kindClass =
          i === 0 ? "origin" : i === nodes.length - 1 ? "destination" : "stop";
        const reached = fractions[i] <= progress + 0.0001 ? " reached" : "";
        return `<div class="port-node ${kindClass}${reached}" style="left:${fractions[i] * 100}%" title="${laneNodeTitle(nd)}"></div>`;
      })
      .join("");

    const labelRows = multi ? assignLabelRows(fractions) : [];
    const labelsHtml = !multi
      ? `
        <div class="port-labels">
          <div class="p">ETD <b>${fmtDate(s.etd)}</b></div>
          <div class="p text-end">ETA <b>${fmtDate(s.eta)}</b></div>
        </div>`
      : `
        <div class="port-labels port-labels--multi">
          ${nodes
            .map((nd, i) => {
              const align =
                i === 0 ? "start" : i === nodes.length - 1 ? "end" : "center";
              const top = labelRows[i] * 36;
              return `<div class="p p--node p--${align}" style="left:${fractions[i] * 100}%; top:${top}px">
                <span class="p-term" title="${escapeAttr(dispVal(nd.terminal))}">${escapeHtml(dispVal(nd.terminal))}</span>
                <b>${fmtDate(nd.date)}</b>
              </div>`;
            })
            .join("")}
        </div>`;

    let delayFlag = "";
    const today = new Date();
    const etaDate = parseLocalDate(s.eta);
    if (!s.actual && s.status !== "arrived" && etaDate && today > etaDate) {
      const d = daysBetween(etaDate, today);
      delayFlag = `<div class="delay-flag"><i class="bi bi-exclamation-triangle-fill"></i> Melewati ETA ${d} hari</div>`;
    }

    return `
      <div class="lane-title mt-3">Progres Pengiriman</div>
      <div class="lane-track ${laneClass}">
        <div class="lane-fill" style="width:${progress * 100}%"></div>
        ${dotsHtml}
        <div class="ship-marker ${sailing}" style="left:${progress * 100}%">${icon}</div>
      </div>
      ${labelsHtml}
      ${delayFlag}`;
  }

  /* ==================================================================
     AUTO-ARRIVE RULE
     - ETA yang diubah ke tanggal lewat/hari ini -> otomatis set status
       ke ARRIVED (satu-satunya auto-arrive yang tersisa).
     - Actual Delivery SENGAJA tidak lagi punya efek samping ke status —
       field ini sekarang murni informatif; status harus diubah manual
       lewat dropdown Status, sesuai permintaan.
     - Triggered only by the specific field-change event described,
       never re-applied on generic render/save, so it can't clobber a
       manually-set "DELAYED" status on unrelated shipments.
  ================================================================== */
  function applyEtaAutoArrive(shipment, newEtaValue) {
    shipment.eta = newEtaValue;
    if (isPastOrToday(newEtaValue) && shipment.status !== "arrived") {
      shipment.status = "arrived";
      if (!shipment.actual) shipment.actual = newEtaValue;
    }
  }

  /* ==================================================================
     CARD RENDERING
  ================================================================== */
  function renderCard(s) {
    return s.status === "arrived"
      ? renderCollapsedCard(s)
      : renderExpandedCard(s);
  }

  function hasMeaningfulValue(v) {
    const t = (v || "").toString().trim();
    return t !== "" && t !== "-";
  }

  // Display fallback for free-text fields: treats "-" the same as empty,
  // showing the placeholder dash instead of a literal "-" typed by the user.
  function dispVal(v) {
    return hasMeaningfulValue(v) ? v : "—";
  }

  function buildTags(s, totals) {
    const lbl = ML();
    const stopCount = routeStopList(s).length;
    return [
      s.incoterm ? `<span class="tag">${escapeHtml(s.incoterm)}</span>` : "",
      totals.totalUSD
        ? `<span class="tag tag-usd">${fmtUSD(totals.totalUSD)}</span>`
        : "",
      s.muatan
        ? `<span class="tag tag-muatan">${escapeHtml(s.muatan)}</span>`
        : "",
      isTransitRoute(s)
        ? `<span class="tag tag-transit"><i class="bi bi-signpost-split"></i> Transit · ${stopCount} Stop</span>`
        : "",
      lbl.showDuty && hasMeaningfulValue(s.pi)
        ? `<span class="tag tag-pi"><i class="bi bi-file-earmark-check"></i> PI</span>`
        : "",
      lbl.showDuty && hasMeaningfulValue(s.skb)
        ? `<span class="tag tag-skb">SKB ${escapeHtml(s.skb)}</span>`
        : "",
    ]
      .filter(Boolean)
      .join("");
  }

  function actionButtons(s) {
    return `
      <div class="actions-col">
        <button class="icon-btn" data-action="viewDetail" data-id="${s.id}" title="Lihat Detail"><i class="bi bi-eye"></i></button>
        <button class="icon-btn primary" data-action="edit" data-id="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="icon-btn" data-action="copyExcel" data-id="${s.id}" title="Salin ke Excel"><i class="bi bi-clipboard"></i></button>
        <button class="icon-btn danger" data-action="delete" data-id="${s.id}" title="Hapus"><i class="bi bi-trash3"></i></button>
      </div>`;
  }

  function statusSelectHtml(s) {
    const meta = STATUS_META[s.status] || STATUS_META.process;
    return `<select class="status-select ${meta.class}" data-action="status" data-id="${s.id}">
        ${Object.entries(STATUS_META)
          .map(
            ([k, v]) =>
              `<option value="${k}" ${k === s.status ? "selected" : ""}>${v.label}</option>`,
          )
          .join("")}
      </select>`;
  }

  function renderExpandedCard(s) {
    const lbl = ML();
    const totals = itemTotals(s);
    const itemCount = (s.items || []).length;

    return `
    <div class="ship-card ship-card--${s.status}" data-id="${s.id}">
      <div class="ship-card-top">
        <div class="ship-title-block">
          <div class="item-name">${escapeHtml(dispVal(s.party))} · ${itemCount} Barang</div>
          <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} &nbsp;•&nbsp; No. Aju: ${escapeHtml(dispVal(s.noAju))}</div>
        </div>
        <div class="ship-actions-block">
          ${statusSelectHtml(s)}
          ${actionButtons(s)}
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item"><div class="info-label"><i class="bi bi-geo-alt"></i> Rute</div><div class="info-value">${escapeHtml(routeChainText(s))}</div></div>
        <div class="info-item"><div class="info-label"><i class="bi bi-person-badge"></i> Forwarder</div><div class="info-value">${escapeHtml(dispVal(s.forwarder))}<br><span class="muted-value">${escapeHtml(dispVal(s.forwarderPic))}</span></div></div>
        <div class="info-item"><div class="info-label"><i class="bi ${s.transport === "udara" ? "bi-airplane" : "bi-water"}"></i> ${s.transport === "udara" ? "Pesawat" : "Vessel"}</div><div class="info-value">${escapeHtml(dispVal(s.vessel))}<br><span class="muted-value">${s.transport === "udara" ? "No. Flight" : "Voyage"} ${escapeHtml(dispVal(s.voyage))}</span></div></div>
        <div class="info-item"><div class="info-label"><i class="bi bi-upc-scan"></i> Kontainer</div><div class="info-value">${escapeHtml(dispVal(s.container))}${s.muatan ? " · " + escapeHtml(s.muatan) : ""}</div></div>
        <div class="info-item"><div class="info-label"><i class="bi bi-receipt-cutoff"></i> Invoice</div><div class="info-value">${escapeHtml(dispVal(s.invoice))}</div></div>
        <div class="info-item"><div class="info-label"><i class="bi bi-truck"></i> ${lbl.factoryDate}</div><div class="info-value">${s.factoryDate ? fmtDate(s.factoryDate) : "—"}${s.factoryTime ? " · " + escapeHtml(s.factoryTime) : ""}</div></div>
        <div class="info-item"><div class="info-label"><i class="bi bi-box-seam"></i> Total Netto</div><div class="info-value">${fmtNum(totals.totalNetto)} Kg</div></div>
      </div>

      <div class="tag-row">${buildTags(s, totals)}</div>

      <div class="lane">
        ${buildLaneHtml(s)}
      </div>

      <div class="date-strip">
        <div class="date-field"><label>ETD</label><input type="date" value="${s.etd || ""}" data-action="date" data-field="etd" data-id="${s.id}"></div>
        <div class="date-field"><label>ETA</label><input type="date" value="${s.eta || ""}" data-action="date" data-field="eta" data-id="${s.id}"></div>
        <div class="date-field"><label>${lbl.actual}</label><input type="date" value="${s.actual || ""}" data-action="date" data-field="actual" data-id="${s.id}"></div>
      </div>
    </div>`;
  }

  function renderCollapsedCard(s) {
    const lbl = ML();
    return `
    <div class="ship-card ship-card--arrived ship-card--collapsed" data-id="${s.id}">
      <div class="collapsed-row">
        <div class="collapsed-check"><i class="bi bi-check-circle-fill"></i></div>
        <div class="collapsed-main">
          <div class="collapsed-party">${escapeHtml(dispVal(s.party))}</div>
          <div class="collapsed-meta">Invoice <b>${escapeHtml(dispVal(s.invoice))}</b> &nbsp;·&nbsp; ${lbl.arrivedStat}: <b>${fmtDate(s.factoryDate)}</b></div>
        </div>
        <div class="ship-actions-block">
          ${statusSelectHtml(s)}
          ${actionButtons(s)}
        </div>
      </div>
    </div>`;
  }

  /* ==================================================================
     GROUPING BY DATE + FILTER/SORT + MAIN RENDER
  ================================================================== */
  function getFiltered() {
    const q = $("#searchInput").value.trim().toLowerCase();
    const statusFilter = $("#filterStatus").value;
    return currentList().filter((s) => {
      const hay = [
        s.party,
        s.docNo,
        s.noAju,
        s.invoice,
        s.vessel,
        s.voyage,
        s.forwarder,
        s.forwarderPic,
        ...(s.items || []).map((i) => i.namaBarang),
      ]
        .join(" ")
        .toLowerCase();
      const matchQ = !q || hay.includes(q);
      const matchStatus = !statusFilter || s.status === statusFilter;
      return matchQ && matchStatus;
    });
  }

  function groupKeyOf(s) {
    if (s.status === "arrived" && s.actual) return s.actual;
    return s.etd || null;
  }

  function groupAndSort(list) {
    const groups = new Map();
    const noDate = [];
    list.forEach((s) => {
      const key = groupKeyOf(s);
      if (!key) {
        noDate.push(s);
        return;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });
    let keys = Array.from(groups.keys());
    keys.sort((a, b) =>
      sortDir === "asc" ? new Date(a) - new Date(b) : new Date(b) - new Date(a),
    );
    const ordered = keys.map((k) => ({ key: k, items: groups.get(k) }));
    if (noDate.length) ordered.push({ key: null, items: noDate });
    return ordered;
  }

  function render() {
    applyModeLabels();
    const filtered = getFiltered();

    if (filtered.length === 0) {
      cardContainer.innerHTML = "";
      emptyState.classList.remove("d-none");
      renderPaginationBar(0);
      updateStats();
      return;
    }
    emptyState.classList.add("d-none");

    const groups = groupAndSort(filtered);
    const groupByKey = new Map(groups.map((g) => [g.key, g]));

    // Ratakan jadi satu urutan kartu (dipakai untuk potong per halaman),
    // tapi tetap ingat "key" tanggal grup-nya masing-masing supaya divider
    // tanggal tetap bisa ditampilkan dengan benar per halaman.
    const flat = [];
    groups.forEach((g) => {
      g.items.forEach((s) => flat.push({ key: g.key, shipment: s }));
    });

    const totalPages = Math.max(1, Math.ceil(flat.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * pageSize;
    const pageSlice = flat.slice(start, start + pageSize);

    let html = "";
    let lastKey;
    pageSlice.forEach((entry, idx) => {
      if (idx === 0 || entry.key !== lastKey) {
        // anyArrived dihitung dari SELURUH anggota grup (bukan cuma yang
        // tampil di halaman ini), supaya status badge tanggal konsisten
        // di halaman berapa pun.
        const g = groupByKey.get(entry.key);
        const anyArrived = g
          ? g.items.every((s) => s.status === "arrived")
          : false;
        const label = entry.key
          ? fmtDateLong(entry.key)
          : "Tanggal Tidak Diketahui";
        html += `
          <div class="date-section">
            <span class="date-section-line"></span>
            <span class="date-section-badge ${anyArrived ? "is-arrived-group" : ""}"><i class="bi ${anyArrived ? "bi-check-circle" : "bi-calendar-event"}"></i> ${label}</span>
            <span class="date-section-line"></span>
          </div>`;
      }
      html += renderCard(entry.shipment);
      lastKey = entry.key;
    });
    cardContainer.innerHTML = html;

    renderPaginationBar(flat.length);
    fixSelectWidths();
    updateStats();
  }

  /* ==================================================================
     PAGINATION
  ================================================================== */
  function paginationRange(current, total) {
    const delta = 1;
    const range = [];
    const withDots = [];
    let last;
    for (let i = 1; i <= total; i++) {
      if (
        i === 1 ||
        i === total ||
        (i >= current - delta && i <= current + delta)
      ) {
        range.push(i);
      }
    }
    range.forEach((i) => {
      if (last != null) {
        if (i - last === 2) withDots.push(last + 1);
        else if (i - last !== 1) withDots.push("...");
      }
      withDots.push(i);
      last = i;
    });
    return withDots;
  }

  function scrollToListTop() {
    const el = $("#lblSectionList");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPaginationBar(totalItems) {
    const bar = $("#paginationBar");
    if (!bar) return;
    if (totalItems === 0) {
      bar.className = "";
      bar.innerHTML = "";
      return;
    }
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalItems);

    const pageBtns = paginationRange(currentPage, totalPages)
      .map((p) =>
        p === "..."
          ? `<span class="page-ellipsis">…</span>`
          : `<button type="button" class="page-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`,
      )
      .join("");

    bar.className = "pagination-bar";
    bar.innerHTML = `
      <div class="pagination-info">Menampilkan <b>${startIdx}–${endIdx}</b> dari <b>${totalItems}</b> pengiriman</div>
      <div class="pagination-controls">
        <button type="button" class="page-nav" id="pagePrev" ${currentPage <= 1 ? "disabled" : ""} title="Halaman sebelumnya"><i class="bi bi-chevron-left"></i></button>
        <div class="page-numbers">${pageBtns}</div>
        <button type="button" class="page-nav" id="pageNext" ${currentPage >= totalPages ? "disabled" : ""} title="Halaman berikutnya"><i class="bi bi-chevron-right"></i></button>
      </div>
      <div class="pagination-size">
        <label for="pageSizeSelect">Per halaman</label>
        <select id="pageSizeSelect">
          ${[5, 10, 20, 50]
            .map(
              (n) =>
                `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n}</option>`,
            )
            .join("")}
        </select>
      </div>`;
  }

  $("#paginationBar").addEventListener("click", (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (pageBtn) {
      currentPage = Number(pageBtn.dataset.page);
      render();
      scrollToListTop();
      return;
    }
    if (e.target.closest("#pagePrev")) {
      currentPage = Math.max(1, currentPage - 1);
      render();
      scrollToListTop();
      return;
    }
    if (e.target.closest("#pageNext")) {
      currentPage = currentPage + 1;
      render();
      scrollToListTop();
    }
  });
  $("#paginationBar").addEventListener("change", (e) => {
    if (e.target.id === "pageSizeSelect") {
      pageSize = Number(e.target.value) || 5;
      currentPage = 1;
      render();
    }
  });

  function updateStats() {
    const list = currentList();
    $("#statTotal").textContent = list.length;
    $("#statProcess").textContent = list.filter(
      (s) => s.status === "process",
    ).length;
    $("#statTransit").textContent = list.filter(
      (s) => s.status === "transit",
    ).length;
    $("#statArrived").textContent = list.filter(
      (s) => s.status === "arrived",
    ).length;
  }

  function applyModeLabels() {
    const lbl = ML();
    $("#lblAddBtn").textContent = lbl.addBtn;
    $("#lblSectionList").textContent = lbl.section;
    $("#lblArrivedStat").textContent = lbl.arrivedStat;
  }

  /* ---- Make each status <select> exactly as wide as its selected text ---- */
  let measurerEl = null;
  function getMeasurer() {
    if (measurerEl) return measurerEl;
    measurerEl = document.createElement("span");
    measurerEl.style.position = "absolute";
    measurerEl.style.visibility = "hidden";
    measurerEl.style.whiteSpace = "nowrap";
    measurerEl.style.top = "-9999px";
    measurerEl.style.left = "-9999px";
    document.body.appendChild(measurerEl);
    return measurerEl;
  }
  function sizeSelectToContent(selectEl) {
    const opt = selectEl.options[selectEl.selectedIndex];
    if (!opt) return;
    const m = getMeasurer();
    const cs = getComputedStyle(selectEl);
    m.style.fontFamily = cs.fontFamily;
    m.style.fontSize = cs.fontSize;
    m.style.fontWeight = cs.fontWeight;
    m.style.letterSpacing = cs.letterSpacing;
    m.style.textTransform = cs.textTransform;
    m.textContent = opt.text;
    const textWidth = m.getBoundingClientRect().width;
    selectEl.style.width = Math.ceil(textWidth) + 46 + "px";
  }
  function fixSelectWidths() {
    $$(".status-select", cardContainer).forEach(sizeSelectToContent);
  }

  /* ---- Lightweight periodic refresh: only move markers/fill, keep DOM/focus intact ----
     Posisi titik terminal (port-node) sendiri tidak perlu digeser ulang di
     sini karena posisinya tetap (berdasar tanggal masing-masing terminal,
     bukan "hari ini"). Yang perlu diperbarui tiap tick cuma: lebar fill,
     posisi ship-marker, ikon leg yang sedang aktif (bisa berpindah moda di
     tengah transit), dan status "reached" tiap titik. */
  function refreshLanePositions() {
    currentList().forEach((s) => {
      const card = cardContainer.querySelector(`.ship-card[data-id="${s.id}"]`);
      if (!card) return;
      const lane = computeLaneModel(s);
      const fill = card.querySelector(".lane-fill");
      const marker = card.querySelector(".ship-marker");
      if (fill) fill.style.width = lane.progress * 100 + "%";
      if (marker) {
        marker.style.left = lane.progress * 100 + "%";
        marker.textContent = lane.icon;
        marker.classList.toggle("sailing", s.status === "transit");
      }
      $$(".port-node", card).forEach((dot, i) => {
        const reached = lane.fractions[i] <= lane.progress + 0.0001;
        dot.classList.toggle("reached", reached);
      });
    });
  }
  setInterval(refreshLanePositions, 60000);

  /* ==================================================================
     MODE SWITCH (navbar)
  ================================================================== */
  $("#tabImport").addEventListener("click", () => switchMode("import"));
  $("#tabExport").addEventListener("click", () => switchMode("export"));
  function switchMode(mode) {
    activeMode = mode;
    $("#tabImport").classList.toggle("active", mode === "import");
    $("#tabExport").classList.toggle("active", mode === "export");
    $("#searchInput").value = "";
    $("#filterStatus").value = "";
    currentPage = 1;
    render();
  }

  /* ==================================================================
     SALIN KE EXCEL (clipboard, format mengikuti IMPORT_FORMAT.xlsx)
     Kolom yang dihasilkan (urutan tetap, kolom NO & REMARK di excel
     TIDAK diisi — paste mulai dari kolom IN FACTORY):
       IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, ITEM, HS CODE,
       DESCRIPTION, QTY, SAT, AMOUNT, NDPBM, INCOTERMS, FREIGHT,
       INSURANCE, CIF, FOB RUPIAH, CIF RUPIAH, TARIF, BEA MASUK,
       PPN 11%, PPH, TOTAL BM+PDRI, PI, FASILITAS/SKB, BL/AWB,
       NO. INVOICE/DEL.NOTE, VESSEL, PACKAGE

     - Field per-barang (ITEM, HS CODE, DESCRIPTION, QTY, SAT, AMOUNT)
       diisi di SETIAP baris/barang.
     - HANYA diisi 1x di baris PERTAMA, dikosongkan di baris berikutnya:
       IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, NDPBM, INCOTERMS,
       NO. INVOICE, VESSEL, PACKAGE.
     - Field biaya/kepabeanan (FREIGHT, INSURANCE, CIF, FOB RUPIAH,
       CIF RUPIAH, TARIF, BEA MASUK, PPN, PPH, TOTAL BM+PDRI, PI,
       FASILITAS/SKB) tetap diulang di setiap baris.
     - TARIF disalin apa adanya (persen, mis. 5 -> "5"), TIDAK dibagi
       100 — cell TARIF di excel-nya sudah diformat sebagai persen.
     - VESSEL diisi dari No. Voyage/Flight (nomor pengangkut), BUKAN
       dari nama vessel/maskapai.
     - BL/AWB: Master di baris pertama, House di baris KEDUA (numpang
       di baris barang ke-2 kalau barangnya 2+; kalau barangnya cuma 1,
       baris ke-2 baru dibuat khusus untuk House, kolom lain kosong).
     - Kalau barangnya lebih dari satu, tiap barang jadi baris baru.
  ================================================================== */
  const EXCEL_MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  function excelDateFmt(d) {
    const dt = parseLocalDate(d);
    if (!dt) return "";
    return `${dt.getDate()}-${EXCEL_MONTHS[dt.getMonth()]}-${String(dt.getFullYear()).slice(-2)}`;
  }

  function roundNum(n, decimals) {
    decimals = decimals == null ? 2 : decimals;
    let num = Number(n);
    if (!isFinite(num)) num = 0;
    return parseFloat(num.toFixed(decimals));
  }

  // Ambil angka DEPAN saja dari field Package bebas-teks (mis. "1 BX"
  // -> 1, "2*40 & 1*20" -> 2), tanpa satuan/kode kemasannya. null kalau
  // tidak ada angka di depan sama sekali.
  function extractLeadingNumber(str) {
    const s = String(str || "").trim();
    const m = s.match(/^(-?\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    return parseFloat(m[1].replace(",", "."));
  }

  // Dua "formatter" dengan aturan kolom yang SAMA PERSIS (urutan, first-
  // row-only, zeroing fasilitas, dsb — lihat buildExcelCopyRows &
  // buildExportCopyRows), tapi beda representasi nilai akhirnya:
  //
  // - clipboardFormatter: dipakai tombol "Salin ke Excel" (copy 1
  //   pengiriman ke clipboard sebagai plain text/TSV). Angka jadi STRING
  //   koma-desimal (locale ID) supaya saat di-paste, Excel mengenalinya
  //   sebagai Number asli (bukan Text) — format $/Rp yang sudah ada di
  //   kolom excel tetap berfungsi. Tanggal jadi teks "D-MMM-YY". TARIF
  //   apa adanya (persen, TIDAK dibagi 100) karena mengandalkan cell
  //   tujuan yang sudah diformat persen sendiri oleh Yogi.
  // - nativeFormatter: dipakai fitur Bulk Export (bikin file .xlsx asli
  //   dari nol lewat SheetJS). Angka jadi Number asli, tanggal jadi Date
  //   asli, TARIF jadi PECAHAN (mis. 5 -> 0.05) karena kita yang
  //   men-set format cell-nya sendiri jadi persen — SAMA seperti
  //   bagaimana TARIF tersimpan di IMPORT_FORMAT.xlsx.
  const clipboardFormatter = {
    text: (v) => (v == null ? "" : String(v)),
    num: (n, decimals) => {
      const r = roundNum(n, decimals);
      return String(r === 0 ? 0 : r).replace(".", ",");
    },
    date: (d) => excelDateFmt(d),
    tarif: (percent) => clipboardFormatter.num(percent, 2),
    packageNum: (pkg) => {
      const n = extractLeadingNumber(pkg);
      return n == null ? "" : clipboardFormatter.num(n, 2);
    },
    blank: "",
  };
  const nativeFormatter = {
    text: (v) => (v == null ? "" : String(v)),
    num: (n, decimals) => roundNum(n, decimals),
    date: (d) => parseLocalDate(d) || "",
    tarif: (percent) => roundNum((Number(percent) || 0) / 100, 4),
    packageNum: (pkg) => {
      const n = extractLeadingNumber(pkg);
      return n == null ? "" : roundNum(n, 2);
    },
    blank: "",
  };

  /* ==================================================================
     SALIN KE EXCEL / BULK EXPORT — MODE IMPORT
     (clipboard 1 pengiriman ATAU baris untuk file bulk, formatter yang
     membedakan; format kolom mengikuti IMPORT_FORMAT.xlsx)
     Kolom yang dihasilkan (urutan tetap, TANPA kolom NO & REMARK — itu
     ditambahkan terpisah oleh pemanggil, lihat buildBulkRowsForShipment):
       IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, ITEM, HS CODE,
       DESCRIPTION, QTY, SAT, AMOUNT, NDPBM, INCOTERMS, FREIGHT,
       INSURANCE, CIF, FOB RUPIAH, CIF RUPIAH, TARIF, BEA MASUK,
       PPN 11%, PPH, TOTAL BM+PDRI, PI, FASILITAS/SKB, BL/AWB,
       NO. INVOICE/DEL.NOTE, VESSEL, PACKAGE

     - Field per-barang (ITEM, HS CODE, DESCRIPTION, QTY, SAT, AMOUNT)
       diisi di SETIAP baris/barang.
     - HANYA diisi 1x di baris PERTAMA, dikosongkan di baris berikutnya:
       IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME, NDPBM, INCOTERMS,
       TARIF, BEA MASUK, PPN, PPH, TOTAL BM+PDRI, FASILITAS/SKB,
       NO. INVOICE, VESSEL, PACKAGE.
     - Field yang tetap diulang di setiap baris: FREIGHT, INSURANCE, CIF,
       FOB RUPIAH, CIF RUPIAH, PI.
     - BEA MASUK/PPN/PPH/TOTAL BM+PDRI disalin PERSIS sesuai nilai yang
       tampil di card/detail (lihat computeCustoms): TOTAL BM+PDRI = 0
       kalau BEA MASUK = 0, selain itu = BEA MASUK + PPN + PPH. TIDAK
       tergantung isi Fasilitas SKB.
     - VESSEL diisi dari No. Voyage/Flight (nomor pengangkut), BUKAN
       dari nama vessel/maskapai.
     - PACKAGE: angka depan saja, tanpa satuan/kode kemasan.
     - BL/AWB: Master di baris pertama, House di baris KEDUA (numpang
       di baris barang ke-2 kalau barangnya 2+; kalau barangnya cuma 1,
       baris ke-2 baru dibuat khusus untuk House, kolom lain kosong).
     - Kalau barangnya lebih dari satu, tiap barang jadi baris baru.
  ================================================================== */
  function buildExcelCopyRows(s, formatter) {
    formatter = formatter || clipboardFormatter;
    const calc = computeCustoms(s);
    const items = s.items || [];

    const masterBL = (s.masterBL || "").trim();
    const houseBL = (s.houseBL || "").trim();

    // Samakan persis dengan computeCustoms() supaya angka yang ter-copy
    // selalu cocok dengan yang tampil di card/detail — tidak lagi
    // di-nolkan berdasarkan isi Fasilitas SKB.
    const bmVal = Number(s.bm) || 0;
    const ppnVal = Number(s.ppn) || 0;
    const pphVal = Number(s.pph) || 0;
    const bmPdriVal = calc.bmPdri;

    const FIRST_ROW_ONLY_IDX = [
      0,
      1,
      2,
      3,
      4, // IN FACTORY, SPPB, DATE, AJU, SUPPLIER NAME
      11,
      12, // NDPBM, INCOTERMS
      18,
      19,
      20,
      21,
      22, // TARIF, BEA MASUK, PPN, PPH, TOTAL BM+PDRI
      24, // FASILITAS / SKB
      26,
      27,
      28, // NO. INVOICE, VESSEL, PACKAGE
    ];

    function buildRowForItem(it, idx) {
      const cols = [
        formatter.date(s.factoryDate), // 0  IN FACTORY
        formatter.text(s.docNo), // 1  SPPB
        formatter.date(s.docDate), // 2  DATE
        formatter.text(s.noAju), // 3  AJU
        formatter.text(s.party), // 4  SUPPLIER NAME
        formatter.text(it.jenisBarang), // 5  ITEM
        formatter.text(it.hsCode), // 6  HS CODE
        formatter.text(it.namaBarang), // 7  DESCRIPTION
        formatter.num(it.qty, 2), // 8  QTY
        formatter.text(it.satuan), // 9  SAT
        formatter.num((Number(it.qty) || 0) * (Number(it.harga) || 0), 2), // 10 AMOUNT
        formatter.num(s.ndpbm, 2), // 11 NDPBM
        formatter.text(s.incoterm), // 12 INCOTERMS
        formatter.num(s.freight, 2), // 13 FREIGHT
        formatter.num(s.insurance, 2), // 14 INSURANCE
        formatter.num(calc.cifUsd, 2), // 15 CIF
        formatter.num(calc.fobRupiah, 2), // 16 FOB RUPIAH
        formatter.num(calc.cifRupiah, 2), // 17 CIF RUPIAH
        formatter.tarif(s.tarif), // 18 TARIF
        formatter.num(bmVal, 2), // 19 BEA MASUK
        formatter.num(ppnVal, 2), // 20 PPN 11%
        formatter.num(pphVal, 2), // 21 PPH
        formatter.num(bmPdriVal, 2), // 22 TOTAL BM+PDRI
        formatter.text(s.pi), // 23 PI
        formatter.text(s.skb), // 24 FASILITAS / SKB
        formatter.blank, // 25 BL/AWB — diisi terpisah di bawah
        formatter.text(s.invoice), // 26 NO. INVOICE / DEL.NOTE
        formatter.text(s.voyage), // 27 VESSEL -> nomor pengangkut
        formatter.packageNum(s.package), // 28 PACKAGE
      ];
      if (idx > 0)
        FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
      return cols;
    }

    const rows = items.map((it, idx) => buildRowForItem(it, idx));

    if (rows.length >= 1) rows[0][25] = formatter.text(masterBL);
    if (houseBL) {
      if (rows.length >= 2) {
        rows[1][25] = formatter.text(houseBL);
      } else {
        const blankRow = new Array(29).fill(formatter.blank);
        blankRow[25] = formatter.text(houseBL);
        rows.push(blankRow);
      }
    }

    return rows;
  }

  /* ==================================================================
     SALIN KE EXCEL / BULK EXPORT — MODE EXPORT
     Format kolom mengikuti EXPORT_FORMAT.xlsx (lebih ringkas — tanpa
     NDPBM/CIF/TARIF/BM/PPN/PPH/PI/FASILITAS, tanpa SAT):
       PENGIRIMAN DARI PABRIK, PEB, DATE, AJU, CONSIGNEE, HS CODE,
       DESCRIPTION, QTY, AMOUNT, INCOTERMS, FREIGHT, INSURANCE, BL/AWB,
       NO. INVOICE/DEL.NOTE, VESSEL, PACKAGE
     Aturan first-row-only / BL-AWB row1+row2 / VESSEL=voyage / PACKAGE
     angka-saja — semuanya sama seperti mode Import di atas.
  ================================================================== */
  function buildExportCopyRows(s, formatter) {
    formatter = formatter || clipboardFormatter;
    const items = s.items || [];
    const masterBL = (s.masterBL || "").trim();
    const houseBL = (s.houseBL || "").trim();

    const FIRST_ROW_ONLY_IDX = [0, 1, 2, 3, 4, 9, 13, 14, 15];

    function buildRowForItem(it, idx) {
      const cols = [
        formatter.date(s.factoryDate), // 0  PENGIRIMAN DARI PABRIK
        formatter.text(s.docNo), // 1  PEB
        formatter.date(s.docDate), // 2  DATE
        formatter.text(s.noAju), // 3  AJU
        formatter.text(s.party), // 4  CONSIGNEE
        formatter.text(it.hsCode), // 5  HS CODE
        formatter.text(it.namaBarang), // 6  DESCRIPTION
        formatter.num(it.qty, 2), // 7  QTY
        formatter.num((Number(it.qty) || 0) * (Number(it.harga) || 0), 2), // 8  AMOUNT
        formatter.text(s.incoterm), // 9  INCOTERMS
        formatter.num(s.freight, 2), // 10 FREIGHT
        formatter.num(s.insurance, 2), // 11 INSURANCE
        formatter.blank, // 12 BL/AWB — diisi terpisah di bawah
        formatter.text(s.invoice), // 13 NO. INVOICE / DEL.NOTE
        formatter.text(s.voyage), // 14 VESSEL -> nomor pengangkut
        formatter.packageNum(s.package), // 15 PACKAGE
      ];
      if (idx > 0)
        FIRST_ROW_ONLY_IDX.forEach((i) => (cols[i] = formatter.blank));
      return cols;
    }

    const rows = items.map((it, idx) => buildRowForItem(it, idx));

    if (rows.length >= 1) rows[0][12] = formatter.text(masterBL);
    if (houseBL) {
      if (rows.length >= 2) {
        rows[1][12] = formatter.text(houseBL);
      } else {
        const blankRow = new Array(16).fill(formatter.blank);
        blankRow[12] = formatter.text(houseBL);
        rows.push(blankRow);
      }
    }

    return rows;
  }

  // Escaping ala TSV: field yang mengandung tab/newline/quote dibungkus
  // tanda kutip (konvensi yang sama dipakai Excel sendiri saat
  // copy-paste sel berisi line break/Alt+Enter).
  function tsvField(val) {
    val = val == null ? "" : String(val);
    if (/[\t\n\r"]/.test(val)) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }

  function buildExcelCopyText(s) {
    return buildExcelCopyRows(s, clipboardFormatter)
      .map((cols) => cols.map(tsvField).join("\t"))
      .join("\n");
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error(err);
      }
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async function handleCopyExcel(id) {
    const s = currentList().find((x) => x.id === id);
    if (!s) return;
    if (!s.items || !s.items.length) {
      showToast("Tidak ada barang untuk disalin.", "danger");
      return;
    }
    const text = buildExcelCopyText(s);
    const ok = await copyToClipboard(text);
    if (ok) {
      showToast(
        `${s.items.length} baris barang disalin — tinggal paste mulai dari kolom IN FACTORY di Excel.`,
        "success",
      );
    } else {
      showToast("Gagal menyalin ke clipboard.", "danger");
    }
  }

  /* ==================================================================
     CARD EVENT DELEGATION
  ================================================================== */
  cardContainer.addEventListener("change", (e) => {
    const t = e.target;
    const id = t.dataset.id;
    if (!id) return;
    const s = currentList().find((x) => x.id === id);
    if (!s) return;

    if (t.dataset.action === "status") {
      s.status = t.value;
      render();
      persistFields(id, { status: s.status });
    } else if (t.dataset.action === "date") {
      if (t.dataset.field === "eta") {
        applyEtaAutoArrive(s, t.value);
        render();
        persistFields(id, { eta: s.eta, status: s.status, actual: s.actual });
      } else {
        // "actual" (Actual Delivery) dan field tanggal lain: murni field
        // biasa, TIDAK ada lagi efek samping ke status.
        s[t.dataset.field] = t.value;
        render();
        persistFields(id, { [t.dataset.field]: t.value });
      }
    }
  });

  cardContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") openModal(id);
    if (btn.dataset.action === "viewDetail") openDetailView(id);
    if (btn.dataset.action === "copyExcel") handleCopyExcel(id);
    if (btn.dataset.action === "delete") {
      showConfirm("Hapus jadwal pengiriman ini secara permanen?", async () => {
        try {
          const { error } = await supabaseClient
            .from("shipments")
            .delete()
            .eq("id", id);
          if (error) throw error;
          data[activeMode] = currentList().filter((x) => x.id !== id);
          render();
          showToast("Jadwal berhasil dihapus.", "dark");
        } catch (err) {
          console.error(err);
          showToast("Gagal menghapus data dari database.", "danger");
        }
      });
    }
  });

  $("#btnAdd").addEventListener("click", () => openModal(null));
  $("#btnAddEmpty").addEventListener("click", () => openModal(null));

  /* ==================================================================
     MODAL TABS
  ================================================================== */
  $$("#detailTabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#detailTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $$(".tab-pane").forEach((p) => p.classList.add("d-none"));
      $(`.tab-pane[data-tabpane="${btn.dataset.tab}"]`).classList.remove(
        "d-none",
      );
    });
  });

  /* ==================================================================
     TRANSPORT LABEL TOGGLE (modal)
  ================================================================== */
  $("#fTransport").addEventListener("change", applyTransportLabels);
  $("#fRouteType").addEventListener("change", () => {
    renderRouteStopsUI();
    applyTransportLabels();
  });
  function applyTransportLabels() {
    const air = $("#fTransport").value === "udara";
    $("#lblVesselText").textContent = air
      ? "Nama Maskapai / Pesawat"
      : "Nama Vessel";
    $("#lblVoyageText").textContent = air ? "No. Flight" : "No. Voyage";
    $("#fVessel").placeholder = air ? "Garuda Cargo" : "MV Ever Given";
    $("#fVoyage").placeholder = air ? "GA880/04JUL" : "V.023E";
    $("#lblMasterBL").textContent = air ? "Master AWB" : "Master B/L";
    $("#lblHouseBL").textContent = air ? "House AWB" : "House B/L";
    // Vessel/Voyage di atas hanya "leg terakhir" kalau rutenya transit DAN
    // sudah ada minimal 1 kartu terminal transit.
    const showFinalLegHint =
      $("#fRouteType").value === "transit" && draftStops.length > 0;
    $("#finalLegHintVessel").classList.toggle("d-none", !showFinalLegHint);
    $("#finalLegHintVoyage").classList.toggle("d-none", !showFinalLegHint);
  }

  /* ==================================================================
     AUTO-ARRIVE LIVE FEEDBACK INSIDE MODAL
     Hanya ETA yang otomatis mengubah status. Actual Delivery (#fActual)
     sengaja TIDAK punya listener serupa lagi — mengisi/mengubahnya
     tidak akan menyentuh status sama sekali.
  ================================================================== */
  $("#fEta").addEventListener("change", () => {
    if (isPastOrToday($("#fEta").value) && $("#fStatus").value !== "arrived") {
      $("#fStatus").value = "arrived";
      if (!$("#fActual").value) $("#fActual").value = $("#fEta").value;
      showToast(
        `ETA sudah lewat/hari ini — status otomatis diubah ke "${STATUS_META.arrived.label}".`,
        "success",
      );
    }
  });

  /* ==================================================================
     INCOTERM / CUSTOMS RECALCULATION (modal)
  ================================================================== */
  $("#fIncoterm").addEventListener("change", recalcCustoms);
  ["fFreight", "fInsurance", "fNdpbm", "fTarif", "fBM", "fPPN", "fPPH"].forEach(
    (id) => {
      $("#" + id).addEventListener("input", recalcCustoms);
    },
  );

  function recalcCustoms() {
    const tmp = {
      items: draftItems,
      incoterm: $("#fIncoterm").value,
      ndpbm: Number($("#fNdpbm").value) || 0,
      bm: Number($("#fBM").value) || 0,
      ppn: Number($("#fPPN").value) || 0,
      pph: Number($("#fPPH").value) || 0,
    };
    const calc = computeCustoms(tmp);

    $("#calcTotalUSD").textContent = fmtUSD(calc.totalUSD);

    const isCIF = tmp.incoterm === "CIF";
    const isFOB = tmp.incoterm === "FOB";
    $("#cifBlock").style.display = isCIF ? "flex" : "none";
    $("#fobBlock").style.display = isFOB ? "flex" : "none";
    $("#noCifFobNote").style.display = !isCIF && !isFOB ? "block" : "none";

    if (isCIF) {
      $("#calcCIF").textContent = fmtUSD(calc.cifUsd);
      $("#calcCIFRupiah").textContent = fmtRp(calc.cifRupiah);
    } else if (isFOB) {
      $("#calcFOB").textContent = fmtUSD(calc.fobUsd);
      $("#calcFOBRupiah").textContent = fmtRp(calc.fobRupiah);
    }

    $("#calcBMPDRI").value = fmtRp(calc.bmPdri);

    $("#footTotalQty").textContent = fmtNum(calc.totalQty);
    $("#footTotalNetto").textContent = fmtNum(calc.totalNetto);
    $("#footTotalBruto").textContent = fmtNum(calc.totalBruto);
    $("#footTotalUSD").textContent = fmtUSD(calc.totalUSD);
  }

  /* ==================================================================
     ITEM TABLE (draft, inside modal)
  ================================================================== */
  function renderItemTable() {
    const tbody = $("#itemTableBody");
    tbody.innerHTML = draftItems
      .map(
        (it, idx) => `
      <tr data-idx="${idx}">
        <td><input type="text" data-f="namaBarang" value="${escapeAttr(it.namaBarang)}" placeholder="Nama barang"></td>
        <td><input type="text" data-f="hsCode" value="${escapeAttr(it.hsCode)}" placeholder="0000.00.00"></td>
        <td>
          <select data-f="jenisBarang">
            ${JENIS_OPTIONS.map((o) => `<option value="${o}" ${o === it.jenisBarang ? "selected" : ""}>${o}</option>`).join("")}
          </select>
        </td>
        <td><input type="number" step="0.01" min="0" data-f="qty" value="${it.qty}"></td>
        <td><input type="text" data-f="satuan" value="${escapeAttr(it.satuan)}" placeholder="KG/PCS/SET" list="satuanList"></td>
        <td><input type="number" step="0.01" min="0" data-f="harga" value="${it.harga}"></td>
        <td><input type="number" step="0.01" min="0" data-f="netto" value="${it.netto}"></td>
        <td><input type="number" step="0.01" min="0" data-f="bruto" value="${it.bruto}"></td>
        <td><input type="text" class="subtotal" readonly value="${fmtUSD((Number(it.qty) || 0) * (Number(it.harga) || 0))}"></td>
        <td><button type="button" class="rm-row" data-idx="${idx}" title="Hapus barang ini"><i class="bi bi-x-lg"></i></button></td>
      </tr>
    `,
      )
      .join("");
    recalcCustoms();
  }

  $("#itemTableBody").addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    const field = e.target.dataset.f;
    if (!field) return;
    draftItems[idx][field] = ["qty", "harga", "netto", "bruto"].includes(field)
      ? Number(e.target.value)
      : e.target.value;
    const subtotalInput = tr.querySelector(".subtotal");
    subtotalInput.value = fmtUSD(
      (Number(draftItems[idx].qty) || 0) * (Number(draftItems[idx].harga) || 0),
    );
    recalcCustoms();
  });

  $("#itemTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".rm-row");
    if (!btn) return;
    if (draftItems.length <= 1) {
      showToast("Minimal harus ada 1 barang dalam pengiriman ini.", "danger");
      return;
    }
    draftItems.splice(Number(btn.dataset.idx), 1);
    renderItemTable();
  });

  $("#btnAddItem").addEventListener("click", () => {
    draftItems.push(newItem());
    renderItemTable();
  });

  /* ==================================================================
     ROUTE STOPS / TERMINAL TRANSIT (draft, di dalam modal)
     Hanya tampil kalau Tipe Rute = "transit". Sama seperti daftar
     barang: array draft di memori, re-render penuh saat struktur
     berubah (tambah/hapus/urutkan), mutasi langsung saat isi field
     diketik supaya fokus/cursor tidak hilang.
  ================================================================== */
  function stopCardHtml(st, idx, total) {
    const air = st.transport === "udara";
    const isLast = idx === total - 1;
    return `
      <div class="route-stop-card" data-idx="${idx}">
        <div class="route-stop-head">
          <span class="route-stop-badge"><i class="bi bi-signpost-split"></i> Transit ${idx + 1}</span>
          <div class="route-stop-actions">
            <button type="button" class="mv-stop-up" data-idx="${idx}" title="Naikkan urutan" ${idx === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
            <button type="button" class="mv-stop-down" data-idx="${idx}" title="Turunkan urutan" ${isLast ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
            <button type="button" class="rm-stop" data-idx="${idx}" title="Hapus terminal ini"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
        <div class="row g-2">
          <div class="col-md-5">
            <label class="form-label">Nama Terminal</label>
            <input type="text" class="form-control form-control-sm" data-f="terminal" value="${escapeAttr(st.terminal)}" placeholder="mis. Singapore, Port Klang">
          </div>
          <div class="col-md-2">
            <label class="form-label">Moda</label>
            <select class="form-select form-select-sm" data-f="transport">
              <option value="laut" ${!air ? "selected" : ""}>Laut</option>
              <option value="udara" ${air ? "selected" : ""}>Udara</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">${air ? "Nama Pesawat/Maskapai" : "Nama Vessel"}</label>
            <input type="text" class="form-control form-control-sm" data-f="vessel" value="${escapeAttr(st.vessel)}">
          </div>
          <div class="col-md-2">
            <label class="form-label">${air ? "No. Flight" : "No. Voyage"}</label>
            <input type="text" class="form-control form-control-sm" data-f="voyage" value="${escapeAttr(st.voyage)}">
          </div>
          <div class="col-md-4">
            <label class="form-label">Tiba di Terminal Ini</label>
            <input type="date" class="form-control form-control-sm" data-f="arrivalDate" value="${st.arrivalDate || ""}">
          </div>
          <div class="col-md-4">
            <label class="form-label">Berangkat dari Terminal Ini</label>
            <input type="date" class="form-control form-control-sm" data-f="departureDate" value="${st.departureDate || ""}">
          </div>
        </div>
        ${
          isLast
            ? `<div class="form-text-note mt-1"><i class="bi bi-arrow-return-right"></i> Leg setelah terminal ini (menuju Pelabuhan Tujuan) memakai field Moda Transportasi/Vessel/Voyage di bagian atas form.</div>`
            : ""
        }
      </div>`;
  }

  function renderRouteStopsUI() {
    const isTransit = $("#fRouteType").value === "transit";
    $("#routeStopsWrap").classList.toggle("d-none", !isTransit);
    if (!isTransit) return;
    $("#routeStopsBody").innerHTML = draftStops.length
      ? draftStops
          .map((st, idx) => stopCardHtml(st, idx, draftStops.length))
          .join("")
      : `<div class="form-text-note">Belum ada terminal transit — klik "Tambah Terminal" di atas.</div>`;
  }

  $("#routeStopsBody").addEventListener("input", (e) => {
    const card = e.target.closest(".route-stop-card");
    if (!card) return;
    const idx = Number(card.dataset.idx);
    const field = e.target.dataset.f;
    if (!field) return;
    draftStops[idx][field] = e.target.value;
    // Cuma field Moda yang butuh re-render (label Vessel/Voyage di kartu
    // ini ikut berubah). Field lain cukup mutasi array saja supaya fokus/
    // kursor saat mengetik tidak hilang.
    if (field === "transport") {
      renderRouteStopsUI();
      applyTransportLabels();
    }
  });

  $("#routeStopsBody").addEventListener("click", (e) => {
    const rm = e.target.closest(".rm-stop");
    const up = e.target.closest(".mv-stop-up");
    const down = e.target.closest(".mv-stop-down");
    if (rm) {
      draftStops.splice(Number(rm.dataset.idx), 1);
      renderRouteStopsUI();
      applyTransportLabels();
      return;
    }
    if (up) {
      const idx = Number(up.dataset.idx);
      if (idx > 0) {
        [draftStops[idx - 1], draftStops[idx]] = [
          draftStops[idx],
          draftStops[idx - 1],
        ];
        renderRouteStopsUI();
      }
      return;
    }
    if (down) {
      const idx = Number(down.dataset.idx);
      if (idx < draftStops.length - 1) {
        [draftStops[idx + 1], draftStops[idx]] = [
          draftStops[idx],
          draftStops[idx + 1],
        ];
        renderRouteStopsUI();
      }
      return;
    }
  });

  $("#btnAddStop").addEventListener("click", () => {
    draftStops.push(newStop());
    renderRouteStopsUI();
    applyTransportLabels();
  });

  /* ==================================================================
     OPEN / SAVE EDIT MODAL
  ================================================================== */
  /* ==================================================================
     IMPORT DARI EXCEL (dokumen BC mentah: sheet HEADER, ENTITAS,
     DOKUMEN, PENGANGKUT, KEMASAN, KONTAINER, PUNGUTAN, BARANG, RESPON)

     Mapping utama (sesuai arahan):
       - No. Aju        <- HEADER.NOMOR AJU
       - No. SPPB       <- HEADER.NOMOR DAFTAR
       - Tanggal SPPB   <- RESPON, baris dengan KODE RESPON=2003 -> TANGGAL RESPON
         (bukan HEADER.TANGGAL DAFTAR)
       - Incoterms      <- HEADER.KODE INCOTERM
       - Nama Shipper   <- ENTITAS (KODE ENTITAS=9).NAMA ENTITAS
       - No. Invoice    <- DOKUMEN (KODE DOKUMEN=380).NOMOR DOKUMEN
       - Master BL/AWB  <- DOKUMEN (KODE DOKUMEN=740 atau 742).NOMOR DOKUMEN
       - House BL/AWB   <- DOKUMEN (KODE DOKUMEN=741 atau 743).NOMOR DOKUMEN
     Sisanya (freight/insurance/ndpbm/pelabuhan/vessel/moda/package/
     kontainer/BM/PPN/PPH/daftar barang) dipetakan sendiri dari sheet
     yang relevan; kalau memang tidak ada datanya di file, field itu
     saja yang dikosongkan/dilewati — field lain yang datanya ada tetap
     diisi.
  ================================================================== */
  function excelSerialToISODate(serial) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + Math.round(serial) * 86400000);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const MONTH_ABBR_IDX = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  // Robust terhadap beberapa kemungkinan bentuk tanggal dari SheetJS:
  // string ISO, objek Date asli, angka serial Excel, string "D-MMM-YY"
  // (format yang dipakai fitur Salin ke Excel / Bulk Export), atau
  // "DD/MM/YYYY".
  function excelValueToISODate(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return "";
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, "0");
      const d = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (typeof v === "number") return excelSerialToISODate(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (m) {
      const mon = MONTH_ABBR_IDX[m[2].toLowerCase()];
      if (mon != null) {
        let yr = parseInt(m[3], 10);
        if (yr < 100) yr += 2000;
        return `${yr}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
    }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return "";
  }

  function excelStr(v) {
    return v == null ? "" : String(v).trim();
  }
  function excelNum(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    // String angka locale ID (koma desimal) atau biasa (titik desimal).
    const n = Number(String(v).trim().replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function sheetRows(wb, name) {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  }

  // Deskripsi barang: URAIAN + Merk/Tipe (kalau bukan placeholder
  // "TANPA MEREK" / "TANPA TIPE").
  function buildImportedNamaBarang(row) {
    let desc = excelStr(row["URAIAN"]);
    const merek = excelStr(row["MEREK"]);
    const tipe = excelStr(row["TIPE"]);
    const isPlaceholder = (v) => !v || /^TANPA\s/i.test(v);
    const parts = [];
    if (!isPlaceholder(merek)) parts.push(`Merk: ${merek}`);
    if (!isPlaceholder(tipe)) parts.push(`Tipe: ${tipe}`);
    if (parts.length) desc += (desc ? " " : "") + parts.join(", ");
    return desc.trim();
  }

  function parseBcExcelWorkbook(wb) {
    const notes = [];
    const header = sheetRows(wb, "HEADER")[0] || {};
    const respon = sheetRows(wb, "RESPON");
    const entitas = sheetRows(wb, "ENTITAS");
    const dokumen = sheetRows(wb, "DOKUMEN");
    const pengangkut = sheetRows(wb, "PENGANGKUT")[0] || {};
    const kemasan = sheetRows(wb, "KEMASAN");
    const kontainer = sheetRows(wb, "KONTAINER");
    const pungutan = sheetRows(wb, "PUNGUTAN");
    const barang = sheetRows(wb, "BARANG");

    const findDokumen = (...codes) => {
      const row = dokumen.find((r) =>
        codes.includes(excelStr(r["KODE DOKUMEN"])),
      );
      return row ? excelStr(row["NOMOR DOKUMEN"]) : "";
    };
    const findPungutan = (kode) => {
      const row = pungutan.find(
        (r) => excelStr(r["KODE JENIS PUNGUTAN"]).toUpperCase() === kode,
      );
      return row ? excelNum(row["NILAI PUNGUTAN"]) : null;
    };

    const shipper = entitas.find((r) => excelStr(r["KODE ENTITAS"]) === "9");

    const kodeCaraAngkut = excelStr(pengangkut["KODE CARA ANGKUT"]);
    const transport =
      kodeCaraAngkut === "4" ? "udara" : kodeCaraAngkut === "1" ? "laut" : "";

    const modeHint =
      header["KODE JENIS EKSPOR"] != null
        ? "export"
        : header["KODE JENIS IMPOR"] != null
          ? "import"
          : "";

    const packageStr = kemasan
      .map((r) => {
        const jml = r["JUMLAH KEMASAN"];
        const kode = excelStr(r["KODE KEMASAN"]);
        return [jml != null ? excelNum(jml) : "", kode]
          .filter((v) => v !== "")
          .join(" ");
      })
      .filter((v) => v)
      .join(", ");

    const containerStr = kontainer
      .map((r) => {
        const no = excelStr(r["NOMOR KONTINER"]);
        const size = excelStr(r["KODE UKURAN KONTAINER"]);
        if (!no) return "";
        return size ? `${no} (${size})` : no;
      })
      .filter((v) => v)
      .join(", ");

    // Tanggal SPPB = TANGGAL RESPON di sheet RESPON, pada baris yang
    // KODE RESPON-nya = 2003 (kode respon SPPB terbit) — bukan asal
    // ambil baris terakhir, karena 1 AJU bisa punya beberapa baris
    // respons dengan kode berbeda. Fallback ke HEADER.TANGGAL DAFTAR
    // kalau baris kode 2003 tidak ditemukan.
    const sppbRespon = respon.find(
      (r) => excelStr(r["KODE RESPON"]) === "2003",
    );
    const respTanggal = sppbRespon
      ? excelValueToISODate(sppbRespon["TANGGAL RESPON"])
      : "";
    if (respon.length && !sppbRespon) {
      notes.push(
        "Baris respons dengan KODE RESPON=2003 (SPPB terbit) tidak ditemukan di sheet RESPON — Tanggal SPPB fallback ke HEADER.TANGGAL DAFTAR, cek manual.",
      );
    }

    const fields = {
      noAju: excelStr(header["NOMOR AJU"]),
      docNo: excelStr(header["NOMOR DAFTAR"]),
      docDate: respTanggal || excelValueToISODate(header["TANGGAL DAFTAR"]),
      incoterm: excelStr(header["KODE INCOTERM"]).toUpperCase(),
      party: shipper ? excelStr(shipper["NAMA ENTITAS"]) : "",
      invoice: findDokumen("380"),
      masterBL: findDokumen("740", "742"),
      houseBL: findDokumen("741", "743"),
      freight: header["FREIGHT"] != null ? excelNum(header["FREIGHT"]) : null,
      insurance:
        header["ASURANSI"] != null ? excelNum(header["ASURANSI"]) : null,
      ndpbm: header["NDPBM"] != null ? excelNum(header["NDPBM"]) : null,
      origin: excelStr(header["KODE PELABUHAN MUAT"]),
      destination: excelStr(header["KODE PELABUHAN TUJUAN"]),
      actual: excelValueToISODate(header["TANGGAL TIBA"]),
      etd: excelValueToISODate(header["TANGGAL BERANGKAT"]),
      vessel: excelStr(pengangkut["NAMA PENGANGKUT"]),
      voyage: excelStr(pengangkut["NOMOR PENGANGKUT"]),
      transport,
      package: packageStr,
      container: containerStr,
      bm: findPungutan("BM"),
      ppn: findPungutan("PPN"),
      pph: findPungutan("PPH"),
    };

    // DAFTAR BARANG. Netto biasanya tersedia per barang. Bruto kadang
    // hanya tersedia agregat di HEADER (tidak per barang) — kalau semua
    // barang bruto-nya 0 tapi HEADER.BRUTO > 0, taruh nilai HEADER itu
    // di barang pertama saja (bukan dibagi rata) supaya totalnya benar,
    // lalu kasih catatan supaya dicek manual.
    const headerBruto = excelNum(header["BRUTO"]);
    const itemsRaw = barang.map((row) => ({
      namaBarang: buildImportedNamaBarang(row),
      hsCode: excelStr(row["HS"]),
      satuan: excelStr(row["KODE SATUAN"]),
      qty: excelNum(row["JUMLAH SATUAN"]),
      harga: excelNum(row["HARGA SATUAN"]),
      netto: excelNum(row["NETTO"]),
      bruto: excelNum(row["BRUTO"]),
    }));
    const anyItemBruto = itemsRaw.some((it) => it.bruto > 0);
    if (!anyItemBruto && headerBruto > 0 && itemsRaw.length) {
      itemsRaw[0].bruto = headerBruto;
      notes.push(
        `Bruto per barang tidak ada di file ini — total Bruto dari HEADER (${fmtNum(headerBruto)} Kg) ditaruh di baris barang pertama, sesuaikan manual per barang kalau perlu.`,
      );
    }
    const items = itemsRaw.map((it) => ({
      ...newItem(),
      ...it,
      jenisBarang: "Bahan Baku",
    }));

    if (!items.length) {
      notes.push(
        "Sheet BARANG kosong/tidak ditemukan — daftar barang tidak terisi otomatis, tambahkan manual.",
      );
    }
    if (!fields.party) {
      notes.push(
        "Nama Shipper (KODE ENTITAS=9) tidak ditemukan di sheet ENTITAS.",
      );
    }
    if (!fields.masterBL && !fields.houseBL) {
      notes.push(
        "Master/House BL/AWB tidak ditemukan di sheet DOKUMEN (kode 740/741/742/743).",
      );
    }
    if (!transport) {
      notes.push(
        "Moda transportasi tidak terdeteksi dari KODE CARA ANGKUT — cek manual di tab Transportasi.",
      );
    }
    if (!fields.bm && findPungutan("BM") == null) {
      notes.push(
        "Bea Masuk/PPN/PPH tidak ditemukan di sheet PUNGUTAN — isi manual di tab Kepabeanan.",
      );
    }

    return { fields, items, notes, modeHint };
  }

  function setFieldIfPresent(id, value) {
    if (value !== "" && value != null) {
      $("#" + id).value = value;
      return true;
    }
    return false;
  }

  function applyImportedBcData(parsed) {
    const f = parsed.fields;
    const notes = parsed.notes.slice();
    let filled = 0;
    const mark = (ok) => {
      if (ok) filled++;
      return ok;
    };

    mark(setFieldIfPresent("fNoAju", f.noAju));
    mark(setFieldIfPresent("fDocNo", f.docNo));
    mark(setFieldIfPresent("fDocDate", f.docDate));
    mark(setFieldIfPresent("fParty", f.party));
    mark(setFieldIfPresent("fInvoice", f.invoice));
    mark(setFieldIfPresent("fMasterBL", f.masterBL));
    mark(setFieldIfPresent("fHouseBL", f.houseBL));
    mark(setFieldIfPresent("fVessel", f.vessel));
    mark(setFieldIfPresent("fVoyage", f.voyage));
    mark(setFieldIfPresent("fContainer", f.container));
    mark(setFieldIfPresent("fOrigin", f.origin));
    mark(setFieldIfPresent("fDestination", f.destination));
    mark(setFieldIfPresent("fActual", f.actual));
    mark(setFieldIfPresent("fEtd", f.etd));
    mark(setFieldIfPresent("fPackage", f.package));

    if (f.freight != null) {
      $("#fFreight").value = f.freight;
      filled++;
    }
    if (f.insurance != null) {
      $("#fInsurance").value = f.insurance;
      filled++;
    }
    if (f.ndpbm != null) {
      $("#fNdpbm").value = f.ndpbm;
      filled++;
    }
    if (f.bm != null) {
      $("#fBM").value = f.bm;
      filled++;
    }
    if (f.ppn != null) {
      $("#fPPN").value = f.ppn;
      filled++;
    }
    if (f.pph != null) {
      $("#fPPH").value = f.pph;
      filled++;
    }

    if (f.transport) {
      $("#fTransport").value = f.transport;
      filled++;
    }

    if (f.incoterm) {
      const hasOpt = Array.from($("#fIncoterm").options).some(
        (o) => o.value === f.incoterm,
      );
      if (hasOpt) {
        $("#fIncoterm").value = f.incoterm;
        filled++;
      } else
        notes.push(
          `Kode incoterm "${f.incoterm}" dari file tidak ada di pilihan dropdown — pilih manual.`,
        );
    }

    if (parsed.items.length) {
      draftItems = parsed.items;
    }

    if (parsed.modeHint && parsed.modeHint !== activeMode) {
      notes.push(
        `File ini sepertinya dokumen ${parsed.modeHint === "import" ? "IMPORT" : "EXPORT"}, tapi form yang terbuka sekarang mode ${activeMode === "import" ? "IMPORT" : "EXPORT"} — cek lagi sebelum simpan.`,
      );
    }

    applyTransportLabels();
    renderItemTable();

    const summary = `${filled} field & ${parsed.items.length} barang terisi otomatis dari file Excel.`;
    return { summary, notes };
  }

  function showImportNotes(summary, notes) {
    const box = $("#importNotesBox");
    const summaryEl = $("#importNotesSummary");
    const list = $("#importNotesList");
    if (!summary && !notes.length) {
      box.classList.add("d-none");
      summaryEl.innerHTML = "";
      list.innerHTML = "";
      return;
    }
    summaryEl.innerHTML = summary
      ? `<i class="bi bi-check-circle-fill"></i> ${escapeHtml(summary)}`
      : "";
    list.innerHTML = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
    box.classList.remove("d-none");
  }

  $("#btnImportExcel").addEventListener("click", () => {
    $("#fileImportExcel").value = "";
    $("#fileImportExcel").click();
  });

  $("#fileImportExcel").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const btn = $("#btnImportExcel");
    const originalHtml = btn.innerHTML;
    btn.classList.add("is-loading");
    btn.disabled = true;
    btn.innerHTML = `<i class="bi bi-arrow-repeat spin"></i> Membaca file...`;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const missing = ["HEADER", "BARANG"].filter((n) => !wb.Sheets[n]);
      if (missing.length) {
        showToast(
          `File ini bukan format dokumen BC yang dikenali (sheet ${missing.join(", ")} tidak ada).`,
          "danger",
        );
        return;
      }
      const parsed = parseBcExcelWorkbook(wb);
      const { summary, notes } = applyImportedBcData(parsed);
      showImportNotes(summary, notes);
      showToast(
        `${summary}${notes.length ? " Ada catatan yang perlu dicek di atas form." : ""}`,
        notes.length ? "warning" : "success",
      );
    } catch (err) {
      console.error(err);
      showToast(
        "Gagal membaca file Excel ini. Pastikan formatnya sesuai export dokumen BC (HEADER/BARANG/dst).",
        "danger",
      );
    } finally {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  function openModal(id) {
    const lbl = ML();
    $("#importNotesBox").classList.add("d-none");
    $("#importNotesSummary").innerHTML = "";
    $("#importNotesList").innerHTML = "";
    $("#lblDocNo").textContent = lbl.docNo;
    $("#lblDocDate").textContent = lbl.docDate;
    $("#lblParty").textContent = lbl.party;
    $("#lblFactoryDate").textContent = lbl.factoryDate;
    $("#lblFactoryTime").textContent = lbl.factoryTime;
    $("#lblOrigin").textContent = lbl.origin;
    $("#lblDestination").textContent = lbl.destination;
    $("#lblActual").textContent = lbl.actual;
    $("#dutySection").classList.toggle("d-none", !lbl.showDuty);

    $$("#detailTabs .nav-link").forEach((b, i) =>
      b.classList.toggle("active", i === 0),
    );
    $$(".tab-pane").forEach((p, i) => p.classList.toggle("d-none", i !== 0));

    if (id) {
      const s = currentList().find((x) => x.id === id);
      $("#modalTitle").textContent = lbl.modalTitleEdit;
      $("#fId").value = s.id;
      $("#fDocNo").value = s.docNo || "";
      $("#fDocDate").value = s.docDate || "";
      $("#fNoAju").value = s.noAju || "";
      $("#fParty").value = s.party || "";
      $("#fInvoice").value = s.invoice || "";
      $("#fMasterBL").value = s.masterBL || "";
      $("#fHouseBL").value = s.houseBL || "";
      $("#fFactoryDate").value = s.factoryDate || "";
      $("#fFactoryTime").value = s.factoryTime || "";
      $("#fForwarder").value = s.forwarder || "";
      $("#fForwarderPic").value = s.forwarderPic || "";
      $("#fTransport").value = s.transport || "laut";
      $("#fVessel").value = s.vessel || "";
      $("#fVoyage").value = s.voyage || "";
      $("#fContainer").value = s.container || "";
      $("#fMuatan").value = s.muatan || "";
      $("#fOrigin").value = s.origin || "";
      $("#fDestination").value = s.destination || "";
      $("#fEtd").value = s.etd || "";
      $("#fEta").value = s.eta || "";
      $("#fActual").value = s.actual || "";
      $("#fStatus").value = s.status || "process";
      $("#fNotes").value = s.notes || "";
      $("#fIncoterm").value = s.incoterm || "FOB";
      $("#fFreight").value = s.freight || "";
      $("#fInsurance").value = s.insurance || "";
      $("#fNdpbm").value = s.ndpbm || "";
      $("#fTarif").value = s.tarif || "";
      $("#fBM").value = s.bm || "";
      $("#fPPN").value = s.ppn || "";
      $("#fPPH").value = s.pph || "";
      $("#fPI").value = s.pi || "";
      $("#fSKB").value = s.skb || (activeMode === "import" ? "PPH" : "");
      $("#fPackage").value = s.package || "";
      $("#fRouteType").value = s.routeType || "direct";
      draftItems = JSON.parse(
        JSON.stringify(s.items && s.items.length ? s.items : [newItem()]),
      );
      draftStops = JSON.parse(JSON.stringify(s.routeStops || []));
    } else {
      $("#modalTitle").textContent = lbl.modalTitleNew;
      $("#fId").value = "";
      [
        "fDocNo",
        "fDocDate",
        "fNoAju",
        "fParty",
        "fInvoice",
        "fMasterBL",
        "fHouseBL",
        "fFactoryDate",
        "fFactoryTime",
        "fForwarder",
        "fForwarderPic",
        "fVessel",
        "fVoyage",
        "fContainer",
        "fOrigin",
        "fDestination",
        "fEtd",
        "fEta",
        "fActual",
        "fNotes",
        "fFreight",
        "fInsurance",
        "fNdpbm",
        "fTarif",
        "fBM",
        "fPPN",
        "fPPH",
        "fPI",
        "fPackage",
      ].forEach((fid) => ($("#" + fid).value = ""));
      $("#fMuatan").value = "";
      $("#fTransport").value = "laut";
      $("#fStatus").value = "process";
      $("#fIncoterm").value = "FOB";
      $("#fSKB").value = activeMode === "import" ? "PPH" : "";
      $("#fRouteType").value = "direct";
      draftItems = [newItem()];
      draftStops = [];
    }
    applyTransportLabels();
    renderItemTable();
    renderRouteStopsUI();
    shipmentModal.show();
  }

  $("#btnSaveShipment").addEventListener("click", async () => {
    if (!$("#fEtd").value || !$("#fEta").value) {
      showToast("Mohon isi ETD dan ETA terlebih dahulu.", "danger");
      return;
    }
    const cleanItems = draftItems.filter((it) => it.namaBarang.trim() !== "");
    if (cleanItems.length === 0) {
      showToast(
        "Mohon isi minimal 1 nama barang pada tab Daftar Barang.",
        "danger",
      );
      return;
    }
    const routeType = $("#fRouteType").value;
    // Direct = persis 2 terminal (asal & tujuan yang sudah ada), jadi tidak
    // pernah mengirim baris shipment_route_stops apa pun kalau direct —
    // walaupun draftStops masih menyimpan kartu yang sempat diisi (biar
    // tidak hilang kalau user cuma salah pencet dropdown, tapi tidak akan
    // pernah ikut kesimpan selama masih "direct").
    const cleanStops =
      routeType === "transit"
        ? draftStops.filter((st) => st.terminal.trim() !== "")
        : [];
    if (routeType === "transit" && cleanStops.length === 0) {
      showToast(
        'Mohon tambahkan minimal 1 Terminal Transit, atau ganti Tipe Rute ke "Direct".',
        "danger",
      );
      return;
    }
    const id = $("#fId").value;
    const payload = {
      transport: $("#fTransport").value,
      docNo: $("#fDocNo").value.trim(),
      docDate: $("#fDocDate").value,
      noAju: $("#fNoAju").value.trim(),
      party: $("#fParty").value.trim(),
      invoice: $("#fInvoice").value.trim(),
      masterBL: $("#fMasterBL").value.trim(),
      houseBL: $("#fHouseBL").value.trim(),
      factoryDate: $("#fFactoryDate").value,
      factoryTime: $("#fFactoryTime").value,
      forwarder: $("#fForwarder").value.trim(),
      forwarderPic: $("#fForwarderPic").value.trim(),
      vessel: $("#fVessel").value.trim(),
      voyage: $("#fVoyage").value.trim(),
      container: $("#fContainer").value.trim(),
      muatan: $("#fMuatan").value,
      routeType: routeType,
      origin: $("#fOrigin").value.trim(),
      destination: $("#fDestination").value.trim(),
      etd: $("#fEtd").value,
      eta: $("#fEta").value,
      actual: $("#fActual").value,
      status: $("#fStatus").value,
      notes: $("#fNotes").value.trim(),
      incoterm: $("#fIncoterm").value,
      freight: Number($("#fFreight").value) || 0,
      insurance: Number($("#fInsurance").value) || 0,
      ndpbm: Number($("#fNdpbm").value) || 0,
      tarif: Number($("#fTarif").value) || 0,
      bm: Number($("#fBM").value) || 0,
      ppn: Number($("#fPPN").value) || 0,
      pph: Number($("#fPPH").value) || 0,
      pi: $("#fPI").value.trim(),
      skb: $("#fSKB").value.trim(),
      package: $("#fPackage").value.trim(),
    };

    const btn = $("#btnSaveShipment");
    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status"></span> Menyimpan...';
    try {
      if (id) {
        await updateShipmentRecord(id, payload, cleanItems, cleanStops);
      } else {
        await createShipment(payload, cleanItems, cleanStops);
      }
      await loadShipments();
      shipmentModal.hide();
      showToast("Jadwal berhasil disimpan.", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan jadwal ke database.", "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  });

  /* ==================================================================
     DETAIL VIEW (read-only)
  ================================================================== */
  function fieldPair(label, value, icon) {
    return `<div class="info-item"><div class="info-label">${icon ? `<i class="bi ${icon}"></i> ` : ""}${escapeHtml(label)}</div><div class="info-value">${value || "—"}</div></div>`;
  }

  // Daftar terminal transit (read-only) untuk detail view. Kosong sama
  // sekali kalau route_type = "direct" (tidak ada perubahan tampilan).
  function buildDetailStopsHtml(s) {
    const stops = routeStopList(s);
    if (!isTransitRoute(s)) return "";
    const rows = stops
      .map((st, i) => {
        const air = st.transport === "udara";
        return `
        <div class="detail-stop-row">
          <span class="detail-stop-badge">${i + 1}</span>
          <div class="detail-stop-body">
            <div class="detail-stop-name">${escapeHtml(dispVal(st.terminal))}</div>
            <div class="detail-stop-meta">
              <i class="bi ${air ? "bi-airplane" : "bi-water"}"></i> ${escapeHtml(dispVal(st.vessel))}
              ${hasMeaningfulValue(st.voyage) ? " · " + (air ? "No. Flight " : "No. Voyage ") + escapeHtml(st.voyage) : ""}
              &nbsp;•&nbsp; Tiba: <b>${fmtDate(st.arrivalDate)}</b>
              &nbsp;·&nbsp; Berangkat: <b>${fmtDate(st.departureDate)}</b>
            </div>
          </div>
        </div>`;
      })
      .join("");
    return `
      <div class="subsection-title mt-2"><i class="bi bi-signpost-split"></i> Terminal Transit</div>
      <div class="detail-stop-list mb-2">${rows}</div>`;
  }

  function buildDetailHtml(s) {
    const lbl = ML();
    const calc = computeCustoms(s);
    const meta = STATUS_META[s.status] || STATUS_META.process;

    let itemRows = (s.items || [])
      .map(
        (it) => `
      <tr>
        <td>${escapeHtml(it.namaBarang)}</td>
        <td>${escapeHtml(it.hsCode || "—")}</td>
        <td>${escapeHtml(it.jenisBarang || "—")}</td>
        <td class="text-center">${fmtNum(it.qty)}</td>
        <td class="text-center">${escapeHtml(it.satuan || "—")}</td>
        <td class="text-center">${fmtUSD(it.harga)}</td>
        <td class="text-center">${fmtNum(it.netto)} Kg</td>
        <td class="text-center">${fmtNum(it.bruto)} Kg</td>
        <td class="text-center">${fmtUSD((Number(it.qty) || 0) * (Number(it.harga) || 0))}</td>
      </tr>`,
      )
      .join("");

    let customsHtml = `
      <div class="subsection-title"><i class="bi bi-cash-coin"></i> Incoterm &amp; Nilai Barang</div>
      <div class="info-grid">
        ${fieldPair("Incoterms", escapeHtml(s.incoterm || "—"))}
        ${fieldPair("Freight (USD)", fmtUSD(s.freight))}
        ${fieldPair("Insurance (USD)", fmtUSD(s.insurance))}
        ${fieldPair("NDPBM", fmtRp(s.ndpbm))}
        ${fieldPair("Total Nilai Barang (USD)", fmtUSD(calc.totalUSD))}
        ${
          s.incoterm === "CIF"
            ? fieldPair("CIF (USD)", fmtUSD(calc.cifUsd)) +
              fieldPair("CIF Rupiah", fmtRp(calc.cifRupiah))
            : s.incoterm === "FOB"
              ? fieldPair("FOB (USD)", fmtUSD(calc.fobUsd)) +
                fieldPair("FOB Rupiah", fmtRp(calc.fobRupiah))
              : ""
        }
      </div>`;

    if (s.incoterm !== "CIF" && s.incoterm !== "FOB") {
      customsHtml += `<div class="form-text-note mb-2">Incoterm ini bukan CIF maupun FOB — nilai CIF, CIF Rupiah, dan FOB Rupiah otomatis 0.</div>`;
    }

    if (lbl.showDuty) {
      customsHtml += `
        <div class="subsection-title"><i class="bi bi-receipt"></i> Bea &amp; Pajak Impor</div>
        <div class="info-grid">
          ${fieldPair("Tarif", (Number(s.tarif) || 0) + " %")}
          ${fieldPair("Bea Masuk", fmtRp(s.bm))}
          ${fieldPair("PPN", fmtRp(s.ppn))}
          ${fieldPair("PPH", fmtRp(s.pph))}
          ${fieldPair("BM + PDRI", fmtRp(calc.bmPdri))}
          ${fieldPair("Keterangan PI", escapeHtml(dispVal(s.pi)))}
          ${fieldPair("Fasilitas SKB", escapeHtml(dispVal(s.skb)))}
        </div>`;
    }

    return `
      <div class="detail-header">
        <div>
          <div class="item-name">${escapeHtml(dispVal(s.party))}</div>
          <div class="po-code">${lbl.docNo}: ${escapeHtml(dispVal(s.docNo))} · ${lbl.docDate}: ${fmtDate(s.docDate)}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="detail-badge-mode">${activeMode === "import" ? "Import" : "Export"}</span>
          <span class="status-select ${meta.class}" style="pointer-events:none; padding-right:14px; background-image:none;">${meta.label}</span>
        </div>
      </div>

      <div class="subsection-title"><i class="bi bi-file-earmark-text"></i> Dokumen &amp; Umum</div>
      <div class="info-grid">
        ${fieldPair("No. Aju", escapeHtml(dispVal(s.noAju)))}
        ${fieldPair(lbl.party, escapeHtml(dispVal(s.party)))}
        ${fieldPair("No. Invoice", escapeHtml(dispVal(s.invoice)))}
        ${fieldPair(s.transport === "udara" ? "Master AWB" : "Master B/L", escapeHtml(dispVal(s.masterBL)))}
        ${fieldPair(s.transport === "udara" ? "House AWB" : "House B/L", escapeHtml(dispVal(s.houseBL)))}
        ${fieldPair(lbl.factoryDate, s.factoryDate ? fmtDate(s.factoryDate) + (s.factoryTime ? " · " + escapeHtml(s.factoryTime) : "") : "—")}
        ${fieldPair("Nama Forwarder", escapeHtml(dispVal(s.forwarder)))}
        ${fieldPair("PIC Forwarder", escapeHtml(dispVal(s.forwarderPic)))}
      </div>

      <div class="subsection-title"><i class="bi bi-compass"></i> Transportasi &amp; Rute</div>
      <div class="info-grid">
        ${fieldPair("Moda Transportasi", s.transport === "udara" ? "Udara" : "Laut")}
        ${fieldPair(s.transport === "udara" ? (isTransitRoute(s) ? "Maskapai (Leg Terakhir)" : "Maskapai / Pesawat") : isTransitRoute(s) ? "Vessel (Leg Terakhir)" : "Vessel", escapeHtml(dispVal(s.vessel)))}
        ${fieldPair(s.transport === "udara" ? "No. Flight" : "No. Voyage", escapeHtml(dispVal(s.voyage)))}
        ${fieldPair("Kontainer", escapeHtml(dispVal(s.container)))}
        ${fieldPair("Jenis Muatan", escapeHtml(s.muatan || "—"))}
        ${fieldPair("Tipe Rute", isTransitRoute(s) ? `Transit (${routeStopList(s).length} Terminal Singgah)` : "Direct")}
        ${fieldPair(lbl.origin, escapeHtml(dispVal(s.origin)))}
        ${fieldPair(lbl.destination, escapeHtml(dispVal(s.destination)))}
        ${fieldPair("ETD", fmtDate(s.etd))}
        ${fieldPair("ETA", fmtDate(s.eta))}
        ${fieldPair(lbl.actual, fmtDate(s.actual))}
      </div>
      ${buildDetailStopsHtml(s)}
      ${hasMeaningfulValue(s.notes) ? `<div class="form-text-note mb-3"><i class="bi bi-sticky"></i> Catatan: ${escapeHtml(s.notes)}</div>` : ""}

      <div class="subsection-title"><i class="bi bi-boxes"></i> Daftar Barang</div>
      <div class="item-table-wrap mb-2">
        <table class="item-table">
          <thead><tr>
            <th>Nama Barang</th><th>HS Code</th><th>Jenis Barang</th>
            <th class="text-center">Qty</th><th class="text-center">Satuan</th><th class="text-center">Harga/Unit</th>
            <th class="text-center">Netto</th><th class="text-center">Bruto</th><th class="text-center">Subtotal</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
      <div class="item-table-foot item-table-foot--split mb-3">
        <div class="foot-package">${hasMeaningfulValue(s.package) ? `<i class="bi bi-box-seam"></i> Package: <b>${escapeHtml(s.package)}</b>` : ""}</div>
        <div class="foot-totals">
          <div>Total Qty: <b>${fmtNum(calc.totalQty)}</b></div>
          <div>Total Netto: <b>${fmtNum(calc.totalNetto)}</b> Kg</div>
          <div>Total Bruto: <b>${fmtNum(calc.totalBruto)}</b> Kg</div>
          <div>Total Nilai: <b>${fmtUSD(calc.totalUSD)}</b></div>
        </div>
      </div>

      ${customsHtml}
    `;
  }

  function openDetailView(id) {
    const s = currentList().find((x) => x.id === id);
    if (!s) return;
    currentDetailId = id;
    $("#detailViewBody").innerHTML = buildDetailHtml(s);
    detailViewModal.show();
  }

  $("#btnGotoEdit").addEventListener("click", () => {
    const id = currentDetailId;
    detailViewModal.hide();
    setTimeout(() => openModal(id), 150);
  });

  /* ==================================================================
     FILTERS
  ================================================================== */
  $("#searchInput").addEventListener("input", () => {
    currentPage = 1;
    render();
  });
  $("#filterStatus").addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  $("#sortDir").addEventListener("change", (e) => {
    sortDir = e.target.value;
    currentPage = 1;
    render();
  });

  /* ==================================================================
     BULK EXPORT / IMPORT (Excel, menggantikan Ekspor JSON & Impor)
     Format kolom mengikuti IMPORT_FORMAT.xlsx (31 kolom, NO..REMARK)
     dan EXPORT_FORMAT.xlsx (18 kolom, NO..REMARK), sheet pertama di
     file = data (sheet SUMMARY di template asli diabaikan).
  ================================================================== */
  const IMPORT_BULK_HEADERS = [
    "NO",
    "IN FACTORY",
    "SPPB",
    "DATE",
    "AJU",
    "SUPPLIER NAME",
    "ITEM",
    "HS CODE",
    "DESCRIPTION",
    "QTY",
    "SAT",
    "AMOUNT",
    "NDPBM",
    "INCOTERMS",
    "FREIGHT",
    "INSURANCE",
    "CIF",
    "FOB RUPIAH",
    "CIF RUPIAH",
    "TARIF",
    "BEA MASUK",
    "PPN 11%",
    "PPH",
    "TOTAL BM+PDRI",
    "PI",
    "FASILITAS / SKB",
    "BL/AWB",
    "NO. INVOICE / DEL.NOTE",
    "VESSEL",
    "PACKAGE",
    "REMARK",
  ];
  const EXPORT_BULK_HEADERS = [
    "NO",
    "PENGIRIMAN DARI PABRIK",
    "PEB",
    "DATE",
    "AJU",
    "CONSIGNEE",
    "HS CODE",
    "DESCRIPTION",
    "QTY",
    "AMOUNT",
    "INCOTERMS",
    "FREIGHT",
    "INSURANCE",
    "BL/AWB",
    "NO. INVOICE / DEL.NOTE",
    "VESSEL",
    "PACKAGE",
    "REMARK",
  ];
  // Index kolom (0-based, termasuk NO di depan) buat baca-balik saat Bulk
  // Import — harus sinkron persis dengan urutan header & dengan susunan
  // buildExcelCopyRows()/buildExportCopyRows() (yang tidak termasuk NO
  // & REMARK, makanya semua index di sini +1 dari index di fungsi itu).
  const IMPORT_IDX = {
    NO: 0,
    FACTORY: 1,
    DOCNO: 2,
    DATE: 3,
    AJU: 4,
    PARTY: 5,
    ITEM: 6,
    HS: 7,
    DESC: 8,
    QTY: 9,
    SAT: 10,
    AMOUNT: 11,
    NDPBM: 12,
    INCOTERM: 13,
    FREIGHT: 14,
    INSURANCE: 15,
    TARIF: 19,
    BM: 20,
    PPN: 21,
    PPH: 22,
    PI: 24,
    SKB: 25,
    BLAWB: 26,
    INVOICE: 27,
    VESSEL: 28,
    PACKAGE: 29,
    REMARK: 30,
  };
  const EXPORT_IDX = {
    NO: 0,
    FACTORY: 1,
    DOCNO: 2,
    DATE: 3,
    AJU: 4,
    PARTY: 5,
    HS: 6,
    DESC: 7,
    QTY: 8,
    AMOUNT: 9,
    INCOTERM: 10,
    FREIGHT: 11,
    INSURANCE: 12,
    BLAWB: 13,
    INVOICE: 14,
    VESSEL: 15,
    PACKAGE: 16,
    REMARK: 17,
  };

  function buildBulkRowsForShipment(s, no, mode, formatter) {
    const innerRows =
      mode === "import"
        ? buildExcelCopyRows(s, formatter)
        : buildExportCopyRows(s, formatter);
    return innerRows.map((cols, idx) => [
      idx === 0 ? formatter.num(no, 0) : "",
      ...cols,
      idx === 0 ? formatter.text(s.notes) : "",
    ]);
  }

  async function handleBulkExport(mode) {
    const list = (data[mode] || []).slice().sort((a, b) => {
      const da = a.docDate || a.factoryDate || "";
      const db = b.docDate || b.factoryDate || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    if (!list.length) {
      showToast(
        `Tidak ada data jadwal ${mode === "import" ? "Import" : "Export"} untuk diekspor.`,
        "danger",
      );
      return;
    }
    const headers =
      mode === "import" ? IMPORT_BULK_HEADERS : EXPORT_BULK_HEADERS;
    const aoa = [headers];
    list.forEach((s, i) => {
      buildBulkRowsForShipment(s, i + 1, mode, nativeFormatter).forEach((r) =>
        aoa.push(r),
      );
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map(() => ({ wch: 15 }));

    // Terapkan format tanggal & persen supaya file-nya langsung enak
    // dibaca (bukan cuma angka/serial mentah).
    const dateCols = [1, 3]; // IN FACTORY/PENGIRIMAN & DATE, sama di kedua mode
    const tarifCol = mode === "import" ? IMPORT_IDX.TARIF : null;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = 1; r <= range.e.r; r++) {
      dateCols.forEach((c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v instanceof Date) cell.z = "d-mmm-yy";
      });
      if (tarifCol != null) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: tarifCol })];
        if (cell && typeof cell.v === "number") cell.z = "0.00%";
      }
    }

    const wb = XLSX.utils.book_new();
    const sheetName = `ALL ${mode === "import" ? "IMPORT" : "EXPORT"} SHIPMENT`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const fname = `bulk-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    showToast(
      `File Excel (${list.length} jadwal, mode ${mode === "import" ? "Import" : "Export"}) berhasil diunduh.`,
      "success",
    );
  }

  // Kelompokkan baris-baris mentah (array-of-array, sudah lewat baris
  // header) jadi per-jadwal: baris baru dimulai setiap kolom AJU terisi;
  // baris berikutnya dgn AJU kosong dianggap kelanjutan jadwal yang sama
  // (barang ke-2/dst, atau baris sisipan House BL/AWB). Baris yang benar2
  // kosong semua (spacer) dilewati.
  function groupBulkRows(rows, mode) {
    const idx = mode === "import" ? IMPORT_IDX : EXPORT_IDX;
    const groups = [];
    let current = null;
    rows.forEach((row) => {
      const isBlank = row.every((v) => v == null || String(v).trim() === "");
      if (isBlank) return;
      const aju = excelStr(row[idx.AJU]);
      if (aju) {
        current = { rows: [row] };
        groups.push(current);
      } else if (current) {
        current.rows.push(row);
      }
    });
    return groups;
  }

  function reconstructShipmentFromGroup(group, mode) {
    const idx = mode === "import" ? IMPORT_IDX : EXPORT_IDX;
    const rows = group.rows;
    const first = rows[0];

    const s = {
      mode,
      status: "process",
      noAju: excelStr(first[idx.AJU]),
      docNo: excelStr(first[idx.DOCNO]),
      docDate: excelValueToISODate(first[idx.DATE]),
      party: excelStr(first[idx.PARTY]),
      factoryDate: excelValueToISODate(first[idx.FACTORY]),
      incoterm: excelStr(first[idx.INCOTERM]),
      freight: excelNum(first[idx.FREIGHT]),
      insurance: excelNum(first[idx.INSURANCE]),
      invoice: excelStr(first[idx.INVOICE]),
      voyage: excelStr(first[idx.VESSEL]), // kolom VESSEL -> field voyage (nomor pengangkut)
      vessel: "",
      package: excelStr(first[idx.PACKAGE]),
      notes: excelStr(first[idx.REMARK]),
    };
    if (mode === "import") {
      s.ndpbm = excelNum(first[idx.NDPBM]);
      s.tarif = roundNum(excelNum(first[idx.TARIF]) * 100, 4); // pecahan (0.05) -> persen (5)
      s.pi = excelStr(first[idx.PI]);
      s.skb = excelStr(first[idx.SKB]);
      s.bm = excelNum(first[idx.BM]);
      s.ppn = excelNum(first[idx.PPN]);
      s.pph = excelNum(first[idx.PPH]);
    }

    // BL/AWB: baris pertama = Master. Baris kedua dalam grup (barang ke-2
    // ATAU baris sisipan khusus House) -> House.
    s.masterBL = excelStr(first[idx.BLAWB]);
    s.houseBL = rows.length >= 2 ? excelStr(rows[1][idx.BLAWB]) : "";

    // ITEMS: baris yang punya data barang asli (deskripsi/HS/qty tidak
    // kosong semua). Baris sisipan House BL/AWB (semua kolom barang
    // kosong) dilewati, tidak dihitung sebagai barang.
    const items = [];
    rows.forEach((row) => {
      const desc = excelStr(row[idx.DESC]);
      const hs = excelStr(row[idx.HS]);
      const qty = excelNum(row[idx.QTY]);
      if (!desc && !hs && !qty) return;
      const amount = excelNum(row[idx.AMOUNT]);
      items.push({
        ...newItem(),
        namaBarang: desc,
        hsCode: hs,
        jenisBarang:
          mode === "import"
            ? excelStr(row[idx.ITEM]) || "Bahan Baku"
            : "Bahan Baku",
        qty,
        satuan: mode === "import" ? excelStr(row[idx.SAT]) : "",
        harga: qty ? roundNum(amount / qty, 4) : amount,
      });
    });

    return { shipment: s, items };
  }

  async function handleBulkImport(mode, file) {
    const modeLabel = mode === "import" ? "Import" : "Export";
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        showToast("File Excel ini tidak punya sheet sama sekali.", "danger");
        return;
      }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
        header: 1,
        defval: null,
        raw: true,
      });
      if (rows.length < 2) {
        showToast(
          "File Excel ini tidak punya data (cuma header atau kosong).",
          "danger",
        );
        return;
      }
      const groups = groupBulkRows(rows.slice(1), mode);
      if (!groups.length) {
        showToast(
          "Tidak ada baris yang bisa dikenali — pastikan kolom AJU terisi di baris pertama tiap jadwal.",
          "danger",
        );
        return;
      }
      const reconstructed = groups
        .map((g) => reconstructShipmentFromGroup(g, mode))
        .filter((r) => r.items.length);

      if (!reconstructed.length) {
        showToast(
          "Tidak ada jadwal dengan barang yang valid di file ini.",
          "danger",
        );
        return;
      }

      showConfirm(
        `File ini punya ${reconstructed.length} jadwal ${modeLabel}. Ini akan MENGGANTI seluruh jadwal ${modeLabel} yang tersimpan di database dengan isi file ini. Lanjutkan?`,
        async () => {
          try {
            const { error: delErr } = await supabaseClient
              .from("shipments")
              .delete()
              .eq("mode", mode);
            if (delErr) throw delErr;
            for (const r of reconstructed) {
              await createShipment(r.shipment, r.items);
            }
            await loadShipments();
            showToast(
              `${reconstructed.length} jadwal ${modeLabel} berhasil diimpor.`,
              "success",
            );
          } catch (err) {
            console.error(err);
            showToast("Gagal mengimpor data ke database.", "danger");
            loadShipments();
          }
        },
      );
    } catch (err) {
      console.error(err);
      showToast(
        "Gagal membaca file Excel ini. Pastikan formatnya sesuai template Bulk Export.",
        "danger",
      );
    }
  }

  /* ---- Modal pemilih mode (Bulk Export / Bulk Import) ---- */
  let bulkAction = "export";
  function openBulkModal(action) {
    bulkAction = action;
    $("#bulkModeSelect").value = activeMode;
    $("#bulkModalTitle").textContent =
      action === "export" ? "Bulk Export Excel" : "Bulk Import Excel";
    $("#bulkExportInfo").classList.toggle("d-none", action !== "export");
    $("#bulkImportSection").classList.toggle("d-none", action !== "import");
    $("#bulkActionBtn").textContent =
      action === "export" ? "Unduh Excel" : "Proses Import";
    $("#bulkImportFile").value = "";
    bulkModal.show();
  }

  $("#btnBulkExport").addEventListener("click", () => openBulkModal("export"));
  $("#btnBulkImport").addEventListener("click", () => openBulkModal("import"));

  /* ---- Hapus Semua Data (Import + Export, permanen dari database) ---- */
  async function handleDeleteAll() {
    const totalImport = data.import.length;
    const totalExport = data.export.length;
    const total = totalImport + totalExport;

    if (!total) {
      showToast("Tidak ada data untuk dihapus.", "dark");
      return;
    }

    showConfirm(
      `Anda akan menghapus SELURUH data secara permanen: ${totalImport} jadwal Import dan ${totalExport} jadwal Export ` +
        `(total ${total} jadwal, beserta seluruh daftar barang di dalamnya). Tindakan ini TIDAK BISA dibatalkan. Lanjutkan?`,
      async () => {
        const btn = $("#btnDeleteAll");
        const originalLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML =
          '<span class="spinner-border spinner-border-sm" role="status"></span> Menghapus...';
        try {
          // Filter "neq id kosong" dipakai supaya delete berlaku ke SEMUA baris
          // (Supabase/PostgREST butuh minimal satu filter untuk operasi delete).
          const { error } = await supabaseClient
            .from("shipments")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000");
          if (error) throw error;
          // shipment_items & shipment_route_stops ikut terhapus otomatis
          // lewat "on delete cascade".
          data.import = [];
          data.export = [];
          render();
          showToast("Semua data berhasil dihapus.", "dark");
        } catch (err) {
          console.error(err);
          showToast("Gagal menghapus data dari database.", "danger");
          loadShipments();
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalLabel;
        }
      },
    );
  }
  $("#btnDeleteAll").addEventListener("click", handleDeleteAll);

  $("#bulkActionBtn").addEventListener("click", async () => {
    const mode = $("#bulkModeSelect").value;
    if (bulkAction === "export") {
      await handleBulkExport(mode);
      bulkModal.hide();
    } else {
      const file = $("#bulkImportFile").files[0];
      if (!file) {
        showToast("Pilih file Excel dulu.", "danger");
        return;
      }
      bulkModal.hide();
      await handleBulkImport(mode, file);
    }
  });

  /* ==================================================================
     INITIAL LOAD (dari Supabase, bukan lagi data hardcode)
  ================================================================== */
  cardContainer.innerHTML = `
    <div class="empty-state">
      <i class="bi bi-hourglass-split"></i>
      <p class="mt-3 mb-0">Memuat data dari database...</p>
    </div>`;
  loadShipments();
})();
