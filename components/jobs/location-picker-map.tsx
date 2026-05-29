"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2, Search, Locate } from "lucide-react";

/**
 * Inner map untuk LocationPicker modal. Di-isolasi supaya bisa lazy-load
 * via next/dynamic ssr:false (Leaflet butuh window).
 *
 * Reverse geocode pakai Nominatim (gratis, no key, rate-limit 1 req/sec).
 * Untuk pencarian alamat → search forward Nominatim juga.
 */

interface Props {
  initialLat: number | null;
  initialLng: number | null;
  initialAddress: string;
  onConfirm: (data: { lat: number; lng: number; address: string }) => void;
  onCancel: () => void;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_CENTER: [number, number] = [-2.5, 118];
const DEFAULT_ZOOM = 5;

const PIN_ICON = L.divIcon({
  className: "location-pin",
  html: `<div style="
    width:32px;height:40px;
    display:flex;align-items:flex-start;justify-content:center;
  ">
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none">
      <path d="M16 0 C7 0 0 7 0 16 C0 26 16 40 16 40 C16 40 32 26 32 16 C32 7 25 0 16 0 Z"
        fill="#1C9600" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="15" r="6" fill="white"/>
    </svg>
  </div>`,
  iconSize: [32, 40],
  iconAnchor: [16, 40]
});

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&accept-language=id`,
      { headers: { "User-Agent": "MAS-APP/1.0" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

async function searchAddress(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=5&accept-language=id`,
      { headers: { "User-Agent": "MAS-APP/1.0" } }
    );
    if (!res.ok) return [];
    return (await res.json()) as SearchResult[];
  } catch {
    return [];
  }
}

export function LocationPickerMap({
  initialLat,
  initialLng,
  initialAddress,
  onConfirm,
  onCancel
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    initialLat !== null && initialLng !== null
      ? { lat: initialLat, lng: initialLng }
      : null
  );
  const [address, setAddress] = useState(initialAddress);
  const [geocoding, setGeocoding] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  // Init map sekali
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const startCenter: [number, number] =
      pin !== null ? [pin.lat, pin.lng] : DEFAULT_CENTER;
    const startZoom = pin !== null ? 15 : DEFAULT_ZOOM;
    const map = L.map(containerRef.current, {
      center: startCenter,
      zoom: startZoom,
      zoomControl: true
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19
    }).addTo(map);
    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setPin({ lat, lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker + reverse-geocode saat pin berubah
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pin === null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([pin.lat, pin.lng], {
        icon: PIN_ICON
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    }
    setGeocoding(true);
    reverseGeocode(pin.lat, pin.lng)
      .then((addr) => {
        if (addr) setAddress(addr);
      })
      .finally(() => setGeocoding(false));
  }, [pin]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPin({ lat, lng });
        mapRef.current?.setView([lat, lng], 17);
      },
      () => {
        alert("Tidak bisa akses lokasi. Pastikan izin lokasi aktif.");
      }
    );
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQ.trim()) return;
    setSearching(true);
    const data = await searchAddress(searchQ.trim());
    setSearching(false);
    setResults(data);
  }

  function pickResult(r: SearchResult) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    setPin({ lat, lng });
    mapRef.current?.setView([lat, lng], 17);
    setResults([]);
    setSearchQ("");
  }

  function confirm() {
    if (pin === null) {
      alert("Pilih titik di peta dulu");
      return;
    }
    onConfirm({ lat: pin.lat, lng: pin.lng, address });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "white"
      }}
    >
      {/* Search bar */}
      <div
        style={{
          padding: 12,
          borderBottom: "0.5px solid var(--border-default)",
          background: "white",
          position: "relative",
          zIndex: 500
        }}
      >
        <form onSubmit={doSearch} style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Search
              style={{
                position: "absolute",
                left: 10,
                width: 14,
                height: 14,
                color: "var(--text-tertiary)"
              }}
            />
            <input
              type="text"
              placeholder="Cari alamat / tempat (mis. Pelabuhan Tanjung Priok)"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                border: "0.5px solid var(--border-default)",
                borderRadius: 8,
                fontSize: 13
              }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={searching || !searchQ.trim()}
          >
            {searching ? "..." : "Cari"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={useMyLocation}
            title="Pakai lokasi saya"
          >
            <Locate style={{ width: 14, height: 14 }} />
          </button>
        </form>
        {results.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% - 1px)",
              left: 12,
              right: 12,
              background: "white",
              border: "0.5px solid var(--border-default)",
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              maxHeight: 240,
              overflowY: "auto",
              zIndex: 501
            }}
          >
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pickResult(r)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "white",
                  borderBottom:
                    i < results.length - 1
                      ? "0.5px solid var(--border-default)"
                      : "none",
                  fontSize: 12,
                  cursor: "pointer",
                  lineHeight: 1.4
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-muted)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "white")
                }
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        style={{ flex: 1, background: "#e8f1de", minHeight: 280 }}
      />

      {/* Address preview + actions */}
      <div
        style={{
          padding: 12,
          borderTop: "0.5px solid var(--border-default)",
          background: "white",
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}
      >
        {pin !== null ? (
          <div
            style={{
              fontSize: 12,
              padding: "8px 10px",
              background: "var(--brand-primary-light)",
              borderRadius: 8,
              lineHeight: 1.5
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "flex-start"
              }}
            >
              <MapPin
                style={{
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  marginTop: 1,
                  color: "var(--brand-primary-dark)"
                }}
              />
              <div style={{ flex: 1 }}>
                {geocoding ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--text-secondary)"
                    }}
                  >
                    <Loader2
                      style={{
                        width: 12,
                        height: 12,
                        animation: "spin 0.8s linear infinite"
                      }}
                    />
                    Mengambil alamat…
                  </span>
                ) : (
                  address || "(Alamat tidak ditemukan — kamu bisa edit manual)"
                )}
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10.5,
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono, monospace)"
                  }}
                >
                  {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              padding: "8px 10px",
              background: "var(--bg-muted)",
              borderRadius: 8,
              textAlign: "center"
            }}
          >
            Klik di peta untuk pin lokasi, atau cari alamat di atas.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirm}
            disabled={pin === null}
          >
            Pakai lokasi ini
          </button>
        </div>
      </div>
    </div>
  );
}
