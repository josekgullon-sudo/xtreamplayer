import type { Metadata } from "next";
import AdminTickets from "@/components/admin/AdminTickets";

export const metadata: Metadata = {
  title: "Soporte — Administración",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminTickets />;
}
