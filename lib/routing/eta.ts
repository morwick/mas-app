import { decodePolyline } from "./polyline";

/**
 * ETA prediction utility — pure math, isomorphic (server & client).
 *
 * Algoritma:
 *   1. Decode polyline → array of [lat, lng].
 *   2. Untuk tiap titik polyline, hitung jarak haversine ke posisi truk.
 *   3. Cari titik terdekat → ambil cumulative distance dari titik itu ke end.
 *   4. Sisa waktu = sisa jarak / avg_speed (dari ORS duration / distance).
 *   5. Prediksi ETA = sekarang + sisa waktu.
 *
 * Catatan akurasi:
 *   - Pakai nearest-vertex approximation (bukan point-to-segment projection),
 *     error <1% untuk polyline ORS yang vertices-nya rapat.
 *   - Avg speed dihitung dari total route ORS — sudah factor in jalan/ferry/dll.
 *   - Truk yang berhenti tetap dianggap "berjalan dengan kecepatan avg" — ETA
 *     tetap update terus, tidak pause. Ini fitur, bukan bug: kalau driver istirahat
 *     lama, ETA prediksi mundur sendiri saat sisa jarak tidak berkurang.
 */

const FALLBACK_AVG_SPEED_KMH = 40;
const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in km. */
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

export interface EtaInput {
  truckLat: number;
  truckLng: number;
  polyline: string;
  routeDistanceKm: number | null;
  routeDurationMin: number | null;
}

export interface EtaResult {
  remaining_km: number;
  remaining_min: number;
  predicted_arrival: Date;
  avg_speed_kmh: number;
}

export function computeEta(input: EtaInput): EtaResult | null {
  const points = decodePolyline(input.polyline);
  if (points.length < 2) return null;

  // Hitung cumulative distance dari start untuk tiap titik
  const cumKm: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const segLen = haversineKm(
      points[i - 1][0],
      points[i - 1][1],
      points[i][0],
      points[i][1]
    );
    cumKm.push(cumKm[i - 1] + segLen);
  }
  const totalKm = cumKm[cumKm.length - 1];

  // Cari titik polyline terdekat ke truk
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineKm(
      input.truckLat,
      input.truckLng,
      points[i][0],
      points[i][1]
    );
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }

  // Sisa jarak = total - cumulative dari start ke titik terdekat
  const remaining_km = Math.max(0, totalKm - cumKm[nearestIdx]);

  // Avg speed: pakai ORS duration kalau ada, fallback 40 km/h
  let avg_speed_kmh = FALLBACK_AVG_SPEED_KMH;
  if (
    input.routeDistanceKm != null &&
    input.routeDurationMin != null &&
    input.routeDurationMin > 0
  ) {
    avg_speed_kmh = (input.routeDistanceKm / input.routeDurationMin) * 60;
  }

  const remaining_min = (remaining_km / avg_speed_kmh) * 60;
  const predicted_arrival = new Date(Date.now() + remaining_min * 60_000);

  return {
    remaining_km: Math.round(remaining_km * 10) / 10,
    remaining_min: Math.round(remaining_min),
    predicted_arrival,
    avg_speed_kmh: Math.round(avg_speed_kmh * 10) / 10
  };
}

/**
 * Format perbandingan vs planned ETA.
 * Return: { label, severity } untuk render badge.
 */
export function compareEta(
  predicted: Date,
  planned: Date | null
): { label: string; severity: "ontime" | "warn" | "late" | "early" } {
  if (!planned) {
    return { label: formatTime(predicted), severity: "ontime" };
  }
  const diffMin = Math.round(
    (predicted.getTime() - planned.getTime()) / 60_000
  );
  if (diffMin <= -15) {
    return {
      label: `${formatTime(predicted)} (cepat ${formatDuration(-diffMin)})`,
      severity: "early"
    };
  }
  if (diffMin >= 60) {
    return {
      label: `${formatTime(predicted)} (telat ${formatDuration(diffMin)})`,
      severity: "late"
    };
  }
  if (diffMin >= 15) {
    return {
      label: `${formatTime(predicted)} (telat ${formatDuration(diffMin)})`,
      severity: "warn"
    };
  }
  return { label: formatTime(predicted), severity: "ontime" };
}

const TZ = "Asia/Jakarta";

/** YYYY-MM-DD versi WIB, agar bisa dibandingkan antar Date dengan andal. */
function wibDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function formatTime(d: Date): string {
  const now = new Date();
  const target = wibDateKey(d);
  const today = wibDateKey(now);
  const tomorrow = wibDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ
  });

  if (target === today) return time;
  if (target === tomorrow) return `Besok ${time}`;
  const dateLabel = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: TZ
  });
  return `${dateLabel} ${time}`;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} mnt`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} jam` : `${h}j ${m}m`;
}
