import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/profile";
import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { JenisUnitView } from "@/components/settings/jenis-unit-view";

export const dynamic = "force-dynamic";

export default async function JenisUnitPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/settings");

  const list = await listJenisUnit();
  return <JenisUnitView list={list} />;
}
