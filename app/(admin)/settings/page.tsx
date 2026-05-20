import Link from "next/link";
import { User, Tags, ArrowRight } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";

const items = [
  {
    href: "/settings/profile",
    icon: User,
    title: "Profil admin",
    description: "Update nama dan password Anda"
  },
  {
    href: "/settings/jenis-unit",
    icon: Tags,
    title: "Jenis unit",
    description: "Master data jenis armada (lowbed, highbed, dst)"
  }
];

export default function SettingsIndexPage() {
  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div>
        <h1 className="text-h1">Pengaturan</h1>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="bg-card rounded-lg border border-border p-3.5 hover:border-border-hover flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-md bg-brand-light text-brand-dark flex items-center justify-center shrink-0">
              <it.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-text">{it.title}</p>
              <p className="text-[12px] text-text-muted">{it.description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-text-subtle shrink-0" />
          </Link>
        ))}
      </div>
      <LogoutButton variant="settings" />
    </div>
  );
}
