"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon: LucideIcon;
  tone?: "neutral" | "standby" | "bertugas" | "perbaikan";
  active?: boolean;
  onClick?: () => void;
}

const toneStyle: Record<
  NonNullable<StatCardProps["tone"]>,
  { bg: string; col: string }
> = {
  neutral: { bg: "var(--bg-subtle)", col: "var(--text-secondary)" },
  standby: {
    bg: "var(--status-standby-bg)",
    col: "var(--status-standby-text)"
  },
  bertugas: {
    bg: "var(--status-bertugas-bg)",
    col: "var(--status-bertugas-text)"
  },
  perbaikan: {
    bg: "var(--status-perbaikan-bg)",
    col: "var(--status-perbaikan-text)"
  }
};

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "neutral",
  active,
  onClick
}: StatCardProps) {
  const t = toneStyle[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("text-left", onClick ? "cursor-pointer" : "cursor-default")}
      style={{
        background: "white",
        border: `0.5px solid ${
          active ? "var(--brand-primary)" : "var(--border-default)"
        }`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: active ? "0 0 0 3px var(--brand-primary-ring)" : "none",
        transition: "all 120ms ease",
        width: "100%"
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: t.bg,
          color: t.col,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        <Icon style={{ width: 20, height: 20 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="caption" style={{ fontSize: 11.5, marginBottom: 2 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1
          }}
        >
          {value}
        </div>
        {sublabel && (
          <div className="caption" style={{ fontSize: 11, marginTop: 4 }}>
            {sublabel}
          </div>
        )}
      </div>
    </button>
  );
}
