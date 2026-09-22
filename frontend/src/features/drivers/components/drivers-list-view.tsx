import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import type { Driver } from "@/types";

interface Props {
  drivers: Driver[];
}

function initials(nama: string) {
  return nama
    .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

export function DriversListView({ drivers }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">(
    "active"
  );

  const counts = useMemo(
    () => ({
      all: drivers.length,
      active: drivers.filter((d) => d.is_active).length,
      inactive: drivers.filter((d) => !d.is_active).length
    }),
    [drivers]
  );

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (filter === "active" && !d.is_active) return false;
      if (filter === "inactive" && d.is_active) return false;
      if (q) {
        const t = q.toLowerCase();
        if (!d.nama.toLowerCase().includes(t) && !d.no_hp.includes(t))
          return false;
      }
      return true;
    });
  }, [drivers, q, filter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 260 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau nomor HP…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <Link to="/drivers/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Tambah driver
          </Button>
        </Link>
      </div>

      <FilterChips
        value={filter}
        onChange={(k) => setFilter(k as typeof filter)}
        items={[
          { key: "active", label: "Aktif", count: counts.active },
          { key: "inactive", label: "Nonaktif", count: counts.inactive },
          { key: "all", label: "Semua", count: counts.all }
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Belum ada driver"
          description="Tambahkan driver pertama untuk mulai assign ke job."
          action={
            <Link to="/drivers/new">
              <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                Tambah driver
              </Button>
            </Link>
          }
        />
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {filtered.map((d) => (
            <Link
              key={d.id}
              to={`/drivers/${d.id}/edit`}
              className="card card-pad"
              style={{
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 120ms ease"
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "rgba(0,0,0,0.25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-default)")
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 99,
                    background: d.is_active
                      ? "var(--brand-primary)"
                      : "var(--bg-subtle)",
                    color: d.is_active ? "white" : "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 14,
                    flexShrink: 0
                  }}
                >
                  {initials(d.nama)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {d.nama}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)"
                    }}
                  >
                    {d.no_hp}
                  </div>
                </div>
                {d.is_active ? (
                  <span className="badge badge-standby">
                    <span className="badge-dot" />
                    Aktif
                  </span>
                ) : (
                  <span className="badge">Nonaktif</span>
                )}
              </div>
              <div className="divider" style={{ marginBottom: 10 }} />
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  flexWrap: "wrap"
                }}
              >
                {d.alamat && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <MapPin style={{ width: 12, height: 12 }} />
                    {d.alamat}
                  </div>
                )}
                {d.no_sim && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    SIM {d.no_sim}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Fab href="/drivers/new" label="Tambah driver" />
    </div>
  );
}
