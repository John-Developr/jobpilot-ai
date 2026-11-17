import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-xl font-extrabold tracking-tight">
          JobPilot<span className="text-brand-text">AI</span>
        </p>
        <section className="rounded-xl bg-card p-6 shadow-card md:p-8">
          <h1 className="text-xl font-bold">Sign in.</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Your personal job application assistant.
          </p>
          <Suspense fallback={<Skeleton className="h-52 w-full" />}>
            <LoginForm />
          </Suspense>
        </section>
        <p className="mt-6 text-center text-xs text-subtle-foreground">
          Single-user workspace. Accounts are created by the owner in Supabase.
        </p>
      </div>
    </main>
  );
}
