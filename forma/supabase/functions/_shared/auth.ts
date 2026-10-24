import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/**
 * A Supabase client acting as the calling user (their JWT), so every query
 * is subject to row-level security, plus the verified user.
 */
export async function requireUser(req: Request): Promise<{ supabase: SupabaseClient; user: User }> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError("Sign in to use this feature.", 401);
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
  if (error || !data.user) throw new HttpError("Your session has expired. Please sign in again.", 401);
  return { supabase, user: data.user };
}

/** Service-role client. Only for operations RLS can't express (account deletion). */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Counts a request against the user's daily quota (atomic, in Postgres). */
export async function consumeQuota(supabase: SupabaseClient, kind: string, limit: number): Promise<void> {
  const { data, error } = await supabase.rpc("forma_consume_ai_quota", { p_kind: kind, p_limit: limit });
  if (error) throw new Error(`quota check failed: ${error.message}`);
  if (data !== true) throw new HttpError("You've reached today's limit for this feature. Try again tomorrow.", 429);
}
