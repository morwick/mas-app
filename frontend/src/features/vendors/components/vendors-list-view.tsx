import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import type { Vendor } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";
import { IkonPerusahaan } from "@/components/ui/avatar-inisial";

interface Props {
  vendors: Vendor[];
}



export function VendorsListView({ vendors }: Props) {
  const barisDetail = useBarisDetail();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">(
    "active"
  );

  const counts = useMemo(
    () => ({
      all: vendors.length,
      active: vendors.filter((c) => c.is_active).length,
      inactive: vendors.filter((c) => !c.is_active).length
    }),
    [vendors]
  );

  const filtered = useMemo(() => {
    return vendors.filter((c) => {
      if (filter === "active" && !c.is_active) return false;
      if (filter === "inactive" && c.is_active) return false;
      if (q && !c.nama_perusahaan.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [vendors, q, filter]);

  const pg = usePagination(filtered, { resetKey: `${q}|${filter}` });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Vendor"
        description="Daftar perusahaan pelanggan beserta PIC dan jumlah job-nya."
      />
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama perusahaan…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <Link to="/vendors/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Tambah vendor
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
          title="Belum ada vendor"
          description="Tambahkan vendor pertama Anda."
          action={
            <Link to="/vendors/new">
              <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                Tambah vendor
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block">
            <div className="table-scroll">
              <table className="table">
              <thead>
                <tr>
                  <KepalaKolomLihat />
                  <th>Nama perusahaan</th>
                  <th>Alamat</th>
                  <th style={{ width: 100 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((c) => (
                  <tr key={c.id} {...barisDetail(`/vendors/${c.id}/edit`)}>
                    <td style={{ width: 44 }}>
                      <TombolLihat tujuan={`/vendors/${c.id}/edit`} />
                    </td>
                    <td>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          textDecoration: "none",
                          color: "inherit"
                        }}
                      >
                        <IkonPerusahaan nama={c.nama_perusahaan} />
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
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {c.alamat ?? (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {c.is_active ? (
                        <span className="badge badge-bertugas">Aktif</span>
                      ) : (
                        <span className="badge">Nonaktif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Mobile: card list */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((c) => (
              <Link
                key={c.id}
                to={`/vendors/${c.id}/edit`}
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
                    <IkonPerusahaan nama={c.nama_perusahaan} ukuran={36} />
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
                  <span />
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

          <Pagination state={pg} label="vendor" />
        </>
      )}

      <Fab href="/vendors/new" label="Tambah vendor" />
    </div>
  );
}
