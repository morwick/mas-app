import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email dan password wajib diisi");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await login(email.trim(), password);
      const next = params.get("next");
      navigate(next && next.startsWith("/") ? next : "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center mb-6 text-center">
        <Logo size="lg" />
        <p className="mt-4 text-[13px] text-text-muted">
          Masuk untuk mengelola armada & job pengiriman
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email" required>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="admin@mas.id"
              leftIcon={<Mail className="w-4 h-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password" required>
            <Input
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Masukkan password"
              leftIcon={<Lock className="w-4 h-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              rightAddon={
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="px-2 h-8 text-text-muted hover:text-text"
                  aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </Field>
          {error && (
            <p className="text-[12px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Link to="/reset-password" className="text-[13px] text-brand-dark hover:underline">
              Lupa password?
            </Link>
          </div>
          <Button type="submit" fullWidth size="lg" loading={pending}>
            Masuk
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-[11px] text-text-subtle">
        &copy; {new Date().getFullYear()} PT. Mitra Angkutan Sejati
      </p>
    </>
  );
}
