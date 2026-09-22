import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/queries/profile";
import { ProfileView } from "@/components/settings/profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ProfileView user={user} />;
}
