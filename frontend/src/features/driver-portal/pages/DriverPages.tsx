import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Smartphone, KeyRound } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useDriverAuth } from "@/lib/auth/DriverAuthContext";
import { DriverDashboardView } from "../components/driver-dashboard-view";
import { DriverJobDetailView } from "../components/driver-job-detail-view";
import { useMyJob, useMyJobs } from "../queries";

export function DriverLoginPage() {
  const { login } = useDriverAuth();
  const navigate = useNavigate();
  const [noHp, setNoHp] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!noHp.trim()) return setError("Nomor HP wajib diisi");
    if (!/^\d{6}$/.test(pin)) return setError("PIN harus 6 angka");
    setPending(true);
    setError(null);
    try {
      await login(noHp.trim(), pin);
      navigate("/driver/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nomor HP atau PIN salah");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-6 text-center">
          <Logo size="lg" />
          <p className="mt-4 text-[13px] text-text-muted">Portal Driver - Lihat job Anda</p>
        </div>
        <Card className="p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Nomor HP" required>
              <Input
                name="no_hp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="08xxxxxxxxxx"
                leftIcon={<Smartphone className="w-4 h-4" />}
                value={noHp}
                onChange={(e) => setNoHp(e.target.value)}
                required
              />
            </Field>
            <Field label="PIN" required hint="6 angka dari admin. Hubungi kantor kalau lupa.">
              <Input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="••••••"
                leftIcon={<KeyRound className="w-4 h-4" />}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p className="text-[12px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button type="submit" fullWidth size="lg" loading={pending}>
              Masuk
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/login" className="text-[13px] text-brand-dark hover:underline">
              Login Admin →
            </Link>
          </div>
        </Card>
        <p className="mt-6 text-center text-[11px] text-text-subtle">
          &copy; {new Date().getFullYear()} PT. Mitra Angkutan Sejati
        </p>
      </div>
    </div>
  );
}

export function DriverDashboardPage() {
  const { session } = useDriverAuth();
  const jobs = useMyJobs("all");
  if (jobs.isPending) return <PageLoading />;
  if (jobs.isError) return <PageError error={jobs.error} onRetry={jobs.refetch} />;
  return <DriverDashboardView driverNama={session?.nama ?? ""} jobs={jobs.data} />;
}

export function DriverJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Backend hanya melepas job milik driver ini; job orang lain datang sebagai 404.
  const job = useMyJob(id);
  if (job.isPending) return <PageLoading />;
  if (job.isError) return <PageError error={job.error} onRetry={job.refetch} />;
  return <DriverJobDetailView job={job.data} />;
}
