import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useCustomers } from "@/features/customers/queries";
import { ProyekDetailView } from "../components/proyek-detail-view";
import { ProyekListView } from "../components/proyek-list-view";
import { ProyekPerUnitView } from "../components/proyek-per-unit-view";
import { useProyek } from "../queries";

/** Menu Proyek → Tab Proyek. */
export function ProyekPage() {
  const customers = useCustomers(true);
  return <ProyekListView customers={customers.data ?? []} />;
}

/** Menu Proyek → Tab Proyek per unit. */
export function ProyekPerUnitPage() {
  return <ProyekPerUnitView />;
}

export function ProyekDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Finance (dari tagihan) & operator: hanya melihat, tanpa tombol — sama seperti detail job.
  const role = useCurrentUser().role;
  const proyek = useProyek(id);

  if (proyek.isPending) return <PageLoading />;
  if (proyek.isError) return <PageError error={proyek.error} onRetry={proyek.refetch} />;
  return <ProyekDetailView proyek={proyek.data} hanyaLihat={role === "finance" || role === "operator"} />;
}
