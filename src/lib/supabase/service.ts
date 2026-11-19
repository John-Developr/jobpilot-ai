import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/config/env";
import { supabaseSecretKey } from "@/config/server-env";
import type { AuthenticatedContext } from "@/server/auth";
import type { Database } from "@/types/database";

/**
 * Secret-key Supabase client for background workers. It bypasses RLS, so every query must
 * filter by `user_id`. Import only from `src/trigger/**` (enforced by ESLint).
 */
export function createServiceClient() {
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;

/** Acts for one user from a worker; repositories filter every query by this user id. */
export function workerContext(supabase: ServiceClient, userId: string): AuthenticatedContext {
  return { userId, email: null, supabase };
}
