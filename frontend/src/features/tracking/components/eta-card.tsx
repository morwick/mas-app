import { useEffect, useState } from "react";
import { Clock, AlertTriangle, Gauge } from "lucide-react";
import { computeEta, compareEta } from "@/lib/routing/eta";
import { publicLocation } from "@/features/tracking/api";

const POLL_INTERVAL_MS = 30_000;

const COLOR: Record<string, { bg: string; fg: string; icon: string; label: string }> = {
  ontime: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    icon: "var(--brand-primary)",
    label: "On time"
  },
  early: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    icon: "var(--brand-primary)",
    label: "Lebih cepat"
  },
  warn: { bg: "#fff4e0", fg: "#8a5a00", icon: "#c97900", label: "Mendekati telat" },
  late: { bg: "#fcebeb", fg: "#791f1f", icon: "#c93030", label: "Telat" }
};

interface Props {
  jobToken: string;
  polyline: string;
  routeDistanceKm: number | null;
  routeDurationMin: number | null;
  plannedEta: string | null;
  active: boolean;
}

interface Location {
  lat: number;
  lng: number;
}

export function EtaCard({
  jobToken,
  polyline,
  routeDistanceKm,
  routeDurationMin,
  plannedEta,
  active
}: Props) {
  const [loc, setLoc] = useState<Location | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function fetchOnce() {
      try {
        const data = await publicLocation(jobToken);
        if (!cancelled) setLoc({ lat: data.lat, lng: data.lng });
      } catch {
        // silent
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobToken, active]);

  if (!active) {
    return (
      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Prediksi ETA
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          Prediksi muncul saat status "Dalam perjalanan".
        </div>
      </div>
    );
  }

  if (!loc) {
    return (
      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Prediksi ETA
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          Menghitung berdasarkan posisi truk…
        </div>
      </div>
    );
  }

  const eta = computeEta({
    truckLat: loc.lat,
    truckLng: loc.lng,
    polyline,
    routeDistanceKm,
    routeDurationMin
  });

  if (!eta) {
    return (
      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Prediksi ETA
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          Tidak bisa menghitung (polyline invalid).
        </div>
      </div>
    );
  }

  const cmp = compareEta(eta.predicted_arrival, plannedEta ? new Date(plannedEta) : null);
  const color = COLOR[cmp.severity];

  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Prediksi ETA
      </div>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: color.bg,
          color: color.fg,
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 10
        }}
      >
        {cmp.severity === "late" || cmp.severity === "warn" ? (
          <AlertTriangle
            style={{ width: 18, height: 18, color: color.icon, flexShrink: 0 }}
          />
        ) : (
          <Clock
            style={{ width: 18, height: 18, color: color.icon, flexShrink: 0 }}
          />
        )}
        <div>
          <div style={{ fontSize: 10.5, opacity: 0.85, marginBottom: 1 }}>
            {color.label}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
            {cmp.label}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 11.5,
          color: "var(--text-secondary)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Sisa jarak</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {eta.remaining_km.toFixed(1)} km
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Sisa waktu</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {formatDuration(eta.remaining_min)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <Gauge style={{ width: 10, height: 10 }} />
            Avg speed
          </span>
          <span style={{ color: "var(--text-tertiary)", fontSize: 10.5 }}>
            {eta.avg_speed_kmh.toFixed(0)} km/jam
          </span>
        </div>
      </div>
    </div>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} menit`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} jam` : `${h} jam ${m} menit`;
}
