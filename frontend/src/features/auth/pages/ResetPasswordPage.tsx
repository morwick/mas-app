import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { requestPasswordReset } from "@/features/auth/api";

export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email wajib diisi");
      return;
    }
    setPending(true);
    const res = await requestPasswordReset(email.trim());
    setPending(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  if (sent) {
    return (
      <>
        <div className="flex flex-col items-center mb-6">
          <Logo size="md" />
        </div>
        <Card className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-brand" />
          </div>
          <h2 className="text-[18px] font-medium">Link reset terkirim</h2>
          <p className="mt-2 text-[13px] text-text-muted">
            Cek email Anda untuk mengatur ulang password. Periksa folder spam jika tidak
            terlihat.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 mt-5 text-[13px] text-brand-dark hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke halaman masuk
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center mb-6 text-center">
        <Logo size="md" />
        <h1 className="mt-4 text-[20px] font-medium">Reset password</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Masukkan email akun admin Anda untuk menerima link reset password.
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email" required>
            <Input
              name="email"
              type="email"
              placeholder="admin@mas.id"
              leftIcon={<Mail className="w-4 h-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          {error && (
            <p className="text-[12px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth size="lg" loading={pending}>
            Kirim link reset
          </Button>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </Link>
        </form>
      </Card>
    </>
  );
}
