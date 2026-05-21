"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Textarea, Field } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import type { UnitStatus } from "@/lib/types";

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

  useEffect(() => {
    if (open) {
      setNext(currentStatus);
      setReason("");
    }
  }, [open, currentStatus]);

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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handle}
            disabled={(next === currentStatus && !reason) || loading}
          >
            {loading ? "Menyimpan…" : "Konfirmasi"}
          </button>
        </>
      }
    >
      <div className="field-label" style={{ marginBottom: 8 }}>
        Pilih status baru
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          marginBottom: 14
        }}
      >
        {options.map((o) => {
          const active = next === o.key;
          return (
            <label
              key={o.key}
              style={{
                padding: 12,
                border: `0.5px solid ${
                  active ? "var(--brand-primary)" : "var(--border-strong)"
                }`,
                borderRadius: 8,
                cursor: "pointer",
                background: active ? "var(--brand-primary-light)" : "white",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                position: "relative"
              }}
            >
              <input
                type="radio"
                name="ustatus"
                checked={active}
                onChange={() => setNext(o.key)}
                style={{ display: "none" }}
              />
              <StatusBadge status={o.key} withDot={false} />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  textAlign: "center"
                }}
              >
                {o.desc}
              </div>
              {active && (
                <Check
                  style={{
                    width: 14,
                    height: 14,
                    color: "var(--brand-primary)",
                    marginTop: 2
                  }}
                />
              )}
              {o.key === currentStatus && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    fontSize: 9,
                    color: "var(--text-tertiary)"
                  }}
                >
                  saat ini
                </span>
              )}
            </label>
          );
        })}
      </div>
      <Field label="Alasan (opsional)">
        <Textarea
          rows={3}
          placeholder="Misal: servis rem berkala, estimasi selesai 22 Mei"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
