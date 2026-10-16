import { json, signedIn } from "../../_lib/http.js";
import { idFrom, restore, versions } from "../../_lib/scenarios.js";

/** Version history (SCN-04): newest first, without the bodies. */
export function GET(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) =>
    json({
      versions: (await versions(store, idFrom(request))).map((v) => ({
        revision: v.revision,
        updatedAt: v.updatedAt,
        updatedBy: v.updatedBy,
        name: v.name,
      })),
    }),
  );
}

/** Restore `{ revision }` as the newest revision. */
export function POST(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const revision = Number(((await request.json().catch(() => ({}))) as { revision?: unknown }).revision);
    const saved = await restore(store, idFrom(request), revision);
    return saved ? json({ scenario: saved }) : json({ message: "That version is no longer available" }, 404);
  });
}
