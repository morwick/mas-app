"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  MapPin,
  MessageCircle,
  Phone,
  ExternalLink,
  Truck,
  Camera,
  RotateCw
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Logo } from "@/components/layout/logo";
import { Lightbox } from "@/components/ui/lightbox";
import { JobStepper } from "@/components/jobs/job-stepper";
import { TrackSolidEmbed } from "@/components/tracking/tracksolid-embed";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { Job } from "@/lib/types";

interface Props {
  job: Job;
  unit: { kode_unit: string; no_polisi: string; jenis: string } | null;
  driver: { nama: string; no_hp: string } | null;
}

export function CustomerTrackingView({ job, unit, driver }: Props) {
  const router = useRouter();

  const loadingPhotos = (job.photos ?? []).filter((p) => p.type === "loading");
  const unloadingPhotos = (job.photos ?? []).filter(
    (p) => p.type === "unloading"
  );

  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);

  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Realtime subscribe + 30s polling fallback
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`track-${job.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${job.id}`
        },
        () => {
          router.refresh();
          setLastUpdate(new Date());
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=eq.${job.id}`
        },
        () => {
          router.refresh();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    const poll = setInterval(() => {
      router.refresh();
      setLastUpdate(new Date());
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [job.id, router]);

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-white border-b border-border sticky top-0 z-20">
        <div className="max-w-[720px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Logo size="sm" />
          <div className="text-right">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider">
              Live tracking
            </p>
            <p className="text-[11px] text-text-muted inline-flex items-center gap-1">
              <RotateCw className="w-3 h-3" />
              update {timeAgo(lastUpdate)}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-4 py-4 flex flex-col gap-4">
        <Card>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-subtle">
                Nomor job
              </p>
              <p className="text-[20px] font-semibold mt-0.5">{job.job_number}</p>
              <p className="text-[13px] text-text mt-1">{job.customer_nama}</p>
            </div>
            <StatusBadge status={job.status} size="md" />
          </div>
        </Card>

        <Card>
          <p className="text-[12px] uppercase tracking-wider text-text-subtle mb-3">
            Progress pengiriman
          </p>
          <div className="hidden sm:block">
            <JobStepper status={job.status} />
          </div>
          <div className="sm:hidden">
            <JobStepper status={job.status} orientation="vertical" />
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-4 pb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] uppercase tracking-wider text-text-subtle">
              Lokasi real-time
            </p>
            {job.tracksolid_share_link && (
              <a
                href={job.tracksolid_share_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-brand-dark hover:underline"
              >
                Buka di tab baru
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <TrackSolidEmbed url={job.tracksolid_share_link} />
        </Card>

        {unit && (
          <Card>
            <p className="text-[12px] uppercase tracking-wider text-text-subtle mb-3">
              Unit yang mengangkut
            </p>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-md bg-brand-light text-brand-dark flex items-center justify-center shrink-0">
                <Truck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold">{unit.kode_unit}</p>
                <p className="text-[12px] text-text-muted">
                  {unit.jenis} · {unit.no_polisi}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <p className="text-[12px] uppercase tracking-wider text-text-subtle mb-3">
            Detail pengiriman
          </p>
          <dl className="grid gap-3 text-[13px]">
            <Row icon={<Truck className="w-4 h-4" />} label="Alat">
              {job.alat_diangkut}
            </Row>
            <Row icon={<MapPin className="w-4 h-4" />} label="Asal">
              {job.asal}
            </Row>
            <Row icon={<MapPin className="w-4 h-4" />} label="Tujuan">
              {job.tujuan}
            </Row>
            <Row icon={<CalendarClock className="w-4 h-4" />} label="Berangkat">
              {formatDateTime(job.etd)}
            </Row>
            {job.eta && (
              <Row icon={<CalendarClock className="w-4 h-4" />} label="Perkiraan tiba">
                {formatDateTime(job.eta)}
              </Row>
            )}
          </dl>
        </Card>

        {driver && (
          <Card>
            <p className="text-[12px] uppercase tracking-wider text-text-subtle mb-3">
              Driver
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-light text-brand-dark flex items-center justify-center font-medium text-[14px] shrink-0">
                {driver.nama
                  .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold">{driver.nama}</p>
                <p className="text-[12px] text-text-muted">{driver.no_hp}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <a href={`tel:${driver.no_hp}`}>
                <Button variant="secondary" fullWidth leftIcon={<Phone className="w-4 h-4" />}>
                  Telepon
                </Button>
              </a>
              <a
                href={`https://wa.me/${driver.no_hp.replace(/^\+?0/, "62")}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button fullWidth leftIcon={<MessageCircle className="w-4 h-4" />}>
                  WhatsApp
                </Button>
              </a>
            </div>
          </Card>
        )}

        {loadingPhotos.length > 0 && (
          <Card>
            <p className="text-[12px] uppercase tracking-wider text-text-subtle mb-3 inline-flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              Foto loading
            </p>
            <div className="grid grid-cols-3 gap-2">
              {loadingPhotos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setLightbox({
                      images: loadingPhotos.map((x) => x.file_url),
                      index: i
                    })
                  }
                  className="aspect-square rounded-md overflow-hidden border border-border bg-page"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.file_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </Card>
        )}

        {unloadingPhotos.length > 0 && (
          <Card>
            <p className="text-[12px] uppercase tracking-wider text-text-subtle mb-3 inline-flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              Foto unloading
            </p>
            <div className="grid grid-cols-3 gap-2">
              {unloadingPhotos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setLightbox({
                      images: unloadingPhotos.map((x) => x.file_url),
                      index: i
                    })
                  }
                  className="aspect-square rounded-md overflow-hidden border border-border bg-page"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.file_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </Card>
        )}

        <footer className="text-center py-6 text-[11px] text-text-subtle">
          <p>PT. Mitra Angkutan Sejati &middot; Layanan angkutan alat berat</p>
          <p className="mt-1">
            Halaman ini akan otomatis tertutup 24 jam setelah pengiriman selesai.
          </p>
        </footer>
      </main>

      <Lightbox
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        images={lightbox?.images ?? []}
        initialIndex={lightbox?.index ?? 0}
      />
    </div>
  );
}

function Row({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-muted mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle">
          {label}
        </p>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  );
}
