import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";

const PHONE_RE = /^(08|\+628)\d{7,12}$/;

export interface NewCustomerDraft {
  nama_perusahaan: string;
  /** PIC & no HP wajib — job selalu butuh kontak yang bisa dihubungi. */
  pic_nama: string;
  pic_no_hp: string;
  alamat?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Kembalikan true bila customer benar-benar tersimpan; false menahan isian. */
  onCreate: (data: NewCustomerDraft) => boolean | Promise<boolean>;
}

const EMPTY = { nama: "", picNama: "", picNoHp: "", alamat: "" };

export function NewCustomerInline({ open, onClose, onCreate }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.nama.trim()) errs.nama = "Nama perusahaan wajib diisi";
    if (!form.picNama.trim()) errs.picNama = "PIC wajib diisi";
    if (!form.picNoHp.trim()) errs.picNoHp = "No telepon PIC wajib diisi";
    else if (!PHONE_RE.test(form.picNoHp.trim()))
      errs.picNoHp = "Format: 08xxxxxxxxxx atau +628xxxxxxxxxx";
    setErr(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const ok = await onCreate({
      nama_perusahaan: form.nama.trim(),
      pic_nama: form.picNama.trim(),
      pic_no_hp: form.picNoHp.trim(),
      alamat: form.alamat.trim() || undefined
    });
    setLoading(false);
    // Gagal simpan → isian dibiarkan supaya tidak perlu diketik ulang.
    if (!ok) return;
    setForm(EMPTY);
    setErr({});
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
            value={form.nama}
            onChange={(e) => set("nama", e.target.value)}
            error={err.nama}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
          <Field
            label="PIC"
            required
            hint="Dipakai sebagai PIC awal job, masih bisa diganti."
          >
            <Input
              placeholder="Bapak/Ibu nama"
              value={form.picNama}
              onChange={(e) => set("picNama", e.target.value)}
              error={err.picNama}
            />
          </Field>
          <Field label="No telepon PIC" required>
            <Input
              type="tel"
              placeholder="0812xxxxxxxx"
              value={form.picNoHp}
              onChange={(e) => set("picNoHp", e.target.value)}
              error={err.picNoHp}
              className="mono"
            />
          </Field>
        </div>
        <Field label="Alamat">
          <Textarea
            placeholder="Alamat kantor (opsional)"
            value={form.alamat}
            onChange={(e) => set("alamat", e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
