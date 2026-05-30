"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { UnitStatus } from "@/lib/types";

/**
 * Peta full fleet — render semua unit aktif yang punya posisi GPS,
 * dengan warna marker dibedakan per status.
 *
 * Standalone (tidak share state dengan picker-map) supaya bisa di-zoom &
 * di-fit-bounds tanpa interferensi dengan pin lokasi job.
 */

export interface FleetMapUnit {
  id: string;
  kode_unit: string;
  jenis_unit_nama: string;
  status: UnitStatus;
  lat: number;
  lng: number;
  address: string | null;
}

interface Props {
  units: FleetMapUnit[];
  focusUnitId: string | null;
}

const STATUS_COLOR: Record<UnitStatus, string> = {
  standby: "#1C9600",
  bertugas: "#E48F00",
  perbaikan: "#6B7280"
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  standby: "Standby",
  bertugas: "Bertugas",
  perbaikan: "Perbaikan"
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeUnitIcon(kode: string, color: string): L.DivIcon {
  const label = escapeHtml(kode);
  return L.divIcon({
    className: "unit-pin",
    html: `<div style="
      display:flex;flex-direction:column;align-items:center;gap:2px;
      font-family:system-ui,-apple-system,sans-serif;
    ">
      <div style="
        font-size:10.5px;font-weight:700;color:white;
        background:${color};
        padding:2px 7px;border-radius:10px;
        border:1.5px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.25);
        line-height:1;letter-spacing:0.3px;
        white-space:nowrap;
      ">${label}</div>
      <div style="
        width:30px;height:30px;border-radius:15px;
        background:${color};
        border:2.5px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        color:white;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>
    </div>`,
    iconSize: [80, 50],
    iconAnchor: [40, 35]
  });
}

function popupHtml(u: FleetMapUnit): string {
  const kode = escapeHtml(u.kode_unit);
  const jenis = escapeHtml(u.jenis_unit_nama);
  const color = STATUS_COLOR[u.status];
  const label = STATUS_LABEL[u.status];
  const addr = u.address
    ? `<div style="margin-top:6px;font-size:11px;color:#555;line-height:1.4">${escapeHtml(u.address)}</div>`
    : "";
  return `<div style="font-size:12px;line-height:1.4;min-width:160px;font-family:system-ui,sans-serif">
    <div style="font-weight:700;color:#222;font-size:13px">${kode}</div>
    <div style="color:#666">${jenis}</div>
    <div style="margin-top:4px">
      <span style="
        display:inline-block;font-size:10.5px;font-weight:600;
        padding:2px 7px;border-radius:10px;
        background:${color}22;color:${color};
      ">${label}</span>
    </div>
    ${addr}
  </div>`;
}

const INDONESIA_CENTER: [number, number] = [-2.5, 118];
const INDONESIA_ZOOM = 5;

export function FleetMap({ units, focusUnitId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const fittedRef = useRef(false);

  // Init map sekali
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    const map = L.map(container, {
      center: INDONESIA_CENTER,
      zoom: INDONESIA_ZOOM,
      zoomControl: true
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19
    }).addTo(map);
    mapRef.current = map;

    // Resize observer → wajib untuk fullscreen toggle. Leaflet butuh
    // invalidateSize tiap container berubah dimensi, jika tidak tiles
    // tidak ter-render di area baru.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      fittedRef.current = false;
    };
  }, []);

  // Sync marker tiap kali list units berubah
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const current = markersRef.current;
    const nextIds = new Set(units.map((u) => u.id));

    // Hapus marker yang sudah tidak ada di list
    for (const [id, marker] of current) {
      if (!nextIds.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }

    // Tambah / update
    for (const u of units) {
      const color = STATUS_COLOR[u.status];
      const existing = current.get(u.id);
      if (existing) {
        existing.setLatLng([u.lat, u.lng]);
        existing.setIcon(makeUnitIcon(u.kode_unit, color));
        existing.setPopupContent(popupHtml(u));
      } else {
        const m = L.marker([u.lat, u.lng], {
          icon: makeUnitIcon(u.kode_unit, color),
          title: `${u.kode_unit} — ${STATUS_LABEL[u.status]}`
        }).addTo(map);
        m.bindPopup(popupHtml(u));
        current.set(u.id, m);
      }
    }

    // Fit bounds pertama kali ada data → biar user lihat semua unit
    if (!fittedRef.current && units.length > 0) {
      const bounds = L.latLngBounds(
        units.map((u) => [u.lat, u.lng] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      fittedRef.current = true;
    }
  }, [units]);

  // Focus unit dari side panel → pan + open popup
  useEffect(() => {
    if (!focusUnitId) return;
    const m = markersRef.current.get(focusUnitId);
    const map = mapRef.current;
    if (!m || !map) return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), {
      duration: 0.7
    });
    m.openPopup();
  }, [focusUnitId]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#e8f1de" }}
    />
  );
}
