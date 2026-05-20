"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea, Field } from "@/components/ui/input";
import { jobStatusOrder } from "@/lib/types";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  current: JobStatus;
  onConfirm: (next: JobStatus, notes?: string) => void | Promise<void>;
}

export function UpdateStatusModal({ open, onClose, current, onConfirm }: Props) {
  const idx = jobStatusOrder.findIndex((s) => s.key === current);
  const candidates = jobStatusOrder.filter((_, i) => i > idx);
  const [next, setNext] = useState<JobStatus | "">(candidates[0]?.key ?? "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handle() {
    if (!next) return;
    setLoading(true);
    await onConfirm(next as JobStatus, notes || undefined);
    setLoading(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update status job"
      description="Customer akan langsung melihat update ini di halaman tracking."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button disabled={!next} loading={loading} onClick={handle}>
            Konfirmasi
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {candidates.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            Tidak ada status berikutnya. Job sudah selesai.
          </p>
        ) : (
          candidates.map((s) => {
            const active = next === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setNext(s.key)}
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
                <span className="text-[14px] font-medium text-text">{s.label}</span>
              </button>
            );
          })
        )}
        <Field label="Catatan (opsional)" className="mt-2">
          <Textarea
            placeholder="Misal: berangkat tepat waktu, akan kontak PIC saat tiba"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
