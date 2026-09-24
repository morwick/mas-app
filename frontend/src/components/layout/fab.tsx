import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FabProps {
  href: string;
  label?: string;
  className?: string;
  icon?: React.ReactNode;
}

export function Fab({ href, label = "Job baru", className, icon }: FabProps) {
  return (
    // `display` sengaja TIDAK ditulis inline: inline style mengalahkan
    // `lg:hidden` (display:none), sehingga FAB ikut tampil di desktop dan
    // menimpa isi tabel. Semua gayanya dipindah ke kelas .fab.
    <Link to={href} className={cn("fab lg:hidden", className)}>
      {icon ?? <Plus style={{ width: 16, height: 16 }} />}
      <span>{label}</span>
    </Link>
  );
}
