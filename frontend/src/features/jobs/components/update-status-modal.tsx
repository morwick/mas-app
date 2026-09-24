import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Textarea, Field } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { jobStatusOrder } from "@/types";
import type { JobStatus } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  current: JobStatus;
  /** Uang jalan sudah dicairkan — pembatalan tidak lagi ditawarkan. */
  uangJalanCair?: boolean;
  onConfirm: (next: JobStatus, notes?: string) => void | Promise<void>;
}

export function UpdateStatusModal({
  open,
  onClose,
  current,
  uangJalanCair,
  onConfirm
}: Props) {
  const currentKey: JobStatus = current === "menunggu_pickup" ? "ditugaskan" : current;
  const idx = jobStatusOrder.findIndex((s) => s.key === currentKey);
  const candidate = idx >= 0 && idx < jobStatusOrder.length - 1 ? jobStatusOrder[idx + 1] : null;
  // `selesai` hanya lewat Approve/Validasi (BR-07) — tidak ditawarkan di sini.
  const recommended = candidate && candidate.key !== "selesai" ? candidate : null;

  const options: {
    key: JobStatus;
    label: string;
    recommended?: boolean;
    danger?: boolean;
  }[] = [];
  if (recommended) {
    options.push({
      key: recommended.key,
      label: recommended.label,
      recommended: true
    });
  }
  // Uang sudah di tangan driver — job itu jadi catatan keuangan yang harus
  // ditutup lewat alur normal, bukan dibatalkan.
  if (current !== "cancelled" && current !== "selesai" && !uangJalanCair) {
    options.push({ key: "cancelled", label: "Batalkan job", danger: true });
  }

  const [next, setNext] = useState<JobStatus | "">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNext(options[0]?.key ?? "");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current]);

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
            disabled={!next || loading}
            onClick={handle}
          >
            {loading ? "Menyimpan…" : "Konfirmasi"}
          </button>
        </>
      }
    >
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          background: "var(--bg-muted)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 12
        }}
      >
        <div>
          <div className="caption" style={{ marginBottom: 4 }}>
            Status sekarang
          </div>
          <StatusBadge status={current} />
        </div>
        <span style={{ color: "var(--text-tertiary)" }}>→</span>
        <div>
          <div className="caption" style={{ marginBottom: 4 }}>
            Akan diubah ke
          </div>
          {next ? (
            <StatusBadge status={next as JobStatus} />
          ) : (
            <span className="muted">Pilih di bawah</span>
          )}
        </div>
      </div>

      <div className="field-label" style={{ marginBottom: 8 }}>
        Pilih status berikutnya
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 14
        }}
      >
        {options.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Tidak ada status berikutnya. Job sudah selesai.
          </p>
        ) : (
          options.map((o) => {
            const active = next === o.key;
            return (
              <label
                key={o.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  border: `0.5px solid ${
                    active ? "var(--brand-primary)" : "var(--border-strong)"
                  }`,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: active
                    ? "var(--brand-primary-light)"
                    : "white"
                }}
              >
                <input
                  type="radio"
                  name="status"
                  checked={active}
                  onChange={() => setNext(o.key)}
                  style={{ accentColor: "var(--brand-primary)" }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <StatusBadge status={o.key} />
                    {o.recommended && (
                      <span
                        style={{
                          fontSize: 10.5,
                          color: "var(--brand-primary-dark)",
                          fontWeight: 600
                        }}
                      >
                        · Direkomendasikan
                      </span>
                    )}
                  </div>
                </div>
                {o.danger && (
                  <AlertTriangle
                    style={{ width: 14, height: 14, color: "#C13838" }}
                  />
                )}
              </label>
            );
          })
        )}
      </div>

      <Field label="Catatan (opsional)">
        <Textarea
          rows={3}
          placeholder="Tambah catatan untuk audit log…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
