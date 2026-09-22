"use client";

import { logoutAction } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  variant?: "sidebar" | "settings" | "icon";
}

export function LogoutButton({ variant = "sidebar" }: LogoutButtonProps) {
  if (variant === "settings") {
    return (
      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full text-left bg-card rounded-lg border border-border p-3.5 flex items-center gap-3 hover:border-border-hover text-status-cancelled-fg"
        >
          <div className="w-10 h-10 rounded-md bg-status-cancelled-bg flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[14px] font-medium">Keluar</p>
            <p className="text-[12px] text-text-muted">Logout dari akun admin</p>
          </div>
        </button>
      </form>
    );
  }
  if (variant === "icon") {
    return (
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Keluar"
          title="Keluar"
          className="btn-ghost"
          style={{
            background: "transparent",
            border: "none",
            padding: 6,
            borderRadius: 6,
            color: "var(--text-tertiary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </form>
    );
  }
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={cn(
          "w-full flex items-center gap-2.5 h-10 px-3 rounded-md text-[14px] text-text-muted hover:bg-page hover:text-text"
        )}
      >
        <LogOut className="w-[18px] h-[18px]" />
        <span>Keluar</span>
      </button>
    </form>
  );
}
