import { listJobUangJalan } from "@/lib/queries/uang-jalan";
import { UangJalanListView } from "@/components/uang-jalan/uang-jalan-list-view";

export const dynamic = "force-dynamic";

export default async function UangJalanPage() {
  const rows = await listJobUangJalan();
  return <UangJalanListView rows={rows} />;
}
