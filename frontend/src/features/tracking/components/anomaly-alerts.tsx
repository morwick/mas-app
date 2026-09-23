import { useEffect, useState } from "react";
import { AlertTriangle, WifiOff, MapPin } from "lucide-react";
import { publicLocation } from "@/features/tracking/api";
import type { JobStatus } from "@/types";

/**
 * Banner otomatis di atas halaman detail Pantau yang flag anomali:
 *
 *   1. STOP DETECTION — Truk berhenti (posisi tidak berubah >100m) selama
 *      >30 menit saat status = dalam_perjalanan. Tampilkan durasi + alamat
 *      tempat berhenti.
 *
 *   2. GPS OFFLINE — TrackSolid tidak kasih posisi baru >15 menit. Bisa
 *      device mati, signal hilang, atau API down.
 *
 * Polling sendiri /api/tracking/[token] 30 detik. Bisa di-share dengan
 * komponen lain (EtaCard, GpsHealthBadge) tapi untuk MVP biarkan terpisah
 * — HTTP cache browser handle deduplication.
 */

const POLL_INTERVAL_MS = 30_000;
const STATIONARY_THRESHOLD_KM = 0.1; // pergeseran <100m dianggap diam
const STOP_ALERT_MIN = 30; // alert kalau diam >30 menit
const GPS_OFFLINE_MIN = 15;
const EARTH_RADIUS_KM = 6371;

interface Props {
  jobToken: string;
  jobStatus: JobStatus;
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} menit`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} jam` : `${h} jam ${m} menit`;
}

export function AnomalyAlerts({ jobToken, jobStatus }: Props) {
  const [lastSignificantPos, setLastSignificantPos] = useState<{
    lat: number;
    lng: number;
    address: string | null;
    at: Date;
  } | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [, tick] = useState(0);
  const jobEnded = jobStatus === "selesai" || jobStatus === "cancelled";

  // Polling posisi
  useEffect(() => {
    if (jobEnded) return;
    let cancelled = false;

    async function fetchOnce() {
      try {
        const data = await publicLocation(jobToken);
        if (cancelled) return;
        const now = new Date();
        setLastFetchedAt(new Date(data.fetched_at));
        setLastSignificantPos((prev) => {
          if (!prev) {
            return { lat: data.lat, lng: data.lng, address: data.address, at: now };
          }
          const dist = haversineKm(data.lat, data.lng, prev.lat, prev.lng);
          if (dist > STATIONARY_THRESHOLD_KM) {
            // Truk bergerak signifikan → reset titik referensi
            return { lat: data.lat, lng: data.lng, address: data.address, at: now };
          }
          // Tetap diam, update address (jika reverse geocode kasih nilai baru)
          return data.address ? { ...prev, address: data.address } : prev;
        });
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
  }, [jobToken, jobEnded]);

  // Re-render tiap 30s supaya durasi diam ikut update walau tidak ada fetch baru
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (jobEnded) return null;

  const now = Date.now();
  const alerts: Array<{
    kind: "stop" | "offline";
    severity: "warn" | "critical";
    title: string;
    body: string;
  }> = [];

  // Stop detection — hanya saat dalam_perjalanan (loading/unloading wajar diam)
  if (jobStatus === "dalam_perjalanan" && lastSignificantPos) {
    const stationaryMin = Math.floor(
      (now - lastSignificantPos.at.getTime()) / 60_000
    );
    if (stationaryMin >= STOP_ALERT_MIN) {
      alerts.push({
        kind: "stop",
        severity: stationaryMin >= 120 ? "critical" : "warn",
        title: `Truk berhenti selama ${formatDuration(stationaryMin)}`,
        body: lastSignificantPos.address
          ? `Posisi: ${lastSignificantPos.address}`
          : `Koordinat: ${lastSignificantPos.lat.toFixed(5)}, ${lastSignificantPos.lng.toFixed(5)}`
      });
    }
  }

  // GPS offline detection
  if (lastFetchedAt) {
    const offlineMin = Math.floor((now - lastFetchedAt.getTime()) / 60_000);
    if (offlineMin >= GPS_OFFLINE_MIN) {
      alerts.push({
        kind: "offline",
        severity: offlineMin >= 60 ? "critical" : "warn",
        title: `GPS tidak update selama ${formatDuration(offlineMin)}`,
        body: "Cek device atau signal di lokasi truk. Posisi terakhir mungkin sudah tidak akurat."
      });
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {alerts.map((a) => {
        const color =
          a.severity === "critical"
            ? { bg: "#fcebeb", fg: "#791f1f", border: "#e8b8b8" }
            : { bg: "#fff4e0", fg: "#8a5a00", border: "#e8c98c" };
        const Icon =
          a.kind === "offline"
            ? WifiOff
            : a.severity === "critical"
              ? AlertTriangle
              : MapPin;
        return (
          <div
            key={a.kind}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "10px 14px",
              background: color.bg,
              color: color.fg,
              border: `0.5px solid ${color.border}`,
              borderRadius: 10
            }}
          >
            <Icon
              style={{
                width: 18,
                height: 18,
                flexShrink: 0,
                marginTop: 1
              }}
            />
            <div style={{ flex: 1, lineHeight: 1.4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {a.title}
              </div>
              <div style={{ fontSize: 11.5, opacity: 0.9 }}>{a.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
