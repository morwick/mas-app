"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PowerOff } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  createCustomerAction,
  deactivateCustomerAction,
  updateCustomerAction
} from "@/lib/actions/customers";
import type { Customer } from "@/lib/types";

interface Props {
  mode: "new" | "edit";
  initial?: Customer;
}

export function CustomerForm({ mode, initial }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [deactOpen, setDeactOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    nama_perusahaan: initial?.nama_perusahaan ?? "",
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
    if (!form.nama_perusahaan.trim())
      errs.nama_perusahaan = "Nama perusahaan wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    const res =
      mode === "new"
        ? await createCustomerAction(form)
        : await updateCustomerAction(initial!.id, form);
    setLoading(false);
    if (res.ok) {
      toast.success(
        mode === "new" ? "Customer berhasil ditambahkan" : "Perubahan disimpan"
      );
      router.push("/customers");
      router.refresh();
    } else toast.error(res.error);
  }

  async function onDeactivate() {
    setPending(true);
    await deactivateCustomerAction(initial!.id);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[640px]">
      <Card>
        <CardHeader
          title={mode === "new" ? "Tambah customer" : "Edit customer"}
          description="Data perusahaan customer"
        />
        <div className="flex flex-col gap-4">
          <Field label="Nama perusahaan" required>
            <Input
              placeholder="PT. Contoh Sukses"
              value={form.nama_perusahaan}
              onChange={(e) => set("nama_perusahaan", e.target.value)}
              error={error.nama_perusahaan}
            />
          </Field>
          <Field label="Alamat">
            <Textarea
              placeholder="Alamat kantor / project utama"
              value={form.alamat ?? ""}
              onChange={(e) => set("alamat", e.target.value)}
            />
          </Field>
          <Field label="Catatan">
            <Textarea
              placeholder="Catatan kerjasama (opsional)"
              value={form.catatan ?? ""}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </Field>
        </div>
      </Card>

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
          <Link href="/customers">
            <Button variant="secondary" type="button">
              Batal
            </Button>
          </Link>
          <Button type="submit" loading={loading}>
            {mode === "new" ? "Simpan customer" : "Simpan perubahan"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={deactOpen}
        onClose={() => setDeactOpen(false)}
        title={`Nonaktifkan customer ${initial?.nama_perusahaan}?`}
        body="Customer yang dinonaktifkan tidak akan muncul di pemilihan job baru."
        confirmText="Ya, nonaktifkan"
        variant="danger"
        loading={pending}
        onConfirm={onDeactivate}
      />
    </form>
  );
}
