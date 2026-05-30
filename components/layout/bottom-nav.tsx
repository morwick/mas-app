"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileNavItems, visibleNavItems } from "./nav-items";

interface BottomNavProps {
  role?: "owner" | "operator";
}

export function BottomNav({ role }: BottomNavProps = {}) {
  const pathname = usePathname();
  const items = visibleNavItems(mobileNavItems, role);
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white"
      style={{
        borderTop: "0.5px solid var(--border-default)",
        paddingBottom: "env(safe-area-inset-bottom, 0)"
      }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = item.match
            ? item.match(pathname)
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  height: 56,
                  color: active
                    ? "var(--brand-primary-dark)"
                    : "var(--text-tertiary)",
                  textDecoration: "none",
                  transition: "color 120ms ease"
                }}
              >
                <Icon
                  style={{
                    width: 20,
                    height: 20,
                    color: active ? "var(--brand-primary)" : undefined
                  }}
                />
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: active ? 600 : 500,
                    letterSpacing: 0.02
                  }}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
