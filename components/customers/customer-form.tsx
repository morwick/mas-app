"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PowerOff } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
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
    catatan: initial?.catatan ?? "",
    kota: initial?.kota ?? "",
    npwp: initial?.npwp ?? "",
    nib: initial?.nib ?? "",
    status_pkp: initial?.status_pkp ?? false,
    termin_hari: initial?.termin_hari != null ? String(initial.termin_hari) : "",
    pic_sapaan: initial?.pic_sapaan ?? "Bapak",
    pic_nama: initial?.pic_nama ?? "",
    pic_jabatan: initial?.pic_jabatan ?? "",
    pic_no_hp: initial?.pic_no_hp ?? "",
    pic_email: initial?.pic_email ?? ""
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
    const payload = {
      ...form,
      pic_sapaan: form.pic_sapaan as "Bapak" | "Ibu",
      termin_hari: form.termin_hari.trim() ? Number(form.termin_hari) : null
    };
    const res =
      mode === "new"
        ? await createCustomerAction(payload)
        : await updateCustomerAction(initial!.id, payload);
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
          <Field
            label="Kota"
            hint="Dipakai di baris “Di ___” pada surat penawaran"
          >
            <Input
              placeholder="Pekanbaru"
              value={form.kota ?? ""}
              onChange={(e) => set("kota", e.target.value)}
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

      <Card>
        <CardHeader
          title="PIC customer"
          description="Kontak yang dituju di surat penawaran dan diajak berkoordinasi"
        />
        <div className="flex flex-col gap-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: "110px 1fr" }}>
            <Field label="Sapaan">
              <Select
                value={form.pic_sapaan ?? "Bapak"}
                onChange={(e) => set("pic_sapaan", e.target.value as "Bapak" | "Ibu")}
              >
                <option value="Bapak">Bapak</option>
                <option value="Ibu">Ibu</option>
              </Select>
            </Field>
            <Field label="Nama PIC">
              <Input
                placeholder="Afiq"
                value={form.pic_nama ?? ""}
                onChange={(e) => set("pic_nama", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Jabatan">
            <Input
              placeholder="Manager Logistik"
              value={form.pic_jabatan ?? ""}
              onChange={(e) => set("pic_jabatan", e.target.value)}
            />
          </Field>
          <Field
            label="No HP / WhatsApp"
            hint="Dipakai tombol kirim penawaran via WhatsApp"
          >
            <Input
              placeholder="08xxxxxxxxxx"
              value={form.pic_no_hp ?? ""}
              onChange={(e) => set("pic_no_hp", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              placeholder="pic@perusahaan.co.id"
              value={form.pic_email ?? ""}
              onChange={(e) => set("pic_email", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Legalitas & pembayaran"
          description="Diperlukan saat penerbitan invoice"
        />
        <div className="flex flex-col gap-4">
          <Field label="NPWP">
            <Input
              placeholder="00.000.000.0-000.000"
              value={form.npwp ?? ""}
              onChange={(e) => set("npwp", e.target.value)}
            />
          </Field>
          <Field label="NIB">
            <Input
              value={form.nib ?? ""}
              onChange={(e) => set("nib", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input
              type="checkbox"
              checked={form.status_pkp}
              onChange={(e) => set("status_pkp", e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Customer berstatus PKP (dikenakan PPN)
          </label>
          <Field
            label="Termin pembayaran"
            hint="Jumlah hari sejak invoice terbit. Kosongkan bila cash."
          >
            <Input
              type="number"
              min={0}
              placeholder="30"
              value={form.termin_hari}
              onChange={(e) => set("termin_hari", e.target.value)}
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
