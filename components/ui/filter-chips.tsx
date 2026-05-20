"use client";

import { cn } from "@/lib/utils";

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

interface FilterChipsProps {
  items: FilterChip[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function FilterChips({ items, value, onChange, className }: FilterChipsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1 py-1",
        className
      )}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border transition-colors",
            value === it.key
              ? "bg-brand text-white border-brand"
              : "bg-white text-text border-border hover:border-border-hover"
          )}
        >
          {it.label}
          {typeof it.count === "number" && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full",
                value === it.key ? "bg-white/20" : "bg-page text-text-muted"
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
