import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import { Clock, Phone, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { ApiError } from "@/lib/api/client";
import { publicTracking } from "@/features/tracking/api";
import { CustomerTrackingView } from "@/features/tracking/components/customer-tracking-view";

export function CustomerTrackingPage() {
  const { token = "" } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ["track", token],
    queryFn: () => publicTracking(token),
    enabled: !!token,
    // Status job disegarkan tanpa realtime: halaman ini dibuka pelanggan
    // sesekali, polling 30 detik sudah cukup.
    refetchInterval: 30_000
  });

  if (q.isPending) return <PageLoading label="Memuat pelacakan…" />;
  if (q.isError) {
    // 410 = token tak dikenal / job sudah selesai → halaman "berakhir", bukan 404.
    if (q.error instanceof ApiError && (q.error.status === 410 || q.error.status === 404))
      return <Navigate to={`/track/${token}/expired`} replace />;
    return <PageError error={q.error} onRetry={q.refetch} />;
  }
  return <CustomerTrackingView job={q.data.job} unit={q.data.unit} driver={q.data.driver} />;
}

export function TrackingExpiredPage() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <Card className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-status-standby-bg mx-auto flex items-center justify-center">
            <Clock className="w-8 h-8 text-status-standby-fg" />
          </div>
          <h1 className="text-[20px] font-medium text-text mt-4">Link tracking sudah berakhir</h1>
          <p className="mt-2 text-[13px] text-text-muted">
            Pengiriman ini telah selesai lebih dari 24 jam yang lalu. Untuk info lebih lanjut,
            silakan hubungi tim kami.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-6">
            <a href="tel:+622112345678">
              <Button variant="secondary" fullWidth leftIcon={<Phone className="w-4 h-4" />}>
                Telepon
              </Button>
            </a>
            <a href="https://wa.me/6281234567890" target="_blank" rel="noreferrer">
              <Button fullWidth leftIcon={<MessageCircle className="w-4 h-4" />}>
                WhatsApp
              </Button>
            </a>
          </div>
        </Card>
        <p className="mt-6 text-center text-[11px] text-text-subtle">PT. Mitra Angkutan Sejati</p>
      </div>
    </div>
  );
}
