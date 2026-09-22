import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/routing/polyline";

/**
 * Leaflet map untuk halaman customer tracking.
 *
 * - Marker truk = posisi real-time dari TrackSolid (update tiap poll).
 * - Marker asal (hijau) + tujuan (merah) = static dari data job.
 * - Polyline biru = rute jalan (decoded dari encoded polyline DB).
 *
 * Sengaja TIDAK pakai react-leaflet karena update marker tanpa unmount
 * lebih mudah dengan API Leaflet murni. Icon inline SVG → tidak bergantung
 * asset Leaflet bawaan yang path-nya pecah di Next.js build.
 */

interface RouteData {
  asal: { lat: number; lng: number };
  tujuan: { lat: number; lng: number };
  polyline: string | null;
  distance_km: number | null;
}

interface Props {
  lat: number;
  lng: number;
  address: string | null;
  route: RouteData | null;
}

const TRUCK_ICON = L.divIcon({
  className: "truck-marker",
  html: `<div style="
    width:36px;height:36px;border-radius:18px;
    background:#2a8a3e;
    border:3px solid white;
    box-shadow:0 2px 6px rgba(0,0,0,0.25);
    display:flex;align-items:center;justify-content:center;
    color:white;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
      <path d="M15 18H9"/>
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
      <circle cx="17" cy="18" r="2"/>
      <circle cx="7" cy="18" r="2"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

function pinIcon(color: string, letter: string): L.DivIcon {
  return L.divIcon({
    className: "endpoint-pin",
    html: `<div style="
      width:28px;height:36px;
      display:flex;align-items:flex-start;justify-content:center;
    ">
      <svg width="28" height="36" viewBox="0 0 32 40" fill="none">
        <path d="M16 0 C7 0 0 7 0 16 C0 26 16 40 16 40 C16 40 32 26 32 16 C32 7 25 0 16 0 Z"
          fill="${color}" stroke="white" stroke-width="2"/>
        <text x="16" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="white"
          font-family="system-ui, sans-serif">${letter}</text>
      </svg>
    </div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36]
  });
}

const ASAL_ICON = pinIcon("#1C9600", "A");
const TUJUAN_ICON = pinIcon("#D33B3B", "B");

export function TrackingMap({ lat, lng, address, route }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const truckMarkerRef = useRef<L.Marker | null>(null);
  const fittedRef = useRef(false);

  // Init map sekali
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: true,
      attributionControl: true
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19
    }).addTo(map);

    // Static layer: polyline + endpoint markers (hanya kalau route ada)
    if (route) {
      L.marker([route.asal.lat, route.asal.lng], {
        icon: ASAL_ICON,
        title: "Lokasi asal"
      }).addTo(map);
      L.marker([route.tujuan.lat, route.tujuan.lng], {
        icon: TUJUAN_ICON,
        title: "Lokasi tujuan"
      }).addTo(map);

      const points: Array<[number, number]> = route.polyline
        ? decodePolyline(route.polyline)
        : [
            [route.asal.lat, route.asal.lng],
            [route.tujuan.lat, route.tujuan.lng]
          ];
      L.polyline(points, {
        color: "#1C9600",
        weight: 4,
        opacity: 0.75,
        dashArray: route.polyline ? undefined : "8,8" // dash kalau fallback straight-line
      }).addTo(map);
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      truckMarkerRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update truck marker saat lat/lng berubah
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!truckMarkerRef.current) {
      truckMarkerRef.current = L.marker([lat, lng], {
        icon: TRUCK_ICON,
        title: address ?? "Posisi truk"
      }).addTo(map);
    } else {
      truckMarkerRef.current.setLatLng([lat, lng]);
      if (address) truckMarkerRef.current.options.title = address;
    }

    // Pertama kali truck muncul: fit bounds semua titik (asal, tujuan, truck).
    // Selanjutnya cuma pan halus ke truck supaya rute tetap kelihatan tanpa
    // user kehilangan konteks.
    if (route && !fittedRef.current) {
      const bounds = L.latLngBounds([
        [route.asal.lat, route.asal.lng],
        [route.tujuan.lat, route.tujuan.lng],
        [lat, lng]
      ]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      fittedRef.current = true;
    } else {
      map.panTo([lat, lng], { animate: true });
    }
  }, [lat, lng, address, route]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#e8f1de" }}
    />
  );
}
