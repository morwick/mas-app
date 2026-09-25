import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/routing/polyline";
import type { UnitStatus } from "@/types";

/**
 * Peta full fleet — render semua unit aktif yang punya posisi GPS,
 * dengan warna marker dibedakan per status.
 *
 * Standalone (tidak share state dengan picker-map) supaya bisa di-zoom &
 * di-fit-bounds tanpa interferensi dengan pin lokasi job.
 */

export interface FleetMapUnitJob {
  id: string;
  number: string;
  customer_nama: string;
  tujuan: string;
  route: {
    asal: { lat: number; lng: number };
    tujuan: { lat: number; lng: number };
    polyline: string | null;
  } | null;
}

export interface FleetMapUnit {
  id: string;
  kode_unit: string;
  jenis_unit_nama: string;
  status: UnitStatus;
  lat: number;
  lng: number;
  address: string | null;
  job: FleetMapUnitJob | null;
}

interface Props {
  units: FleetMapUnit[];
  focusUnitId: string | null;
  onUnitClick?: (id: string) => void;
}

const STATUS_COLOR: Record<UnitStatus, string> = {
  standby: "#1C9600",
  bertugas: "#E48F00",
  breakdown: "#C13838",
  perbaikan: "#6B7280",
  terjual: "#9CA3AF",
  diafkirkan: "#9CA3AF"
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  standby: "Standby",
  bertugas: "Bertugas",
  breakdown: "Breakdown",
  perbaikan: "Perbaikan",
  terjual: "Terjual",
  diafkirkan: "Diafkirkan"
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
  const jobBlock = u.job
    ? `<div style="
        margin-top:8px;padding-top:8px;
        border-top:0.5px dashed #d0d4d9;
      ">
        <div style="font-size:10.5px;color:#888;font-weight:600;letter-spacing:0.3px;text-transform:uppercase">Job aktif</div>
        <div style="font-size:11.5px;color:#333;margin-top:2px;font-weight:600">${escapeHtml(u.job.customer_nama)}</div>
        <div style="font-size:10.5px;color:#666;margin-top:1px">→ ${escapeHtml(u.job.tujuan)}</div>
        <a href="/tracking/${escapeHtml(u.job.id)}"
          style="
            display:inline-block;margin-top:6px;
            padding:5px 10px;border-radius:6px;
            background:#1C9600;color:white;
            font-size:11px;font-weight:600;
            text-decoration:none;
          ">Pantau job →</a>
      </div>`
    : "";
  return `<div style="font-size:12px;line-height:1.4;min-width:180px;font-family:system-ui,sans-serif">
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
    ${jobBlock}
  </div>`;
}

function endpointPinIcon(color: string, letter: string): L.DivIcon {
  return L.divIcon({
    className: "fleet-route-pin",
    html: `<div style="width:22px;height:28px;display:flex;align-items:flex-start;justify-content:center;">
      <svg width="22" height="28" viewBox="0 0 32 40" fill="none">
        <path d="M16 0 C7 0 0 7 0 16 C0 26 16 40 16 40 C16 40 32 26 32 16 C32 7 25 0 16 0 Z"
          fill="${color}" stroke="white" stroke-width="2"/>
        <text x="16" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="white"
          font-family="system-ui, sans-serif">${letter}</text>
      </svg>
    </div>`,
    iconSize: [22, 28],
    iconAnchor: [11, 28]
  });
}

const ASAL_PIN = endpointPinIcon("#1C9600", "A");
const TUJUAN_PIN = endpointPinIcon("#D33B3B", "B");

const INDONESIA_CENTER: [number, number] = [-2.5, 118];
const INDONESIA_ZOOM = 5;

export function FleetMap({ units, focusUnitId, onUnitClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const fittedRef = useRef(false);
  // Layer untuk polyline + endpoint pin job aktif unit yang difokus.
  // Disimpan terpisah supaya gampang di-clear saat fokus berubah.
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  // Callback terbaru — disimpan di ref supaya effect marker sync tidak
  // perlu re-run cuma karena identitas function berubah.
  const onUnitClickRef = useRef(onUnitClick);
  useEffect(() => {
    onUnitClickRef.current = onUnitClick;
  }, [onUnitClick]);

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
      routeLayerRef.current = null;
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
        m.on("click", () => {
          onUnitClickRef.current?.(u.id);
        });
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

  // Focus unit → pan + open popup + render polyline rute job-nya
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear rute lama dulu — tiap fokus baru = layer route fresh
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (!focusUnitId) return;
    const m = markersRef.current.get(focusUnitId);
    if (!m) return;

    // Render polyline + endpoint pins kalau unit ini punya job dgn rute
    const focusedUnit = units.find((u) => u.id === focusUnitId);
    const route = focusedUnit?.job?.route;

    if (route) {
      // Fit bounds rute + posisi unit supaya seluruh trip terlihat
      const bounds = L.latLngBounds([
        m.getLatLng(),
        [route.asal.lat, route.asal.lng],
        [route.tujuan.lat, route.tujuan.lng]
      ]);
      map.flyToBounds(bounds, {
        padding: [60, 60],
        maxZoom: 14,
        duration: 0.7
      });
    } else {
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 13), {
        duration: 0.7
      });
    }
    m.openPopup();

    if (route) {
      const group = L.layerGroup();
      L.marker([route.asal.lat, route.asal.lng], {
        icon: ASAL_PIN,
        title: "Lokasi asal",
        interactive: false
      }).addTo(group);
      L.marker([route.tujuan.lat, route.tujuan.lng], {
        icon: TUJUAN_PIN,
        title: "Lokasi tujuan",
        interactive: false
      }).addTo(group);
      const points: Array<[number, number]> = route.polyline
        ? decodePolyline(route.polyline)
        : [
            [route.asal.lat, route.asal.lng],
            [route.tujuan.lat, route.tujuan.lng]
          ];
      L.polyline(points, {
        color: "#1C9600",
        weight: 4,
        opacity: 0.7,
        dashArray: route.polyline ? undefined : "8,8"
      }).addTo(group);
      group.addTo(map);
      routeLayerRef.current = group;
    }
  }, [focusUnitId, units]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#e8f1de" }}
    />
  );
}
