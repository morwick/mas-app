import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CircleDot,
  PackageCheck,
  Plus,
  Truck
} from "lucide-react";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { UnitCard } from "@/features/dashboard/components/unit-card";
import { Fab } from "@/components/layout/fab";
import { useAuth } from "@/lib/auth/AuthContext";
import type { DokumenJatuhTempo, JobBelumKonfirmasi, MonitoringServis } from "@/features/dashboard/api";
import {
  PerluTindakanCard,
  RincianDokumen,
  type TindakanItem
} from "@/features/dashboard/components/perlu-tindakan-card";
import type { Unit } from "@/types";

/** "tidak_siap" = Breakdown + Perbaikan (kartu stat keempat). */
type Filter = "semua" | "standby" | "bertugas" | "breakdown" | "perbaikan" | "tidak_siap";

interface ActiveJobSummary {
  unitId: string;
  job: {
    id: string;
    job_number: string;
    asal: string;
    tujuan: string;
    driver_nama: string;
  };
}

interface Props {
  units: Unit[];
  counts: { standby: number; bertugas: number; breakdown: number; perbaikan: number };
  activeJobs: ActiveJobSummary[];
  /** Antrean tindakan admin (alur v2): validasi job & pengajuan uang jalan. */
  jobsMenungguValidasi?: number;
  uangJalanDiajukan?: number;
  /** Job ditugaskan tapi drivernya belum menekan Terima Job — perlu di-follow up. */
  jobBelumKonfirmasi?: JobBelumKonfirmasi[];
  /** Job selesai & tervalidasi tapi belum masuk tagihan mana pun. */
  jobsBelumInvoice?: number;
  /** Dokumen kendaraan & SIM yang habis / habis ≤ 30 hari lagi. */
  dokumenJatuhTempo?: DokumenJatuhTempo[];
  /** Unit yang service-nya lewat jadwal / mendekati jadwal. */
  monitoringServis?: MonitoringServis;
  /** Jumlah penawaran deal yang masih punya item deal belum dibuatkan job. */
  penawaranDealTanpaJob?: number;
  /** Jumlah penawaran terkirim yang habis masa berlakunya ≤ 7 hari lagi. */
  penawaranAkanKedaluwarsa?: number;
}

export function DashboardView({
  units,
  counts,
  activeJobs,
  jobsMenungguValidasi = 0,
  uangJalanDiajukan = 0,
  jobBelumKonfirmasi = [],
  jobsBelumInvoice = 0,
  dokumenJatuhTempo = [],
  monitoringServis,
  penawaranDealTanpaJob = 0,
  penawaranAkanKedaluwarsa = 0
}: Props) {
  const { canManageOperational } = useAuth();
  const [filter, setFilter] = useState<Filter>("semua");
  const tidakSiap = counts.breakdown + counts.perbaikan;
  const total = counts.standby + counts.bertugas + tidakSiap;

  const filtered = useMemo(() => {
    if (filter === "semua") return units;
    if (filter === "tidak_siap") {
      return units.filter((u) => u.status === "breakdown" || u.status === "perbaikan");
    }
    return units.filter((u) => u.status === filter);
  }, [units, filter]);

  // Hanya tindakan yang ada; urutan = yang paling menahan pekerjaan dulu.
  const tindakan: TindakanItem[] = [
    ...(uangJalanDiajukan > 0
      ? [
          {
            key: "uang-jalan",
            to: "/uang-jalan",
            judul: `${uangJalanDiajukan} pengajuan uang jalan`,
            keterangan: "Cairkan & unggah bukti transfer."
          }
        ]
      : []),
    ...(jobBelumKonfirmasi.length > 0
      ? [
          {
            key: "belum-konfirmasi",
            // Admin → daftar job tab "Ditugaskan"; operator (tanpa menu Job) → Pantau.
            to: canManageOperational ? "/jobs?tab=ditugaskan" : "/tracking",
            judul: `${jobBelumKonfirmasi.length} job belum dikonfirmasi`,
            keterangan:
              jobBelumKonfirmasi.length === 1
                ? `Follow up ${jobBelumKonfirmasi[0].driver_nama}.`
                : "Follow up drivernya."
          }
        ]
      : []),
    ...(counts.breakdown > 0
      ? [
          {
            key: "breakdown",
            to: "/units?status=breakdown",
            judul: `${counts.breakdown} unit breakdown`,
            keterangan: "Tangani insidennya."
          }
        ]
      : []),
    // Penawaran hanya dibuka admin / superadmin — operator tidak melihat baris
    // ini. Cukup angkanya; daftarnya di halaman Penawaran (sudah terfilter).
    ...(canManageOperational && penawaranDealTanpaJob > 0
      ? [
          {
            key: "penawaran-deal",
            to: "/quotations?filter=deal_pending",
            judul: `${penawaranDealTanpaJob} penawaran deal belum ada job`,
            keterangan: "Buatkan job-nya."
          }
        ]
      : []),
    ...(canManageOperational && penawaranAkanKedaluwarsa > 0
      ? [
          {
            key: "penawaran-kedaluwarsa",
            to: "/quotations?filter=akan_kedaluwarsa",
            judul: `${penawaranAkanKedaluwarsa} penawaran akan kedaluwarsa`,
            keterangan: "Expired ≤ 7 hari — follow up."
          }
        ]
      : []),
    // Service lewat jadwal / mendekati — dulu kartu "Monitoring service".
    ...(monitoringServis && monitoringServis.lewat_jadwal.length > 0
      ? [
          {
            key: "servis-lewat",
            to: "/services?status=overdue",
            judul: `${monitoringServis.lewat_jadwal.length} unit lewat jadwal service`,
            keterangan: "Segera jadwalkan service."
          }
        ]
      : []),
    ...(monitoringServis && monitoringServis.mendekati.length > 0
      ? [
          {
            key: "servis-mendekati",
            to: "/services?status=mendekati",
            judul: `${monitoringServis.mendekati.length} unit mendekati jadwal service`,
            keterangan: "Siapkan jadwal service."
          }
        ]
      : []),
    // Validasi & penagihan bukan wewenang operator (dan job menunggu validasi
    // tidak tampil di Pantau) — hanya admin / superadmin.
    ...(canManageOperational && jobsMenungguValidasi > 0
      ? [
          {
            key: "validasi",
            to: "/jobs?tab=validasi",
            judul: `${jobsMenungguValidasi} job menunggu validasi`,
            keterangan: "Periksa foto & approve."
          }
        ]
      : []),
    ...(canManageOperational && jobsBelumInvoice > 0
      ? [
          {
            key: "invoice",
            to: "/invoices",
            judul: `${jobsBelumInvoice} job belum ditagih`,
            keterangan: "Buatkan tagihannya."
          }
        ]
      : []),
    ...(dokumenJatuhTempo.length > 0
      ? [
          {
            key: "dokumen",
            to: dokumenJatuhTempo[0].href,
            judul: `${dokumenJatuhTempo.length} dokumen jatuh tempo`,
            keterangan: "STNK / KIR / pajak / SIM ≤ 30 hari.",
            rincian: <RincianDokumen dokumen={dokumenJatuhTempo} />
          }
        ]
      : [])
  ];

  const jobByUnit = useMemo(
    () => new Map(activeJobs.map((a) => [a.unitId, a.job])),
    [activeJobs]
  );

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Stat cards */}
      <div className="stat-grid">
        <StatCard
          label="Total armada"
          value={total}
          sublabel={`${units.filter((u) => u.is_active).length} aktif`}
          icon={Truck}
          tone="neutral"
        />
        <StatCard
          label="Standby"
          value={counts.standby}
          sublabel="Siap di-assign"
          icon={CircleDot}
          tone="standby"
          active={filter === "standby"}
          onClick={() =>
            setFilter(filter === "standby" ? "semua" : "standby")
          }
        />
        <StatCard
          label="Bertugas"
          value={counts.bertugas}
          sublabel={`${activeJobs.length} job aktif`}
          icon={PackageCheck}
          tone="bertugas"
          active={filter === "bertugas"}
          onClick={() =>
            setFilter(filter === "bertugas" ? "semua" : "bertugas")
          }
        />
        <StatCard
          label="Breakdown / Perbaikan"
          value={tidakSiap}
          sublabel={`${counts.breakdown} breakdown · ${counts.perbaikan} perbaikan`}
          icon={AlertTriangle}
          tone="perbaikan"
          active={filter === "tidak_siap"}
          onClick={() =>
            setFilter(filter === "tidak_siap" ? "semua" : "tidak_siap")
          }
        />
      </div>

      <PerluTindakanCard items={tindakan} />

      <div className="split-2">
        {/* Left — unit status */}
        <div className="card">
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "0.5px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <div>
              <div className="h3" style={{ marginBottom: 2 }}>
                Status armada
              </div>
              <div className="caption">
                {filtered.length} dari {total} unit
              </div>
            </div>
            <div
              className="scrollbar-thin"
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                maxWidth: "100%",
                minWidth: 0
              }}
            >
              {(
                [
                  { k: "semua", l: "Semua", c: total },
                  { k: "standby", l: "Standby", c: counts.standby },
                  { k: "bertugas", l: "Bertugas", c: counts.bertugas },
                  { k: "breakdown", l: "Breakdown", c: counts.breakdown },
                  { k: "perbaikan", l: "Perbaikan", c: counts.perbaikan }
                ] as { k: Filter; l: string; c: number }[]
              ).map((f) => (
                <button
                  key={f.k}
                  type="button"
                  className={`chip ${filter === f.k ? "active" : ""}`}
                  onClick={() => setFilter(f.k)}
                  style={{ flexShrink: 0 }}
                >
                  {f.l}
                  <span className="chip-count">{f.c}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card-grid-3" style={{ padding: 12 }}>
            {filtered.map((u) => {
              const job = jobByUnit.get(u.id);
              return (
                <UnitCard
                  key={u.id}
                  unit={u}
                  job={
                    job
                      ? {
                          id: job.id,
                          job_number: job.job_number,
                          asal: job.asal,
                          tujuan: job.tujuan
                        }
                      : undefined
                  }
                  driverNama={job?.driver_nama}
                />
              );
            })}
            {filtered.length === 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-tertiary)",
                  fontSize: 12.5
                }}
              >
                Tidak ada unit pada filter ini.
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "0.5px solid var(--border-default)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div className="h3" style={{ marginBottom: 2 }}>
                  Job aktif hari ini
                </div>
                <div className="caption">{activeJobs.length} dalam progress</div>
              </div>
              <Link to="/jobs" className="btn-link" style={{ fontSize: 12 }}>
                Lihat semua <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {activeJobs.slice(0, 4).map((a) => {
                const unit = units.find((u) => u.id === a.unitId);
                return (
                  <Link
                    key={a.job.id}
                    to={`/jobs/${a.job.id}`}
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      borderBottom: "0.5px solid var(--border-default)",
                      textDecoration: "none",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      transition: "background 120ms ease"
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--bg-muted)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4
                        }}
                      >
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            fontWeight: 500
                          }}
                        >
                          {a.job.job_number}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          lineHeight: 1.35,
                          marginBottom: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {a.job.tujuan.split(",")[0]}
                      </div>
                      <div
                        className="caption"
                        style={{
                          fontSize: 11.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        <span>{unit?.kode_unit}</span>
                        <span>·</span>
                        <span>{a.job.driver_nama.split(" ")[0]}</span>
                      </div>
                    </div>
                    <ArrowRight
                      style={{
                        width: 16,
                        height: 16,
                        color: "var(--text-tertiary)"
                      }}
                    />
                  </Link>
                );
              })}
              {activeJobs.length === 0 && (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--text-tertiary)",
                    fontSize: 12.5
                  }}
                >
                  Belum ada job aktif.
                </div>
              )}
            </div>
          </div>

          {/* Brand CTA */}
          <div
            className="card"
            style={{
              background: "linear-gradient(135deg, #145B00 0%, #1C9600 100%)",
              color: "white",
              border: "none",
              padding: 20
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Plus style={{ width: 20, height: 20 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    marginBottom: 4
                  }}
                >
                  Buat job pengiriman baru
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    opacity: 0.85,
                    marginBottom: 14,
                    lineHeight: 1.5
                  }}
                >
                  Generate share link otomatis untuk customer. Unit terassign
                  langsung berubah ke status Bertugas.
                </div>
                <Link
                  to="/jobs/new"
                  style={{
                    background: "white",
                    color: "var(--brand-primary-dark)",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    textDecoration: "none"
                  }}
                >
                  Job baru
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Fab href="/jobs/new" label="Job baru" />
    </div>
  );
}

