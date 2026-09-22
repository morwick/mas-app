import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Job, JobStatus, Unit } from "@/types";

interface Props {
  units: Unit[];
  jobs: Job[];
  /** Senin pada minggu yang ditampilkan, format YYYY-MM-DD. */
  weekStart: string;
}

const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const statusColor: Record<JobStatus, string> = {
  menunggu_pickup: "#8A8A85",
  loading: "#2563EB",
  dalam_perjalanan: "#1C9600",
  unloading: "#C97900",
  selesai: "#5F5E5A",
  cancelled: "#C13838"
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function tanggalPendek(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short"
  });
}

/** Indeks hari (0-6) sebuah waktu di dalam minggu, di-clamp ke tepi papan. */
function dayIndex(when: string, weekStart: string): number {
  const a = new Date(`${weekStart}T00:00:00`).getTime();
  const b = new Date(when).getTime();
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Papan jadwal unit × hari.
 *
 * Deteksi bentrok yang sudah ada baru bekerja saat admin menekan simpan —
 * bentrok ketahuan setelah datanya diketik. Papan ini menunjukkannya sebelum
 * itu: satu baris per unit, jadi celah kosong dan tumpukan sama-sama terlihat
 * tanpa perlu membuka job satu per satu.
 */
export function JadwalView({ units, jobs, weekStart }: Props) {
  const navigate = useNavigate();
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const hariIni = new Date().toISOString().slice(0, 10);

  const perUnit = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const u of units) map.set(u.id, []);
    for (const j of jobs) {
      const arr = map.get(j.unit_id);
      if (arr) arr.push(j);
    }
    return map;
  }, [units, jobs]);

  function pindahMinggu(delta: number) {
    navigate(`/jobs/jadwal?start=${addDays(weekStart, delta * 7)}`);
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon"
            onClick={() => pindahMinggu(-1)}
            title="Minggu sebelumnya"
          >
            <ChevronLeft style={{ width: 15, height: 15 }} />
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
            {tanggalPendek(weekStart)} – {tanggalPendek(addDays(weekStart, 6))}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-icon"
            onClick={() => pindahMinggu(1)}
            title="Minggu berikutnya"
          >
            <ChevronRight style={{ width: 15, height: 15 }} />
          </button>
          <Link
            to="/jobs/jadwal"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: "none" }}
          >
            Minggu ini
          </Link>
        </div>
        <div style={{ flex: 1 }} />
        <Link to="/jobs/new">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Job baru
          </Button>
        </Link>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 860 }}>
          {/* Kepala tanggal */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px repeat(7, 1fr)",
              borderBottom: "1px solid var(--border-default)"
            }}
          >
            <div
              className="eyebrow"
              style={{ padding: "10px 12px" }}
            >
              Unit
            </div>
            {days.map((d, i) => (
              <div
                key={d}
                style={{
                  padding: "10px 8px",
                  textAlign: "center",
                  background:
                    d === hariIni ? "var(--brand-primary-light)" : undefined
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {HARI[i]}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {tanggalPendek(d)}
                </div>
              </div>
            ))}
          </div>

          {/* Baris unit */}
          {units.map((u) => {
            const unitJobs = perUnit.get(u.id) ?? [];
            return (
              <div
                key={u.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px repeat(7, 1fr)",
                  borderBottom: "1px solid var(--border-default)",
                  minHeight: 56
                }}
              >
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {u.kode_unit}
                  </div>
                  <div
                    className="muted mono"
                    style={{ fontSize: 11 }}
                  >
                    {u.no_polisi}
                  </div>
                </div>

                {/* Kolom hari sebagai latar, lalu bar job ditumpuk di atasnya. */}
                <div
                  style={{
                    gridColumn: "2 / span 7",
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)"
                  }}
                >
                  {days.map((d) => (
                    <div
                      key={d}
                      style={{
                        borderLeft: "1px solid var(--border-default)",
                        background:
                          d === hariIni
                            ? "rgba(28,150,0,0.05)"
                            : undefined
                      }}
                    />
                  ))}

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: "6px 2px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4
                    }}
                  >
                    {unitJobs.map((j) => {
                      const mulai = Math.max(0, dayIndex(j.etd, weekStart));
                      const akhirRaw = dayIndex(
                        j.eta ?? addDays(j.etd.slice(0, 10), 1),
                        weekStart
                      );
                      const akhir = Math.min(6, Math.max(mulai, akhirRaw));
                      const span = akhir - mulai + 1;
                      const belumKonfirmasi =
                        !j.accepted_at &&
                        j.status !== "selesai" &&
                        j.status !== "cancelled";

                      return (
                        <Link
                          key={j.id}
                          to={`/jobs/${j.id}`}
                          title={`${j.job_number} — ${j.customer_nama}`}
                          style={{
                            // Setiap job mendapat barisnya sendiri lalu
                            // digeser mendatar sesuai hari mulainya. Dengan
                            // begitu dua job pada unit yang sama di hari yang
                            // sama tampak bertumpuk vertikal — itulah bentuk
                            // bentroknya, bukan disembunyikan saling menimpa.
                            marginLeft: `calc(${(mulai / 7) * 100}% + 2px)`,
                            width: `calc(${(span / 7) * 100}% - 4px)`,
                            background: statusColor[j.status],
                            color: "white",
                            borderRadius: 4,
                            padding: "3px 6px",
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            opacity: j.status === "selesai" ? 0.55 : 1,
                            border: belumKonfirmasi
                              ? "1.5px solid #F59E0B"
                              : "none"
                          }}
                        >
                          {belumKonfirmasi && (
                            <AlertTriangle
                              style={{ width: 11, height: 11, flexShrink: 0 }}
                            />
                          )}
                          {j.job_number} · {j.customer_nama}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          fontSize: 11.5,
          color: "var(--text-tertiary)"
        }}
      >
        {(
          [
            ["menunggu_pickup", "Menunggu pickup"],
            ["loading", "Loading"],
            ["dalam_perjalanan", "Dalam perjalanan"],
            ["unloading", "Unloading"],
            ["selesai", "Selesai"]
          ] as Array<[JobStatus, string]>
        ).map(([k, label]) => (
          <span
            key={k}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: statusColor[k]
              }}
            />
            {label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <AlertTriangle style={{ width: 11, height: 11, color: "#B45309" }} />
          Belum dikonfirmasi driver
        </span>
      </div>
    </div>
  );
}
