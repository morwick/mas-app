import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
import { Phone, Plus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageError } from "@/components/ui/page-state";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { useAuth } from "@/lib/auth/AuthContext";
import { serverPageState, tautanWhatsApp } from "@/lib/server-page";
import { useAsuransiCounts, useAsuransiPage } from "../queries";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";
import { IkonPerusahaan } from "@/components/ui/avatar-inisial";

/** Master Asuransi — daftar perusahaan asuransi beserta PIC utamanya. */
export function AsuransiListView() {
  const barisDetail = useBarisDetail();
  const { canManageOperational } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState<"aktif" | "nonaktif" | "">("aktif");
  const qTunda = useDeferredValue(q);
  const data = useAsuransiPage({ page, pageSize, q: qTunda, aktif });
  const counts = useAsuransiCounts(qTunda);

  const pg = serverPageState(data.data, page, pageSize, setPage, (s) => {
    setPageSize(s);
    setPage(1);
  });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <PageHeader
          title="Asuransi"
          description="Perusahaan asuransi beserta PIC yang bisa dihubungi. Unit & unit trailer di-link ke asuransi lewat polis."
          style={{ flex: 1, minWidth: 240 }}
        />
        {canManageOperational && (
          <Link to="/asuransi/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah asuransi</Button>
          </Link>
        )}
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama asuransi, PIC, atau no HP…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <FilterChips
          value={aktif || "semua"}
          onChange={(k) => {
            setAktif(k === "semua" ? "" : (k as "aktif" | "nonaktif"));
            setPage(1);
          }}
          items={[
            { key: "aktif", label: "Aktif", count: counts.data?.active },
            { key: "nonaktif", label: "Nonaktif", count: counts.data?.inactive },
            { key: "semua", label: "Semua", count: counts.data?.all }
          ]}
        />
      </div>

      {data.isError ? (
        <PageError error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="card card-pad caption">Memuat asuransi…</div>
      ) : pg.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={q ? "Tidak ada asuransi yang cocok" : "Belum ada asuransi"}
          description={q ? "Coba kata kunci lain." : "Tambahkan perusahaan asuransi yang dipakai armada."}
        />
      ) : (
        <div className="card" style={{ overflow: "hidden", opacity: data.isPlaceholderData ? 0.6 : 1 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <KepalaKolomLihat />
                  <th>Nama asuransi</th>
                  <th>PIC utama</th>
                  <th style={{ width: 150 }}>Telepon kantor</th>
                  <th style={{ width: 150 }}>Aset terlindungi</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((a) => {
                  const pic = a.pic_utama;
                  const wa = pic ? tautanWhatsApp(pic.no_hp) : null;
                  return (
                    <tr key={a.id} {...barisDetail(`/asuransi/${a.id}`)}>
                      <td style={{ width: 44 }}>
                        <TombolLihat tujuan={`/asuransi/${a.id}`} />
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <IkonPerusahaan nama={a.nama} redup={!a.is_active} />
                          <div style={{ minWidth: 0 }}>
                            {a.nama}
                            {!a.is_active && (
                              <span className="badge" style={{ fontSize: 10, height: 18, marginLeft: 8 }}>
                                Nonaktif
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {pic ? (
                          <>
                            <div>
                              {pic.sapaan ? `${pic.sapaan} ` : ""}
                              {pic.nama}
                              {pic.jabatan && <span className="caption"> · {pic.jabatan}</span>}
                            </div>
                            <a
                              href={wa ?? `tel:${pic.no_hp}`}
                              target="_blank"
                              rel="noreferrer"
                              className="caption mono inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone style={{ width: 11, height: 11 }} />
                              {pic.no_hp}
                            </a>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="mono">{a.telepon ?? "—"}</td>
                      <td>{a.jumlah_aset_aktif > 0 ? `${a.jumlah_aset_aktif} aset` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination state={pg} label="asuransi" attached />
        </div>
      )}
    </div>
  );
}
