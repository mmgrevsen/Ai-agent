// Permanently deletes the caller's account. All user tables reference
// auth.users with ON DELETE CASCADE, so this removes every synced row.
import { adminClient, requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";

Deno.serve(handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson(req, 1_000);
  if (body.confirm !== true) throw new HttpError("Confirmation required.", 400);
  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("delete user failed", error.message);
    throw new HttpError("Your account could not be deleted. Please try again or contact support.", 500);
  }
  return json({ deleted: true });
}));
