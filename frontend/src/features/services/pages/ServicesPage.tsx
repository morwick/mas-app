import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { useJenisUnit } from "@/features/settings/queries";
import { DaftarPerintahKerja } from "@/features/perintah-kerja/components/daftar-perintah-kerja";
import { ServicesListView } from "../components/services-list-view";
import { useUnitsWithService } from "../queries";

type Tab = "servis" | "perintah-kerja";

export function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "perintah-kerja" ? "perintah-kerja" : "servis";

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="card" style={{ overflow: "hidden" }}>
        <Tabs
          value={tab}
          onChange={(k) => setParams(k === "servis" ? {} : { tab: String(k) }, { replace: true })}
          items={[
            { key: "servis", label: "Jadwal servis (KM)" },
            { key: "perintah-kerja", label: "Perintah kerja perbaikan" }
          ]}
        />
      </div>
      {tab === "servis" ? <JadwalServis initialStatus={params.get("status") ?? undefined} /> : <PerintahKerja />}
    </div>
  );
}

function JadwalServis({ initialStatus }: { initialStatus?: string }) {
  const units = useUnitsWithService();
  const jenis = useJenisUnit();
  if (units.isPending) return <PageLoading />;
  if (units.isError) return <PageError error={units.error} onRetry={units.refetch} />;
  return (
    <ServicesListView
      units={units.data}
      jenisUnitList={jenis.data ?? []}
      // ?status=overdue|mendekati — dari kartu "Perlu tindakan" dashboard.
      initialStatus={initialStatus}
    />
  );
}

function PerintahKerja() {
  const { canManageOperational } = useAuth();
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <PageHeader
          title="Perintah Kerja Perbaikan"
          description="Perbaikan unit & unit trailer: pelaksana (mekanik internal, bengkel luar, atau asuransi), rincian jasa & sparepart, biaya, dan klaim asuransi."
          style={{ flex: 1, minWidth: 240 }}
        />
        {canManageOperational && (
          <Link to="/perintah-kerja/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Buat perintah kerja</Button>
          </Link>
        )}
      </div>
      <DaftarPerintahKerja denganFilter />
    </div>
  );
}
