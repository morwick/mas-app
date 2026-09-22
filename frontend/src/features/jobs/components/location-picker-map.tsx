import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2, Search, Locate } from "lucide-react";
import { haversineKm } from "@/lib/routing/eta";

/**
 * Inner map untuk LocationPicker modal. Di-isolasi supaya bisa lazy-load
 * via React.lazy (Leaflet butuh window, jadi jangan ikut bundle awal).
 *
 * Reverse geocode pakai Nominatim (gratis, no key, rate-limit 1 req/sec).
 * Untuk pencarian alamat → search forward Nominatim juga.
 */

export interface AvailableUnitPin {
  id: string;
  kode_unit: string;
  jenis_unit_nama: string;
  lat: number;
  lng: number;
}

interface Props {
  initialLat: number | null;
  initialLng: number | null;
  initialAddress: string;
  availableUnits?: AvailableUnitPin[];
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeUnitIcon(kode: string): L.DivIcon {
  const label = escapeHtml(kode);
  return L.divIcon({
    className: "unit-pin",
    html: `<div style="
      display:flex;flex-direction:column;align-items:center;gap:2px;
      font-family:system-ui,-apple-system,sans-serif;
    ">
      <div style="
        font-size:10.5px;font-weight:700;color:white;
        background:#3B5773;
        padding:2px 7px;border-radius:10px;
        border:1.5px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.25);
        line-height:1;letter-spacing:0.3px;
        white-space:nowrap;
      ">${label}</div>
      <div style="
        width:28px;height:28px;border-radius:14px;
        background:#3B5773;
        border:2.5px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        color:white;
      ">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>
    </div>`,
    iconSize: [80, 48],
    // Anchor di tengah-circle truk: label (~16px) + gap 2px + radius 14px = y 32
    iconAnchor: [40, 34]
  });
}

function unitPopupHtml(
  u: AvailableUnitPin,
  pin: { lat: number; lng: number } | null
): string {
  const kode = escapeHtml(u.kode_unit);
  const jenis = escapeHtml(u.jenis_unit_nama);
  const dist =
    pin !== null
      ? `<div style="margin-top:4px;font-size:11px;color:#0a5500;font-weight:600">
           ${haversineKm(pin.lat, pin.lng, u.lat, u.lng).toFixed(1)} km dari pin
         </div>`
      : `<div style="margin-top:4px;font-size:11px;color:#888">Pin lokasi dulu untuk lihat jarak</div>`;
  return `<div style="font-size:12px;line-height:1.4;min-width:140px">
    <div style="font-weight:700;color:#0a5500">${kode}</div>
    <div style="color:#555">${jenis}</div>
    ${dist}
  </div>`;
}

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
  availableUnits,
  onConfirm,
  onCancel
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const unitMarkersRef = useRef<Map<string, L.Marker>>(new Map());
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

  // Sync marker unit standby ke peta. Re-render saat list berubah.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const current = unitMarkersRef.current;
    const nextIds = new Set((availableUnits ?? []).map((u) => u.id));

    // Buang marker untuk unit yang tidak ada di list baru
    for (const [id, marker] of current) {
      if (!nextIds.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }

    // Tambah / update marker
    for (const u of availableUnits ?? []) {
      const existing = current.get(u.id);
      if (existing) {
        existing.setLatLng([u.lat, u.lng]);
        existing.setPopupContent(unitPopupHtml(u, pin));
      } else {
        const m = L.marker([u.lat, u.lng], {
          icon: makeUnitIcon(u.kode_unit),
          title: `${u.kode_unit} — ${u.jenis_unit_nama}`,
          zIndexOffset: -100 // di bawah pin lokasi utama
        }).addTo(map);
        m.bindPopup(unitPopupHtml(u, pin));
        current.set(u.id, m);
      }
    }
    // pin tidak masuk deps di sini — popup di-update di effect berikutnya
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableUnits]);

  // Update isi popup tiap marker saat pin user berpindah → jarak ikut update
  useEffect(() => {
    if (!availableUnits) return;
    const current = unitMarkersRef.current;
    for (const u of availableUnits) {
      const m = current.get(u.id);
      if (m) m.setPopupContent(unitPopupHtml(u, pin));
    }
  }, [pin, availableUnits]);

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
        {availableUnits && availableUnits.length > 0 && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "2px 2px"
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: "#3B5773",
                border: "1.5px solid white",
                boxShadow: "0 0 0 0.5px #3B5773",
                flexShrink: 0
              }}
            />
            {availableUnits.length} unit standby ber-GPS tampil di peta — klik
            untuk lihat jarak ke pin.
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
