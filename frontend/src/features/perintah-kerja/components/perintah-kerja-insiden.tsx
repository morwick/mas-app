import { Link } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Incident } from "@/types";
import { usePerintahKerjaPage } from "../api";
import { StatusWoBadge } from "./daftar-perintah-kerja";

/** Di detail insiden: perintah kerja yang menangani insiden ini + tombol buat baru. */
export function PerintahKerjaInsiden({ incident }: { incident: Incident }) {
  const { canManageOperational } = useAuth();
  const wo = usePerintahKerjaPage({ page: 1, pageSize: 20, incident_id: incident.id });
  const daftar = wo.data?.items ?? [];
  const asal = incident.unit_trailer_id ? `trailer=${incident.unit_trailer_id}` : `unit=${incident.unit_id}`;
  const bisaBuat = canManageOperational && incident.status !== "resolved" && !incident.ditutup_karena;
  if (!daftar.length && !bisaBuat) return null;

  return (
    <div
      className="flex items-center justify-between gap-2 flex-wrap"
      style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: "8px 10px" }}
    >
      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13 }}>
        <ClipboardList style={{ width: 15, height: 15 }} />
        {daftar.length === 0 ? (
          <span className="caption">Belum ada perintah kerja untuk insiden ini.</span>
        ) : (
          daftar.map((w) => (
            <Link key={w.id} to={`/perintah-kerja/${w.id}`} className="inline-flex items-center gap-1">
              <span className="mono" style={{ fontWeight: 600 }}>
                {w.nomor}
              </span>
              <StatusWoBadge status={w.status_wo} />
            </Link>
          ))
        )}
      </div>
      {bisaBuat && (
        <Link to={`/perintah-kerja/new?${asal}&insiden=${incident.id}`}>
          <Button size="sm" variant="secondary" leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Buat perintah kerja
          </Button>
        </Link>
      )}
    </div>
  );
}
