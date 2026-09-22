import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCustomer, useCustomers } from "@/features/customers/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useUnits } from "@/features/units/queries";
import { useQuotation } from "@/features/quotations/queries";
import { EditJobView } from "../components/edit-job-view";
import { NewJobView, type JobPrefill } from "../components/new-job-view";
import { buildPrefill } from "../quotation-prefill";
import { useJob, useJobs } from "../queries";

export function NewJobPage() {
  const [params] = useSearchParams();
  const quotationId = params.get("quotation") ?? undefined;

  const customers = useCustomers();
  const drivers = useDrivers();
  const units = useUnits();
  const activeJobs = useJobs({ status: "active" });
  const quotation = useQuotation(quotationId);
  // Hanya penawaran yang sudah deal yang boleh naik jadi job. Kalau statusnya
  // lain (atau id-nya ngawur), form dibuka kosong seperti biasa.
  const dealQuotation = quotation.data?.status === "deal" ? quotation.data : undefined;
  const customer = useCustomer(dealQuotation?.customer_id);

  const prefill = useMemo<JobPrefill | undefined>(
    () => (dealQuotation ? buildPrefill(dealQuotation, customer.data ?? null) : undefined),
    [dealQuotation, customer.data]
  );

  const waitingPrefill = !!quotationId && (quotation.isPending || (dealQuotation && customer.isPending));
  if (customers.isPending || drivers.isPending || units.isPending || waitingPrefill)
    return <PageLoading />;
  const error = customers.error ?? drivers.error ?? units.error;
  if (error) return <PageError error={error} />;

  return (
    <NewJobView
      customers={customers.data ?? []}
      drivers={drivers.data ?? []}
      standbyUnits={(units.data ?? []).filter((u) => u.status === "standby")}
      activeJobs={activeJobs.data ?? []}
      prefill={prefill}
    />
  );
}

export function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const job = useJob(id);
  const customers = useCustomers(true);
  const drivers = useDrivers(true);
  const units = useUnits(true);
  const activeJobs = useJobs({ status: "active" });

  if (job.isPending || customers.isPending || drivers.isPending || units.isPending)
    return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  const error = customers.error ?? drivers.error ?? units.error;
  if (error) return <PageError error={error} />;

  return (
    <EditJobView
      job={job.data}
      customers={customers.data ?? []}
      drivers={drivers.data ?? []}
      units={units.data ?? []}
      activeJobs={activeJobs.data ?? []}
    />
  );
}
