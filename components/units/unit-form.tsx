"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createUnitAction, updateUnitAction } from "@/lib/actions/units";
import { parseTrackingInput } from "@/lib/tracksolid/parse-link";
import type { Driver, JenisUnit, Unit, UnitStatus } from "@/lib/types";

interface UnitFormProps {
  mode: "new" | "edit";
  initial?: Unit;
  jenisUnitList: JenisUnit[];
  drivers: Driver[];
  /**
   * Map driverId → kode_unit yang sudah memakai driver tsb sebagai default driver.
   * Driver di map ini akan di-disable di dropdown (1 driver = 1 unit).
   * Tidak termasuk unit yang sedang diedit (excludeSelf).
   */
  driverAssignments?: Record<string, { unit_id: string; kode_unit: string }>;
}

export function UnitForm({
  mode,
  initial,
  jenisUnitList,
  drivers,
  driverAssignments = {}
}: UnitFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  // Initial value untuk field tracking: prioritas link mentah (kalau ada),
  // fallback ke IMEI murni (kalau admin sebelumnya ketik IMEI langsung).
  const initialTrackingInput =
    initial?.tracksolid_share_link ?? initial?.imei_gps ?? "";

  const [form, setForm] = useState({
    kode_unit: initial?.kode_unit ?? "",
    jenis_unit_id: initial?.jenis_unit_id ?? jenisUnitList[0]?.id ?? "",
    no_polisi: initial?.no_polisi ?? "",
    tahun: initial?.tahun?.toString() ?? "",
    status: (initial?.status ?? "standby") as UnitStatus,
    default_driver_id: initial?.default_driver_id ?? "",
    catatan: initial?.catatan ?? "",
    tracking_input: initialTrackingInput
  });
  const [error, setError] = useState<Record<string, string>>({});

  // Smart parse: user boleh ketik IMEI 15 digit langsung atau paste link.
  const parsed = useMemo(
    () => parseTrackingInput(form.tracking_input),
    [form.tracking_input]
  );

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.kode_unit.trim()) errs.kode_unit = "Kode unit wajib diisi";
    if (!form.no_polisi.trim()) errs.no_polisi = "No polisi wajib diisi";
    if (form.tracking_input.trim() && !parsed.imei)
      errs.tracking_input =
        "Format tidak dikenali. Masukkan IMEI 15 digit atau paste link TrackSolid lengkap.";
    setError(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);

    const payload = {
      kode_unit: form.kode_unit,
      jenis_unit_id: form.jenis_unit_id,
      no_polisi: form.no_polisi,
      tahun: form.tahun ? Number(form.tahun) : null,
      default_driver_id: form.default_driver_id || null,
      catatan: form.catatan,
      imei_gps: parsed.imei,
      tracksolid_share_link: parsed.shareLink
    };

    const res =
      mode === "new"
        ? await createUnitAction({ ...payload, status: form.status })
        : await updateUnitAction(initial!.id, payload);
    setLoading(false);
    if (res.ok) {
      toast.success(
        mode === "new" ? "Unit berhasil ditambahkan" : "Perubahan disimpan"
      );
      router.push("/units");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[640px]">
      <Card>
        <CardHeader
          title={mode === "new" ? "Tambah unit baru" : "Edit unit"}
          description="Data dasar armada"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kode unit" required hint="Contoh: SL29, TH67">
            <Input
              placeholder="Kode unit"
              value={form.kode_unit}
              onChange={(e) => set("kode_unit", e.target.value.toUpperCase())}
              error={error.kode_unit}
            />
          </Field>
          <Field label="Jenis unit" required>
            <Select
              value={form.jenis_unit_id}
              onChange={(e) => set("jenis_unit_id", e.target.value)}
            >
              {jenisUnitList.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nama}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="No polisi" required>
            <Input
              placeholder="B 9123 ABC"
              value={form.no_polisi}
              onChange={(e) => set("no_polisi", e.target.value)}
              error={error.no_polisi}
            />
          </Field>
          <Field label="Tahun">
            <Input
              type="number"
              placeholder="2020"
              value={form.tahun}
              onChange={(e) => set("tahun", e.target.value)}
            />
          </Field>
          <Field
            label="Driver tetap"
            hint="1 driver hanya boleh untuk 1 unit. Driver yang sudah dipakai unit lain di-disable."
            className="sm:col-span-2"
          >
            <Select
              value={form.default_driver_id ?? ""}
              onChange={(e) => set("default_driver_id", e.target.value)}
            >
              <option value="">— Belum ditugaskan —</option>
              {drivers.map((d) => {
                const takenBy = driverAssignments[d.id];
                // Driver sedang dipakai unit ini sendiri → tetap enabled
                const takenByOther =
                  takenBy && takenBy.unit_id !== initial?.id ? takenBy : null;
                return (
                  <option
                    key={d.id}
                    value={d.id}
                    disabled={!!takenByOther}
                  >
                    {d.nama} — {d.no_hp}
                    {takenByOther ? ` (sudah di ${takenByOther.kode_unit})` : ""}
                  </option>
                );
              })}
            </Select>
          </Field>
          {mode === "new" && (
            <Field label="Status awal">
              <Select
                value={form.status}
                onChange={(e) => set("status", e.target.value as UnitStatus)}
              >
                <option value="standby">Standby</option>
                <option value="perbaikan">Perbaikan</option>
              </Select>
            </Field>
          )}
          <Field
            label="Tracking GPS (IMEI atau link TrackSolid)"
            className="sm:col-span-2"
            hint="Ketik 15 digit IMEI device GPS langsung, atau paste link TrackSolid lengkap — sistem akan extract IMEI otomatis."
          >
            <Input
              placeholder="353701093101554 — atau paste link TrackSolid"
              value={form.tracking_input}
              onChange={(e) => set("tracking_input", e.target.value)}
              error={error.tracking_input}
              className="mono"
            />
            {form.tracking_input.trim() && (
              <div
                className="mt-2 text-[11px]"
                style={{
                  color: parsed.imei
                    ? "var(--brand-primary-dark)"
                    : "var(--status-danger-text)"
                }}
              >
                {parsed.imei
                  ? `IMEI: ${parsed.imei}${parsed.shareLink ? " (di-extract dari link)" : ""}`
                  : "Format tidak dikenali"}
              </div>
            )}
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea
              placeholder="Catatan tambahan (opsional)"
              value={form.catatan ?? ""}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </Field>
        </div>
      </Card>
      <div className="flex items-center justify-end gap-2">
        <Link href="/units">
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" loading={loading}>
          {mode === "new" ? "Simpan unit" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}
