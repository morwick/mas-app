import "server-only";
import { createClient } from "@/lib/supabase/server";
import { deriveServiceStatus, formatKm } from "@/lib/service";
import type { AppNotification } from "@/lib/notifications";

/**
 * Isi lonceng notifikasi.
 *
 * Sebelum ini panelnya menampilkan `getMockNotifications()` — delapan baris
 * karangan yang tidak ada hubungannya dengan data. Yang di sini semuanya
 * diturunkan dari baris yang benar-benar ada, jadi angka dan namanya bisa
 * ditindaklanjuti.
 *
 * Tidak ada tabel notifikasi. Kondisinya dihitung ulang tiap kali panel
 * dibuka karena semuanya adalah keadaan sekarang, bukan kejadian: begitu job
 * dikonfirmasi atau unit diservis, barisnya memang harus hilang sendiri.
 * Status "sudah dibaca" tetap disimpan per browser di localStorage.
 */

const MS_HOUR = 3_600_000;
const MS_DAY = 24 * MS_HOUR;

/** Ambang "sebentar lagi berangkat" untuk job yang belum dikonfirmasi driver. */
const KONFIRMASI_WINDOW_JAM = 24;

/** Penawaran yang masa berlakunya tinggal segini dianggap perlu ditindak. */
const PENAWARAN_KEDALUWARSA_HARI = 3;

/**
 * Dokumen (STNK, KIR, pajak, SIM) diingatkan 30 hari sebelum habis.
 * Perpanjangan KIR dan pajak butuh antre di samsat/dishub, jadi peringatan
 * seminggu sebelum tidak menyisakan waktu untuk mengurusnya.
 */
const DOKUMEN_PERINGATAN_HARI = 30;

const MAX_PER_KIND = 5;

function fmtJam(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fmtTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

interface JobRow {
  id: string;
  job_number: string;
  etd: string;
  status: string;
  accepted_at: string | null;
  driver: { nama: string } | null;
  unit: { kode_unit: string } | null;
}

interface UnitRow {
  id: string;
  kode_unit: string;
  current_odometer_km: number | string | null;
  service_interval_km: number | string | null;
  stnk_berlaku_sampai: string | null;
  kir_berlaku_sampai: string | null;
  pajak_berlaku_sampai: string | null;
}

interface IncidentRow {
  id: string;
  tipe: string;
  tanggal: string;
  status: string;
  created_at: string;
  unit: { kode_unit: string } | null;
}

interface QuotationRow {
  id: string;
  quote_number: string;
  customer_nama: string;
  status: string;
  tanggal: string;
  berlaku_sampai: string | null;
  total: number | string | null;
}

export async function getNotifications(
  now: Date = new Date()
): Promise<AppNotification[]> {
  const supabase = await createClient();
  const nowIso = now.toISOString();

  const [jobsRes, unitsRes, serviceRes, incidentsRes, quotationsRes] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, job_number, etd, status, accepted_at, driver:drivers(nama), unit:units(kode_unit)"
        )
        .in("status", [
          "menunggu_pickup",
          "loading",
          "dalam_perjalanan",
          "unloading"
        ])
        .order("etd", { ascending: true }),

      supabase
        .from("units")
        .select(
          "id, kode_unit, current_odometer_km, service_interval_km, stnk_berlaku_sampai, kir_berlaku_sampai, pajak_berlaku_sampai"
        )
        .eq("is_active", true),

      supabase.from("service_records").select("unit_id, odometer_km"),

      supabase
        .from("incidents")
        .select("id, tipe, tanggal, status, created_at, unit:units(kode_unit)")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false }),

      supabase
        .from("quotations")
        .select(
          "id, quote_number, customer_nama, status, tanggal, berlaku_sampai, total"
        )
        .in("status", ["terkirim", "deal"])
    ]);

  const out: AppNotification[] = [];

  // ── Job belum dikonfirmasi driver ────────────────────────────────────────
  // Job dibuat bukan berarti sudah sampai ke orangnya. Ini satu-satunya cara
  // admin tahu sebelum truk tidak berangkat.
  const jobs = (jobsRes.data ?? []) as unknown as JobRow[];
  const belumKonfirmasi = jobs.filter((j) => !j.accepted_at);

  for (const j of belumKonfirmasi.slice(0, MAX_PER_KIND)) {
    const etd = new Date(j.etd).getTime();
    const jamLagi = (etd - now.getTime()) / MS_HOUR;
    if (jamLagi > KONFIRMASI_WINDOW_JAM) continue;

    const lewat = jamLagi < 0;
    out.push({
      id: `job-belum-konfirmasi-${j.id}`,
      kind: "job_unassigned",
      severity: lewat ? "danger" : "warning",
      title: lewat
        ? "Belum dikonfirmasi, ETD sudah lewat"
        : "Job belum dikonfirmasi driver",
      body: `${j.job_number} — ${j.driver?.nama ?? "driver"}, berangkat ${fmtJam(
        j.etd
      )}`,
      href: `/jobs/${j.id}`,
      createdAt: j.etd
    });
  }

  // ── Job yang mestinya sudah jalan ────────────────────────────────────────
  for (const j of jobs) {
    if (j.status !== "menunggu_pickup") continue;
    if (new Date(j.etd).getTime() >= now.getTime()) continue;
    if (out.some((n) => n.id === `job-belum-konfirmasi-${j.id}`)) continue;
    out.push({
      id: `job-telat-${j.id}`,
      kind: "anomaly",
      severity: "danger",
      title: "Job belum berangkat",
      body: `${j.job_number} masih menunggu pickup, ETD ${fmtJam(j.etd)}`,
      href: `/jobs/${j.id}`,
      createdAt: j.etd
    });
    if (out.filter((n) => n.kind === "anomaly").length >= MAX_PER_KIND) break;
  }

  // ── Servis ───────────────────────────────────────────────────────────────
  const lastServiceKm = new Map<string, number>();
  for (const r of (serviceRes.data ?? []) as Array<{
    unit_id: string;
    odometer_km: number | string;
  }>) {
    const km = Number(r.odometer_km);
    if (!Number.isFinite(km)) continue;
    const cur = lastServiceKm.get(r.unit_id);
    if (cur === undefined || km > cur) lastServiceKm.set(r.unit_id, km);
  }

  const units = (unitsRes.data ?? []) as unknown as UnitRow[];
  let servisOverdue = 0;
  let servisMendekati = 0;

  for (const u of units) {
    const interval = Number(u.service_interval_km ?? 0);
    if (!Number.isFinite(interval) || interval <= 0) continue;

    const derived = deriveServiceStatus({
      current_odometer_km: Number(u.current_odometer_km ?? 0),
      last_service_odometer_km: lastServiceKm.get(u.id) ?? null,
      service_interval_km: interval
    });

    if (derived.status === "overdue" && servisOverdue < MAX_PER_KIND) {
      servisOverdue++;
      out.push({
        id: `service-overdue-${u.id}`,
        kind: "service_overdue",
        severity: "danger",
        title: "Servis lewat jadwal",
        body: `${u.kode_unit} sudah ${formatKm(
          Math.abs(derived.km_to_next_service)
        )} melewati interval`,
        href: `/units/${u.id}`,
        createdAt: nowIso
      });
    } else if (derived.status === "mendekati" && servisMendekati < MAX_PER_KIND) {
      servisMendekati++;
      out.push({
        id: `service-soon-${u.id}`,
        kind: "service_due_soon",
        severity: "warning",
        title: "Servis mendekati",
        body: `${u.kode_unit} sisa ${formatKm(
          derived.km_to_next_service
        )} menuju servis`,
        href: `/units/${u.id}`,
        createdAt: nowIso
      });
    }
  }

  // ── Dokumen kendaraan & SIM ──────────────────────────────────────────────
  // KIR atau pajak mati bukan soal administrasi: unitnya bisa ditahan di
  // jalan dan job batal. Karena itu yang sudah lewat diperlakukan sebagai
  // danger, setara servis overdue.
  const dokumen: Array<{
    id: string;
    label: string;
    subjek: string;
    href: string;
    tanggal: string | null;
  }> = [];

  for (const u of units) {
    dokumen.push(
      {
        id: `stnk-${u.id}`,
        label: "STNK",
        subjek: u.kode_unit,
        href: `/units/${u.id}`,
        tanggal: u.stnk_berlaku_sampai
      },
      {
        id: `kir-${u.id}`,
        label: "KIR",
        subjek: u.kode_unit,
        href: `/units/${u.id}`,
        tanggal: u.kir_berlaku_sampai
      },
      {
        id: `pajak-${u.id}`,
        label: "Pajak kendaraan",
        subjek: u.kode_unit,
        href: `/units/${u.id}`,
        tanggal: u.pajak_berlaku_sampai
      }
    );
  }

  const { data: driverRows } = await supabase
    .from("drivers")
    .select("id, nama, sim_berlaku_sampai")
    .eq("is_active", true)
    .not("sim_berlaku_sampai", "is", null);

  for (const d of (driverRows ?? []) as Array<{
    id: string;
    nama: string;
    sim_berlaku_sampai: string | null;
  }>) {
    dokumen.push({
      id: `sim-${d.id}`,
      label: "SIM",
      subjek: d.nama,
      href: `/drivers/${d.id}/edit`,
      tanggal: d.sim_berlaku_sampai
    });
  }

  for (const doc of dokumen) {
    if (!doc.tanggal) continue;
    const sisaHari = (new Date(doc.tanggal).getTime() - now.getTime()) / MS_DAY;
    if (sisaHari > DOKUMEN_PERINGATAN_HARI) continue;

    const habis = sisaHari < 0;
    out.push({
      id: `doc-${doc.id}`,
      kind: "document_expiring",
      severity: habis ? "danger" : "warning",
      title: habis ? `${doc.label} sudah habis` : `${doc.label} akan habis`,
      body: `${doc.subjek} — berlaku sampai ${fmtTanggal(doc.tanggal)}`,
      href: doc.href,
      createdAt: doc.tanggal
    });
  }

  // ── Insiden yang belum selesai ───────────────────────────────────────────
  const incidents = (incidentsRes.data ?? []) as unknown as IncidentRow[];
  for (const i of incidents.slice(0, MAX_PER_KIND)) {
    out.push({
      id: `incident-${i.id}`,
      kind: "incident_open",
      severity: i.status === "open" ? "danger" : "warning",
      title: i.status === "open" ? "Insiden belum ditangani" : "Insiden dalam penanganan",
      body: `${i.unit?.kode_unit ?? "Unit"} — ${i.tipe}, ${fmtTanggal(i.tanggal)}`,
      href: `/units`,
      createdAt: i.created_at
    });
  }

  // ── Penawaran ────────────────────────────────────────────────────────────
  const quotations = (quotationsRes.data ?? []) as unknown as QuotationRow[];
  const dealIds = quotations.filter((q) => q.status === "deal").map((q) => q.id);

  // Penawaran deal yang belum punya job sama sekali — pekerjaan sudah
  // disetujui customer tapi belum dijadwalkan siapa pun.
  let dealTanpaJob: string[] = [];
  if (dealIds.length > 0) {
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("quotation_id")
      .in("quotation_id", dealIds);
    const sudahPunyaJob = new Set(
      ((jobRows ?? []) as Array<{ quotation_id: string | null }>)
        .map((r) => r.quotation_id)
        .filter((v): v is string => Boolean(v))
    );
    dealTanpaJob = dealIds.filter((id) => !sudahPunyaJob.has(id));
  }

  for (const q of quotations) {
    if (q.status === "deal" && dealTanpaJob.includes(q.id)) {
      out.push({
        id: `quotation-deal-${q.id}`,
        kind: "customer_new",
        severity: "info",
        title: "Penawaran deal belum dijadwalkan",
        body: `${q.quote_number} — ${q.customer_nama}`,
        href: `/quotations/${q.id}`,
        createdAt: q.tanggal
      });
      continue;
    }

    if (q.status === "terkirim" && q.berlaku_sampai) {
      const sisaHari =
        (new Date(q.berlaku_sampai).getTime() - now.getTime()) / MS_DAY;
      if (sisaHari <= PENAWARAN_KEDALUWARSA_HARI) {
        out.push({
          id: `quotation-expiring-${q.id}`,
          kind: "document_expiring",
          severity: sisaHari < 0 ? "danger" : "warning",
          title:
            sisaHari < 0
              ? "Penawaran sudah lewat masa berlaku"
              : "Penawaran mendekati masa berlaku",
          body: `${q.quote_number} — ${q.customer_nama}, berlaku sampai ${fmtTanggal(
            q.berlaku_sampai
          )}`,
          href: `/quotations/${q.id}`,
          createdAt: q.tanggal
        });
      }
    }
  }

  // ── Piutang jatuh tempo ──────────────────────────────────────────────────
  // Uang masuk yang terlambat tidak menimbulkan tanda apa pun sampai ada yang
  // membuka halaman piutang. Di sini ia ikut naik ke lonceng seperti risiko
  // operasional lain.
  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_nama, jatuh_tempo, total, dibayar")
    .eq("status", "terkirim")
    .not("jatuh_tempo", "is", null)
    .lt("jatuh_tempo", nowIso.slice(0, 10))
    .order("jatuh_tempo", { ascending: true })
    .limit(MAX_PER_KIND);

  for (const inv of (invoiceRows ?? []) as Array<{
    id: string;
    invoice_number: string;
    customer_nama: string;
    jatuh_tempo: string;
    total: number | string;
    dibayar: number | string;
  }>) {
    const sisa = Number(inv.total) - Number(inv.dibayar);
    if (sisa <= 0) continue;
    const hariLewat = Math.floor(
      (now.getTime() - new Date(inv.jatuh_tempo).getTime()) / MS_DAY
    );
    out.push({
      id: `invoice-jt-${inv.id}`,
      kind: "invoice_overdue",
      // Lewat dua bulan bukan lagi keterlambatan biasa.
      severity: hariLewat > 60 ? "danger" : "warning",
      title: "Tagihan lewat jatuh tempo",
      body: `${inv.invoice_number} — ${inv.customer_nama}, ${hariLewat} hari, sisa ${new Intl.NumberFormat(
        "id-ID",
        { style: "currency", currency: "IDR", maximumFractionDigits: 0 }
      ).format(sisa)}`,
      href: `/invoices/${inv.id}`,
      createdAt: inv.jatuh_tempo
    });
  }

  // Paling mendesak dulu, lalu yang paling baru. Tanpa ini baris "info" bisa
  // menutupi job yang ETD-nya sudah lewat.
  const severityRank = { danger: 0, warning: 1, info: 2 } as const;
  out.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return out;
}
