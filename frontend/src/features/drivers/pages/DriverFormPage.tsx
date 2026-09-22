import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { DriverForm } from "../components/driver-form";
import { useDriver } from "../queries";

export function NewDriverPage() {
  return <DriverForm mode="new" />;
}

export function EditDriverPage() {
  const { id } = useParams<{ id: string }>();
  const q = useDriver(id);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <DriverForm mode="edit" initial={q.data} />;
}
