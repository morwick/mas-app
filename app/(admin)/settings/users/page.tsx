import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/profile";
import { listAllUsers } from "@/lib/queries/users";
import { listJenisUnit } from "@/lib/queries/jenis-unit";
import { UsersView } from "@/components/settings/users-view";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/settings");

  const [users, jenisUnit] = await Promise.all([
    listAllUsers(),
    listJenisUnit()
  ]);

  return (
    <UsersView
      users={users}
      jenisUnit={jenisUnit}
      currentUserId={current.id}
    />
  );
}
