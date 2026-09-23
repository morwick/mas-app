import { useState } from "react";
import { Pencil, Shield, ShieldCheck, UserCog, Power } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  setUserActive,
  updateUserRole
} from "@/features/settings/api";
import type { UserRow } from "@/types";
import type { JenisUnit } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface Props {
  users: UserRow[];
  jenisUnit: JenisUnit[];
  currentUserId: string;
}

type EditState = {
  user: UserRow;
  role: "superadmin" | "operator";
  selectedIds: Set<string>;
};

export function UsersView({ users, jenisUnit, currentUserId }: Props) {
  const toast = useToast();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserRow | null>(
    null
  );

  function openEdit(u: UserRow) {
    setEdit({
      user: u,
      role: u.role,
      selectedIds: new Set(u.allowed_jenis_unit_ids ?? [])
    });
  }

  function toggleJenis(id: string) {
    if (!edit) return;
    setEdit((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });
  }

  async function save() {
    if (!edit) return;
    if (
      edit.role === "operator" &&
      edit.selectedIds.size === 0 &&
      !window.confirm(
        "Operator ini tidak punya scope jenis unit. Dia tidak bisa akses unit & job apapun. Yakin lanjutkan?"
      )
    ) {
      return;
    }
    setSubmitting(true);
    const res = await updateUserRole({
      user_id: edit.user.id,
      role: edit.role,
      allowed_jenis_unit_ids:
        edit.role === "operator" ? Array.from(edit.selectedIds) : []
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Role ${edit.user.nama} diperbarui`);
    setEdit(null);
  }

  async function toggleActive(u: UserRow) {
    setConfirmDeactivate(null);
    const res = await setUserActive({
      user_id: u.id,
      is_active: !u.is_active
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      u.is_active ? `${u.nama} dinonaktifkan` : `${u.nama} diaktifkan kembali`
    );
  }

  const pg = usePagination(users, { pageSize: 15 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="h1" style={{ marginBottom: 4 }}>
          Pengguna
        </h1>
        <p className="caption">
          Kelola role dan scope akses jenis unit. Operator hanya bisa
          edit/manage job untuk unit dengan jenis dalam scope-nya.
        </p>
      </div>

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
          {users.length} pengguna
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {pg.items.map((u) => (
            <UserRowItem
              key={u.id}
              user={u}
              jenisUnit={jenisUnit}
              isCurrentUser={u.id === currentUserId}
              onEdit={() => openEdit(u)}
              onToggleActive={() => setConfirmDeactivate(u)}
            />
          ))}
        </ul>
        <Pagination state={pg} label="pengguna" attached />
      </div>

      {edit && (
        <Modal
          open
          onClose={submitting ? () => {} : () => setEdit(null)}
          title={`Edit role — ${edit.user.nama}`}
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
            <Field label="Role" required>
              <div className="grid grid-cols-2 gap-2">
                <RoleButton
                  active={edit.role === "superadmin"}
                  onClick={() =>
                    setEdit((p) => (p ? { ...p, role: "superadmin" } : p))
                  }
                  icon={ShieldCheck}
                  title="Super Administrator"
                  desc="Akses penuh, kelola pengguna"
                />
                <RoleButton
                  active={edit.role === "operator"}
                  onClick={() =>
                    setEdit((p) => (p ? { ...p, role: "operator" } : p))
                  }
                  icon={Shield}
                  title="Operator"
                  desc="Edit & manage job sesuai scope"
                />
              </div>
            </Field>

            {edit.role === "operator" && (
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
                      const checked = edit.selectedIds.has(j.id);
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
                            onChange={() => toggleJenis(j.id)}
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

            {edit.role === "superadmin" && (
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
                bisa kelola pengguna lain. Tidak ada scope jenis unit.
              </div>
            )}
          </div>
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
    </div>
  );
}

function UserRowItem({
  user,
  jenisUnit,
  isCurrentUser,
  onEdit,
  onToggleActive
}: {
  user: UserRow;
  jenisUnit: JenisUnit[];
  isCurrentUser: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const jenisMap = new Map(jenisUnit.map((j) => [j.id, j.nama]));
  const scopeLabels =
    user.role === "operator" && user.allowed_jenis_unit_ids
      ? user.allowed_jenis_unit_ids
          .map((id) => jenisMap.get(id))
          .filter((x): x is string => Boolean(x))
      : [];

  const roleColor =
    user.role === "superadmin"
      ? { bg: "var(--brand-primary-light)", fg: "var(--brand-primary-dark)" }
      : { bg: "#fff4e0", fg: "#8a5a00" };

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
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 4,
              background: roleColor.bg,
              color: roleColor.fg,
              letterSpacing: 0.4,
              textTransform: "uppercase"
            }}
          >
            {user.role === "superadmin" ? "Super Administrator" : "Operator"}
          </span>
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
        {user.role === "operator" && (
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
        {!isCurrentUser && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="btn btn-secondary btn-sm"
              title="Edit role & scope"
            >
              <Pencil style={{ width: 13, height: 13 }} />
              Edit
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

function RoleButton({
  active,
  onClick,
  icon: Icon,
  title,
  desc
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof UserCog;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: 14,
        borderRadius: 8,
        border: "0.5px solid",
        borderColor: active ? "var(--brand-primary)" : "var(--border-strong)",
        background: active ? "var(--brand-primary-light)" : "white",
        textAlign: "left",
        cursor: "pointer",
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
