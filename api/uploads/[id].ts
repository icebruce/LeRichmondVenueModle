import { idFrom, json, signedIn, signedInOrToken } from "../_lib/http.js";
import { getImage, putImage } from "../_lib/library.js";

/** A stored photo (ARCHITECTURE §6.3). Also readable with the requests token, for request photos. */
export function GET(request: Request): Promise<Response> {
  return signedInOrToken(request, async ({ store }) => {
    const image = await getImage(store, idFrom(request));
    if (!image) return json({ message: "Not found" }, 404);
    return new Response(new Uint8Array(image.bytes), {
      headers: { "Content-Type": image.type, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}

/** Stores a photo the app has already shrunk and stripped of location data. */
export function PUT(request: Request): Promise<Response> {
  return signedIn(request, async ({ store }) => {
    const type = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const error = await putImage(store, idFrom(request), type, await request.arrayBuffer());
    return error ? json({ message: error }, 400) : json({ ok: true }, 201);
  });
}
