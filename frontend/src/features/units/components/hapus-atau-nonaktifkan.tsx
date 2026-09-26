import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PowerOff, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { deactivateUnit, deleteUnit, getUnitRiwayat } from "@/features/units/api";
import {
  deleteUnitTrailer,
  getUnitTrailerRiwayat,
  nonaktifkanUnitTrailer
} from "@/features/unit-trailer/api";
import type { RiwayatAset } from "@/types";

type JenisAset = "unit" | "unit_trailer";

const JENIS: Record<
  JenisAset,
  {
    label: string;
    daftar: string;
    riwayat: (id: string) => Promise<RiwayatAset>;
    hapus: typeof deleteUnit;
    nonaktifkan: typeof deactivateUnit;
  }
> = {
  unit: { label: "unit", daftar: "/units", riwayat: getUnitRiwayat, hapus: deleteUnit, nonaktifkan: deactivateUnit },
  unit_trailer: {
    label: "unit trailer",
    daftar: "/unit-trailer",
    riwayat: getUnitTrailerRiwayat,
    hapus: deleteUnitTrailer,
    nonaktifkan: nonaktifkanUnitTrailer
  }
};

const style = { justifyContent: "flex-start", color: "#C13838", borderColor: "#F5C0C0" } as const;

/**
 * Aset tanpa riwayat job, insiden, service, penjualan, dan penghapusan boleh
 * DIHAPUS — hilang dari aplikasi seakan tidak pernah ada. Aset yang sudah
 * punya riwayat hanya bisa DINONAKTIFKAN (server juga menolak hapusnya).
 */
export function HapusAtauNonaktifkan({
  jenis,
  id,
  kode,
  isActive
}: {
  jenis: JenisAset;
  id: string;
  kode: string;
  isActive: boolean;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const cfg = JENIS[jenis];
  const Judul = cfg.label[0].toUpperCase() + cfg.label.slice(1);
  const riwayat = useQuery({ queryKey: [jenis, "riwayat", id], queryFn: () => cfg.riwayat(id) });
  const [konfirmasi, setKonfirmasi] = useState<"hapus" | "nonaktifkan" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function jalankan() {
    const aksi = konfirmasi;
    setKonfirmasi(null);
    if (aksi === "hapus") {
      setBusy(`Menghapus ${kode}…`);
      const res = await cfg.hapus(id);
      setBusy(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(`${Judul} ${kode} dihapus`);
      navigate(cfg.daftar);
    } else if (aksi === "nonaktifkan") {
      setBusy(`Menonaktifkan ${kode}…`);
      const res = await cfg.nonaktifkan(id);
      setBusy(null);
      if (!res.ok) return toast.error(res.error);
      toast.success(`${Judul} ${kode} dinonaktifkan`);
    }
  }

  if (riwayat.isPending) return <div className="caption">Memeriksa riwayat {cfg.label}…</div>;
  if (riwayat.isError) return null;
  const bisaDihapus = riwayat.data.bisa_dihapus;
  if (!bisaDihapus && !isActive) return <div className="caption">{Judul} ini sudah nonaktif.</div>;

  return (
    <>
      {bisaDihapus ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={style}
          onClick={() => setKonfirmasi("hapus")}
          disabled={busy !== null}
        >
          <Trash2 style={{ width: 16, height: 16 }} /> Hapus {cfg.label}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          style={style}
          onClick={() => setKonfirmasi("nonaktifkan")}
          disabled={busy !== null}
        >
          <PowerOff style={{ width: 16, height: 16 }} /> Nonaktifkan {cfg.label}
        </button>
      )}
      <ConfirmDialog
        open={konfirmasi === "hapus"}
        onClose={() => setKonfirmasi(null)}
        title={`Hapus ${cfg.label} ${kode}?`}
        body={`Ini menghapus bersih segala informasi ${cfg.label} ${kode}, seakan-akan ${cfg.label} ini tidak pernah ada. Hanya bisa dilakukan karena ${cfg.label} ini belum punya riwayat job, insiden, service, penjualan, maupun penghapusan.`}
        confirmText="Ya, hapus bersih"
        variant="danger"
        onConfirm={jalankan}
      />
      <ConfirmDialog
        open={konfirmasi === "nonaktifkan"}
        onClose={() => setKonfirmasi(null)}
        title={`Nonaktifkan ${cfg.label} ${kode}?`}
        body={`${Judul} yang dinonaktifkan tidak akan muncul di pemilihan job baru. Data riwayat tetap tersimpan — ${cfg.label} ini tidak bisa dihapus karena sudah punya riwayat.`}
        confirmText="Ya, nonaktifkan"
        variant="danger"
        onConfirm={jalankan}
      />
      <LoadingOverlay message={busy} />
    </>
  );
}
