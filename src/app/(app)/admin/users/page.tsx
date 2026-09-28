import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { CreateUserForm, UserRowActions } from "./UserForms";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const memberships = await db
    .select({ userId: schema.projectMembers.userId, name: schema.projects.name })
    .from(schema.projectMembers)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectMembers.projectId));
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .orderBy(asc(schema.projects.name));

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Editors can open the projects they are assigned to. Admins can open everything and build the book.
        </p>
        <div className="card mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Projects</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2">{u.role === "ADMIN" ? "Admin" : "Editor"}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {memberships
                      .filter((m) => m.userId === u.id)
                      .map((m) => m.name)
                      .join(", ") || <span className="text-slate-400">none</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {u.id !== me.id && <UserRowActions userId={u.id} role={u.role} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mt-8 text-lg font-semibold">Add a user</h2>
        <CreateUserForm projects={projects} />
      </div>
    </main>
  );
}
