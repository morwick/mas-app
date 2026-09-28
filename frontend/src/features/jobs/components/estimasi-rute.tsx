import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Route, Ship, TriangleAlert, Truck } from "lucide-react";
import { estimasiRute } from "@/features/jobs/api";
import { formatDateTime, isoToLocalInput, localInputToDate } from "@/lib/utils";

/**
 * Estimasi jarak & durasi perjalanan truk, tampil begitu lokasi asal dan
 * tujuan sudah dipin. Angka yang sama dipakai server untuk mengisi ETA bila
 * ETA dikosongkan (hasil rutenya di-cache, jadi tidak dihitung dua kali).
 */

interface Titik {
  lat: number | null;
  lng: number | null;
}

interface Props {
  asal: Titik;
  tujuan: Titik;
  /** Nilai input ETD ("YYYY-MM-DDTHH:mm"); kosong bila belum diisi. */
  etd: string;
  /** Isi field ETA dengan ETD + durasi estimasi. */
  onPakaiEta: (eta: string) => void;
}

/** 609 → "10 jam 9 menit"; 1500 → "1 hari 1 jam". */
export function formatDurasi(menit: number): string {
  const total = Math.max(1, Math.round(menit));
  const hari = Math.floor(total / 1440);
  const jam = Math.floor((total % 1440) / 60);
  const sisa = total % 60;
  if (hari > 0) return jam > 0 ? `${hari} hari ${jam} jam` : `${hari} hari`;
  if (jam > 0) return sisa > 0 ? `${jam} jam ${sisa} menit` : `${jam} jam`;
  return `${sisa} menit`;
}

/** ETD (input lokal) + durasi → nilai input ETA, dibulatkan ke atas per menit. */
export function etaDariDurasi(etd: string, durasiMenit: number): string | null {
  const mulai = localInputToDate(etd);
  if (!mulai) return null;
  return isoToLocalInput(new Date(mulai.getTime() + Math.ceil(durasiMenit) * 60000).toISOString());
}

function lengkap(t: Titik): t is { lat: number; lng: number } {
  return t.lat !== null && t.lng !== null;
}

/** Pesan saat ETA dikosongkan tapi sistem tidak bisa menghitungnya (sama dengan pesan server). */
export const ETA_TIDAK_TERHITUNG_MESSAGE =
  "Gagal! Sistem tidak bisa menghitung ETA dari rute yang dipilih. Silakan isi ETA secara manual.";

/**
 * Estimasi rute antara dua titik. Dipakai kartu estimasi dan form job — query
 * key sama, jadi keduanya berbagi satu permintaan & cache.
 */
export function useEstimasiRute(asal: Titik, tujuan: Titik) {
  const siap = lengkap(asal) && lengkap(tujuan);
  return useQuery({
    queryKey: ["geo", "estimasi-rute", asal.lat, asal.lng, tujuan.lat, tujuan.lng],
    queryFn: () => estimasiRute(asal as { lat: number; lng: number }, tujuan as { lat: number; lng: number }),
    enabled: siap,
    staleTime: 30 * 60 * 1000,
    retry: false
  });
}

export function EstimasiRuteInfo({ asal, tujuan, etd, onPakaiEta }: Props) {
  const siap = lengkap(asal) && lengkap(tujuan);
  const q = useEstimasiRute(asal, tujuan);

  if (!siap) return null;

  const kotak: React.CSSProperties = {
    fontSize: 12.5,
    padding: "10px 12px",
    borderRadius: 8,
    lineHeight: 1.5,
    display: "flex",
    gap: 8,
    alignItems: "flex-start"
  };

  if (q.isPending) {
    return (
      <div style={{ ...kotak, background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
        <Loader2 style={{ width: 14, height: 14, marginTop: 2, animation: "spin 0.8s linear infinite" }} />
        Menghitung estimasi perjalanan truk…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div style={{ ...kotak, background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
        <TriangleAlert style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0 }} />
        <span>
          {q.error instanceof Error && q.error.message
            ? q.error.message
            : "Estimasi perjalanan belum bisa dihitung."}{" "}
          <button
            type="button"
            onClick={() => q.refetch()}
            style={{ border: "none", background: "none", padding: 0, color: "var(--brand-primary-dark)", textDecoration: "underline", cursor: "pointer" }}
          >
            Coba lagi
          </button>
        </span>
      </div>
    );
  }

  const r = q.data;
  const eta = etaDariDurasi(etd, r.duration_min);
  const laut = r.laut ?? [];
  const lautKm = laut.reduce((n, s) => n + s.distance_km, 0);
  const lautMenit = laut.reduce((n, s) => n + s.duration_min, 0);
  const km = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return (
    <div style={{ ...kotak, background: "var(--brand-primary-light)" }}>
      <Route style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0, color: "var(--brand-primary-dark)" }} />
      <div style={{ flex: 1 }}>
        <div>
          Estimasi perjalanan {r.truk ? "truk" : "(rute mobil)"}:{" "}
          <strong>{km(r.distance_km)} km</strong> ·{" "}
          <strong>± {formatDurasi(r.duration_min)}</strong>
        </div>
        {laut.length > 0 && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Truck style={{ width: 12, height: 12, flexShrink: 0, color: "var(--text-secondary)" }} />
              <span>
                Darat: {km(r.distance_km - lautKm)} km · ± {formatDurasi(r.duration_min - lautMenit)}
              </span>
            </div>
            {laut.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Ship style={{ width: 12, height: 12, flexShrink: 0, color: "#1D4ED8" }} />
                <span>
                  Laut (kapal ferry{s.nama ? `: ${s.nama.replace(/\s*-\s*/g, " – ")}` : ""}): {km(s.distance_km)} km · ±{" "}
                  {formatDurasi(s.duration_min)}
                </span>
              </div>
            ))}
          </div>
        )}
        {eta && (
          <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Clock style={{ width: 12, height: 12, color: "var(--text-secondary)" }} />
            <span style={{ color: "var(--text-secondary)" }}>Perkiraan sampai {formatDateTime(localInputToDate(eta))} WIB</span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 11.5, padding: "2px 8px", height: "auto" }}
              onClick={() => onPakaiEta(eta)}
            >
              Pakai sebagai ETA
            </button>
          </div>
        )}
        <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-tertiary)" }}>
          Waktu tempuh tanpa istirahat, macet, dan bongkar muat
          {laut.length > 0 ? ", serta belum termasuk antre & jadwal kapal di pelabuhan." : "."}
          {!r.truk && " Rute khusus truk tidak ditemukan, jadi memakai rute mobil."}
        </div>
      </div>
    </div>
  );
}
