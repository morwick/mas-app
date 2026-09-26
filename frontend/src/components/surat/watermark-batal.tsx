/**
 * Tanda surat yang sudah tidak berlaku: tulisan "CANCELED" (dibatalkan) atau
 * "EXPIRED" (kedaluwarsa) melintang di atas kertas — ikut tercetak / tersimpan
 * ke PDF di setiap halaman, supaya tidak bisa disalahgunakan.
 *
 * Letakkan di dalam elemen kertas yang `position: relative`.
 */
export function WatermarkBatal({ aktif, teks = "CANCELED" }: { aktif: boolean; teks?: string }) {
  if (!aktif) return null;
  return (
    <>
      <div className="watermark-batal" aria-hidden="true">
        <span>{teks}</span>
      </div>
      <style>{`
        .watermark-batal {
          position: absolute;
          inset: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          pointer-events: none;
          user-select: none;
        }
        .watermark-batal span {
          transform: rotate(-35deg);
          font-size: 150px;
          font-weight: 800;
          letter-spacing: 12px;
          color: rgba(201, 48, 48, 0.28);
          border: 10px solid rgba(201, 48, 48, 0.28);
          border-radius: 16px;
          padding: 0 32px;
          white-space: nowrap;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          /* fixed → diulang di setiap halaman cetak */
          .watermark-batal {
            position: fixed;
          }
        }
      `}</style>
    </>
  );
}

/** Peringatan di bar aksi (tidak ikut tercetak). */
export function PeringatanBatal({
  aktif,
  teks,
  tanda = "CANCELED"
}: {
  aktif: boolean;
  teks: string;
  tanda?: string;
}) {
  if (!aktif) return null;
  return (
    <p className="no-print text-[12px] font-semibold" style={{ color: "#c93030" }}>
      {teks} — surat tidak berlaku dan tercetak dengan tanda {tanda}.
    </p>
  );
}
