import { useState } from "react";
import { CheckCircle2, Pencil, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import {
  deleteIncident,
  resolveIncident,
  setIncidentStatus
} from "@/features/units/api";
import type { Incident } from "@/types";

/**
 * Alur insiden (status unit diubah trigger DB, migration 20260925000006):
 *   Open (unit Breakdown) → Dalam penanganan (unit Perbaikan) → Selesai (unit Standby).
 * Hanya insiden Open yang boleh dihapus.
 */
export type IncidentAction = "proses" | "selesai" | "hapus";

const COPY: Record<
  IncidentAction,
  {
    title: string;
    body: (kode: string) => string;
    confirmText: string;
    variant: "primary" | "danger";
    busy: string;
    success: string;
  }
> = {
  proses: {
    title: "Tandai insiden dalam penanganan?",
    body: (kode) =>
      `Status unit ${kode} akan berubah menjadi Perbaikan. Setelah ini catatan insiden tidak bisa dihapus lagi.`,
    confirmText: "Ya, tandai",
    variant: "primary",
    busy: "Menandai insiden dalam penanganan…",
    success: "Insiden dalam penanganan — unit kini Perbaikan"
  },
  selesai: {
    title: "Selesaikan perbaikan?",
    body: (kode) =>
      `Insiden ditandai Selesai dan unit ${kode} kembali Standby (atau Bertugas bila masih ada job berjalan). Bila unit masih punya insiden lain yang belum selesai, statusnya mengikuti insiden itu.`,
    confirmText: "Ya, selesaikan",
    variant: "primary",
    busy: "Menyelesaikan perbaikan…",
    success: "Perbaikan selesai"
  },
  hapus: {
    title: "Hapus catatan insiden?",
    body: () =>
      "Catatan insiden beserta foto buktinya akan dihapus, dan status unit dihitung ulang dari insiden lain yang masih terbuka.",
    confirmText: "Ya, hapus",
    variant: "danger",
    busy: "Menghapus insiden…",
    success: "Insiden dihapus"
  }
};

function runAction(action: IncidentAction, id: string) {
  if (action === "proses") return setIncidentStatus(id, "in_progress");
  if (action === "selesai") return resolveIncident(id);
  return deleteIncident(id);
}

/**
 * Konfirmasi + popup loading untuk aksi insiden. Render `node` sekali, lalu
 * panggil `request(aksi, insiden)` dari tombol mana pun (kartu atau modal).
 */
export function useIncidentActions(
  unitKode: string,
  onDone?: (action: IncidentAction, incident: Incident) => void
) {
  const toast = useToast();
  const [pending, setPending] = useState<{ action: IncidentAction; incident: Incident } | null>(
    null
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function confirm() {
    if (!pending) return;
    const { action, incident } = pending;
    setPending(null);
    setBusy(COPY[action].busy);
    const res = await runAction(action, incident.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(COPY[action].success);
    onDone?.(action, incident);
  }

  const copy = pending ? COPY[pending.action] : null;
  const node = (
    <>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={copy?.title ?? ""}
        body={copy?.body(unitKode)}
        confirmText={copy?.confirmText}
        variant={copy?.variant ?? "primary"}
        onConfirm={confirm}
      />
      <LoadingOverlay message={busy} />
    </>
  );

  return {
    request: (action: IncidentAction, incident: Incident) => setPending({ action, incident }),
    node
  };
}

interface ButtonsProps {
  incident: Incident;
  onAction: (action: IncidentAction) => void;
  onEdit: () => void;
}

/** Tombol aksi sesuai status insiden; insiden Selesai tidak punya aksi. */
export function IncidentActionButtons({ incident, onAction, onEdit }: ButtonsProps) {
  if (incident.status === "resolved") return null;
  const isOpen = incident.status === "open";
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Pencil className="w-3.5 h-3.5" />}
        onClick={onEdit}
      >
        Edit
      </Button>
      {isOpen && (
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          onClick={() => onAction("hapus")}
        >
          Hapus
        </Button>
      )}
      {isOpen ? (
        <Button
          size="sm"
          leftIcon={<Wrench className="w-3.5 h-3.5" />}
          onClick={() => onAction("proses")}
        >
          Tandai dalam penanganan
        </Button>
      ) : (
        <Button
          size="sm"
          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          onClick={() => onAction("selesai")}
        >
          Selesaikan perbaikan
        </Button>
      )}
    </div>
  );
}
