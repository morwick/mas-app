"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    nama_perusahaan: string;
    alamat?: string;
  }) => void | Promise<void>;
}

export function NewCustomerInline({ open, onClose, onCreate }: Props) {
  const [nama, setNama] = useState("");
  const [alamat, setAlamat] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!nama.trim()) {
      setErr("Nama wajib diisi");
      return;
    }
    setLoading(true);
    await onCreate({
      nama_perusahaan: nama.trim(),
      alamat: alamat.trim() || undefined
    });
    setLoading(false);
    setNama("");
    setAlamat("");
    setErr("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah customer baru"
      description="Customer akan otomatis terpilih untuk job ini."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button onClick={submit} loading={loading}>
            Simpan & pilih
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Nama perusahaan" required>
          <Input
            placeholder="PT. Contoh Sukses"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            error={err}
          />
        </Field>
        <Field label="Alamat">
          <Textarea
            placeholder="Alamat kantor (opsional)"
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
