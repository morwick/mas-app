import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  nama: string;
  initials: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("nama, email")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { nama: string; email: string } | null;
  const nama: string = p?.nama ?? user.email?.split("@")[0] ?? "Admin";
  const email: string = p?.email ?? user.email ?? "";
  const initials =
    nama
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]!)
      .join("")
      .toUpperCase() || "A";
  return { id: user.id, email, nama, initials };
}
