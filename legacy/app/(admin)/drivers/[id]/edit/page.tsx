import { notFound } from "next/navigation";
import { getDriver } from "@/lib/queries/drivers";
import { DriverForm } from "@/components/drivers/driver-form";

export const dynamic = "force-dynamic";

export default async function EditDriverPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getDriver(id);
  if (!d) return notFound();
  return <DriverForm mode="edit" initial={d} />;
}
