import { useMenuApproval } from "@/features/approval/queries";
import { PerluTindakanCard, TEMA_APPROVAL, type TindakanItem } from "./perlu-tindakan-card";

/**
 * Widget "Perlu approval" di dashboard: pengajuan yang menunggu keputusan
 * pengguna ini, per fitur. Untuk approver di role apa pun (termasuk finance);
 * tidak dirender bila ia bukan approver atau tidak ada yang menunggu.
 * Datanya sama dengan angka di menu Approval (diperbarui tiap menit).
 */
export function PerluApprovalCard() {
  const menu = useMenuApproval();
  const items: TindakanItem[] = (menu.data ?? [])
    .filter((m) => m.menunggu_saya > 0)
    .map((m) => ({
      key: `approval-${m.kode}`,
      nada: "approval",
      to: `/approval/${m.kode}`,
      judul: `${m.menunggu_saya} ${m.nama}`,
      keterangan: "Menunggu keputusan Anda."
    }));
  return (
    <PerluTindakanCard
      items={items}
      judul="Perlu approval"
      kunciLipat="dashboard.perluApproval.terlipat"
      tema={TEMA_APPROVAL}
    />
  );
}
