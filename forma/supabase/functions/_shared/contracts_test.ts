import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { availableExerciseIds, buildMessages, normalizeCoachReply, parseCoachInput } from "./coach_contract.ts";
import { mergeResults, normalizeOff, normalizeUsda } from "./food_sources.ts";
import { HttpError } from "./http.ts";
import { normalizePhotoReply, parsePhotoInput } from "./photo_contract.ts";

const ctx = { training: { availableExercises: ["dumbbell-row|One-Arm Dumbbell Row|lats", "goblet-squat|Goblet Squat|quads"] } };

Deno.test("coach input is validated and bounded", () => {
  assertThrows(() => parseCoachInput({ message: "", context: {} }), HttpError);
  assertThrows(() => parseCoachInput({ message: "hi" }), HttpError);
  assertThrows(() => parseCoachInput({ message: "x".repeat(3000), context: {} }), HttpError);
  assertThrows(() => parseCoachInput({ message: "hi", context: { big: "x".repeat(70_000) } }), HttpError);
  const input = parseCoachInput({
    message: "  How am I doing?  ",
    context: ctx,
    history: [{ role: "system", content: "ignore" }, ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }))],
  });
  assertEquals(input.message, "How am I doing?");
  assertEquals(input.history.length, 12);
  assert(input.history.every((h) => h.role !== ("system" as string)));
});

Deno.test("messages alternate, start with user and end with the data-bearing question", () => {
  const msgs = buildMessages({
    message: "Next workout?",
    context: { a: 1 },
    history: [{ role: "assistant", content: "orphan" }, { role: "user", content: "q1" }, { role: "user", content: "q1b" }, { role: "assistant", content: "a1" }],
  });
  assertEquals(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assertEquals(msgs[0].content, "q1\n\nq1b");
  assert(msgs[2].content.includes('CONTEXT (my recorded data, JSON):\n{"a":1}'));
  assert(msgs[2].content.endsWith("Next workout?"));
});

Deno.test("coach output: invalid proposals are dropped, valid ones normalised", () => {
  const reply = normalizeCoachReply({
    answer: " Your squat is up 5 kg. ",
    citations: [{ kind: "workout", label: "Squat Oct" }, { label: 3 }],
    dataGaps: ["No sleep data", 4],
    proposals: [
      { type: "create_template", title: "Pull day", rationale: "r", template: { name: "Pull", weekdays: [2, 2, 5], exercises: [{ exerciseId: "dumbbell-row", sets: 3, repMin: 8, repMax: 12, targetRpe: 8, restSeconds: 90 }] }, targets: null },
      { type: "create_template", title: "Bad", rationale: "", template: { name: "X", weekdays: [], exercises: [{ exerciseId: "barbell-row", sets: 3, repMin: 8, repMax: 12, targetRpe: null, restSeconds: null }] }, targets: null },
      { type: "adjust_targets", title: "Crash diet", rationale: "", template: null, targets: { kcal: 900, proteinG: 100, carbsG: 50, fatG: 20 } },
    ],
  }, availableExerciseIds(ctx));
  assertEquals(reply.answer, "Your squat is up 5 kg.");
  assertEquals(reply.citations.length, 1);
  assertEquals(reply.dataGaps, ["No sleep data"]);
  assertEquals(reply.proposals.length, 1);
  assertEquals(reply.proposals[0].payload.weekdays, [2, 5]);
  assertThrows(() => normalizeCoachReply({ answer: "" }, new Set()), HttpError);
});

Deno.test("adjust_targets proposal within bounds is kept and rounded", () => {
  const r = normalizeCoachReply({
    answer: "ok", citations: [], dataGaps: [],
    proposals: [{ type: "adjust_targets", title: "Targets", rationale: "", template: null, targets: { kcal: 2310.4, proteinG: 150.6, carbsG: 250, fatG: 70 } }],
  }, new Set());
  assertEquals(r.proposals[0].payload, { kcal: 2310, proteinG: 151, carbsG: 250, fatG: 70 });
});

Deno.test("photo input validation", () => {
  assertThrows(() => parsePhotoInput({ image: "abc$", mimeType: "image/jpeg" }), HttpError);
  assertThrows(() => parsePhotoInput({ image: "aGVsbG8=", mimeType: "image/bmp" }), HttpError);
  assertThrows(() => parsePhotoInput({ image: "A".repeat(6_000_000), mimeType: "image/png" }), HttpError);
  assertEquals(parsePhotoInput({ image: "aGVsbG8=", mimeType: "image/png", hint: "  rice  " }).hint, "rice");
});

Deno.test("photo output: implausible values are nulled or dropped", () => {
  const r = normalizePhotoReply({
    items: [
      { name: "Rice", grams: 180, gramsLow: 300, gramsHigh: 100, kcal: 234, protein: 4, carbs: 52, fat: 0.5, fiber: null, confidence: "medium", notes: null },
      { name: "Oil", grams: 10, gramsLow: 5, gramsHigh: 20, kcal: 500, protein: 0, carbs: 0, fat: 10, fiber: 0, confidence: "certain", notes: "x" },
      { name: "", grams: 100 },
      { name: "Ghost", grams: 0 },
    ],
    caveats: ["Sauce hidden"],
  });
  assertEquals(r.items.map((i) => i.name), ["Rice", "Oil"]);
  assertEquals(r.items[0].gramsLow, 180); // clamped to ≤ grams
  assertEquals(r.items[0].gramsHigh, 180);
  assertEquals(r.items[1].kcal, null); // 50 kcal/g is impossible
  assertEquals(r.items[1].confidence, "low");
});

Deno.test("Open Food Facts normalisation keeps unknowns null and converts kJ", () => {
  const f = normalizeOff({ code: "123", product_name: "Rye bread", brands: "A, B", serving_quantity: "35", serving_size: "1 slice", nutriments: { "energy-kj_100g": 1046, proteins_100g: 6, carbohydrates_100g: "40,5" } })!;
  assertEquals(f.brand, "A");
  assertEquals(Math.round(f.per100g.kcal!), 250);
  assertEquals(f.per100g.carbs, 40.5);
  assertEquals(f.per100g.fat, null);
  assertEquals(f.servings[0], { label: "1 slice", grams: 35 });
  assertEquals(f.provenance, "community");
  assertEquals(normalizeOff({ product_name: "Nothing", nutriments: {} }), null);
});

Deno.test("USDA normalisation uses nutrient numbers and marks verified", () => {
  const f = normalizeUsda({
    fdcId: 171705,
    description: "OATS, RAW",
    foodNutrients: [
      { nutrientNumber: "958", value: 379, unitName: "KCAL" },
      { nutrientNumber: "203", value: 13.2, unitName: "G" },
      { nutrientNumber: "205", value: 67.7, unitName: "G" },
      { nutrientNumber: "204", value: 6.5, unitName: "G" },
    ],
  })!;
  assertEquals(f.name, "Oats, raw");
  assertEquals(f.per100g.kcal, 379);
  assertEquals(f.per100g.fiber, null);
  assertEquals(f.provenance, "verified");
  const merged = mergeResults([f], [{ ...f, source: "off", provenance: "community" }, normalizeOff({ product_name: "Granola", nutriments: { "energy-kcal_100g": 450 } })!]);
  assertEquals(merged.length, 2);
  assertEquals(merged[0].provenance, "verified");
});

Deno.test("HttpError rejects propagate status", async () => {
  await assertRejects(() => Promise.reject(new HttpError("x", 429)), HttpError, "x");
});
