import { PageError, PageLoading } from "@/components/ui/page-state";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { JenisUnitView } from "../components/jenis-unit-view";
import { ProfileView } from "../components/profile-view";
import { UsersView } from "../components/users-view";
import { useJenisUnit, useUsers } from "../queries";
import { useJenisUnitTrailer } from "@/features/unit-trailer/queries";

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
  const trailer = useJenisUnitTrailer();
  if (jenis.isPending || trailer.isPending) return <PageLoading />;
  if (jenis.isError) return <PageError error={jenis.error} onRetry={jenis.refetch} />;
  if (trailer.isError) return <PageError error={trailer.error} onRetry={trailer.refetch} />;
  return <JenisUnitView list={jenis.data} trailer={trailer.data} />;
}
