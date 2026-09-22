import { api } from "@/lib/api/client";
import { mutate } from "@/lib/api/query";
import type { ActionResult } from "@/types";

export function requestPasswordReset(email: string): Promise<ActionResult<unknown>> {
  return mutate(api.post("/auth/password-reset", { email }, "none"));
}

export function updateProfile(nama: string): Promise<ActionResult<unknown>> {
  return mutate(api.patch("/auth/profile", { nama }));
}

export function updatePassword(
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult<unknown>> {
  return mutate(
    api.post("/auth/password", { new_password: newPassword, confirm_password: confirmPassword })
  );
}
