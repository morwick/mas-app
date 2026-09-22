import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import type { Customer } from "@/types";

interface Props {
  customers: Customer[];
  jobCounts: Record<string, number>;
}

function abbr(nama: string) {
  return nama
    .replace(/^(PT|CV)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

export function CustomersListView({ customers, jobCounts }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">(
    "active"
  );

  const counts = useMemo(
    () => ({
      all: customers.length,
      active: customers.filter((c) => c.is_active).length,
      inactive: customers.filter((c) => !c.is_active).length
    }),
    [customers]
  );

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (filter === "active" && !c.is_active) return false;
      if (filter === "inactive" && c.is_active) return false;
      if (q && !c.nama_perusahaan.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [customers, q, filter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 260 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama perusahaan…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <Link to="/customers/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Tambah customer
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
          icon={Building2}
          title="Belum ada customer"
          description="Tambahkan customer pertama Anda."
          action={
            <Link to="/customers/new">
              <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                Tambah customer
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
                <th>Nama perusahaan</th>
                <th>Alamat</th>
                <th style={{ width: 110 }}>Total job</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="row-link">
                  <td>
                    <Link
                      to={`/customers/${c.id}/edit`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        textDecoration: "none",
                        color: "inherit"
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          background: "var(--brand-primary-light)",
                          color: "var(--brand-primary-dark)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: 11,
                          flexShrink: 0
                        }}
                      >
                        {abbr(c.nama_perusahaan)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {c.nama_perusahaan}
                        </div>
                        {c.catatan && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {c.catatan}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {c.alamat ?? (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>
                      {jobCounts[c.id] ?? 0}
                    </span>
                  </td>
                  <td>
                    {c.is_active ? (
                      <span className="badge badge-bertugas">Aktif</span>
                    ) : (
                      <span className="badge">Nonaktif</span>
                    )}
                  </td>
                  <td>
                    <Link
                      to={`/customers/${c.id}/edit`}
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
            {filtered.map((c) => (
              <Link
                key={c.id}
                to={`/customers/${c.id}/edit`}
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
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        background: "var(--brand-primary-light)",
                        color: "var(--brand-primary-dark)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0
                      }}
                    >
                      {abbr(c.nama_perusahaan)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {c.nama_perusahaan}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {c.alamat ?? "—"}
                      </div>
                    </div>
                  </div>
                  {c.is_active ? (
                    <span className="badge badge-bertugas">Aktif</span>
                  ) : (
                    <span className="badge">Nonaktif</span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    paddingTop: 4
                  }}
                >
                  <span>
                    <span style={{ color: "var(--text-tertiary)" }}>
                      Total job:{" "}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {jobCounts[c.id] ?? 0}
                    </span>
                  </span>
                  <ChevronRight
                    style={{
                      width: 16,
                      height: 16,
                      color: "var(--text-tertiary)"
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Fab href="/customers/new" label="Tambah customer" />
    </div>
  );
}
