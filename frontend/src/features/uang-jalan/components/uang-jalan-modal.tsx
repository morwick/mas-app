import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  createPencairan,
  createUangJalan,
  updateUangJalan
} from "@/features/uang-jalan/api";
import { formatRupiah } from "@/lib/utils";
import type { SumberDana, UangJalan, UangJalanRequest, UangJalanRingkasan } from "@/types";

/**
 * Keperluan yang sudah biasa dipakai admin di komentar sel Excel. Ditawarkan
 * sebagai pilihan cepat, tapi kolomnya tetap bebas diketik — kebiasaan
 * penulisan tidak boleh dipaksa berubah hanya karena pindah aplikasi.
 */
const KEPERLUAN_UMUM = ["Solar Ketengan", "Dex", "Pot Hutang"];

interface Props {
  open: boolean;
  onClose: () => void;
  jobId: string;
  sumberDana: SumberDana[];
  ringkasan: UangJalanRingkasan;
  /** Diisi kalau sedang mengubah baris yang sudah ada. */
  existing?: UangJalan | null;
  /** Diisi kalau pencairan ini memenuhi pengajuan driver (nominal terisi otomatis). */
  request?: UangJalanRequest | null;
  onSaved: () => void;
}

function hariIni() {
  return new Date().toISOString().slice(0, 10);
}

export function UangJalanModal({
  open,
  onClose,
  jobId,
  sumberDana,
  ringkasan,
  existing,
  request,
  onSaved
}: Props) {
  const toast = useToast();
  const [jenis, setJenis] = useState<UangJalan["jenis"]>("pencairan");
  const [tanggal, setTanggal] = useState(hariIni());
  const [jumlah, setJumlah] = useState("");
  const [sumberId, setSumberId] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bukti, setBukti] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setJenis(existing.jenis);
      setTanggal(existing.tanggal.slice(0, 10));
      setJumlah(String(existing.jumlah));
      setSumberId(existing.sumber_dana_id ?? "");
      setKeperluan(existing.keperluan ?? "");
      setCatatan(existing.catatan ?? "");
    } else {
      setJenis("pencairan");
      setTanggal(hariIni());
      setJumlah(request ? String(Math.round(request.nominal)) : "");
      setBukti(null);
      // Kas yang paling sering dipakai ada di urutan pertama, jadi admin
      // biasanya tidak perlu menyentuh pilihan ini sama sekali.
      setSumberId(sumberDana[0]?.id ?? "");
      setKeperluan(request?.catatan ?? "");
      setCatatan("");
    }
  }, [open, existing, request, sumberDana]);

  const angka = Number(jumlah.replace(/[^\d]/g, "")) || 0;
  const pencairan = jenis === "pencairan";

  // Ditampilkan sebagai peringatan, bukan penghalang: pencairan melebihi pagu
  // memang terjadi di lapangan dan justru itu yang perlu terlihat.
  const lewatPagu = pencairan && angka > ringkasan.sisa && ringkasan.pagu > 0;

  async function submit() {
    if (angka <= 0) {
      toast.error("Jumlah harus diisi");
      return;
    }
    if (pencairan && !existing && !bukti) {
      toast.error("Foto bukti transfer wajib dilampirkan");
      return;
    }
    if (pencairan && !sumberId) {
      toast.error("Pilih kas sumber dana");
      return;
    }
    setSubmitting(true);
    const input = {
      job_id: jobId,
      jenis,
      tanggal,
      jumlah: angka,
      sumber_dana_id: pencairan ? sumberId : null,
      keperluan: keperluan || null,
      catatan: catatan || null
    };
    const res = existing
      ? await updateUangJalan(existing.id, input)
      : pencairan
        ? await createPencairan(
            { ...input, sumber_dana_id: sumberId, request_id: request?.id ?? null },
            bukti as File
          )
        : await createUangJalan(input);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      existing
        ? "Perubahan tersimpan"
        : pencairan
          ? "Sudah dicatat"
          : "Pagu dinaikkan"
    );
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        existing ? "Ubah catatan uang jalan" : request ? "Cairkan pengajuan driver" : "Catat uang jalan"
      }
      description={
        pencairan
          ? "Uang yang benar-benar keluar dari kas ke supir — wajib dengan foto bukti transfer."
          : "Kesepakatan menaikkan pagu — belum ada uang yang berpindah."
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            Simpan
          </Button>
        </div>
      }
    >
      <Field label="Jenis" required>
        <div style={{ display: "flex", gap: 8 }}>
          {(["pencairan", "penambahan_pagu"] as const).map((j) => (
            <button
              key={j}
              type="button"
              disabled={Boolean(request) && j !== "pencairan"}
              onClick={() => setJenis(j)}
              className="btn btn-sm"
              style={{
                flex: 1,
                background:
                  jenis === j ? "var(--brand-primary)" : "var(--bg-subtle)",
                color: jenis === j ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                fontWeight: 600
              }}
            >
              {j === "pencairan" ? "Kasih uang" : "Tambah pagu"}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tanggal" required>
          <Input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </Field>
        <Field
          label="Jumlah"
          required
          hint={angka > 0 ? formatRupiah(angka) : undefined}
        >
          <Input
            inputMode="numeric"
            placeholder="0"
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
      </div>

      {pencairan && (
        <Field label="Dari kas" required>
          <Select
            value={sumberId}
            onChange={(e) => setSumberId(e.target.value)}
          >
            <option value="">— pilih —</option>
            {sumberDana.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label={pencairan ? "Keperluan" : "Alasan penambahan"}
        hint={
          pencairan
            ? "Boleh dikosongkan"
            : "Ini yang nanti menjelaskan kenapa pagu membengkak"
        }
      >
        <Input
          value={keperluan}
          onChange={(e) => setKeperluan(e.target.value)}
          placeholder={pencairan ? "Solar Ketengan" : "Ban pecah di Lampung"}
          list="keperluan-umum"
        />
        {pencairan && (
          <>
            <datalist id="keperluan-umum">
              {KEPERLUAN_UMUM.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {KEPERLUAN_UMUM.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKeperluan(k)}
                  className="btn btn-sm"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    fontSize: 11.5,
                    padding: "3px 9px"
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        )}
      </Field>

      {pencairan && !existing && (
        <Field
          label="Foto bukti transfer"
          required
          hint="Setelah tersimpan, kunci perjalanan driver terbuka dan driver dapat notifikasi."
        >
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setBukti(e.target.files?.[0] ?? null)}
            className="text-[13px]"
          />
          {bukti && (
            <div className="caption" style={{ marginTop: 4 }}>
              {bukti.name}
            </div>
          )}
        </Field>
      )}

      <Field label="Catatan (opsional)">
        <Textarea
          rows={2}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
        />
      </Field>

      {lewatPagu && (
        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "9px 11px",
            fontSize: 12.5,
            color: "#9a3412"
          }}
        >
          Jumlah ini melebihi sisa pagu {formatRupiah(ringkasan.sisa)}. Tetap
          bisa disimpan — kalau memang pagunya naik, catat dulu sebagai tambah
          pagu supaya sisanya tidak minus.
        </div>
      )}
    </Modal>
  );
}
