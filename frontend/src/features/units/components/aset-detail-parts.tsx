/**
 * Bagian halaman detail yang sama persis untuk unit & unit trailer: field
 * detail, tab job aktif / riwayat job / riwayat status / insiden, dan kartu
 * dokumen. Status & alur keduanya sama (migration 20260926000006).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  MapPin,
  PackageCheck,
  Plus,
  RotateCcw,
  Wrench
} from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { bukanArmada } from "@/lib/unit-status";
import { formatDateTime, formatRupiah } from "@/lib/utils";
import {
  IncidentFormModal,
  type AsetInsiden
} from "@/features/units/components/incident-form-modal";
import { IncidentDetailModal } from "@/features/units/components/incident-detail-modal";
import {
  IncidentActionButtons,
  useIncidentActions
} from "@/features/units/components/incident-actions";
import type { Incident, Job, UnitStatus, UnitStatusHistoryEntry } from "@/types";
import { incidentTypeLabel, labelStatusInsiden } from "@/types";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  standby: "Standby",
  bertugas: "Bertugas",
  breakdown: "Breakdown",
  perbaikan: "Perbaikan",
  terjual: "Terjual",
  diafkirkan: "Diafkirkan"
};

/** "unit trailer" → "Unit trailer". */
export function judul(teks: string): string {
  return teks[0].toUpperCase() + teks.slice(1);
}

export function isJobAktif(j: Job): boolean {
  return !["selesai", "cancelled"].includes(j.status);
}

/** Angka di tab Insiden: yang belum selesai, atau semua bila tidak ada yang terbuka. */
export function hitungInsiden(incidents: Incident[]): number {
  const terbuka = incidents.filter((i) => i.status !== "resolved").length;
  return terbuka > 0 ? terbuka : incidents.length;
}

export function DetailField({
  label,
  value,
  valueNode,
  mono,
  fullWidth
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div style={{ gridColumn: fullWidth ? "1 / -1" : "auto" }}>
      <div
        className="eyebrow"
        style={{ marginBottom: 4, fontSize: 10.5 }}
      >
        {label}
      </div>
      {valueNode ?? (
        <div
          className={mono ? "mono" : ""}
          style={{ fontSize: 14, fontWeight: 500 }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

export function JobAktifTab({ activeJob, labelAset }: { activeJob?: Job; labelAset: string }) {
  return (
    activeJob ? (
      <div style={{ padding: 16 }}>
        <Link
          to={`/jobs/${activeJob.id}`}
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "0.5px solid var(--border-default)",
            borderRadius: 8,
            textDecoration: "none",
            color: "var(--text-primary)"
          }}
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
                {activeJob.job_number}
              </span>
              <StatusBadge status={activeJob.status} />
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.35,
                marginBottom: 2
              }}
            >
              {activeJob.alat_diangkut}
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
              <MapPin style={{ width: 11, height: 11 }} />
              {activeJob.tujuan.split(",")[0]}
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
      </div>
    ) : (
      <EmptyState
        icon={PackageCheck}
        title="Tidak ada job aktif"
        description={`${judul(labelAset)} ini siap dipakai untuk job baru.`}
      />
    )
  );
}

export function RiwayatJobTab({ pastJobs, labelAset }: { pastJobs: Job[]; labelAset: string }) {
  return (
    <div>
      {pastJobs.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Belum ada riwayat"
          description={`${judul(labelAset)} ini belum memiliki job yang selesai.`}
        />
      ) : (
        pastJobs.map((j) => (
          <Link
            key={j.id}
            to={`/jobs/${j.id}`}
            style={{
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderBottom: "0.5px solid var(--border-default)",
              textDecoration: "none",
              color: "var(--text-primary)"
            }}
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
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {j.job_number}
                </span>
                <StatusBadge status={j.status} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {j.alat_diangkut}
              </div>
              <div className="caption" style={{ fontSize: 11 }}>
                {j.customer_nama} ·{" "}
                {formatDateTime(j.completed_at ?? j.etd)}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

export function RiwayatStatusTab({ history }: { history: UnitStatusHistoryEntry[] }) {
  return (
    <div style={{ padding: 16 }}>
      {history.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="Belum ada perubahan status"
        />
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column" }}
        >
          {history.map((h, i) => (
            <div
              key={h.id}
              style={{
                display: "flex",
                gap: 14,
                paddingBottom: i === history.length - 1 ? 0 : 16,
                position: "relative"
              }}
            >
              <div
                style={{ position: "relative", flexShrink: 0 }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background:
                      h.status_new === "bertugas"
                        ? "var(--brand-primary)"
                        : h.status_new === "perbaikan"
                          ? "#D89A24"
                          : h.status_new === "breakdown"
                            ? "#C13838"
                          : "var(--text-tertiary)",
                    marginTop: 6
                  }}
                />
                {i < history.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 18,
                      left: 4,
                      width: 1,
                      bottom: -16,
                      background: "var(--border-default)"
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 2
                  }}
                >
                  <StatusBadge status={h.status_new} />
                  <span className="caption mono">
                    {formatDateTime(h.changed_at)}
                  </span>
                </div>
                {h.reason && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      marginBottom: 2
                    }}
                  >
                    {h.reason}
                  </div>
                )}
                <div className="caption" style={{ fontSize: 11 }}>
                  oleh {h.changed_by_nama}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Daftar insiden + tombol catat, beserta modal form / detail / konfirmasi
 * aksinya. Status aset mengikuti insiden (trigger DB).
 */
export function InsidenPanel({
  aset,
  kode,
  labelAset,
  status,
  incidents,
  activeJobs
}: {
  aset: AsetInsiden;
  kode: string;
  /** "unit" / "unit trailer". */
  labelAset: string;
  status: UnitStatus;
  incidents: Incident[];
  activeJobs: Job[];
}) {
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const openIncidentCount = useMemo(
    () => incidents.filter((i) => i.status !== "resolved").length,
    [incidents]
  );
  const [incidentFormOpen, setIncidentFormOpen] = useState(false);
  const [editIncident, setEditIncident] = useState<Incident | null>(null);
  // Simpan id saja supaya modal detail ikut data terbaru setelah aksi.
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const openIncident = incidents.find((i) => i.id === openIncidentId) ?? null;
  const incidentActions = useIncidentActions(`${labelAset} ${kode}`, (action) => {
    if (action === "hapus") setOpenIncidentId(null);
  });

  function startEditIncident(inc: Incident) {
    setEditIncident(inc);
    setIncidentFormOpen(true);
  }

  return (
    <>
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)"
            }}
          >
            {openIncidentCount > 0
              ? `${openIncidentCount} insiden belum selesai`
              : "Tidak ada insiden terbuka"}
          </div>
          {canManageOperational && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                // Aset terjual / diafkirkan bukan lagi armada — DB juga menolaknya.
                if (bukanArmada(status)) {
                  toast.error(
                    `${judul(labelAset)} ${kode} sudah ${UNIT_STATUS_LABEL[status]} — tidak bisa ditambahkan insiden.`
                  );
                  return;
                }
                setEditIncident(null);
                setIncidentFormOpen(true);
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Catat insiden
            </button>
          )}
        </div>

        {incidents.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Belum ada catatan insiden"
            description="Catat insiden seperti kecelakaan, kerusakan, atau breakdown untuk riwayat & klaim asuransi."
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}
          >
            {incidents.map((inc) => (
              <div
                key={inc.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenIncidentId(inc.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setOpenIncidentId(inc.id);
                  }
                }}
                style={{
                  textAlign: "left",
                  background: "white",
                  border: "0.5px solid var(--border-default)",
                  borderRadius: 8,
                  padding: 14,
                  cursor: "pointer"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                        flexWrap: "wrap"
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600
                        }}
                      >
                        {incidentTypeLabel[inc.tipe]}
                      </span>
                      <Badge
                        variant={
                          inc.status === "resolved"
                            ? "brand"
                            : inc.status === "in_progress"
                              ? "info"
                              : "warning"
                        }
                      >
                        {labelStatusInsiden(inc)}
                      </Badge>
                      {inc.job_number && (
                        <Badge variant="neutral">
                          {inc.job_number}
                        </Badge>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--text-secondary)",
                        marginBottom: 4
                      }}
                    >
                      {inc.deskripsi}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        flexWrap: "wrap"
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4
                        }}
                      >
                        <CalendarClock
                          style={{ width: 11, height: 11 }}
                        />
                        {formatDateTime(inc.tanggal)}
                      </span>
                      {inc.lokasi && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          <MapPin
                            style={{ width: 11, height: 11 }}
                          />
                          {inc.lokasi}
                        </span>
                      )}
                      {inc.biaya_repair != null && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          <Wrench
                            style={{ width: 11, height: 11 }}
                          />
                          {formatRupiah(inc.biaya_repair)}
                        </span>
                      )}
                    </div>
                  </div>
                  {inc.photos.length > 0 && (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 6,
                        overflow: "hidden",
                        border: "0.5px solid var(--border-default)",
                        flexShrink: 0
                      }}
                    >
                      <img
                        src={inc.photos[0].file_url}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover"
                        }}
                      />
                    </div>
                  )}
                </div>
                {canManageOperational && inc.status !== "resolved" && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "0.5px solid var(--border-default)"
                    }}
                    // Tombol aksi tidak ikut membuka modal detail.
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <IncidentActionButtons
                      incident={inc}
                      onAction={(a) => incidentActions.request(a, inc)}
                      onEdit={() => startEditIncident(inc)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <IncidentFormModal
        open={incidentFormOpen}
        onClose={() => setIncidentFormOpen(false)}
        aset={aset}
        activeJobs={activeJobs}
        incident={editIncident}
      />
      <IncidentDetailModal
        open={openIncident !== null}
        onClose={() => setOpenIncidentId(null)}
        incident={openIncident}
        onAction={
          canManageOperational && openIncident
            ? (a) => incidentActions.request(a, openIncident)
            : undefined
        }
        onEdit={
          canManageOperational && openIncident
            ? () => {
                setOpenIncidentId(null);
                startEditIncident(openIncident);
              }
            : undefined
        }
      />
      {incidentActions.node}
    </>
  );
}

/**
 * Ringkasan masa berlaku dokumen kendaraan.
 *
 * Ditaruh di kolom kanan bersama utilisasi karena sifatnya sama: keadaan unit
 * yang perlu dilihat sekilas, bukan data yang dibaca baris per baris. Yang
 * sudah lewat atau tinggal sebulan diberi warna — sisanya sengaja tenang
 * supaya yang berwarna benar-benar berarti.
 */
export interface DokumenItem {
  label: string;
  tanggal: string | null | undefined;
  nomor: string | null | undefined;
  /** False = tanggal terbit (tanpa masa berlaku), tidak diberi hitung mundur. */
  berlaku?: boolean;
}

export function DokumenCard({
  judul = "Dokumen kendaraan",
  items,
  kosong
}: {
  judul?: string;
  items: DokumenItem[];
  /** Teks saat belum ada dokumen yang dicatat. */
  kosong: string;
}) {
  const adaIsinya = items.some((i) => i.tanggal);
  const adaMasaBerlaku = items.some((i) => i.tanggal && i.berlaku !== false);

  return (
    <div className="card card-pad">
      <div className="h3" style={{ marginBottom: 4 }}>
        {judul}
      </div>
      <div className="caption" style={{ marginBottom: 12 }}>
        {!adaIsinya ? kosong : adaMasaBerlaku ? "Diingatkan 30 hari sebelum habis" : "Dokumen tercatat"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => {
          const sisaHari = item.tanggal && item.berlaku !== false
            ? Math.floor(
                (new Date(item.tanggal).getTime() - Date.now()) / 86_400_000
              )
            : null;
          const warna =
            sisaHari === null
              ? "var(--text-tertiary)"
              : sisaHari < 0
                ? "#C13838"
                : sisaHari <= 30
                  ? "#B45309"
                  : "var(--text-primary)";

          return (
            <div
              key={item.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
                fontSize: 12.5
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                {item.nomor && (
                  <div className="caption mono" style={{ fontSize: 10.5 }}>
                    {item.nomor}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", color: warna }}>
                {item.tanggal ? (
                  <>
                    <div style={{ fontWeight: 600 }}>
                      {new Date(item.tanggal).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                      })}
                    </div>
                    <div style={{ fontSize: 10.5 }}>
                      {sisaHari === null
                        ? "tanggal terbit"
                        : sisaHari < 0
                          ? `lewat ${Math.abs(sisaHari)} hari`
                          : `${sisaHari} hari lagi`}
                    </div>
                  </>
                ) : (
                  <span>—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface Utilisasi {
  bertugas: number;
  standby: number;
  perbaikan: number;
  totalJobs: number;
}

/**
 * Angka SEMENTARA — rumus utilisasi yang sebenarnya (dari riwayat status)
 * menunggu konfirmasi. Dipakai sama untuk unit & unit trailer.
 */
export function utilisasiSementara(jobs: Job[], status: UnitStatus): Utilisasi {
  const totalJobs = jobs.length;
  const completed = jobs.filter((j) => j.status === "selesai").length;
  const bertugas = Math.max(2, Math.round(completed * 2));
  const perbaikan = status === "perbaikan" ? 5 : 1;
  const standby = Math.max(0, 30 - bertugas - perbaikan);
  return { bertugas, standby, perbaikan, totalJobs };
}

export function UtilisasiCard({ utilisasi }: { utilisasi: Utilisasi }) {
  return (
    <div className="card card-pad">
      <div className="h3" style={{ marginBottom: 12 }}>
        Utilisasi 30 hari
      </div>
      <UtilizationDonut
        bertugas={utilisasi.bertugas}
        standby={utilisasi.standby}
        perbaikan={utilisasi.perbaikan}
      />
      <div className="caption" style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
        * Data placeholder, akan dihitung dari riwayat status
      </div>
    </div>
  );
}

function UtilizationDonut({
  bertugas,
  standby,
  perbaikan
}: {
  bertugas: number;
  standby: number;
  perbaikan: number;
}) {
  const total = bertugas + standby + perbaikan;
  const pct = total > 0 ? Math.round((bertugas / total) * 100) : 0;
  const r = 48;
  const c = 2 * Math.PI * r;
  const dashB = total > 0 ? (bertugas / total) * c : 0;
  const dashP = total > 0 ? (perbaikan / total) * c : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth="14"
        />
        <g transform="rotate(-90 60 60)">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth="14"
            strokeDasharray={`${dashB} ${c}`}
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--status-perbaikan-text)"
            strokeWidth="14"
            strokeDasharray={`${dashP} ${c}`}
            strokeDashoffset={-dashB}
          />
        </g>
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {pct}%
        </text>
        <text
          x="60"
          y="74"
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-tertiary)"
          letterSpacing="0.5"
        >
          UTILISASI
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1
        }}
      >
        <LegendRow
          color="var(--brand-primary)"
          label="Bertugas"
          value={`${bertugas}h`}
        />
        <LegendRow
          color="var(--bg-subtle)"
          label="Standby"
          value={`${standby}h`}
        />
        <LegendRow
          color="var(--status-perbaikan-text)"
          label="Perbaikan"
          value={`${perbaikan}h`}
        />
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
          border: "0.5px solid var(--border-strong)"
        }}
      />
      <span style={{ flex: 1, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
