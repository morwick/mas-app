"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  variant?: "underline" | "pill";
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  variant = "underline"
}: TabsProps) {
  if (variant === "pill") {
    return (
      <div
        className={cn(
          "inline-flex p-1 bg-page rounded-lg border border-border",
          className
        )}
      >
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={cn(
              "px-3 h-8 rounded-md text-[13px] font-medium transition-colors",
              value === it.key
                ? "bg-white text-text shadow-sm"
                : "text-text-muted hover:text-text"
            )}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className="ml-1.5 text-[11px] text-text-muted">{it.count}</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-thin",
        className
      )}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={cn(
            "px-3 h-10 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
            value === it.key
              ? "border-brand text-brand-dark"
              : "border-transparent text-text-muted hover:text-text"
          )}
        >
          {it.label}
          {typeof it.count === "number" && (
            <span
              className={cn(
                "ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px]",
                value === it.key
                  ? "bg-brand-light text-brand-dark"
                  : "bg-status-standby-bg text-text-muted"
              )}
            >
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
