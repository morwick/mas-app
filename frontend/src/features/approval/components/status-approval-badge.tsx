import type { StatusApprovalData } from "../api";

const TAMPILAN: Record<StatusApprovalData, { label: string; bg: string; fg: string }> = {
  menunggu: { label: "Menunggu approval", bg: "var(--status-menunggu-bg)", fg: "var(--status-menunggu-text)" },
  disetujui: { label: "Disetujui", bg: "var(--status-selesai-bg)", fg: "var(--status-selesai-text)" },
  ditolak: { label: "Ditolak approver", bg: "var(--status-cancelled-bg)", fg: "var(--status-cancelled-text)" }
};

/** Status approval data asli (tambahan uang jalan, penjualan, penghapusan). */
export function StatusApprovalBadge({ status }: { status: StatusApprovalData }) {
  const t = TAMPILAN[status];
  return (
    <span className="badge" style={{ background: t.bg, color: t.fg, whiteSpace: "nowrap" }}>
      {t.label}
    </span>
  );
}
