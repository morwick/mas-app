import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCustomer, useCustomers } from "@/features/customers/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useUnits } from "@/features/units/queries";
import { useQuotation } from "@/features/quotations/queries";
import { EditJobView } from "../components/edit-job-view";
import { NewJobView, type JobPrefill } from "../components/new-job-view";
import { buildPrefill, pilihItemDeal } from "../quotation-prefill";
import { useJob, useJobs } from "../queries";

export function NewJobPage() {
  const [params] = useSearchParams();
  const quotationId = params.get("quotation") ?? undefined;
  const itemId = params.get("item");

  const customers = useCustomers();
  const drivers = useDrivers();
  const units = useUnits();
  const activeJobs = useJobs({ status: "active" });
  const quotation = useQuotation(quotationId);
  // Hanya penawaran yang sudah deal yang boleh naik jadi job. Kalau statusnya
  // lain (atau id-nya ngawur), form dibuka kosong seperti biasa.
  const dealQuotation = quotation.data?.status === "deal" ? quotation.data : undefined;
  const customer = useCustomer(dealQuotation?.customer_id);

  // Satu job = satu item penawaran yang deal.
  const item = dealQuotation ? pilihItemDeal(dealQuotation, itemId) : null;
  const prefill = useMemo<JobPrefill | undefined>(
    () => (dealQuotation && item ? buildPrefill(dealQuotation, item, customer.data ?? null) : undefined),
    [dealQuotation, item, customer.data]
  );

  const waitingPrefill = !!quotationId && (quotation.isPending || (dealQuotation && customer.isPending));
  // activeJobs ikut ditunggu: form yang terbuka sebelum daftar job aktif tiba
  // akan memeriksa bentrok terhadap daftar kosong, jadi peringatannya tidak
  // muncul sampai admin menekan simpan.
  if (
    customers.isPending ||
    drivers.isPending ||
    units.isPending ||
    activeJobs.isPending ||
    waitingPrefill
  )
    return <PageLoading />;
  const error = customers.error ?? drivers.error ?? units.error;
  if (error) return <PageError error={error} />;
  if (dealQuotation && !item) {
    return (
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="h3" style={{ marginBottom: 6 }}>
          Pilih item penawaran dulu
        </div>
        <p style={{ marginBottom: 12 }}>
          Job dibuat per item penawaran yang deal. Buka penawaran{" "}
          {dealQuotation.quote_number} lalu klik "Buat job" pada item yang dimaksud.
        </p>
        <Link
          to={`/quotations/${dealQuotation.id}`}
          className="btn btn-secondary btn-sm"
          style={{ textDecoration: "none" }}
        >
          Buka penawaran
        </Link>
      </div>
    );
  }

  return (
    <NewJobView
      customers={customers.data ?? []}
      drivers={drivers.data ?? []}
      standbyUnits={(units.data ?? []).filter((u) => u.status === "standby")}
      activeJobs={activeJobs.data ?? []}
      // Gagalnya daftar job aktif tidak menutup form — job tetap bisa dibuat,
      // tapi admin diberi tahu bahwa peringatan bentrok sedang tidak jalan.
      conflictCheckError={activeJobs.isError}
      onRetryConflictCheck={() => void activeJobs.refetch()}
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

  if (
    job.isPending ||
    customers.isPending ||
    drivers.isPending ||
    units.isPending ||
    activeJobs.isPending
  )
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
      conflictCheckError={activeJobs.isError}
      onRetryConflictCheck={() => void activeJobs.refetch()}
    />
  );
}
