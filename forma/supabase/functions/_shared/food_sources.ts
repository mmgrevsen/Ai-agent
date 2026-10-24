// Food database clients. Output is the normalised shape the app parses
// (`foodFromJson` in app/lib/data/remote/food_api.dart). Missing nutrients
// stay null — never 0.

export interface Per100g {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export interface NormalizedFood {
  name: string;
  brand: string | null;
  source: "off" | "usda";
  sourceRef: string | null;
  provenance: "verified" | "community";
  per100g: Per100g;
  servings: { label: string; grams: number }[];
}

const n = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const x = Number(v.replace(",", "."));
    return Number.isFinite(x) ? x : null;
  }
  return null;
};

// ------------------------------------------------------------------ Open Food Facts

export const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,nutrition_data_per";

export function normalizeOff(p: Record<string, unknown>): NormalizedFood | null {
  const name = [p.product_name, p.product_name_en, p.generic_name]
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")[0]?.trim();
  if (!name) return null;
  const nut = (p.nutriments ?? {}) as Record<string, unknown>;
  let kcal = n(nut["energy-kcal_100g"]);
  const kj = n(nut["energy-kj_100g"]) ?? n(nut["energy_100g"]);
  if (kcal === null && kj !== null) kcal = kj / 4.184; // unit conversion, not estimation
  const per100g: Per100g = {
    kcal,
    protein: n(nut["proteins_100g"]),
    carbs: n(nut["carbohydrates_100g"]),
    fat: n(nut["fat_100g"]),
    fiber: n(nut["fiber_100g"]),
  };
  if (per100g.kcal === null && per100g.protein === null && per100g.carbs === null && per100g.fat === null) return null;
  const perMl = typeof p.nutrition_data_per === "string" && p.nutrition_data_per.includes("ml");
  const servingQty = n(p.serving_quantity);
  const servingLabel = typeof p.serving_size === "string" ? p.serving_size.trim() : "";
  const brand = typeof p.brands === "string" ? p.brands.split(",")[0].trim() : "";
  return {
    name,
    brand: brand || null,
    source: "off",
    sourceRef: typeof p.code === "string" ? p.code : null,
    provenance: "community",
    per100g,
    servings: [
      ...(servingQty !== null && servingQty > 0 && servingQty < 5000 ? [{ label: servingLabel || "1 serving", grams: servingQty }] : []),
      { label: perMl ? "100 ml" : "100 g", grams: 100 },
    ],
  };
}

function offHeaders(): HeadersInit {
  return { "User-Agent": Deno.env.get("OFF_USER_AGENT") ?? "Forma/1.0 (server)", Accept: "application/json" };
}

export async function offSearch(query: string, page: number): Promise<NormalizedFood[]> {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.search = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page: String(page),
    page_size: "20",
    fields: OFF_FIELDS,
  }).toString();
  const res = await fetch(url, { headers: offHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`OFF search ${res.status}`);
  const body = await res.json() as { products?: Record<string, unknown>[] };
  return (body.products ?? []).map(normalizeOff).filter((f): f is NormalizedFood => f !== null);
}

export async function offBarcode(code: string): Promise<NormalizedFood | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${OFF_FIELDS}`, {
    headers: offHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OFF product ${res.status}`);
  const body = await res.json() as { status?: number; product?: Record<string, unknown> };
  if (body.status !== 1 || !body.product) return null;
  return normalizeOff({ code, ...body.product });
}

// ------------------------------------------------------------------ USDA FoodData Central

// Nutrient numbers (legacy SR codes) — stable across FDC data types.
const USDA = { kcal: ["208"], kcalAtwater: ["958", "957"], protein: ["203"], carbs: ["205"], fat: ["204"], fiber: ["291"] };

interface FdcNutrient {
  nutrientNumber?: string;
  value?: number;
  unitName?: string;
}

/**
 * Normalises a FoodData Central search hit. Foundation and SR Legacy foods
 * are laboratory reference data per 100 g → provenance "verified".
 */
export function normalizeUsda(f: Record<string, unknown>): NormalizedFood | null {
  const name = typeof f.description === "string" ? f.description.trim() : "";
  if (!name) return null;
  const nutrients = (Array.isArray(f.foodNutrients) ? f.foodNutrients : []) as FdcNutrient[];
  const pick = (codes: string[]) => {
    for (const c of codes) {
      const hit = nutrients.find((x) => x.nutrientNumber === c && typeof x.value === "number");
      if (hit) return hit.unitName?.toUpperCase() === "KJ" ? hit.value! / 4.184 : hit.value!;
    }
    return null;
  };
  const per100g: Per100g = {
    kcal: pick(USDA.kcal) ?? pick(USDA.kcalAtwater),
    protein: pick(USDA.protein),
    carbs: pick(USDA.carbs),
    fat: pick(USDA.fat),
    fiber: pick(USDA.fiber),
  };
  if (per100g.kcal === null && per100g.protein === null) return null;
  return {
    name: name.charAt(0) + name.slice(1).toLowerCase(),
    brand: null,
    source: "usda",
    sourceRef: f.fdcId != null ? String(f.fdcId) : null,
    provenance: "verified",
    per100g,
    servings: [{ label: "100 g", grams: 100 }],
  };
}

export async function usdaSearch(query: string, apiKey: string): Promise<NormalizedFood[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.search = new URLSearchParams({ query, dataType: "Foundation,SR Legacy", pageSize: "10", api_key: apiKey }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`USDA search ${res.status}`);
  const body = await res.json() as { foods?: Record<string, unknown>[] };
  return (body.foods ?? []).map(normalizeUsda).filter((f): f is NormalizedFood => f !== null);
}

/** Verified generic foods first, then packaged products; de-duplicated by name. */
export function mergeResults(usda: NormalizedFood[], off: NormalizedFood[]): NormalizedFood[] {
  const seen = new Set<string>();
  const out: NormalizedFood[] = [];
  for (const f of [...usda.slice(0, 6), ...off]) {
    const key = `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
