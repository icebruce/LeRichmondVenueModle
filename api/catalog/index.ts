import { json, signedIn } from "../_lib/http.js";
import { createImport, listImports } from "../_lib/library.js";

/** Items the couple imported from photos (IMP-06), shared by both partners. */
export function GET(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => json({ items: await listImports(store) }));
}

export function POST(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const r = await createImport(store, await request.json().catch(() => null));
    return typeof r === "string" ? json({ message: r }, 400) : json({ item: r }, 201);
  });
}
