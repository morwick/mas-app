import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Activity, Map } from "lucide-react";

const TABS = [
  { href: "/tracking", label: "Job Aktif", icon: Activity, exact: true },
  { href: "/tracking/peta", label: "Peta Armada", icon: Map, exact: false }
] as const;

export function TrackingTabs() {
  const { pathname } = useLocation();
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "0.5px solid var(--border-default)"
      }}
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            to={t.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: active ? "var(--brand-primary-dark)" : "var(--text-secondary)",
              borderBottom: active
                ? "2px solid var(--brand-primary)"
                : "2px solid transparent",
              textDecoration: "none",
              marginBottom: -0.5,
              transition: "color 0.15s"
            }}
          >
            <Icon style={{ width: 14, height: 14 }} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
