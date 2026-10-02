import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  FileText,
  Flag,
  FolderKanban,
  MapPin,
  PackageCheck,
  Search,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { bulanTahunWIB, formatDate, formatTime } from "@/lib/utils";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";
import type { Customer, Job, JobStatus } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { UangJalanPendingBadge } from "./uang-jalan-pending-badge";
import { TagihanJobInfo } from "./tagihan-job-info";
import { RuteJob } from "./rute-job";
import { PageHeader } from "@/components/ui/page-header";
import { NAMA_BULAN, opsiTahun } from "@/features/proyek/components/proyek-list-view";

/**
 * Filter dua tingkat:
 * - Kelompok: Semua | Aktif (= semua kecuali dibatalkan) | Dibatalkan.
 * - Tahap (hanya tampil di kelompok Aktif): Ditugaskan (driver belum
 *   menekan Terima Job) | Dalam proses | Menunggu validasi | Selesai.
 */
export type KelompokJob = "semua" | "aktif" | "cancelled";
export type TahapJob = "semua" | "ditugaskan" | "proses" | "validasi" | "selesai";

const TAHAP_STATUS: Record<Exclude<TahapJob, "semua">, JobStatus[]> = {
  ditugaskan: ["menunggu_pickup", "ditugaskan"],
  proses: ["diterima", "loading", "dalam_perjalanan", "unloading", "serah_terima_pool"],
  validasi: ["menunggu_validasi"],
  selesai: ["selesai"]
};

/** Nilai `?tab=` yang dikenali (dashboard memakai tab=ditugaskan / tab=validasi). */
export const TAB_JOB = ["semua", "aktif", "cancelled", "ditugaskan", "proses", "validasi", "selesai"] as const;
export type TabKey = (typeof TAB_JOB)[number];

function filterDariTab(tab: TabKey): { kelompok: KelompokJob; tahap: TahapJob } {
  if (tab === "semua" || tab === "aktif" || tab === "cancelled") return { kelompok: tab, tahap: "semua" };
  return { kelompok: "aktif", tahap: tab };
}

interface Props {
  jobs: Job[];
  customers: Customer[];
  unitMap: Record<string, { kode_unit: string; jenis: string }>;
  driverMap: Record<string, string>;
  /** Datang dari query string (mis. diklik dari kolom "Total job" di menu Customer). */
  initialCustomerId?: string;
  /** Filter awal dari query string (?tab=semua|aktif|cancelled|ditugaskan|proses|validasi|selesai). */
  initialTab?: TabKey;
}

/**
 * Tautan ke penawaran asal job (hanya job yang lahir dari penawaran).
 * Berupa tombol, bukan <a>, karena di tampilan mobile letaknya di dalam kartu
 * yang sendirinya sudah tautan ke detail job.
 */
function QuotationLink({ job }: { job: Job }) {
  const navigate = useNavigate();
  if (!job.quotation_id || !job.quotation_number) return null;
  const to = `/quotations/${job.quotation_id}`;
  return (
    <button
      type="button"
      className="mono"
      title="Lihat detail penawaran"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(to);
      }}
      style={{
        marginTop: 4,
        fontSize: 10.5,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        background: "var(--brand-primary-light)",
        color: "var(--brand-primary-dark)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        maxWidth: "100%"
      }}
    >
      <FileText style={{ width: 11, height: 11, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {job.quotation_number}
      </span>
    </button>
  );
}

/**
 * Tautan ke proyek induk job. Tombol (bukan <a>) dengan alasan yang sama
 * seperti QuotationLink: di mobile letaknya di dalam kartu yang sudah tautan.
 */
function ProyekLink({ job }: { job: Job }) {
  const navigate = useNavigate();
  if (!job.proyek_id || !job.proyek_nomor) return null;
  const to = `/proyek/${job.proyek_id}`;
  return (
    <button
      type="button"
      className="mono"
      title="Lihat detail proyek"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(to);
      }}
      style={{
        marginTop: 4,
        fontSize: 10.5,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        background: "var(--bg-muted)",
        color: "var(--text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        maxWidth: "100%"
      }}
    >
      <FolderKanban style={{ width: 11, height: 11, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {job.proyek_nomor}
      </span>
    </button>
  );
}

/** Tanggal + jam lengkap (WIB), mis. "01 Okt 2026 08.00" — seragam untuk ETD & ETA. */
function formatTglJam(value: string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** Sel ETD/ETA: tanggal di atas, jam di bawah, tanpa wrap. */
function SelWaktu({ value }: { value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <>
      <div>{formatDate(value)}</div>
      <div className="muted" style={{ fontSize: 10.5 }}>
        {formatTime(value)}
      </div>
    </>
  );
}

function takeLastSegment(text: string): string {
  if (text.includes("—")) {
    const parts = text.split("—");
    return parts[parts.length - 1].trim();
  }
  return text.split(",")[0].trim();
}

export function JobsListView({
  jobs,
  customers,
  unitMap,
  driverMap,
  initialCustomerId,
  initialTab
}: Props) {
  // Default: kelompok Aktif (tanpa job dibatalkan) supaya filter status langsung
  // tampil untuk monitoring. Dari "Total job" di menu Customer jumlahnya pun
  // sama dengan angka yang diklik.
  const tabAwal: TabKey = initialTab ?? "aktif";
  const [kelompok, setKelompok] = useState<KelompokJob>(() => filterDariTab(tabAwal).kelompok);
  const [tahap, setTahap] = useState<TahapJob>(() => filterDariTab(tabAwal).tahap);
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [unitId, setUnitId] = useState("");

  // Periode (bulan & tahun ETD, WIB). Dibuka biasa → bulan berjalan. Dibuka lewat
  // tautan (dashboard ?tab=, "Total job" customer) → semua periode, supaya jumlahnya
  // sama dengan angka yang diklik. 0 = semua bulan/tahun.
  const lewatTautan = Boolean(initialTab || initialCustomerId);
  const periodeAwal = useMemo(
    () => (lewatTautan ? { bulan: 0, tahun: 0 } : bulanTahunWIB()),
    [lewatTautan]
  );
  const [bulan, setBulan] = useState(periodeAwal.bulan);
  const [tahun, setTahun] = useState(periodeAwal.tahun);

  // Menyesuaikan saat halaman dibuka lagi lewat tautan customer lain
  // (mis. dari kolom "Total job" di menu Customer) tanpa remount komponen.
  useEffect(() => {
    setCustomerId(initialCustomerId ?? "");
    setKelompok(filterDariTab(tabAwal).kelompok);
    setTahap(filterDariTab(tabAwal).tahap);
    setBulan(periodeAwal.bulan);
    setTahun(periodeAwal.tahun);
  }, [initialCustomerId, tabAwal, periodeAwal]);

  // Reset mengembalikan cari, customer, unit & periode ke default (status tidak ikut).
  const bisaReset = Boolean(
    q || customerId || unitId || bulan !== periodeAwal.bulan || tahun !== periodeAwal.tahun
  );
  function resetFilter() {
    setQ("");
    setCustomerId("");
    setUnitId("");
    setBulan(periodeAwal.bulan);
    setTahun(periodeAwal.tahun);
  }

  const bulanOptions = useMemo<ComboboxOption[]>(
    () => NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama })),
    []
  );
  const tahunOptions = useMemo(opsiTahun, []);

  // Angka mengikuti customer, unit & periode yang dipilih — angka "Aktif" = "Total job" di menu Customer.
  // Angka tahap dihitung dari job Aktif (filter tahap hanya muncul di kelompok Aktif).
  const counts = useMemo(() => {
    const dasar = jobs.filter((j) => {
      if (customerId && j.customer_id !== customerId) return false;
      if (unitId && j.unit_id !== unitId) return false;
      if (bulan || tahun) {
        const p = bulanTahunWIB(j.etd);
        if (bulan && p.bulan !== bulan) return false;
        if (tahun && p.tahun !== tahun) return false;
      }
      return true;
    });
    const perKelompok = dasar.filter((j) => j.status !== "cancelled");
    const hitung = (t: Exclude<TahapJob, "semua">) =>
      perKelompok.filter((j) => TAHAP_STATUS[t].includes(j.status)).length;
    return {
      semua: dasar.length,
      aktif: dasar.filter((j) => j.status !== "cancelled").length,
      cancelled: dasar.filter((j) => j.status === "cancelled").length,
      tahapSemua: perKelompok.length,
      ditugaskan: hitung("ditugaskan"),
      proses: hitung("proses"),
      validasi: hitung("validasi"),
      selesai: hitung("selesai")
    };
  }, [jobs, customerId, unitId, bulan, tahun]);

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      customers
        .filter((c) => c.is_active)
        .map((c) => ({
          value: c.id,
          label: c.nama_perusahaan,
          hint: c.kota ?? undefined
        })),
    [customers]
  );

  const unitOptions = useMemo<ComboboxOption[]>(
    () =>
      Object.entries(unitMap)
        .map(([id, u]) => ({ value: id, label: u.kode_unit, hint: u.jenis || undefined }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [unitMap]
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (kelompok === "aktif" && j.status === "cancelled") return false;
      if (kelompok === "cancelled" && j.status !== "cancelled") return false;
      if (kelompok === "aktif" && tahap !== "semua" && !TAHAP_STATUS[tahap].includes(j.status))
        return false;
      if (customerId && j.customer_id !== customerId) return false;
      if (unitId && j.unit_id !== unitId) return false;
      if (bulan || tahun) {
        const p = bulanTahunWIB(j.etd);
        if (bulan && p.bulan !== bulan) return false;
        if (tahun && p.tahun !== tahun) return false;
      }
      if (q) {
        const t = q.toLowerCase();
        if (
          !j.job_number.toLowerCase().includes(t) &&
          !j.customer_nama.toLowerCase().includes(t) &&
          !j.alat_diangkut.toLowerCase().includes(t) &&
          !(j.quotation_number ?? "").toLowerCase().includes(t) &&
          !(j.proyek_nomor ?? "").toLowerCase().includes(t) &&
          !(driverMap[j.driver_id] ?? "").toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [jobs, kelompok, tahap, q, customerId, unitId, bulan, tahun, driverMap]);

  const pg = usePagination(filtered, {
    resetKey: `${kelompok}|${tahap}|${q}|${customerId}|${unitId}|${bulan}|${tahun}`
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Menu Job tersendiri (di bawah Proyek) — tanpa tab Proyek / Job. */}
      <PageHeader
        title="Job"
        description="Daftar job pengiriman dari semua proyek. Job baru dibuat dari menu Proyek."
      />
      {/* Baris 1: cari + aksi. */}
      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari job, proyek, customer, driver, alat, no. penawaran…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div className="hidden lg:flex" style={{ gap: 8, marginLeft: "auto" }}>
          {/* Jadwal dibuka di tab baru supaya daftar job & filternya tetap terbuka. */}
          <Link to="/jobs/jadwal" target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" leftIcon={<CalendarDays style={{ width: 16, height: 16 }} />}>
              Jadwal
            </Button>
          </Link>
        </div>
      </div>

      {/* Baris 2: filter dengan lebar seragam (2 kolom di HP, 4 kolom di desktop). */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 8 }}>
        <Combobox
          value={customerId}
          onChange={setCustomerId}
          options={customerOptions}
          placeholder="Semua customer"
          searchPlaceholder="Cari customer…"
          emptyText="Customer tidak ditemukan"
          clearable
        />
        <Combobox
          value={unitId}
          onChange={setUnitId}
          options={unitOptions}
          placeholder="Semua unit"
          searchPlaceholder="Cari kode unit…"
          emptyText="Unit tidak ditemukan"
          clearable
        />
        <Combobox
          value={bulan ? String(bulan) : ""}
          onChange={(v) => setBulan(Number(v) || 0)}
          options={bulanOptions}
          placeholder="Semua bulan"
          searchPlaceholder="Cari bulan…"
          clearable
        />
        <Combobox
          value={tahun ? String(tahun) : ""}
          onChange={(v) => setTahun(Number(v) || 0)}
          options={tahunOptions}
          placeholder="Semua tahun"
          searchPlaceholder="Cari tahun…"
          clearable
        />
      </div>

      {/* Baris 3: kelompok & tahap status, tombol reset di kanan. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div className="flex flex-col gap-2" style={{ maxWidth: "100%", minWidth: 0 }}>
          <div className="overflow-x-auto scrollbar-thin" style={{ maxWidth: "100%" }}>
            <Tabs
              variant="pill"
              value={kelompok}
              onChange={(k) => {
                setKelompok(k as KelompokJob);
                // Ganti kelompok → filter tahap mulai lagi dari "Semua status".
                setTahap("semua");
              }}
              items={[
                { key: "semua", label: "Semua", count: counts.semua },
                { key: "aktif", label: "Aktif", count: counts.aktif },
                { key: "cancelled", label: "Dibatalkan", count: counts.cancelled }
              ]}
            />
          </div>
          {/* Filter tahap hanya untuk kelompok Aktif; di Semua/Dibatalkan disembunyikan. */}
          {kelompok === "aktif" && (
            <div className="overflow-x-auto scrollbar-thin" style={{ maxWidth: "100%" }}>
              <Tabs
                variant="pill"
                value={tahap}
                onChange={(k) => setTahap(k as TahapJob)}
                items={[
                  { key: "semua", label: "Semua status", count: counts.tahapSemua },
                  { key: "ditugaskan", label: "Ditugaskan", count: counts.ditugaskan },
                  { key: "proses", label: "Dalam proses", count: counts.proses },
                  { key: "validasi", label: "Menunggu validasi", count: counts.validasi },
                  { key: "selesai", label: "Selesai", count: counts.selesai }
                ]}
              />
            </div>
          )}
        </div>
        {bisaReset && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilter}>
            <X style={{ width: 14, height: 14 }} />
            Reset filter
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={PackageCheck}
            title={
              kelompok === "cancelled"
                ? "Belum ada job dibatalkan"
                : tahap === "ditugaskan"
                ? "Tidak ada job yang menunggu konfirmasi driver"
                : tahap === "proses"
                ? "Tidak ada job yang sedang berjalan"
                : tahap === "validasi"
                ? "Belum ada job menunggu validasi"
                : tahap === "selesai"
                ? "Belum ada job selesai"
                : kelompok === "aktif"
                ? "Belum ada job aktif"
                : "Belum ada job"
            }
            description={
              kelompok !== "cancelled" && tahap === "semua"
                ? "Job baru dibuat dari menu Proyek."
                : undefined
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block">
            <div className="table-scroll">
              <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Job ID</th>
                  <th>Customer &amp; Alat</th>
                  <th>Rute</th>
                  <th style={{ width: 130 }}>Unit / Driver</th>
                  <th style={{ width: 100, whiteSpace: "nowrap" }}>ETD</th>
                  <th style={{ width: 100, whiteSpace: "nowrap" }}>ETA</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((j) => {
                  const u = unitMap[j.unit_id];
                  const driverNama = driverMap[j.driver_id];
                  return (
                    <tr key={j.id} className="row-link">
                      <td>
                        <Link
                          to={`/jobs/${j.id}`}
                          style={{
                            display: "block",
                            textDecoration: "none",
                            color: "inherit"
                          }}
                        >
                          <div
                            className="mono"
                            style={{ fontWeight: 600, fontSize: 12.5 }}
                          >
                            {j.job_number}
                          </div>
                        </Link>
                        <ProyekLink job={j} />
                        <QuotationLink job={j} />
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: 13.5,
                            marginBottom: 2
                          }}
                        >
                          {j.customer_nama}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {j.alat_diangkut}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <RuteJob asal={j.asal} tujuan={j.tujuan} />
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        <div style={{ fontWeight: 600 }}>{u?.kode_unit ?? "—"}</div>
                        <div
                          className="muted"
                          style={{
                            fontSize: 11.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          {driverNama
                            ? driverNama.split(" ").slice(0, 2).join(" ")
                            : "—"}
                          {/* Job aktif yang belum dibuka driver di portal. */}
                          {ACTIVE_JOB_STATUSES.includes(j.status) && !j.accepted_at && (
                            <span
                              title="Belum dikonfirmasi driver"
                              style={{ display: "inline-flex", color: "#B45309" }}
                            >
                              <AlertTriangle style={{ width: 11, height: 11 }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                        <SelWaktu value={j.etd} />
                      </td>
                      <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                        <SelWaktu value={j.eta} />
                      </td>
                      <td>
                        <StatusBadge status={j.status} />
                        <TagihanJobInfo job={j} ringkas />
                        {j.uang_jalan_pending && (
                          <div style={{ marginTop: 4 }}>
                            <UangJalanPendingBadge
                              nominal={j.uang_jalan_pending_nominal}
                              since={j.uang_jalan_pending_at}
                            />
                          </div>
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/jobs/${j.id}`}
                          style={{
                            color: "var(--text-tertiary)",
                            display: "inline-flex"
                          }}
                        >
                          <ChevronRight style={{ width: 16, height: 16 }} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Mobile: card list */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((j) => {
              const u = unitMap[j.unit_id];
              const driverNama = driverMap[j.driver_id];
              return (
                <Link
                  key={j.id}
                  to={`/jobs/${j.id}`}
                  className="list-card"
                >
                  <div className="list-card-row">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="mono"
                        style={{
                          fontWeight: 600,
                          fontSize: 12.5,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {j.job_number}
                      </div>
                      <ProyekLink job={j} />
                      <QuotationLink job={j} />
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {j.customer_nama}
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  <TagihanJobInfo job={j} ringkas />
                  {j.uang_jalan_pending && (
                    <UangJalanPendingBadge
                      nominal={j.uang_jalan_pending_nominal}
                      since={j.uang_jalan_pending_at}
                    />
                  )}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {j.alat_diangkut}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      fontSize: 12,
                      color: "var(--text-secondary)"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <MapPin
                        style={{
                          width: 11,
                          height: 11,
                          color: "var(--text-tertiary)",
                          flexShrink: 0
                        }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {takeLastSegment(j.asal)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--brand-primary-dark)"
                      }}
                    >
                      <Flag
                        style={{
                          width: 11,
                          height: 11,
                          flexShrink: 0
                        }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {takeLastSegment(j.tujuan)}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11.5,
                      color: "var(--text-tertiary)",
                      paddingTop: 6,
                      borderTop: "0.5px dashed var(--border-default)"
                    }}
                  >
                    <span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {u?.kode_unit ?? "—"}
                      </span>
                      {driverNama && (
                        <>
                          {" · "}
                          {driverNama.split(" ").slice(0, 2).join(" ")}
                        </>
                      )}
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      whiteSpace: "nowrap"
                    }}
                  >
                    <span>ETD {formatTglJam(j.etd)}</span>
                    <span>ETA {j.eta ? formatTglJam(j.eta) : "—"}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <Pagination state={pg} label="job" />
        </>
      )}

    </div>
  );
}
