import { Loader2 } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

/** Status muat/gagal yang seragam untuk halaman berbasis query. */
export function PageLoading({ label = "Memuat…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 text-text-muted"
      style={{ padding: 48, fontSize: 13 }}
    >
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

export function PageError({
  error,
  onRetry
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan";
  return (
    <div
      className="flex flex-col items-center text-center gap-3"
      style={{ padding: 48 }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 99,
          background: "var(--status-cancelled-bg)",
          color: "var(--status-cancelled-text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <AlertTriangle style={{ width: 22, height: 22 }} />
      </div>
      <p className="text-[14px] font-medium">Gagal memuat data</p>
      <p className="caption" style={{ maxWidth: 360 }}>
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
