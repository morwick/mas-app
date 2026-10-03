import { useMemo } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCustomer, useCustomers } from "@/features/customers/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useJobs } from "@/features/jobs/queries";
import { buildPrefill, pilihItemDeal, type JobPrefill } from "@/features/jobs/quotation-prefill";
import { useQuotation } from "@/features/quotations/queries";
import { useUnits } from "@/features/units/queries";
import { ProyekFormView } from "../components/proyek-form-view";
import { useProyek } from "../queries";

/** Data yang dibutuhkan semua form proyek (master + job aktif untuk cek bentrok). */
function useDataForm() {
  const customers = useCustomers();
  const drivers = useDrivers();
  const units = useUnits();
  // Job aktif ikut ditunggu: form yang terbuka sebelum daftar ini tiba akan
  // memeriksa bentrok terhadap daftar kosong.
  const activeJobs = useJobs({ status: "active" });
  const pending = customers.isPending || drivers.isPending || units.isPending || activeJobs.isPending;
  const error = customers.error ?? drivers.error ?? units.error;
  return { customers, drivers, units, activeJobs, pending, error };
}

/**
 * Proyek baru + job-jobnya. `?quotation=<id>&item=<id>` = dibuka dari item
 * penawaran yang deal (customer, PIC, alat, dan rute terisi). Alamat lama
 * `?proyek=<id>` (tambah job) diarahkan ke form edit proyek itu.
 */
export function NewProyekPage() {
  const [params] = useSearchParams();
  const proyekLama = params.get("proyek");
  const quotationId = params.get("quotation") ?? undefined;
  const itemId = params.get("item");
  // Unit dipilih di tombol "Buat / Gabung Proyek" pada item penawaran.
  const unitId = params.get("unit") ?? undefined;
  const data = useDataForm();
  const quotation = useQuotation(quotationId);
  // Hanya penawaran yang punya item deal yang boleh naik jadi job.
  const dealQuotation = quotation.data?.items?.some((it) => it.keputusan === "deal") ? quotation.data : undefined;
  const customer = useCustomer(dealQuotation?.customer_id);
  const item = dealQuotation ? pilihItemDeal(dealQuotation, itemId) : null;
  const prefill = useMemo<JobPrefill | undefined>(
    () => (dealQuotation && item ? buildPrefill(dealQuotation, item, customer.data ?? null) : undefined),
    [dealQuotation, item, customer.data]
  );

  if (proyekLama) return <Navigate to={`/proyek/${proyekLama}/tambah-job`} replace />;
  const waitingPrefill = !!quotationId && (quotation.isPending || (dealQuotation && customer.isPending));
  if (data.pending || waitingPrefill) return <PageLoading />;
  if (data.error) return <PageError error={data.error} />;
  if (dealQuotation && !item) {
    return (
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="h3" style={{ marginBottom: 6 }}>
          Pilih item penawaran dulu
        </div>
        <p style={{ marginBottom: 12 }}>
          Job dibuat per item penawaran yang deal. Buka penawaran {dealQuotation.quote_number} lalu klik "Buat
          job" pada item yang dimaksud.
        </p>
        <Link to={`/quotations/${dealQuotation.id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
          Buka penawaran
        </Link>
      </div>
    );
  }

  return (
    <ProyekFormView
      customers={data.customers.data ?? []}
      drivers={data.drivers.data ?? []}
      units={data.units.data ?? []}
      activeJobs={data.activeJobs.data ?? []}
      // Gagalnya daftar job aktif tidak menutup form — admin diberi tahu bahwa
      // peringatan bentrok sedang tidak jalan (server tetap memeriksa).
      conflictCheckError={data.activeJobs.isError}
      onRetryConflictCheck={() => void data.activeJobs.refetch()}
      prefill={prefill}
      unitAwal={unitId}
      penawaran={dealQuotation}
    />
  );
}

/**
 * Edit proyek: hanya PIC lapangan. Tautan lama `?tambah=1` dialihkan ke
 * halaman "Tambah job ke proyek" (parameter lain ikut dibawa).
 */
export function EditProyekPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  if (params.get("tambah") === "1") {
    const sisa = new URLSearchParams(params);
    sisa.delete("tambah");
    const qs = sisa.toString();
    return <Navigate to={`/proyek/${id}/tambah-job${qs ? `?${qs}` : ""}`} replace />;
  }
  return <FormProyekAda tambahJob={false} />;
}

/** Tambah job ke proyek yang sudah ada: data proyek hanya dilihat. */
export function TambahJobProyekPage() {
  return <FormProyekAda tambahJob />;
}

function FormProyekAda({ tambahJob }: { tambahJob: boolean }) {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const proyek = useProyek(id);
  const data = useDataForm();
  // Proyek dari penawaran: job baru wajib dari item deal penawaran yang sama.
  const quotationId =
    params.get("quotation") ?? proyek.data?.jobs.find((j) => j.quotation_id)?.quotation_id ?? undefined;
  const quotation = useQuotation(quotationId);
  const itemId = params.get("item");
  const item = quotation.data && itemId ? pilihItemDeal(quotation.data, itemId) : null;
  const prefill = useMemo<JobPrefill | undefined>(
    () => (quotation.data && item ? buildPrefill(quotation.data, item, null) : undefined),
    [quotation.data, item]
  );

  if (proyek.isPending || data.pending || (!!quotationId && quotation.isPending)) return <PageLoading />;
  if (proyek.isError) return <PageError error={proyek.error} onRetry={proyek.refetch} />;
  if (data.error) return <PageError error={data.error} />;
  // BATASAN: proyek yang sudah masuk tagihan aktif tidak bisa ditambah job.
  if (tambahJob && proyek.data.invoice_id) {
    return (
      <PageError
        error={
          new Error(
            `Proyek ${proyek.data.nomor_proyek} sudah masuk tagihan ${proyek.data.invoice_number ?? ""} — tidak bisa menambah job. Batalkan tagihannya dulu bila job perlu ditambah.`
          )
        }
      />
    );
  }
  return (
    <ProyekFormView
      // Form dibuat ulang bila proyek lain dibuka tanpa pindah halaman.
      key={proyek.data.id}
      proyek={proyek.data}
      customers={data.customers.data ?? []}
      drivers={data.drivers.data ?? []}
      units={data.units.data ?? []}
      activeJobs={data.activeJobs.data ?? []}
      conflictCheckError={data.activeJobs.isError}
      onRetryConflictCheck={() => void data.activeJobs.refetch()}
      tambahJob={tambahJob}
      unitAwal={params.get("unit") ?? undefined}
      penawaran={quotation.data}
      prefill={prefill}
    />
  );
}
