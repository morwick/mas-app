import { useState } from "react";
import { Banknote, Shield, ShieldCheck, UserCog } from "lucide-react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useAuth } from "@/lib/auth/AuthContext";
import type { UserRole } from "@/types";

export const LABEL_ROLE: Record<UserRole, string> = {
  superadmin: "Super Administrator",
  operator: "Operator",
  finance: "Finance",
  admin: "Admin"
};

const KETERANGAN_ROLE: Record<UserRole, string> = {
  superadmin: "Akses penuh: master data, tagihan, laporan, pengguna.",
  operator: "Lihat unit, driver, job (pantau), uang jalan, dan catat service.",
  finance: "Kelola tagihan, faktur pajak, dan pantau piutang.",
  admin: "Kelola unit, driver, customer, penawaran, job, dan laporan."
};

const ICON_ROLE: Record<UserRole, typeof Shield> = {
  superadmin: ShieldCheck,
  operator: Shield,
  finance: Banknote,
  admin: UserCog
};

/**
 * Pilihan role untuk akun yang punya lebih dari satu role. Dipakai setelah
 * login dan dari menu profil. Setiap pergantian tercatat di log sistem.
 */
export function RolePicker({ onSelesai }: { onSelesai: (role: UserRole) => void }) {
  const { user, gantiRole } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  async function pilih(role: UserRole) {
    if (busy) return;
    if (role === user?.role) {
      onSelesai(role);
      return;
    }
    setBusy(`Beralih ke ${LABEL_ROLE[role]}…`);
    setError(null);
    try {
      await gantiRole(role);
      onSelesai(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengganti role");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {user.roles.map((r) => {
        const Icon = ICON_ROLE[r];
        const aktif = r === user.role;
        return (
          <button
            key={r}
            type="button"
            onClick={() => void pilih(r)}
            disabled={busy !== null}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 10,
              border: aktif ? "1.5px solid var(--brand-primary)" : "0.5px solid var(--border-default)",
              background: aktif ? "var(--brand-primary-light)" : "white",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <Icon style={{ width: 20, height: 20, flexShrink: 0, color: "var(--brand-primary-dark)" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {LABEL_ROLE[r]}
                {aktif ? " (sedang dipakai)" : ""}
              </span>
              <span className="caption">{KETERANGAN_ROLE[r]}</span>
            </span>
          </button>
        );
      })}
      {error && (
        <p className="text-[12px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">{error}</p>
      )}
      <LoadingOverlay message={busy} />
    </div>
  );
}
