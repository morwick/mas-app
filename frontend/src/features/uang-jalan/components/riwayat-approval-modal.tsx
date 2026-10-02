import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/utils";
import { useRiwayatApprovalUangJalan } from "@/features/approval/queries";
import { CatatanApprover, DaftarApprover } from "@/features/approval/components/pengajuan-detail-view";

/** Data baris "Tambah uang jalan" yang dibuka (dari riwayat di kartu uang jalan). */
export interface DetailTambahan {
  id: string;
  tanggal: string;
  jumlah: number;
  keperluan?: string | null;
  catatan?: string | null;
  /** Dihapus selama menunggu approval. */
  dibatalkan?: boolean;
}

/**
 * Modal lihat-saja untuk satu baris "Tambah uang jalan": rincian pengajuan
 * (tanggal, nominal, alasan penambahan, catatan) lalu daftar approver beserta
 * catatan persetujuan / penolakan mereka. `tambahan` null = tertutup.
 */
export function RiwayatApprovalModal({ tambahan, onClose }: { tambahan: DetailTambahan | null; onClose: () => void }) {
  const riwayat = useRiwayatApprovalUangJalan(tambahan?.id ?? null);
  const r = riwayat.data;
  return (
    <Modal
      open={tambahan !== null}
      onClose={onClose}
      title="Detail tambahan uang jalan"
      description={r ? `Diajukan ${r.diajukan_oleh_nama ?? "—"} · ${formatDateTime(r.diajukan_at)}` : undefined}
      maxWidth="max-w-[600px]"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      {tambahan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "10px 20px" }}>
            <Isian label="Tanggal">{formatDate(tambahan.tanggal)}</Isian>
            <Isian label="Nominal">
              <strong className="mono">{formatRupiah(tambahan.jumlah)}</strong>
              {tambahan.dibatalkan && <span className="caption"> (dibatalkan)</span>}
            </Isian>
            <Isian label="Alasan penambahan">{tambahan.keperluan || "—"}</Isian>
            <Isian label="Catatan">{tambahan.catatan || "—"}</Isian>
          </div>

          <section>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Approver
            </div>
            {riwayat.isPending ? (
              <div className="caption">Memuat approver…</div>
            ) : riwayat.isError || !r ? (
              // Tambahan lama yang dicatat sebelum ada fitur approval tidak punya riwayat.
              <div className="caption">Belum ada riwayat approval untuk tambahan uang jalan ini.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {r.langkah.length > 0 && <DaftarApprover langkah={r.langkah} berjenjang={r.mode === "berjenjang"} />}
                <CatatanApprover p={r} />
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function Isian({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}
