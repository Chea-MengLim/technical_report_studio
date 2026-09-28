import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-4">
        <Link href="/projects" className="flex items-center gap-2 font-semibold text-blue-900">
          <BookOpen size={18} /> Book Studio
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          <Link href="/projects" className="hover:text-slate-900">Projects</Link>
          {user.role === "ADMIN" && (
            <>
              <Link href="/admin/projects" className="hover:text-slate-900">Manage projects</Link>
              <Link href="/admin/users" className="hover:text-slate-900">Users</Link>
              <Link href="/admin/book" className="hover:text-slate-900">Book</Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link href="/account" className="text-slate-600 hover:text-slate-900">
            {user.name}
            {user.role === "ADMIN" && <span className="badge ml-2 bg-blue-100 text-blue-800">Admin</span>}
          </Link>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
