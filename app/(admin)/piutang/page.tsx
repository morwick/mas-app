import { getPiutangSummary, listInvoices } from "@/lib/queries/invoices";
import { PiutangView } from "@/components/invoices/piutang-view";

export const dynamic = "force-dynamic";

export default async function PiutangPage() {
  const [summary, terkirim] = await Promise.all([
    getPiutangSummary(),
    listInvoices({ status: "terkirim" })
  ]);

  // Yang paling lama menunggak lebih dulu — itu urutan menelepon, bukan
  // urutan nomor tagihan.
  const outstanding = terkirim
    .filter((r) => r.sisa > 0)
    .sort((a, b) => (a.jatuh_tempo ?? "9999").localeCompare(b.jatuh_tempo ?? "9999"));

  return <PiutangView summary={summary} outstanding={outstanding} />;
}
