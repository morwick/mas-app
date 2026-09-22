import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  /** Use `card-pad-lg` (20px) instead of default `card-pad` (16px) */
  paddedLarge?: boolean;
}

export function Card({
  className,
  padded = true,
  paddedLarge,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "card",
        padded && !paddedLarge && "card-pad",
        paddedLarge && "card-pad-lg",
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
    <div
      className={cn(
        "flex items-start justify-between gap-3 mb-3",
        className
      )}
    >
      <div className="min-w-0">
        <h3 className="h3">{title}</h3>
        {description && (
          <p className="caption mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
