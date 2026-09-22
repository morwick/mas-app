import { notFound, redirect } from "next/navigation";
import { getJobByToken } from "@/lib/queries/jobs";
import { createAnonClient } from "@/lib/supabase/server";
import { CustomerTrackingView } from "@/components/tracking/customer-tracking-view";

export const dynamic = "force-dynamic";

export default async function CustomerTrackingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const job = await getJobByToken(token);

  // Token tidak ditemukan ATAU job sudah selesai/cancelled (RLS akan otomatis
  // block bacaan selesai > grace window, jadi job=null) → tampilkan halaman
  // expired, bukan 404, biar UX customer jelas.
  if (!job) redirect(`/track/${token}/expired`);
  if (job.status === "selesai" || job.status === "cancelled")
    redirect(`/track/${token}/expired`);

  const supabase = createAnonClient(token);
  const [unitRes, driverRes] = await Promise.all([
    supabase
      .from("units")
      .select("id, kode_unit, no_polisi, tracksolid_share_link, jenis_unit(nama)")
      .eq("id", job.unit_id)
      .maybeSingle(),
    supabase
      .from("drivers")
      .select("id, nama, no_hp")
      .eq("id", job.driver_id)
      .maybeSingle()
  ]);

  const unit = unitRes.data as
    | {
        kode_unit: string;
        no_polisi: string;
        tracksolid_share_link: string | null;
        jenis_unit: { nama: string } | null;
      }
    | null;
  const driver = driverRes.data as { nama: string; no_hp: string } | null;

  return (
    <CustomerTrackingView
      job={job}
      unit={
        unit
          ? {
              kode_unit: unit.kode_unit,
              no_polisi: unit.no_polisi,
              jenis: unit.jenis_unit?.nama ?? "—",
              tracksolid_share_link: unit.tracksolid_share_link
            }
          : null
      }
      driver={driver}
    />
  );
}
