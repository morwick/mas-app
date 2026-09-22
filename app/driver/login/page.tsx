"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Smartphone, KeyRound } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { driverLoginAction } from "@/lib/actions/driver-portal";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth size="lg" loading={pending}>
      Masuk
    </Button>
  );
}

export default function DriverLoginPage() {
  const [state, formAction] = useFormState(driverLoginAction, null);

  return (
    <>
      <div className="flex flex-col items-center mb-6 text-center">
        <Logo size="lg" />
        <p className="mt-4 text-[13px] text-text-muted">
          Portal Driver - Lihat job Anda
        </p>
      </div>
      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Nomor HP" required>
            <Input
              name="no_hp"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="08xxxxxxxxxx"
              leftIcon={<Smartphone className="w-4 h-4" />}
              required
            />
          </Field>
          <Field
            label="PIN"
            required
            hint="6 angka dari admin. Hubungi kantor kalau lupa."
          >
            <Input
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="••••••"
              leftIcon={<KeyRound className="w-4 h-4" />}
              required
            />
          </Field>
          {state && !state.ok && (
            <p className="text-[12px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">
              {state.error}
            </p>
          )}
          <SubmitButton />
        </form>
        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-[13px] text-brand-dark hover:underline"
          >
            Login Admin →
          </Link>
        </div>
      </Card>
      <p className="mt-6 text-center text-[11px] text-text-subtle">
        &copy; {new Date().getFullYear()} PT. Mitra Angkutan Sejati
      </p>
    </>
  );
}
