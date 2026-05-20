"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { navItems } from "./nav-items";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col h-screen sticky top-0 bg-white border-r border-border">
      <div className="px-5 h-16 flex items-center border-b border-border">
        <Logo size="sm" />
      </div>
      <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = item.match
              ? item.match(pathname)
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 h-10 px-3 rounded-md text-[14px] transition-colors",
                    active
                      ? "bg-brand-light text-brand-dark font-medium"
                      : "text-text hover:bg-page"
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-3 border-t border-border">
        <LogoutButton variant="sidebar" />
      </div>
    </aside>
  );
}
