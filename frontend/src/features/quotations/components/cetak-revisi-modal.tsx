import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { tambahHari } from "@/lib/utils";
import type { Quotation } from "@/types";
import { simpanSuratRevisi } from "../api";
import { tanggalRevisiAwal } from "../surat-revisi";

/**
 * Cetak pertama surat versi revisi: pilih tanggal surat & masa berlakunya,
 * simpan, lalu cetak. Cetak berikutnya langsung memakai tanggal tersimpan.
 * Masa berlaku penawaran di sistem ikut surat revisi (status kedaluwarsa &
 * pengingat), masa berlaku surat asli tetap tersimpan.
 */
export function CetakRevisiModal({
  open,
  onClose,
  quotation
}: {
  open: boolean;
  onClose: () => void;
  quotation: Quotation;
}) {
  const toast = useToast();
  const [nilai, setNilai] = useState(() => tanggalRevisiAwal(quotation));
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (open) setNilai(tanggalRevisiAwal(quotation));
  }, [open, quotation]);

  const error = !nilai.tanggal
    ? "Tanggal surat wajib diisi"
    : !nilai.berlakuSampai
      ? "Berlaku sampai wajib diisi"
      : nilai.berlakuSampai <= nilai.tanggal
        ? "Berlaku sampai harus setelah tanggal surat"
        : null;

  async function simpanDanCetak() {
    if (error || busy) return;
    // Tab dibuka lebih dulu (saat klik) supaya tidak diblokir popup blocker.
    const tab = window.open("", "_blank");
    setBusy("Menyimpan tanggal surat revisi…");
    const res = await simpanSuratRevisi(quotation.id, {
      tanggal: nilai.tanggal,
      berlaku_sampai: nilai.berlakuSampai
    });
    setBusy(null);
    if (!res.ok) {
      tab?.close();
      toast.error(res.error);
      return;
    }
    const url = `/quotations/${quotation.id}/cetak?versi=revisi`;
    if (tab) tab.location.href = url;
    else window.location.href = url;
    toast.success("Tanggal surat revisi disimpan");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cetak surat versi revisi"
      description={`Nomor surat tetap ${quotation.quote_number}. Tanggal ini disimpan (cetak berikutnya memakai tanggal yang sama), dan masa berlaku penawaran di sistem ikut surat revisi.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Batal
          </Button>
          <Button
            leftIcon={<Printer style={{ width: 15, height: 15 }} />}
            onClick={() => void simpanDanCetak()}
            disabled={Boolean(error)}
            loading={busy !== null}
          >
            Simpan & cetak
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Tanggal surat"
          required
          hint="Awalnya tanggal revisi harga terakhir"
        >
          <DateInput
            value={nilai.tanggal}
            onChange={(v) => setNilai((n) => ({ ...n, tanggal: v }))}
            aria-label="Tanggal surat"
          />
        </Field>
        <Field
          label="Berlaku sampai"
          required
          hint="Awalnya tanggal surat + masa berlaku surat asli"
        >
          <DateInput
            value={nilai.berlakuSampai}
            onChange={(v) => setNilai((n) => ({ ...n, berlakuSampai: v }))}
            min={nilai.tanggal ? tambahHari(nilai.tanggal, 1) : undefined}
            aria-label="Berlaku sampai"
            error={nilai.tanggal && nilai.berlakuSampai && error ? error : undefined}
          />
        </Field>
      </div>
      <LoadingOverlay message={busy} />
    </Modal>
  );
}
