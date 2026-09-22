/**
 * Ekspor tabel ke .xlsx. Pustaka xlsx (~400 KB) dimuat saat pertama dipakai
 * supaya tidak membebani bundle awal halaman-halaman lain.
 */
export async function exportToXlsx(
  rows: Array<Record<string, string | number | null>>,
  filename: string,
  sheetName = "Sheet1"
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
