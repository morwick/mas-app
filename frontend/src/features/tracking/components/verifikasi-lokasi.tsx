import { useEffect, useState, type FormEvent } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { ApiError } from "@/lib/api/client";
import type { LocationEntry } from "@/types";
import { publicVerifikasi, publicVerifikasiKirim } from "../api";

/**
 * Kartu lokasi di halaman customer saat lokasi unit butuh verifikasi
 * (captcha TrackSolid). Customer tidak diberi tahu soal sesi / TrackSolid —
 * cukup "ketik kode verifikasi untuk lokasi akurat unit". Kode benar → lokasi
 * langsung dikembalikan server.
 */
export function VerifikasiLokasi({
  jobToken,
  onLokasi,
  onTidakPerlu
}: {
  jobToken: string;
  /** Kode benar — lokasi unit. */
  onLokasi: (lokasi: LocationEntry) => void;
  /** Lokasi ternyata sudah bisa tampil (mis. diverifikasi orang lain) → muat ulang. */
  onTidakPerlu: () => void;
}) {
  const [gambar, setGambar] = useState<{ id: string; src: string } | null>(null);
  const [kode, setKode] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function tanganiGalat(err: unknown, cadangan: string): void {
    if (err instanceof ApiError && err.status === 409) {
      onTidakPerlu();
      return;
    }
    setPesan(err instanceof ApiError && err.status !== 0 ? err.message : cadangan);
  }

  async function muatGambar() {
    setBusy("Memuat kode verifikasi…");
    try {
      const res = await publicVerifikasi(jobToken);
      setGambar({ id: res.id, src: res.gambar });
      setKode("");
    } catch (err) {
      tanganiGalat(err, "Kode verifikasi belum bisa dimuat. Coba beberapa saat lagi.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void muatGambar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobToken]);

  async function kirim(e: FormEvent) {
    e.preventDefault();
    if (!gambar || !kode.trim() || busy) return;
    setBusy("Memuat lokasi unit…");
    setPesan(null);
    try {
      onLokasi(await publicVerifikasiKirim(jobToken, gambar.id, kode.trim()));
    } catch (err) {
      tanganiGalat(err, "Lokasi belum bisa dimuat. Coba beberapa saat lagi.");
      // Kode sekali pakai — siapkan gambar baru (kecuali dibatasi sementara).
      if (!(err instanceof ApiError && (err.status === 409 || err.status === 429))) void muatGambar();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="aspect-video"
      style={{
        background: "var(--brand-primary-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative"
      }}
    >
      <form
        onSubmit={kirim}
        style={{
          background: "white",
          borderRadius: 10,
          padding: "14px 16px",
          maxWidth: 320,
          width: "calc(100% - 32px)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          textAlign: "center"
        }}
      >
        <MapPin style={{ width: 26, height: 26, color: "var(--brand-primary)", margin: "0 auto" }} />
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Tampilkan lokasi akurat unit</p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
          Ketik kode verifikasi pada gambar untuk mendapatkan lokasi akurat unit.
        </p>
        {gambar && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <img
              src={gambar.src}
              alt="Kode verifikasi"
              style={{ height: 44, border: "0.5px solid var(--border-default)", borderRadius: 6 }}
            />
            <button
              type="button"
              onClick={() => void muatGambar()}
              aria-label="Ganti gambar"
              title="Ganti gambar"
              className="btn btn-ghost btn-sm"
              style={{ padding: 6 }}
            >
              <RefreshCw style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}
        {gambar && (
          <Input
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            placeholder="Kode verifikasi"
            autoComplete="off"
            maxLength={20}
            aria-label="Kode verifikasi"
            style={{ textAlign: "center" }}
          />
        )}
        {pesan && (
          <p role="alert" style={{ fontSize: 11.5, color: "var(--status-cancelled-text)", margin: 0 }}>
            {pesan}
          </p>
        )}
        {gambar ? (
          <Button type="submit" disabled={!kode.trim()} fullWidth>
            Tampilkan lokasi
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void muatGambar()} fullWidth>
            Muat kode verifikasi
          </Button>
        )}
      </form>
      <LoadingOverlay message={busy} />
    </div>
  );
}
