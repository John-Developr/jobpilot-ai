"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail, validationFailure, type ActionResult } from "@/server/action-result";
import { safeRedirectPath, signInSchema } from "../schemas";

export async function signInAction(input: unknown, next: string | null): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown email and wrong password, so accounts can't be enumerated.
    return fail(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Incorrect email or password.");
  }

  redirect(safeRedirectPath(next));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
