import { requireUser } from "@/lib/auth";
import { AppSidebar } from "@/components/AppSidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex h-screen">
      <AppSidebar user={{ name: user.name, role: user.role }} />
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
