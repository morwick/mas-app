"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: "standby" | "bertugas" | "perbaikan";
  active?: boolean;
  onClick?: () => void;
}

const tones = {
  standby: "bg-status-standby-bg text-status-standby-fg",
  bertugas: "bg-status-bertugas-bg text-status-bertugas-fg",
  perbaikan: "bg-status-perbaikan-bg text-status-perbaikan-fg"
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick
}: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left bg-card rounded-lg border p-3 sm:p-4 transition-colors",
        active
          ? "border-brand ring-[2px] ring-brand/30"
          : "border-border hover:border-border-hover"
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-8 h-8 rounded-md flex items-center justify-center",
            tones[tone]
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[11px] sm:text-[12px] text-text-muted">{label}</span>
      </div>
      <p className="mt-2 sm:mt-3 text-[24px] sm:text-[28px] font-semibold text-text leading-none">
        {value}
      </p>
    </button>
  );
}
