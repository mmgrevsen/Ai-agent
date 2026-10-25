import { assert, assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { HttpError } from "./http.ts";
import { isValidGtin, normalizeLabelReply, normalizePhotoReply, parsePhotoInput, parseScaleDisplay } from "./photo_contract.ts";

const item = (over: Record<string, unknown> = {}) => ({
  name: "Rice",
  grams: 200,
  gramsLow: 150,
  gramsHigh: 260,
  kcal: 260,
  protein: 5,
  carbs: 56,
  fat: 1,
  fiber: 1,
  confidence: "medium",
  notes: null,
  onScale: false,
  ...over,
});
const noScale = { visible: false, displayText: null, grams: null, includesContainer: "unknown" };

Deno.test("photo mode defaults to meal and rejects unknown modes", () => {
  assertEquals(parsePhotoInput({ image: "aGVsbG8=", mimeType: "image/jpeg" }).mode, "meal");
  assertEquals(parsePhotoInput({ image: "aGVsbG8=", mimeType: "image/jpeg", mode: "label" }).mode, "label");
  assertThrows(() => parsePhotoInput({ image: "aGVsbG8=", mimeType: "image/jpeg", mode: "receipt" }), HttpError);
});

Deno.test("scale display parsing handles units, decimal commas and junk", () => {
  assertEquals(parseScaleDisplay("245 g"), 245);
  assertEquals(parseScaleDisplay("245g"), 245);
  assertEquals(parseScaleDisplay("0,31 kg"), 310);
  assertEquals(parseScaleDisplay("1.250 kg"), 1250);
  assertEquals(parseScaleDisplay("8.6 oz"), 243.8);
  assertEquals(parseScaleDisplay("1 lb 2 oz"), 510.3);
  assertEquals(parseScaleDisplay("250 ml"), 250);
  assertEquals(parseScaleDisplay("TARE"), null);
  assertEquals(parseScaleDisplay("0 g"), null);
  assertEquals(parseScaleDisplay("-12 g"), null);
  assertEquals(parseScaleDisplay("245"), null); // no unit: not trusted
  assertEquals(parseScaleDisplay("12 g 30 g"), null);
  assertEquals(parseScaleDisplay(null), null);
  assertEquals(parseScaleDisplay("25 kg"), null); // beyond a kitchen scale
});

Deno.test("without a scale the model's estimate is returned unchanged", () => {
  const r = normalizePhotoReply({ items: [item()], scale: noScale, caveats: [] });
  assertEquals(r.items[0].grams, 200);
  assertEquals(r.items[0].weighed, false);
  assertEquals(r.scale, { grams: null, applied: false });
  assert(!("onScale" in r.items[0]));
});

Deno.test("older replies without a scale field still work", () => {
  const r = normalizePhotoReply({ items: [item()], caveats: ["x"] });
  assertEquals(r.items.length, 1);
  assertEquals(r.scale.applied, false);
});

Deno.test("one food on the scale takes the scale's weight and nutrients scale with it", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: true, confidence: "low" })],
    scale: { visible: true, displayText: "245 g", grams: 245, includesContainer: "no" },
    caveats: [],
  });
  const rice = r.items[0];
  assertEquals(rice.grams, 245);
  assertEquals(rice.weighed, true);
  assertEquals(rice.gramsLow, 240.1); // ±2 % scale tolerance
  assertEquals(rice.gramsHigh, 249.9);
  assertEquals(rice.kcal, 318.5); // 260 × 245/200
  assertEquals(rice.carbs, 68.6);
  assertEquals(rice.confidence, "medium"); // the portion is now known
  assertEquals(r.scale, { grams: 245, applied: true });
});

Deno.test("display text wins when the model converts units wrongly", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: true })],
    scale: { visible: true, displayText: "0.3 kg", grams: 0.3, includesContainer: "no" },
    caveats: [],
  });
  assertEquals(r.items[0].grams, 300);
});

Deno.test("the model's grams are used when the display text can't be parsed", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: true })],
    scale: { visible: true, displayText: "2 4 5", grams: 245, includesContainer: "no" },
    caveats: [],
  });
  assertEquals(r.items[0].grams, 245);
});

Deno.test("a single food is assumed to be the one on the scale", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: false })],
    scale: { visible: true, displayText: "180 g", grams: 180, includesContainer: "no" },
    caveats: [],
  });
  assertEquals(r.items[0].grams, 180);
  assertEquals(r.items[0].weighed, true);
});

Deno.test("several foods on the scale share the reading in their estimated proportions", () => {
  const r = normalizePhotoReply({
    items: [
      item({ name: "Rice", grams: 150, kcal: 195, onScale: true }),
      item({ name: "Chicken", grams: 100, kcal: 165, onScale: true }),
      item({ name: "Apple (beside the scale)", grams: 180, kcal: 94, onScale: false }),
    ],
    scale: { visible: true, displayText: "300 g", grams: 300, includesContainer: "no" },
    caveats: [],
  });
  const [rice, chicken, apple] = r.items;
  assertAlmostEquals(rice.grams + chicken.grams, 300, 0.11);
  assertEquals(rice.grams, 180);
  assertEquals(chicken.grams, 120);
  assertEquals(chicken.kcal, 198);
  assertEquals(rice.gramsLow, 153); // the split is still an estimate (±15 %)
  assertEquals(apple.grams, 180);
  assertEquals(apple.weighed, false);
});

Deno.test("a reading that includes the plate is not applied", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: true })],
    scale: { visible: true, displayText: "612 g", grams: 612, includesContainer: "yes" },
    caveats: [],
  });
  assertEquals(r.items[0].grams, 200);
  assertEquals(r.scale, { grams: 612, applied: false });
  assert(r.caveats.some((c) => c.includes("tare")));
});

Deno.test("an unknown container is applied with a reminder to tare", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: true })],
    scale: { visible: true, displayText: "210 g", grams: 210, includesContainer: "unknown" },
    caveats: [],
  });
  assertEquals(r.items[0].grams, 210);
  assert(r.caveats.some((c) => c.includes("zeroed")));
});

Deno.test("several foods and no marking: the reading is not guessed onto one", () => {
  const r = normalizePhotoReply({
    items: [item({ name: "A" }), item({ name: "B" })],
    scale: { visible: true, displayText: "300 g", grams: 300, includesContainer: "no" },
    caveats: [],
  });
  assertEquals(r.items.map((i) => i.grams), [200, 200]);
  assertEquals(r.scale.applied, false);
});

Deno.test("an unreadable or invisible scale is ignored", () => {
  for (const scale of [
    { visible: true, displayText: "--", grams: null, includesContainer: "no" },
    { visible: false, displayText: "245 g", grams: 245, includesContainer: "no" },
    { visible: true, displayText: null, grams: -5, includesContainer: "no" },
  ]) {
    const r = normalizePhotoReply({ items: [item({ onScale: true })], scale, caveats: [] });
    assertEquals(r.items[0].grams, 200);
    assertEquals(r.scale.applied, false);
  }
});

Deno.test("unknown nutrients stay unknown after scaling", () => {
  const r = normalizePhotoReply({
    items: [item({ onScale: true, fiber: null, kcal: null })],
    scale: { visible: true, displayText: "100 g", grams: 100, includesContainer: "no" },
    caveats: [],
  });
  assertEquals(r.items[0].fiber, null);
  assertEquals(r.items[0].kcal, null);
  assertEquals(r.items[0].protein, 2.5);
});

Deno.test("GTIN check digits", () => {
  assert(isValidGtin("5701234567899")); // EAN-13
  assert(isValidGtin("4006381333931"));
  assert(isValidGtin("96385074")); // EAN-8
  assert(isValidGtin("036000291452")); // UPC-A
  assert(!isValidGtin("5701234567890"));
  assert(!isValidGtin("12345"));
  assert(!isValidGtin("57012345678a9"));
});

Deno.test("label reading keeps printed values and drops impossible ones", () => {
  const r = normalizeLabelReply({
    name: " Skyr naturel ",
    brand: "Arla",
    basis: "per100g",
    servingGrams: 150,
    servingLabel: "1 bæger",
    kcal: 63,
    protein: 11,
    carbs: 4,
    fat: 0.2,
    fiber: null,
    barcode: "5701234567899",
    caveats: [],
  });
  assertEquals(r.name, "Skyr naturel");
  assertEquals(r.per100g, { kcal: 63, protein: 11, carbs: 4, fat: 0.2, fiber: null });
  assertEquals(r.serving, { label: "1 bæger", grams: 150 });
  assertEquals(r.barcode, "5701234567899");
  assertEquals(r.warnings, []);
});

Deno.test("label reading flags inconsistent energy and impossible macros", () => {
  const r = normalizeLabelReply({
    name: "Bar", brand: null, basis: "per100g", servingGrams: null, servingLabel: null,
    kcal: 150, protein: 30, carbs: 60, fat: 20, fiber: 5, barcode: "123", caveats: [],
  });
  assertEquals(r.warnings.length, 2);
  assertEquals(r.barcode, null); // invalid checksum/length
  assertEquals(r.serving, null);
  const bad = normalizeLabelReply({ kcal: 2000, protein: 120, carbs: -1, fat: "5", fiber: null, caveats: "x" });
  assertEquals(bad.per100g, { kcal: null, protein: null, carbs: null, fat: null, fiber: null });
  assertEquals(bad.caveats, []);
  assertThrows(() => normalizeLabelReply(null), HttpError);
});

Deno.test("label reading strips spaces from a printed barcode", () => {
  assertEquals(normalizeLabelReply({ barcode: "5 701234 567899", caveats: [] }).barcode, "5701234567899");
});
