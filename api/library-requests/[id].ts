import { idFrom, json, signedIn } from "../_lib/http.js";
import { saveRequest } from "../_lib/library.js";

/** A changed request (status, notes, photos); the later change wins. */
export function PATCH(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const body = (await request.json().catch(() => null)) as { request?: { id?: unknown } } | null;
    if (body?.request?.id !== idFrom(request)) return json({ message: "Request id mismatch" }, 400);
    const r = await saveRequest(store, body);
    return typeof r === "string" ? json({ message: r }, 400) : json({ request: r });
  });
}
