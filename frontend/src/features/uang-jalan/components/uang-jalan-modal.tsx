import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useToast } from "@/components/ui/toast";
import { Combobox } from "@/components/ui/combobox";
import {
  createPencairan,
  createUangJalan,
  updateUangJalan
} from "@/features/uang-jalan/api";
import { formatRupiah, hariIniWIB } from "@/lib/utils";
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
  return hariIniWIB();
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
      setJumlah(String(Math.round(existing.jumlah)));
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

  // BATASAN: uang yang diberikan ke driver tidak boleh melebihi uang jalan job
  // (awal + tambahan). Saat mengubah pencairan lama, nominal lamanya ikut
  // dihitung sebagai sisa. Dijaga juga di database (migration 20261001000007).
  const batasPemberian =
    ringkasan.sisa + (existing?.jenis === "pencairan" ? Math.round(existing.jumlah) : 0);
  const melebihiUangJalan = pencairan && angka > batasPemberian;

  async function submit() {
    if (angka <= 0) {
      toast.error("Jumlah harus diisi");
      return;
    }
    if (melebihiUangJalan) {
      toast.error(
        `Melebihi sisa uang jalan ${formatRupiah(Math.max(batasPemberian, 0))}. Catat tambahan uang jalan dulu bila memang perlu lebih.`
      );
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
          : "Uang jalan ditambah"
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
          : "Kesepakatan menambah uang jalan — belum ada uang yang berpindah."
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
          {(["pencairan", "tambahan"] as const).map((j) => (
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
              {j === "pencairan" ? "Kasih uang" : "Tambah uang jalan"}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tanggal" required>
          <DateInput
            value={tanggal}
            onChange={(v) => setTanggal(v)}
          />
        </Field>
        <Field label="Jumlah" required>
          <CurrencyInput
            placeholder="0"
            value={jumlah}
            onChange={setJumlah}
          />
        </Field>
      </div>

      {pencairan && (
        <Field label="Dari kas" required>
          <Combobox
            value={sumberId}
            onChange={setSumberId}
            options={sumberDana.map((s) => ({ value: s.id, label: s.nama }))}
            placeholder="— pilih —"
            searchPlaceholder="Cari kas / rekening…"
          />
        </Field>
      )}

      <Field
        label={pencairan ? "Keperluan" : "Alasan penambahan"}
        hint={
          pencairan
            ? "Boleh dikosongkan"
            : "Ini yang nanti menjelaskan kenapa uang jalan bertambah"
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

      {melebihiUangJalan && (
        <div
          style={{
            background: "#fdf1f1",
            border: "1px solid #f5c2c2",
            borderRadius: 8,
            padding: "9px 11px",
            fontSize: 12.5,
            color: "#a32b2b"
          }}
        >
          Jumlah ini melebihi sisa uang jalan {formatRupiah(Math.max(batasPemberian, 0))} dan tidak bisa
          disimpan. Bila memang perlu lebih, catat dulu sebagai tambah uang jalan.
        </div>
      )}
    </Modal>
  );
}
