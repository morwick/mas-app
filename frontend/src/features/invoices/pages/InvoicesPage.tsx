import { useState } from "react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { useCustomers } from "@/features/customers/queries";
import { InvoicesListView } from "../components/invoices-list-view";
import { JobsSiapTagihView } from "../components/jobs-siap-tagih-view";
import { useInvoices, useJobsBelumDitagih } from "../queries";

type TabKey = "job" | "tagihan";

export function InvoicesPage() {
  const [tab, setTab] = useState<TabKey>("job");
  const jobs = useJobsBelumDitagih();
  const customers = useCustomers(true);
  const invoices = useInvoices();

  const jumlahJobSiapTagih = Object.values(jobs.data ?? {}).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tagihan"
        description="Job selesai yang siap ditagih, dan daftar tagihan yang sudah dibuat."
      />
      <Tabs
        variant="pill"
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          { key: "job", label: "Job siap ditagih", count: jumlahJobSiapTagih },
          { key: "tagihan", label: "Tagihan", count: invoices.data?.length }
        ]}
      />

      {tab === "job" ? (
        jobs.isPending || customers.isPending ? (
          <PageLoading />
        ) : jobs.isError ? (
          <PageError error={jobs.error} onRetry={jobs.refetch} />
        ) : customers.isError ? (
          <PageError error={customers.error} onRetry={customers.refetch} />
        ) : (
          <JobsSiapTagihView jobsPerCustomer={jobs.data ?? {}} customers={customers.data} />
        )
      ) : invoices.isPending ? (
        <PageLoading />
      ) : invoices.isError ? (
        <PageError error={invoices.error} onRetry={invoices.refetch} />
      ) : (
        <InvoicesListView invoices={invoices.data} />
      )}
    </div>
  );
}
