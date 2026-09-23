/**
 * Penjaga rute. Keputusan akses admin sesungguhnya ada di RLS/backend; guard
 * di sini hanya supaya pengguna tidak melihat halaman kosong lalu ditendang.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthContext";
import { useDriverAuth } from "@/lib/auth/DriverAuthContext";

export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
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

/** Halaman login/reset: yang sudah masuk langsung ke dashboard. */
export function RedirectIfAuthed() {
  const { session } = useAuth();
  if (session) return <Navigate to="/dashboard" replace />;
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
