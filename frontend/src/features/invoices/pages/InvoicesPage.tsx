import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { useCustomers } from "@/features/customers/queries";
import { InvoicesListView } from "../components/invoices-list-view";
import { kelompokkanPerProyek, ProyekSiapTagihView } from "../components/proyek-siap-tagih-view";
import { useInvoices, useJobsBelumDitagih } from "../queries";

type TabKey = "proyek" | "tagihan";

export function InvoicesPage() {
  // ?tab=tagihan (mis. dari angka omset di Laba tahunan) langsung membuka tab Tagihan.
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(sp.get("tab") === "tagihan" ? "tagihan" : "proyek");
  const jobs = useJobsBelumDitagih();
  const customers = useCustomers(true);
  const invoices = useInvoices();

  // Angka tab = jumlah proyek (beberapa job satu proyek dihitung satu).
  const jumlahProyekSiapTagih = kelompokkanPerProyek(jobs.data ?? {}, {}).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Tagihan"
        description="Proyek yang sudah selesai dan siap ditagih, serta daftar tagihan yang sudah dibuat."
      />
      <Tabs
        variant="pill"
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          { key: "proyek", label: "Proyek siap ditagih", count: jumlahProyekSiapTagih },
          { key: "tagihan", label: "Tagihan", count: invoices.data?.length }
        ]}
      />

      {tab === "proyek" ? (
        jobs.isPending || customers.isPending ? (
          <PageLoading />
        ) : jobs.isError ? (
          <PageError error={jobs.error} onRetry={jobs.refetch} />
        ) : customers.isError ? (
          <PageError error={customers.error} onRetry={customers.refetch} />
        ) : (
          <ProyekSiapTagihView jobsPerCustomer={jobs.data ?? {}} customers={customers.data} />
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
