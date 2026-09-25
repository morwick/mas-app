import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileWarning, HandCoins, Wallet } from "lucide-react";
import { StatCard } from "./stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { formatRupiah } from "@/lib/utils";
import type { FinanceDashboardSummary } from "../api";

interface Props {
  data: FinanceDashboardSummary;
}

export function FinanceDashboardView({ data }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <PageHeader
        title="Dashboard"
        description="Ringkasan piutang dan faktur pajak yang perlu ditindaklanjuti."
      />
      <div className="stat-grid">
        <StatCard
          label="Tagihan belum lunas"
          value={data.tagihan_belum_lunas_jumlah}
          sublabel={formatRupiah(data.tagihan_belum_lunas_nominal)}
          icon={Wallet}
          tone="neutral"
          onClick={() => navigate("/invoices")}
        />
        <StatCard
          label="Sudah jatuh tempo"
          value={data.tagihan_jatuh_tempo_jumlah}
          sublabel={formatRupiah(data.tagihan_jatuh_tempo_nominal)}
          icon={AlertTriangle}
          tone="perbaikan"
          onClick={() => navigate("/piutang")}
        />
        <StatCard
          label="Belum ada faktur pajak"
          value={data.invoice_belum_faktur_pajak_jumlah}
          sublabel="Tagihan terkirim tanpa faktur"
          icon={FileWarning}
          tone="standby"
          onClick={() => navigate("/invoices")}
        />
        <StatCard
          label="Pembayaran bulan ini"
          value={formatRupiah(data.pembayaran_bulan_ini_nominal)}
          sublabel="Total masuk bulan berjalan"
          icon={HandCoins}
          tone="bertugas"
        />
      </div>
    </div>
  );
}
