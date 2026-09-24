import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  /** Overlay tampil selama nilai ini tidak null. */
  message: string | null;
}

/**
 * Popup loading yang menutup seluruh layar selama proses berjalan, supaya
 * user tahu permintaannya sedang diproses dan tidak mengklik tombol lain.
 */
export function LoadingOverlay({ message }: LoadingOverlayProps) {
  if (message === null) return null;
  return (
    <div
      className="fixed inset-0 flex items-center justify-center fade-in"
      style={{ background: "rgba(0,0,0,0.45)", padding: 16, zIndex: 60 }}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
    >
      <div
        className="bg-white flex items-center slide-up"
        style={{
          gap: 12,
          padding: "18px 22px",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          maxWidth: 360
        }}
      >
        <Loader2
          className="animate-spin"
          style={{
            width: 22,
            height: 22,
            color: "var(--brand-primary)",
            flexShrink: 0
          }}
        />
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{message}</p>
          <p className="caption" style={{ marginTop: 2 }}>
            Mohon tunggu, proses sedang dilakukan…
          </p>
        </div>
      </div>
    </div>
  );
}
