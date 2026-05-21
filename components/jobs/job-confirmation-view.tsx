"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  MessageCircle,
  Plus
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { Job } from "@/lib/types";

interface Props {
  job: Job;
  driverNama: string;
  driverNoHp: string;
}

export function JobConfirmationView({ job, driverNama, driverNoHp }: Props) {
  const toast = useToast();

  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_APP_URL ?? "");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const shareUrl = `${origin}/track/${job.share_token}`;

  const waText = useMemo(() => {
    const lines = [
      `Halo Pak/Bu ${job.pic_nama ?? job.customer_nama},`,
      "",
      `Berikut link tracking pengiriman ${job.alat_diangkut} dari PT. Mitra Angkutan Sejati:`,
      shareUrl,
      "",
      `Anda bisa cek status & lokasi real-time melalui link tersebut. Driver: ${driverNama} (${driverNoHp}).`,
      "",
      "Terima kasih."
    ];
    return lines.join("\n");
  }, [job, driverNama, driverNoHp, shareUrl]);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  function copy(text: string, key: string, message: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    toast.success(message);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  const waHref = job.pic_no_hp
    ? `https://wa.me/${job.pic_no_hp
        .replace(/^\+?0/, "62")
        .replace(/^\+/, "")}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Success banner */}
      <div
        className="card card-pad-lg"
        style={{
          background: "linear-gradient(135deg, #E8F7E0 0%, #FAFFF6 100%)",
          border: "0.5px solid #B5DFA0",
          padding: 24
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 99,
              background: "var(--brand-primary)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <Check style={{ width: 26, height: 26 }} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              className="h1"
              style={{ color: "var(--brand-primary-dark)", marginBottom: 4 }}
            >
              Job berhasil dibuat
            </div>
            <div
              className="body"
              style={{
                color: "var(--brand-primary-dark)",
                marginBottom: 12
              }}
            >
              Status unit sudah otomatis berubah ke Bertugas. Share link siap
              dikirim ke customer.
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <div
                className="caption"
                style={{ color: "var(--brand-primary-dark)" }}
              >
                Job ID:
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "4px 10px",
                  background: "white",
                  borderRadius: 6,
                  color: "var(--brand-primary-dark)",
                  border: "0.5px solid #B5DFA0"
                }}
              >
                {job.job_number}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        {/* Share link + WhatsApp */}
        <div className="card card-pad-lg">
          <div className="h3" style={{ marginBottom: 4 }}>
            Bagikan ke customer
          </div>
          <div className="caption" style={{ marginBottom: 16 }}>
            Link bisa diakses tanpa login. Auto-expire 24 jam setelah job
            selesai.
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Share link</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                className="input mono"
                value={shareUrl}
                style={{ fontSize: 12.5 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => copy(shareUrl, "link", "Link disalin")}
              >
                <Copy style={{ width: 14, height: 14 }} />
                {copiedKey === "link" ? "Tersalin" : "Copy"}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Template WhatsApp</label>
            <textarea
              readOnly
              className="textarea"
              rows={7}
              value={waText}
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                fontFamily: "var(--font-sans)"
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() =>
                  copy(waText, "wa", "Template WhatsApp disalin")
                }
              >
                <Copy style={{ width: 14, height: 14 }} />
                {copiedKey === "wa" ? "Tersalin" : "Copy template"}
              </button>
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ textDecoration: "none" }}
              >
                <MessageCircle style={{ width: 14, height: 14 }} />
                Buka WhatsApp
              </a>
            </div>
          </div>

          <div className="divider" style={{ margin: "16px 0" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href={`/jobs/${job.id}`}
              className="btn btn-secondary"
              style={{ flex: 1, textDecoration: "none" }}
            >
              Lihat detail job <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
            <Link
              href="/jobs/new"
              className="btn btn-ghost"
              style={{ textDecoration: "none" }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Buat job lagi
            </Link>
          </div>
        </div>

        {/* QR + preview */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div
            className="card card-pad"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Share offline
            </div>
            <div
              style={{
                padding: 12,
                background: "white",
                border: "0.5px solid var(--border-strong)",
                borderRadius: 8
              }}
            >
              <QRCodeSVG value={shareUrl} size={160} fgColor="#1C9600" />
            </div>
            <div
              className="caption"
              style={{ marginTop: 10, textAlign: "center" }}
            >
              Scan QR untuk buka tracking page
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 8 }}
            >
              <Download style={{ width: 13, height: 13 }} />
              Download QR
            </button>
          </div>

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Customer akan melihat
            </div>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 12.5
              }}
            >
              {[
                "Status real-time + progress stepper",
                "Lokasi GPS via TrackSolid",
                "Info driver + tombol WhatsApp",
                "Foto loading & unloading",
                "Info unit & detail pengiriman"
              ].map((t) => (
                <li
                  key={t}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    color: "var(--text-secondary)"
                  }}
                >
                  <Check
                    style={{
                      width: 14,
                      height: 14,
                      color: "var(--brand-primary)",
                      flexShrink: 0,
                      marginTop: 2
                    }}
                    strokeWidth={2.2}
                  />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <Link
        href={`/track/${job.share_token}`}
        target="_blank"
        rel="noreferrer"
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-tertiary)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          justifyContent: "center"
        }}
      >
        Pratinjau halaman customer{" "}
        <ExternalLink style={{ width: 12, height: 12 }} />
      </Link>

      <Eye style={{ display: "none" }} />
    </div>
  );
}
