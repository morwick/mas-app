import { notFound } from "next/navigation";
import {
  getUnit,
  getUnitStatusHistory
} from "@/lib/queries/units";
import { getJobsByUnit } from "@/lib/queries/jobs";
import { listIncidentsByUnit } from "@/lib/queries/incidents";
import { UnitDetailView } from "@/components/units/unit-detail-view";

export const dynamic = "force-dynamic";

export default async function UnitDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [unit, jobs, history, incidents] = await Promise.all([
    getUnit(id),
    getJobsByUnit(id),
    getUnitStatusHistory(id),
    listIncidentsByUnit(id)
  ]);
  if (!unit) return notFound();
  return (
    <UnitDetailView
      unit={unit}
      jobs={jobs}
      history={history}
      incidents={incidents}
    />
  );
}
