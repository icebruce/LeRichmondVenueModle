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
    "src/scene may import only domain (ARCHITECTURE §3).",
  ),
  layer(
    ["src/ui/**"],
    ["**/data/**", "**/app/**"],
    "src/ui may import domain and scene only (ARCHITECTURE §3).",
  ),
  layer(
    ["src/data/**"],
    ["**/scene/**", "**/ui/**", "**/app/**", "react", "three"],
    "src/data may import only domain (ARCHITECTURE §3).",
  ),
);
