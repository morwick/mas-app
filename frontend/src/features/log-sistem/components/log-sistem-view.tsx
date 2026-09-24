import { useDeferredValue, useState } from "react";
import { ScrollText, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FilterChips } from "@/components/ui/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/ui/page-state";
import {
  ALL_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  Pagination,
  type PaginationState
} from "@/components/ui/pagination";
import { formatWaktuWIB } from "@/lib/utils";
import { useUsers } from "@/features/settings/queries";
import { AKSI_LOG, type AksiLog, type LogSistem } from "../api";
import { useLogSistem } from "../queries";

/** Warna badge per aksi — hapus merah supaya mudah dicari saat ada komplain. */
const WARNA_AKSI: Record<AksiLog, { bg: string; fg: string }> = {
  Login: { bg: "var(--bg-muted)", fg: "var(--text-secondary)" },
  Logout: { bg: "var(--bg-muted)", fg: "var(--text-secondary)" },
  "Tambah Data": { bg: "var(--status-standby-bg)", fg: "var(--status-standby-text)" },
  "Update Data": { bg: "var(--status-perjalanan-bg)", fg: "var(--status-perjalanan-text)" },
  "Hapus Data": { bg: "var(--status-cancelled-bg)", fg: "var(--status-cancelled-text)" }
};

function AksiBadge({ aksi }: { aksi: AksiLog }) {
  const w = WARNA_AKSI[aksi];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 4,
        background: w.bg,
        color: w.fg,
        whiteSpace: "nowrap"
      }}
    >
      {aksi}
    </span>
  );
}

/** Driver & sistem tidak punya karyawan — pelakunya tertulis di keterangan. */
function namaPelaku(log: LogSistem) {
  return log.karyawan_nama ?? "—";
}

export function LogSistemView() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [karyawanId, setKaryawanId] = useState("");
  const [aksi, setAksi] = useState<AksiLog | "">("");
  const [q, setQ] = useState("");
  // Pencarian menunggu jeda ketik, tidak memanggil server tiap huruf.
  const qTunda = useDeferredValue(q);

  const users = useUsers();
  const karyawanOptions = (users.data ?? [])
    .filter((u) => u.karyawan_id)
    .map((u) => ({ value: u.karyawan_id as string, label: u.nama, hint: u.email }));

  const log = useLogSistem({ page, pageSize, dari, sampai, karyawanId, aksi, q: qTunda });

  // Setiap filter berubah, kembali ke halaman 1.
  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const adaFilter = Boolean(dari || sampai || karyawanId || aksi || q);
  function resetFilter() {
    setDari("");
    setSampai("");
    setKaryawanId("");
    setAksi("");
    setQ("");
    setPage(1);
  }

  const data = log.data;
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<LogSistem> = {
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

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h1 className="h1" style={{ marginBottom: 4 }}>
          Log Sistem
        </h1>
        <p className="caption">
          Jejak semua aksi pengguna: login, logout, tambah, ubah, dan hapus data — lengkap dengan
          waktu dan IP address.
        </p>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari keterangan atau IP…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <Combobox
            value={karyawanId}
            onChange={ubah(setKaryawanId)}
            options={karyawanOptions}
            placeholder="Semua karyawan"
            searchPlaceholder="Cari nama karyawan…"
            clearable
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Input
            type="date"
            value={dari}
            max={sampai || undefined}
            onChange={(e) => ubah(setDari)(e.target.value)}
            aria-label="Dari tanggal"
          />
          <span className="caption">s/d</span>
          <Input
            type="date"
            value={sampai}
            min={dari || undefined}
            onChange={(e) => ubah(setSampai)(e.target.value)}
            aria-label="Sampai tanggal"
          />
        </div>
        {adaFilter && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilter}>
            <X style={{ width: 14, height: 14 }} />
            Reset filter
          </button>
        )}
      </div>

      <FilterChips
        value={aksi || "semua"}
        onChange={(k) => ubah(setAksi)(k === "semua" ? "" : (k as AksiLog))}
        items={[{ key: "semua", label: "Semua aksi" }, ...AKSI_LOG.map((a) => ({ key: a, label: a }))]}
      />

      {log.isError ? (
        <PageError error={log.error} onRetry={log.refetch} />
      ) : log.isPending ? (
        <div className="card card-pad caption">Memuat log…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={adaFilter ? "Tidak ada log yang cocok" : "Belum ada log"}
          description={
            adaFilter
              ? "Coba ubah filter atau kata kunci pencarian."
              : "Aksi pengguna akan tercatat di sini."
          }
        />
      ) : (
        <div style={{ opacity: log.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Waktu (WIB)</th>
                  <th style={{ width: 170 }}>Karyawan</th>
                  <th style={{ width: 120 }}>Aksi</th>
                  <th>Keterangan</th>
                  <th style={{ width: 140 }}>IP address</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {formatWaktuWIB(l.waktu)}
                    </td>
                    <td>{namaPelaku(l)}</td>
                    <td>
                      <AksiBadge aksi={l.aksi} />
                    </td>
                    <td style={{ wordBreak: "break-word" }}>{l.keterangan}</td>
                    <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>
                      {l.ip_address ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination state={pg} label="log" attached />
          </div>

          {/* Mobile: kartu */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((l) => (
              <div key={l.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <AksiBadge aksi={l.aksi} />
                  <span className="caption" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatWaktuWIB(l.waktu)} WIB
                  </span>
                </div>
                <div style={{ fontSize: 13.5, wordBreak: "break-word" }}>{l.keterangan}</div>
                <div className="caption">
                  {namaPelaku(l)} · IP {l.ip_address ?? "—"}
                </div>
              </div>
            ))}
            <Pagination state={pg} label="log" />
          </div>
        </div>
      )}
    </div>
  );
}
