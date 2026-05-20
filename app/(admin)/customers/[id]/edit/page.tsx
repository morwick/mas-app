import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/queries/customers";
import { CustomerForm } from "@/components/customers/customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) return notFound();
  return <CustomerForm mode="edit" initial={c} />;
}
