import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.ts";

/** Model used by the AI features. Override with the AI_MODEL secret. */
export const MODEL = Deno.env.get("AI_MODEL") ?? "claude-opus-5-5";

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the function's secrets. Never shipped to clients.
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

export type JsonSchema = Record<string, unknown>;

export interface StructuredRequest {
  /** Static instructions — identical across requests so the prefix caches. */
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: JsonSchema;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

/**
 * Calls Claude with a JSON-schema constrained output and returns the parsed
 * object. Refusals, truncation and malformed output become user-facing
 * errors rather than half-parsed data.
 */
export async function structuredCall(req: StructuredRequest): Promise<unknown> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: req.maxTokens ?? 16000,
      // Server-side fallback: if a safety classifier declines, the API re-runs
      // the request on Anthropic's recommended model for that category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
      output_config: {
        effort: req.effort ?? "medium",
        format: { type: "json_schema", schema: req.schema },
      },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError("The AI service is busy. Please try again in a minute.", 503);
    if (e instanceof Anthropic.BadRequestError) {
      console.error("Claude rejected the request:", e.message);
      throw new HttpError("The request could not be processed.", 400);
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`Claude API error ${e.status}:`, e.message);
      throw new HttpError("The AI service is temporarily unavailable.", 503);
    }
    throw e;
  }

  if (response.stop_reason === "refusal") {
    throw new HttpError("The coach can't help with that request.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError("The response was too long. Try a more specific question.", 422);
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    console.error("Unparseable structured output");
    throw new HttpError("The AI returned an unexpected response. Please try again.", 502);
  }
}
