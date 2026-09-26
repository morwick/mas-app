import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Select, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { incidentTypeLabel } from "@/types";
import type { InsidenDibukaLagi, PenghapusanAset } from "../api";
import { useInsidenAset } from "../queries";

interface Props {
  /** Penghapusan yang dibatalkan; null = modal tertutup. */
  penghapusan: PenghapusanAset | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (alasan: string, insiden: InsidenDibukaLagi[]) => void | Promise<void>;
}

/**
 * Batal hapus (mis. salah pilih): alasan wajib, aset kembali Standby, dan
 * insiden yang ditutup saat dihapus dibuka lagi ke Terbuka / Dalam
 * penanganan sesuai pilihan — status aset lalu mengikuti insidennya.
 */
export function BatalPenghapusanModal({ penghapusan, busy, onClose, onConfirm }: Props) {
  const assetId = penghapusan?.unit_id ?? penghapusan?.unit_trailer_id ?? null;
  const insiden = useInsidenAset(penghapusan?.jenis_aset ?? null, assetId);
  const ditutup = useMemo(
    () => (insiden.data ?? []).filter((i) => i.status === "resolved" && i.ditutup_karena === "diafkirkan"),
    [insiden.data]
  );
  const [alasan, setAlasan] = useState("");
  const [error, setError] = useState("");
  const [pilihan, setPilihan] = useState<Record<string, InsidenDibukaLagi["status"]>>({});

  const labelAset = penghapusan?.jenis_aset === "unit_trailer" ? "unit trailer" : "unit";
  // Kunci string supaya reset tidak berulang saat data insiden dimuat ulang.
  const kunci = ditutup.map((i) => `${i.id}:${i.status_sebelum_ditutup ?? ""}`).join(",");

  useEffect(() => {
    setAlasan("");
    setError("");
  }, [penghapusan?.id]);

  useEffect(() => {
    setPilihan(
      Object.fromEntries(
        ditutup.map((i) => [i.id, i.status_sebelum_ditutup === "in_progress" ? "in_progress" : "open"])
      )
    );
    // Isi `ditutup` diwakili `kunci`.
  }, [kunci]);

  function konfirmasi() {
    if (!alasan.trim()) {
      setError("Alasan pembatalan wajib diisi");
      return;
    }
    void onConfirm(
      alasan.trim(),
      ditutup.map((i) => ({ id: i.id, status: pilihan[i.id] ?? "open" }))
    );
  }

  return (
    <Modal
      open={penghapusan !== null}
      onClose={busy ? () => {} : onClose}
      title={`Batalkan penghapusan ${penghapusan?.kode_aset ?? ""}?`}
      description={`Catatan penghapusan dihapus dan ${labelAset} ini kembali berstatus Standby.`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Tutup
          </button>
          <button type="button" className="btn btn-danger" onClick={konfirmasi} disabled={busy}>
            {busy ? "Menyimpan…" : "Ya, batalkan"}
          </button>
        </>
      }
    >
      {ditutup.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="field-label" style={{ marginBottom: 4 }}>
            Insiden yang ditutup saat {labelAset} dihapus
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, lineHeight: 1.5 }}>
            Pilih status insiden setelah dibuka lagi. Status {labelAset} lalu mengikuti insidennya: Terbuka →{" "}
            <strong>Breakdown</strong>, Dalam penanganan → <strong>Perbaikan</strong>.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ditutup.map((i) => (
              <div
                key={i.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: 10,
                  border: "0.5px solid var(--border-strong)",
                  borderRadius: 8
                }}
              >
                <div style={{ flex: "1 1 180px", minWidth: 0, fontSize: 12 }}>
                  <strong>{incidentTypeLabel[i.tipe]}</strong> · {formatDateTime(i.tanggal)}
                  <div
                    style={{
                      color: "var(--text-tertiary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {i.deskripsi}
                  </div>
                </div>
                <div style={{ flex: "0 0 170px" }}>
                  <Select
                    aria-label={`Status insiden ${incidentTypeLabel[i.tipe]}`}
                    value={pilihan[i.id] ?? "open"}
                    onChange={(e) =>
                      setPilihan((p) => ({ ...p, [i.id]: e.target.value as InsidenDibukaLagi["status"] }))
                    }
                  >
                    <option value="open">Terbuka</option>
                    <option value="in_progress">Dalam penanganan</option>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Field label="Alasan pembatalan" required>
        <Textarea
          rows={3}
          placeholder={`Misal: salah pilih, ${labelAset} ternyata masih layak pakai`}
          value={alasan}
          onChange={(e) => {
            setAlasan(e.target.value);
            setError("");
          }}
          error={error}
        />
      </Field>
    </Modal>
  );
}
