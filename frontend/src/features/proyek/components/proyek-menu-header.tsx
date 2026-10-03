import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";

export type TabMenuProyek = "proyek" | "unit";

/**
 * BATASAN: tab & halaman "Proyek per unit" disembunyikan dulu atas permintaan
 * user (2026-10-03). Ubah ke true untuk memunculkan lagi tab-nya dan membuka
 * kembali rute /proyek/per-unit (selama false, rute itu dialihkan ke /proyek).
 */
export const TAMPILKAN_PROYEK_PER_UNIT = false;

/**
 * Judul menu Proyek + dua tab: Proyek (/proyek) dan Proyek per unit
 * (/proyek/per-unit). Tab berupa alamat sendiri-sendiri supaya bisa
 * dibagikan / dibuka langsung.
 */
export function ProyekMenuHeader({ aktif }: { aktif: TabMenuProyek }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <PageHeader
        title="Proyek"
        description="Satu proyek berisi satu atau beberapa job dan biasanya ditagih dalam satu invoice; tiap job punya surat jalan sendiri."
      />
      {TAMPILKAN_PROYEK_PER_UNIT && (
        <Tabs
          value={aktif}
          onChange={(k) => navigate(k === "proyek" ? "/proyek" : "/proyek/per-unit")}
          items={[
            { key: "proyek", label: "Proyek" },
            { key: "unit", label: "Proyek per unit" }
          ]}
        />
      )}
    </div>
  );
}
