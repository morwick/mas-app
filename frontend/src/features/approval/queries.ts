import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  listApprover,
  listCalonApprover,
  listFiturApproval,
  getPengajuan,
  getRiwayatApprovalUangJalan,
  listPengajuan,
  menuApproval,
  type ApproverFilter,
  type FiturApproval,
  type PengajuanFilter
} from "./api";

export const useFiturApproval = () => useQuery({ queryKey: ["approval", "fitur"], queryFn: listFiturApproval });

export const useApproverList = (filter: ApproverFilter) =>
  useQuery({
    queryKey: ["approval", "approver", filter],
    queryFn: () => listApprover(filter),
    placeholderData: keepPreviousData
  });

export const useCalonApprover = (enabled: boolean) =>
  useQuery({ queryKey: ["approval", "calon"], queryFn: listCalonApprover, enabled });

/**
 * Menu Approval milik pengguna ini — kosong bila ia bukan approver. Diperbarui
 * berkala supaya angka "menunggu" di menu ikut bergerak tanpa memuat ulang.
 */
export const useMenuApproval = () =>
  useQuery({
    queryKey: ["approval", "menu"],
    queryFn: menuApproval,
    // Menu samping: diperbarui di latar, tidak memunculkan popup loading.
    meta: { latar: true },
    refetchInterval: 60_000,
    staleTime: 30_000
  });

export const usePengajuanList = (filter: PengajuanFilter) =>
  useQuery({
    queryKey: ["approval", "pengajuan", filter],
    queryFn: () => listPengajuan(filter),
    placeholderData: keepPreviousData
  });

export const usePengajuan = (fitur: FiturApproval | undefined, id: string | undefined) =>
  useQuery({
    queryKey: ["approval", "pengajuan", "detail", fitur, id],
    queryFn: () => getPengajuan(fitur!, id!),
    enabled: !!fitur && !!id
  });

/** `null` = modal tertutup → tidak memuat. */
export const useRiwayatApprovalUangJalan = (uangJalanId: string | null) =>
  useQuery({
    queryKey: ["approval", "uang-jalan", uangJalanId],
    queryFn: () => getRiwayatApprovalUangJalan(uangJalanId!),
    enabled: !!uangJalanId
  });
