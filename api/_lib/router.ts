import * as login from "../login.js";
import * as logout from "../logout.js";
import * as session from "../session.js";
import * as scenarios from "../scenarios/index.js";
import * as scenario from "../scenarios/[id]/index.js";
import * as versions from "../scenarios/[id]/versions.js";
import * as catalog from "../catalog/index.js";
import * as catalogItem from "../catalog/[id].js";
import * as upload from "../uploads/[id].js";
import * as requests from "../library-requests/index.js";

type Handler = (request: Request) => Promise<Response> | Response;
type Module = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

/** The same routes Vercel serves from `api/` by file name, for local runs and tests. */
const routes: [RegExp, Module][] = [
  [/^\/api\/login$/, login],
  [/^\/api\/logout$/, logout],
  [/^\/api\/session$/, session],
  [/^\/api\/scenarios$/, scenarios],
  [/^\/api\/scenarios\/[^/]+$/, scenario],
  [/^\/api\/scenarios\/[^/]+\/versions$/, versions],
  [/^\/api\/catalog$/, catalog],
  [/^\/api\/catalog\/[^/]+$/, catalogItem],
  [/^\/api\/uploads\/[^/]+$/, upload],
  [/^\/api\/library-requests$/, requests],
];

export async function route(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const mod = routes.find(([re]) => re.test(path))?.[1];
  if (!mod) return new Response("Not found", { status: 404 });
  const handler = mod[request.method as keyof Module];
  if (!handler) return new Response("Method not allowed", { status: 405 });
  return handler(request);
}
