import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCustomer } from "@/features/customers/queries";
import { QuotationDetailView } from "../components/quotation-detail-view";
import { useQuotation, useQuotationJobs } from "../queries";

export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isOwner } = useAuth();
  const quotation = useQuotation(id);
  // Nomor WA diambil dari master (bukan snapshot) — untuk mengirim ulang,
  // nomor terbaru justru yang dibutuhkan.
  const customer = useCustomer(quotation.data?.customer_id);
  const jobs = useQuotationJobs(id);
  if (quotation.isPending) return <PageLoading />;
  if (quotation.isError) return <PageError error={quotation.error} onRetry={quotation.refetch} />;
  return (
    <QuotationDetailView
      quotation={quotation.data}
      picNoHp={customer.data?.pic_no_hp ?? null}
      jobs={jobs.data ?? []}
      canDelete={isOwner}
    />
  );
}
