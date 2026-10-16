import { idFrom, json, signedIn } from "../_lib/http.js";
import { archiveImport } from "../_lib/library.js";

/** Removes an imported item from the library lists (`{ archived: true }`); nothing else changes. */
export function PATCH(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
    if (body?.archived !== true) return json({ message: "Only removing an item is supported" }, 400);
    const item = await archiveImport(store, idFrom(request));
    return item ? json({ item }) : json({ message: "Not found" }, 404);
  });
}
