"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { calibrateOdometerAction } from "@/lib/actions/services";

interface Props {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitKode: string;
  currentBaselineKm: number;
}

export function CalibrateBaselineModal({
  open,
  onClose,
  unitId,
  unitKode,
  currentBaselineKm
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(String(currentBaselineKm));
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(String(currentBaselineKm));
      setError(undefined);
    }
  }, [open, currentBaselineKm]);

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Masukkan angka non-negatif");
      return;
    }
    setSubmitting(true);
    const res = await calibrateOdometerAction({
      unit_id: unitId,
      odometer_baseline_km: n
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Counter awal ${unitKode} berhasil di-set`);
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={`Counter awal — ${unitKode}`}
      description="Counter ini akan dijadikan starting point. TrackSolid akan menambah km hariannya ke counter. Counter reset ke 0 setiap kali admin catat servis."
      maxWidth="max-w-[440px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            Simpan
          </Button>
        </>
      }
    >
      <Field
        label="Counter awal (km sejak servis terakhir)"
        required
        hint="Untuk unit baru → 0. Untuk unit lama, isi km yang sudah ditempuh sejak servis terakhir di dashboard fisik."
      >
        <Input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
          autoFocus
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
    </Modal>
  );
}
