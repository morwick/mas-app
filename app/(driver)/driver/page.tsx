import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DriverDashboardView } from "@/components/driver/driver-dashboard-view";

export const dynamic = "force-dynamic";

export default async function DriverDashboardPage() {
  const supabase = await createClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Check if user is driver
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, nama")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  if (profile.role !== "driver") {
    // Redirect non-drivers to admin dashboard
    redirect("/dashboard");
  }

  // Fetch active jobs for this driver
  const { data: jobsData, error } = await supabase
    .from("jobs")
    .select(`
      id, job_number, share_token, status, etd, eta, catatan,
      customer_id, pic_nama, pic_no_hp, alat_diangkut, asal, tujuan,
      unit_id, driver_id, created_at, completed_at,
      customer:customers(nama_perusahaan),
      units:kode_unit
    `)
    .eq("driver_id", user.id)
    .in("status", ["menunggu_pickup", "loading", "dalam_perjalanan", "unloading"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching driver jobs:", error);
  }

  // Format jobs for display
  const jobs = (jobsData ?? []).map((job: any) => ({
    id: job.id,
    job_number: job.job_number,
    status: job.status,
    customer_nama: job.customer?.nama_perusahaan ?? "—",
    alat_diangkut: job.alat_diangkut,
    asal: job.asal,
    tujuan: job.tujuan,
    unit_kode: job.units?.kode_unit ?? "—",
    etd: job.etd,
    eta: job.eta,
    pic_nama: job.pic_nama,
    pic_no_hp: job.pic_no_hp,
    catatan: job.catatan,
    created_at: job.created_at
  }));

  return (
    <DriverDashboardView 
      driverName={profile.nama}
      jobs={jobs}
    />
  );
}
