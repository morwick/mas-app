import { useParams, useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardCheck } from "lucide-react";
import { ApproverView } from "../components/approver-view";
import { PengajuanDetailView } from "../components/pengajuan-detail-view";
import { PengajuanView } from "../components/pengajuan-view";
import type { FiturApproval } from "../api";
import { useMenuApproval, usePengajuan } from "../queries";

export function ApproverPage() {
  return <ApproverView />;
}

/** /approval/:fitur — hanya untuk karyawan yang memegang fitur itu sebagai approver. */
export function PengajuanApprovalPage() {
  const { fitur } = useParams<{ fitur: FiturApproval }>();
  const [searchParams] = useSearchParams();
  const menu = useMenuApproval();
  if (menu.isPending) return <PageLoading />;
  const item = (menu.data ?? []).find((m) => m.kode === fitur);
  if (!item) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Anda bukan approver fitur ini"
        description="Menu Approval hanya untuk karyawan yang ditunjuk di Master → Approver."
      />
    );
  }
  // key: ganti fitur → state (tab, filter, halaman) mulai dari awal.
  return (
    <PengajuanView
      key={item.kode}
      fitur={item.kode}
      namaFitur={item.nama}
      menungguSaya={item.menunggu_saya}
      // Kembali dari halaman detail setelah memutuskan → tab "Menunggu saya".
      tabMenunggu={searchParams.get("tab") === "menunggu"}
    />
  );
}

/**
 * /approval/:fitur/:id — halaman detail satu pengajuan. BATASAN: server hanya
 * mengembalikannya bila sudah sampai giliran pengguna ini (selain itu 404).
 */
export function PengajuanApprovalDetailPage() {
  const { fitur, id } = useParams<{ fitur: FiturApproval; id: string }>();
  const menu = useMenuApproval();
  const pengajuan = usePengajuan(fitur, id);
  if (menu.isPending || pengajuan.isPending) return <PageLoading />;
  const item = (menu.data ?? []).find((m) => m.kode === fitur);
  if (!item) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Anda bukan approver fitur ini"
        description="Menu Approval hanya untuk karyawan yang ditunjuk di Master → Approver."
      />
    );
  }
  if (pengajuan.isError) return <PageError error={pengajuan.error} onRetry={pengajuan.refetch} />;
  return <PengajuanDetailView p={pengajuan.data} namaFitur={item.nama} />;
}
