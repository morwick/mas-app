import { Link, useLocation, useParams } from "react-router-dom";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { useCustomers } from "@/features/customers/queries";
import { InvoiceForm } from "../components/invoice-form";
import { alasanTerkunci } from "../lib-terkunci";
import { useInvoice, useJobsBelumDitagih, useNextInvoiceNumber } from "../queries";

/** Dikirim navigasi dari tab "Job siap ditagih" di menu Tagihan. */
interface NewInvoiceNavState {
  customerId?: string;
  jobIds?: string[];
}

export function NewInvoicePage() {
  const location = useLocation();
  const navState = (location.state as NewInvoiceNavState | null) ?? null;
  const user = useCurrentUser();
  const customers = useCustomers();
  const nextNumber = useNextInvoiceNumber();
  const jobsPerCustomer = useJobsBelumDitagih();
  if (customers.isPending || nextNumber.isPending || jobsPerCustomer.isPending)
    return <PageLoading />;
  if (customers.isError) return <PageError error={customers.error} onRetry={customers.refetch} />;
  return (
    <InvoiceForm
      customers={customers.data}
      nextNumber={nextNumber.data ?? ""}
      defaultTtdNama={user.nama}
      jobsPerCustomer={jobsPerCustomer.data ?? {}}
      initialCustomerId={navState?.customerId}
      initialJobIds={navState?.jobIds}
    />
  );
}

export function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const invoice = useInvoice(id);
  const customers = useCustomers(true);
  // Saat edit, customer-nya sudah pasti — cukup job milik dia saja.
  const jobsPerCustomer = useJobsBelumDitagih(invoice.data?.customer_id);
  if (invoice.isPending || customers.isPending) return <PageLoading />;
  if (invoice.isError) return <PageError error={invoice.error} onRetry={invoice.refetch} />;
  if (customers.isError) return <PageError error={customers.error} onRetry={customers.refetch} />;
  // Dibuka lewat URL langsung: tagihan terkunci tidak menampilkan form.
  const terkunci = alasanTerkunci(invoice.data);
  if (terkunci) {
    return (
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="h3" style={{ marginBottom: 6 }}>
          Tagihan {invoice.data.invoice_number} tidak bisa diedit
        </div>
        <p style={{ marginBottom: 12 }}>{terkunci}</p>
        <Link to={`/invoices/${invoice.data.id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
          Kembali ke detail tagihan
        </Link>
      </div>
    );
  }
  return (
    <InvoiceForm
      customers={customers.data}
      invoice={invoice.data}
      defaultTtdNama={user.nama}
      jobsPerCustomer={jobsPerCustomer.data ?? {}}
    />
  );
}
