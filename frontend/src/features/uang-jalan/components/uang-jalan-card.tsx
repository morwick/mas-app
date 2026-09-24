import { useState } from "react";
import { queryClient } from "@/lib/api/query";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Field, Textarea } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Modal } from "@/components/ui/modal";
import { UangJalanModal } from "./uang-jalan-modal";
import { deleteUangJalan, rejectRequest, setPagu } from "@/features/uang-jalan/api";
import { formatRupiah, formatDate, formatDateTime } from "@/lib/utils";
import type { SumberDana, UangJalan, UangJalanRequest, UangJalanRingkasan } from "@/types";

interface Props {
  jobId: string;
  sumberDana: SumberDana[];
  transaksi: UangJalan[];
  ringkasan: UangJalanRingkasan;
  /** Pengajuan driver (BR-05); yang berstatus `diajukan` menahan perjalanan. */
  pengajuan?: UangJalanRequest[];
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
  ringkasan,
  pengajuan = []
}: Props) {
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UangJalan | null>(null);
  const [fulfilling, setFulfilling] = useState<UangJalanRequest | null>(null);
  const [rejecting, setRejecting] = useState<UangJalanRequest | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const pendingRequests = pengajuan.filter((r) => r.status === "diajukan");
  const adaBukti = transaksi.some((t) => t.jenis === "pencairan" && t.bukti_transfer_path);

  async function tolak() {
    if (!rejecting) return;
    setSaving(true);
    const res = await rejectRequest(rejecting.id, alasanTolak || null);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pengajuan ditolak");
    setRejecting(null);
    setAlasanTolak("");
  }
  const [hapus, setHapus] = useState<UangJalan | null>(null);
  const [editPagu, setEditPagu] = useState(false);
  const [paguDraft, setPaguDraft] = useState(String(Math.round(ringkasan.pagu_awal)));
  const [saving, setSaving] = useState(false);

  const belumAdaPagu = ringkasan.pagu === 0;
  const minus = ringkasan.sisa < 0;

  async function simpanPagu() {
    setSaving(true);
    const res = await setPagu(jobId, Number(paguDraft) || 0);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pagu tersimpan");
    setEditPagu(false);
  }

  async function konfirmasiHapus() {
    if (!hapus) return;
    const res = await deleteUangJalan(hapus.id, jobId);
    if (!res.ok) return toast.error(res.error);
    toast.success("Catatan dihapus");
    setHapus(null);
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
            <CurrencyInput
              autoFocus
              value={paguDraft}
              onChange={setPaguDraft}
            />
          </div>
          <Button size="sm" onClick={simpanPagu} loading={saving}>
            Simpan
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setPaguDraft(String(Math.round(ringkasan.pagu_awal)));
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
                setPaguDraft(String(Math.round(ringkasan.pagu_awal)));
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

      {/* Pengajuan driver yang menunggu kasir (Fase 3) */}
      {pendingRequests.length > 0 && (
        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}
        >
          {pendingRequests.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#9a3412" }}>
                  Driver mengajukan {formatRupiah(r.nominal)}
                </div>
                <div className="caption">
                  {formatDateTime(r.requested_at)}
                  {r.catatan ? ` · ${r.catatan}` : ""} — perjalanan tertahan sampai dicairkan
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFulfilling(r);
                  setModalOpen(true);
                }}
              >
                Cairkan + bukti
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                Tolak
              </Button>
            </div>
          ))}
        </div>
      )}
      {!adaBukti && pendingRequests.length === 0 && ringkasan.pagu > 0 && (
        <p className="caption" style={{ marginTop: -6, marginBottom: 12 }}>
          Belum ada pencairan berbukti — tahap muat driver masih terkunci (BR-02).
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
                  {t.jenis === "pencairan" &&
                    (t.bukti_transfer_url ? (
                      <a
                        href={t.bukti_transfer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-link"
                        style={{ fontSize: 11.5 }}
                      >
                        Lihat bukti transfer
                      </a>
                    ) : (
                      <div className="caption" style={{ color: "#b45309" }}>
                        Tanpa bukti transfer (catatan lama)
                      </div>
                    ))}
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
        onClose={() => {
          setModalOpen(false);
          setFulfilling(null);
        }}
        jobId={jobId}
        sumberDana={sumberDana}
        ringkasan={ringkasan}
        existing={editing}
        request={fulfilling}
        onSaved={() => queryClient.invalidateQueries()}
      />
      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Tolak pengajuan uang jalan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => void tolak()} loading={saving}>
              Tolak
            </Button>
          </>
        }
      >
        <Field label="Alasan (dikirim ke driver)">
          <Textarea rows={2} value={alasanTolak} onChange={(e) => setAlasanTolak(e.target.value)} />
        </Field>
      </Modal>

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
