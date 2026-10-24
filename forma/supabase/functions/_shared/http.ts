// Shared HTTP helpers for Edge Functions.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Error response with a message that is safe to show to end users. */
export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Reads a JSON body, rejecting oversized payloads before parsing. */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new HttpError("Request is too large.", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError("Request is too large.", 413);
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError("Invalid JSON body.", 400);
  }
}

/** Wraps a handler with CORS, method checks and uniform error handling. */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return error("Method not allowed.", 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status);
      console.error(e);
      return error("Something went wrong on the server.", 500);
    }
  };
}
