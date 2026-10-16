import { json, signedIn, signedInOrToken } from "../_lib/http.js";
import { listRequests, saveRequest } from "../_lib/library.js";

/** Custom model requests (REQ-01..03): the couple and Claude's read-only token can read them. */
export function GET(request: Request): Promise<Response> {
  return signedInOrToken(request, async ({ store }) => {
    const status = new URL(request.url).searchParams.get("status");
    const all = await listRequests(store);
    return json({ requests: status ? all.filter((r) => r.status === status) : all });
  });
}

export function POST(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const r = await saveRequest(store, await request.json().catch(() => null));
    return typeof r === "string" ? json({ message: r }, 400) : json({ request: r }, 201);
  });
}
