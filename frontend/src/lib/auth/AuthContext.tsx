/**
 * Konteks sesi admin. Sumber kebenaran tetap localStorage (lihat session.ts);
 * konteks ini hanya membuatnya reaktif untuk komponen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { adminSession, type AdminSession } from "@/lib/auth/session";
import { api, onUnauthorized } from "@/lib/api/client";
import type { CurrentUser } from "@/types";

interface AuthApi {
  session: AdminSession | null;
  user: CurrentUser | null;
  isOwner: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  /** Muat ulang profil (setelah ganti nama, dsb). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(() => adminSession.get());

  // Sesi dicabut server (401) → bersihkan state supaya guard mengarahkan ke login.
  useEffect(
    () =>
      onUnauthorized((mode) => {
        if (mode === "admin") setSession(null);
      }),
    []
  );

  // Tab lain login/logout → ikut sinkron.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "mas_admin_session") setSession(adminSession.get());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api.post<AdminSession>("/auth/login", { email, password }, "none");
    adminSession.set(s);
    setSession(s);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* sesi sudah mati di server — tetap keluar di sisi klien */
    }
    adminSession.clear();
    setSession(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const current = adminSession.get();
    if (!current) return;
    const user = await api.get<CurrentUser>("/auth/me");
    const next = { ...current, user };
    adminSession.set(next);
    setSession(next);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      session,
      user: session?.user ?? null,
      isOwner: session?.user.role === "owner",
      login,
      logout,
      refreshUser
    }),
    [session, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}

/** Untuk halaman yang dijaga RequireAuth — user dijamin ada. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser dipanggil di luar area login");
  return user;
}
