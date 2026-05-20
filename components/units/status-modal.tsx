"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea, Field } from "@/components/ui/input";
import type { UnitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UnitStatusModalProps {
  open: boolean;
  onClose: () => void;
  currentStatus: UnitStatus;
  onConfirm: (next: UnitStatus, reason?: string) => void | Promise<void>;
}

const options: { key: UnitStatus; label: string; desc: string }[] = [
  { key: "standby", label: "Standby", desc: "Siap menerima job baru" },
  { key: "bertugas", label: "Bertugas", desc: "Sedang menjalankan job" },
  { key: "perbaikan", label: "Perbaikan", desc: "Tidak tersedia untuk job" }
];

export function UnitStatusModal({
  open,
  onClose,
  currentStatus,
  onConfirm
}: UnitStatusModalProps) {
  const [next, setNext] = useState<UnitStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    await onConfirm(next, reason || undefined);
    setLoading(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ubah status unit"
      description="Pilih status baru dan beri alasan bila perlu."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            onClick={handle}
            disabled={next === currentStatus && !reason}
            loading={loading}
          >
            Konfirmasi
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const active = next === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setNext(o.key)}
              className={cn(
                "flex items-start gap-3 p-3 rounded-md border text-left transition-colors",
                active
                  ? "border-brand bg-brand-light/40"
                  : "border-border hover:border-border-hover bg-white"
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 mt-0.5 rounded-full border-2 shrink-0",
                  active ? "border-brand bg-brand" : "border-border"
                )}
              >
                {active && (
                  <span className="block w-1.5 h-1.5 bg-white rounded-full m-auto mt-[3px]" />
                )}
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-medium text-text">
                  {o.label}
                  {o.key === currentStatus && (
                    <span className="ml-2 text-[10px] text-text-muted font-normal">
                      (status saat ini)
                    </span>
                  )}
                </span>
                <span className="block text-[12px] text-text-muted mt-0.5">
                  {o.desc}
                </span>
              </span>
            </button>
          );
        })}
        <Field label="Alasan (opsional)" className="mt-2">
          <Textarea
            placeholder="Misal: servis rem berkala, estimasi selesai 22 Mei"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
