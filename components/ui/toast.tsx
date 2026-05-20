"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  variant: Variant;
}

interface ToastApi {
  show: (msg: string, variant?: Variant) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warning: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const iconFor: Record<Variant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertCircle
};

const colorFor: Record<Variant, string> = {
  success: "bg-brand-light text-brand-dark border-brand/30",
  error: "bg-status-cancelled-bg text-status-cancelled-fg border-danger/30",
  info: "bg-status-info-bg text-status-info-fg border-blue-300",
  warning: "bg-status-perbaikan-bg text-status-perbaikan-fg border-amber-300"
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: Variant = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => remove(id), 3000);
    },
    [remove]
  );

  const api: ToastApi = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
    warning: (m) => show(m, "warning")
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[100] flex flex-col gap-2 w-[min(92vw,400px)]">
        {toasts.map((t) => {
          const Icon = iconFor[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-2 border rounded-lg px-3 py-2.5 shadow-sm bg-white",
                colorFor[t.variant]
              )}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-[13px] flex-1">{t.message}</p>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="text-current/60 hover:text-current"
                aria-label="Tutup"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function ToastConsumer({
  children
}: {
  children: (api: ToastApi) => React.ReactNode;
}) {
  const api = useToast();
  return <>{children(api)}</>;
}

// Hook that returns api without throwing if no provider — useful for early bootstrap
export function useOptionalToast() {
  return useContext(ToastContext);
}

// Standalone helper effect to run an action after mount (used for inline page-level toasts)
export function useMountEffect(fn: () => void) {
  useEffect(() => {
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
