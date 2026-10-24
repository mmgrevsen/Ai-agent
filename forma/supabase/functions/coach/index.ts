// AI coach: answers questions about the caller's own data using a compact
// context the app assembles from the user's records. Returns validated,
// structured output; proposals are only applied after user confirmation in
// the app (which re-validates them against current data).
import { consumeQuota, requireUser } from "../_shared/auth.ts";
import { structuredCall } from "../_shared/claude.ts";
import { availableExerciseIds, buildMessages, COACH_SCHEMA, COACH_SYSTEM, normalizeCoachReply, parseCoachInput } from "../_shared/coach_contract.ts";
import { handler, json, readJson } from "../_shared/http.ts";

const DAILY_LIMIT = Number(Deno.env.get("COACH_DAILY_LIMIT") ?? "60");

Deno.serve(handler(async (req) => {
  const { supabase } = await requireUser(req);
  const input = parseCoachInput(await readJson(req, 100_000));
  await consumeQuota(supabase, "coach", DAILY_LIMIT);

  const raw = await structuredCall({
    system: COACH_SYSTEM,
    messages: buildMessages(input),
    schema: COACH_SCHEMA,
    effort: "medium",
    maxTokens: 16000,
  });
  // The request context is not stored server-side; the app keeps the conversation.
  return json(normalizeCoachReply(raw, availableExerciseIds(input.context)));
}));
