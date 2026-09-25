import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Textarea, Field } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import type { UnitStatus } from "@/types";

interface ActiveJobInfo {
  id: string;
  job_number: string;
  customer_nama: string;
}

interface UnitStatusModalProps {
  open: boolean;
  onClose: () => void;
  currentStatus: UnitStatus;
  activeJob?: ActiveJobInfo | null;
  onConfirm: (next: UnitStatus, reason?: string) => void | Promise<void>;
}

// "Terjual" sengaja tidak ada di sini — itu cuma bisa lewat menu Penjualan
// Unit, supaya data pembeli & harganya ikut tercatat (lihat UnitService.change_status).
const manualOptions: { key: UnitStatus; label: string; desc: string }[] = [
  { key: "standby", label: "Standby", desc: "Siap menerima job baru" },
  { key: "perbaikan", label: "Perbaikan", desc: "Tidak tersedia untuk job" },
  {
    key: "diafkirkan",
    label: "Diafkirkan",
    desc: "Unit tidak layak pakai & dikeluarkan dari armada — tidak bisa dipakai job"
  }
];

export function UnitStatusModal({
  open,
  onClose,
  currentStatus,
  activeJob,
  onConfirm
}: UnitStatusModalProps) {
  const isBertugas = currentStatus === "bertugas";
  const [next, setNext] = useState<UnitStatus>(
    isBertugas ? "standby" : currentStatus
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNext(isBertugas ? "standby" : currentStatus);
      setReason("");
    }
  }, [open, currentStatus, isBertugas]);

  async function handle() {
    setLoading(true);
    await onConfirm(next, reason || undefined);
    setLoading(false);
  }

  if (isBertugas) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Unit sedang bertugas"
        description="Status unit dikelola otomatis lewat job yang sedang berjalan."
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Tutup
            </button>
            {activeJob && (
              <Link
                to={`/jobs/${activeJob.id}`}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                Buka Job <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            )}
          </>
        }
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: 12,
            border: "0.5px solid var(--border-strong)",
            borderRadius: 8,
            background: "var(--brand-primary-light)"
          }}
        >
          <Info
            style={{
              width: 18,
              height: 18,
              color: "var(--brand-primary)",
              marginTop: 2,
              flexShrink: 0
            }}
          />
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            {activeJob ? (
              <>
                Unit ini sedang menjalankan{" "}
                <strong>{activeJob.job_number}</strong> untuk{" "}
                <strong>{activeJob.customer_nama}</strong>. Selesaikan atau
                batalkan job tersebut untuk mengembalikan unit ke Standby.
              </>
            ) : (
              <>
                Status <strong>Bertugas</strong> terkunci karena unit ini
                ter-assign ke job aktif. Status akan otomatis kembali ke
                Standby saat job selesai.
              </>
            )}
            <div
              style={{
                marginTop: 8,
                color: "var(--text-tertiary)",
                fontSize: 12
              }}
            >
              Perlu unit tidak tersedia untuk job baru? Setelah job selesai,
              ubah status ke <strong>Perbaikan</strong>.
            </div>
          </div>
        </div>
      </Modal>
    );
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
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 6,
          marginBottom: 14
        }}
      >
        {manualOptions.map((o) => {
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
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          marginBottom: 14,
          lineHeight: 1.5
        }}
      >
        Status <strong>Bertugas</strong> diatur otomatis sistem saat unit
        di-assign ke job baru.
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
