import type { Invoice } from "@/types";

/** Tagihan yang sudah ada pembayaran / faktur pajak tidak boleh diedit & dihapus. */
export function alasanTerkunci(inv: Pick<Invoice, "dibayar" | "payments" | "faktur_pajak_uploaded_at" | "faktur_pajak_url">): string | null {
  if (inv.dibayar > 0 || inv.payments.length > 0) {
    return "Tagihan ini sudah ada pembayarannya sehingga tidak bisa diedit atau dihapus.";
  }
  if (inv.faktur_pajak_uploaded_at || inv.faktur_pajak_url) {
    return "Tagihan ini sudah ada faktur pajaknya sehingga tidak bisa diedit atau dihapus.";
  }
  return null;
}
