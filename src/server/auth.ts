import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";

export interface AuthenticatedContext {
  userId: string;
  email: string | null;
  supabase: SupabaseServerClient;
}

/**
 * Data-access-layer auth check. Every server read and mutation starts here.
 * Verifies the JWT (getClaims) and redirects to /login when there is no session.
 * Memoized per request.
 */
export const requireUser = cache(async (): Promise<AuthenticatedContext> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login");
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    supabase,
  };
});
