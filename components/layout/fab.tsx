"use client";

import Link from "next/link";
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
      href={href}
      className={cn(
        "lg:hidden fixed right-4 bottom-[72px] z-30 inline-flex items-center gap-2 h-12 px-4 rounded-full bg-brand text-white shadow-lg active:scale-[0.98] transition-transform",
        className
      )}
    >
      {icon ?? <Plus className="w-4 h-4" />}
      <span className="text-[13px] font-medium pr-1">{label}</span>
    </Link>
  );
}
