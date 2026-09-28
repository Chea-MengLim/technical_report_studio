import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</div>;
}
