import { useEffect, useState } from "react";
import { Satellite, AlertCircle, WifiOff } from "lucide-react";
import { publicLocation } from "@/features/tracking/api";
import { ApiError } from "@/lib/api/client";

/**
 * Badge GPS health: polling /api/tracking/[token] tiap 30s, render
 * status berdasarkan kapan TrackSolid terakhir kasih posisi:
 *   - aktif  (< 2 menit lalu)    → hijau
 *   - stale  (2–15 menit lalu)   → kuning
 *   - offline (> 15 menit / err) → merah
 *
 * Dipakai di header section "Lokasi real-time" admin tracking detail page.
 * Polling redundant dengan TrackSolidEmbed (sama-sama hit endpoint), tapi
 * HTTP cache layer di browser akan handle deduplication.
 */

const POLL_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 2 * 60_000;
const OFFLINE_THRESHOLD_MS = 15 * 60_000;

interface Props {
  jobToken: string;
  jobEnded: boolean;
}

type Health = "active" | "stale" | "offline" | "unknown";

interface HealthState {
  health: Health;
  fetchedAt: Date | null;
  errorMessage?: string;
}

const COLOR: Record<Health, { bg: string; fg: string; icon: string; label: string }> = {
  active: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    icon: "var(--brand-primary)",
    label: "GPS aktif"
  },
  stale: { bg: "#fff4e0", fg: "#8a5a00", icon: "#c97900", label: "GPS lambat" },
  offline: { bg: "#fcebeb", fg: "#791f1f", icon: "#c93030", label: "GPS offline" },
  unknown: {
    bg: "var(--bg-muted)",
    fg: "var(--text-secondary)",
    icon: "var(--text-tertiary)",
    label: "Menunggu data…"
  }
};

function classify(fetchedAt: Date | null): Health {
  if (!fetchedAt) return "unknown";
  const age = Date.now() - fetchedAt.getTime();
  if (age > OFFLINE_THRESHOLD_MS) return "offline";
  if (age > STALE_THRESHOLD_MS) return "stale";
  return "active";
}

function formatAge(fetchedAt: Date | null): string {
  if (!fetchedAt) return "—";
  const ageSec = Math.round((Date.now() - fetchedAt.getTime()) / 1000);
  if (ageSec < 60) return `${ageSec} detik lalu`;
  const ageMin = Math.round(ageSec / 60);
  if (ageMin < 60) return `${ageMin} menit lalu`;
  const ageH = Math.floor(ageMin / 60);
  const m = ageMin % 60;
  return m === 0 ? `${ageH} jam lalu` : `${ageH}j ${m}m lalu`;
}

export function GpsHealthBadge({ jobToken, jobEnded }: Props) {
  const [state, setState] = useState<HealthState>({
    health: "unknown",
    fetchedAt: null
  });
  const [, forceUpdate] = useState(0);

  // Polling fetchedAt
  useEffect(() => {
    if (jobEnded) return;
    let cancelled = false;

    async function fetchOnce() {
      try {
        const data = await publicLocation(jobToken);
        if (cancelled) return;
        const fetchedAt = new Date(data.fetched_at);
        setState({ health: classify(fetchedAt), fetchedAt });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 422) {
          setState({ health: "offline", fetchedAt: null, errorMessage: "Unit belum punya IMEI" });
        }
        // 410/404 (job usai) atau error jaringan: biarkan badge tampil terakhir,
        // klasifikasi berjalan berdasarkan umur data.
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobToken, jobEnded]);

  // Re-classify tiap 30s walau tidak ada fetch baru — supaya badge gradually
  // turun jadi stale/offline saat polling stuck.
  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => ({ ...s, health: classify(s.fetchedAt) }));
      forceUpdate((n) => n + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const color = COLOR[state.health];
  const Icon =
    state.health === "offline"
      ? WifiOff
      : state.health === "stale"
        ? AlertCircle
        : Satellite;

  return (
    <div
      title={state.errorMessage ?? "Kapan TrackSolid terakhir kasih posisi"}
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap"
      }}
    >
      <Icon style={{ width: 11, height: 11, color: color.icon }} />
      <span>{color.label}</span>
      {state.fetchedAt && (
        <span
          style={{
            opacity: 0.75,
            fontWeight: 400,
            paddingLeft: 6,
            borderLeft: `0.5px solid ${color.fg}33`
          }}
        >
          {formatAge(state.fetchedAt)}
        </span>
      )}
    </div>
  );
}
