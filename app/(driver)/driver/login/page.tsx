"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Eye, EyeOff, Mail, Lock, Truck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { driverLoginAction } from "@/lib/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth size="lg" loading={pending}>
      Masuk Driver
    </Button>
  );
}

export default function DriverLoginPage() {
  const [show, setShow] = useState(false);
  const [state, formAction] = useFormState(driverLoginAction, null);

  return (
    <>
      <div className="flex flex-col items-center mb-6 text-center">
        <Logo size="lg" />
        <div className="mt-2 flex items-center gap-2 text-brand-dark">
          <Truck className="w-5 h-5" />
          <span className="text-sm font-medium">Portal Driver</span>
        </div>
        <p className="mt-4 text-[13px] text-text-muted">
          Masuk untuk melihat dan mengelola job Anda
        </p>
      </div>
      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Email" required>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="driver@mas.id"
              leftIcon={<Mail className="w-4 h-4" />}
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
            Login sebagai Admin/Operator?
          </Link>
        </div>
      </Card>
      <p className="mt-6 text-center text-[11px] text-text-subtle">
        &copy; {new Date().getFullYear()} PT. Mitra Angkutan Sejati
      </p>
    </>
  );
}
