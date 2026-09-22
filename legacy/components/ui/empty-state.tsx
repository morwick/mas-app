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
      className={cn("flex flex-col items-center text-center", className)}
      style={{ padding: 48, gap: 12 }}
    >
      {Icon && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 99,
            background: "var(--bg-subtle)",
            color: "var(--text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Icon style={{ width: 26, height: 26 }} />
        </div>
      )}
      <h3 className="h3" style={{ marginTop: 4 }}>
        {title}
      </h3>
      {description && (
        <p className="caption body-sm" style={{ maxWidth: 320 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}
