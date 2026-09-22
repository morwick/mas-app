"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DriverPinCard } from "./driver-pin-card";
import { PowerOff } from "lucide-react";
import {
  createDriverAction,
  deactivateDriverAction,
  updateDriverAction
} from "@/lib/actions/drivers";
import type { Driver } from "@/lib/types";

interface Props {
  mode: "new" | "edit";
  initial?: Driver;
}

export function DriverForm({ mode, initial }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [deactOpen, setDeactOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    nama: initial?.nama ?? "",
    no_hp: initial?.no_hp ?? "",
    no_sim: initial?.no_sim ?? "",
    sim_berlaku_sampai: initial?.sim_berlaku_sampai ?? "",
    alamat: initial?.alamat ?? "",
    catatan: initial?.catatan ?? ""
  });
  const [error, setError] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.nama.trim()) errs.nama = "Nama wajib diisi";
    if (!form.no_hp.trim()) errs.no_hp = "No HP wajib diisi";
    else if (!/^(08|\+628)\d{7,12}$/.test(form.no_hp))
      errs.no_hp = "Format: 08xxxxxxxxxx atau +628xxxxxxxxxx";
    setError(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const res =
      mode === "new"
        ? await createDriverAction(form)
        : await updateDriverAction(initial!.id, form);
    setLoading(false);
    if (res.ok) {
      toast.success(
        mode === "new" ? "Driver berhasil ditambahkan" : "Perubahan disimpan"
      );
      router.push("/drivers");
      router.refresh();
    } else toast.error(res.error);
  }

  async function onDeactivate() {
    setPending(true);
    await deactivateDriverAction(initial!.id);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[640px]">
      <Card>
        <CardHeader
          title={mode === "new" ? "Tambah driver" : "Edit driver"}
          description="Data identitas driver"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama" required className="sm:col-span-2">
            <Input
              placeholder="Nama lengkap"
              value={form.nama}
              onChange={(e) => set("nama", e.target.value)}
              error={error.nama}
            />
          </Field>
          <Field label="No HP" required hint="Format: 08xxxxxxxxxx">
            <Input
              type="tel"
              placeholder="0812xxxxxxxx"
              value={form.no_hp}
              onChange={(e) => set("no_hp", e.target.value)}
              error={error.no_hp}
            />
          </Field>
          <Field label="No SIM">
            <Input
              placeholder="B II Umum"
              value={form.no_sim ?? ""}
              onChange={(e) => set("no_sim", e.target.value)}
            />
          </Field>
          {/* Nomor SIM saja tidak memberi tahu apa pun soal layak jalan —
              yang menentukan adalah masa berlakunya. */}
          <Field label="SIM berlaku sampai" hint="Dipakai untuk pengingat">
            <Input
              type="date"
              value={form.sim_berlaku_sampai ?? ""}
              onChange={(e) => set("sim_berlaku_sampai", e.target.value)}
            />
          </Field>
          <Field label="Alamat" className="sm:col-span-2">
            <Textarea
              placeholder="Alamat tempat tinggal (opsional)"
              value={form.alamat ?? ""}
              onChange={(e) => set("alamat", e.target.value)}
            />
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea
              placeholder="Catatan internal (opsional)"
              value={form.catatan ?? ""}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {mode === "edit" && initial && <DriverPinCard driver={initial} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {mode === "edit" && initial?.is_active ? (
          <Button
            variant="danger"
            type="button"
            leftIcon={<PowerOff className="w-4 h-4" />}
            onClick={() => setDeactOpen(true)}
          >
            Nonaktifkan
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Link href="/drivers">
            <Button variant="secondary" type="button">
              Batal
            </Button>
          </Link>
          <Button type="submit" loading={loading}>
            {mode === "new" ? "Simpan driver" : "Simpan perubahan"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={deactOpen}
        onClose={() => setDeactOpen(false)}
        title={`Nonaktifkan driver ${initial?.nama}?`}
        body="Driver yang dinonaktifkan tidak akan muncul di pemilihan job baru."
        confirmText="Ya, nonaktifkan"
        variant="danger"
        loading={pending}
        onConfirm={onDeactivate}
      />
    </form>
  );
}
