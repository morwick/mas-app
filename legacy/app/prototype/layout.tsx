export default function PrototypeLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#ECECE6", minHeight: "100vh" }}>{children}</div>
  );
}
