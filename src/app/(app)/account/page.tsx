import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-slate-500">{user.email}</p>
        <h2 className="mt-8 font-semibold">Change password</h2>
        <PasswordForm />
      </div>
    </main>
  );
}
