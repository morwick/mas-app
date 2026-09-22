import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { updateJobStatus, cancelJob } from "@/features/jobs/api";
import { jobStatusOrder } from "@/types";
import type { JobStatus } from "@/types";

interface Props {
  jobId: string;
  status: JobStatus;
}

const ADVANCE_LABEL: Partial<Record<JobStatus, string>> = {
  menunggu_pickup: "Loading dimulai",
  loading: "Berangkat",
  dalam_perjalanan: "Tiba di tujuan",
  unloading: "Selesaikan"
};

export function QuickStatusBar({ jobId, status }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const terminal = status === "selesai" || status === "cancelled";
  const orderKeys = jobStatusOrder.map((s) => s.key);
  const currentIdx = orderKeys.indexOf(status);
  const prevStatus = currentIdx > 0 ? orderKeys[currentIdx - 1] : null;
  const nextStatus =
    currentIdx >= 0 && currentIdx < orderKeys.length - 1
      ? orderKeys[currentIdx + 1]
      : null;
  const advanceLabel = ADVANCE_LABEL[status] ?? "Maju";

  async function changeStatus(next: JobStatus) {
    setLoading(true);
    const res = await updateJobStatus(jobId, next);
    setLoading(false);
    if (res.ok) {
      toast.success(
        `Status diubah ke "${jobStatusOrder.find((s) => s.key === next)?.label ?? next}"`
      );
    } else {
      toast.error(res.error);
    }
  }

  async function doCancel() {
    setLoading(true);
    const res = await cancelJob(jobId, cancelReason);
    setLoading(false);
    // cancelJob redirect ke /jobs — kalau berhasil tidak akan return ke sini
    if (res?.ok === false) {
      toast.error(res.error);
    }
  }

  if (terminal) {
    return (
      <div
        className="card card-pad"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 12.5,
          color: "var(--text-secondary)"
        }}
      >
        {status === "selesai" ? (
          <>
            <CheckCircle2
              style={{ width: 14, height: 14, color: "var(--brand-primary)" }}
            />
            Job sudah selesai. Tidak ada aksi yang perlu dilakukan.
          </>
        ) : (
          <>
            <XCircle style={{ width: 14, height: 14, color: "#c93030" }} />
            Job dibatalkan. Tidak ada aksi yang perlu dilakukan.
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="card card-pad"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <div
          className="eyebrow"
          style={{ fontSize: 10.5, marginRight: "auto", paddingRight: 8 }}
        >
          Aksi cepat
        </div>
        {prevStatus && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => changeStatus(prevStatus)}
            disabled={loading}
            style={{ fontSize: 12 }}
            title={`Mundur ke "${jobStatusOrder.find((s) => s.key === prevStatus)?.label}"`}
          >
            <ChevronLeft style={{ width: 12, height: 12 }} />
            Mundur
          </button>
        )}
        {nextStatus && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => changeStatus(nextStatus)}
            disabled={loading}
            style={{ fontSize: 12 }}
          >
            {advanceLabel}
            <ChevronRight style={{ width: 12, height: 12 }} />
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setCancelOpen(true)}
          disabled={loading}
          style={{ fontSize: 12, color: "#c93030" }}
          title="Batalkan job"
        >
          <XCircle style={{ width: 12, height: 12 }} />
          Batalkan
        </button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          setCancelReason("");
        }}
        title="Batalkan job ini?"
        body={
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13 }}>
              Job yang dibatalkan tidak bisa di-undo. Customer akan lihat status
              "Dibatalkan" di halaman tracking. Yakin?
            </p>
            <label
              style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
            >
              Alasan pembatalan (opsional)
              <textarea
                rows={2}
                placeholder="Mis. customer batalkan, unit breakdown, force majeure…"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 10px",
                  fontSize: 12,
                  border: "0.5px solid var(--border-default)",
                  borderRadius: 6,
                  resize: "vertical"
                }}
              />
            </label>
          </div>
        }
        confirmText="Ya, batalkan"
        variant="danger"
        loading={loading}
        onConfirm={doCancel}
      />
    </>
  );
}
