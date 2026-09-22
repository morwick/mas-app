/** Sesi portal driver — terpisah total dari sesi admin. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { driverSession, type StoredDriverSession } from "@/lib/auth/session";
import { api, onUnauthorized } from "@/lib/api/client";

interface DriverLoginResponse {
  token: string;
  driver_id: string;
  nama: string;
  no_hp: string;
}

interface DriverAuthApi {
  session: StoredDriverSession | null;
  login: (noHp: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<DriverAuthApi | null>(null);

export function DriverAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredDriverSession | null>(() => driverSession.get());

  useEffect(
    () =>
      onUnauthorized((mode) => {
        if (mode === "driver") setSession(null);
      }),
    []
  );

  const login = useCallback(async (noHp: string, pin: string) => {
    const res = await api.post<DriverLoginResponse>(
      "/driver/login",
      { no_hp: noHp, pin },
      "none"
    );
    const s: StoredDriverSession = {
      token: res.token,
      driver_id: res.driver_id,
      nama: res.nama,
      no_hp: res.no_hp
    };
    driverSession.set(s);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/driver/logout", undefined, "driver");
    } catch {
      /* sesi sudah mati — tetap keluar */
    }
    driverSession.clear();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDriverAuth(): DriverAuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDriverAuth harus dipakai di dalam DriverAuthProvider");
  return ctx;
}
