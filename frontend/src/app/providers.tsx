import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/api/query";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { DriverAuthProvider } from "@/lib/auth/DriverAuthContext";
import { ToastProvider } from "@/components/ui/toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DriverAuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </DriverAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
