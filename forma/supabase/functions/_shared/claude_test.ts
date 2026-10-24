import { assert, assertEquals, assertRejects } from "@std/assert";
import { HttpError } from "./http.ts";

// Points the SDK at a local mock of the Messages API to verify the request
// shape and response handling without network access.
let lastBody: Record<string, unknown> = {};
let lastHeaders: Headers = new Headers();
let nextResponse: Record<string, unknown> = {};
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (req) => {
  lastHeaders = req.headers;
  lastBody = await req.json();
  return Response.json(nextResponse);
});
Deno.env.set("ANTHROPIC_BASE_URL", `http://127.0.0.1:${server.addr.port}`);
Deno.env.set("ANTHROPIC_API_KEY", "test-key");
const { structuredCall, MODEL } = await import("./claude.ts");

function message(stop: string, text: string) {
  return {
    id: "msg_1", type: "message", role: "assistant", model: MODEL, stop_reason: stop, stop_sequence: null,
    content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

Deno.test("structured call sends model, fallback, cached system prompt and schema", async () => {
  nextResponse = message("end_turn", '{"answer":"ok"}');
  const out = await structuredCall({ system: "SYS", schema: { type: "object" }, messages: [{ role: "user", content: "hi" }] });
  assertEquals(out, { answer: "ok" });
  assertEquals(lastBody.model, "claude-opus-5-5");
  assertEquals(lastBody.fallbacks, "default");
  assert(lastHeaders.get("anthropic-beta")?.includes("server-side-fallback-2026-07-01"));
  assertEquals(lastBody.system, [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }]);
  assertEquals(lastBody.output_config, { effort: "medium", format: { type: "json_schema", schema: { type: "object" } } });
  assertEquals(lastBody.thinking, undefined);
});

Deno.test("refusal and truncation become user-facing errors", async () => {
  nextResponse = message("refusal", "");
  await assertRejects(() => structuredCall({ system: "S", schema: {}, messages: [{ role: "user", content: "x" }] }), HttpError, "can't help");
  nextResponse = message("max_tokens", '{"answer":"tru');
  await assertRejects(() => structuredCall({ system: "S", schema: {}, messages: [{ role: "user", content: "x" }] }), HttpError, "too long");
  nextResponse = message("end_turn", "not json");
  await assertRejects(() => structuredCall({ system: "S", schema: {}, messages: [{ role: "user", content: "x" }] }), HttpError, "unexpected");
});

Deno.test({ name: "shutdown mock", fn: async () => await server.shutdown(), sanitizeOps: false, sanitizeResources: false });
