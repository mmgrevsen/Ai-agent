// Food search across Open Food Facts (packaged products, community data) and
// USDA FoodData Central (generic foods, laboratory reference data). The USDA
// key stays here; the app never sees it.
import { requireUser } from "../_shared/auth.ts";
import { mergeResults, type NormalizedFood, offBarcode, offSearch, usdaSearch } from "../_shared/food_sources.ts";
import { error, handler, HttpError, json, readJson } from "../_shared/http.ts";

Deno.serve(handler(async (req) => {
  await requireUser(req);
  const body = await readJson(req, 4_000);

  if (typeof body.barcode === "string") {
    const code = body.barcode.replace(/\D/g, "");
    if (code.length < 6 || code.length > 14) throw new HttpError("Invalid barcode.", 400);
    try {
      return json({ food: await offBarcode(code) });
    } catch (e) {
      console.error(e);
      return error("The food database is temporarily unavailable.", 503);
    }
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2 || query.length > 100) throw new HttpError("Enter 2–100 characters.", 400);
  const page = typeof body.page === "number" && body.page >= 1 && body.page <= 20 ? Math.floor(body.page) : 1;
  const usdaKey = Deno.env.get("FDC_API_KEY");

  const [off, usda] = await Promise.allSettled([
    offSearch(query, page),
    usdaKey && page === 1 ? usdaSearch(query, usdaKey) : Promise.resolve([] as NormalizedFood[]),
  ]);
  if (off.status === "rejected" && usda.status === "rejected") {
    console.error(off.reason, usda.reason);
    return error("The food databases are temporarily unavailable.", 503);
  }
  const foods = mergeResults(usda.status === "fulfilled" ? usda.value : [], off.status === "fulfilled" ? off.value : []);
  return json({ foods, partial: off.status === "rejected" || usda.status === "rejected" });
}));
