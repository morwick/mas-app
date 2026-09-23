/**
 * Bentuk & tampilan notifikasi.
 *
 * Isinya dihitung backend dari data asli (GET /api/notifications).
 * File ini sengaja bebas dari akses database supaya bisa dipakai komponen
 * klien (lonceng) maupun server.
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Wrench,
  PackageCheck,
  WifiOff,
  Building2,
  AlertCircle,
  FileText,
  Receipt,
  Wallet,
  ClipboardCheck
} from "lucide-react";

export type NotificationKind =
  | "anomaly"
  | "service_overdue"
  | "service_due_soon"
  | "incident_open"
  | "job_unassigned"
  | "gps_offline"
  | "customer_new"
  | "document_expiring"
  | "invoice_overdue"
  // Kejadian alur job v2 (tersimpan di database, dibaca per pengguna)
  | "job_diterima"
  | "uang_jalan_diajukan"
  | "job_menunggu_validasi";

export type NotificationSeverity = "info" | "warning" | "danger";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string;
  created_at: string; // ISO
  /** Kejadian tersimpan (status dibaca per pengguna di server). */
  persistent?: boolean;
  read?: boolean;
}

interface KindMeta {
  icon: LucideIcon;
  label: string;
}

export const KIND_META: Record<NotificationKind, KindMeta> = {
  anomaly: { icon: AlertTriangle, label: "Anomali" },
  service_overdue: { icon: Wrench, label: "Servis overdue" },
  service_due_soon: { icon: Wrench, label: "Servis mendekati" },
  incident_open: { icon: AlertCircle, label: "Insiden" },
  job_unassigned: { icon: PackageCheck, label: "Job belum di-assign" },
  gps_offline: { icon: WifiOff, label: "GPS offline" },
  customer_new: { icon: Building2, label: "Customer baru" },
  document_expiring: { icon: FileText, label: "Dokumen akan expired" },
  invoice_overdue: { icon: Receipt, label: "Tagihan jatuh tempo" },
  job_diterima: { icon: PackageCheck, label: "Driver menerima job" },
  uang_jalan_diajukan: { icon: Wallet, label: "Pengajuan uang jalan" },
  job_menunggu_validasi: { icon: ClipboardCheck, label: "Menunggu validasi" }
};

const SEVERITY_TOKENS: Record<
  NotificationSeverity,
  { bg: string; fg: string; dot: string }
> = {
  info: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    dot: "var(--brand-primary)"
  },
  warning: { bg: "#fff4e0", fg: "#8a5a00", dot: "#c97900" },
  danger: { bg: "#fcebeb", fg: "#791f1f", dot: "#c93030" }
};

export function severityTokens(s: NotificationSeverity) {
  return SEVERITY_TOKENS[s];
}

/** Format "5 menit lalu" / "2 jam lalu" / "3 hari lalu" / tanggal lengkap. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const sec = Math.floor((now.getTime() - t) / 1000);
  if (sec < 60) return "Baru saja";
  if (sec < 3600) return `${Math.floor(sec / 60)} menit lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam lalu`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short"
  });
}

