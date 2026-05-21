"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet map untuk halaman customer tracking. Sengaja TIDAK pakai react-leaflet
 * karena kita perlu re-center marker tanpa unmount + lifecycle yang tight.
 *
 * Icon truk inline SVG → tidak bergantung asset Leaflet bawaan yang path-nya
 * pecah di Next.js build.
 */

interface Props {
  lat: number;
  lng: number;
  /** Address dipakai sebagai title accessibility marker */
  address: string | null;
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

export function TrackingMap({ lat, lng, address }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Init map sekali saat mount
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
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Sengaja hanya jalan sekali; perubahan lat/lng di-handle oleh efek berikutnya.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker + recenter saat koordinat berubah
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], {
        icon: TRUCK_ICON,
        title: address ?? "Posisi truk"
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([lat, lng]);
      if (address) markerRef.current.options.title = address;
    }

    // Pan halus ke koordinat baru, jangan zoom-out paksa
    map.panTo([lat, lng], { animate: true });
  }, [lat, lng, address]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#e8f1de" }}
    />
  );
}
