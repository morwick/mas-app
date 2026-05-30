/**
 * Notification center types & mock data.
 *
 * Fase UI: data masih hardcode di sini. Saat backend siap, fungsi
 * `getMockNotifications()` diganti dengan `getNotifications(supabase)` yang
 * derive dari sumber real (anomali job, service status, incident, dst).
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Wrench,
  PackageCheck,
  WifiOff,
  Building2,
  AlertCircle,
  FileText
} from "lucide-react";

export type NotificationKind =
  | "anomaly"
  | "service_overdue"
  | "service_due_soon"
  | "incident_open"
  | "job_unassigned"
  | "gps_offline"
  | "customer_new"
  | "document_expiring";

export type NotificationSeverity = "info" | "warning" | "danger";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string;
  createdAt: string; // ISO
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
  document_expiring: { icon: FileText, label: "Dokumen akan expired" }
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

/** Mock notifications. Diurutkan terbaru dulu. */
export function getMockNotifications(now: Date = new Date()): AppNotification[] {
  const offset = (mins: number) =>
    new Date(now.getTime() - mins * 60_000).toISOString();
  return [
    {
      id: "n-1",
      kind: "anomaly",
      severity: "danger",
      title: "Unit berhenti >30 menit",
      body: "TH49 berhenti di luar lokasi pickup/tujuan",
      href: "/tracking",
      createdAt: offset(4)
    },
    {
      id: "n-2",
      kind: "service_overdue",
      severity: "danger",
      title: "Servis overdue",
      body: "Unit TH49 lewat 1.309 km dari interval",
      href: "/units",
      createdAt: offset(12)
    },
    {
      id: "n-3",
      kind: "job_unassigned",
      severity: "warning",
      title: "Job belum di-assign driver",
      body: "J-2026-004 berangkat besok pagi 07:00",
      href: "/jobs",
      createdAt: offset(38)
    },
    {
      id: "n-4",
      kind: "service_due_soon",
      severity: "warning",
      title: "Servis mendekati",
      body: "Unit SL70 sisa 420 km menuju interval",
      href: "/units",
      createdAt: offset(95)
    },
    {
      id: "n-5",
      kind: "gps_offline",
      severity: "warning",
      title: "GPS offline >2 jam",
      body: "BM3318 tidak kirim posisi sejak 08:20",
      href: "/units",
      createdAt: offset(140)
    },
    {
      id: "n-6",
      kind: "incident_open",
      severity: "danger",
      title: "Insiden baru: Breakdown",
      body: "TH49 mogok di Tol Cipali KM 142",
      href: "/units",
      createdAt: offset(220)
    },
    {
      id: "n-7",
      kind: "customer_new",
      severity: "info",
      title: "Customer baru terdaftar",
      body: "PT Sentosa Pratama Mining",
      href: "/customers",
      createdAt: offset(330)
    },
    {
      id: "n-8",
      kind: "document_expiring",
      severity: "warning",
      title: "STNK akan expired",
      body: "BM7821 expired dalam 21 hari",
      href: "/units",
      createdAt: offset(1440)
    }
  ];
}
