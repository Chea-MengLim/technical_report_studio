import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getUser()) redirect("/projects");
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-blue-800">Korea Software HRD Center</div>
          <h1 className="mt-1 text-2xl font-semibold">Book Studio</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to write your project report.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
