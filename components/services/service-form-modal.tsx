"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createServiceAction } from "@/lib/actions/services";
import {
  jenisServiceLabel,
  type JenisService
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitKode: string;
  currentOdometerKm: number;
}

const jenisOptions: JenisService[] = ["rutin", "oli", "ban", "mesin", "lainnya"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ServiceFormModal({
  open,
  onClose,
  unitId,
  unitKode,
  currentOdometerKm
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    tanggal: todayIso(),
    odometer_km: String(currentOdometerKm),
    jenis: "rutin" as JenisService,
    catatan: ""
  });
  const [error, setError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({
        tanggal: todayIso(),
        odometer_km: String(currentOdometerKm),
        jenis: "rutin",
        catatan: ""
      });
      setError({});
    }
  }, [open, currentOdometerKm]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.tanggal) errs.tanggal = "Tanggal wajib diisi";
    const odoNum = Number(form.odometer_km);
    if (!form.odometer_km || Number.isNaN(odoNum) || odoNum < 0)
      errs.odometer_km = "Odometer harus angka non-negatif";
    setError(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const res = await createServiceAction({
      unit_id: unitId,
      tanggal: form.tanggal,
      odometer_km: Math.round(odoNum),
      jenis: form.jenis,
      catatan: form.catatan.trim() || null
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Service berhasil dicatat");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={`Catat service — ${unitKode}`}
      description="Servis baru akan dipakai untuk hitung jadwal servis berikutnya."
      maxWidth="max-w-[560px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            Simpan service
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Jenis service" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {jenisOptions.map((j) => {
              const active = form.jenis === j;
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => set("jenis", j)}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    border: "0.5px solid",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background 120ms ease, border-color 120ms ease",
                    borderColor: active
                      ? "var(--brand-primary)"
                      : "var(--border-strong)",
                    background: active ? "var(--brand-primary-light)" : "white",
                    color: active
                      ? "var(--brand-primary-dark)"
                      : "var(--text-primary)"
                  }}
                >
                  {jenisServiceLabel[j]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal service" required>
            <Input
              type="date"
              value={form.tanggal}
              onChange={(e) => set("tanggal", e.target.value)}
              error={error.tanggal}
            />
          </Field>
          <Field
            label="Odometer saat service"
            required
            hint="Pakai pembacaan dari unit saat servis"
          >
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={form.odometer_km}
              onChange={(e) => set("odometer_km", e.target.value)}
              error={error.odometer_km}
              rightAddon={
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    paddingRight: 8
                  }}
                >
                  km
                </span>
              }
            />
          </Field>
        </div>

        <Field
          label="Catatan (opsional)"
          hint="Mis. ganti filter oli, ganti kampas rem, nama bengkel"
        >
          <Textarea
            rows={3}
            placeholder="Detail servis yang dilakukan"
            value={form.catatan}
            onChange={(e) => set("catatan", e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

