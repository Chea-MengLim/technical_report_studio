"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FolderKanban, LogOut, Settings, UserCircle, Users, Library } from "lucide-react";
import { logout } from "@/app/actions/auth";

// On a project page the project sidebar takes over, so this one shrinks to an icon rail.
export function AppSidebar({ user }: { user: { name: string; role: string } }) {
  const pathname = usePathname();
  const compact = /^\/projects\/[^/]+/.test(pathname);
  const isAdmin = user.role === "ADMIN";

  const item = (href: string, icon: React.ReactNode, label: string) => {
    const active = pathname === href || (href !== "/projects" && pathname.startsWith(href + "/")) || (href === "/projects" && pathname === "/projects");
    return (
      <Link
        key={href}
        href={href}
        title={label}
        className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${compact ? "justify-center" : ""} ${
          active ? "bg-blue-50 font-medium text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        {icon}
        {!compact && label}
      </Link>
    );
  };

  return (
    <aside className={`flex shrink-0 flex-col border-r border-slate-200 bg-white ${compact ? "w-14" : "w-56"}`}>
      <Link
        href="/projects"
        title="Book Studio"
        className={`flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 font-semibold text-blue-900 ${compact ? "justify-center" : "px-4"}`}
      >
        <BookOpen size={18} />
        {!compact && "Book Studio"}
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {item("/projects", <FolderKanban size={16} />, "Projects")}
        {isAdmin && (
          <>
            {!compact && <div className="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Admin</div>}
            {compact && <div className="my-2 border-t border-slate-200" />}
            {item("/admin/projects", <Settings size={16} />, "Manage projects")}
            {item("/admin/users", <Users size={16} />, "Users")}
            {item("/admin/book", <Library size={16} />, "Book")}
          </>
        )}
      </nav>

      <div className="space-y-0.5 border-t border-slate-200 p-2">
        <Link
          href="/account"
          title={user.name}
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${compact ? "justify-center" : ""}`}
        >
          <UserCircle size={16} className="shrink-0" />
          {!compact && (
            <>
              <span className="truncate">{user.name}</span>
              {isAdmin && <span className="badge ml-auto bg-blue-100 text-blue-800">Admin</span>}
            </>
          )}
        </Link>
        <form action={logout}>
          <button
            title="Sign out"
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${compact ? "justify-center" : ""}`}
          >
            <LogOut size={16} />
            {!compact && "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );
}
