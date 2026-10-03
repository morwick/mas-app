import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import {
  createAsuransi,
  updateAsuransi,
  type Asuransi,
  type AsuransiPicInput,
  type BengkelRekananInput,
  type Sapaan
} from "../api";

interface Props {
  mode: "new" | "edit";
  initial?: Asuransi;
}

const picKosong = (utama: boolean): AsuransiPicInput => ({
  id: null,
  sapaan: null,
  nama: "",
  jabatan: null,
  no_hp: "",
  email: null,
  is_utama: utama
});

const kosongkan = (v: string) => v.trim() || null;

/** Validasi PIC: nama & no HP wajib, no HP 8–15 digit, tepat satu PIC utama. */
export function periksaPic(pic: AsuransiPicInput[]): Record<number, string> {
  const err: Record<number, string> = {};
  pic.forEach((p, i) => {
    const digit = p.no_hp.replace(/[^0-9]/g, "");
    if (!p.nama.trim()) err[i] = "Nama PIC wajib diisi";
    else if (!p.no_hp.trim()) err[i] = "No HP PIC wajib diisi";
    else if (digit.length < 8 || digit.length > 15) err[i] = "No HP PIC tidak valid (8–15 digit)";
  });
  return err;
}

export function AsuransiForm({ mode, initial }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [nama, setNama] = useState(initial?.nama ?? "");
  const [alamat, setAlamat] = useState(initial?.alamat ?? "");
  const [telepon, setTelepon] = useState(initial?.telepon ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [catatan, setCatatan] = useState(initial?.catatan ?? "");
  const [pic, setPic] = useState<AsuransiPicInput[]>(
    initial?.pic.length ? initial.pic.map((p) => ({ ...p })) : [picKosong(true)]
  );
  const [bengkel, setBengkel] = useState<BengkelRekananInput[]>(
    initial?.bengkel_rekanan.map((b) => ({ ...b })) ?? []
  );
  const [errNama, setErrNama] = useState("");
  const [errPic, setErrPic] = useState<Record<number, string>>({});

  function ubahPic(i: number, isi: Partial<AsuransiPicInput>) {
    setPic((list) => list.map((p, j) => (j === i ? { ...p, ...isi } : p)));
    setErrPic((e) => ({ ...e, [i]: "" }));
  }
  function jadikanUtama(i: number) {
    setPic((list) => list.map((p, j) => ({ ...p, is_utama: j === i })));
  }
  function hapusPic(i: number) {
    setPic((list) => {
      const sisa = list.filter((_, j) => j !== i);
      if (sisa.length && !sisa.some((p) => p.is_utama)) sisa[0] = { ...sisa[0], is_utama: true };
      return sisa;
    });
    setErrPic({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eNama = nama.trim() ? "" : "Nama asuransi wajib diisi";
    const ePic = periksaPic(pic);
    setErrNama(eNama);
    setErrPic(ePic);
    const eBengkel = bengkel.some((b) => !b.nama.trim());
    if (eNama || Object.keys(ePic).length || eBengkel) {
      toast.error(
        `${mode === "new" ? "Gagal menambah data" : "Gagal mengubah data"}. ${
          eNama || Object.values(ePic)[0] || "Nama bengkel rekanan wajib diisi"
        }`
      );
      return;
    }
    const input = {
      nama: nama.trim(),
      alamat: kosongkan(alamat),
      telepon: kosongkan(telepon),
      email: kosongkan(email),
      catatan: kosongkan(catatan),
      pic: pic.map((p) => ({
        ...p,
        nama: p.nama.trim(),
        no_hp: p.no_hp.trim(),
        jabatan: p.jabatan?.trim() || null,
        email: p.email?.trim() || null
      })),
      bengkel_rekanan: bengkel.map((b) => ({
        ...b,
        nama: b.nama.trim(),
        alamat: b.alamat?.trim() || null,
        kontak: b.kontak?.trim() || null
      }))
    };
    setLoading(true);
    const res = mode === "new" ? await createAsuransi(input) : await updateAsuransi(initial!.id, input);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(mode === "new" ? `Asuransi ${input.nama} ditambahkan` : "Perubahan disimpan");
    const id = mode === "new" ? (res.data as Asuransi).id : initial!.id;
    navigate(`/asuransi/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader title={mode === "new" ? "Tambah asuransi" : "Edit asuransi"} description="Data perusahaan asuransi" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama perusahaan asuransi" required className="sm:col-span-2">
            <Input
              value={nama}
              onChange={(e) => {
                setNama(e.target.value);
                setErrNama("");
              }}
              placeholder="mis. Asuransi Sinar Mas"
              error={errNama}
            />
          </Field>
          <Field label="Telepon kantor">
            <Input type="tel" value={telepon} onChange={(e) => setTelepon(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Alamat" className="sm:col-span-2">
            <Textarea value={alamat} onChange={(e) => setAlamat(e.target.value)} />
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="PIC yang bisa dihubungi"
          description="Minimal satu. Tandai satu sebagai PIC utama — tampil di detail unit & perintah kerja."
        />
        <div className="flex flex-col gap-3">
          {pic.map((p, i) => (
            <div
              key={p.id ?? `baru-${i}`}
              className="grid gap-3 sm:grid-cols-6"
              style={{ padding: 12, border: "0.5px solid var(--border-default)", borderRadius: 10 }}
            >
              <Field label="Sapaan" className="sm:col-span-1">
                <Select
                  value={p.sapaan ?? ""}
                  onChange={(e) => ubahPic(i, { sapaan: (e.target.value || null) as Sapaan | null })}
                >
                  <option value="">—</option>
                  <option value="Bapak">Bapak</option>
                  <option value="Ibu">Ibu</option>
                </Select>
              </Field>
              <Field label="Nama PIC" required className="sm:col-span-3">
                <Input value={p.nama} onChange={(e) => ubahPic(i, { nama: e.target.value })} error={errPic[i]} />
              </Field>
              <Field label="Jabatan / bagian" className="sm:col-span-2">
                <Input
                  value={p.jabatan ?? ""}
                  onChange={(e) => ubahPic(i, { jabatan: e.target.value })}
                  placeholder="mis. Klaim"
                />
              </Field>
              <Field label="No HP" required className="sm:col-span-2">
                <Input type="tel" value={p.no_hp} onChange={(e) => ubahPic(i, { no_hp: e.target.value })} />
              </Field>
              <Field label="Email" className="sm:col-span-2">
                <Input type="email" value={p.email ?? ""} onChange={(e) => ubahPic(i, { email: e.target.value })} />
              </Field>
              <div className="sm:col-span-2 flex items-end gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  variant={p.is_utama ? "primary" : "secondary"}
                  leftIcon={<Star className="w-3.5 h-3.5" />}
                  onClick={() => jadikanUtama(i)}
                >
                  {p.is_utama ? "PIC utama" : "Jadikan utama"}
                </Button>
                {pic.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Hapus PIC"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => hapusPic(i)}
                  />
                )}
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setPic((list) => [...list, picKosong(false)])}
            >
              Tambah PIC
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Bengkel rekanan (opsional)"
          description="Bengkel yang bekerja sama dengan asuransi ini — dipilih saat perbaikan diklaim ke asuransi."
        />
        <div className="flex flex-col gap-3">
          {bengkel.map((b, i) => (
            <div key={b.id ?? `baru-${i}`} className="grid gap-3 sm:grid-cols-6 items-end">
              <Field label="Nama bengkel" required className="sm:col-span-2">
                <Input
                  value={b.nama}
                  onChange={(e) =>
                    setBengkel((list) => list.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Alamat" className="sm:col-span-2">
                <Input
                  value={b.alamat ?? ""}
                  onChange={(e) =>
                    setBengkel((list) => list.map((x, j) => (j === i ? { ...x, alamat: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Kontak" className="sm:col-span-1">
                <Input
                  value={b.kontak ?? ""}
                  onChange={(e) =>
                    setBengkel((list) => list.map((x, j) => (j === i ? { ...x, kontak: e.target.value } : x)))
                  }
                />
              </Field>
              <div className="sm:col-span-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Hapus bengkel rekanan"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setBengkel((list) => list.filter((_, j) => j !== i))}
                />
              </div>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setBengkel((list) => [...list, { id: null, nama: "", alamat: null, kontak: null }])}
            >
              Tambah bengkel rekanan
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link to={mode === "edit" && initial ? `/asuransi/${initial.id}` : "/asuransi"}>
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" loading={loading}>
          {mode === "new" ? "Simpan asuransi" : "Simpan perubahan"}
        </Button>
      </div>
      <LoadingOverlay message={loading ? "Menyimpan data asuransi…" : null} />
    </form>
  );
}
