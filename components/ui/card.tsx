import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ className, padded = true, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg border border-border",
        padded && "p-4",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[16px] font-medium text-text">{title}</h3>
        {description && (
          <p className="mt-0.5 text-[12px] text-text-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
