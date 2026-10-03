import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { VendorForm } from "../components/vendor-form";
import { useVendor } from "../queries";

export function NewVendorPage() {
  return <VendorForm mode="new" />;
}

export function EditVendorPage() {
  const { id } = useParams<{ id: string }>();
  const q = useVendor(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <VendorForm mode="edit" initial={q.data} />;
}
