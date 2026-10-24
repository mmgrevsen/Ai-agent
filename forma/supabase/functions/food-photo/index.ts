// Estimates foods and portions in a meal photo. Every value is returned as
// an estimate with uncertainty; the app requires review before logging and
// labels entries "AI estimate". Photos are not stored.
import { consumeQuota, requireUser } from "../_shared/auth.ts";
import { structuredCall } from "../_shared/claude.ts";
import { handler, json, readJson } from "../_shared/http.ts";
import { normalizePhotoReply, parsePhotoInput, PHOTO_SCHEMA, PHOTO_SYSTEM } from "../_shared/photo_contract.ts";

const DAILY_LIMIT = Number(Deno.env.get("PHOTO_DAILY_LIMIT") ?? "30");

Deno.serve(handler(async (req) => {
  const { supabase } = await requireUser(req);
  const input = parsePhotoInput(await readJson(req, 6_000_000));
  await consumeQuota(supabase, "food_photo", DAILY_LIMIT);

  const raw = await structuredCall({
    system: PHOTO_SYSTEM,
    schema: PHOTO_SCHEMA,
    effort: "medium",
    maxTokens: 8000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.image } },
        { type: "text", text: input.hint ? `Hint from the user (may be incomplete): ${input.hint}` : "Estimate the foods in this photo." },
      ],
    }],
  });
  return json(normalizePhotoReply(raw));
}));
