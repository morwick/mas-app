"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";

/**
 * Wrapper untuk map card yang nambah tombol full-screen di pojok kanan atas.
 * Saat di-klik, expand jadi fixed inset:0 di atas seluruh viewport.
 * Tombol close (X) atau tombol ESC untuk keluar.
 *
 * Children = isi card (header + map). Tombol overlay di-render via positioned
 * absolute supaya tidak ganggu layout asli.
 */

interface Props {
  children: ReactNode;
}

export function MapFullscreenButton({ children }: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  // ESC keluar full-screen
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  return (
    <div
      style={
        fullscreen
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "white",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }
          : { position: "relative" }
      }
    >
      {children}
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        title={fullscreen ? "Keluar full-screen (Esc)" : "Full-screen"}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 1001,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "white",
          border: "0.5px solid var(--border-default)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "var(--text-primary)"
        }}
      >
        {fullscreen ? (
          <X style={{ width: 16, height: 16 }} />
        ) : (
          <Maximize2 style={{ width: 14, height: 14 }} />
        )}
      </button>
    </div>
  );
}
