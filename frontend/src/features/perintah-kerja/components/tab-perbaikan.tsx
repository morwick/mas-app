import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import { DaftarPerintahKerja } from "./daftar-perintah-kerja";

/** Tab "Perbaikan" di detail unit / unit trailer: perintah kerja aset ini. */
export function TabPerbaikan({ aset }: { aset: { unit_id: string } | { unit_trailer_id: string } }) {
  const { canManageOperational } = useAuth();
  const query = "unit_id" in aset ? `unit=${aset.unit_id}` : `trailer=${aset.unit_trailer_id}`;
  return (
    <div className="flex flex-col" style={{ gap: 12, padding: 12 }}>
      {canManageOperational && (
        <div className="flex justify-end">
          <Link to={`/perintah-kerja/new?${query}`}>
            <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Buat perintah kerja
            </Button>
          </Link>
        </div>
      )}
      <DaftarPerintahKerja dasar={aset} tampilAset={false} kosong="Aset ini belum pernah dibuatkan perintah kerja." />
    </div>
  );
}
