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
        className={cn("inline-flex", className)}
        style={{
          gap: 4,
          background: "white",
          padding: 4,
          borderRadius: 8,
          border: "0.5px solid var(--border-default)"
        }}
      >
        {items.map((it) => {
          const active = value === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              style={{
                background: active ? "var(--text-primary)" : "transparent",
                color: active ? "white" : "var(--text-secondary)",
                border: "none",
                padding: "6px 12px",
                borderRadius: 5,
                fontSize: 12.5,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              {it.label}
              {typeof it.count === "number" && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "0 5px",
                    borderRadius: 99,
                    minWidth: 18,
                    textAlign: "center",
                    background: active
                      ? "rgba(255,255,255,0.2)"
                      : "var(--bg-subtle)"
                  }}
                >
                  {it.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center overflow-x-auto scrollbar-thin", className)}
      style={{ borderBottom: "0.5px solid var(--border-default)" }}
    >
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              background: "transparent",
              border: "none",
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: 500,
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              borderBottom: active
                ? "2px solid var(--brand-primary)"
                : "2px solid transparent",
              marginBottom: "-0.5px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              cursor: "pointer"
            }}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 99,
                  background: active
                    ? "var(--brand-primary-light)"
                    : "var(--bg-subtle)",
                  color: active
                    ? "var(--brand-primary-dark)"
                    : "var(--text-secondary)"
                }}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
