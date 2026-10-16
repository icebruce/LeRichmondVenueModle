/// <reference types="vitest/config" />
import { type Connect, type Plugin, defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Local runs of the `api/` functions (Vercel serves them in production). Only when RS_DEV_API=1,
 * for the cloud browser tests and trying sign-in locally; plain `npm run dev` stays local-only.
 */
function devApi(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    void (async () => {
      const { route } = await import("./api/_lib/router.js");
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const response = await route(
        new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }),
      );
      res.statusCode = response.status;
      response.headers.forEach((v, k) => k !== "set-cookie" && res.setHeader(k, v));
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch((e: unknown) => {
      console.error(e);
      res.statusCode = 500;
      res.end();
    });
  };
  return {
    name: "richmond-dev-api",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  plugins: [react(), ...(process.env.RS_DEV_API === "1" ? [devApi()] : [])],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("node_modules/three") ? "three" : undefined),
      },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
