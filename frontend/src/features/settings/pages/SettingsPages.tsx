import { Link } from "react-router-dom";
import { User, Tags, ArrowRight, Users as UsersIcon } from "lucide-react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { JenisUnitView } from "../components/jenis-unit-view";
import { ProfileView } from "../components/profile-view";
import { UsersView } from "../components/users-view";
import { useJenisUnit, useUsers } from "../queries";

const items: Array<{
  href: string;
  icon: typeof User;
  title: string;
  description: string;
  ownerOnly?: boolean;
}> = [
  {
    href: "/settings/profile",
    icon: User,
    title: "Profil admin",
    description: "Update nama dan password Anda"
  },
  {
    href: "/settings/users",
    icon: UsersIcon,
    title: "Pengguna",
    description: "Kelola role & scope akses jenis unit",
    ownerOnly: true
  },
  {
    href: "/settings/jenis-unit",
    icon: Tags,
    title: "Jenis unit",
    description: "Master data jenis armada (lowbed, highbed, dst)",
    ownerOnly: true
  }
];

export function SettingsIndexPage() {
  const user = useCurrentUser();
  const visible = items.filter((it) => !it.ownerOnly || user.role === "owner");

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div>
        <h1 className="text-h1">Pengaturan</h1>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((it) => (
          <Link
            key={it.href}
            to={it.href}
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

export function ProfilePage() {
  const user = useCurrentUser();
  return <ProfileView user={user} />;
}

export function UsersPage() {
  const current = useCurrentUser();
  const users = useUsers();
  const jenis = useJenisUnit();
  if (users.isPending || jenis.isPending) return <PageLoading />;
  if (users.isError) return <PageError error={users.error} onRetry={users.refetch} />;
  return <UsersView users={users.data} jenisUnit={jenis.data ?? []} currentUserId={current.id} />;
}

export function JenisUnitPage() {
  const jenis = useJenisUnit();
  if (jenis.isPending) return <PageLoading />;
  if (jenis.isError) return <PageError error={jenis.error} onRetry={jenis.refetch} />;
  return <JenisUnitView list={jenis.data} />;
}
