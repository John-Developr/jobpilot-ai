import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Who a repository call acts for. In the app the client carries the user's session (RLS
 * applies); in background workers it is the secret-key client (`src/lib/supabase/service.ts`),
 * so every repository must filter by `userId` itself.
 */
export interface AuthenticatedContext {
  userId: string;
  email: string | null;
  supabase: SupabaseClient<Database>;
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
