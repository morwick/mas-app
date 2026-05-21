"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/types";

/**
 * Card "Lokasi real-time" di halaman customer tracking.
 *
 * Sumber data: API route /api/tracking/[token] yang scrape TrackSolid
 * getMonitorInfo. Poll tiap 30 detik selama job belum selesai/cancelled.
 *
 * State machine:
 *   loading      → fetch pertama belum balik. Tampilkan spinner.
 *   ok           → ada koordinat. Tampilkan peta Leaflet + marker truk.
 *   no_imei      → unit belum punya IMEI. Fallback ke link-out / pesan.
 *   error        → API gagal beberapa kali berturut. Tampilkan retry CTA.
 *   ended        → job selesai/cancelled atau API kembalikan 410. Stop polling.
 *
 * Leaflet di-load via next/dynamic + ssr:false karena `window` global yang dipakai
 * Leaflet tidak ada di SSR. Marker icon default Leaflet punya path absolute yang
 * pecah di Next.js, jadi MapInner mengoverride dengan icon inline SVG.
 */

const POLL_INTERVAL_MS = 30_000;
const MAX_CONSECUTIVE_ERRORS = 3;

interface Props {
  jobToken: string;
  externalLink: string | null;
  jobStatus: JobStatus;
}

interface LocationData {
  lat: number;
  lng: number;
  address: string | null;
  fetchedAt: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: LocationData }
  | { kind: "no_imei" }
  | { kind: "error"; message: string }
  | { kind: "ended" };

const MapInner = dynamic(() => import("./tracking-map").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <MapPlaceholder text="Memuat peta…" />
});

export function TrackSolidEmbed({ jobToken, externalLink, jobStatus }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const errorCountRef = useRef(0);
  const jobEnded = jobStatus === "selesai" || jobStatus === "cancelled";

  useEffect(() => {
    if (jobEnded) {
      setState({ kind: "ended" });
      return;
    }

    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/tracking/${jobToken}`, {
          cache: "no-store"
        });

        if (cancelled) return;

        if (res.status === 410 || res.status === 404) {
          setState({ kind: "ended" });
          return;
        }

        if (res.status === 422) {
          setState({ kind: "no_imei" });
          return;
        }

        if (!res.ok) {
          errorCountRef.current += 1;
          if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
            setState({
              kind: "error",
              message: "Lokasi GPS belum bisa dimuat. Coba beberapa saat lagi."
            });
          }
          return;
        }

        const data = (await res.json()) as LocationData;
        errorCountRef.current = 0;
        setState({ kind: "ok", data });
      } catch {
        if (cancelled) return;
        errorCountRef.current += 1;
        if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
          setState({
            kind: "error",
            message: "Tidak bisa terhubung ke server. Periksa koneksi internet."
          });
        }
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobToken, jobEnded]);

  if (state.kind === "loading") {
    return <MapPlaceholder text="Memuat peta TrackSolid…" spinner />;
  }

  if (state.kind === "ok") {
    return (
      <div style={{ position: "relative" }}>
        <div className="aspect-video">
          <MapInner
            lat={state.data.lat}
            lng={state.data.lng}
            address={state.data.address}
          />
        </div>
        {state.data.address && (
          <div
            style={{
              padding: "8px 12px",
              fontSize: 11.5,
              color: "var(--text-secondary)",
              background: "white",
              borderTop: "0.5px solid var(--border-default)",
              lineHeight: 1.45
            }}
          >
            <MapPin
              style={{
                width: 12,
                height: 12,
                display: "inline-block",
                marginRight: 4,
                verticalAlign: "-2px",
                color: "var(--brand-primary)"
              }}
            />
            {state.data.address}
          </div>
        )}
      </div>
    );
  }

  // Fallback states semua pakai layout yang sama: pesan + tombol link-out
  return <Fallback state={state} externalLink={externalLink} />;
}

function MapPlaceholder({
  text,
  spinner
}: {
  text: string;
  spinner?: boolean;
}) {
  return (
    <div
      className="aspect-video"
      style={{
        background: "var(--brand-primary-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          background: "white",
          padding: "12px 16px",
          borderRadius: 8
        }}
      >
        {spinner && (
          <div
            style={{
              width: 20,
              height: 20,
              border: "2px solid var(--brand-primary)",
              borderTopColor: "transparent",
              borderRadius: 999,
              animation: "spin 0.8s linear infinite"
            }}
          />
        )}
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
          {text}
        </p>
      </div>
    </div>
  );
}

function Fallback({
  state,
  externalLink
}: {
  state: Exclude<State, { kind: "loading" } | { kind: "ok" }>;
  externalLink: string | null;
}) {
  const messages: Record<typeof state.kind, { title: string; body: string }> = {
    no_imei: {
      title: "Tracking GPS belum tersedia",
      body: "Admin akan menambahkan link tracking sebentar lagi."
    },
    error: {
      title: "Peta tidak bisa dimuat",
      body:
        "message" in state
          ? state.message
          : "Terjadi kesalahan. Coba buka di TrackSolid langsung."
    },
    ended: {
      title: "Pengiriman sudah selesai",
      body: "Tracking real-time tidak aktif lagi."
    }
  };
  const { title, body } = messages[state.kind];

  return (
    <div
      className="aspect-video"
      style={{
        background: "var(--brand-primary-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <MapPin
          style={{
            width: 36,
            height: 36,
            color: "var(--brand-primary)",
            margin: "0 auto"
          }}
        />
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginTop: 8,
            fontWeight: 500
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 4,
            maxWidth: 280,
            margin: "4px auto 0",
            lineHeight: 1.5
          }}
        >
          {body}
        </p>
        {externalLink && state.kind !== "ended" && (
          <a
            href={externalLink}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex"
            style={{ marginTop: 12 }}
          >
            <Button leftIcon={<ExternalLink className="w-4 h-4" />}>
              Buka peta TrackSolid
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
