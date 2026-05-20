import Link from "next/link";
import { Search, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <Card className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-brand-light mx-auto flex items-center justify-center">
            <Search className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-[28px] font-semibold text-text mt-4">404</h1>
          <p className="text-[16px] font-medium text-text mt-1">
            Halaman tidak ditemukan
          </p>
          <p className="mt-2 text-[13px] text-text-muted">
            URL yang Anda buka tidak tersedia atau telah dipindahkan.
          </p>
          <Link href="/dashboard" className="inline-flex mt-5">
            <Button leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Kembali ke dashboard
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
