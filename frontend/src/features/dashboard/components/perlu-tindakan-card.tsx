import { useState } from "react";
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
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useTerlipat } from "@/lib/use-terlipat";
import { formatDate } from "@/lib/utils";

export interface TindakanItem {
  key: string;
  /** Tujuan saat kotak diklik. Diabaikan bila `onClick` diisi. */
  to?: string;
  /** Aksi saat kotak diklik (mis. membuka modal rincian) — pengganti `to`. */
  onClick?: () => void;
  judul: string;
  keterangan: string;
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
                {(() => {
                  const gaya: React.CSSProperties = {
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    textDecoration: "none",
                    color: "inherit",
                    width: "100%",
                    background: "none",
                    border: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    font: "inherit"
                  };
                  const isi = (
                    <>
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
                    </>
                  );
                  return it.onClick ? (
                    <button type="button" onClick={it.onClick} style={gaya}>
                      {isi}
                    </button>
                  ) : (
                    <Link to={it.to ?? "#"} style={gaya}>
                      {isi}
                    </Link>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sisaHariTeks(d: DokumenJatuhTempo): string {
  if (d.sisa_hari < 0) return `Sudah habis ${Math.abs(d.sisa_hari)} hari`;
  if (d.sisa_hari === 0) return "Habis hari ini";
  return `Habis ${d.sisa_hari} hari lagi`;
}

/** Filter jenis dokumen di modal; nilainya = `label` dari server. */
const FILTER_DOKUMEN = [
  { key: "semua", label: "Semua" },
  { key: "STNK", label: "STNK" },
  { key: "SIM", label: "SIM" },
  { key: "KIR", label: "KIR" },
  { key: "Pajak kendaraan", label: "Pajak" }
] as const;
type FilterDokumen = (typeof FILTER_DOKUMEN)[number]["key"];

/**
 * Modal daftar dokumen yang habis / segera habis, bisa difilter per jenis
 * dokumen dan urut dari yang paling mendesak. Tiap baris tertaut ke halaman
 * detail unit / trailer / driver pemilik dokumennya.
 */
export function DokumenJatuhTempoModal({
  open,
  onClose,
  dokumen
}: {
  open: boolean;
  onClose: () => void;
  dokumen: DokumenJatuhTempo[];
}) {
  const [filter, setFilter] = useState<FilterDokumen>("semua");
  const urut = dokumen
    .filter((d) => filter === "semua" || d.label === filter)
    .sort((a, b) => a.sisa_hari - b.sisa_hari);
  const jumlah = (key: FilterDokumen) =>
    key === "semua" ? dokumen.length : dokumen.filter((d) => d.label === key).length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${dokumen.length} dokumen jatuh tempo`}
      description="STNK / KIR / pajak / SIM yang sudah habis atau habis ≤ 30 hari lagi. Klik untuk membuka detailnya."
      maxWidth="max-w-[560px]"
    >
      <div className="overflow-x-auto scrollbar-thin" style={{ padding: "12px 20px 4px", flexShrink: 0 }}>
        <Tabs
          variant="pill"
          value={filter}
          onChange={(k) => setFilter(k as FilterDokumen)}
          items={FILTER_DOKUMEN.map((f) => ({ key: f.key, label: f.label, count: jumlah(f.key) }))}
        />
      </div>
      {urut.length === 0 && (
        <p className="caption" style={{ padding: "16px 20px", textAlign: "center" }}>
          Tidak ada dokumen {FILTER_DOKUMEN.find((f) => f.key === filter)?.label} yang jatuh tempo.
        </p>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto" }}>
        {urut.map((d) => {
          const lewat = d.sisa_hari < 0;
          return (
            <li key={`${d.label}-${d.href}-${d.tanggal}`} style={{ borderBottom: "0.5px solid var(--border-default)" }}>
              <Link
                to={d.href}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  color: "inherit",
                  textDecoration: "none"
                }}
              >
                <span
                  className="badge"
                  style={{
                    background: lewat ? "#FEE2E2" : "#FCE7F3",
                    color: lewat ? "#B91C1C" : "#BE185D",
                    fontWeight: 700,
                    minWidth: 52,
                    justifyContent: "center"
                  }}
                >
                  {d.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.subjek}</div>
                  <div className="caption" style={{ color: lewat ? "#B91C1C" : "var(--text-secondary)" }}>
                    {sisaHariTeks(d)} · {formatDate(d.tanggal)}
                  </div>
                </div>
                <ChevronRight style={{ width: 16, height: 16, flexShrink: 0, color: "var(--text-tertiary)" }} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** State buka/tutup modal dokumen — dipakai kartu dashboard. */
export function useModalDokumen() {
  const [open, setOpen] = useState(false);
  return { open, buka: () => setOpen(true), tutup: () => setOpen(false) };
}
