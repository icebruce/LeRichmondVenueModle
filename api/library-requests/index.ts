import { json, signedIn, signedInOrToken } from "../_lib/http.js";
import { listRequests, saveRequest } from "../_lib/library.js";

/** Custom model requests (REQ-01..03): the couple and Claude's read-only token can read them. */
export function GET(request: Request): Promise<Response> {
  return signedInOrToken(request, async ({ store }) => json({ requests: await listRequests(store) }));
}

export function POST(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const r = await saveRequest(store, await request.json().catch(() => null));
    return typeof r === "string" ? json({ message: r }, 400) : json({ request: r }, 201);
  });
}
