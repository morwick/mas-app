import { useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useJenisUnit } from "@/features/settings/queries";
import { useDrivers } from "@/features/drivers/queries";
import { UnitForm } from "../components/unit-form";
import { useDriverAssignments, useUnit } from "../queries";

function useFormDeps() {
  const jenis = useJenisUnit();
  const drivers = useDrivers();
  const assignments = useDriverAssignments();
  return {
    isPending: jenis.isPending || drivers.isPending || assignments.isPending,
    error: jenis.error ?? drivers.error ?? assignments.error,
    jenis: jenis.data ?? [],
    drivers: drivers.data ?? [],
    assignments: assignments.data ?? {}
  };
}

export function NewUnitPage() {
  const deps = useFormDeps();
  if (deps.isPending) return <PageLoading />;
  if (deps.error) return <PageError error={deps.error} />;
  return (
    <UnitForm
      mode="new"
      jenisUnitList={deps.jenis}
      drivers={deps.drivers}
      driverAssignments={deps.assignments}
    />
  );
}

export function EditUnitPage() {
  const { id } = useParams<{ id: string }>();
  const unit = useUnit(id);
  const deps = useFormDeps();
  if (unit.isPending || deps.isPending) return <PageLoading />;
  if (unit.isError) return <PageError error={unit.error} onRetry={unit.refetch} />;
  if (deps.error) return <PageError error={deps.error} />;
  return (
    <UnitForm
      mode="edit"
      initial={unit.data}
      jenisUnitList={deps.jenis}
      drivers={deps.drivers}
      driverAssignments={deps.assignments}
    />
  );
}
