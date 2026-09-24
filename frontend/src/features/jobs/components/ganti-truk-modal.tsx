import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { useUnits } from "@/features/units/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useTrailerUntukUnit } from "@/features/unit-trailer/queries";
import { UnitTrailerField } from "@/features/unit-trailer/components/unit-trailer-field";
import type { Job } from "@/types";
import { gantiTruk } from "../api";

/** Ganti truk hanya saat job di perjalanan (dijaga juga di database). */
export const STATUS_BOLEH_GANTI_TRUK = ["loading", "dalam_perjalanan", "unloading"] as const;

export function bolehGantiTruk(job: Pick<Job, "status">): boolean {
  return (STATUS_BOLEH_GANTI_TRUK as readonly string[]).includes(job.status);
}

interface Props {
  job: Job;
  unitKode?: string;
  driverNama?: string;
  onClose: () => void;
}

/**
 * Truk rusak di tengah perjalanan → diganti truk Stand by lain. Driver
 * biasanya ikut diganti (opsional). Truk lama otomatis jadi Perbaikan, dan
 * pergantiannya tersimpan di riwayat job.
 */
export function GantiTrukModal({ job, unitKode, driverNama, onClose }: Props) {
  const toast = useToast();
  const units = useUnits();
  const drivers = useDrivers(false, true);
  const [unitId, setUnitId] = useState("");
  const [driverId, setDriverId] = useState(job.driver_id);
  const [trailerId, setTrailerId] = useState("");
  const [alasan, setAlasan] = useState("");
  const [error, setError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const trailer = useTrailerUntukUnit(unitId);

  const unitOptions = (units.data ?? [])
    .filter((u) => u.is_active && u.status === "standby" && u.id !== job.unit_id)
    .map((u) => ({ value: u.id, label: u.kode_unit, hint: [u.jenis_unit_nama, u.no_polisi].filter(Boolean).join(" · ") }));

  // Driver stand by + driver saat ini (pilihan default = tidak diganti).
  const driverOptions = [
    { value: job.driver_id, label: driverNama ?? "Driver saat ini", hint: "Driver saat ini (tidak diganti)" },
    ...(drivers.data ?? [])
      .filter((d) => d.id !== job.driver_id)
      .map((d) => ({ value: d.id, label: d.nama, hint: d.no_hp }))
  ];

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!unitId) errs.unit = "Pilih truk pengganti";
    if (trailer.data?.wajib && !trailerId) errs.trailer = "Unit trailer wajib dipilih untuk truk ini";
    if (!alasan.trim()) errs.alasan = "Alasan wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Data belum lengkap: " + Object.values(errs).join(", ") + ".");
      return;
    }
    setBusy("Mengganti truk…");
    const res = await gantiTruk(job.id, {
      unit_id: unitId,
      alasan: alasan.trim(),
      driver_id: driverId && driverId !== job.driver_id ? driverId : null,
      unit_trailer_id: trailer.data?.wajib ? trailerId : null
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Truk berhasil diganti. Truk lama dipindah ke status Perbaikan.");
    onClose();
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Ganti truk"
      description={`Truk saat ini: ${unitKode ?? "—"}. Setelah diganti, truk lama otomatis berstatus Perbaikan.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Batal
          </Button>
          <Button type="submit" form="ganti-truk-form" loading={busy !== null}>
            Ganti truk
          </Button>
        </>
      }
    >
      <form id="ganti-truk-form" onSubmit={simpan} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Truk pengganti" required hint="Hanya truk berstatus Stand by.">
          <Combobox
            value={unitId}
            onChange={(v) => {
              setUnitId(v);
              setTrailerId("");
            }}
            options={unitOptions}
            placeholder={units.isLoading ? "Memuat truk…" : "Pilih truk"}
            searchPlaceholder="Cari kode unit atau no. polisi…"
            emptyText="Tidak ada truk Stand by"
            error={error.unit}
          />
        </Field>
        {unitId && (
          <UnitTrailerField
            pilihan={trailer.data}
            loading={trailer.isLoading}
            value={trailerId}
            onChange={setTrailerId}
            error={error.trailer}
          />
        )}
        <Field label="Driver" hint="Biarkan bila driver tidak ikut diganti.">
          <Combobox
            value={driverId}
            onChange={(v) => setDriverId(v || job.driver_id)}
            options={driverOptions}
            placeholder="Pilih driver"
            searchPlaceholder="Cari nama driver…"
            emptyText="Tidak ada driver Stand by"
          />
        </Field>
        <Field label="Alasan" required>
          <Textarea
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Mis. mesin mati di KM 120, ban pecah…"
            error={error.alasan}
          />
        </Field>
      </form>
      <LoadingOverlay message={busy} />
    </Modal>
  );
}
