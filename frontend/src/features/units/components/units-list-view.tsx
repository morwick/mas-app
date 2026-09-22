import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  MapPin,
  Plus,
  Search,
  Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/layout/fab";
import type { JenisUnit, Unit } from "@/types";
import { fleetLocations } from "@/features/tracking/api";

interface Props {
  units: Unit[];
  jenisUnitList: JenisUnit[];
}

interface LocationEntry {
  lat: number;
  lng: number;
  address: string | null;
  fetched_at: string;
}

const LOCATION_POLL_MS = 30_000;

export function UnitsListView({ units, jenisUnitList }: Props) {
  const [q, setQ] = useState("");
  const [jenis, setJenis] = useState("");
  const [status, setStatus] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Alamat real-time per unit. State diisi via polling /api/units/locations.
  // Map kosong saat first paint → kolom alamat tampilkan "Memuat…" untuk unit
  // yang punya IMEI, dan "—" untuk unit yang belum di-set IMEI-nya.
  const [locations, setLocations] = useState<Record<string, LocationEntry | null>>({});
  const [locationsLoaded, setLocationsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchLocations() {
      try {
        const body = await fleetLocations();
        if (!cancelled) {
          setLocations(body.locations);
          setLocationsLoaded(true);
        }
      } catch {
        // Network error → biarkan state lama. Akan retry di interval berikutnya.
        if (!cancelled) setLocationsLoaded(true);
      }
    }
    fetchLocations();
    const id = setInterval(fetchLocations, LOCATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (!showInactive && !u.is_active) return false;
      if (jenis && u.jenis_unit_id !== jenis) return false;
      if (status && u.status !== status) return false;
      if (q) {
        const term = q.toLowerCase();
        if (
          !u.kode_unit.toLowerCase().includes(term) &&
          !u.no_polisi.toLowerCase().includes(term)
        )
          return false;
      }
      return true;
    });
  }, [units, q, jenis, status, showInactive]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="toolbar">
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kode unit atau nomor polisi…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <Select
          value={jenis}
          onChange={(e) => setJenis(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">Semua jenis</option>
          {jenisUnitList.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nama}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">Semua status</option>
          <option value="standby">Standby</option>
          <option value="bertugas">Bertugas</option>
          <option value="perbaikan">Perbaikan</option>
        </Select>
        <Link to="/units/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Tambah unit
          </Button>
        </Link>
      </div>

      <label
        className="flex items-center gap-2"
        style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}
      >
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: "var(--brand-primary)" }}
        />
        Tampilkan unit nonaktif
      </label>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Tidak ada unit"
          description="Coba ubah filter atau tambah unit baru."
          action={
            <Link to="/units/new">
              <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                Tambah unit
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Kode</th>
                  <th>Jenis</th>
                  <th>No. Polisi</th>
                  <th style={{ minWidth: 220 }}>Alamat terkini</th>
                  <th style={{ width: 140 }}>Status</th>
                  <th>Driver default</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="row-link">
                    <td>
                      <Link
                        to={`/units/${u.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          textDecoration: "none",
                          color: "inherit"
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: "var(--bg-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-secondary)"
                          }}
                        >
                          <Truck style={{ width: 14, height: 14 }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{u.kode_unit}</span>
                        {!u.is_active && (
                          <span
                            className="badge"
                            style={{ fontSize: 10, height: 18 }}
                          >
                            Nonaktif
                          </span>
                        )}
                      </Link>
                    </td>
                    <td>{u.jenis_unit_nama}</td>
                    <td className="mono" style={{ fontSize: 13 }}>
                      {u.no_polisi}
                    </td>
                    <td>
                      <LocationCell
                        hasImei={!!u.imei_gps}
                        entry={locations[u.id]}
                        loaded={locationsLoaded}
                      />
                    </td>
                    <td>
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {u.default_driver_nama ?? (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/units/${u.id}`}
                        style={{
                          color: "var(--text-tertiary)",
                          display: "inline-flex"
                        }}
                      >
                        <ChevronRight style={{ width: 16, height: 16 }} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card list */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {filtered.map((u) => (
              <Link
                key={u.id}
                to={`/units/${u.id}`}
                className="list-card"
              >
                <div className="list-card-row">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      flex: 1
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: "var(--bg-subtle)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                        flexShrink: 0
                      }}
                    >
                      <Truck style={{ width: 16, height: 16 }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {u.kode_unit}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)"
                        }}
                      >
                        {u.no_polisi}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={u.status} />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 12px",
                    fontSize: 12,
                    color: "var(--text-secondary)"
                  }}
                >
                  <span>{u.jenis_unit_nama}</span>
                  {u.default_driver_nama && (
                    <span>
                      <span style={{ color: "var(--text-tertiary)" }}>
                        Driver:
                      </span>{" "}
                      {u.default_driver_nama}
                    </span>
                  )}
                  {!u.is_active && (
                    <span
                      className="badge"
                      style={{ fontSize: 10, height: 18 }}
                    >
                      Nonaktif
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                  className="break-anywhere"
                >
                  <LocationCell
                    hasImei={!!u.imei_gps}
                    entry={locations[u.id]}
                    loaded={locationsLoaded}
                  />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Fab href="/units/new" label="Tambah unit" />
    </div>
  );
}

function LocationCell({
  hasImei,
  entry,
  loaded
}: {
  hasImei: boolean;
  entry: LocationEntry | null | undefined;
  loaded: boolean;
}) {
  if (!hasImei) {
    return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  }
  // Belum pernah dapat response dari API → "Memuat" hanya untuk unit ber-IMEI.
  if (!loaded && entry === undefined) {
    return (
      <span
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          fontStyle: "italic"
        }}
      >
        Memuat…
      </span>
    );
  }
  // Sudah loaded tapi entry null = TrackSolid error / device offline.
  if (!entry?.address) {
    return (
      <span
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)"
        }}
      >
        Lokasi tidak tersedia
      </span>
    );
  }
  return (
    <span
      title={entry.address}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        color: "var(--text-secondary)",
        lineHeight: 1.4,
        maxWidth: 320,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}
    >
      <MapPin
        style={{
          width: 12,
          height: 12,
          color: "var(--brand-primary)",
          flexShrink: 0
        }}
      />
      {entry.address}
    </span>
  );
}
