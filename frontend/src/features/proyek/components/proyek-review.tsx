import { Pencil } from "lucide-react";
import { formatDate, formatRupiah, formatTime, localInputToIso } from "@/lib/utils";
import type { Driver, Unit } from "@/types";
import { META_AWAL, type JobDraft, type JobDraftMeta } from "../job-draft";

interface Props {
  /** Diisi bila job digabung ke proyek yang sudah ada (penawaran & unit sama). */
  gabungKe?: string;
  kosongan: boolean;
  customerNama: string | null;
  picNama: string;
  picNoHp: string;
  drafts: JobDraft[];
  metas: Record<string, JobDraftMeta>;
  units: Unit[];
  drivers: Driver[];
  /** Kembali ke langkah 1; `jobKey` = langsung buka job itu. */
  onUbah: (jobKey?: string) => void;
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", gap: 8, fontSize: 13 }}>
      <span className="caption">{label}</span>
      <span style={{ wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

function waktu(local: string): string {
  const iso = localInputToIso(local);
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

function TombolUbah({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={onClick}>
      <Pencil style={{ width: 12, height: 12 }} />
      Ubah
    </button>
  );
}

/**
 * Langkah 2 form proyek baru: ringkasan semua isian sebelum disimpan. Tidak ada
 * yang bisa diubah di sini — tombol "Ubah" kembali ke langkah 1.
 */
export function ProyekReview({ gabungKe, kosongan, customerNama, picNama, picNoHp, drafts, metas, units, drivers, onUbah }: Props) {
  const totalUangJalan = drafts.reduce((n, d) => n + (Number(d.uang_jalan_awal) || 0), 0);

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="card card-pad-lg">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div className="h3">{gabungKe ? `Digabung ke proyek ${gabungKe}` : "Proyek baru"}</div>
            <div className="caption">
              {gabungKe
                ? "Unit & penawaran sama — job ditambahkan ke proyek yang sudah ada."
                : "Nomor proyek dibuat otomatis saat disimpan."}
            </div>
          </div>
          <TombolUbah onClick={() => onUbah()} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <Baris label="Customer">{kosongan ? "Jalan kosongan (tanpa customer)" : customerNama}</Baris>
          <Baris label="PIC lapangan">{picNama.trim() || "—"}</Baris>
          <Baris label="No HP PIC">{picNoHp.trim() || "—"}</Baris>
          <Baris label="Jumlah job">
            {drafts.length} job · total uang jalan {formatRupiah(totalUangJalan)}
          </Baris>
        </div>
      </div>

      {drafts.map((d, i) => {
        const meta = metas[d.key] ?? META_AWAL;
        const unit = units.find((u) => u.id === d.unit_id);
        const driver = drivers.find((x) => x.id === d.driver_id);
        return (
          <div key={d.key} className="card card-pad-lg">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div className="h3">{drafts.length > 1 ? `Job ${i + 1}` : "Job"}</div>
              <TombolUbah onClick={() => onUbah(d.key)} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
              <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                <div className="eyebrow">Detail Pengiriman</div>
                <Baris label="Alat">{d.alat_diangkut}</Baris>
                <Baris label="Asal">{d.asal}</Baris>
                <Baris label="Tujuan">{d.tujuan}</Baris>
              </div>
              <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                <div className="eyebrow">Unit & Driver</div>
                <Baris label="Unit">
                  {unit ? `${unit.kode_unit} — ${unit.jenis_unit_nama}` : "—"}
                  {meta.trailerKode ? ` + trailer ${meta.trailerKode}` : ""}
                </Baris>
                <Baris label="Driver">{driver?.nama ?? "—"}</Baris>
                <Baris label="ETD">{d.etd ? waktu(d.etd) : "—"}</Baris>
                <Baris label="ETA">{d.eta ? waktu(d.eta) : "Dihitung otomatis dari rute"}</Baris>
                <Baris label="Uang jalan">{formatRupiah(Number(d.uang_jalan_awal) || 0)}</Baris>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              <div className="eyebrow">Catatan Internal</div>
              <div className="caption" style={{ whiteSpace: "pre-wrap" }}>
                {d.catatan.trim() || "—"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
