/**
 * Fase 7: panel Approve / Kembalikan untuk job berstatus `menunggu_validasi`.
 * Menampilkan ringkasan kelengkapan supaya admin tahu apa yang diperiksa.
 */

import { useState } from "react";
import { CheckCircle2, Undo2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useToast } from "@/components/ui/toast";
import { REQUIRED_SLOTS, STAGE_LABEL } from "@/lib/job-status";
import { returnJob, validateJob } from "@/features/jobs/api";
import type { Job, PhotoStage } from "@/types";

interface Props {
  job: Job;
  /** Ringkasan uang jalan untuk ditampilkan (pagu, cair, pengajuan menunggu). */
  uangJalan?: { pagu: number; cair: number; pending: number } | null;
}

type ReturnTo = "loading" | "dalam_perjalanan" | "unloading" | "serah_terima_pool";

const STAGES: PhotoStage[] = ["loading", "unloading", "serah_terima"];

const RETURN_OPTIONS: ComboboxOption[] = [
  { value: "serah_terima_pool", label: "Serah terima pool", hint: "ulangi foto serah terima" },
  { value: "unloading", label: "Unloading", hint: "ulangi foto bongkar" },
  { value: "dalam_perjalanan", label: "Dalam perjalanan" },
  { value: "loading", label: "Loading", hint: "ulangi foto muat" }
];

export function ValidationPanel({ job, uangJalan }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [note, setNote] = useState("");
  const [toStatus, setToStatus] = useState<ReturnTo>("serah_terima_pool");

  const photos = job.photos ?? [];
  const kelengkapan = STAGES.map((stage) => {
    const filled = REQUIRED_SLOTS[stage].filter((slot) =>
      photos.some((p) => p.stage === stage && p.slot === slot)
    ).length;
    return { stage, filled, total: REQUIRED_SLOTS[stage].length };
  });
  const rendah = photos.filter((p) => p.kualitas_rendah).length;
  const semuaLengkap = kelengkapan.every((k) => k.filled === k.total);

  async function approve() {
    if (!window.confirm(`Approve ${job.job_number}? Driver akan kembali Stand By dan job masuk antrean tagihan.`))
      return;
    setBusy(true);
    const res = await validateJob(job.id);
    setBusy(false);
    if (res.ok) toast.success("Job divalidasi — driver kembali Stand By");
    else toast.error(res.error);
  }

  async function doReturn() {
    if (!note.trim()) {
      toast.error("Catatan pengembalian wajib diisi");
      return;
    }
    setBusy(true);
    const res = await returnJob(job.id, note.trim(), toStatus);
    setBusy(false);
    if (res.ok) {
      toast.success("Job dikembalikan ke driver");
      setReturnOpen(false);
      setNote("");
    } else toast.error(res.error);
  }

  return (
    <div className="card card-pad" style={{ borderColor: "#e0c06a", background: "#fffaf0" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="h3">Menunggu validasi admin</div>
          <div className="caption">
            Driver sudah menyelesaikan orderan. Periksa foto per slot, uang jalan, dan riwayat sebelum
            Approve.
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setReturnOpen(true)} disabled={busy} leftIcon={<Undo2 className="w-4 h-4" />}>
            Kembalikan ke driver
          </Button>
          <Button onClick={() => void approve()} loading={busy} leftIcon={<CheckCircle2 className="w-4 h-4" />}>
            Approve / Validasi
          </Button>
        </div>
      </div>

      <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {kelengkapan.map((k) => (
          <div key={k.stage} className="rounded-md bg-white border border-border px-3 py-2">
            <div className="caption">{STAGE_LABEL[k.stage]}</div>
            <div className={`text-[14px] font-semibold ${k.filled === k.total ? "text-brand-dark" : "text-status-cancelled-fg"}`}>
              {k.filled}/{k.total} foto
            </div>
          </div>
        ))}
        {uangJalan && (
          <div className="rounded-md bg-white border border-border px-3 py-2">
            <div className="caption">Uang jalan</div>
            <div className="text-[13px]">
              Cair {new Intl.NumberFormat("id-ID").format(uangJalan.cair)} / pagu{" "}
              {new Intl.NumberFormat("id-ID").format(uangJalan.pagu)}
              {uangJalan.pending > 0 && (
                <span className="text-status-cancelled-fg"> · {uangJalan.pending} pengajuan menunggu</span>
              )}
            </div>
          </div>
        )}
      </div>

      {(!semuaLengkap || rendah > 0) && (
        <div className="flex items-start gap-2 mt-3 text-[12.5px] text-amber-900">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {!semuaLengkap && "Ada slot foto yang kosong. "}
            {rendah > 0 && `${rendah} foto ditandai kualitas rendah — periksa sebelum Approve.`}
          </span>
        </div>
      )}

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Kembalikan ke driver"
        description="Driver akan menerima notifikasi berisi catatan ini."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => void doReturn()} loading={busy}>
              Kembalikan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Kembalikan ke tahap">
            <Combobox
              value={toStatus}
              onChange={(v) => setToStatus(v as ReturnTo)}
              options={RETURN_OPTIONS}
              searchPlaceholder="Cari tahap…"
              emptyText="Tahap tidak ditemukan"
            />
          </Field>
          <Field label="Catatan untuk driver" required>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. foto sisi kiri buram, ambil ulang" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
