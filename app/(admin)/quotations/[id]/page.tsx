import { notFound } from "next/navigation";
import { getQuotation, listJobsForQuotation } from "@/lib/queries/quotations";
import { getCustomer } from "@/lib/queries/customers";
import { getCurrentUser, isOwner } from "@/lib/queries/profile";
import { QuotationDetailView } from "@/components/quotations/quotation-detail-view";

export const dynamic = "force-dynamic";

export default async function QuotationDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [quotation, user] = await Promise.all([
    getQuotation(id),
    getCurrentUser()
  ]);
  if (!quotation) return notFound();

  // Nomor WA diambil dari master (bukan snapshot) — untuk mengirim ulang,
  // nomor terbaru justru yang dibutuhkan.
  const [customer, jobs] = await Promise.all([
    getCustomer(quotation.customer_id),
    listJobsForQuotation(quotation.id)
  ]);

  return (
    <QuotationDetailView
      quotation={quotation}
      picNoHp={customer?.pic_no_hp ?? null}
      jobs={jobs}
      canDelete={isOwner(user)}
    />
  );
}
