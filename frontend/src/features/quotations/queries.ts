import { useQuery } from "@tanstack/react-query";
import { getQuotation, listQuotations, peekNextQuotationNumber, quotationJobs } from "./api";

export const useQuotations = () =>
  useQuery({ queryKey: ["quotations", "list"], queryFn: () => listQuotations() });

export const useQuotation = (id: string | undefined) =>
  useQuery({ queryKey: ["quotations", "detail", id], queryFn: () => getQuotation(id!), enabled: !!id });

export const useQuotationJobs = (id: string | undefined) =>
  useQuery({ queryKey: ["quotations", "jobs", id], queryFn: () => quotationJobs(id!), enabled: !!id });

export const useNextQuotationNumber = () =>
  useQuery({ queryKey: ["quotations", "next-number"], queryFn: peekNextQuotationNumber, staleTime: 0 });
