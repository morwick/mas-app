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

export function FilterChips({
  items,
  value,
  onChange,
  className
}: FilterChipsProps) {
  return (
    <div
      className={cn(
        "flex items-center overflow-x-auto scrollbar-thin",
        className
      )}
      style={{ gap: 6, padding: "4px 0" }}
    >
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={cn("chip", active && "active")}
            style={{ flexShrink: 0 }}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className="chip-count">{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
