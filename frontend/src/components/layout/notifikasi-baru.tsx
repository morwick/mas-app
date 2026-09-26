import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { KIND_META, severityTokens, type AppNotification } from "@/lib/notifications";
import { useNotificationReadState } from "@/features/notifications/read-state";

/** Popup hilang sendiri setelah sekian detik (kecuali disorot kursor). */
const DURASI_MS = 8000;
/** Paling banyak sekian popup sekaligus; sisanya dirangkum satu popup. */
const MAKS_TAMPIL = 3;

/**
 * Popup melayang (pojok kanan atas) saat ada notifikasi BARU masuk — yang
 * belum ada ketika halaman dibuka. Notifikasi lama / yang sudah dibaca tidak
 * dimunculkan. Klik → buka halaman terkait & tandai dibaca.
 */
export function NotifikasiBaru({ notifications }: { notifications: AppNotification[] | undefined }) {
  const navigate = useNavigate();
  const { isRead, mark } = useNotificationReadState();
  // null = data pertama belum datang; setelah itu berisi semua id yang sudah dikenal.
  const dikenal = useRef<Set<string> | null>(null);
  const [{ tampil, lainnya }, setAntrean] = useState<{ tampil: AppNotification[]; lainnya: number }>({
    tampil: [],
    lainnya: 0
  });

  useEffect(() => {
    if (!notifications) return;
    if (dikenal.current === null) {
      // Muatan pertama: semua dianggap lama — tidak ada popup saat halaman dibuka.
      dikenal.current = new Set(notifications.map((n) => n.id));
      return;
    }
    const baru = notifications.filter((n) => !dikenal.current!.has(n.id) && !isRead(n));
    for (const n of notifications) dikenal.current.add(n.id);
    if (baru.length === 0) return;
    setAntrean((a) => {
      const gabung = [...baru, ...a.tampil];
      return {
        tampil: gabung.slice(0, MAKS_TAMPIL),
        lainnya: a.lainnya + Math.max(0, gabung.length - MAKS_TAMPIL)
      };
    });
  }, [notifications, isRead]);

  function tutup(id: string) {
    setAntrean((a) => ({ ...a, tampil: a.tampil.filter((n) => n.id !== id) }));
  }

  function buka(n: AppNotification) {
    mark([n]);
    tutup(n.id);
    navigate(n.href);
  }

  if (tampil.length === 0 && lainnya === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(360px, calc(100vw - 32px))"
      }}
    >
      {tampil.map((n) => (
        <Popup key={n.id} n={n} onBuka={() => buka(n)} onTutup={() => tutup(n.id)} />
      ))}
      {lainnya > 0 && (
        <div
          className="notif-baru-masuk"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#1F2937",
            color: "white",
            fontSize: 12.5,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
          }}
        >
          <Bell style={{ width: 15, height: 15 }} />
          <span style={{ flex: 1 }}>+{lainnya} notifikasi baru lainnya — cek lonceng.</span>
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => setAntrean((a) => ({ ...a, lainnya: 0 }))}
            style={{ background: "none", border: 0, color: "white", cursor: "pointer", display: "inline-flex" }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      )}
      <style>{`
        @keyframes notif-baru-masuk {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .notif-baru-masuk { animation: notif-baru-masuk 220ms ease-out; }
      `}</style>
    </div>
  );
}

function Popup({ n, onBuka, onTutup }: { n: AppNotification; onBuka: () => void; onTutup: () => void }) {
  const [disorot, setDisorot] = useState(false);
  const meta = KIND_META[n.kind];
  const Ikon = meta?.icon ?? Bell;
  const nada = severityTokens(n.severity);
  // Ref supaya timer tidak ter-reset tiap induknya render ulang.
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;

  useEffect(() => {
    if (disorot) return;
    const t = window.setTimeout(() => tutupRef.current(), DURASI_MS);
    return () => window.clearTimeout(t);
  }, [disorot]);

  return (
    <div
      role="alert"
      className="notif-baru-masuk"
      onMouseEnter={() => setDisorot(true)}
      onMouseLeave={() => setDisorot(false)}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 12px 12px 14px",
        borderRadius: 12,
        background: "white",
        border: "1px solid var(--border-default)",
        borderLeft: `4px solid ${nada.dot}`,
        boxShadow: "0 10px 28px rgba(0,0,0,0.16)"
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 99,
          background: nada.dot,
          color: "white",
          flexShrink: 0
        }}
      >
        <Ikon style={{ width: 16, height: 16 }} />
      </span>
      <button
        type="button"
        onClick={onBuka}
        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer" }}
      >
        <div className="caption" style={{ color: nada.fg, fontWeight: 700 }}>
          Notifikasi baru{meta ? ` · ${meta.label}` : ""}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>{n.title}</div>
        <div className="caption" style={{ color: "var(--text-secondary)", lineHeight: 1.35 }}>
          {n.body}
        </div>
      </button>
      <button
        type="button"
        aria-label="Tutup notifikasi"
        onClick={onTutup}
        style={{
          background: "none",
          border: 0,
          padding: 2,
          cursor: "pointer",
          color: "var(--text-tertiary)",
          display: "inline-flex"
        }}
      >
        <X style={{ width: 15, height: 15 }} />
      </button>
    </div>
  );
}
