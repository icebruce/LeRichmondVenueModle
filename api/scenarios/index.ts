import { json, signedIn } from "../_lib/http.js";
import { create, list, parseBody } from "../_lib/scenarios.js";

export function GET(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => json({ scenarios: await list(store) }));
}

export function POST(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const scenario = parseBody(await request.json().catch(() => null));
    if (typeof scenario === "string") return json({ message: scenario }, 400);
    const saved = await create(store, scenario);
    return saved ? json({ scenario: saved }, 201) : json({ message: "That scenario already exists" }, 409);
  });
}
