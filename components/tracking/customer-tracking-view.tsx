"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Camera,
  Clock,
  ExternalLink,
  Flag,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  Truck
} from "lucide-react";
import { Lightbox } from "@/components/ui/lightbox";
import { JobStepper } from "@/components/jobs/job-stepper";
import { TrackSolidEmbed } from "@/components/tracking/tracksolid-embed";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { Job, JobStatus } from "@/lib/types";

interface Props {
  job: Job;
  unit: {
    kode_unit: string;
    no_polisi: string;
    jenis: string;
    tracksolid_share_link: string | null;
  } | null;
  driver: { nama: string; no_hp: string } | null;
}

type StatusInfo = { title: string; body: string; color: string; bg: string };

const STATUS_INFO: Record<JobStatus, StatusInfo> = {
  menunggu_pickup: {
    title: "Menunggu pickup",
    body: "Driver dalam perjalanan menuju lokasi pickup.",
    color: "var(--status-pickup-text)",
    bg: "var(--status-pickup-bg)"
  },
  loading: {
    title: "Sedang loading",
    body: "Alat sedang dinaikkan ke unit di lokasi asal.",
    color: "#8a5a00",
    bg: "#fff4e0"
  },
  dalam_perjalanan: {
    title: "Dalam perjalanan",
    body: "Unit menuju lokasi tujuan. Pantau lokasi real-time di peta.",
    color: "var(--brand-primary-dark)",
    bg: "var(--brand-primary-light)"
  },
  unloading: {
    title: "Sedang unloading",
    body: "Tiba di tujuan, alat sedang diturunkan.",
    color: "#4a2bb0",
    bg: "#efeafe"
  },
  selesai: {
    title: "Pengiriman selesai",
    body: "Alat sudah diturunkan di lokasi tujuan.",
    color: "var(--brand-primary-dark)",
    bg: "var(--brand-primary-light)"
  },
  cancelled: {
    title: "Pengiriman dibatalkan",
    body: "Pengiriman ini telah dibatalkan oleh admin.",
    color: "#791f1f",
    bg: "#fcebeb"
  }
};

function driverInitials(nama: string) {
  return nama
    .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

export function CustomerTrackingView({ job, unit, driver }: Props) {
  const router = useRouter();
  const si = STATUS_INFO[job.status] ?? STATUS_INFO.menunggu_pickup;
  const loadingPhotos = (job.photos ?? []).filter((p) => p.type === "loading");
  const unloadingPhotos = (job.photos ?? []).filter(
    (p) => p.type === "unloading"
  );

  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);

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
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=eq.${job.id}`
        },
        () => router.refresh()
      )
      .subscribe();

    const poll = setInterval(() => router.refresh(), 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [job.id, router]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      {/* Top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "white",
          borderBottom: "0.5px solid var(--border-default)"
        }}
      >
        <div
          className="mx-auto"
          style={{
            maxWidth: 720,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div className="mas-mark">
            <div
              className="mas-mark-icon"
              style={{ width: 26, height: 26, fontSize: 10 }}
            >
              MAS
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>
                MAS Tracking
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                Mitra Angkutan Sejati
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              background: "var(--brand-primary-light)",
              borderRadius: 99,
              fontSize: 10,
              fontWeight: 600,
              color: "var(--brand-primary-dark)"
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: "var(--brand-primary)",
                animation: "pulse 1.5s infinite"
              }}
            />
            LIVE
          </div>
        </div>
      </div>

      <main
        className="mx-auto"
        style={{
          maxWidth: 720,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        {/* Hero status card */}
        <div
          style={{
            padding: 16,
            background: `linear-gradient(135deg, ${si.bg} 0%, white 100%)`,
            border: `0.5px solid ${si.color}33`,
            borderRadius: 14
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)"
              }}
            >
              {job.job_number}
            </span>
            <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>·</span>
            <span className="caption" style={{ fontSize: 11 }}>
              {job.customer_nama}
            </span>
          </div>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: si.color,
              marginBottom: 4,
              letterSpacing: "-0.005em"
            }}
          >
            {si.title}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              lineHeight: 1.5
            }}
          >
            {si.body}
          </div>
          {job.eta && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "white",
                borderRadius: 10,
                border: `0.5px solid ${si.color}22`,
                display: "flex",
                alignItems: "center",
                gap: 10
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: si.bg,
                  color: si.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Clock style={{ width: 18, height: 18 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  className="caption"
                  style={{ fontSize: 10.5, marginBottom: 2 }}
                >
                  Estimasi tiba
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 14, fontWeight: 700 }}
                >
                  {formatDateTime(job.eta)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Progress stepper */}
        <div
          style={{
            padding: 16,
            background: "white",
            borderRadius: 14,
            border: "0.5px solid var(--border-default)"
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Progress pengiriman
          </div>
          <JobStepper status={job.status} />
        </div>

        {/* Map */}
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: "0.5px solid var(--border-default)",
            background: "white"
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "0.5px solid var(--border-default)"
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Lokasi real-time
              </div>
              <div className="caption" style={{ fontSize: 10.5 }}>
                TrackSolid · update tiap 30 detik
              </div>
            </div>
            {unit?.tracksolid_share_link && (
              <a
                href={unit.tracksolid_share_link}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm"
                style={{ textDecoration: "none" }}
              >
                Buka peta <ArrowUpRight style={{ width: 11, height: 11 }} />
              </a>
            )}
          </div>
          <TrackSolidEmbed
            jobToken={job.share_token}
            externalLink={unit?.tracksolid_share_link ?? null}
            jobStatus={job.status}
            route={
              job.asal_lat != null &&
              job.asal_lng != null &&
              job.tujuan_lat != null &&
              job.tujuan_lng != null
                ? {
                    asal: { lat: job.asal_lat, lng: job.asal_lng },
                    tujuan: { lat: job.tujuan_lat, lng: job.tujuan_lng },
                    polyline: job.route_polyline ?? null,
                    distance_km: job.route_distance_km ?? null
                  }
                : null
            }
          />
        </div>

        {/* Unit & alat */}
        {unit && (
          <div
            style={{
              padding: 14,
              background: "white",
              borderRadius: 14,
              border: "0.5px solid var(--border-default)"
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Unit &amp; alat
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                paddingBottom: 12,
                borderBottom: "0.5px solid var(--border-default)",
                marginBottom: 12
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "var(--brand-primary-light)",
                  color: "var(--brand-primary-dark)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Truck style={{ width: 22, height: 22 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 2
                  }}
                >
                  {unit.kode_unit} · {unit.jenis}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-tertiary)"
                  }}
                >
                  {unit.no_polisi}
                </div>
              </div>
            </div>
            <CustField
              icon={<Receipt style={{ width: 14, height: 14 }} />}
              label="Alat yang diangkut"
              value={job.alat_diangkut}
            />
            <CustField
              icon={<MapPin style={{ width: 14, height: 14 }} />}
              label="Lokasi asal"
              value={job.asal}
            />
            <CustField
              icon={<Flag style={{ width: 14, height: 14 }} />}
              label="Lokasi tujuan"
              value={job.tujuan}
            />
          </div>
        )}

        {/* Driver */}
        {driver && (
          <div
            style={{
              padding: 14,
              background: "white",
              borderRadius: 14,
              border: "0.5px solid var(--border-default)"
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Driver yang bertugas
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 99,
                  background: "var(--brand-primary)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0
                }}
              >
                {driverInitials(driver.nama)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {driver.nama}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-tertiary)"
                  }}
                >
                  {driver.no_hp}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <a
                href={`https://wa.me/${driver.no_hp.replace(/^\+?0/, "62")}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  background: "#25D366",
                  color: "white",
                  border: "none",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  textDecoration: "none"
                }}
              >
                <MessageCircle style={{ width: 14, height: 14 }} />
                WhatsApp driver
              </a>
              <a
                href={`tel:${driver.no_hp}`}
                style={{
                  flex: 1,
                  background: "white",
                  color: "var(--text-primary)",
                  border: "0.5px solid var(--border-strong)",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  textDecoration: "none"
                }}
              >
                <Phone style={{ width: 14, height: 14 }} />
                Telepon
              </a>
            </div>
          </div>
        )}

        {/* Photos */}
        {(loadingPhotos.length > 0 || unloadingPhotos.length > 0) && (
          <div
            style={{
              padding: 14,
              background: "white",
              borderRadius: 14,
              border: "0.5px solid var(--border-default)"
            }}
          >
            <div
              className="eyebrow"
              style={{
                marginBottom: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Camera style={{ width: 12, height: 12 }} />
              Dokumentasi
            </div>
            {([
              ["loading", "Saat loading", loadingPhotos],
              ["unloading", "Saat unloading", unloadingPhotos]
            ] as const).map(([key, label, photos]) => {
              if (photos.length === 0) return null;
              const urls = photos.map((p) => p.file_url);
              return (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      marginBottom: 6,
                      color: "var(--text-secondary)"
                    }}
                  >
                    {label}
                  </div>
                  <div
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                  >
                    {photos.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setLightbox({ images: urls, index: i })}
                        style={{
                          aspectRatio: "1",
                          borderRadius: 8,
                          overflow: "hidden",
                          border: "0.5px solid var(--border-default)",
                          padding: 0,
                          background: "var(--bg-page)",
                          cursor: "pointer"
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.file_url}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block"
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: 14,
            background: "white",
            borderRadius: 14,
            border: "0.5px solid var(--border-default)",
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5
          }}
        >
          Pertanyaan tentang pengiriman?
          <br />
          <strong style={{ color: "var(--text-primary)" }}>
            (021) 8888-2026
          </strong>{" "}
          · admin@mas.co.id
        </div>

        <div
          style={{
            textAlign: "center",
            padding: "4px 0 24px",
            fontSize: 10,
            color: "var(--text-tertiary)"
          }}
        >
          Powered by <strong>MAS Fleet Operations</strong>
        </div>
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

function CustField({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "8px 0"
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "var(--bg-subtle)",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="caption" style={{ fontSize: 10.5, marginBottom: 2 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--text-primary)"
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// Keep unused import lint happy
void ExternalLink;
