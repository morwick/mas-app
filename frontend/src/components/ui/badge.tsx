import { cn } from "@/lib/utils";
import { JOB_STATUS_BADGE, JOB_STATUS_LABEL } from "@/lib/job-status";
import type { JobStatus, ServiceStatus } from "@/types";

type StatusKey =
  | "standby"
  | "bertugas"
  | "perbaikan"
  | "terjual"
  | "diafkirkan"
  | "info"
  | "neutral"
  | "stand_by"
  | "in_job"
  | JobStatus;

const statusClass: Record<StatusKey, string> = {
  standby: "badge-standby",
  bertugas: "badge-bertugas",
  perbaikan: "badge-perbaikan",
  terjual: "badge-terjual",
  diafkirkan: "badge-diafkirkan",
  info: "badge-pickup",
  neutral: "",
  stand_by: "badge-standby",
  in_job: "badge-bertugas",
  ...JOB_STATUS_BADGE
};

const labels: Partial<Record<StatusKey, string>> = {
  standby: "Standby",
  bertugas: "Bertugas",
  perbaikan: "Perbaikan",
  terjual: "Terjual",
  diafkirkan: "Diafkirkan",
  stand_by: "Stand By",
  in_job: "In Job",
  ...JOB_STATUS_LABEL
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
