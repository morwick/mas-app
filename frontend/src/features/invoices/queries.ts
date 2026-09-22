import { useQuery } from "@tanstack/react-query";
import type { InvoiceStatus } from "@/types";
import {
  getInvoice,
  jobProfitability,
  jobsBelumDitagih,
  listInvoices,
  peekNextInvoiceNumber,
  piutangSummary
} from "./api";

export const useInvoices = (opts?: { status?: InvoiceStatus }) =>
  useQuery({
    queryKey: ["invoices", "list", opts?.status ?? ""],
    queryFn: () => listInvoices(opts)
  });

export const useInvoice = (id: string | undefined) =>
  useQuery({ queryKey: ["invoices", "detail", id], queryFn: () => getInvoice(id!), enabled: !!id });

export const useNextInvoiceNumber = () =>
  useQuery({ queryKey: ["invoices", "next-number"], queryFn: peekNextInvoiceNumber, staleTime: 0 });

export const useJobsBelumDitagih = (customerId?: string) =>
  useQuery({
    queryKey: ["invoices", "jobs-belum-ditagih", customerId ?? ""],
    queryFn: () => jobsBelumDitagih(customerId)
  });

export const usePiutangSummary = () =>
  useQuery({ queryKey: ["piutang", "summary"], queryFn: piutangSummary });

export const useJobProfitability = (start?: string, end?: string) =>
  useQuery({
    queryKey: ["reports", "profitability", start, end],
    queryFn: () => jobProfitability(start, end)
  });
