import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  FileText,
  Handshake,
  Receipt,
  Truck,
  UserCheck,
  Wallet,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { DokumenJatuhTempo } from "@/features/dashboard/api";
import { useTerlipat } from "@/lib/use-terlipat";
import { formatDate } from "@/lib/utils";

export interface TindakanItem {
  key: string;
  to: string;
  judul: string;
  keterangan: string;
  /** Rincian tambahan di bawah baris (mis. daftar dokumen). */
  rincian?: React.ReactNode;
}

/** Warna & ikon per jenis tindakan — supaya tiap kotak mudah dibedakan sekilas. */
const NADA: Record<string, { warna: string; lembut: string; Ikon: LucideIcon }> = {
  "uang-jalan": { warna: "#EA580C", lembut: "#FFEDD5", Ikon: Wallet },
  "belum-konfirmasi": { warna: "#2563EB", lembut: "#DBEAFE", Ikon: UserCheck },
  breakdown: { warna: "#DC2626", lembut: "#FEE2E2", Ikon: Truck },
  "penawaran-deal": { warna: "#0D9488", lembut: "#CCFBF1", Ikon: Handshake },
  "penawaran-kedaluwarsa": { warna: "#D97706", lembut: "#FEF3C7", Ikon: FileClock },
  validasi: { warna: "#7C3AED", lembut: "#EDE9FE", Ikon: ClipboardCheck },
  invoice: { warna: "#16A34A", lembut: "#DCFCE7", Ikon: Receipt },
  dokumen: { warna: "#DB2777", lembut: "#FCE7F3", Ikon: FileText },
  "servis-lewat": { warna: "#B91C1C", lembut: "#FEE2E2", Ikon: Wrench },
  "servis-mendekati": { warna: "#CA8A04", lembut: "#FEF9C3", Ikon: Wrench }
};
const NADA_BAWAAN = { warna: "#DC2626", lembut: "#FEE2E2", Ikon: AlertTriangle };

/**
 * Satu kartu "Perlu tindakan": tindakan tampil sebagai kotak dalam grid
 * (1 kolom di HP, 2 di layar sedang, 3–4 di layar lebar) supaya tidak
 * memanjang ke bawah. Header bisa diklik untuk minimize / expand (diingat
 * per browser). Tanpa tindakan kartu tidak dirender sama sekali.
 */
export function PerluTindakanCard({ items }: { items: TindakanItem[] }) {
  const [terlipat, ubah] = useTerlipat("dashboard.perluTindakan.terlipat");
  if (items.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        borderColor: "#FCA5A5",
        background: "linear-gradient(180deg, #FFF5F5 0%, #FFFFFF 100%)",
        boxShadow: "0 2px 8px rgba(220, 38, 38, 0.12)",
        overflow: "hidden"
      }}
    >
      <button
        type="button"
        onClick={ubah}
        aria-expanded={!terlipat}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "12px 16px",
          background: "linear-gradient(90deg, #DC2626 0%, #EF4444 100%)",
          color: "white",
          border: 0,
          cursor: "pointer",
          textAlign: "left"
        }}
      >
        <AlertTriangle style={{ width: 18, height: 18, color: "white" }} />
        <span className="eyebrow" style={{ color: "white", fontWeight: 700 }}>
          Perlu tindakan
        </span>
        <span
          className="badge"
          style={{ background: "white", color: "#DC2626", height: 18, fontSize: 11, padding: "0 7px", fontWeight: 700 }}
        >
          {items.length}
        </span>
        {terlipat && (
          <span
            className="caption"
            style={{
              color: "rgba(255,255,255,0.9)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0
            }}
          >
            {items.map((it) => it.judul).join(" · ")}
          </span>
        )}
        <span
          className="caption"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "white",
            flexShrink: 0
          }}
        >
          {terlipat ? "Tampilkan" : "Sembunyikan"}
          <ChevronDown
            style={{ width: 16, height: 16, transform: terlipat ? "none" : "rotate(180deg)", transition: "transform 150ms" }}
          />
        </span>
      </button>

      {!terlipat && (
        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" style={{ padding: 12 }}>
          {items.map((it) => {
            const nada = NADA[it.key] ?? NADA_BAWAAN;
            const Ikon = nada.Ikon;
            return (
              <div
                key={it.key}
                style={{
                  background: "white",
                  border: `1px solid ${nada.lembut}`,
                  borderLeft: `4px solid ${nada.warna}`,
                  borderRadius: 10,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  color: "var(--text-primary)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <Link
                  to={it.to}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    textDecoration: "none",
                    color: "inherit"
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      borderRadius: 99,
                      background: nada.warna,
                      color: "white",
                      flexShrink: 0
                    }}
                  >
                    <Ikon style={{ width: 15, height: 15 }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: nada.warna }}>{it.judul}</div>
                    <div className="caption" style={{ color: "var(--text-secondary)", lineHeight: 1.3 }}>
                      {it.keterangan}
                    </div>
                  </div>
                  <ChevronRight style={{ width: 16, height: 16, flexShrink: 0, color: nada.warna }} />
                </Link>
                {it.rincian && (
                  <div style={{ padding: "0 12px 10px 52px", color: "var(--text-secondary)" }}>{it.rincian}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MAKS_DOKUMEN = 5;

/** Rincian dokumen yang habis / segera habis — tiap baris tertaut ke unit / trailer / driver-nya. */
export function RincianDokumen({ dokumen }: { dokumen: DokumenJatuhTempo[] }) {
  const tampil = dokumen.slice(0, MAKS_DOKUMEN);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12.5 }}>
      {tampil.map((d) => (
        <li key={`${d.label}-${d.href}`} style={{ padding: "2px 0" }}>
          <Link to={d.href} style={{ color: "inherit" }}>
            <strong>{d.label}</strong> {d.subjek}
          </Link>{" "}
          —{" "}
          {d.sisa_hari < 0
            ? `sudah habis ${Math.abs(d.sisa_hari)} hari (${formatDate(d.tanggal)})`
            : d.sisa_hari === 0
              ? "habis hari ini"
              : `habis ${d.sisa_hari} hari lagi (${formatDate(d.tanggal)})`}
        </li>
      ))}
      {dokumen.length > MAKS_DOKUMEN && (
        <li style={{ padding: "2px 0", opacity: 0.8 }}>+{dokumen.length - MAKS_DOKUMEN} dokumen lainnya</li>
      )}
    </ul>
  );
}
