"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle2,
  Copy,
  MessageCircle,
  ExternalLink,
  Plus,
  Eye
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Job } from "@/lib/types";

interface Props {
  job: Job;
  driverNama: string;
  driverNoHp: string;
}

export function JobConfirmationView({ job, driverNama, driverNoHp }: Props) {
  const toast = useToast();

  const shareUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/track/${job.share_token}`;
    }
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/track/${job.share_token}`;
  }, [job.share_token]);

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
    ? `https://wa.me/${job.pic_no_hp.replace(/^\+?0/, "62").replace(/^\+/, "")}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-full bg-brand-light mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-brand" />
        </div>
        <h1 className="text-h1 mt-3">Job berhasil dibuat</h1>
        <p className="text-[13px] text-text-muted mt-1">
          Salin & kirim share link ke customer Anda.
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-subtle">
              Nomor job
            </p>
            <p className="text-[20px] font-semibold text-text mt-0.5">
              {job.job_number}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Copy className="w-3.5 h-3.5" />}
            onClick={() => copy(job.job_number, "job", "Nomor job disalin")}
          >
            {copiedKey === "job" ? "Tersalin" : "Salin"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Share link customer"
          description="Customer tidak perlu login untuk membuka link ini."
        />
        <div className="flex flex-col gap-3">
          <div className="bg-page rounded-md px-3 py-2.5 border border-border text-[12px] font-mono break-all">
            {shareUrl}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              leftIcon={<Copy className="w-4 h-4" />}
              onClick={() => copy(shareUrl, "link", "Link disalin")}
            >
              {copiedKey === "link" ? "Tersalin" : "Salin link"}
            </Button>
            <a href={waHref} target="_blank" rel="noreferrer">
              <Button
                variant="secondary"
                leftIcon={<MessageCircle className="w-4 h-4" />}
                fullWidth
              >
                Kirim via WhatsApp
              </Button>
            </a>
          </div>
          <button
            type="button"
            onClick={() => copy(waText, "wa", "Template WhatsApp disalin")}
            className="text-left text-[12px] text-brand-dark hover:underline"
          >
            {copiedKey === "wa" ? "Tersalin" : "Salin link + template WhatsApp"}
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="QR code"
          description="Untuk share offline, scan dari HP customer."
        />
        <div className="flex flex-col items-center py-3">
          <div className="p-3 rounded-md border border-border bg-white">
            <QRCodeSVG value={shareUrl} size={160} fgColor="#1C9600" />
          </div>
          <p className="mt-3 text-[11px] text-text-muted">
            Tunjukkan QR ini ke customer untuk akses tracking.
          </p>
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link href={`/jobs/${job.id}`}>
          <Button
            variant="secondary"
            fullWidth
            leftIcon={<Eye className="w-4 h-4" />}
          >
            Lihat detail job
          </Button>
        </Link>
        <Link href="/jobs/new">
          <Button fullWidth leftIcon={<Plus className="w-4 h-4" />}>
            Buat job baru lagi
          </Button>
        </Link>
      </div>

      <Link
        href={`/track/${job.share_token}`}
        target="_blank"
        rel="noreferrer"
        className="text-center text-[12px] text-text-muted hover:text-text inline-flex items-center gap-1 justify-center"
      >
        Pratinjau halaman customer <ExternalLink className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
