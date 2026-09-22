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
    <Link
      to={href}
      className={cn("lg:hidden fixed", className)}
      style={{
        right: 16,
        bottom: 72,
        zIndex: 30,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 48,
        padding: "0 18px",
        borderRadius: 99,
        background: "var(--brand-primary)",
        color: "white",
        boxShadow: "0 6px 20px rgba(28,150,0,0.32)",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600
      }}
    >
      {icon ?? <Plus style={{ width: 16, height: 16 }} />}
      <span>{label}</span>
    </Link>
  );
}
