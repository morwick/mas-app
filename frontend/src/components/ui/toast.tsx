import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";

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

const bgFor: Record<Variant, string> = {
  success: "var(--brand-primary)",
  error: "#c13838",
  info: "#1f4fa8",
  warning: "#854f0b"
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
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 400
        }}
      >
        {toasts.map((t) => {
          const Icon = iconFor[t.variant];
          return (
            <div
              key={t.id}
              className="slide-up"
              style={{
                background: bgFor[t.variant],
                color: "white",
                padding: "10px 16px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                fontWeight: 500,
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
              }}
            >
              <Icon className="w-4 h-4" />
              <p style={{ flex: 1, margin: 0 }}>{t.message}</p>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Tutup"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.7)",
                  padding: 0,
                  display: "flex",
                  cursor: "pointer"
                }}
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

export function useOptionalToast() {
  return useContext(ToastContext);
}

export function useMountEffect(fn: () => void) {
  useEffect(() => {
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
