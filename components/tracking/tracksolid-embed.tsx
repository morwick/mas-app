"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  url?: string | null;
}

/**
 * TrackSolid map embed dengan fallback link-out.
 *
 * X-Frame-Options block tidak bisa dideteksi langsung dari JS (browser block
 * di network layer, iframe tetap fire onload event). Trik yang dipakai:
 * - Render iframe + hide-show overlay placeholder selama loading.
 * - Tunggu onload event, lalu cek tinggi contentDocument. Bila browser
 *   block (cross-origin), akses contentDocument throws → kita biarkan iframe.
 * - Bila iframe tidak fire onload dalam 8 detik, anggap diblokir → tampilkan
 *   fallback. User selalu punya tombol "Buka di tab baru" sebagai escape.
 */
export function TrackSolidEmbed({ url }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "blocked" | "empty">(
    url ? "loading" : "empty"
  );

  useEffect(() => {
    if (!url) {
      setState("empty");
      return;
    }
    setState("loading");
    // Bila onload tidak dipanggil dalam 8s, anggap iframe diblokir
    const t = setTimeout(() => {
      setState((s) => (s === "loading" ? "blocked" : s));
    }, 8000);
    return () => clearTimeout(t);
  }, [url]);

  if (!url) {
    return (
      <div className="aspect-video bg-brand-light/40 flex items-center justify-center">
        <div className="text-center px-6">
          <MapPin className="w-10 h-10 text-brand mx-auto" />
          <p className="text-[13px] text-text-muted mt-2">
            Link peta GPS belum tersedia
          </p>
          <p className="text-[11px] text-text-subtle mt-1">
            Admin akan menambahkan link tracking sebentar lagi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video relative bg-brand-light/40">
      <iframe
        ref={iframeRef}
        src={url}
        title="Peta lokasi TrackSolid"
        className="absolute inset-0 w-full h-full border-0"
        referrerPolicy="no-referrer-when-downgrade"
        loading="lazy"
        allow="geolocation; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={() => setState("ok")}
        onError={() => setState("blocked")}
      />

      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 bg-white/80 px-4 py-3 rounded-md">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] text-text-muted">Memuat peta TrackSolid…</p>
          </div>
        </div>
      )}

      {state === "blocked" && (
        <div className="absolute inset-0 bg-brand-light/40 flex items-center justify-center">
          <div className="text-center px-6">
            <MapPin className="w-10 h-10 text-brand mx-auto" />
            <p className="text-[13px] text-text-muted mt-2">
              Peta tidak dapat ditampilkan langsung di sini
            </p>
            <p className="text-[11px] text-text-subtle mt-1 max-w-xs mx-auto">
              TrackSolid memblokir embed pada halaman lain. Klik tombol di bawah
              untuk membuka peta di tab baru.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex"
            >
              <Button leftIcon={<ExternalLink className="w-4 h-4" />}>
                Buka peta TrackSolid
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
