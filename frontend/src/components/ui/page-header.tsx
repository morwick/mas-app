/**
 * Judul halaman + keterangan singkat — gaya yang sama dengan halaman Pengguna.
 * Dipakai semua halaman daftar supaya bagian atasnya seragam.
 */
export function PageHeader({
  title,
  description,
  style
}: {
  title: string;
  description?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <h1 className="h1" style={{ marginBottom: 4 }}>
        {title}
      </h1>
      {description && <p className="caption">{description}</p>}
    </div>
  );
}
