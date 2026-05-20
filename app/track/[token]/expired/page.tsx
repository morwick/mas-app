import { Clock, Phone, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function ExpiredPage() {
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
          <h1 className="text-[20px] font-medium text-text mt-4">
            Link tracking sudah berakhir
          </h1>
          <p className="mt-2 text-[13px] text-text-muted">
            Pengiriman ini telah selesai lebih dari 24 jam yang lalu. Untuk info
            lebih lanjut, silakan hubungi tim kami.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-6">
            <a href="tel:+622112345678">
              <Button variant="secondary" fullWidth leftIcon={<Phone className="w-4 h-4" />}>
                Telepon
              </Button>
            </a>
            <a
              href="https://wa.me/6281234567890"
              target="_blank"
              rel="noreferrer"
            >
              <Button fullWidth leftIcon={<MessageCircle className="w-4 h-4" />}>
                WhatsApp
              </Button>
            </a>
          </div>
        </Card>
        <p className="mt-6 text-center text-[11px] text-text-subtle">
          PT. Mitra Angkutan Sejati
        </p>
      </div>
    </div>
  );
}
