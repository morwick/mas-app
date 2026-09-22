"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import {
  KIND_META,
  severityTokens,
  timeAgo,
  type AppNotification
} from "@/lib/notifications";

interface Props {
  variant?: "desktop" | "mobile";
  /** Dihitung di server tiap render layout — lihat lib/queries/notifications.ts. */
  notifications?: AppNotification[];
}

const STORAGE_KEY = "mas:notif:read-ids";

function readReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function writeReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // diam
  }
}

export function NotificationBell({
  variant = "desktop",
  notifications
}: Props) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const notifs = notifications ?? [];
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // localStorage hanya bisa dibaca setelah komponen ter-mount di browser;
  // membacanya saat render pertama akan berbeda dari hasil render server.
  useEffect(() => {
    setReadIds(readReadIds());
  }, []);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(t) &&
        buttonRef.current &&
        !buttonRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => notifs.filter((n) => !readIds.has(n.id)).length,
    [notifs, readIds]
  );

  const markRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        writeReadIds(next);
        return next;
      });
    },
    []
  );

  const markAllRead = useCallback(() => {
    const next = new Set(notifs.map((n) => n.id));
    setReadIds(next);
    writeReadIds(next);
  }, [notifs]);

  const isMobile = variant === "mobile";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Notifikasi"
        onClick={() => setOpen((v) => !v)}
        className={isMobile ? "btn-ghost" : "btn btn-secondary btn-sm btn-icon"}
        style={
          isMobile
            ? {
                width: 36,
                height: 36,
                borderRadius: 6,
                background: "transparent",
                color: "var(--text-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                border: "none"
              }
            : { position: "relative" }
        }
      >
        <Bell style={{ width: isMobile ? 18 : 16, height: isMobile ? 18 : 16 }} />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} belum dibaca`}
            style={{
              position: "absolute",
              top: isMobile ? 4 : 2,
              right: isMobile ? 4 : 2,
              minWidth: 14,
              height: 14,
              padding: "0 4px",
              borderRadius: 99,
              background: "#c13838",
              color: "white",
              border: "1.5px solid white",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Daftar notifikasi"
          style={
            isMobile
              ? {
                  position: "fixed",
                  top: 56,
                  left: 8,
                  right: 8,
                  zIndex: 40,
                  background: "white",
                  borderRadius: 12,
                  border: "0.5px solid var(--border-default)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  maxHeight: "calc(100vh - 72px)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden"
                }
              : {
                  position: "absolute",
                  top: "calc(var(--topbar-h) - 8px)",
                  right: 24,
                  zIndex: 40,
                  width: 380,
                  maxHeight: "min(560px, calc(100vh - 96px))",
                  background: "white",
                  borderRadius: 12,
                  border: "0.5px solid var(--border-default)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden"
                }
          }
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "0.5px solid var(--border-default)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Notifikasi</div>
              <div
                className="caption"
                style={{ fontSize: 10.5, marginTop: 1 }}
              >
                {unreadCount > 0
                  ? `${unreadCount} belum dibaca`
                  : "Semua sudah dibaca"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="btn-ghost"
                  style={{
                    fontSize: 11.5,
                    padding: "5px 8px",
                    borderRadius: 6,
                    background: "transparent",
                    border: "none",
                    color: "var(--brand-primary-dark)",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <Check style={{ width: 12, height: 12 }} />
                  Tandai semua
                </button>
              )}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "transparent",
                    border: "none",
                    color: "var(--text-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }}
                >
                  <X style={{ width: 16, height: 16 }} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              minHeight: 0
            }}
          >
            {notifs.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  fontSize: 12.5,
                  color: "var(--text-tertiary)"
                }}
              >
                Belum ada notifikasi
              </div>
            ) : (
              notifs.map((n) => (
                <NotificationRow
                  key={n.id}
                  notif={n}
                  isRead={readIds.has(n.id)}
                  onRead={() => {
                    markRead(n.id);
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NotificationRow({
  notif,
  isRead,
  onRead
}: {
  notif: AppNotification;
  isRead: boolean;
  onRead: () => void;
}) {
  const meta = KIND_META[notif.kind];
  const tokens = severityTokens(notif.severity);
  const Icon = meta.icon;

  return (
    <Link
      href={notif.href}
      onClick={onRead}
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        borderBottom: "0.5px solid var(--border-default)",
        textDecoration: "none",
        color: "inherit",
        background: isRead ? "white" : "var(--bg-subtle, #fafafa)",
        position: "relative",
        transition: "background 120ms ease"
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-muted)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = isRead
          ? "white"
          : "var(--bg-subtle, #fafafa)")
      }
    >
      {/* Dot unread */}
      {!isRead && (
        <span
          style={{
            position: "absolute",
            left: 4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 6,
            height: 6,
            borderRadius: 99,
            background: tokens.dot
          }}
        />
      )}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: tokens.bg,
          color: tokens.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginLeft: isRead ? 0 : 6
        }}
      >
        <Icon style={{ width: 15, height: 15 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: isRead ? 500 : 700,
            color: "var(--text-primary)",
            lineHeight: 1.35,
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {notif.title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-secondary)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical"
          }}
        >
          {notif.body}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--text-tertiary)",
            marginTop: 3
          }}
        >
          {timeAgo(notif.createdAt)}
        </div>
      </div>
    </Link>
  );
}
