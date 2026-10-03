import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { PageError } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { ALL_PAGE_SIZE, DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { formatDateTime, formatRupiah } from "@/lib/utils";
import { STATUS_PENGAJUAN_LABEL, type FiturApproval, type PengajuanApproval, type StatusPengajuan } from "../api";
import { usePengajuanList } from "../queries";

import { StatusBadge } from "./pengajuan-detail-view";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type Tab = "giliran" | "semua";

interface Props {
  fitur: FiturApproval;
  namaFitur: string;
  /** Jumlah yang menunggu keputusan pengguna ini (dari menu). */
  menungguSaya: number;
  /** Paksa buka tab "Menunggu saya" (mis. kembali dari halaman detail). */
  tabMenunggu?: boolean;
}

/**
 * Daftar pengajuan satu fitur untuk approver. Tab "Menunggu saya" berisi
 * pengajuan yang sedang menunggu keputusan pengguna ini; tab "Semua" untuk
 * riwayat. Daftar dibuat ringkas; klik satu pengajuan untuk membuka detailnya
 * (rincian, alur approval) beserta tombol Tolak / Setujui. Siapa yang boleh
 * melihat & memutuskan dijaga database.
 */
export function PengajuanView({ fitur, namaFitur, menungguSaya, tabMenunggu }: Props) {
  const [tab, setTab] = useState<Tab>(tabMenunggu || menungguSaya > 0 ? "giliran" : "semua");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusPengajuan | "">("");
  const [tahun, setTahun] = useState("");
  const [bulan, setBulan] = useState("");
  const qTunda = useDeferredValue(q);
  const navigate = useNavigate();

  const list = usePengajuanList({
    fitur,
    page,
    pageSize,
    hanyaGiliran: tab === "giliran",
    status: tab === "giliran" ? "" : status,
    q: qTunda,
    tahun,
    bulan: tahun ? bulan : ""
  });

  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const total = list.data?.total ?? 0;
  const items = list.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<PengajuanApproval> = {
    page,
    pageCount: Math.max(1, Math.ceil(total / size)),
    total,
    pageSize,
    items,
    from: total === 0 ? 0 : (page - 1) * size + 1,
    to: Math.min(page * size, total),
    setPage,
    setPageSize: ubah(setPageSize)
  };

  const tahunIni = new Date().getFullYear();
  const pilihanTahun = [tahunIni, tahunIni - 1, tahunIni - 2];

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <PageHeader title={`Approval — ${namaFitur}`} description="Klik pengajuan untuk melihat detail dan memutuskan. Satu penolakan membuat pengajuan langsung ditolak." />

      <Tabs
        value={tab}
        onChange={(k) => ubah(setTab)(k as Tab)}
        items={[
          { key: "giliran", label: "Menunggu saya", count: menungguSaya },
          { key: "semua", label: "Semua" }
        ]}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari judul atau nama pengaju…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        {tab === "semua" && (
          <div style={{ flex: "0 1 160px" }}>
            <Select value={status} onChange={(e) => ubah(setStatus)(e.target.value as StatusPengajuan | "")} aria-label="Filter status">
              <option value="">Semua status</option>
              {(Object.keys(STATUS_PENGAJUAN_LABEL) as StatusPengajuan[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_PENGAJUAN_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div style={{ flex: "0 1 130px" }}>
          <Select value={tahun} onChange={(e) => ubah(setTahun)(e.target.value)} aria-label="Filter tahun">
            <option value="">Semua tahun</option>
            {pilihanTahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ flex: "0 1 130px" }}>
          <Select value={bulan} onChange={(e) => ubah(setBulan)(e.target.value)} disabled={!tahun} aria-label="Filter bulan">
            <option value="">Semua bulan</option>
            {NAMA_BULAN.map((b, i) => (
              <option key={b} value={i + 1}>
                {b}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {list.isError ? (
        <PageError error={list.error} onRetry={list.refetch} />
      ) : list.isPending ? (
        <div className="card card-pad caption">Memuat pengajuan…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={tab === "giliran" ? "Tidak ada yang menunggu keputusan Anda" : "Belum ada pengajuan"}
          description={tab === "giliran" ? "Semua pengajuan sudah Anda putuskan." : "Coba ubah filter atau kata kunci."}
        />
      ) : (
        <div className="flex flex-col" style={{ gap: 10, opacity: list.isPlaceholderData ? 0.6 : 1 }}>
          <DaftarPengajuan items={items} onBuka={(p) => navigate(`/approval/${fitur}/${p.id}`)} />
          <Pagination state={pg} label="pengajuan" />
        </div>
      )}

    </div>
  );
}

/** Daftar ringkas: klik satu pengajuan untuk membuka halaman detailnya. */
function DaftarPengajuan({ items, onBuka }: { items: PengajuanApproval[]; onBuka: (p: PengajuanApproval) => void }) {
  const barisDetail = useBarisDetail();
  return (
    <>
      {/* Desktop */}
      <div className="card hidden lg:block">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <KepalaKolomLihat />
                <th>Pengajuan</th>
                <th style={{ width: 160 }}>Diajukan oleh</th>
                <th style={{ width: 160 }}>Tanggal</th>
                <th style={{ width: 140, textAlign: "right" }}>Nilai</th>
                <th style={{ width: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} {...barisDetail(() => onBuka(p))}>
                  <td style={{ width: 44 }}>
                    <TombolLihat tujuan={() => onBuka(p)} />
                  </td>
                  <td style={{ fontWeight: 600, fontSize: 13.5 }}>{p.judul}</td>
                  <td style={{ fontSize: 13 }}>{p.diajukan_oleh_nama ?? "—"}</td>
                  <td className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {formatDateTime(p.diajukan_at)}
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {p.nilai != null ? formatRupiah(p.nilai) : "—"}
                  </td>
                  <td>
                    <StatusBadge status={p.status_approval} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            className="list-card"
            onClick={() => onBuka(p)}
            style={{ textAlign: "left", width: "100%", font: "inherit", cursor: "pointer" }}
          >
            <div className="list-card-row">
              <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0 }}>{p.judul}</div>
              {p.nilai != null && (
                <strong className="mono" style={{ whiteSpace: "nowrap" }}>
                  {formatRupiah(p.nilai)}
                </strong>
              )}
            </div>
            <div className="caption">
              {p.diajukan_oleh_nama ?? "—"} · {formatDateTime(p.diajukan_at)}
            </div>
            <div>
              <StatusBadge status={p.status_approval} />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
