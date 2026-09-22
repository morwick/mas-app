import type { Metadata } from "next";
import { ProtoShell } from "@/components/prototype/proto-shell";

export const metadata: Metadata = {
  title: "MAS — Aplikasi Manajemen Armada · Interactive Prototype"
};

export default function PrototypePage() {
  return <ProtoShell />;
}
