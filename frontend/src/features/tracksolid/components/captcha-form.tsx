import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { kabariTersambung } from "@/lib/tracksolid-captcha";
import { ambilCaptchaTrackSolid, loginCaptchaTrackSolid } from "../api";

/**
 * Gambar captcha TrackSolid + isian kode, di popup halaman ber-data
 * TrackSolid (Dashboard, Unit, Pantau, Service). Kode diketik manusia —
 * captcha tidak dibaca otomatis.
 */
export function CaptchaForm({
  otomatis = false,
  onBerhasil
}: {
  /** Tampilkan gambar captcha langsung saat muncul. */
  otomatis?: boolean;
  onBerhasil?: () => void;
}) {
  const toast = useToast();
  const [gambar, setGambar] = useState<string | null>(null);
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function ambilCaptcha() {
    setBusy("Mengambil captcha…");
    try {
      const res = await ambilCaptchaTrackSolid();
      setGambar(res.gambar);
      setKode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengambil captcha");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (otomatis && !gambar) void ambilCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otomatis]);

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!kode.trim() || busy) return;
    setBusy("Login ke TrackSolid…");
    const res = await loginCaptchaTrackSolid(kode.trim());
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      // Captcha sekali pakai — ambil yang baru.
      void ambilCaptcha();
      return;
    }
    toast.success("TrackSolid tersambung lagi — data GPS kembali tampil");
    setGambar(null);
    setKode("");
    kabariTersambung();
    onBerhasil?.();
  }

  return (
    <form className="flex flex-col" style={{ gap: 12 }} onSubmit={login}>
      {gambar ? (
        <div className="flex items-center" style={{ gap: 10 }}>
          <img
            src={gambar}
            alt="Captcha TrackSolid"
            style={{ height: 50, border: "0.5px solid var(--border-default)", borderRadius: 6 }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw style={{ width: 14, height: 14 }} />}
            onClick={() => void ambilCaptcha()}
          >
            Ganti captcha
          </Button>
        </div>
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => void ambilCaptcha()}>
            Tampilkan captcha
          </Button>
        </div>
      )}
      {gambar && (
        <>
          <Field label="Kode captcha" required hint="Ketik huruf/angka persis seperti pada gambar.">
            <Input
              value={kode}
              onChange={(e) => setKode(e.target.value)}
              autoComplete="off"
              maxLength={20}
              aria-label="Kode captcha"
              autoFocus
            />
          </Field>
          <div>
            <Button type="submit" disabled={!kode.trim()}>
              Login TrackSolid
            </Button>
          </div>
        </>
      )}
      <LoadingOverlay message={busy} />
    </form>
  );
}
