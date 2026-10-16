import { json, signedIn } from "../../_lib/http.js";
import { idFrom, parseBody, read, remove, update } from "../../_lib/scenarios.js";

export function GET(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const s = await read(store, idFrom(request));
    return s ? json({ scenario: s }) : json({ message: "Not found" }, 404);
  });
}

/** Save over revision `If-Match`; 409 with the server copy when the partner saved first (SCN-03). */
export function PUT(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const ifMatch = Number(request.headers.get("if-match"));
    if (!Number.isInteger(ifMatch)) return json({ message: "Missing If-Match revision" }, 428);
    const scenario = parseBody(await request.json().catch(() => null));
    if (typeof scenario === "string") return json({ message: scenario }, 400);
    const r = await update(store, idFrom(request), ifMatch, scenario);
    if (r.ok) return json({ scenario: r.saved });
    return r.current ? json({ scenario: r.current }, 409) : json({ message: "Not found" }, 404);
  });
}

/** Delete revision `If-Match`; 409 with the server copy when the partner saved since. */
export function DELETE(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const ifMatch = Number(request.headers.get("if-match"));
    if (!Number.isInteger(ifMatch)) return json({ message: "Missing If-Match revision" }, 428);
    const r = await remove(store, idFrom(request), ifMatch);
    return r.ok ? json({ ok: true }) : json({ scenario: r.current }, 409);
  });
}
