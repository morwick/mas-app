import { Link } from "react-router-dom";
import { FileDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export interface DokumenUnduh {
  label: string;
  href: string;
}

/**
 * Muncul tepat setelah transaksi tersimpan: tautan ke dokumen cetaknya
 * (dibuka di tab baru, tinggal Cetak / Simpan PDF). Dokumen yang sama juga
 * bisa diunduh lagi dari tombol di daftar.
 */
export function DokumenSiapModal({
  open,
  onClose,
  judul,
  keterangan,
  dokumen
}: {
  open: boolean;
  onClose: () => void;
  judul: string;
  keterangan: string;
  dokumen: DokumenUnduh[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={judul}
      description={keterangan}
      maxWidth="max-w-[460px]"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dokumen.map((d) => (
          <Link
            key={d.href}
            to={d.href}
            target="_blank"
            rel="noopener"
            className="btn btn-primary"
            style={{ justifyContent: "flex-start", textDecoration: "none" }}
          >
            <FileDown style={{ width: 16, height: 16 }} /> Unduh {d.label}
          </Link>
        ))}
      </div>
    </Modal>
  );
}
