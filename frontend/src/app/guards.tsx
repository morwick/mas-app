/**
 * Penjaga rute. Keputusan akses admin sesungguhnya ada di RLS/backend; guard
 * di sini hanya supaya pengguna tidak melihat halaman kosong lalu ditendang.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthContext";
import { useDriverAuth } from "@/lib/auth/DriverAuthContext";
import type { UserRole } from "@/types";

export function RequireAuth() {
  const { session, perluPilihRole } = useAuth();
  const location = useLocation();
  // Akun beberapa role yang belum memilih role kembali ke layar "Masuk sebagai".
  if (!session || perluPilihRole) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function RequireSuperadmin() {
  const { isSuperadmin } = useAuth();
  if (!isSuperadmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Menu yang hanya boleh dilihat sebagian role (mis. Piutang: superadmin & finance). */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { session } = useAuth();
  const role = session?.user.role;
  if (!role || !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Halaman login/reset: yang sudah masuk langsung ke dashboard. */
export function RedirectIfAuthed() {
  const { session, perluPilihRole } = useAuth();
  if (session && !perluPilihRole) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RequireDriver() {
  const { session } = useDriverAuth();
  if (!session) return <Navigate to="/driver/login" replace />;
  return <Outlet />;
}

export function RedirectIfDriverAuthed() {
  const { session } = useDriverAuth();
  if (session) return <Navigate to="/driver/dashboard" replace />;
  return <Outlet />;
}
