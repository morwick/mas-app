import { useDeferredValue, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, ClipboardList, Search, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { PageError } from "@/components/ui/page-state";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { serverPageState } from "@/lib/server-page";
import { formatDate, formatRupiah } from "@/lib/utils";
import {
  JENIS_WO,
  PELAKSANA,
  STATUS_KLAIM,
  STATUS_WO,
  labelDari,
  usePerintahKerjaPage,
  type JenisWo,
  type Pelaksana,
  type PerintahKerjaFilter,
  type PerintahKerjaRingkas,
  type StatusWo
} from "../api";

export function StatusWoBadge({ status }: { status: StatusWo }) {
  const s = STATUS_WO[status];
  return (
    <span className={`badge ${s.kelas}`}>
      <span className="badge-dot" />
      {s.label}
    </span>
  );
}

type Dasar = Pick<PerintahKerjaFilter, "unit_id" | "unit_trailer_id" | "incident_id" | "asuransi_id">;

/**
 * Daftar perintah kerja dengan pagination server. `dasar` = saringan tetap
 * (mis. satu unit); `denganFilter` = tampilkan pencarian & filter.
 */
export function DaftarPerintahKerja({
  dasar = {},
  denganFilter = false,
  tampilAset = true,
  kosong = "Belum ada perintah kerja."
}: {
  dasar?: Dasar;
  denganFilter?: boolean;
  tampilAset?: boolean;
  kosong?: string;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [pelaksana, setPelaksana] = useState<Pelaksana | "">("");
  const [jenis, setJenis] = useState<JenisWo | "">("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const qTunda = useDeferredValue(q);
  const data = usePerintahKerjaPage({
    page,
    pageSize,
    q: qTunda,
    status,
    pelaksana,
    jenis,
    dari,
    sampai,
    ...dasar
  });
  const pg = serverPageState(data.data, page, pageSize, setPage, (s) => {
    setPageSize(s);
    setPage(1);
  });
  const ubah =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const adaFilter = Boolean(q || status || pelaksana || jenis || dari || sampai);

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {denganFilter && (
        <div className="toolbar">
          <div className="toolbar-search">
            <Input
              value={q}
              onChange={(e) => ubah(setQ)(e.target.value)}
              placeholder="Cari nomor WO, kode aset, atau keluhan…"
              leftIcon={<Search style={{ width: 15, height: 15 }} />}
            />
          </div>
          <div className="toolbar-filter">
            <Select value={status} onChange={(e) => ubah(setStatus)(e.target.value)} aria-label="Filter status">
              <option value="">Semua status</option>
              <option value="terbuka">Belum selesai</option>
              <option value="aktif">Sedang dikerjakan</option>
              {(Object.keys(STATUS_WO) as StatusWo[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_WO[s].label}
                </option>
              ))}
            </Select>
          </div>
          <div className="toolbar-filter">
            <Select
              value={pelaksana}
              onChange={(e) => ubah(setPelaksana)(e.target.value as Pelaksana | "")}
              aria-label="Filter pelaksana"
            >
              <option value="">Semua pelaksana</option>
              {PELAKSANA.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="toolbar-filter">
            <Select value={jenis} onChange={(e) => ubah(setJenis)(e.target.value as JenisWo | "")} aria-label="Filter jenis">
              <option value="">Semua jenis</option>
              {JENIS_WO.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="toolbar-filter" style={{ minWidth: 150 }}>
            <DateInput value={dari} onChange={ubah(setDari)} clearable />
          </div>
          <div className="toolbar-filter" style={{ minWidth: 150 }}>
            <DateInput value={sampai} onChange={ubah(setSampai)} min={dari || undefined} clearable />
          </div>
          {adaFilter && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQ("");
                setStatus("");
                setPelaksana("");
                setJenis("");
                setDari("");
                setSampai("");
                setPage(1);
              }}
            >
              <X style={{ width: 14, height: 14 }} />
              Reset filter
            </button>
          )}
        </div>
      )}

      {data.isError ? (
        <PageError error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="card card-pad caption">Memuat perintah kerja…</div>
      ) : pg.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={adaFilter ? "Tidak ada perintah kerja yang cocok" : "Belum ada perintah kerja"}
          description={adaFilter ? "Coba ubah filter atau kata kunci." : kosong}
        />
      ) : (
        <div style={{ opacity: data.isPlaceholderData ? 0.6 : 1 }}>
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 190 }}>Nomor</th>
                    <th style={{ width: 110 }}>Tanggal</th>
                    {tampilAset && <th style={{ width: 110 }}>Aset</th>}
                    <th>Pekerjaan</th>
                    <th>Pelaksana</th>
                    <th style={{ width: 150 }}>Status</th>
                    <th style={{ width: 150, textAlign: "right" }}>Biaya</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.items.map((w) => (
                    <tr
                      key={w.id}
                      className="row-link"
                      tabIndex={0}
                      onClick={() => navigate(`/perintah-kerja/${w.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/perintah-kerja/${w.id}`);
                      }}
                    >
                      <td className="mono" style={{ fontWeight: 600, fontSize: 12 }}>
                        {w.nomor}
                      </td>
                      <td>{formatDate(w.tanggal)}</td>
                      {tampilAset && <td style={{ fontWeight: 600 }}>{w.kode_aset}</td>}
                      <td>
                        <div>{labelDari(JENIS_WO, w.jenis)}</div>
                        {w.keluhan && (
                          <div className="caption" style={{ maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {w.keluhan}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{labelDari(PELAKSANA, w.pelaksana)}</div>
                        <div className="caption">
                          {w.pelaksana_nama ?? "—"}
                          {w.status_klaim && ` · Klaim ${STATUS_KLAIM[w.status_klaim].toLowerCase()}`}
                        </div>
                      </td>
                      <td>
                        <StatusWoBadge status={w.status_wo} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <BiayaRingkas w={w} />
                      </td>
                      <td>
                        <ChevronRight style={{ width: 16, height: 16, color: "var(--text-tertiary)" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pg} label="perintah kerja" attached />
          </div>

          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((w) => (
              <Link
                key={w.id}
                to={`/perintah-kerja/${w.id}`}
                className="card card-pad"
                style={{ display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", color: "inherit" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>
                    {w.nomor}
                  </span>
                  <StatusWoBadge status={w.status_wo} />
                </div>
                <div style={{ fontWeight: 600 }}>
                  {tampilAset && `${w.kode_aset} · `}
                  {labelDari(JENIS_WO, w.jenis)}
                </div>
                <div className="caption">
                  {formatDate(w.tanggal)} · {labelDari(PELAKSANA, w.pelaksana)}
                  {w.pelaksana_nama ? ` (${w.pelaksana_nama})` : ""}
                </div>
                <div style={{ fontWeight: 600 }}>{formatRupiah(w.total_biaya)}</div>
              </Link>
            ))}
            <Pagination state={pg} label="perintah kerja" />
          </div>
        </div>
      )}
    </div>
  );
}

function BiayaRingkas({ w }: { w: PerintahKerjaRingkas }) {
  return (
    <>
      <div style={{ fontWeight: 600 }}>{formatRupiah(w.total_biaya)}</div>
      {w.pelaksana === "asuransi" && w.total_biaya > 0 && (
        <div className="caption" style={{ fontSize: 10.5 }}>
          Perusahaan {formatRupiah(w.tanggungan.perusahaan)}
          {w.tanggungan.estimasi ? " (estimasi)" : ""}
        </div>
      )}
    </>
  );
}
