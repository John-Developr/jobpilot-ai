"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/config/env";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser Supabase client. Use only for operations that must go browser → Supabase
 * directly (signed file uploads). Data reads/writes go through Server Actions.
 */
export function getSupabaseBrowserClient() {
  client ??= createBrowserClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return client;
}
