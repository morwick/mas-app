import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

interface Props {
  /** Dipanggil setiap goresan selesai; null berarti kanvas dikosongkan. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

/**
 * Kanvas tanda tangan untuk layar sentuh.
 *
 * Ditulis sendiri, bukan memakai pustaka: yang dibutuhkan hanya menggambar
 * garis dari gerakan jari lalu mengekspornya sebagai PNG, dan menambah
 * dependensi untuk itu berarti satu paket lagi yang harus diunduh driver di
 * jaringan lapangan yang sering lambat.
 */
export function SignaturePad({ onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [kosong, setKosong] = useState(true);

  // Kanvas diberi ukuran piksel sesuai lebar sebenarnya di layar dikali
  // devicePixelRatio. Tanpa itu, tanda tangan di HP ber-DPI tinggi tersimpan
  // buram karena kanvas digambar pada resolusi CSS lalu diperbesar.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
      // Latar putih supaya PNG-nya tetap terbaca saat ditempel di surat jalan
      // yang dicetak — PNG transparan akan hilang di atas kertas putih hanya
      // kalau ada latar gelap, tapi juga menyulitkan pratinjau di layar gelap.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function posisi(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function mulai(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posisi(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }

  function gerak(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posisi(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (kosong) setKosong(false);
  }

  function selesai() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(kosong ? null : canvas.toDataURL("image/png"));
  }

  function hapus() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setKosong(true);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={mulai}
        onPointerMove={gerak}
        onPointerUp={selesai}
        onPointerLeave={selesai}
        style={{
          width: "100%",
          height: 160,
          border: "1px dashed var(--border-default)",
          borderRadius: 8,
          background: "#fff",
          // Tanpa ini, menggeser jari di kanvas akan menggulir halaman alih-alih
          // menggambar.
          touchAction: "none"
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11.5px] text-text-muted">
          {kosong ? "Minta penerima tanda tangan di kotak ini" : "Tanda tangan terisi"}
        </span>
        <button
          type="button"
          onClick={hapus}
          disabled={kosong || disabled}
          className="inline-flex items-center gap-1 text-[12px] text-text-muted disabled:opacity-40"
        >
          <Eraser className="w-3.5 h-3.5" />
          Ulangi
        </button>
      </div>
    </div>
  );
}
