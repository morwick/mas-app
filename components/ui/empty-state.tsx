import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center py-10 px-4",
        className
      )}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-brand-light flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-brand-dark" />
        </div>
      )}
      <h3 className="text-[16px] font-medium text-text">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-text-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
