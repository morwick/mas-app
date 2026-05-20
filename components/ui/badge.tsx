import { cn } from "@/lib/utils";

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

const statusStyle: Record<StatusKey, string> = {
  standby: "bg-status-standby-bg text-status-standby-fg",
  bertugas: "bg-status-bertugas-bg text-status-bertugas-fg",
  perbaikan: "bg-status-perbaikan-bg text-status-perbaikan-fg",
  cancelled: "bg-status-cancelled-bg text-status-cancelled-fg",
  info: "bg-status-info-bg text-status-info-fg",
  menunggu_pickup: "bg-status-standby-bg text-status-standby-fg",
  loading: "bg-status-perbaikan-bg text-status-perbaikan-fg",
  dalam_perjalanan: "bg-status-info-bg text-status-info-fg",
  unloading: "bg-status-perbaikan-bg text-status-perbaikan-fg",
  selesai: "bg-status-bertugas-bg text-status-bertugas-fg",
  neutral: "bg-status-standby-bg text-status-standby-fg"
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
  size?: "sm" | "md";
}

export function StatusBadge({ status, className, size = "sm" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium tracking-[0.3px] rounded-full",
        size === "sm"
          ? "px-2.5 py-0.5 text-[10px]"
          : "px-3 py-1 text-[12px]",
        statusStyle[status],
        className
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "neutral" | "brand" | "info" | "warning" | "danger";
  className?: string;
}

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  const styles: Record<string, string> = {
    neutral: "bg-status-standby-bg text-status-standby-fg",
    brand: "bg-brand-light text-brand-dark",
    info: "bg-status-info-bg text-status-info-fg",
    warning: "bg-status-perbaikan-bg text-status-perbaikan-fg",
    danger: "bg-status-cancelled-bg text-status-cancelled-fg"
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
