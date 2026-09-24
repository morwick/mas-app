import { useState } from "react";
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  ShieldCheck,
  UserCog
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { FilterChips } from "@/components/ui/filter-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  updateUser
} from "@/features/settings/api";
import type { KaryawanOption, UserRow } from "@/types";
import type { JenisUnit } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { Combobox } from "@/components/ui/combobox";
import { useKaryawanTersedia } from "@/features/settings/queries";

interface Props {
  users: UserRow[];
  jenisUnit: JenisUnit[];
  currentUserId: string;
}

type Role = "superadmin" | "operator";

type EditState = {
  user: UserRow;
  karyawanId: string;
  email: string;
  roles: Role[];
  selectedIds: Set<string>;
};

type CreateState = {
  karyawanId: string;
  email: string;
  password: string;
  roles: Role[];
  selectedIds: Set<string>;
};

type ResetState = {
  user: UserRow;
  password: string;
  confirm: string;
};

// Edit pengguna: nama karyawan baru muncul setelah diketik lebih dari 3
// karakter. Tambah pengguna menampilkan semua pilihan langsung.
const MIN_NAMA_SEARCH = 4;

// Samakan dengan batas minimal Supabase Auth (lihat backend users/router.py).
const MIN_PASSWORD = 6;

function toggled(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

const DUPLICATE_ON_CREATE =
  "Pengguna gagal ditambahkan karena email sudah terdaftar.";
const DUPLICATE_ON_UPDATE =
  "Perubahan gagal disimpan karena email sudah terdaftar.";

/** Cek cepat di sisi klien; backend tetap memeriksa ulang ke database. */
function emailTaken(users: UserRow[], email: string, excludeId?: string) {
  const needle = email.trim().toLowerCase();
  return users.some(
    (u) => u.id !== excludeId && u.email.trim().toLowerCase() === needle
  );
}

const LABEL_ROLE: Record<Role, string> = {
  superadmin: "Super Administrator",
  operator: "Operator"
};

const ROLE_URUT: Role[] = ["superadmin", "operator"];

/**
 * Satu akun (email) boleh punya beberapa role, tapi karyawan + role yang sama
 * tidak boleh ada di dua akun. `kecualiUser` = akun yang sedang diedit.
 */
function pesanSudahTerdaftar(
  awal: string,
  karyawan: KaryawanOption | undefined,
  roles: Role[],
  kecualiUser?: string
): string | null {
  if (!karyawan) return null;
  const bentrok = ROLE_URUT.filter(
    (r) => roles.includes(r) && (karyawan.akun ?? []).some((a) => a.role === r && a.user_id !== kecualiUser)
  );
  return bentrok.length
    ? `${awal} karena data sudah terdaftar: ${karyawan.nama} sudah punya akun lain dengan role ${bentrok
        .map((b) => LABEL_ROLE[b])
        .join(", ")}.`
    : null;
}

function toggledRole(roles: Role[], role: Role): Role[] {
  return roles.includes(role)
    ? roles.filter((x) => x !== role)
    : ROLE_URUT.filter((x) => x === role || roles.includes(x));
}

const ROLE_WAJIB = "Data belum lengkap: pilih minimal satu role.";

function pesanKaryawanNonaktif(u: UserRow): string {
  return `Pengguna gagal diaktifkan: karyawan ${u.nama} berstatus Nonaktif. Aktifkan dulu karyawannya di menu Karyawan.`;
}
const LEPAS_SUPERADMIN_SENDIRI =
  "Perubahan gagal disimpan: role Super Administrator tidak bisa dilepas dari akun sendiri — minta super administrator lain.";

const WARNA_ROLE: Record<Role, { bg: string; fg: string }> = {
  superadmin: { bg: "var(--brand-primary-light)", fg: "var(--brand-primary-dark)" },
  operator: { bg: "#fff4e0", fg: "#8a5a00" }
};

function punyaRole(u: UserRow, role: Role): boolean {
  return (u.roles?.length ? u.roles : [u.role]).includes(role);
}

const EMPTY_SCOPE_MESSAGE =
  "Data belum lengkap: operator wajib punya minimal satu scope jenis unit.";

export function UsersView({ users, jenisUnit, currentUserId }: Props) {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const [edit, setEdit] = useState<EditState | null>(null);
  // Pesan popup loading; null = tidak ada proses yang berjalan.
  const [busy, setBusy] = useState<string | null>(null);
  const submitting = busy !== null;
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserRow | null>(
    null
  );
  const [create, setCreate] = useState<CreateState | null>(null);
  const [reset, setReset] = useState<ResetState | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [q, setQ] = useState("");
  const karyawan = useKaryawanTersedia(create !== null);
  const selectedKaryawan = karyawan.data?.find(
    (k) => k.id === create?.karyawanId
  );
  const karyawanEditAktif = useKaryawanTersedia(edit !== null);
  // Pilihan hanya berisi karyawan aktif. Karyawan milik akun yang sedang
  // diedit tetap dimasukkan walau nonaktif, supaya email/role/scope akun itu
  // tetap bisa diubah (mengaktifkan akunnya tetap ditolak).
  const karyawanEdit = {
    ...karyawanEditAktif,
    data:
      edit?.user.karyawan_id &&
      karyawanEditAktif.data &&
      !karyawanEditAktif.data.some((k) => k.id === edit.user.karyawan_id)
        ? [
            ...karyawanEditAktif.data,
            {
              id: edit.user.karyawan_id,
              nama: `${edit.user.nama} (nonaktif)`,
              tanggal_lahir: null,
              akun: [{ user_id: edit.user.id, role: edit.user.role }]
            }
          ]
        : karyawanEditAktif.data
  };
  const selectedKaryawanEdit = karyawanEdit.data?.find(
    (k) => k.id === edit?.karyawanId
  );

  function openEdit(u: UserRow) {
    setEdit({
      user: u,
      karyawanId: u.karyawan_id ?? "",
      email: u.email,
      roles: u.roles?.length ? u.roles : [u.role],
      selectedIds: new Set(u.allowed_jenis_unit_ids ?? [])
    });
  }

  function toggleJenis(id: string) {
    if (!edit) return;
    setEdit((prev) =>
      prev ? { ...prev, selectedIds: toggled(prev.selectedIds, id) } : prev
    );
  }

  async function save() {
    if (!edit) return;
    if (!selectedKaryawanEdit) {
      toast.error(
        "Data belum lengkap: pilih nama karyawan. Hanya karyawan yang boleh menjadi pengguna."
      );
      return;
    }
    const terdaftarEdit = pesanSudahTerdaftar(
      "Perubahan gagal disimpan",
      selectedKaryawanEdit,
      edit.roles,
      edit.user.id
    );
    if (terdaftarEdit) {
      toast.error(terdaftarEdit);
      return;
    }
    if (!edit.email.trim()) {
      toast.error("Email wajib diisi");
      return;
    }
    if (emailTaken(users, edit.email, edit.user.id)) {
      toast.error(DUPLICATE_ON_UPDATE);
      return;
    }
    if (edit.roles.length === 0) {
      toast.error(ROLE_WAJIB);
      return;
    }
    const akunSendiri = edit.user.id === currentUserId;
    if (akunSendiri && !edit.roles.includes("superadmin")) {
      toast.error(LEPAS_SUPERADMIN_SENDIRI);
      return;
    }
    if (edit.roles.includes("operator") && edit.selectedIds.size === 0) {
      toast.error(EMPTY_SCOPE_MESSAGE);
      return;
    }
    setBusy(`Menyimpan perubahan ${edit.user.nama}…`);
    const res = await updateUser({
      user_id: edit.user.id,
      karyawan_id: selectedKaryawanEdit.id,
      email: edit.email.trim(),
      roles: edit.roles,
      allowed_jenis_unit_ids:
        edit.roles.includes("operator") ? Array.from(edit.selectedIds) : []
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Data ${selectedKaryawanEdit.nama} diperbarui`);
    setEdit(null);
    // Nama/email/role di menu profil ikut diperbarui.
    if (akunSendiri) void refreshUser();
  }

  function openCreate() {
    setCreate({
      karyawanId: "",
      email: "",
      password: "",
      roles: ["operator"],
      selectedIds: new Set()
    });
  }

  async function saveCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!create) return;
    if (!selectedKaryawan) {
      toast.error(
        "Data belum lengkap: pilih karyawan. Hanya karyawan yang boleh menjadi pengguna."
      );
      return;
    }
    const terdaftar = pesanSudahTerdaftar("Pengguna gagal ditambahkan", selectedKaryawan, create.roles);
    if (terdaftar) {
      toast.error(terdaftar);
      return;
    }
    if (!create.email.trim()) {
      toast.error("Email wajib diisi");
      return;
    }
    if (emailTaken(users, create.email)) {
      toast.error(DUPLICATE_ON_CREATE);
      return;
    }
    if (create.password.length < MIN_PASSWORD) {
      toast.error(`Password minimal ${MIN_PASSWORD} karakter`);
      return;
    }
    if (create.roles.length === 0) {
      toast.error(ROLE_WAJIB);
      return;
    }
    if (create.roles.includes("operator") && create.selectedIds.size === 0) {
      toast.error(EMPTY_SCOPE_MESSAGE);
      return;
    }
    setBusy(`Menambahkan pengguna ${selectedKaryawan.nama}…`);
    const res = await createUser({
      karyawan_id: selectedKaryawan.id,
      email: create.email.trim(),
      password: create.password,
      roles: create.roles,
      allowed_jenis_unit_ids:
        create.roles.includes("operator") ? Array.from(create.selectedIds) : []
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Pengguna ${selectedKaryawan.nama} ditambahkan`);
    setCreate(null);
  }

  async function saveReset(e: React.FormEvent) {
    e.preventDefault();
    if (!reset) return;
    if (reset.password.length < MIN_PASSWORD) {
      toast.error(`Password minimal ${MIN_PASSWORD} karakter`);
      return;
    }
    if (reset.password !== reset.confirm) {
      toast.error("Konfirmasi password tidak cocok");
      return;
    }
    setBusy(`Mereset password ${reset.user.nama}…`);
    const res = await resetUserPassword({
      user_id: reset.user.id,
      password: reset.password
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Password ${reset.user.nama} direset`);
    setReset(null);
  }

  async function toggleActive(u: UserRow) {
    setConfirmDeactivate(null);
    setBusy(
      u.is_active ? `Menonaktifkan ${u.nama}…` : `Mengaktifkan ${u.nama}…`
    );
    const res = await setUserActive({
      user_id: u.id,
      is_active: !u.is_active
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      u.is_active ? `${u.nama} dinonaktifkan` : `${u.nama} diaktifkan kembali`
    );
  }

  const needle = q.trim().toLowerCase();
  const filtered = users.filter(
    (u) =>
      (roleFilter === "all" || punyaRole(u, roleFilter)) &&
      (!needle ||
        u.nama.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle))
  );
  const roleCounts = {
    all: users.length,
    superadmin: users.filter((u) => punyaRole(u, "superadmin")).length,
    operator: users.filter((u) => punyaRole(u, "operator")).length
  };
  const pg = usePagination(filtered, { resetKey: `${q}|${roleFilter}` });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap"
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Pengguna
          </h1>
          <p className="caption">
            Kelola role dan scope akses jenis unit. Operator hanya bisa
            edit/manage job untuk unit dengan jenis dalam scope-nya.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            leftIcon={<Plus style={{ width: 16, height: 16 }} />}
            onClick={openCreate}
          >
            Tambah pengguna
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau email…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
      </div>

      <FilterChips
        value={roleFilter}
        onChange={(k) => setRoleFilter(k as typeof roleFilter)}
        items={[
          { key: "all", label: "Semua", count: roleCounts.all },
          {
            key: "superadmin",
            label: "Super Administrator",
            count: roleCounts.superadmin
          },
          { key: "operator", label: "Operator", count: roleCounts.operator }
        ]}
      />

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "0.5px solid var(--border-default)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text-secondary)"
          }}
        >
          {filtered.length} pengguna
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {filtered.length === 0 && (
            <li
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-tertiary)"
              }}
            >
              Tidak ada pengguna yang cocok.
            </li>
          )}
          {pg.items.map((u) => (
            <UserRowItem
              key={u.id}
              user={u}
              jenisUnit={jenisUnit}
              isCurrentUser={u.id === currentUserId}
              onEdit={() => openEdit(u)}
              onToggleActive={() => {
                if (!u.is_active && u.karyawan_aktif === false) {
                  toast.error(pesanKaryawanNonaktif(u));
                  return;
                }
                setConfirmDeactivate(u);
              }}
              onResetPassword={() =>
                setReset({ user: u, password: "", confirm: "" })
              }
            />
          ))}
        </ul>
        <Pagination state={pg} label="pengguna" attached />
      </div>

      {edit && (
        <Modal
          open
          onClose={submitting ? () => {} : () => setEdit(null)}
          title={`Edit pengguna — ${edit.user.nama}`}
          description={edit.user.email}
          maxWidth="max-w-[560px]"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setEdit(null)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button onClick={save} loading={submitting}>
                Simpan
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <KaryawanPicker
              value={edit.karyawanId}
              onChange={(v) => setEdit((p) => (p ? { ...p, karyawanId: v } : p))}
              karyawan={karyawanEdit.data}
              loading={karyawanEdit.isLoading}
              error={
                pesanSudahTerdaftar("Tidak bisa disimpan", selectedKaryawanEdit, edit.roles, edit.user.id) ??
                undefined
              }
              minQueryLength={MIN_NAMA_SEARCH}
            />
            <Field
              label="Email"
              required
              hint="Email ini dipakai untuk login. Kalau diubah, pengguna login dengan email baru."
            >
              <Input
                type="email"
                value={edit.email}
                onChange={(e) =>
                  setEdit((p) => (p ? { ...p, email: e.target.value } : p))
                }
                autoComplete="off"
              />
            </Field>
            <RoleScopeFields
              roles={edit.roles}
              selectedIds={edit.selectedIds}
              jenisUnit={jenisUnit}
              onToggleRole={(role) => setEdit((p) => (p ? { ...p, roles: toggledRole(p.roles, role) } : p))}
              kunciSuperadmin={edit.user.id === currentUserId}
              onToggleJenis={toggleJenis}
            />
          </div>
        </Modal>
      )}

      {create && (
        <Modal
          open
          onClose={submitting ? () => {} : () => setCreate(null)}
          title="Tambah pengguna"
          description="Akun langsung aktif dan bisa login dengan password ini."
          maxWidth="max-w-[560px]"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setCreate(null)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button type="submit" form="create-user-form" loading={submitting}>
                Tambah
              </Button>
            </>
          }
        >
          <form
            id="create-user-form"
            onSubmit={saveCreate}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <KaryawanPicker
              value={create.karyawanId}
              onChange={(v) => setCreate((p) => (p ? { ...p, karyawanId: v } : p))}
              karyawan={karyawan.data}
              loading={karyawan.isLoading}
              error={pesanSudahTerdaftar("Tidak bisa ditambahkan", selectedKaryawan, create.roles) ?? undefined}
              minQueryLength={0}
            />
            <Field label="Email" required>
              <Input
                type="email"
                value={create.email}
                onChange={(e) =>
                  setCreate((p) => (p ? { ...p, email: e.target.value } : p))
                }
                autoComplete="off"
              />
            </Field>
            <Field
              label="Password awal"
              required
              hint={`Minimal ${MIN_PASSWORD} karakter. Sampaikan ke pengguna; password bisa diganti sendiri di halaman Profil.`}
            >
              <PasswordInput
                value={create.password}
                onChange={(e) =>
                  setCreate((p) => (p ? { ...p, password: e.target.value } : p))
                }
                autoComplete="new-password"
              />
            </Field>
            <RoleScopeFields
              roles={create.roles}
              selectedIds={create.selectedIds}
              jenisUnit={jenisUnit}
              onToggleRole={(role) => setCreate((p) => (p ? { ...p, roles: toggledRole(p.roles, role) } : p))}
              onToggleJenis={(id) =>
                setCreate((p) =>
                  p ? { ...p, selectedIds: toggled(p.selectedIds, id) } : p
                )
              }
            />
          </form>
        </Modal>
      )}

      {reset && (
        <Modal
          open
          onClose={submitting ? () => {} : () => setReset(null)}
          title={`Reset password — ${reset.user.nama}`}
          description={reset.user.email}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setReset(null)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button type="submit" form="reset-password-form" loading={submitting}>
                Reset password
              </Button>
            </>
          }
        >
          <form
            id="reset-password-form"
            onSubmit={saveReset}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <Field
              label="Password baru"
              required
              hint={`Minimal ${MIN_PASSWORD} karakter. Password lama langsung tidak berlaku.`}
            >
              <PasswordInput
                value={reset.password}
                onChange={(e) =>
                  setReset((p) => (p ? { ...p, password: e.target.value } : p))
                }
                autoComplete="new-password"
                autoFocus
              />
            </Field>
            <Field label="Konfirmasi password baru" required>
              <PasswordInput
                value={reset.confirm}
                onChange={(e) =>
                  setReset((p) => (p ? { ...p, confirm: e.target.value } : p))
                }
                autoComplete="new-password"
              />
            </Field>
          </form>
        </Modal>
      )}

      {confirmDeactivate && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDeactivate(null)}
          title={
            confirmDeactivate.is_active
              ? `Nonaktifkan ${confirmDeactivate.nama}?`
              : `Aktifkan kembali ${confirmDeactivate.nama}?`
          }
          body={
            confirmDeactivate.is_active
              ? "User tidak akan bisa login sampai diaktifkan kembali. Sesi yang sedang aktif tidak otomatis logout."
              : "User bisa login lagi setelah ini."
          }
          confirmText={
            confirmDeactivate.is_active ? "Nonaktifkan" : "Aktifkan"
          }
          onConfirm={() => toggleActive(confirmDeactivate)}
          variant={confirmDeactivate.is_active ? "danger" : "primary"}
        />
      )}

      <LoadingOverlay message={busy} />
    </div>
  );
}

function UserRowItem({
  user,
  jenisUnit,
  isCurrentUser,
  onEdit,
  onToggleActive,
  onResetPassword
}: {
  user: UserRow;
  jenisUnit: JenisUnit[];
  isCurrentUser: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onResetPassword: () => void;
}) {
  const jenisMap = new Map(jenisUnit.map((j) => [j.id, j.nama]));
  const roles = user.roles?.length ? user.roles : [user.role];
  const scopeLabels =
    roles.includes("operator") && user.allowed_jenis_unit_ids
      ? user.allowed_jenis_unit_ids
          .map((id) => jenisMap.get(id))
          .filter((x): x is string => Boolean(x))
      : [];


  return (
    <li
      style={{
        padding: "14px 16px",
        borderBottom: "0.5px solid var(--border-default)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        opacity: user.is_active ? 1 : 0.55
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 99,
          background: "var(--brand-primary)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 12.5,
          flexShrink: 0
        }}
      >
        {user.nama
          .split(" ")
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase() || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 2,
            flexWrap: "wrap"
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>{user.nama}</span>
          {isCurrentUser && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--bg-muted)",
                color: "var(--text-secondary)",
                fontWeight: 600
              }}
            >
              Anda
            </span>
          )}
          {roles.map((r) => (
            <span
              key={r}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 4,
                background: WARNA_ROLE[r].bg,
                color: WARNA_ROLE[r].fg,
                letterSpacing: 0.4,
                textTransform: "uppercase"
              }}
            >
              {LABEL_ROLE[r]}
            </span>
          ))}
          {!user.is_active && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "#fcebeb",
                color: "#791f1f",
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase"
              }}
            >
              Nonaktif
            </span>
          )}
          {user.karyawan_aktif === false && (
            <span
              title="Karyawan pemilik akun ini berstatus Nonaktif di menu Karyawan"
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: "#fcebeb",
                color: "#791f1f",
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase"
              }}
            >
              Karyawan nonaktif
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: scopeLabels.length > 0 ? 4 : 0
          }}
        >
          {user.email}
        </div>
        {roles.includes("operator") && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {scopeLabels.length === 0 ? (
              <span
                style={{
                  fontSize: 11,
                  color: "#c93030",
                  fontWeight: 600
                }}
              >
                Belum ada scope — akses kosong
              </span>
            ) : (
              scopeLabels.map((label) => (
                <span
                  key={label}
                  style={{
                    fontSize: 10.5,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--bg-muted)",
                    color: "var(--text-secondary)",
                    fontWeight: 500
                  }}
                >
                  {label}
                </span>
              ))
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onEdit}
          className="btn btn-secondary btn-sm"
          title={isCurrentUser ? "Edit akun Anda" : "Edit pengguna"}
        >
          <Pencil style={{ width: 13, height: 13 }} />
          Edit
        </button>
        {/* Password akun sendiri diganti di halaman Profil; akun sendiri
            tidak bisa dinonaktifkan. */}
        {!isCurrentUser && (
          <>
            <button
              type="button"
              onClick={onResetPassword}
              className="btn btn-secondary btn-sm btn-icon"
              title="Reset password"
            >
              <KeyRound style={{ width: 14, height: 14 }} />
            </button>
            <button
              type="button"
              onClick={onToggleActive}
              className="btn btn-secondary btn-sm btn-icon"
              title={user.is_active ? "Nonaktifkan" : "Aktifkan"}
              style={{
                color: user.is_active ? "#791f1f" : "var(--brand-primary-dark)"
              }}
            >
              <Power style={{ width: 14, height: 14 }} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Pilih nama pengguna dari data karyawan — dropdown yang bisa diketik. */
function KaryawanPicker({
  value,
  onChange,
  karyawan,
  loading,
  minQueryLength,
  error
}: {
  value: string;
  onChange: (id: string) => void;
  karyawan: KaryawanOption[] | undefined;
  loading: boolean;
  /** Mis. "data sudah terdaftar" — tampil langsung di bawah pilihan. */
  error?: string;
  /** 0 = semua pilihan langsung tampil saat dropdown dibuka. */
  minQueryLength: number;
}) {
  const options = (karyawan ?? []).map((k) => ({
    value: k.id,
    label: k.nama,
    // Semua karyawan bisa dipilih; akun yang sudah ada ditampilkan supaya
    // admin tahu role mana yang masih bisa dibuatkan.
    hint:
      [
        k.akun?.length
          ? `Sudah terdaftar: ${k.akun.map((a) => LABEL_ROLE[a.role]).join(", ")}`
          : null,
        k.tanggal_lahir ? `Lahir ${k.tanggal_lahir}` : null
      ]
        .filter(Boolean)
        .join(" · ") || undefined
  }));
  return (
    <Field
      label="Nama"
      required
      hint={
        minQueryLength > 0
          ? `Ketik lebih dari ${minQueryLength - 1} huruf untuk mencari nama karyawan. Hanya karyawan yang boleh menjadi pengguna.`
          : "Pilih dari daftar atau ketik untuk mencari. Hanya karyawan yang boleh menjadi pengguna."
      }
    >
      <Combobox
        value={value}
        onChange={onChange}
        options={options}
        placeholder={loading ? "Memuat karyawan…" : "Pilih nama karyawan"}
        searchPlaceholder="Ketik nama karyawan…"
        emptyText="Tidak ada karyawan dengan nama itu"
        minQueryLength={minQueryLength}
        disabled={loading}
        error={error}
      />
    </Field>
  );
}

function RoleScopeFields({
  roles,
  selectedIds,
  jenisUnit,
  onToggleRole,
  onToggleJenis,
  kunciSuperadmin = false
}: {
  roles: Role[];
  selectedIds: Set<string>;
  jenisUnit: JenisUnit[];
  onToggleRole: (role: Role) => void;
  onToggleJenis: (id: string) => void;
  /** Akun sendiri: role Super Administrator tidak bisa dilepas. */
  kunciSuperadmin?: boolean;
}) {
  return (
    <>
      <Field
        label="Role"
        required
        hint={
          kunciSuperadmin
            ? "Akun Anda sendiri: role Super Administrator tidak bisa dilepas. Role Operator boleh ditambah/dilepas."
            : "Boleh pilih lebih dari satu. Pengguna dengan beberapa role memilih role yang dipakai setelah login."
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <RoleButton
            active={roles.includes("superadmin")}
            disabled={kunciSuperadmin && roles.includes("superadmin")}
            onClick={() => onToggleRole("superadmin")}
            icon={ShieldCheck}
            title="Super Administrator"
            desc="Akses penuh, kelola pengguna"
          />
          <RoleButton
            active={roles.includes("operator")}
            onClick={() => onToggleRole("operator")}
            icon={Shield}
            title="Operator"
            desc="Edit & manage job sesuai scope"
          />
        </div>
      </Field>

      {roles.includes("operator") && (
        <Field
          label="Scope jenis unit"
          required
          hint="Operator hanya bisa lihat & manage job untuk unit dengan jenis yang dicentang."
        >
          {jenisUnit.length === 0 ? (
            <div
              style={{
                padding: 12,
                border: "0.5px dashed var(--border-strong)",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--text-tertiary)",
                textAlign: "center"
              }}
            >
              Belum ada jenis unit. Buat dulu di{" "}
              <strong>Pengaturan → Jenis unit</strong>.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 8
              }}
            >
              {jenisUnit.map((j) => {
                const checked = selectedIds.has(j.id);
                return (
                  <label
                    key={j.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 11px",
                      borderRadius: 6,
                      border: "0.5px solid",
                      borderColor: checked
                        ? "var(--brand-primary)"
                        : "var(--border-strong)",
                      background: checked
                        ? "var(--brand-primary-light)"
                        : "white",
                      color: checked
                        ? "var(--brand-primary-dark)"
                        : "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      transition: "background 120ms ease"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleJenis(j.id)}
                      style={{
                        width: 14,
                        height: 14,
                        accentColor: "var(--brand-primary)",
                        flexShrink: 0
                      }}
                    />
                    {j.nama}
                  </label>
                );
              })}
            </div>
          )}
        </Field>
      )}

      {roles.includes("superadmin") && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "var(--brand-primary-light)",
            color: "var(--brand-primary-dark)",
            fontSize: 12.5,
            lineHeight: 1.45
          }}
        >
          <strong>Super Administrator</strong> punya akses penuh ke seluruh data dan
          bisa kelola pengguna lain. Scope jenis unit hanya berlaku saat memakai role Operator.
        </div>
      )}
    </>
  );
}

function RoleButton({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
  disabled = false
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof UserCog;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        padding: 14,
        borderRadius: 8,
        border: "0.5px solid",
        borderColor: active ? "var(--brand-primary)" : "var(--border-strong)",
        background: active ? "var(--brand-primary-light)" : "white",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.75 : 1,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        transition: "background 120ms ease, border-color 120ms ease"
      }}
    >
      <Icon
        style={{
          width: 16,
          height: 16,
          color: active ? "var(--brand-primary)" : "var(--text-tertiary)",
          flexShrink: 0,
          marginTop: 2
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: active ? "var(--brand-primary-dark)" : "var(--text-primary)",
            marginBottom: 2
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-tertiary)",
            lineHeight: 1.4
          }}
        >
          {desc}
        </div>
      </div>
    </button>
  );
}
