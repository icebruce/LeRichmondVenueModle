import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Layer rules: docs/ARCHITECTURE.md §3
const layer = (files, banned, message) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: banned.map((group) => ({ group: [group], message })) }],
  },
});

export default tseslint.config(
  { ignores: ["dist", "node_modules", "docs", "playwright-report", "test-results", "public"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // three.js objects are mutable by design (instanced matrices, materials); allow in-place updates.
    files: ["src/scene/**"],
    rules: { "react-hooks/immutability": "off" },
  },
  layer(
    ["src/domain/**"],
    [
      "**/state/**",
      "**/scene/**",
      "**/ui/**",
      "**/data/**",
      "**/app/**",
      "react",
      "react-dom",
      "three",
      "@react-three/*",
      "zustand",
      "zustand/*",
      "immer",
      "idb-keyval",
    ],
    "src/domain must stay pure (ARCHITECTURE §3).",
  ),
  layer(
    ["src/state/**"],
    ["**/scene/**", "**/ui/**", "**/data/**", "**/app/**", "react", "react-dom", "three", "@react-three/*"],
    "src/state may import only domain (ARCHITECTURE §3).",
  ),
  layer(
    ["src/scene/**"],
    ["**/ui/**", "**/data/**", "**/app/**"],
    "src/scene may import only domain and state (ARCHITECTURE §3).",
  ),
  layer(
    ["src/ui/**"],
    ["**/data/**", "**/app/**", "**/scene/cameras*", "**/scene/items/*", "**/scene/venue/*"],
    "src/ui may import domain, state and scene components only (ARCHITECTURE §3).",
  ),
  layer(
    ["src/data/**"],
    ["**/scene/**", "**/ui/**", "**/app/**", "react", "three"],
    "src/data may import only domain (ARCHITECTURE §3).",
  ),
  {
    files: ["api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(/src/(?!domain/[\\w-]+/schema)|^(react|three|zustand|idb-keyval)(/|$))",
              message: "api/ may import only the shared domain schemas (ARCHITECTURE §3).",
            },
          ],
        },
      ],
    },
  },
);
