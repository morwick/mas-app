import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert, Wifi } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { formatDateTime } from "@/lib/utils";
import { getStatusTrackSolid } from "../api";
import { CaptchaForm } from "../components/captcha-form";

/**
 * Master → Login TrackSolid (superadmin): status sesi TrackSolid dan login
 * ulang dengan captcha. Captcha juga muncul sebagai popup di halaman ber-data
 * TrackSolid bila sesinya tidak valid. Captcha tidak dibaca otomatis.
 */
export function TrackSolidLoginPage() {
  const status = useQuery({ queryKey: ["tracksolid", "status"], queryFn: getStatusTrackSolid });

  if (status.isPending) return <PageLoading />;
  if (status.isError) return <PageError error={status.error} onRetry={status.refetch} />;
  const s = status.data;

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 560 }}>
      <PageHeader
        title="Login TrackSolid"
        description="Koneksi ke TrackSolid untuk lokasi GPS & jarak tempuh unit. Sesi login disimpan dan dipakai semua pengguna; bila tidak valid, ketik kode captcha di sini."
      />

      <div className="card card-pad flex items-start" style={{ gap: 12 }}>
        {s.perlu_captcha ? (
          <ShieldAlert style={{ width: 22, height: 22, color: "var(--status-cancelled-text)", flexShrink: 0 }} />
        ) : s.tersambung ? (
          <CheckCircle2 style={{ width: 22, height: 22, color: "var(--status-selesai-text)", flexShrink: 0 }} />
        ) : (
          <Wifi style={{ width: 22, height: 22, color: "var(--text-tertiary)", flexShrink: 0 }} />
        )}
        <div>
          <p style={{ fontWeight: 600 }}>
            {s.perlu_captcha
              ? "Terputus — butuh captcha"
              : s.tersambung
                ? "Tersambung"
                : "Belum ada sesi — login otomatis dicoba saat lokasi pertama diminta"}
          </p>
          {s.perlu_captcha && s.perlu_captcha_at && (
            <p className="caption">
              Sejak {formatDateTime(s.perlu_captcha_at)}. Lokasi & jarak tempuh GPS berhenti diperbarui.
            </p>
          )}
          {s.diperbarui_at && (
            <p className="caption">
              Login terakhir {formatDateTime(s.diperbarui_at)} oleh {s.diperbarui_oleh_nama ?? "sistem (otomatis)"}.
            </p>
          )}
        </div>
      </div>

      <div className="card card-pad flex flex-col" style={{ gap: 12 }}>
        <p style={{ fontWeight: 600 }}>Login dengan captcha</p>
        <CaptchaForm otomatis={s.perlu_captcha} />
      </div>
    </div>
  );
}
