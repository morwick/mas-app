/**
 * Halaman Notifikasi — isi yang sama dengan lonceng, tetapi juga menampilkan
 * yang sudah dibaca dan bisa ditelusuri per halaman.
 *
 * Lonceng hanya memuat yang belum dibaca dan dipotong 50; halaman ini tempat
 * melihat semuanya.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError, PageLoading } from "@/components/ui/page-state";
import {
  ALL_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  pageSizeLabel
} from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { queryClient } from "@/lib/api/query";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { markAllNotificationsRead } from "../api";
import { useNotificationPage } from "../queries";
import { useNotificationReadState } from "../read-state";

/** Default 10 — sengaja lebih kecil dari daftar lain; notifikasi dibaca sekilas. */
const DEFAULT_SIZE = 10;

const SEVERITY_DOT: Record<string, string> = {
  danger: "#c13838",
  warning: "#b8770f",
  info: "var(--brand-primary)"
};

export function NotificationsView() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_SIZE);
  const q = useNotificationPage(page, pageSize);
  const { isRead, mark } = useNotificationReadState();

  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;

  const { items, total } = q.data;
  const pageCount =
    pageSize === ALL_PAGE_SIZE ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = pageSize === ALL_PAGE_SIZE ? total : Math.min(page * pageSize, total);
  const belumDibaca = items.filter((n) => !isRead(n)).length;

  function changeSize(size: number) {
    setPageSize(size);
    // Jumlah baris berubah → posisi halaman lama tidak lagi bermakna.
    setPage(1);
  }

  async function tandaiSemua() {
    try {
      // Kejadian tersimpan ditandai seluruhnya di server, bukan hanya yang
      // tampil di halaman ini. Notifikasi keadaan tidak punya baris di
      // database, jadi yang sedang dimuat ditandai lokal.
      await markAllNotificationsRead();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai notifikasi");
      return;
    }
    mark(items.filter((n) => !n.persistent));
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("Semua notifikasi ditandai sudah dibaca");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="caption">
            {total} notifikasi
            {belumDibaca > 0 && ` · ${belumDibaca} belum dibaca di halaman ini`}
          </p>
        </div>
        <div className="toolbar-actions">
          <Button
            variant="secondary"
            onClick={() => void tandaiSemua()}
            leftIcon={<CheckCheck style={{ width: 16, height: 16 }} />}
          >
            Tandai semua dibaca
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bell}
            title="Belum ada notifikasi"
            description="Kejadian job dan uang jalan, serta pengingat servis dan dokumen, akan muncul di sini."
          />
        </div>
      ) : (
        <div className="card">
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.href}
                  onClick={() => mark([n])}
                  className="notif-row"
                  data-unread={!isRead(n)}
                >
                  <span
                    className="notif-dot"
                    style={{ background: SEVERITY_DOT[n.severity] ?? "var(--brand-primary)" }}
                    aria-hidden
                  />
                  <span className="notif-body">
                    <span className="notif-title">{n.title}</span>
                    <span className="notif-text">{n.body}</span>
                  </span>
                  <span className="notif-meta">
                    <span title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                    {!isRead(n) && <span className="notif-badge">Baru</span>}
                  </span>
                  <ChevronRight
                    style={{ width: 16, height: 16, color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                </Link>
              </li>
            ))}
          </ul>

          <div className="pagination pagination-attached">
            <span className="pagination-info">
              <label htmlFor="notif-size" className="pagination-size-label">
                Tampilkan
              </label>
              <select
                id="notif-size"
                className="pagination-size"
                value={pageSize}
                onChange={(e) => changeSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {pageSizeLabel(n)}
                  </option>
                ))}
              </select>
              {from}–{to} dari {total} notifikasi
            </span>
            {pageCount > 1 && (
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  aria-label="Halaman sebelumnya"
                >
                  ‹
                </button>
                <span className="pagination-gap">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pageCount}
                  aria-label="Halaman berikutnya"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
