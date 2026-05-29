import "server-only";

/**
 * OpenRouteService wrapper untuk fetch rute jalan antara 2 titik.
 *
 * Pakai endpoint Directions v2 dengan profile "driving-car" — coverage jalan
 * paling lengkap di Indonesia (data OSM untuk hgv banyak gap di luar Jawa).
 * Truk lowbed/self-loader umumnya pakai jalan yang sama dengan mobil di
 * rute antar kota (negara/provinsi/tol), jadi driving-car cukup akurat
 * untuk visualisasi rute customer. Response geometry dalam encoded polyline
 * (Google format), hemat tempat saat disimpan ke DB.
 *
 * API key gratis di https://openrouteservice.org/dev/#/signup, 2000 req/hari.
 * Set env var `OPENROUTESERVICE_API_KEY` di Vercel + .env.local.
 */

const ENDPOINT =
  "https://api.openrouteservice.org/v2/directions/driving-car";
const TIMEOUT_MS = 10_000;

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  polyline: string;
  distance_km: number;
}

interface OrsRoute {
  geometry: string;
  summary: { distance: number; duration: number };
}

interface OrsResponse {
  routes?: OrsRoute[];
  error?: { code: number; message: string } | string;
}

function getApiKey(): string {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTESERVICE_API_KEY belum di-set di environment variable"
    );
  }
  return key;
}

export async function getRoute(
  from: RoutePoint,
  to: RoutePoint
): Promise<RouteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: getApiKey(),
        "Content-Type": "application/json",
        Accept:
          "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8"
      },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat]
        ]
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ORS HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as OrsResponse;

  if (json.error) {
    const msg =
      typeof json.error === "string"
        ? json.error
        : json.error.message ?? "ORS error";
    throw new Error(`ORS: ${msg}`);
  }

  const route = json.routes?.[0];
  if (!route?.geometry) {
    throw new Error("ORS: tidak ada rute yang ditemukan");
  }

  return {
    polyline: route.geometry,
    distance_km: Math.round(route.summary.distance / 100) / 10
  };
}

export { decodePolyline } from "./polyline";
