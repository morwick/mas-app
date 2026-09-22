import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/lib/types";

type StatusKey =
  | "standby"
  | "bertugas"
  | "perbaikan"
  | "cancelled"
  | "info"
  | "menunggu_pickup"
  | "loading"
  | "dalam_perjalanan"
  | "unloading"
  | "selesai"
  | "neutral";

const statusClass: Record<StatusKey, string> = {
  standby: "badge-standby",
  bertugas: "badge-bertugas",
  perbaikan: "badge-perbaikan",
  cancelled: "badge-cancelled",
  info: "badge-pickup",
  menunggu_pickup: "badge-pickup",
  loading: "badge-loading",
  dalam_perjalanan: "badge-perjalanan",
  unloading: "badge-unloading",
  selesai: "badge-selesai",
  neutral: ""
};

const labels: Partial<Record<StatusKey, string>> = {
  standby: "Standby",
  bertugas: "Bertugas",
  perbaikan: "Perbaikan",
  cancelled: "Dibatalkan",
  menunggu_pickup: "Menunggu pickup",
  loading: "Loading",
  dalam_perjalanan: "Dalam perjalanan",
  unloading: "Unloading",
  selesai: "Selesai"
};

interface StatusBadgeProps {
  status: StatusKey;
  className?: string;
  /** @deprecated kept for backward compat; design uses single size */
  size?: "sm" | "md";
  withDot?: boolean;
}

export function StatusBadge({
  status,
  className,
  withDot = true
}: StatusBadgeProps) {
  return (
    <span className={cn("badge", statusClass[status], className)}>
      {withDot && <span className="badge-dot" />}
      {labels[status] ?? status}
    </span>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "neutral" | "brand" | "info" | "warning" | "danger";
  className?: string;
}

const variantClass: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral: "",
  brand: "badge-bertugas",
  info: "badge-pickup",
  warning: "badge-perbaikan",
  danger: "badge-cancelled"
};

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span className={cn("badge", variantClass[variant], className)}>
      {children}
    </span>
  );
}

const serviceStatusClass: Record<ServiceStatus, string> = {
  ok: "badge-selesai",
  mendekati: "badge-perbaikan",
  overdue: "badge-cancelled"
};

const serviceStatusLabelShort: Record<ServiceStatus, string> = {
  ok: "OK",
  mendekati: "Mendekati",
  overdue: "Overdue"
};

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  className?: string;
  withDot?: boolean;
}

export function ServiceStatusBadge({
  status,
  className,
  withDot = true
}: ServiceStatusBadgeProps) {
  return (
    <span className={cn("badge", serviceStatusClass[status], className)}>
      {withDot && <span className="badge-dot" />}
      {serviceStatusLabelShort[status]}
    </span>
  );
}
