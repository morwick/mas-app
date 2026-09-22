import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  createJenisUnit,
  deleteJenisUnit,
  updateJenisUnit
} from "@/features/settings/api";
import type { JenisUnit } from "@/types";

interface Props {
  list: JenisUnit[];
}

export function JenisUnitView({ list }: Props) {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState<{
    mode: "new" | "edit";
    id?: string;
    nama: string;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    if (!editOpen?.nama.trim()) return;
    setPending(true);
    const res =
      editOpen.mode === "new"
        ? await createJenisUnit(editOpen.nama)
        : await updateJenisUnit(editOpen.id!, editOpen.nama);
    setPending(false);
    if (res.ok) {
      toast.success(
        editOpen.mode === "new" ? "Jenis unit ditambahkan" : "Perubahan disimpan"
      );
      setEditOpen(null);
    } else toast.error(res.error);
  }

  async function doDelete() {
    if (!deleteId) return;
    setPending(true);
    const res = await deleteJenisUnit(deleteId);
    setPending(false);
    setDeleteId(null);
    if (res.ok) {
      toast.success("Jenis unit dihapus");
    } else toast.error(res.error);
  }

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Jenis unit</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Master data jenis armada
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setEditOpen({ mode: "new", nama: "" })}
        >
          Tambah
        </Button>
      </div>
      <Card>
        <div className="flex flex-col">
          {list.map((j, i) => (
            <div
              key={j.id}
              className={`flex items-center justify-between gap-3 py-3 ${
                i > 0 ? "border-t border-border/70" : ""
              }`}
            >
              <div>
                <p className="text-[14px] font-medium">{j.nama}</p>
                {!j.is_active && (
                  <p className="text-[11px] text-text-subtle">Nonaktif</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setEditOpen({ mode: "edit", id: j.id, nama: j.nama })
                  }
                  className="p-2 hover:bg-page rounded-md text-text-muted hover:text-text"
                  aria-label="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(j.id)}
                  className="p-2 hover:bg-status-cancelled-bg rounded-md text-status-cancelled-fg"
                  aria-label="Hapus"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={editOpen !== null}
        onClose={() => setEditOpen(null)}
        title={editOpen?.mode === "new" ? "Tambah jenis unit" : "Edit jenis unit"}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEditOpen(null)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button onClick={save} loading={pending}>
              Simpan
            </Button>
          </>
        }
      >
        <Field label="Nama" required>
          <Input
            value={editOpen?.nama ?? ""}
            onChange={(e) =>
              setEditOpen((s) => (s ? { ...s, nama: e.target.value } : s))
            }
            placeholder="Contoh: Lowbed"
            autoFocus
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Hapus jenis unit?"
        body="Jenis unit yang terkait dengan unit existing tidak bisa dihapus."
        confirmText="Ya, hapus"
        variant="danger"
        loading={pending}
        onConfirm={doDelete}
      />
    </div>
  );
}
