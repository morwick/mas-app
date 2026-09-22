"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { UangJalanModal } from "./uang-jalan-modal";
import { deleteUangJalanAction, setPaguAction } from "@/lib/actions/uang-jalan";
import { formatRupiah, formatDate } from "@/lib/utils";
import type { SumberDana, UangJalan, UangJalanRingkasan } from "@/lib/types";

interface Props {
  jobId: string;
  sumberDana: SumberDana[];
  transaksi: UangJalan[];
  ringkasan: UangJalanRingkasan;
}

function Angka({
  label,
  value,
  warna,
  besar
}: {
  label: string;
  value: string;
  warna?: string;
  besar?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: besar ? 17 : 14.5,
          fontWeight: 700,
          color: warna ?? "var(--text-primary)"
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function UangJalanCard({
  jobId,
  sumberDana,
  transaksi,
  ringkasan
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UangJalan | null>(null);
  const [hapus, setHapus] = useState<UangJalan | null>(null);
  const [editPagu, setEditPagu] = useState(false);
  const [paguDraft, setPaguDraft] = useState(String(ringkasan.pagu_awal));
  const [saving, setSaving] = useState(false);

  const belumAdaPagu = ringkasan.pagu === 0;
  const minus = ringkasan.sisa < 0;

  async function simpanPagu() {
    setSaving(true);
    const res = await setPaguAction(jobId, Number(paguDraft) || 0);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pagu tersimpan");
    setEditPagu(false);
    router.refresh();
  }

  async function konfirmasiHapus() {
    if (!hapus) return;
    const res = await deleteUangJalanAction(hapus.id, jobId);
    if (!res.ok) return toast.error(res.error);
    toast.success("Catatan dihapus");
    setHapus(null);
    router.refresh();
  }

  return (
    <div className="card card-pad">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 7 }}
          className="eyebrow"
        >
          <Wallet style={{ width: 13, height: 13 }} />
          Uang jalan
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus style={{ width: 13, height: 13 }} />
          Catat
        </Button>
      </div>

      {/* Ringkasan */}
      {editPagu ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              Pagu borongan
            </div>
            <Input
              inputMode="numeric"
              autoFocus
              value={paguDraft}
              onChange={(e) => setPaguDraft(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <Button size="sm" onClick={simpanPagu} loading={saving}>
            Simpan
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setPaguDraft(String(ringkasan.pagu_awal));
              setEditPagu(false);
            }}
          >
            Batal
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            padding: "12px 14px",
            background: "var(--bg-subtle)",
            borderRadius: 10,
            marginBottom: 14
          }}
        >
          <div>
            <Angka label="Pagu" value={formatRupiah(ringkasan.pagu)} />
            {ringkasan.penambahan > 0 && (
              <div className="caption" style={{ marginTop: 2 }}>
                {formatRupiah(ringkasan.pagu_awal)} + tambahan{" "}
                {formatRupiah(ringkasan.penambahan)}
              </div>
            )}
            <button
              type="button"
              className="btn-link"
              style={{ fontSize: 11, marginTop: 2 }}
              onClick={() => {
                setPaguDraft(String(ringkasan.pagu_awal));
                setEditPagu(true);
              }}
            >
              Ubah pagu awal
            </button>
          </div>
          <Angka label="Sudah dikasih" value={formatRupiah(ringkasan.cair)} />
          <Angka
            label={minus ? "Lebih dikasih" : "Belum dikasih"}
            value={formatRupiah(Math.abs(ringkasan.sisa))}
            warna={minus ? "#c13838" : "var(--brand-primary-dark)"}
            besar
          />
        </div>
      )}

      {belumAdaPagu && !editPagu && (
        <p className="caption" style={{ marginTop: -6, marginBottom: 12 }}>
          Pagu borongan belum diisi. Sisanya belum bisa dihitung sebelum angkanya
          ada.
        </p>
      )}

      {/* Riwayat */}
      {transaksi.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-tertiary)",
            margin: 0,
            padding: "8px 0"
          }}
        >
          Belum ada yang dikasih.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {transaksi.map((t) => {
            const tambah = t.jenis === "penambahan_pagu";
            return (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-default)"
                }}
              >
                <div style={{ minWidth: 62 }} className="caption mono">
                  {formatDate(t.tanggal)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {tambah ? (
                      <span style={{ color: "#b45309" }}>Tambah pagu</span>
                    ) : (
                      t.sumber_dana_nama ?? "—"
                    )}
                  </div>
                  {(t.keperluan || t.catatan) && (
                    <div className="caption" style={{ marginTop: 1 }}>
                      {[t.keperluan, t.catatan].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: tambah ? "#b45309" : "var(--text-primary)"
                  }}
                >
                  {tambah ? "+" : ""}
                  {formatRupiah(t.jumlah)}
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Ubah"
                    onClick={() => {
                      setEditing(t);
                      setModalOpen(true);
                    }}
                  >
                    <Pencil style={{ width: 13, height: 13 }} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Hapus"
                    onClick={() => setHapus(t)}
                  >
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <UangJalanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        jobId={jobId}
        sumberDana={sumberDana}
        ringkasan={ringkasan}
        existing={editing}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={!!hapus}
        onClose={() => setHapus(null)}
        onConfirm={konfirmasiHapus}
        title="Hapus catatan uang jalan?"
        body={
          hapus
            ? `${formatDate(hapus.tanggal)} — ${formatRupiah(hapus.jumlah)}. Sisa pagu akan dihitung ulang.`
            : ""
        }
        confirmText="Hapus"
        variant="danger"
      />
    </div>
  );
}
