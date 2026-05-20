"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileNavItems } from "./nav-items";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border pb-[env(safe-area-inset-bottom,0)]">
      <ul className="flex items-stretch">
        {mobileNavItems.map((item) => {
          const active = item.match
            ? item.match(pathname)
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 h-14 transition-colors",
                  active ? "text-brand-dark" : "text-text-muted"
                )}
              >
                <Icon className={cn("w-5 h-5", active && "text-brand")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
