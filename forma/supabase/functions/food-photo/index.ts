// Photo-based food logging. mode "meal" estimates the foods and portions in
// a meal photo (using a visible kitchen scale when there is one); mode
// "label" reads a package's nutrition label. Every value is returned for
// review; the app never logs without confirmation. Photos are not stored.
import { consumeQuota, requireUser } from "../_shared/auth.ts";
import { structuredCall } from "../_shared/claude.ts";
import { handler, json, readJson } from "../_shared/http.ts";
import {
  LABEL_SCHEMA,
  LABEL_SYSTEM,
  normalizeLabelReply,
  normalizePhotoReply,
  parsePhotoInput,
  PHOTO_SCHEMA,
  PHOTO_SYSTEM,
} from "../_shared/photo_contract.ts";

const DAILY_LIMIT = Number(Deno.env.get("PHOTO_DAILY_LIMIT") ?? "30");

Deno.serve(handler(async (req) => {
  const { supabase } = await requireUser(req);
  const input = parsePhotoInput(await readJson(req, 6_000_000));
  await consumeQuota(supabase, "food_photo", DAILY_LIMIT);

  const label = input.mode === "label";
  const prompt = label
    ? "Read the nutrition label on this package."
    : input.hint
    ? `Hint from the user (may be incomplete): ${input.hint}`
    : "Estimate the foods in this photo.";
  const raw = await structuredCall({
    system: label ? LABEL_SYSTEM : PHOTO_SYSTEM,
    schema: label ? LABEL_SCHEMA : PHOTO_SCHEMA,
    effort: "medium",
    maxTokens: 8000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.image } },
        { type: "text", text: prompt },
      ],
    }],
  });
  return json(label ? normalizeLabelReply(raw) : normalizePhotoReply(raw));
}));
