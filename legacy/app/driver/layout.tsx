export default function DriverLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Portal driver tidak memakai sesi Supabase seperti admin. Identitasnya
  // cookie `mas_driver_session`, dibaca ulang di tiap halaman lewat
  // getDriverSession() — layout sengaja tidak ikut memutuskan akses supaya
  // tidak ada dua sumber kebenaran yang bisa berbeda.
  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-page)" }}>
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 pb-20">
          <div className="mx-auto w-full max-w-page px-3 sm:px-6 lg:px-8 py-4 lg:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
