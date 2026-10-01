"use strict";

/* HALAMAN JADWAL KAPAL / SHIPMENT SCHEDULE — jadwal kapal per rute
   (Customer, Jumlah Koli, Vessel/Voyager, Stuffing, ETD, ETA, Dari -> Ke).

   Penyaringan langsung, tanpa tombol: kotak cari menyaring tiap kali
   diketik, dropdown Dari/Ke tiap kali diganti.

   Semua peran (EXIM, marketing, viewer) boleh MEMBUKA & MENCARI;
   hanya exim yang boleh menambah/mengubah/menghapus -- dijaga
   requireEdit() di sini, disembunyikan lewat body.is-viewer (auth.css),
   dan ditolak RLS di database (migration-vessel-schedule.sql).

   Semua teks yang dirakit di sini lewat tt(), dan halaman ini digambar
   ulang saat bahasa diganti (lihat setLang di i18n.js). */

/* Daftar pelabuhan untuk dropdown From/To. Sementara tetap di sini;
   tambah pelabuhan cukup dengan menambah isi array ini. */
const VS_PORTS = ["JAKARTA", "BUSAN", "HOCHIMINH"];

/* Label yang dipakai tabel DAN kotak Tambah/Ubah. Getter, bukan nilai
   tetap: dibaca ulang tiap kali dipakai, jadi selalu mengikuti bahasa
   yang sedang aktif. */
const vsLabel = {
  get packages() { return tt("Jumlah Koli", "Packages"); },
  get from() { return tt("Dari", "From"); },
  get to() { return tt("Ke", "To"); },
};

let vsRows = [];
let vsPage = 1;
let vsPageSize = 10;

/* Saringan dibaca langsung dari kotaknya tiap kali menggambar -- tidak
   ada salinan keadaan yang bisa tertinggal dari yang terlihat. */
function vsSaringan() {
  return {
    from: ($("#vsFrom") || {}).value || "",
    to: ($("#vsTo") || {}).value || "",
    q: (($("#vsSearch") || {}).value || "").trim().toLowerCase(),
  };
}

/* Cocok kalau SEMUA kata yang diketik ada di salah satu kolom: "hmm
   busan" menemukan kapal HMM tujuan BUSAN. Tanggal dicari dalam bentuk
   yang tampil di tabel (08-10-2026). */
function vsCocokTeks(r, q) {
  if (!q) return true;
  const isi = [
    r.customer, r.packages, r.vessel, r.port_from, r.port_to,
    r.stuffing_date && fmtDate(r.stuffing_date), fmtDate(r.etd), fmtDate(r.eta),
  ].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((kata) => isi.includes(kata));
}

function vsPortOptions(nilai, denganSemua) {
  const semua = denganSemua ? `<option value="">${escapeHtml(tt("Semua", "All"))}</option>` : "";
  return (
    semua +
    VS_PORTS.map(
      (p) => `<option value="${escapeAttr(p)}"${p === nilai ? " selected" : ""}>${escapeHtml(p)}</option>`,
    ).join("")
  );
}

function isiDropdownVs() {
  const from = $("#vsFrom");
  const to = $("#vsTo");
  if (from) from.innerHTML = vsPortOptions(from.value, true);
  if (to) to.innerHTML = vsPortOptions(to.value, true);
}

async function loadVesselSchedules() {
  const box = $("#vsList");
  if (box) {
    box.innerHTML = `<div class="panel-empty"><i class="bi bi-hourglass"></i> ${tt("Memuat jadwal kapal…", "Loading shipment schedule…")}</div>`;
  }
  const { data, error } = await supabaseClient
    .from("vessel_schedules")
    .select("id, customer, packages, vessel, stuffing_date, etd, eta, port_from, port_to, created_at")
    .order("etd", { ascending: true });
  if (error) {
    console.error(error);
    if (box) {
      box.innerHTML = `<div class="panel-empty"><i class="bi bi-exclamation-triangle"></i> ${tt(
        "Gagal memuat jadwal kapal. Pastikan migration-vessel-schedule.sql sudah dijalankan.",
        "Failed to load the shipment schedule. Make sure migration-vessel-schedule.sql has been run.",
      )}</div>`;
    }
    return;
  }
  vsRows = data || [];
  renderVesselSchedules();
}

function renderVesselSchedules() {
  const box = $("#vsList");
  if (!box) return;

  const f = vsSaringan();
  const cocok = vsRows
    .filter((r) => (!f.from || r.port_from === f.from) && (!f.to || r.port_to === f.to) && vsCocokTeks(r, f.q))
    .sort(
      (a, b) =>
        String(a.etd || "").localeCompare(String(b.etd || "")) ||
        String(a.customer || "").localeCompare(String(b.customer || ""), "id", { sensitivity: "base" }),
    );

  const totalEl = $("#vsCount");
  if (totalEl) totalEl.textContent = vsRows.length;
  /* Bahasa Inggris membedakan tunggal/jamak ("1 schedule saved");
     data-en di HTML hanya bisa memuat satu bentuk. */
  const labelEl = $("#vsCountLabel");
  if (labelEl) labelEl.textContent = tt("jadwal tersimpan", vsRows.length === 1 ? "schedule saved" : "schedules saved");

  if (!cocok.length) {
    box.innerHTML = vsRows.length
      ? `<div class="panel-empty"><i class="bi bi-search"></i> ${tt("Tidak ada jadwal yang cocok.", "No matching schedules.")}</div>`
      : `<div class="panel-empty"><i class="bi bi-water"></i> ${tt(
          "Belum ada data. Tambahkan lewat tombol Tambah Data di atas.",
          "No data yet. Add one with the Add Data button above.",
        )}</div>`;
    renderVsPagination(0);
    return;
  }

  const totalHalaman = Math.max(1, Math.ceil(cocok.length / vsPageSize));
  vsPage = Math.min(Math.max(1, vsPage), totalHalaman);
  const mulai = (vsPage - 1) * vsPageSize;
  const rows = cocok.slice(mulai, mulai + vsPageSize);
  renderVsPagination(cocok.length);

  box.innerHTML = `
    <div class="vs-tabel-wrap">
      <table class="vs-tabel">
        <thead><tr>
          <th class="vs-kol-no">${tt("No", "No.")}</th>
          <th class="vs-kol-cust">Customer</th>
          <th class="vs-kol-pkg">${vsLabel.packages}</th>
          <th class="vs-kol-vsl">Vessel/Voyager</th>
          <th class="vs-kol-tgl">Stuffing</th>
          <th class="vs-kol-tgl">ETD</th>
          <th class="vs-kol-tgl">ETA</th>
          <th class="vs-kol-rute">${tt("Rute", "Route")}</th>
          <th class="vs-kol-aksi"></th>
        </tr></thead>
        <tbody>${rows
          .map(
            (r, i) => `
          <tr>
            <td class="vs-kol-no">${mulai + i + 1}</td>
            <td class="vs-kol-cust"><span class="vs-cust">${escapeHtml(r.customer)}</span></td>
            <td class="vs-kol-pkg" data-label="${escapeAttr(vsLabel.packages)}">${r.packages ? escapeHtml(r.packages) : "\u2014"}</td>
            <td class="vs-kol-vsl" data-label="Vessel/Voyager">${r.vessel ? escapeHtml(r.vessel) : "\u2014"}</td>
            <td class="vs-kol-tgl vs-kol-stuf" data-label="Stuffing">${fmtDate(r.stuffing_date)}</td>
            <td class="vs-kol-tgl vs-kol-etd" data-label="ETD">${fmtDate(r.etd)}</td>
            <td class="vs-kol-tgl vs-kol-eta" data-label="ETA">${fmtDate(r.eta)}</td>
            <td class="vs-kol-rute">
              <span class="vs-rute"><span class="vs-lbl-rute">${vsLabel.from}<span class="vs-titik"> :</span></span> <b>${escapeHtml(r.port_from)}</b></span>
              <span class="vs-rute"><span class="vs-lbl-rute">${vsLabel.to}<span class="vs-titik"> :</span></span> <b>${escapeHtml(r.port_to)}</b></span>
            </td>
            <td class="vs-kol-aksi">
              <div class="hscode-actions">
                <button type="button" class="icon-btn" data-edit-vs="${r.id}" title="${tt("Ubah", "Edit")}">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="icon-btn danger" data-del-vs="${r.id}" title="${tt("Hapus", "Delete")}">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </td>
          </tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`;
}

function renderVsPagination(totalItems) {
  const bar = $("#vsPagination");
  if (!bar) return;
  if (!totalItems) {
    bar.className = "hs-halaman";
    bar.innerHTML = "";
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / vsPageSize));
  const awal = (vsPage - 1) * vsPageSize + 1;
  const akhir = Math.min(vsPage * vsPageSize, totalItems);
  const tombol = paginationRange(vsPage, totalPages)
    .map((p) =>
      p === "..."
        ? `<span class="page-ellipsis">\u2026</span>`
        : `<button type="button" class="page-btn ${p === vsPage ? "active" : ""}" data-vspage="${p}">${p}</button>`,
    )
    .join("");

  bar.className = "pagination-bar hs-halaman";
  bar.innerHTML = `
    <div class="pagination-info">${tt("Menampilkan {a} dari {n} jadwal", totalItems === 1 ? "Showing {a} of {n} schedule" : "Showing {a} of {n} schedules", {
      a: `<b>${awal}\u2013${akhir}</b>`,
      n: `<b>${totalItems}</b>`,
    })}</div>
    <div class="pagination-controls">
      <button type="button" class="page-nav" data-vsnav="prev" ${vsPage <= 1 ? "disabled" : ""}><i class="bi bi-chevron-left"></i></button>
      <div class="page-numbers">${tombol}</div>
      <button type="button" class="page-nav" data-vsnav="next" ${vsPage >= totalPages ? "disabled" : ""}><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="pagination-size">
      <label for="vsPageSize">${tt("Per halaman", "Per page")}</label>
      <select id="vsPageSize">
        ${[5, 10, 20, 50].map((n) => `<option value="${n}" ${n === vsPageSize ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </div>`;
}

/* Isian kotak Tambah/Ubah. From & To default ke saringan yang sedang
   dipakai -- biasanya data baru ditambah untuk rute yang sedang dilihat. */
function vsFields(r) {
  const opsiPort = VS_PORTS.map((p) => ({ value: p, label: p }));
  const f = vsSaringan();
  return [
    { key: "customer", label: "Customer", value: r.customer || "", placeholder: tt("Cth: PT ABC", "e.g. PT ABC") },
    { key: "packages", label: vsLabel.packages, value: r.packages || "", placeholder: tt("Cth: 1x40HC / 12 PLT", "e.g. 1x40HC / 12 PLT") },
    { key: "vessel", label: "Vessel/Voyager", value: r.vessel || "", placeholder: tt("Cth: EVER GIVEN / 0123N", "e.g. EVER GIVEN / 0123N") },
    { key: "stuffing", label: t("f.tanggal.stuffing"), type: "date", value: r.stuffing_date || "" },
    { key: "etd", label: "ETD", type: "date", value: r.etd || "" },
    { key: "eta", label: "ETA", type: "date", value: r.eta || "" },
    { key: "from", label: vsLabel.from, type: "select", options: opsiPort, value: r.port_from || f.from || VS_PORTS[0] },
    { key: "to", label: vsLabel.to, type: "select", options: opsiPort, value: r.port_to || f.to || VS_PORTS[1] },
  ];
}

function periksaVs(v) {
  if (!(v.customer || "").trim()) return tt("Customer harus diisi.", "Customer is required.");
  if (!v.etd) return tt("ETD harus diisi.", "ETD is required.");
  if (!v.eta) return tt("ETA harus diisi.", "ETA is required.");
  if (v.eta < v.etd) return tt("ETA tidak boleh sebelum ETD.", "ETA cannot be before ETD.");
  /* Opsional -- tapi kalau diisi, muatan distuffing SEBELUM kapalnya
     berangkat. */
  if (v.stuffing && v.stuffing > v.etd)
    return tt("Tanggal Stuffing tidak boleh setelah ETD.", "Stuffing date cannot be after ETD.");
  if (v.from === v.to) return tt("Dari dan Ke tidak boleh sama.", "From and To cannot be the same.");
  return null;
}

function barisVs(v) {
  return {
    customer: v.customer.trim(),
    packages: (v.packages || "").trim() || null,
    vessel: (v.vessel || "").trim() || null,
    stuffing_date: v.stuffing || null,
    etd: v.etd,
    eta: v.eta,
    port_from: v.from,
    port_to: v.to,
  };
}

function tambahVesselSchedule() {
  if (!requireEdit()) return;
  showPrompt({
    title: tt("Tambah Jadwal Kapal", "Add Shipment Schedule"),
    icon: "bi-water",
    okText: tt("Simpan", "Save"),
    fields: vsFields({}),
    onSubmit: (v) => {
      const galat = periksaVs(v);
      if (galat) return galat;
      simpanVsBaru(barisVs(v));
      return true;
    },
  });
}

async function simpanVsBaru(row) {
  const { data, error } = await supabaseClient
    .from("vessel_schedules")
    .insert({ ...row, created_by: authState.user ? authState.user.id : null })
    .select()
    .single();
  if (error) {
    console.error(error);
    showToast(tt("Gagal menyimpan data.", "Failed to save the data."), "danger");
    return;
  }
  vsRows.push(data);
  renderVesselSchedules();
  showToast(tt("Jadwal {x} tersimpan.", "Schedule for {x} saved.", { x: row.customer }), "dark");
}

function editVesselSchedule(id) {
  if (!requireEdit()) return;
  const r = vsRows.find((x) => x.id === id);
  if (!r) return;
  showPrompt({
    title: tt("Ubah Jadwal Kapal", "Edit Shipment Schedule"),
    icon: "bi-pencil-square",
    okText: tt("Simpan", "Save"),
    fields: vsFields(r),
    onSubmit: (v) => {
      const galat = periksaVs(v);
      if (galat) return galat;
      simpanUbahVs(id, barisVs(v));
      return true;
    },
  });
}

async function simpanUbahVs(id, row) {
  const { error } = await supabaseClient.from("vessel_schedules").update(row).eq("id", id);
  if (error) {
    console.error(error);
    showToast(t("m.gagal.menyimpan.perubahan"), "danger");
    return;
  }
  const r = vsRows.find((x) => x.id === id);
  if (r) Object.assign(r, row);
  renderVesselSchedules();
  showToast(t("m.perubahan.tersimpan"), "dark");
}

function deleteVesselSchedule(id) {
  if (!requireEdit()) return;
  const r = vsRows.find((x) => x.id === id);
  if (!r) return;
  showConfirm(
    tt("Hapus jadwal {c} ({f} \u2192 {t}, ETD {d})?", "Delete the schedule for {c} ({f} \u2192 {t}, ETD {d})?", {
      c: r.customer,
      f: r.port_from,
      t: r.port_to,
      d: fmtDate(r.etd),
    }),
    async () => {
      const { error } = await supabaseClient.from("vessel_schedules").delete().eq("id", id);
      if (error) {
        console.error(error);
        showToast(t("m.gagal.menghapus"), "danger");
        return;
      }
      vsRows = vsRows.filter((x) => x.id !== id);
      renderVesselSchedules();
      showToast(tt("Jadwal {x} dihapus.", "Schedule for {x} deleted.", { x: r.customer }), "dark");
    },
    { confirmText: t("u.ya.hapus") },
  );
}

function showVesselScheduleView() {
  showPage("vessel");
  window.scrollTo(0, 0);
  isiDropdownVs();
  loadVesselSchedules();
}

/* Menyaring langsung: tiap ketikan di kotak cari, tiap ganti Dari/Ke.
   Selalu kembali ke halaman 1 -- halaman 3 dari hasil lama bisa jadi
   tidak ada lagi di hasil baru. */
function saringUlangVs() {
  vsPage = 1;
  renderVesselSchedules();
}
["#vsFrom", "#vsTo"].forEach((sel) => {
  const el = $(sel);
  if (el) el.addEventListener("change", saringUlangVs);
});
const vsSearchEl = $("#vsSearch");
if (vsSearchEl) vsSearchEl.addEventListener("input", saringUlangVs);
const btnVsAdd = $("#btnVsAdd");
if (btnVsAdd) btnVsAdd.addEventListener("click", tambahVesselSchedule);

const vsPagerEl = $("#vsPagination");
if (vsPagerEl) {
  vsPagerEl.addEventListener("click", (e) => {
    const nomor = e.target.closest("[data-vspage]");
    if (nomor) {
      vsPage = Number(nomor.dataset.vspage);
      renderVesselSchedules();
      return;
    }
    const nav = e.target.closest("[data-vsnav]");
    if (nav) {
      vsPage += nav.dataset.vsnav === "next" ? 1 : -1;
      renderVesselSchedules();
    }
  });
  vsPagerEl.addEventListener("change", (e) => {
    if (e.target.id !== "vsPageSize") return;
    vsPageSize = Number(e.target.value);
    vsPage = 1;
    renderVesselSchedules();
  });
}

const vsListEl = $("#vsList");
if (vsListEl) {
  vsListEl.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-vs]");
    if (editBtn) return editVesselSchedule(editBtn.dataset.editVs);
    const delBtn = e.target.closest("[data-del-vs]");
    if (delBtn) return deleteVesselSchedule(delBtn.dataset.delVs);
  });
}
