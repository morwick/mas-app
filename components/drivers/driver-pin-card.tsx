"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setDriverPinAction } from "@/lib/actions/drivers";
import type { Driver } from "@/lib/types";

interface Props {
  driver: Driver;
}

/** PIN 6 angka acak — supaya admin tidak terbiasa memakai 123456 untuk semua. */
function randomPin(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function DriverPinCard({ driver }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [justSet, setJustSet] = useState<string | null>(null);

  const sudahPunyaPin = Boolean(driver.pin_updated_at);

  async function submit() {
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN harus 6 angka");
      return;
    }
    setError(undefined);
    setSaving(true);
    const res = await setDriverPinAction(driver.id, pin);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    // PIN-nya ditahan di layar sekali ini saja: setelah tersimpan hanya ada
    // hash-nya di database, jadi tidak ada cara membacanya kembali nanti.
    setJustSet(pin);
    setPin("");
    toast.success("PIN driver diperbarui");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title="PIN portal driver"
        description="Dipakai driver untuk login di /driver dan menerima job."
      />

      <div className="flex items-center gap-2 mb-4 text-[13px]">
        {sudahPunyaPin ? (
          <>
            <ShieldCheck className="w-4 h-4 text-brand-primary" />
            <span className="text-text-muted">
              PIN aktif, terakhir diatur{" "}
              {new Date(driver.pin_updated_at as string).toLocaleDateString(
                "id-ID",
                { day: "numeric", month: "long", year: "numeric" }
              )}
              .
            </span>
          </>
        ) : (
          <>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span className="text-text-muted">
              Belum ada PIN — driver ini belum bisa membuka portal.
            </span>
          </>
        )}
      </div>

      {justSet && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[13px] text-amber-900">
            PIN baru untuk {driver.nama}:{" "}
            <span className="font-mono font-bold text-[15px]">{justSet}</span>
          </p>
          <p className="mt-1 text-[12px] text-amber-800">
            Catat dan sampaikan sekarang. Setelah halaman ini ditutup PIN tidak
            bisa dilihat lagi — hanya bisa diganti.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="PIN baru" hint="6 angka" className="flex-1 min-w-[180px]">
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            error={error}
            leftIcon={<KeyRound className="w-4 h-4" />}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPin(randomPin())}
        >
          Acak
        </Button>
        <Button type="button" onClick={submit} loading={saving}>
          {sudahPunyaPin ? "Ganti PIN" : "Set PIN"}
        </Button>
      </div>

      <p className="mt-3 text-[12px] text-text-muted">
        Mengganti PIN otomatis mengeluarkan semua perangkat yang sedang login
        sebagai driver ini.
      </p>
    </Card>
  );
}
