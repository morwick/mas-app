"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  updatePasswordAction,
  updateProfileAction
} from "@/lib/actions/auth";

interface Props {
  user: { id: string; nama: string; email: string };
}

export function ProfileView({ user }: Props) {
  const toast = useToast();
  const [nama, setNama] = useState(user.nama);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoadingProfile(true);
    const fd = new FormData();
    fd.append("nama", nama);
    const res = await updateProfileAction(fd);
    setLoadingProfile(false);
    if (res.ok) toast.success("Profil tersimpan");
    else toast.error(res.error);
  }

  async function savePass(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== confirmPass) {
      toast.error("Konfirmasi password tidak cocok");
      return;
    }
    setLoadingPass(true);
    const fd = new FormData();
    fd.append("new_password", newPass);
    fd.append("confirm_password", confirmPass);
    const res = await updatePasswordAction(fd);
    setLoadingPass(false);
    if (res.ok) {
      setNewPass("");
      setConfirmPass("");
      toast.success("Password diperbarui");
    } else toast.error(res.error);
  }

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <form onSubmit={saveProfile}>
        <Card>
          <CardHeader title="Profil" description="Data identitas akun admin" />
          <div className="flex flex-col gap-4">
            <Field label="Email">
              <Input value={user.email} disabled readOnly />
            </Field>
            <Field label="Nama" required>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={loadingProfile}>
                Simpan profil
              </Button>
            </div>
          </div>
        </Card>
      </form>
      <form onSubmit={savePass}>
        <Card>
          <CardHeader
            title="Ganti password"
            description="Minimal 6 karakter"
          />
          <div className="flex flex-col gap-4">
            <Field label="Password baru" required>
              <Input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Konfirmasi password baru" required>
              <Input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={loadingPass}>
                Ganti password
              </Button>
            </div>
          </div>
        </Card>
      </form>
      <div className="text-center pt-2">
        <Link
          href="/settings"
          className="text-[13px] text-text-muted hover:text-text"
        >
          Kembali ke pengaturan
        </Link>
      </div>
    </div>
  );
}
