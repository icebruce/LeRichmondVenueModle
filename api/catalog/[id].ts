import { idFrom, json, signedIn } from "../_lib/http.js";
import { setArchived } from "../_lib/library.js";

/** Removes an imported item from the library lists or puts it back: `{ archived, updatedAt }`. */
export function PATCH(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const body = (await request.json().catch(() => null)) as {
      archived?: unknown;
      updatedAt?: unknown;
    } | null;
    if (
      typeof body?.archived !== "boolean" ||
      typeof body.updatedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(body.updatedAt)
    )
      return json({ message: "Send { archived, updatedAt }" }, 400);
    const item = await setArchived(store, idFrom(request), body.archived, body.updatedAt);
    return item ? json({ item }) : json({ message: "Not found" }, 404);
  });
}
