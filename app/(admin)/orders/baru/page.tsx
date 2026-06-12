import { listCustomers } from "@/lib/queries/customers";
import { listDrivers } from "@/lib/queries/drivers";
import { listUnits } from "@/lib/queries/units";
import { listJobs } from "@/lib/queries/jobs";
import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { OrderWizardView } from "@/components/orders/order-wizard-view";

export const dynamic = "force-dynamic";

export default async function NewOrderWizardPage() {
  const [customers, drivers, units, activeJobs, jenisUnit] = await Promise.all([
    listCustomers(),
    listDrivers(),
    listUnits(),
    listJobs({ status: "active" }),
    listJenisUnit()
  ]);
  return (
    <OrderWizardView
      customers={customers}
      drivers={drivers}
      standbyUnits={units.filter((u) => u.status === "standby")}
      jenisUnit={jenisUnit}
      activeJobs={activeJobs}
    />
  );
}
