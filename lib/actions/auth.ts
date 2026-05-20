"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function loginAction(
  _: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: "Email dan password wajib diisi" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) {
    // Surface penyebab spesifik supaya admin tahu cara fix.
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("invalid login credentials")) {
      return { ok: false, error: "Email atau password salah." };
    }
    if (msg.includes("email not confirmed")) {
      return {
        ok: false,
        error:
          "Email belum terkonfirmasi. Buka Supabase Dashboard → Authentication → Users → centang 'Confirm email' di user Anda."
      };
    }
    if (msg.includes("rate limit") || msg.includes("too many")) {
      return {
        ok: false,
        error:
          "Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi."
      };
    }
    // Log raw error ke server console untuk debug
    console.error("[loginAction] Supabase error:", error);
    return { ok: false, error: `Login gagal: ${error.message}` };
  }

  // Cek profile aktif — admin user tanpa row profiles (atau is_active=false)
  // tidak bisa akses data karena RLS, jadi sign-out & beri pesan jelas.
  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error:
          "Akun login OK tapi profile admin belum ada di database. Pastikan trigger handle_new_user sudah jalan (migration 02), atau buat row manual di tabel profiles."
      };
    }
    if (!(profile as { is_active: boolean }).is_active) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "Akun admin Anda dinonaktifkan. Hubungi super-admin."
      };
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(
  _: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email wajib diisi" };
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin
      ? `${origin}/reset-password/confirm`
      : undefined
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) return { ok: false, error: "Nama wajib diisi" };
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak valid" };
  const { error } = await supabase
    .from("profiles")
    .update({ nama })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function updatePasswordAction(formData: FormData): Promise<ActionResult> {
  const newPass = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (newPass.length < 6)
    return { ok: false, error: "Password minimal 6 karakter" };
  if (newPass !== confirm)
    return { ok: false, error: "Konfirmasi password tidak cocok" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}
